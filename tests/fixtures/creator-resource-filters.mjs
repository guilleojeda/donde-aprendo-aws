import assert from 'node:assert/strict';
import { createServer as createHttpsServer } from 'node:https';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test as base, expect } from '@playwright/test';
import { createSubmissionHandler, MAX_SUBMISSION_BODY_BYTES } from '../../src/api/submission.mjs';
import { createDynamoCatalogAccess } from '../../src/lib/catalog-resource-writer.mjs';
import { currentUrlKey, currentUrlReservation } from '../../src/lib/catalog-url.mjs';
import { startCreatorBrowserApp } from './creator-browser-app.mjs';
import { createDynamoMoveStore } from './creator-link-move.mjs';

const execFileAsync = promisify(execFile);
const LOOPBACK = '127.0.0.1';
async function unusedPort() {
  const server = createHttpsServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK, resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object' && address.port > 0);
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function readRequestBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes <= MAX_SUBMISSION_BODY_BYTES) chunks.push(chunk);
  }
  return bytes <= MAX_SUBMISSION_BODY_BYTES
    ? Buffer.concat(chunks).toString('utf8')
    : 'x'.repeat(MAX_SUBMISSION_BODY_BYTES + 1);
}

function corsHeaders(origin, expectedOrigin) {
  if (origin !== expectedOrigin) return {};
  return {
    'access-control-allow-origin': expectedOrigin,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
}

async function startSubmissionServer({ key, cert, port, state }) {
  const server = createHttpsServer({ key, cert }, async (request, response) => {
    const origin = request.headers.origin;
    const allowed = origin === state.appOrigin;
    if (request.url !== '/submissions' || (origin !== undefined && !allowed)) {
      response.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ ok: false, code: 'invalid_request' }));
      return;
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(allowed ? 204 : 403, corsHeaders(origin, state.appOrigin));
      response.end();
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { allow: 'POST, OPTIONS', ...corsHeaders(origin, state.appOrigin) });
      response.end();
      return;
    }
    const body = await readRequestBody(request);
    const result = await state.handler({ headers: request.headers, body });
    state.requests.push({ method: request.method, body, status: result.statusCode, resultBody: result.body });
    response.writeHead(result.statusCode, {
      ...result.headers,
      ...corsHeaders(origin, state.appOrigin),
      'cache-control': 'no-store',
    });
    response.end(result.body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK, resolve);
  });
  return server;
}

export async function startCreatorResourceFiltersApp({ catalogFixture, hostname = LOOPBACK } = {}) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'donde-aprendo-resource-filters-'));
  let app;
  let submissionServer;
  let closed = false;
  const state = { appOrigin: undefined, handler: null, requests: [] };
  const closeServer = async (server) => {
    if (!server) return;
    await new Promise((resolve) => server.close(() => resolve()));
  };

  try {
    const keyPath = path.join(temporaryDirectory, 'submission-key.pem');
    const certificatePath = path.join(temporaryDirectory, 'submission-cert.pem');
    await execFileAsync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', keyPath, '-out', certificatePath, '-subj', '/CN=127.0.0.1',
      '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ]);
    const [key, cert] = await Promise.all([readFile(keyPath, 'utf8'), readFile(certificatePath, 'utf8')]);
    const submissionPort = await unusedPort();
    const submissionOrigin = `https://${LOOPBACK}:${submissionPort}`;
    submissionServer = await startSubmissionServer({ key, cert, port: submissionPort, state });
    app = await startCreatorBrowserApp({
      catalogFixture,
      hostname,
      submissionApiUrl: `${submissionOrigin}/submissions`,
    });
    state.appOrigin = app.origin;

    return {
      origin: app.origin,
      apiOrigin: submissionOrigin,
      async createFixture() {
        if (closed) throw new Error('The creator resource-filters app is already closed.');
        const { mock, store: creatorStore } = createDynamoMoveStore({ projectionAware: true });
        const access = await createDynamoCatalogAccess({ docClient: mock.client, region: 'us-east-1' });
        let id = 0;
        state.handler = createSubmissionHandler({
          tableName: 'catalog-test',
          now: () => '2026-11-24T12:00:00.000Z',
          resourceId: () => `resource-browser-contribution-${++id}`,
          ...access,
        });
        state.requests = [];
        const fixture = await app.createFixture({ creatorStore });
        fixture.apiOrigin = submissionOrigin;
        Object.defineProperty(fixture, 'submissionRequests', { get: () => state.requests });
        Object.defineProperty(fixture, 'submissionStore', { value: creatorStore });
        Object.defineProperty(fixture, 'dynamoMock', { value: mock });
        return fixture;
      },
      async close() {
        if (closed) return;
        closed = true;
        try {
          await closeServer(submissionServer);
          await app?.close();
        } finally {
          await rm(temporaryDirectory, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await closeServer(submissionServer);
    await app?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function seedCreatorResourceFilterProfile(store, {
  profileId = 'resource-filter-profile',
  slug = 'filtros-creador',
  aliasSlug = 'filtros-creador-antiguo',
} = {}) {
  const now = Date.UTC(2026, 10, 24, 12);
  const resources = [
    {
      id: 'filter-owner-featured', title: 'Video destacado', url: 'https://filters.example/video',
      description: 'Video clasificado.', category: 'Otros', kind: 'content', format: 'Video', topics: ['Seguridad', 'Redes'],
      published: true, hidden: false, approvalRevoked: false, directoryControl: 'creator', version: 1,
    },
    {
      id: 'filter-legacy-article', title: 'Guía histórica de redes', url: 'https://filters.example/redes',
      description: 'Ficha histórica.', category: 'Redes', published: true, hidden: false, approvalRevoked: false,
      directoryControl: 'editorial', version: 1,
    },
    {
      id: 'filter-community', title: 'Comunidad serverless', url: 'https://filters.example/community',
      description: 'Comunidad clasificada.', category: 'Comunidad', kind: 'community', format: 'User Group', topics: ['Comunidad'],
      published: false, hidden: false, approvalRevoked: false, directoryControl: 'creator', version: 1,
    },
    {
      id: 'filter-recording', title: 'Grabación del evento', url: 'https://filters.example/recording',
      description: 'Grabación relacionada.', category: 'Otros', kind: 'content', format: 'Video', topics: ['Comunidad'],
      eventId: 'filter-event', published: true, hidden: false, approvalRevoked: false, directoryControl: 'editorial', version: 1,
    },
    {
      id: 'filter-event', title: 'Encuentro terminado', registrationUrl: 'https://filters.example/event', recordType: 'event',
      category: 'Evento', kind: 'content', format: 'Curso', topics: ['Seguridad'], eventId: 'filter-event',
      startsAt: '2026-01-10T12:00:00.000Z', endsAt: '2026-01-10T16:00:00.000Z', published: true, hidden: false,
      approvalRevoked: false, directoryControl: 'editorial', version: 1,
    },
    {
      id: 'filter-event-stray', title: 'Cohost del encuentro terminado', registrationUrl: 'https://filters.example/event-cohost', recordType: 'event',
      category: 'Evento', kind: 'source', format: 'Blog', topics: ['Redes'], eventId: 'filter-event',
      startsAt: '2026-01-10T12:00:00.000Z', endsAt: '2026-01-10T16:00:00.000Z', published: true, hidden: false,
      approvalRevoked: false, directoryControl: 'editorial', version: 1,
    },
    {
      id: 'filter-unclassified', title: 'Enlace sin clasificar', url: 'https://filters.example/unclassified',
      description: 'Ficha sin clasificación.', published: true, hidden: false, approvalRevoked: false,
      directoryControl: 'creator', version: 1,
    },
    {
      id: 'filter-invalid', title: 'Clasificación parcial', url: 'https://filters.example/invalid',
      description: 'Ficha inválida.', category: 'Redes', kind: 'content', format: 'Video',
      published: true, hidden: false, approvalRevoked: true, directoryControl: 'creator', version: 1,
    },
    {
      id: 'filter-hidden', title: 'Enlace oculto', url: 'https://filters.example/hidden',
      description: 'No debe publicarse.', kind: 'content', format: 'Artículo', topics: ['Redes'],
      published: true, hidden: true, approvalRevoked: false, directoryControl: 'editorial', version: 1,
    },
    {
      id: 'filter-deselected', title: 'No seleccionado para directorio', url: 'https://filters.example/deselected',
      description: 'Sigue visible en el perfil.', kind: 'source', format: 'Blog', topics: ['Redes'],
      published: true, hidden: false, approvalRevoked: false, directoryControl: 'editorial', version: 1,
    },
  ];
  const placementDefinitions = [
    ['placement-featured', 'filter-owner-featured', true],
    ['placement-legacy', 'filter-legacy-article', true],
    ['placement-community', 'filter-community', true],
    ['placement-recording', 'filter-recording', true],
    ['placement-event', 'filter-event', true],
    ['placement-event-cohost', 'filter-event-stray', true],
    ['placement-unclassified', 'filter-unclassified', true],
    ['placement-invalid', 'filter-invalid', true],
    ['placement-hidden', 'filter-hidden', true],
    ['placement-deselected', 'filter-deselected', false],
  ];
  const placements = Object.fromEntries(placementDefinitions.map(([id, resourceId, selectedForDirectory]) => [
    id, { resourceId, selectedForDirectory },
  ]));
  const profile = {
    recordType: 'creatorState', schemaVersion: 2, id: profileId, version: 1,
    displayName: 'Ana Filtros', slug, city: 'Córdoba', country: 'AR', bio: 'Perfil de prueba.',
    programs: [], socials: {}, published: true, hidden: false, createdAt: now, updatedAt: now,
    placements,
    order: {
      featured: ['placement-featured'],
      ordinary: placementDefinitions.slice(1).map(([id]) => id),
    },
    series: {
      'series-filter-order': {
        name: 'Ruta de eventos', slug: 'ruta-de-eventos', description: 'Orden propio de capítulos.',
        chapters: ['placement-recording', 'placement-event-cohost', 'placement-event'], createdAt: now, updatedAt: now,
      },
    },
  };
  const puts = [
    { key: `profile:${profileId}`, value: profile },
    { key: `alias:${slug}`, value: { recordType: 'profileAlias', slug, profileId, version: 1 } },
    { key: `alias:${aliasSlug}`, value: { recordType: 'profileAlias', slug: aliasSlug, profileId, version: 1 } },
    { key: `series-alias:${profileId}:ruta-de-eventos`, value: {
      recordType: 'seriesAlias', seriesId: 'series-filter-order', profileId, slug: 'ruta-de-eventos', version: 1,
    } },
    ...resources.flatMap((resource) => [
      { key: `resource:${resource.id}`, value: resource },
      { key: currentUrlKey(resource.url ?? resource.registrationUrl), value: currentUrlReservation(resource.url ?? resource.registrationUrl, resource.id) },
    ]),
  ];
  assert.equal(await store.transact({
    checks: puts.map(({ key }) => ({ key, version: null })),
    puts,
  }), true, 'the public filter profile is seeded once in the shared logical store');
  return { profile, resources, placements, profileId, slug, aliasSlug, seriesId: 'series-filter-order' };
}

export const test = base.extend({
  app: [async ({}, use) => {
    const app = await startCreatorResourceFiltersApp();
    try {
      await use(app);
    } finally {
      await app.close();
    }
  }, { scope: 'worker' }],
  fixture: [async ({ app }, use) => {
    const fixture = await app.createFixture();
    fixture.publish();
    try {
      await use(fixture);
    } finally {
      fixture.clear();
    }
  }, { auto: true }],
  publicPage: async ({ browser }, use) => {
    const context = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
    try {
      await use(await context.newPage());
    } finally {
      await context.close();
    }
  },
  checkBrowserErrors: [async ({ page }, use, testInfo) => {
    const errors = [];
    const listener = (error) => errors.push(error);
    page.on('pageerror', listener);
    try {
      await use();
    } finally {
      page.off('pageerror', listener);
      expect(errors.map((error) => error.message), `${testInfo.title}: uncaught browser page errors`).toEqual([]);
    }
  }, { auto: true }],
});

export { expect };

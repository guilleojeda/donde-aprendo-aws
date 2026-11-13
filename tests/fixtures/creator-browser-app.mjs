import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createAccountHarness, createAccountStore, completeLogin, cookiePair } from './account-auth.mjs';
import { bindCreatorBrowserRuntime, clearCreatorBrowserRuntime } from './creator-browser-runtime.mjs';
import { createCreatorPagesHarness, createDocumentStore } from './creator-pages.mjs';
import { createCreatorPhotoService } from '../../src/lib/creator-photos.mjs';
import { createPhotoObjects } from './creator-photos.mjs';
import { createCreatorHttpHandler } from '../../src/lib/creator-http.mjs';
import { createBrowserCreatorStatistics } from './creator-statistics-ga4.mjs';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOOPBACK = '127.0.0.1';
const COOKIE_NAME = 'da_session';
const ENVIRONMENT_KEYS = ['ACCOUNT_ORIGIN', 'PUBLIC_SITE_ORIGIN', 'CATALOG_FIXTURE', 'CATALOG_TABLE', 'CREATOR_PROFILES_TABLE'];

function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

async function unusedPort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, LOOPBACK, resolve);
  });
  const address = socket.address();
  assert.ok(address && typeof address === 'object' && address.port > 0);
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function setEnvironment(values) {
  const previous = Object.fromEntries(ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENVIRONMENT_KEYS) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

export async function startCreatorBrowserApp({ catalogFixture = path.join(ROOT, 'tests/fixtures/catalog.json'), hostname = LOOPBACK } = {}) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'donde-aprendo-creator-browser-'));
  let restoreEnv = () => {};
  let server;
  let activeRuntime;
  let closed = false;
  try {
    const keyPath = path.join(temporaryDirectory, 'loopback-key.pem');
    const certificatePath = path.join(temporaryDirectory, 'loopback-cert.pem');
    await execFileAsync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', keyPath, '-out', certificatePath, '-subj', '/CN=127.0.0.1',
      '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ]);
    const [key, cert] = await Promise.all([readFile(keyPath, 'utf8'), readFile(certificatePath, 'utf8')]);
    const port = await unusedPort();
    const transportOrigin = `https://${LOOPBACK}:${port}`;
    const origin = `https://${hostname}:${port}`;
    restoreEnv = setEnvironment({
      ACCOUNT_ORIGIN: origin,
      PUBLIC_SITE_ORIGIN: origin,
      CATALOG_FIXTURE: catalogFixture,
      CATALOG_TABLE: undefined,
      CREATOR_PROFILES_TABLE: undefined,
    });
    const { allowedAmplifyDomainsForOrigin } = await import('../../src/lib/amplify-security.mjs');
    const accountRuntimePath = path.join(ROOT, 'src/lib/account-runtime.mjs');
    const creatorRuntimePath = path.join(ROOT, 'src/lib/creator-runtime.mjs');
    const bridgePath = fileURLToPath(new URL('./creator-browser-runtime.mjs', import.meta.url));
    const runtimeModulePaths = new Set([accountRuntimePath, creatorRuntimePath]);
    const { dev: astroDev } = await import('astro');
    server = await astroDev({
      root: ROOT,
      logLevel: 'warn',
      server: { host: LOOPBACK, port, allowedHosts: [LOOPBACK, hostname] },
      security: { allowedDomains: allowedAmplifyDomainsForOrigin(origin) },
      cacheDir: path.join(temporaryDirectory, 'astro-cache'),
      vite: {
        plugins: [{
          name: 'creator-browser-runtime-aliases',
          enforce: 'pre',
          resolveId(source, importer) {
            const cleanSource = source.split('?')[0];
            const resolved = path.isAbsolute(cleanSource)
              ? cleanSource
              : importer
                ? path.resolve(path.dirname(importer.split('?')[0]), cleanSource)
                : undefined;
            return runtimeModulePaths.has(resolved) ? bridgePath : null;
          },
        }],
        // Dev-server reloads are not product behavior and can replace the SSR
        // document while a test deliberately holds its hydration scripts.
        server: { https: { key, cert }, strictPort: true, hmr: false },
      },
    });
    if (server.address.address !== LOOPBACK || server.address.port !== port) {
      throw new Error(`Astro listened on ${server.address.address}:${server.address.port}; expected ${origin}`);
    }
    return {
      origin,
      // APIRequestContext does not use Chromium's local hostname resolver.
      transportOrigin,
      async createFixture() {
        if (closed) throw new Error('The creator browser app is already closed.');
        if (activeRuntime) throw new Error('A prior creator browser fixture was not cleared.');
        const accountStore = createAccountStore();
        const accounts = await createAccountHarness({ store: accountStore, origin });
        const creatorStore = createDocumentStore();
        const browserStatistics = createBrowserCreatorStatistics();
        const pages = await createCreatorPagesHarness({
          origin,
          store: creatorStore,
          authenticate: (request) => accounts.auth.getPrincipal(request),
          statistics: browserStatistics.service,
        });
        const photoObjects = createPhotoObjects();
        const photoPolicies = [];
        let photoId = 0;
        // Photo authorization/finalization remain real; only signing and S3 object transport are provided here.
        const photos = createCreatorPhotoService({
          store: creatorStore,
          objects: photoObjects,
          signPost: async (request) => {
            photoPolicies.push(copy(request));
            return {
              url: 'https://creator-photos.example.invalid/',
              fields: { key: request.key, policy: `browser-photo-policy-${photoPolicies.length}` },
            };
          },
          now: () => Date.UTC(2026, 9, 23, 12),
          createId: () => `browser-photo-${++photoId}`,
        });
        const creatorRuntime = {
          service: pages.service,
          photos,
          auth: accounts.auth,
          handle: createCreatorHttpHandler({
            service: pages.service,
            photos,
            auth: accounts.auth,
            store: creatorStore,
            origin,
          }),
        };
        const value = { accountAuth: accounts.auth, creatorRuntime };
        const fixture = {
          origin,
          accountHarness: accounts,
          accountStore,
          creatorStore,
          statistics: browserStatistics,
          photoObjects,
          photoPolicies,
          photos,
          creatorRuntime,
          async login() {
            const result = await completeLogin(accounts);
            assert.equal(result.response.status, 303, 'the real account callback completes successfully');
            assert.ok(result.sessionCookie, 'the real account callback issues a live application cookie');
            assert.match(result.sessionCookie, /(?:^|;\s*)Secure(?:;|$)/iu);
            assert.match(result.sessionCookie, /(?:^|;\s*)HttpOnly(?:;|$)/iu);
            return {
              setCookie: result.sessionCookie,
              pair: cookiePair(result.sessionCookie),
              name: COOKIE_NAME,
              value: cookiePair(result.sessionCookie).slice(COOKIE_NAME.length + 1),
            };
          },
          async principal(cookie) {
            return accounts.auth.getPrincipal(new Request(`${origin}/`, {
              headers: cookie ? { cookie: cookie.pair ?? cookie } : {},
            }));
          },
          async request(cookie, route, { method = 'GET', body, originHeader, headers: extraHeaders = {} } = {}) {
            const headers = new Headers(extraHeaders);
            if (cookie) headers.set('cookie', cookie.pair ?? cookie);
            const principal = cookie ? await fixture.principal(cookie) : { state: 'anonymous' };
            const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
            if (mutating && originHeader !== null) headers.set('origin', originHeader ?? origin);
            if (mutating && principal.state === 'authenticated') headers.set('x-csrf-token', principal.csrfToken);
            if (body !== undefined) {
              headers.set('content-type', 'application/json');
            }
            return creatorRuntime.handle(new Request(new URL(route, origin), {
              method,
              headers,
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            }));
          },
          async rawOwner(cookie) {
            const principal = await fixture.principal(cookie);
            if (principal.state !== 'authenticated') return undefined;
            const owner = await creatorStore.get(`account-profile:${principal.accountId}`);
            const profile = owner ? await creatorStore.get(`profile:${owner.profileId}`) : null;
            return { principal, owner, profile };
          },
          async rawSeries(cookie, seriesId) {
            const { owner } = await fixture.rawOwner(cookie);
            if (!owner) return null;
            return copy(await creatorStore.get(`series:${owner.profileId}:${seriesId}`));
          },
          async rawPlacement(cookie, placementId) {
            const { owner } = await fixture.rawOwner(cookie);
            if (!owner) return null;
            return copy(await creatorStore.get(`placement:${owner.profileId}:${placementId}`));
          },
          async rawResource(resourceId) {
            return copy(await creatorStore.get(`resource:${resourceId}`));
          },
          publish() {
            if (activeRuntime) throw new Error('A creator browser runtime is already active.');
            bindCreatorBrowserRuntime(value);
            activeRuntime = value;
          },
          clear() {
            if (activeRuntime !== value) throw new Error('The creator browser fixture runtime is not active.');
            clearCreatorBrowserRuntime(value);
            activeRuntime = undefined;
          },
        };
        return fixture;
      },
      async close() {
        if (closed) return;
        closed = true;
        if (activeRuntime) {
          clearCreatorBrowserRuntime(activeRuntime);
          activeRuntime = undefined;
        }
        try {
          await server.stop();
        } finally {
          restoreEnv();
          await rm(temporaryDirectory, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    try {
      await server?.stop();
    } finally {
      restoreEnv();
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
    throw error;
  }
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

import {
  isCatalogResourceIdWithinLimit,
  projectPublishedCatalog,
} from '../src/lib/catalog.mjs';
import { effectiveEventLocation } from '../src/lib/event-location.mjs';
import { resourceHref } from '../src/lib/catalog-routes.mjs';
import { resolveResourceFragment } from '../src/lib/resource-fragments.mjs';
import { buildSearchIndex, searchIndex } from '../src/lib/unified-search.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resource(id, overrides = {}) {
  return {
    id,
    title: `Boundary marker ${id}`,
    url: `https://example.test/resource/${encodeURIComponent(id)}`,
    description: 'Public resource',
    category: 'Curso',
    order: 1,
    featured: false,
    kind: 'content',
    format: 'Curso',
    topics: [],
    published: true,
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    recordType: 'event',
    id: 'event-identity-boundary',
    title: 'Boundary marker event',
    description: 'Public event',
    startsAt: '2099-10-17T08:00:00Z',
    endsAt: '2099-10-17T09:00:00Z',
    timeZone: 'UTC',
    organizer: 'Public group',
    mode: 'in-person',
    place: 'Córdoba',
    registrationUrl: 'https://example.test/register',
    published: true,
    ...overrides,
  };
}

const genericIdentities = [
  ['colon', 'source:author'],
  ['129 ASCII characters', 's'.repeat(129)],
  ['supplementary Unicode', 'community 🧭'],
  ['repeated internal whitespace', 'community  local  aws'],
  ['composed accent', 'comunidad-é'],
  ['decomposed accent', 'comunidad-e\u0301'],
  ['256 ASCII bytes', 'x'.repeat(256)],
];

test('public resource IDs keep exact generic identities within the 256-byte limit', () => {
  const ids = [
    'source:author',
    's'.repeat(129),
    'community 🧭',
    'community  local  aws',
    'comunidad-é',
    'comunidad-e\u0301',
    'x'.repeat(256),
    '🧭'.repeat(64),
    '\u0085identity\u0085',
  ];
  const projected = projectPublishedCatalog(ids.map((id, index) => resource(id, { order: index })));

  assert.deepEqual(new Set(projected.map(({ id }) => id)), new Set(ids),
    'catalog projection preserves punctuation, Unicode form, internal whitespace, NEL, and complete IDs');
  assert.notEqual('comunidad-é', 'comunidad-e\u0301', 'composed and decomposed IDs remain distinct values');

  for (const id of ['', ' leading', 'trailing ', '\uFEFFleading-bom', 'trailing-bom\uFEFF', 'x'.repeat(257)]) {
    assert.throws(() => projectPublishedCatalog([resource(id)]), undefined, `rejects public ID ${JSON.stringify(id)}`);
  }
  for (const id of [null, 7, {}, false]) {
    assert.throws(() => projectPublishedCatalog([resource(id)]), undefined,
      `rejects non-string public ID ${JSON.stringify(id)}`);
  }
});

for (const [label, id] of genericIdentities) {
  test(`content sourceId accepts the exact generic target identity: ${label}`, () => {
    const projected = projectPublishedCatalog([
      resource(id, { kind: 'source', format: 'Blog', category: 'Blog' }),
      resource(`content-source-${label.replaceAll(' ', '-')}`, { sourceId: id }),
    ]);
    const target = projected.find(({ id: candidate }) => candidate === id);
    const referencingContent = projected.find(({ sourceId }) => sourceId !== undefined);

    assert.equal(target.id, id);
    assert.equal(referencingContent.sourceId, id);
  });

  test(`content communityId accepts the exact generic target identity: ${label}`, () => {
    const projected = projectPublishedCatalog([
      resource(id, { kind: 'community', format: 'User Group', category: 'Comunidad', country: 'AR' }),
      resource(`content-community-${label.replaceAll(' ', '-')}`, { communityId: id }),
    ]);
    const target = projected.find(({ id: candidate }) => candidate === id);
    const referencingContent = projected.find(({ communityId }) => communityId !== undefined);

    assert.equal(target.id, id);
    assert.equal(referencingContent.communityId, id);
  });

  test(`event communityId accepts the exact generic target identity: ${label}`, () => {
    const [projected] = projectPublishedCatalog([event({ communityId: id })]);
    assert.equal(projected.communityId, id);
  });
}

test('generic string references reject empty, outer-whitespace and oversize values, and self references', () => {
  const invalidStrings = ['', ' leading', 'trailing ', '\uFEFFleading', 'trailing\uFEFF',
    'x'.repeat(257), `${'é'.repeat(128)}a`, '🧭'.repeat(65)];
  for (const field of ['sourceId', 'communityId']) {
    for (const value of invalidStrings) {
      assert.throws(() => projectPublishedCatalog([resource('referencer', { [field]: value })]), undefined,
        `${field} rejects ${JSON.stringify(value)}`);
    }
    assert.throws(() => projectPublishedCatalog([resource('self-reference', { [field]: 'self-reference' })]), undefined,
      `${field} rejects a reference to its own record`);
  }
  for (const value of invalidStrings) {
    assert.throws(() => projectPublishedCatalog([event({ communityId: value })]), undefined,
      `event communityId rejects ${JSON.stringify(value)}`);
  }
});

for (const field of ['sourceId', 'communityId']) {
  for (const value of [null, 7, false]) {
    test(`${field} rejects non-string ${JSON.stringify(value)}`, () => {
      assert.throws(() => projectPublishedCatalog([resource('referencer', { [field]: value })]));
    });
  }
}

for (const value of [null, 7, false]) {
  test(`event communityId rejects non-string ${JSON.stringify(value)}`, () => {
    assert.throws(() => projectPublishedCatalog([event({ communityId: value })]));
  });
}

test('reference fields keep their eligible record types', () => {
  assert.throws(() => projectPublishedCatalog([resource('source-record', {
    kind: 'source', format: 'Blog', category: 'Blog', sourceId: 'source-target',
  })]), /invalid sourceId/);
  assert.throws(() => projectPublishedCatalog([resource('community-record', {
    kind: 'community', format: 'User Group', category: 'Comunidad', communityId: 'community-target',
  })]), /invalid communityId/);
  assert.throws(() => projectPublishedCatalog([resource('source-event-link', {
    kind: 'source', format: 'Blog', category: 'Blog', eventId: 'event-target',
  })]), /invalid eventId/);
});

test('event IDs keep the narrower 128-character ASCII form', () => {
  const validEventId = 'e'.repeat(128);
  const [accepted] = projectPublishedCatalog([event({ id: validEventId, communityId: 'community-author' })]);
  assert.equal(accepted.id, validEventId);
  assert.equal(accepted.communityId, 'community-author');

  for (const id of ['e'.repeat(129), 'event:author', 'event id']) {
    assert.throws(() => projectPublishedCatalog([event({ id })]), undefined, `rejects event ID ${JSON.stringify(id)}`);
  }
});

for (const id of [7, false, null]) {
  test(`event own ID rejects non-string ${JSON.stringify(id)} without coercion`, () => {
    assert.throws(() => projectPublishedCatalog([event({ id })]));
  });
}

test('content eventId references keep the narrower 128-character ASCII form', () => {
  const [content] = projectPublishedCatalog([resource('recording', { eventId: 'event_id-128' })]);
  assert.equal(content.eventId, 'event_id-128');
  for (const eventId of ['', ' event-id', 'event:author', 'e'.repeat(129)]) {
    assert.throws(() => projectPublishedCatalog([resource('recording', { eventId })]), /invalid eventId/);
  }
});

test('content eventId rejects non-string values instead of regex-coercing them', () => {
  assert.throws(() => projectPublishedCatalog([resource('recording', { eventId: 123 })]), /invalid eventId/);
});

test('event communityId uses generic identities without widening event own IDs', () => {
  const id = 'community:author';
  const [projected] = projectPublishedCatalog([event({ communityId: id })]);
  assert.equal(projected.id, 'event-identity-boundary');
  assert.equal(projected.communityId, id);
});

test('public relationship IDs continue through location, resource links, and search index consumers', () => {
  const communityId = 'community: Córdoba 🧭';
  const catalog = projectPublishedCatalog([
    resource(communityId, {
      kind: 'community', format: 'User Group', category: 'Comunidad', country: 'AR', city: 'Córdoba',
    }),
    resource('content-with-community', { communityId, title: 'Boundary marker content' }),
    event({ communityId, id: 'event-community-location' }),
  ]);
  const community = catalog.find(({ kind }) => kind === 'community');
  const projectedEvent = catalog.find(({ recordType }) => recordType === 'event');
  const communityById = new Map([[communityId, community]]);

  assert.deepEqual(effectiveEventLocation(projectedEvent, communityById), { country: 'AR', city: 'Córdoba' });
  assert.equal(resourceHref(community), '/comunidades/argentina/#resource-community:%20C%C3%B3rdoba%20%F0%9F%A7%AD');
  assert.equal(resolveResourceFragment(`#${resourceHref(community).split('#')[1]}`, new Set([communityId])), communityId);

  const index = buildSearchIndex([], catalog);
  assert.equal(index.find(({ type }) => type === 'community')?.url, resourceHref(community));
  assert.equal(index.find(({ type }) => type === 'event')?.url, '/eventos/argentina/#event-event-community-location');
  assert.equal(searchIndex(index, 'Boundary marker', 'content')[0]?.url,
    '/aprender/#resource-content-with-community');
});

test('private and reserved-key callers retain the byte-only ID predicate', () => {
  assert.equal(isCatalogResourceIdWithinLimit(' x '), true,
    'the shared private/reserved-key byte check does not impose public outer-whitespace rules');
  assert.equal(isCatalogResourceIdWithinLimit('x'.repeat(256)), true);
  assert.equal(isCatalogResourceIdWithinLimit('x'.repeat(257)), false);
  assert.equal(isCatalogResourceIdWithinLimit(''), false);
  assert.equal(isCatalogResourceIdWithinLimit(7), false);
});

async function loadCompiledModule(modulePath) {
  const { outputFiles } = await build({
    entryPoints: [path.resolve(root, modulePath)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

test('public owner-selection output preserves exact 256-byte and Unicode IDs through its production parser', async () => {
  const ids = [
    'x'.repeat(256),
    'community  with  spaces',
    'comunidad-é',
    'comunidad-e\u0301',
    'learning 🧭',
  ];
  const items = ids.map((id, index) => resource(id, { order: index }));
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'catalog-identities-'));
  const fixturePath = path.join(temporaryDirectory, 'catalog.json');
  const routePath = path.join(root, 'src/pages/catalog-selection.json.ts');
  const routeOutputPath = path.join(temporaryDirectory, 'catalog-selection.mjs');
  const savedEnvironment = Object.fromEntries(
    ['CATALOG_FIXTURE', 'CATALOG_TABLE', 'CREATOR_PROFILES_TABLE'].map((name) => [name, process.env[name]]),
  );

  try {
    await writeFile(fixturePath, JSON.stringify({ items, profiles: [], placements: [] }));
    process.env.CATALOG_FIXTURE = fixturePath;
    delete process.env.CATALOG_TABLE;
    delete process.env.CREATOR_PROFILES_TABLE;
    await build({
      entryPoints: [routePath],
      outfile: routeOutputPath,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
    });

    const { GET } = await import(pathToFileURL(routeOutputPath).href);
    const parser = await loadCompiledModule('src/lib/creator-owner-catalog.ts');
    const response = await GET();
    const publicSelection = await response.json();
    const parsedSelection = parser.parseCreatorOwnerCatalog(publicSelection);

    assert.equal(response.status, 200);
    assert.deepEqual(new Set(publicSelection.map(({ id }) => id)), new Set(ids));
    assert.deepEqual(parsedSelection, publicSelection,
      'the actual owner-selection parser accepts the unchanged public route output');
  } finally {
    for (const [name, value] of Object.entries(savedEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('the selection consumer rejects identities outside the public catalog contract', async () => {
  const parser = await loadCompiledModule('src/lib/creator-owner-catalog.ts');
  const invalidIds = ['', ' leading', 'trailing ', 'x'.repeat(257), '🧭'.repeat(65), 7, null];
  const observed = invalidIds.map((id) => parser.parseCreatorOwnerCatalog([
    { id, tipo: 'content', title: 'Public selection', url: 'https://example.test/resource' },
  ]));
  assert.deepEqual(observed, invalidIds.map(() => undefined),
    'an untrusted selection response cannot introduce IDs rejected by its public producer');
});

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { loadCatalog } from '../src/lib/catalog.mjs';
import { startHostingReleaseDynamo } from './fixtures/hosting-release-dynamodb.mjs';

const scratchPrefix = join(tmpdir(), 'catalog-public-admission-');

function resource(id, overrides = {}) {
  return {
    id,
    title: `Recurso ${id}`,
    url: `https://catalog.example.test/${encodeURIComponent(id)}`,
    description: `Descripción pública de ${id}`,
    category: 'Artículo',
    order: 1,
    featured: false,
    kind: 'content',
    format: 'Artículo',
    topics: ['Seguridad'],
    published: true,
    ...overrides,
  };
}

function event(id = 'event-public-1', overrides = {}) {
  return {
    recordType: 'event',
    id,
    title: `Evento ${id}`,
    description: `Descripción pública de ${id}`,
    startsAt: '2099-04-01T12:00:00.000Z',
    endsAt: '2099-04-01T13:00:00.000Z',
    timeZone: 'UTC',
    organizer: 'Comunidad pública',
    mode: 'online',
    registrationUrl: `https://events.example.test/${id}`,
    country: 'AR',
    published: true,
    ...overrides,
  };
}

function creatorState(overrides = {}) {
  return {
    id: 'creator-public',
    schemaVersion: 2,
    version: 7,
    displayName: 'Creador público',
    slug: 'creator-publico',
    published: true,
    hidden: false,
    placements: {
      selected: { resourceId: 'creator-resource', selectedForDirectory: true },
    },
    order: { featured: [], ordinary: ['selected'] },
    series: {
      seriesPublic: { name: 'Serie pública', slug: 'serie-publica', chapters: ['selected'] },
    },
    privateProfileField: 'must-not-reach-the-public-projection',
    ...overrides,
  };
}

function equivalentCatalog() {
  const exactAsciiId = 'legacy.guide';
  const exactUtf8Id = 'é'.repeat(128);
  return {
    exactAsciiId,
    exactUtf8Id,
    items: [
      resource(exactAsciiId, {
        title: 'ID con punto', order: 5, featured: true, country: 'AR', level: 'inicial',
        sourceId: 'source-public', privateResourceField: 'private-sentinel',
      }),
      resource(exactUtf8Id, { title: 'ID UTF-8 de 256 bytes', order: 4 }),
      resource('creator-resource', {
        title: 'Recurso seleccionado por creador', order: 3, directoryControl: 'creator',
        editorProfileId: 'creator-public', privateResourceField: 'private-creator-sentinel',
      }),
      resource('not-selected', {
        title: 'Recurso sin selección', directoryControl: 'creator', editorProfileId: 'creator-public',
      }),
      resource('unpublished-resource', { published: false, privateResourceField: 'unpublished-sentinel' }),
      resource('hidden-resource', { hidden: true, privateResourceField: 'hidden-sentinel' }),
      resource('revoked-resource', { approvalRevoked: true, privateResourceField: 'revoked-sentinel' }),
      event(),
    ],
    creators: [creatorState()],
  };
}

async function writeFixture(catalog) {
  const directory = await mkdtemp(scratchPrefix);
  const fixturePath = join(directory, 'catalog.json');
  await writeFile(fixturePath, JSON.stringify({ items: catalog.items, creators: catalog.creators ?? [] }));
  return { directory, fixturePath };
}

async function loadProjectedTable(t, catalog, physicalRows, { includeCreatorTable = true } = {}) {
  const runtimeEnvironment = {
    CATALOG_TABLE: 'public-admission-catalog',
    ...(includeCreatorTable ? { CREATOR_PROFILES_TABLE: 'public-admission-profiles' } : {}),
  };
  const fixture = await startHostingReleaseDynamo({ catalog, runtimeEnvironment, physicalRows });
  t.after(() => fixture.close());
  const rawClient = new DynamoDBClient({
    endpoint: fixture.endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'public-admission-invalid', secretAccessKey: 'public-admission-invalid' },
  });
  t.after(() => rawClient.destroy());
  const docClient = DynamoDBDocumentClient.from(rawClient);
  const tableCatalog = await loadCatalog({
    fixturePath: '',
    tableName: runtimeEnvironment.CATALOG_TABLE,
    creatorTableName: runtimeEnvironment.CREATOR_PROFILES_TABLE ?? '',
    docClient,
  });
  fixture.assertBuildReads();
  return { fixture, tableCatalog };
}

function loadFixtureCatalog(fixturePath) {
  return loadCatalog({ fixturePath, tableName: '', creatorTableName: '' });
}

function sortById(records) {
  return [...records].sort((left, right) => left.id.localeCompare(right.id));
}

test('fixture and actual projected tables admit equivalent public facts identically', async (t) => {
  const catalog = equivalentCatalog();
  const { directory, fixturePath } = await writeFixture(catalog);
  t.after(() => rm(directory, { recursive: true, force: true }));

  const fixtureCatalog = await loadFixtureCatalog(fixturePath);
  const { tableCatalog, fixture } = await loadProjectedTable(t, catalog);

  assert.deepEqual(sortById(tableCatalog), sortById(fixtureCatalog),
    'fixture and physical-table readers share the same public admission result');
  assert.deepEqual(sortById(fixtureCatalog).map(({ id }) => id), sortById([
    { id: catalog.exactAsciiId }, { id: catalog.exactUtf8Id },
    { id: 'creator-resource' }, { id: 'event-public-1' },
  ]).map(({ id }) => id));

  const byId = new Map(fixtureCatalog.map((record) => [record.id, record]));
  assert.deepEqual(byId.get(catalog.exactAsciiId), {
    id: catalog.exactAsciiId,
    title: 'ID con punto',
    url: `https://catalog.example.test/${encodeURIComponent(catalog.exactAsciiId)}`,
    description: `Descripción pública de ${catalog.exactAsciiId}`,
    category: 'Artículo',
    order: 5,
    featured: true,
    kind: 'content',
    format: 'Artículo',
    topics: ['Seguridad'],
    country: 'AR',
    level: 'inicial',
    sourceId: 'source-public',
  });
  assert.equal(byId.get(catalog.exactAsciiId).id, catalog.exactAsciiId,
    'accepted public IDs retain exact bytes rather than normalized identity');
  assert.equal(byId.get(catalog.exactUtf8Id).id, catalog.exactUtf8Id,
    'accepted 256-byte UTF-8 public IDs retain exact bytes');
  assert.deepEqual(byId.get('event-public-1'), {
    recordType: 'event',
    id: 'event-public-1',
    title: 'Evento event-public-1',
    description: 'Descripción pública de event-public-1',
    startsAt: '2099-04-01T12:00:00.000Z',
    endsAt: '2099-04-01T13:00:00.000Z',
    timeZone: 'UTC',
    organizer: 'Comunidad pública',
    mode: 'online',
    country: 'AR',
    registrationUrl: 'https://events.example.test/event-public-1',
  });
  assert.deepEqual(byId.get('creator-resource').series, [{
    seriesId: 'seriesPublic',
    name: 'Serie pública',
    creatorName: 'Creador público',
    href: '/c/creator-publico/series/serie-publica/',
  }]);

  const publicResourceKeys = new Set([
    'id', 'title', 'url', 'description', 'category', 'order', 'featured', 'kind', 'format', 'topics',
    'addedAt', 'country', 'level', 'sourceId', 'communityId', 'eventId', 'series',
  ]);
  const publicEventKeys = new Set([
    'recordType', 'id', 'title', 'description', 'startsAt', 'endsAt', 'timeZone', 'organizer', 'mode',
    'place', 'country', 'venueCountry', 'city', 'communityId', 'registrationUrl', 'series',
  ]);
  for (const record of fixtureCatalog) {
    const allowed = record.recordType === 'event' ? publicEventKeys : publicResourceKeys;
    assert.ok(Object.keys(record).every((field) => allowed.has(field)),
      `${record.id} is serialized through its explicit public allowlist`);
  }
  assert.doesNotMatch(JSON.stringify(fixtureCatalog), /private-sentinel|private-creator-sentinel|must-not-reach-the-public-projection|editorProfileId|directoryControl/u);
  assert.ok(fixture.scans.every(({ fields }) => !fields.includes('privateResourceField')),
    'the physical table projection never requests fixture-private fields');
});

test('an equivalent fixture can succeed while missing table creator context fails closed', async (t) => {
  const catalog = equivalentCatalog();
  const { directory, fixturePath } = await writeFixture(catalog);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixtureCatalog = await loadFixtureCatalog(fixturePath);
  assert.ok(fixtureCatalog.some(({ id }) => id === 'creator-resource'));

  await assert.rejects(
    loadProjectedTable(t, catalog, undefined, { includeCreatorTable: false }),
    /Creator directory state is required/u,
    'a table read without its required creator context is not equivalent to an embedded fixture');
});

test('a table projection that drops an otherwise eligible fact is a material divergence', async (t) => {
  const catalog = {
    items: [resource('projection-sensitive', { order: 2, privateResourceField: 'not-public' })],
    creators: [],
  };
  const { directory, fixturePath } = await writeFixture(catalog);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixtureCatalog = await loadFixtureCatalog(fixturePath);
  assert.equal(fixtureCatalog[0].id, 'projection-sensitive');

  const physicalCatalogRows = catalog.items.map((row) => {
    const physicalRow = { ...row };
    delete physicalRow.description;
    return physicalRow;
  });
  await assert.rejects(
    loadProjectedTable(t, catalog, { catalog: physicalCatalogRows, creators: [] }),
    /missing public field description/u,
    'a physical projection omission must not be mistaken for an equivalent complete fixture');
});

test('fixture and table reject the same malformed logical creator facts', async (t) => {
  const catalog = equivalentCatalog();
  catalog.creators = [creatorState({ slug: '' })];
  const { directory, fixturePath } = await writeFixture(catalog);
  t.after(() => rm(directory, { recursive: true, force: true }));

  await assert.rejects(loadFixtureCatalog(fixturePath), /malformed public identity/u,
    'fixture creator admission rejects a visible creator without public identity');
  await assert.rejects(loadProjectedTable(t, catalog), /malformed public identity/u,
    'projected-table creator admission rejects the same logical fact');
});

test('malformed physical creator identity is rejected before public admission', async (t) => {
  const catalog = equivalentCatalog();
  const { directory, fixturePath } = await writeFixture(catalog);
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixtureCatalog = await loadFixtureCatalog(fixturePath);
  assert.ok(fixtureCatalog.some(({ id }) => id === 'creator-resource'));

  const physicalCreatorRows = catalog.creators.map((creator) => ({
    ...creator,
    pk: 'PROFILE#different-creator',
    sk: 'META',
    recordType: 'creatorState',
  }));
  await assert.rejects(
    loadProjectedTable(t, catalog, { catalog: catalog.items, creators: physicalCreatorRows }),
    /schema identity|storage key|identity/u,
    'the table reader does not reconstruct a public creator from a mismatched physical key');
});

const invalidOtherwiseEligible = [
  {
    name: 'outer-whitespace ID',
    row: resource(' invalid-public-id'),
    error: /invalid id/u,
  },
  {
    name: 'unknown taxonomy',
    row: resource('invalid-taxonomy', { kind: 'unknown' }),
    error: /invalid kind/u,
  },
  {
    name: 'unsafe URL',
    row: resource('invalid-url', { url: 'javascript:alert(1)' }),
    error: /unsafe URL/u,
  },
  {
    name: 'missing public description',
    row: (() => {
      const value = resource('missing-description');
      delete value.description;
      return value;
    })(),
    error: /missing public field description/u,
  },
  {
    name: 'event with a non-positive interval',
    row: event('invalid-event-interval', { endsAt: '2099-04-01T12:00:00.000Z' }),
    error: /ends before it starts/u,
  },
];

for (const { name, row, error } of invalidOtherwiseEligible) {
  test(`fixture and table reject an otherwise eligible ${name}`, async (t) => {
    const catalog = { items: [row], creators: [] };
    const { directory, fixturePath } = await writeFixture(catalog);
    t.after(() => rm(directory, { recursive: true, force: true }));

    await assert.rejects(loadFixtureCatalog(fixturePath), error, 'fixture admission rejects the invalid fact');
    await assert.rejects(loadProjectedTable(t, catalog), error,
      'projected-table admission rejects the same invalid fact');
  });
}

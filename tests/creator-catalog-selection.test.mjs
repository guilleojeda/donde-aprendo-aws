import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { loadCatalog } from '../src/lib/catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = path.join(root, '.work/creator-owner-experience/planning/phase6/api');
await mkdir(scratch, { recursive: true });
const tempDir = await mkdtemp(path.join(scratch, 'catalog-selection-'));
const routePath = path.join(root, 'src/pages/catalog-selection.json.ts');
const originalCatalogEnvironment = Object.fromEntries(
  ['CATALOG_FIXTURE', 'CATALOG_TABLE', 'CREATOR_PROFILES_TABLE'].map((name) => [name, process.env[name]]),
);

const publicResource = (id, title, url, fields = {}) => ({
  id,
  title,
  url,
  description: `Descripción de ${id}`,
  category: 'Otros',
  order: 1,
  featured: false,
  kind: 'content',
  format: 'Artículo',
  topics: [],
  published: true,
  ...fields,
});

function event(id, title, registrationUrl, startsAt, fields = {}) {
  return {
    recordType: 'event',
    id,
    title,
    description: `Encuentro de ${id}`,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 60 * 60 * 1000).toISOString(),
    timeZone: 'UTC',
    organizer: 'Grupo público',
    mode: 'online',
    registrationUrl,
    published: true,
    ...fields,
  };
}

const privateSentinels = [
  'selection-private-account-sentinel',
  'selection-private-email-sentinel@example.test',
  'selection-private-evidence-sentinel',
  'selection-private-moderation-sentinel',
];

const catalogRows = [
  publicResource('selection-content', 'Artículo público', 'https://catalog.example/content', {
    submitterAccountId: privateSentinels[0], submitterEmail: privateSentinels[1], evidence: privateSentinels[2],
  }),
  publicResource('selection-source', 'Canal público', 'https://catalog.example/source', {
    category: 'Canal de YouTube', kind: 'source', format: 'Canal de YouTube',
  }),
  publicResource('selection-community', 'Comunidad pública', 'https://catalog.example/community', {
    category: 'Comunidad', kind: 'community', format: 'User Group', country: 'AR', city: 'Córdoba',
  }),
  publicResource('selection-creator-visible', 'Ficha pública elegible', 'https://catalog.example/creator-visible', {
    directoryControl: 'creator', editorProfileId: 'selection-profile-visible',
  }),
  publicResource('selection-creator-unselected', 'Ficha sin selección', 'https://catalog.example/creator-unselected', {
    directoryControl: 'creator', editorProfileId: 'selection-profile-visible',
  }),
  publicResource('selection-creator-private-profile', 'Ficha sin perfil público', 'https://catalog.example/creator-private', {
    directoryControl: 'creator', editorProfileId: 'selection-profile-private',
  }),
  publicResource('selection-hidden', 'Ficha oculta', 'https://catalog.example/hidden', {
    hidden: true, privateStatus: privateSentinels[3],
  }),
  publicResource('selection-revoked', 'Ficha revocada', 'https://catalog.example/revoked', { approvalRevoked: true }),
  publicResource('selection-unpublished', 'Ficha pendiente', 'https://catalog.example/pending', { published: false }),
  event('selection-event-a', 'Evento con coanfitrión A', 'https://catalog.example/register/shared', '2099-04-01T12:00:00.000Z'),
  event('selection-event-b', 'Evento con coanfitrión B', 'https://catalog.example/register/shared', '2099-04-01T12:00:00.000Z'),
  event('selection-event-past', 'Evento terminado', 'https://catalog.example/register/past', '2020-04-01T12:00:00.000Z'),
];

const creatorState = {
  profiles: [
    { id: 'selection-profile-visible', published: true, hidden: false },
    { id: 'selection-profile-private', published: false, hidden: false },
  ],
  placements: [
    { profileId: 'selection-profile-visible', resourceId: 'selection-creator-visible', selected: true },
    { profileId: 'selection-profile-visible', resourceId: 'selection-creator-unselected', selected: false },
    { profileId: 'selection-profile-private', resourceId: 'selection-creator-private-profile', selected: true },
  ],
};

const expectedById = new Map([
  ['selection-content', { id: 'selection-content', title: 'Artículo público', url: 'https://catalog.example/content', tipo: 'content' }],
  ['selection-source', { id: 'selection-source', title: 'Canal público', url: 'https://catalog.example/source', tipo: 'source' }],
  ['selection-community', { id: 'selection-community', title: 'Comunidad pública', url: 'https://catalog.example/community', tipo: 'community' }],
  ['selection-creator-visible', { id: 'selection-creator-visible', title: 'Ficha pública elegible', url: 'https://catalog.example/creator-visible', tipo: 'content' }],
  ['selection-event-a', { id: 'selection-event-a', title: 'Evento con coanfitrión A', url: 'https://catalog.example/register/shared', tipo: 'event' }],
  ['selection-event-b', { id: 'selection-event-b', title: 'Evento con coanfitrión B', url: 'https://catalog.example/register/shared', tipo: 'event' }],
  ['selection-event-past', { id: 'selection-event-past', title: 'Evento terminado', url: 'https://catalog.example/register/past', tipo: 'event' }],
]);

async function compileRoute(outputPath) {
  await build({
    entryPoints: [routePath],
    outfile: outputPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
  });
  return (await import(pathToFileURL(outputPath).href)).GET;
}

async function writeFixture(name, rows) {
  const fixturePath = path.join(tempDir, name);
  await writeFile(fixturePath, JSON.stringify({ items: rows, ...creatorState }));
  return fixturePath;
}

function selectionRowsById(entries) {
  return [...entries].sort((left, right) => left.id.localeCompare(right.id));
}

function publicSelectionRows(records) {
  return selectionRowsById(records.map((record) => ({
    id: record.id,
    title: record.title,
    url: record.recordType === 'event' ? record.registrationUrl : record.url,
    tipo: record.recordType === 'event' ? 'event' : record.kind ?? 'content',
  })));
}

after(async () => {
  for (const [name, value] of Object.entries(originalCatalogEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(tempDir, { recursive: true, force: true });
});

test('el endpoint compilado publica una fila mínima por recurso elegible y conserva cada evento', async () => {
  const firstFixture = await writeFixture('catalog-order-a.json', catalogRows);
  const secondFixture = await writeFixture('catalog-order-b.json', [...catalogRows].reverse());
  process.env.CATALOG_FIXTURE = firstFixture;
  delete process.env.CATALOG_TABLE;
  delete process.env.CREATOR_PROFILES_TABLE;
  const firstPublicProjection = publicSelectionRows(await loadCatalog());
  const expected = [...expectedById.values()].sort((left, right) => left.id.localeCompare(right.id));
  assert.deepEqual(firstPublicProjection, expected, 'the contrastive fixtures are valid in the existing public catalog projection');

  process.env.CATALOG_FIXTURE = secondFixture;
  const permutedPublicProjection = publicSelectionRows(await loadCatalog());
  assert.deepEqual(permutedPublicProjection, expected, 'the reverse fixture order keeps the same eligible records');

  let getSelection;
  try {
    getSelection = await compileRoute(path.join(tempDir, 'catalog-selection-a.mjs'));
  } catch (error) {
    assert.fail(`falta compilar la ruta pública src/pages/catalog-selection.json.ts: ${error.message}`);
  }
  assert.equal(typeof getSelection, 'function');

  process.env.CATALOG_FIXTURE = firstFixture;
  const response = await getSelection();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/i);
  assert.doesNotMatch(response.headers.get('cache-control') ?? '', /private|no-store/i,
    'the selection index is a public static artifact, not a private creator response');
  const entries = await response.json();
  assert.ok(Array.isArray(entries), 'the public selection route returns an array, not a manifest or grouped events');

  assert.deepEqual(selectionRowsById(entries), expected);
  assert.equal(new Set(entries.map(({ id }) => id)).size, entries.length, 'cohost records keep distinct IDs without duplicate rows');
  assert.equal(entries.length, expectedById.size, 'eligible rows are neither dropped nor duplicated');
  assert.deepEqual([...entries].filter(({ tipo }) => tipo === 'event').map(({ id }) => id).sort(), [
    'selection-event-a', 'selection-event-b', 'selection-event-past',
  ], 'cohosts and ended events remain individually selectable');
  assert.deepEqual([...new Set(entries.map(({ tipo }) => tipo))].sort(), ['community', 'content', 'event', 'source']);
  assert.ok(entries.every((entry) => Object.keys(entry).sort().join(',') === 'id,tipo,title,url'),
    'each row contains exactly id, title, URL, and type');
  assert.doesNotMatch(JSON.stringify(entries), /selection-private-account-sentinel|selection-private-email-sentinel|selection-private-evidence-sentinel|selection-private-moderation-sentinel|selection-creator-unselected|selection-creator-private-profile|selection-hidden|selection-revoked|selection-unpublished/u);

  const secondGetSelection = await compileRoute(path.join(tempDir, 'catalog-selection-b.mjs'));
  process.env.CATALOG_FIXTURE = secondFixture;
  const permutedResponse = await secondGetSelection();
  assert.equal(permutedResponse.status, 200);
  const permutedEntries = await permutedResponse.json();
  assert.deepEqual(selectionRowsById(permutedEntries), expected,
    'a fresh compiled route uses the reversed fixture but yields the same public rows; catalog ordering itself is unconstrained');
  assert.equal(permutedEntries.length, entries.length);
});

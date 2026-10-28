import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  seedResource,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';
import { loadCatalog } from '../src/lib/catalog.mjs';
import { currentUrlKey } from '../src/lib/catalog-url.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = path.join(root, '.work/creator-owner-experience/delivery/phase6/backend');
await mkdir(scratch, { recursive: true });
const tempDir = await mkdtemp(path.join(scratch, 'reference-boundaries-'));
const priorCatalogEnvironment = Object.fromEntries(
  ['CATALOG_FIXTURE', 'CATALOG_TABLE', 'CREATOR_PROFILES_TABLE'].map((name) => [name, process.env[name]]),
);

const publicResource = (id, url) => ({
  id,
  title: `Recurso ${id}`,
  url,
  description: 'Descripción pública',
  category: 'Otros',
  order: 1,
  featured: false,
  kind: 'content',
  format: 'Artículo',
  topics: [],
  published: true,
});

async function creatorApi(harness, pathname, { method = 'GET', body } = {}) {
  return callApi(harness, pathname, {
    session: 'creator-a',
    csrf: sessionCsrf['creator-a'],
    method,
    ...(body === undefined ? {} : { body }),
  });
}

async function createProfile(harness) {
  const response = await creatorApi(harness, '/api/creador/perfil', {
    method: 'PUT', body: { displayName: 'Ana', slug: 'ana-reference-boundaries', programs: [], socials: {} },
  });
  assert.equal(response.status, 200);
  return (await responseJson(response)).profile;
}

async function compileSelectionRoute(outputPath) {
  await build({
    entryPoints: [path.join(root, 'src/pages/catalog-selection.json.ts')],
    outfile: outputPath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
  });
  return (await import(pathToFileURL(outputPath).href)).GET;
}

after(async () => {
  for (const [name, value] of Object.entries(priorCatalogEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  await rm(tempDir, { recursive: true, force: true });
});

test('IDs válidos publicados por el índice siguen siendo referenciables sin imponer formato ni máximo ajeno', async () => {
  const ids = ['legacy.guide', 'r'.repeat(129)];
  const resources = ids.map((id, index) => publicResource(id, `https://catalog.example/boundary-${index}`));
  const fixturePath = path.join(tempDir, 'catalog.json');
  await writeFile(fixturePath, JSON.stringify(resources));
  process.env.CATALOG_FIXTURE = fixturePath;
  delete process.env.CATALOG_TABLE;
  delete process.env.CREATOR_PROFILES_TABLE;

  const projected = await loadCatalog();
  assert.deepEqual(projected.map(({ id }) => id).sort(), [...ids].sort(),
    'the existing public catalog projection accepts dot IDs and IDs longer than 128 ASCII characters');
  const getSelection = await compileSelectionRoute(path.join(tempDir, 'catalog-selection.mjs'));
  const selectionResponse = await getSelection();
  assert.equal(selectionResponse.status, 200);
  const selection = await selectionResponse.json();
  assert.deepEqual(selection.map(({ id, url, tipo }) => ({ id, url, tipo })).sort((left, right) => left.id.localeCompare(right.id)), [
    { id: ids[0], url: resources[0].url, tipo: 'content' },
    { id: ids[1], url: resources[1].url, tipo: 'content' },
  ].sort((left, right) => left.id.localeCompare(right.id)));

  const harness = await createCreatorPagesHarness();
  let profile = await createProfile(harness);
  for (const selected of selection) {
    const resource = resources.find(({ id }) => id === selected.id);
    await seedResource(harness.store, resource);
    const response = await creatorApi(harness, '/api/creador/referencias', {
      method: 'POST',
      body: { resourceId: selected.id, url: selected.url, profileVersion: profile.version },
    });
    assert.equal(response.status, 201, `${selected.id} from the public selection index is referenceable`);
    const result = await responseJson(response);
    assert.equal(result.link.resourceId, selected.id);
    assert.equal(result.link.url, selected.url);
    assert.equal(await harness.store.get(`editor:${profile.id}:${selected.id}`), null,
      'reference does not grant edit authority for either ID shape');
    profile = (await responseJson(await creatorApi(harness, '/api/creador/perfil'))).profile;
  }
  assert.equal((await harness.store.list(`placement:${profile.id}:`)).length, 2);
});

test('la ruta de referencia rechaza version aunque el validador compartido lo permita en otras rutas', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const resource = publicResource('reference-extra-version', 'https://catalog.example/extra-version');
  await seedResource(harness.store, resource);
  const stateBefore = {
    profile: await harness.store.get(`profile:${profile.id}`),
    resource: await harness.store.get(`resource:${resource.id}`),
    reservation: await harness.store.get(currentUrlKey(resource.url)),
    placements: await harness.store.list(`placement:${profile.id}:`),
    editorReferences: await harness.store.list(`editor:${profile.id}:`),
  };

  const response = await creatorApi(harness, '/api/creador/referencias', {
    method: 'POST',
    body: {
      resourceId: resource.id,
      url: resource.url,
      profileVersion: profile.version,
      version: 999,
    },
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await responseJson(response), { error: 'UNKNOWN_FIELD', message: 'unsupported field: version' });
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.deepEqual({
    profile: await harness.store.get(`profile:${profile.id}`),
    resource: await harness.store.get(`resource:${resource.id}`),
    reservation: await harness.store.get(currentUrlKey(resource.url)),
    placements: await harness.store.list(`placement:${profile.id}:`),
    editorReferences: await harness.store.list(`editor:${profile.id}:`),
  }, stateBefore);
});

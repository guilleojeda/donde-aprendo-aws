import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { test } from 'node:test';
import { createCreatorOwnerRuntime } from './fixtures/creator-owner-runtime.mjs';
import { seedResource } from './fixtures/creator-pages.mjs';
import { CREATOR_CONTRACT_VERSION } from '../src/lib/creator-values.mjs';

async function loadBundledModule(path) {
  const { outputFiles } = await build({
    entryPoints: [new URL(path, import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const ownerData = await loadBundledModule('../src/lib/creator-owner-data.ts');
const ownerCommands = await loadBundledModule('../src/lib/creator-owner-commands.ts');

function resource({ id, title = id, url = `https://example.test/${id}`, ...overrides }) {
  return {
    id,
    title,
    url,
    description: `Descripción de ${title}`,
    published: false,
    hidden: false,
    version: 1,
    ...overrides,
  };
}

async function createProfile(runtime, slug = 'read-current-contract') {
  runtime.setSession('creator-a');
  const response = await runtime.fetchApi('/api/creador/perfil/', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-a',
      'x-creator-contract': CREATOR_CONTRACT_VERSION,
    },
    body: JSON.stringify({ creatorVersion: null, displayName: 'Ana', slug }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.equal(body.disposition, 'created');
  return body.profileId;
}

/**
 * Seeds the current owner-read matrix without bypassing the public service read.
 * The matrix distinguishes every classification state, active and retained
 * ownership, and the independent placement and chapter sequences.
 */
async function seedOwnerReadMatrix(runtime, profileId) {
  const rows = [
    resource({
      id: 'resource-explicit',
      title: 'Clasificación explícita',
      category: 'Seguridad',
      kind: 'content',
      format: 'Artículo',
      topics: ['Seguridad'],
      directoryControl: 'creator',
      editorProfileId: profileId,
    }),
    resource({
      id: 'resource-legacy',
      title: 'Ficha histórica',
      category: 'Blog',
      directoryControl: 'creator',
      editorProfileId: profileId,
    }),
    resource({
      id: 'resource-absent',
      title: 'Ficha sin clasificar',
      directoryControl: 'creator',
      editorProfileId: profileId,
    }),
    resource({
      id: 'resource-invalid',
      title: 'Ficha con clasificación inválida',
      category: 'Seguridad',
      kind: 'source',
      format: 'Artículo',
      topics: [],
      directoryControl: 'creator',
      editorProfileId: profileId,
    }),
    resource({
      id: 'resource-event',
      title: 'Evento de la comunidad',
      recordType: 'event',
      registrationUrl: 'https://events.example.test/read-current-contract',
      kind: 'not-a-kind',
      format: 'not-a-format',
      topics: ['not-a-topic'],
      directoryControl: 'editorial',
    }),
    resource({
      id: 'resource-approved',
      title: 'Ficha aprobada',
      category: 'Seguridad',
      kind: 'content',
      format: 'Artículo',
      topics: ['Seguridad'],
      published: true,
      directoryControl: 'creator',
      editorProfileId: profileId,
    }),
    resource({
      id: 'resource-other-owner',
      title: 'Ficha de otra autoridad',
      category: 'Seguridad',
      kind: 'content',
      format: 'Artículo',
      topics: ['Seguridad'],
      directoryControl: 'creator',
      editorProfileId: 'another-profile',
    }),
    resource({
      id: 'resource-featured',
      title: 'Ficha destacada pendiente',
      category: 'Seguridad',
      kind: 'content',
      format: 'Artículo',
      topics: ['Seguridad'],
      directoryControl: 'creator',
      editorProfileId: profileId,
    }),
  ];
  for (const row of rows) await seedResource(runtime.pages.store, row);

  const retained = resource({
    id: 'resource-retained',
    title: 'Ficha retirada conservada',
    category: 'Blog',
    directoryControl: 'creator',
    editorProfileId: profileId,
  });
  await seedResource(runtime.pages.store, retained);

  const profileKey = `profile:${profileId}`;
  const before = await runtime.pages.store.get(profileKey);
  const placements = Object.fromEntries(rows.map(({ id }) => [
    `placement-${id}`,
    { resourceId: id, selectedForDirectory: true },
  ]));
  const featured = ['placement-resource-featured'];
  const ordinary = rows
    .map(({ id }) => `placement-${id}`)
    .filter((id) => !featured.includes(id));
  const series = {
    'series-current-contract': {
      name: 'Serie de contrato actual',
      slug: 'serie-contrato-actual',
      chapters: ['placement-resource-featured', 'placement-resource-explicit'],
    },
  };
  const updated = {
    ...before,
    version: before.version + 1,
    placements,
    order: { featured, ordinary },
    series,
  };
  assert.equal(await runtime.pages.store.transact({
    checks: [{ key: profileKey, version: before.version }],
    puts: [{ key: profileKey, value: updated }, {
      key: `editor:${profileId}:${retained.id}`,
      value: { recordType: 'editorReference', profileId, resourceId: retained.id, version: 1 },
    }],
  }), true);
  return { rows, retained, placementIds: ordinary, featured, series, creatorVersion: updated.version };
}

async function ownerGet(runtime, headers = {}) {
  const response = await runtime.fetchApi('/api/creador/perfil/', { headers });
  assert.equal(response.status, 200, await response.clone().text());
  return { response, body: await response.json() };
}

function assertCurrentOwnerSnapshot(body, matrix) {
  assert.equal(body.schemaVersion, 3, 'the owner read uses the single current schema');
  assert.strictEqual(ownerData.readCreatorOwnerSnapshot(body), body,
    'the strict current owner parser accepts the service observation used by SSR');
  assert.deepEqual(Object.keys(body.placements).sort(), [
    ...matrix.rows.map(({ id }) => `placement-${id}`),
  ].sort(), 'active placement identities are unchanged');
  assert.deepEqual(body.order, { featured: matrix.featured, ordinary: matrix.placementIds },
    'featured and ordinary order remain independent and intact');
  assert.deepEqual(body.series, matrix.series, 'series chapter identities and order remain intact');

  const byId = new Map(body.resources.map((item) => [item.id, item]));
  assert.deepEqual([...byId.keys()].sort(), [
    ...matrix.rows.map(({ id }) => id), matrix.retained.id,
  ].sort(), 'the read keeps active and authorized retained resource IDs');
  const classifications = {
    'resource-explicit': { state: 'explicit', kind: 'content', format: 'Artículo', topics: ['Seguridad'] },
    'resource-legacy': { state: 'legacy', kind: 'source', format: 'Blog', topics: [] },
    'resource-absent': { state: 'absent' },
    'resource-invalid': { state: 'invalid' },
    'resource-event': { state: 'event' },
    'resource-approved': { state: 'explicit', kind: 'content', format: 'Artículo', topics: ['Seguridad'] },
    'resource-other-owner': { state: 'explicit', kind: 'content', format: 'Artículo', topics: ['Seguridad'] },
    'resource-featured': { state: 'explicit', kind: 'content', format: 'Artículo', topics: ['Seguridad'] },
    'resource-retained': { state: 'legacy', kind: 'source', format: 'Blog', topics: [] },
  };
  for (const [id, expected] of Object.entries(classifications)) {
    assert.deepEqual(byId.get(id)?.classification, expected, `${id} keeps its current classification state`);
  }
  for (const [id, expected] of Object.entries({
    'resource-explicit': true,
    'resource-legacy': true,
    'resource-absent': true,
    'resource-invalid': true,
    'resource-event': false,
    'resource-approved': false,
    'resource-other-owner': false,
    'resource-featured': true,
    'resource-retained': true,
  })) {
    assert.equal(byId.get(id)?.classificationEditable, expected,
      `${id} keeps the effective classification permission`);
  }
  for (const [id, expected] of Object.entries({
    'resource-explicit': true,
    'resource-legacy': true,
    'resource-absent': true,
    'resource-invalid': true,
    'resource-event': false,
    'resource-approved': true,
    'resource-other-owner': false,
    'resource-featured': true,
    'resource-retained': true,
  })) {
    assert.equal(byId.get(id)?.metadataEditable, expected,
      `${id} keeps the effective metadata permission`);
  }
  for (const row of matrix.rows) {
    assert.equal(byId.get(row.id)?.reincludeAllowed, false,
      `${row.id} remains an active placement without reinclude permission`);
  }
  assert.equal(byId.get('resource-retained')?.reincludeAllowed, true,
    'retained resources keep their reinclude permission');
  assert.equal(byId.get('resource-event')?.metadataEditable, false,
    'event resources do not expose ordinary metadata authority');
  assert.equal(byId.get('resource-other-owner')?.metadataEditable, false,
    'a placement does not grant another owner metadata authority');
}

test('the service default and every GET contract header return the same current owner observation', async () => {
  const runtime = await createCreatorOwnerRuntime();
  const profileId = await createProfile(runtime);
  const matrix = await seedOwnerReadMatrix(runtime, profileId);

  const explicitCurrent = await ownerGet(runtime, { 'x-creator-contract': '3' });
  assertCurrentOwnerSnapshot(explicitCurrent.body, matrix);
  const context = await runtime.auth.getRequestContext(runtime.request('/cuenta/', { session: 'creator-a' }));
  const serviceDefault = await runtime.service.readCreatorEditor(context);
  assertCurrentOwnerSnapshot(serviceDefault, matrix);

  const observations = [];
  for (const headers of [{ 'x-creator-contract': '3' }, {}, { 'x-creator-contract': '2' }, { 'x-creator-contract': 'unknown' }]) {
    const { body } = await ownerGet(runtime, headers);
    assertCurrentOwnerSnapshot(body, matrix);
    observations.push(body);
  }
  for (const body of observations) assert.deepEqual(body, serviceDefault,
    'HTTP and service/SSR-comparable reads expose the same current observation');
});

test('a confirmed current write uses the schema2 receipt and current readback without replay', async () => {
  const runtime = await createCreatorOwnerRuntime();
  const profileId = await createProfile(runtime, 'read-current-contract-receipt');
  const matrix = await seedOwnerReadMatrix(runtime, profileId);
  const { body: before } = await ownerGet(runtime);
  const placementId = 'placement-resource-explicit';
  const resourceId = before.placements[placementId].resourceId;
  const resource = before.resources.find(({ id }) => id === resourceId);
  const transactionsBeforeWrite = runtime.pages.store.calls.filter(({ operation }) => operation === 'transact').length;

  const response = await runtime.fetchApi(`/api/creador/enlaces/${encodeURIComponent(placementId)}/editar/`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-a',
      'x-creator-contract': CREATOR_CONTRACT_VERSION,
    },
    body: JSON.stringify({
      creatorVersion: before.creatorVersion,
      resourceVersion: resource.version,
      title: 'Guardado confirmado',
    }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const rawReceipt = await response.clone().json();
  assert.equal(rawReceipt.schemaVersion, 2, 'the existing current write receipt remains schema2');
  const receipt = await ownerCommands.readCreatorOwnerAcknowledgement(response.clone(), {
    operation: 'edit-link',
    profileId,
    creatorVersion: before.creatorVersion,
    resourceVersion: resource.version,
    target: { resourceId, placementId },
  });
  assert.equal(receipt.kind, 'confirmed');
  const transactionsAfterWrite = runtime.pages.store.calls.filter(({ operation }) => operation === 'transact').length;
  assert.ok(transactionsAfterWrite > transactionsBeforeWrite, 'the confirmed command committed through storage');

  const storedProfile = await runtime.pages.store.get(`profile:${profileId}`);
  const storedResource = await runtime.pages.store.get(`resource:${resourceId}`);
  assert.equal(storedProfile.schemaVersion, 2, 'persisted creator state keeps storage schema2');
  assert.equal(storedResource.title, 'Guardado confirmado');
  assert.ok(storedResource.version >= receipt.resourceVersionFloor);

  const { body: after } = await ownerGet(runtime);
  assertCurrentOwnerSnapshot(after, matrix);
  assert.deepEqual(after.placements, before.placements, 'the readback does not rewrite placement identities');
  assert.deepEqual(after.order, before.order, 'the readback preserves order');
  assert.deepEqual(after.series, before.series, 'the readback preserves series');
  const committed = after.resources.find(({ id }) => id === resourceId);
  assert.equal(committed.title, 'Guardado confirmado');
  assert.ok(committed.version >= receipt.resourceVersionFloor);
  assert.equal(runtime.pages.store.calls.filter(({ operation }) => operation === 'transact').length,
    transactionsAfterWrite, 'confirmed readback does not replay the write');
});

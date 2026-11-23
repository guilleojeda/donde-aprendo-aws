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

const LEGACY_OWNER_KEYS = [
  'schemaVersion', 'creatorVersion', 'profile', 'resources', 'placements', 'order', 'series', 'claims',
];
const LEGACY_RESOURCE_KEYS = [
  'id', 'version', 'title', 'url', 'hidden', 'directoryApproval', 'metadataEditable', 'reincludeAllowed',
];

function sortedKeys(value) {
  return Object.keys(value).sort();
}

/**
 * Independent v2 wire assertion. This intentionally does not call the v3
 * resolver or reproduce its classification rules; it only freezes the shape
 * consumed by the deployed owner v2 client.
 */
function assertLegacyOwnerSnapshot(snapshot, expected) {
  assert.deepEqual(sortedKeys(snapshot), [...LEGACY_OWNER_KEYS].sort(), 'v2 keeps its exact top-level keys');
  assert.equal(snapshot.schemaVersion, 2);
  assert.ok(snapshot.creatorVersion === null
    || Number.isSafeInteger(snapshot.creatorVersion) && snapshot.creatorVersion >= 0,
  'v2 keeps a safe aggregate revision');
  assert.ok(snapshot.profile === null || typeof snapshot.profile === 'object');
  assert.ok(Array.isArray(snapshot.resources));
  for (const resource of snapshot.resources) {
    const keys = sortedKeys(resource);
    assert.ok(keys.every((key) => [...LEGACY_RESOURCE_KEYS, 'description'].includes(key)),
      `v2 resource ${resource.id} has no fields outside its legacy shape`);
    for (const key of LEGACY_RESOURCE_KEYS) assert.equal(Object.hasOwn(resource, key), true,
      `v2 resource ${resource.id} retains required ${key}`);
    assert.ok(Number.isSafeInteger(resource.version) && resource.version >= 0,
      `v2 resource ${resource.id} keeps a safe resource revision`);
    if (Object.hasOwn(resource, 'description')) assert.equal(typeof resource.description, 'string');
    assert.equal(Object.hasOwn(resource, 'classification'), false);
    assert.equal(Object.hasOwn(resource, 'classificationEditable'), false);
  }
  if (expected) assert.deepEqual(snapshot, expected, 'v2 preserves the complete legacy envelope and projected values');
}

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

function expectedLegacyOwnerSnapshot({ profileId, slug, rows, creatorVersion, featured, ordinary }) {
  const directoryApproval = new Map(rows.map(({ id }) => [id, id === 'resource-approved' ? 'approved' : 'pending']));
  const metadataEditable = new Map(rows.map(({ id }) => [id, !['resource-event', 'resource-other-owner'].includes(id)]));
  return {
    schemaVersion: 2,
    creatorVersion,
    profile: {
      id: profileId, displayName: 'Ana', slug, bio: '', programs: [], socials: {}, published: false, hidden: false,
    },
    resources: rows.map((row) => ({
      id: row.id,
      version: 1,
      title: row.title,
      url: row.recordType === 'event' ? row.registrationUrl : row.url,
      description: row.description,
      hidden: false,
      directoryApproval: directoryApproval.get(row.id),
      metadataEditable: metadataEditable.get(row.id),
      reincludeAllowed: false,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    placements: Object.fromEntries(rows.map(({ id }) => [
      `placement-${id}`,
      { resourceId: id, selectedForDirectory: true },
    ])),
    order: { featured, ordinary },
    series: {},
    claims: [],
  };
}

async function createProfile(runtime, slug = 'read-compatibility') {
  runtime.setSession('creator-a');
  const response = await runtime.fetchApi('/api/creador/perfil/', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-a',
      // Setup follows the active writer contract; only the compatibility reads
      // below pin the old v2 discriminator.
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
 * Seeds rows only to arrange the read matrix. The behavior under test is the
 * service HTTP projection and its contract negotiation, not writer setup.
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
      registrationUrl: 'https://events.example.test/read-compatibility',
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
  const updated = {
    ...before,
    version: before.version + 1,
    placements,
    order: { featured, ordinary },
  };
  assert.equal(await runtime.pages.store.transact({
    checks: [{ key: profileKey, version: before.version }],
    puts: [{ key: profileKey, value: updated }],
  }), true);
  return { rows, placementIds: ordinary, featured, creatorVersion: updated.version };
}

async function ownerGet(runtime, headers = {}) {
  const response = await runtime.fetchApi('/api/creador/perfil/', { headers });
  assert.equal(response.status, 200, await response.clone().text());
  return { response, body: await response.json() };
}

test('owner HTTP reads without a header and with explicit v2 preserve the exact v2 shape for classified and event rows', async () => {
  const runtime = await createCreatorOwnerRuntime();
  const slug = 'read-compatibility';
  const profileId = await createProfile(runtime, slug);
  const matrix = await seedOwnerReadMatrix(runtime, profileId);
  const expected = expectedLegacyOwnerSnapshot({ profileId, slug, rows: matrix.rows,
    creatorVersion: matrix.creatorVersion, featured: matrix.featured, ordinary: matrix.placementIds });

  const withoutHeader = await ownerGet(runtime);
  const explicitV2 = await ownerGet(runtime, { 'x-creator-contract': '2' });
  assert.deepEqual(explicitV2.body, withoutHeader.body, 'implicit and explicit v2 reads are byte-equivalent JSON values');
  assertLegacyOwnerSnapshot(withoutHeader.body, expected);
  assertLegacyOwnerSnapshot(explicitV2.body, expected);
  assert.deepEqual(
    new Set(withoutHeader.body.resources.map(({ id }) => id)),
    new Set(matrix.rows.map(({ id }) => id)),
    'v2 keeps both newly classified ordinary rows and events in the owner resource set',
  );
});

test('owner HTTP v3 resolves explicit, legacy, absent, invalid, and event classifications and derives editability from authority plus pending non-event resource', async () => {
  const runtime = await createCreatorOwnerRuntime();
  const profileId = await createProfile(runtime, 'read-compatibility-v3');
  await seedOwnerReadMatrix(runtime, profileId);

  const { body } = await ownerGet(runtime, { 'x-creator-contract': '3' });
  assert.equal(body.schemaVersion, 3);
  assert.strictEqual(ownerData.readCreatorOwnerSnapshot(body), body,
    'the current owner parser accepts the negotiated v3 response');
  const byId = new Map(body.resources.map((item) => [item.id, item]));

  assert.deepEqual(byId.get('resource-explicit')?.classification, {
    state: 'explicit', kind: 'content', format: 'Artículo', topics: ['Seguridad'],
  });
  assert.deepEqual(byId.get('resource-legacy')?.classification, {
    state: 'legacy', kind: 'source', format: 'Blog', topics: [],
  });
  assert.deepEqual(byId.get('resource-absent')?.classification, { state: 'absent' });
  assert.deepEqual(byId.get('resource-invalid')?.classification, { state: 'invalid' });
  assert.deepEqual(byId.get('resource-event')?.classification, { state: 'event' });

  assert.equal(byId.get('resource-explicit')?.classificationEditable, true);
  assert.equal(byId.get('resource-legacy')?.classificationEditable, true);
  assert.equal(byId.get('resource-absent')?.classificationEditable, true);
  assert.equal(byId.get('resource-invalid')?.classificationEditable, true);
  assert.equal(byId.get('resource-event')?.classificationEditable, false,
    'event rows are not ordinary taxonomy edits even when they are visible to the owner');
  assert.equal(byId.get('resource-approved')?.classificationEditable, false,
    'approval removes creator classification authority');
  assert.equal(byId.get('resource-other-owner')?.classificationEditable, false,
    'a matching placement without exact resource authority is not editable');
  assert.equal(byId.get('resource-featured')?.classificationEditable, true,
    'a featured placement remains editable when the resource is pending and creator-owned');
});

test('an actual current write returns a schema2 receipt and an old v2 read reconciles its committed revision and fields', async () => {
  const runtime = await createCreatorOwnerRuntime();
  const slug = 'read-compatibility-recovery';
  const profileId = await createProfile(runtime, slug);
  const matrix = await seedOwnerReadMatrix(runtime, profileId);
  const { placementIds } = matrix;
  const { body: currentSnapshot } = await ownerGet(runtime, { 'x-creator-contract': CREATOR_CONTRACT_VERSION });
  const snapshot = ownerData.readCreatorOwnerSnapshot(currentSnapshot);
  const placementId = placementIds[0];
  const resourceId = snapshot.placements[placementId].resourceId;
  const resource = snapshot.resources.find(({ id }) => id === resourceId);

  const response = await runtime.fetchApi(`/api/creador/enlaces/${encodeURIComponent(placementId)}/editar/`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-a',
      'x-creator-contract': CREATOR_CONTRACT_VERSION,
    },
    body: JSON.stringify({
      creatorVersion: snapshot.creatorVersion,
      resourceVersion: resource.version,
      title: 'Guardado confirmado',
    }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const receipt = await ownerCommands.readCreatorOwnerAcknowledgement(response.clone(), {
    operation: 'edit-link',
    profileId,
    creatorVersion: snapshot.creatorVersion,
    resourceVersion: resource.version,
    target: { resourceId, placementId },
  });
  assert.equal(receipt.kind, 'confirmed', 'the existing v2 receipt decoder accepts the actual committed receipt');

  const { body: oldSnapshot } = await ownerGet(runtime, { 'x-creator-contract': '2' });
  const expectedAfterWrite = expectedLegacyOwnerSnapshot({ profileId, slug, rows: matrix.rows,
    creatorVersion: receipt.creatorVersionFloor, featured: matrix.featured, ordinary: matrix.placementIds });
  const expectedCommitted = expectedAfterWrite.resources.find(({ id }) => id === resourceId);
  expectedCommitted.title = 'Guardado confirmado';
  expectedCommitted.version = receipt.resourceVersionFloor;
  assertLegacyOwnerSnapshot(oldSnapshot, expectedAfterWrite);
  const committed = oldSnapshot.resources.find(({ id }) => id === resourceId);
  assert.equal(committed.title, 'Guardado confirmado');
  assert.ok(oldSnapshot.creatorVersion >= receipt.creatorVersionFloor,
    'the compatible old read reaches at least the receipt creator revision');
  assert.ok(committed.version >= receipt.resourceVersionFloor,
    'the compatible old read reaches at least the receipt resource revision');
});

test('obsolete v2 add and active direct writes are rejected before any storage effect', async () => {
  const runtime = await createCreatorOwnerRuntime();
  const profileId = await createProfile(runtime, 'read-compatibility-obsolete-write');
  const { placementIds } = await seedOwnerReadMatrix(runtime, profileId);
  const { body: snapshot } = await ownerGet(runtime, { 'x-creator-contract': CREATOR_CONTRACT_VERSION });
  const placementId = placementIds[0];
  const resourceId = snapshot.placements[placementId].resourceId;
  const beforeResource = await runtime.pages.store.get(`resource:${resourceId}`);
  const beforeResources = await runtime.pages.store.list('resource:');
  const beforeReservations = await runtime.pages.store.list('url:');
  const beforeTransactions = runtime.pages.store.calls.filter(({ operation }) => operation === 'transact').length;

  const obsoleteAdd = await runtime.fetchApi('/api/creador/enlaces/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-a',
      'x-creator-contract': '2',
    },
    body: JSON.stringify({
      creatorVersion: snapshot.creatorVersion,
      title: 'No debe crearse',
      url: 'https://example.test/obsolete-add',
      description: 'No debe persistirse',
    }),
  });
  assert.equal(obsoleteAdd.status, 409);
  assert.equal((await obsoleteAdd.json()).error, 'CREATOR_CONTRACT_OBSOLETE');

  const obsoleteDirect = await runtime.fetchApi(`/api/creador/enlaces/${encodeURIComponent(placementId)}/editar/`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'csrf-a',
      'x-creator-contract': '2',
    },
    body: JSON.stringify({
      creatorVersion: snapshot.creatorVersion,
      resourceVersion: beforeResource.version,
      title: 'No debe cambiarse',
    }),
  });
  assert.equal(obsoleteDirect.status, 409);
  assert.equal((await obsoleteDirect.json()).error, 'CREATOR_CONTRACT_OBSOLETE');
  assert.equal(runtime.pages.store.calls.filter(({ operation }) => operation === 'transact').length, beforeTransactions,
    'obsolete add and direct edit are rejected before transactions');
  assert.deepEqual(await runtime.pages.store.get(`resource:${resourceId}`), beforeResource,
    'obsolete direct edit leaves the active resource unchanged');
  assert.deepEqual(await runtime.pages.store.list('resource:'), beforeResources,
    'obsolete add does not create a resource');
  assert.deepEqual(await runtime.pages.store.list('url:'), beforeReservations,
    'obsolete add does not create a URL reservation');
});

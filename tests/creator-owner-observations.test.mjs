import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  seedResource,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';
import { CREATOR_CONTRACT_VERSION } from '../src/lib/creator-values.mjs';

async function api(harness, path, { method = 'GET', body } = {}) {
  return callApi(harness, path, {
    session: 'creator-a',
    csrf: sessionCsrf['creator-a'],
    ...(method === 'GET' ? {} : { creatorContract: CREATOR_CONTRACT_VERSION }),
    method,
    ...(body === undefined ? {} : { body }),
  });
}

async function ownerGet(harness) {
  const response = await api(harness, '/api/creador/perfil');
  assert.equal(response.status, 200);
  const snapshot = await responseJson(response);
  assert.equal(snapshot.schemaVersion, 3);
  assert.ok(Number.isSafeInteger(snapshot.creatorVersion));
  assert.equal(Object.hasOwn(snapshot, 'links'), false);
  assert.equal(Object.hasOwn(snapshot, 'editableResources'), false);
  return snapshot;
}

async function createProfile(harness, slug) {
  const response = await api(harness, '/api/creador/perfil', {
    method: 'PUT', body: { creatorVersion: null, displayName: 'Ana', slug },
  });
  assert.equal(response.status, 200, await response.clone().text());
  const ack = await responseJson(response);
  assert.equal(ack.operation, 'save-profile');
  assert.equal(ack.disposition, 'created');
  assert.equal(ack.schemaVersion, 2);
  return ack;
}

async function addOwnLink(harness, title, slug) {
  const before = await ownerGet(harness);
  const response = await api(harness, '/api/creador/enlaces', {
    method: 'POST', body: {
      creatorVersion: before.creatorVersion,
      title,
      url: `https://example.com/${slug}`,
      description: `Descripción ${title}`,
    },
  });
  assert.equal(response.status, 201, await response.clone().text());
  const ack = await responseJson(response);
  assert.equal(ack.schemaVersion, 2);
  assert.equal(ack.operation, 'add-link');
  assert.equal(ack.disposition, 'resource-created');
  return { ...ack, title };
}

test('owner GET reads the unique active and authorized retained resource union once with current permissions', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'owner-observations');
  const activeOwn = await addOwnLink(harness, 'Ficha propia', 'owner-observed-own');
  const retiredOwn = await addOwnLink(harness, 'Ficha retirada', 'owner-observed-retired');
  const sharedId = 'shared-owner-observation';
  const sharedUrl = 'https://example.com/shared-owner-observation';
  await seedResource(harness.store, {
    id: sharedId,
    title: 'Ficha compartida',
    url: sharedUrl,
    description: 'Gestionada por el catálogo',
    category: 'Artículo',
    kind: 'content',
    format: 'Artículo',
    topics: [],
    order: 1,
    featured: false,
    published: false,
    hidden: false,
    version: 1,
    directoryControl: 'editorial',
  });

  const profileId = (await harness.store.get('account-profile:private-account-a')).profileId;
  const beforeReference = await ownerGet(harness);
  const reference = await api(harness, '/api/creador/referencias', {
    method: 'POST', body: {
      creatorVersion: beforeReference.creatorVersion,
      resourceId: sharedId,
      url: sharedUrl,
    },
  });
  assert.equal(reference.status, 201, await reference.clone().text());
  const referenceAck = await responseJson(reference);
  assert.equal(referenceAck.operation, 'reference-link');
  assert.equal(referenceAck.disposition, 'attached');

  const beforeRemoval = await ownerGet(harness);
  const removed = await api(harness, `/api/creador/enlaces/${retiredOwn.placementId}`, {
    method: 'DELETE', body: { creatorVersion: beforeRemoval.creatorVersion },
  });
  assert.equal(removed.status, 200, await removed.clone().text());
  const removedAck = await responseJson(removed);
  assert.equal(removedAck.operation, 'remove-link');
  assert.equal(removedAck.disposition, 'removed');

  const baseGet = harness.store.get.bind(harness.store);
  const observedBatches = [];
  harness.store.getResources = async (ids) => {
    observedBatches.push([...ids]);
    const resources = new Map();
    for (const id of ids) {
      const resource = await baseGet(`resource:${id}`);
      if (resource) resources.set(id, resource);
    }
    return resources;
  };
  const owner = await ownerGet(harness);

  const requestedIds = [activeOwn.resourceId, sharedId, retiredOwn.resourceId].sort();
  const actualIds = observedBatches.flat().sort();
  const counts = new Map();
  for (const id of actualIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  assert.deepEqual(actualIds, requestedIds, 'one resource batch covers active placements and retained editor references');
  assert.ok([...counts.values()].every((count) => count === 1), 'no resource is observed more than once');

  const resourceById = new Map(owner.resources.map((resource) => [resource.id, resource]));
  assert.deepEqual(new Set(resourceById.keys()), new Set(requestedIds));
  assert.equal(owner.resources.length, 3, 'an active resource and its retained editor reference appear once');
  assert.equal(resourceById.get(activeOwn.resourceId).metadataEditable, true);
  assert.equal(resourceById.get(activeOwn.resourceId).reincludeAllowed, false,
    'metadata rights do not make an active resource eligible for reinclude');
  assert.equal(resourceById.get(retiredOwn.resourceId).metadataEditable, true);
  assert.equal(resourceById.get(retiredOwn.resourceId).reincludeAllowed, true,
    'the retained resource is selectable because its current reference and authority were verified');
  assert.equal(resourceById.get(sharedId).metadataEditable, false,
    'visibility as a placed catalog resource does not grant shared metadata authority');
  assert.equal(resourceById.get(sharedId).reincludeAllowed, false);
  assert.deepEqual(owner.placements[activeOwn.placementId], {
    resourceId: activeOwn.resourceId,
    selectedForDirectory: true,
  });
  assert.equal(Object.hasOwn(owner.placements, retiredOwn.placementId), false);
  assert.equal(owner.order.featured.includes(retiredOwn.placementId), false);
  assert.equal(owner.order.ordinary.includes(retiredOwn.placementId), false);
  assert.ok(Object.values(owner.series).every(({ chapters }) => !chapters.includes(retiredOwn.placementId)),
    'the removed placement is absent from every complete chapter sequence');

  const sharedBefore = await harness.store.get(`resource:${sharedId}`);
  const forbidden = await api(harness, `/api/creador/recursos/?id=${encodeURIComponent(sharedId)}`, {
    method: 'PATCH', body: { resourceVersion: sharedBefore.version, title: sharedBefore.title },
  });
  assert.equal(forbidden.status, 403, 'a non-editor cannot write metadata through a visible catalog placement');
  assert.deepEqual(await harness.store.get(`resource:${sharedId}`), sharedBefore,
    'the permission rejection leaves the raw shared record unchanged');
  assert.equal(owner.profile.id, profileId);
});

test('owner GET uses one read-only batch for placed and retained editor resources', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'owner-batch-union');
  const active = await addOwnLink(harness, 'Ficha activa', 'owner-batch-active');
  const retired = await addOwnLink(harness, 'Ficha retirada', 'owner-batch-retired');
  const before = await ownerGet(harness);
  const removed = await api(harness, `/api/creador/enlaces/${retired.placementId}`, {
    method: 'DELETE', body: { creatorVersion: before.creatorVersion },
  });
  assert.equal(removed.status, 200);

  const expectedIds = [active.resourceId, retired.resourceId].sort();
  const callsBeforeRead = harness.store.calls.length;
  const owner = await ownerGet(harness);
  const readCalls = harness.store.calls.slice(callsBeforeRead);
  const resourceBatches = readCalls.filter(({ operation }) => operation === 'getResources');
  assert.equal(resourceBatches.length, 1, 'the owner read calls the shared batch operation once');
  assert.deepEqual([...resourceBatches[0].input.ids].sort(), expectedIds,
    'the batch covers the placed and retained-resource union');
  assert.equal(new Set(resourceBatches[0].input.ids).size, expectedIds.length);
  assert.equal(readCalls.some(({ operation, input }) => operation === 'get' && input.key.startsWith('resource:')), false,
    'the owner query does not fall back to individual resource reads');
  assert.equal(readCalls.some(({ operation }) => operation === 'transact'), false,
    'the owner query remains read-only');
  assert.deepEqual(new Set(owner.resources.map(({ id }) => id)), new Set(expectedIds));
  assert.equal(owner.placements[active.placementId].resourceId, active.resourceId);
  assert.equal(Object.hasOwn(owner.placements, retired.placementId), false);
  assert.deepEqual(owner.order, { featured: [], ordinary: [active.placementId] });
  assert.equal(owner.resources.find(({ id }) => id === active.resourceId).metadataEditable, true);
  assert.equal(owner.resources.find(({ id }) => id === retired.resourceId).reincludeAllowed, true);
});

test('owner GET fails closed when an authorized retained reference points to a missing resource', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'owner-missing-retired-resource');
  const retired = await addOwnLink(harness, 'Ficha retirada ausente', 'owner-missing-retired');
  const before = await ownerGet(harness);
  const removed = await api(harness, `/api/creador/enlaces/${retired.placementId}`, {
    method: 'DELETE', body: { creatorVersion: before.creatorVersion },
  });
  assert.equal(removed.status, 200);

  const resourceKey = `resource:${retired.resourceId}`;
  const resource = await harness.store.get(resourceKey);
  assert.equal(await harness.store.transact({
    checks: [{ key: resourceKey, version: resource.version }],
    deletes: [resourceKey],
  }), true);
  const response = await api(harness, '/api/creador/perfil');
  assert.equal(response.status, 503, 'a missing selected editor resource cannot produce a partial owner DTO');
  assert.equal((await responseJson(response)).error, 'MISSING_RESOURCE');
});

test('one owner snapshot keeps the resource value returned by its batch while a later GET observes the edit', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'owner-observation-race');
  const created = await addOwnLink(harness, 'Antes de la edición', 'owner-observation-race-resource');
  const baseGet = harness.store.get.bind(harness.store);
  const batches = [];
  let intervened = false;
  harness.store.getResources = async (ids) => {
    batches.push([...ids]);
    const observed = new Map();
    for (const id of ids) {
      const resource = await baseGet(`resource:${id}`);
      if (resource) observed.set(id, resource);
    }
    const target = observed.get(created.resourceId);
    if (!intervened && target) {
      intervened = true;
      const edit = await api(harness, `/api/creador/recursos/?id=${encodeURIComponent(created.resourceId)}`, {
        method: 'PATCH', body: { resourceVersion: target.version, title: 'Después de la primera observación' },
      });
      assert.equal(edit.status, 200, 'the concurrent metadata command commits through the real API');
      const ack = await responseJson(edit);
      assert.equal(ack.schemaVersion, 2);
      assert.equal(ack.operation, 'edit-resource');
      assert.equal(ack.resourceVersion, target.version + 1);
      assert.equal(Object.hasOwn(ack, 'creatorVersion'), false,
        'resource-only metadata does not fabricate a creator content revision');
    }
    return observed;
  };

  const first = await ownerGet(harness);
  assert.equal(intervened, true, 'the resource write commits after the batch captured its first value');
  assert.equal(first.resources.find(({ id }) => id === created.resourceId).title, 'Antes de la edición');
  assert.equal(first.resources.find(({ id }) => id === created.resourceId).version, 1);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], [created.resourceId]);

  batches.length = 0;
  const next = await ownerGet(harness);
  const nextResource = next.resources.find(({ id }) => id === created.resourceId);
  assert.equal(nextResource.title, 'Después de la primera observación');
  assert.equal(nextResource.version, 2);
  assert.deepEqual(batches, [[created.resourceId]], 'the next owner GET also uses one unique-resource batch');
});

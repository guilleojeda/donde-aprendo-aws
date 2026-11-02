import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  seedResource,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';

async function api(harness, path, { method = 'GET', body } = {}) {
  return callApi(harness, path, {
    session: 'creator-a',
    csrf: sessionCsrf['creator-a'],
    method,
    ...(body === undefined ? {} : { body }),
  });
}

async function createProfile(harness, slug) {
  const response = await api(harness, '/api/creador/perfil', {
    method: 'PUT', body: { displayName: 'Ana', slug },
  });
  assert.equal(response.status, 200);
  return (await responseJson(response)).profile;
}

async function addOwnLink(harness, title, slug) {
  const response = await api(harness, '/api/creador/enlaces', {
    method: 'POST', body: { title, url: `https://example.com/${slug}`, description: `Descripción ${title}` },
  });
  assert.equal(response.status, 201);
  return responseJson(response);
}

async function ownerGet(harness) {
  const response = await api(harness, '/api/creador/perfil');
  assert.equal(response.status, 200);
  return responseJson(response);
}

function ownerResourceObservation(link) {
  return {
    id: link.resourceId,
    title: link.title,
    url: link.url,
    ...(typeof link.description === 'string' ? { description: link.description } : {}),
    version: link.resourceVersion,
  };
}

test('owner GET observes each placed and editable resource once and keeps shared and retired authority distinct', async () => {
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
  const profile = await harness.store.get(`profile:${profileId}`);
  const reference = await api(harness, '/api/creador/referencias', {
    method: 'POST', body: { resourceId: sharedId, url: sharedUrl, profileVersion: profile.version },
  });
  assert.equal(reference.status, 201);
  const beforeRetirement = await harness.store.get(`profile:${profileId}`);
  const retiredPlacement = await harness.store.get(`placement:${profileId}:${retiredOwn.link.placementId}`);
  const removed = await api(harness, `/api/creador/enlaces/${retiredOwn.link.placementId}`, {
    method: 'DELETE', body: { profileVersion: beforeRetirement.version },
  });
  assert.equal(removed.status, 204);

  const baseGet = harness.store.get.bind(harness.store);
  const observedBatches = [];
  harness.store.getResources = async (ids) => {
    observedBatches.push([...ids]);
    return new Map(await Promise.all(ids.map(async (id) => [id, await baseGet(`resource:${id}`)])));
  };
  const owner = await ownerGet(harness);

  const requestedIds = [activeOwn.link.resourceId, sharedId, retiredOwn.link.resourceId].sort();
  const actualIds = observedBatches.flat().sort();
  const counts = new Map();
  for (const id of actualIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const issues = [];
  if (JSON.stringify(actualIds) !== JSON.stringify(requestedIds)) {
    issues.push(`owner GET resource IDs observed were ${JSON.stringify(actualIds)}; expected ${JSON.stringify(requestedIds)}`);
  }
  if ([...counts.values()].some((count) => count !== 1)) {
    issues.push(`resource observations were duplicated: ${JSON.stringify([...counts])}`);
  }

  const activeLink = owner.links.find(({ resourceId }) => resourceId === activeOwn.link.resourceId);
  const activeEditable = owner.editableResources.find(({ id }) => id === activeOwn.link.resourceId);
  assert.ok(activeLink && activeEditable, 'a placed own resource appears in both owner projections');
  assert.deepEqual(ownerResourceObservation(activeLink), activeEditable,
    'overlapping link and editable-resource DTOs come from the same resource observation');
  assert.equal(owner.links.some(({ resourceId }) => resourceId === retiredOwn.link.resourceId), false);
  assert.deepEqual(owner.editableResources.find(({ id }) => id === retiredOwn.link.resourceId), {
    id: retiredOwn.link.resourceId,
    title: retiredOwn.link.title,
    url: retiredOwn.link.url,
    description: retiredOwn.link.description,
    version: retiredOwn.link.resourceVersion,
  }, 'a removed placement retains only the resource owner’s edit projection');
  assert.equal(owner.links.some(({ resourceId }) => resourceId === sharedId), true,
    'a shared catalog resource remains visible as a placed link');
  assert.equal(owner.editableResources.some(({ id }) => id === sharedId), false,
    'a shared catalog resource does not acquire owner edit authority');
  assert.equal(retiredPlacement.resourceId, retiredOwn.link.resourceId);

  const sharedBefore = await harness.store.get(`resource:${sharedId}`);
  const forbidden = await api(harness, `/api/creador/recursos/${sharedId}`, {
    method: 'PATCH', body: { title: sharedBefore.title, version: sharedBefore.version },
  });
  assert.equal(forbidden.status, 403, 'the shared non-editor cannot write metadata through its visible link');
  assert.deepEqual(await harness.store.get(`resource:${sharedId}`), sharedBefore,
    'a rejected shared-resource write leaves the raw record unchanged');
  assert.deepEqual(issues, [], 'the owner GET reads each selected resource once');
});

test('get-only persistence reads the owner resource union once, including a retired resource', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'owner-get-only-union');
  const active = await addOwnLink(harness, 'Ficha activa', 'owner-get-only-active');
  const retired = await addOwnLink(harness, 'Ficha retirada', 'owner-get-only-retired');
  const profileId = (await harness.store.get('account-profile:private-account-a')).profileId;
  const profile = await harness.store.get(`profile:${profileId}`);
  assert.equal((await api(harness, `/api/creador/enlaces/${retired.link.placementId}`, {
    method: 'DELETE', body: { profileVersion: profile.version },
  })).status, 204);

  const expectedIds = [active.link.resourceId, retired.link.resourceId].sort();
  const baseGet = harness.store.get.bind(harness.store);
  const observedResourceIds = [];
  assert.equal(harness.store.getResources, undefined, 'this harness exercises the generic get-only fallback');
  harness.store.get = async (key) => {
    if (key.startsWith('resource:')) observedResourceIds.push(key.slice('resource:'.length));
    return baseGet(key);
  };

  const owner = await ownerGet(harness);
  assert.deepEqual(observedResourceIds.sort(), expectedIds,
    'the fallback reads each placed or editor-referenced resource exactly once');
  const activeLink = owner.links.find(({ resourceId }) => resourceId === active.link.resourceId);
  const activeEditable = owner.editableResources.find(({ id }) => id === active.link.resourceId);
  const activePlacement = await baseGet(`placement:${profileId}:${active.link.placementId}`);
  const activeResource = await baseGet(`resource:${active.link.resourceId}`);
  assert.deepEqual(activeLink, {
    placementId: activePlacement.id,
    resourceId: activeResource.id,
    title: activeResource.title,
    url: activeResource.url,
    description: activeResource.description,
    featured: activePlacement.featured,
    position: activePlacement.position,
    selectedForDirectory: activePlacement.selectedForDirectory,
    hidden: false,
    series: [],
    directoryApproval: 'pending',
    resourceVersion: activeResource.version,
    placementVersion: activePlacement.version,
  });
  assert.deepEqual(activeEditable, {
    id: activeResource.id,
    title: activeResource.title,
    url: activeResource.url,
    description: activeResource.description,
    version: activeResource.version,
  });
  assert.equal(owner.links.some(({ resourceId }) => resourceId === retired.link.resourceId), false);
  assert.equal(owner.editableResources.some(({ id }) => id === retired.link.resourceId), true);
});

test('owner GET fails closed when a retired editor reference selects a missing resource', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'owner-missing-retired-resource');
  const retired = await addOwnLink(harness, 'Ficha retirada ausente', 'owner-missing-retired');
  const profileId = (await harness.store.get('account-profile:private-account-a')).profileId;
  const profile = await harness.store.get(`profile:${profileId}`);
  assert.equal((await api(harness, `/api/creador/enlaces/${retired.link.placementId}`, {
    method: 'DELETE', body: { profileVersion: profile.version },
  })).status, 204);

  const resourceKey = `resource:${retired.link.resourceId}`;
  const resource = await harness.store.get(resourceKey);
  assert.equal(await harness.store.transact({
    checks: [{ key: resourceKey, version: resource.version }],
    deletes: [resourceKey],
  }), true);
  const response = await api(harness, '/api/creador/perfil');
  assert.equal(response.status, 503, 'a missing selected editor resource cannot produce a partial owner DTO');
  assert.equal((await responseJson(response)).error, 'MISSING_RESOURCE');
});

test('a real metadata write between resource observations cannot split one owner GET', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'owner-observation-race');
  const created = await addOwnLink(harness, 'Antes de la edición', 'owner-observation-race-resource');
  const baseGet = harness.store.get.bind(harness.store);
  const batches = [];
  let intervened = false;
  harness.store.getResources = async (ids) => {
    batches.push([...ids]);
    const observed = new Map(await Promise.all(ids.map(async (id) => [id, await baseGet(`resource:${id}`)])));
    const target = observed.get(created.link.resourceId);
    if (!intervened && target) {
      intervened = true;
      const edit = await api(harness, `/api/creador/recursos/${created.link.resourceId}`, {
        method: 'PATCH', body: { title: 'Después de la primera observación', version: target.version },
      });
      assert.equal(edit.status, 200, 'the concurrent metadata command commits through the real API');
    }
    return observed;
  };

  const first = await ownerGet(harness);
  const firstBatches = [...batches];
  const firstLink = first.links.find(({ resourceId }) => resourceId === created.link.resourceId);
  const firstEditable = first.editableResources.find(({ id }) => id === created.link.resourceId);
  const issues = [];
  if (firstLink?.title !== created.link.title || firstLink?.resourceVersion !== created.link.resourceVersion) {
    issues.push('first link projection did not retain literal BEFORE title/version');
  }
  if (firstEditable?.title !== created.link.title || firstEditable?.version !== created.link.resourceVersion) {
    issues.push('first editable projection did not retain literal BEFORE title/version');
  }
  if (!firstLink || !firstEditable || !isDeepStrictEqual(ownerResourceObservation(firstLink), firstEditable)) {
    issues.push('first owner GET exposed different values or versions for one resource ID');
  }
  const firstCounts = new Map();
  for (const id of firstBatches.flat()) firstCounts.set(id, (firstCounts.get(id) ?? 0) + 1);
  if ([...firstCounts.values()].some((count) => count !== 1) || firstCounts.size !== 1) {
    issues.push(`first owner GET observed the same resource more than once: ${JSON.stringify(firstBatches)}`);
  }
  assert.equal(intervened, true, 'the write happens after the provider returned its first observation');

  batches.length = 0;
  const next = await ownerGet(harness);
  const nextLink = next.links.find(({ resourceId }) => resourceId === created.link.resourceId);
  const nextEditable = next.editableResources.find(({ id }) => id === created.link.resourceId);
  if (nextLink?.title !== 'Después de la primera observación' || nextLink?.resourceVersion !== 2) {
    issues.push('next link projection did not contain literal AFTER title/version');
  }
  if (nextEditable?.title !== 'Después de la primera observación' || nextEditable?.version !== 2) {
    issues.push('next editable projection did not contain literal AFTER title/version');
  }
  if (!nextLink || !nextEditable || !isDeepStrictEqual(ownerResourceObservation(nextLink), nextEditable)) {
    issues.push('the next owner GET did not expose a coherent resource projection');
  }
  assert.equal(nextLink.title, 'Después de la primera observación');
  assert.equal(nextLink.resourceVersion, created.link.resourceVersion + 1);
  const nextCounts = new Map();
  for (const id of batches.flat()) nextCounts.set(id, (nextCounts.get(id) ?? 0) + 1);
  if ([...nextCounts.values()].some((count) => count !== 1) || nextCounts.size !== 1) {
    issues.push(`next owner GET observed the same resource more than once: ${JSON.stringify(batches)}`);
  }
  assert.deepEqual(issues, [], 'one owner GET has one value and version for each resource ID');
});


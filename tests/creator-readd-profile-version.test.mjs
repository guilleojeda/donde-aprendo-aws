import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentUrlKey } from '../src/lib/catalog-url.mjs';
import { callApi, createCreatorPagesHarness, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import { createDynamoMoveHarness } from './fixtures/creator-link-move.mjs';

async function api(harness, path, {
  method = 'GET',
  body,
  session = 'creator-a',
} = {}) {
  const response = await callApi(harness, path, {
    method,
    session,
    csrf: sessionCsrf[session],
    creatorContract: '2',
    ...(body === undefined ? {} : { body }),
  });
  return { response, status: response.status, body: response.status === 204 ? null : await responseJson(response) };
}

async function owner(harness, session = 'creator-a') {
  const result = await api(harness, '/api/creador/perfil/');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.schemaVersion, 2);
  assert.equal(Object.hasOwn(result.body, 'links'), false);
  return result.body;
}

async function createProfile(harness, {
  displayName = 'Ana',
  slug = 'ana-readd-profile-version',
} = {}) {
  const current = await owner(harness);
  const result = await api(harness, '/api/creador/perfil/', {
    method: 'PUT',
    body: {
      creatorVersion: current.profile ? current.creatorVersion : null,
      displayName, slug,
    },
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.operation, 'save-profile');
  return result.body;
}

async function addOwnLink(harness, {
  title = 'Ficha propia',
  url = 'https://example.test/readd-profile-version',
} = {}) {
  const current = await owner(harness);
  const result = await api(harness, '/api/creador/enlaces/', {
    method: 'POST',
    body: { creatorVersion: current.creatorVersion, title, url },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.operation, 'add-link');
  return result.body;
}

function ownerResource(snapshot, resourceId) {
  const resource = snapshot.resources.find(({ id }) => id === resourceId);
  assert.ok(resource, `the full owner read includes resource ${resourceId}`);
  return resource;
}

function placementFor(snapshot, resourceId) {
  const found = Object.entries(snapshot.placements).find(([, placement]) => placement.resourceId === resourceId);
  assert.ok(found, `the owner snapshot has a placement for ${resourceId}`);
  return found;
}

async function storedState(harness, snapshot, resourceId) {
  return {
    profile: await harness.store.get(`profile:${snapshot.profile.id}`),
    resource: await harness.store.get(`resource:${resourceId}`),
    editorReferences: await harness.store.list(`editor:${snapshot.profile.id}:`),
    reservation: await harness.store.get(currentUrlKey(ownerResource(snapshot, resourceId).url)),
  };
}

async function removeLink(harness, placementId) {
  const current = await owner(harness);
  const removed = await api(harness, `/api/creador/enlaces/${encodeURIComponent(placementId)}/`, {
    method: 'DELETE', body: { creatorVersion: current.creatorVersion },
  });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal(removed.body.operation, 'remove-link');
  return owner(harness);
}

test('reinclude sends both observed versions, preserves the stable ID, and installs only the full owner snapshot', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const original = await addOwnLink(harness);

  let observed = await owner(harness);
  const createdSeries = await api(harness, '/api/creador/series/', {
    method: 'POST',
    body: { name: 'Ruta anterior', slug: 'ruta-anterior', creatorVersion: observed.creatorVersion },
  });
  assert.equal(createdSeries.status, 201, JSON.stringify(createdSeries.body));
  assert.equal(createdSeries.body.operation, 'create-series');
  const seriesId = createdSeries.body.seriesId;

  observed = await owner(harness);
  let [placementId] = placementFor(observed, original.resourceId);
  const membership = await api(harness, `/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}/`, {
    method: 'PUT', body: { creatorVersion: observed.creatorVersion },
  });
  assert.equal(membership.status, 200, JSON.stringify(membership.body));
  assert.deepEqual((await owner(harness)).series[seriesId].chapters, [placementId]);

  observed = await removeLink(harness, placementId);
  assert.equal(Object.hasOwn(observed.placements, placementId), false);
  assert.deepEqual(observed.series[seriesId].chapters, [], 'removal clears the departed chapter membership');
  const retained = ownerResource(observed, original.resourceId);
  const changedUrl = 'https://example.test/readd-profile-version-current';
  const urlChange = await api(harness, `/api/creador/recursos/?id=${encodeURIComponent(retained.id)}`, {
    method: 'PATCH', body: { url: changedUrl, resourceVersion: retained.version },
  });
  assert.equal(urlChange.status, 200, JSON.stringify(urlChange.body));
  assert.equal(urlChange.body.operation, 'edit-resource');
  assert.equal(urlChange.body.resourceId, retained.id);

  observed = await owner(harness);
  const currentResource = ownerResource(observed, original.resourceId);
  const beforeReinclude = await storedState(harness, observed, currentResource.id);
  const response = await api(harness, '/api/creador/enlaces/', {
    method: 'POST',
    body: {
      resourceId: currentResource.id,
      resourceVersion: currentResource.version,
      creatorVersion: observed.creatorVersion,
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.deepEqual({ operation: response.body.operation, disposition: response.body.disposition }, {
    operation: 'reinclude-link', disposition: 'attached',
  });
  assert.equal(response.body.resourceId, currentResource.id);
  assert.equal(response.body.placementId, placementId);
  assert.equal(response.body.creatorVersion, observed.creatorVersion + 1);
  assert.equal(Object.hasOwn(response.body, 'link'), false);
  assert.equal(Object.hasOwn(response.body, 'versionChanges'), false);
  const after = await owner(harness);
  assert.equal(after.creatorVersion, response.body.creatorVersion);
  assert.equal(ownerResource(after, currentResource.id).url, changedUrl);
  assert.deepEqual(after.placements[placementId], { resourceId: currentResource.id, selectedForDirectory: true });
  assert.deepEqual(after.series[seriesId].chapters, []);
  assert.notDeepEqual(await storedState(harness, after, currentResource.id), beforeReinclude,
    'the successful reinclude is persisted before the complete owner read is installed');

  const stateBeforeNoop = await storedState(harness, after, currentResource.id);
  const transactionsBeforeNoop = harness.store.calls.filter((call) => call.operation === 'transact').length;
  const repeated = await api(harness, '/api/creador/enlaces/', {
    method: 'POST', body: {
      resourceId: currentResource.id,
      resourceVersion: currentResource.version,
      creatorVersion: after.creatorVersion,
    },
  });
  assert.equal(repeated.status, 200, JSON.stringify(repeated.body));
  assert.equal(repeated.body.disposition, 'already-present');
  assert.equal(repeated.body.placementId, placementId);
  assert.deepEqual(await storedState(harness, await owner(harness), currentResource.id), stateBeforeNoop,
    'an accepted exact-ID no-op does not rewrite any persisted document');
  assert.equal(harness.store.calls.filter((call) => call.operation === 'transact').length,
    transactionsBeforeNoop + 1, 'the no-op still conditionally confirms the current observations');
});

for (const placementState of ['removed', 'already-present']) {
  test(`a stale creator revision rejects reinclude before writes when the placement is ${placementState}`, async () => {
    const harness = await createCreatorPagesHarness();
    await createProfile(harness, { slug: `ana-readd-${placementState}` });
    const original = await addOwnLink(harness, { url: `https://example.test/readd-${placementState}` });
    let staleSnapshot = await owner(harness);
    const [placementId] = placementFor(staleSnapshot, original.resourceId);
    if (placementState === 'removed') staleSnapshot = await removeLink(harness, placementId);
    const retained = ownerResource(staleSnapshot, original.resourceId);

    const changed = await api(harness, '/api/creador/perfil/', {
      method: 'PUT', body: {
        creatorVersion: staleSnapshot.creatorVersion,
        displayName: 'Cambio independiente',
        slug: staleSnapshot.profile.slug,
      },
    });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const beforeAttempt = await storedState(harness, await owner(harness), retained.id);
    const response = await api(harness, '/api/creador/enlaces/', {
      method: 'POST', body: {
        resourceId: retained.id,
        resourceVersion: retained.version,
        creatorVersion: staleSnapshot.creatorVersion,
      },
    });
    assert.equal(response.status, 409, `${placementState} reinclude must reject the stale aggregate revision`);
    assert.equal(response.body.error, 'CREATOR_CONFLICT');
    assert.deepEqual(await storedState(harness, await owner(harness), retained.id), beforeAttempt,
      'the stale reinclude leaves every stored document unchanged');
  });
}

test('invalid creator revisions use the standard rejection and perform no writes', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const original = await addOwnLink(harness);
  const observed = await removeLink(harness, placementFor(await owner(harness), original.resourceId)[0]);
  const retained = ownerResource(observed, original.resourceId);

  for (const creatorVersion of [null, -1, 1.5, '1']) {
    const before = await storedState(harness, observed, retained.id);
    const response = await api(harness, '/api/creador/enlaces/', {
      method: 'POST', body: {
        resourceId: retained.id,
        resourceVersion: retained.version,
        creatorVersion,
      },
    });
    assert.equal(response.status, 400, `malformed creatorVersion ${JSON.stringify(creatorVersion)} must be rejected`);
    assert.equal(response.body.error, 'INVALID_VERSION');
    assert.deepEqual(await storedState(harness, observed, retained.id), before);
  }
});

test('a concurrent aggregate save wins at the transaction boundary and reinclude creates no placement', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  await createProfile(harness, { slug: 'ana-readd-physical-race' });
  const original = await addOwnLink(harness, { url: 'https://example.test/readd-physical-race' });
  const removed = await removeLink(harness, original.placementId);
  const resource = ownerResource(removed, original.resourceId);
  const before = await storedState(harness, removed, original.resourceId);
  let winner;
  let winnerSnapshot;
  let winnerStoredState;
  harness.mock.raceBeforeNextTransaction(async () => {
    winner = await api(harness, '/api/creador/perfil/', {
      method: 'PUT', body: {
        creatorVersion: removed.creatorVersion,
        displayName: 'Escritura concurrente ganadora',
        slug: removed.profile.slug,
      },
    });
    assert.equal(winner.status, 200, JSON.stringify(winner.body));
    winnerSnapshot = await owner(harness);
    winnerStoredState = await storedState(harness, winnerSnapshot, original.resourceId);
  });

  const response = await api(harness, '/api/creador/enlaces/', {
    method: 'POST', body: {
      resourceId: resource.id,
      resourceVersion: resource.version,
      creatorVersion: removed.creatorVersion,
    },
  });
  assert.equal(response.status, 409, JSON.stringify(response.body));
  assert.equal(response.body.error, 'LINK_CONFLICT');
  assert.ok(winnerSnapshot);
  assert.equal(winnerSnapshot.profile.displayName, 'Escritura concurrente ganadora');
  assert.equal(Object.hasOwn(winnerSnapshot.placements, original.placementId), false);
  assert.deepEqual(ownerResource(winnerSnapshot, resource.id), resource,
    'the failed reinclude leaves the retained resource and its version unchanged');
  assert.notDeepEqual(winnerStoredState, before, 'the concurrent profile save changed the aggregate');
  assert.deepEqual(await storedState(harness, await owner(harness), original.resourceId), winnerStoredState,
    'the failed reinclude adds no partial placement or resource changes');
  assert.deepEqual(await owner(harness), winnerSnapshot);
});

test('an exact-ID no-op conflicts with a concurrent resource edit and a fresh retry writes no documents', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  await createProfile(harness, { slug: 'ana-readd-resource-race' });
  const original = await addOwnLink(harness, { url: 'https://example.test/readd-resource-race' });
  const initial = await owner(harness);
  const resource = ownerResource(initial, original.resourceId);
  let winner;
  harness.mock.raceBeforeNextTransaction(async () => {
    const current = await owner(harness);
    winner = await api(harness, `/api/creador/enlaces/${encodeURIComponent(original.placementId)}/editar`, {
      method: 'PATCH', body: {
        creatorVersion: current.creatorVersion,
        resourceVersion: resource.version,
        title: 'Recurso actualizado en paralelo',
      },
    });
    assert.equal(winner.status, 200, JSON.stringify(winner.body));
  });

  const stale = await api(harness, '/api/creador/enlaces/', {
    method: 'POST', body: {
      resourceId: original.resourceId,
      resourceVersion: resource.version,
      creatorVersion: initial.creatorVersion,
    },
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  assert.equal(stale.body.error, 'LINK_CONFLICT');
  assert.ok(winner);
  const current = await owner(harness);
  assert.equal(ownerResource(current, original.resourceId).title, 'Recurso actualizado en paralelo');
  assert.deepEqual(current.placements, initial.placements,
    'the failed already-present path does not change the placement');

  const beforeRetry = await storedState(harness, current, original.resourceId);
  const transactionsBeforeRetry = harness.mock.transactions.length;
  const freshResource = ownerResource(current, original.resourceId);
  const retried = await api(harness, '/api/creador/enlaces/', {
    method: 'POST', body: {
      resourceId: original.resourceId,
      resourceVersion: freshResource.version,
      creatorVersion: current.creatorVersion,
    },
  });
  assert.equal(retried.status, 200, JSON.stringify(retried.body));
  assert.equal(retried.body.disposition, 'already-present');
  assert.equal(retried.body.placementId, original.placementId);
  const retryTransaction = harness.mock.transactions[transactionsBeforeRetry].input.TransactItems;
  assert.ok(retryTransaction.every(({ ConditionCheck }) => ConditionCheck),
    'the no-op transaction checks state without putting or deleting documents');
  assert.deepEqual(await storedState(harness, await owner(harness), original.resourceId), beforeRetry);
  assert.deepEqual(await owner(harness), current);
});

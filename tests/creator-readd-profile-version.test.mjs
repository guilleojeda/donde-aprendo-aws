import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';
import { createDynamoMoveHarness } from './fixtures/creator-link-move.mjs';

async function loadOwnerModule(path) {
  const { outputFiles } = await build({
    entryPoints: [new URL(path, import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const ownerCommands = await loadOwnerModule('../src/lib/creator-owner-commands.ts');
const ownerState = await loadOwnerModule('../src/lib/creator-owner-state.ts');
const ownerSeries = await loadOwnerModule('../src/lib/creator-owner-series.ts');

async function api(harness, path, {
  session = 'creator-a',
  method = 'GET',
  body,
} = {}) {
  return callApi(harness, path, {
    session,
    csrf: sessionCsrf[session],
    method,
    ...(body === undefined ? {} : { body }),
  });
}

async function createProfile(harness, {
  displayName = 'Ana',
  slug = 'ana-readd-profile-version',
  version,
} = {}) {
  const response = await api(harness, '/api/creador/perfil/', {
    method: 'PUT',
    body: { displayName, slug, ...(version === undefined ? {} : { version }) },
  });
  assert.equal(response.status, 200, 'the profile setup or competing edit should succeed');
  return (await responseJson(response)).profile;
}

async function owner(harness) {
  const response = await api(harness, '/api/creador/perfil/');
  assert.equal(response.status, 200);
  return responseJson(response);
}

async function addOwnLink(harness, {
  title = 'Ficha propia',
  url = 'https://example.test/readd-profile-version',
} = {}) {
  const response = await api(harness, '/api/creador/enlaces/', {
    method: 'POST',
    body: { title, url },
  });
  assert.equal(response.status, 201);
  return (await responseJson(response)).link;
}

async function removeLink(harness, link) {
  const current = await owner(harness);
  const response = await api(harness, `/api/creador/enlaces/${encodeURIComponent(link.placementId)}/`, {
    method: 'DELETE',
    body: { profileVersion: current.profile.version },
  });
  assert.equal(response.status, 204);
  return owner(harness);
}

function readdIntent(snapshot, resource, id = 'versioned-readd') {
  const context = {
    kind: 'list-command',
    key: 'reinclude-resource',
    operation: 'reinclude-resource',
    baseProfile: snapshot.profile,
    baseResource: resource,
  };
  return ownerCommands.creatorOwnerWriteIntent(id, context);
}

function clientState(snapshot) {
  return ownerState.createCreatorOwnerState({
    data: snapshot,
    accountEmail: 'creator@example.test',
    csrfToken: sessionCsrf['creator-a'],
    sessionBinding: 'a'.repeat(64),
    isAdmin: false,
    publicOrigin: 'https://example.test',
    seriesQuery: ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
  });
}

function versionChanges(body) {
  return body.versionChanges.map(({ entity, id, before, after }) => ({ entity, id, before, after }))
    .sort((a, b) => `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`));
}

async function storedState(store) {
  return (await store.list(''))
    .map(({ key, value }) => ({ key, value }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

test('the owner sends the observed profile version and interprets a real re-add receipt without restoring old chapters', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const original = await addOwnLink(harness);

  let observed = await owner(harness);
  const createdSeries = await api(harness, '/api/creador/series/', {
    method: 'POST',
    body: { name: 'Ruta anterior', slug: 'ruta-anterior', profileVersion: observed.profile.version },
  });
  assert.equal(createdSeries.status, 201);
  const series = (await responseJson(createdSeries)).series;

  observed = await owner(harness);
  const placed = observed.links.find(({ resourceId }) => resourceId === original.resourceId);
  assert.ok(placed);
  assert.equal(placed.series.length, 0);
  const membership = await api(harness, `/api/creador/series/${encodeURIComponent(series.id)}/capitulos/${encodeURIComponent(placed.placementId)}/`, {
    method: 'PUT',
    body: { profileVersion: observed.profile.version },
  });
  assert.equal(membership.status, 200);
  observed = await owner(harness);
  assert.deepEqual(observed.links.find(({ resourceId }) => resourceId === original.resourceId).series.map(({ seriesId }) => seriesId), [series.id]);

  observed = await removeLink(harness, placed);
  assert.equal(observed.links.some(({ resourceId }) => resourceId === original.resourceId), false);
  const retainedBeforeUrlChange = observed.editableResources.find(({ id }) => id === original.resourceId);
  assert.ok(retainedBeforeUrlChange);
  const changedUrl = 'https://example.test/readd-profile-version-current';
  const urlChange = await api(harness, `/api/creador/recursos/${encodeURIComponent(original.resourceId)}/`, {
    method: 'PATCH',
    body: { url: changedUrl, version: retainedBeforeUrlChange.version },
  });
  assert.equal(urlChange.status, 200);
  observed = await owner(harness);
  const resource = observed.editableResources.find(({ id }) => id === original.resourceId);
  assert.ok(resource);
  assert.equal(resource.url, changedUrl, 'the owner captures the resource destination after its separate URL change');
  const intent = readdIntent(observed, resource);
  const prepared = ownerCommands.prepareCreatorOwnerRequest(intent);
  assert.equal(prepared.path, '/api/creador/enlaces/');
  assert.equal(prepared.method, 'POST');
  assert.deepEqual(prepared.body, {
    resourceId: resource.id,
    resourceVersion: resource.version,
    profileVersion: observed.profile.version,
  });

  const response = await api(harness, prepared.path, { method: prepared.method, body: prepared.body });
  assert.equal(response.status, 201);
  const payload = await response.clone().json();
  assert.equal(payload.link.resourceId, resource.id);
  assert.equal(payload.link.url, resource.url);
  assert.equal(payload.link.placementId, placed.placementId);
  assert.deepEqual(payload.link.series, [], 'the departed chapter membership is not restored');
  assert.deepEqual(versionChanges(payload), [
    { entity: 'placement', id: payload.link.placementId, before: 0, after: payload.link.placementVersion },
    { entity: 'profile', id: observed.profile.id, before: observed.profile.version, after: observed.profile.version + 1 },
  ].sort((a, b) => `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`)));

  const interpreted = await ownerCommands.interpretCreatorOwnerResponse(response, intent, observed);
  assert.equal(interpreted.kind, 'confirmed', 'the strict production interpreter accepts the real canonical service receipt');
  assert.equal(interpreted.effect.kind, 'link-added');
  if (interpreted.effect.kind === 'link-added') {
    assert.equal(interpreted.effect.source, 'reinclude');
    assert.equal(interpreted.effect.profileVersion, observed.profile.version + 1);
    assert.equal(interpreted.effect.link.resourceId, resource.id);
    assert.equal(interpreted.effect.link.url, resource.url);
  }

  const after = await owner(harness);
  assert.equal(after.profile.version, observed.profile.version + 1);
  assert.equal(after.links.length, 1);
  assert.deepEqual(after.links[0].series, []);

  const persistedBeforeNoOp = await storedState(harness.store);
  const repeatedResponse = await api(harness, '/api/creador/enlaces/', {
    method: 'POST',
    body: {
      resourceId: after.links[0].resourceId,
      resourceVersion: after.links[0].resourceVersion,
      profileVersion: after.profile.version,
    },
  });
  assert.equal(repeatedResponse.status, 200, 'a fresh versioned exact-ID request accepts the existing-placement no-op');
  const repeated = await responseJson(repeatedResponse);
  assert.equal(repeated.created, false);
  assert.deepEqual(repeated.versionChanges, []);
  assert.deepEqual(repeated.link, after.links[0], 'the no-op returns the saved link and options unchanged');
  assert.deepEqual(await storedState(harness.store), persistedBeforeNoOp, 'the accepted no-op changes no persisted documents');
});

for (const placementState of ['removed', 'already-present']) {
  test(`a stale profile version rejects re-add before writes when the placement is ${placementState}`, async () => {
    const harness = await createCreatorPagesHarness();
    await createProfile(harness, { slug: `ana-readd-${placementState}` });
    const original = await addOwnLink(harness, {
      url: `https://example.test/readd-${placementState}`,
    });
    let staleSnapshot = await owner(harness);
    if (placementState === 'removed') staleSnapshot = await removeLink(harness, original);
    const retained = staleSnapshot.editableResources.find(({ id }) => id === original.resourceId);
    assert.ok(retained);

    await createProfile(harness, {
      displayName: 'Cambio independiente',
      slug: staleSnapshot.profile.slug,
      version: staleSnapshot.profile.version,
    });
    const beforeAttempt = await storedState(harness.store);
    const response = await api(harness, '/api/creador/enlaces/', {
      method: 'POST',
      body: {
        resourceId: retained.id,
        resourceVersion: retained.version,
        profileVersion: staleSnapshot.profile.version,
      },
    });
    assert.equal(response.status, 409, `${placementState} re-add must reject a stale observed profile`);
    assert.equal((await responseJson(response)).error, 'PROFILE_CONFLICT');
    assert.deepEqual(await storedState(harness.store), beforeAttempt, 'the stale command leaves all persisted documents unchanged');
  });
}

test('invalid supplied profile versions use the standard version rejection and perform no writes', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const link = await addOwnLink(harness);
  const observed = await removeLink(harness, link);
  const resource = observed.editableResources.find(({ id }) => id === link.resourceId);
  assert.ok(resource);

  for (const profileVersion of [null, -1, 1.5, '1']) {
    const before = await storedState(harness.store);
    const response = await api(harness, '/api/creador/enlaces/', {
      method: 'POST',
      body: { resourceId: resource.id, resourceVersion: resource.version, profileVersion },
    });
    assert.equal(response.status, 400, `malformed profileVersion ${JSON.stringify(profileVersion)} must be rejected`);
    assert.equal((await responseJson(response)).error, 'INVALID_VERSION');
    assert.deepEqual(await storedState(harness.store), before);
  }
});

test('a real legacy re-add receipt from a newer profile base stays uncertain to the stale owner intent', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, { slug: 'ana-stale-readd-receipt' });
  const original = await addOwnLink(harness, { url: 'https://example.test/stale-readd-receipt' });
  const staleSnapshot = await removeLink(harness, original);
  const resource = staleSnapshot.editableResources.find(({ id }) => id === original.resourceId);
  assert.ok(resource);
  const staleIntent = readdIntent(staleSnapshot, resource, 'stale-receipt-intent');
  let sending = clientState(staleSnapshot);
  sending = ownerState.creatorOwnerReducer(sending, { type: 'begin-write', intent: staleIntent });
  assert.equal(sending.attempt.status, 'sending');

  const newerProfile = await createProfile(harness, {
    displayName: 'Perfil guardado en otra pestaña',
    slug: staleSnapshot.profile.slug,
    version: staleSnapshot.profile.version,
  });
  assert.equal(newerProfile.version, staleSnapshot.profile.version + 1);

  // This deliberately represents a legacy caller: it supplies the current
  // resource base but omits profileVersion, so the real service may complete it.
  const legacyResponse = await api(harness, '/api/creador/enlaces/', {
    method: 'POST',
    body: { resourceId: resource.id, resourceVersion: resource.version },
  });
  assert.equal(legacyResponse.status, 201);
  const legacyPayload = await legacyResponse.clone().json();
  const actualProfileReceipt = legacyPayload.versionChanges.find(({ entity }) => entity === 'profile');
  assert.ok(actualProfileReceipt);
  assert.equal(actualProfileReceipt.before, newerProfile.version);
  assert.notEqual(actualProfileReceipt.before, staleSnapshot.profile.version,
    'the actual receipt is based on the independently saved newer profile');

  const interpreted = await ownerCommands.interpretCreatorOwnerResponse(legacyResponse, staleIntent, staleSnapshot);
  assert.equal(interpreted.kind, 'uncertain', 'the real newer-base receipt cannot confirm an intent captured at the old profile version');
  assert.ok(interpreted.message);
  const unresolved = ownerState.creatorOwnerReducer(sending, {
    type: 'write-uncertain', intentId: staleIntent.id, status: 'uncertain', message: interpreted.message,
  });
  assert.equal(unresolved.attempt.status, 'uncertain');
  assert.deepEqual(unresolved.observed, staleSnapshot, 'a mismatched receipt does not advance any client-observed owner data');

  const committed = await owner(harness);
  assert.equal(committed.profile.version, newerProfile.version + 1);
  assert.equal(committed.profile.displayName, newerProfile.displayName);
  assert.equal(committed.links.some(({ resourceId }) => resourceId === original.resourceId), true,
    'the real legacy service write succeeded even though the old client cannot safely adopt its receipt');
});

test('a profile change at the physical transaction boundary wins and re-add commits no placement', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  await createProfile(harness, { slug: 'ana-readd-physical-race' });
  const original = await addOwnLink(harness, { url: 'https://example.test/readd-physical-race' });
  const observedAfterRemoval = await removeLink(harness, original);
  const resource = observedAfterRemoval.editableResources.find(({ id }) => id === original.resourceId);
  assert.ok(resource);

  const intent = readdIntent(observedAfterRemoval, resource, 'physical-race-readd');
  const prepared = ownerCommands.prepareCreatorOwnerRequest(intent);
  assert.deepEqual(prepared.body, {
    resourceId: resource.id,
    resourceVersion: resource.version,
    profileVersion: observedAfterRemoval.profile.version,
  }, 'the transaction-time case reaches commit with the owner’s captured profile base');
  let winnerResponse;
  let winnerSnapshot;
  harness.mock.raceBeforeNextTransaction(async () => {
    winnerResponse = await api(harness, '/api/creador/perfil/', {
      method: 'PUT',
      body: {
        displayName: 'Escritura concurrente ganadora',
        slug: observedAfterRemoval.profile.slug,
        version: observedAfterRemoval.profile.version,
      },
    });
    assert.equal(winnerResponse.status, 200, 'the actual profile writer completes immediately before Re-add commits');
    winnerSnapshot = await owner(harness);
  });

  const response = await api(harness, prepared.path, { method: prepared.method, body: prepared.body });
  assert.equal(response.status, 409);
  assert.equal((await responseJson(response)).error, 'LINK_CONFLICT',
    'the profile matched on entry but loses the atomic commit-time profile check');
  assert.ok(winnerSnapshot);
  assert.equal(winnerSnapshot.profile.displayName, 'Escritura concurrente ganadora');
  assert.equal(winnerSnapshot.profile.version, observedAfterRemoval.profile.version + 1);
  const after = await owner(harness);
  assert.deepEqual(after, winnerSnapshot, 'a failed re-add preserves the winning profile write and changes no owner-visible state');
  assert.equal(after.links.some(({ resourceId }) => resourceId === original.resourceId), false);
  assert.deepEqual(after.editableResources.find(({ id }) => id === original.resourceId), resource,
    'the resource version and current URL are unchanged by the failed placement transaction');
});

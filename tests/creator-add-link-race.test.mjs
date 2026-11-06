import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentUrlKey } from '../src/lib/catalog-url.mjs';
import { callApi, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import { createDynamoMoveHarness } from './fixtures/creator-link-move.mjs';

const OWNER = '/api/creador/perfil';
const URL = 'https://add-race.example/shared';
const DESTINATION = 'https://add-race.example/moved';

async function api(harness, session, method, path, body) {
  const response = await callApi(harness, path, {
    session,
    csrf: sessionCsrf[session],
    method,
    ...(body === undefined ? {} : { body }),
  });
  return { status: response.status, body: response.status === 204 ? null : await responseJson(response) };
}

async function add(harness, session) {
  return api(harness, session, 'POST', '/api/creador/enlaces', { title: session, url: URL });
}

async function owner(harness, session) {
  const result = await api(harness, session, 'GET', OWNER);
  assert.equal(result.status, 200);
  return result.body;
}

async function moveResource(harness, session, resourceId) {
  const current = await owner(harness, session);
  const link = current.links.find(({ resourceId: id }) => id === resourceId);
  assert.ok(link, `owner response includes placement for ${resourceId}`);
  return api(harness, session, 'PATCH', `/api/creador/enlaces/${link.placementId}/editar`, {
    url: DESTINATION,
    profileVersion: current.profile.version,
    placementVersion: link.placementVersion,
    resourceVersion: link.resourceVersion,
  });
}

async function setUp(harness) {
  for (const session of ['creator-a', 'creator-b']) {
    const response = await api(harness, session, 'PUT', OWNER, {
      displayName: session,
      slug: `add-race-${session}`,
      socials: {},
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
  }
}

test('a profile save that wins after Add admission prevents every stale create write', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  await setUp(harness);

  const session = 'creator-a';
  const url = 'https://add-race.example/profile-cas';
  const admittedOwner = await owner(harness, session);
  const profileId = admittedOwner.profile.id;
  const profileKey = `profile:${profileId}`;
  const nextDisplayName = 'Concurrent profile winner';
  let attemptedResourceId;
  let attemptedPlacementId;
  let winner;
  let winnerProfileRow;

  harness.mock.raceBeforeNextTransaction(async ({ actions }) => {
    const items = actions.map((action) => action.Put?.Item).filter(Boolean);
    const resource = items.find((item) => item.url === url && typeof item.id === 'string' && !item.id.startsWith('__'));
    const placement = items.find((item) => item.recordType === 'placement' && item.resourceId === resource?.id);
    assert.ok(resource, 'the admitted Add transaction prepared a real resource create');
    assert.ok(placement, 'the admitted Add transaction prepared its placement');
    attemptedResourceId = resource.id;
    attemptedPlacementId = placement.id;

    winner = await api(harness, session, 'PUT', OWNER, {
      displayName: nextDisplayName,
      slug: `add-race-${session}`,
      socials: {},
      version: admittedOwner.profile.version,
    });
    assert.equal(winner.status, 200, JSON.stringify(winner.body));
    assert.equal(winner.body.profile.version, admittedOwner.profile.version + 1);
    winnerProfileRow = await harness.store.get(profileKey);
  });

  const addResult = await api(harness, session, 'POST', '/api/creador/enlaces', {
    title: 'Stale admitted draft',
    url,
    profileVersion: admittedOwner.profile.version,
  });

  const finalOwner = await owner(harness, session);
  assert.ok(winner, 'the concurrent profile save completed after Add admission');
  assert.equal(addResult.status, 409, JSON.stringify(addResult.body));
  assert.equal(finalOwner.profile.displayName, nextDisplayName, 'Add does not replace the winning profile fields');
  assert.equal(finalOwner.profile.version, winner.body.profile.version, 'the winning profile version remains current');
  assert.deepEqual(finalOwner.links, [], 'the stale Add creates no owner placement');
  assert.deepEqual(finalOwner.editableResources, [], 'the stale Add grants no edit reference');
  assert.deepEqual(await harness.store.get(profileKey), winnerProfileRow, 'the profile row remains the concurrent save');
  assert.equal(await harness.store.get(`resource:${attemptedResourceId}`), null, 'the candidate resource is absent');
  assert.equal(await harness.store.get(`placement:${profileId}:${attemptedPlacementId}`), null, 'the candidate placement is absent');
  assert.deepEqual(await harness.store.list(`placement:${profileId}:`), [], 'the profile has no placement from this Add');
  assert.deepEqual(await harness.store.list(`editor:${profileId}:`), [], 'the profile has no editor reference from this Add');
  assert.equal(await harness.store.get(currentUrlKey(url)), null, 'the candidate URL reservation is absent');
});

async function state(harness, profileIds, resourceIds) {
  const result = {
    resources: {},
    profiles: {},
    placements: {},
    editorReferences: {},
    reservations: {
      original: await harness.store.get(currentUrlKey(URL)),
      destination: await harness.store.get(currentUrlKey(DESTINATION)),
    },
  };
  for (const resourceId of resourceIds) {
    result.resources[resourceId] = await harness.store.get(`resource:${resourceId}`);
  }
  for (const profileId of profileIds) {
    result.profiles[profileId] = await harness.store.get(`profile:${profileId}`);
    result.placements[profileId] = await harness.store.list(`placement:${profileId}:`);
    result.editorReferences[profileId] = await harness.store.list(`editor:${profileId}:`);
  }
  return result;
}

test('a losing URL create conflicts if the observed winner moves before conditional reuse, then manual retry succeeds', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  await setUp(harness);
  const ownerA = await owner(harness, 'creator-a');
  const ownerB = await owner(harness, 'creator-b');
  const profileIds = [ownerA.profile.id, ownerB.profile.id];
  const key = currentUrlKey(URL);
  let winner;
  let attemptedResourceId;
  let moved;
  let stateAtConflict;
  let moving = false;

  harness.mock.raceBeforeNextTransaction(async ({ actions }) => {
    const createdResource = actions
      .map((action) => action.Put?.Item)
      .find((item) => item?.url === URL && typeof item.id === 'string' && !item.id.startsWith('__'));
    assert.ok(createdResource, 'the losing create transaction contains its new resource row');
    attemptedResourceId = createdResource.id;
    winner = await add(harness, 'creator-b');
    assert.equal(winner.status, 201, JSON.stringify(winner.body));
  });

  const originalGet = harness.store.get;
  harness.store.get = async (candidateKey) => {
    const observed = await originalGet(candidateKey);
    if (candidateKey !== key || !winner || moving
      || observed?.resourceId !== winner.body.link.resourceId) return observed;

    moving = true;
    moved = await moveResource(harness, 'creator-b', winner.body.link.resourceId);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    stateAtConflict = await state(harness, profileIds, [winner.body.link.resourceId, attemptedResourceId]);
    return observed;
  };

  let losing;
  try {
    losing = await add(harness, 'creator-a');
  } finally {
    harness.store.get = originalGet;
  }

  assert.equal(losing.status, 409, JSON.stringify(losing.body));
  assert.equal(losing.body.error, 'URL_CONFLICT');
  assert.deepEqual(await state(harness, profileIds, [winner.body.link.resourceId, attemptedResourceId]), stateAtConflict,
    'the rejected fallback writes no resource, placement, profile version, editor reference or reservation');

  const retry = await add(harness, 'creator-a');
  assert.equal(retry.status, 201, JSON.stringify(retry.body));
  assert.notEqual(retry.body.link.resourceId, winner.body.link.resourceId);

  const finalState = await state(harness, profileIds, [winner.body.link.resourceId, attemptedResourceId, retry.body.link.resourceId]);
  assert.equal(finalState.resources[attemptedResourceId], null, 'the rejected attempt left no resource behind');
  assert.ok(finalState.resources[retry.body.link.resourceId], 'the explicit retry persisted its resource');
  assert.equal(finalState.reservations.original.resourceId, retry.body.link.resourceId);
  assert.equal(finalState.reservations.destination.resourceId, winner.body.link.resourceId);
  const finalOwnerA = await owner(harness, 'creator-a');
  assert.deepEqual(finalOwnerA.links.map(({ resourceId }) => resourceId), [retry.body.link.resourceId]);
  assert.deepEqual(finalOwnerA.editableResources.map(({ id }) => id), [retry.body.link.resourceId]);
});

for (const cancellation of [
  { name: 'conditional cancellation', isTransactionConflict: false },
  { name: 'explicit TransactionConflict cancellation', isTransactionConflict: true },
]) {
  test(`a losing URL create conditionally reuses an unchanged concurrent winner after ${cancellation.name}`, async () => {
    const harness = await createDynamoMoveHarness({ projectionAware: true });
    await setUp(harness);
    let winner;
    let attemptedResourceId;
    harness.mock.raceBeforeNextTransaction(async ({ actions }) => {
      const attemptedResource = actions
        .map((action) => action.Put?.Item)
        .find((item) => item?.url === URL && typeof item.id === 'string' && !item.id.startsWith('__'));
      assert.ok(attemptedResource, 'the losing request prepared a real resource create');
      attemptedResourceId = attemptedResource.id;
      winner = await add(harness, 'creator-b');
      assert.equal(winner.status, 201, JSON.stringify(winner.body));
      if (cancellation.isTransactionConflict) {
        harness.mock.failNextTransaction(Object.assign(new Error('item contention'), {
          name: 'TransactionCanceledException',
          CancellationReasons: actions.map((_, index) => ({
            Code: index === 0 ? 'TransactionConflict' : 'None',
          })),
        }));
      }
    });

    const loser = await add(harness, 'creator-a');
    assert.equal(loser.status, 201, JSON.stringify(loser.body));
    assert.equal(loser.body.created, true, 'the winning resource is newly attached to the losing creator profile');
    assert.equal(loser.body.link.resourceId, winner.body.link.resourceId);
    assert.notEqual(attemptedResourceId, winner.body.link.resourceId,
      'the rejected transaction’s candidate is not mistaken for the winning resource');

    const ownerA = await owner(harness, 'creator-a');
    const ownerB = await owner(harness, 'creator-b');
    assert.deepEqual(ownerA.links.map(({ resourceId }) => resourceId), [winner.body.link.resourceId]);
    assert.deepEqual(ownerA.editableResources, [], 'cross-profile reuse does not grant edit authority');
    assert.deepEqual(ownerB.editableResources.map(({ id }) => id), [winner.body.link.resourceId]);
    assert.equal(await harness.store.get(`resource:${attemptedResourceId}`), null,
      'the cancelled losing transaction creates no second catalog resource');
    assert.equal(await harness.store.get(`resource:${winner.body.link.resourceId}`).then(Boolean), true,
      'the concurrent winning resource remains persisted');
    assert.deepEqual((await harness.store.list(`editor:${ownerA.profile.id}:`)), [],
      'reuse creates no resource edit reference for the other profile');
    assert.deepEqual((await harness.store.list(`editor:${ownerB.profile.id}:`)).map(({ value }) => value.resourceId), [winner.body.link.resourceId],
      'the existing winner retains its original editor authority');
  });
}

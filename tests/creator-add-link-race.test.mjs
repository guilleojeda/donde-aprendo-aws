import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DynamoDBServiceException } from '@aws-sdk/client-dynamodb';
import { currentUrlKey } from '../src/lib/catalog-url.mjs';
import { CREATOR_CONTRACT_VERSION } from '../src/lib/creator-values.mjs';
import { callApi, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import { createDynamoMoveHarness } from './fixtures/creator-link-move.mjs';

const OWNER = '/api/creador/perfil';
const URL = 'https://add-race.example/shared';
const DESTINATION = 'https://add-race.example/moved';

async function api(harness, session, method, path, body, options = {}) {
  const response = await callApi(harness, path, {
    session,
    csrf: sessionCsrf[session],
    ...(method === 'GET' ? {} : { creatorContract: CREATOR_CONTRACT_VERSION }),
    method,
    ...(body === undefined ? {} : { body }),
    ...options,
  });
  return { status: response.status, body: response.status === 204 ? null : await responseJson(response) };
}

async function owner(harness, session) {
  const result = await api(harness, session, 'GET', OWNER);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.schemaVersion, 3);
  return result.body;
}

async function saveProfile(harness, session, displayName) {
  const observed = await owner(harness, session);
  const response = await api(harness, session, 'PUT', OWNER, {
    creatorVersion: observed.profile ? observed.creatorVersion : null,
    displayName,
    slug: `add-race-${session}`,
    socials: {},
  });
  assert.equal(response.status, 200, `HTTP ${response.status} for ${session}: ${JSON.stringify(response.body)}`);
  assert.equal(response.body.operation, 'save-profile');
  return response.body;
}

async function add(harness, session, { title = session, url = URL, creatorVersion } = {}) {
  const observed = await owner(harness, session);
  return api(harness, session, 'POST', '/api/creador/enlaces', {
    creatorVersion: creatorVersion ?? observed.creatorVersion,
    title,
    url,
  });
}

function placementIdFor(snapshot, resourceId) {
  const found = Object.entries(snapshot.placements).find(([, placement]) => placement.resourceId === resourceId);
  assert.ok(found, `owner snapshot contains a placement for ${resourceId}`);
  return found[0];
}

async function moveResource(harness, session, resourceId) {
  const current = await owner(harness, session);
  const resource = current.resources.find(({ id }) => id === resourceId);
  assert.ok(resource, `owner response includes resource ${resourceId}`);
  const placementId = placementIdFor(current, resourceId);
  return api(harness, session, 'PATCH', `/api/creador/enlaces/${placementId}/editar`, {
    creatorVersion: current.creatorVersion,
    resourceVersion: resource.version,
    url: DESTINATION,
  });
}

async function setUp(harness) {
  for (const session of ['creator-a', 'creator-b']) await saveProfile(harness, session, session);
}

async function state(harness, profileIds, resourceIds) {
  const result = {
    resources: {},
    profiles: {},
    content: {},
    editorReferences: {},
    reservations: {
      original: await harness.store.get(currentUrlKey(URL)),
      destination: await harness.store.get(currentUrlKey(DESTINATION)),
    },
  };
  for (const resourceId of resourceIds) result.resources[resourceId] = await harness.store.get(`resource:${resourceId}`);
  for (const profileId of profileIds) {
    result.profiles[profileId] = await harness.store.get(`profile:${profileId}`);
    result.content[profileId] = result.profiles[profileId] && {
      placements: result.profiles[profileId].placements,
      order: result.profiles[profileId].order,
      series: result.profiles[profileId].series,
    };
    result.editorReferences[profileId] = await harness.store.list(`editor:${profileId}:`);
  }
  return result;
}

test('an aggregate save that wins after Add admission prevents every stale create write', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  await setUp(harness);

  const session = 'creator-a';
  const url = 'https://add-race.example/profile-cas';
  const admittedOwner = await owner(harness, session);
  const profileId = admittedOwner.profile.id;
  const profileKey = `profile:${profileId}`;
  const nextDisplayName = 'Concurrent profile winner';
  let attemptedResourceId;
  let winner;
  let winnerProfileRow;

  harness.mock.raceBeforeNextTransaction(async ({ actions }) => {
    const items = actions.map((action) => action.Put?.Item).filter(Boolean);
    const resource = items.find((item) => item.url === url && typeof item.id === 'string' && !item.id.startsWith('__'));
    assert.ok(resource, 'the admitted Add transaction prepared a resource for the requested URL');
    attemptedResourceId = resource.id;

    winner = await saveProfile(harness, session, nextDisplayName);
    assert.equal(winner.creatorVersion, admittedOwner.creatorVersion + 1);
    winnerProfileRow = await harness.store.get(profileKey);
  });

  const addResult = await add(harness, session, { title: 'Stale admitted draft', url });
  const finalOwner = await owner(harness, session);
  assert.ok(winner, 'the concurrent profile save completed after Add admission');
  assert.equal(addResult.status, 409, JSON.stringify(addResult.body));
  assert.equal(finalOwner.profile.displayName, nextDisplayName, 'Add does not replace the winning profile fields');
  assert.equal(finalOwner.creatorVersion, winner.creatorVersion);
  assert.deepEqual(finalOwner.placements, {}, 'the stale Add creates no owner placement');
  assert.deepEqual(finalOwner.order, { featured: [], ordinary: [] });
  assert.deepEqual(finalOwner.resources, [], 'the rejected resource is not projected into the owner snapshot');
  assert.deepEqual(await harness.store.get(profileKey), winnerProfileRow, 'the aggregate remains the concurrent save');
  assert.equal(await harness.store.get(`resource:${attemptedResourceId}`), null, 'the candidate resource is absent');
  assert.deepEqual(await harness.store.list(`editor:${profileId}:`), [], 'no editor reference is granted');
  assert.equal(await harness.store.get(currentUrlKey(url)), null, 'the candidate URL reservation is absent');
});

test('a losing Add conflicts if the observed winner moves before conditional reuse, then a manual retry succeeds', async () => {
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
    assert.ok(createdResource, 'the losing create transaction prepared a candidate resource');
    attemptedResourceId = createdResource.id;
    winner = await add(harness, 'creator-b');
    assert.equal(winner.status, 201, JSON.stringify(winner.body));
    assert.equal(winner.body.disposition, 'resource-created');
  });

  const originalGet = harness.store.get;
  harness.store.get = async (candidateKey) => {
    const observed = await originalGet(candidateKey);
    if (candidateKey !== key || !winner || moving
      || observed?.resourceId !== winner.body.resourceId) return observed;

    moving = true;
    moved = await moveResource(harness, 'creator-b', winner.body.resourceId);
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.operation, 'edit-link');
    stateAtConflict = await state(harness, profileIds, [winner.body.resourceId, attemptedResourceId]);
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
  assert.deepEqual(await state(harness, profileIds, [winner.body.resourceId, attemptedResourceId]), stateAtConflict,
    'the rejected fallback writes no content, resource, editor reference, or reservation');

  const retry = await add(harness, 'creator-a');
  assert.equal(retry.status, 201, JSON.stringify(retry.body));
  assert.equal(retry.body.disposition, 'resource-created');
  assert.notEqual(retry.body.resourceId, winner.body.resourceId);

  const finalState = await state(harness, profileIds, [winner.body.resourceId, attemptedResourceId, retry.body.resourceId]);
  assert.equal(finalState.resources[attemptedResourceId], null, 'the rejected attempt left no resource behind');
  assert.ok(finalState.resources[retry.body.resourceId], 'the explicit retry persisted its resource');
  assert.equal(finalState.reservations.original.resourceId, retry.body.resourceId);
  assert.equal(finalState.reservations.destination.resourceId, winner.body.resourceId);
  const finalOwnerA = await owner(harness, 'creator-a');
  assert.deepEqual(Object.values(finalOwnerA.placements).map(({ resourceId }) => resourceId), [retry.body.resourceId]);
  assert.deepEqual(finalOwnerA.resources.map(({ id }) => id), [retry.body.resourceId]);
  const finalOwnerB = await owner(harness, 'creator-b');
  assert.equal(finalOwnerB.resources.find(({ id }) => id === winner.body.resourceId).url, DESTINATION);
});

for (const cancellation of [
  { name: 'conditional cancellation', isTransactionConflict: false },
  { name: 'explicit TransactionConflict cancellation', isTransactionConflict: true },
]) {
  test(`a losing Add reuses an unchanged concurrent winner after ${cancellation.name}`, async () => {
    const harness = await createDynamoMoveHarness({ projectionAware: true });
    await setUp(harness);
    let winner;
    let attemptedResourceId;
    harness.mock.raceBeforeNextTransaction(async ({ actions }) => {
      const attemptedResource = actions
        .map((action) => action.Put?.Item)
        .find((item) => item?.url === URL && typeof item.id === 'string' && !item.id.startsWith('__'));
      assert.ok(attemptedResource, 'the losing request prepared a resource candidate');
      attemptedResourceId = attemptedResource.id;
      winner = await add(harness, 'creator-b');
      assert.equal(winner.status, 201, JSON.stringify(winner.body));
      if (cancellation.isTransactionConflict) {
        const failure = new DynamoDBServiceException({
          name: 'TransactionCanceledException',
          message: 'item contention',
          $metadata: { httpStatusCode: 400, attempts: 1 },
        });
        failure.CancellationReasons = actions.map((_, index) => ({
          Code: index === 0 ? 'TransactionConflict' : 'None',
        }));
        harness.mock.failNextTransaction(failure);
      }
    });

    const loser = await add(harness, 'creator-a');
    assert.equal(loser.status, 201, JSON.stringify(loser.body));
    assert.equal(loser.body.disposition, 'resource-reused', 'the winning resource is newly attached without adopting draft metadata');
    assert.equal(loser.body.resourceId, winner.body.resourceId);
    assert.notEqual(attemptedResourceId, winner.body.resourceId,
      'the rejected transaction candidate is not mistaken for the winning resource');

    const ownerA = await owner(harness, 'creator-a');
    const ownerB = await owner(harness, 'creator-b');
    assert.deepEqual(Object.values(ownerA.placements).map(({ resourceId }) => resourceId), [winner.body.resourceId]);
    assert.equal(ownerA.resources[0].metadataEditable, false, 'cross-profile reuse does not grant metadata authority');
    assert.equal(ownerB.resources[0].metadataEditable, true);
    assert.equal(ownerA.resources[0].title, 'creator-b', 'the reused winner keeps its original metadata');
    assert.equal(await harness.store.get(`resource:${attemptedResourceId}`), null,
      'the cancelled losing transaction creates no second catalog resource');
    assert.equal(await harness.store.get(`resource:${winner.body.resourceId}`).then(Boolean), true,
      'the concurrent winning resource remains persisted');
    const profileAId = ownerA.profile.id;
    const profileBId = ownerB.profile.id;
    assert.deepEqual((await harness.store.list(`editor:${profileAId}:`)), [],
      'reuse creates no resource edit reference for the other profile');
    assert.deepEqual((await harness.store.list(`editor:${profileBId}:`)).map(({ value }) => value.resourceId), [winner.body.resourceId],
      'the winner retains its original editor authority');
  });
}

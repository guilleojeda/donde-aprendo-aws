import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import {
  createDynamoMoveHarness,
  seedMovePlacement,
  seedMoveProfile,
  seedMoveResource,
  storedAttributeBytes,
} from './fixtures/creator-link-move.mjs';
import { padPlacementMembershipsToBytes } from './fixtures/creator-order-physical.mjs';

const PROFILE_ID = 'profile-move-a';
const ITEM_LIMIT = 400 * 1024;
const TRANSACTION_LIMIT = 4 * 1024 * 1024;
const PLACEMENT_QUERY_FIELDS = [
  'pk', 'sk', 'recordType', 'id', 'profileId', 'resourceId', 'position', 'featured',
  'selectedForDirectory', 'series', 'version',
];

function placementKey(id) {
  return { pk: `PROFILE#${PROFILE_ID}`, sk: `PLACEMENT#${id}` };
}

function setAtSize(value, targetBytes, field) {
  value[field] = '';
  const fixedBytes = storedAttributeBytes(value);
  assert.ok(fixedBytes < targetBytes);
  value[field] = 'x'.repeat(targetBytes - fixedBytes);
  assert.equal(storedAttributeBytes(value), targetBytes);
  return value;
}

function rawPlacement(mock, id) {
  return mock.read('profiles-test', placementKey(id));
}

test('an immutable target can force a valid-item move over 4 MiB while an adjacent intermediate fits', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  seedMoveProfile(harness.mock);

  const neighborIds = Array.from({ length: 10 }, (_, index) => `a-${String(index).padStart(2, '0')}`);
  const targetId = 'z-target';
  for (const id of [...neighborIds, targetId]) {
    seedMoveResource(harness.mock, {
      id: `resource-${id}`,
      url: `https://example.com/physical-observation/${id}`,
    });
    seedMovePlacement(harness.mock, {
      id,
      resourceId: `resource-${id}`,
      position: 0,
      version: 1,
      ...(id === targetId ? { version: Number.MAX_SAFE_INTEGER } : {}),
    });
  }

  const changedItemBytes = 380 * 1024;
  for (const id of neighborIds) {
    const placement = rawPlacement(harness.mock, id);
    placement.ttl = 1_900_000_000;
    placement.futureField = 'opaque changed-row field';
    padPlacementMembershipsToBytes(placement, changedItemBytes);
    harness.mock.seed('profiles-test', placement);
  }

  const target = rawPlacement(harness.mock, targetId);
  target.ttl = 1_900_000_000;
  setAtSize(target, 300 * 1024, 'futureField');
  harness.mock.seed('profiles-test', target);

  const initialPlacements = [...neighborIds, targetId].map((id) => structuredClone(rawPlacement(harness.mock, id)));
  const projectedPutBytes = neighborIds.map((id) => {
    const image = rawPlacement(harness.mock, id);
    const candidate = Object.fromEntries(PLACEMENT_QUERY_FIELDS
      .filter((field) => Object.hasOwn(image, field))
      .map((field) => [field, structuredClone(image[field])]));
    candidate.position = 1;
    candidate.version = 2;
    return storedAttributeBytes(candidate);
  });
  const rawCheckPlusPutLowerBound = projectedPutBytes.reduce((sum, bytes) => sum + bytes, 0)
    + storedAttributeBytes(target);
  const profile = await harness.store.get(`profile:${PROFILE_ID}`);
  const profileCandidateBytes = storedAttributeBytes({
    ...profile,
    version: profile.version + 1,
    updatedAt: Number.MAX_SAFE_INTEGER,
    pk: `PROFILE#${PROFILE_ID}`,
    sk: 'META',
  });
  const ordinalTwoMinimumBytes = projectedPutBytes.slice(1).reduce((sum, bytes) => sum + bytes, 0)
    + storedAttributeBytes(target) + profileCandidateBytes;
  const ordinalTwoAssignment = [
    { id: neighborIds[0], position: 0 },
    { id: targetId, position: 0 },
    ...neighborIds.slice(1).map((id) => ({ id, position: 1 })),
  ];
  assert.ok(initialPlacements.every((placement) => storedAttributeBytes(placement) <= ITEM_LIMIT),
    'each input record is a valid DynamoDB item');
  assert.ok(projectedPutBytes.every((bytes) => bytes <= ITEM_LIMIT),
    'each changed Query-projection Put is a valid DynamoDB item');
  assert.ok(rawCheckPlusPutLowerBound > TRANSACTION_LIMIT,
    'every neighbor must move above immutable position 0; the smallest positive position and next-version number class gives this lower bound');
  assert.equal(target.position, 0);
  assert.ok(neighborIds.every((id) => rawPlacement(harness.mock, id).position === 0));
  assert.equal(storedAttributeBytes({ position: 1 }) - Buffer.byteLength('position'), 2,
    'position 1 is in the smallest DynamoDB numeric byte class; all positive integer positions use at least this many bytes');
  assert.equal(storedAttributeBytes({ version: 2 }) - Buffer.byteLength('version'), 2,
    'the next version has the minimum numeric byte class for each changed neighbor');
  assert.ok(ordinalTwoMinimumBytes <= TRANSACTION_LIMIT,
    'moving the target only to ordinal two needs nine neighbor Puts and remains within 4 MiB');
  assert.equal(1 + neighborIds.length - 1 + 1, 11,
    'the ordinal-two assignment uses one profile Put, nine placement Puts, and one target CheckCondition');
  assert.deepEqual(ordinalTwoAssignment
    .slice()
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map(({ id }) => id), [neighborIds[0], targetId, ...neighborIds.slice(1)],
  'an explicit position vector witnesses a valid intermediate insertion');
  assert.equal(target.version, Number.MAX_SAFE_INTEGER,
    'the target cannot participate in a position-changing Put because its version cannot increment');
  assert.ok(neighborIds.every((id) => id.localeCompare(targetId) < 0),
    'the immutable target at position 0 sorts after every neighbor at position 0');

  const response = await callApi(harness,
    `/api/creador/enlaces/${encodeURIComponent(targetId)}/mover`, {
      session: 'creator-a',
      csrf: sessionCsrf['creator-a'],
      origin: 'https://dondeaprendoaws.com',
      method: 'POST',
      body: { profileVersion: profile.version, placementVersion: target.version, targetPosition: 1 },
    });
  const body = await responseJson(response);

  if (response.status === 200 && harness.mock.transactions.length === 1) {
    const transaction = harness.mock.transactions[0];
    const placementPutBytes = transaction.input.TransactItems
      .filter(({ Put }) => Put?.Item.sk.startsWith('PLACEMENT#'))
      .map(({ Put }) => storedAttributeBytes(Put.Item));
    assert.equal(placementPutBytes.length, neighborIds.length);
    assert.ok(placementPutBytes.every((bytes) => bytes <= ITEM_LIMIT),
      `each outgoing placement Put is valid: ${JSON.stringify(placementPutBytes)}`);
    assert.ok(transaction.input.TransactItems
      .filter(({ Put }) => Put?.Item.sk.startsWith('PLACEMENT#'))
      .every(({ Put }) => !Object.hasOwn(Put.Item, 'ttl') && !Object.hasOwn(Put.Item, 'futureField')),
    'Query-based replacement Puts keep current TTL/unknown-field behavior');
    assert.ok(transaction.physicalBytes > TRANSACTION_LIMIT,
      `the captured service request counts the raw unchanged CheckCondition image: ${transaction.physicalBytes}`);
  }
  const actualTransactionBytes = harness.mock.transactions[0]?.physicalBytes;
  assert.equal(response.status, 422,
    `HTTP ${response.status}, transaction bytes ${actualTransactionBytes ?? 'not sent'}: ${JSON.stringify(body)}`);
  assert.equal(body.error, 'ORDER_MOVE_LIMIT');
  assert.ok(Number.isSafeInteger(body.viablePosition)
    && body.viablePosition > 1 && body.viablePosition < neighborIds.length + 1,
  'the response offers a verified ordinal strictly between current ordinal 11 and requested ordinal 1');
  assert.equal(harness.mock.transactions.length, 0,
    'a preflight rejection must happen before any TransactWrite command');
  assert.equal(harness.mock.calls.filter(({ name, input }) => name === 'GetCommand'
    && input.Key.sk?.startsWith('PLACEMENT#')).length, 0,
  'raw placement images must come from the Query observation, without one Get per member');
  assert.deepEqual([...neighborIds, targetId].map((id) => rawPlacement(harness.mock, id)), initialPlacements,
    'no placement changes when the complete raw-image transaction cannot fit');

  const alternate = await callApi(harness,
    `/api/creador/enlaces/${encodeURIComponent(targetId)}/mover`, {
      session: 'creator-a',
      csrf: sessionCsrf['creator-a'],
      origin: 'https://dondeaprendoaws.com',
      method: 'POST',
      body: { profileVersion: profile.version, placementVersion: target.version, targetPosition: body.viablePosition },
    });
  assert.equal(alternate.status, 200, `verified intermediate ordinal ${body.viablePosition} commits`);
  assert.equal(harness.mock.transactions.length, 1);
  const accepted = harness.mock.transactions[0];
  assert.ok(accepted.physicalBytes <= TRANSACTION_LIMIT,
    `alternate action images fit 4 MiB: ${accepted.physicalBytes}`);
  assert.ok(accepted.input.TransactItems.filter(({ Put }) => Put?.Item.sk.startsWith('PLACEMENT#'))
    .every(({ Put }) => storedAttributeBytes(Put.Item) <= ITEM_LIMIT),
  'every alternate placement Put remains within the item limit');
  const committedOrder = [...neighborIds, targetId]
    .map((id) => rawPlacement(harness.mock, id))
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map(({ id }) => id);
  const expectedOrder = neighborIds.slice();
  expectedOrder.splice(body.viablePosition - 1, 0, targetId);
  assert.deepEqual(committedOrder, expectedOrder,
    'the suggested ordinal is the exact committed insertion position');
});

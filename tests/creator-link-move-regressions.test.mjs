import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import {
  createDynamoMoveHarness,
  moveTransactionMetrics,
  seedMovePlacement,
  seedMoveProfile,
  seedMoveResource,
} from './fixtures/creator-link-move.mjs';

const ITEM_LIMIT = 400 * 1024;
const OWNER = 'profile-move-a';
const IDS = ['a', 'b', 'c', 'd', 'e'];

function storedAttributeBytes(value, name = '') {
  const nameBytes = Buffer.byteLength(name, 'utf8');
  if (typeof value === 'string') return nameBytes + Buffer.byteLength(value, 'utf8');
  if (typeof value === 'number') {
    const digits = String(value).replace(/^0+/, '').replace(/0+$/, '').length || 1;
    return nameBytes + 1 + Math.ceil(digits / 2);
  }
  if (typeof value === 'boolean' || value === null) return nameBytes + 1;
  return nameBytes + 3 + Object.entries(value)
    .reduce((sum, [key, item]) => sum + 1 + storedAttributeBytes(item, key), 0);
}

function snapshot(mock) {
  return structuredClone({
    profile: mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: 'META' }),
    placements: IDS.map((id) => mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: `PLACEMENT#${id}` })),
  });
}

async function move(harness, targetPosition) {
  const response = await callApi(harness, '/api/creador/enlaces/a/mover', {
    session: 'creator-a',
    csrf: sessionCsrf['creator-a'],
    origin: 'https://dondeaprendoaws.com',
    method: 'POST',
    body: { profileVersion: 1, placementVersion: 100, targetPosition },
  });
  return { response, body: await responseJson(response) };
}

test('un ordinal intermedio más lejano cabe cuando el vecino inmediato requiere mutar un placement al límite', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  for (const [id, position] of [['a', 0], ['b', 0], ['c', 0], ['d', 1], ['e', 1]]) {
    seedMoveResource(harness.mock, { id: `resource-${id}`, url: `https://move.example/${id}` });
    seedMovePlacement(harness.mock, {
      id,
      resourceId: `resource-${id}`,
      position,
      version: 100,
      ...(['c', 'd', 'e'].includes(id) ? { series: { legacy: '' } } : {}),
    });
    if (['c', 'd', 'e'].includes(id)) {
      const row = harness.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: `PLACEMENT#${id}` });
      const baseline = Object.entries(row).reduce(
        (total, [key, value]) => total + storedAttributeBytes(value, key),
        0,
      );
      row.series.legacy = 'x'.repeat(ITEM_LIMIT - baseline);
      assert.equal(Object.entries(row).reduce(
        (total, [key, value]) => total + storedAttributeBytes(value, key),
        0,
      ), ITEM_LIMIT);
      harness.mock.seed('profiles-test', row);
    }
  }

  const before = snapshot(harness.mock);
  const fullMove = await move(harness, 4);
  assert.equal(fullMove.response.status, 422);
  assert.equal(fullMove.body.error, 'ORDER_MOVE_LIMIT');
  assert.equal(fullMove.body.viablePosition, 3);
  assert.deepEqual(snapshot(harness.mock), before);
  assert.deepEqual(moveTransactionMetrics(harness.mock), []);

  const adjacentMove = await move(harness, 2);
  assert.equal(adjacentMove.response.status, 422);
  assert.equal(adjacentMove.body.error, 'ORDER_MOVE_LIMIT');
  assert.equal(Object.hasOwn(adjacentMove.body, 'viablePosition'), false,
    'there is no intermediate ordinal between the current position and ordinal two');
  assert.deepEqual(snapshot(harness.mock), before);
  assert.deepEqual(moveTransactionMetrics(harness.mock), []);

  const saved = await move(harness, fullMove.body.viablePosition);
  assert.equal(saved.response.status, 200);
  assert.deepEqual(saved.body.links.map(({ placementId }) => placementId), ['a']);
  assert.deepEqual(saved.body.versionChanges, [
    { entity: 'profile', id: OWNER, before: 1, after: 2 },
    { entity: 'placement', id: 'a', before: 100, after: 101 },
  ]);
  const after = snapshot(harness.mock);
  assert.deepEqual(after.placements.map(({ id }) => id), IDS);
  assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 2 }]);
  assert.deepEqual(after.placements.map(({ position }) => position), [1, 0, 0, 1, 1]);
  assert.deepEqual(after.placements.map(({ version }) => version), [101, 100, 100, 100, 100]);
  const publicOwner = await callApi(harness, '/api/creador/perfil', {
    session: 'creator-a',
    csrf: sessionCsrf['creator-a'],
    origin: 'https://dondeaprendoaws.com',
    method: 'GET',
  });
  assert.equal(publicOwner.status, 200);
  assert.deepEqual((await responseJson(publicOwner)).links.map(({ placementId }) => placementId), ['b', 'c', 'a', 'd', 'e']);
});

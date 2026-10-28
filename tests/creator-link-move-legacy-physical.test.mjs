import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import {
  createDynamoMoveHarness,
  moveTransactionMetrics,
  seedMovePlacement,
  seedMoveProfile,
  seedMoveResource,
  storedAttributeBytes,
} from './fixtures/creator-link-move.mjs';

const OWNER = 'profile-move-a';
const ITEM_LIMIT = 400 * 1024;
const movePath = (id) => `/api/creador/enlaces/${encodeURIComponent(id)}/mover`;
const placementKey = (id) => ({ pk: `PROFILE#${OWNER}`, sk: `PLACEMENT#${id}` });

async function setup(rows) {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  for (const row of rows) {
    seedMoveResource(harness.mock, {
      id: `resource-${row.id}`,
      url: `https://example.com/legacy-move/${row.id}`,
    });
    seedMovePlacement(harness.mock, {
      id: row.id,
      resourceId: `resource-${row.id}`,
      position: row.position,
      featured: row.featured ?? false,
      selectedForDirectory: row.selectedForDirectory ?? true,
      version: row.version ?? 1,
      ...(row.series ? { series: structuredClone(row.series) } : {}),
    });
  }
  return harness;
}

function seedLegacyPlacementAtSize(harness, id, bytes) {
  const placement = structuredClone(harness.mock.read('profiles-test', placementKey(id)));
  delete placement.version;
  placement.series ??= {};
  placement.series.legacy ??= '';
  placement.series.legacy = 'x'.repeat(bytes - storedAttributeBytes(placement));
  assert.equal(storedAttributeBytes(placement), bytes);
  harness.mock.seed('profiles-test', placement);
  return placement;
}

async function move(harness, id, placementVersion, targetPosition = 1) {
  const response = await callApi(harness, movePath(id), {
    session: 'creator-a',
    csrf: sessionCsrf['creator-a'],
    origin: 'https://dondeaprendoaws.com',
    method: 'POST',
    body: { profileVersion: 1, placementVersion, targetPosition },
  });
  return { response, body: await responseJson(response) };
}

function rawPlacements(harness, ids) {
  return ids.map((id) => structuredClone(harness.mock.read('profiles-test', placementKey(id))));
}

function globalOrder(rows) {
  return [...rows].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map(({ id }) => id);
}

function sortReceipts(changes) {
  return [...changes].sort((left, right) => `${left.entity}:${left.id}`.localeCompare(`${right.entity}:${right.id}`));
}

test('no-op acepta y conserva un target legacy de 400 KiB físicos', async () => {
  const harness = await setup([{ id: 'only', position: 0, series: { legacy: '' } }]);
  const before = seedLegacyPlacementAtSize(harness, 'only', ITEM_LIMIT);

  const { response, body } = await move(harness, 'only', 0);

  assert.equal(response.status, 200);
  assert.deepEqual(body.versionChanges, []);
  assert.deepEqual(harness.mock.read('profiles-test', placementKey('only')), before);
  assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 2 }]);
});

test('el target legacy intacto al límite permite ordenar el vecino con tres acciones', async () => {
  const harness = await setup([
    { id: 'a', position: 0 },
    { id: 'z', position: 0, series: { legacy: '' } },
  ]);
  const beforeTarget = seedLegacyPlacementAtSize(harness, 'z', ITEM_LIMIT);
  const beforeNeighbor = structuredClone(harness.mock.read('profiles-test', placementKey('a')));

  const { response, body } = await move(harness, 'z', 0);

  assert.equal(response.status, 200, `HTTP ${response.status}: ${JSON.stringify(body)}`);
  const afterTarget = harness.mock.read('profiles-test', placementKey('z'));
  const afterNeighbor = harness.mock.read('profiles-test', placementKey('a'));
  assert.deepEqual(afterTarget, beforeTarget);
  assert.equal(Object.hasOwn(afterTarget, 'version'), false);
  assert.equal(afterNeighbor.position, 1);
  assert.equal(afterNeighbor.version, beforeNeighbor.version + 1);
  assert.deepEqual(globalOrder(rawPlacements(harness, ['a', 'z'])), ['z', 'a']);
  assert.deepEqual(sortReceipts(body.versionChanges), sortReceipts([
    { entity: 'profile', id: OWNER, before: 1, after: 2 },
    { entity: 'placement', id: 'a', before: 1, after: 2 },
  ]));
  assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 3 }]);
});

test('un target legacy modificado cabe al límite al materializar version', async () => {
  const harness = await setup([
    { id: 'a', position: Number.MAX_SAFE_INTEGER - 1 },
    { id: 'z', position: Number.MAX_SAFE_INTEGER, series: { legacy: '' } },
  ]);
  // The planner can shorten the large position by seven bytes; version: 1 adds nine.
  const beforeTarget = seedLegacyPlacementAtSize(harness, 'z', ITEM_LIMIT - 2);
  const beforeNeighbor = structuredClone(harness.mock.read('profiles-test', placementKey('a')));

  const { response, body } = await move(harness, 'z', 0);

  assert.equal(response.status, 200, `HTTP ${response.status}: ${JSON.stringify(body)}`);
  const afterTarget = harness.mock.read('profiles-test', placementKey('z'));
  const afterNeighbor = harness.mock.read('profiles-test', placementKey('a'));
  assert.equal(afterTarget.version, 1);
  assert.notEqual(afterTarget.position, beforeTarget.position);
  assert.equal(storedAttributeBytes(afterTarget), ITEM_LIMIT);
  assert.equal(afterNeighbor.position, beforeNeighbor.position);
  assert.deepEqual(afterTarget.series, beforeTarget.series);
  assert.deepEqual(sortReceipts(body.versionChanges), sortReceipts([
    { entity: 'profile', id: OWNER, before: 1, after: 2 },
    { entity: 'placement', id: 'z', before: 0, after: 1 },
  ]));
  assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 2 }]);
});

test('un vecino legacy modificado cabe al límite al materializar version y conserva su mapa raw', async () => {
  const harness = await setup([
    { id: 'a', position: 0, series: { legacy: '', inactive: { raw: 'keep' } } },
    { id: 'z', position: 0 },
  ]);
  const beforeNeighbor = seedLegacyPlacementAtSize(harness, 'a', ITEM_LIMIT - 9);
  const beforeTarget = structuredClone(harness.mock.read('profiles-test', placementKey('z')));

  const { response, body } = await move(harness, 'z', 1);

  assert.equal(response.status, 200, `HTTP ${response.status}: ${JSON.stringify(body)}`);
  const afterNeighbor = harness.mock.read('profiles-test', placementKey('a'));
  const afterTarget = harness.mock.read('profiles-test', placementKey('z'));
  assert.equal(afterNeighbor.version, 1);
  assert.equal(afterNeighbor.position, 1);
  assert.equal(storedAttributeBytes(afterNeighbor), ITEM_LIMIT);
  assert.deepEqual(afterNeighbor.series, beforeNeighbor.series);
  assert.deepEqual(afterTarget, beforeTarget);
  assert.deepEqual(globalOrder(rawPlacements(harness, ['a', 'z'])), ['z', 'a']);
  assert.deepEqual(sortReceipts(body.versionChanges), sortReceipts([
    { entity: 'profile', id: OWNER, before: 1, after: 2 },
    { entity: 'placement', id: 'a', before: 0, after: 1 },
  ]));
  assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 3 }]);
});

test('el preflight rechaza un vecino legacy cuyo put crecería a 400 KiB + 1 sin transaccionar', async () => {
  const harness = await setup([
    { id: 'a', position: 0, series: { legacy: '' } },
    { id: 'z', position: 0 },
  ]);
  const beforePlacements = ['a', 'z']
    .map((id) => structuredClone(harness.mock.read('profiles-test', placementKey(id))));
  const beforeLegacyBytes = seedLegacyPlacementAtSize(harness, 'a', ITEM_LIMIT - 8);
  beforePlacements[0] = structuredClone(beforeLegacyBytes);

  const { response, body } = await move(harness, 'z', 1);

  assert.equal(response.status, 422);
  assert.equal(body.error, 'ORDER_MOVE_LIMIT');
  assert.deepEqual(rawPlacements(harness, ['a', 'z']), beforePlacements);
  assert.deepEqual(moveTransactionMetrics(harness.mock), []);
});

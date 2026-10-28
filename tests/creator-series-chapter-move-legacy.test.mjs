import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import {
  createDynamoMoveHarness,
  seedMovePlacement,
  seedMoveProfile,
  seedMoveResource,
  seedMoveSeries,
  storedAttributeBytes,
} from './fixtures/creator-link-move.mjs';

const PROFILE_ID = 'profile-move-a';
const SERIES_ID = 'series-move-a';
const ITEM_LIMIT = 400 * 1024;
const movePath = (placementId) => `/api/creador/series/${SERIES_ID}/capitulos/${placementId}/mover`;

async function exactSizePlacement({ storedVersion, bytes }) {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  seedMoveSeries(harness.mock, { id: SERIES_ID });
  seedMoveResource(harness.mock, { id: 'resource-only', url: 'https://example.com/only' });
  seedMovePlacement(harness.mock, {
    id: 'only',
    resourceId: 'resource-only',
    position: 0,
    version: 0,
    series: { [SERIES_ID]: { position: 0 }, legacy: '' },
  });

  const key = { pk: `PROFILE#${PROFILE_ID}`, sk: 'PLACEMENT#only' };
  const row = structuredClone(harness.mock.read('profiles-test', key));
  if (!storedVersion) delete row.version;
  row.series.legacy = 'x'.repeat(bytes - storedAttributeBytes(row));
  assert.equal(storedAttributeBytes(row), bytes);
  harness.mock.seed('profiles-test', row);
  return { harness, key, row };
}

async function noOp(harness) {
  const response = await callApi(harness, movePath('only'), {
    session: 'creator-a',
    csrf: sessionCsrf['creator-a'],
    origin: 'https://dondeaprendoaws.com',
    method: 'POST',
    body: { profileVersion: 1, seriesVersion: 1, placementVersion: 0, targetPosition: 1 },
  });
  return { response, body: await responseJson(response) };
}

async function exactSizeSeriesMove({ variant, bytes }) {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  seedMoveSeries(harness.mock, { id: SERIES_ID });
  for (const id of ['a', 'z']) {
    seedMoveResource(harness.mock, { id: `resource-${id}`, url: `https://example.com/${id}` });
    const position = variant === 'changed-target' ? (id === 'a' ? 10 : 20) : 0;
    seedMovePlacement(harness.mock, {
      id,
      resourceId: `resource-${id}`,
      position: 900,
      featured: true,
      selectedForDirectory: false,
      version: 1,
      series: { [SERIES_ID]: { position }, legacy: '', inactive: { preserved: true } },
    });
  }

  const legacyId = variant === 'changed-neighbor' ? 'a' : 'z';
  const key = { pk: `PROFILE#${PROFILE_ID}`, sk: `PLACEMENT#${legacyId}` };
  const legacy = structuredClone(harness.mock.read('profiles-test', key));
  delete legacy.version;
  legacy.series.legacy = 'x'.repeat(bytes - storedAttributeBytes(legacy));
  assert.equal(storedAttributeBytes(legacy), bytes);
  harness.mock.seed('profiles-test', legacy);
  const beforePlacements = ['a', 'z'].map((id) => structuredClone(
    harness.mock.read('profiles-test', { pk: `PROFILE#${PROFILE_ID}`, sk: `PLACEMENT#${id}` }),
  ));
  const beforeProfile = structuredClone(harness.mock.read('profiles-test', { pk: `PROFILE#${PROFILE_ID}`, sk: 'META' }));
  const beforeSeries = structuredClone(harness.mock.read('profiles-test', { pk: `PROFILE#${PROFILE_ID}`, sk: `SERIES#${SERIES_ID}` }));
  return { harness, legacyId, legacy, beforePlacements, beforeProfile, beforeSeries };
}

async function moveToFirstChapter(harness, placementVersion) {
  const response = await callApi(harness, movePath('z'), {
    session: 'creator-a',
    csrf: sessionCsrf['creator-a'],
    origin: 'https://dondeaprendoaws.com',
    method: 'POST',
    body: { profileVersion: 1, seriesVersion: 1, placementVersion, targetPosition: 1 },
  });
  return { response, body: await responseJson(response) };
}

function rawPlacement(harness, id) {
  return harness.mock.read('profiles-test', { pk: `PROFILE#${PROFILE_ID}`, sk: `PLACEMENT#${id}` });
}

function seriesOrder(rows) {
  return rows.filter((row) => Object.hasOwn(row.series ?? {}, SERIES_ID))
    .sort((left, right) => left.series[SERIES_ID].position - right.series[SERIES_ID].position
      || left.id.localeCompare(right.id))
    .map((row) => row.id);
}

test('no-op de un placement legacy de 400 KiB usa su imagen física sin materializar version: 0', async () => {
  const { harness, key, row } = await exactSizePlacement({ storedVersion: false, bytes: ITEM_LIMIT });
  const before = structuredClone(row);

  const { response, body } = await noOp(harness);

  assert.equal(response.status, 200);
  assert.deepEqual(body.versionChanges, []);
  assert.deepEqual(harness.mock.read('profiles-test', key), before);
  const placementQueries = harness.mock.calls.filter(({ name, input }) =>
    name === 'QueryCommand' && input.ExpressionAttributeValues[':sk'] === 'PLACEMENT#');
  assert.equal(placementQueries.length, 1, 'version presence comes from the existing placement query');
  const actions = harness.mock.transactions.at(-1).input.TransactItems;
  assert.equal(actions.length, 3);
  assert.ok(actions.every(({ ConditionCheck }) => ConditionCheck));
});

test('no-op de version: 0 explícita conserva sus bytes físicos al límite', async () => {
  const { harness, key, row } = await exactSizePlacement({ storedVersion: true, bytes: ITEM_LIMIT });
  const before = structuredClone(row);

  const { response, body } = await noOp(harness);

  assert.equal(response.status, 200);
  assert.deepEqual(body.versionChanges, []);
  assert.deepEqual(harness.mock.read('profiles-test', key), before);
});

test('no-op de version: 0 explícita rechaza un placement que supera 400 KiB', async () => {
  const { harness, key, row } = await exactSizePlacement({ storedVersion: true, bytes: ITEM_LIMIT + 1 });
  const before = structuredClone(row);

  const { response, body } = await noOp(harness);

  assert.equal(response.status, 422);
  assert.equal(body.error, 'ORDER_MOVE_LIMIT');
  assert.deepEqual(harness.mock.read('profiles-test', key), before);
  assert.equal(harness.mock.transactions.length, 0);
});

test('escrituras de placements legacy materializan version y miden la imagen candidata de 400 KiB', async (t) => {
  for (const variant of ['changed-neighbor', 'changed-target']) {
    await t.test(variant, async () => {
      const { harness, legacyId, legacy, beforePlacements, beforeProfile, beforeSeries } =
        await exactSizeSeriesMove({ variant, bytes: ITEM_LIMIT - 9 });
      const targetVersion = legacyId === 'z' ? 0 : 1;

      const { response, body } = await moveToFirstChapter(harness, targetVersion);

      assert.equal(response.status, 200);
      const afterPlacements = ['a', 'z'].map((id) => rawPlacement(harness, id));
      assert.deepEqual(seriesOrder(afterPlacements), ['z', 'a']);
      const changedIds = afterPlacements.filter((after, index) => {
        const before = beforePlacements[index];
        return after.series[SERIES_ID].position !== before.series[SERIES_ID].position;
      }).map(({ id }) => id);
      assert.deepEqual(changedIds, [legacyId]);
      const expectedLegacy = structuredClone(legacy);
      expectedLegacy.version = 1;
      expectedLegacy.series[SERIES_ID].position = afterPlacements.find(({ id }) => id === legacyId).series[SERIES_ID].position;
      assert.deepEqual(rawPlacement(harness, legacyId), expectedLegacy);
      assert.equal(storedAttributeBytes(rawPlacement(harness, legacyId)), ITEM_LIMIT);
      assert.deepEqual(afterPlacements.find(({ id }) => id !== legacyId), beforePlacements.find(({ id }) => id !== legacyId));
      const afterProfile = harness.mock.read('profiles-test', { pk: `PROFILE#${PROFILE_ID}`, sk: 'META' });
      assert.equal(afterProfile.version, beforeProfile.version + 1);
      assert.equal(afterProfile.displayName, beforeProfile.displayName);
      assert.deepEqual(harness.mock.read('profiles-test', { pk: `PROFILE#${PROFILE_ID}`, sk: `SERIES#${SERIES_ID}` }), beforeSeries);
      assert.ok(body.versionChanges.some((change) =>
        change.entity === 'placement' && change.id === legacyId && change.before === 0 && change.after === 1));
      assert.ok(body.versionChanges.some((change) =>
        change.entity === 'profile' && change.id === PROFILE_ID && change.before === 1 && change.after === 2));
      assert.equal(JSON.stringify(body).includes('storedVersionPresent'), false);
      assert.equal(JSON.stringify(harness.mock.transactions.at(-1).input.TransactItems).includes('storedVersionPresent'), false);
      assert.equal(harness.mock.transactions.at(-1).actionCount, variant === 'changed-neighbor' ? 4 : 3);
    });
  }
});

test('placement legacy que crecería a 400 KiB + 1 se rechaza antes de enviar la transacción', async () => {
  const { harness, legacyId, legacy } = await exactSizeSeriesMove({
    variant: 'changed-neighbor',
    bytes: ITEM_LIMIT - 8,
  });

  const { response, body } = await moveToFirstChapter(harness, 1);

  assert.equal(response.status, 422);
  assert.equal(body.error, 'ORDER_MOVE_LIMIT');
  assert.deepEqual(rawPlacement(harness, legacyId), legacy);
  assert.equal(harness.mock.transactions.length, 0);
});

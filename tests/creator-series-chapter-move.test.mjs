import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import {
  createDynamoMoveHarness,
  moveTransactionMetrics,
  moveTransactionPhysicalBytes,
  seedMovePlacement,
  seedMoveProfile,
  seedMoveResource,
  seedMoveSeries,
  storedAttributeBytes,
} from './fixtures/creator-link-move.mjs';

const OWNER = 'profile-move-a';
const OTHER_OWNER = 'profile-move-b';
const SERIES = 'series-move-a';
const OTHER_SERIES = 'series-move-b';
const SITE_ORIGIN = 'https://dondeaprendoaws.com';
const ITEM_LIMIT = 400 * 1024;
const TRANSACTION_LIMIT = 4 * 1024 * 1024;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MOVE_PATH = (seriesId, placementId) => `/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}/mover`;

async function request(harness, path, {
  session = 'creator-a',
  csrf = sessionCsrf[session],
  origin = SITE_ORIGIN,
  method = 'GET',
  body,
} = {}) {
  return callApi(harness, path, { session, csrf, origin, method, ...(body === undefined ? {} : { body }) });
}

async function response(response) {
  return { response, status: response.status, body: await responseJson(response) };
}

async function move(harness, seriesId, placementId, body, options = {}) {
  const result = await response(await request(harness, MOVE_PATH(seriesId, placementId), {
    ...options,
    method: options.method ?? 'POST',
    body,
  }));
  assert.match(result.response.headers.get('cache-control') ?? '', /no-store/);
  return result;
}

async function setup(rows, {
  series = [{ id: SERIES, profileId: OWNER }],
  profile = {},
} = {}) {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock, profile);
  for (const item of series) seedMoveSeries(harness.mock, item);
  seedRows(harness, rows);
  return harness;
}

function seedRows(harness, rows, { profileId = OWNER } = {}) {
  const seededResources = new Set();
  for (const row of rows) {
    const resourceId = row.resourceId ?? `resource-${row.id}`;
    if (!seededResources.has(resourceId)) {
      seedMoveResource(harness.mock, {
        id: resourceId,
        title: row.title ?? `Título ${row.id}`,
        url: `https://example.com/series-move/${encodeURIComponent(resourceId)}`,
        hidden: row.hidden ?? false,
        version: row.resourceVersion ?? 1,
      });
      seededResources.add(resourceId);
    }
    const seriesMap = Object.fromEntries(Object.entries(row.seriesPositions ?? {})
      .map(([seriesId, position]) => [seriesId, { position }]));
    if (row.series) Object.assign(seriesMap, structuredClone(row.series));
    seedMovePlacement(harness.mock, {
      id: row.id,
      profileId: row.profileId ?? profileId,
      resourceId,
      position: row.position ?? 0,
      featured: row.featured ?? false,
      selectedForDirectory: row.selectedForDirectory ?? true,
      version: row.version ?? 1,
      ...(Object.keys(seriesMap).length ? { series: seriesMap } : {}),
    });
  }
}

async function owner(harness, session = 'creator-a') {
  const result = await response(await request(harness, '/api/creador/perfil', { session }));
  assert.equal(result.status, 200);
  return result.body;
}

function rawSnapshot(harness, {
  profileId = OWNER,
  seriesIds = [SERIES],
  placementIds = [],
  resourceIds = [],
} = {}) {
  return structuredClone({
    profile: harness.mock.read('profiles-test', { pk: `PROFILE#${profileId}`, sk: 'META' }),
    series: seriesIds.map((id) => harness.mock.read('profiles-test', { pk: `PROFILE#${profileId}`, sk: `SERIES#${id}` })),
    placements: placementIds.map((id) => harness.mock.read('profiles-test', { pk: `PROFILE#${profileId}`, sk: `PLACEMENT#${id}` })),
    resources: resourceIds.map((id) => harness.mock.read('catalog-test', { id })),
  });
}

function seriesOrder(placements, seriesId) {
  return placements.filter((placement) => placement.series && Object.hasOwn(placement.series, seriesId))
    .sort((left, right) => left.series[seriesId].position - right.series[seriesId].position
      || left.id.localeCompare(right.id))
    .map(({ id }) => id);
}

function insertedOrder(placements, seriesId, targetId, targetPosition) {
  const order = seriesOrder(placements, seriesId);
  const index = order.indexOf(targetId);
  assert.notEqual(index, -1);
  order.splice(index, 1);
  order.splice(targetPosition - 1, 0, targetId);
  return order;
}

function sortReceipts(changes) {
  return [...changes].sort((left, right) => `${left.entity}:${left.id}`.localeCompare(`${right.entity}:${right.id}`));
}

function assertSeriesMutationOnly(before, after, seriesId) {
  const afterById = new Map(after.placements.map((placement) => [placement.id, placement]));
  const changed = [];
  for (const placement of before.placements) {
    const next = afterById.get(placement.id);
    const oldPosition = placement.series?.[seriesId]?.position;
    const newPosition = next.series?.[seriesId]?.position;
    if (oldPosition !== newPosition) {
      changed.push(placement.id);
      const expected = structuredClone(placement);
      expected.series[seriesId].position = newPosition;
      expected.version = placement.version + 1;
      assert.deepEqual(next, expected, `${placement.id} changes only the selected series position and its placement version`);
    } else {
      assert.deepEqual(next, placement, `${placement.id} remains unchanged`);
    }
  }
  assert.equal(after.profile.version, before.profile.version + (changed.length ? 1 : 0));
  const beforeProfileFields = { ...before.profile };
  const afterProfileFields = { ...after.profile };
  delete beforeProfileFields.version;
  delete beforeProfileFields.updatedAt;
  delete afterProfileFields.version;
  const afterUpdatedAt = afterProfileFields.updatedAt;
  delete afterProfileFields.updatedAt;
  assert.deepEqual(afterProfileFields, beforeProfileFields, 'a chapter move changes no other profile field');
  if (changed.length) assert.ok(Number.isSafeInteger(afterUpdatedAt));
  assert.deepEqual(after.series, before.series, 'the series record is conditioned, not mutated');
  assert.deepEqual(after.resources, before.resources, 'catalog metadata and versions are not part of chapter order');
  return changed;
}

function assertVersionReceipts(body, before, after, changedIds) {
  const expected = [];
  if (changedIds.length) {
    expected.push({ entity: 'profile', id: before.profile.id, before: before.profile.version, after: after.profile.version });
  }
  const afterById = new Map(after.placements.map((placement) => [placement.id, placement]));
  for (const id of changedIds) {
    const initial = before.placements.find((placement) => placement.id === id);
    expected.push({ entity: 'placement', id, before: initial.version, after: afterById.get(id).version });
  }
  assert.deepEqual(sortReceipts(body.versionChanges), sortReceipts(expected));
  assert.ok(body.versionChanges.every(({ entity }) => entity === 'profile' || entity === 'placement'),
    'chapter ordering does not report series or resource receipts');
}

function assertLinkSubset(body, targetId, changedIds, before, after, activeSeriesIds) {
  const expectedIds = [...new Set([targetId, ...changedIds])].sort();
  assert.deepEqual(body.links.map(({ placementId }) => placementId).sort(), expectedIds);
  const afterById = new Map(after.placements.map((placement) => [placement.id, placement]));
  const beforeById = new Map(before.placements.map((placement) => [placement.id, placement]));
  for (const link of body.links) {
    const next = afterById.get(link.placementId);
    assert.equal(link.position, next.position);
    assert.equal(link.featured, next.featured);
    assert.equal(link.selectedForDirectory, next.selectedForDirectory);
    assert.equal(link.placementVersion, next.version);
    assert.equal(link.resourceId, next.resourceId);
    const previousResource = before.resources.find((resource) => resource.id === next.resourceId);
    if (previousResource) assert.equal(link.resourceVersion, previousResource.version ?? 0);
    const expectedMemberships = Object.entries(next.series ?? {})
      .filter(([seriesId]) => activeSeriesIds.includes(seriesId))
      .map(([seriesId, membership]) => ({ seriesId, position: membership.position }))
      .sort((left, right) => left.position - right.position || left.seriesId.localeCompare(right.seriesId));
    assert.deepEqual(link.series, expectedMemberships, `${link.placementId} has the candidate memberships from its precommit snapshot`);
    assert.ok(beforeById.has(link.placementId));
  }
}

function largeUnknownSeriesMap(count) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [
    `m${index.toString(36).padStart(5, '0')}${'x'.repeat(122)}`,
    { position: index },
  ]));
}

function physicalPlacementSize(placement, profileId = OWNER) {
  return storedAttributeBytes({ ...placement, pk: `PROFILE#${profileId}`, sk: `PLACEMENT#${placement.id}` });
}

function physicalProfileSize(profile, profileId = OWNER) {
  return storedAttributeBytes({ ...profile, pk: `PROFILE#${profileId}`, sk: 'META' });
}

function physicalSeriesSize(series, profileId = OWNER) {
  return storedAttributeBytes({ ...series, pk: `PROFILE#${profileId}`, sk: `SERIES#${series.id}` });
}

function exactPlacementLimit(harness, placementId) {
  const row = harness.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: `PLACEMENT#${placementId}` });
  row.series.legacy ??= '';
  const baseSize = storedAttributeBytes(row);
  row.series.legacy = 'x'.repeat(ITEM_LIMIT - baseSize);
  assert.equal(storedAttributeBytes(row), ITEM_LIMIT, `${placementId} physical item is exactly 400 KiB`);
  harness.mock.seed('profiles-test', row);
  return row;
}

test('0 chapters rechaza un no-miembro; 1 capítulo hace no-op con CAS del perfil, serie y target', async () => {
  const empty = await setup([{ id: 'outside', position: 5, seriesPositions: {} }]);
  const missing = await move(empty, SERIES, 'outside', {
    profileVersion: 1, seriesVersion: 1, placementVersion: 1, targetPosition: 1,
  });
  assert.equal(missing.status, 404);
  assert.deepEqual(moveTransactionMetrics(empty.mock), []);

  const single = await setup([{ id: 'only', position: 7, version: 0, seriesPositions: { [SERIES]: MAX_SAFE } }], {
    profile: { version: 0 },
    series: [{ id: SERIES, profileId: OWNER, version: 1 }],
  });
  const before = rawSnapshot(single, { seriesIds: [SERIES], placementIds: ['only'], resourceIds: ['resource-only'] });
  const saved = await move(single, SERIES, 'only', {
    profileVersion: 0, seriesVersion: 1, placementVersion: 0, targetPosition: 1,
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.versionChanges, []);
  assert.deepEqual(saved.body.links.map(({ placementId, series }) => ({ placementId, series })), [
    { placementId: 'only', series: [{ seriesId: SERIES, position: MAX_SAFE }] },
  ]);
  assert.deepEqual(rawSnapshot(single, { seriesIds: [SERIES], placementIds: ['only'], resourceIds: ['resource-only'] }), before);
  assert.deepEqual(moveTransactionMetrics(single.mock), [{ actionCount: 3 }]);
  const actions = single.mock.transactions[0].input.TransactItems;
  assert.equal(actions.length, 3);
  assert.ok(actions.every((action) => action.ConditionCheck), 'no-op sends only the three physical CAS conditions');
  assert.deepEqual(actions.map(({ ConditionCheck }) => ConditionCheck.Key.sk).sort(), [
    'META', 'PLACEMENT#only', `SERIES#${SERIES}`,
  ]);
});

test('58 capítulos usan todo el orden de la serie, cuentan ocultos y destacados, y sólo cambian la pertenencia elegida', async () => {
  const ids = Array.from({ length: 58 }, (_, index) => `chapter-${String(index).padStart(3, '0')}`);
  const rows = ids.map((id, index) => ({
    id,
    position: 900 - index,
    featured: index % 3 === 0,
    selectedForDirectory: index % 4 !== 0,
    hidden: index === 1,
    seriesPositions: {
      [SERIES]: index * 10,
      ...(index % 7 === 0 ? { [OTHER_SERIES]: 100 - index } : {}),
      ...(index === 9 ? { 'deleted-series': { inert: true } } : {}),
    },
    ...(index === 9 ? { series: { 'deleted-series': { legacy: 'keep this raw reference' } } } : {}),
  }));
  const harness = await setup(rows, {
    series: [
      { id: SERIES, profileId: OWNER, version: 4 },
      { id: OTHER_SERIES, profileId: OWNER, version: 8 },
    ],
  });
  const before = rawSnapshot(harness, {
    seriesIds: [SERIES, OTHER_SERIES], placementIds: ids, resourceIds: ids.map((id) => `resource-${id}`),
  });
  const targetId = ids.at(-1);
  const desired = insertedOrder(before.placements, SERIES, targetId, 2);
  const saved = await move(harness, SERIES, targetId, {
    profileVersion: before.profile.version,
    seriesVersion: before.series[0].version,
    placementVersion: before.placements.at(-1).version,
    targetPosition: 2,
  });
  assert.equal(saved.status, 200);
  const after = rawSnapshot(harness, {
    seriesIds: [SERIES, OTHER_SERIES], placementIds: ids, resourceIds: ids.map((id) => `resource-${id}`),
  });
  assert.deepEqual(seriesOrder(after.placements, SERIES), desired);
  const changed = assertSeriesMutationOnly(before, after, SERIES);
  assert.deepEqual(changed, [targetId], 'an available integer gap changes only the moved chapter');
  assertVersionReceipts(saved.body, before, after, changed);
  assertLinkSubset(saved.body, targetId, changed, before, after, [SERIES, OTHER_SERIES]);
  assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 3 }]);
  assert.equal(after.series[0].version, before.series[0].version);
  assert.equal(after.placements[9].series['deleted-series'].legacy, 'keep this raw reference');

  const ownerLinks = await owner(harness);
  assert.equal(ownerLinks.links.find(({ placementId }) => placementId === ids[1]).hidden, true);
  const publicPage = await harness.service.readPublicSeries('orden-prueba', 'serie-prueba');
  assert.equal(publicPage.status, 200);
  assert.deepEqual(publicPage.links.map(({ placementId }) => placementId), desired.filter((id) => id !== ids[1]));
});

test('una ventana densa conserva la cola con huecos y los empates usan placementId.localeCompare', async () => {
  const prefix = ['a-00', 'a-01', 'a-02'];
  const dense = ['p-03', 'p-04', 'p-05'];
  const targetId = 'z-target';
  const tail = ['p-07', 'p-08', 'p-09', 'p-10'];
  const ids = [...prefix, ...dense, targetId, ...tail];
  const rows = [
    ...prefix.map((id) => ({ id, position: 700, seriesPositions: { [SERIES]: 0 } })),
    ...dense.map((id, index) => ({ id, position: 600 - index, seriesPositions: { [SERIES]: (index + 1) * 10 } })),
    { id: targetId, position: 1, seriesPositions: { [SERIES]: 40, [OTHER_SERIES]: 3 } },
    ...tail.map((id, index) => ({
      id,
      position: 100 + index,
      featured: index % 2 === 0,
      seriesPositions: { [SERIES]: (index + 5) * 10, [OTHER_SERIES]: index },
    })),
  ];
  const harness = await setup(rows, {
    series: [
      { id: SERIES, profileId: OWNER },
      { id: OTHER_SERIES, profileId: OWNER },
    ],
  });
  const before = rawSnapshot(harness, { seriesIds: [SERIES, OTHER_SERIES], placementIds: ids });
  const desired = insertedOrder(before.placements, SERIES, targetId, 1);
  const saved = await move(harness, SERIES, targetId, {
    profileVersion: before.profile.version,
    seriesVersion: before.series[0].version,
    placementVersion: before.placements[6].version,
    targetPosition: 1,
  });
  assert.equal(saved.status, 200);
  const after = rawSnapshot(harness, { seriesIds: [SERIES, OTHER_SERIES], placementIds: ids });
  assert.deepEqual(seriesOrder(after.placements, SERIES), desired);
  for (const id of tail) {
    const index = ids.indexOf(id);
    assert.deepEqual(after.placements[index], before.placements[index], `${id} stays outside the necessary window`);
  }
  assert.deepEqual(after.placements.map(({ series }) => series?.[OTHER_SERIES] ?? null),
    before.placements.map(({ series }) => series?.[OTHER_SERIES] ?? null));
  const changed = assertSeriesMutationOnly(before, after, SERIES);
  assert.ok(changed.every((id) => [...prefix, ...dense, targetId].includes(id)));
  assert.ok(moveTransactionMetrics(harness.mock)[0].actionCount < 1 + ids.length,
    'the local insertion does not rewrite the full chapter collection');
  assertVersionReceipts(saved.body, before, after, changed);
  assertLinkSubset(saved.body, targetId, changed, before, after, [SERIES, OTHER_SERIES]);

  const edge = await setup([
    { id: 'b-middle', position: 20, version: 0, seriesPositions: { [SERIES]: 0 } },
    { id: 'a-first', position: 10, version: 0, seriesPositions: { [SERIES]: 0 } },
    { id: 'z-last', position: 30, version: 0, seriesPositions: { [SERIES]: MAX_SAFE } },
  ], { profile: { version: 0 }, series: [{ id: SERIES, profileId: OWNER, version: 1 }] });
  const edgeBefore = rawSnapshot(edge, { seriesIds: [SERIES], placementIds: ['a-first', 'b-middle', 'z-last'] });
  assert.deepEqual(seriesOrder(edgeBefore.placements, SERIES), ['a-first', 'b-middle', 'z-last']);
  const edgeOrder = insertedOrder(edgeBefore.placements, SERIES, 'z-last', 1);
  const edgeResult = await move(edge, SERIES, 'z-last', {
    profileVersion: 0, seriesVersion: 1, placementVersion: 0, targetPosition: 1,
  });
  assert.equal(edgeResult.status, 200);
  const edgeAfter = rawSnapshot(edge, { seriesIds: [SERIES], placementIds: ['a-first', 'b-middle', 'z-last'] });
  assert.deepEqual(seriesOrder(edgeAfter.placements, SERIES), edgeOrder);
  assert.ok(edgeAfter.placements.every(({ series }) => Number.isSafeInteger(series[SERIES].position) && series[SERIES].position >= 0));
  assertVersionReceipts(edgeResult.body, edgeBefore, edgeAfter, assertSeriesMutationOnly(edgeBefore, edgeAfter, SERIES));
});

test('50 capítulos densos permiten mover al principio y al final con receipts físicos exactos', async () => {
  const ids = Array.from({ length: 49 }, (_, index) => `a-${String(index).padStart(3, '0')}`);
  ids.push('z-target');
  const harness = await setup(ids.map((id, index) => ({
    id,
    position: index * 10,
    featured: index % 2 === 0,
    seriesPositions: { [SERIES]: 0 },
  })));
  const before = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids });
  const target = before.placements.at(-1);
  const desired = insertedOrder(before.placements, SERIES, target.id, 1);
  const first = await move(harness, SERIES, target.id, {
    profileVersion: before.profile.version, seriesVersion: before.series[0].version,
    placementVersion: target.version, targetPosition: 1,
  });
  assert.equal(first.status, 200);
  const afterFirst = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids });
  assert.deepEqual(seriesOrder(afterFirst.placements, SERIES), desired);
  const changedFirst = assertSeriesMutationOnly(before, afterFirst, SERIES);
  assert.equal(changedFirst.length, 49);
  assertVersionReceipts(first.body, before, afterFirst, changedFirst);
  assertLinkSubset(first.body, target.id, changedFirst, before, afterFirst, [SERIES]);
  assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 52 }],
    '49 changed chapters plus target, profile, and series conditions are 52 physical actions');

  const lastBody = await owner(harness);
  const savedTarget = afterFirst.placements.at(-1);
  const backOrder = insertedOrder(afterFirst.placements, SERIES, target.id, 50);
  const back = await move(harness, SERIES, target.id, {
    profileVersion: lastBody.profile.version,
    seriesVersion: afterFirst.series[0].version,
    placementVersion: savedTarget.version,
    targetPosition: 50,
  });
  assert.equal(back.status, 200);
  const afterBack = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids });
  assert.deepEqual(seriesOrder(afterBack.placements, SERIES), backOrder);
  const changedBack = assertSeriesMutationOnly(afterFirst, afterBack, SERIES);
  assert.deepEqual(changedBack, [target.id]);
  assertVersionReceipts(back.body, afterFirst, afterBack, changedBack);
  assertLinkSubset(back.body, target.id, changedBack, afterFirst, afterBack, [SERIES]);
  assert.deepEqual(moveTransactionMetrics(harness.mock).map(({ actionCount }) => actionCount), [52, 3]);
});

test('150 miembros con huecos permiten mover el último al primero con sólo tres acciones', async () => {
  const ids = Array.from({ length: 149 }, (_, index) => `chapter-${String(index).padStart(3, '0')}`);
  ids.push('z-target');
  const harness = await setup(ids.map((id, index) => ({
    id,
    position: index,
    seriesPositions: { [SERIES]: (index + 1) * 10 },
  })));
  const before = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids });
  const target = before.placements.at(-1);
  assert.deepEqual(seriesOrder(before.placements, SERIES), ids);
  assert.equal(before.placements[0].series[SERIES].position, 10);
  const desired = insertedOrder(before.placements, SERIES, target.id, 1);

  const saved = await move(harness, SERIES, target.id, {
    profileVersion: before.profile.version, seriesVersion: before.series[0].version,
    placementVersion: target.version, targetPosition: 1,
  });
  assert.equal(saved.status, 200);
  const after = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids });
  assert.deepEqual(seriesOrder(after.placements, SERIES), desired);
  const changed = assertSeriesMutationOnly(before, after, SERIES);
  assert.deepEqual(changed, [target.id]);
  assert.ok(after.placements.at(-1).series[SERIES].position < 10,
    'a free integer before the first chapter is sufficient, regardless of its exact value');
  assertVersionReceipts(saved.body, before, after, changed);
  assertLinkSubset(saved.body, target.id, changed, before, after, [SERIES]);
  assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 3 }],
    'the target put plus profile and series conditions suffice even beyond 100 members');
});

test('98 participantes físicos caben; 99 se rechazan antes del send y ofrecen una inserción intermedia', async () => {
  const acceptedIds = Array.from({ length: 97 }, (_, index) => `a-${String(index).padStart(3, '0')}`);
  acceptedIds.push('z-target');
  const accepted = await setup(acceptedIds.map((id) => ({ id, seriesPositions: { [SERIES]: 0 } })));
  const acceptedBefore = rawSnapshot(accepted, { seriesIds: [SERIES], placementIds: acceptedIds });
  const acceptedResponse = await move(accepted, SERIES, 'z-target', {
    profileVersion: acceptedBefore.profile.version, seriesVersion: acceptedBefore.series[0].version,
    placementVersion: acceptedBefore.placements.at(-1).version, targetPosition: 1,
  });
  assert.equal(acceptedResponse.status, 200);
  assert.deepEqual(moveTransactionMetrics(accepted.mock), [{ actionCount: 100 }]);
  const acceptedAfter = rawSnapshot(accepted, { seriesIds: [SERIES], placementIds: acceptedIds });
  assert.deepEqual(seriesOrder(acceptedAfter.placements, SERIES), insertedOrder(acceptedBefore.placements, SERIES, 'z-target', 1));

  const rejectedIds = Array.from({ length: 98 }, (_, index) => `a-${String(index).padStart(3, '0')}`);
  rejectedIds.push('z-target');
  const rejected = await setup(rejectedIds.map((id) => ({ id, seriesPositions: { [SERIES]: 0 } })));
  const before = rawSnapshot(rejected, { seriesIds: [SERIES], placementIds: rejectedIds });
  const response = await move(rejected, SERIES, 'z-target', {
    profileVersion: before.profile.version, seriesVersion: before.series[0].version,
    placementVersion: before.placements.at(-1).version, targetPosition: 1,
  });
  assert.equal(response.status, 422);
  assert.equal(response.body.error, 'ORDER_MOVE_LIMIT');
  assert.ok(Number.isSafeInteger(response.body.viablePosition));
  assert.ok(response.body.viablePosition > 1 && response.body.viablePosition < rejectedIds.length);
  assert.deepEqual(rawSnapshot(rejected, { seriesIds: [SERIES], placementIds: rejectedIds }), before);
  assert.deepEqual(moveTransactionMetrics(rejected.mock), []);

  const suggested = await move(rejected, SERIES, 'z-target', {
    profileVersion: before.profile.version, seriesVersion: before.series[0].version,
    placementVersion: before.placements.at(-1).version, targetPosition: response.body.viablePosition,
  });
  assert.equal(suggested.status, 200);
  assert.ok(moveTransactionMetrics(rejected.mock)[0].actionCount <= 100);
  const afterSuggestion = rawSnapshot(rejected, { seriesIds: [SERIES], placementIds: rejectedIds });
  assert.deepEqual(seriesOrder(afterSuggestion.placements, SERIES),
    insertedOrder(before.placements, SERIES, 'z-target', response.body.viablePosition));
});

test('el preflight agregado cuenta timestamps de la serie raw y la sugerencia también cabe en bytes reales', async () => {
  const largeMap = largeUnknownSeriesMap(2_100);
  const ids = Array.from({ length: 12 }, (_, index) => `a-${String(index).padStart(3, '0')}`);
  ids.push('z-target');
  const rows = ids.map((id) => ({
    id,
    version: 1,
    seriesPositions: { [SERIES]: 0 },
    series: { ...largeMap, legacy: '' },
  }));
  const harness = await setup(rows);
  const seriesRaw = harness.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: `SERIES#${SERIES}` });
  seriesRaw.createdAt = 1_800_000_000_000;
  seriesRaw.updatedAt = 1_800_000_000_000;
  harness.mock.seed('profiles-test', seriesRaw);
  const before = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids });

  const changedRows = before.placements.filter(({ id }) => id !== 'z-target').map((placement) => {
    const candidate = structuredClone(placement);
    candidate.series[SERIES].position = 1;
    candidate.version += 1;
    return candidate;
  });
  const targetSnapshot = before.placements.find(({ id }) => id === 'z-target');
  const candidateProfile = { ...before.profile, version: before.profile.version + 1, updatedAt: Date.UTC(2026, 9, 23) };
  const bytesWithoutSeries = physicalProfileSize(candidateProfile)
    + physicalPlacementSize(targetSnapshot)
    + changedRows.reduce((sum, placement) => sum + physicalPlacementSize(placement), 0);
  const rawSeriesBytes = physicalSeriesSize(seriesRaw);
  const dtoSeriesBytes = storedAttributeBytes({
    pk: `PROFILE#${OWNER}`,
    sk: `SERIES#${SERIES}`,
    id: seriesRaw.id,
    name: seriesRaw.name,
    slug: seriesRaw.slug,
    version: seriesRaw.version,
  });
  const basePhysicalBytes = bytesWithoutSeries + rawSeriesBytes;
  assert.ok(basePhysicalBytes < TRANSACTION_LIMIT, 'candidate placement images fit before adding stale-map payload');
  const mapFillerBytes = Math.ceil((TRANSACTION_LIMIT - basePhysicalBytes + 1) / ids.length);
  assert.ok(mapFillerBytes > 0);
  for (const id of ids) {
    const row = harness.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: `PLACEMENT#${id}` });
    row.series.legacy = 'x'.repeat(mapFillerBytes);
    harness.mock.seed('profiles-test', row);
  }
  const finalRows = ids.map((id) => harness.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: `PLACEMENT#${id}` }));
  const finalChangedRows = finalRows.filter(({ id }) => id !== 'z-target').map((placement) => {
    const candidate = structuredClone(placement);
    candidate.series[SERIES].position = 1;
    candidate.version += 1;
    return candidate;
  });
  const finalTargetSnapshot = finalRows.find(({ id }) => id === 'z-target');
  const withoutSeriesSnapshot = physicalProfileSize(candidateProfile)
    + physicalPlacementSize(finalTargetSnapshot)
    + finalChangedRows.reduce((sum, placement) => sum + physicalPlacementSize(placement), 0);
  const fullRawImageBytes = withoutSeriesSnapshot + physicalSeriesSize(seriesRaw);
  const cleanedSeriesImageBytes = withoutSeriesSnapshot + dtoSeriesBytes;
  assert.ok(cleanedSeriesImageBytes <= TRANSACTION_LIMIT,
    'a cleaned series DTO would fit, so this case distinguishes it from the full raw check image');
  assert.ok(fullRawImageBytes > TRANSACTION_LIMIT,
    'the full raw series snapshot, including timestamps and physical keys, crosses 4 MiB');
  assert.ok(finalRows.every((placement) => physicalPlacementSize(placement) < ITEM_LIMIT));
  assert.ok(finalChangedRows.every((placement) => physicalPlacementSize(placement) < ITEM_LIMIT));

  const beforeMove = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids });
  const full = await move(harness, SERIES, 'z-target', {
    profileVersion: beforeMove.profile.version, seriesVersion: beforeMove.series[0].version,
    placementVersion: beforeMove.placements.at(-1).version, targetPosition: 1,
  });
  assert.equal(full.status, 422);
  assert.equal(full.body.error, 'ORDER_MOVE_LIMIT');
  assert.ok(Number.isSafeInteger(full.body.viablePosition));
  assert.ok(full.body.viablePosition > 1 && full.body.viablePosition < ids.length);
  assert.deepEqual(rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids }), beforeMove);
  assert.deepEqual(moveTransactionMetrics(harness.mock), []);

  const suggested = await move(harness, SERIES, 'z-target', {
    profileVersion: beforeMove.profile.version, seriesVersion: beforeMove.series[0].version,
    placementVersion: beforeMove.placements.at(-1).version, targetPosition: full.body.viablePosition,
  });
  assert.equal(suggested.status, 200);
  assert.ok(moveTransactionMetrics(harness.mock)[0].actionCount <= 100);
  assert.ok(moveTransactionPhysicalBytes(harness.mock)[0] <= TRANSACTION_LIMIT,
    'the actual TransactWrite images, including the raw series snapshot, fit 4 MiB');
  const after = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids });
  assert.deepEqual(seriesOrder(after.placements, SERIES), insertedOrder(beforeMove.placements, SERIES, 'z-target', full.body.viablePosition));
});

test('400 KiB detecta el delta de la posición anidada aunque placement.position no cambie', async () => {
  const harness = await setup([
    { id: 'a-before', seriesPositions: { [SERIES]: 0 } },
    { id: 'z-target', position: 0, version: 1, seriesPositions: { [SERIES]: 100 }, series: { legacy: '' } },
    { id: 'm-large', position: 0, version: 10_000, seriesPositions: { [SERIES]: 101 }, series: { legacy: '' } },
  ]);
  const target = exactPlacementLimit(harness, 'z-target');
  const large = exactPlacementLimit(harness, 'm-large');
  const targetVersionOnly = structuredClone(target);
  targetVersionOnly.version = 2;
  const targetPositionCandidate = structuredClone(target);
  targetPositionCandidate.series[SERIES].position = 101;
  targetPositionCandidate.version = 2;
  assert.equal(targetPositionCandidate.position, target.position,
    'the global placement position is unchanged by this selected-series move');
  assert.equal(physicalPlacementSize(targetVersionOnly), ITEM_LIMIT,
    'target placement version 1→2 does not change the physical item size');
  assert.equal(physicalPlacementSize(targetPositionCandidate), ITEM_LIMIT + 1,
    'only the selected membership position 100→101 adds one byte');
  for (const nestedPosition of [0, 100]) {
    const largeCandidate = structuredClone(large);
    largeCandidate.series[SERIES].position = nestedPosition;
    largeCandidate.version = 10_001;
    assert.ok(physicalPlacementSize(largeCandidate) > ITEM_LIMIT,
      'version 10000→10001 grows two bytes and the nested position can save at most one');
  }
  const before = rawSnapshot(harness, {
    seriesIds: [SERIES], placementIds: ['a-before', 'z-target', 'm-large'],
    resourceIds: ['resource-a-before', 'resource-z-target', 'resource-m-large'],
  });
  assert.equal(physicalPlacementSize(target), ITEM_LIMIT);
  assert.equal(physicalPlacementSize(large), ITEM_LIMIT);
  const result = await move(harness, SERIES, 'z-target', {
    profileVersion: before.profile.version, seriesVersion: before.series[0].version,
    placementVersion: target.version, targetPosition: 3,
  });
  assert.equal(result.status, 422);
  assert.equal(result.body.error, 'ORDER_MOVE_LIMIT');
  assert.equal(Object.hasOwn(result.body, 'viablePosition'), false,
    'there is no ordinal between current two and requested three');
  assert.deepEqual(rawSnapshot(harness, {
    seriesIds: [SERIES], placementIds: ['a-before', 'z-target', 'm-large'],
    resourceIds: ['resource-a-before', 'resource-z-target', 'resource-m-large'],
  }), before);
  assert.deepEqual(moveTransactionMetrics(harness.mock), []);
});

test('si el ordinal adyacente no cabe, el mover de capítulo ofrece y confirma otro intermedio viable', async () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const harness = await setup([
    { id: 'a', position: 0, version: 1, seriesPositions: { [SERIES]: 0 } },
    { id: 'b', position: 0, version: 1, seriesPositions: { [SERIES]: 0 } },
    { id: 'c', position: 0, version: 100, seriesPositions: { [SERIES]: 0 }, series: { legacy: '' } },
    { id: 'd', position: 0, version: 100, seriesPositions: { [SERIES]: 1 }, series: { legacy: '' } },
    { id: 'e', position: 0, version: 100, seriesPositions: { [SERIES]: 1 }, series: { legacy: '' } },
  ]);
  for (const id of ['c', 'd', 'e']) exactPlacementLimit(harness, id);
  const before = rawSnapshot(harness, {
    seriesIds: [SERIES], placementIds: ids, resourceIds: ids.map((id) => `resource-${id}`),
  });
  assert.deepEqual(seriesOrder(before.placements, SERIES), ids);
  const cAtOne = structuredClone(before.placements[2]);
  cAtOne.series[SERIES].position = 1;
  cAtOne.version = 101;
  assert.equal(physicalPlacementSize(cAtOne), ITEM_LIMIT + 1,
    'ordinal two requires changing chapter c and grows its exact-limit item by one byte');
  for (const id of ['d', 'e']) {
    const current = before.placements.find((placement) => placement.id === id);
    const candidate = structuredClone(current);
    candidate.series[SERIES].position = 0;
    candidate.version = 101;
    assert.equal(physicalPlacementSize(candidate), ITEM_LIMIT + 1);
  }

  const full = await move(harness, SERIES, 'a', {
    profileVersion: before.profile.version, seriesVersion: before.series[0].version,
    placementVersion: before.placements[0].version, targetPosition: 4,
  });
  assert.equal(full.status, 422);
  assert.equal(full.body.error, 'ORDER_MOVE_LIMIT');
  assert.equal(full.body.viablePosition, 3);
  assert.deepEqual(rawSnapshot(harness, {
    seriesIds: [SERIES], placementIds: ids, resourceIds: ids.map((id) => `resource-${id}`),
  }), before);
  assert.deepEqual(moveTransactionMetrics(harness.mock), []);

  const adjacent = await move(harness, SERIES, 'a', {
    profileVersion: before.profile.version, seriesVersion: before.series[0].version,
    placementVersion: before.placements[0].version, targetPosition: 2,
  });
  assert.equal(adjacent.status, 422);
  assert.equal(adjacent.body.error, 'ORDER_MOVE_LIMIT');
  assert.equal(Object.hasOwn(adjacent.body, 'viablePosition'), false,
    'there is no intermediate ordinal between one and two');
  assert.deepEqual(moveTransactionMetrics(harness.mock), []);

  const saved = await move(harness, SERIES, 'a', {
    profileVersion: before.profile.version, seriesVersion: before.series[0].version,
    placementVersion: before.placements[0].version, targetPosition: full.body.viablePosition,
  });
  assert.equal(saved.status, 200);
  const after = rawSnapshot(harness, {
    seriesIds: [SERIES], placementIds: ids, resourceIds: ids.map((id) => `resource-${id}`),
  });
  assert.deepEqual(seriesOrder(after.placements, SERIES), insertedOrder(before.placements, SERIES, 'a', 3));
  const changed = assertSeriesMutationOnly(before, after, SERIES);
  assert.deepEqual(changed, ['a']);
  assertVersionReceipts(saved.body, before, after, changed);
  assertLinkSubset(saved.body, 'a', changed, before, after, [SERIES]);
  assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 3 }]);
});

test('el movimiento devuelve snapshots candidatos aunque otro escritor cambie el target después del commit', async () => {
  const ids = ['a-first', 'b-middle', 'z-target'];
  const harness = await setup([
    { id: ids[0], position: 10, seriesPositions: { [SERIES]: 0 } },
    { id: ids[1], position: 20, seriesPositions: { [SERIES]: 10 } },
    { id: ids[2], position: 30, seriesPositions: { [SERIES]: 20 } },
  ]);
  const before = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids });
  const targetVersion = before.placements[2].version;
  const desired = insertedOrder(before.placements, SERIES, 'z-target', 2);
  harness.mock.mutateAfterNextTransaction(({ tables }) => {
    const profileRows = tables.get('profiles-test');
    const targetKey = `PROFILE#${OWNER}\u0000PLACEMENT#z-target`;
    const target = profileRows.get(targetKey);
    target.series[SERIES].position = MAX_SAFE;
    target.version += 1;
    profileRows.set(targetKey, target);
    const profileKey = `PROFILE#${OWNER}\u0000META`;
    const profile = profileRows.get(profileKey);
    profile.version += 1;
    profileRows.set(profileKey, profile);
  });

  const saved = await move(harness, SERIES, 'z-target', {
    profileVersion: before.profile.version, seriesVersion: before.series[0].version,
    placementVersion: targetVersion, targetPosition: 2,
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.links.map(({ placementId }) => placementId), ['z-target']);
  const responseTarget = saved.body.links[0];
  const stored = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids });
  assert.ok(responseTarget.series.find(({ seriesId }) => seriesId === SERIES).position > 0);
  assert.ok(responseTarget.series.find(({ seriesId }) => seriesId === SERIES).position < 10);
  assert.equal(responseTarget.placementVersion, targetVersion + 1);
  assert.equal(stored.placements[2].series[SERIES].position, MAX_SAFE);
  assert.equal(stored.placements[2].version, targetVersion + 2);
  assert.equal(stored.series[0].version, before.series[0].version, 'the command does not adopt a version of the series record');
  assert.deepEqual(seriesOrder(before.placements.map((placement, index) => index === 2
    ? { ...placement, series: { ...placement.series, [SERIES]: { position: responseTarget.series.find(({ seriesId }) => seriesId === SERIES).position } } }
    : placement), SERIES), desired);
  assert.ok(saved.body.versionChanges.some(({ entity, id }) => entity === 'placement' && id === 'z-target'));
  assert.ok(saved.body.versionChanges.every(({ entity }) => entity !== 'series'));
});

test('la sesión sólo mueve su propia referencia compartida y deja intactos el otro dueño y sus mapas', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  seedMoveProfile(harness.mock, {
    accountId: 'private-account-b', profileId: OTHER_OWNER, displayName: 'Otra cuenta', slug: 'otra-cuenta',
  });
  seedMoveSeries(harness.mock, { id: SERIES, profileId: OWNER });
  seedMoveSeries(harness.mock, { id: OTHER_SERIES, profileId: OTHER_OWNER });
  seedMoveResource(harness.mock, { id: 'shared', title: 'Ficha compartida', url: 'https://example.com/shared-series' });
  seedMoveResource(harness.mock, { id: 'owner-a-other', url: 'https://example.com/a-other' });
  seedMovePlacement(harness.mock, {
    id: 'a-shared', profileId: OWNER, resourceId: 'shared', position: 10,
    series: { [SERIES]: { position: 0 }, 'deleted-series': { malformed: 'keep' } },
  });
  seedMovePlacement(harness.mock, {
    id: 'a-other', profileId: OWNER, resourceId: 'owner-a-other', position: 20,
    series: { [SERIES]: { position: 10 } },
  });
  seedMovePlacement(harness.mock, {
    id: 'b-shared', profileId: OTHER_OWNER, resourceId: 'shared', position: 5,
    series: { [OTHER_SERIES]: { position: 0 } },
  });
  const beforeA = rawSnapshot(harness, {
    profileId: OWNER, seriesIds: [SERIES], placementIds: ['a-shared', 'a-other'], resourceIds: ['shared', 'owner-a-other'],
  });
  const beforeB = rawSnapshot(harness, {
    profileId: OTHER_OWNER, seriesIds: [OTHER_SERIES], placementIds: ['b-shared'], resourceIds: ['shared'],
  });
  const saved = await move(harness, SERIES, 'a-shared', {
    profileVersion: beforeA.profile.version, seriesVersion: beforeA.series[0].version,
    placementVersion: beforeA.placements[0].version, targetPosition: 2,
  });
  assert.equal(saved.status, 200);
  const afterA = rawSnapshot(harness, {
    profileId: OWNER, seriesIds: [SERIES], placementIds: ['a-shared', 'a-other'], resourceIds: ['shared', 'owner-a-other'],
  });
  const afterB = rawSnapshot(harness, {
    profileId: OTHER_OWNER, seriesIds: [OTHER_SERIES], placementIds: ['b-shared'], resourceIds: ['shared'],
  });
  assert.deepEqual(afterB, beforeB);
  assert.deepEqual(afterA.resources, beforeA.resources);
  assert.deepEqual(seriesOrder(afterA.placements, SERIES), ['a-other', 'a-shared']);
  assert.equal(afterA.placements[0].series['deleted-series'].malformed, 'keep');
  assert.ok(saved.body.versionChanges.every(({ entity }) => entity === 'profile' || entity === 'placement'));
});

test('un capítulo ajeno, no miembro o de una serie borrada da 404 sin escribir un movimiento', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  seedMoveProfile(harness.mock, {
    accountId: 'private-account-b', profileId: OTHER_OWNER, displayName: 'Otra cuenta', slug: 'otra-cuenta',
  });
  seedMoveSeries(harness.mock, { id: SERIES, profileId: OWNER });
  seedMoveSeries(harness.mock, { id: OTHER_SERIES, profileId: OTHER_OWNER });
  seedMoveResource(harness.mock, { id: 'a-member-resource', url: 'https://example.com/a-member' });
  seedMoveResource(harness.mock, { id: 'a-nonmember-resource', url: 'https://example.com/a-nonmember' });
  seedMoveResource(harness.mock, { id: 'b-foreign-resource', url: 'https://example.com/b-foreign' });
  seedMovePlacement(harness.mock, {
    id: 'a-member', resourceId: 'a-member-resource', profileId: OWNER, position: 0,
    series: { [SERIES]: { position: 0 } },
  });
  seedMovePlacement(harness.mock, { id: 'a-nonmember', resourceId: 'a-nonmember-resource', profileId: OWNER, position: 10 });
  seedMovePlacement(harness.mock, {
    id: 'b-foreign', resourceId: 'b-foreign-resource', profileId: OTHER_OWNER, position: 0,
    series: { [OTHER_SERIES]: { position: 0 } },
  });
  const initial = rawSnapshot(harness, {
    profileId: OWNER, seriesIds: [SERIES], placementIds: ['a-member', 'a-nonmember'],
    resourceIds: ['a-member-resource', 'a-nonmember-resource'],
  });
  const validVersions = {
    profileVersion: initial.profile.version, seriesVersion: initial.series[0].version,
    placementVersion: initial.placements[0].version, targetPosition: 1,
  };
  assert.equal((await move(harness, SERIES, 'a-nonmember', validVersions)).status, 404);
  assert.equal((await move(harness, OTHER_SERIES, 'b-foreign', validVersions)).status, 404);
  assert.equal((await move(harness, SERIES, 'b-foreign', validVersions)).status, 404);
  assert.deepEqual(moveTransactionMetrics(harness.mock), []);

  const deleted = await request(harness, `/api/creador/series/${SERIES}`, {
    method: 'DELETE', body: { version: initial.series[0].version, profileVersion: initial.profile.version },
  });
  assert.equal(deleted.status, 204);
  const transactionCount = moveTransactionMetrics(harness.mock).length;
  const afterDelete = rawSnapshot(harness, {
    profileId: OWNER, seriesIds: [SERIES], placementIds: ['a-member', 'a-nonmember'],
    resourceIds: ['a-member-resource', 'a-nonmember-resource'],
  });
  const deletedMove = await move(harness, SERIES, 'a-member', {
    profileVersion: afterDelete.profile.version, seriesVersion: initial.series[0].version,
    placementVersion: afterDelete.placements[0].version, targetPosition: 1,
  });
  assert.equal(deletedMove.status, 404);
  assert.deepEqual(moveTransactionMetrics(harness.mock).length, transactionCount);
  assert.deepEqual(rawSnapshot(harness, {
    profileId: OWNER, seriesIds: [SERIES], placementIds: ['a-member', 'a-nonmember'],
    resourceIds: ['a-member-resource', 'a-nonmember-resource'],
  }), afterDelete);
});

test('versiones stale y carreras de perfil, serie, target y vecino no dejan escrituras parciales', async () => {
  for (const staleField of ['profileVersion', 'seriesVersion', 'placementVersion']) {
    const harness = await setup([
      { id: 'a-first', seriesPositions: { [SERIES]: 0 } },
      { id: 'z-target', seriesPositions: { [SERIES]: 10 } },
    ]);
    const before = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ['a-first', 'z-target'] });
    const body = {
      profileVersion: before.profile.version, seriesVersion: before.series[0].version,
      placementVersion: before.placements[1].version, targetPosition: 1,
    };
    body[staleField] -= 1;
    const result = await move(harness, SERIES, 'z-target', body);
    assert.equal(result.status, 409, staleField);
    assert.deepEqual(rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ['a-first', 'z-target'] }), before);
    assert.deepEqual(moveTransactionMetrics(harness.mock), []);
  }

  for (const race of ['profile', 'series', 'target', 'neighbor']) {
    const harness = await setup([
      { id: 'a-first', seriesPositions: { [SERIES]: 0 } },
      { id: 'b-middle', seriesPositions: { [SERIES]: 10 } },
      { id: 'z-target', seriesPositions: { [SERIES]: 20 } },
    ]);
    const ids = ['a-first', 'b-middle', 'z-target'];
    const before = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids });
    const key = race === 'profile' ? `PROFILE#${OWNER}\u0000META`
      : race === 'series' ? `PROFILE#${OWNER}\u0000SERIES#${SERIES}`
        : `PROFILE#${OWNER}\u0000PLACEMENT#${race === 'target' ? 'z-target' : 'a-first'}`;
    harness.mock.raceBeforeNextTransaction(({ tables }) => {
      const table = tables.get('profiles-test');
      const current = table.get(key);
      table.set(key, { ...current, version: current.version + 1 });
    });
    const result = await move(harness, SERIES, 'z-target', {
      profileVersion: before.profile.version, seriesVersion: before.series[0].version,
      placementVersion: before.placements[2].version, targetPosition: 1,
    });
    assert.equal(result.status, 409, race);
    const after = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids });
    const expected = structuredClone(before);
    if (race === 'profile') expected.profile.version += 1;
    if (race === 'series') expected.series[0].version += 1;
    if (race === 'target') expected.placements[2].version += 1;
    if (race === 'neighbor') expected.placements[0].version += 1;
    assert.deepEqual(after, expected, `${race} keeps only the competing commit`);
    assert.equal(moveTransactionMetrics(harness.mock).length, 1);
  }

  for (const race of ['profile', 'series', 'target']) {
    const harness = await setup([{ id: 'only', seriesPositions: { [SERIES]: 0 } }]);
    const before = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ['only'] });
    const key = race === 'profile' ? `PROFILE#${OWNER}\u0000META`
      : race === 'series' ? `PROFILE#${OWNER}\u0000SERIES#${SERIES}`
        : `PROFILE#${OWNER}\u0000PLACEMENT#only`;
    harness.mock.raceBeforeNextTransaction(({ tables }) => {
      const table = tables.get('profiles-test');
      const current = table.get(key);
      table.set(key, { ...current, version: current.version + 1 });
    });
    const result = await move(harness, SERIES, 'only', {
      profileVersion: before.profile.version, seriesVersion: before.series[0].version,
      placementVersion: before.placements[0].version, targetPosition: 1,
    });
    assert.equal(result.status, 409, `noop ${race}`);
    const after = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ['only'] });
    const expected = structuredClone(before);
    if (race === 'profile') expected.profile.version += 1;
    if (race === 'series') expected.series[0].version += 1;
    if (race === 'target') expected.placements[0].version += 1;
    assert.deepEqual(after, expected, `no-op CAS preserves only ${race} race`);
    assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 3 }]);
  }
});

test('método, sesión, origen, CSRF, versiones, ordinal y campos se validan sin enviar transacciones', async () => {
  const harness = await setup([
    { id: 'a-first', seriesPositions: { [SERIES]: 0 } },
    { id: 'z-target', seriesPositions: { [SERIES]: 10 } },
  ]);
  const before = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ['a-first', 'z-target'] });
  const valid = {
    profileVersion: before.profile.version, seriesVersion: before.series[0].version,
    placementVersion: before.placements[1].version, targetPosition: 1,
  };
  for (const options of [
    { session: null, csrf: undefined, expected: 401 },
    { origin: 'https://evil.example', expected: 403 },
    { origin: null, expected: 403 },
    { csrf: '', expected: 403 },
    { method: 'GET', expected: 405, body: undefined },
    { method: 'PATCH', expected: 405 },
  ]) {
    const { expected, ...optionsWithoutExpected } = options;
    const result = await move(harness, SERIES, 'z-target', optionsWithoutExpected.body === undefined && optionsWithoutExpected.method === 'GET'
      ? undefined : valid, optionsWithoutExpected);
    assert.equal(result.status, expected);
    assert.match(result.response.headers.get('cache-control') ?? '', /no-store/);
  }
  for (const field of ['profileVersion', 'seriesVersion', 'placementVersion', 'targetPosition']) {
    const missing = { ...valid };
    delete missing[field];
    assert.equal((await move(harness, SERIES, 'z-target', missing)).status, 400, `missing ${field}`);
  }
  for (const [field, values] of [
    ['profileVersion', [-1, '1', 1.5, MAX_SAFE + 1]],
    ['seriesVersion', [-1, '1', 1.5, MAX_SAFE + 1]],
    ['placementVersion', [-1, '1', 1.5, MAX_SAFE + 1]],
  ]) {
    for (const value of values) assert.equal((await move(harness, SERIES, 'z-target', { ...valid, [field]: value })).status, 400, `${field}=${value}`);
  }
  for (const targetPosition of [0, -1, 3, MAX_SAFE + 1, '2', 1.5]) {
    assert.equal((await move(harness, SERIES, 'z-target', { ...valid, targetPosition })).status, 422, `targetPosition=${targetPosition}`);
  }
  for (const field of ['direction', 'position', 'featured', 'series', 'seriesId', 'placementId', 'resourceVersion', 'identity']) {
    assert.equal((await move(harness, SERIES, 'z-target', { ...valid, [field]: 'forbidden' })).status, 400, field);
  }
  const tooLarge = await move(harness, SERIES, 'z-target', { ...valid, unexpected: 'x'.repeat(33 * 1024) });
  assert.equal(tooLarge.status, 413);
  assert.deepEqual(rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ['a-first', 'z-target'] }), before);
  assert.deepEqual(moveTransactionMetrics(harness.mock), []);
});

test('un fallo operativo de TransactWrite devuelve 503 y no deja un capítulo a medio mover', async () => {
  const harness = await setup([
    { id: 'a-first', seriesPositions: { [SERIES]: 0 } },
    { id: 'b-middle', seriesPositions: { [SERIES]: 10 } },
    { id: 'z-target', seriesPositions: { [SERIES]: 20 } },
  ]);
  const ids = ['a-first', 'b-middle', 'z-target'];
  const before = rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids });
  harness.mock.failNextTransaction(new Error('injected chapter move transaction failure'));
  const failed = await move(harness, SERIES, 'z-target', {
    profileVersion: before.profile.version, seriesVersion: before.series[0].version,
    placementVersion: before.placements[2].version, targetPosition: 1,
  });
  assert.equal(failed.status, 503);
  assert.deepEqual(rawSnapshot(harness, { seriesIds: [SERIES], placementIds: ids }), before);
  assert.equal(moveTransactionMetrics(harness.mock).length, 1);
});

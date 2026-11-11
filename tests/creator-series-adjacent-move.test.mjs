import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import {
  createDynamoMoveHarness,
  moveTransactionMetrics,
  seedMovePlacement,
  seedMoveProfile,
  seedMoveResource,
  seedMoveSeries,
  storedAttributeBytes,
} from './fixtures/creator-link-move.mjs';

const OWNER = 'profile-move-a';
const SERIES = 'series-move-a';
const OTHER_SERIES = 'series-move-b';
const ORIGIN = 'https://dondeaprendoaws.com';
const ITEM_LIMIT = 400 * 1024;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const chapterPath = (seriesId, placementId) =>
  `/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}`;
const ordinalPath = (seriesId, placementId) => `${chapterPath(seriesId, placementId)}/mover`;
const key = (sk, profileId = OWNER) => ({ pk: `PROFILE#${profileId}`, sk });

async function request(harness, path, {
  session = 'creator-a',
  csrf = sessionCsrf[session],
  origin = ORIGIN,
  method = 'GET',
  body,
} = {}) {
  const response = await callApi(harness, path, {
    session, csrf, origin, method, ...(body === undefined ? {} : { body }),
  });
  return { response, status: response.status, body: response.status === 204 ? null : await responseJson(response) };
}

async function patchMove(harness, placementId, direction, profileVersion, options = {}) {
  const seriesId = options.seriesId ?? SERIES;
  const body = Object.hasOwn(options, 'body') ? options.body : { profileVersion, direction };
  return request(harness, chapterPath(seriesId, placementId), {
    ...options,
    seriesId: undefined,
    method: options.method ?? 'PATCH',
    ...(body === undefined ? {} : { body }),
  });
}

async function ordinalMove(harness, placementId, targetPosition, seriesId = SERIES, profileId = OWNER) {
  const owner = await request(harness, '/api/creador/perfil');
  assert.equal(owner.status, 200);
  const seriesResponse = await request(harness, '/api/creador/series');
  assert.equal(seriesResponse.status, 200);
  const series = seriesResponse.body.series.find(({ id }) => id === seriesId);
  const target = owner.body.links.find(({ placementId: id }) => id === placementId);
  assert.ok(series && target);
  return request(harness, ordinalPath(seriesId, placementId), {
    method: 'POST',
    body: {
      profileVersion: owner.body.profile.version ?? 0,
      seriesVersion: series.version ?? 0,
      placementVersion: target.placementVersion ?? 0,
      targetPosition,
    },
  });
}

async function setup(rows, {
  profileVersion = 1,
  seriesVersion = 1,
  otherSeries = true,
} = {}) {
  const harness = await createDynamoMoveHarness({ projectionAware: true, queryPageSize: 2 });
  seedMoveProfile(harness.mock, { version: profileVersion });
  seedMoveSeries(harness.mock, { id: SERIES, version: seriesVersion });
  if (otherSeries) seedMoveSeries(harness.mock, { id: OTHER_SERIES, version: 4, slug: 'serie-secundaria' });
  harness.mock.seed('profiles-test', {
    pk: `PROFILE#${OWNER}`,
    sk: `SERIES_SLUG#serie-prueba`,
    recordType: 'seriesAlias',
    seriesId: SERIES,
    profileId: OWNER,
    slug: 'serie-prueba',
    version: 1,
  });
  const resourceIds = new Set();
  for (const [index, row] of rows.entries()) {
    const resourceId = row.resourceId ?? `resource-${row.id}`;
    if (!resourceIds.has(resourceId)) {
      resourceIds.add(resourceId);
      seedMoveResource(harness.mock, {
        id: resourceId,
        title: `Título ${row.id}`,
        url: `https://example.com/adjacent/${encodeURIComponent(resourceId)}`,
        description: `Descripción ${row.id}`,
        version: row.resourceVersion ?? 1,
      });
    }
    const memberships = {
      [SERIES]: { position: row.rank },
      ...(otherSeries ? { [OTHER_SERIES]: { position: 100 + index } } : {}),
      ...(row.inert ? { 'deleted-series': { position: row.rank } } : {}),
    };
    seedMovePlacement(harness.mock, {
      id: row.id,
      resourceId,
      position: row.position ?? index * 10,
      version: row.version ?? 1,
      featured: index % 2 === 1,
      selectedForDirectory: index % 2 === 0,
      series: memberships,
    });
  }
  return harness;
}

async function setupOrdinaryOrder() {
  const harness = await createDynamoMoveHarness({ projectionAware: true, queryPageSize: 2 });
  const created = await request(harness, '/api/creador/perfil', {
    method: 'PUT', body: { displayName: 'Orden de prueba', slug: 'orden-prueba' },
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const profileId = created.body.profile.id;
  const published = await request(harness, '/api/creador/perfil/publicar', {
    method: 'POST', body: { version: created.body.profile.version },
  });
  assert.equal(published.status, 200, JSON.stringify(published.body));

  const linkIds = [];
  for (const suffix of ['first', 'second', 'third']) {
    const result = await request(harness, '/api/creador/enlaces', {
      method: 'POST',
      body: {
        title: `Capítulo ${suffix}`,
        url: `https://example.com/ordinary-adjacent/${suffix}`,
        description: `Descripción ${suffix}`,
        selectedForDirectory: false,
      },
    });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    linkIds.push(result.body.link.placementId);
  }
  const ids = linkIds.sort((left, right) => left.localeCompare(right));

  async function createSeries(name, slug) {
    const owner = await request(harness, '/api/creador/perfil');
    const result = await request(harness, '/api/creador/series', {
      method: 'POST', body: { name, slug, profileVersion: owner.body.profile.version },
    });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.series;
  }

  const createdMainSeries = await createSeries('Serie de prueba', 'serie-prueba');
  const ownerBeforeSeriesEdit = await request(harness, '/api/creador/perfil');
  const seriesEdit = await request(harness, `/api/creador/series/${encodeURIComponent(createdMainSeries.id)}`, {
    method: 'PATCH',
    body: {
      version: createdMainSeries.version,
      profileVersion: ownerBeforeSeriesEdit.body.profile.version,
      description: 'Metadata actualizada antes de ordenar los capítulos.',
    },
  });
  assert.equal(seriesEdit.status, 200, JSON.stringify(seriesEdit.body));
  const mainSeries = seriesEdit.body.series;
  assert.ok(mainSeries.version > 1, 'ordinary metadata PATCH advances the Series base above its initial version');
  const otherSeries = await createSeries('Otra serie activa', 'serie-secundaria');
  const retiredSeries = await createSeries('Serie retirada', 'serie-retirada');

  async function addChapter(seriesId, placementId) {
    const owner = await request(harness, '/api/creador/perfil');
    const result = await request(harness, chapterPath(seriesId, placementId), {
      method: 'PUT', body: { profileVersion: owner.body.profile.version },
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
  }

  for (const id of ids) await addChapter(mainSeries.id, id);
  await addChapter(otherSeries.id, ids[0]);
  await addChapter(retiredSeries.id, ids[0]);
  const profile = await request(harness, '/api/creador/perfil');
  const deleted = await request(harness, `/api/creador/series/${retiredSeries.id}`, {
    method: 'DELETE',
    body: { version: retiredSeries.version, profileVersion: profile.body.profile.version },
  });
  assert.equal(deleted.status, 204);
  assert.ok(harness.mock.read('profiles-test', key(`PLACEMENT#${ids[0]}`, profileId))
    .series[retiredSeries.id], 'fixture creates the inert membership through real add/delete commands');
  return {
    harness, profileId, mainSeriesId: mainSeries.id, otherSeriesId: otherSeries.id,
    retiredSeriesId: retiredSeries.id, ids,
  };
}

function rawSnapshot(harness, placementIds, { profileId = OWNER, seriesIds = [SERIES, OTHER_SERIES] } = {}) {
  const placements = placementIds.map((id) => harness.mock.read('profiles-test', key(`PLACEMENT#${id}`, profileId)));
  const resources = [...new Set(placements.map(({ resourceId }) => resourceId))]
    .map((id) => harness.mock.read('catalog-test', { id }));
  return structuredClone({
    profile: harness.mock.read('profiles-test', key('META', profileId)),
    series: seriesIds.map((id) => harness.mock.read('profiles-test', key(`SERIES#${id}`, profileId))).filter(Boolean),
    placements,
    resources,
  });
}

function orderFromRaw(placements, seriesId = SERIES) {
  return placements.filter((placement) => Object.hasOwn(placement.series ?? {}, seriesId))
    .sort((left, right) => left.series[seriesId].position - right.series[seriesId].position
      || left.id.localeCompare(right.id))
    .map(({ id }) => id);
}

async function publicOrder(harness, seriesSlug = 'serie-prueba') {
  const page = await harness.service.readPublicSeries('orden-prueba', seriesSlug);
  assert.equal(page.status, 200);
  return page.links.map(({ placementId }) => placementId);
}

async function ownerOrder(harness, seriesId) {
  const owner = await request(harness, '/api/creador/perfil');
  assert.equal(owner.status, 200);
  return owner.body.links
    .map((link) => ({ id: link.placementId, position: link.series.find(({ seriesId: id }) => id === seriesId)?.position }))
    .filter(({ position }) => position !== undefined)
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map(({ id }) => id);
}

function sortReceipts(receipts) {
  return [...receipts].sort((left, right) => `${left.entity}:${left.id}`.localeCompare(`${right.entity}:${right.id}`));
}

function assertLastTransactionFits(harness) {
  const transaction = harness.mock.transactions.at(-1);
  assert.ok(transaction, 'a successful order move submits one prepared DynamoDB transaction');
  assert.ok(transaction.actionCount <= 100);
  assert.ok(transaction.physicalBytes <= 4 * 1024 * 1024);
  assert.ok(transaction.input.TransactItems.filter(({ Put }) => Put)
    .every(({ Put }) => storedAttributeBytes(Put.Item) <= ITEM_LIMIT));
  for (const { ConditionCheck } of transaction.input.TransactItems.filter(({ ConditionCheck }) => ConditionCheck)) {
    const observed = harness.mock.read(ConditionCheck.TableName, ConditionCheck.Key);
    assert.ok(observed, `${ConditionCheck.Key.sk} is a stored condition participant`);
    assert.ok(storedAttributeBytes(observed) <= ITEM_LIMIT, `${ConditionCheck.Key.sk} fits the item limit`);
  }
}

function activeMemberships(placement, seriesRows) {
  const active = new Set(seriesRows.map(({ id }) => id));
  return Object.entries(placement.series ?? {})
    .filter(([id]) => active.has(id))
    .map(([seriesId, membership]) => ({ seriesId, position: membership.position }))
    .sort((left, right) => left.position - right.position || left.seriesId.localeCompare(right.seriesId));
}

function canonicalLink(placement, resource, seriesRows) {
  return {
    placementId: placement.id,
    resourceId: resource.id,
    title: resource.title,
    url: resource.url,
    ...(typeof resource.description === 'string' ? { description: resource.description } : {}),
    featured: placement.featured,
    position: placement.position,
    selectedForDirectory: placement.selectedForDirectory,
    hidden: resource.hidden === true,
    series: activeMemberships(placement, seriesRows),
    directoryApproval: 'pending',
    resourceVersion: resource.version ?? 0,
    placementVersion: placement.version ?? 0,
  };
}

function assertPreparedLegacyResult(body, before, after, targetId, seriesId = SERIES) {
  assert.equal(body.status, 200, 'the legacy response retains its status field');
  assert.equal(body.profileVersion, after.profile.version ?? 0);
  assert.ok(Array.isArray(body.links));
  assert.ok(Array.isArray(body.versionChanges));
  assert.deepEqual(Object.keys(body).sort(), ['links', 'profileVersion', 'status', 'versionChanges']);

  const beforeById = new Map(before.placements.map((placement) => [placement.id, placement]));
  const afterById = new Map(after.placements.map((placement) => [placement.id, placement]));
  const changedIds = [];
  for (const [id, previous] of beforeById) {
    const next = afterById.get(id);
    const previousRank = previous.series?.[seriesId]?.position;
    const nextRank = next.series?.[seriesId]?.position;
    const changed = previousRank !== nextRank;
    if (changed) changedIds.push(id);
    const expected = structuredClone(previous);
    if (changed) {
      expected.series[seriesId].position = nextRank;
      expected.version = (previous.version ?? 0) + 1;
    }
    assert.deepEqual(next, expected, `${id} changes only its selected-series rank and placement version`);
  }
  assert.equal(after.profile.version, (before.profile.version ?? 0) + 1,
    'one successful order change advances the profile exactly once');
  const expectedProfile = structuredClone(before.profile);
  expectedProfile.version += 1;
  expectedProfile.updatedAt = after.profile.updatedAt;
  assert.deepEqual(after.profile, expectedProfile, 'the profile changes only its version and timestamp');
  assert.deepEqual(after.series, before.series, 'series records are checked but never mutated');
  assert.deepEqual(after.resources, before.resources, 'resource records and versions are untouched');

  const expectedReceipts = [
    { entity: 'profile', id: before.profile.id, before: before.profile.version ?? 0, after: after.profile.version },
    ...changedIds.map((id) => ({
      entity: 'placement', id,
      before: beforeById.get(id).version ?? 0,
      after: afterById.get(id).version ?? 0,
    })),
  ];
  assert.deepEqual(sortReceipts(body.versionChanges), sortReceipts(expectedReceipts));

  const expectedIds = [...new Set([targetId, ...changedIds])].sort();
  assert.deepEqual(body.links.map(({ placementId }) => placementId).sort(), expectedIds,
    'the canonical response contains the target and every actually changed placement');
  const resourcesById = new Map(after.resources.map((resource) => [resource.id, resource]));
  const expectedLinks = expectedIds.map((id) => canonicalLink(afterById.get(id), resourcesById.get(afterById.get(id).resourceId), after.series));
  assert.deepEqual([...body.links].sort((left, right) => left.placementId.localeCompare(right.placementId)), expectedLinks,
    'each canonical DTO matches the prepared raw placement and resource records');
  return changedIds;
}

async function prepareDownTie() {
  const { harness, ids, mainSeriesId, profileId, otherSeriesId, retiredSeriesId } = await setupOrdinaryOrder();
  const steps = [
    [ids[2], 1, [ids[2], ids[0], ids[1]]],
    [ids[1], 1, [ids[1], ids[2], ids[0]]],
    [ids[0], 1, [ids[0], ids[1], ids[2]]],
  ];
  for (const [id, ordinal, expected] of steps) {
    const result = await ordinalMove(harness, id, ordinal, mainSeriesId, profileId);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.deepEqual(await publicOrder(harness), expected, 'each public ordinal move establishes the next intended tie order');
  }
  const tied = rawSnapshot(harness, ids, { profileId, seriesIds: [mainSeriesId, otherSeriesId] });
  assert.equal(new Set(tied.placements.map(({ series }) => series[mainSeriesId].position)).size, 1,
    'actual ordinal moves leave a three-way rank tie');
  return { harness, ids, tied, profileId, seriesId: mainSeriesId, otherSeriesId, retiredSeriesId };
}

async function prepareUpTie() {
  const { harness, ids, mainSeriesId, profileId, otherSeriesId, retiredSeriesId } = await setupOrdinaryOrder();
  const steps = [
    [ids[0], 3, [ids[1], ids[2], ids[0]]],
    [ids[1], 3, [ids[2], ids[0], ids[1]]],
    [ids[2], 3, [ids[0], ids[1], ids[2]]],
  ];
  for (const [id, ordinal, expected] of steps) {
    const result = await ordinalMove(harness, id, ordinal, mainSeriesId, profileId);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.deepEqual(await publicOrder(harness), expected, 'each public ordinal move establishes the next intended tie order');
  }
  const tied = rawSnapshot(harness, ids, { profileId, seriesIds: [mainSeriesId, otherSeriesId] });
  assert.equal(new Set(tied.placements.map(({ series }) => series[mainSeriesId].position)).size, 1,
    'actual ordinal moves leave a three-way rank tie');
  return { harness, ids, tied, profileId, seriesId: mainSeriesId, otherSeriesId, retiredSeriesId };
}

test('ordinal-generated low-rank three-way tie: legacy down moves exactly one neighbor', async () => {
  const { harness, ids, tied, profileId, seriesId, otherSeriesId, retiredSeriesId } = await prepareDownTie();
  assert.deepEqual(await publicOrder(harness), ids);
  const transactionCount = harness.mock.transactions.length;
  const result = await patchMove(harness, ids[0], 'down', tied.profile.version, { seriesId });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(harness.mock.transactions.length, transactionCount + 1);
  assertLastTransactionFits(harness);
  assert.deepEqual(await publicOrder(harness), [ids[1], ids[0], ids[2]]);
  assert.deepEqual(await ownerOrder(harness, seriesId), [ids[1], ids[0], ids[2]],
    'a fresh owner profile read shows the committed adjacent permutation');
  const after = rawSnapshot(harness, ids, { profileId, seriesIds: [seriesId, otherSeriesId] });
  assert.deepEqual(orderFromRaw(after.placements, seriesId), [ids[1], ids[0], ids[2]]);
  assertPreparedLegacyResult(result.body, tied, after, ids[0], seriesId);
  assert.ok(after.placements.find(({ id }) => id === ids[0]).series[retiredSeriesId],
    'an inert raw membership survives the order-only move');
});

test('ordinal-generated high-rank three-way tie: legacy up moves exactly one neighbor', async () => {
  const { harness, ids, tied, profileId, seriesId, otherSeriesId } = await prepareUpTie();
  assert.deepEqual(await publicOrder(harness), ids);
  const transactionCount = harness.mock.transactions.length;
  const result = await patchMove(harness, ids[2], 'up', tied.profile.version, { seriesId });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(harness.mock.transactions.length, transactionCount + 1);
  assertLastTransactionFits(harness);
  assert.deepEqual(await publicOrder(harness), [ids[0], ids[2], ids[1]]);
  assert.deepEqual(await ownerOrder(harness, seriesId), [ids[0], ids[2], ids[1]],
    'a fresh owner profile read shows the committed adjacent permutation');
  const after = rawSnapshot(harness, ids, { profileId, seriesIds: [seriesId, otherSeriesId] });
  assert.deepEqual(orderFromRaw(after.placements, seriesId), [ids[0], ids[2], ids[1]]);
  assertPreparedLegacyResult(result.body, tied, after, ids[2], seriesId);
  assert.deepEqual(after.placements.map(({ series }) => series[otherSeriesId]),
    tied.placements.map(({ series }) => series[otherSeriesId]), 'other active memberships are preserved');
});

test('legacy direction moves keep the observed profile/series/target checks on boundary no-ops, including legacy versions', async () => {
  for (const scenario of [
    { target: 'a', direction: 'up', targetVersion: 'missing' },
    { target: 'b', direction: 'down', targetVersion: 0 },
  ]) {
    const harness = await setup([
      { id: 'a', rank: 10, ...(scenario.target === 'a' && scenario.targetVersion === 0 ? { version: 0 } : {}) },
      { id: 'b', rank: 20, ...(scenario.target === 'b' && scenario.targetVersion === 0 ? { version: 0 } : {}) },
    ], { profileVersion: 1, seriesVersion: 1, otherSeries: false });
    if (scenario.targetVersion === 'missing') {
      const row = harness.mock.read('profiles-test', key('PLACEMENT#a'));
      delete row.version;
      harness.mock.seed('profiles-test', row);
    }
    const before = rawSnapshot(harness, ['a', 'b'], { seriesIds: [SERIES] });
    const result = await patchMove(harness, scenario.target, scenario.direction, 1);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.status, 200);
    assert.deepEqual(result.body.versionChanges, []);
    assert.equal(result.body.profileVersion, 1);
    assert.deepEqual(Object.keys(result.body).sort(), ['links', 'profileVersion', 'status', 'versionChanges']);
    const target = before.placements.find(({ id }) => id === scenario.target);
    const resource = before.resources.find(({ id }) => id === target.resourceId);
    assert.deepEqual(result.body.links, [canonicalLink(target, resource, before.series)],
      'a no-op keeps the legacy canonical target link');
    assert.deepEqual(rawSnapshot(harness, ['a', 'b'], { seriesIds: [SERIES] }), before,
      'a boundary no-op preserves missing and zero legacy versions byte-for-byte');
    assert.equal(harness.mock.transactions.length, 1, 'a no-op confirms observed participants atomically');
    const actions = harness.mock.transactions.at(-1).input.TransactItems;
    assert.equal(actions.length, 3);
    assert.ok(actions.every(({ ConditionCheck }) => ConditionCheck), 'a no-op sends only observed conditions');
    assert.deepEqual(actions.map(({ ConditionCheck }) => ConditionCheck.Key.sk).sort(), [
      'META', `PLACEMENT#${scenario.target}`, `SERIES#${SERIES}`,
    ]);
  }
});

test('boundary no-op condition checks reject a concurrent profile, Series, or target change', async () => {
  for (const race of ['profile', 'series', 'target']) {
    const harness = await setup([
      { id: 'a', rank: 10, version: 0 },
      { id: 'b', rank: 20 },
    ], { otherSeries: false });
    const before = rawSnapshot(harness, ['a', 'b'], { seriesIds: [SERIES] });
    const sk = race === 'profile' ? 'META'
      : race === 'series' ? `SERIES#${SERIES}` : 'PLACEMENT#a';
    harness.mock.raceBeforeNextTransaction(({ tables, actions }) => {
      assert.equal(actions.length, 3);
      assert.ok(actions.every(({ ConditionCheck }) => ConditionCheck));
      const physicalKey = `PROFILE#${OWNER}\u0000${sk}`;
      const current = tables.get('profiles-test').get(physicalKey);
      tables.get('profiles-test').set(physicalKey, { ...current, version: (current.version ?? 0) + 1 });
    });
    const result = await patchMove(harness, 'a', 'up', before.profile.version);
    assert.equal(harness.mock.transactions.length, 1, 'a boundary no-op sends its condition-only confirmation');
    assert.equal(result.status, 409, race);
    const expected = structuredClone(before);
    if (race === 'profile') expected.profile.version += 1;
    else if (race === 'series') expected.series[0].version += 1;
    else expected.placements[0].version += 1;
    assert.deepEqual(rawSnapshot(harness, ['a', 'b'], { seriesIds: [SERIES] }), expected,
      `${race} no-op confirmation preserves only the competing write`);
    assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 3 }]);
  }
});

test('a stale submitted profile and observed profile/series/target/non-neighbor races reject without partial order writes', async () => {
  {
    const harness = await setup([{ id: 'a', rank: 0 }, { id: 'b', rank: 10 }]);
    const before = rawSnapshot(harness, ['a', 'b']);
    const stale = await patchMove(harness, 'a', 'down', 0);
    assert.equal(stale.status, 409);
    assert.deepEqual(rawSnapshot(harness, ['a', 'b']), before);
    assert.deepEqual(moveTransactionMetrics(harness.mock), []);
  }

  for (const race of ['profile', 'series', 'target', 'non-neighbor']) {
    const { harness, ids, tied, profileId, seriesId, otherSeriesId } = await prepareDownTie();
    const targetId = ids[0];
    const nonNeighborId = ids[2];
    const raceId = race === 'non-neighbor' ? nonNeighborId : targetId;
    let sawChangedNonNeighbor = false;
    harness.mock.raceBeforeNextTransaction(({ tables, actions }) => {
      const physicalActions = actions.map((action) => action.Put ?? action.Delete ?? action.ConditionCheck);
      const isChangedPut = physicalActions.some((action) => action.Item?.id === nonNeighborId);
      if (race === 'non-neighbor') {
        sawChangedNonNeighbor = isChangedPut;
      }
      const sk = race === 'profile' ? 'META'
        : race === 'series' ? `SERIES#${seriesId}` : `PLACEMENT#${raceId}`;
      const rowKey = `PROFILE#${profileId}\u0000${sk}`;
      const current = tables.get('profiles-test').get(rowKey);
      tables.get('profiles-test').set(rowKey, { ...current, version: (current.version ?? 0) + 1 });
    });
    const transactionCount = harness.mock.transactions.length;
    const result = await patchMove(harness, targetId, 'down', tied.profile.version, { seriesId });
    if (race === 'non-neighbor') {
      assert.equal(sawChangedNonNeighbor, true, 'the prepared move writes the changed non-neighbor');
    }
    assert.equal(result.status, 409, race);
    const expected = structuredClone(tied);
    if (race === 'profile') expected.profile.version += 1;
    else if (race === 'series') expected.series.find(({ id }) => id === seriesId).version += 1;
    else expected.placements.find(({ id }) => id === raceId).version += 1;
    assert.deepEqual(rawSnapshot(harness, ids, { profileId, seriesIds: [seriesId, otherSeriesId] }), expected,
      `${race} leaves only the competing write`);
    assert.equal(moveTransactionMetrics(harness.mock).length, transactionCount + 1);
  }
});

test('legacy PATCH returns its prepared profile version, canonical links, and receipts after a later writer', async () => {
  const { harness, ids, tied, profileId, seriesId, otherSeriesId } = await prepareUpTie();
  const transactionCount = harness.mock.transactions.length;
  let preparedActions;
  harness.mock.mutateAfterNextTransaction(({ actions, tables }) => {
    preparedActions = actions;
    const profileRows = tables.get('profiles-test');
    const profileKey = `PROFILE#${profileId}\u0000META`;
    const profile = profileRows.get(profileKey);
    profileRows.set(profileKey, { ...profile, version: profile.version + 1 });
    const targetId = ids[2];
    const targetKey = `PROFILE#${profileId}\u0000PLACEMENT#${targetId}`;
    const target = profileRows.get(targetKey);
    profileRows.set(targetKey, {
      ...target,
      series: { ...target.series, [seriesId]: { ...target.series[seriesId], position: MAX_SAFE } },
      version: target.version + 1,
    });
  });

  const result = await patchMove(harness, ids[2], 'up', tied.profile.version, { seriesId });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(harness.mock.transactions.length, transactionCount + 1);
  assertLastTransactionFits(harness);
  assert.ok(preparedActions);
  const preparedProfile = preparedActions.map(({ Put }) => Put?.Item)
    .find((item) => item?.sk === 'META');
  const preparedRows = preparedActions.map(({ Put }) => Put?.Item)
    .filter((item) => item?.sk?.startsWith('PLACEMENT#'));
  const prepared = structuredClone(tied);
  prepared.profile = structuredClone(preparedProfile);
  for (const row of preparedRows) {
    const index = prepared.placements.findIndex(({ id }) => id === row.id);
    prepared.placements[index] = structuredClone(row);
  }
  assert.equal(result.body.profileVersion, preparedProfile.version);
  assertPreparedLegacyResult(result.body, tied, prepared, ids[2], seriesId);
  const stored = rawSnapshot(harness, ids, { profileId, seriesIds: [seriesId, otherSeriesId] });
  assert.equal(stored.profile.version, preparedProfile.version + 1,
    'the later profile writer has advanced storage after the prepared command');
  assert.equal(stored.placements.find(({ id }) => id === ids[2]).series[seriesId].position, MAX_SAFE);
  assert.ok(stored.placements.find(({ id }) => id === ids[2]).version
    > prepared.placements.find(({ id }) => id === ids[2]).version);
  assert.notEqual(result.body.links.find(({ placementId }) => placementId === ids[2]).series
    .find(({ seriesId: returnedSeriesId }) => returnedSeriesId === seriesId).position, MAX_SAFE,
  'the response retains the command snapshot instead of rereading the later writer');
});

test('legacy PATCH serializes its matching success before commit and does not serialize it again afterward', async () => {
  const { harness, ids, tied, profileId, seriesId, otherSeriesId } = await prepareUpTie();
  const targetId = ids[2];
  const expectedOrder = [ids[0], ids[2], ids[1]];
  const originalDescriptor = Object.getOwnPropertyDescriptor(JSON, 'stringify');
  const originalStringify = JSON.stringify;
  let committed = false;
  let matchingBeforeCommit = 0;
  let matchingAfterCommit = 0;
  let result;
  let invocationError;

  harness.mock.mutateAfterNextTransaction(() => { committed = true; });
  Object.defineProperty(JSON, 'stringify', {
    ...originalDescriptor,
    value(value, ...args) {
      const isMatchingLegacySuccess = value !== null && typeof value === 'object'
        && value.status === 200
        && Number.isSafeInteger(value.profileVersion)
        && Array.isArray(value.links)
        && value.links.some((link) => link && typeof link === 'object' && link.placementId === targetId)
        && Array.isArray(value.versionChanges);
      if (isMatchingLegacySuccess) {
        if (committed) {
          matchingAfterCommit += 1;
          throw new Error('matching legacy success was serialized after commit');
        }
        matchingBeforeCommit += 1;
      }
      return Reflect.apply(originalStringify, this, [value, ...args]);
    },
  });
  const transactionCount = harness.mock.transactions.length;
  try {
    result = await patchMove(harness, targetId, 'up', tied.profile.version, { seriesId });
  } catch (error) {
    invocationError = error;
  } finally {
    Object.defineProperty(JSON, 'stringify', originalDescriptor);
  }

  assert.ifError(invocationError);
  assert.equal(committed, true, 'the actual legacy transaction committed');
  assert.ok(matchingBeforeCommit >= 1,
    `the matching result must be serialized before the transaction (before=${matchingBeforeCommit}, after=${matchingAfterCommit}, response=${result?.status})`);
  assert.equal(matchingAfterCommit, 0, 'the route reused the prepared response after commit');
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(harness.mock.transactions.length, transactionCount + 1);
  assertLastTransactionFits(harness);
  const after = rawSnapshot(harness, ids, { profileId, seriesIds: [seriesId, otherSeriesId] });
  assert.deepEqual(orderFromRaw(after.placements, seriesId), expectedOrder);
  assert.deepEqual(await publicOrder(harness), expectedOrder);
  assert.deepEqual(await ownerOrder(harness, seriesId), expectedOrder);
  assertPreparedLegacyResult(result.body, tied, after, targetId, seriesId);
});

test('a physically infeasible legacy adjacent move returns ORDER_MOVE_LIMIT without mutation or transaction', async () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const harness = await setup(ids.map((id, index) => ({
    id,
    rank: index < 3 ? 0 : 1,
    version: index >= 2 ? 100 : 1,
    inert: id === 'c',
  })));
  for (const id of ['c', 'd', 'e']) {
    const row = harness.mock.read('profiles-test', key(`PLACEMENT#${id}`));
    row.series.legacy ??= '';
    row.series.legacy = 'x'.repeat(ITEM_LIMIT - storedAttributeBytes(row));
    assert.equal(storedAttributeBytes(row), ITEM_LIMIT, `${id} starts at the DynamoDB item limit`);
    harness.mock.seed('profiles-test', row);
  }
  const c = harness.mock.read('profiles-test', key('PLACEMENT#c'));
  const cAfterMinimumRequiredRankChange = structuredClone(c);
  cAfterMinimumRequiredRankChange.series[SERIES].position = 1;
  cAfterMinimumRequiredRankChange.version += 1;
  assert.deepEqual(orderFromRaw(['a', 'b', 'c', 'd', 'e'].map((id) =>
    harness.mock.read('profiles-test', key(`PLACEMENT#${id}`)))), ids);
  assert.equal(storedAttributeBytes(c), ITEM_LIMIT);
  assert.equal(storedAttributeBytes(cAfterMinimumRequiredRankChange), ITEM_LIMIT + 1,
    'to place a after b while preserving c after a, c must advance from rank 0; version 100→101 makes that required image one byte too large');
  const before = rawSnapshot(harness, ids);
  assert.deepEqual(orderFromRaw(before.placements), ids);
  const result = await patchMove(harness, 'a', 'down', before.profile.version);
  assert.equal(result.status, 422);
  assert.equal(result.body.error, 'ORDER_MOVE_LIMIT');
  assert.deepEqual(rawSnapshot(harness, ids), before);
  assert.deepEqual(moveTransactionMetrics(harness.mock), [], 'the infeasible transaction is rejected before send');
});

test('legacy direction guards preserve the PATCH request contract', async () => {
  const harness = await setup([{ id: 'a', rank: 0 }, { id: 'b', rank: 10 }]);
  const valid = { profileVersion: 1, direction: 'down' };
  for (const options of [
    { session: null, csrf: undefined, expected: 401 },
    { origin: 'https://evil.example', expected: 403 },
    { csrf: '', expected: 403 },
    { method: 'GET', expected: 405, body: undefined },
  ]) {
    const { expected, ...input } = options;
    const result = await patchMove(harness, 'a', 'down', 1, {
      ...input,
      ...(input.body === undefined && input.method === 'GET' ? { body: undefined } : {}),
    });
    assert.equal(result.status, expected);
  }
  for (const body of [
    { direction: 'down' },
    { ...valid, placementVersion: 1 },
    { ...valid, seriesVersion: 1 },
    { ...valid, direction: 'left' },
  ]) {
    const result = await patchMove(harness, 'a', 'down', 1, { body });
    assert.ok([400, 422].includes(result.status), JSON.stringify({ body, result: result.body }));
  }
  assert.deepEqual(moveTransactionMetrics(harness.mock), []);
});

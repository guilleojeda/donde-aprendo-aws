import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import {
  createDynamoMoveHarness, seedMoveProfile, seedMoveResource, seedMovePlacement,
  seedMoveSeries, storedAttributeBytes,
} from './fixtures/creator-link-move.mjs';
import { padPlacementMembershipsToBytes } from './fixtures/creator-order-physical.mjs';

const OWNER = 'profile-move-a';
const SERIES = 'selected-series';
const MAX = Number.MAX_SAFE_INTEGER;
const ITEM = 400 * 1024;
const TOTAL = 4 * 1024 * 1024;
const key = (id) => ({ pk: `PROFILE#${OWNER}`, sk: `PLACEMENT#${id}` });
const rank = (row, kind) => kind === 'link' ? row.position : row.series[SERIES].position;
const ordered = (rows, kind) => [...rows].sort((a, b) => rank(a, kind) - rank(b, kind) || a.id.localeCompare(b.id)).map(({ id }) => id);
const rowsFrom = (h, ids) => ids.map((id) => structuredClone(h.mock.read('profiles-test', key(id))));
const receipts = (changes) => [...changes].sort((a, b) => `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`));

async function setup(kind, rows) {
  const h = await createDynamoMoveHarness({ projectionAware: true });
  seedMoveProfile(h.mock);
  if (kind === 'chapter') seedMoveSeries(h.mock, { id: SERIES });
  for (const [index, row] of rows.entries()) {
    seedMoveResource(h.mock, { id: `resource-${row.id}`, url: `https://example.com/exact/${row.id}` });
    seedMovePlacement(h.mock, {
      id: row.id, resourceId: `resource-${row.id}`, position: kind === 'link' ? row.position : index * 10,
      version: row.version ?? 100,
      series: { other: { position: index + 10 }, ...(kind === 'chapter' ? { [SERIES]: { position: row.position } } : {}) },
    });
  }
  return h;
}

async function move(h, kind, targetId, targetPosition) {
  const profile = h.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: 'META' });
  const target = h.mock.read('profiles-test', key(targetId));
  const path = kind === 'link' ? `/api/creador/enlaces/${targetId}/mover`
    : `/api/creador/series/${SERIES}/capitulos/${targetId}/mover`;
  const response = await callApi(h, path, {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'POST',
    body: { profileVersion: profile.version, placementVersion: target.version, targetPosition,
      ...(kind === 'chapter' ? { seriesVersion: 1 } : {}) },
  });
  return { status: response.status, body: await responseJson(response) };
}

function assertUnrelatedFields(before, after, kind) {
  for (const prior of before) {
    const next = after.find(({ id }) => id === prior.id);
    assert.equal(next.featured, prior.featured);
    assert.equal(next.selectedForDirectory, prior.selectedForDirectory);
    assert.equal(next.resourceId, prior.resourceId);
    assert.deepEqual(next.series.other, prior.series.other);
    if (kind === 'chapter') assert.equal(next.position, prior.position);
    const clean = (row) => {
      const copy = structuredClone(row);
      delete copy.version;
      if (kind === 'link') delete copy.position;
      else delete copy.series[SERIES].position;
      return copy;
    };
    assert.deepEqual(clean(next), clean(prior), 'only the selected order and its version can change');
  }
}

for (const kind of ['link', 'chapter']) {
  test(`${kind}: every integer byte class in an unchanged-neighbor gap is considered`, async () => {
    const h = await setup(kind, [
      { id: 'a-left', position: 12345, version: MAX },
      { id: 'z-right', position: 23456, version: MAX },
      { id: 'middle-target', position: 111111 },
    ]);
    const ids = ['a-left', 'z-right', 'middle-target'];
    const target = padPlacementMembershipsToBytes(structuredClone(h.mock.read('profiles-test', key('middle-target'))), ITEM);
    h.mock.seed('profiles-test', target);
    const before = rowsFrom(h, ids);
    const resourceBefore = structuredClone(h.mock.read('catalog-test', { id: target.resourceId }));
    const expected = ['a-left', 'middle-target', 'z-right'];

    // Independent finite enumeration of the whole permitted gap, not the
    // product's sampled ranks or successor implementation. Frozen anchors
    // mean a successful plan cannot hide the gap defect by moving them.
    const fitting = [];
    const fixedTargetBytes = storedAttributeBytes(target)
      - storedAttributeBytes({ position: rank(target, kind), version: 100 });
    for (let position = 12345; position <= 23456; position += 1) {
      if (fixedTargetBytes + storedAttributeBytes({ position, version: 101 }) <= ITEM) fitting.push(position);
    }
    assert.ok(fitting.includes(20000), 'a literal feasible witness exists inside the gap');
    const witness = { ...target, version: 101,
      ...(kind === 'link' ? { position: 20000 } : { series: { ...target.series, [SERIES]: { position: 20000 } } }) };
    assert.equal(storedAttributeBytes(witness), ITEM - 1);
    assert.deepEqual(ordered([before[0], witness, before[1]], kind), expected);

    const result = await move(h, kind, 'middle-target', 2);
    assert.equal(result.status, 200, JSON.stringify(result));
    const after = rowsFrom(h, ids);
    assert.deepEqual(ordered(after, kind), expected);
    assert.ok(fitting.includes(rank(after.find(({ id }) => id === target.id), kind)),
      'the saved witness is a member of the independently enumerated feasible gap');
    assert.deepEqual(receipts(result.body.versionChanges), receipts([
      { entity: 'profile', id: OWNER, before: 1, after: 2 },
      { entity: 'placement', id: target.id, before: 100, after: 101 },
    ]));
    assert.deepEqual(after[0], before[0]);
    assert.deepEqual(after[1], before[1]);
    assertUnrelatedFields(before, after, kind);
    assert.deepEqual(h.mock.read('catalog-test', { id: target.resourceId }), resourceBefore);
    assert.equal(h.mock.transactions.length, 1);
    const transaction = h.mock.transactions[0];
    assert.equal(transaction.actionCount, kind === 'link' ? 2 : 3);
    assert.ok(transaction.physicalBytes <= TOTAL);
  });

  test(`${kind}: aggregate feasibility is not reduced to the earliest locally fitting rank`, async () => {
    const mutableIds = ['m-target', ...Array.from({ length: 11 }, (_, i) => `zz-${String(i).padStart(2, '0')}`)];
    const h = await setup(kind, [
      { id: 'z-left', position: 12345, version: MAX },
      ...mutableIds.map((id, i) => ({ id, position: i === 0 ? 111111 : 12345 })),
    ]);
    const profile = h.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: 'META' });
    const fixedBytes = storedAttributeBytes({ ...profile, version: 2, updatedAt: '2026-10-23T00:00:00.000Z' })
      + (kind === 'chapter' ? storedAttributeBytes(h.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: `SERIES#${SERIES}` })) : 0);
    const rawBudget = TOTAL - fixedBytes;
    let remainder = rawBudget;
    for (const [index, id] of mutableIds.entries()) {
      const bytes = index === mutableIds.length - 1 ? remainder : Math.floor(rawBudget / mutableIds.length);
      remainder -= bytes;
      const row = padPlacementMembershipsToBytes(structuredClone(h.mock.read('profiles-test', key(id))), bytes);
      assert.ok(storedAttributeBytes(row) <= ITEM);
      h.mock.seed('profiles-test', row);
    }
    const ids = ['z-left', ...mutableIds];
    const before = rowsFrom(h, ids);
    const expected = ['z-left', ...mutableIds];
    const atRank = (position) => before.slice(1).map((row) => ({ ...row, version: 101,
      ...(kind === 'link' ? { position } : { series: { ...row.series, [SERIES]: { position } } }) }));
    const compact = atRank(12346);
    const fitting = atRank(13000);
    assert.deepEqual(ordered([before[0], ...compact], kind), expected);
    assert.deepEqual(ordered([before[0], ...fitting], kind), expected);
    assert.ok([...compact, ...fitting].every((row) => storedAttributeBytes(row) <= ITEM));
    assert.equal(fixedBytes + compact.reduce((sum, row) => sum + storedAttributeBytes(row), 0), TOTAL + 12);
    assert.equal(fixedBytes + fitting.reduce((sum, row) => sum + storedAttributeBytes(row), 0), TOTAL - 12);

    const result = await move(h, kind, 'm-target', 2);
    assert.equal(result.status, 200, JSON.stringify(result));
    const after = rowsFrom(h, ids);
    assert.deepEqual(ordered(after, kind), expected);
    assert.deepEqual(after[0], before[0]);
    assertUnrelatedFields(before, after, kind);
    const changed = after.filter((row) => rank(row, kind) !== rank(before.find(({ id }) => id === row.id), kind));
    for (const row of after) {
      assert.equal(row.version, before.find(({ id }) => id === row.id).version
        + Number(changed.some(({ id }) => id === row.id)), 'versions follow actual persisted changes');
    }
    assert.deepEqual(receipts(result.body.versionChanges), receipts([
      { entity: 'profile', id: OWNER, before: 1, after: 2 },
      ...changed.map(({ id }) => ({ entity: 'placement', id, before: 100, after: 101 })),
    ]));
    assert.equal(h.mock.transactions.length, 1);
    assert.equal(h.mock.transactions[0].actionCount,
      changed.length + (kind === 'chapter' ? 2 : 1) + Number(!changed.some(({ id }) => id === 'm-target')));
    assert.ok(h.mock.transactions[0].physicalBytes <= TOTAL);
    assert.ok(after.every((row) => storedAttributeBytes(row) <= ITEM));
  });

  test(`${kind}: an impossible adjacent intermediate cannot hide the only farther viable insertion`, async () => {
    const h = await setup(kind, [
      { id: 'a-target', position: 0, version: 1 },
      { id: 'b-anchor', position: 0, version: MAX },
      { id: 'c-anchor', position: 0, version: MAX },
      { id: 'z-ceiling', position: MAX, version: MAX },
    ]);
    const ids = ['a-target', 'b-anchor', 'c-anchor', 'z-ceiling'];
    const before = rowsFrom(h, ids);
    assert.deepEqual(ordered(before, kind), ids);
    // Ordinal2 has no rank between the two frozen zero anchors that can
    // put a-target after b-anchor. Ordinal4 requires a rank above MAX,
    // since a-target loses the tie to frozen z-ceiling. Ordinal3 alone
    // has a literal rank1 witness, despite being farther from current1.
    const adjacent = await move(h, kind, 'a-target', 2);
    assert.ok(adjacent.status === 409 || adjacent.status === 422, JSON.stringify(adjacent));
    assert.equal(h.mock.transactions.length, 0);
    assert.deepEqual(rowsFrom(h, ids), before);
    const witness = { ...before[0], version: 2,
      ...(kind === 'link' ? { position: 1 }
        : { series: { ...before[0].series, [SERIES]: { position: 1 } } }) };
    assert.deepEqual(ordered([witness, ...before.slice(1)], kind),
      ['b-anchor', 'c-anchor', 'a-target', 'z-ceiling']);
    const rejected = await move(h, kind, 'a-target', 4);
    assert.equal(rejected.status, 422, JSON.stringify(rejected));
    assert.equal(rejected.body.error, 'ORDER_MOVE_LIMIT');
    assert.equal(rejected.body.viablePosition, 3, 'the unique feasible strict intermediate is offered');
    assert.equal(h.mock.transactions.length, 0, 'neither rejection applies the alternative');
    assert.deepEqual(rowsFrom(h, ids), before);
    const saved = await move(h, kind, 'a-target', rejected.body.viablePosition);
    assert.equal(saved.status, 200, JSON.stringify(saved));
    const after = rowsFrom(h, ids);
    assert.deepEqual(ordered(after, kind), ['b-anchor', 'c-anchor', 'a-target', 'z-ceiling']);
    assert.deepEqual(after.slice(1), before.slice(1));
    assertUnrelatedFields(before, after, kind);
    assert.deepEqual(receipts(saved.body.versionChanges), receipts([
      { entity: 'profile', id: OWNER, before: 1, after: 2 },
      { entity: 'placement', id: 'a-target', before: 1, after: 2 },
    ]));
    assert.equal(h.mock.transactions.length, 1);
    assert.equal(h.mock.transactions[0].actionCount, kind === 'link' ? 2 : 3);
    assert.ok(h.mock.transactions[0].physicalBytes <= TOTAL);
  });
}

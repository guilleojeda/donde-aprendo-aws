import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, sessionCsrf } from './fixtures/creator-pages.mjs';
import {
  createDynamoMoveHarness,
  moveTransactionMetrics,
  seedMoveProfile,
  seedMoveResource,
  seedMovePlacement,
  seedMoveSeries,
} from './fixtures/creator-link-move.mjs';

const SIZE = 320;
const SERIES = 'scale-series';
const OWNER = 'profile-move-a';
const MAX = Number.MAX_SAFE_INTEGER;

async function setup(kind, positions) {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  if (kind === 'chapter') seedMoveSeries(harness.mock, { id: SERIES });
  const ids = positions.map((_, index) => `id-${String(index).padStart(4, '0')}`);
  for (const [index, id] of ids.entries()) {
    seedMoveResource(harness.mock, { id: `resource-${id}`, url: `https://example.com/${id}` });
    seedMovePlacement(harness.mock, {
      id, resourceId: `resource-${id}`, position: kind === 'chapter' ? SIZE - index : positions[index],
      series: {
        preserved: { position: index + 7 },
        ...(kind === 'chapter' ? { [SERIES]: { position: positions[index] } } : {}),
      },
    });
  }
  // A link in another featured group / outside the selected series is not a
  // participant in the requested order, even at the same rank.
  seedMoveResource(harness.mock, { id: 'unrelated', url: 'https://example.com/unrelated' });
  seedMovePlacement(harness.mock, {
    id: 'unrelated', resourceId: 'unrelated', position: 0, featured: true,
    series: { preserved: { position: 0 } },
  });
  return { ...harness, ids };
}

function snapshot(harness) {
  return structuredClone({
    profile: harness.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: 'META' }),
    series: harness.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: `SERIES#${SERIES}` }),
    placements: [...harness.ids, 'unrelated'].map((id) => harness.mock.read('profiles-test', {
      pk: `PROFILE#${OWNER}`, sk: `PLACEMENT#${id}`,
    })),
  });
}

function ordered(snapshot, kind) {
  return snapshot.placements.filter(({ id }) => id !== 'unrelated').slice().sort((a, b) => {
    const rank = (row) => kind === 'chapter' ? row.series[SERIES].position : row.position;
    return rank(a) - rank(b) || a.id.localeCompare(b.id);
  }).map(({ id }) => id);
}

async function move(harness, kind, id, ordinal, observed) {
  const path = kind === 'chapter'
    ? `/api/creador/series/${SERIES}/capitulos/${id}/mover`
    : `/api/creador/enlaces/${id}/mover`;
  const target = observed.placements.find((row) => row.id === id);
  // This work budget is deterministic and deliberately broad. The old
  // overlapping-window search exhausts it before returning the rejection;
  // it does not rely on CPU speed or a new product latency promise.
  const originalCompare = String.prototype.localeCompare;
  let comparisons = 0;
  String.prototype.localeCompare = function (...args) {
    if (++comparisons > 2_000_000) throw new Error('order calculation exceeded comparison work budget');
    return originalCompare.apply(this, args);
  };
  try {
    const response = await callApi(harness, path, {
      session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'POST', body: {
        profileVersion: observed.profile.version,
        placementVersion: target.version,
        ...(kind === 'chapter' ? { seriesVersion: observed.series.version } : {}),
        targetPosition: ordinal,
      },
    });
    return { status: response.status, body: await response.json(), comparisons };
  } finally {
    String.prototype.localeCompare = originalCompare;
  }
}

function assertInsertion(before, after, kind, id, ordinal) {
  const expected = ordered(before, kind).filter((value) => value !== id);
  expected.splice(ordinal - 1, 0, id);
  assert.deepEqual(ordered(after, kind), expected);
  assert.deepEqual(after.series, before.series);
  assert.equal(after.profile.version, before.profile.version + 1);
  for (const [index, row] of after.placements.entries()) {
    const prior = before.placements[index];
    if (kind === 'chapter') {
      assert.equal(row.position, prior.position);
      assert.equal(row.featured, prior.featured);
    }
    assert.deepEqual(row.series.preserved, prior.series.preserved);
    if (row.id === 'unrelated') assert.deepEqual(row, prior);
  }
}

for (const kind of ['link', 'chapter']) {
  for (const direction of ['toward-first', 'toward-last']) {
    test(`${kind}: 320 tied rows reject atomically with the nearest viable ordinal (${direction}) within bounded work`, async () => {
      const first = direction === 'toward-first';
      const harness = await setup(kind, Array(SIZE).fill(first ? 0 : MAX));
      const before = snapshot(harness);
      const id = harness.ids[first ? SIZE - 1 : 0];
      const requested = first ? 1 : SIZE;
      const maximumChangedNeighbors = kind === 'link' ? 98 : 97;
      const viable = first ? SIZE - maximumChangedNeighbors : maximumChangedNeighbors + 1;
      const rejected = await move(harness, kind, id, requested, before);
      assert.equal(rejected.status, 422, JSON.stringify(rejected));
      assert.equal(rejected.body.error, 'ORDER_MOVE_LIMIT');
      assert.equal(rejected.body.viablePosition, viable);
      assert.ok(rejected.comparisons < 2_000_000);
      assert.deepEqual(snapshot(harness), before);
      assert.deepEqual(moveTransactionMetrics(harness.mock), []);
      // Prove the returned boundary, rather than merely accepting a number.
      const tooFar = await move(harness, kind, id, viable + (first ? -1 : 1), before);
      assert.equal(tooFar.status, 422);
      assert.equal(tooFar.body.viablePosition, viable);
      assert.deepEqual(moveTransactionMetrics(harness.mock), []);
      const saved = await move(harness, kind, id, viable, before);
      assert.equal(saved.status, 200, JSON.stringify(saved));
      assertInsertion(before, snapshot(harness), kind, id, viable);
      assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 100 }]);
    });
  }
  for (const [name, positions, targetIndex, ordinal] of [
    ['nearby gap after tied prefix', Array.from({ length: SIZE }, (_, i) => i < 12 ? 0 : i * 10), SIZE - 1, 1],
    ['nearby gap before tied suffix', Array.from({ length: SIZE }, (_, i) => i < SIZE - 12 ? MAX - (SIZE - i) * 10 : MAX), 0, SIZE],
    ['sparse reverse move', Array.from({ length: SIZE }, (_, i) => i * 10), 0, SIZE],
  ]) {
    test(`${kind}: ${name} preserves exact insertion with 320 rows`, async () => {
      const harness = await setup(kind, positions);
      const before = snapshot(harness);
      const id = harness.ids[targetIndex];
      const result = await move(harness, kind, id, ordinal, before);
      assert.equal(result.status, 200, JSON.stringify(result));
      assertInsertion(before, snapshot(harness), kind, id, ordinal);
      const transactions = moveTransactionMetrics(harness.mock);
      assert.equal(transactions.length, 1);
      assert.ok(transactions[0].actionCount <= 100);
    });
  }
}

for (const kind of ['link', 'chapter']) {
  test(`${kind}: exhausting a required neighbor version keeps the known conflict and submits no writes`, async () => {
    const harness = await setup(kind, [0, 0, 0]);
    for (const id of harness.ids.slice(0, 2)) {
      const prior = harness.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: `PLACEMENT#${id}` });
      seedMovePlacement(harness.mock, { ...prior, version: MAX });
    }
    const before = snapshot(harness);
    const result = await move(harness, kind, harness.ids.at(-1), 1, before);
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'PLACEMENT_VERSION_EXHAUSTED');
    assert.deepEqual(snapshot(harness), before);
    assert.deepEqual(moveTransactionMetrics(harness.mock), []);
  });
}

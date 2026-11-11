import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { callApi, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import {
  createDynamoMoveHarness, seedMoveProfile, seedMovePlacement, seedMoveResource,
  seedMoveSeries, storedAttributeBytes,
} from './fixtures/creator-link-move.mjs';

const OWNER = 'profile-move-a';
const SERIES = 'budget-series';
const MAX = Number.MAX_SAFE_INTEGER;
const key = (id) => ({ pk: `PROFILE#${OWNER}`, sk: `PLACEMENT#${id}` });

async function budgetModule() {
  const module = await import('../src/lib/creator-order.mjs');
  assert.equal(typeof module.createOrderCalculationBudget, 'function');
  assert.equal(typeof module.OrderCalculationUnavailableError, 'function');
  assert.deepEqual(module.ORDER_CALCULATION_LIMITS, { work: 20_000_000, memoryBytes: 32 * 1024 * 1024 });
  return module;
}

async function setup(kind, positions, { largeRawImages = false, immutable = false, pageSize = 50 } = {}) {
  const h = await createDynamoMoveHarness({ projectionAware: true, queryPageSize: pageSize });
  seedMoveProfile(h.mock);
  if (kind === 'chapter') seedMoveSeries(h.mock, { id: SERIES });
  const ids = positions.map((_, index) => `budget-${String(index).padStart(5, '0')}`);
  for (const [index, id] of ids.entries()) {
    seedMoveResource(h.mock, { id: `resource-${id}`, url: `https://example.com/budget/${id}` });
    seedMovePlacement(h.mock, {
      id, resourceId: `resource-${id}`, position: kind === 'link' ? positions[index] : index * 10,
      version: immutable ? MAX : 1,
      series: { other: { position: index }, ...(kind === 'chapter' ? { [SERIES]: { position: positions[index] } } : {}) },
    });
    if (largeRawImages) {
      const row = structuredClone(h.mock.read('profiles-test', key(id)));
      row.futureField = '';
      row.futureField = 'x'.repeat(400 * 1024 - storedAttributeBytes(row));
      assert.equal(storedAttributeBytes(row), 400 * 1024);
      h.mock.seed('profiles-test', row);
    }
  }
  return { ...h, ids };
}

function digest(h) {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(h.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: 'META' })));
  for (const id of h.ids) hash.update(JSON.stringify(h.mock.read('profiles-test', key(id))));
  return hash.digest('hex');
}

function trackObservedBudget(h, { exhaustWorkAfterObservation = false } = {}) {
  assert.equal(typeof h.store.observeList, 'function', 'move input uses the bounded physical-observation seam');
  const original = h.store.observeList.bind(h.store);
  let budget;
  h.store.observeList = async (prefix, options) => {
    assert.ok(options?.budget, 'the command budget applies before all move rows are retained');
    assert.equal(typeof options.budget.snapshot, 'function');
    if (budget) assert.equal(options.budget, budget, 'observations share one command budget');
    budget = options.budget;
    const result = await original(prefix, options);
    if (exhaustWorkAfterObservation) {
      // Controlled boundary load, not a smaller injected product ceiling:
      // the real fixed ledger enters calculation with no remaining credits.
      const used = budget.snapshot().workUsed;
      budget.spendWork(20_000_000 - used);
    }
    return result;
  };
  return () => budget;
}

async function move(h, kind, targetId, ordinal) {
  const target = h.mock.read('profiles-test', key(targetId));
  const path = kind === 'link' ? `/api/creador/enlaces/${targetId}/mover`
    : `/api/creador/series/${SERIES}/capitulos/${targetId}/mover`;
  const response = await callApi(h, path, {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'POST',
    body: { profileVersion: 1, placementVersion: target.version, targetPosition: ordinal,
      ...(kind === 'chapter' ? { seriesVersion: 1 } : {}) },
  });
  return { status: response.status, body: await responseJson(response) };
}

async function legacyChapterMove(h, targetId, direction) {
  const response = await callApi(h, `/api/creador/series/${SERIES}/capitulos/${targetId}`, {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'PATCH',
    body: { profileVersion: 1, direction },
  });
  return { status: response.status, body: await responseJson(response) };
}

function assertBounded(budget) {
  assert.ok(budget, 'the actual command exposes its ledger to its physical observation dependency');
  const snapshot = budget.snapshot();
  assert.ok(snapshot.workUsed > 0 && snapshot.workUsed <= 20_000_000);
  assert.ok(snapshot.memoryUsed >= 0 && snapshot.peakMemory <= 32 * 1024 * 1024);
}

test('the fixed calculation ledger enforces work and live-memory boundaries without resetting spent work', async () => {
  const { createOrderCalculationBudget, OrderCalculationUnavailableError } = await budgetModule();
  const budget = createOrderCalculationBudget();
  budget.spendWork(20_000_000);
  assert.equal(budget.snapshot().workUsed, 20_000_000);
  assert.throws(() => budget.spendWork(1), OrderCalculationUnavailableError);
  assert.equal(budget.snapshot().workUsed, 20_000_000, 'a failed charge cannot exceed its ceiling');
  const memory = createOrderCalculationBudget();
  memory.reserveMemory(32 * 1024 * 1024);
  assert.equal(memory.snapshot().memoryUsed, 32 * 1024 * 1024);
  memory.releaseMemory(32 * 1024 * 1024);
  assert.equal(memory.snapshot().memoryUsed, 0);
  memory.reserveMemory(32 * 1024 * 1024);
  assert.equal(memory.snapshot().peakMemory, 32 * 1024 * 1024);
  const observed = memory.snapshot();
  try { observed.memoryUsed = 0; } catch (error) { assert.ok(error instanceof TypeError); }
  assert.equal(memory.snapshot().memoryUsed, 32 * 1024 * 1024, 'snapshot mutation cannot rewrite live accounting');
  assert.throws(() => memory.reserveMemory(1), OrderCalculationUnavailableError);
  assert.equal(memory.snapshot().memoryUsed, 32 * 1024 * 1024, 'a failed reservation cannot exceed its ceiling');
});

for (const kind of ['link', 'chapter']) {
  test(`${kind}: successful submission has already paid all fallible calculation work`, async () => {
    await budgetModule();
    const h = await setup(kind, [0, 10, 20]);
    const observedBudget = trackObservedBudget(h);
    assert.equal(typeof h.store.prepareTransaction, 'function');
    const prepare = h.store.prepareTransaction.bind(h.store);
    let atCommit;
    h.store.prepareTransaction = async (...args) => {
      const prepared = await prepare(...args);
      return {
        ...prepared,
        async commit() {
          atCommit = observedBudget().snapshot();
          return prepared.commit();
        },
      };
    };
    const result = await move(h, kind, h.ids[2], 1);
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(h.mock.transactions.length, 1);
    assert.ok(atCommit, 'the real command submits its prepared transaction');
    const afterResponse = observedBudget().snapshot();
    assert.equal(afterResponse.workUsed, atCommit.workUsed,
      'the calculation ledger has no additional work charges after commit');
    assert.ok(afterResponse.memoryUsed <= atCommit.memoryUsed,
      'post-commit cleanup may release memory, but cannot require another reservation');
    assert.equal(afterResponse.peakMemory, atCommit.peakMemory);
    const rank = (row) => kind === 'link' ? row.position : row.series[SERIES].position;
    const order = h.ids.map((id) => h.mock.read('profiles-test', key(id)))
      .sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id)).map(({ id }) => id);
    assert.deepEqual(order, [h.ids[2], ...h.ids.slice(0, 2)]);
  });

  test(`${kind}: input work already spent cannot be reset by the order calculation`, async () => {
    await budgetModule();
    const h = await setup(kind, [0, 10, 20]);
    const before = digest(h);
    const observedBudget = trackObservedBudget(h, { exhaustWorkAfterObservation: true });
    const result = await move(h, kind, h.ids[2], 1);
    assert.equal(result.status, 503, JSON.stringify(result));
    assert.equal(result.body.error, 'ORDER_MOVE_CALCULATION_UNAVAILABLE');
    assert.equal(Object.hasOwn(result.body, 'viablePosition'), false);
    assert.equal(h.mock.transactions.length, 0);
    assert.equal(digest(h), before);
    assertBounded(observedBudget());
  });

  test(`${kind}: large valid raw observations stop pagination at the memory budget, with a small feasible control`, async () => {
    await budgetModule();
    const positions = Array.from({ length: 96 }, (_, index) => index * 10);
    const h = await setup(kind, positions, { largeRawImages: true, pageSize: 2 });
    const before = digest(h);
    const observedBudget = trackObservedBudget(h);
    const result = await move(h, kind, h.ids.at(-1), 1);
    assert.equal(result.status, 503, JSON.stringify(result));
    assert.equal(result.body.error, 'ORDER_MOVE_CALCULATION_UNAVAILABLE');
    assert.equal(Object.hasOwn(result.body, 'viablePosition'), false);
    assert.equal(h.mock.transactions.length, 0);
    assert.equal(digest(h), before);
    const queries = h.mock.calls.filter(({ name, input }) => name === 'QueryCommand'
      && input.ExpressionAttributeValues?.[':sk'] === 'PLACEMENT#');
    assert.ok(queries.length > 0 && queries.length < 48,
      `stop requesting input pages instead of materializing all96 raw images: ${queries.length}`);
    assertBounded(observedBudget());

    const reduced = await setup(kind, [0, 10], { largeRawImages: true, pageSize: 2 });
    const control = await move(reduced, kind, reduced.ids[1], 1);
    assert.equal(control.status, 200, JSON.stringify(control));
    assert.equal(reduced.mock.transactions.length, 1);
    assert.ok(reduced.mock.transactions[0].physicalBytes <= 4 * 1024 * 1024);
    const rank = (row) => kind === 'link' ? row.position : row.series[SERIES].position;
    const order = reduced.ids.map((id) => reduced.mock.read('profiles-test', key(id)))
      .sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id)).map(({ id }) => id);
    assert.deepEqual(order, [reduced.ids[1], reduced.ids[0]]);
  });

  for (const mode of ['target-search', 'alternative-search']) {
    test(`${kind}: a hard ${mode} shares bounded accounting and never mistakes an unfinished calculation for a physical rejection`, async () => {
      await budgetModule();
      const length = mode === 'target-search' ? 1200 : 1000;
      const positions = mode === 'target-search'
        ? Array.from({ length }, (_, index) => index < length - 12 ? MAX - (length - index) * 10 : MAX)
        : Array(length).fill(0);
      const h = await setup(kind, positions, { immutable: mode === 'alternative-search' });
      const before = digest(h);
      const observedBudget = trackObservedBudget(h);
      const result = await move(h, kind, h.ids[0], length);
      assertBounded(observedBudget());
      if (result.status === 503) {
        assert.equal(result.body.error, 'ORDER_MOVE_CALCULATION_UNAVAILABLE');
        assert.equal(Object.hasOwn(result.body, 'viablePosition'), false);
        assert.equal(h.mock.transactions.length, 0);
        assert.equal(digest(h), before);
      } else if (mode === 'alternative-search') {
        // A more efficient complete proof may establish frozen-order failure
        // before exhausting work. Optimal inefficiency is not a requirement.
        assert.equal(result.status, 409, JSON.stringify(result));
        assert.equal(result.body.error, 'PLACEMENT_VERSION_EXHAUSTED');
        assert.equal(h.mock.transactions.length, 0);
        assert.equal(digest(h), before);
      } else {
        // There is a literal feasible suffix relabeling; a completed solver
        // may find it faster than the planning probe. It must not return422.
        assert.equal(result.status, 200, JSON.stringify(result));
        const rows = h.ids.map((id) => h.mock.read('profiles-test', key(id)));
        const rank = (row) => kind === 'link' ? row.position : row.series[SERIES].position;
        const actual = [...rows].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id)).map(({ id }) => id);
        assert.deepEqual(actual, [...h.ids.slice(1), h.ids[0]]);
        assert.equal(h.mock.transactions.length, 1);
        assert.ok(h.mock.transactions[0].actionCount <= 100);
        assert.ok(h.mock.transactions[0].physicalBytes <= 4 * 1024 * 1024);
      }
    });
  }
}

test('legacy chapter direction cannot reset exhausted observation work and reports unavailable without mutation', async () => {
  await budgetModule();
  const h = await setup('chapter', [0, 10, 20]);
  const before = digest(h);
  const observedBudget = trackObservedBudget(h, { exhaustWorkAfterObservation: true });
  const result = await legacyChapterMove(h, h.ids.at(-1), 'up');
  assert.equal(result.status, 503, JSON.stringify(result));
  assert.equal(result.body.error, 'ORDER_MOVE_CALCULATION_UNAVAILABLE');
  assert.equal(Object.hasOwn(result.body, 'viablePosition'), false);
  assert.equal(h.mock.transactions.length, 0);
  assert.equal(digest(h), before);
  assertBounded(observedBudget());
});

test('legacy chapter direction pays all budget-sensitive work before its physical transaction', async () => {
  await budgetModule();
  const h = await setup('chapter', [0, 10, 20]);
  const observedBudget = trackObservedBudget(h);
  assert.equal(typeof h.store.prepareTransaction, 'function');
  const prepare = h.store.prepareTransaction.bind(h.store);
  let atCommit;
  h.store.prepareTransaction = async (...args) => {
    const prepared = await prepare(...args);
    return {
      ...prepared,
      async commit() {
        atCommit = observedBudget().snapshot();
        return prepared.commit();
      },
    };
  };
  const result = await legacyChapterMove(h, h.ids.at(-1), 'up');
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(h.mock.transactions.length, 1);
  assert.ok(atCommit, 'the legacy request prepares and commits through the shared command');
  const afterResponse = observedBudget().snapshot();
  assert.equal(afterResponse.workUsed, atCommit.workUsed,
    'the calculation ledger has no additional work charges after commit');
  assert.ok(afterResponse.memoryUsed <= atCommit.memoryUsed,
    'post-commit cleanup can release memory but cannot require another reservation');
  assert.equal(afterResponse.peakMemory, atCommit.peakMemory);
  const rank = (row) => row.series[SERIES].position;
  const order = h.ids.map((id) => h.mock.read('profiles-test', key(id)))
    .sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id)).map(({ id }) => id);
  assert.deepEqual(order, [h.ids[0], h.ids[2], h.ids[1]]);
});

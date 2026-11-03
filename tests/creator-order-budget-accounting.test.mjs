import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOrderCalculationBudget,
  ORDER_CALCULATION_LIMITS,
  solveIntegerOrder,
} from '../src/lib/creator-order.mjs';

test('the shared order ledger has fixed immutable limits and nonresetting work', () => {
  assert.deepEqual(ORDER_CALCULATION_LIMITS, {
    work: 20_000_000,
    memoryBytes: 32 * 1024 * 1024,
  });
  assert.equal(Object.isFrozen(ORDER_CALCULATION_LIMITS), true);

  const budget = createOrderCalculationBudget();
  budget.spendWork(20_000_000);
  assert.throws(() => budget.spendWork(1), { name: 'OrderCalculationUnavailableError' });
  assert.equal(budget.snapshot().workUsed, 20_000_000);

  const memory = createOrderCalculationBudget();
  memory.reserveMemory(32 * 1024 * 1024);
  memory.releaseMemory(32 * 1024 * 1024);
  memory.reserveMemory(32 * 1024 * 1024);
  const snapshot = memory.snapshot();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(snapshot.memoryUsed, 32 * 1024 * 1024);
  assert.equal(snapshot.peakMemory, 32 * 1024 * 1024);
  assert.throws(() => memory.reserveMemory(1), { name: 'OrderCalculationUnavailableError' });
  assert.equal(memory.snapshot().memoryUsed, 32 * 1024 * 1024);
});

test('retainValue accounts nested raw values once and supports binary, maps, sets and BigInt', () => {
  const propertyBudget = createOrderCalculationBudget();
  propertyBudget.retainValue({ k: 'v' });
  assert.ok(propertyBudget.snapshot().memoryUsed >= 256 + 16 + 2 + 2,
    'ordinary properties include a reference slot and UTF-16 key/value storage');

  const budget = createOrderCalculationBudget();
  const shared = {
    text: 'x'.repeat(256),
    binary: new Uint8Array(128),
  };
  const graph = {
    rows: [shared, shared],
    lookup: new Map([['shared', shared]]),
    tags: new Set(['one', 12345678901234567890n]),
  };

  assert.equal(budget.retainValue(graph), graph);
  const first = budget.snapshot();
  assert.ok(first.workUsed > 0);
  assert.ok(first.memoryUsed > 0);
  assert.ok(first.peakMemory >= first.memoryUsed);

  budget.retainValue(graph);
  const repeated = budget.snapshot();
  assert.ok(repeated.workUsed > first.workUsed, 'rechecking a retained root still costs work');
  assert.equal(repeated.memoryUsed, first.memoryUsed, 'shared object identities are not retained twice');
  assert.equal(repeated.peakMemory, first.peakMemory);
});

test('solver result memory is already charged when retained in a prepared response', () => {
  const budget = createOrderCalculationBudget();
  const result = solveIntegerOrder([
    { id: 'target', position: 0, unchangedBytes: 2, changedBaseBytes: 0, canChange: true },
  ], {
    targetId: 'target', maxRank: 10, maxActions: 1, maxBytes: 2, maxItemBytes: 2,
  }, budget);

  assert.equal(result.kind, 'feasible');
  const beforeRetain = budget.snapshot();
  budget.retainValue(result);
  const afterRetain = budget.snapshot();
  assert.equal(afterRetain.memoryUsed, beforeRetain.memoryUsed);
  assert.ok(afterRetain.workUsed > beforeRetain.workUsed);
});

test('cloneValue prepays an isolated snapshot before invoking structuredClone', () => {
  const budget = createOrderCalculationBudget();
  const original = { nested: { title: 'before' }, tags: new Set(['one', 'two']) };
  budget.retainValue(original);
  const beforeClone = budget.snapshot();
  const nativeClone = globalThis.structuredClone;
  let snapshotAtClone;
  try {
    globalThis.structuredClone = (value) => {
      snapshotAtClone = budget.snapshot();
      return nativeClone(value);
    };
    const copy = budget.cloneValue(original);
    assert.ok(snapshotAtClone.workUsed > beforeClone.workUsed,
      'graph traversal work is spent before the native copy');
    assert.ok(snapshotAtClone.memoryUsed > beforeClone.memoryUsed,
      'the full copy footprint is reserved before the native copy');
    assert.notEqual(copy, original);
    assert.notEqual(copy.nested, original.nested);
    assert.deepEqual(copy, original);

    const beforeRetain = budget.snapshot();
    budget.retainValue(copy);
    assert.equal(budget.snapshot().memoryUsed, beforeRetain.memoryUsed,
      'the prepared snapshot is not charged twice');

    original.nested.title = 'changed after the snapshot';
    original.tags.add('three');
    assert.equal(copy.nested.title, 'before');
    assert.deepEqual([...copy.tags], ['one', 'two']);
  } finally {
    globalThis.structuredClone = nativeClone;
  }
});

test('cloneValue does not invoke structuredClone when the copy footprint cannot be prepaid', () => {
  const budget = createOrderCalculationBudget();
  budget.reserveMemory(ORDER_CALCULATION_LIMITS.memoryBytes - 900);
  const nativeClone = globalThis.structuredClone;
  let invoked = false;
  try {
    globalThis.structuredClone = (value) => {
      invoked = true;
      return nativeClone(value);
    };
    assert.throws(() => budget.cloneValue({ field: 'value' }), {
      name: 'OrderCalculationUnavailableError',
    });
    assert.equal(invoked, false, 'prepayment failure happens before native allocation');
    assert.ok(budget.snapshot().memoryUsed <= ORDER_CALCULATION_LIMITS.memoryBytes);
  } finally {
    globalThis.structuredClone = nativeClone;
  }
});

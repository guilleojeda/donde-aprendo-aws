import assert from 'node:assert/strict';
import test from 'node:test';

const SOLVER_MODULE = '../src/lib/creator-order.mjs';
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

// Independent cost oracle: DynamoDB number bytes are based on decimal digits
// after removing trailing zeroes. This intentionally does not import or copy
// the production successor recurrence.
function scannedNumberBytes(value) {
  if (value === 0) return 2;
  const significant = String(value).replace(/0+$/u, '');
  return 1 + Math.ceil(significant.length / 2);
}

function assignmentCost(rows, options, positions) {
  if (positions.length !== rows.length) return null;
  let actions = 0;
  let bytes = 0;
  const participants = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const position = positions[index];
    if (!Number.isSafeInteger(position) || position < 0 || position > options.maxRank) return null;
    const changed = position !== row.position;
    if (changed && !row.canChange) return null;

    // A normal unchanged neighbor is not a transaction participant. The
    // target always is, using its original physical image when unchanged.
    if (!changed && row.id !== options.targetId) continue;

    const itemBytes = changed
      ? row.changedBaseBytes + scannedNumberBytes(position)
      : row.unchangedBytes;
    actions += 1;
    bytes += itemBytes;
    participants.push({ id: row.id, changed, itemBytes });
    if (itemBytes > options.maxItemBytes) return null;
  }

  for (let index = 1; index < rows.length; index += 1) {
    const prior = rows[index - 1];
    const current = rows[index];
    const rankDelta = positions[index] - positions[index - 1];
    if (rankDelta < 0) return null;
    if (rankDelta === 0 && prior.id.localeCompare(current.id) > 0) return null;
  }

  if (actions > options.maxActions || bytes > options.maxBytes) return null;
  return { actions, bytes, participants };
}

// Visit every rank vector in the bounded domain, even after finding a witness.
// The returned count makes the enumeration bound explicit at each call site.
function enumerateAssignments(rows, options) {
  let visited = 0;
  let feasible = false;
  const positions = Array(rows.length).fill(0);

  function visit(index) {
    if (index === rows.length) {
      visited += 1;
      if (assignmentCost(rows, options, positions)) feasible = true;
      return;
    }
    for (let rank = 0; rank <= options.maxRank; rank += 1) {
      positions[index] = rank;
      visit(index + 1);
    }
  }

  visit(0);
  return { feasible, visited, expected: (options.maxRank + 1) ** rows.length };
}

function bruteFirstIntegerInByteClass(lower, byteSize, maxRank) {
  for (let rank = lower; rank <= maxRank; rank += 1) {
    if (scannedNumberBytes(rank) === byteSize) return rank;
  }
  return null;
}

function* integerVectors(length, maxValue) {
  const vector = Array(length).fill(0);
  function* visit(index) {
    if (index === length) {
      yield vector.slice();
      return;
    }
    for (let value = 0; value <= maxValue; value += 1) {
      vector[index] = value;
      yield* visit(index + 1);
    }
  }
  yield* visit(0);
}

function* permutations(values) {
  if (values.length <= 1) {
    yield values.slice();
    return;
  }
  for (let index = 0; index < values.length; index += 1) {
    const rest = values.slice(0, index).concat(values.slice(index + 1));
    for (const suffix of permutations(rest)) yield [values[index], ...suffix];
  }
}

function rowChangeMask(length, mask) {
  return Array.from({ length }, (_, index) => Boolean(mask & (1 << index)));
}

async function loadProduct(t) {
  let product;
  try {
    product = await import(SOLVER_MODULE);
  } catch (error) {
    t.diagnostic(`phase 3 product module is not available yet: ${error.code ?? error.message}`);
    assert.fail(`expected ${SOLVER_MODULE} to export the approved order solver`);
  }
  assert.equal(typeof product.solveIntegerOrder, 'function', 'solveIntegerOrder export');
  return product;
}

function assertWitness(rows, options, positions, context) {
  assert.equal(positions.length, rows.length, `${context}: witness covers every desired row`);
  let actions = 0;
  let bytes = 0;
  const participants = [];

  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    const row = rows[index];
    assert.ok(Number.isSafeInteger(position) && position >= 0 && position <= options.maxRank,
      `${context}: rank ${position} is safe and in range`);
    if (index > 0) {
      const previous = rows[index - 1];
      const previousPosition = positions[index - 1];
      assert.ok(previousPosition < position
        || (previousPosition === position && previous.id.localeCompare(row.id) <= 0),
      `${context}: ranks and native ID ties preserve desired insertion order`);
    }

    const didChange = position !== row.position;
    assert.ok(!didChange || row.canChange, `${context}: immutable row ${row.id} did not move`);
    const participates = didChange || row.id === options.targetId;
    if (!participates) continue;

    const physicalBytes = didChange
      ? row.changedBaseBytes + scannedNumberBytes(position)
      : row.unchangedBytes;
    actions += 1;
    bytes += physicalBytes;
    participants.push({ id: row.id, changed: didChange, itemBytes: physicalBytes });
    assert.ok(physicalBytes <= options.maxItemBytes,
      `${context}: participant ${row.id} uses ${physicalBytes} bytes within the item limit`);
  }

  assert.equal(participants.filter(({ id }) => id === options.targetId).length, 1,
    `${context}: target participates exactly once`);
  assert.ok(actions <= options.maxActions, `${context}: ${actions} actions within the action limit`);
  assert.ok(bytes <= options.maxBytes, `${context}: ${bytes} bytes within the aggregate limit`);
  const cost = { actions, bytes, participants };
  return cost;
}

function assertMatchesOracle(solver, rows, options, context) {
  const oracle = enumerateAssignments(rows, options);
  assert.equal(oracle.visited, oracle.expected, `${context}: oracle enumerated the whole rank domain`);

  const result = solver.solveIntegerOrder(rows.map((row) => ({ ...row })), { ...options });
  assert.ok(result && typeof result === 'object', `${context}: solver result object`);
  if (!oracle.feasible) {
    assert.equal(result.kind, 'impossible', `${context}: no bounded physical assignment exists`);
    return;
  }

  assert.equal(result.kind, 'feasible', `${context}: bounded physical assignment exists`);
  assert.ok(Array.isArray(result.positions), `${context}: positions witness`);
  assert.equal(result.positions.length, rows.length, `${context}: positions align with desired rows`);
  assertWitness(rows, options, result.positions, context);
}

function baseOptions(rows, overrides = {}) {
  return {
    targetId: rows.at(-1).id,
    maxRank: 2,
    maxActions: rows.length + 1,
    maxBytes: (rows.length + 1) * 8,
    maxItemBytes: 64,
    ...overrides,
  };
}

test('creator order feasibility acceptance', async (t) => {
  await t.test('independent oracle passes literal controls before product imports', () => {
    assert.equal(scannedNumberBytes(0), 2);
    assert.equal(scannedNumberBytes(9), 2);
    assert.equal(scannedNumberBytes(10), 2);
    assert.equal(scannedNumberBytes(999), 3);
    assert.equal(scannedNumberBytes(1_000), 2);
    assert.equal(scannedNumberBytes(1_001), 3);
    assert.equal(scannedNumberBytes(MAX_SAFE), 9);

    const ties = ['A', 'a', 'á'].sort((left, right) => left.localeCompare(right));
    const tieRows = ties.map((id) => ({
      id,
      position: 0,
      unchangedBytes: 2,
      changedBaseBytes: 0,
      canChange: true,
    }));
    const tieOptions = baseOptions(tieRows, {
      targetId: ties[1],
      maxRank: 0,
      maxActions: 1,
      maxBytes: 2,
      maxItemBytes: 2,
    });
    const tied = enumerateAssignments(tieRows, tieOptions);
    assert.deepEqual(ties, tieRows.map(({ id }) => id));
    assert.deepEqual(tied, { feasible: true, visited: 1, expected: 1 });
    assert.deepEqual(assignmentCost(tieRows, tieOptions, [0, 0, 0]), {
      actions: 1,
      bytes: 2,
      participants: [{ id: ties[1], changed: false, itemBytes: 2 }],
    });

    const tooLargeUnchangedTarget = [{
      id: 'target', position: 0, unchangedBytes: 3, changedBaseBytes: 0, canChange: false,
    }];
    const tooLargeOptions = baseOptions(tooLargeUnchangedTarget, {
      targetId: 'target', maxRank: 0, maxActions: 1, maxBytes: 3, maxItemBytes: 2,
    });
    assert.equal(assignmentCost(tooLargeUnchangedTarget, tooLargeOptions, [0]), null);
    assert.deepEqual(enumerateAssignments(tooLargeUnchangedTarget, tooLargeOptions), {
      feasible: false, visited: 1, expected: 1,
    });

    const oversizedUnchangedNeighbor = [
      { id: 'a', position: 0, unchangedBytes: 99, changedBaseBytes: 0, canChange: false },
      { id: 'b', position: 1, unchangedBytes: 2, changedBaseBytes: 0, canChange: true },
    ];
    const neighborOptions = baseOptions(oversizedUnchangedNeighbor, {
      targetId: 'b', maxRank: 1, maxActions: 1, maxBytes: 2, maxItemBytes: 2,
    });
    assert.deepEqual(assignmentCost(oversizedUnchangedNeighbor, neighborOptions, [0, 1]), {
      actions: 1,
      bytes: 2,
      participants: [{ id: 'b', changed: false, itemBytes: 2 }],
    });
    assert.deepEqual(assertWitness(oversizedUnchangedNeighbor, neighborOptions, [0, 1], 'literal untouched neighbor control'), {
      actions: 1,
      bytes: 2,
      participants: [{ id: 'b', changed: false, itemBytes: 2 }],
    });
    assert.equal(enumerateAssignments(oversizedUnchangedNeighbor, neighborOptions).feasible, true);

    const targetMustUseNextMemberOfItsClass = [
      { id: 'a-anchor', position: 1, unchangedBytes: 0, changedBaseBytes: 0, canChange: false },
      { id: 'z-target', position: 1, unchangedBytes: 9, changedBaseBytes: 0, canChange: true },
    ];
    const nextClassOptions = baseOptions(targetMustUseNextMemberOfItsClass, {
      targetId: 'z-target', maxRank: 2, maxActions: 1, maxBytes: 2, maxItemBytes: 2,
    });
    assert.equal(assignmentCost(targetMustUseNextMemberOfItsClass, nextClassOptions, [1, 2]).bytes, 2);
    assert.deepEqual(assertWitness(targetMustUseNextMemberOfItsClass, nextClassOptions, [1, 2], 'literal target participant control'), {
      actions: 1,
      bytes: 2,
      participants: [{ id: 'z-target', changed: true, itemBytes: 2 }],
    });
    assert.equal(enumerateAssignments(targetMustUseNextMemberOfItsClass, nextClassOptions).feasible, true);
    assert.equal(enumerateAssignments(targetMustUseNextMemberOfItsClass, {
      ...nextClassOptions, maxRank: 1,
    }).feasible, false);

    const lowerCostSuccessor = [
      { id: 'z-anchor', position: 999, unchangedBytes: 0, changedBaseBytes: 0, canChange: false },
      { id: 'a-target', position: 999, unchangedBytes: 8, changedBaseBytes: 0, canChange: true },
    ];
    const lowerCostOptions = baseOptions(lowerCostSuccessor, {
      targetId: 'a-target', maxRank: 1_000, maxActions: 1, maxBytes: 2, maxItemBytes: 2,
    });
    assert.equal(assignmentCost(lowerCostSuccessor, lowerCostOptions, [999, 1_000]).bytes, 2);
    assert.equal(enumerateAssignments(lowerCostSuccessor, lowerCostOptions).feasible, true);
    assert.equal(scannedNumberBytes(999), 3);
    assert.equal(scannedNumberBytes(1_000), 2);

    const boundaryControls = [
      [0, 2, 1_200, 0],
      [1, 2, 1_200, 1],
      [999, 3, 1_200, 999],
      [1_000, 2, 1_200, 1_000],
      [1_001, 2, 1_200, 1_100],
      [1_200, 3, 1_200, null],
      [0, 4, 1_200, null],
    ];
    for (const [lower, byteSize, maxRank, expected] of boundaryControls) {
      assert.equal(bruteFirstIntegerInByteClass(lower, byteSize, maxRank), expected);
    }
  });

  await t.test('complete small rank, ID tie, immutable-row and action domain', async (t) => {
    const solver = await loadProduct(t);
    let cases = 0;
    for (const length of [1, 2, 3]) {
      const idSets = [
        ['a', 'b', 'c'].slice(0, length),
        ['A', 'a', 'á'].slice(0, length),
      ];
      for (const idSet of idSets) {
        for (const ids of permutations(idSet)) {
          for (const oldPositions of integerVectors(length, 2)) {
            for (let changeMask = 0; changeMask < 1 << length; changeMask += 1) {
              const canChange = rowChangeMask(length, changeMask);
              const rows = ids.map((id, index) => ({
                id,
                position: oldPositions[index],
                unchangedBytes: 0,
                changedBaseBytes: 0,
                canChange: canChange[index],
              }));
              for (let targetIndex = 0; targetIndex < length; targetIndex += 1) {
                for (let maxActions = 0; maxActions <= length + 1; maxActions += 1) {
                  const options = baseOptions(rows, {
                    targetId: rows[targetIndex].id,
                    maxRank: 2,
                    maxActions,
                    maxBytes: (length + 1) * 2,
                    maxItemBytes: 2,
                  });
                  assertMatchesOracle(solver, rows, options,
                    `rank domain case ${cases}: rows=${JSON.stringify(rows)} maxActions=${maxActions}`);
                  cases += 1;
                }
              }
            }
          }
        }
      }
    }
    assert.ok(cases > 20_000, `deterministic complete domain should be substantial; got ${cases}`);
    t.diagnostic(`checked ${cases} complete small rank/action input configurations`);
  });

  await t.test('complete small physical item and aggregate byte domains', async (t) => {
    const solver = await loadProduct(t);
    const profiles = [
      { unchangedBytes: 0, changedBaseBytes: 0 },
      { unchangedBytes: 4, changedBaseBytes: 0 },
      { unchangedBytes: 0, changedBaseBytes: 2 },
    ];
    const maxByteBudgets = [0, 2, 4, 6, 8];
    const maxItemBudgets = [0, 2, 3, 4];
    let cases = 0;

    for (const length of [1, 2]) {
      const idOrders = length === 1 ? [['a']] : [['a', 'b'], ['b', 'a']];
      for (const ids of idOrders) {
        for (const oldPositions of integerVectors(length, 2)) {
          for (let changeMask = 0; changeMask < 1 << length; changeMask += 1) {
            const canChange = rowChangeMask(length, changeMask);
            for (const rowProfiles of integerVectors(length, profiles.length - 1)) {
              const rows = ids.map((id, index) => ({
                id,
                position: oldPositions[index],
                ...profiles[rowProfiles[index]],
                canChange: canChange[index],
              }));
              for (let targetIndex = 0; targetIndex < length; targetIndex += 1) {
                for (let maxActions = 0; maxActions <= length + 1; maxActions += 1) {
                  for (const maxBytes of maxByteBudgets) {
                    for (const maxItemBytes of maxItemBudgets) {
                      const options = baseOptions(rows, {
                        targetId: rows[targetIndex].id,
                        maxRank: 2,
                        maxActions,
                        maxBytes,
                        maxItemBytes,
                      });
                      assertMatchesOracle(solver, rows, options,
                        `byte domain case ${cases}: rows=${JSON.stringify(rows)} limits=${maxActions}/${maxBytes}/${maxItemBytes}`);
                      cases += 1;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    assert.ok(cases > 100_000, `deterministic complete byte domain should be substantial; got ${cases}`);
    t.diagnostic(`checked ${cases} complete small physical-budget input configurations`);
  });

  await t.test('explicit target-image, exclusion, byte-class, and exact-budget regressions', async (t) => {
    const solver = await loadProduct(t);

    const oversizedTargetThatMustChange = [
      { id: 'a-anchor', position: 1, unchangedBytes: 0, changedBaseBytes: 0, canChange: false },
      { id: 'z-target', position: 1, unchangedBytes: 9, changedBaseBytes: 0, canChange: true },
    ];
    const targetOptions = {
      targetId: 'z-target', maxRank: 2, maxActions: 1, maxBytes: 2, maxItemBytes: 2,
    };
    const targetResult = solver.solveIntegerOrder(oversizedTargetThatMustChange, targetOptions);
    assert.equal(targetResult.kind, 'feasible', 'oversized unchanged target image can be replaced by a fitting changed image');
    assert.deepEqual(targetResult.positions, [1, 2], 'the unchanged rank is excluded from its changed branch and the next class rank is used');
    const targetCost = assertWitness(oversizedTargetThatMustChange, targetOptions, targetResult.positions, 'oversized target recovery');
    assert.deepEqual(targetCost.participants, [{ id: 'z-target', changed: true, itemBytes: 2 }]);

    const oversizedUnchangedNeighbor = [
      { id: 'a', position: 0, unchangedBytes: 99, changedBaseBytes: 0, canChange: false },
      { id: 'b', position: 1, unchangedBytes: 2, changedBaseBytes: 0, canChange: true },
    ];
    const neighborOptions = {
      targetId: 'b', maxRank: 1, maxActions: 1, maxBytes: 2, maxItemBytes: 2,
    };
    const neighborResult = solver.solveIntegerOrder(oversizedUnchangedNeighbor, neighborOptions);
    assert.equal(neighborResult.kind, 'feasible', 'unchanged non-target neighbors are not transaction participants');
    assertWitness(oversizedUnchangedNeighbor, neighborOptions, neighborResult.positions, 'unchanged neighbor exclusion');

    const unchangedTargetTooLarge = [{
      id: 'target', position: 0, unchangedBytes: 3, changedBaseBytes: 0, canChange: false,
    }];
    const impossibleUnchangedTargetOptions = {
      targetId: 'target', maxRank: 0, maxActions: 1, maxBytes: 3, maxItemBytes: 2,
    };
    assert.equal(solver.solveIntegerOrder(unchangedTargetTooLarge, impossibleUnchangedTargetOptions).kind, 'impossible',
      'an unchanged target participates and its original image must satisfy the item limit');

    const byteSavingSuccessor = [
      { id: 'z-anchor', position: 999, unchangedBytes: 0, changedBaseBytes: 0, canChange: false },
      { id: 'a-target', position: 999, unchangedBytes: 8, changedBaseBytes: 0, canChange: true },
    ];
    const byteSavingOptions = {
      targetId: 'a-target', maxRank: 1_000, maxActions: 1, maxBytes: 2, maxItemBytes: 2,
    };
    const byteSavingResult = solver.solveIntegerOrder(byteSavingSuccessor, byteSavingOptions);
    assert.equal(byteSavingResult.kind, 'feasible', 'a later rank with the same required order may have a cheaper stored-number class');
    assertWitness(byteSavingSuccessor, byteSavingOptions, byteSavingResult.positions, 'lower-cost number class');
    assert.deepEqual(byteSavingResult.positions, [999, 1_000]);

    const exactBudgets = [{
      id: 'target', position: 0, unchangedBytes: 3, changedBaseBytes: 0, canChange: true,
    }];
    const exact = { targetId: 'target', maxRank: 0, maxActions: 1, maxBytes: 3, maxItemBytes: 3 };
    assert.equal(solver.solveIntegerOrder(exactBudgets, exact).kind, 'feasible', 'action, item and aggregate bytes may equal their bounds');
    assert.equal(solver.solveIntegerOrder(exactBudgets, { ...exact, maxActions: 0 }).kind, 'impossible', 'one action below the required count is impossible');
    assert.equal(solver.solveIntegerOrder(exactBudgets, { ...exact, maxBytes: 2 }).kind, 'impossible', 'one aggregate byte below the required count is impossible');
    assert.equal(solver.solveIntegerOrder(exactBudgets, { ...exact, maxItemBytes: 2 }).kind, 'impossible', 'one item byte below the required image is impossible');
    assert.equal(solver.solveIntegerOrder(exactBudgets, { ...exact, maxActions: 2, maxBytes: 4, maxItemBytes: 4 }).kind, 'feasible', 'one unit above each cost bound remains feasible');
  });

  await t.test('successor matches a bounded plain integer scan, including decimal and safe-integer edges', async (t) => {
    const product = await loadProduct(t);
    assert.equal(typeof product.firstIntegerInByteClass, 'function', 'firstIntegerInByteClass export');
    const actual = product.firstIntegerInByteClass;
    let cases = 0;

    for (let lower = 0; lower <= 1_200; lower += 1) {
      for (let byteSize = 2; byteSize <= 4; byteSize += 1) {
        assert.equal(actual(lower, byteSize, 1_200), bruteFirstIntegerInByteClass(lower, byteSize, 1_200),
          `bounded scan from ${lower}, class ${byteSize}`);
        cases += 1;
      }
    }

    const boundaryLowers = new Set([0, 1, 2, 8, 9, 10, 11]);
    for (let exponent = 1; exponent <= 15; exponent += 1) {
      const power = 10 ** exponent;
      for (let offset = -3; offset <= 3; offset += 1) {
        const lower = power + offset;
        if (lower >= 0 && lower <= MAX_SAFE) boundaryLowers.add(lower);
      }
      for (const coefficient of [2, 9, 10, 11, 99]) {
        const boundary = coefficient * (10 ** Math.max(0, exponent - 1));
        for (let offset = -2; offset <= 2; offset += 1) {
          const lower = boundary + offset;
          if (lower >= 0 && lower <= MAX_SAFE) boundaryLowers.add(lower);
        }
      }
    }
    for (let offset = 0; offset <= 128; offset += 1) boundaryLowers.add(MAX_SAFE - offset);

    for (const lower of boundaryLowers) {
      const end = Math.min(MAX_SAFE, lower + 64);
      for (let byteSize = 2; byteSize <= 9; byteSize += 1) {
        assert.equal(actual(lower, byteSize, end), bruteFirstIntegerInByteClass(lower, byteSize, end),
          `bounded boundary scan from ${lower} through ${end}, class ${byteSize}`);
        cases += 1;
      }
    }

    assert.equal(actual(0, 1, 1_200), null, 'class one has no nonnegative integer');
    assert.equal(actual(0, 10, MAX_SAFE), null, 'classes above the safe-integer domain are impossible');
    assert.equal(actual(1_201, 2, 1_200), null, 'lower bound past maxRank is impossible');
    assert.equal(actual(MAX_SAFE, 9), MAX_SAFE, 'default maxRank includes the final safe integer');
    assert.equal(actual(MAX_SAFE, 2), null, 'no later member exists after the final safe integer');
    t.diagnostic(`checked ${cases} successor cases against a plain bounded scan`);
  });
});

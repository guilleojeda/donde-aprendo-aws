const MAX_SAFE_RANK = Number.MAX_SAFE_INTEGER;
const OBJECT_ACCOUNTING_BYTES = 256;
const SLOT_ACCOUNTING_BYTES = 16;
const STRING_WORK_CHUNK = 64;

export const ORDER_CALCULATION_LIMITS = Object.freeze({
  work: 20_000_000,
  memoryBytes: 32 * 1024 * 1024,
});

export class OrderCalculationUnavailableError extends Error {
  constructor(resource = 'budget') {
    super(`Order calculation ${resource} limit exceeded`);
    this.name = 'OrderCalculationUnavailableError';
    this.resource = resource;
  }
}

const budgetStates = new WeakMap();
const IMPOSSIBLE = Object.freeze({ kind: 'impossible' });
const UNAVAILABLE = Object.freeze({ kind: 'unavailable' });

function assertCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative safe integer`);
  }
}

function newBudgetState() {
  return {
    workUsed: 0,
    memoryUsed: 0,
    peakMemory: 0,
    seenObjects: new WeakSet(),
    preaccountedObjects: new WeakSet(),
  };
}

function stateFor(budget) {
  const state = budgetStates.get(budget);
  if (!state) throw new TypeError('A budget from createOrderCalculationBudget() is required');
  return state;
}

function chargeStringWork(budget, value) {
  const chunks = Math.max(1, Math.ceil(value.length / STRING_WORK_CHUNK));
  budget.spendWork(chunks);
}

function reserveString(budget, value, reserve) {
  chargeStringWork(budget, value);
  const bytes = value.length * 2;
  if (!Number.isSafeInteger(bytes)) throw new OrderCalculationUnavailableError('memory');
  reserve(bytes);
}

function reserveBigInt(budget, value, reserve) {
  budget.spendWork();
  let remaining = value < 0n ? -value : value;
  let words = 0;
  while (remaining > 0n) {
    budget.spendWork();
    remaining >>= 32n;
    words += 1;
  }
  const bytes = 32 + words * 8;
  if (!Number.isSafeInteger(bytes)) throw new OrderCalculationUnavailableError('memory');
  reserve(bytes);
}

function isArrayIndexKey(key) {
  if (key === '') return false;
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < 0xffff_ffff && String(index) === key;
}

function enqueue(pending, value) {
  pending.push(value);
}

function visitEnumerableProperties(
  value,
  pushValue,
  budget,
  reserveGraph,
  { skipArrayIndices = false } = {},
) {
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    budget.spendWork();
    if (skipArrayIndices && isArrayIndexKey(key)) continue;
    reserveGraph(SLOT_ACCOUNTING_BYTES);
    reserveString(budget, key, reserveGraph);
    pushValue(value[key]);
  }
}

function walkValueGraph(budget, root, seenObjects, preaccountedObjects = null) {
  let graphBytes = 0;
  let scratchBytes = 0;
  const reserveGraph = (bytes) => {
    budget.reserveMemory(bytes);
    graphBytes += bytes;
  };
  const reserveScratch = (bytes) => {
    budget.reserveMemory(bytes);
    scratchBytes += bytes;
  };

  budget.spendWork();
  reserveScratch(OBJECT_ACCOUNTING_BYTES);
  const pending = [];
  let pendingCapacity = 0;
  const push = (value) => {
    if (pending.length === pendingCapacity) {
      const nextCapacity = pendingCapacity === 0 ? 8 : pendingCapacity * 2;
      const capacityBytes = (nextCapacity - pendingCapacity) * SLOT_ACCOUNTING_BYTES;
      if (!Number.isSafeInteger(capacityBytes)) throw new OrderCalculationUnavailableError('memory');
      reserveScratch(capacityBytes);
      pendingCapacity = nextCapacity;
    }
    enqueue(pending, value);
  };
  try {
    push(root);

    while (pending.length > 0) {
      budget.spendWork();
      const value = pending.pop();

      if (typeof value === 'string') {
        reserveString(budget, value, reserveGraph);
        continue;
      }
      if (typeof value === 'bigint') {
        reserveBigInt(budget, value, reserveGraph);
        continue;
      }
      if (value === null || (typeof value !== 'object' && typeof value !== 'function')) continue;
      if (preaccountedObjects?.has(value)) continue;
      if (seenObjects.has(value)) continue;

      if (ArrayBuffer.isView(value)) {
        reserveGraph(OBJECT_ACCOUNTING_BYTES);
        seenObjects.add(value);
        const buffer = value.buffer;
        if (buffer && !seenObjects.has(buffer)) {
          const backingBytes = OBJECT_ACCOUNTING_BYTES + buffer.byteLength;
          if (!Number.isSafeInteger(backingBytes)) throw new OrderCalculationUnavailableError('memory');
          reserveGraph(backingBytes);
          seenObjects.add(buffer);
        }
        visitEnumerableProperties(value, push, budget, reserveGraph, { skipArrayIndices: true });
        continue;
      }

      if (value instanceof ArrayBuffer
        || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)) {
        const bytes = OBJECT_ACCOUNTING_BYTES + value.byteLength;
        if (!Number.isSafeInteger(bytes)) throw new OrderCalculationUnavailableError('memory');
        reserveGraph(bytes);
        seenObjects.add(value);
        continue;
      }

      if (Array.isArray(value)) {
        const slotsBytes = value.length * SLOT_ACCOUNTING_BYTES;
        const bytes = OBJECT_ACCOUNTING_BYTES + slotsBytes;
        if (!Number.isSafeInteger(bytes)) throw new OrderCalculationUnavailableError('memory');
        reserveGraph(bytes);
        seenObjects.add(value);
        for (let index = 0; index < value.length; index += 1) {
          budget.spendWork();
          if (index in value) push(value[index]);
        }
        visitEnumerableProperties(value, push, budget, reserveGraph, { skipArrayIndices: true });
        continue;
      }

      if (value instanceof Map) {
        const slotsBytes = value.size * SLOT_ACCOUNTING_BYTES * 2;
        const bytes = OBJECT_ACCOUNTING_BYTES + slotsBytes;
        if (!Number.isSafeInteger(bytes)) throw new OrderCalculationUnavailableError('memory');
        reserveGraph(bytes);
        seenObjects.add(value);
        for (const [key, item] of value) {
          budget.spendWork();
          push(key);
          push(item);
        }
        visitEnumerableProperties(value, push, budget, reserveGraph);
        continue;
      }

      if (value instanceof Set) {
        const slotsBytes = value.size * SLOT_ACCOUNTING_BYTES;
        const bytes = OBJECT_ACCOUNTING_BYTES + slotsBytes;
        if (!Number.isSafeInteger(bytes)) throw new OrderCalculationUnavailableError('memory');
        reserveGraph(bytes);
        seenObjects.add(value);
        for (const item of value) {
          budget.spendWork();
          push(item);
        }
        visitEnumerableProperties(value, push, budget, reserveGraph);
        continue;
      }

      reserveGraph(OBJECT_ACCOUNTING_BYTES);
      seenObjects.add(value);
      visitEnumerableProperties(value, push, budget, reserveGraph);
    }
  } finally {
    if (scratchBytes > 0) budget.releaseMemory(scratchBytes);
  }

  return graphBytes;
}

/** Charge a JSON-like graph once per live object identity without pinning it. */
function retainValue(budget, root) {
  const state = stateFor(budget);
  walkValueGraph(budget, root, state.seenObjects, state.preaccountedObjects);
  return root;
}

/** Precharge an object copy, then use native cloning for snapshot isolation. */
function cloneValue(budget, value) {
  if (value === null || typeof value !== 'object') {
    throw new TypeError('cloneValue requires an object value');
  }
  const state = stateFor(budget);
  budget.spendWork();
  budget.reserveMemory(OBJECT_ACCOUNTING_BYTES);
  let accountedBytes;
  try {
    accountedBytes = walkValueGraph(budget, value, new WeakSet());
  } finally {
    budget.releaseMemory(OBJECT_ACCOUNTING_BYTES);
  }
  let copy;
  try {
    copy = structuredClone(value);
  } catch (error) {
    budget.releaseMemory(accountedBytes);
    throw error;
  }
  state.preaccountedObjects.add(copy);
  return copy;
}

/**
 * Create the one fixed work and live-memory ledger shared by a complete move
 * command. Work is cumulative; released memory can be reserved again.
 */
export function createOrderCalculationBudget() {
  const state = newBudgetState();
  const budget = {
    spendWork(count = 1) {
      assertCount(count, 'Work charge');
      if (count > ORDER_CALCULATION_LIMITS.work - state.workUsed) {
        throw new OrderCalculationUnavailableError('work');
      }
      state.workUsed += count;
    },
    reserveMemory(bytes) {
      assertCount(bytes, 'Memory reservation');
      if (bytes > ORDER_CALCULATION_LIMITS.memoryBytes - state.memoryUsed) {
        throw new OrderCalculationUnavailableError('memory');
      }
      state.memoryUsed += bytes;
      state.peakMemory = Math.max(state.peakMemory, state.memoryUsed);
    },
    releaseMemory(bytes) {
      assertCount(bytes, 'Memory release');
      if (bytes > state.memoryUsed) {
        throw new RangeError(`Cannot release ${bytes} accounted bytes; only ${state.memoryUsed} remain`);
      }
      state.memoryUsed -= bytes;
    },
    retainValue(value) {
      return retainValue(budget, value);
    },
    cloneValue(value) {
      return cloneValue(budget, value);
    },
    snapshot() {
      return Object.freeze({
        workUsed: state.workUsed,
        workLimit: ORDER_CALCULATION_LIMITS.work,
        memoryUsed: state.memoryUsed,
        memoryLimit: ORDER_CALCULATION_LIMITS.memoryBytes,
        peakMemory: state.peakMemory,
      });
    },
  };
  budgetStates.set(budget, state);
  return Object.freeze(budget);
}

const SCALAR_CLASSES = (() => {
  const powers = Array.from({ length: 17 }, (_, exponent) => 10n ** BigInt(exponent));
  return Object.freeze(Array.from({ length: 8 }, (_, index) => {
    const byteSize = index + 2;
    const intervals = [];
    for (let trailingZeros = 0; trailingZeros <= 15; trailingZeros += 1) {
      for (const digits of [2 * (byteSize - 1) - 1, 2 * (byteSize - 1)]) {
        if (digits < 1 || digits + trailingZeros > 16) continue;
        intervals.push(Object.freeze({
          power: powers[trailingZeros],
          minCoefficient: powers[digits - 1],
          maxCoefficient: powers[digits] - 1n,
        }));
      }
    }
    return Object.freeze({ byteSize, intervals: Object.freeze(intervals) });
  }));
})();

/** Return the first safe nonnegative integer in a DynamoDB number-byte class. */
export function firstIntegerInByteClass(
  lower,
  byteSize,
  maxRank = MAX_SAFE_RANK,
  budget,
) {
  if (!Number.isSafeInteger(lower) || lower < 0
    || !Number.isSafeInteger(maxRank) || maxRank < 0
    || !Number.isInteger(byteSize) || byteSize < 2 || byteSize > 9) return null;
  if (lower > maxRank) return null;

  const rule = SCALAR_CLASSES[byteSize - 2];
  const minimum = BigInt(Math.max(1, lower));
  const maximum = BigInt(maxRank);
  let best = byteSize === 2 && lower === 0 ? 0n : null;

  for (const interval of rule.intervals) {
    budget?.spendWork();
    let coefficient = (minimum + interval.power - 1n) / interval.power;
    if (coefficient < interval.minCoefficient) coefficient = interval.minCoefficient;
    if (coefficient % 10n === 0n) coefficient += 1n;
    if (coefficient > interval.maxCoefficient) continue;

    const candidate = coefficient * interval.power;
    if (candidate > maximum) continue;
    if (best === null || candidate < best) best = candidate;
  }

  return best === null ? null : Number(best);
}

function compareIds(left, right, budget) {
  if (budget) {
    budget.spendWork(Math.max(1, Math.ceil((left.length + right.length) / STRING_WORK_CHUNK)));
  }
  return left.localeCompare(right);
}

function compareOrder(left, right, budget) {
  if (left.position < right.position) return -1;
  if (left.position > right.position) return 1;
  return compareIds(left.id, right.id, budget);
}

function localReserve(budget, bytes, current) {
  if (bytes === 0) return current;
  budget.reserveMemory(bytes);
  return current + bytes;
}

function localRelease(budget, bytes, current) {
  if (bytes === 0) return current;
  budget.releaseMemory(bytes);
  return current - bytes;
}

function outputBytesFor(length) {
  const bytes = OBJECT_ACCOUNTING_BYTES * 2 + SLOT_ACCOUNTING_BYTES * (length + 2);
  if (!Number.isSafeInteger(bytes)) throw new OrderCalculationUnavailableError('memory');
  return bytes;
}

function outputResult(budget, positions) {
  Object.freeze(positions);
  const result = Object.freeze({ kind: 'feasible', positions });
  const state = stateFor(budget);
  state.preaccountedObjects.add(positions);
  state.preaccountedObjects.add(result);
  return result;
}

function checkBaselineWithoutTarget(rows, targetIndex, budget) {
  let previous = null;
  for (let index = 0; index < rows.length; index += 1) {
    budget.spendWork();
    if (index === targetIndex) continue;
    const current = rows[index];
    if (previous && compareOrder(previous, current, budget) > 0) return false;
    previous = current;
  }
  return true;
}

function tryExactGap(rows, targetIndex, options, budget) {
  if (!checkBaselineWithoutTarget(rows, targetIndex, budget)) return null;

  const target = rows[targetIndex];
  const previous = targetIndex > 0 ? rows[targetIndex - 1] : null;
  const next = targetIndex + 1 < rows.length ? rows[targetIndex + 1] : null;
  let lower = 0;
  let upper = options.maxRank;
  if (previous) {
    lower = previous.position + Number(compareIds(previous.id, target.id, budget) >= 0);
  }
  if (next) {
    upper = next.position - Number(compareIds(target.id, next.id, budget) >= 0);
  }
  lower = Math.max(0, lower);
  upper = Math.min(options.maxRank, upper);
  if (lower > upper) return null;

  if (target.position >= lower && target.position <= upper
    && target.unchangedBytes <= options.maxItemBytes
    && target.unchangedBytes <= options.maxBytes
    && options.maxActions >= 1) {
    budget.spendWork(rows.length * 2 + 1);
    budget.reserveMemory(outputBytesFor(rows.length));
    const positions = new Array(rows.length);
    for (let index = 0; index < rows.length; index += 1) positions[index] = rows[index].position;
    return outputResult(budget, positions);
  }

  if (!target.canChange) return null;
  for (const rule of SCALAR_CLASSES) {
    budget.spendWork();
    const itemBytes = target.changedBaseBytes + rule.byteSize;
    if (itemBytes > options.maxItemBytes || itemBytes > options.maxBytes || options.maxActions < 1) continue;
    let position = firstIntegerInByteClass(lower, rule.byteSize, upper, budget);
    if (position === target.position) {
      position = firstIntegerInByteClass(position + 1, rule.byteSize, upper, budget);
    }
    if (position === null) continue;

    budget.spendWork(rows.length * 2 + 1);
    budget.reserveMemory(outputBytesFor(rows.length));
    const positions = new Array(rows.length);
    for (let index = 0; index < rows.length; index += 1) positions[index] = rows[index].position;
    positions[targetIndex] = position;
    return outputResult(budget, positions);
  }
  return null;
}

function checkedAddition(left, right, limit) {
  if (right > limit || left > limit - right) return null;
  return left + right;
}

function buildWitness(rows, node, completedIndex, budget) {
  const length = rows.length;
  // Charge the bounded scan/reconstruction as a batch before allocating its output.
  budget.spendWork(length * 2 + completedIndex + 2);
  budget.reserveMemory(outputBytesFor(length));
  const positions = new Array(length);
  for (let index = completedIndex + 1; index < length; index += 1) {
    positions[index] = rows[index].position;
  }
  let cursor = completedIndex;
  while (cursor >= 0) {
    positions[cursor] = node.position;
    node = node.parent;
    cursor -= 1;
  }
  return outputResult(budget, positions);
}

function runFrontier(rows, targetIndex, options, budget) {
  let localBytes = 0;
  let nodes = null;
  let frontier = null;
  let frontierBytes = 0;
  let retainedNodesBytes = 0;
  let suffixSorted = null;
  let suffixBytes = 0;

  const reserve = (bytes) => {
    localBytes = localReserve(budget, bytes, localBytes);
  };
  const release = (bytes) => {
    localBytes = localRelease(budget, bytes, localBytes);
  };

  try {
    const nodeListBase = OBJECT_ACCOUNTING_BYTES;
    budget.spendWork(2);
    reserve(nodeListBase);
    retainedNodesBytes = nodeListBase;
    nodes = [];
    reserve(OBJECT_ACCOUNTING_BYTES + SLOT_ACCOUNTING_BYTES);
    const initial = { position: null, actions: 0, bytes: 0, parent: null };
    nodes.push(initial);
    retainedNodesBytes += OBJECT_ACCOUNTING_BYTES + SLOT_ACCOUNTING_BYTES;
    reserve(OBJECT_ACCOUNTING_BYTES + SLOT_ACCOUNTING_BYTES);
    frontier = [initial];
    frontierBytes = OBJECT_ACCOUNTING_BYTES + SLOT_ACCOUNTING_BYTES;

    budget.spendWork(rows.length);
    reserve(OBJECT_ACCOUNTING_BYTES + rows.length * SLOT_ACCOUNTING_BYTES);
    suffixBytes = OBJECT_ACCOUNTING_BYTES + rows.length * SLOT_ACCOUNTING_BYTES;
    suffixSorted = new Array(rows.length).fill(true);
    for (let index = rows.length - 2; index >= 0; index -= 1) {
      budget.spendWork();
      suffixSorted[index] = suffixSorted[index + 1]
        && compareOrder(rows[index], rows[index + 1], budget) <= 0;
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const previousRow = index > 0 ? rows[index - 1] : null;
      const lowerOffset = previousRow
        ? Number(compareIds(previousRow.id, row.id, budget) >= 0)
        : 0;

      budget.spendWork();
      reserve(OBJECT_ACCOUNTING_BYTES);
      let out = [];
      let outBytes = OBJECT_ACCOUNTING_BYTES;
      const emit = (parent, position, actions, bytes) => {
        budget.spendWork();
        if (actions > options.maxActions || bytes > options.maxBytes) return;

        const allocation = OBJECT_ACCOUNTING_BYTES + SLOT_ACCOUNTING_BYTES;
        reserve(allocation);
        const node = { position, actions, bytes, parent };
        out.push(node);
        outBytes += SLOT_ACCOUNTING_BYTES;
      };

      for (const state of frontier) {
        budget.spendWork();
        const lower = previousRow ? state.position + lowerOffset : 0;
        if (row.position >= lower && row.position <= options.maxRank) {
          if (row.id !== options.targetId
            || row.unchangedBytes <= options.maxItemBytes) {
            const isTarget = row.id === options.targetId;
            const actions = state.actions + Number(isTarget);
            const bytes = state.bytes + (isTarget ? row.unchangedBytes : 0);
            emit(state, row.position, actions, bytes);
          }
        }

        if (!row.canChange) continue;
        for (const rule of SCALAR_CLASSES) {
          budget.spendWork();
          const itemBytes = row.changedBaseBytes + rule.byteSize;
          if (itemBytes > options.maxItemBytes) continue;
          const actions = checkedAddition(state.actions, 1, options.maxActions);
          const bytes = checkedAddition(state.bytes, itemBytes, options.maxBytes);
          if (actions === null || bytes === null) continue;

          let position = firstIntegerInByteClass(lower, rule.byteSize, options.maxRank, budget);
          if (position === row.position) {
            position = firstIntegerInByteClass(position + 1, rule.byteSize, options.maxRank, budget);
          }
          if (position === null) continue;
          emit(state, position, actions, bytes);
        }
      }

      // Charge native sort scratch and comparator work before/while sorting.
      reserve(out.length * SLOT_ACCOUNTING_BYTES);
      const sortScratchBytes = out.length * SLOT_ACCOUNTING_BYTES;
      budget.spendWork();
      out.sort((left, right) => {
        budget.spendWork();
        if (left.position !== right.position) return left.position < right.position ? -1 : 1;
        if (left.actions !== right.actions) return left.actions - right.actions;
        return left.bytes - right.bytes;
      });

      const dominanceSlots = Math.min(options.maxActions, rows.length) + 1;
      const dominanceBytes = OBJECT_ACCOUNTING_BYTES + dominanceSlots * SLOT_ACCOUNTING_BYTES;
      budget.spendWork(dominanceSlots + 2);
      reserve(dominanceBytes + OBJECT_ACCOUNTING_BYTES);
      const minimumBytes = new Array(dominanceSlots).fill(Infinity);
      let next = [];
      let nextBytes = OBJECT_ACCOUNTING_BYTES;
      for (const candidate of out) {
        let dominated = false;
        for (let actions = 0; actions <= candidate.actions; actions += 1) {
          budget.spendWork();
          if (minimumBytes[actions] <= candidate.bytes) {
            dominated = true;
            break;
          }
        }
        if (dominated) continue;

        minimumBytes[candidate.actions] = Math.min(
          minimumBytes[candidate.actions], candidate.bytes,
        );
        reserve(SLOT_ACCOUNTING_BYTES * 2);
        nodes.push(candidate);
        next.push(candidate);
        retainedNodesBytes += OBJECT_ACCOUNTING_BYTES + SLOT_ACCOUNTING_BYTES;
        nextBytes += SLOT_ACCOUNTING_BYTES;
      }
      budget.spendWork(next.length);
      const discardedObjectBytes = (out.length - next.length) * OBJECT_ACCOUNTING_BYTES;

      // The nodes list owns every parent/backpointer until this search ends.
      // The arrays for prior frontiers and generated candidates are temporary.
      const oldFrontierBytes = frontierBytes;
      frontier = null;
      out.length = 0;
      out = null;
      release(oldFrontierBytes);
      release(outBytes + sortScratchBytes + dominanceBytes + discardedObjectBytes);
      frontier = next;
      frontierBytes = nextBytes;

      if (frontier.length === 0) return null;

      if (index >= targetIndex && index + 1 < rows.length && suffixSorted[index + 1]) {
        const nextRow = rows[index + 1];
        for (const state of frontier) {
          budget.spendWork();
          if (state.position < nextRow.position
            || (state.position === nextRow.position
              && compareIds(row.id, nextRow.id, budget) <= 0)) {
            return buildWitness(rows, state, index, budget);
          }
        }
      }
    }

    const witness = frontier[0];
    return buildWitness(rows, witness, rows.length - 1, budget);
  } finally {
    if (suffixBytes > 0) release(suffixBytes);
    if (frontierBytes > 0) release(frontierBytes);
    if (retainedNodesBytes > 0) release(retainedNodesBytes);
    if (localBytes > 0) release(localBytes);
  }
}

/**
 * Find any physically feasible integer ordering for rows already arranged in
 * the requested order. The caller owns whole-command ordinal alternatives.
 */
export function solveIntegerOrder(rows, {
  targetId,
  maxRank,
  maxActions,
  maxBytes,
  maxItemBytes,
}, sharedBudget) {
  const budget = sharedBudget ?? createOrderCalculationBudget();

  try {
    if (!Array.isArray(rows) || typeof targetId !== 'string'
      || !Number.isSafeInteger(maxRank) || maxRank < 0
      || !Number.isSafeInteger(maxActions) || maxActions < 0
      || !Number.isSafeInteger(maxBytes) || maxBytes < 0
      || !Number.isSafeInteger(maxItemBytes) || maxItemBytes < 0) {
      throw new TypeError('Invalid integer-order solver input');
    }

    budget.spendWork(rows.length);
    budget.spendWork(Math.max(1, Math.ceil(targetId.length / STRING_WORK_CHUNK)));
    let targetIndex = -1;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row || typeof row.id !== 'string'
        || !Number.isSafeInteger(row.position) || row.position < 0 || row.position > maxRank
        || !Number.isSafeInteger(row.unchangedBytes) || row.unchangedBytes < 0
        || !Number.isSafeInteger(row.changedBaseBytes) || row.changedBaseBytes < 0
        || typeof row.canChange !== 'boolean') {
        throw new TypeError('Invalid integer-order row');
      }
      budget.spendWork(Math.max(1, Math.ceil(row.id.length / STRING_WORK_CHUNK)));
      if (row.id === targetId) {
        if (targetIndex !== -1) throw new TypeError('The target row must be unique');
        targetIndex = index;
      }
    }
    if (targetIndex === -1) throw new TypeError('The target row is missing');
    if (maxActions < 1) return IMPOSSIBLE;

    const exactGap = tryExactGap(rows, targetIndex, {
      maxRank, maxActions, maxBytes, maxItemBytes,
    }, budget);
    if (exactGap) return exactGap;

    const result = runFrontier(rows, targetIndex, {
      targetId, maxRank, maxActions, maxBytes, maxItemBytes,
    }, budget);
    if (!result) return IMPOSSIBLE;
    return result;
  } catch (error) {
    if (error instanceof OrderCalculationUnavailableError) return UNAVAILABLE;
    throw error;
  }
}

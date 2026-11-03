const STRING_WORK_CHUNK = 64;

function spendWork(budget, count = 1) {
  if (budget === undefined || budget === null) return;
  if (typeof budget.spendWork !== 'function') throw new TypeError('budget must expose spendWork');
  budget.spendWork(count);
}

function chargeStringWork(value, budget) {
  spendWork(budget, Math.max(1, Math.ceil(value.length / STRING_WORK_CHUNK)));
}

function utf8Bytes(value, budget) {
  chargeStringWork(value, budget);
  return Buffer.byteLength(value, 'utf8');
}

function significantDigitCount(value, budget) {
  const coefficient = String(value).toLowerCase().split('e')[0];
  chargeStringWork(coefficient, budget);
  const digits = coefficient.replace(/[^0-9]/g, '').replace(/^0+/, '').replace(/0+$/, '');
  return digits.length || 1;
}

// DynamoDB documents this numeric representation as approximate. The model
// counts significant decimal digits and its one-byte overhead, not wire text.
export function dynamoDbNumberSize(value, name = '', { budget } = {}) {
  if (typeof name !== 'string') throw new TypeError('DynamoDB attribute name must be a string');
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('DynamoDB numbers must be finite');
  }
  if (typeof value !== 'number' && typeof value !== 'bigint') {
    throw new TypeError('DynamoDB number must be a number or bigint');
  }
  const nameBytes = utf8Bytes(name, budget);
  return nameBytes + 1 + Math.ceil(significantDigitCount(value, budget) / 2);
}

function binarySize(value) {
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
  return null;
}

function setMemberKind(value) {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number' || typeof value === 'bigint') return 'number';
  if (binarySize(value) !== null) return 'binary';
  return null;
}

function setMemberSize(value, kind, budget) {
  if (kind === 'string' && typeof value === 'string') return utf8Bytes(value, budget);
  if (kind === 'number' && (typeof value === 'number' || typeof value === 'bigint')) {
    return dynamoDbNumberSize(value, '', { budget });
  }
  if (kind === 'binary') {
    const size = binarySize(value);
    if (size !== null) return size;
  }
  throw new TypeError('DynamoDB sets must contain values of one supported scalar type');
}

function valueSize(value, name, ancestors, budget) {
  spendWork(budget);
  if (typeof value === 'number' || typeof value === 'bigint') {
    return dynamoDbNumberSize(value, name, { budget });
  }
  const nameBytes = utf8Bytes(name, budget);
  if (value === undefined || typeof value === 'function') return 0;
  if (typeof value === 'string') return nameBytes + utf8Bytes(value, budget);
  if (typeof value === 'boolean' || value === null) return nameBytes + 1;

  const binaryBytes = binarySize(value);
  if (binaryBytes !== null) return nameBytes + binaryBytes;

  if (ancestors.has(value)) throw new TypeError('DynamoDB items cannot contain circular values');
  ancestors.add(value);
  try {
    if (value instanceof Set) {
      let kind = null;
      let members = 0;
      let size = nameBytes;
      for (const member of value) {
        spendWork(budget);
        if (member === undefined || typeof member === 'function') continue;
        if (kind === null) {
          kind = setMemberKind(member);
          if (!kind) throw new TypeError('DynamoDB sets must contain supported scalar values');
        }
        size += setMemberSize(member, kind, budget);
        members += 1;
      }
      if (members === 0) throw new TypeError('DynamoDB sets cannot be empty');
      return size;
    }

    if (Array.isArray(value)) {
      let size = nameBytes + 3;
      for (let index = 0; index < value.length; index += 1) {
        spendWork(budget);
        if (!(index in value)) continue;
        const item = value[index];
        const itemSize = valueSize(item, '', ancestors, budget);
        if (item !== undefined && typeof item !== 'function') size += 1 + itemSize;
      }
      return size;
    }

    if (value instanceof Map) {
      let size = nameBytes + 3;
      for (const [key, item] of value) {
        spendWork(budget);
        if (typeof key !== 'string') throw new TypeError('DynamoDB map keys must be strings');
        const itemSize = valueSize(item, key, ancestors, budget);
        if (item !== undefined && typeof item !== 'function') size += 1 + itemSize;
      }
      return size;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('unsupported DynamoDB value');
    }
    let size = nameBytes + 3;
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue;
      const item = value[key];
      const itemSize = valueSize(item, key, ancestors, budget);
      if (item !== undefined && typeof item !== 'function') size += 1 + itemSize;
    }
    return size;
  } finally {
    ancestors.delete(value);
  }
}

export function dynamoDbItemSize(item, { budget } = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new TypeError('DynamoDB item must be an object');
  }
  const prototype = Object.getPrototypeOf(item);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('DynamoDB item must be a plain object');
  let size = 0;
  for (const name in item) {
    if (!Object.hasOwn(item, name)) continue;
    size += valueSize(item[name], name, new Set(), budget);
  }
  return size;
}

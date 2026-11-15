const CREATOR_STATE_SYSTEM_FIELDS = ['version', 'hidden', 'published', 'updatedAt', 'photo'];

function utf8Bytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

function significantDigitCount(value) {
  const coefficient = String(value).toLowerCase().split('e')[0];
  const digits = coefficient.replace(/[^0-9]/g, '').replace(/^0+/, '').replace(/0+$/, '');
  return digits.length || 1;
}

// DynamoDB documents this numeric representation as approximate. The model
// counts significant decimal digits and its one-byte overhead, not wire text.
function dynamoDbNumberSize(value, name = '') {
  if (typeof name !== 'string') throw new TypeError('DynamoDB attribute name must be a string');
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('DynamoDB numbers must be finite');
  }
  if (typeof value !== 'number' && typeof value !== 'bigint') {
    throw new TypeError('DynamoDB number must be a number or bigint');
  }
  const nameBytes = utf8Bytes(name);
  return nameBytes + 1 + Math.ceil(significantDigitCount(value) / 2);
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

function setMemberSize(value, kind) {
  if (kind === 'string' && typeof value === 'string') return utf8Bytes(value);
  if (kind === 'number' && (typeof value === 'number' || typeof value === 'bigint')) {
    return dynamoDbNumberSize(value, '');
  }
  if (kind === 'binary') {
    const size = binarySize(value);
    if (size !== null) return size;
  }
  throw new TypeError('DynamoDB sets must contain values of one supported scalar type');
}

function valueSize(value, name, ancestors) {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return dynamoDbNumberSize(value, name);
  }
  const nameBytes = utf8Bytes(name);
  if (value === undefined || typeof value === 'function') return 0;
  if (typeof value === 'string') return nameBytes + utf8Bytes(value);
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
        if (member === undefined || typeof member === 'function') continue;
        if (kind === null) {
          kind = setMemberKind(member);
          if (!kind) throw new TypeError('DynamoDB sets must contain supported scalar values');
        }
        size += setMemberSize(member, kind);
        members += 1;
      }
      if (members === 0) throw new TypeError('DynamoDB sets cannot be empty');
      return size;
    }

    if (Array.isArray(value)) {
      let size = nameBytes + 3;
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) continue;
        const item = value[index];
        const itemSize = valueSize(item, '', ancestors);
        if (item !== undefined && typeof item !== 'function') size += 1 + itemSize;
      }
      return size;
    }

    if (value instanceof Map) {
      let size = nameBytes + 3;
      for (const [key, item] of value) {
        if (typeof key !== 'string') throw new TypeError('DynamoDB map keys must be strings');
        const itemSize = valueSize(item, key, ancestors);
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
      const itemSize = valueSize(item, key, ancestors);
      if (item !== undefined && typeof item !== 'function') size += 1 + itemSize;
    }
    return size;
  } finally {
    ancestors.delete(value);
  }
}

export function dynamoDbItemSize(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new TypeError('DynamoDB item must be an object');
  }
  const prototype = Object.getPrototypeOf(item);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('DynamoDB item must be a plain object');
  let size = 0;
  for (const name in item) {
    if (!Object.hasOwn(item, name)) continue;
    size += valueSize(item[name], name, new Set());
  }
  return size;
}

/**
 * Measure a logical flat creator-state candidate as its exact META physical
 * image and as content after removing only the approved bounded root fields.
 * Physical keys count in both measurements.
 */
export function dynamoDbCreatorStateSizes(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || typeof state.id !== 'string' || !state.id) {
    throw new TypeError('creator state must have an ID before physical sizing');
  }
  const image = { ...state, pk: `PROFILE#${state.id}`, sk: 'META' };
  const content = { ...image };
  for (const field of CREATOR_STATE_SYSTEM_FIELDS) delete content[field];
  return {
    itemBytes: dynamoDbItemSize(image),
    contentBytes: dynamoDbItemSize(content),
  };
}

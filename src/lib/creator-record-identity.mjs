function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePhysicalKey(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} is required`);
  }
  return value;
}

function requireVersionIfPresent(row) {
  if (Object.hasOwn(row, 'version')
    && (!Number.isSafeInteger(row.version) || row.version < 0)) {
    throw new TypeError('creator record revision is malformed');
  }
}

function profileIdFromPartition(pk) {
  if (!pk.startsWith('PROFILE#') || pk.length === 'PROFILE#'.length) {
    throw new TypeError('creator record profile partition is malformed');
  }
  return pk.slice('PROFILE#'.length);
}

function suffixFromSortKey(sk, prefix, label) {
  if (!sk.startsWith(prefix) || sk.length === prefix.length) {
    throw new TypeError(`creator record ${label} key is malformed`);
  }
  return sk.slice(prefix.length);
}

/**
 * Validate the physical identity of a selected creator row before its key is
 * removed from the logical value. Payload associations such as claim
 * profileId are intentionally not part of this predicate; callers must
 * authorize those relationships separately.
 *
 * @returns {{ type: string, pk: string, sk: string, id?: string, profileId?: string, resourceId?: string }}
 */
export function assertCreatorRecordIdentity(row, { type, pk, sk } = {}) {
  if (!isRecord(row)) throw new TypeError('creator record is malformed');
  const expectedPk = requirePhysicalKey(pk, 'creator record partition key');
  const expectedSk = requirePhysicalKey(sk, 'creator record sort key');
  if (row.pk !== expectedPk || row.sk !== expectedSk) {
    throw new TypeError('creator record physical identity is inconsistent');
  }

  if (type === 'editor') {
    const profileId = profileIdFromPartition(expectedPk);
    const resourceId = suffixFromSortKey(expectedSk, 'EDITOR#', 'editor reference');
    if (row.recordType !== 'editorReference' || row.profileId !== profileId
      || row.resourceId !== resourceId || !isCatalogResourceIdWithinLimit(resourceId)) {
      throw new TypeError('editor reference identity is inconsistent');
    }
    requireVersionIfPresent(row);
    return { type, pk: expectedPk, sk: expectedSk, profileId, resourceId };
  }

  if (type === 'claimRef') {
    const profileId = profileIdFromPartition(expectedPk);
    const id = suffixFromSortKey(expectedSk, 'CLAIM#', 'claim reference');
    // Claim references deliberately have no discriminator. A discriminator
    // belongs to the administrative claim row and is not a reference shape.
    if (Object.hasOwn(row, 'recordType') || row.id !== id) {
      throw new TypeError('claim reference identity is inconsistent');
    }
    requireVersionIfPresent(row);
    return { type, pk: expectedPk, sk: expectedSk, profileId, id };
  }

  if (type === 'claim') {
    if (expectedPk !== 'ADMIN#CLAIMS') throw new TypeError('claim partition key is malformed');
    const id = suffixFromSortKey(expectedSk, 'CLAIM#', 'claim');
    if (row.recordType !== 'claim' || row.id !== id) {
      throw new TypeError('claim identity is inconsistent');
    }
    requireVersionIfPresent(row);
    return { type, pk: expectedPk, sk: expectedSk, id };
  }

  throw new TypeError(`unsupported creator record identity type: ${type}`);
}
import { isCatalogResourceIdWithinLimit } from './catalog-identity.mjs';


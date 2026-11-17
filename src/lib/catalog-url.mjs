import { createHash } from 'node:crypto';
import { isCatalogResourceIdWithinLimit } from './catalog-identity.mjs';

/** Hash the exact URL string as UTF-8; queries and trailing slashes are identity. */
export function currentUrlHash(url) {
  if (typeof url !== 'string') {
    throw new TypeError('Current catalog URL must be a string');
  }
  return createHash('sha256').update(url, 'utf8').digest('hex');
}

export function currentUrlKey(url) {
  return `url:${currentUrlHash(url)}`;
}

export function currentUrlReservationId(url) {
  return `__url#${currentUrlHash(url)}`;
}

export function currentUrlReservation(url, resourceId) {
  if (!isCatalogReservationMemberId(resourceId)) {
    throw new TypeError('Current URL reservation requires a valid resource ID of at most 256 UTF-8 bytes');
  }
  return {
    id: currentUrlReservationId(url),
    recordType: 'urlReservation',
    url,
    status: 'reserved',
    resourceId,
    version: 1,
  };
}

export function currentUrlCollision(url, resourceIds) {
  if (!Array.isArray(resourceIds) || resourceIds.length < 2) {
    throw new TypeError('Current URL collision requires at least two resource IDs');
  }
  if (resourceIds.some((id) => !isCatalogReservationMemberId(id))) {
    throw new TypeError('Current URL collision requires valid resource IDs of at most 256 UTF-8 bytes');
  }
  const members = [...new Set(resourceIds)].sort();
  if (members.length < 2) {
    throw new TypeError('Current URL collision requires at least two distinct resource IDs');
  }
  return {
    id: currentUrlReservationId(url),
    recordType: 'urlReservation',
    url,
    status: 'collision',
    resourceIds: members,
    version: 1,
  };
}

/**
 * Decode the current reservation shape shared by catalog writers.
 *
 * The caller supplies the URL whose deterministic reservation key was read.
 * This keeps the physical key and literal URL checks at the boundary instead
 * of allowing a projected row to be interpreted under a reconstructed key.
 */
export function decodeCurrentUrlReservation(item, requestedUrl) {
  if (!isRecord(item)) {
    throw new Error('Catalog URL reservation is malformed');
  }
  const expectedId = currentUrlReservationId(requestedUrl);
  if (item.id !== expectedId || item.recordType !== 'urlReservation'
      || item.url !== requestedUrl || item.version !== 1) {
    throw new Error(`Catalog URL reservation is inconsistent with its key for ${requestedUrl}`);
  }

  const hasResourceId = Object.hasOwn(item, 'resourceId');
  const hasResourceIds = Object.hasOwn(item, 'resourceIds');
  if (item.status === 'reserved' && hasResourceId && !hasResourceIds
      && isCatalogReservationMemberId(item.resourceId)) {
    return { status: 'reserved', resourceIds: [item.resourceId] };
  }
  if (item.status === 'collision' && hasResourceIds && !hasResourceId) {
    const resourceIds = item.resourceIds;
    if (!Array.isArray(resourceIds) || resourceIds.length < 2
        || resourceIds.some((id) => !isCatalogReservationMemberId(id))
        || new Set(resourceIds).size !== resourceIds.length) {
      throw new Error(`Malformed catalog URL collision for ${requestedUrl}`);
    }
    return { status: 'collision', resourceIds: [...resourceIds] };
  }
  throw new Error(`Malformed catalog URL reservation for ${requestedUrl}`);
}

function isCatalogReservationMemberId(id) {
  return isCatalogResourceIdWithinLimit(id) && !id.startsWith('__');
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

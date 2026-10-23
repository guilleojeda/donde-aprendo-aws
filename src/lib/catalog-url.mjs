import { createHash } from 'node:crypto';

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
  if (typeof resourceId !== 'string' || resourceId.length === 0) {
    throw new TypeError('Current URL reservation requires a resource ID');
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
  if (!Array.isArray(resourceIds) || resourceIds.length < 2
      || resourceIds.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new TypeError('Current URL collision requires at least two resource IDs');
  }
  return {
    id: currentUrlReservationId(url),
    recordType: 'urlReservation',
    url,
    status: 'collision',
    resourceIds: [...new Set(resourceIds)].sort(),
    version: 1,
  };
}

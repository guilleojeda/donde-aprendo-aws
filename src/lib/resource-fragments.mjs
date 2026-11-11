const RESOURCE_FRAGMENT_PREFIX = '#resource-';

export function resourceFragment(id) {
  return `${RESOURCE_FRAGMENT_PREFIX}${encodeURIComponent(id).replaceAll('%3A', ':')}`;
}

function hasIdentity(identities, id) {
  if (typeof identities?.has === 'function') return identities.has(id);
  return identities !== null && typeof identities === 'object' && Object.hasOwn(identities, id);
}

export function resolveResourceFragment(fragment, identities) {
  if (typeof fragment !== 'string' || !fragment.startsWith(RESOURCE_FRAGMENT_PREFIX)) return undefined;

  const serializedId = fragment.slice(RESOURCE_FRAGMENT_PREFIX.length);
  let decodedId;
  try {
    decodedId = decodeURIComponent(serializedId);
  } catch {
    return hasIdentity(identities, serializedId) ? serializedId : undefined;
  }

  if (hasIdentity(identities, decodedId)) return decodedId;
  return hasIdentity(identities, serializedId) ? serializedId : undefined;
}

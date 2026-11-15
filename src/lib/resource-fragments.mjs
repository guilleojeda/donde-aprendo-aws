const RESOURCE_FRAGMENT_PREFIX = '#resource-';

export function resourceFragment(id) {
  const serializedId = encodeURIComponent(id).replaceAll('%3A', ':');
  // Leave the trailing colon available to match overlapping browser directives.
  return `${RESOURCE_FRAGMENT_PREFIX}${serializedId.replace(/:~(?=:)/gu, ':%7E')}`;
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

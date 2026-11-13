/** Parse a configured HTTPS origin and return its native, canonical URL. */
export function parseHttpsOrigin(value, name = 'origin') {
  let parsed;
  const candidate = typeof value === 'string' ? value.trim() : '';
  try {
    if (typeof value !== 'string') throw new TypeError('value must be a string');
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${name} must be an absolute URL`);
  }
  const authority = candidate.match(/^https:\/\/([^/?#]*)/iu)?.[1];
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || authority?.includes('@')
    || parsed.pathname !== '/' || parsed.search || parsed.hash || candidate.includes('?') || candidate.includes('#')) {
    throw new TypeError(`${name} must be an HTTPS origin`);
  }
  return parsed;
}

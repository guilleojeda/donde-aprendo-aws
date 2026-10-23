const PRODUCTION_ORIGIN = 'https://dondeaprendoaws.com';

function parseHttpsOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('ACCOUNT_ORIGIN must be an absolute URL');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new TypeError('ACCOUNT_ORIGIN must be an HTTPS origin');
  }
  return parsed;
}

export function configuredAccountOrigin(value = process.env.ACCOUNT_ORIGIN) {
  const configured = value === undefined ? PRODUCTION_ORIGIN : value.trim();
  return parseHttpsOrigin(configured).origin;
}

export function allowedAmplifyDomainsForOrigin(origin) {
  const parsed = parseHttpsOrigin(origin);
  const domain = { protocol: 'https', hostname: parsed.hostname };
  // Astro treats an omitted port as any port. Preserve an explicitly
  // configured preview port; implicit HTTPS 443 is represented as no port.
  if (parsed.port) domain.port = parsed.port;
  return [domain];
}

export const allowedAmplifyDomains = allowedAmplifyDomainsForOrigin(configuredAccountOrigin());

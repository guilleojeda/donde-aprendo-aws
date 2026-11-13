import { parseHttpsOrigin } from './account-origin.mjs';

const PRODUCTION_ORIGIN = 'https://dondeaprendoaws.com';

export function isPrivatePath(pathname) {
  return ['/cuenta', '/api/creador', '/api/admin']
    .some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function configuredAccountOrigin(value = process.env.ACCOUNT_ORIGIN) {
  const configured = value === undefined ? PRODUCTION_ORIGIN : value.trim();
  return parseHttpsOrigin(configured, 'ACCOUNT_ORIGIN').origin;
}

export function allowedAmplifyDomainsForOrigin(origin) {
  const parsed = parseHttpsOrigin(origin, 'ACCOUNT_ORIGIN');
  const domain = { protocol: 'https', hostname: parsed.hostname };
  // Astro treats an omitted port as any port. Preserve an explicitly
  // configured preview port; implicit HTTPS 443 is represented as no port.
  if (parsed.port) domain.port = parsed.port;
  return [domain];
}

export const allowedAmplifyDomains = allowedAmplifyDomainsForOrigin(configuredAccountOrigin());

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  customFetch,
  discovery,
  enableNonRepudiationChecks,
  None,
  randomPKCECodeVerifier,
} from 'openid-client';

const LOGIN_ATTEMPT_MS = 10 * 60 * 1000;
const OIDC_CLOCK_TOLERANCE_SECONDS = 30;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = 'da_session';
const BROWSER_COOKIE = 'da_oauth';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LOGOUT_RETRY_CSRF = Symbol.for('donde-aprendo-aws.logout-retry-csrf');
const ROUTES = new Set([
  '/cuenta/ingresar/',
  '/cuenta/registro/',
  '/cuenta/recuperar/',
  '/cuenta/callback/',
  '/cuenta/salir/',
]);

class OidcUnavailableError extends Error {}

// Carries an already validated CSRF token to the Astro route without putting
// it in an HTTP header, body, URL, or another persisted location.
export function readLogoutRetryCsrf(response) {
  return response?.[LOGOUT_RETRY_CSRF];
}

function opaqueToken() {
  return randomBytes(32).toString('base64url');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('base64url');
}

function privateHeaders(extra = {}) {
  return new Headers({
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    ...extra,
  });
}

function redirect(location, cookies = []) {
  const headers = privateHeaders({ location });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(null, { status: 303, headers });
}

function clearCookie(name) {
  return `${name}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function sessionCookie(value, expiresAt) {
  return `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_MS / 1000}; Expires=${new Date(expiresAt).toUTCString()}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function browserCookie(value) {
  return `${BROWSER_COOKIE}=${value}; Max-Age=${LOGIN_ATTEMPT_MS / 1000}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function cookieValue(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return TOKEN_PATTERN.test(value) ? value : undefined;
  }
  return undefined;
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function originValue(value, name) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError(`${name} must be an absolute URL`);
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new TypeError(`${name} must be an HTTPS origin`);
  }
  return parsed.origin;
}

function issuerValue(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('issuer must be an absolute URL');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError('issuer must be an HTTPS URL');
  }
  return parsed.href.replace(/\/$/, '');
}

function singleParameter(url, name) {
  const values = url.searchParams.getAll(name);
  return values.length === 1 && values[0] !== '' ? values[0] : undefined;
}

function validateIdentity(identity) {
  return identity && typeof identity.issuer === 'string' && identity.issuer.length > 0
    && typeof identity.sub === 'string' && identity.sub.length > 0
    && identity.sub.length <= 256;
}

function validateDiscovery(config, issuer, cognitoDomain) {
  const metadata = config.serverMetadata();
  const expectedEndpoints = [
    [metadata.authorization_endpoint, `${cognitoDomain}/oauth2/authorize`],
    [metadata.token_endpoint, `${cognitoDomain}/oauth2/token`],
    [metadata.jwks_uri, `${issuer}/.well-known/jwks.json`],
  ];
  for (const [actual, expected] of expectedEndpoints) {
    if (typeof actual !== 'string' || actual !== expected) {
      throw new OidcUnavailableError('OIDC endpoint configuration is unavailable');
    }
  }
}

function isUnavailableStatus(url, status) {
  const path = new URL(url).pathname;
  return path.includes('.well-known') || path.endsWith('/jwks.json')
    || status === 408 || status === 429 || status >= 500;
}

function isOidcUnavailable(error, seen = new Set()) {
  if (!error || seen.has(error)) return false;
  seen.add(error);
  if (error instanceof OidcUnavailableError) return true;
  const status = error.status ?? error.response?.status;
  if (status === 408 || status === 429 || status >= 500) return true;
  return isOidcUnavailable(error.cause, seen);
}

export function createAccountAuth({ origin, issuer, clientId, cognitoDomain, store, fetchOIDC, now = Date.now }) {
  const accountOrigin = originValue(origin, 'origin');
  const accountIssuer = issuerValue(issuer);
  const providerOrigin = originValue(cognitoDomain, 'cognitoDomain');
  if (typeof clientId !== 'string' || clientId.trim() === '') throw new TypeError('clientId is required');
  if (!store || typeof store.putLoginAttempt !== 'function' || typeof store.takeLoginAttempt !== 'function'
    || typeof store.ensureAccount !== 'function' || typeof store.getAccount !== 'function'
    || typeof store.putSession !== 'function' || typeof store.getSession !== 'function'
    || typeof store.deleteSession !== 'function') {
    throw new TypeError('store does not implement the account store contract');
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const transport = fetchOIDC ?? globalThis.fetch;
  if (typeof transport !== 'function') throw new TypeError('fetchOIDC must be a fetch function');
  let oidcConfiguration;

  function currentTime() {
    const value = now();
    if (!Number.isFinite(value) || value < 0) throw new TypeError('clock returned an invalid time');
    return Math.floor(value);
  }

  async function getOidcConfiguration() {
    if (!oidcConfiguration) {
      oidcConfiguration = discovery(
        new URL(accountIssuer),
        clientId,
        undefined,
        None(),
        {
          [customFetch]: async (input, init) => {
            const requestUrl = input instanceof Request ? input.url : String(input);
            let response;
            try {
              response = await transport(input, init);
            } catch {
              throw new OidcUnavailableError('OIDC request failed');
            }
            if (!response.ok && isUnavailableStatus(requestUrl, response.status)) {
              throw new OidcUnavailableError('OIDC provider is unavailable');
            }
            return response;
          },
          execute: [enableNonRepudiationChecks],
        },
      ).then((config) => {
        validateDiscovery(config, accountIssuer, providerOrigin);
        return config;
      }).catch((error) => {
        oidcConfiguration = undefined;
        throw error;
      });
    }
    return oidcConfiguration;
  }

  function failure(state) {
    return redirect(`${accountOrigin}/cuenta/?estado=${encodeURIComponent(state)}`);
  }

  function methodNotAllowed(allow) {
    return new Response(null, {
      status: 405,
      headers: privateHeaders({ allow }),
    });
  }

  async function beginAuthorization(request, page) {
    const current = currentTime();
    let binding = cookieValue(request, BROWSER_COOKIE);
    if (!binding) binding = opaqueToken();

    const config = await getOidcConfiguration();
    for (let retry = 0; retry < 3; retry += 1) {
      const state = opaqueToken();
      const nonce = opaqueToken();
      const codeVerifier = randomPKCECodeVerifier();
      const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
      const attempt = {
        state,
        nonce,
        codeVerifier,
        browserBindingHash: sha256(binding),
        expiresAt: current + LOGIN_ATTEMPT_MS,
      };
      if (!await store.putLoginAttempt(`ATTEMPT#${sha256(state)}`, attempt)) continue;

      const authorizeUrl = buildAuthorizationUrl(config, {
        redirect_uri: `${accountOrigin}/cuenta/callback/`,
        scope: 'openid email',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'login',
        lang: 'es',
      });
      authorizeUrl.pathname = page;
      return redirect(authorizeUrl.href, [browserCookie(binding)]);
    }
    throw new Error('could not create a unique login attempt');
  }

  async function resolveSession(request) {
    const rawSession = cookieValue(request, SESSION_COOKIE);
    if (!rawSession) return { state: 'anonymous' };

    const record = await store.getSession(`SESSION#${sha256(rawSession)}`);
    if (!record) return { state: 'anonymous' };
    const at = currentTime();
    if (!Number.isFinite(record.expiresAt) || at >= record.expiresAt) return { state: 'anonymous' };
    if (!validateIdentity(record.identity)) return { state: 'anonymous' };

    const account = await store.getAccount(record.identity);
    if (!account) return { state: 'anonymous' };
    if (account.active !== true) {
      // A disabled account cannot authorize requests, but its still-valid
      // session must retain enough server-only data for a confirmed logout to
      // revoke it before the cookie is cleared.
      return {
        state: 'disabled',
        csrfToken: record.csrfToken,
        sessionKey: `SESSION#${sha256(rawSession)}`,
      };
    }
    if (!Number.isSafeInteger(record.epoch) || record.epoch !== account.epoch
      || !Number.isFinite(record.createdAt) || record.createdAt <= (account.authValidAfter ?? 0)) {
      return { state: 'anonymous' };
    }
    if (typeof account.email !== 'string' || account.email.length === 0) return { state: 'anonymous' };
    return {
      state: 'authenticated',
      account: { email: account.email },
      accountId: sha256(JSON.stringify([record.identity.issuer, record.identity.sub])),
      isAdmin: account.isAdmin === true,
      csrfToken: record.csrfToken,
      expiresAt: record.expiresAt,
      record,
      sessionKey: `SESSION#${sha256(rawSession)}`,
    };
  }

  async function getSession(request) {
    try {
      const result = await resolveSession(request);
      if (result.state !== 'authenticated') return { state: result.state };
      return {
        state: 'authenticated',
        account: result.account,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt,
      };
    } catch {
      return { state: 'unavailable' };
    }
  }

  // Server-only authorization projection; the account page keeps getSession's
  // narrower contract and never serializes private ownership or permissions.
  async function getPrincipal(request) {
    try {
      const result = await resolveSession(request);
      if (result.state !== 'authenticated') return { state: result.state };
      return {
        state: 'authenticated',
        accountId: result.accountId,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt,
        isAdmin: result.isAdmin,
      };
    } catch {
      return { state: 'unavailable' };
    }
  }

  async function finishAuthorization(request) {
    const callbackUrl = new URL(request.url);
    const state = singleParameter(callbackUrl, 'state');
    if (!state || state.length > 512) return failure('acceso-invalido');

    let attempt;
    try {
      attempt = await store.takeLoginAttempt(`ATTEMPT#${sha256(state)}`);
    } catch {
      return failure('no-disponible');
    }
    const binding = cookieValue(request, BROWSER_COOKIE);
    if (!attempt || attempt.state !== state || !binding
      || !constantTimeEqual(attempt.browserBindingHash, sha256(binding))) {
      return failure('acceso-invalido');
    }
    if (!Number.isFinite(attempt.expiresAt) || currentTime() >= attempt.expiresAt) {
      return failure('acceso-invalido');
    }

    const providerErrors = callbackUrl.searchParams.getAll('error');
    const callbackCodes = callbackUrl.searchParams.getAll('code');
    if (providerErrors.length > 0) {
      if (providerErrors.length !== 1 || !providerErrors[0] || callbackCodes.length > 0) {
        return failure('acceso-invalido');
      }
      return failure(providerErrors[0] === 'access_denied' ? 'cancelado' : 'acceso-invalido');
    }
    const code = singleParameter(callbackUrl, 'code');
    if (!code || code.length > 4096) return failure('acceso-invalido');

    let claims;
    try {
      const config = await getOidcConfiguration();
      const tokens = await authorizationCodeGrant(config, callbackUrl, {
        expectedState: state,
        expectedNonce: attempt.nonce,
        pkceCodeVerifier: attempt.codeVerifier,
      });
      claims = tokens.claims();
    } catch (error) {
      return failure(isOidcUnavailable(error) ? 'no-disponible' : 'acceso-invalido');
    }

    const identity = { issuer: accountIssuer, sub: claims?.sub };
    const authTimeMs = typeof claims?.auth_time === 'number' && Number.isSafeInteger(claims.auth_time)
      ? claims.auth_time * 1000
      : NaN;
    if (claims?.iss !== accountIssuer || !validateIdentity(identity)
      || claims?.email_verified !== true || typeof claims.email !== 'string' || claims.email.length === 0
      || !Number.isSafeInteger(authTimeMs)) {
      return failure('acceso-invalido');
    }
    // prompt=login is browser-visible and can be changed. Bind the signed
    // authentication time to this server-side attempt, at OIDC second precision.
    const attemptStartedAt = Math.floor((attempt.expiresAt - LOGIN_ATTEMPT_MS) / 1000);
    if (claims.auth_time < attemptStartedAt
      || claims.auth_time > Math.floor(currentTime() / 1000) + OIDC_CLOCK_TOLERANCE_SECONDS) {
      return failure('acceso-invalido');
    }

    let account;
    try {
      account = await store.ensureAccount(identity, claims.email);
    } catch {
      return failure('no-disponible');
    }
    if (!account || account.active !== true) {
      return failure('acceso-invalido');
    }
    if (!Number.isSafeInteger(account.epoch) || account.epoch < 0
      || !Number.isFinite(account.authValidAfter) || account.authValidAfter < 0) {
      return failure('no-disponible');
    }
    if (authTimeMs <= account.authValidAfter) return failure('acceso-invalido');

    const createdAt = currentTime();
    const expiresAt = createdAt + SESSION_MS;
    const rawSession = opaqueToken();
    const session = {
      identity,
      epoch: account.epoch,
      createdAt,
      expiresAt,
      csrfToken: opaqueToken(),
    };
    let stored;
    try {
      stored = await store.putSession(`SESSION#${sha256(rawSession)}`, session);
    } catch {
      return failure('no-disponible');
    }
    if (!stored) return failure('no-disponible');
    return redirect(`${accountOrigin}/cuenta/`, [sessionCookie(rawSession, expiresAt)]);
  }

  function finishProviderLogout() {
    const logoutUrl = new URL('/logout', providerOrigin);
    logoutUrl.searchParams.set('client_id', clientId);
    logoutUrl.searchParams.set('logout_uri', `${accountOrigin}/cuenta/`);
    return redirect(logoutUrl.href, [clearCookie(SESSION_COOKIE)]);
  }

  async function logout(request) {
    if (request.headers.get('origin') !== accountOrigin) {
      return new Response(null, { status: 403, headers: privateHeaders() });
    }
    const rawSession = cookieValue(request, SESSION_COOKIE);
    if (!rawSession) return redirect(`${accountOrigin}/cuenta/`, [clearCookie(SESSION_COOKIE)]);

    let current;
    try {
      current = await resolveSession(request);
    } catch {
      return failure('no-disponible');
    }
    if (current.state === 'unavailable') return failure('no-disponible');
    if (current.state !== 'authenticated' && current.state !== 'disabled') {
      // A strongly consistent read can confirm a prior deletion even when its
      // acknowledgement was lost. The retry must still close the provider SSO.
      return finishProviderLogout();
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
      return new Response(null, { status: 400, headers: privateHeaders() });
    }
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > 8192) {
      return new Response(null, { status: 413, headers: privateHeaders() });
    }
    const body = await request.text();
    if (Buffer.byteLength(body) > 8192) return new Response(null, { status: 413, headers: privateHeaders() });
    const parameters = new URLSearchParams(body);
    const csrfValues = parameters.getAll('csrfToken');
    if (csrfValues.length !== 1 || !TOKEN_PATTERN.test(current.csrfToken)
      || !constantTimeEqual(csrfValues[0], current.csrfToken)) {
      return new Response(null, { status: 403, headers: privateHeaders() });
    }

    try {
      await store.deleteSession(current.sessionKey);
    } catch {
      const response = failure('no-disponible');
      Object.defineProperty(response, LOGOUT_RETRY_CSRF, { value: current.csrfToken });
      return response;
    }
    return finishProviderLogout();
  }

  async function handle(request) {
    if (!(request instanceof Request)) throw new TypeError('handle expects a Request');
    const url = new URL(request.url);
    if (!ROUTES.has(url.pathname)) return new Response(null, { status: 404, headers: privateHeaders() });

    if (url.pathname === '/cuenta/ingresar/' || url.pathname === '/cuenta/registro/' || url.pathname === '/cuenta/recuperar/') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const page = url.pathname === '/cuenta/registro/' ? '/signup'
        : url.pathname === '/cuenta/recuperar/' ? '/forgotPassword' : '/oauth2/authorize';
      try {
        return await beginAuthorization(request, page);
      } catch {
        return failure('no-disponible');
      }
    }
    if (url.pathname === '/cuenta/callback/') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      try {
        return await finishAuthorization(request);
      } catch {
        return failure('no-disponible');
      }
    }
    if (url.pathname === '/cuenta/salir/') {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      try {
        return await logout(request);
      } catch {
        return failure('no-disponible');
      }
    }
    return new Response(null, { status: 404, headers: privateHeaders() });
  }

  return { handle, getSession, getPrincipal };
}

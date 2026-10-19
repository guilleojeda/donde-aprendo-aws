import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

export const ORIGIN = 'https://dondeaprendoaws.com';
export const ISSUER = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_example';
export const CLIENT_ID = 'creator-pages-client';
export const COGNITO_DOMAIN = 'https://donde-aprendo.auth.us-east-1.amazoncognito.com';
export const ACCOUNT_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const ACCOUNT_SESSION_MS = ACCOUNT_COOKIE_MAX_AGE_SECONDS * 1000;
export const TEST_EMAIL = 'ana@example.invalid';
export const TEST_SUB = 'user-123';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const wrongSigningKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
export const FIXTURE_JWK = publicKey.export({ format: 'jwk' });
const jwk = FIXTURE_JWK;
const KID = 'acceptance-fixture-key';

function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function identityKey(identity) {
  return JSON.stringify([identity.issuer, identity.sub]);
}

export function makeIdentity(overrides = {}) {
  return { issuer: ISSUER, sub: TEST_SUB, ...overrides };
}

export function makeAccount(overrides = {}) {
  return {
    identity: makeIdentity(),
    email: TEST_EMAIL,
    active: true,
    epoch: 0,
    authValidAfter: 0,
    ...overrides,
  };
}

export function createAccountStore({ fail = {} } = {}) {
  const attempts = new Map();
  const accounts = new Map();
  const sessions = new Map();
  const calls = [];
  const failures = new Map(Object.entries(fail));

  function before(operation, args) {
    calls.push({ operation, args: copy(args) });
    if (failures.has(operation)) {
      const error = failures.get(operation);
      failures.delete(operation);
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  const store = {
    attempts,
    accounts,
    sessions,
    calls,
    failNext(operation, error = new Error(`injected ${operation} failure`)) {
      failures.set(operation, error);
    },
    seedAccount(account) {
      accounts.set(identityKey(account.identity), copy(account));
    },
    async putLoginAttempt(key, attempt) {
      before('putLoginAttempt', { key, attempt });
      if (attempts.has(key)) return false;
      attempts.set(key, copy(attempt));
      return true;
    },
    async takeLoginAttempt(key) {
      before('takeLoginAttempt', { key });
      const attempt = attempts.get(key) ?? null;
      attempts.delete(key);
      return copy(attempt);
    },
    async ensureAccount(identity, email) {
      before('ensureAccount', { identity, email });
      const key = identityKey(identity);
      const existing = accounts.get(key);
      if (existing) {
        accounts.set(key, {
          ...existing,
          identity: copy(identity),
          ...(email ? { email } : {}),
        });
        return copy(accounts.get(key));
      }
      const created = {
        identity: copy(identity),
        ...(email ? { email } : {}),
        active: true,
        epoch: 0,
        authValidAfter: 0,
      };
      accounts.set(key, created);
      return copy(created);
    },
    async getAccount(identity) {
      before('getAccount', { identity });
      return copy(accounts.get(identityKey(identity)) ?? null);
    },
    async advanceAuthBoundary(identity, atMs) {
      before('advanceAuthBoundary', { identity, atMs });
      const key = identityKey(identity);
      const existing = accounts.get(key) ?? {
        identity: copy(identity),
        active: true,
        epoch: 0,
        authValidAfter: 0,
      };
      accounts.set(key, {
        ...existing,
        identity: copy(identity),
        epoch: existing.epoch + 1,
        authValidAfter: Math.max(existing.authValidAfter, atMs),
      });
    },
    async putSession(key, session) {
      before('putSession', { key, session });
      if (sessions.has(key)) return false;
      sessions.set(key, copy(session));
      return true;
    },
    async getSession(key) {
      before('getSession', { key });
      return copy(sessions.get(key) ?? null);
    },
    async deleteSession(key) {
      before('deleteSession', { key });
      sessions.delete(key);
    },
  };

  return store;
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

export function signJwt(claims, { key = privateKey, kid = KID } = {}) {
  const encodedHeader = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }));
  const encodedClaims = base64url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), key).toString('base64url');
  return `${signingInput}.${signature}`;
}

export function validClaims({ now = Date.now, nonce, overrides = {} } = {}) {
  const nowSeconds = Math.floor(now() / 1000);
  const claims = {
    iss: ISSUER,
    sub: TEST_SUB,
    aud: CLIENT_ID,
    exp: nowSeconds + 300,
    iat: nowSeconds,
    auth_time: nowSeconds,
    nonce,
    email: TEST_EMAIL,
    email_verified: true,
    ...overrides,
  };
  return Object.fromEntries(Object.entries(claims).filter(([, value]) => value !== undefined));
}

export async function loadAccountAuthFactory() {
  let module;
  try {
    module = await import('../../src/lib/account-auth.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error('Acceptance behavior absent: src/lib/account-auth.mjs has not been implemented yet', { cause: error });
    }
    throw error;
  }
  assert.equal(typeof module.createAccountAuth, 'function', 'src/lib/account-auth.mjs must export createAccountAuth');
  return module.createAccountAuth;
}

export async function loadPasswordResetFactory() {
  let module;
  try {
    module = await import('../../src/api/password-reset.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error('Acceptance behavior absent: src/api/password-reset.mjs has not been implemented yet', { cause: error });
    }
    throw error;
  }
  assert.equal(typeof module.createPasswordResetHandler, 'function', 'src/api/password-reset.mjs must export createPasswordResetHandler');
  return module.createPasswordResetHandler;
}

export async function createAccountHarness({ now = Date.now, store = createAccountStore(), oidc = {} } = {}) {
  const createAccountAuth = await loadAccountAuthFactory();
  const state = {
    issuedNonce: undefined,
    issuedAttempt: undefined,
    expectedCallbackCode: undefined,
    calls: [],
    now,
    oidc,
  };
  const discovery = {
    issuer: ISSUER,
    authorization_endpoint: `${COGNITO_DOMAIN}/oauth2/authorize`,
    token_endpoint: `${COGNITO_DOMAIN}/oauth2/token`,
    jwks_uri: `${ISSUER}/.well-known/jwks.json`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    grant_types_supported: ['authorization_code'],
  };

  async function fetchOIDC(input, init = {}) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = init.method ?? input.method ?? 'GET';
    state.calls.push({ url: url.href, method });
    if (oidc.fetchErrorAt === url.href || oidc.fetchErrorAt === url.pathname) {
      throw new Error('private OIDC network detail');
    }
    if (url.pathname.endsWith('/.well-known/openid-configuration')) {
      return jsonResponse(oidc.discovery ?? discovery);
    }
    if (url.pathname.endsWith('/.well-known/jwks.json')) {
      return jsonResponse({ keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] });
    }
    if (url.pathname === '/oauth2/token') {
      if (oidc.tokenStatus) return jsonResponse({ error: 'temporarily_unavailable' }, oidc.tokenStatus);
      const parameters = await requestFormParameters(input, init);
      if (parameters.get('grant_type') !== 'authorization_code'
        || parameters.get('code') !== state.expectedCallbackCode
        || parameters.get('redirect_uri') !== `${ORIGIN}/cuenta/callback/`
        || parameters.get('code_verifier') !== state.issuedAttempt?.codeVerifier) {
        return jsonResponse({ error: 'invalid_grant' }, 400);
      }
      const claims = validClaims({ now, nonce: state.issuedNonce, overrides: oidc.claims ?? {} });
      const idToken = signJwt(claims, oidc.signWithWrongKey ? { key: wrongSigningKey, kid: KID } : {});
      const body = oidc.tokenResponse ?? {
        access_token: 'fixture-access-token-secret',
        id_token: idToken,
        token_type: 'Bearer',
        expires_in: 300,
      };
      return jsonResponse(body, oidc.tokenResponseStatus ?? 200);
    }
    if (url.pathname.endsWith('/userinfo')) {
      return jsonResponse({ sub: TEST_SUB, email: TEST_EMAIL, email_verified: true });
    }
    return jsonResponse({ error: 'not_found' }, 404);
  }

  const auth = createAccountAuth({
    origin: ORIGIN,
    issuer: ISSUER,
    clientId: CLIENT_ID,
    cognitoDomain: COGNITO_DOMAIN,
    store,
    fetchOIDC,
    now,
  });

  return { auth, store, state, fetchOIDC };
}

async function requestFormParameters(input, init) {
  let body = init.body;
  if (body === undefined && input instanceof Request) body = await input.clone().text();
  if (body instanceof URLSearchParams) return body;
  if (typeof body === 'string') return new URLSearchParams(body);
  if (body instanceof Uint8Array) return new URLSearchParams(Buffer.from(body).toString('utf8'));
  if (body instanceof ArrayBuffer) return new URLSearchParams(Buffer.from(body).toString('utf8'));
  return new URLSearchParams();
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export function makeRequest(path, { method = 'GET', headers = {}, body } = {}) {
  const normalizedHeaders = new Headers(headers);
  if (body !== undefined && !normalizedHeaders.has('content-type')) {
    normalizedHeaders.set('content-type', 'application/x-www-form-urlencoded');
  }
  return new Request(new URL(path, ORIGIN), {
    method,
    headers: normalizedHeaders,
    ...(body !== undefined ? { body } : {}),
  });
}

export function responseCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  const cookie = response.headers.get('set-cookie');
  return cookie ? [cookie] : [];
}

export function cookiePair(setCookie) {
  return setCookie.split(';', 1)[0];
}

export function cookieName(setCookie) {
  return cookiePair(setCookie).split('=', 1)[0];
}

export function liveCookieHeader(response) {
  return responseCookies(response)
    .filter((setCookie) => !/max-age=0/i.test(setCookie) && !/expires=Thu, 01 Jan 1970/i.test(setCookie))
    .map(cookiePair)
    .join('; ');
}

export function location(response) {
  const value = response.headers.get('location');
  assert.ok(value, 'expected redirect Location header');
  return new URL(value, ORIGIN);
}

export function assertPrivateNoStore(response) {
  assert.match(response.headers.get('cache-control') ?? '', /private/i);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
}

export function assertSafeFailureRedirect(response, state) {
  assert.equal(response.status, 303);
  const target = location(response);
  assert.equal(target.origin, ORIGIN);
  assert.equal(target.pathname, '/cuenta/');
  assert.equal(target.searchParams.get('estado'), state);
  assert.equal(target.searchParams.size, 1, 'failure redirect carries only its public state');
  assertPrivateNoStore(response);
}

export async function startLogin(harness, path = '/cuenta/ingresar/') {
  const response = await harness.auth.handle(makeRequest(path));
  assert.equal(response.status, 303);
  assertPrivateNoStore(response);
  const authorize = location(response);
  harness.state.issuedNonce = authorize.searchParams.get('nonce') ?? undefined;
  harness.state.issuedAttempt = harness.state.issuedNonce
    ? [...harness.store.attempts.values()].find((attempt) => attempt.nonce === harness.state.issuedNonce)
    : undefined;
  return {
    response,
    authorize,
    state: authorize.searchParams.get('state'),
    nonce: authorize.searchParams.get('nonce'),
    cookie: liveCookieHeader(response),
    harness,
  };
}

export function callbackRequest(login, options = {}) {
  const code = Object.hasOwn(options, 'code') ? options.code : 'fixture-authorization-code';
  const state = Object.hasOwn(options, 'state') ? options.state : login.state;
  const { error } = options;
  login.harness.state.expectedCallbackCode = code;
  const callback = new URL('/cuenta/callback/', ORIGIN);
  if (code !== undefined) callback.searchParams.set('code', code);
  if (state !== undefined) callback.searchParams.set('state', state);
  if (error !== undefined) callback.searchParams.set('error', error);
  return makeRequest(`${callback.pathname}${callback.search}`, {
    headers: login.cookie ? { cookie: login.cookie } : {},
  });
}

export function sessionCookieFrom(response, now = Date.now) {
  const currentTime = typeof now === 'function' ? now() : now;
  for (const setCookie of responseCookies(response)) {
    const pair = cookiePair(setCookie);
    if (pair.indexOf('=') < 0 || /max-age=0/i.test(setCookie)) continue;
    const maxAge = setCookie.match(/(?:^|;)\s*max-age=(\d+)/i)?.[1];
    const expires = setCookie.match(/(?:^|;)\s*expires=([^;]+)/i)?.[1];
    const expiresAt = expires ? Date.parse(expires) : NaN;
    const sevenDayExpiry = Number(maxAge) === ACCOUNT_COOKIE_MAX_AGE_SECONDS
      || (Number.isFinite(expiresAt)
        && expiresAt >= currentTime + ACCOUNT_SESSION_MS - 1_000
        && expiresAt <= currentTime + ACCOUNT_SESSION_MS + 1_000);
    if (sevenDayExpiry) return setCookie;
  }
  return undefined;
}

export async function completeLogin(harness, loginOptions = {}) {
  const login = await startLogin(harness, loginOptions.path);
  const response = await harness.auth.handle(callbackRequest(login, loginOptions.callback));
  return { login, response, sessionCookie: sessionCookieFrom(response, harness.state.now) };
}

export function sessionRequest(sessionCookie, path = '/cuenta/') {
  const pair = typeof sessionCookie === 'string' ? cookiePair(sessionCookie) : sessionCookie;
  return makeRequest(path, { headers: pair ? { cookie: pair } : {} });
}

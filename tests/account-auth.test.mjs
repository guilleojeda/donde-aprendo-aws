import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  ACCOUNT_SESSION_MS,
  CLIENT_ID,
  COGNITO_DOMAIN,
  ISSUER,
  ORIGIN,
  TEST_EMAIL,
  TEST_SUB,
  assertPrivateNoStore,
  assertSafeFailureRedirect,
  callbackRequest,
  completeLogin,
  createAccountHarness,
  createAccountStore,
  cookieName,
  cookiePair,
  location,
  makeIdentity,
  makeRequest,
  responseCookies,
  sessionRequest,
  startLogin,
} from './fixtures/account-auth.mjs';

function assertAccountRedirect(response, pathname) {
  assert.equal(response.status, 303);
  assert.equal(location(response).origin, ORIGIN);
  assert.equal(location(response).pathname, pathname);
  assertPrivateNoStore(response);
}

function assertCognitoLogoutRedirect(response) {
  assert.equal(response.status, 303);
  const target = location(response);
  assert.equal(target.origin, COGNITO_DOMAIN);
  assert.equal(target.pathname, '/logout');
  assert.equal(target.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(target.searchParams.get('logout_uri'), `${ORIGIN}/cuenta/`);
  assertPrivateNoStore(response);
}

function assertSafeRepeatedLogout(response) {
  assert.equal(response.status, 303);
  assertPrivateNoStore(response);
  const target = location(response);
  if (target.origin === COGNITO_DOMAIN) {
    assert.equal(target.pathname, '/logout');
    assert.equal(target.searchParams.get('client_id'), CLIENT_ID);
    assert.equal(target.searchParams.get('logout_uri'), `${ORIGIN}/cuenta/`);
  } else {
    assert.equal(target.origin, ORIGIN);
    assert.equal(target.pathname, '/cuenta/');
  }
}

function assertNoCredentialLeak(response) {
  const visible = `${response.headers.get('location') ?? ''}\n${response.headers.get('set-cookie') ?? ''}\n`;
  for (const secret of [TEST_EMAIL, 'fixture-access-token-secret', 'private OIDC network detail', 'authorization-code']) {
    assert.equal(visible.includes(secret), false, `response exposed ${secret}`);
  }
}

function cookieValue(setCookie) {
  return cookiePair(setCookie).slice(cookiePair(setCookie).indexOf('=') + 1);
}

function sessionRecord(harness) {
  assert.equal(harness.store.sessions.size, 1, 'this scenario creates one session');
  return [...harness.store.sessions.values()][0];
}

function attemptForNonce(harness, nonce) {
  return [...harness.store.attempts.values()].find((attempt) => attempt.nonce === nonce);
}

function assertOAuthParameters(url, harness) {
  assert.equal(url.origin, COGNITO_DOMAIN);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(url.searchParams.get('redirect_uri'), `${ORIGIN}/cuenta/callback/`);
  assert.deepEqual(new Set(url.searchParams.get('scope').split(' ')), new Set(['openid', 'email']));
  assert.equal(url.searchParams.get('lang'), 'es');
  assert.equal(url.searchParams.get('prompt'), 'login');
  assert.ok(url.searchParams.get('state'));
  assert.ok(url.searchParams.get('nonce'));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.match(url.searchParams.get('code_challenge') ?? '', /^[A-Za-z0-9_-]{43}$/);
  const attempt = attemptForNonce(harness, url.searchParams.get('nonce'));
  assert.ok(attempt?.codeVerifier, 'the OAuth attempt is identified by its unique nonce');
  assert.ok(attempt?.browserBindingHash);
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(attempt.codeVerifier).digest('base64url'));
  return attempt;
}

function looksLikeJwt(value) {
  const [encodedHeader, encodedClaims, encodedSignature, ...extra] = value.split('.');
  if (!encodedHeader || !encodedClaims || !encodedSignature || extra.length > 0) return false;
  try {
    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'));
    return typeof header?.alg === 'string'
      && typeof claims?.iss === 'string'
      && typeof claims?.sub === 'string'
      && Number.isFinite(claims?.exp);
  } catch {
    return false;
  }
}

async function authenticate(harness) {
  const result = await completeLogin(harness);
  assertAccountRedirect(result.response, '/cuenta/');
  assert.ok(result.sessionCookie, 'successful callback sets the application session cookie');
  return result;
}

test('login uses fixed Cognito OAuth parameters, PKCE S256, and ignores caller redirects', async () => {
  const harness = await createAccountHarness();
  const first = await startLogin(harness, '/cuenta/ingresar/?returnTo=https%3A%2F%2Fevil.invalid%2Fsteal');
  const second = await startLogin(harness);
  const authorize = first.authorize;
  const attempt = assertOAuthParameters(authorize, harness);

  assert.equal(authorize.pathname, '/oauth2/authorize');
  assert.ok(first.state && first.nonce && first.state !== second.state && first.nonce !== second.nonce);
  assert.ok(attempt?.expiresAt > Date.now());
  assert.equal(authorize.searchParams.has('returnTo'), false);
  assert.equal(authorize.searchParams.has('redirect'), false);
  assert.equal(first.response.status, 303);
});

test('registration and recovery redirect only to the fixed Cognito hosted pages', async () => {
  for (const [path, targetPath] of [
    ['/cuenta/registro/?returnTo=https%3A%2F%2Fevil.invalid', '/signup'],
    ['/cuenta/recuperar/?next=%2Fadmin', '/forgotPassword'],
  ]) {
    const harness = await createAccountHarness();
    const response = await harness.auth.handle(makeRequest(path));
    assert.equal(response.status, 303);
    assertPrivateNoStore(response);
    const target = location(response);
    assert.equal(target.pathname, targetPath);
    assertOAuthParameters(target, harness);
    assert.equal(location(response).searchParams.has('returnTo'), false);
    assert.equal(location(response).searchParams.has('next'), false);
  }
});

test('account routes reject unsupported HTTP methods with 405', async () => {
  const harness = await createAccountHarness();
  const requests = [
    makeRequest('/cuenta/ingresar/', { method: 'POST' }),
    makeRequest('/cuenta/registro/', { method: 'POST' }),
    makeRequest('/cuenta/recuperar/', { method: 'POST' }),
    makeRequest('/cuenta/callback/', { method: 'POST', body: new URLSearchParams({ code: 'fixture-authorization-code' }) }),
    makeRequest('/cuenta/salir/'),
  ];

  for (const request of requests) {
    const response = await harness.auth.handle(request);
    assert.equal(response.status, 405);
    assertPrivateNoStore(response);
  }
  assert.equal(harness.store.calls.length, 0);
  assert.equal(harness.state.calls.length, 0);
});

test('a valid signed callback creates a seven-day opaque session without email or OIDC tokens', async () => {
  const startAt = Date.now();
  const harness = await createAccountHarness({ now: () => startAt });
  const { response, sessionCookie } = await authenticate(harness);
  const stored = sessionRecord(harness);
  const cookie = sessionCookie.toLowerCase();
  const session = await harness.auth.getSession(sessionRequest(sessionCookie));

  assert.deepEqual(session, {
    state: 'authenticated',
    account: { email: TEST_EMAIL },
    csrfToken: stored.csrfToken,
    expiresAt: startAt + ACCOUNT_SESSION_MS,
  });
  assert.ok(session.csrfToken);
  assert.equal(stored.identity.issuer, ISSUER);
  assert.equal(stored.identity.sub, TEST_SUB);
  assert.equal(stored.epoch, 0);
  assert.equal(stored.createdAt, startAt);
  assert.equal(stored.expiresAt - stored.createdAt, ACCOUNT_SESSION_MS);
  assert.equal(cookieName(sessionCookie).length > 0, true);
  assert.match(cookie, /; path=\//);
  assert.match(cookie, /; secure(?:;|$)/);
  assert.match(cookie, /; httponly(?:;|$)/);
  assert.match(cookie, /; samesite=lax(?:;|$)/);
  const maxAge = cookie.match(/(?:^|;)\s*max-age=(\d+)/)?.[1];
  if (maxAge !== undefined) {
    assert.equal(Number(maxAge), 604800);
  } else {
    const expires = sessionCookie.match(/(?:^|;)\s*expires=([^;]+)/i)?.[1];
    assert.ok(expires, 'session cookie has a seven-day absolute expiration');
    assert.equal(Math.floor(Date.parse(expires) / 1000), Math.floor(stored.expiresAt / 1000));
  }
  assert.equal(/;\s*domain=/i.test(sessionCookie), false);
  for (const sensitiveValue of [TEST_EMAIL, TEST_SUB, 'fixture-access-token-secret']) {
    assert.equal(cookieValue(sessionCookie).includes(sensitiveValue), false);
  }
  assert.equal(looksLikeJwt(cookieValue(sessionCookie)), false, 'session cookie does not contain decodable JWT claims');
  assert.equal(JSON.stringify(stored).includes(TEST_EMAIL), false);
  assert.equal(JSON.stringify(stored).includes('fixture-access-token-secret'), false);
  assert.equal(JSON.stringify(stored).includes('id_token'), false);
  assert.equal(harness.store.attempts.size, 0);
  assertAccountRedirect(response, '/cuenta/');
  assertNoCredentialLeak(response);
});

test('session reads never slide the absolute expiry and an expired record stays anonymous', async () => {
  let now = Date.now();
  const harness = await createAccountHarness({ now: () => now });
  const { sessionCookie } = await authenticate(harness);
  const stored = sessionRecord(harness);
  const originalExpiry = stored.expiresAt;

  now += 4 * 24 * 60 * 60 * 1000;
  assert.equal((await harness.auth.getSession(sessionRequest(sessionCookie))).state, 'authenticated');
  assert.equal(sessionRecord(harness).expiresAt, originalExpiry);
  now = originalExpiry - 1;
  assert.equal((await harness.auth.getSession(sessionRequest(sessionCookie))).state, 'authenticated');
  assert.equal(sessionRecord(harness).expiresAt, originalExpiry);
  now = originalExpiry;
  assert.deepEqual(await harness.auth.getSession(sessionRequest(sessionCookie)), { state: 'anonymous' });
});

test('callback rejects missing, incorrect, or unbound OAuth state', async () => {
  const variants = [
    { name: 'missing state', callback: (login) => callbackRequest(login, { state: undefined }) },
    { name: 'incorrect state', callback: (login) => callbackRequest(login, { state: 'attacker-state' }) },
    { name: 'missing browser cookie', callback: (login) => makeRequest(`/cuenta/callback/?code=fixture-authorization-code&state=${encodeURIComponent(login.state)}`) },
  ];
  for (const variant of variants) {
    const harness = await createAccountHarness();
    const login = await startLogin(harness);
    const response = await harness.auth.handle(variant.callback(login));
    assertSafeFailureRedirect(response, 'acceso-invalido');
    assert.equal(harness.store.sessions.size, 0, variant.name);
    assert.equal(harness.store.calls.filter(({ operation }) => operation === 'ensureAccount').length, 0, variant.name);
    assertNoCredentialLeak(response);
  }
});

test('callback rejects invalid OIDC signatures and identity or account claims', async () => {
  const variants = [
    { name: 'bad signature', oidc: { signWithWrongKey: true } },
    { name: 'wrong issuer', oidc: { claims: { iss: 'https://attacker.invalid' } } },
    { name: 'wrong audience', oidc: { claims: { aud: 'another-client' } } },
    { name: 'expired token', oidc: { claims: { exp: Math.floor(Date.now() / 1000) - 3600 } } },
    { name: 'nonce mismatch', oidc: { claims: { nonce: 'attacker-nonce' } } },
    { name: 'unverified email', oidc: { claims: { email_verified: false } } },
    { name: 'missing email verification', oidc: { claims: { email_verified: undefined } } },
    { name: 'missing authentication time', oidc: { claims: { auth_time: undefined } } },
  ];
  for (const variant of variants) {
    const harness = await createAccountHarness({ oidc: variant.oidc });
    const login = await startLogin(harness);
    const response = await harness.auth.handle(callbackRequest(login));
    assertSafeFailureRedirect(response, 'acceso-invalido');
    assert.equal(harness.store.sessions.size, 0, variant.name);
    assert.equal(harness.store.calls.filter(({ operation }) => operation === 'ensureAccount').length, 0, variant.name);
    assertNoCredentialLeak(response);
  }
});

test('expired login attempts cannot be exchanged even when the identity token is fresh', async () => {
  let now = Date.now();
  const harness = await createAccountHarness({ now: () => now });
  const login = await startLogin(harness);
  now = attemptForNonce(harness, login.nonce).expiresAt;
  const response = await harness.auth.handle(callbackRequest(login));

  assertSafeFailureRedirect(response, 'acceso-invalido');
  assert.equal(harness.store.sessions.size, 0);
  assert.equal(harness.state.calls.some(({ url }) => url.endsWith('/oauth2/token')), false);
});

test('Cognito cancellation returns a clean state without reflecting provider text', async () => {
  const harness = await createAccountHarness();
  const login = await startLogin(harness);
  const response = await harness.auth.handle(callbackRequest(login, {
    code: undefined,
    error: 'access_denied',
  }));

  assertSafeFailureRedirect(response, 'cancelado');
  assertNoCredentialLeak(response);
  assert.equal(harness.store.sessions.size, 0);
});

test('OIDC token endpoint transport failure returns unavailable without a session or details', async () => {
  const harness = await createAccountHarness({ oidc: { tokenStatus: 503 } });
  const login = await startLogin(harness);
  const response = await harness.auth.handle(callbackRequest(login));

  assertSafeFailureRedirect(response, 'no-disponible');
  assert.equal(harness.state.calls.some(({ url }) => url.endsWith('/oauth2/token')), true);
  assert.equal(harness.store.sessions.size, 0);
  assertNoCredentialLeak(response);
});

test('callback replay and concurrent callback requests consume an attempt only once', async () => {
  const harness = await createAccountHarness();
  const login = await startLogin(harness);
  const requests = [callbackRequest(login), callbackRequest(login)];
  const responses = await Promise.all(requests.map((request) => harness.auth.handle(request)));

  assert.equal(responses.filter((response) => response.status === 303
    && location(response).href === `${ORIGIN}/cuenta/`).length, 1);
  assert.equal(responses.filter((response) => location(response).searchParams.get('estado') === 'acceso-invalido').length, 1);
  assert.equal(harness.store.sessions.size, 1);
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'ensureAccount').length, 1);
});

test('disabled accounts cannot establish a session and getSession reports disabled', async () => {
  const store = createAccountStore();
  const harness = await createAccountHarness({ store });
  const firstLogin = await authenticate(harness);
  const account = await store.getAccount(makeIdentity());
  store.seedAccount({ ...account, active: false });

  assert.deepEqual(await harness.auth.getSession(sessionRequest(firstLogin.sessionCookie)), { state: 'disabled' });
  const nextLogin = await startLogin(harness);
  const response = await harness.auth.handle(callbackRequest(nextLogin));
  assertSafeFailureRedirect(response, 'acceso-invalido');
  assert.equal(store.calls.filter(({ operation }) => operation === 'putSession').length, 1);
  assert.deepEqual(await harness.auth.getSession(sessionRequest(firstLogin.sessionCookie)), { state: 'disabled' });
});

test('login attempt and session storage failures return safe unavailable states', async () => {
  const attemptStore = createAccountStore({ fail: { putLoginAttempt: new Error('private attempt storage detail') } });
  const attemptHarness = await createAccountHarness({ store: attemptStore });
  const attemptResponse = await attemptHarness.auth.handle(makeRequest('/cuenta/ingresar/'));
  assertSafeFailureRedirect(attemptResponse, 'no-disponible');
  assertNoCredentialLeak(attemptResponse);

  const sessionStore = createAccountStore();
  const sessionHarness = await createAccountHarness({ store: sessionStore });
  const login = await startLogin(sessionHarness);
  sessionStore.failNext('putSession', new Error(`private session storage detail ${TEST_EMAIL}`));
  const callback = await sessionHarness.auth.handle(callbackRequest(login));
  assertSafeFailureRedirect(callback, 'no-disponible');
  assert.equal(sessionStore.sessions.size, 0);
  assertNoCredentialLeak(callback);
});

test('attempt read failures do not reach the token endpoint and remain private', async () => {
  const harness = await createAccountHarness();
  const login = await startLogin(harness);
  harness.store.failNext('takeLoginAttempt', new Error('private attempt read detail'));
  const response = await harness.auth.handle(callbackRequest(login));

  assertSafeFailureRedirect(response, 'no-disponible');
  assert.equal(harness.state.calls.some(({ url }) => url.endsWith('/oauth2/token')), false);
  assertNoCredentialLeak(response);
});

test('getSession reports unavailable when session or account reads fail', async () => {
  const harness = await createAccountHarness();
  const { sessionCookie } = await authenticate(harness);
  harness.store.failNext('getSession', new Error('private session read detail'));
  assert.deepEqual(await harness.auth.getSession(sessionRequest(sessionCookie)), { state: 'unavailable' });
  harness.store.failNext('getAccount', new Error('private account read detail'));
  assert.deepEqual(await harness.auth.getSession(sessionRequest(sessionCookie)), { state: 'unavailable' });
});

test('logout requires POST, same origin, and the current CSRF token', async () => {
  const harness = await createAccountHarness();
  const { sessionCookie } = await authenticate(harness);
  const authenticated = await harness.auth.getSession(sessionRequest(sessionCookie));
  const cookie = cookiePair(sessionCookie);
  const invalidRequests = [
    makeRequest('/cuenta/salir/', { headers: { cookie } }),
    makeRequest('/cuenta/salir/', { method: 'POST', headers: { cookie }, body: new URLSearchParams({ csrfToken: authenticated.csrfToken }) }),
    makeRequest('/cuenta/salir/', { method: 'POST', headers: { cookie, origin: 'https://evil.invalid' }, body: new URLSearchParams({ csrfToken: authenticated.csrfToken }) }),
    makeRequest('/cuenta/salir/', { method: 'POST', headers: { cookie, origin: ORIGIN } }),
    makeRequest('/cuenta/salir/', { method: 'POST', headers: { cookie, origin: ORIGIN }, body: new URLSearchParams({ csrfToken: 'wrong-token' }) }),
  ];
  for (const request of invalidRequests) {
    const response = await harness.auth.handle(request);
    assertPrivateNoStore(response);
    assert.ok(response.status >= 400 && response.status < 500, `expected safe client error, received ${response.status}`);
    assert.equal((await harness.auth.getSession(sessionRequest(sessionCookie))).state, 'authenticated');
  }
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'deleteSession').length, 0);
});

test('valid logout deletes the session, clears its cookie, and cannot be replayed', async () => {
  const harness = await createAccountHarness();
  const { sessionCookie } = await authenticate(harness);
  const session = await harness.auth.getSession(sessionRequest(sessionCookie));
  const logout = await harness.auth.handle(makeRequest('/cuenta/salir/', {
    method: 'POST',
    headers: { cookie: cookiePair(sessionCookie), origin: ORIGIN },
    body: new URLSearchParams({ csrfToken: session.csrfToken }),
  }));

  assertCognitoLogoutRedirect(logout);
  assert.equal((await harness.auth.getSession(sessionRequest(sessionCookie))).state, 'anonymous');
  assert.ok(responseCookies(logout).some((value) => cookieName(value) === cookieName(sessionCookie) && /max-age=0/i.test(value)));
  assert.equal(harness.store.sessions.size, 0);
  const repeated = await harness.auth.handle(makeRequest('/cuenta/salir/', { method: 'POST', headers: { origin: ORIGIN } }));
  assertSafeRepeatedLogout(repeated);
  assert.equal((await harness.auth.getSession(sessionRequest(sessionCookie))).state, 'anonymous');
});

test('logout storage failure does not claim success or clear the still-valid session cookie', async () => {
  const harness = await createAccountHarness();
  const { sessionCookie } = await authenticate(harness);
  const session = await harness.auth.getSession(sessionRequest(sessionCookie));
  harness.store.failNext('deleteSession', new Error('private delete detail'));
  const response = await harness.auth.handle(makeRequest('/cuenta/salir/', {
    method: 'POST',
    headers: { cookie: cookiePair(sessionCookie), origin: ORIGIN },
    body: new URLSearchParams({ csrfToken: session.csrfToken }),
  }));

  assertSafeFailureRedirect(response, 'no-disponible');
  assert.equal((await harness.auth.getSession(sessionRequest(sessionCookie))).state, 'authenticated');
  assert.equal(responseCookies(response).some((value) => cookieName(value) === cookieName(sessionCookie) && /max-age=0/i.test(value)), false);
  assertNoCredentialLeak(response);
});

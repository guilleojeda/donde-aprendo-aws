import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COGNITO_DOMAIN, ORIGIN, callbackRequest, completeLogin, cookiePair,
  createAccountHarness, createAccountStore, location, makeRequest,
  responseCookies, sessionRequest, startLogin,
} from './fixtures/account-auth.mjs';

test('a signed current token cannot reuse authentication from before this login attempt', async () => {
  for (const ageSeconds of [1, 20 * 60]) {
    const now = Date.now();
    const harness = await createAccountHarness({
      now: () => now,
      oidc: { claims: { auth_time: Math.floor(now / 1000) - ageSeconds } },
    });
    const login = await startLogin(harness);
    const response = await harness.auth.handle(callbackRequest(login));
    assert.equal(location(response).searchParams.get('estado'), 'acceso-invalido');
    assert.equal(responseCookies(response).length, 0);
    assert.equal(harness.store.accounts.size, 0);
    assert.equal(harness.store.sessions.size, 0);
  }
});

test('authentication during the attempt remains valid after a slow callback and at second precision', async () => {
  const callbackAt = Date.now();
  for (const elapsed of [0, 8 * 60 * 1000]) {
    let now = callbackAt - elapsed;
    const authenticatedAt = Math.floor(now / 1000);
    const harness = await createAccountHarness({ now: () => now, oidc: { claims: { auth_time: authenticatedAt } } });
    const login = await startLogin(harness);
    now = callbackAt;
    const response = await harness.auth.handle(callbackRequest(login));
    assert.equal(location(response).href, `${ORIGIN}/cuenta/`);
    assert.equal(harness.store.sessions.size, 1);
    assert.ok(responseCookies(response).some((cookie) => cookie.startsWith('da_session=')));
  }
});

test('a signed authentication time in the future cannot establish a session', async () => {
  const now = Date.now();
  const harness = await createAccountHarness({
    now: () => now,
    oidc: { claims: { auth_time: Math.floor(now / 1000) + 31 } },
  });
  const login = await startLogin(harness);
  const response = await harness.auth.handle(callbackRequest(login));
  assert.equal(location(response).searchParams.get('estado'), 'acceso-invalido');
  assert.equal(harness.store.sessions.size, 0);
});

function logoutRequest(sessionCookie, csrfToken, origin = ORIGIN) {
  return makeRequest('/cuenta/salir/', {
    method: 'POST',
    headers: { cookie: cookiePair(sessionCookie), origin },
    body: new URLSearchParams({ csrfToken }),
  });
}

function logoutRetryRequest(csrfToken, origin = ORIGIN) {
  return makeRequest('/cuenta/salir/', {
    method: 'POST',
    headers: { origin },
    body: new URLSearchParams({ csrfToken }),
  });
}

function assertProviderLogout(response) {
  assert.equal(response.status, 303);
  assert.equal(location(response).origin, COGNITO_DOMAIN);
  assert.equal(location(response).pathname, '/logout');
  assert.ok(responseCookies(response).some((cookie) => cookie.startsWith('da_session=;') && /Max-Age=0/.test(cookie)));
}

test('logout without a session cookie preserves the local account destination', async () => {
  const harness = await createAccountHarness();
  const response = await harness.auth.handle(makeRequest('/cuenta/salir/', {
    method: 'POST', headers: { origin: ORIGIN },
  }));
  assert.equal(response.status, 303);
  assert.equal(location(response).href, `${ORIGIN}/cuenta/`);
  assert.equal(harness.store.calls.length, 0);
});

test('retry completes provider logout when deleting the session committed but its acknowledgement was lost', async () => {
  const store = createAccountStore();
  const deleteSession = store.deleteSession.bind(store);
  let loseAcknowledgement = true;
  store.deleteSession = async (key) => {
    await deleteSession(key);
    if (loseAcknowledgement) {
      loseAcknowledgement = false;
      throw new Error('lost storage acknowledgement');
    }
  };
  const harness = await createAccountHarness({ store });
  const login = await completeLogin(harness);
  const session = await harness.auth.getSession(sessionRequest(login.sessionCookie));
  const first = await harness.auth.handle(logoutRequest(login.sessionCookie, session.csrfToken));
  assert.equal(location(first).searchParams.get('estado'), 'no-disponible');
  assert.equal(responseCookies(first).length, 0);
  assert.equal(store.sessions.size, 0);
  assert.equal(store.calls.filter(({ operation }) => operation === 'deleteSession').length, 1,
    'the lost acknowledgement does not replay local revocation');
  assert.equal((await harness.auth.getSession(sessionRequest(login.sessionCookie))).state, 'anonymous');

  const foreignRetry = await harness.auth.handle(logoutRequest(login.sessionCookie, session.csrfToken, 'https://other.invalid'));
  assert.equal(foreignRetry.status, 403);
  assert.equal(foreignRetry.headers.has('location'), false);
  assert.equal(responseCookies(foreignRetry).length, 0);

  const stillPresentCookieRetry = await harness.auth.handle(logoutRequest(login.sessionCookie, session.csrfToken));
  assertProviderLogout(stillPresentCookieRetry);
  assert.equal((await harness.auth.getSession(sessionRequest(login.sessionCookie))).state, 'anonymous');
  const retry = await harness.auth.handle(logoutRetryRequest(session.csrfToken));
  assertProviderLogout(retry);
  assert.equal(store.calls.filter(({ operation }) => operation === 'deleteSession').length, 1,
    'neither valid retry form performs a second local delete');
});

test('retry does not clear a cookie or contact logout when revocation cannot be confirmed', async () => {
  const harness = await createAccountHarness();
  const login = await completeLogin(harness);
  const session = await harness.auth.getSession(sessionRequest(login.sessionCookie));
  harness.store.failNext('getSession', new Error('storage unavailable'));
  const response = await harness.auth.handle(logoutRequest(login.sessionCookie, session.csrfToken));
  assert.equal(location(response).searchParams.get('estado'), 'no-disponible');
  assert.equal(responseCookies(response).length, 0);
  assert.equal(harness.store.sessions.size, 1);
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'deleteSession').length, 0);
});

test('a malformed presented cookie is not treated as an anonymous provider-only retry', async () => {
  const harness = await createAccountHarness();
  const response = await harness.auth.handle(makeRequest('/cuenta/salir/', {
    method: 'POST',
    headers: { cookie: 'da_session=malformed-cookie', origin: ORIGIN },
    body: new URLSearchParams({ csrfToken: 'c'.repeat(43) }),
  }));
  assert.equal(response.status, 403);
  assert.equal(response.headers.has('location'), false);
  assert.equal(responseCookies(response).length, 0);
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'getSession').length, 0,
    'a malformed token is rejected before a storage lookup');
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'deleteSession').length, 0);
});

function noCookieFormRequest({ origin, body, headers = {} } = {}) {
  const requestHeaders = new Headers(headers);
  if (origin !== undefined) requestHeaders.set('origin', origin);
  return makeRequest('/cuenta/salir/', {
    method: 'POST',
    headers: requestHeaders,
    body,
  });
}

test('no-cookie provider continuation rejects invalid origin and form shapes without redirect or mutation', async (t) => {
  const token = 'c'.repeat(43);
  const cases = [
    {
      name: 'foreign origin',
      request: () => noCookieFormRequest({ origin: 'https://other.invalid', body: new URLSearchParams({ csrfToken: token }) }),
      status: 403,
    },
    {
      name: 'missing origin',
      request: () => noCookieFormRequest({ body: new URLSearchParams({ csrfToken: token }) }),
      status: 403,
    },
    {
      name: 'duplicate csrfToken fields',
      request: () => noCookieFormRequest({ origin: ORIGIN, body: new URLSearchParams([['csrfToken', token], ['csrfToken', token]]) }),
      status: 403,
    },
    {
      name: 'malformed csrfToken',
      request: () => noCookieFormRequest({ origin: ORIGIN, body: new URLSearchParams({ csrfToken: 'not-a-token' }) }),
      status: 403,
    },
    {
      name: 'oversized declared form',
      request: () => noCookieFormRequest({
        origin: ORIGIN,
        headers: { 'content-length': '9000' },
        body: new URLSearchParams({ csrfToken: token }),
      }),
      status: 413,
    },
    {
      name: 'oversized body without a declared length',
      request: () => noCookieFormRequest({
        origin: ORIGIN,
        body: new URLSearchParams({ csrfToken: token.repeat(210) }),
      }),
      status: 413,
    },
    {
      name: 'extraneous form field',
      request: () => noCookieFormRequest({ origin: ORIGIN, body: new URLSearchParams({ csrfToken: token, extra: 'unexpected' }) }),
      status: 403,
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const harness = await createAccountHarness();
      const response = await harness.auth.handle(scenario.request());
      const target = response.headers.get('location');
      assert.equal(target ? new URL(target, ORIGIN).origin === COGNITO_DOMAIN : false, false);
      assert.equal(responseCookies(response).length, 0);
      assert.equal(harness.store.sessions.size, 0);
      assert.equal(harness.store.calls.filter(({ operation }) => operation === 'deleteSession').length, 0);
      assert.equal(response.status, scenario.status);
    });
  }
});

test('a still-live changed principal cannot reuse an old logout form, while a same-origin no-cookie retry only ends provider SSO', async () => {
  const harness = await createAccountHarness();
  const first = await completeLogin(harness);
  const firstSession = await harness.auth.getSession(sessionRequest(first.sessionCookie));

  const previousClaims = harness.state.oidc.claims;
  harness.state.oidc.claims = { sub: 'second-user', email: 'second@example.invalid' };
  let second;
  try {
    second = await completeLogin(harness);
  } finally {
    if (previousClaims === undefined) delete harness.state.oidc.claims;
    else harness.state.oidc.claims = previousClaims;
  }
  assert.ok(second.sessionCookie);
  assert.equal(harness.store.sessions.size, 2);

  const changedPrincipal = await harness.auth.handle(logoutRequest(
    second.sessionCookie, firstSession.csrfToken,
  ));
  assert.equal(changedPrincipal.status, 403);
  assert.equal(changedPrincipal.headers.has('location'), false);
  assert.equal(responseCookies(changedPrincipal).length, 0);
  assert.equal(harness.store.sessions.size, 2);
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'deleteSession').length, 0);

  const firstLogout = await harness.auth.handle(logoutRequest(first.sessionCookie, firstSession.csrfToken));
  assertProviderLogout(firstLogout);
  assert.equal(harness.store.sessions.size, 1);
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'deleteSession').length, 1);

  const providerOnly = await harness.auth.handle(logoutRetryRequest(firstSession.csrfToken));
  assertProviderLogout(providerOnly);
  assert.equal(harness.store.sessions.size, 1, 'the provider-only continuation leaves the changed principal live');
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'deleteSession').length, 1);
});

test('a live session still requires its exact form and origin before local revocation', async () => {
  const harness = await createAccountHarness();
  const login = await completeLogin(harness);
  const session = await harness.auth.getSession(sessionRequest(login.sessionCookie));
  const badCsrf = `${session.csrfToken[0] === 'A' ? 'B' : 'A'}${session.csrfToken.slice(1)}`;

  for (const request of [
    logoutRequest(login.sessionCookie, badCsrf),
    logoutRequest(login.sessionCookie, session.csrfToken, 'https://other.invalid'),
    makeRequest('/cuenta/salir/', {
      method: 'POST',
      headers: { cookie: cookiePair(login.sessionCookie), origin: ORIGIN },
      body: 'csrfToken=not-a-valid-form-token',
    }),
  ]) {
    const response = await harness.auth.handle(request);
    assert.equal(response.status, 403);
    assert.equal(response.headers.has('location'), false);
    assert.equal(responseCookies(response).length, 0);
    assert.equal(harness.store.sessions.size, 1);
  }
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'deleteSession').length, 0);
});

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
  assert.equal((await harness.auth.getSession(sessionRequest(login.sessionCookie))).state, 'anonymous');

  const foreignRetry = await harness.auth.handle(logoutRequest(login.sessionCookie, session.csrfToken, 'https://other.invalid'));
  assert.equal(foreignRetry.status, 403);
  assert.equal(foreignRetry.headers.has('location'), false);
  assert.equal(responseCookies(foreignRetry).length, 0);

  const retry = await harness.auth.handle(logoutRequest(login.sessionCookie, session.csrfToken));
  assertProviderLogout(retry);
  assert.equal((await harness.auth.getSession(sessionRequest(login.sessionCookie))).state, 'anonymous');
  assertProviderLogout(await harness.auth.handle(logoutRequest(login.sessionCookie, session.csrfToken)));
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
});

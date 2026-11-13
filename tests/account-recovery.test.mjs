import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ISSUER,
  ORIGIN,
  TEST_EMAIL,
  TEST_SUB,
  assertSafeFailureRedirect,
  callbackRequest,
  completeLogin,
  createAccountHarness,
  createAccountStore,
  loadPasswordResetFactory,
  makeAccount,
  makeIdentity,
  responseCookies,
  sessionCookieFrom,
  sessionRequest,
  startLogin,
} from './fixtures/account-auth.mjs';

function resetEvent(overrides = {}) {
  return {
    version: '1',
    region: 'us-east-1',
    userPoolId: 'us-east-1_example',
    triggerSource: 'PostConfirmation_ConfirmForgotPassword',
    userName: TEST_SUB,
    request: {
      userAttributes: { sub: TEST_SUB, email: TEST_EMAIL },
    },
    response: {},
    ...overrides,
  };
}

async function makeResetHandler(store, now = Date.now) {
  const createPasswordResetHandler = await loadPasswordResetFactory();
  return createPasswordResetHandler({ store, now });
}

async function signedIn(harness) {
  const result = await completeLogin(harness);
  assert.equal(result.response.status, 303);
  assert.equal(new URL(result.response.headers.get('location'), ORIGIN).pathname, '/cuenta/');
  assert.ok(result.sessionCookie);
  return result;
}

test('password reset waits for the Cognito trigger, advances the auth boundary, and invalidates both sessions', async () => {
  let now = Date.now();
  const store = createAccountStore();
  const harness = await createAccountHarness({ store, now: () => now });
  const first = await signedIn(harness);
  const second = await signedIn(harness);
  assert.equal((await harness.auth.getSession(sessionRequest(first.sessionCookie))).state, 'authenticated');
  assert.equal((await harness.auth.getSession(sessionRequest(second.sessionCookie))).state, 'authenticated');

  const handler = await makeResetHandler(store, () => now);
  const result = await handler(resetEvent());

  assert.equal(result.triggerSource, 'PostConfirmation_ConfirmForgotPassword');
  const account = await store.getAccount(makeIdentity());
  assert.equal(account.identity.issuer, ISSUER);
  assert.equal(account.epoch, 1);
  assert.equal(account.authValidAfter, now);
  assert.equal((await harness.auth.getSession(sessionRequest(first.sessionCookie))).state, 'anonymous');
  assert.equal((await harness.auth.getSession(sessionRequest(second.sessionCookie))).state, 'anonymous');
  now += 2_000;
  const restoredAccess = await signedIn(harness);
  const newSessions = [...store.sessions.values()].filter((session) => session.epoch === 1);
  assert.equal(newSessions.length, 1);
  const newSession = newSessions[0];
  assert.equal(newSession.epoch, 1);
  assert.equal((await harness.auth.getSession(sessionRequest(restoredAccess.sessionCookie))).state, 'authenticated');
});

test('a reset trigger retry never restores a session invalidated by the first trigger', async () => {
  const now = Date.now();
  const store = createAccountStore();
  const harness = await createAccountHarness({ store, now: () => now });
  const oldSession = await signedIn(harness);
  const handler = await makeResetHandler(store, () => now);

  await handler(resetEvent());
  assert.equal((await harness.auth.getSession(sessionRequest(oldSession.sessionCookie))).state, 'anonymous');
  await handler(resetEvent());
  assert.equal((await harness.auth.getSession(sessionRequest(oldSession.sessionCookie))).state, 'anonymous');
  assert.equal((await store.getAccount(makeIdentity())).authValidAfter, now);
});

test('a reset before first login is preserved when ensureAccount later creates the account session', async () => {
  let now = Math.floor(Date.now() / 1000) * 1000;
  const store = createAccountStore();
  const handler = await makeResetHandler(store, () => now);
  await handler(resetEvent());
  const boundary = now;
  assert.deepEqual(await store.getAccount(makeIdentity()), {
    identity: makeIdentity(),
    active: true,
    epoch: 1,
    authValidAfter: boundary,
  });

  now += 2_000;
  const harness = await createAccountHarness({ store, now: () => now });
  await signedIn(harness);
  assert.equal(store.sessions.size, 1);
  const session = [...store.sessions.values()][0];
  assert.equal(session.epoch, 1);
  const account = await store.getAccount(makeIdentity());
  assert.equal(account.epoch, 1);
  assert.equal(account.authValidAfter, boundary);
  assert.equal(account.email, TEST_EMAIL);
});

test('a durable reset rejects the original callback and a new post-reset login succeeds', async (t) => {
  const cases = [
    { name: 'authentication before the reset', authOffsetMs: 0, resetOffsetMs: 2_000 },
    { name: 'authentication in the reset second', authOffsetMs: 2_000, resetOffsetMs: 2_000 },
    { name: 'a fractional reset boundary in that second', authOffsetMs: 2_000, resetOffsetMs: 2_500 },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      let now = Math.floor(Date.now() / 1000) * 1000;
      const attemptStartedAt = now;
      const authTime = Math.floor((attemptStartedAt + scenario.authOffsetMs) / 1000);
      const claims = { auth_time: authTime };
      const store = createAccountStore();
      const harness = await createAccountHarness({ store, now: () => now, oidc: { claims } });
      const login = await startLogin(harness);

      now = attemptStartedAt + scenario.resetOffsetMs;
      const handler = await makeResetHandler(store, () => now);
      await handler(resetEvent());
      const boundary = (await store.getAccount(makeIdentity())).authValidAfter;
      assert.equal(boundary, now, 'the durable reset finishes before the callback is returned');

      const beforeCallback = store.calls.length;
      now += 1_000;
      const callback = await harness.auth.handle(callbackRequest(login));
      assert.equal(callback.status, 303);
      assert.equal(Boolean(sessionCookieFrom(callback, now)), false,
        'the original callback must not create or return a session cookie');
      assert.equal(responseCookies(callback).some((cookie) => cookie.startsWith('da_session=')), false,
        'the rejected callback must not set any account-session cookie');
      assertSafeFailureRedirect(callback, 'acceso-invalido');
      assert.equal(store.sessions.size, 0, 'the original callback must not persist a session');

      const callbackCalls = store.calls.slice(beforeCallback).map(({ operation }) => operation);
      assert.ok(callbackCalls.includes('takeLoginAttempt'), 'the callback consumes its valid single-use attempt');
      assert.ok(harness.state.calls.some(({ url }) => url.endsWith('/oauth2/token')),
        'the valid callback reaches the OIDC token exchange');
      assert.ok(callbackCalls.includes('ensureAccount'),
        'the signed identity reaches the account read that returns the persisted reset boundary');
      assert.equal(callbackCalls.includes('putSession'), false,
        'the rejected callback never asks storage to create a session');

      now = boundary + 5_000;
      claims.auth_time = Math.floor(now / 1000);
      const fresh = await completeLogin(harness);
      assert.equal(fresh.response.status, 303);
      assert.ok(fresh.sessionCookie, 'a fresh authentication after the reset may create a session');
      assert.equal(store.sessions.size, 1);
      const newSession = [...store.sessions.values()][0];
      assert.equal(newSession.epoch, 1);
      assert.equal((await harness.auth.getSession(sessionRequest(fresh.sessionCookie))).state, 'authenticated');
    });
  }
});

test('reset trigger awaits the durable boundary write before returning', async () => {
  const store = createAccountStore();
  let releaseWrite;
  let notifyEntered;
  const enteredWrite = new Promise((resolve) => { notifyEntered = resolve; });
  store.advanceAuthBoundary = async (identity, atMs) => {
    notifyEntered();
    await new Promise((resolve) => { releaseWrite = resolve; });
    store.seedAccount(makeAccount({ identity, epoch: 1, authValidAfter: atMs }));
  };
  const handler = await makeResetHandler(store, () => 1_900_000_000_000);
  let settled = false;
  const pending = handler(resetEvent()).then(() => { settled = true; });

  let timeout;
  try {
    await Promise.race([
      enteredWrite,
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('boundary write was never started')), 2_000); }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
  assert.equal(settled, false);
  releaseWrite();
  await pending;
  assert.equal(settled, true);
});

test('reset trigger propagates persistence failures to Cognito for retry', async () => {
  const store = createAccountStore();
  const failure = new Error('private persistence detail');
  store.advanceAuthBoundary = async () => { throw failure; };
  const handler = await makeResetHandler(store);

  await assert.rejects(handler(resetEvent()), (error) => error === failure);
});

test('sign-up confirmation and unrelated trigger sources never invalidate an account', async () => {
  const store = createAccountStore();
  store.seedAccount(makeAccount());
  const handler = await makeResetHandler(store);

  const signup = await handler(resetEvent({ triggerSource: 'PostConfirmation_ConfirmSignUp' }));
  const other = await handler(resetEvent({ triggerSource: 'PreTokenGeneration_Authentication' }));

  assert.equal(signup.triggerSource, 'PostConfirmation_ConfirmSignUp');
  assert.equal(other.triggerSource, 'PreTokenGeneration_Authentication');
  assert.equal(store.calls.filter(({ operation }) => operation === 'advanceAuthBoundary').length, 0);
  assert.equal((await store.getAccount(makeIdentity())).epoch, 0);
});

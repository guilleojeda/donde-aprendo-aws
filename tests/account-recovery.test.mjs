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

test('auth_time before or equal to the reset boundary is rejected', async () => {
  const boundary = Math.floor(Date.now() / 1000) * 1000;
  for (const [name, authTime] of [
    ['before', Math.floor(boundary / 1000) - 1],
    ['equal', Math.floor(boundary / 1000)],
  ]) {
    const store = createAccountStore();
    store.seedAccount(makeAccount({ epoch: 1, authValidAfter: boundary }));
    const harness = await createAccountHarness({
      store,
      now: () => boundary + 2_000,
      oidc: { claims: { auth_time: authTime } },
    });
    const login = await startLogin(harness);
    const response = await harness.auth.handle(callbackRequest(login));
    assertSafeFailureRedirect(response, 'acceso-invalido');
    assert.equal(store.sessions.size, 0, name);
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

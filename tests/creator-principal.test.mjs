import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { completeLogin, createAccountHarness, makeIdentity, identityKey, sessionRequest } from './fixtures/account-auth.mjs';

test('creator principal uses validated identity and private permission without widening the account projection', async () => {
  const harness = await createAccountHarness();
  const { sessionCookie } = await completeLogin(harness);
  const request = sessionRequest(sessionCookie);
  const principal = await harness.auth.getPrincipal(request);
  const expectedId = createHash('sha256').update(identityKey(makeIdentity())).digest('base64url');
  assert.equal(principal.state, 'authenticated');
  assert.equal(principal.accountId, expectedId);
  assert.equal(principal.isAdmin, false);
  assert.ok(principal.csrfToken);
  const publicSession = await harness.auth.getSession(request);
  assert.equal(Object.hasOwn(publicSession, 'accountId'), false);
  assert.equal(Object.hasOwn(publicSession, 'isAdmin'), false);
  assert.equal(Object.hasOwn(principal, 'email'), false);
  const privateAccount = harness.store.accounts.get(identityKey(makeIdentity()));
  privateAccount.isAdmin = 'true';
  assert.equal((await harness.auth.getPrincipal(request)).isAdmin, false);
  privateAccount.isAdmin = true;
  assert.equal((await harness.auth.getPrincipal(request)).isAdmin, true);
});

test('creator authorization shares session invalidation and account failure behavior', async () => {
  const harness = await createAccountHarness();
  assert.deepEqual(await harness.auth.getPrincipal(sessionRequest()), { state: 'anonymous' });
  const { sessionCookie } = await completeLogin(harness);
  const request = sessionRequest(sessionCookie);
  harness.store.failNext('getAccount');
  assert.deepEqual(await harness.auth.getPrincipal(request), { state: 'unavailable' });
  const account = harness.store.accounts.get(identityKey(makeIdentity()));
  account.active = false;
  assert.deepEqual(await harness.auth.getPrincipal(request), { state: 'disabled' });
  account.active = true;
  account.epoch += 1;
  assert.deepEqual(await harness.auth.getPrincipal(request), { state: 'anonymous' });
});

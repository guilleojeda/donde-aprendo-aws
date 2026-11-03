import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creatorPageSessionBinding } from '../src/lib/creator-session-context.mjs';
import { SITE_ORIGIN } from './fixtures/creator-pages.mjs';
import { createCreatorOwnerRuntime } from './fixtures/creator-owner-runtime.mjs';

test('la lectura owner conserva compatibilidad y liga la respuesta a cuenta y rol cuando se envía el binding', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  runtime.setSession('creator-b');
  runtime.setSession('same-account-admin', {
    principal: {
      state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-role', isAdmin: true,
    },
  });

  const created = await runtime.fetchApi('/api/creador/perfil/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-a', origin: SITE_ORIGIN },
    body: JSON.stringify({ displayName: 'Ana', slug: 'ana-binding', programs: [], socials: {} }),
  }, { session: 'creator-a' });
  assert.equal(created.status, 200);
  const profile = (await created.json()).profile;
  const originalBinding = creatorPageSessionBinding({ accountId: 'private-account-a', isAdmin: false });

  async function read(session, binding) {
    const response = await runtime.fetchApi('/api/creador/perfil/', {
      method: 'GET',
      headers: binding ? { 'x-creator-page-binding': binding } : {},
    }, { session });
    return { response, payload: await response.json() };
  }

  const legacy = await read('creator-a');
  assert.equal(legacy.response.status, 200, 'GETs without the optional marker retain their existing behavior');
  assert.equal(legacy.payload.profile.id, profile.id);

  const malformed = await read('creator-a', 'invalid');
  assert.equal(malformed.response.status, 422);
  assert.deepEqual(malformed.payload, { error: 'INVALID_CONTEXT', message: 'creator page context is invalid' });

  const changedAccount = await read('creator-b', originalBinding);
  assert.equal(changedAccount.response.status, 409);
  assert.equal(changedAccount.payload.error, 'SESSION_CONTEXT_CHANGED');
  assert.equal(Object.hasOwn(changedAccount.payload, 'profile'), false,
    'a changed account receives no owner data');

  const changedRole = await read('same-account-admin', originalBinding);
  assert.equal(changedRole.response.status, 409, 'the opaque binding includes the original role');
  assert.equal(Object.hasOwn(changedRole.payload, 'profile'), false,
    'a changed role receives no owner data');

  const sameContext = await read('creator-a', originalBinding);
  assert.equal(sameContext.response.status, 200);
  assert.equal(sameContext.payload.profile.id, profile.id);
});

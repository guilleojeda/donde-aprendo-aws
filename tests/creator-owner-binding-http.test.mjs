import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creatorPageSessionBinding } from '../src/lib/creator-session-context.mjs';
import { createCreatorHttpHandler } from '../src/lib/creator-http.mjs';
import { requestContextForTestPrincipal, SITE_ORIGIN } from './fixtures/creator-pages.mjs';
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

test('disabled owner identities are compared against the page binding before owner routes reach storage', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const created = await runtime.fetchApi('/api/creador/perfil/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-a', origin: SITE_ORIGIN },
    body: JSON.stringify({ displayName: 'Ana disabled-bound', slug: 'ana-disabled-bound' }),
  }, { session: 'creator-a' });
  assert.equal(created.status, 200);
  const profile = (await created.json()).profile;
  const originalBinding = creatorPageSessionBinding({ accountId: 'private-account-a', isAdmin: false });
  const storeCallsBefore = runtime.pages.store.calls.length;

  runtime.setSession('disabled-other', { principal: { state: 'disabled', accountId: 'private-account-b', isAdmin: false } });
  const changedRead = await runtime.fetchApi('/api/creador/perfil/', {
    headers: { 'x-creator-page-binding': originalBinding },
  }, { session: 'disabled-other' });
  assert.equal(changedRead.status, 409);
  assert.equal((await changedRead.json()).error, 'SESSION_CONTEXT_CHANGED');

  const changedWrite = await runtime.fetchApi('/api/creador/perfil/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-creator-page-binding': originalBinding },
    body: JSON.stringify({ displayName: 'No cross-account write', slug: profile.slug, version: profile.version }),
  }, { session: 'disabled-other' });
  assert.equal(changedWrite.status, 409);
  assert.equal((await changedWrite.json()).error, 'SESSION_CONTEXT_CHANGED');
  assert.equal(runtime.pages.store.calls.length, storeCallsBefore, 'the different disabled identity never reaches owner storage');

  runtime.setSession('disabled-same', { principal: { state: 'disabled', accountId: 'private-account-a', isAdmin: false } });
  const matchingRead = await runtime.fetchApi('/api/creador/perfil/', {
    headers: { 'x-creator-page-binding': originalBinding },
  }, { session: 'disabled-same' });
  assert.equal(matchingRead.status, 403);
  assert.equal((await matchingRead.json()).error, 'ACCOUNT_DISABLED');
  const matchingWrite = await runtime.fetchApi('/api/creador/perfil/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-creator-page-binding': originalBinding },
    body: JSON.stringify({ displayName: 'No disabled write', slug: profile.slug, version: profile.version }),
  }, { session: 'disabled-same' });
  assert.equal(matchingWrite.status, 403);
  assert.equal((await matchingWrite.json()).error, 'ACCOUNT_DISABLED');
  assert.equal(runtime.pages.store.calls.length, storeCallsBefore, 'the matching disabled identity also stops before owner storage');
  runtime.setSession('creator-a');
  const persisted = await runtime.fetchApi('/api/creador/perfil/', {}, { session: 'creator-a' });
  assert.equal((await persisted.json()).profile.displayName, 'Ana disabled-bound');
});

test('las escrituras owner comparan el binding de cuenta y rol antes de consultar o mutar el perfil', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  runtime.setSession('admin');

  const created = await runtime.fetchApi('/api/creador/perfil/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-a', origin: SITE_ORIGIN },
    body: JSON.stringify({ displayName: 'Ana original', slug: 'ana-binding-write' }),
  }, { session: 'creator-a' });
  assert.equal(created.status, 200, 'legacy callers without the optional binding remain compatible');
  const profile = (await created.json()).profile;
  const originalBinding = creatorPageSessionBinding({ accountId: 'private-account-a', isAdmin: false });
  const principal = { state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-a', isAdmin: true };
  runtime.setSession('creator-a', { principal });

  const storeCallCount = runtime.pages.store.calls.length;
  const changedRole = await runtime.fetchApi('/api/creador/perfil/', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json', 'x-csrf-token': 'csrf-a', origin: SITE_ORIGIN,
      'x-creator-page-binding': originalBinding,
    },
    body: JSON.stringify({ displayName: 'No debe guardarse', slug: profile.slug, version: profile.version }),
  }, { session: 'creator-a' });
  assert.equal(changedRole.status, 409);
  assert.equal((await changedRole.json()).error, 'SESSION_CONTEXT_CHANGED');
  assert.equal(runtime.pages.store.calls.length, storeCallCount,
    'a changed role is rejected before any owner read or write');

  runtime.setSession('creator-a', { principal: { ...principal, isAdmin: false } });
  const afterRestoreCalls = runtime.pages.store.calls.length;
  const invalidBinding = await runtime.fetchApi('/api/creador/perfil/', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json', 'x-csrf-token': 'csrf-a', origin: SITE_ORIGIN,
      'x-creator-page-binding': 'not-a-binding',
    },
    body: JSON.stringify({ displayName: 'No debe guardarse', slug: profile.slug, version: profile.version }),
  }, { session: 'creator-a' });
  assert.equal(invalidBinding.status, 422);
  assert.equal((await invalidBinding.json()).error, 'INVALID_CONTEXT');
  assert.equal(runtime.pages.store.calls.length, afterRestoreCalls,
    'a malformed binding is rejected before any owner read or write');

  const legacyAdmin = await runtime.fetchApi('/api/admin/recursos/', {}, { session: 'admin' });
  assert.equal(legacyAdmin.status, 200, 'the separate admin permission boundary keeps its existing no-binding behavior');

  const unchanged = await runtime.pages.store.get(`profile:${profile.id}`);
  assert.equal(unchanged.displayName, 'Ana original');
  assert.equal(unchanged.version, profile.version);
});

test('autorizar y finalizar fotos validan el binding antes de leer el perfil o invocar el servicio', async () => {
  const calls = { profile: 0, authorize: 0, finalize: 0 };
  const state = {
    principal: { state: 'authenticated', accountId: 'private-photo-owner', csrfToken: 'photo-csrf', isAdmin: false },
  };
  const handle = createCreatorHttpHandler({
    origin: SITE_ORIGIN,
    auth: { getRequestContext: async () => requestContextForTestPrincipal(state.principal) },
    service: { handle: async () => new Response('service') },
    store: { get: async () => { calls.profile += 1; return { profileId: 'profile-photo-owner' }; } },
    photos: {
      beginUpload: async () => { calls.authorize += 1; return { uploadId: 'upload-photo' }; },
      finalizeUpload: async () => { calls.finalize += 1; return { photo: { version: 'upload-photo' } }; },
    },
  });
  const originalBinding = creatorPageSessionBinding(state.principal);
  const request = (path, binding = originalBinding, body = { version: 1, uploadId: 'upload-photo' }) => {
    const headers = new Headers({
      origin: SITE_ORIGIN, 'x-csrf-token': state.principal.csrfToken ?? 'disabled-no-token', 'content-type': 'application/json',
    });
    if (binding !== null) headers.set('x-creator-page-binding', binding);
    return new Request(new URL(path, SITE_ORIGIN), { method: 'POST', headers, body: JSON.stringify(body) });
  };

  state.principal = { ...state.principal, isAdmin: true };
  for (const [path, body] of [
    ['/api/creador/foto/autorizar/', { version: 1 }],
    ['/api/creador/foto/finalizar/', { version: 1, uploadId: 'upload-photo' }],
  ]) {
    const rejected = await handle(request(path, originalBinding, body));
    assert.equal(rejected.status, 409);
    assert.deepEqual(await rejected.json(), { error: 'SESSION_CONTEXT_CHANGED' });
  }
  assert.deepEqual(calls, { profile: 0, authorize: 0, finalize: 0 },
    'a same-account role change has no profile read, upload authorization, or finalization');

  state.principal = { ...state.principal, isAdmin: false };
  for (const [path, body] of [
    ['/api/creador/foto/autorizar/', { version: 1 }],
    ['/api/creador/foto/finalizar/', { version: 1, uploadId: 'upload-photo' }],
  ]) {
    const rejected = await handle(request(path, 'invalid-binding', body));
    assert.equal(rejected.status, 422);
    assert.deepEqual(await rejected.json(), { error: 'INVALID_CONTEXT' });
  }
  assert.deepEqual(calls, { profile: 0, authorize: 0, finalize: 0 },
    'a malformed binding has no photo-side effects');

  const legacyAuthorization = await handle(request('/api/creador/foto/autorizar/', null, { version: 1 }));
  assert.equal(legacyAuthorization.status, 200, 'legacy callers without a binding remain compatible');
  const legacyFinalization = await handle(request('/api/creador/foto/finalizar/', null));
  assert.equal(legacyFinalization.status, 200);
  assert.deepEqual(calls, { profile: 2, authorize: 1, finalize: 1 });

  const beforeDisabled = { ...calls };
  state.principal = { state: 'disabled', accountId: 'private-other-photo-owner', isAdmin: false };
  for (const [path, body] of [
    ['/api/creador/foto/autorizar/', { version: 1 }],
    ['/api/creador/foto/finalizar/', { version: 1, uploadId: 'upload-photo' }],
  ]) {
    const changedAccount = await handle(request(path, originalBinding, body));
    assert.equal(changedAccount.status, 409);
    assert.deepEqual(await changedAccount.json(), { error: 'SESSION_CONTEXT_CHANGED' });
  }
  state.principal = { state: 'disabled', accountId: 'private-photo-owner', isAdmin: false };
  for (const [path, body] of [
    ['/api/creador/foto/autorizar/', { version: 1 }],
    ['/api/creador/foto/finalizar/', { version: 1, uploadId: 'upload-photo' }],
  ]) {
    const matchingAccount = await handle(request(path, originalBinding, body));
    assert.equal(matchingAccount.status, 403);
    assert.deepEqual(await matchingAccount.json(), { error: 'ACCOUNT_DISABLED' });
  }
  assert.deepEqual(calls, beforeDisabled, 'disabled identities never read the owner or reach photo services');
});

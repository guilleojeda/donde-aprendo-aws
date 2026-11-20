import test from 'node:test';
import assert from 'node:assert/strict';
import { requestContextForTestPrincipal } from './fixtures/creator-pages.mjs';
import { createCreatorHttpHandler, creatorPhotoResponse } from '../src/lib/creator-http.mjs';

const origin = 'https://dondeaprendoaws.com';
function fixture() {
  const calls = [];
  const storeCalls = [];
  const state = { principal: { state: 'authenticated', accountId: 'private-account', csrfToken: 'csrf' } };
  const handle = createCreatorHttpHandler({
    origin,
    auth: { getRequestContext: async () => requestContextForTestPrincipal(state.principal) },
    store: { get: async (key) => { storeCalls.push(key); assert.equal(key, 'account-profile:private-account'); return { profileId: 'own-profile' }; } },
    service: { handle: async () => new Response('domain') },
    photos: {
      beginUpload: async (input) => { calls.push(input); return { uploadId: 'upload', post: { url: 'https://photos.example.invalid/', fields: { key: 'photos/tmp/own-profile/upload' } } }; },
      finalizeUpload: async (input) => { calls.push(input); return { photo: { version: 'upload', url: '/media/fotos/own-profile/upload.webp' }, creatorVersion: 5 }; },
    },
  });
  const request = (path, body, headers = {}) => {
    const requestHeaders = { origin, 'x-csrf-token': 'csrf', 'content-type': 'application/json', 'x-creator-contract': '2', ...headers };
    if (headers['x-creator-contract'] === null) delete requestHeaders['x-creator-contract'];
    return new Request(`${origin}${path}`, { method: 'POST', headers: requestHeaders, body: JSON.stringify(body) });
  };
  return { handle, calls, storeCalls, state, request };
}

test('photo HTTP resolves profile from the validated private principal and returns exact v2 acknowledgements', async () => {
  const f = fixture();
  const authorized = await f.handle(f.request('/api/creador/foto/autorizar/', { creatorVersion: 4 }));
  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), {
    schemaVersion: 2,
    operation: 'authorize-photo',
    profileId: 'own-profile',
    uploadId: 'upload',
    post: { url: 'https://photos.example.invalid/', fields: { key: 'photos/tmp/own-profile/upload' } },
  });
  const finalized = await f.handle(f.request('/api/creador/foto/finalizar/', { creatorVersion: 4, uploadId: 'upload' }));
  assert.equal(finalized.status, 200);
  assert.deepEqual(await finalized.json(), {
    schemaVersion: 2,
    operation: 'finalize-photo',
    profileId: 'own-profile',
    uploadId: 'upload',
    creatorVersion: 5,
    photo: { version: 'upload', url: '/media/fotos/own-profile/upload.webp' },
    disposition: 'finalized',
  });
  assert.deepEqual(f.calls, [
    { profileId: 'own-profile', expectedVersion: 4 },
    { profileId: 'own-profile', expectedVersion: 4, uploadId: 'upload' },
  ]);
  assert.deepEqual(f.storeCalls, ['account-profile:private-account', 'account-profile:private-account']);
  assert.equal((await f.handle(f.request('/api/creador/foto/autorizar/', { creatorVersion: 4, profileId: 'victim' }))).status, 422);
  assert.equal(f.calls.length, 2);
});

test('photo contract gating follows session/origin/binding checks and precedes body parsing and owner lookup', async () => {
  const f = fixture();
  const obsolete = await f.handle(f.request('/api/creador/foto/autorizar/', { version: 4 }, { 'x-creator-contract': null }));
  assert.equal(obsolete.status, 409);
  assert.deepEqual(await obsolete.json(), { error: 'CREATOR_CONTRACT_OBSOLETE' });
  const malformedObsolete = await f.handle(new Request(`${origin}/api/creador/foto/autorizar/`, {
    method: 'POST',
    headers: { origin, 'x-csrf-token': 'csrf', 'content-type': 'application/json' },
    body: '{',
  }));
  assert.equal(malformedObsolete.status, 409, 'the old contract is rejected before malformed JSON is parsed');
  assert.deepEqual(f.storeCalls, []);
  assert.deepEqual(f.calls, []);

  f.state.principal = { state: 'anonymous' };
  assert.equal((await f.handle(f.request('/api/creador/foto/autorizar/', { creatorVersion: 4 }, { 'x-creator-contract': null }))).status, 401);
  f.state.principal = { state: 'authenticated', accountId: 'private-account', csrfToken: 'csrf' };
  assert.equal((await f.handle(f.request('/api/creador/foto/autorizar/', { creatorVersion: 4 }, { origin: 'https://foreign.example', 'x-creator-contract': null }))).status, 403);
  assert.deepEqual(f.storeCalls, []);
  assert.deepEqual(f.calls, []);
});

test('photo HTTP rejects unauthenticated, disabled, unavailable and cross-origin requests before storage', async () => {
  const f = fixture();
  for (const [state, status] of [['anonymous', 401], ['disabled', 403], ['unavailable', 503]]) {
    f.state.principal = { state };
    const response = await f.handle(f.request('/api/creador/foto/autorizar/', { creatorVersion: 1 }));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  f.state.principal = { state: 'authenticated', accountId: 'private-account', csrfToken: 'csrf' };
  assert.equal((await f.handle(f.request('/api/creador/foto/autorizar/', { creatorVersion: 1 }, { origin: 'https://foreign.example' }))).status, 403);
  assert.equal((await f.handle(f.request('/api/creador/foto/autorizar/', { creatorVersion: 1 }, { 'x-csrf-token': 'wrong' }))).status, 403);
  assert.deepEqual(f.calls, []);
});

test('photo HTTP limits request bodies and preserves service and media failure status', async () => {
  const f = fixture();
  assert.equal((await f.handle(f.request('/api/creador/foto/autorizar/', { creatorVersion: 1, extra: 'x'.repeat(5000) }))).status, 422);
  assert.equal(await (await f.handle(new Request(`${origin}/api/creador/perfil/`))).text(), 'domain');
  const request = new Request(`${origin}/media/fotos/p/v.webp`);
  const anonymous = { getRequestContext: async () => ({ principal: { state: 'anonymous' } }) };
  assert.equal((await creatorPhotoResponse({ readPhoto: async () => null }, 'p', 'v', { request, auth: anonymous })).status, 404);
  assert.equal((await creatorPhotoResponse({ readPhoto: async () => { throw new Error('S3 unavailable'); } }, 'p', 'v', { request, auth: anonymous })).status, 503);
  let authCalls = 0;
  const photo = await creatorPhotoResponse({
    readPhoto: async () => ({ body: Buffer.from([1, 2]), contentType: 'image/webp', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }),
  }, 'p', 'v', {
    request,
    auth: { getRequestContext: async () => { authCalls += 1; return { principal: { state: 'anonymous' } }; } },
  });
  assert.equal(photo.headers.get('content-type'), 'image/webp');
  assert.equal(photo.headers.get('cache-control'), 'private, no-store');
  assert.equal(authCalls, 0, 'a visible public photo does not resolve a session');
  assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), new Uint8Array([1, 2]));
});

test('private photo reads authenticate only after the public current-photo check and never cache bytes', async () => {
  const calls = [];
  const request = new Request(`${origin}/media/fotos/draft-profile/draft-v1.webp`);
  const response = await creatorPhotoResponse({
    readPhoto: async (input) => {
      calls.push(input);
      return input.access === 'owner'
        ? { body: Buffer.from([3, 4]), contentType: 'image/webp', headers: { 'Cache-Control': 'public, immutable' } }
        : null;
    },
  }, 'draft-profile', 'draft-v1', {
    request,
    auth: { getRequestContext: async () => ({ principal: { state: 'authenticated', accountId: 'owner-account' } }) },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(calls, [
    { profileId: 'draft-profile', version: 'draft-v1', access: 'public' },
    { profileId: 'draft-profile', version: 'draft-v1', access: 'owner', accountId: 'owner-account' },
  ]);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([3, 4]));
});

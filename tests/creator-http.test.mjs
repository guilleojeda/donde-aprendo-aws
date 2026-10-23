import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreatorHttpHandler, creatorPhotoResponse } from '../src/lib/creator-http.mjs';

const origin = 'https://dondeaprendoaws.com';
function fixture() {
  const calls = [];
  const state = { principal: { state: 'authenticated', accountId: 'private-account', csrfToken: 'csrf' } };
  const handle = createCreatorHttpHandler({
    origin,
    auth: { getPrincipal: async () => state.principal },
    store: { get: async (key) => { assert.equal(key, 'account-profile:private-account'); return { profileId: 'own-profile' }; } },
    service: { handle: async () => new Response('domain') },
    photos: {
      beginUpload: async (input) => { calls.push(input); return { uploadId: 'upload' }; },
      finalizeUpload: async (input) => { calls.push(input); return { photo: { version: 'upload' } }; },
    },
  });
  const request = (body, headers = {}) => new Request(`${origin}/api/creador/foto/autorizar/`, {
    method: 'POST', headers: { origin, 'x-csrf-token': 'csrf', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  return { handle, calls, state, request };
}

test('photo HTTP resolves profile from the validated private principal, never from client fields', async () => {
  const f = fixture();
  assert.equal((await f.handle(f.request({ version: 4 }))).status, 200);
  assert.deepEqual(f.calls, [{ profileId: 'own-profile', expectedVersion: 4 }]);
  assert.equal((await f.handle(f.request({ version: 4, profileId: 'victim' }))).status, 422);
  assert.equal(f.calls.length, 1);
});

test('photo HTTP rejects unauthenticated, disabled, unavailable and cross-origin requests before storage', async () => {
  const f = fixture();
  for (const [state, status] of [['anonymous', 401], ['disabled', 403], ['unavailable', 503]]) {
    f.state.principal = { state };
    const response = await f.handle(f.request({ version: 1 }));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  f.state.principal = { state: 'authenticated', accountId: 'private-account', csrfToken: 'csrf' };
  assert.equal((await f.handle(f.request({ version: 1 }, { origin: 'https://foreign.example' }))).status, 403);
  assert.equal((await f.handle(f.request({ version: 1 }, { 'x-csrf-token': 'wrong' }))).status, 403);
  assert.deepEqual(f.calls, []);
});

test('photo HTTP limits request bodies and preserves service and media failure status', async () => {
  const f = fixture();
  assert.equal((await f.handle(f.request({ version: 1, extra: 'x'.repeat(5000) }))).status, 422);
  assert.equal(await (await f.handle(new Request(`${origin}/api/creador/perfil/`))).text(), 'domain');
  assert.equal((await creatorPhotoResponse({ readPhoto: async () => null }, 'p', 'v')).status, 404);
  assert.equal((await creatorPhotoResponse({ readPhoto: async () => { throw new Error('S3 unavailable'); } }, 'p', 'v')).status, 503);
  const photo = await creatorPhotoResponse({ readPhoto: async () => ({ body: Buffer.from([1, 2]), contentType: 'image/webp', headers: { 'cache-control': 'public, max-age=31536000, immutable' } }) }, 'p', 'v');
  assert.equal(photo.headers.get('content-type'), 'image/webp');
  assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), new Uint8Array([1, 2]));
});

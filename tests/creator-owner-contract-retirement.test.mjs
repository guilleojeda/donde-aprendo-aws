import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  apiRequest, callApi, createCreatorPagesHarness, requestContextForTestPrincipal,
  seedResource, sessionCsrf,
} from './fixtures/creator-pages.mjs';
import { createPhotoObjects, rasterPhotoFixtures } from './fixtures/creator-photos.mjs';
import { createCreatorPhotoService } from '../src/lib/creator-photos.mjs';
import { createCreatorHttpHandler } from '../src/lib/creator-http.mjs';

const profileId = 'old-document-profile';
const accountId = 'private-account-a';
const principal = { state: 'authenticated', accountId, csrfToken: sessionCsrf['creator-a'], isAdmin: false };

// These are deliberately old, valid prerequisites. Compatibility must be
// rejected at the HTTP boundary, before an old document can authorize a new
// upload or write any domain data. No legacy runtime fallback is required.
async function legacyPrerequisites() {
  const harness = await createCreatorPagesHarness();
  await harness.store.transact({
    checks: [],
    puts: [
      { key: `account-profile:${accountId}`, value: { recordType: 'accountProfile', profileId, version: 1 } },
      { key: `profile:${profileId}`, value: {
        recordType: 'profile', id: profileId, version: 1, displayName: 'Old document', slug: 'old-document',
        programs: [], socials: {}, published: false, hidden: false,
        createdAt: Date.UTC(2026, 10, 14), updatedAt: Date.UTC(2026, 10, 14),
      } },
    ],
  });
  return harness;
}

function writes(store) {
  return store.calls.filter(({ operation }) => operation === 'transact').length;
}

async function assertObsolete(response) {
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'CREATOR_CONTRACT_OBSOLETE');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
}

for (const header of [undefined, '1']) {
  test(`initial creation from an obsolete document (${header ?? 'missing'} contract) cannot bypass the cutover with an omitted version`, async () => {
    const harness = await createCreatorPagesHarness();
    const before = writes(harness.store);
    const response = await callApi(harness, '/api/creador/perfil', {
      session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'PUT',
      extraHeaders: header ? { 'x-creator-contract': header } : {},
      body: { displayName: 'Old attempted creation', slug: 'old-attempt' },
    });
    await assertObsolete(response);
    assert.equal(writes(harness.store), before);
    assert.equal(await harness.store.get(`account-profile:${accountId}`), null);
  });
}

test('independent claim submission from an obsolete document cannot create a claim or reference', async () => {
  const harness = await legacyPrerequisites();
  await seedResource(harness.store, {
    id: 'claim-target', title: 'Claim target', url: 'https://example.com/claim',
    kind: 'content', published: true, hidden: false, version: 3,
  });
  const before = writes(harness.store);
  const response = await callApi(harness, '/api/creador/reclamaciones', {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'POST',
    body: { resources: [{ resourceId: 'claim-target', url: 'https://example.com/claim' }], evidence: 'Old attempted claim' },
  });
  await assertObsolete(response);
  assert.equal(writes(harness.store), before);
  assert.deepEqual(await harness.store.list('claim:'), []);
  assert.deepEqual(await harness.store.list(`claim-ref:${profileId}:`), []);
});

test('resource-only legacy input cannot evade the cutover merely because it uses no creator revision', async () => {
  const harness = await legacyPrerequisites();
  await seedResource(harness.store, {
    id: 'retained-target', title: 'Retained title', url: 'https://example.com/retained',
    kind: 'content', published: false, hidden: false, version: 3,
    directoryControl: 'creator', editorProfileId: profileId,
  });
  const before = writes(harness.store);
  const original = await harness.store.get('resource:retained-target');
  const response = await callApi(harness, '/api/creador/recursos/retained-target', {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'PATCH',
    body: { version: 3, title: 'Must not be applied' },
  });
  await assertObsolete(response);
  assert.equal(writes(harness.store), before);
  assert.deepEqual(await harness.store.get('resource:retained-target'), original);
});

async function photoPrerequisites() {
  const harness = await legacyPrerequisites();
  const objects = createPhotoObjects();
  let signs = 0;
  const photos = createCreatorPhotoService({
    store: harness.store, objects, now: () => Date.UTC(2026, 10, 14), createId: () => 'old-photo-upload',
    signPost: async ({ key }) => {
      signs += 1;
      return { url: 'https://photos.example.invalid/', fields: { key } };
    },
  });
  const handle = createCreatorHttpHandler({
    service: harness.service, photos, store: harness.store, origin: harness.origin,
    auth: { getRequestContext: async () => requestContextForTestPrincipal(principal) },
  });
  return { ...harness, photos, objects, handle, signs: () => signs };
}

test('the separate photo authorization boundary rejects an obsolete document before signing or creating an upload', async () => {
  const harness = await photoPrerequisites();
  const before = writes(harness.store);
  const response = await harness.handle(apiRequest('/api/creador/foto/autorizar', {
    method: 'POST', csrf: principal.csrfToken, body: { version: 1 },
  }));
  await assertObsolete(response);
  assert.equal(harness.signs(), 0);
  assert.equal(writes(harness.store), before);
});

test('the separate photo finalize boundary rejects obsolete input without selecting a photo or completing its pending upload', async () => {
  const harness = await photoPrerequisites();
  // A valid pending record left by pre-cutover authorization is unrelated
  // setup for this HTTP gate. Do not ask the new aggregate-only photo code to
  // authorize an upload against the old profile layout just to arrange it.
  const uploadId = 'old-photo-upload';
  const key = `photos/tmp/${profileId}/${uploadId}`;
  assert.equal(await harness.store.transact({
    checks: [{ key: `photo-upload:${uploadId}`, version: null }],
    puts: [{ key: `photo-upload:${uploadId}`, value: {
      id: uploadId, profileId, key, expectedVersion: 1,
      expiresAt: Date.UTC(2026, 10, 14, 0, 5), state: 'pending', version: 1,
    } }],
  }), true);
  const { jpeg } = await rasterPhotoFixtures();
  harness.objects.seed(key, jpeg);
  const before = writes(harness.store);
  const profile = await harness.store.get(`profile:${profileId}`);
  const pending = await harness.store.get(`photo-upload:${uploadId}`);
  const response = await harness.handle(apiRequest('/api/creador/foto/finalizar', {
    method: 'POST', csrf: principal.csrfToken, body: { version: 1, uploadId },
  }));
  await assertObsolete(response);
  assert.equal(writes(harness.store), before);
  assert.deepEqual(await harness.store.get(`profile:${profileId}`), profile);
  assert.deepEqual(await harness.store.get(`photo-upload:${uploadId}`), pending);
  assert.equal(harness.objects.calls.some(({ operation }) => operation === 'put'), false);
});

test('the cutover discriminator preserves anonymous authentication and wrong-origin rejection', async () => {
  const harness = await createCreatorPagesHarness();
  const before = writes(harness.store);
  const anonymous = await callApi(harness, '/api/creador/perfil', {
    method: 'PUT', body: { displayName: 'Anonymous', slug: 'anonymous' },
  });
  assert.equal(anonymous.status, 401);
  const wrongOrigin = await callApi(harness, '/api/creador/perfil', {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], origin: 'https://wrong.example', method: 'PUT',
    extraHeaders: { 'x-creator-contract': '2' }, body: { creatorVersion: null, displayName: 'Wrong origin', slug: 'wrong-origin' },
  });
  assert.equal(wrongOrigin.status, 403);
  assert.equal(writes(harness.store), before);
});

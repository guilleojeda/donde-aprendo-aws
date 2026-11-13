import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import {
  COGNITO_DOMAIN,
  CLIENT_ID,
  ISSUER,
  createAccountStore,
  makeAccount,
  makeIdentity,
} from './fixtures/account-auth.mjs';
import { createDocumentStore, seedResource } from './fixtures/creator-pages.mjs';
import { createPhotoObjects, rasterPhotoFixtures } from './fixtures/creator-photos.mjs';
import { creatorPageSessionBinding } from '../src/lib/creator-session-context.mjs';

const STATE_KEY = '__creatorRuntimeOriginAcceptance';
const CONFIG_KEYS = [
  'ACCOUNT_ORIGIN', 'COGNITO_ISSUER', 'COGNITO_CLIENT_ID', 'COGNITO_DOMAIN', 'ACCOUNTS_TABLE',
  'CREATOR_PROFILES_TABLE', 'CATALOG_TABLE', 'CREATOR_PHOTOS_BUCKET', 'AWS_REGION',
];

function hash(value) {
  return createHash('sha256').update(value).digest('base64url');
}

function seedSession(accountStore, identity, { isAdmin, tokenByte, csrfByte }) {
  const accountId = hash(JSON.stringify([identity.issuer, identity.sub]));
  const rawToken = Buffer.alloc(32, tokenByte).toString('base64url');
  const csrfToken = Buffer.alloc(32, csrfByte).toString('base64url');
  const now = Date.now();
  accountStore.seedAccount(makeAccount({ identity, isAdmin, epoch: 0, authValidAfter: 0 }));
  accountStore.sessions.set(`SESSION#${hash(rawToken)}`, {
    identity,
    epoch: 0,
    createdAt: now - 1_000,
    expiresAt: now + 7 * 24 * 60 * 60 * 1000,
    csrfToken,
  });
  return {
    accountId,
    csrfToken,
    cookie: `da_session=${rawToken}`,
    sessionKey: `SESSION#${hash(rawToken)}`,
  };
}

function request(origin, path, { method = 'GET', session, csrf, binding, body, requestOrigin = origin } = {}) {
  const headers = new Headers();
  if (session) headers.set('cookie', session.cookie);
  if (requestOrigin !== null) headers.set('origin', requestOrigin);
  if (csrf !== undefined) headers.set('x-csrf-token', csrf);
  if (binding !== undefined) headers.set('x-creator-page-binding', binding);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(new URL(path, origin), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function runtimeTestPlugin() {
  const adapters = new Map([
    ['account-store.mjs', `export function createAccountStore() {
      const store = globalThis[${JSON.stringify(STATE_KEY)}]?.accountStore;
      if (!store) throw new Error('missing account-store test adapter');
      return store;
    }`],
    ['creator-store.mjs', `export function createCreatorStore() {
      const store = globalThis[${JSON.stringify(STATE_KEY)}]?.creatorStore;
      if (!store) throw new Error('missing creator-store test adapter');
      return store;
    }`],
    ['creator-photo-objects.mjs', `export function createCreatorPhotoS3() {
      const objects = globalThis[${JSON.stringify(STATE_KEY)}]?.photoS3;
      if (!objects) throw new Error('missing photo-object test adapter');
      return objects;
    }`],
  ]);

  return {
    name: 'creator-runtime-origin-test-adapters',
    setup(esbuild) {
      esbuild.onResolve({ filter: /(account-store|creator-store|creator-photo-objects)\.mjs$/ }, (args) => {
        const match = [...adapters.keys()].find((filename) => args.path.endsWith(filename));
        return match ? { path: match, namespace: 'creator-runtime-origin-test' } : undefined;
      });
      esbuild.onLoad({ filter: /.*/, namespace: 'creator-runtime-origin-test' }, ({ path }) => ({
        contents: adapters.get(path),
        loader: 'js',
      }));
    },
  };
}

async function compileRuntime(tempDir) {
  const outfile = join(tempDir, 'creator-runtime.mjs');
  await build({
    entryPoints: [resolve('src/lib/creator-runtime.mjs')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    packages: 'external',
    logLevel: 'silent',
    plugins: [runtimeTestPlugin()],
  });
  return pathToFileURL(outfile).href;
}

function setRuntimeEnvironment(accountOrigin) {
  Object.assign(process.env, {
    ACCOUNT_ORIGIN: accountOrigin,
    COGNITO_ISSUER: ISSUER,
    COGNITO_CLIENT_ID: CLIENT_ID,
    COGNITO_DOMAIN,
    ACCOUNTS_TABLE: 'origin-test-accounts',
    CREATOR_PROFILES_TABLE: 'origin-test-profiles',
    CATALOG_TABLE: 'origin-test-catalog',
    CREATOR_PHOTOS_BUCKET: 'origin-test-photos',
    AWS_REGION: 'us-east-1',
  });
}

async function responseJson(response) {
  const payload = await response.json();
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  return payload;
}

test('accepted configured origins reach real account, creator, admin, and photo writes through getCreatorRuntime', async (t) => {
  const previousEnvironment = new Map(CONFIG_KEYS.map((key) => [key, process.env[key]]));
  const previousState = globalThis[STATE_KEY];
  const tempParent = resolve('.work/system-audit-followup/planning/phase3/origin-reset');
  await mkdir(tempParent, { recursive: true });
  const tempDir = await mkdtemp(join(tempParent, 'runtime-origin-'));

  try {
    const runtimeUrl = await compileRuntime(tempDir);
    const acceptedOrigins = [
      { name: 'canonical production origin', configured: 'https://dondeaprendoaws.com', browser: 'https://dondeaprendoaws.com' },
      { name: 'trailing slash', configured: 'https://dondeaprendoaws.com/', browser: 'https://dondeaprendoaws.com' },
      { name: 'hostname case', configured: 'https://DONDEAPRENDOAWS.COM', browser: 'https://dondeaprendoaws.com' },
      { name: 'explicit default port', configured: 'https://dondeaprendoaws.com:443', browser: 'https://dondeaprendoaws.com' },
      { name: 'accepted nondefault port', configured: 'https://preview.example.test:8443', browser: 'https://preview.example.test:8443' },
    ];

    for (const [index, originCase] of acceptedOrigins.entries()) {
      await t.test(originCase.name, async () => {
        setRuntimeEnvironment(originCase.configured);
        const accountStore = createAccountStore();
        const ownerIdentity = makeIdentity({ sub: `origin-owner-${index}` });
        const adminIdentity = makeIdentity({ sub: `origin-admin-${index}` });
        const owner = seedSession(accountStore, ownerIdentity, { isAdmin: false, tokenByte: index + 1, csrfByte: index + 11 });
        const admin = seedSession(accountStore, adminIdentity, { isAdmin: true, tokenByte: index + 21, csrfByte: index + 31 });
        const creatorStore = createDocumentStore();
        const photoObjects = createPhotoObjects();
        const photoS3 = {
          objects: photoObjects,
          signPost: async ({ key }) => ({
            url: 'https://photos.example.invalid/',
            fields: { key, policy: `origin-test-${index}` },
          }),
        };
        globalThis[STATE_KEY] = { accountStore, creatorStore, photoS3 };

        const runtimeModule = await import(`${runtimeUrl}?origin-case=${index}`);
        const runtime = runtimeModule.getCreatorRuntime();
        const ownerPrincipal = await runtime.auth.getPrincipal(new Request(`${originCase.browser}/cuenta/`, {
          headers: { cookie: owner.cookie },
        }));
        const adminPrincipal = await runtime.auth.getPrincipal(new Request(`${originCase.browser}/cuenta/`, {
          headers: { cookie: admin.cookie },
        }));
        assert.equal(ownerPrincipal.state, 'authenticated');
        assert.equal(ownerPrincipal.accountId, owner.accountId);
        assert.equal(ownerPrincipal.isAdmin, false);
        assert.equal(adminPrincipal.state, 'authenticated');
        assert.equal(adminPrincipal.isAdmin, true);

        const binding = creatorPageSessionBinding({ accountId: owner.accountId, isAdmin: false });
        const profileInput = { displayName: 'Origin owner', slug: `origin-owner-${index}` };
        const profileResponse = await runtime.handle(request(originCase.browser, '/api/creador/perfil/', {
          method: 'PUT', session: owner, csrf: owner.csrfToken, binding, body: profileInput,
        }));
        assert.equal(profileResponse.status, 200, `${originCase.name} must authorize the canonical browser origin`);
        const savedProfile = (await responseJson(profileResponse)).profile;
        assert.equal(savedProfile.displayName, profileInput.displayName);
        const ownerMapping = await creatorStore.get(`account-profile:${owner.accountId}`);
        const storedProfile = await creatorStore.get(`profile:${ownerMapping.profileId}`);
        assert.equal(storedProfile.id, savedProfile.id, 'the actual runtime service persists the owner profile');
        const creatorReadCount = creatorStore.calls.length;
        const unchangedProfileUpdate = { ...profileInput, displayName: 'Must remain unchanged', version: savedProfile.version };

        const noSession = await runtime.handle(request(originCase.browser, '/api/creador/perfil/', {
          method: 'PUT', body: unchangedProfileUpdate, csrf: owner.csrfToken, binding,
        }));
        assert.equal(noSession.status, 401, 'an absent session remains unauthorized');
        assert.equal(creatorStore.calls.length, creatorReadCount);

        const wrongOrigin = await runtime.handle(request(originCase.browser, '/api/creador/perfil/', {
          method: 'PUT', session: owner, csrf: owner.csrfToken, binding, body: unchangedProfileUpdate,
          requestOrigin: 'https://foreign.example',
        }));
        assert.equal(wrongOrigin.status, 403);
        assert.equal((await responseJson(wrongOrigin)).error, 'CSRF_REJECTED');
        assert.equal(creatorStore.calls.length, creatorReadCount);

        const wrongCsrf = await runtime.handle(request(originCase.browser, '/api/creador/perfil/', {
          method: 'PUT', session: owner, csrf: 'wrong-csrf', binding, body: unchangedProfileUpdate,
        }));
        assert.equal(wrongCsrf.status, 403);
        assert.equal((await responseJson(wrongCsrf)).error, 'CSRF_REJECTED');
        assert.equal(creatorStore.calls.length, creatorReadCount);

        const badDocumentBinding = await runtime.handle(request(originCase.browser, '/api/creador/perfil/', {
          method: 'PUT', session: owner, csrf: owner.csrfToken, binding: 'invalid-binding', body: unchangedProfileUpdate,
        }));
        assert.equal(badDocumentBinding.status, 422);
        assert.equal((await responseJson(badDocumentBinding)).error, 'INVALID_CONTEXT');
        assert.equal(creatorStore.calls.length, creatorReadCount);

        const changedSessionBinding = creatorPageSessionBinding({ accountId: admin.accountId, isAdmin: true });
        const changedSession = await runtime.handle(request(originCase.browser, '/api/creador/perfil/', {
          method: 'PUT', session: owner, csrf: owner.csrfToken, binding: changedSessionBinding, body: unchangedProfileUpdate,
        }));
        assert.equal(changedSession.status, 409);
        assert.equal((await responseJson(changedSession)).error, 'SESSION_CONTEXT_CHANGED');
        assert.equal(creatorStore.calls.length, creatorReadCount);
        assert.equal((await creatorStore.get(`profile:${savedProfile.id}`)).displayName, profileInput.displayName);

        await seedResource(creatorStore, {
          id: `origin-resource-${index}`,
          title: 'Origin resource',
          url: `https://origin-resource-${index}.example.invalid/`,
          description: 'Admin write acceptance record.',
          category: 'Serverless',
          kind: 'content',
          format: 'Artículo',
          topics: ['Serverless'],
          order: index,
          featured: false,
          published: false,
          approvalRevoked: false,
          directoryApproval: 'pending',
          directoryControl: 'editorial',
          hidden: false,
          version: 1,
        });
        const ownerAdminAttempt = await runtime.handle(request(originCase.browser,
          `/api/admin/recursos/origin-resource-${index}`, {
            method: 'PATCH', session: owner, csrf: owner.csrfToken,
            body: { category: 'Artículo', kind: 'content', format: 'Artículo', topics: ['Serverless'], version: 1 },
          }));
        assert.equal(ownerAdminAttempt.status, 403, 'a valid owner session still cannot use admin writes');
        const resourceAfterOwner = await creatorStore.get(`resource:origin-resource-${index}`);
        assert.equal(resourceAfterOwner.category, 'Serverless');

        const adminWrite = await runtime.handle(request(originCase.browser,
          `/api/admin/recursos/origin-resource-${index}`, {
            method: 'PATCH', session: admin, csrf: admin.csrfToken,
            body: { category: 'Artículo', kind: 'content', format: 'Artículo', topics: ['Serverless'], version: 1 },
          }));
        const adminPayload = await responseJson(adminWrite);
        assert.equal(adminWrite.status, 200,
          `an authenticated administrator can write through the same configured origin: ${JSON.stringify(adminPayload)}`);
        assert.equal(adminPayload.resource.category, 'Artículo');
        assert.equal((await creatorStore.get(`resource:origin-resource-${index}`)).version, 2);

        const photoPath = '/api/creador/foto/autorizar/';
        const photoStoreCallsBefore = creatorStore.calls.length;
        const badPhotoOrigin = await runtime.handle(request(originCase.browser, photoPath, {
          method: 'POST', session: owner, csrf: owner.csrfToken, binding,
          body: { version: storedProfile.version }, requestOrigin: 'https://foreign.example',
        }));
        assert.equal(badPhotoOrigin.status, 403);
        assert.equal((await responseJson(badPhotoOrigin)).error, 'CSRF_REJECTED');
        assert.equal(creatorStore.calls.length, photoStoreCallsBefore, 'photo origin rejection occurs before the owner-profile read');

        const badPhotoCsrf = await runtime.handle(request(originCase.browser, photoPath, {
          method: 'POST', session: owner, csrf: 'wrong-csrf', binding, body: { version: storedProfile.version },
        }));
        assert.equal(badPhotoCsrf.status, 403);
        assert.equal((await responseJson(badPhotoCsrf)).error, 'CSRF_REJECTED');
        assert.equal(creatorStore.calls.length, photoStoreCallsBefore);

        const badPhotoBinding = await runtime.handle(request(originCase.browser, photoPath, {
          method: 'POST', session: owner, csrf: owner.csrfToken, binding: 'invalid-binding',
          body: { version: storedProfile.version },
        }));
        assert.equal(badPhotoBinding.status, 422);
        assert.equal((await responseJson(badPhotoBinding)).error, 'INVALID_CONTEXT');
        assert.equal(creatorStore.calls.length, photoStoreCallsBefore);

        const authorize = await runtime.handle(request(originCase.browser, photoPath, {
          method: 'POST', session: owner, csrf: owner.csrfToken, binding, body: { version: storedProfile.version },
        }));
        assert.equal(authorize.status, 200, 'photo authorization accepts the canonical browser Origin');
        const upload = await responseJson(authorize);
        photoObjects.seed(upload.post.fields.key, (await rasterPhotoFixtures()).jpeg);
        const finalize = await runtime.handle(request(originCase.browser, '/api/creador/foto/finalizar/', {
          method: 'POST', session: owner, csrf: owner.csrfToken, binding,
          body: { version: storedProfile.version, uploadId: upload.uploadId },
        }));
        assert.equal(finalize.status, 200, 'the actual photo service finalizes a valid upload');
        const photoResult = await responseJson(finalize);
        assert.equal(photoResult.photo.version, upload.uploadId);
        assert.ok(photoObjects.calls.some(({ operation }) => operation === 'put'), 'processed photo bytes reach the object store');
        const persistedProfile = await creatorStore.get(`profile:${savedProfile.id}`);
        assert.deepEqual(persistedProfile.photo, photoResult.photo);
        const retrievedPhoto = await runtime.photos.readPhoto({ profileId: savedProfile.id, version: upload.uploadId });
        assert.equal(retrievedPhoto.contentType, 'image/webp');
        assert.ok(retrievedPhoto.body.length > 0, 'a fresh runtime read observes the persisted photo object');

        const logout = await runtime.auth.handle(new Request(`${originCase.browser}/cuenta/salir/`, {
          method: 'POST',
          headers: {
            origin: originCase.browser,
            cookie: owner.cookie,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ csrfToken: owner.csrfToken }),
        }));
        assert.equal(logout.status, 303, 'account logout accepts the same equivalent configured origin');
        const logoutTarget = new URL(logout.headers.get('location'));
        assert.equal(logoutTarget.searchParams.get('logout_uri'), `${originCase.browser}/cuenta/`);
        assert.equal(accountStore.sessions.has(owner.sessionKey), false, 'account logout durably deletes the session');
        const afterLogout = await runtime.handle(request(originCase.browser, '/api/creador/perfil/', {
          method: 'PUT', session: owner, csrf: owner.csrfToken, binding,
          body: { ...profileInput, displayName: 'Must stay unchanged' },
        }));
        assert.equal(afterLogout.status, 401, 'the deleted session cannot make another creator write');
        assert.equal((await creatorStore.get(`profile:${savedProfile.id}`)).displayName, profileInput.displayName);
      });
    }

    for (const [index, invalidOrigin] of [
      'http://preview.example.test',
      'https://preview.example.test/path',
      'https://user:password@preview.example.test',
    ].entries()) {
      await t.test(`invalid runtime origin ${index + 1} is rejected`, async () => {
        setRuntimeEnvironment(invalidOrigin);
        globalThis[STATE_KEY] = {
          accountStore: createAccountStore(),
          creatorStore: createDocumentStore(),
          photoS3: { objects: createPhotoObjects(), signPost: async () => ({}) },
        };
        const runtimeModule = await import(`${runtimeUrl}?invalid-origin=${index}`);
        assert.throws(() => runtimeModule.getCreatorRuntime(), (error) =>
          error instanceof TypeError && /origin/i.test(error.message));
      });
    }
  } finally {
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (previousState === undefined) delete globalThis[STATE_KEY];
    else globalThis[STATE_KEY] = previousState;
    await rm(tempDir, { recursive: true, force: true });
  }
});

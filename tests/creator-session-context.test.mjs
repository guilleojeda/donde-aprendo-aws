import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  creatorPageSessionBinding,
  isCreatorPageSessionBinding,
} from '../src/lib/creator-session-context.mjs';
import { createCreatorHttpHandler } from '../src/lib/creator-http.mjs';

const origin = 'https://dondeaprendoaws.com';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratchParent = path.join(root, '.work/creator-pages');
const tempDir = await mkdtemp(path.join(scratchParent, 'creator-session-context-test-'));
let creatorPageModulePromise;

after(async () => {
  delete globalThis.__creatorSessionContextTestRuntime;
  await rm(tempDir, { recursive: true, force: true });
});

function binding(accountId, isAdmin) {
  return createHash('sha256')
    .update(JSON.stringify(['creator-page-recovery-v1', accountId, isAdmin]))
    .digest('hex');
}

function httpFixture() {
  const calls = { auth: 0, service: 0, store: 0, photo: 0 };
  const state = {
    principal: { state: 'authenticated', accountId: 'account-a', csrfToken: 'csrf-first', isAdmin: false },
    authFailure: undefined,
  };
  const handle = createCreatorHttpHandler({
    origin,
    auth: {
      getPrincipal: async () => {
        calls.auth += 1;
        if (state.authFailure) throw state.authFailure;
        return state.principal;
      },
    },
    store: { get: async () => { calls.store += 1; return null; } },
    service: { handle: async () => { calls.service += 1; return new Response('service'); } },
    photos: {
      beginUpload: async () => { calls.photo += 1; return {}; },
      finalizeUpload: async () => { calls.photo += 1; return {}; },
    },
  });
  const request = (options = {}) => new Request(`${origin}/api/creador/sesion/?periodo=7`, {
    method: options.method ?? 'GET',
    headers: options.headers,
  });
  return { calls, state, handle, request };
}

async function responseBody(response) {
  return response.json();
}

async function loadCreatorPageModule() {
  if (!creatorPageModulePromise) {
    const outputPath = path.join(tempDir, 'creator-page.mjs');
    creatorPageModulePromise = (async () => {
      await build({
        entryPoints: [path.join(root, 'src/pages/cuenta/_creator-page.ts')],
        outfile: outputPath,
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        plugins: [{
          name: 'creator-session-runtime-fixture',
          setup(api) {
            api.onResolve({ filter: /creator-runtime\.mjs$/ }, () => ({ path: 'creator-runtime', namespace: 'creator-session-runtime-fixture' }));
            api.onLoad({ filter: /.*/, namespace: 'creator-session-runtime-fixture' }, () => ({
              contents: 'export function getCreatorRuntime() { return globalThis.__creatorSessionContextTestRuntime; }',
              loader: 'js',
            }));
          },
        }],
      });
      return import(pathToFileURL(outputPath).href);
    })();
  }
  return creatorPageModulePromise;
}

test('session binding is deterministic, role-sensitive and contains no raw account identity', () => {
  const principal = { accountId: 'private-account-id', isAdmin: false };
  const marker = creatorPageSessionBinding(principal);
  assert.equal(marker, binding('private-account-id', false));
  assert.equal(marker.length, 64);
  assert.match(marker, /^[a-f0-9]{64}$/);
  assert.equal(isCreatorPageSessionBinding(marker), true);
  assert.equal(creatorPageSessionBinding({ ...principal, accountId: 'another-account' }) === marker, false);
  assert.equal(creatorPageSessionBinding({ ...principal, isAdmin: true }) === marker, false);
  assert.equal(creatorPageSessionBinding({ accountId: '', isAdmin: false }), undefined);
  assert.equal(creatorPageSessionBinding({ accountId: '   ', isAdmin: false }), undefined);
  assert.equal(creatorPageSessionBinding({ accountId: 'private-account-id', isAdmin: 'false' }), undefined);
  assert.equal(isCreatorPageSessionBinding(`${marker.toUpperCase()}`), false);
  assert.equal(isCreatorPageSessionBinding(`${marker}x`), false);
});

test('session endpoint reads the current principal and returns only a renewed CSRF token for the same account and role', async () => {
  const f = httpFixture();
  const originalBinding = creatorPageSessionBinding(f.state.principal);
  f.state.principal = { ...f.state.principal, csrfToken: 'csrf-renewed' };

  const response = await f.handle(f.request({ headers: { 'x-creator-page-binding': originalBinding } }));
  assert.equal(response.status, 200);
  assert.deepEqual(await responseBody(response), { csrfToken: 'csrf-renewed' });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(f.calls, { auth: 1, service: 0, store: 0, photo: 0 });

  const second = await f.handle(f.request({ headers: { 'x-creator-page-binding': originalBinding } }));
  assert.deepEqual(await responseBody(second), { csrfToken: 'csrf-renewed' });
  assert.equal(f.calls.auth, 2, 'each request must authenticate the current session');
});

test('session endpoint rejects account and role changes without disclosing the new CSRF token', async () => {
  const f = httpFixture();
  const originalBinding = creatorPageSessionBinding(f.state.principal);
  for (const principal of [
    { ...f.state.principal, accountId: 'account-b', csrfToken: 'csrf-account-b' },
    { ...f.state.principal, isAdmin: true, csrfToken: 'csrf-admin' },
  ]) {
    f.state.principal = principal;
    const response = await f.handle(f.request({ headers: { 'x-creator-page-binding': originalBinding } }));
    assert.equal(response.status, 409);
    assert.deepEqual(await responseBody(response), { error: 'SESSION_CONTEXT_CHANGED' });
  }
  assert.equal(f.calls.auth, 2);
  assert.equal(f.calls.service, 0);
  assert.equal(f.calls.store, 0);
});

test('session endpoint maps expired, disabled, unavailable and malformed principals without returning identity or CSRF', async () => {
  const f = httpFixture();
  const marker = creatorPageSessionBinding(f.state.principal);
  const cases = [
    [{ state: 'anonymous' }, 401, 'AUTH_REQUIRED'],
    [{ state: 'disabled' }, 403, 'ACCOUNT_DISABLED'],
    [{ state: 'unavailable' }, 503, 'AUTH_UNAVAILABLE'],
    [{ state: 'authenticated', accountId: 'account-a', csrfToken: '', isAdmin: false }, 503, 'AUTH_UNAVAILABLE'],
    [{ state: 'authenticated', accountId: 'account-a', csrfToken: '  ', isAdmin: false }, 503, 'AUTH_UNAVAILABLE'],
    [{ state: 'authenticated', accountId: 'account-a', csrfToken: 'csrf', isAdmin: 'false' }, 503, 'AUTH_UNAVAILABLE'],
  ];
  for (const [principal, status, error] of cases) {
    f.state.principal = principal;
    const response = await f.handle(f.request({ headers: { 'x-creator-page-binding': marker } }));
    assert.equal(response.status, status);
    assert.deepEqual(await responseBody(response), { error });
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  }
  f.state.authFailure = new Error('private storage failure');
  const failed = await f.handle(f.request({ headers: { 'x-creator-page-binding': marker } }));
  assert.equal(failed.status, 503);
  assert.deepEqual(await responseBody(failed), { error: 'AUTH_UNAVAILABLE' });
});

test('session endpoint validates the marker, method and headers without reaching application state', async () => {
  const f = httpFixture();
  for (const headerValue of [undefined, '', 'not-a-marker', 'A'.repeat(64)]) {
    const response = await f.handle(f.request({
      headers: headerValue === undefined ? {} : { 'x-creator-page-binding': headerValue },
    }));
    assert.equal(response.status, 422);
    assert.deepEqual(await responseBody(response), { error: 'INVALID_CONTEXT' });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  const marker = creatorPageSessionBinding(f.state.principal);
  for (const method of ['POST', 'OPTIONS', 'HEAD']) {
    const response = await f.handle(f.request({ method, headers: { 'x-creator-page-binding': marker } }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET');
    assert.deepEqual(await responseBody(response), { error: 'METHOD_NOT_ALLOWED' });
  }
  assert.deepEqual(f.calls, { auth: 4, service: 0, store: 0, photo: 0 },
    'GETs authenticate before marker validation, while disallowed methods do not access application state');
});

test('SSR loaders expose only the opaque session binding and reject malformed authenticated principals', async () => {
  const page = await loadCreatorPageModule();
  const profileReads = [];
  const state = {
    principal: { state: 'authenticated', accountId: 'private-creator-id', csrfToken: 'page-csrf', isAdmin: false },
  };
  globalThis.__creatorSessionContextTestRuntime = {
    auth: { getPrincipal: async () => state.principal },
    service: {
      handle: async (request) => {
        profileReads.push(new URL(request.url).pathname);
        return Response.json({ profile: null, links: [], editableResources: [], claims: [], series: [] });
      },
    },
  };
  const request = new Request(`${origin}/cuenta/creador/`, { headers: { cookie: 'private-session' } });
  const result = await page.loadCreatorEditor(request);
  assert.equal(result.status, 200);
  assert.equal(result.data.profile, null);
  assert.equal(result.principal.sessionBinding, binding('private-creator-id', false));
  assert.equal(result.principal.csrfToken, 'page-csrf');
  assert.equal(Object.hasOwn(result.principal, 'accountId'), false);
  assert.equal(JSON.stringify(result.principal).includes('private-creator-id'), false);
  assert.deepEqual(profileReads, ['/api/creador/perfil']);

  for (const malformed of [
    { state: 'authenticated', csrfToken: 'csrf', isAdmin: false },
    { state: 'authenticated', accountId: 'private-creator-id', csrfToken: '', isAdmin: false },
    { state: 'authenticated', accountId: 'private-creator-id', csrfToken: ' ', isAdmin: false },
    { state: 'authenticated', accountId: 'private-creator-id', csrfToken: 'csrf', isAdmin: undefined },
  ]) {
    state.principal = malformed;
    const unavailable = await page.loadCreatorEditor(request);
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.principal.state, 'unavailable');
  }
  assert.equal(profileReads.length, 1, 'malformed authenticated principals must not load creator data');
});

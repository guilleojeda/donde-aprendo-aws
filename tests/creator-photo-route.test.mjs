import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { after } from 'node:test';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratchParent = path.join(root, '.work/creator-photo-route');
await mkdir(scratchParent, { recursive: true });
const tempDir = await mkdtemp(path.join(scratchParent, 'route-'));
const runtimeStub = path.join(tempDir, 'creator-runtime.mjs');
const routeBundle = path.join(tempDir, 'photo-route.mjs');
const runtimeSlot = `__creatorPhotoRouteRuntime_${path.basename(tempDir).replaceAll('-', '_')}`;

await writeFile(runtimeStub, `export function getCreatorRuntime() { return globalThis[${JSON.stringify(runtimeSlot)}]; }`);
await build({
  entryPoints: [path.join(root, 'src/pages/media/fotos/[profileId]/[version].webp.ts')],
  outfile: routeBundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  plugins: [{
    name: 'creator-photo-route-runtime',
    setup(api) {
      api.onResolve({ filter: /creator-runtime\.mjs$/ }, () => ({ path: runtimeStub }));
    },
  }],
});
const { GET } = await import(pathToFileURL(routeBundle).href);

after(async () => {
  delete globalThis[runtimeSlot];
  await rm(tempDir, { recursive: true, force: true });
});

const origin = 'https://dondeaprendoaws.com';
const request = new Request(`${origin}/media/fotos/profile/photo-v1.webp`, { headers: { cookie: 'da_session=session' } });

test('the deployed media route uses the public gate before resolving a session', async () => {
  const calls = [];
  let authCalls = 0;
  globalThis[runtimeSlot] = {
    photos: {
      readPhoto: async (input) => {
        calls.push(input);
        return { body: Buffer.from([1, 2]), contentType: 'image/webp', headers: { 'Cache-Control': 'public, immutable' } };
      },
    },
    auth: { getRequestContext: async () => { authCalls += 1; return { principal: { state: 'anonymous' } }; } },
  };

  const response = await GET({ params: { profileId: 'profile', version: 'photo-v1' }, request });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(authCalls, 0);
  assert.deepEqual(calls, [{ profileId: 'profile', version: 'photo-v1', access: 'public' }]);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([1, 2]));
});

test('the deployed media route passes the authenticated account only for owner preview', async () => {
  const calls = [];
  let authCalls = 0;
  globalThis[runtimeSlot] = {
    photos: {
      readPhoto: async (input) => {
        calls.push(input);
        return input.access === 'owner'
          ? { body: Buffer.from([3, 4]), contentType: 'image/webp', headers: { 'cache-control': 'public, immutable' } }
          : null;
      },
    },
    auth: {
      getRequestContext: async (received) => {
        authCalls += 1;
        assert.strictEqual(received, request);
        return { principal: { state: 'authenticated', accountId: 'owner-account' } };
      },
    },
  };

  const response = await GET({ params: { profileId: 'profile', version: 'photo-v1' }, request });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(authCalls, 1);
  assert.deepEqual(calls, [
    { profileId: 'profile', version: 'photo-v1', access: 'public' },
    { profileId: 'profile', version: 'photo-v1', access: 'owner', accountId: 'owner-account' },
  ]);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([3, 4]));
});

test('the deployed media route returns no-store 404 for a private photo without a signed-in owner', async () => {
  globalThis[runtimeSlot] = {
    photos: { readPhoto: async () => null },
    auth: { getRequestContext: async () => ({ principal: { state: 'anonymous' } }) },
  };
  const response = await GET({ params: { profileId: 'profile', version: 'photo-v1' }, request: new Request(request) });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

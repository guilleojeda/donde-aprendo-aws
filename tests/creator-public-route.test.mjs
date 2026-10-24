import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { callApi, createCreatorPagesHarness, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratchParent = path.join(root, '.work/creator-pages');
await mkdir(scratchParent, { recursive: true });
const tempDir = await mkdtemp(path.join(scratchParent, 'creator-route-'));
const routeEntry = path.join(root, 'src/pages/c/[...path].astro');
const runtimeStub = path.join(tempDir, 'creator-runtime-stub.mjs');
const routeBundle = path.join(tempDir, 'creator-route.mjs');
const runtimeSlot = `__creatorRouteRuntime_${path.basename(tempDir).replaceAll('-', '_')}`;

after(async () => {
  delete globalThis[runtimeSlot];
  await rm(tempDir, { recursive: true, force: true });
});

await writeFile(runtimeStub, `export function getCreatorRuntime() { return globalThis[${JSON.stringify(runtimeSlot)}]; }`);
await build({
  entryPoints: [routeEntry],
  outfile: routeBundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  define: {
    'import.meta.env.PUBLIC_SITE_ORIGIN': '"https://dondeaprendoaws.com"',
    'import.meta.env.PUBLIC_PRODUCTION': '"true"',
  },
  plugins: [{
    name: 'creator-public-route-test',
    setup(api) {
      api.onResolve({ filter: /creator-runtime\.mjs$/ }, () => ({ path: runtimeStub }));
      api.onResolve({ filter: /\?raw$/ }, (args) => ({ path: args.path, namespace: 'raw' }));
      api.onLoad({ filter: /\.astro$/ }, async ({ path: filename }) => ({
        contents: transform(await readFile(filename, 'utf8'), {
          filename,
          internalURL: 'astro/compiler-runtime',
          resultScopedSlot: true,
          resolvePath: (specifier) => specifier,
        }).code,
        loader: 'js',
      }));
      api.onLoad({ filter: /.*/, namespace: 'raw' }, () => ({ contents: 'export default "";', loader: 'js' }));
      api.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
    },
  }],
});

const route = (await import(pathToFileURL(routeBundle).href)).default;
const container = await experimental_AstroContainer.create({ astroConfig: { site: 'https://dondeaprendoaws.com' } });

async function render(pathname, service) {
  globalThis[runtimeSlot] = { service };
  return container.renderToResponse(route, {
    request: new Request(`https://dondeaprendoaws.com${pathname}`),
    params: { path: pathname.slice('/c/'.length) },
    partial: false,
  });
}

async function mutate(harness, pathname, method, body) {
  const response = await callApi(harness, pathname, {
    session: 'creator-a',
    csrf: sessionCsrf['creator-a'],
    method,
    body,
  });
  assert.ok(response.ok, `${method} ${pathname} returned ${response.status}`);
  return responseJson(response);
}

test('the Astro creator route rejects unknown old-profile suffixes and preserves valid alias redirects', async () => {
  const harness = await createCreatorPagesHarness();
  const saved = await mutate(harness, '/api/creador/perfil', 'PUT', {
    displayName: 'Creador de prueba',
    slug: 'old-profile',
  });
  const published = await mutate(harness, '/api/creador/perfil/publicar', 'POST', {});
  await mutate(harness, '/api/creador/perfil', 'PUT', {
    slug: 'current-profile',
    version: published.profile.version,
  });
  const link = await mutate(harness, '/api/creador/enlaces', 'POST', {
    title: 'Capítulo',
    url: 'https://example.com/chapter',
  });
  const profile = (await mutate(harness, '/api/creador/perfil', 'GET')).profile;
  const created = await mutate(harness, '/api/creador/series', 'POST', {
    name: 'Serie pública',
    slug: 'old-series',
    profileVersion: profile.version,
  });
  await mutate(harness, `/api/creador/series/${encodeURIComponent(created.series.id)}/capitulos/${encodeURIComponent(link.link.placementId)}`, 'PUT', {
    profileVersion: created.profileVersion,
  });
  const patched = await mutate(harness, `/api/creador/series/${encodeURIComponent(created.series.id)}`, 'PATCH', {
    version: created.series.version,
    profileVersion: (await mutate(harness, '/api/creador/perfil', 'GET')).profile.version,
    slug: 'current-series',
  });
  assert.ok(saved.profile, 'the test creates a real published profile before using the Astro route');
  assert.equal(patched.series.slug, 'current-series');

  const unknown = await render('/c/old-profile/ruta-inexistente/?q=1', harness.service);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.headers.get('location'), null);

  const oldProfile = await render('/c/old-profile/?q=1', harness.service);
  assert.equal(oldProfile.status, 308);
  assert.equal(oldProfile.headers.get('location'), '/c/current-profile/?q=1');

  const oldSeries = await render('/c/old-profile/series/old-series/?q=1', harness.service);
  assert.equal(oldSeries.status, 308);
  assert.equal(oldSeries.headers.get('location'), '/c/current-profile/series/current-series/?q=1');
});

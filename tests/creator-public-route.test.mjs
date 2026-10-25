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

test('public profile fields reject malformed persisted values while omitted optionals and public links remain valid', async () => {
  const harness = await createCreatorPagesHarness();
  const saved = await mutate(harness, '/api/creador/perfil', 'PUT', {
    displayName: 'Creadora pública',
    slug: 'old-profile',
    city: 'Córdoba',
    country: 'Argentina',
    bio: 'Biografía pública',
    programs: ['Heroes'],
    socials: { website: 'https://example.com/newsletter' },
  });
  await mutate(harness, '/api/creador/perfil/publicar', 'POST', {});
  const pending = (await mutate(harness, '/api/creador/enlaces', 'POST', {
    title: 'Capítulo pendiente',
    url: 'https://example.com/pending',
  })).link;
  const deselected = (await mutate(harness, '/api/creador/enlaces', 'POST', {
    title: 'Capítulo desmarcado',
    url: 'https://example.com/deselected',
    selectedForDirectory: false,
  })).link;
  let profile = (await mutate(harness, '/api/creador/perfil', 'GET')).profile;
  const created = await mutate(harness, '/api/creador/series', 'POST', {
    name: 'Serie pública',
    slug: 'old-series',
    profileVersion: profile.version,
  });
  for (const link of [pending, deselected]) {
    profile = (await mutate(harness, '/api/creador/perfil', 'GET')).profile;
    await mutate(harness, `/api/creador/series/${encodeURIComponent(created.series.id)}/capitulos/${encodeURIComponent(link.placementId)}`, 'PUT', {
      profileVersion: profile.version,
    });
  }
  profile = (await mutate(harness, '/api/creador/perfil', 'GET')).profile;
  await mutate(harness, '/api/creador/perfil', 'PUT', { slug: 'current-profile', version: profile.version });
  profile = (await mutate(harness, '/api/creador/perfil', 'GET')).profile;
  await mutate(harness, `/api/creador/series/${encodeURIComponent(created.series.id)}`, 'PATCH', {
    version: created.series.version,
    profileVersion: profile.version,
    slug: 'current-series',
  });
  assert.ok(saved.profile);

  const owner = await harness.store.get('account-profile:private-account-a');
  const profileKey = `profile:${owner.profileId}`;
  const seriesKey = `series:${owner.profileId}:${created.series.id}`;
  const replaceProfile = async (mutateRecord) => {
    const current = await harness.store.get(profileKey);
    const next = mutateRecord(structuredClone(current));
    assert.equal(await harness.store.transact({
      checks: [{ key: profileKey, version: current.version }],
      puts: [{ key: profileKey, value: next }],
    }), true);
  };
  const validProfile = await harness.store.get(profileKey);
  await replaceProfile((record) => {
    for (const field of ['city', 'country', 'bio', 'programs', 'socials', 'photo']) delete record[field];
    return record;
  });

  const publicModel = await harness.service.readPublicProfile('current-profile');
  assert.equal(publicModel.status, 200);
  assert.equal(Object.hasOwn(publicModel.profile, 'city'), false);
  assert.equal(Object.hasOwn(publicModel.profile, 'country'), false);
  assert.equal(Object.hasOwn(publicModel.profile, 'bio'), false);
  assert.equal(Object.hasOwn(publicModel.profile, 'photo'), false);
  assert.deepEqual(publicModel.profile.programs, []);
  assert.deepEqual(publicModel.profile.socials, {});
  assert.equal(publicModel.profile.hidden, false);
  assert.deepEqual(publicModel.links.map(({ title, selectedForDirectory, directoryApproval }) => ({
    title,
    selectedForDirectory,
    directoryApproval,
  })), [
    { title: 'Capítulo pendiente', selectedForDirectory: true, directoryApproval: 'pending' },
    { title: 'Capítulo desmarcado', selectedForDirectory: false, directoryApproval: 'pending' },
  ]);

  await replaceProfile(() => ({ ...validProfile, photo: { version: 7, privateMetadata: 'private' } }));
  const legacyPhotoModel = await harness.service.readPublicProfile('current-profile');
  assert.equal(legacyPhotoModel.status, 200);
  assert.deepEqual(legacyPhotoModel.profile.photo, { version: 7 });
  assert.equal(JSON.stringify(legacyPhotoModel).includes('privateMetadata'), false);
  await replaceProfile(() => ({
    ...validProfile,
    photo: {
      version: 'upload-1',
      url: `/media/fotos/${validProfile.id}/upload-1.webp`,
      privateMetadata: 'private',
    },
  }));
  const currentPhotoModel = await harness.service.readPublicProfile('current-profile');
  assert.equal(currentPhotoModel.status, 200);
  assert.deepEqual(currentPhotoModel.profile.photo, {
    version: 'upload-1',
    url: `/media/fotos/${validProfile.id}/upload-1.webp`,
  });
  assert.equal(JSON.stringify(currentPhotoModel).includes('privateMetadata'), false);
  const currentPhotoPage = await render('/c/current-profile/', harness.service);
  assert.equal(currentPhotoPage.status, 200);
  assert.ok((await currentPhotoPage.text()).includes(`/media/fotos/${validProfile.id}/upload-1.webp`));
  await replaceProfile(() => validProfile);

  for (const [pathname, expectedTitles] of [
    ['/c/current-profile/', ['Capítulo pendiente', 'Capítulo desmarcado']],
    ['/c/current-profile/series/current-series/', ['Capítulo pendiente', 'Capítulo desmarcado']],
  ]) {
    const response = await render(pathname, harness.service);
    const html = await response.text();
    assert.equal(response.status, 200, pathname);
    for (const title of expectedTitles) assert.ok(html.includes(title), `${pathname} must keep ${title} public`);
  }
  const oldProfile = await render('/c/old-profile/?q=uno&ref=dos', harness.service);
  assert.equal(oldProfile.status, 308);
  assert.equal(oldProfile.headers.get('location'), '/c/current-profile/?q=uno&ref=dos');
  const oldSeries = await render('/c/old-profile/series/old-series/?q=uno&ref=dos', harness.service);
  assert.equal(oldSeries.status, 308);
  assert.equal(oldSeries.headers.get('location'), '/c/current-profile/series/current-series/?q=uno&ref=dos');

  const malformedProfiles = [
    { bio: 42 },
    { city: { name: 'Córdoba' } },
    { country: 42 },
    { programs: 'Heroes' },
    { programs: ['Unsupported program'] },
    { socials: 42 },
    { socials: { website: 42 } },
    { socials: { website: 'javascript:alert(1)' } },
    { socials: { unknown: 'https://example.com' } },
    { photo: 42 },
    { photo: { version: {} } },
    { photo: { version: 'bad id' } },
    { photo: { version: 'upload-1', url: 'https://example.com/photo.webp' } },
    { photo: { version: 'upload-1', url: '/media/fotos/other-profile/upload-1.webp' } },
  ];
  for (const patch of malformedProfiles) {
    await replaceProfile(() => ({ ...validProfile, ...patch }));
    const result = await harness.service.readPublicProfile('current-profile');
    assert.equal(result.status, 503, JSON.stringify(patch));
    assert.equal(Object.hasOwn(result, 'profile'), false, JSON.stringify(patch));
    assert.equal((await harness.service.readPublicSeries('current-profile', 'current-series')).status, 503, JSON.stringify(patch));
  }

  const assert503WithoutProfile = async (pathname) => {
    const response = await render(pathname, harness.service);
    const html = await response.text();
    assert.equal(response.status, 503, pathname);
    assert.match(html, /No pudimos cargar esta página/, pathname);
    assert.doesNotMatch(html, /Creadora pública|Capítulo pendiente|Capítulo desmarcado|Serie pública/, pathname);
    assert.doesNotMatch(html, /rel="canonical"/, pathname);
  };
  for (const patch of [{ bio: 42 }, { city: { name: 'Córdoba' } }]) {
    await replaceProfile(() => ({ ...validProfile, ...patch }));
    await assert503WithoutProfile('/c/current-profile/');
    await assert503WithoutProfile('/c/current-profile/series/current-series/');
  }
  await replaceProfile(() => ({ ...validProfile, bio: 42 }));
  await assert503WithoutProfile('/c/old-profile/?q=1');
  await assert503WithoutProfile('/c/old-profile/series/old-series/?q=1');

  await replaceProfile(() => validProfile);
  const storedSeries = await harness.store.get(seriesKey);
  assert.equal(await harness.store.transact({
    checks: [{ key: seriesKey, version: storedSeries.version }],
    puts: [{ key: seriesKey, value: { ...storedSeries, description: 42 } }],
  }), true);
  assert.equal((await harness.service.readPublicProfile('current-profile')).status, 503);
  assert.equal((await harness.service.readPublicSeries('current-profile', 'current-series')).status, 503);
  await assert503WithoutProfile('/c/current-profile/');
  await assert503WithoutProfile('/c/current-profile/series/current-series/');
  assert.equal(await harness.store.transact({
    checks: [{ key: seriesKey, version: storedSeries.version }],
    puts: [{ key: seriesKey, value: storedSeries }],
  }), true);

  const resourceKey = `resource:${pending.resourceId}`;
  const storedResource = await harness.store.get(resourceKey);
  assert.equal((await harness.service.readPublicProfile('current-profile')).status, 200);
  assert.equal((await harness.service.readPublicSeries('current-profile', 'current-series')).status, 200);
  assert.equal((await render('/c/current-profile/', harness.service)).status, 200);
  assert.equal((await render('/c/current-profile/series/current-series/', harness.service)).status, 200);
  assert.equal(await harness.store.transact({
    checks: [{ key: resourceKey, version: storedResource.version }],
    puts: [{ key: resourceKey, value: { ...storedResource, description: 42 } }],
  }), true);
  assert.equal((await harness.service.readPublicProfile('current-profile')).status, 503);
  assert.equal((await harness.service.readPublicSeries('current-profile', 'current-series')).status, 503);
  await assert503WithoutProfile('/c/current-profile/');
  await assert503WithoutProfile('/c/current-profile/series/current-series/');
});

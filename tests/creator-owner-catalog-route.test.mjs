import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';
import { createCreatorOwnerRuntime, SITE_ORIGIN } from './fixtures/creator-owner-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = path.join(root, '.work/creator-owner-experience/planning/phase6/ui');
await mkdir(scratch, { recursive: true });
const tempDir = await mkdtemp(path.join(scratch, 'catalog-ssr-'));
const ownerEntry = path.join(root, 'src/pages/cuenta/index.astro');
const runtimeStateKey = `__creatorOwnerCatalogRoute_${path.basename(tempDir).replaceAll('-', '_')}`;

after(async () => {
  delete globalThis[runtimeStateKey];
  await rm(tempDir, { recursive: true, force: true });
});

await writeFile(path.join(tempDir, 'creator-runtime-stub.mjs'),
  `export function getCreatorRuntime() { return globalThis[${JSON.stringify(runtimeStateKey)}].runtime; }`);
await writeFile(path.join(tempDir, 'account-runtime-stub.mjs'),
  `export function getAccountAuth() { return globalThis[${JSON.stringify(runtimeStateKey)}].runtime.accountAuth; }`);

await build({
  entryPoints: { owner: ownerEntry },
  outdir: tempDir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outExtension: { '.js': '.mjs' },
  define: {
    'import.meta.env.PUBLIC_SITE_ORIGIN': JSON.stringify(SITE_ORIGIN),
    'import.meta.env.PUBLIC_PRODUCTION': '"true"',
  },
  plugins: [{
    name: 'creator-owner-catalog-ssr-runtime',
    setup(api) {
      api.onResolve({ filter: /creator-runtime\.mjs$/ }, () => ({ path: path.join(tempDir, 'creator-runtime-stub.mjs') }));
      api.onResolve({ filter: /account-runtime\.mjs$/ }, () => ({ path: path.join(tempDir, 'account-runtime-stub.mjs') }));
      api.onResolve({ filter: /\?raw$/ }, ({ path: requested, resolveDir }) => ({
        path: path.resolve(resolveDir, requested.slice(0, -4)), namespace: 'raw',
      }));
      api.onLoad({ filter: /.*/, namespace: 'raw' }, () => ({ contents: 'export default "";', loader: 'js' }));
      api.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      api.onLoad({ filter: /\.astro$/ }, async ({ path: filename }) => ({
        contents: transform(await readFile(filename, 'utf8'), {
          filename,
          internalURL: 'astro/compiler-runtime',
          resultScopedSlot: true,
          resolvePath: (specifier) => specifier,
        }).code,
        loader: 'js',
      }));
    },
  }],
});

const ownerRoute = (await import(pathToFileURL(path.join(tempDir, 'owner.mjs')).href)).default;
const container = await experimental_AstroContainer.create({ astroConfig: { site: SITE_ORIGIN } });
let runtime;

async function resetRuntime() {
  runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  runtime.setSession('creator-b');
  runtime.setSession('admin');
  return runtime;
}

async function render({ session = 'creator-a', search = '' } = {}) {
  globalThis[runtimeStateKey] = { runtime };
  const response = await container.renderToResponse(ownerRoute, {
    request: runtime.request('/cuenta/', { session, search }),
    partial: false,
  });
  return { response, html: await response.text() };
}

async function api(pathname, body, { method = 'PUT', session = 'creator-a' } = {}) {
  const csrfToken = session === 'creator-a' ? 'csrf-a' : `csrf-${session}`;
  const response = await runtime.fetchApi(pathname, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, { session });
  const payload = await response.json().catch(() => null);
  assert.ok(response.ok, `${method} ${pathname} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function createProfile({ session = 'creator-a', slug = 'ana-catalogo', published = false } = {}) {
  const created = await api('/api/creador/perfil/', {
    displayName: session === 'creator-a' ? 'Ana de catálogo' : 'Bea de catálogo',
    slug, city: 'Córdoba', country: 'Argentina', bio: 'Página de ejemplo.', programs: [], socials: {},
  }, { session });
  if (!published) return created.profile;
  return (await api('/api/creador/perfil/publicar/', {}, { method: 'POST', session })).profile;
}

async function addLink(title, url, { session = 'creator-a' } = {}) {
  return api('/api/creador/enlaces/', {
    title, url, description: `Descripción de ${title}`, selectedForDirectory: true,
  }, { method: 'POST', session });
}

async function hideProfile(profile) {
  const key = `profile:${profile.id}`;
  const current = await runtime.pages.store.get(key);
  assert.ok(current);
  const changed = await runtime.pages.store.transact({
    checks: [{ key, version: current.version }],
    puts: [{ key, value: { ...current, hidden: true, version: current.version + 1 } }],
  });
  assert.equal(changed, true);
}

function visibleText(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function assertPrivate(response, html) {
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(html, /<meta[^>]+name="robots"[^>]+noindex/i);
}

function assertCatalogSurface(html, text) {
  assert.match(html, /<button\b(?=[^>]*type="button")(?=[^>]*data-catalog-open)/i,
    'the normal owner page opens catalog search without submitting a form');
  const dialog = html.match(/<dialog\b(?=[^>]*data-owner-dialog)[^>]*>/i)?.[0];
  assert.ok(dialog, 'the owner dialog exists in the actual SSR output');
  assert.equal((html.match(/<dialog\b(?=[^>]*data-owner-dialog)/gi) ?? []).length, 1,
    'catalog search is part of the one owner dialog');
  assert.doesNotMatch(dialog, /\bopen(?:\s|=|>)/i, 'the owner dialog starts closed');
  const referenceForm = html.match(/<form\b(?=[^>]*data-owner-form="referencia")[^>]*>/i)?.[0];
  assert.ok(referenceForm,
    'reference selection is a separate contextual form in the shared dialog');
  assert.match(referenceForm, /\bhidden(?:\s|=|>)/i, 'catalog controls stay hidden until opened');
  const referenceFormHtml = html.match(/<form\b(?=[^>]*data-owner-form="referencia")[\s\S]*?<\/form>/i)?.[0];
  assert.ok(referenceFormHtml);
  assert.match(referenceFormHtml, /data-owner-compare/, 'profile-version conflicts reuse the owner comparison control');
  assert.match(referenceFormHtml, /<button\b(?=[^>]*type="button")(?=[^>]*data-owner-compare)/i);
  assert.match(referenceFormHtml, /data-owner-adopt/, 'adopting a compared profile version remains an explicit choice');
  assert.match(referenceFormHtml, /<button\b(?=[^>]*type="button")(?=[^>]*data-owner-adopt)/i);
  assert.match(referenceFormHtml, /<button\b(?=[^>]*type="submit")(?=[^>]*data-catalog-reference)/i,
    'the explicit reference action submits only the current selection');
  assert.match(html, /<[a-z][a-z0-9-]*\b(?=[^>]*data-owner-catalog)(?=[^>]*\bhidden)[^>]*>/i,
    'the lazy catalog surface is present but initially hidden');
  assert.match(html, /<form\b(?=[^>]*data-catalog-search-form)/i, 'catalog search has its own query form');
  assert.match(html, /<input\b(?=[^>]*type="search")(?=[^>]*data-catalog-search)/i,
    'catalog search accepts title and URL queries');
  assert.match(html, /data-catalog-results/, 'SSR includes the results container populated lazily by the controller');
  assert.match(html, /data-catalog-count/, 'SSR provides a result count container');
  assert.match(html, /data-catalog-empty/, 'SSR provides a distinct zero-result state');
  assert.match(html, /<button\b(?=[^>]*type="button")(?=[^>]*data-catalog-page="previous")/i,
    'the previous-page control does not submit either form');
  assert.match(html, /<button\b(?=[^>]*type="button")(?=[^>]*data-catalog-page="next")/i,
    'the next-page control does not submit either form');
  assert.match(html, /data-catalog-page-label/, 'page state has a stable announcement target');
  assert.match(html, /data-catalog-status[^>]*role="status"|role="status"[^>]*data-catalog-status/i);
  assert.match(html, /<button\b(?=[^>]*type="button")(?=[^>]*data-catalog-retry)/i,
    'index failure has an explicit retry control that does not submit reference data');
  assert.match(text, /Buscar en el catálogo|Buscar en catálogo/i);
  const directory = html.match(/<input\b(?=[^>]*data-catalog-directory)(?=[^>]*name="selectedForDirectory")(?=[^>]*type="checkbox")[^>]*>/i)?.[0];
  assert.ok(directory, 'reference has an optional directory checkbox');
  assert.match(directory, /\bchecked(?:\s|=|\/?>)/i, 'directory proposal is enabled by default');
  assert.match(html, /data-link-add-form/, 'normal URL creation remains available next to search');
  assert.doesNotMatch(html, /<input\b[^>]*\bname="(?:resourceId|resourceIds|sourceId)"/i,
    'the creator never enters a resource/source ID');
  assert.doesNotMatch(text, /IDs exactos|source ID|hasta 32\s*KiB|32\s*KiB/i,
    'the creator UI does not expose legacy ID instructions or the request-size ceiling');
}

test('SSR de Tu página con perfil de cero enlaces entrega el diálogo de catálogo sin precargarlo', async () => {
  await resetRuntime();
  await createProfile();
  runtime.serviceCalls.length = 0;

  const { response, html } = await render();
  const text = visibleText(html);
  assert.equal(response.status, 200);
  assertPrivate(response, html);
  assert.match(text, /Tu página/);
  assert.match(text, /Ana de catálogo/);
  assert.match(text, /Todavía no agregaste enlaces/);
  assertCatalogSurface(html, text);
  assert.equal((html.match(/data-catalog-open/g) ?? []).length, 1);
  assert.ok(runtime.serviceCalls.some(({ method, path }) => method === 'GET'
    && path.replace(/\/$/, '') === '/api/creador/perfil'));
  assert.equal(runtime.serviceCalls.some(({ path }) => path.includes('catalog-selection.json')), false,
    'SSR uses the owner DTO and leaves the public index for an explicit client open');
});

test('SSR con 50 enlaces conserva la tabla y el mismo flujo de catálogo en Tu página', async () => {
  await resetRuntime();
  await createProfile({ published: true });
  for (let index = 0; index < 50; index += 1) {
    await addLink(`Guía SSR ${String(index + 1).padStart(2, '0')}`, `https://ssr.example.invalid/guide-${index + 1}`);
  }
  runtime.serviceCalls.length = 0;

  const { response, html } = await render();
  assert.equal(response.status, 200);
  assertPrivate(response, html);
  assert.match(html, /data-links-count="50"/);
  assert.equal((html.match(/data-link-row=/g) ?? []).length, 25,
    'the existing paginated owner table still renders its first page');
  assertCatalogSurface(html, visibleText(html));
  assert.equal((html.match(/data-catalog-open/g) ?? []).length, 1,
    'a full page uses the same single catalog entry and coordinator');
  assert.equal(runtime.serviceCalls.some(({ path }) => path.includes('catalog-selection.json')), false);
});

test('el catálogo sigue disponible para borradores y perfiles ocultos', async (t) => {
  await t.test('draft', async () => {
    await resetRuntime();
    await createProfile({ slug: 'ana-draft' });
    const { response, html } = await render();
    assert.equal(response.status, 200);
    assert.match(visibleText(html), /Borrador/);
    assertCatalogSurface(html, visibleText(html));
  });

  await t.test('hidden profile', async () => {
    await resetRuntime();
    const profile = await createProfile({ slug: 'ana-hidden', published: true });
    await hideProfile(profile);
    const { response, html } = await render();
    assert.equal(response.status, 200);
    assert.match(visibleText(html), /oculta por administración/i);
    assertCatalogSurface(html, visibleText(html));
  });
});

test('SSR anónimo y deshabilitado no muestra acciones del owner ni lee su perfil', async (t) => {
  await resetRuntime();

  await t.test('anonymous', async () => {
    runtime.serviceCalls.length = 0;
    const { response, html } = await render({ session: null });
    assert.equal(response.status, 200);
    assert.match(visibleText(html), /Ingresar|Accede o crea una cuenta/);
    assert.doesNotMatch(html, /data-catalog-open|data-catalog-results|data-owner-form="referencia"/);
    assert.equal(runtime.serviceCalls.some(({ path }) => path.replace(/\/$/, '') === '/api/creador/perfil'), false);
  });

  await t.test('disabled account', async () => {
    runtime.setSession('disabled', { principal: { state: 'disabled' } });
    runtime.serviceCalls.length = 0;
    const { response, html } = await render({ session: 'disabled' });
    assert.equal(response.status, 403);
    assert.doesNotMatch(html, /data-catalog-open|data-catalog-results|data-owner-form="referencia"/);
    assert.equal(runtime.serviceCalls.some(({ path }) => path.replace(/\/$/, '') === '/api/creador/perfil'), false);
  });
});

test('una colocación compartida conserva el acceso de opciones y el catálogo sin revelar inputs de ID', async () => {
  await resetRuntime();
  await createProfile({ session: 'creator-b', slug: 'bea-catalogo' });
  const sharedUrl = 'https://shared.example.invalid/public-resource';
  const createdByB = await addLink('Ficha compartida conservada', sharedUrl, { session: 'creator-b' });
  const sharedResourceId = createdByB.link.resourceId;

  await createProfile({ slug: 'ana-shared' });
  const attached = await addLink('Ficha compartida conservada', sharedUrl);
  assert.equal(attached.link.resourceId, sharedResourceId);
  runtime.serviceCalls.length = 0;

  const { response, html } = await render();
  const row = html.match(/<tr\b(?=[^>]*data-link-row="[^"]+")[\s\S]*?<\/tr>/i)?.[0];
  assert.equal(response.status, 200);
  assertPrivate(response, html);
  assert.ok(row, 'the creator sees the shared placement in the actual owner table');
  assert.match(row, /Ficha compartida conservada/);
  assert.match(row, />Editar opciones<\/button>/);
  assert.doesNotMatch(row, />Editar ficha<\/button>/,
    'the shared reference does not gain metadata-edit permission');
  assertCatalogSurface(html, visibleText(html));
  assert.doesNotMatch(html, /<input\b[^>]*\bname="(?:resourceId|resourceIds|sourceId)"/i);
});


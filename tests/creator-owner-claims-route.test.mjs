import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCreatorAstroRoutes } from './fixtures/creator-astro-route.mjs';
import { createCreatorOwnerAstroContainer } from './fixtures/creator-owner-astro-container.mjs';
import { createCreatorOwnerRuntime, SITE_ORIGIN } from './fixtures/creator-owner-runtime.mjs';
import { bindCreatorBrowserRuntime, clearCreatorBrowserRuntime } from './fixtures/creator-browser-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiled = await compileCreatorAstroRoutes({ owner: 'src/pages/cuenta/index.astro' }, {
  siteOrigin: SITE_ORIGIN,
  scratchDirectory: path.join(root, '.work/creator-owner-experience/planning/phase7/ui'),
  runtimeModule: 'fixture',
  rawModules: 'empty',
});
after(async () => compiled.cleanup());

const ownerRoute = compiled.routes.owner.default;
const container = await createCreatorOwnerAstroContainer({ astroConfig: { site: SITE_ORIGIN } });
let runtime;

async function resetRuntime() {
  runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  runtime.setSession('creator-b');
  runtime.setSession('admin');
  return runtime;
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

async function createProfile({ session = 'creator-a', slug = `ana-${session}`, published = false } = {}) {
  const profile = (await api('/api/creador/perfil/', {
    displayName: session === 'creator-a' ? 'Ana de solicitudes' : 'Bea de solicitudes',
    slug,
    city: 'Córdoba',
    country: 'Argentina',
    socials: {},
  }, { session })).profile;
  if (!published) return profile;
  return (await api('/api/creador/perfil/publicar/', {}, { method: 'POST', session })).profile;
}

async function addLink({ session = 'creator-a', title = 'Guía compartida', url = 'https://claims.example/shared' } = {}) {
  return (await api('/api/creador/enlaces/', { title, url }, { method: 'POST', session })).link;
}

async function render({ search = '', session = 'creator-a' } = {}) {
  const browserRuntime = { creatorRuntime: runtime, accountAuth: runtime.accountAuth };
  bindCreatorBrowserRuntime(browserRuntime);
  try {
    const response = await container.renderToResponse(ownerRoute, {
      request: runtime.request('/cuenta/', { session, search }),
      partial: false,
    });
    return { response, html: await response.text() };
  } finally {
    clearCreatorBrowserRuntime(browserRuntime);
  }
}

function assertPrivate(response, html, status = 200) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(html, /<meta[^>]+name="robots"[^>]+noindex/i);
  assert.match(html, /<meta[^>]+name="robots"[^>]+nofollow/i);
  assert.doesNotMatch(html, /googletagmanager|google-analytics|gtag\s*\(|dataLayer/i);
}

test('SSR desde Enlaces ofrece una acción de solicitud para una ficha compartida', async () => {
  await resetRuntime();
  await createProfile({ session: 'creator-b', slug: 'bea-enlaces' });
  const shared = await addLink({ session: 'creator-b' });
  const owner = await createProfile({ slug: 'ana-enlaces' });
  const own = await addLink({ title: 'Guía propia', url: 'https://claims.example/own' });
  const current = await api('/api/creador/perfil/', undefined, { method: 'GET' });
  const attached = await api('/api/creador/referencias/', {
    resourceId: shared.resourceId,
    url: shared.url,
    profileVersion: current.profile.version,
  }, { method: 'POST' });
  assert.equal(attached.link.resourceId, shared.resourceId);

  const { response, html } = await render({ search: '?vista=enlaces' });
  assertPrivate(response, html);

  const row = (placementId) => {
    const marker = `data-link-row="${placementId}"`;
    const markerIndex = html.indexOf(marker);
    if (markerIndex < 0) return undefined;
    const start = html.lastIndexOf('<tr', markerIndex);
    const end = html.indexOf('</tr>', markerIndex);
    return start >= 0 && end >= 0 ? html.slice(start, end + '</tr>'.length) : undefined;
  };
  const sharedRow = row(attached.link.placementId);
  const ownRow = row(own.placementId);
  assert.ok(sharedRow, 'a shared link row offers its request action in the actual owner page');
  assert.ok(ownRow);
  assert.match(sharedRow, /Solicitar edición/i,
    'a shared link row exposes the request action to its owner');
  assert.doesNotMatch(ownRow, /Solicitar edición/i,
    'a resource the owner can already edit does not offer a request that will be denied');
  assert.match(sharedRow, /Guía compartida/);
  assert.doesNotMatch(sharedRow, /resource-shared|placement-shared/);
  assert.equal((html.match(/<dialog\b[^>]*data-owner-dialog/gi) ?? []).length, 1);
  assert.doesNotMatch(html, /data-owner-form="reclamacion"/i,
    'the request editor is created by the shared Preact dialog after the action is selected');
  assert.ok(owner.id);
});

test('perfil borrador u oculto sigue gestionable desde Solicitudes y no ofrece una falsa página pública', async (t) => {
  await t.test('borrador', async () => {
    await resetRuntime();
    await createProfile({ slug: 'ana-borrador' });
    const { response, html } = await render({ search: '?vista=solicitudes' });
    assertPrivate(response, html);
    assert.match(html, /Ana de solicitudes/);
    assert.match(html, /Borrador|publicar/i);
    assert.match(html, /data-owner-claims|aria-label="Solicitudes"/i);
    assert.doesNotMatch(html, /data-owner-public-link|Ver página pública/i);
  });

  await t.test('oculto', async () => {
    await resetRuntime();
    const profile = await createProfile({ slug: 'ana-oculta', published: true });
    const key = `profile:${profile.id}`;
    const current = await runtime.pages.store.get(key);
    assert.equal(await runtime.pages.store.transact({
      checks: [{ key, version: current.version }],
      puts: [{ key, value: { ...current, hidden: true, version: current.version + 1 } }],
    }), true);
    const { response, html } = await render({ search: '?vista=solicitudes' });
    assertPrivate(response, html);
    assert.match(html, /Ana de solicitudes/);
    assert.match(html, /oculta/i);
    assert.match(html, /data-owner-claims|aria-label="Solicitudes"/i);
    assert.doesNotMatch(html, /data-owner-public-link|Ver página pública/i);
  });
});

test('sin perfil conserva la preparación y la navegación estadística no hereda parámetros de gestión', async () => {
  await resetRuntime();
  const { response, html } = await render({ search: '?vista=solicitudes' });
  assertPrivate(response, html);
  assert.match(html, /Prepara tu página|Completa tu borrador/i);
  assert.match(html, /data-owner-form="crear"/i);
  assert.match(html, /href="\/cuenta\/\?vista=estadisticas&amp;periodo=30&amp;pagina=1"/i,
    'statistics navigation keeps only its own query parameters');
  assert.doesNotMatch(html, /href="[^"]*vista=estadisticas[^\"]*(?:buscar|paginaEnlaces|orden|serie|directorio)/i);
});

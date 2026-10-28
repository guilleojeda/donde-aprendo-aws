import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';
import {
  callApi,
  createCreatorPagesHarness,
  readAdminRecord,
  responseJson,
  sessionCsrf,
  SITE_ORIGIN,
} from './fixtures/creator-pages.mjs';
import {
  createLinksApi,
  createOwnerLinksSurface,
  jsonResponse,
  mountOwnerLinks,
  settle,
  stablePlacementId,
} from './fixtures/creator-owner-links-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratchParent = path.join(root, '.work/creator-pages');
await mkdir(scratchParent, { recursive: true });
const tempDir = await mkdtemp(path.join(scratchParent, 'repair-link-visibility-test-'));
const container = await experimental_AstroContainer.create();
let creatorPageModulePromise;
let ownerComponentPromise;
let residualRoutePromise;

after(async () => {
  delete globalThis.__creatorPageTestRuntime;
  await rm(tempDir, { recursive: true, force: true });
});

const principals = {
  'creator-a': { state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-a', isAdmin: false },
  'creator-b': { state: 'authenticated', accountId: 'private-account-b', csrfToken: 'csrf-b', isAdmin: false },
  admin: { state: 'authenticated', accountId: 'private-account-admin', csrfToken: 'csrf-admin', isAdmin: true },
};

async function visibilityHarness() {
  return createCreatorPagesHarness({
    authenticate: async (request) => {
      const session = request.headers.get('x-test-session')
        ?? (request.headers.get('cookie') === 'creator-session=creator-a' ? 'creator-a' : undefined);
      return principals[session] ?? { state: 'anonymous' };
    },
  });
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
          name: 'creator-runtime-fixture',
          setup(api) {
            api.onResolve({ filter: /creator-runtime\.mjs$/ }, () => ({ path: 'creator-runtime', namespace: 'creator-runtime-fixture' }));
            api.onLoad({ filter: /.*/, namespace: 'creator-runtime-fixture' }, () => ({
              contents: 'export function getCreatorRuntime() { return globalThis.__creatorPageTestRuntime; }',
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

async function loadResidualEditorRoute() {
  if (!residualRoutePromise) {
    const outputPath = path.join(tempDir, 'creator-editor-route.mjs');
    residualRoutePromise = (async () => {
      await build({
        entryPoints: [path.join(root, 'src/pages/cuenta/creador/index.astro')],
        outfile: outputPath,
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        define: {
          'import.meta.env.PUBLIC_PRODUCTION': '"true"',
          'import.meta.env.PUBLIC_SITE_ORIGIN': JSON.stringify(SITE_ORIGIN),
        },
        plugins: [{
          name: 'render-residual-editor-route',
          setup(api) {
            api.onResolve({ filter: /creator-runtime\.mjs$/ }, () => ({ path: 'creator-runtime', namespace: 'creator-runtime-fixture' }));
            api.onLoad({ filter: /.*/, namespace: 'creator-runtime-fixture' }, () => ({
              contents: 'export function getCreatorRuntime() { return globalThis.__creatorPageTestRuntime; }',
              loader: 'js',
            }));
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
      return (await import(pathToFileURL(outputPath).href)).default;
    })();
  }
  return residualRoutePromise;
}

async function loadEditorData(harness) {
  const creatorPage = await loadCreatorPageModule();
  globalThis.__creatorPageTestRuntime = {
    service: harness.service,
    auth: {
      getPrincipal: async (request) => (request.headers.get('cookie') === 'creator-session=creator-a'
        ? principals['creator-a']
        : { state: 'anonymous' }),
    },
  };
  const request = new Request(`${SITE_ORIGIN}/cuenta/creador/`, {
    headers: { cookie: 'creator-session=creator-a' },
  });
  const result = await creatorPage.loadCreatorEditor(request);
  assert.equal(result.status, 200);
  assert.ok(result.data);
  return result.data;
}

test('la ruta antigua conserva el destino Solicitudes también sin perfil y mantiene encabezados privados', async () => {
  const harness = await visibilityHarness();
  const editorRoute = await loadResidualEditorRoute();
  globalThis.__creatorPageTestRuntime = {
    service: harness.service,
    auth: {
      getPrincipal: async (request) => (request.headers.get('cookie') === 'creator-session=creator-a'
        ? principals['creator-a']
        : { state: 'anonymous' }),
    },
  };

  const response = await container.renderToResponse(editorRoute, {
    request: new Request(`${SITE_ORIGIN}/cuenta/creador/`, {
      headers: { cookie: 'creator-session=creator-a' },
    }),
    partial: false,
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/cuenta/?vista=solicitudes');
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

async function renderOwner(data, view = 'perfil') {
  if (!ownerComponentPromise) {
    const outputPath = path.join(tempDir, 'creator-owner-profile.mjs');
    ownerComponentPromise = (async () => {
      await build({
        entryPoints: [path.join(root, 'src/components/CreatorOwnerProfile.astro')],
        outfile: outputPath,
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        plugins: [{
          name: 'render-creator-owner-profile',
          setup(api) {
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
      return (await import(pathToFileURL(outputPath).href)).default;
    })();
  }
  const component = await ownerComponentPromise;
  return container.renderToString(component, { props: {
    data,
    view,
    accountEmail: 'ana@example.invalid',
    logoutCsrfToken: 'logout-csrf',
    csrfToken: 'csrf-a',
    sessionBinding: 'binding-a',
    isAdmin: false,
    publicOrigin: SITE_ORIGIN,
  } });
}

async function api(harness, path, session = 'creator-a', options = {}) {
  return callApi(harness, path, {
    session,
    csrf: sessionCsrf[session],
    ...options,
  });
}

async function adminVersion(harness, type, id) {
  return (await readAdminRecord(harness, type, id)).version;
}

async function ownerAddStatus({ published = true, hidden = false, linkHidden = false } = {}) {
  const profile = {
    id: 'creator-1', displayName: 'Ana Creadora', slug: 'ana-creadora', version: 14,
    published, hidden, city: '', country: '', bio: '', programs: [], socials: {},
  };
  const surface = createOwnerLinksSurface({ profile });
  const api = createLinksApi({ surface, override: (request, state) => {
    if (!linkHidden || request.method !== 'POST' || request.path !== '/api/creador/enlaces') return undefined;
    const resourceId = 'resource-added-1';
    const placementId = stablePlacementId(resourceId);
    return jsonResponse({
      link: {
        placementId, resourceId, title: request.body.title, url: request.body.url,
        description: request.body.description ?? '', featured: false, position: 0,
        selectedForDirectory: request.body.selectedForDirectory ?? true, hidden: true,
        directoryApproval: 'pending', resourceVersion: 1, placementVersion: 1, series: [],
      },
      created: true,
      versionChanges: [
        { entity: 'profile', id: state.profile.id, before: state.profile.version, after: state.profile.version + 1 },
        { entity: 'resource', id: resourceId, before: 0, after: 1 },
        { entity: 'placement', id: placementId, before: 0, after: 1 },
      ],
    }, 201);
  } });
  await mountOwnerLinks({ surface, fetch: api.fetch });
  const field = (name) => surface.addForm.elements.find((item) => item.name === name);
  field('title').value = 'Guía';
  field('url').value = 'https://example.com/guia';
  await surface.addForm.dispatch('submit');
  await settle();
  return surface.addStatus.textContent;
}

async function createProfileAndLink(harness, { published = true, slug = 'ana', session = 'creator-a' } = {}) {
  const saved = await api(harness, '/api/creador/perfil', session, {
    method: 'PUT', body: { displayName: 'Ana', slug },
  });
  assert.equal(saved.status, 200);
  if (published) {
    const publish = await api(harness, '/api/creador/perfil/publicar', session, { method: 'POST', body: {} });
    assert.equal(publish.status, 200);
  }
  const added = await api(harness, '/api/creador/enlaces', session, {
    method: 'POST', body: { title: 'Guía', url: `https://example.com/${slug}` },
  });
  assert.equal(added.status, 201);
  return (await responseJson(added)).link;
}

test('the creator editor reports moderation hiding independently from directory approval and selection', async () => {
  const harness = await createCreatorPagesHarness();
  const link = await createProfileAndLink(harness, { slug: 'guia' });
  const classified = await api(harness, `/api/admin/recursos/${link.resourceId}`, 'admin', {
    method: 'PATCH', body: {
      category: 'Artículo', kind: 'content', format: 'Artículo', topics: ['Serverless'], version: link.resourceVersion,
    },
  });
  assert.equal(classified.status, 200);
  const approved = await api(harness, `/api/admin/recursos/${link.resourceId}/aprobar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', link.resourceId) },
  });
  assert.equal(approved.status, 200);

  const visible = await responseJson(await api(harness, '/api/creador/perfil'));
  assert.equal(visible.links[0].hidden, false);
  assert.equal(visible.links[0].selectedForDirectory, true);
  assert.equal(visible.links[0].directoryApproval, 'approved');

  await api(harness, `/api/admin/recursos/${link.resourceId}/ocultar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', link.resourceId) },
  });
  const hidden = await responseJson(await api(harness, '/api/creador/perfil'));
  assert.equal(hidden.links[0].hidden, true);
  assert.equal(hidden.links[0].selectedForDirectory, true);
  assert.equal(hidden.links[0].directoryApproval, 'approved');
  assert.equal((await harness.service.readPublicProfile('guia')).links.length, 0);

  await api(harness, `/api/admin/recursos/${link.resourceId}/restaurar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', link.resourceId) },
  });
  const restored = await responseJson(await api(harness, '/api/creador/perfil'));
  assert.equal(restored.links[0].hidden, false);
  assert.equal(restored.links[0].selectedForDirectory, true);
  assert.equal(restored.links[0].directoryApproval, 'approved');
  assert.equal((await harness.service.readPublicProfile('guia')).links.length, 1);
  assert.equal(Object.hasOwn((await harness.service.readPublicProfile('guia')).links[0], 'hidden'), false,
    'moderation state remains private to the editor DTO');
});

test('adding an already hidden shared resource returns its moderation state privately', async () => {
  const harness = await createCreatorPagesHarness();
  const original = await createProfileAndLink(harness);
  const hide = await api(harness, `/api/admin/recursos/${original.resourceId}/ocultar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', original.resourceId) },
  });
  assert.equal(hide.status, 200);
  await createProfileAndLink(harness, { slug: 'bea', session: 'creator-b' });

  const shared = await api(harness, '/api/creador/enlaces', 'creator-b', {
    method: 'POST', body: { title: 'Guía compartida', url: 'https://example.com/ana' },
  });
  assert.equal(shared.status, 201);
  const sharedLink = (await responseJson(shared)).link;
  assert.equal(sharedLink.resourceId, original.resourceId);
  assert.equal(sharedLink.hidden, true);
  const editor = await responseJson(await api(harness, '/api/creador/perfil', 'creator-b'));
  assert.equal(editor.links.find(({ resourceId }) => resourceId === original.resourceId).hidden, true);
  const publicPage = await harness.service.readPublicProfile('bea');
  assert.equal(publicPage.links.some(({ resourceId }) => resourceId === original.resourceId), false);
});

test('the owner SSR keeps hiding, directory approval, and selection as compact separate states', async () => {
  const harness = await visibilityHarness();
  const link = await createProfileAndLink(harness);
  const classified = await api(harness, `/api/admin/recursos/${link.resourceId}`, 'admin', {
    method: 'PATCH', body: {
      category: 'Artículo', kind: 'content', format: 'Artículo', topics: ['Serverless'], version: link.resourceVersion,
    },
  });
  assert.equal(classified.status, 200);
  const approved = await api(harness, `/api/admin/recursos/${link.resourceId}/aprobar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', link.resourceId) },
  });
  assert.equal(approved.status, 200);

  let data = await loadEditorData(harness);
  assert.equal(data.links[0].hidden, false, 'the loader parser carries visible state into the typed editor DTO');
  assert.equal(data.links[0].selectedForDirectory, true);
  assert.equal(data.links[0].directoryApproval, 'approved');
  let html = await renderOwner(data, 'enlaces');
  assert.match(html, /Guía/);
  assert.match(html, /Propuest[oa]/i, 'selection remains visible in the compact owner table');
  assert.match(html, /Aprobado/i, 'approval remains distinct from the creator selection');
  assert.doesNotMatch(html, /Cada enlace indica si está visible/);
  assert.doesNotMatch(html, /Visibilidad en tu página:/);

  const hide = await api(harness, `/api/admin/recursos/${link.resourceId}/ocultar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', link.resourceId) },
  });
  assert.equal(hide.status, 200);
  data = await loadEditorData(harness);
  assert.equal(data.links[0].hidden, true);
  assert.equal(data.links[0].selectedForDirectory, true);
  assert.equal(data.links[0].directoryApproval, 'approved');
  html = await renderOwner(data, 'enlaces');
  assert.match(html, /Ocult[oa](?: por administración)?/i);
  assert.match(html, /Propuest[oa]/i);
  assert.match(html, /Aprobado/i);
  assert.equal((await harness.service.readPublicProfile('ana')).links.length, 0);

  const restore = await api(harness, `/api/admin/recursos/${link.resourceId}/restaurar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', link.resourceId) },
  });
  assert.equal(restore.status, 200);
  data = await loadEditorData(harness);
  assert.equal(data.links[0].hidden, false);
  assert.equal(data.links[0].selectedForDirectory, true);
  assert.equal(data.links[0].directoryApproval, 'approved');
  html = await renderOwner(data, 'enlaces');
  assert.match(html, /Propuest[oa]/i);
  assert.match(html, /Aprobado/i);

  const profileHide = await api(harness, `/api/admin/perfiles/${data.profile.id}/ocultar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'profile', data.profile.id) },
  });
  assert.equal(profileHide.status, 200);
  data = await loadEditorData(harness);
  assert.equal(data.profile.hidden, true);
  html = await renderOwner(data, 'enlaces');
  assert.match(html, /Oculta/);
  assert.match(html, /Aprobado/i);
});

test('the owner SSR labels a draft profile without the old per-link visibility paragraph', async () => {
  const harness = await visibilityHarness();
  await createProfileAndLink(harness, { published: false });
  const data = await loadEditorData(harness);
  assert.equal(data.profile.published, false);
  const html = await renderOwner(data);
  assert.match(html, /Borrador/);
  const publicLink = html.match(/<a\b[^>]*data-owner-public-link[^>]*>/);
  assert.ok(!publicLink || /\shidden(?:\s|>)/.test(publicLink[0]),
    'a draft profile does not expose a public link action');
  assert.doesNotMatch(html, /Cada enlace indica si está visible/);
});

test('the owner editor labels social URLs and explains their HTTP(S) format', async () => {
  const harness = await visibilityHarness();
  await createProfileAndLink(harness);
  const html = await renderOwner(await loadEditorData(harness));
  assert.match(html, /data-owner-form="redes"/);
  assert.match(html, /Las direcciones deben ser URL HTTP o HTTPS completas/);
  assert.match(html, /<label[^>]+for="owner-social-website"[^>]*>Sitio web o newsletter<\/label>/);
  assert.match(html, /<input[^>]+id="owner-social-website"[^>]+type="url"/);
});

// Retired case: The custom validator belonged to the old combined profile form. The owner editor uses labelled `type="url"` controls and its profile API keeps the authoritative HTTP(S)-without-credentials validation.

test('el alta owner comunica el estado y nunca afirma que un enlace de borrador u oculto es público', async () => {
  const draft = await ownerAddStatus({ published: false });
  assert.match(draft, /publica/i);
  assert.doesNotMatch(draft, /visible.*públic|públic.*visible/i);

  const hiddenProfile = await ownerAddStatus({ hidden: true });
  assert.match(hiddenProfile, /ocult/i);
  assert.doesNotMatch(hiddenProfile, /visible.*públic|públic.*visible/i);

  const hiddenLink = await ownerAddStatus({ linkHidden: true });
  assert.match(hiddenLink, /ocult/i);
  assert.doesNotMatch(hiddenLink, /visible.*públic|públic.*visible/i);

  const visible = await ownerAddStatus();
  assert.match(visible, /visible.*públic|públic.*visible/i);
});

test('the owner photo editor provides a check action for an uncertain save', async () => {
  const html = await renderOwner({
    profile: {
      id: 'profile-a', displayName: 'Ana', slug: 'ana', programs: [], socials: {},
      published: false, hidden: false, version: 1, photo: { version: 1 },
    },
    links: [], editableResources: [], claims: [], series: [],
  });

  assert.match(html, /La foto se guarda sólo cuando termina la carga\./);
  assert.match(html, /data-owner-check-photo[^>]*>Comprobar qué foto quedó activa/);
  assert.match(html, /data-owner-check-photo[^>]*hidden/,
    'the check action starts hidden until the owner controller observes an uncertain upload result');
});

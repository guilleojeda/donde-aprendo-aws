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
  requestContextForTestPrincipal,
  responseJson,
  sessionCsrf,
  SITE_ORIGIN,
} from './fixtures/creator-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratchParent = path.join(root, '.work/creator-pages');
await mkdir(scratchParent, { recursive: true });
const tempDir = await mkdtemp(path.join(scratchParent, 'repair-link-visibility-test-'));
const container = await experimental_AstroContainer.create();
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
      return requestContextForTestPrincipal(principals[session] ?? { state: 'anonymous' }, session);
    },
  });
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

test('la ruta antigua conserva el destino Solicitudes también sin perfil y mantiene encabezados privados', async () => {
  const harness = await visibilityHarness();
  const editorRoute = await loadResidualEditorRoute();
  globalThis.__creatorPageTestRuntime = {
    service: harness.service,
    auth: {
      getRequestContext: async (request) => requestContextForTestPrincipal(
        request.headers.get('cookie') === 'creator-session=creator-a'
          ? principals['creator-a']
          : { state: 'anonymous' },
      ),
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

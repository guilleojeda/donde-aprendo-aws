import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';
import { createCreatorOwnerRuntime, SITE_ORIGIN } from './creator-owner-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function createCreatorOwnerLinkMoveRouteHarness() {
  const scratch = path.join(root, '.work/creator-owner-experience/planning/phase4/ui');
  await mkdir(scratch, { recursive: true });
  const tempDir = await mkdtemp(path.join(scratch, 'owner-link-move-route-'));
  const stateKey = `__creatorOwnerLinkMoveRoute_${path.basename(tempDir).replaceAll('-', '_')}`;
  const ownerEntry = path.join(root, 'src/pages/cuenta/index.astro');
  const editorEntry = path.join(root, 'src/pages/cuenta/creador/index.astro');
  await writeFile(path.join(tempDir, 'creator-runtime-stub.mjs'),
    `export function getCreatorRuntime() { return globalThis[${JSON.stringify(stateKey)}].runtime; }`);
  await writeFile(path.join(tempDir, 'account-runtime-stub.mjs'),
    `export function getAccountAuth() { return globalThis[${JSON.stringify(stateKey)}].runtime.accountAuth; }`);

  await build({
    entryPoints: { owner: ownerEntry, editor: editorEntry },
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
      name: 'creator-owner-link-move-route-runtime',
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

  const ownerPage = (await import(pathToFileURL(path.join(tempDir, 'owner.mjs')).href)).default;
  const editorPage = (await import(pathToFileURL(path.join(tempDir, 'editor.mjs')).href)).default;
  const container = await experimental_AstroContainer.create({ astroConfig: { site: SITE_ORIGIN } });
  let runtime;

  async function resetRuntime() {
    runtime = await createCreatorOwnerRuntime();
    runtime.setSession('creator-a');
    runtime.setSession('creator-b');
    runtime.setSession('admin');
    globalThis[stateKey] = { runtime };
    return runtime;
  }

  async function api(pathname, body, { method = 'PUT', session = 'creator-a' } = {}) {
    const csrfToken = session === 'creator-a' ? 'csrf-a' : session === 'creator-b' ? 'csrf-creator-b' : 'csrf-admin';
    const response = await runtime.fetchApi(pathname, {
      method,
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, { session });
    const payload = await response.json().catch(() => null);
    assertOk(response, method, pathname, payload);
    return payload;
  }

  async function createProfile({ session = 'creator-a', slug = 'ana-mover' } = {}) {
    return (await api('/api/creador/perfil/', {
      displayName: session === 'creator-a' ? 'Ana Mover' : 'Bea Mover',
      slug, city: 'Córdoba', country: 'Argentina', socials: {},
    }, { method: 'PUT', session })).profile;
  }

  async function addLink({ session = 'creator-a', index = 0, title = `Guía mover ${index + 1}`, url } = {}) {
    const address = url ?? `https://move.example/${session}/${index + 1}`;
    return (await api('/api/creador/enlaces/', { title, url: address }, { method: 'POST', session })).link;
  }

  async function createSeries({ session = 'creator-a', name = 'Serie conservada', slug = 'serie-conservada' } = {}) {
    const current = await api('/api/creador/perfil/', undefined, { method: 'GET', session });
    return (await api('/api/creador/series/', {
      name, slug, profileVersion: current.profile.version,
    }, { method: 'POST', session })).series;
  }

  async function assignChapter(seriesId, placementId, { session = 'creator-a' } = {}) {
    const current = await api('/api/creador/perfil/', undefined, { method: 'GET', session });
    return api(`/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}`, {
      profileVersion: current.profile.version,
    }, { method: 'PUT', session });
  }

  async function setFeatured(link, featured = true, { session = 'creator-a' } = {}) {
    const current = await api('/api/creador/perfil/', undefined, { method: 'GET', session });
    return api(`/api/creador/enlaces/${encodeURIComponent(link.placementId)}/`, {
      featured, profileVersion: current.profile.version,
    }, { method: 'PATCH', session });
  }

  async function hideResource(resourceId) {
    const resource = await runtime.pages.store.get(`resource:${resourceId}`);
    await api(`/api/admin/recursos/${encodeURIComponent(resourceId)}/`, {
      category: 'Artículo', kind: 'content', format: 'Artículo', topics: ['Serverless'], version: resource.version,
    }, { method: 'PATCH', session: 'admin' });
    const current = await runtime.pages.store.get(`resource:${resourceId}`);
    await api(`/api/admin/recursos/${encodeURIComponent(resourceId)}/aprobar/`, { version: current.version }, { method: 'POST', session: 'admin' });
    const approved = await runtime.pages.store.get(`resource:${resourceId}`);
    await api(`/api/admin/recursos/${encodeURIComponent(resourceId)}/ocultar/`, { version: approved.version }, { method: 'POST', session: 'admin' });
  }

  async function render({ pathname = '/cuenta/', search = '', session = 'creator-a' } = {}) {
    globalThis[stateKey] = { runtime };
    const page = pathname.startsWith('/cuenta/creador') ? editorPage : ownerPage;
    const response = await container.renderToResponse(page, {
      request: runtime.request(pathname, { session, search }), partial: false,
    });
    return { response, html: await response.text() };
  }

  return {
    runtime: () => runtime,
    resetRuntime,
    api,
    createProfile,
    addLink,
    createSeries,
    assignChapter,
    setFeatured,
    hideResource,
    render,
    close: async () => {
      delete globalThis[stateKey];
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

function assertOk(response, method, pathname, payload) {
  if (!response.ok) throw new Error(`${method} ${pathname} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
}

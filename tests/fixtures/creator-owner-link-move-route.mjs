import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCreatorAstroRoutes } from './creator-astro-route.mjs';
import { createCreatorOwnerAstroContainer } from './creator-owner-astro-container.mjs';
import { createCreatorOwnerRuntime, SITE_ORIGIN } from './creator-owner-runtime.mjs';
import { bindCreatorBrowserRuntime, clearCreatorBrowserRuntime } from './creator-browser-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export async function createCreatorOwnerLinkMoveRouteHarness() {
  const scratch = path.join(root, '.work/creator-owner-experience/planning/phase4/ui');
  const compiled = await compileCreatorAstroRoutes({
    owner: 'src/pages/cuenta/index.astro',
    editor: 'src/pages/cuenta/creador/index.astro',
  }, { siteOrigin: SITE_ORIGIN, scratchDirectory: scratch, runtimeModule: 'fixture', rawModules: 'empty' });
  const ownerPage = compiled.routes.owner.default;
  const editorPage = compiled.routes.editor.default;
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
    const page = pathname.startsWith('/cuenta/creador') ? editorPage : ownerPage;
    const browserRuntime = { creatorRuntime: runtime, accountAuth: runtime.accountAuth };
    bindCreatorBrowserRuntime(browserRuntime);
    try {
      const response = await container.renderToResponse(page, {
        request: runtime.request(pathname, { session, search }), partial: false,
      });
      return { response, html: await response.text() };
    } finally {
      clearCreatorBrowserRuntime(browserRuntime);
    }
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
      await compiled.cleanup();
    },
  };
}

function assertOk(response, method, pathname, payload) {
  if (!response.ok) throw new Error(`${method} ${pathname} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
}

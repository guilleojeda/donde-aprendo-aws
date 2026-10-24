import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  sessionCsrf,
  SITE_ORIGIN,
} from './fixtures/creator-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratchParent = path.join(root, '.work/creator-pages');
await mkdir(scratchParent, { recursive: true });
const tempDir = await mkdtemp(path.join(scratchParent, 'repair-link-visibility-test-'));
const container = await experimental_AstroContainer.create();
let creatorPageModulePromise;
let editorComponentPromise;
let editorScriptPromise;

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

async function renderEditor(data) {
  if (!editorComponentPromise) {
    const outputPath = path.join(tempDir, 'creator-editor-component.mjs');
    editorComponentPromise = (async () => {
      await build({
        entryPoints: [path.join(root, 'src/components/CreatorEditor.astro')],
        outfile: outputPath,
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        plugins: [{
          name: 'render-creator-editor',
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
  const component = await editorComponentPromise;
  return container.renderToString(component, { props: { data, csrfToken: 'csrf-a' } });
}

function assertPerLinkVisibilityCopy(html) {
  assert.match(html, /Cada enlace indica si está visible en tu página\./);
  assert.doesNotMatch(html, /Los cambios del perfil y tus enlaces se ven al guardar\./);
  assert.doesNotMatch(html, /Los enlaces se muestran en tu página al guardar\./);
}

async function loadEditorScript() {
  if (!editorScriptPromise) {
    editorScriptPromise = build({
      entryPoints: [path.join(root, 'src/scripts/creator-editor.ts')],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      target: 'es2022',
    }).then(({ outputFiles }) => outputFiles[0].text);
  }
  return editorScriptPromise;
}

class TestElement {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.listeners = new Map();
    this.hidden = true;
    this.textContent = '';
    this.attributes = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  querySelector() { return null; }
  querySelectorAll() { return []; }
  setAttribute(name, value) { this.attributes.set(name, value); }

  async dispatch(type) {
    const event = { preventDefault() {} };
    for (const listener of this.listeners.get(type) ?? []) await listener(event);
  }
}

class TestForm extends TestElement {
  reportValidity() { return true; }
}

class TestFormData {
  get(name) {
    return {
      title: 'Guía', url: 'https://example.com/guia', description: '',
      displayName: 'Ana', slug: 'ana', city: '', country: '', bio: '',
    }[name] ?? null;
  }

  getAll() { return []; }
}

async function createEditorSuccessMessage({ action, published, hidden, linkHidden = false }) {
  const rootElement = new TestElement({ csrf: 'csrf-a' });
  const form = new TestForm();
  const profileStatus = new TestElement();
  const linkStatus = new TestElement();
  const publishButton = new TestElement();
  const initial = new TestElement();
  initial.textContent = JSON.stringify({
    profile: {
      id: 'profile-a', displayName: 'Ana', slug: 'ana', programs: [], socials: {},
      published, hidden, version: 1,
    },
    links: [], editableResources: [], claims: [], series: [],
  });
  rootElement.querySelector = (selector) => ({
    '[data-page-status]': new TestElement(),
    '[data-profile-form]': action === 'save-profile' ? form : null,
    '[data-profile-status]': profileStatus,
    '[data-publish-profile]': action === 'publish-profile' ? publishButton : null,
    '[data-copy-profile-url]': null,
    '[data-add-link-form]': action === 'create-link' ? form : null,
    '[data-link-create-status]': linkStatus,
  }[selector] ?? null);
  rootElement.querySelectorAll = () => [];
  const document = {
    querySelector: (selector) => selector === '[data-creator-editor]'
      ? rootElement
      : selector === '#creator-editor-data' ? initial : null,
    querySelectorAll: () => [],
    getElementById: () => null,
  };
  let reloads = 0;
  const window = {
    location: { hash: '', href: `${SITE_ORIGIN}/cuenta/creador/`, reload() { reloads += 1; } },
    requestAnimationFrame(callback) { callback(); },
    history: { replaceState() {} },
  };
  const source = await loadEditorScript();
  runInNewContext(source, {
    document,
    window,
    HTMLElement: TestElement,
    FormData: TestFormData,
    Response,
    TextEncoder,
    URL,
    fetch: async () => action === 'create-link'
      ? new Response(JSON.stringify({ link: { hidden: linkHidden } }), { status: 201 })
      : new Response('{}', { status: 200 }),
  });
  if (action === 'publish-profile') await publishButton.dispatch('click');
  else await form.dispatch('submit');
  assert.equal(reloads, 1);
  return action === 'create-link' ? linkStatus.textContent : profileStatus.textContent;
}

async function api(harness, path, session = 'creator-a', options = {}) {
  return callApi(harness, path, {
    session,
    csrf: sessionCsrf[session],
    ...options,
  });
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
  const approved = await api(harness, `/api/admin/recursos/${link.resourceId}/aprobar`, 'admin', { method: 'POST', body: {} });
  assert.equal(approved.status, 200);

  const visible = await responseJson(await api(harness, '/api/creador/perfil'));
  assert.equal(visible.links[0].hidden, false);
  assert.equal(visible.links[0].selectedForDirectory, true);
  assert.equal(visible.links[0].directoryApproval, 'approved');

  await api(harness, `/api/admin/recursos/${link.resourceId}/ocultar`, 'admin', { method: 'POST', body: {} });
  const hidden = await responseJson(await api(harness, '/api/creador/perfil'));
  assert.equal(hidden.links[0].hidden, true);
  assert.equal(hidden.links[0].selectedForDirectory, true);
  assert.equal(hidden.links[0].directoryApproval, 'approved');
  assert.equal((await harness.service.readPublicProfile('guia')).links.length, 0);

  await api(harness, `/api/admin/recursos/${link.resourceId}/restaurar`, 'admin', { method: 'POST', body: {} });
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
  const hide = await api(harness, `/api/admin/recursos/${original.resourceId}/ocultar`, 'admin', { method: 'POST', body: {} });
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

test('the parsed editor DTO and SSR keep visibility separate from directory selection and approval', async () => {
  const harness = await visibilityHarness();
  const link = await createProfileAndLink(harness);
  const classified = await api(harness, `/api/admin/recursos/${link.resourceId}`, 'admin', {
    method: 'PATCH', body: {
      category: 'Artículo', kind: 'content', format: 'Artículo', topics: ['Serverless'], version: link.resourceVersion,
    },
  });
  assert.equal(classified.status, 200);
  const approved = await api(harness, `/api/admin/recursos/${link.resourceId}/aprobar`, 'admin', { method: 'POST', body: {} });
  assert.equal(approved.status, 200);

  let data = await loadEditorData(harness);
  assert.equal(data.links[0].hidden, false, 'the loader parser carries visible state into the typed editor DTO');
  assert.equal(data.links[0].selectedForDirectory, true);
  assert.equal(data.links[0].directoryApproval, 'approved');
  let html = await renderEditor(data);
  assertPerLinkVisibilityCopy(html);
  assert.match(html, /Los cambios del perfil se reflejan al guardar\. Cada enlace indica si está visible en tu página\./);
  assert.match(html, /Visibilidad en tu página: Visible al público\./);
  assert.match(html, /Directorio: aprobado/);
  assert.match(html, /data-directory[^>]*checked/);

  const hide = await api(harness, `/api/admin/recursos/${link.resourceId}/ocultar`, 'admin', { method: 'POST', body: {} });
  assert.equal(hide.status, 200);
  data = await loadEditorData(harness);
  assert.equal(data.links[0].hidden, true);
  assert.equal(data.links[0].selectedForDirectory, true);
  assert.equal(data.links[0].directoryApproval, 'approved');
  html = await renderEditor(data);
  assertPerLinkVisibilityCopy(html);
  assert.match(html, /Visibilidad en tu página: Oculto por administración\./);
  assert.match(html, /Directorio: aprobado/);
  assert.match(html, /data-directory[^>]*checked/);
  assert.equal((await harness.service.readPublicProfile('ana')).links.length, 0);

  const restore = await api(harness, `/api/admin/recursos/${link.resourceId}/restaurar`, 'admin', { method: 'POST', body: {} });
  assert.equal(restore.status, 200);
  data = await loadEditorData(harness);
  assert.equal(data.links[0].hidden, false);
  assert.equal(data.links[0].selectedForDirectory, true);
  assert.equal(data.links[0].directoryApproval, 'approved');
  html = await renderEditor(data);
  assertPerLinkVisibilityCopy(html);
  assert.match(html, /Visibilidad en tu página: Visible al público\./);
  assert.match(html, /Directorio: aprobado/);

  const profileHide = await api(harness, `/api/admin/perfiles/${data.profile.id}/ocultar`, 'admin', { method: 'POST', body: {} });
  assert.equal(profileHide.status, 200);
  data = await loadEditorData(harness);
  assert.equal(data.profile.hidden, true);
  html = await renderEditor(data);
  assertPerLinkVisibilityCopy(html);
  assert.match(html, /Visibilidad en tu página: No visible: la página está temporalmente oculta por administración\./);
  assert.doesNotMatch(html, /Visibilidad en tu página: Visible al público\./);
});

test('the SSR editor describes a link on a draft profile as not yet public', async () => {
  const harness = await visibilityHarness();
  await createProfileAndLink(harness, { published: false });
  const data = await loadEditorData(harness);
  assert.equal(data.profile.published, false);
  const html = await renderEditor(data);
  assertPerLinkVisibilityCopy(html);
  assert.match(html, /Visibilidad en tu página: No visible todavía: publica tu página para compartir este enlace\./);
  assert.doesNotMatch(html, /Visibilidad en tu página: Visible al público\./);
});

test('the real editor script reports publication accurately for draft, hidden, and visible states', async () => {
  const draft = await createEditorSuccessMessage({ action: 'create-link', published: false, hidden: false });
  assert.match(draft, /Publica tu página para que aparezca al público/);
  assert.doesNotMatch(draft, /visible en tu perfil público/);

  const hiddenProfile = await createEditorSuccessMessage({ action: 'create-link', published: true, hidden: true });
  assert.match(hiddenProfile, /sigue oculta por administración y no aparece al público/);
  assert.doesNotMatch(hiddenProfile, /visible en tu perfil público/);

  const hiddenLink = await createEditorSuccessMessage({ action: 'create-link', published: true, hidden: false, linkHidden: true });
  assert.match(hiddenLink, /El enlace está oculto por administración y no aparece al público/);
  assert.doesNotMatch(hiddenLink, /visible en tu perfil público/);

  const visible = await createEditorSuccessMessage({ action: 'create-link', published: true, hidden: false });
  assert.match(visible, /visible en tu perfil público/);

  const savedDraft = await createEditorSuccessMessage({ action: 'save-profile', published: false, hidden: false });
  assert.match(savedDraft, /guardado como borrador/);
  assert.doesNotMatch(savedDraft, /queda visible enseguida/);
  const savedHidden = await createEditorSuccessMessage({ action: 'save-profile', published: true, hidden: true });
  assert.match(savedHidden, /sigue oculta por administración y no aparece al público/);
  assert.doesNotMatch(savedHidden, /queda visible enseguida/);

  const publishHiddenDraft = await createEditorSuccessMessage({ action: 'publish-profile', published: false, hidden: true });
  assert.match(publishHiddenDraft, /publicada, pero sigue oculta por administración/);
  assert.doesNotMatch(publishHiddenDraft, /visible al público/);
});

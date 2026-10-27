import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createCreatorHttpHandler } from '../src/lib/creator-http.mjs';
import { creatorPageSessionBinding } from '../src/lib/creator-session-context.mjs';
import { callApi, createCreatorPagesHarness, sessionCsrf, SITE_ORIGIN } from './fixtures/creator-pages.mjs';

let editorBundlePromise;

async function editorBundle() {
  editorBundlePromise ??= build({
    entryPoints: [new URL('../src/scripts/creator-editor.ts', import.meta.url).pathname],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  }).then(({ outputFiles }) => outputFiles[0].text);
  return editorBundlePromise;
}

class TestElement {
  constructor({ dataset = {}, values = {}, selectors = {}, lists = {} } = {}) {
    this.dataset = dataset;
    this.values = values;
    this.selectors = selectors;
    this.lists = lists;
    this.listeners = new Map();
    this.attributes = new Map();
    this.textContent = '';
    this.hidden = true;
    this.disabled = false;
    this.checked = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  querySelector(selector) { return this.selectors[selector] ?? null; }
  querySelectorAll(selector) { return this.lists[selector] ?? []; }
  matches(selector) {
    return selector === 'input, textarea, select'
      ? this.tagName === 'INPUT' || this.tagName === 'TEXTAREA' || this.tagName === 'SELECT'
      : this.attributes.has(selector.startsWith('[') && selector.endsWith(']') ? selector.slice(1, -1) : selector);
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  reportValidity() { return true; }
  closest(selector) { return this.selectors[`closest:${selector}`] ?? null; }

  async dispatch(type) {
    const event = { preventDefault() {} };
    for (const listener of this.listeners.get(type) ?? []) await listener(event);
  }
}

class TestFormData {
  constructor(form) {
    this.form = form;
    this.values = new Map();
  }

  get(name) {
    if (this.values.has(name)) return this.values.get(name);
    const value = this.form?.values[name];
    return value && typeof value === 'object' && 'value' in value ? value.value : value ?? null;
  }

  getAll() { return []; }
  append(name, value) { this.values.set(name, value); }
}

function editorData(overrides = {}) {
  return {
    profile: {
      id: 'profile-a', displayName: 'Ana', slug: 'ana', programs: [], socials: {},
      published: true, hidden: false, version: 37,
    },
    links: [],
    editableResources: [],
    claims: [],
    series: [],
    ...overrides,
  };
}

async function runEditor({ data = editorData(), root, fetch, reloads }) {
  const initial = new TestElement();
  initial.textContent = JSON.stringify(data);
  const document = {
    querySelector: (selector) => selector === '[data-creator-editor]' ? root
      : selector === '#creator-editor-data' ? initial : null,
    querySelectorAll: () => [],
    getElementById: () => null,
  };
  const window = {
    confirm() { return true; },
    location: {
      hash: '',
      href: 'https://dondeaprendoaws.com/cuenta/creador/',
      reload() { reloads.count += 1; },
    },
    requestAnimationFrame(callback) { callback(); },
    history: { replaceState() {} },
  };

  runInNewContext(await editorBundle(), {
    document,
    window,
    HTMLElement: TestElement,
    FormData: TestFormData,
    Response,
    TextEncoder,
    URL,
    fetch,
  });
}

function baseRoot(overrides = {}) {
  const linksStatus = new TestElement();
  const root = new TestElement({
    dataset: { csrf: 'csrf-a' },
    selectors: {
      '[data-page-status]': new TestElement(),
      '[data-links-status]': linksStatus,
      ...overrides.selectors,
    },
    lists: overrides.lists,
  });
  return { root, linksStatus };
}

function enableSessionRecovery(root, binding, { fields = [], buttons = [] } = {}) {
  const shell = new TestElement();
  const status = new TestElement();
  const signIn = new TestElement();
  const check = new TestElement();
  check.tagName = 'BUTTON';
  check.hidden = true;
  signIn.hidden = true;
  root.dataset.sessionBinding = binding;
  Object.assign(root.selectors, {
    '[data-session-recovery-shell]': shell,
    '[data-session-recovery-status]': status,
    '[data-session-recovery-sign-in]': signIn,
    '[data-session-recovery-check]': check,
  });
  root.lists['input, textarea, select'] = fields;
  root.lists['button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]'] = [
    ...buttons, check,
  ];
  return { shell, status, signIn, check };
}

async function fetchCreatorHandler(handler, requests, path, options = {}) {
  const url = new URL(path, SITE_ORIGIN);
  const headers = new Headers(options.headers);
  headers.set('origin', SITE_ORIGIN);
  const response = await handler(new Request(url, { ...options, headers }));
  requests.push({
    url: path,
    path: url.pathname,
    method: options.method,
    status: response.status,
    csrf: headers.get('x-csrf-token'),
    ...(options.body ? { body: JSON.parse(options.body) } : {}),
  });
  return response;
}

async function mountSessionEditor({ harness, auth, data, root, fields, buttons = [], fetchOverride, photos, store = harness.store }) {
  const recovery = enableSessionRecovery(root, creatorPageSessionBinding(auth.current), { fields, buttons });
  const http = createCreatorHttpHandler({
    service: harness.service,
    photos,
    auth: { getPrincipal: async () => auth.current },
    store,
    origin: SITE_ORIGIN,
  });
  const requests = [];
  const reloads = { count: 0 };
  const defaultFetch = (url, options) => fetchCreatorHandler(http, requests, url, options);
  await runEditor({
    data, root, reloads,
    fetch: (url, options) => fetchOverride
      ? fetchOverride(defaultFetch, requests, url, options)
      : defaultFetch(url, options),
  });
  return { recovery, requests, reloads, http };
}

async function settleSessionCheck() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('readding a retained resource sends its exact identity and observed resource version', async () => {
  const retainedId = 'resource-retained';
  const item = new TestElement({ dataset: { retainedResourceId: retainedId } });
  const button = new TestElement({ selectors: { 'closest:[data-retained-resource-id]': item } });
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: { '[data-links-status]': status },
    lists: { '[data-readd-link]': [button] },
  });
  const reloads = { count: 0 };
  const requests = [];

  await runEditor({
    data: editorData({
      editableResources: [{
        id: retainedId,
        title: 'Título que puede estar desactualizado',
        url: 'https://example.com/current',
        description: 'Descripción anterior',
        version: 19,
      }],
    }),
    root,
    reloads,
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      return Response.json({}, { status: 201 });
    },
  });

  await button.dispatch('click');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/creador/enlaces/');
  assert.equal(requests[0].method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].body), { resourceId: retainedId, resourceVersion: 19 });
  assert.match(status.textContent, /agregado nuevamente/);
  assert.equal(reloads.count, 1);
});

test('reordering sends the placement and profile versions observed by the editor', async () => {
  const currentItem = new TestElement({ dataset: { placementId: 'placement-current' } });
  const button = new TestElement({
    dataset: { move: 'up' },
    selectors: { 'closest:[data-placement-id]': currentItem },
  });
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: { '[data-links-status]': status },
    lists: { '[data-move]': [button] },
  });
  const reloads = { count: 0 };
  const requests = [];

  await runEditor({
    data: editorData({
      links: [
        {
          placementId: 'placement-target', resourceId: 'resource-a', position: 3, featured: false,
          resourceVersion: 6, placementVersion: 8,
        },
        {
          placementId: 'placement-current', resourceId: 'resource-b', position: 9, featured: false,
          resourceVersion: 11, placementVersion: 23,
        },
      ],
    }),
    root,
    reloads,
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      return Response.json({}, { status: 200 });
    },
  });

  await button.dispatch('click');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/creador/enlaces/placement-current/');
  assert.equal(requests[0].method, 'PATCH');
  assert.deepEqual(JSON.parse(requests[0].body), { position: 3, version: 23, profileVersion: 37 });
  assert.equal(status.textContent, 'Orden actualizado.');
  assert.equal(reloads.count, 1);
});

async function runCorrectionFlow({ action, status: responseStatus, error, initialValue, correctedValue, fieldName }) {
  const field = { value: initialValue, setCustomValidity() {} };
  const resourceId = 'resource-editing';
  const resourceItem = new TestElement({ dataset: { resourceId } });
  const form = new TestElement({
    values: { title: 'Guía', url: field, description: '' },
    selectors: action === 'resource-edit'
      ? { 'closest:[data-resource-id]': resourceItem }
      : {},
    lists: { 'input[name^="social-"]': [] },
  });
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: action === 'resource-edit'
      ? { '[data-links-status]': status }
      : { '[data-add-link-form]': form, '[data-link-create-status]': status },
    lists: action === 'resource-edit' ? { '[data-resource-form]': [form] } : {},
  });
  const reloads = { count: 0 };
  const requests = [];
  let call = 0;

  await runEditor({
    data: action === 'resource-edit' ? editorData({
      links: [{
        placementId: 'placement-editing', resourceId, title: 'Guía', url: initialValue,
        description: '', featured: false, position: 0, selectedForDirectory: false,
        hidden: false, directoryApproval: 'pending', resourceVersion: 29, series: [],
      }],
    }) : editorData(),
    root,
    reloads,
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      call += 1;
      return call === 1
        ? Response.json({ error, message: 'English service detail' }, { status: responseStatus })
        : Response.json(action === 'link' ? { link: { hidden: false } } : {}, { status: action === 'link' ? 201 : 200 });
    },
  });

  await form.dispatch('submit');
  const errorMessage = status.textContent;
  assert.equal(field.value, initialValue, 'a failed save keeps the value that needs correction');
  assert.equal(reloads.count, 0, 'a failed save does not reload or discard the form');
  field.value = correctedValue;
  await form.dispatch('submit');
  assert.equal(field.value, correctedValue);
  assert.equal(JSON.parse(requests[1].body)[fieldName], correctedValue);
  assert.equal(reloads.count, 1, 'the corrected value can be submitted successfully');
  return { errorMessage, status: status.textContent };
}

test('unsafe link URLs give actionable feedback and allow correction', async () => {
  const url = await runCorrectionFlow({
    action: 'link', status: 422, error: 'INVALID_URL',
    initialValue: 'ftp://example.com/guia', correctedValue: 'https://example.com/guia', fieldName: 'url',
  });
  assert.equal(url.errorMessage, 'La URL debe comenzar con http:// o https:// y no incluir usuario ni contraseña.');
  assert.match(url.status, /visible en tu perfil público/);
});

test('resource URL conflicts and colliding link URLs explain the cause and allow corrected retries', async () => {
  const taken = await runCorrectionFlow({
    action: 'resource-edit', status: 409, error: 'URL_TAKEN',
    initialValue: 'https://example.com/used', correctedValue: 'https://example.com/new', fieldName: 'url',
  });
  assert.equal(taken.errorMessage, 'Esa URL ya está asociada a otra ficha. Elige una URL diferente.');
  assert.match(taken.status, /Ficha guardada/);

  const collision = await runCorrectionFlow({
    action: 'link', status: 409, error: 'URL_COLLISION',
    initialValue: 'https://example.com/under-review', correctedValue: 'https://example.com/other', fieldName: 'url',
  });
  assert.equal(collision.errorMessage, 'Esta URL requiere una revisión de administración y no se puede agregar ahora. Puedes probar con otra URL.');
  assert.match(collision.status, /visible en tu perfil público/);
});

// Retired case: The old profile form and its conflict handler moved to the contextual owner controller; the owner-controller acceptance suite covers 409 without adopting an unseen version.

// Retired case: Profile edits now run in the separate owner controller; its accepted caller tests preserve late edits and retry against the write receipt.

// Retired case: The profile form no longer runs in this residual editor; the owner-controller acceptance suite covers failed saves and preserved corrections.

test('a rejected directory checkbox rolls back before a confirmed removal without replaying the failed action', async () => {
  const principal = { state: 'authenticated', accountId: 'private-account-a', csrfToken: sessionCsrf['creator-a'], isAdmin: false };
  const harness = await createCreatorPagesHarness({ authenticate: async () => principal });
  const created = await callApi(harness, '/api/creador/perfil', {
    method: 'PUT', session: 'creator-a', csrf: sessionCsrf['creator-a'],
    body: { displayName: 'Ana', slug: 'ana-rejected-directory', programs: [], socials: {} },
  });
  assert.equal(created.status, 200);
  const added = await callApi(harness, '/api/creador/enlaces', {
    method: 'POST', session: 'creator-a', csrf: sessionCsrf['creator-a'],
    body: { title: 'A', url: 'https://example.com/ana-rejected-directory' },
  });
  assert.equal(added.status, 201);
  const initial = await (await callApi(harness, '/api/creador/perfil', { session: 'creator-a' })).json();
  const link = initial.links[0];
  assert.equal(link.selectedForDirectory, true, 'the fixture starts with the directory selection confirmed');

  const placement = new TestElement({ dataset: { placementId: link.placementId } });
  const checkbox = new TestElement({ selectors: { 'closest:[data-placement-id]': placement } });
  Object.assign(checkbox, { tagName: 'INPUT', type: 'checkbox', checked: true });
  checkbox.setAttribute('data-directory', '');
  const remove = new TestElement({ selectors: { 'closest:[data-placement-id]': placement } });
  remove.tagName = 'BUTTON';
  remove.setAttribute('data-remove-link', '');
  const refresh = new TestElement();
  refresh.tagName = 'BUTTON';
  const transition = new TestElement();
  const linksStatus = new TestElement();
  const staleSelector = '[data-move], [data-remove-link], [data-featured], [data-directory], [data-readd-link], [data-series-add-chapter-form] button, [data-series-move], [data-series-remove-chapter], [data-delete-series]';
  const root = new TestElement({
    dataset: { csrf: sessionCsrf['creator-a'] },
    selectors: {
      '[data-links-status]': linksStatus,
      '[data-view-transition]': transition,
      '[data-view-transition-shell]': new TestElement(),
      '[data-refresh-view]': refresh,
    },
    lists: {
      '[data-featured], [data-directory]': [checkbox],
      '[data-remove-link]': [remove],
      'input, textarea, select': [checkbox],
      [staleSelector]: [checkbox, remove],
      'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [checkbox, remove, refresh],
    },
  });
  const requests = [];
  const reloads = { count: 0 };
  await runEditor({
    data: initial,
    root,
    reloads,
    fetch: async (url, options) => {
      const request = { url, method: options.method, body: options.body ? JSON.parse(options.body) : undefined };
      requests.push(request);
      if (options.method === 'PATCH') return Response.json({ error: 'UNAVAILABLE' }, { status: 503 });
      const response = await callApi(harness, url, {
        method: options.method,
        session: 'creator-a',
        csrf: sessionCsrf['creator-a'],
        ...(request.body === undefined ? {} : { body: request.body }),
      });
      request.status = response.status;
      return response;
    },
  });

  checkbox.checked = false;
  await checkbox.dispatch('change');
  assert.equal(checkbox.checked, true, 'HTTP 503 restores the last confirmed checkbox value');
  assert.match(linksStatus.textContent, /No pudimos guardar los cambios/);
  const afterRejected = await (await callApi(harness, '/api/creador/perfil', { session: 'creator-a' })).json();
  assert.equal(afterRejected.links[0].selectedForDirectory, true, 'the failed PATCH did not persist its selection');

  await remove.dispatch('click');
  const afterRemoved = await (await callApi(harness, '/api/creador/perfil', { session: 'creator-a' })).json();
  assert.equal(afterRemoved.links.length, 0, 'the service confirmed the structural removal');
  assert.equal(checkbox.checked, true, 'the removed placement does not retain the rejected draft');
  assert.equal(requests.map(({ method }) => method).join(','), 'PATCH,DELETE', 'the failed checkbox is not retried or replayed');
  assert.equal(reloads.count, 1, 'the confirmed removal refreshes the residual editor');
});

test('one active resource write blocks a second action while edits stay available and disabled state returns', async () => {
  const resourceId = 'resource-one-write';
  const field = { tagName: 'INPUT', type: 'text', value: 'Título enviado', name: 'title', disabled: false, setCustomValidity() {} };
  const submitButton = new TestElement();
  submitButton.tagName = 'BUTTON';
  const originallyDisabled = new TestElement();
  originallyDisabled.tagName = 'BUTTON';
  originallyDisabled.disabled = true;
  const immediateCheckbox = new TestElement({ dataset: { featured: '' } });
  immediateCheckbox.tagName = 'INPUT';
  immediateCheckbox.type = 'checkbox';
  immediateCheckbox.setAttribute('data-featured', '');
  immediateCheckbox.checked = false;
  const resourceItem = new TestElement({ dataset: { resourceId } });
  const form = new TestElement({
    values: { title: field, url: 'https://example.com/one-write', description: '' },
    selectors: { 'closest:[data-resource-id]': resourceItem },
    lists: { 'input, textarea, select': [field] },
  });
  field.form = form;
  const status = new TestElement();
  const root = new TestElement({
    dataset: { csrf: 'csrf-a' },
    selectors: { '[data-links-status]': status },
    lists: {
      '[data-resource-form]': [form],
      'input, textarea, select': [field],
      '[data-featured], [data-directory]': [immediateCheckbox],
      'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [submitButton, originallyDisabled, immediateCheckbox],
    },
  });
  const reloads = { count: 0 };
  let finishRequest;
  let calls = 0;
  await runEditor({
    data: editorData({ editableResources: [{ id: resourceId, title: 'Título enviado', url: 'https://example.com/one-write', description: '', version: 1 }] }),
    root, reloads,
    fetch: async (_path, options) => {
      calls += 1;
      return new Promise((resolve) => { finishRequest = () => resolve(Response.json({
        resource: { id: resourceId, ...JSON.parse(options.body) },
        versionChanges: [{ entity: 'resource', id: resourceId, before: 1, after: 2 }],
      })); });
    },
  });

  const first = form.dispatch('submit');
  await Promise.resolve();
  assert.equal(submitButton.disabled, true);
  assert.equal(immediateCheckbox.disabled, true);
  assert.equal(field.disabled, false, 'content corrections remain editable during the request');
  field.value = 'Título corregido después del envío';
  await form.dispatch('submit');
  assert.equal(calls, 1, 'the second submit does not dispatch or queue a write');
  finishRequest();
  await first;
  assert.equal(field.value, 'Título corregido después del envío');
  assert.equal(submitButton.disabled, false);
  assert.equal(originallyDisabled.disabled, true, 'the button that began disabled retains its original boundary');
  assert.equal(immediateCheckbox.disabled, false, 'the immediate checkbox returns to its original enabled state');
  assert.equal(reloads.count, 0);
});

// Retired case: Profile creation moved to /cuenta/; the owner-controller acceptance suite covers correction after first creation.

// Retired case: The unrelated profile save no longer runs in the residual content editor. The still-applicable resource/placement separation remains covered by the adjacent test that proves a placement receipt cannot adopt a resource version hidden from its form.

test('a placement response cannot adopt an external resource version hidden from its form', async () => {
  const harness = await createCreatorPagesHarness();
  await callApi(harness, '/api/creador/perfil', {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'PUT',
    body: { displayName: 'Ana', slug: 'ana-placement-receipt' },
  });
  const added = await callApi(harness, '/api/creador/enlaces', {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'POST',
    body: { title: 'Título inicial', url: 'https://example.com/placement-receipt', description: 'Descripción inicial' },
  });
  const initial = await (await callApi(harness, '/api/creador/perfil', { session: 'creator-a' })).json();
  const link = initial.links[0];
  assert.equal(link.resourceVersion, (await added.json()).link.resourceVersion);

  const resourceId = link.resourceId;
  const resourceItem = new TestElement({ dataset: { resourceId } });
  const resourceFields = {
    title: { tagName: 'INPUT', type: 'text', name: 'title', value: link.title },
    url: { tagName: 'INPUT', type: 'text', name: 'url', value: link.url },
    description: { tagName: 'TEXTAREA', name: 'description', value: link.description },
  };
  const resourceForm = new TestElement({
    values: resourceFields,
    selectors: { 'closest:[data-resource-id]': resourceItem },
    lists: { 'input, textarea, select': Object.values(resourceFields) },
  });
  Object.values(resourceFields).forEach((field) => { field.form = resourceForm; });
  const placementItem = new TestElement({ dataset: { placementId: link.placementId } });
  const featured = new TestElement({
    dataset: {},
    selectors: { 'closest:[data-placement-id]': placementItem },
  });
  featured.tagName = 'INPUT';
  featured.type = 'checkbox';
  featured.name = 'featured';
  featured.checked = false;
  featured.setAttribute('data-featured', '');
  const linksStatus = new TestElement();
  const root = new TestElement({
    dataset: { csrf: sessionCsrf['creator-a'] },
    selectors: { '[data-links-status]': linksStatus },
    lists: {
      '[data-resource-form]': [resourceForm],
      '[data-featured], [data-directory]': [featured],
      'input, textarea, select': [...Object.values(resourceFields), featured],
      'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [featured],
    },
  });
  const writes = [];
  const reloads = { count: 0 };
  const realApi = (path, options) => callApi(harness, path, {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], method: options.method,
    ...(options.body ? { body: JSON.parse(options.body) } : {}),
  });
  await runEditor({ data: initial, root, reloads, fetch: async (path, options) => {
    writes.push({ path, body: options.body ? JSON.parse(options.body) : undefined });
    return realApi(path, options);
  } });

  const external = await callApi(harness, `/api/creador/recursos/${link.resourceId}`, {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'PATCH',
    body: { title: 'Título externo', version: link.resourceVersion },
  });
  assert.equal(external.status, 200);
  resourceFields.description.value = 'Descripción local pendiente';
  featured.checked = true;
  await featured.dispatch('change');

  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.featured, true);
  resourceFields.description.value = 'Descripción local pendiente';
  await resourceForm.dispatch('submit');
  assert.equal(writes.length, 2);
  assert.equal(writes[1].body.version, link.resourceVersion, 'the resource form keeps the version it actually observed');
  assert.match(linksStatus.textContent, /Recárgala antes de volver a guardar/);
  const stored = await harness.store.get(`resource:${resourceId}`);
  assert.equal(stored.title, 'Título externo');
  assert.equal(stored.description, 'Descripción inicial');
});

function seriesCreateTransitionFixture() {
  const resourceId = 'resource-transition';
  const resourceItem = new TestElement({ dataset: { resourceId } });
  const resourceFields = {
    title: Object.assign(new TestElement(), { tagName: 'INPUT', type: 'text', name: 'title', value: 'Capítulo' }),
    url: Object.assign(new TestElement(), { tagName: 'INPUT', type: 'url', name: 'url', value: 'https://example.com/transition' }),
    description: Object.assign(new TestElement(), { tagName: 'TEXTAREA', name: 'description', value: '' }),
  };
  const resourceSaveButton = new TestElement();
  resourceSaveButton.tagName = 'BUTTON';
  const resourceForm = new TestElement({
    values: resourceFields,
    selectors: { 'closest:[data-resource-id]': resourceItem },
    lists: {
      'input, textarea, select': Object.values(resourceFields),
      'input, textarea, select, button': [...Object.values(resourceFields), resourceSaveButton],
    },
  });
  Object.values(resourceFields).forEach((field) => { field.form = resourceForm; });

  const name = Object.assign(new TestElement(), { tagName: 'INPUT', type: 'text', name: 'name', value: '' });
  const slug = Object.assign(new TestElement(), { tagName: 'INPUT', type: 'text', name: 'slug', value: '' });
  const description = Object.assign(new TestElement(), { tagName: 'TEXTAREA', name: 'description', value: '' });
  const seriesStatus = new TestElement();
  const seriesCreateForm = new TestElement({
    values: { name, slug, description },
    selectors: {
      '[data-series-create-status]': seriesStatus,
      '[data-series-name-suggestion]': name,
      '[data-series-slug-suggestion]': slug,
    },
    lists: { 'input, textarea, select': [name, slug, description] },
  });
  for (const field of [name, slug, description]) field.form = seriesCreateForm;

  const transition = new TestElement();
  const refresh = new TestElement();
  refresh.tagName = 'BUTTON';
  const moveButton = new TestElement({ dataset: { move: 'up' } });
  moveButton.tagName = 'BUTTON';
  const root = new TestElement({
    dataset: { csrf: 'csrf-a' },
    selectors: {
      '[data-resource-form]': resourceForm,
      '[data-series-create-form]': seriesCreateForm,
      '[data-view-transition]': transition,
      '[data-view-transition-shell]': new TestElement(),
      '[data-refresh-view]': refresh,
    },
    lists: {
      '[data-resource-form]': [resourceForm],
      '[data-series-create-form]': [seriesCreateForm],
      '[data-series-form]': [],
      '[data-series-add-chapter-form]': [],
      '[data-series-add-chapter-form] button': [],
      '[data-move]': [moveButton],
      '[data-move], [data-remove-link], [data-featured], [data-directory], [data-readd-link], [data-series-add-chapter-form] button, [data-series-move], [data-series-remove-chapter], [data-delete-series]': [moveButton],
      'input, textarea, select': [...Object.values(resourceFields), name, slug, description],
      'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [resourceSaveButton, refresh, moveButton],
    },
  });
  return { root, resourceId, resourceFields, resourceForm, resourceSaveButton, seriesCreateForm, name, slug, description, seriesStatus, transition, refresh, moveButton };
}

function seriesTransitionData(profileVersion = 37) {
  return editorData({
    profile: { ...editorData().profile, id: 'profile-a', slug: 'ana', version: profileVersion },
    links: [{
      placementId: 'placement-a', resourceId: 'resource-transition', title: 'Capítulo',
      url: 'https://example.com/transition', description: '', featured: false, position: 10,
      selectedForDirectory: true, hidden: false, directoryApproval: 'pending',
      resourceVersion: 1, placementVersion: 1, series: [],
    }],
    editableResources: [{
      id: 'resource-transition', title: 'Capítulo', url: 'https://example.com/transition', description: '', version: 1,
    }],
  });
}

test('crear una serie conserva un borrador de recurso y exige completar o revertir antes de actualizar', async () => {
  const fixture = seriesCreateTransitionFixture();
  const initial = seriesTransitionData();
  const reloads = { count: 0 };
  const writes = [];
  await runEditor({
    data: initial,
    root: fixture.root,
    reloads,
    fetch: async (path, options) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      writes.push({ path, method: options.method, body });
      if (path === '/api/creador/series/') return Response.json({
        series: { id: 'series-a', name: 'Mi serie', slug: 'mi-serie', version: 1 },
        versionChanges: [
          { entity: 'profile', id: 'profile-a', before: 37, after: 38 },
          { entity: 'series', id: 'series-a', before: 0, after: 1 },
        ],
      }, { status: 201 });
      if (path === `/api/creador/recursos/${fixture.resourceId}/`) return Response.json({
        resource: { id: fixture.resourceId, title: body.title, url: body.url, description: body.description },
        versionChanges: [{ entity: 'resource', id: fixture.resourceId, before: 1, after: 2 }],
      });
      return new Response('{}', { status: 404 });
    },
  });

  fixture.resourceFields.description.value = 'Corrección de recurso pendiente';
  fixture.name.value = 'Mi serie';
  fixture.slug.value = 'mi-serie';
  await fixture.seriesCreateForm.dispatch('submit');
  assert.match(fixture.seriesStatus.textContent, /guarda los cambios pendientes en los otros formularios/);
  assert.equal(fixture.resourceFields.description.value, 'Corrección de recurso pendiente');
  assert.equal(reloads.count, 0);
  assert.equal(fixture.moveButton.disabled, true, 'the list-derived controls wait for the created series to be rendered');
  await fixture.refresh.dispatch('click');
  assert.equal(reloads.count, 0, 'refresh cannot discard the resource correction');

  await fixture.resourceForm.dispatch('submit');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].body.profileVersion, 37);
  assert.equal(writes[1].body.description, 'Corrección de recurso pendiente');
  assert.equal(writes[1].body.version, 1);
  assert.equal(reloads.count, 1, 'saving the remaining residual form safely refreshes the list');
});

test('revertir el borrador residual permite actualizar tras crear la serie', async () => {
  const fixture = seriesCreateTransitionFixture();
  const reloads = { count: 0 };
  await runEditor({
    data: seriesTransitionData(), root: fixture.root, reloads,
    fetch: async () => Response.json({
      series: { id: 'series-a', name: 'Mi serie', slug: 'mi-serie', version: 1 },
      versionChanges: [
        { entity: 'profile', id: 'profile-a', before: 37, after: 38 },
        { entity: 'series', id: 'series-a', before: 0, after: 1 },
      ],
    }, { status: 201 }),
  });
  fixture.resourceFields.description.value = 'Borrador de recurso';
  fixture.name.value = 'Mi serie';
  fixture.slug.value = 'mi-serie';
  await fixture.seriesCreateForm.dispatch('submit');
  fixture.resourceFields.description.value = '';
  await fixture.refresh.dispatch('click');
  assert.equal(reloads.count, 1, 'manual refresh is safe after reverting the other residual form');
});

test('un recibo incompatible conserva el recurso ajeno y permite su guardado', async () => {
  const fixture = seriesCreateTransitionFixture();
  const reloads = { count: 0 };
  await runEditor({
    data: seriesTransitionData(),
    root: fixture.root,
    reloads,
    fetch: async () => Response.json({
      series: { id: 'series-a', name: 'Mi serie', slug: 'mi-serie', version: 1 },
      versionChanges: [
        { entity: 'profile', id: 'profile-a', before: 36, after: 37 },
        { entity: 'series', id: 'series-a', before: 0, after: 1 },
      ],
    }, { status: 201 }),
  });
  fixture.resourceFields.description.value = 'Corrección pendiente';
  fixture.name.value = 'Mi serie';
  fixture.slug.value = 'mi-serie';
  await fixture.seriesCreateForm.dispatch('submit');
  assert.match(fixture.transition.textContent, /El recibo no coincide/);
  assert.equal(fixture.resourceFields.description.value, 'Corrección pendiente');
  assert.equal(fixture.resourceSaveButton.disabled, false, 'independent content edits remain available');
  await fixture.refresh.dispatch('click');
  assert.equal(reloads.count, 0, 'the receipt gap cannot discard the pending resource correction');
  fixture.resourceFields.description.value = '';
  await fixture.refresh.dispatch('click');
  assert.equal(reloads.count, 1, 'refresh is available after the residual correction is reverted');
});

function seriesDeleteFixture({ seriesId = 'series-a', series = {} } = {}) {
  const name = Object.assign(new TestElement(), { tagName: 'INPUT', type: 'text', value: series.name ?? 'Mi serie', name: 'name' });
  const slug = new TestElement();
  Object.assign(slug, { tagName: 'INPUT', type: 'text', value: series.slug ?? 'mi-serie', name: 'slug' });
  const description = Object.assign(new TestElement(), {
    tagName: 'TEXTAREA', value: series.description ?? '', name: 'description',
  });
  const metadataStatus = new TestElement();
  const seriesStatus = new TestElement();
  const saveButton = new TestElement();
  saveButton.tagName = 'BUTTON';
  const chapterSelect = Object.assign(new TestElement(), { tagName: 'SELECT', value: '', name: 'placementId' });
  const addChapterButton = new TestElement();
  addChapterButton.tagName = 'BUTTON';
  const chapterFieldset = new TestElement();
  const seriesForm = new TestElement({
    values: { name, slug, description },
    selectors: { '[data-series-form-status]': metadataStatus },
    lists: {
      'input, textarea, select': [name, slug, description],
      'input, textarea, select, button': [name, slug, description, saveButton],
    },
  });
  for (const field of [name, slug, description]) field.form = seriesForm;
  const chapterForm = new TestElement({
    values: { placementId: chapterSelect },
    selectors: { fieldset: chapterFieldset },
    lists: {
      'input, textarea, select': [chapterSelect],
      'input, textarea, select, button': [chapterSelect, addChapterButton],
    },
  });
  chapterSelect.form = chapterForm;
  const section = new TestElement({
    dataset: { seriesId },
    selectors: { '[data-series-form]': seriesForm, '[data-series-status]': seriesStatus },
    lists: {
      'input, textarea, select': [name, slug, description, chapterSelect],
      'input, textarea, select, button': [name, slug, description, saveButton, chapterSelect, addChapterButton],
    },
  });
  seriesForm.selectors['closest:[data-series-id]'] = section;
  chapterForm.selectors['closest:[data-series-id]'] = section;
  const deleteButton = new TestElement({ selectors: { 'closest:[data-series-id]': section } });
  deleteButton.tagName = 'BUTTON';
  const transition = new TestElement();
  const refresh = new TestElement();
  refresh.tagName = 'BUTTON';
  const linksStatus = new TestElement();
  const shell = new TestElement();
  const root = new TestElement({
    dataset: { csrf: 'csrf-a' },
    selectors: {
      '[data-links-status]': linksStatus,
      '[data-series-form]': seriesForm,
      '[data-series-add-chapter-form]': chapterForm,
      '[data-delete-series]': deleteButton,
      '[data-view-transition]': transition,
      '[data-view-transition-shell]': shell,
      '[data-refresh-view]': refresh,
    },
    lists: {
      '[data-delete-series]': [deleteButton],
      '[data-series-form]': [seriesForm],
      '[data-series-add-chapter-form]': [chapterForm],
      'input, textarea, select': [name, slug, description, chapterSelect],
      'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [
        deleteButton, saveButton, name, slug, description, chapterSelect, addChapterButton, refresh,
      ],
      '[data-move], [data-remove-link], [data-featured], [data-directory], [data-readd-link], [data-series-add-chapter-form] button, [data-series-move], [data-series-remove-chapter], [data-delete-series]': [deleteButton, addChapterButton],
    },
  });
  return {
    root, name, slug, description, seriesForm, metadataStatus, seriesStatus, saveButton,
    chapterSelect, chapterForm, addChapterButton, section, deleteButton, transition, refresh,
    linksStatus,
    fields: [name, slug, description, chapterSelect],
    buttons: [deleteButton, saveButton, addChapterButton, refresh],
  };
}

function addOtherSeriesDraft(fixture, series) {
  const name = Object.assign(new TestElement(), { tagName: 'INPUT', type: 'text', name: 'name', value: series.name });
  const slug = Object.assign(new TestElement(), { tagName: 'INPUT', type: 'text', name: 'slug', value: series.slug });
  const description = Object.assign(new TestElement(), { tagName: 'TEXTAREA', name: 'description', value: series.description ?? '' });
  const status = new TestElement();
  const saveButton = new TestElement();
  saveButton.tagName = 'BUTTON';
  const section = new TestElement({
    dataset: { seriesId: series.id },
    selectors: { '[data-series-status]': status },
  });
  const form = new TestElement({
    values: { name, slug, description },
    selectors: {
      '[data-series-form-status]': status,
      'closest:[data-series-id]': section,
    },
    lists: {
      'input, textarea, select': [name, slug, description],
      'input, textarea, select, button': [name, slug, description, saveButton],
    },
  });
  section.selectors['[data-series-form]'] = form;
  for (const field of [name, slug, description]) field.form = form;
  fixture.root.lists['[data-series-form]'].push(form);
  fixture.root.lists['input, textarea, select'].push(name, slug, description);
  fixture.root.lists['button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]'].push(name, slug, description, saveButton);
  fixture.fields.push(name, slug, description);
  fixture.buttons.push(saveButton);
  return { section, form, name, slug, description, status, saveButton };
}

function addResourceDraft(fixture, link) {
  const title = Object.assign(new TestElement(), { tagName: 'INPUT', type: 'text', name: 'title', value: link.title });
  const url = Object.assign(new TestElement(), { tagName: 'INPUT', type: 'url', name: 'url', value: link.url });
  const description = Object.assign(new TestElement(), { tagName: 'TEXTAREA', name: 'description', value: link.description ?? '' });
  const saveButton = new TestElement();
  saveButton.tagName = 'BUTTON';
  const resource = new TestElement({ dataset: { resourceId: link.resourceId } });
  const form = new TestElement({
    values: { title, url, description },
    selectors: { 'closest:[data-resource-id]': resource },
    lists: {
      'input, textarea, select': [title, url, description],
      'input, textarea, select, button': [title, url, description, saveButton],
    },
  });
  for (const field of [title, url, description]) field.form = form;
  fixture.root.lists['[data-resource-form]'] = [form];
  fixture.root.lists['input, textarea, select'].push(title, url, description);
  fixture.root.lists['button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]'].push(title, url, description, saveButton);
  fixture.fields.push(title, url, description);
  fixture.buttons.push(saveButton);
  return { resource, form, title, url, description, saveButton };
}

async function createSeriesDeleteEditor({ otherDrafts = false, fetchOverride } = {}) {
  const auth = { current: {
    state: 'authenticated', accountId: 'private-account-a', csrfToken: sessionCsrf['creator-a'], isAdmin: false,
  } };
  const harness = await createCreatorPagesHarness({ authenticate: async () => auth.current });
  const api = (path, method, body) => callApi(harness, path, {
    session: 'creator-a', csrf: auth.current.csrfToken, method,
    ...(body === undefined ? {} : { body }),
  });
  assert.equal((await api('/api/creador/perfil', 'PUT', {
    displayName: 'Ana', slug: 'ana-nueva', programs: [], socials: {},
  })).status, 200);
  for (const [index, title] of ['Capítulo', ...(otherDrafts ? ['Otro capítulo'] : [])].entries()) {
    assert.equal((await api('/api/creador/enlaces', 'POST', {
      title, url: `https://example.com/series-delete-${index}`,
    })).status, 201);
  }
  let data = await (await api('/api/creador/perfil')).json();
  const mainCreated = await api('/api/creador/series', 'POST', {
    name: 'Mi serie', slug: 'mi-serie', profileVersion: data.profile.version,
  });
  assert.equal(mainCreated.status, 201);
  if (otherDrafts) {
    data = await (await api('/api/creador/perfil')).json();
    const otherCreated = await api('/api/creador/series', 'POST', {
      name: 'Otra serie', slug: 'otra-serie', profileVersion: data.profile.version,
    });
    assert.equal(otherCreated.status, 201);
  }
  data = await (await api('/api/creador/perfil')).json();
  const mainSeries = data.series.find(({ slug }) => slug === 'mi-serie');
  const otherSeries = data.series.find(({ slug }) => slug === 'otra-serie');
  const fixture = seriesDeleteFixture({
    seriesId: mainSeries.id,
    series: mainSeries,
  });
  if (otherSeries) fixture.otherSeries = addOtherSeriesDraft(fixture, otherSeries);
  if (otherDrafts) fixture.resourceDraft = addResourceDraft(fixture, data.links[0]);
  const page = await mountSessionEditor({
    harness, auth, data, root: fixture.root, fields: fixture.fields,
    buttons: [...fixture.buttons, ...fixture.fields], fetchOverride,
  });
  return { auth, harness, data, api, fixture, page, mainSeries, otherSeries };
}

test('una página residual abierta conserva su versión y protege la edición de serie tras guardar el perfil en otra ruta', async () => {
  const editor = await createSeriesDeleteEditor();
  const { api, data, fixture, page } = editor;
  const externalProfileSave = await api('/api/creador/perfil', 'PUT', {
    displayName: 'Ana actualizada desde Tu página',
    slug: data.profile.slug,
    city: data.profile.city ?? '',
    country: data.profile.country ?? '',
    bio: data.profile.bio ?? '',
    programs: data.profile.programs ?? [],
    socials: data.profile.socials ?? {},
    version: data.profile.version,
  });
  assert.equal(externalProfileSave.status, 200);

  fixture.description.value = 'Corrección local que debe conservarse';
  await fixture.seriesForm.dispatch('submit');

  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].body.profileVersion, data.profile.version,
    'the residual page sends only the profile version it originally observed');
  assert.equal(page.requests[0].status, 409,
    'a profile edit from /cuenta/ makes the open residual series form stale');
  assert.equal(fixture.description.value, 'Corrección local que debe conservarse');
  assert.match(fixture.metadataStatus.textContent, /perfil cambió desde que abriste la página/i);
  assert.equal(page.reloads.count, 0, 'the stale residual form is never refreshed away');
});

test('una escritura de serie avanza el recibo del perfil sin adoptar la versión ajena del recurso', async () => {
  const editor = await createSeriesDeleteEditor({ otherDrafts: true });
  const { fixture, page, data, api } = editor;
  const link = data.links[0];
  const resourceId = link.resourceId;
  const external = await api(`/api/creador/recursos/${resourceId}`, 'PATCH', {
    title: 'Título externo', version: link.resourceVersion,
  });
  assert.equal(external.status, 200);

  fixture.description.value = 'Descripción nueva de la serie';
  fixture.resourceDraft.description.value = 'Descripción local pendiente';
  await fixture.seriesForm.dispatch('submit');
  assert.equal(page.requests[0].body.profileVersion, data.profile.version,
    'series metadata starts from its observed profile version');
  assert.equal(page.reloads.count, 0, 'the resource correction stays open after the series save');
  const afterSeriesSave = await (await api('/api/creador/perfil', 'GET')).json();

  fixture.chapterSelect.value = link.placementId;
  await fixture.chapterForm.dispatch('submit');
  assert.equal(page.requests[1].method, 'PUT');
  assert.equal(page.requests[1].body.profileVersion, afterSeriesSave.profile.version,
    'the residual controller applied the profile version from the series write receipt');
  assert.equal(page.reloads.count, 0, 'the unrelated resource correction remains pending');

  await fixture.resourceDraft.form.dispatch('submit');
  assert.equal(page.requests[2].body.version, link.resourceVersion,
    'a series receipt does not adopt the newer resource version the form never observed');
  assert.match(fixture.linksStatus.textContent, /Recárgala antes de volver a guardar/);
  const stored = await editor.harness.store.get(`resource:${resourceId}`);
  assert.equal(stored.title, 'Título externo');
  assert.equal(stored.description, link.description);
  assert.equal(fixture.resourceDraft.description.value, 'Descripción local pendiente');
});

test('confirmed deletion discards the separate chapter selection and reloads once', async () => {
  const editor = await createSeriesDeleteEditor();
  const { fixture, page, data, api } = editor;
  assert.equal(fixture.deleteButton.listeners.get('click')?.length, 1,
    'the residual series delete control has its real editor handler');
  fixture.chapterSelect.value = data.links[0].placementId;

  await fixture.deleteButton.dispatch('click');

  assert.equal(page.requests.length, 1);
  assert.equal(page.requests[0].status, 204, 'the in-memory creator service confirms deletion');
  assert.equal((await (await api('/api/creador/perfil')).json()).series.length, 0);
  assert.equal(page.reloads.count, 1, 'the deleted series selector alone cannot block the safe refresh');
  assert.equal(fixture.chapterSelect.disabled, true, 'the selector belongs to the deleted series');
  assert.equal(fixture.addChapterButton.disabled, true, 'the deleted series chapter action stays paused');
});

test('confirmed deletion keeps other series and resource drafts saveable and advances the profile receipt', async () => {
  let releaseDelete;
  let markDeleteStarted;
  const deleteStarted = new Promise((resolve) => { markDeleteStarted = resolve; });
  const deleteGate = new Promise((resolve) => { releaseDelete = resolve; });
  const editor = await createSeriesDeleteEditor({
    otherDrafts: true,
    fetchOverride: async (defaultFetch, _requests, url, options) => {
      if (options.method === 'DELETE') {
        markDeleteStarted();
        await deleteGate;
      }
      return defaultFetch(url, options);
    },
  });
  const { fixture, page, data, harness, api } = editor;
  fixture.chapterSelect.value = data.links[0].placementId;
  fixture.otherSeries.description.value = 'Descripción de otra serie';
  fixture.resourceDraft.description.value = 'Descripción del recurso';

  const deleting = fixture.deleteButton.dispatch('click');
  await deleteStarted;
  fixture.chapterSelect.value = '';
  assert.equal(fixture.chapterSelect.disabled, false, 'the series controls stay editable while DELETE is pending');
  assert.equal(fixture.otherSeries.description.disabled, false);
  releaseDelete();
  await deleting;

  assert.equal(page.requests[0].status, 204);
  assert.equal(fixture.chapterSelect.value, '', 'the selector value edited during DELETE remains visible');
  assert.equal(fixture.chapterSelect.disabled, true, 'series controls stop being editable only after success');
  assert.equal(fixture.otherSeries.description.value, 'Descripción de otra serie');
  assert.equal(fixture.resourceDraft.description.value, 'Descripción del recurso');
  assert.equal(fixture.otherSeries.saveButton.disabled, false);
  assert.equal(fixture.resourceDraft.saveButton.disabled, false);
  assert.equal(page.reloads.count, 0, 'the other drafts remain pending after the series controls are discarded');

  const savedProfile = await (await api('/api/creador/perfil', 'GET')).json();
  await fixture.otherSeries.form.dispatch('submit');
  assert.equal(page.requests[1].status, 200);
  assert.equal(page.requests[1].body.description, 'Descripción de otra serie');
  assert.equal(page.requests[1].body.profileVersion, savedProfile.profile.version,
    'the residual editor applied the profile version advanced by the deleted series receipt');
  assert.equal(page.reloads.count, 0, 'saving the other series leaves the resource draft pending');

  await fixture.resourceDraft.form.dispatch('submit');
  assert.equal(page.requests[2].status, 200);
  assert.equal(page.requests[2].body.description, 'Descripción del recurso');
  assert.equal((await harness.store.get(`resource:${data.links[0].resourceId}`)).description, 'Descripción del recurso');
  assert.equal(page.reloads.count, 1, 'saving the last unrelated draft completes the safe refresh once');
});

test('a rejected series deletion keeps late metadata and chapter edits editable and pending', async () => {
  let releaseDelete;
  let markDeleteStarted;
  const deleteStarted = new Promise((resolve) => { markDeleteStarted = resolve; });
  const deleteGate = new Promise((resolve) => { releaseDelete = resolve; });
  const editor = await createSeriesDeleteEditor({
    fetchOverride: async (_defaultFetch, _requests, _url, options) => {
      if (options.method === 'DELETE') {
        markDeleteStarted();
        await deleteGate;
        return Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
      }
      throw new Error(`unexpected request: ${options.method}`);
    },
  });
  const { fixture, page } = editor;
  const deleting = fixture.deleteButton.dispatch('click');
  await deleteStarted;
  fixture.name.value = 'Corrección tardía';
  fixture.chapterSelect.value = editor.data.links[0].placementId;
  assert.equal(fixture.chapterSelect.disabled, false, 'the chapter selector remains editable while DELETE is pending');
  releaseDelete();
  await deleting;

  assert.match(fixture.seriesStatus.textContent, /No pudimos guardar/);
  assert.equal(fixture.name.value, 'Corrección tardía');
  assert.equal(fixture.name.disabled, false);
  assert.equal(fixture.saveButton.disabled, false);
  assert.equal(fixture.chapterSelect.value, editor.data.links[0].placementId);
  assert.equal(fixture.chapterSelect.disabled, false);
  assert.equal(fixture.addChapterButton.disabled, false);
  await fixture.refresh.dispatch('click');
  assert.equal(page.reloads.count, 0, 'both late corrections remain pending after rejection');
  assert.match(fixture.transition.textContent, /Guarda los cambios pendientes o revierte/);
});

test('a failed series deletion leaves its metadata usable and reports only the failure', async () => {
  const fixture = seriesDeleteFixture();
  const reloads = { count: 0 };
  await runEditor({
    data: editorData({ series: [{ id: 'series-a', name: 'Mi serie', slug: 'mi-serie', version: 4 }] }),
    root: fixture.root,
    reloads,
    fetch: async () => Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 }),
  });

  await fixture.deleteButton.dispatch('click');

  assert.equal(fixture.name.disabled, false);
  assert.equal(fixture.saveButton.disabled, false);
  assert.doesNotMatch(fixture.metadataStatus.textContent, /se eliminó/);
  assert.match(fixture.seriesStatus.textContent, /No pudimos guardar/);
  assert.equal(fixture.deleteButton.disabled, false, 'the failed action can be retried');
  assert.equal(reloads.count, 0);
});

test('a successful series deletion discards its late metadata draft before refreshing', async () => {
  const fixture = seriesDeleteFixture();
  const reloads = { count: 0 };
  let resolveDelete;
  const requests = [];
  await runEditor({
    data: editorData({ series: [{ id: 'series-a', name: 'Mi serie', slug: 'mi-serie', version: 4 }] }),
    root: fixture.root,
    reloads,
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('/series/series-a/')) {
        return new Promise((resolve) => { resolveDelete = resolve; });
      }
      return new Response('{}', { status: 404 });
    },
  });

  const deleting = fixture.deleteButton.dispatch('click');
  await Promise.resolve();
  fixture.name.value = 'Corrección durante la solicitud';
  resolveDelete(new Response(null, { status: 204, headers: {
    'Creator-Write-Versions': JSON.stringify([
      { entity: 'profile', id: 'profile-a', before: 37, after: 38 },
      { entity: 'series', id: 'series-a', before: 4, after: 5 },
    ]),
  } }));
  await deleting;

  assert.equal(fixture.name.value, 'Corrección durante la solicitud', 'the entered value remains visible until refresh');
  assert.equal(fixture.name.disabled, true, 'deleted series metadata cannot be submitted');
  assert.match(fixture.metadataStatus.textContent, /ya se eliminó/);
  assert.equal(requests.length, 1, 'the stale series metadata is not resubmitted after deletion');
  assert.equal(reloads.count, 1, 'the deleted form no longer blocks the structural refresh');
});

// Retired case: This paired a late series edit with a pending profile form, both hosted by the old editor. The successful-deletion test above now proves that a late edit in the deleted residual form is discarded and does not block refresh.

test('featuring a link with another pending edit pauses controls that depend on the new order', async () => {
  const principal = { state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-a', isAdmin: false };
  const harness = await createCreatorPagesHarness({ authenticate: async () => principal });
  const apiCall = (path, method, body) => callApi(harness, path, {
    method,
    csrf: 'csrf-a',
    ...(body === undefined ? {} : { body }),
  });
  const profileResponse = await apiCall('/api/creador/perfil', 'PUT', {
    displayName: 'Ana', slug: 'ana', programs: [], socials: {},
  });
  assert.equal(profileResponse.status, 200);
  const created = [];
  for (const title of ['B', 'C', 'A']) {
    const response = await apiCall('/api/creador/enlaces', 'POST', {
      title, url: `https://example.com/${title}`,
    });
    assert.equal(response.status, 201);
    created.push((await response.json()).link);
  }
  const a = created[2];
  const c = created[1];
  const featuredA = await apiCall(`/api/creador/enlaces/${a.placementId}`, 'PATCH', {
    version: a.placementVersion, featured: true,
  });
  assert.equal(featuredA.status, 200);
  const initial = await (await apiCall('/api/creador/perfil')).json();
  const sortedTitles = (links) => [...links]
    .sort((left, right) => Number(right.featured) - Number(left.featured) || left.position - right.position)
    .map((link) => link.title);
  assert.deepEqual(sortedTitles(initial.links), ['A', 'B', 'C']);

  const resourceId = c.resourceId;
  const resourceItem = new TestElement({ dataset: { resourceId } });
  const resourceFields = {
    title: { tagName: 'INPUT', type: 'text', name: 'title', value: c.title },
    url: { tagName: 'INPUT', type: 'url', name: 'url', value: c.url },
    description: { tagName: 'TEXTAREA', name: 'description', value: c.description },
  };
  const resourceForm = new TestElement({
    values: resourceFields,
    selectors: { 'closest:[data-resource-id]': resourceItem },
    lists: { 'input, textarea, select': Object.values(resourceFields) },
  });
  Object.values(resourceFields).forEach((field) => { field.form = resourceForm; });
  const item = new TestElement({ dataset: { placementId: c.placementId } });
  const featured = new TestElement({ dataset: { featured: '' } });
  featured.tagName = 'INPUT';
  featured.type = 'checkbox';
  featured.setAttribute('data-featured', '');
  featured.selectors['closest:[data-placement-id]'] = item;
  const moveUp = new TestElement({
    dataset: { move: 'up' },
    selectors: { 'closest:[data-placement-id]': item },
  });
  moveUp.tagName = 'BUTTON';
  const resourceSave = new TestElement();
  resourceSave.tagName = 'BUTTON';
  const refresh = new TestElement();
  refresh.tagName = 'BUTTON';
  const linksStatus = new TestElement();
  const transition = new TestElement();
  const root = new TestElement({
    dataset: { csrf: 'csrf-a' },
    selectors: {
      '[data-resource-form]': resourceForm,
      '[data-links-status]': linksStatus,
      '[data-view-transition]': transition,
      '[data-view-transition-shell]': new TestElement(),
      '[data-refresh-view]': refresh,
    },
    lists: {
      '[data-resource-form]': [resourceForm],
      '[data-featured], [data-directory]': [featured],
      '[data-move]': [moveUp],
      '[data-move], [data-remove-link], [data-featured], [data-directory], [data-readd-link], [data-series-add-chapter-form] button, [data-series-move], [data-series-remove-chapter], [data-delete-series]': [moveUp, featured],
      'input, textarea, select': [...Object.values(resourceFields), featured],
      'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [resourceSave, moveUp, featured, refresh],
    },
  });
  const requests = [];
  const reloads = { count: 0 };
  await runEditor({
    data: initial,
    root,
    reloads,
    fetch: async (url, options) => {
      const headers = new Headers(options.headers);
      headers.set('origin', SITE_ORIGIN);
      const response = await harness.service.handle(new Request(new URL(url, SITE_ORIGIN), { ...options, headers }));
      requests.push({ url, status: response.status });
      return response;
    },
  });

  resourceFields.description.value = 'Descripción con una corrección pendiente';
  featured.checked = true;
  await featured.dispatch('change');
  const updated = await (await apiCall('/api/creador/perfil')).json();
  assert.deepEqual(sortedTitles(updated.links), ['C', 'A', 'B'], 'the real service changes the rendered featured order');
  assert.equal(requests.length, 1, 'the feature action is the only write');
  assert.equal(resourceFields.description.value, 'Descripción con una corrección pendiente');
  assert.equal(root.querySelector('[data-view-transition-shell]').hidden, false);
  assert.equal(featured.disabled, true, 'the checkbox is stale until the page is refreshed');
  assert.equal(moveUp.disabled, true, 'move controls based on the old order are stale too');
  await refresh.dispatch('click');
  assert.equal(reloads.count, 0, 'the pending resource correction is protected from refresh');
  assert.match(transition.textContent, /Guarda los cambios pendientes o revierte/);

  resourceFields.description.value = c.description;
  await refresh.dispatch('click');
  assert.equal(reloads.count, 1, 'refresh is available after the unrelated correction is reverted');
});

// Retired case: The only dirty metadata form in this receipt-gap test was the now-removed profile form. Residual receipts and multi-form dirty-state behavior remain exercised by series and resource callers below.

test('session-blocked immediate checkbox changes restore observed values before a structural save', async () => {
  const accountId = 'private-session-checkbox-recovery';
  const auth = { current: { state: 'authenticated', accountId, csrfToken: 'csrf-old', isAdmin: false } };
  const harness = await createCreatorPagesHarness({ authenticate: async () => auth.current });
  const created = await callApi(harness, '/api/creador/perfil', {
    method: 'PUT', csrf: 'csrf-old',
    body: { displayName: 'Ana', slug: 'ana-checkbox-recovery', programs: [], socials: {} },
  });
  assert.equal(created.status, 200);
  const added = await callApi(harness, '/api/creador/enlaces', {
    method: 'POST', csrf: 'csrf-old',
    body: { title: 'Enlace recuperado', url: 'https://example.com/session-checkbox-recovery' },
  });
  assert.equal(added.status, 201);
  const initial = await (await callApi(harness, '/api/creador/perfil')).json();
  const resourceId = initial.links[0].resourceId;
  const resourceItem = new TestElement({ dataset: { resourceId } });
  const resourceFields = {
    title: { tagName: 'INPUT', type: 'text', name: 'title', value: initial.links[0].title },
    url: { tagName: 'INPUT', type: 'url', name: 'url', value: initial.links[0].url },
    description: { tagName: 'TEXTAREA', name: 'description', value: initial.links[0].description ?? '' },
  };
  const resourceForm = new TestElement({
    values: resourceFields,
    selectors: { 'closest:[data-resource-id]': resourceItem },
    lists: { 'input, textarea, select': Object.values(resourceFields) },
  });
  Object.values(resourceFields).forEach((field) => { field.form = resourceForm; });
  const placement = new TestElement({ dataset: { placementId: initial.links[0].placementId } });
  const featured = new TestElement({ selectors: { 'closest:[data-placement-id]': placement } });
  Object.assign(featured, { tagName: 'INPUT', type: 'checkbox', checked: false, form: resourceForm });
  featured.setAttribute('data-featured', '');
  const directory = new TestElement({ selectors: { 'closest:[data-placement-id]': placement } });
  Object.assign(directory, { tagName: 'INPUT', type: 'checkbox', checked: true, form: resourceForm });
  directory.setAttribute('data-directory', '');
  const remove = new TestElement({ selectors: { 'closest:[data-placement-id]': placement } });
  remove.tagName = 'BUTTON';
  remove.setAttribute('data-remove-link', '');
  const save = new TestElement();
  save.tagName = 'BUTTON';
  const refresh = new TestElement();
  refresh.tagName = 'BUTTON';
  const transition = new TestElement();
  const staleSelector = '[data-move], [data-remove-link], [data-featured], [data-directory], [data-readd-link], [data-series-add-chapter-form] button, [data-series-move], [data-series-remove-chapter], [data-delete-series]';
  const { root } = baseRoot({
    selectors: {
      '[data-links-status]': new TestElement(),
      '[data-resource-form]': resourceForm,
      '[data-view-transition]': transition,
      '[data-view-transition-shell]': new TestElement(),
      '[data-refresh-view]': refresh,
    },
    lists: {
      '[data-resource-form]': [resourceForm],
      '[data-featured], [data-directory]': [featured, directory],
      '[data-remove-link]': [remove],
      [staleSelector]: [featured, directory, remove],
      'input, textarea, select': [...Object.values(resourceFields), featured, directory],
    },
  });
  const fixture = await mountSessionEditor({
    harness,
    auth,
    data: initial,
    root,
    fields: [...Object.values(resourceFields), featured, directory],
    buttons: [save, refresh, remove, featured, directory],
  });

  resourceFields.description.value = 'Corrección que queda lista para reintentar';
  auth.current = { state: 'anonymous' };
  await resourceForm.dispatch('submit');
  assert.equal(fixture.requests[0].status, 401);

  featured.checked = true;
  await featured.dispatch('change');
  directory.checked = false;
  await directory.dispatch('change');
  assert.equal(featured.checked, false, 'a rejected featured change restores the observed false value');
  assert.equal(directory.checked, true, 'a rejected directory change restores the observed true value');
  assert.equal(fixture.requests.length, 1, 'blocked immediate changes send no PATCH and are not replayed');

  auth.current = { state: 'authenticated', accountId, csrfToken: 'csrf-renewed', isAdmin: false };
  await fixture.recovery.check.dispatch('click');
  await settleSessionCheck();
  assert.equal(fixture.requests[1].path, '/api/creador/sesion/');
  assert.equal(fixture.requests[1].status, 200);
  assert.equal(fixture.requests.length, 2, 'session recovery checks identity without replaying the failed write');

  await remove.dispatch('click');
  assert.equal(fixture.requests[2].method, 'DELETE');
  assert.equal(fixture.requests[2].status, 204);
  assert.equal(featured.disabled, true, 'removing the placement freezes its stale controls');
  assert.equal(directory.disabled, true, 'removing the placement freezes its stale controls');
  assert.equal(featured.checked, false);
  assert.equal(directory.checked, true);

  await resourceForm.dispatch('submit');
  assert.equal(fixture.requests[3].method, 'PATCH');
  assert.equal(fixture.requests[3].path, `/api/creador/recursos/${resourceId}/`);
  assert.equal(fixture.requests[3].status, 200);
  assert.equal(fixture.requests.length, 4, 'the only writes are the failed save, removal, and explicit retry');
  assert.equal((await harness.store.get(`resource:${resourceId}`)).description, 'Corrección que queda lista para reintentar');
  assert.equal(fixture.reloads.count, 1, 'saving the last editable change safely refreshes the removed placement');
  assert.match(transition.textContent, /Enlace quitado/);
});

test('a resource conflict after session recovery keeps its correction and original observed version', async () => {
  const accountId = 'private-session-resource-conflict';
  const auth = { current: { state: 'authenticated', accountId, csrfToken: 'csrf-old', isAdmin: false } };
  const harness = await createCreatorPagesHarness({ authenticate: async () => auth.current });
  const created = await callApi(harness, '/api/creador/perfil', {
    method: 'PUT', csrf: 'csrf-old',
    body: { displayName: 'Ana', slug: 'ana-session-resource-conflict', programs: [], socials: {} },
  });
  assert.equal(created.status, 200);
  const added = await callApi(harness, '/api/creador/enlaces', {
    method: 'POST', csrf: 'csrf-old',
    body: { title: 'Título inicial', url: 'https://example.com/session-resource-conflict' },
  });
  assert.equal(added.status, 201);
  const initial = await (await callApi(harness, '/api/creador/perfil')).json();
  const resource = initial.editableResources[0];
  assert.ok(resource);

  const resourceItem = new TestElement({ dataset: { resourceId: resource.id } });
  const fields = {
    title: { tagName: 'INPUT', type: 'text', name: 'title', value: resource.title },
    url: { tagName: 'INPUT', type: 'url', name: 'url', value: resource.url },
    description: { tagName: 'TEXTAREA', name: 'description', value: resource.description ?? '' },
  };
  const form = new TestElement({
    values: fields,
    selectors: { 'closest:[data-resource-id]': resourceItem },
    lists: { 'input, textarea, select': Object.values(fields) },
  });
  Object.values(fields).forEach((field) => { field.form = form; });
  const { root } = baseRoot({ lists: { '[data-resource-form]': [form] } });
  const fixture = await mountSessionEditor({
    harness, auth, data: initial, root, fields: Object.values(fields), buttons: [form],
  });

  fields.title.value = 'Corrección local conservada';
  auth.current = { state: 'anonymous' };
  await form.dispatch('submit');
  assert.equal(fixture.requests[0].status, 401);

  auth.current = { state: 'authenticated', accountId, csrfToken: 'csrf-renewed', isAdmin: false };
  await fixture.recovery.check.dispatch('click');
  await settleSessionCheck();
  assert.equal(fixture.requests[1].path, '/api/creador/sesion/');
  assert.equal(fixture.requests[1].status, 200);

  const external = await callApi(harness, `/api/creador/recursos/${resource.id}`, {
    method: 'PATCH', csrf: 'csrf-renewed',
    body: { title: 'Título externo', url: resource.url, description: resource.description ?? '', version: resource.version },
  });
  assert.equal(external.status, 200);
  await form.dispatch('submit');

  const retry = fixture.requests.at(-1);
  assert.equal(retry.path, `/api/creador/recursos/${resource.id}/`);
  assert.equal(retry.status, 409);
  assert.equal(retry.body.version, resource.version, 'session recovery does not adopt an external resource version');
  assert.equal(retry.csrf, 'csrf-renewed');
  assert.equal(fields.title.value, 'Corrección local conservada');
  assert.equal(fixture.reloads.count, 0, 'the stale write cannot refresh away the correction');
});

// Migrated from the removed profile form to the residual resource form above: session recovery must keep its stale observed version and local correction after another page changes the record.

// Retired case: Profile creation and its recovery now belong to /cuenta/; the owner-controller acceptance suite covers this first-create recovery.

// Retired case: Profile creation and its authority recovery now belong to /cuenta/; the owner-controller acceptance suite rejects a different account and role.

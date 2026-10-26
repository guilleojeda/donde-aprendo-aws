import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createCreatorHttpHandler } from '../src/lib/creator-http.mjs';
import { createCreatorPhotoHarness, rasterPhotoFixtures } from './fixtures/creator-photos.mjs';
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
    values: action === 'profile'
      ? { displayName: 'Ana', slug: field, city: '', country: '', bio: '' }
      : { title: 'Guía', url: field, description: '' },
    selectors: action === 'resource-edit'
      ? { 'closest:[data-resource-id]': resourceItem }
      : {},
    lists: { 'input[name^="social-"]': [] },
  });
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: action === 'profile'
      ? { '[data-profile-form]': form, '[data-profile-status]': status }
      : action === 'resource-edit'
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

test('profile slug conflicts and unsafe link URLs give actionable feedback and allow correction', async () => {
  const slug = await runCorrectionFlow({
    action: 'profile', status: 409, error: 'SLUG_TAKEN',
    initialValue: 'ya-reservada', correctedValue: 'ana-nueva', fieldName: 'slug',
  });
  assert.equal(slug.errorMessage, 'Esa dirección ya está reservada. Elige otra dirección para tu página.');
  assert.match(slug.status, /Perfil guardado/);

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

test('known version conflicts require a reload while unknown conflicts stay neutral and retain the form value', async () => {
  const field = { value: 'slug-en-conflicto', setCustomValidity() {} };
  const form = new TestElement({
    values: { displayName: 'Ana', slug: field, city: '', country: '', bio: '' },
    lists: { 'input[name^="social-"]': [] },
  });
  const status = new TestElement();
  const { root } = baseRoot({ selectors: { '[data-profile-form]': form, '[data-profile-status]': status } });
  const reloads = { count: 0 };
  let responseIndex = 0;
  const submittedVersions = [];

  await runEditor({
    root,
    reloads,
    fetch: async (_url, options) => {
      submittedVersions.push(JSON.parse(options.body).version);
      responseIndex += 1;
      if (responseIndex === 1) return Response.json({ error: 'PROFILE_CONFLICT' }, { status: 409 });
      if (responseIndex === 2) return Response.json({ error: 'FUTURE_CONFLICT' }, { status: 409 });
      return new Response('not json', { status: 409 });
    },
  });
  await form.dispatch('submit');

  assert.equal(status.textContent, 'El perfil, recurso o enlace cambió desde que abriste la página. Recárgala antes de volver a guardar.');
  assert.equal(field.value, 'slug-en-conflicto');
  assert.equal(reloads.count, 0);

  await form.dispatch('submit');
  assert.equal(status.textContent, 'No pudimos completar el cambio porque hay un conflicto. Revisa el estado antes de volver a intentarlo.');
  assert.equal(field.value, 'slug-en-conflicto');
  assert.equal(reloads.count, 0);

  await form.dispatch('submit');
  assert.equal(status.textContent, 'No pudimos completar el cambio porque hay un conflicto. Revisa el estado antes de volver a intentarlo.');
  assert.equal(field.value, 'slug-en-conflicto');
  assert.equal(reloads.count, 0);
  assert.deepEqual(submittedVersions, [37, 37, 37], 'a conflict never silently advances the stale version');
});

test('a profile save keeps later edits in that form and refreshes its version before retrying', async () => {
  const field = { tagName: 'INPUT', type: 'text', value: 'Ana enviada', name: 'displayName', setCustomValidity() {} };
  const form = new TestElement({
    values: { displayName: field, slug: 'ana', city: '', country: '', bio: '' },
    lists: { 'input[name^="social-"]': [], 'input, textarea, select': [field] },
  });
  field.form = form;
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: { '[data-profile-form]': form, '[data-profile-status]': status },
    lists: { 'input, textarea, select': [field] },
  });
  const reloads = { count: 0 };
  const requests = [];
  let resolveFirstSave;
  let putCount = 0;

  await runEditor({
    root,
    reloads,
    fetch: async (url, options) => {
      requests.push({ url, options });
      putCount += 1;
      if (putCount === 1) {
        return new Promise((resolve) => { resolveFirstSave = resolve; });
      }
      const body = JSON.parse(options.body);
      return Response.json({ profile: { ...editorData().profile, ...body, version: 39 }, versionChanges: [
        { entity: 'profile', id: 'profile-a', before: 38, after: 39 },
      ] });
    },
  });

  const pending = form.dispatch('submit');
  await Promise.resolve();
  field.value = 'Ana corrección posterior';
  const firstBody = JSON.parse(requests[0].options.body);
  resolveFirstSave(Response.json({ profile: { ...editorData().profile, ...firstBody, version: 38 }, versionChanges: [
    { entity: 'profile', id: 'profile-a', before: 37, after: 38 },
  ] }));
  await pending;

  assert.equal(JSON.parse(requests[0].options.body).displayName, 'Ana enviada');
  assert.equal(field.value, 'Ana corrección posterior');
  assert.equal(reloads.count, 0, 'the first success leaves the edited value in place');
  assert.match(status.textContent, /Conservamos los cambios que aún no enviaste/);

  await form.dispatch('submit');
  assert.equal(JSON.parse(requests[1].options.body).displayName, 'Ana corrección posterior');
  assert.equal(JSON.parse(requests[1].options.body).version, 38, 'the retry uses the version from its own commit receipt');
  assert.equal(requests.some((request) => request.options.method === 'GET'), false, 'no GET adopts an unseen version');
  assert.equal(reloads.count, 1, 'the page refreshes after all edits have been saved');
});

test('a failed save keeps edits made while the request was pending and reports the failure', async () => {
  const field = { tagName: 'INPUT', type: 'text', value: 'Ana enviada', name: 'displayName', setCustomValidity() {} };
  const form = new TestElement({
    values: { displayName: field, slug: 'ana', city: '', country: '', bio: '' },
    lists: { 'input[name^="social-"]': [], 'input, textarea, select': [field] },
  });
  field.form = form;
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: { '[data-profile-form]': form, '[data-profile-status]': status },
    lists: { 'input, textarea, select': [field] },
  });
  const reloads = { count: 0 };
  let resolveSave;
  await runEditor({
    root,
    reloads,
    fetch: async () => new Promise((resolve) => { resolveSave = resolve; }),
  });

  const pending = form.dispatch('submit');
  await Promise.resolve();
  field.value = 'Ana corrección tras fallo';
  resolveSave(Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 }));
  await pending;

  assert.equal(field.value, 'Ana corrección tras fallo');
  assert.match(status.textContent, /No pudimos guardar los cambios/);
  assert.equal(reloads.count, 0, 'a failed request never reloads the page');
});

test('one active write blocks a second submission while text edits stay available and original disabled state returns', async () => {
  const field = { tagName: 'INPUT', type: 'text', value: 'Ana enviada', name: 'displayName', disabled: false, setCustomValidity() {} };
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
  const form = new TestElement({
    values: { displayName: field, slug: 'ana', city: '', country: '', bio: '' },
    lists: { 'input[name^="social-"]': [], 'input, textarea, select': [field] },
  });
  field.form = form;
  const status = new TestElement();
  const root = new TestElement({
    dataset: { csrf: 'csrf-a' },
    selectors: { '[data-profile-form]': form, '[data-profile-status]': status },
    lists: {
      'input, textarea, select': [field],
      '[data-featured], [data-directory]': [immediateCheckbox],
      'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [submitButton, originallyDisabled, immediateCheckbox],
    },
  });
  const reloads = { count: 0 };
  let finishRequest;
  let calls = 0;
  await runEditor({
    root, reloads,
    fetch: async (_path, options) => {
      calls += 1;
      return new Promise((resolve) => { finishRequest = () => resolve(Response.json({
        profile: { ...editorData().profile, displayName: JSON.parse(options.body).displayName, version: 38 },
        versionChanges: [{ entity: 'profile', id: 'profile-a', before: 37, after: 38 }],
      })); });
    },
  });

  const first = form.dispatch('submit');
  await Promise.resolve();
  assert.equal(submitButton.disabled, true);
  assert.equal(immediateCheckbox.disabled, true);
  assert.equal(field.disabled, false, 'text corrections remain editable during the request');
  field.value = 'Ana corregida después del envío';
  await form.dispatch('submit');
  assert.equal(calls, 1, 'the second submit does not dispatch or queue a write');
  finishRequest();
  await first;
  assert.equal(field.value, 'Ana corregida después del envío');
  assert.equal(submitButton.disabled, false);
  assert.equal(originallyDisabled.disabled, true, 'the button that began disabled retains its original boundary');
  assert.equal(immediateCheckbox.disabled, false, 'the immediate checkbox returns to its original enabled state');
  assert.equal(reloads.count, 0);
});

test('a correction during first profile creation retries against the version created by that save', async () => {
  const harness = await createCreatorPagesHarness();
  const displayName = { tagName: 'INPUT', type: 'text', name: 'displayName', value: 'Ana enviada', setCustomValidity() {} };
  const slug = { tagName: 'INPUT', type: 'text', name: 'slug', value: 'ana-enviada' };
  const fields = { displayName, slug, city: '', country: '', bio: '' };
  const form = new TestElement({ values: fields, lists: { 'input[name^="social-"]': [], 'input, textarea, select': [displayName, slug] } });
  displayName.form = form;
  slug.form = form;
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: { '[data-profile-form]': form, '[data-profile-status]': status },
    lists: { 'input, textarea, select': [displayName, slug] },
  });
  const reloads = { count: 0 };
  const writes = [];
  let releaseFirst;

  await runEditor({
    data: editorData({ profile: null }),
    root,
    reloads,
    fetch: async (url, options) => {
      assert.equal(url, '/api/creador/perfil/');
      const body = JSON.parse(options.body);
      writes.push(body);
      const response = await callApi(harness, url, {
        session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'PUT', body,
      });
      if (writes.length === 1) return new Promise((resolve) => { releaseFirst = () => resolve(response); });
      return response;
    },
  });

  const firstSave = form.dispatch('submit');
  while (!releaseFirst) await new Promise((resolve) => setTimeout(resolve, 0));
  displayName.value = 'Ana corregida mientras se guarda';
  releaseFirst();
  await firstSave;
  assert.equal(writes[0].version, undefined, 'initial creation has no observed profile version');
  assert.equal(status.textContent.includes('Conservamos los cambios'), true);
  assert.equal(reloads.count, 0);

  await form.dispatch('submit');
  assert.equal(writes[1].version, 1, 'the correction uses the profile version created by the first save');
  assert.equal(writes[1].displayName, 'Ana corregida mientras se guarda');
  assert.equal(reloads.count, 1, 'the page refreshes after the correction is committed');
});

test('the real editor keeps an external resource version stale across an unrelated profile save', async () => {
  const harness = await createCreatorPagesHarness();
  const profileResponse = await callApi(harness, '/api/creador/perfil', {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'PUT',
    body: { displayName: 'Ana', slug: 'ana-ui-receipt' },
  });
  assert.equal(profileResponse.status, 200);
  const addResponse = await callApi(harness, '/api/creador/enlaces', {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'POST',
    body: { title: 'Título inicial', url: 'https://example.com/ui-receipt', description: 'Descripción inicial' },
  });
  const initialLink = (await addResponse.json()).link;
  const initial = await (await callApi(harness, '/api/creador/perfil', { session: 'creator-a' })).json();

  const fields = Object.fromEntries(['displayName', 'slug', 'city', 'country', 'bio'].map((name) => {
    const value = name === 'displayName' ? initial.profile.displayName : initial.profile[name] ?? '';
    return [name, { tagName: 'INPUT', type: 'text', name, value, setCustomValidity() {} }];
  }));
  const profileForm = new TestElement({ values: fields, lists: { 'input[name^="social-"]': [], 'input, textarea, select': Object.values(fields) } });
  Object.values(fields).forEach((field) => { field.form = profileForm; });
  const resourceId = initialLink.resourceId;
  const resourceItem = new TestElement({ dataset: { resourceId } });
  const resourceFields = {
    title: { tagName: 'INPUT', type: 'text', name: 'title', value: initialLink.title },
    url: { tagName: 'INPUT', type: 'text', name: 'url', value: initialLink.url },
    description: { tagName: 'TEXTAREA', name: 'description', value: initialLink.description },
  };
  const resourceForm = new TestElement({
    values: resourceFields,
    selectors: { 'closest:[data-resource-id]': resourceItem },
    lists: { 'input, textarea, select': Object.values(resourceFields) },
  });
  Object.values(resourceFields).forEach((field) => { field.form = resourceForm; });
  const profileStatus = new TestElement();
  const resourceStatus = new TestElement();
  const root = new TestElement({
    dataset: { csrf: sessionCsrf['creator-a'] },
    selectors: { '[data-profile-form]': profileForm, '[data-profile-status]': profileStatus, '[data-links-status]': resourceStatus },
    lists: {
      '[data-resource-form]': [resourceForm],
      'input, textarea, select': [...Object.values(fields), ...Object.values(resourceFields)],
    },
  });
  const writes = [];
  const reloads = { count: 0 };
  const realApi = (path, options) => callApi(harness, path, {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], method: options.method,
    ...(options.body ? { body: JSON.parse(options.body) } : {}),
  });
  await runEditor({ data: initial, root, reloads, fetch: async (path, options) => {
    writes.push({ path, method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
    return realApi(path, options);
  } });

  const external = await callApi(harness, `/api/creador/recursos/${resourceId}`, {
    session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'PATCH',
    body: { title: 'Título externo', version: initialLink.resourceVersion },
  });
  assert.equal(external.status, 200);
  fields.displayName.value = 'Ana local';
  resourceFields.description.value = 'Descripción pendiente';
  await profileForm.dispatch('submit');
  assert.equal(reloads.count, 0, 'the pending resource correction remains in the current page');
  assert.equal(profileStatus.textContent.includes('Conservamos los cambios'), true);

  await resourceForm.dispatch('submit');
  assert.deepEqual(writes.map(({ method }) => method), ['PUT', 'PATCH'], 'the editor does not GET and adopt unseen resource versions');
  assert.equal(writes[1].body.version, initialLink.resourceVersion);
  assert.match(resourceStatus.textContent, /Recárgala antes de volver a guardar/);
  const stored = await harness.store.get(`resource:${resourceId}`);
  assert.equal(stored.title, 'Título externo');
  assert.equal(stored.description, 'Descripción inicial');
});

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

test('saving the profile preserves an edited series form and gives that save the refreshed profile version', async () => {
  const profileField = { tagName: 'INPUT', type: 'text', value: 'Ana enviada', name: 'displayName', setCustomValidity() {} };
  const profileForm = new TestElement({
    values: { displayName: profileField, slug: 'ana', city: '', country: '', bio: '' },
    lists: { 'input[name^="social-"]': [], 'input, textarea, select': [profileField] },
  });
  const seriesName = { tagName: 'INPUT', type: 'text', value: 'Lambda', name: 'name' };
  const seriesSlug = { tagName: 'INPUT', type: 'text', value: 'lambda', name: 'slug' };
  const seriesDescription = { tagName: 'TEXTAREA', value: '', name: 'description' };
  const seriesStatus = new TestElement();
  const seriesSection = new TestElement({ dataset: { seriesId: 'series-a' }, selectors: { '[data-series-status]': seriesStatus } });
  const seriesForm = new TestElement({
    values: { name: seriesName, slug: seriesSlug, description: seriesDescription },
    selectors: { 'closest:[data-series-id]': seriesSection, '[data-series-form-status]': seriesStatus },
    lists: { 'input, textarea, select': [seriesName, seriesSlug, seriesDescription] },
  });
  for (const control of [profileField, seriesName, seriesSlug, seriesDescription]) control.form = control === profileField ? profileForm : seriesForm;
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: { '[data-profile-form]': profileForm, '[data-profile-status]': status },
    lists: {
      '[data-series-form]': [seriesForm],
      'input, textarea, select': [profileField, seriesName, seriesSlug, seriesDescription],
    },
  });
  const reloads = { count: 0 };
  const requests = [];
  const data = editorData({ series: [{ id: 'series-a', name: 'Lambda', slug: 'lambda', description: '', version: 4 }] });
  let resolveProfileSave;

  await runEditor({
    data,
    root,
    reloads,
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.includes('/perfil/')) return new Promise((resolve) => { resolveProfileSave = resolve; });
      return Response.json({ series: { id: 'series-a', name: 'Lambda corregida', slug: 'lambda-corregida', description: 'Descripción corregida', version: 5 }, versionChanges: [
        { entity: 'profile', id: 'profile-a', before: 38, after: 39 },
        { entity: 'series', id: 'series-a', before: 4, after: 5 },
      ] });
    },
  });

  const savingProfile = profileForm.dispatch('submit');
  await Promise.resolve();
  seriesName.value = 'Lambda corregida';
  seriesSlug.value = 'lambda-corregida';
  seriesDescription.value = 'Descripción corregida';
  const submittedProfile = JSON.parse(requests[0].options.body);
  resolveProfileSave(Response.json({ profile: { ...data.profile, ...submittedProfile, version: 38 }, versionChanges: [
    { entity: 'profile', id: 'profile-a', before: 37, after: 38 },
  ] }));
  await savingProfile;
  assert.equal(seriesName.value, 'Lambda corregida');
  assert.equal(reloads.count, 0, 'a different pending form prevents the success reload');
  assert.match(status.textContent, /Conservamos los cambios que aún no enviaste/);

  await seriesForm.dispatch('submit');
  const seriesRequest = requests.find((request) => request.url.includes('/series/series-a/'));
  assert.ok(seriesRequest);
  assert.equal(JSON.parse(seriesRequest.options.body).profileVersion, 38);
  assert.equal(JSON.parse(seriesRequest.options.body).version, 4);
  assert.equal(requests.some((request) => request.options.method === 'GET'), false, 'series metadata keeps its own observed version');
  assert.equal(JSON.parse(seriesRequest.options.body).name, 'Lambda corregida');
  assert.equal(reloads.count, 1, 'saving the pending series completes the refresh');
});

function seriesTransitionFixture() {
  const profileField = { tagName: 'INPUT', type: 'text', value: 'Ana', name: 'displayName', setCustomValidity() {} };
  const profileSaveButton = new TestElement();
  profileSaveButton.tagName = 'BUTTON';
  const profileForm = new TestElement({
    values: { displayName: profileField, slug: 'ana', city: '', country: '', bio: '' },
    lists: { button: [profileSaveButton], 'input[name^="social-"]': [], 'input, textarea, select': [profileField] },
  });
  profileField.form = profileForm;
  const name = { tagName: 'INPUT', type: 'text', value: '', name: 'name' };
  const slug = { tagName: 'INPUT', type: 'text', value: '', name: 'slug' };
  const description = { tagName: 'TEXTAREA', value: '', name: 'description' };
  const seriesStatus = new TestElement();
  const seriesForm = new TestElement({
    values: { name, slug, description },
    selectors: { '[data-series-create-status]': seriesStatus },
    lists: { 'input, textarea, select': [name, slug, description] },
  });
  for (const field of [name, slug, description]) field.form = seriesForm;
  const transition = new TestElement();
  const refresh = new TestElement();
  const moveButton = new TestElement({ dataset: { move: 'up' } });
  const root = new TestElement({
    dataset: { csrf: 'csrf-a' },
    selectors: {
      '[data-profile-form]': profileForm,
      '[data-profile-status]': new TestElement(),
      '[data-series-create-form]': seriesForm,
      '[data-view-transition]': transition,
      '[data-view-transition-shell]': new TestElement(),
      '[data-refresh-view]': refresh,
    },
    lists: {
      '[data-series-form]': [],
      '[data-series-add-chapter-form]': [],
      '[data-series-add-chapter-form] button': [],
      '[data-move]': [moveButton],
      '[data-move], [data-remove-link], [data-featured], [data-directory], [data-readd-link], [data-series-add-chapter-form] button, [data-series-move], [data-series-remove-chapter], [data-delete-series]': [moveButton],
      'input, textarea, select': [profileField, name, slug, description],
      'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [profileSaveButton, moveButton],
    },
  });
  return { root, profileForm, profileField, profileSaveButton, seriesForm, name, slug, description, seriesStatus, transition, refresh, moveButton };
}

test('creating the first series keeps pending fields and offers a truthful safe refresh transition', async () => {
  const fixture = seriesTransitionFixture();
  const reloads = { count: 0 };
  const initial = editorData({
    profile: { ...editorData().profile, id: 'profile-a', slug: 'ana', version: 37 },
    links: [{ placementId: 'placement-a', resourceId: 'resource-a', title: 'Capítulo existente', url: 'https://example.com/chapter', description: '', featured: false, position: 10, selectedForDirectory: true, hidden: false, directoryApproval: 'pending', resourceVersion: 1, placementVersion: 1, series: [] }],
  });
  let profileVersion = 37;
  const writes = [];
  await runEditor({
    data: initial,
    root: fixture.root,
    reloads,
    fetch: async (path, options) => {
      writes.push({ path, method: options.method, body: options.body ? JSON.parse(options.body) : undefined });
      if (path === '/api/creador/series/') {
        profileVersion += 1;
        return Response.json({ series: { id: 'series-a', name: 'Mi serie', slug: 'mi-serie', version: 1 }, profileVersion, versionChanges: [
          { entity: 'profile', id: 'profile-a', before: 37, after: 38 },
          { entity: 'series', id: 'series-a', before: 0, after: 1 },
        ] }, { status: 201 });
      }
      if (path === '/api/creador/perfil/') {
        const body = JSON.parse(options.body);
        profileVersion += 1;
        return Response.json({ profile: { ...initial.profile, ...body, version: profileVersion }, versionChanges: [
          { entity: 'profile', id: 'profile-a', before: profileVersion - 1, after: profileVersion },
        ] });
      }
      return new Response('{}', { status: 404 });
    },
  });

  fixture.profileField.value = 'Nombre pendiente';
  fixture.name.value = 'Mi serie';
  fixture.slug.value = 'mi-serie';
  await fixture.seriesForm.dispatch('submit');
  const expected = 'Serie creada. Para agregar capítulos, guarda los cambios pendientes en los otros formularios; la página se actualizará cuando termines. Tus campos se conservan.';
  assert.equal(fixture.seriesStatus.textContent, expected);
  assert.equal(fixture.transition.textContent, expected);
  assert.doesNotMatch(fixture.seriesStatus.textContent, /Ahora puedes agregar capítulos/);
  assert.equal(fixture.profileField.value, 'Nombre pendiente');
  assert.equal(reloads.count, 0);
  assert.equal(fixture.moveButton.disabled, true, 'actions that depend on the old list are disabled');
  assert.equal(fixture.root.querySelectorAll('[data-series-add-chapter-form]').length, 0, 'new chapter controls are not claimed to exist yet');

  await fixture.refresh.dispatch('click');
  assert.equal(reloads.count, 0, 'Actualizar vista cannot discard pending fields');
  assert.match(fixture.transition.textContent, /Guarda los cambios pendientes o revierte/);

  await fixture.profileForm.dispatch('submit');
  const profileWrite = writes.find((write) => write.path === '/api/creador/perfil/');
  assert.equal(profileWrite.body.displayName, 'Nombre pendiente');
  assert.equal(profileWrite.body.version, 38, 'the profile correction uses the matching series-creation receipt');
  assert.equal(reloads.count, 1, 'saving the last pending form automatically refreshes the structural controls');
});

test('reverting pending fields allows the explicit structural refresh', async () => {
  const fixture = seriesTransitionFixture();
  const reloads = { count: 0 };
  await runEditor({
    data: editorData(), root: fixture.root, reloads,
    fetch: async () => Response.json({ series: { id: 'series-a', name: 'Mi serie', slug: 'mi-serie', version: 1 }, versionChanges: [
      { entity: 'profile', id: 'profile-a', before: 37, after: 38 },
      { entity: 'series', id: 'series-a', before: 0, after: 1 },
    ] }, { status: 201 }),
  });
  fixture.profileField.value = 'Nombre pendiente';
  fixture.name.value = 'Mi serie';
  fixture.slug.value = 'mi-serie';
  await fixture.seriesForm.dispatch('submit');
  fixture.profileField.value = 'Ana';
  await fixture.refresh.dispatch('click');
  assert.equal(reloads.count, 1, 'manual refresh is safe once all pending fields match their baselines');
});

test('a mismatched write receipt exposes a safe refresh without disabling valid metadata forms', async () => {
  const fixture = seriesTransitionFixture();
  const reloads = { count: 0 };
  await runEditor({
    data: editorData(),
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

  fixture.profileField.value = 'Corrección pendiente';
  fixture.name.value = 'Mi serie';
  fixture.slug.value = 'mi-serie';
  await fixture.seriesForm.dispatch('submit');

  assert.equal(fixture.root.querySelector('[data-view-transition-shell]').hidden, false);
  assert.match(fixture.transition.textContent, /El recibo no coincide/);
  assert.equal(fixture.profileField.value, 'Corrección pendiente');
  assert.equal(fixture.profileSaveButton.disabled, false, 'a metadata form remains available for a valid independent save');
  assert.equal(fixture.moveButton.disabled, true, 'actions over the stale list stay paused');
  assert.equal(fixture.refresh.disabled, false, 'the user can reach the explicit refresh transition');

  await fixture.refresh.dispatch('click');
  assert.equal(reloads.count, 0, 'refresh cannot discard the pending correction');
  assert.match(fixture.transition.textContent, /Guarda los cambios pendientes o revierte/);
  fixture.profileField.value = 'Ana';
  await fixture.refresh.dispatch('click');
  assert.equal(reloads.count, 1, 'refresh becomes safe after manually reverting the pending correction');
});

test('a second photo with matching file metadata stays selected after the first photo finishes', async () => {
  const firstFile = new File(['A'], 'profile.png', { type: 'image/png', lastModified: 123 });
  const secondFile = new File(['B'], 'profile.png', { type: 'image/png', lastModified: 123 });
  assert.equal(firstFile.name, secondFile.name);
  assert.equal(firstFile.size, secondFile.size);
  assert.equal(firstFile.lastModified, secondFile.lastModified);
  assert.equal(await firstFile.text(), 'A');
  assert.equal(await secondFile.text(), 'B');
  assert.notEqual(firstFile, secondFile, 'the byte contents belong to distinct File selections');

  const profileField = { tagName: 'INPUT', type: 'text', value: 'Ana', name: 'displayName', setCustomValidity() {} };
  const profileForm = new TestElement({
    values: { displayName: profileField, slug: 'ana', city: '', country: '', bio: '' },
    lists: { 'input[name^="social-"]': [], 'input, textarea, select': [profileField] },
  });
  profileField.form = profileForm;
  const fileInput = { tagName: 'INPUT', type: 'file', files: [firstFile], disabled: false };
  const photoForm = new TestElement({
    selectors: { 'input[type="file"]': fileInput },
    lists: {
      'input, textarea, select': [fileInput],
      'button, input[data-busy-control]': [fileInput],
      'button, input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [fileInput],
      'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [fileInput],
    },
  });
  fileInput.form = photoForm;
  const profileStatus = new TestElement();
  const photoStatus = new TestElement();
  const { root } = baseRoot({
    selectors: {
      '[data-profile-form]': profileForm,
      '[data-profile-status]': profileStatus,
      '[data-photo-form]': photoForm,
      '[data-photo-status]': photoStatus,
    },
    lists: {
      'input, textarea, select': [profileField, fileInput],
      'button, input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [fileInput],
      'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [fileInput],
    },
  });
  const initialProfile = { ...editorData().profile, version: 37 };
  const requests = [];
  let profileVersion = 37;
  let finalizationCount = 0;
  let resolveFirstFinalization;
  const reloads = { count: 0 };

  await runEditor({
    data: editorData({ profile: initialProfile }),
    root,
    reloads,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === '/api/creador/foto/autorizar/') {
        return Response.json({
          uploadId: `upload-${finalizationCount + 1}`,
          post: { url: 'https://storage.example/upload', fields: {} },
        });
      }
      if (url === 'https://storage.example/upload') return new Response(null, { status: 204 });
      if (url === '/api/creador/foto/finalizar/') {
        finalizationCount += 1;
        const before = profileVersion;
        profileVersion += 1;
        const result = Response.json({ photo: { version: `upload-${finalizationCount}` }, versionChanges: [
          { entity: 'profile', id: 'profile-a', before, after: profileVersion },
        ] });
        return finalizationCount === 1
          ? new Promise((resolve) => { resolveFirstFinalization = resolve; })
          : result;
      }
      if (url === '/api/creador/perfil/' && options.method === 'PUT') {
        profileVersion += 1;
        const body = JSON.parse(options.body);
        return Response.json({ profile: { ...initialProfile, ...body, version: profileVersion }, versionChanges: [
          { entity: 'profile', id: 'profile-a', before: profileVersion - 1, after: profileVersion },
        ] });
      }
      return new Response('not found', { status: 404 });
    },
  });

  const firstPhotoSave = photoForm.dispatch('submit');
  while (!resolveFirstFinalization) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fileInput.disabled, true, 'the file field remains disabled during its own upload');
  profileField.value = 'Ana corregida mientras finaliza la foto';
  resolveFirstFinalization(Response.json({ photo: { version: 'upload-1' }, versionChanges: [
    { entity: 'profile', id: 'profile-a', before: 37, after: 38 },
  ] }));
  await firstPhotoSave;

  assert.equal(fileInput.files[0], firstFile);
  assert.equal(reloads.count, 0, 'the first photo does not reload over the pending profile correction');
  assert.match(photoStatus.textContent, /Conservamos los cambios que aún no enviaste/);

  fileInput.files = [secondFile];
  assert.equal(fileInput.disabled, false, 'the next selection is available after the first upload');
  await profileForm.dispatch('submit');
  assert.equal(fileInput.files[0], secondFile);
  assert.equal(reloads.count, 0, 'metadata equality must not hide the second file selection');
  assert.match(profileStatus.textContent, /Conservamos los cambios que aún no enviaste/);

  await photoForm.dispatch('submit');
  const profileBody = requests.find(({ url, options }) => url === '/api/creador/perfil/' && options.method === 'PUT');
  const secondAuthorization = requests.filter(({ url }) => url === '/api/creador/foto/autorizar/')[1];
  assert.equal(JSON.parse(profileBody.options.body).version, 38);
  assert.equal(JSON.parse(secondAuthorization.options.body).version, 39);
  assert.equal(finalizationCount, 2, 'the replacement photo can finish its upload and finalization');
  assert.equal(fileInput.files[0], secondFile);
  assert.equal(reloads.count, 1, 'the page refreshes only after the replacement is saved');
});

test('a lost photo finalization acknowledgement reports an unknown result after the real service commits', async () => {
  const oldPhoto = { version: 'old-photo' };
  const harness = await createCreatorPhotoHarness({
    profiles: [{ id: 'creator-a', version: 1, photo: oldPhoto }],
  });
  const { jpeg } = await rasterPhotoFixtures();
  const file = { type: 'image/jpeg', size: jpeg.length };
  const fileInput = { files: [file] };
  const photoStatus = new TestElement();
  const photoForm = new TestElement({ selectors: { 'input[type="file"]': fileInput } });
  const { root } = baseRoot({ selectors: { '[data-photo-form]': photoForm, '[data-photo-status]': photoStatus } });
  const initialData = editorData({ profile: {
    id: 'creator-a', displayName: 'Ana', slug: 'ana', programs: [], socials: {},
    published: true, hidden: false, version: 1, photo: oldPhoto,
  } });
  const reloads = { count: 0 };
  let upload;
  let committed = false;

  await runEditor({
    data: initialData,
    root,
    reloads,
    fetch: async (url, options) => {
      if (url === '/api/creador/foto/autorizar/') {
        upload = await harness.service.beginUpload({
          profileId: 'creator-a', expectedVersion: JSON.parse(options.body).version,
        });
        return Response.json(upload);
      }
      if (url === upload.post.url) {
        harness.objects.seed(options.body.values.get('key'), jpeg);
        return new Response(null, { status: 204 });
      }
      if (url === '/api/creador/foto/finalizar/') {
        const body = JSON.parse(options.body);
        await harness.service.finalizeUpload({
          profileId: 'creator-a', uploadId: body.uploadId, expectedVersion: body.version,
        });
        committed = true;
        throw new TypeError('response lost after commit');
      }
      throw new Error(`Unexpected editor request: ${url}`);
    },
  });

  await photoForm.dispatch('submit');
  const profile = await harness.store.get('profile:creator-a');
  assert.equal(committed, true);
  assert.equal(profile.version, 2);
  assert.equal(profile.photo.version, upload.uploadId);
  assert.notDeepEqual(profile.photo, oldPhoto, 'the service committed the new immutable photo reference');
  const photo = await harness.service.readPhoto({ profileId: 'creator-a', version: upload.uploadId });
  assert.ok(photo?.body.length > 0, 'the newly committed photo remains readable');
  assert.match(photoStatus.textContent, /No pudimos confirmar si la foto se guardó/);
  assert.match(photoStatus.textContent, /Recarga la página para comprobar cuál está activa/);
  assert.doesNotMatch(photoStatus.textContent, /la foto anterior sigue activa/i);
  assert.equal(reloads.count, 0);
});

test('real photo HTTP version conflicts at authorization and finalization tell the editor to reload', async () => {
  const { jpeg } = await rasterPhotoFixtures();

  async function photoHttpHarness(photoVersion) {
    const pages = await createCreatorPagesHarness();
    const seeded = await pages.store.transact({
      checks: [
        { key: 'profile:profile-a', version: null },
        { key: 'account-profile:private-account-a', version: null },
      ],
      puts: [
        { key: 'profile:profile-a', value: { id: 'profile-a', displayName: 'Ana', slug: 'ana', version: photoVersion } },
        { key: 'account-profile:private-account-a', value: { profileId: 'profile-a', version: 1 } },
      ],
    });
    assert.equal(seeded, true);
    const photos = await createCreatorPhotoHarness({ profiles: [{ id: 'profile-a', version: photoVersion }] });
    const handler = createCreatorHttpHandler({
      service: pages.service,
      photos: photos.service,
      auth: { async getPrincipal() { return { state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-a' }; } },
      store: pages.store,
      origin: SITE_ORIGIN,
    });
    return { pages, photos, handler };
  }

  async function runPhoto({ photoVersion, advanceBeforeFinalize = false }) {
    const harness = await photoHttpHarness(photoVersion);
    const file = new File([jpeg], 'profile.jpg', { type: 'image/jpeg' });
    const fileInput = { files: [file], disabled: false };
    const photoStatus = new TestElement();
    const photoForm = new TestElement({ selectors: { 'input[type="file"]': fileInput } });
    const { root } = baseRoot({ selectors: { '[data-photo-form]': photoForm, '[data-photo-status]': photoStatus } });
    const reloads = { count: 0 };
    const requests = [];

    await runEditor({
      data: editorData({ profile: { id: 'profile-a', displayName: 'Ana', slug: 'ana', programs: [], socials: {}, published: true, hidden: false, version: 37 } }),
      root,
      reloads,
      fetch: async (url, options = {}) => {
        requests.push({ url, options });
        if (url === 'https://creator-photos.example.invalid/') {
          harness.photos.objects.seed(options.body.get('key'), jpeg);
          return new Response(null, { status: 204 });
        }
        if (url.startsWith('/api/creador/foto/') && url.endsWith('/finalizar/') && advanceBeforeFinalize) {
          const current = await harness.photos.store.get('profile:profile-a');
          const advanced = await harness.photos.store.transact({
            checks: [{ key: 'profile:profile-a', version: current.version }],
            puts: [{ key: 'profile:profile-a', value: { ...current, version: current.version + 1 } }],
          });
          assert.equal(advanced, true, 'simulate a valid profile write between photo authorization and commit');
        }
        const headers = new Headers(options.headers);
        headers.set('origin', SITE_ORIGIN);
        return harness.handler(new Request(new URL(url, SITE_ORIGIN), { ...options, headers }));
      },
    });

    await photoForm.dispatch('submit');
    return { ...harness, photoStatus, reloads, requests };
  }

  const authorizationConflict = await runPhoto({ photoVersion: 38 });
  assert.equal(authorizationConflict.requests.filter(({ url }) => url.endsWith('/autorizar/')).length, 1);
  assert.equal(authorizationConflict.requests.some(({ url }) => url === 'https://creator-photos.example.invalid/'), false);
  assert.match(authorizationConflict.photoStatus.textContent, /Recarga antes de volver a intentar la foto/);
  assert.equal(authorizationConflict.reloads.count, 0, 'the known conflict gives the creator an explicit choice to reload');

  const finalizationConflict = await runPhoto({ photoVersion: 37, advanceBeforeFinalize: true });
  assert.equal(finalizationConflict.requests.some(({ url }) => url === 'https://creator-photos.example.invalid/'), true);
  assert.equal(finalizationConflict.requests.filter(({ url }) => url.endsWith('/finalizar/')).length, 1);
  assert.match(finalizationConflict.photoStatus.textContent, /Recarga antes de volver a intentar la foto/);
  assert.equal(finalizationConflict.reloads.count, 0, 'a real commit-time conflict does not discard the selected file');
});

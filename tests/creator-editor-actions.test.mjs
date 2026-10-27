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

// Retired resource and placement UI actions are covered by the owner-link controller suite;
// their version, authorization, and transactional contracts remain in API-focused suites.

function attachSeriesMetadataForm(root, series) {
  const name = Object.assign(new TestElement(), { tagName: 'INPUT', type: 'text', name: 'name', value: series.name });
  const slug = Object.assign(new TestElement(), { tagName: 'INPUT', type: 'text', name: 'slug', value: series.slug });
  const description = Object.assign(new TestElement(), { tagName: 'TEXTAREA', name: 'description', value: series.description ?? '' });
  const saveButton = new TestElement();
  saveButton.tagName = 'BUTTON';
  const status = new TestElement();
  const section = new TestElement({ dataset: { seriesId: series.id }, selectors: { '[data-series-status]': status } });
  const form = new TestElement({
    values: { name, slug, description },
    selectors: { '[data-series-form-status]': status, 'closest:[data-series-id]': section },
    lists: {
      'input, textarea, select': [name, slug, description],
      'input, textarea, select, button': [name, slug, description, saveButton],
    },
  });
  section.selectors['[data-series-form]'] = form;
  for (const field of [name, slug, description]) field.form = form;
  root.lists['[data-series-form]'] ??= [];
  root.lists['[data-series-form]'].push(form);
  root.lists['input, textarea, select'] ??= [];
  root.lists['input, textarea, select'].push(name, slug, description);
  root.lists['button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]'] ??= [];
  root.lists['button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]'].push(saveButton);
  return { name, slug, description, saveButton, status, section, form };
}

function seriesCreateTransitionFixture(existingSeries) {
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
  const { root } = baseRoot({
    lists: {
      '[data-series-create-form]': [seriesCreateForm],
      '[data-series-form]': [],
      '[data-move]': [moveButton],
      '[data-move], [data-remove-link], [data-featured], [data-directory], [data-readd-link], [data-series-add-chapter-form] button, [data-series-move], [data-series-remove-chapter], [data-delete-series]': [moveButton],
      'input, textarea, select': [name, slug, description],
      'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [refresh, moveButton],
    },
    selectors: {
      '[data-series-create-form]': seriesCreateForm,
      '[data-view-transition]': transition,
      '[data-view-transition-shell]': new TestElement(),
      '[data-refresh-view]': refresh,
    },
  });
  const otherSeries = attachSeriesMetadataForm(root, existingSeries);
  return { root, seriesCreateForm, name, slug, description, seriesStatus, transition, refresh, moveButton, otherSeries };
}

function seriesTransitionData(profileVersion = 37) {
  const existingSeries = {
    id: 'series-existing', name: 'Otra serie', slug: 'otra-serie', description: 'Descripción inicial', version: 3,
  };
  return {
    ...editorData({
      profile: { ...editorData().profile, id: 'profile-a', slug: 'ana', version: profileVersion },
      links: [{
        placementId: 'placement-a', resourceId: 'resource-transition', title: 'Capítulo',
        url: 'https://example.com/transition', description: '', featured: false, position: 10,
        selectedForDirectory: true, hidden: false, directoryApproval: 'pending',
        resourceVersion: 1, placementVersion: 1, series: [],
      }],
      series: [existingSeries],
    }),
    existingSeries,
  };
}

test('crear una serie conserva un borrador de otra serie y exige guardarlo o revertirlo antes de actualizar', async () => {
  const { existingSeries, ...initial } = seriesTransitionData();
  const fixture = seriesCreateTransitionFixture(existingSeries);
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
        series: { id: 'series-created', name: 'Mi serie', slug: 'mi-serie', version: 1 },
        versionChanges: [
          { entity: 'profile', id: 'profile-a', before: 37, after: 38 },
          { entity: 'series', id: 'series-created', before: 0, after: 1 },
        ],
      }, { status: 201 });
      if (path === `/api/creador/series/${existingSeries.id}/`) return Response.json({
        series: { ...existingSeries, name: body.name, slug: body.slug, description: body.description, version: 4 },
        versionChanges: [
          { entity: 'profile', id: 'profile-a', before: 38, after: 39 },
          { entity: 'series', id: existingSeries.id, before: 3, after: 4 },
        ],
      });
      return new Response('{}', { status: 404 });
    },
  });

  fixture.otherSeries.description.value = 'Corrección de serie pendiente';
  fixture.name.value = 'Mi serie';
  fixture.slug.value = 'mi-serie';
  await fixture.seriesCreateForm.dispatch('submit');
  assert.match(fixture.seriesStatus.textContent, /guarda los cambios pendientes en los otros formularios/);
  assert.equal(fixture.otherSeries.description.value, 'Corrección de serie pendiente');
  assert.equal(reloads.count, 0);
  assert.equal(fixture.moveButton.disabled, true, 'list controls wait for the created series to be rendered');
  await fixture.refresh.dispatch('click');
  assert.equal(reloads.count, 0, 'refresh cannot discard the series correction');

  await fixture.otherSeries.form.dispatch('submit');
  assert.equal(writes.length, 2);
  assert.equal(writes[0].body.profileVersion, 37);
  assert.equal(writes[1].body.profileVersion, 38, 'the creation receipt advances the profile version for the other series');
  assert.equal(writes[1].body.version, 3, 'the unchanged series keeps its observed version');
  assert.equal(writes[1].body.description, 'Corrección de serie pendiente');
  assert.equal(reloads.count, 1, 'saving the remaining residual form completes the safe refresh');
});

test('revertir el borrador de otra serie permite actualizar tras crear una serie', async () => {
  const { existingSeries, ...initial } = seriesTransitionData();
  const fixture = seriesCreateTransitionFixture(existingSeries);
  const reloads = { count: 0 };
  await runEditor({
    data: initial, root: fixture.root, reloads,
    fetch: async () => Response.json({
      series: { id: 'series-created', name: 'Mi serie', slug: 'mi-serie', version: 1 },
      versionChanges: [
        { entity: 'profile', id: 'profile-a', before: 37, after: 38 },
        { entity: 'series', id: 'series-created', before: 0, after: 1 },
      ],
    }, { status: 201 }),
  });
  fixture.otherSeries.description.value = 'Borrador de otra serie';
  fixture.name.value = 'Mi serie';
  fixture.slug.value = 'mi-serie';
  await fixture.seriesCreateForm.dispatch('submit');
  fixture.otherSeries.description.value = existingSeries.description;
  await fixture.refresh.dispatch('click');
  assert.equal(reloads.count, 1, 'manual refresh is safe after reverting the other series form');
});

test('un recibo incompatible conserva el borrador de serie y permite revertirlo antes de actualizar', async () => {
  const { existingSeries, ...initial } = seriesTransitionData();
  const fixture = seriesCreateTransitionFixture(existingSeries);
  const reloads = { count: 0 };
  await runEditor({
    data: initial,
    root: fixture.root,
    reloads,
    fetch: async () => Response.json({
      series: { id: 'series-created', name: 'Mi serie', slug: 'mi-serie', version: 1 },
      versionChanges: [
        { entity: 'profile', id: 'profile-a', before: 36, after: 37 },
        { entity: 'series', id: 'series-created', before: 0, after: 1 },
      ],
    }, { status: 201 }),
  });
  fixture.otherSeries.description.value = 'Corrección pendiente';
  fixture.name.value = 'Mi serie';
  fixture.slug.value = 'mi-serie';
  await fixture.seriesCreateForm.dispatch('submit');
  assert.match(fixture.transition.textContent, /El recibo no coincide/);
  assert.equal(fixture.otherSeries.description.value, 'Corrección pendiente');
  assert.equal(fixture.otherSeries.saveButton.disabled, false, 'the independent series correction remains editable');
  await fixture.refresh.dispatch('click');
  assert.equal(reloads.count, 0, 'the receipt gap cannot discard the pending series correction');
  fixture.otherSeries.description.value = existingSeries.description;
  await fixture.refresh.dispatch('click');
  assert.equal(reloads.count, 1, 'refresh is available after the other series correction is reverted');
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
  const draft = attachSeriesMetadataForm(fixture.root, series);
  fixture.fields.push(draft.name, draft.slug, draft.description);
  fixture.buttons.push(draft.name, draft.slug, draft.description, draft.saveButton);
  return draft;
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

test('los recibos de serie avanzan la versión del perfil y conservan el borrador de otra serie', async () => {
  const editor = await createSeriesDeleteEditor({ otherDrafts: true });
  const { fixture, page, data, api } = editor;
  const link = data.links[0];
  fixture.description.value = 'Descripción nueva de la serie';
  fixture.otherSeries.description.value = 'Descripción local de otra serie';
  await fixture.seriesForm.dispatch('submit');
  assert.equal(page.requests[0].body.profileVersion, data.profile.version,
    'series metadata starts from its observed profile version');
  assert.equal(page.reloads.count, 0, 'the other series correction stays open after this save');
  assert.equal(fixture.otherSeries.description.value, 'Descripción local de otra serie');
  const afterSeriesSave = await (await api('/api/creador/perfil', 'GET')).json();

  fixture.chapterSelect.value = link.placementId;
  await fixture.chapterForm.dispatch('submit');
  assert.equal(page.requests[1].method, 'PUT');
  assert.equal(page.requests[1].body.profileVersion, afterSeriesSave.profile.version,
    'the residual controller applied the profile version from the series write receipt');
  assert.equal(page.reloads.count, 0, 'the other series correction remains pending');

  const afterChapterSave = await (await api('/api/creador/perfil', 'GET')).json();
  await fixture.otherSeries.form.dispatch('submit');
  assert.equal(page.requests[2].body.profileVersion, afterChapterSave.profile.version,
    'the chapter receipt also advances the observed profile version for another series');
  assert.equal(page.requests[2].body.version, data.series.find(({ slug }) => slug === 'otra-serie').version);
  assert.equal(page.requests[2].body.description, 'Descripción local de otra serie');
  assert.equal(page.requests[2].status, 200);
  assert.equal(page.reloads.count, 1, 'saving the last series draft completes the safe refresh');
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

test('confirmed deletion keeps another series draft saveable and advances the profile receipt', async () => {
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
  const { fixture, page, data, api } = editor;
  fixture.chapterSelect.value = data.links[0].placementId;
  fixture.otherSeries.description.value = 'Descripción de otra serie';

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
  assert.equal(fixture.otherSeries.saveButton.disabled, false);
  assert.equal(page.reloads.count, 0, 'the other series draft remains pending after the deleted series controls are discarded');

  const savedProfile = await (await api('/api/creador/perfil', 'GET')).json();
  await fixture.otherSeries.form.dispatch('submit');
  assert.equal(page.requests[1].status, 200);
  assert.equal(page.requests[1].body.description, 'Descripción de otra serie');
  assert.equal(page.requests[1].body.profileVersion, savedProfile.profile.version,
    'the residual editor applied the profile version advanced by the deleted series receipt');
  assert.equal(page.reloads.count, 1, 'saving the remaining series draft completes the safe refresh once');
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

test('reordenar con un borrador de serie conserva la corrección y pausa controles del orden anterior', async () => {
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
  const beforeSeries = await (await apiCall('/api/creador/perfil')).json();
  const createdSeries = await apiCall('/api/creador/series', 'POST', {
    name: 'Otra serie', slug: 'otra-serie', profileVersion: beforeSeries.profile.version,
  });
  assert.equal(createdSeries.status, 201);
  const initial = await (await apiCall('/api/creador/perfil')).json();
  const sortedTitles = (links) => [...links]
    .sort((left, right) => Number(right.featured) - Number(left.featured) || left.position - right.position)
    .map((link) => link.title);
  assert.deepEqual(sortedTitles(initial.links), ['A', 'B', 'C']);

  const item = new TestElement({ dataset: { placementId: c.placementId } });
  const moveUp = new TestElement({
    dataset: { move: 'up' },
    selectors: { 'closest:[data-placement-id]': item },
  });
  moveUp.tagName = 'BUTTON';
  const refresh = new TestElement();
  refresh.tagName = 'BUTTON';
  const linksStatus = new TestElement();
  const transition = new TestElement();
  const { root } = baseRoot({
    selectors: {
      '[data-links-status]': linksStatus,
      '[data-view-transition]': transition,
      '[data-view-transition-shell]': new TestElement(),
      '[data-refresh-view]': refresh,
    },
    lists: {
      '[data-move]': [moveUp],
      '[data-move], [data-remove-link], [data-featured], [data-directory], [data-readd-link], [data-series-add-chapter-form] button, [data-series-move], [data-series-remove-chapter], [data-delete-series]': [moveUp],
      'input, textarea, select': [],
      'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [moveUp, refresh],
    },
  });
  const seriesDraft = attachSeriesMetadataForm(root, initial.series[0]);
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

  seriesDraft.description.value = 'Descripción con una corrección pendiente';
  await moveUp.dispatch('click');
  const updated = await (await apiCall('/api/creador/perfil')).json();
  assert.deepEqual(sortedTitles(updated.links), ['A', 'C', 'B'], 'the real service changes only the observed non-featured order');
  assert.equal(requests.length, 1, 'the explicit reorder action is the only write');
  assert.equal(seriesDraft.description.value, 'Descripción con una corrección pendiente');
  assert.equal(root.querySelector('[data-view-transition-shell]').hidden, false);
  assert.equal(moveUp.disabled, true, 'move controls based on the old order are stale too');
  await refresh.dispatch('click');
  assert.equal(reloads.count, 0, 'the pending series correction is protected from refresh');
  assert.match(transition.textContent, /Guarda los cambios pendientes o revierte/);

  seriesDraft.description.value = initial.series[0].description ?? '';
  await refresh.dispatch('click');
  assert.equal(reloads.count, 1, 'refresh is available after the series correction is reverted');
});

// The removed profile form no longer contributes drafts here; residual receipt behavior is exercised by series forms below.

test('la recuperación de sesión conserva una edición de serie y sus versiones observadas', async () => {
  const editor = await createSeriesDeleteEditor();
  const { auth, api, data, fixture, mainSeries, page } = editor;
  fixture.description.value = 'Corrección local conservada';
  auth.current = { state: 'anonymous' };
  await fixture.seriesForm.dispatch('submit');
  assert.equal(page.requests[0].path, `/api/creador/series/${mainSeries.id}/`);
  assert.equal(page.requests[0].status, 401);

  auth.current = { state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-renewed', isAdmin: false };
  await page.recovery.check.dispatch('click');
  await settleSessionCheck();
  assert.equal(page.requests[1].path, '/api/creador/sesion/');
  assert.equal(page.requests[1].status, 200);
  assert.equal(page.requests.length, 2, 'session recovery checks identity without replaying the failed series save');

  const external = await api(`/api/creador/series/${mainSeries.id}`, 'PATCH', {
    version: mainSeries.version,
    profileVersion: data.profile.version,
    name: 'Cambio externo',
    slug: mainSeries.slug,
    description: mainSeries.description ?? '',
  });
  assert.equal(external.status, 200);
  await fixture.seriesForm.dispatch('submit');

  const retry = page.requests.at(-1);
  assert.equal(retry.path, `/api/creador/series/${mainSeries.id}/`);
  assert.equal(retry.status, 409);
  assert.equal(retry.body.version, mainSeries.version, 'session recovery does not adopt the external series version');
  assert.equal(retry.body.profileVersion, data.profile.version, 'the retry uses the profile version this editor observed');
  assert.equal(retry.csrf, 'csrf-renewed');
  assert.equal(fixture.description.value, 'Corrección local conservada');
  assert.equal(page.reloads.count, 0, 'the stale write cannot refresh away the correction');
});

// Retired case: Profile creation and its recovery now belong to /cuenta/; the owner-controller acceptance suite covers this first-create recovery.

// Retired case: Profile creation and its authority recovery now belong to /cuenta/; the owner-controller acceptance suite rejects a different account and role.

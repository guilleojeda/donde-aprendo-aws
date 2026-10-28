import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

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

test('el bundle residual de solicitudes ya no instala acciones de serie o capítulo', async () => {
  const seriesCreateForm = new TestElement();
  seriesCreateForm.tagName = 'FORM';
  const seriesEditForm = new TestElement();
  seriesEditForm.tagName = 'FORM';
  const moveButton = new TestElement();
  moveButton.tagName = 'BUTTON';
  const transition = new TestElement();
  const transitionShell = new TestElement();
  const refresh = new TestElement();
  refresh.tagName = 'BUTTON';
  const { root } = baseRoot({
    selectors: {
      '[data-series-create-form]': seriesCreateForm,
      '[data-view-transition]': transition,
      '[data-view-transition-shell]': transitionShell,
      '[data-refresh-view]': refresh,
    },
    lists: {
      '[data-series-create-form]': [seriesCreateForm],
      '[data-series-form]': [seriesEditForm],
      '[data-series-move]': [moveButton],
      '[data-move], [data-remove-link], [data-featured], [data-directory], [data-readd-link], [data-series-add-chapter-form] button, [data-series-move], [data-series-remove-chapter], [data-delete-series]': [moveButton],
      'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': [moveButton, refresh],
    },
  });
  const data = editorData({ series: [{ id: 'series-a', name: 'Ruta A', slug: 'ruta-a', version: 1 }] });
  const requests = [];
  await runEditor({
    data,
    root,
    reloads: { count: 0 },
    fetch: async (url, options = {}) => {
      requests.push({ url, method: options.method ?? 'GET' });
      return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
    },
  });

  assert.equal(seriesCreateForm.listeners.get('submit')?.length ?? 0, 0,
    'series creation is handled by the owner view, not the residual claims editor');
  assert.equal(seriesEditForm.listeners.get('submit')?.length ?? 0, 0,
    'metadata edits are handled by the owner view');
  assert.equal(moveButton.listeners.get('click')?.length ?? 0, 0,
    'chapter movement is handled by the owner view');
  assert.equal(requests.filter(({ method }) => method !== 'GET').length, 0,
    'the residual controller does not write series data');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const ORIGIN = 'https://dondeaprendoaws.com';
const bundle = async (name) => (await build({
  entryPoints: [new URL(`../src/scripts/${name}.ts`, import.meta.url).pathname],
  bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2022',
})).outputFiles[0].text;
const [logoutCode, ownerCode] = await Promise.all([bundle('account-logout'), bundle('creator-owner')]);

class Element {
  constructor(tagName = 'DIV', options = {}) {
    Object.assign(this, { tagName, dataset: {}, value: '', textContent: '', hidden: false, disabled: false,
      selectors: {}, controls: [], listeners: new Map(), isConnected: true, ...options });
  }
  querySelector(selector) { return this.selectors[selector] ?? null; }
  querySelectorAll(selector) {
    if (selector === 'input, textarea, select') return this.controls;
    return [];
  }
  addEventListener(type, listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  dispatchEvent(event) {
    Object.defineProperty(event, 'target', { value: this, configurable: true });
    for (let element = this; element; element = event.bubbles ? element.parentElement : null) {
      for (const listener of element.listeners.get(event.type) ?? []) listener(event);
    }
    return !event.defaultPrevented;
  }
  async emit(type) {
    const event = { type, target: this, preventDefault() {} };
    for (let element = this; element; element = element.parentElement) {
      for (const listener of element.listeners.get(type) ?? []) await listener(event);
    }
  }
  requestSubmit() { void this.emit('submit'); }
  setAttribute(name, value) { this[name] = value; }
  getAttribute(name) { return this[name] ?? null; }
  removeAttribute(name) { delete this[name]; }
  matches(selector) {
    return selector.split(',').some((part) => {
      const attribute = part.trim().match(/^\[data-([a-z-]+)\]$/)?.[1];
      const key = attribute?.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      return key && key in this.dataset;
    });
  }
  closest(selector) { return this.matches(selector) ? this : null; }
  reportValidity() { return true; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function surface() {
  const token = new Element('INPUT', { name: 'csrfToken', value: 'old-csrf', type: 'hidden' });
  const button = new Element('BUTTON', { disabled: true });
  const status = new Element();
  const logout = new Element('FORM', { selectors: {
    'input[name="csrfToken"]': token, 'button[type="submit"]': button, '[data-account-logout-status]': status,
  }, controls: [token] });
  token.form = logout;
  const name = new Element('INPUT', { name: 'displayName' });
  const slug = new Element('INPUT', { name: 'slug' });
  const create = new Element('FORM', { dataset: { ownerForm: 'crear' }, controls: [name, slug], selectors: {
    '[name="displayName"]': name, '[name="slug"]': slug,
  } });
  name.form = create;
  slug.form = create;
  const dialog = new Element('DIALOG');
  const exit = new Element('DIV', { hidden: true });
  const choices = Object.fromEntries(['save', 'discard', 'continue'].map((choice) => [choice,
    new Element('BUTTON', { dataset: { [`ownerExit${choice[0].toUpperCase()}${choice.slice(1)}`]: '' } }),
  ]));
  const check = new Element('BUTTON');
  const root = new Element('DIV', {
    dataset: { csrf: 'old-csrf', sessionBinding: 'a'.repeat(64) },
    controls: [name, slug, token],
    selectors: {
      '[data-owner-dialog]': dialog, '[data-owner-exit-prompt]': exit,
      '[data-account-logout]': logout, 'form[data-owner-form="crear"]': create,
      '[data-session-recovery-check]': check,
    },
  });
  logout.parentElement = root;
  name.parentElement = create;
  slug.parentElement = create;
  create.parentElement = root;
  for (const choice of Object.values(choices)) choice.parentElement = root;
  const document = {
    querySelector(selector) {
      if (selector === '[data-creator-owner]') return root;
      if (selector === '#creator-owner-data') return { textContent: JSON.stringify({ profile: null, links: [], editableResources: [], claims: [], series: [] }) };
      return null;
    },
    querySelectorAll() { return [logout]; },
  };
  const destinations = [];
  const window = { location: { origin: ORIGIN, href: `${ORIGIN}/cuenta/`, assign: (value) => destinations.push(value) },
    addEventListener() {}, requestAnimationFrame: (callback) => callback() };
  return { token, button, status, logout, root, create, name, slug, dialog, exit, choices, check, document, window, destinations };
}

function mount(ui, fetch, withOwner = false) {
  const context = { document: ui.document, window: ui.window, fetch, Event, URL, URLSearchParams, Response,
    HTMLElement: Element, HTMLFormElement: Element, TextEncoder,
    FormData: class {
      constructor(form) { this.form = form; }
      get(name) { return this.form.controls.find((control) => control.name === name)?.value; }
      getAll() { return []; }
    },
  };
  if (withOwner) runInNewContext(ownerCode, context);
  runInNewContext(logoutCode, context);
}

test('logout uses a fixed browser-origin POST, suppresses duplicates, and retries uncertainty without navigating', async () => {
  const ui = surface();
  const requests = [];
  let resolve;
  mount(ui, async (url, options) => {
    requests.push({ url, options });
    return new Promise((done) => { resolve = done; });
  });
  assert.equal(ui.button.disabled, false);
  const first = ui.logout.emit('submit');
  await ui.logout.emit('submit');
  assert.equal(requests.length, 1);
  const { url, options } = requests[0];
  assert.equal(url, '/cuenta/salir/');
  assert.equal(options.method, 'POST');
  assert.equal(options.mode, 'cors');
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers.origin, undefined, 'Origin belongs to the browser');
  assert.equal(options.headers.accept, 'application/json');
  assert.equal(options.body.get('csrfToken'), 'old-csrf');
  resolve(Response.json({ message: 'No pudimos confirmar el cierre de sesión.' }, { status: 503 }));
  await first;
  assert.equal(ui.button.disabled, false);
  assert.match(ui.button.textContent, /Reintentar/);
  assert.equal(ui.destinations.length, 0);
  const retry = ui.logout.emit('submit');
  resolve(Response.json({ redirect: 'https://provider.example/logout' }));
  await retry;
  assert.deepEqual(ui.destinations, ['https://provider.example/logout']);
});

test('network, malformed JSON and invalid destinations retain a usable retry and never navigate', async () => {
  for (const result of [new Error('network'), new Response('<html>unavailable</html>'), Response.json({ redirect: 'javascript:alert(1)' })]) {
    const ui = surface();
    mount(ui, async () => { if (result instanceof Error) throw result; return result; });
    await ui.logout.emit('submit');
    assert.equal(ui.button.disabled, false);
    assert.match(ui.status.textContent, /No pudimos confirmar/);
    assert.equal(ui.destinations.length, 0);
  }
});

test('the owner blocks logout before POST for unsaved edits and an active write', async () => {
  const ui = surface();
  const requests = [];
  let finishWrite;
  mount(ui, async (url) => {
    requests.push(url);
    return new Promise((resolve) => { finishWrite = resolve; });
  }, true);
  ui.name.value = 'Corrección sin guardar';
  await ui.logout.emit('submit');
  assert.equal(requests.length, 0);
  assert.equal(ui.exit.hidden, false);
  assert.equal(ui.dialog.open, true);
  const write = ui.create.emit('submit');
  await ui.logout.emit('submit');
  assert.deepEqual(requests, ['/api/creador/perfil/']);
  finishWrite(Response.json({ error: 'SESSION_EXPIRED' }, { status: 401 }));
  await write;
});

test('same-account recovery updates the actual logout token without creating unsaved changes', async () => {
  const ui = surface();
  const requests = [];
  mount(ui, async (url, options) => {
    requests.push({ url, options });
    if (url === '/api/creador/perfil/') return Response.json({ error: 'SESSION_EXPIRED' }, { status: 401 });
    if (url === '/api/creador/sesion/') return Response.json({ csrfToken: 'renewed-csrf' });
    return Response.json({ redirect: 'https://provider.example/logout' });
  }, true);
  ui.name.value = 'Ana';
  ui.slug.value = 'ana';
  await ui.create.emit('submit');
  await ui.check.emit('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ui.token.value, 'renewed-csrf');
  ui.name.value = '';
  ui.slug.value = '';
  await ui.logout.emit('submit');
  const logoutRequest = requests.find(({ url }) => url === '/cuenta/salir/');
  assert.ok(logoutRequest, 'changing a CSRF token must not leave the owner form dirty');
  assert.equal(logoutRequest.options.body.get('csrfToken'), 'renewed-csrf');
  assert.deepEqual(ui.destinations, ['https://provider.example/logout']);
});

test('logout resumes only after save or discard; continuing preserves edits and restores focus', async () => {
  for (const choice of ['continue', 'discard', 'save']) {
    const ui = surface();
    const requests = [];
    mount(ui, async (url) => {
      requests.push(url);
      if (url === '/api/creador/perfil/') return Response.json({
        profile: { id: 'creator-a', displayName: 'Ana', slug: 'ana', version: 1, published: false, hidden: false, programs: [], socials: {} },
        versionChanges: [{ entity: 'profile', id: 'creator-a', before: 0, after: 1 }],
      });
      return Response.json({ redirect: 'https://provider.example/logout' });
    }, true);
    ui.name.value = 'Ana';
    await ui.name.emit('input');
    await ui.logout.emit('submit');
    assert.equal(requests.length, 0);
    await ui.choices[choice].emit('click');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ui.dialog.open, false);
    assert.equal(ui.button.focused, true);
    if (choice === 'continue') {
      assert.equal(ui.name.value, 'Ana');
      assert.equal(ui.slug.value, 'ana');
      assert.equal(requests.length, 0);
      assert.equal(ui.destinations.length, 0);
    } else {
      assert.deepEqual(requests, choice === 'save' ? ['/api/creador/perfil/', '/cuenta/salir/'] : ['/cuenta/salir/']);
      assert.deepEqual(ui.destinations, ['https://provider.example/logout']);
    }
  }
});

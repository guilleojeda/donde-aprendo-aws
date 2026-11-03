import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const ORIGIN = 'https://dondeaprendoaws.com';
const bundle = async (name) => (await build({
  entryPoints: [new URL(`../src/scripts/${name}.ts`, import.meta.url).pathname],
  bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2022',
})).outputFiles[0].text;
const logoutCode = await bundle('account-logout');

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
  hasAttribute(name) { return this.getAttribute(name) !== null; }
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
  const document = {
    querySelectorAll() { return [logout]; },
  };
  const destinations = [];
  const window = { location: { origin: ORIGIN, href: `${ORIGIN}/cuenta/`, assign: (value) => destinations.push(value) },
    addEventListener() {}, requestAnimationFrame: (callback) => callback() };
  return { token, button, status, logout, document, window, destinations };
}

function mount(ui, fetch) {
  const context = { document: ui.document, window: ui.window, fetch, Event, URL, URLSearchParams, Response,
    HTMLElement: Element, HTMLFormElement: Element, TextEncoder,
    FormData: class {
      constructor(form) { this.form = form; }
      get(name) { return this.form.controls.find((control) => control.name === name)?.value; }
      getAll() { return []; }
    },
  };
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

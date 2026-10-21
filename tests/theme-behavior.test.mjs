import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const themeScriptPath = fileURLToPath(new URL('../src/scripts/theme.js', import.meta.url));
const darkStyleId = 'site-theme-dark';
const toggleSelector = '[data-theme-toggle]';
const storageKey = 'dondeaprendoaws.theme';
const systemMedia = '(prefers-color-scheme: dark)';

// Contrato público de integración para theme.js: un estilo oscuro con id estable,
// media como estado de activación y un botón con nombre accesible estable. Las
// pruebas observan DOM, storage y eventos del navegador; no importan funciones
// internas ni prescriben cómo el controlador busca esos nodos.

class EventTarget {
  listeners = new Map();

  addEventListener(type, listener, options = {}) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push({ listener, once: Boolean(options?.once) });
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry.listener !== listener));
  }

  emit(type, event = {}) {
    const browserEvent = { type, target: this, currentTarget: this, ...event };
    for (const entry of [...(this.listeners.get(type) ?? [])]) {
      if (entry.once) this.removeEventListener(type, entry.listener);
      if (typeof entry.listener === 'function') entry.listener.call(this, browserEvent);
      else entry.listener.handleEvent(browserEvent);
    }
    const propertyListener = this[`on${type}`];
    if (typeof propertyListener === 'function') propertyListener.call(this, browserEvent);
  }
}

class ClassList {
  values = new Set();

  add(...values) { for (const value of values) this.values.add(value); }
  remove(...values) { for (const value of values) this.values.delete(value); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const shouldAdd = force ?? !this.values.has(value);
    if (shouldAdd) this.values.add(value);
    else this.values.delete(value);
    return shouldAdd;
  }
}

class Element extends EventTarget {
  constructor(document, { hidden = false } = {}) {
    super();
    this.document = document;
    this.attributes = new Map();
    this.classList = new ClassList();
    this.hidden = hidden;
    if (hidden) this.attributes.set('hidden', '');
    this.dataset = new Proxy({}, {
      set: (_target, name, value) => {
        const attribute = `data-${String(name).replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`;
        this.setAttribute(attribute, value);
        return true;
      },
    });
  }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return this.attributes.has(name); }
  setAttribute(name, value) {
    const stringValue = String(value);
    this.attributes.set(name, stringValue);
    if (name === 'hidden') this.hidden = true;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'hidden') this.hidden = false;
  }
  focus() { this.document.activeElement = this; }
  click() {
    this.focus();
    this.emit('click', { preventDefault() {} });
  }
}

class ThemeStyle extends Element {
  constructor(document) {
    super(document);
    this.media = systemMedia;
  }

  get media() { return this.getAttribute('media') ?? ''; }
  set media(value) { this.setAttribute('media', value); }
}

class MediaQueryList extends EventTarget {
  constructor(matches) {
    super();
    this.matches = matches;
  }

  change(matches) {
    this.matches = matches;
    this.emit('change', { matches });
  }
}

class LocalStorage {
  constructor({ initialValue = null, readError = null, writeError = null, onWrite = null } = {}) {
    this.values = new Map();
    this.calls = [];
    this.readError = readError;
    this.writeError = writeError;
    this.onWrite = onWrite;
    if (initialValue !== null) this.values.set(storageKey, String(initialValue));
  }

  getItem(key) {
    this.calls.push({ operation: 'getItem', key });
    if (this.readError) throw this.readError;
    return this.values.get(String(key)) ?? null;
  }

  setItem(key, value) {
    this.calls.push({ operation: 'setItem', key, value: String(value) });
    this.onWrite?.(key, String(value));
    if (this.writeError) throw this.writeError;
    this.values.set(String(key), String(value));
  }
}

function missingThemeScript(scenario) {
  assert.equal(
    existsSync(themeScriptPath),
    true,
    `Falta el producto src/scripts/theme.js; no se puede comprobar ${scenario}.`,
  );
  return readFileSync(themeScriptPath, 'utf8');
}

function createPage({
  initialValue = null,
  systemDark = false,
  readError = null,
  storageAccessError = null,
  writeError = null,
  sharedStorage = null,
  onWrite = null,
} = {}) {
  const forbidden = {
    fetch: 0,
    cookieRead: 0,
    cookieWrite: 0,
    sessionStorage: 0,
    url: 0,
    history: 0,
    location: 0,
  };
  const media = new MediaQueryList(systemDark);
  const document = new EventTarget();
  document.readyState = 'loading';
  document.activeElement = null;
  document.documentElement = new Element(document);
  document.body = new Element(document);
  document.buttonAvailable = false;
  const darkStyle = new ThemeStyle(document);
  const toggle = new Element(document, { hidden: true });
  const unrelatedMenu = new Element(document);
  const searchInput = Object.assign(new Element(document), { tagName: 'INPUT', type: 'search', value: 'lambda', defaultValue: 'lambda' });
  const emailInput = Object.assign(new Element(document), { tagName: 'INPUT', type: 'email', value: 'ada@example.test', defaultValue: 'ada@example.test' });
  const checkedFilter = Object.assign(new Element(document), { tagName: 'INPUT', type: 'checkbox', checked: true, defaultChecked: true });
  const form = Object.assign(new Element(document), {
    tagName: 'FORM',
    elements: [searchInput, emailInput, checkedFilter],
    resetCount: 0,
    reset() {
      this.resetCount += 1;
      for (const input of this.elements) {
        if ('value' in input) input.value = input.defaultValue;
        if ('checked' in input) input.checked = input.defaultChecked;
      }
    },
  });
  document.forms = [form];

  const findElement = (selector) => {
    const selectors = String(selector).split(',').map((value) => value.trim());
    if (selectors.some((value) => value === `#${darkStyleId}`)) return darkStyle;
    if (selectors.some((value) => value === toggleSelector || value.includes('data-theme-toggle'))) {
      return document.buttonAvailable ? toggle : null;
    }
    if (selectors.some((value) => /^form\b/iu.test(value))) return form;
    if (selectors.some((value) => /^input(?:\b|\[|\.|#)/iu.test(value))) return searchInput;
    return null;
  };
  document.querySelector = findElement;
  document.querySelectorAll = (selector) => {
    const selectors = String(selector).split(',').map((value) => value.trim());
    const found = selectors.flatMap((value) => {
      if (/^form\b/iu.test(value)) return [form];
      if (/^input(?:\b|\[|\.|#)/iu.test(value)) return [searchInput, emailInput, checkedFilter];
      const element = findElement(value);
      return element ? [element] : [];
    });
    return [...new Set(found)];
  };
  document.getElementById = (id) => id === darkStyleId ? darkStyle : null;
  document.getElementsByTagName = (name) => name.toLowerCase() === 'style' ? [darkStyle] : [];
  Object.defineProperty(document, 'cookie', {
    get() { forbidden.cookieRead += 1; return ''; },
    set() { forbidden.cookieWrite += 1; },
  });

  const storage = sharedStorage ?? new LocalStorage({ initialValue, readError, writeError, onWrite });
  if (sharedStorage && onWrite) sharedStorage.onWrite = onWrite;
  const window = new EventTarget();
  window.document = document;
  window.matchMedia = (query) => {
    window.mediaQueries ??= [];
    window.mediaQueries.push(query);
    return media;
  };
  Object.defineProperty(window, 'localStorage', {
    get() {
      if (storageAccessError) throw storageAccessError;
      return storage;
    },
  });
  window.fetch = (..._args) => { forbidden.fetch += 1; return Promise.resolve({}); };
  window.location = new Proxy({ href: 'https://example.test/', search: '', hash: '' }, {
    set(target, property, value) {
      if (['href', 'search', 'hash'].includes(property)) forbidden.location += 1;
      target[property] = value;
      return true;
    },
  });
  window.history = {
    pushState() { forbidden.history += 1; },
    replaceState() { forbidden.history += 1; },
  };
  Object.defineProperty(window, 'sessionStorage', {
    get() { forbidden.sessionStorage += 1; return storage; },
  });

  class TrackedURL extends URL {
    constructor(...args) {
      forbidden.url += 1;
      super(...args);
    }
  }
  window.URL = TrackedURL;

  const context = {
    document,
    window,
    matchMedia: window.matchMedia,
    fetch: window.fetch,
    URL: TrackedURL,
    location: window.location,
    history: window.history,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
  };
  Object.defineProperty(context, 'sessionStorage', {
    get() { forbidden.sessionStorage += 1; return storage; },
  });
  Object.defineProperty(context, 'localStorage', {
    get() {
      if (storageAccessError) throw storageAccessError;
      return storage;
    },
  });

  return {
    document,
    window,
    media,
    darkStyle,
    toggle,
    storage,
    forbidden,
    unrelatedMenu,
    form,
    searchInput,
    emailInput,
    checkedFilter,
    start(scenario) {
      const source = missingThemeScript(scenario);
      runInNewContext(source, context, { filename: themeScriptPath });
    },
    domContentLoaded() {
      document.buttonAvailable = true;
      document.readyState = 'interactive';
      document.emit('DOMContentLoaded');
    },
  };
}

function assertTheme(page, { dark, media = dark ? 'all' : 'not all', button = true }) {
  assert.equal(page.darkStyle.getAttribute('media'), media, 'the public dark stylesheet media state matches the effective theme');
  for (const element of [page.document.documentElement, page.document.body, page.darkStyle, page.toggle]) {
    assert.equal(element.getAttribute('data-theme'), null, 'theme state is not duplicated in a data-theme attribute');
  }
  if (button) {
    assert.equal(page.toggle.hidden, false, 'the theme button is visible after initialization');
    assert.equal(page.toggle.getAttribute('aria-label'), 'Modo oscuro', 'the accessible button name stays stable');
    assert.equal(page.toggle.getAttribute('aria-pressed'), String(dark), 'aria-pressed reports whether dark mode is active');
  }
}

function assertApprovedStorageOnly(page) {
  assert.ok(page.storage.calls.every((call) => call.key === storageKey), 'theme preference uses only its own localStorage key');
  assert.ok(page.window.mediaQueries?.every((query) => query === systemMedia), 'the system preference uses the approved media query');
  assert.deepEqual(page.forbidden, {
    fetch: 0,
    cookieRead: 0,
    cookieWrite: 0,
    sessionStorage: 0,
    url: 0,
    history: 0,
    location: 0,
  }, 'theme preference does not use network, cookies, session storage, or URL state');
}

function namedError(name) {
  const error = new Error(name);
  error.name = name;
  return error;
}

test('applies a saved preference in the loading head before the header button exists', () => {
  const page = createPage({ initialValue: 'dark', systemDark: false });
  page.start('the early application of a saved dark preference');

  assert.equal(page.document.readyState, 'loading');
  assert.equal(page.document.querySelector(toggleSelector), null, 'the head runs before the header button is parsed');
  assert.equal(page.darkStyle.getAttribute('media'), 'all', 'saved dark preference is applied before DOMContentLoaded');
  assert.equal(page.storage.calls.some((call) => call.operation === 'setItem'), false, 'reading a preference does not write it back');

  page.domContentLoaded();
  assertTheme(page, { dark: true });
  assertApprovedStorageOnly(page);
});

test('an absent preference follows the system and updates the button without writing storage', () => {
  const page = createPage({ systemDark: true });
  page.start('system preference when the saved value is absent');
  assert.equal(page.darkStyle.getAttribute('media'), systemMedia);

  page.domContentLoaded();
  assert.equal(page.toggle.hidden, false);
  assert.equal(page.toggle.getAttribute('aria-label'), 'Modo oscuro');
  assert.equal(page.toggle.getAttribute('aria-pressed'), 'true');

  page.media.change(false);
  assertTheme(page, { dark: false, media: systemMedia });
  assert.equal(page.storage.calls.some((call) => call.operation === 'setItem'), false);
  assertApprovedStorageOnly(page);
});

test('an invalid saved value follows the system and is not rewritten as a third mode', () => {
  const page = createPage({ initialValue: 'system', systemDark: false });
  page.start('system preference when localStorage contains an invalid value');
  page.domContentLoaded();

  assertTheme(page, { dark: false, media: systemMedia });
  assert.equal(page.storage.calls.some((call) => call.operation === 'setItem'), false);
  page.media.change(true);
  assertTheme(page, { dark: true, media: systemMedia });
  assertApprovedStorageOnly(page);
});

test('a saved light choice suppresses the dark system palette', () => {
  const page = createPage({ initialValue: 'light', systemDark: true });
  page.start('manual light preference against a dark system preference');
  assert.equal(page.darkStyle.getAttribute('media'), 'not all');

  page.domContentLoaded();
  assertTheme(page, { dark: false });
  page.media.change(false);
  page.media.change(true);
  assertTheme(page, { dark: false });
  assertApprovedStorageOnly(page);
});

test('a saved dark choice enables the dark palette against a light system preference', () => {
  const page = createPage({ initialValue: 'dark', systemDark: false });
  page.start('manual dark preference against a light system preference');
  assert.equal(page.darkStyle.getAttribute('media'), 'all');

  page.domContentLoaded();
  assertTheme(page, { dark: true });
  page.media.change(true);
  page.media.change(false);
  assertTheme(page, { dark: true });
  page.toggle.click();
  assertTheme(page, { dark: false });
  assert.equal(page.storage.values.get(storageKey), 'light', 'toggling back to light persists the second mode');
  assertApprovedStorageOnly(page);
});

test('manual toggle takes effect before storage write and leaves focus and other UI state intact', () => {
  let observedAtWrite;
  const page = createPage({
    systemDark: false,
    onWrite: (key, value) => {
      observedAtWrite = { key, value, media: page.darkStyle.getAttribute('media'), pressed: page.toggle.getAttribute('aria-pressed') };
    },
  });
  page.start('toggle behavior and state preservation');
  page.domContentLoaded();
  page.unrelatedMenu.classList.add('is-open');
  page.document.body.classList.add('menu-is-open');
  page.toggle.focus();

  page.toggle.click();

  assert.deepEqual(observedAtWrite, { key: storageKey, value: 'dark', media: 'all', pressed: 'true' }, 'the visible mode changes before localStorage is written');
  assertTheme(page, { dark: true });
  assert.equal(page.document.activeElement, page.toggle, 'the toggle keeps keyboard focus');
  assert.equal(page.unrelatedMenu.classList.contains('is-open'), true, 'an open menu stays open');
  assert.equal(page.document.body.classList.contains('menu-is-open'), true, 'the open-menu body state stays intact');
  assert.equal(page.form.resetCount, 0, 'theme changes do not reset forms');
  assert.equal(page.searchInput.value, 'lambda', 'search input state stays intact');
  assert.equal(page.emailInput.value, 'ada@example.test', 'form text state stays intact');
  assert.equal(page.checkedFilter.checked, true, 'filter state stays intact');
  assert.equal(page.storage.values.get(storageKey), 'dark');
  assertApprovedStorageOnly(page);
});

test('a SecurityError while reading storage does not prevent system mode or later toggles', () => {
  const page = createPage({ systemDark: true, readError: namedError('SecurityError') });
  page.start('graceful handling of a denied localStorage read');
  assert.equal(page.darkStyle.getAttribute('media'), systemMedia);

  page.domContentLoaded();
  assertTheme(page, { dark: true, media: systemMedia });
  page.toggle.click();
  assertTheme(page, { dark: false });
  assert.equal(page.storage.values.get(storageKey), 'light', 'a permitted write still remembers the manual choice');
  assertApprovedStorageOnly(page);
});

test('a SecurityError while obtaining localStorage leaves the toggle working in memory', () => {
  const page = createPage({ systemDark: false, storageAccessError: namedError('SecurityError') });
  page.start('graceful handling of a denied localStorage property getter');
  page.domContentLoaded();

  page.toggle.click();

  assertTheme(page, { dark: true });
  assert.equal(page.document.activeElement, page.toggle);
  assert.equal(page.storage.calls.length, 0, 'an inaccessible storage object is never called');
  assertApprovedStorageOnly(page);
});

test('a QuotaExceededError while writing does not roll back the toggle or move focus', () => {
  const page = createPage({ systemDark: false, writeError: namedError('QuotaExceededError') });
  page.start('graceful handling of a full localStorage quota');
  page.domContentLoaded();
  page.toggle.click();

  assertTheme(page, { dark: true });
  assert.equal(page.document.activeElement, page.toggle);
  assert.equal(page.storage.values.has(storageKey), false, 'the failed write is not presented as persisted');
  assertApprovedStorageOnly(page);
});

test('a new document reads the choice written by the previous page in the same browser', () => {
  const firstPage = createPage({ systemDark: false });
  firstPage.start('saving a choice that a later full page navigation will read');
  firstPage.domContentLoaded();
  firstPage.toggle.click();
  assert.equal(firstPage.storage.values.get(storageKey), 'dark');

  const nextPage = createPage({ systemDark: false, sharedStorage: firstPage.storage });
  nextPage.start('reading the choice from a new document');
  assert.equal(nextPage.darkStyle.getAttribute('media'), 'all');
  nextPage.domContentLoaded();
  assertTheme(nextPage, { dark: true });
  assertApprovedStorageOnly(firstPage);
  assertApprovedStorageOnly(nextPage);
});

test('BFCache restoration rereads a saved preference only for a persisted pageshow', () => {
  const page = createPage({ initialValue: 'dark', systemDark: false });
  page.start('restoring a document from the back-forward cache');
  page.domContentLoaded();

  page.storage.values.set(storageKey, 'light');
  page.window.emit('pageshow', { persisted: false });
  assertTheme(page, { dark: true });

  page.window.emit('pageshow', { persisted: true });
  assertTheme(page, { dark: false });
  assertApprovedStorageOnly(page);
});

test('BFCache restoration preserves a local choice when its storage write failed', () => {
  const page = createPage({ systemDark: false, writeError: namedError('QuotaExceededError') });
  page.start('preserving a manual choice made while storage is unavailable');
  page.domContentLoaded();
  page.toggle.click();
  assertTheme(page, { dark: true });

  page.storage.values.set(storageKey, 'light');
  page.window.emit('pageshow', { persisted: true });
  assertTheme(page, { dark: true });
  assert.equal(page.document.activeElement, page.toggle);
  assertApprovedStorageOnly(page);
});

test('repeated lifecycle events do not attach duplicate toggle handlers', () => {
  const page = createPage({ systemDark: false });
  page.start('idempotent DOMContentLoaded and pageshow initialization');
  page.domContentLoaded();
  page.domContentLoaded();
  page.window.emit('pageshow', { persisted: true });
  page.window.emit('pageshow', { persisted: true });

  page.toggle.click();

  assertTheme(page, { dark: true });
  assert.equal(page.storage.calls.filter((call) => call.operation === 'setItem').length, 1, 'one click causes exactly one preference write');
  assertApprovedStorageOnly(page);
});

test('an already-open document does not synchronize from another tab until page restoration', () => {
  const page = createPage({ systemDark: false });
  page.start('absence of cross-tab theme synchronization');
  page.domContentLoaded();

  page.storage.values.set(storageKey, 'dark');
  page.window.emit('storage', { key: storageKey, newValue: 'dark' });

  assertTheme(page, { dark: false, media: systemMedia });
  assertApprovedStorageOnly(page);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const component = readFileSync(new URL('../src/components/SiteHeader.astro', import.meta.url), 'utf8');
const scriptMatch = component.match(/<script>\s*([\s\S]*?)\s*<\/script>/u);
assert.ok(scriptMatch, 'SiteHeader has an inline behavior script');
const script = scriptMatch[1].replace(/<(?:HTMLButtonElement|HTMLDivElement|HTMLAnchorElement)>/gu, '');

class ClassList {
  values = new Set();
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

class Element {
  constructor(name, document) {
    this.name = name;
    this.document = document;
    this.attributes = new Map();
    this.classList = new ClassList();
    this.listeners = new Map();
  }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  emit(type, event = {}) {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }
  focus() { this.document.activeElement = this; }
  click() {
    this.focus();
    this.emit('click');
  }
}

function createHeader(isMobile) {
  const document = {
    activeElement: null,
    body: { classList: new ClassList() },
    listeners: new Map(),
    querySelector(selector) {
      return ({
        '.site-nav__toggle': toggle,
        '#site-menu': menu,
        '.site-nav__brand': brand,
      })[selector] ?? null;
    },
    addEventListener(type, handler) {
      const handlers = this.listeners.get(type) ?? [];
      handlers.push(handler);
      this.listeners.set(type, handlers);
    },
    emit(type, event) {
      for (const handler of this.listeners.get(type) ?? []) handler(event);
    },
  };
  const brand = new Element('brand', document);
  const toggle = new Element('toggle', document);
  toggle.setAttribute('aria-expanded', 'false');
  const links = Array.from({ length: 9 }, (_, index) => new Element(`link-${index + 1}`, document));
  const menu = new Element('menu', document);
  menu.querySelectorAll = (selector) => {
    assert.ok(selector === 'a' || selector === 'a[href]');
    return links;
  };
  menu.querySelector = (selector) => {
    assert.equal(selector, 'a[href]');
    return links[0] ?? null;
  };
  menu.contains = (element) => links.includes(element);

  const mediaListeners = [];
  const media = {
    matches: isMobile,
    addEventListener(type, handler) {
      assert.equal(type, 'change');
      mediaListeners.push(handler);
    },
    changeTo(matches) {
      this.matches = matches;
      for (const handler of mediaListeners) handler({ matches });
    },
  };
  const window = {
    matchMedia(query) {
      assert.equal(query, '(max-width: 1100px)');
      return media;
    },
  };

  runInNewContext(script, { document, window });
  return { document, brand, toggle, links, menu, media };
}

function keydown(document, key, shiftKey = false) {
  const event = { key, shiftKey, prevented: false, preventDefault() { this.prevented = true; } };
  document.emit('keydown', event);
  return event;
}

test('closing the mobile menu at the desktop breakpoint releases Tab and keeps focus visible', () => {
  const header = createHeader(true);
  header.toggle.click();
  assert.equal(header.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(header.menu.classList.contains('is-open'), true);
  assert.equal(header.document.body.classList.contains('menu-is-open'), true);

  const lastLink = header.links.at(-1);
  lastLink.focus();
  header.media.changeTo(false);

  assert.equal(header.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(header.menu.classList.contains('is-open'), false);
  assert.equal(header.document.body.classList.contains('menu-is-open'), false);
  assert.equal(header.document.activeElement, lastLink);
  assert.equal(keydown(header.document, 'Tab').prevented, false);

  const focusedToggle = createHeader(true);
  focusedToggle.toggle.click();
  focusedToggle.media.changeTo(false);
  assert.equal(focusedToggle.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(focusedToggle.document.activeElement, focusedToggle.brand);
});

test('moving from desktop to mobile transfers focus from a menu link that becomes hidden', () => {
  const header = createHeader(false);
  header.links[3].focus();

  header.media.changeTo(true);

  assert.equal(header.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(header.document.activeElement, header.toggle);
});

test('mobile Tab wrapping, Escape focus restoration, and link closure remain intact', () => {
  const header = createHeader(true);
  header.toggle.click();

  const shiftTab = keydown(header.document, 'Tab', true);
  assert.equal(shiftTab.prevented, true);
  assert.equal(header.document.activeElement, header.links.at(-1));

  const tab = keydown(header.document, 'Tab');
  assert.equal(tab.prevented, true);
  assert.equal(header.document.activeElement, header.toggle);

  keydown(header.document, 'Escape');
  assert.equal(header.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(header.document.activeElement, header.toggle);

  header.toggle.click();
  header.links[2].click();
  assert.equal(header.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(header.menu.classList.contains('is-open'), false);
});

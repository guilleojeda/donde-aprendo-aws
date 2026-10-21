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

function matchesSimpleSelector(element, selector) {
  const value = selector.trim();
  if (!value || value === ':scope') return false;
  const tag = value.match(/^[a-z][a-z0-9-]*/iu)?.[0];
  if (tag && element.tagName.toLowerCase() !== tag.toLowerCase()) return false;

  for (const [, id] of value.matchAll(/#([\w-]+)/gu)) {
    if (element.getAttribute('id') !== id) return false;
  }
  for (const [, className] of value.matchAll(/\.([\w-]+)/gu)) {
    if (!element.classList.contains(className)) return false;
  }
  for (const [, attribute, doubleQuoted, singleQuoted, unquoted] of value.matchAll(/\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/gu)) {
    const actual = element.getAttribute(attribute);
    if (actual === null) return false;
    const expected = doubleQuoted ?? singleQuoted ?? unquoted?.trim();
    if (expected !== undefined && actual !== expected) return false;
  }

  const remainder = value
    .replace(tag ?? '', '')
    .replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:scope/gu, '')
    .trim();
  return remainder === '';
}

function matchesSelector(element, selector) {
  const parts = selector.trim().split(/\s+/u).filter((part) => part && part !== '>' && part !== ':scope');
  if (parts.length === 0 || !matchesSimpleSelector(element, parts.at(-1))) return false;

  let ancestor = element.parentElement;
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    while (ancestor && !matchesSimpleSelector(ancestor, parts[index])) ancestor = ancestor.parentElement;
    if (!ancestor) return false;
    ancestor = ancestor.parentElement;
  }
  return true;
}

function selectElements(elements, selector) {
  const selectors = String(selector).split(',').map((part) => part.trim());
  return elements.filter((element) => selectors.some((part) => matchesSelector(element, part)));
}

function createHeader(isMobile) {
  let documentElements = [];
  const document = {
    activeElement: null,
    body: { classList: new ClassList() },
    listeners: new Map(),
    querySelector(selector) {
      return selectElements(documentElements, selector)[0] ?? null;
    },
    querySelectorAll(selector) {
      return selectElements(documentElements, selector);
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
  brand.tagName = 'A';
  brand.classList.add('site-nav__brand');
  brand.setAttribute('href', '/');
  const toggle = new Element('toggle', document);
  toggle.tagName = 'BUTTON';
  toggle.classList.add('site-nav__toggle');
  const themeToggle = new Element('theme-toggle', document);
  themeToggle.tagName = 'BUTTON';
  themeToggle.setAttribute('data-theme-toggle', '');
  toggle.setAttribute('aria-expanded', 'false');
  const links = Array.from({ length: 9 }, (_, index) => {
    const link = new Element(`link-${index + 1}`, document);
    link.tagName = 'A';
    link.setAttribute('href', `/link-${index + 1}`);
    return link;
  });
  const menu = new Element('menu', document);
  menu.setAttribute('id', 'site-menu');
  menu.querySelectorAll = (selector) => selectElements(links, selector);
  menu.querySelector = (selector) => menu.querySelectorAll(selector)[0] ?? null;
  menu.contains = (element) => links.includes(element);
  const navigation = new Element('navigation', document);
  navigation.tagName = 'NAV';
  navigation.classList.add('site-nav');
  toggle.parentElement = navigation;
  themeToggle.parentElement = navigation;
  menu.parentElement = navigation;
  for (const link of links) link.parentElement = menu;
  documentElements = [navigation, brand, toggle, themeToggle, menu, ...links];
  navigation.querySelectorAll = (selector) => selectElements([brand, toggle, themeToggle, menu, ...links], selector);
  navigation.querySelector = (selector) => navigation.querySelectorAll(selector)[0] ?? null;
  document.tabOrder = [brand, toggle, themeToggle, ...links];

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
  return { document, brand, toggle, themeToggle, links, menu, navigation, media };
}

function keydown(document, key, shiftKey = false) {
  const event = { key, shiftKey, prevented: false, preventDefault() { this.prevented = true; } };
  document.emit('keydown', event);
  if (key === 'Tab' && !event.prevented) {
    const currentIndex = document.tabOrder.indexOf(document.activeElement);
    const nextIndex = currentIndex + (shiftKey ? -1 : 1);
    document.tabOrder[nextIndex]?.focus();
  }
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

test('mobile Tab order includes the theme toggle, Escape restores the menu button, and links still close the menu', () => {
  const header = createHeader(true);
  header.toggle.click();

  const shiftTab = keydown(header.document, 'Tab', true);
  assert.equal(shiftTab.prevented, true);
  assert.equal(header.document.activeElement, header.links.at(-1));

  const tab = keydown(header.document, 'Tab');
  assert.equal(tab.prevented, true);
  assert.equal(header.document.activeElement, header.toggle);

  const intoTheme = keydown(header.document, 'Tab');
  assert.equal(intoTheme.prevented, false);
  assert.equal(header.document.activeElement, header.themeToggle);
  const intoFirstLink = keydown(header.document, 'Tab');
  assert.equal(intoFirstLink.prevented, false);
  assert.equal(header.document.activeElement, header.links[0]);

  const backToTheme = keydown(header.document, 'Tab', true);
  assert.equal(backToTheme.prevented, false);
  assert.equal(header.document.activeElement, header.themeToggle);

  keydown(header.document, 'Escape');
  assert.equal(header.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(header.document.activeElement, header.toggle);

  header.toggle.click();
  header.links[2].click();
  assert.equal(header.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(header.menu.classList.contains('is-open'), false);
});

test('using the theme toggle while the mobile menu is open keeps the menu and focus in place', () => {
  const header = createHeader(true);
  header.toggle.click();
  header.themeToggle.click();

  assert.equal(header.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(header.menu.classList.contains('is-open'), true);
  assert.equal(header.document.body.classList.contains('menu-is-open'), true);
  assert.equal(header.document.activeElement, header.themeToggle);
});

test('resizing does not move focus away from the theme toggle while it remains visible', () => {
  const header = createHeader(false);
  header.themeToggle.focus();

  header.media.changeTo(true);
  assert.equal(header.document.activeElement, header.themeToggle);
  header.media.changeTo(false);
  assert.equal(header.document.activeElement, header.themeToggle);
});

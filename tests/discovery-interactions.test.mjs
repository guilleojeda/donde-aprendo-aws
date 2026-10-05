import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { directoryGroupMembership, directoryListEntries, filterResources, sortResources } from '../src/lib/directory-filter.mjs';
import { parseDirectorySearch, resetDirectorySearchForReveal, serializeDirectorySearch } from '../src/lib/directory-url.mjs';
import { aggregateSearchData, searchIndex, TYPE_LABELS } from '../src/lib/unified-search.mjs';

const directoryScript = readFileSync(new URL('../src/scripts/directory.js', import.meta.url), 'utf8')
  .replace(/^import .*;\s*$/gmu, '');
const searchScript = readFileSync(new URL('../src/scripts/unified-search.js', import.meta.url), 'utf8')
  .replace(/^import .*;\s*$/gmu, '');

class MockElement {
  constructor(document, { tagName = 'DIV', id = '', dataset = {}, value = '', hidden = false } = {}) {
    this.document = document;
    this.tagName = tagName;
    this.id = id;
    this.dataset = dataset;
    this.value = value;
    this.hidden = hidden;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = '';
  }

  append(...children) {
    for (const child of children) {
      if (child instanceof MockFragment) this.children.push(...child.children);
      else this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  emit(type, event = {}) {
    return (this.listeners.get(type) ?? []).map((handler) => handler(event));
  }

  async emitAsync(type, event = {}) {
    await Promise.all(this.emit(type, event));
  }

  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }

  focus() { this.document.activeElement = this; }

  click() {
    if (this.hidden) return;
    this.focus();
    this.emit('click');
  }
}

class MockFragment {
  children = [];
  append(...children) { this.children.push(...children); }
}

function createDirectory({ count }) {
  const document = { activeElement: null, body: null };
  document.body = new MockElement(document, { tagName: 'BODY' });
  document.activeElement = document.body;

  const controls = new MockElement(document);
  const search = new MockElement(document, { tagName: 'INPUT' });
  controls.querySelector = (selector) => selector === '[data-resource-search]' ? search : null;
  const list = new MockElement(document, { tagName: 'UL', dataset: { resourceGroups: '[]' } });
  const cards = Array.from({ length: count }, (_, index) => new MockElement(document, {
    tagName: 'LI',
    id: `resource-${index}`,
    dataset: {
      resourceIndex: String(index), kind: 'content', format: 'Curso', topics: '', country: '', level: '',
      addedAt: '', featured: 'false', search: `recurso ${index} aws`,
    },
  }));
  list.querySelectorAll = (selector) => selector === '[data-resource-index]' ? cards : [];
  const showMoreWrap = new MockElement(document, { hidden: true });
  const showMore = new MockElement(document, { tagName: 'BUTTON' });
  const resultCount = new MockElement(document, { dataset: { countSingular: 'recurso', countPlural: 'recursos' } });
  const noResults = new MockElement(document, { hidden: true });
  const selectors = new Map([
    ['[data-directory-controls]', controls], ['[data-resource-list]', list], ['[data-sort-filter]', null],
    ['[data-no-results]', noResults], ['[data-result-count]', resultCount], ['[data-show-more]', showMore],
    ['[data-show-more-wrap]', showMoreWrap],
  ]);
  const documentListeners = new Map();
  document.querySelector = (selector) => selectors.get(selector) ?? null;
  document.querySelectorAll = () => [];
  document.createElement = (tagName) => new MockElement(document, { tagName: tagName.toUpperCase() });
  document.createDocumentFragment = () => new MockFragment();
  document.addEventListener = (type, handler) => documentListeners.set(type, handler);
  const location = { pathname: '/aprender/', search: '', hash: '' };
  const history = { pushState() {}, replaceState() {} };
  const windowListeners = new Map();
  const window = { addEventListener: (type, handler) => windowListeners.set(type, handler) };

  runInNewContext(directoryScript, {
    document, window, location, history,
    directoryGroupMembership, directoryListEntries, filterResources, sortResources,
    parseDirectorySearch, resetDirectorySearchForReveal, serializeDirectorySearch,
    requestAnimationFrame: (callback) => callback(), URL,
  });

  return { document, search, list, cards, showMore, showMoreWrap, resultCount, noResults };
}

function makeSearchIndex(count) {
  return Array.from({ length: count }, (_, index) => ({
    type: 'article',
    title: `AWS material ${index}`,
    description: 'AWS para aprender',
    search: 'AWS',
    url: `/blog/aws-${index}/`,
  }));
}

function createSearch({ fetchIndex = async () => ({ ok: true, json: async () => makeSearchIndex(45) }) } = {}) {
  const document = { activeElement: null };
  document.body = new MockElement(document, { tagName: 'BODY' });
  document.activeElement = document.body;
  const selectors = new Map();
  for (const selector of ['[data-unified-search]', '#site-query', '#site-type', '[data-search-status]', '[data-search-results]', '[data-search-more]']) {
    selectors.set(selector, new MockElement(document, {
      tagName: selector === '[data-unified-search]' ? 'FORM' : selector === '[data-search-results]' ? 'OL' : 'DIV',
      hidden: selector === '[data-search-more]',
    }));
  }
  const form = selectors.get('[data-unified-search]');
  const queryInput = selectors.get('#site-query');
  const list = selectors.get('[data-search-results]');
  const more = selectors.get('[data-search-more]');
  document.querySelector = (selector) => selectors.get(selector) ?? null;
  document.createElement = (tagName) => new MockElement(document, { tagName: tagName.toUpperCase() });
  runInNewContext(searchScript, {
    document,
    window: {},
    fetch: fetchIndex,
    aggregateSearchData,
    searchIndex,
    TYPE_LABELS,
  });

  return {
    document, form, queryInput, list, more, status: selectors.get('[data-search-status]'),
    async submitNative() {
      // The rendered input is required, so a literal empty value never dispatches submit.
      if (queryInput.value === '') return false;
      await form.emitAsync('submit', { preventDefault() {} });
      return true;
    },
  };
}

test('directory Show More focuses the first added card on intermediate and final pages only', () => {
  const directory = createDirectory({ count: 25 });
  assert.equal(directory.document.activeElement, directory.document.body, 'initial rendering does not move focus');

  directory.search.focus();
  directory.search.value = 'recurso 24';
  directory.search.emit('input');
  assert.equal(directory.document.activeElement, directory.search, 'filtering leaves focus in the search field');

  directory.search.value = '';
  directory.search.emit('input');
  assert.equal(directory.document.activeElement, directory.search, 'clearing a filter does not move focus');

  directory.showMore.click();
  assert.equal(directory.document.activeElement, directory.cards[12]);
  assert.equal(directory.cards[12].hidden, false);
  assert.equal(directory.showMoreWrap.hidden, false, 'the intermediate page keeps Show More available');

  directory.showMore.click();
  assert.equal(directory.document.activeElement, directory.cards[24]);
  assert.equal(directory.cards[24].hidden, false);
  assert.equal(directory.showMoreWrap.hidden, true, 'the final short page hides Show More after focusing its result');
});

test('directory with fewer than one page keeps results visible without moving focus', () => {
  const directory = createDirectory({ count: 7 });
  assert.equal(directory.document.activeElement, directory.document.body);
  assert.equal(directory.cards.filter((card) => !card.hidden).length, 7);
  assert.equal(directory.showMoreWrap.hidden, true);
});

test('search Show More focuses each new page while initial short results stay unfocused', async () => {
  const search = createSearch();
  assert.equal(search.document.activeElement, search.document.body);

  search.queryInput.value = 'AWS';
  await search.submitNative();
  assert.equal(search.list.children.length, 20);
  assert.equal(search.more.hidden, false);
  assert.equal(search.document.activeElement, search.document.body, 'initial search results do not move focus');

  search.more.click();
  assert.equal(search.list.children.length, 40);
  assert.equal(search.document.activeElement.tagName, 'A');
  assert.equal(search.document.activeElement.children[1].textContent, 'AWS material 20');

  search.more.click();
  assert.equal(search.list.children.length, 45);
  assert.equal(search.more.hidden, true);
  assert.equal(search.document.activeElement.children[1].textContent, 'AWS material 40');

  const shortSearch = createSearch({ fetchIndex: async () => ({ ok: true, json: async () => makeSearchIndex(5) }) });
  shortSearch.queryInput.value = 'AWS';
  await shortSearch.submitNative();
  assert.equal(shortSearch.list.children.length, 5);
  assert.equal(shortSearch.more.hidden, true);
  assert.equal(shortSearch.document.activeElement, shortSearch.document.body, 'a short initial result set stays unfocused');
});

test('three-space submit clears prior search pages and native empty required input does not submit', async () => {
  const search = createSearch();
  search.queryInput.value = 'AWS';
  await search.submitNative();
  search.more.click();
  assert.equal(search.list.children.length, 40);

  const searchPage = readFileSync(new URL('../src/pages/buscar/index.astro', import.meta.url), 'utf8');
  assert.match(searchPage, /<input id="site-query"[^>]*\brequired\b/u);
  search.queryInput.value = '';
  assert.equal(await search.submitNative(), false);
  assert.equal(search.list.children.length, 40, 'native validation prevents the submit handler for a literal empty value');

  search.queryInput.value = '   ';
  assert.equal(await search.submitNative(), true, 'spaces are non-empty to native required validation and reach the handler');
  assert.equal(search.status.textContent, 'Escribe una búsqueda para ver resultados.');
  assert.equal(search.list.children.length, 0);
  assert.equal(search.more.hidden, true);
  search.more.emit('click');
  assert.equal(search.list.children.length, 0, 'a later More activation cannot restore the old matches');
});

test('a whitespace submit invalidates an earlier pending search response', async () => {
  let resolveIndex;
  const search = createSearch({ fetchIndex: () => new Promise((resolve) => { resolveIndex = resolve; }) });
  search.queryInput.value = 'AWS';
  const pendingSearch = search.submitNative();
  await Promise.resolve();
  assert.equal(typeof resolveIndex, 'function');

  search.queryInput.value = '   ';
  await search.submitNative();
  resolveIndex({ ok: true, json: async () => makeSearchIndex(25) });
  await pendingSearch;

  assert.equal(search.status.textContent, 'Escribe una búsqueda para ver resultados.');
  assert.equal(search.list.children.length, 0, 'the stale response cannot repopulate the cleared result list');
  assert.equal(search.more.hidden, true);
});

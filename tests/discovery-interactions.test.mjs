import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { directoryGroupMembership, directoryListEntries, filterResources, sortResources } from '../src/lib/directory-filter.mjs';
import { parseDirectorySearch, resetDirectorySearchForReveal, serializeDirectorySearch } from '../src/lib/directory-url.mjs';
import { COUNTRY_LABELS, LEVEL_LABELS } from '../src/lib/resource-discovery.mjs';
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
    this._textContent = '';
    this.parentElement = null;
    this.open = false;
    this.options = [];
    this.scrollIntoViewCalls = [];
    this.focusCalls = [];
  }

  append(...children) {
    for (const child of children) {
      const appended = child instanceof MockFragment ? [...child.children] : [child];
      for (const element of appended) {
        if (element.parentElement) {
          element.parentElement.children = element.parentElement.children.filter((candidate) => candidate !== element);
        }
        element.parentElement = this;
        this.children.push(element);
      }
    }
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...children);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  matches(selector) {
    return selector.split(',').some((rawSelector) => {
      const candidate = rawSelector.trim();
      const tagName = candidate.match(/^[a-z][a-z0-9-]*/iu)?.[0]?.toUpperCase();
      if (tagName && this.tagName !== tagName) return false;
      const classes = [...candidate.matchAll(/\.([a-z0-9_-]+)/giu)].map((match) => match[1]);
      const classNames = String(this.className ?? '').split(/\s+/u).filter(Boolean);
      if (classes.some((className) => !classNames.includes(className))) return false;
      const attributes = [...candidate.matchAll(/\[data-([a-z0-9-]+)\]/giu)];
      if (attributes.some(([, name]) => !Object.hasOwn(
        this.dataset,
        name.replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase()),
      ))) return false;
      return Boolean(tagName || classes.length || attributes.length);
    });
  }

  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (child.matches(selector)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

  emit(type, event = {}) {
    const dispatched = {
      ...event,
      type,
      target: event.target ?? this,
      bubbles: event.bubbles ?? true,
      defaultPrevented: event.defaultPrevented ?? false,
      preventDefault: event.preventDefault ?? function preventDefault() { this.defaultPrevented = true; },
      stopPropagation: event.stopPropagation ?? function stopPropagation() { this.propagationStopped = true; },
    };
    const path = [];
    for (let element = this; element; element = element.parentElement) path.push(element);
    if (!path.includes(this.document)) path.push(this.document);
    const results = [];
    for (const currentTarget of path) {
      dispatched.currentTarget = currentTarget;
      const handlers = currentTarget === this.document
        ? this.document.listeners?.get(type) ?? []
        : currentTarget.listeners.get(type) ?? [];
      for (const handler of handlers) results.push(handler(dispatched));
      if (dispatched.propagationStopped || (currentTarget !== this && !dispatched.bubbles)) break;
    }
    return results;
  }

  async emitAsync(type, event = {}) {
    await Promise.all(this.emit(type, event));
  }

  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }

  focus(options = {}) {
    this.focusCalls.push(options);
    const previous = this.document.activeElement;
    if (previous === this) return;
    this.document.activeElement = this;
    previous?.emit('focusout', { relatedTarget: this });
    this.emit('focusin', { relatedTarget: previous });
  }

  click() {
    if (this.hidden) return;
    if (['A', 'BUTTON', 'INPUT', 'SELECT', 'SUMMARY'].includes(this.tagName)) this.focus();
    this.emit('click');
    if (this.tagName === 'SUMMARY' && this.parentElement?.tagName === 'DETAILS') {
      this.parentElement.open = !this.parentElement.open;
    }
  }

  contains(target) {
    return target === this || this.children.some((child) => child.contains(target));
  }

  closest(selector) {
    for (let element = this; element; element = element.parentElement) {
      if (selector === '[data-theme-toggle]' && Object.hasOwn(element.dataset, 'themeToggle')) return element;
      if (selector === '[data-filter-disclosure]' && Object.hasOwn(element.dataset, 'filterDisclosure')) return element;
      if (selector === 'summary' && element.tagName === 'SUMMARY') return element;
    }
    return null;
  }

  scrollIntoView(options) { this.scrollIntoViewCalls.push(options); }

  get textContent() {
    return this.children.length ? this.children.map((child) => child.textContent).join('') : this._textContent;
  }

  set textContent(value) { this._textContent = String(value); }
}

class MockFragment {
  children = [];
  append(...children) { this.children.push(...children); }
}

function createDirectory({
  count, resources, initialSearch = '', kind = 'content', facets = ['format', 'topic', 'country', 'level'], primaryFacets = [],
  defaultSort = 'recommended', resourceGroups = [],
} = {}) {
  resources ??= Array.from({ length: count }, (_, index) => ({
    title: `recurso ${index}`, category: 'Curso', format: 'Curso', topics: [],
  }));
  const document = { activeElement: null, body: null, listeners: new Map() };
  document.body = new MockElement(document, { tagName: 'BODY' });
  document.activeElement = document.body;

  const controls = new MockElement(document, { dataset: { directoryControls: '' } });
  const search = new MockElement(document, { tagName: 'INPUT', dataset: { resourceSearch: '' } });
  const facetOptions = {
    format: kind === 'community'
      ? ['', 'User Group', 'Student Builder Group', 'Grupo de estudio', 'Comunidad en línea']
      : ['', 'Curso', 'Video', 'Artículo'],
    topic: ['', 'Comunidad', 'Seguridad', 'Serverless', 'Redes'],
    country: ['', 'AR', 'PE', 'CO'],
    level: ['', 'inicial', 'intermedio', 'avanzado'],
    group: ['', ...resourceGroups.map(({ id }) => id)],
  };
  const facetSelectors = {
    format: '[data-format-filter]', topic: '[data-topic-filter]', country: '[data-country-filter]',
    level: '[data-level-filter]', group: '[data-group-filter]',
  };
  const facetAttributes = {
    format: 'formatFilter', topic: 'topicFilter', country: 'countryFilter', level: 'levelFilter', group: 'groupFilter',
  };
  const facetControls = Object.fromEntries(Object.entries(facetSelectors).map(([field]) => [
    field, new MockElement(document, { tagName: 'SELECT', dataset: { [facetAttributes[field]]: '' } }),
  ]));
  for (const [field, control] of Object.entries(facetControls)) {
    control.options = facetOptions[field].map((value) => ({ value }));
  }
  const details = new MockElement(document, { tagName: 'DETAILS', dataset: { filterDisclosure: '' } });
  const summary = Object.assign(new MockElement(document, { tagName: 'SUMMARY' }), { textContent: 'Filtros adicionales' });
  const facetFields = new MockElement(document, { tagName: 'DIV' });
  details.append(summary, facetFields);
  for (const field of facets) facetFields.append(facetControls[field]);
  const primaryControls = primaryFacets.map((field) => facetControls[field]);
  controls.append(search, ...(resourceGroups.length ? [facetControls.group] : []), ...primaryControls, details);
  const list = new MockElement(document, {
    tagName: 'UL', dataset: { kind, resourceList: '', resourceGroups: JSON.stringify(resourceGroups) },
  });
  const cards = resources.map((resource, index) => {
    const card = new MockElement(document, {
      tagName: 'LI',
      id: `resource-${index}`,
      dataset: {
        resourceIndex: String(index), category: resource.category ?? '', topics: (resource.topics ?? []).join('|'),
        country: resource.country ?? '', level: resource.level ?? '', featured: resource.featured ? 'true' : undefined,
      },
    });
    const metadata = [resource.format, ...(resource.topics ?? []).slice(0, 2), resource.countryLabel, resource.levelLabel]
      .filter(Boolean)
      .map((textContent) => Object.assign(new MockElement(document, { tagName: 'SPAN' }), { textContent }));
    const title = Object.assign(new MockElement(document, { tagName: 'H3' }), { textContent: resource.title ?? '' });
    const description = resource.description == null ? null
      : Object.assign(new MockElement(document, { tagName: 'P' }), { textContent: resource.description });
    const time = resource.addedAt ? new MockElement(document, { tagName: 'TIME' }) : null;
    if (time) time.attributes.set('datetime', resource.addedAt);
    const related = (resource.related ?? []).map((textContent) => Object.assign(
      new MockElement(document, { tagName: 'A' }), { textContent },
    ));
    card.querySelector = (selector) => {
      if (selector === 'h3') return title;
      if (selector === '.resource-card__description') return description;
      if (selector === 'time') return time;
      return null;
    };
    card.querySelectorAll = (selector) => selector === '.resource-card__meta span' ? metadata
      : selector === '.resource-card__related a' ? related : [];
    return card;
  });
  list.append(...cards);
  list.querySelectorAll = (selector) => selector === '[data-resource-index]' ? cards : [];
  const sort = new MockElement(document, { tagName: 'SELECT', dataset: { defaultSort, sortFilter: '' } });
  sort.options = ['recommended', 'directory', 'recent', 'purpose'].map((value) => ({ value }));
  const themeToggle = new MockElement(document, { tagName: 'BUTTON', dataset: { themeToggle: '' } });
  const showMoreWrap = new MockElement(document, { hidden: true, dataset: { showMoreWrap: '' } });
  const showMore = new MockElement(document, { tagName: 'BUTTON', dataset: { showMore: '' } });
  showMoreWrap.append(showMore);
  const resultCount = new MockElement(document, {
    dataset: { resultCount: '', countSingular: 'recurso', countPlural: 'recursos' },
  });
  const noResults = new MockElement(document, { hidden: true, dataset: { noResults: '' } });
  const selectors = new Map([
    ['[data-directory-controls]', controls], ['[data-resource-list]', list], ['[data-sort-filter]', sort],
    ['[data-no-results]', noResults], ['[data-result-count]', resultCount], ['[data-show-more]', showMore],
    ['[data-show-more-wrap]', showMoreWrap], ['[data-theme-toggle]', themeToggle],
  ]);
  document.body.append(controls, sort, list, resultCount, noResults, showMoreWrap, themeToggle);
  document.querySelector = (selector) => selectors.get(selector) ?? null;
  document.querySelectorAll = (selector) => document.body.querySelectorAll(selector);
  document.createElement = (tagName) => new MockElement(document, { tagName: tagName.toUpperCase() });
  document.createDocumentFragment = () => new MockFragment();
  document.addEventListener = (type, handler) => {
    const handlers = document.listeners.get(type) ?? [];
    handlers.push(handler);
    document.listeners.set(type, handlers);
  };
  const initialUrl = new URL(`/aprender/${initialSearch}`, 'https://example.test');
  const location = { pathname: initialUrl.pathname, search: initialUrl.search, hash: initialUrl.hash };
  const entries = [`${location.pathname}${location.search}${location.hash}`];
  let historyIndex = 0;
  const applyUrl = (url) => {
    const parsed = new URL(url, 'https://example.test');
    location.pathname = parsed.pathname;
    location.search = parsed.search;
    location.hash = parsed.hash;
  };
  const windowListeners = new Map();
  const window = {
    addEventListener(type, handler) {
      const handlers = windowListeners.get(type) ?? [];
      handlers.push(handler);
      windowListeners.set(type, handlers);
    },
    emit(type, event = {}) {
      return (windowListeners.get(type) ?? []).map((handler) => handler(event));
    },
  };
  const history = {
    entries,
    pushCalls: [],
    replaceCalls: [],
    pushState(_state, _title, url) {
      this.pushCalls.push(String(url));
      entries.splice(historyIndex + 1);
      entries.push(String(url));
      historyIndex = entries.length - 1;
      applyUrl(url);
    },
    replaceState(_state, _title, url) {
      this.replaceCalls.push(String(url));
      entries[historyIndex] = String(url);
      applyUrl(url);
    },
    back() {
      if (historyIndex === 0) return;
      historyIndex -= 1;
      applyUrl(entries[historyIndex]);
      window.emit('popstate', { state: null });
    },
  };
  let lastFilteredRecords = [];

  runInNewContext(directoryScript, {
    document, window, location, history,
    directoryGroupMembership, directoryListEntries,
    filterResources: (records, state) => {
      lastFilteredRecords = records;
      return filterResources(records, state);
    },
    sortResources, COUNTRY_LABELS, LEVEL_LABELS,
    parseDirectorySearch, resetDirectorySearchForReveal, serializeDirectorySearch,
    requestAnimationFrame: (callback) => callback(), URL,
  });

  return {
    document, controls, search, format: facetControls.format, topic: facetControls.topic,
    country: facetControls.country, level: facetControls.level, group: facetControls.group,
    sort, details, summary, facetFields, themeToggle, list, cards, showMore, showMoreWrap, resultCount, noResults,
    location, history, window,
    get records() { return lastFilteredRecords; },
  };
}

function visibleDirectoryCards(directory) {
  return directory.cards.filter((card) => !card.hidden);
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createControlledTimers() {
  let nextId = 0;
  const timers = new Map();
  return {
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    fireNext() {
      const [id, timer] = timers.entries().next().value ?? [];
      if (!timer) throw new Error('No timer is pending');
      timers.delete(id);
      timer.callback();
      return timer.delay;
    },
    pendingDelays() {
      return [...timers.values()].map(({ delay }) => delay);
    },
  };
}

function makeTargetSearchIndex() {
  return [
    { type: 'article', title: 'Guía de S3', description: 'Almacenamiento en AWS', search: '', url: '/s3/' },
    { type: 'article', title: 'Guía de IAM', description: 'Identidades en AWS', search: '', url: '/iam/' },
  ];
}

function createSearch({
  fetchIndex = async () => ({ ok: true, json: async () => makeSearchIndex(45) }),
  timers,
} = {}) {
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
    AbortController,
    setTimeout: timers?.setTimeout ?? setTimeout,
    clearTimeout: timers?.clearTimeout ?? clearTimeout,
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

test('directory reads its format facet from the first visible metadata span and dates from time elements', () => {
  const directory = createDirectory({ resources: [
    { title: 'Older course', category: 'Curso', format: 'Curso', topics: [], addedAt: '2026-09-25' },
    { title: 'Newer video', category: 'Video', format: 'Video', topics: [], addedAt: '2026-10-01' },
  ] });

  assert.equal(directory.list.children[0], directory.cards[1], 'The default recent order reads the date from time[datetime].');
  directory.format.value = 'Curso';
  directory.format.emit('change');
  assert.deepEqual(directory.cards.map(({ hidden }) => !hidden), [true, false], 'The format facet reads the first metadata span.');
});

test('directory search reconstructs searchable text from static card content and metadata', () => {
  const directory = createDirectory({ resources: [
    {
      title: '¿Cómo leer CloudTrail?', description: 'Introducción práctica a AWS.', category: 'Guías y laboratorios',
      format: 'Curso', topics: ['Seguridad', 'Auditoría', 'Certificaciones'], country: 'PE', countryLabel: 'Perú',
      level: 'inicial', levelLabel: 'Inicial', addedAt: '2026-09-25',
      related: [
        'Autor o fuente: AWS Academy (oficial)', 'Comunidad: Mujeres AWS Perú',
        'Grabación de: re:Invent 2025', 'Reportar enlace roto o dato incorrecto', 'Recomendado',
      ],
    },
    { title: 'Recurso sin descripción', description: null, category: 'Videos', format: 'Video', topics: [] },
  ] });
  const reconstructed = directory.records.find(({ card }) => card.id === 'resource-0');
  assert.equal(reconstructed.search,
    '¿Cómo leer CloudTrail? Introducción práctica a AWS. Guías y laboratorios Curso Seguridad Auditoría Certificaciones Perú Inicial AWS Academy (oficial) Mujeres AWS Perú re:Invent 2025');
  assert.deepEqual([...reconstructed.topics], ['Seguridad', 'Auditoría', 'Certificaciones'], 'All topics remain available to filters and search.');
  assert.deepEqual(
    reconstructed.card.querySelectorAll('.resource-card__meta span').map(({ textContent }) => textContent),
    ['Curso', 'Seguridad', 'Auditoría', 'Perú', 'Inicial'],
    'Only the first two topics stay visible as badges.',
  );

  for (const query of [
    '¿Cómo leer CloudTrail?', 'introduccion practica', 'Guías y laboratorios', 'auditoria',
    'Perú', 'Inicial', 'AWS Academy (oficial)', 'Mujeres AWS Perú', 're:Invent 2025',
  ]) {
    directory.search.value = query;
    directory.search.emit('input');
    assert.deepEqual(directory.cards.map(({ hidden }) => !hidden), [true, false], `Search finds static field: ${query}`);
  }

  directory.search.value = 'sin descripción';
  directory.search.emit('input');
  assert.deepEqual(directory.cards.map(({ hidden }) => !hidden), [false, true], 'A missing description does not contribute an undefined value.');
  for (const query of ['undefined', 'Reportar enlace roto', 'Recomendado']) {
    directory.search.value = query;
    directory.search.emit('input');
    assert.deepEqual(directory.cards.map(({ hidden }) => !hidden), [false, false], `Presentation-only text is excluded: ${query}`);
  }
});

test('directory search keeps the former empty-field slots for the published missing-country card', () => {
  const directory = createDirectory({ resources: [{
    title: 'Usando anclas y alias de YAML en una plantilla SAM',
    description: 'Aprende cómo puedes configurar tu plantilla SAM para reutilizar piezas comunes de configuración utilizando anclas y alias sin introducir problemas.',
    category: 'Serverless', format: 'Artículo', topics: ['Serverless'], level: 'intermedio', levelLabel: 'Intermedio',
    related: ['Autor o fuente: AndMore Dev'],
  }] });
  const record = directory.records[0];

  // This is the old expression for catalog-cea4bcc7c72537db16d6aed79d518d92.
  assert.equal(record.search,
    'Usando anclas y alias de YAML en una plantilla SAM Aprende cómo puedes configurar tu plantilla SAM para reutilizar piezas comunes de configuración utilizando anclas y alias sin introducir problemas. Serverless Artículo Serverless  Intermedio AndMore Dev  ');
  directory.search.value = 'Serverless Intermedio';
  directory.search.emit('input');
  assert.deepEqual(directory.cards.map(({ hidden }) => !hidden), [false],
    'A query cannot bridge the empty country slot between topic and level fields.');
});

test('certification directory filters start closed and count its applicable active facets', () => {
  const resourceGroups = [
    { id: 'exam-a', label: 'Examen A', resourceIds: ['1'], filterResourceIds: ['0', '1'] },
    { id: 'exam-b', label: 'Examen B', resourceIds: ['2'], filterResourceIds: ['0', '2'] },
    { id: 'multiple-exams', label: 'Varios exámenes', resourceIds: ['0'] },
  ];
  const directory = createDirectory({
    facets: ['format', 'country', 'level'],
    defaultSort: 'purpose',
    resourceGroups,
    initialSearch: '?campaign=fall&q=CloudTrail&format=Video&country=PE&level=intermedio&group=exam-a&sort=recent',
    resources: [
      {
        title: 'Guía CloudTrail práctica', description: 'AWS y auditoría', category: 'Guías', format: 'Video',
        topics: ['Seguridad'], country: 'PE', level: 'intermedio', levelLabel: 'Intermedio',
      },
      {
        title: 'CloudTrail curso relacionado', description: 'AWS y auditoría', category: 'Guías', format: 'Video',
        topics: ['Seguridad'], country: 'AR', level: 'intermedio', levelLabel: 'Intermedio',
      },
      {
        title: 'CloudTrail curso de examen B', description: 'AWS y auditoría', category: 'Guías', format: 'Video',
        topics: ['Seguridad'], country: 'PE', level: 'intermedio', levelLabel: 'Intermedio',
      },
    ],
  });

  assert.equal(directory.group.value, 'exam-a');
  assert.equal(directory.country.value, 'PE', 'the country facet restores its shareable route state');
  assert.deepEqual(visibleDirectoryCards(directory), [directory.cards[0]],
    'the mixed-exam record matches the selected group with all the active facets and query');
  assert.deepEqual(directory.records[0].groupIds, ['exam-a', 'exam-b', 'multiple-exams'],
    'group membership comes from the real mixed-exam filter metadata');
  assert.deepEqual(directory.records[1].groupIds, ['exam-a'], 'the other exam-A resource has valid single-exam membership');
  assert.deepEqual(directory.records[2].groupIds, ['exam-b'], 'the remaining resource belongs only to exam B');

  assert.equal(directory.details.open, false, 'restored URL facets do not open the native disclosure');
  assert.match(directory.summary.textContent, /\b3\b/u,
    'the summary counts format, country, and level but excludes query, sort, and the primary exam group');

  directory.summary.click();
  directory.level.value = 'avanzado';
  directory.level.emit('change');
  assert.equal(directory.details.open, true, 'changing a facet while using the panel does not dismiss it');
  assert.match(directory.summary.textContent, /\b3\b/u, 'the count reflects selected secondary facets, not matching result count');
  assert.equal(visibleDirectoryCards(directory).length, 0);

  directory.summary.click();
  directory.history.back();
  assert.equal(directory.level.value, 'intermedio', 'popstate restores the secondary facet control');
  assert.equal(directory.group.value, 'exam-a', 'popstate restores the primary exam control');
  assert.equal(visibleDirectoryCards(directory).length, 1, 'popstate restores results with the selected URL state');
  assert.equal(directory.details.open, false, 'restoring active facets never forces the disclosure back open');
  assert.match(directory.summary.textContent, /\b3\b/u, 'the active facet count is restored while the panel stays closed');
});

test('the community directory counts format and topic while its primary country filters results', () => {
  const directory = createDirectory({
    kind: 'community',
    facets: ['format', 'topic'],
    primaryFacets: ['country'],
    resources: [
      { title: 'AWS User Group Perú', category: 'Comunidad', format: 'User Group', topics: ['Comunidad'], country: 'PE' },
      { title: 'Grupo estudiantil Perú', category: 'Comunidad', format: 'Student Builder Group', topics: ['Redes'], country: 'PE' },
      { title: 'AWS User Group Argentina', category: 'Comunidad', format: 'User Group', topics: ['Comunidad'], country: 'AR' },
    ],
  });
  assert.equal(directory.controls.querySelector('[data-group-filter]'), null, 'community directories have no exam-group control');
  assert.equal(directory.controls.querySelector('[data-level-filter]'), null, 'community directories have no level control');
  directory.country.value = 'PE';
  directory.country.emit('change');
  directory.summary.click();

  for (const [control, value] of [
    [directory.format, 'User Group'], [directory.topic, 'Comunidad'],
  ]) {
    control.focus();
    control.value = value;
    control.emit('change');
  }

  assert.equal(directory.country.value, 'PE', 'the route country remains selected outside the secondary panel');
  assert.equal(visibleDirectoryCards(directory).length, 1, 'country, format, and topic combine in the real community result flow');
  assert.match(directory.summary.textContent, /\b2\b/u,
    'the visible count includes the selected format and topic but excludes primary country');
});

test('Escape closes an open directory filter disclosure and restores focus only when Escape is inside it', () => {
  const directory = createDirectory({ count: 2 });
  directory.summary.click();
  directory.format.focus();
  directory.format.emit('keydown', { key: 'Escape' });

  assert.equal(directory.details.open, false, 'Escape from a filter closes the disclosure');
  assert.equal(directory.document.activeElement, directory.summary, 'Escape inside returns focus to the disclosure summary');

  directory.summary.click();
  directory.document.activeElement = directory.document.body;
  directory.document.body.emit('keydown', { key: 'Escape' });
  assert.equal(directory.details.open, false, 'Escape outside also dismisses an open disclosure');
  assert.equal(directory.document.activeElement, directory.document.body, 'Escape outside preserves the existing focus destination');
});

test('directory filter focus departure preserves destination focus and the shared theme-toggle exemption', () => {
  const directory = createDirectory({ count: 2 });
  const outsideButton = new MockElement(directory.document, { tagName: 'BUTTON' });

  directory.summary.click();
  directory.format.focus();
  directory.format.value = 'Video';
  directory.format.emit('change');
  directory.themeToggle.click();
  assert.equal(directory.details.open, true, 'focus and click on the shared theme toggle leave the disclosure open');
  assert.equal(directory.format.value, 'Video', 'theme interaction preserves the selected facet');
  assert.equal(directory.document.activeElement, directory.themeToggle, 'theme interaction keeps focus on its own control');

  directory.format.focus();
  outsideButton.focus();
  assert.equal(directory.details.open, false, 'Tab or another focus move outside closes the disclosure');
  assert.equal(directory.document.activeElement, outsideButton, 'closing on focusout does not steal the next focus');
});

test('directory filter clicks stay open inside and dismiss on an outside click without moving focus', () => {
  const directory = createDirectory({ count: 2 });
  const outsideArea = new MockElement(directory.document, { tagName: 'DIV' });

  directory.summary.click();
  directory.topic.click();
  assert.equal(directory.details.open, true, 'clicks inside the native disclosure do not close it');
  directory.summary.click();
  assert.equal(directory.details.open, false, 'the summary keeps native toggle behavior');

  directory.summary.click();
  const focusBeforeOutsideClick = directory.document.activeElement;
  outsideArea.click();
  assert.equal(directory.details.open, false, 'a click outside closes the disclosure');
  assert.equal(directory.document.activeElement, focusBeforeOutsideClick, 'an outside click on a non-focusable area preserves focus');
});

test('directory facet changes reset Show More, preserve unrelated URL parameters, and popstate restores controls and results', () => {
  const resources = Array.from({ length: 25 }, (_, index) => ({
    title: `AWS recurso ${index}`,
    description: 'Guía práctica para aprender',
    category: 'Cursos y videos',
    format: index % 2 === 0 ? 'Curso' : 'Video',
    topics: index % 2 === 0 ? ['Seguridad'] : ['Redes'],
    country: index % 2 === 0 ? 'AR' : 'PE',
    level: index % 2 === 0 ? 'intermedio' : 'inicial',
    addedAt: `2026-10-${String(index + 1).padStart(2, '0')}`,
  }));
  const directory = createDirectory({ resources, initialSearch: '?campaign=q4&sort=recent' });
  assert.equal(visibleDirectoryCards(directory).length, 12);

  directory.showMore.click();
  assert.equal(visibleDirectoryCards(directory).length, 24);
  assert.equal(directory.document.activeElement, directory.list.children[12], 'the first newly shown result receives focus');
  directory.showMore.click();
  assert.equal(visibleDirectoryCards(directory).length, 25);
  assert.equal(directory.document.activeElement, directory.list.children[24], 'the final short page receives focus');

  directory.summary.click();
  directory.format.focus();
  directory.format.value = 'Curso';
  directory.format.emit('change');
  assert.equal(directory.history.pushCalls.length, 1, 'a facet change creates a history entry');
  assert.equal(visibleDirectoryCards(directory).length, 12, 'a filter change resets the reveal limit to one page');
  assert.equal(directory.document.activeElement, directory.format, 'filtering keeps focus in the changed control');
  assert.equal(directory.details.open, true, 'changing a facet does not close the panel being used');
  directory.summary.click();

  directory.search.focus();
  directory.search.value = 'AWS recurso 24';
  directory.search.emit('input');
  assert.equal(directory.history.replaceCalls.length, 1, 'typing replaces the current history entry');
  let params = new URLSearchParams(directory.location.search);
  assert.equal(params.get('campaign'), 'q4', 'search preserves unrelated query parameters');
  assert.equal(params.get('format'), 'Curso');
  assert.equal(params.get('q'), 'AWS recurso 24');

  directory.sort.value = 'directory';
  directory.sort.emit('change');
  assert.equal(directory.history.pushCalls.length, 2, 'an explicit sort change creates a history entry');
  assert.equal(new URLSearchParams(directory.location.search).get('campaign'), 'q4');
  directory.history.back();

  params = new URLSearchParams(directory.location.search);
  assert.equal(directory.search.value, 'AWS recurso 24', 'popstate restores the query control');
  assert.equal(directory.format.value, 'Curso', 'popstate restores the selected facet');
  assert.equal(directory.sort.value, 'recent', 'popstate restores the prior sort');
  assert.equal(params.get('campaign'), 'q4');
  assert.equal(visibleDirectoryCards(directory).length, 1, 'popstate restores the result set');
  assert.equal(directory.details.open, false, 'popstate keeps the secondary panel closed with active filters');
});

test('directory sort choices flatten and restore exam headings using the production directory flow', () => {
  const directory = createDirectory({
    defaultSort: 'purpose',
    resourceGroups: [
      { id: 'exam-a', label: 'Examen A', description: 'Grupo A', resourceIds: ['0', '2'] },
      { id: 'exam-b', label: 'Examen B', description: 'Grupo B', resourceIds: ['1'] },
    ],
    resources: [
      { title: 'Primero', format: 'Curso', topics: [], addedAt: '2026-10-01' },
      { title: 'Segundo', format: 'Curso', topics: [], addedAt: '2026-10-03' },
      { title: 'Tercero', format: 'Curso', topics: [], addedAt: '2026-10-02' },
    ],
  });
  const headings = () => directory.list.children.filter((child) => Object.hasOwn(child.dataset, 'resourceGroupHeading'));

  assert.equal(directory.sort.value, 'purpose');
  assert.equal(headings().length, 2, 'the default exam sort renders one heading per contiguous group');
  directory.sort.value = 'recent';
  directory.sort.emit('change');
  assert.equal(headings().length, 0, 'an alternative sort flattens exam headings');
  assert.deepEqual(directory.list.children.map((child) => child.id), ['resource-1', 'resource-2', 'resource-0']);
  directory.sort.value = 'purpose';
  directory.sort.emit('change');
  assert.equal(headings().length, 2, 'returning to the default exam sort restores headings');
});

test('directory resource hashes reveal and focus hidden cards while preserving sort; unknown hashes preserve filters', () => {
  const resources = Array.from({ length: 25 }, (_, index) => ({
    title: `CloudTrail recurso ${index}`, format: 'Curso', topics: ['Seguridad'], country: 'AR',
    level: 'intermedio', addedAt: `2026-10-${String(index + 1).padStart(2, '0')}`,
  }));
  const resourceGroups = [{
    id: 'exam-a', label: 'Examen A', resourceIds: resources.map((_, index) => String(index)),
  }];
  const activeSearch = '?campaign=hash-test&q=CloudTrail&format=Curso&topic=Seguridad&country=AR&level=intermedio&group=exam-a&sort=recent';
  const initialHash = createDirectory({ resources, resourceGroups, initialSearch: `${activeSearch}#resource-24` });

  assert.equal(initialHash.cards[24].hidden, false, 'a deep-linked resource past the first page becomes visible on load');
  assert.equal(initialHash.document.activeElement, initialHash.cards[24], 'the loaded hash target receives focus');
  assert.equal(initialHash.cards[24].scrollIntoViewCalls.length, 1, 'the loaded hash target is brought into view');
  assert.equal(initialHash.location.hash, '#resource-24');
  assert.equal(initialHash.details.open, false, 'revealing a hash target leaves secondary filters closed');
  let params = new URLSearchParams(initialHash.location.search);
  assert.equal(params.get('campaign'), 'hash-test');
  assert.equal(params.get('sort'), 'recent', 'revealing a resource preserves the chosen sort');
  for (const field of ['q', 'format', 'topic', 'country', 'level', 'group']) {
    assert.equal(params.has(field), false, `revealing a resource clears the incompatible ${field} filter`);
  }
  assert.equal(visibleDirectoryCards(initialHash).length, 25);

  const changedHash = createDirectory({ resources, resourceGroups, initialSearch: activeSearch });
  changedHash.location.hash = '#resource-24';
  changedHash.window.emit('hashchange');
  assert.equal(changedHash.cards[24].hidden, false, 'a later hash change reveals a target outside the initial page');
  assert.equal(changedHash.document.activeElement, changedHash.cards[24]);
  assert.equal(changedHash.details.open, false);
  assert.equal(new URLSearchParams(changedHash.location.search).get('sort'), 'recent');

  const unknownHash = createDirectory({ resources, initialSearch: '?q=CloudTrail&format=Curso&sort=recent#resource-inexistente' });
  assert.equal(unknownHash.search.value, 'CloudTrail', 'an unknown hash does not clear the search');
  assert.equal(unknownHash.format.value, 'Curso', 'an unknown hash does not clear selected filters');
  assert.equal(visibleDirectoryCards(unknownHash).length, 12, 'an unknown resource hash does not reveal a later page');
  assert.equal(unknownHash.cards[12].hidden, true);
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

test('search shares one pending index request, renders only the latest query, and caches success', async () => {
  const request = deferred();
  let fetchCalls = 0;
  const search = createSearch({ fetchIndex: () => {
    fetchCalls += 1;
    return request.promise;
  } });

  search.queryInput.value = 'S3';
  const firstSearch = search.submitNative();
  await Promise.resolve();
  search.queryInput.value = 'IAM';
  const latestSearch = search.submitNative();
  await Promise.resolve();
  assert.equal(fetchCalls, 1, 'overlapping searches share the same pending index request');

  request.resolve({ ok: true, json: async () => makeTargetSearchIndex() });
  await Promise.all([firstSearch, latestSearch]);
  assert.equal(search.list.children.length, 1);
  assert.equal(search.list.children[0].children[0].children[1].textContent, 'Guía de IAM');

  search.queryInput.value = 'S3';
  await search.submitNative();
  assert.equal(fetchCalls, 1, 'a successful index remains cached for later searches');
  assert.equal(search.list.children[0].children[0].children[1].textContent, 'Guía de S3');
});

test('a stale failed request clears its shared cache so the next search retries immediately', async () => {
  const firstRequest = deferred();
  let fetchCalls = 0;
  const search = createSearch({ fetchIndex: () => {
    fetchCalls += 1;
    return fetchCalls === 1
      ? firstRequest.promise
      : Promise.resolve({ ok: true, json: async () => makeTargetSearchIndex() });
  } });

  search.queryInput.value = 'S3';
  const pendingSearch = search.submitNative();
  await Promise.resolve();
  assert.equal(fetchCalls, 1);

  search.queryInput.value = '   ';
  await search.submitNative();
  firstRequest.reject(new Error('network unavailable'));
  await pendingSearch;
  assert.equal(search.status.textContent, 'Escribe una búsqueda para ver resultados.');

  search.queryInput.value = 'IAM';
  await search.submitNative();
  assert.equal(fetchCalls, 2, 'the first non-empty search after failure starts a new request');
  assert.equal(search.status.textContent, '1 resultado.');
  assert.equal(search.list.children[0].children[0].children[1].textContent, 'Guía de IAM');
});

test('a hung index fetch times out, aborts, and permits an immediate retry', async () => {
  const timers = createControlledTimers();
  let firstSignal;
  let fetchCalls = 0;
  const search = createSearch({
    timers,
    fetchIndex: (_url, { signal }) => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        firstSignal = signal;
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('fetch aborted')), { once: true });
        });
      }
      return Promise.resolve({ ok: true, json: async () => makeTargetSearchIndex() });
    },
  });

  search.queryInput.value = 'S3';
  const pendingSearch = search.submitNative();
  await Promise.resolve();
  assert.equal(fetchCalls, 1);
  assert.deepEqual(timers.pendingDelays(), [12_000]);

  assert.equal(timers.fireNext(), 12_000);
  await pendingSearch;
  assert.equal(firstSignal.aborted, true, 'timeout aborts the underlying fetch');
  assert.equal(search.status.textContent, 'La búsqueda no está disponible en este momento. Intenta de nuevo.');
  assert.deepEqual(timers.pendingDelays(), []);

  search.queryInput.value = 'IAM';
  await search.submitNative();
  assert.equal(fetchCalls, 2, 'the next submission starts a fresh request');
  assert.equal(search.list.children[0].children[0].children[1].textContent, 'Guía de IAM');
});

test('a hung index body is bounded and the successful retry remains shared', async () => {
  const timers = createControlledTimers();
  const retryRequest = deferred();
  let bodyStarted;
  const bodyStartedPromise = new Promise((resolve) => { bodyStarted = resolve; });
  let firstSignal;
  let fetchCalls = 0;
  const search = createSearch({
    timers,
    fetchIndex: (_url, { signal }) => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        firstSignal = signal;
        return Promise.resolve({ ok: true, json: () => {
          bodyStarted();
          return new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('body read aborted')), { once: true });
          });
        } });
      }
      return retryRequest.promise;
    },
  });

  search.queryInput.value = 'S3';
  const pendingSearch = search.submitNative();
  await bodyStartedPromise;
  assert.equal(fetchCalls, 1);
  assert.deepEqual(timers.pendingDelays(), [12_000]);

  timers.fireNext();
  await pendingSearch;
  assert.equal(firstSignal.aborted, true, 'timeout aborts response-body consumption');
  assert.equal(search.status.textContent, 'La búsqueda no está disponible en este momento. Intenta de nuevo.');

  search.queryInput.value = 'IAM';
  const retrySearch = search.submitNative();
  await Promise.resolve();
  assert.equal(fetchCalls, 2);

  search.queryInput.value = 'S3';
  const latestSearch = search.submitNative();
  await Promise.resolve();
  assert.equal(fetchCalls, 2, 'overlapping searches share the retry request');

  retryRequest.resolve({ ok: true, json: async () => makeTargetSearchIndex() });
  await Promise.all([retrySearch, latestSearch]);
  assert.equal(search.status.textContent, '1 resultado.');
  assert.equal(search.list.children.length, 1);
  assert.equal(search.list.children[0].children[0].children[1].textContent, 'Guía de S3');

  search.queryInput.value = 'IAM';
  await search.submitNative();
  assert.equal(fetchCalls, 2, 'a successful retry remains cached');
  assert.deepEqual(timers.pendingDelays(), []);
});

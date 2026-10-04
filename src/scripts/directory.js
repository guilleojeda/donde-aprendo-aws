import { filterResources, sortResources } from '../lib/directory-filter.mjs';
import { parseDirectorySearch, serializeDirectorySearch } from '../lib/directory-url.mjs';

const controls = document.querySelector('[data-directory-controls]');
const list = document.querySelector('[data-resource-list]');

if (controls && list) {
  const search = controls.querySelector('[data-resource-search]');
  const selects = {
    format: controls.querySelector('[data-format-filter]'),
    topic: controls.querySelector('[data-topic-filter]'),
    country: controls.querySelector('[data-country-filter]'),
    level: controls.querySelector('[data-level-filter]'),
  };
  const sortSelect = document.querySelector('[data-sort-filter]');
  const cards = [...list.querySelectorAll('[data-resource-index]')];
  const records = cards.map((card) => ({
    card,
    kind: card.dataset.kind,
    format: card.dataset.format,
    topics: (card.dataset.topics || '').split('|').filter(Boolean),
    country: card.dataset.country || '',
    level: card.dataset.level || '',
    addedAt: card.dataset.addedAt || '',
    featured: card.dataset.featured === 'true',
    search: card.dataset.search || '',
  }));
  const recordsById = new Map(records.map((record) => [record.card.id, record]));
  const allowed = Object.fromEntries(Object.entries(selects).map(([key, select]) => [
    key, new Set([...(select?.options ?? [])].map((option) => option.value).filter(Boolean)),
  ]));
  const noResults = document.querySelector('[data-no-results]');
  const resultCount = document.querySelector('[data-result-count]');
  const showMore = document.querySelector('[data-show-more]');
  const showMoreWrap = document.querySelector('[data-show-more-wrap]');
  const pageSize = 12;
  let state = parseDirectorySearch(location.search, allowed);
  let limit = pageSize;

  const applyControls = () => {
    if (search) search.value = state.query;
    for (const [field, select] of Object.entries(selects)) {
      if (select) select.value = state[field];
    }
    if (sortSelect) sortSelect.value = state.sort;
  };

  const update = () => {
    const ordered = sortResources(records, state.sort);
    list.append(...ordered.map(({ card }) => card));
    const matching = filterResources(ordered, state);
    const visible = new Set(matching.slice(0, limit).map(({ card }) => card));
    for (const card of cards) {
      card.hidden = !visible.has(card);
      card.setAttribute('aria-hidden', String(card.hidden));
    }
    if (resultCount) resultCount.textContent = `${matching.length} ${matching.length === 1 ? resultCount.dataset.countSingular : resultCount.dataset.countPlural}`;
    if (noResults) noResults.hidden = matching.length !== 0;
    if (showMoreWrap && showMore) {
      const remaining = matching.length - limit;
      showMoreWrap.hidden = remaining <= 0;
      showMore.textContent = `Mostrar ${Math.min(pageSize, Math.max(0, remaining))} más`;
    }
  };

  const writeUrl = (method) => {
    const query = serializeDirectorySearch(location.search, state);
    const url = `${location.pathname}${query ? `?${query}` : ''}`;
    history[method](null, '', url);
  };

  const change = (method = 'pushState') => {
    limit = pageSize;
    writeUrl(method);
    update();
  };

  const revealRecord = (id) => {
    const record = recordsById.get(`resource-${id}`);
    if (!record) return;
    state = parseDirectorySearch('', allowed);
    limit = Infinity;
    applyControls();
    const query = serializeDirectorySearch(location.search, state);
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}#resource-${id}`);
    update();
    requestAnimationFrame(() => {
      record.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      record.card.focus({ preventScroll: true });
    });
  };

  search?.addEventListener('input', () => {
    state.query = search.value;
    change('replaceState');
  });
  for (const [field, select] of Object.entries(selects)) {
    select?.addEventListener('change', () => {
      state[field] = select.value;
      change();
    });
  }
  sortSelect?.addEventListener('change', () => {
    state.sort = sortSelect.value;
    change();
  });
  showMore?.addEventListener('click', () => {
    limit += pageSize;
    update();
  });
  document.querySelectorAll('[data-resource-jump]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const url = new URL(link.href);
      const id = link.dataset.resourceJump;
      if (url.pathname !== location.pathname || !id || !recordsById.has(`resource-${id}`)) return;
      event.preventDefault();
      history.pushState(null, '', `${location.pathname}${location.search}#resource-${id}`);
      revealRecord(id);
    });
  });
  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#resource-')) revealRecord(location.hash.slice('#resource-'.length));
  });
  window.addEventListener('popstate', () => {
    state = parseDirectorySearch(location.search, allowed);
    limit = pageSize;
    applyControls();
    update();
    if (location.hash.startsWith('#resource-')) revealRecord(location.hash.slice('#resource-'.length));
  });

  applyControls();
  update();
  if (location.hash.startsWith('#resource-')) revealRecord(location.hash.slice('#resource-'.length));
}

import { filterResources, sortResources } from '../lib/directory-filter.mjs';

const directory = document.querySelector('[data-directory-controls]');
const list = document.querySelector('[data-resource-list]');

if (directory && list) {
  const search = directory.querySelector('[data-resource-search]');
  const kinds = [...directory.querySelectorAll('[data-kind-filter]')];
  const formatSelect = directory.querySelector('[data-format-filter]');
  const topicSelect = directory.querySelector('[data-topic-filter]');
  const countrySelect = directory.querySelector('[data-country-filter]');
  const levelSelect = directory.querySelector('[data-level-filter]');
  const levelField = directory.querySelector('[data-level-field]');
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
  const noResults = document.querySelector('[data-no-results]');
  const resultCount = document.querySelector('[data-result-count]');
  const showMore = document.querySelector('[data-show-more]');
  const showMoreWrap = document.querySelector('[data-show-more-wrap]');
  const pageSize = 8;
  const state = { query: '', kind: 'content', format: '', topic: '', country: '', level: '', sort: 'directory', expanded: false };

  document.documentElement.classList.add('js');

  const update = () => {
    const ordered = sortResources(records, state.sort);
    list.append(...ordered.map(({ card }) => card));
    const matching = filterResources(ordered, state);
    const visible = new Set((state.expanded ? matching : matching.slice(0, pageSize)).map(({ card }) => card));

    cards.forEach((card) => {
      const isVisible = visible.has(card);
      card.hidden = !isVisible;
      card.setAttribute('aria-hidden', String(!isVisible));
    });

    kinds.forEach((button) => {
      const selected = button.dataset.kindFilter === (state.kind || 'all');
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });

    const visibleCount = matching.length;
    if (resultCount) {
      resultCount.textContent = visibleCount === 1 ? '1 recurso' : `${visibleCount} recursos`;
    }
    if (noResults) noResults.hidden = visibleCount !== 0;
    if (showMoreWrap && showMore) {
      showMoreWrap.hidden = visibleCount <= pageSize;
      showMore.textContent = state.expanded ? 'Mostrar menos' : 'Mostrar Todos';
      showMore.setAttribute('aria-expanded', String(state.expanded));
      showMore.disabled = visibleCount === 0;
    }
  };

  const updateFacetOptions = () => {
    for (const [select, field] of [[formatSelect, 'format'], [topicSelect, 'topics'], [countrySelect, 'country'], [levelSelect, 'level']]) {
      for (const option of select?.options ?? []) {
        if (!option.value) continue;
        const available = records.some((record) => (!state.kind || record.kind === state.kind)
          && (field === 'topics' ? record.topics.includes(option.value) : record[field] === option.value));
        option.hidden = !available;
        option.disabled = !available;
      }
    }
    if (levelField) levelField.hidden = Boolean(state.kind && state.kind !== 'content');
  };

  const resetFacets = () => {
    state.query = '';
    state.format = '';
    state.topic = '';
    state.country = '';
    state.level = '';
    if (search) search.value = '';
    for (const select of [formatSelect, topicSelect, countrySelect, levelSelect]) {
      if (select) select.value = '';
    }
    updateFacetOptions();
  };

  const clearResourceHash = () => {
    if (location.hash.startsWith('#resource-')) history.replaceState(null, '', `${location.pathname}${location.search}`);
  };

  const revealRecord = (id) => {
    const record = recordsById.get(`resource-${id}`);
    if (!record) return;
    state.kind = record.kind;
    state.sort = 'directory';
    state.expanded = true;
    if (sortSelect) sortSelect.value = 'directory';
    resetFacets();
    update();
    requestAnimationFrame(() => {
      record.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      record.card.focus({ preventScroll: true });
    });
  };

  search?.addEventListener('input', () => {
    clearResourceHash();
    state.query = search.value;
    state.expanded = false;
    update();
  });

  kinds.forEach((button) => {
    button.addEventListener('click', () => {
      clearResourceHash();
      state.kind = button.dataset.kindFilter || 'content';
      if (state.kind === 'all') state.kind = '';
      resetFacets();
      state.expanded = false;
      update();
    });
  });

  formatSelect?.addEventListener('change', () => {
    clearResourceHash();
    state.format = formatSelect.value;
    state.expanded = false;
    update();
  });
  topicSelect?.addEventListener('change', () => {
    clearResourceHash();
    state.topic = topicSelect.value;
    state.expanded = false;
    update();
  });
  countrySelect?.addEventListener('change', () => {
    clearResourceHash();
    state.country = countrySelect.value;
    state.expanded = false;
    update();
  });
  levelSelect?.addEventListener('change', () => {
    clearResourceHash();
    state.level = levelSelect.value;
    state.expanded = false;
    update();
  });
  sortSelect?.addEventListener('change', () => {
    clearResourceHash();
    state.sort = sortSelect.value;
    state.expanded = false;
    update();
  });

  document.querySelectorAll('[data-discovery-sort]').forEach((button) => {
    button.addEventListener('click', () => {
      clearResourceHash();
      state.kind = '';
      state.sort = button.dataset.discoverySort || 'directory';
      state.expanded = false;
      if (sortSelect) sortSelect.value = state.sort;
      resetFacets();
      update();
      list.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  document.querySelectorAll('[data-resource-jump]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const id = link.dataset.resourceJump;
      if (!id || !recordsById.has(`resource-${id}`)) return;
      event.preventDefault();
      history.pushState(null, '', `#resource-${id}`);
      revealRecord(id);
    });
  });

  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#resource-')) revealRecord(location.hash.slice('#resource-'.length));
  });

  showMore?.addEventListener('click', () => {
    clearResourceHash();
    state.expanded = !state.expanded;
    update();
    if (!state.expanded) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  updateFacetOptions();
  update();
  if (location.hash.startsWith('#resource-')) revealRecord(location.hash.slice('#resource-'.length));
}

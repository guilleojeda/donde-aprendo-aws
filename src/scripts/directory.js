import { directoryGroupMembership, directoryListEntries, filterResources, sortResources } from '../lib/directory-filter.mjs';
import { parseDirectorySearch, resetDirectorySearchForReveal, serializeDirectorySearch } from '../lib/directory-url.mjs';

const controls = document.querySelector('[data-directory-controls]');
const list = document.querySelector('[data-resource-list]');

if (controls && list) {
  const search = controls.querySelector('[data-resource-search]');
  const selects = {
    format: controls.querySelector('[data-format-filter]'),
    topic: controls.querySelector('[data-topic-filter]'),
    country: controls.querySelector('[data-country-filter]'),
    level: controls.querySelector('[data-level-filter]'),
    group: controls.querySelector('[data-group-filter]'),
  };
  const sortSelect = document.querySelector('[data-sort-filter]');
  const defaultSort = sortSelect?.dataset.defaultSort ?? 'recommended';
  const cards = [...list.querySelectorAll('[data-resource-index]')];
  let collectionGroups = [];
  try {
    collectionGroups = JSON.parse(list.dataset.resourceGroups || '[]');
  } catch {
    collectionGroups = [];
  }
  const groupByResourceId = new Map(collectionGroups.flatMap((group, groupIndex) => group.resourceIds
    .map((id) => [id, { ...group, groupIndex }])));
  const groupMembership = directoryGroupMembership(collectionGroups);
  const records = cards.map((card) => ({
    card,
    directoryIndex: Number(card.dataset.resourceIndex),
    kind: card.dataset.kind,
    format: card.dataset.format,
    topics: (card.dataset.topics || '').split('|').filter(Boolean),
    country: card.dataset.country || '',
    level: card.dataset.level || '',
    addedAt: card.dataset.addedAt || '',
    featured: card.dataset.featured === 'true',
    search: card.dataset.search || '',
    purposeGroupId: groupByResourceId.get(card.id.replace(/^resource-/u, ''))?.id,
    purposeGroupIndex: groupByResourceId.get(card.id.replace(/^resource-/u, ''))?.groupIndex,
    purposeGroupLabel: groupByResourceId.get(card.id.replace(/^resource-/u, ''))?.label,
    purposeGroupDescription: groupByResourceId.get(card.id.replace(/^resource-/u, ''))?.description,
    groupIds: groupMembership.get(card.id.replace(/^resource-/u, '')) ?? [],
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
  let state = parseDirectorySearch(location.search, allowed, defaultSort);
  let limit = pageSize;

  const applyControls = () => {
    if (search) search.value = state.query;
    for (const [field, select] of Object.entries(selects)) {
      if (select) select.value = state[field];
    }
    if (sortSelect) sortSelect.value = state.sort;
    if (controls.querySelector('[data-filter-disclosure]')
      && (state.format || state.topic || state.country || state.level)) {
      controls.querySelector('[data-filter-disclosure]').open = true;
    }
  };

  const update = () => {
    const ordered = sortResources(records, state.sort);
    const matching = filterResources(ordered, state);
    const visible = matching.slice(0, limit);
    const fragment = document.createDocumentFragment();
    for (const entry of directoryListEntries(ordered, visible, state.sort)) {
      if (entry.type === 'heading') {
        const heading = document.createElement('li');
        heading.className = 'resource-list__group-heading';
        heading.dataset.resourceGroupHeading = '';
        const title = document.createElement('h2');
        title.textContent = entry.label;
        heading.append(title);
        if (entry.description) {
          const description = document.createElement('p');
          description.textContent = entry.description;
          heading.append(description);
        }
        fragment.append(heading);
        continue;
      }
      const { resource: record, visible: isVisible } = entry;
      if (isVisible) {
        record.card.hidden = false;
        record.card.setAttribute('aria-hidden', 'false');
      } else {
        record.card.hidden = true;
        record.card.setAttribute('aria-hidden', 'true');
      }
      fragment.append(record.card);
    }
    list.replaceChildren(fragment);
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
    state = resetDirectorySearchForReveal(state, allowed, defaultSort);
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
    state.sortExplicit = true;
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
    state = parseDirectorySearch(location.search, allowed, defaultSort);
    limit = pageSize;
    applyControls();
    update();
    if (location.hash.startsWith('#resource-')) revealRecord(location.hash.slice('#resource-'.length));
  });

  applyControls();
  update();
  if (location.hash.startsWith('#resource-')) revealRecord(location.hash.slice('#resource-'.length));
}

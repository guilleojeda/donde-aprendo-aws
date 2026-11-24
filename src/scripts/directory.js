import { directoryGroupMembership, directoryListEntries, filterResources, sortResources } from '../lib/directory-filter.mjs';
import { resetDirectorySearchForReveal } from '../lib/directory-url.mjs';
import { COUNTRY_LABELS, LEVEL_LABELS } from '../lib/resource-discovery.mjs';
import { resourceFragment, resolveResourceFragment } from '../lib/resource-fragments.mjs';
import { bindFacetSelections, bindFilterDisclosures } from './directory-filters.js';

const controls = document.querySelector('[data-directory-controls]');
const list = document.querySelector('[data-resource-list]');

const disclosures = [
  ...document.querySelectorAll('[data-filter-disclosure]'),
  ...document.querySelectorAll('[data-directory-route-disclosure]'),
];
bindFilterDisclosures(disclosures);

if (controls && list) {
  const search = controls.querySelector('[data-resource-search]');
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
  const labels = (value, knownLabels) => value ? knownLabels[value] ?? value : '';
  const readSemanticValues = (card, field) => [...card.querySelectorAll(`[data-search="${field}"]`)]
    .map(({ textContent = '' }) => textContent.trim())
    .filter(Boolean);
  const readSemanticText = (card, field) => readSemanticValues(card, field).join(' ');
  const records = cards.map((card) => {
    const resourceId = card.id.replace(/^resource-/u, '');
    const topics = (card.dataset.topics || '').split('|').filter(Boolean);
    const country = card.dataset.country || '';
    const level = card.dataset.level || '';
    const format = card.dataset.format || '';
    const searchFields = Object.fromEntries(['title', 'description', 'source', 'community', 'event', 'series']
      .map((field) => [field, readSemanticText(card, field)]));
    const seriesSearch = readSemanticValues(card, 'series').map((value) => `Serie ${value}`).join(' ');

    return {
      card,
      directoryIndex: Number(card.dataset.resourceIndex),
      kind: card.dataset.kind || '',
      format,
      topics,
      country,
      level,
      addedAt: card.dataset.addedAt || '',
      featured: card.dataset.featured === 'true',
      search: `${searchFields.title} ${searchFields.description} ${card.dataset.category ?? ''} ${format} ${topics.join(' ')} ${labels(country, COUNTRY_LABELS)} ${labels(level, LEVEL_LABELS)} ${searchFields.source} ${searchFields.community} ${searchFields.event}${seriesSearch ? ` ${seriesSearch}` : ''}`,
      purposeGroupId: groupByResourceId.get(resourceId)?.id,
      purposeGroupIndex: groupByResourceId.get(resourceId)?.groupIndex,
      purposeGroupLabel: groupByResourceId.get(resourceId)?.label,
      purposeGroupDescription: groupByResourceId.get(resourceId)?.description,
      groupIds: groupMembership.get(resourceId) ?? [],
    };
  });
  const recordsById = new Map(records.map((record) => [record.card.id.replace(/^resource-/u, ''), record]));
  let fragmentTargetCard;
  const setFragmentTarget = (id) => {
    if (fragmentTargetCard) delete fragmentTargetCard.dataset.resourceFragmentTarget;
    fragmentTargetCard = id === undefined ? undefined : recordsById.get(id)?.card;
    if (fragmentTargetCard) fragmentTargetCard.dataset.resourceFragmentTarget = '';
  };
  const noResults = document.querySelector('[data-no-results]');
  const resultCount = document.querySelector('[data-result-count]');
  const showMore = document.querySelector('[data-show-more]');
  const showMoreWrap = document.querySelector('[data-show-more-wrap]');
  const pageSize = 12;
  const facetFields = ['format', 'topic', 'country', 'level', 'group'];
  const facetBinding = bindFacetSelections(controls, {
    fields: facetFields,
    defaultSort,
    ownedFields: ['q', 'format', 'topic', 'country', 'level', 'sort', 'group'],
    disclosure: controls.querySelector('[data-filter-disclosure]'),
    onChange: (_state, { reason }) => {
      if (reason === 'reveal') {
        limit = Infinity;
        applyControls(_state);
      }
      else {
        limit = pageSize;
        setFragmentTarget(undefined);
      }
      update();
    },
    onRestore: (state) => {
      limit = pageSize;
      applyControls(state);
      update();
      const id = resolveResourceFragment(location.hash, recordsById);
      if (id !== undefined) revealRecord(id);
      else setFragmentTarget(undefined);
    },
  });
  let limit = pageSize;

  const applyControls = (state = facetBinding.getState()) => {
    if (search) search.value = state.query ?? '';
    if (sortSelect) sortSelect.value = state.sort ?? defaultSort;
  };

  const update = () => {
    const state = facetBinding.getState();
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
    return matching;
  };

  const change = (method = 'pushState', state = facetBinding.getState()) => {
    facetBinding.commit(method, '', state, 'navigation');
  };

  const revealRecord = (id) => {
    const record = recordsById.get(id);
    if (!record) return;
    const state = resetDirectorySearchForReveal(facetBinding.getState(), facetBinding.allowed, defaultSort);
    setFragmentTarget(id);
    facetBinding.commit('replaceState', resourceFragment(id), state, 'reveal');
    requestAnimationFrame(() => {
      record.card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      record.card.focus({ preventScroll: true });
    });
  };

  search?.addEventListener('input', () => {
    change('replaceState', { ...facetBinding.getState(), query: search.value });
  });
  sortSelect?.addEventListener('change', () => {
    change('pushState', { ...facetBinding.getState(), sort: sortSelect.value, sortExplicit: true });
  });
  showMore?.addEventListener('click', () => {
    const previousLimit = limit;
    limit += pageSize;
    const matching = update();
    matching[previousLimit]?.card.focus();
  });
  window.addEventListener('hashchange', () => {
    const id = resolveResourceFragment(location.hash, recordsById);
    if (id !== undefined) revealRecord(id);
    else setFragmentTarget(undefined);
  });
  applyControls();
  update();
  const initialResourceId = resolveResourceFragment(location.hash, recordsById);
  if (initialResourceId !== undefined) revealRecord(initialResourceId);
  list.dataset.directoryReady = '';
}

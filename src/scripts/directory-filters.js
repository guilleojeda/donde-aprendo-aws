import { activeFacetCount } from '../lib/directory-facets.mjs';
import { parseDirectorySearch, serializeDirectorySearch } from '../lib/directory-url.mjs';
import { positionDirectoryOverlay } from './directory-overlay.js';

const isThemeToggle = (target) => Boolean(target?.closest?.('[data-theme-toggle]'));

export function bindFilterDisclosures(disclosures) {
  const list = [...disclosures].filter(Boolean);
  const documentRef = list[0]?.ownerDocument ?? globalThis.document;
  const windowRef = documentRef?.defaultView ?? globalThis.window;
  const requestFrame = windowRef?.requestAnimationFrame ?? globalThis.requestAnimationFrame;
  const positionOpen = () => list.forEach(positionDirectoryOverlay);
  for (const disclosure of list) {
    disclosure.dataset.directoryOverlayReady = '';
    disclosure.addEventListener('toggle', () => {
      if (disclosure.open) requestFrame?.(() => positionDirectoryOverlay(disclosure));
    });
  }
  if (!list.length) return { positionOpen };

  documentRef?.addEventListener('focusout', (event) => {
    for (const disclosure of list) {
      if (!disclosure.open || (!disclosure.contains(event.target) && !isThemeToggle(event.target))) continue;
      if (!disclosure.contains(event.relatedTarget) && !isThemeToggle(event.relatedTarget)) disclosure.open = false;
    }
  });

  documentRef?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = list.filter((disclosure) => disclosure.open);
    if (!open.length) return;
    const focused = open.find((disclosure) => disclosure.contains(event.target));
    if (focused) {
      event.preventDefault();
      event.stopPropagation();
      focused.open = false;
      focused.querySelector('summary')?.focus();
      return;
    }
    for (const disclosure of open) disclosure.open = false;
  }, { capture: true });

  documentRef?.addEventListener('click', (event) => {
    if (isThemeToggle(event.target)) return;
    for (const disclosure of list) {
      if (disclosure.open && !disclosure.contains(event.target)) disclosure.open = false;
    }
  });

  windowRef?.addEventListener('resize', positionOpen);
  windowRef?.addEventListener('scroll', positionOpen, true);
  return { positionOpen };
}

function bindFacetSummary(disclosure, fields = ['kind', 'format', 'topic']) {
  const summary = disclosure?.querySelector('[data-filter-summary]');
  if (!summary) return () => {};
  const update = () => {
    const label = summary.dataset.filterSummaryLabel || 'Filtros';
    const count = activeFacetCount(disclosure, fields);
    summary.textContent = count ? `${label} (${count})` : label;
  };
  update();
  return update;
}

export function bindFacetSelections(root, {
  fields,
  defaultSort = 'recommended',
  ownedFields,
  onChange,
  onRestore,
  disclosure,
  summaryFields = fields,
  includeHash = false,
} = {}) {
  const selects = Object.fromEntries(fields.map((field) => [
    field, root.querySelector(`[data-${field}-filter]`),
  ]));
  const allowed = Object.fromEntries(Object.entries(selects).map(([field, select]) => [
    field, new Set([...(select?.options ?? [])].map((option) => option.value).filter(Boolean)),
  ]));
  const documentRef = root.ownerDocument ?? globalThis.document;
  const windowRef = documentRef?.defaultView ?? globalThis.window;
  const locationRef = windowRef?.location ?? globalThis.location;
  const historyRef = windowRef?.history ?? globalThis.history;
  const updateSummary = bindFacetSummary(disclosure ?? root.querySelector('[data-filter-disclosure]'), summaryFields);
  let state = parseDirectorySearch(locationRef.search, allowed, defaultSort, { ownedFields });
  const apply = (nextState = state) => {
    state = nextState;
    for (const field of fields) {
      const select = selects[field];
      if (select) select.value = state[field] ?? '';
    }
    updateSummary();
  };
  const commit = (method = 'pushState', hash = includeHash ? locationRef.hash : '', nextState = state, reason = 'facet') => {
    if (!locationRef || !historyRef) return;
    state = nextState;
    const query = serializeDirectorySearch(locationRef.search, state, { ownedFields });
    const url = `${locationRef.pathname}${query ? `?${query}` : ''}${hash}`;
    historyRef[method](null, '', url);
    apply(state);
    onChange?.(state, { method, reason });
  };
  apply(state);
  for (const field of fields) {
    selects[field]?.addEventListener('change', () => {
      commit('pushState', includeHash ? locationRef.hash : '', {
        ...state,
        [field]: selects[field].value,
      });
    });
  }
  windowRef?.addEventListener('popstate', () => {
    state = parseDirectorySearch(locationRef.search, allowed, defaultSort, { ownedFields });
    apply(state);
    onRestore?.(state);
  });
  return {
    allowed,
    getState: () => state,
    commit,
  };
}


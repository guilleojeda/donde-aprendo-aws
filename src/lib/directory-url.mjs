const FIELDS = ['q', 'format', 'topic', 'country', 'level', 'sort'];
const SORTS = new Set(['directory', 'recent', 'recommended', 'purpose']);
const DEFAULT_OWNED_FIELDS = [...FIELDS, 'kind', 'group'];

export function parseDirectorySearch(search, allowed = {}, defaultSort = 'recommended', { ownedFields = DEFAULT_OWNED_FIELDS } = {}) {
  const params = new URLSearchParams(search);
  const owns = new Set(ownedFields);
  const choice = (key) => allowed[key]?.has(params.get(key)) ? params.get(key) : '';
  const requestedSort = params.get('sort');
  const sortExplicit = SORTS.has(requestedSort) && (requestedSort !== 'purpose' || defaultSort === 'purpose');
  const state = {
    ...(owns.has('q') ? { query: (params.get('q') ?? '').slice(0, 200) } : {}),
    ...(owns.has('format') ? { format: choice('format') } : {}),
    ...(owns.has('topic') ? { topic: choice('topic') } : {}),
    ...(owns.has('country') ? { country: choice('country') } : {}),
    ...(owns.has('level') ? { level: choice('level') } : {}),
    ...(owns.has('group') ? {
      group: choice('group'),
      groupFilterEnabled: allowed.group instanceof Set && allowed.group.size > 0,
    } : {}),
    ...(owns.has('sort') ? {
      sort: sortExplicit ? requestedSort : defaultSort,
      sortExplicit,
      defaultSort,
    } : {}),
  };
  if (owns.has('kind') && allowed.kind instanceof Set) {
    state.kind = choice('kind');
    state.kindFilterEnabled = true;
  }
  return state;
}

export function resetDirectorySearchForReveal(state, allowed = {}, defaultSort = 'recommended', options = {}) {
  const reset = parseDirectorySearch('', allowed, defaultSort, options);
  if (Object.hasOwn(reset, 'sort')) {
    reset.sort = state.sort;
    reset.sortExplicit = state.sortExplicit;
  }
  return reset;
}

export function serializeDirectorySearch(search, state, { ownedFields = DEFAULT_OWNED_FIELDS } = {}) {
  const params = new URLSearchParams(search);
  const owns = new Set(ownedFields);
  for (const field of FIELDS) if (owns.has(field)) params.delete(field);
  if (state.kindFilterEnabled && owns.has('kind')) params.delete('kind');
  if (state.groupFilterEnabled) params.delete('group');
  if (owns.has('q') && state.query.trim()) params.set('q', state.query.trim());
  if (state.kindFilterEnabled && owns.has('kind') && state.kind) params.set('kind', state.kind);
  for (const field of ['format', 'topic', 'country', 'level']) {
    if (owns.has(field) && state[field]) params.set(field, state[field]);
  }
  if (state.groupFilterEnabled && state.group) params.set('group', state.group);
  if (owns.has('sort') && state.sort && (state.sortExplicit || state.sort !== (state.defaultSort ?? 'recommended'))) params.set('sort', state.sort);
  return params.toString();
}

const FIELDS = ['q', 'format', 'topic', 'country', 'level', 'sort'];
const SORTS = new Set(['directory', 'recent', 'recommended', 'purpose']);

export function parseDirectorySearch(search, allowed = {}, defaultSort = 'recommended') {
  const params = new URLSearchParams(search);
  const choice = (key) => allowed[key]?.has(params.get(key)) ? params.get(key) : '';
  const requestedSort = params.get('sort');
  const sortExplicit = SORTS.has(requestedSort) && (requestedSort !== 'purpose' || defaultSort === 'purpose');
  return {
    query: (params.get('q') ?? '').slice(0, 200),
    format: choice('format'),
    topic: choice('topic'),
    country: choice('country'),
    level: choice('level'),
    group: choice('group'),
    groupFilterEnabled: allowed.group instanceof Set && allowed.group.size > 0,
    sort: sortExplicit ? requestedSort : defaultSort,
    sortExplicit,
    defaultSort,
  };
}

export function resetDirectorySearchForReveal(state, allowed = {}, defaultSort = 'recommended') {
  const reset = parseDirectorySearch('', allowed, defaultSort);
  reset.sort = state.sort;
  reset.sortExplicit = state.sortExplicit;
  return reset;
}

export function serializeDirectorySearch(search, state) {
  const params = new URLSearchParams(search);
  for (const field of FIELDS) params.delete(field);
  if (state.groupFilterEnabled) params.delete('group');
  if (state.query.trim()) params.set('q', state.query.trim());
  for (const field of ['format', 'topic', 'country', 'level']) {
    if (state[field]) params.set(field, state[field]);
  }
  if (state.groupFilterEnabled && state.group) params.set('group', state.group);
  if (state.sort && (state.sortExplicit || state.sort !== (state.defaultSort ?? 'recommended'))) params.set('sort', state.sort);
  return params.toString();
}

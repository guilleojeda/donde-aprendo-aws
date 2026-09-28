const FIELDS = ['q', 'format', 'topic', 'country', 'level', 'sort'];
const SORTS = new Set(['directory', 'recent', 'recommended']);

export function parseDirectorySearch(search, allowed = {}) {
  const params = new URLSearchParams(search);
  const choice = (key) => allowed[key]?.has(params.get(key)) ? params.get(key) : '';
  const sort = params.get('sort');
  return {
    query: (params.get('q') ?? '').slice(0, 200),
    format: choice('format'),
    topic: choice('topic'),
    country: choice('country'),
    level: choice('level'),
    sort: SORTS.has(sort) ? sort : 'directory',
  };
}

export function serializeDirectorySearch(search, state) {
  const params = new URLSearchParams(search);
  for (const field of FIELDS) params.delete(field);
  if (state.query.trim()) params.set('q', state.query.trim());
  for (const field of ['format', 'topic', 'country', 'level']) {
    if (state[field]) params.set(field, state[field]);
  }
  if (state.sort && state.sort !== 'directory') params.set('sort', state.sort);
  return params.toString();
}

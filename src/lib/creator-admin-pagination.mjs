export const ADMIN_RESOURCE_PAGE_SIZE = 25;

const RESOURCE_STATES = new Set(['all', 'pending', 'approved', 'revoked', 'hidden']);

function text(value) {
  return typeof value === 'string' ? value : '';
}

function approvalState(resource) {
  if (resource.directoryApproval === 'approved'
      || resource.directoryApproval === 'revoked'
      || resource.directoryApproval === 'pending') return resource.directoryApproval;
  return resource.published === true ? 'approved' : 'pending';
}

function matchesState(resource, state) {
  if (state === 'all') return true;
  if (state === 'hidden') return resource.hidden === true;
  return approvalState(resource) === state;
}

function positiveInteger(value, fallback = 1) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function selectAdminResources(resources, searchParams, pageSize = ADMIN_RESOURCE_PAGE_SIZE) {
  if (!Array.isArray(resources) || !Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new TypeError('Admin resource pagination requires a resource list and a positive page size');
  }

  const query = text(searchParams.get('q')).trim().slice(0, 200);
  const normalizedQuery = query.toLowerCase();
  const requestedState = text(searchParams.get('state'));
  const state = RESOURCE_STATES.has(requestedState) ? requestedState : 'pending';
  const queryMatches = normalizedQuery
    ? resources.filter((resource) => [resource.id, resource.title, resource.url]
      .some((value) => text(value).toLowerCase().includes(normalizedQuery)))
    : resources;

  const stateCounts = { all: queryMatches.length, pending: 0, approved: 0, revoked: 0, hidden: 0 };
  for (const resource of queryMatches) {
    stateCounts[approvalState(resource)] += 1;
    if (resource.hidden === true) stateCounts.hidden += 1;
  }

  const filtered = queryMatches.filter((resource) => matchesState(resource, state));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(positiveInteger(searchParams.get('page')), pageCount);
  const offset = (page - 1) * pageSize;

  return {
    resources: filtered.slice(offset, offset + pageSize),
    query,
    state,
    page,
    pageSize,
    pageCount,
    totalFiltered: filtered.length,
    totalResources: resources.length,
    firstVisible: filtered.length === 0 ? 0 : offset + 1,
    lastVisible: Math.min(offset + pageSize, filtered.length),
    stateCounts,
  };
}

export function adminResourcePageHref({ query, state, page }) {
  const params = new URLSearchParams();
  if (typeof query === 'string' && query) params.set('q', query);
  params.set('state', RESOURCE_STATES.has(state) ? state : 'pending');
  params.set('page', String(positiveInteger(page)));
  return `/cuenta/administracion/?${params.toString()}#admin-resources`;
}

import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { dynamoDbItemSize } from '../../src/lib/creator-dynamodb-size.mjs';
import { creatorStoreInternals } from '../../src/lib/creator-store.mjs';

const PRODUCT_MODULE = new URL('../../src/lib/creator-pages.mjs', import.meta.url);

export const SITE_ORIGIN = 'https://dondeaprendoaws.com';

export function adminResourceCommandMatches(target, id, action) {
  const url = target instanceof URL ? target : new URL(target, SITE_ORIGIN);
  const pathname = url.pathname.replace(/\/+$/u, '') || '/';
  const collection = '/api/admin/recursos';
  const queryPath = action ? `${collection}/${action}` : collection;
  const queryKeys = [...url.searchParams.keys()];
  if (pathname === queryPath) {
    const ids = url.searchParams.getAll('id');
    return queryKeys.length === 1 && queryKeys[0] === 'id' && ids.length === 1 && ids[0] === id;
  }
  if (queryKeys.length > 0) return false;
  const legacy = pathname.match(/^\/api\/admin\/recursos\/([^/]+)(?:\/(aprobar|revocar|ocultar|restaurar))?$/u);
  if (!legacy || (legacy[2] ?? undefined) !== action) return false;
  try {
    return decodeURIComponent(legacy[1]) === id;
  } catch {
    return false;
  }
}

/**
 * Acceptance contract for the creator-page service:
 *
 *   createCreatorPagesService({ store, authenticate, origin, now, createId })
 *   service.handle(Request) -> Response
 *   service.readPublicProfile(slug, { suffix, search }) -> public model
 *   service.readCreatorEditor(context) -> actual owner query result
 *   service.readAdmin*(context) -> actual guarded admin query result
 *
 * The exercised routes cover owner profile/content/photo/claim operations,
 * public profile/Series reads, and guarded admin resource/profile/claim flows.
 * The current owner DTO uses schemaVersion 2, one creatorVersion, one resource
 * collection, placement references/options, and independent general and
 * chapter ID sequences. Content commands submit raw field intent and receive
 * canonical operation acknowledgements. Profile and resource versions retain
 * their separate meanings. API failures use standard 4xx/503 statuses; public
 * model reads carry their HTTP status in `status`.
 * The injected test authenticator returns the same `{ session, principal }`
 * request context as production. `x-test-session` selects only the controlled
 * test principal; production authentication validates real sessions.
 * Mutating requests carry the exact site Origin and the principal's
 * `x-csrf-token`. No test helper grants ownership, selection, eligibility,
 * editor rights, or slug uniqueness.
 *
 * The store is a generic document store. getResources(ids) returns a Map of
 * found resource rows and omits absent IDs; it does not decide whether a
 * resource is eligible or authorized for a domain operation. Its transaction
 * method supplies atomic version/expected-reservation checks and writes; the
 * fixture has no creator-page ownership or URL-index rules.
 */
export async function loadCreatorPagesFactory() {
  try {
    const module = await import(PRODUCT_MODULE.href);
    if (typeof module.createCreatorPagesService !== 'function') {
      throw new Error('Acceptance contract missing: export createCreatorPagesService from src/lib/creator-pages.mjs');
    }
    return module.createCreatorPagesService;
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && error?.url === PRODUCT_MODULE.href) {
      throw new Error('Acceptance behavior absent: src/lib/creator-pages.mjs has not been implemented yet', { cause: error });
    }
    throw error;
  }
}

function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function createDocumentStore() {
  const documents = new Map();
  const calls = [];
  const failures = new Map();

  function before(operation, input) {
    calls.push({ operation, input: copy(input) });
    if (failures.has(operation)) {
      const failure = failures.get(operation);
      failures.delete(operation);
      throw failure instanceof Error ? failure : new Error(String(failure));
    }
  }

  function reservationObservationMatches(key, current, expected, version) {
    if (!current || !expected || typeof expected !== 'object' || Array.isArray(expected)) return false;
    const descriptor = creatorStoreInternals.logicalKey(key);
    if (descriptor.type !== 'urlReservation' || expected.version !== version) return false;
    const physicalValue = { ...current, ...descriptor.key };
    for (const attribute of ['id', 'recordType', 'url', 'status', 'resourceId', 'resourceIds']) {
      const expectedHas = Object.hasOwn(expected, attribute);
      const currentHas = Object.hasOwn(physicalValue, attribute) && physicalValue[attribute] !== undefined;
      if (expectedHas !== currentHas) return false;
      if (expectedHas && !isDeepStrictEqual(physicalValue[attribute], expected[attribute])) return false;
    }
    return true;
  }

  const store = {
    calls,
    failNext(operation, error = new Error(`injected ${operation} failure`)) {
      failures.set(operation, error);
    },
    async get(key) {
      before('get', { key });
      const value = documents.get(key);
      if (value === undefined) return null;
      const descriptor = creatorStoreInternals.logicalKey(key);
      const aggregateVersion = value.recordType === 'creatorState' ? {} : { version: value.version ?? 0 };
      return copy({
        ...value,
        ...(descriptor.type === 'urlReservation' ? descriptor.key : {}),
        ...aggregateVersion,
      });
    },
    async getResources(ids) {
      before('getResources', { ids });
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id.length === 0)) {
        throw new TypeError('resource IDs must be a list of non-empty strings');
      }
      const resources = new Map();
      for (const id of new Set(ids)) {
        const value = documents.get(`resource:${id}`);
        if (value !== undefined) resources.set(id, copy({ ...value, version: value.version ?? 0 }));
      }
      return resources;
    },
    async list(prefix) {
      before('list', { prefix });
      return [...documents.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value: copy(value) }));
    },
    measurePut(key, value) {
      const descriptor = creatorStoreInternals.logicalKey(key);
      const physicalItem = creatorStoreInternals.withPhysicalKeys(descriptor, value);
      return { itemBytes: dynamoDbItemSize(physicalItem) };
    },
    async transact({ checks = [], puts = [], deletes = [] }) {
      before('transact', { checks, puts, deletes });
      for (const check of checks) {
        const { key, version } = check;
        const current = documents.get(key);
        if (version === null ? current !== undefined : current === undefined || (current.version ?? 0) !== version) return false;
        if (Object.hasOwn(check, 'expectedReservation')
          && !reservationObservationMatches(key, current, check.expectedReservation, version)) return false;
      }
      for (const key of deletes) documents.delete(key);
      for (const { key, value } of puts) documents.set(key, copy(value));
      return true;
    },
  };
  return store;
}

/** Seed a logical catalog record for acceptance scenarios involving legacy data. */
export async function seedResource(store, resource) {
  // Legacy scenarios start after the approved current-URL backfill, just as
  // production must before the new writers are activated. No ownership or
  // eligibility decisions belong to this fixture.
  const url = resource.url ?? resource.registrationUrl;
  const urlKey = `url:${createHash('sha256').update(url, 'utf8').digest('hex')}`;
  const result = await store.transact({
    checks: [{ key: `resource:${resource.id}`, version: null }, { key: urlKey, version: null }],
    puts: [
      { key: `resource:${resource.id}`, value: copy({ ...resource, version: resource.version ?? 0 }) },
      { key: urlKey, value: { recordType: 'urlReservation', url, status: 'reserved', resourceId: resource.id, version: 1 } },
    ],
  });
  if (!result) throw new Error(`fixture resource already exists: ${resource.id}`);
}

const principals = {
  'creator-a': { state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-a', isAdmin: false },
  'creator-b': { state: 'authenticated', accountId: 'private-account-b', csrfToken: 'csrf-b', isAdmin: false },
  admin: { state: 'authenticated', accountId: 'private-account-admin', csrfToken: 'csrf-admin', isAdmin: true },
};

function accountSessionForTestPrincipal(principal, sessionName) {
  if (!principal || typeof principal !== 'object') return { state: 'unavailable' };
  if (principal.state === 'anonymous') return { state: 'anonymous' };
  if (principal.state === 'disabled') {
    return typeof principal.csrfToken === 'string'
      ? { state: 'disabled', csrfToken: principal.csrfToken }
      : { state: 'disabled' };
  }
  if (principal.state !== 'authenticated' || typeof principal.csrfToken !== 'string'
    || typeof principal.accountId !== 'string' || !principal.accountId) return { state: 'unavailable' };
  return {
    state: 'authenticated',
    account: { email: `${sessionName || 'test-user'}@example.invalid` },
    csrfToken: principal.csrfToken,
    expiresAt: Date.UTC(2099, 0, 1),
  };
}

export function requestContextForTestPrincipal(principal, sessionName = 'test-user') {
  return {
    session: accountSessionForTestPrincipal(principal, sessionName),
    principal: principal ?? { state: 'anonymous' },
  };
}

export async function createCreatorPagesHarness(options = {}) {
  const createCreatorPagesService = await loadCreatorPagesFactory();
  const store = options.store ?? createDocumentStore();
  const origin = options.origin ?? SITE_ORIGIN;
  let id = 0;
  let now = options.initialTime ?? Date.UTC(2026, 9, 23);
  const authenticate = options.authenticate ?? (async (request) => {
    const sessionName = request.headers.get('x-test-session');
    const principal = principals[sessionName] ?? { state: 'anonymous' };
    return requestContextForTestPrincipal(principal, sessionName);
  });
  const service = createCreatorPagesService({
    store,
    origin,
    now: options.now ?? (() => now),
    createId: options.createId ?? (() => `fixture-id-${++id}`),
    statistics: options.statistics,
    authenticate,
  });
  return {
    service,
    store,
    origin,
    advanceTime(milliseconds) {
      now += milliseconds;
    },
  };
}

export function apiRequest(path, {
  session,
  method = 'GET',
  body,
  origin = SITE_ORIGIN,
  csrf,
  creatorContract,
  extraHeaders = {},
} = {}) {
  const headers = new Headers(extraHeaders);
  if (session) headers.set('x-test-session', session);
  if (origin !== null) headers.set('Origin', origin);
  if (csrf !== undefined) headers.set('x-csrf-token', csrf);
  if (creatorContract !== undefined && creatorContract !== null) headers.set('x-creator-contract', creatorContract);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(new URL(path, SITE_ORIGIN), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function callApi(harness, path, options = {}) {
  return harness.service.handle(apiRequest(path, options));
}

export async function responseJson(response) {
  return response.json();
}

export const sessionCsrf = {
  'creator-a': 'csrf-a',
  'creator-b': 'csrf-b',
  admin: 'csrf-admin',
};

export async function readAdminRecord(harness, type, id) {
  const selection = type === 'resource' ? { path: 'recursos', collection: 'resources' }
    : type === 'profile' ? { path: 'perfiles', collection: 'profiles' } : null;
  if (!selection) throw new TypeError(`unsupported admin record type: ${type}`);
  const response = await callApi(harness, `/api/admin/${selection.path}`, {
    session: 'admin', csrf: sessionCsrf.admin,
  });
  if (!response.ok) throw new Error(`could not read admin ${selection.collection}: HTTP ${response.status}`);
  const body = await responseJson(response);
  const record = body[selection.collection]?.find((candidate) => candidate.id === id);
  if (!record) throw new Error(`admin ${selection.collection} did not contain ${id}`);
  return record;
}

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
 * Acceptance contract for the future creator-page service:
 *
 *   createCreatorPagesService({ store, authenticate, origin, now, createId })
 *   service.handle(Request) -> Response
 *   service.readPublicProfile(slug, { suffix, search }) -> public model
 *
 * The exercised routes are PUT/GET /api/creador/perfil,
 * POST /api/creador/perfil/publicar, POST /api/creador/enlaces,
 * PATCH/DELETE /api/creador/enlaces/:placementId,
 * PATCH /api/creador/recursos/:resourceId,
 * POST /api/creador/reclamaciones,
 * GET /api/admin/recursos and PATCH /api/admin/recursos/:id,
 * POST /api/admin/recursos/:id/{aprobar,revocar,ocultar,restaurar},
 * POST /api/admin/perfiles/:id/{ocultar,restaurar}, and
 * POST /api/admin/reclamaciones/vincular. Creator profile fields include
 * `displayName`, `slug`, and optional location, program, bio, and social fields.
 * Placement updates use `position`, `featured`, and `selectedForDirectory`;
 * resource edits use `title`/`description`; claims require an `accountId` and
 * exact `resourceIds`. A created link returns `placementId`, `resourceId`,
 * `resourceVersion`, `directoryApproval`, and `selectedForDirectory`; profile
 * and resource DTOs expose their optimistic `version` for a later write.
 * API failures use standard
 * 4xx/503 statuses; public model reads carry their HTTP status in `status`.
 * `x-test-session` is interpreted only by the injected authentication function;
 * production authentication remains responsible for validating real sessions.
 * Mutating requests carry the exact site Origin and the principal's
 * `x-csrf-token`. No test helper grants ownership, selection, eligibility,
 * editor rights, or slug uniqueness.
 *
 * The store is a generic document store. Its transaction method supplies
 * atomic version/expected-reservation checks and writes; it has no creator-page
 * ownership or URL-index rules.
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

function copyWithBudget(value, budget) {
  if (value === undefined) return undefined;
  if (!budget) return structuredClone(value);
  if (typeof budget.cloneValue !== 'function') throw new TypeError('budget must expose cloneValue');
  return budget.cloneValue(value);
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

  function observation(key, storedValue, budget, { queryValue = false } = {}) {
    if (storedValue === undefined) {
      const missing = { key, value: null, physicalImage: null, itemBytes: 0 };
      budget?.retainValue(missing);
      return Object.freeze(missing);
    }
    budget?.retainValue(storedValue);
    const descriptor = creatorStoreInternals.logicalKey(key);
    const physicalImage = creatorStoreInternals.withPhysicalKeys(descriptor, copyWithBudget(storedValue, budget));
    budget?.retainValue(physicalImage);
    const value = copyWithBudget(storedValue, budget);
    if (!queryValue) {
      budget?.spendWork(1);
      if (!Object.hasOwn(value, 'version')) budget?.reserveMemory('version'.length * 2 + 16);
      value.version = storedValue.version ?? 0;
    }
    budget?.retainValue(value);
    const result = { key, value, physicalImage, itemBytes: dynamoDbItemSize(physicalImage, { budget }) };
    budget?.retainValue(result);
    return Object.freeze(result);
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
      return copy({
        ...value,
        ...(descriptor.type === 'urlReservation' ? descriptor.key : {}),
        version: value.version ?? 0,
      });
    },
    async list(prefix) {
      before('list', { prefix });
      return [...documents.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value: copy(value) }));
    },
    async observe(key, { budget } = {}) {
      before('get', { key });
      budget?.spendWork(1);
      return observation(key, documents.get(key), budget);
    },
    async observeList(prefix, { budget } = {}) {
      before('list', { prefix });
      const rows = [];
      budget?.retainValue(rows);
      for (const [key, value] of documents.entries()) {
        if (!key.startsWith(prefix)) continue;
        budget?.spendWork(1);
        const row = observation(key, value, budget, { queryValue: true });
      budget?.reserveMemory(16);
        rows.push(row);
      }
      return rows;
    },
    measurePut(key, value, { budget } = {}) {
      budget?.spendWork(1);
      budget?.retainValue(value);
      const descriptor = creatorStoreInternals.logicalKey(key);
      const physicalItem = creatorStoreInternals.withPhysicalKeys(descriptor, value);
      budget?.retainValue(physicalItem);
      return { itemBytes: dynamoDbItemSize(physicalItem, { budget }) };
    },
    async prepareTransaction(transaction = {}, observations = [], { budget } = {}) {
      budget?.retainValue(transaction);
      const snapshot = copyWithBudget(transaction, budget);
      budget?.retainValue(snapshot);
      const { checks = [], puts = [], deletes = [] } = snapshot;
      if (!Array.isArray(checks) || !Array.isArray(puts) || !Array.isArray(deletes)) {
        throw new TypeError('transaction inputs must be arrays');
      }
      if (!Array.isArray(observations)) throw new TypeError('transaction observations must be an array');
      budget?.retainValue(observations);
      const observedById = new Map();
      for (const row of observations) {
        if (!row || typeof row.key !== 'string' || !Number.isSafeInteger(row.itemBytes) || row.itemBytes < 0) {
          throw new TypeError('invalid transaction observation');
        }
        const id = creatorStoreInternals.physicalId(creatorStoreInternals.logicalKey(row.key));
        if (observedById.has(id)) throw new TypeError('duplicate physical transaction observation');
        observedById.set(id, row);
      }

      const conditions = new Map();
      const actions = new Map();
      for (const check of checks) {
        if (!check || typeof check !== 'object') throw new TypeError('invalid transaction check');
        const descriptor = creatorStoreInternals.logicalKey(check.key);
        const id = creatorStoreInternals.physicalId(descriptor);
        if (conditions.has(id)) throw new TypeError('duplicate transaction check for one item');
        conditions.set(id, { key: check.key, version: check.version, descriptor });
      }
      for (const put of puts) {
        if (!put || typeof put !== 'object') throw new TypeError('invalid transaction put');
        const descriptor = creatorStoreInternals.logicalKey(put.key);
        const id = creatorStoreInternals.physicalId(descriptor);
        if (actions.has(id)) throw new TypeError('duplicate transaction action for one item');
        const physicalItem = creatorStoreInternals.withPhysicalKeys(descriptor, put.value);
        budget?.retainValue(physicalItem);
        actions.set(id, { kind: 'put', key: put.key, item: physicalItem });
      }
      for (const key of deletes) {
        const descriptor = creatorStoreInternals.logicalKey(key);
        const id = creatorStoreInternals.physicalId(descriptor);
        if (actions.has(id)) throw new TypeError('duplicate transaction action for one item');
        actions.set(id, { kind: 'delete', key });
      }

      const itemBytes = [];
      let aggregateBytes = 0;
      for (const id of new Set([...conditions.keys(), ...actions.keys()])) {
        budget?.spendWork(1);
        const action = actions.get(id);
        const condition = conditions.get(id);
        let bytes;
        if (action?.kind === 'put') bytes = dynamoDbItemSize(action.item, { budget });
        else {
          const row = observedById.get(id);
          if (!row) {
            if (!action && condition?.version === null) bytes = 0;
            else throw new Error(`physical image observation is required for ${action?.key ?? condition.key}`);
          } else bytes = row.itemBytes;
        }
        itemBytes.push(bytes);
        aggregateBytes += bytes;
      }
      const actionCount = itemBytes.length;
      const fits = actionCount <= 100
        && itemBytes.every((bytes) => bytes <= 400 * 1024)
        && aggregateBytes <= 4 * 1024 * 1024;
      const metrics = Object.freeze({ actionCount, itemBytes: Object.freeze(itemBytes), aggregateBytes, fits });
      budget?.retainValue(metrics);
      return Object.freeze({
        metrics,
        async commit() {
          if (!fits) throw new RangeError('prepared transaction exceeds physical limits');
          return store.transact(snapshot);
        },
      });
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

export async function createCreatorPagesHarness(options = {}) {
  const createCreatorPagesService = await loadCreatorPagesFactory();
  const store = options.store ?? createDocumentStore();
  const origin = options.origin ?? SITE_ORIGIN;
  let id = 0;
  let now = options.initialTime ?? Date.UTC(2026, 9, 23);
  const service = createCreatorPagesService({
    store,
    origin,
    now: options.now ?? (() => now),
    createId: options.createId ?? (() => `fixture-id-${++id}`),
    statistics: options.statistics,
    authenticate: options.authenticate ?? (async (request) => principals[request.headers.get('x-test-session')] ?? { state: 'anonymous' }),
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
  extraHeaders = {},
} = {}) {
  const headers = new Headers(extraHeaders);
  if (session) headers.set('x-test-session', session);
  if (origin !== null) headers.set('Origin', origin);
  if (csrf !== undefined) headers.set('x-csrf-token', csrf);
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

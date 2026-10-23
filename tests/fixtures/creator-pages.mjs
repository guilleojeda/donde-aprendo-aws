import { createHash } from 'node:crypto';

const PRODUCT_MODULE = new URL('../../src/lib/creator-pages.mjs', import.meta.url);

export const SITE_ORIGIN = 'https://dondeaprendoaws.com';

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
 * The store is a generic document store. Its transaction method supplies only
 * atomic version checks and writes; it has no creator-page rules.
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

  return {
    calls,
    failNext(operation, error = new Error(`injected ${operation} failure`)) {
      failures.set(operation, error);
    },
    async get(key) {
      before('get', { key });
      const value = documents.get(key);
      return value === undefined ? null : copy({ ...value, version: value.version ?? 0 });
    },
    async list(prefix) {
      before('list', { prefix });
      return [...documents.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value: copy(value) }));
    },
    async transact({ checks = [], puts = [], deletes = [] }) {
      before('transact', { checks, puts, deletes });
      for (const { key, version } of checks) {
        const current = documents.get(key);
        if (version === null ? current !== undefined : current === undefined || (current.version ?? 0) !== version) return false;
      }
      for (const key of deletes) documents.delete(key);
      for (const { key, value } of puts) documents.set(key, copy(value));
      return true;
    },
  };
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
  let id = 0;
  let now = options.initialTime ?? Date.UTC(2026, 9, 23);
  const service = createCreatorPagesService({
    store,
    origin: SITE_ORIGIN,
    now: options.now ?? (() => now),
    createId: options.createId ?? (() => `fixture-id-${++id}`),
    authenticate: options.authenticate ?? (async (request) => principals[request.headers.get('x-test-session')] ?? { state: 'anonymous' }),
  });
  return {
    service,
    store,
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

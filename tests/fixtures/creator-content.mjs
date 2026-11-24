import { createCreatorPagesHarness, seedResource, sessionCsrf, SITE_ORIGIN, callApi } from './creator-pages.mjs';
import { CREATOR_CONTRACT_VERSION } from '../../src/lib/creator-values.mjs';

export const CREATOR_ACCOUNT_ID = 'private-account-a';
export const CREATOR_PROFILE_ID = 'creator-content-profile';
const FIXED_TIMESTAMP = Date.UTC(2026, 10, 14);

/**
 * Build a real creator-pages service over the generic document store and seed
 * explicit schema-v2 data. This helper arranges records and transport only;
 * every command under test runs through service.handle.
 */
export async function createCreatorContentHarness({
  state = defaultState(),
  accountId = CREATOR_ACCOUNT_ID,
  resources = [],
  editorReferences = [],
  claims = [],
  serviceOptions = {},
} = {}) {
  const harness = await createCreatorPagesHarness(serviceOptions);
  if (state) await seedState(harness.store, accountId, state);
  for (const resource of resources) await seedResource(harness.store, resource);

  for (const reference of editorReferences) {
    const profileId = reference.profileId ?? state?.id;
    if (!profileId) throw new TypeError('editor reference requires a profile ID');
    const resourceId = reference.resourceId;
    if (typeof resourceId !== 'string' || !resourceId) throw new TypeError('editor reference requires a resource ID');
    const key = `editor:${profileId}:${resourceId}`;
    await insert(harness.store, key, {
      recordType: 'editorReference', profileId, resourceId, version: reference.version ?? 1,
    });
  }

  for (const claim of claims) {
    if (!state?.id || typeof claim.id !== 'string' || !claim.id) throw new TypeError('claim requires a seeded profile and ID');
    await insert(harness.store, `claim:${claim.id}`, { ...structuredClone(claim), profileId: claim.profileId ?? state.id });
    await insert(harness.store, `claim-ref:${claim.profileId ?? state.id}:${claim.id}`, {
      id: claim.id, version: 1,
    });
  }

  return harness;
}

export function defaultState({
  profileId = CREATOR_PROFILE_ID,
  creatorVersion = 7,
  profile: profileOverrides = {},
  placements = {},
  order = { featured: [], ordinary: [] },
  series = {},
} = {}) {
  // Presentation remains flat on META to preserve the existing top-level IAM
  // attribute projections. Service assertions use the nested wire DTO.
  const presentation = {
    displayName: 'Creator de prueba',
    slug: 'creator-de-prueba',
    programs: [],
    socials: {},
    published: false,
    hidden: false,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    ...structuredClone(profileOverrides),
  };
  const storedSeries = Object.fromEntries(Object.entries(structuredClone(series)).map(([id, item]) => [id, {
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    ...item,
  }]));
  return {
    recordType: 'creatorState',
    schemaVersion: 2,
    id: profileId,
    version: creatorVersion,
    ...presentation,
    placements: structuredClone(placements),
    order: structuredClone(order),
    series: storedSeries,
  };
}

export async function seedState(store, accountId, state) {
  if (!state || typeof state.id !== 'string' || typeof state.displayName !== 'string' || typeof state.slug !== 'string') {
    throw new TypeError('creator state must contain its exact profile ID and presentation');
  }
  const puts = [
    { key: `account-profile:${accountId}`, value: { recordType: 'accountProfile', profileId: state.id, version: 1 } },
    { key: `profile:${state.id}`, value: structuredClone(state) },
  ];
  const slug = state.slug;
  if (typeof slug === 'string' && slug) {
    puts.push({ key: `alias:${slug}`, value: { recordType: 'profileAlias', slug, profileId: state.id, version: 1 } });
  }
  for (const [seriesId, item] of Object.entries(state.series ?? {})) {
    if (typeof item.slug !== 'string' || !item.slug) continue;
    puts.push({
      key: `series-alias:${state.id}:${item.slug}`,
      value: { recordType: 'seriesAlias', profileId: state.id, seriesId, slug: item.slug, version: 1 },
    });
  }
  const result = await store.transact({
    checks: puts.map(({ key }) => ({ key, version: null })),
    puts,
  });
  if (!result) throw new Error(`creator state fixture already exists: ${state.id}`);
}

async function insert(store, key, value) {
  const result = await store.transact({ checks: [{ key, version: null }], puts: [{ key, value }] });
  if (!result) throw new Error(`creator fixture record already exists: ${key}`);
}

export function creatorRequest(harness, path, options = {}) {
  const {
    session = 'creator-a',
    method = 'GET',
    body,
    origin = SITE_ORIGIN,
    creatorContract,
    extraHeaders = {},
  } = options;
  const headers = { ...extraHeaders };
  // Current mutating requests use the writer contract. Owner reads have one
  // current response shape and do not negotiate a contract through a header.
  // Explicit null or undefined still lets callers exercise missing-header/admin
  // paths.
  const requestedContract = Object.hasOwn(options, 'creatorContract')
    ? creatorContract
    : method === 'GET' ? undefined : CREATOR_CONTRACT_VERSION;
  if (requestedContract !== null && requestedContract !== undefined) {
    headers['X-Creator-Contract'] = String(requestedContract);
  }
  return callApi(harness, path, {
    session,
    csrf: sessionCsrf[session],
    origin,
    method,
    ...(body === undefined ? {} : { body }),
    extraHeaders: headers,
  });
}

export async function readCreatorSnapshot(harness, options = {}) {
  const response = await creatorRequest(harness, '/api/creador/perfil/', { ...options, method: 'GET' });
  if (!response.ok) throw new Error(`owner snapshot failed: HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

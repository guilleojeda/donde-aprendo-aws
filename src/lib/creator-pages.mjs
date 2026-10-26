import { createHash } from 'node:crypto';
import { projectPublicRecord, validateCatalogUrl } from './catalog.mjs';
import { currentUrlKey } from './catalog-url.mjs';

const PROGRAMS = new Set(['User Group Leaders', 'Community Builders', 'Heroes']);
const SOCIALS = new Set(['instagram', 'x', 'linkedin', 'awsBuilder', 'website']);
const PROTECTED_PROFILE_FIELDS = new Set([
  'accountId', 'email', 'isAdmin', 'published', 'hidden', 'directoryApproval',
  'directoryControl', 'editorProfileId', 'photo', 'ownerAccountId',
]);
const PROTECTED_PLACEMENT_FIELDS = new Set(['published', 'directoryApproval', 'directoryControl', 'editorProfileId', 'accountId', 'isAdmin']);
const ADMIN_RESOURCE_FIELDS = new Set(['category', 'kind', 'format', 'topics']);
const MAX_REQUEST_BODY_BYTES = 32 * 1024;
const MAX_DYNAMODB_ITEM_BYTES = 400 * 1024;
const TEXT_FIELD_LIMITS = new Map([
  ['displayName', 120],
  ['name', 120],
  ['city', 100],
  ['country', 100],
  ['bio', 2000],
  ['title', 200],
  ['url', 2048],
  ['description', 2000],
  ['sourceId', 2000],
  ['evidence', 2000],
]);
const SOCIAL_FIELD_LIMIT = 500;
const FALLBACK_RESOURCE_READ_CONCURRENCY = 20;

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message) {
  throw new ApiError(status, code, message);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function currentResourceUrl(resource) {
  return resource.recordType === 'event' ? resource.registrationUrl : resource.url;
}

function isCatalogResource(resource) {
  return isRecord(resource) && typeof resource.id === 'string' && !resource.id.startsWith('__')
    && (resource.recordType === undefined || resource.recordType === 'event');
}

function placementId(profileId, resourceId) {
  return `placement-${hash(JSON.stringify([profileId, resourceId]))}`;
}

function approvalState(resource) {
  if (resource.approvalRevoked === true) return 'revoked';
  if (resource.published === true) return 'approved';
  if (resource.published === false || !Object.hasOwn(resource, 'published')) return 'pending';
  fail(503, 'INVALID_RESOURCE', 'resource publication state is malformed');
}

function validVersion(value, { optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) fail(400, 'INVALID_VERSION', 'version must be a non-negative integer');
  return value;
}

function requiredModerationVersion(body) {
  assertKnownFields(body, new Set());
  if (!Number.isSafeInteger(body.version) || body.version < 0) {
    fail(422, 'INVALID_VERSION', 'version must be a non-negative integer');
  }
  return body.version;
}

function versionChange(entity, id, before, after) {
  if (before === after) return null;
  return { entity, id, before, after };
}

function versionChanges(...changes) {
  return changes.filter(Boolean);
}

function normalizeSlug(value) {
  if (typeof value !== 'string') fail(422, 'INVALID_SLUG', 'slug is required');
  const slug = value.trim();
  if (slug.length < 3 || slug.length > 40 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail(422, 'INVALID_SLUG', 'slug must use 3 to 40 lowercase ASCII letters, numbers, and single hyphens');
  }
  return slug;
}

function textField(value, name, { optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string') fail(422, 'INVALID_FIELD', `${name} must be text`);
  const limit = name.startsWith('socials.') ? SOCIAL_FIELD_LIMIT : TEXT_FIELD_LIMITS.get(name);
  if (limit !== undefined && value.length > limit) fail(422, 'FIELD_TOO_LONG', `${name} must be at most ${limit} characters`);
  return value.trim();
}

function validateTextLengths(value, path = '') {
  if (typeof value === 'string') {
    const field = path.split('.').at(-1);
    const limit = path.startsWith('socials.') ? SOCIAL_FIELD_LIMIT : TEXT_FIELD_LIMITS.get(field);
    if (limit !== undefined && value.length > limit) {
      fail(422, 'FIELD_TOO_LONG', `${path || field} must be at most ${limit} characters`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) validateTextLengths(item, path);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    validateTextLengths(item, path ? `${path}.${key}` : key);
  }
}

function validateProfileFields(body, previous) {
  for (const field of PROTECTED_PROFILE_FIELDS) {
    if (Object.hasOwn(body, field)) fail(400, 'FORBIDDEN_FIELD', `${field} is managed by the service`);
  }
  const next = { ...previous };
  if (Object.hasOwn(body, 'displayName')) next.displayName = textField(body.displayName, 'displayName');
  else if (!previous) next.displayName = '';
  if (Object.hasOwn(body, 'slug')) {
    if (typeof body.slug !== 'string') fail(422, 'INVALID_SLUG', 'slug is required');
    const rawSlug = body.slug.trim();
    next.slug = rawSlug ? normalizeSlug(rawSlug) : '';
  }
  else if (!previous) fail(422, 'INVALID_SLUG', 'slug is required');

  for (const field of ['city', 'country', 'bio']) {
    if (Object.hasOwn(body, field)) next[field] = textField(body[field], field);
    else if (!previous) {
      if (field === 'bio') next[field] = '';
    }
  }
  if (Object.hasOwn(body, 'programs')) {
    if (!Array.isArray(body.programs) || body.programs.some((program) => typeof program !== 'string' || !PROGRAMS.has(program))) {
      fail(422, 'INVALID_PROGRAMS', 'programs contains an unsupported value');
    }
    next.programs = [...new Set(body.programs)];
  } else if (!previous) next.programs = [];

  if (Object.hasOwn(body, 'socials')) {
    if (!isRecord(body.socials)) fail(422, 'INVALID_SOCIALS', 'socials must be an object');
    const socials = {};
    for (const [key, value] of Object.entries(body.socials)) {
      if (!SOCIALS.has(key)) fail(422, 'INVALID_SOCIALS', `unsupported social field: ${key}`);
      const url = textField(value, `socials.${key}`);
      if (url) {
        try {
          validateCatalogUrl(url);
        } catch {
          fail(422, 'INVALID_SOCIAL_URL', `socials.${key} must be a safe HTTP or HTTPS URL without credentials`);
        }
      }
      socials[key] = url;
    }
    next.socials = socials;
  } else if (!previous) next.socials = {};
  return next;
}

function validateResourceUrl(url) {
  try {
    return validateCatalogUrl(url);
  } catch {
    fail(422, 'INVALID_URL', 'url must be a safe HTTP or HTTPS URL without credentials');
  }
}

function cleanPublicProfile(profile) {
  if (typeof profile.id !== 'string' || !profile.id || typeof profile.displayName !== 'string'
    || profile.displayName.length > TEXT_FIELD_LIMITS.get('displayName')
    || typeof profile.slug !== 'string' || profile.slug.length > 40
    || !Number.isSafeInteger(profile.version) || profile.version < 0
    || typeof profile.published !== 'boolean' || typeof profile.hidden !== 'boolean') {
    fail(503, 'INVALID_PROFILE', 'profile data is malformed');
  }

  const optionalText = {};
  for (const field of ['city', 'country', 'bio']) {
    if (!Object.hasOwn(profile, field)) continue;
    const value = profile[field];
    if (typeof value !== 'string' || value.length > TEXT_FIELD_LIMITS.get(field)) {
      fail(503, 'INVALID_PROFILE', 'profile data is malformed');
    }
    optionalText[field] = value;
  }

  let programs = [];
  if (Object.hasOwn(profile, 'programs')) {
    if (!Array.isArray(profile.programs) || profile.programs.some((program) => typeof program !== 'string' || !PROGRAMS.has(program))) {
      fail(503, 'INVALID_PROFILE', 'profile data is malformed');
    }
    programs = [...profile.programs];
  }

  let socials = {};
  if (Object.hasOwn(profile, 'socials')) {
    if (!isRecord(profile.socials)) fail(503, 'INVALID_PROFILE', 'profile data is malformed');
    socials = {};
    for (const [key, url] of Object.entries(profile.socials)) {
      if (!SOCIALS.has(key) || typeof url !== 'string' || url.length > SOCIAL_FIELD_LIMIT) {
        fail(503, 'INVALID_PROFILE', 'profile data is malformed');
      }
      if (url) {
        try {
          validateCatalogUrl(url);
        } catch {
          fail(503, 'INVALID_PROFILE', 'profile data is malformed');
        }
      }
      socials[key] = url;
    }
  }

  let photo;
  if (Object.hasOwn(profile, 'photo')) {
    const storedPhoto = profile.photo;
    const validVersion = (typeof storedPhoto?.version === 'string'
      && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(storedPhoto.version))
      || (Number.isSafeInteger(storedPhoto?.version) && storedPhoto.version >= 0);
    if (!isRecord(storedPhoto) || !validVersion) fail(503, 'INVALID_PROFILE', 'profile data is malformed');
    photo = { version: storedPhoto.version };
    if (Object.hasOwn(storedPhoto, 'url')) {
      const url = storedPhoto.url;
      if (typeof url !== 'string' || url !== `/media/fotos/${profile.id}/${String(storedPhoto.version)}.webp`) {
        fail(503, 'INVALID_PROFILE', 'profile data is malformed');
      }
      photo.url = url;
    }
  }

  const result = {
    id: profile.id,
    displayName: profile.displayName,
    slug: profile.slug,
    ...optionalText,
    programs,
    socials,
    ...(photo ? { photo } : {}),
    published: profile.published === true,
    hidden: profile.hidden === true,
    version: profile.version,
  };
  return result;
}

function publicLink(placement, resource, { includeModerationState = false } = {}) {
  const url = currentResourceUrl(resource);
  if (Object.hasOwn(resource, 'description') && typeof resource.description !== 'string') {
    fail(503, 'INVALID_LINK', 'link description is malformed');
  }
  if (includeModerationState && Object.hasOwn(resource, 'hidden') && typeof resource.hidden !== 'boolean') {
    fail(503, 'INVALID_LINK', 'link moderation state is malformed');
  }
  if (typeof resource.id !== 'string' || typeof resource.title !== 'string' || typeof url !== 'string'
    || typeof placement.position !== 'number' || !Number.isSafeInteger(placement.position)
    || typeof placement.featured !== 'boolean' || typeof placement.selectedForDirectory !== 'boolean'
    || !Number.isSafeInteger(resource.version ?? 0) || (resource.version ?? 0) < 0
    || !Number.isSafeInteger(placement.version ?? 0) || (placement.version ?? 0) < 0) {
    fail(503, 'INVALID_LINK', 'link data is malformed');
  }
  try {
    validateCatalogUrl(url);
  } catch {
    fail(503, 'INVALID_LINK', 'resource URL is malformed');
  }
  return {
    placementId: placement.id,
    resourceId: resource.id,
    title: resource.title,
    url,
    ...(typeof resource.description === 'string' ? { description: resource.description } : {}),
    featured: placement.featured,
    position: placement.position,
    selectedForDirectory: placement.selectedForDirectory,
    ...(includeModerationState ? { hidden: resource.hidden === true } : {}),
    series: [],
    directoryApproval: approvalState(resource),
    resourceVersion: resource.version ?? 0,
    placementVersion: placement.version ?? 0,
  };
}

function dynamoDbValueSize(value, name = '') {
  if (value === undefined) return 0;
  if (value instanceof Uint8Array) fail(503, 'INVALID_PLACEMENT', 'placement contains an unsupported stored value');
  const attributeNameSize = Buffer.byteLength(name, 'utf8');
  if (typeof value === 'string') return attributeNameSize + Buffer.byteLength(value, 'utf8');
  if (typeof value === 'number' && Number.isFinite(value)) {
    const coefficient = String(value).toLowerCase().split('e')[0];
    const significantDigits = coefficient.replace(/[^0-9]/g, '').replace(/^0+/, '').replace(/0+$/, '').length || 1;
    return attributeNameSize + 1 + Math.ceil(significantDigits / 2);
  }
  if (typeof value === 'boolean' || value === null) return attributeNameSize + 1;
  if (Array.isArray(value)) {
    return attributeNameSize + 3 + value.filter((item) => item !== undefined)
      .reduce((total, item) => total + 1 + dynamoDbValueSize(item), 0);
  }
  if (isRecord(value)) {
    return attributeNameSize + 3 + Object.entries(value).filter(([, item]) => item !== undefined).reduce(
      (total, [key, item]) => total + 1 + dynamoDbValueSize(item, key), 0,
    );
  }
  fail(503, 'INVALID_PLACEMENT', 'placement contains an unsupported stored value');
}

function dynamoDbItemSize(item) {
  return Object.entries(item).filter(([, value]) => value !== undefined)
    .reduce((total, [name, value]) => total + dynamoDbValueSize(value, name), 0);
}

function assertPlacementFits(profileId, placement) {
  const item = {
    ...placement,
    pk: `PROFILE#${profileId}`,
    sk: `PLACEMENT#${placement.id}`,
  };
  if (dynamoDbItemSize(item) > MAX_DYNAMODB_ITEM_BYTES) {
    fail(422, 'PLACEMENT_TOO_LARGE', 'series membership would exceed DynamoDB’s 400 KiB item limit');
  }
}

function sortLinks(links) {
  return links.sort((left, right) => Number(right.featured) - Number(left.featured)
    || left.position - right.position || left.placementId.localeCompare(right.placementId));
}

function jsonResponse(value, status = 200) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  });
  return new Response(value === null ? null : JSON.stringify(value), { status, headers });
}

function writeJsonResponse(value, status = 200) {
  const { versionChanges: changes = [], ...payload } = value;
  return jsonResponse({ ...payload, versionChanges: changes }, status);
}

function writeEmptyResponse(changes = []) {
  const headers = new Headers({
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'Creator-Write-Versions': JSON.stringify(changes),
  });
  return new Response(null, { status: 204, headers });
}

async function parseRequestBody(request) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    fail(413, 'BODY_TOO_LARGE', 'request body exceeds the 32 KiB limit');
  }
  if (!request.body) fail(400, 'INVALID_JSON', 'request body must be valid JSON');

  const reader = request.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        fail(413, 'BODY_TOO_LARGE', 'request body exceeds the 32 KiB limit');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    fail(400, 'INVALID_JSON', 'request body must be valid JSON');
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail(400, 'INVALID_JSON', 'request body must be valid JSON');
  }
  if (!isRecord(body)) fail(400, 'INVALID_BODY', 'request body must be a JSON object');
  validateTextLengths(body);
  return body;
}

function decodeSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    fail(400, 'INVALID_PATH', 'path contains invalid encoding');
  }
}

function assertKnownFields(body, allowed, protectedFields = new Set()) {
  for (const field of Object.keys(body)) {
    if (protectedFields.has(field)) fail(400, 'FORBIDDEN_FIELD', `${field} is managed by the service`);
    if (!allowed.has(field) && field !== 'version') fail(400, 'UNKNOWN_FIELD', `unsupported field: ${field}`);
  }
}

function cleanAdminResource(resource) {
  return {
    id: resource.id,
    ...(resource.recordType === 'event' ? { recordType: 'event' } : {}),
    title: resource.title,
    url: currentResourceUrl(resource),
    ...(typeof resource.description === 'string' ? { description: resource.description } : {}),
    version: resource.version ?? 0,
    published: resource.published === true,
    directoryApproval: approvalState(resource),
    directoryControl: resource.directoryControl ?? 'editorial',
    hidden: resource.hidden === true,
    ...(typeof resource.editorProfileId === 'string' ? { editorProfileId: resource.editorProfileId } : {}),
    ...(resource.category !== undefined ? { category: resource.category } : {}),
    ...(resource.kind !== undefined ? { kind: resource.kind } : {}),
    ...(resource.format !== undefined ? { format: resource.format } : {}),
    ...(resource.topics !== undefined ? { topics: resource.topics } : {}),
    ...(resource.sourceId !== undefined ? { sourceId: resource.sourceId } : {}),
  };
}

export function createCreatorPagesService({ store, authenticate, origin, now = Date.now, createId, statistics } = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.list !== 'function' || typeof store.transact !== 'function') {
    throw new TypeError('store must implement get, list, and transact');
  }
  if (typeof authenticate !== 'function') throw new TypeError('authenticate must be a function');
  if (typeof origin !== 'string' || !origin) throw new TypeError('origin is required');
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  if (typeof createId !== 'function') throw new TypeError('createId must be a function');

  const accountKey = (accountId) => `account-profile:${accountId}`;
  const profileKey = (profileId) => `profile:${profileId}`;
  const aliasKey = (slug) => `alias:${slug}`;
  const seriesKey = (profileId, id) => `series:${profileId}:${id}`;
  const seriesAliasKey = (profileId, slug) => `series-alias:${profileId}:${slug}`;
  const placementKey = (profileId, id) => `placement:${profileId}:${id}`;
  const editorKey = (profileId, resourceId) => `editor:${profileId}:${resourceId}`;
  const claimKey = (id) => `claim:${id}`;
  const claimRefKey = (profileId, claimId) => `claim-ref:${profileId}:${claimId}`;

  function timestamp() {
    const result = now();
    if (!Number.isSafeInteger(result) || result < 0) throw new TypeError('now must return a non-negative millisecond timestamp');
    return result;
  }

  function newId() {
    const result = createId();
    if (typeof result !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(result)) throw new TypeError('createId must return an opaque identifier');
    return result;
  }

  async function getPrincipal(request) {
    let principal;
    try {
      principal = await authenticate(request);
    } catch {
      fail(503, 'AUTH_UNAVAILABLE', 'authentication is temporarily unavailable');
    }
    if (!isRecord(principal)) fail(503, 'AUTH_UNAVAILABLE', 'authentication returned an invalid principal');
    if (principal.state === 'anonymous') fail(401, 'AUTH_REQUIRED', 'sign in is required');
    if (principal.state === 'disabled') fail(403, 'ACCOUNT_DISABLED', 'this account is disabled');
    if (principal.state === 'unavailable') fail(503, 'AUTH_UNAVAILABLE', 'authentication is temporarily unavailable');
    if (principal.state !== 'authenticated' || typeof principal.accountId !== 'string' || !principal.accountId
      || typeof principal.csrfToken !== 'string' || typeof principal.isAdmin !== 'boolean') {
      fail(503, 'AUTH_UNAVAILABLE', 'authentication returned an invalid principal');
    }
    return principal;
  }

  function requireAdmin(principal) {
    if (principal.isAdmin !== true) fail(403, 'ADMIN_REQUIRED', 'administrator access is required');
  }

  function requireWriteRequest(request, principal) {
    if (request.headers.get('origin') !== origin || request.headers.get('x-csrf-token') !== principal.csrfToken) {
      fail(403, 'CSRF_REJECTED', 'request origin or CSRF token is invalid');
    }
  }

  function requireMethod(request, method) {
    if (request.method !== method) fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
  }

  async function ownerProfile(principal) {
    const owner = await store.get(accountKey(principal.accountId));
    if (!owner) return { owner: null, profile: null };
    if (typeof owner.profileId !== 'string' || !owner.profileId) fail(503, 'INVALID_OWNER', 'profile ownership mapping is malformed');
    const profile = await store.get(profileKey(owner.profileId));
    if (!profile || profile.id !== owner.profileId) fail(503, 'INVALID_PROFILE', 'profile ownership mapping points to missing data');
    return { owner, profile };
  }

  async function getRequiredOwnerProfile(principal) {
    const result = await ownerProfile(principal);
    if (!result.profile) fail(404, 'PROFILE_NOT_FOUND', 'profile does not exist');
    return result.profile;
  }

  async function getPlacements(profileId) {
    const rows = await store.list(`placement:${profileId}:`);
    const placements = [];
    for (const row of rows) {
      if (!row || !row.value || typeof row.key !== 'string') fail(503, 'INVALID_PLACEMENT', 'placement list is malformed');
      const placement = row.value;
      if (placement.recordType !== 'placement' || placement.profileId !== profileId || typeof placement.id !== 'string' || row.key !== placementKey(profileId, placement.id)) {
        fail(503, 'INVALID_PLACEMENT', 'placement list contains an unrelated row');
      }
      placements.push(placement);
    }
    return placements;
  }

  function cleanSeries(record, profileId, expectedId) {
    if (!record || record.recordType !== 'series' || record.profileId !== profileId
      || typeof record.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(record.id)
      || (expectedId !== undefined && record.id !== expectedId)
      || typeof record.name !== 'string' || !record.name.trim() || record.name !== record.name.trim()
      || record.name.length > 120 || typeof record.slug !== 'string'
      || !Number.isSafeInteger(record.version) || record.version < 1) {
      fail(503, 'INVALID_SERIES', 'series metadata is malformed');
    }
    try {
      if (normalizeSlug(record.slug) !== record.slug) throw new Error('non-canonical slug');
    } catch {
      fail(503, 'INVALID_SERIES', 'series metadata is malformed');
    }
    if (Object.hasOwn(record, 'description')
      && (typeof record.description !== 'string' || record.description !== record.description.trim() || record.description.length > 2000)) {
      fail(503, 'INVALID_SERIES', 'series metadata is malformed');
    }
    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      ...(record.description !== undefined ? { description: record.description } : {}),
      version: record.version,
    };
  }

  function validateSeriesAlias(alias, profileId, slug) {
    if (!alias || alias.recordType !== 'seriesAlias' || alias.profileId !== profileId
      || alias.slug !== slug || typeof alias.seriesId !== 'string'
      || !/^[A-Za-z0-9_-]{1,128}$/.test(alias.seriesId)
      || !Number.isSafeInteger(alias.version) || alias.version < 1) {
      fail(503, 'INVALID_SERIES_ALIAS', 'series alias is malformed');
    }
    return alias;
  }

  async function getSeries(profileId, id) {
    const record = await store.get(seriesKey(profileId, id));
    return record ? cleanSeries(record, profileId, id) : null;
  }

  async function seriesForProfile(profileId) {
    const rows = await store.list(`series:${profileId}:`);
    const series = [];
    for (const row of rows) {
      if (!row || typeof row.key !== 'string' || !row.value
        || !row.key.startsWith(`series:${profileId}:`)) {
        fail(503, 'INVALID_SERIES_LIST', 'series list is malformed');
      }
      const id = row.key.slice(`series:${profileId}:`.length);
      if (!id || row.key !== seriesKey(profileId, id)) fail(503, 'INVALID_SERIES_LIST', 'series list contains an unrelated row');
      series.push(cleanSeries(row.value, profileId, id));
    }
    series.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
    return series;
  }

  function placementSeriesMap(placement, currentSeriesIds) {
    if (!Object.hasOwn(placement, 'series')) return {};
    if (!isRecord(placement.series)) fail(503, 'INVALID_PLACEMENT', 'series membership map is malformed');
    const result = {};
    for (const [id, membership] of Object.entries(placement.series)) {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) fail(503, 'INVALID_PLACEMENT', 'series membership ID is malformed');
      // References left behind by a deleted series are inert and are removed on
      // the next save to this placement.
      if (!currentSeriesIds.has(id)) continue;
      if (!isRecord(membership) || Object.keys(membership).length !== 1
        || !Number.isSafeInteger(membership.position) || membership.position < 0) {
        fail(503, 'INVALID_PLACEMENT', 'series membership is malformed');
      }
      result[id] = { position: membership.position };
    }
    return result;
  }

  async function resourcesById(ids) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return new Map();

    let resources;
    if (typeof store.getResources === 'function') {
      resources = await store.getResources(uniqueIds);
      if (!(resources instanceof Map) || resources.size !== uniqueIds.length) {
        fail(503, 'INVALID_RESOURCE_BATCH', 'resource batch read returned an incomplete result');
      }
    } else {
      // Acceptance stores expose only get/list/transact. Keep their compatibility
      // path bounded; production uses the store's strongly consistent BatchGet.
      resources = new Map();
      for (let offset = 0; offset < uniqueIds.length; offset += FALLBACK_RESOURCE_READ_CONCURRENCY) {
        const batch = uniqueIds.slice(offset, offset + FALLBACK_RESOURCE_READ_CONCURRENCY);
        const values = await Promise.all(batch.map(async (id) => [id, await store.get(`resource:${id}`)]));
        for (const [id, resource] of values) {
          if (!resource) fail(503, 'MISSING_RESOURCE', 'a referenced resource is missing');
          resources.set(id, resource);
        }
      }
    }

    for (const id of uniqueIds) {
      const resource = resources.get(id);
      if (!resource || resource.id !== id) fail(503, 'MISSING_RESOURCE', 'a referenced resource is missing or malformed');
      if (!isCatalogResource(resource)) fail(503, 'INVALID_RESOURCE', 'a referenced catalog row is not a resource');
    }
    return resources;
  }

  async function profileLinks(profileId, { includeHiddenResources = false, series = undefined, publicTags = false, profileSlug = '' } = {}) {
    const currentSeries = series ?? await seriesForProfile(profileId);
    const seriesById = new Map(currentSeries.map((item) => [item.id, item]));
    const currentSeriesIds = new Set(seriesById.keys());
    const placements = await getPlacements(profileId);
    const resourceIds = [];
    for (const placement of placements) {
      if (typeof placement.resourceId !== 'string') fail(503, 'INVALID_PLACEMENT', 'placement resource ID is invalid');
      resourceIds.push(placement.resourceId);
    }
    const resources = await resourcesById(resourceIds);
    const links = [];
    for (const placement of placements) {
      const resource = resources.get(placement.resourceId);
      const memberships = placementSeriesMap(placement, currentSeriesIds);
      if (Object.hasOwn(resource, 'hidden') && typeof resource.hidden !== 'boolean') fail(503, 'INVALID_RESOURCE', 'resource hidden state is malformed');
      if (resource.hidden === true && !includeHiddenResources) continue;
      const link = publicLink(placement, resource, { includeModerationState: includeHiddenResources });
      link.series = Object.entries(memberships)
        .map(([seriesId, membership]) => {
          const item = seriesById.get(seriesId);
          if (!item) return null;
          return publicTags
            ? { seriesId, position: membership.position, name: item.name, href: `/c/${encodeURIComponent(profileSlug)}/series/${encodeURIComponent(item.slug)}/` }
            : { seriesId, position: membership.position };
        })
        .filter(Boolean)
        .sort((left, right) => left.position - right.position || left.seriesId.localeCompare(right.seriesId));
      links.push(link);
    }
    return sortLinks(links);
  }

  async function creatorEditor(principal) {
    const { profile } = await ownerProfile(principal);
    if (!profile) return { profile: null, links: [], editableResources: [], claims: [], series: [] };
    const series = await seriesForProfile(profile.id);
    const links = await profileLinks(profile.id, { includeHiddenResources: true, series });
    const editorRefs = await store.list(`editor:${profile.id}:`);
    const resourceIds = [];
    for (const row of editorRefs) {
      const reference = row.value;
      if (!reference || reference.profileId !== profile.id || typeof reference.resourceId !== 'string') fail(503, 'INVALID_EDITOR_REFERENCE', 'editor reference is malformed');
      resourceIds.push(reference.resourceId);
    }
    const resources = await resourcesById(resourceIds);
    const editableResources = [];
    for (const row of editorRefs) {
      const reference = row.value;
      const resource = resources.get(reference.resourceId);
      if (resource?.editorProfileId === profile.id) {
        editableResources.push({
          id: resource.id,
          title: resource.title,
          url: currentResourceUrl(resource),
          ...(typeof resource.description === 'string' ? { description: resource.description } : {}),
          version: resource.version ?? 0,
        });
      }
    }
    const claimRefs = await store.list(`claim-ref:${profile.id}:`);
    const claims = [];
    for (const row of claimRefs) {
      const reference = row.value;
      if (!reference || typeof reference.id !== 'string') fail(503, 'INVALID_CLAIM_REFERENCE', 'claim reference is malformed');
      const claim = await store.get(claimKey(reference.id));
      if (!claim) fail(503, 'MISSING_CLAIM', 'claim reference points to missing claim data');
      if (claim && claim.profileId === profile.id) {
        claims.push({
          id: claim.id,
          resourceIds: Array.isArray(claim.resourceIds) ? [...claim.resourceIds] : [],
          ...(typeof claim.sourceId === 'string' ? { sourceId: claim.sourceId } : {}),
          ...(typeof claim.status === 'string' ? { status: claim.status } : {}),
          ...(Number.isSafeInteger(claim.createdAt) ? { createdAt: claim.createdAt } : {}),
          ...(typeof claim.evidence === 'string' ? { evidence: claim.evidence } : {}),
        });
      }
    }
    return { profile: cleanPublicProfile(profile), links, editableResources, claims, series };
  }

  async function saveProfile(principal, body) {
    const { profile } = await ownerProfile(principal);
    const expectedVersion = validVersion(body.version, { optional: true });
    const fields = validateProfileFields(body, profile);
    if (!profile) {
      const id = newId();
      const created = {
        recordType: 'profile', id, ...fields, published: false, hidden: false, version: 1,
        createdAt: timestamp(), updatedAt: timestamp(),
      };
      const slugAlias = created.slug ? await store.get(aliasKey(created.slug)) : null;
      if (slugAlias) fail(409, 'SLUG_TAKEN', 'slug is already reserved');
      const checks = [
        { key: accountKey(principal.accountId), version: null },
        { key: profileKey(id), version: null },
      ];
      const puts = [
        { key: accountKey(principal.accountId), value: { recordType: 'accountProfile', profileId: id, version: 1 } },
        { key: profileKey(id), value: created },
      ];
      if (created.slug) {
        checks.push({ key: aliasKey(created.slug), version: null });
        puts.push({ key: aliasKey(created.slug), value: { recordType: 'profileAlias', slug: created.slug, profileId: id, version: 1 } });
      }
      const ok = await store.transact({
        checks,
        puts,
      });
      if (!ok) {
        const latestOwner = await store.get(accountKey(principal.accountId));
        if (latestOwner) fail(409, 'PROFILE_CONFLICT', 'profile changed; reload before saving');
        fail(409, 'PROFILE_CONFLICT', 'profile or slug changed while saving');
      }
      return {
        profile: cleanPublicProfile(created),
        versionChanges: versionChanges(versionChange('profile', id, 0, created.version)),
      };
    }

    if (expectedVersion === undefined || expectedVersion !== profile.version) fail(409, 'PROFILE_CONFLICT', 'profile changed; reload before saving');
    if (profile.published === true && (!fields.displayName.trim() || !fields.slug)) {
      fail(422, 'PROFILE_INCOMPLETE', 'a published profile must keep its display name and URL name');
    }
    const profileFields = ['displayName', 'slug', 'city', 'country', 'bio', 'programs', 'socials'];
    if (profileFields.every((field) => JSON.stringify(fields[field]) === JSON.stringify(profile[field]))) {
      return { profile: cleanPublicProfile(profile), versionChanges: [] };
    }
    const slugChanged = fields.slug !== profile.slug;
    let aliasToCreate;
    if (slugChanged && fields.slug) {
      const alias = await store.get(aliasKey(fields.slug));
      if (alias && alias.profileId !== profile.id) fail(409, 'SLUG_TAKEN', 'slug is already reserved');
      if (!alias) aliasToCreate = { recordType: 'profileAlias', slug: fields.slug, profileId: profile.id, version: 1 };
    }
    const updated = { ...profile, ...fields, version: profile.version + 1, updatedAt: timestamp() };
    const checks = [{ key: profileKey(profile.id), version: profile.version }];
    const puts = [{ key: profileKey(profile.id), value: updated }];
    if (aliasToCreate) {
      checks.push({ key: aliasKey(fields.slug), version: null });
      puts.push({ key: aliasKey(fields.slug), value: aliasToCreate });
    }
    if (!await store.transact({ checks, puts })) fail(409, 'PROFILE_CONFLICT', 'profile or slug changed while saving');
    return {
      profile: cleanPublicProfile(updated),
      versionChanges: versionChanges(versionChange('profile', profile.id, profile.version, updated.version)),
    };
  }

  function requireCurrentProfileVersion(body, profile) {
    const expectedVersion = validVersion(body.profileVersion);
    if (expectedVersion !== profile.version) fail(409, 'PROFILE_CONFLICT', 'profile changed; reload before saving');
    return expectedVersion;
  }

  async function listCreatorSeries(principal) {
    const profile = await getRequiredOwnerProfile(principal);
    const series = await seriesForProfile(profile.id);
    return { series, profileVersion: profile.version };
  }

  async function readSeriesAlias(profileId, slug) {
    const alias = await store.get(seriesAliasKey(profileId, slug));
    return alias ? validateSeriesAlias(alias, profileId, slug) : null;
  }

  function validateSeriesInput(body, previous = {}) {
    const next = { ...previous };
    if (Object.hasOwn(body, 'name')) {
      next.name = textField(body.name, 'name');
      if (!next.name) fail(422, 'INVALID_NAME', 'name is required');
    } else if (!previous.name) {
      fail(422, 'INVALID_NAME', 'name is required');
    }
    if (Object.hasOwn(body, 'slug')) next.slug = normalizeSlug(body.slug);
    else if (!previous.slug) fail(422, 'INVALID_SLUG', 'slug is required');
    if (Object.hasOwn(body, 'description')) next.description = textField(body.description, 'description');
    return next;
  }

  async function createCreatorSeries(principal, body) {
    assertKnownFields(body, new Set(['name', 'slug', 'description', 'profileVersion']));
    const profile = await getRequiredOwnerProfile(principal);
    requireCurrentProfileVersion(body, profile);
    const fields = validateSeriesInput(body);
    const alias = await readSeriesAlias(profile.id, fields.slug);
    if (alias) fail(409, 'SERIES_SLUG_TAKEN', 'series slug is already reserved');

    const id = newId();
    const created = {
      recordType: 'series', id, profileId: profile.id, name: fields.name, slug: fields.slug,
      ...(fields.description !== undefined ? { description: fields.description } : {}),
      version: 1, createdAt: timestamp(), updatedAt: timestamp(),
    };
    const reserved = { recordType: 'seriesAlias', seriesId: id, profileId: profile.id, slug: fields.slug, version: 1 };
    const updatedProfile = { ...profile, version: profile.version + 1, updatedAt: timestamp() };
    const ok = await store.transact({
      checks: [
        { key: profileKey(profile.id), version: profile.version },
        { key: seriesKey(profile.id, id), version: null },
        { key: seriesAliasKey(profile.id, fields.slug), version: null },
      ],
      puts: [
        { key: seriesKey(profile.id, id), value: created },
        { key: seriesAliasKey(profile.id, fields.slug), value: reserved },
        { key: profileKey(profile.id), value: updatedProfile },
      ],
    });
    if (!ok) fail(409, 'SERIES_CONFLICT', 'profile or series slug changed while saving');
    return {
      series: cleanSeries(created, profile.id, id),
      profileVersion: updatedProfile.version,
      versionChanges: versionChanges(
        versionChange('profile', profile.id, profile.version, updatedProfile.version),
        versionChange('series', id, 0, created.version),
      ),
    };
  }

  async function patchCreatorSeries(principal, id, body) {
    assertKnownFields(body, new Set(['name', 'slug', 'description', 'profileVersion']));
    const profile = await getRequiredOwnerProfile(principal);
    requireCurrentProfileVersion(body, profile);
    const expectedSeriesVersion = validVersion(body.version);
    const stored = await store.get(seriesKey(profile.id, id));
    if (!stored || stored.profileId !== profile.id || stored.id !== id) fail(404, 'SERIES_NOT_FOUND', 'series does not belong to this profile');
    const current = cleanSeries(stored, profile.id, id);
    if (expectedSeriesVersion !== current.version) fail(409, 'SERIES_CONFLICT', 'series changed; reload before saving');
    if (!['name', 'slug', 'description'].some((field) => Object.hasOwn(body, field))) {
      fail(422, 'EMPTY_UPDATE', 'series metadata fields are required');
    }
    const fields = validateSeriesInput(body, current);
    if (['name', 'slug', 'description'].every((field) => fields[field] === current[field])) {
      return { series: current, profileVersion: profile.version, versionChanges: [] };
    }
    const slugChanged = fields.slug !== current.slug;
    const checks = [
      { key: profileKey(profile.id), version: profile.version },
      { key: seriesKey(profile.id, id), version: current.version },
    ];
    const puts = [];
    if (slugChanged) {
      const alias = await readSeriesAlias(profile.id, fields.slug);
      if (alias && alias.seriesId !== id) fail(409, 'SERIES_SLUG_TAKEN', 'series slug is already reserved');
      if (!alias) {
        checks.push({ key: seriesAliasKey(profile.id, fields.slug), version: null });
        puts.push({ key: seriesAliasKey(profile.id, fields.slug), value: { recordType: 'seriesAlias', seriesId: id, profileId: profile.id, slug: fields.slug, version: 1 } });
      }
    }
    const updated = {
      ...stored,
      name: fields.name,
      slug: fields.slug,
      ...(fields.description !== undefined ? { description: fields.description } : {}),
      version: current.version + 1,
      updatedAt: timestamp(),
    };
    if (fields.description === undefined) delete updated.description;
    const updatedProfile = { ...profile, version: profile.version + 1, updatedAt: timestamp() };
    puts.push({ key: seriesKey(profile.id, id), value: updated }, { key: profileKey(profile.id), value: updatedProfile });
    if (!await store.transact({ checks, puts })) fail(409, 'SERIES_CONFLICT', 'profile or series changed while saving');
    return {
      series: cleanSeries(updated, profile.id, id),
      profileVersion: updatedProfile.version,
      versionChanges: versionChanges(
        versionChange('profile', profile.id, profile.version, updatedProfile.version),
        versionChange('series', id, current.version, updated.version),
      ),
    };
  }

  async function deleteCreatorSeries(principal, id, body) {
    assertKnownFields(body, new Set(['profileVersion']));
    const profile = await getRequiredOwnerProfile(principal);
    requireCurrentProfileVersion(body, profile);
    const expectedSeriesVersion = validVersion(body.version);
    const stored = await store.get(seriesKey(profile.id, id));
    if (!stored || stored.profileId !== profile.id || stored.id !== id) fail(404, 'SERIES_NOT_FOUND', 'series does not belong to this profile');
    const series = cleanSeries(stored, profile.id, id);
    if (expectedSeriesVersion !== series.version) fail(409, 'SERIES_CONFLICT', 'series changed; reload before saving');
    const updatedProfile = { ...profile, version: profile.version + 1, updatedAt: timestamp() };
    if (!await store.transact({
      checks: [{ key: profileKey(profile.id), version: profile.version }, { key: seriesKey(profile.id, id), version: series.version }],
      puts: [{ key: profileKey(profile.id), value: updatedProfile }],
      deletes: [seriesKey(profile.id, id)],
    })) fail(409, 'SERIES_CONFLICT', 'profile or series changed while deleting');
    return versionChanges(versionChange('profile', profile.id, profile.version, updatedProfile.version));
  }

  async function changeSeriesChapter(principal, seriesId, placementId, body, operation) {
    const allowed = operation === 'move' ? new Set(['profileVersion', 'direction']) : new Set(['profileVersion']);
    assertKnownFields(body, allowed);
    if (Object.hasOwn(body, 'version')) fail(400, 'UNKNOWN_FIELD', 'unsupported field: version');
    const profile = await getRequiredOwnerProfile(principal);
    requireCurrentProfileVersion(body, profile);
    const series = await getSeries(profile.id, seriesId);
    if (!series) fail(404, 'SERIES_NOT_FOUND', 'series does not belong to this profile');
    if (operation === 'move' && body.direction !== 'up' && body.direction !== 'down') {
      fail(422, 'INVALID_DIRECTION', 'direction must be up or down');
    }
    const key = placementKey(profile.id, placementId);
    const placement = await store.get(key);
    if (!placement || placement.recordType !== 'placement' || placement.id !== placementId || placement.profileId !== profile.id) {
      fail(404, 'PLACEMENT_NOT_FOUND', 'placement does not belong to this profile');
    }
    const allSeries = await seriesForProfile(profile.id);
    const seriesById = new Map(allSeries.map((item) => [item.id, item]));
    const activeIds = new Set(seriesById.keys());
    const currentMap = placementSeriesMap(placement, activeIds);
    const hadStaleReferences = isRecord(placement.series) && Object.keys(placement.series).some((id) => !activeIds.has(id));
    const hasMembership = Object.hasOwn(currentMap, seriesId);
    if (operation !== 'add' && !hasMembership) fail(404, 'SERIES_MEMBERSHIP_NOT_FOUND', 'placement is not in this series');

    const placements = await getPlacements(profile.id);
    const members = [];
    for (const candidate of placements) {
      const map = placementSeriesMap(candidate, activeIds);
      if (Object.hasOwn(map, seriesId)) members.push({ placement: candidate, map });
    }
    members.sort((left, right) => left.map[seriesId].position - right.map[seriesId].position
      || left.placement.id.localeCompare(right.placement.id));

    const updatedPlacements = new Map();
    const targetMap = currentMap;
    if (operation === 'add' && hasMembership) {
      if (!hadStaleReferences) return { status: 200 };
      updatedPlacements.set(placementId, { ...placement, series: targetMap });
    } else if (operation === 'add') {
      const maxPosition = members.reduce((maximum, member) => Math.max(maximum, member.map[seriesId].position), -10);
      if (maxPosition > Number.MAX_SAFE_INTEGER - 10) fail(503, 'INVALID_PLACEMENT', 'series chapter order is malformed');
      targetMap[seriesId] = { position: maxPosition + 10 };
      updatedPlacements.set(placementId, { ...placement, series: targetMap });
    } else if (operation === 'remove') {
      delete targetMap[seriesId];
      const updated = { ...placement };
      if (Object.keys(targetMap).length > 0) updated.series = targetMap;
      else delete updated.series;
      updatedPlacements.set(placementId, updated);
    } else if (operation === 'move') {
      const index = members.findIndex((member) => member.placement.id === placementId);
      const neighborIndex = index + (body.direction === 'up' ? -1 : 1);
      if (neighborIndex < 0 || neighborIndex >= members.length) {
        if (!hadStaleReferences) return { status: 200 };
        updatedPlacements.set(placementId, { ...placement, series: targetMap });
      } else {
        const target = members[index];
        const neighbor = members[neighborIndex];
        const targetOld = target.map[seriesId].position;
        const neighborOld = neighbor.map[seriesId].position;
        let targetNext = neighborOld;
        let neighborNext = targetOld;
        if (targetOld === neighborOld) {
          if (body.direction === 'up') {
            targetNext = Math.max(0, targetOld - 1);
            neighborNext = targetNext === targetOld ? targetOld + 1 : targetOld;
          } else {
            neighborNext = targetOld;
            targetNext = targetOld + 1;
          }
        }
        if (!Number.isSafeInteger(targetNext) || !Number.isSafeInteger(neighborNext) || targetNext < 0 || neighborNext < 0) {
          fail(503, 'INVALID_PLACEMENT', 'series chapter order is malformed');
        }
        const updatedTargetMap = target.map;
        const updatedNeighborMap = neighbor.map;
        updatedTargetMap[seriesId] = { position: targetNext };
        updatedNeighborMap[seriesId] = { position: neighborNext };
        updatedPlacements.set(target.placement.id, { ...target.placement, series: updatedTargetMap });
        updatedPlacements.set(neighbor.placement.id, { ...neighbor.placement, series: updatedNeighborMap });
      }
    }

    const nextVersion = profile.version + 1;
    const updatedProfile = { ...profile, version: nextVersion, updatedAt: timestamp() };
    const checks = [
      { key: profileKey(profile.id), version: profile.version },
      { key: seriesKey(profile.id, seriesId), version: series.version },
    ];
    const puts = [{ key: profileKey(profile.id), value: updatedProfile }];
    for (const [id, updated] of updatedPlacements) {
      updated.version = (updated.version ?? 0) + 1;
      assertPlacementFits(profile.id, updated);
      checks.push({ key: placementKey(profile.id, id), version: updated.version - 1 });
      puts.push({ key: placementKey(profile.id, id), value: updated });
    }
    if (!await store.transact({ checks, puts })) fail(409, 'SERIES_CONFLICT', 'profile, series, or chapter changed while saving');
    return {
      status: 200,
      versionChanges: versionChanges(
        versionChange('profile', profile.id, profile.version, updatedProfile.version),
        ...[...updatedPlacements.values()].map((updated) => versionChange('placement', updated.id, updated.version - 1, updated.version)),
      ),
    };
  }

  async function publishProfile(principal, body) {
    const profile = await getRequiredOwnerProfile(principal);
    const expectedVersion = validVersion(body.version, { optional: true });
    if (expectedVersion !== undefined && expectedVersion !== profile.version) fail(409, 'PROFILE_CONFLICT', 'profile changed; reload before publishing');
    if (typeof profile.displayName !== 'string' || !profile.displayName.trim()) fail(422, 'PROFILE_INCOMPLETE', 'display name is required before publication');
    normalizeSlug(profile.slug);
    if (profile.published === true) return { profile: cleanPublicProfile(profile), versionChanges: [] };
    const updated = { ...profile, published: true, version: profile.version + 1, updatedAt: timestamp() };
    const ok = await store.transact({ checks: [{ key: profileKey(profile.id), version: profile.version }], puts: [{ key: profileKey(profile.id), value: updated }] });
    if (!ok) fail(409, 'PROFILE_CONFLICT', 'profile changed while publishing');
    return {
      profile: cleanPublicProfile(updated),
      versionChanges: versionChanges(versionChange('profile', profile.id, profile.version, updated.version)),
    };
  }

  async function buildLinkDto(placement) {
    const resource = await store.get(`resource:${placement.resourceId}`);
    if (!resource || resource.id !== placement.resourceId) fail(503, 'MISSING_RESOURCE', 'placement points to missing resource data');
    if (!isCatalogResource(resource)) fail(503, 'INVALID_RESOURCE', 'placement points to a non-resource catalog row');
    return publicLink(placement, resource, { includeModerationState: true });
  }

  async function attachExistingResource(profile, resource, {
    selectedForDirectory = true,
    checks = [],
    returnExistingOnConflict = true,
  } = {}) {
    if (!isCatalogResource(resource)) fail(503, 'INVALID_RESOURCE', 'a catalog control row cannot be attached as a resource');
    const stableId = placementId(profile.id, resource.id);
    const existing = await store.get(placementKey(profile.id, stableId));
    if (existing) {
      if (existing.id !== stableId || existing.profileId !== profile.id || existing.resourceId !== resource.id) {
        fail(503, 'INVALID_PLACEMENT', 'existing placement does not match its resource');
      }
      return { link: await buildLinkDto(existing), created: false, versionChanges: [] };
    }

    const placements = await getPlacements(profile.id);
    const maxPosition = placements.reduce((maximum, item) => Math.max(maximum, Number.isSafeInteger(item.position) ? item.position : 0), 0);
    const updatedProfile = { ...profile, version: profile.version + 1, updatedAt: timestamp() };
    const placement = {
      recordType: 'placement', id: stableId, profileId: profile.id, resourceId: resource.id,
      position: maxPosition + 10, featured: false, selectedForDirectory, version: updatedProfile.version,
    };
    const ok = await store.transact({
      checks: [
        { key: profileKey(profile.id), version: profile.version },
        { key: placementKey(profile.id, stableId), version: null },
        ...checks,
      ],
      puts: [
        { key: placementKey(profile.id, stableId), value: placement },
        { key: profileKey(profile.id), value: updatedProfile },
      ],
    });
    if (!ok) {
      if (returnExistingOnConflict) {
        const winner = await store.get(placementKey(profile.id, stableId));
        if (winner?.id === stableId && winner.profileId === profile.id && winner.resourceId === resource.id) {
          return { link: await buildLinkDto(winner), created: false };
        }
      }
      fail(409, 'LINK_CONFLICT', 'link changed while adding');
    }
    return {
      link: await buildLinkDto(placement), created: true,
      versionChanges: versionChanges(
        versionChange('profile', profile.id, profile.version, updatedProfile.version),
        versionChange('placement', stableId, 0, placement.version),
      ),
    };
  }

  async function readdEditableResource(principal, body) {
    for (const field of Object.keys(body)) {
      if (field !== 'resourceId' && field !== 'resourceVersion') {
        fail(400, 'MIXED_RESOURCE_INPUT', 're-adding an existing resource cannot include new-resource fields');
      }
    }
    if (typeof body.resourceId !== 'string' || !body.resourceId || body.resourceId.length > 160) {
      fail(422, 'INVALID_RESOURCE_ID', 'resourceId must identify an editable resource');
    }
    if (body.resourceVersion === undefined) fail(400, 'RESOURCE_VERSION_REQUIRED', 'resourceVersion is required when re-adding an existing resource');
    const expectedVersion = validVersion(body.resourceVersion);
    const profile = await getRequiredOwnerProfile(principal);
    const resource = await store.get(`resource:${body.resourceId}`);
    if (!resource || resource.id !== body.resourceId || !isCatalogResource(resource)) fail(404, 'RESOURCE_NOT_FOUND', 'resource does not exist');
    if (resource.editorProfileId !== profile.id || resource.directoryControl !== 'creator') {
      fail(403, 'RESOURCE_EDIT_FORBIDDEN', 'this profile does not edit the resource');
    }
    const referenceKey = editorKey(profile.id, resource.id);
    const reference = await store.get(referenceKey);
    if (!reference || reference.recordType !== 'editorReference' || reference.profileId !== profile.id
      || reference.resourceId !== resource.id || !Number.isSafeInteger(reference.version) || reference.version < 0) {
      fail(403, 'RESOURCE_EDIT_FORBIDDEN', 'this profile does not edit the resource');
    }
    const resourceVersion = resource.version ?? 0;
    if (!Number.isSafeInteger(resourceVersion) || resourceVersion < 0) fail(503, 'INVALID_RESOURCE', 'resource version is malformed');
    if (expectedVersion !== resourceVersion) fail(409, 'RESOURCE_CONFLICT', 'resource changed; reload before re-adding it');

    const url = currentResourceUrl(resource);
    try {
      validateCatalogUrl(url);
    } catch {
      fail(503, 'INVALID_RESOURCE', 'resource URL is malformed');
    }
    const reservationKey = currentUrlKey(url);
    const reservation = await store.get(reservationKey);
    if (!reservation || reservation.recordType !== 'urlReservation' || reservation.status !== 'reserved'
      || reservation.url !== url || reservation.resourceId !== resource.id
      || !Number.isSafeInteger(reservation.version) || reservation.version < 0) {
      fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation does not match the editable resource');
    }
    return attachExistingResource(profile, resource, {
      checks: [
        { key: `resource:${resource.id}`, version: resourceVersion },
        { key: reservationKey, version: reservation.version },
        { key: referenceKey, version: reference.version },
      ],
      returnExistingOnConflict: false,
    });
  }

  async function addLink(principal, body) {
    if (Object.hasOwn(body, 'resourceId') || Object.hasOwn(body, 'resourceVersion')) {
      return readdEditableResource(principal, body);
    }
    const profile = await getRequiredOwnerProfile(principal);
    assertKnownFields(body, new Set(['title', 'url', 'description', 'selectedForDirectory']));
    const title = textField(body.title, 'title');
    if (!title.trim()) fail(422, 'INVALID_TITLE', 'title is required');
    const url = validateResourceUrl(body.url);
    const description = body.description === undefined ? '' : textField(body.description, 'description');
    if (body.selectedForDirectory !== undefined && typeof body.selectedForDirectory !== 'boolean') fail(422, 'INVALID_SELECTION', 'selectedForDirectory must be boolean');
    const selectedForDirectory = body.selectedForDirectory ?? true;
    const key = currentUrlKey(url);
    const reservation = await store.get(key);
    if (reservation) {
      if (reservation.url !== url) fail(503, 'URL_INDEX_MISMATCH', 'URL reservation hash points to a different URL');
      if (reservation.status === 'collision') fail(409, 'URL_COLLISION', 'this URL needs administrative review');
      if (reservation.status !== 'reserved' || typeof reservation.resourceId !== 'string') fail(503, 'INVALID_URL_RESERVATION', 'URL reservation is malformed');
      const resource = await store.get(`resource:${reservation.resourceId}`);
      if (!resource || resource.id !== reservation.resourceId || !isCatalogResource(resource) || currentResourceUrl(resource) !== url) {
        fail(503, 'URL_INDEX_MISMATCH', 'URL reservation does not match the current resource');
      }
      return attachExistingResource(profile, resource, {
        selectedForDirectory,
        checks: [
          { key, version: reservation.version },
          { key: `resource:${resource.id}`, version: resource.version ?? 0 },
        ],
      });
    }

    const resourceId = `resource-${newId()}`;
    const resource = {
      id: resourceId,
      title,
      url,
      description,
      order: 0,
      featured: false,
      published: false,
      hidden: false,
      approvalRevoked: false,
      directoryControl: 'creator',
      editorProfileId: profile.id,
      autoSync: false,
      version: 1,
    };
    const placements = await getPlacements(profile.id);
    const maxPosition = placements.reduce((maximum, item) => Math.max(maximum, Number.isSafeInteger(item.position) ? item.position : 0), 0);
    const stableId = placementId(profile.id, resourceId);
    const updatedProfile = { ...profile, version: profile.version + 1, updatedAt: timestamp() };
    const placement = {
      recordType: 'placement', id: stableId, profileId: profile.id, resourceId,
      position: maxPosition + 10, featured: false, selectedForDirectory, version: updatedProfile.version,
    };
    const ok = await store.transact({
      checks: [
        { key, version: null },
        { key: `resource:${resourceId}`, version: null },
        { key: profileKey(profile.id), version: profile.version },
        { key: placementKey(profile.id, stableId), version: null },
        { key: editorKey(profile.id, resourceId), version: null },
      ],
      puts: [
        { key, value: { id: `__url#${hash(url)}`, recordType: 'urlReservation', url, status: 'reserved', resourceId, version: 1 } },
        { key: `resource:${resourceId}`, value: resource },
        { key: profileKey(profile.id), value: updatedProfile },
        { key: placementKey(profile.id, stableId), value: placement },
        { key: editorKey(profile.id, resourceId), value: { recordType: 'editorReference', profileId: profile.id, resourceId, version: 1 } },
      ],
    });
    if (!ok) {
      const latestReservation = await store.get(key);
      if (latestReservation?.url === url && latestReservation.status === 'reserved' && typeof latestReservation.resourceId === 'string') {
        return addLink(principal, body);
      }
      fail(409, 'URL_CONFLICT', 'URL or profile changed while adding');
    }
    return {
      link: await buildLinkDto(placement), created: true,
      versionChanges: versionChanges(
        versionChange('profile', profile.id, profile.version, updatedProfile.version),
        versionChange('resource', resourceId, 0, resource.version),
        versionChange('placement', stableId, 0, placement.version),
      ),
    };
  }

  async function patchPlacement(principal, id, body) {
    assertKnownFields(body, new Set(['position', 'featured', 'selectedForDirectory', 'profileVersion']), PROTECTED_PLACEMENT_FIELDS);
    const profile = await getRequiredOwnerProfile(principal);
    const key = placementKey(profile.id, id);
    const placement = await store.get(key);
    if (!placement || placement.id !== id || placement.profileId !== profile.id) fail(404, 'PLACEMENT_NOT_FOUND', 'placement does not belong to this profile');
    const expectedVersion = validVersion(body.version, { optional: true });
    if (expectedVersion !== undefined && expectedVersion !== placement.version) fail(409, 'PLACEMENT_CONFLICT', 'placement changed; reload before saving');
    const expectedProfileVersion = validVersion(body.profileVersion, { optional: true });
    const changes = {};
    if (Object.hasOwn(body, 'position')) {
      if (!Number.isSafeInteger(body.position) || body.position < 0) fail(422, 'INVALID_POSITION', 'position must be a non-negative integer');
      if (expectedVersion === undefined) fail(400, 'PLACEMENT_VERSION_REQUIRED', 'version is required when changing order');
      if (expectedProfileVersion === undefined) fail(400, 'PROFILE_VERSION_REQUIRED', 'profileVersion is required when changing order');
      if (expectedProfileVersion !== profile.version) fail(409, 'PROFILE_CONFLICT', 'profile changed; reload before changing order');
      changes.position = body.position;
    }
    for (const field of ['featured', 'selectedForDirectory']) {
      if (Object.hasOwn(body, field)) {
        if (typeof body[field] !== 'boolean') fail(422, 'INVALID_PLACEMENT', `${field} must be boolean`);
        changes[field] = body[field];
      }
    }
    if (Object.keys(changes).length === 0) fail(422, 'EMPTY_UPDATE', 'no placement fields were provided');
    if (Object.entries(changes).every(([field, value]) => placement[field] === value)) {
      return { link: await buildLinkDto(placement), versionChanges: [] };
    }

    const puts = [];
    const checks = [
      { key: profileKey(profile.id), version: profile.version },
      { key, version: placement.version },
    ];
    let updated = { ...placement, ...changes, version: placement.version + 1 };
    if (Object.hasOwn(changes, 'position') && changes.position !== placement.position) {
      const all = await getPlacements(profile.id);
      const other = all.find((item) => item.id !== id && item.position === changes.position && item.featured === placement.featured);
      if (other) {
        const otherKey = placementKey(profile.id, other.id);
        const updatedOther = { ...other, position: placement.position, version: other.version + 1 };
        assertPlacementFits(profile.id, updatedOther);
        checks.push({ key: otherKey, version: other.version });
        puts.push({ key: otherKey, value: updatedOther });
      }
    }
    assertPlacementFits(profile.id, updated);
    puts.push({ key, value: updated });
    const updatedProfile = { ...profile, version: profile.version + 1, updatedAt: timestamp() };
    puts.push({ key: profileKey(profile.id), value: updatedProfile });
    if (!await store.transact({ checks, puts })) fail(409, 'PLACEMENT_CONFLICT', 'placement changed while saving');
    const neighbor = puts.find(({ key: putKey }) => putKey !== key && putKey.startsWith(`placement:${profile.id}:`))?.value;
    return {
      link: await buildLinkDto(updated),
      versionChanges: versionChanges(
        versionChange('profile', profile.id, profile.version, updatedProfile.version),
        versionChange('placement', id, placement.version, updated.version),
        neighbor ? versionChange('placement', neighbor.id, neighbor.version - 1, neighbor.version) : null,
      ),
    };
  }

  async function deletePlacement(principal, id, body = {}) {
    assertKnownFields(body, new Set(['profileVersion']));
    const profile = await getRequiredOwnerProfile(principal);
    const key = placementKey(profile.id, id);
    const placement = await store.get(key);
    if (!placement || placement.id !== id || placement.profileId !== profile.id) fail(404, 'PLACEMENT_NOT_FOUND', 'placement does not belong to this profile');
    const expectedProfileVersion = body.profileVersion === undefined ? undefined : validVersion(body.profileVersion);
    if (expectedProfileVersion !== undefined && expectedProfileVersion !== profile.version) {
      fail(409, 'PROFILE_CONFLICT', 'profile changed; reload before saving');
    }
    const currentSeries = await seriesForProfile(profile.id);
    const activeIds = new Set(currentSeries.map((item) => item.id));
    const memberships = placementSeriesMap(placement, activeIds);
    if (Object.keys(memberships).length > 0 && expectedProfileVersion === undefined) {
      fail(400, 'PROFILE_VERSION_REQUIRED', 'profileVersion is required when removing a placement with series chapters');
    }
    const updatedProfile = { ...profile, version: profile.version + 1, updatedAt: timestamp() };
    const ok = await store.transact({
      checks: [{ key: profileKey(profile.id), version: profile.version }, { key, version: placement.version }],
      puts: [{ key: profileKey(profile.id), value: updatedProfile }],
      deletes: [key],
    });
    if (!ok) fail(409, 'PLACEMENT_CONFLICT', 'placement changed while removing');
    return versionChanges(versionChange('profile', profile.id, profile.version, updatedProfile.version));
  }

  async function patchCreatorResource(principal, resourceId, body) {
    assertKnownFields(body, new Set(['title', 'url', 'description']));
    const profile = await getRequiredOwnerProfile(principal);
    const key = `resource:${resourceId}`;
    const resource = await store.get(key);
    if (!resource || !isCatalogResource(resource)) fail(404, 'RESOURCE_NOT_FOUND', 'resource does not exist');
    if (resource.editorProfileId !== profile.id || resource.directoryControl !== 'creator') fail(403, 'RESOURCE_EDIT_FORBIDDEN', 'this profile does not edit the resource');
    const expectedVersion = validVersion(body.version, { optional: true });
    if (expectedVersion !== undefined && expectedVersion !== resource.version) fail(409, 'RESOURCE_CONFLICT', 'resource changed; reload before saving');
    const changedFields = {};
    if (Object.hasOwn(body, 'title')) {
      const title = textField(body.title, 'title');
      if (!title) fail(422, 'INVALID_TITLE', 'title is required');
      changedFields.title = title;
    }
    if (Object.hasOwn(body, 'description')) changedFields.description = textField(body.description, 'description');
    let nextUrl;
    const urlField = resource.recordType === 'event' ? 'registrationUrl' : 'url';
    if (Object.hasOwn(body, 'url')) {
      nextUrl = validateResourceUrl(body.url);
      changedFields[urlField] = nextUrl;
    }
    if (Object.keys(changedFields).length === 0) fail(422, 'EMPTY_UPDATE', 'no resource fields were provided');
    if (Object.entries(changedFields).every(([field, value]) => resource[field] === value)) {
      return {
        resource: { id: resource.id, title: resource.title, url: currentResourceUrl(resource), description: resource.description, version: resource.version ?? 0 },
        versionChanges: [],
      };
    }
    const updated = { ...resource, ...changedFields, version: resource.version + 1, updatedAt: timestamp() };
    const oldUrl = currentResourceUrl(resource);
    if (nextUrl !== undefined && nextUrl !== oldUrl) {
      const nextKey = currentUrlKey(nextUrl);
      const reservation = await store.get(nextKey);
      if (reservation && (reservation.url !== nextUrl || reservation.resourceId !== resource.id || reservation.status !== 'reserved')) {
        fail(409, 'URL_TAKEN', 'another resource already uses this URL');
      }
      const previousKey = currentUrlKey(oldUrl);
      const previousReservation = await store.get(previousKey);
      if (!previousReservation || previousReservation.url !== oldUrl || previousReservation.resourceId !== resource.id) {
        fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation is missing or inconsistent');
      }
      if (nextKey === previousKey) fail(422, 'INVALID_URL', 'current URL could not be changed');
      const checks = [
        { key, version: resource.version },
        { key: nextKey, version: reservation?.version ?? null },
        { key: previousKey, version: previousReservation.version },
      ];
      const nextReservationRecord = {
        id: `__url#${hash(nextUrl)}`, recordType: 'urlReservation', url: nextUrl, status: 'reserved', resourceId,
        version: reservation ? reservation.version + 1 : 1,
      };
      const ok = await store.transact({
        checks,
        puts: [{ key, value: updated }, { key: nextKey, value: nextReservationRecord }],
        deletes: [previousKey],
      });
      if (!ok) fail(409, 'RESOURCE_CONFLICT', 'resource or URL changed while saving');
    } else {
      const ok = await store.transact({ checks: [{ key, version: resource.version }], puts: [{ key, value: updated }] });
      if (!ok) fail(409, 'RESOURCE_CONFLICT', 'resource changed while saving');
    }
    return {
      resource: { id: updated.id, title: updated.title, url: currentResourceUrl(updated), description: updated.description, version: updated.version },
      versionChanges: versionChanges(versionChange('resource', resourceId, resource.version ?? 0, updated.version)),
    };
  }

  async function adminResourceList() {
    const rows = await store.list('resource:');
    return rows.map(({ value }) => cleanAdminResource(value));
  }

  async function adminProfileList() {
    const rows = await store.list('profile:');
    return rows.map(({ value }) => ({
      id: value.id,
      displayName: value.displayName,
      slug: value.slug,
      published: value.published === true,
      hidden: value.hidden === true,
      version: value.version ?? 0,
    }));
  }

  async function adminClaimList() {
    const rows = await store.list('claim:');
    return rows.map(({ value }) => ({
      id: value.id,
      accountId: value.accountId,
      profileId: value.profileId,
      resourceIds: Array.isArray(value.resourceIds) ? [...value.resourceIds] : [],
      ...(typeof value.sourceId === 'string' ? { sourceId: value.sourceId } : {}),
      ...(typeof value.evidence === 'string' ? { evidence: value.evidence } : {}),
      status: value.status,
      createdAt: value.createdAt,
      version: value.version ?? 0,
    }));
  }

  async function patchAdminResource(resourceId, body) {
    assertKnownFields(body, ADMIN_RESOURCE_FIELDS);
    const key = `resource:${resourceId}`;
    const resource = await store.get(key);
    if (!resource || !isCatalogResource(resource)) fail(404, 'RESOURCE_NOT_FOUND', 'resource does not exist');
    const expectedVersion = validVersion(body.version, { optional: true });
    if (expectedVersion !== undefined && expectedVersion !== resource.version) fail(409, 'RESOURCE_CONFLICT', 'resource changed; reload before saving');
    const updated = { ...resource };
    for (const field of ['category', 'kind', 'format']) {
      if (Object.hasOwn(body, field)) updated[field] = textField(body[field], field);
    }
    if (Object.hasOwn(body, 'topics')) {
      if (!Array.isArray(body.topics) || body.topics.some((topic) => typeof topic !== 'string')) fail(422, 'INVALID_TOPICS', 'topics must be a list of text');
      updated.topics = [...body.topics];
    }
    if (!Object.keys(body).some((field) => ADMIN_RESOURCE_FIELDS.has(field))) fail(422, 'EMPTY_UPDATE', 'classification fields are required');
    try {
      projectPublicRecord(updated);
    } catch {
      fail(422, 'INVALID_CLASSIFICATION', 'resource classification is incomplete or invalid');
    }
    if (['category', 'kind', 'format', 'topics'].every((field) =>
      JSON.stringify(updated[field]) === JSON.stringify(resource[field]))) {
      return { resource: cleanAdminResource(resource), versionChanges: [] };
    }
    updated.version = resource.version + 1;
    updated.updatedAt = timestamp();
    const ok = await store.transact({ checks: [{ key, version: resource.version }], puts: [{ key, value: updated }] });
    if (!ok) fail(409, 'RESOURCE_CONFLICT', 'resource changed while saving');
    return {
      resource: cleanAdminResource(updated),
      versionChanges: versionChanges(versionChange('resource', resourceId, resource.version ?? 0, updated.version)),
    };
  }

  async function adminResourceAction(resourceId, action, body) {
    const observedVersion = requiredModerationVersion(body);
    const key = `resource:${resourceId}`;
    const resource = await store.get(key);
    if (!resource || !isCatalogResource(resource)) fail(404, 'RESOURCE_NOT_FOUND', 'resource does not exist');
    const currentVersion = resource.version ?? 0;
    if (observedVersion !== currentVersion) fail(409, 'RESOURCE_CONFLICT', 'resource changed; reload before applying action');
    const updated = { ...resource };
    if (action === 'aprobar') {
      try {
        projectPublicRecord(resource);
      } catch {
        fail(422, resource.recordType === 'event' ? 'INVALID_EVENT' : 'INVALID_CLASSIFICATION',
          resource.recordType === 'event' ? 'event data is incomplete or invalid' : 'classify this resource before approving it');
      }
      updated.published = true;
      updated.approvalRevoked = false;
    } else if (action === 'revocar') {
      updated.published = false;
      updated.approvalRevoked = true;
    } else if (action === 'ocultar') updated.hidden = true;
    else if (action === 'restaurar') updated.hidden = false;
    else fail(404, 'ACTION_NOT_FOUND', 'action does not exist');
    if (['published', 'approvalRevoked', 'hidden'].every((field) => updated[field] === resource[field])) {
      return { resource: cleanAdminResource(resource), versionChanges: [] };
    }
    updated.version = observedVersion + 1;
    updated.updatedAt = timestamp();
    const ok = await store.transact({ checks: [{ key, version: observedVersion }], puts: [{ key, value: updated }] });
    if (!ok) fail(409, 'RESOURCE_CONFLICT', 'resource changed while applying action');
    return {
      resource: cleanAdminResource(updated),
      versionChanges: versionChanges(versionChange('resource', resourceId, observedVersion, updated.version)),
    };
  }

  async function adminProfileAction(profileId, action, body) {
    const observedVersion = requiredModerationVersion(body);
    const key = profileKey(profileId);
    const profile = await store.get(key);
    if (!profile) fail(404, 'PROFILE_NOT_FOUND', 'profile does not exist');
    const currentVersion = profile.version ?? 0;
    if (observedVersion !== currentVersion) fail(409, 'PROFILE_CONFLICT', 'profile changed; reload before applying action');
    if (action !== 'ocultar' && action !== 'restaurar') fail(404, 'ACTION_NOT_FOUND', 'action does not exist');
    const hidden = action === 'ocultar';
    if ((profile.hidden === true) === hidden) return { profile: cleanPublicProfile(profile), versionChanges: [] };
    const updated = { ...profile, hidden, version: observedVersion + 1, updatedAt: timestamp() };
    const ok = await store.transact({ checks: [{ key, version: observedVersion }], puts: [{ key, value: updated }] });
    if (!ok) fail(409, 'PROFILE_CONFLICT', 'profile changed while applying action');
    return {
      profile: cleanPublicProfile(updated),
      versionChanges: versionChanges(versionChange('profile', profileId, observedVersion, updated.version)),
    };
  }

  async function createClaim(principal, body) {
    const profile = await getRequiredOwnerProfile(principal);
    assertKnownFields(body, new Set(['resourceIds', 'sourceId', 'evidence']));
    if (!Array.isArray(body.resourceIds) || body.resourceIds.length === 0
      || body.resourceIds.some((id) => typeof id !== 'string' || !id || id.includes(':'))
      || new Set(body.resourceIds).size !== body.resourceIds.length) {
      fail(422, 'INVALID_RESOURCE_IDS', 'resourceIds must contain exact unique resource IDs');
    }
    const resourceIds = [...body.resourceIds];
    for (const id of resourceIds) {
      const resource = await store.get(`resource:${id}`);
      if (!resource) fail(404, 'RESOURCE_NOT_FOUND', `resource ${id} does not exist`);
      if (!isCatalogResource(resource)) fail(422, 'INVALID_RESOURCE_IDS', `resource ${id} is not a catalog resource`);
    }
    const sourceId = body.sourceId === undefined ? undefined : textField(body.sourceId, 'sourceId');
    const evidence = body.evidence === undefined || body.evidence === '' ? undefined : textField(body.evidence, 'evidence');
    const id = newId();
    const createdAt = timestamp();
    const claim = {
      recordType: 'claim', id, accountId: principal.accountId, profileId: profile.id,
      resourceIds, ...(sourceId ? { sourceId } : {}), ...(evidence ? { evidence } : {}),
      status: 'pending', createdAt, version: 1,
    };
    const ok = await store.transact({
      checks: [
        { key: claimKey(id), version: null },
        { key: claimRefKey(profile.id, id), version: null },
      ],
      puts: [
        { key: claimKey(id), value: claim },
        { key: claimRefKey(profile.id, id), value: { id, version: 1 } },
      ],
    });
    if (!ok) fail(409, 'CLAIM_CONFLICT', 'claim changed while saving');
    return { claim: { id, resourceIds, ...(sourceId ? { sourceId } : {}), ...(evidence ? { evidence } : {}), status: 'pending', createdAt } };
  }

  async function linkClaim(body) {
    assertKnownFields(body, new Set(['accountId', 'resourceIds', 'sourceId']));
    if (typeof body.accountId !== 'string' || !body.accountId || !Array.isArray(body.resourceIds)
      || body.resourceIds.length === 0 || body.resourceIds.some((id) => typeof id !== 'string' || !id || id.includes(':'))
      || new Set(body.resourceIds).size !== body.resourceIds.length) {
      fail(422, 'EXACT_RESOURCES_REQUIRED', 'accountId and exact unique resourceIds are required');
    }
    const owner = await store.get(accountKey(body.accountId));
    if (!owner || typeof owner.profileId !== 'string') fail(404, 'PROFILE_NOT_FOUND', 'target account has no creator profile');
    const profile = await store.get(profileKey(owner.profileId));
    if (!profile || profile.id !== owner.profileId) fail(503, 'INVALID_PROFILE', 'account mapping points to missing profile data');
    const requestedIds = [...body.resourceIds];
    const resources = new Map();
    for (const resourceId of requestedIds) {
      const resource = await store.get(`resource:${resourceId}`);
      if (!resource) fail(404, 'RESOURCE_NOT_FOUND', `resource ${resourceId} does not exist`);
      if (!isCatalogResource(resource)) fail(422, 'EXACT_RESOURCES_REQUIRED', `resource ${resourceId} is not a catalog resource`);
      if ((resource.editorProfileId && resource.editorProfileId !== profile.id)
        || (resource.directoryControl === 'creator' && resource.editorProfileId !== profile.id)) {
        fail(409, 'RESOURCE_ALREADY_CLAIMED', `resource ${resourceId} has another editor`);
      }
      resources.set(resourceId, resource);
    }
    const didLink = [];
    const committedVersionChanges = [];
    try {
      for (const resourceId of requestedIds) {
        const resourceKey = `resource:${resourceId}`;
        const resource = resources.get(resourceId);
        const id = placementId(profile.id, resourceId);
        const pKey = placementKey(profile.id, id);
        const eKey = editorKey(profile.id, resourceId);
        const currentPlacement = await store.get(pKey);
        const currentEditor = await store.get(eKey);
        const nextProfileVersion = profile.version + 1;
        const hasEditor = resource.directoryControl === 'creator' && resource.editorProfileId === profile.id;
        const alreadyLinked = hasEditor && currentPlacement && currentEditor;
        if (alreadyLinked) {
          didLink.push(resourceId);
          continue;
        }
        const checks = [
          { key: resourceKey, version: resource.version ?? 0 },
          { key: profileKey(profile.id), version: profile.version },
        ];
        const puts = [];
        let resourceUpdated = null;
        if (!hasEditor) {
          resourceUpdated = {
            ...resource,
            directoryControl: 'creator',
            editorProfileId: profile.id,
            autoSync: false,
            version: (resource.version ?? 0) + 1,
          };
          puts.push({ key: resourceKey, value: resourceUpdated });
        }
        if (!currentEditor) {
          checks.push({ key: eKey, version: null });
          puts.push({ key: eKey, value: { recordType: 'editorReference', profileId: profile.id, resourceId, version: 1 } });
        }
        if (!currentPlacement) {
          const all = await getPlacements(profile.id);
          const maxPosition = all.reduce((maximum, item) => Math.max(maximum, item.position), 0);
          checks.push({ key: pKey, version: null });
          puts.push({ key: pKey, value: { recordType: 'placement', id, profileId: profile.id, resourceId, position: maxPosition + 10, featured: false, selectedForDirectory: true, version: nextProfileVersion } });
        }
        if (puts.length === 0) {
          didLink.push(resourceId);
          continue;
        }
        const updatedProfile = { ...profile, version: nextProfileVersion, updatedAt: timestamp() };
        puts.push({ key: profileKey(profile.id), value: updatedProfile });
        const ok = await store.transact({ checks, puts });
        if (!ok) fail(409, 'CLAIM_CONFLICT', `resource ${resourceId} changed while linking`);
        committedVersionChanges.push(versionChange('profile', profile.id, profile.version, updatedProfile.version));
        if (resourceUpdated) {
          committedVersionChanges.push(versionChange('resource', resourceId, resource.version ?? 0, resourceUpdated.version));
        }
        if (!currentPlacement) {
          committedVersionChanges.push(versionChange('placement', id, 0, nextProfileVersion));
        }
        profile.version = updatedProfile.version;
        didLink.push(resourceId);
      }

      // Keep a request pending after a partial selection; resolve it only when every
      // explicitly requested resource is under this creator's current edit control.
      const claims = await store.list('claim:');
      for (const row of claims) {
        const claim = row.value;
        const claimIds = Array.isArray(claim.resourceIds) ? claim.resourceIds : [];
        if (claim.accountId !== body.accountId || !['pending', 'partial'].includes(claim.status)
          || !requestedIds.some((id) => claimIds.includes(id))) continue;
        const linked = await Promise.all(claimIds.map(async (id) => {
          const resource = await store.get(`resource:${id}`);
          return resource?.directoryControl === 'creator' && resource.editorProfileId === profile.id;
        }));
        const linkedCount = linked.filter(Boolean).length;
        const nextStatus = linkedCount === claimIds.length ? 'resolved' : linkedCount > 0 ? 'partial' : 'pending';
        if (nextStatus === claim.status) continue;
        const updated = { ...claim, status: nextStatus, ...(nextStatus === 'resolved' ? { resolvedAt: timestamp() } : {}), version: claim.version + 1 };
        const refKey = claimRefKey(profile.id, claim.id);
        const ref = await store.get(refKey);
        const checks = [{ key: row.key, version: claim.version }];
        const puts = [{ key: row.key, value: updated }];
        if (!ref) {
          checks.push({ key: refKey, version: null });
          puts.push({ key: refKey, value: { id: claim.id, version: 1 } });
        }
        if (!await store.transact({ checks, puts })) fail(409, 'CLAIM_CONFLICT', 'claim state changed while resolving');
      }
    } catch (error) {
      if (didLink.length > 0) {
        if (error instanceof ApiError) {
          error.details = { linkedResourceIds: didLink, versionChanges: committedVersionChanges };
          throw error;
        }
        const partial = new ApiError(503, 'PARTIAL_CLAIM_WRITE', 'some resources were linked before storage became unavailable');
        partial.details = { linkedResourceIds: didLink, versionChanges: committedVersionChanges };
        throw partial;
      }
      throw error;
    }
    return { linkedResourceIds: didLink, versionChanges: committedVersionChanges };
  }

  function publicSeriesSummaries(profile, series, links) {
    return series.map((item) => {
      const chapterCount = links.reduce((count, link) => count + Number(link.series.some((tag) => tag.seriesId === item.id)), 0);
      if (chapterCount === 0) return null;
      return {
        ...item,
        chapterCount,
        href: `/c/${encodeURIComponent(profile.slug)}/series/${encodeURIComponent(item.slug)}/`,
      };
    }).filter(Boolean);
  }

  async function readPublicProfile(slugValue, { suffix = '', search = '' } = {}) {
    try {
      let slug;
      try { slug = normalizeSlug(slugValue); } catch { return { status: 404 }; }
      if (typeof suffix !== 'string' || (suffix && (!suffix.startsWith('/') || suffix.startsWith('//') || suffix.includes('?') || suffix.includes('#')))) {
        return { status: 404 };
      }
      if (suffix.includes('\\') || /[\u0000-\u001f\u007f]/.test(suffix)
        || suffix.split('/').some((part) => part === '.' || part === '..')) return { status: 404 };
      if (typeof search !== 'string' || (search && (!search.startsWith('?') || /[\u0000-\u001f\u007f]/.test(search)))) return { status: 404 };
      const alias = await store.get(aliasKey(slug));
      if (!alias) return { status: 404 };
      if (alias.recordType !== 'profileAlias' || alias.slug !== slug || typeof alias.profileId !== 'string') fail(503, 'INVALID_ALIAS', 'profile alias is malformed');
      const profile = await store.get(profileKey(alias.profileId));
      if (!profile || profile.id !== alias.profileId) fail(503, 'INVALID_ALIAS', 'profile alias points to missing data');
      if (Object.hasOwn(profile, 'hidden') && typeof profile.hidden !== 'boolean') fail(503, 'INVALID_PROFILE', 'profile hidden state is malformed');
      if (typeof profile.published !== 'boolean') fail(503, 'INVALID_PROFILE', 'profile publication state is malformed');
      if (typeof profile.slug !== 'string') fail(503, 'INVALID_PROFILE', 'profile slug is malformed');
      if (profile.hidden === true || profile.published !== true) return { status: 404 };
      try { normalizeSlug(profile.slug); } catch { fail(503, 'INVALID_PROFILE', 'profile slug is malformed'); }
      const publicProfile = cleanPublicProfile(profile);
      if (!publicProfile.displayName.trim()) fail(503, 'INVALID_PROFILE', 'profile display name is malformed');
      if (profile.slug !== slug) {
        const pathSuffix = suffix || '/';
        return { status: 308, redirectTo: `/c/${encodeURIComponent(profile.slug)}${pathSuffix}${search}` };
      }
      const series = await seriesForProfile(profile.id);
      const links = await profileLinks(profile.id, { series, publicTags: true, profileSlug: profile.slug });
      return { status: 200, profile: publicProfile, links, series: publicSeriesSummaries(profile, series, links) };
    } catch {
      return { status: 503 };
    }
  }

  async function readPublicSeries(profileSlugValue, seriesSlugValue, { search = '' } = {}) {
    try {
      let profileSlug;
      let seriesSlug;
      try {
        profileSlug = normalizeSlug(profileSlugValue);
        seriesSlug = normalizeSlug(seriesSlugValue);
      } catch {
        return { status: 404 };
      }
      if (typeof search !== 'string' || (search && (!search.startsWith('?') || /[\u0000-\u001f\u007f]/.test(search)))) return { status: 404 };
      const profileAlias = await store.get(aliasKey(profileSlug));
      if (!profileAlias) return { status: 404 };
      if (profileAlias.recordType !== 'profileAlias' || profileAlias.slug !== profileSlug || typeof profileAlias.profileId !== 'string') fail(503, 'INVALID_ALIAS', 'profile alias is malformed');
      const profile = await store.get(profileKey(profileAlias.profileId));
      if (!profile || profile.id !== profileAlias.profileId) fail(503, 'INVALID_ALIAS', 'profile alias points to missing data');
      if (Object.hasOwn(profile, 'hidden') && typeof profile.hidden !== 'boolean') fail(503, 'INVALID_PROFILE', 'profile hidden state is malformed');
      if (typeof profile.published !== 'boolean' || typeof profile.slug !== 'string') fail(503, 'INVALID_PROFILE', 'profile publication state is malformed');
      if (profile.hidden === true || profile.published !== true) return { status: 404 };
      try { normalizeSlug(profile.slug); } catch { fail(503, 'INVALID_PROFILE', 'profile slug is malformed'); }
      const publicProfile = cleanPublicProfile(profile);
      if (!publicProfile.displayName.trim()) fail(503, 'INVALID_PROFILE', 'profile display name is malformed');

      const seriesAlias = await readSeriesAlias(profile.id, seriesSlug);
      if (!seriesAlias) return { status: 404 };
      const series = await getSeries(profile.id, seriesAlias.seriesId);
      // Retained aliases whose series was deleted remain reserved but are no
      // longer public.
      if (!series) return { status: 404 };
      const allSeries = await seriesForProfile(profile.id);
      const links = await profileLinks(profile.id, { series: allSeries, publicTags: true, profileSlug: profile.slug });
      const chapters = links.filter((link) => link.series.some((tag) => tag.seriesId === series.id))
        .sort((left, right) => left.series.find((tag) => tag.seriesId === series.id).position
          - right.series.find((tag) => tag.seriesId === series.id).position
          || left.placementId.localeCompare(right.placementId));
      if (chapters.length === 0) return { status: 404 };
      const canonicalProfile = profile.slug;
      if (canonicalProfile !== profileSlug || series.slug !== seriesSlug) {
        return {
          status: 308,
          redirectTo: `/c/${encodeURIComponent(canonicalProfile)}/series/${encodeURIComponent(series.slug)}/${search}`,
        };
      }
      return { status: 200, profile: publicProfile, series, links: chapters };
    } catch {
      return { status: 503 };
    }
  }

  async function route(request, principal) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');

    if (path === '/api/creador/estadisticas') {
      requireMethod(request, 'GET');

      const allowedParameters = new Set(['periodo', 'pagina']);
      for (const name of url.searchParams.keys()) {
        if (!allowedParameters.has(name)) fail(400, 'INVALID_STATISTICS_QUERY', 'query contains an unsupported parameter');
      }

      const periods = url.searchParams.getAll('periodo');
      const pages = url.searchParams.getAll('pagina');
      if (periods.length > 1 || pages.length > 1) {
        fail(400, 'INVALID_STATISTICS_QUERY', 'query parameters must not be repeated');
      }

      const rawPeriod = periods[0] ?? '7';
      if (rawPeriod !== '7' && rawPeriod !== '30') {
        fail(400, 'INVALID_STATISTICS_PERIOD', 'periodo must be 7 or 30');
      }
      const period = Number(rawPeriod);
      const rawPage = pages[0] ?? '1';
      if (!/^\d+$/.test(rawPage)) fail(400, 'INVALID_STATISTICS_PAGE', 'pagina must be a positive integer');
      const page = Number(rawPage);
      if (!Number.isSafeInteger(page) || page < 1) {
        fail(400, 'INVALID_STATISTICS_PAGE', 'pagina must be a positive integer');
      }

      const { profile } = await ownerProfile(principal);
      if (!profile) return jsonResponse({ state: 'no-profile', period, page });
      if (typeof profile.published !== 'boolean') fail(503, 'INVALID_PROFILE', 'profile publication state is malformed');
      if (!profile.published) return jsonResponse({ state: 'not-published', period, page });
      if (!statistics || typeof statistics.read !== 'function') {
        fail(503, 'STATISTICS_UNAVAILABLE', 'statistics are temporarily unavailable');
      }

      let report;
      try {
        report = await statistics.read({ profileId: profile.id, period, page });
      } catch {
        fail(503, 'STATISTICS_UNAVAILABLE', 'statistics are temporarily unavailable');
      }
      if (!isRecord(report)) fail(503, 'STATISTICS_UNAVAILABLE', 'statistics are temporarily unavailable');
      return jsonResponse(report);
    }

    if (path === '/api/creador/perfil') {
      if (request.method === 'GET') return jsonResponse(await creatorEditor(principal));
      if (request.method === 'PUT') {
        requireWriteRequest(request, principal);
        const body = await parseRequestBody(request);
        return writeJsonResponse(await saveProfile(principal, body));
      }
      fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
    }
    if (path === '/api/creador/series') {
      if (request.method === 'GET') return jsonResponse(await listCreatorSeries(principal));
      if (request.method === 'POST') {
        requireWriteRequest(request, principal);
        const body = await parseRequestBody(request);
        if (Object.hasOwn(body, 'version')) fail(400, 'UNKNOWN_FIELD', 'unsupported field: version');
        return writeJsonResponse(await createCreatorSeries(principal, body), 201);
      }
      fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
    }
    const seriesChapterMatch = path.match(/^\/api\/creador\/series\/([^/]+)\/capitulos\/([^/]+)$/);
    if (seriesChapterMatch) {
      const seriesId = decodeSegment(seriesChapterMatch[1]);
      const chapterId = decodeSegment(seriesChapterMatch[2]);
      if (!['PUT', 'PATCH', 'DELETE'].includes(request.method)) fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
      requireWriteRequest(request, principal);
      const body = await parseRequestBody(request);
      const operation = request.method === 'PUT' ? 'add' : request.method === 'DELETE' ? 'remove' : 'move';
      const result = await changeSeriesChapter(principal, seriesId, chapterId, body, operation);
      return request.method === 'DELETE' ? writeEmptyResponse(result.versionChanges) : writeJsonResponse(result);
    }
    const seriesMatch = path.match(/^\/api\/creador\/series\/([^/]+)$/);
    if (seriesMatch) {
      const id = decodeSegment(seriesMatch[1]);
      if (request.method === 'PATCH') {
        requireWriteRequest(request, principal);
        return writeJsonResponse(await patchCreatorSeries(principal, id, await parseRequestBody(request)));
      }
      if (request.method === 'DELETE') {
        requireWriteRequest(request, principal);
        const changes = await deleteCreatorSeries(principal, id, await parseRequestBody(request));
        return writeEmptyResponse(changes);
      }
      fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
    }
    if (path === '/api/creador/perfil/publicar') {
      requireMethod(request, 'POST');
      requireWriteRequest(request, principal);
      return writeJsonResponse(await publishProfile(principal, await parseRequestBody(request)));
    }
    if (path === '/api/creador/enlaces') {
      requireMethod(request, 'POST');
      requireWriteRequest(request, principal);
      const result = await addLink(principal, await parseRequestBody(request));
      return writeJsonResponse(result, result.created ? 201 : 200);
    }
    const placementMatch = path.match(/^\/api\/creador\/enlaces\/([^/]+)$/);
    if (placementMatch) {
      const id = decodeSegment(placementMatch[1]);
      if (request.method === 'DELETE') {
        requireWriteRequest(request, principal);
        const changes = await deletePlacement(principal, id, request.body ? await parseRequestBody(request) : {});
        return writeEmptyResponse(changes);
      }
      if (request.method === 'PATCH') {
        requireWriteRequest(request, principal);
        return writeJsonResponse(await patchPlacement(principal, id, await parseRequestBody(request)));
      }
      fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
    }
    const creatorResourceMatch = path.match(/^\/api\/creador\/recursos\/([^/]+)$/);
    if (creatorResourceMatch) {
      requireMethod(request, 'PATCH');
      requireWriteRequest(request, principal);
      return writeJsonResponse(await patchCreatorResource(principal, decodeSegment(creatorResourceMatch[1]), await parseRequestBody(request)));
    }
    if (path === '/api/creador/reclamaciones') {
      requireMethod(request, 'POST');
      requireWriteRequest(request, principal);
      return writeJsonResponse(await createClaim(principal, await parseRequestBody(request)), 202);
    }

    if (path === '/api/admin/recursos' || path === '/api/admin/perfiles' || path === '/api/admin/reclamaciones') {
      requireMethod(request, 'GET');
      requireAdmin(principal);
      if (path.endsWith('/recursos')) return jsonResponse({ resources: await adminResourceList() });
      if (path.endsWith('/perfiles')) return jsonResponse({ profiles: await adminProfileList() });
      return jsonResponse({ claims: await adminClaimList() });
    }
    if (path === '/api/admin/reclamaciones/vincular') {
      requireMethod(request, 'POST');
      requireAdmin(principal);
      requireWriteRequest(request, principal);
      return writeJsonResponse(await linkClaim(await parseRequestBody(request)));
    }
    const adminResourceMatch = path.match(/^\/api\/admin\/recursos\/([^/]+)(?:\/(aprobar|revocar|ocultar|restaurar))?$/);
    if (adminResourceMatch) {
      requireAdmin(principal);
      const resourceId = decodeSegment(adminResourceMatch[1]);
      const action = adminResourceMatch[2];
      if (action) {
        requireMethod(request, 'POST');
        requireWriteRequest(request, principal);
        const body = request.body ? await parseRequestBody(request) : {};
        return writeJsonResponse(await adminResourceAction(resourceId, action, body));
      }
      requireMethod(request, 'PATCH');
      requireWriteRequest(request, principal);
      return writeJsonResponse(await patchAdminResource(resourceId, await parseRequestBody(request)));
    }
    const adminProfileMatch = path.match(/^\/api\/admin\/perfiles\/([^/]+)\/(ocultar|restaurar)$/);
    if (adminProfileMatch) {
      requireMethod(request, 'POST');
      requireAdmin(principal);
      requireWriteRequest(request, principal);
      const body = request.body ? await parseRequestBody(request) : {};
      return writeJsonResponse(await adminProfileAction(decodeSegment(adminProfileMatch[1]), adminProfileMatch[2], body));
    }
    return jsonResponse({ error: 'NOT_FOUND', message: 'route not found' }, 404);
  }

  return {
    async handle(request) {
      try {
        if (!(request instanceof Request)) fail(400, 'INVALID_REQUEST', 'a Request is required');
        const url = new URL(request.url);
        if (!url.pathname.startsWith('/api/')) return jsonResponse({ error: 'NOT_FOUND', message: 'route not found' }, 404);
        const principal = await getPrincipal(request);
        return await route(request, principal);
      } catch (error) {
        if (error instanceof ApiError) return jsonResponse({ error: error.code, message: error.message, ...(error.details ?? {}) }, error.status);
        return jsonResponse({ error: 'SERVICE_UNAVAILABLE', message: 'service is temporarily unavailable' }, 503);
      }
    },
    readPublicProfile,
    readPublicSeries,
  };
}

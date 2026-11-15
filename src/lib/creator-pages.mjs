import { createHash } from 'node:crypto';
import { isCatalogResourceIdWithinLimit } from './catalog-identity.mjs';
import { projectPublicRecord, validateCatalogUrl } from './catalog.mjs';
import { currentUrlCollision, currentUrlKey, currentUrlReservation, currentUrlReservationId } from './catalog-url.mjs';
import {
  CREATOR_CONTRACT_VERSION,
  CREATOR_CONTRACT_HEADER,
  CREATOR_FIELD_LIMITS,
  CREATOR_PROGRAMS,
  CREATOR_SOCIALS,
  isCreatorSlug,
  isCreatorStateId,
  normalizeCreatorText,
} from './creator-values.mjs';
import { CreatorStateError, assertCreatorStateFits, readCreatorState } from './creator-state.mjs';
import {
  creatorPageSessionBindingFailureForRequest,
} from './creator-session-context.mjs';
import { parseHttpsOrigin } from './account-origin.mjs';

const PROGRAMS = new Set(CREATOR_PROGRAMS);
const SOCIALS = new Set(CREATOR_SOCIALS);
const PROTECTED_PROFILE_FIELDS = new Set([
  'accountId', 'email', 'isAdmin', 'published', 'hidden', 'directoryApproval',
  'directoryControl', 'editorProfileId', 'photo', 'ownerAccountId',
]);
const PROTECTED_PLACEMENT_FIELDS = new Set(['published', 'directoryApproval', 'directoryControl', 'editorProfileId', 'accountId', 'isAdmin']);
const ADMIN_RESOURCE_FIELDS = new Set(['category', 'kind', 'format', 'topics']);
const CREATOR_RESOURCE_FIELDS = new Set(['title', 'url', 'description']);
const MAX_REQUEST_BODY_BYTES = 32 * 1024;
const MAX_DYNAMODB_ITEM_BYTES = 400 * 1024;
const TEXT_FIELD_LIMITS = new Map(Object.entries(CREATOR_FIELD_LIMITS)
  .filter(([field]) => field !== 'social' && field !== 'slug'));
const SOCIAL_FIELD_LIMIT = CREATOR_FIELD_LIMITS.social;

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

function requireCatalogResourceIdWithinLimit(id) {
  if (!isCatalogResourceIdWithinLimit(id)) {
    fail(422, 'INVALID_RESOURCE_ID', 'resourceId must be at most 256 UTF-8 bytes');
  }
}

function adminResourceIdFromQuery(searchParams) {
  const ids = searchParams.getAll('id');
  if (ids.length !== 1 || [...searchParams.keys()].length !== 1) {
    fail(400, 'INVALID_RESOURCE_ID', 'exactly one resource id is required');
  }
  const [id] = ids;
  // URLSearchParams already decoded this value; do not decode it again.
  requireCatalogResourceIdWithinLimit(id);
  return id;
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
  return isRecord(resource) && isCatalogResourceIdWithinLimit(resource.id) && !resource.id.startsWith('__')
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
  if (!isCreatorSlug(slug)) {
    fail(422, 'INVALID_SLUG', 'slug must use 3 to 40 lowercase ASCII letters, numbers, and single hyphens');
  }
  return slug;
}

function textField(value, name, { optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string') fail(422, 'INVALID_FIELD', `${name} must be text`);
  const limit = name.startsWith('socials.') ? SOCIAL_FIELD_LIMIT : TEXT_FIELD_LIMITS.get(name);
  if (limit !== undefined && value.length > limit) fail(422, 'FIELD_TOO_LONG', `${name} must be at most ${limit} characters`);
  return normalizeCreatorText(value);
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
  const next = previous ? Object.fromEntries(
    ['displayName', 'slug', 'city', 'country', 'bio', 'programs', 'socials']
      .filter((field) => Object.hasOwn(previous, field))
      .map((field) => [field, structuredClone(previous[field])]),
  ) : {};
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
    const socials = next.socials ?? {};
    for (const [key, value] of Object.entries(body.socials)) {
      if (!SOCIALS.has(key)) fail(422, 'INVALID_SOCIALS', `unsupported social field: ${key}`);
      const url = textField(value, `socials.${key}`);
      if (!url) {
        delete socials[key];
        continue;
      }
      try {
        validateCatalogUrl(url);
      } catch {
        fail(422, 'INVALID_SOCIAL_URL', `socials.${key} must be a safe HTTP or HTTPS URL without credentials`);
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

function storedClaimResources(claim) {
  if (!Object.hasOwn(claim, 'resources')) return undefined;
  if (!Array.isArray(claim.resourceIds) || !Array.isArray(claim.resources)
    || claim.resources.length === 0 || claim.resources.length !== claim.resourceIds.length
    || new Set(claim.resourceIds).size !== claim.resourceIds.length) {
    fail(503, 'INVALID_CLAIM', 'claim resource observations are malformed');
  }

  return claim.resources.map((value, index) => {
    if (!isRecord(value) || Object.keys(value).length !== 2
      || !Object.hasOwn(value, 'resourceId') || !Object.hasOwn(value, 'url')
      || typeof value.resourceId !== 'string' || !value.resourceId
      || value.resourceId !== claim.resourceIds[index]
      || typeof value.url !== 'string' || value.url.length > TEXT_FIELD_LIMITS.get('url')) {
      fail(503, 'INVALID_CLAIM', 'claim resource observations are malformed');
    }
    try {
      validateCatalogUrl(value.url);
    } catch {
      fail(503, 'INVALID_CLAIM', 'claim resource observations are malformed');
    }
    return { resourceId: value.resourceId, url: value.url };
  });
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

function jsonResponse(value, status = 200, serialized) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  });
  return new Response(value === null ? null : (serialized ?? JSON.stringify(value)), { status, headers });
}

function writeJsonResponse(value, status = 200) {
  const { versionChanges: changes = [], ...payload } = value;
  return jsonResponse({ ...payload, versionChanges: changes }, status);
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

function assertOwnerFields(body, allowed, protectedFields = new Set()) {
  if (Object.hasOwn(body, 'version')) fail(400, 'UNKNOWN_FIELD', 'unsupported field: version');
  assertKnownFields(body, allowed, protectedFields);
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
  if (!store || typeof store.get !== 'function' || typeof store.getResources !== 'function'
    || typeof store.list !== 'function' || typeof store.transact !== 'function') {
    throw new TypeError('store must implement get, getResources, list, and transact');
  }
  if (typeof authenticate !== 'function') throw new TypeError('authenticate must be a function');
  if (typeof origin !== 'string' || !origin) throw new TypeError('origin is required');
  const accountOrigin = parseHttpsOrigin(origin, 'origin').origin;
  if (typeof now !== 'function') throw new TypeError('now must be a function');
  if (typeof createId !== 'function') throw new TypeError('createId must be a function');

  const accountKey = (accountId) => `account-profile:${accountId}`;
  const profileKey = (profileId) => `profile:${profileId}`;
  const aliasKey = (slug) => `alias:${slug}`;
  const seriesAliasKey = (profileId, slug) => `series-alias:${profileId}:${slug}`;
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
    if (!isCreatorStateId(result)) throw new TypeError('createId must return an opaque identifier');
    return result;
  }

  async function requestContextFor(request) {
    let context;
    try {
      context = await authenticate(request);
    } catch {
      fail(503, 'AUTH_UNAVAILABLE', 'authentication is temporarily unavailable');
    }
    if (isRecord(context) && Object.hasOwn(context, 'session') && Object.hasOwn(context, 'principal')) return context;
    fail(503, 'AUTH_UNAVAILABLE', 'authentication returned an invalid request context');
  }

  function principalFromContext(context) {
    const validContext = isRecord(context) && Object.hasOwn(context, 'session') && Object.hasOwn(context, 'principal');
    const principal = validContext ? context.principal : undefined;
    if (!isRecord(principal)) fail(503, 'AUTH_UNAVAILABLE', 'authentication returned an invalid principal');
    if (principal.state === 'anonymous') fail(401, 'AUTH_REQUIRED', 'sign in is required');
    if (principal.state === 'disabled') return {
      state: 'disabled',
      ...(typeof principal.accountId === 'string' && principal.accountId.trim() ? { accountId: principal.accountId } : {}),
      ...(typeof principal.isAdmin === 'boolean' ? { isAdmin: principal.isAdmin } : {}),
    };
    if (principal.state === 'unavailable') fail(503, 'AUTH_UNAVAILABLE', 'authentication is temporarily unavailable');
    if (principal.state !== 'authenticated' || typeof principal.accountId !== 'string' || !principal.accountId
      || typeof principal.csrfToken !== 'string' || typeof principal.isAdmin !== 'boolean') {
      fail(503, 'AUTH_UNAVAILABLE', 'authentication returned an invalid principal');
    }
    return principal;
  }

  function requireAuthenticatedContext(context) {
    const principal = principalFromContext(context);
    if (principal.state === 'disabled') fail(403, 'ACCOUNT_DISABLED', 'this account is disabled');
    if (principal.state !== 'authenticated') fail(503, 'AUTH_UNAVAILABLE', 'authentication is temporarily unavailable');
    return principal;
  }

  function requireAdminContext(context) {
    const principal = requireAuthenticatedContext(context);
    requireAdmin(principal);
    return principal;
  }

  function requireAdmin(principal) {
    if (principal.isAdmin !== true) fail(403, 'ADMIN_REQUIRED', 'administrator access is required');
  }

  function requireCreatorPageSessionBinding(request, principal) {
    const failure = creatorPageSessionBindingFailureForRequest(request.headers.get('x-creator-page-binding'), principal);
    if (!failure) return;
    const message = failure.error === 'INVALID_CONTEXT' ? 'creator page context is invalid'
      : failure.error === 'SESSION_CONTEXT_CHANGED' ? 'creator page session context changed'
        : failure.error === 'ACCOUNT_DISABLED' ? 'this account is disabled' : 'authentication is temporarily unavailable';
    fail(failure.status, failure.error, message);
  }

  function requireWriteRequest(request, principal) {
    if (request.headers.get('origin') !== accountOrigin || request.headers.get('x-csrf-token') !== principal.csrfToken) {
      fail(403, 'CSRF_REJECTED', 'request origin or CSRF token is invalid');
    }
    if (new URL(request.url).pathname.startsWith('/api/creador/')) {
      requireCreatorPageSessionBinding(request, principal);
      if (request.headers.get(CREATOR_CONTRACT_HEADER) !== CREATOR_CONTRACT_VERSION) {
        fail(409, 'CREATOR_CONTRACT_OBSOLETE', 'this creator page must be reloaded before it can save');
      }
    }
  }

  function requireMethod(request, method) {
    if (request.method !== method) fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
  }

  async function ownerProfile(principal) {
    const owner = await store.get(accountKey(principal.accountId));
    if (!owner) return { owner: null, profile: null };
    if (typeof owner.profileId !== 'string' || !owner.profileId) fail(503, 'INVALID_OWNER', 'profile ownership mapping is malformed');
    const row = await store.get(profileKey(owner.profileId));
    if (!row) fail(503, 'INVALID_PROFILE', 'profile ownership mapping points to missing data');
    const profile = readCreatorStateOrFail(row, owner.profileId);
    return { owner, profile };
  }

  async function getRequiredOwnerProfile(principal) {
    const result = await ownerProfile(principal);
    if (!result.profile) fail(404, 'PROFILE_NOT_FOUND', 'profile does not exist');
    return result.profile;
  }

  function storedVersion(value, entity, { legacyZero = false } = {}) {
    if (value === undefined && legacyZero) return 0;
    if (!Number.isSafeInteger(value) || value < 0) fail(503, `INVALID_${entity.toUpperCase()}`, `${entity} version is malformed`);
    return value;
  }

  function readCreatorStateOrFail(row, expectedId) {
    try {
      return readCreatorState(row, expectedId);
    } catch (error) {
      if (error instanceof CreatorStateError) fail(error.status, error.code, error.message);
      throw error;
    }
  }

  function creatorStateFits(candidate) {
    try {
      return assertCreatorStateFits(candidate);
    } catch (error) {
      if (error instanceof CreatorStateError) fail(error.status, error.code, error.message);
      throw error;
    }
  }

  function requireCreatorVersion(body, profile, { allowNull = false } = {}) {
    if (!Object.hasOwn(body, 'creatorVersion')) {
      fail(400, 'CREATOR_VERSION_REQUIRED', 'creatorVersion is required');
    }
    if (allowNull && profile === null && body.creatorVersion === null) return null;
    const expected = validVersion(body.creatorVersion);
    if (!profile || expected !== profile.version) {
      fail(409, 'CREATOR_CONFLICT', 'creator content changed; reload before saving');
    }
    return expected;
  }

  function creatorAck(operation, profileId, creatorVersion, disposition, fields = {}) {
    return { schemaVersion: 2, operation, profileId, creatorVersion, ...fields, disposition };
  }

  function ownerProfileDto(profile) {
    if (!profile) return null;
    const { version: _version, ...dto } = cleanPublicProfile(profile);
    return dto;
  }

  function nextCreatorState(profile, changes) {
    const revision = storedVersion(profile.version, 'creator');
    const candidate = {
      ...profile,
      ...changes,
      version: nextVersion(revision, 'creator'),
      updatedAt: timestamp(),
    };
    return creatorStateFits(candidate);
  }

  async function commitCreatorState(profile, candidate, { checks = [], puts = [], deletes = [], code = 'CREATOR_CONFLICT' } = {}) {
    creatorStateFits(candidate);
    const ok = await store.transact({
      checks: [{ key: profileKey(profile.id), version: profile.version }, ...checks],
      puts: [...puts, { key: profileKey(profile.id), value: candidate }],
      deletes,
    });
    if (!ok) fail(409, code, 'creator content or a related record changed while saving');
    return candidate;
  }

  function nextVersion(value, entity) {
    if (value >= Number.MAX_SAFE_INTEGER) fail(409, `${entity.toUpperCase()}_VERSION_EXHAUSTED`, `${entity} version cannot be incremented safely`);
    return value + 1;
  }

  function isValidUrlReservation(reservation, url, { allowOverLimitUniqueId = false } = {}) {
    if (!isRecord(reservation) || reservation.id !== currentUrlReservationId(url)
      || reservation.recordType !== 'urlReservation' || reservation.url !== url
      || !Number.isSafeInteger(reservation.version) || reservation.version < 0) return false;
    if (reservation.status === 'reserved') {
      const resourceIdIsValid = typeof reservation.resourceId === 'string' && reservation.resourceId.length > 0
        && !reservation.resourceId.startsWith('__')
        && (allowOverLimitUniqueId || isCatalogResourceIdWithinLimit(reservation.resourceId));
      return resourceIdIsValid
        && !Object.hasOwn(reservation, 'resourceIds');
    }
    if (reservation.status === 'collision') {
      const ids = reservation.resourceIds;
      return !Object.hasOwn(reservation, 'resourceId') && Array.isArray(ids) && ids.length >= 2
        && ids.every((id) => isCatalogResourceIdWithinLimit(id) && !id.startsWith('__'))
        && new Set(ids).size === ids.length;
    }
    return false;
  }

  function urlReservationCheck(key, reservation) {
    return {
      key,
      version: storedVersion(reservation.version, 'resource', { legacyZero: true }),
      expectedReservation: reservation,
    };
  }

  function creatorResourceChanges(resource, body) {
    const changes = {};
    if (Object.hasOwn(body, 'title')) {
      const title = textField(body.title, 'title');
      if (!title) fail(422, 'INVALID_TITLE', 'title is required');
      changes.title = title;
    }
    if (Object.hasOwn(body, 'url')) {
      const field = resource.recordType === 'event' ? 'registrationUrl' : 'url';
      changes[field] = validateResourceUrl(body.url);
    }
    if (Object.hasOwn(body, 'description')) changes.description = textField(body.description, 'description');
    return changes;
  }

  async function buildCreatorResourceMutation(resource, requestedChanges) {
    const key = `resource:${resource.id}`;
    const before = storedVersion(resource.version, 'resource', { legacyZero: true });
    const changes = Object.fromEntries(Object.entries(requestedChanges)
      .filter(([field, value]) => resource[field] !== value));
    const resourceCheck = { key, version: before };
    if (Object.keys(changes).length === 0) {
      return { resource, before, changed: false, checks: [resourceCheck], puts: [], deletes: [] };
    }

    const updated = { ...resource, ...changes, version: nextVersion(before, 'resource'), updatedAt: timestamp() };
    const urlField = resource.recordType === 'event' ? 'registrationUrl' : 'url';
    const oldUrl = currentResourceUrl(resource);
    if (typeof oldUrl !== 'string') fail(503, 'INVALID_RESOURCE', 'resource URL is malformed');
    const nextUrl = Object.hasOwn(changes, urlField) ? changes[urlField] : undefined;
    if (nextUrl === undefined || nextUrl === oldUrl) {
      return {
        resource: updated,
        before,
        changed: true,
        checks: [resourceCheck],
        puts: [{ key, value: updated }],
        deletes: [],
      };
    }

    const nextKey = currentUrlKey(nextUrl);
    const reservation = await store.get(nextKey);
    const previousKey = currentUrlKey(oldUrl);
    const previousReservation = await store.get(previousKey);
    if (nextKey === previousKey) fail(422, 'INVALID_URL', 'current URL could not be changed');

    if (previousReservation && !isValidUrlReservation(previousReservation, oldUrl)) {
      fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation is malformed');
    }
    if (reservation && !isValidUrlReservation(reservation, nextUrl)) {
      fail(503, 'URL_INDEX_MISMATCH', 'destination URL reservation is malformed');
    }
    if (reservation && (reservation.status !== 'reserved' || reservation.resourceId !== resource.id)) {
      fail(409, 'URL_TAKEN', 'another resource already uses this URL');
    }

    const nextReservationRecord = currentUrlReservation(nextUrl, resource.id);
    const checks = [resourceCheck];
    if (reservation) checks.push(urlReservationCheck(nextKey, reservation));
    else checks.push({ key: nextKey, version: null });
    const puts = [{ key, value: updated }, { key: nextKey, value: nextReservationRecord }];
    const deletes = [];

    if (!previousReservation) {
      checks.push({ key: previousKey, version: null });
    } else {
      checks.push(urlReservationCheck(previousKey, previousReservation));
      if (previousReservation.status === 'reserved') {
        if (previousReservation.resourceId === resource.id) deletes.push(previousKey);
      } else if (previousReservation.resourceIds.includes(resource.id)) {
        const remainingIds = previousReservation.resourceIds.filter((id) => id !== resource.id);
        const remaining = remainingIds.length === 1
          ? currentUrlReservation(oldUrl, remainingIds[0])
          : currentUrlCollision(oldUrl, remainingIds);
        puts.push({ key: previousKey, value: remaining });
      }
    }
    return {
      resource: updated,
      before,
      changed: true,
      checks,
      puts,
      deletes,
    };
  }

  function seriesFromState(profile) {
    return Object.entries(profile.series).map(([id, item]) => ({
      id,
      name: item.name,
      slug: item.slug,
      ...(Object.hasOwn(item, 'description') ? { description: item.description } : {}),
      chapters: [...item.chapters],
    })).sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  }

  function ownerSeriesMap(profile) {
    return Object.fromEntries(Object.entries(profile.series).map(([id, item]) => [id, {
      name: item.name,
      slug: item.slug,
      ...(Object.hasOwn(item, 'description') ? { description: item.description } : {}),
      chapters: [...item.chapters],
    }]));
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

  async function readSeriesAlias(profileId, slug) {
    const alias = await store.get(seriesAliasKey(profileId, slug));
    return alias ? validateSeriesAlias(alias, profileId, slug) : null;
  }

  function assertResourceBatch(resources, ids) {
    const expected = new Set(ids);
    if (!(resources instanceof Map) || [...resources.keys()].some((id) => !expected.has(id))) {
      fail(503, 'INVALID_RESOURCE_BATCH', 'resource batch read returned an invalid result');
    }
    return resources;
  }

  async function resourcesById(ids) {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return new Map();
    const resources = assertResourceBatch(await store.getResources(uniqueIds), uniqueIds);
    for (const id of uniqueIds) {
      const resource = resources.get(id);
      if (!resource || resource.id !== id) fail(503, 'MISSING_RESOURCE', 'a referenced resource is missing or malformed');
      if (!isCatalogResource(resource)) fail(503, 'INVALID_RESOURCE', 'a referenced catalog row is not a resource');
    }
    return resources;
  }

  function creatorPlacement(profile, id) {
    const placement = profile.placements[id];
    if (!placement) return null;
    return { id, resourceId: placement.resourceId, selectedForDirectory: placement.selectedForDirectory };
  }

  function orderedPlacementIds(profile) {
    return [...profile.order.featured, ...profile.order.ordinary];
  }

  function resourceProjectionFacts(resource) {
    if (!resource || !isCatalogResource(resource)) fail(503, 'INVALID_RESOURCE', 'a referenced catalog row is not a resource');
    if (typeof resource.title !== 'string'
      || (Object.hasOwn(resource, 'description') && typeof resource.description !== 'string')
      || (Object.hasOwn(resource, 'hidden') && typeof resource.hidden !== 'boolean')) {
      fail(503, 'INVALID_RESOURCE', 'resource presentation or visibility fields are malformed');
    }
    const url = currentResourceUrl(resource);
    if (typeof url !== 'string') fail(503, 'INVALID_RESOURCE', 'resource URL is malformed');
    try { validateCatalogUrl(url); } catch { fail(503, 'INVALID_RESOURCE', 'resource URL is malformed'); }
    return {
      url,
      version: storedVersion(resource.version ?? 0, 'resource', { legacyZero: true }),
      directoryApproval: approvalState(resource),
    };
  }

  function projectCreatorLink(profile, placementIdValue, resource, {
    includeHiddenResources = false,
    publicTags = false,
    profileSlug = profile.slug,
  } = {}) {
    const facts = resourceProjectionFacts(resource);
    if (resource.hidden === true && !includeHiddenResources) return null;
    const placement = creatorPlacement(profile, placementIdValue);
    if (!placement) fail(503, 'INVALID_CREATOR_STATE', 'order references a missing placement');
    const featured = profile.order.featured.includes(placementIdValue);
    const sequence = featured ? profile.order.featured : profile.order.ordinary;
    const tags = [];
    for (const [seriesId, series] of Object.entries(profile.series)) {
      const index = series.chapters.indexOf(placementIdValue);
      if (index < 0) continue;
      tags.push(publicTags
        ? { seriesId, position: index + 1, name: series.name, href: `/c/${encodeURIComponent(profileSlug)}/series/${encodeURIComponent(series.slug)}/` }
        : { seriesId, position: index + 1 });
    }
    return {
      placementId: placementIdValue,
      resourceId: resource.id,
      title: resource.title,
      url: facts.url,
      ...(typeof resource.description === 'string' ? { description: resource.description } : {}),
      featured,
      position: sequence.indexOf(placementIdValue) + 1,
      selectedForDirectory: placement.selectedForDirectory,
      ...(includeHiddenResources ? { hidden: resource.hidden === true } : {}),
      series: tags,
      directoryApproval: facts.directoryApproval,
      resourceVersion: facts.version,
    };
  }

  async function profileLinks(profile, {
    includeHiddenResources = false,
    publicTags = false,
    profileSlug = profile.slug,
  } = {}) {
    const ids = orderedPlacementIds(profile);
    const resources = await resourcesById(ids.map((id) => profile.placements[id].resourceId));
    const links = [];
    for (const id of ids) {
      const placement = profile.placements[id];
      const link = projectCreatorLink(profile, id, resources.get(placement.resourceId), {
        includeHiddenResources, publicTags, profileSlug,
      });
      if (link) links.push(link);
    }
    return links;
  }

  function ownerResource(resource, { metadataEditable, reincludeAllowed }) {
    const facts = resourceProjectionFacts(resource);
    return {
      id: resource.id,
      version: facts.version,
      title: resource.title,
      url: facts.url,
      ...(typeof resource.description === 'string' ? { description: resource.description } : {}),
      hidden: resource.hidden === true,
      directoryApproval: facts.directoryApproval,
      metadataEditable,
      reincludeAllowed,
    };
  }

  async function creatorEditor(principal) {
    const { profile } = await ownerProfile(principal);
    if (!profile) return {
      schemaVersion: 2, creatorVersion: null, profile: null, resources: [], placements: {},
      order: { featured: [], ordinary: [] }, series: {}, claims: [],
    };

    const activeIds = orderedPlacementIds(profile);
    const activeResources = new Set(activeIds.map((id) => profile.placements[id].resourceId));
    const editorRefs = await store.list(`editor:${profile.id}:`);
    const refsByResource = new Map();
    for (const row of editorRefs) {
      const reference = row.value;
      if (!reference || reference.recordType !== 'editorReference' || reference.profileId !== profile.id
        || typeof reference.resourceId !== 'string' || !isCatalogResourceIdWithinLimit(reference.resourceId)
        || !Number.isSafeInteger(reference.version) || reference.version < 0) {
        fail(503, 'INVALID_EDITOR_REFERENCE', 'editor reference is malformed');
      }
      refsByResource.set(reference.resourceId, reference);
    }
    const allResourceIds = [...activeResources, ...refsByResource.keys()];
    const resourcesByResourceId = await resourcesById(allResourceIds);
    const resources = [];
    for (const [id, resource] of resourcesByResourceId) {
      const authorized = resource.directoryControl === 'creator' && resource.editorProfileId === profile.id;
      const retainedReference = refsByResource.has(id);
      if (!activeResources.has(id) && !(authorized && retainedReference)) continue;
      resources.push(ownerResource(resource, {
        metadataEditable: authorized,
        reincludeAllowed: !activeResources.has(id) && authorized && retainedReference,
      }));
    }
    resources.sort((left, right) => left.id.localeCompare(right.id));

    const claimRefs = await store.list(`claim-ref:${profile.id}:`);
    const claims = [];
    for (const row of claimRefs) {
      const reference = row.value;
      if (!reference || typeof reference.id !== 'string') fail(503, 'INVALID_CLAIM_REFERENCE', 'claim reference is malformed');
      const claim = await store.get(claimKey(reference.id));
      if (!claim) fail(503, 'MISSING_CLAIM', 'claim reference points to missing claim data');
      if (claim.profileId !== profile.id) continue;
      if (claim.version !== undefined && (!Number.isSafeInteger(claim.version) || claim.version < 0)) {
        fail(503, 'INVALID_CLAIM', 'claim version is malformed');
      }
      const claimResources = storedClaimResources(claim);
      claims.push({
        id: claim.id,
        resourceIds: Array.isArray(claim.resourceIds) ? [...claim.resourceIds] : [],
        ...(Number.isSafeInteger(claim.version) && claim.version >= 1 ? { version: claim.version } : {}),
        ...(claimResources ? { resources: claimResources } : {}),
        ...(typeof claim.sourceId === 'string' ? { sourceId: claim.sourceId } : {}),
        ...(typeof claim.status === 'string' ? { status: claim.status } : {}),
        ...(Number.isSafeInteger(claim.createdAt) ? { createdAt: claim.createdAt } : {}),
        ...(typeof claim.evidence === 'string' ? { evidence: claim.evidence } : {}),
      });
    }
    return {
      schemaVersion: 2,
      creatorVersion: profile.version,
      profile: ownerProfileDto(profile),
      resources,
      placements: structuredClone(profile.placements),
      order: structuredClone(profile.order),
      series: ownerSeriesMap(profile),
      claims,
    };
  }

  async function saveProfile(principal, body) {
    assertOwnerFields(body, new Set([
      'creatorVersion', 'displayName', 'slug', 'city', 'country', 'bio', 'programs', 'socials',
    ]));
    const { profile } = await ownerProfile(principal);
    requireCreatorVersion(body, profile, { allowNull: true });
    const fields = validateProfileFields(body, profile);
    if (!profile) {
      const id = newId();
      const created = creatorStateFits({
        recordType: 'creatorState', schemaVersion: 2, id, version: 1,
        ...fields, published: false, hidden: false,
        placements: {}, order: { featured: [], ordinary: [] }, series: {},
        createdAt: timestamp(), updatedAt: timestamp(),
      });
      const alias = created.slug ? await store.get(aliasKey(created.slug)) : null;
      if (alias) fail(409, 'SLUG_TAKEN', 'slug is already reserved');
      const checks = [
        { key: accountKey(principal.accountId), version: null },
        { key: profileKey(id), version: null },
        ...(created.slug ? [{ key: aliasKey(created.slug), version: null }] : []),
      ];
      const puts = [
        { key: accountKey(principal.accountId), value: { recordType: 'accountProfile', profileId: id, version: 1 } },
        { key: profileKey(id), value: created },
        ...(created.slug ? [{ key: aliasKey(created.slug), value: { recordType: 'profileAlias', slug: created.slug, profileId: id, version: 1 } }] : []),
      ];
      if (!await store.transact({ checks, puts })) {
        fail(409, 'PROFILE_CONFLICT', 'profile ownership or slug changed while saving');
      }
      return creatorAck('save-profile', id, created.version, 'created');
    }

    if (profile.published === true && (!fields.displayName.trim() || !fields.slug)) {
      fail(422, 'PROFILE_INCOMPLETE', 'a published profile must keep its display name and URL name');
    }
    const profileFields = ['displayName', 'slug', 'city', 'country', 'bio', 'programs', 'socials'];
    const changed = profileFields.some((field) => JSON.stringify(fields[field]) !== JSON.stringify(profile[field]));
    if (!changed) {
      if (!await store.transact({ checks: [{ key: profileKey(profile.id), version: profile.version }] })) {
        fail(409, 'PROFILE_CONFLICT', 'profile changed while checking the unchanged values');
      }
      return creatorAck('save-profile', profile.id, profile.version, 'unchanged');
    }

    const slugChanged = fields.slug !== profile.slug;
    let aliasToCreate;
    if (slugChanged && fields.slug) {
      const alias = await store.get(aliasKey(fields.slug));
      if (alias && alias.profileId !== profile.id) fail(409, 'SLUG_TAKEN', 'slug is already reserved');
      if (!alias) aliasToCreate = { recordType: 'profileAlias', slug: fields.slug, profileId: profile.id, version: 1 };
    }
    const updated = nextCreatorState(profile, fields);
    const checks = aliasToCreate ? [{ key: aliasKey(fields.slug), version: null }] : [];
    const puts = aliasToCreate ? [{ key: aliasKey(fields.slug), value: aliasToCreate }] : [];
    await commitCreatorState(profile, updated, { checks, puts, code: 'PROFILE_CONFLICT' });
    return creatorAck('save-profile', profile.id, updated.version, 'saved');
  }

  async function listCreatorSeries(principal) {
    const profile = await getRequiredOwnerProfile(principal);
    return { schemaVersion: 2, profileId: profile.id, creatorVersion: profile.version, series: ownerSeriesMap(profile) };
  }

  async function readCreatorSeries(context) {
    return listCreatorSeries(requireAuthenticatedContext(context));
  }

  function validateSeriesInput(body, previous = {}) {
    const next = { ...previous };
    if (Object.hasOwn(body, 'name')) {
      next.name = textField(body.name, 'name');
      if (!next.name.trim()) fail(422, 'INVALID_NAME', 'name is required');
    } else if (!previous.name) fail(422, 'INVALID_NAME', 'name is required');
    if (Object.hasOwn(body, 'slug')) next.slug = normalizeSlug(body.slug);
    else if (!previous.slug) fail(422, 'INVALID_SLUG', 'slug is required');
    if (Object.hasOwn(body, 'description')) next.description = textField(body.description, 'description');
    return next;
  }

  async function createCreatorSeries(principal, body) {
    assertOwnerFields(body, new Set(['name', 'slug', 'description', 'creatorVersion']));
    const profile = await getRequiredOwnerProfile(principal);
    requireCreatorVersion(body, profile);
    const fields = validateSeriesInput(body);
    const alias = await readSeriesAlias(profile.id, fields.slug);
    if (alias) fail(409, 'SERIES_SLUG_TAKEN', 'series slug is already reserved');

    const id = newId();
    const moment = timestamp();
    const item = {
      name: fields.name,
      slug: fields.slug,
      ...(Object.hasOwn(fields, 'description') ? { description: fields.description } : {}),
      chapters: [], createdAt: moment, updatedAt: moment,
    };
    const candidate = nextCreatorState(profile, { series: { ...profile.series, [id]: item } });
    await commitCreatorState(profile, candidate, {
      checks: [{ key: seriesAliasKey(profile.id, fields.slug), version: null }],
      puts: [{ key: seriesAliasKey(profile.id, fields.slug), value: {
        recordType: 'seriesAlias', seriesId: id, profileId: profile.id, slug: fields.slug, version: 1,
      } }],
      code: 'SERIES_CONFLICT',
    });
    return creatorAck('create-series', profile.id, candidate.version, 'created', { seriesId: id });
  }

  async function patchCreatorSeries(principal, id, body) {
    assertOwnerFields(body, new Set(['name', 'slug', 'description', 'creatorVersion']));
    const profile = await getRequiredOwnerProfile(principal);
    const current = profile.series[id];
    if (!current) fail(404, 'SERIES_NOT_FOUND', 'series does not belong to this profile');
    requireCreatorVersion(body, profile);
    if (!['name', 'slug', 'description'].some((field) => Object.hasOwn(body, field))) {
      fail(422, 'EMPTY_UPDATE', 'series metadata fields are required');
    }
    const fields = validateSeriesInput(body, current);
    const changed = ['name', 'slug', 'description'].some((field) => fields[field] !== current[field]);
    if (!changed) {
      if (!await store.transact({ checks: [{ key: profileKey(profile.id), version: profile.version }] })) {
        fail(409, 'SERIES_CONFLICT', 'creator content changed while checking the unchanged series');
      }
      return creatorAck('edit-series', profile.id, profile.version, 'unchanged', { seriesId: id });
    }

    const checks = [];
    const puts = [];
    if (fields.slug !== current.slug) {
      const alias = await readSeriesAlias(profile.id, fields.slug);
      if (alias && alias.seriesId !== id) fail(409, 'SERIES_SLUG_TAKEN', 'series slug is already reserved');
      if (!alias) {
        checks.push({ key: seriesAliasKey(profile.id, fields.slug), version: null });
        puts.push({ key: seriesAliasKey(profile.id, fields.slug), value: {
          recordType: 'seriesAlias', seriesId: id, profileId: profile.id, slug: fields.slug, version: 1,
        } });
      }
    }
    const updatedSeries = { ...current, ...fields, chapters: [...current.chapters], updatedAt: timestamp() };
    const candidate = nextCreatorState(profile, { series: { ...profile.series, [id]: updatedSeries } });
    await commitCreatorState(profile, candidate, { checks, puts, code: 'SERIES_CONFLICT' });
    return creatorAck('edit-series', profile.id, candidate.version, 'saved', { seriesId: id });
  }

  async function deleteCreatorSeries(principal, id, body) {
    assertOwnerFields(body, new Set(['creatorVersion']));
    const profile = await getRequiredOwnerProfile(principal);
    if (!Object.hasOwn(profile.series, id)) fail(404, 'SERIES_NOT_FOUND', 'series does not belong to this profile');
    requireCreatorVersion(body, profile);
    const series = { ...profile.series };
    delete series[id];
    const candidate = nextCreatorState(profile, { series });
    await commitCreatorState(profile, candidate, { code: 'SERIES_CONFLICT' });
    return creatorAck('delete-series', profile.id, candidate.version, 'deleted', { seriesId: id });
  }

  async function changeSeriesChapter(principal, seriesId, chapterId, body, operation) {
    assertOwnerFields(body, new Set(['creatorVersion']));
    const profile = await getRequiredOwnerProfile(principal);
    const current = profile.series[seriesId];
    if (!current) fail(404, 'SERIES_NOT_FOUND', 'series does not belong to this profile');
    if (!Object.hasOwn(profile.placements, chapterId)) fail(404, 'PLACEMENT_NOT_FOUND', 'chapter does not belong to this profile');
    requireCreatorVersion(body, profile);
    const present = current.chapters.includes(chapterId);
    const adding = operation === 'add';
    if (present === adding) {
      if (!await store.transact({ checks: [{ key: profileKey(profile.id), version: profile.version }] })) {
        fail(409, 'SERIES_CONFLICT', 'creator content changed while checking the chapter');
      }
      return creatorAck(adding ? 'add-chapter' : 'remove-chapter', profile.id, profile.version,
        'unchanged', { seriesId, placementId: chapterId });
    }
    const chapters = adding ? [...current.chapters, chapterId] : current.chapters.filter((id) => id !== chapterId);
    const series = { ...profile.series, [seriesId]: { ...current, chapters, updatedAt: timestamp() } };
    const candidate = nextCreatorState(profile, { series });
    await commitCreatorState(profile, candidate, { code: 'SERIES_CONFLICT' });
    return creatorAck(adding ? 'add-chapter' : 'remove-chapter', profile.id, candidate.version,
      adding ? 'added' : 'removed', { seriesId, placementId: chapterId });
  }

  async function publishProfile(principal, body) {
    assertOwnerFields(body, new Set(['creatorVersion']));
    const profile = await getRequiredOwnerProfile(principal);
    requireCreatorVersion(body, profile);
    if (!profile.displayName.trim() || !profile.slug) fail(422, 'PROFILE_INCOMPLETE', 'save a name and URL name before publishing');
    if (profile.published) {
      if (!await store.transact({ checks: [{ key: profileKey(profile.id), version: profile.version }] })) {
        fail(409, 'PROFILE_CONFLICT', 'creator content changed while checking publication');
      }
      return creatorAck('publish-profile', profile.id, profile.version, 'unchanged');
    }
    const candidate = nextCreatorState(profile, { published: true });
    await commitCreatorState(profile, candidate, { code: 'PROFILE_CONFLICT' });
    return creatorAck('publish-profile', profile.id, candidate.version, 'published');
  }

  async function readCreatorEditor(context) {
    return creatorEditor(requireAuthenticatedContext(context));
  }

  function activePlacementId(profile, resourceId) {
    return Object.entries(profile.placements).find(([, placement]) => placement.resourceId === resourceId)?.[0] ?? null;
  }

  function appendPlacement(profile, resourceId, selectedForDirectory = true) {
    const id = placementId(profile.id, resourceId);
    if (Object.hasOwn(profile.placements, id)) {
      const existing = profile.placements[id];
      if (existing.resourceId !== resourceId) fail(503, 'INVALID_CREATOR_STATE', 'placement identity is inconsistent');
      return { id, candidate: null };
    }
    const placements = { ...profile.placements, [id]: { resourceId, selectedForDirectory } };
    const candidate = nextCreatorState(profile, {
      placements,
      order: { featured: [...profile.order.featured], ordinary: [...profile.order.ordinary, id] },
    });
    return { id, candidate };
  }

  async function checkCreatorState(profile, checks = [], code = 'CREATOR_CONFLICT') {
    if (!await store.transact({ checks: [{ key: profileKey(profile.id), version: profile.version }, ...checks] })) {
      fail(409, code, 'creator content or a related record changed while saving');
    }
  }

  async function attachExistingResource(profile, resource, {
    selectedForDirectory = true,
    checks = [],
    operation = 'add-link',
    disposition = 'resource-reused',
  } = {}) {
    if (!isCatalogResource(resource)) fail(503, 'INVALID_RESOURCE', 'a catalog control row cannot be attached as a resource');
    const resourceVersion = storedVersion(resource.version ?? 0, 'resource', { legacyZero: true });
    const activeId = activePlacementId(profile, resource.id);
    const reservationChecks = [
      { key: `resource:${resource.id}`, version: resourceVersion },
      ...checks,
    ];
    if (activeId) {
      await checkCreatorState(profile, reservationChecks, 'LINK_CONFLICT');
      return creatorAck(operation, profile.id, profile.version, 'already-present', {
        resourceId: resource.id, placementId: activeId, resourceVersion,
      });
    }
    const { id, candidate } = appendPlacement(profile, resource.id, selectedForDirectory);
    await commitCreatorState(profile, candidate, {
      checks: reservationChecks,
      code: 'LINK_CONFLICT',
    });
    return creatorAck(operation, profile.id, candidate.version, disposition, {
      resourceId: resource.id, placementId: id, resourceVersion,
    });
  }

  async function attachReservedUrl(profile, url, reservation, {
    selectedForDirectory = true,
    conflictOnStale = false,
  } = {}) {
    if (!isValidUrlReservation(reservation, url, { allowOverLimitUniqueId: true })) {
      fail(conflictOnStale ? 409 : 503,
        conflictOnStale ? 'URL_CONFLICT' : 'URL_INDEX_MISMATCH',
        'URL reservation is malformed or no longer matches its resource');
    }
    if (reservation.status === 'collision') fail(409, 'URL_COLLISION', 'this URL needs administrative review');
    requireCatalogResourceIdWithinLimit(reservation.resourceId);
    const resource = await store.get(`resource:${reservation.resourceId}`);
    if (!resource || resource.id !== reservation.resourceId || !isCatalogResource(resource)
      || currentResourceUrl(resource) !== url) {
      fail(conflictOnStale ? 409 : 503,
        conflictOnStale ? 'URL_CONFLICT' : 'URL_INDEX_MISMATCH',
        'URL reservation is malformed or no longer matches its resource');
    }
    return attachExistingResource(profile, resource, {
      selectedForDirectory,
      checks: [urlReservationCheck(currentUrlKey(url), reservation)],
      operation: 'add-link',
      disposition: 'resource-reused',
    });
  }

  async function readdEditableResource(principal, body) {
    assertOwnerFields(body, new Set(['resourceId', 'resourceVersion', 'creatorVersion']));
    const profile = await getRequiredOwnerProfile(principal);
    requireCreatorVersion(body, profile);
    if (typeof body.resourceId !== 'string' || !body.resourceId) {
      fail(422, 'INVALID_RESOURCE_ID', 'resourceId must identify an editable resource');
    }
    requireCatalogResourceIdWithinLimit(body.resourceId);
    const expectedResourceVersion = validVersion(body.resourceVersion);
    const resource = await store.get(`resource:${body.resourceId}`);
    if (!resource || resource.id !== body.resourceId || !isCatalogResource(resource)) fail(404, 'RESOURCE_NOT_FOUND', 'resource does not exist');
    const resourceVersion = storedVersion(resource.version ?? 0, 'resource', { legacyZero: true });
    if (expectedResourceVersion !== resourceVersion) fail(409, 'RESOURCE_CONFLICT', 'resource changed; reload before re-adding it');
    if (resource.editorProfileId !== profile.id || resource.directoryControl !== 'creator') {
      fail(403, 'RESOURCE_EDIT_FORBIDDEN', 'this profile does not edit the resource');
    }
    const referenceKey = editorKey(profile.id, resource.id);
    const reference = await store.get(referenceKey);
    if (!reference || reference.recordType !== 'editorReference' || reference.profileId !== profile.id
      || reference.resourceId !== resource.id || !Number.isSafeInteger(reference.version) || reference.version < 0) {
      fail(403, 'RESOURCE_EDIT_FORBIDDEN', 'this profile does not edit the resource');
    }
    const url = currentResourceUrl(resource);
    try { validateCatalogUrl(url); } catch { fail(503, 'INVALID_RESOURCE', 'resource URL is malformed'); }
    return attachExistingResource(profile, resource, {
      selectedForDirectory: true,
      checks: [{ key: referenceKey, version: reference.version }],
      operation: 'reinclude-link',
      disposition: 'attached',
    });
  }

  async function referenceResource(principal, body) {
    assertOwnerFields(body, new Set(['resourceId', 'url', 'creatorVersion', 'selectedForDirectory']));
    const profile = await getRequiredOwnerProfile(principal);
    requireCreatorVersion(body, profile);
    if (typeof body.resourceId !== 'string' || !body.resourceId) fail(422, 'INVALID_RESOURCE_ID', 'resourceId must identify a catalog resource');
    requireCatalogResourceIdWithinLimit(body.resourceId);
    const url = validateResourceUrl(body.url);
    if (body.selectedForDirectory !== undefined && typeof body.selectedForDirectory !== 'boolean') {
      fail(422, 'INVALID_SELECTION', 'selectedForDirectory must be boolean');
    }
    const resource = await store.get(`resource:${body.resourceId}`);
    if (!resource || resource.id !== body.resourceId || !isCatalogResource(resource)) fail(404, 'RESOURCE_NOT_FOUND', 'resource does not exist');
    const currentUrl = currentResourceUrl(resource);
    try { validateResourceUrl(currentUrl); } catch { fail(503, 'INVALID_RESOURCE', 'resource URL is malformed'); }
    if (currentUrl !== url) fail(409, 'RESOURCE_CONFLICT', 'resource changed; reload before referencing catalog content');
    const reservationKey = currentUrlKey(url);
    const reservation = await store.get(reservationKey);
    if (!reservation || !isValidUrlReservation(reservation, url)) fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation does not match the selected resource');
    if (reservation.status === 'collision') fail(409, 'URL_COLLISION', 'this URL needs administrative review');
    if (reservation.resourceId !== resource.id) fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation does not match the selected resource');
    return attachExistingResource(profile, resource, {
      selectedForDirectory: body.selectedForDirectory ?? true,
      checks: [urlReservationCheck(reservationKey, reservation)],
      operation: 'reference-link',
      disposition: 'attached',
    });
  }

  async function addLink(principal, body) {
    if (Object.hasOwn(body, 'resourceId') || Object.hasOwn(body, 'resourceVersion')) return readdEditableResource(principal, body);
    assertOwnerFields(body, new Set(['creatorVersion', 'title', 'url', 'description', 'selectedForDirectory']));
    const profile = await getRequiredOwnerProfile(principal);
    requireCreatorVersion(body, profile);
    const title = textField(body.title, 'title');
    if (!title.trim()) fail(422, 'INVALID_TITLE', 'title is required');
    const url = validateResourceUrl(body.url);
    const description = body.description === undefined ? '' : textField(body.description, 'description');
    if (body.selectedForDirectory !== undefined && typeof body.selectedForDirectory !== 'boolean') {
      fail(422, 'INVALID_SELECTION', 'selectedForDirectory must be boolean');
    }
    const selectedForDirectory = body.selectedForDirectory ?? true;
    const reservationKey = currentUrlKey(url);
    const reservation = await store.get(reservationKey);
    if (reservation) return attachReservedUrl(profile, url, reservation, { selectedForDirectory });

    const resourceId = `resource-${newId()}`;
    const resource = {
      id: resourceId, title, url, description, order: 0, featured: false,
      published: false, hidden: false, approvalRevoked: false,
      directoryControl: 'creator', editorProfileId: profile.id, autoSync: false, version: 1,
    };
    const { id, candidate } = appendPlacement(profile, resourceId, selectedForDirectory);
    const key = `resource:${resourceId}`;
    const editKey = editorKey(profile.id, resourceId);
    try {
      await commitCreatorState(profile, candidate, {
        checks: [
          { key: reservationKey, version: null },
          { key, version: null },
          { key: editKey, version: null },
        ],
        puts: [
          { key: reservationKey, value: currentUrlReservation(url, resourceId) },
          { key, value: resource },
          { key: editKey, value: { recordType: 'editorReference', profileId: profile.id, resourceId, version: 1 } },
        ],
        code: 'LINK_CONFLICT',
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'LINK_CONFLICT') throw error;
      const latestReservation = await store.get(reservationKey);
      if (latestReservation) return attachReservedUrl(profile, url, latestReservation, { selectedForDirectory, conflictOnStale: true });
      throw error;
    }
    return creatorAck('add-link', profile.id, candidate.version, 'resource-created', {
      resourceId, placementId: id, resourceVersion: resource.version,
    });
  }

  async function editLink(principal, id, body) {
    const fields = new Set(['creatorVersion', 'resourceVersion', 'title', 'url', 'description', 'featured', 'selectedForDirectory']);
    assertOwnerFields(body, fields);
    const profile = await getRequiredOwnerProfile(principal);
    const placement = profile.placements[id];
    if (!placement) fail(404, 'PLACEMENT_NOT_FOUND', 'placement does not belong to this profile');
    requireCreatorVersion(body, profile);
    const resource = await store.get(`resource:${placement.resourceId}`);
    if (!resource || resource.id !== placement.resourceId || !isCatalogResource(resource)) {
      fail(503, 'MISSING_RESOURCE', 'placement points to missing resource data');
    }
    const resourceVersion = storedVersion(resource.version ?? 0, 'resource', { legacyZero: true });
    const metadataFields = ['title', 'url', 'description'];
    const includesMetadata = metadataFields.some((field) => Object.hasOwn(body, field));
    if (includesMetadata) {
      if (body.resourceVersion === undefined) fail(400, 'RESOURCE_VERSION_REQUIRED', 'resourceVersion is required for metadata changes');
      if (validVersion(body.resourceVersion) !== resourceVersion) fail(409, 'RESOURCE_CONFLICT', 'resource changed; reload before saving');
      if (resource.editorProfileId !== profile.id || resource.directoryControl !== 'creator') {
        fail(403, 'RESOURCE_EDIT_FORBIDDEN', 'this profile does not edit the resource');
      }
    } else if (Object.hasOwn(body, 'resourceVersion')) {
      validVersion(body.resourceVersion);
      if (body.resourceVersion !== resourceVersion) fail(409, 'RESOURCE_CONFLICT', 'resource changed; reload before saving');
    }
    const resourceChanges = creatorResourceChanges(resource, body);
    const resourceMutation = await buildCreatorResourceMutation(resource, resourceChanges);
    const options = {};
    for (const field of ['featured', 'selectedForDirectory']) {
      if (!Object.hasOwn(body, field)) continue;
      if (typeof body[field] !== 'boolean') fail(422, 'INVALID_PLACEMENT', `${field} must be boolean`);
      options[field] = body[field];
    }
    const currentFeatured = profile.order.featured.includes(id);
    const nextFeatured = Object.hasOwn(options, 'featured') ? options.featured : currentFeatured;
    const currentSelected = placement.selectedForDirectory;
    const nextSelected = Object.hasOwn(options, 'selectedForDirectory') ? options.selectedForDirectory : currentSelected;
    const placementChanged = nextFeatured !== currentFeatured || nextSelected !== currentSelected;
    const stateChanged = placementChanged;
    let candidate = null;
    if (stateChanged) {
      const placements = { ...profile.placements, [id]: { ...placement, selectedForDirectory: nextSelected } };
      const featured = profile.order.featured.filter((value) => value !== id);
      const ordinary = profile.order.ordinary.filter((value) => value !== id);
      const nextOrder = nextFeatured
        ? { featured: [...featured, id], ordinary }
        : { featured, ordinary: [...ordinary, id] };
      candidate = nextCreatorState(profile, { placements, order: nextOrder });
    }
    const checks = [
      { key: `resource:${resource.id}`, version: resourceVersion },
      ...resourceMutation.checks.filter((check) => check.key !== `resource:${resource.id}`),
    ];
    const puts = [...resourceMutation.puts];
    const deletes = [...resourceMutation.deletes];
    if (candidate) puts.push({ key: profileKey(profile.id), value: candidate });
    const transactionChecks = [{ key: profileKey(profile.id), version: profile.version }, ...checks];
    if (!await store.transact({ checks: transactionChecks, puts, deletes })) {
      fail(409, 'LINK_CONFLICT', 'creator link or shared resource changed while saving');
    }
    return creatorAck('edit-link', profile.id, candidate?.version ?? profile.version,
      candidate || resourceMutation.changed ? 'saved' : 'unchanged', {
        placementId: id, resourceId: resource.id,
        resourceVersion: resourceMutation.resource.version ?? resourceVersion,
      });
  }

  async function moveCreatorOrder(principal, id, body, seriesId = null) {
    assertOwnerFields(body, new Set(['creatorVersion', 'destination']));
    const profile = await getRequiredOwnerProfile(principal);
    if (!Number.isSafeInteger(body.destination) || body.destination < 1) {
      fail(422, 'INVALID_POSITION', 'destination must be a positive ordinal');
    }
    if (!Object.hasOwn(profile.placements, id)) fail(404, 'PLACEMENT_NOT_FOUND', 'placement does not belong to this profile');
    const isChapterMove = seriesId !== null;
    let currentSequence;
    let target;
    if (isChapterMove) {
      target = profile.series[seriesId];
      if (!target) fail(404, 'SERIES_NOT_FOUND', 'series does not belong to this profile');
      currentSequence = target.chapters;
      if (!currentSequence.includes(id)) fail(404, 'SERIES_MEMBERSHIP_NOT_FOUND', 'placement is not in this series');
    } else {
      const featured = profile.order.featured.includes(id);
      currentSequence = featured ? profile.order.featured : profile.order.ordinary;
      target = null;
    }
    requireCreatorVersion(body, profile);
    if (body.destination > currentSequence.length) fail(422, 'INVALID_POSITION', 'destination exceeds the current order group');
    const oldIndex = currentSequence.indexOf(id);
    if (oldIndex + 1 === body.destination) {
      await checkCreatorState(profile, [], isChapterMove ? 'SERIES_CONFLICT' : 'ORDER_CONFLICT');
      return creatorAck(isChapterMove ? 'move-chapter' : 'move-link', profile.id, profile.version, 'unchanged', {
        ...(isChapterMove ? { seriesId } : {}), placementId: id,
      });
    }
    const sequence = [...currentSequence];
    sequence.splice(oldIndex, 1);
    sequence.splice(body.destination - 1, 0, id);
    const changes = isChapterMove
      ? { series: { ...profile.series, [seriesId]: { ...target, chapters: sequence, updatedAt: timestamp() } } }
      : { order: { ...profile.order, [profile.order.featured.includes(id) ? 'featured' : 'ordinary']: sequence } };
    const candidate = nextCreatorState(profile, changes);
    await commitCreatorState(profile, candidate, { code: isChapterMove ? 'SERIES_CONFLICT' : 'ORDER_CONFLICT' });
    return creatorAck(isChapterMove ? 'move-chapter' : 'move-link', profile.id, candidate.version, 'moved', {
      ...(isChapterMove ? { seriesId } : {}), placementId: id,
    });
  }

  async function patchPlacement(principal, id, body) {
    assertOwnerFields(body, new Set(['creatorVersion', 'featured', 'selectedForDirectory']), PROTECTED_PLACEMENT_FIELDS);
    const profile = await getRequiredOwnerProfile(principal);
    const placement = profile.placements[id];
    if (!placement) fail(404, 'PLACEMENT_NOT_FOUND', 'placement does not belong to this profile');
    requireCreatorVersion(body, profile);
    const currentFeatured = profile.order.featured.includes(id);
    const nextFeatured = Object.hasOwn(body, 'featured') ? body.featured : currentFeatured;
    const nextSelected = Object.hasOwn(body, 'selectedForDirectory') ? body.selectedForDirectory : placement.selectedForDirectory;
    if (typeof nextFeatured !== 'boolean' || typeof nextSelected !== 'boolean') fail(422, 'INVALID_PLACEMENT', 'placement options must be boolean');
    if (nextFeatured === currentFeatured && nextSelected === placement.selectedForDirectory) {
      await checkCreatorState(profile);
      return creatorAck('set-link-options', profile.id, profile.version, 'unchanged', { placementId: id });
    }
    const placements = { ...profile.placements, [id]: { ...placement, selectedForDirectory: nextSelected } };
    const featured = profile.order.featured.filter((value) => value !== id);
    const ordinary = profile.order.ordinary.filter((value) => value !== id);
    const order = nextFeatured ? { featured: [...featured, id], ordinary } : { featured, ordinary: [...ordinary, id] };
    const candidate = nextCreatorState(profile, { placements, order });
    await commitCreatorState(profile, candidate, { code: 'LINK_CONFLICT' });
    return creatorAck('set-link-options', profile.id, candidate.version, 'saved', { placementId: id });
  }

  async function deletePlacement(principal, id, body = {}) {
    assertOwnerFields(body, new Set(['creatorVersion']));
    const profile = await getRequiredOwnerProfile(principal);
    if (!Object.hasOwn(profile.placements, id)) fail(404, 'PLACEMENT_NOT_FOUND', 'placement does not belong to this profile');
    requireCreatorVersion(body, profile);
    const placements = { ...profile.placements };
    delete placements[id];
    const series = Object.fromEntries(Object.entries(profile.series).map(([seriesId, item]) => [seriesId, {
      ...item, chapters: item.chapters.filter((placementIdValue) => placementIdValue !== id),
    }]));
    const candidate = nextCreatorState(profile, {
      placements,
      order: {
        featured: profile.order.featured.filter((placementIdValue) => placementIdValue !== id),
        ordinary: profile.order.ordinary.filter((placementIdValue) => placementIdValue !== id),
      },
      series,
    });
    await commitCreatorState(profile, candidate, { code: 'LINK_CONFLICT' });
    return creatorAck('remove-link', profile.id, candidate.version, 'removed', { placementId: id });
  }

  async function patchCreatorResource(principal, resourceId, body) {
    assertOwnerFields(body, new Set([...CREATOR_RESOURCE_FIELDS, 'resourceVersion']));
    requireCatalogResourceIdWithinLimit(resourceId);
    const profile = await getRequiredOwnerProfile(principal);
    const resource = await store.get(`resource:${resourceId}`);
    if (!resource || !isCatalogResource(resource)) fail(404, 'RESOURCE_NOT_FOUND', 'resource does not exist');
    if (resource.editorProfileId !== profile.id || resource.directoryControl !== 'creator') {
      fail(403, 'RESOURCE_EDIT_FORBIDDEN', 'this profile does not edit the resource');
    }
    const expectedVersion = validVersion(body.resourceVersion);
    const resourceVersion = storedVersion(resource.version ?? 0, 'resource', { legacyZero: true });
    if (expectedVersion !== resourceVersion) fail(409, 'RESOURCE_CONFLICT', 'resource changed; reload before saving');
    const changedFields = creatorResourceChanges(resource, body);
    if (Object.keys(changedFields).length === 0) fail(422, 'EMPTY_UPDATE', 'no resource fields were provided');
    const mutation = await buildCreatorResourceMutation(resource, changedFields);
    if (!mutation.changed) {
      if (!await store.transact({ checks: mutation.checks })) fail(409, 'RESOURCE_CONFLICT', 'resource changed while saving');
      return {
        schemaVersion: 2, operation: 'edit-resource', profileId: profile.id, resourceId,
        resourceVersion, disposition: 'unchanged',
      };
    }
    if (!await store.transact({ checks: mutation.checks, puts: mutation.puts, deletes: mutation.deletes })) {
      fail(409, 'RESOURCE_CONFLICT', 'resource or URL changed while saving');
    }
    return {
      schemaVersion: 2, operation: 'edit-resource', profileId: profile.id, resourceId,
      resourceVersion: mutation.resource.version, disposition: 'saved',
    };
  }

  async function adminResourceList() {
    const rows = await store.list('resource:');
    return rows.map(({ value }) => cleanAdminResource(value));
  }

  async function adminProfileList() {
    const rows = await store.list('profile:');
    return rows.map(({ value }) => {
      if (!isRecord(value) || value.recordType !== 'creatorState'
        || typeof value.id !== 'string' || !value.id
        || typeof value.displayName !== 'string' || typeof value.slug !== 'string'
        || typeof value.published !== 'boolean' || typeof value.hidden !== 'boolean'
        || !Number.isSafeInteger(value.version) || value.version < 0) {
        fail(503, 'INVALID_PROFILE', 'profile summary is malformed');
      }
      return {
        id: value.id, displayName: value.displayName, slug: value.slug,
        published: value.published, hidden: value.hidden, version: value.version,
      };
    });
  }

  async function adminClaimList() {
    const rows = await store.list('claim:');
    return rows.map(({ value }) => {
      const resources = storedClaimResources(value);
      return {
        id: value.id,
        accountId: value.accountId,
        profileId: value.profileId,
        resourceIds: Array.isArray(value.resourceIds) ? [...value.resourceIds] : [],
        ...(resources ? { resources } : {}),
        ...(typeof value.sourceId === 'string' ? { sourceId: value.sourceId } : {}),
        ...(typeof value.evidence === 'string' ? { evidence: value.evidence } : {}),
        status: value.status,
        createdAt: value.createdAt,
        version: value.version ?? 0,
      };
    });
  }

  async function readAdminResources(context) {
    requireAdminContext(context);
    return adminResourceList();
  }

  async function readAdminProfiles(context) {
    requireAdminContext(context);
    return adminProfileList();
  }

  async function readAdminClaims(context) {
    requireAdminContext(context);
    return adminClaimList();
  }

  async function patchAdminResource(resourceId, body) {
    assertKnownFields(body, ADMIN_RESOURCE_FIELDS);
    requireCatalogResourceIdWithinLimit(resourceId);
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
      if (!await store.transact({ checks: [{ key, version: resource.version ?? 0 }] })) {
        fail(409, 'RESOURCE_CONFLICT', 'resource changed while saving');
      }
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
    requireCatalogResourceIdWithinLimit(resourceId);
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
      if (!await store.transact({ checks: [{ key, version: observedVersion }] })) {
        fail(409, 'RESOURCE_CONFLICT', 'resource changed while applying action');
      }
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
    const row = await store.get(key);
    if (!row) fail(404, 'PROFILE_NOT_FOUND', 'profile does not exist');
    const profile = readCreatorStateOrFail(row, profileId);
    const currentVersion = profile.version ?? 0;
    if (observedVersion !== currentVersion) fail(409, 'PROFILE_CONFLICT', 'profile changed; reload before applying action');
    if (action !== 'ocultar' && action !== 'restaurar') fail(404, 'ACTION_NOT_FOUND', 'action does not exist');
    const hidden = action === 'ocultar';
    if ((profile.hidden === true) === hidden) {
      if (!await store.transact({ checks: [{ key, version: observedVersion }] })) {
        fail(409, 'PROFILE_CONFLICT', 'profile changed while applying action');
      }
      return { profile: cleanPublicProfile(profile), versionChanges: [] };
    }
    const updated = nextCreatorState(profile, { hidden });
    creatorStateFits(updated);
    const ok = await store.transact({ checks: [{ key, version: observedVersion }], puts: [{ key, value: updated }] });
    if (!ok) fail(409, 'PROFILE_CONFLICT', 'profile changed while applying action');
    return {
      profile: cleanPublicProfile(updated),
      versionChanges: versionChanges(versionChange('profile', profileId, observedVersion, updated.version)),
    };
  }

  async function claimResourcesById(ids) {
    const uniqueIds = [...new Set(ids)];
    return assertResourceBatch(await store.getResources(uniqueIds), uniqueIds);
  }

  async function claimResourceIdForUrl(url) {
    const reservation = await store.get(currentUrlKey(url));
    if (!reservation) fail(404, 'RESOURCE_NOT_FOUND', 'no catalog resource is reserved for this URL');
    if (reservation.recordType !== 'urlReservation' || reservation.url !== url) {
      fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation is inconsistent');
    }
    if (!Number.isSafeInteger(reservation.version) || reservation.version < 1) {
      fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation is inconsistent');
    }
    if (reservation.status === 'collision') {
      const ids = reservation.resourceIds;
      if (!Array.isArray(ids) || ids.length < 2
        || ids.some((id) => typeof id !== 'string' || !id || id.startsWith('__'))
        || new Set(ids).size !== ids.length) {
        fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation is inconsistent');
      }
      fail(409, 'URL_COLLISION', 'this URL needs administrative review');
    }
    if (reservation.status !== 'reserved' || typeof reservation.resourceId !== 'string'
      || !reservation.resourceId || reservation.resourceId.startsWith('__')) {
      fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation is inconsistent');
    }
    return reservation.resourceId;
  }

  async function createClaim(principal, body) {
    const profile = await getRequiredOwnerProfile(principal);
    assertOwnerFields(body, new Set(['resources', 'sourceId', 'evidence']));
    if (!Array.isArray(body.resources) || body.resources.length === 0) {
      fail(422, 'INVALID_CLAIM_RESOURCES', 'resources must contain at least one target');
    }
    const sourceId = body.sourceId === undefined ? undefined : textField(body.sourceId, 'sourceId');
    const evidence = body.evidence === undefined || body.evidence === '' ? undefined : textField(body.evidence, 'evidence');
    const submittedResources = body.resources.map((value) => {
      if (!isRecord(value)) fail(422, 'INVALID_CLAIM_RESOURCES', 'each resource must contain a URL and optional exact resource ID');
      assertOwnerFields(value, new Set(['resourceId', 'url']));
      if (!Object.hasOwn(value, 'url')) fail(422, 'INVALID_CLAIM_RESOURCES', 'each resource URL is required');
      const url = validateResourceUrl(value.url);
      let resourceId;
      if (Object.hasOwn(value, 'resourceId')) {
        if (typeof value.resourceId !== 'string' || !value.resourceId) fail(422, 'INVALID_RESOURCE_ID', 'resourceId must identify a catalog resource');
        requireCatalogResourceIdWithinLimit(value.resourceId);
        resourceId = value.resourceId;
      }
      return { ...(resourceId ? { resourceId } : {}), url };
    });

    const resolvedIds = [];
    for (const target of submittedResources) {
      const resourceId = target.resourceId ?? await claimResourceIdForUrl(target.url);
      requireCatalogResourceIdWithinLimit(resourceId);
      resolvedIds.push(resourceId);
    }
    const records = await claimResourcesById(resolvedIds);
    const resolved = submittedResources.map((target, index) => {
      const resourceId = resolvedIds[index];
      const resource = records.get(resourceId);
      if (!resource) {
        if (target.resourceId !== undefined) fail(404, 'RESOURCE_NOT_FOUND', 'selected catalog resource does not exist');
        fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation points to missing catalog data');
      }
      if (resource.id !== resourceId) fail(503, 'INVALID_RESOURCE', 'catalog resource identity is inconsistent');
      if (!isCatalogResource(resource)) {
        if (target.resourceId !== undefined) fail(422, 'INVALID_CLAIM_RESOURCES', 'selected record is not a catalog resource');
        fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation does not point to a catalog resource');
      }
      const currentUrl = currentResourceUrl(resource);
      try { validateCatalogUrl(currentUrl); } catch { fail(503, 'INVALID_RESOURCE', 'catalog resource URL is malformed'); }
      if (currentUrl !== target.url) {
        if (target.resourceId !== undefined) fail(409, 'RESOURCE_CONFLICT', 'selected resource URL changed; review the current catalog entry');
        fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation does not match the catalog resource');
      }
      return { resourceId, url: target.url };
    });

    const unique = new Map();
    for (const target of resolved) if (!unique.has(target.resourceId)) unique.set(target.resourceId, target);
    const resources = [...unique.values()];
    const resourceIds = resources.map(({ resourceId }) => resourceId);
    const id = newId();
    const createdAt = timestamp();
    const claim = {
      recordType: 'claim', id, accountId: principal.accountId, profileId: profile.id,
      resourceIds, resources, ...(sourceId ? { sourceId } : {}), ...(evidence ? { evidence } : {}),
      status: 'pending', createdAt, version: 1,
    };
    if (store.measurePut(claimKey(id), claim).itemBytes > MAX_DYNAMODB_ITEM_BYTES) {
      fail(422, 'CLAIM_TOO_LARGE', 'claim exceeds DynamoDB’s 400 KiB item limit');
    }
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
    return {
      schemaVersion: 2, operation: 'create-claim', profileId: profile.id,
      claimId: id, claimVersion: 1, disposition: 'submitted',
    };
  }

  async function linkClaim(body) {
    assertKnownFields(body, new Set(['accountId', 'resourceIds', 'sourceId']));
    if (typeof body.accountId !== 'string' || !body.accountId || !Array.isArray(body.resourceIds)
      || body.resourceIds.length === 0 || body.resourceIds.some((id) =>
        typeof id !== 'string' || !id || !isCatalogResourceIdWithinLimit(id))
      || new Set(body.resourceIds).size !== body.resourceIds.length) {
      fail(422, 'EXACT_RESOURCES_REQUIRED', 'accountId and exact unique resourceIds are required');
    }
    const owner = await store.get(accountKey(body.accountId));
    if (!owner || typeof owner.profileId !== 'string') fail(404, 'PROFILE_NOT_FOUND', 'target account has no creator profile');
    const stateRow = await store.get(profileKey(owner.profileId));
    if (!stateRow) fail(503, 'INVALID_PROFILE', 'account mapping points to missing profile data');
    let profile = readCreatorStateOrFail(stateRow, owner.profileId);
    const requestedIds = [...body.resourceIds];
    const observedResources = new Map();
    for (const resourceId of requestedIds) {
      const resource = await store.get(`resource:${resourceId}`);
      if (!resource) fail(404, 'RESOURCE_NOT_FOUND', `resource ${resourceId} does not exist`);
      if (resource.id !== resourceId) fail(503, 'INVALID_RESOURCE', 'catalog resource identity is inconsistent');
      if (!isCatalogResource(resource)) fail(422, 'EXACT_RESOURCES_REQUIRED', `resource ${resourceId} is not a catalog resource`);
      if ((resource.editorProfileId && resource.editorProfileId !== profile.id)
        || (resource.directoryControl === 'creator' && resource.editorProfileId !== profile.id)) {
        fail(409, 'RESOURCE_ALREADY_CLAIMED', `resource ${resourceId} has another editor`);
      }
      observedResources.set(resourceId, resource);
    }

    const didLink = [];
    const committedVersionChanges = [];
    try {
      for (const resourceId of requestedIds) {
        const resourceKey = `resource:${resourceId}`;
        const resource = observedResources.get(resourceId);
        const resourceVersion = storedVersion(resource.version ?? 0, 'resource', { legacyZero: true });
        const editKey = editorKey(profile.id, resourceId);
        const currentEditor = await store.get(editKey);
        if (currentEditor && (currentEditor.recordType !== 'editorReference' || currentEditor.profileId !== profile.id
          || currentEditor.resourceId !== resourceId || !Number.isSafeInteger(currentEditor.version) || currentEditor.version < 0)) {
          fail(503, 'INVALID_EDITOR_REFERENCE', 'editor reference is malformed');
        }
        const hasAuthority = resource.directoryControl === 'creator' && resource.editorProfileId === profile.id;
        const hasPlacement = activePlacementId(profile, resourceId) !== null;
        const hasEditor = Boolean(currentEditor);
        const alreadyLinked = hasAuthority && hasPlacement && hasEditor;
        if (alreadyLinked) {
          didLink.push(resourceId);
          continue;
        }

        let candidate = null;
        if (!hasPlacement) {
          const appended = appendPlacement(profile, resourceId, true);
          candidate = appended.candidate;
        }
        const checks = [{ key: resourceKey, version: resourceVersion }];
        const puts = [];
        let updatedResource = null;
        if (!hasAuthority) {
          updatedResource = {
            ...resource, directoryControl: 'creator', editorProfileId: profile.id,
            autoSync: false, version: nextVersion(resourceVersion, 'resource'),
          };
          puts.push({ key: resourceKey, value: updatedResource });
        }
        if (currentEditor) checks.push({ key: editKey, version: currentEditor.version });
        else {
          checks.push({ key: editKey, version: null });
          puts.push({ key: editKey, value: { recordType: 'editorReference', profileId: profile.id, resourceId, version: 1 } });
        }
        if (candidate) puts.push({ key: profileKey(profile.id), value: candidate });
        else checks.push({ key: profileKey(profile.id), version: profile.version });
        if (!await store.transact({ checks, puts })) fail(409, 'CLAIM_CONFLICT', `resource ${resourceId} changed while linking`);

        if (candidate) {
          committedVersionChanges.push(versionChange('profile', profile.id, profile.version, candidate.version));
          profile = candidate;
        }
        if (updatedResource) {
          committedVersionChanges.push(versionChange('resource', resourceId, resourceVersion, updatedResource.version));
          observedResources.set(resourceId, updatedResource);
        }
        didLink.push(resourceId);
      }

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
        const updated = { ...claim, status: nextStatus,
          ...(nextStatus === 'resolved' ? { resolvedAt: timestamp() } : {}), version: claim.version + 1 };
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
        id: item.id,
        name: item.name,
        slug: item.slug,
        ...(Object.hasOwn(item, 'description') ? { description: item.description } : {}),
        chapterCount,
        href: `/c/${encodeURIComponent(profile.slug)}/series/${encodeURIComponent(item.slug)}/`,
      };
    }).filter(Boolean);
  }

  async function readPublicProfile(slugValue, { suffix = '', search = '' } = {}) {
    try {
      let slug;
      try { slug = normalizeSlug(slugValue); } catch { return { status: 404 }; }
      if (typeof suffix !== 'string' || (suffix && (!suffix.startsWith('/') || suffix.startsWith('//') || suffix.includes('?') || suffix.includes('#')))) return { status: 404 };
      if (suffix.includes('\\') || /[\u0000-\u001f\u007f]/.test(suffix)
        || suffix.split('/').some((part) => part === '.' || part === '..')) return { status: 404 };
      if (typeof search !== 'string' || (search && (!search.startsWith('?') || /[\u0000-\u001f\u007f]/.test(search)))) return { status: 404 };
      const alias = await store.get(aliasKey(slug));
      if (!alias) return { status: 404 };
      if (alias.recordType !== 'profileAlias' || alias.slug !== slug || typeof alias.profileId !== 'string') fail(503, 'INVALID_ALIAS', 'profile alias is malformed');
      const row = await store.get(profileKey(alias.profileId));
      if (!row) fail(503, 'INVALID_ALIAS', 'profile alias points to missing data');
      const profile = readCreatorStateOrFail(row, alias.profileId);
      if (profile.hidden || !profile.published) return { status: 404 };
      const publicProfile = cleanPublicProfile(profile);
      if (!publicProfile.displayName.trim()) fail(503, 'INVALID_PROFILE', 'profile display name is malformed');
      if (profile.slug !== slug) {
        return { status: 308, redirectTo: `/c/${encodeURIComponent(profile.slug)}${suffix || '/'}${search}` };
      }
      const series = seriesFromState(profile);
      const links = await profileLinks(profile, { publicTags: true, profileSlug: profile.slug });
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
      const row = await store.get(profileKey(profileAlias.profileId));
      if (!row) fail(503, 'INVALID_ALIAS', 'profile alias points to missing data');
      const profile = readCreatorStateOrFail(row, profileAlias.profileId);
      if (profile.hidden || !profile.published) return { status: 404 };
      const publicProfile = cleanPublicProfile(profile);
      if (!publicProfile.displayName.trim()) fail(503, 'INVALID_PROFILE', 'profile display name is malformed');

      const seriesAlias = await readSeriesAlias(profile.id, seriesSlug);
      if (!seriesAlias) return { status: 404 };
      const seriesState = profile.series[seriesAlias.seriesId];
      if (!seriesState) return { status: 404 };
      const metadata = {
        id: seriesAlias.seriesId,
        name: seriesState.name,
        slug: seriesState.slug,
        ...(Object.hasOwn(seriesState, 'description') ? { description: seriesState.description } : {}),
      };
      const resources = await resourcesById(seriesState.chapters.map((id) => profile.placements[id].resourceId));
      const links = [];
      for (const id of seriesState.chapters) {
        const placement = profile.placements[id];
        const resource = resources.get(placement.resourceId);
        const link = projectCreatorLink(profile, id, resource, { publicTags: true, profileSlug: profile.slug });
        if (link) links.push(link);
      }
      if (links.length === 0) return { status: 404 };
      if (profile.slug !== profileSlug || seriesState.slug !== seriesSlug) {
        return {
          status: 308,
          redirectTo: `/c/${encodeURIComponent(profile.slug)}/series/${encodeURIComponent(seriesState.slug)}/${search}`,
        };
      }
      return { status: 200, profile: publicProfile, series: metadata, links };
    } catch {
      return { status: 503 };
    }
  }

  async function readCreatorStatistics(context, { period, page } = {}) {
    const principal = requireAuthenticatedContext(context);
    if (period !== 7 && period !== 30) fail(400, 'INVALID_STATISTICS_PERIOD', 'periodo must be 7 or 30');
    if (!Number.isSafeInteger(page) || page < 1) fail(400, 'INVALID_STATISTICS_PAGE', 'pagina must be a positive integer');

    const { profile } = await ownerProfile(principal);
    if (!profile) return { state: 'no-profile', period, page };
    if (typeof profile.published !== 'boolean') fail(503, 'INVALID_PROFILE', 'profile publication state is malformed');
    if (!profile.published) return { state: 'not-published', period, page };
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
    return report;
  }

  async function route(request, principal, context) {
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

      return jsonResponse(await readCreatorStatistics(context, { period, page }));
    }

    // Retired owner paths must reject obsolete open documents consistently,
    // before route dispatch can obscure the compatibility boundary with 404.
    if (path.startsWith('/api/creador/') && request.method !== 'GET') {
      requireWriteRequest(request, principal);
    }

    if (path === '/api/creador/perfil') {
      if (request.method === 'GET') {
        requireCreatorPageSessionBinding(request, principal);
        return jsonResponse(await readCreatorEditor(context));
      }
      if (request.method === 'PUT') {
        requireWriteRequest(request, principal);
        const body = await parseRequestBody(request);
        return jsonResponse(await saveProfile(principal, body));
      }
      fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
    }
    if (path === '/api/creador/series') {
      if (request.method === 'GET') return jsonResponse(await readCreatorSeries(context));
      if (request.method === 'POST') {
        requireWriteRequest(request, principal);
        const body = await parseRequestBody(request);
        return jsonResponse(await createCreatorSeries(principal, body), 201);
      }
      fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
    }
    const seriesChapterMoveMatch = path.match(/^\/api\/creador\/series\/([^/]+)\/capitulos\/([^/]+)\/mover$/);
    if (seriesChapterMoveMatch) {
      requireMethod(request, 'POST');
      requireWriteRequest(request, principal);
      return jsonResponse(await moveCreatorOrder(
        principal,
        decodeSegment(seriesChapterMoveMatch[2]),
        await parseRequestBody(request),
        decodeSegment(seriesChapterMoveMatch[1]),
      ));
    }
    const seriesChapterMatch = path.match(/^\/api\/creador\/series\/([^/]+)\/capitulos\/([^/]+)$/);
    if (seriesChapterMatch) {
      const seriesId = decodeSegment(seriesChapterMatch[1]);
      const chapterId = decodeSegment(seriesChapterMatch[2]);
      if (!['PUT', 'DELETE'].includes(request.method)) fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
      requireWriteRequest(request, principal);
      const body = await parseRequestBody(request);
      const operation = request.method === 'PUT' ? 'add' : 'remove';
      const result = await changeSeriesChapter(principal, seriesId, chapterId, body, operation);
      return jsonResponse(result);
    }
    const seriesMatch = path.match(/^\/api\/creador\/series\/([^/]+)$/);
    if (seriesMatch) {
      const id = decodeSegment(seriesMatch[1]);
      if (request.method === 'PATCH') {
        requireWriteRequest(request, principal);
        return jsonResponse(await patchCreatorSeries(principal, id, await parseRequestBody(request)));
      }
      if (request.method === 'DELETE') {
        requireWriteRequest(request, principal);
        return jsonResponse(await deleteCreatorSeries(principal, id, await parseRequestBody(request)));
      }
      fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
    }
    if (path === '/api/creador/perfil/publicar') {
      requireMethod(request, 'POST');
      requireWriteRequest(request, principal);
      return jsonResponse(await publishProfile(principal, await parseRequestBody(request)));
    }
    if (path === '/api/creador/referencias') {
      requireMethod(request, 'POST');
      requireWriteRequest(request, principal);
      const result = await referenceResource(principal, await parseRequestBody(request));
      return jsonResponse(result, result.disposition === 'attached' ? 201 : 200);
    }
    if (path === '/api/creador/enlaces') {
      requireMethod(request, 'POST');
      requireWriteRequest(request, principal);
      const result = await addLink(principal, await parseRequestBody(request));
      return jsonResponse(result, result.disposition === 'already-present' ? 200 : 201);
    }
    const linkEditMatch = path.match(/^\/api\/creador\/enlaces\/([^/]+)\/editar$/);
    if (linkEditMatch) {
      requireMethod(request, 'PATCH');
      requireWriteRequest(request, principal);
      return jsonResponse(await editLink(principal, decodeSegment(linkEditMatch[1]), await parseRequestBody(request)));
    }
    const placementMoveMatch = path.match(/^\/api\/creador\/enlaces\/([^/]+)\/mover$/);
    if (placementMoveMatch) {
      requireMethod(request, 'POST');
      requireWriteRequest(request, principal);
      return jsonResponse(await moveCreatorOrder(principal, decodeSegment(placementMoveMatch[1]), await parseRequestBody(request)));
    }
    const placementMatch = path.match(/^\/api\/creador\/enlaces\/([^/]+)$/);
    if (placementMatch) {
      const id = decodeSegment(placementMatch[1]);
      if (request.method === 'DELETE') {
        requireWriteRequest(request, principal);
        const changes = await deletePlacement(principal, id, request.body ? await parseRequestBody(request) : {});
        return jsonResponse(changes);
      }
      if (request.method === 'PATCH') {
        requireWriteRequest(request, principal);
        return jsonResponse(await patchPlacement(principal, id, await parseRequestBody(request)));
      }
      fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
    }
    if (path === '/api/creador/recursos' && url.searchParams.has('id')) {
      requireMethod(request, 'PATCH');
      requireWriteRequest(request, principal);
      const resourceIds = url.searchParams.getAll('id');
      if (resourceIds.length !== 1 || [...url.searchParams.keys()].length !== 1) {
        fail(400, 'INVALID_RESOURCE_ID', 'exactly one resource id is required');
      }
      const resourceId = resourceIds[0];
      requireCatalogResourceIdWithinLimit(resourceId);
      return jsonResponse(await patchCreatorResource(principal, resourceId, await parseRequestBody(request)));
    }
    if (path === '/api/creador/reclamaciones') {
      requireMethod(request, 'POST');
      requireWriteRequest(request, principal);
      return jsonResponse(await createClaim(principal, await parseRequestBody(request)), 202);
    }

    const adminResourceCollectionPath = '/api/admin/recursos';
    if (url.searchParams.has('id')
      && (path === adminResourceCollectionPath || path.startsWith(`${adminResourceCollectionPath}/`))) {
      requireAdmin(principal);
      const commandPath = path.slice(adminResourceCollectionPath.length);
      if (commandPath === '') {
        requireMethod(request, 'PATCH');
        requireWriteRequest(request, principal);
        const resourceId = adminResourceIdFromQuery(url.searchParams);
        return writeJsonResponse(await patchAdminResource(resourceId, await parseRequestBody(request)));
      }

      const actionMatch = commandPath.match(/^\/(aprobar|revocar|ocultar|restaurar)$/);
      if (!actionMatch) fail(404, 'NOT_FOUND', 'route not found');
      requireMethod(request, 'POST');
      requireWriteRequest(request, principal);
      const resourceId = adminResourceIdFromQuery(url.searchParams);
      const body = request.body ? await parseRequestBody(request) : {};
      return writeJsonResponse(await adminResourceAction(resourceId, actionMatch[1], body));
    }
    if (path === '/api/admin/recursos' || path === '/api/admin/perfiles' || path === '/api/admin/reclamaciones') {
      requireMethod(request, 'GET');
      if (path.endsWith('/recursos')) return jsonResponse({ resources: await readAdminResources(context) });
      if (path.endsWith('/perfiles')) return jsonResponse({ profiles: await readAdminProfiles(context) });
      return jsonResponse({ claims: await readAdminClaims(context) });
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
        const context = await requestContextFor(request);
        const principal = principalFromContext(context);
        if (principal.state === 'disabled') {
          if (url.pathname.startsWith('/api/creador/')) requireCreatorPageSessionBinding(request, principal);
          fail(403, 'ACCOUNT_DISABLED', 'this account is disabled');
        }
        return await route(request, principal, context);
      } catch (error) {
        if (error instanceof ApiError) return jsonResponse({ error: error.code, message: error.message, ...(error.details ?? {}) }, error.status);
        return jsonResponse({ error: 'SERVICE_UNAVAILABLE', message: 'service is temporarily unavailable' }, 503);
      }
    },
    readCreatorEditor,
    readCreatorSeries,
    readAdminResources,
    readAdminProfiles,
    readAdminClaims,
    readCreatorStatistics,
    readPublicProfile,
    readPublicSeries,
  };
}

import { createHash } from 'node:crypto';
import { isCatalogResourceIdWithinLimit, isPublicCatalogResourceId } from './catalog-identity.mjs';
import { projectPublicRecord, validateCatalogUrl } from './catalog.mjs';
import {
  explicitTaxonomyFrom,
  legacyCategoryFor,
  resolveResourceClassification,
  validateTaxonomy,
} from './resource-taxonomy.mjs';
import { projectDiscoveryRecord, validateDiscoveryMetadata } from './resource-discovery.mjs';
import {
  currentUrlCollision,
  currentUrlKey,
  currentUrlReservation,
  decodeCurrentUrlReservation,
} from './catalog-url.mjs';
import { creatorResourceFacts } from './creator-resource-facts.mjs';
import {
  CREATOR_CONTRACT_VERSION,
  CREATOR_CONTRACT_HEADER,
  CREATOR_FIELD_LIMITS,
  CREATOR_PROGRAMS,
  CREATOR_SOCIALS,
  isCreatorSlug,
  isCreatorStateId,
  hasCreatorPublicIdentity,
  normalizeCreatorText,
} from './creator-values.mjs';
import { CreatorStateError, prepareCreatorStateWrite, readCreatorState } from './creator-state.mjs';
import { isConfirmedTransactionRejection } from './creator-store.mjs';
import {
  creatorPageSessionBindingFailureForRequest,
} from './creator-session-context.mjs';
import { parseHttpsOrigin } from './account-origin.mjs';
import { canonicalCreatorPath, canonicalCreatorSeriesPath, isPublicCreator, isPublicCreatorSeries, visibleCreatorSeriesChapterCount } from './creator-public.mjs';

const PROGRAMS = new Set(CREATOR_PROGRAMS);
const SOCIALS = new Set(CREATOR_SOCIALS);
const PROTECTED_PROFILE_FIELDS = new Set([
  'accountId', 'email', 'isAdmin', 'published', 'hidden', 'directoryApproval',
  'directoryControl', 'editorProfileId', 'photo', 'ownerAccountId',
]);
const PROTECTED_PLACEMENT_FIELDS = new Set(['published', 'directoryApproval', 'directoryControl', 'editorProfileId', 'accountId', 'isAdmin']);
const ADMIN_RESOURCE_FIELDS = new Set(['category', 'kind', 'format', 'topics']);
const CREATOR_RESOURCE_FIELDS = new Set(['title', 'url', 'description', 'kind', 'format', 'topics']);
const CREATOR_CLASSIFICATION_FIELDS = new Set(['kind', 'format', 'topics']);
const MAX_REQUEST_BODY_BYTES = 32 * 1024;
const MAX_DYNAMODB_ITEM_BYTES = 400 * 1024;
const TEXT_FIELD_LIMITS = new Map(Object.entries(CREATOR_FIELD_LIMITS)
  .filter(([field]) => field !== 'social' && field !== 'slug'));
const SOCIAL_FIELD_LIMIT = CREATOR_FIELD_LIMITS.social;
const PROFILE_TEXT_FIELD_ERROR_FIELDS = new Set(['displayName', 'city', 'country', 'bio']);

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function fail(status, code, message, details) {
  const error = new ApiError(status, code, message);
  error.details = details;
  throw error;
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

function fieldErrorDetails(field, reason) {
  return { fieldErrors: [{ field, reason }] };
}

function preGrantFieldErrorDetails(field, reason) {
  return { ...fieldErrorDetails(field, reason), failureStage: 'before-grant-write' };
}

function adminClassificationDetails(error, body) {
  const fieldErrors = error?.fieldErrors;
  if (!Array.isArray(fieldErrors) || fieldErrors.length !== 1) return undefined;
  const [entry] = fieldErrors;
  if (!isRecord(entry) || typeof entry.field !== 'string' || typeof entry.reason !== 'string') return undefined;
  let applicable = false;
  if (entry.field === 'category' && entry.reason === 'required') applicable = Object.hasOwn(body, 'category');
  else if (entry.field === 'topics' && entry.reason === 'invalid_option') applicable = Object.hasOwn(body, 'topics');
  else if (entry.field === 'kind-format'
    && (entry.reason === 'invalid_combination' || entry.reason === 'required')) {
    applicable = Object.hasOwn(body, 'kind') || Object.hasOwn(body, 'format');
  }
  return applicable ? { fieldErrors: [{ field: entry.field, reason: entry.reason }] } : undefined;
}

function textField(value, name, { optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string') fail(422, 'INVALID_FIELD', `${name} must be text`);
  const limit = name.startsWith('socials.') ? SOCIAL_FIELD_LIMIT : TEXT_FIELD_LIMITS.get(name);
  if (limit !== undefined && value.length > limit) fail(422, 'FIELD_TOO_LONG', `${name} must be at most ${limit} characters`);
  return normalizeCreatorText(value);
}

function validateTextLengths(value, path = '', depth = 0, {
  profileFieldDiagnostics = false,
  fieldDiagnostics,
  root = value,
} = {}, parent) {
  if (typeof value === 'string') {
    const field = path.split('.').at(-1);
    const limit = path.startsWith('socials.') ? SOCIAL_FIELD_LIMIT : TEXT_FIELD_LIMITS.get(field);
    if (limit !== undefined && value.length > limit) {
      const details = profileFieldDiagnostics
        && ((depth === 1 && PROFILE_TEXT_FIELD_ERROR_FIELDS.has(path))
          || (depth === 2 && path === `socials.${field}` && SOCIALS.has(field)))
        ? fieldErrorDetails(path, 'too_long')
        : fieldDiagnostics?.({ body: root, path, value, depth, parent });
      fail(422, 'FIELD_TOO_LONG', `${path || field} must be at most ${limit} characters`, details);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) validateTextLengths(item, path, depth + 1, { root, fieldDiagnostics }, value);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    const childDiagnostics = profileFieldDiagnostics
      && (depth === 0 || (depth === 1 && path === 'socials'));
    validateTextLengths(item, childPath, depth + 1, {
      root,
      profileFieldDiagnostics: childDiagnostics,
      fieldDiagnostics,
    }, value);
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
        fail(422, 'INVALID_SOCIAL_URL', `socials.${key} must be a safe HTTP or HTTPS URL without credentials`, {
          fieldErrors: [{ field: `socials.${key}`, reason: 'invalid_url' }],
        });
      }
      socials[key] = url;
    }
    next.socials = socials;
  } else if (!previous) next.socials = {};
  return next;
}

function validateResourceUrl(url, details) {
  try {
    return validateCatalogUrl(url);
  } catch {
    fail(422, 'INVALID_URL', 'url must be a safe HTTP or HTTPS URL without credentials', details);
  }
}

function trimTopLevelUrl(body) {
  if (typeof body.url === 'string') body.url = body.url.trim();
  return body;
}

function trimFreeTextClaimUrls(body) {
  if (!Array.isArray(body.resources)) return body;
  for (const target of body.resources) {
    if (isRecord(target) && !Object.hasOwn(target, 'resourceId') && typeof target.url === 'string') {
      target.url = target.url.trim();
    }
  }
  return body;
}

function topLevelFieldDiagnostics(fields, isApplicable = () => true) {
  const knownFields = new Set(fields);
  return ({ body, path, value, depth }) => {
    if (depth !== 1 || typeof value !== 'string' || !knownFields.has(path)
      || typeof body[path] !== 'string' || !isApplicable(body)) return undefined;
    return fieldErrorDetails(path, 'too_long');
  };
}

function claimFieldDiagnostics({ body, path, value, depth, parent }) {
  if (path !== 'resources.url' || depth !== 3 || typeof value !== 'string'
    || !Array.isArray(body.resources) || !isRecord(parent)
    || !body.resources.includes(parent) || Object.keys(parent).length !== 1
    || parent.url !== value) return undefined;
  return fieldErrorDetails('knownUrls', 'too_long');
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

function profileDto(profile) {
  const { id, displayName, slug, city, country, bio, programs, socials, photo, published, hidden, version } = profile;
  return {
    id, displayName, slug,
    ...(Object.hasOwn(profile, 'city') ? { city } : {}),
    ...(Object.hasOwn(profile, 'country') ? { country } : {}),
    ...(Object.hasOwn(profile, 'bio') ? { bio } : {}),
    programs: [...programs],
    socials: { ...socials },
    ...(photo ? { photo: { ...photo } } : {}),
    published, hidden, version,
  };
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

async function parseRequestBody(request, normalize = (body) => body, {
  profileFieldDiagnostics = false,
  fieldDiagnostics,
} = {}) {
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
  body = normalize(body);
  validateTextLengths(body, '', 0, { profileFieldDiagnostics, fieldDiagnostics });
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

function hasClassificationFields(value) {
  return [...CREATOR_CLASSIFICATION_FIELDS].some((field) => Object.hasOwn(value, field));
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createCreatorPagesService({ store, authenticate, origin, now = Date.now, createId, statistics } = {}) {
  if (!store || typeof store.get !== 'function' || typeof store.getResources !== 'function'
    || typeof store.getClaims !== 'function' || typeof store.listOpenClaimsForAccount !== 'function'
    || typeof store.list !== 'function' || typeof store.transact !== 'function') {
    throw new TypeError('store must implement creator reads, lists, and transactions');
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

  function creatorStateWrite(candidate, observedVersion) {
    try {
      return prepareCreatorStateWrite(candidate, observedVersion);
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
    const { version: _version, ...dto } = profileDto(profile);
    return dto;
  }

  function nextCreatorState(profile, changes) {
    const revision = storedVersion(profile.version, 'creator');
    return {
      ...profile,
      ...changes,
      version: nextVersion(revision, 'creator'),
      updatedAt: timestamp(),
    };
  }

  async function commitCreatorState(profile, candidate, { checks = [], puts = [], deletes = [], code = 'CREATOR_CONFLICT' } = {}) {
    const prepared = candidate ? creatorStateWrite(candidate, profile.version) : null;
    const ok = await store.transact({
      checks: [prepared?.check ?? { key: profileKey(profile.id), version: profile.version }, ...checks],
      puts: [...puts, ...(prepared ? [prepared.put] : [])],
      deletes,
    });
    if (!ok) fail(409, code, 'creator content or a related record changed while saving');
    return candidate;
  }

  function nextVersion(value, entity) {
    if (value >= Number.MAX_SAFE_INTEGER) fail(409, `${entity.toUpperCase()}_VERSION_EXHAUSTED`, `${entity} version cannot be incremented safely`);
    return value + 1;
  }

  function isValidMoveReservation(reservation, url) {
    if (!Number.isSafeInteger(reservation?.version) || reservation.version < 0) return false;
    try {
      // Existing URL moves compare the original revision in their transaction.
      // Only the shape check treats a legacy observed revision like version one.
      decodeCurrentUrlReservation({ ...reservation, version: 1 }, url);
      return true;
    } catch {
      return false;
    }
  }

  function reservationMembers(reservation, url, { allowOverLimitUniqueId = false } = {}) {
    try {
      const decoded = decodeCurrentUrlReservation(reservation, url, { allowOverLimitUniqueId });
      return decoded.resourceIds;
    } catch {
      fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation is inconsistent');
    }
  }

  async function inspectReservation(url, reservation, { allowOverLimitUniqueId = false } = {}) {
    const members = reservationMembers(reservation, url, { allowOverLimitUniqueId });
    if (reservation.status === 'reserved') {
      const [resourceId] = members;
      if (!isCatalogResourceIdWithinLimit(resourceId)) {
        // Add-by-URL has a historical 422 for an over-limit reservation ID;
        // all other readers reject it as an unusable index member.
        if (allowOverLimitUniqueId) requireCatalogResourceIdWithinLimit(resourceId);
        fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation is inconsistent');
      }
      const resources = assertResourceBatch(await store.getResources([resourceId]), [resourceId]);
      const resource = resources.get(resourceId);
      if (!resource) return { coherent: false };
      let facts;
      try {
        facts = resourceIdentityFacts(resource, resourceId);
      } catch {
        fail(503, 'INVALID_RESOURCE', 'resource presentation or visibility fields are malformed');
      }
      if (facts.url !== url) return { coherent: false };
      return { coherent: true, resource, facts, resourceId };
    }

    const found = assertResourceBatch(await store.getResources(members), members);
    const resources = [];
    for (const resourceId of members) {
      const resource = found.get(resourceId);
      if (!resource) return { coherent: false };
      let facts;
      try {
        facts = resourceIdentityFacts(resource, resourceId);
      } catch {
        return { coherent: false };
      }
      if (facts.url !== url) return { coherent: false };
      resources.push({ resourceId, resource, facts });
    }
    return { coherent: true, resources };
  }

  async function resolveReservation(url, { allowOverLimitUniqueId = false, initialReservation } = {}) {
    const key = currentUrlKey(url);
    let reservation = initialReservation === undefined ? await store.get(key) : initialReservation;
    if (!reservation) fail(404, 'RESOURCE_NOT_FOUND', 'no catalog resource is reserved for this URL');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const observation = await inspectReservation(url, reservation, { allowOverLimitUniqueId });
      if (observation.coherent) {
        if (reservation.status === 'collision') {
          fail(409, 'URL_COLLISION', 'this URL needs administrative review');
        }
        return { reservation, ...observation };
      }
      if (attempt === 1) {
        fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation does not match the catalog resource');
      }
      reservation = await store.get(key);
      if (!reservation) fail(404, 'RESOURCE_NOT_FOUND', 'no catalog resource is reserved for this URL');
    }
    // The loop always returns or throws. Keep a defensive failure for a
    // future refactor that changes the bounded observation above.
    fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation does not match the catalog resource');
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
    if (hasClassificationFields(body)) {
      if (resource.recordType === 'event' || approvalState(resource) !== 'pending') {
        fail(403, 'CLASSIFICATION_EDIT_FORBIDDEN', 'classification is controlled by administration for this resource');
      }
      try {
        const taxonomy = explicitTaxonomyFrom(body);
        Object.assign(changes, taxonomy);
        // Keep the historical category as a compatibility field. A creator
        // classification never overwrites an existing editorial category.
        if (resource.category === undefined) changes.category = legacyCategoryFor(taxonomy);
      } catch (error) {
        fail(422, 'INVALID_CLASSIFICATION', 'resource classification is incomplete or invalid',
          adminClassificationDetails(error, body));
      }
    }
    return changes;
  }

  function validateCreatorResourceCandidate(resource, changes) {
    const candidate = { ...resource, ...changes };
    const classification = resolveResourceClassification(candidate);
    const approval = approvalState(resource);
    // Revocation only removes public admission; it does not change the
    // creator's existing title, URL, and description editing authority.
    // Classification remains administrative while revoked, so no candidate
    // validation is needed for an ordinary metadata edit here.
    if (approval === 'revoked') return;
    if (resource.recordType === 'event') {
      if (approval === 'approved') {
        try { projectPublicRecord(candidate); } catch {
          fail(422, 'INVALID_EVENT', 'event data is incomplete or invalid');
        }
      }
      return;
    }

    if (classification.state === 'invalid') {
      fail(422, 'INVALID_CLASSIFICATION', 'resource classification is incomplete or invalid');
    }
    if (classification.state === 'absent' && approval === 'approved') {
      fail(422, 'INVALID_CLASSIFICATION', 'resource classification is incomplete or invalid');
    }

    const classifiedCandidate = classification.state === 'explicit' || classification.state === 'legacy'
      ? { ...candidate, ...classification }
      : candidate;
    if (classification.state === 'explicit' || classification.state === 'legacy') {
      try {
        validateDiscoveryMetadata(projectDiscoveryRecord(classifiedCandidate));
      } catch {
        fail(422, 'INVALID_CLASSIFICATION', 'resource metadata is incompatible with its classification');
      }
    }
    if (approval === 'approved') {
      try {
        projectPublicRecord(classifiedCandidate);
      } catch {
        fail(422, 'INVALID_CLASSIFICATION', 'resource is not valid for public directory admission');
      }
    }
  }

  async function buildCreatorResourceMutation(resource, requestedChanges) {
    const key = `resource:${resource.id}`;
    const before = storedVersion(resource.version, 'resource', { legacyZero: true });
    const changes = Object.fromEntries(Object.entries(requestedChanges)
      .filter(([field, value]) => !sameValue(resource[field], value)));
    const resourceCheck = { key, version: before };
    if (Object.keys(changes).length === 0) {
      return { resource, before, changed: false, checks: [resourceCheck], puts: [], deletes: [] };
    }

    validateCreatorResourceCandidate(resource, changes);

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

    if (previousReservation && !isValidMoveReservation(previousReservation, oldUrl)) {
      fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation is malformed');
    }
    if (reservation && !isValidMoveReservation(reservation, nextUrl)) {
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
      || alias.slug !== slug || !isCreatorStateId(alias.seriesId)
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

  function resourceProjectionFacts(resource, expectedId = resource?.id) {
    try {
      return creatorResourceFacts(resource, expectedId);
    } catch {
      fail(503, 'INVALID_RESOURCE', 'resource presentation or visibility fields are malformed');
    }
  }

  function resourceIdentityFacts(resource, expectedId = resource?.id) {
    if (!resource || !isCatalogResource(resource) || resource.id !== expectedId) throw new Error('resource identity is malformed');
    const url = currentResourceUrl(resource);
    if (typeof url !== 'string') throw new Error('resource URL is malformed');
    try { validateCatalogUrl(url); } catch { throw new Error('resource URL is malformed'); }
    return { url };
  }

  function publicLinkClassification(resource) {
    const classification = resolveResourceClassification(resource);
    if (classification.state === 'explicit' || classification.state === 'legacy') {
      return {
        kind: classification.kind,
        format: classification.format,
        topics: [...classification.topics],
      };
    }
    if (classification.state === 'event') return { kind: 'event', topics: [] };
    return { kind: 'unclassified', topics: [] };
  }

  function projectCreatorLink(profile, placementIdValue, resource) {
    const facts = resourceProjectionFacts(resource);
    if (resource.hidden === true) return null;
    const placement = creatorPlacement(profile, placementIdValue);
    if (!placement) fail(503, 'INVALID_CREATOR_STATE', 'order references a missing placement');
    const featured = profile.order.featured.includes(placementIdValue);
    const sequence = featured ? profile.order.featured : profile.order.ordinary;
    const tags = [];
    for (const [seriesId, series] of Object.entries(profile.series)) {
      const index = series.chapters.indexOf(placementIdValue);
      if (index < 0) continue;
      tags.push({
        seriesId,
        position: index + 1,
        name: series.name,
        href: canonicalCreatorSeriesPath(profile.slug, series.slug),
      });
    }
    return {
      placementId: placementIdValue,
      resourceId: resource.id,
      title: resource.title,
      url: facts.url,
      ...publicLinkClassification(resource),
      ...(typeof resource.description === 'string' ? { description: resource.description } : {}),
      featured,
      position: sequence.indexOf(placementIdValue) + 1,
      selectedForDirectory: placement.selectedForDirectory,
      series: tags,
      directoryApproval: facts.directoryApproval,
      resourceVersion: facts.version,
    };
  }

  async function profileLinks(profile) {
    const ids = orderedPlacementIds(profile);
    const resources = await resourcesById(ids.map((id) => profile.placements[id].resourceId));
    const links = [];
    for (const id of ids) {
      const placement = profile.placements[id];
      const link = projectCreatorLink(profile, id, resources.get(placement.resourceId));
      if (link) links.push(link);
    }
    return links;
  }

  function ownerResource(resource, { metadataEditable, reincludeAllowed, contractVersion = '2' }) {
    const facts = resourceProjectionFacts(resource);
    const result = {
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
    if (contractVersion === '3') {
      const classification = resolveResourceClassification(resource);
      result.classification = classification;
      result.classificationEditable = metadataEditable
        && resource.recordType !== 'event'
        && approvalState(resource) === 'pending';
    }
    return result;
  }

  async function creatorEditor(principal, { contractVersion = '2' } = {}) {
    const { profile } = await ownerProfile(principal);
    if (!profile) return {
      schemaVersion: contractVersion === '3' ? 3 : 2, creatorVersion: null, profile: null, resources: [], placements: {},
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
        contractVersion,
      }));
    }
    resources.sort((left, right) => left.id.localeCompare(right.id));

    const claimRefs = await store.list(`claim-ref:${profile.id}:`);
    const claimsById = await store.getClaims(claimRefs.map(({ value }) => value.id));
    const claims = [];
    for (const { value: reference } of claimRefs) {
      const claim = claimsById.get(reference.id);
      if (!claim) fail(503, 'MISSING_CLAIM', 'claim reference points to missing claim data');
      if (claim.profileId !== profile.id) continue;
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
      schemaVersion: contractVersion === '3' ? 3 : 2,
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
      const created = {
        recordType: 'creatorState', schemaVersion: 2, id, version: 1,
        ...fields, published: false, hidden: false,
        placements: {}, order: { featured: [], ordinary: [] }, series: {},
        createdAt: timestamp(), updatedAt: timestamp(),
      };
      const alias = created.slug ? await store.get(aliasKey(created.slug)) : null;
      if (alias) fail(409, 'SLUG_TAKEN', 'slug is already reserved');
      const prepared = creatorStateWrite(created, null);
      const checks = [
        { key: accountKey(principal.accountId), version: null },
        prepared.check,
        ...(created.slug ? [{ key: aliasKey(created.slug), version: null }] : []),
      ];
      const puts = [
        { key: accountKey(principal.accountId), value: { recordType: 'accountProfile', profileId: id, version: 1 } },
        prepared.put,
        ...(created.slug ? [{ key: aliasKey(created.slug), value: { recordType: 'profileAlias', slug: created.slug, profileId: id, version: 1 } }] : []),
      ];
      if (!await store.transact({ checks, puts })) {
        fail(409, 'PROFILE_CONFLICT', 'profile ownership or slug changed while saving');
      }
      return creatorAck('save-profile', id, created.version, 'created');
    }

    if (profile.published === true && (!fields.displayName.trim() || !fields.slug)) {
      const fieldErrors = [];
      if (!fields.displayName.trim()) fieldErrors.push({ field: 'displayName', reason: 'required' });
      if (!fields.slug) fieldErrors.push({ field: 'slug', reason: 'required' });
      fail(422, 'PROFILE_INCOMPLETE', 'a published profile must keep its display name and URL name', { fieldErrors });
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
    if (!hasCreatorPublicIdentity(profile.displayName, profile.slug)) {
      fail(422, 'PROFILE_INCOMPLETE', 'save a name and URL name before publishing');
    }
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

  async function readCreatorEditor(context, options = {}) {
    const contractVersion = options?.contractVersion === '3' || options?.contract === '3' ? '3' : '2';
    return creatorEditor(requireAuthenticatedContext(context), { contractVersion });
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

  function placementOptionChanges(profile, id, body) {
    const placement = profile.placements[id];
    const currentFeatured = profile.order.featured.includes(id);
    const nextFeatured = Object.hasOwn(body, 'featured') ? body.featured : currentFeatured;
    const nextSelected = Object.hasOwn(body, 'selectedForDirectory')
      ? body.selectedForDirectory : placement.selectedForDirectory;
    for (const field of ['featured', 'selectedForDirectory']) {
      if (Object.hasOwn(body, field) && typeof body[field] !== 'boolean') {
        fail(422, 'INVALID_PLACEMENT', `${field} must be boolean`);
      }
    }
    if (nextFeatured === currentFeatured && nextSelected === placement.selectedForDirectory) {
      return null;
    }

    const placements = { ...profile.placements, [id]: { ...placement, selectedForDirectory: nextSelected } };
    let order = profile.order;
    if (nextFeatured !== currentFeatured) {
      const featured = profile.order.featured.filter((value) => value !== id);
      const ordinary = profile.order.ordinary.filter((value) => value !== id);
      order = nextFeatured
        ? { featured: [...featured, id], ordinary }
        : { featured, ordinary: [...ordinary, id] };
    }
    return nextCreatorState(profile, { placements, order });
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
    const facts = resourceProjectionFacts(resource, resource.id);
    const resourceVersion = facts.version;
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
    let resolved;
    try {
      resolved = await resolveReservation(url, {
        allowOverLimitUniqueId: true,
        initialReservation: reservation,
      });
    } catch (error) {
      if (conflictOnStale && error instanceof ApiError
        && ['URL_INDEX_MISMATCH', 'RESOURCE_NOT_FOUND'].includes(error.code)) {
        fail(409, 'URL_CONFLICT', 'URL reservation is malformed or no longer matches its resource');
      }
      if (!conflictOnStale && error instanceof ApiError && error.code === 'RESOURCE_NOT_FOUND') {
        fail(503, 'URL_INDEX_MISMATCH', 'URL reservation is malformed or no longer matches its resource');
      }
      throw error;
    }
    const { resource, reservation: observedReservation } = resolved;
    return attachExistingResource(profile, resource, {
      selectedForDirectory,
      checks: [urlReservationCheck(currentUrlKey(url), observedReservation)],
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
    const facts = resourceProjectionFacts(resource, body.resourceId);
    const resourceVersion = facts.version;
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
    const facts = resourceProjectionFacts(resource, body.resourceId);
    const currentUrl = facts.url;
    if (currentUrl !== url) fail(409, 'RESOURCE_CONFLICT', 'resource changed; reload before referencing catalog content');
    const reservationKey = currentUrlKey(url);
    const reservation = await store.get(reservationKey);
    let resolved;
    try {
      resolved = await resolveReservation(url, { initialReservation: reservation });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      // A malformed or incomplete reservation is only a conflict when the
      // selected resource has moved; otherwise it is an operational index
      // failure and remains non-disclosing.
      const latestResource = await store.get(`resource:${resource.id}`);
      let latestFacts;
      try { latestFacts = resourceIdentityFacts(latestResource, resource.id); } catch { latestFacts = null; }
      if (latestFacts && latestFacts.url !== url) {
        fail(409, 'RESOURCE_CONFLICT', 'resource changed; reload before referencing catalog content');
      }
      if (error.code === 'RESOURCE_NOT_FOUND') {
        fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation does not match the selected resource');
      }
      throw error;
    }
    if (resolved.resourceId !== resource.id) {
      const latestResource = await store.get(`resource:${resource.id}`);
      let latestFacts;
      try { latestFacts = resourceIdentityFacts(latestResource, resource.id); } catch { latestFacts = null; }
      if (!latestFacts || latestFacts.url !== url) {
        fail(409, 'RESOURCE_CONFLICT', 'resource changed; reload before referencing catalog content');
      }
      fail(503, 'URL_INDEX_MISMATCH', 'current URL reservation does not match the selected resource');
    }
    try {
      return await attachExistingResource(profile, resource, {
        selectedForDirectory: body.selectedForDirectory ?? true,
        checks: [urlReservationCheck(reservationKey, resolved.reservation)],
        operation: 'reference-link',
        disposition: 'attached',
      });
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'LINK_CONFLICT') throw error;
      let latestResource;
      let latestReservation;
      try {
        latestResource = await store.get(`resource:${resource.id}`);
        latestReservation = await store.get(reservationKey);
      } catch {
        throw error;
      }
      let resourceStillMatches = false;
      try { resourceStillMatches = resourceIdentityFacts(latestResource, resource.id).url === url; } catch { /* stale or malformed */ }
      // Preserve the existing LINK_CONFLICT contract when the reservation's
      // membership is unchanged but a concurrent writer advanced its
      // observed revision. Full current-shape admission happens before the
      // write; this fallback only distinguishes that race from a URL move.
      const reservationStillMatches = isValidMoveReservation(latestReservation, url)
        && latestReservation.status === 'reserved'
        && latestReservation.resourceId === resource.id;
      if (!resourceStillMatches || !reservationStillMatches) {
        fail(409, 'RESOURCE_CONFLICT', 'resource changed; reload before referencing catalog content');
      }
      throw error;
    }
  }

  async function addLink(principal, body) {
    if (Object.hasOwn(body, 'resourceId') || Object.hasOwn(body, 'resourceVersion')) return readdEditableResource(principal, body);
    assertOwnerFields(body, new Set(['creatorVersion', 'title', 'url', 'description', 'selectedForDirectory', ...CREATOR_CLASSIFICATION_FIELDS]));
    const profile = await getRequiredOwnerProfile(principal);
    requireCreatorVersion(body, profile);
    const title = textField(body.title, 'title');
    if (!title.trim()) fail(422, 'INVALID_TITLE', 'title is required');
    const url = validateResourceUrl(body.url);
    const description = body.description === undefined ? '' : textField(body.description, 'description');
    let taxonomy;
    if (hasClassificationFields(body)) {
      try {
        taxonomy = explicitTaxonomyFrom(body);
      } catch (error) {
        fail(422, 'INVALID_CLASSIFICATION', 'resource classification is incomplete or invalid',
          adminClassificationDetails(error, body));
      }
    }
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
      ...(taxonomy ? { ...taxonomy, category: legacyCategoryFor(taxonomy) } : {}),
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
    const fields = new Set(['creatorVersion', 'resourceVersion', 'title', 'url', 'description', 'featured', 'selectedForDirectory', ...CREATOR_CLASSIFICATION_FIELDS]);
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
    const includesMetadata = metadataFields.some((field) => Object.hasOwn(body, field)) || hasClassificationFields(body);
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
    const candidate = placementOptionChanges(profile, id, body);
    const checks = [
      { key: `resource:${resource.id}`, version: resourceVersion },
      ...resourceMutation.checks.filter((check) => check.key !== `resource:${resource.id}`),
    ];
    const puts = [...resourceMutation.puts];
    const deletes = [...resourceMutation.deletes];
    await commitCreatorState(profile, candidate, {
      checks,
      puts,
      deletes,
      code: 'LINK_CONFLICT',
    });
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
    const candidate = placementOptionChanges(profile, id, body);
    if (!candidate) {
      await checkCreatorState(profile);
      return creatorAck('set-link-options', profile.id, profile.version, 'unchanged', { placementId: id });
    }
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
    if (resource.recordType === 'event' && Object.keys(body).some((field) => ADMIN_RESOURCE_FIELDS.has(field))) {
      fail(422, 'INVALID_EVENT', 'event resources do not accept ordinary taxonomy changes');
    }
    // Preserve the existing boundary error for malformed list input. A
    // well-shaped list is then classified by the shared tuple resolver so
    // partial and invalid taxonomy still use the new diagnostics.
    if (Object.hasOwn(body, 'topics')
      && (!Array.isArray(body.topics) || body.topics.some((topic) => typeof topic !== 'string'))) {
      fail(422, 'INVALID_TOPICS', 'topics must be a list of text');
    }
    for (const field of ['category', 'kind', 'format']) {
      if (Object.hasOwn(body, field) && typeof body[field] !== 'string') {
        fail(422, 'INVALID_FIELD', `${field} must be text`);
      }
    }
    const updated = { ...resource };
    for (const field of ['category']) {
      if (Object.hasOwn(body, field)) updated[field] = textField(body[field], field);
    }
    let taxonomy;
    if (hasClassificationFields(body)) {
      try {
        taxonomy = explicitTaxonomyFrom(body);
        Object.assign(updated, taxonomy);
        if (updated.category === undefined) updated.category = legacyCategoryFor(taxonomy);
      } catch (error) {
        fail(422, 'INVALID_CLASSIFICATION', 'resource classification is incomplete or invalid',
          adminClassificationDetails(error, body));
      }
    }
    if (!Object.keys(body).some((field) => ADMIN_RESOURCE_FIELDS.has(field))) fail(422, 'EMPTY_UPDATE', 'classification fields are required');
    try {
      if (isPublicCatalogResourceId(resource.id)) {
        projectPublicRecord(updated);
      } else {
        // Private classification changes metadata but do not admit the row to
        // public output. The same resolver still rejects partial tuples.
        const resolved = resolveResourceClassification(updated);
        if (resolved.state === 'invalid' || resolved.state === 'absent') {
          if (hasClassificationFields(body)) throw new Error('invalid classification');
        } else if (resolved.state !== 'event') validateTaxonomy(resolved);
      }
    } catch (error) {
      fail(422, 'INVALID_CLASSIFICATION', 'resource classification is incomplete or invalid',
        adminClassificationDetails(error, body));
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
    else if (action === 'restaurar') {
      if (resource.hidden === true && resource.published === true && resource.approvalRevoked !== true) {
        try { projectPublicRecord(resource); } catch {
          fail(422, 'INVALID_CLASSIFICATION', 'resource is not valid for public directory admission');
        }
      }
      updated.hidden = false;
    }
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
      return { profile: profileDto(profile), versionChanges: [] };
    }
    const updated = nextCreatorState(profile, { hidden });
    await commitCreatorState(profile, updated, { code: 'PROFILE_CONFLICT' });
    return {
      profile: profileDto(updated),
      versionChanges: versionChanges(versionChange('profile', profileId, observedVersion, updated.version)),
    };
  }

  async function claimResourcesById(ids) {
    const uniqueIds = [...new Set(ids)];
    return assertResourceBatch(await store.getResources(uniqueIds), uniqueIds);
  }

  async function claimResourceIdForUrl(url) {
    const resolved = await resolveReservation(url, { allowOverLimitUniqueId: true });
    return { resourceId: resolved.resourceId, resource: resolved.resource };
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
      const hasExplicitResourceId = Object.hasOwn(value, 'resourceId');
      const url = validateResourceUrl(value.url,
        hasExplicitResourceId ? undefined : fieldErrorDetails('knownUrls', 'invalid_url'));
      let resourceId;
      if (hasExplicitResourceId) {
        if (typeof value.resourceId !== 'string' || !value.resourceId) fail(422, 'INVALID_RESOURCE_ID', 'resourceId must identify a catalog resource');
        requireCatalogResourceIdWithinLimit(value.resourceId);
        resourceId = value.resourceId;
      }
      return { ...(resourceId ? { resourceId } : {}), url };
    });

    const resolvedIds = [];
    const resolvedResources = new Map();
    for (const target of submittedResources) {
      const urlResolution = target.resourceId === undefined ? await claimResourceIdForUrl(target.url) : null;
      const resourceId = target.resourceId ?? urlResolution.resourceId;
      requireCatalogResourceIdWithinLimit(resourceId);
      resolvedIds.push(resourceId);
      if (urlResolution) resolvedResources.set(resourceId, urlResolution.resource);
    }
    const records = resolvedResources.size === resolvedIds.length
      ? resolvedResources
      : new Map([...resolvedResources, ...await claimResourcesById(resolvedIds)]);
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
      let facts;
      try {
        facts = creatorResourceFacts(resource, resourceId);
      } catch {
        fail(target.resourceId !== undefined ? 503 : 503,
          target.resourceId !== undefined ? 'INVALID_RESOURCE' : 'URL_INDEX_MISMATCH',
          target.resourceId !== undefined ? 'catalog resource facts are malformed' : 'current URL reservation does not match the catalog resource');
      }
      if (facts.url !== target.url) {
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

  async function reconcileClaimStatus(accountId, profileId, matching) {
    const ids = [...new Set(matching.flatMap(({ value }) => value.resourceIds))];
    const resources = assertResourceBatch(await store.getResources(ids), ids);
    const linked = new Set();
    for (const [id, resource] of resources) {
      if (resource?.directoryControl === 'creator' && resource.editorProfileId === profileId) {
        resourceProjectionFacts(resource, id);
        linked.add(id);
      }
    }
    for (const { key, value: observed } of matching) {
      const linkedCount = observed.resourceIds.filter((id) => linked.has(id)).length;
      const status = linkedCount === observed.resourceIds.length ? 'resolved' : linkedCount > 0 ? 'partial' : 'pending';
      if (status === observed.status) continue;

      // The query projects matching facts only. A guarded full read preserves
      // historic metadata and detects an intervening claim status or target change.
      const current = await store.get(key);
      if (!current || current.id !== observed.id || current.accountId !== accountId
        || current.version !== observed.version || current.status !== observed.status
        || !['pending', 'partial'].includes(current.status)
        || !Array.isArray(current.resourceIds) || current.resourceIds.length !== observed.resourceIds.length
        || current.resourceIds.some((id, index) => id !== observed.resourceIds[index])) {
        fail(409, 'CLAIM_CONFLICT', 'claim state changed while resolving');
      }
      const updated = {
        ...current,
        status,
        ...(status === 'resolved' ? { resolvedAt: timestamp() } : {}),
        version: nextVersion(current.version, 'claim'),
      };
      const refKey = claimRefKey(profileId, current.id);
      const ref = await store.get(refKey);
      const checks = [{ key, version: current.version }];
      const puts = [{ key, value: updated }];
      if (!ref) {
        checks.push({ key: refKey, version: null });
        puts.push({ key: refKey, value: { id: current.id, version: 1 } });
      }
      if (!await store.transact({ checks, puts })) fail(409, 'CLAIM_CONFLICT', 'claim state changed while resolving');
    }
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
    const startingProfileVersion = profile.version;
    const requestedIds = [...body.resourceIds];
    const observedResources = new Map();
    for (const resourceId of requestedIds) {
      const resource = await store.get(`resource:${resourceId}`);
      if (!resource) fail(404, 'RESOURCE_NOT_FOUND', `resource ${resourceId} does not exist`,
        preGrantFieldErrorDetails('resourceIds', 'invalid_selection'));
      if (resource.id !== resourceId) fail(503, 'INVALID_RESOURCE', 'catalog resource identity is inconsistent');
      if (!isCatalogResource(resource)) fail(422, 'EXACT_RESOURCES_REQUIRED', `resource ${resourceId} is not a catalog resource`);
      if ((resource.editorProfileId && resource.editorProfileId !== profile.id)
        || (resource.directoryControl === 'creator' && resource.editorProfileId !== profile.id)) {
        fail(409, 'RESOURCE_ALREADY_CLAIMED', `resource ${resourceId} has another editor`,
          preGrantFieldErrorDetails('resourceIds', 'invalid_selection'));
      }
      const { version } = resourceProjectionFacts(resource, resourceId);
      observedResources.set(resourceId, { resource, version });
    }

    const confirmedIds = [];
    const committedVersionChanges = [];
    let grantWrote = false;
    let uncertainResourceId;
    const linkResult = () => ({
      linkedResourceIds: confirmedIds,
      versionChanges: committedVersionChanges,
      profileChanged: profile.version !== startingProfileVersion,
    });
    try {
      for (const resourceId of requestedIds) {
        const resourceKey = `resource:${resourceId}`;
        const { resource, version: resourceVersion } = observedResources.get(resourceId);
        const editKey = editorKey(profile.id, resourceId);
        const currentEditor = await store.get(editKey);
        if (currentEditor && (currentEditor.recordType !== 'editorReference' || currentEditor.profileId !== profile.id
          || currentEditor.resourceId !== resourceId || !Number.isSafeInteger(currentEditor.version) || currentEditor.version < 0)) {
          fail(503, 'INVALID_EDITOR_REFERENCE', 'editor reference is malformed');
        }
        const hasAuthority = resource.directoryControl === 'creator' && resource.editorProfileId === profile.id;
        const hasPlacement = activePlacementId(profile, resourceId) !== null;
        const candidate = hasPlacement ? null : appendPlacement(profile, resourceId, true).candidate;
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
        const writes = candidate !== null || puts.length > 0;
        try {
          await commitCreatorState(profile, candidate, { checks, puts, code: 'CLAIM_CONFLICT' });
        } catch (error) {
          // Unknown storage failures can arrive after a write committed.
          if (writes && !(error instanceof ApiError) && !isConfirmedTransactionRejection(error)) {
            uncertainResourceId = resourceId;
          }
          throw error;
        }
        grantWrote ||= writes;

        if (candidate) {
          committedVersionChanges.push(versionChange('profile', profile.id, profile.version, candidate.version));
          profile = candidate;
        }
        if (updatedResource) {
          committedVersionChanges.push(versionChange('resource', resourceId, resourceVersion, updatedResource.version));
        }
        confirmedIds.push(resourceId);
      }

      const granted = new Set(requestedIds);
      const claims = await store.listOpenClaimsForAccount(body.accountId);
      const matching = claims.filter(({ value }) => Array.isArray(value.resourceIds)
        && value.resourceIds.some((id) => granted.has(id)));
      if (matching.length > 0) {
        await reconcileClaimStatus(body.accountId, profile.id, matching);
      }
    } catch (error) {
      // No-op confirmations alone are not partial writes. If every grant was confirmed,
      // the failure belongs to the separate claim-status reconciliation.
      const allGrantsConfirmed = confirmedIds.length === requestedIds.length;
      if (uncertainResourceId !== undefined) {
        const uncertain = new ApiError(503, 'CLAIM_GRANT_UNCERTAIN', 'the resource grant could not be confirmed');
        uncertain.details = { ...linkResult(), uncertainResourceId };
        throw uncertain;
      }
      if (grantWrote || allGrantsConfirmed) {
        const details = {
          ...linkResult(),
          ...(allGrantsConfirmed ? { failureStage: 'claim-status' } : { failedResourceId: requestedIds[confirmedIds.length] }),
        };
        if (error instanceof ApiError) {
          error.details = details;
          throw error;
        }
        const partial = new ApiError(503, 'PARTIAL_CLAIM_WRITE', allGrantsConfirmed
          ? 'the selected resources were confirmed, but the claim status could not be updated'
          : 'some resources were linked before storage became unavailable');
        partial.details = details;
        throw partial;
      }
      throw error;
    }
    return linkResult();
  }

  function publicSeriesSummaries(profile, series, links) {
    return series.map((item) => {
      const chapters = links.filter((link) => link.series.some((tag) => tag.seriesId === item.id));
      const chapterCount = visibleCreatorSeriesChapterCount(chapters);
      if (!isPublicCreatorSeries(profile, chapterCount)) return null;
      return {
        id: item.id,
        name: item.name,
        slug: item.slug,
        ...(Object.hasOwn(item, 'description') ? { description: item.description } : {}),
        chapterCount,
        href: canonicalCreatorSeriesPath(profile.slug, item.slug),
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
      if (!isPublicCreator(profile)) return { status: 404 };
      const publicProfile = profileDto(profile);
      if (profile.slug !== slug) {
        return { status: 308, redirectTo: `${canonicalCreatorPath(profile.slug, suffix)}${search}` };
      }
      const series = seriesFromState(profile);
      const links = await profileLinks(profile);
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
      if (!isPublicCreator(profile)) return { status: 404 };
      const publicProfile = profileDto(profile);

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
        const link = projectCreatorLink(profile, id, resource);
        if (link) links.push(link);
      }
      if (!isPublicCreatorSeries(profile, links.length)) return { status: 404 };
      if (profile.slug !== profileSlug || seriesState.slug !== seriesSlug) {
        return {
          status: 308,
          redirectTo: `${canonicalCreatorSeriesPath(profile.slug, seriesState.slug)}${search}`,
        };
      }
      return { status: 200, profile: publicProfile, series: metadata, links };
    } catch {
      return { status: 503 };
    }
  }

  async function readCreatorStatisticsForOwner(context, { period, page, summary = false } = {}) {
    const principal = requireAuthenticatedContext(context);
    if (period !== 7 && period !== 30) fail(400, 'INVALID_STATISTICS_PERIOD', 'periodo must be 7 or 30');
    if (!summary && (!Number.isSafeInteger(page) || page < 1)) fail(400, 'INVALID_STATISTICS_PAGE', 'pagina must be a positive integer');

    const { profile } = await ownerProfile(principal);
    if (!profile) return { state: 'no-profile', period, ...(summary ? {} : { page }) };
    if (typeof profile.published !== 'boolean') fail(503, 'INVALID_PROFILE', 'profile publication state is malformed');
    if (!profile.published) return { state: 'not-published', period, ...(summary ? {} : { page }) };
    const method = summary ? 'readSummary' : 'read';
    if (!statistics || typeof statistics[method] !== 'function') {
      fail(503, 'STATISTICS_UNAVAILABLE', 'statistics are temporarily unavailable');
    }

    let report;
    try {
      report = await statistics[method]({ profileId: profile.id, period, ...(summary ? {} : { page }) });
    } catch {
      fail(503, 'STATISTICS_UNAVAILABLE', 'statistics are temporarily unavailable');
    }
    if (!isRecord(report)) fail(503, 'STATISTICS_UNAVAILABLE', 'statistics are temporarily unavailable');
    return report;
  }

  async function readCreatorStatistics(context, { period, page } = {}) {
    if (!Number.isSafeInteger(page) || page < 1) fail(400, 'INVALID_STATISTICS_PAGE', 'pagina must be a positive integer');
    return readCreatorStatisticsForOwner(context, { period, page });
  }

  async function readCreatorStatisticsSummary(context, { period } = {}) {
    return readCreatorStatisticsForOwner(context, { period, summary: true });
  }

  function readStatisticsQuery(searchParams, { detail = false } = {}) {
    const allowedParameters = new Set(detail ? ['periodo', 'pagina'] : ['periodo']);
    for (const name of searchParams.keys()) {
      if (!allowedParameters.has(name)) fail(400, 'INVALID_STATISTICS_QUERY', 'query contains an unsupported parameter');
    }
    const periods = searchParams.getAll('periodo');
    if (periods.length > 1) fail(400, 'INVALID_STATISTICS_QUERY', 'query parameters must not be repeated');
    const rawPeriod = periods[0] ?? '7';
    if (rawPeriod !== '7' && rawPeriod !== '30') {
      fail(400, 'INVALID_STATISTICS_PERIOD', 'periodo must be 7 or 30');
    }
    if (!detail) return { period: Number(rawPeriod) };

    const pages = searchParams.getAll('pagina');
    if (pages.length > 1) fail(400, 'INVALID_STATISTICS_QUERY', 'query parameters must not be repeated');
    const rawPage = pages[0] ?? '1';
    if (!/^\d+$/.test(rawPage)) fail(400, 'INVALID_STATISTICS_PAGE', 'pagina must be a positive integer');
    const page = Number(rawPage);
    if (!Number.isSafeInteger(page) || page < 1) {
      fail(400, 'INVALID_STATISTICS_PAGE', 'pagina must be a positive integer');
    }
    return { period: Number(rawPeriod), page };
  }

  async function route(request, principal, context) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');

    if (path === '/api/creador/estadisticas') {
      requireMethod(request, 'GET');
      return jsonResponse(await readCreatorStatistics(context, readStatisticsQuery(url.searchParams, { detail: true })));
    }

    if (path === '/api/creador/estadisticas/resumen') {
      requireMethod(request, 'GET');
      return jsonResponse(await readCreatorStatisticsSummary(context, readStatisticsQuery(url.searchParams)));
    }

    // Retired owner paths must reject obsolete open documents consistently,
    // before route dispatch can obscure the compatibility boundary with 404.
    if (path.startsWith('/api/creador/') && request.method !== 'GET') {
      requireWriteRequest(request, principal);
    }

    if (path === '/api/creador/perfil') {
      if (request.method === 'GET') {
        requireCreatorPageSessionBinding(request, principal);
        const contractVersion = request.headers.get(CREATOR_CONTRACT_HEADER) === '3' ? '3' : '2';
        return jsonResponse(await readCreatorEditor(context, { contractVersion }));
      }
      if (request.method === 'PUT') {
        const body = await parseRequestBody(request, undefined, { profileFieldDiagnostics: true });
        return jsonResponse(await saveProfile(principal, body));
      }
      fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
    }
    if (path === '/api/creador/series') {
      requireMethod(request, 'POST');
      const body = await parseRequestBody(request, undefined, {
        fieldDiagnostics: topLevelFieldDiagnostics(['name', 'description']),
      });
      return jsonResponse(await createCreatorSeries(principal, body), 201);
    }
    const seriesChapterMoveMatch = path.match(/^\/api\/creador\/series\/([^/]+)\/capitulos\/([^/]+)\/mover$/);
    if (seriesChapterMoveMatch) {
      requireMethod(request, 'POST');
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
      const body = await parseRequestBody(request);
      const operation = request.method === 'PUT' ? 'add' : 'remove';
      const result = await changeSeriesChapter(principal, seriesId, chapterId, body, operation);
      return jsonResponse(result);
    }
    const seriesMatch = path.match(/^\/api\/creador\/series\/([^/]+)$/);
    if (seriesMatch) {
      const id = decodeSegment(seriesMatch[1]);
      if (request.method === 'PATCH') {
        return jsonResponse(await patchCreatorSeries(principal, id, await parseRequestBody(request, undefined, {
          fieldDiagnostics: topLevelFieldDiagnostics(['name', 'description']),
        })));
      }
      if (request.method === 'DELETE') {
        return jsonResponse(await deleteCreatorSeries(principal, id, await parseRequestBody(request)));
      }
      fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
    }
    if (path === '/api/creador/perfil/publicar') {
      requireMethod(request, 'POST');
      return jsonResponse(await publishProfile(principal, await parseRequestBody(request)));
    }
    if (path === '/api/creador/referencias') {
      requireMethod(request, 'POST');
      const result = await referenceResource(principal, await parseRequestBody(request));
      return jsonResponse(result, result.disposition === 'attached' ? 201 : 200);
    }
    if (path === '/api/creador/enlaces') {
      requireMethod(request, 'POST');
      const result = await addLink(principal, await parseRequestBody(request, trimTopLevelUrl, {
        fieldDiagnostics: topLevelFieldDiagnostics(['title', 'url', 'description'],
          (body) => !Object.hasOwn(body, 'resourceId') && !Object.hasOwn(body, 'resourceVersion')),
      }));
      return jsonResponse(result, result.disposition === 'already-present' ? 200 : 201);
    }
    const linkEditMatch = path.match(/^\/api\/creador\/enlaces\/([^/]+)\/editar$/);
    if (linkEditMatch) {
      requireMethod(request, 'PATCH');
      return jsonResponse(await editLink(principal, decodeSegment(linkEditMatch[1]), await parseRequestBody(request, trimTopLevelUrl, {
        fieldDiagnostics: topLevelFieldDiagnostics(['title', 'url', 'description'],
          (body) => Object.hasOwn(body, 'resourceVersion')),
      })));
    }
    const placementMoveMatch = path.match(/^\/api\/creador\/enlaces\/([^/]+)\/mover$/);
    if (placementMoveMatch) {
      requireMethod(request, 'POST');
      return jsonResponse(await moveCreatorOrder(principal, decodeSegment(placementMoveMatch[1]), await parseRequestBody(request)));
    }
    const placementMatch = path.match(/^\/api\/creador\/enlaces\/([^/]+)$/);
    if (placementMatch) {
      const id = decodeSegment(placementMatch[1]);
      if (request.method === 'DELETE') {
        const changes = await deletePlacement(principal, id, request.body ? await parseRequestBody(request) : {});
        return jsonResponse(changes);
      }
      if (request.method === 'PATCH') {
        return jsonResponse(await patchPlacement(principal, id, await parseRequestBody(request)));
      }
      fail(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
    }
    if (path === '/api/creador/recursos' && url.searchParams.has('id')) {
      requireMethod(request, 'PATCH');
      const resourceIds = url.searchParams.getAll('id');
      if (resourceIds.length !== 1 || [...url.searchParams.keys()].length !== 1) {
        fail(400, 'INVALID_RESOURCE_ID', 'exactly one resource id is required');
      }
      const resourceId = resourceIds[0];
      requireCatalogResourceIdWithinLimit(resourceId);
      return jsonResponse(await patchCreatorResource(principal, resourceId, await parseRequestBody(request, trimTopLevelUrl, {
        fieldDiagnostics: topLevelFieldDiagnostics(['title', 'url', 'description']),
      })));
    }
    if (path === '/api/creador/reclamaciones') {
      requireMethod(request, 'POST');
      const evidenceDiagnostics = topLevelFieldDiagnostics(['evidence']);
      return jsonResponse(await createClaim(principal, await parseRequestBody(request, trimFreeTextClaimUrls, {
        fieldDiagnostics: (details) => evidenceDiagnostics(details) ?? claimFieldDiagnostics(details),
      })), 202);
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
      let result;
      try {
        result = await linkClaim(await parseRequestBody(request));
      } catch (error) {
        // An error without an outcome here is a definitive no-write result.
        // Its status alone cannot distinguish it from a partially committed grant.
        const failure = error instanceof ApiError ? error
          : new ApiError(503, 'SERVICE_UNAVAILABLE', 'service is temporarily unavailable');
        if (!failure.details) failure.details = { failureStage: 'before-grant-write' };
        throw failure;
      }
      return writeJsonResponse(result);
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
    readAdminResources,
    readAdminProfiles,
    readAdminClaims,
    readCreatorStatistics,
    readCreatorStatisticsSummary,
    readPublicProfile,
    readPublicSeries,
  };
}

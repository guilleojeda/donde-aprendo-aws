import { isCatalogResourceIdWithinLimit } from './catalog-identity.mjs';
import { isSafeCatalogUrl } from './catalog-url-safety.mjs';
import {
  CREATOR_FIELD_LIMITS,
  CREATOR_PROGRAMS,
  CREATOR_SOCIALS,
  hasCreatorPublicIdentity,
  isCreatorSlug,
  isCreatorStateId,
} from './creator-values.mjs';
import { dynamoDbCreatorStateSizes } from './creator-dynamodb-size.mjs';
import { isPublicCreator } from './creator-public.mjs';

export const CREATOR_STATE_SCHEMA_VERSION = 2;
export const CREATOR_CONTENT_LIMIT_BYTES = 384 * 1024;
export const CREATOR_ITEM_LIMIT_BYTES = 400 * 1024;

const CONTENT_ID = /^[A-Za-z0-9_-]{1,128}$/u;
const ROOT_FIELDS = new Set([
  'pk', 'sk', 'recordType', 'schemaVersion', 'id', 'version',
  'displayName', 'slug', 'city', 'country', 'bio', 'programs', 'socials',
  'photo', 'published', 'hidden', 'createdAt', 'updatedAt',
  'placements', 'order', 'series',
]);

export class CreatorStateError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'CreatorStateError';
    this.status = status;
    this.code = code;
  }
}

export { isCreatorStateId };

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalid(message) {
  throw new CreatorStateError(503, 'INVALID_CREATOR_STATE', message);
}

function invalidIf(condition, message) {
  if (condition) invalid(message);
}

function requireText(value, field, { optional = false, max = Infinity } = {}) {
  if (value === undefined && optional) return;
  invalidIf(typeof value !== 'string' || value.length > max, `creator state ${field} is malformed`);
}

function requireTimestamp(value, field, { optional = false } = {}) {
  if (value === undefined && optional) return;
  invalidIf(!Number.isSafeInteger(value) || value < 0, `creator state ${field} is malformed`);
}

function validateProfile(state) {
  invalidIf(!isCreatorStateId(state.id), 'creator state id is malformed');
  for (const field of ['displayName', 'city', 'country', 'bio']) {
    requireText(state[field], field, { optional: field !== 'displayName', max: CREATOR_FIELD_LIMITS[field] });
  }
  requireText(state.slug, 'slug', { max: CREATOR_FIELD_LIMITS.slug });
  invalidIf(state.slug !== '' && !isCreatorSlug(state.slug), 'creator state slug is malformed');
  invalidIf(!Array.isArray(state.programs)
    || state.programs.some((program) => typeof program !== 'string' || !CREATOR_PROGRAMS.includes(program)),
  'creator state programs are malformed');
  invalidIf(!isRecord(state.socials), 'creator state socials are malformed');
  for (const [name, value] of Object.entries(state.socials)) {
    invalidIf(!CREATOR_SOCIALS.includes(name) || typeof value !== 'string' || value.length > CREATOR_FIELD_LIMITS.social,
      'creator state socials are malformed');
    invalidIf(value !== '' && !isSafeCatalogUrl(value), 'creator state socials are malformed');
  }
  invalidIf(typeof state.published !== 'boolean' || typeof state.hidden !== 'boolean',
    'creator state visibility fields are malformed');
  invalidIf(isPublicCreator(state) && !hasCreatorPublicIdentity(state.displayName, state.slug),
    'creator state public identity is malformed');
  requireTimestamp(state.createdAt, 'createdAt');
  requireTimestamp(state.updatedAt, 'updatedAt');

  if (Object.hasOwn(state, 'photo')) validatePhoto(state.photo, state.id);
}

function validatePhoto(photo, profileId) {
  invalidIf(!isRecord(photo), 'creator state photo is malformed');
  const validVersion = (typeof photo.version === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(photo.version))
    || (Number.isSafeInteger(photo.version) && photo.version >= 0);
  invalidIf(!validVersion, 'creator state photo is malformed');
  invalidIf(Object.keys(photo).some((key) => key !== 'version' && key !== 'url'),
    'creator state photo is malformed');
  if (Object.hasOwn(photo, 'url')) {
    invalidIf(typeof photo.url !== 'string'
      || photo.url !== `/media/fotos/${profileId}/${String(photo.version)}.webp`,
    'creator state photo is malformed');
  }
}

function validatePlacementMap(placements) {
  invalidIf(!isRecord(placements), 'creator state placements are malformed');
  for (const [placementId, placement] of Object.entries(placements)) {
    invalidIf(!CONTENT_ID.test(placementId) || !isRecord(placement)
      || Object.keys(placement).some((field) => !['resourceId', 'selectedForDirectory'].includes(field))
      || !isCatalogResourceIdWithinLimit(placement.resourceId)
      || typeof placement.selectedForDirectory !== 'boolean',
    'creator state placement is malformed');
  }
}

/** Validate the projected placement/order/Series subset shared by storage and public catalog readers. */
export function validateCreatorSequences(value) {
  if (!isRecord(value)) invalid('creator state content is malformed');
  const { placements, order, series } = value;
  validatePlacementMap(placements);
  invalidIf(!isRecord(order)
    || Object.keys(order).length !== 2
    || !Object.hasOwn(order, 'featured')
    || !Object.hasOwn(order, 'ordinary'),
  'creator state order is malformed');

  const seen = new Set();
  for (const group of ['featured', 'ordinary']) {
    const sequence = order[group];
    invalidIf(!Array.isArray(sequence), 'creator state order is malformed');
    for (const placementId of sequence) {
      invalidIf(typeof placementId !== 'string' || !Object.hasOwn(placements, placementId)
        || seen.has(placementId), 'creator state order is malformed');
      seen.add(placementId);
    }
  }
  invalidIf(seen.size !== Object.keys(placements).length, 'creator state order is incomplete');

  invalidIf(!isRecord(series), 'creator state Series are malformed');
  for (const [seriesId, item] of Object.entries(series)) {
    invalidIf(!CONTENT_ID.test(seriesId) || !isRecord(item)
      || Object.keys(item).some((field) => !['name', 'slug', 'description', 'chapters', 'createdAt', 'updatedAt'].includes(field)),
    'creator state Series entry is malformed');
    requireText(item.name, `series ${seriesId} name`, { max: CREATOR_FIELD_LIMITS.name });
    invalidIf(!item.name.trim(), `creator state Series ${seriesId} name is malformed`);
    requireText(item.slug, `series ${seriesId} slug`, { max: CREATOR_FIELD_LIMITS.slug });
    invalidIf(!isCreatorSlug(item.slug), `creator state Series ${seriesId} slug is malformed`);
    requireText(item.description, `series ${seriesId} description`, { optional: true, max: CREATOR_FIELD_LIMITS.description });
    requireTimestamp(item.createdAt, `series ${seriesId} createdAt`, { optional: true });
    requireTimestamp(item.updatedAt, `series ${seriesId} updatedAt`, { optional: true });
    invalidIf(!Array.isArray(item.chapters), `creator state Series ${seriesId} chapters are malformed`);
    const chapters = new Set();
    for (const placementId of item.chapters) {
      invalidIf(typeof placementId !== 'string' || !Object.hasOwn(placements, placementId)
        || chapters.has(placementId), `creator state Series ${seriesId} chapters are malformed`);
      chapters.add(placementId);
    }
  }
  return value;
}

function validateStateShape(state, { requirePhysicalKeys = false } = {}) {
  invalidIf(!isRecord(state), 'creator state is not an object');
  invalidIf(Object.keys(state).some((field) => !ROOT_FIELDS.has(field)), 'creator state has unsupported fields');
  invalidIf(state.recordType !== 'creatorState' || state.schemaVersion !== CREATOR_STATE_SCHEMA_VERSION,
    'creator state discriminator is malformed');
  invalidIf(!isCreatorStateId(state.id) || !Number.isSafeInteger(state.version) || state.version < 0,
    'creator state identity or version is malformed');
  invalidIf(requirePhysicalKeys && (state.pk !== `PROFILE#${state.id}` || state.sk !== 'META'),
    'creator state storage key is malformed');
  if (Object.hasOwn(state, 'pk')) invalidIf(state.pk !== `PROFILE#${state.id}`, 'creator state storage key is malformed');
  if (Object.hasOwn(state, 'sk')) invalidIf(state.sk !== 'META', 'creator state storage key is malformed');
  invalidIf(Object.hasOwn(state, 'pk') !== Object.hasOwn(state, 'sk'), 'creator state storage key is incomplete');

  validateProfile(state);
  validateCreatorSequences(state);
  return state;
}

/** Validate a complete stored creator aggregate without defaulting or mutating it. */
export function readCreatorState(row, expectedId) {
  invalidIf(!isCreatorStateId(expectedId), 'expected creator id is malformed');
  invalidIf(!isRecord(row) || row.id !== expectedId, 'creator state does not match its expected identity');
  return validateStateShape(row);
}

/** Validate a complete logical aggregate candidate while preserving optional field presence. */
export function validateCreatorContent(candidate) {
  return validateStateShape(candidate);
}

function physicalCreatorItem(candidate) {
  return {
    ...candidate,
    pk: `PROFILE#${candidate.id}`,
    sk: 'META',
  };
}

/** Validate shape and both application/provider size limits before a creator-state write. */
export function assertCreatorStateFits(candidate) {
  validateStateShape(candidate);
  const { contentBytes, itemBytes } = dynamoDbCreatorStateSizes(physicalCreatorItem(candidate));
  if (contentBytes > CREATOR_CONTENT_LIMIT_BYTES || itemBytes > CREATOR_ITEM_LIMIT_BYTES) {
    throw new CreatorStateError(422, 'CREATOR_CONTENT_TOO_LARGE', 'creator content exceeds its storage limit');
  }
  return candidate;
}

/** Prepare the validated logical aggregate put and its observed-revision condition together. */
export function prepareCreatorStateWrite(candidate, observedVersion) {
  if (observedVersion !== null && (!Number.isSafeInteger(observedVersion) || observedVersion < 0)) {
    throw new TypeError('creator-state observed version must be null or a non-negative integer');
  }
  const value = assertCreatorStateFits(candidate);
  const key = `profile:${value.id}`;
  return {
    check: { key, version: observedVersion },
    put: { key, value },
  };
}

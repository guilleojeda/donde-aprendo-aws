export const CREATOR_CONTRACT_HEADER = 'X-Creator-Contract';
export const CREATOR_CONTRACT_VERSION = '2';

/** @type {readonly import('../types/creators').CreatorProgram[]} */
export const CREATOR_PROGRAMS = Object.freeze(['User Group Leaders', 'Community Builders', 'Heroes']);
/** @type {readonly import('../types/creators').CreatorSocial[]} */
export const CREATOR_SOCIALS = Object.freeze(['instagram', 'x', 'linkedin', 'awsBuilder', 'website']);

export const CREATOR_FIELD_LIMITS = Object.freeze({
  displayName: 120,
  name: 120,
  slug: 40,
  city: 100,
  country: 100,
  bio: 2000,
  title: 200,
  url: 2048,
  description: 2000,
  sourceId: 2000,
  evidence: 2000,
  social: 500,
});

export const CREATOR_SLUG_MIN_LENGTH = 3;
export const CREATOR_SLUG_PATTERN = '[a-z0-9]+(?:-[a-z0-9]+)*';
const slugPattern = new RegExp(`^${CREATOR_SLUG_PATTERN}$`, 'u');

/** @param {unknown} value */
export function isCreatorSlug(value) {
  return typeof value === 'string' && value.length >= CREATOR_SLUG_MIN_LENGTH
    && value.length <= CREATOR_FIELD_LIMITS.slug && slugPattern.test(value);
}

/**
 * A creator needs both public identity fields only when it is visible.
 * Drafts and hidden profiles may retain an empty slug until they are shown.
 * @param {unknown} displayName
 * @param {unknown} slug
 */
export function hasCreatorPublicIdentity(displayName, slug) {
  return typeof displayName === 'string' && displayName.trim().length > 0 && isCreatorSlug(slug);
}

/** @param {unknown} value */
export function isCreatorStateId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(value);
}

export const CREATOR_PHOTO_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const CREATOR_PHOTO_MAX_PIXELS = 40_000_000;
export const CREATOR_PHOTO_FORMATS = Object.freeze(['jpeg', 'png', 'webp']);
export const CREATOR_PHOTO_MIME_TYPES = Object.freeze(CREATOR_PHOTO_FORMATS.map((format) => `image/${format}`));

/**
 * @param {string} value
 * @returns {string}
 */
export function normalizeCreatorText(value) {
  return value.trim();
}

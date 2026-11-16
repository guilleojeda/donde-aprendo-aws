import { isSafeCatalogUrl } from './catalog-url-safety.mjs';

/** @typedef {{ published?: unknown; hidden?: unknown } | null | undefined} CreatorPublicProfile */
/** @typedef {{ hidden?: unknown } | null | undefined} CreatorPublicChapter */

/** @param {CreatorPublicProfile} profile */
export function isPublicCreator(profile) {
  return profile?.published === true && profile.hidden === false;
}

/** @param {readonly CreatorPublicChapter[]} chapters */
export function visibleCreatorSeriesChapterCount(chapters) {
  return chapters.filter((chapter) => chapter != null && chapter.hidden !== true).length;
}

/** @param {CreatorPublicProfile} profile @param {number} visibleChapterCount */
export function isPublicCreatorSeries(profile, visibleChapterCount) {
  return isPublicCreator(profile) && Number.isSafeInteger(visibleChapterCount) && visibleChapterCount > 0;
}

/** @param {string} profileSlug @param {string} [suffix] */
export function canonicalCreatorPath(profileSlug, suffix = '/') {
  return `/c/${encodeURIComponent(profileSlug)}${suffix || '/'}`;
}

/** @param {string} profileSlug @param {string} seriesSlug */
export function canonicalCreatorSeriesPath(profileSlug, seriesSlug) {
  return canonicalCreatorPath(profileSlug, `/series/${encodeURIComponent(seriesSlug)}/`);
}

/** @param {unknown} value */
export function safeCreatorSocialUrl(value) {
  if (typeof value !== 'string' || !value || !isSafeCatalogUrl(value)) return undefined;
  return new URL(value).href;
}

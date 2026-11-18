import { communityCountryPages, COUNTRY_SLUGS, eventCountryPath } from './community-country-pages.mjs';
import { effectiveEventLocation } from './event-location.mjs';
import { parseEventAgendaSearch, serializeEventAgendaSearch } from './event-agenda-filter.mjs';
import { isEventAgendaReferenceDate, parseEventAgendaPeriod, serializeEventAgendaPeriod } from './event-agenda-period.mjs';
import { parseDirectorySearch, serializeDirectorySearch } from './directory-url.mjs';
import { resourceFragment, resolveResourceFragment } from './resource-fragments.mjs';
import { rewriteArticleLinks } from './article-html.mjs';

const SITE_ORIGIN = 'https://dondeaprendoaws.com';
const COUNTRY_PATH_SLUGS = new Set(Object.values(COUNTRY_SLUGS));

function queryString(value) {
  return value ? `?${value}` : '';
}

function communityFallback(url, { communityAllowed, communityIds }) {
  const state = parseDirectorySearch(url.search, communityAllowed, 'recommended');
  const search = serializeDirectorySearch('', state);
  const target = resolveResourceFragment(url.hash, communityIds);
  return `/comunidades/${queryString(search)}${target === undefined ? '' : resourceFragment(target)}`;
}

function authoredPeriodQuery(query) {
  const period = parseEventAgendaPeriod(query, { timeZone: 'UTC', now: 0 });
  if (['date', 'from', 'to'].some((key) => isEventAgendaReferenceDate(query.get(key)))) {
    return serializeEventAgendaPeriod('', period);
  }

  // Keep valid partial state without making the build's parser reference a URL date.
  const partial = new URLSearchParams();
  for (const [key, value] of [['view', period.view], ['tz', period.timeZone]]) {
    if (query.get(key) === value) partial.set(key, value);
  }
  return partial.toString();
}

function eventFallback(url, { eventAllowed, eventIds }) {
  const filters = parseEventAgendaSearch(url.search, eventAllowed, {});
  const search = serializeEventAgendaSearch(authoredPeriodQuery(url.searchParams), filters, {});
  let target = '';
  if (url.hash.startsWith('#event-')) {
    try {
      if (eventIds.has(decodeURIComponent(url.hash.slice('#event-'.length)))) target = url.hash;
    } catch {
      // A malformed target cannot be proven to exist on the global agenda.
    }
  }
  return `/eventos/${queryString(search)}${target}`;
}

/** Compute the catalog-backed route and filter facts once for a build input. */
export function createBlogArticleLinkContext(catalog) {
  const resources = catalog.filter((record) => record.kind === 'community');
  const events = catalog.filter((record) => record.recordType === 'event');
  const communities = new Map(resources.map((resource) => [resource.id, resource]));
  const communityIds = new Set(communities.keys());
  const countryPages = communityCountryPages(resources);
  const cities = new Set();
  for (const { country, city } of resources) {
    if (country && city) cities.add(`${country}:${city}`);
  }
  for (const event of events) {
    const { country, city } = effectiveEventLocation(event, communities);
    if (country && city) cities.add(`${country}:${city}`);
  }
  return {
    eligible: new Set(countryPages.flatMap((page) => [page.path, eventCountryPath(page.country)])),
    communityIds,
    communityAllowed: {
      format: new Set(resources.map((resource) => resource.format)),
      topic: new Set(resources.flatMap((resource) => resource.topics)),
      country: new Set(resources.map((resource) => resource.country).filter(Boolean)),
      level: new Set(),
    },
    eventAllowed: { city: cities, community: communityIds },
    eventIds: new Set(events.map((event) => event.id)),
  };
}

/** Rewrite only withdrawn national catalog destinations in final article HTML. */
export function rewriteBlogArticleLinks(html, context) {
  return rewriteArticleLinks(html, (href) => {
    let url;
    try {
      url = new URL(href, SITE_ORIGIN);
    } catch {
      return href;
    }
    if (url.origin !== SITE_ORIGIN) return href;
    const match = /^\/(comunidades|eventos)\/([^/]+)\/?$/u.exec(url.pathname);
    if (!match) return href;
    const [, section, slug] = match;
    if (!COUNTRY_PATH_SLUGS.has(slug) || context.eligible.has(`/${section}/${slug}/`)) return href;
    return section === 'comunidades' ? communityFallback(url, context) : eventFallback(url, context);
  });
}

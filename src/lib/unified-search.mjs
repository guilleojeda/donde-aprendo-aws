import { eventHref, resourceHref } from './catalog-routes.mjs';
import { effectiveEventLocation } from './event-location.mjs';
import { normalizeSearch } from './directory-filter.mjs';
import { uniqueUpcomingEventGroups } from './events.mjs';
import { communityCountryPages } from './community-country-pages.mjs';
import { learningPathHref } from './learning-paths.mjs';

const TYPE_LABELS = Object.freeze({
  article: 'Artículo del blog',
  content: 'Recurso para aprender',
  source: 'Creador o canal',
  community: 'Comunidad',
  event: 'Evento',
  path: 'Recorrido de aprendizaje',
  collection: 'Colección del directorio',
});

export { TYPE_LABELS };

const SEARCH_STOP_WORDS = new Set([
  'a', 'al', 'como', 'con', 'de', 'del', 'e', 'el', 'en', 'es', 'la', 'las', 'lo', 'los',
  'o', 'para', 'por', 'que', 'un', 'una', 'unas', 'uno', 'unos', 'y',
]);

const SEARCH_FIELD_WEIGHTS = Object.freeze({
  title: 10,
  topics: 8,
  search: 5,
  description: 3,
  meta: 2,
  metadata: 1,
});

function searchWords(value = '') {
  return normalizeSearch(Array.isArray(value) ? value.join(' ') : value)
    .match(/[\p{L}\p{N}]+/gu) ?? [];
}

function hasSearchWord(fieldWords, word) {
  if (fieldWords.has(word)) return true;
  if (word.length < 4) return false;
  for (const fieldWord of fieldWords) {
    if (fieldWord.startsWith(word)) return true;
  }
  return false;
}

function markdownHeadings(body = '') {
  const markdown = [...body.matchAll(/^#{1,6}\s+(.+)$/gm)]
    .map(([, heading]) => heading.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[\*_`#]/g, '').trim())
    .filter(Boolean);
  const html = [...body.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)]
    .map(([, heading]) => heading.replace(/<[^>]*>/g, ' ')
      .replace(/&(?:nbsp|amp|quot|lt|gt);|&#(?:x[0-9a-f]+|\d+);/gi, (entity) => {
        const named = { '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>' };
        if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
        const code = entity[2].toLowerCase() === 'x'
          ? Number.parseInt(entity.slice(3, -1), 16)
          : Number.parseInt(entity.slice(2, -1), 10);
        return Number.isInteger(code) && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
      }).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return [...markdown, ...html].join(' ');
}

function seriesForRecords(records) {
  const byId = new Map();
  for (const record of records) {
    for (const association of record.series ?? []) {
      if (association?.seriesId && !byId.has(association.seriesId)) {
        byId.set(association.seriesId, {
          seriesId: association.seriesId,
          name: association.name,
          creatorName: association.creatorName,
          href: association.href,
        });
      }
    }
  }
  return [...byId.values()].sort((left, right) => left.seriesId < right.seriesId ? -1 : left.seriesId > right.seriesId ? 1 : 0);
}

function seriesSearchText(associations) {
  return associations.map(({ name, creatorName }) => `${name} ${creatorName}`).join(' ');
}

function projectEventMember(record, { communityById, countryPages, catalog }) {
  const location = effectiveEventLocation(record, communityById);
  const series = seriesForRecords([record]);
  return {
    id: record.id,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    title: record.title,
    description: record.description,
    registrationUrl: record.registrationUrl,
    mode: record.mode,
    place: record.place,
    country: record.country,
    ...(location.country ? { venueCountry: location.country } : {}),
    ...(location.city ? { city: location.city } : {}),
    organizer: record.organizer,
    url: eventHref(record, countryPages, catalog, communityById),
    ...(series.length ? { series } : {}),
  };
}

function eventMetadata(member) {
  const location = effectiveEventLocation(member);
  return [...new Set([
    member.place,
    location.city || member.city,
    location.country,
    member.country,
  ].filter(Boolean))].join(' ');
}

function eventSearchEntry(members, { includeMembers = false } = {}) {
  const representative = members[0];
  const series = seriesForRecords(members);
  return {
    type: 'event',
    title: representative.title,
    description: representative.description,
    url: representative.url,
    meta: representative.organizer,
    metadata: eventMetadata(representative),
    endsAt: representative.endsAt,
    ...(series.length ? { series, search: seriesSearchText(series) } : {}),
    ...(includeMembers ? { members } : {}),
  };
}

function eventEntriesForSearch(index, now) {
  const members = [];
  const sourceOrderByMemberId = new Map();
  for (const [order, entry] of index.entries()) {
    if (entry.type !== 'event' || !Array.isArray(entry.members)) continue;
    for (const member of entry.members) {
      members.push(member);
      if (!sourceOrderByMemberId.has(member.id)) sourceOrderByMemberId.set(member.id, order);
    }
  }

  const entriesByOrder = new Map();
  for (const group of uniqueUpcomingEventGroups(members, new Date(now))) {
    const order = Math.min(...group.events.map((member) => sourceOrderByMemberId.get(member.id) ?? index.length));
    const entries = entriesByOrder.get(order) ?? [];
    entries.push(eventSearchEntry(group.events));
    entriesByOrder.set(order, entries);
  }
  return entriesByOrder;
}

/** Only public, bounded text is written to the downloadable index. */
export function buildSearchIndex(posts, catalog, learningPaths = [], landingPages = []) {
  const articles = [...posts]
    .sort((a, b) => b.data.publishedAt.localeCompare(a.data.publishedAt) || a.id.localeCompare(b.id))
    .map((post) => ({
      type: 'article',
      title: post.data.title,
      description: post.data.description,
      url: `/blog/${post.id}/`,
      meta: post.data.publishedAt,
      search: markdownHeadings(post.body),
    }));

  const eventRecords = catalog.filter((record) => record.recordType === 'event');
  const communityById = new Map(catalog.filter((record) => record.kind === 'community')
    .map((community) => [community.id, community]));
  const countryPages = communityCountryPages(catalog);
  const eventContext = { communityById, countryPages, catalog };
  const projectedEvents = eventRecords.map((record) => projectEventMember(record, eventContext));
  const eventEntriesByRepresentativeId = new Map(uniqueUpcomingEventGroups(projectedEvents)
    .map((group) => [group.event.id, eventSearchEntry(group.events, { includeMembers: true })]));
  const records = catalog.filter((record) => record.recordType !== 'event' || eventEntriesByRepresentativeId.has(record.id))
    .map((record) => {
      if (record.recordType === 'event') {
        return eventEntriesByRepresentativeId.get(record.id);
      }
      const series = record.series ?? [];
      return {
        type: record.kind,
        title: record.title,
        description: record.description,
        url: resourceHref(record),
        meta: record.format,
        topics: [record.category, ...record.topics].filter(Boolean),
        metadata: [record.country, record.level].filter(Boolean).join(' '),
        ...(series.length ? { series, search: seriesSearchText(series) } : {}),
      };
    });

  const paths = learningPaths.map((path) => ({
    type: 'path',
    title: path.title,
    description: path.intro,
    url: learningPathHref(path.id),
    meta: path.audience,
    search: '',
  }));

  const collections = landingPages.map((page) => ({
    type: 'collection',
    title: page.title,
    description: page.description,
    url: page.path,
    meta: page.label,
    search: page.search ?? '',
  }));

  return [...paths, ...collections, ...articles, ...records];
}

export function aggregateSearchData(query, type, count) {
  return {
    content_type: type || 'all',
    query_length_bucket: query.length < 4 ? '1-3' : query.length < 10 ? '4-9' : query.length < 25 ? '10-24' : '25+',
    result_bucket: count === 0 ? '0' : count < 6 ? '1-5' : count < 21 ? '6-20' : '21+',
  };
}

/** Every meaningful term must occur; titles, topic tags, and headings lead incidental mentions. */
export function searchIndex(index, query, type = '', now = Date.now()) {
  const words = [...new Set(searchWords(query).filter((word) => !SEARCH_STOP_WORDS.has(word)))];
  if (!words.length) return [];
  const eventEntries = type && type !== 'event' ? new Map() : eventEntriesForSearch(index, now);
  const candidateEntries = index.flatMap((entry, order) => {
    if (entry.type === 'event' && Array.isArray(entry.members)) {
      return eventEntries.get(order) ?? [];
    }
    if ((type && entry.type !== type) || (entry.type === 'event' && Date.parse(entry.endsAt) <= now)) return [];
    return [entry];
  }).filter((entry) => !type || entry.type === type);
  const candidates = candidateEntries.map((entry, order) => {
    const fields = Object.fromEntries(Object.keys(SEARCH_FIELD_WEIGHTS).map((field) => [
      field,
      new Set(searchWords(entry[field])),
    ]));
    return { entry, order, fields };
  });
  const inverseDocumentFrequency = new Map(words.map((word) => {
    const documentFrequency = candidates.filter(({ fields }) => Object.values(fields)
      .some((fieldWords) => hasSearchWord(fieldWords, word))).length;
    return [word, Math.log(1 + (candidates.length - documentFrequency + 0.5) / (documentFrequency + 0.5))];
  }));
  return candidates.map(({ entry, order, fields }) => {
    let score = 0;
    for (const word of words) {
      const weight = Object.entries(SEARCH_FIELD_WEIGHTS)
        .find(([field]) => hasSearchWord(fields[field], word))?.[1] ?? 0;
      if (!weight) return null;
      score += weight * inverseDocumentFrequency.get(word);
    }
    return { entry, score, order };
  }).filter(Boolean)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ entry }) => entry);
}

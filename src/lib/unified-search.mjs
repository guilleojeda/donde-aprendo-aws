import { eventHref, resourceHref } from './catalog-routes.mjs';
import { normalizeSearch } from './directory-filter.mjs';
import { uniqueUpcomingEvents } from './events.mjs';

const TYPE_LABELS = Object.freeze({
  article: 'Artículo del blog',
  content: 'Recurso para aprender',
  source: 'Creador o canal',
  community: 'Comunidad',
  event: 'Evento',
  path: 'Recorrido de aprendizaje',
});

export { TYPE_LABELS };

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

/** Only public, bounded text is written to the downloadable index. */
export function buildSearchIndex(posts, catalog, learningPaths = []) {
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

  const visibleEvents = new Set(uniqueUpcomingEvents(catalog.filter((record) => record.recordType === 'event')));
  const records = catalog.filter((record) => record.recordType !== 'event' || visibleEvents.has(record))
    .map((record) => record.recordType === 'event'
    ? {
        type: 'event',
        title: record.title,
        description: record.description,
        url: eventHref(record),
        meta: record.organizer,
        search: [record.place, record.city, record.country].filter(Boolean).join(' '),
        endsAt: record.endsAt,
      }
    : {
        type: record.kind,
        title: record.title,
        description: record.description,
        url: resourceHref(record),
        meta: record.format,
        search: [record.category, ...record.topics, record.country, record.level].filter(Boolean).join(' '),
      });

  const paths = learningPaths.map((path) => ({
    type: 'path',
    title: path.title,
    description: path.intro,
    url: `/recorridos/#${path.id}`,
    meta: path.audience,
    search: '',
  }));

  return [...paths, ...articles, ...records];
}

export function aggregateSearchData(query, type, count) {
  return {
    content_type: type || 'all',
    query_length_bucket: query.length < 4 ? '1-3' : query.length < 10 ? '4-9' : query.length < 25 ? '10-24' : '25+',
    result_bucket: count === 0 ? '0' : count < 6 ? '1-5' : count < 21 ? '6-20' : '21+',
  };
}

/** Every term must occur; title hits rank above descriptions and metadata. */
export function searchIndex(index, query, type = '', now = Date.now()) {
  const words = [...new Set(normalizeSearch(query).match(/[\p{L}\p{N}]+/gu) ?? [])];
  if (!words.length) return [];
  return index.map((entry, order) => {
    if ((type && entry.type !== type) || (entry.type === 'event' && Date.parse(entry.endsAt) <= now)) return null;
    const title = normalizeSearch(entry.title);
    const description = normalizeSearch(entry.description);
    const meta = normalizeSearch(entry.meta);
    const extra = normalizeSearch(entry.search);
    let score = 0;
    for (const word of words) {
      const weight = title.includes(word) ? 6
        : description.includes(word) ? 3
          : meta.includes(word) ? 2
            : extra.includes(word) ? 1 : 0;
      if (!weight) return null;
      score += weight;
    }
    return { entry, score, order };
  }).filter(Boolean)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ entry }) => entry);
}

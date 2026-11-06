import type { CreatorEditorDTO } from '../types/creators';
import {
  creatorOwnerLinksHref, parseCreatorOwnerLinksQuery, selectCreatorOwnerLinks, type CreatorOwnerLinksQuery,
} from './creator-owner-links';
import {
  creatorOwnerSeriesHref, parseCreatorOwnerSeriesQuery, selectCreatorOwnerChapters, selectCreatorOwnerSeries,
  type CreatorOwnerSeriesQuery,
} from './creator-owner-series';

type OwnerLists = Pick<CreatorEditorDTO, 'links' | 'series'>;
type ListView = 'enlaces' | 'series';

export type OwnerDestination =
  | { href: string; view: 'enlaces'; query: CreatorOwnerLinksQuery }
  | { href: string; view: 'series'; query: CreatorOwnerSeriesQuery }
  | { href: string; view: ListView; error: 'links' | 'series' };

export function normalizeOwnerSeriesQuery(data: OwnerLists, query: CreatorOwnerSeriesQuery): CreatorOwnerSeriesQuery {
  const seriesQuery = selectCreatorOwnerSeries(data.series, query).query;
  if (!seriesQuery.serie) return seriesQuery;
  return data.series.some(({ id }) => id === seriesQuery.serie)
    ? selectCreatorOwnerChapters(data, seriesQuery).query
    : { ...seriesQuery, serie: '', buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1 };
}

export function normalizeOwnerLinksQuery(data: OwnerLists, query: CreatorOwnerLinksQuery): CreatorOwnerLinksQuery {
  const seriesExists = query.serie === 'todos' || data.series.some(({ id }) => id === query.serie);
  return selectCreatorOwnerLinks(data.links, data.series, seriesExists ? query : { ...query, serie: 'todos' }).query;
}

export function resolveOwnerDestination(url: URL, view: ListView, data: OwnerLists, wasValid: boolean): OwnerDestination {
  const params = url.searchParams;
  function normalizedHref(href: string): string {
    return new URL(href + url.hash, url).href;
  }
  if (view === 'enlaces') {
    const parsed = parseCreatorOwnerLinksQuery(params, data.series);
    if (parsed.valid) {
      const query = normalizeOwnerLinksQuery(data, parsed.query);
      return { view, query, href: query.paginaEnlaces === parsed.query.paginaEnlaces ? url.href : normalizedHref(creatorOwnerLinksHref(query)) };
    }
    if (wasValid && parsed.reason === 'series') {
      const remaining = new URLSearchParams(params);
      remaining.delete('serie');
      const repaired = parseCreatorOwnerLinksQuery(remaining, data.series);
      if (repaired.valid) {
        const query = normalizeOwnerLinksQuery(data, repaired.query);
        return { view, query, href: normalizedHref(creatorOwnerLinksHref(query)) };
      }
    }
    return { view, href: url.href, error: 'links' };
  }
  const parsed = parseCreatorOwnerSeriesQuery(params, data.series);
  if (parsed.valid) {
    const query = normalizeOwnerSeriesQuery(data, parsed.query);
    const clamped = query.paginaSeries !== parsed.query.paginaSeries || query.paginaCapitulos !== parsed.query.paginaCapitulos;
    return { view, query, href: clamped ? normalizedHref(creatorOwnerSeriesHref(query)) : url.href };
  }
  if (wasValid && parsed.reason === 'series') {
    const remaining = new URLSearchParams(params);
    for (const key of ['serie', 'buscarCapitulos', 'pertenencia', 'paginaCapitulos']) remaining.delete(key);
    const repaired = parseCreatorOwnerSeriesQuery(remaining, data.series);
    if (repaired.valid) {
      const query = normalizeOwnerSeriesQuery(data, repaired.query);
      return { view, query, href: normalizedHref(creatorOwnerSeriesHref(query)) };
    }
  }
  return { view, href: url.href, error: 'series' };
}

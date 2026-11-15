import type { CreatorOwnerSnapshotDTO } from '../types/creators';
import { creatorOwnerLinksHref, parseCreatorOwnerLinksQuery, selectCreatorOwnerLinks, type CreatorOwnerLinksQuery } from './creator-owner-links';
import {
  creatorOwnerSeriesHref, parseCreatorOwnerSeriesQuery, selectCreatorOwnerChapters, selectCreatorOwnerSeries,
  type CreatorOwnerSeriesQuery,
} from './creator-owner-series';
import { creatorOwnerNavigationLists } from './creator-owner-presentation';

type ListView = 'enlaces' | 'series';

export type OwnerDestination =
  | { href: string; view: 'enlaces'; query: CreatorOwnerLinksQuery }
  | { href: string; view: 'series'; query: CreatorOwnerSeriesQuery }
  | { href: string; view: ListView; error: 'links' | 'series' };

export function normalizeOwnerSeriesQuery(snapshot: CreatorOwnerSnapshotDTO, query: CreatorOwnerSeriesQuery): CreatorOwnerSeriesQuery {
  const seriesQuery = selectCreatorOwnerSeries(snapshot, query).query;
  if (!seriesQuery.serie) return seriesQuery;
  return Object.hasOwn(snapshot.series, seriesQuery.serie)
    ? selectCreatorOwnerChapters(snapshot, seriesQuery).query
    : { ...seriesQuery, serie: '', buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1 };
}

export function normalizeOwnerLinksQuery(snapshot: CreatorOwnerSnapshotDTO, query: CreatorOwnerLinksQuery): CreatorOwnerLinksQuery {
  const lists = creatorOwnerNavigationLists(snapshot);
  const seriesExists = query.serie === 'todos' || Object.hasOwn(snapshot.series, query.serie);
  return selectCreatorOwnerLinks(lists.links, lists.series, seriesExists ? query : { ...query, serie: 'todos' }).query;
}

export function resolveOwnerDestination(url: URL, view: ListView, snapshot: CreatorOwnerSnapshotDTO, wasValid: boolean): OwnerDestination {
  const params = url.searchParams;
  function normalizedHref(href: string): string {
    return new URL(href + url.hash, url).href;
  }
  if (view === 'enlaces') {
    const seriesIds = new Set(Object.keys(snapshot.series));
    const parsed = parseCreatorOwnerLinksQuery(params, seriesIds);
    if (parsed.valid) {
      const query = normalizeOwnerLinksQuery(snapshot, parsed.query);
      return { view, query, href: query.paginaEnlaces === parsed.query.paginaEnlaces ? url.href : normalizedHref(creatorOwnerLinksHref(query)) };
    }
    if (wasValid && parsed.reason === 'series') {
      const remaining = new URLSearchParams(params);
      remaining.delete('serie');
      const repaired = parseCreatorOwnerLinksQuery(remaining, seriesIds);
      if (repaired.valid) {
        const query = normalizeOwnerLinksQuery(snapshot, repaired.query);
        return { view, query, href: normalizedHref(creatorOwnerLinksHref(query)) };
      }
    }
    return { view, href: url.href, error: 'links' };
  }
  const parsed = parseCreatorOwnerSeriesQuery(params, snapshot);
  if (parsed.valid) {
    const query = normalizeOwnerSeriesQuery(snapshot, parsed.query);
    const clamped = query.paginaSeries !== parsed.query.paginaSeries || query.paginaCapitulos !== parsed.query.paginaCapitulos;
    return { view, query, href: clamped ? normalizedHref(creatorOwnerSeriesHref(query)) : url.href };
  }
  if (wasValid && parsed.reason === 'series') {
    const remaining = new URLSearchParams(params);
    for (const key of ['serie', 'buscarCapitulos', 'pertenencia', 'paginaCapitulos']) remaining.delete(key);
    const repaired = parseCreatorOwnerSeriesQuery(remaining, snapshot);
    if (repaired.valid) {
      const query = normalizeOwnerSeriesQuery(snapshot, repaired.query);
      return { view, query, href: normalizedHref(creatorOwnerSeriesHref(query)) };
    }
  }
  return { view, href: url.href, error: 'series' };
}

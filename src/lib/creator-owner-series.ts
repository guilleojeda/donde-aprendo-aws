import type {
  CreatorOwnerPlacementViewDTO,
  CreatorOwnerSeriesRecordDTO,
  CreatorOwnerSnapshotDTO,
} from '../types/creators';
import { joinCreatorOwnerPlacements } from './creator-owner-data';

export const CREATOR_OWNER_SERIES_PAGE_SIZE = 25;

export type CreatorOwnerSeriesMembership = 'todos' | 'incluidos' | 'disponibles';

export interface CreatorOwnerSeriesQuery {
  buscarSeries: string;
  paginaSeries: number;
  serie: string;
  buscarCapitulos: string;
  pertenencia: CreatorOwnerSeriesMembership;
  paginaCapitulos: number;
}

export type CreatorOwnerSeriesQueryResult =
  | { valid: true; query: CreatorOwnerSeriesQuery }
  | { valid: false; reason: 'repeated' | 'membership' | 'page' | 'series' };

export type CreatorOwnerSeriesListItem = CreatorOwnerSeriesRecordDTO & { id: string };

export interface CreatorOwnerSeriesSelection {
  rows: CreatorOwnerSeriesListItem[];
  matches: CreatorOwnerSeriesListItem[];
  query: CreatorOwnerSeriesQuery;
  totalMatches: number;
  pageCount: number;
}

export interface CreatorOwnerChapterSelection {
  rows: CreatorOwnerPlacementViewDTO[];
  matches: CreatorOwnerPlacementViewDTO[];
  completeOrder: CreatorOwnerPlacementViewDTO[];
  query: CreatorOwnerSeriesQuery;
  totalMatches: number;
  pageCount: number;
}

const KEYS = ['buscarSeries', 'paginaSeries', 'serie', 'buscarCapitulos', 'pertenencia', 'paginaCapitulos'] as const;
const MEMBERSHIPS = new Set<CreatorOwnerSeriesMembership>(['todos', 'incluidos', 'disponibles']);

export const DEFAULT_CREATOR_OWNER_SERIES_QUERY: CreatorOwnerSeriesQuery = {
  buscarSeries: '', paginaSeries: 1, serie: '', buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1,
};

export function normalizeCreatorOwnerSeriesSearch(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}

function pageNumber(value: string | undefined): number | undefined {
  if (value === undefined) return 1;
  const page = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(page) && page >= 1 ? page : undefined;
}

export function parseCreatorOwnerSeriesQuery(
  params: URLSearchParams,
  snapshot: CreatorOwnerSnapshotDTO,
): CreatorOwnerSeriesQueryResult {
  if (KEYS.some((key) => params.getAll(key).length > 1)) return { valid: false, reason: 'repeated' };
  const seriesId = params.get('serie') ?? '';
  const membership = params.get('pertenencia') ?? 'todos';
  const seriesPage = pageNumber(params.get('paginaSeries') ?? undefined);
  const chapterPage = pageNumber(params.get('paginaCapitulos') ?? undefined);
  if (!MEMBERSHIPS.has(membership as CreatorOwnerSeriesMembership)) return { valid: false, reason: 'membership' };
  if (seriesPage === undefined || chapterPage === undefined) return { valid: false, reason: 'page' };
  if (seriesId && !Object.hasOwn(snapshot.series, seriesId)) return { valid: false, reason: 'series' };
  return {
    valid: true,
    query: {
      buscarSeries: params.get('buscarSeries') ?? '',
      paginaSeries: seriesPage,
      serie: seriesId,
      buscarCapitulos: params.get('buscarCapitulos') ?? '',
      pertenencia: membership as CreatorOwnerSeriesMembership,
      paginaCapitulos: chapterPage,
    },
  };
}

function slicePage<T>(matches: T[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(matches.length / CREATOR_OWNER_SERIES_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * CREATOR_OWNER_SERIES_PAGE_SIZE;
  return { rows: matches.slice(start, start + CREATOR_OWNER_SERIES_PAGE_SIZE), pageCount, page };
}

function seriesList(snapshot: CreatorOwnerSnapshotDTO): CreatorOwnerSeriesListItem[] {
  return Object.entries(snapshot.series).map(([id, item]) => ({ id, ...item }));
}

export function selectCreatorOwnerSeries(
  snapshot: CreatorOwnerSnapshotDTO,
  query: CreatorOwnerSeriesQuery,
): CreatorOwnerSeriesSelection {
  const search = normalizeCreatorOwnerSeriesSearch(query.buscarSeries);
  const matches = seriesList(snapshot).filter((item) => !search
    || normalizeCreatorOwnerSeriesSearch(`${item.name} ${item.slug}`).includes(search))
    .sort((left, right) => left.name.localeCompare(right.name, 'es', { sensitivity: 'base' })
      || left.id.localeCompare(right.id));
  const page = slicePage(matches, query.paginaSeries);
  return {
    rows: page.rows, matches, query: { ...query, paginaSeries: page.page },
    totalMatches: matches.length, pageCount: page.pageCount,
  };
}

/** Return chapters in the server's literal sequence; no rank reconstruction or tie-break is applied. */
export function creatorOwnerChapterOrder(
  snapshot: CreatorOwnerSnapshotDTO,
  seriesId: string,
): CreatorOwnerPlacementViewDTO[] {
  const chapterIds = snapshot.series[seriesId]?.chapters ?? [];
  const byPlacement = new Map(joinCreatorOwnerPlacements(snapshot).map((placement) => [placement.placementId, placement]));
  return chapterOrderFromJoined(chapterIds, byPlacement);
}

function chapterOrderFromJoined(
  chapterIds: readonly string[],
  byPlacement: ReadonlyMap<string, CreatorOwnerPlacementViewDTO>,
): CreatorOwnerPlacementViewDTO[] {
  return chapterIds.map((placementId) => {
    const placement = byPlacement.get(placementId);
    if (!placement) throw new TypeError('La secuencia de capítulos referencia un enlace ausente.');
    return placement;
  });
}

export function selectCreatorOwnerChapters(
  snapshot: CreatorOwnerSnapshotDTO,
  query: CreatorOwnerSeriesQuery,
): CreatorOwnerChapterSelection {
  const links = joinCreatorOwnerPlacements(snapshot);
  const byPlacement = new Map(links.map((placement) => [placement.placementId, placement]));
  const completeOrder = chapterOrderFromJoined(snapshot.series[query.serie]?.chapters ?? [], byPlacement);
  const search = normalizeCreatorOwnerSeriesSearch(query.buscarCapitulos);
  const matches = links.filter((link) => {
    const included = link.series.some((item) => item.seriesId === query.serie);
    if (query.pertenencia === 'incluidos' && !included) return false;
    if (query.pertenencia === 'disponibles' && included) return false;
    if (!search) return true;
    return normalizeCreatorOwnerSeriesSearch(`${link.title} ${link.url}`).includes(search);
  }).sort((left, right) => left.title.localeCompare(right.title, 'es', { sensitivity: 'base' })
    || left.placementId.localeCompare(right.placementId));
  const page = slicePage(matches, query.paginaCapitulos);
  return {
    rows: page.rows, matches, completeOrder,
    query: { ...query, paginaCapitulos: page.page }, totalMatches: matches.length, pageCount: page.pageCount,
  };
}

function seriesParams(query: CreatorOwnerSeriesQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set('vista', 'series');
  if (query.buscarSeries) params.set('buscarSeries', query.buscarSeries);
  params.set('paginaSeries', String(query.paginaSeries));
  if (query.serie) params.set('serie', query.serie);
  if (query.buscarCapitulos) params.set('buscarCapitulos', query.buscarCapitulos);
  if (query.pertenencia !== 'todos') params.set('pertenencia', query.pertenencia);
  if (query.serie) params.set('paginaCapitulos', String(query.paginaCapitulos));
  return params;
}

export function creatorOwnerSeriesHref(query: CreatorOwnerSeriesQuery): string {
  return `/cuenta/?${seriesParams(query).toString()}`;
}

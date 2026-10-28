import type { CreatorEditorDTO, CreatorLinkDTO, CreatorSeriesDTO } from '../types/creators';

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

export interface CreatorOwnerSeriesSelection {
  rows: CreatorSeriesDTO[];
  matches: CreatorSeriesDTO[];
  query: CreatorOwnerSeriesQuery;
  totalMatches: number;
  pageCount: number;
}

export interface CreatorOwnerChapterSelection {
  rows: CreatorLinkDTO[];
  matches: CreatorLinkDTO[];
  completeOrder: CreatorLinkDTO[];
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
  series: readonly CreatorSeriesDTO[],
): CreatorOwnerSeriesQueryResult {
  if (KEYS.some((key) => params.getAll(key).length > 1)) return { valid: false, reason: 'repeated' };
  const seriesId = params.get('serie') ?? '';
  const membership = params.get('pertenencia') ?? 'todos';
  const seriesPage = pageNumber(params.get('paginaSeries') ?? undefined);
  const chapterPage = pageNumber(params.get('paginaCapitulos') ?? undefined);
  if (!MEMBERSHIPS.has(membership as CreatorOwnerSeriesMembership)) return { valid: false, reason: 'membership' };
  if (seriesPage === undefined || chapterPage === undefined) return { valid: false, reason: 'page' };
  if (seriesId && !series.some(({ id }) => id === seriesId)) return { valid: false, reason: 'series' };
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

export function selectCreatorOwnerSeries(
  series: readonly CreatorSeriesDTO[],
  query: CreatorOwnerSeriesQuery,
): CreatorOwnerSeriesSelection {
  const search = normalizeCreatorOwnerSeriesSearch(query.buscarSeries);
  const matches = series.filter((item) => !search
    || normalizeCreatorOwnerSeriesSearch(`${item.name} ${item.slug}`).includes(search))
    .sort((left, right) => left.name.localeCompare(right.name, 'es', { sensitivity: 'base' })
      || left.id.localeCompare(right.id));
  const page = slicePage(matches, query.paginaSeries);
  return {
    rows: page.rows, matches, query: { ...query, paginaSeries: page.page },
    totalMatches: matches.length, pageCount: page.pageCount,
  };
}

export function creatorOwnerChapterOrder(links: readonly CreatorLinkDTO[], seriesId: string): CreatorLinkDTO[] {
  return links.filter((link) => link.series.some((membership) => membership.seriesId === seriesId))
    .sort((left, right) => {
      const leftPosition = left.series.find((item) => item.seriesId === seriesId)?.position ?? 0;
      const rightPosition = right.series.find((item) => item.seriesId === seriesId)?.position ?? 0;
      return leftPosition - rightPosition || left.placementId.localeCompare(right.placementId);
    });
}

export function selectCreatorOwnerChapters(
  data: Pick<CreatorEditorDTO, 'links' | 'series'>,
  query: CreatorOwnerSeriesQuery,
): CreatorOwnerChapterSelection {
  const completeOrder = creatorOwnerChapterOrder(data.links, query.serie);
  const search = normalizeCreatorOwnerSeriesSearch(query.buscarCapitulos);
  const matches = data.links.filter((link) => {
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

export function creatorOwnerSeriesQueryFromForm(
  form: HTMLFormElement,
  current: CreatorOwnerSeriesQuery,
): CreatorOwnerSeriesQuery {
  const values = new FormData(form);
  return {
    ...current,
    buscarSeries: String(values.get('buscarSeries') ?? current.buscarSeries),
    paginaSeries: Number(values.get('paginaSeries') ?? current.paginaSeries),
    serie: String(values.get('serie') ?? current.serie),
    buscarCapitulos: String(values.get('buscarCapitulos') ?? current.buscarCapitulos),
    pertenencia: String(values.get('pertenencia') ?? current.pertenencia) as CreatorOwnerSeriesMembership,
    paginaCapitulos: Number(values.get('paginaCapitulos') ?? current.paginaCapitulos),
  };
}

import type { CreatorEditorDTO, CreatorLinkDTO, CreatorSeriesDTO } from '../types/creators';

export const CREATOR_OWNER_LINK_PAGE_SIZE = 25;

export type CreatorOwnerDirectoryFilter =
  | 'todos'
  | 'propuestos'
  | 'no-propuestos'
  | 'pendientes'
  | 'aprobados'
  | 'revocados'
  | 'ocultos';

export type CreatorOwnerFeaturedFilter = 'todos' | 'si' | 'no';
export type CreatorOwnerLinkOrder = 'pagina' | 'titulo-asc' | 'titulo-desc';

export interface CreatorOwnerLinksQuery {
  buscar: string;
  serie: string;
  directorio: CreatorOwnerDirectoryFilter;
  destacado: CreatorOwnerFeaturedFilter;
  orden: CreatorOwnerLinkOrder;
  paginaEnlaces: number;
}

export type CreatorOwnerLinksQueryResult =
  | { valid: true; query: CreatorOwnerLinksQuery }
  | { valid: false; reason: 'repeated' | 'directory' | 'featured' | 'order' | 'series' | 'page' };

export interface CreatorOwnerLinksSelection {
  rows: CreatorLinkDTO[];
  matches: CreatorLinkDTO[];
  query: CreatorOwnerLinksQuery;
  totalMatches: number;
  totalLinks: number;
  pageCount: number;
  firstVisible: number;
  lastVisible: number;
}

const QUERY_KEYS = ['buscar', 'serie', 'directorio', 'destacado', 'orden', 'paginaEnlaces'] as const;
const DIRECTORY_FILTERS = new Set<CreatorOwnerDirectoryFilter>([
  'todos', 'propuestos', 'no-propuestos', 'pendientes', 'aprobados', 'revocados', 'ocultos',
]);
const FEATURED_FILTERS = new Set<CreatorOwnerFeaturedFilter>(['todos', 'si', 'no']);
const LINK_ORDERS = new Set<CreatorOwnerLinkOrder>(['pagina', 'titulo-asc', 'titulo-desc']);

export const DEFAULT_CREATOR_OWNER_LINKS_QUERY: CreatorOwnerLinksQuery = {
  buscar: '',
  serie: 'todos',
  directorio: 'todos',
  destacado: 'todos',
  orden: 'pagina',
  paginaEnlaces: 1,
};

function singleValue(params: URLSearchParams, key: string): { repeated: boolean; value: string | undefined } {
  const values = params.getAll(key);
  return { repeated: values.length > 1, value: values[0] };
}

export function parseCreatorOwnerLinksQuery(
  params: URLSearchParams,
  series: readonly CreatorSeriesDTO[],
): CreatorOwnerLinksQueryResult {
  for (const key of QUERY_KEYS) {
    if (params.getAll(key).length > 1) return { valid: false, reason: 'repeated' };
  }

  const search = singleValue(params, 'buscar').value ?? '';
  const seriesId = singleValue(params, 'serie').value ?? 'todos';
  const directoryValue = singleValue(params, 'directorio').value ?? 'todos';
  const featuredValue = singleValue(params, 'destacado').value ?? 'todos';
  const orderValue = singleValue(params, 'orden').value ?? 'pagina';
  const pageValue = singleValue(params, 'paginaEnlaces').value ?? '1';
  const knownSeries = new Set(series.map(({ id }) => id));

  if (!DIRECTORY_FILTERS.has(directoryValue as CreatorOwnerDirectoryFilter)) return { valid: false, reason: 'directory' };
  if (!FEATURED_FILTERS.has(featuredValue as CreatorOwnerFeaturedFilter)) return { valid: false, reason: 'featured' };
  if (!LINK_ORDERS.has(orderValue as CreatorOwnerLinkOrder)) return { valid: false, reason: 'order' };
  if (seriesId !== 'todos' && seriesId !== '' && !knownSeries.has(seriesId)) return { valid: false, reason: 'series' };

  const page = Number(pageValue);
  if (!/^\d+$/.test(pageValue) || !Number.isSafeInteger(page) || page < 1) return { valid: false, reason: 'page' };

  return {
    valid: true,
    query: {
      buscar: search,
      serie: seriesId || 'todos',
      directorio: directoryValue as CreatorOwnerDirectoryFilter,
      destacado: featuredValue as CreatorOwnerFeaturedFilter,
      orden: orderValue as CreatorOwnerLinkOrder,
      paginaEnlaces: page,
    },
  };
}

export function normalizeCreatorOwnerLinkSearch(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}

function comparePlacement(left: CreatorLinkDTO, right: CreatorLinkDTO): number {
  return Number(right.featured) - Number(left.featured)
    || left.position - right.position
    || left.placementId.localeCompare(right.placementId);
}

function compareTitle(left: CreatorLinkDTO, right: CreatorLinkDTO, direction: 1 | -1): number {
  const titleOrder = left.title.localeCompare(right.title, 'es', { sensitivity: 'base' });
  return titleOrder === 0
    ? left.placementId.localeCompare(right.placementId)
    : titleOrder * direction;
}

export function selectCreatorOwnerLinks(
  links: readonly CreatorLinkDTO[],
  series: readonly CreatorSeriesDTO[],
  query: CreatorOwnerLinksQuery,
): CreatorOwnerLinksSelection {
  const seriesNames = new Map(series.map(({ id, name }) => [id, normalizeCreatorOwnerLinkSearch(name)]));
  const search = normalizeCreatorOwnerLinkSearch(query.buscar);
  let matches = links.filter((link) => {
    if (query.serie !== 'todos' && !link.series.some(({ seriesId }) => seriesId === query.serie)) return false;
    if (query.directorio === 'propuestos' && !link.selectedForDirectory) return false;
    if (query.directorio === 'no-propuestos' && link.selectedForDirectory) return false;
    if (query.directorio === 'pendientes' && link.directoryApproval !== 'pending') return false;
    if (query.directorio === 'aprobados' && link.directoryApproval !== 'approved') return false;
    if (query.directorio === 'revocados' && link.directoryApproval !== 'revoked') return false;
    if (query.directorio === 'ocultos' && !link.hidden) return false;
    if (query.destacado === 'si' && !link.featured) return false;
    if (query.destacado === 'no' && link.featured) return false;
    if (!search) return true;

    const searchable = [link.title, link.url, ...link.series.map(({ seriesId }) => seriesNames.get(seriesId) ?? '')]
      .map(normalizeCreatorOwnerLinkSearch);
    return searchable.some((value) => value.includes(search));
  });

  if (query.orden === 'titulo-asc') matches = [...matches].sort((left, right) => compareTitle(left, right, 1));
  else if (query.orden === 'titulo-desc') matches = [...matches].sort((left, right) => compareTitle(left, right, -1));
  else matches = [...matches].sort(comparePlacement);

  const totalMatches = matches.length;
  const totalLinks = links.length;
  const pageCount = Math.max(1, Math.ceil(totalMatches / CREATOR_OWNER_LINK_PAGE_SIZE));
  const page = Math.min(query.paginaEnlaces, pageCount);
  const start = (page - 1) * CREATOR_OWNER_LINK_PAGE_SIZE;
  const rows = matches.slice(start, start + CREATOR_OWNER_LINK_PAGE_SIZE);

  return {
    rows,
    matches,
    query: { ...query, paginaEnlaces: page },
    totalMatches,
    totalLinks,
    pageCount,
    firstVisible: rows.length ? start + 1 : 0,
    lastVisible: start + rows.length,
  };
}

export function creatorOwnerLinksHref(query: CreatorOwnerLinksQuery, page = query.paginaEnlaces): string {
  const params = new URLSearchParams();
  params.set('vista', 'enlaces');
  if (query.buscar) params.set('buscar', query.buscar);
  if (query.serie !== 'todos') params.set('serie', query.serie);
  if (query.directorio !== 'todos') params.set('directorio', query.directorio);
  if (query.destacado !== 'todos') params.set('destacado', query.destacado);
  if (query.orden !== 'pagina') params.set('orden', query.orden);
  params.set('paginaEnlaces', String(page));
  return `/cuenta/?${params.toString()}`;
}

export function creatorOwnerLinksCountLabel(totalMatches: number, totalLinks: number): string {
  const matches = totalMatches === 1 ? 'coincidencia' : 'coincidencias';
  const links = totalLinks === 1 ? 'enlace' : 'enlaces';
  return `${totalMatches} ${matches} de ${totalLinks} ${links}`;
}

export function creatorOwnerLinksQueryFromForm(form: HTMLFormElement, current: CreatorOwnerLinksQuery): CreatorOwnerLinksQuery {
  const values = new FormData(form);
  return {
    buscar: String(values.get('buscar') ?? current.buscar),
    serie: String(values.get('serie') ?? current.serie) || 'todos',
    directorio: String(values.get('directorio') ?? current.directorio) as CreatorOwnerDirectoryFilter,
    destacado: String(values.get('destacado') ?? current.destacado) as CreatorOwnerFeaturedFilter,
    orden: String(values.get('orden') ?? current.orden) as CreatorOwnerLinkOrder,
    paginaEnlaces: Number(values.get('paginaEnlaces') ?? current.paginaEnlaces),
  };
}

export function creatorOwnerLinksFromEditor(data: CreatorEditorDTO): readonly CreatorLinkDTO[] {
  return data.links;
}

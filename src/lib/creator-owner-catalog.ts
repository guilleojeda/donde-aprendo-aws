import type { CreatorCatalogSelectionDTO } from '../types/creators';

export const CREATOR_OWNER_CATALOG_PAGE_SIZE = 25;
const CATALOG_TYPES = new Set(['content', 'source', 'community', 'event']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCreatorOwnerCatalogItem(value: unknown): value is CreatorCatalogSelectionDTO {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'id,tipo,title,url'
    || typeof value.id !== 'string' || value.id.length === 0
    || new TextEncoder().encode(value.id).byteLength > 256
    || typeof value.title !== 'string' || value.title.trim().length === 0
    || typeof value.url !== 'string' || typeof value.tipo !== 'string' || !CATALOG_TYPES.has(value.tipo)) return false;
  try {
    const url = new URL(value.url);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function parseCreatorOwnerCatalog(value: unknown): CreatorCatalogSelectionDTO[] | undefined {
  if (!Array.isArray(value) || !value.every(isCreatorOwnerCatalogItem)) return undefined;
  const ids = new Set<string>();
  for (const item of value) {
    if (ids.has(item.id)) return undefined;
    ids.add(item.id);
  }
  return value;
}

export function searchCreatorOwnerCatalog(
  entries: readonly CreatorCatalogSelectionDTO[],
  query: string,
): CreatorCatalogSelectionDTO[] {
  const search = query.trim().toLocaleLowerCase('es');
  if (!search) return [...entries];
  return entries.filter((item) => item.title.toLocaleLowerCase('es').includes(search)
    || item.url.toLocaleLowerCase('es').includes(search));
}

export function pageCreatorOwnerCatalog(
  entries: readonly CreatorCatalogSelectionDTO[],
  query: string,
  requestedPage: number,
) {
  const matches = searchCreatorOwnerCatalog(entries, query);
  const pageCount = Math.max(1, Math.ceil(matches.length / CREATOR_OWNER_CATALOG_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), pageCount);
  const start = (page - 1) * CREATOR_OWNER_CATALOG_PAGE_SIZE;
  return { matches, rows: matches.slice(start, start + CREATOR_OWNER_CATALOG_PAGE_SIZE), page, pageCount };
}

export function parseCreatorOwnerClaimUrls(value: string): string[] | undefined {
  const urls = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return urls.every((value) => {
    if (!value || value.length > 2048) return false;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }) ? urls : undefined;
}

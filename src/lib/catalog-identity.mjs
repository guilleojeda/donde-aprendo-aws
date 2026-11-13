export const MAX_CATALOG_RESOURCE_ID_BYTES = 256;

const utf8Encoder = new TextEncoder();
const CATALOG_EVENT_ID = /^[A-Za-z0-9_-]{1,128}$/u;

/** Byte-only identity check used by private catalog keys and public resources. */
export function isCatalogResourceIdWithinLimit(id) {
  return typeof id === 'string' && id.length > 0
    && utf8Encoder.encode(id).byteLength <= MAX_CATALOG_RESOURCE_ID_BYTES;
}

/** Public resource IDs must also have no outer whitespace; accepted text stays exact. */
export function isPublicCatalogResourceId(id) {
  return isCatalogResourceIdWithinLimit(id) && id.trim() === id;
}

/** Event IDs and content eventId references retain their narrow ASCII format. */
export function isCatalogEventId(id) {
  return typeof id === 'string' && CATALOG_EVENT_ID.test(id);
}

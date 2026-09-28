import { loadCatalog } from './catalog.mjs';

let catalogPromise;

/** All static routes in one build use the same approved catalog snapshot. */
export function loadSiteCatalog() {
  catalogPromise ??= loadCatalog();
  return catalogPromise;
}

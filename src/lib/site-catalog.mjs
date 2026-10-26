import { loadCatalog } from './catalog.mjs';

let catalogSnapshotPromise;
let siteCatalogPromise;

/** All static routes in one build use the same approved catalog and reference time. */
export function loadSiteCatalogSnapshot() {
  catalogSnapshotPromise ??= loadCatalog().then((records) => ({ records, capturedAt: new Date() }));
  return catalogSnapshotPromise;
}

/** Preserve the existing array API for pages that render the public catalog. */
export function loadSiteCatalog() {
  siteCatalogPromise ??= loadSiteCatalogSnapshot().then(({ records }) => records);
  return siteCatalogPromise;
}

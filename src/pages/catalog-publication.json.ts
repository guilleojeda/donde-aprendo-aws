import type { APIRoute } from 'astro';
import { fingerprintPublicCatalog } from '../lib/publication.mjs';
import { loadSiteCatalogSnapshot } from '../lib/site-catalog.mjs';

export const GET: APIRoute = async () => {
  const { records, capturedAt } = await loadSiteCatalogSnapshot();
  const manifest = {
    version: 1,
    hash: fingerprintPublicCatalog(records, capturedAt),
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};

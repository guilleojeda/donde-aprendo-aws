import type { APIRoute } from 'astro';
import { loadSiteCatalog } from '../lib/site-catalog.mjs';
import type { CatalogEvent, CatalogResource } from '../types/catalog';

export const prerender = true;

export const GET: APIRoute = async () => {
  const catalog = await loadSiteCatalog() as Array<CatalogResource | CatalogEvent>;
  const selection = catalog.map((resource) => {
    const event = resource.recordType === 'event';
    return {
      id: resource.id,
      title: resource.title,
      url: event ? resource.registrationUrl : resource.url,
      tipo: event ? 'event' : resource.kind,
    };
  });

  return new Response(JSON.stringify(selection), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};

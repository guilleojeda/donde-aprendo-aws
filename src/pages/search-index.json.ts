import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { loadSiteCatalog } from '../lib/site-catalog.mjs';
import { buildSearchIndex } from '../lib/unified-search.mjs';

export const GET: APIRoute = async () => {
  const [posts, catalog] = await Promise.all([getCollection('blog'), loadSiteCatalog()]);
  return new Response(JSON.stringify(buildSearchIndex(posts, catalog)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};

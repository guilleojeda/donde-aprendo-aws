import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { loadSiteCatalog } from '../lib/site-catalog.mjs';
import { communityCountryPages, eventCountryPath } from '../lib/community-country-pages.mjs';
import type { CatalogEvent, CatalogResource } from '../types/catalog';
import { RESOURCE_COLLECTIONS } from '../lib/resource-collections.mjs';
import { EVENT_COLLECTIONS } from '../lib/event-collections.mjs';
import { LEARNING_PATHS, learningPathHref } from '../lib/learning-paths.mjs';

export const GET: APIRoute = async ({ site }) => {
  if (!site) throw new Error('A canonical site URL is required for the sitemap.');

  const [posts, catalog] = await Promise.all([getCollection('blog'), loadSiteCatalog()]);
  const articles = posts
    .map(({ id, data }) => ({ path: `/blog/${id}/`, lastmod: data.modifiedTimestamp }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const resources = (catalog as Array<CatalogEvent | CatalogResource>)
    .filter((record): record is CatalogResource => record.recordType !== 'event');
  const pages: Array<{ path: string; lastmod?: string }> = [
    ...['/', '/aprender/', '/recorridos/', '/creadores/', '/comunidades/', '/eventos/', '/blog/']
      .map((path) => ({ path })),
    ...[...RESOURCE_COLLECTIONS, ...Object.values(EVENT_COLLECTIONS)].map(({ path }) => ({ path })),
    ...LEARNING_PATHS.map(({ id }) => ({ path: learningPathHref(id) })),
    ...communityCountryPages(resources).flatMap(({ country, path }) => [
      { path },
      { path: eventCountryPath(country)! },
    ]),
    ...articles,
  ];
  const urls = pages.map(({ path, lastmod }) =>
    `<url><loc>${new URL(path, site).href}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('');

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};

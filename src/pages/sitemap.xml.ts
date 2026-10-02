import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async ({ site }) => {
  if (!site) throw new Error('A canonical site URL is required for the sitemap.');

  const articles = (await getCollection('blog'))
    .map(({ id, data }) => ({ path: `/blog/${id}/`, lastmod: data.modifiedTimestamp }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const pages: Array<{ path: string; lastmod?: string }> = [
    ...['/', '/aprender/', '/recorridos/', '/creadores/', '/comunidades/', '/eventos/', '/blog/', '/buscar/']
      .map((path) => ({ path })),
    ...articles,
  ];
  const urls = pages.map(({ path, lastmod }) =>
    `<url><loc>${new URL(path, site).href}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('');

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};

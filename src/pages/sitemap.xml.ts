import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

export const GET: APIRoute = async ({ site }) => {
  if (!site) throw new Error('A canonical site URL is required for the sitemap.');

  const articles = (await getCollection('blog')).map(({ id }) => `/blog/${id}/`).sort();
  const paths = ['/', '/blog/', ...articles];
  const urls = paths.map((path) => `<url><loc>${new URL(path, site).href}</loc></url>`).join('');

  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};

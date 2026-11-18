import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { loadSiteCatalog } from '../lib/site-catalog.mjs';
import { buildSearchIndex } from '../lib/unified-search.mjs';
import { LEARNING_PATHS } from '../lib/learning-paths.mjs';
import { landingSearchPages } from '../lib/landing-search.mjs';
import { extractArticleHeadings } from '../lib/article-html.mjs';

export const GET: APIRoute = async () => {
  const [posts, catalog] = await Promise.all([getCollection('blog'), loadSiteCatalog()]);
  const indexedPosts = posts.map((post) => ({
    ...post,
    search: extractArticleHeadings(post.rendered?.html ?? ''),
  }));
  return new Response(JSON.stringify(buildSearchIndex(indexedPosts, catalog, [...LEARNING_PATHS], landingSearchPages(catalog))), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};

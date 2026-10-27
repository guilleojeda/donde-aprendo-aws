import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { BLOG_CONTRIBUTORS } from '../lib/blog-contributors.mjs';

export const prerender = true;

const siteOrigin = 'https://dondeaprendoaws.com';

export const GET: APIRoute = async () => {
  const posts = await getCollection('blog');
  const articles = posts.map((post) => {
    const contributor = BLOG_CONTRIBUTORS[post.data.author];
    return {
      title: post.data.title,
      language: 'es',
      publishedAt: post.data.publishedAt,
      url: new URL(`/blog/${post.id}/`, siteOrigin).href,
      author: {
        name: contributor.name,
        url: contributor.url ?? null,
      },
    };
  });

  return new Response(JSON.stringify({
    schemaVersion: 1,
    source: { id: 'donde-aprendo-aws', label: 'Dónde Aprendo AWS' },
    articles,
  }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};

import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const localBlogAsset = z.string().regex(/^\/assets\/blog\/[A-Za-z0-9._-]+$/);

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    publishedTimestamp: z.string().min(1),
    cover: localBlogAsset,
    coverAlt: z.string(),
    ogImage: localBlogAsset,
    indexOrder: z.number().int().min(1).max(15).optional(),
    related: z.array(z.object({
      title: z.string().min(1),
      url: z.url(),
      image: localBlogAsset,
      imageAlt: z.string(),
    })),
  }),
});

export const collections = { blog };

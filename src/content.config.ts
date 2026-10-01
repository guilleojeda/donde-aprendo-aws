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
    coverAlt: z.string().trim().min(1),
    ogImage: localBlogAsset,
    ogImageAlt: z.string().trim().min(1).optional(),
    indexOrder: z.number().int().min(1).optional(),
    related: z.array(z.object({
      title: z.string().min(1),
      url: z.url(),
      image: localBlogAsset,
      imageAlt: z.string(),
    })),
  }).refine((post) => post.ogImage === post.cover || post.ogImageAlt !== undefined, {
    message: 'A social image different from the cover needs its own ogImageAlt.',
    path: ['ogImageAlt'],
  }),
});

export const collections = { blog };

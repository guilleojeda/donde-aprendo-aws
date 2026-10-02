import { z } from 'astro/zod';
import identities from '../data/blog-contributors.json' with { type: 'json' };
import { contributorSchema } from './blog-metadata.mjs';

export const BLOG_CONTRIBUTORS = z.record(z.string().min(1), contributorSchema).parse(identities);

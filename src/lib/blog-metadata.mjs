import { z } from 'astro/zod';

/** @typedef {{ type: 'Person' | 'Organization', name: string, url?: string }} BlogContributor */

export const contributorSchema = z.object({
  type: z.enum(['Person', 'Organization']),
  name: z.string().trim().min(1),
  url: z.url().refine((value) => ['https:', 'http:'].includes(new URL(value).protocol), {
    message: 'Contributor profiles must use an HTTP or HTTPS URL.',
  }).optional(),
}).strict();

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, { message: 'A real calendar date is required.' });
const timestamp = z.iso.datetime({ offset: true });

/** @param {Record<string, BlogContributor>} contributors */
export function createBlogMetadataSchema(contributors) {
  const contributor = z.string().min(1).refine((id) => Object.hasOwn(contributors, id), {
    message: 'Unknown blog contributor. Declare the confirmed identity in blog-contributors.json.',
  });
  return z.object({
    author: contributor,
    publishedAt: calendarDate,
    publishedTimestamp: timestamp,
    modifiedTimestamp: timestamp.optional(),
    review: z.object({
      date: calendarDate,
      by: contributor.optional(),
      note: z.string().trim().min(1).optional(),
    }).strict().optional(),
  }).superRefine((post, context) => {
    if (post.publishedTimestamp.slice(0, 10) !== post.publishedAt) {
      context.addIssue({ code: 'custom', path: ['publishedTimestamp'], message: 'Publication date and timestamp must agree.' });
    }
    if (post.modifiedTimestamp && Date.parse(post.modifiedTimestamp) < Date.parse(post.publishedTimestamp)) {
      context.addIssue({ code: 'custom', path: ['modifiedTimestamp'], message: 'Modification cannot precede publication.' });
    }
    if (post.review && post.review.date < post.publishedAt) {
      context.addIssue({ code: 'custom', path: ['review', 'date'], message: 'Review cannot precede publication.' });
    }
  });
}

/** @param {string} date */
export function formatBlogDate(date) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** @param {BlogContributor} contributor */
export function contributorStructuredData(contributor) {
  return { '@type': contributor.type, name: contributor.name, ...(contributor.url && { url: contributor.url }) };
}

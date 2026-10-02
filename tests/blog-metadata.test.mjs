import test from 'node:test';
import assert from 'node:assert/strict';
import { contributorSchema, createBlogMetadataSchema, formatBlogDate, contributorStructuredData } from '../src/lib/blog-metadata.mjs';

const person = { type: 'Person', name: 'Autora de prueba', url: 'https://example.com/autora' };
const team = { type: 'Organization', name: 'Equipo de prueba', url: 'https://example.com/equipo' };
const schema = createBlogMetadataSchema({ person, team });
const publication = { author: 'person', publishedAt: '2024-01-28', publishedTimestamp: '2024-01-28T00:31:55.771Z' };

test('publication remains exact and does not imply a modification or review', () => {
  assert.deepEqual(schema.parse(publication), publication);
  assert.equal(formatBlogDate('2024-01-28'), '28 de enero de 2024');
  assert.deepEqual(contributorStructuredData(person), { '@type': 'Person', name: person.name, url: person.url });
  assert.deepEqual(contributorStructuredData(team), { '@type': 'Organization', name: team.name, url: team.url });
  assert.ok(contributorSchema.safeParse({ type: 'Person', name: person.name }).success);
  assert.deepEqual(contributorStructuredData({ type: 'Person', name: person.name }),
    { '@type': 'Person', name: person.name });
});

test('modification and review are independent and retain the declared dates and identities', () => {
  const post = { ...publication, modifiedTimestamp: '2026-10-01T15:14:05-03:00',
    review: { date: '2026-09-29', by: 'team', note: 'Examen CLF-C02' } };
  assert.deepEqual(schema.parse(post), post);
  assert.ok(schema.safeParse({ ...publication, review: post.review }).success);
  assert.ok(schema.safeParse({ ...publication, modifiedTimestamp: post.modifiedTimestamp }).success);
  assert.ok(schema.safeParse({ ...publication, review: { date: '2026-09-29' } }).success);
});

test('unknown identities, incomplete reviews and non-web profiles are rejected', () => {
  assert.equal(schema.safeParse({ ...publication, author: 'unknown' }).success, false);
  assert.equal(schema.safeParse({ ...publication, author: undefined }).success, false);
  for (const review of [{ by: 'person' }, { date: '2026-09-29', by: 'unknown' }]) {
    assert.equal(schema.safeParse({ ...publication, review }).success, false);
  }
  assert.equal(contributorSchema.safeParse({ ...person, url: 'javascript:alert(1)' }).success, false);
  assert.equal(contributorSchema.safeParse({ ...person, name: ' ' }).success, false);
});

test('invalid calendar dates, inconsistent publication and reversed chronology are rejected', () => {
  assert.equal(schema.safeParse({ ...publication, publishedAt: '2024-01-27' }).success, false);
  assert.equal(schema.safeParse({ ...publication, modifiedTimestamp: '2023-01-01T00:00:00Z' }).success, false);
  assert.equal(schema.safeParse({ ...publication, review: { date: '2023-01-01', by: 'person' } }).success, false);
  assert.equal(schema.safeParse({ ...publication, review: { date: '2026-02-30', by: 'person' } }).success, false);
  assert.equal(schema.safeParse({ ...publication, modifiedTimestamp: '2026-10-01T15:14:05' }).success, false);
});

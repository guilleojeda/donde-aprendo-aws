import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectPublishedCatalog } from '../src/lib/catalog.mjs';
import { filterResources, sortResources } from '../src/lib/directory-filter.mjs';
import { recentResources, recommendedResources } from '../src/lib/resource-discovery.mjs';

function record(overrides = {}) {
  return {
    id: 'catalog-content', title: 'Un recurso', url: 'https://example.com/content',
    description: 'En español', category: 'Curso', order: 1, featured: false,
    kind: 'content', format: 'Curso', topics: [], published: true,
    ...overrides,
  };
}

test('projects only verified optional discovery fields and keeps private values out', () => {
  const [item] = projectPublishedCatalog([record({
    addedAt: '2026-09-25', country: 'PE', level: 'inicial', sourceId: 'fixture-source',
    submitterEmail: 'private@example.invalid',
  })]);
  assert.deepEqual([item.addedAt, item.country, item.level, item.sourceId], ['2026-09-25', 'PE', 'inicial', 'fixture-source']);
  assert.equal('submitterEmail' in item, false);
  assert.throws(() => projectPublishedCatalog([record({ addedAt: '2026-02-30' })]), /invalid addedAt/);
  assert.throws(() => projectPublishedCatalog([record({ country: 'XX' })]), /invalid country/);
  assert.throws(() => projectPublishedCatalog([record({ level: 'expert' })]), /invalid level/);
  assert.throws(() => projectPublishedCatalog([record({ sourceId: 'catalog-content' })]), /invalid sourceId/);
});

test('recent selection excludes entries without a known date and recommendation uses featured', () => {
  const old = record({ id: 'old', order: 10, featured: true });
  const recent = record({ id: 'recent', addedAt: '2026-09-25', featured: true });
  const earlier = record({ id: 'earlier', addedAt: '2026-08-10' });
  assert.deepEqual(recentResources([old, earlier, recent]).map(({ id }) => id), ['recent', 'earlier']);
  assert.deepEqual(recommendedResources([old, earlier, recent]).map(({ id }) => id), ['recent', 'old']);
  assert.deepEqual(sortResources([old, earlier, recent], 'recent').map(({ id }) => id), ['recent', 'earlier', 'old']);
});

test('country and level combine with existing filters', () => {
  const records = [
    { kind: 'content', format: 'Curso', topics: ['Certificaciones'], country: 'PE', level: 'inicial', search: 'AWS Girls Perú' },
    { kind: 'content', format: 'Curso', topics: ['Certificaciones'], country: 'AR', level: 'inicial', search: 'Curso AWS' },
    { kind: 'source', format: 'Blog', topics: [], country: 'PE', level: '', search: 'Blog Perú' },
  ];
  assert.deepEqual(filterResources(records, { kind: 'content', country: 'PE', level: 'inicial', query: 'peru' }), [records[0]]);
  assert.deepEqual(filterResources(records, { country: 'AR', level: 'inicial' }), [records[1]]);
});

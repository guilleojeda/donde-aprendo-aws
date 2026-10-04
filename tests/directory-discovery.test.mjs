import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectPublishedCatalog } from '../src/lib/catalog.mjs';
import { directoryListEntries, filterResources, sortResources } from '../src/lib/directory-filter.mjs';
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

test('explicit directory order stays stable while recommendations and recent sort use their own fields', () => {
  const records = [
    { id: 'group-b-featured', directoryIndex: 2, purposeGroupIndex: 1, featured: true, addedAt: '2026-09-01' },
    { id: 'group-a-unfeatured', directoryIndex: 0, purposeGroupIndex: 0, featured: false, addedAt: '2026-04-10' },
    { id: 'group-a-featured', directoryIndex: 1, purposeGroupIndex: 0, featured: true },
  ];
  assert.deepEqual(sortResources(records, 'directory').map(({ id }) => id), [
    'group-a-unfeatured', 'group-a-featured', 'group-b-featured',
  ]);
  assert.deepEqual(sortResources(records, 'recommended').map(({ id }) => id), [
    'group-b-featured', 'group-a-featured', 'group-a-unfeatured',
  ]);
  assert.deepEqual(sortResources(records, 'recent').map(({ id }) => id), [
    'group-b-featured', 'group-a-unfeatured', 'group-a-featured',
  ]);
  assert.deepEqual(sortResources(records, 'purpose').map(({ id }) => id), [
    'group-a-featured', 'group-a-unfeatured', 'group-b-featured',
  ]);
});

test('filtered and paginated views retain every resource node and headings only for visible groups', () => {
  const records = Array.from({ length: 13 }, (_, index) => ({
    id: `resource-${index}`,
    purposeGroupId: index < 10 ? 'foundations' : index < 12 ? 'exam-prep' : 'experiences',
    purposeGroupIndex: index < 10 ? 0 : index < 12 ? 1 : 2,
    purposeGroupLabel: index < 10 ? 'Fundamentos' : index < 12 ? 'Preparar un examen' : 'Experiencias',
    purposeGroupDescription: 'Orientación',
    topics: [index === 12 ? 'Experiencias' : 'Certificaciones'],
  }));
  const ordered = sortResources(records, 'purpose');
  const matching = filterResources(ordered, { query: '', topic: '' });
  const firstPage = matching.slice(0, 12);
  const pageEntries = directoryListEntries(ordered, firstPage, 'purpose');
  const pageResources = pageEntries.filter(({ type }) => type === 'resource');
  assert.deepEqual(pageResources.map(({ resource }) => resource.id), ordered.map(({ id }) => id));
  assert.equal(pageResources.filter(({ visible }) => visible).length, 12);
  assert.deepEqual(pageEntries.filter(({ type }) => type === 'heading').map(({ id }) => id), ['foundations', 'exam-prep']);

  const expandedEntries = directoryListEntries(ordered, matching.slice(0, 24), 'purpose');
  assert.equal(expandedEntries.filter(({ type, visible }) => type === 'resource' && visible).length, 13);

  const filtered = filterResources(ordered, { topic: 'Experiencias' });
  const filteredEntries = directoryListEntries(ordered, filtered, 'purpose');
  assert.deepEqual(filteredEntries.filter(({ type }) => type === 'resource').map(({ resource }) => resource.id), ordered.map(({ id }) => id));
  assert.deepEqual(filteredEntries.filter(({ type, visible }) => type === 'resource' && visible).map(({ resource }) => resource.id), ['resource-12']);
  assert.deepEqual(filteredEntries.filter(({ type }) => type === 'heading').map(({ id }) => id), ['experiences']);
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

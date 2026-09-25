import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterResources } from '../src/lib/directory-filter.mjs';
import { classifyLegacyResource, validateTaxonomy } from '../src/lib/resource-taxonomy.mjs';

test('classifies legacy URLs and medium categories without treating recordings as upcoming events', () => {
  assert.deepEqual(classifyLegacyResource({
    title: 'eScalando AWS', category: 'Certificaciones', url: 'https://www.youtube.com/@eScalandoAWS',
  }), { kind: 'source', format: 'Canal de YouTube', topics: ['Certificaciones'] });
  assert.deepEqual(classifyLegacyResource({
    title: 'Canal de aprendizaje', category: 'Canal de YouTube', url: 'https://www.youtube.com/@canal',
  }), { kind: 'source', format: 'Canal de YouTube', topics: [] });
  assert.deepEqual(classifyLegacyResource({
    title: 'ReCap AWS ReInvent 2023', category: 'Eventos', url: 'https://www.youtube.com/watch?v=example',
  }), { kind: 'content', format: 'Video', topics: ['Comunidad'] });
});

test('combines independent type, format, and topic filters with accent-insensitive search', () => {
  const records = [
    { kind: 'content', format: 'Video', topics: ['Seguridad'], search: 'Cómo usar IAM en AWS' },
    { kind: 'content', format: 'Artículo', topics: ['Seguridad'], search: 'Seguridad de S3' },
    { kind: 'source', format: 'Canal de YouTube', topics: ['Seguridad'], search: 'Canal de seguridad' },
  ];
  assert.deepEqual(filterResources(records, { kind: 'content', format: 'Video', topic: 'Seguridad', query: 'como' }), [records[0]]);
  assert.equal(filterResources(records, { kind: 'source', topic: 'Seguridad' }).length, 1);
  assert.equal(filterResources(records, { kind: 'content', topic: 'Redes' }).length, 0);
});

test('rejects invalid or repeated topics', () => {
  assert.throws(() => validateTaxonomy({ kind: 'content', format: 'Video', topics: ['Seguridad', 'Seguridad'] }), /invalid topics/);
  assert.throws(() => validateTaxonomy({ kind: 'content', format: 'Video', topics: ['No existe'] }), /invalid topics/);
});

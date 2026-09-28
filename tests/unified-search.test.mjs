import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateSearchData, buildSearchIndex, searchIndex } from '../src/lib/unified-search.mjs';

const posts = [{
  id: 'seguridad-de-s3',
  data: { title: 'Seguridad de Amazon S3', description: 'Guía de buckets privados.', publishedAt: '2025-01-02' },
  body: '<h2 id="example">Políticas de <strong>acceso</strong> y &amp; permisos</h2>',
}];
const resource = {
  id: 'curso-1', kind: 'content', title: 'Curso básico de AWS', description: 'Aprender desde cero.',
  format: 'Curso', category: 'Formación', topics: ['Certificaciones'], country: 'AR', level: 'inicial',
  submitterEmail: 'private@example.com', url: 'https://example.com/curso',
};
const upcoming = {
  recordType: 'event', id: 'future-1', title: 'Encuentro S3', description: 'Charla sobre almacenamiento.',
  organizer: 'AWS User Group', place: 'Córdoba', country: 'AR', mode: 'in-person',
  startsAt: '2100-01-01T10:00:00-03:00', endsAt: '2100-01-01T11:00:00-03:00',
  registrationUrl: 'https://example.com/evento',
};

test('build index includes all public blog and visible catalog destinations without private fields', () => {
  const expired = { ...upcoming, id: 'expired-1', endsAt: '2020-01-01T11:00:00-03:00', startsAt: '2020-01-01T10:00:00-03:00' };
  const index = buildSearchIndex(posts, [resource, upcoming, expired]);
  assert.deepEqual(index.map(({ type, url }) => [type, url]), [
    ['article', '/blog/seguridad-de-s3/'],
    ['content', '/aprender/#resource-curso-1'],
    ['event', '/eventos/#event-future-1'],
  ]);
  assert.match(index[0].search, /Políticas de acceso y & permisos/);
  assert.equal(index[2].endsAt, upcoming.endsAt);
  assert.doesNotMatch(JSON.stringify(index), /private@example.com|submitterEmail/);
});

test('search is accent-insensitive, ranked, scoped and returns no result for missing terms', () => {
  const index = buildSearchIndex(posts, [resource, upcoming]);
  assert.equal(searchIndex(index, 'seguridad S3')[0].url, '/blog/seguridad-de-s3/');
  assert.deepEqual(searchIndex(index, 'politicas, acceso!', 'article').map((entry) => entry.url), ['/blog/seguridad-de-s3/']);
  assert.deepEqual(searchIndex(index, 'curso', 'community'), []);
  assert.deepEqual(searchIndex(index, 'no-existe'), []);
  assert.deepEqual(searchIndex(index, 'Encuentro', 'event', Date.parse('2100-01-01T11:00:00-03:00')), []);
});

test('analytics payload contains only bounded aggregate values, never the search text', () => {
  const payload = aggregateSearchData('secreto personal', 'article', 0);
  assert.deepEqual(payload, { content_type: 'article', query_length_bucket: '10-24', result_bucket: '0' });
  assert.doesNotMatch(JSON.stringify(payload), /secreto|personal/);
});

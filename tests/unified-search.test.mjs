import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateSearchData, buildSearchIndex, searchIndex } from '../src/lib/unified-search.mjs';
import { landingSearchPages } from '../src/lib/landing-search.mjs';

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
  assert.deepEqual(index[1].topics, ['Formación', 'Certificaciones']);
  assert.equal(index[1].metadata, 'AR inicial');
  assert.equal(index[2].endsAt, upcoming.endsAt);
  assert.equal(index[2].metadata, 'Córdoba AR');
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

test('topic-focused results outrank incidental mentions for realistic Spanish AWS queries', () => {
  const index = [
    {
      type: 'article', title: 'Seguridad en AWS', description: 'Protegé servicios como Amazon S3.',
      search: 'Gestión de identidades y control de acceso', url: '/generic-security/',
    },
    {
      type: 'article', title: 'Mejores prácticas para Amazon S3', description: 'Protegé objetos y buckets.',
      search: 'Seguridad y acceso a los datos', url: '/security-s3/',
    },
    {
      type: 'content', title: 'Curso práctico de AWS', description: 'Aprendé fundamentos de la nube.',
      topics: ['Seguridad', 'Amazon S3'], search: '', url: '/course-security-s3/',
    },
    {
      type: 'article', title: 'AWS S3Storage', description: 'Una herramienta auxiliar.',
      search: '', url: '/s3storage/',
    },
  ];

  const cases = [
    ['seguridad en S3', ['/course-security-s3/', '/security-s3/', '/generic-security/']],
    ['mejores prácticas de Amazon S3', ['/security-s3/']],
    ['seguridad y acceso a Amazon S3', ['/security-s3/', '/generic-security/']],
  ];
  for (const [query, expectedUrls] of cases) {
    assert.deepEqual(searchIndex(index, query).map(({ url }) => url), expectedUrls, query);
  }
  assert.deepEqual(searchIndex(index, 'seguridad en S3').map(({ url }) => url),
    searchIndex(index, 'seguridad S3').map(({ url }) => url));
  assert.deepEqual(searchIndex(index, 'S3').map(({ url }) => url), [
    '/security-s3/', '/course-security-s3/', '/generic-security/',
  ]);
});

test('analytics payload contains only bounded aggregate values, never the search text', () => {
  const payload = aggregateSearchData('secreto personal', 'article', 0);
  assert.deepEqual(payload, { content_type: 'article', query_length_bucket: '10-24', result_bucket: '0' });
  assert.doesNotMatch(JSON.stringify(payload), /secreto|personal/);
});

test('route and collection destinations remain discoverable without inheriting individual event expiry', () => {
  const index = buildSearchIndex([], [], [{ id: 'primeros-pasos', title: 'Aprender AWS desde cero', intro: 'Paso a paso', audience: 'Para empezar' }], [
    { path: '/eventos/argentina/', title: 'Eventos AWS en Argentina', description: 'Meetups y charlas', label: 'Agenda por país', search: 'AR', submitterEmail: 'private@example.com' },
    { path: '/aprender/cursos/', title: 'Cursos AWS en español', description: 'Clases y cursos', label: 'Cursos' },
  ]);
  assert.equal(index[0].url, '/recorridos/primeros-pasos/');
  assert.equal(searchIndex(index, 'eventos AWS Argentina', '', Date.parse('2200-01-01'))[0].url, '/eventos/argentina/');
  assert.equal(searchIndex(index, 'cursos AWS', 'collection')[0].url, '/aprender/cursos/');
  assert.doesNotMatch(JSON.stringify(index), /submitterEmail|private@example.com/);
});

test('a former program name finds the current student community collection', () => {
  const index = buildSearchIndex([], [], [], landingSearchPages([]));
  assert.equal(searchIndex(index, 'AWS Cloud Clubs', 'collection')[0].url, '/comunidades/estudiantes/');
});

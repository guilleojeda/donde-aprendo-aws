import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectPublishedCatalog } from '../src/lib/catalog.mjs';
import { aggregateSearchData, buildSearchIndex, searchIndex } from '../src/lib/unified-search.mjs';
import { landingSearchPages } from '../src/lib/landing-search.mjs';
import { unifiedSearchLifecycleFixture } from './fixtures/unified-search-lifecycle.mjs';

const lifecycleCommunities = ['community-cordoba', 'community-rosario'];

function projectLifecycleCatalog(ids, { includeCompetitor = false } = {}) {
  const selected = new Set([...ids, ...lifecycleCommunities, ...(includeCompetitor ? ['search-competitor'] : [])]);
  return projectPublishedCatalog(
    unifiedSearchLifecycleFixture.items.filter(({ id }) => selected.has(id)),
    {
      profiles: unifiedSearchLifecycleFixture.profiles,
      placements: unifiedSearchLifecycleFixture.placements.filter(({ resourceId }) => selected.has(resourceId)),
      series: unifiedSearchLifecycleFixture.series,
    },
  );
}

function downloadedSearchIndex(catalog) {
  const index = JSON.parse(JSON.stringify(buildSearchIndex([], catalog)));
  return { index, snapshot: JSON.stringify(index) };
}

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

test('course collection search indexes the same resolved free-study FAQ as the rendered page', () => {
  const freeCourse = {
    ...resource,
    id: 'mixtli-challenge',
    title: 'AWS Certification Challenge 2026 — AWS User Group Mixtli',
    url: 'https://awsugmixtli.com/certification-challenge',
  };
  const landingPages = landingSearchPages([freeCourse]);
  const courseLanding = landingPages.find(({ path }) => path === '/aprender/cursos/');
  const index = buildSearchIndex([], [freeCourse], [], landingPages);
  const courseEntry = index.find(({ type, url }) => type === 'collection' && url === '/aprender/cursos/');

  assert.ok(courseLanding.search.includes('AWS User Group Mixtli comparte materiales de estudio gratuitos'));
  assert.ok(courseLanding.search.includes('¿Hay cursos de AWS gratis?'));
  assert.ok(courseEntry.search.includes('AWS Certification Challenge 2026'));
  assert.equal(searchIndex(index, 'materiales de estudio gratuitos Mixtli', 'collection')[0].url, '/aprender/cursos/');

  const fallbackLanding = landingSearchPages([]).find(({ path }) => path === '/aprender/cursos/');
  assert.ok(fallbackLanding.search.includes('¿Cómo compruebo si un curso de AWS es gratis?'));
  assert.ok(fallbackLanding.search.includes('página del proveedor antes de inscribirte'));
  assert.equal(fallbackLanding.search.includes('AWS Certification Challenge 2026'), false);
});

test('a serialized event index switches to the surviving representative using only its active public facts', () => {
  const catalog = projectLifecycleCatalog([
    'event-a-old-representative', 'event-z-current-representative', 'event-unpublished-private',
  ], { includeCompetitor: true });
  const eventIds = catalog.filter(({ recordType }) => recordType === 'event').map(({ id }) => id).sort();
  assert.deepEqual(eventIds, ['event-a-old-representative', 'event-z-current-representative']);

  const { index, snapshot } = downloadedSearchIndex(catalog);
  assert.doesNotMatch(snapshot, /private-event-field|private-profile@example\.invalid|private-series-field/);

  assert.deepEqual(searchIndex(index, 'Taller AWS', 'event', Date.parse('2100-01-01T10:30:00Z'))
    .map(({ title, url, meta }) => [title, url, meta]), [
    ['Taller AWS', '/eventos/argentina/#event-event-a-old-representative', 'Comunidad Norte'],
  ]);

  const afterFirstEnd = Date.parse('2100-01-01T11:30:00Z');
  const survivingResult = searchIndex(index, 'Taller AWS', 'event', afterFirstEnd)[0];
  assert.deepEqual({
    title: survivingResult?.title,
    description: survivingResult?.description,
    url: survivingResult?.url,
    meta: survivingResult?.meta,
    endsAt: survivingResult?.endsAt,
  }, {
    title: 'TALLER ÁWS',
    description: 'Arquitectura AWS en español',
    url: '/eventos/argentina/#event-event-z-current-representative',
    meta: 'Comunidad Sur Confidencial',
    endsAt: '2100-01-01T12:00:00Z',
  });
  assert.deepEqual(searchIndex(index, 'Comunidad Sur PE Rosario', 'event', afterFirstEnd)
    .map(({ url }) => url), ['/eventos/argentina/#event-event-z-current-representative']);
  assert.deepEqual(searchIndex(index, 'Comunidad Norte', 'event', afterFirstEnd), []);
  assert.deepEqual(searchIndex(index, 'Taller AWS', 'event', Date.parse('2100-01-01T12:00:00Z')), []);
  assert.equal(JSON.stringify(index), snapshot, 'searching later does not mutate the downloaded index');
});

test('active representative fields rank against a literal content competitor', () => {
  const catalog = projectLifecycleCatalog([
    'event-a-old-representative', 'event-z-current-representative',
  ], { includeCompetitor: true });
  const { index } = downloadedSearchIndex(catalog);
  const afterFirstEnd = Date.parse('2100-01-01T11:30:00Z');

  assert.deepEqual(searchIndex(index, 'Taller secreto', '', afterFirstEnd)
    .map(({ type, url }) => [type, url]), [['content', '/aprender/#resource-search-competitor']]);
  assert.deepEqual(searchIndex(index, 'Taller confidencial', '', afterFirstEnd)
    .map(({ type, url }) => [type, url]), [
    ['content', '/aprender/#resource-search-competitor'],
    ['event', '/eventos/argentina/#event-event-z-current-representative'],
  ]);
});

test('event member and association additions are allowlisted before index serialization', () => {
  const catalog = projectLifecycleCatalog(['event-series-active', 'event-series-expired']);
  const expiredMember = catalog.find(({ id }) => id === 'event-series-expired');
  expiredMember.unknownLifecycleSentinel = 'private-lifecycle-sentinel';
  expiredMember.series[0].unknownAssociationSentinel = 'private-association-sentinel';
  const serialized = JSON.stringify(buildSearchIndex([], catalog));

  assert.doesNotMatch(serialized, /private-profile@example\.invalid|private-series-field|private-lifecycle-sentinel|private-association-sentinel|Serie Oculta/);
});

test('a serialized cohost index drops ended-only creator facts and keeps a shared series once', () => {
  const catalog = projectLifecycleCatalog(['event-series-active', 'event-series-expired']);
  const { index, snapshot } = downloadedSearchIndex(catalog);
  assert.doesNotMatch(snapshot, /private-profile@example\.invalid|private-series-field|Serie Oculta/);

  const beforeExpiry = Date.parse('2100-02-01T10:30:00Z');
  const afterExpiry = Date.parse('2100-02-01T11:30:00Z');
  assert.deepEqual(searchIndex(index, 'Creador Efímero', 'event', beforeExpiry)
    .map(({ url }) => url), ['/eventos/argentina/#event-event-series-active']);
  assert.deepEqual(searchIndex(index, 'Creador Efímero', 'event', afterExpiry), []);

  const sharedSeriesResults = searchIndex(index, 'Serie Compartida', 'event', afterExpiry);
  assert.equal(sharedSeriesResults.length, 1);
  assert.equal(sharedSeriesResults[0].url, '/eventos/argentina/#event-event-series-active');
  assert.deepEqual(sharedSeriesResults[0].series, [{
    seriesId: 'series-shared',
    name: 'Serie Compartida',
    creatorName: 'Creador Compartido',
    href: '/c/creador-compartido/series/serie-compartida/',
  }]);
  assert.equal(JSON.stringify(index), snapshot, 'the cached event facts remain unchanged after expiry');
});

test('serialized event groups merge across prior groups after a venue representative expires', () => {
  const mergeCatalog = projectLifecycleCatalog(['event-merge-a', 'event-merge-b', 'event-merge-c']);
  const merge = downloadedSearchIndex(mergeCatalog);
  const beforeMergeMemberEnds = Date.parse('2100-03-01T10:30:00Z');
  const afterMergeMemberEnds = Date.parse('2100-03-01T11:30:00Z');

  assert.deepEqual(searchIndex(merge.index, 'Taller AWS', 'event', beforeMergeMemberEnds)
    .map(({ url }) => url), [
    '/eventos/argentina/#event-event-merge-a',
    '/eventos/argentina/#event-event-merge-c',
  ]);
  assert.deepEqual(searchIndex(merge.index, 'Taller AWS', 'event', afterMergeMemberEnds)
    .map(({ url }) => url), ['/eventos/argentina/#event-event-merge-b']);
  assert.deepEqual(searchIndex(merge.index, 'Auditorio Córdoba', 'event', afterMergeMemberEnds)
    .map(({ url }) => url), ['/eventos/argentina/#event-event-merge-b']);
  assert.deepEqual(searchIndex(merge.index, 'Serie B Serie C', 'event', afterMergeMemberEnds)
    .map(({ url, series }) => [url, series.map(({ seriesId }) => seriesId)]), [[
    '/eventos/argentina/#event-event-merge-b', ['series-merge-b', 'series-merge-c'],
  ]]);
  assert.equal(JSON.stringify(merge.index), merge.snapshot);
});

test('serialized event groups split after an early representative expires', () => {
  const splitCatalog = projectLifecycleCatalog(['event-split-a', 'event-split-b', 'event-split-c']);
  const split = downloadedSearchIndex(splitCatalog);
  assert.deepEqual(searchIndex(split.index, 'AWS', 'event', Date.parse('2100-04-01T10:30:00Z'))
    .map(({ url }) => url), ['/eventos/argentina/#event-event-split-a']);
  assert.deepEqual(searchIndex(split.index, 'AWS', 'event', Date.parse('2100-04-01T11:30:00Z'))
    .map(({ url }) => url), [
    '/eventos/argentina/#event-event-split-b',
    '/eventos/argentina/#event-event-split-c',
  ]);
  assert.equal(JSON.stringify(split.index), split.snapshot);
});

test('downloaded legacy entries remain single events and distinct starts remain separate', () => {
  const legacyEntry = {
    type: 'event', title: 'Evento legado', description: 'Evento anterior',
    url: '/eventos/#event-evento-legado', meta: 'Organizador legado', metadata: 'AR',
    endsAt: '2100-06-01T12:00:00Z',
  };
  assert.deepEqual(searchIndex([legacyEntry], 'Evento legado', 'event', Date.parse('2100-06-01T11:30:00Z'))
    .map(({ url }) => url), ['/eventos/#event-evento-legado']);
  assert.deepEqual(searchIndex([legacyEntry], 'Evento legado', 'event', Date.parse('2100-06-01T12:00:00Z')), []);

  const catalog = projectLifecycleCatalog(['event-distinct-start-a', 'event-distinct-start-b']);
  const { index } = downloadedSearchIndex(catalog);
  assert.deepEqual(searchIndex(index, 'Sesión con doble horario', 'event', Date.parse('2100-05-01T10:30:00Z'))
    .map(({ url }) => url), [
    '/eventos/argentina/#event-event-distinct-start-a',
    '/eventos/argentina/#event-event-distinct-start-b',
  ]);
});

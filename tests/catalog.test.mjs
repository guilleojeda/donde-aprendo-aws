import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';

import {
  loadCatalog,
  projectPublishedCatalog,
  resolveCatalogConfig,
  validateCatalogUrl,
} from '../src/lib/catalog.mjs';

function record(overrides = {}) {
  return {
    id: 'catalog-test',
    title: 'Recurso de prueba',
    url: 'https://example.test/resource?source=aws&lang=es',
    description: 'Descripción pública',
    category: 'Curso',
    order: 10,
    featured: false,
    published: true,
    ...overrides,
  };
}

function scanPages(pages) {
  const calls = [];
  const scanPage = async (params) => {
    calls.push(params);
    const page = pages[calls.length - 1];
    if (page instanceof Error) {
      throw page;
    }
    return page;
  };
  return { calls, scanPage };
}

async function withoutEnvironment(overrides, callback) {
  const previous = new Map();
  for (const [name, value] of Object.entries(overrides)) {
    previous.set(name, process.env[name]);
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  try {
    return await callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('projects only published public fields and sorts by descending order', () => {
  const result = projectPublishedCatalog([
    record({
      id: 'second',
      order: 20,
      email: 'private-sentinel@example.test',
      submitterName: 'Private Sentinel',
    }),
    record({ id: 'first', order: 10, published: true }),
    record({ id: 'hidden', published: false, email: 'must-not-leak@example.test' }),
    { id: 'legacy-without-flag', email: 'also-private@example.test' },
  ]);

  assert.deepEqual(result, [
    {
      id: 'second',
      title: 'Recurso de prueba',
      url: 'https://example.test/resource?source=aws&lang=es',
      description: 'Descripción pública',
      category: 'Curso',
      order: 20,
      featured: false,
      kind: 'content',
      format: 'Curso',
      topics: [],
    },
    {
      id: 'first',
      title: 'Recurso de prueba',
      url: 'https://example.test/resource?source=aws&lang=es',
      description: 'Descripción pública',
      category: 'Curso',
      order: 10,
      featured: false,
      kind: 'content',
      format: 'Curso',
      topics: [],
    },
  ]);
  assert.equal(JSON.stringify(result).includes('private-sentinel'), false);
});

test('rejects malformed publication flags instead of coercing strings', () => {
  assert.throws(
    () => projectPublishedCatalog([record({ published: 'true' })]),
    /malformed published flag/,
  );
  assert.throws(
    () => projectPublishedCatalog([record({ published: 1 })]),
    /malformed published flag/,
  );
});

test('uses explicit public taxonomy and never exposes private submission fields', () => {
  const result = projectPublishedCatalog([record({
    kind: 'source', format: 'Newsletter', topics: ['Serverless'],
    submitterEmail: 'private@example.invalid',
  })]);
  assert.deepEqual(result[0].topics, ['Serverless']);
  assert.equal(result[0].kind, 'source');
  assert.equal(JSON.stringify(result).includes('private@example.invalid'), false);
  assert.throws(() => projectPublishedCatalog([record({ kind: 'unknown', format: 'Video', topics: [] })]), /invalid kind/);
});

test('rejects unsafe URLs and preserves valid query strings', () => {
  assert.equal(validateCatalogUrl('https://example.test/a?x=1&next=%2Fcurso'), 'https://example.test/a?x=1&next=%2Fcurso');
  assert.throws(() => validateCatalogUrl('javascript:alert(1)'), /unsafe URL/);
  assert.throws(() => validateCatalogUrl('data:text/html,unsafe'), /unsafe URL/);
  assert.throws(() => validateCatalogUrl('https://user:password@example.test/private'), /unsafe URL/);
});

test('exhausts paginated scans and sends the continuation key', async () => {
  const pages = scanPages([
    { Items: [record({ id: 'later', order: 20 })], LastEvaluatedKey: { id: 'page-1' } },
    { Items: [record({ id: 'first', order: 10 })] },
  ]);

  const result = await loadCatalog({ tableName: 'catalog', scanPage: pages.scanPage });
  assert.deepEqual(result.map(({ id }) => id), ['later', 'first']);
  assert.equal(pages.calls.length, 2);
  assert.deepEqual(pages.calls[1].ExclusiveStartKey, { id: 'page-1' });
  assert.equal(pages.calls[0].TableName, 'catalog');
  assert.equal(pages.calls[0].Select, 'SPECIFIC_ATTRIBUTES');
  assert.match(pages.calls[0].ProjectionExpression, /published/);
  assert.match(pages.calls[0].ProjectionExpression, /#registrationUrl/);
  assert.match(pages.calls[0].ProjectionExpression, /#eventId/);
  assert.match(pages.calls[0].ProjectionExpression, /#venueCountry/);
  assert.match(pages.calls[0].ProjectionExpression, /#city/);
  assert.equal(pages.calls[0].ExpressionAttributeNames['#venueCountry'], 'venueCountry');
  assert.equal(pages.calls[0].ExpressionAttributeNames['#city'], 'city');
  assert.equal(pages.calls[0].ProjectionExpression.includes('*'), false);
  assert.equal(pages.calls[0].ConsistentRead, true);
});

test('projects physical venue country separately from organizer country and only exposes community city', () => {
  const event = {
    recordType: 'event', id: 'event-us-venue', title: 'AWS presencial',
    description: 'Una sesión en una sede de Estados Unidos.',
    startsAt: '2026-10-20T18:00:00Z', endsAt: '2026-10-20T20:00:00Z', timeZone: 'UTC',
    organizer: 'Comunidad argentina', mode: 'in-person', registrationUrl: 'https://example.test/event',
    place: 'Centro de eventos', country: 'AR', venueCountry: 'US', city: 'Seattle',
    communityId: 'meetup-123', published: true, editorNote: 'private sentinel',
  };
  const community = record({
    id: 'meetup-123', kind: 'community', format: 'User Group', topics: ['Comunidad'], country: 'AR', city: 'Córdoba',
    contactEmail: 'private@example.test',
  });
  const contentWithUnapprovedCity = record({ id: 'resource-city', city: 'must stay private' });
  const projected = projectPublishedCatalog([event, community, contentWithUnapprovedCity]);
  const publicEvent = projected.find(({ id }) => id === event.id);
  const publicCommunity = projected.find(({ id }) => id === community.id);
  const publicContent = projected.find(({ id }) => id === contentWithUnapprovedCity.id);

  assert.equal(publicEvent.country, 'AR');
  assert.equal(publicEvent.venueCountry, 'US');
  assert.equal(publicEvent.city, 'Seattle');
  assert.equal(JSON.stringify(publicEvent).includes('private sentinel'), false);
  assert.equal(publicCommunity.country, 'AR');
  assert.equal(publicCommunity.city, 'Córdoba');
  assert.equal(JSON.stringify(publicCommunity).includes('private@example.test'), false);
  assert.equal(Object.hasOwn(publicContent, 'city'), false);
});

test('validates community city and venue country without changing organizer-country rules', () => {
  const community = (city) => record({
    id: 'community-city', kind: 'community', format: 'User Group', topics: ['Comunidad'], city,
  });
  const event = (overrides = {}) => ({
    recordType: 'event', id: 'event-venue-country', title: 'AWS presencial', description: '',
    startsAt: '2026-10-20T18:00:00Z', endsAt: '2026-10-20T20:00:00Z', timeZone: 'UTC',
    organizer: 'Comunidad', mode: 'in-person', registrationUrl: 'https://example.test/event',
    place: 'Centro de eventos', country: 'AR', published: true, ...overrides,
  });

  assert.equal(projectPublishedCatalog([community('x'.repeat(100))])[0].city, 'x'.repeat(100));
  for (const city of ['  Córdoba', 'Córdoba  ', 'x'.repeat(101), 'Córdoba\n']) {
    assert.throws(() => projectPublishedCatalog([community(city)]), /invalid city/);
  }
  assert.equal(projectPublishedCatalog([event({ venueCountry: 'US' })])[0].venueCountry, 'US');
  for (const venueCountry of ['us', 'USA', ' U S', '1A', '']) {
    assert.throws(() => projectPublishedCatalog([event({ venueCountry })]), /invalid venueCountry/);
  }
  assert.throws(() => projectPublishedCatalog([event({ country: 'US' })]), /invalid country/);
  assert.throws(() => projectPublishedCatalog([event({ mode: 'online', venueCountry: 'US' })]), /invalid venueCountry/);
});

test('fails on a later page instead of returning a partial catalog', async () => {
  const pages = scanPages([
    { Items: [record({ id: 'first' })], LastEvaluatedKey: { id: 'page-1' } },
    new Error('connection closed'),
  ]);
  await assert.rejects(
    loadCatalog({ tableName: 'catalog', scanPage: pages.scanPage }),
    /Catalog scan failed on page 2: connection closed/,
  );
});

test('fails closed on a malformed pagination key', async () => {
  const { scanPage } = scanPages([{ Items: [], LastEvaluatedKey: 'not-a-key' }]);
  await assert.rejects(
    loadCatalog({ tableName: 'catalog', scanPage }),
    /malformed pagination key/,
  );
});

test('accepts a valid empty published result', async () => {
  const { scanPage } = scanPages([{ Items: [] }]);
  assert.deepEqual(await loadCatalog({ tableName: 'catalog', scanPage }), []);
});

test('uses an explicitly selected fixture and rejects conflicting source config', async () => {
  await withoutEnvironment({ CATALOG_TABLE: undefined }, async () => {
    const fixturePath = resolve('tests/fixtures/catalog.json');
    const fixtureCatalog = await loadCatalog({ fixturePath });
    const fixtureResources = fixtureCatalog.filter((item) => item.recordType !== 'event');
    assert.deepEqual(fixtureResources.map(({ id }) => id), [
      'fixture-featured', 'fixture-source', 'fixture-community', 'fixture-community-argentina',
      'fixture-student-argentina', 'fixture-student-colombia', 'fixture-no-country-community',
      'fixture-community-costa-rica', 'fixture-no-country-reference', 'fixture-recording-argentina', 'fixture-recording-costa-rica',
    ]);
    assert.deepEqual(fixtureResources.slice(0, 3), [
      {
        id: 'fixture-featured',
        title: 'Curso de ejemplo',
        url: 'https://example.com/curso?utm_source=fixture&lang=es',
        description: 'Descripción pública de ejemplo.',
        category: 'Curso',
        order: 10,
        featured: true,
        kind: 'content',
        format: 'Curso',
        topics: [],
        addedAt: '2026-09-25',
        country: 'AR',
        level: 'inicial',
        sourceId: 'fixture-source',
        communityId: 'fixture-community',
      },
      {
        id: 'fixture-source',
        title: 'Canal de ejemplo',
        url: 'https://example.com/canal',
        description: 'Videos sobre seguridad.',
        category: 'Canal de YouTube',
        order: 9,
        featured: true,
        kind: 'source',
        format: 'Canal de YouTube',
        topics: ['Seguridad'],
        country: 'AR',
      },
      {
        id: 'fixture-community',
        title: 'Comunidad de ejemplo',
        url: 'https://example.com/comunidad',
        description: 'Grupo para aprender AWS.',
        category: 'Comunidad',
        order: 8,
        featured: false,
        kind: 'community',
        format: 'User Group',
        topics: ['Arquitectura'],
        country: 'PE',
        city: 'Lima',
      },
    ]);
    const allowedResourceFields = new Set([
      'id', 'title', 'url', 'description', 'category', 'order', 'featured', 'kind', 'format', 'topics',
      'addedAt', 'country', 'city', 'level', 'sourceId', 'communityId', 'eventId',
    ]);
    assert.ok(fixtureResources.every((resource) => Object.keys(resource).every((field) => allowedResourceFields.has(field))));
    assert.deepEqual(fixtureResources.slice(3).map(({ id, kind, format, country, city, topics }) => [id, kind, format, country, city, topics]), [
      ['fixture-community-argentina', 'community', 'User Group', 'AR', 'Córdoba', ['Arquitectura']],
      ['fixture-student-argentina', 'community', 'Student Builder Group', 'AR', undefined, ['Seguridad']],
      ['fixture-student-colombia', 'community', 'Student Builder Group', 'CO', 'Bogotá', ['Comunidad']],
      ['fixture-no-country-community', 'community', 'Comunidad en línea', undefined, undefined, []],
      ['fixture-community-costa-rica', 'community', 'User Group', 'CR', undefined, []],
      ['fixture-no-country-reference', 'content', 'Artículo', undefined, undefined, ['Comunidad']],
      ['fixture-recording-argentina', 'content', 'Video', 'AR', undefined, ['Comunidad']],
      ['fixture-recording-costa-rica', 'content', 'Video', 'CR', undefined, ['Comunidad']],
    ]);
    const publicEvents = fixtureCatalog.filter((item) => item.recordType === 'event');
    assert.deepEqual(publicEvents.map((item) => item.id),
      ['fixture-event', 'fixture-event-colombia', 'fixture-online-event', 'fixture-past-argentina', 'fixture-past-costa-rica', 'fixture-past-unrecorded']);
    assert.equal(publicEvents.find(({ id }) => id === 'fixture-event-colombia').venueCountry, 'PE');
    assert.equal(publicEvents.find(({ id }) => id === 'fixture-past-unrecorded').city, undefined);
    assert.throws(
      () => resolveCatalogConfig({ fixturePath, tableName: 'catalog' }),
      /Catalog source conflict/,
    );
    assert.equal(resolveCatalogConfig({ tableName: 'catalog' }, {}).region, 'us-east-1');
  });
});

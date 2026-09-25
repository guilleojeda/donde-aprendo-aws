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
    assert.deepEqual(await loadCatalog({ fixturePath }), [
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
        topics: [],
        country: 'PE',
      },
    ]);
    assert.throws(
      () => resolveCatalogConfig({ fixturePath, tableName: 'catalog' }),
      /Catalog source conflict/,
    );
    assert.equal(resolveCatalogConfig({ tableName: 'catalog' }, {}).region, 'us-east-1');
  });
});

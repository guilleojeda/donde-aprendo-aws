import assert from 'node:assert/strict';
import { test } from 'node:test';

import { main } from '../scripts/import-catalog.mjs';
import {
  importCatalog,
  mapTsvRows,
  parseCatalogTsv,
  stableCatalogId,
} from '../src/lib/catalog-import.mjs';
import { currentUrlReservationId } from '../src/lib/catalog-url.mjs';

const TSV_HEADERS = 'title\turl\ttext\tCategory\tHide\tRank\timgUrl\tOrder\tDestacado';

async function withoutEnvironment(overrides, callback) {
  const previous = new Map();
  for (const [name, value] of Object.entries(overrides)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
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

function syntheticTsv(count = 95) {
  const featured = new Set([2, 20, 50, 80]);
  const rows = Array.from({ length: count }, (_, index) => {
    const description = index === 6 ? '' : `Descripción ${index}`;
    const category = ['Curso', 'Blog', 'Otros'][index % 3];
    return [
      `Recurso ${index}`,
      `https://example.test/recurso/${index}?utm_source=directory&item=${index}`,
      description,
      category,
      index === 0 ? 'FALSE' : '',
      '',
      '',
      String(1000 + index),
      featured.has(index) ? '1' : '',
    ].join('\t');
  });
  return `${TSV_HEADERS}\n${rows.join('\n')}\n`;
}

test('maps all 95 TSV rows through the dry-run path', async () => {
  const tsv = syntheticTsv();
  const mapped = mapTsvRows(parseCatalogTsv(tsv));
  assert.equal(mapped.length, 95);
  assert.equal(mapped.filter((record) => record.published).length, 95);
  assert.equal(mapped.filter((record) => record.featured).length, 4);
  assert.equal(mapped[6].description, '');
  assert.equal(mapped[2].url, 'https://example.test/recurso/2?utm_source=directory&item=2');
  assert.equal(mapped[2].category, 'Otros');
  assert.equal(mapped[2].order, 1002);

  let output;
  let importCalled = false;
  const result = await main(['--dry-run', 'directory.tsv'], {
    readFile: async () => tsv,
    write: (json) => { output = JSON.parse(json); },
    importCatalog: async () => { importCalled = true; },
  });
  assert.equal(result.dryRun, true);
  assert.equal(output.count, 95);
  assert.equal(output.published, 95);
  assert.equal(importCalled, false);
});

test('uses stable IDs and preserves the exact destination URL', () => {
  const url = 'https://example.test/resource?b=2&a=1';
  assert.equal(stableCatalogId(url), stableCatalogId(url));
  assert.notEqual(stableCatalogId(url), stableCatalogId(`${url}&extra=1`));
  const record = mapTsvRows(parseCatalogTsv(`${TSV_HEADERS}\nTitle\t${url}\t\tCurso\t\t\t\t7\t\n`))[0];
  assert.equal(record.url, url);
  assert.equal(record.description, '');
  assert.equal(record.published, true);
});

test('account guard runs before any import writes', async () => {
  const records = mapTsvRows(parseCatalogTsv(`${TSV_HEADERS}\nTitle\thttps://example.test/item\tDescription\tCurso\t\t\t\t7\t\n`));
  let writes = 0;
  await assert.rejects(
    importCatalog(records, {
      tableName: 'catalog',
      getCallerIdentity: async () => ({ Account: '000000000000' }),
      putItem: async () => { writes += 1; },
    }),
    /account guard failed/,
  );
  assert.equal(writes, 0);
});

test('preflights imported resource ID bytes before identity checks or catalog access', async () => {
  const records = mapTsvRows(parseCatalogTsv(`${TSV_HEADERS}\nTitle\thttps://example.test/item\tDescription\tCurso\t\t\t\t7\t\n`));
  assert.equal(Buffer.byteLength(records[0].id, 'utf8'), 40, 'the existing catalog-hash ID format remains supported');
  records[0].id = `${'é'.repeat(128)}a`;
  assert.equal(Buffer.byteLength(records[0].id, 'utf8'), 257);

  let identityReads = 0;
  let catalogReads = 0;
  let writes = 0;
  await assert.rejects(importCatalog(records, {
    tableName: 'catalog',
    getCallerIdentity: async () => { identityReads += 1; return { Account: '719535286359' }; },
    getItem: async () => { catalogReads += 1; return {}; },
    transactWrite: async () => { writes += 1; },
  }));
  assert.deepEqual([identityReads, catalogReads, writes], [0, 0, 0],
    'invalid source data is rejected before AWS identity, reads, or writes');
});

test('conditional import skips an edited or unpublished existing item', async () => {
  const records = mapTsvRows(parseCatalogTsv(`${TSV_HEADERS}
One\thttps://example.test/one\tOriginal one\tCurso\t\t\t\t1\t
Two\thttps://example.test/two\tOriginal two\tBlog\t\t\t\t2\t
`));
  const store = new Map();
  const writes = [];
  const options = {
    tableName: 'catalog',
    getCallerIdentity: async () => ({ Account: '719535286359' }),
      getItem: async ({ Key }) => ({ Item: store.get(Key.id) }),
      transactWrite: async (params) => {
        writes.push(params);
        const items = params.TransactItems.map(({ Put }) => Put.Item);
        if (items.some((item) => store.has(item.id))) {
          const error = new Error('already exists');
          error.name = 'TransactionCanceledException';
          error.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }];
          throw error;
        }
        for (const item of items) store.set(item.id, { ...item });
      },
  };

  assert.deepEqual(await importCatalog(records, options), { total: 2, created: 2, skipped: 0 });
  const edited = store.get(records[0].id);
  edited.description = 'Owner edit';
  edited.published = false;
  assert.deepEqual(await importCatalog(records, options), { total: 2, created: 0, skipped: 2 });
  assert.equal(store.get(records[0].id).description, 'Owner edit');
  assert.equal(store.get(records[0].id).published, false);
  assert.equal(writes[0].TransactItems.length, 2);
  assert.ok(writes.every(({ TransactItems }) => TransactItems.some(({ Put }) => Put.Item.id.startsWith('__url#'))));
  assert.equal(store.get(currentUrlReservationId(records[0].url)).resourceId, records[0].id);
});

test('reports a different resource that claims an already-reserved literal URL', async () => {
  const [first] = mapTsvRows(parseCatalogTsv(`${TSV_HEADERS}\nOne\thttps://example.test/shared?a=1&b=2\tDescription\tCurso\t\t\t\t1\t\n`));
  const records = [first, { ...first, id: 'catalog-independent-id', title: 'Other resource' }];
  const store = new Map();
  const result = await importCatalog(records, {
    tableName: 'catalog',
    getCallerIdentity: async () => ({ Account: '719535286359' }),
    getItem: async ({ Key }) => ({ Item: store.get(Key.id) }),
    transactWrite: async ({ TransactItems }) => {
      const items = TransactItems.map(({ Put }) => Put.Item);
      if (items.some(({ id }) => store.has(id))) {
        const error = new Error('conditional transaction conflict');
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }];
        throw error;
      }
      for (const item of items) store.set(item.id, { ...item });
    },
  });

  assert.deepEqual(result, {
    total: 2, created: 1, skipped: 1,
    conflicts: [{ id: 'catalog-independent-id', url: first.url, status: 'duplicate', resourceIds: [first.id] }],
  });
  assert.equal(store.get(currentUrlReservationId(first.url)).resourceId, first.id);
  assert.equal(store.has('catalog-independent-id'), false);
});

test('real imports require a table while dry runs do not', async () => {
  const tsv = syntheticTsv(1);
  await withoutEnvironment({ CATALOG_TABLE: undefined }, async () => {
    await assert.rejects(
      main(['directory.tsv'], { readFile: async () => tsv, importCatalog: async () => ({}) }),
      /requires --table TABLE or CATALOG_TABLE/,
    );
  });
});

test('help prints usage without reading input or contacting AWS', async () => {
  let output;
  const result = await main(['--help'], {
    readFile: async () => { throw new Error('input should not be read'); },
    write: (text) => { output = text; },
    importCatalog: async () => { throw new Error('AWS should not be contacted'); },
  });
  assert.deepEqual(result, { help: true });
  assert.match(output, /--dry-run/);
  assert.match(output, /719535286359/);
});

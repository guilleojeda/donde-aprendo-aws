import assert from 'node:assert/strict';
import { test } from 'node:test';

import { main } from '../scripts/import-catalog.mjs';
import {
  importCatalog,
  mapTsvRows,
  parseCatalogTsv,
  stableCatalogId,
} from '../src/lib/catalog-import.mjs';

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
    putItem: async (params) => {
      writes.push(params);
      if (store.has(params.Item.id)) {
        const error = new Error('already exists');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }
      store.set(params.Item.id, { ...params.Item });
    },
  };

  assert.deepEqual(await importCatalog(records, options), { total: 2, created: 2, skipped: 0 });
  const edited = store.get(records[0].id);
  edited.description = 'Owner edit';
  edited.published = false;
  assert.deepEqual(await importCatalog(records, options), { total: 2, created: 0, skipped: 2 });
  assert.equal(store.get(records[0].id).description, 'Owner edit');
  assert.equal(store.get(records[0].id).published, false);
  assert.equal(writes[0].ConditionExpression, 'attribute_not_exists(#id)');
  assert.deepEqual(writes[0].ExpressionAttributeNames, { '#id': 'id' });
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

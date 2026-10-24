import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCreatorStore } from '../src/lib/creator-store.mjs';

const TABLES = {
  accountsTableName: 'accounts-test',
  profilesTableName: 'profiles-test',
  catalogTableName: 'catalog-test',
};

function copy(value) {
  return structuredClone(value);
}

function physicalKey(table, key) {
  return `${table}\u0000${key.pk ?? ''}\u0000${key.sk ?? ''}\u0000${key.id ?? ''}`;
}

function physicalItemKey(table, item) {
  return physicalKey(table, item);
}

function expressionMatches(item, expression, names = {}, values = {}) {
  if (!expression) return true;
  const notExists = expression.match(/^attribute_not_exists\((#[A-Za-z0-9_]+)\)$/);
  if (notExists) return !Object.hasOwn(item ?? {}, names[notExists[1]]);
  const version = expression.match(/^attribute_exists\((#[A-Za-z0-9_]+)\) AND #version = :version$/);
  if (version) return Boolean(item && Object.hasOwn(item, names[version[1]]) && item.version === values[':version']);
  const zeroVersion = expression.match(/^attribute_exists\((#[A-Za-z0-9_]+)\) AND \(attribute_not_exists\(#version\) OR #version = :zero\)$/);
  if (zeroVersion) return Boolean(item && Object.hasOwn(item, names[zeroVersion[1]]) && (item.version === undefined || item.version === values[':zero']));
  throw new Error(`mock DynamoDB does not understand condition: ${expression}`);
}

function mockDynamoDb({ pageSize = 1 } = {}) {
  const items = new Map();
  const calls = [];
  const client = {
    calls,
    items,
    async send(command) {
      const { constructor: { name }, input } = command;
      calls.push({ name, input: copy(input) });
      if (name === 'GetCommand') {
        return { Item: copy(items.get(physicalKey(input.TableName, input.Key))) };
      }
      if (name === 'QueryCommand') {
        const names = input.ExpressionAttributeNames ?? {};
        const values = input.ExpressionAttributeValues ?? {};
        const partition = names['#pk'];
        const sort = names['#sk'];
        const prefix = values[':sk'];
        const rows = [...items.values()]
          .filter((item) => item.pk === values[':pk'] && typeof item[sort] === 'string' && item[sort].startsWith(prefix))
          .sort((left, right) => left[sort].localeCompare(right[sort]));
        if (partition !== 'pk') throw new Error('query did not address the partition key');
        let offset = 0;
        if (input.ExclusiveStartKey) {
          const cursor = rows.findIndex((item) => item.pk === input.ExclusiveStartKey.pk && item.sk === input.ExclusiveStartKey.sk);
          if (cursor < 0) throw new Error('query cursor does not point to a returned item');
          offset = cursor + 1;
        }
        const page = rows.slice(offset, offset + pageSize);
        const last = offset + pageSize < rows.length ? { pk: page.at(-1).pk, sk: page.at(-1).sk } : undefined;
        return { Items: page.map(copy), ...(last ? { LastEvaluatedKey: last } : {}) };
      }
      if (name === 'TransactWriteCommand') {
        const operations = input.TransactItems.map((entry) => {
          if (entry.Put) return { kind: 'put', action: entry.Put, key: physicalItemKey(entry.Put.TableName, entry.Put.Item) };
          if (entry.Delete) return { kind: 'delete', action: entry.Delete, key: physicalKey(entry.Delete.TableName, entry.Delete.Key) };
          if (entry.ConditionCheck) return { kind: 'check', action: entry.ConditionCheck, key: physicalKey(entry.ConditionCheck.TableName, entry.ConditionCheck.Key) };
          throw new Error('mock DynamoDB received an unsupported transaction action');
        });
        const failed = operations.some(({ action, key }) => !expressionMatches(
          items.get(key), action.ConditionExpression, action.ExpressionAttributeNames, action.ExpressionAttributeValues,
        ));
        if (failed) {
          const error = new Error('transaction condition failed');
          error.name = 'TransactionCanceledException';
          error.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }];
          throw error;
        }
        for (const operation of operations) {
          if (operation.kind === 'put') items.set(operation.key, copy(operation.action.Item));
          if (operation.kind === 'delete') items.delete(operation.key);
        }
        return {};
      }
      throw new Error(`unexpected DynamoDB command: ${name}`);
    },
  };
  return client;
}

test('series and series aliases map to their profile partition and use strongly consistent reads', async () => {
  const client = mockDynamoDb();
  const store = createCreatorStore({ ...TABLES, client });
  const series = await store.get('series:creator-a:series-id');
  const alias = await store.get('series-alias:creator-a:series-slug');
  assert.equal(series, null);
  assert.equal(alias, null);
  assert.deepEqual(client.calls.slice(0, 2).map(({ input }) => input.Key), [
    { pk: 'PROFILE#creator-a', sk: 'SERIES#series-id' },
    { pk: 'PROFILE#creator-a', sk: 'SERIES_SLUG#series-slug' },
  ]);
  assert.ok(client.calls.slice(0, 2).every(({ input }) => input.TableName === TABLES.profilesTableName && input.ConsistentRead === true));

  const created = await store.transact({
    checks: [
      { key: 'series:creator-a:series-id', version: null },
      { key: 'series-alias:creator-a:series-slug', version: null },
    ],
    puts: [
      { key: 'series:creator-a:series-id', value: { recordType: 'series', id: 'series-id', profileId: 'creator-a', name: 'Serie', slug: 'series-slug', version: 1 } },
      { key: 'series-alias:creator-a:series-slug', value: { recordType: 'seriesAlias', seriesId: 'series-id', profileId: 'creator-a', slug: 'series-slug', version: 1 } },
    ],
  });
  assert.equal(created, true);
  assert.deepEqual(await store.get('series:creator-a:series-id'), {
    recordType: 'series', id: 'series-id', profileId: 'creator-a', name: 'Serie', slug: 'series-slug', version: 1,
  });
  assert.deepEqual(await store.get('series-alias:creator-a:series-slug'), {
    recordType: 'seriesAlias', seriesId: 'series-id', profileId: 'creator-a', slug: 'series-slug', version: 1,
  });
});

test('series listings are scoped, strongly consistent, paginated, and exclude aliases', async () => {
  const client = mockDynamoDb({ pageSize: 1 });
  const store = createCreatorStore({ ...TABLES, client });
  const puts = [
    ['series:creator-a:series-b', { recordType: 'series', id: 'series-b', profileId: 'creator-a', name: 'B', slug: 'b', version: 1 }],
    ['series:creator-a:series-a', { recordType: 'series', id: 'series-a', profileId: 'creator-a', name: 'A', slug: 'a', version: 1 }],
    ['series-alias:creator-a:a', { recordType: 'seriesAlias', seriesId: 'series-a', profileId: 'creator-a', slug: 'a', version: 1 }],
    ['series:creator-b:series-c', { recordType: 'series', id: 'series-c', profileId: 'creator-b', name: 'C', slug: 'c', version: 1 }],
  ];
  for (const [key, value] of puts) assert.equal(await store.transact({ puts: [{ key, value }] }), true);

  const rows = await store.list('series:creator-a:');
  assert.deepEqual(rows.map(({ key }) => key), ['series:creator-a:series-a', 'series:creator-a:series-b']);
  assert.deepEqual(rows.map(({ value }) => value.id), ['series-a', 'series-b']);
  const queries = client.calls.filter(({ name }) => name === 'QueryCommand');
  assert.equal(queries.length, 2);
  assert.ok(queries.every(({ input }) => input.TableName === TABLES.profilesTableName && input.ConsistentRead === true));
  assert.ok(queries.every(({ input }) => input.ExpressionAttributeValues[':pk'] === 'PROFILE#creator-a'));
  assert.ok(queries.every(({ input }) => input.ExpressionAttributeValues[':sk'] === 'SERIES#'));
  assert.deepEqual(queries[1].input.ExclusiveStartKey, { pk: 'PROFILE#creator-a', sk: 'SERIES#series-a' });
});

test('conditional series creation and versioned updates are atomic, and deleting metadata leaves its alias reserved', async () => {
  const client = mockDynamoDb();
  const store = createCreatorStore({ ...TABLES, client });
  const initial = {
    recordType: 'series', id: 'one', profileId: 'creator-a', name: 'Original', slug: 'shared-slug', version: 1,
  };
  const alias = { recordType: 'seriesAlias', seriesId: 'one', profileId: 'creator-a', slug: 'shared-slug', version: 1 };
  assert.equal(await store.transact({
    checks: [{ key: 'series:creator-a:one', version: null }, { key: 'series-alias:creator-a:shared-slug', version: null }],
    puts: [{ key: 'series:creator-a:one', value: initial }, { key: 'series-alias:creator-a:shared-slug', value: alias }],
  }), true);

  const conflictingCreate = await store.transact({
    checks: [{ key: 'series:creator-a:two', version: null }, { key: 'series-alias:creator-a:shared-slug', version: null }],
    puts: [
      { key: 'series:creator-a:two', value: { ...initial, id: 'two', name: 'Should not exist' } },
      { key: 'series-alias:creator-a:shared-slug', value: { ...alias, seriesId: 'two' } },
    ],
  });
  assert.equal(conflictingCreate, false);
  assert.equal(await store.get('series:creator-a:two'), null, 'the series record is not partially created when its alias is taken');

  const updated = { ...initial, name: 'Actualizado', version: 2 };
  assert.equal(await store.transact({
    checks: [{ key: 'series:creator-a:one', version: 1 }],
    puts: [{ key: 'series:creator-a:one', value: updated }],
  }), true);
  assert.equal(await store.transact({
    checks: [{ key: 'series:creator-a:one', version: 1 }],
    puts: [{ key: 'series:creator-a:one', value: { ...updated, name: 'Stale', version: 3 } }],
  }), false);
  assert.equal((await store.get('series:creator-a:one')).name, 'Actualizado');

  assert.equal(await store.transact({
    checks: [{ key: 'series:creator-a:one', version: 2 }],
    deletes: ['series:creator-a:one'],
  }), true);
  assert.equal(await store.get('series:creator-a:one'), null);
  assert.deepEqual(await store.get('series-alias:creator-a:shared-slug'), alias);
  assert.equal(await store.transact({
    checks: [{ key: 'series:creator-a:two', version: null }, { key: 'series-alias:creator-a:shared-slug', version: null }],
    puts: [
      { key: 'series:creator-a:two', value: { ...initial, id: 'two' } },
      { key: 'series-alias:creator-a:shared-slug', value: { ...alias, seriesId: 'two' } },
    ],
  }), false, 'a deleted series slug remains reserved');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { main, migrateCatalogUrlReservations } from '../scripts/migrate-catalog-url-reservations.mjs';
import { currentUrlReservationId } from '../src/lib/catalog-url.mjs';

function conditionalConflict() {
  const error = new Error('conditional conflict');
  error.name = 'ConditionalCheckFailedException';
  throw error;
}

function catalogTable(seed, pageSize = 2) {
  const items = new Map(seed.map((item) => [item.id, { ...item }]));
  const calls = { scans: [], puts: [], updates: [] };
  const scanPage = async (params) => {
    calls.scans.push(params);
    const rows = [...items.values()].sort((a, b) => a.id.localeCompare(b.id));
    const start = params.ExclusiveStartKey?.id;
    const startIndex = start ? rows.findIndex(({ id }) => id === start) + 1 : 0;
    const page = rows.slice(startIndex, startIndex + pageSize);
    const last = page.at(-1);
    return { Items: page.map((item) => ({ ...item })), ...(startIndex + page.length < rows.length ? { LastEvaluatedKey: { id: last.id } } : {}) };
  };
  const getItem = async ({ Key }) => ({ Item: items.get(Key.id) && { ...items.get(Key.id) } });
  const putItem = async ({ Item, ConditionExpression }) => {
    calls.puts.push(Item);
    const current = items.get(Item.id);
    if (ConditionExpression === 'attribute_not_exists(#id)' && current) conditionalConflict();
    if (current && ConditionExpression !== 'attribute_not_exists(#id)') conditionalConflict();
    items.set(Item.id, { ...Item });
  };
  const updateItem = async ({ Key, UpdateExpression, ConditionExpression }) => {
    calls.updates.push(Key.id);
    const item = items.get(Key.id);
    if (!item || !UpdateExpression.includes('attribute_not_exists(#version)') && item.version !== undefined) {
      conditionalConflict();
    }
    if (!ConditionExpression.includes('attribute_not_exists(#version)')) conditionalConflict();
    item.version = 0;
  };
  return { items, calls, scanPage, getItem, putItem, updateItem };
}

test('inventories every current URL, keeps duplicate legacy resources, and separates event registration URLs', async () => {
  const table = catalogTable([
    { id: 'legacy-a', url: 'https://example.test/shared?lang=es', published: true },
    { id: 'legacy-b', url: 'https://example.test/shared?lang=es', published: false },
    { id: 'meetup-event-1', recordType: 'event', registrationUrl: 'https://www.meetup.com/group/events/1/', version: 1 },
    { id: '__system#publication', publishedHash: 'private control' },
  ]);
  const result = await migrateCatalogUrlReservations({ tableName: 'catalog', ...table });

  assert.equal(result.resources, 3);
  assert.equal(result.versionsBackfilled, 2);
  assert.equal(result.reservationsVerified, 2);
  assert.deepEqual(result.collisions, [{
    url: 'https://example.test/shared?lang=es', resourceIds: ['legacy-a', 'legacy-b'],
  }]);
  assert.equal(table.items.get('legacy-a').version, 0);
  assert.equal(table.items.get('legacy-a').published, true);
  assert.equal(table.items.get('legacy-b').published, false);
  assert.deepEqual(table.items.get(currentUrlReservationId('https://example.test/shared?lang=es')), {
    id: currentUrlReservationId('https://example.test/shared?lang=es'), recordType: 'urlReservation',
    url: 'https://example.test/shared?lang=es', status: 'collision', resourceIds: ['legacy-a', 'legacy-b'], version: 1,
  });
  assert.equal(table.items.get(currentUrlReservationId('https://www.meetup.com/group/events/1/')).resourceId, 'meetup-event-1');
  assert.ok(table.calls.scans.length > 2, 'the multi-page inventory and final coverage check both paginate');
  assert.ok(table.calls.scans.every((params) => params.ConsistentRead && params.Select === 'SPECIFIC_ATTRIBUTES'));
  assert.ok(table.calls.scans.every((params) => !Object.values(params.ExpressionAttributeNames).some((field) => ['email', 'submitterEmail'].includes(field))));

  const rerun = await migrateCatalogUrlReservations({ tableName: 'catalog', ...table });
  assert.equal(rerun.versionsBackfilled, 0);
  assert.equal(rerun.reservationsWritten, 0);
  assert.equal(rerun.reservationsVerified, 2);
});

test('dry-run requires the target account guard and does not mutate the table', async () => {
  const table = catalogTable([{ id: 'legacy', url: 'https://example.test/a?b=1' }]);
  const report = await main(['--table', 'catalog', '--dry-run'], {
    ...table,
    getCallerIdentity: async () => ({ Account: '719535286359' }),
    write: () => {},
  });
  assert.equal(report.dryRun, true);
  assert.equal(report.resources, 1);
  assert.equal(report.missingVersions, 1);
  assert.equal(table.calls.puts.length, 0);
  assert.equal(table.calls.updates.length, 0);
});

test('refuses mutation outside the target AWS account', async () => {
  await assert.rejects(main(['--table', 'catalog', '--apply'], {
    getCallerIdentity: async () => ({ Account: '000000000000' }),
  }), /account guard failed/);
});

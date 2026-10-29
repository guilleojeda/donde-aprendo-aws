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

test('rejects over-limit resource and reservation IDs before migration writes', async () => {
  for (const id of ['x'.repeat(257), `import:${'x'.repeat(1893)}`]) {
    const resourceTable = catalogTable([{ id, url: 'https://example.test/over-limit' }]);
    await assert.rejects(migrateCatalogUrlReservations({ tableName: 'catalog', ...resourceTable }));
    assert.equal(resourceTable.calls.updates.length, 0);
    assert.equal(resourceTable.calls.puts.length, 0);

    const reservationTable = catalogTable([{
      id: currentUrlReservationId('https://example.test/over-limit'),
      recordType: 'urlReservation', url: 'https://example.test/over-limit', status: 'reserved',
      resourceId: id, version: 1,
    }]);
    await assert.rejects(migrateCatalogUrlReservations({ tableName: 'catalog', ...reservationTable }));
    assert.equal(reservationTable.calls.updates.length, 0);
    assert.equal(reservationTable.calls.puts.length, 0);
  }
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

test('bounds migration concurrency, drains on error, and resumes partial writes idempotently', async () => {
  const seed = Array.from({ length: 12 }, (_, index) => ({
    id: `legacy-${String(index).padStart(2, '0')}`,
    url: `https://example.test/resource/${index}`,
    published: index % 2 === 0,
  }));
  const table = catalogTable(seed, 50);
  let active = 0;
  let peakActive = 0;
  let reservationPutsStarted = 0;
  const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const track = async (operation, milliseconds) => {
    active += 1;
    peakActive = Math.max(peakActive, active);
    try {
      await delay(milliseconds);
      return await operation();
    } finally {
      active -= 1;
    }
  };
  const firstRunAccess = {
    ...table,
    updateItem: (params) => track(() => table.updateItem(params), 4),
    getItem: (params) => track(() => table.getItem(params), 2),
    putItem: (params) => {
      reservationPutsStarted += 1;
      if (params.Item.url === 'https://example.test/resource/3') {
        return track(async () => { throw new Error('injected reservation failure'); }, 1);
      }
      return track(() => table.putItem(params), 12);
    },
  };

  await assert.rejects(
    migrateCatalogUrlReservations({ tableName: 'catalog', ...firstRunAccess }),
    (error) => {
      assert.match(error.message, /injected reservation failure/);
      assert.equal(active, 0, 'migration waits for all in-flight requests before rejecting');
      return true;
    },
  );
  assert.equal(peakActive, 8, 'migration runs at the configured concurrency limit');
  assert.equal(reservationPutsStarted, 8, 'no reservation writes start after the first error');
  assert.equal(seed.every((item) => table.items.get(item.id).published === item.published), true);
  assert.equal(seed.every((item) => table.items.get(item.id).version === 0), true);
  const reservationsAfterFailure = [...table.items.values()].filter((item) => item.recordType === 'urlReservation');
  assert.equal(reservationsAfterFailure.length, 7, 'successful in-flight writes remain safe to resume');

  const resumed = await migrateCatalogUrlReservations({ tableName: 'catalog', ...table });
  assert.equal(resumed.versionsBackfilled, 0);
  assert.equal(resumed.reservationsWritten, 5);
  assert.equal(resumed.reservationsVerified, seed.length);
  assert.equal([...table.items.values()].filter((item) => item.recordType === 'urlReservation').length, seed.length);

  const repeated = await migrateCatalogUrlReservations({ tableName: 'catalog', ...table });
  assert.equal(repeated.reservationsWritten, 0);
  assert.equal(repeated.versionsBackfilled, 0);
});

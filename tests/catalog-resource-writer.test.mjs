import assert from 'node:assert/strict';
import test from 'node:test';

import { putCatalogResourceOnce } from '../src/lib/catalog-resource-writer.mjs';
import { currentUrlReservation, currentUrlReservationId } from '../src/lib/catalog-url.mjs';

function resource(overrides = {}) {
  return { id: 'resource-a', title: 'Guía', url: 'https://example.test/guia?lang=es', published: false, ...overrides };
}

function memoryCatalog(seed = []) {
  const items = new Map(seed.map((item) => [item.id, { ...item }]));
  const writes = [];
  return {
    items,
    writes,
    getItem: async ({ Key }) => ({ Item: items.get(Key.id) }),
    transactWrite: async (params) => {
      writes.push(params);
      const puts = params.TransactItems.map(({ Put }) => Put.Item);
      if (puts.some((item) => items.has(item.id))) {
        const error = new Error('transaction condition failed');
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }];
        throw error;
      }
      for (const item of puts) items.set(item.id, { ...item });
    },
  };
}

test('creates a resource and its literal URL reservation in one transaction', async () => {
  const catalog = memoryCatalog();
  const result = await putCatalogResourceOnce({ tableName: 'catalog', item: resource(), ...catalog });
  assert.equal(result.status, 'created');
  assert.equal(result.item.version, 1);
  assert.deepEqual(catalog.writes[0].TransactItems.map(({ Put }) => Put.Item), [
    { ...resource(), version: 1 }, currentUrlReservation(resource().url, 'resource-a'),
  ]);
  assert.equal(catalog.items.get(currentUrlReservationId(resource().url)).resourceId, 'resource-a');
});

test('skips an existing ID without restoring its old URL or approval', async () => {
  const old = resource({ url: 'https://example.test/changed', published: false, version: 4 });
  const catalog = memoryCatalog([old]);
  const result = await putCatalogResourceOnce({ tableName: 'catalog', item: resource(), ...catalog });
  assert.deepEqual(result, { status: 'id-exists' });
  assert.equal(catalog.writes.length, 0);
  assert.deepEqual(catalog.items.get(old.id), old);
});

test('returns duplicate or collision for an occupied literal URL', async () => {
  const duplicate = memoryCatalog([
    resource({ id: 'resource-other' }),
    currentUrlReservation(resource().url, 'resource-other'),
  ]);
  assert.deepEqual(
    await putCatalogResourceOnce({ tableName: 'catalog', item: resource(), ...duplicate }),
    { status: 'duplicate', resourceIds: ['resource-other'] },
  );

  const collision = memoryCatalog([
    resource({ id: 'legacy-a' }), resource({ id: 'legacy-b' }),
    {
      id: currentUrlReservationId(resource().url), recordType: 'urlReservation', url: resource().url,
      status: 'collision', resourceIds: ['legacy-a', 'legacy-b'], version: 1,
    },
  ]);
  assert.deepEqual(
    await putCatalogResourceOnce({ tableName: 'catalog', item: resource(), ...collision }),
    { status: 'collision', resourceIds: ['legacy-a', 'legacy-b'] },
  );
});

test('re-reads deterministic keys after a concurrent reservation wins', async () => {
  const catalog = memoryCatalog();
  let first = true;
  const transactWrite = async () => {
    if (!first) throw new Error('transaction should not be retried after the winner is visible');
    first = false;
    catalog.items.set('winner', resource({ id: 'winner' }));
    catalog.items.set(currentUrlReservationId(resource().url), currentUrlReservation(resource().url, 'winner'));
    const error = new Error('transaction canceled');
    error.name = 'TransactionCanceledException';
    error.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }];
    throw error;
  };
  const result = await putCatalogResourceOnce({ tableName: 'catalog', item: resource(), ...catalog, transactWrite });
  assert.deepEqual(result, { status: 'duplicate', resourceIds: ['winner'] });
  assert.equal(first, false);
});

test('rejects reservations whose referenced resource is missing or has moved', async () => {
  const reservation = currentUrlReservation(resource().url, 'resource-other');
  const orphan = memoryCatalog([reservation]);
  await assert.rejects(
    putCatalogResourceOnce({ tableName: 'catalog', item: resource(), ...orphan }),
    /missing or inconsistent resource/,
  );

  const moved = memoryCatalog([
    resource({ id: 'resource-other', url: 'https://example.test/moved' }), reservation,
  ]);
  await assert.rejects(
    putCatalogResourceOnce({ tableName: 'catalog', item: resource(), ...moved }),
    /missing or inconsistent resource/,
  );
});

test('validates event reservations against registrationUrl', async () => {
  const event = {
    id: 'meetup-event-1', recordType: 'event',
    registrationUrl: resource().url,
  };
  const catalog = memoryCatalog([event, currentUrlReservation(resource().url, event.id)]);
  assert.deepEqual(
    await putCatalogResourceOnce({ tableName: 'catalog', item: resource(), ...catalog }),
    { status: 'duplicate', resourceIds: [event.id] },
  );
});

test('fails on an inconsistent reservation instead of creating around it', async () => {
  const reservation = currentUrlReservation(resource().url, 'resource-other');
  reservation.url += '/changed';
  const catalog = memoryCatalog([reservation]);
  await assert.rejects(
    putCatalogResourceOnce({ tableName: 'catalog', item: resource(), ...catalog }),
    /inconsistent/,
  );
  assert.equal(catalog.writes.length, 0);
});

test('validates resource ID UTF-8 bytes before reading or writing', async () => {
  const acceptedId = 'é'.repeat(128);
  const rejectedId = `${acceptedId}a`;
  assert.equal(acceptedId.length, 128);
  assert.equal(Buffer.byteLength(acceptedId, 'utf8'), 256);
  assert.equal(Buffer.byteLength(rejectedId, 'utf8'), 257);

  let reads = 0;
  let writes = 0;
  const access = {
    getItem: async () => { reads += 1; return {}; },
    transactWrite: async () => { writes += 1; },
  };
  assert.equal((await putCatalogResourceOnce({
    tableName: 'catalog', item: resource({ id: acceptedId, url: 'https://example.test/accepted-boundary' }), ...access,
  })).status, 'created');
  assert.deepEqual([reads, writes], [2, 1], 'the maximum byte length continues through normal reservation writes');

  reads = 0;
  writes = 0;
  await assert.rejects(putCatalogResourceOnce({
    tableName: 'catalog', item: resource({ id: rejectedId, url: 'https://example.test/rejected-boundary' }), ...access,
  }));
  assert.deepEqual([reads, writes], [0, 0], 'an ID above the limit is rejected before catalog reads or writes');
});

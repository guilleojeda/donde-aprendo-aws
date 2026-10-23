import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { mapMeetupCommunities } from '../src/lib/meetup-communities.mjs';
import { importMeetupCommunities } from '../scripts/import-meetup-communities.mjs';
import { currentUrlReservationId } from '../src/lib/catalog-url.mjs';

function group(overrides = {}) {
  return {
    id: '123', name: 'AWS User Group Bogotá', url: 'https://www.meetup.com/aws-bogota/',
    country: 'CO', type: 'User Group', ...overrides,
  };
}

test('Spanish-language directory maps to 233 approved communities with distinct Meetup links', async () => {
  const directory = JSON.parse(await readFile(new URL('../data/meetup-communities.json', import.meta.url), 'utf8'));
  const records = mapMeetupCommunities(directory);
  assert.equal(records.length, 233);
  assert.equal(records.filter((record) => record.format === 'User Group').length, 88);
  assert.equal(records.filter((record) => record.format === 'Student Builder Group').length, 145);
  assert.equal(new Set(records.map((record) => record.id)).size, 233);
  assert.equal(new Set(records.map((record) => record.url)).size, 233);
  assert.ok(records.every((record) => record.published && record.country));
  assert.ok(records.every((record) => !['BR', 'JM'].includes(record.country)));
  assert.equal(records.find((record) => record.id === 'meetup-34833437').country, 'PR');
  assert.equal(records.find((record) => record.id === 'meetup-38266376').country, 'CL');
});

test('preserves only an explicitly reviewed group city and validates its public form', () => {
  const reviewed = mapMeetupCommunities({ groups: [group({ city: 'Bogotá' })] })[0];
  const unreviewed = mapMeetupCommunities({ groups: [group({ id: '124', name: 'AWS User Group Lima' })] })[0];

  assert.equal(reviewed.city, 'Bogotá');
  assert.equal(Object.hasOwn(unreviewed, 'city'), false);
  for (const city of [' Bogotá', 'Bogotá ', 'x'.repeat(101), 'Bogotá\n']) {
    assert.throws(() => mapMeetupCommunities({ groups: [group({ city })] }), /invalid city/);
  }
});

test('rejects DEL control characters in reviewed community cities', () => {
  assert.throws(() => mapMeetupCommunities({ groups: [group({ city: 'Lima\u007f' })] }), /invalid city/);
});

test('import checks account and skips existing records without overwriting them', async () => {
  const records = [
    { id: 'meetup-1', url: 'https://www.meetup.com/aws-mendoza/', city: 'Mendoza' },
    { id: 'meetup-2', url: 'https://www.meetup.com/aws-cordoba/', city: 'Córdoba' },
  ];
  const existing = new Map([['meetup-2', { id: 'meetup-2', city: 'Rosario', editorNote: 'keep' }]]);
  const writes = [];
  const result = await importMeetupCommunities(records, {
    tableName: 'test-table',
    getIdentity: async () => ({ Account: '719535286359' }),
    getItem: async ({ Key }) => ({ Item: existing.get(Key.id) }),
    transactWrite: async (params) => {
      writes.push(params);
      const items = params.TransactItems.map(({ Put }) => Put.Item);
      if (items.some((item) => existing.has(item.id))) {
        const error = new Error('conditional transaction conflict');
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }];
        throw error;
      }
      for (const item of items) existing.set(item.id, { ...item });
    },
  });
  assert.deepEqual(result, { total: 2, created: 1, skipped: 1 });
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].TransactItems.map(({ Put }) => Put.Item.id), [
    'meetup-1', currentUrlReservationId(records[0].url),
  ]);
  assert.equal(existing.get('meetup-1').city, 'Mendoza');
  assert.equal(existing.get(currentUrlReservationId(records[0].url)).resourceId, 'meetup-1');
  assert.deepEqual(existing.get('meetup-2'), { id: 'meetup-2', city: 'Rosario', editorNote: 'keep' });
  await assert.rejects(importMeetupCommunities(records, {
    tableName: 'test-table',
    getIdentity: async () => ({ Account: '000000000000' }),
    getItem: async () => assert.fail('must not read'),
    transactWrite: async () => assert.fail('must not write'),
  }), /Wrong AWS account/);
});

test('Meetup import reports a duplicate URL without merging the second ID', async () => {
  const url = 'https://www.meetup.com/aws-bogota/';
  const records = [{ id: 'meetup-1', url }, { id: 'meetup-2', url }];
  const items = new Map();
  const result = await importMeetupCommunities(records, {
    tableName: 'catalog',
    getIdentity: async () => ({ Account: '719535286359' }),
    getItem: async ({ Key }) => ({ Item: items.get(Key.id) }),
    transactWrite: async ({ TransactItems }) => {
      const writes = TransactItems.map(({ Put }) => Put.Item);
      if (writes.some(({ id }) => items.has(id))) {
        const error = new Error('transaction conflict');
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }];
        throw error;
      }
      for (const item of writes) items.set(item.id, item);
    },
  });

  assert.deepEqual(result, {
    total: 2, created: 1, skipped: 1,
    conflicts: [{ id: 'meetup-2', url, status: 'duplicate', resourceIds: ['meetup-1'] }],
  });
  assert.equal(items.get(currentUrlReservationId(url)).resourceId, 'meetup-1');
  assert.equal(items.has('meetup-2'), false);
});

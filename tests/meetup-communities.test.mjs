import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { mapMeetupCommunities } from '../src/lib/meetup-communities.mjs';
import { importMeetupCommunities } from '../scripts/import-meetup-communities.mjs';

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
  const records = [{ id: 'meetup-1', city: 'Mendoza' }, { id: 'meetup-2', city: 'Córdoba' }];
  const existing = new Map([['meetup-2', { id: 'meetup-2', city: 'Rosario', editorNote: 'keep' }]]);
  const writes = [];
  const result = await importMeetupCommunities(records, {
    tableName: 'test-table',
    getIdentity: async () => ({ Account: '719535286359' }),
    put: async (record) => {
      writes.push({ ...record });
      if (existing.has(record.id)) throw { name: 'ConditionalCheckFailedException' };
      existing.set(record.id, { ...record });
    },
  });
  assert.deepEqual(result, { total: 2, created: 1, skipped: 1 });
  assert.deepEqual(writes, records);
  assert.deepEqual(existing.get('meetup-1'), records[0]);
  assert.deepEqual(existing.get('meetup-2'), { id: 'meetup-2', city: 'Rosario', editorNote: 'keep' });
  await assert.rejects(importMeetupCommunities(records, {
    tableName: 'test-table',
    getIdentity: async () => ({ Account: '000000000000' }),
    put: async () => assert.fail('must not write'),
  }), /Wrong AWS account/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { mapMeetupCommunities } from '../src/lib/meetup-communities.mjs';
import { importMeetupCommunities } from '../scripts/import-meetup-communities.mjs';

test('reviewed directory maps to 384 approved communities with distinct Meetup links', async () => {
  const directory = JSON.parse(await readFile(new URL('../data/meetup-communities.json', import.meta.url), 'utf8'));
  const records = mapMeetupCommunities(directory);
  assert.equal(records.length, 384);
  assert.equal(records.filter((record) => record.format === 'User Group').length, 134);
  assert.equal(records.filter((record) => record.format === 'Student Builder Group').length, 250);
  assert.equal(new Set(records.map((record) => record.id)).size, 384);
  assert.equal(new Set(records.map((record) => record.url)).size, 384);
  assert.ok(records.every((record) => record.published && record.country));
  assert.equal(records.find((record) => record.id === 'meetup-34833437').country, 'PR');
  assert.equal(records.find((record) => record.id === 'meetup-38266376').country, 'CL');
});

test('import checks account and skips existing records without overwriting them', async () => {
  const records = [{ id: 'meetup-1' }, { id: 'meetup-2' }];
  const writes = [];
  const result = await importMeetupCommunities(records, {
    tableName: 'test-table',
    getIdentity: async () => ({ Account: '719535286359' }),
    put: async (record) => {
      writes.push(record.id);
      if (record.id === 'meetup-2') throw { name: 'ConditionalCheckFailedException' };
    },
  });
  assert.deepEqual(result, { total: 2, created: 1, skipped: 1 });
  assert.deepEqual(writes, ['meetup-1', 'meetup-2']);
  await assert.rejects(importMeetupCommunities(records, {
    tableName: 'test-table',
    getIdentity: async () => ({ Account: '000000000000' }),
    put: async () => assert.fail('must not write'),
  }), /Wrong AWS account/);
});

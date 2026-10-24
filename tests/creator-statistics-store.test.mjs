import assert from 'node:assert/strict';
import test from 'node:test';
import { createCreatorStatisticsStore } from '../src/lib/creator-statistics-store.mjs';

test('DynamoDB cache rows use the analytics profile key and store retention TTL in epoch seconds', async () => {
  const key = { profileId: 'creator-a', period: 30, page: 2 };
  const propertyId = '424203315';
  const envelope = {
    schemaVersion: 1,
    report: { creatorId: key.profileId, period: key.period, page: key.page },
    updatedAt: 1_798_000_000_123,
    expiresAt: 1_798_003_600_123,
    retainUntil: 1_798_604_800_123,
  };
  const calls = [];
  const cachedItem = {
    pk: 'ANALYTICS#creator-a',
    sk: 'GA4#424203315#v1#30#2',
    recordType: 'analyticsCache',
    profileId: key.profileId,
    propertyId,
    period: key.period,
    page: key.page,
    ...structuredClone(envelope),
    ttl: Math.ceil(envelope.retainUntil / 1000),
  };
  const client = {
    async send(command) {
      calls.push(command);
      if (command.constructor.name === 'GetCommand') return { Item: structuredClone(cachedItem) };
      if (command.constructor.name === 'PutCommand') return {};
      throw new Error(`unexpected command ${command.constructor.name}`);
    },
  };
  const cache = createCreatorStatisticsStore({
    profilesTableName: 'creator-profiles-test',
    propertyId,
    client,
  });

  assert.deepEqual(await cache.get(key), envelope);
  assert.equal(calls[0].input.TableName, 'creator-profiles-test');
  assert.deepEqual(calls[0].input.Key, {
    pk: 'ANALYTICS#creator-a',
    sk: 'GA4#424203315#v1#30#2',
  });

  await cache.put(key, envelope);

  assert.equal(calls[1].input.TableName, 'creator-profiles-test');
  assert.deepEqual(calls[1].input.Item, cachedItem);
  assert.equal(calls[1].input.Item.updatedAt, envelope.updatedAt, 'Envelope timestamps remain milliseconds.');
  assert.equal(calls[1].input.Item.expiresAt, envelope.expiresAt);
  assert.equal(calls[1].input.Item.retainUntil, envelope.retainUntil);
  assert.equal(calls[1].input.Item.ttl, Math.ceil(envelope.retainUntil / 1000));
});

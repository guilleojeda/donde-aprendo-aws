import assert from 'node:assert/strict';
import test from 'node:test';
import { createCreatorStatisticsStore } from '../src/lib/creator-statistics-store.mjs';

test('DynamoDB cache rows use the analytics profile key and store retention TTL in epoch seconds', async () => {
  const key = { profileId: 'creator-a', period: 30, kind: 'page', page: 2 };
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
    sk: 'GA4#424203315#v2#30#page#2',
    recordType: 'analyticsCache',
    profileId: key.profileId,
    propertyId,
    period: key.period,
    page: key.page,
    kind: key.kind,
    revision: 'cached-revision',
    ...structuredClone(envelope),
    ttl: Math.ceil(envelope.retainUntil / 1000),
  };
  const client = {
    async send(command) {
      calls.push(command);
      if (command.constructor.name === 'GetCommand') return { Item: structuredClone(cachedItem) };
      if (command.constructor.name === 'PutCommand') {
        assert.ok(command.input.ConditionExpression, 'cache publication must use a conditional write');
        assert.equal(typeof command.input.Item.revision, 'string');
        return {};
      }
      throw new Error(`unexpected command ${command.constructor.name}`);
    },
  };
  const cache = createCreatorStatisticsStore({
    profilesTableName: 'creator-profiles-test',
    propertyId,
    client,
  });

  const predecessor = await cache.get(key);
  assert.deepEqual(predecessor.report, envelope.report);
  assert.equal(predecessor.schemaVersion, envelope.schemaVersion);
  assert.equal(predecessor.updatedAt, envelope.updatedAt);
  assert.equal(predecessor.expiresAt, envelope.expiresAt);
  assert.equal(predecessor.retainUntil, envelope.retainUntil);
  assert.equal(predecessor.revision, 'cached-revision');
  const getCommand = calls.find(({ constructor }) => constructor.name === 'GetCommand');
  assert.equal(getCommand.input.ConsistentRead, true);
  assert.equal(getCommand.input.TableName, 'creator-profiles-test');
  assert.deepEqual(getCommand.input.Key, {
    pk: cachedItem.pk,
    sk: cachedItem.sk,
  });

  // The envelope carries the verified predecessor revision used by the adapter's
  // conditional publication seam; do not rely on a fixed Get/Put call index.
  await cache.put(key, envelope, predecessor.revision);

  const putCommand = calls.find(({ constructor }) => constructor.name === 'PutCommand');
  assert.equal(putCommand.input.TableName, 'creator-profiles-test');
  assert.equal(putCommand.input.Item.pk, cachedItem.pk);
  assert.equal(putCommand.input.Item.sk, cachedItem.sk);
  assert.equal(typeof putCommand.input.Item.revision, 'string');
  assert.notEqual(putCommand.input.Item.revision, predecessor.revision);
  assert.equal(putCommand.input.Item.updatedAt, envelope.updatedAt, 'Envelope timestamps remain milliseconds.');
  assert.equal(putCommand.input.Item.expiresAt, envelope.expiresAt);
  assert.equal(putCommand.input.Item.retainUntil, envelope.retainUntil);
  assert.equal(putCommand.input.Item.ttl, Math.ceil(envelope.retainUntil / 1000));
});

test('the v2 scoped row is preferred and the old v1 row is read only as a fallback', async () => {
  const key = { profileId: 'creator-legacy', period: 7, kind: 'page', page: 1 };
  const envelope = {
    schemaVersion: 1,
    report: { creatorId: key.profileId, period: key.period, page: key.page },
    updatedAt: 1_798_000_000_123,
    expiresAt: 1_798_003_600_123,
    retainUntil: 1_798_604_800_123,
  };
  const legacy = {
    pk: 'ANALYTICS#creator-legacy',
    sk: 'GA4#424203315#v1#7#1',
    recordType: 'analyticsCache',
    profileId: key.profileId,
    propertyId: '424203315',
    period: key.period,
    page: key.page,
    ...structuredClone(envelope),
    ttl: Math.ceil(envelope.retainUntil / 1000),
  };
  const items = new Map([[`${legacy.pk}\u0000${legacy.sk}`, legacy]]);
  const calls = [];
  const cache = createCreatorStatisticsStore({
    profilesTableName: 'creator-profiles-test',
    propertyId: '424203315',
    client: {
      async send(command) {
        calls.push(command);
        if (command.constructor.name === 'GetCommand') {
          assert.equal(command.input.ConsistentRead, true);
          const item = items.get(`${command.input.Key.pk}\u0000${command.input.Key.sk}`);
          return item === undefined ? {} : { Item: structuredClone(item) };
        }
        if (command.constructor.name === 'PutCommand') {
          assert.match(command.input.Item.sk, /#v2#/u);
          assert.equal(command.input.Item.kind, 'page');
          assert.equal(typeof command.input.Item.revision, 'string');
          assert.ok(command.input.ConditionExpression);
          items.set(`${command.input.Item.pk}\u0000${command.input.Item.sk}`, structuredClone(command.input.Item));
          return {};
        }
        throw new Error(`unexpected command ${command.constructor.name}`);
      },
    },
  });

  const readLegacy = cache.readLegacy?.bind(cache);
  const legacyRead = readLegacy ? await readLegacy(key) : await cache.get(key);
  assert.deepEqual(legacyRead, envelope);
  if (!readLegacy) assert.ok(calls.some(({ constructor, input }) => constructor.name === 'GetCommand' && /#v2#/u.test(input.Key.sk)));
  assert.ok(calls.some(({ constructor, input }) => constructor.name === 'GetCommand' && /#v1#/u.test(input.Key.sk)));
  await cache.put(key, envelope, undefined);
  assert.equal(items.get(`${legacy.pk}\u0000${legacy.sk}`).revision, undefined);
  assert.equal([...items.values()].filter((item) => /#v2#/u.test(item.sk)).length, 1);
});

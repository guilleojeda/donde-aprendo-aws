import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createAccountStore } from '../src/lib/account-store.mjs';

const TABLE = 'creator-accounts-test';
const IDENTITY = { issuer: 'https://issuer.example.invalid/pool', sub: 'subject-123' };

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function accountKey(identity = IDENTITY) {
  const identityHash = createHash('sha256')
    .update(JSON.stringify([identity.issuer, identity.sub]))
    .digest('base64url');
  return `ACCOUNT#${identityHash}`;
}

function conditionalFailure() {
  const error = new Error('conditional check failed');
  error.name = 'ConditionalCheckFailedException';
  return error;
}

class FakeDynamoDocumentClient {
  items = new Map();
  calls = [];
  failure;

  failNext(error) {
    this.failure = error;
  }

  async send(command) {
    const input = clone(command.input);
    this.calls.push({ command, input });
    if (this.failure) {
      const failure = this.failure;
      this.failure = undefined;
      throw failure;
    }
    assert.equal(input.TableName, TABLE);

    if (command instanceof PutCommand) {
      const key = input.Item.pk;
      if (this.items.has(key)) throw conditionalFailure();
      this.items.set(key, clone(input.Item));
      return {};
    }

    if (command instanceof GetCommand) {
      return { Item: clone(this.items.get(input.Key.pk)) };
    }

    if (command instanceof DeleteCommand) {
      const item = this.items.get(input.Key.pk);
      if (input.ConditionExpression && !item) throw conditionalFailure();
      this.items.delete(input.Key.pk);
      return input.ReturnValues === 'ALL_OLD' ? { Attributes: clone(item) } : {};
    }

    if (command instanceof UpdateCommand) {
      const values = input.ExpressionAttributeValues;
      const names = input.ExpressionAttributeNames;
      const key = input.Key.pk;
      const item = clone(this.items.get(key)) ?? { pk: key };
      const isBoundaryUpdate = input.ConditionExpression !== undefined;
      if (isBoundaryUpdate) {
        assert.equal(input.ConditionExpression, 'attribute_not_exists(#authValidAfter) OR #authValidAfter < :atMs');
        const currentBoundary = item[names['#authValidAfter']];
        if (currentBoundary !== undefined && currentBoundary >= values[':atMs']) throw conditionalFailure();
        item[names['#identity']] ??= clone(values[':identity']);
        item[names['#active']] ??= values[':active'];
        item[names['#epoch']] = (item[names['#epoch']] ?? values[':zero']) + values[':one'];
        item[names['#authValidAfter']] = values[':atMs'];
      } else {
        item[names['#identity']] ??= clone(values[':identity']);
        item[names['#active']] ??= values[':active'];
        item[names['#epoch']] ??= values[':zero'];
        item[names['#authValidAfter']] ??= values[':zero'];
        if (Object.hasOwn(values, ':email')) item[names['#email']] = values[':email'];
      }
      this.items.set(key, item);
      return input.ReturnValues === 'ALL_NEW' ? { Attributes: clone(item) } : {};
    }

    throw new TypeError(`unexpected DynamoDB command: ${command.constructor.name}`);
  }
}

function makeStore(client = new FakeDynamoDocumentClient()) {
  return { client, store: createAccountStore({ tableName: TABLE, region: 'us-east-1', client }) };
}

test('store requires a table and a send-capable document client', () => {
  assert.throws(() => createAccountStore(), /tableName is required/);
  assert.throws(() => createAccountStore({ tableName: '  ' }), /tableName is required/);
  assert.throws(() => createAccountStore({ tableName: TABLE, client: {} }), /client must implement send/);
});

test('attempt and session writes use TTL seconds without changing logical millisecond expiry', async () => {
  const { client, store } = makeStore();
  const expiresAt = 1_900_000_000_999;
  const attempt = { nonce: 'nonce', codeVerifier: 'verifier', browserBindingHash: 'binding', expiresAt };
  const session = { identity: IDENTITY, epoch: 0, createdAt: expiresAt - 1000, expiresAt, csrfToken: 'csrf' };

  assert.equal(await store.putLoginAttempt('ATTEMPT#opaque', attempt), true);
  assert.equal(await store.putSession('SESSION#opaque', session), true);
  assert.equal(await store.putLoginAttempt('ATTEMPT#opaque', { ...attempt, nonce: 'replacement' }), false);
  assert.equal(await store.putSession('SESSION#opaque', { ...session, csrfToken: 'replacement' }), false);
  for (const [call, prefix, record] of [
    [client.calls[0], 'ATTEMPT#opaque', attempt],
    [client.calls[1], 'SESSION#opaque', session],
  ]) {
    assert.ok(call.command instanceof PutCommand);
    assert.equal(call.input.ConditionExpression, 'attribute_not_exists(pk)');
    assert.equal(call.input.Item.pk, prefix);
    assert.equal(call.input.Item.ttl, Math.ceil(expiresAt / 1000));
    assert.equal(call.input.Item.expiresAt, expiresAt);
    assert.equal(call.input.Item.csrfToken ?? call.input.Item.nonce, record.csrfToken ?? record.nonce);
  }

  await assert.rejects(store.putLoginAttempt('ACCOUNT#wrong', attempt), /invalid login attempt key/);
  await assert.rejects(store.putSession('ATTEMPT#wrong', session), /invalid session key/);
  await assert.rejects(store.putSession('SESSION#missing-expiry', { identity: IDENTITY }), /finite expiration/);
});

test('attempt consumption is conditional and concurrent callbacks get one record', async () => {
  const { client, store } = makeStore();
  const attempt = { nonce: 'nonce', codeVerifier: 'verifier', browserBindingHash: 'binding', expiresAt: 1_900_000_000_999 };
  await store.putLoginAttempt('ATTEMPT#once', attempt);

  const consumed = await Promise.all([
    store.takeLoginAttempt('ATTEMPT#once'),
    store.takeLoginAttempt('ATTEMPT#once'),
  ]);
  assert.equal(consumed.filter(Boolean).length, 1);
  assert.deepEqual(consumed.find(Boolean), attempt);
  assert.equal(await store.takeLoginAttempt('ATTEMPT#once'), null);

  for (const call of client.calls.filter(({ command }) => command instanceof DeleteCommand)) {
    assert.equal(call.input.ConditionExpression, 'attribute_exists(pk)');
    assert.equal(call.input.ReturnValues, 'ALL_OLD');
    assert.deepEqual(Object.keys(call.input.Key), ['pk']);
  }
  await assert.rejects(store.takeLoginAttempt('SESSION#wrong'), /invalid login attempt key/);
});

test('account upserts preserve active state and reset boundaries while reads are strongly consistent', async () => {
  const { client, store } = makeStore();
  const pk = accountKey();
  client.items.set(pk, {
    pk,
    identity: IDENTITY,
    email: 'old@example.invalid',
    active: false,
    epoch: 7,
    authValidAfter: 1_800_000_000_000,
  });

  const account = await store.ensureAccount(IDENTITY, 'new@example.invalid');
  assert.deepEqual(account, {
    identity: IDENTITY,
    email: 'new@example.invalid',
    active: false,
    epoch: 7,
    authValidAfter: 1_800_000_000_000,
  });
  const upsert = client.calls.at(-1);
  assert.ok(upsert.command instanceof UpdateCommand);
  assert.match(upsert.input.UpdateExpression, /#active = if_not_exists\(#active, :active\)/);
  assert.match(upsert.input.UpdateExpression, /#epoch = if_not_exists\(#epoch, :zero\)/);
  assert.match(upsert.input.UpdateExpression, /#authValidAfter = if_not_exists\(#authValidAfter, :zero\)/);
  assert.equal(upsert.input.ExpressionAttributeValues[':email'], 'new@example.invalid');
  assert.equal(upsert.input.ReturnValues, 'ALL_NEW');
  assert.match(upsert.input.Key.pk, /^ACCOUNT#[A-Za-z0-9_-]{43}$/);
  assert.equal(upsert.input.Key.pk.includes(IDENTITY.sub), false);

  const read = await store.getAccount(IDENTITY);
  assert.deepEqual(read, account);
  const get = client.calls.at(-1);
  assert.ok(get.command instanceof GetCommand);
  assert.equal(get.input.ConsistentRead, true);
  assert.equal(get.input.Key.pk, pk);
  await assert.rejects(store.getAccount({ issuer: IDENTITY.issuer }), /issuer and subject/);
});

test('reset creates a minimal account and advances its boundary without allowing rollback', async () => {
  const { client, store } = makeStore();
  await store.advanceAuthBoundary(IDENTITY, 1_800_000_000_000);
  assert.deepEqual(await store.getAccount(IDENTITY), {
    identity: IDENTITY,
    active: true,
    epoch: 1,
    authValidAfter: 1_800_000_000_000,
  });

  await store.advanceAuthBoundary(IDENTITY, 1_700_000_000_000);
  await store.advanceAuthBoundary(IDENTITY, 1_800_000_000_000);
  assert.deepEqual(await store.getAccount(IDENTITY), {
    identity: IDENTITY,
    active: true,
    epoch: 1,
    authValidAfter: 1_800_000_000_000,
  });

  await store.advanceAuthBoundary(IDENTITY, 1_900_000_000_123);
  assert.deepEqual(await store.getAccount(IDENTITY), {
    identity: IDENTITY,
    active: true,
    epoch: 2,
    authValidAfter: 1_900_000_000_123,
  });
  const resetWrites = client.calls.filter(({ command }) => command instanceof UpdateCommand && command.input.ConditionExpression);
  assert.equal(resetWrites.length, 4);
  for (const { input } of resetWrites) {
    assert.equal(input.TableName, TABLE);
    assert.equal(input.ConditionExpression, 'attribute_not_exists(#authValidAfter) OR #authValidAfter < :atMs');
    assert.match(input.UpdateExpression, /#epoch = if_not_exists\(#epoch, :zero\) \+ :one/);
    assert.match(input.UpdateExpression, /#authValidAfter = :atMs/);
    assert.ok(Number.isInteger(input.ExpressionAttributeValues[':atMs']));
  }

  const failure = new Error('database unavailable');
  client.failNext(failure);
  await assert.rejects(store.advanceAuthBoundary(IDENTITY, 2_000_000_000_000), (error) => error === failure);
  await assert.rejects(store.advanceAuthBoundary(IDENTITY, -1), /finite timestamp/);
});

test('session reads are consistent, strip storage metadata, and deletion is idempotent', async () => {
  const { client, store } = makeStore();
  const session = { identity: IDENTITY, epoch: 0, createdAt: 1_700_000_000_000, expiresAt: 1_700_604_800_000, csrfToken: 'csrf' };
  await store.putSession('SESSION#read', session);
  assert.deepEqual(await store.getSession('SESSION#read'), session);
  assert.equal(client.calls.at(-1).input.ConsistentRead, true);
  await store.deleteSession('SESSION#read');
  await store.deleteSession('SESSION#read');
  assert.equal(await store.getSession('SESSION#read'), null);
  await assert.rejects(store.getSession('ACCOUNT#wrong'), /invalid session key/);
});

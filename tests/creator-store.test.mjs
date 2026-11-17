import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { DynamoDBServiceException } from '@aws-sdk/client-dynamodb';
import { createCreatorStore } from '../src/lib/creator-store.mjs';
import { currentUrlKey, currentUrlReservationId } from '../src/lib/catalog-url.mjs';
import { dynamoDbItemSize } from '../src/lib/creator-dynamodb-size.mjs';

const TABLES = {
  accountsTableName: 'accounts-test',
  profilesTableName: 'profiles-test',
  catalogTableName: 'catalog-test',
};

function fakeClient(handler = async () => ({})) {
  const calls = [];
  return {
    calls,
    client: {
      async send(command) {
        calls.push(command);
        return handler(command, calls.length - 1);
      },
    },
  };
}

function pointReadFixture(command) {
  const key = command.input.Key;
  if (key?.pk?.startsWith('PROFILE#') && key.sk?.startsWith('EDITOR#')) {
    return {
      ...key,
      recordType: 'editorReference',
      profileId: key.pk.slice('PROFILE#'.length),
      resourceId: key.sk.slice('EDITOR#'.length),
      version: 3,
    };
  }
  if (key?.pk?.startsWith('PROFILE#') && key.sk?.startsWith('CLAIM#')) {
    return { ...key, id: key.sk.slice('CLAIM#'.length), version: 3 };
  }
  if (key?.pk === 'ADMIN#CLAIMS' && key.sk?.startsWith('CLAIM#')) {
    return {
      ...key,
      recordType: 'claim',
      id: key.sk.slice('CLAIM#'.length),
      version: 3,
    };
  }
  return { ...key, recordType: 'test', id: 'logical-id', version: 3 };
}

function modeledCancellation(message, reasons, attempts = 1) {
  const error = new DynamoDBServiceException({
    name: 'TransactionCanceledException',
    message,
    $metadata: { httpStatusCode: 400, attempts },
  });
  error.CancellationReasons = reasons;
  return error;
}

function commandName(command) {
  return command.constructor.name;
}

function assertExpressionBindings(input) {
  const expression = [
    input.ProjectionExpression,
    input.KeyConditionExpression,
    input.FilterExpression,
    input.ConditionExpression,
    input.UpdateExpression,
  ].filter(Boolean).join(' ');
  const aliases = new Set(expression.match(/#[A-Za-z0-9_]+/g) ?? []);
  for (const name of Object.keys(input.ExpressionAttributeNames ?? {})) {
    if (!aliases.has(name)) throw new Error(`unused expression alias ${name}`);
  }
  for (const alias of aliases) {
    if (!Object.hasOwn(input.ExpressionAttributeNames ?? {}, alias)) throw new Error(`missing expression alias ${alias}`);
  }
  const values = new Set(expression.match(/:[A-Za-z0-9_]+/g) ?? []);
  for (const name of Object.keys(input.ExpressionAttributeValues ?? {})) {
    if (!values.has(name)) throw new Error(`unused expression value ${name}`);
  }
  for (const value of values) {
    if (!Object.hasOwn(input.ExpressionAttributeValues ?? {}, value)) throw new Error(`missing expression value ${value}`);
  }
}

function sha(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

test('logical point reads map to the approved tables and always use strongly consistent gets', async () => {
  const { client, calls } = fakeClient(async (command) => ({
    Item: pointReadFixture(command),
  }));
  const store = createCreatorStore({ ...TABLES, client });
  const url = 'https://example.com/path?q=a%2Fb';
  const keys = [
    ['profile:creator-7', 'profiles-test', { pk: 'PROFILE#creator-7', sk: 'META' }],
    ['alias:ana-cordoba', 'profiles-test', { pk: 'SLUG#ana-cordoba', sk: 'META' }],
    ['editor:creator-7:resource:legacy-abc', 'profiles-test', { pk: 'PROFILE#creator-7', sk: 'EDITOR#resource:legacy-abc' }],
    ['claim-ref:creator-7:claim-abc', 'profiles-test', { pk: 'PROFILE#creator-7', sk: 'CLAIM#claim-abc' }],
    ['claim:claim-abc', 'profiles-test', { pk: 'ADMIN#CLAIMS', sk: 'CLAIM#claim-abc' }],
    ['photo-upload:upload-abc', 'profiles-test', { pk: 'PHOTO_UPLOAD#upload-abc', sk: 'META' }],
    [`account-profile:issuer-subject-hash`, 'accounts-test', { pk: `PROFILE_OWNER#${sha('issuer-subject-hash')}` }],
    ['resource:legacy-id:with-colon', 'catalog-test', { id: 'legacy-id:with-colon' }],
    [currentUrlKey(url), 'catalog-test', { id: `__url#${sha(url)}` }],
  ];

  for (const [logical, table, key] of keys) {
    await store.get(logical);
    const request = calls.at(-1);
    assert.equal(commandName(request), 'GetCommand');
    assert.equal(request.input.TableName, table);
    assert.deepEqual(request.input.Key, key);
    assert.equal(request.input.ConsistentRead, true);
  }
  assert.equal(calls[0].input.Key.sk, 'META');
});

test('scoped owner queries and global admin scans paginate strongly and project only needed fields', async () => {
  const pages = new Map();
  const { client, calls } = fakeClient(async (command) => {
    const input = command.input;
    const pageKey = `${commandName(command)}:${input.TableName}:${JSON.stringify(input.ExpressionAttributeValues ?? {})}:${input.ExclusiveStartKey ? 'second' : 'first'}`;
    if (pages.has(pageKey)) throw new Error(`unexpected repeated request ${pageKey}`);
    pages.set(pageKey, true);
    if (commandName(command) === 'QueryCommand' && input.ExpressionAttributeValues[':sk'] === 'EDITOR#') {
      return { Items: [{ recordType: 'editorReference', profileId: 'creator-a', resourceId: 'r1', version: 1, pk: 'PROFILE#creator-a', sk: 'EDITOR#r1' }] };
    }
    if (commandName(command) === 'QueryCommand' && input.ExpressionAttributeValues[':pk'] === 'PROFILE#creator-a'
      && input.ExpressionAttributeValues[':sk'] === 'CLAIM#') {
      return { Items: [{ id: 'claim-1', version: 1, pk: 'PROFILE#creator-a', sk: 'CLAIM#claim-1' }] };
    }
    if (commandName(command) === 'ScanCommand' && input.TableName === 'profiles-test') {
      return { Items: [
        { recordType: 'profile', id: 'legacy-profile', slug: 'old', displayName: 'Legacy', published: true, hidden: false, version: 9, pk: 'PROFILE#legacy-profile', sk: 'META' },
        { recordType: 'creatorState', schemaVersion: 2, id: 'creator-a', slug: 'ana', displayName: 'Ana', published: true, hidden: false, version: 1, pk: 'PROFILE#creator-a', sk: 'META' },
      ] };
    }
    if (commandName(command) === 'ScanCommand' && input.TableName === 'catalog-test') {
      return { Items: [
        { id: 'r1', title: 'Ficha', url: 'https://example.com', published: false },
        { id: '__url#internal', recordType: 'urlReservation', url: 'https://example.com', status: 'reserved' },
      ] };
    }
    if (commandName(command) === 'QueryCommand' && input.ExpressionAttributeValues[':pk'] === 'ADMIN#CLAIMS') {
      return { Items: [{ id: 'claim-1', recordType: 'claim', accountId: 'private-account', evidence: 'private proof', pk: 'ADMIN#CLAIMS', sk: 'CLAIM#claim-1' }] };
    }
    throw new Error(`unexpected command ${pageKey}`);
  });
  const store = createCreatorStore({ ...TABLES, client });

  const editors = await store.list('editor:creator-a:');
  assert.deepEqual(editors.map(({ key }) => key), ['editor:creator-a:r1']);

  const claimRefs = await store.list('claim-ref:creator-a:');
  assert.deepEqual(claimRefs.map(({ key }) => key), ['claim-ref:creator-a:claim-1']);
  const refQuery = calls.at(-1).input;
  assert.equal(refQuery.TableName, 'profiles-test');
  assert.equal(refQuery.ExpressionAttributeValues[':pk'], 'PROFILE#creator-a');
  assert.doesNotMatch(Object.values(refQuery.ExpressionAttributeNames).join(','), /accountId|evidence|email/);

  const profiles = await store.list('profile:');
  assert.equal(profiles[0].key, 'profile:creator-a');
  const profileScan = calls.at(-1).input;
  assert.equal(profileScan.ConsistentRead, true);
  assert.ok(Object.values(profileScan.ExpressionAttributeNames).includes('schemaVersion'));
  assert.ok(Object.values(profileScan.ExpressionAttributeNames).includes('displayName'));
  assert.doesNotMatch(Object.values(profileScan.ExpressionAttributeNames).join(','), /accountId|email|evidence/);

  const resources = await store.list('resource:');
  assert.deepEqual(resources.map(({ key }) => key), ['resource:r1']);
  const resourceScan = calls.at(-1).input;
  assert.equal(resourceScan.TableName, 'catalog-test');
  assert.equal(resourceScan.ConsistentRead, true);
  assert.doesNotMatch(Object.values(resourceScan.ExpressionAttributeNames).join(','), /accountId|email|evidence|csrf/);

  const claims = await store.list('claim:');
  assert.equal(claims[0].key, 'claim:claim-1');
  const adminQuery = calls.at(-1).input;
  assert.equal(adminQuery.TableName, 'profiles-test');
  assert.equal(adminQuery.ExpressionAttributeValues[':pk'], 'ADMIN#CLAIMS');
  assert.ok(Object.values(adminQuery.ExpressionAttributeNames).includes('evidence'));
  assert.equal(adminQuery.ExpressionAttributeNames['#pk'], 'pk');
  assert.equal(adminQuery.ExpressionAttributeNames['#sk'], 'sk');
  assert.equal(calls.some((call) => commandName(call) === 'ScanCommand' && call.input.TableName === 'accounts-test'), false);
  for (const call of calls) assertExpressionBindings(call.input);
});

test('list pagination treats only absent, null, or empty cursors as terminal and rejects malformed cursors', async () => {
  for (const cursor of [undefined, null, {}]) {
    const { client } = fakeClient(async () => ({ Items: [], LastEvaluatedKey: cursor }));
    const store = createCreatorStore({ ...TABLES, client });
    assert.deepEqual(await store.list('resource:'), []);
  }

  for (const cursor of ['not-a-key', [], 42]) {
    const { client } = fakeClient(async () => ({ Items: [], LastEvaluatedKey: cursor }));
    const store = createCreatorStore({ ...TABLES, client });
    await assert.rejects(store.list('resource:'), /invalid LastEvaluatedKey/);
  }
});

test('creatorState point reads preserve a missing aggregate revision for the state validator', async () => {
  const { client } = fakeClient(async () => ({ Item: {
    pk: 'PROFILE#creator-a', sk: 'META', recordType: 'creatorState', schemaVersion: 2, id: 'creator-a',
  } }));
  const store = createCreatorStore({ ...TABLES, client });
  const state = await store.get('profile:creator-a');
  assert.equal(Object.hasOwn(state, 'version'), false,
    'the storage adapter does not default a malformed aggregate revision to zero');
});

test('measurePut computes physical size from the exact logical META key and nested aggregate fields', () => {
  const { client } = fakeClient();
  const store = createCreatorStore({ ...TABLES, client });
  const candidate = {
    recordType: 'creatorState', schemaVersion: 2, id: 'creator-a', version: 3,
    displayName: 'Ana', slug: 'ana', programs: [], socials: {}, published: false, hidden: false,
    createdAt: 1, updatedAt: 2,
    placements: { placement: { resourceId: 'resource:one', selectedForDirectory: true } },
    order: { featured: [], ordinary: ['placement'] },
    series: { course: { name: 'Curso', slug: 'curso', chapters: ['placement'] } },
  };
  const measured = store.measurePut('profile:creator-a', candidate);
  assert.equal(measured.itemBytes, dynamoDbItemSize({
    ...candidate, pk: 'PROFILE#creator-a', sk: 'META',
  }));
  assert.ok(measured.itemBytes > dynamoDbItemSize(candidate), 'physical keys count toward the item size');
});

test('getResources batch gets all IDs in strongly consistent projected chunks of at most 100', async () => {
  const ids = Array.from({ length: 201 }, (_, index) => `resource-${index}`);
  ids.push(ids[0]);
  const { client, calls } = fakeClient(async (command) => {
    assert.equal(commandName(command), 'BatchGetCommand');
    const [table, request] = Object.entries(command.input.RequestItems)[0];
    assert.equal(table, 'catalog-test');
    assert.ok(request.Keys.length <= 100);
    assert.equal(request.ConsistentRead, true);
    assert.ok(request.ProjectionExpression.includes('#r0'));
    assert.ok(Object.values(request.ExpressionAttributeNames).includes('registrationUrl'));
    assert.doesNotMatch(Object.values(request.ExpressionAttributeNames).join(','), /accountId|email|evidence/);
    return { Responses: { [table]: request.Keys.map(({ id }) => ({ id, title: `Title ${id}`, version: 1 })).reverse() } };
  });
  const store = createCreatorStore({ ...TABLES, client });
  const resources = await store.getResources(ids);

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((command) => command.input.RequestItems['catalog-test'].Keys.length), [100, 100, 1]);
  assert.equal(resources.size, 201);
  assert.equal(resources.get('resource-200').title, 'Title resource-200');
});

test('getResources retries UnprocessedKeys within a bounded budget and returns a complete map', async () => {
  let callCount = 0;
  const { client, calls } = fakeClient(async (command) => {
    callCount += 1;
    const table = Object.keys(command.input.RequestItems)[0];
    if (callCount === 1) {
      return {
        Responses: { [table]: [{ id: 'ready', title: 'Ready' }] },
        UnprocessedKeys: { [table]: { Keys: [{ id: 'retry' }] } },
      };
    }
    return { Responses: { [table]: [{ id: 'retry', title: 'Retried' }] } };
  });
  const store = createCreatorStore({ ...TABLES, client });
  const resources = await store.getResources(['ready', 'retry']);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].input.RequestItems['catalog-test'].Keys, [{ id: 'retry' }]);
  assert.equal(calls[1].input.RequestItems['catalog-test'].ConsistentRead, true,
    'retry reads retain the strong-consistency setting');
  assert.equal(resources.get('retry').title, 'Retried');

  const { client: stuckClient, calls: stuckCalls } = fakeClient(async (command) => {
    const [table, request] = Object.entries(command.input.RequestItems)[0];
    return { UnprocessedKeys: { [table]: { Keys: request.Keys } } };
  });
  const stuckStore = createCreatorStore({ ...TABLES, client: stuckClient });
  await assert.rejects(stuckStore.getResources(['stuck']), /exceeded unprocessed key retries/);
  assert.equal(stuckCalls.length, 4, 'one initial request and at most three retries');
});

test('getResources rejects a resource reported as both returned and unprocessed', async () => {
  let callCount = 0;
  const { client, calls } = fakeClient(async (command) => {
    callCount += 1;
    const table = Object.keys(command.input.RequestItems)[0];
    if (callCount === 1) {
      return {
        Responses: { [table]: [{ id: 'contradictory', title: 'Returned' }] },
        UnprocessedKeys: { [table]: { Keys: [{ id: 'contradictory' }] } },
      };
    }
    return { Responses: { [table]: [] } };
  });
  const store = createCreatorStore({ ...TABLES, client });

  await assert.rejects(store.getResources(['contradictory']), /both returned and unprocessed/);
  assert.equal(calls.length, 1, 'contradictory provider data is rejected before a retry can turn it into absence');
});

test('getResources returns found rows and omits legitimately absent resources', async () => {
  const { client, calls } = fakeClient(async (command) => {
    const table = Object.keys(command.input.RequestItems)[0];
    if (calls.length === 1) {
      return { Responses: { [table]: [{ id: 'found', title: 'Found' }] } };
    }
    if (calls.length === 2) return { Responses: { [table]: [] } };
    return {};
  });
  const store = createCreatorStore({ ...TABLES, client });

  const partial = await store.getResources(['found', 'absent']);
  assert.deepEqual([...partial], [['found', { id: 'found', title: 'Found', version: 0 }]]);

  const empty = await store.getResources(['absent']);
  assert.deepEqual([...empty], []);
  const omittedResponses = await store.getResources(['also-absent']);
  assert.deepEqual([...omittedResponses], []);
  assert.equal(calls.length, 3);
});

test('getResources rejects malformed, unexpected, duplicate, and provider-error responses', async () => {
  const invalidResponses = [
    null,
    { Responses: { 'catalog-test': 'not-an-item-list' } },
    { UnprocessedKeys: { 'catalog-test': { Keys: 'not-a-key-list' } } },
    { Responses: { 'catalog-test': null } },
    { Responses: { 'other-table': [] } },
    { Responses: { 'catalog-test': [{ id: 'unexpected' }] } },
    { Responses: { 'catalog-test': [{ id: 'expected' }, { id: 'expected' }] } },
  ];
  for (const response of invalidResponses) {
    const { client } = fakeClient(async () => response);
    const store = createCreatorStore({ ...TABLES, client });
    await assert.rejects(store.getResources(['expected']), /malformed|unexpected/);
  }

  const providerFailure = new Error('DynamoDB provider unavailable');
  const { client } = fakeClient(async () => { throw providerFailure; });
  const store = createCreatorStore({ ...TABLES, client });
  await assert.rejects(store.getResources(['expected']), (error) => error === providerFailure);
});

test('getClaims retries an exact composite key when the provider changes key attribute order', async () => {
  let attempts = 0;
  const { client, calls } = fakeClient(async (command) => {
    const table = TABLES.profilesTableName;
    const request = command.input.RequestItems[table];
    attempts += 1;
    assert.deepEqual(request.Keys, attempts === 1
      ? [{ pk: 'ADMIN#CLAIMS', sk: 'CLAIM#claim-order' }]
      : [{ sk: 'CLAIM#claim-order', pk: 'ADMIN#CLAIMS' }]);
    if (attempts === 1) {
      return {
        Responses: { [table]: [] },
        UnprocessedKeys: { [table]: { Keys: [{ sk: 'CLAIM#claim-order', pk: 'ADMIN#CLAIMS' }] } },
      };
    }
    return {
      Responses: { [table]: [{
        sk: 'CLAIM#claim-order', pk: 'ADMIN#CLAIMS', recordType: 'claim', id: 'claim-order',
        accountId: 'account-a', resourceIds: ['resource-a'], status: 'pending',
      }] },
    };
  });
  const store = createCreatorStore({ ...TABLES, client });
  const claims = await store.getClaims(['claim-order']);
  assert.deepEqual(claims.get('claim-order'), {
    recordType: 'claim', id: 'claim-order', accountId: 'account-a', resourceIds: ['resource-a'], status: 'pending', version: 0,
  });
  assert.equal(attempts, 2);
  assert.equal(calls.length, 2);
});

test('transactions merge CAS checks with writes and preserve absent, legacy-zero, and version conditions', async () => {
  const { client, calls } = fakeClient(async () => ({}));
  const store = createCreatorStore({ ...TABLES, client });
  const url = currentUrlKey('https://example.com/new');
  const committed = await store.transact({
    checks: [
      { key: 'profile:creator-a', version: 0 },
      { key: url, version: null },
      { key: 'editor:creator-a:resource-a', version: 4 },
    ],
    puts: [
      { key: 'profile:creator-a', value: { recordType: 'profile', id: 'creator-a', version: 1 } },
      { key: url, value: { recordType: 'urlReservation', id: 'url-id', version: 1 } },
    ],
    deletes: ['editor:creator-a:resource-a'],
  });
  assert.equal(committed, true);
  const request = calls[0];
  assert.equal(commandName(request), 'TransactWriteCommand');
  const items = request.input.TransactItems;
  assert.equal(items.length, 3);
  assert.equal(items.filter((item) => item.ConditionCheck).length, 0, 'CAS on a written item must be one DynamoDB action');

  const profilePut = items.find((item) => item.Put?.TableName === 'profiles-test' && item.Put.Item.sk === 'META');
  assert.match(profilePut.Put.ConditionExpression, /attribute_exists\(#pk\)/);
  assert.match(profilePut.Put.ConditionExpression, /attribute_not_exists\(#version\) OR #version = :zero/);
  assert.equal(profilePut.Put.ExpressionAttributeValues[':zero'], 0);
  const urlPut = items.find((item) => item.Put?.TableName === 'catalog-test');
  assert.match(urlPut.Put.ConditionExpression, /attribute_not_exists\(#id\)/);
  const editorDelete = items.find((item) => item.Delete);
  assert.equal(editorDelete.Delete.TableName, 'profiles-test');
  assert.match(editorDelete.Delete.ConditionExpression, /#version = :version/);
  assert.equal(editorDelete.Delete.ExpressionAttributeValues[':version'], 4);
  assert.deepEqual(editorDelete.Delete.Key, { pk: 'PROFILE#creator-a', sk: 'EDITOR#resource-a' });
  for (const item of items) assertExpressionBindings(item.Put ?? item.Delete ?? item.ConditionCheck);
});

test('URL reservation CAS compares exact observed content and coalesces it with the write', async () => {
  const { client, calls } = fakeClient(async () => ({}));
  const store = createCreatorStore({ ...TABLES, client });
  const url = 'https://example.com/shared?raw=%2f';
  const key = currentUrlKey(url);
  const expected = {
    id: currentUrlReservationId(url),
    recordType: 'urlReservation',
    url,
    status: 'collision',
    resourceIds: ['resource-z', 'resource-a'],
    version: 1,
  };
  const originalMembers = [...expected.resourceIds];
  const pending = store.transact({
    checks: [{ key, version: 1, expectedReservation: expected }],
    puts: [{ key, value: { ...expected, resourceIds: ['resource-a', 'resource-z'], version: 1 } }],
  });
  expected.resourceIds.reverse();
  assert.equal(await pending, true);

  const { TransactItems: items } = calls[0].input;
  assert.equal(items.length, 1, 'the row comparison is coalesced into the row Put');
  const input = items[0].Put;
  assert.ok(input);
  assert.match(input.ConditionExpression, /attribute_exists\(#id\)/);
  for (const field of ['id', 'recordType', 'url', 'status', 'resourceIds']) {
    const name = Object.keys(input.ExpressionAttributeNames).find((token) => input.ExpressionAttributeNames[token] === field
      && new RegExp(`${token}\\s*=\\s*(:[A-Za-z0-9_]+)`, 'u').test(input.ConditionExpression));
    assert.ok(name, `${field} has a storage-condition alias`);
    const equals = input.ConditionExpression.match(new RegExp(`${name}\\s*=\\s*(:[A-Za-z0-9_]+)`, 'u'));
    assert.ok(equals, `${field} is compared by equality`);
    const expectedValue = field === 'resourceIds' ? originalMembers : expected[field];
    assert.deepEqual(input.ExpressionAttributeValues[equals[1]], expectedValue, `${field} uses the captured observation`);
  }
  const singularAlias = Object.keys(input.ExpressionAttributeNames)
    .find((token) => input.ExpressionAttributeNames[token] === 'resourceId');
  assert.ok(singularAlias && input.ConditionExpression.includes(`attribute_not_exists(${singularAlias})`),
    'the absent unique owner field is part of the observed shape');
  assert.equal(input.ExpressionAttributeValues[':version'], 1);
  assertExpressionBindings(input);
});

test('expected reservation conditions reject other keys and mismatched versions before sending', async () => {
  const { client, calls } = fakeClient(async () => ({}));
  const store = createCreatorStore({ ...TABLES, client });
  const url = 'https://example.com/observed';
  const expectedReservation = {
    id: currentUrlReservationId(url), recordType: 'urlReservation', url,
    status: 'reserved', resourceId: 'resource-a', version: 4,
  };
  await assert.rejects(store.transact({
    checks: [{ key: 'resource:resource-a', version: 4, expectedReservation }],
  }), /expected reservation state requires a URL reservation key/);
  await assert.rejects(store.transact({
    checks: [{ key: currentUrlKey(url), version: 1, expectedReservation }],
  }), /invalid expected URL reservation state/);
  assert.equal(calls.length, 0);
});

test('expression validation rejects both unused aliases and placeholders without definitions', () => {
  assert.throws(() => assertExpressionBindings({
    KeyConditionExpression: '#pk = :pk',
    ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
    ExpressionAttributeValues: { ':pk': 'PROFILE#a' },
  }), /unused expression alias #sk/);
  assert.throws(() => assertExpressionBindings({
    ConditionExpression: 'attribute_exists(#pk) AND #version = :version',
    ExpressionAttributeNames: { '#pk': 'pk' },
    ExpressionAttributeValues: { ':version': 1 },
  }), /missing expression alias #version/);
});

test('transaction cancellation reports only conditional races as false and propagates operational failures', async () => {
  let nextError = modeledCancellation('conditional', [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }]);
  const { client, calls } = fakeClient(async () => { throw nextError; });
  const store = createCreatorStore({ ...TABLES, client });
  assert.equal(await store.transact({ checks: [{ key: 'profile:p1', version: null }] }), false);
  assert.equal(commandName(calls[0]), 'TransactWriteCommand');
  assert.equal(calls[0].input.TransactItems[0].ConditionCheck.TableName, TABLES.profilesTableName);

  nextError = modeledCancellation('transaction conflict', [{ Code: 'None' }, { Code: 'TransactionConflict' }, { Code: 'None' }]);
  assert.equal(await store.transact({ checks: [{ key: 'profile:p1', version: null }] }), false,
    'a definite item contention is returned to the service conflict/winner handling');

  nextError = modeledCancellation('capacity', [{ Code: 'ProvisionedThroughputExceeded' }]);
  await assert.rejects(store.transact({ checks: [{ key: 'profile:p1', version: null }] }), /capacity/);

  for (const reason of ['ProvisionedThroughputExceeded', 'ValidationError']) {
    nextError = modeledCancellation(`mixed ${reason}`, [{ Code: 'TransactionConflict' }, { Code: reason }]);
    await assert.rejects(store.transact({ checks: [{ key: 'profile:p1', version: null }] }), new RegExp(`mixed ${reason}`));
  }

  nextError = modeledCancellation('ambiguous cancellation', [{ Code: 'TransactionConflict' }, {}]);
  await assert.rejects(store.transact({ checks: [{ key: 'profile:p1', version: null }] }), /ambiguous cancellation/);

  nextError = modeledCancellation('uncertain cancellation', undefined);
  await assert.rejects(store.transact({ checks: [{ key: 'profile:p1', version: null }] }), /uncertain cancellation/);
});

test('transactions reject duplicate physical writes and more than 100 physical actions before sending', async () => {
  const { client, calls } = fakeClient(async () => ({}));
  const store = createCreatorStore({ ...TABLES, client });
  await assert.rejects(store.transact({
    puts: [
      { key: 'profile:creator-a', value: { id: 'creator-a' } },
      { key: 'profile:creator-a', value: { id: 'creator-a' } },
    ],
  }), /duplicate transaction action/);
  const checks = Array.from({ length: 101 }, (_, index) => ({ key: `alias:slug-${index}`, version: null }));
  await assert.rejects(store.transact({ checks }), /exceeds 100 physical actions/);
  assert.equal(calls.length, 0);
});

test('store configuration rejects missing table names and unsupported list prefixes', async () => {
  const { client } = fakeClient();
  assert.throws(() => createCreatorStore({ ...TABLES, profilesTableName: '', client }), /profilesTableName is required/);
  const store = createCreatorStore({ ...TABLES, client });
  await assert.rejects(store.list('account-profile:'), /unsupported logical list prefix/);
  await assert.rejects(store.get('placement:creator-a:placement-a'), /unsupported logical key/);
  await assert.rejects(store.get('series:creator-a:series-a'), /unsupported logical key/);
  await assert.rejects(store.list('placement:creator-a:'), /unsupported logical list prefix/);
  await assert.rejects(store.list('series:creator-a:'), /unsupported logical list prefix/);
});

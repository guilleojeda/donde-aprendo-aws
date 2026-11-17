import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSubmissionHandler } from '../src/api/submission.mjs';
import { createDynamoCatalogAccess } from '../src/lib/catalog-resource-writer.mjs';
import {
  currentUrlCollision,
  currentUrlReservation,
  currentUrlReservationId,
} from '../src/lib/catalog-url.mjs';

const SHARED_CASES = JSON.parse(readFileSync(
  new URL('./fixtures/catalog-storage-cases.json', import.meta.url), 'utf8',
));
const TABLE_NAME = 'phase3-catalog';
const BASE_SUBMISSION = Object.freeze({
  email: 'phase3@example.invalid',
  full_name: 'Phase 3 Acceptance',
  title: 'Recurso de aceptación',
  url: 'https://example.invalid/phase3/created',
  text: 'Registro de prueba de la frontera de almacenamiento.',
  Category: 'Otros',
  website: '',
});

function clone(value) {
  return structuredClone(value);
}

function request(overrides = {}) {
  return {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...BASE_SUBMISSION, ...overrides }),
  };
}

function transactionConflict(reasons = [{ Code: 'ConditionalCheckFailed' }]) {
  const error = new Error('conditional transaction conflict');
  error.name = 'TransactionCanceledException';
  error.CancellationReasons = reasons;
  return error;
}

function seedCase(example) {
  return [
    { key: example.reservationPhysicalKey?.id ?? example.reservation.id, item: example.reservation },
    ...example.members.map(({ physicalKey, item }) => ({ key: physicalKey.id, item })),
  ];
}

function projected(item, input) {
  if (!item || !input.ProjectionExpression) return clone(item);
  const names = input.ExpressionAttributeNames ?? {};
  const fields = input.ProjectionExpression.split(',').map((field) => names[field.trim()] ?? field.trim());
  return Object.fromEntries(fields
    .filter((field) => Object.hasOwn(item, field))
    .map((field) => [field, clone(item[field])]));
}

/**
 * A DocumentClient-shaped catalog boundary. It applies projected GetItem and
 * atomic conditional Put semantics without bypassing the real submission
 * handler or URL writer.
 */
async function createProvider(seed = [], options = {}) {
  const records = new Map(seed.map((entry) => {
    const item = entry?.item ?? entry;
    return [entry?.key ?? item.id, clone(item)];
  }));
  const calls = { get: [], transactions: [] };
  let memberHookUsed = false;

  const docClient = {
    async send(command) {
      const input = command.input;
      if (input?.Key) {
        const key = input.Key.id;
        calls.get.push(clone(input));
        if (!memberHookUsed && options.onMemberRead && options.memberIds?.has(key)) {
          memberHookUsed = true;
          options.onMemberRead({ records, key });
        }
        const item = records.get(key);
        return item ? { Item: projected(item, input) } : {};
      }

      assert.ok(Array.isArray(input?.TransactItems), 'provider received a transaction request');
      calls.transactions.push(clone(input));
      const puts = input.TransactItems.map((action) => action.Put);
      assert.equal(puts.length, 2, 'submission writes one resource and one reservation');
      assert.ok(puts.every((put) => put?.TableName === TABLE_NAME));
      for (const put of puts) {
        assert.equal(put.ConditionExpression, 'attribute_not_exists(#id)',
          'both physical rows retain the create-only condition');
        assert.deepEqual(put.ExpressionAttributeNames, { '#id': 'id' });
      }

      if (options.transactionMode === 'conditional-always') {
        throw transactionConflict([{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }]);
      }
      if (options.transactionMode === 'conditional-then-winner' && calls.transactions.length === 1) {
        const winner = options.winner;
        records.set(winner.id, clone(winner));
        records.set(currentUrlReservationId(winner.url), currentUrlReservation(winner.url, winner.id));
        throw transactionConflict([{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }]);
      }
      if (options.transactionMode === 'unknown-missing-reasons' || options.transactionMode === 'unknown-reasons') {
        const error = new Error('provider response lost without cancellation reasons');
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = options.reasons;
        throw error;
      }
      if (options.transactionMode === 'unknown-before-commit') {
        throw new Error('provider response lost before commit');
      }

      const duplicateIds = puts.map(({ Item }) => Item.id).filter((id) => records.has(id));
      if (duplicateIds.length > 0) throw transactionConflict();
      for (const { Item } of puts) records.set(Item.id, clone(Item));
      return {};
    },
  };

  const access = await createDynamoCatalogAccess({ region: 'us-east-1', docClient });
  const generatedIds = [...(options.resourceIds ?? ['resource-phase3-created'])];
  const handler = createSubmissionHandler({
    tableName: TABLE_NAME,
    ...access,
    now: () => '2026-11-17T12:00:00.000Z',
    resourceId: () => generatedIds.shift() ?? 'resource-phase3-overflow',
  });
  return { records, calls, access, handler };
}

async function readThroughProvider(provider, id) {
  const result = await provider.access.getItem({
    TableName: TABLE_NAME,
    Key: { id },
    ConsistentRead: true,
  });
  return result.Item ?? null;
}

function responseBody(result) {
  return JSON.parse(result.body);
}

test('source submission handler persists both rows through the provider-shaped writer boundary', async () => {
  const provider = await createProvider();
  const result = await provider.handler(request());

  assert.equal(result.statusCode, 201);
  const accepted = responseBody(result);
  assert.equal(accepted.id, 'resource-phase3-created');
  assert.equal(provider.calls.transactions.length, 1);
  const storedResource = await readThroughProvider(provider, accepted.id);
  const storedReservation = await readThroughProvider(provider, currentUrlReservationId(BASE_SUBMISSION.url));
  assert.equal(storedResource.url, BASE_SUBMISSION.url);
  assert.equal(storedResource.published, false);
  assert.equal(storedResource.version, 1);
  assert.deepEqual(storedReservation, currentUrlReservation(BASE_SUBMISSION.url, accepted.id));
});

test('a reserved resource URL returns duplicate without a write and validates its physical member', async () => {
  const example = SHARED_CASES.cases.find(({ name }) => name === 'reserved-resource');
  const provider = await createProvider(seedCase(example), {
    resourceIds: ['resource-submission-duplicate'],
  });
  const result = await provider.handler(request({ url: example.url }));

  assert.equal(result.statusCode, 409);
  assert.deepEqual(responseBody(result), { ok: false, code: 'duplicate' });
  assert.equal(provider.calls.transactions.length, 0);
  assert.ok(provider.calls.get.some(({ Key }) => Key.id === example.reservation.resourceId));
  assert.equal((await readThroughProvider(provider, example.reservation.resourceId)).url, example.url);
});

test('an event reservation uses registrationUrl and returns duplicate', async () => {
  const example = SHARED_CASES.cases.find(({ name }) => name === 'reserved-event-registration');
  const provider = await createProvider(seedCase(example));
  const result = await provider.handler(request({ url: example.url }));

  assert.equal(result.statusCode, 409);
  assert.deepEqual(responseBody(result), { ok: false, code: 'duplicate' });
  assert.equal(provider.calls.transactions.length, 0);
  assert.ok(provider.calls.get.some(({ Key }) => Key.id === 'meetup-event-common'));
});

test('a valid collision reads every physical member and returns duplicate without a write', async () => {
  const example = SHARED_CASES.cases.find(({ name }) => name === 'valid-collision');
  const provider = await createProvider(seedCase(example));
  const result = await provider.handler(request({ url: example.url }));

  assert.equal(result.statusCode, 409);
  assert.deepEqual(responseBody(result), { ok: false, code: 'duplicate' });
  assert.equal(provider.calls.transactions.length, 0);
  const memberReads = provider.calls.get
    .map(({ Key }) => Key.id)
    .filter((id) => example.reservation.resourceIds.includes(id));
  assert.deepEqual(new Set(memberReads), new Set(example.reservation.resourceIds),
    'all collision members, including each physical key, are checked');
});

for (const example of SHARED_CASES.cases.filter(({ expected }) => expected.admission.startsWith('reject-'))) {
  const { name } = example;
  test(`stable ${name} is rejected without a partial write`, async () => {
    const provider = await createProvider(seedCase(example));
    const before = [...provider.records.entries()];
    const result = await provider.handler(request({ url: example.url }));

    if (name === 'malformed-reservation-wrong-physical-key') {
      const reservationRead = provider.calls.get.find(({ Key }) => Key.id === example.reservationPhysicalKey.id);
      assert.ok(reservationRead, 'the reservation is requested by its physical key');
      assert.notEqual(example.reservation.id, example.reservationPhysicalKey.id,
        'the malformed payload identity differs from the requested physical key');
    }
    assert.equal(result.statusCode, 500);
    assert.deepEqual(responseBody(result), { ok: false, code: 'storage_error' });
    assert.equal(provider.calls.transactions.length, 0);
    assert.deepEqual([...provider.records.entries()], before);
  });
}

for (const winner of [false, true]) {
  test(`a coherent URL move is re-observed when the first read straddles a move${winner ? ' to a winner' : ''}`, async () => {
    const requestedUrl = 'https://example.invalid/phase3/straddled';
    const movedUrl = 'https://example.invalid/phase3/moved';
    const moving = { id: 'resource-phase3-moving', url: requestedUrl, title: 'Se mueve', version: 3 };
    const winnerResource = { id: 'resource-phase3-winner', url: requestedUrl, title: 'Gana', version: 1 };
    const initialReservation = currentUrlReservation(requestedUrl, moving.id);
    const provider = await createProvider([moving, initialReservation], {
      resourceIds: ['resource-phase3-straddled'],
      memberIds: new Set([moving.id]),
      onMemberRead: ({ records }) => {
        records.set(moving.id, { ...moving, url: movedUrl });
        records.delete(initialReservation.id);
        records.set(currentUrlReservationId(movedUrl), currentUrlReservation(movedUrl, moving.id));
        if (winner) {
          records.set(winnerResource.id, winnerResource);
          records.set(initialReservation.id, currentUrlReservation(requestedUrl, winnerResource.id));
        }
      },
    });
    const before = clone([...provider.records.entries()]);
    const result = await provider.handler(request({ url: requestedUrl }));

    assert.equal(result.statusCode, winner ? 409 : 201, JSON.stringify(responseBody(result)));
    if (winner) {
      assert.deepEqual(responseBody(result), { ok: false, code: 'duplicate' });
      assert.equal(provider.calls.transactions.length, 0);
      assert.equal((await readThroughProvider(provider, winnerResource.id)).url, requestedUrl);
    } else {
      const accepted = responseBody(result);
      assert.equal(accepted.id, 'resource-phase3-straddled');
      assert.equal(provider.calls.transactions.length, 1);
      assert.equal((await readThroughProvider(provider, currentUrlReservationId(requestedUrl))).resourceId,
        accepted.id);
      assert.equal((await readThroughProvider(provider, moving.id)).url, movedUrl);
      assert.equal((await readThroughProvider(provider, currentUrlReservationId(movedUrl))).resourceId, moving.id);
    }
    assert.notDeepEqual([...provider.records.entries()], before,
      'the concurrent move is a real provider state change, not a test-side expected answer');
  });
}

test('a collision that coherently shrinks to one member is re-observed as a duplicate', async () => {
  const requestedUrl = 'https://example.invalid/phase3/collision-straddled';
  const movedUrl = 'https://example.invalid/phase3/collision-moved';
  const first = { id: 'resource-phase3-collision-a', url: requestedUrl, title: 'Primero', version: 2 };
  const second = { id: 'resource-phase3-collision-b', url: requestedUrl, title: 'Segundo', version: 2 };
  const collision = currentUrlCollision(requestedUrl, [first.id, second.id]);
  const provider = await createProvider([first, second, collision], {
    memberIds: new Set([second.id]),
    onMemberRead: ({ records }) => {
      records.set(second.id, { ...second, url: movedUrl });
      records.set(collision.id, currentUrlReservation(requestedUrl, first.id));
      records.set(currentUrlReservationId(movedUrl), currentUrlReservation(movedUrl, second.id));
    },
  });
  const result = await provider.handler(request({ url: requestedUrl }));

  assert.equal(result.statusCode, 409, JSON.stringify(responseBody(result)));
  assert.deepEqual(responseBody(result), { ok: false, code: 'duplicate' });
  assert.equal(provider.calls.transactions.length, 0);
  const successor = await readThroughProvider(provider, collision.id);
  assert.equal(successor.status, 'reserved');
  assert.equal(successor.resourceId, first.id);
  assert.equal((await readThroughProvider(provider, second.id)).url, movedUrl);
  assert.equal((await readThroughProvider(provider, currentUrlReservationId(movedUrl))).resourceId, second.id);
});

test('a definite conditional winner is re-read once and reused as duplicate', async () => {
  const winner = { id: 'resource-phase3-winner', url: BASE_SUBMISSION.url, title: 'Ganador', version: 1 };
  const provider = await createProvider([], {
    resourceIds: ['resource-phase3-loser'],
    transactionMode: 'conditional-then-winner',
    winner,
  });
  const result = await provider.handler(request());

  assert.equal(result.statusCode, 409);
  assert.deepEqual(responseBody(result), { ok: false, code: 'duplicate' });
  assert.equal(provider.calls.transactions.length, 1);
  assert.equal((await readThroughProvider(provider, winner.id)).url, BASE_SUBMISSION.url);
});

test('a resource and reservation created together between the two reads settle as a duplicate', async () => {
  const resource = { id: 'resource-phase3-concurrent', url: BASE_SUBMISSION.url, version: 1 };
  const reservation = currentUrlReservation(resource.url, resource.id);
  const provider = await createProvider([], {
    resourceIds: [resource.id, 'resource-phase3-fresh-id'],
    memberIds: new Set([reservation.id]),
    onMemberRead: ({ records }) => {
      records.set(resource.id, resource);
      records.set(reservation.id, reservation);
    },
  });
  const result = await provider.handler(request());

  assert.equal(result.statusCode, 409);
  assert.deepEqual(responseBody(result), { ok: false, code: 'duplicate' });
  assert.equal(provider.calls.transactions.length, 0);
  assert.equal(provider.records.size, 2);
  assert.deepEqual(await readThroughProvider(provider, resource.id), resource);
  assert.deepEqual(await readThroughProvider(provider, reservation.id), reservation);
});

test('persistent definite contention stops after the bounded writer attempts', async () => {
  const provider = await createProvider([], {
    transactionMode: 'conditional-always',
  });
  const result = await provider.handler(request());

  assert.equal(result.statusCode, 500);
  assert.deepEqual(responseBody(result), { ok: false, code: 'storage_error' });
  assert.equal(provider.calls.transactions.length, 2);
  assert.equal(provider.records.size, 0);
});

test('an unknown transaction cancellation with no reasons is not retried or classified as a duplicate', async () => {
  const provider = await createProvider([], {
    transactionMode: 'unknown-missing-reasons',
  });
  const result = await provider.handler(request());

  assert.equal(result.statusCode, 500);
  assert.deepEqual(responseBody(result), { ok: false, code: 'storage_error' });
  assert.equal(provider.calls.transactions.length, 1);
  assert.equal(provider.records.size, 0);
});

for (const [name, reasons] of [
  ['empty reasons', []],
  ['disjoint operational reason', [{ Code: 'ConditionalCheckFailed' }, { Code: 'ProvisionedThroughputExceeded' }]],
  ['opaque reason', [{ Code: 'UnknownProviderCode' }]],
]) {
  test(`a TransactionCanceledException with ${name} is not retried`, async () => {
    const provider = await createProvider([], { transactionMode: 'unknown-reasons', reasons });
    const result = await provider.handler(request());

    assert.equal(result.statusCode, 500);
    assert.deepEqual(responseBody(result), { ok: false, code: 'storage_error' });
    assert.equal(provider.calls.transactions.length, 1);
    assert.equal(provider.records.size, 0);
  });
}

test('a valid private UTF-8 ID is used byte-for-byte as the referenced physical key', async () => {
  const privateId = 'é'.repeat(128);
  const url = 'https://example.invalid/phase3/private-id';
  const reservation = currentUrlReservation(url, privateId);
  const provider = await createProvider([
    { key: reservation.id, item: reservation },
    { key: privateId, item: { id: privateId, url } },
  ]);
  const result = await provider.handler(request({ url }));

  assert.equal(Buffer.byteLength(privateId, 'utf8'), 256);
  assert.equal(result.statusCode, 409);
  const memberRead = provider.calls.get.find(({ Key }) => Key.id === privateId);
  assert.ok(memberRead, 'the exact UTF-8 member ID was used as the physical key');
  assert.equal(memberRead.Key.id, privateId);
});

test('an over-limit generated ID is rejected before any provider read or write', async () => {
  const overLimitId = `${'é'.repeat(128)}a`;
  const provider = await createProvider([], { resourceIds: [overLimitId] });
  const result = await provider.handler(request());

  assert.equal(Buffer.byteLength(overLimitId, 'utf8'), 257);
  assert.equal(result.statusCode, 500);
  assert.deepEqual(responseBody(result), { ok: false, code: 'storage_error' });
  assert.equal(provider.calls.get.length, 0);
  assert.equal(provider.calls.transactions.length, 0);
});

test('an opaque provider error is not replayed after the handler boundary', async () => {
  const provider = await createProvider([], { transactionMode: 'unknown-before-commit' });
  const result = await provider.handler(request());

  assert.equal(result.statusCode, 500);
  assert.deepEqual(responseBody(result), { ok: false, code: 'storage_error' });
  assert.equal(provider.calls.transactions.length, 1);
  assert.equal(provider.records.size, 0);
});

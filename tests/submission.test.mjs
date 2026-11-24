import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createSubmissionHandler,
  MAX_SUBMISSION_BODY_BYTES,
} from '../src/api/submission.mjs';
import { currentUrlReservation, currentUrlReservationId } from '../src/lib/catalog-url.mjs';

const BASE_SUBMISSION = Object.freeze({
  email: 'ana@example.invalid',
  full_name: 'Ana Contributor',
  title: 'Curso de AWS',
  url: 'https://example.invalid/curso?source=contributor&lang=es',
  text: 'Descripción pública del recurso.',
  Category: 'Otros',
  website: '',
});

function request(payload = {}, overrides = {}) {
  return {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...BASE_SUBMISSION, ...payload }),
    ...overrides,
  };
}

function responseBody(result) {
  return JSON.parse(result.body);
}

function handlerWithWriter(writer, options = {}) {
  const records = options.records ?? new Map();
  const writes = [];
  return createSubmissionHandler({
    tableName: 'donde-aprendo-aws-catalog',
    getItem: async ({ Key }) => ({ Item: records.get(Key.id) }),
    transactWrite: async (params) => {
      writes.push(params);
      await writer(params);
      const puts = params.TransactItems.map(({ Put }) => Put);
      if (puts.some(({ Item }) => records.has(Item.id))) {
        const error = new Error('transaction condition failed');
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }];
        throw error;
      }
      for (const { Item } of puts) records.set(Item.id, { ...Item });
    },
    now: () => '2026-09-23T12:34:56.000Z',
    resourceId: options.resourceId ?? (() => 'resource-submission-1'),
    ...options,
  });
}

test('writes a pending public record with private contact fields and returns 201 after the write', async () => {
  let write;
  const handler = handlerWithWriter(async (params) => {
    await Promise.resolve();
    write = params;
  });

  const result = await handler(request());

  assert.equal(result.statusCode, 201);
  assert.deepEqual(responseBody(result), {
    ok: true,
    code: 'created',
    id: 'resource-submission-1',
    submittedAt: '2026-09-23T12:34:56.000Z',
  });
  assert.equal(write.TransactItems.length, 2);
  const resourcePut = write.TransactItems[0].Put;
  const reservationPut = write.TransactItems[1].Put;
  assert.equal(resourcePut.TableName, 'donde-aprendo-aws-catalog');
  assert.equal(resourcePut.ConditionExpression, 'attribute_not_exists(#id)');
  assert.deepEqual(resourcePut.ExpressionAttributeNames, { '#id': 'id' });
  assert.deepEqual(resourcePut.Item, {
    id: 'resource-submission-1',
    title: BASE_SUBMISSION.title,
    url: BASE_SUBMISSION.url,
    description: BASE_SUBMISSION.text,
    category: BASE_SUBMISSION.Category,
    kind: 'content',
    format: 'Curso',
    topics: [],
    order: 0,
    featured: false,
    published: false,
    submittedAt: '2026-09-23T12:34:56.000Z',
    submitterName: BASE_SUBMISSION.full_name,
    submitterEmail: BASE_SUBMISSION.email,
    version: 1,
  });
  assert.equal(reservationPut.Item.id, currentUrlReservationId(BASE_SUBMISSION.url));
  assert.deepEqual(reservationPut.Item, currentUrlReservation(BASE_SUBMISSION.url, 'resource-submission-1'));
  assert.equal(Object.hasOwn(resourcePut.Item, 'website'), false);
  assert.equal(Object.hasOwn(resourcePut.Item, 'email'), false);
  assert.equal(result.body.includes(BASE_SUBMISSION.email), false);
  assert.equal(result.body.includes(BASE_SUBMISSION.full_name), false);
  assert.equal(result.body.includes(BASE_SUBMISSION.url), false);
});

test('attributes a concrete URL rejection without writing or exposing submitted values', async () => {
  let writes = 0;
  const handler = handlerWithWriter(async () => { writes += 1; });

  const result = await handler(request({ url: 'javascript:alert(1)' }));

  assert.equal(result.statusCode, 400);
  assert.deepEqual(responseBody(result), {
    ok: false,
    code: 'invalid_request',
    fieldErrors: [{ field: 'url', reason: 'invalid_url' }],
  });
  assert.equal(writes, 0);
  assert.equal(result.body.includes('javascript:alert(1)'), false);
  assert.equal(result.body.includes(BASE_SUBMISSION.email), false);
});

test('attributes missing required fields while retaining the existing rejection code', async (t) => {
  for (const [field, value] of [['email', ''], ['title', '   ']]) {
    await t.test(field, async () => {
      let writes = 0;
      const handler = handlerWithWriter(async () => { writes += 1; });

      const result = await handler(request({ [field]: value }));

      assert.equal(result.statusCode, 400);
      assert.deepEqual(responseBody(result), {
        ok: false,
        code: 'invalid_request',
        fieldErrors: [{ field, reason: 'required' }],
      });
      assert.equal(writes, 0);
    });
  }
});

test('attributes a structurally invalid email without writing or echoing it', async () => {
  let writes = 0;
  const handler = handlerWithWriter(async () => { writes += 1; });

  const result = await handler(request({ email: 'a..b@example.invalid' }));

  assert.equal(result.statusCode, 400);
  assert.deepEqual(responseBody(result), {
    ok: false,
    code: 'invalid_request',
    fieldErrors: [{ field: 'email', reason: 'invalid_email' }],
  });
  assert.equal(writes, 0);
  assert.equal(result.body.includes('a..b@example.invalid'), false);
});

test('attributes a control character in visible text without writing or echoing it', async () => {
  let writes = 0;
  const handler = handlerWithWriter(async () => { writes += 1; });
  const submittedText = 'Descripción con control\u000bprivado';

  const result = await handler(request({ text: submittedText }));

  assert.equal(result.statusCode, 400);
  assert.deepEqual(responseBody(result), {
    ok: false,
    code: 'invalid_request',
    fieldErrors: [{ field: 'text', reason: 'invalid_value' }],
  });
  assert.equal(writes, 0);
  assert.equal(result.body.includes('Descripción con control'), false);
  assert.equal(result.body.includes('privado'), false);
});

test('keeps malformed whole requests generic rather than guessing a field', async (t) => {
  const cases = [
    ['malformed JSON', { headers: { 'content-type': 'application/json' }, body: '{not-json' }],
    ['wrong title shape', request({ title: { value: 'not a title' } })],
    ['unknown nested field', request({ metadata: { title: 'not an accepted field' } })],
  ];

  for (const [label, event] of cases) {
    await t.test(label, async () => {
      let writes = 0;
      const handler = handlerWithWriter(async () => { writes += 1; });
      const result = await handler(event);

      assert.equal(result.statusCode, 400);
      assert.deepEqual(responseBody(result), { ok: false, code: 'invalid_request' });
      assert.equal(writes, 0);
    });
  }
});

test('rejects a generated submission ID over 256 UTF-8 bytes before catalog access', async () => {
  let reads = 0;
  let writes = 0;
  const handler = createSubmissionHandler({
    tableName: 'donde-aprendo-aws-catalog',
    getItem: async () => { reads += 1; return {}; },
    transactWrite: async () => { writes += 1; },
    resourceId: () => `${'é'.repeat(128)}a`,
  });
  assert.equal(Buffer.byteLength(`${'é'.repeat(128)}a`, 'utf8'), 257);

  const result = await handler(request());
  assert.equal(result.statusCode, 500);
  assert.deepEqual(responseBody(result), { ok: false, code: 'storage_error' });
  assert.deepEqual([reads, writes], [0, 0]);
});

test('accepts the new kind, format, and topic fields as a pending submission', async () => {
  let resource;
  const handler = handlerWithWriter(async (params) => { resource = params.TransactItems[0].Put.Item; });
  const { Category, ...base } = BASE_SUBMISSION;
  const result = await handler({
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...base, kind: 'content', format: 'Video', topics: ['Seguridad', 'Fundamentos'] }),
  });
  assert.equal(result.statusCode, 201);
  assert.equal(resource.published, false);
  assert.equal(resource.category, 'Seguridad');
  assert.deepEqual(resource.topics, ['Seguridad', 'Fundamentos']);
});

test('rejects invalid new taxonomy before writing', async (t) => {
  const { Category, ...base } = BASE_SUBMISSION;
  for (const { label, taxonomy, fieldErrors } of [
    {
      label: 'kind and format do not match',
      taxonomy: { kind: 'source', format: 'Video', topics: [] },
      fieldErrors: [{ field: 'kind-format', reason: 'invalid_combination' }],
    },
    {
      label: 'kind and format are required when classification is started',
      taxonomy: { kind: '', format: '', topics: [] },
      fieldErrors: [{ field: 'kind-format', reason: 'required' }],
    },
    {
      label: 'duplicate topics',
      taxonomy: { kind: 'content', format: 'Video', topics: ['Seguridad', 'Seguridad'] },
      fieldErrors: [{ field: 'topics', reason: 'invalid_option' }],
    },
    {
      label: 'unknown topic',
      taxonomy: { kind: 'content', format: 'Video', topics: ['Unlisted'] },
      fieldErrors: [{ field: 'topics', reason: 'invalid_option' }],
    },
  ]) {
    await t.test(label, async () => {
      const handler = handlerWithWriter(async () => assert.fail('invalid taxonomy must not reach the transaction'));
      const result = await handler({
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...base, ...taxonomy }),
      });
      assert.equal(result.statusCode, 400);
      assert.deepEqual(responseBody(result), { ok: false, code: 'invalid_request', fieldErrors });
    });
  }
});

test('returns 409 for a literal URL duplicate without exposing submitted values', async () => {
  const records = new Map([
    ['resource-existing', { id: 'resource-existing', url: BASE_SUBMISSION.url }],
    [currentUrlReservationId(BASE_SUBMISSION.url), currentUrlReservation(BASE_SUBMISSION.url, 'resource-existing')],
  ]);
  const handler = handlerWithWriter(async () => assert.fail('duplicate URL must be detected before the transaction'), { records });

  const result = await handler(request());

  assert.equal(result.statusCode, 409);
  assert.deepEqual(responseBody(result), { ok: false, code: 'duplicate' });
  assert.equal(result.body.includes(BASE_SUBMISSION.email), false);
  assert.equal(result.body.includes(BASE_SUBMISSION.full_name), false);
  assert.equal(Object.hasOwn(responseBody(result), 'id'), false);
  assert.equal(Object.hasOwn(responseBody(result), 'submittedAt'), false);
});

test('returns 500 for storage failures without returning the error or private fields', async () => {
  const handler = handlerWithWriter(async () => {
    throw new Error(`private storage detail ${BASE_SUBMISSION.email}`);
  });

  const result = await handler(request());

  assert.equal(result.statusCode, 500);
  assert.deepEqual(responseBody(result), { ok: false, code: 'storage_error' });
  assert.equal(result.body.includes(BASE_SUBMISSION.email), false);
  assert.equal(result.body.includes('private storage detail'), false);
});

test('rejects a published override and does not write', async () => {
  let writes = 0;
  const handler = handlerWithWriter(async () => { writes += 1; });

  const result = await handler(request({ published: true }));

  assert.equal(result.statusCode, 400);
  assert.deepEqual(responseBody(result), { ok: false, code: 'invalid_request' });
  assert.equal(writes, 0);
});

test('rejects a filled honeypot and does not write', async () => {
  let writes = 0;
  const handler = handlerWithWriter(async () => { writes += 1; });

  const result = await handler(request({ website: 'https://bot.invalid' }));

  assert.equal(result.statusCode, 400);
  assert.deepEqual(responseBody(result), { ok: false, code: 'invalid_request' });
  assert.equal(writes, 0);
});

test('rejects malformed JSON, unsupported content type, and oversized bodies', async () => {
  let writes = 0;
  const handler = handlerWithWriter(async () => { writes += 1; });

  const malformed = await handler({
    headers: { 'content-type': 'application/json' },
    body: '{not-json',
  });
  assert.equal(malformed.statusCode, 400);
  assert.deepEqual(responseBody(malformed), { ok: false, code: 'invalid_request' });

  const unsupported = await handler({
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify(BASE_SUBMISSION),
  });
  assert.equal(unsupported.statusCode, 415);
  assert.deepEqual(responseBody(unsupported), { ok: false, code: 'unsupported_media_type' });

  const oversized = await handler(request({ text: 'x'.repeat(MAX_SUBMISSION_BODY_BYTES) }));
  assert.equal(oversized.statusCode, 413);
  assert.deepEqual(responseBody(oversized), { ok: false, code: 'too_large' });
  assert.equal(writes, 0);
});

test('rejects missing, malformed, and out-of-contract fields before storage', async () => {
  let writes = 0;
  const handler = handlerWithWriter(async () => { writes += 1; });
  const invalidRequests = [
    request({ email: 'not-an-email' }),
    request({ Category: 'Not a category' }),
    request({ full_name: '   ' }),
    request({ submitterEmail: 'private@example.invalid' }),
  ];

  for (const invalidRequest of invalidRequests) {
    const result = await handler(invalidRequest);
    assert.equal(result.statusCode, 400);
  }
  assert.equal(writes, 0);
});

test('rejects an overlong field even when the request stays under the body limit', async () => {
  let writes = 0;
  const handler = handlerWithWriter(async () => { writes += 1; });
  const oversizedTitleRequest = request({ title: 'x'.repeat(241) });

  assert.ok(Buffer.byteLength(oversizedTitleRequest.body, 'utf8') < MAX_SUBMISSION_BODY_BYTES);
  const result = await handler(oversizedTitleRequest);

  assert.equal(result.statusCode, 400);
  assert.deepEqual(responseBody(result), {
    ok: false,
    code: 'invalid_request',
    fieldErrors: [{ field: 'title', reason: 'too_long' }],
  });
  assert.equal(writes, 0);
});

test('accepts the API Gateway base64 body form and still stores only pending data', async () => {
  let resource;
  const handler = handlerWithWriter(async (params) => { resource = params.TransactItems[0].Put.Item; });
  const body = Buffer.from(JSON.stringify(BASE_SUBMISSION), 'utf8').toString('base64');

  const result = await handler({
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
    isBase64Encoded: true,
  });

  assert.equal(result.statusCode, 201);
  assert.equal(resource.published, false);
  assert.equal(resource.url, BASE_SUBMISSION.url);
});

test('returns a storage error when the deployed table is not configured', async () => {
  const handler = createSubmissionHandler({
    putItem: async () => { throw new Error('writer must not be called'); },
    now: () => '2026-09-23T12:34:56.000Z',
  });

  const result = await handler(request());

  assert.equal(result.statusCode, 500);
  assert.deepEqual(responseBody(result), { ok: false, code: 'storage_error' });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createSubmissionHandler,
  MAX_SUBMISSION_BODY_BYTES,
} from '../src/api/submission.mjs';

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
  return createSubmissionHandler({
    tableName: 'donde-aprendo-aws-catalog',
    putItem: writer,
    now: () => '2026-09-23T12:34:56.000Z',
    ...options,
  });
}

test('writes a pending public record with private contact fields and returns 201 after the write', async () => {
  const writes = [];
  const handler = handlerWithWriter(async (params) => {
    await Promise.resolve();
    writes.push(params);
  });

  const result = await handler(request());

  assert.equal(result.statusCode, 201);
  assert.deepEqual(responseBody(result), { ok: true, code: 'created' });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].TableName, 'donde-aprendo-aws-catalog');
  assert.equal(writes[0].ConditionExpression, 'attribute_not_exists(#id)');
  assert.deepEqual(writes[0].ExpressionAttributeNames, { '#id': 'id' });
  assert.deepEqual(writes[0].Item, {
    id: 'catalog-0ffc336102cd336f1b209b3f2a90ece0',
    title: BASE_SUBMISSION.title,
    url: BASE_SUBMISSION.url,
    description: BASE_SUBMISSION.text,
    category: BASE_SUBMISSION.Category,
    order: 0,
    featured: false,
    published: false,
    submittedAt: '2026-09-23T12:34:56.000Z',
    submitterName: BASE_SUBMISSION.full_name,
    submitterEmail: BASE_SUBMISSION.email,
  });
  assert.equal(Object.hasOwn(writes[0].Item, 'website'), false);
  assert.equal(Object.hasOwn(writes[0].Item, 'email'), false);
  assert.equal(result.body.includes(BASE_SUBMISSION.email), false);
});

test('returns 409 for a conditional duplicate without exposing submitted values', async () => {
  const handler = handlerWithWriter(async () => {
    const error = new Error('DynamoDB detail must stay private');
    error.name = 'ConditionalCheckFailedException';
    throw error;
  });

  const result = await handler(request());

  assert.equal(result.statusCode, 409);
  assert.deepEqual(responseBody(result), { ok: false, code: 'duplicate' });
  assert.equal(result.body.includes(BASE_SUBMISSION.email), false);
  assert.equal(result.body.includes(BASE_SUBMISSION.full_name), false);
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

  const unsupported = await handler({
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify(BASE_SUBMISSION),
  });
  assert.equal(unsupported.statusCode, 415);

  const oversized = await handler(request({ text: 'x'.repeat(MAX_SUBMISSION_BODY_BYTES) }));
  assert.equal(oversized.statusCode, 413);
  assert.equal(writes, 0);
});

test('rejects missing, malformed, and out-of-contract fields before storage', async () => {
  let writes = 0;
  const handler = handlerWithWriter(async () => { writes += 1; });
  const invalidRequests = [
    request({ email: '' }),
    request({ email: 'not-an-email' }),
    request({ url: 'javascript:alert(1)' }),
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
  assert.deepEqual(responseBody(result), { ok: false, code: 'invalid_request' });
  assert.equal(writes, 0);
});

test('accepts the API Gateway base64 body form and still stores only pending data', async () => {
  const writes = [];
  const handler = handlerWithWriter(async (params) => { writes.push(params); });
  const body = Buffer.from(JSON.stringify(BASE_SUBMISSION), 'utf8').toString('base64');

  const result = await handler({
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
    isBase64Encoded: true,
  });

  assert.equal(result.statusCode, 201);
  assert.equal(writes[0].Item.published, false);
  assert.equal(writes[0].Item.url, BASE_SUBMISSION.url);
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

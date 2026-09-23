#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let receivedPut = false;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.headers['x-amz-target'], 'DynamoDB_20120810.PutItem');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    assert.equal(body.TableName, 'smoke-catalog');
    assert.deepEqual(body.Item.published, { BOOL: false });
    assert.deepEqual(body.Item.submitterEmail, { S: 'tester@example.invalid' });
    receivedPut = true;
    response.writeHead(400, { 'content-type': 'application/x-amz-json-1.0' });
    response.end(JSON.stringify({
      __type: 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException',
      message: 'Existing URL',
    }));
  } catch (error) {
    response.writeHead(500, { 'content-type': 'text/plain' });
    response.end(error.message);
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const address = server.address();
  process.env.AWS_ACCESS_KEY_ID = 'smoke';
  process.env.AWS_SECRET_ACCESS_KEY = 'smoke';
  process.env.AWS_SESSION_TOKEN = '';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ENDPOINT_URL_DYNAMODB = `http://127.0.0.1:${address.port}`;
  process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'false';
  process.env.CATALOG_TABLE = 'smoke-catalog';

  const bundle = pathToFileURL(join(process.cwd(), 'build/submission/index.mjs')).href;
  const { handler } = await import(bundle);
  const result = await handler({
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'tester@example.invalid',
      full_name: 'Smoke Tester',
      title: 'Prueba de paquete',
      url: 'https://example.invalid/smoke',
      text: 'Recurso de prueba',
      Category: 'Blog',
      website: '',
    }),
  });

  assert.equal(receivedPut, true, 'Bundled handler never reached DynamoDB');
  assert.equal(result.statusCode, 409);
  assert.deepEqual(JSON.parse(result.body), { ok: false, code: 'duplicate' });
  const metadata = JSON.parse(await readFile('build/submission.json', 'utf8'));
  console.log(JSON.stringify({ packagedHandler: true, putReachedMock: true, statusCode: result.statusCode, artifactSha256: metadata.sha256 }));
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

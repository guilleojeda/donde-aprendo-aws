#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let itemReads = 0;
let receivedTransaction = false;
let resourceId;
const server = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const target = request.headers['x-amz-target'];
    if (target === 'DynamoDB_20120810.GetItem') {
      assert.equal(body.TableName, 'smoke-catalog');
      if (itemReads === 0) {
        assert.match(body.Key.id.S, /^resource-/u);
        resourceId = body.Key.id.S;
      } else {
        assert.equal(body.Key.id.S, `__url#${createHash('sha256').update('https://example.invalid/smoke').digest('hex')}`);
      }
      itemReads += 1;
      response.writeHead(200, { 'content-type': 'application/x-amz-json-1.0' });
      response.end('{}');
      return;
    }
    assert.equal(target, 'DynamoDB_20120810.TransactWriteItems');
    assert.equal(body.TransactItems.length, 2);
    const [resourcePut, reservationPut] = body.TransactItems.map(({ Put }) => Put);
    assert.equal(resourcePut.Item.id.S, resourceId, 'the checked resource ID is the one committed');
    assert.equal(resourcePut.TableName, 'smoke-catalog');
    assert.equal(reservationPut.TableName, 'smoke-catalog');
    assert.deepEqual(resourcePut.Item.published, { BOOL: false });
    assert.deepEqual(resourcePut.Item.submitterEmail, { S: 'tester@example.invalid' });
    assert.deepEqual(resourcePut.Item.version, { N: '1' });
    assert.deepEqual(reservationPut.Item.id, {
      S: `__url#${createHash('sha256').update('https://example.invalid/smoke').digest('hex')}`,
    });
    assert.deepEqual(reservationPut.Item.resourceId, resourcePut.Item.id);
    assert.deepEqual(reservationPut.Item.status, { S: 'reserved' });
    receivedTransaction = true;
    response.writeHead(200, { 'content-type': 'application/x-amz-json-1.0' });
    response.end('{}');
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

  assert.equal(itemReads, 2, 'Bundled handler did not read both deterministic keys');
  assert.equal(receivedTransaction, true, 'Bundled handler never reached DynamoDB transaction');
  assert.equal(result.statusCode, 201);
  assert.equal(JSON.parse(result.body).ok, true);
  const metadata = JSON.parse(await readFile('build/submission.json', 'utf8'));
  console.log(JSON.stringify({ packagedHandler: true, transactionReachedMock: true, statusCode: result.statusCode, artifactSha256: metadata.sha256 }));
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

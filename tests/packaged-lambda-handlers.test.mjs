import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { startPublicationCloud } from './fixtures/publication-cloud.mjs';
import { readLambdaTemplateHandler } from './fixtures/lambda-template-handler.mjs';

const run = promisify(execFile);
const repositoryRoot = new URL('../', import.meta.url).pathname;
const packageEnvKeys = [
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_REGION',
  'AWS_ENDPOINT_URL_DYNAMODB', 'AWS_ENDPOINT_URL_AMPLIFY', 'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
  'AWS_MAX_ATTEMPTS', 'CATALOG_TABLE', 'ACCOUNTS_TABLE', 'CREATOR_PROFILES_TABLE',
  'AMPLIFY_APP_ID', 'AMPLIFY_BRANCH', 'PUBLICATION_MANIFEST_URL',
];

test('submission Lambda archive persists an atomic pair and leaves a lost receipt unconfirmed', async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'submission-archive-'));
  const records = new Map();
  const requests = [];
  let transactionCount = 0;
  let loseReceipt = false;
  let lostAttempt;
  const server = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const target = request.headers['x-amz-target'];
      requests.push({ target, body });
      if (target === 'DynamoDB_20120810.GetItem') {
        const key = body.Key.id.S;
        sendDynamo(response, { ...(records.has(key) ? { Item: records.get(key) } : {}) });
        return;
      }
      assert.equal(target, 'DynamoDB_20120810.TransactWriteItems');
      assert.equal(body.TransactItems.length, 2);
      const [resourceAction, reservationAction] = body.TransactItems;
      assert.ok(resourceAction.Put);
      assert.ok(reservationAction.Put);
      const resourcePut = resourceAction.Put;
      const reservationPut = reservationAction.Put;
      assert.equal(resourcePut.TableName, 'archive-submissions');
      assert.equal(reservationPut.TableName, 'archive-submissions');
      assert.equal(resourcePut.Item.published.BOOL, false);
      assert.equal(resourcePut.Item.submitterEmail.S, 'tester@example.invalid');
      assert.equal(resourcePut.Item.title.S, 'Paquete de prueba');
      assert.equal(resourcePut.Item.version.N, '1');
      assert.equal(reservationPut.Item.resourceId.S, resourcePut.Item.id.S);
      assert.equal(reservationPut.Item.status.S, 'reserved');
      assert.equal(resourcePut.ConditionExpression, 'attribute_not_exists(#id)');
      assert.equal(reservationPut.ConditionExpression, 'attribute_not_exists(#id)');
      transactionCount += 1;
      if (records.has(resourcePut.Item.id.S) || records.has(reservationPut.Item.id.S)) {
        sendDynamo(response, { CancellationReasons: [{ Code: 'ConditionalCheckFailed' }] }, 400, 'TransactionCanceledException');
        return;
      }
      records.set(resourcePut.Item.id.S, resourcePut.Item);
      records.set(reservationPut.Item.id.S, reservationPut.Item);
      if (loseReceipt) {
        lostAttempt = { resourceId: resourcePut.Item.id.S, reservationId: reservationPut.Item.id.S };
        response.destroy();
        return;
      }
      sendDynamo(response, {});
    } catch (error) {
      sendDynamo(response, { message: error.message }, 500, 'InternalServerError');
    }
  });

  const previousEnv = snapshotEnv(packageEnvKeys);
  let extractedDirectory;
  let verifier;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    process.env.AWS_ACCESS_KEY_ID = 'archive-test';
    process.env.AWS_SECRET_ACCESS_KEY = 'archive-test';
    process.env.AWS_SESSION_TOKEN = '';
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
    process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'false';
    process.env.AWS_MAX_ATTEMPTS = '2';
    process.env.CATALOG_TABLE = 'archive-submissions';

    await run(process.execPath, ['scripts/package-submission.mjs'], { cwd: repositoryRoot });
    const archivePath = join(repositoryRoot, 'build/submission.zip');
    const declaration = await readLambdaTemplateHandler('submissions', 'SubmissionFunction');
    assert.equal(declaration.runtime, 'nodejs24.x');
    const { stdout: listing } = await run('unzip', ['-Z1', archivePath]);
    assert.deepEqual(listing.trim().split('\n'), [`${declaration.module}.mjs`]);
    extractedDirectory = join(temporaryDirectory, 'extracted');
    await run('unzip', ['-q', archivePath, '-d', extractedDirectory]);

    const shippedModule = await import(pathToFileURL(join(extractedDirectory, `${declaration.module}.mjs`)).href);
    const event = {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'tester@example.invalid',
        full_name: 'Archive Tester',
        title: 'Paquete de prueba',
        url: 'https://example.invalid/archive-submission',
        text: 'Registro escrito por el handler extraído.',
        Category: 'Blog',
        website: '',
      }),
    };
    const result = await shippedModule[declaration.exportName](event);

    assert.equal(result.statusCode, 201);
    assert.equal(JSON.parse(result.body).ok, true);
    assert.equal(transactionCount, 1);
    assert.equal(requests.filter(({ target }) => target === 'DynamoDB_20120810.GetItem').length, 2);

    const accepted = JSON.parse(result.body);
    verifier = new DynamoDBClient({ region: 'us-east-1', endpoint });
    const resourceResponse = await verifier.send(new GetItemCommand({
      TableName: 'archive-submissions',
      Key: { id: { S: accepted.id } },
      ConsistentRead: true,
    }));
    const resource = unmarshall(resourceResponse.Item);
    const reservationId = `__url#${createHash('sha256')
      .update('https://example.invalid/archive-submission').digest('hex')}`;
    const reservationResponse = await verifier.send(new GetItemCommand({
      TableName: 'archive-submissions',
      Key: { id: { S: reservationId } },
      ConsistentRead: true,
    }));
    const reservation = unmarshall(reservationResponse.Item);
    assert.equal(resource.published, false);
    assert.equal(resource.submitterEmail, 'tester@example.invalid');
    assert.equal(resource.url, 'https://example.invalid/archive-submission');
    assert.equal(reservation.resourceId, resource.id);
    assert.equal(reservation.status, 'reserved');

    loseReceipt = true;
    const lostUrl = 'https://example.invalid/archive-submission-lost-receipt';
    const beforeLoss = transactionCount;
    const uncertain = await shippedModule[declaration.exportName]({
      ...event, body: JSON.stringify({ ...JSON.parse(event.body), url: lostUrl }),
    });
    assert.ok(lostAttempt, 'the provider committed both records before losing the receipt');
    const [savedResource, savedReservation] = await Promise.all(
      [lostAttempt.resourceId, lostAttempt.reservationId].map((id) => verifier.send(new GetItemCommand({
        TableName: 'archive-submissions', Key: { id: { S: id } }, ConsistentRead: true,
      }))),
    );
    assert.equal(unmarshall(savedResource.Item).url, lostUrl);
    assert.equal(unmarshall(savedResource.Item).published, false);
    assert.equal(unmarshall(savedReservation.Item).resourceId, lostAttempt.resourceId);
    assert.equal(unmarshall(savedReservation.Item).url, lostUrl);
    assert.deepEqual({ status: uncertain.statusCode, body: JSON.parse(uncertain.body), transactions: transactionCount - beforeLoss }, {
      status: 500, body: { ok: false, code: 'storage_error' }, transactions: 1,
    });
  } finally {
    verifier?.destroy();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    restoreEnv(previousEnv);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('publication Lambda archive handler clears a missing pending job and starts a replacement publication', async () => {
  const cloud = await startPublicationCloud({ state: { pendingJobId: '17' } });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'publication-archive-'));
  const previousEnv = snapshotEnv(packageEnvKeys);
  const previousFetch = globalThis.fetch;
  try {
    process.env.AWS_ACCESS_KEY_ID = 'archive-test';
    process.env.AWS_SECRET_ACCESS_KEY = 'archive-test';
    process.env.AWS_SESSION_TOKEN = '';
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_ENDPOINT_URL_DYNAMODB = cloud.endpoint;
    process.env.AWS_ENDPOINT_URL_AMPLIFY = cloud.endpoint;
    process.env.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS = 'false';
    process.env.AWS_MAX_ATTEMPTS = '1';
    process.env.CATALOG_TABLE = 'publication-recovery-test';
    delete process.env.CREATOR_PROFILES_TABLE;
    process.env.AMPLIFY_APP_ID = 'darchive123';
    process.env.AMPLIFY_BRANCH = 'main';
    process.env.PUBLICATION_MANIFEST_URL = 'https://dondeaprendoaws.com/catalog-publication.json';

    const manifestReads = [];
    globalThis.fetch = async (url, options) => {
      manifestReads.push({ url: String(url), options });
      return new Response(JSON.stringify({ version: 1, hash: 'f'.repeat(64) }), {
        status: 200,
        headers: {
          'cache-control': 'public, no-store',
          'content-type': 'application/json',
        },
      });
    };

    await run(process.execPath, ['scripts/package-publication.mjs'], { cwd: repositoryRoot });
    const archivePath = join(repositoryRoot, 'build/publication.zip');
    const declaration = await readLambdaTemplateHandler('publication', 'PublicationFunction');
    assert.equal(declaration.runtime, 'nodejs24.x');
    const { stdout: listing } = await run('unzip', ['-Z1', archivePath]);
    assert.deepEqual(listing.trim().split('\n'), [`${declaration.module}.mjs`]);
    const extractedDirectory = join(temporaryDirectory, 'extracted');
    await run('unzip', ['-q', archivePath, '-d', extractedDirectory]);
    const shippedModule = await import(pathToFileURL(join(extractedDirectory, `${declaration.module}.mjs`)).href);
    const result = await shippedModule[declaration.exportName]();

    assert.equal(result.action, 'started');
    assert.equal(result.jobId, '900');
    assert.equal(typeof result.hash, 'string');
    assert.match(result.hash, /^[a-f0-9]{64}$/u);
    assert.deepEqual(manifestReads.map(({ url }) => url), [
      'https://dondeaprendoaws.com/catalog-publication.json',
    ]);
    assert.equal(manifestReads[0].options.redirect, 'error');
    assert.equal(manifestReads[0].options.cache, 'no-store');

    const state = cloud.getState();
    assert.equal(state.pendingJobId, '900', 'a new job replaces the retired missing job');
    assert.equal(Object.hasOwn(state, 'lockToken'), false, 'the extracted handler releases its publication lock');
    assert.equal(Object.hasOwn(state, 'lockUntil'), false, 'the extracted handler removes the lock expiry');
    assert.deepEqual(cloud.calls.filter(({ service }) => service === 'amplify')
      .map(({ method }) => method), ['GET', 'GET', 'POST']);
    assert.equal(cloud.calls.find(({ service, method }) => service === 'amplify' && method === 'GET').pathname,
      '/apps/darchive123/branches/main/jobs/17');
    const startCall = cloud.calls.find(({ service, method }) => service === 'amplify' && method === 'POST');
    assert.equal(startCall.pathname, '/apps/darchive123/branches/main/jobs');
    assert.equal(startCall.input.jobType, 'RELEASE');
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv(previousEnv);
    await cloud.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

function sendDynamo(response, body, status = 200, errorType) {
  response.writeHead(status, {
    'content-type': 'application/x-amz-json-1.0',
    ...(errorType ? { 'x-amzn-errortype': errorType } : {}),
  });
  response.end(JSON.stringify(body));
}

function snapshotEnv(keys) {
  return new Map(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(values) {
  for (const [key, value] of values) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

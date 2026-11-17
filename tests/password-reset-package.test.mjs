import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { readLambdaTemplateHandler } from './fixtures/lambda-template-handler.mjs';

const run = promisify(execFile);
const repositoryRoot = new URL('../', import.meta.url).pathname;

test('password-reset Lambda archive is reproducible, content addressed, and its handler persists the auth boundary', async () => {
  const packageOnce = async () => {
    const { stdout } = await run(process.execPath, ['scripts/package-password-reset.mjs'], {
      cwd: repositoryRoot,
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  };

  const first = await packageOnce();
  const firstZip = await readFile(join(repositoryRoot, first.path));
  const second = await packageOnce();
  const secondZip = await readFile(join(repositoryRoot, second.path));

  assert.deepEqual(second, first);
  assert.deepEqual(secondZip, firstZip);
  assert.equal(first.path, 'build/password-reset.zip');
  assert.equal(first.sha256, createHash('sha256').update(firstZip).digest('hex'));
  assert.equal(first.bytes, firstZip.length);
  assert.equal(first.s3Key, `password-reset/${first.sha256}.zip`);

  const declaration = await readLambdaTemplateHandler('accounts', 'PasswordResetFunction');
  assert.equal(declaration.runtime, 'nodejs24.x');
  const { stdout: archiveFiles } = await run('unzip', ['-Z1', join(repositoryRoot, first.path)]);
  assert.deepEqual(archiveFiles.trim().split('\n'), [`${declaration.module}.mjs`]);

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'password-reset-archive-'));
  const table = new Map();
  const updates = [];
  const server = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const target = request.headers['x-amz-target'];
      if (target === 'DynamoDB_20120810.UpdateItem') {
        assert.equal(body.TableName, 'archive-accounts');
        assert.equal(body.ExpressionAttributeNames['#authValidAfter'], 'authValidAfter');
        assert.match(body.UpdateExpression, /#authValidAfter\s*=\s*:atMs/u);
        const atMs = Number(body.ExpressionAttributeValues[':atMs'].N);
        assert.ok(Number.isSafeInteger(atMs) && atMs > 0);
        const key = body.Key.pk.S;
        const previous = table.get(key) ?? {};
        const epoch = Number(previous.epoch?.N ?? body.ExpressionAttributeValues[':zero'].N)
          + Number(body.ExpressionAttributeValues[':one'].N);
        table.set(key, {
          pk: body.Key.pk,
          identity: body.ExpressionAttributeValues[':identity'],
          active: previous.active ?? body.ExpressionAttributeValues[':active'],
          epoch: { N: String(epoch) },
          authValidAfter: { N: String(atMs) },
        });
        updates.push(body);
        sendDynamo(response, {});
        return;
      }
      assert.equal(target, 'DynamoDB_20120810.GetItem');
      assert.equal(body.TableName, 'archive-accounts');
      sendDynamo(response, { ...(table.has(body.Key.pk.S) ? { Item: table.get(body.Key.pk.S) } : {}) });
    } catch (error) {
      sendDynamo(response, { message: error.message }, 500, 'InternalServerError');
    }
  });

  const envKeys = [
    'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_REGION',
    'AWS_ENDPOINT_URL_DYNAMODB', 'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS', 'ACCOUNTS_TABLE',
  ];
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
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
    process.env.ACCOUNTS_TABLE = 'archive-accounts';

    const extractedDirectory = join(temporaryDirectory, 'extracted');
    await run('unzip', ['-q', join(repositoryRoot, first.path), '-d', extractedDirectory]);
    const shippedModule = await import(pathToFileURL(
      join(extractedDirectory, `${declaration.module}.mjs`),
    ).href);
    const event = {
      triggerSource: 'PostConfirmation_ConfirmForgotPassword',
      region: 'us-east-1',
      userPoolId: 'us-east-1_TESTPOOL',
      request: { userAttributes: { sub: 'archive-user-subject' } },
    };
    assert.deepEqual(await shippedModule[declaration.exportName](event), event);
    assert.equal(updates.length, 1);

    const identity = {
      issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TESTPOOL',
      sub: 'archive-user-subject',
    };
    const key = `ACCOUNT#${createHash('sha256').update(JSON.stringify([identity.issuer, identity.sub])).digest('base64url')}`;
    verifier = new DynamoDBClient({ region: 'us-east-1', endpoint });
    const persisted = await verifier.send(new GetItemCommand({
      TableName: 'archive-accounts',
      Key: { pk: { S: key } },
      ConsistentRead: true,
    }));
    const account = unmarshall(persisted.Item);
    assert.deepEqual(account.identity, identity);
    assert.equal(account.active, true);
    assert.equal(account.epoch, 1);
    assert.equal(account.authValidAfter, Number(updates[0].ExpressionAttributeValues[':atMs'].N));
  } finally {
    verifier?.destroy();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
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

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { marshall } from '@aws-sdk/util-dynamodb';

/** A Scan-only DynamoDB wire fixture; projection happens before SDK decoding. */
export async function startHostingReleaseDynamo({ catalog, runtimeEnvironment }) {
  const { CATALOG_TABLE: catalogTable, CREATOR_PROFILES_TABLE: profilesTable } = runtimeEnvironment;
  assert.ok(catalogTable && profilesTable && catalogTable !== profilesTable, 'Fixture tables must be explicit and distinct.');
  const items = Array.isArray(catalog) ? catalog : catalog.items;
  assert.ok(Array.isArray(items), 'The catalog fixture supplies rows.');
  const creators = (catalog.creators ?? []).map((creator) => ({
    ...creator, pk: `PROFILE#${creator.id}`, sk: 'META', recordType: 'creatorState',
  }));
  const scans = [];
  const failures = [];
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, 'POST', 'The SDK uses the DynamoDB HTTP protocol.');
      assert.equal(request.headers['x-amz-target'], 'DynamoDB_20120810.Scan', 'Only build-time Scan is allowed.');
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.ok([catalogTable, profilesTable].includes(input.TableName), 'A scan must address an expected fixture table.');
      assert.equal(input.Select, 'SPECIFIC_ATTRIBUTES', 'The real reader must request projected attributes.');
      assert.equal(input.ConsistentRead, true, 'The real reader retains consistent scans.');
      assert.ok(input.ProjectionExpression?.trim(), 'The real reader must supply its projection.');
      const fields = input.ProjectionExpression.split(',').map((token) => {
        const field = token.trim();
        if (!field.startsWith('#')) return field;
        assert.ok(input.ExpressionAttributeNames?.[field], 'Every projection alias resolves.');
        return input.ExpressionAttributeNames[field];
      });
      const rows = input.TableName === catalogTable ? items : creators;
      const projected = rows.map((row) => Object.fromEntries(fields
        .filter((field) => Object.hasOwn(row, field)).map((field) => [field, row[field]])));
      scans.push({ tableName: input.TableName, fields });
      response.setHeader('content-type', 'application/x-amz-json-1.0');
      response.end(JSON.stringify({ Items: projected.map((row) => marshall(row)), Count: projected.length, ScannedCount: rows.length }));
    } catch (error) {
      failures.push(error.message);
      response.writeHead(400, { 'content-type': 'application/x-amz-json-1.0' });
      response.end(JSON.stringify({ __type: 'ValidationException', message: error.message }));
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  return {
    endpoint, scans,
    assertBuildReads() {
      assert.deepEqual(failures, [], 'The build must not bypass or violate the table fixture.');
      for (const table of [catalogTable, profilesTable]) {
        assert.ok(scans.some(({ tableName }) => tableName === table), `The real build must scan ${table}.`);
      }
    },
    close: () => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const separator = args.indexOf('--');
  assert.ok(separator > 0 && args.length > separator + 1,
    'Usage: node tests/fixtures/hosting-release-dynamodb.mjs --catalog FILE --release-context FILE -- COMMAND [ARGS]');
  const options = args.slice(0, separator);
  const catalogPath = options[options.indexOf('--catalog') + 1];
  const contextPath = options[options.indexOf('--release-context') + 1];
  assert.ok(options.includes('--catalog') && options.includes('--release-context') && catalogPath && contextPath,
    'Both independent context and catalog fixture paths are required.');
  const context = JSON.parse(await readFile(contextPath, 'utf8'));
  assert.equal(context.mode, 'production-fixture', 'The loopback build explicitly selects production-fixture mode.');
  const fixture = await startHostingReleaseDynamo({ catalog: JSON.parse(await readFile(catalogPath, 'utf8')), runtimeEnvironment: context.runtimeEnvironment });
  const childEnvironment = {
    ...process.env,
    ...context.runtimeEnvironment,
    RELEASE_CONTEXT_FILE: resolve(contextPath),
    PUBLIC_PRODUCTION: 'true',
    PUBLIC_SITE_ORIGIN: context.siteOrigin,
    PUBLIC_SUBMISSION_API_URL: context.submissionApiUrl,
    AWS_ENDPOINT_URL_DYNAMODB: fixture.endpoint,
    AWS_ACCESS_KEY_ID: 'mixed-preview-dummy-access-key-not-valid',
    AWS_SECRET_ACCESS_KEY: 'mixed-preview-dummy-secret-not-valid',
    AWS_SESSION_TOKEN: 'mixed-preview-dummy-session-not-valid',
    AWS_REGION: 'us-east-1',
    AWS_EC2_METADATA_DISABLED: 'true',
  };
  delete childEnvironment.CATALOG_FIXTURE;
  delete childEnvironment.AWS_PROFILE;
  delete childEnvironment.AWS_IGNORE_CONFIGURED_ENDPOINT_URLS;
  try {
    const [command, ...commandArgs] = args.slice(separator + 1);
    const child = spawn(command, commandArgs, { env: childEnvironment, stdio: 'inherit' });
    const [status, signal] = await once(child, 'exit');
    assert.equal(signal, null, 'The fixture build finishes normally.');
    assert.equal(status, 0, 'The fixture build succeeds.');
    fixture.assertBuildReads();
    console.log('Verified real build scans through the projection-aware loopback DynamoDB fixture.');
  } finally {
    await fixture.close();
  }
}

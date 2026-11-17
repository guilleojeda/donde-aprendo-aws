import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { startHostingReleaseDynamo } from './fixtures/hosting-release-dynamodb.mjs';
import context from './fixtures/release-production-context.json' with { type: 'json' };

test('the normal build rejects a mismatched release mode before reading provider data', async (t) => {
  const catalog = JSON.parse(await readFile(new URL('./fixtures/catalog.json', import.meta.url), 'utf8'));
  const fixture = await startHostingReleaseDynamo({ catalog, runtimeEnvironment: context.runtimeEnvironment });
  t.after(() => fixture.close());
  const env = {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    ...context.runtimeEnvironment,
    RELEASE_CONTEXT_FILE: fileURLToPath(new URL('./fixtures/release-production-context.json', import.meta.url)),
    PUBLIC_PRODUCTION: 'false',
    PUBLIC_SITE_ORIGIN: context.siteOrigin,
    PUBLIC_SUBMISSION_API_URL: context.submissionApiUrl,
    AWS_ENDPOINT_URL_DYNAMODB: fixture.endpoint,
    AWS_ACCESS_KEY_ID: 'release-build-dummy-access-key',
    AWS_SECRET_ACCESS_KEY: 'release-build-dummy-secret-key',
    AWS_SESSION_TOKEN: 'release-build-dummy-session-token',
    AWS_REGION: 'us-east-1',
    AWS_EC2_METADATA_DISABLED: 'true',
  };
  const child = spawn('npm', ['run', 'build'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  const output = [];
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => output.push(chunk));
  const [status, signal] = await once(child, 'exit');
  const text = Buffer.concat(output).toString('utf8');
  assert.equal(signal, null, 'The public build command exits normally.');
  assert.notEqual(status, 0, 'The independent production-fixture context must reject preview output.');
  assert.match(text, /PUBLIC_PRODUCTION/u, 'The command reports the mode mismatch itself.');
  assert.deepEqual(fixture.scans, [], 'Release admission happens before any provider reads.');
});

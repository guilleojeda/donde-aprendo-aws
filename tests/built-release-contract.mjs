import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { parseEnv } from 'node:util';

const root = resolve('.');
const verifier = resolve(root, 'scripts/verify-amplify-hosting.mjs');
// These are the approved release fields, independently of the verifier's list.
const productionFields = ['ACCOUNT_ORIGIN', 'COGNITO_ISSUER', 'COGNITO_CLIENT_ID', 'COGNITO_DOMAIN',
  'ACCOUNTS_TABLE', 'CATALOG_TABLE', 'CREATOR_PROFILES_TABLE', 'CREATOR_PHOTOS_BUCKET',
  'GA4_PROPERTY_ID', 'GA4_CREDENTIALS_SECRET_ARN', 'CREATOR_ANALYTICS_CAPTURE_STARTED_AT'];
const analyticsFields = productionFields.slice(-3);
const incorrectValues = {
  ACCOUNT_ORIGIN: 'https://wrong-release.example.test',
  COGNITO_ISSUER: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_WRONG',
  COGNITO_CLIENT_ID: 'wrong-release-client',
  COGNITO_DOMAIN: 'https://wrong-release.auth.us-east-1.amazoncognito.com',
  ACCOUNTS_TABLE: 'wrong-release-accounts', CATALOG_TABLE: 'wrong-release-catalog',
  CREATOR_PROFILES_TABLE: 'wrong-release-profiles', CREATOR_PHOTOS_BUCKET: 'wrong-release-photos',
  GA4_PROPERTY_ID: '987654321',
  GA4_CREDENTIALS_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:000000000000:secret:wrong-release-abcdef',
  CREATOR_ANALYTICS_CAPTURE_STARTED_AT: '2001-01-01T00:00:00.000Z',
};

async function runVerifier(cwd, contextPath) {
  const args = [verifier];
  const child = spawn(process.execPath, args, { cwd, env: {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    AWS_EC2_METADATA_DISABLED: 'true',
    RELEASE_CONTEXT_FILE: resolve(contextPath),
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = [];
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => chunks.push(chunk));
  const timeout = setTimeout(() => child.kill('SIGKILL'), 25_000);
  try {
    return await new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', (status, signal) => resolveExit({ status, signal, output: Buffer.concat(chunks).toString('utf8') }));
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Copy the shipped handler and chunks; only the independent .env is changed. */
async function withArtifact(t, context, change, verify) {
  const copy = await mkdtemp(join(tmpdir(), 'hosting-release-contract-'));
  t.after(() => rm(copy, { recursive: true, force: true }));
  for (const name of await readdir(root)) {
    if (name !== '.amplify-hosting') await symlink(join(root, name), join(copy, name));
  }
  const source = join(root, '.amplify-hosting');
  const target = join(copy, '.amplify-hosting');
  await cp(source, target, { recursive: true, filter: (path) =>
    path !== join(source, 'compute/default/node_modules') && path !== join(source, 'static') });
  for (const path of ['static', 'compute/default/node_modules']) await symlink(join(source, path), join(target, path));
  const environmentPath = join(target, 'compute/default/.env');
  const environment = parseEnv(await readFile(environmentPath, 'utf8'));
  change(environment);
  await writeFile(environmentPath, Object.entries(environment).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n') + '\n');
  const contextPath = join(copy, 'expected-release-context.json');
  await writeFile(contextPath, JSON.stringify(context));
  await verify(await runVerifier(copy, contextPath));
}

test('the shipped Compute configuration matches the independent release target', async (t) => {
  assert.equal(process.versions.node.split('.')[0], '24', 'Use the declared Node 24 runtime.');
  assert.ok(process.env.RELEASE_CONTEXT_FILE,
    'Build and package the actual artifact, then set RELEASE_CONTEXT_FILE to its independent expected context.');
  const contextPath = resolve(process.env.RELEASE_CONTEXT_FILE);
  const context = JSON.parse(await readFile(contextPath, 'utf8'));
  assert.ok(['preview', 'production-fixture'].includes(context.mode), 'Offline acceptance explicitly chooses its build mode.');
  const requiredFields = context.mode === 'preview'
    ? productionFields.filter((name) => name !== 'CATALOG_TABLE' && !analyticsFields.includes(name))
    : productionFields;
  for (const name of requiredFields) assert.ok(context.runtimeEnvironment[name]?.trim(), `The independent target supplies ${name}.`);

  await t.test('the unchanged artifact passes the full existing hosting verifier', async () => {
    const result = await runVerifier(root, contextPath);
    assert.equal(result.status, 0, result.output);
    assert.equal(result.signal, null, 'Verification finishes before its deadline.');
  });

  // The actual preview package proves its intentional optional omissions.
  // Exercise the shared per-field rejection matrix once, on production.
  if (context.mode === 'preview') return;

  for (const name of requiredFields) {
    for (const fault of ['absent', 'blank', 'incorrect']) {
      await t.test(`${name}: ${fault} packaged value is rejected`, async (subtest) => {
        await withArtifact(subtest, context, (environment) => {
          if (fault === 'absent') delete environment[name];
          else environment[name] = fault === 'blank' ? '' : incorrectValues[name];
        }, ({ status, signal, output }) => {
          assert.equal(signal, null, 'Invalid configuration fails promptly.');
          assert.notEqual(status, 0, `The full verifier accepted ${fault} ${name}.`);
          assert.match(output, new RegExp(name, 'u'), 'The rejection identifies the affected release field.');
        });
      });
    }
  }

  await t.test('equivalent HTTPS account and provider origins remain accepted', async (subtest) => {
    await withArtifact(subtest, context, (environment) => {
      for (const name of ['ACCOUNT_ORIGIN', 'COGNITO_DOMAIN']) {
        const origin = new URL(context.runtimeEnvironment[name]);
        environment[name] = `https://${origin.hostname.toUpperCase()}${origin.port ? `:${origin.port}` : ':443'}/`;
      }
    }, ({ status, output }) => {
      assert.equal(status, 0, output);
    });
  });

});

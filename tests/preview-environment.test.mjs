import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startMixedPreview } from './fixtures/mixed-preview.mjs';

const exportedContext = {
  AWS_ACCESS_KEY_ID: 'preview-dummy-access-key',
  AWS_SECRET_ACCESS_KEY: 'preview-dummy-secret',
  AWS_SESSION_TOKEN: 'preview-dummy-session',
  AWS_REGION: 'us-west-2',
  AWS_DEFAULT_REGION: 'us-east-2',
  AWS_PROFILE: 'preview-dummy-profile',
  ACCOUNT_ORIGIN: 'https://preview.example.test',
  COGNITO_ISSUER: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_preview',
  COGNITO_CLIENT_ID: 'preview-client',
  COGNITO_DOMAIN: 'https://preview.auth.us-east-1.amazoncognito.com',
  ACCOUNTS_TABLE: 'preview-accounts',
  CATALOG_TABLE: 'preview-catalog',
  CREATOR_PROFILES_TABLE: 'preview-profiles',
  CREATOR_PHOTOS_BUCKET: 'preview-photos',
  GA4_PROPERTY_ID: '123456789',
  GA4_CREDENTIALS_SECRET_ARN: 'arn:aws:secretsmanager:us-west-2:000000000000:secret:preview-placeholder',
  CREATOR_ANALYTICS_CAPTURE_STARTED_AT: '2000-01-01T00:00:00.000Z',
  PREVIEW_FUTURE_RUNTIME_SETTING: 'an-export-not-in-any-launcher-allowlist',
  PREVIEW_EXPLICIT_EMPTY_SETTING: '',
};

async function withObservedCompute(t, verify) {
  assert.equal(process.versions.node.split('.')[0], '24', 'Use the declared Node 24 runtime.');
  const root = await mkdtemp(join(tmpdir(), 'mixed-preview-environment-'));
  let preview;
  try {
    const compute = join(root, '.amplify-hosting/compute/default');
    await mkdir(join(root, 'scripts'), { recursive: true });
    await mkdir(compute, { recursive: true });
    await mkdir(join(root, '.amplify-hosting/static'), { recursive: true });
    // The launcher is the behavior under test. This dependency only observes
    // the environment it actually receives; it does not repair or load values.
    await copyFile(new URL('../scripts/preview.mjs', import.meta.url), join(root, 'scripts/preview.mjs'));
    const expected = {
      ...exportedContext,
      AWS_CONFIG_FILE: join(root, 'unused-aws-config'),
      AWS_SHARED_CREDENTIALS_FILE: join(root, 'unused-aws-credentials'),
    };
    await writeFile(join(compute, 'entry.mjs'), `
      import { createServer } from 'node:http';
      const names = ${JSON.stringify(Object.keys(expected))};
      const server = createServer((request, response) => {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          context: Object.fromEntries(names.map(name => [name, process.env[name] ?? null])),
          owned: { NODE_ENV: process.env.NODE_ENV, HOST: process.env.HOST, PORT: process.env.PORT },
          address: server.address(), node: process.version,
        }));
      });
      server.listen(Number(process.env.PORT), process.env.HOST);
    `);
    preview = await startMixedPreview(t, { root, env: {
      ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
      ...expected,
      NODE_ENV: 'development', HOST: 'parent-host.invalid', PORT: '65536',
    } });
    const response = await fetch(new URL('/observed-environment', preview.origin), { signal: AbortSignal.timeout(3_000) });
    assert.equal(response.status, 200, 'The command is ready and proxies to its real child.');
    await verify({ observed: await response.json(), expected, preview });
  } finally {
    await preview?.stop();
    await rm(root, { recursive: true, force: true });
  }
}

test('mixed preview forwards exported AWS and runtime context, including unknown and empty values, to Compute', async (t) => {
  await withObservedCompute(t, ({ observed, expected }) => {
    assert.deepEqual(observed.context, expected,
      'Compute receives the caller context rather than a manually enumerated subset.');
  });
});

test('mixed preview overrides only its production mode and private listening address', async (t) => {
  await withObservedCompute(t, ({ observed, preview }) => {
    assert.equal(observed.owned.NODE_ENV, 'production');
    assert.equal(observed.owned.HOST, '127.0.0.1');
    assert.equal(observed.address.address, '127.0.0.1');
    assert.equal(observed.owned.PORT, String(observed.address.port));
    assert.ok(observed.address.port > 0 && observed.address.port <= 65535);
    assert.notEqual(observed.owned.PORT, '65536', 'The parent PORT is not the private Compute port.');
    assert.notEqual(observed.owned.PORT, new URL(preview.origin).port, 'The proxy and Compute own separate ports.');
    assert.match(observed.node, /^v24\./u);
    for (const value of [exportedContext.AWS_SECRET_ACCESS_KEY, exportedContext.AWS_SESSION_TOKEN]) {
      assert.ok(!preview.output().includes(value), 'The launcher does not print the dummy credentials.');
    }
  });
});

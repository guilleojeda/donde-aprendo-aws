import assert from 'node:assert/strict';
import test from 'node:test';

const moduleResult = await import('../src/lib/creator-statistics-token.mjs').then(
  (value) => ({ value }), (error) => ({ error }),
);
const credentials = {
  type: 'service_account', project_id: 'fixture-project',
  client_email: 'statistics-reader@fixture-project.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nfixture-not-a-real-key\n-----END PRIVATE KEY-----\n',
};
function factory() {
  assert.equal(moduleResult.error, undefined,
    `Falta implementar el proveedor de tokens GA4: ${moduleResult.error?.message}`);
  assert.equal(typeof moduleResult.value.createGA4TokenProvider, 'function');
  return moduleResult.value.createGA4TokenProvider;
}

test('credentials load lazily on the server and the official client receives only the read scope', async () => {
  let loads = 0;
  const clientOptions = [];
  const provider = factory()({
    loadCredentials: async () => { loads += 1; return structuredClone(credentials); },
    createAuth: (options) => {
      clientOptions.push(options);
      return { getAccessToken: async () => 'fixture-private-access-token' };
    },
  });
  assert.equal(loads, 0, 'Creating the runtime must not load Analytics secrets for unrelated routes.');
  assert.equal(await provider.getAccessToken(), 'fixture-private-access-token');
  assert.equal(loads, 1);
  assert.deepEqual(clientOptions[0].scopes, ['https://www.googleapis.com/auth/analytics.readonly']);
  assert.deepEqual(clientOptions[0].credentials, credentials);
});

test('token validity and refresh stay with the reused official auth client', async () => {
  let loads = 0;
  let clients = 0;
  let tokenCalls = 0;
  const provider = factory()({
    loadCredentials: async () => { loads += 1; return structuredClone(credentials); },
    createAuth: () => {
      clients += 1;
      return { getAccessToken: async () => `sdk-managed-token-${++tokenCalls}` };
    },
  });
  assert.equal(await provider.getAccessToken(), 'sdk-managed-token-1');
  assert.equal(await provider.getAccessToken(), 'sdk-managed-token-2');
  assert.equal(clients, 1);
  assert.equal(loads, 1);
});

test('absent or unrelated credentials do not start an auth client', async () => {
  for (const invalid of [null, {}, { type: 'authorized_user', client_secret: 'private' }]) {
    let clients = 0;
    const provider = factory()({
      loadCredentials: async () => invalid,
      createAuth: () => { clients += 1; return { getAccessToken: async () => 'unexpected' }; },
    });
    await assert.rejects(provider.getAccessToken());
    assert.equal(clients, 0);
  }
});

test('a failed secret read or empty token is unavailable and a later request can recover', async () => {
  let attempts = 0;
  const provider = factory()({
    loadCredentials: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('private secret store error');
      return structuredClone(credentials);
    },
    createAuth: () => ({ getAccessToken: async () => 'recovered-token' }),
  });
  await assert.rejects(provider.getAccessToken());
  assert.equal(await provider.getAccessToken(), 'recovered-token');
  const empty = factory()({
    loadCredentials: async () => structuredClone(credentials),
    createAuth: () => ({ getAccessToken: async () => null }),
  });
  await assert.rejects(empty.getAccessToken());
});

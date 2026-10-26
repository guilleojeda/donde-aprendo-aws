import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';

const { Gaxios } = createRequire(import.meta.url)('gaxios');

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

test('a stalled real JWT OAuth request receives the bounded transporter timeout and rejects', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const nativeRequest = Gaxios.prototype.request;
  const timeoutDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout');
  const transportRequests = [];
  const configuredTimeouts = [];

  Gaxios.prototype.request = function (options) {
    return nativeRequest.call(this, {
      ...options,
      fetchImplementation: async (url, request) => {
        transportRequests.push({
          url: String(url),
          timeout: request.timeout,
          signal: request.signal,
        });
        return new Promise((resolve, reject) => {
          if (request.signal.aborted) {
            reject(request.signal.reason);
            return;
          }
          request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
        });
      },
    });
  };
  AbortSignal.timeout = (milliseconds) => {
    configuredTimeouts.push(milliseconds);
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), 5);
    return controller.signal;
  };

  try {
    const provider = factory()({
      loadCredentials: async () => ({
        type: 'service_account',
        client_email: 'statistics@fixture.invalid',
        private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
      }),
    });

    await assert.rejects(provider.getAccessToken(), /GA4 authentication is unavailable\./);
  } finally {
    Gaxios.prototype.request = nativeRequest;
    Object.defineProperty(AbortSignal, 'timeout', timeoutDescriptor);
  }

  assert.deepEqual(configuredTimeouts, [3_000, 3_000]);
  assert.equal(transportRequests.length, 2, 'The OAuth transport performs at most one retry.');
  assert.ok(transportRequests.every(({ url }) => url === 'https://oauth2.googleapis.com/token'));
  assert.ok(transportRequests.every(({ timeout, signal }) => timeout === 3_000 && signal instanceof AbortSignal));
  assert.ok(transportRequests.every(({ signal }) => signal.aborted), 'Both stalled transport attempts are aborted.');
});

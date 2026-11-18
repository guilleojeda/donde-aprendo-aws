import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
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

function credentialsForKey(privateKey) {
  return {
    ...credentials,
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

function decodeBase64Url(value) {
  return Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64');
}

function inspectSignedAssertion(assertion, publicKey) {
  assert.equal(typeof assertion, 'string');
  const parts = assertion.split('.');
  assert.equal(parts.length, 3, 'The installed JWT client must send a compact signed assertion.');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signedBytes = Buffer.from(`${encodedHeader}.${encodedPayload}`);
  const verifier = createVerify('RSA-SHA256');
  verifier.update(signedBytes);
  verifier.end();
  assert.equal(verifier.verify(publicKey, decodeBase64Url(encodedSignature)), true,
    'The token endpoint must receive an assertion signed by the supplied ephemeral key.');
  return {
    header: JSON.parse(decodeBase64Url(encodedHeader)),
    payload: JSON.parse(decodeBase64Url(encodedPayload)),
  };
}

function installTokenEndpoint(handler) {
  const nativeRequest = Gaxios.prototype.request;
  const requests = [];
  Gaxios.prototype.request = function request(options) {
    return nativeRequest.call(this, {
      ...options,
      fetchImplementation: async (url, request) => {
        const body = String(request.body);
        const params = new URLSearchParams(body);
        const exchange = {
          url: String(url),
          request,
          assertion: params.get('assertion'),
          grantType: params.get('grant_type'),
        };
        requests.push(exchange);
        return handler(exchange, requests.length);
      },
    });
  };
  return {
    requests,
    restore() {
      Gaxios.prototype.request = nativeRequest;
    },
  };
}

function tokenResponse(accessToken, expiresIn = 3_600) {
  return Response.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
  });
}

function oauthError(error, description, status = 400) {
  return Response.json({ error, error_description: description }, { status });
}

function assertTokenEndpointExchange(exchange) {
  assert.equal(exchange.url, 'https://oauth2.googleapis.com/token');
  assert.equal(exchange.grantType, 'urn:ietf:params:oauth:grant-type:jwt-bearer');
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

test('the real JWT adapter sends a verified signed exchange through the authorized token endpoint seam', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceCredentials = credentialsForKey(privateKey);
  let loads = 0;
  const endpoint = installTokenEndpoint((exchange) => {
    assertTokenEndpointExchange(exchange);
    const signed = inspectSignedAssertion(exchange.assertion, publicKey);
    assert.deepEqual(signed.header, { alg: 'RS256' });
    assert.equal(signed.payload.iss, serviceCredentials.client_email);
    assert.equal(signed.payload.scope, 'https://www.googleapis.com/auth/analytics.readonly');
    assert.equal(signed.payload.aud, 'https://oauth2.googleapis.com/token');
    assert.ok(Number.isInteger(signed.payload.iat));
    assert.equal(signed.payload.exp - signed.payload.iat, 3_600);
    return tokenResponse('provider-issued-access-token');
  });

  try {
    const provider = factory()({
      loadCredentials: async () => { loads += 1; return structuredClone(serviceCredentials); },
    });
    assert.equal(await provider.getAccessToken(), 'provider-issued-access-token');
    assert.equal(loads, 1);
    assert.equal(endpoint.requests.length, 1);
  } finally {
    endpoint.restore();
  }
});

test('overlapping first token requests coalesce credential loading and the installed JWT exchange', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceCredentials = credentialsForKey(privateKey);
  let loads = 0;
  let releaseLoad;
  const loadStarted = new Promise((resolve) => { releaseLoad = resolve; });
  let resolveLoad;
  const loadGate = new Promise((resolve) => { resolveLoad = resolve; });
  const endpoint = installTokenEndpoint((exchange) => {
    assertTokenEndpointExchange(exchange);
    inspectSignedAssertion(exchange.assertion, publicKey);
    return tokenResponse('coalesced-access-token');
  });

  try {
    const provider = factory()({
      loadCredentials: async () => {
        loads += 1;
        releaseLoad();
        await loadGate;
        return structuredClone(serviceCredentials);
      },
    });
    const first = provider.getAccessToken();
    const second = provider.getAccessToken();
    await loadStarted;
    assert.equal(loads, 1, 'Overlapping requests must share one credential read.');
    resolveLoad();
    assert.deepEqual(await Promise.all([first, second]), [
      'coalesced-access-token',
      'coalesced-access-token',
    ]);
    assert.equal(endpoint.requests.length, 1, 'Overlapping requests must share one signed exchange.');
  } finally {
    endpoint.restore();
  }
});

test('one invalid_grant recovery reloads once, rejects unchanged signing material, then recovers on a later changed secret', async () => {
  const oldPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const replacementPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  // Rotate the signing key for the same service account. Its issuer stays fixed.
  const oldCredentials = credentialsForKey(oldPair.privateKey);
  const replacementCredentials = credentialsForKey(replacementPair.privateKey);
  let loads = 0;
  let exchanges = 0;
  const endpoint = installTokenEndpoint((exchange) => {
    assertTokenEndpointExchange(exchange);
    exchanges += 1;
    if (exchanges <= 2) {
      const signed = inspectSignedAssertion(exchange.assertion, oldPair.publicKey);
      assert.equal(signed.payload.iss, oldCredentials.client_email);
    } else {
      const signed = inspectSignedAssertion(exchange.assertion, replacementPair.publicKey);
      assert.equal(signed.payload.iss, replacementCredentials.client_email);
    }
    if (exchanges === 1) return tokenResponse('warm-old-access-token', 1);
    if (exchanges === 2) return oauthError('invalid_grant', 'Invalid JWT Signature.');
    return tokenResponse('cold-replacement-access-token');
  });

  try {
    const provider = factory()({
      loadCredentials: async () => {
        loads += 1;
        // The first recovery read deliberately observes the unchanged secret.
        return structuredClone(loads < 3 ? oldCredentials : replacementCredentials);
      },
    });
    assert.equal(await provider.getAccessToken(), 'warm-old-access-token');
    await assert.rejects(provider.getAccessToken(), /GA4 authentication is unavailable\./);
    assert.equal(loads, 2, 'A classified token rejection permits exactly one replacement-secret read.');
    assert.equal(exchanges, 2, 'An unchanged signing secret must not trigger a second old-key exchange.');

    assert.equal(await provider.getAccessToken(), 'cold-replacement-access-token');
    assert.equal(loads, 3, 'A later normal request must re-read credentials after an unsuccessful unchanged reload.');
    assert.equal(exchanges, 3);
  } finally {
    endpoint.restore();
  }
});

test('concurrent warm signature rejection coalesces replacement reload and gives every caller the replacement token', async () => {
  const oldPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const replacementPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const oldCredentials = credentialsForKey(oldPair.privateKey);
  const replacementCredentials = credentialsForKey(replacementPair.privateKey);
  let loads = 0;
  let exchanges = 0;
  let releaseInvalidGrant;
  const invalidGrantStarted = new Promise((resolve) => { releaseInvalidGrant = resolve; });
  let continueInvalidGrant;
  const invalidGrantGate = new Promise((resolve) => { continueInvalidGrant = resolve; });
  const endpoint = installTokenEndpoint(async (exchange) => {
    assertTokenEndpointExchange(exchange);
    exchanges += 1;
    if (exchanges <= 2) {
      const signed = inspectSignedAssertion(exchange.assertion, oldPair.publicKey);
      assert.equal(signed.payload.iss, oldCredentials.client_email);
    } else {
      const signed = inspectSignedAssertion(exchange.assertion, replacementPair.publicKey);
      assert.equal(signed.payload.iss, replacementCredentials.client_email);
    }
    if (exchanges === 1) return tokenResponse('warm-old-access-token', 1);
    if (exchanges === 2) {
      // Hold the classified rejection until both callers have joined the same
      // expired generation. This makes recovery coalescing observable.
      releaseInvalidGrant();
      await invalidGrantGate;
      return oauthError('invalid_grant', 'Invalid JWT Signature.');
    }
    return tokenResponse('replacement-access-token');
  });

  try {
    const provider = factory()({
      loadCredentials: async () => {
        loads += 1;
        return structuredClone(loads === 1 ? oldCredentials : replacementCredentials);
      },
    });
    assert.equal(await provider.getAccessToken(), 'warm-old-access-token');

    const first = provider.getAccessToken();
    const second = provider.getAccessToken();
    await invalidGrantStarted;
    assert.equal(loads, 1, 'No recovery read occurs before the shared warm rejection is delivered.');
    continueInvalidGrant();
    assert.deepEqual(await Promise.all([first, second]), [
      'replacement-access-token',
      'replacement-access-token',
    ]);
    assert.equal(loads, 2, 'Concurrent classified rejections share one replacement-secret read.');
    assert.equal(exchanges, 3, 'Concurrent classified rejections share one replacement signed exchange.');
  } finally {
    endpoint.restore();
  }
});

test('invalid_grant caused by JWT clock or claims does not reload credentials', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceCredentials = credentialsForKey(privateKey);
  let loads = 0;
  let exchanges = 0;
  const endpoint = installTokenEndpoint((exchange) => {
    assertTokenEndpointExchange(exchange);
    exchanges += 1;
    const signed = inspectSignedAssertion(exchange.assertion, publicKey);
    assert.equal(signed.payload.iss, serviceCredentials.client_email);
    if (exchanges === 1) {
      return oauthError(
        'invalid_grant',
        'Invalid JWT: Token must be a short-lived token (60 minutes) and in a reasonable timeframe.',
      );
    }
    return tokenResponse('claims-recovered-access-token');
  });

  try {
    const provider = factory()({
      loadCredentials: async () => { loads += 1; return structuredClone(serviceCredentials); },
    });
    await assert.rejects(provider.getAccessToken(), /GA4 authentication is unavailable\./);
    assert.equal(loads, 1, 'A clock/claims invalid_grant is an ordinary token error, not a credential rotation signal.');
    assert.equal(exchanges, 1);
    assert.equal(await provider.getAccessToken(), 'claims-recovered-access-token');
    assert.equal(loads, 1, 'The later request reuses the same credential generation.');
    assert.equal(exchanges, 2);
  } finally {
    endpoint.restore();
  }
});

test('a rejected replacement key does not trigger a recursive second reload, while a later call can use the final key', async () => {
  const oldPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const replacementPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const finalPair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const oldCredentials = credentialsForKey(oldPair.privateKey);
  const replacementCredentials = credentialsForKey(replacementPair.privateKey);
  const finalCredentials = credentialsForKey(finalPair.privateKey);
  let loads = 0;
  let exchanges = 0;
  const endpoint = installTokenEndpoint((exchange) => {
    assertTokenEndpointExchange(exchange);
    exchanges += 1;
    if (exchanges === 1 || exchanges === 2) {
      const signed = inspectSignedAssertion(exchange.assertion, oldPair.publicKey);
      assert.equal(signed.payload.iss, oldCredentials.client_email);
    } else if (exchanges === 3) {
      const signed = inspectSignedAssertion(exchange.assertion, replacementPair.publicKey);
      assert.equal(signed.payload.iss, replacementCredentials.client_email);
    } else {
      const signed = inspectSignedAssertion(exchange.assertion, finalPair.publicKey);
      assert.equal(signed.payload.iss, finalCredentials.client_email);
    }
    if (exchanges === 1) return tokenResponse('recursive-old-access-token', 1);
    if (exchanges === 2 || exchanges === 3) {
      return oauthError('invalid_grant', 'Invalid JWT Signature.');
    }
    return tokenResponse('final-access-token');
  });

  try {
    const provider = factory()({
      loadCredentials: async () => {
        loads += 1;
        if (loads === 1) return structuredClone(oldCredentials);
        if (loads === 2) return structuredClone(replacementCredentials);
        return structuredClone(finalCredentials);
      },
    });
    assert.equal(await provider.getAccessToken(), 'recursive-old-access-token');

    await assert.rejects(provider.getAccessToken(), /GA4 authentication is unavailable\./);
    assert.equal(loads, 2, 'The rejected replacement must not permit a second reload in the same request.');
    assert.equal(exchanges, 3, 'The first recovery request stops after one old-key and one replacement-key exchange.');

    assert.equal(await provider.getAccessToken(), 'final-access-token');
    assert.equal(loads, 3, 'A later deliberate request may read the next credential generation.');
    assert.equal(exchanges, 4, 'The final key is exchanged only by the later deliberate request.');
  } finally {
    endpoint.restore();
  }
});

test('non-credential token endpoint errors do not reload secrets and retain normal later recovery', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceCredentials = credentialsForKey(privateKey);
  let loads = 0;
  let exchanges = 0;
  const endpoint = installTokenEndpoint((exchange) => {
    assertTokenEndpointExchange(exchange);
    exchanges += 1;
    const signed = inspectSignedAssertion(exchange.assertion, publicKey);
    assert.equal(signed.payload.iss, serviceCredentials.client_email);
    if (exchanges === 1) return oauthError('invalid_scope', 'The requested scope is not valid.');
    return tokenResponse('transport-recovered-access-token');
  });

  try {
    const provider = factory()({
      loadCredentials: async () => { loads += 1; return structuredClone(serviceCredentials); },
    });
    await assert.rejects(provider.getAccessToken(), /GA4 authentication is unavailable\./);
    assert.equal(loads, 1, 'A non-credential rejection must not reload the secret.');
    assert.equal(exchanges, 1);
    assert.equal(await provider.getAccessToken(), 'transport-recovered-access-token');
    assert.equal(loads, 1, 'A later ordinary request keeps the existing credential generation.');
    assert.equal(exchanges, 2);
  } finally {
    endpoint.restore();
  }
});

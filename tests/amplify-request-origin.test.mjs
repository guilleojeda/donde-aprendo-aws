import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createRequest } from 'astro/app/node';
import {
  allowedAmplifyDomains as configuredDomains,
  allowedAmplifyDomainsForOrigin,
  configuredAccountOrigin,
} from '../src/lib/amplify-security.mjs';

async function withRequestServer(t, handleRequest) {
  const server = createServer(handleRequest);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return `http://127.0.0.1:${address.port}`;
}

test('Amplify trusts forwarded HTTPS only for the exact canonical apex domain', async (t) => {
  const allowedDomains = allowedAmplifyDomainsForOrigin('https://dondeaprendoaws.com');
  assert.deepEqual(allowedDomains, [{ protocol: 'https', hostname: 'dondeaprendoaws.com' }]);

  const origin = await withRequestServer(t, (incoming, response) => {
    const request = createRequest(incoming, { allowedDomains });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ url: request.url, origin: new URL(request.url).origin }));
  });

  const trusted = await fetch(`${origin}/cuenta/salir/?source=proxy`, {
    headers: {
      host: 'dondeaprendoaws.com',
      'x-forwarded-host': 'dondeaprendoaws.com',
      'x-forwarded-proto': 'https',
    },
  });
  assert.equal(trusted.status, 200);
  assert.deepEqual(await trusted.json(), {
    url: 'https://dondeaprendoaws.com/cuenta/salir/?source=proxy',
    origin: 'https://dondeaprendoaws.com',
  });

  const untrusted = await fetch(`${origin}/cuenta/salir/`, {
    headers: {
      host: 'attacker.example',
      'x-forwarded-host': 'attacker.example',
      'x-forwarded-proto': 'https',
    },
  });
  assert.equal(untrusted.status, 200);
  const untrustedRequest = await untrusted.json();
  assert.equal(untrustedRequest.origin, 'https://localhost');
  assert.equal(new URL(untrustedRequest.url).hostname, 'localhost');
  assert.doesNotMatch(untrustedRequest.url, /attacker\.example/u);
});

test('the serialized allowlist follows ACCOUNT_ORIGIN while retaining the production fallback', () => {
  const expectedOrigin = process.env.ACCOUNT_ORIGIN === undefined
    ? 'https://dondeaprendoaws.com'
    : process.env.ACCOUNT_ORIGIN.trim();
  assert.equal(configuredAccountOrigin(), new URL(expectedOrigin).origin);
  assert.deepEqual(configuredDomains, allowedAmplifyDomainsForOrigin(expectedOrigin));
});

test('Amplify allowlist follows the exact configured HTTPS preview origin', async (t) => {
  const previewDomains = allowedAmplifyDomainsForOrigin('https://preview.example.test:8443');
  assert.deepEqual(previewDomains, [{ protocol: 'https', hostname: 'preview.example.test', port: '8443' }]);

  const origin = await withRequestServer(t, (incoming, response) => {
    const request = createRequest(incoming, { allowedDomains: previewDomains });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ origin: new URL(request.url).origin }));
  });

  const trusted = await fetch(`${origin}/cuenta/callback/`, {
    headers: {
      host: 'preview.example.test:8443',
      'x-forwarded-host': 'preview.example.test:8443',
      'x-forwarded-proto': 'https',
    },
  });
  assert.equal(trusted.status, 200);
  assert.deepEqual(await trusted.json(), { origin: 'https://preview.example.test:8443' });

  const wrongHost = await fetch(`${origin}/cuenta/callback/`, {
    headers: {
      host: 'preview.example.test:8443',
      'x-forwarded-host': 'other.example.test:8443',
      'x-forwarded-proto': 'https',
    },
  });
  assert.equal(wrongHost.status, 200);
  assert.deepEqual(await wrongHost.json(), { origin: 'https://localhost' });

  const wrongPort = await fetch(`${origin}/cuenta/callback/`, {
    headers: {
      host: 'preview.example.test:8443',
      'x-forwarded-host': 'preview.example.test:9443',
      'x-forwarded-proto': 'https',
    },
  });
  assert.equal(wrongPort.status, 200);
  assert.deepEqual(await wrongPort.json(), { origin: 'https://localhost' });
});

test('Amplify origin configuration rejects non-HTTPS and non-origin values', () => {
  for (const value of [
    'http://preview.example.test',
    'https://preview.example.test/path',
    'https://preview.example.test/?query=1',
    'https://user:password@preview.example.test',
    'not-an-origin',
  ]) {
    assert.throws(() => allowedAmplifyDomainsForOrigin(value), /ACCOUNT_ORIGIN/u);
  }
});

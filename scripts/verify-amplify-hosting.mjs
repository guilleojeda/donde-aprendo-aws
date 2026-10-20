import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { configuredAccountOrigin } from '../src/lib/amplify-security.mjs';
import { siteOutputRoot } from './lib/site-output.mjs';

const root = resolve('.amplify-hosting');
const computeRoot = resolve(root, 'compute/default');
const manifest = JSON.parse(readFileSync(resolve(root, 'deploy-manifest.json'), 'utf8'));
const accountOrigin = configuredAccountOrigin();
const accountHost = new URL(accountOrigin).host;
const allowedRuntimeEnvironment = [
  'ACCOUNT_ORIGIN',
  'COGNITO_ISSUER',
  'COGNITO_CLIENT_ID',
  'COGNITO_DOMAIN',
  'ACCOUNTS_TABLE',
];
const runtimeEnvironment = readFileSync(resolve(computeRoot, '.env'), 'utf8');
const runtimeEnvironmentNames = runtimeEnvironment.split(/\r?\n/u)
  .filter((line) => line.trim() && !line.trim().startsWith('#'))
  .map((line) => line.slice(0, line.indexOf('=')))
  .sort();
const runtimeEnvironmentValues = runtimeEnvironment.split(/\r?\n/u)
  .filter((line) => line.trim() && !line.trim().startsWith('#'))
  .map((line) => {
    const value = line.slice(line.indexOf('=') + 1);
    if (!value.startsWith('"')) return value;
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  })
  .filter(Boolean);

assert.equal(manifest.version, 1, 'Amplify deployment manifest version.');
assert.deepEqual(manifest.routes.map(({ path }) => path), ['/assets/*', '/*.*', '/*'], 'Amplify manifest routing order.');
assert.deepEqual(manifest.routes[0], { path: '/assets/*', target: { kind: 'Static' } }, '/assets is served only by Static.');
assert.deepEqual(manifest.routes[1], {
  path: '/*.*',
  target: { kind: 'Static' },
  fallback: { kind: 'Compute', src: 'default' },
}, 'Files with extensions fall back from Static to Compute when absent.');
assert.deepEqual(manifest.routes[2], {
  path: '/*',
  target: { kind: 'Compute', src: 'default' },
}, 'Unknown routes use Compute without a Static fallback.');
assert.deepEqual(manifest.computeResources, [{
  name: 'default',
  entrypoint: 'entry.mjs',
  runtime: 'nodejs24.x',
}], 'Amplify compute uses the explicit Node 24 runtime.');
assert.ok(existsSync(resolve(computeRoot, 'entry.mjs')), 'The compute entry point is present.');
assert.ok(existsSync(resolve(computeRoot, 'node_modules')), 'Compute dependencies are packaged with the runtime.');
assert.deepEqual(runtimeEnvironmentNames, [...allowedRuntimeEnvironment].sort(), 'Only the approved account runtime variables are packaged.');
assert.doesNotMatch(runtimeEnvironment, /AWS_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)|-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  'The runtime environment file does not contain credentials.');

for (const path of ['sitemap.xml', 'search-index.json', 'robots.txt']) {
  const file = resolve(siteOutputRoot, path);
  assert.ok(statSync(file, { throwIfNoEntry: false })?.isFile(), `Static public file is included in the Amplify output: ${path}`);
}
const calendarFiles = readdirSync(resolve(siteOutputRoot, 'eventos')).filter((name) => name.endsWith('.ics'));
if (existsSync(resolve(siteOutputRoot, 'eventos/fixture-event.ics'))) {
  assert.ok(calendarFiles.includes('fixture-event.ics'), 'The fixture calendar remains in the static output.');
} else if (calendarFiles.length > 0) {
  assert.ok(statSync(resolve(siteOutputRoot, 'eventos', calendarFiles[0])).isFile(), 'A generated calendar remains in the static output.');
}
assert.ok(!existsSync(resolve(siteOutputRoot, '404.html')), 'The 404 page is not prerendered.');
assert.ok(!existsSync(resolve(siteOutputRoot, 'cuenta/index.html')), 'The account page is not prerendered.');

function directoryBytes(directory) {
  return readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return total + directoryBytes(path);
    return entry.isFile() ? total + statSync(path).size : total;
  }, 0);
}

const computeBytes = directoryBytes(computeRoot);
const computeLimitBytes = 220_000_000;
assert.ok(computeBytes <= computeLimitBytes,
  `Uncompressed Amplify compute bundle is ${(computeBytes / 1_000_000).toFixed(1)} MB; the limit is 220 MB.`);

const portProbe = createServer();
await new Promise((resolveListen, reject) => {
  portProbe.once('error', reject);
  portProbe.listen(0, '127.0.0.1', resolveListen);
});
const address = portProbe.address();
assert.ok(address && typeof address === 'object', 'An available local port was allocated.');
const { port } = address;
await new Promise((resolveClose, reject) => portProbe.close((error) => error ? reject(error) : resolveClose()));

const childEnvironment = {
  ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
  ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  PORT: String(port),
};
const child = spawn(process.execPath, ['entry.mjs'], {
  cwd: computeRoot,
  env: childEnvironment,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const exited = once(child, 'exit').then(([code, signal]) => ({ code, signal }));
const origin = `http://127.0.0.1:${port}`;
const runtimeOutput = { stdout: [], stderr: [] };
const maxCapturedOutputBytes = 32_768;
for (const streamName of ['stdout', 'stderr']) {
  child[streamName].on('data', (chunk) => {
    const chunks = runtimeOutput[streamName];
    chunks.push(Buffer.from(chunk));
    let capturedBytes = chunks.reduce((size, item) => size + item.length, 0);
    while (capturedBytes > maxCapturedOutputBytes && chunks.length > 0) {
      capturedBytes -= chunks.shift().length;
    }
  });
}

function sanitizedRuntimeOutput() {
  let output = ['stdout', 'stderr']
    .map((name) => runtimeOutput[name].map((chunk) => chunk.toString('utf8')).join(''))
    .filter(Boolean)
    .join('\n')
    .replace(/\b(authorization|cookie|access[_-]?token|id[_-]?token|refresh[_-]?token|client[_-]?secret|password|code|state)\s*[:=]\s*[^\s,;]+/giu, '$1=[redacted]')
    .replace(/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>#]*/gu, '$1?[redacted]');
  for (const value of runtimeEnvironmentValues) output = output.replaceAll(value, '[redacted]');
  return output.length > 8_000 ? `${output.slice(-8_000)}\n[earlier runtime output omitted]` : output;
}

async function getWhenReady(path) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Amplify compute exited before accepting requests.');
    try {
      return await fetch(new URL(path, origin), { signal: AbortSignal.timeout(1000) });
    } catch {
      await delay(50);
    }
  }
  throw new Error('Amplify compute did not accept requests within 10 seconds.');
}

let runtimeError;
try {
  const accountResponse = await getWhenReady('/cuenta/');
  const accountHtml = await accountResponse.text();
  assert.equal(accountResponse.status, 200, 'Anonymous account route is handled by the runtime.');
  assert.match(accountResponse.headers.get('cache-control') ?? '', /private[^\r\n]*no-store|no-store[^\r\n]*private/iu,
    'Account responses are private and not cached.');
  const accountRobots = accountHtml.match(/<meta name="robots" content="([^"]+)"/u)?.[1];
  assert.ok(accountRobots?.split(',').map((directive) => directive.trim()).includes('noindex'), 'Account page is not indexable.');

  const logoutResponse = await fetch(new URL('/cuenta/salir/', origin), {
    method: 'POST',
    redirect: 'manual',
    headers: {
      origin: accountOrigin,
      host: accountHost,
      'x-forwarded-host': accountHost,
      'x-forwarded-proto': 'https',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: '',
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(logoutResponse.status, 303, 'A same-origin anonymous logout passes Astro origin protection.');
  const logoutLocation = new URL(logoutResponse.headers.get('location') ?? '');
  assert.equal(logoutLocation.origin, accountOrigin, 'Anonymous logout redirects only to the configured account origin.');
  assert.equal(logoutLocation.pathname, '/cuenta/', 'Anonymous logout returns to the account page.');

  const missingResponse = await fetch(new URL('/runtime-route-that-does-not-exist', origin), {
    signal: AbortSignal.timeout(3000),
  });
  const missingHtml = await missingResponse.text();
  assert.equal(missingResponse.status, 404, 'Unknown routes retain the actual 404 status.');
  assert.match(missingHtml, /Página no encontrada/u, 'Unknown routes use the site 404 presentation.');
  assert.match(missingHtml, /<meta name="robots" content="noindex, nofollow"/u, 'The runtime 404 is not indexable.');
} catch (error) {
  runtimeError = error;
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    const stopped = await Promise.race([exited, delay(1500).then(() => null)]);
    if (!stopped && child.exitCode === null) child.kill('SIGKILL');
    if (!stopped) await exited;
  }
}

if (runtimeError) {
  const output = sanitizedRuntimeOutput();
  const details = output ? `\nRuntime diagnostics (sanitized):\n${output}` : '';
  throw new Error(`${runtimeError.message}${details}`, { cause: runtimeError });
}

console.log(`Verified Amplify manifest, static inventory, runtime environment allowlist, ${ (computeBytes / 1_000_000).toFixed(1) } MB compute bundle, and built account/404 runtime responses.`);

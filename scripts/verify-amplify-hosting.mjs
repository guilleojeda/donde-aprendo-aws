import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { configuredAccountOrigin } from '../src/lib/amplify-security.mjs';
import { getCertificationPages } from '../src/lib/certifications.mjs';
import { siteOutputRoot } from './lib/site-output.mjs';

const root = resolve('.amplify-hosting');
const computeRoot = resolve(root, 'compute/default');
const manifest = JSON.parse(readFileSync(resolve(root, 'deploy-manifest.json'), 'utf8'));
const routingRules = JSON.parse(readFileSync(resolve('config/amplify-custom-rules.json'), 'utf8'));
const accountOrigin = configuredAccountOrigin();
const accountHost = new URL(accountOrigin).host;
const allowedRuntimeEnvironment = [
  'ACCOUNT_ORIGIN',
  'COGNITO_ISSUER',
  'COGNITO_CLIENT_ID',
  'COGNITO_DOMAIN',
  'ACCOUNTS_TABLE',
  'CATALOG_TABLE',
  'CREATOR_PROFILES_TABLE',
  'CREATOR_PHOTOS_BUCKET',
  'GA4_PROPERTY_ID',
  'GA4_CREDENTIALS_SECRET_ARN',
  'CREATOR_ANALYTICS_CAPTURE_STARTED_AT',
];
const optionalRuntimeEnvironment = new Set([
  'CATALOG_TABLE',
  'GA4_PROPERTY_ID',
  'GA4_CREDENTIALS_SECRET_ARN',
  'CREATOR_ANALYTICS_CAPTURE_STARTED_AT',
]);
const requiredRuntimeEnvironment = allowedRuntimeEnvironment.filter((name) => !optionalRuntimeEnvironment.has(name));
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
const nativePhotoCheck = spawnSync(process.execPath, ['--input-type=module', '--eval',
  'import sharp from "sharp"; const b = await sharp({create:{width:2,height:2,channels:3,background:{r:30,g:40,b:50}}}).webp().toBuffer(); if ((await sharp(b).metadata()).format !== "webp") process.exit(1);',
], { cwd: computeRoot, encoding: 'utf8' });
assert.equal(nativePhotoCheck.status, 0,
  `The packaged Sharp native binary must decode and encode WebP on this deployment platform: ${nativePhotoCheck.stderr}`);
assert.ok(runtimeEnvironmentNames.every((name) => allowedRuntimeEnvironment.includes(name)),
  'Only the approved runtime variables are packaged.');
assert.ok(requiredRuntimeEnvironment.every((name) => runtimeEnvironmentNames.includes(name)),
  'All baseline runtime configuration is packaged; catalog and creator analytics configuration are optional.');
assert.doesNotMatch(runtimeEnvironment, /AWS_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)|-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
  'The runtime environment file does not contain credentials.');

const routeRule = (source, status) => routingRules.find((rule) => rule.source === source && rule.status === status);
const certificationMapRedirect = routeRule('/aprender/certificaciones', '301');
const certificationMapRewrite = routeRule('/aprender/certificaciones/', '200');
const certificationDetailRedirect = routeRule('/aprender/certificaciones/<exam>', '301');
const certificationDetailRewrite = routeRule('/aprender/certificaciones/<exam>/', '200');
assert.deepEqual(certificationMapRedirect?.target, '/aprender/certificaciones/',
  'The certification map URL without a slash redirects to its canonical path.');
assert.deepEqual(certificationMapRewrite?.target, '/aprender/certificaciones/index.html',
  'The certification map is served from its exact static index before the nested exam rule.');
assert.deepEqual(certificationDetailRedirect?.target, '/aprender/certificaciones/<exam>/',
  'Slashless certification exam URLs redirect to the canonical path without changing the query string.');
assert.deepEqual(certificationDetailRewrite?.target, '/aprender/certificaciones/<exam>/index.html',
  'Certification exam pages rewrite to their generated static HTML.');
assert.ok(!certificationDetailRedirect.target.includes('?'),
  'The canonical redirect leaves the original query string available for forwarding.');
assert.ok(routingRules.indexOf(certificationMapRewrite) < routingRules.indexOf(certificationDetailRedirect),
  'The exact certification index route precedes the parameterized exam route.');
assert.ok(routingRules.indexOf(certificationDetailRedirect) < routingRules.indexOf(certificationDetailRewrite),
  'Canonical exam redirects precede the static detail rewrite.');
assert.ok(routingRules.indexOf(certificationDetailRedirect) < routingRules.findIndex((rule) =>
  rule.source === '/aprender/<collection>' && rule.status === '301'),
  'The nested exam redirect precedes the broader collection redirect.');
assert.ok(routingRules.indexOf(certificationDetailRewrite) < routingRules.findIndex((rule) =>
  rule.source === '/aprender/<collection>/' && rule.status === '200'),
  'The nested exam rewrite precedes the broader collection rewrite.');

function assertRuntimeTheme(html, label) {
  const head = html.match(/<head\b[^>]*>[\s\S]*?<\/head>/iu)?.[0] ?? '';
  assert.ok(head, `${label} response has a document head.`);
  for (const id of ['site-theme-light', 'site-theme-dark']) {
    const styles = [...html.matchAll(new RegExp(`<style\\b[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?<\\/style>`, 'giu'))];
    assert.equal(styles.length, 1, `${label} includes exactly one ${id} palette.`);
    assert.ok(head.includes(styles[0][0]), `${label} keeps ${id} in the document head.`);
  }
  const controllers = [...html.matchAll(/<script\b[^>]*\bid="site-theme-controller"[^>]*>[\s\S]*?<\/script>/giu)];
  assert.equal(controllers.length, 1, `${label} includes exactly one shared theme controller.`);
  assert.ok(head.includes(controllers[0][0]), `${label} keeps the theme controller in the document head.`);
}

for (const path of ['sitemap.xml', 'search-index.json', 'catalog-publication.json', 'robots.txt']) {
  const file = resolve(siteOutputRoot, path);
  assert.ok(statSync(file, { throwIfNoEntry: false })?.isFile(), `Static public file is included in the Amplify output: ${path}`);
}
const publicationManifest = JSON.parse(readFileSync(resolve(siteOutputRoot, 'catalog-publication.json'), 'utf8'));
assert.deepEqual(Object.keys(publicationManifest).sort(), ['hash', 'version'], 'Amplify output keeps the publication proof minimal.');
assert.equal(publicationManifest.version, 1, 'Amplify output uses the supported publication manifest version.');
assert.match(publicationManifest.hash, /^[a-f0-9]{64}$/u, 'Amplify output includes a SHA-256 catalog hash.');
const certificationMapFile = resolve(siteOutputRoot, 'aprender/certificaciones/index.html');
assert.ok(statSync(certificationMapFile, { throwIfNoEntry: false })?.isFile(),
  'Certification map is present in the static Amplify inventory.');
for (const { path } of getCertificationPages()) {
  const file = resolve(siteOutputRoot, `${path.slice(1)}index.html`);
  assert.ok(statSync(file, { throwIfNoEntry: false })?.isFile(),
    `Registered certification detail is present in the static Amplify inventory: ${path}`);
}
const calendarFiles = readdirSync(resolve(siteOutputRoot, 'eventos')).filter((name) => name.endsWith('.ics'));
if (existsSync(resolve(siteOutputRoot, 'eventos/fixture-event.ics'))) {
  assert.ok(calendarFiles.includes('fixture-event.ics'), 'The fixture calendar remains in the static output.');
} else if (calendarFiles.length > 0) {
  assert.ok(statSync(resolve(siteOutputRoot, 'eventos', calendarFiles[0])).isFile(), 'A generated calendar remains in the static output.');
}
assert.ok(!existsSync(resolve(siteOutputRoot, '404.html')), 'The 404 page is not prerendered.');
assert.ok(!existsSync(resolve(siteOutputRoot, 'cuenta/index.html')), 'The account page is not prerendered.');
assert.ok(!existsSync(resolve(siteOutputRoot, 'cuenta/creador/index.html')), 'The creator editor is not prerendered.');
assert.ok(!existsSync(resolve(siteOutputRoot, 'cuenta/estadisticas/index.html')), 'Private creator statistics are not prerendered.');
assert.ok(!existsSync(resolve(siteOutputRoot, 'cuenta/administracion/index.html')), 'Administration is not prerendered.');

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
  // Fixture builds cannot set a live catalog table. Supply an inert identifier
  // here to exercise anonymous SSR boundaries without contacting DynamoDB.
  CATALOG_TABLE: 'hosting-verification-catalog',
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

async function getWhenReady(path, options = {}) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Amplify compute exited before accepting requests.');
    try {
      return await fetch(new URL(path, origin), {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(1000),
      });
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
  assertRuntimeTheme(accountHtml, 'Account');
  assert.match(accountResponse.headers.get('cache-control') ?? '', /private[^\r\n]*no-store|no-store[^\r\n]*private/iu,
    'Account responses are private and not cached.');
  const accountRobots = accountHtml.match(/<meta name="robots" content="([^"]+)"/u)?.[1];
  assert.ok(accountRobots?.split(',').map((directive) => directive.trim()).includes('noindex'), 'Account page is not indexable.');

  for (const path of ['/cuenta/administracion/']) {
    const response = await getWhenReady(path);
    const html = await response.text();
    assert.equal(response.status, 401, `${path} requires a real session.`);
    assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/iu);
    assert.match(html, /noindex/u);
    assert.doesNotMatch(html, /src="\/assets\/analytics\.js"/u, 'Private creator pages do not load Analytics.');
    assertRuntimeTheme(html, path);
  }
  const legacyCreator = await getWhenReady('/cuenta/creador/', { redirect: 'manual' });
  assert.equal(legacyCreator.status, 302, 'Old creator bookmarks redirect to requests in the owner workspace.');
  const creatorTarget = new URL(legacyCreator.headers.get('location'), origin);
  assert.equal(creatorTarget.origin, origin);
  assert.equal(creatorTarget.pathname, '/cuenta/');
  assert.equal(creatorTarget.search, '?vista=solicitudes');
  assert.match(legacyCreator.headers.get('cache-control') ?? '', /private.*no-store/iu);
  assert.equal(legacyCreator.headers.get('referrer-policy'), 'no-referrer');
  const legacyStatistics = await getWhenReady('/cuenta/estadisticas/?periodo=30&pagina=2', { redirect: 'manual' });
  assert.ok([301, 302, 303, 307, 308].includes(legacyStatistics.status), 'Old statistics bookmarks redirect to the owner workspace.');
  const statisticsTarget = new URL(legacyStatistics.headers.get('location'), origin);
  assert.equal(statisticsTarget.origin, origin, 'The compatibility route stays on this host.');
  assert.equal(statisticsTarget.pathname, '/cuenta/');
  assert.equal(statisticsTarget.searchParams.get('vista'), 'estadisticas');
  assert.equal(statisticsTarget.searchParams.get('periodo'), '30');
  assert.equal(statisticsTarget.searchParams.get('pagina'), '2');
  assert.match(legacyStatistics.headers.get('cache-control') ?? '', /private.*no-store/iu);
  assert.equal(legacyStatistics.headers.get('referrer-policy'), 'no-referrer');
  const statisticsEntry = await getWhenReady(`${statisticsTarget.pathname}${statisticsTarget.search}`);
  const statisticsEntryHtml = await statisticsEntry.text();
  assert.equal(statisticsEntry.status, 200, 'An anonymous statistics visit uses the normal owner sign-in entry.');
  assert.match(statisticsEntry.headers.get('cache-control') ?? '', /private.*no-store/iu);
  assert.match(statisticsEntryHtml, /noindex/u);
  assert.doesNotMatch(statisticsEntryHtml, /src="\/assets\/analytics\.js"/u);
  assertRuntimeTheme(statisticsEntryHtml, 'Statistics owner entry');
  for (const path of ['/api/creador/perfil/', '/api/admin/recursos/', '/api/creador/foto/autorizar/', '/api/creador/estadisticas/']) {
    const isPhoto = path.includes('/foto/');
    const response = await fetch(new URL(path, origin), {
      method: isPhoto ? 'POST' : 'GET',
      headers: { origin: accountOrigin, host: accountHost, 'x-forwarded-host': accountHost, 'x-forwarded-proto': 'https', 'content-type': 'application/json' },
      ...(isPhoto ? { body: '{"version":1}' } : {}),
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(response.status, 401, `${path} requires a real session.`);
    assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/iu);
  }
  const malformedCreator = await getWhenReady('/c/a/');
  assert.equal(malformedCreator.status, 404, 'An invalid public slug has a real 404.');
  assert.match(malformedCreator.headers.get('cache-control') ?? '', /no-store/iu);
  const malformedPhoto = await getWhenReady('/media/fotos/invalid.id/unknown.webp');
  assert.equal(malformedPhoto.status, 404, 'The media route rejects arbitrary identifiers.');
  const rejectedCreatorWrite = await fetch(new URL('/api/creador/perfil/', origin), {
    method: 'POST', headers: { origin: 'https://attacker.example', host: accountHost, 'x-forwarded-host': accountHost, 'x-forwarded-proto': 'https', 'content-type': 'application/x-www-form-urlencoded' },
    body: '', signal: AbortSignal.timeout(3000),
  });
  assert.equal(rejectedCreatorWrite.status, 403, 'Astro rejects a cross-origin creator write before dispatch.');
  assert.match(rejectedCreatorWrite.headers.get('cache-control') ?? '', /private.*no-store/iu);

  const rejectedLogoutResponse = await fetch(new URL('/cuenta/salir/', origin), {
    method: 'POST',
    redirect: 'manual',
    headers: {
      origin: 'https://attacker.example',
      host: accountHost,
      'x-forwarded-host': accountHost,
      'x-forwarded-proto': 'https',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: '',
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(rejectedLogoutResponse.status, 403, 'A cross-origin logout is rejected by Astro origin protection.');
  assert.match(rejectedLogoutResponse.headers.get('cache-control') ?? '', /private[^\r\n]*no-store|no-store[^\r\n]*private/iu,
    'Cross-origin account-operation errors are private and not cached.');
  assert.equal(rejectedLogoutResponse.headers.get('location'), null,
    'A rejected cross-origin logout does not redirect.');
  assert.equal(rejectedLogoutResponse.headers.get('set-cookie'), null,
    'A rejected cross-origin logout does not change session cookies.');

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

  const eventDetailResponse = await getWhenReady('/eventos/argentina?from=verify', { redirect: 'manual' });
  assert.equal(eventDetailResponse.status, 301, 'Native event detail routing adds the canonical trailing slash.');
  assert.equal(eventDetailResponse.headers.get('location'), '/eventos/argentina/?from=verify',
    'Native event detail redirects preserve the query string.');

  const missingResponse = await fetch(new URL('/runtime-route-that-does-not-exist', origin), {
    signal: AbortSignal.timeout(3000),
  });
  const missingHtml = await missingResponse.text();
  assert.equal(missingResponse.status, 404, 'Unknown routes retain the actual 404 status.');
  assertRuntimeTheme(missingHtml, 'Runtime 404');
  assert.match(missingHtml, /Página no encontrada/u, 'Unknown routes use the site 404 presentation.');
  assert.match(missingHtml, /<meta name="robots" content="noindex, nofollow"/u, 'The runtime 404 is not indexable.');

  for (const path of ['/cuenta/runtime-route-that-does-not-exist/', '/cuenta/creador/unknown/', '/cuenta/administracion/unknown/']) {
    const response = await getWhenReady(path);
    const html = await response.text();
    assert.equal(response.status, 404, `${path} retains its missing-route status.`);
    assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/iu);
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/u);
    assert.doesNotMatch(html, /src="\/assets\/analytics\.js"/u, 'Private 404 responses do not load Analytics.');
  }
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

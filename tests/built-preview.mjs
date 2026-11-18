import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { parseEnv } from 'node:util';
import { configuredAccountOrigin } from '../src/lib/amplify-security.mjs';
import { startMixedPreview } from './fixtures/mixed-preview.mjs';

const root = resolve('.');
const runtimeEntry = resolve(root, '.amplify-hosting/compute/default/entry.mjs');
const hasBuiltPreview = existsSync(runtimeEntry) && existsSync(resolve(root, '.amplify-hosting/static/index.html'));
const accountOrigin = configuredAccountOrigin();
// The production-mode CI fixture build receives these same invalid credentials.
const dummyCredentials = {
  AWS_ACCESS_KEY_ID: 'mixed-preview-dummy-access-key-not-valid',
  AWS_SECRET_ACCESS_KEY: 'mixed-preview-dummy-secret-not-valid',
  AWS_SESSION_TOKEN: 'mixed-preview-dummy-session-not-valid',
};

test('the built mixed preview serves prerendered routes and runtime routes over HTTP', async (t) => {
  assert.ok(hasBuiltPreview, 'Run `npm run build` before verifying the built preview.');
  assert.equal(process.versions.node.split('.')[0], '24', 'The mixed preview runs with Node 24.');

  const { origin: baseUrl } = await startMixedPreview(t, {
    root,
    env: {
      ...process.env,
      ACCOUNT_ORIGIN: accountOrigin,
      COGNITO_ISSUER: process.env.COGNITO_ISSUER ?? 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_preview',
      COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID ?? 'preview-client-id',
      COGNITO_DOMAIN: process.env.COGNITO_DOMAIN ?? 'https://preview.auth.us-east-1.amazoncognito.com',
      ACCOUNTS_TABLE: process.env.ACCOUNTS_TABLE ?? 'preview-accounts',
    },
  });

  const home = await fetch(new URL('/', baseUrl));
  assert.equal(home.status, 200);
  assert.ok((await home.text()).includes('<title>Aprende AWS en español'), 'The prerendered home page is served.');

  const blog = await fetch(new URL('/blog/', baseUrl));
  assert.equal(blog.status, 200);
  assert.ok((await blog.text()).includes('<h1>Guías y tutoriales AWS en español</h1>'), 'The prerendered blog index is served.');

  const prettyBlog = await fetch(new URL('/blog?from=preview', baseUrl));
  assert.equal(prettyBlog.status, 200);
  assert.ok((await prettyBlog.text()).includes('<h1>Guías y tutoriales AWS en español</h1>'),
    'Pretty directory paths keep their query string while serving the prerendered page.');

  const account = await fetch(new URL('/cuenta/', baseUrl));
  assert.equal(account.status, 200);
  assert.match(account.headers.get('cache-control') ?? '', /private/u);
  assert.match(account.headers.get('cache-control') ?? '', /no-store/u);
  const accountHtml = await account.text();
  assert.ok(accountHtml.includes('<h1>Tu cuenta</h1>'), 'The account route is rendered by Compute.');
  assert.match(accountHtml, /<meta name="robots" content="noindex(?:,\s*(?:no)?follow)?"/u);

  const asset = await fetch(new URL('/assets/site-social.png', baseUrl));
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type') ?? '', /^image\/png/u);

  const missing = await fetch(new URL('/preview-no-existe/', baseUrl));
  assert.equal(missing.status, 404);
  assert.ok((await missing.text()).includes('<h1>Página no encontrada</h1>'), 'Unknown routes receive the runtime 404 page.');

  const eventPage = await fetch(new URL('/eventos/', baseUrl));
  assert.equal(eventPage.status, 200);
  const eventHtml = await eventPage.text();
  const calendarPath = eventHtml.match(/href="(\/eventos\/[^"?#]+\.ics)"/u)?.[1];
  assert.ok(calendarPath, 'The rendered event page contains a calendar download link.');

  const canonicalEventDetail = await fetch(new URL('/eventos/argentina/?from=preview', baseUrl));
  assert.equal(canonicalEventDetail.status, 200);
  assert.match(canonicalEventDetail.headers.get('content-type') ?? '', /^text\/html(?:;|$)/u);
  assert.match(await canonicalEventDetail.text(), /<h1\b[^>]*>Eventos AWS en Argentina<\/h1>/u);

  const calendar = await fetch(new URL(calendarPath, baseUrl), { redirect: 'manual' });
  assert.equal(calendar.status, 200);
  assert.equal(calendar.headers.get('location'), null, 'A calendar file is served without a trailing-slash redirect.');
  // Amplify static hosting supplies the production MIME for generated .ics objects.
  assert.match(await calendar.text(), /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/u);

  const missingCalendar = await fetch(new URL('/eventos/no-such-file.ics', baseUrl), { redirect: 'manual' });
  assert.equal(missingCalendar.status, 404);
  assert.equal(missingCalendar.headers.get('location'), null, 'A missing calendar file remains a direct 404.');
});

test('the built mixed preview combines artifact defaults with exported overrides without rewriting the artifact', async (t) => {
  assert.ok(hasBuiltPreview, 'Run `npm run build` before verifying the built preview.');
  assert.equal(process.versions.node.split('.')[0], '24', 'The mixed preview runs with Node 24.');
  const environmentFile = resolve(root, '.amplify-hosting/compute/default/.env');
  const originalEnvironment = readFileSync(environmentFile);
  const defaults = parseEnv(originalEnvironment.toString('utf8'));
  for (const name of ['ACCOUNT_ORIGIN', 'COGNITO_ISSUER', 'COGNITO_CLIENT_ID', 'COGNITO_DOMAIN',
    'ACCOUNTS_TABLE', 'CREATOR_PROFILES_TABLE', 'CREATOR_PHOTOS_BUCKET']) {
    assert.ok(defaults[name]?.trim(), `The build supplies a nonempty default for ${name}.`);
  }
  t.after(() => assert.deepEqual(readFileSync(environmentFile), originalEnvironment,
    'Local exported configuration must not rewrite the deployment artifact.'));

  // Omit account/profile/photo settings: the actual adapter must load those
  // defaults. Export the catalog setting required by the actual creator route.
  // Anonymous authentication returns before any provider or database request.
  const env = {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
    ...dummyCredentials,
    AWS_REGION: 'us-west-2',
    AWS_EC2_METADATA_DISABLED: 'true',
    CATALOG_TABLE: 'mixed-preview-dummy-catalog',
  };
  const configured = await startMixedPreview(t, { root, env });
  const response = await fetch(new URL('/api/creador/perfil/', configured.origin), { signal: AbortSignal.timeout(3_000) });
  assert.equal(response.status, 401, 'Exported configuration reaches the real built creator runtime.');
  assert.equal((await response.json()).error, 'AUTH_REQUIRED');
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/u);
  const account = await fetch(new URL('/cuenta/', configured.origin), { signal: AbortSignal.timeout(3_000) });
  assert.equal(account.status, 200);
  const html = await account.text();
  await configured.stop();

  // A fresh child prevents singleton runtime state from masking precedence.
  // An explicit empty export must win over the artifact's valid profile table.
  const overridden = await startMixedPreview(t, { root, env: { ...env, CREATOR_PROFILES_TABLE: '' } });
  const unavailable = await fetch(new URL('/api/creador/perfil/', overridden.origin), { signal: AbortSignal.timeout(3_000) });
  assert.equal(unavailable.status, 503, 'An explicit empty export is not replaced by an artifact default.');
  assert.deepEqual(await unavailable.json(), { error: 'SERVICE_UNAVAILABLE' });
  assert.match(unavailable.headers.get('cache-control') ?? '', /private.*no-store/u);
  await overridden.stop();
  for (const value of Object.values(dummyCredentials)) {
    assert.ok(!html.includes(value), 'Credentials stay out of the rendered account document.');
    assert.ok(!`${configured.output()}${overridden.output()}`.includes(value), 'Credentials stay out of preview output.');
  }
});

test('a fresh real packaged Compute boots using only its packaged release configuration', async (t) => {
  assert.ok(hasBuiltPreview, 'Run the explicitly selected fixture build before verifying the built preview.');
  assert.equal(process.versions.node.split('.')[0], '24', 'The packaged runtime runs with Node 24.');
  // No copied account, catalog, profile, photo, analytics or credential values.
  // The actual adapter entry loads its .env before the real route initializes.
  const configured = await startMixedPreview(t, { root, env: {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    AWS_EC2_METADATA_DISABLED: 'true',
  } });
  const context = process.env.RELEASE_CONTEXT_FILE
    ? JSON.parse(readFileSync(resolve(process.env.RELEASE_CONTEXT_FILE), 'utf8')) : null;
  const previewWithoutCatalog = context?.mode === 'preview' && !context.runtimeEnvironment.CATALOG_TABLE;
  const response = await fetch(new URL('/api/creador/perfil/', configured.origin), { signal: AbortSignal.timeout(3_000) });
  assert.equal(response.status, previewWithoutCatalog ? 503 : 401,
    'Packaged creator configuration reaches its declared anonymous boundary or explicit preview degradation.');
  assert.equal((await response.json()).error, previewWithoutCatalog ? 'SERVICE_UNAVAILABLE' : 'AUTH_REQUIRED');
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/u);
  const account = await fetch(new URL('/cuenta/', configured.origin), { signal: AbortSignal.timeout(3_000) });
  assert.equal(account.status, 200, 'The same fresh Compute serves the account entry.');
  assert.match(await account.text(), /<h1\b[^>]*>Tu cuenta<\/h1>/u);
  await configured.stop();
});

function assertPrivateCache(response) {
  const directives = (response.headers.get('cache-control') ?? '').toLowerCase().split(',').map((part) => part.trim());
  assert.ok(directives.includes('private') && directives.includes('no-store'), `Private cache policy for ${response.url}`);
}

function assertPrivateApi(response) {
  assertPrivateCache(response);
  assert.match(response.headers.get('x-robots-tag') ?? '', /\bnoindex\b/iu, `Private indexing policy for ${response.url}`);
}

test('packaged private routes preserve their result and cache/robots policy across success, denial and fallback', async (t) => {
  const accountsTable = 'phase5-privacy-local-accounts';
  const token = createHash('sha256').update('phase5-local-private-session').digest('base64url');
  const csrfToken = 'phase5-local-csrf';
  const identity = {
    issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_preview',
    sub: 'disposable-privacy-owner',
  };
  const sha = (value, encoding) => createHash('sha256').update(value).digest(encoding);
  const accountId = sha(JSON.stringify([identity.issuer, identity.sub]), 'base64url');
  const binding = sha(JSON.stringify(['creator-page-recovery-v1', accountId, false]), 'hex');
  const issued = Date.now() - 60_000;
  // CI moves node_modules into Compute before running this outer HTTP test.
  // Keep the small provider fixture in DynamoDB's wire format.
  const wireIdentity = { M: { issuer: { S: identity.issuer }, sub: { S: identity.sub } } };
  const rows = new Map([
    [`SESSION#${sha(token, 'base64url')}`, {
      identity: wireIdentity,
      csrfToken: { S: csrfToken },
      epoch: { N: '0' },
      createdAt: { N: String(issued) },
      expiresAt: { N: String(issued + 900_000) },
    }],
    [`ACCOUNT#${accountId}`, {
      identity: wireIdentity,
      email: { S: 'privacy@example.invalid' },
      active: { BOOL: true },
      epoch: { N: '0' },
      authValidAfter: { N: '0' },
    }],
    [`PROFILE_OWNER#${sha(accountId, 'hex')}`, undefined],
  ]);
  const reads = [];
  const unexpected = [];
  const dynamo = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/x-amz-json-1.0');
    try {
      assert.equal(request.headers['x-amz-target'], 'DynamoDB_20120810.GetItem');
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(input.TableName, accountsTable);
      const pk = input.Key?.pk?.S;
      assert.ok(rows.has(pk), 'The fixture accepts only the known disposable account keys.');
      reads.push(pk);
      const row = rows.get(pk);
      response.end(JSON.stringify(row ? { Item: { pk: { S: pk }, ...row } } : {}));
    } catch (error) {
      unexpected.push(error.message);
      response.writeHead(400).end(JSON.stringify({ __type: 'ValidationException' }));
    }
  });
  dynamo.listen(0, '127.0.0.1');
  await once(dynamo, 'listening');
  t.after(() => new Promise((done) => dynamo.close(done)));
  const env = {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    ...dummyCredentials,
    AWS_EC2_METADATA_DISABLED: 'true',
    AWS_MAX_ATTEMPTS: '1',
    AWS_ENDPOINT_URL_DYNAMODB: `http://127.0.0.1:${dynamo.address().port}`,
    ACCOUNT_ORIGIN: 'https://dondeaprendoaws.com',
    COGNITO_ISSUER: identity.issuer,
    ACCOUNTS_TABLE: accountsTable,
    CATALOG_TABLE: 'phase5-privacy-local-catalog',
  };
  const preview = await startMixedPreview(t, { root, env });
  const get = (path, headers = {}) => fetch(new URL(path, preview.origin), {
    redirect: 'manual', headers, signal: AbortSignal.timeout(5_000),
  });
  const auth = { cookie: `da_session=${token}`, 'x-creator-page-binding': binding };
  const owner = await get('/api/creador/perfil/', auth);
  assert.equal(owner.status, 200, JSON.stringify({ reads, unexpected }));
  const ownerState = await owner.json();
  assert.equal(ownerState.profile, null);
  assert.equal(ownerState.creatorVersion, null);
  assert.deepEqual(new Set(reads), new Set(rows.keys()), 'The actual account and creator readers observed the fixture keys.');
  assert.deepEqual(unexpected, []);
  await t.test('successful owner read', () => assertPrivateApi(owner));

  for (const { name, path, headers, status, error } of [
    { name: 'owner authentication denial', path: '/api/creador/perfil/', status: 401, error: 'AUTH_REQUIRED' },
    { name: 'administrator role denial', path: '/api/admin/recursos/', headers: auth, status: 403, error: 'ADMIN_REQUIRED' },
    { name: 'photo method rejection', path: '/api/creador/foto/autorizar/', status: 405, error: 'METHOD_NOT_ALLOWED' },
    { name: 'statistics authentication denial', path: '/api/creador/estadisticas/', status: 401, error: 'AUTH_REQUIRED' },
    { name: 'unrecognized private API path', path: '/api/creador/prueba-de-ruta-inexistente/', headers: auth, status: 404, error: 'NOT_FOUND' },
  ]) {
    await t.test(name, async () => {
      const response = await get(path, headers);
      assert.equal(response.status, status);
      assert.equal((await response.json()).error, error);
      assertPrivateApi(response);
    });
  }

  const context = process.env.RELEASE_CONTEXT_FILE
    ? JSON.parse(readFileSync(resolve(process.env.RELEASE_CONTEXT_FILE), 'utf8')) : null;
  const analyticsScript = /<script\b[^>]*\bsrc=["']\/assets\/analytics\.js["']/iu;
  if (context?.mode === 'production-fixture') {
    const publicHome = await get('/');
    assert.equal(publicHome.status, 200);
    assert.match(await publicHome.text(), analyticsScript, 'Production-shaped public HTML enables the analytics bootstrap.');
  }

  for (const [name, path, status] of [
    ['account HTML', '/cuenta/', 200],
    ['private HTML fallback', '/cuenta/prueba-de-ruta-inexistente/', 404],
  ]) {
    await t.test(name, async () => {
      const response = await get(path);
      assert.equal(response.status, status);
      assertPrivateCache(response);
      const html = await response.text();
      assert.match(html, /<meta name="robots" content="noindex\b/iu);
      assert.doesNotMatch(html, analyticsScript);
    });
  }

  const outage = await startMixedPreview(t, { root, env: { ...env, CREATOR_PROFILES_TABLE: '' } });
  await t.test('creator initialization failure', async () => {
    const response = await fetch(new URL('/api/creador/perfil/', outage.origin), { signal: AbortSignal.timeout(5_000) });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'SERVICE_UNAVAILABLE' });
    assertPrivateApi(response);
  });
  assert.deepEqual(unexpected, []);
});

test('the built artifact excludes the dummy credentials supplied during the fixture build', () => {
  assert.ok(hasBuiltPreview, 'Run `npm run build` before verifying the built preview.');
  const forbidden = Object.values(dummyCredentials).map((value) => Buffer.from(value));
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (entry.isFile()) {
        const content = readFileSync(path);
        assert.ok(forbidden.every((value) => !content.includes(value)), `Build credentials must not be packaged in ${path}.`);
      }
    }
  }
  inspect(resolve(root, '.amplify-hosting'));
});

import assert from 'node:assert/strict';
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

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { configuredAccountOrigin } from '../src/lib/amplify-security.mjs';

const root = resolve('.');
const previewScript = resolve(root, 'scripts/preview.mjs');
const runtimeEntry = resolve(root, '.amplify-hosting/compute/default/entry.mjs');
const hasBuiltPreview = existsSync(runtimeEntry) && existsSync(resolve(root, '.amplify-hosting/static/index.html'));
const accountOrigin = configuredAccountOrigin();

test('the built mixed preview serves prerendered routes and runtime routes over HTTP', async (t) => {
  assert.ok(hasBuiltPreview, 'Run `npm run build` before verifying the built preview.');
  assert.equal(process.versions.node.split('.')[0], '24', 'The mixed preview runs with Node 24.');

  const output = [];
  const child = spawn(process.execPath, [previewScript, '--host', '127.0.0.1', '--port', '0'], {
    cwd: root,
    env: {
      ...process.env,
      ACCOUNT_ORIGIN: accountOrigin,
      COGNITO_ISSUER: process.env.COGNITO_ISSUER ?? 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_preview',
      COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID ?? 'preview-client-id',
      COGNITO_DOMAIN: process.env.COGNITO_DOMAIN ?? 'https://preview.auth.us-east-1.amazoncognito.com',
      ACCOUNTS_TABLE: process.env.ACCOUNTS_TABLE ?? 'preview-accounts',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => output.push(chunk));
  }

  const outputText = () => output.join('');
  const exited = once(child, 'exit').then(([code, signal]) => ({ code, signal }));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    const stopped = await Promise.race([exited, delay(2_000).then(() => null)]);
    if (!stopped) {
      child.kill('SIGKILL');
      await exited;
    }
  });

  let baseUrl;
  const startup = (async () => {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const ready = /Mixed Astro preview ready at http:\/\/127\.0\.0\.1:(\d+)/u.exec(outputText());
      if (ready) return `http://127.0.0.1:${ready[1]}`;
      const exit = await Promise.race([exited, delay(25).then(() => null)]);
      if (exit) throw new Error(`Preview exited before becoming ready (${exit.code ?? exit.signal}).\n${outputText()}`);
    }
    throw new Error(`Preview did not become ready within 12 seconds.\n${outputText()}`);
  })();
  baseUrl = await startup;

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

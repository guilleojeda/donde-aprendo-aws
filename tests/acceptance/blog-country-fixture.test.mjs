import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';

const ROOT = resolve(import.meta.dirname, '../..');
const PREVIEW_CONTEXT = join(ROOT, 'tests/fixtures/release-preview-context.json');
const COMMUNITY_ID = 'meetup-22667715';
const EVENT_ID = 'meetup-event-316732293';
const ARTICLE_ID = 'phase6-country-fixture';
const COMMUNITY_TARGET = `#resource-${COMMUNITY_ID}`;
const EVENT_TARGET = `#event-${EVENT_ID}`;

const community = {
  id: COMMUNITY_ID,
  title: 'AWS User Group Panamá',
  url: 'https://www.meetup.com/aws-user-group-panama/',
  description: 'Comunidad AWS de Panamá.',
  category: 'Comunidad',
  kind: 'community',
  format: 'User Group',
  topics: ['Comunidad'],
  country: 'PA',
  order: 50,
  featured: false,
  published: true,
};

const event = {
  recordType: 'event',
  id: EVENT_ID,
  title: 'AWS Community Day Panamá',
  description: 'Encuentro de seguridad y datos.',
  startsAt: '2099-11-14T08:00:00-05:00',
  endsAt: '2099-11-14T13:00:00-05:00',
  timeZone: 'America/Panama',
  organizer: 'AWS User Group Panamá',
  mode: 'in-person',
  place: 'Ciudad de Panamá',
  city: 'Ciudad de Panamá',
  country: 'PA',
  communityId: COMMUNITY_ID,
  registrationUrl: 'https://example.com/panama-event',
  published: true,
};

const article = `---
title: "Fixture de rutas nacionales"
description: "Fixture de aceptación para enlaces de catálogo."
author: "guille-ojeda"
publishedAt: "2026-01-01"
publishedTimestamp: "2026-01-01T00:00:00.000Z"
cover: "/assets/blog/editorial-fundamentos.png"
coverAlt: "Un libro abierto junto a un camino azul con estaciones y un punto naranja."
ogImage: "/assets/blog/editorial-fundamentos.png"
related: []
---

## Fixture nacional

Este texto conserva una imagen local y dos destinos con estado de filtro:

![Cost Explorer](/assets/blog/61560601aa30cbebf1b2815d.jpg)

- [Comunidad de Panamá](/comunidades/panama/?format=User+Group#resource-${COMMUNITY_ID})
- [Agenda de Panamá](/eventos/panama/?view=month&date=2099-11-14&tz=America%2FPanama&mode=in-person&community=${COMMUNITY_ID}#event-${EVENT_ID})
`;

function catalogFor({ includeCommunity }) {
  const source = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/catalog.json'), 'utf8'));
  return includeCommunity ? [...source, community, event] : [...source, event];
}

async function makeScratch() {
  const scratch = await mkdtemp('/tmp/donde-aprendo-blog-country-');
  const ignored = new Set(['.git', '.work', '.amplify-hosting', '.astro', 'node_modules', 'test-results', 'playwright-report', 'tests', 'docs', 'infra', '.github']);
  await cp(ROOT, scratch, {
    recursive: true,
    filter(source) {
      return !source.split('/').some((part) => ignored.has(part));
    },
  });
  await symlink(join(ROOT, 'node_modules'), join(scratch, 'node_modules'), 'dir');
  await writeFile(join(scratch, 'src/content/blog', `${ARTICLE_ID}.md`), article);
  return scratch;
}

function buildEnvironment({ catalogPath, context }) {
  return {
    ...process.env,
    CATALOG_FIXTURE: catalogPath,
    RELEASE_CONTEXT_FILE: PREVIEW_CONTEXT,
    PUBLIC_SUBMISSION_API_URL: context.submissionApiUrl,
    PUBLIC_PRODUCTION: 'false',
    PUBLIC_SITE_ORIGIN: context.siteOrigin,
    ...context.runtimeEnvironment,
    AWS_ACCESS_KEY_ID: 'phase6-blog-fixture-access',
    AWS_SECRET_ACCESS_KEY: 'phase6-blog-fixture-secret',
    AWS_SESSION_TOKEN: 'phase6-blog-fixture-session',
    AWS_REGION: 'us-east-1',
    AWS_EC2_METADATA_DISABLED: 'true',
  };
}

async function build(scratch, catalogPath, context) {
  const child = spawn('npm', ['run', 'build'], {
    cwd: scratch,
    env: buildEnvironment({ catalogPath, context }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const [code, signal] = await once(child, 'exit');
  assert.equal(signal, null, `scratch build did not exit normally:\n${output}`);
  assert.equal(code, 0, `scratch build failed:\n${output}`);
  return { output, root: join(scratch, '.amplify-hosting/static') };
}

function hrefForLabel(html, label) {
  const href = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)]
    .find(([, , content]) => content.replace(/<[^>]*>/gu, '').trim() === label)?.[1];
  return href?.replaceAll('&amp;', '&').replaceAll('&quot;', '"');
}

function assertUrlParts(actualHref, { pathname, search, hash }, label) {
  const actual = new URL(actualHref, 'https://dondeaprendoaws.com');
  assert.equal(actual.pathname, pathname, `${label}: path`);
  assert.deepEqual([...actual.searchParams.entries()].sort(), [...new URLSearchParams(search).entries()].sort(), `${label}: query state`);
  assert.equal(actual.hash, hash, `${label}: fragment`);
}

test('the real Astro article fixture keeps valid national query/hash state and drops stale targets', async (t) => {
  const scratch = await makeScratch();
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const context = JSON.parse(await readFile(PREVIEW_CONTEXT, 'utf8'));
  const validCatalog = join(scratch, 'valid-catalog.json');
  const withdrawnCatalog = join(scratch, 'withdrawn-catalog.json');
  await writeFile(validCatalog, `${JSON.stringify(catalogFor({ includeCommunity: true }), null, 2)}\n`);
  await writeFile(withdrawnCatalog, `${JSON.stringify(catalogFor({ includeCommunity: false }), null, 2)}\n`);

  const valid = await build(scratch, validCatalog, context);
  const validHtml = await readFile(join(valid.root, 'blog', ARTICLE_ID, 'index.html'), 'utf8');
  assertUrlParts(hrefForLabel(validHtml, 'Comunidad de Panamá'), {
    pathname: '/comunidades/panama/', search: 'format=User+Group', hash: COMMUNITY_TARGET,
  }, 'valid community destination');
  assertUrlParts(hrefForLabel(validHtml, 'Agenda de Panamá'), {
    pathname: '/eventos/panama/',
    search: `view=month&date=2099-11-14&tz=America%2FPanama&mode=in-person&community=${COMMUNITY_ID}`,
    hash: EVENT_TARGET,
  }, 'valid event destination');
  assert.match(await readFile(join(valid.root, 'comunidades/panama/index.html'), 'utf8'), new RegExp(`id="resource-${COMMUNITY_ID}"`));
  assert.match(await readFile(join(valid.root, 'eventos/panama/index.html'), 'utf8'), new RegExp(`id="event-${EVENT_ID}"`));

  const withdrawn = await build(scratch, withdrawnCatalog, context);
  const withdrawnHtml = await readFile(join(withdrawn.root, 'blog', ARTICLE_ID, 'index.html'), 'utf8');
  const failures = [];
  const withdrawnCommunityHref = hrefForLabel(withdrawnHtml, 'Comunidad de Panamá');
  const withdrawnEventHref = hrefForLabel(withdrawnHtml, 'Agenda de Panamá');
  try {
    assertUrlParts(withdrawnCommunityHref, {
      pathname: '/comunidades/', search: 'format=User+Group', hash: '',
    }, 'community fallback');
  } catch (error) {
    failures.push(error.message);
  }
  try {
    assertUrlParts(withdrawnEventHref, {
      pathname: '/eventos/', search: 'view=month&date=2099-11-14&tz=America%2FPanama&mode=in-person', hash: EVENT_TARGET,
    }, 'event fallback');
  } catch (error) {
    failures.push(error.message);
  }
  try {
    assert.notEqual(withdrawnCommunityHref, `/comunidades/panama/?format=User+Group${COMMUNITY_TARGET}`);
  } catch (error) {
    failures.push(`stale community target removal: ${error.message}`);
  }
  try {
    assert.notEqual(withdrawnEventHref, `/eventos/panama/?view=month&date=2099-11-14&tz=America%2FPanama&mode=in-person&community=${COMMUNITY_ID}${EVENT_TARGET}`);
  } catch (error) {
    failures.push(`stale event target removal: ${error.message}`);
  }
  if (failures.length) throw new Error(failures.join('\n'));
});

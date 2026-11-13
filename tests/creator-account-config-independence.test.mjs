import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, mock, test } from 'node:test';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getAccountAuth } from '../src/lib/account-runtime.mjs';
import { compileCreatorAstroRoutes } from './fixtures/creator-astro-route.mjs';
import { createCreatorOwnerAstroContainer } from './fixtures/creator-owner-astro-container.mjs';

const SITE_ORIGIN = 'https://dondeaprendoaws.com';
const ACCOUNTS_TABLE = 'account-only-config-test';
const IDENTITY = { issuer: 'https://issuer.example.test', sub: 'account-only-user' };
const SESSION_TOKEN = 's'.repeat(43);
const CSRF_TOKEN = 'c'.repeat(43);
const CREATOR_AND_ANALYTICS_SETTINGS = [
  'CREATOR_PROFILES_TABLE',
  'CREATOR_PHOTOS_BUCKET',
  'CATALOG_TABLE',
  'GA4_PROPERTY_ID',
  'GA4_CREDENTIALS_SECRET_ARN',
  'CREATOR_ANALYTICS_CAPTURE_STARTED_AT',
];
const accountSettings = {
  ACCOUNT_ORIGIN: SITE_ORIGIN,
  COGNITO_ISSUER: IDENTITY.issuer,
  COGNITO_CLIENT_ID: 'account-only-client',
  COGNITO_DOMAIN: 'https://auth.example.test',
  ACCOUNTS_TABLE,
  AWS_REGION: 'us-east-1',
};
const previousEnvironment = new Map([
  ...Object.keys(accountSettings),
  ...CREATOR_AND_ANALYTICS_SETTINGS,
].map((name) => [name, process.env[name]]));
for (const [name, value] of Object.entries(accountSettings)) process.env[name] = value;
for (const name of CREATOR_AND_ANALYTICS_SETTINGS) delete process.env[name];

function sha(value, encoding = 'hex') {
  return createHash('sha256').update(value, 'utf8').digest(encoding);
}

const accountId = sha(JSON.stringify([IDENTITY.issuer, IDENTITY.sub]), 'base64url');
const accountPk = `ACCOUNT#${accountId}`;
const sessionPk = `SESSION#${sha(SESSION_TOKEN, 'base64url')}`;
const rows = new Map();
const storageCalls = [];
const documentClient = {
  async send(command) {
    const commandName = command.constructor.name;
    const input = structuredClone(command.input);
    storageCalls.push({ commandName, input });
    if (input.TableName !== ACCOUNTS_TABLE) throw new Error(`unexpected table ${input.TableName}`);
    if (commandName === 'GetCommand') {
      const item = rows.get(input.Key.pk);
      return item ? { Item: structuredClone(item) } : {};
    }
    if (commandName === 'DeleteCommand') {
      const item = rows.get(input.Key.pk);
      rows.delete(input.Key.pk);
      return item ? { Attributes: structuredClone(item) } : {};
    }
    throw new Error(`unexpected account-store command ${commandName}`);
  },
};

function seedValidSession() {
  rows.clear();
  const now = Date.now();
  rows.set(accountPk, {
    pk: accountPk,
    identity: IDENTITY,
    active: true,
    epoch: 4,
    authValidAfter: 0,
    email: 'owner@account-only.example.test',
    isAdmin: false,
  });
  rows.set(sessionPk, {
    pk: sessionPk,
    identity: IDENTITY,
    epoch: 4,
    createdAt: now - 60_000,
    expiresAt: now + 60 * 60_000,
    csrfToken: CSRF_TOKEN,
  });
}

function beginObservation() {
  storageCalls.length = 0;
}

function reads() {
  const gets = storageCalls.filter(({ commandName }) => commandName === 'GetCommand');
  return {
    session: gets.filter(({ input }) => input.Key?.pk?.startsWith('SESSION#')).length,
    account: gets.filter(({ input }) => input.Key?.pk?.startsWith('ACCOUNT#')).length,
    deletes: storageCalls.filter(({ commandName }) => commandName === 'DeleteCommand').length,
  };
}

function assertCreatorAndAnalyticsSettingsAbsent() {
  for (const name of CREATOR_AND_ANALYTICS_SETTINGS) assert.equal(process.env[name], undefined, `${name} stays absent`);
}

mock.method(DynamoDBDocumentClient, 'from', () => documentClient);
const accountAuth = getAccountAuth();
assert.ok(accountAuth, 'the production account runtime initializes with account-only configuration');

const compiled = await compileCreatorAstroRoutes({
  account: 'src/pages/cuenta/index.astro',
  logout: 'src/pages/cuenta/salir/index.astro',
}, { siteOrigin: SITE_ORIGIN });
const { account: accountRoute, logout: logoutRoute } = compiled.routes;
const container = await createCreatorOwnerAstroContainer({ astroConfig: { site: SITE_ORIGIN } });

after(async () => {
  await compiled.cleanup();
  mock.restoreAll();
  for (const [name, value] of previousEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

async function render(route, pathname, init = {}) {
  const response = await container.renderToResponse(route, {
    request: new Request(new URL(pathname, SITE_ORIGIN), init),
    partial: false,
  });
  return { response, html: await response.text() };
}

test('account entry, signed-in fallback, and actual logout work without creator or Analytics configuration', async () => {
  assertCreatorAndAnalyticsSettingsAbsent();

  beginObservation();
  const entry = await render(accountRoute.default, '/cuenta/');
  assert.equal(entry.response.status, 200);
  assert.match(entry.response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.match(entry.html, /<h1>Tu cuenta<\/h1>/);
  assert.match(entry.html, /href="\/cuenta\/ingresar\/"/);
  assert.deepEqual(reads(), { session: 0, account: 0, deletes: 0 });
  assertCreatorAndAnalyticsSettingsAbsent();

  seedValidSession();
  beginObservation();
  const unavailableOwner = await render(accountRoute.default, '/cuenta/', {
    headers: { cookie: `da_session=${SESSION_TOKEN}` },
  });
  assert.equal(unavailableOwner.response.status, 503,
    'a valid account session remains real even though owner data cannot load without creator configuration');
  assert.match(unavailableOwner.html, /No pudimos cargar tu página/);
  assert.doesNotMatch(unavailableOwner.html, /data-creator-owner/);
  assert.deepEqual(reads(), { session: 1, account: 1, deletes: 0 });
  assertCreatorAndAnalyticsSettingsAbsent();

  beginObservation();
  const logout = await render(logoutRoute.default, '/cuenta/salir/', {
    method: 'POST',
    headers: {
      cookie: `da_session=${SESSION_TOKEN}`,
      origin: SITE_ORIGIN,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ csrfToken: CSRF_TOKEN }).toString(),
  });
  assert.equal(logout.response.status, 303);
  assert.match(logout.response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(logout.response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(logout.response.headers.get('x-content-type-options'), 'nosniff');
  const destination = new URL(logout.response.headers.get('location'));
  assert.equal(destination.origin, 'https://auth.example.test');
  assert.equal(destination.pathname, '/logout');
  assert.equal(destination.searchParams.get('client_id'), 'account-only-client');
  assert.equal(destination.searchParams.get('logout_uri'), `${SITE_ORIGIN}/cuenta/`);
  assert.match(logout.response.headers.get('set-cookie') ?? '', /da_session=;/);
  assert.deepEqual(reads(), { session: 1, account: 1, deletes: 1 });
  assert.equal(rows.has(sessionPk), false, 'the actual account store delete removed the physical session');
  assertCreatorAndAnalyticsSettingsAbsent();

  beginObservation();
  const afterLogout = await render(accountRoute.default, '/cuenta/', {
    headers: { cookie: `da_session=${SESSION_TOKEN}` },
  });
  assert.equal(afterLogout.response.status, 200);
  assert.match(afterLogout.html, /<h1>Tu cuenta<\/h1>/);
  assert.deepEqual(reads(), { session: 1, account: 0, deletes: 0 });
  assertCreatorAndAnalyticsSettingsAbsent();
});

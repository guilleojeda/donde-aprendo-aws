import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, mock, test } from 'node:test';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getCreatorRuntime } from '../src/lib/creator-runtime.mjs';
import { compileCreatorAstroRoutes } from './fixtures/creator-astro-route.mjs';
import { createCreatorOwnerAstroContainer } from './fixtures/creator-owner-astro-container.mjs';

const SITE_ORIGIN = 'https://dondeaprendoaws.com';
const TABLES = {
  accounts: 'phase3-accounts',
  profiles: 'phase3-profiles',
  catalog: 'phase3-catalog',
};
const PROFILE_ID = 'phase3-owner-profile';
const RESOURCE_ID = 'phase3-owner-resource';
const OWNER_PHYSICAL_SENTINEL = 'private-physical-owner-sentinel';
const OWNER_IDENTITY = { issuer: 'https://issuer.example.test', sub: 'owner-identity-private' };
const ADMIN_IDENTITY = { issuer: 'https://issuer.example.test', sub: 'admin-identity-private' };
const OWNER_SESSION = 'o'.repeat(43);
const ADMIN_SESSION = 'a'.repeat(43);
const OWNER_CSRF = 'c'.repeat(43);
const ADMIN_CSRF = 'd'.repeat(43);

const serverEnvironment = {
  ACCOUNT_ORIGIN: SITE_ORIGIN,
  COGNITO_ISSUER: 'https://issuer.example.test',
  COGNITO_CLIENT_ID: 'phase3-client',
  COGNITO_DOMAIN: 'https://auth.example.test',
  ACCOUNTS_TABLE: TABLES.accounts,
  CREATOR_PROFILES_TABLE: TABLES.profiles,
  CATALOG_TABLE: TABLES.catalog,
  CREATOR_PHOTOS_BUCKET: 'phase3-test-photos',
  AWS_REGION: 'us-east-1',
};
const optionalAnalyticsEnvironment = [
  'GA4_PROPERTY_ID',
  'GA4_CREDENTIALS_SECRET_ARN',
  'CREATOR_ANALYTICS_CAPTURE_STARTED_AT',
];
const previousEnvironment = new Map([
  ...Object.keys(serverEnvironment),
  ...optionalAnalyticsEnvironment,
].map((name) => [name, process.env[name]]));
for (const [name, value] of Object.entries(serverEnvironment)) process.env[name] = value;
for (const name of optionalAnalyticsEnvironment) delete process.env[name];

function sha(value, encoding = 'hex') {
  return createHash('sha256').update(value, 'utf8').digest(encoding);
}

function keyOf(table, key) {
  if (table === TABLES.catalog) return `id:${key.id}`;
  return `${key.pk}\u0000${key.sk ?? ''}`;
}

function projected(item, parameters) {
  const expression = parameters.ProjectionExpression;
  if (typeof expression !== 'string') return structuredClone(item);
  const names = parameters.ExpressionAttributeNames ?? {};
  const result = {};
  for (const token of expression.split(',').map((part) => part.trim())) {
    const field = names[token] ?? token;
    if (Object.hasOwn(item, field)) result[field] = structuredClone(item[field]);
  }
  return result;
}

const rows = new Map(Object.values(TABLES).map((table) => [table, new Map()]));
const storageCalls = [];
const documentClient = {
  async send(command) {
    const commandName = command.constructor.name;
    const input = structuredClone(command.input);
    storageCalls.push({ commandName, input });
    const tableName = input.TableName ?? Object.keys(input.RequestItems ?? {})[0];
    const tableRows = rows.get(tableName);
    if (!tableRows) throw new Error(`unexpected table ${tableName}`);

    if (commandName === 'GetCommand') {
      const item = tableRows.get(keyOf(input.TableName, input.Key));
      return item ? { Item: structuredClone(item) } : {};
    }
    if (commandName === 'QueryCommand') {
      const values = input.ExpressionAttributeValues ?? {};
      const names = input.ExpressionAttributeNames ?? {};
      const partitionKey = names['#pk'] ?? 'pk';
      const sortKey = names['#sk'] ?? 'sk';
      const wantedPartition = values[':pk'];
      const sortPrefix = values[':sk'];
      const items = [...tableRows.values()]
        .filter((item) => item[partitionKey] === wantedPartition
          && (sortPrefix === undefined || (typeof item[sortKey] === 'string' && item[sortKey].startsWith(sortPrefix))))
        .sort((left, right) => String(left[sortKey] ?? '').localeCompare(String(right[sortKey] ?? '')))
        .map((item) => projected(item, input));
      return { Items: items };
    }
    if (commandName === 'ScanCommand') {
      return { Items: [...tableRows.values()].map((item) => projected(item, input)) };
    }
    if (commandName === 'BatchGetCommand') {
      const tableRequest = input.RequestItems?.[tableName];
      if (!tableRequest || !Array.isArray(tableRequest.Keys)) throw new Error('invalid batch-get request');
      const items = tableRequest.Keys.flatMap((key) => {
        const item = tableRows.get(keyOf(tableName, key));
        return item ? [projected(item, tableRequest)] : [];
      });
      return { Responses: { [tableName]: items } };
    }
    throw new Error(`unexpected DynamoDB command ${commandName}`);
  },
};

function seed(table, item) {
  const key = table === TABLES.catalog ? { id: item.id } : { pk: item.pk, sk: item.sk };
  rows.get(table).set(keyOf(table, key), structuredClone(item));
}

function sessionSeed(name, identity, token, csrfToken, isAdmin) {
  const accountId = sha(JSON.stringify([identity.issuer, identity.sub]), 'base64url');
  const accountPk = `ACCOUNT#${accountId}`;
  const sessionPk = `SESSION#${sha(token, 'base64url')}`;
  const account = {
    pk: accountPk,
    identity,
    active: true,
    epoch: 7,
    authValidAfter: 0,
    email: `${name}@private.example.test`,
    isAdmin,
  };
  const session = {
    pk: sessionPk,
    identity,
    epoch: 7,
    createdAt: Date.now() - 60_000,
    expiresAt: Date.now() + 60 * 60_000,
    csrfToken,
  };
  seed(TABLES.accounts, account);
  seed(TABLES.accounts, session);
  return { accountId, accountPk, sessionPk, account, session, token };
}

function seedScenario({ published = true } = {}) {
  for (const table of rows.values()) table.clear();
  const owner = sessionSeed('owner', OWNER_IDENTITY, OWNER_SESSION, OWNER_CSRF, false);
  const admin = sessionSeed('admin', ADMIN_IDENTITY, ADMIN_SESSION, ADMIN_CSRF, true);
  seed(TABLES.accounts, {
    pk: `PROFILE_OWNER#${sha(owner.accountId)}`,
    recordType: 'accountProfile',
    profileId: PROFILE_ID,
    version: 1,
  });
  seed(TABLES.profiles, {
    pk: `PROFILE#${PROFILE_ID}`,
    sk: 'META',
    recordType: 'profile',
    id: PROFILE_ID,
    displayName: 'Ana de Lambda',
    slug: 'ana-de-lambda',
    city: 'Córdoba',
    country: 'Argentina',
    programs: ['Community Builders'],
    bio: 'Perfil servido desde datos físicos de prueba.',
    socials: {},
    published,
    hidden: false,
    version: 3,
    createdAt: Date.now() - 5_000,
    updatedAt: Date.now() - 1_000,
    internalAudit: OWNER_PHYSICAL_SENTINEL,
  });
  seed(TABLES.profiles, {
    pk: `PROFILE#${PROFILE_ID}`,
    sk: 'PLACEMENT#placement-owner-resource',
    recordType: 'placement',
    id: 'placement-owner-resource',
    profileId: PROFILE_ID,
    resourceId: RESOURCE_ID,
    position: 10,
    featured: false,
    selectedForDirectory: false,
    version: 2,
  });
  seed(TABLES.profiles, {
    pk: 'ADMIN#CLAIMS',
    sk: 'CLAIM#phase3-claim',
    recordType: 'claim',
    id: 'phase3-claim',
    profileId: PROFILE_ID,
    accountId: 'claimant-physical-account',
    resourceIds: [RESOURCE_ID],
    resources: [{ resourceId: RESOURCE_ID, url: 'https://catalog.example.test/owned' }],
    sourceId: 'source-physical-id',
    evidence: 'Solicitud visible solo en administración.',
    status: 'pending',
    createdAt: 1_700_000_000_000,
    version: 6,
    internalAudit: OWNER_PHYSICAL_SENTINEL,
  });
  seed(TABLES.catalog, {
    id: RESOURCE_ID,
    title: 'Recurso propio de Ana',
    url: 'https://catalog.example.test/owned',
    description: 'Material público revisado.',
    category: 'AWS',
    kind: 'content',
    format: 'guide',
    topics: ['compute'],
    published: false,
    hidden: false,
    directoryControl: 'creator',
    editorProfileId: PROFILE_ID,
    sourceId: 'source-physical-id',
    version: 4,
    internalAudit: OWNER_PHYSICAL_SENTINEL,
  });
  seed(TABLES.catalog, {
    id: 'resource-unowned-private',
    title: 'Recurso de otro creador',
    url: 'https://catalog.example.test/other',
    published: false,
    hidden: false,
    version: 1,
  });
  storageCalls.length = 0;
  return { owner, admin };
}

mock.method(DynamoDBDocumentClient, 'from', () => documentClient);
const runtime = getCreatorRuntime();
const originalServiceHandle = runtime.service.handle;
const serviceDispatches = [];
runtime.service.handle = async function observedServiceHandle(...args) {
  const [request] = args;
  serviceDispatches.push(new URL(request.url).pathname);
  return originalServiceHandle.apply(runtime.service, args);
};

const compiled = await compileCreatorAstroRoutes({
  account: 'src/pages/cuenta/index.astro',
  admin: 'src/pages/cuenta/administracion/index.astro',
  creatorApi: 'src/pages/api/creador/[...path].ts',
  adminApi: 'src/pages/api/admin/[...path].ts',
  statisticsApi: 'src/pages/api/creador/estadisticas/index.ts',
}, { siteOrigin: SITE_ORIGIN });
const { account: accountRoute, admin: adminRoute, creatorApi, adminApi, statisticsApi } = compiled.routes;
const container = await createCreatorOwnerAstroContainer({ astroConfig: { site: SITE_ORIGIN } });

after(async () => {
  runtime.service.handle = originalServiceHandle;
  await compiled.cleanup();
  mock.restoreAll();
  for (const [name, value] of previousEnvironment) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function beginRequestObservation() {
  storageCalls.length = 0;
  serviceDispatches.length = 0;
}

function request(pathname, token) {
  return new Request(new URL(pathname, SITE_ORIGIN), {
    headers: token ? { cookie: `da_session=${token}` } : {},
  });
}

function observedReads() {
  const gets = storageCalls.filter(({ commandName }) => commandName === 'GetCommand');
  return {
    session: gets.filter(({ input }) => input.Key?.pk?.startsWith('SESSION#')).length,
    account: gets.filter(({ input }) => input.Key?.pk?.startsWith('ACCOUNT#')).length,
    collections: storageCalls.filter(({ commandName }) => ['QueryCommand', 'ScanCommand', 'BatchGetCommand'].includes(commandName)).length,
    serviceDispatches: [...serviceDispatches],
  };
}

function assertOneAuthenticationResolution() {
  const reads = observedReads();
  assert.equal(reads.session, 1, `expected one physical session read, observed ${JSON.stringify(reads)}`);
  assert.equal(reads.account, 1, `expected one physical account read, observed ${JSON.stringify(reads)}`);
}

function assertSingleSsrContext() {
  const reads = observedReads();
  assert.deepEqual({
    session: reads.session,
    account: reads.account,
    serviceDispatches: reads.serviceDispatches,
  }, {
    session: 1,
    account: 1,
    serviceDispatches: [],
  }, `SSR should resolve one session/principal and query directly; observed ${JSON.stringify(reads)}`);
}

function assertPrivateHeaders(response) {
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

async function render(route, pathname, token) {
  const response = await container.renderToResponse(route, {
    request: request(pathname, token),
    partial: false,
  });
  return { response, html: await response.text() };
}

async function api(route, pathname, token) {
  return route.ALL({ request: request(pathname, token) });
}

function adminInitialData(html) {
  const match = html.match(/<script\b[^>]*id="creator-admin-data"[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'the actual admin page should render its initial data boundary');
  return JSON.parse(match[1]);
}

test('actual owner SSR renders its owned, safe data and uses one request context', async () => {
  const { owner } = seedScenario();
  beginRequestObservation();

  const { response, html } = await render(accountRoute.default, '/cuenta/', owner.token);

  assert.equal(response.status, 200);
  assertPrivateHeaders(response);
  assert.match(html, /name="robots"[^>]*noindex/i);
  assert.match(html, /owner@private\.example\.test/);
  assert.match(html, /Ana de Lambda/);
  assert.match(html, /Recurso propio de Ana/);
  assert.doesNotMatch(html, /Recurso de otro creador/);
  for (const privateValue of [owner.accountId, OWNER_IDENTITY.sub, owner.token, OWNER_PHYSICAL_SENTINEL]) {
    assert.doesNotMatch(html, new RegExp(privateValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assertSingleSsrContext();
});

test('published statistics SSR keeps the owner page and truthful unavailable detail without an internal API request', async () => {
  const { owner } = seedScenario({ published: true });
  beginRequestObservation();

  const { response, html } = await render(accountRoute.default, '/cuenta/?vista=estadisticas&periodo=7&pagina=1', owner.token);

  assert.equal(response.status, 503, 'missing optional Analytics configuration remains an unavailable private detail');
  assertPrivateHeaders(response);
  assert.match(html, /data-creator-owner/);
  assert.match(html, /Ana de Lambda/);
  assert.match(html, /No pudimos cargar tus estadísticas/);
  assertSingleSsrContext();
});

test('actual admin SSR authorizes before private collections and keeps the page DTO allowlist', async () => {
  const { admin } = seedScenario();
  beginRequestObservation();

  const { response, html } = await render(adminRoute.default, '/cuenta/administracion/', admin.token);

  assert.equal(response.status, 200);
  assertPrivateHeaders(response);
  assert.match(html, /Creadores y recursos/);
  const initial = adminInitialData(html);
  assert.deepEqual(initial.resources.map(({ id }) => id), [RESOURCE_ID, 'resource-unowned-private']);
  assert.deepEqual(initial.profiles.map(({ id }) => id), [PROFILE_ID]);
  assert.equal(initial.claims.length, 1);
  assert.equal(initial.claims[0].id, 'phase3-claim');
  assert.equal(Object.hasOwn(initial.claims[0], 'profileId'), false,
    'admin SSR does not widen the established claim projection with the private API profile binding');
  assert.equal(Object.hasOwn(initial.claims[0], 'version'), false,
    'admin SSR does not widen its claim projection with the API-only claim version');
  assert.equal(JSON.stringify(initial).includes(OWNER_PHYSICAL_SENTINEL), false);
  assert.equal(JSON.stringify(initial).includes('admin-identity-private'), false);
  assertSingleSsrContext();
});

test('actual owner GET API uses the same private owner query and one fresh authentication resolution', async () => {
  const { owner } = seedScenario();
  beginRequestObservation();

  const response = await api(creatorApi, '/api/creador/perfil/', owner.token);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(payload.profile.id, PROFILE_ID);
  assert.equal(payload.profile.displayName, 'Ana de Lambda');
  assert.deepEqual(payload.links.map(({ resourceId }) => resourceId), [RESOURCE_ID]);
  assert.equal(JSON.stringify(payload).includes(OWNER_PHYSICAL_SENTINEL), false);
  assert.equal(JSON.stringify(payload).includes(owner.accountId), false);
  assertOneAuthenticationResolution();
  assert.deepEqual(serviceDispatches, ['/api/creador/perfil/']);
});

test('actual admin GET API uses the production adapter and an owner is rejected before collection reads', async () => {
  const { owner, admin } = seedScenario();

  beginRequestObservation();
  const forbidden = await api(adminApi, '/api/admin/recursos/', owner.token);
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error, 'ADMIN_REQUIRED');
  assert.match(forbidden.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(forbidden.headers.get('x-content-type-options'), 'nosniff');
  assertOneAuthenticationResolution();
  assert.equal(observedReads().collections, 0, 'a current non-admin does not query private admin collections');
  assert.deepEqual(serviceDispatches, ['/api/admin/recursos/']);

  beginRequestObservation();
  const response = await api(adminApi, '/api/admin/recursos/', admin.token);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(payload.resources.length, 2, 'the authorized API retains its complete admin resource collection');
  assert.ok(payload.resources.some(({ id }) => id === RESOURCE_ID));
  assert.equal(JSON.stringify(payload).includes(OWNER_PHYSICAL_SENTINEL), false);
  assertOneAuthenticationResolution();
  assert.deepEqual(serviceDispatches, ['/api/admin/recursos/']);
});

test('actual statistics GET keeps its private unavailable response and authenticates once', async () => {
  const { owner } = seedScenario({ published: true });
  beginRequestObservation();

  const response = await api(statisticsApi, '/api/creador/estadisticas/?periodo=7&pagina=1', owner.token);
  const payload = await response.json();

  assert.equal(response.status, 503);
  assert.equal(payload.error, 'STATISTICS_UNAVAILABLE');
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assertOneAuthenticationResolution();
  assert.deepEqual(serviceDispatches, ['/api/creador/estadisticas/']);
});

test('a subsequent account request observes the current role', async () => {
  const { owner } = seedScenario();

  beginRequestObservation();
  const initiallyOwner = await render(accountRoute.default, '/cuenta/', owner.token);
  assert.equal(initiallyOwner.response.status, 200);
  assert.doesNotMatch(initiallyOwner.html, /href="\/cuenta\/administracion\/"/);

  const changedRole = rows.get(TABLES.accounts).get(`${owner.accountPk}\u0000`);
  rows.get(TABLES.accounts).set(`${owner.accountPk}\u0000`, { ...changedRole, isAdmin: true });
  beginRequestObservation();
  const nowAdmin = await render(accountRoute.default, '/cuenta/', owner.token);
  assert.equal(nowAdmin.response.status, 200);
  assert.match(nowAdmin.html, /href="\/cuenta\/administracion\/"/);
  assertSingleSsrContext();
});

test('disabled accounts and stale session epochs stop before private collections on their next request', async () => {
  const { owner } = seedScenario();
  const currentAccount = rows.get(TABLES.accounts).get(`${owner.accountPk}\u0000`);
  rows.get(TABLES.accounts).set(`${owner.accountPk}\u0000`, { ...currentAccount, active: false });
  beginRequestObservation();
  const disabled = await render(accountRoute.default, '/cuenta/', owner.token);
  assert.equal(disabled.response.status, 403);
  assert.match(disabled.html, /Esta cuenta está desactivada/);
  assertOneAuthenticationResolution();
  assert.equal(observedReads().collections, 0, 'disabled requests stop before owner and admin queries');
  assert.deepEqual(serviceDispatches, []);

  rows.get(TABLES.accounts).set(`${owner.accountPk}\u0000`, { ...currentAccount, epoch: currentAccount.epoch + 1, isAdmin: false });
  beginRequestObservation();
  const expiredByEpoch = await render(accountRoute.default, '/cuenta/', owner.token);
  assert.equal(expiredByEpoch.response.status, 200, 'a revoked session renders the normal signed-out page');
  assert.match(expiredByEpoch.html, /href="\/cuenta\/ingresar\/"/i);
  assertOneAuthenticationResolution();
  assert.equal(observedReads().collections, 0, 'a stale session epoch cannot reach private owner reads');
  assert.deepEqual(serviceDispatches, []);
});

test('anonymous account entry and recognized callback state do not read session or account rows', async () => {
  seedScenario();

  beginRequestObservation();
  const anonymous = await render(accountRoute.default, '/cuenta/', undefined);
  assert.equal(anonymous.response.status, 200);
  assert.deepEqual(observedReads(), { session: 0, account: 0, collections: 0, serviceDispatches: [] });

  beginRequestObservation();
  const callback = await render(accountRoute.default, '/cuenta/?estado=cancelado', OWNER_SESSION);
  assert.equal(callback.response.status, 400);
  assert.match(callback.html, /Cancelaste el acceso/);
  assert.deepEqual(observedReads(), { session: 0, account: 0, collections: 0, serviceDispatches: [] });
});

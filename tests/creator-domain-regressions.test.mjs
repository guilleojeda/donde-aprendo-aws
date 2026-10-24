import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCreatorStore } from '../src/lib/creator-store.mjs';
import { createCreatorPagesService } from '../src/lib/creator-pages.mjs';
import { currentUrlKey, currentUrlReservationId } from '../src/lib/catalog-url.mjs';
import { projectPublishedCatalog } from '../src/lib/catalog.mjs';
import {
  apiRequest,
  createCreatorPagesHarness,
  responseJson,
  seedResource,
} from './fixtures/creator-pages.mjs';

async function documentApi(harness, path, session, { method = 'GET', body } = {}) {
  return harness.service.handle(apiRequest(path, {
    session,
    csrf: { 'creator-a': 'csrf-a', admin: 'csrf-admin' }[session],
    method,
    body,
  }));
}

async function classify(harness, resourceId, version, fields) {
  return documentApi(harness, `/api/admin/recursos/${encodeURIComponent(resourceId)}`, 'admin', {
    method: 'PATCH',
    body: { ...fields, version },
  });
}

test('admin classification rejects records that would break the published catalog before writing', async () => {
  const harness = await createCreatorPagesHarness();
  await seedResource(harness.store, {
    id: 'approved-classification',
    title: 'Contenido aprobado',
    url: 'https://example.com/approved-classification',
    description: '',
    category: 'Serverless',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    level: 'inicial',
    sourceId: 'source-parent',
    order: 1,
    featured: false,
    published: true,
    version: 1,
    directoryControl: 'editorial',
  });

  const beforeBlank = await harness.store.get('resource:approved-classification');
  const writesBeforeBlank = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const blank = await classify(harness, beforeBlank.id, beforeBlank.version, {
    category: '   ', kind: 'content', format: 'Artículo', topics: ['Serverless'],
  });
  assert.equal(blank.status, 422);
  assert.equal((await responseJson(blank)).error, 'INVALID_CLASSIFICATION');
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writesBeforeBlank);
  assert.deepEqual(await harness.store.get('resource:approved-classification'), beforeBlank);

  const beforeSource = await harness.store.get('resource:approved-classification');
  const writesBeforeSource = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const source = await classify(harness, beforeSource.id, beforeSource.version, {
    category: 'Blog', kind: 'source', format: 'Blog', topics: ['Serverless'],
  });
  assert.equal(source.status, 422);
  assert.equal((await responseJson(source)).error, 'INVALID_CLASSIFICATION');
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writesBeforeSource);
  assert.deepEqual(await harness.store.get('resource:approved-classification'), beforeSource);

  const valid = await classify(harness, beforeSource.id, beforeSource.version, {
    category: 'Artículo', kind: 'content', format: 'Artículo', topics: ['Serverless'],
  });
  assert.equal(valid.status, 200);
  const saved = await harness.store.get('resource:approved-classification');
  assert.equal(saved.published, true);
  assert.equal(projectPublishedCatalog([saved]).length, 1);
});

test('admin approval rejects a pending non-projectable record before writing and preserves valid controls', async () => {
  const harness = await createCreatorPagesHarness();
  await seedResource(harness.store, {
    id: 'pending-invalid-approval',
    title: 'Fuente incompatible',
    url: 'https://example.com/pending-invalid-approval',
    description: '',
    category: 'Blog',
    kind: 'source',
    format: 'Blog',
    topics: ['Serverless'],
    level: 'inicial',
    published: false,
    version: 1,
    directoryControl: 'editorial',
  });
  const beforeInvalid = await harness.store.get('resource:pending-invalid-approval');
  const writesBeforeInvalid = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const invalidApproval = await documentApi(harness, '/api/admin/recursos/pending-invalid-approval/aprobar', 'admin', {
    method: 'POST', body: {},
  });
  assert.equal(invalidApproval.status, 422);
  assert.equal((await responseJson(invalidApproval)).error, 'INVALID_CLASSIFICATION');
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writesBeforeInvalid);
  assert.deepEqual(await harness.store.get('resource:pending-invalid-approval'), beforeInvalid);

  await seedResource(harness.store, {
    id: 'pending-valid-approval',
    title: 'Contenido pendiente',
    url: 'https://example.com/pending-valid-approval',
    description: '',
    category: 'Serverless',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    order: 1,
    featured: false,
    published: false,
    version: 1,
    directoryControl: 'editorial',
  });
  const validApproval = await documentApi(harness, '/api/admin/recursos/pending-valid-approval/aprobar', 'admin', {
    method: 'POST', body: {},
  });
  assert.equal(validApproval.status, 200);
  assert.equal((await harness.store.get('resource:pending-valid-approval')).published, true);
  assert.equal(projectPublishedCatalog([await harness.store.get('resource:pending-valid-approval')]).length, 1);

  await seedResource(harness.store, {
    recordType: 'event',
    id: 'pending-valid-event',
    title: 'Evento pendiente',
    description: '',
    startsAt: '2099-01-01T10:00:00Z',
    endsAt: '2099-01-01T11:00:00Z',
    timeZone: 'UTC',
    organizer: 'Comunidad AWS',
    mode: 'online',
    registrationUrl: 'https://example.com/pending-valid-event',
    published: false,
    version: 1,
    directoryControl: 'editorial',
  });
  const validEvent = await documentApi(harness, '/api/admin/recursos/pending-valid-event/aprobar', 'admin', {
    method: 'POST', body: {},
  });
  assert.equal(validEvent.status, 200);
  assert.equal((await harness.store.get('resource:pending-valid-event')).published, true);
});

function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function physical(table, key) {
  return JSON.stringify([table, key.pk ?? null, key.sk ?? null, key.id ?? null]);
}

function itemKey(table, item) {
  return physical(table, item.pk ? { pk: item.pk, ...(item.sk ? { sk: item.sk } : {}) } : { id: item.id });
}

function conditionMatches(item, action) {
  const expression = action.ConditionExpression;
  if (!expression) return true;
  if (expression.startsWith('attribute_not_exists(')) return !item;
  if (expression.includes(':zero')) {
    return Boolean(item && (item.version === undefined || item.version === 0));
  }
  if (expression.includes(':version')) {
    return Boolean(item && item.version === action.ExpressionAttributeValues[':version']);
  }
  throw new Error(`unsupported condition expression: ${expression}`);
}

function createPhysicalClient() {
  const items = new Map();
  let writeCount = 0;
  return {
    items,
    get writeCount() { return writeCount; },
    async send(command) {
      const input = command.input;
      const name = command.constructor.name;
      if (name === 'GetCommand') return { Item: copy(items.get(physical(input.TableName, input.Key))) };
      if (name === 'ScanCommand') {
        return { Items: [...items.entries()]
          .filter(([key]) => key.startsWith(`["${input.TableName}"`))
          .map(([, item]) => copy(item)) };
      }
      if (name === 'QueryCommand') {
        const partition = input.ExpressionAttributeValues[':pk'];
        const prefix = input.ExpressionAttributeValues[':sk'];
        return { Items: [...items.entries()]
          .filter(([key, item]) => key.startsWith(`["${input.TableName}"`)
            && item.pk === partition && typeof item.sk === 'string' && item.sk.startsWith(prefix))
          .map(([, item]) => copy(item)) };
      }
      if (name === 'BatchGetCommand') {
        const responses = {};
        for (const [table, request] of Object.entries(input.RequestItems)) {
          responses[table] = request.Keys.map((key) => copy(items.get(physical(table, key)))).filter(Boolean);
        }
        return { Responses: responses };
      }
      if (name !== 'TransactWriteCommand') throw new Error(`unsupported Dynamo command: ${name}`);

      writeCount += 1;
      const operations = input.TransactItems.map((entry) => {
        const [kind, action] = Object.entries(entry)[0];
        return {
          kind,
          action,
          key: kind === 'Put' ? itemKey(action.TableName, action.Item) : physical(action.TableName, action.Key),
        };
      });
      if (operations.some(({ action, key }) => !conditionMatches(items.get(key), action))) {
        const error = new Error('conditional check failed');
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }];
        throw error;
      }
      for (const { kind, action, key } of operations) {
        if (kind === 'Put') items.set(key, copy(action.Item));
        if (kind === 'Delete') items.delete(key);
      }
      return {};
    },
  };
}

function createPhysicalService(client) {
  let id = 0;
  const store = createCreatorStore({
    accountsTableName: 'accounts', profilesTableName: 'profiles', catalogTableName: 'catalog', client,
  });
  const service = createCreatorPagesService({
    store,
    origin: 'https://dondeaprendoaws.com',
    createId: () => `physical-${++id}`,
    authenticate: async (request) => {
      const session = request.headers.get('x-test-session');
      if (session === 'creator-a') return { state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-a', isAdmin: false };
      if (session === 'admin') return { state: 'authenticated', accountId: 'private-account-admin', csrfToken: 'csrf-admin', isAdmin: true };
      return { state: 'anonymous' };
    },
  });
  return { store, service };
}

async function seedPhysicalResource(store, resource) {
  const url = resource.url ?? resource.registrationUrl;
  const result = await store.transact({
    checks: [{ key: `resource:${resource.id}`, version: null }, { key: currentUrlKey(url), version: null }],
    puts: [
      { key: `resource:${resource.id}`, value: { ...resource, version: resource.version ?? 0 } },
      { key: currentUrlKey(url), value: {
        id: currentUrlReservationId(url), recordType: 'urlReservation', url, status: 'reserved', resourceId: resource.id, version: 1,
      } },
    ],
  });
  assert.equal(result, true);
}

test('resource IDs reject physical URL reservation aliases without writes and preserve legacy and event controls', async () => {
  const client = createPhysicalClient();
  const { store, service } = createPhysicalService(client);
  const api = (path, session, options = {}) => service.handle(apiRequest(path, {
    session,
    csrf: { 'creator-a': 'csrf-a', admin: 'csrf-admin' }[session],
    ...options,
  }));

  assert.equal((await api('/api/creador/perfil', 'creator-a', {
    method: 'PUT', body: { displayName: 'Ana', slug: 'dynamo-alias', programs: [], socials: {} },
  })).status, 200);
  assert.equal((await api('/api/creador/perfil/publicar', 'creator-a', { method: 'POST', body: {} })).status, 200);
  const added = await api('/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { title: 'Recurso actual', url: 'https://example.com/current' },
  });
  assert.equal(added.status, 201);
  const addedLink = (await responseJson(added)).link;
  const internalId = currentUrlReservationId('https://example.com/current');
  assert.deepEqual(await store.get(`resource:${internalId}`), await store.get(currentUrlKey('https://example.com/current')));

  const reservationBefore = await store.get(currentUrlKey('https://example.com/current'));
  const resourceBefore = await store.get(`resource:${addedLink.resourceId}`);
  const profileBefore = await store.get(`account-profile:private-account-a`);
  const placementsBefore = await store.list(`placement:${profileBefore.profileId}:`);
  const editorsBefore = await store.list(`editor:${profileBefore.profileId}:`);
  const writesBefore = client.writeCount;

  const rejectedClaim = await api('/api/creador/reclamaciones', 'creator-a', {
    method: 'POST', body: { resourceIds: [internalId], evidence: 'URL reservation must not be claimable' },
  });
  assert.equal(rejectedClaim.status, 422);
  assert.equal((await responseJson(rejectedClaim)).error, 'INVALID_RESOURCE_IDS');
  const rejectedLink = await api('/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', resourceIds: [internalId] },
  });
  assert.equal(rejectedLink.status, 422);
  assert.equal((await responseJson(rejectedLink)).error, 'EXACT_RESOURCES_REQUIRED');
  assert.equal(client.writeCount, writesBefore, 'control-row rejection must perform no writes');
  assert.deepEqual(await store.get(currentUrlKey('https://example.com/current')), reservationBefore);
  assert.deepEqual(await store.get(`resource:${addedLink.resourceId}`), resourceBefore);
  assert.deepEqual(await store.get(`account-profile:private-account-a`), profileBefore);
  assert.deepEqual(await store.list(`placement:${profileBefore.profileId}:`), placementsBefore);
  assert.deepEqual(await store.list(`editor:${profileBefore.profileId}:`), editorsBefore);
  assert.equal((await api('/api/creador/perfil', 'creator-a')).status, 200);
  assert.equal((await service.readPublicProfile('dynamo-alias')).status, 200);

  await seedPhysicalResource(store, {
    id: 'legacy-control-check', title: 'Recurso legado', url: 'https://example.com/legacy-control-check', description: '',
    category: 'Artículo', kind: 'content', format: 'Artículo', topics: ['Serverless'], order: 1, featured: false,
    published: true, directoryControl: 'editorial', version: 1,
  });
  await seedPhysicalResource(store, {
    recordType: 'event', id: 'event-control-check', title: 'Evento válido', description: '',
    startsAt: '2099-01-01T10:00:00Z', endsAt: '2099-01-01T11:00:00Z', timeZone: 'UTC', organizer: 'Comunidad AWS', mode: 'online',
    registrationUrl: 'https://example.com/event-control-check', published: true, directoryControl: 'editorial', version: 1,
  });

  for (const resourceId of ['legacy-control-check', 'event-control-check']) {
    const claim = await api('/api/creador/reclamaciones', 'creator-a', { method: 'POST', body: { resourceIds: [resourceId] } });
    assert.equal(claim.status, 202, `${resourceId} remains claimable`);
    const linked = await api('/api/admin/reclamaciones/vincular', 'admin', {
      method: 'POST', body: { accountId: 'private-account-a', resourceIds: [resourceId] },
    });
    assert.equal(linked.status, 200, `${resourceId} remains linkable`);
    const current = await store.get(`resource:${resourceId}`);
    assert.equal(current.editorProfileId, profileBefore.profileId);
  }
  const editor = await api('/api/creador/perfil', 'creator-a');
  assert.equal(editor.status, 200);
  assert.equal((await responseJson(editor)).links.some(({ resourceId }) => resourceId === 'event-control-check'), true);
});

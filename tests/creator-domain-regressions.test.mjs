import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DynamoDBServiceException } from '@aws-sdk/client-dynamodb';
import { createCreatorStore } from '../src/lib/creator-store.mjs';
import { createCreatorPagesService } from '../src/lib/creator-pages.mjs';
import { currentUrlKey, currentUrlReservationId } from '../src/lib/catalog-url.mjs';
import { loadCatalog, projectPublishedCatalog } from '../src/lib/catalog.mjs';
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

async function creatorApi(harness, path, { method = 'GET', body } = {}) {
  return harness.service.handle(apiRequest(path, {
    session: 'creator-a', csrf: 'csrf-a', creatorContract: '2', method, body,
  }));
}

function adminActionPath(resourceId, action) {
  return `/api/admin/recursos/${action}/?id=${encodeURIComponent(resourceId)}`;
}

test('private invalid-public IDs retain classification rules without being published', async () => {
  const harness = await createCreatorPagesHarness();
  const carriageId = 'legacy\rprivate';
  const nulId = 'legacy\0private';
  const lfTabId = 'legacy\n\tprivate';
  for (const [id, url] of [
    [carriageId, 'https://example.com/private-carriage'],
    [nulId, 'https://example.com/private-nul'],
    [lfTabId, 'https://example.com/private-lf-tab'],
  ]) {
    await seedResource(harness.store, {
      id, title: `Legacy ${id.length}`, url, description: '', category: 'Otros', order: 1, featured: false,
      published: false, hidden: false, version: 1, directoryControl: 'editorial',
    });
  }

  const beforeInvalidTaxonomy = await harness.store.get(`resource:${nulId}`);
  const writesBeforeInvalidTaxonomy = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const invalidTaxonomy = await classify(harness, nulId, beforeInvalidTaxonomy.version, {
    category: 'Blog', kind: 'source', format: 'Blog', topics: ['Not a catalog topic'],
  });
  assert.equal(invalidTaxonomy.status, 422);
  assert.equal((await responseJson(invalidTaxonomy)).error, 'INVALID_CLASSIFICATION');
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writesBeforeInvalidTaxonomy);
  assert.deepEqual(await harness.store.get(`resource:${nulId}`), beforeInvalidTaxonomy);

  const classified = await classify(harness, carriageId, 1, { category: 'Blog' });
  assert.equal(classified.status, 200, 'legacy category-only classification derives and checks its taxonomy');
  const savedPrivate = await harness.store.get(`resource:${carriageId}`);
  assert.equal(savedPrivate.id, carriageId, 'private identity remains byte-for-byte exact');
  assert.equal(savedPrivate.published, false, 'classification does not admit the resource');
  assert.equal(savedPrivate.category, 'Blog');

  const validControl = await classify(harness, lfTabId, 1, { category: 'Blog' });
  assert.equal(validControl.status, 200, 'internal LF and TAB remain valid public identities');
});

test('approval and approved restores enforce catalog admission without blocking private restore', async () => {
  const harness = await createCreatorPagesHarness();
  const pendingId = 'pending\0approval';
  const pending = {
    id: pendingId, title: 'Contenido pendiente', url: 'https://example.com/pending-nul', description: '',
    category: 'Blog', order: 1, featured: false, kind: 'source', format: 'Blog', topics: [], published: false,
    hidden: false, version: 1, directoryControl: 'editorial',
  };
  await seedResource(harness.store, pending);
  const pendingBefore = await harness.store.get(`resource:${pendingId}`);
  const writesBeforeApproval = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const approval = await documentApi(harness, adminActionPath(pendingId, 'aprobar'), 'admin', {
    method: 'POST', body: { version: pendingBefore.version },
  });
  assert.equal(approval.status, 422);
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writesBeforeApproval);
  assert.deepEqual(await harness.store.get(`resource:${pendingId}`), pendingBefore,
    'rejected approval does not change publication, visibility, version, or metadata');

  const hiddenApprovedId = 'approved\rhidden';
  await seedResource(harness.store, {
    ...pending, id: hiddenApprovedId, url: 'https://example.com/approved-carriage',
    category: 'Otros', published: true, hidden: true, version: 1,
  });
  const hiddenApprovedBefore = await harness.store.get(`resource:${hiddenApprovedId}`);
  const classified = await classify(harness, hiddenApprovedId, hiddenApprovedBefore.version, { category: 'Podcast' });
  assert.equal(classified.status, 200, 'hidden approved content remains private while classification is saved');
  const classifiedHidden = await harness.store.get(`resource:${hiddenApprovedId}`);
  assert.equal(classifiedHidden.published, true);
  assert.equal(classifiedHidden.hidden, true);
  assert.equal(classifiedHidden.version, hiddenApprovedBefore.version + 1);

  const writesBeforeRestore = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const restore = await documentApi(harness, adminActionPath(hiddenApprovedId, 'restaurar'), 'admin', {
    method: 'POST', body: { version: classifiedHidden.version },
  });
  assert.equal(restore.status, 422);
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writesBeforeRestore);
  assert.deepEqual(await harness.store.get(`resource:${hiddenApprovedId}`), classifiedHidden,
    'rejected restoration leaves the classified row hidden and at its observed version');

  const privateId = 'unpublished\0hidden';
  await seedResource(harness.store, {
    ...pending, id: privateId, url: 'https://example.com/unpublished-hidden', hidden: true,
  });
  const privateBefore = await harness.store.get(`resource:${privateId}`);
  const privateRestore = await documentApi(harness, adminActionPath(privateId, 'restaurar'), 'admin', {
    method: 'POST', body: { version: privateBefore.version },
  });
  assert.equal(privateRestore.status, 200, 'an unapproved private row can be restored without publication');
  const privateSaved = await harness.store.get(`resource:${privateId}`);
  assert.equal(privateSaved.id, privateId);
  assert.equal(privateSaved.hidden, false);
  assert.equal(privateSaved.published, false);
  assert.equal(privateSaved.version, privateBefore.version + 1);

  const revokedId = 'revoked\rhidden';
  await seedResource(harness.store, {
    ...pending, id: revokedId, url: 'https://example.com/revoked-hidden',
    published: false, approvalRevoked: true, hidden: true,
  });
  const revokedBefore = await harness.store.get(`resource:${revokedId}`);
  const revokedRestore = await documentApi(harness, adminActionPath(revokedId, 'restaurar'), 'admin', {
    method: 'POST', body: { version: revokedBefore.version },
  });
  assert.equal(revokedRestore.status, 200, 'revoked private content remains restorable without reapproval');
  const revokedSaved = await harness.store.get(`resource:${revokedId}`);
  assert.equal(revokedSaved.hidden, false);
  assert.equal(revokedSaved.published, false);
  assert.equal(revokedSaved.approvalRevoked, true);

  const validId = 'approved-hidden-control';
  await seedResource(harness.store, {
    ...pending, id: validId, url: 'https://example.com/approved-hidden-control',
    published: true, hidden: true, version: 1,
  });
  const validBefore = await harness.store.get(`resource:${validId}`);
  const validRestore = await documentApi(harness, adminActionPath(validId, 'restaurar'), 'admin', {
    method: 'POST', body: { version: validBefore.version },
  });
  assert.equal(validRestore.status, 200, 'valid approved content still restores');
  assert.equal((await harness.store.get(`resource:${validId}`)).hidden, false);
});

test('restoring an approved creator resource checks its selected public directory identity', async () => {
  const harness = await createCreatorPagesHarness();
  const draft = await creatorApi(harness, '/api/creador/perfil', {
    method: 'PUT', body: { creatorVersion: null, displayName: 'Ana', slug: 'ana-identidad' },
  });
  assert.equal(draft.status, 200);
  const draftReceipt = await responseJson(draft);
  const published = await creatorApi(harness, '/api/creador/perfil/publicar', {
    method: 'POST', body: { creatorVersion: draftReceipt.creatorVersion },
  });
  assert.equal(published.status, 200);
  const publishReceipt = await responseJson(published);

  const resourceId = 'creator-approved\0hidden';
  const url = 'https://example.com/creator-approved-hidden';
  await seedResource(harness.store, {
    id: resourceId, title: 'Contenido de creador', url, description: '', category: 'Blog',
    order: 1, featured: false, kind: 'content', format: 'Artículo', topics: [], published: true, hidden: true,
    approvalRevoked: false, directoryControl: 'creator', editorProfileId: draftReceipt.profileId,
    version: 1,
  });
  const linked = await creatorApi(harness, '/api/creador/referencias/', {
    method: 'POST', body: {
      resourceId, url, selectedForDirectory: true, creatorVersion: publishReceipt.creatorVersion,
    },
  });
  assert.equal(linked.status, 201, 'a hidden resource can retain its selected placement privately');

  const profileRow = await harness.store.get(`profile:${draftReceipt.profileId}`);
  const publicState = [{ ...profileRow, pk: `PROFILE#${profileRow.id}`, sk: 'META' }];
  const beforeRestore = await harness.store.get(`resource:${resourceId}`);
  assert.deepEqual(projectPublishedCatalog([beforeRestore], publicState), [], 'hidden resources are not public');
  const publicProfile = await harness.service.readPublicProfile('ana-identidad');
  assert.equal(publicProfile.status, 200);
  assert.equal(publicProfile.links.length, 0);

  const writesBeforeRestore = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const restore = await documentApi(harness, adminActionPath(resourceId, 'restaurar'), 'admin', {
    method: 'POST', body: { version: beforeRestore.version },
  });
  assert.equal(restore.status, 422);
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writesBeforeRestore);
  assert.deepEqual(await harness.store.get(`resource:${resourceId}`), beforeRestore,
    'the selected creator resource remains hidden with no version or timestamp write');
  assert.deepEqual(projectPublishedCatalog([await harness.store.get(`resource:${resourceId}`)], publicState), []);
});

const ordinaryId = 'ordinary-directory-control';
const admissionSlug = 'ana-admision';

async function creatorAdmissionFixture(legacyId, { editorial = false } = {}) {
  const harness = await createCreatorPagesHarness();
  let creatorVersion = null;
  async function ownerCommand(path, method, body, status = 200) {
    const response = await creatorApi(harness, `/api/creador/${path}`, {
      method, body: { ...body, creatorVersion },
    });
    const result = await responseJson(response);
    assert.equal(response.status, status, JSON.stringify(result));
    creatorVersion = result.creatorVersion;
    return result;
  }
  async function adminCommand(path, body) {
    const response = await documentApi(harness, `/api/admin/${path}`, 'admin', { method: 'POST', body });
    const result = await responseJson(response);
    assert.equal(response.status, 200, JSON.stringify(result));
    const profile = await harness.store.get(`profile:${profileId}`);
    creatorVersion = profile.version;
    return result;
  }
  const { profileId } = await ownerCommand('perfil', 'PUT', { displayName: 'Ana', slug: admissionSlug });
  const legacy = {
    id: legacyId, title: 'Contenido histórico', url: 'https://example.com/historico', description: '',
    category: 'Otros', order: 1, featured: false, kind: 'content', format: 'Artículo', topics: [],
    published: true, version: 1, directoryControl: editorial ? 'editorial' : 'creator',
    ...(editorial ? {} : { editorProfileId: profileId }),
  };
  const ordinary = {
    ...legacy, id: ordinaryId, title: 'Contenido válido', url: 'https://example.com/valido',
    directoryControl: 'creator', editorProfileId: profileId,
  };
  await seedResource(harness.store, legacy);
  await seedResource(harness.store, ordinary);
  const reference = (resource, selectedForDirectory = true) => ownerCommand('referencias', 'POST', {
    resourceId: resource.id, url: resource.url, selectedForDirectory,
  }, 201);
  await reference(ordinary);

  return {
    legacy, profileId, ownerCommand, adminCommand,
    referenceLegacy: (selected) => reference(legacy, selected),
    publish: () => ownerCommand('perfil/publicar', 'POST', {}),
    async projectIds() {
      const result = await loadCatalog({
        fixturePath: '', tableName: 'catalog', creatorTableName: 'creators',
        scanPage: async () => ({ Items: await Promise.all([legacyId, ordinaryId]
          .map((id) => harness.store.get(`resource:${id}`))) }),
        scanCreatorPage: async () => ({ Items: [{
          ...await harness.store.get(`profile:${profileId}`), pk: `PROFILE#${profileId}`, sk: 'META',
        }] }),
      });
      return result.map(({ id }) => id);
    },
    async assertVisibleExactLink() {
      const owner = await responseJson(await creatorApi(harness, '/api/creador/perfil'));
      const [placementId, placement] = Object.entries(owner.placements)
        .find(([, placement]) => placement.resourceId === legacyId) ?? [];
      assert.equal(placement?.selectedForDirectory, true);
      assert.equal(owner.resources.find(({ id }) => id === legacyId)?.url, legacy.url);
      const publicProfile = await harness.service.readPublicProfile(admissionSlug);
      assert.equal(publicProfile.status, 200);
      const publicLink = publicProfile.links.find((link) => link.placementId === placementId);
      assert.equal(publicLink?.resourceId, legacyId);
      assert.equal(publicLink?.url, legacy.url);
    },
  };
}

for (const [label, legacyId] of [['CR', 'legacy\rcreator'], ['NUL', 'legacy\0creator']]) {
  test(`publishing a profile keeps its exact ${label} link without admitting it to the directory`, async () => {
    const fixture = await creatorAdmissionFixture(legacyId);
    await fixture.referenceLegacy();
    assert.deepEqual(await fixture.projectIds(), []);
    await fixture.publish();
    await fixture.assertVisibleExactLink();
    assert.deepEqual(await fixture.projectIds(), [ordinaryId]);
  });

  test(`restoring a profile keeps its exact ${label} link without admitting it to the directory`, async () => {
    const fixture = await creatorAdmissionFixture(legacyId);
    const { creatorVersion } = await fixture.publish();
    const { versionChanges } = await fixture.adminCommand(`perfiles/${fixture.profileId}/ocultar`, { version: creatorVersion });
    const { creatorVersion: hiddenVersion } = await fixture.referenceLegacy();
    assert.equal(versionChanges.length, 1);
    assert.deepEqual(await fixture.projectIds(), []);
    await fixture.adminCommand(`perfiles/${fixture.profileId}/restaurar`, { version: hiddenVersion });
    await fixture.assertVisibleExactLink();
    assert.deepEqual(await fixture.projectIds(), [ordinaryId]);
  });

  test(`selecting an exact ${label} link keeps it on the profile and out of the directory`, async () => {
    const fixture = await creatorAdmissionFixture(legacyId);
    await fixture.publish();
    const { placementId } = await fixture.referenceLegacy(false);
    assert.deepEqual(await fixture.projectIds(), [ordinaryId]);
    await fixture.ownerCommand(`enlaces/${placementId}`, 'PATCH', { selectedForDirectory: true });
    await fixture.assertVisibleExactLink();
    assert.deepEqual(await fixture.projectIds(), [ordinaryId]);
  });

  test(`adding an exact ${label} link to a visible profile succeeds without admitting it to the directory`, async () => {
    const fixture = await creatorAdmissionFixture(legacyId);
    await fixture.publish();
    assert.deepEqual(await fixture.projectIds(), [ordinaryId]);
    const { resourceId } = await fixture.ownerCommand('enlaces', 'POST', {
      title: fixture.legacy.title, url: fixture.legacy.url,
    }, 201);
    assert.equal(resourceId, legacyId);
    await fixture.assertVisibleExactLink();
    assert.deepEqual(await fixture.projectIds(), [ordinaryId]);
  });

  test(`granting an approved ${label} resource retains its ID and leaves the directory usable`, async () => {
    const fixture = await creatorAdmissionFixture(legacyId, { editorial: true });
    await fixture.publish();
    const { linkedResourceIds } = await fixture.adminCommand('reclamaciones/vincular', {
      accountId: 'private-account-a', resourceIds: [legacyId],
    });
    assert.deepEqual(linkedResourceIds, [legacyId]);
    await fixture.assertVisibleExactLink();
    assert.deepEqual(await fixture.projectIds(), [ordinaryId]);
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
    method: 'POST', body: { version: 1 },
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
    method: 'POST', body: { version: 1 },
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
    method: 'POST', body: { version: 1 },
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
        const error = new DynamoDBServiceException({
          name: 'TransactionCanceledException',
          message: 'conditional check failed',
          $metadata: { httpStatusCode: 400, attempts: 1 },
        });
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
      const principal = session === 'creator-a'
        ? { state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-a', isAdmin: false }
        : session === 'admin'
          ? { state: 'authenticated', accountId: 'private-account-admin', csrfToken: 'csrf-admin', isAdmin: true }
          : { state: 'anonymous' };
      return {
        session: principal.state === 'authenticated'
          ? { state: 'authenticated', account: { email: `${session}@example.invalid` }, csrfToken: principal.csrfToken, expiresAt: Number.MAX_SAFE_INTEGER }
          : { state: principal.state },
        principal,
      };
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
    creatorContract: '2',
    ...options,
  }));

  const profile = await api('/api/creador/perfil', 'creator-a', {
    method: 'PUT', body: { creatorVersion: null, displayName: 'Ana', slug: 'dynamo-alias', programs: [], socials: {} },
  });
  assert.equal(profile.status, 200);
  const published = await api('/api/creador/perfil/publicar', 'creator-a', {
    method: 'POST', body: { creatorVersion: (await responseJson(profile)).creatorVersion },
  });
  assert.equal(published.status, 200);
  const added = await api('/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { creatorVersion: (await responseJson(published)).creatorVersion, title: 'Recurso actual', url: 'https://example.com/current' },
  });
  assert.equal(added.status, 201);
  const addedLink = await responseJson(added);
  const internalId = currentUrlReservationId('https://example.com/current');
  assert.deepEqual(await store.get(`resource:${internalId}`), await store.get(currentUrlKey('https://example.com/current')));

  const reservationBefore = await store.get(currentUrlKey('https://example.com/current'));
  const resourceBefore = await store.get(`resource:${addedLink.resourceId}`);
  const profileBefore = await store.get(`account-profile:private-account-a`);
  const stateBefore = await store.get(`profile:${profileBefore.profileId}`);
  const editorsBefore = await store.list(`editor:${profileBefore.profileId}:`);
  const writesBefore = client.writeCount;

  const rejectedClaim = await api('/api/creador/reclamaciones', 'creator-a', {
    method: 'POST', body: { resources: [{ resourceId: internalId, url: 'https://example.com/current' }], evidence: 'URL reservation must not be claimable' },
  });
  assert.equal(rejectedClaim.status, 422);
  assert.equal((await responseJson(rejectedClaim)).error, 'INVALID_CLAIM_RESOURCES');
  const rejectedLink = await api('/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', resourceIds: [internalId] },
  });
  assert.equal(rejectedLink.status, 422);
  assert.equal((await responseJson(rejectedLink)).error, 'EXACT_RESOURCES_REQUIRED');
  assert.equal(client.writeCount, writesBefore, 'control-row rejection must perform no writes');
  assert.deepEqual(await store.get(currentUrlKey('https://example.com/current')), reservationBefore);
  assert.deepEqual(await store.get(`resource:${addedLink.resourceId}`), resourceBefore);
  assert.deepEqual(await store.get(`account-profile:private-account-a`), profileBefore);
  assert.deepEqual(await store.get(`profile:${profileBefore.profileId}`), stateBefore);
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
    const claim = await api('/api/creador/reclamaciones', 'creator-a', {
      method: 'POST', body: { resources: [{ resourceId, url: `https://example.com/${resourceId}` }] },
    });
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
  assert.equal(Object.values((await responseJson(editor)).placements).some(({ resourceId }) => resourceId === 'event-control-check'), true);
});

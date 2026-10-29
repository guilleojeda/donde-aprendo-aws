import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, sessionCsrf } from './fixtures/creator-pages.mjs';
import { createDynamoMoveHarness, seedMoveProfile, seedMoveResource } from './fixtures/creator-link-move.mjs';

const MAX_RESOURCE_ID_BYTES = 256;

function importedId(bytes) {
  return `import:${'x'.repeat(bytes - Buffer.byteLength('import:'))}`;
}

function importedUtf8Id(bytes) {
  return `import:${'x'.repeat(bytes - Buffer.byteLength('import:') - Buffer.byteLength('é'))}é`;
}

function installPhysicalKeyLimits(mock) {
  const send = mock.client.send.bind(mock.client);
  const checkKey = (key) => {
    if (!key || typeof key !== 'object') return;
    if (typeof key.id === 'string' && Buffer.byteLength(key.id, 'utf8') > 2048) {
      throw Object.assign(new Error('DynamoDB partition key exceeds 2048 bytes'), { name: 'ValidationException' });
    }
    if (typeof key.pk === 'string' && Buffer.byteLength(key.pk, 'utf8') > 2048) {
      throw Object.assign(new Error('DynamoDB partition key exceeds 2048 bytes'), { name: 'ValidationException' });
    }
    if (typeof key.sk === 'string' && Buffer.byteLength(key.sk, 'utf8') > 1024) {
      throw Object.assign(new Error('DynamoDB sort key exceeds 1024 bytes'), { name: 'ValidationException' });
    }
  };

  mock.client.send = async (command) => {
    const { input } = command;
    if (command.constructor.name === 'GetCommand') checkKey(input.Key);
    if (command.constructor.name === 'TransactWriteCommand') {
      for (const action of input.TransactItems) {
        const request = action.Put ?? action.Delete ?? action.ConditionCheck;
        checkKey(request.Key ?? request.Item);
      }
    }
    const result = await send(command);
    for (const item of result.Items ?? []) checkKey(item);
    if (result.Item) checkKey(result.Item);
    for (const items of Object.values(result.Responses ?? {})) {
      for (const item of items) checkKey(item);
    }
    return result;
  };
}

async function api(harness, pathname, body, { method = 'POST', session = 'creator-a' } = {}) {
  const response = await callApi(harness, pathname, {
    method,
    session,
    csrf: sessionCsrf[session],
    ...(body === undefined ? {} : { body }),
  });
  return { response, status: response.status, data: response.status === 204 ? null : await response.json() };
}

async function owner(harness, session = 'creator-a') {
  const result = await api(harness, '/api/creador/perfil', undefined, { method: 'GET', session });
  assert.equal(result.status, 200);
  return result.data;
}

function writesSince(harness, start) {
  return harness.mock.transactions.slice(start).filter(({ input }) =>
    input.TransactItems.some((action) => action.Put || action.Delete));
}

function catalogReadsSince(harness, start, ids) {
  return harness.mock.calls.slice(start).filter(({ name, input }) => name === 'GetCommand'
    && input.TableName === 'catalog-test' && ids.has(input.Key.id));
}

test('catalog ID limit uses UTF-8 bytes and rejects oversized references and claims before writes', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  seedMoveResource(harness.mock, {
    id: importedId(257), title: 'Importación demasiado larga', url: 'https://catalog.example/too-long/ascii', published: true,
  });
  seedMoveResource(harness.mock, {
    id: importedUtf8Id(257), title: 'Importación UTF-8 demasiado larga', url: 'https://catalog.example/too-long/utf8', published: true,
  });
  installPhysicalKeyLimits(harness.mock);

  const profile = (await owner(harness)).profile;
  const oversizedIds = new Set([importedId(257), importedUtf8Id(257)]);
  const callsBefore = harness.mock.calls.length;
  const writesBefore = harness.mock.transactions.length;

  const reference = await api(harness, '/api/creador/referencias', {
    resourceId: importedId(257), url: 'https://catalog.example/too-long/ascii', profileVersion: profile.version,
  });
  assert.equal(reference.status, 422, 'a 257-byte resource ID cannot become a creator reference');
  assert.deepEqual(writesSince(harness, writesBefore), []);
  assert.deepEqual(catalogReadsSince(harness, callsBefore, oversizedIds), [], 'reject before reading the oversized catalog key');

  for (const [label, body] of [
    ['paired selection', { resources: [{ resourceId: importedId(257), url: 'https://catalog.example/too-long/ascii' }] }],
    ['legacy ID selection', { resourceIds: [importedUtf8Id(257)] }],
  ]) {
    const start = harness.mock.calls.length;
    const writeStart = harness.mock.transactions.length;
    const request = await api(harness, '/api/creador/reclamaciones', body);
    assert.equal(request.status, 422, `${label} rejects a 257-byte ID`);
    assert.deepEqual(writesSince(harness, writeStart), [], `${label} does not write a claim or reference`);
    assert.deepEqual(catalogReadsSince(harness, start, oversizedIds), [], `${label} rejects before catalog reads`);
  }

  const adminStart = harness.mock.calls.length;
  const adminWriteStart = harness.mock.transactions.length;
  const admin = await api(harness, '/api/admin/reclamaciones/vincular', {
    accountId: 'private-account-a', resourceIds: [importedId(257)],
  }, { session: 'admin' });
  assert.equal(admin.status, 422, 'administrative linking rejects an oversized identity before granting authority');
  assert.deepEqual(writesSince(harness, adminWriteStart), []);
  assert.deepEqual(catalogReadsSince(harness, adminStart, oversizedIds), []);

  const current = await owner(harness);
  assert.equal(current.links.some(({ resourceId }) => oversizedIds.has(resourceId)), false);
  assert.equal(current.editableResources.some(({ id }) => oversizedIds.has(id)), false);
  assert.equal((await harness.store.list('claim:')).length, 0);
  assert.equal((await harness.store.list(`claim-ref:${profile.id}:`)).length, 0);
});

test('owner edit and re-add reject an oversized retained resource identity before reading it', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  const resourceId = importedUtf8Id(257);
  const url = 'https://catalog.example/too-long/retained';
  seedMoveResource(harness.mock, {
    id: resourceId, title: 'Legacy retained record', url, directoryControl: 'creator', editorProfileId: 'profile-move-a',
  });
  harness.mock.seed('profiles-test', {
    pk: 'PROFILE#profile-move-a', sk: `EDITOR#${resourceId}`,
    recordType: 'editorReference', profileId: 'profile-move-a', resourceId, version: 1,
  });
  installPhysicalKeyLimits(harness.mock);

  const start = harness.mock.calls.length;
  const writeStart = harness.mock.transactions.length;
  const directEdit = await api(harness, `/api/creador/recursos/${encodeURIComponent(resourceId)}`, {
    version: 1, title: 'No debe guardarse',
  }, { method: 'PATCH' });
  assert.equal(directEdit.status, 422, 'a retained record outside the ID contract cannot be edited');
  assert.deepEqual(catalogReadsSince(harness, start, new Set([resourceId])), []);
  assert.deepEqual(writesSince(harness, writeStart), []);

  const readdStart = harness.mock.calls.length;
  const readdWriteStart = harness.mock.transactions.length;
  const readd = await api(harness, '/api/creador/enlaces', { resourceId, resourceVersion: 1 });
  assert.equal(readd.status, 422, 'an oversized ID cannot be accepted as a retained-resource reference');
  assert.deepEqual(catalogReadsSince(harness, readdStart, new Set([resourceId])), []);
  assert.deepEqual(writesSince(harness, readdWriteStart), []);
  assert.deepEqual(await harness.store.list('placement:profile-move-a:'), []);
});

test('the former 1900-byte catalog ID is rejected before a claim is stored', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  const resourceId = importedId(1900);
  const url = 'https://catalog.example/too-long/former-1900';
  seedMoveResource(harness.mock, { id: resourceId, title: 'Former long-ID case', url, published: true });
  installPhysicalKeyLimits(harness.mock);

  const writeStart = harness.mock.transactions.length;
  const claim = await api(harness, '/api/creador/reclamaciones', {
    resources: [{ resourceId, url }], evidence: 'La cuenta acredita la autoría.',
  });
  assert.equal(claim.status, 422, 'the former 1900-byte selection can no longer be accepted and left unmoderatable');
  assert.deepEqual(writesSince(harness, writeStart), []);
  assert.equal((await harness.store.list('claim:')).length, 0);
  assert.equal((await harness.store.list('claim-ref:profile-move-a:')).length, 0);
  assert.deepEqual(await harness.store.list('editor:profile-move-a:'), []);
  assert.deepEqual(await harness.store.list('placement:profile-move-a:'), []);
});

test('URL-only claim selection rejects a reservation for an over-limit resource without writes', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  const resourceId = importedId(1900);
  const url = 'https://catalog.example/too-long/url-only';
  seedMoveResource(harness.mock, { id: resourceId, title: 'Reserved long-ID case', url, published: true });
  installPhysicalKeyLimits(harness.mock);

  const writeStart = harness.mock.transactions.length;
  const claim = await api(harness, '/api/creador/reclamaciones', { resources: [{ url }] });
  assert.equal(claim.status, 422, 'resolving a URL reservation does not bypass the catalog ID limit');
  assert.deepEqual(writesSince(harness, writeStart), []);
  assert.equal((await harness.store.list('claim:')).length, 0);
  assert.equal((await harness.store.list('claim-ref:profile-move-a:')).length, 0);
  assert.deepEqual(await harness.store.list('editor:profile-move-a:'), []);
  assert.deepEqual(await harness.store.list('placement:profile-move-a:'), []);
});

test('a valid target followed by an over-limit target cannot partially save a mixed claim', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  const validId = importedId(MAX_RESOURCE_ID_BYTES);
  const validUrl = 'https://catalog.example/mixed/valid';
  const oversizedId = importedId(1900);
  const oversizedUrl = 'https://catalog.example/mixed/too-long';
  seedMoveResource(harness.mock, { id: validId, title: 'Válido', url: validUrl, published: true });
  seedMoveResource(harness.mock, { id: oversizedId, title: 'Demasiado largo', url: oversizedUrl, published: true });
  installPhysicalKeyLimits(harness.mock);

  const writeStart = harness.mock.transactions.length;
  const claim = await api(harness, '/api/creador/reclamaciones', {
    resources: [
      { resourceId: validId, url: validUrl },
      { resourceId: oversizedId, url: oversizedUrl },
    ],
  });
  assert.equal(claim.status, 422, 'an invalid later target rejects the complete claim input');
  assert.deepEqual(writesSince(harness, writeStart), []);
  assert.equal((await harness.store.list('claim:')).length, 0);
  assert.equal((await harness.store.list('claim-ref:profile-move-a:')).length, 0);
  assert.deepEqual(await harness.store.list('editor:profile-move-a:'), []);
  assert.deepEqual(await harness.store.list('placement:profile-move-a:'), []);
});

test('256-byte and current legacy IDs retain exact claim moderation and owner editing behavior', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  seedMoveProfile(harness.mock, { accountId: 'private-account-b', profileId: 'profile-move-b', slug: 'otra-persona' });

  const ids = [
    importedId(MAX_RESOURCE_ID_BYTES),
    importedUtf8Id(MAX_RESOURCE_ID_BYTES),
    'catalog-0123456789abcdef0123456789abcdef',
    'meetup-34833437',
    'meetup-event-316882965',
    'resource-123e4567-e89b-12d3-a456-426614174000',
    'legacy:event/雪.' + 'r'.repeat(40),
    '1234567890',
  ];
  assert.ok(ids.every((id) => Buffer.byteLength(id, 'utf8') <= MAX_RESOURCE_ID_BYTES));
  assert.equal(Buffer.byteLength(ids[0], 'utf8'), 256);
  assert.equal(Buffer.byteLength(ids[1], 'utf8'), 256);
  assert.notEqual(ids[1].length, Buffer.byteLength(ids[1], 'utf8'), 'the boundary is measured in UTF-8 bytes, not characters');

  const targets = ids.map((id, index) => ({
    id,
    url: `https://catalog.example/imported/${index}`,
  }));
  for (const target of targets) {
    seedMoveResource(harness.mock, {
      id: target.id, title: `Ficha ${target.id.slice(0, 24)}`, url: target.url, published: true,
    });
  }
  installPhysicalKeyLimits(harness.mock);

  const submitted = await api(harness, '/api/creador/reclamaciones', {
    resources: targets.map(({ id: resourceId, url }) => ({ resourceId, url })),
    evidence: 'La cuenta acredita la autoría.',
  });
  assert.equal(submitted.status, 202);
  assert.deepEqual(submitted.data.claim.resourceIds, ids, 'the claim preserves every exact historical or boundary identity');

  const resolution = await api(harness, '/api/admin/reclamaciones/vincular', {
    accountId: 'private-account-a', resourceIds: ids,
  }, { session: 'admin' });
  assert.equal(resolution.status, 200, `admin resolution succeeds at the admitted boundary: ${JSON.stringify(resolution.data)}`);
  assert.deepEqual(resolution.data.linkedResourceIds, ids);
  const transactionCount = harness.mock.transactions.length;
  const repeatedResolution = await api(harness, '/api/admin/reclamaciones/vincular', {
    accountId: 'private-account-a', resourceIds: ids,
  }, { session: 'admin' });
  assert.equal(repeatedResolution.status, 200);
  assert.deepEqual(repeatedResolution.data.linkedResourceIds, ids);
  assert.equal(harness.mock.transactions.length, transactionCount, 'repeating resolution does not rewrite exact linked identities');

  let current = await owner(harness);
  assert.deepEqual(new Set(current.editableResources.map(({ id }) => id)), new Set(ids));
  for (const id of ids) {
    const editorReference = await harness.store.get(`editor:profile-move-a:${id}`);
    assert.equal(editorReference.resourceId, id);
    assert.equal(editorReference.profileId, 'profile-move-a');
  }

  const boundaryId = ids[0];
  const linked = current.links.find(({ resourceId }) => resourceId === boundaryId);
  assert.ok(linked);
  const removed = await api(harness, `/api/creador/enlaces/${encodeURIComponent(linked.placementId)}`, {
    profileVersion: current.profile.version,
  }, { method: 'DELETE' });
  assert.equal(removed.status, 204);

  current = await owner(harness);
  assert.equal(current.links.some(({ resourceId }) => resourceId === boundaryId), false);
  const retained = current.editableResources.find(({ id }) => id === boundaryId);
  assert.ok(retained, 'removing a placement keeps edit authority at the maximum accepted ID');
  const changed = await api(harness, `/api/creador/recursos/${encodeURIComponent(boundaryId)}`, {
    version: retained.version, title: 'Título editado en el límite', description: 'Se conserva la identidad de 256 bytes.',
  }, { method: 'PATCH' });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.resource.id, boundaryId);

  current = await owner(harness);
  const updatedResource = current.editableResources.find(({ id }) => id === boundaryId);
  const readded = await api(harness, '/api/creador/enlaces', {
    resourceId: boundaryId, resourceVersion: updatedResource.version,
  });
  assert.equal(readded.status, 201);
  assert.equal(readded.data.link.resourceId, boundaryId);
  assert.equal(readded.data.link.placementId, linked.placementId);
  assert.equal(readded.data.link.title, 'Título editado en el límite');

  const otherOwnerEdit = await api(harness, `/api/creador/recursos/${encodeURIComponent(boundaryId)}`, {
    version: updatedResource.version, title: 'Otra persona no puede editar',
  }, { method: 'PATCH', session: 'creator-b' });
  assert.equal(otherOwnerEdit.status, 403);
  assert.equal((await owner(harness, 'creator-b')).links.some(({ resourceId }) => resourceId === boundaryId), false);
});

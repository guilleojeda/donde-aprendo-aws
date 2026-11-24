import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, createCreatorPagesHarness, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import { CREATOR_CONTRACT_VERSION } from '../src/lib/creator-values.mjs';

async function api(harness, path, body, { method = 'POST' } = {}) {
  return callApi(harness, path, {
    session: 'creator-a',
    csrf: sessionCsrf['creator-a'],
    ...(method === 'GET' ? {} : { creatorContract: CREATOR_CONTRACT_VERSION }),
    method,
    ...(body === undefined ? {} : { body }),
  });
}

async function owner(harness) {
  const response = await api(harness, '/api/creador/perfil', undefined, { method: 'GET' });
  assert.equal(response.status, 200);
  const snapshot = await responseJson(response);
  assert.equal(snapshot.schemaVersion, 3);
  return snapshot;
}

async function recordSnapshot(store) {
  return (await store.list('')).sort((left, right) => left.key.localeCompare(right.key));
}

test('duplicate URL Add and exact-ID reinclude preserve saved options and chapter sequence without writes', async () => {
  const harness = await createCreatorPagesHarness();
  const createdProfile = await api(harness, '/api/creador/perfil', {
    creatorVersion: null,
    displayName: 'Creadora',
    slug: 'canonical-noop-series',
  }, { method: 'PUT' });
  assert.equal(createdProfile.status, 200);
  assert.equal((await responseJson(createdProfile)).operation, 'save-profile');

  let current = await owner(harness);
  const added = await api(harness, '/api/creador/enlaces', {
    creatorVersion: current.creatorVersion,
    title: 'Recurso con capítulos',
    url: 'https://no-op.example/resource',
  });
  assert.equal(added.status, 201);
  const addAck = await responseJson(added);
  assert.equal(addAck.disposition, 'resource-created');
  const placementId = addAck.placementId;
  const resourceId = addAck.resourceId;

  current = await owner(harness);
  const configured = await api(harness, `/api/creador/enlaces/${placementId}`, {
    creatorVersion: current.creatorVersion,
    featured: true,
    selectedForDirectory: false,
  }, { method: 'PATCH' });
  assert.equal(configured.status, 200);
  assert.equal((await responseJson(configured)).operation, 'set-link-options');

  current = await owner(harness);
  const seriesResponse = await api(harness, '/api/creador/series', {
    creatorVersion: current.creatorVersion,
    name: 'Serie persistida',
    slug: 'serie-persistida',
  });
  assert.equal(seriesResponse.status, 201);
  const seriesAck = await responseJson(seriesResponse);
  current = await owner(harness);
  const chapter = await api(harness, `/api/creador/series/${seriesAck.seriesId}/capitulos/${placementId}`, {
    creatorVersion: current.creatorVersion,
  }, { method: 'PUT' });
  assert.equal(chapter.status, 200);

  const before = await owner(harness);
  assert.deepEqual(before.placements[placementId], { resourceId, selectedForDirectory: false });
  assert.deepEqual(before.order, { featured: [placementId], ordinary: [] });
  assert.deepEqual(before.series[seriesAck.seriesId].chapters, [placementId]);
  const recordsBefore = await recordSnapshot(harness.store);
  const transactionStart = harness.store.calls.length;

  const byUrl = await api(harness, '/api/creador/enlaces', {
    creatorVersion: before.creatorVersion,
    title: 'Título ignorado por una referencia existente',
    url: 'https://no-op.example/resource',
    selectedForDirectory: true,
  });
  assert.equal(byUrl.status, 200);
  const byUrlAck = await responseJson(byUrl);
  assert.equal(byUrlAck.operation, 'add-link');
  assert.equal(byUrlAck.disposition, 'already-present');
  assert.equal(byUrlAck.creatorVersion, before.creatorVersion);
  assert.equal(byUrlAck.placementId, placementId);
  assert.equal(byUrlAck.resourceId, resourceId);

  const byId = await api(harness, '/api/creador/enlaces', {
    creatorVersion: before.creatorVersion,
    resourceId,
    resourceVersion: before.resources.find(({ id }) => id === resourceId).version,
  });
  assert.equal(byId.status, 200);
  const byIdAck = await responseJson(byId);
  assert.equal(byIdAck.operation, 'reinclude-link');
  assert.equal(byIdAck.disposition, 'already-present');
  assert.equal(byIdAck.creatorVersion, before.creatorVersion);
  assert.equal(byIdAck.placementId, placementId);
  assert.equal(byIdAck.resourceId, resourceId);

  assert.deepEqual(await owner(harness), before,
    'both confirmations retain saved options, complete sequence, chapter membership, and resource authority');
  assert.deepEqual(await recordSnapshot(harness.store), recordsBefore, 'already-present confirmations write no records');
  const confirmations = harness.store.calls.slice(transactionStart)
    .filter(({ operation }) => operation === 'transact');
  assert.equal(confirmations.length, 2);
  assert.ok(confirmations.every(({ input }) => input.puts.length === 0 && input.deletes.length === 0),
    'each no-op checks its observations without writing aggregate or resource entities');
});

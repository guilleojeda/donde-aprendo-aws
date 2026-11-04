import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, createCreatorPagesHarness, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';

async function api(harness, path, body, { method = 'POST' } = {}) {
  return callApi(harness, path, {
    session: 'creator-a',
    csrf: sessionCsrf['creator-a'],
    method,
    ...(body === undefined ? {} : { body }),
  });
}

async function owner(harness) {
  const response = await api(harness, '/api/creador/perfil', undefined, { method: 'GET' });
  assert.equal(response.status, 200);
  return responseJson(response);
}

test('duplicate URL and exact-ID re-add return saved series and options without changing records', async () => {
  const harness = await createCreatorPagesHarness();
  assert.equal((await api(harness, '/api/creador/perfil', {
    displayName: 'Creadora', slug: 'canonical-noop-series',
  }, { method: 'PUT' })).status, 200);

  const added = await api(harness, '/api/creador/enlaces', {
    title: 'Recurso con capítulos', url: 'https://no-op.example/resource',
  });
  assert.equal(added.status, 201);
  const initialLink = (await responseJson(added)).link;

  let current = await owner(harness);
  const configured = await api(harness, `/api/creador/enlaces/${initialLink.placementId}/editar`, {
    profileVersion: current.profile.version,
    placementVersion: initialLink.placementVersion,
    resourceVersion: initialLink.resourceVersion,
    featured: true,
    selectedForDirectory: false,
  }, { method: 'PATCH' });
  assert.equal(configured.status, 200);

  current = await owner(harness);
  const seriesResponse = await api(harness, '/api/creador/series', {
    name: 'Serie persistida', slug: 'serie-persistida', profileVersion: current.profile.version,
  });
  assert.equal(seriesResponse.status, 201);
  const series = (await responseJson(seriesResponse)).series;
  current = await owner(harness);
  const savedLink = current.links.find(({ resourceId }) => resourceId === initialLink.resourceId);
  const chapter = await api(harness, `/api/creador/series/${series.id}/capitulos/${savedLink.placementId}`, {
    profileVersion: current.profile.version,
  }, { method: 'PUT' });
  assert.equal(chapter.status, 200);

  const before = await owner(harness);
  const expectedLink = before.links.find(({ resourceId }) => resourceId === initialLink.resourceId);
  assert.deepEqual(expectedLink.series, [{ seriesId: series.id, position: 0 }]);
  assert.equal(expectedLink.featured, true);
  assert.equal(expectedLink.selectedForDirectory, false);
  const recordsBefore = await harness.store.list('');
  const transactionStart = harness.store.calls.length;

  const byUrl = await api(harness, '/api/creador/enlaces', {
    title: 'Título ignorado por una referencia existente', url: expectedLink.url,
  });
  assert.equal(byUrl.status, 200);
  const byUrlResult = await responseJson(byUrl);
  assert.equal(byUrlResult.created, false);
  assert.deepEqual(byUrlResult.versionChanges, []);
  assert.deepEqual(byUrlResult.link, expectedLink);

  const byId = await api(harness, '/api/creador/enlaces', {
    resourceId: expectedLink.resourceId, resourceVersion: expectedLink.resourceVersion,
  });
  assert.equal(byId.status, 200);
  const byIdResult = await responseJson(byId);
  assert.equal(byIdResult.created, false);
  assert.deepEqual(byIdResult.versionChanges, []);
  assert.deepEqual(byIdResult.link, expectedLink);

  assert.deepEqual(await owner(harness), before, 'both confirmations preserve saved options, chapters and authority');
  assert.deepEqual(await harness.store.list(''), recordsBefore, 'condition-only confirmations do not write records');
  const confirmations = harness.store.calls.slice(transactionStart)
    .filter(({ operation }) => operation === 'transact');
  assert.equal(confirmations.length, 2);
  assert.ok(confirmations.every(({ input }) => input.puts.length === 0 && input.deletes.length === 0),
    'each no-op checks its observations without writing entities');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, createCreatorPagesHarness, readAdminRecord, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import { CREATOR_CONTRACT_VERSION } from '../src/lib/creator-values.mjs';

const profileSlug = 'regresion-series';

async function api(harness, path, { session = 'creator-a', method = 'GET', body } = {}) {
  return callApi(harness, path, {
    session, csrf: sessionCsrf[session], creatorContract: method === 'GET' ? '2' : CREATOR_CONTRACT_VERSION, method,
    ...(body === undefined ? {} : { body }),
  });
}

async function owner(harness) {
  const response = await api(harness, '/api/creador/perfil');
  assert.equal(response.status, 200);
  const snapshot = await responseJson(response);
  assert.equal(snapshot.schemaVersion, 2);
  return snapshot;
}

async function createPublishedProfile(harness) {
  const response = await api(harness, '/api/creador/perfil', {
    method: 'PUT', body: { creatorVersion: null, displayName: 'Creadora de series', slug: profileSlug },
  });
  assert.equal(response.status, 200);
  const created = await responseJson(response);
  let snapshot = await owner(harness);
  assert.equal(snapshot.profile.id, created.profileId);
  const published = await api(harness, '/api/creador/perfil/publicar', {
    method: 'POST', body: { creatorVersion: snapshot.creatorVersion },
  });
  assert.equal(published.status, 200);
  return owner(harness);
}

async function addLink(harness, title) {
  const current = await owner(harness);
  const response = await api(harness, '/api/creador/enlaces', {
    method: 'POST',
    body: { creatorVersion: current.creatorVersion, title, url: `https://example.com/${title.toLowerCase()}` },
  });
  assert.equal(response.status, 201);
  return responseJson(response);
}

async function createSeries(harness, name, slug) {
  const current = await owner(harness);
  const response = await api(harness, '/api/creador/series', {
    method: 'POST', body: { name, slug, creatorVersion: current.creatorVersion },
  });
  assert.equal(response.status, 201);
  return responseJson(response);
}

async function chapter(harness, seriesId, placementId, method = 'PUT') {
  const current = await owner(harness);
  return api(harness,
    `/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}`,
    { method, body: { creatorVersion: current.creatorVersion } });
}

async function publicSeries(harness, seriesSlug) {
  return harness.service.readPublicSeries(profileSlug, seriesSlug);
}

test('a renamed Series alias is not redirected when the Series has no visible chapters', async () => {
  const harness = await createCreatorPagesHarness();
  await createPublishedProfile(harness);
  const link = await addLink(harness, 'capitulo-visible');
  const series = await createSeries(harness, 'Serie temporal', 'serie-temporal');
  assert.equal((await chapter(harness, series.seriesId, link.placementId)).status, 200);

  let current = await owner(harness);
  const changed = await api(harness, `/api/creador/series/${encodeURIComponent(series.seriesId)}`, {
    method: 'PATCH',
    body: { creatorVersion: current.creatorVersion, slug: 'serie-canonica' },
  });
  assert.equal(changed.status, 200);
  const deletedChapter = await chapter(harness, series.seriesId, link.placementId, 'DELETE');
  assert.equal(deletedChapter.status, 200);
  assert.equal((await publicSeries(harness, 'serie-temporal')).status, 404);
  assert.equal((await publicSeries(harness, 'serie-canonica')).status, 404);

  assert.equal((await chapter(harness, series.seriesId, link.placementId)).status, 200);
  const hidden = await api(harness, `/api/admin/recursos/${encodeURIComponent(link.resourceId)}/ocultar`, {
    session: 'admin', method: 'POST', body: { version: (await readAdminRecord(harness, 'resource', link.resourceId)).version },
  });
  assert.equal(hidden.status, 200);
  assert.equal((await publicSeries(harness, 'serie-temporal')).status, 404);
  assert.equal((await publicSeries(harness, 'serie-canonica')).status, 404);
});

test('deleting one Series preserves another Series chapter sequence, and an existing chapter retry is a no-op', async () => {
  const harness = await createCreatorPagesHarness();
  await createPublishedProfile(harness);
  const link = await addLink(harness, 'capitulo-compartido');
  const deletedSeries = await createSeries(harness, 'Serie retirada', 'serie-retirada');
  const retainedSeries = await createSeries(harness, 'Serie vigente', 'serie-vigente');
  assert.equal((await chapter(harness, deletedSeries.seriesId, link.placementId)).status, 200);
  assert.equal((await chapter(harness, retainedSeries.seriesId, link.placementId)).status, 200);

  const beforeDelete = await owner(harness);
  assert.deepEqual(beforeDelete.series[deletedSeries.seriesId].chapters, [link.placementId]);
  assert.deepEqual(beforeDelete.series[retainedSeries.seriesId].chapters, [link.placementId]);
  const deleted = await api(harness, `/api/creador/series/${encodeURIComponent(deletedSeries.seriesId)}`, {
    method: 'DELETE', body: { creatorVersion: beforeDelete.creatorVersion },
  });
  assert.equal(deleted.status, 200);
  const deletedAck = await responseJson(deleted);
  assert.equal(deletedAck.operation, 'delete-series');
  assert.equal(deletedAck.seriesId, deletedSeries.seriesId);

  const afterDelete = await owner(harness);
  assert.equal(Object.hasOwn(afterDelete.series, deletedSeries.seriesId), false);
  assert.deepEqual(afterDelete.series[retainedSeries.seriesId].chapters, [link.placementId]);
  assert.equal(Object.hasOwn(afterDelete.placements, link.placementId), true);
  assert.equal((await publicSeries(harness, 'serie-retirada')).status, 404);
  assert.deepEqual((await publicSeries(harness, 'serie-vigente')).links.map(({ placementId }) => placementId), [link.placementId]);

  const duplicate = await chapter(harness, retainedSeries.seriesId, link.placementId);
  assert.equal(duplicate.status, 200);
  assert.equal((await responseJson(duplicate)).disposition, 'unchanged');
  assert.deepEqual(await owner(harness), afterDelete, 'an idempotent chapter add leaves the full aggregate unchanged');
});

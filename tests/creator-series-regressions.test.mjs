import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  readAdminRecord,
  responseJson,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';

const profileSlug = 'regresion-series';

async function api(harness, path, { session = 'creator-a', method = 'GET', body } = {}) {
  return callApi(harness, path, { session, csrf: sessionCsrf[session], method, ...(body === undefined ? {} : { body }) });
}

async function adminVersion(harness, type, id) {
  return (await readAdminRecord(harness, type, id)).version;
}

async function createPublishedProfile(harness) {
  assert.equal((await api(harness, '/api/creador/perfil', {
    method: 'PUT', body: { displayName: 'Creadora de series', slug: profileSlug },
  })).status, 200);
  assert.equal((await api(harness, '/api/creador/perfil/publicar', { method: 'POST', body: {} })).status, 200);
}

async function profileVersion(harness) {
  const response = await api(harness, '/api/creador/perfil');
  assert.equal(response.status, 200);
  return (await responseJson(response)).profile.version;
}

async function addLink(harness, title) {
  const response = await api(harness, '/api/creador/enlaces', {
    method: 'POST', body: { title, url: `https://example.com/${title.toLowerCase()}` },
  });
  assert.equal(response.status, 201);
  return (await responseJson(response)).link;
}

async function createSeries(harness, name, slug) {
  const response = await api(harness, '/api/creador/series', {
    method: 'POST', body: { name, slug, profileVersion: await profileVersion(harness) },
  });
  assert.equal(response.status, 201);
  return (await responseJson(response)).series;
}

async function chapter(harness, seriesId, placementId, method = 'PUT') {
  return api(harness, `/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}`, {
    method, body: { profileVersion: await profileVersion(harness) },
  });
}

test('a renamed series alias is not redirected when the series has no visible chapters', async () => {
  const harness = await createCreatorPagesHarness();
  await createPublishedProfile(harness);
  const link = await addLink(harness, 'capitulo-visible');
  const series = await createSeries(harness, 'Serie temporal', 'serie-temporal');
  assert.equal((await chapter(harness, series.id, link.placementId)).status, 200);

  const listed = await api(harness, '/api/creador/series');
  const listing = await responseJson(listed);
  const changed = await api(harness, `/api/creador/series/${encodeURIComponent(series.id)}`, {
    method: 'PATCH',
    body: { version: listing.series[0].version, profileVersion: listing.profileVersion, slug: 'serie-canonica' },
  });
  assert.equal(changed.status, 200);
  assert.equal((await chapter(harness, series.id, link.placementId, 'DELETE')).status, 204);
  assert.equal((await harness.service.readPublicSeries(profileSlug, 'serie-temporal')).status, 404);
  assert.equal((await harness.service.readPublicSeries(profileSlug, 'serie-canonica')).status, 404);

  assert.equal((await chapter(harness, series.id, link.placementId)).status, 200);
  const hidden = await api(harness, `/api/admin/recursos/${encodeURIComponent(link.resourceId)}/ocultar`, {
    session: 'admin', method: 'POST', body: { version: await adminVersion(harness, 'resource', link.resourceId) },
  });
  assert.equal(hidden.status, 200);
  assert.equal((await harness.service.readPublicSeries(profileSlug, 'serie-temporal')).status, 404);
  assert.equal((await harness.service.readPublicSeries(profileSlug, 'serie-canonica')).status, 404);
});

test('an idempotent chapter add cleans references to deleted series metadata', async () => {
  const harness = await createCreatorPagesHarness();
  await createPublishedProfile(harness);
  const link = await addLink(harness, 'capitulo-compartido');
  const deletedSeries = await createSeries(harness, 'Serie retirada', 'serie-retirada');
  const retainedSeries = await createSeries(harness, 'Serie vigente', 'serie-vigente');
  assert.equal((await chapter(harness, deletedSeries.id, link.placementId)).status, 200);
  assert.equal((await chapter(harness, retainedSeries.id, link.placementId)).status, 200);

  const current = await api(harness, '/api/creador/series');
  const listing = await responseJson(current);
  const seriesVersion = listing.series.find((item) => item.id === deletedSeries.id).version;
  assert.equal((await api(harness, `/api/creador/series/${encodeURIComponent(deletedSeries.id)}`, {
    method: 'DELETE', body: { version: seriesVersion, profileVersion: listing.profileVersion },
  })).status, 204);

  const activeVersion = await profileVersion(harness);
  const before = await harness.store.get(`placement:${(await harness.store.get('account-profile:private-account-a')).profileId}:${link.placementId}`);
  assert.equal(Object.hasOwn(before.series, deletedSeries.id), true);
  const addedAgain = await api(harness, `/api/creador/series/${encodeURIComponent(retainedSeries.id)}/capitulos/${encodeURIComponent(link.placementId)}`, {
    method: 'PUT', body: { profileVersion: activeVersion },
  });
  assert.equal(addedAgain.status, 200);

  const profileId = (await harness.store.get('account-profile:private-account-a')).profileId;
  const after = await harness.store.get(`placement:${profileId}:${link.placementId}`);
  assert.deepEqual(after.series, { [retainedSeries.id]: { position: 0 } });
  assert.equal(after.version, before.version + 1);
  const page = await harness.service.readPublicSeries(profileSlug, 'serie-vigente');
  assert.equal(page.status, 200);
  assert.deepEqual(page.links.map((item) => item.placementId), [link.placementId]);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, createCreatorPagesHarness, responseJson, seedResource, sessionCsrf } from './fixtures/creator-pages.mjs';

async function api(harness, path, session = 'creator-a', { method = 'GET', body } = {}) {
  return callApi(harness, path, { session, csrf: sessionCsrf[session], method, ...(body === undefined ? {} : { body }) });
}

async function createProfile(harness) {
  const response = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT', body: { displayName: 'Ana', slug: 'ana-receipt' },
  });
  assert.equal(response.status, 200);
  return (await responseJson(response)).profile;
}

async function addLink(harness, title, url) {
  const response = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { title, url, description: 'Descripción inicial' },
  });
  assert.ok([200, 201].includes(response.status));
  return { response, body: await responseJson(response) };
}

function changes(body) {
  return body.versionChanges.map(({ entity, id, before, after }) => ({ entity, id, before, after }));
}

test('un unrelated successful write does not make a stale resource form current', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const { body: initialLink } = await addLink(harness, 'Título inicial', 'https://example.com/initial');
  const observedProfileVersion = changes(initialLink).find((change) => change.entity === 'profile').after;

  const external = await api(harness, `/api/creador/recursos/${initialLink.link.resourceId}`, 'creator-a', {
    method: 'PATCH', body: { title: 'Título externo', version: initialLink.link.resourceVersion },
  });
  assert.equal(external.status, 200);
  const profileSave = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT', body: { displayName: 'Ana local', slug: profile.slug, version: observedProfileVersion },
  });
  assert.equal(profileSave.status, 200);
  assert.deepEqual(changes(await responseJson(profileSave)), [
    { entity: 'profile', id: profile.id, before: observedProfileVersion, after: observedProfileVersion + 1 },
  ]);

  const stale = await api(harness, `/api/creador/recursos/${initialLink.link.resourceId}`, 'creator-a', {
    method: 'PATCH', body: {
      title: initialLink.link.title,
      url: initialLink.link.url,
      description: 'Descripción local pendiente',
      version: initialLink.link.resourceVersion,
    },
  });
  assert.equal(stale.status, 409);
  assert.equal((await responseJson(stale)).error, 'RESOURCE_CONFLICT');
  assert.equal((await harness.store.get(`resource:${initialLink.link.resourceId}`)).title, 'Título externo');
});

test('profile and series stale submissions conflict after an unrelated resource save', async () => {
  const profileHarness = await createCreatorPagesHarness();
  const profile = await createProfile(profileHarness);
  const { body: profileLink } = await addLink(profileHarness, 'Guía', 'https://example.com/profile-symmetry');
  const observedProfile = (await responseJson(await api(profileHarness, '/api/creador/perfil'))).profile.version;
  const externalProfile = await api(profileHarness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT', body: { displayName: 'Nombre externo', slug: profile.slug, version: observedProfile },
  });
  assert.equal(externalProfile.status, 200);
  const unrelatedResourceSave = await api(profileHarness, `/api/creador/recursos/${profileLink.link.resourceId}`, 'creator-a', {
    method: 'PATCH', body: { description: 'Descripción propia', version: profileLink.link.resourceVersion },
  });
  assert.equal(unrelatedResourceSave.status, 200);
  const staleProfile = await api(profileHarness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT', body: { displayName: 'Nombre anterior', slug: profile.slug, version: observedProfile },
  });
  assert.equal(staleProfile.status, 409);
  assert.equal((await responseJson(staleProfile)).error, 'PROFILE_CONFLICT');
  assert.equal((await harnesslessEditor(profileHarness)).profile.displayName, 'Nombre externo');

  const seriesHarness = await createCreatorPagesHarness();
  await createProfile(seriesHarness);
  const { body: seriesLink } = await addLink(seriesHarness, 'Capítulo', 'https://example.com/series-symmetry');
  const observedSeriesProfileVersion = changes(seriesLink).find((change) => change.entity === 'profile').after;
  const created = await api(seriesHarness, '/api/creador/series', 'creator-a', {
    method: 'POST', body: { name: 'Nombre inicial', slug: 'nombre-inicial', profileVersion: observedSeriesProfileVersion },
  });
  const createdBody = await responseJson(created);
  const initialSeries = createdBody.series;
  const externalSeries = await api(seriesHarness, `/api/creador/series/${initialSeries.id}`, 'creator-a', {
    method: 'PATCH', body: { name: 'Nombre externo', version: initialSeries.version, profileVersion: createdBody.profileVersion },
  });
  assert.equal(externalSeries.status, 200);
  const unrelatedSeriesResourceSave = await api(seriesHarness, `/api/creador/recursos/${seriesLink.link.resourceId}`, 'creator-a', {
    method: 'PATCH', body: { description: 'Descripción propia', version: seriesLink.link.resourceVersion },
  });
  assert.equal(unrelatedSeriesResourceSave.status, 200);
  const staleSeries = await api(seriesHarness, `/api/creador/series/${initialSeries.id}`, 'creator-a', {
    method: 'PATCH', body: { name: 'Nombre anterior', version: initialSeries.version, profileVersion: (await responseJson(externalSeries)).profileVersion },
  });
  assert.equal(staleSeries.status, 409);
  assert.equal((await responseJson(staleSeries)).error, 'SERIES_CONFLICT');
  const currentSeries = (await responseJson(await api(seriesHarness, '/api/creador/series'))).series[0];
  assert.equal(currentSeries.name, 'Nombre externo');
});

async function harnesslessEditor(harness) {
  return responseJson(await api(harness, '/api/creador/perfil'));
}

test('receipts report committed profile, resource, placement, series, neighbor, idempotent, and 204 versions', async () => {
  const harness = await createCreatorPagesHarness();
  const profileResponse = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT', body: { displayName: 'Ana', slug: 'ana-receipt' },
  });
  const profileBody = await responseJson(profileResponse);
  const initialProfile = profileBody.profile;
  assert.deepEqual(changes(profileBody), [
    { entity: 'profile', id: initialProfile.id, before: 0, after: 1 },
  ]);
  const unchangedProfile = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT', body: { displayName: initialProfile.displayName, slug: initialProfile.slug, version: initialProfile.version },
  });
  assert.deepEqual(changes(await responseJson(unchangedProfile)), [], 'a no-op profile save does not invent a version increment');

  const first = await addLink(harness, 'Uno', 'https://example.com/receipt-one');
  const second = await addLink(harness, 'Dos', 'https://example.com/receipt-two');
  assert.equal(first.response.status, 201);
  assert.deepEqual(changes(first.body), [
    { entity: 'profile', id: initialProfile.id, before: 1, after: 2 },
    { entity: 'resource', id: first.body.link.resourceId, before: 0, after: 1 },
    { entity: 'placement', id: first.body.link.placementId, before: 0, after: 2 },
  ]);
  assert.deepEqual(changes(second.body).filter((change) => change.entity === 'profile'), [
    { entity: 'profile', id: initialProfile.id, before: 2, after: 3 },
  ]);

  const ordered = await api(harness, `/api/creador/enlaces/${second.body.link.placementId}`, 'creator-a', {
    method: 'PATCH', body: { position: first.body.link.position, version: second.body.link.placementVersion, profileVersion: 3 },
  });
  const orderedBody = await responseJson(ordered);
  assert.deepEqual(changes(orderedBody), [
    { entity: 'profile', id: initialProfile.id, before: 3, after: 4 },
    { entity: 'placement', id: second.body.link.placementId, before: second.body.link.placementVersion, after: second.body.link.placementVersion + 1 },
    { entity: 'placement', id: first.body.link.placementId, before: first.body.link.placementVersion, after: first.body.link.placementVersion + 1 },
  ]);

  const series = await api(harness, '/api/creador/series', 'creator-a', {
      method: 'POST', body: { name: 'Serie', slug: 'serie', profileVersion: 4 },
  });
  const seriesBody = await responseJson(series);
  assert.deepEqual(changes(seriesBody), [
    { entity: 'profile', id: initialProfile.id, before: 4, after: 5 },
    { entity: 'series', id: seriesBody.series.id, before: 0, after: 1 },
  ]);

  const chapter = await api(harness, `/api/creador/series/${seriesBody.series.id}/capitulos/${first.body.link.placementId}`, 'creator-a', {
    method: 'PUT', body: { profileVersion: 5 },
  });
  assert.deepEqual(changes(await responseJson(chapter)), [
    { entity: 'profile', id: initialProfile.id, before: 5, after: 6 },
    { entity: 'placement', id: first.body.link.placementId, before: first.body.link.placementVersion + 1, after: first.body.link.placementVersion + 2 },
  ]);
  const repeatedChapter = await api(harness, `/api/creador/series/${seriesBody.series.id}/capitulos/${first.body.link.placementId}`, 'creator-a', {
    method: 'PUT', body: { profileVersion: 6 },
  });
  assert.deepEqual(changes(await responseJson(repeatedChapter)), [], 'an idempotent chapter add reports no fictitious versions');

  const removed = await api(harness, `/api/creador/series/${seriesBody.series.id}/capitulos/${first.body.link.placementId}`, 'creator-a', {
    method: 'DELETE', body: { profileVersion: 6 },
  });
  assert.equal(removed.status, 204);
  assert.deepEqual(JSON.parse(removed.headers.get('Creator-Write-Versions')), [
    { entity: 'profile', id: initialProfile.id, before: 6, after: 7 },
    { entity: 'placement', id: first.body.link.placementId, before: first.body.link.placementVersion + 2, after: first.body.link.placementVersion + 3 },
  ]);
});

test('administrative claim linking reports effective resource versions without replacing newer classification', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  await seedResource(harness.store, {
    id: 'resource-claim-receipt',
    title: 'Recurso legado',
    url: 'https://example.com/claim-receipt',
    description: 'Texto original',
    category: 'Otros',
    kind: 'content',
    format: 'Artículo',
    topics: [],
    order: 1,
    featured: false,
    published: false,
    hidden: false,
    version: 1,
  });
  const claim = await api(harness, '/api/creador/reclamaciones', 'creator-a', {
    method: 'POST', body: { resourceIds: ['resource-claim-receipt'] },
  });
  assert.equal(claim.status, 202);

  const externalClassification = await api(harness, '/api/admin/recursos/resource-claim-receipt', 'admin', {
    method: 'PATCH', body: { category: 'Certificaciones', version: 1 },
  });
  assert.equal(externalClassification.status, 200);
  const linked = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', resourceIds: ['resource-claim-receipt'] },
  });
  assert.equal(linked.status, 200);
  const body = await responseJson(linked);
  const currentEditor = await responseJson(await api(harness, '/api/creador/perfil'));
  assert.deepEqual(changes(body), [
    { entity: 'profile', id: profile.id, before: 1, after: 2 },
    { entity: 'resource', id: 'resource-claim-receipt', before: 2, after: 3 },
    { entity: 'placement', id: currentEditor.links[0].placementId, before: 0, after: 2 },
  ]);
  const current = await harness.store.get('resource:resource-claim-receipt');
  assert.equal(current.category, 'Certificaciones', 'linking ownership preserves the external classification');
  assert.equal(current.editorProfileId, profile.id);
});

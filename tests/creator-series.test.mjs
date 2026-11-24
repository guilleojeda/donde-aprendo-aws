import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  readAdminRecord,
  responseJson,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';
import { CREATOR_CONTRACT_VERSION } from '../src/lib/creator-values.mjs';

const PROFILE_SLUGS = { 'creator-a': 'ana-series', 'creator-b': 'bea-series' };

async function api(harness, path, session = 'creator-a', { method = 'GET', body, csrf = sessionCsrf[session] } = {}) {
  return callApi(harness, path, {
    session, csrf, ...(method === 'GET' ? {} : { creatorContract: CREATOR_CONTRACT_VERSION }), method,
    ...(body === undefined ? {} : { body }),
  });
}

async function adminVersion(harness, type, id) {
  return (await readAdminRecord(harness, type, id)).version;
}

async function editor(harness, session = 'creator-a') {
  const response = await api(harness, '/api/creador/perfil', session);
  assert.equal(response.status, 200, `load editor for ${session}`);
  const snapshot = await responseJson(response);
  assert.equal(snapshot.schemaVersion, 3);
  assert.equal(Object.hasOwn(snapshot, 'links'), false);
  return snapshot;
}

async function saveProfile(harness, session = 'creator-a', fields = {}) {
  const before = await editor(harness, session);
  const response = await api(harness, '/api/creador/perfil', session, {
    method: 'PUT',
    body: {
      creatorVersion: before.profile ? before.creatorVersion : null,
      displayName: session === 'creator-b' ? 'Bea Creadora' : 'Ana Creadora',
      slug: PROFILE_SLUGS[session],
      ...fields,
    },
  });
  assert.equal(response.status, 200, `save profile for ${session}: ${await response.clone().text()}`);
  const ack = await responseJson(response);
  assert.equal(ack.operation, 'save-profile');
  return editor(harness, session);
}

async function publishProfile(harness, session = 'creator-a') {
  const before = await editor(harness, session);
  const response = await api(harness, '/api/creador/perfil/publicar', session, {
    method: 'POST', body: { creatorVersion: before.creatorVersion },
  });
  assert.equal(response.status, 200, `publish profile for ${session}`);
  const ack = await responseJson(response);
  assert.equal(ack.operation, 'publish-profile');
  return editor(harness, session);
}

async function createProfile(harness, session = 'creator-a', { publish = true, ...fields } = {}) {
  const snapshot = await saveProfile(harness, session, fields);
  return publish ? publishProfile(harness, session) : snapshot;
}

async function addLink(harness, session = 'creator-a', { title = 'Guía', url, selectedForDirectory = true } = {}) {
  const before = await editor(harness, session);
  const response = await api(harness, '/api/creador/enlaces', session, {
    method: 'POST',
    body: {
      creatorVersion: before.creatorVersion,
      title,
      url: url ?? `https://example.com/${encodeURIComponent(title.toLowerCase().replaceAll(' ', '-'))}`,
      selectedForDirectory,
    },
  });
  assert.ok(response.status === 200 || response.status === 201, `add link returned ${response.status}`);
  const ack = await responseJson(response);
  assert.equal(ack.operation, 'add-link');
  return ack;
}

async function createSeries(harness, { session = 'creator-a', name = 'Serie de ejemplo', slug = 'serie-ejemplo', description } = {}) {
  const current = await editor(harness, session);
  return api(harness, '/api/creador/series', session, {
    method: 'POST',
    body: {
      creatorVersion: current.creatorVersion,
      name,
      slug,
      ...(description === undefined ? {} : { description }),
    },
  });
}

async function createSeriesModel(harness, options = {}) {
  const response = await createSeries(harness, options);
  assert.equal(response.status, 201, `create series returned ${response.status}`);
  const ack = await responseJson(response);
  assert.equal(ack.schemaVersion, 2);
  assert.equal(ack.operation, 'create-series');
  return ack;
}

async function profileVersion(harness, session = 'creator-a') {
  return (await editor(harness, session)).creatorVersion;
}

async function assignChapter(harness, seriesId, placementId, { session = 'creator-a', method = 'PUT', creatorVersion } = {}) {
  return api(harness,
    `/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}`,
    session,
    { method, body: { creatorVersion: creatorVersion ?? await profileVersion(harness, session) } });
}

async function moveChapter(harness, seriesId, placementId, destination) {
  const current = await editor(harness);
  return api(harness,
    `/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}/mover`,
    'creator-a',
    { method: 'POST', body: { creatorVersion: current.creatorVersion, destination } });
}

function seriesValue(snapshot, seriesId) {
  const series = snapshot.series[seriesId];
  assert.ok(series, `owner snapshot includes series ${seriesId}`);
  return series;
}

async function publicSeries(harness, profileSlug, seriesSlug, search) {
  return harness.service.readPublicSeries(profileSlug, seriesSlug, search === undefined ? {} : { search });
}

function assertClientInputError(response, label) {
  assert.ok(response.status >= 400 && response.status < 500 && response.status !== 404,
    `${label} should be rejected by the series API, got ${response.status}`);
}

async function assertPublicReadUnavailableWithoutPartialData(result, label) {
  assert.equal(result.status, 503, `${label} should fail closed`);
  assert.equal(Object.hasOwn(result, 'profile'), false, `${label} must not return a partial profile`);
  assert.equal(Object.hasOwn(result, 'series'), false, `${label} must not return partial series metadata`);
  assert.equal(Object.hasOwn(result, 'links'), false, `${label} must not return partial chapters`);
}

test('Series commands keep stable identities and aliases while full reads supply current metadata and chapters', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const first = await addLink(harness, 'creator-a', { title: 'Capítulo inicial' });
  const created = await createSeries(harness, { name: 'Primeros pasos', slug: 'primeros-pasos', description: 'Una guía breve' });
  assert.equal(created.status, 201);
  const createdAck = await responseJson(created);
  assert.equal(createdAck.operation, 'create-series');
  assert.equal(createdAck.disposition, 'created');
  assert.equal(typeof createdAck.seriesId, 'string');
  assert.equal(createdAck.creatorVersion, await profileVersion(harness));

  let snapshot = await editor(harness);
  assert.deepEqual(seriesValue(snapshot, createdAck.seriesId), {
    name: 'Primeros pasos',
    slug: 'primeros-pasos',
    description: 'Una guía breve',
    chapters: [],
  });
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'primeros-pasos')).status, 404,
    'a series with no visible chapters is not public');

  const assigned = await assignChapter(harness, createdAck.seriesId, first.placementId);
  assert.equal(assigned.status, 200);
  const chapterAck = await responseJson(assigned);
  assert.equal(chapterAck.operation, 'add-chapter');
  assert.equal(chapterAck.placementId, first.placementId);
  snapshot = await editor(harness);
  assert.deepEqual(seriesValue(snapshot, createdAck.seriesId).chapters, [first.placementId]);

  const listing = await editor(harness);
  assert.equal(listing.profile.id, snapshot.profile.id);
  assert.ok(Array.isArray(listing.resources));
  assert.ok(listing.placements && listing.order);
  assert.equal(listing.creatorVersion, snapshot.creatorVersion);
  assert.deepEqual(listing.series, snapshot.series);
  assert.equal(Object.hasOwn(snapshot, 'profileVersion'), false);
  assert.equal(Object.hasOwn(snapshot.profile, 'version'), false);
  assert.equal(Object.hasOwn(snapshot, 'links'), false);
  assert.equal(snapshot.placements[first.placementId].resourceId, first.resourceId);

  const page = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'primeros-pasos');
  assert.equal(page.status, 200);
  assert.equal(page.series.name, 'Primeros pasos');
  assert.equal(page.series.slug, 'primeros-pasos');
  assert.equal(page.series.description, 'Una guía breve');
  assert.deepEqual(page.links.map((link) => link.placementId), [first.placementId]);
  const publicProfile = await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a']);
  assert.equal(publicProfile.status, 200);
  assert.equal(publicProfile.series.some((series) => series.id === createdAck.seriesId), true);

  let current = await editor(harness);
  const patched = await api(harness, `/api/creador/series/${encodeURIComponent(createdAck.seriesId)}`, 'creator-a', {
    method: 'PATCH',
    body: { creatorVersion: current.creatorVersion, name: 'API inicial', description: 'Del nombre, no del slug' },
  });
  assert.equal(patched.status, 200);
  const patchedAck = await responseJson(patched);
  assert.equal(patchedAck.operation, 'edit-series');
  assert.equal(patchedAck.disposition, 'saved');
  assert.equal(patchedAck.creatorVersion, current.creatorVersion + 1);
  current = await editor(harness);
  assert.equal(seriesValue(current, createdAck.seriesId).name, 'API inicial');
  assert.equal(seriesValue(current, createdAck.seriesId).slug, 'primeros-pasos');
  assert.equal(seriesValue(current, createdAck.seriesId).description, 'Del nombre, no del slug');

  const renamedSlug = await api(harness, `/api/creador/series/${encodeURIComponent(createdAck.seriesId)}`, 'creator-a', {
    method: 'PATCH',
    body: { creatorVersion: current.creatorVersion, slug: 'api-inicial' },
  });
  assert.equal(renamedSlug.status, 200);
  const renamedAck = await responseJson(renamedSlug);
  assert.equal(renamedAck.seriesId, createdAck.seriesId);
  current = await editor(harness);
  assert.equal(seriesValue(current, createdAck.seriesId).name, 'API inicial');
  assert.equal(seriesValue(current, createdAck.seriesId).slug, 'api-inicial');
  const oldSeriesAlias = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'primeros-pasos', '?ref=compartido');
  assert.equal(oldSeriesAlias.status, 308);
  assert.equal(oldSeriesAlias.redirectTo, `/c/${PROFILE_SLUGS['creator-a']}/series/api-inicial/?ref=compartido`);

  const deleted = await api(harness, `/api/creador/series/${encodeURIComponent(createdAck.seriesId)}`, 'creator-a', {
    method: 'DELETE', body: { creatorVersion: current.creatorVersion },
  });
  assert.equal(deleted.status, 200);
  const deleteAck = await responseJson(deleted);
  assert.equal(deleteAck.operation, 'delete-series');
  assert.equal(deleteAck.disposition, 'deleted');
  const afterDelete = await editor(harness);
  assert.equal(Object.hasOwn(afterDelete.series, createdAck.seriesId), false);
  assert.equal(Object.hasOwn(afterDelete.placements, first.placementId), true, 'deleting a series preserves profile placements');
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'api-inicial')).status, 404);
  const reservedSlug = await createSeries(harness, { name: 'Otra serie', slug: 'primeros-pasos' });
  assert.equal(reservedSlug.status, 409, 'a deleted series keeps its old slug reserved');
  const newIdentity = await createSeries(harness, { name: 'API inicial', slug: 'api-inicial-2' });
  assert.equal(newIdentity.status, 201);
  assert.notEqual((await responseJson(newIdentity)).seriesId, createdAck.seriesId);
});

test('Series and placements stay owner-scoped while identical slugs remain valid across profiles', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a');
  await createProfile(harness, 'creator-b');
  const linkA = await addLink(harness, 'creator-a', { title: 'Enlace Ana', url: 'https://example.com/shared-series-link' });
  const linkB = await addLink(harness, 'creator-b', { title: 'Enlace Bea', url: 'https://example.com/shared-series-link' });
  const seriesAResponse = await createSeries(harness, { name: 'Mismo nombre', slug: 'misma-serie' });
  const seriesBResponse = await createSeries(harness, { session: 'creator-b', name: 'Mismo nombre', slug: 'misma-serie' });
  assert.equal(seriesAResponse.status, 201);
  assert.equal(seriesBResponse.status, 201);
  const seriesA = await responseJson(seriesAResponse);
  const seriesB = await responseJson(seriesBResponse);
  assert.notEqual(seriesA.seriesId, seriesB.seriesId);

  assert.equal((await assignChapter(harness, seriesA.seriesId, linkA.placementId)).status, 200);
  assert.equal((await assignChapter(harness, seriesB.seriesId, linkB.placementId, { session: 'creator-b' })).status, 200);
  const currentA = await editor(harness, 'creator-a');
  const currentB = await editor(harness, 'creator-b');
  const foreignSeriesEdit = await api(harness, `/api/creador/series/${encodeURIComponent(seriesA.seriesId)}`, 'creator-b', {
    method: 'PATCH',
    body: { creatorVersion: currentB.creatorVersion, name: 'Intento ajeno' },
  });
  assert.equal(foreignSeriesEdit.status, 404);
  const foreignSeriesDelete = await api(harness, `/api/creador/series/${encodeURIComponent(seriesA.seriesId)}`, 'creator-b', {
    method: 'DELETE', body: { creatorVersion: currentB.creatorVersion },
  });
  assert.equal(foreignSeriesDelete.status, 404);
  const foreignPlacement = await assignChapter(harness, seriesA.seriesId, linkB.placementId, { session: 'creator-a' });
  assert.equal(foreignPlacement.status, 404);
  assert.deepEqual(Object.keys((await editor(harness, 'creator-a')).series), [seriesA.seriesId]);
  assert.deepEqual(Object.keys((await editor(harness, 'creator-b')).series), [seriesB.seriesId]);
  assert.deepEqual((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'misma-serie')).links.map((link) => link.placementId), [linkA.placementId]);
  assert.deepEqual((await publicSeries(harness, PROFILE_SLUGS['creator-b'], 'misma-serie')).links.map((link) => link.placementId), [linkB.placementId]);
  assert.equal(currentA.placements[linkA.placementId].resourceId, linkA.resourceId);

  const anonymousOwnerRead = await callApi(harness, '/api/creador/perfil');
  assert.equal(anonymousOwnerRead.status, 401, 'the canonical full owner read still requires authentication');
  const retiredSeriesList = await api(harness, '/api/creador/series');
  assert.equal(retiredSeriesList.status, 405, 'the incomplete Series-only owner read is retired');
  assert.equal((await responseJson(retiredSeriesList)).error, 'METHOD_NOT_ALLOWED');
  const noCsrf = await api(harness, '/api/creador/series', 'creator-a', {
    method: 'POST', csrf: '', body: { creatorVersion: currentA.creatorVersion, name: 'Nueva', slug: 'nueva-serie' },
  });
  assert.equal(noCsrf.status, 403);
});

test('chapter ordinals change one Series sequence without changing profile order, featured state, or another Series', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const links = [];
  for (const title of ['Uno', 'Dos', 'Tres']) links.push(await addLink(harness, 'creator-a', { title }));
  let current = await editor(harness);
  const featured = await api(harness, `/api/creador/enlaces/${encodeURIComponent(links[2].placementId)}`, 'creator-a', {
    method: 'PATCH', body: { creatorVersion: current.creatorVersion, featured: true },
  });
  assert.equal(featured.status, 200);
  const seriesOne = await createSeriesModel(harness, { name: 'Orden uno', slug: 'orden-uno' });
  const seriesTwo = await createSeriesModel(harness, { name: 'Orden dos', slug: 'orden-dos' });
  for (const link of links) assert.equal((await assignChapter(harness, seriesOne.seriesId, link.placementId)).status, 200);
  for (const link of [links[1], links[0]]) assert.equal((await assignChapter(harness, seriesTwo.seriesId, link.placementId)).status, 200);
  assert.deepEqual((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'orden-uno')).links.map((link) => link.placementId), links.map((link) => link.placementId));

  const duplicate = await assignChapter(harness, seriesOne.seriesId, links[0].placementId);
  assert.equal(duplicate.status, 200);
  assert.equal((await responseJson(duplicate)).disposition, 'unchanged');
  assert.deepEqual((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'orden-uno')).links.map((link) => link.placementId), links.map((link) => link.placementId));

  assert.equal((await moveChapter(harness, seriesOne.seriesId, links[0].placementId, 2)).status, 200);
  assert.equal((await moveChapter(harness, seriesOne.seriesId, links[0].placementId, 3)).status, 200);
  assert.equal((await moveChapter(harness, seriesTwo.seriesId, links[1].placementId, 2)).status, 200);
  current = await editor(harness);
  assert.deepEqual(current.series[seriesOne.seriesId].chapters, [links[1].placementId, links[2].placementId, links[0].placementId]);
  assert.deepEqual(current.series[seriesTwo.seriesId].chapters, [links[0].placementId, links[1].placementId]);
  assert.deepEqual(current.order, { featured: [links[2].placementId], ordinary: [links[0].placementId, links[1].placementId] });
  assert.equal(current.placements[links[2].placementId].selectedForDirectory, true);
  const one = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'orden-uno');
  const two = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'orden-dos');
  assert.deepEqual(one.links.map((link) => link.placementId), [links[1].placementId, links[2].placementId, links[0].placementId]);
  assert.deepEqual(two.links.map((link) => link.placementId), [links[0].placementId, links[1].placementId]);
  const profile = await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a']);
  assert.deepEqual(profile.links.map((link) => link.placementId), [links[2].placementId, links[0].placementId, links[1].placementId]);
  assert.equal(profile.links.find((link) => link.placementId === links[2].placementId).featured, true);

  const removed = await assignChapter(harness, seriesOne.seriesId, links[0].placementId, { method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.equal((await responseJson(removed)).operation, 'remove-chapter');
  const afterRemoval = await editor(harness);
  assert.deepEqual(afterRemoval.series[seriesOne.seriesId].chapters, [links[1].placementId, links[2].placementId]);
  assert.deepEqual(afterRemoval.series[seriesTwo.seriesId].chapters, [links[0].placementId, links[1].placementId]);
  assert.equal(Object.hasOwn(afterRemoval.placements, links[0].placementId), true,
    'removing a chapter keeps the placement in the creator content');
});

test('public Series include pending and unselected resources, hide hidden resources, and require a published visible profile', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a');
  await createProfile(harness, 'creator-b', { publish: false });
  const pending = await addLink(harness, 'creator-a', { title: 'Pendiente' });
  const unselected = await addLink(harness, 'creator-a', { title: 'No seleccionada', selectedForDirectory: false });
  const hidden = await addLink(harness, 'creator-a', { title: 'Oculta' });
  const series = await createSeriesModel(harness, { name: 'Pública', slug: 'publica' });
  const draftSeries = await createSeriesModel(harness, { session: 'creator-b', name: 'Borrador', slug: 'borrador-serie' });
  for (const link of [pending, unselected, hidden]) assert.equal((await assignChapter(harness, series.seriesId, link.placementId)).status, 200);
  const draftLink = await addLink(harness, 'creator-b', { title: 'En borrador' });
  assert.equal((await assignChapter(harness, draftSeries.seriesId, draftLink.placementId, { session: 'creator-b' })).status, 200);
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-b'], 'borrador-serie')).status, 404);

  const hiddenResource = await api(harness, `/api/admin/recursos/${encodeURIComponent(hidden.resourceId)}/ocultar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', hidden.resourceId) },
  });
  assert.equal(hiddenResource.status, 200);
  const page = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'publica');
  assert.equal(page.status, 200);
  assert.deepEqual(page.links.map((link) => link.placementId), [pending.placementId, unselected.placementId]);
  assert.equal(page.links[0].directoryApproval, 'pending');
  assert.equal(page.links[1].selectedForDirectory, false);

  const profileId = (await editor(harness)).profile.id;
  const profileHidden = await api(harness, `/api/admin/perfiles/${encodeURIComponent(profileId)}/ocultar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'profile', profileId) },
  });
  assert.equal(profileHidden.status, 200);
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'publica')).status, 404);
  const profileRestored = await api(harness, `/api/admin/perfiles/${encodeURIComponent(profileId)}/restaurar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'profile', profileId) },
  });
  assert.equal(profileRestored.status, 200);
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'publica')).status, 200);

  for (const link of [pending, unselected]) assert.equal((await assignChapter(harness, series.seriesId, link.placementId, { method: 'DELETE' })).status, 200);
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'publica')).status, 404,
    'hidden chapters do not make an otherwise empty series public');
});

test('profile and Series aliases resolve directly to canonical public URLs and preserve the query', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const link = await addLink(harness, 'creator-a', { title: 'Capítulo' });
  const created = await createSeriesModel(harness, { name: 'Nombre original', slug: 'slug-original' });
  assert.equal((await assignChapter(harness, created.seriesId, link.placementId)).status, 200);
  let current = await editor(harness);
  const changedSeries = await api(harness, `/api/creador/series/${encodeURIComponent(created.seriesId)}`, 'creator-a', {
    method: 'PATCH',
    body: { creatorVersion: current.creatorVersion, name: 'Título nuevo', slug: 'slug-nuevo' },
  });
  assert.equal(changedSeries.status, 200);
  current = await editor(harness);
  const changedProfile = await saveProfile(harness, 'creator-a', {
    displayName: current.profile.displayName,
    slug: 'ana-canonica',
  });
  assert.equal(changedProfile.profile.slug, 'ana-canonica');

  const redirect = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'slug-original', '?ref=compartido&tag=aws');
  assert.equal(redirect.status, 308);
  assert.equal(redirect.redirectTo, '/c/ana-canonica/series/slug-nuevo/?ref=compartido&tag=aws');
  const canonical = await publicSeries(harness, 'ana-canonica', 'slug-nuevo', '?ref=compartido');
  assert.equal(canonical.status, 200);
  assert.equal(canonical.profile.slug, 'ana-canonica');
  assert.equal(canonical.series.name, 'Título nuevo');
  const profileAliasWithSuffix = await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a'], {
    suffix: '/series/slug-original/', search: '?ref=compartido',
  });
  assert.equal(profileAliasWithSuffix.status, 308);
  assert.equal(profileAliasWithSuffix.redirectTo, '/c/ana-canonica/series/slug-original/?ref=compartido');
});

test('stale creator revisions conflict, concurrent Series edits do not overwrite, and link removal clears chapter membership', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const link = await addLink(harness, 'creator-a', { title: 'Reutilizable', url: 'https://example.com/reutilizable' });
  const created = await createSeriesModel(harness, { name: 'Reutilizable', slug: 'reutilizable' });
  assert.equal((await assignChapter(harness, created.seriesId, link.placementId)).status, 200);
  const beforeEdits = await editor(harness);
  const beforeVersion = beforeEdits.creatorVersion;
  const edits = await Promise.all([
    api(harness, `/api/creador/series/${encodeURIComponent(created.seriesId)}`, 'creator-a', {
      method: 'PATCH', body: { creatorVersion: beforeVersion, name: 'Edición A' },
    }),
    api(harness, `/api/creador/series/${encodeURIComponent(created.seriesId)}`, 'creator-a', {
      method: 'PATCH', body: { creatorVersion: beforeVersion, description: 'Edición B' },
    }),
  ]);
  assert.deepEqual(edits.map((response) => response.status).sort(), [200, 409]);
  const staleEdit = await api(harness, `/api/creador/series/${encodeURIComponent(created.seriesId)}`, 'creator-a', {
    method: 'PATCH', body: { creatorVersion: beforeVersion, name: 'Versión antigua' },
  });
  assert.equal(staleEdit.status, 409);

  const staleAdd = await assignChapter(harness, created.seriesId, link.placementId, { creatorVersion: beforeVersion });
  assert.equal(staleAdd.status, 409);
  const noCreatorVersion = await api(harness, `/api/creador/enlaces/${encodeURIComponent(link.placementId)}`, 'creator-a', {
    method: 'DELETE', body: {},
  });
  assert.equal(noCreatorVersion.status, 400);
  let current = await editor(harness);
  const deleteLink = await api(harness, `/api/creador/enlaces/${encodeURIComponent(link.placementId)}`, 'creator-a', {
    method: 'DELETE', body: { creatorVersion: current.creatorVersion },
  });
  assert.equal(deleteLink.status, 200);
  const deleteAck = await responseJson(deleteLink);
  assert.equal(deleteAck.operation, 'remove-link');
  current = await editor(harness);
  assert.deepEqual(current.series[created.seriesId].chapters, []);
  const recreated = await addLink(harness, 'creator-a', { title: 'Reutilizable', url: 'https://example.com/reutilizable' });
  assert.equal(recreated.placementId, link.placementId, 'the analytic placement ID is stable across removal and re-addition');
  current = await editor(harness);
  assert.deepEqual(current.series[created.seriesId].chapters, [], 'reinclude does not restore deleted chapter memberships');
  assert.deepEqual(current.order, { featured: [], ordinary: [recreated.placementId] });
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'reutilizable')).status, 404);
  const staleRetry = await assignChapter(harness, created.seriesId, recreated.placementId, { creatorVersion: beforeVersion });
  assert.equal(staleRetry.status, 409, 'a request carrying an old creator revision cannot restore a removed membership');
  assert.equal((await assignChapter(harness, created.seriesId, recreated.placementId)).status, 200);
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'reutilizable')).links[0].placementId, recreated.placementId);
});

test('a Series slug collision leaves both Series and the complete owner snapshot unchanged', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const first = await createSeriesModel(harness, { name: 'Serie principal', slug: 'slug-reservado' });
  const second = await createSeriesModel(harness, { name: 'Serie secundaria', slug: 'otro-slug' });
  const before = await editor(harness);
  const conflict = await api(harness, `/api/creador/series/${encodeURIComponent(second.seriesId)}`, 'creator-a', {
    method: 'PATCH', body: { creatorVersion: before.creatorVersion, slug: 'slug-reservado' },
  });
  assert.equal(conflict.status, 409);
  assert.deepEqual(await editor(harness), before);
  assert.equal(before.series[first.seriesId].slug, 'slug-reservado');
  assert.equal(before.series[second.seriesId].slug, 'otro-slug');
});

test('concurrent creation of one Series slug leaves exactly one aggregate entry', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const version = await profileVersion(harness);
  const creations = await Promise.all([
    api(harness, '/api/creador/series', 'creator-a', {
      method: 'POST', body: { creatorVersion: version, name: 'Primera petición', slug: 'slug-concurrente' },
    }),
    api(harness, '/api/creador/series', 'creator-a', {
      method: 'POST', body: { creatorVersion: version, name: 'Segunda petición', slug: 'slug-concurrente' },
    }),
  ]);
  assert.deepEqual(creations.map((response) => response.status).sort(), [201, 409]);
  const listing = await editor(harness);
  assert.equal(Object.keys(listing.series).length, 1);
  const [seriesId] = Object.keys(listing.series);
  assert.equal(listing.series[seriesId].slug, 'slug-concurrente');
  const successful = creations.find((response) => response.status === 201);
  assert.equal((await responseJson(successful)).seriesId, seriesId);
});

test('invalid Series writes preserve the aggregate and reserve no aliases', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const existing = await createSeriesModel(harness, { name: 'Serie conservada', slug: 'serie-conservada' });
  const profileId = (await editor(harness)).profile.id;
  const before = await editor(harness);
  const invalidCreates = [
    { name: '   ', slug: 'sin-nombre' },
    { name: 'Descripción inválida', slug: 'descripcion-invalida', description: { text: 'no es texto' } },
    { name: 'Slug con espacios', slug: 'slug con espacios' },
    { name: 'Slug con guiones repetidos', slug: 'slug--repetido' },
  ];
  for (const fields of invalidCreates) {
    const response = await api(harness, '/api/creador/series', 'creator-a', {
      method: 'POST', body: { ...fields, creatorVersion: before.creatorVersion },
    });
    assertClientInputError(response, `invalid create ${fields.slug}`);
    assert.equal(await harness.store.get(`series-alias:${profileId}:${fields.slug}`), null);
  }

  for (const patch of [
    { name: 42, slug: 'cambio-invalido' },
    { slug: 'slug--repetido' },
  ]) {
    const response = await api(harness, `/api/creador/series/${encodeURIComponent(existing.seriesId)}`, 'creator-a', {
      method: 'PATCH', body: { creatorVersion: before.creatorVersion, ...patch },
    });
    assertClientInputError(response, 'invalid metadata patch');
    if (patch.slug) assert.equal(await harness.store.get(`series-alias:${profileId}:${patch.slug}`), null);
  }
  assert.deepEqual(await editor(harness), before);
});

test('malformed aggregate Series metadata or chapter references make public and owner reads fail closed', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const link = await addLink(harness, 'creator-a', { title: 'Capítulo válido' });
  const series = await createSeriesModel(harness, { name: 'Serie válida', slug: 'serie-valida' });
  assert.equal((await assignChapter(harness, series.seriesId, link.placementId)).status, 200);
  const profileId = (await editor(harness)).profile.id;
  const profileKey = `profile:${profileId}`;
  const original = await harness.store.get(profileKey);
  const malformedSeries = {
    ...original,
    version: original.version + 1,
    series: { ...original.series, [series.seriesId]: { ...original.series[series.seriesId], name: null } },
  };
  assert.equal(await harness.store.transact({
    checks: [{ key: profileKey, version: original.version }],
    puts: [{ key: profileKey, value: malformedSeries }],
  }), true);
  await assertPublicReadUnavailableWithoutPartialData(await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'serie-valida'), 'series metadata');
  await assertPublicReadUnavailableWithoutPartialData(await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a']), 'profile series metadata');
  const ownerFailure = await api(harness, '/api/creador/perfil');
  assert.equal(ownerFailure.status, 503);

  const restored = { ...original, version: malformedSeries.version + 1 };
  assert.equal(await harness.store.transact({
    checks: [{ key: profileKey, version: malformedSeries.version }],
    puts: [{ key: profileKey, value: restored }],
  }), true);
  const malformedMembership = {
    ...restored,
    version: restored.version + 1,
    series: { ...restored.series, [series.seriesId]: { ...restored.series[series.seriesId], chapters: ['missing-placement'] } },
  };
  assert.equal(await harness.store.transact({
    checks: [{ key: profileKey, version: restored.version }],
    puts: [{ key: profileKey, value: malformedMembership }],
  }), true);
  await assertPublicReadUnavailableWithoutPartialData(await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'serie-valida'), 'series chapter reference');
  await assertPublicReadUnavailableWithoutPartialData(await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a']), 'profile chapter reference');
});

test('deleting a Series preserves links and directory selection, and later metadata reads fail closed on storage errors', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const link = await addLink(harness, 'creator-a', { title: 'Se conserva', selectedForDirectory: true });
  const created = await createSeriesModel(harness, { name: 'Con capítulos', slug: 'con-capitulos' });
  assert.equal((await assignChapter(harness, created.seriesId, link.placementId)).status, 200);
  const before = await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a']);
  const current = await editor(harness);
  const deleted = await api(harness, `/api/creador/series/${encodeURIComponent(created.seriesId)}`, 'creator-a', {
    method: 'DELETE', body: { creatorVersion: current.creatorVersion },
  });
  assert.equal(deleted.status, 200);
  assert.equal((await responseJson(deleted)).disposition, 'deleted');
  const after = await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a']);
  assert.deepEqual(after.links.map((item) => item.placementId), before.links.map((item) => item.placementId));
  assert.equal(after.links[0].selectedForDirectory, true);
  assert.equal(Object.hasOwn((await editor(harness)).series, created.seriesId), false);

  harness.store.failNext('get', new Error('storage unavailable'));
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'con-capitulos')).status, 503);
});

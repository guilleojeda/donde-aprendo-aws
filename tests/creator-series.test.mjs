import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';

const PROFILE_SLUGS = { 'creator-a': 'ana-series', 'creator-b': 'bea-series' };

async function api(harness, path, session = 'creator-a', { method = 'GET', body, csrf = sessionCsrf[session] } = {}) {
  return callApi(harness, path, { session, csrf, method, ...(body === undefined ? {} : { body }) });
}

async function saveProfile(harness, session = 'creator-a', fields = {}) {
  const response = await api(harness, '/api/creador/perfil', session, {
    method: 'PUT',
    body: { displayName: session === 'creator-b' ? 'Bea Creadora' : 'Ana Creadora', slug: PROFILE_SLUGS[session], ...fields },
  });
  assert.equal(response.status, 200, `save profile for ${session}`);
  return (await responseJson(response)).profile;
}

async function publishProfile(harness, session = 'creator-a') {
  const response = await api(harness, '/api/creador/perfil/publicar', session, { method: 'POST', body: {} });
  assert.equal(response.status, 200, `publish profile for ${session}`);
  return (await responseJson(response)).profile;
}

async function createProfile(harness, session = 'creator-a', { publish = true, ...fields } = {}) {
  const profile = await saveProfile(harness, session, fields);
  return publish ? publishProfile(harness, session) : profile;
}

async function editor(harness, session = 'creator-a') {
  const response = await api(harness, '/api/creador/perfil', session);
  assert.equal(response.status, 200, `load editor for ${session}`);
  return responseJson(response);
}

async function profileVersion(harness, session = 'creator-a') {
  return (await editor(harness, session)).profile.version;
}

async function addLink(harness, session = 'creator-a', { title = 'Guía', url, selectedForDirectory = true } = {}) {
  const response = await api(harness, '/api/creador/enlaces', session, {
    method: 'POST',
    body: { title, url: url ?? `https://example.com/${encodeURIComponent(title.toLowerCase().replaceAll(' ', '-'))}`, selectedForDirectory },
  });
  assert.ok(response.status === 200 || response.status === 201, `add link returned ${response.status}`);
  return (await responseJson(response)).link;
}

async function createSeries(harness, { session = 'creator-a', name = 'Serie de ejemplo', slug = 'serie-ejemplo', description } = {}) {
  return api(harness, '/api/creador/series', session, {
    method: 'POST',
    body: { name, slug, ...(description === undefined ? {} : { description }), profileVersion: await profileVersion(harness, session) },
  });
}

async function createSeriesModel(harness, options = {}) {
  const response = await createSeries(harness, options);
  assert.equal(response.status, 201, `create series returned ${response.status}`);
  return (await responseJson(response)).series;
}

async function listSeries(harness, session = 'creator-a') {
  const response = await api(harness, '/api/creador/series', session);
  assert.equal(response.status, 200, 'list owned series');
  return responseJson(response);
}

async function assignChapter(harness, seriesId, placementId, { session = 'creator-a', method = 'PUT', direction, version } = {}) {
  const body = { profileVersion: version ?? await profileVersion(harness, session), ...(direction ? { direction } : {}) };
  return api(harness, `/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}`, session, { method, body });
}

async function publicSeries(harness, profileSlug, seriesSlug, search) {
  return harness.service.readPublicSeries(profileSlug, seriesSlug, search === undefined ? {} : { search });
}

function assertClientInputError(response, label) {
  assert.ok(response.status >= 400 && response.status < 500 && response.status !== 404, `${label} should be rejected by the series API, got ${response.status}`);
}

async function assertPublicReadUnavailableWithoutPartialData(result, label) {
  assert.equal(result.status, 503, `${label} should fail closed`);
  assert.equal(Object.hasOwn(result, 'profile'), false, `${label} must not return a partial profile`);
  assert.equal(Object.hasOwn(result, 'series'), false, `${label} must not return partial series metadata`);
  assert.equal(Object.hasOwn(result, 'links'), false, `${label} must not return partial chapters`);
}

test('creator series CRUD keeps a stable ID, exposes metadata to the owner, and is public after its first chapter', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const first = await addLink(harness, 'creator-a', { title: 'Capítulo inicial' });
  const created = await createSeries(harness, { name: 'Primeros pasos', slug: 'primeros-pasos', description: 'Una guía breve' });
  assert.equal(created.status, 201);
  const createdBody = await responseJson(created);
  assert.equal(createdBody.series.name, 'Primeros pasos');
  assert.equal(createdBody.series.slug, 'primeros-pasos');
  assert.equal(createdBody.series.description, 'Una guía breve');
  assert.equal(typeof createdBody.series.id, 'string');
  assert.equal(typeof createdBody.series.version, 'number');
  assert.equal(createdBody.profileVersion, await profileVersion(harness));

  const emptyPage = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'primeros-pasos');
  assert.equal(emptyPage.status, 404, 'a series with no visible chapters is not public');
  const assigned = await assignChapter(harness, createdBody.series.id, first.placementId);
  assert.equal(assigned.status, 200);

  const listing = await listSeries(harness);
  assert.equal(listing.profileVersion, await profileVersion(harness));
  assert.equal(listing.series.length, 1);
  assert.equal(listing.series[0].id, createdBody.series.id);
  const ownerEditor = await editor(harness);
  assert.equal(ownerEditor.series.some((series) => series.id === createdBody.series.id), true);
  assert.equal(ownerEditor.links.some((link) => link.placementId === first.placementId), true);

  const page = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'primeros-pasos');
  assert.equal(page.status, 200);
  assert.equal(page.series.name, 'Primeros pasos');
  assert.equal(page.series.slug, 'primeros-pasos');
  assert.equal(page.series.description, 'Una guía breve');
  assert.deepEqual(page.links.map((link) => link.placementId), [first.placementId]);
  const publicProfile = await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a']);
  assert.equal(publicProfile.status, 200);
  assert.equal(publicProfile.series.some((series) => series.id === createdBody.series.id), true);

  const beforePatchVersion = (await listSeries(harness)).series[0].version;
  const patched = await api(harness, `/api/creador/series/${encodeURIComponent(createdBody.series.id)}`, 'creator-a', {
    method: 'PATCH',
    body: { version: beforePatchVersion, profileVersion: await profileVersion(harness), name: 'API inicial', description: 'Del nombre, no del slug' },
  });
  assert.equal(patched.status, 200);
  const patchedBody = await responseJson(patched);
  assert.equal(patchedBody.series.name, 'API inicial');
  assert.equal(patchedBody.series.slug, 'primeros-pasos');
  assert.equal(patchedBody.series.description, 'Del nombre, no del slug');

  const renamedSlug = await api(harness, `/api/creador/series/${encodeURIComponent(createdBody.series.id)}`, 'creator-a', {
    method: 'PATCH',
    body: { version: patchedBody.series.version, profileVersion: patchedBody.profileVersion, slug: 'api-inicial' },
  });
  assert.equal(renamedSlug.status, 200);
  const renamedBody = await responseJson(renamedSlug);
  assert.equal(renamedBody.series.id, createdBody.series.id);
  assert.equal(renamedBody.series.name, 'API inicial');
  assert.equal(renamedBody.series.slug, 'api-inicial');
  const oldSeriesAlias = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'primeros-pasos', '?ref=compartido');
  assert.equal(oldSeriesAlias.status, 308);
  assert.equal(oldSeriesAlias.redirectTo, `/c/${PROFILE_SLUGS['creator-a']}/series/api-inicial/?ref=compartido`);

  const deleted = await api(harness, `/api/creador/series/${encodeURIComponent(createdBody.series.id)}`, 'creator-a', {
    method: 'DELETE',
    body: { version: renamedBody.series.version, profileVersion: renamedBody.profileVersion },
  });
  assert.equal(deleted.status, 204);
  const afterDelete = await editor(harness);
  assert.equal(afterDelete.links.some((link) => link.placementId === first.placementId), true, 'deleting a series preserves profile links');
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'api-inicial')).status, 404);
  const reservedSlug = await createSeries(harness, { name: 'Otra serie', slug: 'primeros-pasos' });
  assert.equal(reservedSlug.status, 409, 'a deleted series keeps its old slug reserved');
  const newIdentity = await createSeries(harness, { name: 'API inicial', slug: 'api-inicial-2' });
  assert.equal(newIdentity.status, 201);
  assert.notEqual((await responseJson(newIdentity)).series.id, createdBody.series.id);
});

test('series and placements are scoped to their owner while identical slugs are allowed in different profiles', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a');
  await createProfile(harness, 'creator-b');
  const linkA = await addLink(harness, 'creator-a', { title: 'Enlace Ana', url: 'https://example.com/shared-series-link' });
  const linkB = await addLink(harness, 'creator-b', { title: 'Enlace Bea', url: 'https://example.com/shared-series-link' });
  const seriesAResponse = await createSeries(harness, { name: 'Mismo nombre', slug: 'misma-serie' });
  const seriesBResponse = await createSeries(harness, { session: 'creator-b', name: 'Mismo nombre', slug: 'misma-serie' });
  assert.equal(seriesAResponse.status, 201);
  assert.equal(seriesBResponse.status, 201);
  const seriesA = (await responseJson(seriesAResponse)).series;
  const seriesB = (await responseJson(seriesBResponse)).series;
  assert.notEqual(seriesA.id, seriesB.id);

  assert.equal((await assignChapter(harness, seriesA.id, linkA.placementId)).status, 200);
  assert.equal((await assignChapter(harness, seriesB.id, linkB.placementId, { session: 'creator-b' })).status, 200);
  const currentSeriesA = (await listSeries(harness, 'creator-a')).series[0];
  const foreignSeriesEdit = await api(harness, `/api/creador/series/${encodeURIComponent(seriesA.id)}`, 'creator-b', {
    method: 'PATCH',
    body: { version: currentSeriesA.version, profileVersion: await profileVersion(harness, 'creator-b'), name: 'Intento ajeno' },
  });
  assert.ok([404, 403].includes(foreignSeriesEdit.status));
  const foreignSeriesDelete = await api(harness, `/api/creador/series/${encodeURIComponent(seriesA.id)}`, 'creator-b', {
    method: 'DELETE',
    body: { version: currentSeriesA.version, profileVersion: await profileVersion(harness, 'creator-b') },
  });
  assert.ok([404, 403].includes(foreignSeriesDelete.status));
  const foreignPlacement = await assignChapter(harness, seriesA.id, linkB.placementId, { session: 'creator-a' });
  assert.ok([404, 403].includes(foreignPlacement.status));
  assert.deepEqual((await listSeries(harness, 'creator-a')).series.map((series) => series.id), [seriesA.id]);
  assert.deepEqual((await listSeries(harness, 'creator-b')).series.map((series) => series.id), [seriesB.id]);
  assert.deepEqual((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'misma-serie')).links.map((link) => link.placementId), [linkA.placementId]);
  assert.deepEqual((await publicSeries(harness, PROFILE_SLUGS['creator-b'], 'misma-serie')).links.map((link) => link.placementId), [linkB.placementId]);

  const anonymous = await callApi(harness, '/api/creador/series');
  assert.equal(anonymous.status, 401);
  const noCsrf = await api(harness, '/api/creador/series', 'creator-a', { method: 'POST', csrf: '', body: { name: 'Nueva', slug: 'nueva-serie', profileVersion: await profileVersion(harness) } });
  assert.equal(noCsrf.status, 403);
});

test('chapter order belongs to each series and does not change profile order, featured state, or another series', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const links = [];
  for (const title of ['Uno', 'Dos', 'Tres']) links.push(await addLink(harness, 'creator-a', { title }));
  const featured = await api(harness, `/api/creador/enlaces/${encodeURIComponent(links[2].placementId)}`, 'creator-a', {
    method: 'PATCH', body: { featured: true, version: links[2].placementVersion },
  });
  assert.equal(featured.status, 200);
  const seriesOne = await createSeriesModel(harness, { name: 'Orden uno', slug: 'orden-uno' });
  const seriesTwo = await createSeriesModel(harness, { name: 'Orden dos', slug: 'orden-dos' });
  for (const link of links) assert.equal((await assignChapter(harness, seriesOne.id, link.placementId)).status, 200);
  for (const link of [links[1], links[0]]) assert.equal((await assignChapter(harness, seriesTwo.id, link.placementId)).status, 200);
  const beforeDuplicate = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'orden-uno');
  assert.deepEqual(beforeDuplicate.links.map((link) => link.placementId), links.map((link) => link.placementId));
  assert.equal((await assignChapter(harness, seriesOne.id, links[0].placementId)).status, 200);
  const afterDuplicate = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'orden-uno');
  assert.deepEqual(afterDuplicate.links.map((link) => link.placementId), links.map((link) => link.placementId), 'adding an existing chapter twice does not duplicate or reorder it');
  assert.equal((await assignChapter(harness, seriesOne.id, links[0].placementId, { method: 'PATCH', direction: 'down' })).status, 200);
  assert.equal((await assignChapter(harness, seriesOne.id, links[0].placementId, { method: 'PATCH', direction: 'down' })).status, 200);
  assert.equal((await assignChapter(harness, seriesTwo.id, links[1].placementId, { method: 'PATCH', direction: 'down' })).status, 200);

  const one = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'orden-uno');
  const two = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'orden-dos');
  assert.deepEqual(one.links.map((link) => link.placementId), [links[1].placementId, links[2].placementId, links[0].placementId]);
  assert.deepEqual(two.links.map((link) => link.placementId), [links[0].placementId, links[1].placementId]);
  assert.equal(one.links.find((link) => link.placementId === links[2].placementId).featured, true);
  const profile = await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a']);
  assert.deepEqual(profile.links.map((link) => link.placementId), [links[2].placementId, links[0].placementId, links[1].placementId]);
  assert.equal(profile.links.find((link) => link.placementId === links[2].placementId).featured, true);

  assert.equal((await assignChapter(harness, seriesOne.id, links[0].placementId, { method: 'DELETE' })).status, 204);
  const afterRemovalOne = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'orden-uno');
  const afterRemovalTwo = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'orden-dos');
  assert.deepEqual(afterRemovalOne.links.map((link) => link.placementId), [links[1].placementId, links[2].placementId]);
  assert.deepEqual(afterRemovalTwo.links.map((link) => link.placementId), [links[0].placementId, links[1].placementId]);
  assert.equal((await editor(harness)).links.some((link) => link.placementId === links[0].placementId), true, 'removing a chapter keeps the placement on the profile');
});

test('public series show pending and unselected links, hide hidden resources, and require a published visible profile', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a');
  await createProfile(harness, 'creator-b', { publish: false });
  const pending = await addLink(harness, 'creator-a', { title: 'Pendiente' });
  const unselected = await addLink(harness, 'creator-a', { title: 'No seleccionada', selectedForDirectory: false });
  const hidden = await addLink(harness, 'creator-a', { title: 'Oculta' });
  const series = await createSeriesModel(harness, { name: 'Pública', slug: 'publica' });
  const draftSeries = await createSeriesModel(harness, { session: 'creator-b', name: 'Borrador', slug: 'borrador-serie' });
  for (const link of [pending, unselected, hidden]) assert.equal((await assignChapter(harness, series.id, link.placementId)).status, 200);
  const draftLink = await addLink(harness, 'creator-b', { title: 'En borrador' });
  assert.equal((await assignChapter(harness, draftSeries.id, draftLink.placementId, { session: 'creator-b' })).status, 200);
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-b'], 'borrador-serie')).status, 404);

  const hiddenResource = await api(harness, `/api/admin/recursos/${encodeURIComponent(hidden.resourceId)}/ocultar`, 'admin', { method: 'POST', body: {} });
  assert.equal(hiddenResource.status, 200);
  const page = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'publica');
  assert.equal(page.status, 200);
  assert.deepEqual(page.links.map((link) => link.placementId), [pending.placementId, unselected.placementId]);
  assert.equal(page.links[0].directoryApproval, 'pending');
  assert.equal(page.links[1].selectedForDirectory, false);

  const profileId = (await editor(harness)).profile.id;
  const profileHidden = await api(harness, `/api/admin/perfiles/${encodeURIComponent(profileId)}/ocultar`, 'admin', { method: 'POST', body: {} });
  assert.equal(profileHidden.status, 200);
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'publica')).status, 404);
  const profileRestored = await api(harness, `/api/admin/perfiles/${encodeURIComponent(profileId)}/restaurar`, 'admin', { method: 'POST', body: {} });
  assert.equal(profileRestored.status, 200);
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'publica')).status, 200);

  for (const link of [pending, unselected]) assert.equal((await assignChapter(harness, series.id, link.placementId, { method: 'DELETE' })).status, 204);
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'publica')).status, 404, 'hidden chapters do not make an otherwise empty series public');
});

test('profile and series aliases resolve directly to canonical series URLs with the query preserved', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const link = await addLink(harness, 'creator-a', { title: 'Capítulo' });
  const created = await createSeriesModel(harness, { name: 'Nombre original', slug: 'slug-original' });
  assert.equal((await assignChapter(harness, created.id, link.placementId)).status, 200);
  const currentSeries = (await listSeries(harness)).series[0];
  const changedSeries = await api(harness, `/api/creador/series/${encodeURIComponent(created.id)}`, 'creator-a', {
    method: 'PATCH', body: { version: currentSeries.version, profileVersion: await profileVersion(harness), name: 'Título nuevo', slug: 'slug-nuevo' },
  });
  assert.equal(changedSeries.status, 200);
  const changed = (await responseJson(changedSeries)).series;
  const currentProfile = await editor(harness);
  const changedProfile = await saveProfile(harness, 'creator-a', { displayName: currentProfile.profile.displayName, slug: 'ana-canonica', version: currentProfile.profile.version });
  assert.equal(changedProfile.slug, 'ana-canonica');

  const redirect = await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'slug-original', '?ref=compartido&tag=aws');
  assert.equal(redirect.status, 308);
  assert.equal(redirect.redirectTo, '/c/ana-canonica/series/slug-nuevo/?ref=compartido&tag=aws');
  const canonical = await publicSeries(harness, 'ana-canonica', changed.slug, '?ref=compartido');
  assert.equal(canonical.status, 200);
  assert.equal(canonical.profile.slug, 'ana-canonica');
  assert.equal(canonical.series.name, 'Título nuevo');
  const profileAliasWithSuffix = await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a'], { suffix: '/series/slug-original/', search: '?ref=compartido' });
  assert.equal(profileAliasWithSuffix.status, 308);
  assert.equal(profileAliasWithSuffix.redirectTo, '/c/ana-canonica/series/slug-original/?ref=compartido');
});

test('stale versions conflict, concurrent metadata edits do not overwrite each other, and deleting a link clears membership', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const link = await addLink(harness, 'creator-a', { title: 'Reutilizable', url: 'https://example.com/reutilizable' });
  const created = await createSeriesModel(harness, { name: 'Reutilizable', slug: 'reutilizable' });
  assert.equal((await assignChapter(harness, created.id, link.placementId)).status, 200);
  const beforeEdits = (await listSeries(harness)).series[0];
  const beforeProfileVersion = await profileVersion(harness);
  const edits = await Promise.all([
    api(harness, `/api/creador/series/${encodeURIComponent(created.id)}`, 'creator-a', {
      method: 'PATCH', body: { version: beforeEdits.version, profileVersion: beforeProfileVersion, name: 'Edición A' },
    }),
    api(harness, `/api/creador/series/${encodeURIComponent(created.id)}`, 'creator-a', {
      method: 'PATCH', body: { version: beforeEdits.version, profileVersion: beforeProfileVersion, description: 'Edición B' },
    }),
  ]);
  assert.deepEqual(edits.map((response) => response.status).sort(), [200, 409]);
  const staleEdit = await api(harness, `/api/creador/series/${encodeURIComponent(created.id)}`, 'creator-a', {
    method: 'PATCH', body: { version: beforeEdits.version, profileVersion: beforeProfileVersion, name: 'Versión antigua' },
  });
  assert.equal(staleEdit.status, 409);

  const staleAdd = await assignChapter(harness, created.id, link.placementId, { version: beforeProfileVersion });
  assert.equal(staleAdd.status, 409);
  const noProfileVersionDelete = await api(harness, `/api/creador/enlaces/${encodeURIComponent(link.placementId)}`, 'creator-a', { method: 'DELETE', body: {} });
  assert.ok(noProfileVersionDelete.status >= 400 && noProfileVersionDelete.status < 500);
  const deleteLink = await api(harness, `/api/creador/enlaces/${encodeURIComponent(link.placementId)}`, 'creator-a', {
    method: 'DELETE', body: { profileVersion: await profileVersion(harness) },
  });
  assert.equal(deleteLink.status, 204);
  const recreated = await addLink(harness, 'creator-a', { title: 'Reutilizable', url: 'https://example.com/reutilizable' });
  assert.equal(recreated.placementId, link.placementId, 'the analytic placement ID is stable across removal and re-addition');
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'reutilizable')).status, 404);
  const staleRetry = await assignChapter(harness, created.id, recreated.placementId, { version: beforeProfileVersion });
  assert.equal(staleRetry.status, 409, 'a request carrying the old profile version cannot restore a removed membership');
  assert.equal((await assignChapter(harness, created.id, recreated.placementId)).status, 200);
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'reutilizable')).links[0].placementId, recreated.placementId);

  const legacy = await addLink(harness, 'creator-a', { title: 'Sin serie', url: 'https://example.com/sin-serie' });
  const oldDeleteContract = await api(harness, `/api/creador/enlaces/${encodeURIComponent(legacy.placementId)}`, 'creator-a', { method: 'DELETE' });
  assert.equal(oldDeleteContract.status, 204, 'a link without series memberships keeps the existing delete contract');
});

test('a slug collision within one profile preserves both series and their versions', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const first = await createSeriesModel(harness, { name: 'Serie principal', slug: 'slug-reservado' });
  const second = await createSeriesModel(harness, { name: 'Serie secundaria', slug: 'otro-slug' });
  const before = await listSeries(harness);
  const conflict = await api(harness, `/api/creador/series/${encodeURIComponent(second.id)}`, 'creator-a', {
    method: 'PATCH',
    body: { version: before.series.find((series) => series.id === second.id).version, profileVersion: before.profileVersion, slug: 'slug-reservado' },
  });
  assert.equal(conflict.status, 409);
  const after = await listSeries(harness);
  assert.equal(after.profileVersion, before.profileVersion);
  assert.deepEqual(after.series, before.series);
  assert.equal(after.series.find((series) => series.id === first.id).slug, 'slug-reservado');
  assert.equal(after.series.find((series) => series.id === second.id).slug, 'otro-slug');
});

test('concurrent creation of one profile slug leaves exactly one series', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const creations = await Promise.all([
    createSeries(harness, { name: 'Primera petición', slug: 'slug-concurrente' }),
    createSeries(harness, { name: 'Segunda petición', slug: 'slug-concurrente' }),
  ]);
  assert.deepEqual(creations.map((response) => response.status).sort(), [201, 409]);
  const listing = await listSeries(harness);
  assert.equal(listing.series.length, 1);
  assert.equal(listing.series[0].slug, 'slug-concurrente');
  const successful = creations.find((response) => response.status === 201);
  assert.equal((await responseJson(successful)).series.id, listing.series[0].id);
});

test('invalid series writes leave metadata, aliases, and profile version unchanged', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const existing = await createSeriesModel(harness, { name: 'Serie conservada', slug: 'serie-conservada' });
  const profileId = (await editor(harness)).profile.id;
  const before = await listSeries(harness);
  const invalidCreates = [
    { name: '   ', slug: 'sin-nombre' },
    { name: 'Descripción inválida', slug: 'descripcion-invalida', description: { text: 'no es texto' } },
    { name: 'Slug con espacios', slug: 'slug con espacios' },
    { name: 'Slug con guiones repetidos', slug: 'slug--repetido' },
  ];
  for (const fields of invalidCreates) {
    const response = await api(harness, '/api/creador/series', 'creator-a', {
      method: 'POST', body: { ...fields, profileVersion: before.profileVersion },
    });
    assertClientInputError(response, `invalid create ${fields.slug}`);
    assert.equal(await harness.store.get(`series-alias:${profileId}:${fields.slug}`), null);
  }

  const invalidPatch = await api(harness, `/api/creador/series/${encodeURIComponent(existing.id)}`, 'creator-a', {
    method: 'PATCH',
    body: { version: before.series.find((series) => series.id === existing.id).version, profileVersion: before.profileVersion, name: 42, slug: 'cambio-invalido' },
  });
  assertClientInputError(invalidPatch, 'invalid metadata patch');
  assert.equal(await harness.store.get(`series-alias:${profileId}:cambio-invalido`), null);

  const invalidSlugPatch = await api(harness, `/api/creador/series/${encodeURIComponent(existing.id)}`, 'creator-a', {
    method: 'PATCH',
    body: {
      version: before.series.find((series) => series.id === existing.id).version,
      profileVersion: before.profileVersion,
      slug: 'slug--repetido',
    },
  });
  assertClientInputError(invalidSlugPatch, 'invalid slug metadata patch');

  const after = await listSeries(harness);
  assert.equal(after.profileVersion, before.profileVersion);
  assert.deepEqual(after.series, before.series);
});

test('malformed series metadata or membership makes public reads fail without returning a partial page', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const link = await addLink(harness, 'creator-a', { title: 'Capítulo válido' });
  const series = await createSeriesModel(harness, { name: 'Serie válida', slug: 'serie-valida' });
  assert.equal((await assignChapter(harness, series.id, link.placementId)).status, 200);
  const profileId = (await editor(harness)).profile.id;
  const seriesKey = `series:${profileId}:${series.id}`;
  const seriesRecord = await harness.store.get(seriesKey);
  const malformedSeries = { ...seriesRecord, name: null, version: seriesRecord.version + 1 };
  assert.equal(await harness.store.transact({
    checks: [{ key: seriesKey, version: seriesRecord.version }],
    puts: [{ key: seriesKey, value: malformedSeries }],
  }), true);
  await assertPublicReadUnavailableWithoutPartialData(await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'serie-valida'), 'series metadata');
  await assertPublicReadUnavailableWithoutPartialData(await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a']), 'profile series metadata');

  const currentSeries = await harness.store.get(seriesKey);
  assert.equal(await harness.store.transact({
    checks: [{ key: seriesKey, version: currentSeries.version }],
    puts: [{ key: seriesKey, value: { ...currentSeries, name: seriesRecord.name, version: currentSeries.version + 1 } }],
  }), true);
  const placementKey = `placement:${profileId}:${link.placementId}`;
  const placement = await harness.store.get(placementKey);
  assert.ok(placement.series?.[series.id], 'fixture uses the approved placement.series[seriesId] membership map');
  const malformedPlacement = {
    ...placement,
    series: { ...placement.series, [series.id]: { ...placement.series[series.id], position: 'primero' } },
    version: placement.version + 1,
  };
  assert.equal(await harness.store.transact({
    checks: [{ key: placementKey, version: placement.version }],
    puts: [{ key: placementKey, value: malformedPlacement }],
  }), true);
  await assertPublicReadUnavailableWithoutPartialData(await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'serie-valida'), 'series membership');
  await assertPublicReadUnavailableWithoutPartialData(await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a']), 'profile series membership');
});

test('series deletion leaves links and directory selection intact, and series metadata reads fail closed', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const link = await addLink(harness, 'creator-a', { title: 'Se conserva', selectedForDirectory: true });
  const created = await createSeriesModel(harness, { name: 'Con capítulos', slug: 'con-capitulos' });
  assert.equal((await assignChapter(harness, created.id, link.placementId)).status, 200);
  const before = await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a']);
  const currentSeries = (await listSeries(harness)).series[0];
  const deleted = await api(harness, `/api/creador/series/${encodeURIComponent(created.id)}`, 'creator-a', {
    method: 'DELETE', body: { version: currentSeries.version, profileVersion: await profileVersion(harness) },
  });
  assert.equal(deleted.status, 204);
  const after = await harness.service.readPublicProfile(PROFILE_SLUGS['creator-a']);
  assert.deepEqual(after.links.map((item) => item.placementId), before.links.map((item) => item.placementId));
  assert.equal(after.links[0].selectedForDirectory, true);

  harness.store.failNext('get', new Error('storage unavailable'));
  assert.equal((await publicSeries(harness, PROFILE_SLUGS['creator-a'], 'con-capitulos')).status, 503);
});

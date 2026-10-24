import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  seedResource,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';

async function api(harness, path, session = 'creator-a', options = {}) {
  return callApi(harness, path, {
    session,
    csrf: sessionCsrf[session],
    ...options,
  });
}

async function saveProfile(harness, session = 'creator-a', fields = {}) {
  return api(harness, '/api/creador/perfil', session, {
    method: 'PUT',
    body: {
      displayName: 'Ana Creadora',
      slug: session === 'creator-b' ? 'ana-dos' : 'ana-uno',
      ...fields,
    },
  });
}

async function publishProfile(harness, session = 'creator-a') {
  return api(harness, '/api/creador/perfil/publicar', session, { method: 'POST', body: {} });
}

async function createProfile(harness, session = 'creator-a', fields = {}, { publish = true } = {}) {
  const saved = await saveProfile(harness, session, fields);
  assert.ok(saved.ok, `saving the ${session} profile failed with ${saved.status}`);
  const savedBody = await responseJson(saved);
  if (publish) {
    const published = await publishProfile(harness, session);
    assert.ok(published.ok, `publishing the ${session} profile failed with ${published.status}`);
    return (await responseJson(published)).profile ?? savedBody.profile;
  }
  return savedBody.profile;
}

async function addLink(harness, session = 'creator-a', fields = {}) {
  return api(harness, '/api/creador/enlaces', session, {
    method: 'POST',
    body: { title: 'Guía de AWS', url: 'https://example.com/guia', ...fields },
  });
}

async function classifyResource(harness, resourceId, version) {
  return api(harness, `/api/admin/recursos/${resourceId}`, 'admin', {
    method: 'PATCH',
    body: { category: 'Artículo', kind: 'content', format: 'Artículo', topics: ['Serverless'], version },
  });
}

async function editor(harness, session = 'creator-a') {
  const response = await api(harness, '/api/creador/perfil', session);
  assert.equal(response.status, 200);
  return responseJson(response);
}

test('an authenticated account and a saved draft have no public page until explicit publication', async () => {
  const harness = await createCreatorPagesHarness();
  const accountProfile = await api(harness, '/api/creador/perfil', 'creator-a');
  assert.equal(accountProfile.status, 200);
  assert.equal((await responseJson(accountProfile)).profile, null);
  const draft = await saveProfile(harness, 'creator-a', { displayName: 'Nombre público', slug: 'ruta-elegida' });
  assert.equal(draft.status, 200);

  const beforePublish = await harness.service.readPublicProfile('ruta-elegida');
  assert.equal(beforePublish.status, 404);
  assert.equal((await editor(harness)).profile.published, false);

  const publish = await publishProfile(harness);
  assert.equal(publish.status, 200);
  const page = await harness.service.readPublicProfile('ruta-elegida');
  assert.equal(page.status, 200);
  assert.equal(page.profile.displayName, 'Nombre público');
  assert.equal(page.profile.slug, 'ruta-elegida');
  assert.equal(page.profile.published, true);
});

test('publication rejects a missing display name or URL name without exposing a partial profile', async () => {
  for (const [fields, missing] of [
    [{ slug: 'sin-nombre', displayName: '   ' }, 'display name'],
    [{ displayName: 'Sin ruta', slug: '   ' }, 'URL name'],
  ]) {
    const harness = await createCreatorPagesHarness();
    const saved = await saveProfile(harness, 'creator-a', fields);
    assert.equal(saved.status, 200);
    const publish = await publishProfile(harness);
    assert.equal(publish.status, 422, `publishing without a ${missing} must fail validation`);
    const page = await harness.service.readPublicProfile(fields.slug.trim() || 'sin-ruta');
    assert.equal(page.status, 404);
  }
});

test('profile programs, optional fields, and social text do not require directory classification', async () => {
  const harness = await createCreatorPagesHarness();
  const fields = {
    displayName: 'Ana',
    slug: 'ana',
    city: 'Córdoba',
    country: 'AR',
    programs: ['Community Builders', 'Heroes'],
    bio: 'Texto <script>literal</script>',
    socials: { instagram: 'https://www.instagram.com/ana/', website: 'https://example.com/newsletter' },
  };
  await createProfile(harness, 'creator-a', fields);
  const page = await harness.service.readPublicProfile('ana');
  assert.equal(page.status, 200);
  assert.deepEqual(page.profile.programs, fields.programs);
  assert.equal(page.profile.bio, fields.bio);
  assert.deepEqual(page.profile.socials, fields.socials);

  const link = await addLink(harness, 'creator-a', { title: 'Newsletter', url: 'https://example.com/newsletter' });
  assert.equal(link.status, 201);
  const body = await responseJson(link);
  assert.equal(body.link.selectedForDirectory, true);
  assert.equal(body.link.directoryApproval, 'pending');
});

test('social URLs accept only safe HTTP or HTTPS addresses and leave the profile unchanged on failure', async () => {
  const harness = await createCreatorPagesHarness();
  const invalid = await saveProfile(harness, 'creator-a', {
    displayName: 'Ana válida',
    slug: 'ana-valida',
    socials: { website: 'ftp://example.com/newsletter' },
  });
  assert.equal(invalid.status, 422);
  assert.equal((await responseJson(invalid)).error, 'INVALID_SOCIAL_URL');
  assert.equal((await editor(harness)).profile, null);

  const saved = await saveProfile(harness, 'creator-a', {
    displayName: 'Ana válida',
    slug: 'ana-valida',
    socials: { website: 'https://example.com/newsletter', instagram: 'http://example.com/ana' },
  });
  assert.equal(saved.status, 200);
  const before = (await responseJson(saved)).profile;
  const invalidUpdate = await saveProfile(harness, 'creator-a', {
    displayName: 'Nombre que no debe guardarse',
    slug: 'ruta-que-no-debe-guardarse',
    socials: { website: 'https://user:secret@example.com/newsletter' },
    version: before.version,
  });
  assert.equal(invalidUpdate.status, 422);
  assert.equal((await responseJson(invalidUpdate)).error, 'INVALID_SOCIAL_URL');
  const after = (await editor(harness)).profile;
  assert.equal(after.displayName, before.displayName);
  assert.equal(after.slug, before.slug);
  assert.deepEqual(after.socials, before.socials);
  assert.equal(after.version, before.version);

  const cleared = await saveProfile(harness, 'creator-a', { socials: { website: '' }, version: before.version });
  assert.equal(cleared.status, 200, 'an optional social URL may be cleared');
});

test('slug validation stays aligned with the allowed lowercase URL form', async () => {
  for (const slug of ['bad slug', 'bad--slug', '-bad-slug', 'bad-slug-']) {
    const harness = await createCreatorPagesHarness();
    const response = await saveProfile(harness, 'creator-a', { displayName: 'Ana', slug });
    assert.equal(response.status, 422, `${slug} must be rejected by the server`);
    assert.equal((await editor(harness)).profile, null);
  }

  const harness = await createCreatorPagesHarness();
  const response = await saveProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana-2026' });
  assert.equal(response.status, 200);
  assert.equal((await responseJson(response)).profile.slug, 'ana-2026');
});

test('a slug conflict does not overwrite either profile, version, or stable public ID; old paths preserve suffix and query', async () => {
  const harness = await createCreatorPagesHarness();
  const first = await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  await createProfile(harness, 'creator-b', { displayName: 'Bea', slug: 'bea' });
  const firstBefore = await editor(harness, 'creator-a');
  const secondBefore = await editor(harness, 'creator-b');

  const conflict = await saveProfile(harness, 'creator-b', { displayName: 'Bea cambiada', slug: 'ana', version: secondBefore.profile.version });
  assert.equal(conflict.status, 409);
  const firstAfter = await editor(harness, 'creator-a');
  const secondAfter = await editor(harness, 'creator-b');
  assert.equal(firstAfter.profile.slug, 'ana');
  assert.equal(firstAfter.profile.displayName, 'Ana');
  assert.equal(firstAfter.profile.version, firstBefore.profile.version);
  assert.equal(secondAfter.profile.slug, 'bea');
  assert.equal(secondAfter.profile.displayName, 'Bea');

  const changed = await saveProfile(harness, 'creator-a', { displayName: 'Ana nueva', slug: 'ana-nueva', version: firstBefore.profile.version });
  assert.equal(changed.status, 200);
  const current = await harness.service.readPublicProfile('ana-nueva');
  assert.equal(current.status, 200);
  assert.equal(current.profile.id, first.id);
  for (const [suffix, search] of [['', ''], ['', '?utm_source=directo'], ['/series/guia/', '?ref=perfil']]) {
    const old = await harness.service.readPublicProfile('ana', { suffix, search });
    assert.equal(old.status, 308);
    const redirect = new URL(old.redirectTo, 'https://dondeaprendoaws.com');
    assert.equal(redirect.pathname, suffix ? `/c/ana-nueva${suffix}` : '/c/ana-nueva/');
    assert.equal(redirect.search, search);
  }
  const originalAlias = await harness.service.readPublicProfile('ana');
  assert.equal(new URL(originalAlias.redirectTo, 'https://dondeaprendoaws.com').pathname, '/c/ana-nueva/');
});

test('concurrent profile saves cannot reserve the same slug for two accounts', async () => {
  const harness = await createCreatorPagesHarness();
  const results = await Promise.all([
    saveProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'misma-ruta' }),
    saveProfile(harness, 'creator-b', { displayName: 'Bea', slug: 'misma-ruta' }),
  ]);
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  assert.equal((await harness.service.readPublicProfile('misma-ruta')).status, 404);
});

test('concurrent initial profile saves and a versionless retry cannot overwrite the winner', async () => {
  const harness = await createCreatorPagesHarness();
  const candidates = [
    { displayName: 'Primera pestaña', slug: 'primera-pestana' },
    { displayName: 'Segunda pestaña', slug: 'segunda-pestana' },
  ];
  const results = await Promise.all(candidates.map((fields) => api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT', body: { ...fields, programs: [], socials: {} },
  })));
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  const winner = candidates[results.findIndex(({ status }) => status === 200)];
  const loser = candidates[results.findIndex(({ status }) => status === 409)];
  let current = (await editor(harness)).profile;
  assert.equal(current.displayName, winner.displayName);
  assert.equal(current.slug, winner.slug);
  assert.equal(current.version, 1);
  assert.equal((await harness.service.readPublicProfile(loser.slug)).status, 404);

  const versionlessRetry = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT', body: { displayName: 'Reintento antiguo', slug: 'ruta-del-reintento', programs: [], socials: {} },
  });
  assert.equal(versionlessRetry.status, 409);
  current = (await editor(harness)).profile;
  assert.equal(current.displayName, winner.displayName);
  assert.equal(current.slug, winner.slug);
  assert.equal(current.version, 1);
  assert.equal((await harness.service.readPublicProfile('ruta-del-reintento')).status, 404);
});

test('all old slugs redirect directly to the latest name and cannot be claimed by another account', async () => {
  const harness = await createCreatorPagesHarness();
  const original = await createProfile(harness, 'creator-a', { slug: 'primero' });
  const second = await saveProfile(harness, 'creator-a', { slug: 'segundo', version: original.version });
  const third = await responseJson(second);
  await saveProfile(harness, 'creator-a', { slug: 'tercero', version: third.profile.version });
  for (const slug of ['primero', 'segundo']) {
    const alias = await harness.service.readPublicProfile(slug, { suffix: '/series/guia/', search: '?ref=compartido' });
    assert.equal(alias.status, 308);
    const target = new URL(alias.redirectTo, 'https://dondeaprendoaws.com');
    assert.equal(target.pathname, '/c/tercero/series/guia/');
    assert.equal(target.search, '?ref=compartido');
    const attempt = await saveProfile(harness, 'creator-b', { slug });
    assert.equal(attempt.status, 409);
  }
  assert.equal((await harness.service.readPublicProfile('tercero')).profile.id, original.id);
});

test('concurrent profiles adding one URL share its resource while keeping distinct placements', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  await createProfile(harness, 'creator-b', { displayName: 'Bea', slug: 'bea' });
  const [a, b] = await Promise.all([
    addLink(harness, 'creator-a', { url: 'https://example.com/race' }),
    addLink(harness, 'creator-b', { url: 'https://example.com/race' }),
  ]);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const aLink = (await responseJson(a)).link;
  const bLink = (await responseJson(b)).link;
  assert.equal(aLink.resourceId, bLink.resourceId);
  assert.notEqual(aLink.placementId, bLink.placementId);
  const [ana, bea] = await Promise.all([
    harness.service.readPublicProfile('ana'),
    harness.service.readPublicProfile('bea'),
  ]);
  assert.equal(ana.links[0].resourceId, bea.links[0].resourceId);
});

test('stale profile and shared-resource edits conflict without replacing newer values', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  const initialProfile = await editor(harness);
  const profileVersion = initialProfile.profile.version;
  const firstProfileEdit = await saveProfile(harness, 'creator-a', {
    displayName: 'Ana actualizada', slug: 'ana', version: profileVersion,
  });
  assert.equal(firstProfileEdit.status, 200);
  const staleProfileEdit = await saveProfile(harness, 'creator-a', {
    displayName: 'Versión vieja', slug: 'ana', version: profileVersion,
  });
  assert.equal(staleProfileEdit.status, 409);
  assert.equal((await editor(harness)).profile.displayName, 'Ana actualizada');

  const added = await addLink(harness);
  const link = (await responseJson(added)).link;
  const firstResourceEdit = await api(harness, `/api/creador/recursos/${link.resourceId}`, 'creator-a', {
    method: 'PATCH', body: { title: 'Ficha actual', version: link.resourceVersion },
  });
  assert.equal(firstResourceEdit.status, 200);
  const staleResourceEdit = await api(harness, `/api/creador/recursos/${link.resourceId}`, 'creator-a', {
    method: 'PATCH', body: { title: 'Ficha antigua', version: link.resourceVersion },
  });
  assert.equal(staleResourceEdit.status, 409);
  assert.equal((await harness.service.readPublicProfile('ana')).links[0].title, 'Ficha actual');
});

test('changing a resource URL preserves its ID, resolves references by the current URL, and frees the old URL', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  await createProfile(harness, 'creator-b', { displayName: 'Bea', slug: 'bea' });
  const initial = await addLink(harness, 'creator-a', {
    title: 'Guía', url: 'https://example.com/old-address',
  });
  const resource = (await responseJson(initial)).link;
  const shared = await addLink(harness, 'creator-b', { url: 'https://example.com/old-address' });
  assert.equal((await responseJson(shared)).link.resourceId, resource.resourceId);

  const changed = await api(harness, `/api/creador/recursos/${resource.resourceId}`, 'creator-a', {
    method: 'PATCH', body: { url: 'https://example.com/current-address', version: resource.resourceVersion },
  });
  assert.equal(changed.status, 200);
  const [ana, bea] = await Promise.all([
    harness.service.readPublicProfile('ana'), harness.service.readPublicProfile('bea'),
  ]);
  assert.equal(ana.links[0].resourceId, resource.resourceId);
  assert.equal(bea.links[0].resourceId, resource.resourceId);
  assert.equal(bea.links[0].url, 'https://example.com/current-address');

  const currentReference = await addLink(harness, 'creator-b', { url: 'https://example.com/current-address' });
  assert.equal((await responseJson(currentReference)).link.resourceId, resource.resourceId);
  const oldUrlNewResource = await addLink(harness, 'creator-b', { url: 'https://example.com/old-address' });
  assert.notEqual((await responseJson(oldUrlNewResource)).link.resourceId, resource.resourceId);
});

test('re-adding an editable resource uses its current version and URL, and repeated requests keep one placement', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  const initial = await addLink(harness, 'creator-a', {
    title: 'Guía retenida', url: 'https://example.com/readd-old',
  });
  const original = (await responseJson(initial)).link;
  const profileBeforeRemove = (await editor(harness)).profile;
  const removed = await api(harness, `/api/creador/enlaces/${original.placementId}`, 'creator-a', {
    method: 'DELETE', body: { profileVersion: profileBeforeRemove.version },
  });
  assert.equal(removed.status, 204);

  const staleEditor = await editor(harness);
  const resourceEdit = await api(harness, `/api/creador/recursos/${original.resourceId}`, 'creator-a', {
    method: 'PATCH', body: { url: 'https://example.com/readd-current', version: original.resourceVersion },
  });
  assert.equal(resourceEdit.status, 200);
  const currentResource = (await editor(harness)).editableResources.find(({ id }) => id === original.resourceId);
  assert.equal(currentResource.url, 'https://example.com/readd-current');

  const beforeStaleReadd = {
    resources: await harness.store.list('resource:'),
    reservations: await harness.store.list('url:'),
    placements: await harness.store.list(`placement:${staleEditor.profile.id}:`),
    profile: (await editor(harness)).profile,
  };
  const missingVersion = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { resourceId: original.resourceId },
  });
  assert.equal(missingVersion.status, 400);
  const staleReadd = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { resourceId: original.resourceId, resourceVersion: staleEditor.editableResources[0].version },
  });
  assert.equal(staleReadd.status, 409);
  assert.deepEqual(await harness.store.list('resource:'), beforeStaleReadd.resources);
  assert.deepEqual(await harness.store.list('url:'), beforeStaleReadd.reservations);
  assert.deepEqual(await harness.store.list(`placement:${staleEditor.profile.id}:`), beforeStaleReadd.placements);
  assert.deepEqual((await editor(harness)).profile, beforeStaleReadd.profile);

  const mixedRequest = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { resourceId: original.resourceId, resourceVersion: currentResource.version, title: currentResource.title, url: currentResource.url },
  });
  assert.equal(mixedRequest.status, 400);

  const readdedResponse = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { resourceId: original.resourceId, resourceVersion: currentResource.version },
  });
  assert.equal(readdedResponse.status, 201);
  const readded = (await responseJson(readdedResponse)).link;
  assert.equal(readded.resourceId, original.resourceId);
  assert.equal(readded.placementId, original.placementId);
  assert.equal(readded.title, currentResource.title);
  assert.equal(readded.url, currentResource.url);
  assert.equal(readded.resourceVersion, currentResource.version);

  const duplicate = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { resourceId: original.resourceId, resourceVersion: currentResource.version },
  });
  assert.equal(duplicate.status, 200);
  assert.equal((await responseJson(duplicate)).link.placementId, original.placementId);
  assert.equal((await harness.store.list('resource:')).length, 1);
  assert.equal((await harness.store.list(`placement:${staleEditor.profile.id}:`)).length, 1);
  const currentReservation = await harness.store.list('url:');
  assert.equal(currentReservation.length, 1);
  assert.equal(currentReservation[0].value.url, currentResource.url);
});

test('re-adding another creator’s editable resource is rejected without creating a placement', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  await createProfile(harness, 'creator-b', { displayName: 'Bea', slug: 'bea' });
  const created = await addLink(harness, 'creator-a', { url: 'https://example.com/foreign-readd' });
  const resource = (await responseJson(created)).link;
  const attempt = await api(harness, '/api/creador/enlaces', 'creator-b', {
    method: 'POST', body: { resourceId: resource.resourceId, resourceVersion: resource.resourceVersion },
  });
  assert.equal(attempt.status, 403);
  assert.equal((await editor(harness, 'creator-b')).links.length, 0);
  assert.equal((await editor(harness, 'creator-a')).links.length, 1);
});

test('creator accounts are isolated and private account or admin fields cannot come from the request body', async () => {
  const harness = await createCreatorPagesHarness();
  const forged = await saveProfile(harness, 'creator-a', {
    displayName: 'Ana', slug: 'ana', accountId: 'private-account-b', isAdmin: true,
    email: 'private-a@example.invalid', published: true, directoryApproval: 'approved',
  });
  assert.ok([400, 403, 422].includes(forged.status));
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  await createProfile(harness, 'creator-b', { displayName: 'Bea', slug: 'bea' });
  const aLink = await addLink(harness, 'creator-a');
  const bLink = await addLink(harness, 'creator-b', { url: 'https://example.com/bea' });
  const aLinkBody = await responseJson(aLink);
  const aPlacement = aLinkBody.link.placementId;
  const bPlacement = (await responseJson(bLink)).link.placementId;

  const crossEdit = await api(harness, `/api/creador/enlaces/${bPlacement}`, 'creator-a', {
    method: 'PATCH', body: { selectedForDirectory: false },
  });
  assert.ok([403, 404].includes(crossEdit.status));
  const fakeAdmin = await api(harness, `/api/admin/recursos/${aLinkBody.link.resourceId}/aprobar`, 'creator-a', {
    method: 'POST', body: { isAdmin: true, accountId: 'private-account-admin' },
  });
  assert.equal(fakeAdmin.status, 403);

  const publicA = await harness.service.readPublicProfile('ana');
  const publicJson = JSON.stringify(publicA);
  assert.equal(publicJson.includes('private-account-a'), false);
  assert.equal(publicJson.includes('private-a@example.invalid'), false);
  assert.equal(publicJson.includes('private-account-b'), false);
  assert.equal(publicJson.includes('private-account-admin'), false);
  assert.equal(publicA.profile.displayName, 'Ana');
  assert.ok(aPlacement);
});

test('creator writes require the exact site Origin and the validated session CSRF token', async () => {
  const harness = await createCreatorPagesHarness();
  for (const [origin, csrf] of [
    ['https://attacker.example', 'csrf-a'],
    ['https://dondeaprendoaws.com', 'wrong-token'],
    [null, 'csrf-a'],
  ]) {
    const response = await callApi(harness, '/api/creador/perfil', {
      session: 'creator-a',
      method: 'PUT',
      body: { displayName: 'No publicar', slug: 'no-publicar' },
      origin,
      csrf,
    });
    assert.equal(response.status, 403);
  }
  assert.equal((await harness.service.readPublicProfile('no-publicar')).status, 404);
});

test('a failed profile write returns 503 and never reports or exposes a saved result', async () => {
  const harness = await createCreatorPagesHarness();
  harness.store.failNext('transact', new Error('storage unavailable'));
  const response = await saveProfile(harness, 'creator-a', { displayName: 'No se guardó', slug: 'fallo' });
  assert.equal(response.status, 503);
  assert.equal((await harness.service.readPublicProfile('fallo')).status, 404);
});

test('private reads and writes distinguish anonymous, disabled, and unavailable principals before storage', async () => {
  for (const [token, state, status] of [
    ['anonymous', { state: 'anonymous' }, 401],
    ['disabled', { state: 'disabled' }, 403],
    ['unavailable', { state: 'unavailable' }, 503],
  ]) {
    const harness = await createCreatorPagesHarness({
      authenticate: async (request) => request.headers.get('x-test-session') === token ? state : { state: 'anonymous' },
    });
    const read = await api(harness, '/api/creador/perfil', token);
    assert.equal(read.status, status);
    const write = await callApi(harness, '/api/creador/perfil', {
      session: token,
      method: 'PUT',
      body: { displayName: 'No autorizado', slug: 'no-autorizado' },
      csrf: 'irrelevant-without-authenticated-session',
    });
    assert.equal(write.status, status);
    assert.equal(harness.store.calls.length, 0);
  }
});

test('a storage read failure returns 503 rather than appearing as a missing public page', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  harness.store.failNext('get', new Error('catalog read unavailable'));
  harness.store.failNext('list', new Error('catalog query unavailable'));
  const page = await harness.service.readPublicProfile('ana');
  assert.equal(page.status, 503);
});

test('new links are immediately public while pending and reject unsafe URL schemes or credentials', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  const allowed = await addLink(harness, 'creator-a', {
    title: 'Recurso sin clasificación',
    url: 'http://example.com/recurso',
    description: 'Texto libre',
  });
  assert.equal(allowed.status, 201);
  const created = (await responseJson(allowed)).link;
  assert.equal(created.selectedForDirectory, true);
  assert.equal(created.directoryApproval, 'pending');
  const page = await harness.service.readPublicProfile('ana');
  assert.equal(page.links.length, 1);
  assert.equal(page.links[0].title, 'Recurso sin clasificación');
  assert.equal(page.links[0].directoryApproval, 'pending');

  for (const url of ['javascript:alert(1)', 'ftp://example.com/resource', 'https://user:password@example.com/resource']) {
    const rejected = await addLink(harness, 'creator-a', { title: 'Unsafe', url });
    assert.equal(rejected.status, 422, `unsafe destination should be rejected: ${url}`);
  }
  const after = await harness.service.readPublicProfile('ana');
  assert.equal(after.links.length, 1);

  const forged = await api(harness, `/api/creador/enlaces/${created.placementId}`, 'creator-a', {
    method: 'PATCH', body: { published: 'true', directoryApproval: 'approved' },
  });
  if (forged.ok) {
    assert.equal((await editor(harness)).links[0].directoryApproval, 'pending');
  } else {
    assert.ok([400, 403, 422].includes(forged.status));
  }
});

test('a shared URL has one editor and one shared ficha, while each profile owns its placement', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  await createProfile(harness, 'creator-b', { displayName: 'Bea', slug: 'bea' });
  const first = await addLink(harness, 'creator-a', { title: 'Ficha inicial', url: 'https://example.com/compartido' });
  const firstLink = (await responseJson(first)).link;
  const reference = await addLink(harness, 'creator-b', { title: 'Ignorado como copia', url: 'https://example.com/compartido' });
  const referenceLink = (await responseJson(reference)).link;
  assert.equal(reference.status, 201);
  assert.equal(referenceLink.resourceId, firstLink.resourceId);
  assert.notEqual(referenceLink.placementId, firstLink.placementId);

  const duplicate = await addLink(harness, 'creator-b', { title: 'Reintento', url: 'https://example.com/compartido' });
  const duplicateLink = (await responseJson(duplicate)).link;
  assert.equal(duplicateLink.resourceId, firstLink.resourceId);
  assert.equal(duplicateLink.placementId, referenceLink.placementId);

  const unauthorized = await api(harness, `/api/creador/recursos/${firstLink.resourceId}`, 'creator-b', {
    method: 'PATCH', body: { title: 'Cambio ajeno' },
  });
  assert.ok([403, 404].includes(unauthorized.status));
  const changed = await api(harness, `/api/creador/recursos/${firstLink.resourceId}`, 'creator-a', {
    method: 'PATCH', body: { title: 'Ficha actualizada', version: firstLink.resourceVersion },
  });
  assert.equal(changed.status, 200);
  const newVersion = (await responseJson(changed)).resource.version;
  for (const slug of ['ana', 'bea']) {
    const page = await harness.service.readPublicProfile(slug);
    assert.equal(page.links[0].title, 'Ficha actualizada');
  }

  const removed = await api(harness, `/api/creador/enlaces/${firstLink.placementId}`, 'creator-a', { method: 'DELETE' });
  assert.equal(removed.status, 204);
  const stillShared = await harness.service.readPublicProfile('bea');
  assert.equal(stillShared.links.length, 1);
  const ownerStillEdits = await api(harness, `/api/creador/recursos/${firstLink.resourceId}`, 'creator-a', {
    method: 'PATCH', body: { title: 'El editor conserva autoridad', version: newVersion },
  });
  assert.equal(ownerStillEdits.status, 200);
});

test('ordering, featured state, and directory selection belong to each placement', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  await createProfile(harness, 'creator-b', { displayName: 'Bea', slug: 'bea' });
  const a = await addLink(harness, 'creator-a', { url: 'https://example.com/compartido' });
  const b = await addLink(harness, 'creator-b', { url: 'https://example.com/compartido' });
  const aPlacement = (await responseJson(a)).link.placementId;
  const bPlacement = (await responseJson(b)).link.placementId;
  const beaBefore = await harness.service.readPublicProfile('bea');
  const placementBefore = beaBefore.links[0];
  const anaBefore = await editor(harness, 'creator-a');
  const aLinkBefore = anaBefore.links[0];

  const update = await api(harness, `/api/creador/enlaces/${aPlacement}`, 'creator-a', {
    method: 'PATCH', body: {
      position: 7, version: aLinkBefore.placementVersion, profileVersion: anaBefore.profile.version,
      featured: true, selectedForDirectory: false,
    },
  });
  assert.equal(update.status, 200);
  const ana = await harness.service.readPublicProfile('ana');
  const bea = await harness.service.readPublicProfile('bea');
  assert.equal(ana.links[0].position, 7);
  assert.equal(ana.links[0].featured, true);
  assert.equal(ana.links[0].selectedForDirectory, false);
  assert.equal(bea.links[0].position, placementBefore.position);
  assert.equal(bea.links[0].featured, placementBefore.featured);
  assert.equal(bea.links[0].selectedForDirectory, placementBefore.selectedForDirectory);
  assert.notEqual(aPlacement, bPlacement);
});

test('a removed and recreated placement rejects a stale version while keeping its stable ID', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  const first = await addLink(harness, 'creator-a', { url: 'https://example.com/recreated' });
  const original = (await responseJson(first)).link;
  const firstProfile = (await editor(harness)).profile;
  assert.equal(original.placementVersion, firstProfile.version);

  const changed = await api(harness, `/api/creador/enlaces/${original.placementId}`, 'creator-a', {
    method: 'PATCH', body: {
      position: 2, featured: true, selectedForDirectory: false,
      version: original.placementVersion, profileVersion: firstProfile.version,
    },
  });
  assert.equal(changed.status, 200);
  const beforeRemove = (await responseJson(changed)).link;
  await api(harness, `/api/creador/enlaces/${original.placementId}`, 'creator-a', { method: 'DELETE' });

  const recreatedResponse = await addLink(harness, 'creator-a', { url: 'https://example.com/recreated' });
  assert.equal(recreatedResponse.status, 201);
  const recreated = (await responseJson(recreatedResponse)).link;
  assert.equal(recreated.placementId, original.placementId);
  assert.ok(recreated.placementVersion > beforeRemove.placementVersion);
  const profileAfterRecreate = (await editor(harness)).profile;
  assert.ok(recreated.placementVersion <= profileAfterRecreate.version);

  const stalePatch = await api(harness, `/api/creador/enlaces/${recreated.placementId}`, 'creator-a', {
    method: 'PATCH', body: {
      position: 0, featured: true, selectedForDirectory: false,
      version: original.placementVersion, profileVersion: firstProfile.version,
    },
  });
  assert.equal(stalePatch.status, 409);
  const after = (await editor(harness)).links[0];
  assert.equal(after.placementId, original.placementId);
  assert.equal(after.position, recreated.position);
  assert.equal(after.featured, recreated.featured);
  assert.equal(after.selectedForDirectory, recreated.selectedForDirectory);
  assert.equal(after.placementVersion, recreated.placementVersion);
});

test('the public page puts featured content first and applies the chosen order within each group', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { slug: 'ana' });
  const links = [];
  for (let index = 0; index < 3; index++) {
    const response = await addLink(harness, 'creator-a', { url: `https://example.com/orden-${index}` });
    links.push((await responseJson(response)).link);
  }
  for (const [index, position, featured] of [[0, 30, true], [1, 20, false], [2, 10, false]]) {
    const current = await editor(harness, 'creator-a');
    const target = current.links.find(({ placementId }) => placementId === links[index].placementId);
    const response = await api(harness, `/api/creador/enlaces/${links[index].placementId}`, 'creator-a', {
      method: 'PATCH', body: {
        position, featured, version: target.placementVersion, profileVersion: current.profile.version,
      },
    });
    assert.equal(response.status, 200);
  }
  const page = await harness.service.readPublicProfile('ana');
  assert.deepEqual(page.links.map(({ resourceId }) => resourceId), [links[0].resourceId, links[2].resourceId, links[1].resourceId]);
});

test('a stale order change cannot move a neighbor from an older profile snapshot and can be retried against current order', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { slug: 'ana' });
  for (const title of ['A', 'B', 'C']) await addLink(harness, 'creator-a', { title, url: `https://example.com/stale-order-${title}` });
  const observed = await editor(harness, 'creator-a');
  const [a, b, c] = observed.links;
  const missingProfileVersion = await api(harness, `/api/creador/enlaces/${a.placementId}`, 'creator-a', {
    method: 'PATCH', body: { position: b.position, version: a.placementVersion },
  });
  assert.equal(missingProfileVersion.status, 400);
  assert.deepEqual((await editor(harness, 'creator-a')).links.map(({ title }) => title), ['A', 'B', 'C']);

  const firstMove = await api(harness, `/api/creador/enlaces/${b.placementId}`, 'creator-a', {
    method: 'PATCH', body: { position: c.position, version: b.placementVersion, profileVersion: observed.profile.version },
  });
  assert.equal(firstMove.status, 200);
  const afterFirstMove = await editor(harness, 'creator-a');
  assert.deepEqual(afterFirstMove.links.map(({ title }) => title), ['A', 'C', 'B']);

  const beforeStaleMove = afterFirstMove.links.map(({ placementId, position, placementVersion }) => ({ placementId, position, placementVersion }));
  const staleMove = await api(harness, `/api/creador/enlaces/${a.placementId}`, 'creator-a', {
    method: 'PATCH', body: { position: b.position, version: a.placementVersion, profileVersion: observed.profile.version },
  });
  assert.equal(staleMove.status, 409);
  const afterStaleMove = await editor(harness, 'creator-a');
  assert.deepEqual(afterStaleMove.links.map(({ title }) => title), ['A', 'C', 'B']);
  assert.deepEqual(
    afterStaleMove.links.map(({ placementId, position, placementVersion }) => ({ placementId, position, placementVersion })),
    beforeStaleMove,
  );

  const currentA = afterStaleMove.links.find(({ placementId }) => placementId === a.placementId);
  const currentC = afterStaleMove.links.find(({ title }) => title === 'C');
  const retry = await api(harness, `/api/creador/enlaces/${currentA.placementId}`, 'creator-a', {
    method: 'PATCH', body: {
      position: currentC.position, version: currentA.placementVersion, profileVersion: afterStaleMove.profile.version,
    },
  });
  assert.equal(retry.status, 200);
  assert.deepEqual((await editor(harness, 'creator-a')).links.map(({ title }) => title), ['C', 'A', 'B']);
});

test('selection and approval stay separate: reselecting preserves approval, revoking never hides a profile link', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  const created = await addLink(harness);
  const { resourceId, resourceVersion, placementId } = (await responseJson(created)).link;

  const incompleteApproval = await api(harness, `/api/admin/recursos/${resourceId}/aprobar`, 'admin', {
    method: 'POST', body: { published: true },
  });
  assert.equal(incompleteApproval.status, 422);
  const classified = await classifyResource(harness, resourceId, resourceVersion);
  assert.equal(classified.status, 200);
  const approve = await api(harness, `/api/admin/recursos/${resourceId}/aprobar`, 'admin', { method: 'POST', body: {} });
  assert.equal(approve.status, 200);
  const approvedLink = (await editor(harness)).links[0];
  const editApproved = await api(harness, `/api/creador/recursos/${resourceId}`, 'creator-a', {
    method: 'PATCH', body: { title: 'Título actualizado sin nueva moderación', version: approvedLink.resourceVersion },
  });
  assert.equal(editApproved.status, 200);
  assert.equal((await editor(harness)).links[0].directoryApproval, 'approved');
  const deselect = await api(harness, `/api/creador/enlaces/${placementId}`, 'creator-a', {
    method: 'PATCH', body: { selectedForDirectory: false },
  });
  assert.equal(deselect.status, 200);
  let current = await editor(harness);
  assert.equal(current.links[0].selectedForDirectory, false);
  assert.equal(current.links[0].directoryApproval, 'approved');

  const reselect = await api(harness, `/api/creador/enlaces/${placementId}`, 'creator-a', {
    method: 'PATCH', body: { selectedForDirectory: true },
  });
  assert.equal(reselect.status, 200);
  current = await editor(harness);
  assert.equal(current.links[0].directoryApproval, 'approved');

  const revoke = await api(harness, `/api/admin/recursos/${resourceId}/revocar`, 'admin', { method: 'POST', body: {} });
  assert.equal(revoke.status, 200);
  const afterRevoke = await harness.service.readPublicProfile('ana');
  assert.equal(afterRevoke.status, 200);
  assert.equal(afterRevoke.links.length, 1);
  assert.equal(afterRevoke.links[0].directoryApproval, 'revoked');
});

test('hiding a profile and hiding a resource have separate public effects', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  const added = await addLink(harness);
  const { resourceId } = (await responseJson(added)).link;

  const hideProfile = await api(harness, `/api/admin/perfiles/${profile.id}/ocultar`, 'admin', { method: 'POST', body: {} });
  assert.equal(hideProfile.status, 200);
  assert.equal((await harness.service.readPublicProfile('ana')).status, 404);
  const showProfile = await api(harness, `/api/admin/perfiles/${profile.id}/restaurar`, 'admin', { method: 'POST', body: {} });
  assert.equal(showProfile.status, 200);

  const hideResource = await api(harness, `/api/admin/recursos/${resourceId}/ocultar`, 'admin', { method: 'POST', body: {} });
  assert.equal(hideResource.status, 200);
  const page = await harness.service.readPublicProfile('ana');
  assert.equal(page.status, 200);
  assert.equal(page.profile.published, true);
  assert.equal(page.profile.hidden, false);
  assert.equal(page.links.length, 0);
  const restoreResource = await api(harness, `/api/admin/recursos/${resourceId}/restaurar`, 'admin', { method: 'POST', body: {} });
  assert.equal(restoreResource.status, 200);
  assert.equal((await harness.service.readPublicProfile('ana')).links.length, 1);
});

test('referencing a legacy editorial resource does not claim it or transfer editor authority', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  await seedResource(harness.store, {
    id: 'legacy-guide',
    url: 'https://example.com/legacy',
    title: 'Guía editorial',
    description: 'Recurso previo',
    category: 'Artículo',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    order: 1,
    featured: false,
    published: true,
    version: 1,
    directoryControl: 'editorial',
  });

  const beforeList = await api(harness, '/api/admin/recursos', 'admin');
  assert.equal(beforeList.status, 200);
  const before = (await responseJson(beforeList)).resources.find(({ id }) => id === 'legacy-guide');
  assert.equal(before.directoryControl, 'editorial');
  assert.equal(before.published, true);

  const reference = await addLink(harness, 'creator-a', {
    title: 'Texto personal', url: 'https://example.com/legacy', selectedForDirectory: false,
  });
  assert.equal(reference.status, 201);
  const linked = (await responseJson(reference)).link;
  const { resourceId } = linked;
  assert.equal(resourceId, 'legacy-guide');
  assert.equal(linked.selectedForDirectory, false);
  const edit = await api(harness, `/api/creador/recursos/${resourceId}`, 'creator-a', {
    method: 'PATCH', body: { title: 'Intento de apropiación' },
  });
  assert.ok([403, 404].includes(edit.status));
  const page = await harness.service.readPublicProfile('ana');
  assert.equal(page.links.length, 1);
  assert.equal(page.links[0].title, 'Guía editorial');
  assert.equal(page.links[0].directoryApproval, 'approved');

  const afterList = await api(harness, '/api/admin/recursos', 'admin');
  const after = (await responseJson(afterList)).resources.find(({ id }) => id === 'legacy-guide');
  assert.equal(after.directoryControl, before.directoryControl);
  assert.equal(after.published, before.published);
});

test('admin claims require exact resources, are idempotent, and cannot overwrite a conflicting owner', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  await createProfile(harness, 'creator-b', { displayName: 'Bea', slug: 'bea' });
  for (const [id, url] of [
    ['claim-one', 'https://example.com/one'],
    ['claim-two', 'https://example.com/two'],
  ]) {
    await seedResource(harness.store, {
      id,
      url,
      title: id,
      description: '',
      category: 'Artículo',
      kind: 'content',
      format: 'Artículo',
      topics: ['Serverless'],
      order: 1,
      featured: false,
      published: true,
      version: 1,
      directoryControl: 'editorial',
      sourceId: 'same-source',
    });
  }

  const broadClaim = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', sourceId: 'same-source' },
  });
  assert.ok([400, 422].includes(broadClaim.status));

  const userClaim = await api(harness, '/api/creador/reclamaciones', 'creator-a', {
    method: 'POST', body: { resourceIds: ['claim-one'], sourceId: 'same-source' },
  });
  assert.equal(userClaim.status, 202);
  const requestDoesNotGrantEditing = await api(harness, '/api/creador/recursos/claim-one', 'creator-a', {
    method: 'PATCH', body: { title: 'Todavía sin autorización' },
  });
  assert.ok([403, 404].includes(requestDoesNotGrantEditing.status));
  const privateList = await api(harness, '/api/admin/recursos', 'creator-a');
  assert.equal(privateList.status, 403);

  const exactClaim = { accountId: 'private-account-a', resourceIds: ['claim-one'], sourceId: 'same-source' };
  const firstClaim = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', { method: 'POST', body: exactClaim });
  assert.equal(firstClaim.status, 200);
  const repeatedClaim = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', { method: 'POST', body: exactClaim });
  assert.equal(repeatedClaim.status, 200);

  const one = await addLink(harness, 'creator-a', { url: 'https://example.com/one' });
  const two = await addLink(harness, 'creator-a', { url: 'https://example.com/two' });
  const oneResource = (await responseJson(one)).link.resourceId;
  const twoResource = (await responseJson(two)).link.resourceId;
  assert.equal(oneResource, 'claim-one');
  assert.equal(twoResource, 'claim-two');
  const claimedPage = await harness.service.readPublicProfile('ana');
  assert.equal(claimedPage.links.filter(({ resourceId }) => resourceId === 'claim-one').length, 1);
  assert.equal(claimedPage.links.find(({ resourceId }) => resourceId === 'claim-one').directoryApproval, 'approved');
  const canEditClaimed = await api(harness, `/api/creador/recursos/${oneResource}`, 'creator-a', {
    method: 'PATCH', body: { title: 'Reclamado' },
  });
  assert.equal(canEditClaimed.status, 200);
  const sourceSiblingRemainsUnclaimed = await api(harness, `/api/creador/recursos/${twoResource}`, 'creator-a', {
    method: 'PATCH', body: { title: 'Sin vínculo explícito' },
  });
  assert.equal(sourceSiblingRemainsUnclaimed.status, 403);

  const conflictingClaim = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-b', resourceIds: ['claim-one'], sourceId: 'same-source' },
  });
  assert.equal(conflictingClaim.status, 409);
  const stillOwner = await api(harness, `/api/creador/recursos/${oneResource}`, 'creator-a', {
    method: 'PATCH', body: { title: 'La autoridad sigue con Ana' },
  });
  assert.equal(stillOwner.status, 200);
});

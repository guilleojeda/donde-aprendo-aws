import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CREATOR_FIELD_LIMITS } from '../src/lib/creator-values.mjs';
import {
  callApi,
  createCreatorPagesHarness,
  requestContextForTestPrincipal,
  readAdminRecord,
  responseJson,
  seedResource,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';

async function api(harness, path, session = 'creator-a', options = {}) {
  return callApi(harness, path, {
    session,
    csrf: sessionCsrf[session],
    creatorContract: '2',
    ...options,
  });
}

async function adminVersion(harness, type, id) {
  return (await readAdminRecord(harness, type, id)).version;
}

async function saveProfile(harness, session = 'creator-a', fields = {}) {
  const observed = await editor(harness, session);
  return api(harness, '/api/creador/perfil', session, {
    method: 'PUT',
    body: {
      creatorVersion: observed.creatorVersion,
      displayName: 'Ana Creadora',
      slug: session === 'creator-b' ? 'ana-dos' : 'ana-uno',
      ...fields,
    },
  });
}

async function publishProfile(harness, session = 'creator-a') {
  const observed = await editor(harness, session);
  return api(harness, '/api/creador/perfil/publicar', session, {
    method: 'POST', body: { creatorVersion: observed.creatorVersion },
  });
}

async function createProfile(harness, session = 'creator-a', fields = {}, { publish = true } = {}) {
  const saved = await saveProfile(harness, session, fields);
  assert.ok(saved.ok, `saving the ${session} profile failed with ${saved.status}`);
  if (publish) {
    const published = await publishProfile(harness, session);
    assert.ok(published.ok, `publishing the ${session} profile failed with ${published.status}`);
  }
  return (await editor(harness, session)).profile;
}

async function addLink(harness, session = 'creator-a', fields = {}) {
  const observed = await editor(harness, session);
  return api(harness, '/api/creador/enlaces', session, {
    method: 'POST',
    body: { creatorVersion: observed.creatorVersion, title: 'Guía de AWS', url: 'https://example.com/guia', ...fields },
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

test('public runtime rejects a visible published profile with a blank slug instead of redirecting to /c//', async () => {
  const harness = await createCreatorPagesHarness();
  const saved = await saveProfile(harness, 'creator-a', { displayName: 'Perfil visible', slug: 'perfil-visible' });
  assert.equal(saved.status, 200);
  const published = await publishProfile(harness, 'creator-a');
  assert.equal(published.status, 200);

  const owner = await harness.store.get('account-profile:private-account-a');
  const key = `profile:${owner.profileId}`;
  const current = await harness.store.get(key);
  assert.equal(await harness.store.transact({
    checks: [{ key, version: current.version }],
    puts: [{ key, value: { ...current, slug: '' } }],
  }), true);

  const result = await harness.service.readPublicProfile('perfil-visible');
  assert.equal(result.status, 503);
  assert.equal(Object.hasOwn(result, 'redirectTo'), false);
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
  const snapshot = await editor(harness);
  assert.equal(snapshot.placements[body.placementId].selectedForDirectory, true);
  assert.equal(snapshot.resources.find(({ id }) => id === body.resourceId).directoryApproval, 'pending');
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
  const before = await editor(harness);
  const invalidUpdate = await saveProfile(harness, 'creator-a', {
    displayName: 'Nombre que no debe guardarse',
    slug: 'ruta-que-no-debe-guardarse',
    socials: { website: 'https://user:secret@example.com/newsletter' },
    creatorVersion: before.creatorVersion,
  });
  assert.equal(invalidUpdate.status, 422);
  assert.equal((await responseJson(invalidUpdate)).error, 'INVALID_SOCIAL_URL');
  const after = await editor(harness);
  assert.equal(after.profile.displayName, before.profile.displayName);
  assert.equal(after.profile.slug, before.profile.slug);
  assert.deepEqual(after.profile.socials, before.profile.socials);
  assert.equal(after.creatorVersion, before.creatorVersion);

  const cleared = await saveProfile(harness, 'creator-a', {
    socials: { website: '' }, creatorVersion: before.creatorVersion,
  });
  assert.equal(cleared.status, 200, 'an optional social URL may be cleared');
  const afterClear = await editor(harness);
  assert.equal(Object.hasOwn(afterClear.profile.socials, 'website'), false);
  assert.equal(afterClear.profile.socials.instagram, before.profile.socials.instagram,
    'removing one optional social URL preserves the unsubmitted URLs');
});

test('profile writes identify which editable field exceeded its limit without changing the rejection', async (t) => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' }, { publish: false });
  const before = await editor(harness);
  for (const field of ['displayName', 'bio']) {
    await t.test(field, async () => {
      const value = 'x'.repeat(CREATOR_FIELD_LIMITS[field] + 1);
      const response = await saveProfile(harness, 'creator-a', { slug: 'ana', [field]: value });
      assert.equal(response.status, 422);
      const body = await responseJson(response);
      assert.equal(body.error, 'FIELD_TOO_LONG');
      assert.deepEqual(await editor(harness), before, 'a field rejection leaves the saved profile and version intact');
      assert.deepEqual(body.fieldErrors, [{ field, reason: 'too_long' }]);
    });
  }

  await t.test('nested input is not attributed to the visible name', async () => {
    const response = await saveProfile(harness, 'creator-a', {
      slug: 'ana',
      unrecognized: { displayName: 'x'.repeat(CREATOR_FIELD_LIMITS.displayName + 1) },
    });
    assert.equal(response.status, 422);
    const body = await responseJson(response);
    assert.equal(body.error, 'FIELD_TOO_LONG');
    assert.equal(body.fieldErrors, undefined);
    assert.deepEqual(await editor(harness), before);
  });
});

test('invalid profile programs identify the editable group without changing the rejection', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' }, { publish: false });
  const before = await editor(harness);
  const response = await saveProfile(harness, 'creator-a', {
    slug: 'ana', programs: ['Programa no disponible'],
  });
  assert.equal(response.status, 422);
  const body = await responseJson(response);
  assert.equal(body.error, 'INVALID_PROGRAMS');
  assert.deepEqual(await editor(harness), before, 'a program-group rejection leaves the saved profile and version intact');
});

test('editing a published profile identifies only the missing identity fields', async (t) => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  const before = await editor(harness);
  for (const [fields, missing] of [
    [{ displayName: '   ', slug: 'ana' }, ['displayName']],
    [{ displayName: 'Ana', slug: '   ' }, ['slug']],
    [{ displayName: '   ', slug: '   ' }, ['displayName', 'slug']],
  ]) {
    await t.test(missing.join(' and '), async () => {
      const response = await saveProfile(harness, 'creator-a', fields);
      assert.equal(response.status, 422);
      const body = await responseJson(response);
      assert.equal(body.error, 'PROFILE_INCOMPLETE');
      assert.deepEqual(await editor(harness), before);
      assert.ok(Array.isArray(body.fieldErrors), 'the response identifies the missing fields');
      const compareFields = (left, right) => left.field.localeCompare(right.field);
      assert.deepEqual(body.fieldErrors.toSorted(compareFields),
        missing.map((field) => ({ field, reason: 'required' })).sort(compareFields));
    });
  }
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
  assert.equal((await editor(harness)).profile.slug, 'ana-2026');
});

test('a slug conflict does not overwrite either profile, version, or stable public ID; old paths preserve suffix and query', async () => {
  const harness = await createCreatorPagesHarness();
  const first = await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  await createProfile(harness, 'creator-b', { displayName: 'Bea', slug: 'bea' });
  const firstBefore = await editor(harness, 'creator-a');
  const secondBefore = await editor(harness, 'creator-b');

  const conflict = await saveProfile(harness, 'creator-b', {
    displayName: 'Bea cambiada', slug: 'ana', creatorVersion: secondBefore.creatorVersion,
  });
  assert.equal(conflict.status, 409);
  const firstAfter = await editor(harness, 'creator-a');
  const secondAfter = await editor(harness, 'creator-b');
  assert.equal(firstAfter.profile.slug, 'ana');
  assert.equal(firstAfter.profile.displayName, 'Ana');
  assert.equal(firstAfter.creatorVersion, firstBefore.creatorVersion);
  assert.equal(secondAfter.profile.slug, 'bea');
  assert.equal(secondAfter.profile.displayName, 'Bea');

  const changed = await saveProfile(harness, 'creator-a', {
    displayName: 'Ana nueva', slug: 'ana-nueva', creatorVersion: firstBefore.creatorVersion,
  });
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
    { creatorVersion: null, displayName: 'Primera pestaña', slug: 'primera-pestana' },
    { creatorVersion: null, displayName: 'Segunda pestaña', slug: 'segunda-pestana' },
  ];
  const results = await Promise.all(candidates.map((fields) => api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT', body: { ...fields, programs: [], socials: {} },
  })));
  assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
  const winner = candidates[results.findIndex(({ status }) => status === 200)];
  const loser = candidates[results.findIndex(({ status }) => status === 409)];
  let current = await editor(harness);
  assert.equal(current.profile.displayName, winner.displayName);
  assert.equal(current.profile.slug, winner.slug);
  assert.equal(current.creatorVersion, 1);
  assert.equal((await harness.service.readPublicProfile(loser.slug)).status, 404);

  const versionlessRetry = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT', body: { displayName: 'Reintento antiguo', slug: 'ruta-del-reintento', programs: [], socials: {} },
  });
  assert.equal(versionlessRetry.status, 400);
  current = await editor(harness);
  assert.equal(current.profile.displayName, winner.displayName);
  assert.equal(current.profile.slug, winner.slug);
  assert.equal(current.creatorVersion, 1);
  assert.equal((await harness.service.readPublicProfile('ruta-del-reintento')).status, 404);
});

test('all old slugs redirect directly to the latest name and cannot be claimed by another account', async () => {
  const harness = await createCreatorPagesHarness();
  const original = await createProfile(harness, 'creator-a', { slug: 'primero' });
  let current = await editor(harness);
  await saveProfile(harness, 'creator-a', { slug: 'segundo', creatorVersion: current.creatorVersion });
  current = await editor(harness);
  await saveProfile(harness, 'creator-a', { slug: 'tercero', creatorVersion: current.creatorVersion });
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
  const aLink = await responseJson(a);
  const bLink = await responseJson(b);
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
  const firstProfileEdit = await saveProfile(harness, 'creator-a', {
    displayName: 'Ana actualizada', slug: 'ana', creatorVersion: initialProfile.creatorVersion,
  });
  assert.equal(firstProfileEdit.status, 200);
  const staleProfileEdit = await saveProfile(harness, 'creator-a', {
    displayName: 'Versión vieja', slug: 'ana', creatorVersion: initialProfile.creatorVersion,
  });
  assert.equal(staleProfileEdit.status, 409);
  assert.equal((await editor(harness)).profile.displayName, 'Ana actualizada');

  const added = await addLink(harness);
  const link = await responseJson(added);
  const current = await editor(harness);
  const resourceVersion = current.resources.find(({ id }) => id === link.resourceId).version;
  const firstResourceEdit = await api(harness, `/api/creador/enlaces/${link.placementId}/editar`, 'creator-a', {
    method: 'PATCH', body: { creatorVersion: current.creatorVersion, resourceVersion, title: 'Ficha actual' },
  });
  assert.equal(firstResourceEdit.status, 200);
  const staleResourceEdit = await api(harness, `/api/creador/enlaces/${link.placementId}/editar`, 'creator-a', {
    method: 'PATCH', body: { creatorVersion: current.creatorVersion, resourceVersion, title: 'Ficha antigua' },
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
  const resource = await responseJson(initial);
  const shared = await addLink(harness, 'creator-b', { url: 'https://example.com/old-address' });
  assert.equal((await responseJson(shared)).resourceId, resource.resourceId);

  let snapshot = await editor(harness, 'creator-a');
  const changed = await api(harness, `/api/creador/enlaces/${resource.placementId}/editar`, 'creator-a', {
    method: 'PATCH', body: {
      creatorVersion: snapshot.creatorVersion,
      resourceVersion: snapshot.resources.find(({ id }) => id === resource.resourceId).version,
      url: 'https://example.com/current-address',
    },
  });
  assert.equal(changed.status, 200);
  const [ana, bea] = await Promise.all([
    harness.service.readPublicProfile('ana'), harness.service.readPublicProfile('bea'),
  ]);
  assert.equal(ana.links[0].resourceId, resource.resourceId);
  assert.equal(bea.links[0].resourceId, resource.resourceId);
  assert.equal(bea.links[0].url, 'https://example.com/current-address');

  const currentReference = await addLink(harness, 'creator-b', { url: 'https://example.com/current-address' });
  assert.equal((await responseJson(currentReference)).resourceId, resource.resourceId);
  const oldUrlNewResource = await addLink(harness, 'creator-b', { url: 'https://example.com/old-address' });
  assert.notEqual((await responseJson(oldUrlNewResource)).resourceId, resource.resourceId);
});

test('re-adding an editable resource uses its current version and URL, and repeated requests keep one placement', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  const initial = await addLink(harness, 'creator-a', {
    title: 'Guía retenida', url: 'https://example.com/readd-old',
  });
  const original = await responseJson(initial);
  const profileBeforeRemove = await editor(harness);
  const removed = await api(harness, `/api/creador/enlaces/${original.placementId}`, 'creator-a', {
    method: 'DELETE', body: { creatorVersion: profileBeforeRemove.creatorVersion },
  });
  assert.equal(removed.status, 200);

  const staleEditor = await editor(harness);
  const resourceEdit = await api(harness, `/api/creador/recursos?id=${encodeURIComponent(original.resourceId)}`, 'creator-a', {
    method: 'PATCH', body: {
      resourceVersion: staleEditor.resources.find(({ id }) => id === original.resourceId).version,
      url: 'https://example.com/readd-current',
    },
  });
  assert.equal(resourceEdit.status, 200);
  const currentResource = (await editor(harness)).resources.find(({ id }) => id === original.resourceId);
  assert.equal(currentResource.url, 'https://example.com/readd-current');

  const beforeStaleReadd = {
    resources: await harness.store.list('resource:'),
    reservations: await harness.store.list('url:'),
    profile: await harness.store.get(`profile:${staleEditor.profile.id}`),
  };
  const missingVersion = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { creatorVersion: staleEditor.creatorVersion, resourceId: original.resourceId },
  });
  assert.equal(missingVersion.status, 400);
  const staleReadd = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: {
      creatorVersion: staleEditor.creatorVersion,
      resourceId: original.resourceId,
      resourceVersion: currentResource.version - 1,
    },
  });
  assert.equal(staleReadd.status, 409);
  assert.deepEqual(await harness.store.list('resource:'), beforeStaleReadd.resources);
  assert.deepEqual(await harness.store.list('url:'), beforeStaleReadd.reservations);
  assert.deepEqual(await harness.store.get(`profile:${staleEditor.profile.id}`), beforeStaleReadd.profile);

  const mixedRequest = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: {
      creatorVersion: staleEditor.creatorVersion, resourceId: original.resourceId,
      resourceVersion: currentResource.version, title: currentResource.title, url: currentResource.url,
    },
  });
  assert.equal(mixedRequest.status, 400);

  const readdedResponse = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: {
      creatorVersion: staleEditor.creatorVersion, resourceId: original.resourceId, resourceVersion: currentResource.version,
    },
  });
  assert.equal(readdedResponse.status, 201);
  const readded = await responseJson(readdedResponse);
  assert.equal(readded.resourceId, original.resourceId);
  assert.equal(readded.placementId, original.placementId);
  assert.equal(readded.resourceVersion, currentResource.version);
  let afterReadd = await editor(harness);
  assert.equal(afterReadd.resources.find(({ id }) => id === original.resourceId).title, currentResource.title);
  assert.equal(afterReadd.resources.find(({ id }) => id === original.resourceId).url, currentResource.url);

  const duplicate = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: {
      creatorVersion: afterReadd.creatorVersion, resourceId: original.resourceId, resourceVersion: currentResource.version,
    },
  });
  assert.equal(duplicate.status, 200);
  assert.equal((await responseJson(duplicate)).disposition, 'already-present');
  assert.equal((await harness.store.list('resource:')).length, 1);
  assert.equal(Object.keys((await harness.store.get(`profile:${staleEditor.profile.id}`)).placements).length, 1);
  const currentReservation = await harness.store.list('url:');
  assert.equal(currentReservation.length, 1);
  assert.equal(currentReservation[0].value.url, currentResource.url);
});

test('re-adding another creator’s editable resource is rejected without creating a placement', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  await createProfile(harness, 'creator-b', { displayName: 'Bea', slug: 'bea' });
  const created = await addLink(harness, 'creator-a', { url: 'https://example.com/foreign-readd' });
  const resource = await responseJson(created);
  const attempt = await api(harness, '/api/creador/enlaces', 'creator-b', {
    method: 'POST', body: {
      creatorVersion: (await editor(harness, 'creator-b')).creatorVersion,
      resourceId: resource.resourceId, resourceVersion: resource.resourceVersion,
    },
  });
  assert.equal(attempt.status, 403);
  assert.equal(Object.keys((await editor(harness, 'creator-b')).placements).length, 0);
  assert.equal(Object.keys((await editor(harness, 'creator-a')).placements).length, 1);
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
  const aPlacement = aLinkBody.placementId;
  const bPlacement = (await responseJson(bLink)).placementId;
  const aSnapshot = await editor(harness, 'creator-a');

  const crossEdit = await api(harness, `/api/creador/enlaces/${bPlacement}`, 'creator-a', {
    method: 'PATCH', body: { creatorVersion: aSnapshot.creatorVersion, selectedForDirectory: false },
  });
  assert.ok([403, 404].includes(crossEdit.status));
  const fakeAdmin = await api(harness, `/api/admin/recursos/${aLinkBody.resourceId}/aprobar`, 'creator-a', {
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
      creatorContract: '2',
      method: 'PUT',
      body: { creatorVersion: null, displayName: 'No publicar', slug: 'no-publicar' },
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
      authenticate: async (request) => requestContextForTestPrincipal(
        request.headers.get('x-test-session') === token ? state : { state: 'anonymous' }, token,
      ),
    });
    const read = await api(harness, '/api/creador/perfil', token);
    assert.equal(read.status, status);
    const write = await callApi(harness, '/api/creador/perfil', {
      session: token,
      creatorContract: '2',
      method: 'PUT',
      body: { creatorVersion: null, displayName: 'No autorizado', slug: 'no-autorizado' },
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
  const created = await responseJson(allowed);
  const snapshot = await editor(harness);
  assert.equal(snapshot.placements[created.placementId].selectedForDirectory, true);
  assert.equal(snapshot.resources.find(({ id }) => id === created.resourceId).directoryApproval, 'pending');
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
    method: 'PATCH', body: {
      creatorVersion: (await editor(harness)).creatorVersion,
      published: 'true', directoryApproval: 'approved',
    },
  });
  if (forged.ok) {
    assert.equal((await editor(harness)).resources.find(({ id }) => id === created.resourceId).directoryApproval, 'pending');
  } else {
    assert.ok([400, 403, 422].includes(forged.status));
  }
});

test('a shared URL has one editor and one shared ficha, while each profile owns its placement', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  await createProfile(harness, 'creator-b', { displayName: 'Bea', slug: 'bea' });
  const first = await addLink(harness, 'creator-a', { title: 'Ficha inicial', url: 'https://example.com/compartido' });
  const firstLink = await responseJson(first);
  const reference = await addLink(harness, 'creator-b', { title: 'Ignorado como copia', url: 'https://example.com/compartido' });
  const referenceLink = await responseJson(reference);
  assert.equal(reference.status, 201);
  assert.equal(referenceLink.resourceId, firstLink.resourceId);
  assert.notEqual(referenceLink.placementId, firstLink.placementId);

  const duplicate = await addLink(harness, 'creator-b', { title: 'Reintento', url: 'https://example.com/compartido' });
  const duplicateLink = await responseJson(duplicate);
  assert.equal(duplicateLink.resourceId, firstLink.resourceId);
  assert.equal(duplicateLink.placementId, referenceLink.placementId);

  const bState = await editor(harness, 'creator-b');
  const unauthorized = await api(harness, `/api/creador/recursos?id=${encodeURIComponent(firstLink.resourceId)}`, 'creator-b', {
    method: 'PATCH', body: { resourceVersion: bState.resources.find(({ id }) => id === firstLink.resourceId).version, title: 'Cambio ajeno' },
  });
  assert.ok([403, 404].includes(unauthorized.status));
  const aState = await editor(harness, 'creator-a');
  const changed = await api(harness, `/api/creador/enlaces/${firstLink.placementId}/editar`, 'creator-a', {
    method: 'PATCH', body: {
      creatorVersion: aState.creatorVersion,
      resourceVersion: aState.resources.find(({ id }) => id === firstLink.resourceId).version,
      title: 'Ficha actualizada',
    },
  });
  assert.equal(changed.status, 200);
  const newVersion = (await responseJson(changed)).resourceVersion;
  for (const slug of ['ana', 'bea']) {
    const page = await harness.service.readPublicProfile(slug);
    assert.equal(page.links[0].title, 'Ficha actualizada');
  }

  const afterA = await editor(harness, 'creator-a');
  const removed = await api(harness, `/api/creador/enlaces/${firstLink.placementId}`, 'creator-a', {
    method: 'DELETE', body: { creatorVersion: afterA.creatorVersion },
  });
  assert.equal(removed.status, 200);
  const stillShared = await harness.service.readPublicProfile('bea');
  assert.equal(stillShared.links.length, 1);
  const ownerStillEdits = await api(harness, `/api/creador/recursos?id=${encodeURIComponent(firstLink.resourceId)}`, 'creator-a', {
    method: 'PATCH', body: { title: 'El editor conserva autoridad', resourceVersion: newVersion },
  });
  assert.equal(ownerStillEdits.status, 200);
});

test('selection and approval stay separate: reselecting preserves approval, revoking never hides a profile link', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana' });
  const created = await addLink(harness);
  const { resourceId, placementId } = await responseJson(created);
  let snapshot = await editor(harness);
  const resourceVersion = snapshot.resources.find(({ id }) => id === resourceId).version;

  const incompleteApproval = await api(harness, `/api/admin/recursos/${resourceId}/aprobar`, 'admin', {
    method: 'POST', body: { version: resourceVersion },
  });
  assert.equal(incompleteApproval.status, 422);
  const classified = await classifyResource(harness, resourceId, resourceVersion);
  assert.equal(classified.status, 200);
  const approve = await api(harness, `/api/admin/recursos/${resourceId}/aprobar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', resourceId) },
  });
  assert.equal(approve.status, 200);
  snapshot = await editor(harness);
  const editApproved = await api(harness, `/api/creador/enlaces/${placementId}/editar`, 'creator-a', {
    method: 'PATCH', body: {
      creatorVersion: snapshot.creatorVersion,
      resourceVersion: snapshot.resources.find(({ id }) => id === resourceId).version,
      title: 'Título actualizado sin nueva moderación',
    },
  });
  assert.equal(editApproved.status, 200);
  snapshot = await editor(harness);
  const deselect = await api(harness, `/api/creador/enlaces/${placementId}`, 'creator-a', {
    method: 'PATCH', body: { creatorVersion: snapshot.creatorVersion, selectedForDirectory: false },
  });
  assert.equal(deselect.status, 200);
  let current = await editor(harness);
  assert.equal(current.placements[placementId].selectedForDirectory, false);
  assert.equal(current.resources.find(({ id }) => id === resourceId).directoryApproval, 'approved');

  const reselect = await api(harness, `/api/creador/enlaces/${placementId}`, 'creator-a', {
    method: 'PATCH', body: { creatorVersion: current.creatorVersion, selectedForDirectory: true },
  });
  assert.equal(reselect.status, 200);
  current = await editor(harness);
  assert.equal(current.resources.find(({ id }) => id === resourceId).directoryApproval, 'approved');

  const revoke = await api(harness, `/api/admin/recursos/${resourceId}/revocar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', resourceId) },
  });
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
  const { resourceId } = await responseJson(added);

  const hideProfile = await api(harness, `/api/admin/perfiles/${profile.id}/ocultar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'profile', profile.id) },
  });
  assert.equal(hideProfile.status, 200);
  assert.equal((await harness.service.readPublicProfile('ana')).status, 404);
  const showProfile = await api(harness, `/api/admin/perfiles/${profile.id}/restaurar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'profile', profile.id) },
  });
  assert.equal(showProfile.status, 200);

  const hideResource = await api(harness, `/api/admin/recursos/${resourceId}/ocultar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', resourceId) },
  });
  assert.equal(hideResource.status, 200);
  const page = await harness.service.readPublicProfile('ana');
  assert.equal(page.status, 200);
  assert.equal(page.profile.published, true);
  assert.equal(page.profile.hidden, false);
  assert.equal(page.links.length, 0);
  const restoreResource = await api(harness, `/api/admin/recursos/${resourceId}/restaurar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', resourceId) },
  });
  assert.equal(restoreResource.status, 200);
  assert.equal((await harness.service.readPublicProfile('ana')).links.length, 1);
});

test('admin moderation validates observed versions for every resource and profile action', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana-moderation' });
  const created = await addLink(harness);
  const { resourceId, resourceVersion } = await responseJson(created);
  assert.equal((await classifyResource(harness, resourceId, resourceVersion)).status, 200);

  const actions = [
    ['resource', resourceId, 'aprobar'],
    ['resource', resourceId, 'revocar'],
    ['resource', resourceId, 'ocultar'],
    ['resource', resourceId, 'restaurar'],
    ['profile', profile.id, 'ocultar'],
    ['profile', profile.id, 'restaurar'],
  ];
  const actionPath = (type, id, action) => type === 'resource'
    ? `/api/admin/recursos/${encodeURIComponent(id)}/${action}`
    : `/api/admin/perfiles/${encodeURIComponent(id)}/${action}`;

  const writesBeforeInvalid = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  for (const [type, id, action] of actions) {
    for (const options of [
      { method: 'POST' },
      { method: 'POST', body: { version: '1' } },
      { method: 'POST', body: { version: -1 } },
    ]) {
      const invalid = await api(harness, actionPath(type, id, action), 'admin', options);
      assert.equal(invalid.status, 422, `${type} ${action} rejects a missing or invalid version`);
    }
  }
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writesBeforeInvalid,
    'missing and malformed versions must not write');

  for (const [type, id, action] of actions) {
    const before = await readAdminRecord(harness, type, id);
    const observedVersion = before.version;
    const updated = await api(harness, actionPath(type, id, action), 'admin', {
      method: 'POST', body: { version: observedVersion },
    });
    assert.equal(updated.status, 200, `${type} ${action} accepts its current observed version`);
    const result = await responseJson(updated);
    assert.deepEqual(result.versionChanges, [{
      entity: type, id, before: observedVersion, after: observedVersion + 1,
    }]);
    const transaction = harness.store.calls.findLast(({ operation, input }) => operation === 'transact'
      && input.puts.some((put) => put.key === `${type}:${id}`));
    assert.equal(transaction?.input.checks.find((check) => check.key === `${type}:${id}`)?.version, observedVersion,
      'the transaction compares the version that the administrator observed');

    const logicalKey = `${type}:${id}`;
    const stateBeforeRepeat = await harness.store.get(logicalKey);
    const idempotent = await api(harness, actionPath(type, id, action), 'admin', {
      method: 'POST', body: { version: observedVersion + 1 },
    });
    assert.equal(idempotent.status, 200, `${type} ${action} accepts a valid repeat`);
    assert.deepEqual((await responseJson(idempotent)).versionChanges, []);
    assert.deepEqual(await harness.store.get(logicalKey), stateBeforeRepeat,
      'a valid repeat preserves stored fields, version, and timestamps');

    const stateBeforeStaleRepeat = await harness.store.get(logicalKey);
    const staleIdempotent = await api(harness, actionPath(type, id, action), 'admin', {
      method: 'POST', body: { version: observedVersion },
    });
    assert.equal(staleIdempotent.status, 409, `${type} ${action} rejects a stale request even when its target state is current`);
    assert.deepEqual(await harness.store.get(logicalKey), stateBeforeStaleRepeat,
      'a stale request preserves stored fields, version, and timestamps');
  }

  await seedResource(harness.store, {
    id: 'legacy-version-zero', title: 'Recurso legado', url: 'https://example.com/legacy-zero', published: false,
  });
  const legacyAction = await api(harness, '/api/admin/recursos/legacy-version-zero/ocultar', 'admin', {
    method: 'POST', body: { version: 0 },
  });
  assert.equal(legacyAction.status, 200, 'version 0 remains a valid observed version for legacy resources');
  assert.deepEqual((await responseJson(legacyAction)).versionChanges, [
    { entity: 'resource', id: 'legacy-version-zero', before: 0, after: 1 },
  ]);
});

test('a stale tab cannot restore an approval after another admin revoked it', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana-stale-admin' });
  const created = await addLink(harness);
  const { resourceId, resourceVersion } = await responseJson(created);
  assert.equal((await classifyResource(harness, resourceId, resourceVersion)).status, 200);
  const observedByBothTabs = await adminVersion(harness, 'resource', resourceId);

  const approved = await api(harness, `/api/admin/recursos/${resourceId}/aprobar`, 'admin', {
    method: 'POST', body: { version: observedByBothTabs },
  });
  assert.equal(approved.status, 200);
  const revoked = await api(harness, `/api/admin/recursos/${resourceId}/revocar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', resourceId) },
  });
  assert.equal(revoked.status, 200);
  const beforeStaleClick = await harness.store.get(`resource:${resourceId}`);
  assert.equal(beforeStaleClick.published, false);
  assert.equal(beforeStaleClick.approvalRevoked, true);

  const writesBeforeStaleClick = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const staleApprove = await api(harness, `/api/admin/recursos/${resourceId}/aprobar`, 'admin', {
    method: 'POST', body: { version: observedByBothTabs },
  });
  assert.equal(staleApprove.status, 409);
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writesBeforeStaleClick);
  assert.deepEqual(await harness.store.get(`resource:${resourceId}`), beforeStaleClick,
    'the later revocation remains intact after the older tab acts');
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
  const linked = await responseJson(reference);
  const { resourceId } = linked;
  assert.equal(resourceId, 'legacy-guide');
  const snapshot = await editor(harness);
  assert.equal(snapshot.placements[linked.placementId].selectedForDirectory, false);
  const edit = await api(harness, `/api/creador/recursos?id=${encodeURIComponent(resourceId)}`, 'creator-a', {
    method: 'PATCH', body: {
      title: 'Intento de apropiación', resourceVersion: snapshot.resources.find(({ id }) => id === resourceId).version,
    },
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
    method: 'POST', body: { resources: [{ resourceId: 'claim-one', url: 'https://example.com/one' }], sourceId: 'same-source' },
  });
  assert.equal(userClaim.status, 202);
  const requestDoesNotGrantEditing = await api(harness, '/api/creador/recursos?id=claim-one', 'creator-a', {
    method: 'PATCH', body: { title: 'Todavía sin autorización', resourceVersion: 1 },
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
  const oneResource = (await responseJson(one)).resourceId;
  const twoResource = (await responseJson(two)).resourceId;
  assert.equal(oneResource, 'claim-one');
  assert.equal(twoResource, 'claim-two');
  const claimedPage = await harness.service.readPublicProfile('ana');
  assert.equal(claimedPage.links.filter(({ resourceId }) => resourceId === 'claim-one').length, 1);
  assert.equal(claimedPage.links.find(({ resourceId }) => resourceId === 'claim-one').directoryApproval, 'approved');
  const canEditClaimed = await api(harness, `/api/creador/recursos?id=${encodeURIComponent(oneResource)}`, 'creator-a', {
    method: 'PATCH', body: {
      title: 'Reclamado', resourceVersion: (await harness.store.get(`resource:${oneResource}`)).version,
    },
  });
  assert.equal(canEditClaimed.status, 200);
  const sourceSiblingRemainsUnclaimed = await api(harness, `/api/creador/recursos?id=${encodeURIComponent(twoResource)}`, 'creator-a', {
    method: 'PATCH', body: {
      title: 'Sin vínculo explícito', resourceVersion: (await harness.store.get(`resource:${twoResource}`)).version,
    },
  });
  assert.equal(sourceSiblingRemainsUnclaimed.status, 403);

  const conflictingClaim = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-b', resourceIds: ['claim-one'], sourceId: 'same-source' },
  });
  assert.equal(conflictingClaim.status, 409);
  const stillOwner = await api(harness, `/api/creador/recursos?id=${encodeURIComponent(oneResource)}`, 'creator-a', {
    method: 'PATCH', body: {
      title: 'La autoridad sigue con Ana', resourceVersion: (await harness.store.get(`resource:${oneResource}`)).version,
    },
  });
  assert.equal(stillOwner.status, 200);
});

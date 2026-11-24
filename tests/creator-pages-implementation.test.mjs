import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  readAdminRecord,
  responseJson,
  seedResource,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';
import { CREATOR_CONTRACT_VERSION } from '../src/lib/creator-values.mjs';

async function api(harness, path, session, options = {}) {
  const creatorContract = Object.hasOwn(options, 'creatorContract')
    ? options.creatorContract
    : options.method === undefined || options.method === 'GET' ? undefined : CREATOR_CONTRACT_VERSION;
  return callApi(harness, path, { session, csrf: sessionCsrf[session], ...options, creatorContract });
}

async function adminVersion(harness, type, id) {
  return (await readAdminRecord(harness, type, id)).version;
}

async function owner(harness, session = 'creator-a') {
  const response = await api(harness, '/api/creador/perfil', session);
  assert.equal(response.status, 200, await response.clone().text());
  return responseJson(response);
}

async function createProfile(harness, session, slug) {
  const observed = await responseJson(await api(harness, '/api/creador/perfil', session));
  const response = await api(harness, '/api/creador/perfil', session, {
    method: 'PUT',
    body: { creatorVersion: observed.creatorVersion, displayName: `${session} creator`, slug, programs: [], socials: {} },
  });
  assert.equal(response.status, 200);
  return (await responseJson(await api(harness, '/api/creador/perfil', session))).profile;
}

async function seedLegacyResource(store, id, url, extra = {}) {
  await seedResource(store, {
    id,
    url,
    title: `Ficha ${id}`,
    description: '',
    category: 'Artículo',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    order: 1,
    featured: false,
    published: false,
    version: 1,
    directoryControl: 'editorial',
    ...extra,
  });
}

test('a draft may clear its slug without writing an empty alias reservation', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', 'borrador-con-ruta');
  const observed = await owner(harness);
  const saved = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT',
    body: { creatorVersion: observed.creatorVersion, displayName: 'Nombre visible', slug: '', programs: [], socials: {} },
  });
  assert.equal(saved.status, 200);
  assert.equal((await owner(harness)).profile.slug, '');
  assert.equal((await harness.service.readPublicProfile('borrador-con-ruta')).status, 404);
  assert.equal(harness.store.calls.some(({ operation, input }) => operation === 'get' && input.key === 'alias:'), false);
  assert.equal(harness.store.calls.some(({ operation, input }) => operation === 'transact'
    && input.puts.some(({ key }) => key === 'alias:')), false);
});

test('a partial admin claim stays partial until every requested resource is linked to the same creator', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', 'ana');
  await seedLegacyResource(harness.store, 'claim-a', 'https://example.com/claim-a');
  await seedLegacyResource(harness.store, 'claim-b', 'https://example.com/claim-b');

  const request = await api(harness, '/api/creador/reclamaciones', 'creator-a', {
    method: 'POST', body: { resources: [
      { resourceId: 'claim-a', url: 'https://example.com/claim-a' },
      { resourceId: 'claim-b', url: 'https://example.com/claim-b' },
    ], sourceId: 'ana-channel' },
  });
  assert.equal(request.status, 202);

  const first = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', sourceId: 'ana-channel', resourceIds: ['claim-a'] },
  });
  assert.equal(first.status, 200);
  const pending = await api(harness, '/api/admin/reclamaciones', 'admin');
  assert.equal((await responseJson(pending)).claims[0].status, 'partial');
  const profileId = (await harness.store.get('account-profile:private-account-a')).profileId;
  assert.equal((await harness.store.get('resource:claim-a')).editorProfileId, profileId);
  assert.equal((await harness.store.get('resource:claim-b')).directoryControl, 'editorial');
  let profile = await harness.store.get(`profile:${profileId}`);
  assert.deepEqual(profile.order, { featured: [], ordinary: [Object.keys(profile.placements)[0]] },
    'admin linking adds one placement to the creator aggregate');
  assert.equal(Object.values(profile.placements)[0].resourceId, 'claim-a');

  const second = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', sourceId: 'ana-channel', resourceIds: ['claim-b'] },
  });
  assert.equal(second.status, 200);
  profile = await harness.store.get(`profile:${profileId}`);
  assert.equal(Object.keys(profile.placements).length, 2);
  assert.deepEqual(new Set(Object.values(profile.placements).map(({ resourceId }) => resourceId)), new Set(['claim-a', 'claim-b']));
  assert.equal(profile.order.ordinary.length, 2);
  const resolved = await api(harness, '/api/admin/reclamaciones', 'admin');
  assert.equal((await responseJson(resolved)).claims[0].status, 'resolved');

  const beforeRetryProfile = await harness.store.get(`profile:${(await harness.store.get('account-profile:private-account-a')).profileId}`);
  const beforeRetryResource = await harness.store.get('resource:claim-a');
  const retry = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', sourceId: 'ana-channel', resourceIds: ['claim-a', 'claim-b'] },
  });
  assert.equal(retry.status, 200);
  assert.equal((await harness.store.get(`profile:${beforeRetryProfile.id}`)).version, beforeRetryProfile.version);
  assert.equal((await harness.store.get('resource:claim-a')).version, beforeRetryResource.version);
});

test('admin prevalidates all exact claim resources before changing any ownership', async () => {
  const harness = await createCreatorPagesHarness();
  const target = await createProfile(harness, 'creator-a', 'ana');
  const other = await createProfile(harness, 'creator-b', 'bea');
  const targetVersion = (await harness.store.get(`profile:${target.id}`)).version;
  await seedLegacyResource(harness.store, 'claim-free', 'https://example.com/free');
  await seedLegacyResource(harness.store, 'claim-owned', 'https://example.com/owned', {
    directoryControl: 'creator', editorProfileId: other.id, autoSync: false,
  });

  const conflict = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', resourceIds: ['claim-free', 'claim-owned'] },
  });
  assert.equal(conflict.status, 409);
  const free = await harness.store.get('resource:claim-free');
  assert.equal(free.directoryControl, 'editorial');
  assert.equal(free.editorProfileId, undefined);
  assert.equal((await harness.store.get(`profile:${target.id}`)).version, targetVersion);
});

test('valid events can be approved again without resource taxonomy and creator URL edits reserve registrationUrl', async () => {
  const harness = await createCreatorPagesHarness();
  const oldUrl = 'https://example.com/events/original?source=meetup';
  const currentUrl = 'https://example.com/events/updated?source=meetup';
  await seedResource(harness.store, {
    id: 'event-verified',
    recordType: 'event',
    title: 'Encuentro AWS',
    description: 'Evento para la comunidad.',
    startsAt: '2099-05-01T17:00:00Z',
    endsAt: '2099-05-01T19:00:00Z',
    timeZone: 'UTC',
    organizer: 'Comunidad AWS',
    mode: 'online',
    registrationUrl: oldUrl,
    published: false,
    version: 1,
    directoryControl: 'editorial',
  });

  const approve = await api(harness, '/api/admin/recursos/event-verified/aprobar', 'admin', {
    method: 'POST', body: { version: 1 },
  });
  assert.equal(approve.status, 200, 'event validation must not invent a content taxonomy');
  const revoke = await api(harness, '/api/admin/recursos/event-verified/revocar', 'admin', {
    method: 'POST', body: { version: 2 },
  });
  assert.equal(revoke.status, 200);
  const restore = await api(harness, '/api/admin/recursos/event-verified/aprobar', 'admin', {
    method: 'POST', body: { version: 3 },
  });
  assert.equal(restore.status, 200);
  assert.equal((await harness.store.get('resource:event-verified')).registrationUrl, oldUrl);

  await createProfile(harness, 'creator-a', 'ana-eventos');
  let snapshot = await owner(harness);
  const publish = await api(harness, '/api/creador/perfil/publicar', 'creator-a', {
    method: 'POST', body: { creatorVersion: snapshot.creatorVersion },
  });
  assert.equal(publish.status, 200);
  snapshot = await owner(harness);
  const existing = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { creatorVersion: snapshot.creatorVersion, title: 'Encuentro AWS', url: oldUrl },
  });
  assert.equal(existing.status, 201);
  const added = await responseJson(existing);
  const claim = await api(harness, '/api/creador/reclamaciones', 'creator-a', {
    method: 'POST', body: { resources: [{ resourceId: 'event-verified', url: oldUrl }], sourceId: 'community' },
  });
  assert.equal(claim.status, 202);
  const link = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', resourceIds: ['event-verified'] },
  });
  assert.equal(link.status, 200);

  snapshot = await owner(harness);
  const resourceVersion = snapshot.resources.find(({ id }) => id === 'event-verified').version;
  const changed = await api(harness, `/api/creador/enlaces/${added.placementId}/editar`, 'creator-a', {
    method: 'PATCH', body: { creatorVersion: snapshot.creatorVersion, resourceVersion, url: currentUrl },
  });
  assert.equal(changed.status, 200);
  assert.equal((await responseJson(changed)).operation, 'edit-link');

  const event = await harness.store.get('resource:event-verified');
  assert.equal(event.registrationUrl, currentUrl);
  assert.equal(event.url, undefined);
  const oldUrlKey = `url:${createHash('sha256').update(oldUrl, 'utf8').digest('hex')}`;
  assert.equal(await harness.store.get(oldUrlKey), null);
  const publicProfile = await harness.service.readPublicProfile('ana-eventos');
  assert.equal(publicProfile.links[0].url, currentUrl);
  assert.equal(publicProfile.links[0].directoryApproval, 'approved');
  const adminResources = await api(harness, '/api/admin/recursos', 'admin');
  const eventDto = (await responseJson(adminResources)).resources.find(({ id }) => id === 'event-verified');
  assert.equal(eventDto.url, currentUrl);
  assert.equal(eventDto.recordType, 'event');
});

test('creator text limits reject oversized fields before storage and accept each configured boundary', async () => {
  const invalidCases = [
    ['/api/creador/perfil', { displayName: 'n'.repeat(121), slug: 'ana' }],
    ['/api/creador/perfil', { displayName: 'Ana', slug: 'ana', city: 'c'.repeat(101) }],
    ['/api/creador/perfil', { displayName: 'Ana', slug: 'ana', country: 'c'.repeat(101) }],
    ['/api/creador/perfil', { displayName: 'Ana', slug: 'ana', bio: 'b'.repeat(2001) }],
    ['/api/creador/perfil', { displayName: 'Ana', slug: 'ana', socials: { instagram: 's'.repeat(501) } }],
    ['/api/creador/enlaces', { title: 't'.repeat(201), url: 'https://example.com' }],
    ['/api/creador/enlaces', { title: 'Título', url: `https://example.com/${'x'.repeat(2048)}` }],
    ['/api/creador/enlaces', { title: 'Título', url: 'https://example.com', description: 'd'.repeat(2001) }],
    ['/api/creador/reclamaciones', { resourceIds: ['resource-a'], sourceId: 's'.repeat(2001) }],
    ['/api/creador/reclamaciones', { resourceIds: ['resource-a'], evidence: 'e'.repeat(2001) }],
  ];

  for (const [path, body] of invalidCases) {
    const harness = await createCreatorPagesHarness();
    const response = await api(harness, path, 'creator-a', {
      method: path.endsWith('/perfil') ? 'PUT' : 'POST',
      body,
    });
    assert.equal(response.status, 422, `${Object.keys(body).find((field) => typeof body[field] === 'string') ?? 'field'} should reject above its configured limit`);
    assert.equal((await responseJson(response)).error, 'FIELD_TOO_LONG');
    assert.equal(harness.store.calls.length, 0, 'text validation must finish before any storage access');
  }

  const harness = await createCreatorPagesHarness();
  const profileResponse = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT',
    body: {
      creatorVersion: null,
      displayName: 'N'.repeat(120),
      slug: 'ana',
      city: 'C'.repeat(100),
      country: 'P'.repeat(100),
      bio: 'B'.repeat(2000),
      socials: { instagram: `https://example.com/${'i'.repeat(500 - 'https://example.com/'.length)}` },
    },
  });
  assert.equal(profileResponse.status, 200, 'profile fields at their maximum length remain valid');
  const maximumProfile = await owner(harness);

  const linkResponse = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST',
    body: {
      creatorVersion: maximumProfile.creatorVersion,
      title: 'T'.repeat(200), url: `https://example.com/${'x'.repeat(2028)}`, description: 'D'.repeat(2000),
    },
  });
  assert.equal(linkResponse.status, 201, 'creator link fields at their maximum length remain valid');
});

test('oversized JSON bodies are rejected before storage access', async () => {
  const harness = await createCreatorPagesHarness();
  const response = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT',
    body: { displayName: 'Ana', slug: 'ana', bio: 'x'.repeat(32 * 1024) },
  });
  assert.equal(response.status, 413);
  assert.equal((await responseJson(response)).error, 'BODY_TOO_LARGE');
  assert.equal(harness.store.calls.length, 0, 'body size must be checked before any storage access');
});

test('public profile reads all linked resources through one complete batch and keeps link order', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', 'ana');
  let snapshot = await owner(harness);
  const published = await api(harness, '/api/creador/perfil/publicar', 'creator-a', {
    method: 'POST', body: { creatorVersion: snapshot.creatorVersion },
  });
  assert.equal(published.status, 200);

  const resourceIds = [];
  for (const [title, slug] of [['Uno', 'uno'], ['Dos', 'dos'], ['Tres', 'tres']]) {
    snapshot = await owner(harness);
    const response = await api(harness, '/api/creador/enlaces', 'creator-a', {
      method: 'POST', body: { creatorVersion: snapshot.creatorVersion, title, url: `https://example.com/${slug}` },
    });
    assert.equal(response.status, 201);
    resourceIds.push((await responseJson(response)).resourceId);
  }

  const get = harness.store.get.bind(harness.store);
  const batches = [];
  harness.store.getResources = async (ids) => {
    batches.push([...ids]);
    const resources = new Map();
    for (const id of ids) {
      const resource = await get(`resource:${id}`);
      if (resource) resources.set(id, resource);
    }
    return resources;
  };

  const page = await harness.service.readPublicProfile('ana');
  assert.equal(page.status, 200);
  assert.deepEqual(batches, [resourceIds]);
  assert.deepEqual(page.links.map(({ title }) => title), ['Uno', 'Dos', 'Tres']);
});

test('profile reads fail with 503 when a resource batch omits an expected linked resource', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', 'ana');
  let snapshot = await owner(harness);
  const published = await api(harness, '/api/creador/perfil/publicar', 'creator-a', {
    method: 'POST', body: { creatorVersion: snapshot.creatorVersion },
  });
  assert.equal(published.status, 200);
  snapshot = await owner(harness);
  const added = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { creatorVersion: snapshot.creatorVersion, title: 'Recurso', url: 'https://example.com/resource' },
  });
  assert.equal(added.status, 201);

  harness.store.getResources = async () => new Map();
  const page = await harness.service.readPublicProfile('ana');
  assert.deepEqual(page, { status: 503 }, 'a missing item must not produce a partial public model');
  const editor = await api(harness, '/api/creador/perfil', 'creator-a');
  assert.equal(editor.status, 503);
});


test('canonical trailing-slash API routes support creator writes and admin moderation', async () => {
  const harness = await createCreatorPagesHarness();
  const saved = await api(harness, '/api/creador/perfil/', 'creator-a', {
    method: 'PUT', body: { creatorVersion: null, displayName: 'Ana', slug: 'ana-canonica' },
  });
  assert.equal(saved.status, 200);
  assert.equal((await api(harness, '/api/creador/perfil/', 'creator-a')).status, 200);
  let snapshot = await owner(harness);
  assert.equal((await api(harness, '/api/creador/perfil/publicar/', 'creator-a', {
    method: 'POST', body: { creatorVersion: snapshot.creatorVersion },
  })).status, 200);
  snapshot = await owner(harness);
  const added = await api(harness, '/api/creador/enlaces/', 'creator-a', {
    method: 'POST', body: { creatorVersion: snapshot.creatorVersion, title: 'Guía', url: 'https://example.com/canonical' },
  });
  assert.equal(added.status, 201);
  const link = await responseJson(added);
  snapshot = await owner(harness);
  assert.equal((await api(harness, `/api/creador/enlaces/${link.placementId}/`, 'creator-a', {
    method: 'PATCH', body: { creatorVersion: snapshot.creatorVersion, selectedForDirectory: false },
  })).status, 200);
  assert.equal((await api(harness, '/api/admin/recursos/', 'admin')).status, 200);
  assert.equal((await api(harness, `/api/admin/recursos/${link.resourceId}/ocultar/`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'resource', link.resourceId) },
  })).status, 200);
  snapshot = await owner(harness);
  assert.equal((await api(harness, `/api/creador/enlaces/${link.placementId}/`, 'creator-a', {
    method: 'DELETE', body: { creatorVersion: snapshot.creatorVersion },
  })).status, 200);
});

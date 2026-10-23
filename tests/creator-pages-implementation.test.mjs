import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  seedResource,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';

async function api(harness, path, session, options = {}) {
  return callApi(harness, path, { session, csrf: sessionCsrf[session], ...options });
}

async function createProfile(harness, session, slug) {
  const response = await api(harness, '/api/creador/perfil', session, {
    method: 'PUT',
    body: { displayName: `${session} creator`, slug, programs: [], socials: {} },
  });
  assert.equal(response.status, 200);
  return (await responseJson(response)).profile;
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
  const profile = await createProfile(harness, 'creator-a', 'borrador-con-ruta');
  const saved = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT',
    body: { displayName: 'Nombre visible', slug: '', version: profile.version, programs: [], socials: {} },
  });
  assert.equal(saved.status, 200);
  assert.equal((await responseJson(saved)).profile.slug, '');
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
    method: 'POST', body: { resourceIds: ['claim-a', 'claim-b'], sourceId: 'ana-channel' },
  });
  assert.equal(request.status, 202);

  const first = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', sourceId: 'ana-channel', resourceIds: ['claim-a'] },
  });
  assert.equal(first.status, 200);
  const pending = await api(harness, '/api/admin/reclamaciones', 'admin');
  assert.equal((await responseJson(pending)).claims[0].status, 'partial');
  assert.equal((await harness.store.get('resource:claim-a')).editorProfileId, (await harness.store.get('account-profile:private-account-a')).profileId);
  assert.equal((await harness.store.get('resource:claim-b')).directoryControl, 'editorial');

  const second = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', sourceId: 'ana-channel', resourceIds: ['claim-b'] },
  });
  assert.equal(second.status, 200);
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
  assert.equal((await harness.store.get(`profile:${target.id}`)).version, target.version);
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

  const approve = await api(harness, '/api/admin/recursos/event-verified/aprobar', 'admin', { method: 'POST', body: {} });
  assert.equal(approve.status, 200, 'event validation must not invent a content taxonomy');
  const revoke = await api(harness, '/api/admin/recursos/event-verified/revocar', 'admin', { method: 'POST', body: {} });
  assert.equal(revoke.status, 200);
  const restore = await api(harness, '/api/admin/recursos/event-verified/aprobar', 'admin', { method: 'POST', body: {} });
  assert.equal(restore.status, 200);
  assert.equal((await harness.store.get('resource:event-verified')).registrationUrl, oldUrl);

  await createProfile(harness, 'creator-a', 'ana-eventos');
  const publish = await api(harness, '/api/creador/perfil/publicar', 'creator-a', { method: 'POST', body: {} });
  assert.equal(publish.status, 200);
  const existing = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { title: 'Encuentro AWS', url: oldUrl },
  });
  assert.equal(existing.status, 201);
  const claim = await api(harness, '/api/creador/reclamaciones', 'creator-a', {
    method: 'POST', body: { resourceIds: ['event-verified'], sourceId: 'community' },
  });
  assert.equal(claim.status, 202);
  const link = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', resourceIds: ['event-verified'] },
  });
  assert.equal(link.status, 200);

  const editor = await api(harness, '/api/creador/perfil', 'creator-a');
  const linkVersion = (await responseJson(editor)).links[0].resourceVersion;
  const changed = await api(harness, '/api/creador/recursos/event-verified', 'creator-a', {
    method: 'PATCH', body: { url: currentUrl, version: linkVersion },
  });
  assert.equal(changed.status, 200);
  assert.equal((await responseJson(changed)).resource.url, currentUrl);

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
      displayName: 'N'.repeat(120),
      slug: 'ana',
      city: 'C'.repeat(100),
      country: 'P'.repeat(100),
      bio: 'B'.repeat(2000),
      socials: { instagram: 'I'.repeat(500) },
    },
  });
  assert.equal(profileResponse.status, 200, 'profile fields at their maximum length remain valid');

  const linkResponse = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST',
    body: { title: 'T'.repeat(200), url: `https://example.com/${'x'.repeat(2028)}`, description: 'D'.repeat(2000) },
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
  const published = await api(harness, '/api/creador/perfil/publicar', 'creator-a', { method: 'POST', body: {} });
  assert.equal(published.status, 200);

  const resourceIds = [];
  for (const [title, slug] of [['Uno', 'uno'], ['Dos', 'dos'], ['Tres', 'tres']]) {
    const response = await api(harness, '/api/creador/enlaces', 'creator-a', {
      method: 'POST', body: { title, url: `https://example.com/${slug}` },
    });
    assert.equal(response.status, 201);
    resourceIds.push((await responseJson(response)).link.resourceId);
  }

  const get = harness.store.get.bind(harness.store);
  const batches = [];
  harness.store.getResources = async (ids) => {
    batches.push([...ids]);
    return new Map(await Promise.all(ids.map(async (id) => [id, await get(`resource:${id}`)])));
  };

  const page = await harness.service.readPublicProfile('ana');
  assert.equal(page.status, 200);
  assert.deepEqual(batches, [resourceIds]);
  assert.deepEqual(page.links.map(({ title }) => title), ['Uno', 'Dos', 'Tres']);
});

test('profile reads fail with 503 when a resource batch omits an expected linked resource', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', 'ana');
  const published = await api(harness, '/api/creador/perfil/publicar', 'creator-a', { method: 'POST', body: {} });
  assert.equal(published.status, 200);
  const added = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { title: 'Recurso', url: 'https://example.com/resource' },
  });
  assert.equal(added.status, 201);

  harness.store.getResources = async () => new Map();
  const page = await harness.service.readPublicProfile('ana');
  assert.deepEqual(page, { status: 503 }, 'a missing item must not produce a partial public model');
  const editor = await api(harness, '/api/creador/perfil', 'creator-a');
  assert.equal(editor.status, 503);
});

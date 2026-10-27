import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  seedResource,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';

const MAX_POSITION = Number.MAX_SAFE_INTEGER;

async function api(harness, path, session = 'creator-a', { method = 'GET', body } = {}) {
  return callApi(harness, path, {
    session,
    csrf: sessionCsrf[session],
    method,
    ...(body === undefined ? {} : { body }),
  });
}

async function createPublishedProfile(harness, slug = 'order-boundary') {
  const saved = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT', body: { displayName: 'Orden estable', slug },
  });
  assert.equal(saved.status, 200);
  const published = await api(harness, '/api/creador/perfil/publicar', 'creator-a', { method: 'POST', body: {} });
  assert.equal(published.status, 200);
  return (await responseJson(published)).profile;
}

async function addNewLink(harness, url, title = 'Enlace') {
  return api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { title, url },
  });
}

async function editor(harness) {
  const response = await api(harness, '/api/creador/perfil');
  assert.equal(response.status, 200);
  return responseJson(response);
}

async function setPosition(harness, link, position) {
  const current = await editor(harness);
  const selected = current.links.find(({ placementId }) => placementId === link.placementId);
  assert.ok(selected, `placement ${link.placementId} should be in the editor`);
  const response = await api(harness, `/api/creador/enlaces/${link.placementId}`, 'creator-a', {
    method: 'PATCH',
    body: { position, version: selected.placementVersion, profileVersion: current.profile.version },
  });
  assert.equal(response.status, 200);
  return (await responseJson(response)).link;
}

async function addSeriesChapter(harness, link, slug = 'order-series') {
  let current = await editor(harness);
  const seriesResponse = await api(harness, '/api/creador/series', 'creator-a', {
    method: 'POST', body: { name: 'Serie de orden', slug, profileVersion: current.profile.version },
  });
  assert.equal(seriesResponse.status, 201);
  const { series } = await responseJson(seriesResponse);
  current = await editor(harness);
  const chapter = await api(harness, `/api/creador/series/${series.id}/capitulos/${link.placementId}`, 'creator-a', {
    method: 'PUT', body: { profileVersion: current.profile.version },
  });
  assert.equal(chapter.status, 200);
  return series;
}

async function expectPublishedProfileAndSeriesReadable(harness, slug = 'order-boundary', seriesSlug = 'order-series') {
  const privateEditor = await api(harness, '/api/creador/perfil');
  assert.equal(privateEditor.status, 200);
  const profile = await harness.service.readPublicProfile(slug);
  assert.equal(profile.status, 200);
  const series = await harness.service.readPublicSeries(slug, seriesSlug);
  assert.equal(series.status, 200);
  return { editor: await responseJson(privateEditor), profile, series };
}

async function snapshot(harness, profileId) {
  return {
    profile: await harness.store.get(`profile:${profileId}`),
    resources: await harness.store.list('resource:'),
    reservations: await harness.store.list('url:'),
    editors: await harness.store.list(`editor:${profileId}:`),
    placements: await harness.store.list(`placement:${profileId}:`),
    claims: await harness.store.list('claim:'),
    claimRefs: await harness.store.list(`claim-ref:${profileId}:`),
  };
}

function transactionCount(harness) {
  return harness.store.calls.filter(({ operation }) => operation === 'transact').length;
}

async function expectOrderExhausted(response) {
  assert.equal(response.status, 409);
  assert.equal((await responseJson(response)).error, 'PLACEMENT_ORDER_EXHAUSTED');
}

async function fullPositionFixture(slug = 'order-boundary', position = MAX_POSITION) {
  const harness = await createCreatorPagesHarness();
  await createPublishedProfile(harness, slug);
  const added = await addNewLink(harness, `https://example.com/${slug}-first`, 'Primer enlace');
  assert.equal(added.status, 201);
  const first = (await responseJson(added)).link;
  await addSeriesChapter(harness, first);
  await setPosition(harness, first, position);
  return { harness, first };
}

test('new-resource append at an exhausted order is rejected before any write and keeps profile and series readable', async () => {
  const { harness, first } = await fullPositionFixture();
  const before = await snapshot(harness, (await editor(harness)).profile.id);
  const writesBefore = transactionCount(harness);

  await expectOrderExhausted(await addNewLink(harness, 'https://example.com/order-new'));

  assert.deepEqual(await snapshot(harness, before.profile.id), before);
  assert.equal(transactionCount(harness), writesBefore);
  const { editor: current } = await expectPublishedProfileAndSeriesReadable(harness);
  assert.equal(current.links.find(({ placementId }) => placementId === first.placementId).position, MAX_POSITION);
});

test('existing URL attachment at an exhausted order is rejected without changing any record', async () => {
  const { harness } = await fullPositionFixture();
  await seedResource(harness.store, {
    id: 'existing-at-exhaustion', title: 'Existente', url: 'https://example.com/order-existing',
    description: '', published: true, version: 1, directoryControl: 'editorial',
  });
  const profileId = (await editor(harness)).profile.id;
  const before = await snapshot(harness, profileId);
  const writesBefore = transactionCount(harness);

  await expectOrderExhausted(await addNewLink(harness, 'https://example.com/order-existing'));

  assert.deepEqual(await snapshot(harness, profileId), before);
  assert.equal(transactionCount(harness), writesBefore);
  await expectPublishedProfileAndSeriesReadable(harness);
});

test('re-adding a retained editable resource at an exhausted order is rejected before changing records', async () => {
  const harness = await createCreatorPagesHarness();
  await createPublishedProfile(harness);
  const targetResponse = await addNewLink(harness, 'https://example.com/order-readd-target', 'Reincorporar');
  const target = (await responseJson(targetResponse)).link;
  const blockerResponse = await addNewLink(harness, 'https://example.com/order-readd-blocker', 'Enlace vigente');
  const blocker = (await responseJson(blockerResponse)).link;
  await addSeriesChapter(harness, blocker);

  let current = await editor(harness);
  const removed = await api(harness, `/api/creador/enlaces/${target.placementId}`, 'creator-a', {
    method: 'DELETE', body: { profileVersion: current.profile.version },
  });
  assert.equal(removed.status, 204);
  await setPosition(harness, blocker, MAX_POSITION);
  current = await editor(harness);
  const retained = current.editableResources.find(({ id }) => id === target.resourceId);
  assert.ok(retained);
  const before = await snapshot(harness, current.profile.id);
  const writesBefore = transactionCount(harness);

  await expectOrderExhausted(await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { resourceId: target.resourceId, resourceVersion: retained.version },
  }));

  assert.deepEqual(await snapshot(harness, current.profile.id), before);
  assert.equal(transactionCount(harness), writesBefore);
  await expectPublishedProfileAndSeriesReadable(harness);
});

test('admin claim append at an exhausted order is rejected without claiming or writing anything', async () => {
  const { harness } = await fullPositionFixture();
  await seedResource(harness.store, {
    id: 'legacy-at-exhaustion', title: 'Legado', url: 'https://example.com/order-legacy',
    description: '', published: true, version: 0, directoryControl: 'editorial',
  });
  const claimResponse = await api(harness, '/api/creador/reclamaciones', 'creator-a', {
    method: 'POST', body: { resourceIds: ['legacy-at-exhaustion'] },
  });
  assert.equal(claimResponse.status, 202);
  const profileId = (await editor(harness)).profile.id;
  const before = await snapshot(harness, profileId);
  const writesBefore = transactionCount(harness);

  await expectOrderExhausted(await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', resourceIds: ['legacy-at-exhaustion'] },
  }));

  assert.deepEqual(await snapshot(harness, profileId), before);
  assert.equal(transactionCount(harness), writesBefore);
  assert.equal((await harness.store.get('resource:legacy-at-exhaustion')).directoryControl, 'editorial');
  assert.equal(await harness.store.get(`editor:${profileId}:legacy-at-exhaustion`), null);
  await expectPublishedProfileAndSeriesReadable(harness);
});

test('a claim that reaches exhaustion partway reports only its committed resource and exact version receipts', async () => {
  const { harness, first } = await fullPositionFixture('partial-order', MAX_POSITION - 10);
  for (const id of ['partial-order-a', 'partial-order-b']) {
    await seedResource(harness.store, {
      id, title: id, url: `https://example.com/${id}`, description: '',
      published: true, version: 0, directoryControl: 'editorial',
    });
  }
  const submitted = await api(harness, '/api/creador/reclamaciones', 'creator-a', {
    method: 'POST', body: { resourceIds: ['partial-order-a', 'partial-order-b'] },
  });
  assert.equal(submitted.status, 202);
  const profileBefore = (await editor(harness)).profile;

  const response = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', resourceIds: ['partial-order-a', 'partial-order-b'] },
  });
  assert.equal(response.status, 409);
  const body = await responseJson(response);
  assert.equal(body.error, 'PLACEMENT_ORDER_EXHAUSTED');
  assert.deepEqual(body.linkedResourceIds, ['partial-order-a']);
  assert.deepEqual(body.versionChanges, [
    { entity: 'profile', id: profileBefore.id, before: profileBefore.version, after: profileBefore.version + 1 },
    { entity: 'resource', id: 'partial-order-a', before: 0, after: 1 },
    { entity: 'placement', id: (await harness.store.list(`placement:${profileBefore.id}:`))
      .find(({ value }) => value.resourceId === 'partial-order-a').value.id,
    before: 0, after: profileBefore.version + 1 },
  ]);

  const profileAfter = await harness.store.get(`profile:${profileBefore.id}`);
  assert.equal(profileAfter.version, profileBefore.version + 1);
  const linked = await harness.store.get('resource:partial-order-a');
  const untouched = await harness.store.get('resource:partial-order-b');
  assert.equal(linked.editorProfileId, profileBefore.id);
  assert.equal(linked.directoryControl, 'creator');
  assert.equal(untouched.directoryControl, 'editorial');
  assert.equal(untouched.editorProfileId, undefined);
  assert.equal(await harness.store.get(`editor:${profileBefore.id}:partial-order-b`), null);
  const placements = await harness.store.list(`placement:${profileBefore.id}:`);
  assert.equal(placements.length, 2);
  assert.ok(placements.every(({ value }) => Number.isSafeInteger(value.position)));
  assert.equal(placements.find(({ value }) => value.resourceId === 'partial-order-a').value.position, MAX_POSITION);
  const claims = await harness.store.list('claim:');
  assert.equal(claims[0].value.status, 'pending');

  const readable = await expectPublishedProfileAndSeriesReadable(harness, 'partial-order');
  assert.equal(readable.editor.links.find(({ placementId }) => placementId === first.placementId).position, MAX_POSITION - 10);
  assert.equal(readable.editor.links.find(({ resourceId }) => resourceId === 'partial-order-a').position, MAX_POSITION);
});

test('the safe boundary append succeeds, and duplicate URL, re-add, and claim requests stay idempotent at full order', async () => {
  const { harness, first } = await fullPositionFixture('safe-order', MAX_POSITION - 10);
  const appended = await addNewLink(harness, 'https://example.com/safe-order-second', 'Límite válido');
  assert.equal(appended.status, 201);
  const second = (await responseJson(appended)).link;
  assert.equal(second.position, MAX_POSITION);
  await expectPublishedProfileAndSeriesReadable(harness, 'safe-order');

  const claim = await api(harness, '/api/creador/reclamaciones', 'creator-a', {
    method: 'POST', body: { resourceIds: [second.resourceId] },
  });
  assert.equal(claim.status, 202);
  const linkedClaim = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', resourceIds: [second.resourceId] },
  });
  assert.equal(linkedClaim.status, 200);

  const profileId = (await editor(harness)).profile.id;
  const before = await snapshot(harness, profileId);
  const writesBefore = transactionCount(harness);
  const duplicateUrl = await addNewLink(harness, 'https://example.com/safe-order-second', 'Límite válido');
  assert.equal(duplicateUrl.status, 200);
  assert.equal((await responseJson(duplicateUrl)).link.position, MAX_POSITION);
  const duplicateReadd = await api(harness, '/api/creador/enlaces', 'creator-a', {
    method: 'POST', body: { resourceId: second.resourceId, resourceVersion: second.resourceVersion },
  });
  assert.equal(duplicateReadd.status, 200);
  assert.equal((await responseJson(duplicateReadd)).link.position, MAX_POSITION);
  const duplicateClaim = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', resourceIds: [second.resourceId] },
  });
  assert.equal(duplicateClaim.status, 200);
  const claimBody = await responseJson(duplicateClaim);
  assert.deepEqual(claimBody.linkedResourceIds, [second.resourceId]);
  assert.deepEqual(claimBody.versionChanges, []);
  assert.deepEqual(await snapshot(harness, profileId), before);
  assert.equal(transactionCount(harness), writesBefore);
  assert.ok(first.position < second.position);
});

test('moving an exhausted placement back into range lets a normal append retry succeed', async () => {
  const { harness, first } = await fullPositionFixture('retry-order');
  const profileId = (await editor(harness)).profile.id;
  const beforeRejectedAdd = await snapshot(harness, profileId);
  const writesBeforeRejectedAdd = transactionCount(harness);
  await expectOrderExhausted(await addNewLink(harness, 'https://example.com/retry-order-second'));
  assert.deepEqual(await snapshot(harness, profileId), beforeRejectedAdd);
  assert.equal(transactionCount(harness), writesBeforeRejectedAdd);

  const repositioned = await setPosition(harness, first, 0);
  assert.equal(repositioned.position, 0);
  const retry = await addNewLink(harness, 'https://example.com/retry-order-second', 'Reintento válido');
  assert.equal(retry.status, 201);
  const retriedLink = (await responseJson(retry)).link;
  assert.equal(retriedLink.position, 10);
  const page = await expectPublishedProfileAndSeriesReadable(harness, 'retry-order');
  assert.ok(page.editor.links.some(({ resourceId }) => resourceId === retriedLink.resourceId));
});

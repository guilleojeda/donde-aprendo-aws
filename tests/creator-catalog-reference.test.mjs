import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  readAdminRecord,
  responseJson,
  seedResource,
  sessionCsrf,
  SITE_ORIGIN,
} from './fixtures/creator-pages.mjs';
import {
  currentUrlCollision,
  currentUrlKey,
} from '../src/lib/catalog-url.mjs';

const endpoint = '/api/creador/referencias';

async function api(harness, path, {
  session = 'creator-a', method = 'GET', body, origin = SITE_ORIGIN,
  csrf = sessionCsrf[session], creatorContract = '2',
} = {}) {
  return callApi(harness, path, { session, method, body, origin, csrf, creatorContract });
}

async function owner(harness, session = 'creator-a') {
  const response = await api(harness, '/api/creador/perfil', { session });
  assert.equal(response.status, 200, await response.clone().text());
  const snapshot = await responseJson(response);
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(Object.hasOwn(snapshot, 'links'), false);
  return snapshot;
}

async function createProfile(harness, { session = 'creator-a', slug = 'ana-referencias' } = {}) {
  const before = await owner(harness, session);
  const response = await api(harness, '/api/creador/perfil', {
    session,
    method: 'PUT',
    body: {
      creatorVersion: before.profile ? before.creatorVersion : null,
      displayName: 'Ana Referencias',
      slug,
      programs: [],
      socials: {},
    },
  });
  assert.equal(response.status, 200, 'the fixture creates the profile through the real service API');
  const ack = await responseJson(response);
  assert.equal(ack.schemaVersion, 2);
  assert.equal(ack.operation, 'save-profile');
  return owner(harness, session);
}

async function publishProfile(harness, session = 'creator-a') {
  const before = await owner(harness, session);
  const response = await api(harness, '/api/creador/perfil/publicar', {
    session,
    method: 'POST',
    body: { creatorVersion: before.creatorVersion },
  });
  assert.equal(response.status, 200, await response.clone().text());
  const ack = await responseJson(response);
  assert.equal(ack.operation, 'publish-profile');
  return owner(harness, session);
}

function resource(id, url, fields = {}) {
  return {
    id,
    title: `Ficha ${id}`,
    url,
    description: `Descripción ${id}`,
    category: 'Otros',
    order: 1,
    featured: false,
    kind: 'content',
    format: 'Artículo',
    topics: [],
    published: true,
    hidden: false,
    approvalRevoked: false,
    directoryControl: 'editorial',
    version: 4,
    ...fields,
  };
}

function eventResource(id, registrationUrl) {
  return {
    recordType: 'event',
    id,
    title: `Evento ${id}`,
    description: `Descripción ${id}`,
    startsAt: '2099-04-01T12:00:00.000Z',
    endsAt: '2099-04-01T13:00:00.000Z',
    timeZone: 'UTC',
    organizer: 'Comunidad pública',
    mode: 'online',
    registrationUrl,
    published: true,
    hidden: false,
    approvalRevoked: false,
    directoryControl: 'editorial',
    version: 4,
  };
}

function transactionCallsSince(store, offset) {
  return store.calls.slice(offset)
    .filter(({ operation }) => operation === 'transact')
    .map(({ input }) => input);
}

function writesSince(store, offset) {
  return transactionCallsSince(store, offset)
    .filter(({ puts = [], deletes = [] }) => puts.length > 0 || deletes.length > 0);
}

function assertPrivateJson(response) {
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

async function ownerLinkWriteState(harness, profileId, urls = []) {
  const { store } = harness;
  return {
    profile: await store.get(`profile:${profileId}`),
    resources: await store.list('resource:'),
    reservations: await Promise.all(urls.map((url) => store.get(currentUrlKey(url)))),
    editorReferences: await store.list(`editor:${profileId}:`),
  };
}

async function addByUrl(harness, session, { title, url }) {
  const current = await owner(harness, session);
  const response = await api(harness, '/api/creador/enlaces', {
    session,
    method: 'POST',
    body: { creatorVersion: current.creatorVersion, title, url },
  });
  assert.equal(response.status, 201, await response.clone().text());
  const ack = await responseJson(response);
  assert.equal(ack.schemaVersion, 2);
  assert.equal(ack.operation, 'add-link');
  return ack;
}

async function reference(harness, { session = 'creator-a', resourceId, url, creatorVersion, selectedForDirectory } = {}) {
  const response = await api(harness, endpoint, {
    session,
    method: 'POST',
    body: {
      ...(creatorVersion === undefined ? {} : { creatorVersion }),
      ...(resourceId === undefined ? {} : { resourceId }),
      ...(url === undefined ? {} : { url }),
      ...(selectedForDirectory === undefined ? {} : { selectedForDirectory }),
    },
  });
  return response;
}

function assertReferenceAck(ack, { profileId, disposition, resourceId, creatorVersion } = {}) {
  assert.equal(ack.schemaVersion, 2);
  assert.equal(ack.operation, 'reference-link');
  assert.equal(ack.profileId, profileId);
  assert.equal(ack.resourceId, resourceId);
  assert.equal(ack.disposition, disposition);
  assert.ok(Number.isSafeInteger(ack.creatorVersion));
  if (creatorVersion !== undefined) assert.equal(ack.creatorVersion, creatorVersion);
  assert.equal(Object.hasOwn(ack, 'versionChanges'), false);
  assert.equal(Object.hasOwn(ack, 'link'), false);
  return ack;
}

test('ID plus literal URL adds an existing catalog resource without gaining editing rights; replay is an unchanged acknowledgement', async () => {
  const harness = await createCreatorPagesHarness();
  const before = await createProfile(harness);
  const selected = resource('catalog-reference-happy', 'https://catalog.example/referencia-exacta', {
    submitterEmail: 'private-email-sentinel@example.test', evidence: 'private-evidence-sentinel',
  });
  await seedResource(harness.store, selected);
  const reservationKey = currentUrlKey(selected.url);
  const resourceBefore = await harness.store.get(`resource:${selected.id}`);
  const reservationBefore = await harness.store.get(reservationKey);
  const writesBefore = harness.store.calls.length;

  const response = await reference(harness, {
    resourceId: selected.id, url: selected.url, creatorVersion: before.creatorVersion,
  });
  assert.equal(response.status, 201);
  assertPrivateJson(response);
  const result = assertReferenceAck(await responseJson(response), {
    profileId: before.profile.id,
    disposition: 'attached',
    resourceId: selected.id,
    creatorVersion: before.creatorVersion + 1,
  });
  assert.ok(typeof result.placementId === 'string' && result.placementId);
  assert.equal(result.resourceVersion, resourceBefore.version);
  assert.equal(await harness.store.get(`editor:${before.profile.id}:${selected.id}`), null,
    'referencing editorial content does not grant resource editing rights');
  assert.deepEqual(await harness.store.get(`resource:${selected.id}`), resourceBefore,
    'the selected catalog record remains unchanged');
  assert.deepEqual(await harness.store.get(reservationKey), reservationBefore,
    'the URL reservation remains unchanged');
  assert.doesNotMatch(JSON.stringify(result), /private-email-sentinel|private-evidence-sentinel/u);

  const writes = writesSince(harness.store, writesBefore);
  assert.equal(writes.length, 1, 'one aggregate write attaches the resource');
  assert.deepEqual(writes[0].puts.map(({ key }) => key), [`profile:${before.profile.id}`]);
  const checks = writes[0].checks.map(({ key }) => key);
  assert.ok(checks.includes(`profile:${before.profile.id}`));
  assert.ok(checks.includes(`resource:${selected.id}`));
  assert.ok(checks.includes(reservationKey));

  const afterCreate = await owner(harness);
  assert.equal(afterCreate.creatorVersion, result.creatorVersion);
  assert.deepEqual(afterCreate.placements[result.placementId], {
    resourceId: selected.id,
    selectedForDirectory: true,
  }, 'a new reference defaults to directory selection without changing editorial approval');
  assert.deepEqual(afterCreate.order, { featured: [], ordinary: [result.placementId] });
  assert.equal(afterCreate.resources.length, 1);
  assert.equal(afterCreate.resources[0].id, selected.id);
  assert.equal(afterCreate.resources[0].metadataEditable, false);
  assert.equal(afterCreate.resources[0].reincludeAllowed, false);

  const replayOffset = harness.store.calls.length;
  const replayResponse = await reference(harness, {
    resourceId: selected.id, url: selected.url, creatorVersion: afterCreate.creatorVersion,
  });
  assert.equal(replayResponse.status, 200);
  assertPrivateJson(replayResponse);
  const replay = assertReferenceAck(await responseJson(replayResponse), {
    profileId: before.profile.id,
    disposition: 'already-present',
    resourceId: selected.id,
    creatorVersion: afterCreate.creatorVersion,
  });
  assert.equal(replay.placementId, result.placementId);
  assert.deepEqual(await owner(harness), afterCreate);
  assert.equal(writesSince(harness.store, replayOffset).length, 0,
    'an idempotent reference replay confirms current state without writing');
  assert.doesNotMatch(JSON.stringify(replay), /private-email-sentinel|private-evidence-sentinel/u);
});

test('event references use registrationUrl and retain the explicit directory choice', async () => {
  const harness = await createCreatorPagesHarness();
  const before = await createProfile(harness);
  const selected = eventResource('catalog-reference-event', 'https://catalog.example/event-registration');
  await seedResource(harness.store, selected);
  const reservationKey = currentUrlKey(selected.registrationUrl);
  const resourceBefore = await harness.store.get(`resource:${selected.id}`);
  const reservationBefore = await harness.store.get(reservationKey);

  const response = await reference(harness, {
    resourceId: selected.id,
    url: selected.registrationUrl,
    creatorVersion: before.creatorVersion,
    selectedForDirectory: false,
  });
  assert.equal(response.status, 201);
  assertPrivateJson(response);
  const result = assertReferenceAck(await responseJson(response), {
    profileId: before.profile.id,
    disposition: 'attached',
    resourceId: selected.id,
  });
  assert.equal(result.resourceVersion, resourceBefore.version);
  const after = await owner(harness);
  assert.equal(after.resources[0].url, selected.registrationUrl);
  assert.equal(after.placements[result.placementId].selectedForDirectory, false);
  assert.deepEqual(await harness.store.get(`resource:${selected.id}`), resourceBefore);
  assert.deepEqual(await harness.store.get(reservationKey), reservationBefore);
  assert.equal(await harness.store.get(`editor:${before.profile.id}:${selected.id}`), null);
});

test('a resource controlled by another creator can be referenced but never edited by the referencing profile', async () => {
  const harness = await createCreatorPagesHarness();
  const ownerB = await createProfile(harness, { session: 'creator-b', slug: 'bea-referencias' });
  await publishProfile(harness, 'creator-b');
  const submitted = await addByUrl(harness, 'creator-b', {
    title: 'Recurso de Bea', url: 'https://catalog.example/owned-by-bea',
  });
  const classified = await api(harness, `/api/admin/recursos/${submitted.resourceId}`, {
    session: 'admin', method: 'PATCH',
    body: {
      category: 'Otros', kind: 'content', format: 'Artículo', topics: [], version: submitted.resourceVersion,
    },
    creatorContract: undefined,
  });
  assert.equal(classified.status, 200);
  const resourceVersion = (await readAdminRecord(harness, 'resource', submitted.resourceId)).version;
  const approved = await api(harness, `/api/admin/recursos/${submitted.resourceId}/aprobar`, {
    session: 'admin', method: 'POST', body: { version: resourceVersion }, creatorContract: undefined,
  });
  assert.equal(approved.status, 200);
  const publicOwnerPage = await harness.service.readPublicProfile(ownerB.profile.slug);
  assert.equal(publicOwnerPage.status, 200);
  assert.ok(publicOwnerPage.links.some(({ resourceId }) => resourceId === submitted.resourceId));

  const creatorA = await createProfile(harness);
  const response = await reference(harness, {
    resourceId: submitted.resourceId,
    url: 'https://catalog.example/owned-by-bea',
    creatorVersion: creatorA.creatorVersion,
  });
  assert.equal(response.status, 201);
  assertPrivateJson(response);
  const ack = assertReferenceAck(await responseJson(response), {
    profileId: creatorA.profile.id,
    disposition: 'attached',
    resourceId: submitted.resourceId,
  });
  assert.equal(await harness.store.get(`editor:${creatorA.profile.id}:${submitted.resourceId}`), null);
  assert.ok(await harness.store.get(`editor:${ownerB.profile.id}:${submitted.resourceId}`));
  const creatorSnapshot = await owner(harness);
  assert.equal(creatorSnapshot.resources.find(({ id }) => id === submitted.resourceId).metadataEditable, false);

  const beforeAttempt = await harness.store.get(`resource:${submitted.resourceId}`);
  const unauthorizedEdit = await api(harness, `/api/creador/recursos/?id=${encodeURIComponent(submitted.resourceId)}`, {
    method: 'PATCH', body: { title: 'Cambio no autorizado', resourceVersion: beforeAttempt.version },
  });
  assert.equal(unauthorizedEdit.status, 403);
  assertPrivateJson(unauthorizedEdit);
  assert.deepEqual(await harness.store.get(`resource:${submitted.resourceId}`), beforeAttempt);
  assert.ok(ack.placementId);
});

test('an already-present reference preserves selection, sequence, chapters, hidden state, and history', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const selected = resource('catalog-reference-existing', 'https://catalog.example/existing', {
    sourceId: 'private-source-reference',
  });
  await seedResource(harness.store, selected);
  const created = await addByUrl(harness, 'creator-a', { title: 'Referencia ya agregada', url: selected.url });
  let current = await owner(harness);
  const configured = await api(harness, `/api/creador/enlaces/${created.placementId}`, {
    method: 'PATCH', body: {
      creatorVersion: current.creatorVersion,
      featured: true,
      selectedForDirectory: false,
    },
  });
  assert.equal(configured.status, 200);
  current = await owner(harness);
  const seriesResponse = await api(harness, '/api/creador/series', {
    method: 'POST', body: {
      creatorVersion: current.creatorVersion,
      name: 'Serie existente', slug: 'serie-existente',
    },
  });
  assert.equal(seriesResponse.status, 201);
  const seriesAck = await responseJson(seriesResponse);
  assert.equal(seriesAck.operation, 'create-series');
  current = await owner(harness);
  const addedChapter = await api(harness,
    `/api/creador/series/${seriesAck.seriesId}/capitulos/${created.placementId}`,
    { method: 'PUT', body: { creatorVersion: current.creatorVersion } });
  assert.equal(addedChapter.status, 200);
  current = await owner(harness);
  const resourceVersion = current.resources[0].version;
  const hidden = await api(harness, `/api/admin/recursos/${selected.id}/ocultar`, {
    session: 'admin', method: 'POST', body: { version: resourceVersion }, creatorContract: undefined,
  });
  assert.equal(hidden.status, 200);

  const before = await owner(harness);
  const resourceBefore = await harness.store.get(`resource:${selected.id}`);
  const callsBefore = harness.store.calls.length;
  const response = await reference(harness, {
    resourceId: selected.id,
    url: selected.url,
    creatorVersion: before.creatorVersion,
    selectedForDirectory: true,
  });
  assert.equal(response.status, 200);
  assertPrivateJson(response);
  const ack = assertReferenceAck(await responseJson(response), {
    profileId: before.profile.id,
    disposition: 'already-present',
    resourceId: selected.id,
    creatorVersion: before.creatorVersion,
  });
  assert.equal(ack.placementId, created.placementId);
  assert.deepEqual(await owner(harness), before,
    'the existing placement keeps its current choices and chapter membership');
  assert.equal((await harness.store.get(`resource:${selected.id}`)).hidden, true);
  assert.deepEqual((await harness.store.get(`resource:${selected.id}`)).sourceId, 'private-source-reference');
  const noOpTransactions = transactionCallsSince(harness.store, callsBefore);
  assert.ok(noOpTransactions.some(({ puts }) => puts.length === 0),
    'the already-present path confirms current observations');
  assert.equal(writesSince(harness.store, callsBefore).length, 0,
    'the existing reference does not write or increment content');
  assert.deepEqual(await harness.store.get(`resource:${selected.id}`), resourceBefore);
});

test('a stale resource ID and URL pair conflicts without revealing the current URL or creating a placement', async () => {
  const harness = await createCreatorPagesHarness();
  const initial = await createProfile(harness);
  const oldUrl = 'https://catalog.example/old-address';
  const currentUrl = 'https://catalog.example/current-address';
  const selected = resource('catalog-reference-stale', currentUrl);
  await seedResource(harness.store, selected);

  let stateBefore = await ownerLinkWriteState(harness, initial.profile.id, [oldUrl, currentUrl]);
  let response = await reference(harness, {
    resourceId: selected.id, url: `  ${currentUrl}  `, creatorVersion: initial.creatorVersion,
  });
  assert.equal(response.status, 422, 'selected catalog ID and URL pairs retain literal URL identity');
  assert.equal((await response.json()).error, 'INVALID_URL');
  assert.deepEqual(await ownerLinkWriteState(harness, initial.profile.id, [oldUrl, currentUrl]), stateBefore);

  response = await reference(harness, {
    resourceId: selected.id, url: oldUrl, creatorVersion: initial.creatorVersion,
  });
  assert.equal(response.status, 409, 'a stale pair is rejected before a placement exists');
  assertPrivateJson(response);
  let error = await response.json();
  assert.deepEqual(Object.keys(error).sort(), ['error', 'message']);
  assert.doesNotMatch(JSON.stringify(error), /current-address/u);
  assert.deepEqual(await ownerLinkWriteState(harness, initial.profile.id, [oldUrl, currentUrl]), stateBefore);

  const added = await addByUrl(harness, 'creator-a', { title: 'Referencia actual', url: currentUrl });
  assert.equal(added.disposition, 'resource-reused');
  const afterAdd = await owner(harness);
  stateBefore = await ownerLinkWriteState(harness, initial.profile.id, [oldUrl, currentUrl]);
  response = await reference(harness, {
    resourceId: selected.id, url: oldUrl, creatorVersion: afterAdd.creatorVersion,
  });
  assert.equal(response.status, 409);
  assertPrivateJson(response);
  error = await response.json();
  assert.deepEqual(Object.keys(error).sort(), ['error', 'message']);
  assert.equal(JSON.stringify(error).includes(currentUrl), false);
  assert.deepEqual(await ownerLinkWriteState(harness, initial.profile.id, [oldUrl, currentUrl]), stateBefore,
    'the stale pair cannot create a second placement');
  assert.equal(Object.keys((await owner(harness)).placements).length, 1);
});

test('a real URL edit between reference admission and commit rejects the stale pair without returning the winner URL', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const requestedUrl = 'https://catalog.example/race-selected';
  const movedUrl = 'https://catalog.example/race-current';
  const created = await addByUrl(harness, 'creator-a', { title: 'Retained owner resource', url: requestedUrl });
  let current = await owner(harness);
  const removed = await api(harness, `/api/creador/enlaces/${created.placementId}`, {
    method: 'DELETE', body: { creatorVersion: current.creatorVersion },
  });
  assert.equal(removed.status, 200);
  current = await owner(harness);
  const selected = current.resources.find(({ id }) => id === created.resourceId);
  assert.equal(selected.reincludeAllowed, true);

  const rawTransact = harness.store.transact.bind(harness.store);
  let raced = false;
  let moveAck;
  harness.store.transact = async (transaction) => {
    const candidate = transaction.puts.find(({ key, value }) => key === `profile:${current.profile.id}`
      && value.schemaVersion === 2
      && Object.keys(value.placements).length > Object.keys(current.placements).length);
    if (!raced && candidate) {
      raced = true;
      const moved = await api(harness, `/api/creador/recursos/?id=${encodeURIComponent(created.resourceId)}`, {
        method: 'PATCH', body: { resourceVersion: selected.version, url: movedUrl },
      });
      assert.equal(moved.status, 200, await moved.clone().text());
      moveAck = await responseJson(moved);
      assert.equal(moveAck.operation, 'edit-resource');
      assert.equal(Object.hasOwn(moveAck, 'creatorVersion'), false);
    }
    return rawTransact(transaction);
  };

  const before = await ownerLinkWriteState(harness, current.profile.id, [requestedUrl, movedUrl]);
  const response = await reference(harness, {
    resourceId: created.resourceId,
    url: requestedUrl,
    creatorVersion: current.creatorVersion,
  });
  assert.equal(raced, true, 'the real resource move runs after reference admission and before its conditional commit');
  assert.equal(response.status, 409);
  assertPrivateJson(response);
  const error = await response.json();
  assert.equal(error.error, 'RESOURCE_CONFLICT', 'a selected resource URL move requires a refresh');
  assert.deepEqual(Object.keys(error).sort(), ['error', 'message']);
  assert.doesNotMatch(JSON.stringify(error), /race-current/u,
    'the failed selection does not disclose a URL outside the submitted pair');
  const after = await ownerLinkWriteState(harness, current.profile.id, [requestedUrl, movedUrl]);
  assert.deepEqual(after.profile.placements, before.profile.placements,
    'the stale reference adds no placement after the resource moves');
  assert.deepEqual(after.profile.order, before.profile.order,
    'the rejected reference leaves both order groups unchanged');
  assert.equal(after.resources.find(({ value }) => value.id === created.resourceId).value.url, movedUrl);
  assert.deepEqual(after.reservations, [null, await harness.store.get(currentUrlKey(movedUrl))]);
  assert.equal(moveAck.resourceVersion, selected.version + 1);
});

test('a real URL edit between resource and reservation reads requires reselection and the current pair succeeds', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const requestedUrl = 'https://catalog.example/read-gap-selected';
  const movedUrl = 'https://catalog.example/read-gap-current';
  const created = await addByUrl(harness, 'creator-a', { title: 'Recurso editable', url: requestedUrl });
  let current = await owner(harness);
  const removed = await api(harness, `/api/creador/enlaces/${created.placementId}`, {
    method: 'DELETE', body: { creatorVersion: current.creatorVersion },
  });
  assert.equal(removed.status, 200);
  current = await owner(harness);
  const selected = current.resources.find(({ id }) => id === created.resourceId);
  assert.equal(selected.reincludeAllowed, true);

  const before = await ownerLinkWriteState(harness, current.profile.id, [requestedUrl, movedUrl]);
  const callsBefore = harness.store.calls.length;
  const rawGet = harness.store.get.bind(harness.store);
  let raced = false;
  let moveAck;
  harness.store.get = async (key) => {
    const observed = await rawGet(key);
    if (!raced && key === `resource:${created.resourceId}`) {
      raced = true;
      const moved = await api(harness, `/api/creador/recursos/?id=${encodeURIComponent(created.resourceId)}`, {
        method: 'PATCH', body: { resourceVersion: selected.version, url: movedUrl },
      });
      assert.equal(moved.status, 200, await moved.clone().text());
      moveAck = await responseJson(moved);
      assert.equal(moveAck.operation, 'edit-resource');
    }
    return observed;
  };

  let stale;
  try {
    stale = await reference(harness, {
      resourceId: created.resourceId, url: requestedUrl, creatorVersion: current.creatorVersion,
    });
  } finally {
    harness.store.get = rawGet;
  }

  assert.equal(raced, true, 'the actual edit commits after the selected resource read and before its reservation read');
  assert.equal(stale.status, 409);
  assertPrivateJson(stale);
  const staleBody = await stale.json();
  assert.equal(staleBody.error, 'RESOURCE_CONFLICT');
  assert.deepEqual(Object.keys(staleBody).sort(), ['error', 'message']);
  assert.doesNotMatch(JSON.stringify(staleBody), /read-gap-current/u);
  assert.equal(moveAck.resourceVersion, selected.version + 1);
  const afterStale = await ownerLinkWriteState(harness, current.profile.id, [requestedUrl, movedUrl]);
  assert.deepEqual(afterStale.profile.placements, before.profile.placements,
    'the failed stale selection creates no placement');
  assert.deepEqual(afterStale.profile.order, before.profile.order);
  assert.equal(afterStale.resources.find(({ value }) => value.id === created.resourceId).value.url, movedUrl);
  assert.deepEqual(afterStale.reservations, [null, await harness.store.get(currentUrlKey(movedUrl))]);
  const serviceWrites = harness.store.calls.slice(callsBefore)
    .filter(({ operation, input }) => operation === 'transact'
      && input.puts.some(({ key }) => key === `profile:${current.profile.id}`));
  assert.deepEqual(serviceWrites, [], 'the stale pair is rejected before a placement transaction is attempted');

  const currentSnapshot = await owner(harness);
  const selectedCurrent = currentSnapshot.resources.find(({ id }) => id === created.resourceId);
  assert.equal(selectedCurrent.url, movedUrl);
  const reselected = await reference(harness, {
    resourceId: created.resourceId, url: selectedCurrent.url, creatorVersion: currentSnapshot.creatorVersion,
  });
  assert.equal(reselected.status, 201, await reselected.clone().text());
  const reselectedAck = await responseJson(reselected);
  assert.equal(reselectedAck.disposition, 'attached');
  assert.equal(reselectedAck.resourceId, created.resourceId);
  const final = await owner(harness);
  assert.equal(Object.values(final.placements).filter(({ resourceId }) => resourceId === created.resourceId).length, 1);
  assert.equal(final.order.ordinary.length, 1);
});

async function rejectReferenceWithoutWrite({ name, expectedStatuses, expectedError, request, prepare, resourceCount = 1 }) {
  const harness = await createCreatorPagesHarness();
  const current = await createProfile(harness);
  const selected = resource(`catalog-reference-reject-${name}`, `https://catalog.example/reject-${name}`);
  await seedResource(harness.store, selected);
  if (prepare) await prepare(harness, selected);
  const body = request(current, selected);
  const stateBefore = await ownerLinkWriteState(harness, current.profile.id, [selected.url]);

  const response = await api(harness, endpoint, { method: 'POST', body });
  assert.ok(expectedStatuses.includes(response.status), `expected ${expectedStatuses.join(' or ')}, got ${response.status}`);
  assertPrivateJson(response);
  const error = await response.json();
  assert.deepEqual(Object.keys(error).sort(), ['error', 'message']);
  if (expectedError) assert.equal(error.error, expectedError);
  assert.deepEqual(await ownerLinkWriteState(harness, current.profile.id, [selected.url]), stateBefore,
    'rejected input does not change the aggregate, placement, editor reference, resource, or reservation');
  assert.equal((await harness.store.list('resource:')).length, resourceCount,
    'a failed ID reference never falls back to creating a new catalog resource');
  assert.deepEqual(await harness.store.list(`editor:${current.profile.id}:`), []);
  assert.deepEqual((await owner(harness)).placements, {});
}

const rejectedReferenceCases = [
  {
    name: 'id-without-url', expectedStatuses: [400, 422],
    request: (current, selected) => ({ creatorVersion: current.creatorVersion, resourceId: selected.id }),
  },
  {
    name: 'wrong-id', expectedStatuses: [404, 409, 422],
    request: (current, selected) => ({ creatorVersion: current.creatorVersion, resourceId: 'catalog-reference-not-selected', url: selected.url }),
  },
  {
    name: 'reservation-id', expectedStatuses: [404, 422],
    request: (current, selected) => ({ creatorVersion: current.creatorVersion, resourceId: currentUrlKey(selected.url), url: selected.url }),
  },
  {
    name: 'missing-reservation', expectedStatuses: [503], expectedError: 'URL_INDEX_MISMATCH',
    prepare: async (harness, selected) => {
      const key = currentUrlKey(selected.url);
      const reservation = await harness.store.get(key);
      assert.equal(await harness.store.transact({ checks: [{ key, version: reservation.version }], deletes: [key] }), true);
    },
    request: (current, selected) => ({ creatorVersion: current.creatorVersion, resourceId: selected.id, url: selected.url }),
  },
  {
    name: 'inconsistent-reservation', expectedStatuses: [503], expectedError: 'URL_INDEX_MISMATCH',
    prepare: async (harness, selected) => {
      const key = currentUrlKey(selected.url);
      const reservation = await harness.store.get(key);
      assert.equal(await harness.store.transact({
        checks: [{ key, version: reservation.version }],
        puts: [{ key, value: { ...reservation, resourceId: 'catalog-reference-other-resource', version: reservation.version + 1 } }],
      }), true);
    },
    request: (current, selected) => ({ creatorVersion: current.creatorVersion, resourceId: selected.id, url: selected.url }),
  },
  {
    name: 'collision-reservation', expectedStatuses: [409], expectedError: 'URL_COLLISION', resourceCount: 2,
    prepare: async (harness, selected) => {
      const key = currentUrlKey(selected.url);
      const reservation = await harness.store.get(key);
      const colliding = resource('catalog-reference-colliding-row', selected.url);
      assert.equal(await harness.store.transact({
        checks: [
          { key: `resource:${colliding.id}`, version: null },
          { key, version: reservation.version },
        ],
        puts: [
          { key: `resource:${colliding.id}`, value: colliding },
          { key, value: { ...currentUrlCollision(selected.url, [selected.id, colliding.id]), version: reservation.version + 1 } },
        ],
      }), true);
    },
    request: (current, selected) => ({ creatorVersion: current.creatorVersion, resourceId: selected.id, url: selected.url }),
  },
  {
    name: 'unsafe-url', expectedStatuses: [400, 422],
    request: (current, selected) => ({ creatorVersion: current.creatorVersion, resourceId: selected.id, url: 'javascript:alert(1)' }),
  },
  {
    name: 'non-boolean-selection', expectedStatuses: [400, 422],
    request: (current, selected) => ({ creatorVersion: current.creatorVersion, resourceId: selected.id, url: selected.url, selectedForDirectory: 'yes' }),
  },
];

for (const scenario of rejectedReferenceCases) {
  test(`rejects ${scenario.name} before writing or creating a resource`, async () => rejectReferenceWithoutWrite(scenario));
}

test('a stale creator revision is rejected for both new and already-present reference targets', async () => {
  const harness = await createCreatorPagesHarness();
  const initial = await createProfile(harness);
  const newRecord = resource('catalog-reference-new-stale-profile', 'https://catalog.example/new-stale-profile');
  const existingRecord = resource('catalog-reference-existing-stale-profile', 'https://catalog.example/existing-stale-profile');
  await seedResource(harness.store, newRecord);
  await seedResource(harness.store, existingRecord);

  let stateBefore = await ownerLinkWriteState(harness, initial.profile.id, [newRecord.url, existingRecord.url]);
  let response = await reference(harness, {
    resourceId: newRecord.id, url: newRecord.url, creatorVersion: initial.creatorVersion - 1,
  });
  assert.equal(response.status, 409);
  assertPrivateJson(response);
  assert.deepEqual(await ownerLinkWriteState(harness, initial.profile.id, [newRecord.url, existingRecord.url]), stateBefore);

  const attached = await addByUrl(harness, 'creator-a', { title: 'Colocación conocida', url: existingRecord.url });
  assert.equal(attached.disposition, 'resource-reused');
  const current = await owner(harness);
  stateBefore = await ownerLinkWriteState(harness, initial.profile.id, [newRecord.url, existingRecord.url]);
  response = await reference(harness, {
    resourceId: existingRecord.id, url: existingRecord.url, creatorVersion: initial.creatorVersion,
  });
  assert.equal(response.status, 409, 'an existing placement does not bypass creator-version validation');
  assertPrivateJson(response);
  assert.deepEqual(await ownerLinkWriteState(harness, initial.profile.id, [newRecord.url, existingRecord.url]), stateBefore);
  assert.equal(Object.keys(current.placements).length, 1);
});

for (const raceField of ['resource', 'reservation', 'profile']) {
  test(`conditional CAS rejects a concurrent ${raceField} change before creating a reference`, async () => {
    const harness = await createCreatorPagesHarness();
    const current = await createProfile(harness);
    const selected = resource(`catalog-reference-race-${raceField}`, `https://catalog.example/race-${raceField}`);
    await seedResource(harness.store, selected);
    const stateBefore = await ownerLinkWriteState(harness, current.profile.id, [selected.url]);
    const rawTransact = harness.store.transact.bind(harness.store);
    let raced = false;
    harness.store.transact = async (transaction) => {
      const keys = (transaction.checks ?? []).map(({ key }) => key);
      const candidate = transaction.puts?.find(({ key, value }) => key === `profile:${current.profile.id}`
        && value.schemaVersion === 2
        && Object.keys(value.placements).some((id) => value.placements[id].resourceId === selected.id
          && !Object.hasOwn(current.placements, id)));
      if (!raced && candidate && keys.includes(`profile:${current.profile.id}`)
        && keys.includes(`resource:${selected.id}`) && keys.includes(currentUrlKey(selected.url))) {
        raced = true;
        if (raceField === 'resource') {
          const before = await harness.store.get(`resource:${selected.id}`);
          assert.equal(await rawTransact({
            checks: [{ key: `resource:${selected.id}`, version: before.version }],
            puts: [{ key: `resource:${selected.id}`, value: { ...before, title: 'Título cambiado en paralelo', version: before.version + 1 } }],
          }), true);
        } else if (raceField === 'reservation') {
          const key = currentUrlKey(selected.url);
          const before = await harness.store.get(key);
          assert.equal(await rawTransact({
            checks: [{ key, version: before.version }],
            puts: [{ key, value: { ...before, version: before.version + 1 } }],
          }), true);
        } else {
          const before = await harness.store.get(`profile:${current.profile.id}`);
          assert.equal(await rawTransact({
            checks: [{ key: `profile:${current.profile.id}`, version: before.version }],
            puts: [{ key: `profile:${current.profile.id}`, value: {
              ...before,
              displayName: 'Ana cambió en paralelo',
              version: before.version + 1,
              updatedAt: before.updatedAt + 1,
            } }],
          }), true);
        }
      }
      const committed = await rawTransact(transaction);
      if (raceField === 'profile' && raced && candidate && !committed) {
        harness.store.failNext('get', new Error('refresh read unavailable after rejected CAS'));
      }
      return committed;
    };

    const offset = harness.store.calls.length;
    const response = await reference(harness, {
      resourceId: selected.id, url: selected.url, creatorVersion: current.creatorVersion,
    });
    assert.equal(raced, true, 'the reference reached its conditional aggregate transaction');
    assert.equal(response.status, 409);
    assertPrivateJson(response);
    const error = await response.json();
    assert.equal(error.error, 'LINK_CONFLICT',
      'a same-pair update and a creator-only race remain ordinary link conflicts');
    const after = await ownerLinkWriteState(harness, current.profile.id, [selected.url]);
    assert.deepEqual(after.profile.placements, stateBefore.profile.placements);
    assert.deepEqual(after.editorReferences, stateBefore.editorReferences);
    const transaction = transactionCallsSince(harness.store, offset).find(({ puts = [] }) => puts.some(({ key }) => key === `profile:${current.profile.id}`));
    assert.ok(transaction, 'the request attempted the aggregate transaction against its observed state');
    if (raceField === 'resource') {
      assert.deepEqual(after.profile, stateBefore.profile);
      assert.deepEqual(after.reservations, stateBefore.reservations);
      assert.equal(after.resources[0].value.title, 'Título cambiado en paralelo');
      assert.equal(after.resources[0].value.version, stateBefore.resources[0].value.version + 1);
    } else if (raceField === 'reservation') {
      assert.deepEqual(after.profile, stateBefore.profile);
      assert.deepEqual(after.resources, stateBefore.resources);
      assert.equal(after.reservations[0].version, stateBefore.reservations[0].version + 1);
    } else {
      assert.deepEqual(after.resources, stateBefore.resources);
      assert.deepEqual(after.reservations, stateBefore.reservations);
      assert.equal(after.profile.displayName, 'Ana cambió en paralelo');
      assert.equal(after.profile.version, stateBefore.profile.version + 1);
    }
  });
}

test('a storage failure preserves shared resource and claim free reference data without a partial placement', async () => {
  const harness = await createCreatorPagesHarness();
  const current = await createProfile(harness);
  const selected = resource('catalog-reference-storage-failure', 'https://catalog.example/storage-failure');
  await seedResource(harness.store, selected);
  const resourceBefore = await harness.store.get(`resource:${selected.id}`);
  const reservationBefore = await harness.store.get(currentUrlKey(selected.url));
  const offset = harness.store.calls.length;
  const stateBefore = await ownerLinkWriteState(harness, current.profile.id, [selected.url]);
  harness.store.failNext('transact', new Error('simulated storage outage'));

  const response = await reference(harness, {
    resourceId: selected.id, url: selected.url, creatorVersion: current.creatorVersion,
  });
  assert.equal(response.status, 503);
  assertPrivateJson(response);
  assert.deepEqual(await response.json(), {
    error: 'SERVICE_UNAVAILABLE', message: 'service is temporarily unavailable',
  });
  const transactions = transactionCallsSince(harness.store, offset);
  assert.equal(transactions.length, 1, 'the service attempts one aggregate write');
  assert.deepEqual(transactions[0].puts.map(({ key }) => key), [`profile:${current.profile.id}`]);
  assert.deepEqual(await ownerLinkWriteState(harness, current.profile.id, [selected.url]), stateBefore);
  assert.deepEqual(await harness.store.get(`resource:${selected.id}`), resourceBefore);
  assert.deepEqual(await harness.store.get(currentUrlKey(selected.url)), reservationBefore);
  assert.deepEqual((await owner(harness)).placements, {});
  assert.deepEqual(await harness.store.list(`editor:${current.profile.id}:`), []);
});

test('the reference route preserves authentication, origin, CSRF, method, JSON, and contract rejection', async () => {
  const harness = await createCreatorPagesHarness();
  const current = await createProfile(harness);
  const selected = resource('catalog-reference-http', 'https://catalog.example/http');
  await seedResource(harness.store, selected);
  const body = { creatorVersion: current.creatorVersion, resourceId: selected.id, url: selected.url };

  for (const [response, expected] of [
    [await api(harness, endpoint, { session: null, csrf: undefined, method: 'POST', body }), 401],
    [await api(harness, endpoint, { method: 'POST', body, origin: 'https://foreign.example' }), 403],
    [await api(harness, endpoint, { method: 'POST', body, csrf: 'wrong-token' }), 403],
    [await api(harness, endpoint, { method: 'GET' }), 405],
    [await api(harness, endpoint, { method: 'POST', body, creatorContract: '1' }), 409],
  ]) {
    assert.equal(response.status, expected);
    assertPrivateJson(response);
  }

  const malformed = new Request(new URL(endpoint, SITE_ORIGIN), {
    method: 'POST',
    headers: {
      Origin: SITE_ORIGIN,
      'x-test-session': 'creator-a',
      'x-csrf-token': sessionCsrf['creator-a'],
      'x-creator-contract': '2',
      'content-type': 'application/json',
    },
    body: '{',
  });
  const malformedResponse = await harness.service.handle(malformed);
  assert.equal(malformedResponse.status, 400);
  assertPrivateJson(malformedResponse);
});

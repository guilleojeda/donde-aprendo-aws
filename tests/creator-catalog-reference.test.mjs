import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
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
  currentUrlReservationId,
} from '../src/lib/catalog-url.mjs';

const endpoint = '/api/creador/referencias';

async function api(harness, path, {
  session = 'creator-a', method = 'GET', body, origin = SITE_ORIGIN, csrf = sessionCsrf[session],
} = {}) {
  return callApi(harness, path, { session, method, body, origin, csrf });
}

async function createProfile(harness, { session = 'creator-a', slug = 'ana-referencias' } = {}) {
  const response = await api(harness, '/api/creador/perfil', {
    session,
    method: 'PUT',
    body: { displayName: 'Ana Referencias', slug, programs: [], socials: {} },
  });
  assert.equal(response.status, 200, 'the fixture creates the profile through the real service API');
  return (await responseJson(response)).profile;
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

function assertPrivateJson(response) {
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

function writesSince(store, offset) {
  return transactionCallsSince(store, offset)
    .filter(({ puts = [], deletes = [] }) => puts.length > 0 || deletes.length > 0);
}

async function ownerLinkWriteState(harness, profileId, urls = []) {
  const { store } = harness;
  return {
    profile: await store.get(`profile:${profileId}`),
    resources: await store.list('resource:'),
    reservations: await Promise.all(urls.map((url) => store.get(currentUrlKey(url)))),
    placements: await store.list(`placement:${profileId}:`),
    editorReferences: await store.list(`editor:${profileId}:`),
  };
}

function exactLinkKeys(link) {
  return Object.keys(link).sort();
}

const LINK_KEYS = [
  'description', 'directoryApproval', 'featured', 'hidden', 'placementId', 'placementVersion', 'position',
  'resourceId', 'resourceVersion', 'selectedForDirectory', 'series', 'title', 'url',
].sort();

function placementId(profileId, resourceId) {
  const identity = JSON.stringify([profileId, resourceId]);
  return `placement-${createHash('sha256').update(identity, 'utf8').digest('hex')}`;
}

test('referenciar por ID y URL crea sólo la colocación, devuelve recibos y el reintento no duplica', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const selected = resource('catalog-reference-happy', 'https://catalog.example/referencia-exacta', {
    submitterEmail: 'private-email-sentinel@example.test', evidence: 'private-evidence-sentinel',
  });
  await seedResource(harness.store, selected);
  const reservationKey = currentUrlKey(selected.url);
  const resourceBefore = await harness.store.get(`resource:${selected.id}`);
  const reservationBefore = await harness.store.get(reservationKey);
  const writesBefore = harness.store.calls.length;

  const response = await api(harness, endpoint, {
    method: 'POST',
    body: { resourceId: selected.id, url: selected.url, profileVersion: profile.version },
  });
  assert.equal(response.status, 201);
  assertPrivateJson(response);
  const result = await responseJson(response);
  assert.deepEqual(Object.keys(result).sort(), ['created', 'link', 'versionChanges']);
  assert.equal(result.created, true);
  assert.deepEqual(exactLinkKeys(result.link), LINK_KEYS, 'the command returns the current owner link DTO, without catalog records or private fields');
  assert.equal(result.link.resourceId, selected.id);
  assert.equal(result.link.url, selected.url);
  assert.equal(result.link.hidden, false);
  assert.equal(result.link.selectedForDirectory, true, 'new placements default to directory selection');
  assert.deepEqual(result.versionChanges, [
    { entity: 'profile', id: profile.id, before: profile.version, after: profile.version + 1 },
    { entity: 'placement', id: result.link.placementId, before: 0, after: profile.version + 1 },
  ], 'adding a reference returns exact profile and placement versions only');
  assert.equal(await harness.store.get(`editor:${profile.id}:${selected.id}`), null,
    'referencing editorial content does not grant resource editing rights');
  assert.deepEqual(await harness.store.get(`resource:${selected.id}`), resourceBefore,
    'the selected catalog record remains unchanged');
  assert.deepEqual(await harness.store.get(reservationKey), reservationBefore,
    'the URL reservation remains unchanged');
  assert.equal(await harness.store.get(`placement:${profile.id}:${result.link.placementId}`) !== null, true);
  assert.doesNotMatch(JSON.stringify(result), /private-email-sentinel|private-evidence-sentinel/u);

  const creates = transactionCallsSince(harness.store, writesBefore).filter(({ puts }) => puts.length > 0);
  assert.equal(creates.length, 1, 'the profile and placement share one conditional write');
  const createdKeys = creates[0].puts.map(({ key }) => key).sort();
  assert.deepEqual(createdKeys, [
    `placement:${profile.id}:${result.link.placementId}`,
    `profile:${profile.id}`,
  ].sort());
  const checkedKeys = creates[0].checks.map(({ key }) => key);
  assert.ok(checkedKeys.includes(`profile:${profile.id}`));
  assert.ok(checkedKeys.includes(`resource:${selected.id}`));
  assert.ok(checkedKeys.includes(reservationKey));
  assert.ok(creates[0].checks.some(({ key, version }) => key === `placement:${profile.id}:${result.link.placementId}` && version === null));

  const profileAfterCreate = (await harness.store.get(`profile:${profile.id}`));
  const replayOffset = harness.store.calls.length;
  const replay = await api(harness, endpoint, {
    method: 'POST',
    body: { resourceId: selected.id, url: selected.url, profileVersion: profileAfterCreate.version },
  });
  assert.equal(replay.status, 200);
  assertPrivateJson(replay);
  const replayResult = await responseJson(replay);
  assert.deepEqual(Object.keys(replayResult).sort(), ['created', 'link', 'versionChanges']);
  assert.deepEqual(exactLinkKeys(replayResult.link), LINK_KEYS);
  assert.equal(replayResult.created, false);
  assert.equal(replayResult.link.placementId, result.link.placementId);
  assert.deepEqual(replayResult.versionChanges, []);
  assert.equal((await harness.store.list(`placement:${profile.id}:`)).length, 1);
  assert.equal(transactionCallsSince(harness.store, replayOffset).some(({ puts }) => puts.length > 0), false,
    'an idempotent reference retry does not write a second placement or advance a version');
});

test('una referencia de evento usa la URL de inscripción y conserva selección explícita desactivada', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const selected = eventResource('catalog-reference-event', 'https://catalog.example/event-registration');
  await seedResource(harness.store, selected);
  const reservationKey = currentUrlKey(selected.registrationUrl);
  const resourceBefore = await harness.store.get(`resource:${selected.id}`);
  const reservationBefore = await harness.store.get(reservationKey);
  const offset = harness.store.calls.length;

  const response = await api(harness, endpoint, {
    method: 'POST',
    body: {
      resourceId: selected.id,
      url: selected.registrationUrl,
      profileVersion: profile.version,
      selectedForDirectory: false,
    },
  });
  assert.equal(response.status, 201);
  assertPrivateJson(response);
  const result = await responseJson(response);
  assert.equal(result.link.resourceId, selected.id);
  assert.equal(result.link.url, selected.registrationUrl);
  assert.equal(result.link.hidden, false);
  assert.equal(result.link.selectedForDirectory, false);
  assert.equal(result.link.directoryApproval, 'approved');
  assert.deepEqual(exactLinkKeys(result.link), LINK_KEYS);
  assert.deepEqual(result.versionChanges, [
    { entity: 'profile', id: profile.id, before: profile.version, after: profile.version + 1 },
    { entity: 'placement', id: result.link.placementId, before: 0, after: profile.version + 1 },
  ]);
  assert.deepEqual(await harness.store.get(`resource:${selected.id}`), resourceBefore);
  assert.deepEqual(await harness.store.get(reservationKey), reservationBefore);
  assert.equal(await harness.store.get(`editor:${profile.id}:${selected.id}`), null);
  const write = writesSince(harness.store, offset).find(({ puts }) => puts.length > 0);
  assert.ok(write?.checks.some(({ key }) => key === reservationKey),
    'the event registration reservation participates in the placement transaction');
});

test('un recurso público controlado por otra persona se puede referenciar, pero no editar', async () => {
  const harness = await createCreatorPagesHarness();
  const owner = await createProfile(harness, { session: 'creator-b', slug: 'bea-referencias' });
  const ownerPublish = await api(harness, '/api/creador/perfil/publicar', {
    session: 'creator-b', method: 'POST', body: {},
  });
  assert.equal(ownerPublish.status, 200);

  const submitted = await api(harness, '/api/creador/enlaces', {
    session: 'creator-b', method: 'POST',
    body: { title: 'Recurso de Bea', url: 'https://catalog.example/owned-by-bea' },
  });
  assert.equal(submitted.status, 201);
  const submittedLink = (await responseJson(submitted)).link;
  const classified = await api(harness, `/api/admin/recursos/${submittedLink.resourceId}`, {
    session: 'admin', method: 'PATCH',
    body: {
      category: 'Otros', kind: 'content', format: 'Artículo', topics: [], version: submittedLink.resourceVersion,
    },
  });
  assert.equal(classified.status, 200);
  const resourceVersion = (await readAdminRecord(harness, 'resource', submittedLink.resourceId)).version;
  const approved = await api(harness, `/api/admin/recursos/${submittedLink.resourceId}/aprobar`, {
    session: 'admin', method: 'POST', body: { version: resourceVersion },
  });
  assert.equal(approved.status, 200);
  const publicOwnerPage = await harness.service.readPublicProfile(owner.slug);
  assert.equal(publicOwnerPage.status, 200);
  assert.ok(publicOwnerPage.links.some(({ resourceId }) => resourceId === submittedLink.resourceId),
    'the fixture is an actually published creator-owned resource');

  const creator = await createProfile(harness);
  const reference = await api(harness, endpoint, {
    method: 'POST',
    body: { resourceId: submittedLink.resourceId, url: submittedLink.url, profileVersion: creator.version },
  });
  assert.equal(reference.status, 201);
  assertPrivateJson(reference);
  const referenced = await responseJson(reference);
  assert.equal(referenced.link.resourceId, submittedLink.resourceId);
  assert.equal(referenced.link.hidden, false);
  assert.equal(await harness.store.get(`editor:${creator.id}:${submittedLink.resourceId}`), null);
  assert.ok(await harness.store.get(`editor:${owner.id}:${submittedLink.resourceId}`));

  const beforeAttempt = await harness.store.get(`resource:${submittedLink.resourceId}`);
  const unauthorizedEdit = await api(harness, `/api/creador/recursos/${submittedLink.resourceId}`, {
    method: 'PATCH', body: { title: 'Cambio no autorizado', version: beforeAttempt.version },
  });
  assert.equal(unauthorizedEdit.status, 403);
  assertPrivateJson(unauthorizedEdit);
  assert.deepEqual(await harness.store.get(`resource:${submittedLink.resourceId}`), beforeAttempt);
});

test('un reintento existente conserva selección, orden, serie y estado privado', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const selected = resource('catalog-reference-existing', 'https://catalog.example/existing', {
    sourceId: 'private-source-reference',
  });
  await seedResource(harness.store, selected);
  const created = await api(harness, '/api/creador/enlaces', {
    method: 'POST', body: { title: 'Referencia ya agregada', url: selected.url },
  });
  assert.equal(created.status, 201);
  const createdLink = (await responseJson(created)).link;
  const pKey = `placement:${profile.id}:${createdLink.placementId}`;
  const placement = await harness.store.get(pKey);
  const storedResource = await harness.store.get(`resource:${selected.id}`);
  const series = {
    recordType: 'series', id: 'reference-noop-series', profileId: profile.id,
    name: 'Serie existente', slug: 'serie-existente', version: 1,
  };
  const changedPlacement = {
    ...placement,
    position: 7,
    featured: true,
    selectedForDirectory: false,
    series: { [series.id]: { position: 2 } },
    version: placement.version + 1,
  };
  const changedResource = { ...storedResource, hidden: true, version: storedResource.version + 1 };
  assert.equal(await harness.store.transact({
    checks: [
      { key: pKey, version: placement.version },
      { key: `resource:${selected.id}`, version: storedResource.version },
      { key: `series:${profile.id}:${series.id}`, version: null },
    ],
    puts: [
      { key: pKey, value: changedPlacement },
      { key: `resource:${selected.id}`, value: changedResource },
      { key: `series:${profile.id}:${series.id}`, value: series },
    ],
  }), true);
  const savedProfile = await harness.store.get(`profile:${profile.id}`);
  const offset = harness.store.calls.length;

  const response = await api(harness, endpoint, {
    method: 'POST',
    body: { resourceId: selected.id, url: selected.url, profileVersion: savedProfile.version },
  });
  assert.equal(response.status, 200);
  assertPrivateJson(response);
  const result = await responseJson(response);
  assert.deepEqual(Object.keys(result).sort(), ['created', 'link', 'versionChanges']);
  assert.equal(result.created, false);
  assert.equal(result.link.hidden, true, 'the owner DTO reports the current hidden state while reusing a placement');
  assert.deepEqual(exactLinkKeys(result.link), LINK_KEYS);
  assert.equal(result.link.position, 7);
  assert.equal(result.link.featured, true);
  assert.equal(result.link.selectedForDirectory, false);
  assert.equal(result.link.resourceVersion, changedResource.version);
  assert.equal(result.link.placementVersion, changedPlacement.version);
  assert.equal(result.link.directoryApproval, 'approved');
  assert.deepEqual(result.link.series, [{ seriesId: series.id, position: 2 }],
    'the current link DTO retains its valid series membership');
  assert.deepEqual(result.versionChanges, []);
  assert.deepEqual(await harness.store.get(pKey), changedPlacement);
  assert.equal((await harness.store.get(`resource:${selected.id}`)).hidden, true);
  assert.deepEqual((await harness.store.get(`resource:${selected.id}`)).sourceId, 'private-source-reference');
  assert.doesNotMatch(JSON.stringify(result), /private-source-reference/u);
  const noOpChecks = transactionCallsSince(harness.store, offset).find(({ puts }) => puts.length === 0);
  assert.ok(noOpChecks, 'an existing reference uses a conditional no-op, not an unchecked early return');
  const checkedKeys = noOpChecks.checks.map(({ key }) => key);
  assert.ok(checkedKeys.includes(`profile:${profile.id}`));
  assert.ok(checkedKeys.includes(`resource:${selected.id}`));
  assert.ok(checkedKeys.includes(currentUrlKey(selected.url)));
  assert.ok(checkedKeys.includes(pKey));
  assert.equal(transactionCallsSince(harness.store, offset).some(({ puts }) => puts.length > 0), false);
});

test('el par obsoleto devuelve conflicto sin revelar la URL vigente ni aceptar una colocación ya existente', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const oldUrl = 'https://catalog.example/old-address';
  const currentUrl = 'https://catalog.example/current-address';
  const selected = resource('catalog-reference-stale', currentUrl);
  await seedResource(harness.store, selected);

  let stateBefore = await ownerLinkWriteState(harness, profile.id, [oldUrl, currentUrl]);
  let response = await api(harness, endpoint, {
    method: 'POST',
    body: { resourceId: selected.id, url: oldUrl, profileVersion: profile.version },
  });
  assert.equal(response.status, 409, 'a stale pair is rejected before a placement exists');
  assertPrivateJson(response);
  let error = await response.json();
  assert.deepEqual(Object.keys(error).sort(), ['error', 'message']);
  assert.doesNotMatch(JSON.stringify(error), /current-address/u);
  assert.deepEqual(await ownerLinkWriteState(harness, profile.id, [oldUrl, currentUrl]), stateBefore);

  const added = await api(harness, '/api/creador/enlaces', {
    method: 'POST', body: { title: 'Referencia actual', url: currentUrl },
  });
  assert.equal(added.status, 201);
  const afterAdd = await harness.store.get(`profile:${profile.id}`);
  stateBefore = await ownerLinkWriteState(harness, profile.id, [oldUrl, currentUrl]);

  response = await api(harness, endpoint, {
    method: 'POST',
    body: { resourceId: selected.id, url: oldUrl, profileVersion: afterAdd.version },
  });
  assert.equal(response.status, 409);
  assertPrivateJson(response);
  error = await response.json();
  assert.deepEqual(Object.keys(error).sort(), ['error', 'message']);
  assert.equal(JSON.stringify(error).includes(currentUrl), false);
  assert.deepEqual(await ownerLinkWriteState(harness, profile.id, [oldUrl, currentUrl]), stateBefore,
    'the stale pair cannot create a resource or a second placement');
  assert.equal((await harness.store.list(`placement:${profile.id}:`)).length, 1);
});

test('una carrera de reserva y colocación ganadora no permite devolver un destino no comprobado', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const requestedUrl = 'https://catalog.example/race-selected';
  const movedUrl = 'https://catalog.example/race-current';
  const selected = resource('catalog-reference-race', requestedUrl);
  await seedResource(harness.store, selected);

  const rawTransact = harness.store.transact.bind(harness.store);
  let raced = false;
  harness.store.transact = async (transaction) => {
    const keys = transaction.checks.map(({ key }) => key);
    const isFirstReferenceCreate = !raced
      && keys.includes(`resource:${selected.id}`)
      && keys.includes(currentUrlKey(requestedUrl))
      && transaction.puts.some(({ key }) => key.startsWith(`placement:${profile.id}:`));
    if (isFirstReferenceCreate) {
      raced = true;
      const resourceBefore = await harness.store.get(`resource:${selected.id}`);
      const reservationBefore = await harness.store.get(currentUrlKey(requestedUrl));
      const profileBefore = await harness.store.get(`profile:${profile.id}`);
      const id = placementId(profile.id, selected.id);
      const nextProfile = { ...profileBefore, version: profileBefore.version + 1 };
      const nextResource = { ...resourceBefore, url: movedUrl, version: resourceBefore.version + 1 };
      const winnerPlacement = {
        recordType: 'placement', id, profileId: profile.id, resourceId: selected.id,
        position: 0, featured: false, selectedForDirectory: true, version: nextProfile.version,
      };
      assert.equal(await rawTransact({
        checks: [
          { key: `profile:${profile.id}`, version: profileBefore.version },
          { key: `resource:${selected.id}`, version: resourceBefore.version },
          { key: currentUrlKey(requestedUrl), version: reservationBefore.version },
          { key: currentUrlKey(movedUrl), version: null },
          { key: `placement:${profile.id}:${id}`, version: null },
        ],
        puts: [
          { key: `profile:${profile.id}`, value: nextProfile },
          { key: `resource:${selected.id}`, value: nextResource },
          { key: currentUrlKey(movedUrl), value: { recordType: 'urlReservation', url: movedUrl, status: 'reserved', resourceId: selected.id, version: 1 } },
          { key: `placement:${profile.id}:${id}`, value: winnerPlacement },
        ],
        deletes: [currentUrlKey(requestedUrl)],
      }), true, 'the competing writer moves the URL and creates its placement atomically');
    }
    return rawTransact(transaction);
  };

  const response = await api(harness, endpoint, {
    method: 'POST', body: { resourceId: selected.id, url: requestedUrl, profileVersion: profile.version },
  });
  assert.equal(raced, true, 'the request reached the atomic reference write');
  assert.equal(response.status, 409);
  assertPrivateJson(response);
  assert.doesNotMatch(await response.text(), /race-current/u,
    'the failed selection does not disclose a URL that was not in the submitted pair');
  assert.equal((await harness.store.get(`resource:${selected.id}`)).url, movedUrl);
  assert.equal((await harness.store.get(`placement:${profile.id}:${placementId(profile.id, selected.id)}`))?.resourceId, selected.id,
    'the other writer keeps its legitimate placement without being returned as this stale request result');
});

async function rejectReferenceWithoutWrite({ name, expectedStatuses, request, prepare, resourceCount = 1 }) {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const routeMatch = await api(harness, endpoint, { method: 'GET' });
  assert.equal(routeMatch.status, 405, 'the endpoint matcher must exist before a negative input can be accepted as tested');
  assertPrivateJson(routeMatch);
  const selected = resource(`catalog-reference-reject-${name}`, `https://catalog.example/reject-${name}`);
  await seedResource(harness.store, selected);
  if (prepare) await prepare(harness, selected);
  const body = request(profile, selected);
  const stateBefore = await ownerLinkWriteState(harness, profile.id, [selected.url]);

  const response = await api(harness, endpoint, { method: 'POST', body });
  assert.ok(expectedStatuses.includes(response.status), `expected ${expectedStatuses.join(' or ')}, got ${response.status}`);
  assertPrivateJson(response);
  const error = await response.json();
  assert.deepEqual(Object.keys(error).sort(), ['error', 'message']);
  assert.deepEqual(await ownerLinkWriteState(harness, profile.id, [selected.url]), stateBefore,
    'rejected selection must not create or modify a profile, placement, editor reference, resource, or URL reservation');
  assert.equal((await harness.store.list('resource:')).length, resourceCount,
    'a failed ID reference never falls back to creating a new catalog resource');
  assert.deepEqual(await harness.store.list(`placement:${profile.id}:`), []);
  assert.deepEqual(await harness.store.list(`editor:${profile.id}:`), []);
}

const rejectedReferenceCases = [
  {
    name: 'id-sin-url', expectedStatuses: [400, 422],
    request: (profile, selected) => ({ resourceId: selected.id, profileVersion: profile.version }),
  },
  {
    name: 'id-equivocado', expectedStatuses: [404, 409, 422],
    request: (profile, selected) => ({ resourceId: 'catalog-reference-not-selected', url: selected.url, profileVersion: profile.version }),
  },
  {
    name: 'id-control-url', expectedStatuses: [404, 422],
    request: (profile, selected) => ({ resourceId: currentUrlReservationId(selected.url), url: selected.url, profileVersion: profile.version }),
  },
  {
    name: 'reserva-ausente', expectedStatuses: [409, 503],
    prepare: async (harness, selected) => {
      const key = currentUrlKey(selected.url);
      const reservation = await harness.store.get(key);
      assert.equal(await harness.store.transact({ checks: [{ key, version: reservation.version }], deletes: [key] }), true);
    },
    request: (profile, selected) => ({ resourceId: selected.id, url: selected.url, profileVersion: profile.version }),
  },
  {
    name: 'reserva-incoherente', expectedStatuses: [409, 503],
    prepare: async (harness, selected) => {
      const key = currentUrlKey(selected.url);
      const reservation = await harness.store.get(key);
      assert.equal(await harness.store.transact({
        checks: [{ key, version: reservation.version }],
        puts: [{ key, value: { ...reservation, resourceId: 'catalog-reference-other-resource', version: reservation.version + 1 } }],
      }), true);
    },
    request: (profile, selected) => ({ resourceId: selected.id, url: selected.url, profileVersion: profile.version }),
  },
  {
    name: 'reserva-en-colision', expectedStatuses: [409], resourceCount: 2,
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
    request: (profile, selected) => ({ resourceId: selected.id, url: selected.url, profileVersion: profile.version }),
  },
  {
    name: 'url-insegura', expectedStatuses: [400, 422],
    request: (profile, selected) => ({ resourceId: selected.id, url: 'javascript:alert(1)', profileVersion: profile.version }),
  },
  {
    name: 'seleccion-no-booleana', expectedStatuses: [400, 422],
    request: (profile, selected) => ({ resourceId: selected.id, url: selected.url, profileVersion: profile.version, selectedForDirectory: 'yes' }),
  },
];

for (const scenario of rejectedReferenceCases) {
  test(`rechaza ${scenario.name} antes de escribir o crear una ficha`, () => rejectReferenceWithoutWrite(scenario));
}

test('la versión de perfil obsoleta se rechaza en una referencia nueva y en una ya existente', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const newRecord = resource('catalog-reference-new-stale-profile', 'https://catalog.example/new-stale-profile');
  const existingRecord = resource('catalog-reference-existing-stale-profile', 'https://catalog.example/existing-stale-profile');
  await seedResource(harness.store, newRecord);
  await seedResource(harness.store, existingRecord);

  let stateBefore = await ownerLinkWriteState(harness, profile.id, [newRecord.url, existingRecord.url]);
  let response = await api(harness, endpoint, {
    method: 'POST', body: { resourceId: newRecord.id, url: newRecord.url, profileVersion: profile.version - 1 },
  });
  assert.equal(response.status, 409);
  assertPrivateJson(response);
  assert.deepEqual(await ownerLinkWriteState(harness, profile.id, [newRecord.url, existingRecord.url]), stateBefore);

  const attached = await api(harness, '/api/creador/enlaces', {
    method: 'POST', body: { title: 'Colocación conocida', url: existingRecord.url },
  });
  assert.equal(attached.status, 201);
  const placementCount = (await harness.store.list(`placement:${profile.id}:`)).length;
  stateBefore = await ownerLinkWriteState(harness, profile.id, [newRecord.url, existingRecord.url]);
  response = await api(harness, endpoint, {
    method: 'POST', body: { resourceId: existingRecord.id, url: existingRecord.url, profileVersion: profile.version },
  });
  assert.equal(response.status, 409, 'an existing placement does not bypass profile-version validation');
  assertPrivateJson(response);
  assert.deepEqual(await ownerLinkWriteState(harness, profile.id, [newRecord.url, existingRecord.url]), stateBefore);
  assert.equal((await harness.store.list(`placement:${profile.id}:`)).length, placementCount);
});

for (const raceField of ['resource', 'reservation', 'profile']) {
  test(`CAS rechaza una carrera aislada sobre ${raceField} antes de crear la referencia`, async () => {
    const harness = await createCreatorPagesHarness();
    const profile = await createProfile(harness);
    const selected = resource(`catalog-reference-race-${raceField}`, `https://catalog.example/race-${raceField}`);
    await seedResource(harness.store, selected);
    const stateBefore = await ownerLinkWriteState(harness, profile.id, [selected.url]);
    const rawTransact = harness.store.transact.bind(harness.store);
    let raced = false;
    harness.store.transact = async (transaction) => {
      const checkKeys = (transaction.checks ?? []).map(({ key }) => key);
      const targetPlacement = `placement:${profile.id}:${placementId(profile.id, selected.id)}`;
      if (!raced && transaction.puts?.some(({ key }) => key === targetPlacement)
        && checkKeys.includes(`profile:${profile.id}`)
        && checkKeys.includes(`resource:${selected.id}`)
        && checkKeys.includes(currentUrlKey(selected.url))) {
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
          const before = await harness.store.get(`profile:${profile.id}`);
          assert.equal(await rawTransact({
            checks: [{ key: `profile:${profile.id}`, version: before.version }],
            puts: [{ key: `profile:${profile.id}`, value: { ...before, displayName: 'Ana cambió en paralelo', version: before.version + 1 } }],
          }), true);
        }
      }
      return rawTransact(transaction);
    };

    const offset = harness.store.calls.length;
    const response = await api(harness, endpoint, {
      method: 'POST', body: { resourceId: selected.id, url: selected.url, profileVersion: profile.version },
    });
    assert.equal(raced, true, 'the request reached the conditional placement transaction');
    assert.equal(response.status, 409);
    assertPrivateJson(response);
    const after = await ownerLinkWriteState(harness, profile.id, [selected.url]);
    assert.deepEqual(after.placements, []);
    assert.deepEqual(after.editorReferences, []);
    const targetInput = transactionCallsSince(harness.store, offset).find(({ puts = [] }) => puts.some(({ key }) => key === targetPlacement));
    assert.ok(targetInput, 'the request attempted the placement transaction against its observed state');
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

test('una falla del store al escribir devuelve 503 sin una colocación parcial', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const selected = resource('catalog-reference-storage-failure', 'https://catalog.example/storage-failure');
  await seedResource(harness.store, selected);
  const resourceBefore = await harness.store.get(`resource:${selected.id}`);
  const profileBefore = await harness.store.get(`profile:${profile.id}`);
  const reservationBefore = await harness.store.get(currentUrlKey(selected.url));
  const offset = harness.store.calls.length;
  const stateBefore = await ownerLinkWriteState(harness, profile.id, [selected.url]);
  harness.store.failNext('transact', new Error('simulated storage outage'));

  const response = await api(harness, endpoint, {
    method: 'POST', body: { resourceId: selected.id, url: selected.url, profileVersion: profile.version },
  });
  assert.equal(response.status, 503);
  assertPrivateJson(response);
  assert.deepEqual(await response.json(), {
    error: 'SERVICE_UNAVAILABLE', message: 'service is temporarily unavailable',
  });
  const transaction = transactionCallsSince(harness.store, offset);
  assert.equal(transaction.length, 1, 'the service attempts a single atomic placement transaction');
  assert.equal(transaction[0].puts.length, 2);
  assert.ok(transaction[0].puts.some(({ key }) => key === `profile:${profile.id}`));
  assert.ok(transaction[0].puts.some(({ key }) => key.startsWith(`placement:${profile.id}:`)));
  assert.deepEqual(await ownerLinkWriteState(harness, profile.id, [selected.url]), stateBefore,
    'the failed transaction commits no profile, placement, editor, resource, or reservation change');
  assert.deepEqual(await harness.store.get(`resource:${selected.id}`), resourceBefore);
  assert.deepEqual(await harness.store.get(`profile:${profile.id}`), profileBefore);
  assert.deepEqual(await harness.store.get(currentUrlKey(selected.url)), reservationBefore);
  assert.deepEqual(await harness.store.list(`placement:${profile.id}:`), []);
  assert.deepEqual(await harness.store.list(`editor:${profile.id}:`), []);
});

test('la ruta de referencia conserva autenticación, origen, CSRF, método y rechazo de JSON malformado', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const body = { resourceId: 'catalog-reference-http', url: 'https://catalog.example/http', profileVersion: 1 };

  for (const [response, expected] of [
    [await api(harness, endpoint, { session: null, method: 'POST', body }), 401],
    [await api(harness, endpoint, { method: 'POST', body, origin: 'https://foreign.example' }), 403],
    [await api(harness, endpoint, { method: 'POST', body, csrf: 'wrong-token' }), 403],
    [await api(harness, endpoint, { method: 'GET' }), 405],
  ]) {
    assert.equal(response.status, expected);
    assertPrivateJson(response);
  }

  const malformed = new Request(new URL(endpoint, SITE_ORIGIN), {
    method: 'POST',
    headers: { Origin: SITE_ORIGIN, 'x-test-session': 'creator-a', 'x-csrf-token': sessionCsrf['creator-a'], 'content-type': 'application/json' },
    body: '{',
  });
  const malformedResponse = await harness.service.handle(malformed);
  assert.equal(malformedResponse.status, 400);
  assertPrivateJson(malformedResponse);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  seedResource,
  SITE_ORIGIN,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';
import { currentUrlCollision, currentUrlKey, currentUrlReservationId } from '../src/lib/catalog-url.mjs';
import { createCreatorPagesService } from '../src/lib/creator-pages.mjs';
import { createCreatorStore } from '../src/lib/creator-store.mjs';

const CLAIMS_PATH = '/api/creador/reclamaciones/';
const ADMIN_CLAIMS_PATH = '/api/admin/reclamaciones/';
const ADMIN_LINK_PATH = '/api/admin/reclamaciones/vincular/';

async function api(harness, path, session = 'creator-a', options = {}) {
  return callApi(harness, path, { session, csrf: sessionCsrf[session], ...options });
}

async function createProfile(harness, session = 'creator-a', slug = 'claim-selection') {
  const response = await api(harness, '/api/creador/perfil', session, {
    method: 'PUT',
    body: { displayName: `${session} creator`, slug, programs: [], socials: {} },
  });
  assert.equal(response.status, 200, 'the real service harness can create the owner profile');
  return (await responseJson(response)).profile;
}

function resource(id, url, extra = {}) {
  return {
    id,
    title: `Ficha privada ${id}`,
    url,
    description: 'Descripción interna de prueba',
    category: 'Artículo',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    order: 1,
    featured: false,
    published: false,
    directoryControl: 'editorial',
    version: 1,
    ...extra,
  };
}

async function seedResourceWithoutReservation(store, record) {
  const result = await store.transact({
    checks: [{ key: `resource:${record.id}`, version: null }],
    puts: [{ key: `resource:${record.id}`, value: structuredClone(record) }],
  });
  assert.equal(result, true);
}

async function claimRows(harness) {
  return harness.store.list('claim:');
}

async function claimRefRows(harness, profileId) {
  return harness.store.list(`claim-ref:${profileId}:`);
}

function claimWritesSince(harness, callIndex) {
  return harness.store.calls.slice(callIndex).filter(({ operation, input }) => operation === 'transact'
    && input.puts?.some(({ key }) => key.startsWith('claim:') || key.startsWith('claim-ref:')));
}

function applyRequestedProjection(item, input) {
  const projected = {};
  const requestedNames = input.ProjectionExpression.split(',').map((alias) => {
    const field = input.ExpressionAttributeNames?.[alias.trim()];
    if (typeof field !== 'string') throw new Error(`projection alias was not bound: ${alias}`);
    return field;
  });
  for (const field of requestedNames) {
    if (Object.hasOwn(item, field)) projected[field] = structuredClone(item[field]);
  }
  return projected;
}

function createProjectionApplyingDocumentQueryClient(items) {
  const calls = [];
  return {
    calls,
    async send(command) {
      if (command.constructor.name !== 'QueryCommand') {
        throw new Error(`unexpected DocumentQuery command: ${command.constructor.name}`);
      }
      calls.push(command);
      const input = command.input;
      const partition = input.ExpressionAttributeValues[':pk'];
      const prefix = input.ExpressionAttributeValues[':sk'];
      return {
        Items: items
          .filter((item) => item.pk === partition && typeof item.sk === 'string' && item.sk.startsWith(prefix))
          .map((item) => applyRequestedProjection(item, input)),
      };
    },
  };
}

async function assertNoClaimCreated(harness, profileId, callIndex) {
  assert.equal((await claimRows(harness)).length, 0, 'no claim row is left behind');
  assert.equal((await claimRefRows(harness, profileId)).length, 0, 'no owner reference is left behind');
  assert.deepEqual(claimWritesSince(harness, callIndex), [], 'rejected input never attempts a claim transaction');
}

test('POST accepts exact ID+URL pairs and reserved URL-only targets without granting resource authority', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const exactUrl = 'https://catalog.example/hidden-current?source=private';
  const reservedUrl = 'https://catalog.example/known-current/';
  const pair = resource('hidden-unpublished', exactUrl, { hidden: true, approvalRevoked: true });
  const reserved = resource('known-by-url', reservedUrl, { sourceId: 'shared-source' });
  const sibling = resource('same-source-sibling', 'https://catalog.example/sibling', { sourceId: 'shared-source' });
  await seedResourceWithoutReservation(harness.store, pair);
  await seedResource(harness.store, reserved);
  await seedResource(harness.store, sibling);

  const publication = await api(harness, '/api/creador/perfil/publicar', 'creator-a', {
    method: 'POST', body: {},
  });
  assert.equal(publication.status, 200);

  const profileBefore = await harness.store.get(`profile:${profile.id}`);
  const resourceBefore = await harness.store.get(`resource:${pair.id}`);
  const reservationBefore = await harness.store.get(currentUrlKey(reservedUrl));
  const callIndex = harness.store.calls.length;
  const response = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST',
    body: {
      resources: [
        { resourceId: pair.id, url: exactUrl },
        { url: reservedUrl },
      ],
      sourceId: 'shared-source',
      evidence: 'Confirmación privada del creador',
    },
  });

  assert.equal(response.status, 202);
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  const result = await responseJson(response);
  const stored = await harness.store.get(`claim:${result.claim.id}`);
  assert.equal(result.claim.id, stored.id);
  assert.equal(result.claim.status, stored.status);
  assert.equal(result.claim.createdAt, stored.createdAt);
  assert.deepEqual(result.claim.resourceIds, [pair.id, reserved.id]);
  assert.deepEqual(result.claim.resources, [
    { resourceId: pair.id, url: exactUrl },
    { resourceId: reserved.id, url: reservedUrl },
  ], 'the new creation response requires every resolved ID+submitted URL pair');
  assert.equal(result.claim.sourceId, 'shared-source');
  assert.equal(result.claim.evidence, 'Confirmación privada del creador');
  assert.deepEqual(result.versionChanges, [], 'claim creation does not advance profile, resource or placement versions');

  const writes = claimWritesSince(harness, callIndex);
  assert.equal(writes.length, 1, 'claim and owner reference are written in one transaction');
  assert.equal(writes[0].input.puts.length, 2, 'the transaction contains the two existing logical rows');
  assert.deepEqual(writes[0].input.puts.map(({ key }) => key).sort(), [
    `claim:${result.claim.id}`,
    `claim-ref:${profile.id}:${result.claim.id}`,
  ].sort());
  assert.deepEqual(stored.resourceIds, [pair.id, reserved.id]);
  assert.equal(stored.sourceId, 'shared-source');
  assert.deepEqual(stored.resources, [
    { resourceId: pair.id, url: exactUrl },
    { resourceId: reserved.id, url: reservedUrl },
  ], 'the claim stores resolved IDs with URLs supplied by the requester');
  assert.deepEqual(await harness.store.get(`claim-ref:${profile.id}:${result.claim.id}`), {
    id: result.claim.id,
    version: 1,
  });
  assert.deepEqual(await harness.store.get(`profile:${profile.id}`), profileBefore);
  assert.deepEqual(await harness.store.get(`resource:${pair.id}`), resourceBefore);
  assert.equal(await harness.store.get(currentUrlKey(exactUrl)), null,
    'an exact ID+URL claim does not require or create a URL reservation');
  assert.deepEqual(await harness.store.get(currentUrlKey(reservedUrl)), reservationBefore);
  assert.deepEqual(await harness.store.list(`placement:${profile.id}:`), []);
  assert.deepEqual(await harness.store.list(`editor:${profile.id}:`), []);
  assert.equal((await harness.store.get(`resource:${sibling.id}`)).editorProfileId, undefined,
    'sourceId does not expand the request to a sibling resource');

  const ownerView = await responseJson(await api(harness, '/api/creador/perfil', 'creator-a'));
  assert.equal(ownerView.claims[0].id, stored.id);
  assert.equal(ownerView.claims[0].status, stored.status);
  assert.equal(ownerView.claims[0].createdAt, stored.createdAt);
  assert.deepEqual(ownerView.claims[0].resourceIds, [pair.id, reserved.id]);
  assert.equal(ownerView.claims[0].evidence, 'Confirmación privada del creador');
  assert.deepEqual(ownerView.claims[0].resources, stored.resources,
    'new owner history requires submitted URLs and resolved IDs');
  const adminView = await responseJson(await api(harness, ADMIN_CLAIMS_PATH, 'admin'));
  assert.equal(adminView.claims[0].id, stored.id);
  assert.equal(adminView.claims[0].status, stored.status);
  assert.equal(adminView.claims[0].createdAt, stored.createdAt);
  assert.deepEqual(adminView.claims[0].resourceIds, [pair.id, reserved.id]);
  assert.deepEqual(adminView.claims[0].resources, stored.resources,
    'new admin history requires submitted URLs and resolved IDs');

  const edit = await api(harness, `/api/creador/recursos/${encodeURIComponent(pair.id)}`, 'creator-a', {
    method: 'PATCH',
    body: { title: 'La solicitud no concede edición' },
  });
  assert.equal(edit.status, 403, 'a known catalog resource does not grant editing before exact admin linking');

  // Astro's public /c/{slug}/ route reads this public model from the service.
  const publicPage = await harness.service.readPublicProfile(profile.slug);
  assert.equal(publicPage.status, 200);
  assert.deepEqual(publicPage.links, [], 'claim submission does not add a public link or placement');
  const publicJson = JSON.stringify(publicPage);
  for (const privateMarker of [
    result.claim.id,
    pair.id,
    reserved.id,
    exactUrl,
    reservedUrl,
    'Confirmación privada del creador',
    'resources',
    'evidence',
  ]) {
    assert.equal(publicJson.includes(privateMarker), false,
      `public profile output excludes claim/private marker ${JSON.stringify(privateMarker)}`);
  }
});

test('admin claim listing preserves submitted resource pairs through the physical DocumentQuery projection', async () => {
  const resources = [
    { resourceId: 'physical-selected-id', url: 'https://catalog.example/physical-selected' },
    { resourceId: 'physical-url-resolved-id', url: 'https://catalog.example/physical-known-url' },
  ];
  const row = {
    pk: 'ADMIN#CLAIMS',
    sk: 'CLAIM#physical-claim-with-resources',
    recordType: 'claim',
    id: 'physical-claim-with-resources',
    profileId: 'physical-profile',
    accountId: 'physical-account',
    resourceIds: resources.map(({ resourceId }) => resourceId),
    resources,
    sourceId: 'physical-source',
    evidence: 'Private physical claim evidence',
    status: 'pending',
    createdAt: 1793212345000,
    version: 1,
  };
  const client = createProjectionApplyingDocumentQueryClient([row]);
  const store = createCreatorStore({
    accountsTableName: 'phase7-accounts',
    profilesTableName: 'phase7-profiles',
    catalogTableName: 'phase7-catalog',
    client,
  });
  const service = createCreatorPagesService({
    store,
    origin: SITE_ORIGIN,
    createId: () => 'physical-query-generated-id',
    authenticate: async (request) => request.headers.get('x-test-session') === 'admin'
      ? { state: 'authenticated', accountId: 'private-account-admin', csrfToken: 'csrf-admin', isAdmin: true }
      : { state: 'anonymous' },
  });
  const harness = { service, store };

  const queryRows = await store.list('claim:');
  assert.equal(queryRows.length, 1);
  const response = await api(harness, ADMIN_CLAIMS_PATH, 'admin');
  assert.equal(response.status, 200);
  const listed = await responseJson(response);
  assert.equal(listed.claims.length, 1);
  assert.equal(listed.claims[0].id, row.id);
  assert.equal(listed.claims[0].status, row.status);
  assert.equal(listed.claims[0].createdAt, row.createdAt);
  assert.deepEqual(listed.claims[0].resourceIds, row.resourceIds);
  assert.deepEqual({
    physicalQuery: queryRows[0].value.resources,
    adminHttpList: listed.claims[0].resources,
  }, {
    physicalQuery: resources,
    adminHttpList: resources,
  }, 'the physical projection and admin HTTP listing both preserve submitted ID+URL pairs');
});

test('exact cohost pairs preserve both IDs while URL-only collision is rejected without enumerating candidates', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const url = 'https://catalog.example/cohost-event';
  const first = resource('event-cohost-one', url, { recordType: 'event', registrationUrl: url });
  delete first.url;
  const second = resource('event-cohost-two', url, { recordType: 'event', registrationUrl: url });
  delete second.url;
  await seedResource(harness.store, first);
  await seedResourceWithoutReservation(harness.store, second);
  const collision = currentUrlCollision(url, [first.id, second.id]);
  assert.equal(await harness.store.transact({
    checks: [{ key: currentUrlKey(url), version: 1 }],
    puts: [{ key: currentUrlKey(url), value: collision }],
  }), true, 'the fixture establishes the catalog collision state');

  const rejectedAt = harness.store.calls.length;
  const ambiguous = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST', body: { resources: [{ url }] },
  });
  assert.equal(ambiguous.status, 409);
  const ambiguousJson = JSON.stringify(await responseJson(ambiguous));
  assert.equal(ambiguousJson.includes(first.id), false, 'collision errors do not disclose the first candidate ID');
  assert.equal(ambiguousJson.includes(second.id), false, 'collision errors do not disclose the second candidate ID');
  assert.equal(ambiguousJson.includes(first.title), false, 'collision errors do not disclose catalog titles');
  await assertNoClaimCreated(harness, profile.id, rejectedAt);

  const acceptedAt = harness.store.calls.length;
  const exact = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST', body: { resources: [{ resourceId: first.id, url }, { resourceId: second.id, url }] },
  });
  assert.equal(exact.status, 202, 'each exact ID+URL pair remains independently claimable despite the URL collision');
  const body = await responseJson(exact);
  assert.deepEqual(body.claim.resourceIds, [first.id, second.id]);
  assert.equal(new Set(body.claim.resourceIds).size, 2, 'same URL does not deduplicate distinct cohost IDs');
  const write = claimWritesSince(harness, acceptedAt);
  assert.equal(write.length, 1);
  assert.deepEqual((await harness.store.get(`claim:${body.claim.id}`)).resources, [
    { resourceId: first.id, url },
    { resourceId: second.id, url },
  ]);
  assert.deepEqual(await harness.store.list(`placement:${profile.id}:`), []);
  assert.deepEqual(await harness.store.list(`editor:${profile.id}:`), []);
});

test('URL-only resolution distinguishes missing and inconsistent reservations and preserves literal URLs', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const currentUrl = 'https://catalog.example/trailing/';
  const eventUrl = 'https://catalog.example/event-registration?campaign=exact';
  const absentUrl = 'https://catalog.example/no-reservation';
  const inconsistentUrl = 'https://catalog.example/inconsistent';
  const movedResourceUrl = 'https://catalog.example/reservation-resource-mismatch';
  const trailing = resource('literal-trailing', currentUrl);
  const event = resource('event-registration-current', eventUrl, {
    recordType: 'event',
    registrationUrl: eventUrl,
    startsAt: '2000-01-01T10:00:00Z',
    endsAt: '2000-01-01T11:00:00Z',
  });
  delete event.url;
  const absent = resource('without-reservation', absentUrl);
  const inconsistent = resource('inconsistent-reservation', inconsistentUrl);
  const moved = resource('moved-after-reservation', movedResourceUrl);
  const controlUrl = 'https://catalog.example/control-row-url';
  const controlId = currentUrlReservationId(controlUrl);
  const control = resource(controlId, controlUrl, { recordType: 'urlReservation', status: 'reserved' });
  await seedResource(harness.store, trailing);
  await seedResource(harness.store, event);
  await seedResourceWithoutReservation(harness.store, absent);
  await seedResource(harness.store, inconsistent);
  await seedResource(harness.store, moved);
  await seedResourceWithoutReservation(harness.store, control);
  assert.equal(await harness.store.transact({
    checks: [{ key: currentUrlKey(controlUrl), version: null }],
    puts: [{ key: currentUrlKey(controlUrl), value: {
      id: controlId,
      recordType: 'urlReservation',
      url: controlUrl,
      status: 'reserved',
      resourceId: controlId,
      version: 1,
    } }],
  }), true);
  const movedBefore = await harness.store.get(`resource:${moved.id}`);
  assert.equal(await harness.store.transact({
    checks: [{ key: `resource:${moved.id}`, version: movedBefore.version }],
    puts: [{ key: `resource:${moved.id}`, value: {
      ...movedBefore,
      url: 'https://catalog.example/resource-moved-after-reservation',
      version: movedBefore.version + 1,
    } }],
  }), true, 'the test creates a stale reservation against a resource whose current URL changed');
  const reservationKey = currentUrlKey(inconsistentUrl);
  const malformedReservation = {
    id: currentUrlReservationId(inconsistentUrl),
    recordType: 'urlReservation',
    url: 'https://catalog.example/different-key-content',
    status: 'reserved',
    resourceId: inconsistent.id,
    version: 1,
  };
  assert.equal(await harness.store.transact({
    checks: [{ key: reservationKey, version: 1 }],
    puts: [{ key: reservationKey, value: malformedReservation }],
  }), true);

  const missingAt = harness.store.calls.length;
  const missing = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST', body: { resources: [{ url: absentUrl }] },
  });
  assert.equal(missing.status, 404, 'URL-only requests need a unique reservation');
  await assertNoClaimCreated(harness, profile.id, missingAt);

  const inconsistentAt = harness.store.calls.length;
  const broken = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST', body: { resources: [{ url: inconsistentUrl }] },
  });
  assert.equal(broken.status, 503, 'a reservation whose contents do not match its hash is an operational inconsistency');
  const brokenJson = JSON.stringify(await responseJson(broken));
  assert.equal(brokenJson.includes(inconsistentUrl), false);
  assert.equal(brokenJson.includes(inconsistent.title), false);
  await assertNoClaimCreated(harness, profile.id, inconsistentAt);

  const controlAt = harness.store.calls.length;
  const controlOnly = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST', body: { resources: [{ url: controlUrl }] },
  });
  assert.equal(controlOnly.status, 503, 'a reservation cannot resolve to its own internal control row');
  await assertNoClaimCreated(harness, profile.id, controlAt);

  const movedAt = harness.store.calls.length;
  const movedUrl = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST', body: { resources: [{ url: movedResourceUrl }] },
  });
  assert.equal(movedUrl.status, 503, 'a valid-looking reservation must still match the resource current URL');
  await assertNoClaimCreated(harness, profile.id, movedAt);

  const literalAt = harness.store.calls.length;
  const literalMismatch = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST', body: { resources: [{ resourceId: trailing.id, url: currentUrl.slice(0, -1) }] },
  });
  assert.equal(literalMismatch.status, 409, 'a trailing slash change is a stale URL observation');
  await assertNoClaimCreated(harness, profile.id, literalAt);

  const eventClaim = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST', body: { resources: [{ url: eventUrl }] },
  });
  assert.equal(eventClaim.status, 202, 'an event resolves against its current registrationUrl, even after it ended');
  assert.deepEqual((await responseJson(eventClaim)).claim.resourceIds, [event.id]);
});

test('all submitted pairs are validated before deduplication and errors do not reveal an unsubmitted private URL or title', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness);
  const currentUrl = 'https://private.catalog.example/hidden-current-url';
  const privateResource = resource('private-url-target', currentUrl, { hidden: true, published: false });
  await seedResourceWithoutReservation(harness.store, privateResource);
  const submittedOldUrl = 'https://public.example/old-observation';

  for (const resources of [
    [
      { resourceId: privateResource.id, url: currentUrl },
      { resourceId: privateResource.id, url: submittedOldUrl },
    ],
    [
      { resourceId: privateResource.id, url: submittedOldUrl },
      { resourceId: privateResource.id, url: currentUrl },
    ],
  ]) {
    const callIndex = harness.store.calls.length;
    const response = await api(harness, CLAIMS_PATH, 'creator-a', {
      method: 'POST', body: { resources },
    });
    assert.equal(response.status, 409, 'every pair must match the current URL before duplicate IDs are collapsed');
    const error = JSON.stringify(await responseJson(response));
    assert.equal(error.includes(privateResource.title), false);
    assert.equal(error.includes(currentUrl), false, 'the service does not return an unsubmitted current URL');
    await assertNoClaimCreated(harness, profile.id, callIndex);
  }

  const exactDuplicate = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST',
    body: { resources: [
      { resourceId: privateResource.id, url: currentUrl },
      { resourceId: privateResource.id, url: currentUrl },
    ] },
  });
  assert.equal(exactDuplicate.status, 202, 'valid duplicate ID pairs collapse after validation');
  assert.deepEqual((await responseJson(exactDuplicate)).claim.resourceIds, [privateResource.id]);

  const missingAt = harness.store.calls.length;
  const missingId = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST', body: { resources: [{ resourceId: 'not-in-catalog', url: submittedOldUrl }] },
  });
  assert.equal(missingId.status, 404);
  const missingJson = JSON.stringify(await responseJson(missingId));
  assert.equal(missingJson.includes(privateResource.title), false);
  assert.equal(missingJson.includes(currentUrl), false);
  assert.equal(claimWritesSince(harness, missingAt).length, 0);
});

test('exactly one selection mode is accepted and catalog control rows are not claimable', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness, 'creator-a', 'claim-selection-modes');
  const target = resource('selection-mode-target', 'https://catalog.example/selection-mode');
  const controlUrl = 'https://catalog.example/selection-control';
  const controlId = currentUrlReservationId(controlUrl);
  const control = resource(controlId, controlUrl, { recordType: 'urlReservation', status: 'reserved' });
  await seedResource(harness.store, target);
  await seedResourceWithoutReservation(harness.store, control);

  const methodCallIndex = harness.store.calls.length;
  const wrongMethod = await api(harness, CLAIMS_PATH, 'creator-a');
  assert.equal(wrongMethod.status, 405, 'the claims endpoint remains POST-only');
  assert.equal(claimWritesSince(harness, methodCallIndex).length, 0);

  for (const body of [
    {},
    { resources: [] },
    { resourceIds: [] },
    { resources: [], resourceIds: [target.id] },
    { resources: [{ url: target.url }], resourceIds: [target.id] },
    { resources: [{ resourceId: target.id }] },
  ]) {
    const callIndex = harness.store.calls.length;
    const response = await api(harness, CLAIMS_PATH, 'creator-a', { method: 'POST', body });
    assert.ok([400, 422].includes(response.status), `malformed selection request is rejected: ${JSON.stringify(body)}`);
    assert.equal(claimWritesSince(harness, callIndex).length, 0);
  }
  const controlCallIndex = harness.store.calls.length;
  const controlClaim = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST', body: { resources: [{ resourceId: controlId, url: controlUrl }] },
  });
  assert.equal(controlClaim.status, 422, 'a physical URL reservation control row is not a catalog target');
  assert.equal(claimWritesSince(harness, controlCallIndex).length, 0);
  assert.equal((await claimRows(harness)).length, 0);
  assert.equal((await claimRefRows(harness, profile.id)).length, 0);
});

test('legacy ID claims remain legible only to their owner and admin without adding raw catalog metadata', async () => {
  const harness = await createCreatorPagesHarness();
  const owner = await createProfile(harness, 'creator-a', 'claim-legacy-owner');
  await createProfile(harness, 'creator-b', 'claim-legacy-other');
  const target = resource('legacy-private-target', 'https://private.catalog.example/legacy-only');
  const sibling = resource('legacy-source-sibling', 'https://private.catalog.example/sibling', { sourceId: 'same-source' });
  await seedResource(harness.store, target);
  await seedResource(harness.store, sibling);
  const published = await api(harness, '/api/creador/perfil/publicar', 'creator-a', { method: 'POST', body: {} });
  assert.equal(published.status, 200);
  const profileBeforeClaim = await harness.store.get(`profile:${owner.id}`);

  const created = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST', body: { resourceIds: [target.id], sourceId: 'same-source', evidence: 'e'.repeat(2000) },
  });
  assert.equal(created.status, 202);
  assert.match(created.headers.get('cache-control') ?? '', /private.*no-store/i);
  const result = await responseJson(created);
  assert.deepEqual(result.claim.resourceIds, [target.id]);
  const stored = await harness.store.get(`claim:${result.claim.id}`);
  assert.deepEqual(stored.resourceIds, [target.id]);
  assert.equal(stored.resources, undefined, 'legacy IDs do not cause the service to fetch and persist a raw URL');
  assert.equal(stored.title, undefined);
  assert.equal(stored.url, undefined);

  const ownerView = await responseJson(await api(harness, '/api/creador/perfil', 'creator-a'));
  assert.equal(ownerView.claims.length, 1);
  assert.equal(ownerView.claims[0].evidence, 'e'.repeat(2000));
  assert.deepEqual(ownerView.claims[0].resourceIds, [target.id]);
  const ownerJson = JSON.stringify(ownerView);
  assert.equal(ownerJson.includes(target.title), false);
  assert.equal(ownerJson.includes(target.url), false, 'legacy IDs do not gain raw URLs in owner history');
  const otherView = await responseJson(await api(harness, '/api/creador/perfil', 'creator-b'));
  assert.deepEqual(otherView.claims, [], 'evidence is private to the request owner');
  const publicPage = await harness.service.readPublicProfile('claim-legacy-owner');
  assert.equal(publicPage.status, 200);
  const publicJson = JSON.stringify(publicPage);
  assert.equal(publicJson.includes('e'.repeat(2000)), false, 'claim evidence stays out of public output');
  assert.equal(publicJson.includes(target.title), false);
  assert.equal(publicJson.includes(target.url), false);

  const adminView = await responseJson(await api(harness, ADMIN_CLAIMS_PATH, 'admin'));
  assert.equal(adminView.claims.length, 1);
  assert.deepEqual(adminView.claims[0].resourceIds, [target.id]);
  assert.equal(adminView.claims[0].evidence, 'e'.repeat(2000));
  assert.equal(adminView.claims[0].sourceId, 'same-source');
  const adminClaimJson = JSON.stringify(adminView.claims[0]);
  assert.equal(adminClaimJson.includes(target.title), false);
  assert.equal(adminClaimJson.includes(target.url), false, 'legacy IDs do not gain raw URLs in admin history');
  if (adminView.claims[0].resources !== undefined) {
    assert.deepEqual(adminView.claims[0].resources, [],
      'optional admin URL context stays empty for legacy IDs that had no submitted URL');
  }
  assert.equal((await harness.store.get(`resource:${sibling.id}`)).editorProfileId, undefined,
    'a shared sourceId is descriptive and never expands the exact ID selection');
  assert.equal((await harness.store.get(`profile:${owner.id}`)).version, profileBeforeClaim.version,
    'claim creation leaves the already-published profile version unchanged');

  const forbiddenAdminRead = await api(harness, ADMIN_CLAIMS_PATH, 'creator-a');
  assert.equal(forbiddenAdminRead.status, 403);
});

test('colon and long catalog IDs survive exact partial admin resolution without inferring siblings from sourceId', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness, 'creator-a', 'claim-colon-owner');
  const first = resource('import:catalog:event', 'https://catalog.example/imported-event', { sourceId: 'same-source' });
  const secondId = `r${'x'.repeat(128)}`;
  const second = resource(secondId, 'https://catalog.example/long-id', { sourceId: 'same-source' });
  const sibling = resource('source-sibling', 'https://catalog.example/source-sibling', { sourceId: 'same-source' });
  await seedResource(harness.store, first);
  await seedResource(harness.store, second);
  await seedResource(harness.store, sibling);

  const request = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST',
    body: {
      resourceIds: [first.id, second.id],
      sourceId: 'same-source',
      evidence: 'evidencia privada',
    },
  });
  assert.equal(request.status, 202);
  const created = await responseJson(request);
  assert.deepEqual(created.claim.resourceIds, [first.id, second.id]);

  const nonAdminLink = await api(harness, ADMIN_LINK_PATH, 'creator-a', {
    method: 'POST', body: { accountId: 'private-account-a', resourceIds: [first.id] },
  });
  assert.equal(nonAdminLink.status, 403);

  const pending = await responseJson(await api(harness, ADMIN_CLAIMS_PATH, 'admin'));
  assert.equal(pending.claims[0].status, 'pending');
  assert.deepEqual(pending.claims[0].resourceIds, [first.id, second.id]);
  assert.equal(pending.claims[0].evidence, 'evidencia privada');
  const storedClaim = await harness.store.get(`claim:${created.claim.id}`);
  assert.equal(storedClaim.resources, undefined, 'legacy IDs are not enriched with URLs during claim creation');
  if (pending.claims[0].resources !== undefined) {
    assert.deepEqual(pending.claims[0].resources, []);
  }

  const firstLink = await api(harness, ADMIN_LINK_PATH, 'admin', {
    method: 'POST',
    body: { accountId: 'private-account-a', sourceId: 'same-source', resourceIds: [first.id] },
  });
  assert.equal(firstLink.status, 200);
  const partial = await responseJson(await api(harness, ADMIN_CLAIMS_PATH, 'admin'));
  assert.equal(partial.claims[0].status, 'partial');
  assert.deepEqual(partial.claims[0].resourceIds, [first.id, second.id]);
  assert.equal((await harness.store.get(`resource:${first.id}`)).editorProfileId, profile.id);
  assert.equal((await harness.store.get(`resource:${second.id}`)).editorProfileId, undefined);
  assert.equal((await harness.store.get(`resource:${sibling.id}`)).editorProfileId, undefined);

  const secondLink = await api(harness, ADMIN_LINK_PATH, 'admin', {
    method: 'POST',
    body: { accountId: 'private-account-a', sourceId: 'same-source', resourceIds: [second.id] },
  });
  assert.equal(secondLink.status, 200);
  const resolved = await responseJson(await api(harness, ADMIN_CLAIMS_PATH, 'admin'));
  assert.equal(resolved.claims[0].status, 'resolved');
  assert.deepEqual(resolved.claims[0].resourceIds, [first.id, second.id]);
  if (resolved.claims[0].resources !== undefined) {
    assert.deepEqual(resolved.claims[0].resources, [],
      'admin state updates do not reconstruct raw URLs for a legacy claim');
  }
  assert.equal((await harness.store.get(`resource:${second.id}`)).editorProfileId, profile.id);
  assert.equal((await harness.store.get(`resource:${sibling.id}`)).editorProfileId, undefined);

  const ownerEdit = await api(harness, `/api/creador/recursos/${encodeURIComponent(second.id)}`, 'creator-a', {
    method: 'PATCH', body: { title: 'La autorización llegó sólo tras la resolución exacta' },
  });
  assert.equal(ownerEdit.status, 200);
});

test('admin linking rechecks current ownership and does not grant a stale pending request', async () => {
  const harness = await createCreatorPagesHarness();
  const owner = await createProfile(harness, 'creator-a', 'claim-observed-owner');
  const other = await createProfile(harness, 'creator-b', 'claim-observed-other');
  const target = resource('claim-current-owner-check', 'https://catalog.example/current-owner-check');
  await seedResource(harness.store, target);
  const requested = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST', body: { resources: [{ resourceId: target.id, url: target.url }] },
  });
  assert.equal(requested.status, 202);

  const current = await harness.store.get(`resource:${target.id}`);
  await harness.store.transact({
    checks: [{ key: `resource:${target.id}`, version: current.version }],
    puts: [{ key: `resource:${target.id}`, value: {
      ...current,
      directoryControl: 'creator',
      editorProfileId: other.id,
      autoSync: false,
      version: current.version + 1,
    } }],
  });
  const targetBeforeAdmin = await harness.store.get(`resource:${target.id}`);
  const profileBeforeAdmin = await harness.store.get(`profile:${owner.id}`);
  const rejected = await api(harness, ADMIN_LINK_PATH, 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', resourceIds: [target.id] },
  });
  assert.equal(rejected.status, 409, 'admin approval validates the resource state at resolution time');
  assert.deepEqual(await harness.store.get(`resource:${target.id}`), targetBeforeAdmin);
  assert.deepEqual(await harness.store.get(`profile:${owner.id}`), profileBeforeAdmin);
  const claims = await responseJson(await api(harness, ADMIN_CLAIMS_PATH, 'admin'));
  assert.equal(claims.claims[0].status, 'pending');
  assert.equal(claims.claims[0].profileId, owner.id);
  assert.equal((await harness.store.get(`resource:${target.id}`)).editorProfileId, other.id);
});

test('51 targets fit the existing two-action claim transaction and expanded physical rows fail before writing', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness, 'creator-a', 'claim-volume');
  const targets = [];
  for (let index = 0; index < 51; index += 1) {
    const item = resource(`claim-volume-${index}`, `https://catalog.example/claim-volume/${index}`);
    await seedResource(harness.store, item);
    targets.push(item);
  }

  const callIndex = harness.store.calls.length;
  const response = await api(harness, CLAIMS_PATH, 'creator-a', {
    method: 'POST',
    body: { resources: targets.map(({ id, url }) => ({ resourceId: id, url })) },
  });
  assert.equal(response.status, 202, 'there is no product limit of 50 requested resources');
  const created = await responseJson(response);
  assert.equal(created.claim.resourceIds.length, 51);
  const writes = claimWritesSince(harness, callIndex);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].input.puts.length, 2, 'claim creation does not use one transaction action per target');
  assert.deepEqual(writes[0].input.checks.map(({ key }) => key).sort(), [
    `claim:${created.claim.id}`,
    `claim-ref:${profile.id}:${created.claim.id}`,
  ].sort(), 'there are no per-resource or per-reservation CAS checks');
  assert.deepEqual(await harness.store.list(`placement:${profile.id}:`), []);
  assert.deepEqual(await harness.store.list(`editor:${profile.id}:`), []);

  const oversizedHarness = await createCreatorPagesHarness();
  const oversizedProfile = await createProfile(oversizedHarness, 'creator-a', 'claim-expanded-size');
  const expandedTargets = [];
  for (let index = 0; index < 220; index += 1) {
    const id = `large-${String(index).padStart(3, '0')}-${'x'.repeat(1890)}`;
    assert.equal(Buffer.byteLength(id, 'utf8'), 1900, 'IDs stay below DynamoDB key limits');
    const item = resource(id, `https://catalog.example/expanded/${index}`);
    await seedResource(oversizedHarness.store, item);
    expandedTargets.push(item);
  }
  const body = { resources: expandedTargets.map(({ url }) => ({ url })) };
  assert.ok(Buffer.byteLength(JSON.stringify(body), 'utf8') < 32 * 1024,
    'URL-only request body remains within the HTTP limit while expansion exceeds 400 KiB');
  const expandedCallIndex = oversizedHarness.store.calls.length;
  const tooLarge = await api(oversizedHarness, CLAIMS_PATH, 'creator-a', { method: 'POST', body });
  assert.equal(tooLarge.status, 422, 'the expanded claim row is rejected before the transaction');
  await assertNoClaimCreated(oversizedHarness, oversizedProfile.id, expandedCallIndex);
});

test('new-mode field limits and storage failures preserve request, atomicity, receipt, and no-grant behavior', async (t) => {
  await t.test('URL length 2048 and evidence length 2000 are accepted; unsafe and overlong URLs are rejected', async () => {
    const harness = await createCreatorPagesHarness();
    const profile = await createProfile(harness, 'creator-a', 'claim-field-limits');
    const prefix = 'https://claim.example/';
    const maximumUrl = prefix + 'x'.repeat(2048 - Buffer.byteLength(prefix));
    const maximum = resource('claim-max-url', maximumUrl);
    const evidenceTarget = resource('claim-max-evidence', 'https://claim.example/evidence');
    await seedResource(harness.store, maximum);
    await seedResource(harness.store, evidenceTarget);

    const acceptedUrl = await api(harness, CLAIMS_PATH, 'creator-a', {
      method: 'POST', body: { resources: [{ resourceId: maximum.id, url: maximumUrl }] },
    });
    assert.equal(acceptedUrl.status, 202, 'the exact URL byte/character boundary remains valid');

    const acceptedEvidence = await api(harness, CLAIMS_PATH, 'creator-a', {
      method: 'POST', body: { resources: [{ resourceId: evidenceTarget.id, url: evidenceTarget.url }], evidence: 'e'.repeat(2000) },
    });
    assert.equal(acceptedEvidence.status, 202, 'evidence at its existing 2000 character limit remains valid');

    for (const url of [
      `${prefix}${'x'.repeat(2048 - prefix.length + 1)}`,
      'https://user:password@claim.example/unsafe',
      'javascript:alert(1)',
      ' https://claim.example/outer-space',
      'https://claim.example/control\ncharacter',
    ]) {
      const callIndex = harness.store.calls.length;
      const response = await api(harness, CLAIMS_PATH, 'creator-a', {
        method: 'POST', body: { resources: [{ url }] },
      });
      assert.equal(response.status, 422, `unsafe or overlong URL is rejected: ${JSON.stringify(url.slice(0, 80))}`);
      assert.equal(claimWritesSince(harness, callIndex).length, 0);
    }

    const tooMuchEvidence = await api(harness, CLAIMS_PATH, 'creator-a', {
      method: 'POST', body: { resources: [{ resourceId: evidenceTarget.id, url: evidenceTarget.url }], evidence: 'e'.repeat(2001) },
    });
    assert.equal(tooMuchEvidence.status, 422);
    assert.equal((await harness.store.list(`claim-ref:${profile.id}:`)).length, 2,
      'rejected values do not add owner references');

    const oversizedBody = await api(harness, CLAIMS_PATH, 'creator-a', {
      method: 'POST', body: { resources: [{ url: `${prefix}${'x'.repeat(32 * 1024)}` }] },
    });
    assert.equal(oversizedBody.status, 413, 'the shared HTTP parser rejects bodies larger than 32 KiB');
  });

  await t.test('storage failure and conditional false leave no half claim or owner reference', async () => {
    for (const failure of ['throws', 'conditional-false']) {
      const harness = await createCreatorPagesHarness();
      const profile = await createProfile(harness, 'creator-a', `claim-atomic-${failure}`);
      const target = resource(`claim-atomic-target-${failure}`, `https://claim.example/atomic/${failure}`);
      await seedResource(harness.store, target);
      const start = harness.store.calls.length;
      if (failure === 'throws') {
        harness.store.failNext('transact', new Error('injected claim write failure'));
      } else {
        const transact = harness.store.transact.bind(harness.store);
        harness.store.transact = async (input) => input.puts?.some(({ key }) => key.startsWith('claim:'))
          ? transact({
            ...input,
            checks: [...input.checks, { key: 'profile:forced-conditional-failure', version: 1 }],
          })
          : transact(input);
      }
      const response = await api(harness, CLAIMS_PATH, 'creator-a', {
        method: 'POST', body: { resources: [{ resourceId: target.id, url: target.url }] },
      });
      assert.equal(response.status, failure === 'throws' ? 503 : 409);
      assert.equal((await claimRows(harness)).length, 0);
      assert.equal((await claimRefRows(harness, profile.id)).length, 0);
      assert.equal(claimWritesSince(harness, start).length, 1,
        'the only attempted mutation is one transaction containing claim and ref together');
      assert.deepEqual(await harness.store.list(`placement:${profile.id}:`), []);
      assert.deepEqual(await harness.store.list(`editor:${profile.id}:`), []);
      const edit = await api(harness, `/api/creador/recursos/${target.id}`, 'creator-a', {
        method: 'PATCH', body: { title: 'El fallo de guardado no concede autoridad' },
      });
      assert.equal(edit.status, 403, 'a failed atomic claim write grants no edit authority');
    }
  });

  await t.test('a lost transaction receipt is uncertain and success never implies edit authority', async () => {
    const harness = await createCreatorPagesHarness();
    const profile = await createProfile(harness, 'creator-a', 'claim-lost-receipt');
    const target = resource('claim-lost-receipt-target', 'https://claim.example/lost-receipt');
    await seedResource(harness.store, target);
    assert.equal((await harness.store.get(`resource:${target.id}`)).id, target.id);
    const transact = harness.store.transact.bind(harness.store);
    harness.store.transact = async (input) => {
      const result = await transact(input);
      if (input.puts?.some(({ key }) => key.startsWith('claim:'))) {
        throw new Error('simulated lost storage receipt after atomic commit');
      }
      return result;
    };

    const uncertain = await api(harness, CLAIMS_PATH, 'creator-a', {
      method: 'POST', body: { resources: [{ resourceId: target.id, url: target.url }] },
    });
    assert.equal(uncertain.status, 503, 'a lost receipt does not claim that the transaction was absent');
    const claims = await claimRows(harness);
    const refs = await claimRefRows(harness, profile.id);
    assert.equal(claims.length, 1);
    assert.equal(refs.length, 1, 'the uncertain result still contains both sides of the transaction');
    assert.equal(claims[0].value.profileId, profile.id);
    assert.deepEqual(claims[0].value.resourceIds, [target.id]);
    assert.deepEqual(claims[0].value.resources, [{ resourceId: target.id, url: target.url }]);
    assert.deepEqual(await harness.store.list(`placement:${profile.id}:`), []);
    assert.deepEqual(await harness.store.list(`editor:${profile.id}:`), []);

    const edit = await api(harness, `/api/creador/recursos/${target.id}`, 'creator-a', {
      method: 'PATCH', body: { title: 'No hay grant tras la solicitud ni el recibo perdido' },
    });
    assert.equal(edit.status, 403, 'a known catalog resource remains forbidden until exact admin linking');
  });
});

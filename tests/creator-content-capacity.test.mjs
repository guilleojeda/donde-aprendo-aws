import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { dynamoDbItemSize } from '../src/lib/creator-dynamodb-size.mjs';
import { creatorPageSessionBinding } from '../src/lib/creator-session-context.mjs';
import {
  CREATOR_ACCOUNT_ID,
  CREATOR_PROFILE_ID,
  createCreatorContentHarness,
  creatorRequest,
  defaultState,
} from './fixtures/creator-content.mjs';
import { apiRequest, requestContextForTestPrincipal, sessionCsrf, SITE_ORIGIN } from './fixtures/creator-pages.mjs';
import { createPhotoObjects, loadCreatorPhotosModule, rasterPhotoFixtures } from './fixtures/creator-photos.mjs';
import { createCreatorHttpHandler } from '../src/lib/creator-http.mjs';

const CONTENT_LIMIT = 384 * 1024;
const ITEM_LIMIT = 400 * 1024;
const SERIES_COUNT = 240;
const SERIES_DESCRIPTION_LIMIT = 2000;
const FIXED_TIMESTAMP = Date.UTC(2026, 10, 14);
const CREATOR_KEY = `profile:${CREATOR_PROFILE_ID}`;
const SERIES_TO_REMOVE = 'series-000';

const utf8Bytes = (value) => Buffer.byteLength(value, 'utf8');
const stringValueBytes = (value) => utf8Bytes(value);
const stringAttributeBytes = (name, value) => utf8Bytes(name) + stringValueBytes(value);
const booleanAttributeBytes = (name) => utf8Bytes(name) + 1;

// DynamoDB documents numeric size as approximately one byte plus one byte per
// two significant digits. This local reference only needs the small integer
// and timestamp values in these concrete fixtures.
function numberAttributeBytes(name, value) {
  assert.ok(Number.isSafeInteger(value));
  const significantDigits = String(value).replace(/^0+/u, '').replace(/0+$/u, '') || '1';
  return utf8Bytes(name) + 1 + Math.ceil(significantDigits.length / 2);
}

function stringListValueBytes(values) {
  return 3 + values.reduce((size, value) => size + 1 + stringValueBytes(value), 0);
}

function mapValueBytes(entries) {
  return 3 + entries.reduce((size, [key, valueBytes]) =>
    size + utf8Bytes(key) + 1 + valueBytes, 0);
}

function mapAttributeBytes(name, entries) {
  return utf8Bytes(name) + mapValueBytes(entries);
}

function seriesValueBytes(series) {
  return mapValueBytes([
    ['name', stringValueBytes(series.name)],
    ['slug', stringValueBytes(series.slug)],
    ['description', stringValueBytes(series.description)],
    ['chapters', stringListValueBytes(series.chapters)],
    ['createdAt', numberAttributeBytes('', series.createdAt)],
    ['updatedAt', numberAttributeBytes('', series.updatedAt)],
  ]);
}

function placementValueBytes(placement) {
  return mapValueBytes([
    ['resourceId', stringValueBytes(placement.resourceId)],
    ['selectedForDirectory', 1],
  ]);
}

function referenceItemBytes(state, { contentOnly }) {
  const allowedRootFields = [
    'recordType', 'schemaVersion', 'id', 'version', 'displayName', 'slug', 'programs', 'socials',
    'published', 'hidden', 'createdAt', 'updatedAt', 'placements', 'order', 'series',
    ...(Object.hasOwn(state, 'photo') ? ['photo'] : []),
  ].sort();
  assert.deepEqual(Object.keys(state).sort(), allowedRootFields,
    'the reference covers the approved flat META fields in this fixture');

  const placementEntries = Object.entries(state.placements).map(([id, placement]) =>
    [id, placementValueBytes(placement)]);
  const seriesEntries = Object.entries(state.series).map(([id, series]) => [id, seriesValueBytes(series)]);
  const fields = [
    stringAttributeBytes('pk', `PROFILE#${state.id}`),
    stringAttributeBytes('sk', 'META'),
    stringAttributeBytes('recordType', state.recordType),
    numberAttributeBytes('schemaVersion', state.schemaVersion),
    stringAttributeBytes('id', state.id),
    stringAttributeBytes('displayName', state.displayName),
    stringAttributeBytes('slug', state.slug),
    utf8Bytes('programs') + stringListValueBytes(state.programs),
    mapAttributeBytes('socials', []),
    mapAttributeBytes('placements', placementEntries),
    mapAttributeBytes('order', [
      ['featured', stringListValueBytes(state.order.featured)],
      ['ordinary', stringListValueBytes(state.order.ordinary)],
    ]),
    mapAttributeBytes('series', seriesEntries),
    numberAttributeBytes('createdAt', state.createdAt),
  ];
  if (!contentOnly) {
    fields.push(
      numberAttributeBytes('version', state.version),
      booleanAttributeBytes('published'),
      booleanAttributeBytes('hidden'),
      numberAttributeBytes('updatedAt', state.updatedAt),
    );
    if (state.photo) {
      fields.push(mapAttributeBytes('photo', [
        ['version', stringValueBytes(String(state.photo.version))],
        ['url', stringValueBytes(state.photo.url)],
      ]));
    }
  }
  return fields.reduce((sum, bytes) => sum + bytes, 0);
}

test('local capacity byte reference counts nested map and list names once', () => {
  assert.equal(mapAttributeBytes('m', [['a', stringValueBytes('x')]]), 7,
    'a map attribute includes its own name, three-byte map overhead, key, member overhead, and value');
  assert.equal(utf8Bytes('l') + stringListValueBytes(['x']), 6,
    'a list attribute includes its own name, three-byte list overhead, member overhead, and value');
});

// This concrete reference covers only the test's flat META fields, string IDs,
// string lists, maps, booleans, small integer revisions, and numeric timestamps.
// The admission decision still comes from a real command through service.handle.
function creatorContentBytes(state) {
  return referenceItemBytes(state, { contentOnly: true });
}

function physicalBytes(state) {
  return referenceItemBytes(state, { contentOnly: false });
}

function assertReferenceMatchesGenericModel(state) {
  const image = { pk: `PROFILE#${state.id}`, sk: 'META', ...structuredClone(state) };
  assert.equal(physicalBytes(state), dynamoDbItemSize(image),
    'the local concrete reference agrees with the generic physical-size model');
  for (const field of ['version', 'hidden', 'published', 'updatedAt', 'photo']) delete image[field];
  assert.equal(creatorContentBytes(state), dynamoDbItemSize(image),
    'the local concrete reference and the generic model agree after the approved exclusions');
}

function stateAtContentBytes(targetBytes) {
  const series = Object.fromEntries(Array.from({ length: SERIES_COUNT }, (_, index) => {
    const suffix = String(index).padStart(3, '0');
    return [`series-${suffix}`, {
      name: `Serie ${suffix}`,
      slug: `serie-${suffix}`,
      description: '',
      chapters: [],
      createdAt: 1,
      updatedAt: 1,
    }];
  }));
  const state = defaultState({
    profile: { createdAt: 1, updatedAt: 1 },
    series,
  });
  let remaining = targetBytes - creatorContentBytes(state);
  assert.ok(remaining >= 0, 'the valid bounded fixture starts below its requested content size');
  assert.ok(remaining <= SERIES_COUNT * SERIES_DESCRIPTION_LIMIT,
    'bounded Series descriptions can represent the requested content size');

  for (const entry of Object.values(state.series)) {
    const length = Math.min(remaining, SERIES_DESCRIPTION_LIMIT);
    entry.description = 'x'.repeat(length);
    remaining -= length;
    if (remaining === 0) break;
  }

  assert.equal(remaining, 0, 'the fixture reaches the independently measured content size');
  assert.equal(creatorContentBytes(state), targetBytes);
  assertReferenceMatchesGenericModel(state);
  assert.ok(Object.entries(state.series).every(([id, entry]) => Buffer.byteLength(id, 'utf8') <= 128
    && Buffer.byteLength(entry.slug, 'utf8') <= 40
    && entry.name.length <= 120
    && entry.description.length <= SERIES_DESCRIPTION_LIMIT));
  assert.ok(physicalBytes(state) < ITEM_LIMIT,
    'the tested aggregate leaves the independent physical-item ceiling below 400 KiB');
  return state;
}

function stablePlacementId(profileId, resourceId) {
  const digest = createHash('sha256').update(JSON.stringify([profileId, resourceId])).digest('hex');
  return `placement-${digest}`;
}

function appendPlacement(state, resourceId) {
  const candidate = structuredClone(state);
  const id = stablePlacementId(state.id, resourceId);
  candidate.placements[id] = { resourceId, selectedForDirectory: true };
  candidate.order.ordinary.push(id);
  return candidate;
}

function catalogResource(id, url, overrides = {}) {
  return {
    id,
    title: `Recurso ${id}`,
    url,
    description: '',
    category: 'Serverless',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    order: 0,
    featured: false,
    version: 1,
    published: false,
    hidden: false,
    approvalRevoked: false,
    directoryControl: 'editorial',
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

async function addNewLink(harness, creatorVersion, url) {
  const response = await creatorRequest(harness, '/api/creador/enlaces/', {
    method: 'POST',
    body: { creatorVersion, title: 'Enlace de capacidad', url, description: 'Creado manualmente' },
  });
  return { response, body: await response.json() };
}

function resourceUrlReservationKey(url) {
  return `url:${createHash('sha256').update(url, 'utf8').digest('hex')}`;
}

test('384 KiB admission rejects atomically, then removal permits a manual growth command', async () => {
  const initialState = stateAtContentBytes(CONTENT_LIMIT - 1);
  assert.ok(creatorContentBytes(initialState) < CONTENT_LIMIT);

  const harness = await createCreatorContentHarness({ state: initialState });
  const url = 'https://capacity.example.invalid/first-attempt';
  const beforeResources = await harness.store.list('resource:');
  const beforeReservations = await harness.store.list('url:');
  const beforeReferences = await harness.store.list(`editor:${CREATOR_PROFILE_ID}:`);

  const rejected = await addNewLink(harness, initialState.version, url);
  assert.equal(rejected.response.status, 422, JSON.stringify(rejected.body));
  assert.equal(rejected.body.error, 'CREATOR_CONTENT_TOO_LARGE');
  assert.deepEqual(await harness.store.get(CREATOR_KEY), initialState,
    'the rejected candidate leaves the aggregate, order, and revision unchanged');
  assert.deepEqual(await harness.store.list('resource:'), beforeResources,
    'the rejected candidate creates no shared resource');
  assert.deepEqual(await harness.store.list('url:'), beforeReservations,
    'the rejected candidate reserves no URL');
  assert.deepEqual(await harness.store.list(`editor:${CREATOR_PROFILE_ID}:`), beforeReferences,
    'the rejected candidate creates no retained edit reference');

  const current = await harness.store.get(CREATOR_KEY);
  const removal = await creatorRequest(harness, `/api/creador/series/${SERIES_TO_REMOVE}`, {
    method: 'DELETE',
    body: { creatorVersion: current.version },
  });
  assert.equal(removal.status, 200, await removal.clone().text());
  const afterRemoval = await harness.store.get(CREATOR_KEY);
  assert.ok(creatorContentBytes(afterRemoval) < CONTENT_LIMIT - 1,
    'removing bounded Series content frees room in the same aggregate');

  const accepted = await addNewLink(harness, afterRemoval.version, url);
  assert.equal(accepted.response.status, 201, JSON.stringify(accepted.body));
  assert.equal(accepted.body.operation, 'add-link');
  assert.equal(accepted.body.disposition, 'resource-created');
  const committed = await harness.store.get(CREATOR_KEY);
  assert.ok(creatorContentBytes(committed) <= CONTENT_LIMIT);
  assert.equal(committed.version, afterRemoval.version + 1);
  const createdResources = await harness.store.list('resource:');
  assert.equal(createdResources.length, 1);
  assert.equal(createdResources[0].value.url, url,
    'the manual command after freeing room creates the resource for the original URL');
  assert.ok(await harness.store.get(resourceUrlReservationKey(url)));
});

test('many retained EDITOR references stay outside the quota while bounded content still grows', async () => {
  const retainedCount = 1000;
  const state = stateAtContentBytes(CONTENT_LIMIT - 2048);
  const harness = await createCreatorContentHarness({ state });
  const puts = [];
  for (let index = 0; index < retainedCount; index += 1) {
    const suffix = String(index).padStart(4, '0');
    const id = `retained-${suffix}`;
    puts.push(
      { key: `resource:${id}`, value: catalogResource(id, `https://retained.example.invalid/${suffix}`, {
        directoryControl: 'creator', editorProfileId: CREATOR_PROFILE_ID,
      }) },
      { key: `editor:${CREATOR_PROFILE_ID}:${id}`, value: {
        recordType: 'editorReference', profileId: CREATOR_PROFILE_ID, resourceId: id, version: 1,
      } },
    );
  }
  for (let offset = 0; offset < puts.length; offset += 100) {
    const batch = puts.slice(offset, offset + 100);
    assert.equal(await harness.store.transact({
      checks: batch.map(({ key }) => ({ key, version: null })),
      puts: batch,
    }), true, 'the generic fixture store seeds retained resources and references as prerequisites');
  }

  const accepted = await addNewLink(harness, state.version, 'https://capacity.example.invalid/with-retained-resources');
  assert.equal(accepted.response.status, 201, JSON.stringify(accepted.body));
  const committed = await harness.store.get(CREATOR_KEY);
  assert.ok(creatorContentBytes(committed) <= CONTENT_LIMIT,
    'the owner-content candidate fits even with 1,000 authorized retained references');
  const references = await harness.store.list(`editor:${CREATOR_PROFILE_ID}:`);
  const originalIds = puts.filter(({ value }) => value.recordType === 'editorReference').map(({ value }) => value.resourceId);
  assert.deepEqual(references.map(({ value }) => value.resourceId).sort(),
    [...originalIds, accepted.body.resourceId].sort(), 'the owned Add keeps all retained references and adds its own');

  const read = await creatorRequest(harness, '/api/creador/perfil/');
  assert.equal(read.status, 200, await read.clone().text());
  const snapshot = await read.json();
  assert.equal(snapshot.resources.filter(({ metadataEditable }) => metadataEditable).length, retainedCount + 1,
    'the full owner read still projects retained resources independently of aggregate admission');
  assert.ok(snapshot.resources.every(({ metadataEditable, reincludeAllowed }) =>
    typeof metadataEditable === 'boolean' && typeof reincludeAllowed === 'boolean'),
  'the owner DTO retains both server-projected resource permissions');
});

test('moderation, photo finalization, and creator revisions remain usable at exactly 384 KiB', async () => {
  const initialState = stateAtContentBytes(CONTENT_LIMIT);
  assert.equal(creatorContentBytes(initialState), CONTENT_LIMIT);
  assert.ok(physicalBytes(initialState) <= ITEM_LIMIT,
    'the actual META image remains below the separate physical 400 KiB ceiling');
  const harness = await createCreatorContentHarness({ state: initialState });

  const moderated = await creatorRequest(harness, `/api/admin/perfiles/${CREATOR_PROFILE_ID}/ocultar`, {
    session: 'admin',
    method: 'POST',
    body: { version: initialState.version },
    creatorContract: null,
  });
  assert.equal(moderated.status, 200, await moderated.clone().text());
  const moderationBody = await moderated.json();
  assert.equal(moderationBody.profile.hidden, true);
  assert.equal(moderationBody.profile.version, initialState.version + 1);

  const afterModeration = await harness.store.get(CREATOR_KEY);
  assert.equal(creatorContentBytes(afterModeration), CONTENT_LIMIT,
    'moderation changes only bounded system state excluded from content admission');
  assertReferenceMatchesGenericModel(afterModeration);
  assert.ok(physicalBytes(afterModeration) <= ITEM_LIMIT);

  const photoModule = await loadCreatorPhotosModule();
  const objects = createPhotoObjects();
  const photos = photoModule.createCreatorPhotoService({
    store: harness.store,
    objects,
    signPost: async ({ key }) => ({ url: 'https://photos.example.invalid/', fields: { key, policy: 'capacity-photo' } }),
    now: () => FIXED_TIMESTAMP,
    createId: () => 'capacity-photo-upload',
  });
  const principal = {
    state: 'authenticated',
    accountId: CREATOR_ACCOUNT_ID,
    csrfToken: sessionCsrf['creator-a'],
    isAdmin: false,
  };
  const http = createCreatorHttpHandler({
    service: harness.service,
    photos,
    auth: { getRequestContext: async () => requestContextForTestPrincipal(principal) },
    store: harness.store,
    origin: SITE_ORIGIN,
  });
  const binding = creatorPageSessionBinding(principal);
  const authorize = await http(apiRequest('/api/creador/foto/autorizar', {
    session: 'creator-a',
    method: 'POST',
    csrf: principal.csrfToken,
    body: { creatorVersion: afterModeration.version },
    extraHeaders: { 'x-creator-page-binding': binding, 'x-creator-contract': '2' },
  }));
  assert.equal(authorize.status, 200, await authorize.clone().text());
  const authorization = await authorize.json();
  assert.equal(typeof authorization.uploadId, 'string');
  assert.equal(typeof authorization.post?.fields?.key, 'string');

  const { jpeg } = await rasterPhotoFixtures();
  objects.seed(authorization.post.fields.key, jpeg);
  const finalized = await http(apiRequest('/api/creador/foto/finalizar', {
    session: 'creator-a',
    method: 'POST',
    csrf: principal.csrfToken,
    body: { creatorVersion: afterModeration.version, uploadId: authorization.uploadId },
    extraHeaders: { 'x-creator-page-binding': binding, 'x-creator-contract': '2' },
  }));
  assert.equal(finalized.status, 200, await finalized.clone().text());

  const afterPhoto = await harness.store.get(CREATOR_KEY);
  assert.equal(afterPhoto.version, afterModeration.version + 1,
    'photo selection advances the same creator revision once');
  assert.equal(afterPhoto.hidden, true, 'photo finalization preserves the prior moderation field');
  assert.equal(afterPhoto.photo?.version, authorization.uploadId);
  assert.equal(creatorContentBytes(afterPhoto), CONTENT_LIMIT,
    'bounded photo/version system changes do not consume creator-content quota');
  assertReferenceMatchesGenericModel(afterPhoto);
  assert.ok(physicalBytes(afterPhoto) <= ITEM_LIMIT,
    'the real service writes the candidate only while it remains below the full item limit');
});

test('an admin grant commits only the fitting prefix and manual continuations preserve truthful claim progress', async () => {
  const resourceA = 'grant-aa';
  const resourceB = 'grant-bb';
  const emptyContent = defaultState();
  const withA = appendPlacement(emptyContent, resourceA);
  const withAB = appendPlacement(withA, resourceB);
  const growthForA = creatorContentBytes(withA) - creatorContentBytes(emptyContent);
  const growthForB = creatorContentBytes(withAB) - creatorContentBytes(withA);
  assert.ok(growthForA > 0 && growthForB > 0);
  const initialState = stateAtContentBytes(CONTENT_LIMIT - growthForA);
  const expectedA = appendPlacement(initialState, resourceA);
  const expectedAB = appendPlacement(expectedA, resourceB);
  assert.equal(creatorContentBytes(expectedA), CONTENT_LIMIT,
    'independent candidate construction puts the first valid grant exactly at the inclusive quota');
  assert.ok(creatorContentBytes(expectedAB) > CONTENT_LIMIT,
    'the second valid placement crosses the quota after the first commits');

  const urlA = 'https://catalog.example.invalid/grant-aa';
  const urlB = 'https://catalog.example.invalid/grant-bb';
  const resourceRecordA = catalogResource(resourceA, urlA);
  const resourceRecordB = catalogResource(resourceB, urlB);
  const harness = await createCreatorContentHarness({
    state: initialState,
    resources: [resourceRecordA, resourceRecordB],
    claims: [{
      recordType: 'claim',
      id: 'capacity-grant-claim',
      accountId: CREATOR_ACCOUNT_ID,
      resourceIds: [resourceA, resourceB],
      status: 'pending',
      version: 1,
      createdAt: FIXED_TIMESTAMP,
    }],
  });

  async function grant(resourceIds) {
    const response = await creatorRequest(harness, '/api/admin/reclamaciones/vincular', {
      session: 'admin',
      method: 'POST',
      body: { accountId: CREATOR_ACCOUNT_ID, resourceIds },
      creatorContract: null,
    });
    return { response, body: await response.json() };
  }

  const failed = await grant([resourceA, resourceB]);
  assert.equal(failed.response.status, 422, JSON.stringify(failed.body));
  assert.equal(failed.body.error, 'CREATOR_CONTENT_TOO_LARGE');
  assert.deepEqual(failed.body.linkedResourceIds, [resourceA],
    'the partial result identifies only the successfully committed resource');

  let committed = await harness.store.get(CREATOR_KEY);
  assert.equal(creatorContentBytes(committed), CONTENT_LIMIT,
    'resource A remains in the aggregate at the inclusive content limit');
  assert.equal(Object.entries(committed.placements).filter(([, placement]) => placement.resourceId === resourceA).length, 1);
  assert.equal(Object.entries(committed.placements).filter(([, placement]) => placement.resourceId === resourceB).length, 0);
  const ownedA = await harness.store.get(`resource:${resourceA}`);
  assert.equal(ownedA.directoryControl, 'creator');
  assert.equal(ownedA.editorProfileId, CREATOR_PROFILE_ID);
  assert.ok(await harness.store.get(`editor:${CREATOR_PROFILE_ID}:${resourceA}`));
  assert.deepEqual(await harness.store.get(`resource:${resourceB}`), resourceRecordB,
    'resource B retains its original authority and metadata after quota failure');
  assert.equal(await harness.store.get(`editor:${CREATOR_PROFILE_ID}:${resourceB}`), null);
  let claim = await harness.store.get('claim:capacity-grant-claim');
  assert.equal(claim.status, 'pending',
    'the failed command leaves the independently updated claim status untouched');

  const repeatedA = await grant([resourceA]);
  assert.equal(repeatedA.response.status, 200, JSON.stringify(repeatedA.body));
  assert.deepEqual(repeatedA.body.linkedResourceIds, [resourceA]);
  claim = await harness.store.get('claim:capacity-grant-claim');
  assert.equal(claim.status, 'partial',
    'an explicit selection of the already-linked resource performs the normal claim-status update');
  committed = await harness.store.get(CREATOR_KEY);
  assert.equal(creatorContentBytes(committed), CONTENT_LIMIT,
    'confirming an already-linked resource consumes no additional aggregate capacity');

  for (const fields of [
    { title: 'Intento de duplicado', url: urlA },
    { resourceId: resourceA, resourceVersion: ownedA.version },
  ]) {
    const duplicate = await creatorRequest(harness, '/api/creador/enlaces/', {
      method: 'POST', body: { creatorVersion: committed.version, ...fields },
    });
    assert.equal(duplicate.status, 200, await duplicate.clone().text());
    assert.equal((await duplicate.json()).disposition, 'already-present');
    assert.deepEqual(await harness.store.get(CREATOR_KEY), committed,
      'repeat Add and reinclude remain no-ops at the exact quota');
  }

  const removed = await creatorRequest(harness, `/api/creador/series/${SERIES_TO_REMOVE}`, {
    method: 'DELETE',
    body: { creatorVersion: committed.version },
  });
  assert.equal(removed.status, 200, await removed.clone().text());
  const afterRemoval = await harness.store.get(CREATOR_KEY);
  assert.ok(creatorContentBytes(afterRemoval) < CONTENT_LIMIT - growthForB);

  const continued = await grant([resourceB]);
  assert.equal(continued.response.status, 200, JSON.stringify(continued.body));
  assert.deepEqual(continued.body.linkedResourceIds, [resourceB]);
  committed = await harness.store.get(CREATOR_KEY);
  assert.ok(creatorContentBytes(committed) <= CONTENT_LIMIT);
  assert.equal(Object.entries(committed.placements).filter(([, placement]) => placement.resourceId === resourceA).length, 1);
  assert.equal(Object.entries(committed.placements).filter(([, placement]) => placement.resourceId === resourceB).length, 1);
  const ownedB = await harness.store.get(`resource:${resourceB}`);
  assert.equal(ownedB.directoryControl, 'creator');
  assert.equal(ownedB.editorProfileId, CREATOR_PROFILE_ID);
  assert.ok(await harness.store.get(`editor:${CREATOR_PROFILE_ID}:${resourceB}`));
  claim = await harness.store.get('claim:capacity-grant-claim');
  assert.equal(claim.status, 'resolved');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, sessionCsrf } from './fixtures/creator-pages.mjs';
import { createDynamoMoveHarness, seedMoveProfile, seedMoveResource } from './fixtures/creator-link-move.mjs';
import { currentUrlCollision, currentUrlKey } from '../src/lib/catalog-url.mjs';

const CATALOG_TABLE = 'catalog-test';
const PROFILES_TABLE = 'profiles-test';
const PROFILE_ID = 'profile-move-a';
const PROFILE_SLUG = 'admission-boundary';
const ACCOUNT_ID = 'private-account-a';

async function request(harness, path, {
  method = 'GET', body, session = 'creator-a', creatorContract = '2',
} = {}) {
  const response = await callApi(harness, path, {
    method,
    session,
    csrf: sessionCsrf[session],
    creatorContract,
    ...(body === undefined ? {} : { body }),
  });
  return {
    response,
    body: response.status === 204 ? null : await response.json(),
  };
}

async function owner(harness) {
  const result = await request(harness, '/api/creador/perfil');
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.schemaVersion, 2);
  return result.body;
}

function seedProfile(harness, { published = true } = {}) {
  seedMoveProfile(harness.mock, {
    accountId: ACCOUNT_ID,
    profileId: PROFILE_ID,
    slug: PROFILE_SLUG,
    published,
  });
}

function resourceFields(id, url, overrides = {}) {
  return {
    id,
    title: `Admitted ${id}`,
    url,
    description: 'Descripción que puede leer el propietario.',
    published: true,
    hidden: false,
    directoryControl: 'editorial',
    version: 1,
    ...overrides,
  };
}

async function seedResourceWithFields(harness, id, url, overrides = {}) {
  seedMoveResource(harness.mock, resourceFields(id, url, overrides));
}

function editorPhysicalKey(profileId, resourceId) {
  return { pk: `PROFILE#${profileId}`, sk: `EDITOR#${resourceId}` };
}

async function addByUrl(harness, { title, url, creatorVersion }) {
  return request(harness, '/api/creador/enlaces', {
    method: 'POST',
    body: { title, url, creatorVersion },
  });
}

async function reference(harness, { resourceId, url, creatorVersion }) {
  return request(harness, '/api/creador/referencias', {
    method: 'POST',
    body: { resourceId, url, creatorVersion },
  });
}

async function grant(harness, resourceIds) {
  const ids = Array.isArray(resourceIds) ? resourceIds : [resourceIds];
  return request(harness, '/api/admin/reclamaciones/vincular', {
    method: 'POST',
    session: 'admin',
    creatorContract: undefined,
    body: { accountId: ACCOUNT_ID, resourceIds: ids },
  });
}

function assertAdmissionFailure(result, label) {
  assert.equal(result.response.status, 503, `${label}: ${JSON.stringify(result.body)}`);
  assert.ok(['INVALID_RESOURCE', 'SERVICE_UNAVAILABLE'].includes(result.body.error),
    `${label}: malformed durable resource should fail as unavailable, not acknowledge a placement`);
}

test('a valid unlisted exact-ID resource is attachable through HTTP and remains readable by owner and public profile', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  seedProfile(harness);
  const resourceId = 'legacy.unlisted.exact';
  const url = 'https://catalog.example/admission-unlisted';
  await seedResourceWithFields(harness, resourceId, url, {
    published: false,
    title: 'Recurso legado no listado',
  });

  const before = await owner(harness);
  const added = await addByUrl(harness, {
    title: 'El título enviado no reemplaza la ficha existente',
    url,
    creatorVersion: before.creatorVersion,
  });
  assert.equal(added.response.status, 201, JSON.stringify(added.body));
  assert.equal(added.body.disposition, 'resource-reused');
  assert.equal(added.body.resourceId, resourceId,
    'the existing exact catalog identity is preserved when attaching by URL');

  const after = await owner(harness);
  const ownerResource = after.resources.find(({ id }) => id === resourceId);
  assert.deepEqual(ownerResource, {
    id: resourceId,
    version: 1,
    title: 'Recurso legado no listado',
    url,
    description: 'Descripción que puede leer el propietario.',
    hidden: false,
    directoryApproval: 'pending',
    metadataEditable: false,
    reincludeAllowed: false,
  });
  const placement = Object.values(after.placements).find(({ resourceId: id }) => id === resourceId);
  assert.deepEqual(placement, { resourceId, selectedForDirectory: true });

  const publicPage = await harness.service.readPublicProfile(PROFILE_SLUG);
  assert.equal(publicPage.status, 200);
  assert.deepEqual(publicPage.links.find(({ resourceId: id }) => id === resourceId), {
    placementId: added.body.placementId,
    resourceId,
    title: 'Recurso legado no listado',
    url,
    description: 'Descripción que puede leer el propietario.',
    featured: false,
    position: 1,
    selectedForDirectory: true,
    series: [],
    directoryApproval: 'pending',
    resourceVersion: 1,
  });
});

const malformedAdmissionCases = [
  {
    name: 'add-by-URL attach',
    async setup(harness, resourceId, url) {
      await seedResourceWithFields(harness, resourceId, url, { description: { invalid: true } });
    },
    async invoke(harness, _resourceId, url, creatorVersion) {
      return addByUrl(harness, { title: 'No debe crear una colocación', url, creatorVersion });
    },
  },
  {
    name: 'ID-plus-URL reference',
    async setup(harness, resourceId, url) {
      await seedResourceWithFields(harness, resourceId, url, { description: { invalid: true } });
    },
    async invoke(harness, resourceId, url, creatorVersion) {
      return reference(harness, { resourceId, url, creatorVersion });
    },
  },
  {
    name: 'exact-ID reinclude',
    expectedOwnerStatus: 503,
    async setup(harness, resourceId, url) {
      await seedResourceWithFields(harness, resourceId, url, {
        description: { invalid: true },
        directoryControl: 'creator',
        editorProfileId: PROFILE_ID,
      });
      harness.mock.seed(PROFILES_TABLE, {
        ...editorPhysicalKey(PROFILE_ID, resourceId),
        recordType: 'editorReference',
        profileId: PROFILE_ID,
        resourceId,
        version: 1,
      });
    },
    async invoke(harness, resourceId, _url, creatorVersion) {
      return request(harness, '/api/creador/enlaces', {
        method: 'POST',
        body: { resourceId, resourceVersion: 1, creatorVersion },
      });
    },
  },
  {
    name: 'administrative grant',
    async setup(harness, resourceId, url) {
      await seedResourceWithFields(harness, resourceId, url, { description: { invalid: true } });
    },
    async invoke(harness, resourceId) {
      return grant(harness, resourceId);
    },
  },
];

for (const scenario of malformedAdmissionCases) {
  test(`${scenario.name} rejects a malformed durable resource before promising a readable placement`, async () => {
    const harness = await createDynamoMoveHarness({ projectionAware: true });
    seedProfile(harness);
    const resourceId = `legacy.admission.${scenario.name.replaceAll(/[^a-z]+/giu, '-')}`;
    const url = `https://catalog.example/admission/${encodeURIComponent(resourceId)}`;
    await scenario.setup(harness, resourceId, url);

    const before = scenario.expectedOwnerStatus === 503
      ? { creatorVersion: (await harness.store.get(`profile:${PROFILE_ID}`)).version }
      : await owner(harness);
    const stateBefore = {
      profile: await harness.store.get(`profile:${PROFILE_ID}`),
      resource: await harness.store.get(`resource:${resourceId}`),
      reservation: await harness.store.get(currentUrlKey(url)),
      editor: await harness.store.get(`editor:${PROFILE_ID}:${resourceId}`),
    };
    const callsBefore = harness.mock.transactions.length;
    const result = await scenario.invoke(harness, resourceId, url, before.creatorVersion);
    assertAdmissionFailure(result, scenario.name);

    const after = {
      profile: await harness.store.get(`profile:${PROFILE_ID}`),
      resource: await harness.store.get(`resource:${resourceId}`),
      reservation: await harness.store.get(currentUrlKey(url)),
      editor: await harness.store.get(`editor:${PROFILE_ID}:${resourceId}`),
    };
    assert.deepEqual(after.profile, stateBefore.profile,
      `${scenario.name} cannot advance the aggregate when the resource cannot be projected`);
    assert.deepEqual(after.resource, stateBefore.resource,
      `${scenario.name} leaves the malformed catalog row untouched`);
    assert.deepEqual(after.reservation, stateBefore.reservation,
      `${scenario.name} leaves the URL reservation untouched`);
    assert.deepEqual(after.editor, stateBefore.editor,
      `${scenario.name} cannot create or replace editor authority as a side effect`);
    assert.equal(harness.mock.transactions.slice(callsBefore)
      .some(({ input }) => input.TransactItems.some(({ Put, Delete }) => Put || Delete)), false,
    `${scenario.name} performs no write before durable admission`);

    const ownerAfter = await request(harness, '/api/creador/perfil');
    assert.equal(ownerAfter.response.status, scenario.expectedOwnerStatus ?? 200,
      `${scenario.name} does not create an unreadable placement`);
    if (ownerAfter.response.status === 200) {
      assert.deepEqual(ownerAfter.body.placements, {});
    }
    const publicAfter = await harness.service.readPublicProfile(PROFILE_SLUG);
    assert.equal(publicAfter.status, 200);
    assert.deepEqual(publicAfter.links, [],
      `${scenario.name} never leaves a placement that breaks public profile consumption`);
  });
}

for (const operation of ['add-by-URL', 'explicit reference']) {
  for (const coherence of ['coherent', 'incoherent']) {
    const article = coherence === 'incoherent' ? 'an' : 'a';
    test(`${operation} rejects ${article} ${coherence} revision-1 collision without exposing members or writing`, async () => {
      const harness = await createDynamoMoveHarness({ projectionAware: true });
      seedProfile(harness);
      const operationSlug = operation === 'explicit reference' ? 'explicit-reference' : 'add-by-url';
      const url = `https://catalog.example/admission/collision-${operationSlug}-${coherence}`;
      const firstId = `legacy.collision.${operationSlug}.${coherence}.first`;
      const secondId = `legacy.collision.${operationSlug}.${coherence}.second`;
      await seedResourceWithFields(harness, firstId, url, { title: 'Candidato privado uno' });
      await seedResourceWithFields(harness, secondId,
        coherence === 'coherent' ? url : `${url}-moved`, { title: 'Candidato privado dos' });
      // currentUrlCollision is the shared v1 shape: exact physical ID, literal
      // URL, status, distinct member IDs, and version 1.
      const collision = currentUrlCollision(url, [firstId, secondId]);
      assert.equal(collision.version, 1);
      harness.mock.seed(CATALOG_TABLE, collision);

      const before = await harness.store.get(`profile:${PROFILE_ID}`);
      const reservationBefore = await harness.store.get(currentUrlKey(url));
      const firstBefore = await harness.store.get(`resource:${firstId}`);
      const secondBefore = await harness.store.get(`resource:${secondId}`);
      const transactionsBefore = harness.mock.transactions.length;
      const result = operation === 'add-by-URL'
        ? await addByUrl(harness, { title: 'Borrador no debe ganar', url, creatorVersion: before.version })
        : await reference(harness, { resourceId: firstId, url, creatorVersion: before.version });

      const expected = coherence === 'coherent'
        ? { status: 409, error: 'URL_COLLISION' }
        : { status: 503, error: 'URL_INDEX_MISMATCH' };
      assert.equal(result.response.status, expected.status, JSON.stringify(result.body));
      assert.equal(result.body.error, expected.error);
      const responseText = JSON.stringify(result.body);
      assert.equal(responseText.includes(firstId), false, 'collision rejection does not disclose the first member ID');
      assert.equal(responseText.includes(secondId), false, 'collision rejection does not disclose the second member ID');
      assert.equal(responseText.includes('Candidato privado'), false, 'collision rejection does not disclose member titles');

      assert.deepEqual(await harness.store.get(`profile:${PROFILE_ID}`), before);
      assert.deepEqual(await harness.store.get(currentUrlKey(url)), reservationBefore);
      assert.deepEqual(await harness.store.get(`resource:${firstId}`), firstBefore);
      assert.deepEqual(await harness.store.get(`resource:${secondId}`), secondBefore);
      assert.equal(harness.mock.transactions.slice(transactionsBefore)
        .some(({ input }) => input.TransactItems.some(({ Put, Delete }) => Put || Delete)), false,
      'collision admission does not create a placement or rewrite catalog rows');
    });
  }
}

test('reference, Add-by-URL, and administrative grant no-op paths revalidate durable facts instead of confirming a broken existing placement', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  seedProfile(harness);
  const resourceId = 'legacy.admission.no-op';
  const url = 'https://catalog.example/admission/no-op';
  await seedResourceWithFields(harness, resourceId, url);

  const before = await owner(harness);
  const first = await reference(harness, { resourceId, url, creatorVersion: before.creatorVersion });
  assert.equal(first.response.status, 201, JSON.stringify(first.body));
  const attached = await owner(harness);
  const placementId = first.body.placementId;
  assert.equal(attached.placements[placementId].resourceId, resourceId);
  const firstGrant = await grant(harness, resourceId);
  assert.equal(firstGrant.response.status, 200, JSON.stringify(firstGrant.body));
  assert.equal((await owner(harness)).resources.find(({ id }) => id === resourceId).metadataEditable, true);

  const originalResource = await harness.store.get(`resource:${resourceId}`);
  harness.mock.seed(CATALOG_TABLE, {
    ...harness.mock.read(CATALOG_TABLE, { id: resourceId }),
    description: { invalid: true },
  });
  const stateBefore = {
    profile: await harness.store.get(`profile:${PROFILE_ID}`),
    resource: await harness.store.get(`resource:${resourceId}`),
    editor: await harness.store.get(`editor:${PROFILE_ID}:${resourceId}`),
  };
  assert.deepEqual(stateBefore.resource.description, { invalid: true });
  assert.equal(originalResource.description, 'Descripción que puede leer el propietario.');

  const noOpResults = [
    ['reference existing-placement no-op', await reference(harness, {
      resourceId, url, creatorVersion: stateBefore.profile.version,
    })],
    ['Add-by-URL existing-placement no-op', await addByUrl(harness, {
      title: 'Borrador ignorado', url, creatorVersion: stateBefore.profile.version,
    })],
    ['administrative grant no-op', await grant(harness, resourceId)],
  ];
  for (const [label, result] of noOpResults) assertAdmissionFailure(result, label);

  assert.deepEqual(await harness.store.get(`profile:${PROFILE_ID}`), stateBefore.profile);
  assert.deepEqual(await harness.store.get(`resource:${resourceId}`), stateBefore.resource);
  assert.deepEqual(await harness.store.get(`editor:${PROFILE_ID}:${resourceId}`), stateBefore.editor);
});

test('administrative grant validates every selected resource before writing the first one', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  seedProfile(harness);
  const validId = 'legacy.admission.grant-valid-first';
  const malformedId = 'legacy.admission.grant-malformed-second';
  const validUrl = 'https://catalog.example/admission/grant-valid-first';
  const malformedUrl = 'https://catalog.example/admission/grant-malformed-second';
  await seedResourceWithFields(harness, validId, validUrl);
  await seedResourceWithFields(harness, malformedId, malformedUrl, { description: { invalid: true } });
  const before = {
    profile: await harness.store.get(`profile:${PROFILE_ID}`),
    valid: await harness.store.get(`resource:${validId}`),
    malformed: await harness.store.get(`resource:${malformedId}`),
  };
  const transactionsBefore = harness.mock.transactions.length;

  const result = await grant(harness, [validId, malformedId]);
  assertAdmissionFailure(result, 'administrative grant with malformed second target');
  assert.deepEqual(await harness.store.get(`profile:${PROFILE_ID}`), before.profile);
  assert.deepEqual(await harness.store.get(`resource:${validId}`), before.valid);
  assert.deepEqual(await harness.store.get(`resource:${malformedId}`), before.malformed);
  assert.equal(await harness.store.get(`editor:${PROFILE_ID}:${validId}`), null);
  assert.equal(await harness.store.get(`editor:${PROFILE_ID}:${malformedId}`), null);
  assert.equal(harness.mock.transactions.slice(transactionsBefore)
    .some(({ input }) => input.TransactItems.some(({ Put, Delete }) => Put || Delete)), false,
  'a malformed later target cannot leave an earlier grant partially committed');
});

test('owner HTTP rejects a projected editor reference whose physical sort key disagrees with its payload identity', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  seedProfile(harness);
  const resourceId = 'legacy.physical.editor';
  const url = 'https://catalog.example/physical-editor';
  await seedResourceWithFields(harness, resourceId, url, {
    directoryControl: 'creator',
    editorProfileId: PROFILE_ID,
  });
  // The Query projection supplies the payload resourceId, but the physical SK
  // names a different resource. A logical fixture cannot represent this drift.
  harness.mock.seed(PROFILES_TABLE, {
    pk: `PROFILE#${PROFILE_ID}`,
    sk: 'EDITOR#different-physical-resource',
    recordType: 'editorReference',
    profileId: PROFILE_ID,
    resourceId,
    version: 1,
  });

  const ownerRead = await request(harness, '/api/creador/perfil');
  assert.equal(ownerRead.response.status, 503, JSON.stringify(ownerRead.body));
  assert.match(JSON.stringify(ownerRead.body), /SERVICE_UNAVAILABLE|INVALID_EDITOR_REFERENCE/u);

  const reinclude = await request(harness, '/api/creador/enlaces', {
    method: 'POST',
    body: { creatorVersion: 1, resourceId, resourceVersion: 1 },
  });
  assert.equal(reinclude.response.status, 403,
    'the exact write path must not accept authority that the physical reference does not prove');
  assert.equal(reinclude.body.error, 'RESOURCE_EDIT_FORBIDDEN');
  const profile = await harness.store.get(`profile:${PROFILE_ID}`);
  assert.deepEqual(profile.placements, {});
  assert.deepEqual(profile.order, { featured: [], ordinary: [] });
  const physicalEditor = harness.mock.read(PROFILES_TABLE, {
    pk: `PROFILE#${PROFILE_ID}`,
    sk: 'EDITOR#different-physical-resource',
  });
  assert.equal(physicalEditor.resourceId, resourceId);
  assert.equal(physicalEditor.sk, 'EDITOR#different-physical-resource');
});

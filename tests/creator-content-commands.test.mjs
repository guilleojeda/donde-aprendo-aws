import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  CREATOR_PROFILE_ID,
  createCreatorContentHarness,
  creatorRequest,
  defaultState,
  readCreatorSnapshot,
} from './fixtures/creator-content.mjs';
import { SITE_ORIGIN } from './fixtures/creator-pages.mjs';

const PROFILE_ID = CREATOR_PROFILE_ID;
// Existing deterministic identity for this profile/resource pair. Removal and
// reinclude must retain the real historical identity without a new tombstone.
const HIDDEN_PLACEMENT_ID = 'placement-2a85952bc6736fa3836d411a97ed8ed44c3b493567351b0b53e06faaee3ef683';

function resource(id, url, fields = {}) {
  return {
    id,
    title: `Title ${id}`,
    url,
    description: `Description ${id}`,
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
    createdAt: Date.UTC(2026, 10, 14),
    updatedAt: Date.UTC(2026, 10, 14),
    ...fields,
  };
}

function resourceEditPath(id) {
  const url = new URL('/api/creador/recursos/', SITE_ORIGIN);
  url.searchParams.set('id', id);
  return `${url.pathname}${url.search}`;
}

async function json(response) {
  return response.json();
}

async function command(harness, path, method, body, options = {}) {
  const response = await creatorRequest(harness, path, { method, body, ...options });
  return { response, body: await json(response) };
}

function assertAck(body, {
  operation,
  profileId = PROFILE_ID,
  disposition,
  targetIds = {},
}) {
  assert.equal(body.schemaVersion, 2);
  assert.equal(body.operation, operation);
  assert.equal(body.profileId, profileId);
  assert.ok(Number.isSafeInteger(body.creatorVersion) && body.creatorVersion >= 0,
    'content acknowledgement carries a usable creator revision floor');
  if (disposition !== undefined) assert.equal(body.disposition, disposition);
  for (const [key, value] of Object.entries(targetIds)) assert.equal(body[key], value);
  assert.equal(Object.hasOwn(body, 'versionChanges'), false,
    'owner content acknowledgements do not restore granular row receipts');
  return body;
}

async function requireSnapshot(harness, profileId = PROFILE_ID) {
  const snapshot = await readCreatorSnapshot(harness);
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.profile?.id ?? null, snapshot.profile === null ? null : profileId);
  assert.equal(Object.hasOwn(snapshot.profile ?? {}, 'version'), false,
    'the profile object does not duplicate the aggregate revision');
  return snapshot;
}

async function setCreatorState(harness, nextState) {
  const current = await harness.store.get(`profile:${PROFILE_ID}`);
  const saved = await harness.store.transact({
    checks: [{ key: `profile:${PROFILE_ID}`, version: current.version }],
    puts: [{ key: `profile:${PROFILE_ID}`, value: structuredClone(nextState) }],
  });
  assert.equal(saved, true);
}

async function setResource(harness, id, nextResource) {
  const current = await harness.store.get(`resource:${id}`);
  const saved = await harness.store.transact({
    checks: [{ key: `resource:${id}`, version: current.version }],
    puts: [{ key: `resource:${id}`, value: structuredClone(nextResource) }],
  });
  assert.equal(saved, true);
}

test('profile commands normalize raw fields, preserve optional presence, publish explicitly, and keep old aliases stable', async () => {
  const harness = await createCreatorContentHarness({ state: null });
  const createCallOffset = harness.store.calls.length;
  const rawCreate = {
    creatorVersion: null,
    displayName: '  Ada de Lambda  ',
    slug: '  ada-lambda  ',
    city: ' Córdoba ',
    country: ' Argentina ',
    bio: '  Aprendo con AWS.  ',
    programs: ['Community Builders', 'Community Builders'],
    socials: { linkedin: '  ' },
  };
  const created = await command(harness, '/api/creador/perfil/', 'PUT', rawCreate);
  assert.equal(created.response.status, 200, JSON.stringify(created.body));
  assertAck(created.body, { operation: 'save-profile', disposition: 'created', profileId: created.body.profileId });
  const createdProfileId = created.body.profileId;
  assert.equal(createdProfileId, 'fixture-id-1');
  const createTransaction = harness.store.calls.slice(createCallOffset)
    .find(({ operation, input }) => operation === 'transact'
      && input.puts.some(({ key }) => key === `profile:${createdProfileId}`)).input;
  assert.deepEqual(createTransaction.checks.filter(({ key }) => key === `profile:${createdProfileId}`), [{
    key: `profile:${createdProfileId}`, version: null,
  }], 'initial creation uses the shared preparation key and absent-row condition');
  assert.equal(createTransaction.puts.find(({ key }) => key === `profile:${createdProfileId}`).value.version, 1);

  let snapshot = await requireSnapshot(harness, createdProfileId);
  assert.equal(snapshot.profile.published, false, 'creation does not publish');
  assert.deepEqual(snapshot.profile, {
    id: createdProfileId,
    displayName: 'Ada de Lambda',
    slug: 'ada-lambda',
    city: 'Córdoba',
    country: 'Argentina',
    bio: 'Aprendo con AWS.',
    programs: ['Community Builders'],
    socials: {},
    published: false,
    hidden: false,
  });
  assert.equal(snapshot.creatorVersion, created.body.creatorVersion);
  assert.equal((await harness.service.readPublicProfile('ada-lambda')).status, 404,
    'a created profile is not public before the explicit publish command');

  const publish = await command(harness, '/api/creador/perfil/publicar/', 'POST', {
    creatorVersion: snapshot.creatorVersion,
  });
  assert.equal(publish.response.status, 200, JSON.stringify(publish.body));
  assertAck(publish.body, { operation: 'publish-profile', disposition: 'published', profileId: snapshot.profile.id });
  snapshot = await requireSnapshot(harness, createdProfileId);
  assert.equal(snapshot.profile.published, true);
  assert.equal((await harness.service.readPublicProfile('ada-lambda')).status, 200);

  const previousVersion = snapshot.creatorVersion;
  const updateCallOffset = harness.store.calls.length;
  const updated = await command(harness, '/api/creador/perfil/', 'PUT', {
    creatorVersion: previousVersion,
    displayName: '  Ada de Lambda  ',
    slug: 'ada-lambda-nueva',
    bio: '',
    socials: { linkedin: '' },
  });
  assert.equal(updated.response.status, 200, JSON.stringify(updated.body));
  assertAck(updated.body, { operation: 'save-profile', disposition: 'saved', profileId: snapshot.profile.id });
  const updateTransaction = harness.store.calls.slice(updateCallOffset)
    .find(({ operation, input }) => operation === 'transact'
      && input.puts.some(({ key }) => key === `profile:${snapshot.profile.id}`)).input;
  assert.deepEqual(updateTransaction.checks.filter(({ key }) => key === `profile:${snapshot.profile.id}`), [{
    key: `profile:${snapshot.profile.id}`, version: previousVersion,
  }], 'an existing creator update uses the shared observed-revision condition');
  assert.equal(updateTransaction.puts.find(({ key }) => key === `profile:${snapshot.profile.id}`).value.version,
    previousVersion + 1);
  snapshot = await requireSnapshot(harness, createdProfileId);
  assert.equal(snapshot.profile.displayName, 'Ada de Lambda');
  assert.equal(snapshot.profile.city, 'Córdoba', 'an omitted field is preserved');
  assert.equal(snapshot.profile.country, 'Argentina');
  assert.equal(snapshot.profile.bio, '', 'an explicit empty field clears the saved text');
  assert.deepEqual(snapshot.profile.socials, {}, 'blank social URLs are normalized away');
  assert.equal(snapshot.creatorVersion, previousVersion + 1,
    'one changed profile command advances the aggregate once');
  assert.equal((await harness.service.readPublicProfile('ada-lambda')).status, 308,
    'the prior alias redirects after a slug change');
  assert.equal((await harness.service.readPublicProfile('ada-lambda-nueva')).status, 200);

  const unchanged = await command(harness, '/api/creador/perfil/', 'PUT', {
    creatorVersion: snapshot.creatorVersion,
    displayName: snapshot.profile.displayName,
    slug: snapshot.profile.slug,
    city: snapshot.profile.city,
    country: snapshot.profile.country,
    bio: snapshot.profile.bio,
    programs: snapshot.profile.programs,
    socials: snapshot.profile.socials,
  });
  assert.equal(unchanged.response.status, 200, JSON.stringify(unchanged.body));
  assertAck(unchanged.body, { operation: 'save-profile', disposition: 'unchanged', profileId: snapshot.profile.id });
  assert.deepEqual(await requireSnapshot(harness, createdProfileId), snapshot,
    'a server-confirmed no-op leaves the complete owner snapshot unchanged');
});

test('owner projection joins active and authorized retained resources once and propagates independent metadata', async () => {
  const activeUrl = 'https://catalog.example/active';
  const retainedUrl = 'https://catalog.example/retained';
  const claimOnlyUrl = 'https://catalog.example/claim-only';
  const unauthorizedUrl = 'https://catalog.example/unauthorized';
  const state = defaultState({
    creatorVersion: 12,
    profile: { published: true },
    placements: {
      'placement-one': { resourceId: 'shared-active', selectedForDirectory: true },
    },
    order: { featured: [], ordinary: ['placement-one'] },
  });
  const harness = await createCreatorContentHarness({
    state,
    resources: [
      resource('shared-active', activeUrl, { title: 'Old active title', version: 4, directoryControl: 'creator', editorProfileId: PROFILE_ID }),
      resource('retained', retainedUrl, { version: 11, directoryControl: 'creator', editorProfileId: PROFILE_ID }),
      resource('claim-only', claimOnlyUrl),
      resource('unauthorized', unauthorizedUrl, { directoryControl: 'creator', editorProfileId: 'another-profile' }),
    ],
    editorReferences: [
      { resourceId: 'shared-active' },
      { resourceId: 'retained' },
      { resourceId: 'unauthorized' },
    ],
    claims: [{
      recordType: 'claim',
      id: 'claim-one',
      accountId: 'private-account-a',
      resourceIds: ['claim-only'],
      resources: [{ resourceId: 'claim-only', url: claimOnlyUrl }],
      status: 'pending',
      version: 1,
      createdAt: Date.UTC(2026, 10, 14),
    }],
  });

  let snapshot = await requireSnapshot(harness);
  assert.deepEqual(new Set(snapshot.resources.map(({ id }) => id)), new Set(['shared-active', 'retained']));
  assert.equal(snapshot.resources.filter(({ id }) => id === 'shared-active').length, 1,
    'an active placement and its EDITOR reference join one resource record');
  assert.equal(snapshot.resources.find(({ id }) => id === 'shared-active').version, 4);
  assert.equal(snapshot.resources.find(({ id }) => id === 'retained').version, 11);
  assert.equal(snapshot.resources.find(({ id }) => id === 'retained').metadataEditable, true);
  assert.equal(snapshot.resources.find(({ id }) => id === 'retained').reincludeAllowed, true,
    'the server projects current retained-reference and canonical authority for explicit reinclude');
  assert.equal(snapshot.resources.find(({ id }) => id === 'shared-active').reincludeAllowed, false,
    'metadata editability does not independently grant a retained reinclude action');
  assert.equal(Object.hasOwn(snapshot, 'links'), false);
  assert.equal(Object.hasOwn(snapshot, 'editableResources'), false);
  assert.equal(snapshot.claims[0].resourceIds[0], 'claim-only', 'claim history remains independently visible');

  const active = await command(harness, '/api/creador/enlaces/placement-one/editar', 'PATCH', {
    creatorVersion: snapshot.creatorVersion,
    resourceVersion: 4,
    title: '  New public title  ',
    selectedForDirectory: false,
  });
  assert.equal(active.response.status, 200, JSON.stringify(active.body));
  assertAck(active.body, {
    operation: 'edit-link',
    disposition: 'saved',
    profileId: PROFILE_ID,
    targetIds: { placementId: 'placement-one', resourceId: 'shared-active' },
  });
  assert.equal(active.body.resourceVersion, 5);
  const afterActive = await requireSnapshot(harness);
  assert.equal(afterActive.creatorVersion, snapshot.creatorVersion + 1);
  assert.equal(afterActive.resources.find(({ id }) => id === 'shared-active').version, 5);
  assert.equal(afterActive.resources.find(({ id }) => id === 'shared-active').title, 'New public title');
  assert.equal(afterActive.placements['placement-one'].selectedForDirectory, false);

  const activeAggregateBeforeStale = structuredClone(await harness.store.get(`profile:${PROFILE_ID}`));
  const activeResourceBeforeStale = structuredClone(await harness.store.get('resource:shared-active'));
  const staleMetadataOnly = await command(harness, '/api/creador/enlaces/placement-one/editar', 'PATCH', {
    creatorVersion: afterActive.creatorVersion - 1,
    resourceVersion: 5,
    title: 'Must not save with a stale creator observation',
  });
  assert.equal(staleMetadataOnly.response.status, 409);
  assert.deepEqual(await harness.store.get(`profile:${PROFILE_ID}`), activeAggregateBeforeStale);
  assert.deepEqual(await harness.store.get('resource:shared-active'), activeResourceBeforeStale,
    'metadata-only active edits still require the current creator observation');

  const metadataOnly = await command(harness, '/api/creador/enlaces/placement-one/editar', 'PATCH', {
    creatorVersion: afterActive.creatorVersion,
    resourceVersion: 5,
    title: 'Metadata only public title',
  });
  assert.equal(metadataOnly.response.status, 200, JSON.stringify(metadataOnly.body));
  assertAck(metadataOnly.body, {
    operation: 'edit-link', disposition: 'saved',
    targetIds: { placementId: 'placement-one', resourceId: 'shared-active' },
  });
  assert.equal(metadataOnly.body.creatorVersion, afterActive.creatorVersion,
    'a resource-only active metadata edit checks but does not advance creator content');
  assert.equal(metadataOnly.body.resourceVersion, 6);
  const afterMetadataOnly = await requireSnapshot(harness);
  assert.equal(afterMetadataOnly.creatorVersion, afterActive.creatorVersion);
  assert.equal(afterMetadataOnly.resources.find(({ id }) => id === 'shared-active').version, 6);
  assert.equal(afterMetadataOnly.resources.find(({ id }) => id === 'shared-active').title, 'Metadata only public title');
  assert.equal(afterMetadataOnly.placements['placement-one'].selectedForDirectory, false);
  const publicProfile = await harness.service.readPublicProfile('creator-de-prueba');
  assert.equal(publicProfile.status, 200);
  assert.deepEqual(new Set(publicProfile.links.map(({ title }) => title)), new Set(['Metadata only public title']));

  const revisionBeforeRetained = afterMetadataOnly.creatorVersion;
  const retained = await command(harness, resourceEditPath('retained'), 'PATCH', {
    resourceVersion: 11,
    title: '  Retained title  ',
  });
  assert.equal(retained.response.status, 200, JSON.stringify(retained.body));
  assert.equal(retained.body.schemaVersion, 2);
  assert.equal(retained.body.operation, 'edit-resource');
  assert.equal(retained.body.profileId, PROFILE_ID);
  assert.equal(retained.body.resourceId, 'retained');
  assert.equal(retained.body.resourceVersion, 12);
  assert.equal(retained.body.creatorVersion, undefined,
    'resource-only metadata does not fabricate a creator revision');
  const afterRetained = await requireSnapshot(harness);
  assert.equal(afterRetained.creatorVersion, revisionBeforeRetained);
  assert.equal(afterRetained.resources.find(({ id }) => id === 'shared-active').version, 6);
  assert.equal(afterRetained.resources.find(({ id }) => id === 'retained').version, 12);
  assert.equal(afterRetained.resources.find(({ id }) => id === 'retained').title, 'Retained title');
});

test('Add URL reports new, reused, and already-present outcomes without overwriting existing metadata or placement state', async () => {
  const alreadyUrl = 'https://catalog.example/already?key=A';
  const reuseUrl = 'https://catalog.example/reuse?key=A';
  const upperUrl = 'https://catalog.example/exact?token=A';
  const lowerUrl = 'https://catalog.example/exact?token=a';
  const state = defaultState({
    creatorVersion: 3,
    placements: {
      'placement-existing': { resourceId: 'already', selectedForDirectory: false },
    },
    order: { featured: ['placement-existing'], ordinary: [] },
    series: {
      'series-existing': { name: 'Existing Series', slug: 'existing-series', chapters: ['placement-existing'] },
    },
  });
  const harness = await createCreatorContentHarness({
    state,
    resources: [
      resource('already', alreadyUrl, { title: 'Saved title', description: 'Saved description', version: 9 }),
      resource('reuse', reuseUrl, { title: 'Catalog title', description: 'Catalog description', version: 6 }),
      resource('literal-upper', upperUrl, { title: 'Upper identity', version: 2 }),
      resource('literal-lower', lowerUrl, { title: 'Lower identity', version: 5 }),
    ],
  });

  let snapshot = await requireSnapshot(harness);
  const createdUrl = 'https://catalog.example/new?literal=%2F';
  const created = await command(harness, '/api/creador/enlaces/', 'POST', {
    creatorVersion: snapshot.creatorVersion,
    title: '  New title  ',
    url: createdUrl,
    description: '  New description  ',
    selectedForDirectory: true,
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assertAck(created.body, {
    operation: 'add-link',
    disposition: 'resource-created',
    targetIds: { resourceId: created.body.resourceId, placementId: created.body.placementId },
  });
  assert.ok(typeof created.body.resourceId === 'string' && created.body.resourceId);
  assert.ok(typeof created.body.placementId === 'string' && created.body.placementId);
  snapshot = await requireSnapshot(harness);
  const createdResource = snapshot.resources.find(({ id }) => id === created.body.resourceId);
  assert.equal(createdResource.title, 'New title');
  assert.equal(createdResource.description, 'New description');
  assert.equal(createdResource.url, createdUrl, 'URL spelling is preserved exactly');
  assert.equal(snapshot.placements[created.body.placementId].resourceId, created.body.resourceId);
  assert.equal(snapshot.creatorVersion, 4);

  const reused = await command(harness, '/api/creador/enlaces/', 'POST', {
    creatorVersion: snapshot.creatorVersion,
    title: 'Unapplied title',
    url: reuseUrl,
    description: 'Unapplied description',
    selectedForDirectory: false,
  });
  assert.equal(reused.response.status, 201, JSON.stringify(reused.body));
  assertAck(reused.body, {
    operation: 'add-link',
    disposition: 'resource-reused',
    targetIds: { resourceId: 'reuse', placementId: reused.body.placementId },
  });
  snapshot = await requireSnapshot(harness);
  const reusedResource = snapshot.resources.find(({ id }) => id === 'reuse');
  assert.equal(reusedResource.title, 'Catalog title');
  assert.equal(reusedResource.description, 'Catalog description');
  assert.equal(reusedResource.version, 6, 'reuse leaves shared resource metadata and authority version unchanged');
  assert.equal(snapshot.placements[reused.body.placementId].selectedForDirectory, false);
  assert.deepEqual(snapshot.order.ordinary, [created.body.placementId, reused.body.placementId]);

  const beforeAlready = await harness.store.get(`profile:${PROFILE_ID}`);
  const already = await command(harness, '/api/creador/enlaces/', 'POST', {
    creatorVersion: snapshot.creatorVersion,
    title: 'Another unapplied title',
    url: alreadyUrl,
    description: 'Another unapplied description',
    selectedForDirectory: true,
  });
  assert.equal(already.response.status, 200, JSON.stringify(already.body));
  assertAck(already.body, {
    operation: 'add-link',
    disposition: 'already-present',
    targetIds: { resourceId: 'already', placementId: 'placement-existing' },
  });
  assert.equal(already.body.creatorVersion, snapshot.creatorVersion);
  assert.deepEqual(await harness.store.get(`profile:${PROFILE_ID}`), beforeAlready,
    'already-present preserves current order, options, memberships, and aggregate revision');
  assert.deepEqual(await harness.store.get('resource:already'), resource('already', alreadyUrl, {
    title: 'Saved title', description: 'Saved description', version: 9,
  }));

  const literalA = await command(harness, '/api/creador/enlaces/', 'POST', {
    creatorVersion: snapshot.creatorVersion,
    title: 'Ignored A', url: upperUrl,
  });
  assert.equal(literalA.response.status, 201);
  const current = await requireSnapshot(harness);
  const literalB = await command(harness, '/api/creador/enlaces/', 'POST', {
    creatorVersion: current.creatorVersion,
    title: 'Ignored a', url: lowerUrl,
  });
  assert.equal(literalB.response.status, 201);
  assert.equal(literalA.body.resourceId, 'literal-upper');
  assert.equal(literalB.body.resourceId, 'literal-lower', 'literal URL identity selects the exact catalog reservation');
});

test('Add, edit, and free-text claim URLs trim outer spaces while exact claim pairs stay literal', async () => {
  const urlLimit = 2048;
  const prefix = 'https://catalog.example/';
  const boundaryUrl = `${prefix}${'x'.repeat(urlLimit - prefix.length)}`;
  const tooLongUrl = `${prefix}${'x'.repeat(urlLimit - prefix.length + 1)}`;
  const exactResource = resource('claim-exact-pair', 'https://catalog.example/claim-exact-pair');
  const harness = await createCreatorContentHarness({ resources: [exactResource] });
  let snapshot = await requireSnapshot(harness);

  const added = await command(harness, '/api/creador/enlaces/', 'POST', {
    creatorVersion: snapshot.creatorVersion,
    title: ' URL con espacios ',
    url: `  ${boundaryUrl}  `,
  });
  assert.equal(added.response.status, 201, JSON.stringify(added.body));
  assert.equal((await harness.store.get(`resource:${added.body.resourceId}`)).url, boundaryUrl,
    'outer spaces are trimmed before URL validation and persistence at the 2048-character limit');
  snapshot = await requireSnapshot(harness);

  const transactionsBeforeTooLongAdd = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const tooLongAdd = await command(harness, '/api/creador/enlaces/', 'POST', {
    creatorVersion: snapshot.creatorVersion,
    title: 'URL excesiva',
    url: `  ${tooLongUrl}  `,
  });
  assert.equal(tooLongAdd.response.status, 422);
  assert.equal(tooLongAdd.body.error, 'FIELD_TOO_LONG');
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length,
    transactionsBeforeTooLongAdd, 'the over-limit URL is rejected before writes');

  const claimsBefore = await harness.store.list('claim:');
  const freeTextClaim = await command(harness, '/api/creador/reclamaciones/', 'POST', {
    resources: [{ url: `  ${boundaryUrl}  ` }],
  });
  assert.equal(freeTextClaim.response.status, 202, JSON.stringify(freeTextClaim.body));
  const storedClaim = await harness.store.get(`claim:${freeTextClaim.body.claimId}`);
  assert.deepEqual(storedClaim.resources, [{ resourceId: added.body.resourceId, url: boundaryUrl }],
    'a free-text claim resolves the trimmed literal reservation and stores the bounded URL');

  const claimsAfterFreeText = await harness.store.list('claim:');
  const explicitPair = await command(harness, '/api/creador/reclamaciones/', 'POST', {
    resources: [{ resourceId: exactResource.id, url: `  ${exactResource.url}  ` }],
  });
  assert.equal(explicitPair.response.status, 422);
  assert.equal(explicitPair.body.error, 'INVALID_URL',
    'an explicit resource ID keeps URL comparison literal instead of trimming the selected pair');
  assert.deepEqual(await harness.store.list('claim:'), claimsAfterFreeText,
    'the rejected exact pair creates no claim');
  assert.equal(claimsBefore.length, 0);

  snapshot = await requireSnapshot(harness);
  const beforeEdit = await harness.store.get(`resource:${added.body.resourceId}`);
  const editedUrl = 'https://catalog.example/edit-trimmed';
  const edited = await command(harness, `/api/creador/enlaces/${added.body.placementId}/editar`, 'PATCH', {
    creatorVersion: snapshot.creatorVersion,
    resourceVersion: beforeEdit.version,
    url: `  ${editedUrl}  `,
  });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.body));
  assert.equal((await harness.store.get(`resource:${added.body.resourceId}`)).url, editedUrl,
    'the combined edit stores the trimmed URL');
  snapshot = await requireSnapshot(harness);

  const beforeRetainedEdit = await harness.store.get(`resource:${added.body.resourceId}`);
  const retainedEditUrl = 'https://catalog.example/retained-edit-trimmed';
  const retainedEdit = await command(harness, resourceEditPath(added.body.resourceId), 'PATCH', {
    resourceVersion: beforeRetainedEdit.version,
    url: `  ${retainedEditUrl}  `,
  });
  assert.equal(retainedEdit.response.status, 200, JSON.stringify(retainedEdit.body));
  assert.equal(retainedEdit.body.operation, 'edit-resource');
  assert.equal((await harness.store.get(`resource:${added.body.resourceId}`)).url, retainedEditUrl,
    'the retained-resource edit uses the same pre-validation URL trim');

  const editResourceBeforeReject = await harness.store.get(`resource:${added.body.resourceId}`);
  const editTransactionsBeforeReject = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const tooLongEdit = await command(harness, `/api/creador/enlaces/${added.body.placementId}/editar`, 'PATCH', {
    creatorVersion: snapshot.creatorVersion,
    resourceVersion: editResourceBeforeReject.version,
    url: `  ${tooLongUrl}  `,
  });
  assert.equal(tooLongEdit.response.status, 422);
  assert.equal(tooLongEdit.body.error, 'FIELD_TOO_LONG');
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length,
    editTransactionsBeforeReject, 'an over-limit edit is rejected before writes');
  assert.deepEqual(await harness.store.get(`resource:${added.body.resourceId}`), editResourceBeforeReject);
});

test('a second real edit before the first response returns cannot rewrite the first transaction acknowledgement', async () => {
  const state = defaultState({
    creatorVersion: 40,
    placements: { 'placement-one': { resourceId: 'resource-one', selectedForDirectory: true } },
    order: { featured: [], ordinary: ['placement-one'] },
  });
  const harness = await createCreatorContentHarness({
    state,
    resources: [resource('resource-one', 'https://catalog.example/one', {
      title: 'Initial title', version: 1, directoryControl: 'creator', editorProfileId: PROFILE_ID,
    })],
    editorReferences: [{ resourceId: 'resource-one' }],
  });
  const baseline = await requireSnapshot(harness);
  let secondCommand;
  let nested = false;
  const originalTransact = harness.store.transact.bind(harness.store);
  harness.store.transact = async (transaction) => {
    const committed = await originalTransact(transaction);
    if (!nested && committed && transaction.puts?.some(({ key }) => key === `profile:${PROFILE_ID}`)) {
      nested = true;
      const committedSnapshot = await requireSnapshot(harness);
      const committedResource = committedSnapshot.resources.find(({ id }) => id === 'resource-one');
      const response = await creatorRequest(harness, '/api/creador/enlaces/placement-one/editar', {
        method: 'PATCH',
        body: {
          creatorVersion: committedSnapshot.creatorVersion,
          resourceVersion: committedResource.version,
          title: 'Second committed title',
          selectedForDirectory: true,
        },
      });
      secondCommand = { response, body: await json(response) };
    }
    return committed;
  };
  let firstCommand;
  try {
    firstCommand = await command(harness, '/api/creador/enlaces/placement-one/editar', 'PATCH', {
      creatorVersion: baseline.creatorVersion,
      resourceVersion: baseline.resources.find(({ id }) => id === 'resource-one').version,
      title: 'First committed title',
      selectedForDirectory: false,
    });
  } finally {
    harness.store.transact = originalTransact;
  }

  assert.equal(nested, true, 'the controlled transport ran a second real command after the first commit');
  assert.equal(firstCommand.response.status, 200, JSON.stringify(firstCommand.body));
  assert.equal(secondCommand.response.status, 200, JSON.stringify(secondCommand.body));
  assertAck(firstCommand.body, {
    operation: 'edit-link',
    disposition: 'saved',
    targetIds: { placementId: 'placement-one', resourceId: 'resource-one' },
  });
  assert.equal(firstCommand.body.creatorVersion, baseline.creatorVersion + 1);
  assert.equal(firstCommand.body.resourceVersion, baseline.resources.find(({ id }) => id === 'resource-one').version + 1);
  assertAck(secondCommand.body, {
    operation: 'edit-link', disposition: 'saved',
    targetIds: { placementId: 'placement-one', resourceId: 'resource-one' },
  });
  assert.equal(secondCommand.body.creatorVersion, baseline.creatorVersion + 2);
  const latest = await requireSnapshot(harness);
  assert.equal(latest.creatorVersion, baseline.creatorVersion + 2);
  assert.equal(latest.resources.find(({ id }) => id === 'resource-one').title, 'Second committed title');
  assert.equal(latest.placements['placement-one'].selectedForDirectory, true);
  assert.ok(latest.creatorVersion > firstCommand.body.creatorVersion,
    'a fresh full read may be newer than the first command acknowledgement floor');
  assert.ok(latest.resources.find(({ id }) => id === 'resource-one').version > firstCommand.body.resourceVersion,
    'independent resource state can also be newer than that acknowledgement');
});

test('one admin grant command preserves the first grant in the aggregate while granting a second resource', async () => {
  const state = defaultState({ creatorVersion: 50 });
  const harness = await createCreatorContentHarness({
    state,
    resources: [
      resource('grant-a', 'https://catalog.example/grant-a'),
      resource('grant-b', 'https://catalog.example/grant-b'),
    ],
    claims: [{
      recordType: 'claim',
      id: 'grant-claim',
      accountId: 'private-account-a',
      resourceIds: ['grant-a', 'grant-b'],
      status: 'pending',
      version: 1,
      createdAt: Date.UTC(2026, 10, 14),
    }],
  });
  const before = await requireSnapshot(harness);
  const callOffset = harness.store.calls.length;
  const grant = await creatorRequest(harness, '/api/admin/reclamaciones/vincular', {
    session: 'admin',
    method: 'POST',
    body: { accountId: 'private-account-a', resourceIds: ['grant-a', 'grant-b'] },
    creatorContract: null,
  });
  assert.equal(grant.status, 200, await grant.clone().text());
  const grantBody = await json(grant);
  assert.deepEqual(grantBody.linkedResourceIds, ['grant-a', 'grant-b']);
  assert.equal(grantBody.profileChanged, true);

  const after = await requireSnapshot(harness);
  assert.equal(after.creatorVersion, before.creatorVersion + 2,
    'each committed resource grant advances the aggregate while carrying forward prior content');
  const aggregateTransactions = harness.store.calls.slice(callOffset)
    .filter(({ operation, input }) => operation === 'transact'
      && input.puts.some(({ key }) => key === `profile:${PROFILE_ID}`));
  assert.equal(aggregateTransactions.length, 2);
  for (const [index, { input }] of aggregateTransactions.entries()) {
    assert.deepEqual(input.checks.filter(({ key }) => key === `profile:${PROFILE_ID}`), [{
      key: `profile:${PROFILE_ID}`, version: before.creatorVersion + index,
    }], 'each aggregate grant is conditioned on the exact revision it observed');
    assert.equal(input.puts.find(({ key }) => key === `profile:${PROFILE_ID}`).value.version,
      before.creatorVersion + index + 1);
  }
  const placementByResource = new Map(Object.entries(after.placements).map(([id, placement]) => [placement.resourceId, id]));
  assert.equal(placementByResource.size, 2);
  assert.ok(placementByResource.has('grant-a'));
  assert.ok(placementByResource.has('grant-b'));
  assert.deepEqual(new Set(after.order.ordinary), new Set(placementByResource.values()));
  assert.equal(after.order.featured.length, 0);
  assert.deepEqual(new Set(after.resources.map(({ id }) => id)), new Set(['grant-a', 'grant-b']));
  assert.ok(after.resources.every(({ metadataEditable }) => metadataEditable === true));
  assert.equal(after.claims.find(({ id }) => id === 'grant-claim').status, 'resolved');

  const transactionsBeforeNoop = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const repeated = await creatorRequest(harness, '/api/admin/reclamaciones/vincular', {
    session: 'admin',
    method: 'POST',
    body: { accountId: 'private-account-a', resourceIds: ['grant-a', 'grant-b'] },
    creatorContract: null,
  });
  assert.equal(repeated.status, 200, await repeated.clone().text());
  const repeatedBody = await json(repeated);
  assert.deepEqual(repeatedBody.linkedResourceIds, ['grant-a', 'grant-b']);
  assert.equal(repeatedBody.profileChanged, false);
  assert.deepEqual(repeatedBody.versionChanges, []);
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length,
    transactionsBeforeNoop, 'a fully linked no-op performs no transaction checks or writes');
});

test('a rejected conditional admin grant keeps the already committed prefix without attempting a stale overwrite', async () => {
  const state = defaultState({ creatorVersion: 70 });
  const originalB = resource('grant-rejected-b', 'https://catalog.example/grant-rejected-b');
  const harness = await createCreatorContentHarness({
    state,
    resources: [
      resource('grant-rejected-a', 'https://catalog.example/grant-rejected-a'),
      originalB,
    ],
  });
  const rawTransact = harness.store.transact.bind(harness.store);
  let aggregateWrites = 0;
  let rejectedChecks;
  harness.store.transact = async (transaction) => {
    const profilePut = transaction.puts.find(({ key }) => key === `profile:${PROFILE_ID}`);
    if (profilePut && ++aggregateWrites === 2) {
      rejectedChecks = transaction.checks.filter(({ key }) => key === `profile:${PROFILE_ID}`);
      const impossibleRevision = rejectedChecks[0].version + 1;
      const safeRejectedTransaction = {
        ...transaction,
        checks: transaction.checks.map((check) => check.key === `profile:${PROFILE_ID}`
          ? { ...check, version: impossibleRevision } : check),
      };
      assert.equal(await rawTransact(safeRejectedTransaction), false,
        'the real store rejects the second candidate before any write because its expected revision is impossible');
      return false;
    }
    return rawTransact(transaction);
  };

  const response = await creatorRequest(harness, '/api/admin/reclamaciones/vincular', {
    session: 'admin',
    method: 'POST',
    body: { accountId: 'private-account-a', resourceIds: ['grant-rejected-a', 'grant-rejected-b'] },
    creatorContract: null,
  });
  assert.equal(response.status, 409);
  const body = await json(response);
  assert.equal(body.error, 'CLAIM_CONFLICT');
  assert.deepEqual(body.linkedResourceIds, ['grant-rejected-a']);
  assert.equal(body.profileChanged, true);
  assert.equal(aggregateWrites, 2);
  assert.deepEqual(rejectedChecks, [{ key: `profile:${PROFILE_ID}`, version: state.version + 1 }],
    'the second grant is based on the prefix revision, then safely rejected by the injected impossible condition');

  const after = await requireSnapshot(harness);
  assert.equal(after.creatorVersion, state.version + 1);
  assert.deepEqual(Object.values(after.placements).map(({ resourceId }) => resourceId), ['grant-rejected-a']);
  assert.equal((await harness.store.get('resource:grant-rejected-a')).directoryControl, 'creator');
  assert.deepEqual(await harness.store.get('resource:grant-rejected-b'), originalB);
  assert.equal(await harness.store.get(`editor:${PROFILE_ID}:grant-rejected-b`), null);
  assert.deepEqual(body.versionChanges.filter(({ entity }) => entity === 'profile'), [{
    entity: 'profile', id: PROFILE_ID, before: state.version, after: state.version + 1,
  }]);
});

test('explicit general and chapter sequences preserve hidden members through feature moves, removal, reinclude, and alias 404', async () => {
  const placements = {
    'placement-z': { resourceId: 'resource-z', selectedForDirectory: true },
    'placement-a': { resourceId: 'resource-a', selectedForDirectory: true },
    'placement-b': { resourceId: 'resource-b', selectedForDirectory: false },
    [HIDDEN_PLACEMENT_ID]: { resourceId: 'resource-hidden', selectedForDirectory: true },
  };
  const state = defaultState({
    creatorVersion: 20,
    profile: { published: true },
    placements,
    order: { featured: ['placement-z'], ordinary: ['placement-a', 'placement-b', HIDDEN_PLACEMENT_ID] },
    series: {
      'series-one': { name: 'Series One', slug: 'series-one', chapters: ['placement-a', HIDDEN_PLACEMENT_ID, 'placement-z'] },
      'series-two': { name: 'Series Two', slug: 'series-two', chapters: [HIDDEN_PLACEMENT_ID, 'placement-b'] },
    },
  });
  const harness = await createCreatorContentHarness({
    state,
    resources: [
      resource('resource-z', 'https://catalog.example/z'),
      resource('resource-a', 'https://catalog.example/a'),
      resource('resource-b', 'https://catalog.example/b'),
      resource('resource-hidden', 'https://catalog.example/hidden', {
        hidden: true, directoryControl: 'creator', editorProfileId: PROFILE_ID,
      }),
    ],
    editorReferences: [{ resourceId: 'resource-hidden' }],
  });

  let snapshot = await requireSnapshot(harness);
  const chapterMove = await command(harness, '/api/creador/series/series-one/capitulos/placement-z/mover', 'POST', {
    creatorVersion: snapshot.creatorVersion,
    destination: 1,
  });
  assert.equal(chapterMove.response.status, 200, JSON.stringify(chapterMove.body));
  assertAck(chapterMove.body, {
    operation: 'move-chapter',
    disposition: 'moved',
    targetIds: { seriesId: 'series-one', placementId: 'placement-z' },
  });
  snapshot = await requireSnapshot(harness);
  assert.deepEqual(snapshot.series['series-one'].chapters, ['placement-z', 'placement-a', HIDDEN_PLACEMENT_ID]);
  assert.deepEqual(snapshot.order, { featured: ['placement-z'], ordinary: ['placement-a', 'placement-b', HIDDEN_PLACEMENT_ID] },
    'chapter movement does not substitute general order');
  assert.ok(snapshot.resources.some(({ id, hidden }) => id === 'resource-hidden' && hidden));

  const generalMove = await command(harness, '/api/creador/enlaces/placement-b/mover', 'POST', {
    creatorVersion: snapshot.creatorVersion,
    destination: 1,
  });
  assert.equal(generalMove.response.status, 200, JSON.stringify(generalMove.body));
  assertAck(generalMove.body, {
    operation: 'move-link',
    disposition: 'moved',
    targetIds: { placementId: 'placement-b' },
  });
  snapshot = await requireSnapshot(harness);
  assert.deepEqual(snapshot.order, { featured: ['placement-z'], ordinary: ['placement-b', 'placement-a', HIDDEN_PLACEMENT_ID] });
  assert.deepEqual(snapshot.series['series-one'].chapters, ['placement-z', 'placement-a', HIDDEN_PLACEMENT_ID]);

  const featured = await command(harness, '/api/creador/enlaces/placement-a', 'PATCH', {
    creatorVersion: snapshot.creatorVersion,
    featured: true,
  });
  assert.equal(featured.response.status, 200, JSON.stringify(featured.body));
  assertAck(featured.body, { operation: 'set-link-options', disposition: 'saved', targetIds: { placementId: 'placement-a' } });
  snapshot = await requireSnapshot(harness);
  assert.deepEqual(snapshot.order, { featured: ['placement-z', 'placement-a'], ordinary: ['placement-b', HIDDEN_PLACEMENT_ID] },
    'a feature-group change appends to the destination group');

  const removeHidden = await command(harness, `/api/creador/enlaces/${HIDDEN_PLACEMENT_ID}`, 'DELETE', {
    creatorVersion: snapshot.creatorVersion,
  });
  assert.equal(removeHidden.response.status, 200, JSON.stringify(removeHidden.body));
  assertAck(removeHidden.body, { operation: 'remove-link', disposition: 'removed', targetIds: { placementId: HIDDEN_PLACEMENT_ID } });
  snapshot = await requireSnapshot(harness);
  assert.equal(Object.hasOwn(snapshot.placements, HIDDEN_PLACEMENT_ID), false);
  assert.deepEqual(snapshot.order, { featured: ['placement-z', 'placement-a'], ordinary: ['placement-b'] });
  assert.deepEqual(snapshot.series['series-one'].chapters, ['placement-z', 'placement-a']);
  assert.deepEqual(snapshot.series['series-two'].chapters, ['placement-b']);

  const reinclude = await command(harness, '/api/creador/enlaces/', 'POST', {
    creatorVersion: snapshot.creatorVersion,
    resourceId: 'resource-hidden',
    resourceVersion: 1,
  });
  assert.equal(reinclude.response.status, 201, JSON.stringify(reinclude.body));
  assertAck(reinclude.body, {
    operation: 'reinclude-link',
    disposition: 'attached',
    targetIds: { resourceId: 'resource-hidden', placementId: HIDDEN_PLACEMENT_ID },
  });
  snapshot = await requireSnapshot(harness);
  assert.deepEqual(snapshot.order.ordinary, ['placement-b', HIDDEN_PLACEMENT_ID]);
  assert.deepEqual(snapshot.series['series-one'].chapters, ['placement-z', 'placement-a']);
  assert.deepEqual(snapshot.series['series-two'].chapters, ['placement-b']);
  assert.equal(snapshot.placements[HIDDEN_PLACEMENT_ID].selectedForDirectory, true,
    'reinclude preserves the existing directory-selection default for a new placement');
  const publicProfile = await harness.service.readPublicProfile('creator-de-prueba');
  assert.equal(publicProfile.status, 200);
  assert.equal(publicProfile.links.some(({ resourceId }) => resourceId === 'resource-hidden'), false,
    'hidden resources stay in owner sequences but are filtered from public projection');

  const generalBeforeDelete = structuredClone(snapshot.order);
  const deleteSeries = await command(harness, '/api/creador/series/series-one', 'DELETE', {
    creatorVersion: snapshot.creatorVersion,
  });
  assert.equal(deleteSeries.response.status, 200, JSON.stringify(deleteSeries.body));
  assertAck(deleteSeries.body, {
    operation: 'delete-series',
    disposition: 'deleted',
    targetIds: { seriesId: 'series-one' },
  });
  snapshot = await requireSnapshot(harness);
  assert.equal(Object.hasOwn(snapshot.series, 'series-one'), false);
  assert.deepEqual(snapshot.order, generalBeforeDelete, 'deleting a Series preserves general order');
  assert.equal((await harness.service.readPublicSeries('creator-de-prueba', 'series-one')).status, 404,
    'the reserved Series alias for a deleted target resolves to 404');
});

test('stale creator/resource observations and racing no-op participants have no partial effect; a later manual command succeeds', async () => {
  const state = defaultState({
    creatorVersion: 30,
    placements: { 'placement-one': { resourceId: 'resource-one', selectedForDirectory: true } },
    order: { featured: [], ordinary: ['placement-one'] },
  });
  const harness = await createCreatorContentHarness({
    state,
    resources: [resource('resource-one', 'https://catalog.example/one', {
      title: 'Initial title', version: 3, directoryControl: 'creator', editorProfileId: PROFILE_ID,
    })],
    editorReferences: [{ resourceId: 'resource-one' }],
  });

  let snapshot = await requireSnapshot(harness);
  const staleCreatorRevision = snapshot.creatorVersion;
  const external = structuredClone(await harness.store.get(`profile:${PROFILE_ID}`));
  external.version += 1;
  external.placements['placement-one'].selectedForDirectory = false;
  await setCreatorState(harness, external);
  const afterExternalCreator = structuredClone(await harness.store.get(`profile:${PROFILE_ID}`));
  const staleCreator = await command(harness, '/api/creador/perfil/', 'PUT', {
    creatorVersion: staleCreatorRevision,
    displayName: 'Must not commit',
  });
  assert.equal(staleCreator.response.status, 409);
  assert.deepEqual(await harness.store.get(`profile:${PROFILE_ID}`), afterExternalCreator,
    'a stale creator command leaves the concurrent aggregate intact');

  snapshot = await requireSnapshot(harness);
  const staleResourceRevision = 3;
  await setResource(harness, 'resource-one', {
    ...resource('resource-one', 'https://catalog.example/one', {
      title: 'Concurrent resource title', version: 4, directoryControl: 'creator', editorProfileId: PROFILE_ID,
    }),
  });
  const afterExternalResource = structuredClone(await harness.store.get(`resource:resource-one`));
  const aggregateBeforeStaleResource = structuredClone(await harness.store.get(`profile:${PROFILE_ID}`));
  const staleResource = await command(harness, '/api/creador/enlaces/placement-one/editar', 'PATCH', {
    creatorVersion: snapshot.creatorVersion,
    resourceVersion: staleResourceRevision,
    title: 'Must not commit either',
    selectedForDirectory: true,
  });
  assert.equal(staleResource.response.status, 409);
  assert.deepEqual(await harness.store.get(`profile:${PROFILE_ID}`), aggregateBeforeStaleResource,
    'a stale resource prevents the coupled aggregate option write');
  assert.deepEqual(await harness.store.get('resource:resource-one'), afterExternalResource);

  const currentSnapshot = await requireSnapshot(harness);
  const currentResource = await harness.store.get('resource:resource-one');
  let injected = false;
  const originalTransact = harness.store.transact.bind(harness.store);
  harness.store.transact = async (transaction) => {
    if (!injected && transaction.checks?.some(({ key }) => key === 'resource:resource-one')) {
      injected = true;
      await originalTransact({
        checks: [{ key: 'resource:resource-one', version: currentResource.version }],
        puts: [{ key: 'resource:resource-one', value: { ...currentResource, title: 'Changed during no-op check', version: currentResource.version + 1 } }],
      });
    }
    return originalTransact(transaction);
  };
  let noOpRace;
  try {
    noOpRace = await command(harness, '/api/creador/enlaces/placement-one/editar', 'PATCH', {
      creatorVersion: currentSnapshot.creatorVersion,
      resourceVersion: currentResource.version,
      title: currentResource.title,
      selectedForDirectory: currentSnapshot.placements['placement-one'].selectedForDirectory,
    });
  } finally {
    harness.store.transact = originalTransact;
  }
  assert.equal(injected, true, 'the no-op still checks its observed resource participant transactionally');
  assert.equal(noOpRace.response.status, 409);
  assert.deepEqual(await harness.store.get(`profile:${PROFILE_ID}`), aggregateBeforeStaleResource,
    'a participant race on an apparent no-op does not partially change aggregate content');

  const racedResource = await harness.store.get('resource:resource-one');
  snapshot = await requireSnapshot(harness);
  const manual = await command(harness, '/api/creador/enlaces/placement-one/editar', 'PATCH', {
    creatorVersion: snapshot.creatorVersion,
    resourceVersion: racedResource.version,
    title: 'Legitimate manual save',
    selectedForDirectory: true,
  });
  assert.equal(manual.response.status, 200, JSON.stringify(manual.body));
  assertAck(manual.body, {
    operation: 'edit-link', disposition: 'saved',
    targetIds: { placementId: 'placement-one', resourceId: 'resource-one' },
  });
  const final = await requireSnapshot(harness);
  assert.equal(final.resources.find(({ id }) => id === 'resource-one').title, 'Legitimate manual save');
  assert.equal(final.placements['placement-one'].selectedForDirectory, true);
  assert.equal(final.creatorVersion, snapshot.creatorVersion + 1);
});

test('obsolete owner contracts and legacy resource/chapter inputs are rejected before effects', async () => {
  const state = defaultState({
    creatorVersion: 5,
    placements: { 'placement-one': { resourceId: 'resource-one', selectedForDirectory: true } },
    order: { featured: [], ordinary: ['placement-one'] },
    series: { 'series-one': { name: 'Series One', slug: 'series-one', chapters: ['placement-one'] } },
  });
  const harness = await createCreatorContentHarness({
    state,
    resources: [resource('resource-one', 'https://catalog.example/one', {
      version: 7, directoryControl: 'creator', editorProfileId: PROFILE_ID,
    })],
    editorReferences: [{ resourceId: 'resource-one' }],
  });
  const beforeState = structuredClone(await harness.store.get(`profile:${PROFILE_ID}`));
  const beforeResource = structuredClone(await harness.store.get('resource:resource-one'));
  const writesBefore = harness.store.calls.filter(({ operation }) => operation === 'transact').length;

  const noHeader = await command(harness, '/api/creador/enlaces/placement-one/editar', 'PATCH', {
    creatorVersion: beforeState.version, resourceVersion: 7, title: 'No contract write',
  }, { creatorContract: null });
  assert.equal(noHeader.response.status, 409);
  assert.equal(noHeader.body.error, 'CREATOR_CONTRACT_OBSOLETE');
  assert.deepEqual(await harness.store.get(`profile:${PROFILE_ID}`), beforeState);
  assert.deepEqual(await harness.store.get('resource:resource-one'), beforeResource);

  const noHeaderClaim = await command(harness, '/api/creador/reclamaciones/', 'POST', {
    accountId: 'private-account-a',
    resources: [{ resourceId: 'resource-one', url: 'https://catalog.example/one' }],
  }, { creatorContract: null });
  assert.equal(noHeaderClaim.response.status, 409);
  assert.equal(noHeaderClaim.body.error, 'CREATOR_CONTRACT_OBSOLETE');

  const noHeaderRetainedEdit = await command(harness, resourceEditPath('resource-one'), 'PATCH', {
    resourceVersion: 7,
    title: 'No retained edit',
  }, { creatorContract: null });
  assert.equal(noHeaderRetainedEdit.response.status, 409);
  assert.equal(noHeaderRetainedEdit.body.error, 'CREATOR_CONTRACT_OBSOLETE');

  const wrongHeader = await command(harness, '/api/creador/enlaces/', 'POST', {
    creatorVersion: beforeState.version,
    title: 'No contract resource',
    url: 'https://catalog.example/no-contract',
  }, { creatorContract: '1' });
  assert.equal(wrongHeader.response.status, 409);
  assert.equal(wrongHeader.body.error, 'CREATOR_CONTRACT_OBSOLETE');
  assert.deepEqual(await harness.store.get(`profile:${PROFILE_ID}`), beforeState);
  assert.equal(await harness.store.get(`url:${createHash('sha256').update('https://catalog.example/no-contract').digest('hex')}`), null);

  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writesBefore,
    'missing and obsolete headers reject profile, claim, resource, and Add commands before any transaction');

  const obsoleteRequests = [
    await command(harness, '/api/creador/perfil/', 'PUT', { profileVersion: beforeState.version, displayName: 'Omitted version' }),
    await command(harness, '/api/creador/enlaces/placement-one/editar', 'PATCH', {
      creatorVersion: beforeState.version, profileVersion: beforeState.version, placementVersion: 1,
      resourceVersion: 7, title: 'Legacy row versions',
    }),
    await command(harness, resourceEditPath('resource-one'), 'PATCH', { resourceVersion: 7, resourceId: 'resource-one', title: 'Body ID' }),
    await command(harness, '/api/creador/recursos/resource-one', 'PATCH', { resourceVersion: 7, title: 'Old path ID' }),
    await command(harness, '/api/creador/series/series-one/capitulos/placement-one', 'PATCH', {
      creatorVersion: beforeState.version, direction: 'up',
    }),
    await command(harness, '/api/creador/enlaces/placement-one/mover', 'POST', {
      creatorVersion: beforeState.version, position: 1,
    }),
    await command(harness, '/api/creador/series/series-one/capitulos/placement-one/mover', 'POST', {
      creatorVersion: beforeState.version, seriesVersion: 1, position: 1,
    }),
  ];
  assert.deepEqual(obsoleteRequests.map(({ response }) => response.status), [400, 400, 400, 404, 405, 400, 400]);
  assert.deepEqual(await harness.store.get(`profile:${PROFILE_ID}`), beforeState);
  assert.deepEqual(await harness.store.get('resource:resource-one'), beforeResource);

  const emptyHarness = await createCreatorContentHarness({ state: null });
  const omittedInitialRevision = await command(emptyHarness, '/api/creador/perfil/', 'PUT', {
    displayName: 'Missing explicit create base', slug: 'missing-create-base',
  });
  assert.ok(omittedInitialRevision.response.status >= 400 && omittedInitialRevision.response.status < 500);
  assert.equal(await emptyHarness.store.get('account-profile:private-account-a'), null,
    'initial profile creation requires explicit creatorVersion:null before any owner mapping write');
});

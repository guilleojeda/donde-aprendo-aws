import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createSubmissionHandler } from '../src/api/submission.mjs';
import { createDynamoCatalogAccess } from '../src/lib/catalog-resource-writer.mjs';
import { loadCatalog, projectPublicRecord } from '../src/lib/catalog.mjs';
import { importCatalog, mapTsvRows, parseCatalogTsv } from '../src/lib/catalog-import.mjs';
import { currentUrlKey, currentUrlReservationId } from '../src/lib/catalog-url.mjs';
import { CREATOR_CONTRACT_VERSION } from '../src/lib/creator-values.mjs';
import { resolveResourceClassification } from '../src/lib/resource-taxonomy.mjs';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  seedResource,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';
import { createDynamoMoveHarness } from './fixtures/creator-link-move.mjs';

const CATALOG_TABLE = 'catalog-test';
const PROFILES_TABLE = 'profiles-test';
const CONTENT = Object.freeze({ kind: 'content', format: 'Artículo', topics: ['Seguridad'] });
const SOURCE = Object.freeze({ kind: 'source', format: 'Blog', topics: ['DevOps'] });
const ALTERNATE_CONTENT = Object.freeze({ kind: 'content', format: 'Video', topics: ['Fundamentos'] });

async function api(harness, path, {
  session = 'creator-a', method = 'POST', body, creatorContract = CREATOR_CONTRACT_VERSION, extraHeaders = {},
} = {}) {
  const response = await callApi(harness, path, {
    session,
    method,
    csrf: sessionCsrf[session],
    ...(creatorContract === null ? {} : { creatorContract }),
    extraHeaders,
    ...(body === undefined ? {} : { body }),
  });
  return { response, body: await responseJson(response) };
}

async function owner(harness, session = 'creator-a', { contract = CREATOR_CONTRACT_VERSION } = {}) {
  const { response, body } = await api(harness, '/api/creador/perfil', {
    session, method: 'GET', creatorContract: contract,
  });
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

async function createProfile(harness, session = 'creator-a', {
  slug = `classification-${session}`, displayName = session, publish = false,
} = {}) {
  const before = await owner(harness, session);
  const created = await api(harness, '/api/creador/perfil', {
    session,
    method: 'PUT',
    body: {
      creatorVersion: before.profile ? before.creatorVersion : null,
      displayName, slug, programs: [], socials: {},
    },
  });
  assert.equal(created.response.status, 200, JSON.stringify(created.body));
  let current = await owner(harness, session);
  if (publish) {
    const published = await api(harness, '/api/creador/perfil/publicar', {
      session, body: { creatorVersion: current.creatorVersion },
    });
    assert.equal(published.response.status, 200, JSON.stringify(published.body));
    current = await owner(harness, session);
  }
  return current;
}

function resourceFrom(snapshot, resourceId) {
  const resource = snapshot.resources.find(({ id }) => id === resourceId);
  assert.ok(resource, `owner snapshot includes ${resourceId}`);
  return resource;
}

function placementFor(snapshot, resourceId) {
  const entry = Object.entries(snapshot.placements)
    .find(([, placement]) => placement.resourceId === resourceId);
  assert.ok(entry, `owner snapshot includes a placement for ${resourceId}`);
  return entry[0];
}

async function addLink(harness, session, fields) {
  const current = await owner(harness, session);
  const result = await api(harness, '/api/creador/enlaces', {
    session, body: { creatorVersion: current.creatorVersion, ...fields },
  });
  return { ...result, before: current };
}

async function editLink(harness, session, resourceId, fields, { retired = false } = {}) {
  const current = await owner(harness, session);
  const resource = resourceFrom(current, resourceId);
  const path = retired
    ? `/api/creador/recursos/?id=${encodeURIComponent(resourceId)}`
    : `/api/creador/enlaces/${encodeURIComponent(placementFor(current, resourceId))}/editar`;
  const body = retired
    ? { resourceVersion: resource.version, ...fields }
    : { creatorVersion: current.creatorVersion, resourceVersion: resource.version, ...fields };
  return { ...(await api(harness, path, { session, method: 'PATCH', body })), before: current, resource };
}

async function removePlacement(harness, session, resourceId) {
  const current = await owner(harness, session);
  const placementId = placementFor(current, resourceId);
  const result = await api(harness, `/api/creador/enlaces/${encodeURIComponent(placementId)}`, {
    session, method: 'DELETE', body: { creatorVersion: current.creatorVersion },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

async function adminPatch(harness, resourceId, body) {
  return api(harness, `/api/admin/recursos/?id=${encodeURIComponent(resourceId)}`, {
    session: 'admin', method: 'PATCH', body,
  });
}

async function adminAction(harness, resourceId, action, version) {
  return api(harness, `/api/admin/recursos/${action}/?id=${encodeURIComponent(resourceId)}`, {
    session: 'admin', body: { version },
  });
}

function eventResource(id, {
  registrationUrl = `https://events.example/${id}`, version = 1, published = false,
  approvalRevoked = false, directoryControl = 'editorial', editorProfileId,
} = {}) {
  return {
    id, recordType: 'event', title: `Event ${id}`, registrationUrl,
    description: 'Event description', category: 'Eventos',
    startsAt: '2099-04-01T12:00:00.000Z', endsAt: '2099-04-01T13:00:00.000Z',
    timeZone: 'UTC', organizer: 'AWS Community', mode: 'online', published,
    approvalRevoked, hidden: false, directoryControl,
    ...(editorProfileId ? { editorProfileId } : {}), version,
  };
}

async function reference(harness, session, resource) {
  const current = await owner(harness, session);
  const result = await api(harness, '/api/creador/referencias', {
    session,
    body: {
      creatorVersion: current.creatorVersion, resourceId: resource.id,
      url: resource.url ?? resource.registrationUrl, selectedForDirectory: true,
    },
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body;
}

async function grant(harness, resourceId, session = 'creator-a') {
  const row = await harness.store.get(`resource:${resourceId}`);
  const claim = await api(harness, '/api/creador/reclamaciones', {
    session,
    body: {
      resources: [{ resourceId, url: row.url ?? row.registrationUrl }],
      evidence: 'Verified ownership evidence',
    },
  });
  assert.equal(claim.response.status, 202, JSON.stringify(claim.body));
  const linked = await api(harness, '/api/admin/reclamaciones/vincular', {
    session: 'admin', body: {
      accountId: session === 'creator-a' ? 'private-account-a' : 'private-account-b',
      resourceIds: [resourceId],
    },
  });
  assert.equal(linked.response.status, 200, JSON.stringify(linked.body));
  return linked.body;
}

test('creator Add accepts an optional empty classification and a complete taxonomy, persisted and read through v3', async (t) => {
  const cases = [
    { name: 'without taxonomy', fields: {}, expected: { state: 'absent' } },
    { name: 'with complete taxonomy', fields: CONTENT, expected: { state: 'explicit', ...CONTENT } },
  ];

  for (const [index, item] of cases.entries()) {
    await t.test(item.name, async () => {
      const harness = await createCreatorPagesHarness();
      await createProfile(harness, 'creator-a', { slug: `optional-${index}` });
      const added = await addLink(harness, 'creator-a', {
        title: `Optional ${item.name}`,
        url: `https://classification.example/optional-${index}`,
        ...item.fields,
      });
      assert.equal(added.response.status, 201, JSON.stringify(added.body));
      const row = await harness.store.get(`resource:${added.body.resourceId}`);
      assert.deepEqual(
        Object.fromEntries(['kind', 'format', 'topics'].filter((field) => Object.hasOwn(row, field))
          .map((field) => [field, row[field]])),
        item.expected.state === 'explicit' ? item.fields : {},
      );
      if (item.expected.state === 'explicit') assert.equal(row.category, 'Seguridad');
      else assert.equal(Object.hasOwn(row, 'category'), false);

      const read = await owner(harness, 'creator-a', { contract: '3' });
      assert.equal(read.schemaVersion, 3);
      const resource = resourceFrom(read, added.body.resourceId);
      assert.deepEqual(resource.classification, item.expected);
      assert.equal(resource.classificationEditable, true);
    });
  }
});

test('pending active classification remains creator-editable, and retained replacement stays editable after removal', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { slug: 'pending-replacement' });
  const added = await addLink(harness, 'creator-a', {
    title: 'Pending resource', url: 'https://classification.example/pending-replacement', ...CONTENT,
  });
  assert.equal(added.response.status, 201, JSON.stringify(added.body));

  const activeEdit = await editLink(harness, 'creator-a', added.body.resourceId, ALTERNATE_CONTENT);
  assert.equal(activeEdit.response.status, 200, JSON.stringify(activeEdit.body));
  const activeRow = await harness.store.get(`resource:${added.body.resourceId}`);
  assert.equal(activeRow.category, 'Seguridad');
  assert.deepEqual({ kind: activeRow.kind, format: activeRow.format, topics: activeRow.topics }, ALTERNATE_CONTENT);
  const sameTuple = await editLink(harness, 'creator-a', added.body.resourceId, ALTERNATE_CONTENT);
  assert.equal(sameTuple.response.status, 200, JSON.stringify(sameTuple.body));
  assert.equal(sameTuple.body.disposition, 'unchanged');
  assert.equal((await harness.store.get(`resource:${added.body.resourceId}`)).version, activeRow.version);

  await removePlacement(harness, 'creator-a', added.body.resourceId);
  const retired = await owner(harness);
  const retained = resourceFrom(retired, added.body.resourceId);
  assert.equal(retained.reincludeAllowed, true);
  const retiredEdit = await editLink(harness, 'creator-a', added.body.resourceId, {
    ...SOURCE, title: 'Retained correction',
  }, { retired: true });
  assert.equal(retiredEdit.response.status, 200, JSON.stringify(retiredEdit.body));
  const saved = await harness.store.get(`resource:${added.body.resourceId}`);
  assert.equal(saved.title, 'Retained correction');
  assert.equal(saved.category, 'Seguridad');
  assert.deepEqual({ kind: saved.kind, format: saved.format, topics: saved.topics }, SOURCE);
  const read = await owner(harness, 'creator-a', { contract: '3' });
  const resource = resourceFrom(read, added.body.resourceId);
  assert.deepEqual(resource.classification, { state: 'explicit', ...SOURCE });
  assert.equal(resource.classificationEditable, true);
});

for (const retired of [false, true]) {
  test(`approved community reclassification permits creator metadata edits (${retired ? 'retained' : 'active'})`, async () => {
    const harness = await createCreatorPagesHarness();
    const profile = await createProfile(harness, 'creator-a', { slug: `community-city-${retired ? 'retained' : 'active'}` });
    const resource = {
      id: `community-city-${retired ? 'retained' : 'active'}`,
      title: 'Community with reviewed city', url: 'https://classification.example/community-city',
      description: 'Community description', category: 'Comunidad', kind: 'community', format: 'User Group', topics: [],
      country: 'AR', city: 'Córdoba', order: 1, featured: false, published: true, hidden: false,
      approvalRevoked: false, directoryControl: 'creator', editorProfileId: profile.profile.id, version: 1,
    };
    await seedResource(harness.store, resource);
    await grant(harness, resource.id);
    const before = await harness.store.get(`resource:${resource.id}`);
    const classified = await adminPatch(harness, resource.id, {
      version: before.version, category: 'Blog', kind: 'source', format: 'Blog', topics: [],
    });
    assert.equal(classified.response.status, 200, JSON.stringify(classified.body));
    const afterClassification = await harness.store.get(`resource:${resource.id}`);
    assert.equal(afterClassification.city, 'Córdoba', 'reclassification preserves inactive city storage');
    assert.equal(afterClassification.kind, 'source');
    assert.equal(Object.hasOwn(projectPublicRecord(afterClassification), 'city'), false,
      'public source projection omits the inactive city');
    if (retired) await removePlacement(harness, 'creator-a', resource.id);
    const edited = await editLink(harness, 'creator-a', resource.id, { title: 'Source title correction' }, { retired });
    assert.equal(edited.response.status, 200, JSON.stringify(edited.body));
    const saved = await harness.store.get(`resource:${resource.id}`);
    assert.equal(saved.title, 'Source title correction');
    assert.equal(saved.city, 'Córdoba', 'inactive city remains retained after metadata edit');
  });
}

test('pending community city remains stored when its classification changes to source', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness, 'creator-a', { slug: 'pending-community-city' });
  const resource = {
    id: 'pending-community-city', title: 'Pending community',
    url: 'https://classification.example/pending-community-city', description: 'Pending description',
    category: 'Comunidad', kind: 'community', format: 'User Group', topics: [],
    country: 'AR', city: 'Córdoba', order: 1, featured: false, published: false, hidden: false,
    approvalRevoked: false, directoryControl: 'creator', editorProfileId: profile.profile.id, version: 1,
  };
  await seedResource(harness.store, resource);
  await reference(harness, 'creator-a', resource);
  const edited = await editLink(harness, 'creator-a', resource.id, { ...SOURCE, title: 'Pending source' });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.body));
  const saved = await harness.store.get(`resource:${resource.id}`);
  assert.equal(saved.kind, 'source');
  assert.equal(saved.city, 'Córdoba');
});

test('owner Add and edit reject partial, incompatible, and invalid-topic taxonomy without persisted effects', async (t) => {
  const cases = [
    { name: 'partial taxonomy', fields: { kind: 'content' } },
    { name: 'incompatible kind and format', fields: { kind: 'content', format: 'Blog', topics: [] } },
    { name: 'invalid topic', fields: { ...CONTENT, topics: ['Not a catalog topic'] } },
  ];
  for (const [index, item] of cases.entries()) {
    await t.test(item.name, async () => {
      const harness = await createCreatorPagesHarness();
      const profile = await createProfile(harness, 'creator-a', { slug: `invalid-owner-${index}` });
      const beforeProfile = await harness.store.get(`profile:${profile.profile.id}`);
      const added = await addLink(harness, 'creator-a', {
        title: `Invalid ${item.name}`, url: `https://classification.example/invalid-${index}`, ...item.fields,
      });
      assert.equal(added.response.status, 422, JSON.stringify(added.body));
      assert.deepEqual(await harness.store.list('resource:'), []);
      assert.deepEqual(await harness.store.list('url:'), []);
      assert.deepEqual(await harness.store.get(`profile:${profile.profile.id}`), beforeProfile);

      const resource = {
        id: `invalid-edit-${index}`, title: 'Valid pending resource',
        url: `https://classification.example/invalid-edit-${index}`, description: '',
        category: 'Seguridad', ...CONTENT, order: 1, featured: false, published: false,
        hidden: false, approvalRevoked: false, directoryControl: 'creator',
        editorProfileId: profile.profile.id, version: 1,
      };
      await seedResource(harness.store, resource);
      await reference(harness, 'creator-a', resource);
      const before = await harness.store.get(`resource:${resource.id}`);
      const writes = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
      const edited = await editLink(harness, 'creator-a', resource.id, item.fields);
      assert.equal(edited.response.status, 422, JSON.stringify(edited.body));
      assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writes);
      assert.deepEqual(await harness.store.get(`resource:${resource.id}`), before);
      assert.deepEqual(await harness.store.get(currentUrlKey(resource.url)), {
        id: currentUrlReservationId(resource.url),
        recordType: 'urlReservation', url: resource.url, status: 'reserved', resourceId: resource.id, version: 1,
      });
    });
  }
});

test('omitted classification is a no-op and preserves a long description accepted by another entry point', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness, 'creator-a', { slug: 'long-description' });
  const resource = {
    id: 'long-description-resource',
    title: 'Long imported description',
    url: 'https://classification.example/long-description',
    description: 'x'.repeat(4000),
    category: 'Seguridad', ...CONTENT,
    order: 1, featured: false, published: false, hidden: false, approvalRevoked: false,
    directoryControl: 'creator', editorProfileId: profile.profile.id, version: 1,
  };
  await seedResource(harness.store, resource);
  await reference(harness, 'creator-a', resource);
  const before = await harness.store.get(`resource:${resource.id}`);

  const noop = await editLink(harness, 'creator-a', resource.id, {});
  assert.equal(noop.response.status, 200, JSON.stringify(noop.body));
  assert.deepEqual(await harness.store.get(`resource:${resource.id}`), before);

  const changed = await editLink(harness, 'creator-a', resource.id, { title: 'Only title changed' });
  assert.equal(changed.response.status, 200, JSON.stringify(changed.body));
  const saved = await harness.store.get(`resource:${resource.id}`);
  assert.equal(saved.title, 'Only title changed');
  assert.equal(saved.description, resource.description);
  assert.deepEqual({ kind: saved.kind, format: saved.format, topics: saved.topics }, CONTENT);
});

test('title-only editing of a pending historical row does not materialize taxonomy keys', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness, 'creator-a', { slug: 'legacy-pending-title' });
  const resource = {
    id: 'legacy-pending-title', title: 'Historical title', url: 'https://example.com/legacy-pending-title',
    description: 'Historical description', category: 'Blog', order: 1, featured: false,
    published: false, hidden: false, approvalRevoked: false,
    directoryControl: 'creator', editorProfileId: profile.profile.id, version: 1,
  };
  await seedResource(harness.store, resource);
  await reference(harness, 'creator-a', resource);
  const edited = await editLink(harness, 'creator-a', resource.id, { title: 'Historical correction' });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.body));
  const saved = await harness.store.get(`resource:${resource.id}`);
  assert.equal(saved.title, 'Historical correction');
  assert.equal(Object.hasOwn(saved, 'kind'), false);
  assert.equal(Object.hasOwn(saved, 'format'), false);
  assert.equal(Object.hasOwn(saved, 'topics'), false);
  const read = await owner(harness, 'creator-a', { contract: '3' });
  assert.deepEqual(resourceFrom(read, resource.id).classification, {
    state: 'legacy', kind: 'source', format: 'Blog', topics: [],
  });
});

test('pending content with a level rejects a source taxonomy change before writing', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness, 'creator-a', { slug: 'pending-level-taxonomy' });
  const resource = {
    id: 'pending-level-taxonomy', title: 'Levelled content', url: 'https://example.com/pending-level-taxonomy',
    description: 'Pending content', category: 'Seguridad', ...CONTENT, level: 'inicial', order: 1,
    featured: false, published: false, hidden: false, approvalRevoked: false,
    directoryControl: 'creator', editorProfileId: profile.profile.id, version: 1,
  };
  await seedResource(harness.store, resource);
  await reference(harness, 'creator-a', resource);
  const before = await harness.store.get(`resource:${resource.id}`);
  const writes = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const edited = await editLink(harness, 'creator-a', resource.id, SOURCE);
  assert.equal(edited.response.status, 422, JSON.stringify(edited.body));
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writes);
  assert.deepEqual(await harness.store.get(`resource:${resource.id}`), before);
  assert.equal((await harness.store.get(`resource:${resource.id}`)).level, 'inicial');
});

test('revoked creator resources retain ordinary metadata editing without public admission validation', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness, 'creator-a', { slug: 'revoked-metadata' });
  const resource = {
    id: 'revoked-unclassified', title: 'Revoked historical resource',
    url: 'https://classification.example/revoked-unclassified', description: '',
    published: false, approvalRevoked: true, hidden: false,
    directoryControl: 'creator', editorProfileId: profile.profile.id, version: 1,
  };
  await seedResource(harness.store, resource);
  await reference(harness, 'creator-a', resource);
  const edited = await editLink(harness, 'creator-a', resource.id, { title: 'Revoked title correction' });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.body));
  const saved = await harness.store.get(`resource:${resource.id}`);
  assert.equal(saved.title, 'Revoked title correction');
  assert.equal(saved.approvalRevoked, true);
  assert.equal(Object.hasOwn(saved, 'category'), false);
});

test('duplicate reuse keeps the winning metadata and authority, including a concurrent loser', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', { slug: 'reuse-a' });
  await createProfile(harness, 'creator-b', { slug: 'reuse-b' });
  const url = 'https://classification.example/reused';
  const winner = await addLink(harness, 'creator-a', {
    title: 'Winner title', url, ...CONTENT,
  });
  assert.equal(winner.response.status, 201, JSON.stringify(winner.body));
  const loser = await addLink(harness, 'creator-b', {
    title: 'Loser title', url, ...SOURCE,
  });
  assert.equal(loser.response.status, 201, JSON.stringify(loser.body));
  assert.equal(loser.body.disposition, 'resource-reused');
  assert.equal(loser.body.resourceId, winner.body.resourceId);
  const stored = await harness.store.get(`resource:${winner.body.resourceId}`);
  assert.equal(stored.title, 'Winner title');
  assert.deepEqual({ kind: stored.kind, format: stored.format, topics: stored.topics }, CONTENT);
  const loserRead = await owner(harness, 'creator-b', { contract: '3' });
  const loserResource = resourceFrom(loserRead, winner.body.resourceId);
  assert.equal(loserResource.metadataEditable, false);
  assert.deepEqual(loserResource.classification, { state: 'explicit', ...CONTENT });

  const raced = await createDynamoMoveHarness({ projectionAware: true });
  await createProfile(raced, 'creator-a', { slug: 'race-a' });
  await createProfile(raced, 'creator-b', { slug: 'race-b' });
  let concurrentWinner;
  raced.mock.raceBeforeNextTransaction(async () => {
    concurrentWinner = await addLink(raced, 'creator-b', {
      title: 'Concurrent winner', url: 'https://classification.example/race', ...SOURCE,
    });
    assert.equal(concurrentWinner.response.status, 201, JSON.stringify(concurrentWinner.body));
  });
  const concurrentLoser = await addLink(raced, 'creator-a', {
    title: 'Concurrent loser', url: 'https://classification.example/race', ...CONTENT,
  });
  assert.ok(concurrentWinner);
  assert.equal(concurrentLoser.response.status, 201, JSON.stringify(concurrentLoser.body));
  assert.equal(concurrentLoser.body.disposition, 'resource-reused');
  assert.equal(concurrentLoser.body.resourceId, concurrentWinner.body.resourceId);
  const racedRow = await raced.store.get(`resource:${concurrentWinner.body.resourceId}`);
  assert.equal(racedRow.title, 'Concurrent winner');
  assert.deepEqual({ kind: racedRow.kind, format: racedRow.format, topics: racedRow.topics }, SOURCE);
  const racedRows = raced.mock.readTable(CATALOG_TABLE)
    .filter((value) => value.url === 'https://classification.example/race' && value.recordType !== 'urlReservation');
  assert.deepEqual(racedRows.map((value) => value.id), [concurrentWinner.body.resourceId]);
  assert.deepEqual(await raced.store.get(currentUrlKey('https://classification.example/race')), {
    id: currentUrlReservationId('https://classification.example/race'),
    recordType: 'urlReservation',
    url: 'https://classification.example/race',
    status: 'reserved',
    resourceId: concurrentWinner.body.resourceId,
    version: 1,
  });
  const racedLoserRead = await owner(raced, 'creator-a', { contract: '3' });
  const racedWinnerRead = await owner(raced, 'creator-b', { contract: '3' });
  assert.equal(resourceFrom(racedLoserRead, racedRow.id).metadataEditable, false);
  assert.equal(resourceFrom(racedWinnerRead, racedRow.id).metadataEditable, true);
  assert.deepEqual(Object.values(racedLoserRead.placements).map(({ resourceId }) => resourceId), [racedRow.id]);
  assert.deepEqual(Object.values(racedWinnerRead.placements).map(({ resourceId }) => resourceId), [racedRow.id]);
  assert.deepEqual(await raced.store.list(`editor:${racedLoserRead.profile.id}:`), []);
  assert.deepEqual((await raced.store.list(`editor:${racedWinnerRead.profile.id}:`))
    .map(({ value }) => value.resourceId), [racedRow.id]);
});

for (const state of ['approved', 'revoked']) {
  test(`creator classification is forbidden on ${state} resources without a write`, async () => {
    const harness = await createCreatorPagesHarness();
    const profile = await createProfile(harness, 'creator-a', { slug: `forbidden-${state}` });
    const resource = {
      id: `forbidden-${state}`, title: `${state} resource`,
      url: `https://classification.example/forbidden-${state}`, description: '', category: 'Seguridad', ...CONTENT,
      order: 1, featured: false, published: false, hidden: false, approvalRevoked: false,
      directoryControl: 'creator', editorProfileId: profile.profile.id, version: 1,
    };
    await seedResource(harness.store, resource);
    await reference(harness, 'creator-a', resource);
    let row = await harness.store.get(`resource:${resource.id}`);
    const approved = await adminAction(harness, resource.id, 'aprobar', row.version);
    assert.equal(approved.response.status, 200, JSON.stringify(approved.body));
    if (state === 'revoked') {
      row = await harness.store.get(`resource:${resource.id}`);
      const revoked = await adminAction(harness, resource.id, 'revocar', row.version);
      assert.equal(revoked.response.status, 200, JSON.stringify(revoked.body));
    }
    const before = await harness.store.get(`resource:${resource.id}`);
    const writes = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
    const edited = await editLink(harness, 'creator-a', resource.id, ALTERNATE_CONTENT);
    assert.equal(edited.response.status, 403, JSON.stringify(edited.body));
    assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writes);
    assert.deepEqual(await harness.store.get(`resource:${resource.id}`), before);
  });
}

test('creator classification is forbidden on an event even when its row grants metadata authority', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness, 'creator-a', { slug: 'event-classification' });
  const resource = eventResource('meetup-event-classification', {
    directoryControl: 'creator', editorProfileId: profile.profile.id,
  });
  await seedResource(harness.store, resource);
  await reference(harness, 'creator-a', resource);
  const before = await harness.store.get(`resource:${resource.id}`);
  const writes = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const edited = await editLink(harness, 'creator-a', resource.id, CONTENT);
  assert.equal(edited.response.status, 403, JSON.stringify(edited.body));
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writes);
  assert.deepEqual(await harness.store.get(`resource:${resource.id}`), before);
});

test('owner read derives effective classification permission from current state', async () => {
  const harness = await createCreatorPagesHarness();
  const profile = await createProfile(harness, 'creator-a', { slug: 'derived-permission' });
  const seedPermission = async (id, title) => {
    const resource = {
      id, title, url: `https://classification.example/${id}`, description: '', category: 'Seguridad', ...CONTENT,
      order: 1, featured: false, published: false, hidden: false, approvalRevoked: false,
      directoryControl: 'creator', editorProfileId: profile.profile.id, version: 1,
    };
    await seedResource(harness.store, resource);
    await reference(harness, 'creator-a', resource);
    return resource;
  };
  const pending = await seedPermission('permission-pending', 'Pending');
  const approved = await seedPermission('permission-approved', 'Approved');
  let row = await harness.store.get(`resource:${approved.id}`);
  assert.equal((await adminAction(harness, approved.id, 'aprobar', row.version)).response.status, 200);
  const revoked = await seedPermission('permission-revoked', 'Revoked');
  row = await harness.store.get(`resource:${revoked.id}`);
  assert.equal((await adminAction(harness, revoked.id, 'aprobar', row.version)).response.status, 200);
  row = await harness.store.get(`resource:${revoked.id}`);
  assert.equal((await adminAction(harness, revoked.id, 'revocar', row.version)).response.status, 200);
  const event = eventResource('meetup-event-permission', {
    directoryControl: 'creator', editorProfileId: profile.profile.id,
  });
  await seedResource(harness.store, event);
  await reference(harness, 'creator-a', event);

  const read = await owner(harness, 'creator-a', { contract: '3' });
  assert.equal(read.schemaVersion, 3);
  assert.deepEqual(resourceFrom(read, pending.id).classification, { state: 'explicit', ...CONTENT });
  assert.equal(resourceFrom(read, pending.id).classificationEditable, true);
  assert.equal(resourceFrom(read, approved.id).classificationEditable, false);
  assert.equal(resourceFrom(read, revoked.id).classificationEditable, false);
  assert.deepEqual(resourceFrom(read, event.id).classification, { state: 'event' });
  assert.equal(resourceFrom(read, event.id).classificationEditable, false);
});

test('real admin edit and approval races preserve the winning classification and unrelated metadata', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  const profile = await createProfile(harness, 'creator-a', { slug: 'admin-race' });
  const addedResource = {
    id: 'admin-race-resource', title: 'Race title', url: 'https://classification.example/admin-race',
    description: 'Race description', category: 'Seguridad', ...CONTENT, order: 1, featured: false,
    published: false, hidden: false, approvalRevoked: false,
    directoryControl: 'creator', editorProfileId: profile.profile.id, version: 1,
  };
  await seedResource(harness.store, addedResource);
  await reference(harness, 'creator-a', addedResource);
  const original = await harness.store.get(`resource:${addedResource.id}`);
  let approval;
  harness.mock.raceBeforeNextTransaction(async () => {
    const observed = await harness.store.get(`resource:${addedResource.id}`);
    approval = await adminAction(harness, addedResource.id, 'aprobar', observed.version);
    assert.equal(approval.response.status, 200, JSON.stringify(approval.body));
  });
  const creatorAttempt = await editLink(harness, 'creator-a', addedResource.id, {
    ...ALTERNATE_CONTENT, title: 'Must lose to approval',
  });
  assert.equal(creatorAttempt.response.status, 409, JSON.stringify(creatorAttempt.body));
  const approved = await harness.store.get(`resource:${addedResource.id}`);
  assert.equal(approved.published, true);
  assert.equal(approved.title, original.title);
  assert.deepEqual({ kind: approved.kind, format: approved.format, topics: approved.topics }, CONTENT);

  const second = {
    id: 'admin-race-second', title: 'Second race', url: 'https://classification.example/admin-race-second',
    description: 'Second description', category: 'Seguridad', ...CONTENT, order: 1, featured: false,
    published: false, hidden: false, approvalRevoked: false,
    directoryControl: 'creator', editorProfileId: profile.profile.id, version: 1,
  };
  await seedResource(harness.store, second);
  await reference(harness, 'creator-a', second);
  let creatorEdit;
  harness.mock.raceBeforeNextTransaction(async () => {
    creatorEdit = await editLink(harness, 'creator-a', second.id, {
      ...SOURCE, title: 'Creator wins moderation race',
    });
    assert.equal(creatorEdit.response.status, 200, JSON.stringify(creatorEdit.body));
  });
  const approvalAfterEdit = await adminAction(
    harness, second.id, 'aprobar',
    (await harness.store.get(`resource:${second.id}`)).version,
  );
  assert.equal(approvalAfterEdit.response.status, 409, JSON.stringify(approvalAfterEdit.body));
  assert.ok(creatorEdit);
  const editedPending = await harness.store.get(`resource:${second.id}`);
  assert.equal(editedPending.published, false);
  assert.equal(editedPending.title, 'Creator wins moderation race');
  assert.deepEqual({ kind: editedPending.kind, format: editedPending.format, topics: editedPending.topics }, SOURCE);
});

for (const retired of [false, true]) {
  for (const field of ['title', 'url']) {
    const scenario = field === 'title' ? 'preexisting invalid' : 'candidate-invalidating';
    test(`approved legacy ${retired ? 'retired' : 'active'} ${scenario} ${field} edit rejects atomically`, async () => {
      const harness = await createCreatorPagesHarness();
      const profile = await createProfile(harness, 'creator-a', {
        slug: `legacy-${retired ? 'retired' : 'active'}-${field}`,
      });
      const resource = {
        id: `legacy-invalid-${retired ? 'retired' : 'active'}-${field}`,
        title: field === 'title' ? 'Historical channel' : 'Historical article',
        url: field === 'title'
          ? `https://youtube.com/@historical-${field}`
          : `https://example.com/historical-${field}`,
        description: 'Historical data',
        category: field === 'title' ? 'Blog' : 'Otros',
        level: 'inicial',
        order: 1, featured: false, published: true, approvalRevoked: false, hidden: false,
        directoryControl: 'creator', editorProfileId: profile.profile.id, version: 1,
      };
      await seedResource(harness.store, resource);
      await reference(harness, 'creator-a', resource);
      if (retired) {
        // The retained editor reference is produced by the real grant flow;
        // placement removal itself remains the public owner operation.
        await grant(harness, resource.id);
        await removePlacement(harness, 'creator-a', resource.id);
      }
      const before = await harness.store.get(`resource:${resource.id}`);
      const reservationBefore = await harness.store.get(currentUrlKey(resource.url));
      const writes = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
      const attempted = await editLink(harness, 'creator-a', resource.id, {
        [field]: field === 'title' ? 'Changed historical title' : 'https://youtube.com/@changed-historical',
      }, { retired });
      assert.equal(attempted.response.status, 422, JSON.stringify(attempted.body));
      assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writes);
      assert.deepEqual(await harness.store.get(`resource:${resource.id}`), before);
      assert.deepEqual(await harness.store.get(currentUrlKey(resource.url)), reservationBefore);
    });
  }
}

for (const visibility of ['hidden', 'deselected']) {
  test(`approved ${visibility} creator resource rejects legacy URL invalidation even outside catalogue admission`, async () => {
    const harness = await createCreatorPagesHarness();
    const profile = await createProfile(harness, 'creator-a', { slug: `legacy-${visibility}-url` });
    const resource = {
      id: `legacy-${visibility}-url`, title: 'Historical article',
      url: `https://example.com/legacy-${visibility}-url`, description: '', category: 'Otros', level: 'inicial',
      order: 1, featured: false, published: true, approvalRevoked: false,
      hidden: visibility === 'hidden', directoryControl: 'creator', editorProfileId: profile.profile.id, version: 1,
    };
    await seedResource(harness.store, resource);
    const current = await owner(harness);
    const referenceResult = await api(harness, '/api/creador/referencias', {
      body: {
        creatorVersion: current.creatorVersion, resourceId: resource.id, url: resource.url,
        selectedForDirectory: visibility !== 'deselected',
      },
    });
    assert.equal(referenceResult.response.status, 201, JSON.stringify(referenceResult.body));
    const before = await harness.store.get(`resource:${resource.id}`);
    const writes = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
    const edited = await editLink(harness, 'creator-a', resource.id, {
      url: `https://youtube.com/@legacy-${visibility}-url`,
    });
    assert.equal(edited.response.status, 422, JSON.stringify(edited.body));
    assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writes);
    assert.deepEqual(await harness.store.get(`resource:${resource.id}`), before);
  });
}

test('administrative mixed taxonomy on an event is rejected before any write', async () => {
  const harness = await createCreatorPagesHarness();
  const resource = eventResource('meetup-event-mixed-taxonomy');
  await seedResource(harness.store, resource);
  const before = await harness.store.get(`resource:${resource.id}`);
  assert.doesNotThrow(() => projectPublicRecord(before), 'the control event is valid before the mixed taxonomy PATCH');
  const writes = harness.store.calls.filter(({ operation }) => operation === 'transact').length;
  const response = await adminPatch(harness, resource.id, {
    version: before.version, category: 'Eventos', ...CONTENT,
  });
  assert.equal(response.response.status, 422, JSON.stringify(response.body));
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'transact').length, writes);
  assert.deepEqual(await harness.store.get(`resource:${resource.id}`), before);
});

test('programmatic import rejects partial taxonomy before writes, while a legacy full import remains valid', async () => {
  const partial = [{
    id: 'partial-import', title: 'Partial import', url: 'https://classification.example/import-partial',
    description: '', category: 'Seguridad', order: 1, featured: false, published: true, kind: 'content',
  }];
  let writes = 0;
  await assert.rejects(importCatalog(partial, {
    tableName: CATALOG_TABLE,
    getCallerIdentity: async () => ({ Account: '719535286359' }),
    getItem: async () => ({ Item: undefined }),
    transactWrite: async () => { writes += 1; },
  }), /taxonomy|classification|invalid/i);
  assert.equal(writes, 0);

  const legacy = mapTsvRows(parseCatalogTsv(
    'title\turl\ttext\tCategory\tHide\tRank\timgUrl\tOrder\tDestacado\n'
    + 'Legacy import\thttps://classification.example/import-legacy\tDescription\tSeguridad\t\t\t\t1\t\n',
  ));
  const records = new Map();
  const imported = await importCatalog(legacy, {
    tableName: CATALOG_TABLE,
    getCallerIdentity: async () => ({ Account: '719535286359' }),
    getItem: async ({ Key }) => ({ Item: records.get(Key.id) }),
    transactWrite: async ({ TransactItems }) => {
      for (const { Put } of TransactItems) records.set(Put.Item.id, structuredClone(Put.Item));
    },
  });
  assert.deepEqual(imported, { total: 1, created: 1, skipped: 0 });
  const saved = records.get(legacy[0].id);
  assert.deepEqual({ kind: saved.kind, format: saved.format, topics: saved.topics }, {
    kind: 'content', format: 'Artículo', topics: ['Seguridad'],
  });
});

test('canonical legacy community classification is shared by resolver, catalog projection, and import', async () => {
  const record = {
    id: 'community-legacy', title: 'AWS Community Córdoba',
    url: 'https://community.example/cordoba', description: 'Community description',
    category: 'Comunidad', order: 1, featured: false, published: true,
  };
  assert.deepEqual(resolveResourceClassification(record), {
    state: 'legacy', kind: 'community', format: 'User Group', topics: [],
  });
  assert.deepEqual(projectPublicRecord(record), {
    id: record.id,
    title: record.title,
    url: record.url,
    description: record.description,
    category: record.category,
    order: record.order,
    featured: record.featured,
    kind: 'community', format: 'User Group', topics: [],
  });

  const importedRows = mapTsvRows(parseCatalogTsv(
    'title\turl\ttext\tCategory\tHide\tRank\timgUrl\tOrder\tDestacado\n'
    + 'Legacy community\thttps://community.example/import\tDescription\tComunidad\t\t\t\t1\t\n',
  ));
  assert.deepEqual({
    kind: importedRows[0].kind, format: importedRows[0].format, topics: importedRows[0].topics,
  }, { kind: 'community', format: 'User Group', topics: [] });

  const stored = new Map();
  const imported = await importCatalog(importedRows, {
    tableName: CATALOG_TABLE,
    getCallerIdentity: async () => ({ Account: '719535286359' }),
    getItem: async ({ Key }) => ({ Item: stored.get(Key.id) }),
    transactWrite: async ({ TransactItems }) => {
      for (const { Put } of TransactItems) stored.set(Put.Item.id, structuredClone(Put.Item));
    },
  });
  assert.deepEqual(imported, { total: 1, created: 1, skipped: 0 });
  assert.deepEqual({
    kind: stored.get(importedRows[0].id).kind,
    format: stored.get(importedRows[0].id).format,
    topics: stored.get(importedRows[0].id).topics,
  }, { kind: 'community', format: 'User Group', topics: [] });

  const arbitraryHistorical = {
    id: 'arbitrary-historical', title: 'Editorial category',
    url: 'https://community.example/editorial', description: 'Description',
    category: 'Editorial', order: 1, featured: false,
  };
  assert.deepEqual(resolveResourceClassification(arbitraryHistorical), {
    state: 'legacy', kind: 'content', format: 'Artículo', topics: [],
  });
  assert.doesNotThrow(() => projectPublicRecord(arbitraryHistorical));
});

test('anonymous submission, creator reuse and grant, edit, moderation, and public readers share one row without leaking contact data', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  const access = await createDynamoCatalogAccess({ docClient: harness.mock.client, region: 'us-east-1' });
  const resourceId = 'anonymous-shared-classification';
  const submit = createSubmissionHandler({
    tableName: CATALOG_TABLE, ...access, resourceId: () => resourceId,
    now: () => '2026-11-23T12:00:00.000Z',
  });
  const submitted = await submit({
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'private-submit@example.invalid', full_name: 'Private Submitter',
      title: 'Anonymous title', url: 'https://classification.example/anonymous-shared',
      text: 'd'.repeat(4000), kind: 'content', format: 'Artículo', topics: ['Seguridad'], website: '',
    }),
  });
  assert.equal(submitted.statusCode, 201, submitted.body);
  const profile = await createProfile(harness, 'creator-a', { slug: 'shared-public', publish: true });
  const reused = await addLink(harness, 'creator-a', {
    title: 'Creator draft must not overwrite',
    url: 'https://classification.example/anonymous-shared', ...SOURCE,
  });
  assert.equal(reused.response.status, 201, JSON.stringify(reused.body));
  assert.equal(reused.body.disposition, 'resource-reused');
  assert.equal(reused.body.resourceId, resourceId);
  let row = await harness.store.get(`resource:${resourceId}`);
  assert.equal(row.title, 'Anonymous title');
  assert.equal(row.submitterEmail, 'private-submit@example.invalid');
  assert.deepEqual({ kind: row.kind, format: row.format, topics: row.topics }, CONTENT);

  const claim = await api(harness, '/api/creador/reclamaciones', {
    session: 'creator-a', body: {
      resources: [{ resourceId, url: row.url }], evidence: 'I maintain this resource',
    },
  });
  assert.equal(claim.response.status, 202, JSON.stringify(claim.body));
  const linked = await api(harness, '/api/admin/reclamaciones/vincular', {
    session: 'admin', body: { accountId: 'private-account-a', resourceIds: [resourceId] },
  });
  assert.equal(linked.response.status, 200, JSON.stringify(linked.body));
  const granted = await owner(harness, 'creator-a', { contract: '3' });
  assert.equal(resourceFrom(granted, resourceId).metadataEditable, true);

  const edited = await editLink(harness, 'creator-a', resourceId, {
    title: 'Creator title', ...ALTERNATE_CONTENT,
  });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.body));
  row = await harness.store.get(`resource:${resourceId}`);
  assert.equal(row.title, 'Creator title');
  assert.equal(row.description, 'd'.repeat(4000));
  assert.equal(row.submitterEmail, 'private-submit@example.invalid');
  assert.deepEqual({ kind: row.kind, format: row.format, topics: row.topics }, ALTERNATE_CONTENT);

  const approval = await adminAction(harness, resourceId, 'aprobar', row.version);
  assert.equal(approval.response.status, 200, JSON.stringify(approval.body));
  const publicProfile = await harness.service.readPublicProfile(profile.profile.slug);
  assert.equal(publicProfile.status, 200);
  const publicLink = publicProfile.links.find(({ resourceId: id }) => id === resourceId);
  assert.ok(publicLink);
  assert.equal(publicLink.title, 'Creator title');
  assert.equal(publicLink.url, row.url);
  assert.equal(publicLink.description, 'd'.repeat(4000));
  assert.equal(Object.hasOwn(publicLink, 'submitterEmail'), false);

  const catalog = await loadCatalog({
    fixturePath: '', tableName: CATALOG_TABLE, creatorTableName: PROFILES_TABLE,
    scanPage: async () => ({ Items: [harness.mock.read(CATALOG_TABLE, { id: resourceId })] }),
    scanCreatorPage: async () => ({
      Items: [harness.mock.read(PROFILES_TABLE, { pk: `PROFILE#${profile.profile.id}`, sk: 'META' })],
    }),
  });
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, resourceId);
  assert.equal(catalog[0].title, 'Creator title');
  assert.equal(catalog[0].description, 'd'.repeat(4000));
  assert.deepEqual({ kind: catalog[0].kind, format: catalog[0].format, topics: catalog[0].topics }, ALTERNATE_CONTENT);
  assert.equal(Object.hasOwn(catalog[0], 'submitterEmail'), false);
});

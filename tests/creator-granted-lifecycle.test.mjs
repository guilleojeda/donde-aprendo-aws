import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { currentUrlCollision, currentUrlKey, currentUrlReservation } from '../src/lib/catalog-url.mjs';
import { classifyReservation } from '../src/lib/catalog-resource-writer.mjs';
import { callApi, sessionCsrf } from './fixtures/creator-pages.mjs';
import { createDynamoMoveHarness } from './fixtures/creator-link-move.mjs';

// Request/Response acceptance uses the real service and DynamoDB adapter. Only
// authentication and the physical SDK transport are controlled. In particular,
// no setup helper supplies a grant, placement or URL-departure decision.
const U = 'https://catalog.example/shared?literal=%2f';
const V = 'https://catalog.example/current-r/';
const W = 'https://catalog.example/current-s/';
const R = 'legacy:granted:R';
const S = 'legacy:granted:S';
const T = 'legacy:granted:T';
const CATALOG = 'catalog-test';

async function api(harness, path, body, { method = 'POST', session = 'creator-a' } = {}) {
  const response = await callApi(harness, path, {
    method, session, csrf: sessionCsrf[session], ...(body === undefined ? {} : { body }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
}

function accepted(result, status) {
  assert.equal(result.status, status, JSON.stringify(result.body));
  return result.body;
}

async function owner(harness, session = 'creator-a') {
  return accepted(await api(harness, '/api/creador/perfil', undefined, { method: 'GET', session }), 200);
}

function catalogRecord(id, { event = false } = {}) {
  return {
    id, title: `Imported ${id}`, description: 'Imported description', version: 1,
    published: true, hidden: false, approvalRevoked: false, directoryControl: 'editorial',
    ...(event ? {
      recordType: 'event', registrationUrl: U,
      startsAt: '2099-04-01T12:00:00.000Z', endsAt: '2099-04-01T13:00:00.000Z',
      timeZone: 'UTC', organizer: 'Comunidad AWS', mode: 'online',
    } : { url: U, kind: 'content', format: 'Artículo', topics: [], order: 1, featured: false }),
  };
}

const oldStates = [
  { name: 'unique', row: (id) => currentUrlReservation(U, id), remaining: null },
  { name: 'absent', row: () => null, remaining: null },
  { name: 'two cohosts', row: (id) => currentUrlCollision(U, [id, S]), remaining: () => currentUrlReservation(U, S) },
  { name: 'three cohosts', row: (id) => currentUrlCollision(U, [id, S, T]), remaining: () => currentUrlCollision(U, [S, T]) },
  { name: 'unindexed with another unique owner', row: () => currentUrlReservation(U, S), remaining: () => currentUrlReservation(U, S) },
  { name: 'unindexed with other cohosts', row: () => currentUrlCollision(U, [S, T]), remaining: () => currentUrlCollision(U, [S, T]) },
];

async function claimAndGrant(harness, resourceId, session = 'creator-a') {
  const accountId = session === 'creator-a' ? 'private-account-a' : 'private-account-b';
  const observed = await harness.store.get(`resource:${resourceId}`);
  accepted(await api(harness, '/api/creador/reclamaciones', {
    resources: [{ resourceId, url: observed.registrationUrl ?? observed.url }], evidence: 'Exact resource authorship',
  }, { session }), 202);
  assert.deepEqual(await harness.store.get(`resource:${resourceId}`), observed, 'requesting authority does not grant it');
  accepted(await api(harness, '/api/admin/reclamaciones/vincular', {
    accountId, resourceIds: [resourceId],
  }, { session: 'admin' }), 200);
  const current = await owner(harness, session);
  assert.ok(current.editableResources.some(({ id }) => id === resourceId), 'the real grant is visible through the owner read');
  assert.ok(current.links.some((link) => link.resourceId === resourceId));
  return current;
}

async function fixture(state, { event = false, grant = true } = {}) {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  for (const session of ['creator-a', 'creator-b']) {
    accepted(await api(harness, '/api/creador/perfil', {
      displayName: session, slug: `granted-${session}`, programs: [], socials: {},
    }, { method: 'PUT', session }), 200);
  }
  accepted(await api(harness, '/api/creador/perfil/publicar', {}), 200);
  // Event identity has its own existing syntax; generic historical IDs retain
  // their exact colons. All are well inside the approved byte limit.
  const resourceId = event ? 'meetup-event:123:456' : R;
  for (const id of [resourceId, S, T]) harness.mock.seed(CATALOG, catalogRecord(id, { event: event && id === resourceId }));
  const oldRow = state.row(resourceId);
  if (oldRow) harness.mock.seed(CATALOG, oldRow);
  if (grant) await claimAndGrant(harness, resourceId);
  return { harness, resourceId, oldRow };
}

async function remove(harness, resourceId) {
  const before = await owner(harness);
  const link = before.links.find((item) => item.resourceId === resourceId);
  assert.ok(link);
  accepted(await api(harness, `/api/creador/enlaces/${encodeURIComponent(link.placementId)}`, {
    profileVersion: before.profile.version,
  }, { method: 'DELETE' }), 204);
  const after = await owner(harness);
  assert.equal(after.links.some((item) => item.resourceId === resourceId), false);
  assert.ok(after.editableResources.some(({ id }) => id === resourceId), 'removal retains granted editorial authority');
  return link;
}

async function edit(harness, resourceId, pathKind, fields, session = 'creator-a') {
  const observed = await owner(harness, session);
  const resource = observed.editableResources.find(({ id }) => id === resourceId);
  assert.ok(resource);
  if (pathKind === 'retired') return api(harness, `/api/creador/recursos/${encodeURIComponent(resourceId)}`, {
    version: resource.version, ...fields,
  }, { method: 'PATCH', session });
  const link = observed.links.find((item) => item.resourceId === resourceId);
  assert.ok(link);
  return api(harness, `/api/creador/enlaces/${encodeURIComponent(link.placementId)}/editar`, {
    profileVersion: observed.profile.version, placementVersion: link.placementVersion,
    resourceVersion: link.resourceVersion, ...fields,
  }, { method: 'PATCH', session });
}

function sortedReceipts(changes) {
  return [...changes].sort((a, b) => `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`));
}

async function snapshot(harness, resourceId = R) {
  return {
    a: await owner(harness), b: await owner(harness, 'creator-b'),
    resources: await Promise.all([resourceId, S, T].map((id) => harness.store.get(`resource:${id}`))),
    urls: await Promise.all([U, V, W].map((url) => harness.store.get(currentUrlKey(url)))),
  };
}

for (const pathKind of ['active', 'retired']) {
  for (const state of oldStates) {
    test(`granted ${pathKind} URL edit: ${state.name} preserves identity, cohosts and exact receipts`, async () => {
      const { harness, resourceId, oldRow } = await fixture(state);
      if (pathKind === 'retired') await remove(harness, resourceId);
      const before = await snapshot(harness, resourceId);
      const resourceBefore = before.resources[0];
      const firstTransaction = harness.mock.transactions.length;
      const saved = accepted(await edit(harness, resourceId, pathKind, { url: V, title: 'Granted correction' }), 200);
      assert.equal(harness.mock.transactions.length - firstTransaction, 1, 'one conditional transaction completes the change');
      const after = await snapshot(harness, resourceId);
      assert.equal(after.resources[0].id, resourceId);
      assert.equal(after.resources[0].url, V);
      assert.equal(after.resources[0].title, 'Granted correction');
      assert.equal(after.resources[0].version, resourceBefore.version + 1);
      assert.equal(after.resources[0].editorProfileId, before.a.profile.id);
      assert.deepEqual(after.resources.slice(1), before.resources.slice(1), 'other cohost resources are untouched');
      assert.deepEqual(after.urls[0], state.remaining ? state.remaining() : null);
      assert.deepEqual(after.urls[1], currentUrlReservation(V, resourceId));
      assertReservationObservation(urlCondition(harness, firstTransaction, U), oldRow);
      assert.deepEqual(after.b, before.b, 'another profile receives no placement, version or authority change');
      const expected = [{ entity: 'resource', id: resourceId, before: resourceBefore.version, after: resourceBefore.version + 1 }];
      if (pathKind === 'active') {
        expected.push({ entity: 'profile', id: before.a.profile.id, before: before.a.profile.version, after: before.a.profile.version + 1 });
        assert.equal(after.a.profile.version, before.a.profile.version + 1);
        assert.deepEqual(after.a.links.find((link) => link.resourceId === resourceId), saved.link);
        const publicPage = await harness.service.readPublicProfile(before.a.profile.slug);
        assert.equal(publicPage.links.find((link) => link.resourceId === resourceId)?.url, V);
      } else {
        assert.deepEqual(after.a.profile, before.a.profile, 'retired metadata editing does not advance the profile');
        assert.deepEqual(after.a.links, before.a.links, 'retired metadata editing creates no placement');
        assert.equal(saved.resource.url, V);
      }
      assert.deepEqual(sortedReceipts(saved.versionChanges), sortedReceipts(expected));
      const record = after.a.editableResources.find(({ id }) => id === resourceId);
      assert.equal(record.url, V);
      assert.equal(record.version, resourceBefore.version + 1);
      // A stale retry must fail without replacing the confirmed URL or metadata.
      const stale = await api(harness, `/api/creador/recursos/${encodeURIComponent(resourceId)}`, {
        version: resourceBefore.version, url: W,
      }, { method: 'PATCH' });
      assert.equal(stale.status, 409);
      assert.deepEqual(await snapshot(harness, resourceId), after);
    });
  }
}

for (const pathKind of ['active', 'retired']) {
  test(`granted event ${pathKind} URL edit uses registrationUrl and preserves cohost resources`, async () => {
    const { harness, resourceId } = await fixture(oldStates[2], { event: true });
    if (pathKind === 'retired') await remove(harness, resourceId);
    const before = await snapshot(harness, resourceId);
    accepted(await edit(harness, resourceId, pathKind, { url: V }), 200);
    const after = await snapshot(harness, resourceId);
    assert.equal(after.resources[0].registrationUrl, V);
    assert.equal(Object.hasOwn(after.resources[0], 'url'), false);
    assert.deepEqual(after.resources.slice(1), before.resources.slice(1));
    assert.deepEqual(after.urls[0], currentUrlReservation(U, S));
    assert.deepEqual(after.urls[1], currentUrlReservation(V, resourceId));
    assert.equal(after.a.editableResources.find(({ id }) => id === resourceId).url, V);
  });
}

for (const state of oldStates) {
  test(`exact-ID re-add with ${state.name} needs no URL lookup and restores no chapter memberships`, async () => {
    const { harness, resourceId, oldRow } = await fixture(state);
    let observed = await owner(harness);
    const series = accepted(await api(harness, '/api/creador/series', {
      name: 'Before removal', slug: 'before-removal', profileVersion: observed.profile.version,
    }), 201).series;
    observed = await owner(harness);
    const original = observed.links.find((link) => link.resourceId === resourceId);
    accepted(await api(harness, `/api/creador/series/${series.id}/capitulos/${original.placementId}`, {
      profileVersion: observed.profile.version,
    }, { method: 'PUT' }), 200);
    assert.equal((await owner(harness)).links[0].series.length, 1, 'the removed placement actually had a chapter membership');
    await remove(harness, resourceId);
    observed = await owner(harness);
    const retained = observed.editableResources.find(({ id }) => id === resourceId);
    const before = await snapshot(harness, resourceId);
    assert.equal((await api(harness, '/api/creador/enlaces', {
      resourceId, resourceVersion: retained.version - 1,
    })).status, 409);
    assert.equal((await api(harness, '/api/creador/enlaces', {
      resourceId, resourceVersion: retained.version,
    }, { session: 'creator-b' })).status, 403);
    assert.deepEqual(await snapshot(harness, resourceId), before, 'stale and unauthorized re-adds commit nothing');
    const saved = accepted(await api(harness, '/api/creador/enlaces', {
      resourceId, resourceVersion: retained.version,
    }), 201);
    assert.equal(saved.link.resourceId, resourceId);
    assert.equal(saved.link.placementId, original.placementId);
    assert.equal(saved.link.resourceVersion, retained.version);
    assert.equal(saved.link.url, U);
    assert.deepEqual(saved.link.series, []);
    const after = await owner(harness);
    assert.deepEqual(after.links.filter((link) => link.resourceId === resourceId), [saved.link]);
    assert.equal(after.profile.version, before.a.profile.version + 1);
    assert.deepEqual(sortedReceipts(saved.versionChanges), sortedReceipts([
      { entity: 'profile', id: after.profile.id, before: before.a.profile.version, after: after.profile.version },
      { entity: 'placement', id: original.placementId, before: 0, after: saved.link.placementVersion },
    ]));
    assert.deepEqual(await harness.store.get(currentUrlKey(U)), oldRow, 'identity-based re-add does not rewrite the URL index');
    assert.deepEqual(await harness.store.get(`resource:${resourceId}`), before.resources[0]);
    const repeated = accepted(await api(harness, '/api/creador/enlaces', { resourceId, resourceVersion: retained.version }), 200);
    assert.deepEqual(repeated.versionChanges, []);
    assert.deepEqual(repeated.link, saved.link);
    assert.deepEqual(await owner(harness), after, 'a fresh repeated re-add keeps one unchanged placement');
  });
}

for (const version of [0, 1, 4]) {
  test(`self-owned destination at observed version ${version} is accepted and remains import-compatible`, async () => {
    const { harness, resourceId } = await fixture(oldStates[0]);
    const pathKind = version === 4 ? 'retired' : 'active';
    if (pathKind === 'retired') await remove(harness, resourceId);
    const observedDestination = { ...currentUrlReservation(V, resourceId), version };
    harness.mock.seed(CATALOG, observedDestination);
    const offset = harness.mock.transactions.length;
    accepted(await edit(harness, resourceId, pathKind, { url: V }), 200);
    assert.equal(await harness.store.get(currentUrlKey(U)), null);
    const destination = await harness.store.get(currentUrlKey(V));
    assert.deepEqual(destination, currentUrlReservation(V, resourceId));
    assertFullUniqueObservation(urlCondition(harness, offset, V), observedDestination);
    assert.deepEqual(classifyReservation(destination, V, 'incoming-import'), { status: 'duplicate', resourceIds: [resourceId] });
    const current = await owner(harness);
    if (pathKind === 'retired') accepted(await api(harness, '/api/creador/enlaces', {
      resourceId, resourceVersion: current.editableResources.find(({ id }) => id === resourceId).version,
    }), 201);
    assert.equal((await owner(harness)).links.find((link) => link.resourceId === resourceId).url, V);
  });
}

for (const rawVersion of [undefined, 0]) {
  test(`old URL reservation with ${rawVersion === undefined ? 'absent' : 'explicit zero'} version keeps legacy CAS compatibility`, async () => {
    const row = currentUrlReservation(U, R);
    if (rawVersion === undefined) delete row.version;
    else row.version = rawVersion;
    const { harness, resourceId } = await fixture({ ...oldStates[0], row: () => row });
    const offset = harness.mock.transactions.length;
    accepted(await edit(harness, resourceId, 'active', { url: V }), 200);
    assertFullUniqueObservation(urlCondition(harness, offset, U), { ...row, version: 0 });
    assert.equal(await harness.store.get(currentUrlKey(U)), null);
    assert.deepEqual(await harness.store.get(currentUrlKey(V)), currentUrlReservation(V, resourceId));
    assert.equal((await owner(harness)).links.find((link) => link.resourceId === resourceId).url, V);
  });
}

for (const [name, row, expectedStatus] of [
  ['other resource', currentUrlReservation(V, S), 409],
  ['collision', currentUrlCollision(V, [S, T]), 409],
  ['malformed type', { ...currentUrlReservation(V, R), recordType: 'unrelated-control' }, 503],
  ['mixed identity fields', { ...currentUrlReservation(V, R), resourceIds: [R, S] }, 503],
]) {
  test(`unavailable destination (${name}) rejects atomically without exposing candidates`, async () => {
    const { harness, resourceId } = await fixture(oldStates[0]);
    harness.mock.seed(CATALOG, row);
    const before = await snapshot(harness, resourceId);
    const result = await edit(harness, resourceId, 'active', { url: V, title: 'Must not commit', selectedForDirectory: false });
    assert.equal(result.status, expectedStatus, JSON.stringify(result.body));
    assert.deepEqual(await snapshot(harness, resourceId), before);
    const responseText = JSON.stringify(result.body);
    assert.doesNotMatch(responseText, /Imported legacy:granted:(?:S|T)/, 'private candidate titles are not returned');
    for (const id of [S, T]) assert.equal(responseText.includes(id), false, 'private candidate IDs are not returned');
  });
}

test('a malformed old row rejects a URL edit without partial effects', async () => {
  const { harness, resourceId } = await fixture(oldStates[0]);
  harness.mock.seed(CATALOG, { ...currentUrlReservation(U, resourceId), resourceIds: [resourceId, S] });
  const before = await snapshot(harness, resourceId);
  assert.equal((await edit(harness, resourceId, 'active', { url: V })).status, 503);
  assert.deepEqual(await snapshot(harness, resourceId), before);
});

test('title-only and no-op edits do not repair an unrelated index', async () => {
  const { harness, resourceId } = await fixture(oldStates[0]);
  // Metadata-only commands neither require complete index coverage nor normalize
  // unrelated rows. The creator has authority over R, not over index corruption.
  const unrelated = { ...currentUrlReservation(U, S), version: 4 };
  harness.mock.seed(CATALOG, unrelated);
  accepted(await edit(harness, resourceId, 'active', { title: 'Metadata correction' }), 200);
  assert.deepEqual(await harness.store.get(currentUrlKey(U)), unrelated);
  await remove(harness, resourceId);
  const current = await owner(harness);
  const retained = current.editableResources.find(({ id }) => id === resourceId);
  const transactionsBeforeNoop = harness.mock.transactions.length;
  const noop = accepted(await edit(harness, resourceId, 'retired', { title: retained.title }), 200);
  assert.equal(harness.mock.transactions.length, transactionsBeforeNoop + 1, 'a no-op still confirms the observed resource in DynamoDB');
  assert.deepEqual(harness.mock.transactions.at(-1).input.TransactItems.map((item) => Object.keys(item)), [['ConditionCheck']]);
  assert.deepEqual(harness.mock.transactions.at(-1).input.TransactItems[0].ConditionCheck.Key, { id: resourceId });
  assert.deepEqual(noop.versionChanges, []);
  assert.deepEqual(await harness.store.get(currentUrlKey(U)), unrelated);
  assert.deepEqual((await owner(harness)).profile, current.profile);
});

test('a retired unchanged PATCH conflicts with a concurrent edit, then a fresh stable-ID re-add persists the winner', async () => {
  const { harness, resourceId } = await fixture(oldStates[0]);
  const original = await remove(harness, resourceId);
  const before = await snapshot(harness, resourceId);
  const retained = before.a.editableResources.find(({ id }) => id === resourceId);
  let winner;
  harness.mock.raceBeforeNextTransaction(async () => {
    winner = accepted(await edit(harness, resourceId, 'retired', { title: 'Concurrent winner' }), 200);
  });

  const stale = await api(harness, `/api/creador/recursos/${encodeURIComponent(resourceId)}`, {
    version: retained.version, title: retained.title,
  }, { method: 'PATCH' });
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  assert.ok(winner, 'the second real service edit committed after the no-op had read its resource');
  const afterWinner = await snapshot(harness, resourceId);
  assert.equal(afterWinner.resources[0].title, 'Concurrent winner');
  assert.equal(afterWinner.resources[0].version, retained.version + 1);
  assert.deepEqual(afterWinner.a.profile, before.a.profile, 'the retired no-op did not advance the profile');
  assert.deepEqual(afterWinner.a.links, before.a.links, 'the retired no-op did not recreate a placement');
  assert.deepEqual(afterWinner.resources.slice(1), before.resources.slice(1));
  assert.deepEqual(afterWinner.urls, before.urls);

  const freshOwner = await owner(harness);
  const freshResource = freshOwner.editableResources.find(({ id }) => id === resourceId);
  const readded = accepted(await api(harness, '/api/creador/enlaces', {
    resourceId, resourceVersion: freshResource.version,
  }), 201);
  assert.equal(readded.link.resourceId, resourceId);
  assert.equal(readded.link.placementId, original.placementId, 'manual re-add retains the stable placement identity');
  assert.equal(readded.link.title, 'Concurrent winner');
  assert.equal(readded.link.resourceVersion, freshResource.version);
  assert.deepEqual((await owner(harness)).links.filter(({ resourceId: id }) => id === resourceId), [readded.link]);
});

test('two supported cohost departures at version 1 conflict, then a fresh manual edit leaves only the last cohost', async () => {
  const { harness, resourceId } = await fixture(oldStates[3]);
  await claimAndGrant(harness, S, 'creator-b');
  const before = await snapshot(harness, resourceId);
  let competitor;
  harness.mock.raceBeforeNextTransaction(async () => {
    competitor = await edit(harness, S, 'active', { url: W }, 'creator-b');
    accepted(competitor, 200);
    assert.deepEqual(await harness.store.get(currentUrlKey(U)), currentUrlCollision(U, [resourceId, T]));
  });
  const stale = await edit(harness, resourceId, 'active', { url: V, title: 'Later R title', selectedForDirectory: false });
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  assert.ok(competitor, 'the second authorized command actually committed at the first commit boundary');
  const rejected = await snapshot(harness, resourceId);
  assert.deepEqual(rejected.a, before.a, 'A has no partial metadata/option/profile effect');
  assert.deepEqual(rejected.resources[0], before.resources[0]);
  assert.equal(rejected.resources[1].url, W);
  assert.deepEqual(rejected.urls, [currentUrlCollision(U, [resourceId, T]), null, currentUrlReservation(W, S)]);
  accepted(await edit(harness, resourceId, 'active', { url: V, title: 'Later R title', selectedForDirectory: false }), 200);
  const final = await snapshot(harness, resourceId);
  assert.deepEqual(final.urls, [currentUrlReservation(U, T), currentUrlReservation(V, resourceId), currentUrlReservation(W, S)]);
  assert.equal(final.a.links.find((link) => link.resourceId === resourceId).selectedForDirectory, false);
  assert.equal(final.resources[0].url, V);
  assert.deepEqual(final.resources[2], before.resources[2]);
  assert.deepEqual(final.b, rejected.b);
});

function urlCondition(harness, from, url) {
  const id = currentUrlReservation(url, R).id;
  const actions = harness.mock.transactions.slice(from).flatMap(({ input }) => input.TransactItems);
  const matches = actions.map((action) => action.ConditionCheck ?? action.Put ?? action.Delete)
    .filter((item) => item.TableName === CATALOG && (item.Key?.id ?? item.Item?.id) === id);
  assert.equal(matches.length, 1, 'the observed URL participates once in the actual SDK transaction');
  return matches[0];
}

function assertObservationFields(input, row, fields) {
  const expression = input.ConditionExpression ?? '';
  const names = input.ExpressionAttributeNames ?? {};
  const values = input.ExpressionAttributeValues ?? {};
  for (const field of fields) {
    const aliases = Object.keys(names).filter((token) => names[token] === field);
    const equalsExpected = aliases.some((alias) => {
      const bound = expression.match(new RegExp(`${alias}\\s*=\\s*(:[A-Za-z0-9_]+)`, 'u'));
      return bound && Object.hasOwn(values, bound[1]) && isDeepStrictEqual(values[bound[1]], row[field]);
    });
    assert.ok(equalsExpected, `the sent predicate compares the observed ${field}, without prescribing alias names`);
  }
  for (const token of expression.match(/#[A-Za-z0-9_]+/gu) ?? []) assert.ok(Object.hasOwn(names, token), `bound name ${token}`);
  for (const token of expression.match(/:[A-Za-z0-9_]+/gu) ?? []) assert.ok(Object.hasOwn(values, token), `bound value ${token}`);
  for (const token of Object.keys(names)) assert.ok(expression.includes(token), `used name ${token}`);
  for (const token of Object.keys(values)) assert.ok(expression.includes(token), `used value ${token}`);
}

function assertFullUniqueObservation(input, row) {
  assertObservationFields(input, row, ['recordType', 'url', 'status', 'resourceId', 'version']);
  const expression = input.ConditionExpression;
  const names = input.ExpressionAttributeNames;
  const listAlias = Object.keys(names).find((token) => names[token] === 'resourceIds');
  assert.ok(listAlias && expression.includes(`attribute_not_exists(${listAlias})`), 'a unique row still has no collision-member list');
}

function assertReservationObservation(input, row) {
  if (row === null) {
    const idAlias = Object.keys(input.ExpressionAttributeNames).find((token) => input.ExpressionAttributeNames[token] === 'id');
    assert.ok(idAlias && input.ConditionExpression.includes(`attribute_not_exists(${idAlias})`), 'the absent old row is compared without a fabricated write');
  } else if (row.status === 'reserved') assertFullUniqueObservation(input, row);
  else {
    assertObservationFields(input, row, ['recordType', 'url', 'status', 'resourceIds', 'version']);
    const singularAlias = Object.keys(input.ExpressionAttributeNames).find((token) => input.ExpressionAttributeNames[token] === 'resourceId');
    assert.ok(singularAlias && input.ConditionExpression.includes(`attribute_not_exists(${singularAlias})`));
  }
}

test('URL movement coalesces a full old-row Delete check and an absent-destination Put check', async () => {
  const { harness, resourceId } = await fixture(oldStates[0]);
  const offset = harness.mock.transactions.length;
  accepted(await edit(harness, resourceId, 'active', { url: V }), 200);
  assertFullUniqueObservation(urlCondition(harness, offset, U), currentUrlReservation(U, resourceId));
  const destination = urlCondition(harness, offset, V);
  const idAlias = Object.keys(destination.ExpressionAttributeNames).find((token) => destination.ExpressionAttributeNames[token] === 'id');
  assert.ok(idAlias && destination.ConditionExpression.includes(`attribute_not_exists(${idAlias})`));
  const actions = harness.mock.transactions.at(-1).input.TransactItems;
  assert.ok(actions.some(({ Delete }) => Delete?.Key.id === currentUrlReservation(U, resourceId).id));
  assert.ok(actions.some(({ Put }) => Put?.Item.id === currentUrlReservation(V, resourceId).id));
  const identities = actions.map((action) => {
    const input = action.Put ?? action.Delete ?? action.ConditionCheck;
    const key = input.Key ?? (input.Item.pk ? { pk: input.Item.pk, sk: input.Item.sk } : { id: input.Item.id });
    return JSON.stringify([input.TableName, key]);
  });
  assert.equal(new Set(identities).size, identities.length, 'a row check and its mutation never become duplicate physical actions');
});

test('collision movement compares the stored member order and emits only the remaining IDs', async () => {
  const state = { ...oldStates[3], row: (id) => ({ ...currentUrlCollision(U, [id, S, T]), resourceIds: [T, id, S] }) };
  const { harness, resourceId, oldRow } = await fixture(state);
  const offset = harness.mock.transactions.length;
  accepted(await edit(harness, resourceId, 'active', { url: V }), 200);
  const condition = urlCondition(harness, offset, U);
  assertObservationFields(condition, oldRow, ['recordType', 'url', 'status', 'resourceIds', 'version']);
  const singularAlias = Object.keys(condition.ExpressionAttributeNames).find((token) => condition.ExpressionAttributeNames[token] === 'resourceId');
  assert.ok(singularAlias && condition.ConditionExpression.includes(`attribute_not_exists(${singularAlias})`));
  assert.deepEqual(await harness.store.get(currentUrlKey(U)), currentUrlCollision(U, [S, T]));
});

for (const mode of ['reference', 'add-by-url']) {
  for (const alreadyPresent of [false, true]) {
    test(`${mode} ${alreadyPresent ? 'no-op' : 'creation'} confirms the full unique URL observation and preserves authority boundaries`, async () => {
      const { harness, resourceId } = await fixture(oldStates[0], { grant: false });
      let observed = await owner(harness);
      if (alreadyPresent) {
        accepted(await api(harness, '/api/creador/referencias', {
          resourceId, url: U, profileVersion: observed.profile.version, selectedForDirectory: false,
        }), 201);
        observed = await owner(harness);
      }
      const before = await snapshot(harness, resourceId);
      const offset = harness.mock.transactions.length;
      const path = mode === 'reference' ? '/api/creador/referencias' : '/api/creador/enlaces';
      const body = mode === 'reference'
        ? { resourceId, url: U, profileVersion: observed.profile.version, selectedForDirectory: true }
        : { title: 'A reference cannot rename this resource', url: U, selectedForDirectory: true };
      const saved = accepted(await api(harness, path, body), alreadyPresent ? 200 : 201);
      assertFullUniqueObservation(urlCondition(harness, offset, U), currentUrlReservation(U, resourceId));
      const after = await snapshot(harness, resourceId);
      assert.deepEqual(after.resources, before.resources);
      assert.deepEqual(after.urls, before.urls);
      assert.deepEqual(after.a.editableResources, [], 'placement does not create metadata authority');
      assert.equal(after.a.links.length, 1);
      assert.equal(saved.link.resourceId, resourceId);
      if (alreadyPresent) {
        assert.deepEqual(after.a, before.a);
        assert.deepEqual(saved.link, before.a.links[0]);
        assert.deepEqual(saved.versionChanges, []);
      }
    });
  }
}

test('add-by-URL losing an attach conflict requires an explicit retry instead of unchecked winner success', async () => {
  const { harness, resourceId } = await fixture(oldStates[0], { grant: false });
  let winner;
  harness.mock.raceBeforeNextTransaction(async () => {
    const current = await owner(harness);
    winner = accepted(await api(harness, '/api/creador/referencias', {
      resourceId, url: U, profileVersion: current.profile.version, selectedForDirectory: false,
    }), 201);
  });
  const losing = await api(harness, '/api/creador/enlaces', { title: 'Ignored title', url: U, selectedForDirectory: true });
  assert.equal(losing.status, 409, JSON.stringify(losing.body));
  assert.ok(winner, 'the competing reference really committed');
  const current = await snapshot(harness, resourceId);
  assert.deepEqual(current.a.links, [winner.link]);
  const retried = accepted(await api(harness, '/api/creador/enlaces', { title: 'Ignored title', url: U, selectedForDirectory: true }), 200);
  assert.deepEqual(retried.link, winner.link);
  assert.deepEqual(retried.versionChanges, []);
  assert.deepEqual(await snapshot(harness, resourceId), current);
});

test('already-present exact-ID re-add checks the observed resource even on its no-op path', async () => {
  const { harness, resourceId } = await fixture(oldStates[0]);
  const observed = await owner(harness);
  const original = observed.links[0];
  let laterEdit;
  harness.mock.raceBeforeNextTransaction(async () => {
    laterEdit = accepted(await edit(harness, resourceId, 'retired', { title: 'Concurrent resource correction' }), 200);
  });
  const stale = await api(harness, '/api/creador/enlaces', { resourceId, resourceVersion: original.resourceVersion });
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  assert.ok(laterEdit, 'the no-op reaches the conditional confirmation boundary');
  const current = await owner(harness);
  const retained = current.editableResources.find(({ id }) => id === resourceId);
  const retried = accepted(await api(harness, '/api/creador/enlaces', { resourceId, resourceVersion: retained.version }), 200);
  assert.equal(retried.link.title, 'Concurrent resource correction');
  assert.equal(retried.link.placementId, original.placementId);
  assert.deepEqual(retried.versionChanges, []);
  assert.deepEqual(await owner(harness), current);
});

function assertPythonReads(resources, reservations) {
  const rows = [...resources, ...reservations];
  const source = fileURLToPath(new URL('../scripts/import-meetup-events.py', import.meta.url));
  // This table controls only projected reads. The production Python reader
  // performs all reservation/resource interpretation; no sync/write runs here.
  const script = `import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('meetup', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
rows = {row['id']: row for row in json.load(sys.stdin)}
class Table:
    def get_item(self, **request):
        row = rows.get(request['Key']['id'])
        if row is None: return {}
        if 'ProjectionExpression' in request:
            fields = request['ExpressionAttributeNames'].values()
            row = {key: value for key, value in row.items() if key in fields}
        return {'Item': row}
print(json.dumps([module.read_reservation(Table(), url) for url in sys.argv[2:]]))
`;
  const result = spawnSync('python3', ['-B', '-c', script, source, ...reservations.map(({ url }) => url)], {
    input: JSON.stringify(rows), encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), reservations);
}

test('reservation rows emitted by a creator departure remain readable by the actual JS and Python importers', async () => {
  const { harness, resourceId } = await fixture(oldStates[3]);
  const before = await snapshot(harness, resourceId);
  assertPythonReads(before.resources, [before.urls[0]]);
  accepted(await edit(harness, resourceId, 'active', { url: V }), 200);
  const collision = await harness.store.get(currentUrlKey(U));
  const unique = await harness.store.get(currentUrlKey(V));
  assert.deepEqual(classifyReservation(collision, U, 'incoming-import'), { status: 'collision', resourceIds: [S, T] });
  assert.deepEqual(classifyReservation(unique, V, 'incoming-import'), { status: 'duplicate', resourceIds: [resourceId] });
  assertPythonReads((await snapshot(harness, resourceId)).resources, [collision, unique]);
});

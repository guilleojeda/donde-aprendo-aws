import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callApi,
  responseJson,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';
import {
  createDynamoMoveHarness,
  moveTransactionMetrics,
  moveTransactionPhysicalBytes,
  seedMovePlacement,
  seedMoveProfile,
  seedMoveResource,
  seedMoveSeries,
} from './fixtures/creator-link-move.mjs';

const MOVE_URL = (placementId) => `/api/creador/enlaces/${encodeURIComponent(placementId)}/mover`;
const MAX_SAFE_POSITION = Number.MAX_SAFE_INTEGER;
const MAX_DYNAMO_ACTIONS = 100;
const MAX_DYNAMO_ITEM_BYTES = 400 * 1024;
const MAX_DYNAMO_TRANSACTION_BYTES = 4 * 1024 * 1024;
const DYNAMO_ITEM_BOUND = 1_000;

async function api(harness, path, {
  session = 'creator-a',
  csrf = sessionCsrf[session],
  origin = 'https://dondeaprendoaws.com',
  method = 'POST',
  body,
} = {}) {
  return callApi(harness, path, { session, csrf, origin, method, ...(body === undefined ? {} : { body }) });
}

async function owner(harness, session = 'creator-a') {
  const response = await api(harness, '/api/creador/perfil', { session, method: 'GET' });
  assert.equal(response.status, 200);
  return responseJson(response);
}

async function expectOk(response, status = 200) {
  const body = await responseJson(response);
  assert.equal(response.status, status, `HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function seedRows(mock, rows, { profileId = 'profile-move-a' } = {}) {
  for (const row of rows) {
    const resourceId = row.resourceId ?? `resource-${row.id}`;
    seedMoveResource(mock, {
      id: resourceId,
      title: row.title ?? `Título ${row.id}`,
      url: `https://example.com/move/${encodeURIComponent(resourceId)}`,
      hidden: row.hidden ?? false,
      version: row.resourceVersion ?? 1,
      directoryControl: row.directoryControl ?? 'editorial',
      ...(row.editorProfileId ? { editorProfileId: row.editorProfileId } : {}),
    });
    seedMovePlacement(mock, {
      id: row.id,
      profileId: row.profileId ?? profileId,
      resourceId,
      position: row.position,
      featured: row.featured ?? false,
      selectedForDirectory: row.selectedForDirectory ?? true,
      version: row.placementVersion ?? 1,
      ...(row.series ? { series: row.series } : {}),
    });
  }
}

async function setup(rows, { profile = {}, series = [] } = {}) {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock, profile);
  for (const item of series) seedMoveSeries(harness.mock, item);
  seedRows(harness.mock, rows);
  return harness;
}

test('test support: el cliente grabador mide TransactWriteItems reales del store físico', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  const current = await harness.store.get('profile:profile-move-a');
  const saved = { ...current, version: current.version + 1 };
  assert.equal(await harness.store.transact({
    checks: [{ key: 'profile:profile-move-a', version: current.version }],
    puts: [{ key: 'profile:profile-move-a', value: saved }],
  }), true);
  assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 1 }]);
  assert.ok(moveTransactionPhysicalBytes(harness.mock)[0] > 0);
  assert.equal(harness.mock.read('profiles-test', { pk: 'PROFILE#profile-move-a', sk: 'META' }).version, 2);
});

async function move(harness, placementId, body, options = {}) {
  return api(harness, `${MOVE_URL(placementId)}${options.search ?? ''}`, {
    ...options,
    body,
  });
}

function orderInGroup(links, featured) {
  return links.filter((link) => link.featured === featured)
    .sort((left, right) => left.position - right.position
      || left.placementId.localeCompare(right.placementId));
}

function insertedOrder(links, placementId, targetPosition) {
  const target = links.find((link) => link.placementId === placementId);
  assert.ok(target, `target ${placementId} is in the observed links`);
  const group = orderInGroup(links, target.featured);
  const index = group.findIndex((link) => link.placementId === placementId);
  const [moving] = group.splice(index, 1);
  group.splice(targetPosition - 1, 0, moving);
  return group.map(({ placementId: id }) => id);
}

function placementRows(mock, ids, profileId = 'profile-move-a') {
  return ids.map((id) => mock.read('profiles-test', {
    pk: `PROFILE#${profileId}`,
    sk: `PLACEMENT#${id}`,
  }));
}

function snapshot(mock, { profileId = 'profile-move-a', placementIds, resourceIds = [] } = {}) {
  const values = {
    profile: mock.read('profiles-test', { pk: `PROFILE#${profileId}`, sk: 'META' }),
    placements: placementRows(mock, placementIds, profileId),
    resources: resourceIds.map((id) => mock.read('catalog-test', { id })),
  };
  return structuredClone(values);
}

function expectedReceipts(before, after, profileId, placementIds) {
  const changes = [];
  const changedIndexes = [];
  for (let index = 0; index < placementIds.length; index += 1) {
    const initial = before.placements[index];
    const current = after.placements[index];
    if (initial.position === current.position) continue;
    assert.equal(current.version, initial.version + 1, `changed placement ${initial.id} increments exactly once`);
    changedIndexes.push(index);
    changes.push({ entity: 'placement', id: initial.id, before: initial.version, after: current.version });
  }
  assert.equal(after.profile.version, before.profile.version + (changedIndexes.length > 0 ? 1 : 0),
    'the profile increments once only when the order changes');
  if (changedIndexes.length > 0) {
    changes.push({ entity: 'profile', id: profileId, before: before.profile.version, after: after.profile.version });
  }
  return changes.sort((left, right) => `${left.entity}:${left.id}`.localeCompare(`${right.entity}:${right.id}`));
}

function sortReceipts(changes) {
  return [...changes].sort((left, right) => `${left.entity}:${left.id}`.localeCompare(`${right.entity}:${right.id}`));
}

function changedPlacements(before, after) {
  return before.placements.filter((initial, index) => initial.position !== after.placements[index].position)
    .map(({ id }) => id);
}

function assertResponseLinks(body, targetId, changedIds, beforeLinks, afterSnapshot, profileId = 'profile-move-a') {
  const expectedIds = [...new Set([targetId, ...changedIds])].sort();
  assert.deepEqual(body.links.map(({ placementId }) => placementId).sort(), expectedIds,
    'success returns only the target and placements whose saved positions changed');
  for (const link of body.links) {
    const row = afterSnapshot.placements.find(({ id }) => id === link.placementId);
    const previous = beforeLinks.find(({ placementId }) => placementId === link.placementId);
    assert.ok(row && previous);
    assert.equal(link.position, row.position);
    assert.equal(link.placementVersion, row.version);
    assert.equal(link.resourceId, row.resourceId);
    assert.equal(link.featured, row.featured);
    assert.deepEqual(link.series, previous.series, 'movement preserves each independent series membership');
  }
  assert.ok(body.links.every((link) => link.placementId !== undefined));
  assert.ok(profileId);
}

function largeUnknownSeriesMap(count) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [
    `m${index.toString(36).padStart(5, '0')}${'x'.repeat(122)}`,
    { position: index },
  ]));
}

function exactLimitSeriesPayload({ profileId, placementId, resourceId, position, version }) {
  // This fixed record has the ordinary placement fields, physical pk/sk,
  // and one legacy inert series entry. The independent byte sum below is only
  // for constructing the boundary input; it does not mirror the move planner.
  const stringSize = (name, value) => Buffer.byteLength(name, 'utf8') + Buffer.byteLength(value, 'utf8');
  const numberSize = (name, significantDigits) => Buffer.byteLength(name, 'utf8') + 1 + Math.ceil(significantDigits / 2);
  const fixed = stringSize('pk', `PROFILE#${profileId}`)
    + stringSize('sk', `PLACEMENT#${placementId}`)
    + stringSize('recordType', 'placement')
    + stringSize('id', placementId)
    + stringSize('profileId', profileId)
    + stringSize('resourceId', resourceId)
    + numberSize('position', String(position).replace(/0+$/, '').length || 1)
    + Buffer.byteLength('featured', 'utf8') + 1
    + Buffer.byteLength('selectedForDirectory', 'utf8') + 1
    + numberSize('version', String(version).replace(/0+$/, '').length || 1)
    + Buffer.byteLength('series', 'utf8') + 3 + 1 + Buffer.byteLength('legacy', 'utf8');
  return { fixed, value: 'x'.repeat(MAX_DYNAMO_ITEM_BYTES - fixed) };
}

test('0 enlaces devuelve 404 para el target ausente; 1 enlace permite no-op con CAS de perfil y target', async () => {
  const empty = await setup([]);
  const absent = await move(empty, 'not-present', { profileVersion: 1, placementVersion: 0, targetPosition: 1 });
  assert.equal(absent.status, 404);
  assert.equal(moveTransactionMetrics(empty.mock).length, 0);

  const single = await setup([{ id: 'only', position: MAX_SAFE_POSITION, placementVersion: 0 }], {
    profile: { version: 0 },
  });
  const before = snapshot(single.mock, { placementIds: ['only'], resourceIds: ['resource-only'] });
  const saved = await expectOk(await move(single, 'only', {
    profileVersion: 0,
    placementVersion: 0,
    targetPosition: 1,
  }));
  const after = snapshot(single.mock, { placementIds: ['only'], resourceIds: ['resource-only'] });
  assert.deepEqual(after, before);
  assert.deepEqual(saved.versionChanges, []);
  assert.deepEqual(saved.links.map(({ placementId, position }) => ({ placementId, position })), [
    { placementId: 'only', position: MAX_SAFE_POSITION },
  ]);
  assert.deepEqual(moveTransactionMetrics(single.mock), [{ actionCount: 2 }],
    'a no-op still sends profile and target ConditionChecks through the real store');
});

test('una colocación ajena y otra retirada por DELETE responden 404 sin una transacción de movimiento', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  seedMoveProfile(harness.mock, {
    accountId: 'private-account-b',
    profileId: 'profile-move-b',
    displayName: 'Otra cuenta',
    slug: 'otra-cuenta',
  });
  seedRows(harness.mock, [{ id: 'owned-target', position: 0 }]);
  seedMoveResource(harness.mock, {
    id: 'resource-foreign-target',
    title: 'Colocación ajena',
    url: 'https://example.com/move/foreign-target',
  });
  seedMovePlacement(harness.mock, {
    id: 'foreign-target',
    profileId: 'profile-move-b',
    resourceId: 'resource-foreign-target',
    position: 0,
  });
  const ownerA = await owner(harness);
  const ownerB = await owner(harness, 'creator-b');
  const foreign = ownerB.links.find(({ placementId }) => placementId === 'foreign-target');
  const beforeA = snapshot(harness.mock, {
    profileId: 'profile-move-a',
    placementIds: ['owned-target'],
    resourceIds: ['resource-owned-target'],
  });
  const beforeB = snapshot(harness.mock, {
    profileId: 'profile-move-b',
    placementIds: ['foreign-target'],
    resourceIds: ['resource-foreign-target'],
  });

  const foreignMove = await move(harness, foreign.placementId, {
    profileVersion: ownerA.profile.version,
    placementVersion: foreign.placementVersion,
    targetPosition: 1,
  });
  assert.equal(foreignMove.status, 404);
  assert.deepEqual(snapshot(harness.mock, {
    profileId: 'profile-move-a',
    placementIds: ['owned-target'],
    resourceIds: ['resource-owned-target'],
  }), beforeA);
  assert.deepEqual(snapshot(harness.mock, {
    profileId: 'profile-move-b',
    placementIds: ['foreign-target'],
    resourceIds: ['resource-foreign-target'],
  }), beforeB);
  assert.equal(moveTransactionMetrics(harness.mock).length, 0);

  const removed = await api(harness, `/api/creador/enlaces/${encodeURIComponent('owned-target')}`, {
    method: 'DELETE',
    body: { profileVersion: ownerA.profile.version },
  });
  assert.equal(removed.status, 204);
  const afterDelete = snapshot(harness.mock, {
    profileId: 'profile-move-a',
    placementIds: ['owned-target'],
    resourceIds: ['resource-owned-target'],
  });
  const writesAfterDelete = moveTransactionMetrics(harness.mock).length;
  const currentA = await owner(harness);
  const removedMove = await move(harness, 'owned-target', {
    profileVersion: currentA.profile.version,
    placementVersion: beforeA.placements[0].version,
    targetPosition: 1,
  });
  assert.equal(removedMove.status, 404);
  assert.deepEqual(snapshot(harness.mock, {
    profileId: 'profile-move-a',
    placementIds: ['owned-target'],
    resourceIds: ['resource-owned-target'],
  }), afterDelete);
  assert.equal(moveTransactionMetrics(harness.mock).length, writesAfterDelete,
    'the rejected move adds no TransactWrite after the real DELETE');
});

test('una ventana local densa se inserta al principio sin reescribir la cola con huecos', async () => {
  const prefixIds = ['a-00', 'a-01', 'a-02'];
  const gapIds = ['p-03', 'p-04', 'p-05'];
  const targetId = 'z-target';
  const tailIds = ['p-07', 'p-08', 'p-09', 'p-10', 'p-11'];
  const ids = [...prefixIds, ...gapIds, targetId, ...tailIds];
  const rows = [
    ...prefixIds.map((id) => ({ id, position: 0 })),
    ...gapIds.map((id, index) => ({ id, position: (index + 1) * 10 })),
    { id: targetId, position: 40 },
    ...tailIds.map((id, index) => ({
      id,
      position: (index + 5) * 10,
      ...(id === 'p-09' ? { series: { 'series-tail': { position: 3 } } } : {}),
    })),
  ];
  const harness = await setup(rows, {
    series: [{ id: 'series-tail', name: 'Serie de cola', slug: 'serie-de-cola' }],
  });
  const observed = await owner(harness);
  const target = observed.links.find(({ placementId }) => placementId === targetId);
  const desired = insertedOrder(observed.links, targetId, 1);
  const before = snapshot(harness.mock, { placementIds: ids });

  const saved = await expectOk(await move(harness, targetId, {
    profileVersion: observed.profile.version,
    placementVersion: target.placementVersion,
    targetPosition: 1,
  }));

  const after = snapshot(harness.mock, { placementIds: ids });
  assert.deepEqual(orderInGroup((await owner(harness)).links, false).map(({ placementId }) => placementId), desired);
  for (const id of tailIds) {
    const index = ids.indexOf(id);
    assert.deepEqual(after.placements[index], before.placements[index], `${id} remains outside the small insertion window`);
  }
  const changedIds = changedPlacements(before, after);
  assert.ok(changedIds.every((id) => [...prefixIds, ...gapIds, targetId].includes(id)));
  assert.ok(moveTransactionMetrics(harness.mock)[0].actionCount <= 8,
    'the physical transaction covers the local prefix/window and leaves the sparse tail untouched');
  assert.deepEqual(sortReceipts(saved.versionChanges), expectedReceipts(before, after, 'profile-move-a', ids));
  assertResponseLinks(saved, targetId, changedIds, observed.links, after);
  const publicPage = await harness.service.readPublicProfile('orden-prueba');
  assert.deepEqual(publicPage.links.map(({ placementId }) => placementId), desired,
    'the public order matches the full saved insertion');
});

test('50 enlaces admiten inserción de borde adelante y atrás; cuenta acciones físicas reales y conserva recibos exactos', async () => {
  const ids = Array.from({ length: 49 }, (_, index) => `a-${String(index).padStart(3, '0')}`);
  ids.push('z-target');
  const rows = ids.map((id) => ({ id, position: 0, featured: false }));
  const harness = await setup(rows);
  const observed = await owner(harness);
  const target = observed.links.find(({ placementId }) => placementId === 'z-target');
  const before = snapshot(harness.mock, { placementIds: ids, resourceIds: ids.map((id) => `resource-${id}`) });
  const expected = insertedOrder(observed.links, target.placementId, 1);

  const first = await expectOk(await move(harness, target.placementId, {
    profileVersion: observed.profile.version,
    placementVersion: target.placementVersion,
    targetPosition: 1,
  }));
  const after = snapshot(harness.mock, { placementIds: ids, resourceIds: ids.map((id) => `resource-${id}`) });
  assert.deepEqual(orderInGroup((await owner(harness)).links, false).map(({ placementId }) => placementId), expected);
  const changedIds = changedPlacements(before, after);
  assert.equal(changedIds.length, 49);
  assert.deepEqual(sortReceipts(first.versionChanges), expectedReceipts(before, after, 'profile-move-a', ids));
  assertResponseLinks(first, target.placementId, changedIds, observed.links, after);
  assert.deepEqual(moveTransactionMetrics(harness.mock), [{ actionCount: 51 }],
    '49 changed placements, the unchanged target check, and profile are 51 physical actions');

  const afterFirst = await owner(harness);
  const movedAgain = afterFirst.links.find(({ placementId }) => placementId === target.placementId);
  const beforeBack = snapshot(harness.mock, { placementIds: ids, resourceIds: ids.map((id) => `resource-${id}`) });
  const expectedBack = insertedOrder(afterFirst.links, target.placementId, 50);
  const back = await expectOk(await move(harness, target.placementId, {
    profileVersion: afterFirst.profile.version,
    placementVersion: movedAgain.placementVersion,
    targetPosition: 50,
  }));
  const afterBack = snapshot(harness.mock, { placementIds: ids, resourceIds: ids.map((id) => `resource-${id}`) });
  assert.deepEqual(orderInGroup((await owner(harness)).links, false).map(({ placementId }) => placementId), expectedBack);
  assert.deepEqual(sortReceipts(back.versionChanges), expectedReceipts(beforeBack, afterBack, 'profile-move-a', ids));
  assert.deepEqual(moveTransactionMetrics(harness.mock).map(({ actionCount }) => actionCount), [51, 2]);
});

test('el ordinal del grupo destacado incluye ocultos, ignora la consulta de tabla y conserva las series por separado', async () => {
  const ids = Array.from({ length: 58 }, (_, index) => `featured-${String(index).padStart(2, '0')}`);
  const rows = ids.map((id, index) => ({
    id,
    position: index * 10,
    featured: index < 8,
    hidden: index === 1,
    selectedForDirectory: index !== 3,
    series: index === 1 ? { 'series-one': { position: 2 } }
      : index === 7 ? { 'series-one': { position: 0 }, 'series-two': { position: 4 } }
        : undefined,
  }));
  const harness = await setup(rows, {
    series: [
      { id: 'series-one', name: 'Una serie', slug: 'una-serie' },
      { id: 'series-two', name: 'Otra serie', slug: 'otra-serie' },
    ],
  });
  const observed = await owner(harness);
  const target = observed.links.find(({ placementId }) => placementId === ids[7]);
  const hidden = observed.links.find(({ placementId }) => placementId === ids[1]);
  assert.equal(hidden.hidden, true);
  const desired = insertedOrder(observed.links, target.placementId, 3);
  const unrelatedIds = ids.slice(8);
  const beforeUnrelated = snapshot(harness.mock, {
    placementIds: unrelatedIds,
  });
  const beforeSeries = snapshot(harness.mock, { placementIds: [ids[1], ids[7]] });

  const saved = await expectOk(await move(harness, target.placementId, {
    profileVersion: observed.profile.version,
    placementVersion: target.placementVersion,
    targetPosition: 3,
  }, { search: '?buscar=no-coincide&paginaEnlaces=99' }));
  const after = await owner(harness);
  assert.deepEqual(orderInGroup(after.links, true).map(({ placementId }) => placementId), desired,
    'the saved group includes hidden placements and is independent of the visible table query');
  assert.ok(after.links.some(({ placementId }) => placementId === hidden.placementId));
  assert.deepEqual(snapshot(harness.mock, { placementIds: unrelatedIds }).placements, beforeUnrelated.placements,
    'the non-featured group is untouched');
  const afterSeries = snapshot(harness.mock, { placementIds: [ids[1], ids[7]] });
  assert.deepEqual(afterSeries.placements.map(({ series }) => series), beforeSeries.placements.map(({ series }) => series),
    'the map for every active series remains unchanged');
  assert.ok(saved.links.find(({ placementId }) => placementId === target.placementId)
    .series.some(({ seriesId }) => seriesId === 'series-two'));
  const publicPage = await harness.service.readPublicProfile('orden-prueba');
  assert.equal(publicPage.status, 200);
  assert.deepEqual(publicPage.links.filter(({ featured }) => featured).map(({ placementId }) => placementId),
    desired.filter((id) => id !== hidden.placementId),
    'the public sequence is the owner sequence with the hidden placement omitted');
});

test('el comparador conserva los empates válidos y puede mover MAX_SAFE_INTEGER a la primera posición sin overflow', async () => {
  const ids = ['a-first', 'b-middle', 'z-last'];
  const harness = await setup([
    { id: ids[0], position: 0, placementVersion: 0 },
    { id: ids[1], position: 1, placementVersion: 0 },
    { id: ids[2], position: MAX_SAFE_POSITION, placementVersion: 0 },
  ], { profile: { version: 0 } });
  const observed = await owner(harness);
  const beforeOrder = orderInGroup(observed.links, false).map(({ placementId }) => placementId);
  assert.deepEqual(beforeOrder, ids);
  const target = observed.links.find(({ placementId }) => placementId === ids[2]);
  const wanted = insertedOrder(observed.links, target.placementId, 1);
  const before = snapshot(harness.mock, { placementIds: ids });

  const saved = await expectOk(await move(harness, target.placementId, {
    profileVersion: 0,
    placementVersion: 0,
    targetPosition: 1,
  }));
  const after = await owner(harness);
  assert.deepEqual(orderInGroup(after.links, false).map(({ placementId }) => placementId), wanted);
  assert.ok(after.links.every(({ position }) => Number.isSafeInteger(position) && position >= 0));
  const afterSnapshot = snapshot(harness.mock, { placementIds: ids });
  assert.deepEqual(sortReceipts(saved.versionChanges), expectedReceipts(before, afterSnapshot, 'profile-move-a', ids));
});

test('mover una referencia compartida sólo cambia el perfil y las colocaciones del propietario que ejecuta la acción', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock);
  seedMoveProfile(harness.mock, {
    accountId: 'private-account-b',
    profileId: 'profile-move-b',
    displayName: 'Otra cuenta',
    slug: 'otra-cuenta',
  });
  seedMoveResource(harness.mock, {
    id: 'shared-resource',
    title: 'Ficha compartida',
    url: 'https://example.com/move/shared',
    directoryControl: 'editorial',
  });
  seedMoveResource(harness.mock, {
    id: 'other-resource',
    title: 'Otra ficha',
    url: 'https://example.com/move/other',
  });
  seedMovePlacement(harness.mock, { id: 'a-shared', resourceId: 'shared-resource', position: 0 });
  seedMovePlacement(harness.mock, { id: 'a-other', resourceId: 'other-resource', position: 10 });
  seedMovePlacement(harness.mock, {
    id: 'b-shared', profileId: 'profile-move-b', resourceId: 'shared-resource', position: 10,
  });
  seedMovePlacement(harness.mock, {
    id: 'b-other', profileId: 'profile-move-b', resourceId: 'other-resource', position: 0,
  });
  const beforeA = snapshot(harness.mock, {
    placementIds: ['a-shared', 'a-other'],
    resourceIds: ['shared-resource', 'other-resource'],
  });
  const beforeBProfile = harness.mock.read('profiles-test', { pk: 'PROFILE#profile-move-b', sk: 'META' });
  const observedB = await owner(harness, 'creator-b');
  const target = observedB.links.find(({ placementId }) => placementId === 'b-shared');

  const saved = await expectOk(await move(harness, target.placementId, {
    profileVersion: observedB.profile.version,
    placementVersion: target.placementVersion,
    targetPosition: 1,
  }, { session: 'creator-b' }));

  assert.deepEqual(snapshot(harness.mock, {
    placementIds: ['a-shared', 'a-other'],
    resourceIds: ['shared-resource', 'other-resource'],
  }), beforeA);
  assert.equal(harness.mock.read('profiles-test', { pk: 'PROFILE#profile-move-a', sk: 'META' }).version,
    beforeA.profile.version);
  assert.equal(harness.mock.read('profiles-test', { pk: 'PROFILE#profile-move-b', sk: 'META' }).version,
    beforeBProfile.version + 1);
  assert.ok(saved.links.every(({ placementId }) => placementId.startsWith('b-')));
  assert.equal(harness.mock.read('catalog-test', { id: 'shared-resource' }).version, beforeA.resources[0].version);
});

test('respuesta y recibos coinciden con la inserción confirmada aunque una escritura posterior cambie un placement', async () => {
  const ids = ['a-first', 'b-middle', 'z-target'];
  const harness = await setup(ids.map((id, index) => ({ id, position: index * 10 })));
  const observed = await owner(harness);
  const target = observed.links.find(({ placementId }) => placementId === 'z-target');
  const wanted = insertedOrder(observed.links, target.placementId, 2);
  const before = snapshot(harness.mock, { placementIds: ids });
  harness.mock.mutateAfterNextTransaction(({ tables }) => {
    const placements = tables.get('profiles-test');
    const key = 'PROFILE#profile-move-a\u0000PLACEMENT#z-target';
    const current = placements.get(key);
    placements.set(key, { ...current, position: MAX_SAFE_POSITION, version: current.version + 1 });
    const profileKey = 'PROFILE#profile-move-a\u0000META';
    const profile = placements.get(profileKey);
    placements.set(profileKey, { ...profile, version: profile.version + 1 });
  });

  const saved = await expectOk(await move(harness, target.placementId, {
    profileVersion: observed.profile.version,
    placementVersion: target.placementVersion,
    targetPosition: 2,
  }));
  const responseTarget = saved.links.find(({ placementId }) => placementId === target.placementId);
  const storedTarget = harness.mock.read('profiles-test', {
    pk: 'PROFILE#profile-move-a', sk: 'PLACEMENT#z-target',
  });
  assert.ok(responseTarget.position > 0 && responseTarget.position < 10,
    'the target occupies the free gap in the confirmed insertion');
  assert.equal(responseTarget.placementVersion, target.placementVersion + 1);
  assert.equal(storedTarget.position, MAX_SAFE_POSITION, 'a later writer changed the stored placement');
  assert.equal(storedTarget.version, target.placementVersion + 2);
  assert.deepEqual(saved.links.map(({ placementId }) => placementId), [target.placementId]);
  assert.deepEqual(wanted, ['a-first', 'z-target', 'b-middle']);
  assert.deepEqual(sortReceipts(saved.versionChanges), [
    { entity: 'placement', id: 'z-target', before: before.placements[2].version, after: before.placements[2].version + 1 },
    { entity: 'profile', id: 'profile-move-a', before: before.profile.version, after: before.profile.version + 1 },
  ].sort((left, right) => `${left.entity}:${left.id}`.localeCompare(`${right.entity}:${right.id}`)));
});

test('100 acciones físicas caben; 101 se rechazan antes del TransactWrite y ofrecen un movimiento intermedio viable', async () => {
  const acceptedIds = Array.from({ length: 98 }, (_, index) => `a-${String(index).padStart(3, '0')}`);
  acceptedIds.push('z-target');
  const accepted = await setup(acceptedIds.map((id) => ({ id, position: 0 })));
  const initial = await owner(accepted);
  const target = initial.links.find(({ placementId }) => placementId === 'z-target');
  await expectOk(await move(accepted, target.placementId, {
    profileVersion: initial.profile.version,
    placementVersion: target.placementVersion,
    targetPosition: 1,
  }));
  assert.deepEqual(moveTransactionMetrics(accepted.mock), [{ actionCount: MAX_DYNAMO_ACTIONS }],
    '98 changed placements plus target and profile checks/writes produce exactly 100 unique actions');

  const rejectedIds = Array.from({ length: 99 }, (_, index) => `a-${String(index).padStart(3, '0')}`);
  rejectedIds.push('z-target');
  const rejected = await setup(rejectedIds.map((id) => ({ id, position: 0 })));
  const current = await owner(rejected);
  const rejectedTarget = current.links.find(({ placementId }) => placementId === 'z-target');
  const before = snapshot(rejected.mock, { placementIds: rejectedIds });
  const result = await move(rejected, rejectedTarget.placementId, {
    profileVersion: current.profile.version,
    placementVersion: rejectedTarget.placementVersion,
    targetPosition: 1,
  });
  assert.equal(result.status, 422);
  const body = await responseJson(result);
  assert.equal(body.error, 'ORDER_MOVE_LIMIT');
  assert.ok(Number.isSafeInteger(body.viablePosition));
  assert.ok(body.viablePosition > 1 && body.viablePosition < 100,
    'the suggestion moves toward the requested first ordinal without pretending the full request fits');
  assert.deepEqual(snapshot(rejected.mock, { placementIds: rejectedIds }), before);
  assert.equal(moveTransactionMetrics(rejected.mock).length, 0,
    'the oversized logical transaction is rejected before the real store sends a DynamoDB command');
  const suggestion = await expectOk(await move(rejected, rejectedTarget.placementId, {
    profileVersion: current.profile.version,
    placementVersion: rejectedTarget.placementVersion,
    targetPosition: body.viablePosition,
  }));
  assert.ok(suggestion.links.some(({ placementId }) => placementId === rejectedTarget.placementId));
  assert.ok(moveTransactionMetrics(rejected.mock)[0].actionCount <= MAX_DYNAMO_ACTIONS);
});

test('una intención densa de 150 a 1 no se divide; su sugerencia intermedia pasa el mismo límite de acciones', async () => {
  const ids = Array.from({ length: 149 }, (_, index) => `a-${String(index).padStart(3, '0')}`);
  ids.push('z-target');
  const harness = await setup(ids.map((id) => ({ id, position: 0 })));
  const current = await owner(harness);
  const target = current.links.find(({ placementId }) => placementId === 'z-target');
  const before = snapshot(harness.mock, { placementIds: ids });
  const response = await move(harness, target.placementId, {
    profileVersion: current.profile.version,
    placementVersion: target.placementVersion,
    targetPosition: 1,
  });
  assert.equal(response.status, 422);
  const error = await responseJson(response);
  assert.equal(error.error, 'ORDER_MOVE_LIMIT');
  assert.ok(Number.isSafeInteger(error.viablePosition));
  assert.ok(error.viablePosition > 1 && error.viablePosition < 150);
  assert.deepEqual(snapshot(harness.mock, { placementIds: ids }), before);
  assert.equal(moveTransactionMetrics(harness.mock).length, 0);

  const intermediate = await expectOk(await move(harness, target.placementId, {
    profileVersion: current.profile.version,
    placementVersion: target.placementVersion,
    targetPosition: error.viablePosition,
  }));
  assert.ok(intermediate.links.some(({ placementId }) => placementId === target.placementId));
  assert.ok(moveTransactionMetrics(harness.mock)[0].actionCount <= MAX_DYNAMO_ACTIONS);
});

test('el límite agregado de 4 MiB se mide con imágenes participantes aunque haya menos de 100 acciones', async () => {
  const ids = Array.from({ length: 15 }, (_, index) => `a-${String(index).padStart(3, '0')}`);
  ids.push('z-target');
  const largeMap = largeUnknownSeriesMap(2_100);
  const harness = await setup(ids.map((id) => ({ id, position: 0, series: largeMap })));
  const current = await owner(harness);
  const target = current.links.find(({ placementId }) => placementId === 'z-target');
  const changedCandidateCount = 15;
  const itemNameBytesLowerBound = 2_100 * 128;
  const participantImageCount = changedCandidateCount + 1; // changed placements + unchanged target ConditionCheck
  const aggregateLowerBound = participantImageCount * itemNameBytesLowerBound;
  const perItemConservativeUpperBound = 2_100 * 160 + DYNAMO_ITEM_BOUND;
  assert.ok(perItemConservativeUpperBound < MAX_DYNAMO_ITEM_BYTES,
    'every changed placement remains safely below the 400 KiB item cap');
  assert.ok(aggregateLowerBound > MAX_DYNAMO_TRANSACTION_BYTES,
    'the attribute names alone exceed the DynamoDB 4 MiB transaction-image budget');
  const before = snapshot(harness.mock, { placementIds: ids });
  const response = await move(harness, target.placementId, {
    profileVersion: current.profile.version,
    placementVersion: target.placementVersion,
    targetPosition: 1,
  });
  assert.equal(response.status, 422);
  const error = await responseJson(response);
  assert.equal(error.error, 'ORDER_MOVE_LIMIT');
  assert.ok(Number.isSafeInteger(error.viablePosition));
  assert.ok(error.viablePosition > 1 && error.viablePosition < ids.length);
  assert.deepEqual(snapshot(harness.mock, { placementIds: ids }), before);
  assert.equal(moveTransactionMetrics(harness.mock).length, 0,
    'the real store did not send the over-budget TransactWrite');

  const intermediate = await expectOk(await move(harness, target.placementId, {
    profileVersion: current.profile.version,
    placementVersion: target.placementVersion,
    targetPosition: error.viablePosition,
  }));
  assert.ok(intermediate.links.some(({ placementId }) => placementId === target.placementId));
  assert.ok(moveTransactionMetrics(harness.mock)[0].actionCount <= MAX_DYNAMO_ACTIONS);
  assert.ok(moveTransactionPhysicalBytes(harness.mock)[0] <= MAX_DYNAMO_TRANSACTION_BYTES,
    'the suggested move fits the 4 MiB limit measured from its actual TransactWriteItems');
  assert.ok(error.viablePosition > 1 && error.viablePosition < ids.length,
    'the returned position is a real intermediate move in the requested direction');
});

test('no envía una posición candidata que crecería un placement de 400 KiB a 400 KiB + 1 byte', async () => {
  const profileId = 'profile-move-a';
  const ids = ['a-first', 'z-target', 'm-large'];
  const large = exactLimitSeriesPayload({
    profileId,
    placementId: 'm-large',
    resourceId: 'resource-m-large',
    position: 100,
    version: 100,
  });
  const targetLarge = exactLimitSeriesPayload({
    profileId,
    placementId: 'z-target',
    resourceId: 'resource-z-target',
    position: 99,
    version: 100,
  });
  const harness = await setup([
    { id: 'a-first', position: 98 },
    { id: 'z-target', position: 99, placementVersion: 100, series: { legacy: targetLarge.value } },
    { id: 'm-large', position: 100, placementVersion: 100, series: { legacy: large.value } },
  ]);
  const current = await owner(harness);
  const target = current.links.find(({ placementId }) => placementId === 'z-target');
  // Each current image is exactly 409,600 bytes; a write changes version 100
  // (one significant digit) to 101 (three), adding one stored byte. Any legal
  // insertion here must change the target or the m-large neighbor.
  assert.equal(targetLarge.value.length + targetLarge.fixed, MAX_DYNAMO_ITEM_BYTES);
  assert.equal(large.value.length + large.fixed, MAX_DYNAMO_ITEM_BYTES);
  const before = snapshot(harness.mock, { placementIds: ids });
  const response = await move(harness, target.placementId, {
    profileVersion: current.profile.version,
    placementVersion: target.placementVersion,
    targetPosition: 3,
  });
  assert.equal(response.status, 422);
  const error = await responseJson(response);
  assert.equal(error.error, 'ORDER_MOVE_LIMIT');
  assert.equal(Object.hasOwn(error, 'viablePosition'), false,
    'there is no intermediate ordinal between the current and requested positions');
  assert.deepEqual(snapshot(harness.mock, { placementIds: ids }), before);
  assert.equal(moveTransactionMetrics(harness.mock).length, 0);
});

test('perfil/target/vecino stale y carreras CAS, también en no-op, no dejan cambios parciales', async () => {
  for (const race of ['profile', 'target', 'neighbor', 'noop-profile', 'noop-target']) {
    const ids = ['a-first', 'b-neighbor', 'z-target'];
    const harness = await setup(ids.map((id) => ({ id, position: 0 })));
    const current = await owner(harness);
    const target = current.links.find(({ placementId }) => placementId === 'z-target');
    const noOp = race.startsWith('noop');
    const requestedPosition = noOp ? 3 : 1;
    const before = snapshot(harness.mock, { placementIds: ids });
    const externalKey = race.endsWith('profile') || race === 'profile'
      ? 'PROFILE#profile-move-a\u0000META'
      : `PROFILE#profile-move-a\u0000PLACEMENT#${race === 'target' || race === 'noop-target' ? 'z-target' : 'a-first'}`;
    harness.mock.raceBeforeNextTransaction(({ tables }) => {
      const table = tables.get('profiles-test');
      const record = table.get(externalKey);
      table.set(externalKey, { ...record, version: record.version + 1 });
    });
    const response = await move(harness, target.placementId, {
      profileVersion: current.profile.version,
      placementVersion: target.placementVersion,
      targetPosition: requestedPosition,
    });
    assert.equal(response.status, 409, race);
    const after = snapshot(harness.mock, { placementIds: ids });
    const expected = structuredClone(before);
    const targetRace = race === 'target' || race === 'noop-target';
    const profileRace = race === 'profile' || race === 'noop-profile';
    if (targetRace) expected.placements[2].version += 1;
    if (profileRace) expected.profile.version += 1;
    if (race === 'neighbor') expected.placements[0].version += 1;
    assert.deepEqual(after, expected, `${race} preserves only the external competing commit`);
  }
});

test('versiones stale, entrada inválida y campos fuera del comando rechazan sin enviar una transacción', async () => {
  const ids = ['a-first', 'z-target'];
  const harness = await setup(ids.map((id, index) => ({ id, position: index * 10 })));
  const observed = await owner(harness);
  const target = observed.links.find(({ placementId }) => placementId === 'z-target');
  const valid = {
    profileVersion: observed.profile.version,
    placementVersion: target.placementVersion,
    targetPosition: 1,
  };
  for (const [field, values] of [
    ['profileVersion', [undefined, -1, '1', 1.5, Number.MAX_SAFE_INTEGER + 1]],
    ['placementVersion', [undefined, -1, '1', 1.5, Number.MAX_SAFE_INTEGER + 1]],
  ]) {
    for (const value of values) {
      const body = { ...valid, [field]: value };
      if (value === undefined) delete body[field];
      const response = await move(harness, target.placementId, body);
      assert.equal(response.status, 400, `${field}=${String(value)}`);
    }
  }
  const missingPosition = await move(harness, target.placementId, {
    profileVersion: valid.profileVersion,
    placementVersion: valid.placementVersion,
  });
  assert.equal(missingPosition.status, 400);
  for (const value of [0, 3, -1, '2', 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const body = { ...valid, targetPosition: value };
    const response = await move(harness, target.placementId, body);
    assert.equal(response.status, 422, `targetPosition=${String(value)}`);
  }
  for (const field of ['position', 'featured', 'series', 'resourceId', 'placementIds', 'profileId', 'search']) {
    const response = await move(harness, target.placementId, { ...valid, [field]: field === 'series' ? [] : 'forbidden' });
    assert.equal(response.status, 400, field);
  }
  const staleProfile = await move(harness, target.placementId, { ...valid, profileVersion: valid.profileVersion - 1 });
  assert.equal(staleProfile.status, 409);
  const staleTarget = await move(harness, target.placementId, { ...valid, placementVersion: valid.placementVersion - 1 });
  assert.equal(staleTarget.status, 409);
  assert.equal(moveTransactionMetrics(harness.mock).length, 0);
});

test('autenticación, origen, CSRF, método y límites del cuerpo se mantienen en la ruta nueva', async () => {
  const harness = await setup([{ id: 'target', position: 0 }]);
  const before = snapshot(harness.mock, { placementIds: ['target'] });
  const body = { profileVersion: 1, placementVersion: 1, targetPosition: 1 };
  for (const options of [
    { session: null, csrf: undefined, expected: 401 },
    { origin: 'https://evil.example', expected: 403 },
    { origin: null, expected: 403 },
    { csrf: 'wrong', expected: 403 },
    { method: 'GET', expected: 405 },
    { method: 'PATCH', expected: 405 },
  ]) {
    const { expected, ...requestOptions } = options;
    const requestBody = requestOptions.method === 'GET' ? undefined : body;
    const response = await move(harness, 'target', requestBody, requestOptions);
    assert.equal(response.status, expected);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.deepEqual(snapshot(harness.mock, { placementIds: ['target'] }), before);
  }
  const tooLarge = await move(harness, 'target', {
    ...body,
    unexpected: 'x'.repeat(33 * 1024),
  });
  assert.equal(tooLarge.status, 413);
  assert.deepEqual(snapshot(harness.mock, { placementIds: ['target'] }), before);
  assert.equal(moveTransactionMetrics(harness.mock).length, 0);
});

test('un fallo operativo de almacenamiento responde 503 y conserva todo el grupo', async () => {
  const ids = ['a-first', 'z-target'];
  const harness = await setup(ids.map((id, index) => ({ id, position: index * 10 })));
  const current = await owner(harness);
  const target = current.links.find(({ placementId }) => placementId === 'z-target');
  const before = snapshot(harness.mock, { placementIds: ids });
  harness.mock.failNextTransaction(new Error('injected DynamoDB failure'));
  const response = await move(harness, target.placementId, {
    profileVersion: current.profile.version,
    placementVersion: target.placementVersion,
    targetPosition: 1,
  });
  assert.equal(response.status, 503);
  assert.deepEqual(snapshot(harness.mock, { placementIds: ids }), before);
});

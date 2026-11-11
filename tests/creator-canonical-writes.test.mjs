import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  createDocumentStore,
  responseJson,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';

async function api(harness, path, { session = 'creator-a', method = 'GET', body } = {}) {
  return callApi(harness, path, {
    session,
    csrf: sessionCsrf[session],
    method,
    ...(body === undefined ? {} : { body }),
  });
}

async function createProfile(harness, slug = 'canonical-owner') {
  const response = await api(harness, '/api/creador/perfil', {
    method: 'PUT', body: { displayName: 'Ana', slug },
  });
  assert.equal(response.status, 200);
  return (await responseJson(response)).profile;
}

async function addLink(harness, title, slug) {
  const response = await api(harness, '/api/creador/enlaces', {
    method: 'POST', body: { title, url: `https://example.com/${slug}`, description: `Descripción de ${title}` },
  });
  assert.equal(response.status, 201);
  return responseJson(response);
}

async function createSeries(harness, name, slug) {
  const profile = await harness.store.get(`profile:${(await harness.store.get('account-profile:private-account-a')).profileId}`);
  const response = await api(harness, '/api/creador/series', {
    method: 'POST', body: { name, slug, profileVersion: profile.version },
  });
  assert.equal(response.status, 201);
  return responseJson(response);
}

async function changeChapter(harness, seriesId, placementId, method = 'PUT', extra = {}) {
  const profileId = (await harness.store.get('account-profile:private-account-a')).profileId;
  const profile = await harness.store.get(`profile:${profileId}`);
  return api(harness,
    `/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}`,
    { method, body: { profileVersion: profile.version, ...extra } });
}

async function editor(harness) {
  const response = await api(harness, '/api/creador/perfil');
  assert.equal(response.status, 200);
  return responseJson(response);
}

async function rawOwnerState(harness) {
  const profileId = (await harness.store.get('account-profile:private-account-a')).profileId;
  const profile = await harness.store.get(`profile:${profileId}`);
  const placements = await harness.store.list(`placement:${profileId}:`);
  const placementById = new Map(placements.map(({ value }) => [value.id, value]));
  const resourceIds = [...new Set([...placementById.values()].map(({ resourceId }) => resourceId))];
  const resources = new Map(await Promise.all(resourceIds.map(async (id) => [id, await harness.store.get(`resource:${id}`)])));
  return {
    profileId,
    profile,
    placements: placementById,
    resources,
  };
}

function versionSnapshot(state) {
  const result = new Map([[`profile:${state.profile.id}`, state.profile.version]]);
  for (const placement of state.placements.values()) {
    result.set(`placement:${placement.id}`, placement.version ?? 0);
  }
  return result;
}

function receiptRows(body) {
  return (body.versionChanges ?? [])
    .map(({ entity, id, before, after }) => ({ entity, id, before, after }))
    .sort((a, b) => `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`));
}

function versionDeltas(before, after) {
  const beforeVersions = versionSnapshot(before);
  const afterVersions = versionSnapshot(after);
  const result = [];
  for (const [key, next] of afterVersions) {
    const previous = beforeVersions.get(key);
    if (previous === undefined || previous === next) continue;
    const [entity, id] = key.split(':');
    result.push({ entity, id, before: previous, after: next });
  }
  return result.sort((a, b) => `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`));
}

function assertReceiptsMatchRawMutations(body, before, after) {
  assert.deepEqual(receiptRows(body), versionDeltas(before, after),
    'each receipt must match the version change in the raw profile or placement record');
  assert.deepEqual(after.resources, before.resources,
    'a placement-only command does not write the resource records carried by its response DTO');
}

function assertCanonicalLinks(body, state, expectedSeriesByPlacement) {
  assert.ok(Array.isArray(body.links), 'the command returns canonical affected links');
  const wantedIds = [...expectedSeriesByPlacement.keys()].sort();
  assert.deepEqual(body.links.map(({ placementId }) => placementId).sort(), wantedIds,
    'the response contains only the target and placements affected by this command');
  for (const id of wantedIds) {
    const placement = state.placements.get(id);
    const resource = state.resources.get(placement?.resourceId);
    assert.ok(placement && resource, `raw committed placement and resource exist for ${id}`);
    const link = body.links.find((item) => item.placementId === id);
    assert.deepEqual({ ...link, series: [...link.series].sort((a, b) => a.seriesId.localeCompare(b.seriesId)) }, {
      placementId: placement.id,
      resourceId: resource.id,
      title: resource.title,
      url: resource.url,
      ...(typeof resource.description === 'string' ? { description: resource.description } : {}),
      featured: placement.featured,
      position: placement.position,
      selectedForDirectory: placement.selectedForDirectory,
      hidden: false,
      series: [...expectedSeriesByPlacement.get(id)].sort((a, b) => a.seriesId.localeCompare(b.seriesId)),
      directoryApproval: 'pending',
      resourceVersion: resource.version,
      placementVersion: placement.version,
    }, 'the full link DTO matches the raw records and expected active memberships without depending on tag serialization order');
  }
}

test('chapter add and no-op return their canonical target link, profile version, and raw-matching receipts', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const first = await addLink(harness, 'Primer capítulo', 'canonical-chapter-one');
  const second = await addLink(harness, 'Segundo capítulo', 'canonical-chapter-two');
  const series = await createSeries(harness, 'Serie principal', 'serie-principal');

  const beforeAdd = await rawOwnerState(harness);
  const added = await responseJson(await changeChapter(harness, series.series.id, first.link.placementId));
  const afterAdd = await rawOwnerState(harness);
  assert.equal(added.status, 200);
  assert.equal(added.profileVersion, afterAdd.profile.version, 'chapter add returns the committed profile version');
  assertReceiptsMatchRawMutations(added, beforeAdd, afterAdd);
  assertCanonicalLinks(added, afterAdd, new Map([[first.link.placementId, [{
    seriesId: series.series.id, position: afterAdd.placements.get(first.link.placementId).series[series.series.id].position,
  }]]]));
  assert.deepEqual(afterAdd.placements.get(second.link.placementId), beforeAdd.placements.get(second.link.placementId));
  assert.deepEqual(afterAdd.resources, beforeAdd.resources, 'chapter changes do not change resource records');

  const secondAdd = await responseJson(await changeChapter(harness, series.series.id, second.link.placementId));
  assert.equal(secondAdd.status, 200);
  const beforeNoop = await rawOwnerState(harness);
  const storedOrder = [...beforeNoop.placements.values()]
    .filter((placement) => placement.series?.[series.series.id])
    .sort((a, b) => a.series[series.series.id].position - b.series[series.series.id].position || a.id.localeCompare(b.id))
    .map(({ id }) => id);
  assert.deepEqual(storedOrder, [first.link.placementId, second.link.placementId],
    'adding the second chapter appends it without choosing an exact numeric rank in the oracle');
  const noop = await responseJson(await changeChapter(harness, series.series.id, first.link.placementId));
  const afterNoop = await rawOwnerState(harness);
  assert.equal(noop.status, 200);
  assert.equal(noop.profileVersion, afterNoop.profile.version, 'chapter no-op returns the unchanged profile version');
  assertReceiptsMatchRawMutations(noop, beforeNoop, afterNoop);
  assertCanonicalLinks(noop, afterNoop, new Map([[first.link.placementId, [{
    seriesId: series.series.id, position: beforeNoop.placements.get(first.link.placementId).series[series.series.id].position,
  }]]]));
  assert.deepEqual(afterNoop, beforeNoop, 'a clean membership no-op retains every observed raw record');
  assert.equal(afterNoop.placements.get(first.link.placementId).version,
    beforeNoop.placements.get(first.link.placementId).version,
    'an idempotent membership add retains its placement version');
  assert.equal(afterNoop.profile.version, beforeNoop.profile.version,
    'an idempotent membership add retains its profile version');
});

test('repeated chapter add returns canonical links and receipts when it cleans a deleted series membership', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const target = await addLink(harness, 'Capítulo activo', 'canonical-cleanup-target');
  const unrelated = await addLink(harness, 'Otro capítulo', 'canonical-cleanup-unrelated');
  const active = await createSeries(harness, 'Serie activa', 'serie-activa');
  const unrelatedSeries = await createSeries(harness, 'Otra serie', 'otra-serie');
  const retired = await createSeries(harness, 'Serie eliminada', 'serie-eliminada');
  await changeChapter(harness, active.series.id, target.link.placementId);
  await changeChapter(harness, unrelatedSeries.series.id, unrelated.link.placementId);
  await changeChapter(harness, retired.series.id, target.link.placementId);

  const profileId = (await harness.store.get('account-profile:private-account-a')).profileId;
  const retiredSeries = await harness.store.get(`series:${profileId}:${retired.series.id}`);
  const profile = await harness.store.get(`profile:${profileId}`);
  assert.equal((await api(harness, `/api/creador/series/${retired.series.id}`, {
    method: 'DELETE', body: { version: retiredSeries.version, profileVersion: profile.version },
  })).status, 204);

  const before = await rawOwnerState(harness);
  const cleaned = await responseJson(await changeChapter(harness, active.series.id, target.link.placementId));
  const after = await rawOwnerState(harness);
  assert.equal(cleaned.status, 200);
  assert.equal(cleaned.profileVersion, after.profile.version, 'stale-membership cleanup returns its committed profile version');
  assertReceiptsMatchRawMutations(cleaned, before, after);
  assertCanonicalLinks(cleaned, after, new Map([[target.link.placementId, [{
    seriesId: active.series.id, position: before.placements.get(target.link.placementId).series[active.series.id].position,
  }]]]));
  assert.deepEqual(after.placements.get(target.link.placementId).series, {
    [active.series.id]: before.placements.get(target.link.placementId).series[active.series.id],
  }, 'the committed cleanup removes only the deleted series membership');
  assert.deepEqual(after.placements.get(unrelated.link.placementId), before.placements.get(unrelated.link.placementId),
    'another placement and its series membership stay untouched');
  assert.equal((await harness.store.get(`series:${profileId}:${unrelatedSeries.series.id}`)).version,
    unrelatedSeries.series.version, 'the other series record stays untouched');
});

test('adjacent chapter tie move returns the target and every changed placement with matching receipts', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const first = await addLink(harness, 'Capítulo A', 'canonical-tie-a');
  const second = await addLink(harness, 'Capítulo B', 'canonical-tie-b');
  const third = await addLink(harness, 'Capítulo sin movimiento', 'canonical-tie-c');
  const series = await createSeries(harness, 'Serie con empate', 'serie-con-empate');
  const otherSeries = await createSeries(harness, 'Serie independiente', 'serie-independiente');
  await changeChapter(harness, series.series.id, first.link.placementId);
  await changeChapter(harness, series.series.id, second.link.placementId);
  await changeChapter(harness, series.series.id, third.link.placementId);
  await changeChapter(harness, otherSeries.series.id, first.link.placementId);

  const state = await rawOwnerState(harness);
  const tiedIds = [first.link.placementId, second.link.placementId]
    .sort((a, b) => a.localeCompare(b));
  const leader = tiedIds[0];
  const targetId = tiedIds[1];
  const tiedPosition = 10;
  for (const id of tiedIds) {
    const current = state.placements.get(id);
    assert.equal(await harness.store.transact({
      checks: [{ key: `placement:${state.profileId}:${id}`, version: current.version }],
      puts: [{ key: `placement:${state.profileId}:${id}`, value: {
        ...current, series: { ...current.series, [series.series.id]: { position: tiedPosition } },
      } }],
    }), true);
  }
  const before = await rawOwnerState(harness);
  const moved = await responseJson(await changeChapter(harness, series.series.id, targetId, 'PATCH', { direction: 'up' }));
  const after = await rawOwnerState(harness);
  assert.equal(moved.status, 200);
  assert.equal(moved.profileVersion, after.profile.version, 'adjacent move returns its committed profile version');
  assertReceiptsMatchRawMutations(moved, before, after);
  const changedIds = [...before.placements.entries()]
    .filter(([id, previous]) => {
      const next = after.placements.get(id);
      const rankChanged = previous.series?.[series.series.id]?.position
        !== next.series?.[series.series.id]?.position;
      const versionChanged = (previous.version ?? 0) !== (next.version ?? 0);
      assert.equal(versionChanged, rankChanged, `${id} advances only when its selected-series rank changes`);
      return rankChanged || versionChanged;
    })
    .map(([id]) => id);
  const expectedIds = [...new Set([targetId, ...changedIds])].sort();
  const expectedSeriesByPlacement = new Map(expectedIds.map((id) => {
    const placement = after.placements.get(id);
    const memberships = [series.series.id, otherSeries.series.id]
      .filter((seriesId) => Object.hasOwn(placement.series ?? {}, seriesId))
      .map((seriesId) => ({ seriesId, position: placement.series[seriesId].position }));
    return [id, memberships.sort((a, b) => a.position - b.position || a.seriesId.localeCompare(b.seriesId))];
  }));
  assertCanonicalLinks(moved, after, expectedSeriesByPlacement);
  const actualOrder = [...after.placements.values()]
    .filter((placement) => placement.series?.[series.series.id])
    .sort((a, b) => a.series[series.series.id].position - b.series[series.series.id].position || a.id.localeCompare(b.id))
    .map(({ id }) => id);
  assert.deepEqual(actualOrder, [targetId, leader, third.link.placementId],
    'adjacent up produces the intended sequence independently of exact integer ranks');
  assert.deepEqual(after.placements.get(first.link.placementId).series[otherSeries.series.id],
    before.placements.get(first.link.placementId).series[otherSeries.series.id],
    'moving one chapter preserves its membership in another series');
  assert.deepEqual(after.placements.get(third.link.placementId), before.placements.get(third.link.placementId),
    'a non-neighbor chapter is not included in the write');
  assert.equal(before.placements.get(leader).series[series.series.id].position,
    before.placements.get(targetId).series[series.series.id].position,
    'the prepared case starts with equal adjacent positions');
});

test('legacy position swap keeps link and adds canonical target plus neighbor DTOs', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness);
  const first = await addLink(harness, 'Enlace A', 'canonical-legacy-a');
  const second = await addLink(harness, 'Enlace B', 'canonical-legacy-b');
  const retainedSeries = await createSeries(harness, 'Pertenencia conservada', 'canonical-legacy-series');
  await changeChapter(harness, retainedSeries.series.id, second.link.placementId);
  const before = await rawOwnerState(harness);
  const target = before.placements.get(second.link.placementId);
  const profileVersion = before.profile.version;
  const response = await api(harness, `/api/creador/enlaces/${second.link.placementId}`, {
    method: 'PATCH', body: { position: first.link.position, version: target.version, profileVersion },
  });
  assert.equal(response.status, 200);
  const body = await responseJson(response);
  const after = await rawOwnerState(harness);

  assertReceiptsMatchRawMutations(body, before, after);
  assert.ok(Array.isArray(body.links), 'a legacy swap returns its target and changed neighbor');
  assert.deepEqual(body.links.map(({ placementId }) => placementId).sort(),
    [first.link.placementId, second.link.placementId].sort());
  const canonicalTarget = body.links.find(({ placementId }) => placementId === second.link.placementId);
  assert.deepEqual(body.link, canonicalTarget, 'the legacy target field remains compatible');
  assertCanonicalLinks(body, after, new Map([
    [first.link.placementId, []],
    [second.link.placementId, [{
      seriesId: retainedSeries.series.id,
      position: before.placements.get(second.link.placementId).series[retainedSeries.series.id].position,
    }]],
  ]));
  assert.equal(after.placements.get(second.link.placementId).position, first.link.position);
  assert.equal(after.placements.get(first.link.placementId).position, second.link.position);
  assert.deepEqual(after.placements.get(second.link.placementId).series, before.placements.get(second.link.placementId).series,
    'the legacy position command retains the target membership map');
  assert.deepEqual(after.resources, before.resources, 'the legacy position command does not write resource metadata');
});

test('new link acknowledgement uses its prepared command DTO if a real resource edit commits before the response', async () => {
  const base = createDocumentStore();
  let harness;
  let intercept = true;
  let createdRecord;
  let creationTransaction;
  const store = {
    get: base.get.bind(base),
    list: base.list.bind(base),
    async transact(transaction) {
      const captured = structuredClone(transaction);
      const committed = await base.transact(transaction);
      const actualCreated = captured.puts.find(({ key, value }) => key.startsWith('resource:')
        && value?.recordType !== 'urlReservation' && value?.directoryControl === 'creator');
      if (committed && intercept && actualCreated) {
        intercept = false;
        creationTransaction = captured;
        createdRecord = structuredClone(actualCreated.value);
        const edit = await api(harness, `/api/creador/recursos/${createdRecord.id}`, {
          method: 'PATCH', body: { title: 'Cambio después del alta', version: createdRecord.version },
        });
        assert.equal(edit.status, 200, 'the intervening edit uses the real creator metadata command');
      }
      return committed;
    },
  };
  harness = await createCreatorPagesHarness({ store });
  const profile = await createProfile(harness);
  const response = await api(harness, '/api/creador/enlaces', {
    method: 'POST', body: { title: 'Título preparado', url: 'https://example.com/canonical-prepared', description: 'Descripción preparada' },
  });
  assert.equal(response.status, 201);
  const body = await responseJson(response);
  const createdPlacement = creationTransaction.puts.find(({ key }) => key.startsWith(`placement:${profile.id}:`))?.value;
  const createdProfile = creationTransaction.puts.find(({ key }) => key === `profile:${profile.id}`)?.value;

  assert.equal(profile.version, 1);
  assert.equal(createdRecord.version, 1);
  assert.equal(createdProfile.version, 2);
  assert.equal(createdPlacement.version, 2);
  assert.equal(body.link.title, createdRecord.title);
  assert.equal(body.link.url, createdRecord.url);
  assert.equal(body.link.description, createdRecord.description);
  assert.equal(body.link.resourceVersion, createdRecord.version,
    'the acknowledgement version belongs to the original create commit');
  assert.deepEqual(receiptRows(body), [
    { entity: 'placement', id: createdPlacement.id, before: 0, after: 2 },
    { entity: 'profile', id: profile.id, before: 1, after: 2 },
    { entity: 'resource', id: createdRecord.id, before: 0, after: 1 },
  ].sort((a, b) => `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`)));
  const latestResource = await harness.store.get(`resource:${createdRecord.id}`);
  assert.equal(latestResource.title, 'Cambio después del alta');
  assert.equal(latestResource.version, 2,
    'the concurrent write remains persisted without changing the earlier command result');
});

test('series normalization preserves omitted descriptions, stores explicit blank, and clears non-empty text', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'canonical-series-normalization');
  const created = await createSeries(harness, ' Serie normalizada ', 'serie-normalizada');
  const profileId = (await harness.store.get('account-profile:private-account-a')).profileId;
  const original = await harness.store.get(`series:${profileId}:${created.series.id}`);
  assert.equal(original.name, 'Serie normalizada');
  assert.equal(Object.hasOwn(original, 'description'), false, 'omitted optional description stays absent');

  const noOpProfile = await harness.store.get(`profile:${profileId}`);
  const noop = await api(harness, `/api/creador/series/${created.series.id}`, {
    method: 'PATCH', body: { name: '  Serie normalizada  ', version: original.version, profileVersion: noOpProfile.version },
  });
  assert.equal(noop.status, 200);
  const noopBody = await responseJson(noop);
  assert.deepEqual(noopBody.versionChanges, []);
  assert.equal(noopBody.profileVersion, noOpProfile.version);
  assert.equal(Object.hasOwn(noopBody.series, 'description'), false);
  assert.deepEqual(await harness.store.get(`series:${profileId}:${created.series.id}`), original,
    'omitting the optional description preserves its absent storage state');

  const blankProfile = await harness.store.get(`profile:${profileId}`);
  const explicitBlank = await api(harness, `/api/creador/series/${created.series.id}`, {
    method: 'PATCH', body: { description: '   ', version: original.version, profileVersion: blankProfile.version },
  });
  assert.equal(explicitBlank.status, 200);
  const blankBody = await responseJson(explicitBlank);
  assert.equal(blankBody.series.description, '', 'an explicitly submitted blank normalizes to present-empty');
  assert.equal(blankBody.series.version, original.version + 1);
  assert.equal(blankBody.profileVersion, blankProfile.version + 1);
  const presentEmpty = await harness.store.get(`series:${profileId}:${created.series.id}`);
  assert.equal(Object.hasOwn(presentEmpty, 'description'), true);
  assert.equal(presentEmpty.description, '');

  const repeatProfile = await harness.store.get(`profile:${profileId}`);
  const repeatedBlank = await api(harness, `/api/creador/series/${created.series.id}`, {
    method: 'PATCH', body: { description: '  ', version: presentEmpty.version, profileVersion: repeatProfile.version },
  });
  assert.equal(repeatedBlank.status, 200);
  assert.deepEqual((await responseJson(repeatedBlank)).versionChanges, [], 'present-empty repeated remains a no-op');

  const setProfile = await harness.store.get(`profile:${profileId}`);
  const set = await api(harness, `/api/creador/series/${created.series.id}`, {
    method: 'PATCH', body: { description: '  Descripción guardada  ', version: presentEmpty.version, profileVersion: setProfile.version },
  });
  assert.equal(set.status, 200);
  const setBody = await responseJson(set);
  assert.equal(setBody.series.description, 'Descripción guardada');
  const beforeClear = await harness.store.get(`series:${profileId}:${created.series.id}`);
  const clearProfile = await harness.store.get(`profile:${profileId}`);
  const cleared = await api(harness, `/api/creador/series/${created.series.id}`, {
    method: 'PATCH', body: { description: '  ', version: beforeClear.version, profileVersion: clearProfile.version },
  });
  assert.equal(cleared.status, 200);
  const clearedBody = await responseJson(cleared);
  assert.equal(clearedBody.series.description, '', 'blank input explicitly clears a stored description');
  assert.equal(clearedBody.series.version, beforeClear.version + 1);
  assert.equal(clearedBody.profileVersion, clearProfile.version + 1);
});

test('retired own resource accepts a normalized no-op and still rejects a stale submitted version', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'retired-resource-noop');
  const created = await addLink(harness, 'Ficha retirada', 'retired-resource-noop');
  const beforeRetire = await harness.store.get('profile:' + (await harness.store.get('account-profile:private-account-a')).profileId);
  const removed = await api(harness, `/api/creador/enlaces/${created.link.placementId}`, {
    method: 'DELETE', body: { profileVersion: beforeRetire.version },
  });
  assert.equal(removed.status, 204);

  const owner = await editor(harness);
  assert.equal(owner.links.some(({ resourceId }) => resourceId === created.link.resourceId), false);
  assert.equal(owner.editableResources.some(({ id }) => id === created.link.resourceId), true,
    'removing a placement does not remove edit authority for the retained resource');
  const beforeNoop = await harness.store.get(`resource:${created.link.resourceId}`);
  const noop = await api(harness, `/api/creador/recursos/${created.link.resourceId}`, {
    method: 'PATCH', body: { title: `  ${beforeNoop.title}  `, version: beforeNoop.version },
  });
  assert.equal(noop.status, 200);
  const noopBody = await responseJson(noop);
  assert.deepEqual(noopBody.versionChanges, []);
  assert.equal(noopBody.resource.version, beforeNoop.version);
  assert.deepEqual(await harness.store.get(`resource:${created.link.resourceId}`), beforeNoop,
    'a normalized metadata no-op preserves the retired record and its version');

  const changed = await api(harness, `/api/creador/recursos/${created.link.resourceId}`, {
    method: 'PATCH', body: { title: 'Título actual', version: beforeNoop.version },
  });
  assert.equal(changed.status, 200);
  const stale = await api(harness, `/api/creador/recursos/${created.link.resourceId}`, {
    method: 'PATCH', body: { title: '  Título actual  ', version: beforeNoop.version },
  });
  assert.equal(stale.status, 409,
    'the API checks a stale version even when normalized submitted metadata matches current data');
  assert.equal((await responseJson(stale)).error, 'RESOURCE_CONFLICT');
  assert.equal((await harness.store.get(`resource:${created.link.resourceId}`)).version, beforeNoop.version + 1);
});


import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCreatorContentHarness, creatorRequest, readCreatorSnapshot } from './fixtures/creator-content.mjs';

async function command(harness, path, method, body, status = 200) {
  const response = await creatorRequest(harness, path, { method, body });
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  return result;
}

test('a new link acknowledges its own commit even if a later metadata edit has already committed', async () => {
  const harness = await createCreatorContentHarness();
  const baseline = await readCreatorSnapshot(harness);
  const original = harness.store.transact.bind(harness.store);
  let later;
  let editing = false;
  harness.store.transact = async (change) => {
    const committed = await original(change);
    if (committed && !editing) {
      editing = true;
      const current = await readCreatorSnapshot(harness);
      const [id] = current.order.ordinary;
      const { resourceId } = current.placements[id];
      const resource = current.resources.find(({ id }) => id === resourceId);
      later = await command(harness, '/api/creador/enlaces/' + id + '/editar/', 'PATCH', {
        creatorVersion: current.creatorVersion, resourceVersion: resource.version, title: 'Título posterior',
      });
    }
    return committed;
  };
  const added = await command(harness, '/api/creador/enlaces/', 'POST', {
    creatorVersion: baseline.creatorVersion, url: 'https://example.com/canonical-add', title: 'Título inicial',
  }, 201);
  assert.equal(added.disposition, 'resource-created');
  assert.equal(added.resourceId, later.resourceId);
  assert.equal(added.placementId, later.placementId);
  assert.ok(later.resourceVersion > added.resourceVersion);
  const saved = await readCreatorSnapshot(harness);
  assert.deepEqual(saved.order.ordinary, [added.placementId]);
  assert.equal(saved.resources[0].title, 'Título posterior');
  assert.equal(saved.resources[0].version, later.resourceVersion);
});

test('series normalization preserves an omitted description and honors explicit blank input', async () => {
  const harness = await createCreatorContentHarness();
  const before = await readCreatorSnapshot(harness);
  const created = await command(harness, '/api/creador/series/', 'POST', {
    creatorVersion: before.creatorVersion, name: '  Ruta  ', slug: 'ruta-seleccionada',
  }, 201);
  const seriesPath = '/api/creador/series/' + created.seriesId + '/';
  const initial = await readCreatorSnapshot(harness);
  assert.equal(initial.series[created.seriesId].name, 'Ruta');
  assert.equal(Object.hasOwn(initial.series[created.seriesId], 'description'), false);
  const blank = await command(harness, seriesPath, 'PATCH', { creatorVersion: initial.creatorVersion, description: '  ' });
  assert.equal(blank.disposition, 'saved');
  assert.equal((await readCreatorSnapshot(harness)).series[created.seriesId].description, '');
  const repeated = await command(harness, seriesPath, 'PATCH', { creatorVersion: blank.creatorVersion, description: '  ' });
  assert.equal(repeated.disposition, 'unchanged');
  assert.equal(repeated.creatorVersion, blank.creatorVersion);
  const described = await command(harness, seriesPath, 'PATCH', {
    creatorVersion: repeated.creatorVersion, description: '  Una descripción  ',
  });
  assert.equal((await readCreatorSnapshot(harness)).series[created.seriesId].description, 'Una descripción');
  await command(harness, seriesPath, 'PATCH', { creatorVersion: described.creatorVersion, description: '' });
  assert.equal((await readCreatorSnapshot(harness)).series[created.seriesId].description, '');
});

test('a normalized retained-resource no-op preserves state and still checks an explicitly stale revision', async () => {
  const harness = await createCreatorContentHarness();
  const baseline = await readCreatorSnapshot(harness);
  const added = await command(harness, '/api/creador/enlaces/', 'POST', {
    creatorVersion: baseline.creatorVersion, title: 'Ficha retirada', url: 'https://example.com/retained-noop',
  }, 201);
  await command(harness, '/api/creador/enlaces/' + added.placementId + '/', 'DELETE', {
    creatorVersion: added.creatorVersion,
  });
  const retired = await readCreatorSnapshot(harness);
  assert.equal(Object.hasOwn(retired.placements, added.placementId), false);
  const resource = retired.resources.find(({ id }) => id === added.resourceId);
  assert.equal(resource.metadataEditable, true);
  const path = '/api/creador/recursos/?' + new URLSearchParams({ id: resource.id });
  const key = 'resource:' + resource.id;
  const physical = await harness.store.get(key);
  const noop = await command(harness, path, 'PATCH', { resourceVersion: resource.version, title: '  Ficha retirada  ' });
  assert.equal(noop.disposition, 'unchanged');
  assert.equal(noop.resourceVersion, resource.version);
  assert.deepEqual(await harness.store.get(key), physical);
  const changed = await command(harness, path, 'PATCH', { resourceVersion: resource.version, title: 'Título actual' });
  const stale = await command(harness, path, 'PATCH', { resourceVersion: resource.version, title: '  Título actual  ' }, 409);
  assert.equal(stale.error, 'RESOURCE_CONFLICT');
  const saved = await readCreatorSnapshot(harness);
  assert.equal(saved.creatorVersion, retired.creatorVersion);
  assert.equal(Object.hasOwn(saved.placements, added.placementId), false);
  assert.equal(saved.resources.find(({ id }) => id === resource.id).version, changed.resourceVersion);
});

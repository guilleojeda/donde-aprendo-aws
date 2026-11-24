import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { importCatalog, TARGET_ACCOUNT_ID } from '../src/lib/catalog-import.mjs';
import { currentUrlKey } from '../src/lib/catalog-url.mjs';
import { CREATOR_CONTRACT_VERSION } from '../src/lib/creator-values.mjs';
import { callApi, sessionCsrf } from './fixtures/creator-pages.mjs';
import { createDynamoMoveHarness, seedMoveProfile, seedMoveResource } from './fixtures/creator-link-move.mjs';

async function api(harness, pathname, body, { method = 'POST', session = 'creator-a' } = {}) {
  const response = await callApi(harness, pathname, {
    method, session, csrf: sessionCsrf[session],
    ...(method === 'GET' ? {} : { creatorContract: CREATOR_CONTRACT_VERSION }),
    ...(body === undefined ? {} : { body }),
  });
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}

async function owner(harness, session = 'creator-a') {
  const result = await api(harness, '/api/creador/perfil', undefined, { method: 'GET', session });
  assert.equal(result.status, 200);
  assert.equal(result.data.schemaVersion, 3);
  return result.data;
}

for (const resourceId of ['import:catalog:' + 'r'.repeat(147), 'legacy:event/雪.' + 'r'.repeat(175)]) {
  test(`reincorporar conserva el ID importado exacto de ${resourceId.length} caracteres y sus controles`, async () => {
    const harness = await createDynamoMoveHarness();
    seedMoveProfile(harness.mock);
    seedMoveProfile(harness.mock, { accountId: 'private-account-b', profileId: 'profile-move-b', slug: 'otra-persona' });
    const url = 'https://example.invalid/imported-readd?literal=%2f';
    seedMoveResource(harness.mock, { id: resourceId, title: 'Ficha importada', url });

    let observed = await owner(harness);
    assert.equal((await api(harness, '/api/creador/referencias', {
      resourceId, url, creatorVersion: observed.creatorVersion,
    })).status, 201);
    assert.equal((await api(harness, '/api/creador/reclamaciones', {
      resources: [{ resourceId, url }], evidence: 'Autoría comprobada',
    })).status, 202);
    assert.equal((await api(harness, '/api/admin/reclamaciones/vincular', {
      accountId: 'private-account-a', resourceIds: [resourceId],
    }, { session: 'admin' })).status, 200);

    observed = await owner(harness);
    const originalPlacement = Object.entries(observed.placements).find(([, placement]) => placement.resourceId === resourceId);
    assert.ok(originalPlacement);
    const [placementId] = originalPlacement;
    const original = observed.resources.find((resource) => resource.id === resourceId);
    assert.ok(original);
    assert.equal((await api(harness, `/api/creador/enlaces/${placementId}/editar`, {
      creatorVersion: observed.creatorVersion,
      resourceVersion: original.version,
      title: 'Título actualizado', description: 'Descripción conservada',
    }, { method: 'PATCH' })).status, 200);
    observed = await owner(harness);
    assert.equal((await api(harness, `/api/creador/enlaces/${placementId}`, {
      creatorVersion: observed.creatorVersion,
    }, { method: 'DELETE' })).status, 200);

    observed = await owner(harness);
    assert.equal(Object.hasOwn(observed.placements, placementId), false);
    const retained = observed.resources.find((resource) => resource.id === resourceId);
    assert.ok(retained);
    const transactionsBeforeRejected = harness.mock.transactions.length;
    assert.equal((await api(harness, '/api/creador/enlaces', {
      creatorVersion: observed.creatorVersion, resourceId, resourceVersion: retained.version - 1,
    })).status, 409, 'a long identity still requires the observed resource version');
    const ownerB = await owner(harness, 'creator-b');
    assert.equal((await api(harness, '/api/creador/enlaces', {
      creatorVersion: ownerB.creatorVersion, resourceId, resourceVersion: retained.version,
    }, { session: 'creator-b' })).status, 403, 'the ID does not grant another creator editing authority');
    assert.equal(harness.mock.transactions.length, transactionsBeforeRejected);
    assert.equal(Object.hasOwn((await owner(harness)).placements, placementId), false);
    assert.equal((await owner(harness, 'creator-b')).resources.some(({ id }) => id === resourceId), false);

    const restored = await api(harness, '/api/creador/enlaces', {
      creatorVersion: observed.creatorVersion, resourceId, resourceVersion: retained.version,
    });
    assert.equal(restored.status, 201);
    assert.equal(restored.data.resourceId, resourceId);
    assert.equal(restored.data.placementId, placementId);
    const restoredOwner = await owner(harness);
    const restoredResource = restoredOwner.resources.find(({ id }) => id === resourceId);
    assert.equal(restoredResource.version, retained.version);
    assert.equal(restoredResource.title, 'Título actualizado');
    assert.equal(restoredResource.description, 'Descripción conservada');
    assert.equal(restoredResource.url, url);

    const repeated = await api(harness, '/api/creador/enlaces', {
      creatorVersion: restoredOwner.creatorVersion, resourceId, resourceVersion: retained.version,
    });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.placementId, placementId);
    assert.equal(repeated.data.disposition, 'already-present');
    assert.equal(Object.keys((await owner(harness)).placements).length, 1);
    assert.equal((await owner(harness, 'creator-b')).resources.some(({ id }) => id === resourceId), false);
  });
}

test('import, grant, retained edit and re-add preserve both literal dot IDs', async () => {
  const harness = await createDynamoMoveHarness({ projectionAware: true });
  seedMoveProfile(harness.mock);
  const rows = ['.', '..'].map((id, index) => ({
    id, url: `https://example.invalid/imported-dot/${index}?original=%2f`,
    title: `Ficha importada ${index}`, description: 'Importada',
    category: 'Contenido', kind: 'content', format: 'Artículo', topics: ['Fundamentos'],
    published: true, order: index + 1, featured: false,
  }));
  const imported = await importCatalog(rows, {
    tableName: 'catalog-test',
    getCallerIdentity: async () => ({ Account: TARGET_ACCOUNT_ID }),
    getItem: (parameters) => harness.mock.client.send(new GetCommand(parameters)),
    transactWrite: (parameters) => harness.mock.client.send(new TransactWriteCommand(parameters)),
  });
  assert.deepEqual(imported, { total: 2, created: 2, skipped: 0 });
  for (const { id, url } of rows) {
    assert.equal(harness.mock.read('catalog-test', { id }).url, url);
    assert.equal((await harness.store.get(currentUrlKey(url))).resourceId, id);
  }

  const claimed = await api(harness, '/api/creador/reclamaciones', {
    resources: rows.map(({ id, url }) => ({ resourceId: id, url })),
  });
  assert.equal(claimed.status, 202);
  assert.equal(claimed.data.operation, 'create-claim');
  const claimedOwner = await owner(harness);
  assert.deepEqual(claimedOwner.claims.find(({ id }) => id === claimed.data.claimId).resources,
    rows.map(({ id, url }) => ({ resourceId: id, url })));
  const granted = await api(harness, '/api/admin/reclamaciones/vincular', {
    accountId: 'private-account-a', resourceIds: rows.map(({ id }) => id),
  }, { session: 'admin' });
  assert.equal(granted.status, 200);
  assert.deepEqual(granted.data.linkedResourceIds.toSorted(), ['.', '..']);

  const placementIds = new Map();
  for (const { id } of rows) {
    const before = await owner(harness);
    const resource = before.resources.find((item) => item.id === id);
    assert.ok(resource);
    let placementId = Object.entries(before.placements).find(([, placement]) => placement.resourceId === id)?.[0];
    if (!placementId) {
      const placed = await api(harness, '/api/creador/enlaces', {
        creatorVersion: before.creatorVersion, resourceId: id, resourceVersion: resource.version,
      });
      assert.ok([200, 201].includes(placed.status), JSON.stringify(placed.data));
      placementId = placed.data.placementId;
    }
    placementIds.set(id, placementId);
  }

  for (const [index, { id, url }] of rows.entries()) {
    const before = await owner(harness);
    const placement = Object.entries(before.placements).find(([, item]) => item.resourceId === id);
    assert.ok(placement);
    const [placementId, placementValue] = placement;
    assert.equal(placementId, placementIds.get(id));
    const unaffected = Object.entries(before.placements).find(([key]) => key !== placementId);
    assert.ok(unaffected);
    const removed = await api(harness, `/api/creador/enlaces/${placementId}`, {
      creatorVersion: before.creatorVersion,
    }, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    const retired = await owner(harness);
    assert.deepEqual(retired.placements, { [unaffected[0]]: unaffected[1] });
    const retained = retired.resources.find((resource) => resource.id === id);
    assert.equal(retained?.url, url);

    const newUrl = `https://example.invalid/retained-dot/${index}/?edited=%2F`;
    const updated = await api(harness, `/api/creador/recursos/?id=${encodeURIComponent(id)}`, {
      resourceVersion: retained.version, url: newUrl,
    }, { method: 'PATCH' });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.resourceId, id);
    assert.equal(updated.data.resourceVersion, retained.version + 1);
    assert.equal(await harness.store.get(currentUrlKey(url)), null);
    assert.equal((await harness.store.get(currentUrlKey(newUrl))).resourceId, id);

    const current = await owner(harness);
    const added = await api(harness, '/api/creador/enlaces', {
      creatorVersion: current.creatorVersion, resourceId: id, resourceVersion: updated.data.resourceVersion,
    });
    assert.equal(added.status, 201);
    assert.equal(added.data.placementId, placementId);
    assert.equal(added.data.resourceId, id);
    const persisted = await owner(harness);
    assert.equal(Object.keys(persisted.placements).length, 2);
    assert.equal(persisted.resources.find((resource) => resource.id === id).url, newUrl);
    assert.deepEqual(persisted.placements[unaffected[0]], unaffected[1]);
    assert.deepEqual(persisted.placements[placementId], placementValue);
    assert.equal(harness.mock.read('catalog-test', { id }).url, newUrl);
  }
});

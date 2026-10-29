import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, sessionCsrf } from './fixtures/creator-pages.mjs';
import { createDynamoMoveHarness, seedMoveProfile, seedMoveResource } from './fixtures/creator-link-move.mjs';

async function api(harness, pathname, body, { method = 'POST', session = 'creator-a' } = {}) {
  const response = await callApi(harness, pathname, {
    method, session, csrf: sessionCsrf[session], ...(body === undefined ? {} : { body }),
  });
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}

async function owner(harness, session = 'creator-a') {
  const result = await api(harness, '/api/creador/perfil', undefined, { method: 'GET', session });
  assert.equal(result.status, 200);
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
      resourceId, url, profileVersion: observed.profile.version,
    })).status, 201);
    assert.equal((await api(harness, '/api/creador/reclamaciones', {
      resources: [{ resourceId, url }], evidence: 'Autoría comprobada',
    })).status, 202);
    assert.equal((await api(harness, '/api/admin/reclamaciones/vincular', {
      accountId: 'private-account-a', resourceIds: [resourceId],
    }, { session: 'admin' })).status, 200);

    observed = await owner(harness);
    const original = observed.links.find((link) => link.resourceId === resourceId);
    assert.ok(original);
    assert.equal((await api(harness, `/api/creador/enlaces/${original.placementId}/editar`, {
      profileVersion: observed.profile.version,
      placementVersion: original.placementVersion,
      resourceVersion: original.resourceVersion,
      title: 'Título actualizado', description: 'Descripción conservada',
    }, { method: 'PATCH' })).status, 200);
    observed = await owner(harness);
    assert.equal((await api(harness, `/api/creador/enlaces/${original.placementId}`, {
      profileVersion: observed.profile.version,
    }, { method: 'DELETE' })).status, 204);

    observed = await owner(harness);
    assert.equal(observed.links.length, 0);
    const retained = observed.editableResources.find((resource) => resource.id === resourceId);
    assert.ok(retained);
    const transactionsBeforeRejected = harness.mock.transactions.length;
    assert.equal((await api(harness, '/api/creador/enlaces', {
      resourceId, resourceVersion: retained.version - 1,
    })).status, 409, 'a long identity still requires the observed resource version');
    assert.equal((await api(harness, '/api/creador/enlaces', {
      resourceId, resourceVersion: retained.version,
    }, { session: 'creator-b' })).status, 403, 'the ID does not grant another creator editing authority');
    assert.equal(harness.mock.transactions.length, transactionsBeforeRejected);
    assert.equal((await owner(harness)).links.length, 0);
    assert.equal((await owner(harness, 'creator-b')).links.length, 0);

    const restored = await api(harness, '/api/creador/enlaces', { resourceId, resourceVersion: retained.version });
    assert.equal(restored.status, 201);
    assert.equal(restored.data.link.resourceId, resourceId);
    assert.equal(restored.data.link.placementId, original.placementId);
    assert.equal(restored.data.link.resourceVersion, retained.version);
    assert.equal(restored.data.link.title, 'Título actualizado');
    assert.equal(restored.data.link.description, 'Descripción conservada');
    assert.equal(restored.data.link.url, url);

    const repeated = await api(harness, '/api/creador/enlaces', { resourceId, resourceVersion: retained.version });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.link.placementId, original.placementId);
    assert.equal((await owner(harness)).links.length, 1);
    assert.equal((await owner(harness, 'creator-b')).links.length, 0);
  });
}

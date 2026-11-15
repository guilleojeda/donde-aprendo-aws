import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, createCreatorPagesHarness, responseJson, seedResource, sessionCsrf } from './fixtures/creator-pages.mjs';

async function api(harness, path, session = 'creator-a', { method = 'GET', body } = {}) {
  return callApi(harness, path, { session, csrf: sessionCsrf[session], creatorContract: '2', method, ...(body === undefined ? {} : { body }) });
}

function changes(body) {
  return body.versionChanges.map(({ entity, id, before, after }) => ({ entity, id, before, after }));
}

test('administrative claim linking reports effective resource versions without replacing newer classification', async () => {
  const harness = await createCreatorPagesHarness();
  const created = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT',
    body: { creatorVersion: null, displayName: 'Ana de prueba', slug: 'ana-de-prueba' },
  });
  assert.equal(created.status, 200);
  const { profileId } = await responseJson(created);
  await seedResource(harness.store, {
    id: 'resource-claim-receipt',
    title: 'Recurso legado',
    url: 'https://example.com/claim-receipt',
    description: 'Texto original',
    category: 'Otros',
    kind: 'content',
    format: 'Artículo',
    topics: [],
    order: 1,
    featured: false,
    published: false,
    hidden: false,
    version: 1,
  });
  const claim = await api(harness, '/api/creador/reclamaciones', 'creator-a', {
    method: 'POST',
    body: { resources: [{ resourceId: 'resource-claim-receipt', url: 'https://example.com/claim-receipt' }] },
  });
  assert.equal(claim.status, 202);

  const externalClassification = await api(harness, '/api/admin/recursos/resource-claim-receipt', 'admin', {
    method: 'PATCH', body: { category: 'Certificaciones', version: 1 },
  });
  assert.equal(externalClassification.status, 200);
  const linked = await api(harness, '/api/admin/reclamaciones/vincular', 'admin', {
    method: 'POST', body: { accountId: 'private-account-a', resourceIds: ['resource-claim-receipt'] },
  });
  assert.equal(linked.status, 200);
  const body = await responseJson(linked);
  const currentEditor = await responseJson(await api(harness, '/api/creador/perfil'));
  assert.deepEqual(changes(body), [
    { entity: 'profile', id: profileId, before: 1, after: 2 },
    { entity: 'resource', id: 'resource-claim-receipt', before: 2, after: 3 },
  ]);
  assert.equal(currentEditor.creatorVersion, 2);
  assert.equal(currentEditor.order.ordinary.length, 1);
  assert.deepEqual(Object.values(currentEditor.placements).map(({ resourceId }) => resourceId), ['resource-claim-receipt']);
  const current = await harness.store.get('resource:resource-claim-receipt');
  assert.equal(current.category, 'Certificaciones', 'linking ownership preserves the external classification');
  assert.equal(current.editorProfileId, profileId);
});

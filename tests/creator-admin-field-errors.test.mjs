import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  seedResource,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';
import {
  createDynamoMoveHarness,
  seedMoveProfile,
} from './fixtures/creator-link-move.mjs';

const ADMIN_RESOURCES = '/api/admin/recursos/?id=';
const ADMIN_CLAIM_LINK = '/api/admin/reclamaciones/vincular/';

function resource(id, fields = {}) {
  return {
    id,
    title: 'Recurso de diagnóstico administrativo',
    url: `https://admin-field-errors.example/${id}`,
    description: 'Descripción de prueba.',
    category: 'Serverless',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    order: 1,
    featured: false,
    published: false,
    hidden: false,
    approvalRevoked: false,
    directoryControl: 'editorial',
    version: 1,
    ...fields,
  };
}

async function adminClassification(harness, id, body) {
  return callApi(harness, `${ADMIN_RESOURCES}${encodeURIComponent(id)}`, {
    session: 'admin',
    csrf: sessionCsrf.admin,
    method: 'PATCH',
    body,
  });
}

async function assertRejectedWithoutWrites(harness, id, response, expected) {
  const body = await responseJson(response);
  assert.equal(response.status, expected.status);
  assert.equal(body.error, expected.error);
  assert.deepEqual(await harness.store.get(`resource:${id}`), expected.before,
    'a definitive admin rejection leaves the resource unchanged');
  assert.equal(harness.store.calls.slice(expected.callOffset).some(({ operation, input }) =>
    operation === 'transact' && ((input.puts?.length ?? 0) > 0 || (input.deletes?.length ?? 0) > 0)), false,
  'a definitive admin rejection does not write a partial classification');
  return body;
}

const taxonomyCases = [
  {
    label: 'topics',
    body: { topics: ['not-a-topic'] },
    fieldErrors: [{ field: 'topics', reason: 'invalid_option' }],
  },
  {
    label: 'category',
    body: { category: '   ' },
    fieldErrors: [{ field: 'category', reason: 'required' }],
  },
];

for (const { label, body, fieldErrors } of taxonomyCases) {
  test(`admin classification attributes an invalid ${label} without changing the contract`, async () => {
    const harness = await createCreatorPagesHarness();
    const id = `admin-field-${label}`;
    await seedResource(harness.store, resource(id));
    const before = await harness.store.get(`resource:${id}`);
    const callOffset = harness.store.calls.length;
    const response = await adminClassification(harness, id, {
      category: before.category,
      kind: before.kind,
      format: before.format,
      topics: before.topics,
      ...body,
      version: before.version,
    });
    const payload = await assertRejectedWithoutWrites(harness, id, response, {
      status: 422,
      error: 'INVALID_CLASSIFICATION',
      before,
      callOffset,
    });
    assert.deepEqual(payload.fieldErrors, fieldErrors,
      'the diagnostic names only the editable control that the taxonomy validator can identify');
  });
}

test('an invalid type/format combination identifies the editable taxonomy group', async () => {
  const harness = await createCreatorPagesHarness();
  const id = 'admin-field-kind-format';
  await seedResource(harness.store, resource(id));
  const before = await harness.store.get(`resource:${id}`);
  const callOffset = harness.store.calls.length;
  const response = await adminClassification(harness, id, {
    category: before.category,
    kind: 'content',
    format: 'Canal de YouTube',
    topics: before.topics,
    version: before.version,
  });
  const payload = await assertRejectedWithoutWrites(harness, id, response, {
    status: 422,
    error: 'INVALID_CLASSIFICATION',
    before,
    callOffset,
  });
  assert.deepEqual(payload.fieldErrors, [{ field: 'kind-format', reason: 'invalid_combination' }]);
});

test('a stored unknown string kind identifies the editable taxonomy group', async () => {
  const harness = await createCreatorPagesHarness();
  const id = 'admin-field-unknown-kind';
  await seedResource(harness.store, resource(id, { kind: 'legacy-source', format: 'Blog' }));
  const before = await harness.store.get(`resource:${id}`);
  const callOffset = harness.store.calls.length;
  const response = await adminClassification(harness, id, {
    category: before.category,
    kind: before.kind,
    format: before.format,
    topics: before.topics,
    version: before.version,
  });
  const payload = await assertRejectedWithoutWrites(harness, id, response, {
    status: 422,
    error: 'INVALID_CLASSIFICATION',
    before,
    callOffset,
  });
  assert.deepEqual(payload.fieldErrors, [{ field: 'kind-format', reason: 'invalid_combination' }]);
});

test('missing or empty kind and format identify the editable taxonomy group', async () => {
  const harness = await createCreatorPagesHarness();
  const id = 'admin-field-kind-format-required';
  await seedResource(harness.store, resource(id));
  const before = await harness.store.get(`resource:${id}`);
  const callOffset = harness.store.calls.length;
  const response = await adminClassification(harness, id, {
    category: before.category, kind: '', format: '', topics: before.topics, version: before.version,
  });
  const payload = await assertRejectedWithoutWrites(harness, id, response, {
    status: 422,
    error: 'INVALID_CLASSIFICATION',
    before,
    callOffset,
  });
  assert.deepEqual(payload.fieldErrors, [{ field: 'kind-format', reason: 'required' }]);
});

test('malformed classification shapes and unknown keys remain general errors', async () => {
  const cases = [
    {
      label: 'topics with a nested value',
      body: { topics: ['Serverless', { topic: 'Seguridad' }] },
      status: 422,
      error: 'INVALID_TOPICS',
    },
    {
      label: 'kind with an object value',
      body: { kind: { value: 'content' } },
      status: 422,
      error: 'INVALID_FIELD',
    },
    {
      label: 'an unrelated nested key',
      body: { metadata: { kind: 'not-a-kind' } },
      status: 400,
      error: 'UNKNOWN_FIELD',
    },
  ];
  for (const item of cases) {
    const harness = await createCreatorPagesHarness();
    const id = `admin-shape-${cases.indexOf(item)}`;
    await seedResource(harness.store, resource(id));
    const before = await harness.store.get(`resource:${id}`);
    const callOffset = harness.store.calls.length;
    const response = await adminClassification(harness, id, {
      category: before.category,
      kind: before.kind,
      format: before.format,
      topics: before.topics,
      ...item.body,
      version: before.version,
    });
    const payload = await assertRejectedWithoutWrites(harness, id, response, {
      status: item.status,
      error: item.error,
      before,
      callOffset,
    });
    assert.equal(Object.hasOwn(payload, 'fieldErrors'), false,
      `${item.label} cannot be safely assigned to a visible taxonomy control`);
  }
});

test('a public projection failure unrelated to submitted taxonomy stays general', async () => {
  const harness = await createCreatorPagesHarness();
  const id = 'admin-unrelated-public-failure';
  await seedResource(harness.store, resource(id, { title: '' }));
  const before = await harness.store.get(`resource:${id}`);
  const callOffset = harness.store.calls.length;
  const response = await adminClassification(harness, id, {
    category: before.category,
    kind: before.kind,
    format: before.format,
    topics: before.topics,
    version: before.version,
  });
  const payload = await assertRejectedWithoutWrites(harness, id, response, {
    status: 422,
    error: 'INVALID_CLASSIFICATION',
    before,
    callOffset,
  });
  assert.equal(Object.hasOwn(payload, 'fieldErrors'), false,
    'a malformed title is not attributed to a taxonomy control');
});

test('a persisted public row with whitespace category uses the same required diagnostic', async () => {
  const harness = await createCreatorPagesHarness();
  const id = 'admin-persisted-empty-category';
  await seedResource(harness.store, resource(id, { category: '   ' }));
  const before = await harness.store.get(`resource:${id}`);
  const callOffset = harness.store.calls.length;
  const response = await adminClassification(harness, id, {
    category: before.category,
    kind: before.kind,
    format: before.format,
    topics: before.topics,
    version: before.version,
  });
  const payload = await assertRejectedWithoutWrites(harness, id, response, {
    status: 422,
    error: 'INVALID_CLASSIFICATION',
    before,
    callOffset,
  });
  assert.deepEqual(payload.fieldErrors, [{ field: 'category', reason: 'required' }]);
});

test('a stale classification keeps the conflict general and has no field receipt', async () => {
  const harness = await createCreatorPagesHarness();
  const id = 'admin-classification-race';
  await seedResource(harness.store, resource(id));
  const first = await adminClassification(harness, id, {
    category: 'Seguridad', kind: 'content', format: 'Artículo', topics: ['Seguridad'], version: 1,
  });
  assert.equal(first.status, 200);
  const stale = await adminClassification(harness, id, {
    category: 'Certificaciones', kind: 'content', format: 'Artículo', topics: ['Certificaciones'], version: 1,
  });
  const payload = await responseJson(stale);
  assert.equal(stale.status, 409);
  assert.equal(payload.error, 'RESOURCE_CONFLICT');
  assert.equal(Object.hasOwn(payload, 'fieldErrors'), false,
    'a version conflict is not a field validation error');
  assert.equal((await harness.store.get(`resource:${id}`)).category, 'Seguridad');
});

test('an unavailable exact claim selection is a pre-grant group error with no receipt', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock, { profileId: 'admin-selection-owner', accountId: 'private-account-a' });
  const callOffset = harness.mock.transactions.length;
  const response = await callApi(harness, ADMIN_CLAIM_LINK, {
    session: 'admin',
    csrf: sessionCsrf.admin,
    method: 'POST',
    body: { accountId: 'private-account-a', resourceIds: ['resource-no-longer-in-catalog'] },
  });
  const payload = await responseJson(response);
  assert.equal(response.status, 404);
  assert.equal(payload.error, 'RESOURCE_NOT_FOUND');
  assert.equal(payload.failureStage, 'before-grant-write');
  assert.deepEqual(payload.fieldErrors, [{ field: 'resourceIds', reason: 'invalid_selection' }]);
  assert.equal(Object.hasOwn(payload, 'linkedResourceIds'), false);
  assert.equal(Object.hasOwn(payload, 'versionChanges'), false);
  assert.equal(Object.hasOwn(payload, 'uncertainResourceId'), false);
  assert.equal(harness.mock.transactions.slice(callOffset).some(({ input }) =>
    input.TransactItems.some((item) => item.Put || item.Delete)), false,
  'a missing selected resource cannot create a grant or a partial receipt');
});

test('a malformed claim selection keeps the existing general validation response', async () => {
  const harness = await createDynamoMoveHarness();
  seedMoveProfile(harness.mock, { profileId: 'admin-selection-shape-owner', accountId: 'private-account-a' });
  const response = await callApi(harness, ADMIN_CLAIM_LINK, {
    session: 'admin',
    csrf: sessionCsrf.admin,
    method: 'POST',
    body: {
      accountId: 'private-account-a',
      resourceIds: ['valid-looking-id', 17],
      unexpected: 'do not infer a field from this shape',
    },
  });
  const payload = await responseJson(response);
  assert.equal(response.status, 400);
  assert.equal(payload.error, 'UNKNOWN_FIELD');
  assert.equal(Object.hasOwn(payload, 'fieldErrors'), false);
  assert.equal(payload.failureStage, 'before-grant-write');
});

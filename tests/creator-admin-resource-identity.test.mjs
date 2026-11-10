import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  apiRequest,
  callApi,
  createCreatorPagesHarness,
  readAdminRecord,
  responseJson,
  seedResource,
  sessionCsrf,
  SITE_ORIGIN,
} from './fixtures/creator-pages.mjs';

const adminResourcePath = '/api/admin/recursos/';
const validClassification = (version) => ({
  category: 'Certificaciones', kind: 'content', format: 'Artículo', topics: ['Serverless'], version,
});

function queryResourceUrl(id, action) {
  const url = new URL(action ? `/api/admin/recursos/${action}/` : adminResourcePath, SITE_ORIGIN);
  url.searchParams.set('id', id);
  return url.href;
}

function encodedIdQuery(id) {
  const params = new URLSearchParams();
  params.set('id', id);
  return `?${params.toString()}`;
}

function resourceRecord(id, index, { published = false, hidden = false } = {}) {
  return {
    id,
    title: `F4 recurso ${index}`,
    url: `https://f4-admin-id.example/${index}`,
    description: 'Contenido de prueba.',
    category: 'Serverless',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    order: index,
    featured: false,
    published,
    approvalRevoked: false,
    directoryApproval: published ? 'approved' : 'pending',
    directoryControl: 'editorial',
    hidden,
    version: 1,
  };
}

async function seedResources(harness, entries) {
  for (const [index, entry] of entries.entries()) {
    await seedResource(harness.store, resourceRecord(entry.id, index, entry.initial));
  }
}

async function adminRequest(harness, url, { method = 'GET', body, session = 'admin', csrf = sessionCsrf.admin,
  origin = SITE_ORIGIN } = {}) {
  const request = apiRequest(url, { session, csrf, origin, method, body });
  const response = await harness.service.handle(request);
  return { request, response };
}

function versionChange(id, before, after) {
  return [{ entity: 'resource', id, before, after }];
}

const supportedIds = [
  { id: '.', action: 'aprobar' },
  { id: '..', action: 'ocultar' },
  { id: '%2E', action: 'revocar', initial: { published: true } },
  { id: '%2E%2E', action: 'restaurar', initial: { hidden: true } },
  { id: 'raw%ZZ', action: 'ocultar' },
  { id: 'literal%2E-spelling', action: 'aprobar' },
  { id: 'ordinary-admin-resource', action: 'ocultar' },
  { id: 'id with space', action: 'aprobar' },
  { id: 'id+with+plus', action: 'revocar', initial: { published: true } },
  { id: 'aprobar', action: 'restaurar', initial: { hidden: true } },
  { id: 'ocultar', action: 'aprobar', initial: { hidden: true } },
  { id: 'id&name=value+plus / ?', action: 'revocar', initial: { published: true } },
  { id: 'recurso-é-雪-😀', action: 'restaurar', initial: { hidden: true } },
  { id: 'é'.repeat(128), action: 'ocultar' }, // Exactly 256 UTF-8 bytes.
];

test('query-ID admin classification and moderation preserve exact IDs through the service and store', async () => {
  const harness = await createCreatorPagesHarness();
  await seedResources(harness, supportedIds);

  const listing = await callApi(harness, '/api/admin/recursos/', { session: 'admin', csrf: sessionCsrf.admin });
  assert.equal(listing.status, 200, 'the existing resource GET listing remains available');
  const listed = await responseJson(listing);
  assert.deepEqual(new Set(listed.resources.map(({ id }) => id)), new Set(supportedIds.map(({ id }) => id)));

  for (const entry of supportedIds) {
    const { id, action } = entry;
    const beforeClassification = await harness.store.get(`resource:${id}`);
    const classificationBody = validClassification(beforeClassification.version);
    if (id === 'ordinary-admin-resource') {
      delete classificationBody.version;
      assert.equal(Object.hasOwn(classificationBody, 'version'), false,
        'the new query transport retains optional classification versions');
    }
    const classification = await adminRequest(harness, queryResourceUrl(id), {
      method: 'PATCH', body: classificationBody,
    });
    const classificationUrl = new URL(classification.request.url);
    assert.equal(classificationUrl.pathname, adminResourcePath);
    assert.deepEqual([...classificationUrl.searchParams.getAll('id')], [id],
      `classification query decoding preserves the raw ID ${JSON.stringify(id)} exactly once`);
    assert.equal(classificationUrl.search, encodedIdQuery(id));
    assert.deepEqual([...classificationUrl.searchParams.keys()], ['id']);
    assert.equal(classification.response.status, 200, `classification accepts ${JSON.stringify(id)}`);
    const classificationResult = await responseJson(classification.response);
    assert.equal(classificationResult.resource.id, id);
    assert.equal(classificationResult.resource.category, 'Certificaciones');
    assert.deepEqual(classificationResult.versionChanges, versionChange(id, 1, 2));

    const classified = await readAdminRecord(harness, 'resource', id);
    assert.equal(classified.id, id);
    assert.equal(classified.category, 'Certificaciones');
    assert.equal(classified.version, 2);
    assert.equal(classified.hidden, entry.initial?.hidden === true);
    assert.equal(classified.published, entry.initial?.published === true);

    const moderation = await adminRequest(harness, queryResourceUrl(id, action), {
      method: 'POST', body: { version: classified.version },
    });
    const moderationUrl = new URL(moderation.request.url);
    assert.equal(moderationUrl.pathname, `/api/admin/recursos/${action}/`);
    assert.deepEqual([...moderationUrl.searchParams.getAll('id')], [id],
      `moderation query decoding preserves the raw ID ${JSON.stringify(id)} exactly once`);
    assert.equal(moderationUrl.search, encodedIdQuery(id));
    assert.deepEqual([...moderationUrl.searchParams.keys()], ['id']);
    assert.equal(moderation.response.status, 200, `${action} accepts ${JSON.stringify(id)}`);
    const moderationBody = await responseJson(moderation.response);
    assert.equal(moderationBody.resource.id, id);
    assert.deepEqual(moderationBody.versionChanges, versionChange(id, 2, 3));

    const final = await readAdminRecord(harness, 'resource', id);
    assert.equal(final.id, id, 'an action cannot target the decoded or neighboring ID');
    assert.equal(final.category, 'Certificaciones');
    assert.equal(final.version, 3);
    assert.equal(final.published, action === 'aprobar' ? true : action === 'revocar' ? false : entry.initial?.published === true);
    assert.equal(final.approvalRevoked, action === 'revocar');
    assert.equal(final.hidden, action === 'ocultar' ? true : action === 'restaurar' ? false : entry.initial?.hidden === true);
  }

  const dot = await readAdminRecord(harness, 'resource', '.');
  const decodedDotDecoy = await readAdminRecord(harness, 'resource', '%2E');
  const dotDot = await readAdminRecord(harness, 'resource', '..');
  const decodedDotDotDecoy = await readAdminRecord(harness, 'resource', '%2E%2E');
  assert.equal(dot.id, '.');
  assert.equal(dot.published, true);
  assert.equal(decodedDotDecoy.id, '%2E');
  assert.equal(decodedDotDecoy.approvalRevoked, true);
  assert.equal(dotDot.id, '..');
  assert.equal(dotDot.hidden, true);
  assert.equal(decodedDotDotDecoy.id, '%2E%2E');
  assert.equal(decodedDotDotDecoy.hidden, false);
});

test('malformed query-ID command shapes use their established client errors without writes', async () => {
  const harness = await createCreatorPagesHarness();
  await seedResources(harness, [
    { id: 'query-target' },
    { id: 'ocultar' },
  ]);
  const targetBefore = await harness.store.get('resource:query-target');
  const pathDecoyBefore = await harness.store.get('resource:ocultar');
  const query = (...pairs) => {
    const url = new URL(adminResourcePath, SITE_ORIGIN);
    for (const [key, value] of pairs) url.searchParams.append(key, value);
    return url.href;
  };
  const rejected = [];

  rejected.push(await adminRequest(harness, query(['id', 'query-target'], ['id', 'ocultar']), {
    method: 'PATCH', body: validClassification(1),
  }));
  rejected.push(await adminRequest(harness, query(['id', 'query-target'], ['extra', '1']), {
    method: 'PATCH', body: validClassification(1),
  }));
  rejected.push(await adminRequest(harness, query(['id', '']), {
    method: 'PATCH', body: validClassification(1),
  }));
  rejected.push(await adminRequest(harness, `${SITE_ORIGIN}${adminResourcePath}`, {
    method: 'PATCH', body: validClassification(1),
  }));
  rejected.push(await adminRequest(harness, query(['id', 'query-target']), { method: 'GET' }));
  rejected.push(await adminRequest(harness, `${SITE_ORIGIN}/api/admin/recursos/ocultar/?id=query-target&id=ocultar`, {
    method: 'POST', body: { version: 1 },
  }));
  rejected.push(await adminRequest(harness, `${SITE_ORIGIN}/api/admin/recursos/ocultar/?id=query-target&extra=1`, {
    method: 'POST', body: { version: 1 },
  }));
  rejected.push(await adminRequest(harness, `${SITE_ORIGIN}/api/admin/recursos/ocultar/?id=`, {
    method: 'POST', body: { version: 1 },
  }));
  rejected.push(await adminRequest(harness, `${SITE_ORIGIN}/api/admin/recursos/ocultar/`, {
    method: 'POST', body: { version: 1 },
  }));
  rejected.push(await adminRequest(harness, `${SITE_ORIGIN}/api/admin/recursos/ocultar/?id=query-target`, {
    method: 'POST', body: {},
  }));
  rejected.push(await adminRequest(harness, `${SITE_ORIGIN}/api/admin/recursos/ocultar/?id=query-target`, {
    method: 'POST', body: { version: '1' },
  }));
  rejected.push(await adminRequest(harness, `${SITE_ORIGIN}/api/admin/recursos/no-such-action/?id=query-target`, {
    method: 'POST', body: { version: 1 },
  }));

  assert.deepEqual({
    statuses: rejected.map(({ response }) => response.status),
    queryTarget: await harness.store.get('resource:query-target'),
    pathDecoy: await harness.store.get('resource:ocultar'),
  }, {
    statuses: [400, 400, 422, 405, 405, 400, 400, 422, 405, 422, 422, 404],
    queryTarget: targetBefore,
    pathDecoy: pathDecoyBefore,
  }, 'duplicates and extra keys use the query-ID convention; empty, missing, unsupported and unknown commands are rejected without writes');
});

test('a wrong-method query moderation command cannot classify an action-named path decoy', async () => {
  const harness = await createCreatorPagesHarness();
  await seedResources(harness, [
    { id: 'query-target' },
    { id: 'ocultar' },
  ]);
  const targetBefore = await harness.store.get('resource:query-target');
  const pathDecoyBefore = await harness.store.get('resource:ocultar');
  const wrongMethodPath = `${SITE_ORIGIN}/api/admin/recursos/ocultar/?id=query-target`;
  const wrongMethod = await adminRequest(harness, wrongMethodPath, {
    method: 'PATCH', body: { ...validClassification(1), category: 'Seguridad' },
  });
  const afterWrongMethod = await harness.store.get('resource:ocultar');
  assert.deepEqual({ status: wrongMethod.response.status, decoy: afterWrongMethod }, {
    status: 405,
    decoy: pathDecoyBefore,
  }, 'a malformed query moderation request cannot fall through and classify its action-named path decoy');
  assert.deepEqual(await harness.store.get('resource:query-target'), targetBefore);
});

test('query-ID commands retain admin, Origin/CSRF, size, version, and legacy path checks', async () => {
  const harness = await createCreatorPagesHarness();
  await seedResources(harness, [
    { id: 'query-guarded' },
    { id: 'query-guarded-post' },
  ]);
  const before = await harness.store.get('resource:query-guarded');
  const postBefore = await harness.store.get('resource:query-guarded-post');
  const guards = [];
  for (const command of [
    { method: 'PATCH', id: 'query-guarded', path: queryResourceUrl('query-guarded'), body: validClassification(1) },
    { method: 'POST', id: 'query-guarded-post', path: queryResourceUrl('query-guarded-post', 'ocultar'), body: { version: 1 } },
  ]) {
    const cases = [
      ['anonymous', 401, { session: null, csrf: undefined }],
      ['non-admin', 403, { session: 'creator-a', csrf: sessionCsrf['creator-a'] }],
      ['wrong Origin', 403, { origin: 'https://attacker.example' }],
      ['wrong CSRF', 403, { csrf: 'wrong-token' }],
      ['oversized body', 413, { body: { ...command.body, extra: 'x'.repeat(33 * 1024) } }],
      ['stale version', 409, { body: command.method === 'PATCH' ? validClassification(0) : { version: 0 } }],
    ];
    for (const [name, status, overrides] of cases) {
      const result = await adminRequest(harness, command.path, {
        method: command.method,
        body: overrides.body ?? command.body,
        ...overrides,
      });
      const responseBody = status === 413 || status === 409 ? await responseJson(result.response) : undefined;
      guards.push({ method: command.method, name, status: result.response.status, bodyError: responseBody?.error });
    }
    assert.deepEqual(await harness.store.get(`resource:${command.id}`), command.method === 'PATCH' ? before : postBefore,
      `${command.method} query command guards cannot mutate its record`);
  }
  assert.deepEqual(guards, [
    { method: 'PATCH', name: 'anonymous', status: 401, bodyError: undefined },
    { method: 'PATCH', name: 'non-admin', status: 403, bodyError: undefined },
    { method: 'PATCH', name: 'wrong Origin', status: 403, bodyError: undefined },
    { method: 'PATCH', name: 'wrong CSRF', status: 403, bodyError: undefined },
    { method: 'PATCH', name: 'oversized body', status: 413, bodyError: 'BODY_TOO_LARGE' },
    { method: 'PATCH', name: 'stale version', status: 409, bodyError: 'RESOURCE_CONFLICT' },
    { method: 'POST', name: 'anonymous', status: 401, bodyError: undefined },
    { method: 'POST', name: 'non-admin', status: 403, bodyError: undefined },
    { method: 'POST', name: 'wrong Origin', status: 403, bodyError: undefined },
    { method: 'POST', name: 'wrong CSRF', status: 403, bodyError: undefined },
    { method: 'POST', name: 'oversized body', status: 413, bodyError: 'BODY_TOO_LARGE' },
    { method: 'POST', name: 'stale version', status: 409, bodyError: 'RESOURCE_CONFLICT' },
  ]);

  const tooLong = await adminRequest(harness, queryResourceUrl('x'.repeat(257)), {
    method: 'PATCH', body: validClassification(1),
  });
  assert.equal(tooLong.response.status, 422, 'IDs above the existing 256-byte domain limit remain invalid');
  assert.equal((await responseJson(tooLong.response)).error, 'INVALID_RESOURCE_ID');
  assert.equal(await harness.store.get(`resource:${'x'.repeat(257)}`), undefined);

  assert.deepEqual(await harness.store.get('resource:query-guarded'), before);
});

test('legacy admin routes still classify and moderate IDs named like actions', async () => {
  const harness = await createCreatorPagesHarness();
  await seedResources(harness, [
    { id: 'aprobar', initial: { hidden: true } },
    { id: 'ocultar' },
  ]);

  const pathClassification = await adminRequest(harness, `${SITE_ORIGIN}/api/admin/recursos/aprobar`, {
    method: 'PATCH', body: validClassification(1),
  });
  assert.equal(pathClassification.response.status, 200, 'the legacy path-ID classification route stays supported');
  const pathClassificationBody = await responseJson(pathClassification.response);
  assert.equal(pathClassificationBody.resource.id, 'aprobar');
  assert.deepEqual(pathClassificationBody.versionChanges, versionChange('aprobar', 1, 2));
  const pathRestore = await adminRequest(harness, `${SITE_ORIGIN}/api/admin/recursos/aprobar/restaurar/`, {
    method: 'POST', body: { version: 2 },
  });
  assert.equal(pathRestore.response.status, 200, 'a path ID named like an action still resolves before its moderation action');
  const pathRestoreBody = await responseJson(pathRestore.response);
  assert.equal(pathRestoreBody.resource.id, 'aprobar');
  assert.deepEqual(pathRestoreBody.versionChanges, versionChange('aprobar', 2, 3));
  assert.equal((await harness.store.get('resource:aprobar')).hidden, false);
  assert.equal((await harness.store.get('resource:aprobar')).version, 3);

  const actionNamedClassification = await adminRequest(harness, `${SITE_ORIGIN}/api/admin/recursos/ocultar/`, {
    method: 'PATCH', body: validClassification(1),
  });
  assert.equal(actionNamedClassification.response.status, 200);
  const actionNamedClassificationBody = await responseJson(actionNamedClassification.response);
  assert.equal(actionNamedClassificationBody.resource.id, 'ocultar');
  assert.deepEqual(actionNamedClassificationBody.versionChanges, versionChange('ocultar', 1, 2));
  const actionNamedApproval = await adminRequest(harness, `${SITE_ORIGIN}/api/admin/recursos/ocultar/aprobar/`, {
    method: 'POST', body: { version: 2 },
  });
  assert.equal(actionNamedApproval.response.status, 200);
  const actionNamedApprovalBody = await responseJson(actionNamedApproval.response);
  assert.equal(actionNamedApprovalBody.resource.id, 'ocultar');
  assert.deepEqual(actionNamedApprovalBody.versionChanges, versionChange('ocultar', 2, 3));
  assert.equal((await harness.store.get('resource:ocultar')).published, true);
  assert.equal((await harness.store.get('resource:ocultar')).version, 3);

  const listing = await callApi(harness, '/api/admin/recursos/', { session: 'admin', csrf: sessionCsrf.admin });
  assert.equal(listing.status, 200, 'the existing GET listing remains compatible with path-ID writes');
  assert.deepEqual(new Set((await responseJson(listing)).resources.map(({ id }) => id)), new Set(['aprobar', 'ocultar']));
});

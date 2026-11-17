import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';
import {
  createDynamoMoveStore,
  seedMoveProfile,
  seedMoveResource,
} from './fixtures/creator-link-move.mjs';

const TABLES = {
  accounts: 'accounts-test',
  profiles: 'profiles-test',
  catalog: 'catalog-test',
};

const ADMIN_CLAIMS_PATH = '/api/admin/reclamaciones/';
const ADMIN_LINK_PATH = '/api/admin/reclamaciones/vincular/';

function ownerView(harness) {
  return callApi(harness, '/api/creador/perfil', {
    session: 'creator-a',
    csrf: sessionCsrf['creator-a'],
    creatorContract: '2',
  });
}

function adminView(harness) {
  return callApi(harness, ADMIN_CLAIMS_PATH, {
    session: 'admin',
    csrf: sessionCsrf.admin,
    creatorContract: '2',
  });
}

function adminGrant(harness, body) {
  return callApi(harness, ADMIN_LINK_PATH, {
    session: 'admin',
    csrf: sessionCsrf.admin,
    creatorContract: '2',
    method: 'POST',
    body,
  });
}

function claimRow(options = {}) {
  const {
    id,
    accountId = 'private-account-a',
    profileId,
    resourceIds,
    resources,
  } = options;
  const status = Object.hasOwn(options, 'status') ? options.status : 'pending';
  const version = Object.hasOwn(options, 'version') ? options.version : undefined;
  const createdAt = Object.hasOwn(options, 'createdAt') ? options.createdAt : 1;
  const sourceId = Object.hasOwn(options, 'sourceId') ? options.sourceId : 'audit-source';
  const evidence = Object.hasOwn(options, 'evidence') ? options.evidence : 'Audit claim evidence';
  const physicalId = Object.hasOwn(options, 'physicalId') ? options.physicalId : id;
  const payloadId = Object.hasOwn(options, 'payloadId') ? options.payloadId : id;
  return {
    pk: 'ADMIN#CLAIMS',
    sk: `CLAIM#${physicalId}`,
    recordType: 'claim',
    id: payloadId,
    ...(profileId === undefined ? {} : { profileId }),
    accountId,
    resourceIds: [...resourceIds],
    ...(resources === undefined ? {} : { resources: structuredClone(resources) }),
    ...(sourceId === undefined ? {} : { sourceId }),
    ...(evidence === undefined ? {} : { evidence }),
    status,
    createdAt,
    ...(version === undefined ? {} : { version }),
  };
}

function claimReference({ profileId, id, physicalId = id, payloadId = id, version = 1 } = {}) {
  return {
    pk: `PROFILE#${profileId}`,
    sk: `CLAIM#${physicalId}`,
    id: payloadId,
    version,
  };
}

function seedClaim(mock, options) {
  const row = claimRow(options);
  mock.seed(TABLES.profiles, row);
  if (options?.profileId !== undefined && options?.reference !== false) {
    mock.seed(TABLES.profiles, claimReference({
      profileId: options.profileId,
      id: options.id,
      physicalId: options.referencePhysicalId,
      payloadId: options.referencePayloadId,
    }));
  }
  return row;
}

function physicalClaimKey(input) {
  return `${input.pk}\u0000${input.sk}`;
}

function claimProviderReads(calls) {
  return calls.filter(({ name, input }) => {
    if (name === 'GetCommand') return input.TableName === TABLES.profiles
      && typeof input.Key?.sk === 'string' && input.Key.sk.startsWith('CLAIM#');
    if (name !== 'BatchGetCommand') return false;
    return Object.hasOwn(input.RequestItems ?? {}, TABLES.profiles)
      && input.RequestItems[TABLES.profiles].Keys.some(({ sk }) => typeof sk === 'string' && sk.startsWith('CLAIM#'));
  });
}

function isProfileClaimBatch(command) {
  if (command.constructor.name !== 'BatchGetCommand') return false;
  const request = command.input.RequestItems?.[TABLES.profiles];
  return Array.isArray(request?.Keys)
    && request.Keys.some(({ sk }) => typeof sk === 'string' && sk.startsWith('CLAIM#'));
}

function wrapProfileClaimBatch(mock, transform) {
  const send = mock.client.send.bind(mock.client);
  mock.client.send = async (command) => {
    const result = await send(command);
    if (!isProfileClaimBatch(command)) return result;
    return transform({ command, result });
  };
}

function catalogReads(calls) {
  return calls.filter(({ name, input }) => {
    if (name === 'GetCommand') return input.TableName === TABLES.catalog;
    if (name === 'BatchGetCommand') return Object.hasOwn(input.RequestItems ?? {}, TABLES.catalog);
    return false;
  });
}

test('owner claim history batches exact claim keys, preserves order, and stays within bounded provider work', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true, queryPageSize: 50 });
  const profileId = 'phase4-claim-owner';
  seedMoveProfile(mock, { profileId, accountId: 'private-account-a', published: false });
  const claimCount = 120;
  const expected = [];
  const expectedDtos = [];
  for (let index = 0; index < claimCount; index += 1) {
    const id = `claim-${String(index).padStart(3, '0')}`;
    const url = `https://claims.example/${id}`;
    expected.push(id);
    const legacy = index === 0;
    seedClaim(mock, legacy ? {
      id, profileId, resourceIds: [`resource-${id}`], createdAt: index + 1,
      resources: undefined, version: undefined, sourceId: undefined, evidence: undefined,
    } : {
      id, profileId, resourceIds: [`resource-${id}`],
      resources: [{ resourceId: `resource-${id}`, url }], createdAt: index + 1, version: 1,
      sourceId: `source-${id}`, evidence: `evidence-${id}`,
    });
    expectedDtos.push(legacy ? {
      id, resourceIds: [`resource-${id}`], status: 'pending', createdAt: index + 1,
    } : {
      id, resourceIds: [`resource-${id}`], version: 1,
      resources: [{ resourceId: `resource-${id}`, url }], sourceId: `source-${id}`,
      status: 'pending', createdAt: index + 1, evidence: `evidence-${id}`,
    });
  }
  const foreignId = 'claim-foreign-profile';
  seedClaim(mock, {
    id: foreignId, profileId: 'phase4-other-profile', reference: false,
    resourceIds: ['resource-foreign'],
    resources: [{ resourceId: 'resource-foreign', url: 'https://claims.example/foreign' }],
    version: 2,
  });
  mock.seed(TABLES.profiles, claimReference({ profileId, id: foreignId }));
  const unassociatedId = 'claim-without-profile-association';
  seedClaim(mock, {
    id: unassociatedId, profileId: undefined, reference: false,
    resourceIds: ['resource-without-profile'],
    resources: [{ resourceId: 'resource-without-profile', url: 'https://claims.example/without-profile' }],
    version: 2,
  });
  mock.seed(TABLES.profiles, claimReference({ profileId, id: unassociatedId }));
  seedClaim(mock, {
    id: 'claim-without-owner-reference', profileId, reference: false,
    resourceIds: ['resource-without-ref'],
    resources: [{ resourceId: 'resource-without-ref', url: 'https://claims.example/without-ref' }],
    version: 3,
  });

  let batchAttempts = 0;
  let injectedUnprocessed = false;
  let retryPhysical;
  wrapProfileClaimBatch(mock, ({ command, result }) => {
    batchAttempts += 1;
    const request = command.input.RequestItems[TABLES.profiles];
    assert.ok(request.Keys.length <= 100, 'each provider batch stays within DynamoDB key limits');
    assert.equal(request.ConsistentRead, true, 'owner history uses a strongly consistent claim batch');
    assert.equal(typeof request.ProjectionExpression, 'string', 'owner history requests the claim projection');
    const items = result.Responses?.[TABLES.profiles] ?? [];
    if (!injectedUnprocessed) {
      injectedUnprocessed = true;
      const retryKey = request.Keys.at(-1);
      retryPhysical = physicalClaimKey(retryKey);
      return {
        ...result,
        Responses: {
          ...result.Responses,
          [TABLES.profiles]: items.filter((item) => physicalClaimKey(item) !== retryPhysical),
        },
        UnprocessedKeys: { [TABLES.profiles]: { Keys: [retryKey] } },
      };
    }
    if (batchAttempts === 2) {
      assert.deepEqual(request.Keys.map(physicalClaimKey), [retryPhysical],
        'the retry request contains exactly the provider-indicated unprocessed key');
    }
    return {
      ...result,
      Responses: { ...result.Responses, [TABLES.profiles]: [...items].reverse() },
    };
  });

  const harness = await createCreatorPagesHarness({ store });
  const before = mock.calls.length;
  const response = await ownerView(harness);
  assert.equal(response.status, 200, await response.clone().text());
  const body = await responseJson(response);
  assert.deepEqual(body.claims.map(({ id }) => id), expected,
    'batch retrieval keeps the reference query order rather than sorting by the returned map');
  assert.deepEqual(body.claims, expectedDtos,
    'the owner DTO preserves complete submitted history, including optional legacy fields');
  assert.equal(body.claims.some(({ id }) => id === foreignId), false,
    'an exact owner reference to a foreign-profile claim does not expose that claim');
  assert.equal(body.claims.some(({ id }) => id === unassociatedId), false,
    'an exact owner reference to a claim with no stored profile association does not expose it');
  assert.equal(body.claims.some(({ id }) => id === 'claim-without-owner-reference'), false,
    'a claim row without the owner association is not discovered from the administrative population');

  const calls = mock.calls.slice(before);
  const claimReads = claimProviderReads(calls);
  const profileBatchGets = calls.filter(({ name, input }) => name === 'BatchGetCommand'
    && Object.hasOwn(input.RequestItems ?? {}, TABLES.profiles));
  const profilePointGets = calls.filter(({ name, input }) => name === 'GetCommand'
    && input.TableName === TABLES.profiles
    && typeof input.Key?.sk === 'string' && input.Key.sk.startsWith('CLAIM#'));
  assert.ok(claimReads.some(({ name }) => name === 'BatchGetCommand'),
    `owner history reads claim rows through the provider batch boundary (saw profile BatchGet=${profileBatchGets.length}, claim point Get=${profilePointGets.length}, claim reads=${claimReads.length})`);
  const referenceCount = claimCount + 2;
  assert.equal(injectedUnprocessed, true, 'the provider returned one valid unprocessed claim key');
  assert.equal(batchAttempts, Math.ceil(referenceCount / 100) + 1,
    'one unprocessed key causes exactly one bounded retry in addition to the physical batches');
  assert.ok(claimReads.length <= Math.ceil(referenceCount / 100) + 1,
    `owner history uses at most one provider request per ${100}-key batch plus one retry (saw ${claimReads.length})`);
  const requestedKeys = claimReads
    .filter(({ name }) => name === 'BatchGetCommand')
    .flatMap(({ input }) => input.RequestItems[TABLES.profiles].Keys.map(physicalClaimKey));
  assert.deepEqual(new Set(requestedKeys), new Set([...expected, foreignId, unassociatedId].map((id) =>
    physicalClaimKey({ pk: 'ADMIN#CLAIMS', sk: `CLAIM#${id}` }))),
    'owner history batches the exact administrative claim physical keys from its references');
  assert.equal(catalogReads(calls).length, 0,
    'claim history does not read private catalog resources to decorate submitted observations');
});

test('owner claim history rejects a projected reference whose payload identity differs from its physical key', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true });
  const profileId = 'phase4-claim-owner';
  seedMoveProfile(mock, { profileId, accountId: 'private-account-a', published: false });
  seedClaim(mock, {
    id: 'claim-physical-key',
    profileId,
    resourceIds: ['claim-physical-resource'],
    resources: [{ resourceId: 'claim-physical-resource', url: 'https://claims.example/physical' }],
    referencePhysicalId: 'claim-physical-key',
    referencePayloadId: 'claim-payload-id',
    physicalId: 'claim-payload-id',
    payloadId: 'claim-payload-id',
    version: 1,
  });
  const harness = await createCreatorPagesHarness({ store });

  const response = await ownerView(harness);
  assert.equal(response.status, 503, await response.clone().text());
  const body = await responseJson(response);
  assert.notEqual(body.error, 'MISSING_CLAIM');
  assert.equal(Object.hasOwn(body, 'claims'), false,
    'a malformed projected reference cannot be offered as owner history');
  assert.equal(JSON.stringify(body).includes('claim-payload-id'), false,
    'the malformed projected identity is not disclosed in the failure');
});

test('admin claim listing rejects a projected claim whose payload ID differs from its physical sort key', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true });
  seedMoveProfile(mock, { profileId: 'phase4-admin-claim-owner', accountId: 'private-account-a', published: false });
  mock.seed(TABLES.profiles, claimRow({
    id: 'claim-physical-key',
    profileId: 'phase4-admin-claim-owner',
    resourceIds: ['claim-physical-resource'],
    physicalId: 'claim-physical-key',
    payloadId: 'claim-payload-id',
    version: 1,
  }));
  const harness = await createCreatorPagesHarness({ store });

  const response = await adminView(harness);
  assert.equal(response.status, 503, await response.clone().text());
  const body = await responseJson(response);
  assert.equal(Object.hasOwn(body, 'claims'), false,
    'a malformed projected claim cannot be offered in the administrative list');
  assert.equal(JSON.stringify(body).includes('claim-payload-id'), false,
    'the malformed projected identity is not disclosed in the failure');
});

test('owner history distinguishes a confirmed absent claim from a missing response association', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true });
  const profileId = 'phase4-claim-owner';
  const claimId = 'claim-confirmed-absent';
  seedMoveProfile(mock, { profileId, accountId: 'private-account-a', published: false });
  mock.seed(TABLES.profiles, claimReference({ profileId, id: claimId }));
  let batchAttempts = 0;
  wrapProfileClaimBatch(mock, ({ command, result }) => {
    batchAttempts += 1;
    const request = command.input.RequestItems[TABLES.profiles];
    assert.equal(request.ConsistentRead, true);
    return result;
  });
  const harness = await createCreatorPagesHarness({ store });

  const response = await ownerView(harness);
  assert.equal(response.status, 503, await response.clone().text());
  const body = await responseJson(response);
  assert.equal(body.error, 'MISSING_CLAIM',
    'a complete empty batch is reported as a confirmed missing claim association');
  assert.equal(Object.hasOwn(body, 'claims'), false,
    'a confirmed absent claim association is an unavailable owner history, not an empty successful history');
  assert.equal(batchAttempts, 1,
    'the confirmed absence is established by one complete provider batch response');
});

test('owner history does not treat an exhausted unprocessed claim batch as confirmed absence', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true });
  const profileId = 'phase4-claim-owner';
  const claimId = 'claim-unprocessed-forever';
  seedMoveProfile(mock, { profileId, accountId: 'private-account-a', published: false });
  mock.seed(TABLES.profiles, claimReference({ profileId, id: claimId }));
  let batchAttempts = 0;
  wrapProfileClaimBatch(mock, ({ command }) => {
    batchAttempts += 1;
    const request = command.input.RequestItems[TABLES.profiles];
    assert.equal(request.ConsistentRead, true);
    assert.equal(typeof request.ProjectionExpression, 'string');
    return {
      Responses: { [TABLES.profiles]: [] },
      UnprocessedKeys: { [TABLES.profiles]: { Keys: request.Keys } },
    };
  });
  const harness = await createCreatorPagesHarness({ store });

  const response = await ownerView(harness);
  assert.equal(response.status, 503, await response.clone().text());
  const body = await responseJson(response);
  assert.equal(body.error, 'SERVICE_UNAVAILABLE',
    'an exhausted unprocessed batch is sanitized as storage unavailability, not confirmed absence');
  assert.equal(Object.hasOwn(body, 'claims'), false,
    'an incomplete provider response cannot be reported as a confirmed absent history');
  assert.equal(batchAttempts, 4,
    'the owner read stops after the existing initial attempt plus three bounded retries');
});

test('owner history rejects a claim batch item whose physical identity is invalid', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true });
  const profileId = 'phase4-claim-owner';
  const claimId = 'claim-invalid-batch-identity';
  seedMoveProfile(mock, { profileId, accountId: 'private-account-a', published: false });
  seedClaim(mock, {
    id: claimId,
    profileId,
    resourceIds: ['resource-invalid-batch-identity'],
    resources: [{ resourceId: 'resource-invalid-batch-identity', url: 'https://claims.example/invalid-batch' }],
    version: 1,
  });
  wrapProfileClaimBatch(mock, ({ command, result }) => {
    const request = command.input.RequestItems[TABLES.profiles];
    assert.equal(request.ConsistentRead, true);
    assert.equal(typeof request.ProjectionExpression, 'string');
    const item = result.Responses[TABLES.profiles][0];
    return { ...result, Responses: { [TABLES.profiles]: [{ ...item, sk: 'CLAIM#different-physical-id' }] } };
  });
  const harness = await createCreatorPagesHarness({ store });

  const response = await ownerView(harness);
  assert.equal(response.status, 503, await response.clone().text());
  const body = await responseJson(response);
  assert.equal(Object.hasOwn(body, 'claims'), false,
    'an invalid physical claim row cannot be projected into owner history');
});

test('owner history rejects duplicate claim items from one provider batch', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true });
  const profileId = 'phase4-claim-owner';
  const claimId = 'claim-duplicate-batch-item';
  seedMoveProfile(mock, { profileId, accountId: 'private-account-a', published: false });
  seedClaim(mock, {
    id: claimId,
    profileId,
    resourceIds: ['resource-duplicate-batch'],
    resources: [{ resourceId: 'resource-duplicate-batch', url: 'https://claims.example/duplicate-batch' }],
    version: 1,
  });
  wrapProfileClaimBatch(mock, ({ command, result }) => {
    const request = command.input.RequestItems[TABLES.profiles];
    assert.equal(request.ConsistentRead, true);
    assert.equal(typeof request.ProjectionExpression, 'string');
    const item = result.Responses[TABLES.profiles][0];
    return { ...result, Responses: { [TABLES.profiles]: [item, structuredClone(item)] } };
  });
  const harness = await createCreatorPagesHarness({ store });

  const response = await ownerView(harness);
  assert.equal(response.status, 503, await response.clone().text());
  const body = await responseJson(response);
  assert.equal(Object.hasOwn(body, 'claims'), false,
    'a duplicate provider row cannot be silently deduplicated into owner history');
});

test('grant reconciliation filters the provider, batches distinct targets, preserves legacy claim data, and handles empty pages', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true, queryPageSize: 2 });
  const profileId = 'phase4-grant-overlap-owner';
  const targetIds = ['grant-overlap-a', 'grant-overlap-b', 'grant-overlap-c', 'grant-overlap-d'];
  const ungrantedId = 'grant-ungranted-e';
  const unrelatedId = 'grant-unrelated-f';
  seedMoveProfile(mock, { profileId, accountId: 'private-account-a', published: false });
  for (const id of [...targetIds, ungrantedId, unrelatedId]) {
    seedMoveResource(mock, { id, url: `https://claims.example/${id}`, title: `Grant target ${id}` });
  }

  const originalClaims = new Map();
  const seedMatching = ({ id, resourceIds, status, previousProfileId, version = 4 }) => {
    const row = seedClaim(mock, {
      id, profileId: previousProfileId, resourceIds,
      resources: resourceIds.map((resourceId) => ({ resourceId, url: `https://claims.example/${resourceId}` })),
      status, createdAt: 10 + originalClaims.size, version,
      sourceId: `legacy-source-${id}`, evidence: `legacy evidence ${id}`,
    });
    const withHistory = { ...row, legacyMarker: `retain-${id}` };
    mock.seed(TABLES.profiles, withHistory);
    originalClaims.set(id, withHistory);
  };

  const foreign = seedClaim(mock, {
    id: '000-foreign-pending', accountId: 'private-account-b', profileId: undefined,
    reference: false, resourceIds: [targetIds[0]], version: 4,
  });
  const alreadyResolved = seedClaim(mock, {
    id: '001-same-account-resolved', profileId: undefined, reference: false,
    resourceIds: [targetIds[0]], status: 'resolved', version: 7,
  });
  const unrelatedSameAccount = seedClaim(mock, {
    id: '002-same-account-unrelated', profileId: undefined, reference: false,
    resourceIds: [unrelatedId], version: 4,
  });
  seedMatching({ id: '003-pending-shared', resourceIds: [targetIds[0], targetIds[1]], status: 'pending' });
  seedMatching({ id: '004-partial-shared', resourceIds: [targetIds[1], targetIds[2]], status: 'partial' });
  seedMatching({ id: '005-pending-unique', resourceIds: [targetIds[3]], status: 'pending' });
  seedMatching({ id: '006-pending-partial', resourceIds: [targetIds[0], ungrantedId], status: 'pending' });
  const historicalClaimId = '007-different-historical-owner-shadow';
  seedMatching({
    id: historicalClaimId,
    previousProfileId: 'phase4-historical-profile',
    resourceIds: [targetIds[0], targetIds[1]], status: 'pending',
  });
  const oldRefKey = { pk: 'PROFILE#phase4-historical-profile', sk: `CLAIM#${historicalClaimId}` };
  const oldRef = structuredClone(mock.read(TABLES.profiles, oldRefKey));
  assert.equal(oldRef?.id, historicalClaimId);
  for (let index = 0; index < 27; index += 1) {
    seedMatching({
      id: `overlapping-claim-${String(index).padStart(2, '0')}`,
      resourceIds: [targetIds[1], targetIds[2]],
      status: index % 2 === 0 ? 'pending' : 'partial',
    });
  }

  const originalForeign = structuredClone(foreign);
  const originalResolved = structuredClone(alreadyResolved);
  const originalUnrelated = structuredClone(unrelatedSameAccount);
  const queryResponses = [];
  const queryInputs = [];
  const rawSend = mock.client.send.bind(mock.client);
  mock.client.send = async (command) => {
    if (command.constructor.name !== 'QueryCommand'
      || command.input.TableName !== TABLES.profiles
      || command.input.ExpressionAttributeValues?.[':pk'] !== 'ADMIN#CLAIMS') return rawSend(command);
    queryInputs.push(structuredClone(command.input));
    const response = await rawSend(command);
    queryResponses.push(structuredClone(response));
    return response;
  };

  const harness = await createCreatorPagesHarness({ store });
  const before = mock.calls.length;
  const response = await adminGrant(harness, { accountId: 'private-account-a', resourceIds: targetIds });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await responseJson(response);
  assert.deepEqual(body.linkedResourceIds, targetIds);

  const calls = mock.calls.slice(before);
  const pointResourceGets = catalogReads(calls).filter(({ name }) => name === 'GetCommand');
  const resourceBatchGets = catalogReads(calls).filter(({ name }) => name === 'BatchGetCommand');
  const observed = `saw ${queryInputs.length} query pages, ${pointResourceGets.length} catalog point reads, ${resourceBatchGets.length} catalog batches`;
  assert.equal(queryInputs.length, Math.ceil((originalClaims.size + 3) / 2), observed);
  assert.ok(queryInputs.every(({ FilterExpression }) => typeof FilterExpression === 'string'),
    `claim query applies a provider filter (${observed})`);
  assert.ok(queryResponses.some(({ Items, LastEvaluatedKey }) => Items.length === 0 && LastEvaluatedKey),
    'a filtered-empty evaluated page preserves its pagination cursor');
  for (const input of queryInputs) {
    const names = Object.values(input.ExpressionAttributeNames ?? {});
    const values = Object.values(input.ExpressionAttributeValues ?? {});
    assert.ok(names.includes('accountId'), 'claim query filter names accountId');
    assert.ok(names.includes('status'), 'claim query filter names status');
    assert.ok(values.includes('private-account-a'), 'claim query binds the requested account');
    assert.ok(values.includes('pending') && values.includes('partial'),
      'claim query binds both unresolved statuses');
    assert.equal(typeof input.ProjectionExpression, 'string');
    const projectedFields = input.ProjectionExpression.split(',').map((field) => {
      const token = field.trim();
      return input.ExpressionAttributeNames?.[token] ?? token;
    });
    assert.ok(['pk', 'sk', 'recordType', 'id', 'accountId', 'status', 'resourceIds', 'version']
      .every((field) => projectedFields.includes(field)));
    assert.ok(['resources', 'sourceId', 'evidence', 'legacyMarker']
      .every((field) => !projectedFields.includes(field)), 'candidate queries omit stored history payload');
  }

  assert.deepEqual(pointResourceGets.map(({ input }) => input.Key.id).sort(), [...targetIds].sort(),
    `only the initial grants need full resource reads (${observed})`);
  assert.ok(pointResourceGets.every(({ input }) => input.ProjectionExpression === undefined));
  assert.equal(resourceBatchGets.length, 1, `reconciliation uses one projected resource batch (${observed})`);
  assert.equal(typeof resourceBatchGets[0].input.RequestItems[TABLES.catalog].ProjectionExpression, 'string');
  const batchedResourceIds = resourceBatchGets.flatMap(({ input }) =>
    input.RequestItems[TABLES.catalog].Keys.map(({ id }) => id));
  assert.deepEqual(batchedResourceIds.sort(), [...targetIds, ungrantedId].sort(),
    'reconciliation batches each distinct resource needed by overlapping claims exactly once');

  const statusWrites = mock.transactions.filter(({ input }) => input.TransactItems.some(({ Put }) =>
    Put?.TableName === TABLES.profiles && Put.Item?.recordType === 'claim'
    && ['resolved', 'partial'].includes(Put.Item.status)));
  assert.equal(statusWrites.length, originalClaims.size,
    'all matching pending/partial claims reconcile without rewriting unrelated claims');
  for (const [id, beforeRow] of originalClaims) {
    const after = mock.read(TABLES.profiles, { pk: 'ADMIN#CLAIMS', sk: `CLAIM#${id}` });
    assert.equal(after.status, id === '006-pending-partial' ? 'partial' : 'resolved');
    assert.equal(after.sourceId, beforeRow.sourceId);
    assert.equal(after.evidence, beforeRow.evidence);
    assert.equal(after.profileId, beforeRow.profileId);
    assert.equal(after.legacyMarker, beforeRow.legacyMarker,
      'full current claim replacement preserves historical fields outside the query projection');
    assert.deepEqual(after.resources, beforeRow.resources);
    assert.equal(after.version, beforeRow.version + 1);
    assert.deepEqual(mock.read(TABLES.profiles, { pk: `PROFILE#${profileId}`, sk: `CLAIM#${id}` }), {
      pk: `PROFILE#${profileId}`, sk: `CLAIM#${id}`, id, version: 1,
    });
    const transaction = statusWrites.find(({ input }) => input.TransactItems.some(({ Put }) => Put?.Item?.id === id));
    const conditionalAction = transaction.input.TransactItems.find(({ ConditionCheck, Put }) =>
      (ConditionCheck?.TableName === TABLES.profiles && ConditionCheck.Key?.sk === `CLAIM#${id}`)
      || (Put?.TableName === TABLES.profiles && Put.Item?.sk === `CLAIM#${id}`));
    const check = conditionalAction?.ConditionCheck ?? conditionalAction?.Put;
    assert.ok(Object.values(check?.ExpressionAttributeValues ?? {}).includes(beforeRow.version),
      'status reconciliation conditions on the observed claim version');
  }

  assert.deepEqual(mock.read(TABLES.profiles, { pk: 'ADMIN#CLAIMS', sk: `CLAIM#${foreign.id}` }), originalForeign);
  assert.deepEqual(mock.read(TABLES.profiles, { pk: 'ADMIN#CLAIMS', sk: `CLAIM#${alreadyResolved.id}` }), originalResolved);
  assert.deepEqual(mock.read(TABLES.profiles, { pk: 'ADMIN#CLAIMS', sk: `CLAIM#${unrelatedSameAccount.id}` }), originalUnrelated,
    'same-account claims without a selected resource remain untouched');
  assert.deepEqual(mock.read(TABLES.profiles, oldRefKey), oldRef,
    'administrative reconciliation retains the existing reference on the historical profile');
  assert.equal(mock.read(TABLES.profiles, { pk: `PROFILE#${profileId}`, sk: `CLAIM#${unrelatedSameAccount.id}` }), undefined);

  const ownerResponse = await ownerView(harness);
  assert.equal(ownerResponse.status, 200, await ownerResponse.clone().text());
  const owner = await responseJson(ownerResponse);
  assert.deepEqual(new Set(owner.resources.map(({ id }) => id)), new Set(targetIds));
  assert.equal(owner.claims.some(({ id }) => id === historicalClaimId), false,
    'reconciling a historical claim does not transfer access to the current owner history');
  for (const id of targetIds) {
    assert.ok(Object.values(owner.placements).some(({ resourceId }) => resourceId === id));
    const resource = mock.read(TABLES.catalog, { id });
    assert.equal(resource.editorProfileId, profileId);
    assert.equal(resource.directoryControl, 'creator');
  }
  assert.equal(mock.read(TABLES.catalog, { id: ungrantedId }).editorProfileId, undefined,
    'the unresolved member of a partial claim is not granted by association');
});

test('grant reconciliation reports claim-status uncertainty after the resource grant is actually committed', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true, queryPageSize: 10 });
  const profileId = 'phase4-grant-uncertain';
  const resourceId = 'grant-uncertain-target';
  seedMoveProfile(mock, { profileId, accountId: 'private-account-a', published: false });
  seedMoveResource(mock, { id: resourceId, url: `https://claims.example/${resourceId}` });
  const claim = seedClaim(mock, {
    id: 'grant-uncertain-claim', profileId,
    resourceIds: [resourceId], resources: [{ resourceId, url: `https://claims.example/${resourceId}` }],
    version: 4, sourceId: 'uncertain-source', evidence: 'uncertain evidence',
  });

  const rawSend = mock.client.send.bind(mock.client);
  let statusAttempted = false;
  mock.client.send = async (command) => {
    if (command.constructor.name === 'TransactWriteCommand'
      && command.input.TransactItems.some(({ Put }) => Put?.Item?.recordType === 'claim')) {
      await rawSend(command);
      statusAttempted = true;
      throw new Error('simulated lost claim-status acknowledgement');
    }
    return rawSend(command);
  };

  const harness = await createCreatorPagesHarness({ store });
  const response = await adminGrant(harness, { accountId: 'private-account-a', resourceIds: [resourceId] });
  assert.equal(response.status, 503, await response.clone().text());
  const body = await responseJson(response);
  assert.equal(statusAttempted, true);
  assert.equal(body.error, 'PARTIAL_CLAIM_WRITE');
  assert.equal(body.failureStage, 'claim-status');
  assert.deepEqual(body.linkedResourceIds, [resourceId]);
  assert.equal(body.profileChanged, true);

  const granted = mock.read(TABLES.catalog, { id: resourceId });
  assert.equal(granted.editorProfileId, profileId);
  assert.equal(granted.directoryControl, 'creator');
  assert.equal(granted.autoSync, false);
  const profile = mock.read(TABLES.profiles, { pk: `PROFILE#${profileId}`, sk: 'META' });
  assert.ok(Object.values(profile.placements).some(({ resourceId: id }) => id === resourceId));
  const storedClaim = mock.read(TABLES.profiles, { pk: 'ADMIN#CLAIMS', sk: `CLAIM#${claim.id}` });
  assert.equal(storedClaim.status, 'resolved');
  assert.equal(storedClaim.sourceId, claim.sourceId);
  assert.equal(storedClaim.evidence, claim.evidence);
  assert.deepEqual(storedClaim.resources, claim.resources);
  assert.deepEqual(mock.read(TABLES.profiles, { pk: `PROFILE#${profileId}`, sk: `CLAIM#${claim.id}` }), {
    pk: `PROFILE#${profileId}`, sk: `CLAIM#${claim.id}`, id: claim.id, version: 1,
  });
  const ownerResponse = await ownerView(harness);
  assert.equal(ownerResponse.status, 200, await ownerResponse.clone().text());
  const owner = await responseJson(ownerResponse);
  assert.ok(owner.resources.some(({ id }) => id === resourceId));
  assert.ok(owner.claims.some(({ id, status }) => id === claim.id && status === 'resolved'));
});

test('grant reconciliation preserves a claim changed between its projected and full reads', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true });
  const profileId = 'phase4-grant-reconciliation-race';
  const resourceId = 'grant-reconciliation-race-target';
  seedMoveProfile(mock, { profileId, accountId: 'private-account-a', published: false });
  seedMoveResource(mock, { id: resourceId, url: `https://claims.example/${resourceId}` });
  const claim = seedClaim(mock, {
    id: 'grant-reconciliation-race-claim', resourceIds: [resourceId], version: 4,
  });
  const key = `claim:${claim.id}`;
  const { pk, sk, ...claimValue } = claim;
  const intervening = { ...claimValue, evidence: 'Newer evidence', version: 5 };
  let observedChange = false;
  const send = mock.client.send.bind(mock.client);
  mock.client.send = async (command) => {
    const result = await send(command);
    if (command.constructor.name === 'QueryCommand' && result.Items?.some((item) => item.id === claim.id)) {
      assert.equal(await store.transact({
        checks: [{ key, version: claim.version }], puts: [{ key, value: intervening }],
      }), true);
      observedChange = true;
    }
    return result;
  };

  const harness = await createCreatorPagesHarness({ store });
  const response = await adminGrant(harness, { accountId: 'private-account-a', resourceIds: [resourceId] });
  assert.equal(observedChange, true);
  assert.equal(response.status, 409, await response.clone().text());
  const body = await responseJson(response);
  assert.equal(body.error, 'CLAIM_CONFLICT');
  assert.equal(body.failureStage, 'claim-status');
  assert.deepEqual(body.linkedResourceIds, [resourceId]);
  assert.equal(body.profileChanged, true);
  assert.deepEqual(mock.read(TABLES.profiles, { pk, sk }), { ...intervening, pk, sk });
  assert.equal(mock.read(TABLES.profiles, { pk: `PROFILE#${profileId}`, sk }), undefined);
  const owner = await ownerView(harness);
  assert.equal(owner.status, 200);
  assert.ok((await responseJson(owner)).resources.some(({ id, metadataEditable }) => id === resourceId && metadataEditable));
});

test('grant reconciliation handles a versionless legacy claim with an absence-aware condition and preserves its history', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true });
  const profileId = 'phase4-versionless-owner';
  const targetId = 'grant-versionless-target';
  seedMoveProfile(mock, { profileId, accountId: 'private-account-a', published: false });
  seedMoveResource(mock, { id: targetId, url: `https://claims.example/${targetId}` });
  const claim = seedClaim(mock, {
    id: 'legacy-versionless-claim',
    profileId: undefined,
    reference: false,
    resourceIds: [targetId],
    resources: [{ resourceId: targetId, url: `https://claims.example/${targetId}` }],
    version: undefined,
    sourceId: 'old-source',
    evidence: 'Old evidence is retained',
  });
  const harness = await createCreatorPagesHarness({ store });

  const response = await adminGrant(harness, { accountId: 'private-account-a', resourceIds: [targetId] });
  assert.equal(response.status, 200, await response.clone().text());
  const after = mock.read(TABLES.profiles, { pk: 'ADMIN#CLAIMS', sk: `CLAIM#${claim.id}` });
  assert.equal(after.status, 'resolved');
  assert.equal(after.version, 1,
    'the store aligns a historical versionless claim with its first persisted ordering version');
  assert.equal(after.sourceId, claim.sourceId);
  assert.equal(after.evidence, claim.evidence);
  assert.deepEqual(after.resources, claim.resources);
  assert.deepEqual(mock.read(TABLES.profiles, { pk: `PROFILE#${profileId}`, sk: `CLAIM#${claim.id}` }), {
    pk: `PROFILE#${profileId}`, sk: `CLAIM#${claim.id}`, id: claim.id, version: 1,
  });

  const reconciliation = mock.transactions.find(({ input }) => input.TransactItems.some(({ Put }) =>
    Put?.TableName === TABLES.profiles && Put.Item?.recordType === 'claim' && Put.Item?.id === claim.id));
  const conditionalAction = reconciliation.input.TransactItems.find(({ ConditionCheck, Put }) =>
    (ConditionCheck?.TableName === TABLES.profiles && ConditionCheck.Key?.sk === `CLAIM#${claim.id}`)
    || (Put?.TableName === TABLES.profiles && Put.Item?.sk === `CLAIM#${claim.id}`));
  const condition = conditionalAction?.ConditionCheck ?? conditionalAction?.Put;
  assert.equal(
    /attribute_not_exists/.test(condition.ConditionExpression)
      || Object.values(condition.ExpressionAttributeValues ?? {}).includes(0),
    true,
    'a versionless legacy claim is guarded by an absence-aware version condition');
});

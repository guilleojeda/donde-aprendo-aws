import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { apiRequest, responseJson, sessionCsrf, SITE_ORIGIN } from './fixtures/creator-pages.mjs';
import { createDynamoMoveHarness, seedMoveProfile } from './fixtures/creator-link-move.mjs';

const RESOURCE_TABLE = 'catalog-test';
const PROFILE_TABLE = 'profiles-test';

function queryResourceUrl(id, action) {
  const url = new URL(action ? `/api/admin/recursos/${action}/` : '/api/admin/recursos/', SITE_ORIGIN);
  url.searchParams.set('id', id);
  return url.href;
}

function classification(category = 'Certificaciones', version) {
  return {
    category,
    kind: 'content',
    format: 'Artículo',
    topics: [category],
    ...(version === undefined ? {} : { version }),
  };
}

function seedResource(mock, id, {
  category = 'Certificaciones',
  topics = [category],
  published = false,
  approvalRevoked = false,
  hidden = false,
  version = 1,
  updatedAt = 1234,
} = {}) {
  mock.seed(RESOURCE_TABLE, {
    id,
    title: `No-op ${id}`,
    url: `https://noop.example/${encodeURIComponent(id)}`,
    description: 'Persisted before the no-op request.',
    category,
    kind: 'content',
    format: 'Artículo',
    topics,
    order: 1,
    featured: false,
    published,
    approvalRevoked,
    hidden,
    directoryControl: 'editorial',
    createdAt: 1000,
    updatedAt,
    ...(version === null ? {} : { version }),
  });
}

function seedProfile(mock, id, { hidden, version = 1, updatedAt = 4321 } = {}) {
  mock.seed(PROFILE_TABLE, {
    pk: `PROFILE#${id}`,
    sk: 'META',
    recordType: 'profile',
    id,
    displayName: `No-op ${id}`,
    slug: `noop-${id}`,
    programs: [],
    socials: {},
    published: true,
    hidden,
    createdAt: 1000,
    updatedAt,
    ...(version === null ? {} : { version }),
  });
}

async function adminCall(harness, url, { method, body, session = 'admin', csrf = sessionCsrf.admin,
  origin = SITE_ORIGIN } = {}) {
  const request = apiRequest(url, { session, csrf, origin, method: method ?? 'POST', body });
  return harness.service.handle(request);
}

function resourceKey(id) {
  return { id };
}

function profileKey(id) {
  return { pk: `PROFILE#${id}`, sk: 'META' };
}

function isTargetOnlyConditionTransaction(transactions, { tableName, key }) {
  if (transactions.length !== 1) return false;
  const items = transactions[0].input.TransactItems;
  if (items.length !== 1 || !items[0].ConditionCheck) return false;
  const check = items[0].ConditionCheck;
  return check.TableName === tableName
    && isDeepStrictEqual(check.Key, key)
    && typeof check.ConditionExpression === 'string'
    && check.ConditionExpression.length > 0;
}

async function parsed(response) {
  try {
    return await responseJson(response);
  } catch {
    return null;
  }
}

function noReceiptAndVersion(body, entity, id, version) {
  return Array.isArray(body?.versionChanges)
    && body.versionChanges.length === 0
    && body?.[entity]?.id === id
    && body[entity].version === version;
}

function canonicalTargetMatches(body, entity, raw) {
  const target = body?.[entity];
  if (!target) return false;
  const expected = entity === 'resource'
    ? {
      id: raw.id,
      title: raw.title,
      url: raw.url,
      category: raw.category,
      kind: raw.kind,
      format: raw.format,
      topics: raw.topics,
      published: raw.published === true,
      hidden: raw.hidden === true,
      version: raw.version ?? 0,
    }
    : {
      id: raw.id,
      displayName: raw.displayName,
      slug: raw.slug,
      programs: raw.programs,
      socials: raw.socials,
      published: raw.published,
      hidden: raw.hidden,
      version: raw.version ?? 0,
    };
  return isDeepStrictEqual(Object.fromEntries(Object.keys(expected).map((key) => [key, target[key]])), expected);
}

function checkSummary(transactions) {
  return transactions.map(({ input }) => input.TransactItems.map((item) => {
    if (item.ConditionCheck) {
      return {
        kind: 'ConditionCheck',
        table: item.ConditionCheck.TableName,
        key: item.ConditionCheck.Key,
        hasCondition: typeof item.ConditionCheck.ConditionExpression === 'string'
          && item.ConditionCheck.ConditionExpression.length > 0,
      };
    }
    return { kind: Object.keys(item)[0] };
  }));
}

async function interposeRealCommandAfterObservedGet(harness, { tableName, key, competitor }) {
  const send = harness.mock.client.send;
  let fired = false;
  let competingResult;
  harness.mock.client.send = async (command) => {
    const result = await send(command);
    if (!fired && command.constructor.name === 'GetCommand'
      && command.input.TableName === tableName
      && isDeepStrictEqual(command.input.Key, key)) {
      // The target's actual GetCommand has returned its old image. Let a real
      // second service request commit before returning that observed image.
      fired = true;
      competingResult = await competitor();
    }
    return result;
  };
  return {
    didFire: () => fired,
    competingResult: () => competingResult,
    restore() { harness.mock.client.send = send; },
  };
}

test('valid administrative no-ops preserve physical records and confirm only the observed target version', async () => {
  const harness = await createDynamoMoveHarness();
  const cases = [
    { id: 'noop-approve', action: 'aprobar', state: { published: true } },
    { id: 'noop-revoke', action: 'revocar', state: { published: false, approvalRevoked: true } },
    { id: 'noop-hide', action: 'ocultar', state: { hidden: true } },
    { id: 'noop-restore', action: 'restaurar', state: { hidden: false } },
  ];
  for (const item of cases) seedResource(harness.mock, item.id, { ...item.state, version: 4 });
  seedResource(harness.mock, 'noop-action-legacy-zero', { hidden: true, version: null });
  seedResource(harness.mock, 'noop-classification-current', { version: 7 });
  seedResource(harness.mock, 'noop-classification-legacy-zero', { version: null });

  const profileCases = [
    { id: 'noop-profile-hide', action: 'ocultar', hidden: true, version: 6 },
    { id: 'noop-profile-restore', action: 'restaurar', hidden: false, version: 8 },
    { id: 'noop-profile-legacy-zero', action: 'ocultar', hidden: true, version: null },
  ];
  for (const item of profileCases) seedProfile(harness.mock, item.id, item);

  const observations = [];
  for (const item of cases) {
    const before = structuredClone(harness.mock.read(RESOURCE_TABLE, resourceKey(item.id)));
    const transactionsBefore = harness.mock.transactions.length;
    const response = await adminCall(harness, queryResourceUrl(item.id, item.action), {
      body: { version: before.version },
    });
    const body = await parsed(response);
    const raw = harness.mock.read(RESOURCE_TABLE, resourceKey(item.id));
    const logicalVersion = before.version ?? 0;
    observations.push({
      label: `resource ${item.action} v${logicalVersion}`,
      status: response.status,
      bodyOK: noReceiptAndVersion(body, 'resource', item.id, logicalVersion),
      canonical: canonicalTargetMatches(body, 'resource', before),
      unchanged: isDeepStrictEqual(raw, before),
      targetOnly: isTargetOnlyConditionTransaction(
        harness.mock.transactions.slice(transactionsBefore),
        { tableName: RESOURCE_TABLE, key: resourceKey(item.id) },
      ),
      transactions: checkSummary(harness.mock.transactions.slice(transactionsBefore)),
    });
  }

  const zeroAction = 'noop-action-legacy-zero';
  {
    const before = structuredClone(harness.mock.read(RESOURCE_TABLE, resourceKey(zeroAction)));
    const transactionsBefore = harness.mock.transactions.length;
    const response = await adminCall(harness, queryResourceUrl(zeroAction, 'ocultar'), { body: { version: 0 } });
    const body = await parsed(response);
    const raw = harness.mock.read(RESOURCE_TABLE, resourceKey(zeroAction));
    observations.push({
      label: 'resource hide legacy version zero',
      status: response.status,
      bodyOK: noReceiptAndVersion(body, 'resource', zeroAction, 0),
      canonical: canonicalTargetMatches(body, 'resource', before),
      unchanged: isDeepStrictEqual(raw, before),
      targetOnly: isTargetOnlyConditionTransaction(harness.mock.transactions.slice(transactionsBefore), {
        tableName: RESOURCE_TABLE, key: resourceKey(zeroAction),
      }),
      transactions: checkSummary(harness.mock.transactions.slice(transactionsBefore)),
      versionPresenceOK: !Object.hasOwn(before, 'version') && !Object.hasOwn(raw, 'version'),
    });
  }

  for (const [id, version] of [['noop-classification-current', 7], ['noop-classification-legacy-zero', 0]]) {
    const before = structuredClone(harness.mock.read(RESOURCE_TABLE, resourceKey(id)));
    const transactionsBefore = harness.mock.transactions.length;
    const response = await adminCall(harness, queryResourceUrl(id), {
      method: 'PATCH',
      body: classification(before.category, id === 'noop-classification-current' ? version : undefined),
    });
    const body = await parsed(response);
    const raw = harness.mock.read(RESOURCE_TABLE, resourceKey(id));
    observations.push({
      label: `classification unchanged v${version}${id.endsWith('legacy-zero') ? ' without submitted version' : ''}`,
      status: response.status,
      bodyOK: noReceiptAndVersion(body, 'resource', id, version),
      canonical: canonicalTargetMatches(body, 'resource', before),
      unchanged: isDeepStrictEqual(raw, before),
      targetOnly: isTargetOnlyConditionTransaction(harness.mock.transactions.slice(transactionsBefore), {
        tableName: RESOURCE_TABLE, key: resourceKey(id),
      }),
      transactions: checkSummary(harness.mock.transactions.slice(transactionsBefore)),
      versionPresenceOK: version !== 0 || (!Object.hasOwn(before, 'version') && !Object.hasOwn(raw, 'version')),
    });
  }

  for (const item of profileCases) {
    const key = profileKey(item.id);
    const before = structuredClone(harness.mock.read(PROFILE_TABLE, key));
    const logicalVersion = before.version ?? 0;
    const transactionsBefore = harness.mock.transactions.length;
    const response = await adminCall(harness, `/api/admin/perfiles/${encodeURIComponent(item.id)}/${item.action}/`, {
      body: { version: logicalVersion },
    });
    const body = await parsed(response);
    const raw = harness.mock.read(PROFILE_TABLE, key);
    observations.push({
      label: `profile ${item.action} v${logicalVersion}`,
      status: response.status,
      bodyOK: noReceiptAndVersion(body, 'profile', item.id, logicalVersion),
      canonical: canonicalTargetMatches(body, 'profile', before),
      unchanged: isDeepStrictEqual(raw, before),
      targetOnly: isTargetOnlyConditionTransaction(harness.mock.transactions.slice(transactionsBefore), {
        tableName: PROFILE_TABLE, key,
      }),
      transactions: checkSummary(harness.mock.transactions.slice(transactionsBefore)),
      versionPresenceOK: logicalVersion !== 0 || (!Object.hasOwn(before, 'version') && !Object.hasOwn(raw, 'version')),
    });
  }

  const failures = observations.filter((item) => item.status !== 200 || !item.bodyOK || !item.unchanged
    || !item.canonical || !item.targetOnly || item.versionPresenceOK === false);
  assert.deepEqual(failures, [], `no-op confirmation failures: ${JSON.stringify(failures, null, 2)}`);
});

test('a competing resource writer invalidates an observed moderation no-op, then fresh retry succeeds', async () => {
  const harness = await createDynamoMoveHarness();
  const id = 'noop-resource-race';
  seedResource(harness.mock, id, { hidden: true, version: 3 });
  const key = resourceKey(id);
  const before = structuredClone(harness.mock.read(RESOURCE_TABLE, key));
  const interposition = await interposeRealCommandAfterObservedGet(harness, {
    tableName: RESOURCE_TABLE,
    key,
    competitor: () => adminCall(harness, queryResourceUrl(id), {
      method: 'PATCH', body: classification('Seguridad', 3),
    }),
  });

  let staleResponse;
  try {
    staleResponse = await adminCall(harness, queryResourceUrl(id, 'ocultar'), { body: { version: 3 } });
  } finally {
    interposition.restore();
  }
  const staleBody = await parsed(staleResponse);
  const competitorResponse = interposition.competingResult();
  const competitorBody = await parsed(competitorResponse);
  const afterCompetitor = structuredClone(harness.mock.read(RESOURCE_TABLE, key));
  const currentVersion = afterCompetitor.version ?? 0;
  const manualResponse = await adminCall(harness, queryResourceUrl(id, 'ocultar'), {
    body: { version: currentVersion },
  });
  const manualBody = await parsed(manualResponse);
  const afterManual = harness.mock.read(RESOURCE_TABLE, key);

  const issues = [];
  if (!interposition.didFire()) issues.push('the competitor did not run after the real target read');
  if (staleResponse.status !== 409) issues.push(`stale no-op returned ${staleResponse.status}, expected 409`);
  if (staleBody?.error !== 'RESOURCE_CONFLICT') issues.push(`stale conflict body was ${JSON.stringify(staleBody)}`);
  if (competitorResponse?.status !== 200 || competitorBody?.resource?.version !== 4) {
    issues.push(`real competing classification did not commit: ${competitorResponse?.status} ${JSON.stringify(competitorBody)}`);
  }
  if (afterCompetitor.category !== 'Seguridad' || afterCompetitor.version !== 4 || afterCompetitor.hidden !== true) {
    issues.push(`competing persisted resource is ${JSON.stringify(afterCompetitor)}`);
  }
  if (manualResponse.status !== 200 || !noReceiptAndVersion(manualBody, 'resource', id, 4)) {
    issues.push(`fresh manual retry was ${manualResponse.status} ${JSON.stringify(manualBody)}`);
  }
  if (!isDeepStrictEqual(afterManual, afterCompetitor)) issues.push('fresh no-op changed the raw resource');
  if (!isDeepStrictEqual(before, {
    ...afterCompetitor,
    category: before.category,
    topics: before.topics,
    version: before.version,
    updatedAt: before.updatedAt,
  })) issues.push('the competing write changed fields outside classification/version/timestamp');
  assert.deepEqual(issues, [], `resource no-op race issues: ${JSON.stringify(issues, null, 2)}`);
});

test('a competing owner write invalidates an observed profile no-op without adding other participants', async () => {
  const harness = await createDynamoMoveHarness();
  const id = 'noop-profile-race';
  seedMoveProfile(harness.mock, { accountId: 'private-account-a', profileId: id, slug: 'noop-profile-race', version: 5 });
  const key = profileKey(id);
  harness.mock.seed(PROFILE_TABLE, { ...harness.mock.read(PROFILE_TABLE, key), hidden: true, updatedAt: 4321 });
  const interposition = await interposeRealCommandAfterObservedGet(harness, {
    tableName: PROFILE_TABLE,
    key,
    competitor: () => harness.service.handle(apiRequest('/api/creador/perfil', {
      session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'PUT',
      body: { displayName: 'Concurrent owner edit', slug: 'noop-profile-race', version: 5 },
    })),
  });

  let staleResponse;
  try {
    staleResponse = await adminCall(harness, `/api/admin/perfiles/${id}/ocultar/`, { body: { version: 5 } });
  } finally {
    interposition.restore();
  }
  const staleBody = await parsed(staleResponse);
  const competitorResponse = interposition.competingResult();
  const competitorBody = await parsed(competitorResponse);
  const afterCompetitor = structuredClone(harness.mock.read(PROFILE_TABLE, key));
  const manualResponse = await adminCall(harness, `/api/admin/perfiles/${id}/ocultar/`, {
    body: { version: afterCompetitor.version },
  });
  const manualBody = await parsed(manualResponse);
  const afterManual = harness.mock.read(PROFILE_TABLE, key);

  const issues = [];
  if (!interposition.didFire()) issues.push('the owner writer did not run after the real target read');
  if (staleResponse.status !== 409 || staleBody?.error !== 'PROFILE_CONFLICT') {
    issues.push(`stale profile no-op was ${staleResponse.status} ${JSON.stringify(staleBody)}`);
  }
  if (competitorResponse?.status !== 200 || competitorBody?.profile?.version !== 6) {
    issues.push(`real owner update did not commit: ${competitorResponse?.status} ${JSON.stringify(competitorBody)}`);
  }
  if (afterCompetitor.displayName !== 'Concurrent owner edit' || afterCompetitor.version !== 6 || afterCompetitor.hidden !== true) {
    issues.push(`competing profile state is ${JSON.stringify(afterCompetitor)}`);
  }
  if (manualResponse.status !== 200 || !noReceiptAndVersion(manualBody, 'profile', id, 6)) {
    issues.push(`fresh profile retry was ${manualResponse.status} ${JSON.stringify(manualBody)}`);
  }
  if (!isDeepStrictEqual(afterManual, afterCompetitor)) issues.push('fresh profile no-op changed its raw record');
  assert.deepEqual(issues, [], `profile no-op race issues: ${JSON.stringify(issues, null, 2)}`);
});

test('an unchanged classification conflicts with a real concurrent moderation command and can be retried', async () => {
  const harness = await createDynamoMoveHarness();
  const id = 'noop-classification-race';
  seedResource(harness.mock, id, { version: 2 });
  const key = resourceKey(id);
  const interposition = await interposeRealCommandAfterObservedGet(harness, {
    tableName: RESOURCE_TABLE,
    key,
    competitor: () => adminCall(harness, queryResourceUrl(id, 'ocultar'), { body: { version: 2 } }),
  });

  let staleResponse;
  try {
    staleResponse = await adminCall(harness, queryResourceUrl(id), {
      method: 'PATCH', body: classification('Certificaciones'),
    });
  } finally {
    interposition.restore();
  }
  const staleBody = await parsed(staleResponse);
  const competitorResponse = interposition.competingResult();
  const competitorBody = await parsed(competitorResponse);
  const current = structuredClone(harness.mock.read(RESOURCE_TABLE, key));
  const manualResponse = await adminCall(harness, queryResourceUrl(id), {
    method: 'PATCH', body: classification(current.category, current.version),
  });
  const manualBody = await parsed(manualResponse);
  const afterManual = harness.mock.read(RESOURCE_TABLE, key);
  const issues = [];
  if (!interposition.didFire()) issues.push('the moderation writer did not run after the real classification read');
  if (staleResponse.status !== 409 || staleBody?.error !== 'RESOURCE_CONFLICT') {
    issues.push(`stale classification no-op was ${staleResponse.status} ${JSON.stringify(staleBody)}`);
  }
  if (competitorResponse?.status !== 200 || competitorBody?.resource?.version !== 3) {
    issues.push(`real moderation did not commit: ${competitorResponse?.status} ${JSON.stringify(competitorBody)}`);
  }
  if (current.hidden !== true || current.version !== 3) issues.push(`moderation state was ${JSON.stringify(current)}`);
  if (manualResponse.status !== 200 || !noReceiptAndVersion(manualBody, 'resource', id, 3)) {
    issues.push(`fresh classification retry was ${manualResponse.status} ${JSON.stringify(manualBody)}`);
  }
  if (!isDeepStrictEqual(afterManual, current)) issues.push('fresh classification no-op changed raw state');
  assert.deepEqual(issues, [], `classification no-op race issues: ${JSON.stringify(issues, null, 2)}`);
});

test('a failed no-op confirmation is unavailable and leaves a later real action usable', async () => {
  const harness = await createDynamoMoveHarness();
  const id = 'noop-unavailable';
  seedResource(harness.mock, id, { hidden: true, version: 9 });
  const key = resourceKey(id);
  const before = structuredClone(harness.mock.read(RESOURCE_TABLE, key));
  harness.mock.failNextTransaction(new Error('DynamoDB confirmation unavailable'));

  const noOpResponse = await adminCall(harness, queryResourceUrl(id, 'ocultar'), { body: { version: 9 } });
  const noOpBody = await parsed(noOpResponse);
  const afterNoOp = structuredClone(harness.mock.read(RESOURCE_TABLE, key));
  const firstManualResponse = await adminCall(harness, queryResourceUrl(id, 'restaurar'), { body: { version: 9 } });
  const manualBody = await parsed(firstManualResponse);
  const final = harness.mock.read(RESOURCE_TABLE, key);

  const issues = [];
  if (noOpResponse.status !== 503) issues.push(`unavailable no-op returned ${noOpResponse.status}`);
  if (noOpBody?.error !== 'SERVICE_UNAVAILABLE') issues.push(`unavailable no-op body was ${JSON.stringify(noOpBody)}`);
  if (!isDeepStrictEqual(afterNoOp, before)) issues.push('unavailable no-op changed raw state');
  if (firstManualResponse.status !== 200) {
    issues.push(`the next legal manual restore after no-op confirmation returned ${firstManualResponse.status}`);
  }
  if (firstManualResponse.status !== 200 || manualBody?.resource?.id !== id || manualBody.resource.hidden !== false
    || manualBody.resource.version !== 10
    || manualBody.versionChanges?.[0]?.before !== 9
    || manualBody.versionChanges?.[0]?.after !== 10) {
    issues.push(`manual restore did not complete after the injected failure: ${firstManualResponse.status} ${JSON.stringify(manualBody)}`);
  }
  if (final.hidden !== false || final.version !== 10) issues.push(`manual restore persisted ${JSON.stringify(final)}`);
  assert.deepEqual(issues, [], `unavailable no-op issues: ${JSON.stringify(issues, null, 2)}`);
});

test('a confirmed no-op returns its observed canonical target if another writer commits before serialization', async () => {
  const harness = await createDynamoMoveHarness();
  const id = 'noop-canonical-race';
  seedResource(harness.mock, id, { category: 'Seguridad', topics: ['Seguridad'], hidden: true, version: 12 });
  const competitorResults = [];
  harness.mock.mutateAfterNextTransaction(async () => {
    const response = await adminCall(harness, queryResourceUrl(id), {
      method: 'PATCH', body: classification('Certificaciones', 12),
    });
    competitorResults.push({ status: response.status, body: await parsed(response) });
  });

  const noOpResponse = await adminCall(harness, queryResourceUrl(id, 'ocultar'), { body: { version: 12 } });
  const noOpBody = await parsed(noOpResponse);
  const final = harness.mock.read(RESOURCE_TABLE, resourceKey(id));
  const issues = [];
  if (noOpResponse.status !== 200 || !noReceiptAndVersion(noOpBody, 'resource', id, 12)) {
    issues.push(`confirmed no-op response was ${noOpResponse.status} ${JSON.stringify(noOpBody)}`);
  }
  if (noOpBody?.resource?.category !== 'Seguridad') {
    issues.push(`response did not retain the prepared target: ${JSON.stringify(noOpBody?.resource)}`);
  }
  if (competitorResults.length !== 1 || competitorResults[0]?.status !== 200
    || competitorResults[0]?.body?.resource?.version !== 13) {
    issues.push(`real post-confirmation writer did not commit: ${JSON.stringify(competitorResults)}`);
  }
  if (final.category !== 'Certificaciones' || final.version !== 13 || final.hidden !== true) {
    issues.push(`final raw row does not show only the competing write: ${JSON.stringify(final)}`);
  }
  assert.deepEqual(issues, [], `canonical no-op response issues: ${JSON.stringify(issues, null, 2)}`);
});

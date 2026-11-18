import assert from 'node:assert/strict';
import test from 'node:test';
import { createGA4StatisticsReader } from '../src/lib/creator-statistics-ga4.mjs';
import { createGA4TokenProvider } from '../src/lib/creator-statistics-token.mjs';
import { createCreatorStatisticsStore } from '../src/lib/creator-statistics-store.mjs';
import { callApi, createCreatorPagesHarness, sessionCsrf } from './fixtures/creator-pages.mjs';
import { analyticsReport } from './fixtures/creator-statistics-ga4.mjs';

const moduleResult = await import('../src/lib/creator-statistics.mjs').then(
  (value) => ({ value }),
  (error) => ({ error }),
);

const HOUR = 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * HOUR;
const INITIAL_NOW = Date.parse('2026-10-24T02:30:00.000Z');
const TOKEN_CREDENTIALS = {
  type: 'service_account',
  client_email: 'statistics@fixture.invalid',
  private_key: 'fixture-private-key',
};

function api() {
  assert.equal(
    moduleResult.error,
    undefined,
    `Falta implementar la caché de estadísticas de creadores: ${moduleResult.error?.message}`,
  );
  assert.equal(typeof moduleResult.value.createCachedCreatorStatistics, 'function',
    'creator-statistics.mjs debe exportar createCachedCreatorStatistics');
  return moduleResult.value.createCachedCreatorStatistics;
}

function localDate(now, timeZone) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function reportFor(input, now = INITIAL_NOW, overrides = {}) {
  const { timeZone: requestedTimeZone, ...reportOverrides } = overrides;
  const timeZone = requestedTimeZone ?? 'America/Los_Angeles';
  const endDate = localDate(now, timeZone);
  const days = input.period === 30 ? 30 : 7;
  const start = new Date(`${endDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const startDate = start.toISOString().slice(0, 10);
  const totals = reportOverrides.totals ?? { views: 12, visitors: 8, clicks: 3 };
  const captureStartedAt = '2026-10-23T23:38:00.000Z';
  const firstMeasuredDate = localDate(Date.parse(captureStartedAt), timeZone);
  const daily = reportOverrides.daily ?? Array.from({ length: days }, (_, index) => {
    const date = new Date(`${startDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const dateString = date.toISOString().slice(0, 10);
    const beforeMeasurement = dateString < firstMeasuredDate;
    return {
      date: dateString,
      views: beforeMeasurement ? null : index === days - 1 ? totals.views : 0,
      clicks: beforeMeasurement ? null : index === days - 1 ? totals.clicks : 0,
    };
  });
  const linkOverrides = reportOverrides.links ?? {};
  const totalRows = linkOverrides.totalRows ?? 1;
  const rows = linkOverrides.rows ?? (input.page === 1 && totalRows > 0
    ? [{ linkId: 'placement-test', title: 'Enlace de ejemplo', clicks: totals.clicks }]
    : []);
  const links = {
    page: input.page,
    pageSize: 100,
    totalRows,
    rows,
    ...linkOverrides,
  };
  return {
    creatorId: input.profileId,
    period: input.period,
    page: input.page,
    range: { startDate, endDate, timeZone },
    totals,
    daily,
    links,
    sources: [],
    warnings: [],
    captureStartedAt,
    ...reportOverrides,
  };
}

function ga4Reader(tokenProvider, onFetch = () => {}) {
  return createGA4StatisticsReader({
    propertyId: '424203315',
    captureStartedAt: '2026-10-23T23:38:00Z',
    now: () => INITIAL_NOW,
    getAccessToken: () => tokenProvider.getAccessToken(),
    fetch: async (_url, options) => {
      onFetch();
      const { requests } = JSON.parse(options.body);
      return Response.json({ reports: requests.map((request) => analyticsReport(request)) });
    },
  });
}

function makeReader(read = (input) => reportFor(input)) {
  const calls = [];
  return {
    calls,
    reader: {
      async read(input) {
        calls.push(structuredClone(input));
        return read(input, calls.length - 1);
      },
    },
  };
}

function identity(key) {
  if (key && typeof key === 'object') {
    const kind = key.kind ?? (Object.hasOwn(key, 'page') ? 'page' : 'summary');
    return JSON.stringify([key.profileId, key.period, kind, kind === 'page' ? key.page ?? 1 : null]);
  }
  return String(key);
}

function pageCacheOperations(cache, operation, query) {
  return cache.calls[operation].filter((entry) => {
    const key = operation === 'gets' ? entry : entry.key;
    if (!key || typeof key !== 'object') return false;
    return (key.kind ?? (Object.hasOwn(key, 'page') ? 'page' : 'summary')) === 'page'
      && key.profileId === query.profileId
      && key.period === query.period
      && (key.page ?? 1) === (query.page ?? 1);
  });
}

function makeCache() {
  const values = new Map();
  const calls = { gets: [], puts: [] };
  let getError;
  let putError;
  let revision = 0;
  return {
    values,
    calls,
    failGet(error) { getError = error; },
    failPut(error) { putError = error; },
    seed(query, envelope) {
      const value = structuredClone(envelope);
      if (value.schemaVersion === 1) value.revision = `seed-revision-${revision += 1}`;
      values.set(identity(query), value);
    },
    async get(query) {
      calls.gets.push(structuredClone(query));
      if (getError) throw getError;
      const value = values.get(identity(query));
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(key, envelope) {
      calls.puts.push({ key: structuredClone(key), envelope: structuredClone(envelope) });
      if (putError) throw putError;
      const value = structuredClone(envelope);
      value.revision = `memory-revision-${revision += 1}`;
      values.set(identity(key), value);
    },
  };
}

function envelope(report, { updatedAt = INITIAL_NOW, expiresAt = updatedAt + HOUR, retainUntil = updatedAt + SEVEN_DAYS } = {}) {
  return { schemaVersion: 1, report: structuredClone(report), updatedAt, expiresAt, retainUntil };
}

function makeService({ reader, cache = makeCache(), clock = INITIAL_NOW } = {}) {
  return {
    service: api()({ reader, cache, now: () => clock }),
    cache,
  };
}

function physicalCacheId(key) {
  return `${key.pk}\u0000${key.sk}`;
}

function logicalCacheKey(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  const kind = value.kind ?? (Object.hasOwn(value, 'page') ? 'page' : 'summary');
  assert.ok(['summary', 'period', 'page'].includes(kind), `unsupported statistics cache kind: ${kind}`);
  if (kind === 'page') {
    assert.ok(Number.isSafeInteger(value.page) && value.page >= 1);
    return { profileId: value.profileId, period: value.period, kind, page: value.page };
  }
  return { profileId: value.profileId, period: value.period, kind };
}

function logicalStorageKey(value, { version = 2, propertyId = '424203315' } = {}) {
  const key = logicalCacheKey(value);
  const suffix = key.kind === 'summary'
    ? `${key.period}#summary`
    : key.kind === 'period'
      ? `${key.period}#period`
      : `${key.period}#page#${key.page}`;
  return {
    pk: `ANALYTICS#${key.profileId}`,
    sk: version === 1
      ? `GA4#${propertyId}#v1#${key.period}#${key.page ?? 1}`
      : `GA4#${propertyId}#v2#${suffix}`,
  };
}

function physicalRowFor(items, logicalKey, propertyId = '424203315') {
  const physical = logicalStorageKey(logicalKey, { propertyId });
  const item = items.get(physicalCacheId(physical));
  return item === undefined ? undefined : structuredClone(item);
}

function unmarshalExpressionValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (Object.hasOwn(value, 'S')) return value.S;
  if (Object.hasOwn(value, 'N')) return Number(value.N);
  return value;
}

function conditionalPublicationAllowed(input, current) {
  const expression = input.ConditionExpression;
  assert.equal(typeof expression, 'string', 'cache publication must use a conditional expression');
  const names = input.ExpressionAttributeNames ?? {};
  const values = input.ExpressionAttributeValues ?? {};
  const keyToken = Object.entries(names).find(([, name]) => name === 'pk')?.[0] ?? 'pk';
  const revisionToken = Object.entries(names).find(([, name]) => name === 'revision')?.[0] ?? 'revision';
  const expectedToken = Object.keys(values).find((token) => /revision|expected|predecessor/i.test(token));
  const expressionText = expression.replace(/\s+/gu, ' ').trim()
    .replace(/^\((.*)\)$/u, '$1').trim();
  const absent = `attribute_not_exists(${keyToken})`;
  const matchesRevision = expectedToken !== undefined
    && `${revisionToken} = ${expectedToken}`;
  const absenceOnly = expressionText === absent;
  const revisionMatchOnly = matchesRevision && expressionText === matchesRevision;
  const combined = matchesRevision && (
    expressionText === `${absent} OR ${matchesRevision}`
    || expressionText === `${matchesRevision} OR ${absent}`
  );
  assert.ok(absenceOnly || revisionMatchOnly,
    `unsupported or incorrectly scoped cache condition: ${expression}`);
  assert.equal(combined, false,
    'a verified existing predecessor must use a revision-only condition; absence OR revision permits a deleted predecessor to be replaced');
  if (!current) return absenceOnly;
  if (!revisionMatchOnly) return false;
  const expectedRevision = unmarshalExpressionValue(values[expectedToken]);
  return typeof current.revision === 'string'
    && String(expectedRevision) === current.revision;
}

function createDynamoStatisticsFixture({ propertyId = '424203315', initialItems = [] } = {}) {
  const items = new Map(initialItems.map((item) => [physicalCacheId(item), structuredClone(item)]));
  const calls = { gets: [], puts: [] };
  let getOverride;
  let onConditionalFailure;
  const client = {
    async send(command) {
      const name = command.constructor.name;
      if (name === 'GetCommand') {
        calls.gets.push(command);
        if (getOverride) return getOverride(command);
        assert.equal(command.input.ConsistentRead, true, 'cache predecessor reads must be strongly consistent');
        const item = items.get(physicalCacheId(command.input.Key));
        return item === undefined ? {} : { Item: structuredClone(item) };
      }
      if (name === 'PutCommand') {
        calls.puts.push(command);
        const key = command.input.Item;
        assert.equal(typeof key.revision, 'string', 'every accepted v2 value needs its own opaque revision');
        if (/#v2#/u.test(key.sk)) {
          assert.ok(key.kind === 'summary' && /#summary$/u.test(key.sk)
            || key.kind === 'period' && /#period$/u.test(key.sk)
            || key.kind === 'page' && /#page#\d+$/u.test(key.sk),
          `v2 cache kind and scoped sort key disagree: ${key.kind} ${key.sk}`);
        }
        const id = physicalCacheId(key);
        const current = items.get(id);
        if (current) assert.notEqual(key.revision, current.revision,
          'a successful replacement must receive a distinct revision from its predecessor');
        if (!conditionalPublicationAllowed(command.input, current)) {
          const error = new Error('ConditionalCheckFailedException');
          error.name = 'ConditionalCheckFailedException';
          error.$metadata = { httpStatusCode: 400 };
          onConditionalFailure?.({ command, current: current && structuredClone(current) });
          throw error;
        }
        items.set(id, structuredClone(key));
        return {};
      }
      throw new Error(`unexpected DynamoDB command ${name}`);
    },
  };
  return {
    cache: createCreatorStatisticsStore({
      profilesTableName: 'creator-profiles-test',
      propertyId,
      client,
    }),
    items,
    calls,
    client,
    setGetOverride(override) {
      getOverride = override;
    },
    setConditionalFailureHandler(handler) {
      onConditionalFailure = handler;
    },
    itemFor(key) {
      return physicalRowFor(items, key, propertyId);
    },
    deleteItem(key, { version = 2 } = {}) {
      items.delete(physicalCacheId(logicalStorageKey(key, { propertyId, version })));
    },
    rowsForKind(kind, key = {}) {
      const logical = { profileId: key.profileId, period: key.period, kind, ...(kind === 'page' ? { page: key.page } : {}) };
      const physical = logicalStorageKey(logical, { propertyId });
      const item = items.get(physicalCacheId(physical));
      return item === undefined ? [] : [structuredClone(item)];
    },
    putsForKind(kind, key = {}, { version = 2 } = {}) {
      return calls.puts.filter(({ input }) => {
        const logical = { profileId: key.profileId, period: key.period, kind, ...(kind === 'page' ? { page: key.page } : {}) };
        return physicalCacheId(input.Item) === physicalCacheId(logicalStorageKey(logical, { propertyId, version }));
      });
    },
  };
}

function cacheItemFor(key, envelope, { version = 2, revision = 'seed-revision', propertyId = '424203315' } = {}) {
  const logical = logicalCacheKey(key);
  const physical = logicalStorageKey(logical, { version, propertyId });
  return {
    ...physical,
    recordType: 'analyticsCache',
    profileId: logical.profileId,
    propertyId,
    period: logical.period,
    ...(logical.kind === 'page' ? { page: logical.page } : {}),
    ...(version === 1 ? {} : { kind: logical.kind, revision }),
    ...structuredClone(envelope),
    ttl: Math.ceil(envelope.retainUntil / 1000),
  };
}

function blockedReader(report, started) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return {
    reader: {
      async read(input) {
        started?.(input);
        await gate;
        return structuredClone(report(input));
      },
    },
    release,
  };
}

function summaryFor(input, now = INITIAL_NOW, overrides = {}) {
  const detail = reportFor({ ...input, page: 1 }, now, overrides);
  return {
    creatorId: input.profileId,
    period: input.period,
    range: detail.range,
    totals: structuredClone(detail.totals),
    warnings: structuredClone(detail.warnings),
    captureStartedAt: detail.captureStartedAt,
  };
}

async function runSharedRace({ completionOrder = ['a', 'b'], seeded = false, loserReread } = {}) {
  const key = { profileId: 'creator-race', period: 7, page: 1 };
  const initial = reportFor(key, INITIAL_NOW, { totals: { views: 1, visitors: 1, clicks: 1 } });
  const initialEnvelope = envelope(initial, {
    updatedAt: INITIAL_NOW - HOUR - 1,
    expiresAt: INITIAL_NOW - 1,
    retainUntil: INITIAL_NOW - HOUR - 1 + SEVEN_DAYS,
  });
  const fixture = createDynamoStatisticsFixture({
    initialItems: seeded ? [cacheItemFor(key, initialEnvelope)] : [],
  });
  let startedA;
  let startedB;
  const aGate = blockedReader(
    () => reportFor(key, INITIAL_NOW, { totals: { views: 101, visitors: 11, clicks: 1 } }),
    () => startedA?.(),
  );
  const bGate = blockedReader(
    () => reportFor(key, INITIAL_NOW, { totals: { views: 202, visitors: 22, clicks: 2 } }),
    () => startedB?.(),
  );
  const aStarted = new Promise((resolve) => { startedA = resolve; });
  const bStarted = new Promise((resolve) => { startedB = resolve; });
  let clockA = INITIAL_NOW;
  let clockB = INITIAL_NOW;
  const serviceA = api()({ reader: aGate.reader, cache: fixture.cache, now: () => clockA });
  const serviceB = api()({ reader: bGate.reader, cache: fixture.cache, now: () => clockB });
  if (loserReread) fixture.setConditionalFailureHandler(() => {
    fixture.setGetOverride((command) => loserReread(command));
  });

  const first = serviceA.read(key);
  const second = serviceB.read(key);
  await Promise.all([aStarted, bStarted]);
  const releaseByName = { a: aGate.release, b: bGate.release };
  let firstResult;
  let secondResult;
  for (const name of completionOrder) {
    if (name === 'a') {
      releaseByName.a();
      firstResult = await first;
      clockB = INITIAL_NOW + 15_000;
    } else {
      releaseByName.b();
      secondResult = await second;
      clockA = INITIAL_NOW + 15_000;
    }
  }
  if (!firstResult) firstResult = await first;
  if (!secondResult) secondResult = await second;
  return { key, fixture, firstResult, secondResult, initialEnvelope };
}

async function runSharedSummaryRace({ completionOrder = ['a', 'b'], loserReread } = {}) {
  const query = { profileId: 'creator-summary-race', period: 7 };
  const logical = { ...query, kind: 'summary' };
  const fixture = createDynamoStatisticsFixture();
  let startedA;
  let startedB;
  const aGate = blockedReader(
    () => summaryFor(query, INITIAL_NOW, { totals: { views: 401, visitors: 41, clicks: 4 } }),
    () => startedA?.(),
  );
  const bGate = blockedReader(
    () => summaryFor(query, INITIAL_NOW, { totals: { views: 402, visitors: 42, clicks: 4 } }),
    () => startedB?.(),
  );
  const aStarted = new Promise((resolve) => { startedA = resolve; });
  const bStarted = new Promise((resolve) => { startedB = resolve; });
  const serviceA = api()({
    reader: { read: aGate.reader.read, readSummary: aGate.reader.read },
    cache: fixture.cache,
    now: () => INITIAL_NOW,
  });
  const serviceB = api()({
    reader: { read: bGate.reader.read, readSummary: bGate.reader.read },
    cache: fixture.cache,
    now: () => INITIAL_NOW,
  });
  if (loserReread) fixture.setConditionalFailureHandler(() => {
    fixture.setGetOverride((command) => loserReread(command));
  });

  const first = serviceA.readSummary(query);
  const second = serviceB.readSummary(query);
  await Promise.all([aStarted, bStarted]);
  const releaseByName = { a: aGate.release, b: bGate.release };
  let firstResult;
  let secondResult;
  for (const name of completionOrder) {
    if (name === 'a') {
      releaseByName.a();
      firstResult = await first;
    } else {
      releaseByName.b();
      secondResult = await second;
    }
  }
  if (!firstResult) firstResult = await first;
  if (!secondResult) secondResult = await second;
  return { query, logical, fixture, firstResult, secondResult };
}

test('a cache miss returns a fresh report and stores the versioned envelope with bounded freshness and retention', async () => {
  const { calls, reader } = makeReader();
  const { service, cache } = makeService({ reader });

  const result = await service.read({ profileId: 'creator-a', period: 7 });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { profileId: 'creator-a', period: 7, page: 1 });
  assert.equal(result.state, 'ready');
  assert.equal(result.freshness, 'fresh');
  assert.equal(result.updatedAt, new Date(INITIAL_NOW).toISOString());
  assert.equal(result.creatorId, 'creator-a');
  assert.deepEqual(result.totals, { views: 12, visitors: 8, clicks: 3 });
  const pagePuts = pageCacheOperations(cache, 'puts', { profileId: 'creator-a', period: 7, page: 1 });
  assert.equal(pagePuts.length, 1);
  const saved = pagePuts[0].envelope;
  assert.equal(saved.schemaVersion, 1);
  assert.deepEqual(saved.report, reportFor({ profileId: 'creator-a', period: 7, page: 1 }));
  assert.equal(saved.updatedAt, INITIAL_NOW);
  assert.equal(saved.expiresAt, INITIAL_NOW + HOUR);
  assert.equal(saved.retainUntil, INITIAL_NOW + SEVEN_DAYS);
});

test('a new service instance reuses the shared cache without querying the provider or changing updatedAt', async () => {
  const cache = makeCache();
  const first = makeReader();
  const firstService = api()({ reader: first.reader, cache, now: () => INITIAL_NOW });
  const initial = await firstService.read({ profileId: 'creator-a', period: 7 });

  const second = makeReader(() => { throw new Error('provider should not be called for a fresh cache hit'); });
  const secondService = api()({ reader: second.reader, cache, now: () => INITIAL_NOW + 15 * 60 * 1000 });
  const cached = await secondService.read({ profileId: 'creator-a', period: 7 });

  assert.equal(first.calls.length, 1);
  assert.equal(second.calls.length, 0);
  assert.equal(cached.freshness, 'fresh');
  assert.equal(cached.updatedAt, initial.updatedAt);
  assert.deepEqual(cached.totals, initial.totals);
});

test('creator, period and page each partition the cache', async () => {
  const calls = [];
  const { service } = makeService({ reader: {
    async read(input) {
      calls.push(input);
      return reportFor(input, INITIAL_NOW, { totals: { views: calls.length, visitors: 0, clicks: 0 } });
    },
  } });
  const requests = [
    { profileId: 'creator-a', period: 7, page: 1 },
    { profileId: 'creator-b', period: 7, page: 1 },
    { profileId: 'creator-a', period: 30, page: 1 },
    { profileId: 'creator-a', period: 7, page: 2 },
  ];

  const firstPass = await Promise.all(requests.map((request) => service.read(request)));
  const secondPass = await Promise.all(requests.map((request) => service.read(request)));

  assert.equal(calls.length, requests.length);
  assert.deepEqual(firstPass.map(({ creatorId, period, page }) => [creatorId, period, page]), [
    ['creator-a', 7, 1], ['creator-b', 7, 1], ['creator-a', 30, 1], ['creator-a', 7, 2],
  ]);
  assert.deepEqual(secondPass.map(({ totals }) => totals.views), [1, 2, 3, 4]);
});

test('an entry refreshes after one hour and receives a new successful-read timestamp', async () => {
  let clock = INITIAL_NOW;
  const { calls, reader } = makeReader((input, index) => reportFor(input, clock, {
    totals: { views: index + 1, visitors: 0, clicks: 0 },
  }));
  const cache = makeCache();
  const service = api()({ reader, cache, now: () => clock });

  const first = await service.read({ profileId: 'creator-a', period: 7 });
  clock += HOUR;
  const refreshed = await service.read({ profileId: 'creator-a', period: 7 });

  assert.equal(calls.length, 2);
  assert.equal(first.totals.views, 1);
  assert.equal(refreshed.totals.views, 2);
  assert.equal(refreshed.freshness, 'fresh');
  assert.equal(refreshed.updatedAt, new Date(clock).toISOString());
  assert.equal(pageCacheOperations(cache, 'puts', { profileId: 'creator-a', period: 7, page: 1 }).at(-1).envelope.expiresAt, clock + HOUR);
});

test('a fresh entry whose date window ended at local midnight is refreshed using the property time zone', async () => {
  let clock = Date.parse('2026-10-24T06:50:00.000Z');
  const { calls, reader } = makeReader((input) => reportFor(input, clock));
  const cache = makeCache();
  const service = api()({ reader, cache, now: () => clock });

  const beforeMidnight = await service.read({ profileId: 'creator-a', period: 7 });
  assert.equal(beforeMidnight.range.endDate, '2026-10-23');
  clock = Date.parse('2026-10-24T07:10:00.000Z');
  const afterMidnight = await service.read({ profileId: 'creator-a', period: 7 });

  assert.equal(afterMidnight.range.endDate, '2026-10-24');
  assert.equal(calls.length, 2);
  assert.equal(afterMidnight.updatedAt, new Date(clock).toISOString());
});

test('an authenticated request after property midnight does not join a fresh result for the prior window', async () => {
  const beforeMidnight = Date.parse('2026-10-25T02:59:59.999Z');
  const afterMidnight = Date.parse('2026-10-25T03:00:00.001Z');
  let clock = beforeMidnight;
  let releaseGet;
  const getGate = new Promise((resolve) => { releaseGet = resolve; });
  let cacheGetStarted;
  const getStarted = new Promise((resolve) => { cacheGetStarted = resolve; });
  let pageCacheGets = 0;
  let periodCacheGets = 0;
  const query = { profileId: 'fixture-id-1', period: 7, page: 1 };
  const previous = reportFor(query, beforeMidnight, { timeZone: 'America/Buenos_Aires' });
  const cache = {
    async get(key) {
      if (key.kind === 'period') {
        periodCacheGets += 1;
        return undefined;
      }
      pageCacheGets += 1;
      cacheGetStarted();
      await getGate;
      return {
        ...envelope(previous, { updatedAt: beforeMidnight - 10 * 60 * 1000 }),
        revision: 'midnight-page-revision',
      };
    },
    async put() {},
  };
  const providerReads = [];
  const cachedStatistics = api()({
    reader: {
      async read(input) {
        providerReads.push(structuredClone(input));
        return reportFor(input, clock, { timeZone: 'America/Buenos_Aires' });
      },
    },
    cache,
    now: () => clock,
  });
  let statisticsReads = 0;
  let secondStatisticsRead;
  const secondReadStarted = new Promise((resolve) => { secondStatisticsRead = resolve; });
  const statistics = {
    read(input) {
      statisticsReads += 1;
      if (statisticsReads === 2) secondStatisticsRead();
      return cachedStatistics.read(input);
    },
  };
  const harness = await createCreatorPagesHarness({ statistics });
  const saved = await callApi(harness, '/api/creador/perfil', {
    session: 'creator-a',
    method: 'PUT',
    creatorContract: '2',
    csrf: sessionCsrf['creator-a'],
    body: { creatorVersion: null, displayName: 'Creador de prueba', slug: 'creador-de-prueba' },
  });
  assert.equal(saved.status, 200);
  const snapshotResponse = await callApi(harness, '/api/creador/perfil/', { session: 'creator-a' });
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await snapshotResponse.json();
  assert.equal(snapshot.schemaVersion, 2);
  const published = await callApi(harness, '/api/creador/perfil/publicar', {
    session: 'creator-a',
    method: 'POST',
    creatorContract: '2',
    csrf: sessionCsrf['creator-a'],
    body: { creatorVersion: snapshot.creatorVersion },
  });
  assert.equal(published.status, 200);

  const firstRequest = callApi(harness, '/api/creador/estadisticas/', { session: 'creator-a' });
  await getStarted;
  clock = afterMidnight;
  const secondRequest = callApi(harness, '/api/creador/estadisticas/', { session: 'creator-a' });
  await secondReadStarted;
  releaseGet();

  const [firstResponse, secondResponse] = await Promise.all([firstRequest, secondRequest]);
  const [first, second] = await Promise.all([firstResponse.json(), secondResponse.json()]);

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  assert.equal(first.freshness, 'fresh');
  assert.equal(second.freshness, 'fresh');
  assert.equal(first.range.endDate, '2026-10-25');
  assert.equal(second.range.endDate, '2026-10-25');
  assert.equal(pageCacheGets, 1, 'both authenticated requests should coalesce the exact page read');
  assert.equal(periodCacheGets, 1, 'the shared period predecessor is settled once after the page miss');
  assert.deepEqual(providerReads, [query], 'the prior-day cache value must trigger one current-window provider read');
});

test('a cache write that crosses property midnight gets one coalesced current-window re-read', async () => {
  const beforeMidnight = Date.parse('2026-10-25T02:59:59.999Z');
  const afterMidnight = Date.parse('2026-10-25T03:00:00.001Z');
  let clock = beforeMidnight;
  let cachePuts = 0;
  let pageCachePuts = 0;
  const { calls, reader } = makeReader((input) => reportFor(input, clock, {
    timeZone: 'America/Buenos_Aires',
  }));
  const cache = {
    async get() { return undefined; },
    async put(key) {
      cachePuts += 1;
      if (key.kind === 'page') pageCachePuts += 1;
      if (cachePuts === 1) clock = afterMidnight;
    },
  };
  const service = api()({ reader, cache, now: () => clock });

  const result = await service.read({ profileId: 'creator-a', period: 7 });

  assert.equal(calls.length, 2, 'only one bounded re-read should follow the midnight-crossing cache write');
  assert.equal(pageCachePuts, 1, 'the obsolete pre-rollover period publication must not publish a page');
  assert.equal(result.freshness, 'fresh');
  assert.equal(result.range.endDate, '2026-10-25');
});

test('provider failure returns the retained last success as stale without mutating or replacing its original window', async () => {
  let clock = INITIAL_NOW;
  let shouldFail = false;
  const cache = makeCache();
  const { calls, reader } = makeReader((input) => {
    if (shouldFail) throw new Error('GA4 unavailable');
    return reportFor(input, clock);
  });
  const service = api()({ reader, cache, now: () => clock });
  const original = await service.read({ profileId: 'creator-a', period: 7 });
  const stored = structuredClone(cache.values.get(identity({ profileId: 'creator-a', period: 7, page: 1 })));
  clock += HOUR + 1;
  shouldFail = true;

  const stale = await service.read({ profileId: 'creator-a', period: 7 });

  assert.equal(calls.length, 2);
  assert.equal(stale.state, 'ready');
  assert.equal(stale.freshness, 'stale');
  assert.equal(stale.updatedAt, original.updatedAt);
  assert.deepEqual(stale.range, original.range);
  assert.deepEqual(stale.totals, original.totals);
  assert.deepEqual(cache.values.get(identity({ profileId: 'creator-a', period: 7, page: 1 })), stored);
  assert.equal(pageCacheOperations(cache, 'puts', { profileId: 'creator-a', period: 7, page: 1 }).length, 1);
});

test('provider failure without a retained success rejects instead of inventing an empty report', async () => {
  const { reader } = makeReader(() => { throw new Error('GA4 unavailable'); });
  const { service } = makeService({ reader });

  await assert.rejects(service.read({ profileId: 'creator-a', period: 7 }));
});

test('an incomplete report with a nonnumeric total cannot overwrite the last success or replace it with zero', async () => {
  let clock = INITIAL_NOW;
  let malformed = false;
  const cache = makeCache();
  const { reader } = makeReader((input) => malformed
    ? reportFor(input, clock, { totals: { views: '0', visitors: 8, clicks: 3 }, warnings: ['incomplete provider payload'] })
    : reportFor(input, clock));
  const service = api()({ reader, cache, now: () => clock });
  const original = await service.read({ profileId: 'creator-a', period: 7 });
  const stored = structuredClone(cache.values.get(identity({ profileId: 'creator-a', period: 7, page: 1 })));
  clock += HOUR + 1;
  malformed = true;

  const fallback = await service.read({ profileId: 'creator-a', period: 7 });

  assert.equal(fallback.freshness, 'stale');
  assert.equal(fallback.updatedAt, original.updatedAt);
  assert.deepEqual(fallback.totals, original.totals);
  assert.deepEqual(cache.values.get(identity({ profileId: 'creator-a', period: 7, page: 1 })), stored);
  assert.equal(pageCacheOperations(cache, 'puts', { profileId: 'creator-a', period: 7, page: 1 }).length, 1);
});

test('real zero totals are valid provider data and remain cacheable', async () => {
  const { calls, reader } = makeReader((input) => reportFor(input, INITIAL_NOW, {
    totals: { views: 0, visitors: 0, clicks: 0 },
    links: { page: input.page, pageSize: 100, totalRows: 0, rows: [] },
    sources: [],
  }));
  const { service, cache } = makeService({ reader });
  const first = await service.read({ profileId: 'creator-a', period: 7 });
  const second = await service.read({ profileId: 'creator-a', period: 7 });

  assert.deepEqual(first.totals, { views: 0, visitors: 0, clicks: 0 });
  assert.deepEqual(second.totals, first.totals);
  assert.equal(calls.length, 1);
  assert.equal(pageCacheOperations(cache, 'puts', { profileId: 'creator-a', period: 7, page: 1 }).length, 1);
});

test('thresholded visit totals stay null with their warning and are cacheable', async () => {
  const warning = { section: 'visits', code: 'thresholding' };
  const { calls, reader } = makeReader((input) => reportFor(input, INITIAL_NOW, {
    totals: { views: null, visitors: null, clicks: 3 },
    warnings: [warning],
  }));
  const { service, cache } = makeService({ reader });

  const first = await service.read({ profileId: 'creator-a', period: 7 });
  const cached = await service.read({ profileId: 'creator-a', period: 7 });
  const preCaptureDays = first.daily.filter(({ date }) => date < '2026-10-23');

  assert.deepEqual(first.totals, { views: null, visitors: null, clicks: 3 });
  assert.deepEqual(first.warnings, [warning]);
  assert.ok(preCaptureDays.length > 0);
  assert.ok(preCaptureDays.every(({ views, clicks }) => views === null && clicks === null));
  assert.deepEqual(cached.totals, first.totals);
  assert.deepEqual(cached.warnings, [warning]);
  assert.equal(calls.length, 1);
  const pagePuts = pageCacheOperations(cache, 'puts', { profileId: 'creator-a', period: 7, page: 1 });
  assert.equal(pagePuts.length, 1);
  assert.deepEqual(pagePuts[0].envelope.report.totals, first.totals);
  assert.deepEqual(pagePuts[0].envelope.report.warnings, [warning]);
});

test('cache read and write outages do not turn an available provider result into an error', async (t) => {
  await t.test('read failure', async () => {
    const { calls, reader } = makeReader();
    const cache = makeCache();
    cache.failGet(new Error('DynamoDB read failed'));
    const { service } = makeService({ reader, cache });

    const result = await service.read({ profileId: 'creator-a', period: 7 });

    assert.equal(calls.length, 1);
    assert.equal(result.state, 'ready');
    assert.equal(result.freshness, 'fresh');
    assert.equal(result.creatorId, 'creator-a');
  });

  await t.test('write failure', async () => {
    const { calls, reader } = makeReader();
    const cache = makeCache();
    cache.failPut(new Error('DynamoDB write failed'));
    const { service } = makeService({ reader, cache });

    const result = await service.read({ profileId: 'creator-a', period: 7 });

    assert.equal(calls.length, 1);
    assert.equal(result.state, 'ready');
    assert.equal(result.freshness, 'fresh');
    assert.equal(result.creatorId, 'creator-a');
  });
});

test('mismatched cached creator, period, page or schema is never returned to the requester', async () => {
  const query = { profileId: 'creator-a', period: 7, page: 1 };
  const badEnvelopes = [
    envelope(reportFor(query, INITIAL_NOW, { creatorId: 'creator-b' })),
    envelope(reportFor(query, INITIAL_NOW, { period: 30 })),
    envelope(reportFor(query, INITIAL_NOW, { page: 2 })),
    { ...envelope(reportFor(query)), schemaVersion: 2 },
    { ...envelope(reportFor(query)), invalid: true },
  ];

  for (const invalid of badEnvelopes) {
    const cache = makeCache();
    cache.seed(query, invalid);
    const { calls, reader } = makeReader();
    const service = api()({ reader, cache, now: () => INITIAL_NOW });

    const result = await service.read(query);

    assert.equal(result.creatorId, query.profileId);
    assert.equal(result.period, query.period);
    assert.equal(result.page, query.page);
    assert.equal(calls.length, 1);
  }
});

test('an expired retention window cannot be used as stale fallback', async () => {
  const query = { profileId: 'creator-a', period: 7, page: 1 };
  const cache = makeCache();
  cache.seed(query, envelope(reportFor(query), {
    updatedAt: INITIAL_NOW - 8 * 24 * HOUR,
    expiresAt: INITIAL_NOW - 8 * 24 * HOUR + HOUR,
    retainUntil: INITIAL_NOW - 1,
  }));
  const { reader } = makeReader(() => { throw new Error('GA4 unavailable'); });
  const service = api()({ reader, cache, now: () => INITIAL_NOW });

  await assert.rejects(service.read(query));
});

test('simultaneous identical requests coalesce while requests for another creator stay isolated', async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const cache = makeCache();
  const reader = {
    async read(input) {
      calls.push(input);
      await gate;
      return reportFor(input);
    },
  };
  const service = api()({ reader, cache, now: () => INITIAL_NOW });

  const sameA1 = service.read({ profileId: 'creator-a', period: 7 });
  const sameA2 = service.read({ profileId: 'creator-a', period: 7 });
  const differentB = service.read({ profileId: 'creator-b', period: 7 });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [a1, a2, b] = await Promise.all([sameA1, sameA2, differentB]);

  assert.equal(calls.length, 2);
  assert.equal(a1.creatorId, 'creator-a');
  assert.equal(a2.creatorId, 'creator-a');
  assert.equal(b.creatorId, 'creator-b');
});

test('a rejected OAuth request releases shared reads for stale fallback and later recovery', async () => {
  const query = { profileId: 'creator-a', period: 7, page: 1 };
  const cache = makeCache();
  cache.seed(query, envelope(reportFor(query), {
    updatedAt: INITIAL_NOW - 2 * HOUR,
    expiresAt: INITIAL_NOW - HOUR,
    retainUntil: INITIAL_NOW - 2 * HOUR + SEVEN_DAYS,
  }));
  let rejectFirstToken;
  let tokenStarted;
  const firstTokenRequest = new Promise((_, reject) => { rejectFirstToken = reject; });
  const started = new Promise((resolve) => { tokenStarted = resolve; });
  let tokenRequests = 0;
  let reportRequests = 0;
  const tokenProvider = createGA4TokenProvider({
    loadCredentials: async () => structuredClone(TOKEN_CREDENTIALS),
    createAuth: () => ({
      getAccessToken: async () => {
        tokenRequests += 1;
        if (tokenRequests === 1) {
          tokenStarted();
          return firstTokenRequest;
        }
        return 'recovered-private-token';
      },
    }),
  });
  const reader = ga4Reader(tokenProvider, () => { reportRequests += 1; });
  const { service } = makeService({ reader, cache });

  const first = service.read(query);
  await started;
  const second = service.read(query);
  await new Promise((resolve) => setImmediate(resolve));
  rejectFirstToken(new Error('OAuth transport timed out'));

  const staleResults = await Promise.all([first, second]);
  assert.ok(staleResults.every(({ freshness }) => freshness === 'stale'));
  assert.equal(pageCacheOperations(cache, 'gets', query).length, 1, 'The matching page reads share one cache/provider operation.');
  assert.equal(tokenRequests, 1);
  assert.equal(reportRequests, 0, 'The reporting request waits for the rejected token transport.');

  const recovered = await service.read(query);
  assert.equal(recovered.freshness, 'fresh');
  assert.equal(tokenRequests, 2, 'A later read reaches the token provider after the rejected request.');
  assert.equal(reportRequests, 1);
  assert.equal(pageCacheOperations(cache, 'puts', { profileId: 'creator-a', period: 7, page: 1 }).length, 1);
  assert.deepEqual(recovered.totals, { views: 5, visitors: 3, clicks: 8 });
});

test('without retained data a rejected OAuth request reports unavailable and a later read recovers', async () => {
  const query = { profileId: 'creator-a', period: 7, page: 1 };
  let tokenRequests = 0;
  const tokenProvider = createGA4TokenProvider({
    loadCredentials: async () => structuredClone(TOKEN_CREDENTIALS),
    createAuth: () => ({
      getAccessToken: async () => {
        tokenRequests += 1;
        if (tokenRequests === 1) throw new Error('OAuth transport timed out');
        return 'recovered-private-token';
      },
    }),
  });
  let reportRequests = 0;
  const reader = ga4Reader(tokenProvider, () => { reportRequests += 1; });
  const { service, cache } = makeService({ reader });

  await assert.rejects(service.read(query), /GA4 statistics are temporarily unavailable\./);
  assert.equal(pageCacheOperations(cache, 'gets', query).length, 1);
  assert.equal(pageCacheOperations(cache, 'puts', query).length, 0);
  assert.equal(reportRequests, 0);

  const recovered = await service.read(query);
  assert.equal(recovered.freshness, 'fresh');
  assert.equal(tokenRequests, 2);
  assert.equal(reportRequests, 1);
  assert.equal(pageCacheOperations(cache, 'puts', { profileId: 'creator-a', period: 7, page: 1 }).length, 1);
});

test('independent service instances publish one winner from an absent predecessor in either completion order', async () => {
  for (const completionOrder of [['a', 'b'], ['b', 'a']]) {
    const { fixture, firstResult, secondResult } = await runSharedRace({ completionOrder });
    const winnerViews = completionOrder[0] === 'a' ? 101 : 202;
    assert.equal(firstResult.totals.views, winnerViews);
    assert.equal(secondResult.totals.views, winnerViews);
    assert.equal(firstResult.updatedAt, new Date(INITIAL_NOW).toISOString());
    assert.equal(secondResult.updatedAt, new Date(INITIAL_NOW).toISOString());
    assert.equal(fixture.putsForKind('page', { profileId: 'creator-race', period: 7, page: 1 }).length, 2,
      'both providers may attempt the requested page publication, but only one conditional write can win');
    assert.equal(fixture.itemFor({ profileId: 'creator-race', period: 7, page: 1 }).report.totals.views, winnerViews);
  }
});

test('an existing predecessor is conditionally replaced once, and a later refresh can replace that winner', async () => {
  const race = await runSharedRace({ completionOrder: ['b', 'a'], seeded: true });
  assert.equal(race.firstResult.totals.views, 202);
  assert.equal(race.secondResult.totals.views, 202);
  assert.equal(race.fixture.itemFor({ ...race.key, kind: 'page' }).report.totals.views, 202);

  let clock = INITIAL_NOW + 2 * HOUR;
  const laterReport = reportFor(race.key, clock, { totals: { views: 303, visitors: 33, clicks: 3 } });
  const later = api()({
    reader: { async read() { return laterReport; } },
    cache: race.fixture.cache,
    now: () => clock,
  });
  const refreshed = await later.read(race.key);

  assert.equal(refreshed.totals.views, 303);
  assert.equal(refreshed.updatedAt, new Date(clock).toISOString());
  assert.equal(race.fixture.itemFor({ ...race.key, kind: 'page' }).report.totals.views, 303);
  assert.notEqual(race.fixture.itemFor({ ...race.key, kind: 'page' }).revision, 'seed-revision');
});

test('an observed existing predecessor deleted before publication cannot authorize a replacement', async () => {
  const key = { profileId: 'creator-deleted-predecessor', period: 7, page: 1 };
  const staleEnvelope = envelope(reportFor(key, INITIAL_NOW, {
    totals: { views: 7, visitors: 1, clicks: 1 },
  }), {
    updatedAt: INITIAL_NOW - HOUR - 1,
    expiresAt: INITIAL_NOW - 1,
    retainUntil: INITIAL_NOW - HOUR - 1 + SEVEN_DAYS,
  });
  const fixture = createDynamoStatisticsFixture({
    initialItems: [cacheItemFor({ ...key, kind: 'page' }, staleEnvelope, { revision: 'existing-revision' })],
  });
  let started;
  const provider = blockedReader(
    () => reportFor(key, INITIAL_NOW, { totals: { views: 707, visitors: 70, clicks: 7 } }),
    () => started?.(),
  );
  const providerStarted = new Promise((resolve) => { started = resolve; });
  const service = api()({ reader: provider.reader, cache: fixture.cache, now: () => INITIAL_NOW });
  const request = service.read(key);
  await providerStarted;
  fixture.deleteItem({ ...key, kind: 'page' });
  provider.release();

  const result = await request;
  assert.equal(result.freshness, 'fresh');
  assert.equal(result.totals.views, 707, 'the usable uncached provider response remains available');
  assert.equal(fixture.itemFor({ ...key, kind: 'page' }), undefined,
    'deletion of the observed predecessor must not permit a replacement row');
  assert.equal(fixture.putsForKind('page', key).length, 1, 'the attempted page publication remains conditional');
});

test('a conditional loser rereads the scoped winner and returns its actual age', async () => {
  const race = await runSharedRace({ completionOrder: ['a', 'b'] });
  assert.equal(race.firstResult.totals.views, 101);
  assert.equal(race.secondResult.totals.views, 101);
  assert.equal(race.secondResult.updatedAt, race.firstResult.updatedAt);
  assert.equal(race.secondResult.freshness, 'fresh');
  assert.ok(race.fixture.calls.gets.length >= 3, 'the losing service must reread after conditional rejection');
});

test('a cold detail settles exact period and page predecessor reads before provider work begins', async () => {
  const query = { profileId: 'creator-deferred-predecessor', period: 7, page: 1 };
  const fixture = createDynamoStatisticsFixture();
  let releaseFirstGet;
  let releaseSecondGet;
  const firstGetGate = new Promise((resolve) => { releaseFirstGet = resolve; });
  const secondGetGate = new Promise((resolve) => { releaseSecondGet = resolve; });
  let firstGet;
  let secondGet;
  const firstGetStarted = new Promise((resolve) => { firstGet = resolve; });
  const secondGetStarted = new Promise((resolve) => { secondGet = resolve; });
  let getCount = 0;
  const getKeys = [];
  const getConsistency = [];
  fixture.setGetOverride(async (command) => {
    const sortKey = command.input.Key.sk;
    const requiredPredecessor = /#v2#7#period$/u.test(sortKey) || /#v2#7#page#1$/u.test(sortKey);
    if (!requiredPredecessor) return {};
    getCount += 1;
    getKeys.push(sortKey);
    getConsistency.push(command.input.ConsistentRead);
    if (getCount === 1) {
      firstGet();
      await firstGetGate;
    } else if (getCount === 2) {
      secondGet();
      await secondGetGate;
    }
    return {};
  });
  let providerStarted = false;
  const service = api()({
    reader: {
      async read(input) {
        providerStarted = true;
        return reportFor(input, INITIAL_NOW, { totals: { views: 808, visitors: 80, clicks: 8 } });
      },
    },
    cache: fixture.cache,
    now: () => INITIAL_NOW,
  });
  const request = service.read(query);
  await Promise.race([
    firstGetStarted,
    new Promise((_, reject) => setTimeout(() => reject(new Error('missing v2 predecessor reads')), 250)),
  ]);
  assert.equal(providerStarted, false, 'the provider must wait for all scoped predecessor reads');
  releaseFirstGet();
  await Promise.race([
    secondGetStarted,
    new Promise((_, reject) => setTimeout(() => reject(new Error('missing period predecessor read')), 250)),
  ]);
  assert.equal(providerStarted, false, 'the provider must wait until the second predecessor read settles');
  assert.ok(getConsistency.every((value) => value === true), 'both predecessor reads must request strong consistency');
  releaseSecondGet();
  const result = await request;
  assert.equal(result.totals.views, 808);
  assert.ok(getKeys.some((key) => /#v2#7#period$/u.test(key)));
  assert.ok(getKeys.some((key) => /#v2#7#page#1$/u.test(key)));
});

test('a loser preserves its provider response when winner reread is missing, invalid, or unavailable', async () => {
  const modes = {
    missing: () => ({}),
    invalid: (command) => ({
      Item: {
        pk: command.input.Key.pk,
        sk: command.input.Key.sk,
        recordType: 'analyticsCache',
        profileId: 'creator-race',
        propertyId: '424203315',
        period: 7,
        page: 1,
        revision: 'broken-revision',
        schemaVersion: 2,
        report: { creatorId: 'creator-race', period: 7, page: 1 },
        updatedAt: INITIAL_NOW,
        expiresAt: INITIAL_NOW + HOUR,
        retainUntil: INITIAL_NOW + SEVEN_DAYS,
      },
    }),
    unavailable: () => { throw new Error('DynamoDB reread unavailable'); },
  };

  for (const [mode, reread] of Object.entries(modes)) {
    const race = await runSharedRace({ completionOrder: ['a', 'b'], loserReread: reread });
    assert.equal(race.firstResult.totals.views, 101);
    assert.equal(race.secondResult.totals.views, 202, `${mode} loser reread must preserve the provider response`);
    assert.equal(race.secondResult.freshness, 'fresh');
    assert.equal(race.fixture.itemFor({ ...race.key, kind: 'page' }).report.totals.views, 101,
      `${mode} reread must not authorize a second publication`);
    assert.equal(race.fixture.putsForKind('page', race.key).length, 2,
      `${mode} loser reread must leave the requested page cache untouched`);
  }
});

test('an invalid or unavailable initial predecessor has no publication authority', async () => {
  const key = { profileId: 'creator-invalid-predecessor', period: 7, page: 1 };
  const malformed = cacheItemFor(key, {
    ...envelope(reportFor(key), { updatedAt: INITIAL_NOW, expiresAt: INITIAL_NOW + HOUR, retainUntil: INITIAL_NOW + SEVEN_DAYS }),
    report: { creatorId: key.profileId, period: 7, page: 1 },
  }, { revision: 'malformed-revision' });
  const invalidFixture = createDynamoStatisticsFixture({ initialItems: [malformed] });
  const invalidService = api()({
    reader: { async read() { return reportFor(key, INITIAL_NOW, { totals: { views: 909, visitors: 9, clicks: 9 } }); } },
    cache: invalidFixture.cache,
    now: () => INITIAL_NOW + 2 * HOUR,
  });
  const invalidResult = await invalidService.read(key);
  assert.equal(invalidResult.totals.views, 909);
  assert.equal(
    invalidFixture.putsForKind('page', key).length + invalidFixture.putsForKind('page', key, { version: 1 }).length,
    0,
    'invalid predecessor must not authorize a page write',
  );

  const unavailableFixture = createDynamoStatisticsFixture();
  unavailableFixture.setGetOverride(() => { throw new Error('DynamoDB predecessor read unavailable'); });
  const unavailableService = api()({
    reader: { async read() { return reportFor(key, INITIAL_NOW, { totals: { views: 919, visitors: 19, clicks: 9 } }); } },
    cache: unavailableFixture.cache,
    now: () => INITIAL_NOW,
  });
  const unavailableResult = await unavailableService.read(key);
  assert.equal(unavailableResult.totals.views, 919);
  assert.equal(
    unavailableFixture.putsForKind('page', key).length + unavailableFixture.putsForKind('page', key, { version: 1 }).length,
    0,
    'unavailable predecessor must not authorize a page write',
  );
});

test('independent summary service instances use the summary v2 kind and converge on the first conditional winner', async () => {
  for (const completionOrder of [['a', 'b'], ['b', 'a']]) {
    const race = await runSharedSummaryRace({ completionOrder });
    const winnerViews = completionOrder[0] === 'a' ? 401 : 402;
    assert.equal(race.firstResult.totals.views, winnerViews);
    assert.equal(race.secondResult.totals.views, winnerViews);
    assert.equal(race.firstResult.updatedAt, new Date(INITIAL_NOW).toISOString());
    assert.equal(race.secondResult.updatedAt, new Date(INITIAL_NOW).toISOString());
    const row = race.fixture.itemFor(race.logical);
    assert.ok(row, 'the logical summary predecessor must be persisted');
    assert.match(row.sk, /#v2#7#summary$/u);
    assert.equal(row.report.totals.views, winnerViews);
    assert.ok(race.fixture.putsForKind('summary', race.query).length >= 1);
    assert.equal(race.fixture.putsForKind('page', { ...race.query, page: 1 }).length, 0,
      'summary publication must not masquerade as a requested link page');
  }
});

test('concurrent detail pages share one conditionally accepted period component while retaining distinct page rows', async () => {
  const queryA = { profileId: 'creator-period-race', period: 7, page: 1 };
  const queryB = { profileId: 'creator-period-race', period: 7, page: 2 };
  const fixture = createDynamoStatisticsFixture();
  let releaseA;
  let releaseB;
  let startA;
  let startB;
  const gateA = new Promise((resolve) => { releaseA = resolve; });
  const gateB = new Promise((resolve) => { releaseB = resolve; });
  const startedA = new Promise((resolve) => { startA = resolve; });
  const startedB = new Promise((resolve) => { startB = resolve; });
  const readerA = {
    async read(input) {
      startA();
      await gateA;
      return reportFor(input, INITIAL_NOW, { totals: { views: 501, visitors: 51, clicks: 5 } });
    },
  };
  const readerB = {
    async read(input) {
      startB();
      await gateB;
      return reportFor(input, INITIAL_NOW, { totals: { views: 502, visitors: 52, clicks: 5 } });
    },
  };
  const serviceA = api()({ reader: readerA, cache: fixture.cache, now: () => INITIAL_NOW });
  const serviceB = api()({ reader: readerB, cache: fixture.cache, now: () => INITIAL_NOW });
  const first = serviceA.read(queryA);
  const second = serviceB.read(queryB);
  await Promise.all([startedA, startedB]);

  releaseB();
  const pageB = await second;
  releaseA();
  const pageA = await first;

  assert.equal(pageB.page, 2);
  assert.equal(pageA.page, 1);
  assert.equal(pageB.totals.views, 502);
  assert.ok([501, 502].includes(pageA.totals.views), 'page 1 may use its uncached report or the accepted common-period result');
  const common = fixture.itemFor({ profileId: queryA.profileId, period: queryA.period, kind: 'period' });
  assert.ok(common, 'detail reads must persist the shared period component');
  assert.match(common.sk, /#v2#7#period$/u);
  assert.equal(common.report.totals.views, 502, 'the first completed common-period write is the authority');
  assert.ok(fixture.putsForKind('period', queryA).length >= 1);
  assert.equal(fixture.putsForKind('page', queryA).length, 1);
  assert.equal(fixture.putsForKind('page', queryB).length, 1);
});

test('new scoped cache keys prefer v2 and retain v1 only as a time-limited fallback', async () => {
  const key = { profileId: 'creator-legacy', period: 30, page: 2 };
  const legacyEnvelope = envelope(reportFor(key, INITIAL_NOW, {
    totals: { views: 11, visitors: 1, clicks: 1 },
  }));
  const legacyRow = cacheItemFor(key, legacyEnvelope, { version: 1 });
  const fixture = createDynamoStatisticsFixture({ initialItems: [legacyRow] });
  const fixtureTime = INITIAL_NOW + 60_000;

  let providerFailed = true;
  const staleService = api()({
    reader: {
      async read(input) {
        if (providerFailed) throw new Error('GA4 unavailable');
        return reportFor(input, fixtureTime, { totals: { views: 22, visitors: 2, clicks: 2 } });
      },
    },
    cache: fixture.cache,
    now: () => fixtureTime,
  });
  const stale = await staleService.read(key);
  assert.equal(stale.freshness, 'stale');
  assert.equal(stale.totals.views, 11);
  assert.ok(fixture.calls.gets.some(({ input }) => /#v2#/u.test(input.Key.sk)));
  assert.ok(fixture.calls.gets.some(({ input }) => /#v1#/u.test(input.Key.sk)),
    'the service must exercise bounded v1 fallback rather than a direct adapter read');
  assert.equal(fixture.putsForKind('page', key).length, 0,
    'a legacy fallback after provider failure cannot authorize a v2 page write');
  assert.equal(fixture.putsForKind('page', key, { version: 1 }).length, 0,
    'a legacy fallback after provider failure cannot rewrite the v1 row');
  assert.deepEqual(fixture.items.get(physicalCacheId(legacyRow)), legacyRow);

  providerFailed = false;
  const current = await staleService.read(key);
  assert.equal(current.freshness, 'fresh');
  assert.equal(current.totals.views, 22);
  assert.equal(fixture.putsForKind('page', key).length, 1);
  assert.deepEqual(fixture.items.get(physicalCacheId(legacyRow)), legacyRow);
  assert.equal(fixture.itemFor({ ...key, kind: 'page' }).report.totals.views, 22);

  const expiredAt = INITIAL_NOW - 8 * 24 * HOUR;
  const expired = cacheItemFor(key, envelope(reportFor(key, expiredAt), { updatedAt: expiredAt }), { version: 1 });
  const expiredFixture = createDynamoStatisticsFixture({ initialItems: [expired] });
  let providerCalls = 0;
  const expiredService = api()({
    reader: {
      async read() {
        providerCalls += 1;
        throw new Error('GA4 unavailable');
      },
    },
    cache: expiredFixture.cache,
    now: () => INITIAL_NOW,
  });
  await assert.rejects(expiredService.read(key), /unavailable/iu,
    'even during an outage, a legacy row past retention cannot become a ready result');
  assert.equal(providerCalls, 1);
  assert.equal(expiredFixture.calls.puts.length, 0);
  assert.deepEqual(expiredFixture.items.get(physicalCacheId(expired)), expired);
});

test('the real store keeps predecessor authority isolated by creator, period, and page', async () => {
  const fixture = createDynamoStatisticsFixture();
  const requests = [
    { profileId: 'creator-scope-a', period: 7, page: 1 },
    { profileId: 'creator-scope-a', period: 7, page: 2 },
    { profileId: 'creator-scope-a', period: 30, page: 1 },
    { profileId: 'creator-scope-b', period: 7, page: 1 },
  ];
  const service = api()({
    reader: {
      async read(input) {
        return reportFor(input, INITIAL_NOW, { totals: { views: input.page + input.period, visitors: 0, clicks: 0 } });
      },
    },
    cache: fixture.cache,
    now: () => INITIAL_NOW,
  });
  const results = await Promise.all(requests.map((request) => service.read(request)));
  assert.deepEqual(results.map(({ creatorId, period, page, totals }) => [creatorId, period, page, totals.views]), [
    ['creator-scope-a', 7, 1, 8],
    ['creator-scope-a', 7, 2, 9],
    ['creator-scope-a', 30, 1, 31],
    ['creator-scope-b', 7, 1, 8],
  ]);
  for (const request of requests) {
    const row = fixture.itemFor({ ...request, kind: 'page' });
    assert.ok(row, `the exact page key must be retained for ${request.profileId}/${request.period}/${request.page}`);
    assert.match(row.sk, new RegExp(`#v2#${request.period}#page#${request.page}$`, 'u'));
  }
});

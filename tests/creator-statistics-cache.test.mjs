import assert from 'node:assert/strict';
import test from 'node:test';
import { callApi, createCreatorPagesHarness, sessionCsrf } from './fixtures/creator-pages.mjs';

const moduleResult = await import('../src/lib/creator-statistics.mjs').then(
  (value) => ({ value }),
  (error) => ({ error }),
);

const HOUR = 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * HOUR;
const INITIAL_NOW = Date.parse('2026-10-24T02:30:00.000Z');

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
    return JSON.stringify([key.profileId, key.period, key.page ?? 1]);
  }
  return String(key);
}

function makeCache() {
  const values = new Map();
  const calls = { gets: [], puts: [] };
  let getError;
  let putError;
  return {
    values,
    calls,
    failGet(error) { getError = error; },
    failPut(error) { putError = error; },
    seed(query, envelope) { values.set(identity(query), structuredClone(envelope)); },
    async get(query) {
      calls.gets.push(structuredClone(query));
      if (getError) throw getError;
      const value = values.get(identity(query));
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(key, envelope) {
      calls.puts.push({ key: structuredClone(key), envelope: structuredClone(envelope) });
      if (putError) throw putError;
      values.set(identity(key), structuredClone(envelope));
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
  assert.equal(cache.calls.puts.length, 1);
  const saved = cache.calls.puts[0].envelope;
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
  assert.equal(cache.calls.puts.at(-1).envelope.expiresAt, clock + HOUR);
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
  let cacheGets = 0;
  const query = { profileId: 'fixture-id-1', period: 7, page: 1 };
  const previous = reportFor(query, beforeMidnight, { timeZone: 'America/Buenos_Aires' });
  const cache = {
    async get() {
      cacheGets += 1;
      cacheGetStarted();
      await getGate;
      return envelope(previous, { updatedAt: beforeMidnight - 10 * 60 * 1000 });
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
    csrf: sessionCsrf['creator-a'],
    body: { displayName: 'Creador de prueba', slug: 'creador-de-prueba' },
  });
  assert.equal(saved.status, 200);
  const published = await callApi(harness, '/api/creador/perfil/publicar', {
    session: 'creator-a',
    method: 'POST',
    csrf: sessionCsrf['creator-a'],
    body: {},
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
  assert.equal(cacheGets, 1, 'both authenticated requests should coalesce the same cache read');
  assert.deepEqual(providerReads, [query], 'the prior-day cache value must trigger one current-window provider read');
});

test('a cache write that crosses property midnight gets one coalesced current-window re-read', async () => {
  const beforeMidnight = Date.parse('2026-10-25T02:59:59.999Z');
  const afterMidnight = Date.parse('2026-10-25T03:00:00.001Z');
  let clock = beforeMidnight;
  let cachePuts = 0;
  const { calls, reader } = makeReader((input) => reportFor(input, clock, {
    timeZone: 'America/Buenos_Aires',
  }));
  const cache = {
    async get() { return undefined; },
    async put() {
      cachePuts += 1;
      if (cachePuts === 1) clock = afterMidnight;
    },
  };
  const service = api()({ reader, cache, now: () => clock });

  const result = await service.read({ profileId: 'creator-a', period: 7 });

  assert.equal(calls.length, 2, 'only one bounded re-read should follow the midnight-crossing cache write');
  assert.equal(cachePuts, 2);
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
  assert.equal(cache.calls.puts.length, 1);
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
  assert.equal(cache.calls.puts.length, 1);
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
  assert.equal(cache.calls.puts.length, 1);
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
  assert.deepEqual(cache.calls.puts[0].envelope.report.totals, first.totals);
  assert.deepEqual(cache.calls.puts[0].envelope.report.warnings, [warning]);
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

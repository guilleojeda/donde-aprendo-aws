import assert from 'node:assert/strict';
import test from 'node:test';
import { createGA4StatisticsReader } from '../src/lib/creator-statistics-ga4.mjs';
import { createCachedCreatorStatistics } from '../src/lib/creator-statistics.mjs';

const PROPERTY = '424203315';
const PROFILE = 'creator-report-work-a';
const OTHER_PROFILE = 'creator-report-work-b';
const CAPTURE_START = '2026-10-23T23:38:00Z';
const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const NOW = Date.parse('2026-10-24T15:00:00.000Z');
const RANGE = { startDate: '2026-10-18', endDate: '2026-10-24', timeZone: TIME_ZONE };
const RANGE_30 = { startDate: '2026-09-25', endDate: '2026-10-24', timeZone: TIME_ZONE };
const PROFILE_TOTALS = { views: 111, visitors: 17, clicks: 222 };
const OTHER_TOTALS = { views: 411, visitors: 37, clicks: 522 };

function fixtureData(profileId, period) {
  const totals = profileId === PROFILE && period === 7 ? PROFILE_TOTALS : OTHER_TOTALS;
  const linkRows = Array.from({ length: 250 }, (_, index) => ({
    linkId: `${profileId}-p${period}-link-${String(index).padStart(3, '0')}`,
    clicks: index + period,
  }));
  const sourceRows = Array.from({ length: 250 }, (_, index) => {
    const sourceMedium = index === 0
      ? ''
      : index === 50
        ? '(direct) / (none)'
        : index === 200
          ? '(not set)'
          : `${profileId}-p${period}-source-${String(index).padStart(3, '0')} / referral`;
    return {
      sourceMedium,
      views: sourceMedium === '' || sourceMedium === '(direct) / (none)' || sourceMedium === '(not set)'
        ? 300
        : 10 + (index % 3),
    };
  });
  const groups = new Map();
  for (const { sourceMedium, views } of sourceRows) {
    const normalized = sourceMedium === '' || sourceMedium === '(not set)' || sourceMedium === '(direct) / (none)'
      ? 'Directo o sin origen identificable'
      : sourceMedium;
    groups.set(normalized, (groups.get(normalized) ?? 0) + views);
  }
  const sources = [...groups]
    .map(([sourceMedium, views]) => ({ sourceMedium, views }))
    .sort((left, right) => right.views - left.views || left.sourceMedium.localeCompare(right.sourceMedium))
    .slice(0, 10);
  return { totals, linkRows, sourceRows, sources, range: period === 7 ? RANGE : RANGE_30 };
}

const PRIMARY_DATA = fixtureData(PROFILE, 7);

function createService(options) {
  const service = createCachedCreatorStatistics(options);
  assert.equal(typeof service.read, 'function', 'statistics service must retain detail reads');
  return service;
}

function requireSummary(service) {
  assert.equal(typeof service.readSummary, 'function',
    'statistics service must expose the first-class summary operation');
  return service;
}

function cacheIdentity(key) {
  if (typeof key === 'string') return key;
  assert.ok(key && typeof key === 'object');
  const kindValue = key.kind ?? (Object.hasOwn(key, 'page') ? 'page' : 'summary');
  return JSON.stringify({
    profileId: key.profileId,
    period: key.period,
    kind: kindValue,
    ...(kindValue === 'page' ? { page: key.page } : {}),
  });
}

function createCache() {
  const values = new Map();
  const calls = { gets: [], puts: [] };
  let revision = 0;
  return {
    values,
    calls,
    async get(key) {
      calls.gets.push(structuredClone(key));
      const value = values.get(cacheIdentity(key));
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(key, envelope) {
      calls.puts.push({ key: structuredClone(key), envelope: structuredClone(envelope) });
      values.set(cacheIdentity(key), {
        ...structuredClone(envelope),
        revision: `memory-revision-${revision += 1}`,
      });
    },
  };
}

function nonPageCachePuts(cache) {
  return cache.calls.puts.filter(({ key }) => {
    const kindValue = key?.kind ?? (Object.hasOwn(key ?? {}, 'page') ? 'page' : 'summary');
    return kindValue !== 'page';
  });
}

function row(dimensionValues, metricValues) {
  return {
    dimensionValues: dimensionValues.map((value) => ({ value })),
    metricValues: metricValues.map((value) => ({ value: String(value) })),
  };
}

function kind(query) {
  const dimensions = query.dimensions?.map(({ name }) => name) ?? [];
  if (dimensions.includes('customEvent:link_id')) return 'links';
  if (dimensions.includes('sessionSourceMedium')) return 'sources';
  if (dimensions.includes('date')) return 'daily';
  return query.metrics?.some(({ name }) => name === 'totalUsers') ? 'visits' : 'clicks';
}

function dateRangeFor(query) {
  const range = query.dateRanges?.[0];
  assert.ok(range, 'every GA4 report must carry a date range');
  if (range.startDate === '6daysAgo' && range.endDate === 'today') return RANGE;
  if (range.startDate === '29daysAgo' && range.endDate === 'today') return RANGE_30;
  const start = Date.parse(`${range.startDate}T00:00:00.000Z`);
  const end = Date.parse(`${range.endDate}T00:00:00.000Z`);
  const days = Math.round((end - start) / 86_400_000) + 1;
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && (days === 7 || days === 30),
    'an absolute GA4 report must carry a complete 7- or 30-day window');
  return { startDate: range.startDate, endDate: range.endDate, timeZone: TIME_ZONE };
}

function creatorFor(query) {
  return query.dimensionFilter?.andGroup?.expressions
    ?.find(({ filter }) => filter?.fieldName === 'customEvent:creator_id')?.filter?.stringFilter?.value
    ?? PROFILE;
}

function reportFor(query, { sourceRows, linkRows } = {}) {
  const dimensions = query.dimensions?.map(({ name }) => name) ?? [];
  const metrics = query.metrics.map(({ name }) => name);
  const report = {
    dimensionHeaders: dimensions.map((name) => ({ name })),
    metricHeaders: metrics.map((name) => ({ name, type: 'TYPE_INTEGER' })),
    rows: [],
    rowCount: 0,
    metadata: { timeZone: TIME_ZONE },
    propertyQuota: { tokensPerHour: { consumed: 10, remaining: 39_990 } },
  };
  const range = dateRangeFor(query);
  const period = Math.round((Date.parse(`${range.endDate}T00:00:00.000Z`)
    - Date.parse(`${range.startDate}T00:00:00.000Z`)) / 86_400_000) + 1;
  const data = fixtureData(creatorFor(query), period);
  const totals = data.totals;
  sourceRows ??= data.sourceRows;
  linkRows ??= data.linkRows;

  if (kind(query) === 'visits') {
    report.rows = [row([], metrics.map((name) => name === 'totalUsers' ? totals.visitors : totals.views))];
    report.rowCount = 1;
  } else if (kind(query) === 'clicks') {
    report.rows = [row([], [totals.clicks])];
    report.rowCount = 1;
  } else if (kind(query) === 'daily') {
    report.rows = Array.from({ length: period }, (_, index) => {
      const date = new Date(`${range.startDate}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + index);
      const dateValue = date.toISOString().slice(0, 10).replaceAll('-', '');
      return [
        row([dateValue, 'creator_view'], [10 + index]),
        row([dateValue, 'creator_link_click'], [20 + index]),
      ];
    }).flat();
    report.rowCount = report.rows.length;
  } else if (kind(query) === 'links') {
    const offset = Number(query.offset ?? 0);
    const selected = linkRows.slice(offset, offset + 100);
    report.rows = selected.map(({ linkId, clicks }) => row([linkId], [clicks]));
    report.rowCount = linkRows.length;
  } else {
    const offset = Number(query.offset ?? 0);
    const selected = sourceRows.slice(offset, offset + 100);
    report.rows = selected.map(({ sourceMedium, views }) => row([sourceMedium], [views]));
    report.rowCount = sourceRows.length;
  }
  return report;
}

function createTransport({ sourceRows, linkRows, mutate, failQuery } = {}) {
  const calls = [];
  let sourceRowsProcessed = 0;
  let shouldFail = false;
  const fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const requestQueries = url.endsWith(':batchRunReports') ? body.requests : [body];
    assert.ok(Array.isArray(requestQueries), 'GA4 transport body must be a batch or report query');
    const request = { url: String(url), body: structuredClone(body), queries: structuredClone(requestQueries) };
    calls.push(request);
    if (shouldFail || failQuery?.(requestQueries)) return Response.json({ error: { code: 503 } }, { status: 503 });

    const reports = requestQueries.map((query, index) => {
      const report = reportFor(query, { sourceRows, linkRows });
      if (kind(query) === 'sources') sourceRowsProcessed += report.rows.length;
      const queryRange = dateRangeFor(query);
      const period = Math.round((Date.parse(`${queryRange.endDate}T00:00:00.000Z`)
        - Date.parse(`${queryRange.startDate}T00:00:00.000Z`)) / 86_400_000) + 1;
      const pageSourceRows = sourceRows ?? fixtureData(creatorFor(query), period).sourceRows;
      return mutate ? mutate(report, {
        query, index, request, calls, sourceRows: pageSourceRows,
      }) ?? report : report;
    });
    if (url.endsWith(':batchRunReports')) return Response.json({ reports });
    return Response.json(reports[0]);
  };
  return {
    fetch,
    calls,
    sourceRowsProcessed: () => sourceRowsProcessed,
    fail() { shouldFail = true; },
    logicalReports() {
      return calls.reduce((total, call) => total + call.queries.length, 0);
    },
  };
}

function createHarness({ transport = createTransport(), clock = { value: NOW } } = {}) {
  const reader = createGA4StatisticsReader({
    propertyId: PROPERTY,
    captureStartedAt: CAPTURE_START,
    now: () => clock.value,
    getAccessToken: async () => 'fixture-private-access-token',
    fetch: transport.fetch,
  });
  const cache = createCache();
  const service = createService({ reader, cache, now: () => clock.value });
  return { reader, service, cache, transport, clock };
}

function assertSummary(summary, {
  creatorId = PROFILE,
  period = 7,
  data = fixtureData(creatorId, period),
} = {}) {
  assert.equal(summary.state, 'ready');
  assert.deepEqual(Object.keys(summary).sort(), [
    'captureStartedAt', 'creatorId', 'freshness', 'period', 'range', 'state', 'totals', 'updatedAt', 'warnings',
  ]);
  assert.equal(summary.creatorId, creatorId);
  assert.equal(summary.period, period);
  assert.deepEqual(summary.range, data.range);
  assert.deepEqual(summary.totals, data.totals);
  assert.equal(summary.captureStartedAt, CAPTURE_START);
  assert.deepEqual(summary.warnings, []);
  assert.equal(summary.freshness, 'fresh');
  assert.equal(typeof summary.updatedAt, 'string');
}

function assertDetail(detail, page, {
  creatorId = PROFILE,
  period = 7,
  data = fixtureData(creatorId, period),
} = {}) {
  assert.equal(detail.state, 'ready');
  assert.equal(detail.creatorId, creatorId);
  assert.equal(detail.period, period);
  assert.equal(detail.page, page);
  assert.deepEqual(detail.range, data.range);
  assert.deepEqual(detail.totals, data.totals);
  assert.deepEqual(detail.daily, Array.from({ length: period }, (_, index) => ({
    date: (() => {
      const date = new Date(`${data.range.startDate}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    })(),
    views: index < period - 2 ? null : 10 + index,
    clicks: index < period - 2 ? null : 20 + index,
  })));
  assert.deepEqual(detail.sources, data.sources);
  const offset = (page - 1) * 100;
  assert.deepEqual(detail.links, {
    page,
    pageSize: 100,
    totalRows: 250,
    rows: data.linkRows.slice(offset, offset + 100),
  });
  assert.deepEqual(detail.warnings, []);
}

function assertCreatorFilter(query, creatorId = PROFILE) {
  const expressions = query.dimensionFilter?.andGroup?.expressions ?? [];
  const creator = expressions.find(({ filter }) => filter?.fieldName === 'customEvent:creator_id');
  assert.deepEqual(creator?.filter, {
    fieldName: 'customEvent:creator_id',
    stringFilter: { matchType: 'EXACT', value: creatorId, caseSensitive: true },
  });
}

function assertReportScope(query, creatorId = PROFILE) {
  assertCreatorFilter(query, creatorId);
  const expressions = query.dimensionFilter.andGroup.expressions;
  const event = expressions.find(({ filter }) => filter.fieldName === 'eventName')?.filter;
  if (kind(query) === 'daily') {
    assert.deepEqual(event, {
      fieldName: 'eventName',
      inListFilter: { values: ['creator_view', 'creator_link_click'], caseSensitive: true },
    });
  } else {
    assert.deepEqual(event, {
      fieldName: 'eventName',
      stringFilter: {
        matchType: 'EXACT',
        value: kind(query) === 'links' || kind(query) === 'clicks' ? 'creator_link_click' : 'creator_view',
        caseSensitive: true,
      },
    });
  }
  assert.equal(query.returnPropertyQuota, true);
}

async function readWithoutBadReady(read) {
  try {
    return await read();
  } catch {
    return undefined;
  }
}

test('cold summary then detail pages 1–3 reuses common work and independently preserves totals, sources and links', async () => {
  const harness = createHarness();
  requireSummary(harness.service);
  const summary = await harness.service.readSummary({ profileId: PROFILE, period: 7 });
  assertSummary(summary, { data: PRIMARY_DATA });

  // The first cold detail can establish a newer common confirmation than the
  // totals-only summary. Later link pages must reuse that common result.
  harness.clock.value += 10 * 60 * 1000;
  const detail1 = await harness.service.read({ profileId: PROFILE, period: 7, page: 1 });
  assertDetail(detail1, 1, { data: PRIMARY_DATA });
  assert.equal(detail1.freshness, 'fresh');
  assert.ok(Date.parse(detail1.updatedAt) >= Date.parse(summary.updatedAt));

  const summaryAgeBeforePaging = summary.updatedAt;
  const periodAgeBeforePaging = detail1.updatedAt;
  const commonPutsBeforePaging = structuredClone(nonPageCachePuts(harness.cache));
  const p2Start = harness.transport.calls.length;
  harness.clock.value += 5 * 60 * 1000;
  const detail2 = await harness.service.read({ profileId: PROFILE, period: 7, page: 2 });
  assertDetail(detail2, 2, { data: PRIMARY_DATA });
  assert.equal(detail2.updatedAt, periodAgeBeforePaging,
    'page 2 uses the established common period confirmation');
  assert.equal(detail2.freshness, 'fresh');
  const p2Queries = harness.transport.calls.slice(p2Start).flatMap(({ queries }) => queries);
  assert.equal(p2Queries.length, 1, 'page 2 performs one bounded link report');
  assert.equal(kind(p2Queries[0]), 'links');
  assert.equal(Number(p2Queries[0].offset), 100);

  const p3Start = harness.transport.calls.length;
  harness.clock.value += 5 * 60 * 1000;
  const detail3 = await harness.service.read({ profileId: PROFILE, period: 7, page: 3 });
  assertDetail(detail3, 3, { data: PRIMARY_DATA });
  assert.equal(detail3.updatedAt, periodAgeBeforePaging,
    'page 3 uses the same common period confirmation as page 2');
  assert.equal(detail3.freshness, 'fresh');
  const p3Queries = harness.transport.calls.slice(p3Start).flatMap(({ queries }) => queries);
  assert.equal(p3Queries.length, 1, 'page 3 performs one bounded link report');
  assert.equal(kind(p3Queries[0]), 'links');
  assert.equal(Number(p3Queries[0].offset), 200);
  assert.equal(summary.updatedAt, summaryAgeBeforePaging,
    'paging does not change the already returned summary timestamp');
  assert.deepEqual(nonPageCachePuts(harness.cache), commonPutsBeforePaging,
    'link-only paging does not rewrite the summary or common period cache rows');

  const logicalReportsBeforeCachedPage = harness.transport.logicalReports();
  const cachedPage = await harness.service.read({ profileId: PROFILE, period: 7, page: 1 });
  assertDetail(cachedPage, 1, { data: PRIMARY_DATA });
  assert.equal(cachedPage.updatedAt, detail1.updatedAt);
  assert.equal(harness.transport.logicalReports(), logicalReportsBeforeCachedPage,
    'a fresh cached page 1 must not repeat a provider report');

  assert.equal(harness.transport.sourceRowsProcessed(), 250,
    'cold common work must process the 250 raw source rows once, not once per link page');
  assert.ok(harness.transport.logicalReports() <= 11,
    `cold summary plus three pages exceeded the approved bound: ${harness.transport.logicalReports()} reports`);
  for (const call of harness.transport.calls) {
    assert.match(call.url, new RegExp(`/properties/${PROPERTY}:`));
  }
  const allQueries = harness.transport.calls.flatMap(({ queries }) => queries);
  for (const query of allQueries) {
    assertReportScope(query);
    dateRangeFor(query);
  }
  assert.ok(allQueries.every(({ dateRanges }) => {
    const queryRange = dateRangeFor({ dateRanges });
    return queryRange.startDate === RANGE.startDate
      && queryRange.endDate === RANGE.endDate
      && queryRange.timeZone === RANGE.timeZone;
  }), 'all cold and compatible requests must share one verified date window');
});

test('detail-first reads can satisfy the same-period summary without another provider report', async () => {
  const harness = createHarness();
  requireSummary(harness.service);
  const detail = await harness.service.read({ profileId: PROFILE, period: 7, page: 1 });
  assertDetail(detail, 1, { data: PRIMARY_DATA });
  const reportsAfterDetail = harness.transport.logicalReports();

  const summary = await harness.service.readSummary({ profileId: PROFILE, period: 7 });
  assertSummary(summary, { data: PRIMARY_DATA });
  assert.deepEqual(summary.totals, detail.totals);
  assert.equal(harness.transport.logicalReports(), reportsAfterDetail,
    'a verified detail common component should satisfy a later summary read');
});

test('compatible period and link components stay fresh until the bounded TTL, then refresh', async () => {
  const harness = createHarness();
  const period = await harness.service.read({ profileId: PROFILE, period: 7, page: 1 });
  assertDetail(period, 1, { data: PRIMARY_DATA });
  harness.clock.value += 15 * 60 * 1000;
  const page2 = await harness.service.read({ profileId: PROFILE, period: 7, page: 2 });
  assertDetail(page2, 2, { data: PRIMARY_DATA });
  assert.equal(page2.updatedAt, period.updatedAt, 'a later link read retains the older period confirmation');
  const originalAge = Date.parse(period.updatedAt);
  const originalReports = harness.transport.logicalReports();

  harness.clock.value = originalAge + 60 * 60 * 1000 - 1;
  const nearExpiry = await harness.service.read({ profileId: PROFILE, period: 7, page: 2 });
  assert.equal(nearExpiry.freshness, 'fresh');
  assert.equal(nearExpiry.updatedAt, page2.updatedAt);
  assert.equal(harness.transport.logicalReports(), originalReports,
    'a compatible result remains usable immediately before its one-hour TTL');

  harness.clock.value = originalAge + 60 * 60 * 1000 + 1;
  const afterExpiry = await harness.service.read({ profileId: PROFILE, period: 7, page: 2 });
  assertDetail(afterExpiry, 2, { data: PRIMARY_DATA });
  assert.equal(afterExpiry.freshness, 'fresh');
  assert.ok(Date.parse(afterExpiry.updatedAt) > originalAge,
    'a requested page refreshes after the bounded TTL');
  assert.ok(harness.transport.logicalReports() > originalReports);
});

test('summary and detail caches isolate creator, period and requested link page', async () => {
  const harness = createHarness();
  requireSummary(harness.service);
  const summaryA = await harness.service.readSummary({ profileId: PROFILE, period: 7 });
  const detailA2 = await harness.service.read({ profileId: PROFILE, period: 7, page: 2 });
  const summaryB = await harness.service.readSummary({ profileId: OTHER_PROFILE, period: 30 });
  const detailB1 = await harness.service.read({ profileId: OTHER_PROFILE, period: 30, page: 1 });
  const otherData = fixtureData(OTHER_PROFILE, 30);

  assertSummary(summaryA, { creatorId: PROFILE, period: 7, data: PRIMARY_DATA });
  assert.equal(summaryB.creatorId, OTHER_PROFILE);
  assert.equal(summaryB.period, 30);
  assert.equal(detailA2.creatorId, PROFILE);
  assert.equal(detailA2.page, 2);
  assert.equal(detailB1.creatorId, OTHER_PROFILE);
  assert.equal(detailB1.period, 30);
  assert.equal(detailB1.page, 1);
  assert.deepEqual(detailA2.links.rows, PRIMARY_DATA.linkRows.slice(100, 200));
  assert.deepEqual(detailB1.links.rows, otherData.linkRows.slice(0, 100));

  for (const { queries } of harness.transport.calls) {
    for (const query of queries) {
      const creator = query.dimensionFilter?.andGroup?.expressions
        ?.find(({ filter }) => filter?.fieldName === 'customEvent:creator_id')?.filter?.stringFilter?.value;
      assert.ok(creator === PROFILE || creator === OTHER_PROFILE, 'scope must remain explicit');
      assertReportScope(query, creator);
      assert.deepEqual(dateRangeFor(query), creator === PROFILE ? RANGE : RANGE_30,
        'creator and period must remain a same-date isolated scope');
    }
  }
});

test('a source pagination failure leaves the complete retained requested-page fallback', async () => {
  let failSourcePages = false;
  const transport = createTransport({
    failQuery: (queries) => failSourcePages
      && queries.some((query) => kind(query) === 'sources' && Number(query.offset ?? 0) > 0),
  });
  const harness = createHarness({ transport });
  const original = await harness.service.read({ profileId: PROFILE, period: 7, page: 2 });
  assertDetail(original, 2, { data: PRIMARY_DATA });
  harness.clock.value += 60 * 60 * 1000 + 1;
  failSourcePages = true;

  const stale = await harness.service.read({ profileId: PROFILE, period: 7, page: 2 });
  assert.equal(stale.state, 'ready');
  assert.equal(stale.freshness, 'stale');
  assert.equal(stale.updatedAt, original.updatedAt);
  assert.deepEqual(stale.totals, original.totals);
  assert.deepEqual(stale.daily, original.daily);
  assert.deepEqual(stale.sources, original.sources);
  assert.deepEqual(stale.links, original.links,
    'stale fallback must retain the complete requested page, not just period totals');
});

test('a warm common period refuses a link-only response with a mismatched timezone', async () => {
  let corruptLinks = false;
  const transport = createTransport({
    mutate(report, { query }) {
      if (corruptLinks && kind(query) === 'links' && Number(query.offset ?? 0) === 100) {
        report.metadata.timeZone = 'UTC';
      }
      return report;
    },
  });
  const harness = createHarness({ transport });
  const first = await harness.service.read({ profileId: PROFILE, period: 7, page: 1 });
  assertDetail(first, 1, { data: PRIMARY_DATA });
  const linkStart = harness.transport.calls.length;
  const beforeFailure = harness.cache.calls.puts.length;
  corruptLinks = true;
  const result = await readWithoutBadReady(() => harness.service.read({ profileId: PROFILE, period: 7, page: 2 }));
  const linkQueries = harness.transport.calls.slice(linkStart).flatMap(({ queries }) => queries);
  assert.ok(linkQueries.length > 0 && kind(linkQueries[0]) === 'links',
    'the warm page request must start with one link-only report');
  assert.notEqual(result?.state, 'ready', 'a mismatched link-only timezone must not be assembled as ready');
  assert.ok(harness.cache.calls.puts.slice(beforeFailure).every(({ key }) => key?.kind !== 'page' || key.page !== 2),
    'a response with the wrong timezone must not publish the requested page');
});

test('a warm common period does not publish a link-only result across a date rollover', async () => {
  const clock = { value: NOW };
  const transport = createTransport({
    mutate(report, { query }) {
      if (clock.value === NOW && kind(query) === 'links' && Number(query.offset ?? 0) === 100) {
        clock.value += 24 * 60 * 60 * 1000;
      }
      return report;
    },
  });
  const harness = createHarness({ transport, clock });
  const first = await harness.service.read({ profileId: PROFILE, period: 7, page: 1 });
  assertDetail(first, 1, { data: PRIMARY_DATA });
  const linkStart = harness.transport.calls.length;
  const page2PutsBefore = structuredClone(harness.cache.calls.puts.filter(({ key }) => key?.kind === 'page' && key.page === 2));
  const result = await readWithoutBadReady(() => harness.service.read({ profileId: PROFILE, period: 7, page: 2 }));
  const linkQueries = harness.transport.calls.slice(linkStart).flatMap(({ queries }) => queries);
  assert.ok(linkQueries.length > 0 && kind(linkQueries[0]) === 'links');
  assert.deepEqual(dateRangeFor(linkQueries[0]), RANGE,
    'the first rollover attempt must use the old verified link window');
  const newPage2Puts = harness.cache.calls.puts
    .filter(({ key }) => key?.kind === 'page' && key.page === 2)
    .slice(page2PutsBefore.length);
  assert.ok(newPage2Puts.every(({ envelope }) => envelope.report?.range?.endDate !== RANGE.endDate),
    'a rollover must not publish a fresh page using the obsolete old window');
  if (result?.state === 'ready' && result.freshness === 'fresh') {
    assert.equal(result.range.endDate, '2026-10-25',
      'a fresh rollover result must carry the new property-local date');
  } else if (result?.state === 'ready') {
    assert.equal(result.freshness, 'stale', 'an eligible rollover fallback is explicitly stale');
  }
});

test('the provider transport fixture accepts absolute cold 7-day and 30-day windows', async () => {
  const transport = createTransport();
  const reader = createGA4StatisticsReader({
    propertyId: PROPERTY,
    captureStartedAt: CAPTURE_START,
    now: () => NOW,
    getAccessToken: async () => 'fixture-private-access-token',
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      const rewrite = (query) => {
        const { startDate } = query.dateRanges[0];
        if (startDate !== '6daysAgo' && startDate !== '29daysAgo') return query;
        const range = startDate === '6daysAgo' ? RANGE : RANGE_30;
        return { ...query, dateRanges: [{ startDate: range.startDate, endDate: range.endDate }] };
      };
      const rewritten = Array.isArray(body.requests)
        ? { ...body, requests: body.requests.map(rewrite) }
        : rewrite(body);
      return transport.fetch(url, { ...options, body: JSON.stringify(rewritten) });
    },
  });
  for (const period of [7, 30]) {
    const report = await reader.read({ profileId: PROFILE, period, page: 1 });
    assert.deepEqual(report.range, period === 7 ? RANGE : RANGE_30);
  }
});

test('incomplete source grouping and cross-report contract mismatches are rejected', async () => {
  const shortSourcePage = createTransport({
    mutate(report, { query }) {
      if (kind(query) === 'sources' && Number(query.offset ?? 0) === 100) {
        report.rowCount = 249;
      }
      return report;
    },
  });
  const shortReader = createGA4StatisticsReader({
    propertyId: PROPERTY,
    captureStartedAt: CAPTURE_START,
    now: () => NOW,
    getAccessToken: async () => 'fixture-private-access-token',
    fetch: shortSourcePage.fetch,
  });
  await assert.rejects(shortReader.read({ profileId: PROFILE, period: 7, page: 1 }));

  const mixedTimeZone = createTransport({
    mutate(report, { query }) {
      if (kind(query) === 'sources' && Number(query.offset ?? 0) === 100) {
        report.metadata.timeZone = 'UTC';
      }
      return report;
    },
  });
  const mixedReader = createGA4StatisticsReader({
    propertyId: PROPERTY,
    captureStartedAt: CAPTURE_START,
    now: () => NOW,
    getAccessToken: async () => 'fixture-private-access-token',
    fetch: mixedTimeZone.fetch,
  });
  await assert.rejects(mixedReader.read({ profileId: PROFILE, period: 7, page: 1 }));

  const repeatedSourcePage = createTransport({
    mutate(report, { query, sourceRows }) {
      if (kind(query) === 'sources' && Number(query.offset ?? 0) === 200) {
        report.rows = sourceRows.slice(100, 150).map(({ sourceMedium, views }) => row([sourceMedium], [views]));
      }
      return report;
    },
  });
  const repeatedSourceReader = createGA4StatisticsReader({
    propertyId: PROPERTY,
    captureStartedAt: CAPTURE_START,
    now: () => NOW,
    getAccessToken: async () => 'fixture-private-access-token',
    fetch: repeatedSourcePage.fetch,
  });
  await assert.rejects(repeatedSourceReader.read({ profileId: PROFILE, period: 7, page: 1 }));

  const validReader = createGA4StatisticsReader({
    propertyId: PROPERTY,
    captureStartedAt: CAPTURE_START,
    now: () => NOW,
    getAccessToken: async () => 'fixture-private-access-token',
    fetch: createTransport().fetch,
  });
  await assert.rejects(validReader.read({ profileId: PROFILE, period: 7, page: 0 }), TypeError);
  await assert.rejects(validReader.read({ profileId: ' creator-with-space ', period: 7, page: 1 }), TypeError);
});

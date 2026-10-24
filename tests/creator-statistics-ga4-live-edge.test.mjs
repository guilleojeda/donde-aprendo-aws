import assert from 'node:assert/strict';
import test from 'node:test';
import { createGA4StatisticsReader } from '../src/lib/creator-statistics-ga4.mjs';

const PROPERTY = '424203315';
const PROFILE = 'public-profile-a';
const TIME_ZONE = 'America/Buenos_Aires';
const CAPTURE_START = '2026-10-23T23:38:00Z';
const NOW = Date.parse('2026-10-24T15:00:00Z');

function observedEmptyReport() {
  return {
    metadata: { currencyCode: 'USD', timeZone: TIME_ZONE },
    propertyQuota: { tokensPerDay: { consumed: 1, remaining: 199962 } },
    kind: 'analyticsData#runReport',
  };
}

function observedEmptyReportWithHeaders(dimensions, metrics) {
  return {
    ...observedEmptyReport(),
    dimensionHeaders: dimensions.map((name) => ({ name })),
    metricHeaders: metrics.map((name) => ({ name, type: 'TYPE_INTEGER' })),
  };
}

function report(dimensions, metrics, values, rowCount = values.length) {
  return {
    dimensionHeaders: dimensions.map((name) => ({ name })),
    metricHeaders: metrics.map((name) => ({ name, type: 'TYPE_INTEGER' })),
    rows: values.map(([dimensionValues, metricValues]) => ({
      dimensionValues: dimensionValues.map((value) => ({ value })),
      metricValues: metricValues.map((value) => ({ value: String(value) })),
    })),
    rowCount,
    metadata: { timeZone: TIME_ZONE },
  };
}

function reader({ reports, now = () => NOW, fetch: fetchImpl } = {}) {
  return createGA4StatisticsReader({
    propertyId: PROPERTY,
    captureStartedAt: CAPTURE_START,
    now,
    getAccessToken: async () => 'fixture-access-token',
    fetch: fetchImpl ?? (async () => Response.json({ reports })),
  });
}

test('the observed protobuf-default response is a complete empty result for all five reports', async () => {
  const emptyReports = [
    observedEmptyReport(),
    observedEmptyReportWithHeaders(['date', 'eventName'], ['eventCount']),
    observedEmptyReportWithHeaders(['customEvent:link_id'], ['eventCount']),
    observedEmptyReportWithHeaders(['sessionSourceMedium'], ['eventCount']),
    observedEmptyReport(),
  ];
  const result = await reader({ reports: emptyReports }).read({ profileId: PROFILE, period: 7, page: 1 });

  assert.deepEqual(result.totals, { views: 0, visitors: 0, clicks: 0 });
  assert.equal(result.daily.length, 7);
  assert.ok(result.daily.filter(({ date }) => date < '2026-10-23')
    .every(({ views, clicks }) => views === null && clicks === null));
  assert.ok(result.daily.filter(({ date }) => date >= '2026-10-23')
    .every(({ views, clicks }) => views === 0 && clicks === 0));
  assert.deepEqual(result.links, { page: 1, pageSize: 100, totalRows: 0, rows: [] });
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.warnings, []);
});

test('empty reports with dimensions validate their headers and reject malformed truncation metadata', async () => {
  const reports = [
    observedEmptyReport(),
    observedEmptyReportWithHeaders(['date', 'eventName'], ['eventCount']),
    observedEmptyReportWithHeaders(['customEvent:link_id'], ['eventCount']),
    observedEmptyReportWithHeaders(['sessionSourceMedium'], ['eventCount']),
    observedEmptyReport(),
  ];
  const malformedHeaders = reports.map((item) => structuredClone(item));
  malformedHeaders[1].dimensionHeaders = [{ name: 'date' }, { name: 'unexpectedDimension' }];
  await assert.rejects(reader({ reports: malformedHeaders }).read({ profileId: PROFILE, period: 7, page: 1 }));

  const malformedLimit = reports.map((item) => structuredClone(item));
  malformedLimit[2].metadata.dataTruncationReasons = ['DATA_TRUNCATION_TYPE_DATE_RANGE'];
  await assert.rejects(reader({ reports: malformedLimit }).read({ profileId: PROFILE, period: 7, page: 1 }));
});

test('protobuf-default empty reports with GA4 limits stay ready with unknown metrics and warnings', async () => {
  const reports = [
    observedEmptyReportWithHeaders([], ['eventCount', 'totalUsers']),
    observedEmptyReportWithHeaders(['date', 'eventName'], ['eventCount']),
    observedEmptyReportWithHeaders(['customEvent:link_id'], ['eventCount']),
    observedEmptyReportWithHeaders(['sessionSourceMedium'], ['eventCount']),
    observedEmptyReportWithHeaders([], ['eventCount']),
  ];
  reports[0].metadata.subjectToThresholding = true;
  reports[1].metadata.samplingMetadatas = [{ samplesReadCount: '20', samplingSpaceSize: '100' }];
  reports[2].metadata.dataLossFromOtherRow = true;
  reports[3].metadata.schemaRestrictionResponse = {
    activeMetricRestrictions: [{ metricName: 'eventCount', restrictionType: 'RESTRICTED_METRIC' }],
  };
  reports[4].metadata.dataTruncationReasons = [{
    dataTruncationType: 'DATA_TRUNCATION_TYPE_DATE_RANGE',
    dataTruncationDate: '2026-10-24',
  }];

  const result = await reader({ reports }).read({ profileId: PROFILE, period: 7, page: 1 });

  assert.deepEqual(result.totals, { views: null, visitors: null, clicks: null });
  assert.ok(result.daily.filter(({ date }) => date >= '2026-10-23')
    .every(({ views, clicks }) => views === null && clicks === null));
  assert.deepEqual(result.links, { page: 1, pageSize: 100, totalRows: 0, rows: [] });
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.warnings.map(({ section, code }) => ({ section, code })), [
    { section: 'visits', code: 'thresholding' },
    { section: 'daily', code: 'sampling' },
    { section: 'links', code: 'other-row' },
    { section: 'sources', code: 'restricted' },
    { section: 'clicks', code: 'data-loss' },
  ]);
});

test('partial empty shapes, emptyReason and malformed metadata are unavailable', async () => {
  const empty = observedEmptyReport();
  const invalidReports = [
    { ...empty, rowCount: 1 },
    { ...empty, rows: [] },
    { ...empty, dimensionHeaders: [], metricHeaders: [], rowCount: 1 },
    { ...empty, rows: [{}], rowCount: 1 },
    { ...empty, metadata: { ...empty.metadata, emptyReason: 'NO_DATA' } },
    { ...empty, metadata: { ...empty.metadata, dataTruncationReasons: ['OTHER'] } },
  ];

  for (const invalid of invalidReports) {
    const reports = Array.from({ length: 5 }, () => observedEmptyReport());
    reports[0] = invalid;
    await assert.rejects(reader({ reports }).read({ profileId: PROFILE, period: 7, page: 1 }));
  }
});

test('link identities retain the reserved not-set ID and normalize only the empty value to it', async () => {
  const reports = [
    report([], ['eventCount', 'totalUsers'], [[[], [1, 1]]]),
    report(['date', 'eventName'], ['eventCount'], [[['20261024', 'creator_view'], [1]]]),
    report(['customEvent:link_id'], ['eventCount'], [
      [['(not set)'], [1]],
      [[''], [2]],
    ]),
    report(['sessionSourceMedium'], ['eventCount'], []),
    report([], ['eventCount'], [[[], [3]]]),
  ];
  const result = await reader({ reports }).read({ profileId: PROFILE, period: 7, page: 1 });

  assert.deepEqual(result.links.rows, [{ linkId: '(not set)', clicks: 3 }]);
  assert.ok(!result.links.rows.some(({ linkId }) => linkId === 'Enlace no identificable'));
});

test('an empty link page beyond the new row count remains ready and preserves its total', async () => {
  const reports = [
    report([], ['eventCount', 'totalUsers'], [[[], [1, 1]]]),
    report(['date', 'eventName'], ['eventCount'], [[['20261024', 'creator_view'], [1]]]),
    report(['customEvent:link_id'], ['eventCount'], [], 3),
    report(['sessionSourceMedium'], ['eventCount'], []),
    report([], ['eventCount'], [[[], [0]]]),
  ];
  const result = await reader({ reports }).read({ profileId: PROFILE, period: 7, page: 2 });
  assert.deepEqual(result.links, { page: 2, pageSize: 100, totalRows: 3, rows: [] });

  reports[2] = observedEmptyReportWithHeaders(['customEvent:link_id'], ['eventCount']);
  const defaulted = await reader({ reports }).read({ profileId: PROFILE, period: 7, page: 2 });
  assert.deepEqual(defaulted.links, { page: 2, pageSize: 100, totalRows: 0, rows: [] });
});

test('source pagination still rejects an empty response beyond its row count', async () => {
  const sourceRows = Array.from({ length: 100 }, (_, index) => [
    [`source-${String(index).padStart(3, '0')} / referral`], [1],
  ]);
  const batchReports = [
    report([], ['eventCount', 'totalUsers'], [[[], [1, 1]]]),
    report(['date', 'eventName'], ['eventCount'], [[['20261024', 'creator_view'], [1]]]),
    report(['customEvent:link_id'], ['eventCount'], []),
    report(['sessionSourceMedium'], ['eventCount'], sourceRows, 101),
    report([], ['eventCount'], [[[], [0]]]),
  ];
  const read = reader({
    fetch: async (url) => String(url).endsWith(':batchRunReports')
      ? Response.json({ reports: batchReports })
      : Response.json(observedEmptyReportWithHeaders(['sessionSourceMedium'], ['eventCount'])),
  });
  await assert.rejects(read.read({ profileId: PROFILE, period: 7, page: 1 }));
});

test('object data-truncation metadata is retained with its section warning', async () => {
  const reason = {
    dataTruncationType: 'DATA_TRUNCATION_TYPE_DATE_RANGE',
    dataTruncationMessage: 'The requested range has truncated data.',
    dataTruncationDate: '2026-10-23',
    dataTruncationDateRanges: [{ startDate: '2026-10-18', endDate: '2026-10-22' }],
  };
  const reports = [
    report([], ['eventCount', 'totalUsers'], [[[], [1, 1]]]),
    report(['date', 'eventName'], ['eventCount'], [[['20261024', 'creator_view'], [1]]]),
    report(['customEvent:link_id'], ['eventCount'], []),
    report(['sessionSourceMedium'], ['eventCount'], []),
    report([], ['eventCount'], [[[], [0]]]),
  ];
  reports[1].metadata.dataTruncationReasons = [reason];
  const result = await reader({ reports }).read({ profileId: PROFILE, period: 7, page: 1 });

  assert.deepEqual(result.warnings, [{
    section: 'daily',
    code: 'data-loss',
    details: { dataTruncationReasons: [reason] },
  }]);
  assert.equal(result.daily.at(-1).views, 1);
  assert.equal(result.daily.at(-1).clicks, null, 'A missing event cell is not zero in a truncated report.');
});

test('a source page crossing the property midnight invalidates the whole relative-date read', async () => {
  const beforeMidnight = Date.parse('2026-10-24T02:59:59Z');
  const afterMidnight = Date.parse('2026-10-24T03:00:01Z');
  const clock = { value: beforeMidnight };
  const sourceRows = Array.from({ length: 100 }, (_, index) => [
    [`source-${String(index).padStart(3, '0')} / referral`], [1],
  ]);
  const batchReports = [
    report([], ['eventCount', 'totalUsers'], [[[], [1, 1]]]),
    report(['date', 'eventName'], ['eventCount'], [[['20261023', 'creator_view'], [1]]]),
    report(['customEvent:link_id'], ['eventCount'], []),
    report(['sessionSourceMedium'], ['eventCount'], sourceRows, 101),
    report([], ['eventCount'], [[[], [0]]]),
  ];
  let requests = 0;
  const read = reader({
    now: () => clock.value,
    fetch: async (url) => {
      requests += 1;
      if (String(url).endsWith(':batchRunReports')) return Response.json({ reports: batchReports });
      clock.value = afterMidnight;
      return Response.json(report(['sessionSourceMedium'], ['eventCount'], [
        [['source-100 / referral'], [1]],
      ], 101));
    },
  });

  await assert.rejects(read.read({ profileId: PROFILE, period: 7, page: 1 }));
  assert.equal(requests, 2, 'The runReport page completed before the end-of-read day check.');
});

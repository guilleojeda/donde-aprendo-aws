import assert from 'node:assert/strict';
import test from 'node:test';

const moduleResult = await import('../src/lib/creator-statistics-ga4.mjs').then(
  (value) => ({ value }), (error) => ({ error }),
);
const PROPERTY = '424203315';
const PROFILE = 'public-profile-a';
const NOW = Date.parse('2026-10-24T15:00:00Z');
const CAPTURE_START = '2026-10-23T23:38:00Z';
const TIME_ZONE = 'America/Argentina/Buenos_Aires';

function factory() {
  assert.equal(moduleResult.error, undefined,
    `Falta implementar el lector privado GA4: ${moduleResult.error?.message}`);
  assert.equal(typeof moduleResult.value.createGA4StatisticsReader, 'function');
  return moduleResult.value.createGA4StatisticsReader;
}

// The double returns provider records, not precomputed product statistics.
function report(dimensions, metrics, values = [], metadata = {}, rowCount = values.length) {
  return {
    dimensionHeaders: dimensions.map((name) => ({ name })),
    metricHeaders: metrics.map((name) => ({ name, type: 'TYPE_INTEGER' })),
    rows: values.map(([dimensionValues, metricValues]) => ({
      dimensionValues: dimensionValues.map((value) => ({ value })),
      metricValues: metricValues.map((value) => ({ value: String(value) })),
    })),
    rowCount,
    metadata: { timeZone: TIME_ZONE, ...metadata },
    propertyQuota: { tokensPerHour: { consumed: 10, remaining: 39990 } },
  };
}

function records() {
  return {
    visits: report([], ['eventCount', 'totalUsers'], [[[], [5, 3]]]),
    clicks: report([], ['eventCount'], [[[], [8]]]),
    daily: report(['date', 'eventName'], ['eventCount'], [
      [['20261023', 'creator_view'], [3]], [['20261023', 'creator_link_click'], [5]],
      [['20261024', 'creator_view'], [2]], [['20261024', 'creator_link_click'], [3]],
    ]),
    links: report(['customEvent:link_id'], ['eventCount'], [
      [['placement-current'], [5]], [['social:website'], [3]],
    ]),
    sources: report(['sessionSourceMedium'], ['eventCount'], [
      [['google / organic'], [2]], [['(direct) / (none)'], [2]], [['(not set)'], [1]],
    ]),
  };
}

function kind(request) {
  const dimensions = request.dimensions?.map(({ name }) => name) ?? [];
  if (dimensions.includes('customEvent:link_id')) return 'links';
  if (dimensions.includes('sessionSourceMedium')) return 'sources';
  if (dimensions.includes('date')) return 'daily';
  return request.metrics.some(({ name }) => name === 'totalUsers') ? 'visits' : 'clicks';
}

function harness({ reports = records(), nextPages = [], now = NOW, http, timeoutMs } = {}) {
  const requests = [];
  let tokenRequests = 0;
  const reader = factory()({
    propertyId: PROPERTY,
    captureStartedAt: CAPTURE_START,
    now: () => now,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    getAccessToken: async () => { tokenRequests += 1; return 'test-private-access-token'; },
    fetch: async (url, options) => {
      const entry = { url: String(url), options, body: JSON.parse(options.body) };
      requests.push(entry);
      if (http) return http(entry, requests.length);
      if (entry.url.endsWith(':batchRunReports')) {
        return Response.json({ reports: entry.body.requests.map((request) => structuredClone(reports[kind(request)])) });
      }
      assert.ok(entry.url.endsWith(':runReport'), 'Only the reporting endpoint is used for subsequent pages.');
      assert.ok(nextPages.length, 'The test has no further provider page.');
      return Response.json(nextPages.shift());
    },
  });
  return { reader, requests, tokenRequests: () => tokenRequests };
}

function exactFilters(query) {
  assert.ok(query.dimensionFilter?.andGroup?.expressions, 'Creator and event filters must be conjoined.');
  return query.dimensionFilter.andGroup.expressions.map(({ filter }) => filter);
}

test('fixed reports isolate the stable creator and count only the approved events', async () => {
  const h = harness();
  await h.reader.read({ profileId: PROFILE, period: 7, page: 1 });
  assert.equal(h.requests.length, 1);
  const [{ url, options, body }] = h.requests;
  assert.equal(url, `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:batchRunReports`);
  assert.equal(options.method, 'POST');
  assert.equal(new Headers(options.headers).get('authorization'), 'Bearer test-private-access-token');
  assert.equal(body.requests.length, 5);
  assert.deepEqual(body.requests.map(kind).sort(), ['clicks', 'daily', 'links', 'sources', 'visits']);
  for (const query of body.requests) {
    assert.deepEqual(query.dateRanges, [{ startDate: '6daysAgo', endDate: 'today' }]);
    assert.equal(query.returnPropertyQuota, true);
    const filters = exactFilters(query);
    assert.deepEqual(filters.find(({ fieldName }) => fieldName === 'customEvent:creator_id'), {
      fieldName: 'customEvent:creator_id',
      stringFilter: { matchType: 'EXACT', value: PROFILE, caseSensitive: true },
    });
    const event = filters.find(({ fieldName }) => fieldName === 'eventName');
    if (kind(query) === 'daily') {
      assert.deepEqual(event, { fieldName: 'eventName', inListFilter: {
        values: ['creator_view', 'creator_link_click'], caseSensitive: true,
      } });
    } else {
      assert.deepEqual(event, { fieldName: 'eventName', stringFilter: {
        matchType: 'EXACT', value: ['visits', 'sources'].includes(kind(query)) ? 'creator_view' : 'creator_link_click', caseSensitive: true,
      } });
    }
    assert.deepEqual(query.metrics.map(({ name }) => name).sort(), kind(query) === 'visits' ? ['eventCount', 'totalUsers'] : ['eventCount']);
  }
});

test('period users come from the undimensioned view report, while daily points contain visits and clicks', async () => {
  const h = harness();
  const data = await h.reader.read({ profileId: PROFILE, period: 7, page: 1 });
  assert.deepEqual(data.totals, { views: 5, visitors: 3, clicks: 8 });
  assert.equal(data.creatorId, PROFILE);
  assert.equal(data.captureStartedAt, CAPTURE_START);
  assert.deepEqual(data.range, { startDate: '2026-10-18', endDate: '2026-10-24', timeZone: TIME_ZONE });
  assert.equal(data.daily.length, 7);
  assert.deepEqual(data.daily.find(({ date }) => date === '2026-10-23'), { date: '2026-10-23', views: 3, clicks: 5 });
  assert.deepEqual(data.daily.find(({ date }) => date === '2026-10-24'), { date: '2026-10-24', views: 2, clicks: 3 });
  assert.deepEqual(data.daily[0], { date: '2026-10-18', views: null, clicks: null },
    'Before capture began there is no measurement to reconstruct.');
  assert.equal(data.links.rows.find(({ linkId }) => linkId === 'social:website').clicks, 3);
  assert.ok(!JSON.stringify(data).includes('test-private-access-token'));
});

test('thirty days include today and the previous 29 days in the property time zone', async () => {
  const h = harness();
  const data = await h.reader.read({ profileId: PROFILE, period: 30, page: 1 });
  for (const query of h.requests[0].body.requests) assert.deepEqual(query.dateRanges, [{ startDate: '29daysAgo', endDate: 'today' }]);
  assert.equal(data.daily.length, 30);
  assert.equal(data.range.startDate, '2026-09-25');
  const earlier = records();
  earlier.daily = report(['date', 'eventName'], ['eventCount'], [[['20261023', 'creator_view'], [5]]]);
  const boundary = harness({ reports: earlier, now: Date.parse('2026-10-24T01:30:00Z') });
  const local = await boundary.reader.read({ profileId: PROFILE, period: 7, page: 1 });
  assert.equal(local.range.endDate, '2026-10-23', 'UTC has advanced but the property day has not.');
  assert.equal(local.range.startDate, '2026-10-17');
});

test('headers identify columns even when GA4 returns another order', async () => {
  const source = records();
  source.visits = report([], ['totalUsers', 'eventCount'], [[[], [3, 5]]]);
  source.daily = report(['eventName', 'date'], ['eventCount'], [
    [['creator_view', '20261023'], [5]], [['creator_link_click', '20261023'], [8]],
  ]);
  const data = await harness({ reports: source }).reader.read({ profileId: PROFILE, period: 7, page: 1 });
  assert.deepEqual(data.totals, { views: 5, visitors: 3, clicks: 8 });
  assert.deepEqual(data.daily.find(({ date }) => date === '2026-10-23'), { date: '2026-10-23', views: 5, clicks: 8 });
});

test('link pages preserve IDs, social clicks, removed-link counts and the unpaginated total', async () => {
  const source = records();
  source.links = report(['customEvent:link_id'], ['eventCount'], [
    [['placement-no-longer-in-profile'], [2]], [['social:x'], [1]],
  ], {}, 102);
  const h = harness({ reports: source });
  const data = await h.reader.read({ profileId: PROFILE, period: 7, page: 2 });
  const query = h.requests[0].body.requests.find((request) => kind(request) === 'links');
  assert.equal(Number(query.offset), 100);
  assert.equal(Number(query.limit), 100);
  assert.deepEqual(query.orderBys, [{ dimension: { dimensionName: 'customEvent:link_id' }, desc: false }]);
  assert.deepEqual(data.links, { page: 2, pageSize: 100, totalRows: 102, rows: [
    { linkId: 'placement-no-longer-in-profile', clicks: 2 }, { linkId: 'social:x', clicks: 1 },
  ] });
  assert.equal(data.totals.clicks, 8, 'The second page is not the total count of clicks.');
});

test('all source pages are grouped before choosing the main ten sources', async () => {
  const source = records();
  source.sources = report(['sessionSourceMedium'], ['eventCount'],
    Array.from({ length: 12 }, (_, i) => [[`source-${i} / referral`], [30 - i]]), {}, 14);
  const next = report(['sessionSourceMedium'], ['eventCount'], [[['(direct) / (none)'], [11]], [['(not set)'], [11]]], {}, 14);
  const h = harness({ reports: source, nextPages: [next] });
  const data = await h.reader.read({ profileId: PROFILE, period: 7, page: 1 });
  assert.equal(h.requests.length, 2);
  assert.equal(Number(h.requests[1].body.offset), 12);
  assert.equal(kind(h.requests[1].body), 'sources');
  assert.deepEqual(exactFilters(h.requests[1].body), exactFilters(h.requests[0].body.requests.find((q) => kind(q) === 'sources')));
  assert.equal(data.sources.length, 10);
  assert.deepEqual(data.sources.find(({ sourceMedium }) => sourceMedium === 'Directo o sin origen identificable'), {
    sourceMedium: 'Directo o sin origen identificable', views: 22,
  });
});

test('empty successful reports produce real zeros and empty lists', async () => {
  const source = records();
  for (const key of Object.keys(source)) source[key] = { ...source[key], rows: [], rowCount: 0 };
  const data = await harness({ reports: source }).reader.read({ profileId: PROFILE, period: 7, page: 1 });
  assert.deepEqual(data.totals, { views: 0, visitors: 0, clicks: 0 });
  assert.equal(data.daily.length, 7);
  assert.ok(data.daily.filter(({ date }) => date >= '2026-10-23').every(({ views, clicks }) => views === 0 && clicks === 0));
  assert.ok(data.daily.filter(({ date }) => date < '2026-10-23').every(({ views, clicks }) => views === null && clicks === null));
  assert.deepEqual(data.links.rows, []);
  assert.deepEqual(data.sources, []);
  assert.deepEqual(data.warnings, []);
});

test('a missing day during a valid measured period is zero, while pre-capture days stay unmeasured', async () => {
  const source = records();
  source.daily = report(['date', 'eventName'], ['eventCount'], [
    [['20261024', 'creator_view'], [5]], [['20261024', 'creator_link_click'], [8]],
  ]);
  const data = await harness({ reports: source }).reader.read({ profileId: PROFILE, period: 7, page: 1 });
  assert.deepEqual(data.daily.find(({ date }) => date === '2026-10-23'), { date: '2026-10-23', views: 0, clicks: 0 });
  assert.deepEqual(data.daily[0], { date: '2026-10-18', views: null, clicks: null });
});

test('thresholding, sampling and lost detail survive normalization without inventing zeros', async () => {
  const source = records();
  source.visits = report([], ['eventCount', 'totalUsers'], [], { subjectToThresholding: true });
  source.daily = report(['date', 'eventName'], ['eventCount'], [
    [['20261024', 'creator_view'], [2]], [['20261024', 'creator_link_click'], [3]],
  ], { subjectToThresholding: true });
  source.links.metadata.dataLossFromOtherRow = true;
  source.links.rows = [{ dimensionValues: [{ value: '(other)' }], metricValues: [{ value: '8' }] }];
  source.links.rowCount = 1;
  source.sources.metadata.samplingMetadatas = [{ samplesReadCount: '20', samplingSpaceSize: '100' }];
  const data = await harness({ reports: source }).reader.read({ profileId: PROFILE, period: 7, page: 1 });
  assert.equal(data.totals.views, null);
  assert.equal(data.totals.visitors, null);
  assert.deepEqual(data.daily.find(({ date }) => date === '2026-10-23'), { date: '2026-10-23', views: null, clicks: null });
  assert.equal(data.links.rows[0].linkId, '(other)');
  for (const code of ['thresholding', 'sampling', 'other-row']) assert.ok(data.warnings.some((warning) => warning.code === code), code);
});

test('an emptyReason is unavailable data rather than a successful zero report', async () => {
  const source = records();
  source.visits = report([], ['eventCount', 'totalUsers'], [], { emptyReason: 'The property is not ready for this report.' });
  await assert.rejects(harness({ reports: source }).reader.read({ profileId: PROFILE, period: 7, page: 1 }));
});

test('missing reports, invalid metrics and unfinished pagination are rejected as incomplete', async () => {
  const missing = harness({ http: async () => Response.json({ reports: [] }) });
  await assert.rejects(missing.reader.read({ profileId: PROFILE, period: 7, page: 1 }));
  const bad = records();
  bad.visits.rows[0].metricValues[0].value = 'not-a-number';
  await assert.rejects(harness({ reports: bad }).reader.read({ profileId: PROFILE, period: 7, page: 1 }));
  const source = records();
  source.sources.rowCount = 4;
  await assert.rejects(harness({ reports: source, nextPages: [report(['sessionSourceMedium'], ['eventCount'], [], {}, 4)] }).reader.read({ profileId: PROFILE, period: 7, page: 1 }));
});

test('permission and quota failures do not loop or masquerade as data', async () => {
  for (const status of [400, 403, 429]) {
    const h = harness({ http: async () => Response.json({ error: { message: 'private provider details' } }, { status }) });
    await assert.rejects(h.reader.read({ profileId: PROFILE, period: 7, page: 1 }));
    assert.equal(h.requests.length, 1, `Do not retry ${status} as an empty dataset.`);
  }
});

test('a transient server failure is retried at most once', async () => {
  const h = harness({ http: async () => Response.json({ error: { code: 503 } }, { status: 503 }) });
  await assert.rejects(h.reader.read({ profileId: PROFILE, period: 7, page: 1 }));
  assert.ok(h.requests.length >= 1 && h.requests.length <= 2);
});

test('an unresponsive reporting request has an abortable deadline', { timeout: 1000 }, async () => {
  const h = harness({ timeoutMs: 20, http: ({ options }) => new Promise((resolve, reject) => {
    assert.ok(options.signal instanceof AbortSignal);
    if (options.signal.aborted) reject(options.signal.reason);
    else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }) });
  await assert.rejects(h.reader.read({ profileId: PROFILE, period: 7, page: 1 }));
  assert.ok(h.requests.length >= 1 && h.requests.length <= 2);
  assert.ok(h.requests.every(({ options }) => options.signal.aborted), 'Timed-out network requests are aborted.');
});

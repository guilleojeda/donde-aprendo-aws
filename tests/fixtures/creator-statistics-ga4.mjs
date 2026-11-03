import { createGA4StatisticsReader } from '../../src/lib/creator-statistics-ga4.mjs';
import { createCachedCreatorStatistics } from '../../src/lib/creator-statistics.mjs';

export const CREATOR_STATISTICS_NOW = Date.parse('2026-10-24T02:30:00.000Z');

export function analyticsReport(request, totals = { views: 5, visitors: 3, clicks: 8 }) {
  const dimensions = request.dimensions?.map(({ name }) => name) ?? [];
  const metrics = request.metrics.map(({ name }) => name);
  const values = dimensions.length === 0
    ? [[[], metrics.includes('totalUsers') ? [totals.views, totals.visitors] : [totals.clicks]]]
    : [];
  return {
    dimensionHeaders: dimensions.map((name) => ({ name })),
    metricHeaders: metrics.map((name) => ({ name, type: 'TYPE_INTEGER' })),
    rows: values.map(([dimensionValues, metricValues]) => ({
      dimensionValues: dimensionValues.map((value) => ({ value })),
      metricValues: metricValues.map((value) => ({ value: String(value) })),
    })),
    rowCount: values.length,
    metadata: { timeZone: 'America/Los_Angeles' },
    propertyQuota: { tokensPerHour: { consumed: 1, remaining: 39_999 } },
  };
}

export function createBrowserCreatorStatistics() {
  const values = new Map();
  const requests = [];
  let currentNow = CREATOR_STATISTICS_NOW;
  let providerResponder;
  const cache = {
    async get(key) {
      const value = values.get(JSON.stringify([key.profileId, key.period, key.page]));
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(key, envelope) {
      values.set(JSON.stringify([key.profileId, key.period, key.page]), structuredClone(envelope));
    },
  };
  const reader = createGA4StatisticsReader({
    propertyId: '424203315',
    captureStartedAt: '2026-10-23T23:38:00Z',
    now: () => currentNow,
    getAccessToken: async () => 'browser-fixture-access-token',
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(structuredClone(body));
      const payload = { reports: body.requests.map((request) => {
        const periodTotals = request.dateRanges?.[0]?.startDate === '6daysAgo'
          ? { views: 5, visitors: 3, clicks: 8 }
          : { views: 12, visitors: 6, clicks: 20 };
        return analyticsReport(request, periodTotals);
      }) };
      const response = await providerResponder?.({
        body: structuredClone(body),
        payload: structuredClone(payload),
        call: requests.length,
      });
      if (response instanceof Response) return response;
      return Response.json(response ?? payload);
    },
  });
  return {
    service: createCachedCreatorStatistics({ reader, cache, now: () => currentNow }),
    requests,
    cache,
    advanceTime(milliseconds) {
      if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
        throw new TypeError('statistics fixture time must advance by a positive integer number of milliseconds');
      }
      currentNow += milliseconds;
      return currentNow;
    },
    setProviderResponder(responder) {
      if (responder !== undefined && typeof responder !== 'function') {
        throw new TypeError('provider responder must be a function');
      }
      providerResponder = responder;
    },
  };
}

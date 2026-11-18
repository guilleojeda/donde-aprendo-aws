import { createGA4StatisticsReader } from '../../src/lib/creator-statistics-ga4.mjs';
import { createCachedCreatorStatistics } from '../../src/lib/creator-statistics.mjs';

export const CREATOR_STATISTICS_NOW = Date.parse('2026-10-24T02:30:00.000Z');

function periodFor(request) {
  const range = request.dateRanges?.[0];
  if (!range) return 30;
  if (range.startDate === '6daysAgo') return 7;
  if (range.startDate === '29daysAgo') return 30;
  const start = Date.parse(`${range.startDate}T00:00:00.000Z`);
  const end = Date.parse(`${range.endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 30;
  const period = Math.round((end - start) / 86_400_000) + 1;
  return period === 7 ? 7 : 30;
}

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
  let revision = 0;
  const cacheIdentity = (key) => {
    const kind = key.kind ?? (Object.hasOwn(key, 'page') ? 'page' : 'summary');
    return JSON.stringify({
      profileId: key.profileId,
      period: key.period,
      kind,
      ...(kind === 'page' ? { page: key.page } : {}),
    });
  };
  const cache = {
    async get(key) {
      const value = values.get(cacheIdentity(key));
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(key, envelope) {
      values.set(cacheIdentity(key), {
        ...structuredClone(envelope),
        revision: `memory-revision-${revision += 1}`,
      });
    },
  };
  const reader = createGA4StatisticsReader({
    propertyId: '424203315',
    captureStartedAt: '2026-10-23T23:38:00Z',
    now: () => currentNow,
    getAccessToken: async () => 'browser-fixture-access-token',
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      const queries = Array.isArray(body.requests) ? body.requests : [body];
      // Keep one stable request-log shape for existing browser assertions while
      // sending the real runReport body to the responder and transport seam.
      requests.push({ requests: structuredClone(queries), transport: String(url).endsWith(':runReport') ? 'runReport' : 'batchRunReports' });
      const payload = { reports: queries.map((request) => {
        const periodTotals = periodFor(request) === 7
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
      if (response !== undefined) return Response.json(response);
      return String(url).endsWith(':runReport')
        ? Response.json(payload.reports[0])
        : Response.json(payload);
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

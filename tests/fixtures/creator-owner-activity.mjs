/** Fixed provider-shaped data for owner activity acceptance; no live GA or cache. */
export function activityReport({ creatorId = 'fixture-id-1', period = 30, page = 1, ...overrides } = {}) {
  const end = Date.UTC(2026, 9, 27);
  const start = end - (period - 1) * 86_400_000;
  const daily = Array.from({ length: period }, (_, index) => {
    const date = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    return { date, views: date < '2026-10-23' ? null : 0, clicks: date < '2026-10-23' ? null : 0 };
  });
  daily.at(-1).views = 137;
  daily.at(-1).clicks = 43;
  return {
    state: 'ready', creatorId, period, page,
    range: {
      startDate: daily[0].date,
      endDate: daily.at(-1).date,
      timeZone: 'America/Argentina/Buenos_Aires',
    },
    totals: { views: 137, visitors: 19, clicks: 43 },
    daily,
    links: { page, pageSize: 100, totalRows: 1, rows: [{ linkId: 'social:website', clicks: 43 }] },
    sources: [{ sourceMedium: 'newsletter / email', views: 137 }],
    warnings: [],
    captureStartedAt: '2026-10-23T14:00:00.000Z',
    freshness: 'fresh',
    updatedAt: '2026-10-27T15:00:00.000Z',
    ...overrides,
  };
}

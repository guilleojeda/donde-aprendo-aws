import type {
  CreatorStatisticsCommonReady,
  CreatorStatisticsReady,
  CreatorStatisticsSummaryReady,
  CreatorStatisticsWarning,
} from './creator-statistics-types';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function integer(value: unknown, nullable = false): number | null {
  if (nullable && value === null) return null;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isoTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function warning(value: unknown): CreatorStatisticsWarning | undefined {
  const item = record(value);
  return typeof item?.section === 'string' && typeof item.code === 'string'
    ? { section: item.section, code: item.code }
    : undefined;
}

function parseCommonReady(value: unknown, period: 7 | 30, creatorId: string): CreatorStatisticsCommonReady | undefined {
  const item = record(value);
  const range = record(item?.range);
  const totals = record(item?.totals);
  if (item?.state !== 'ready' || item.creatorId !== creatorId || item.period !== period
    || !range || !totals || !Array.isArray(item.warnings)
    || !isoDate(range.startDate) || !isoDate(range.endDate) || typeof range.timeZone !== 'string'
    || !isoTimestamp(item.captureStartedAt) || (item.freshness !== 'fresh' && item.freshness !== 'stale')
    || !isoTimestamp(item.updatedAt)) return undefined;

  try {
    new Intl.DateTimeFormat('es', { timeZone: range.timeZone });
  } catch {
    return undefined;
  }
  const start = new Date(`${range.startDate}T00:00:00.000Z`);
  const end = new Date(`${range.endDate}T00:00:00.000Z`);
  if (end.getTime() < start.getTime()
    || Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1 !== period) return undefined;

  const expectedViews = integer(totals.views, true);
  const expectedVisitors = integer(totals.visitors, true);
  const expectedClicks = integer(totals.clicks, true);
  if (expectedViews === null && totals.views !== null
    || expectedVisitors === null && totals.visitors !== null
    || expectedClicks === null && totals.clicks !== null) return undefined;
  const warnings = item.warnings.map(warning);
  if (warnings.some((entry) => entry === undefined)) return undefined;
  return {
    creatorId: item.creatorId,
    period,
    range: { startDate: range.startDate, endDate: range.endDate, timeZone: range.timeZone },
    totals: { views: expectedViews, visitors: expectedVisitors, clicks: expectedClicks },
    warnings: warnings.filter((entry): entry is CreatorStatisticsWarning => entry !== undefined),
    captureStartedAt: item.captureStartedAt,
    freshness: item.freshness,
    updatedAt: item.updatedAt,
  };
}

export function parseCreatorStatisticsSummaryReady(value: unknown, period: 7 | 30, creatorId: string): CreatorStatisticsSummaryReady | undefined {
  const common = parseCommonReady(value, period, creatorId);
  if (!common) return undefined;
  const item = record(value);
  if (!item || Object.hasOwn(item, 'page') || Object.hasOwn(item, 'daily') || Object.hasOwn(item, 'links') || Object.hasOwn(item, 'sources')) return undefined;
  return { state: 'ready', ...common };
}

export function parseCreatorStatisticsReady(value: unknown, period: 7 | 30, page: number, creatorId: string): CreatorStatisticsReady | undefined {
  const common = parseCommonReady(value, period, creatorId);
  if (!common) return undefined;
  const item = record(value);
  const range = record(item?.range);
  const links = record(item?.links);
  if (!item || item.page !== page || !range || !links
    || !Array.isArray(item.daily) || item.daily.length !== period
    || !Array.isArray(links.rows) || links.page !== page || links.pageSize !== 100
    || integer(links.totalRows) === null || !Array.isArray(item.sources)
  ) return undefined;
  const totalRows = integer(links.totalRows);
  if (totalRows === null) return undefined;

  const daily: CreatorStatisticsReady['daily'] = [];
  for (let index = 0; index < item.daily.length; index += 1) {
    const point = record(item.daily[index]);
    if (!point || !isoDate(point.date)) return undefined;
    const date = new Date(`${range.startDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const expectedDate = date.toISOString().slice(0, 10);
    const views = integer(point.views, true);
    const clicks = integer(point.clicks, true);
    if (point.date !== expectedDate || views === null && point.views !== null || clicks === null && point.clicks !== null) return undefined;
    daily.push({ date: point.date, views, clicks });
  }
  const endDate = new Date(`${range.startDate}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + period - 1);
  if (range.endDate !== endDate.toISOString().slice(0, 10)) return undefined;

  const linkRows: CreatorStatisticsReady['links']['rows'] = [];
  for (const rawRow of links.rows) {
    const row = record(rawRow);
    const clicks = integer(row?.clicks, true);
    if (typeof row?.linkId !== 'string' || clicks === null && row.clicks !== null) return undefined;
    linkRows.push({ linkId: row.linkId, clicks });
  }
  if (linkRows.length > 100 || linkRows.length > totalRows) return undefined;

  const sources: CreatorStatisticsReady['sources'] = [];
  for (const rawSource of item.sources) {
    const source = record(rawSource);
    const views = integer(source?.views, true);
    if (typeof source?.sourceMedium !== 'string' || views === null && source.views !== null) return undefined;
    sources.push({ sourceMedium: source.sourceMedium, views });
  }
  return {
    ...common,
    state: 'ready',
    page,
    daily,
    links: { page, pageSize: 100, totalRows, rows: linkRows },
    sources,
    warnings: common.warnings,
  };
}

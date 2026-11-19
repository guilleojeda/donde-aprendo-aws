import type {
  CreatorStatisticsCommonReady,
  CreatorStatisticsReady,
  CreatorStatisticsSummaryReady,
} from './creator-statistics-types';
import { isCreatorStatisticsReport } from './creator-statistics-contract.mjs';

function projectCommon(value: CreatorStatisticsCommonReady): CreatorStatisticsCommonReady {
  return {
    creatorId: value.creatorId,
    period: value.period,
    range: {
      startDate: value.range.startDate,
      endDate: value.range.endDate,
      timeZone: value.range.timeZone,
    },
    totals: {
      views: value.totals.views,
      visitors: value.totals.visitors,
      clicks: value.totals.clicks,
    },
    warnings: value.warnings.map(({ section, code }) => ({ section, code })),
    captureStartedAt: value.captureStartedAt,
    freshness: value.freshness,
    updatedAt: value.updatedAt,
  };
}

export function parseCreatorStatisticsSummaryReady(value: unknown, period: 7 | 30, creatorId: string): CreatorStatisticsSummaryReady | undefined {
  if (!isCreatorStatisticsReport(value, {
    kind: 'summary',
    representation: 'ready',
    period,
    profileId: creatorId,
  })) return undefined;
  // The shared guard validates the complete nested ready payload. This cast is
  // only the typed projection of those proven fields for the UI boundary.
  const common = projectCommon(value as CreatorStatisticsSummaryReady);
  return { state: 'ready', ...common };
}

export function parseCreatorStatisticsReady(value: unknown, period: 7 | 30, page: number, creatorId: string): CreatorStatisticsReady | undefined {
  if (!isCreatorStatisticsReport(value, {
    kind: 'page',
    representation: 'ready',
    period,
    page,
    profileId: creatorId,
  })) return undefined;
  // The shared guard validates the complete nested ready payload. This cast is
  // only the typed projection of those proven fields for the UI boundary.
  const item = value as CreatorStatisticsReady;
  const common = projectCommon(item);
  return {
    ...common,
    state: 'ready',
    page: item.page,
    daily: item.daily.map(({ date, views, clicks }) => ({ date, views, clicks })),
    links: {
      page: item.links.page,
      pageSize: item.links.pageSize,
      totalRows: item.links.totalRows,
      rows: item.links.rows.map(({ linkId, clicks }) => ({ linkId, clicks })),
    },
    sources: item.sources.map(({ sourceMedium, views }) => ({ sourceMedium, views })),
  };
}

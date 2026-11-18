export type CreatorStatisticsFreshness = 'fresh' | 'stale';

export interface CreatorStatisticsWarning {
  section: string;
  code: string;
}

export interface CreatorStatisticsCommonReady {
  creatorId: string;
  period: 7 | 30;
  range: {
    startDate: string;
    endDate: string;
    timeZone: string;
  };
  totals: {
    views: number | null;
    visitors: number | null;
    clicks: number | null;
  };
  warnings: CreatorStatisticsWarning[];
  captureStartedAt: string;
  freshness: CreatorStatisticsFreshness;
  updatedAt: string;
}

export interface CreatorStatisticsReady extends CreatorStatisticsCommonReady {
  state: 'ready';
  page: number;
  daily: Array<{
    date: string;
    views: number | null;
    clicks: number | null;
  }>;
  links: {
    page: number;
    pageSize: 100;
    totalRows: number;
    rows: Array<{
      linkId: string;
      clicks: number | null;
    }>;
  };
  sources: Array<{
    sourceMedium: string;
    views: number | null;
  }>;
}

export interface CreatorStatisticsSummaryReady extends CreatorStatisticsCommonReady {
  state: 'ready';
}

export type CreatorStatisticsApiState = 'no-profile' | 'not-published';

export interface CreatorStatisticsStateResponse {
  state: CreatorStatisticsApiState;
  period: 7 | 30;
  page: number;
}

export type CreatorStatisticsSummaryStateResponse = Omit<CreatorStatisticsStateResponse, 'page'>;

export type CreatorStatisticsResponse = CreatorStatisticsReady | CreatorStatisticsStateResponse;
export type CreatorStatisticsSummaryResponse = CreatorStatisticsSummaryReady | CreatorStatisticsSummaryStateResponse;

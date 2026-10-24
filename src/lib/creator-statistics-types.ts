export type CreatorStatisticsFreshness = 'fresh' | 'stale';

export interface CreatorStatisticsWarning {
  section: string;
  code: string;
}

export interface CreatorStatisticsReady {
  state: 'ready';
  creatorId: string;
  period: 7 | 30;
  page: number;
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
  warnings: CreatorStatisticsWarning[];
  captureStartedAt: string;
  freshness: CreatorStatisticsFreshness;
  updatedAt: string;
}

export type CreatorStatisticsApiState = 'no-profile' | 'not-published';

export interface CreatorStatisticsStateResponse {
  state: CreatorStatisticsApiState;
  period: 7 | 30;
  page: number;
}

export type CreatorStatisticsResponse = CreatorStatisticsReady | CreatorStatisticsStateResponse;

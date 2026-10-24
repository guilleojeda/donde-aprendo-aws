import { getCreatorRuntime } from '../../lib/creator-runtime.mjs';
import type { CreatorEditorDTO } from '../../types/creators';
import type {
  CreatorStatisticsReady,
} from '../../lib/creator-statistics-types';
import { loadCreatorEditor, type CreatorPagePrincipal } from './_creator-page';
import { parseCreatorStatisticsReady } from '../../lib/creator-statistics-response';
export { getStatisticsLinkLabel } from '../../lib/creator-statistics-labels';
export { parseCreatorStatisticsReady } from '../../lib/creator-statistics-response';

export type CreatorStatisticsPageState = 'ready' | 'no-profile' | 'not-published' | 'unavailable' | 'invalid-query';

export interface CreatorStatisticsPageLoad {
  principal: CreatorPagePrincipal;
  status: number;
  state: CreatorStatisticsPageState;
  period: 7 | 30;
  page: number;
  report?: CreatorStatisticsReady;
  editor?: CreatorEditorDTO;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function periodAndPage(search: URLSearchParams): { period: 7 | 30; page: number } | undefined {
  for (const key of search.keys()) {
    if (key !== 'periodo' && key !== 'pagina') return undefined;
  }
  const periods = search.getAll('periodo');
  const pages = search.getAll('pagina');
  if (periods.length > 1 || pages.length > 1) return undefined;
  const periodValue = periods[0] ?? '7';
  if (periodValue !== '7' && periodValue !== '30') return undefined;
  const pageValue = pages[0] ?? '1';
  if (!/^\d+$/.test(pageValue)) return undefined;
  const page = Number(pageValue);
  if (!Number.isSafeInteger(page) || page < 1) return undefined;
  return { period: Number(periodValue) as 7 | 30, page };
}

function readStateResponse(value: unknown, period: 7 | 30, page: number): 'no-profile' | 'not-published' | undefined {
  const item = record(value);
  return (item?.state === 'no-profile' || item?.state === 'not-published')
    && item.period === period && item.page === page
    ? item.state
    : undefined;
}

export async function loadCreatorStatisticsPage(request: Request): Promise<CreatorStatisticsPageLoad> {
  const selected = periodAndPage(new URL(request.url).searchParams);
  if (!selected) {
    const principal: CreatorPagePrincipal = { state: 'unavailable', isAdmin: false };
    return { principal, status: 400, state: 'invalid-query', period: 7, page: 1 };
  }

  const editorResult = await loadCreatorEditor(request);
  if (editorResult.status !== 200 || !editorResult.data) {
    return {
      principal: editorResult.principal,
      status: editorResult.status === 401 || editorResult.status === 403 ? editorResult.status : 503,
      state: 'unavailable',
      ...selected,
    };
  }

  try {
    const runtime = await getCreatorRuntime();
    const target = new URL('/api/creador/estadisticas/', request.url);
    target.searchParams.set('periodo', String(selected.period));
    target.searchParams.set('pagina', String(selected.page));
    const headers = new Headers();
    const cookie = request.headers.get('cookie');
    if (cookie) headers.set('cookie', cookie);
    const response = await runtime.service.handle(new Request(target, { method: 'GET', headers }));
    if (!response.ok) {
      return {
        principal: editorResult.principal,
        status: response.status === 401 || response.status === 403 ? response.status : 503,
        state: 'unavailable',
        ...selected,
        editor: editorResult.data,
      };
    }
    const body: unknown = await response.json();
    const state = readStateResponse(body, selected.period, selected.page);
    if (state) {
      return { principal: editorResult.principal, status: 200, state, ...selected, editor: editorResult.data };
    }
    const creatorId = editorResult.data.profile?.id;
    if (!creatorId) throw new TypeError('Published statistics have no matching editor profile.');
    const report = parseCreatorStatisticsReady(body, selected.period, selected.page, creatorId);
    if (!report) throw new TypeError('Statistics response is malformed.');
    return { principal: editorResult.principal, status: 200, state: 'ready', ...selected, report, editor: editorResult.data };
  } catch {
    return {
      principal: editorResult.principal,
      status: 503,
      state: 'unavailable',
      ...selected,
      editor: editorResult.data,
    };
  }
}

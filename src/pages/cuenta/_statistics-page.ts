import { getCreatorRuntime } from '../../lib/creator-runtime.mjs';
import type { CreatorEditorDTO } from '../../types/creators';
import type {
  CreatorStatisticsReady,
} from '../../lib/creator-statistics-types';
import { loadCreatorEditor, type CreatorPagePrincipal, type CreatorRequestContext } from './_creator-page';
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

export interface CreatorStatisticsSelection {
  period: 7 | 30;
  page: number;
}

export function readCreatorStatisticsSelection(
  search: URLSearchParams,
  { ownerView = false }: { ownerView?: boolean } = {},
): CreatorStatisticsSelection | undefined {
  const allowed = ownerView ? new Set(['vista', 'periodo', 'pagina']) : new Set(['periodo', 'pagina']);
  for (const key of search.keys()) {
    if (!allowed.has(key)) return undefined;
  }
  const views = search.getAll('vista');
  if (ownerView && (views.length !== 1 || views[0] !== 'estadisticas')) return undefined;
  if (!ownerView && views.length > 0) return undefined;
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

export async function loadCreatorStatisticsPage(
  request: Request,
  existingEditor?: Awaited<ReturnType<typeof loadCreatorEditor>>,
  requestContext?: CreatorRequestContext,
): Promise<CreatorStatisticsPageLoad> {
  const selected = readCreatorStatisticsSelection(new URL(request.url).searchParams, { ownerView: true });
  if (!selected) {
    const principal: CreatorPagePrincipal = existingEditor?.principal ?? { state: 'unavailable', isAdmin: false };
    return {
      principal,
      status: 400,
      state: 'invalid-query',
      period: 7,
      page: 1,
      ...(existingEditor?.data ? { editor: existingEditor.data } : {}),
    };
  }

  let runtime: Awaited<ReturnType<typeof getCreatorRuntime>> | undefined;
  let context = requestContext;
  let editorResult = existingEditor;
  if (!editorResult) {
    try {
      runtime = await getCreatorRuntime();
      context ??= await runtime.auth.getRequestContext(request);
    } catch {
      // Let the normal editor loader preserve its unavailable result.
    }
    editorResult = await loadCreatorEditor(request, context);
  }
  if (editorResult.status !== 200 || !editorResult.data) {
    return {
      principal: editorResult.principal,
      status: editorResult.status === 401 || editorResult.status === 403 ? editorResult.status : 503,
      state: 'unavailable',
      ...selected,
    };
  }

  if (!editorResult.data.profile) {
    return { principal: editorResult.principal, status: 200, state: 'no-profile', ...selected, editor: editorResult.data };
  }
  if (!editorResult.data.profile.published) {
    return { principal: editorResult.principal, status: 200, state: 'not-published', ...selected, editor: editorResult.data };
  }

  try {
    runtime ??= await getCreatorRuntime();
    context ??= await runtime.auth.getRequestContext(request);
    const body: unknown = await runtime.service.readCreatorStatistics(context, selected);
    const state = readStateResponse(body, selected.period, selected.page);
    if (state) {
      return {
        principal: editorResult.principal,
        status: 200,
        state,
        ...selected,
        editor: editorResult.data,
      };
    }
    const creatorId = editorResult.data.profile?.id;
    if (!creatorId) throw new TypeError('Published statistics have no matching editor profile.');
    const report = parseCreatorStatisticsReady(body, selected.period, selected.page, creatorId);
    if (!report) throw new TypeError('Statistics response is malformed.');
    return { principal: editorResult.principal, status: 200, state: 'ready', ...selected, report, editor: editorResult.data };
  } catch (error) {
    const statusValue = record(error)?.status;
    const status = statusValue === 401 || statusValue === 403 ? statusValue : 503;
    return {
      principal: editorResult.principal,
      status,
      state: 'unavailable',
      ...selected,
      editor: editorResult.data,
    };
  }
}

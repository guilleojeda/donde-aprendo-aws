import { useEffect, useReducer, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { CreatorEditorDTO } from '../../types/creators';
import { readCreatorEditorData, isAdoptableOwnerData, isCreatorOwnerSnapshot } from '../../lib/creator-owner-data';
import {
  createCreatorOwnerComparison,
  creatorOwnerWriteIntent,
  interpretCreatorOwnerPhotoFinalize,
  interpretCreatorOwnerResponse,
  prepareCreatorOwnerRequest,
} from '../../lib/creator-owner-commands';
import { creatorSessionRecoveryReason, classifyCreatorSessionCheck, readCreatorSessionResponse, isCreatorSessionBinding } from '../../lib/creator-session-response';
import { parseCreatorStatisticsReady } from '../../lib/creator-statistics-response';
import { normalizeCreatorText } from '../../lib/creator-values.mjs';
import { creatorOwnerSeriesHref, parseCreatorOwnerSeriesQuery, type CreatorOwnerSeriesMembership } from '../../lib/creator-owner-series';
import {
  createCreatorOwnerState,
  creatorOwnerDraftIsDirty,
  creatorOwnerEditorChangedSince,
  creatorOwnerReducer,
  type CreatorOwnerEditor,
  type CreatorOwnerListContext,
  type CreatorOwnerState,
} from '../../lib/creator-owner-state';
import CreatorOwnerEditorDialog from './CreatorOwnerEditorDialog';
import CreatorOwnerIdentityPanel from './CreatorOwnerIdentityPanel';
import CreatorOwnerSeriesPanel from './CreatorOwnerSeriesPanel';

interface Props {
  data: CreatorEditorDTO;
  accountEmail: string;
  csrfToken: string;
  sessionBinding: string;
  isAdmin: boolean;
  publicOrigin: string;
  seriesQuery: import('../../lib/creator-owner-series').CreatorOwnerSeriesQuery;
  seriesQueryError?: string;
  logout?: ComponentChildren;
}

const PHOTO_LIMIT_BYTES = 15 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function createInitialState(props: Props): CreatorOwnerState {
  let initialCreate: { displayName: string; slug: string } | undefined;
  let pendingSeriesSearch: string | undefined;
  let pendingChapterSearch: string | undefined;
  let pendingMembership: CreatorOwnerSeriesMembership | undefined;
  if (typeof document !== 'undefined') {
    const name = document.querySelector<HTMLInputElement>('[data-owner-create-name]');
    const slug = document.querySelector<HTMLInputElement>('[data-owner-create-slug]');
    if (name && slug) initialCreate = { displayName: name.value, slug: slug.value };
    const seriesSearch = document.querySelector<HTMLInputElement>('[data-series-search]');
    const chapterSearch = document.querySelector<HTMLInputElement>('[data-chapter-search]');
    const chapterMembership = document.querySelector<HTMLSelectElement>('[data-chapter-membership]');
    if (seriesSearch) pendingSeriesSearch = seriesSearch.value;
    if (chapterSearch) pendingChapterSearch = chapterSearch.value;
    if (chapterMembership && ['todos', 'incluidos', 'disponibles'].includes(chapterMembership.value)) {
      pendingMembership = chapterMembership.value as CreatorOwnerSeriesMembership;
    }
  }
  return createCreatorOwnerState({
    data: props.data,
    accountEmail: props.accountEmail,
    csrfToken: props.csrfToken,
    sessionBinding: props.sessionBinding,
    isAdmin: props.isAdmin,
    publicOrigin: props.publicOrigin,
    seriesQuery: props.seriesQuery,
    ...(props.seriesQueryError ? { seriesQueryError: props.seriesQueryError } : {}),
    ...(initialCreate ? { initialCreate } : {}),
    ...(pendingSeriesSearch !== undefined ? { pendingSeriesSearch } : {}),
    ...(pendingChapterSearch !== undefined ? { pendingChapterSearch } : {}),
    ...(pendingMembership ? { pendingMembership } : {}),
  });
}

function nextId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

function isWriteActive(state: CreatorOwnerState): boolean {
  return state.attempt.status === 'sending';
}

function hasUnresolvedAttempt(state: CreatorOwnerState): boolean {
  return state.attempt.status === 'checking' || state.attempt.status === 'uncertain' || state.attempt.status === 'conflict';
}

function shouldGuardExit(state: CreatorOwnerState): boolean {
  return creatorOwnerDraftIsDirty(state.editor) || hasUnresolvedAttempt(state);
}

async function detailText(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.clone().json();
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function seriesDraftSlug(value: string): string {
  return normalizeCreatorText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
}

function loginRecoveryMessage(reason: 'expired' | 'csrf'): string {
  return reason === 'expired'
    ? 'La sesión terminó. Ingresa con la misma cuenta en otra pestaña y comprueba la sesión antes de volver a guardar.'
    : 'La sesión cambió. Comprueba la sesión antes de volver a intentar; conservamos tus cambios.';
}

function responseLink(event: MouseEvent): HTMLAnchorElement | undefined {
  const target = event.target;
  if (!(target instanceof Element)) return undefined;
  const anchor = target.closest('a[href]');
  return anchor instanceof HTMLAnchorElement ? anchor : undefined;
}

function isOrdinaryLinkClick(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    && !anchor.hasAttribute('download') && (!anchor.target || anchor.target.toLowerCase() === '_self');
}

function ownerIndex(state: unknown): number | undefined {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return undefined;
  const value = (state as Record<string, unknown>).creatorOwnerIndex;
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

function ownerSeriesQueryWasValid(state: unknown): boolean | undefined {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return undefined;
  const value = (state as Record<string, unknown>).creatorOwnerSeriesQueryValid;
  return typeof value === 'boolean' ? value : undefined;
}

function navigationType(): PerformanceNavigationTiming['type'] | undefined {
  if (typeof performance === 'undefined') return undefined;
  const entry = performance.getEntriesByType('navigation')[0];
  return entry ? (entry as PerformanceNavigationTiming).type : undefined;
}

function withOwnerHistoryState(state: unknown, index: number, seriesQueryValid: boolean): Record<string, unknown> {
  return typeof state === 'object' && state !== null && !Array.isArray(state)
    ? { ...(state as Record<string, unknown>), creatorOwnerIndex: index, creatorOwnerSeriesQueryValid: seriesQueryValid }
    : { creatorOwnerIndex: index, creatorOwnerSeriesQueryValid: seriesQueryValid };
}

export default function CreatorOwnerApp(props: Props) {
  const [state, dispatch] = useReducer(creatorOwnerReducer, props, createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const rootRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const historyIndexRef = useRef(0);
  const pendingHistoryRef = useRef<{ destinationIndex: number; currentIndex: number; href: string } | undefined>(undefined);
  const restoringHistoryIndexRef = useRef<number | undefined>(undefined);
  const allowedHistoryIndexRef = useRef<number | undefined>(undefined);
  const activityRequestSequenceRef = useRef(0);
  const activityStartedRef = useRef<{ key: string; sequence: number } | undefined>(undefined);
  const handledTransitionRef = useRef<string | undefined>(undefined);
  const previousEditorKeyRef = useRef<string | undefined>(undefined);

  const currentProfile = state.observed.profile;
  const writeDisabled = !state.runtimeReady || state.session.state !== 'ready'
    || state.attempt.status === 'sending' || state.attempt.status === 'checking'
    || state.attempt.status === 'uncertain' || state.attempt.status === 'conflict';

  useEffect(() => {
    dispatch({ type: 'runtime-ready' });
    const historyState = window.history.state;
    const existingIndex = ownerIndex(historyState);
    const existingSeriesQueryValidity = ownerSeriesQueryWasValid(historyState);
    const restoringManagedEntry = props.seriesQueryError === 'series' && navigationType() === 'back_forward'
      && existingIndex !== undefined && existingSeriesQueryValidity === true;
    historyIndexRef.current = existingIndex ?? 0;
    if (existingIndex === undefined || existingSeriesQueryValidity === undefined) {
      const nextState = withOwnerHistoryState(historyState, existingIndex ?? 0,
        props.seriesQueryError ? restoringManagedEntry : true);
      window.history.replaceState(nextState, '', window.location.href);
    }
    if (restoringManagedEntry) {
      const destination = new URL(window.location.href);
      destination.searchParams.delete('serie');
      destination.searchParams.delete('buscarCapitulos');
      destination.searchParams.delete('pertenencia');
      destination.searchParams.delete('paginaCapitulos');
      const parsed = parseCreatorOwnerSeriesQuery(destination.searchParams, stateRef.current.observed.series);
      if (parsed.valid) {
        window.history.replaceState(window.history.state, '', creatorOwnerSeriesHref(parsed.query));
        dispatch({ type: 'apply-query', query: parsed.query });
      }
    }

    function blockForExit(transition?: CreatorOwnerState['location']['transition']): boolean {
      const latest = stateRef.current;
      if (isWriteActive(latest)) {
        dispatch({ type: 'set-message', text: 'Estamos guardando la acción iniciada. Espera a que termine antes de salir.', kind: 'info' });
        return true;
      }
      if (!shouldGuardExit(latest)) return false;
      if (transition) dispatch({ type: 'set-transition', transition });
      dispatch({ type: 'set-prompt', prompt: 'exit' });
      return true;
    }

    function queryFromForm(form: HTMLFormElement): URL | undefined {
      const target = new URL(form.action || window.location.href, window.location.href);
      target.search = '';
      const data = new FormData(form);
      for (const [key, value] of data.entries()) {
        if (typeof value === 'string') target.searchParams.append(key, value);
      }
      return target;
    }

    function showSeriesHref(href: string, history: 'push' | 'replace' = 'push'): boolean {
      const destination = new URL(href, window.location.href);
      if (destination.origin !== window.location.origin || destination.pathname !== '/cuenta/') return false;
      const parsed = parseCreatorOwnerSeriesQuery(destination.searchParams, stateRef.current.observed.series);
      if (!parsed.valid) return false;
      if (history === 'push') {
        const index = historyIndexRef.current + 1;
        const old = window.history.state;
        const next = withOwnerHistoryState(old, index, true);
        window.history.pushState(next, '', `${destination.pathname}${destination.search}${destination.hash}`);
        historyIndexRef.current = index;
      } else {
        window.history.replaceState(withOwnerHistoryState(window.history.state, historyIndexRef.current, true), '', `${destination.pathname}${destination.search}${destination.hash}`);
      }
      dispatch({ type: 'apply-query', query: parsed.query });
      return true;
    }

    const onClick = (event: MouseEvent) => {
      const anchor = responseLink(event);
      if (!anchor || !isOrdinaryLinkClick(event, anchor)) return;
      const href = anchor.href;
      const url = new URL(href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname
        && url.search === window.location.search && url.hash) return;
      const isSeriesGet = url.origin === window.location.origin && url.pathname === '/cuenta/'
        && url.searchParams.getAll('vista').includes('series') && !url.searchParams.getAll('vista').includes('solicitudes');
      if (isSeriesGet) {
        if (blockForExit({ href: `${url.pathname}${url.search}${url.hash}`, kind: 'anchor' })) {
          event.preventDefault();
          return;
        }
        if (showSeriesHref(`${url.pathname}${url.search}${url.hash}`)) event.preventDefault();
        return;
      }
      if (blockForExit({ href: url.href, kind: 'anchor' })) event.preventDefault();
    };

    const onSubmit = (event: SubmitEvent) => {
      if (event.defaultPrevented || !(event.target instanceof HTMLFormElement)) return;
      const form = event.target;
      if (form.matches('[data-account-logout], [data-owner-form]')) return;
      if (form.method.toLowerCase() !== 'get') return;
      const target = queryFromForm(form);
      if (!target) return;
      const isSeriesGet = target.pathname === '/cuenta/' && target.searchParams.getAll('vista').includes('series');
      const transition = { href: `${target.pathname}${target.search}${target.hash}`, kind: 'form' as const };
      if (blockForExit(transition)) {
        event.preventDefault();
        return;
      }
      if (isSeriesGet && showSeriesHref(transition.href)) event.preventDefault();
    };

    const onLogout = (event: Event) => {
      if (event.defaultPrevented) return;
      if (blockForExit({ href: '/cuenta/salir/', kind: 'logout' })) event.preventDefault();
    };

    const onPopState = () => {
      const destinationIndex = ownerIndex(window.history.state);
      const targetIndex = destinationIndex ?? Math.max(0, historyIndexRef.current - 1);
      if (restoringHistoryIndexRef.current === targetIndex) {
        restoringHistoryIndexRef.current = undefined;
        historyIndexRef.current = targetIndex;
        return;
      }
      if (allowedHistoryIndexRef.current === targetIndex) {
        allowedHistoryIndexRef.current = undefined;
        pendingHistoryRef.current = undefined;
        historyIndexRef.current = targetIndex;
        const url = new URL(window.location.href);
        const parsed = parseCreatorOwnerSeriesQuery(url.searchParams, stateRef.current.observed.series);
        if (parsed.valid) dispatch({ type: 'apply-query', query: parsed.query });
        else if (parsed.reason === 'series') {
          if (ownerSeriesQueryWasValid(window.history.state) === true) {
            const normalized = { ...stateRef.current.location.query, serie: '', buscarCapitulos: '', pertenencia: 'todos' as const, paginaCapitulos: 1 };
            window.history.replaceState(withOwnerHistoryState(window.history.state, targetIndex, true), '', creatorOwnerSeriesHref(normalized));
            dispatch({ type: 'apply-query', query: normalized });
          } else dispatch({ type: 'set-series-query-error', reason: 'series' });
        }
        dispatch({ type: 'set-transition' });
        return;
      }
      if (blockForExit({ href: window.location.href, kind: 'history', ...(destinationIndex !== undefined ? { historyIndex: destinationIndex } : {}) })) {
        if (destinationIndex !== undefined) {
          pendingHistoryRef.current = { destinationIndex, currentIndex: historyIndexRef.current, href: window.location.href };
          restoringHistoryIndexRef.current = historyIndexRef.current;
          window.history.go(historyIndexRef.current - destinationIndex);
        }
        return;
      }
      historyIndexRef.current = targetIndex;
      const url = new URL(window.location.href);
      const parsed = parseCreatorOwnerSeriesQuery(url.searchParams, stateRef.current.observed.series);
      if (parsed.valid) dispatch({ type: 'apply-query', query: parsed.query });
      else if (parsed.reason === 'series') {
        if (ownerSeriesQueryWasValid(window.history.state) === true) {
          const normalized = { ...stateRef.current.location.query, serie: '', buscarCapitulos: '', pertenencia: 'todos' as const, paginaCapitulos: 1 };
          window.history.replaceState(withOwnerHistoryState(window.history.state, targetIndex, true), '', creatorOwnerSeriesHref(normalized));
          dispatch({ type: 'apply-query', query: normalized });
        } else dispatch({ type: 'set-series-query-error', reason: 'series' });
      }
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const latest = stateRef.current;
      if (!isWriteActive(latest) && !shouldGuardExit(latest)) return;
      event.preventDefault();
    };

    const root = rootRef.current;
    root?.addEventListener('account:logout', onLogout);
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      root?.removeEventListener('account:logout', onLogout);
      document.removeEventListener('click', onClick);
      document.removeEventListener('submit', onSubmit);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const transition = state.location.transition;
    if (!transition || state.location.prompt !== 'none' || state.editor || isWriteActive(state)) return;
    const key = `${transition.kind}:${transition.href}:${transition.historyIndex ?? ''}`;
    if (handledTransitionRef.current === key) return;
    handledTransitionRef.current = key;
    if (transition.kind === 'history') {
      const pending = pendingHistoryRef.current;
      if (!pending) return;
      const distance = pending.destinationIndex - historyIndexRef.current;
      if (distance === 0) return;
      allowedHistoryIndexRef.current = pending.destinationIndex;
      window.history.go(distance);
      return;
    }
    if (transition.kind === 'logout') {
      const form = document.querySelector<HTMLFormElement>('[data-account-logout]');
      form?.requestSubmit();
      return;
    }
    window.location.assign(transition.href);
  }, [state.location.transition, state.location.prompt, state.editor, state.attempt.status]);

  useEffect(() => {
    const selector = state.location.focusAfterRender;
    if (!selector) return;
    const root = rootRef.current;
    const target = root?.querySelector<HTMLElement>(selector);
    target?.focus({ preventScroll: true });
    dispatch({ type: 'clear-focus' });
  }, [state.location.focusAfterRender]);

  useEffect(() => {
    const editorKey = state.editor?.key;
    if (previousEditorKeyRef.current && !editorKey && !state.location.transition) {
      const destination = returnFocusRef.current
        ?? rootRef.current?.querySelector<HTMLElement>('#owner-series-search, #owner-create-name');
      destination?.focus({ preventScroll: true });
      returnFocusRef.current = null;
    }
    previousEditorKeyRef.current = editorKey;
  }, [state.editor?.key, state.location.transition]);

  useEffect(() => {
    const key = `${currentProfile?.id ?? ''}:${currentProfile?.published ? 'published' : 'private'}:${state.activity.period}`;
    if (!currentProfile?.published) {
      activityRequestSequenceRef.current += 1;
      return;
    }
    if (activityStartedRef.current?.key === key && activityStartedRef.current.sequence === state.activity.sequence) return;
    const sequence = Math.max(activityRequestSequenceRef.current + 1, state.activity.sequence + 1);
    activityRequestSequenceRef.current = sequence;
    activityStartedRef.current = { key, sequence };
    const profileId = currentProfile.id;
    const period = state.activity.period;
    dispatch({ type: 'activity-loading', period, sequence });
    const target = new URL('/api/creador/estadisticas/', window.location.origin);
    target.searchParams.set('periodo', String(period));
    target.searchParams.set('pagina', '1');
    void fetch(target, { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } })
      .then(async (response) => {
        const observedProfile = stateRef.current.observed.profile;
        if (activityRequestSequenceRef.current !== sequence || observedProfile?.id !== profileId || !observedProfile.published) return;
        if (!response.ok) {
          dispatch({ type: 'activity-failed', period, sequence, message: response.status === 401
            ? 'Tu sesión terminó. No modificamos tu página; vuelve a ingresar para consultar las estadísticas.'
            : response.status === 403 ? 'Esta cuenta no tiene acceso a estas estadísticas.'
              : 'No pudimos cargar las estadísticas. Tu página sigue disponible; inténtalo de nuevo.' });
          return;
        }
        const body: unknown = await response.json();
        const profileAfterBody = stateRef.current.observed.profile;
        if (activityRequestSequenceRef.current !== sequence || profileAfterBody?.id !== profileId || !profileAfterBody.published) return;
        const report = parseCreatorStatisticsReady(body, period, 1, profileId);
        if (!report) {
          dispatch({ type: 'activity-failed', period, sequence, message: 'No pudimos validar estas estadísticas. No mostramos cifras que no correspondan a tu página.' });
          return;
        }
        dispatch({ type: 'activity-ready', period, sequence, report });
      }).catch(() => {
        const observedProfile = stateRef.current.observed.profile;
        if (activityRequestSequenceRef.current === sequence && observedProfile?.id === profileId && observedProfile.published) {
          dispatch({ type: 'activity-failed', period, sequence, message: 'No pudimos cargar las estadísticas. Tu página sigue disponible; inténtalo de nuevo.' });
        }
      });
  }, [currentProfile?.id, currentProfile?.published, state.activity.period, state.activity.sequence]);

  useEffect(() => {
    if (state.session.state !== 'ready') return;
    const logout = document.querySelector<HTMLFormElement>('[data-account-logout]');
    const token = logout?.querySelector<HTMLInputElement>('input[name="csrfToken"]');
    if (logout && token && token.value !== state.session.csrfToken) token.value = state.session.csrfToken;
  }, [state.session]);

  const setMessage = (text: string, kind: 'info' | 'success' | 'error' = 'info') => dispatch({ type: 'set-message', text, kind });

  function openProfileEditor(section: 'datos' | 'redes' | 'foto') {
    const profile = stateRef.current.observed.profile;
    if (!profile || stateRef.current.session.state !== 'ready') return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (section === 'foto') {
      dispatch({ type: 'open-editor', editor: { kind: 'photo', key: `photo:${profile.id}`, base: { ...profile } } });
      return;
    }
    if (section === 'datos') {
      dispatch({ type: 'open-editor', editor: { kind: 'profile', section, key: `profile:datos:${profile.id}`, base: { ...profile }, draft: {
        displayName: profile.displayName, slug: profile.slug, city: profile.city ?? '', country: profile.country ?? '', programs: [...profile.programs], bio: profile.bio ?? '',
      } } });
      return;
    }
    dispatch({ type: 'open-editor', editor: { kind: 'profile', section, key: `profile:redes:${profile.id}`, base: { ...profile }, draft: {
      instagram: profile.socials.instagram ?? '', x: profile.socials.x ?? '', linkedin: profile.socials.linkedin ?? '',
      awsBuilder: profile.socials.awsBuilder ?? '', website: profile.socials.website ?? '',
    } } });
  }

  function openSeriesEditor(seriesId?: string) {
    const latest = stateRef.current;
    const profile = latest.observed.profile;
    if (!profile || latest.session.state !== 'ready') return;
    const series = seriesId ? latest.observed.series.find(({ id }) => id === seriesId) : undefined;
    if (seriesId && !series) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: {
      kind: 'series', key: `series:${series?.id ?? 'new'}`, baseProfile: { ...profile }, baseSeries: series ? { ...series } : null,
      draft: { name: series?.name ?? '', slug: series?.slug ?? '', description: series?.description ?? '' }, slugManuallyEdited: Boolean(series),
    } });
  }

  function openMoveEditor(placementId: string) {
    const latest = stateRef.current;
    const profile = latest.observed.profile;
    const series = latest.observed.series.find(({ id }) => id === latest.location.query.serie);
    const placement = latest.observed.links.find(({ placementId: id }) => id === placementId);
    if (!profile || !series || !placement) return;
    const order = latest.observed.links.filter((link) => link.series.some(({ seriesId }) => seriesId === series.id))
      .sort((left, right) => (left.series.find(({ seriesId }) => seriesId === series.id)?.position ?? 0)
        - (right.series.find(({ seriesId }) => seriesId === series.id)?.position ?? 0)
        || left.placementId.localeCompare(right.placementId));
    const index = order.findIndex(({ placementId: id }) => id === placementId);
    if (index < 0) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: {
      kind: 'move-chapter', key: `move:${series.id}:${placement.placementId}`, seriesId: series.id, placementId: placement.placementId,
      baseProfile: { ...profile }, baseSeries: { ...series }, basePlacement: { ...placement, series: placement.series.map((item) => ({ ...item })) },
      baseOrder: order.map(({ placementId: id }) => id), targetPosition: String(index + 1),
    } });
  }

  function closeOrGuardEditor() {
    const latest = stateRef.current;
    if (isWriteActive(latest)) {
      setMessage('Estamos guardando la acción iniciada. Espera a que termine antes de salir.', 'info');
      return;
    }
    if (shouldGuardExit(latest)) {
      dispatch({ type: 'set-prompt', prompt: 'exit' });
      return;
    }
    dispatch({ type: 'close-editor' });
  }

  function listContext(operation: CreatorOwnerListContext['operation'], seriesId?: string, placementId?: string): CreatorOwnerListContext | undefined {
    const latest = stateRef.current;
    const profile = latest.observed.profile;
    if (!profile) return undefined;
    const series = seriesId ? latest.observed.series.find(({ id }) => id === seriesId) : undefined;
    const placement = placementId ? latest.observed.links.find(({ placementId: id }) => id === placementId) : undefined;
    if (seriesId && !series || placementId && !placement) return undefined;
    return {
      kind: 'list-command', key: `list:${operation}:${seriesId ?? ''}:${placementId ?? ''}`, operation,
      baseProfile: { ...profile }, ...(series ? { baseSeries: { ...series } } : {}),
      ...(placement ? { basePlacement: { ...placement, series: placement.series.map((item) => ({ ...item })) } } : {}),
      ...(seriesId ? { seriesId } : {}), ...(placementId ? { placementId } : {}),
    };
  }

  function validateSocialUrls(editor: Extract<CreatorOwnerEditor, { kind: 'profile'; section: 'redes' }>): boolean {
    for (const key of ['instagram', 'x', 'linkedin', 'awsBuilder', 'website'] as const) {
      const value = normalizeCreatorText(editor.draft[key]);
      if (!value) continue;
      let valid = false;
      try {
        const url = new URL(value);
        valid = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
      } catch { valid = false; }
      const input = document.querySelector<HTMLInputElement>(`#owner-social-${key}`);
      input?.setCustomValidity(valid ? '' : 'Ingresa una URL HTTP o HTTPS sin usuario ni contraseña.');
      if (!valid) { input?.reportValidity(); return false; }
    }
    return true;
  }

  async function startCommand(intent: ReturnType<typeof creatorOwnerWriteIntent>) {
    const latest = stateRef.current;
    if (latest.session.state !== 'ready' || isWriteActive(latest) || latest.attempt.status === 'checking') return;
    let request;
    try { request = prepareCreatorOwnerRequest(intent); }
    catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos preparar esta acción. Conservamos tus cambios.', 'error');
      return;
    }
    dispatch({ type: 'begin-write', intent });
    const token = latest.session.csrfToken;
    try {
      const response = await fetch(request.path, {
        method: request.method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'x-csrf-token': token, 'x-creator-page-binding': latest.sessionBinding },
        body: JSON.stringify(request.body),
      });
      const outcome = await interpretCreatorOwnerResponse(response, intent, latest.observed);
      if (outcome.kind === 'session') {
        dispatch({ type: 'write-rejected', intentId: intent.id, message: outcome.message });
        dispatch({ type: 'session-required', reason: outcome.reason, message: outcome.message });
        return;
      }
      if (outcome.kind === 'uncertain' || outcome.kind === 'conflict') {
        dispatch({ type: 'write-uncertain', intentId: intent.id, status: outcome.kind, message: outcome.message });
        return;
      }
      if (outcome.kind === 'rejected') {
        dispatch({ type: 'write-rejected', intentId: intent.id, message: outcome.message });
        if (outcome.viablePosition !== undefined) dispatch({ type: 'set-move-suggestion', targetPosition: outcome.viablePosition });
        return;
      }
      const correction = creatorOwnerEditorChangedSince(intent.capture, stateRef.current.editor);
      dispatch({ type: 'write-confirmed', intentId: intent.id, effect: outcome.effect, correction });
      if (!correction && intent.capture.kind !== 'list-command') dispatch({ type: 'close-editor' });
    } catch {
      dispatch({ type: 'write-uncertain', intentId: intent.id, status: 'uncertain', message: 'No pudimos confirmar el resultado. Comprueba lo guardado antes de volver a intentar; no repetiremos la escritura.' });
    }
  }

  function submitCurrentEditor() {
    const latest = stateRef.current;
    const editor = latest.editor;
    if (!editor || editor.kind === 'create-profile' || editor.kind === 'photo') {
      if (editor?.kind === 'photo') void startPhotoUpload(editor);
      return;
    }
    if (editor.kind === 'profile' && editor.section === 'redes' && !validateSocialUrls(editor)) return;
    const intent = creatorOwnerWriteIntent(nextId(editor.kind), editor);
    void startCommand(intent);
  }

  async function startPhotoUpload(editor: Extract<CreatorOwnerEditor, { kind: 'photo' }>) {
    const latest = stateRef.current;
    const file = editor.file;
    if (!file || !latest.observed.profile || latest.session.state !== 'ready' || isWriteActive(latest)) return;
    if (!PHOTO_TYPES.has(file.type) || file.size > PHOTO_LIMIT_BYTES) {
      setMessage('Elige una imagen JPEG, PNG o WebP de hasta 15 MiB.', 'error');
      return;
    }
    const intent = creatorOwnerWriteIntent(nextId('photo'), editor);
    dispatch({ type: 'begin-write', intent });
    let finalizationRequested = false;
    const headers = { accept: 'application/json', 'content-type': 'application/json', 'x-csrf-token': latest.session.csrfToken, 'x-creator-page-binding': latest.sessionBinding };
    const classifyAuthorizationFailure = async (response: Response) => {
      const payload = await readCreatorSessionResponse(response);
      const reason = creatorSessionRecoveryReason(response.status, payload);
      if (reason) {
        dispatch({ type: 'write-rejected', intentId: intent.id, message: loginRecoveryMessage(reason) });
        dispatch({ type: 'session-required', reason, message: loginRecoveryMessage(reason) });
        return true;
      }
      if (response.status === 409) {
        dispatch({ type: 'write-uncertain', intentId: intent.id, status: 'conflict', message: 'El perfil cambió antes de iniciar la carga. Comprueba qué foto quedó activa antes de volver a cargar.' });
        return true;
      }
      if (response.status === 408 || response.status >= 500) {
        dispatch({ type: 'write-uncertain', intentId: intent.id, status: 'uncertain', message: 'No pudimos confirmar si se preparó la carga. Comprueba qué foto quedó activa antes de volver a intentarlo.' });
        return true;
      }
      dispatch({ type: 'write-rejected', intentId: intent.id, message: response.status === 422
        ? 'La imagen no cumple los requisitos. El archivo seleccionado sigue disponible.'
        : 'No pudimos preparar la carga. El archivo seleccionado sigue disponible.' });
      return true;
    };
    try {
      const authorize = await fetch('/api/creador/foto/autorizar/', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers,
        body: JSON.stringify({ version: editor.base.version }) });
      if (!authorize.ok) { await classifyAuthorizationFailure(authorize); return; }
      const upload = await detailText(authorize);
      const post = upload?.post;
      const fields = typeof post === 'object' && post !== null && !Array.isArray(post) ? (post as Record<string, unknown>).fields : undefined;
      const postUrl = typeof post === 'object' && post !== null && !Array.isArray(post) ? (post as Record<string, unknown>).url : undefined;
      const uploadId = upload?.uploadId;
      if (typeof uploadId !== 'string' || !uploadId || typeof postUrl !== 'string' || !fields || typeof fields !== 'object' || Array.isArray(fields)) {
        dispatch({ type: 'write-uncertain', intentId: intent.id, status: 'uncertain', message: 'No pudimos validar la preparación de la carga. Comprueba qué foto quedó activa.' });
        return;
      }
      let destination: URL;
      try { destination = new URL(postUrl); } catch {
        dispatch({ type: 'write-uncertain', intentId: intent.id, status: 'uncertain', message: 'No pudimos validar el destino de la carga. Comprueba qué foto quedó activa.' });
        return;
      }
      if (destination.username || destination.password || !['https:', ...(destination.origin === window.location.origin ? ['http:'] : [])].includes(destination.protocol)) {
        dispatch({ type: 'write-uncertain', intentId: intent.id, status: 'uncertain', message: 'No pudimos validar el destino de la carga. Comprueba qué foto quedó activa.' });
        return;
      }
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) if (typeof value === 'string') form.append(key, value);
      form.append('file', file);
      const uploadResponse = await fetch(destination, { method: 'POST', mode: 'cors', credentials: 'omit', body: form });
      if (!uploadResponse.ok) {
        dispatch({ type: 'clear-photo-upload', intentId: intent.id });
        dispatch({ type: 'write-rejected', intentId: intent.id, message: 'No pudimos subir la foto. La anterior sigue activa y conservamos el archivo seleccionado.' });
        return;
      }
      dispatch({ type: 'photo-upload-started', intentId: intent.id, uploadId, file });
      finalizationRequested = true;
      const finish = await fetch('/api/creador/foto/finalizar/', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers,
        body: JSON.stringify({ uploadId, version: editor.base.version }) });
      const outcome = await interpretCreatorOwnerPhotoFinalize(finish, intent, uploadId);
      if (outcome.kind === 'session') {
        dispatch({ type: 'write-rejected', intentId: intent.id, message: outcome.message });
        dispatch({ type: 'session-required', reason: outcome.reason, message: outcome.message });
        return;
      }
      if (outcome.kind === 'uncertain' || outcome.kind === 'conflict') {
        dispatch({ type: 'write-uncertain', intentId: intent.id, status: outcome.kind, message: outcome.message });
        return;
      }
      if (outcome.kind === 'rejected') {
        dispatch({ type: 'write-rejected', intentId: intent.id, message: outcome.message });
        return;
      }
      const current = stateRef.current.editor;
      const correction = current?.kind === 'photo' && current.file !== undefined && current.file !== file;
      dispatch({ type: 'write-confirmed', intentId: intent.id, effect: outcome.effect, correction });
      if (!correction) dispatch({ type: 'close-editor' });
    } catch {
      if (finalizationRequested) {
        dispatch({ type: 'write-uncertain', intentId: intent.id, status: 'uncertain', message: 'No pudimos confirmar si la foto se guardó. Comprueba cuál quedó activa antes de volver a cargar.' });
      } else {
        dispatch({ type: 'write-rejected', intentId: intent.id, message: 'No pudimos completar la carga. La foto anterior sigue activa y conservamos el archivo elegido.' });
      }
    }
  }

  async function checkCurrentAttempt() {
    const latest = stateRef.current;
    if (latest.attempt.status !== 'uncertain' && latest.attempt.status !== 'conflict') return;
    const intent = latest.attempt.intent;
    if (isWriteActive(latest)) return;
    const checkId = nextId('check');
    dispatch({ type: 'begin-check', intentId: intent.id, checkId });
    const binding = latest.sessionBinding;
    const checkIsCurrent = () => {
      const current = stateRef.current;
      if (current.attempt.status !== 'checking' || current.attempt.intent.id !== intent.id || current.attempt.checkId !== checkId) return false;
      if (intent.capture.kind === 'list-command') {
        return !current.editor && JSON.stringify(current.location.query) === JSON.stringify(latest.location.query);
      }
      return current.editor?.key === intent.editorKey && current.editor.kind === intent.capture.kind;
    };
    try {
      const response = await fetch('/api/creador/perfil/', { method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { 'x-creator-page-binding': binding, accept: 'application/json' } });
      const payload = await readCreatorSessionResponse(response);
      if (!checkIsCurrent()) return;
      const recoveryReason = creatorSessionRecoveryReason(response.status, payload);
      if (recoveryReason) {
        dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: loginRecoveryMessage(recoveryReason) });
        dispatch({ type: 'session-required', reason: recoveryReason, message: loginRecoveryMessage(recoveryReason) });
        return;
      }
      if (!response.ok) {
        const sessionState = classifyCreatorSessionCheck(response.status, payload);
        if (sessionState.state === 'disabled' || sessionState.state === 'context-changed' || sessionState.state === 'invalid-context') {
          const reason = sessionState.state === 'disabled' ? 'disabled' : sessionState.state === 'context-changed' ? 'different-principal' : 'invalid-context';
          const message = sessionState.state === 'disabled' ? 'Esta cuenta está desactivada. Conservamos tus cambios.'
            : sessionState.state === 'context-changed' ? 'La cuenta o el rol activo no coinciden con esta página. Vuelve a la cuenta original para comprobar; conservamos tus cambios.'
              : 'El contexto de esta página no es válido. Abre una página nueva con la cuenta original.';
          dispatch({ type: 'check-failed', intentId: intent.id, checkId, message });
          dispatch({ type: 'session-blocked', reason, message });
          return;
        }
        dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: 'No pudimos leer el estado guardado. Conservamos tus cambios; puedes volver a comprobar.' });
        return;
      }
      const raw: unknown = await response.json();
      const now = stateRef.current;
      if (!checkIsCurrent()) return;
      if (!isCreatorOwnerSnapshot(raw)) {
        dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: 'La lectura no contiene un estado completo y coherente de esta página. Conservamos tu edición.' });
        return;
      }
      const snapshot = readCreatorEditorData(raw);
      const current = stateRef.current;
      if (current.observed.profile && snapshot.profile?.id === current.observed.profile.id
        && snapshot.profile.version < current.observed.profile.version) {
        dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: 'La lectura devolvió una versión anterior a la ya observada. Conservamos tus cambios y no adoptamos esa respuesta.' });
        return;
      }
      if (intent.kind === 'photo' && intent.capture.kind === 'photo') {
        if (!isAdoptableOwnerData(raw) || snapshot.profile?.id !== intent.capture.base.id) {
          dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: 'No pudimos confirmar que la foto corresponda a esta página. Conservamos el archivo elegido.' });
          return;
        }
        const uploadId = intent.capture.uploadId;
        const uploadedFile = intent.capture.uploadedFile;
        const uploaded = Boolean(uploadId && String(snapshot.profile.photo?.version) === uploadId);
        dispatch({ type: 'photo-check-complete', intentId: intent.id, snapshot, uploaded, ...(uploadedFile ? { uploadedFile } : {}) });
        if (uploaded && stateRef.current.editor?.kind === 'photo' && stateRef.current.editor.file === uploadedFile) dispatch({ type: 'close-editor' });
        return;
      }
      const comparison = createCreatorOwnerComparison(intent, snapshot, now.editor);
      if (!comparison.canAdopt && intent.kind !== 'save-series') {
        comparison.message = intent.kind === 'chapter-move'
          ? 'El capítulo o la serie ya no están disponibles. Conservamos el destino para que decidas cómo seguir.'
          : 'La lectura no coincide con la página que abrió esta edición. Conservamos tus cambios.';
      }
      dispatch({ type: 'check-compared', intentId: intent.id, checkId, comparison });
      if (intent.capture.kind === 'list-command' && comparison.canAdopt) {
        dispatch({ type: 'adopt-comparison', comparisonId: comparison.id });
      }
    } catch {
      const now = stateRef.current;
      if (now.attempt.status === 'checking' && now.attempt.intent.id === intent.id && now.attempt.checkId === checkId) {
        dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: 'No pudimos conectar para leer el estado guardado. Tus cambios siguen aquí; puedes volver a comprobar.' });
      }
    }
  }

  async function checkSession() {
    const latest = stateRef.current;
    if (latest.session.state !== 'recovery-required') return;
    const recoveryReason = latest.session.reason;
    if (isWriteActive(latest)) {
      setMessage('Espera a que termine la operación antes de comprobar la sesión. Tus cambios siguen aquí.', 'info');
      return;
    }
    if (!isCreatorSessionBinding(latest.sessionBinding)) {
      dispatch({ type: 'session-blocked', reason: 'invalid-context', message: 'No pudimos comprobar el contexto de esta página. Ingresa con la cuenta original y vuelve a abrirla.' });
      return;
    }
    dispatch({ type: 'session-check-started' });
    try {
      const response = await fetch('/api/creador/sesion/', { method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { 'x-creator-page-binding': latest.sessionBinding, accept: 'application/json' } });
      const payload = await readCreatorSessionResponse(response);
      const current = stateRef.current.session;
      if (current.state !== 'checking' || current.reason !== recoveryReason) return;
      const result = classifyCreatorSessionCheck(response.status, payload);
      if (result.state === 'ready') {
        const logoutForm = document.querySelector<HTMLFormElement>('[data-account-logout]');
        const tokenInput = logoutForm?.querySelector<HTMLInputElement>('input[name="csrfToken"]');
        if (tokenInput) tokenInput.value = result.csrfToken;
        dispatch({ type: 'session-renewed', csrfToken: result.csrfToken });
        return;
      }
      if (result.state === 'expired') {
        dispatch({ type: 'session-required', reason: 'expired', message: 'No hay una sesión activa. Ingresa con la misma cuenta en otra pestaña y vuelve a comprobarla.' });
      } else if (result.state === 'disabled') {
        dispatch({ type: 'session-blocked', reason: 'disabled', message: 'Esta cuenta está desactivada. Conservamos tus cambios.' });
      } else if (result.state === 'context-changed') {
        dispatch({ type: 'session-blocked', reason: 'different-principal', message: 'La sesión activa pertenece a otra cuenta o tiene otros permisos. Ingresa con la cuenta original antes de volver a guardar.' });
      } else if (result.state === 'invalid-context') {
        dispatch({ type: 'session-blocked', reason: 'invalid-context', message: 'No pudimos comprobar el contexto de esta página. Abre una página nueva con la cuenta original.' });
      } else {
        dispatch({ type: 'session-required', reason: recoveryReason, message: 'No pudimos comprobar la sesión. Inténtalo de nuevo; tus cambios siguen aquí.' });
      }
    } catch {
      dispatch({ type: 'session-required', reason: recoveryReason, message: 'No pudimos conectar para comprobar la sesión. Tus cambios siguen aquí.' });
    }
  }

  function adoptComparison(comparisonId: string) {
    dispatch({ type: 'adopt-comparison', comparisonId });
  }

  function checkClick() { void checkCurrentAttempt(); }

  function createProfile() {
    const editor = stateRef.current.editor;
    if (editor?.kind !== 'create-profile') return;
    void startCommand(creatorOwnerWriteIntent(nextId('create-profile'), editor));
  }

  function retryCreateProfile() {
    const editor = stateRef.current.editor;
    if (editor?.kind !== 'create-profile') return;
    void startCommand(creatorOwnerWriteIntent(nextId('create-profile-retry'), editor));
  }

  function publishProfile() {
    const context = listContext('publish');
    if (!context) return;
    void startCommand(creatorOwnerWriteIntent(nextId('publish'), context));
  }

  function deleteSeries(seriesId: string) {
    const latest = stateRef.current;
    const series = latest.observed.series.find(({ id }) => id === seriesId);
    const context = listContext('delete-series', seriesId);
    if (!series || !context || !window.confirm(`¿Eliminar la serie «${series.name}»? Se conservarán los enlaces de tu página, sus opciones y las demás series.`)) return;
    void startCommand(creatorOwnerWriteIntent(nextId('delete-series'), context));
  }

  function mutateChapter(placementId: string, operation: 'chapter-add' | 'chapter-remove') {
    const context = listContext(operation, stateRef.current.location.query.serie, placementId);
    if (!context) return;
    void startCommand(creatorOwnerWriteIntent(nextId(operation), context));
  }

  function updateSeriesDraft(value: { name?: string; slug?: string; description?: string }, manuallyEditedSlug = false) {
    const current = stateRef.current.editor;
    if (current?.kind !== 'series') return;
    if (value.name !== undefined && !current.slugManuallyEdited) {
      dispatch({ type: 'update-series-draft', value: { ...value, slug: seriesDraftSlug(value.name) }, manuallyEditedSlug: false });
    } else {
      dispatch({ type: 'update-series-draft', value, manuallyEditedSlug });
    }
  }

  function resolveExit(action: 'save' | 'discard' | 'continue') {
    const latest = stateRef.current;
    if (action === 'continue') {
      dispatch({ type: 'resolve-transition', action });
      return;
    }
    if (action === 'discard') {
      if (isWriteActive(latest)) {
        setMessage('Estamos guardando la acción iniciada. Espera a que termine antes de salir.', 'info');
        return;
      }
      dispatch({ type: 'resolve-transition', action });
      if (!latest.location.transition) queueMicrotask(() => returnFocusRef.current?.focus({ preventScroll: true }));
      return;
    }
    dispatch({ type: 'resolve-transition', action: 'save' });
    if (!latest.editor || latest.editor.kind === 'create-profile') {
      if (latest.editor?.kind === 'create-profile') createProfile();
      return;
    }
    if (latest.editor.kind === 'photo') void startPhotoUpload(latest.editor);
    else submitCurrentEditor();
  }

  function copyLink(url: string) {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(url).then(() => setMessage('Copiaste el enlace público.', 'success'))
        .catch(() => setMessage('No pudimos copiar el enlace. Puedes copiarlo desde la dirección de tu página.', 'error'));
      return;
    }
    const input = document.createElement('textarea');
    input.value = url;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    setMessage(copied ? 'Copiaste el enlace público.' : 'No pudimos copiar el enlace. Puedes copiarlo desde la dirección de tu página.', copied ? 'success' : 'error');
  }

  const attempt = state.attempt;
  const listAttempt = 'intent' in attempt && attempt.intent.capture.kind === 'list-command' ? attempt.intent : undefined;
  const listAttemptState = listAttempt && (attempt.status === 'uncertain' || attempt.status === 'conflict' || attempt.status === 'checking');

  return <div ref={rootRef}>
    <CreatorOwnerIdentityPanel
      state={state}
      logout={props.logout}
      disabled={writeDisabled}
      onOpenProfile={openProfileEditor}
      onCreateProfile={createProfile}
      onPublish={publishProfile}
      onActivityPeriod={(period) => dispatch({ type: 'set-activity-period', period })}
      onRetryActivity={() => dispatch({ type: 'activity-retry' })}
      onCreateProfileInput={(value) => dispatch({ type: 'update-profile-draft', value })}
      onCheck={checkClick}
      onCheckSession={() => void checkSession()}
      onAdopt={adoptComparison}
      onCopyLink={copyLink}
      onRetryCreateProfile={retryCreateProfile}
    >
      {listAttemptState && <section class="creator-owner__conflict" data-series-list-recovery>
        <h3>{listAttempt.kind === 'delete-series' ? 'Comprobar eliminación' : listAttempt.kind === 'publish' ? 'Comprobar publicación' : 'Comprobar capítulos'}</h3>
        <p>{attempt.status === 'checking' ? 'Consultando el estado guardado…' : attempt.message}</p>
        {attempt.status === 'uncertain' && attempt.comparison && <>
          <p>{attempt.comparison.message}</p>
          {attempt.comparison.canAdopt && <button class="button button--outline" type="button" data-owner-adopt onClick={() => adoptComparison(attempt.comparison?.id ?? '')}>Usar la lista guardada</button>}
        </>}
        {(!('comparison' in attempt) || !attempt.comparison) && <button class="button button--outline" type="button" data-owner-compare data-series-reconcile-retry disabled={attempt.status === 'checking'} onClick={checkClick}>Comprobar</button>}
      </section>}
      <CreatorOwnerSeriesPanel
        state={state}
        disabled={writeDisabled}
        onSeriesSearch={(value) => dispatch({ type: 'set-series-search', value })}
        onChapterSearch={(value) => dispatch({ type: 'set-chapter-search', value })}
        onChapterMembership={(value) => dispatch({ type: 'set-pending-membership', value })}
        onCreate={() => openSeriesEditor()}
        onEditSeries={openSeriesEditor}
        onDeleteSeries={deleteSeries}
        onAddChapter={(placementId) => mutateChapter(placementId, 'chapter-add')}
        onRemoveChapter={(placementId) => mutateChapter(placementId, 'chapter-remove')}
        onMoveChapter={openMoveEditor}
      />
    </CreatorOwnerIdentityPanel>
    <CreatorOwnerEditorDialog
      state={state}
      onUpdateProfile={(value) => dispatch({ type: 'update-profile-draft', value })}
      onUpdateSocial={(key, value) => dispatch({ type: 'update-socials-draft', value: { [key]: value } })}
      onUpdateSeries={updateSeriesDraft}
      onUpdateMove={(value) => dispatch({ type: 'update-move-draft', targetPosition: value })}
      onSetMoveSuggestion={(value) => dispatch({ type: 'set-move-suggestion', targetPosition: value })}
      onSetPhoto={(file) => dispatch({ type: 'update-photo-file', file })}
      onSubmit={submitCurrentEditor}
      onRequestClose={closeOrGuardEditor}
      onCheck={checkClick}
      onAdopt={adoptComparison}
      onExit={resolveExit}
      onCheckSession={() => void checkSession()}
    />
  </div>;
}

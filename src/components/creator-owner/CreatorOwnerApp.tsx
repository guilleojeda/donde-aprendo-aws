import { useEffect, useLayoutEffect, useReducer, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { CreatorEditorDTO } from '../../types/creators';
import { readCreatorEditorData, isAdoptableOwnerData, isCreatorOwnerSnapshot } from '../../lib/creator-owner-data';
import {
  createCreatorOwnerComparison,
  classifyCreatorOwnerWriteSessionFailure,
  creatorOwnerWriteIntent,
  interpretCreatorOwnerPhotoFinalize,
  interpretCreatorOwnerResponse,
  prepareCreatorOwnerRequest,
} from '../../lib/creator-owner-commands';
import {
  creatorSessionRecoveryReason,
  classifyCreatorSessionCheck,
  readCreatorSessionResponse,
  isCreatorSessionBinding,
} from '../../lib/creator-session-response';
import { parseCreatorStatisticsReady } from '../../lib/creator-statistics-response';
import { normalizeCreatorText } from '../../lib/creator-values.mjs';
import type { CreatorOwnerSeriesMembership } from '../../lib/creator-owner-series';
import { normalizeOwnerSeriesQuery, resolveOwnerDestination, type OwnerDestination } from '../../lib/creator-owner-navigation';
import { creatorOwnerLinksHref, creatorOwnerLinkGroup, type CreatorOwnerLinksQuery } from '../../lib/creator-owner-links';
import { parseCreatorOwnerCatalog } from '../../lib/creator-owner-catalog';
import {
  createCreatorOwnerState,
  creatorOwnerClaimSelectionIsCurrent,
  creatorOwnerReferenceSubmissionStatus,
  creatorOwnerDraftIsDirty,
  creatorOwnerEditorChangedSince,
  creatorOwnerReducer,
  reduceCreatorOwnerSessionPolicy,
  type CreatorOwnerSessionPolicyAction,
  type CreatorOwnerSessionPolicyState,
  type CreatorOwnerEditor,
  type CreatorOwnerListContext,
  type CreatorOwnerLocation,
  type CreatorOwnerState,
  type CreatorOwnerView,
} from '../../lib/creator-owner-state';
import CreatorOwnerEditorDialog from './CreatorOwnerEditorDialog';
import CreatorOwnerIdentityPanel from './CreatorOwnerIdentityPanel';
import CreatorOwnerSeriesPanel from './CreatorOwnerSeriesPanel';
import CreatorOwnerLinksPanel from './CreatorOwnerLinksPanel';
import CreatorOwnerClaimsPanel from './CreatorOwnerClaimsPanel';

interface Props {
  data: CreatorEditorDTO;
  accountEmail: string;
  csrfToken: string;
  sessionBinding: string;
  isAdmin: boolean;
  publicOrigin: string;
  view: CreatorOwnerView;
  seriesQuery: import('../../lib/creator-owner-series').CreatorOwnerSeriesQuery;
  linksQuery: CreatorOwnerLinksQuery;
  linksQueryError?: string;
  seriesQueryError?: string;
  initialStatisticsPeriod?: 7 | 30;
  hasStatisticsDetail?: boolean;
  statistics?: ComponentChildren;
  logout?: ComponentChildren;
}

const PHOTO_LIMIT_BYTES = 15 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const STALE_CREATOR_READ_MESSAGE = 'La lectura empezó antes de la última comprobación de sesión. Vuelve a comprobar lo guardado; conservamos tus cambios.';

function createInitialState(props: Props): CreatorOwnerState {
  let initialCreate: { displayName: string; slug: string } | undefined;
  let pendingSeriesSearch: string | undefined;
  let pendingChapterSearch: string | undefined;
  let pendingMembership: CreatorOwnerSeriesMembership | undefined;
  let pendingLinksQuery: CreatorOwnerLinksQuery | undefined;
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
    const search = document.querySelector<HTMLInputElement>('[data-link-search]');
    const linkSeries = document.querySelector<HTMLSelectElement>('#owner-link-series');
    const directory = document.querySelector<HTMLSelectElement>('#owner-link-directory');
    const featured = document.querySelector<HTMLSelectElement>('#owner-link-featured');
    const order = document.querySelector<HTMLSelectElement>('#owner-link-order');
    if (search) pendingLinksQuery = { ...props.linksQuery, buscar: search.value };
    if (linkSeries && directory && featured && order) pendingLinksQuery = {
      ...(pendingLinksQuery ?? props.linksQuery), serie: linkSeries.value as CreatorOwnerLinksQuery['serie'],
      directorio: directory.value as CreatorOwnerLinksQuery['directorio'], destacado: featured.value as CreatorOwnerLinksQuery['destacado'],
      orden: order.value as CreatorOwnerLinksQuery['orden'],
    };
  }
  const initialSeriesQuery = props.view === 'series' && !props.seriesQueryError
    ? normalizeOwnerSeriesQuery(props.data, props.seriesQuery) : props.seriesQuery;
  return createCreatorOwnerState({
    data: props.data,
    accountEmail: props.accountEmail,
    csrfToken: props.csrfToken,
    sessionBinding: props.sessionBinding,
    isAdmin: props.isAdmin,
    publicOrigin: props.publicOrigin,
    seriesQuery: initialSeriesQuery,
    view: props.view,
    linksQuery: props.linksQuery,
    ...(props.seriesQueryError ? { seriesQueryError: props.seriesQueryError } : {}),
    ...(props.linksQueryError ? { linksQueryError: props.linksQueryError } : {}),
    ...(props.initialStatisticsPeriod ? { initialActivityPeriod: props.initialStatisticsPeriod } : {}),
    ...(initialCreate ? { initialCreate } : {}),
    ...(pendingSeriesSearch !== undefined ? { pendingSeriesSearch } : {}),
    ...(pendingChapterSearch !== undefined ? { pendingChapterSearch } : {}),
    ...(pendingMembership ? { pendingMembership } : {}),
    ...(pendingLinksQuery ? { pendingLinksQuery } : {}),
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

function isSameDocumentFragmentTransition(previousHref: string, currentHref: string): boolean {
  const previous = new URL(previousHref, currentHref);
  const current = new URL(currentHref);
  return previous.origin === current.origin && previous.pathname === current.pathname
    && previous.search === current.search && previous.hash !== current.hash;
}

function hasNativeSkipFocus(): boolean {
  return window.location.hash === '#contenido' && document.activeElement?.id === 'contenido';
}

function ownerQueryWasValid(state: unknown, view: 'enlaces' | 'series'): boolean {
  if (typeof state !== 'object' || state === null) return false;
  const key = view === 'series' ? 'creatorOwnerSeriesQueryValid' : 'creatorOwnerLinksQueryValid';
  return (state as Record<string, unknown>)[key] === true;
}

export default function CreatorOwnerApp(props: Props) {
  const [state, dispatch] = useReducer(creatorOwnerReducer, props, createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const rootRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const historyIndexRef = useRef<number | undefined>(undefined);
  const historyHrefRef = useRef(typeof window === 'undefined' ? '' : window.location.href);
  const nativeSkipActivationHrefRef = useRef<string | undefined>(undefined);
  const restoringHistoryIndexRef = useRef<number | undefined>(undefined);
  const allowedHistoryIndexRef = useRef<number | undefined>(undefined);
  const revealFocusAfterListAdoptionRef = useRef<string | undefined>(undefined);
  const activityRequestSequenceRef = useRef(0);
  const activityStartedRef = useRef<{ key: string; sequence: number } | undefined>(undefined);
  const linksSearchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const catalogLoadRef = useRef<Promise<void> | undefined>(undefined);
  const claimHistorySequenceRef = useRef(0);
  const sessionPolicyRef = useRef<CreatorOwnerSessionPolicyState>({ session: state.session, sessionEvidence: state.sessionEvidence });
  const sessionOperationIdRef = useRef(0);
  // requestSubmit dispatches submit synchronously, and only after native validation.
  const exitSubmitTransitionRef = useRef<CreatorOwnerLocation['transition']>(undefined);
  const linksHydrationAppliedRef = useRef(false);
  const handledTransitionRef = useRef<string | undefined>(undefined);
  const previousEditorKeyRef = useRef<string | undefined>(undefined);

  function queueSessionPolicyAction(action: CreatorOwnerSessionPolicyAction): boolean {
    const previous = sessionPolicyRef.current;
    const next = reduceCreatorOwnerSessionPolicy(previous, action);
    sessionPolicyRef.current = { session: next.session, sessionEvidence: next.sessionEvidence };
    dispatch(action);
    return next.accepted;
  }

  function recordSessionEvidence(action: Extract<CreatorOwnerSessionPolicyAction, { type: 'session-evidence' }>,
    historyThroughSequence?: number): boolean {
    const accepted = queueSessionPolicyAction(action);
    if (accepted && action.source !== 'history' && historyThroughSequence !== undefined) {
      clearSessionDerivedClaimHistory(historyThroughSequence);
    }
    return accepted;
  }

  function nextSessionOperationId(): number {
    sessionOperationIdRef.current += 1;
    return sessionOperationIdRef.current;
  }

  function cancelPendingLinksSearch() {
    if (linksSearchTimerRef.current !== undefined) {
      clearTimeout(linksSearchTimerRef.current);
      linksSearchTimerRef.current = undefined;
    }
  }

  function ownsCurrentHistoryEntry(): boolean {
    return restoringHistoryIndexRef.current === undefined && historyIndexRef.current !== undefined
      && ownerIndex(window.history.state) === historyIndexRef.current;
  }

  function resolveDestination(url: URL, entry?: unknown): OwnerDestination | undefined {
    const latest = stateRef.current;
    const { view } = latest.location;
    if (url.origin !== window.location.origin || url.pathname !== '/cuenta/'
      || (view !== 'series' && view !== 'enlaces')) return undefined;
    const views = url.searchParams.getAll('vista');
    if (views.length > 1 || (views[0] ?? 'enlaces') !== view) return undefined;
    return resolveOwnerDestination(url, view, latest.observed, ownerQueryWasValid(entry, view));
  }

  function isListDisplayQueryTransition(destination?: OwnerDestination): boolean {
    const latest = stateRef.current;
    const attempt = latest.attempt;
    return Boolean(destination && 'query' in destination && !latest.editor && latest.location.prompt === 'none'
      && !latest.location.exitRequest && hasUnresolvedAttempt(latest)
      && 'intent' in attempt && attempt.intent.capture.kind === 'list-command'
      && (destination.view === 'enlaces' || destination.query.serie === latest.location.query.serie));
  }

  function blockForExit(transition: NonNullable<CreatorOwnerState['location']['transition']>): boolean {
    const latest = stateRef.current;
    if (isWriteActive(latest)) {
      dispatch({ type: 'set-message', text: 'Estamos guardando la acción iniciada. Espera a que termine antes de salir.', kind: 'info' });
      return true;
    }
    if (!shouldGuardExit(latest)) return false;
    dispatch({ type: 'request-exit', transition });
    return true;
  }

  function commitDestination(destination: OwnerDestination | undefined, mode: 'push' | 'replace' | 'traverse' | 'reconcile',
    focusSelector?: string, preservePending = false): boolean {
    const index = ownerIndex(window.history.state);
    if (mode !== 'traverse' && (!destination || !ownsCurrentHistoryEntry() || index === undefined)) return false;
    if (mode === 'push' && destination && 'error' in destination) return false;
    const currentHref = window.location.href;
    if (destination && index !== undefined && destination.href !== currentHref) {
      const nextIndex = mode === 'push' ? index + 1 : index;
      const entry = { ...window.history.state, creatorOwnerIndex: nextIndex,
        creatorOwnerSeriesQueryValid: destination.view !== 'series' || 'query' in destination,
        creatorOwnerLinksQueryValid: destination.view !== 'enlaces' || 'query' in destination };
      if (mode === 'push') window.history.pushState(entry, '', destination.href);
      else window.history.replaceState(entry, '', destination.href);
    }
    historyIndexRef.current = ownerIndex(window.history.state);
    historyHrefRef.current = window.location.href;
    if (!destination) return false;

    const latest = stateRef.current.location;
    if (!preservePending) cancelPendingLinksSearch();
    if ('error' in destination) {
      if (destination.view === 'enlaces') dispatch({ type: 'set-links-query-error', reason: 'links' });
      else dispatch({ type: 'set-series-query-error', reason: 'series' });
      return true;
    }
    if (destination.view === 'enlaces') {
      if (!preservePending || latest.linksQueryError || JSON.stringify(destination.query) !== JSON.stringify(latest.linksQuery)) {
        dispatch({ type: 'apply-links-query', query: destination.query, focusSelector, preservePending: preservePending && !latest.linksQueryError });
      }
    } else if (!preservePending || stateRef.current.seriesQueryError || JSON.stringify(destination.query) !== JSON.stringify(latest.query)) {
      dispatch({ type: 'apply-query', query: destination.query, focusSelector, preservePending: preservePending && !stateRef.current.seriesQueryError });
    }
    return true;
  }

  function reconcileCurrentLocation() {
    if (!ownsCurrentHistoryEntry()) return;
    const destination = resolveDestination(new URL(window.location.href), window.history.state);
    const latest = stateRef.current;
    const restoringQuery = destination && 'query' in destination
      && (destination.view === 'enlaces' ? latest.location.linksQueryError : latest.seriesQueryError);
    const focus = restoringQuery && !hasNativeSkipFocus() ? queryFocus(destination, '#owner-link-search') : undefined;
    commitDestination(destination, 'reconcile', focus, true);
  }

  function queryFocus(destination: OwnerDestination, linkFocus?: string,
    cause: 'anchor' | 'form' | 'history' | 'reconcile' = 'history'): string | undefined {
    if ('error' in destination) return undefined;
    const { query, linksQuery } = stateRef.current.location;
    if (destination.view === 'enlaces') return linkFocus ?? (destination.query.paginaEnlaces !== linksQuery.paginaEnlaces
      ? '#owner-link-pagination' : '#owner-link-search');
    if (!destination.query.serie) return destination.query.paginaSeries !== query.paginaSeries
      ? cause === 'form' ? '#owner-series-search' : '[data-series-page]:last-of-type' : '#owner-series-search';
    if (destination.query.serie !== query.serie) return '#owner-series-chapters-title';
    if (cause === 'form') return '#owner-chapter-search';
    return destination.query.paginaCapitulos !== query.paginaCapitulos
      ? '[data-series-chapter-page]:last-of-type' : '#owner-chapter-search';
  }

  function navigateOwner(url: URL, kind: 'anchor' | 'form', linkFocus?: string,
    options: { preserveNativeSkip?: boolean } = {}): boolean {
    const target = new URL(url.href);
    const keepNativeSkipEntry = kind === 'form' && options.preserveNativeSkip === true && hasNativeSkipFocus()
      && target.origin === window.location.origin && target.pathname === window.location.pathname;
    if (keepNativeSkipEntry) target.hash = window.location.hash;
    const destination = resolveDestination(target);
    if (!isListDisplayQueryTransition(destination) && blockForExit({ href: target.href, kind })) return true;
    return destination ? commitDestination(destination, keepNativeSkipEntry ? 'replace' : 'push',
      keepNativeSkipEntry ? undefined : queryFocus(destination, linkFocus, kind)) : false;
  }

  const currentProfile = state.observed.profile;
  const writeDisabled = !state.runtimeReady || state.session.state !== 'ready'
    || state.attempt.status === 'sending' || state.attempt.status === 'checking'
    || state.attempt.status === 'uncertain' || state.attempt.status === 'conflict';

  useLayoutEffect(() => {
    historyIndexRef.current = ownerIndex(window.history.state);
    historyHrefRef.current = window.location.href;
    dispatch({ type: 'runtime-ready' });

    const onClick = (event: MouseEvent) => {
      const anchor = responseLink(event);
      if (!anchor || !isOrdinaryLinkClick(event, anchor)) return;
      const url = new URL(anchor.href);
      const current = new URL(window.location.href);
      if (url.hash && url.origin === current.origin && url.pathname === current.pathname && url.search === current.search) return;
      const focusSelector = anchor.matches('[data-link-page]') ? '#owner-link-pagination' : '#owner-links-title';
      if (navigateOwner(url, 'anchor', focusSelector)) event.preventDefault();
    };

    const onSubmit = (event: SubmitEvent) => {
      if (event.defaultPrevented || !(event.target instanceof HTMLFormElement)) return;
      const form = event.target;
      if (form.matches('[data-account-logout], [data-owner-form]') || form.method.toLowerCase() !== 'get'
        || (form.target && form.target.toLowerCase() !== '_self')) return;
      const target = new URL(form.action || window.location.href);
      target.search = '';
      for (const [key, value] of new FormData(form)) {
        if (typeof value === 'string') target.searchParams.append(key, value);
      }
      if (navigateOwner(target, 'form', '#owner-links-title')) event.preventDefault();
    };

    const onLogout = (event: Event) => {
      if (!event.defaultPrevented && blockForExit({ href: '/cuenta/salir/', kind: 'logout' })) event.preventDefault();
    };
    const onNativeFragment = () => { nativeSkipActivationHrefRef.current = window.location.href; };

    const onPopState = () => {
      const index = ownerIndex(window.history.state);
      const href = window.location.href;
      const freshNativeSkip = nativeSkipActivationHrefRef.current === href;
      nativeSkipActivationHrefRef.current = undefined;
      if (index !== undefined && restoringHistoryIndexRef.current === index) {
        restoringHistoryIndexRef.current = undefined;
        historyHrefRef.current = href;
        reconcileCurrentLocation();
        settlePendingLinksSearch();
        const latest = stateRef.current;
        if (latest.location.transition?.kind === 'history' && latest.location.prompt === 'none' && !latest.editor && !isWriteActive(latest)) {
          resumeHistoryTransition(latest.location.transition.historyIndex);
        }
        return;
      }
      if (index === historyIndexRef.current && href === historyHrefRef.current) return;
      const destination = resolveDestination(new URL(href), window.history.state);
      const allowed = index !== undefined && allowedHistoryIndexRef.current === index;
      if (allowed) {
        allowedHistoryIndexRef.current = undefined;
        handledTransitionRef.current = undefined;
      }
      const fragmentOnly = isSameDocumentFragmentTransition(historyHrefRef.current, href);
      const nativeSkipDestination = new URL(href).hash === '#contenido';
      if (!allowed && !fragmentOnly && !isListDisplayQueryTransition(destination)) {
        const currentIndex = historyIndexRef.current;
        // Only two indexed entries give us a known traversal distance.
        if (currentIndex !== undefined && index !== undefined && currentIndex !== index
          && blockForExit({ href, kind: 'history', historyIndex: index })) {
          restoringHistoryIndexRef.current = currentIndex;
          window.history.go(currentIndex - index);
          return;
        }
      }
      const focus = fragmentOnly || !destination ? undefined
        : nativeSkipDestination ? '#contenido' : queryFocus(destination);
      commitDestination(destination, 'traverse', focus, fragmentOnly && freshNativeSkip);
      if (fragmentOnly && freshNativeSkip) settlePendingLinksSearch();
      if (allowed) dispatch({ type: 'clear-transition' });
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const latest = stateRef.current;
      if (isWriteActive(latest) || shouldGuardExit(latest)) event.preventDefault();
    };
    const onHashChange = () => {
      // Some engines report a native fragment via hashchange without popstate.
      const href = window.location.href;
      if (isSameDocumentFragmentTransition(historyHrefRef.current, href)
        || (href === historyHrefRef.current && historyIndexRef.current === undefined)) onPopState();
    };

    const root = rootRef.current;
    root?.addEventListener('account:logout', onLogout);
    window.addEventListener('creator-owner:native-fragment', onNativeFragment);
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      root?.removeEventListener('account:logout', onLogout);
      window.removeEventListener('creator-owner:native-fragment', onNativeFragment);
      document.removeEventListener('click', onClick);
      document.removeEventListener('submit', onSubmit);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  function resumeHistoryTransition(destinationIndex?: number): boolean {
    const currentIndex = historyIndexRef.current;
    if (!ownsCurrentHistoryEntry() || currentIndex === undefined || destinationIndex === undefined || currentIndex === destinationIndex
      || allowedHistoryIndexRef.current === destinationIndex) return false;
    allowedHistoryIndexRef.current = destinationIndex;
    window.history.go(destinationIndex - currentIndex);
    return true;
  }

  useEffect(() => {
    const transition = state.location.transition;
    if (!transition) {
      handledTransitionRef.current = undefined;
      return;
    }
    if (state.location.prompt !== 'none' || state.editor || isWriteActive(state)) return;
    const key = `${transition.kind}:${transition.href}:${transition.historyIndex ?? ''}`;
    if (handledTransitionRef.current === key) return;
    if (transition.kind === 'history') {
      if (resumeHistoryTransition(transition.historyIndex)) handledTransitionRef.current = key;
      return;
    }
    handledTransitionRef.current = key;
    if (transition.kind === 'logout') {
      document.querySelector<HTMLFormElement>('[data-account-logout]')?.requestSubmit();
      return;
    }
    window.location.assign(transition.href);
  }, [state.location.transition, state.location.prompt, state.editor, state.attempt.status]);

  useLayoutEffect(() => {
    reconcileCurrentLocation();
  }, [state.observed]);

  useEffect(() => {
    const selector = state.location.focusAfterRender;
    if (!selector) return;
    if (stateRef.current.location.focusAfterRender !== selector) return;
    const root = rootRef.current;
    const target = root?.querySelector<HTMLElement>(selector);
    if (!root || !target) {
      if (stateRef.current.location.focusAfterRender !== selector) return;
      revealFocusAfterListAdoptionRef.current = undefined;
      dispatch({ type: 'clear-focus', selector });
      return;
    }
    const focusTarget = () => {
      const latestTarget = rootRef.current?.querySelector<HTMLElement>(selector);
      if (!latestTarget) return;
      const insideOwnerDialog = Boolean(latestTarget.closest('[data-owner-dialog]'));
      const retainActiveSearchFocus = (selector === '#owner-link-search' || selector === '#owner-series-search'
        || selector === '#owner-chapter-search') && document.activeElement === latestTarget;
      const listRecoveryFocusPending = revealFocusAfterListAdoptionRef.current !== undefined
        && revealFocusAfterListAdoptionRef.current === (stateRef.current.attempt.status === 'confirmed' ? stateRef.current.attempt.intentId : undefined)
        && ['enlaces', 'series'].includes(stateRef.current.location.view);
      const revealListRecoveryFocus = listRecoveryFocusPending && !insideOwnerDialog;
      if (revealListRecoveryFocus && hasNativeSkipFocus()) {
        revealFocusAfterListAdoptionRef.current = undefined;
        dispatch({ type: 'clear-focus', selector });
        return;
      }
      latestTarget.focus({ preventScroll: true });
      const revealPagerFocus = selector === '#owner-link-pagination'
        || selector === '[data-series-page]:last-of-type'
        || selector === '[data-series-chapter-page]:last-of-type';
      if (revealListRecoveryFocus || insideOwnerDialog || revealPagerFocus) {
        latestTarget.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      } else if (retainActiveSearchFocus) {
        latestTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      }
      if (revealListRecoveryFocus) revealFocusAfterListAdoptionRef.current = undefined;
      dispatch({ type: 'clear-focus', selector });
    };
    const openDialog = root.querySelector<HTMLDialogElement>('[data-owner-dialog][open]');
    if (openDialog && !openDialog.contains(target)) {
      const onClose = () => {
        if (stateRef.current.location.focusAfterRender !== selector || stateRef.current.location.prompt !== 'none') return;
        focusTarget();
      };
      openDialog.addEventListener('close', onClose, { once: true });
      return () => openDialog.removeEventListener('close', onClose);
    }
    focusTarget();
  }, [state.location.focusAfterRender, state.attempt, state.location.prompt]);

  useEffect(() => {
    const editorKey = state.editor?.key;
    if (previousEditorKeyRef.current && !editorKey && !state.location.transition && state.location.prompt === 'none') {
      const requested = returnFocusRef.current;
      const fallback = stateRef.current.location.view === 'enlaces'
        ? rootRef.current?.querySelector<HTMLElement>('#owner-link-search') ?? rootRef.current?.querySelector<HTMLElement>('#owner-links-title')
        : stateRef.current.location.view === 'series'
          ? rootRef.current?.querySelector<HTMLElement>('#owner-series-search') ?? rootRef.current?.querySelector<HTMLElement>('#owner-series-title')
          : stateRef.current.location.view === 'solicitudes'
            ? rootRef.current?.querySelector<HTMLElement>('[data-claim-section-open]')
            : rootRef.current?.querySelector<HTMLElement>('#owner-activity-title')
              ?? rootRef.current?.querySelector<HTMLElement>('#owner-profile-name, #owner-create-name');
      const destination = requested?.isConnected ? requested : fallback;
      destination?.focus({ preventScroll: true });
      returnFocusRef.current = null;
    }
    previousEditorKeyRef.current = editorKey;
  }, [state.editor?.key, state.location.transition, state.location.prompt]);

  useEffect(() => {
    const key = `${currentProfile?.id ?? ''}:${currentProfile?.published ? 'published' : 'private'}:${state.activity.period}`;
    if (props.view === 'estadisticas' && props.hasStatisticsDetail) {
      activityRequestSequenceRef.current += 1;
      return;
    }
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
  }, [currentProfile?.id, currentProfile?.published, state.activity.period, state.activity.sequence, props.view, props.hasStatisticsDetail]);

  useEffect(() => {
    if (state.session.state !== 'ready') return;
    const logout = document.querySelector<HTMLFormElement>('[data-account-logout]');
    const token = logout?.querySelector<HTMLInputElement>('input[name="csrfToken"]');
    if (logout && token && token.value !== state.session.csrfToken) token.value = state.session.csrfToken;
  }, [state.session]);

  useEffect(() => () => {
    if (linksSearchTimerRef.current) clearTimeout(linksSearchTimerRef.current);
  }, []);

  const setMessage = (text: string, kind: 'info' | 'success' | 'error' = 'info') => dispatch({ type: 'set-message', text, kind });

  function applyLinksSearch() {
    if (!ownsCurrentHistoryEntry()) return;
    const url = new URL(creatorOwnerLinksHref(stateRef.current.location.pendingLinksQuery), window.location.href);
    url.hash = window.location.hash;
    commitDestination(resolveDestination(url), 'replace');
  }

  function settlePendingLinksSearch() {
    const { view, linksQuery, pendingLinksQuery, linksQueryError } = stateRef.current.location;
    if (view === 'enlaces' && !linksQueryError && linksSearchTimerRef.current === undefined
      && JSON.stringify(pendingLinksQuery) !== JSON.stringify(linksQuery)) applyLinksSearch();
  }

  function onLinkSearch(value: string) {
    dispatch({ type: 'set-links-pending-query', query: { buscar: value, paginaEnlaces: 1 } });
    cancelPendingLinksSearch();
    linksSearchTimerRef.current = setTimeout(() => {
      linksSearchTimerRef.current = undefined;
      applyLinksSearch();
    }, 120);
  }

  function onLinksQueryChange(query: CreatorOwnerLinksQuery, focusSelector: string,
    options: { preserveNativeSkip?: boolean } = {}) {
    const url = new URL(creatorOwnerLinksHref(query), window.location.href);
    navigateOwner(url, 'form', focusSelector, options);
  }

  function onLinksQuerySubmit(query: CreatorOwnerLinksQuery) {
    onLinksQueryChange(query, '#owner-link-search');
  }

  useEffect(() => {
    if (!state.runtimeReady || state.location.view !== 'enlaces' || state.location.linksQueryError || linksHydrationAppliedRef.current) return;
    linksHydrationAppliedRef.current = true;
    const pending = state.location.pendingLinksQuery;
    const current = state.location.linksQuery;
    const filtersChanged = pending.serie !== current.serie || pending.directorio !== current.directorio
      || pending.destacado !== current.destacado || pending.orden !== current.orden;
    if (filtersChanged) {
      const focus = pending.serie !== current.serie ? '#owner-link-series'
        : pending.directorio !== current.directorio ? '#owner-link-directory'
          : pending.destacado !== current.destacado ? '#owner-link-featured' : '#owner-link-order';
      onLinksQueryChange({ ...pending, paginaEnlaces: 1 }, focus, { preserveNativeSkip: true });
    } else if (pending.buscar !== current.buscar) onLinkSearch(pending.buscar);
  }, [state.runtimeReady, state.location.view]);

  async function loadCatalog(refresh = false) {
    const latest = stateRef.current.catalog;
    if (!refresh && latest.status === 'ready' && latest.entries && !latest.needsRefresh) return;
    if (catalogLoadRef.current) return catalogLoadRef.current;
    dispatch({ type: 'catalog-load-started' });
    const request = (async () => {
      try {
        const response = await fetch('/catalog-selection.json', { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error('catalog-unavailable');
        let raw: unknown;
        try { raw = await response.json(); } catch { throw new Error('catalog-malformed'); }
        const entries = parseCreatorOwnerCatalog(raw);
        if (!entries) throw new Error('catalog-malformed');
        const currentEditor = stateRef.current.editor;
        let message: string | undefined;
        if (currentEditor?.kind === 'reference' && currentEditor.selected) {
          const refreshed = entries.find(({ id }) => id === currentEditor.selected?.id);
          if (!refreshed || refreshed.url !== currentEditor.selected.url) {
            dispatch({ type: 'update-reference-draft', selected: undefined });
            message = refreshed
              ? 'La URL de esa ficha cambió. Vuelve a seleccionarla para confirmar la dirección actual.'
              : 'La ficha elegida ya no aparece en el catálogo. Selecciona otra antes de continuar.';
          } else if (refreshed.title !== currentEditor.selected.title) dispatch({ type: 'update-reference-draft', selected: refreshed });
        }
        if (currentEditor?.kind === 'claim' && currentEditor.selected.length) {
          const kept = currentEditor.selected.filter((selected) => {
            const refreshed = entries.find(({ id }) => id === selected.resourceId);
            if (!refreshed) {
              const shared = stateRef.current.observed.links.find(({ resourceId, url }) => resourceId === selected.resourceId && url === selected.url);
              return Boolean(shared && !stateRef.current.observed.editableResources.some(({ id }) => id === selected.resourceId));
            }
            return refreshed.url === selected.url;
          }).map((selected) => {
            const refreshed = entries.find(({ id }) => id === selected.resourceId);
            return refreshed ? { resourceId: refreshed.id, url: refreshed.url, title: refreshed.title } : selected;
          });
          if (kept.length !== currentEditor.selected.length) {
            dispatch({ type: 'update-claim-draft', value: { selected: kept } });
            message = 'Quitamos de la selección las fichas cuya URL cambió. Actualiza y vuelve a elegir cada ficha vigente.';
          }
        }
        dispatch({ type: 'catalog-load-ready', entries, ...(message ? { message } : {}) });
        if (message) setMessage(message, 'info');
      } catch (error) {
        dispatch({ type: 'catalog-load-failed', message: error instanceof Error && error.message === 'catalog-malformed'
          ? 'No pudimos leer el catálogo porque su formato no es válido. Puedes volver a intentarlo.'
          : 'No pudimos cargar el catálogo. Puedes volver a intentarlo.' });
      }
    })();
    const handled = request.finally(() => { if (catalogLoadRef.current === handled) catalogLoadRef.current = undefined; });
    catalogLoadRef.current = handled;
    return handled;
  }

  useEffect(() => {
    if (props.view === 'solicitudes') void loadCatalog();
  }, [props.view]);

  async function refreshClaimHistory(options?: { intentId: string; checkId: string; profileId: string }) {
    const latest = stateRef.current;
    const expectedProfileId = options?.profileId ?? latest.observed.profile?.id;
    const binding = latest.sessionBinding;
    const operationId = nextSessionOperationId();
    const evidenceSource = options ? 'bound' : 'history';
    const sequence = ++claimHistorySequenceRef.current;
    dispatch({ type: 'claim-history-started', sequence });
    const historyReadIsCurrent = () => {
      const current = stateRef.current;
      return current.claimHistory.status === 'loading' && current.claimHistory.sequence === sequence
        && current.observed.profile?.id === expectedProfileId && current.sessionBinding === binding
        && claimHistorySequenceRef.current === sequence;
    };
    const checkIsCurrent = () => {
      if (!options) return false;
      const current = stateRef.current;
      return historyReadIsCurrent() && current.attempt.status === 'checking'
        && current.attempt.intent.id === options.intentId && current.attempt.checkId === options.checkId
        && current.attempt.intent.kind === 'claim' && current.editor?.kind === 'claim'
        && current.editor.key === current.attempt.intent.editorKey;
    };
    const failWithSessionEvidence = (
      outcome: 'recoverable' | 'terminal',
      reason: 'expired' | 'csrf' | 'different-principal' | 'disabled' | 'invalid-context',
      message: string,
    ) => {
      const accepted = recordSessionEvidence({ type: 'session-evidence', operationId, source: evidenceSource, outcome, reason, message }, sequence - 1);
      const feedback = accepted ? message : STALE_CREATOR_READ_MESSAGE;
      if (options) dispatch({ type: 'check-failed', intentId: options.intentId, checkId: options.checkId, message: feedback, sessionDerived: accepted });
      dispatch({ type: 'claim-history-failed', sequence, message: feedback, ...(accepted ? { sessionDerived: true } : {}) });
      return false;
    };
    try {
      const response = await fetch('/api/creador/perfil/', { method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { 'x-creator-page-binding': binding, accept: 'application/json' } });
      if (!historyReadIsCurrent()) return false;
      const session = response.ok ? null : await readCreatorSessionResponse(response);
      if (!historyReadIsCurrent()) return false;
      if (!response.ok && options && !checkIsCurrent()) {
        dispatch({ type: 'claim-history-failed', sequence, message: 'No pudimos actualizar Solicitudes con esta lectura. Puedes volver a intentarlo.' });
        return false;
      }
      const recoveryReason = creatorSessionRecoveryReason(response.status, session);
      if (recoveryReason) {
        const message = loginRecoveryMessage(recoveryReason);
        return failWithSessionEvidence('recoverable', recoveryReason, message);
      }
      if (!response.ok) {
        const sessionState = classifyCreatorSessionCheck(response.status, session);
        if (sessionState.state === 'context-changed') {
          const message = 'La cuenta o el rol activo no coinciden con esta página. Vuelve a la cuenta original para comprobar; conservamos tus cambios.';
          return failWithSessionEvidence('recoverable', 'different-principal', message);
        }
        if (sessionState.state === 'disabled' || sessionState.state === 'invalid-context') {
          const message = sessionState.state === 'disabled' ? 'Esta cuenta está desactivada. Conservamos tus cambios.'
            : 'El contexto de esta página no es válido. Abre una página nueva con la cuenta original.';
          return failWithSessionEvidence(sessionState.state === 'disabled' && !options ? 'recoverable' : 'terminal', sessionState.state, message);
        }
        throw new Error(response.status === 403 ? 'claim-forbidden' : 'claim-unavailable');
      }
      const raw: unknown = await response.json();
      if (!historyReadIsCurrent()) return false;
      if (!isAdoptableOwnerData(raw)) throw new Error('claim-malformed');
      const snapshot = readCreatorEditorData(raw);
      if (!expectedProfileId || snapshot.profile?.id !== expectedProfileId) throw new Error('claim-context');
      const ownsCheck = checkIsCurrent();
      if (!options || ownsCheck) recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'read-confirmed',
        message: 'La lectura confirmó esta página. Comprueba la sesión para habilitar cambios.' }, sequence - 1);
      dispatch({ type: 'claim-history-ready', sequence, claims: snapshot.claims, message: options
        ? 'Solicitudes comprobadas. Este historial no permite identificar con certeza si el envío anterior fue registrado.'
        : 'Solicitudes actualizadas. La lista no muestra datos de edición ajenos ni concede permisos.' });
      if (options && ownsCheck) dispatch({ type: 'claim-attempt-checked', intentId: options.intentId, checkId: options.checkId,
        message: 'Historial comprobado. No permite identificar con certeza si este envío fue el que se registró. Conservamos el formulario; decide manualmente si volver a enviarlo.' });
      return true;
    } catch (error) {
      if (!historyReadIsCurrent()) return false;
      const message = error instanceof Error && error.message === 'claim-context'
        ? 'La respuesta de Solicitudes no corresponde a esta página. Conservamos el formulario.'
        : error instanceof Error && error.message === 'claim-malformed'
          ? 'La lectura no contiene un historial completo y válido. Conservamos el formulario.'
          : error instanceof Error && error.message === 'claim-forbidden'
            ? 'Esta cuenta no puede leer Solicitudes. Conservamos el formulario.'
            : 'No pudimos comprobar Solicitudes. Conservamos el formulario para intentarlo más tarde.';
      if (options && checkIsCurrent()) dispatch({ type: 'check-failed', intentId: options.intentId, checkId: options.checkId, message });
      dispatch({ type: 'claim-history-failed', sequence, message });
      return false;
    }
  }

  async function checkClaimHistory() {
    if (stateRef.current.claimHistory.status === 'loading') return;
    await refreshClaimHistory();
  }

  function retryCatalog() { void loadCatalog(true); }

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

  function openLinkEditor(placementId: string) {
    const latest = stateRef.current;
    const profile = latest.observed.profile;
    const link = latest.observed.links.find(({ placementId: id }) => id === placementId);
    if (!profile || !link || latest.session.state !== 'ready') return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: {
      kind: 'link-placement', key: `link:${link.placementId}`, baseProfile: { ...profile },
      baseLink: { ...link, series: link.series.map((membership) => ({ ...membership })) },
      editable: latest.observed.editableResources.some(({ id }) => id === link.resourceId),
      draft: { title: link.title, url: link.url, description: link.description ?? '', featured: link.featured, selectedForDirectory: link.selectedForDirectory },
    } });
  }

  function openRetainedEditor(resourceId: string) {
    const latest = stateRef.current;
    const resource = latest.observed.editableResources.find(({ id }) => id === resourceId);
    if (!resource || latest.observed.links.some(({ resourceId: id }) => id === resourceId) || latest.session.state !== 'ready') return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: { kind: 'link-resource', key: `resource:${resource.id}`, baseResource: { ...resource },
      draft: { title: resource.title, url: resource.url, description: resource.description ?? '' } } });
  }

  function openAddLink() {
    const profile = stateRef.current.observed.profile;
    if (!profile || stateRef.current.session.state !== 'ready') return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: { kind: 'add-link', key: 'add-link', baseProfile: { ...profile },
      draft: { title: '', url: '', description: '', featured: false, selectedForDirectory: true } } });
  }

  function openLinkMoveEditor(placementId: string) {
    const latest = stateRef.current;
    const profile = latest.observed.profile;
    const link = latest.observed.links.find(({ placementId: id }) => id === placementId);
    if (!profile || !link) return;
    const order = creatorOwnerLinkGroup(latest.observed.links, link.featured);
    const index = order.findIndex(({ placementId: id }) => id === placementId);
    if (index < 0) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: { kind: 'move-link', key: `move-link:${placementId}`, baseProfile: { ...profile },
      baseLink: { ...link, series: link.series.map((membership) => ({ ...membership })) },
      baseOrder: order.map(({ placementId: id }) => id), targetPosition: String(index + 1) } });
  }

  function openReferenceEditor() {
    const profile = stateRef.current.observed.profile;
    if (!profile || stateRef.current.session.state !== 'ready') return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: { kind: 'reference', key: 'reference', baseProfile: { ...profile }, selected: undefined, selectedForDirectory: true } });
    void loadCatalog();
  }

  function openClaimEditor(placementId?: string) {
    const latest = stateRef.current;
    const profile = latest.observed.profile;
    if (!profile || latest.session.state !== 'ready') {
      setMessage('Primero prepara tu página para solicitar edición.', 'info');
      return;
    }
    const link = placementId ? latest.observed.links.find(({ placementId: id }) => id === placementId) : undefined;
    if (placementId && (!link || latest.observed.editableResources.some(({ id }) => id === link.resourceId))) {
      setMessage('La ficha compartida cambió. Actualiza Enlaces antes de solicitar edición.', 'error');
      return;
    }
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: { kind: 'claim', key: 'claim', baseProfile: { ...profile },
      selected: link ? [{ resourceId: link.resourceId, url: link.url, title: link.title }] : [], knownUrls: '', evidence: '' } });
    void loadCatalog();
  }

  function removeOwnerLink(placementId: string) {
    const latest = stateRef.current;
    const link = latest.observed.links.find(({ placementId: id }) => id === placementId);
    const own = latest.observed.editableResources.some(({ id }) => id === link?.resourceId);
    const context = listContext('remove-link', undefined, placementId);
    if (!link || !context) return;
    const message = own
      ? '¿Quieres quitar este enlace de tu página? La ficha propia se conservará para editarla o volver a agregarla después.'
      : '¿Quieres quitar esta referencia de tu página? La ficha compartida no se edita ni se retira del catálogo.';
    if (!window.confirm(message)) return;
    void startCommand(creatorOwnerWriteIntent(nextId('remove-link'), context));
  }

  function reincludeResource(resourceId: string) {
    const context = listContext('reinclude-resource', undefined, undefined, resourceId);
    if (!context) return;
    void startCommand(creatorOwnerWriteIntent(nextId('reinclude-resource'), context));
  }

  function closeOrGuardEditor() {
    const latest = stateRef.current;
    if (latest.location.prompt === 'exit') {
      dispatch({ type: 'resolve-transition', action: 'continue' });
      return;
    }
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

  function listContext(operation: CreatorOwnerListContext['operation'], seriesId?: string, placementId?: string, resourceId?: string): CreatorOwnerListContext | undefined {
    const latest = stateRef.current;
    const profile = latest.observed.profile;
    if (!profile) return undefined;
    const series = seriesId ? latest.observed.series.find(({ id }) => id === seriesId) : undefined;
    const placement = placementId ? latest.observed.links.find(({ placementId: id }) => id === placementId) : undefined;
    const resource = resourceId ? latest.observed.editableResources.find(({ id }) => id === resourceId) : undefined;
    if (seriesId && !series || placementId && !placement || resourceId && !resource) return undefined;
    if (operation === 'reinclude-resource' && (!resource || latest.observed.links.some(({ resourceId: id }) => id === resourceId))) return undefined;
    return {
      kind: 'list-command', key: `list:${operation}:${seriesId ?? ''}:${placementId ?? ''}`, operation,
      baseProfile: { ...profile }, ...(series ? { baseSeries: { ...series } } : {}),
      ...(placement ? { basePlacement: { ...placement, series: placement.series.map((item) => ({ ...item })) } } : {}),
      ...(resource ? { baseResource: { ...resource } } : {}),
      ...(seriesId ? { seriesId } : {}), ...(placementId ? { placementId } : {}),
    };
  }

  function clearSessionDerivedClaimHistory(throughSequence: number) {
    dispatch({ type: 'claim-history-session-cleared', sequence: throughSequence });
  }

  function confirmBoundWrite(historySequence: number, operationId: number, csrfToken: string) {
    recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'write-confirmed',
      csrfToken, message: 'La escritura confirmó la sesión ligada.' }, historySequence);
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
    const canSupersedeClaimCheck = latest.attempt.status === 'checking' && latest.attempt.intent.kind === 'claim'
      && intent.kind === 'claim' && latest.attempt.intent.editorKey === intent.editorKey
      && latest.editor?.kind === 'claim' && latest.editor.key === intent.editorKey;
    if (latest.session.state !== 'ready' || isWriteActive(latest)
      || latest.attempt.status === 'checking' && !canSupersedeClaimCheck) return;
    if (intent.kind === 'reference' && intent.capture.kind === 'reference') {
      const item = intent.capture.selected;
      const selectionStatus = creatorOwnerReferenceSubmissionStatus(latest, item);
      if (selectionStatus === 'rejected') {
        setMessage('Esa dirección ya fue rechazada por estar desactualizada. Elige una selección vigente del catálogo.', 'error');
        return;
      }
      if (selectionStatus !== 'ready') {
        setMessage(selectionStatus === 'needs-selection'
          ? 'Elige una ficha vigente del catálogo antes de agregarla a tu página.'
          : 'Actualiza el catálogo y vuelve a elegir una ficha vigente antes de agregarla a tu página.', 'error');
        return;
      }
    }
    if (intent.kind === 'claim' && intent.capture.kind === 'claim') {
      if (!creatorOwnerClaimSelectionIsCurrent(latest, intent.capture.selected)) {
        dispatch({ type: 'catalog-require-refresh', message: 'Actualiza el catálogo y vuelve a seleccionar las fichas cuyo destino pudo cambiar.' });
        setMessage('Actualiza el catálogo y vuelve a seleccionar las fichas cuyo destino pudo cambiar.', 'error');
        return;
      }
    }
    let request;
    try { request = prepareCreatorOwnerRequest(intent); }
    catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos preparar esta acción. Conservamos tus cambios.', 'error');
      return;
    }
    const commandHistorySequence = claimHistorySequenceRef.current;
    const operationId = nextSessionOperationId();
    dispatch({ type: 'begin-write', intent, exitTransition: exitSubmitTransitionRef.current });
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
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'recoverable', reason: outcome.reason, message: outcome.message }, commandHistorySequence);
        return;
      }
      if (outcome.kind === 'session-blocked') {
        dispatch({ type: 'write-rejected', intentId: intent.id, message: outcome.message });
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'terminal', reason: outcome.reason, message: outcome.message }, commandHistorySequence);
        return;
      }
      if (outcome.kind === 'uncertain' || outcome.kind === 'conflict') {
        dispatch({ type: 'write-uncertain', intentId: intent.id, status: outcome.kind, message: outcome.message, ...(outcome.code ? { code: outcome.code } : {}) });
        if ((intent.kind === 'reference' && ['RESOURCE_CONFLICT', 'STALE_RESOURCE_REFERENCE'].includes(outcome.code ?? ''))
          || (intent.kind === 'claim' && ['RESOURCE_CONFLICT', 'RESOURCE_URL_CONFLICT', 'STALE_RESOURCE_REFERENCE'].includes(outcome.code ?? ''))) {
          dispatch({ type: 'catalog-require-refresh', message: 'Actualiza el catálogo y vuelve a seleccionar las fichas cuya URL pudo cambiar.' });
        }
        return;
      }
      if (outcome.kind === 'rejected') {
        dispatch({ type: 'write-rejected', intentId: intent.id, message: outcome.message });
        if (outcome.viablePosition !== undefined) {
          if (intent.kind === 'move-link') dispatch({ type: 'set-link-move-suggestion', targetPosition: outcome.viablePosition });
          else dispatch({ type: 'set-move-suggestion', targetPosition: outcome.viablePosition });
        }
        return;
      }
      if (outcome.kind === 'confirmed') {
        confirmBoundWrite(commandHistorySequence, operationId, token);
      }
      const correction = creatorOwnerEditorChangedSince(intent.capture, stateRef.current.editor);
      dispatch({ type: 'write-confirmed', intentId: intent.id, effect: outcome.effect, correction });
      const referenceCompletionOwnedByReducer = intent.kind === 'reference' && intent.capture.kind === 'reference';
      const confirmedUrlDuplicate = outcome.effect.kind === 'link-added' && outcome.effect.source === 'url' && !outcome.effect.created;
      const retainsSharedAdd = intent.capture.kind === 'link-placement' && Boolean(intent.capture.pendingAddDraft);
      if (!correction && intent.capture.kind !== 'list-command' && !referenceCompletionOwnedByReducer
        && !confirmedUrlDuplicate && !retainsSharedAdd) dispatch({ type: 'close-editor' });
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
    const commandHistorySequence = claimHistorySequenceRef.current;
    let operationId = nextSessionOperationId();
    const intent = creatorOwnerWriteIntent(nextId('photo'), editor);
    dispatch({ type: 'begin-write', intent, exitTransition: exitSubmitTransitionRef.current });
    let finalizationRequested = false;
    const headers = { accept: 'application/json', 'content-type': 'application/json', 'x-csrf-token': latest.session.csrfToken, 'x-creator-page-binding': latest.sessionBinding };
    const classifyAuthorizationFailure = async (response: Response) => {
      const payload = await readCreatorSessionResponse(response);
      const sessionOutcome = classifyCreatorOwnerWriteSessionFailure(response.status, payload, 'photo');
      if (sessionOutcome?.kind === 'session') {
        dispatch({ type: 'write-rejected', intentId: intent.id, message: sessionOutcome.message });
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'recoverable', reason: sessionOutcome.reason, message: sessionOutcome.message }, commandHistorySequence);
        return true;
      }
      if (sessionOutcome?.kind === 'session-blocked') {
        dispatch({ type: 'write-rejected', intentId: intent.id, message: sessionOutcome.message });
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'terminal', reason: sessionOutcome.reason, message: sessionOutcome.message }, commandHistorySequence);
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
      confirmBoundWrite(commandHistorySequence, operationId, latest.session.csrfToken);
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
      operationId = nextSessionOperationId();
      const finish = await fetch('/api/creador/foto/finalizar/', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers,
        body: JSON.stringify({ uploadId, version: editor.base.version }) });
      const outcome = await interpretCreatorOwnerPhotoFinalize(finish, intent, uploadId);
      if (outcome.kind === 'session') {
        dispatch({ type: 'write-rejected', intentId: intent.id, message: outcome.message });
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'recoverable', reason: outcome.reason, message: outcome.message }, commandHistorySequence);
        return;
      }
      if (outcome.kind === 'session-blocked') {
        dispatch({ type: 'write-rejected', intentId: intent.id, message: outcome.message });
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'terminal', reason: outcome.reason, message: outcome.message }, commandHistorySequence);
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
      confirmBoundWrite(commandHistorySequence, operationId, latest.session.csrfToken);
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
    const historySequence = claimHistorySequenceRef.current;
    dispatch({ type: 'begin-check', intentId: intent.id, checkId });
    if (intent.kind === 'claim') {
      const profileId = latest.observed.profile?.id;
      if (profileId) await refreshClaimHistory({ intentId: intent.id, checkId, profileId });
      return;
    }
    const binding = latest.sessionBinding;
    const boundView = latest.location.view;
    const boundProfileId = latest.observed.profile?.id;
    const boundSeriesId = latest.location.query.serie;
    const operationId = nextSessionOperationId();
    const checkIsCurrent = () => {
      const current = stateRef.current;
      if (current.attempt.status !== 'checking' || current.attempt.intent.id !== intent.id || current.attempt.checkId !== checkId) return false;
      if (current.sessionBinding !== binding || current.location.view !== boundView || current.observed.profile?.id !== boundProfileId) return false;
      if (intent.capture.kind === 'list-command') {
        return !current.editor && current.attempt.intent.capture.kind === 'list-command'
          && (boundView !== 'series' || current.location.query.serie === boundSeriesId);
      }
      return current.editor?.key === intent.editorKey && current.editor.kind === intent.capture.kind;
    };
    try {
      const response = await fetch('/api/creador/perfil/', { method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { 'x-creator-page-binding': binding, accept: 'application/json' } });
      if (!checkIsCurrent()) return;
      const payload = response.ok ? null : await readCreatorSessionResponse(response);
      if (!checkIsCurrent()) return;
      const recoveryReason = creatorSessionRecoveryReason(response.status, payload);
      if (recoveryReason) {
        const message = loginRecoveryMessage(recoveryReason);
        const accepted = recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'recoverable', reason: recoveryReason, message }, historySequence);
        dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: accepted ? message : STALE_CREATOR_READ_MESSAGE, sessionDerived: accepted });
        return;
      }
      if (!response.ok) {
        const sessionState = classifyCreatorSessionCheck(response.status, payload);
        if (sessionState.state === 'context-changed') {
          const message = 'La cuenta o el rol activo no coinciden con esta página. Vuelve a la cuenta original para comprobar; conservamos tus cambios.';
          const accepted = recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'recoverable', reason: 'different-principal', message }, historySequence);
          dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: accepted ? message : STALE_CREATOR_READ_MESSAGE, sessionDerived: accepted });
          return;
        }
        if (sessionState.state === 'disabled' || sessionState.state === 'invalid-context') {
          const message = sessionState.state === 'disabled' ? 'Esta cuenta está desactivada. Conservamos tus cambios.'
            : 'El contexto de esta página no es válido. Abre una página nueva con la cuenta original.';
          const accepted = recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'terminal', reason: sessionState.state, message }, historySequence);
          dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: accepted ? message : STALE_CREATOR_READ_MESSAGE, sessionDerived: accepted });
          return;
        }
        dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: 'No pudimos leer el estado guardado. Conservamos tus cambios; puedes volver a comprobar.' });
        return;
      }
      const raw: unknown = await response.json();
      if (!checkIsCurrent()) return;
      const current = stateRef.current;
      if (!isCreatorOwnerSnapshot(raw) || (raw.profile === null && !(intent.kind === 'create-profile'
        && intent.capture.kind === 'create-profile' && current.observed.profile === null))) {
        dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: intent.capture.kind === 'list-command'
          ? 'La lectura no contiene un estado completo y coherente de esta página. Conservamos la lista; puedes volver a comprobar.'
          : 'La lectura no contiene un estado completo y coherente de esta página. Conservamos tu edición.' });
        return;
      }
      const snapshot = readCreatorEditorData(raw);
      if (boundProfileId && snapshot.profile?.id !== boundProfileId) {
        dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: 'La lectura no corresponde al perfil que abrió esta página. Conservamos tus cambios.' });
        return;
      }
      if (current.observed.profile && snapshot.profile?.id === current.observed.profile.id
        && snapshot.profile.version < current.observed.profile.version) {
        dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: 'La lectura devolvió una versión anterior a la ya observada. Conservamos tus cambios y no adoptamos esa respuesta.' });
        return;
      }
      recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'read-confirmed',
        message: 'La lectura confirmó esta página. Comprueba la sesión para habilitar cambios.' }, historySequence);
      if (intent.kind === 'photo' && intent.capture.kind === 'photo') {
        if (snapshot.profile?.id !== intent.capture.base.id) {
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
      const comparison = createCreatorOwnerComparison(intent, snapshot, current.editor);
      if (!comparison.canAdopt && intent.kind !== 'save-series') {
        comparison.message = intent.kind === 'chapter-move'
          ? 'El capítulo o la serie ya no están disponibles. Conservamos el destino para que decidas cómo seguir.'
          : 'La lectura no coincide con la página que abrió esta edición. Conservamos tus cambios.';
      }
      if (intent.capture.kind === 'list-command') {
        if (!comparison.canAdopt) {
          dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: 'No pudimos confirmar el resultado con esta lista guardada. Conservamos la lista; puedes volver a comprobar.' });
          return;
        }
        revealFocusAfterListAdoptionRef.current = intent.id;
        dispatch({ type: 'check-compared', intentId: intent.id, checkId, comparison });
        return;
      }
      dispatch({ type: 'check-compared', intentId: intent.id, checkId, comparison });
    } catch {
      if (checkIsCurrent()) {
        dispatch({ type: 'check-failed', intentId: intent.id, checkId, message: 'No pudimos conectar para leer el estado guardado. Tus cambios siguen aquí; puedes volver a comprobar.' });
      }
    }
  }

  async function checkSession() {
    const latest = stateRef.current;
    if (latest.session.state !== 'recovery-required') return;
    const recoveryReason = latest.session.reason;
    const binding = latest.sessionBinding;
    const historySequence = claimHistorySequenceRef.current;
    if (isWriteActive(latest)) {
      setMessage('Espera a que termine la operación antes de comprobar la sesión. Tus cambios siguen aquí.', 'info');
      return;
    }
    const operationId = nextSessionOperationId();
    const checkId = nextId('session-check');
    if (!isCreatorSessionBinding(latest.sessionBinding)) {
      recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'terminal', reason: 'invalid-context',
        message: 'No pudimos comprobar el contexto de esta página. Ingresa con la cuenta original y vuelve a abrirla.' }, historySequence);
      return;
    }
    const checkIsCurrent = () => {
      const current = stateRef.current;
      return current.sessionBinding === binding && current.session.state === 'checking' && current.session.checkId === checkId;
    };
    if (!queueSessionPolicyAction({ type: 'session-check-started', operationId, checkId })) return;
    try {
      const response = await fetch('/api/creador/sesion/', { method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { 'x-creator-page-binding': binding, accept: 'application/json' } });
      if (!checkIsCurrent()) return;
      const payload = await readCreatorSessionResponse(response);
      if (!checkIsCurrent()) return;
      const result = classifyCreatorSessionCheck(response.status, payload);
      if (result.state === 'ready') {
        const accepted = recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'renewed',
          csrfToken: result.csrfToken, message: 'Sesión comprobada.' }, historySequence);
        if (!accepted) return;
        const logoutForm = document.querySelector<HTMLFormElement>('[data-account-logout]');
        const tokenInput = logoutForm?.querySelector<HTMLInputElement>('input[name="csrfToken"]');
        if (tokenInput) tokenInput.value = result.csrfToken;
        return;
      }
      if (result.state === 'expired') {
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'recoverable', reason: 'expired',
          message: 'No hay una sesión activa. Ingresa con la misma cuenta en otra pestaña y vuelve a comprobarla.' }, historySequence);
      } else if (result.state === 'disabled') {
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'terminal', reason: 'disabled',
          message: 'Esta cuenta está desactivada. Conservamos tus cambios.' }, historySequence);
      } else if (result.state === 'context-changed') {
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'recoverable', reason: 'different-principal',
          message: 'La sesión activa pertenece a otra cuenta o tiene otros permisos. Ingresa con la cuenta original antes de volver a guardar.' }, historySequence);
      } else if (result.state === 'invalid-context') {
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'terminal', reason: 'invalid-context',
          message: 'No pudimos comprobar el contexto de esta página. Abre una página nueva con la cuenta original.' }, historySequence);
      } else {
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'recoverable', reason: recoveryReason,
          message: 'No pudimos comprobar la sesión. Inténtalo de nuevo; tus cambios siguen aquí.' }, historySequence);
      }
    } catch {
      if (checkIsCurrent()) recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'recoverable', reason: recoveryReason,
        message: 'No pudimos conectar para comprobar la sesión. Tus cambios siguen aquí.' }, historySequence);
    }
  }

  function adoptComparison(comparisonId: string) {
    dispatch({ type: 'adopt-comparison', comparisonId });
  }

  function checkClick() { void checkCurrentAttempt(); }

  function submitCreateProfile(retry: boolean) {
    const editor = stateRef.current.editor;
    if (editor?.kind !== 'create-profile') return;
    const form = rootRef.current?.querySelector<HTMLFormElement>('[data-owner-form="crear"]');
    if (!form?.reportValidity()) return;
    void startCommand(creatorOwnerWriteIntent(nextId(retry ? 'create-profile-retry' : 'create-profile'), editor));
  }

  function createProfile() {
    submitCreateProfile(false);
  }

  function retryCreateProfile() {
    submitCreateProfile(true);
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
      if (!latest.location.exitRequest) queueMicrotask(() => returnFocusRef.current?.focus({ preventScroll: true }));
      return;
    }
    const editor = latest.editor;
    const transition = latest.location.exitRequest;
    dispatch({ type: 'resolve-transition', action: 'continue' });
    if (!editor) return;
    window.requestAnimationFrame(() => {
      const current = stateRef.current;
      if (current.editor !== editor || current.location.prompt !== 'none') return;
      const selector = editor.kind === 'create-profile' ? '[data-owner-form="crear"]'
        : '[data-owner-dialog] form[data-owner-form]:not([hidden])';
      const form = rootRef.current?.querySelector<HTMLFormElement>(selector);
      const submitter = form?.querySelector<HTMLButtonElement>('button[type="submit"]:enabled');
      if (!form || !submitter) return;
      exitSubmitTransitionRef.current = transition;
      try {
        form.requestSubmit(submitter);
      } finally {
        exitSubmitTransitionRef.current = undefined;
      }
    });
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
  const linkListAttempt = listAttempt && (listAttempt.kind === 'remove-link' || listAttempt.kind === 'reinclude-resource');
  const showActivitySummary = !(props.view === 'estadisticas' && props.hasStatisticsDetail);

  return <div ref={rootRef}>
    <CreatorOwnerIdentityPanel
      state={state}
      logout={props.logout}
      showActivitySummary={showActivitySummary}
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
      {listAttemptState && <section class="creator-owner__conflict" data-series-list-recovery={linkListAttempt ? undefined : true} data-owner-list-recovery={linkListAttempt ? 'links' : 'series'}>
        <h3>{listAttempt.kind === 'delete-series' ? 'Comprobar eliminación' : listAttempt.kind === 'publish' ? 'Comprobar publicación' : listAttempt.kind === 'remove-link' ? 'Comprobar que se quitó el enlace' : listAttempt.kind === 'reinclude-resource' ? 'Comprobar la reincorporación' : 'Comprobar capítulos'}</h3>
        <p>{attempt.status === 'checking' ? 'Consultando el estado guardado…' : attempt.message}</p>
        {(!('comparison' in attempt) || !attempt.comparison) && <button class="button button--outline" type="button" data-owner-compare data-series-reconcile-retry disabled={attempt.status === 'checking'} onClick={checkClick}>Comprobar</button>}
      </section>}
      {props.view === 'series' && <CreatorOwnerSeriesPanel
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
      />}
      {props.view === 'enlaces' && <CreatorOwnerLinksPanel
        state={state}
        disabled={writeDisabled}
        onSearch={onLinkSearch}
        onQueryChange={onLinksQueryChange}
        onQuerySubmit={onLinksQuerySubmit}
        onAdd={openAddLink}
        onCatalog={openReferenceEditor}
        onEditLink={openLinkEditor}
        onClaim={openClaimEditor}
        onMoveLink={openLinkMoveEditor}
        onRemoveLink={removeOwnerLink}
        onEditRetained={openRetainedEditor}
        onReinclude={reincludeResource}
      />}
      {props.view === 'solicitudes' && <CreatorOwnerClaimsPanel state={state} disabled={writeDisabled}
        onOpen={() => openClaimEditor()} onCheck={() => void checkClaimHistory()} onRetryCatalog={retryCatalog} />}
      {props.view === 'estadisticas' && props.hasStatisticsDetail ? props.statistics : null}
    </CreatorOwnerIdentityPanel>
    <CreatorOwnerEditorDialog
      state={state}
      onUpdateProfile={(value) => dispatch({ type: 'update-profile-draft', value })}
      onUpdateSocial={(key, value) => dispatch({ type: 'update-socials-draft', value: { [key]: value } })}
      onUpdateSeries={updateSeriesDraft}
      onUpdateMove={(value) => dispatch({ type: 'update-move-draft', targetPosition: value })}
      onSetMoveSuggestion={(value) => dispatch({ type: 'set-move-suggestion', targetPosition: value })}
      onUpdateLink={(value) => dispatch({ type: 'update-link-draft', value })}
      onUpdateAddLink={(value) => dispatch({ type: 'update-add-link-draft', value })}
      onResumeSharedAdd={() => dispatch({ type: 'resume-shared-add' })}
      onAdoptAddPlacement={(comparisonId, addPlacementId) => dispatch({ type: 'adopt-comparison', comparisonId, addPlacementId })}
      onUpdateMoveLink={(value) => dispatch({ type: 'update-move-link-draft', targetPosition: value })}
      onUpdateReference={(value) => dispatch({ type: 'update-reference-draft', ...value })}
      onUpdateClaim={(value) => dispatch({ type: 'update-claim-draft', value })}
      onCatalogSearch={(value) => dispatch({ type: 'catalog-search', value })}
      onCatalogPage={(value) => dispatch({ type: 'catalog-page', value })}
      onCatalogRetry={retryCatalog}
      onSetPhoto={(file) => dispatch({ type: 'update-photo-file', file })}
      onSubmit={submitCurrentEditor}
      onRequestClose={closeOrGuardEditor}
      onCheck={checkClick}
      onAdopt={adoptComparison}
      onExit={resolveExit}
      onCheckSession={() => void checkSession()}
      onCheckClaim={checkClick}
    />
  </div>;
}

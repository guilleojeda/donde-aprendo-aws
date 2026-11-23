import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { CreatorOwnerSnapshotDTO, CreatorSocial } from '../../types/creators';
import { readCreatorOwnerSnapshot } from '../../lib/creator-owner-data';
import {
  createCreatorOwnerRequest,
  readCreatorOwnerAcknowledgement,
  readCreatorOwnerPhotoAuthorizationAcknowledgement,
  readCreatorOwnerPhotoFinalizeAcknowledgement,
  type CreatorOwnerOperation as CreatorOwnerWireOperation,
  type CreatorOwnerWireCommand,
} from '../../lib/creator-owner-commands';
import {
  creatorSessionRecoveryReason,
  classifyCreatorSessionCheck,
  readCreatorSessionResponse,
  isCreatorSessionBinding,
  type CreatorSessionResponse,
} from '../../lib/creator-session-response';
import { parseCreatorStatisticsSummaryReady } from '../../lib/creator-statistics-response';
import { CREATOR_CONTRACT_HEADER, CREATOR_CONTRACT_VERSION, CREATOR_FIELD_LIMITS, CREATOR_PHOTO_MAX_UPLOAD_BYTES, CREATOR_PHOTO_MIME_TYPES, CREATOR_SOCIALS } from '../../lib/creator-values.mjs';
import { usableCreatorOwnerFocusTarget } from '../../lib/creator-owner-focus';
import { creatorOwnerNavigationLists } from '../../lib/creator-owner-presentation';
import { safeCreatorSocialUrl } from '../../lib/creator-public.mjs';
import type { CreatorOwnerSeriesMembership } from '../../lib/creator-owner-series';
import { resolveOwnerDestination, type OwnerDestination } from '../../lib/creator-owner-navigation';
import { creatorOwnerLinksHref, type CreatorOwnerLinksQuery } from '../../lib/creator-owner-links';
import { parseCreatorOwnerCatalog, parseCreatorOwnerClaimUrls } from '../../lib/creator-owner-catalog';
import { transitionResourceClassification, type ResourceClassificationChange } from '../../lib/resource-form-policy.mjs';
import {
  createCreatorOwnerState,
  creatorOwnerClassificationDraft,
  creatorOwnerChapterRecoveryIsVisibleInDetail,
  creatorOwnerClaimSelectionIsCurrent,
  creatorOwnerClaimSelectionNeedsRefresh,
  creatorOwnerLinkMoveContext,
  creatorOwnerMoveDestinationIsValid,
  creatorOwnerMovePositionMessage,
  creatorOwnerPreservesAcknowledgedRead,
  deriveCreatorOwnerRecoveryAction,
  creatorOwnerReferenceSubmissionStatus,
  creatorOwnerDraftIsDirty,
  creatorOwnerReducer,
  isCreatorOwnerListAction,
  reduceCreatorOwnerSessionPolicy,
  type CreatorOwnerSessionPolicyAction,
  type CreatorOwnerSessionPolicyState,
  type CreatorOwnerEditorDraft,
  type CreatorOwnerClassificationDraft,
  type CreatorOwnerSocialsDraft,
  type CreatorOwnerIntent,
  type CreatorOwnerOperation,
  type CreatorOwnerState,
  type CreatorOwnerView,
  type CreatorOwnerReadFact,
  type CreatorOwnerEditorField,
  type CreatorOwnerFieldMessages,
} from '../../lib/creator-owner-state';
import CreatorOwnerEditorDialog from './CreatorOwnerEditorDialog';
import CreatorOwnerIdentityPanel from './CreatorOwnerIdentityPanel';
import CreatorOwnerSeriesPanel from './CreatorOwnerSeriesPanel';
import CreatorOwnerLinksPanel from './CreatorOwnerLinksPanel';
import CreatorOwnerClaimsPanel from './CreatorOwnerClaimsPanel';
import CreatorOwnerReadRecoveryAction from './CreatorOwnerReadRecoveryAction';

interface Props {
  data: CreatorOwnerSnapshotDTO;
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

interface PendingOwnerCommand extends CreatorOwnerIntent {
  fields: Record<string, unknown>;
}

function ownerIntent(command: PendingOwnerCommand): CreatorOwnerIntent {
  const { fields: _fields, ...intent } = command;
  return intent;
}

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
  return createCreatorOwnerState({
    data: props.data,
    accountEmail: props.accountEmail,
    csrfToken: props.csrfToken,
    sessionBinding: props.sessionBinding,
    isAdmin: props.isAdmin,
    publicOrigin: props.publicOrigin,
    seriesQuery: props.seriesQuery,
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

function ownerLinks(snapshot: CreatorOwnerSnapshotDTO) {
  return creatorOwnerNavigationLists(snapshot).links;
}

function ownerResource(snapshot: CreatorOwnerSnapshotDTO, resourceId: string) {
  return snapshot.resources.find((resource) => resource.id === resourceId);
}

function ownerClassificationEditable(editor: CreatorOwnerEditorDraft, snapshot: CreatorOwnerSnapshotDTO): boolean {
  if (editor.kind === 'add-link') return true;
  const resource = editor.kind === 'link-placement'
    ? snapshot.placements[editor.placementId] && ownerResource(snapshot, snapshot.placements[editor.placementId].resourceId)
    : editor.kind === 'link-resource' ? ownerResource(snapshot, editor.resourceId) : undefined;
  return Boolean(resource?.classificationEditable);
}

function ownerClassificationRejectionMessage(editor: CreatorOwnerEditorDraft, snapshot: CreatorOwnerSnapshotDTO): string {
  return ownerClassificationEditable(editor, snapshot)
    ? 'La ficha no se puede guardar con esta clasificación y sus datos públicos. Conservamos el borrador para que puedas corregirla.'
    : 'La ficha no se puede guardar con la clasificación y los datos públicos actuales. Conservamos el borrador; Administración debe corregir la clasificación o sus datos públicos.';
}

type ListRecoveryOperation = Extract<CreatorOwnerOperation,
  { status: 'reading' | 'refresh-failed' | 'unknown' | 'conflict' }> & { intent: CreatorOwnerIntent };

function isWriteActive(state: CreatorOwnerState): boolean {
  return state.operation.status === 'sending';
}

function hasUnresolvedAttempt(state: CreatorOwnerState): boolean {
  return state.operation.status === 'reading' || state.operation.status === 'refresh-failed'
    || state.operation.status === 'unknown' || state.operation.status === 'conflict';
}

function shouldGuardExit(state: CreatorOwnerState): boolean {
  return creatorOwnerDraftIsDirty(state.editor, state.observed) || hasUnresolvedAttempt(state);
}

function loginRecoveryMessage(reason: 'expired' | 'csrf'): string {
  return reason === 'expired'
    ? 'La sesión terminó. Ingresa con la misma cuenta en otra pestaña y comprueba la sesión antes de volver a guardar.'
    : 'La sesión cambió. Comprueba la sesión antes de volver a intentar; conservamos tus cambios.';
}

function rejectedOwnerWriteMessage(error: unknown, status: number): string {
  switch (error) {
    case 'INVALID_URL': return 'Revisa los datos. Ingresa una URL HTTP o HTTPS válida sin usuario ni contraseña.';
    case 'CREATOR_CONTENT_TOO_LARGE': return 'El contenido supera el espacio disponible. Conservamos el borrador para que puedas ajustarlo.';
    case 'SLUG_TAKEN':
    case 'SERIES_SLUG_TAKEN': return 'Esa dirección ya está reservada. Elige otra.';
    case 'URL_TAKEN': return 'Esa URL ya pertenece a otra ficha. Revisa la dirección.';
    case 'URL_COLLISION': return 'Hay varias fichas con esa URL. Elige una ficha concreta del catálogo o corrige la dirección.';
    default: return status === 400 || status === 422 ? 'Revisa los datos del formulario. Conservamos el borrador.'
      : 'La acción no se guardó. Conservamos el borrador para que puedas corregirlo.';
  }
}

type CreatorOwnerWriteErrorPayload = CreatorSessionResponse & { fieldErrors?: unknown };

const invalidSocialUrlMessage = 'Ingresa una URL HTTP o HTTPS completa sin usuario ni contraseña.';
const longSocialUrlMessage = `Reduce la URL a ${CREATOR_FIELD_LIMITS.social} caracteres o menos.`;
const invalidClaimUrlMessage = 'Usa una URL HTTP o HTTPS por línea, sin usuario ni contraseña.';
const photoFormatMessage = 'Elige una imagen JPEG, PNG o WebP.';
const photoSizeMessage = 'Elige una foto de entre 1 byte y 15 MiB.';

function readOwnerFieldErrors(payload: CreatorSessionResponse | null, expectedReason: string,
  messages: CreatorOwnerFieldMessages): CreatorOwnerFieldMessages | undefined {
  const fieldErrors = (payload as CreatorOwnerWriteErrorPayload | null)?.fieldErrors;
  if (!Array.isArray(fieldErrors) || fieldErrors.length === 0 || fieldErrors.length > 16) return undefined;

  const mapped: CreatorOwnerFieldMessages = {};
  for (const entry of fieldErrors as unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return undefined;
    const { field, reason } = entry as Record<string, unknown>;
    if (typeof field !== 'string' || reason !== expectedReason || !Object.hasOwn(messages, field)) return undefined;
    const knownField = field as CreatorOwnerEditorField;
    mapped[knownField] = messages[knownField];
  }
  return mapped;
}

function ownerIdentityFieldErrors(error: unknown, payload: CreatorSessionResponse | null, intent: CreatorOwnerIntent,
  editor: CreatorOwnerEditorDraft | undefined): CreatorOwnerFieldMessages | undefined {
  if (intent.action !== 'save-profile' || !editor || intent.editorKey !== editor.key) return undefined;
  if (editor.kind === 'profile' && editor.section === 'redes') {
    if (error !== 'INVALID_SOCIAL_URL' && error !== 'FIELD_TOO_LONG') return undefined;
    const invalidUrl = error === 'INVALID_SOCIAL_URL';
    const message = invalidUrl ? invalidSocialUrlMessage : longSocialUrlMessage;
    const messages = Object.fromEntries(CREATOR_SOCIALS.map((key: CreatorSocial) => [`socials.${key}`, message]));
    return readOwnerFieldErrors(payload, invalidUrl ? 'invalid_url' : 'too_long', messages);
  }
  const creating = editor?.kind === 'create-profile';
  if (!creating && !(editor.kind === 'profile' && editor.section === 'datos')) return undefined;

  if (error === 'SLUG_TAKEN') return { slug: rejectedOwnerWriteMessage(error, 409) };
  if (error === 'INVALID_SLUG') return { slug: 'Usa una dirección válida: minúsculas, números y guiones sencillos.' };
  if (error === 'INVALID_PROGRAMS') return creating ? undefined : { programs: 'Elige un programa válido.' };
  if (error !== 'PROFILE_INCOMPLETE' && error !== 'FIELD_TOO_LONG') return undefined;

  const required = error === 'PROFILE_INCOMPLETE';
  const expectedReason = required ? 'required' : 'too_long';
  const messages: CreatorOwnerFieldMessages = required
    ? { displayName: 'Ingresa un nombre visible.', slug: 'Ingresa una dirección para tu página.' }
    : { displayName: 'El campo Nombre visible supera el límite permitido.', ...(creating ? {} : {
      city: 'El campo Ciudad supera el límite permitido.',
      country: 'El campo País supera el límite permitido.',
      bio: 'La presentación supera el límite permitido.',
    }) };
  return readOwnerFieldErrors(payload, expectedReason, messages);
}

function ownerContentFieldErrors(error: unknown, payload: CreatorSessionResponse | null, intent: PendingOwnerCommand,
  editor: CreatorOwnerEditorDraft, snapshot: CreatorOwnerSnapshotDTO): CreatorOwnerFieldMessages | undefined {
  if (intent.editorKey !== editor.key) return undefined;
  const { action, fields } = intent;
  let lengthMessages: CreatorOwnerFieldMessages;
  if (action === 'add-link' || action === 'edit-link' || action === 'edit-resource') {
    if (error === 'INVALID_CLASSIFICATION') {
      if (!ownerClassificationEditable(editor, snapshot)) return undefined;
      const messages = {
        'kind-format': 'Elige un tipo y un formato compatibles.',
        topics: 'Elige hasta tres temas válidos.',
      } satisfies CreatorOwnerFieldMessages;
      for (const reason of ['required', 'invalid_combination', 'invalid_option']) {
        const mapped = readOwnerFieldErrors(payload, reason, messages);
        if (mapped) return mapped;
      }
      return undefined;
    }
    if (error === 'INVALID_TITLE' && Object.hasOwn(fields, 'title')) return { title: 'Ingresa un título.' };
    if ((error === 'INVALID_URL' || error === 'URL_TAKEN') && Object.hasOwn(fields, 'url')) {
      return { url: rejectedOwnerWriteMessage(error, 422) };
    }
    lengthMessages = { title: 'El título supera el límite de caracteres.', url: 'La URL supera el límite de caracteres.',
      description: 'La descripción supera el límite de caracteres.' };
  } else if (action === 'create-series' || action === 'edit-series') {
    if (error === 'SERIES_SLUG_TAKEN') return { slug: rejectedOwnerWriteMessage(error, 409) };
    if (error === 'INVALID_SLUG') return { slug: 'Usa minúsculas, números y guiones sencillos para la dirección.' };
    if (error === 'INVALID_NAME') return { name: 'Ingresa un nombre para la serie.' };
    lengthMessages = { name: 'El nombre de la serie supera el límite de caracteres.', description: 'La descripción supera el límite de caracteres.' };
  } else if (action === 'create-claim' && editor.kind === 'claim') {
    const hasWrittenUrls = Boolean(editor.knownUrls.trim());
    if (error === 'INVALID_URL' && hasWrittenUrls) {
      return readOwnerFieldErrors(payload, 'invalid_url', { knownUrls: invalidClaimUrlMessage });
    }
    return error === 'FIELD_TOO_LONG' ? readOwnerFieldErrors(payload, 'too_long', {
      evidence: `Reduce el contexto privado a ${CREATOR_FIELD_LIMITS.evidence} caracteres o menos.`,
      ...(hasWrittenUrls ? { knownUrls: `Usa URLs de hasta ${CREATOR_FIELD_LIMITS.url} caracteres.` } : {}),
    }) : undefined;
  } else {
    if (error === 'INVALID_POSITION' && (editor.kind === 'move-link' || editor.kind === 'move-chapter')) {
      return { position: creatorOwnerMovePositionMessage(editor, snapshot) };
    }
    if (error === 'INVALID_RESOURCE_ID' && action === 'reference-link') return { selection: 'Elige una ficha vigente del catálogo.' };
    return undefined;
  }
  return error === 'FIELD_TOO_LONG'
    ? readOwnerFieldErrors(payload, 'too_long', Object.fromEntries(Object.entries(lengthMessages).filter(([field]) => Object.hasOwn(fields, field))))
    : undefined;
}

function photoRejectionMessage(error: unknown): string | undefined {
  switch (error) {
    case 'INVALID_PHOTO_SIZE': return photoSizeMessage;
    case 'UNSUPPORTED_PHOTO_FORMAT': return photoFormatMessage;
    case 'INVALID_PHOTO': return 'No pudimos leer la imagen. Elige otro archivo.';
    case 'PHOTO_TOO_MANY_PIXELS': return 'Elige una imagen de hasta 40 megapíxeles.';
  }
}

function acknowledgedActionLabel(intent?: CreatorOwnerIntent): string {
  if (!intent) return 'La acción fue confirmada';
  if (intent.action === 'add-chapter') return intent.acknowledgement?.disposition === 'added' ? 'Capítulo agregado' : 'El capítulo ya estaba agregado';
  if (intent.action === 'remove-chapter') return intent.acknowledgement?.disposition === 'removed' ? 'Capítulo quitado' : 'El capítulo ya estaba quitado';
  if (intent.action === 'photo-finalize') return 'La foto quedó guardada';
  if (intent.action === 'create-claim') return 'La solicitud fue enviada';
  if (intent.action === 'add-link' && intent.acknowledgement?.disposition === 'resource-reused') return 'La ficha existente se agregó';
  if (intent.action === 'add-link' && intent.acknowledgement?.disposition === 'already-present') return 'El enlace ya estaba en tu página';
  return 'La acción fue confirmada';
}

function listRecoveryHeading(action: CreatorOwnerIntent['action']): string {
  switch (action) {
    case 'delete-series': return 'Comprobar eliminación';
    case 'remove-link': return 'Comprobar que se quitó el enlace';
    case 'reinclude-link': return 'Comprobar la reincorporación';
    case 'add-chapter':
    case 'remove-chapter': return 'Comprobar capítulos';
    case 'photo-authorize':
    case 'photo-finalize': return 'Comprobar la foto';
    default: return 'Actualizar el estado guardado';
  }
}

function acknowledgedReadFailureLabel(intent?: CreatorOwnerIntent): string {
  if (intent?.action === 'add-chapter' || intent?.action === 'remove-chapter' || intent?.action === 'move-chapter') return 'No pudimos actualizar la lista';
  if (intent?.action === 'create-claim') return 'No pudimos actualizar Solicitudes';
  if (intent?.action === 'photo-finalize') return 'No pudimos actualizar la foto';
  return 'No pudimos actualizar la vista';
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

function ownerNavigationTarget(hash: string): string | undefined {
  switch (hash) {
    case '#owner-series-title': return '#owner-series-title';
    case '#owner-links-title': return '#owner-links-title';
    case '#owner-activity-title': return '#owner-activity-title';
    case '#creator-statistics-title': return '#creator-statistics-title';
    case '#owner-claims-title': return '#owner-claims-title';
    default: return undefined;
  }
}

const sessionRecoveryFocus = '[data-session-recovery-check]';
const sessionTerminalFocus = '[data-session-recovery-new], [data-session-recovery-sign-in]';
const retryReadFocus = '[data-owner-refresh-retry]';
const recoveryDecisionFocus = '[data-owner-conflict-save], [data-owner-use-saved], [data-owner-return-to-draft]';

function hasUsableOwnerActiveFocus(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body && usableCreatorOwnerFocusTarget(active);
}

function visibleOwnerFocusTarget(root: ParentNode | null | undefined, selector: string): HTMLElement | undefined {
  const dialog = root?.querySelector('[data-owner-dialog][open]');
  return Array.from(dialog?.querySelectorAll<HTMLElement>(selector) ?? []).find(usableCreatorOwnerFocusTarget)
    ?? Array.from(root?.querySelectorAll<HTMLElement>(selector) ?? []).find(usableCreatorOwnerFocusTarget);
}

function ownerQueryWasValid(state: unknown, view: 'enlaces' | 'series'): boolean {
  if (typeof state !== 'object' || state === null) return false;
  const key = view === 'series' ? 'creatorOwnerSeriesQueryValid' : 'creatorOwnerLinksQueryValid';
  return (state as Record<string, unknown>)[key] === true;
}

function creatorCopyIdentity(profile: CreatorOwnerSnapshotDTO['profile']): string {
  return profile ? `${profile.id}:${profile.slug}` : '';
}

export default function CreatorOwnerApp(props: Props) {
  const [state, dispatch] = useReducer(creatorOwnerReducer, props, createInitialState);
  const [copyFeedback, setCopyFeedback] = useState<{ text: string; kind: 'success' | 'error' } | undefined>();
  const copyRequestRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const rootRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pendingDetailFocusRef = useRef<HTMLElement | null>(null);
  const historyIndexRef = useRef<number | undefined>(undefined);
  const historyHrefRef = useRef(typeof window === 'undefined' ? '' : window.location.href);
  const nativeSkipActivationHrefRef = useRef<string | undefined>(undefined);
  const restoringHistoryIndexRef = useRef<number | undefined>(undefined);
  const allowedHistoryIndexRef = useRef<number | undefined>(undefined);
  const activityRequestSequenceRef = useRef(0);
  const activityStartedRef = useRef<{ key: string; sequence: number } | undefined>(undefined);
  const linksSearchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const catalogLoadRef = useRef<Promise<void> | undefined>(undefined);
  const operationGenerationRef = useRef(0);
  const sessionPolicyRef = useRef<CreatorOwnerSessionPolicyState>({ session: state.session, sessionEvidence: state.sessionEvidence });
  const sessionOperationIdRef = useRef(0);
  // requestSubmit dispatches submit synchronously, and only after native validation.
  const linksHydrationAppliedRef = useRef(false);
  const handledTransitionRef = useRef<string | undefined>(undefined);
  const previousEditorKeyRef = useRef<string | undefined>(undefined);
  const preserveExitSubmitRef = useRef(false);

  function queueSessionPolicyAction(action: CreatorOwnerSessionPolicyAction): boolean {
    const previous = sessionPolicyRef.current;
    const next = reduceCreatorOwnerSessionPolicy(previous, action);
    sessionPolicyRef.current = { session: next.session, sessionEvidence: next.sessionEvidence };
    dispatch(action);
    return next.accepted;
  }

  function recordSessionEvidence(action: Extract<CreatorOwnerSessionPolicyAction, { type: 'session-evidence' }>): boolean {
    return queueSessionPolicyAction(action);
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
    const operation = latest.operation;
    const intent = 'intent' in operation ? operation.intent : undefined;
    const isListWrite = Boolean(intent && ['publish-profile', 'delete-series', 'add-chapter', 'remove-chapter', 'remove-link', 'reinclude-link'].includes(intent.action));
    return Boolean(destination && 'query' in destination && !latest.editor && latest.location.prompt === 'none'
      && !latest.location.exitRequest && hasUnresolvedAttempt(latest)
      && isListWrite
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
    const anchorFocus = kind === 'anchor' ? ownerNavigationTarget(target.hash) : undefined;
    const focusSelector = !destination || keepNativeSkipEntry ? undefined : anchorFocus ?? queryFocus(destination, linkFocus, kind);
    return destination ? commitDestination(destination, keepNativeSkipEntry ? 'replace' : 'push', focusSelector) : false;
  }

  const currentProfile = state.observed.profile;
  const writeDisabled = !state.runtimeReady || state.session.state !== 'ready'
    || state.operation.status !== 'idle';

  useLayoutEffect(() => {
    historyIndexRef.current = ownerIndex(window.history.state);
    historyHrefRef.current = window.location.href;
    dispatch({ type: 'runtime-ready' });

    const onClick = (event: MouseEvent) => {
      const anchor = responseLink(event);
      if (!anchor || !isOrdinaryLinkClick(event, anchor)) return;
      const url = new URL(anchor.href);
      const current = new URL(window.location.href);
      if (url.hash && url.origin === current.origin && url.pathname === current.pathname && url.search === current.search) {
        const selector = ownerNavigationTarget(url.hash);
        if (!selector || rootRef.current?.querySelector(selector)) return;
        const documentUrl = new URL(url.href);
        documentUrl.hash = '';
        event.preventDefault();
        if (!blockForExit({ href: documentUrl.href, kind: 'anchor' })) window.location.assign(documentUrl.href);
        return;
      }
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
    const onInlineCreatePromptKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape') return;
      const latest = stateRef.current;
      if (latest.editor?.kind !== 'create-profile' || latest.location.prompt !== 'exit') return;
      event.preventDefault();
      resolveExit('continue');
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
    root?.addEventListener('keydown', onInlineCreatePromptKeyDown);
    window.addEventListener('creator-owner:native-fragment', onNativeFragment);
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      root?.removeEventListener('account:logout', onLogout);
      root?.removeEventListener('keydown', onInlineCreatePromptKeyDown);
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
  }, [state.location.transition, state.location.prompt, state.editor, state.operation.status]);

  useLayoutEffect(() => {
    reconcileCurrentLocation();
  }, [state.observed]);

  useEffect(() => {
    if (!state.runtimeReady) return;
    const selector = ownerNavigationTarget(window.location.hash)
      ?? (props.view === 'estadisticas' && props.hasStatisticsDetail && !window.location.hash ? '#creator-statistics-title' : undefined);
    if (!selector) return;
    const target = rootRef.current?.querySelector<HTMLElement>(selector);
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  }, [state.runtimeReady, props.view, props.hasStatisticsDetail]);

  useEffect(() => {
    copyRequestRef.current += 1;
    setCopyFeedback(undefined);
  }, [state.observed.profile?.id, state.observed.profile?.slug]);

  useEffect(() => {
    const requested = state.location.focusAfterRender;
    const sessionNeedsFocus = (state.session.state === 'recovery-required' || state.session.state === 'blocked')
      && !hasUsableOwnerActiveFocus();
    const selector = sessionNeedsFocus ? state.session.state === 'blocked' ? sessionTerminalFocus : sessionRecoveryFocus : requested;
    if (!selector || stateRef.current.location.focusAfterRender !== requested) return;
    const root = rootRef.current;
    const target = visibleOwnerFocusTarget(root, selector);
    const clearRequestedFocus = () => {
      if (requested && selector === requested) dispatch({ type: 'clear-focus', selector: requested });
    };
    if (!root || !target) {
      if (sessionNeedsFocus || requested && state.session.state !== 'ready') return;
      clearRequestedFocus();
      return;
    }
    const focusTarget = () => {
      const latestTarget = visibleOwnerFocusTarget(rootRef.current, selector);
      if (!latestTarget) {
        clearRequestedFocus();
        return;
      }
      const insideOwnerDialog = Boolean(latestTarget.closest('[data-owner-dialog]'));
      if (hasNativeSkipFocus() && ['enlaces', 'series'].includes(stateRef.current.location.view)) {
        clearRequestedFocus();
        return;
      }
      const recoveryFocusTarget = latestTarget.matches(`${retryReadFocus}, ${sessionRecoveryFocus}, ${recoveryDecisionFocus}, [data-owner-check], [data-owner-compare], [data-owner-publish-check]`)
        || selector.includes('[data-owner-dialog] form[data-owner-form]') || selector === '#owner-create-name';
      const preserveUsableFocus = recoveryFocusTarget || state.message?.sessionDerived === true
        || state.message?.scope === 'publish-profile';
      if (preserveUsableFocus && document.activeElement !== latestTarget && hasUsableOwnerActiveFocus()) {
        clearRequestedFocus();
        return;
      }
      latestTarget.focus({ preventScroll: true });
      const revealPagerFocus = selector === '#owner-link-pagination'
        || selector === '[data-series-page]:last-of-type'
        || selector === '[data-series-chapter-page]:last-of-type';
      const revealContextFocus = selector === '#owner-series-title' || selector === '#owner-series-chapters-title';
      const revealFieldError = latestTarget.hasAttribute('data-owner-content-error-focus');
      const bounds = latestTarget.getBoundingClientRect();
      const outsideViewport = bounds.top < 0 || bounds.bottom > window.innerHeight
        || bounds.left < 0 || bounds.right > window.innerWidth;
      // Recovery takes over an in-flight smooth scroll from the previous control.
      if (recoveryFocusTarget || revealFieldError || outsideViewport) {
        latestTarget.scrollIntoView({
          block: recoveryFocusTarget || insideOwnerDialog || revealPagerFocus || revealContextFocus ? 'center' : 'nearest',
          inline: 'nearest',
          behavior: 'instant',
        });
      }
      clearRequestedFocus();
    };
    const openDialog = root.querySelector<HTMLDialogElement>('[data-owner-dialog][open]');
    if (openDialog && !openDialog.contains(target)) {
      const onClose = () => {
        const current = stateRef.current;
        if (current.location.focusAfterRender !== requested || current.location.prompt !== 'none') return;
        focusTarget();
      };
      openDialog.addEventListener('close', onClose, { once: true });
      return () => openDialog.removeEventListener('close', onClose);
    }
    focusTarget();
  }, [state.location.focusAfterRender, state.operation, state.location.prompt, state.session.state]);

  useEffect(() => {
    const previous = pendingDetailFocusRef.current;
    if (!previous) return;
    pendingDetailFocusRef.current = null;
    if (state.location.view !== 'series' || !state.location.query.serie || !state.observed.series[state.location.query.serie]) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== previous) return;
    if (previous.isConnected && previous.getClientRects().length > 0 && !previous.matches(':disabled')) return;
    const search = rootRef.current?.querySelector<HTMLElement>('#owner-chapter-search');
    if (search?.getClientRects().length) search.focus();
  }, [state.observed]);

  useEffect(() => {
    const editorKey = state.editor?.key;
    if (previousEditorKeyRef.current && !editorKey && !state.location.transition && state.location.prompt === 'none'
      && !state.location.focusAfterRender) {
      const requested = returnFocusRef.current;
      const root = rootRef.current;
      const view = stateRef.current.location.view;
      const query = stateRef.current.location.query;
      const fallback = view === 'enlaces'
        ? root?.querySelector<HTMLElement>('#owner-link-search') ?? root?.querySelector<HTMLElement>('#owner-links-title')
        : view === 'series'
          ? (query.serie ? root?.querySelector<HTMLElement>('#owner-chapter-search') : root?.querySelector<HTMLElement>('#owner-series-search'))
            ?? root?.querySelector<HTMLElement>('#owner-series-title')
          : view === 'solicitudes'
            ? root?.querySelector<HTMLElement>('[data-claim-section-open]')
            : root?.querySelector<HTMLElement>('#owner-activity-title, #owner-profile-name, #owner-create-name');
      const active = document.activeElement;
      const focusReturnedFromEditor = active === document.body || active === requested
        || !(active instanceof HTMLElement) || !active.isConnected;
      if (focusReturnedFromEditor) {
        const destination = usableCreatorOwnerFocusTarget(requested) ? requested : usableCreatorOwnerFocusTarget(fallback) ? fallback : undefined;
        if (destination) {
          destination.focus({ preventScroll: true });
          if (destination === fallback && destination.matches('#owner-chapter-search, #owner-series-search, #owner-link-search')) {
            destination.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
          } else if (destination === fallback && destination.matches('#owner-series-title, #owner-links-title, #owner-activity-title')) {
            destination.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
          }
        }
      }
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
    const target = new URL('/api/creador/estadisticas/resumen/', window.location.origin);
    target.searchParams.set('periodo', String(period));
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
        const report = parseCreatorStatisticsSummaryReady(body, period, profileId);
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
        dispatch({ type: 'catalog-load-ready', entries });
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

  function retryCatalog() { void loadCatalog(true); }

  function openProfileEditor(section: 'datos' | 'redes' | 'foto') {
    const profile = stateRef.current.observed.profile;
    if (!profile || stateRef.current.session.state !== 'ready') return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (section === 'foto') {
      dispatch({ type: 'open-editor', editor: { kind: 'photo', key: `photo:${profile.id}` } });
    } else if (section === 'datos') {
      dispatch({ type: 'open-editor', editor: { kind: 'profile', section, key: `profile:datos:${profile.id}`, touchedFields: [], draft: {
        displayName: profile.displayName, slug: profile.slug, city: profile.city ?? '', country: profile.country ?? '', programs: [...profile.programs], bio: profile.bio ?? '',
      } } });
    } else {
      const draft = Object.fromEntries(CREATOR_SOCIALS.map((key) => [key, profile.socials[key] ?? ''])) as CreatorOwnerSocialsDraft;
      dispatch({ type: 'open-editor', editor: { kind: 'profile', section, key: `profile:redes:${profile.id}`, touchedFields: [], draft: {
        ...draft,
      } } });
    }
  }

  function openSeriesEditor(seriesId?: string) {
    const latest = stateRef.current;
    if (!latest.observed.profile || latest.session.state !== 'ready') return;
    const series = seriesId ? latest.observed.series[seriesId] : undefined;
    if (seriesId && !series) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: {
      kind: 'series', key: `series:${seriesId ?? 'new'}`, seriesId: seriesId ?? null,
      touchedFields: [], draft: { name: series?.name ?? '', slug: series?.slug ?? '', description: series?.description ?? '' }, slugManuallyEdited: Boolean(series),
    } });
  }

  function openMoveEditor(placementId: string) {
    const latest = stateRef.current;
    const seriesId = latest.location.query.serie;
    const series = latest.observed.series[seriesId];
    if (!latest.observed.profile || !series || !series.chapters.includes(placementId)) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: { kind: 'move-chapter', key: `move:${seriesId}:${placementId}`, seriesId, placementId,
      targetPosition: String(series.chapters.indexOf(placementId) + 1) } });
  }

  function openLinkEditor(placementId: string) {
    const latest = stateRef.current;
    const link = ownerLinks(latest.observed).find((item) => item.placementId === placementId);
    if (!latest.observed.profile || !link || latest.session.state !== 'ready') return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: { kind: 'link-placement', key: `link:${link.placementId}`, placementId,
      editable: link.metadataEditable,
      touchedFields: [], draft: { title: link.title, url: link.url, description: link.description ?? '', featured: link.featured, selectedForDirectory: link.selectedForDirectory,
        ...creatorOwnerClassificationDraft(latest.observed.resources.find(({ id }) => id === link.resourceId)!) } } });
  }

  function openRetainedEditor(resourceId: string) {
    const latest = stateRef.current;
    const resource = ownerResource(latest.observed, resourceId);
    if (!resource?.reincludeAllowed || latest.session.state !== 'ready') return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: { kind: 'link-resource', key: `resource:${resource.id}`, resourceId, touchedFields: [],
      draft: { title: resource.title, url: resource.url, description: resource.description ?? '', ...creatorOwnerClassificationDraft(resource) } } });
  }

  function openAddLink() {
    if (!stateRef.current.observed.profile || stateRef.current.session.state !== 'ready') return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: { kind: 'add-link', key: 'add-link',
      touchedFields: [], draft: { title: '', url: '', description: '', featured: false, selectedForDirectory: true, kind: '', format: '', topics: [] } } });
  }

  function openLinkMoveEditor(placementId: string) {
    const latest = stateRef.current;
    const link = ownerLinks(latest.observed).find((item) => item.placementId === placementId);
    if (!latest.observed.profile || !link) return;
    const position = creatorOwnerLinkMoveContext(latest.observed, placementId);
    if (!position) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: { kind: 'move-link', key: `move-link:${placementId}`, placementId, targetPosition: String(position.position) } });
  }

  function openReferenceEditor() {
    if (!stateRef.current.observed.profile || stateRef.current.session.state !== 'ready') return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: { kind: 'reference', key: 'reference', selectedForDirectory: true } });
    void loadCatalog();
  }

  function openClaimEditor(placementId?: string) {
    const latest = stateRef.current;
    if (!latest.observed.profile || latest.session.state !== 'ready') {
      setMessage('Primero prepara tu página para solicitar edición.', 'info');
      return;
    }
    const link = placementId ? ownerLinks(latest.observed).find((item) => item.placementId === placementId) : undefined;
    if (placementId && (!link || link.metadataEditable)) {
      setMessage('La ficha compartida cambió. Actualiza Enlaces antes de solicitar edición.', 'error');
      return;
    }
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dispatch({ type: 'open-editor', editor: { kind: 'claim', key: 'claim',
      selected: link ? [{ resourceId: link.resourceId, url: link.url, title: link.title }] : [], knownUrls: '', evidence: '' } });
    void loadCatalog();
  }

  function makeIntent(action: CreatorOwnerWireOperation, fields: Record<string, unknown>, options: {
    target?: CreatorOwnerIntent['target']; resourceVersion?: number; editor?: CreatorOwnerEditorDraft;
  } = {}): PendingOwnerCommand {
    const latest = stateRef.current;
    return { id: nextId(action), ...(options.editor ? { editorKey: options.editor.key } : {}),
      action, profileId: latest.observed.profile?.id ?? null, creatorVersion: latest.observed.creatorVersion,
      ...(options.target ? { target: options.target } : {}),
      ...(options.resourceVersion !== undefined ? { base: { resourceVersion: options.resourceVersion } } : {}), fields };
  }

  function removeOwnerLink(placementId: string) {
    const latest = stateRef.current;
    const link = ownerLinks(latest.observed).find((item) => item.placementId === placementId);
    if (!link) return;
    const message = link.metadataEditable
      ? '¿Quieres quitar este enlace de tu página? La ficha propia se conservará para editarla o volver a agregarla después.'
      : '¿Quieres quitar esta referencia de tu página? La ficha compartida no se edita ni se retira del catálogo.';
    if (!window.confirm(message)) return;
    void startCommand(makeIntent('remove-link', {}, { target: { placementId } }));
  }

  function reincludeResource(resourceId: string) {
    const resource = ownerResource(stateRef.current.observed, resourceId);
    if (!resource?.reincludeAllowed) return;
    void startCommand(makeIntent('reinclude-link', {}, { target: { resourceId }, resourceVersion: resource.version }));
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

  function confirmBoundWrite(operationId: number, csrfToken: string) {
    recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'write-confirmed',
      csrfToken, message: 'La escritura confirmó la sesión ligada.' });
  }

  function observeBoundSessionFailure(status: number, payload: CreatorSessionResponse | null, operationId: number): string | undefined {
    const recovery = creatorSessionRecoveryReason(status, payload);
    const check = classifyCreatorSessionCheck(status, payload);
    const reason = status === 409 && payload?.error === 'CREATOR_CONTRACT_OBSOLETE'
      ? 'obsolete-contract'
      : recovery ?? (check.state === 'context-changed' ? 'different-principal' : check.state);
    let message: string;
    switch (reason) {
      case 'expired':
      case 'csrf': message = loginRecoveryMessage(reason); break;
      case 'different-principal':
        message = 'La cuenta o el rol activo no coinciden con esta página. Vuelve a la cuenta original; conservamos tus cambios.';
        break;
      case 'disabled': message = 'Esta cuenta está desactivada. Conservamos tus cambios.'; break;
      case 'invalid-context': message = 'El contexto de esta página no es válido. Abre una página nueva con la cuenta original.'; break;
      case 'obsolete-contract': message = 'Esta página usa una versión anterior. Conservamos el borrador para que puedas copiarlo antes de abrir una página nueva.'; break;
      default: return undefined;
    }
    const terminal = reason === 'disabled' || reason === 'invalid-context' || reason === 'obsolete-contract';
    recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound',
      outcome: terminal ? 'terminal' : 'recoverable', reason, message });
    return message;
  }

  function rejectBoundWrite(status: number, payload: CreatorSessionResponse | null, operationId: number, intentId: string): boolean {
    const message = observeBoundSessionFailure(status, payload, operationId);
    if (!message) return false;
    operationGenerationRef.current += 1;
    dispatch({ type: 'operation-rejected', intentId, message });
    return true;
  }

  function validateSocialUrls(editor: Extract<CreatorOwnerEditorDraft, { kind: 'profile'; section: 'redes' }>): boolean {
    const form = rootRef.current?.querySelector<HTMLFormElement>('[data-owner-form="redes"]');
    let valid = true;
    for (const key of CREATOR_SOCIALS) {
      const value = editor.draft[key];
      const message = value.length > CREATOR_FIELD_LIMITS.social ? longSocialUrlMessage
        : value && !safeCreatorSocialUrl(value) ? invalidSocialUrlMessage : '';
      form?.querySelector<HTMLInputElement>(`#owner-social-${key}`)?.setCustomValidity(message);
      if (message) valid = false;
    }
    if (!valid) form?.reportValidity();
    return valid;
  }

  function operationIsCurrent(generation: number, binding: string, accountEmail: string, isAdmin: boolean,
    profileId: string | null, root: HTMLDivElement | null, ownerDocument: Document): boolean {
    const current = stateRef.current;
    return operationGenerationRef.current === generation && rootRef.current === root && document === ownerDocument
      && current.sessionBinding === binding && current.accountEmail === accountEmail && current.isAdmin === isAdmin
      && (current.observed.profile?.id ?? null) === profileId;
  }

  function snapshotMeetsTrustedFloors(snapshot: CreatorOwnerSnapshotDTO, intent?: CreatorOwnerIntent): boolean {
    const previous = stateRef.current.observed;
    if (previous.creatorVersion !== null && snapshot.creatorVersion !== null && snapshot.creatorVersion < previous.creatorVersion) return false;
    const acknowledgement = intent?.acknowledgement;
    if (!acknowledgement) return true;
    if (acknowledgement.profileId && snapshot.profile?.id !== acknowledgement.profileId) return false;
    if (acknowledgement.creatorVersionFloor !== undefined
      && (snapshot.creatorVersion === null || snapshot.creatorVersion < acknowledgement.creatorVersionFloor)) return false;
    if (acknowledgement.resourceId && acknowledgement.resourceVersionFloor !== undefined) {
      const resource = snapshot.resources.find(({ id }) => id === acknowledgement.resourceId);
      if (resource && resource.version < acknowledgement.resourceVersionFloor) return false;
    }
    if (acknowledgement.claimId && acknowledgement.claimVersion !== undefined) {
      const claim = snapshot.claims.find(({ id }) => id === acknowledgement.claimId);
      if (!claim || claim.version === undefined || claim.version < acknowledgement.claimVersion) return false;
    }
    return true;
  }

  async function readOwnerSnapshot(fact: CreatorOwnerReadFact, intent?: CreatorOwnerIntent) {
    const latest = stateRef.current;
    if (latest.operation.status === 'reading' || latest.session.state !== 'ready') return;
    const readFollowsWrite = latest.operation.status === 'sending' && intent
      && latest.operation.intent.id === intent.id && (fact === 'acknowledged' || fact === 'conflict');
    if (latest.operation.status === 'refresh-failed' && latest.operation.readContractObsolete) return;
    if (latest.operation.status === 'sending' && !readFollowsWrite) return;
    if (!readFollowsWrite && latest.operation.status !== 'idle' && latest.operation.status !== 'refresh-failed'
      && latest.operation.status !== 'unknown' && latest.operation.status !== 'conflict') return;
    const binding = latest.sessionBinding;
    const accountEmail = latest.accountEmail;
    const isAdmin = latest.isAdmin;
    const profileId = latest.observed.profile?.id ?? null;
    const root = rootRef.current;
    const ownerDocument = document;
    const generation = ++operationGenerationRef.current;
    const operationId = nextSessionOperationId();
    const recoveryFocusElement = document.activeElement instanceof HTMLElement
      && document.activeElement.matches('[data-owner-refresh-retry], [data-owner-check], [data-owner-compare], [data-owner-publish-check]')
      ? document.activeElement : undefined;
    const readMessage = fact === 'claims' ? 'Actualizando Solicitudes con una lectura completa…'
      : fact === 'acknowledged' ? `${acknowledgedActionLabel(intent)}. Actualizando el estado guardado…`
          : fact === 'conflict' ? intent?.targetMissing ? 'El destino ya no está disponible. Leyendo el estado actual y conservando el borrador…'
            : 'Leyendo el estado actual para comparar…'
          : 'Leyendo el estado guardado…';
    dispatch({ type: 'operation-reading', ...(intent ? { intent } : {}), fact, message: readMessage });
    const current = () => operationIsCurrent(generation, binding, accountEmail, isAdmin, profileId, root, ownerDocument);
    const fail = (message: string, sessionFailure = false) => {
      if (!current()) return;
      const readFailure = sessionFailure ? 'No pudimos leer el estado completo.' : message;
      const detail = fact === 'acknowledged' && !sessionFailure
        ? `${acknowledgedReadFailureLabel(intent)}. ${readFailure}` : readFailure;
      const unknownOutcome = intent?.action === 'publish-profile'
        ? 'El resultado de la publicación sigue sin confirmarse.' : 'El resultado de la acción sigue sin confirmarse.';
      const feedback = fact === 'acknowledged' ? `${acknowledgedActionLabel(intent)}. ${detail}`
        : fact === 'conflict' ? intent?.targetMissing
          ? `El destino ya no está disponible. ${readFailure}`
          : `Esta acción no se guardó. No pudimos comparar el estado actual. ${readFailure}`
          : fact === 'unknown' ? `${unknownOutcome} ${readFailure}` : readFailure;
      const chapterRefresh = fact === 'acknowledged'
        && ['add-chapter', 'remove-chapter', 'move-chapter'].includes(intent?.action ?? '');
      const staleFeedback = fact === 'acknowledged' && sessionFailure
        ? `${acknowledgedActionLabel(intent)}. ${acknowledgedReadFailureLabel(intent)}. La escritura sí quedó confirmada; la vista sigue desactualizada. Reintenta la lectura antes de guardar otra acción. No repetiremos la escritura.`
        : feedback;
      const suppressGlobalMessage = chapterRefresh || intent?.action === 'publish-profile';
      const shouldRestoreRecoveryFocus = !hasUsableOwnerActiveFocus() || document.activeElement === recoveryFocusElement;
      operationGenerationRef.current += 1;
      dispatch({ type: 'operation-read-failed', ...(intent ? { intent } : {}), fact, message: staleFeedback,
        ...(shouldRestoreRecoveryFocus && !sessionFailure ? { focusAfterRender: retryReadFocus } : {}),
        ...(suppressGlobalMessage ? { suppressGlobalMessage: true } : {}) });
    };
    try {
      const response = await fetch('/api/creador/perfil/', { method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { 'x-creator-page-binding': binding, accept: 'application/json', [CREATOR_CONTRACT_HEADER]: CREATOR_CONTRACT_VERSION } });
      if (!current()) return;
      if (!response.ok) {
        const payload = await readCreatorSessionResponse(response);
        if (!current()) return;
        const sessionFailure = observeBoundSessionFailure(response.status, payload, operationId);
        fail(sessionFailure ?? 'No pudimos leer el estado completo. La vista sigue desactualizada; vuelve a comprobar antes de guardar.', Boolean(sessionFailure));
        return;
      }
      const raw: unknown = await response.json();
      if (!current()) return;
      let snapshot: CreatorOwnerSnapshotDTO;
      try {
        const parsed = readCreatorOwnerSnapshot(raw);
        if (parsed.schemaVersion !== 3) {
          operationGenerationRef.current += 1;
          const obsoleteReadMessage = fact === 'acknowledged' && intent?.acknowledgement
            ? 'La acción está confirmada, pero esta pestaña recibió una lectura antigua. Conservamos el borrador y no volveremos a enviar la escritura. Abre la página actual en otra pestaña para continuar.'
            : intent?.action
              ? 'Esta pestaña recibió una lectura antigua y no puede instalarla en esta página. Conservamos el estado y no repetiremos la acción. Abre la página actual en otra pestaña para continuar.'
              : 'Esta pestaña recibió una lectura antigua y no puede instalarla en esta página. Conservamos el estado de esta página. Abre la página actual en otra pestaña para continuar.';
          dispatch({ type: 'operation-read-failed', ...(intent ? { intent } : {}), fact, readContractObsolete: true,
            message: obsoleteReadMessage });
          return;
        }
        snapshot = parsed;
      }
      catch {
        fail('La lectura no contiene un estado completo y válido. La vista sigue desactualizada; vuelve a comprobar.');
        return;
      }
      if (profileId && snapshot.profile?.id !== profileId) {
        fail('La lectura no corresponde al perfil que abrió esta página. Conservamos tus cambios.');
        return;
      }
      if (intent?.acknowledgement?.profileId && snapshot.profile?.id !== intent.acknowledgement.profileId) {
        fail('La lectura no corresponde al perfil confirmado por la acción. Conservamos el estado anterior.');
        return;
      }
      if (snapshot.profile === null && profileId !== null) {
        fail('La lectura no contiene el perfil que abrió esta página. Conservamos el estado anterior.');
        return;
      }
      if (!snapshotMeetsTrustedFloors(snapshot, intent)) {
        fail(STALE_CREATOR_READ_MESSAGE);
        return;
      }
      if (!recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'read-confirmed',
        message: 'La lectura confirmó esta página. Comprueba la sesión para habilitar cambios.' })) {
        fail(STALE_CREATOR_READ_MESSAGE);
        return;
      }
      if (!current()) return;
      const consumeEditor = fact === 'acknowledged' && Boolean(intent?.editorKey)
        && stateRef.current.editor?.key === intent?.editorKey
        && !(intent?.action === 'add-link' && intent.acknowledgement?.disposition !== 'resource-created');
      if (fact === 'acknowledged' && intent?.editorKey && stateRef.current.editor?.key === intent.editorKey && !consumeEditor) {
        operationGenerationRef.current += 1;
      }
      const message = fact === 'acknowledged'
        ? intent?.action === 'create-claim' ? 'La solicitud fue enviada. Actualizamos el historial sin repetir el envío.'
          : intent?.action === 'add-link' && intent.acknowledgement?.disposition === 'resource-reused'
            ? 'La ficha existente se agregó; no guardamos los metadatos del borrador. Conservamos el borrador completo para que decidas qué hacer con él.'
            : intent?.action === 'add-link' && intent.acknowledgement?.disposition === 'already-present'
              ? 'El enlace ya estaba en tu página; no cambiamos la ficha ni sus opciones. Conservamos el borrador completo para que decidas qué hacer con él.'
              : intent?.action === 'reference-link' && intent.acknowledgement?.disposition === 'already-present'
                ? 'El enlace ya estaba en tu página. Conservamos la ficha y sus opciones.'
                : 'Cambios guardados y estado actualizado.'
        : fact === 'claims' ? 'Solicitudes actualizadas con el estado completo de la página.'
          : fact === 'conflict' ? intent?.targetMissing
            ? 'El destino ya no está disponible. Conservamos el borrador; revisa el estado actual antes de continuar.'
            : 'Esta acción no se guardó. Compara el estado actual y elige cómo continuar.'
            : fact === 'unknown' && intent?.action === 'publish-profile'
              ? snapshot.profile?.published
                ? snapshot.profile.hidden
                  ? 'La publicación está guardada, pero la página ahora está oculta. No sabemos si fue esta acción la que la publicó; puedes usar lo guardado sin repetir el envío.'
                  : 'La página aparece publicada. No sabemos si fue esta acción la que la publicó; puedes usar lo guardado sin repetir el envío.'
                : 'La página sigue en borrador. No sabemos si se publicó; puedes usar lo guardado sin repetir el envío.'
              : 'La lectura no confirma si la acción anterior se guardó. Elige cómo continuar.';
      const active = document.activeElement;
      const currentState = stateRef.current;
      const currentLocation = currentState.location;
      const listAction = intent?.action;
      const selectedSeriesWillDisappear = currentLocation.view === 'series' && Boolean(currentLocation.query.serie)
        && !snapshot.series[currentLocation.query.serie];
      const chapterDetailWillDisappear = selectedSeriesWillDisappear
        && Boolean(active?.closest('[data-owner-series-chapters]'));
      const editorWillCloseWithMissingSeries = selectedSeriesWillDisappear
        && Boolean(active?.closest('[data-owner-dialog]'));
      pendingDetailFocusRef.current = active instanceof HTMLElement && active.closest('[data-owner-series-chapters]') ? active : null;
      const focusWasLost = !hasUsableOwnerActiveFocus() || active === recoveryFocusElement
        || chapterDetailWillDisappear || editorWillCloseWithMissingSeries;
      let focusAfterRender: string | undefined;
      if ((fact === 'unknown' || fact === 'conflict') && focusWasLost) {
        focusAfterRender = recoveryDecisionFocus;
      }
      if (!focusAfterRender && focusWasLost && selectedSeriesWillDisappear) focusAfterRender = '#owner-series-title';
      if (fact === 'acknowledged') {
        if (listAction === 'add-chapter' || listAction === 'remove-chapter') {
          const matchingDetail = creatorOwnerChapterRecoveryIsVisibleInDetail({ ...currentState, observed: snapshot });
          if (currentLocation.view === 'series' && (focusWasLost || active?.matches('[data-chapter-add], [data-chapter-remove]'))) {
            focusAfterRender = matchingDetail ? '#owner-chapter-search' : '#owner-series-title';
          }
        }
        if ((listAction === 'remove-link' || listAction === 'reinclude-link') && currentLocation.view === 'enlaces'
          && (focusWasLost || active?.matches('[data-link-remove], [data-resource-reinclude]'))) {
          focusAfterRender = '#owner-link-search';
        }
      }
      dispatch({ type: 'operation-read-installed', ...(intent ? { intent } : {}), fact, snapshot, message,
        ...(consumeEditor ? { consumeEditor: true } : {}), ...(focusAfterRender ? { focusAfterRender } : {}) });
    } catch {
      fail(fact === 'acknowledged'
        ? 'El estado anterior sigue visible; vuelve a comprobar. No repetiremos la escritura.'
        : 'No pudimos comprobar el estado completo. La vista sigue desactualizada; puedes volver a leerla.');
    }
  }

  async function startCommand(intent: PendingOwnerCommand, fromConflict = false, preserveExit = false) {
    const latest = stateRef.current;
    const canResolveConflict = fromConflict && latest.operation.status === 'conflict' && latest.operation.readCompleted
      && latest.operation.intent.editorKey === intent.editorKey;
    if (latest.session.state !== 'ready' || isWriteActive(latest)
      || latest.operation.status !== 'idle' && !canResolveConflict) return;
    if (intent.action === 'reference-link') {
      const selection = latest.editor?.kind === 'reference' && latest.editor.key === intent.editorKey ? latest.editor.selected : undefined;
      const selectionStatus = creatorOwnerReferenceSubmissionStatus(latest, selection);
      if (selectionStatus !== 'ready') {
        setMessage(selectionStatus === 'rejected'
          ? 'Esa dirección fue rechazada por estar desactualizada. Elige una selección vigente del catálogo.'
          : selectionStatus === 'needs-selection' ? 'Elige una ficha vigente del catálogo antes de agregarla a tu página.'
            : 'Actualiza el catálogo y vuelve a elegir una ficha vigente antes de agregarla a tu página.', 'error');
        return;
      }
    }
    if (intent.action === 'create-claim' && latest.editor?.kind === 'claim' && latest.editor.key === intent.editorKey
      && !creatorOwnerClaimSelectionIsCurrent(latest, latest.editor.selected)) {
      if (creatorOwnerClaimSelectionNeedsRefresh(latest, latest.editor.selected)) {
        dispatch({ type: 'catalog-require-refresh', message: 'Actualiza el catálogo y vuelve a seleccionar las fichas cuyo destino pudo cambiar.' });
      } else {
        rejectEditorField(latest.editor, 'selection', 'Vuelve a elegir las fichas cuya URL cambió o quítalas de la selección.');
      }
      return;
    }
    let request;
    try {
      const wireCommand: CreatorOwnerWireCommand = {
        operation: intent.action as CreatorOwnerWireOperation,
        profileId: intent.profileId,
        creatorVersion: intent.creatorVersion,
        ...(intent.target ? { target: intent.target } : {}),
        ...(intent.base ? { base: intent.base } : {}),
        fields: intent.fields,
      };
      request = createCreatorOwnerRequest(wireCommand);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos preparar esta acción. Conservamos tus cambios.', 'error');
      return;
    }
    const operationId = nextSessionOperationId();
    const generation = ++operationGenerationRef.current;
    const binding = latest.sessionBinding;
    const accountEmail = latest.accountEmail;
    const isAdmin = latest.isAdmin;
    const profileId = latest.observed.profile?.id ?? null;
    const root = rootRef.current;
    const ownerDocument = document;
    const token = latest.session.csrfToken;
    const storedIntent = ownerIntent(intent);
    dispatch({ type: 'operation-started', intent: storedIntent, ...(preserveExit ? { preserveExit: true } : {}) });
    const current = () => operationIsCurrent(generation, binding, accountEmail, isAdmin, profileId, root, ownerDocument);
    try {
      const response = await fetch(request.path, { method: request.method, credentials: 'same-origin', cache: 'no-store',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'x-csrf-token': token,
          'x-creator-page-binding': binding, [CREATOR_CONTRACT_HEADER]: CREATOR_CONTRACT_VERSION },
        body: JSON.stringify(request.body) });
      if (!current()) return;
      if (!response.ok) {
        const payload = await readCreatorSessionResponse(response);
        if (!current()) return;
        if (rejectBoundWrite(response.status, payload, operationId, intent.id)) return;
        const error = payload?.error;
        const targetMissing = response.status === 403 && error === 'RESOURCE_EDIT_FORBIDDEN'
          || response.status === 404 && ['PLACEMENT_NOT_FOUND', 'SERIES_NOT_FOUND',
            'SERIES_MEMBERSHIP_NOT_FOUND', 'RESOURCE_NOT_FOUND'].includes(String(error));
        const staleCatalog = (intent.action === 'reference-link' || intent.action === 'create-claim')
          && (response.status === 409 && error === 'RESOURCE_CONFLICT' || response.status === 404 && error === 'RESOURCE_NOT_FOUND');
        if (staleCatalog) {
          const selected = intent.action === 'reference-link' && typeof intent.fields.url === 'string' && intent.target?.resourceId
            ? { id: intent.target.resourceId, url: intent.fields.url } : undefined;
          const rejectedClaimSelection = intent.action === 'create-claim' && latest.editor?.kind === 'claim' ? latest.editor.selected : undefined;
          dispatch({ type: 'catalog-require-refresh', message: 'Actualiza el catálogo y vuelve a seleccionar las fichas cuyo destino pudo cambiar.',
            ...(selected ? { rejectedSelection: selected } : {}), ...(rejectedClaimSelection ? { rejectedClaimSelection } : {}) });
        }
        if (targetMissing || response.status === 409 && typeof error === 'string' && error.endsWith('_CONFLICT')) {
          await readOwnerSnapshot('conflict', { ...storedIntent, ...(targetMissing ? { targetMissing: true } : {}) });
          return;
        }
        if (response.status >= 500 || response.status === 408) {
          operationGenerationRef.current += 1;
          dispatch({ type: 'operation-unknown', intent: storedIntent, message: 'No pudimos confirmar el resultado. Comprueba el estado guardado antes de decidir si vuelves al borrador.' });
          return;
        }
        let message = rejectedOwnerWriteMessage(error, response.status);
        const { editor, observed } = stateRef.current;
        if (error === 'INVALID_CLASSIFICATION' && editor && intent.editorKey === editor.key) {
          message = ownerClassificationRejectionMessage(editor, observed);
        }
        if (intent.action === 'publish-profile') {
          message = error === 'PROFILE_INCOMPLETE' ? 'Completa el nombre y la dirección de tu página antes de publicar.'
            : 'No pudimos publicar tu página. Revisa tus datos o vuelve a intentarlo.';
        } else if (isCreatorOwnerListAction(intent.action)) {
          message = error === 'CREATOR_CONTENT_TOO_LARGE' ? 'No hay espacio para este cambio. Quita contenido antes de volver a intentarlo.'
            : 'La acción no se guardó. Revisa el contenido de esta sección antes de volver a intentarlo.';
        }
        const fieldErrors = editor && (ownerIdentityFieldErrors(error, payload, storedIntent, editor)
          ?? ownerContentFieldErrors(error, payload, intent, editor, observed));
        operationGenerationRef.current += 1;
        dispatch({ type: 'operation-rejected', intentId: intent.id, message, ...(fieldErrors ? { fieldErrors } : {}) });
        return;
      }
      const acknowledgement = await readCreatorOwnerAcknowledgement(response, {
        operation: intent.action as CreatorOwnerWireOperation,
        profileId: intent.profileId,
        ...(intent.target ? { target: intent.target } : {}),
        ...(intent.creatorVersion !== null ? { creatorVersion: intent.creatorVersion } : {}),
        ...(intent.base?.resourceVersion !== undefined ? { resourceVersion: intent.base.resourceVersion } : {}),
      });
      if (!current()) return;
      if (acknowledgement.kind !== 'confirmed') {
        operationGenerationRef.current += 1;
        dispatch({ type: 'operation-unknown', intent: storedIntent, message: 'La respuesta no confirma con claridad el resultado. Lee el estado guardado antes de decidir qué hacer.' });
        return;
      }
      confirmBoundWrite(operationId, token);
      const confirmedIntent: CreatorOwnerIntent = { ...storedIntent, profileId: acknowledgement.profileId,
        acknowledgement: { profileId: acknowledgement.profileId, disposition: acknowledgement.disposition,
          ...(acknowledgement.creatorVersionFloor !== undefined ? { creatorVersionFloor: acknowledgement.creatorVersionFloor } : {}),
          ...(acknowledgement.resourceId ? { resourceId: acknowledgement.resourceId } : {}),
          ...(acknowledgement.resourceVersionFloor !== undefined ? { resourceVersionFloor: acknowledgement.resourceVersionFloor } : {}),
          ...(acknowledgement.placementId ? { placementId: acknowledgement.placementId } : {}),
          ...(acknowledgement.seriesId ? { seriesId: acknowledgement.seriesId } : {}),
          ...(acknowledgement.claimId ? { claimId: acknowledgement.claimId } : {}),
          ...(acknowledgement.claimVersion !== undefined ? { claimVersion: acknowledgement.claimVersion } : {}) } };
      await readOwnerSnapshot('acknowledged', confirmedIntent);
    } catch {
      if (current()) {
        operationGenerationRef.current += 1;
        dispatch({ type: 'operation-unknown', intent: storedIntent, message: 'No pudimos confirmar el resultado. Comprueba el estado guardado antes de decidir si vuelves al borrador.' });
      }
    }
  }

  function rejectEditorField(editor: CreatorOwnerEditorDraft, field: CreatorOwnerEditorField, message: string): undefined {
    dispatch({ type: 'editor-field-rejected', editorKey: editor.key, field, message });
  }

  function intentForEditor(editor: CreatorOwnerEditorDraft): PendingOwnerCommand | undefined {
    const latest = stateRef.current;
    const snapshot = latest.observed;
    if (editor.kind === 'create-profile') return makeIntent('save-profile', { displayName: editor.draft.displayName, slug: editor.draft.slug }, { editor });
    const profile = snapshot.profile;
    if (!profile) return undefined;
    const classificationChanged = (fields: readonly string[]) => fields.some((field) => ['kind', 'format', 'topics'].includes(field));
    const classificationFields = (draft: { kind: string; format: string; topics: string[] }, fields: readonly string[], omitEmpty = false) => {
      if (!classificationChanged(fields) || omitEmpty && !draft.kind && !draft.format && draft.topics.length === 0) return {};
      return { kind: draft.kind, format: draft.format, topics: [...draft.topics] };
    };
    if (editor.kind === 'profile') {
      if (editor.section === 'redes') {
        const socials = Object.fromEntries(editor.touchedFields.map((key) => [key, editor.draft[key]]));
        return makeIntent('save-profile', { ...(Object.keys(socials).length ? { socials } : {}) }, { editor });
      }
      const optionalFields = Object.fromEntries(editor.touchedFields
        .filter((key) => key !== 'displayName' && key !== 'slug')
        .map((key) => [key, editor.draft[key]]));
      return makeIntent('save-profile', { displayName: editor.draft.displayName, slug: editor.draft.slug,
        ...optionalFields }, { editor });
    }
    if (editor.kind === 'series') {
      const action = editor.seriesId ? 'edit-series' : 'create-series';
      const optionalFields = Object.fromEntries(editor.touchedFields.filter((key) => key === 'description')
        .map((key) => [key, editor.draft[key]]));
      return makeIntent(action, { name: editor.draft.name, slug: editor.draft.slug, ...optionalFields },
        { ...(editor.seriesId ? { target: { seriesId: editor.seriesId } } : {}), editor });
    }
    if (editor.kind === 'move-chapter') {
      if (!creatorOwnerMoveDestinationIsValid(editor, snapshot)) return rejectEditorField(editor, 'position', creatorOwnerMovePositionMessage(editor, snapshot));
      return makeIntent('move-chapter', { destination: Number(editor.targetPosition) }, { target: { seriesId: editor.seriesId, placementId: editor.placementId }, editor });
    }
    if (editor.kind === 'link-placement') {
      const placement = snapshot.placements[editor.placementId];
      const resource = placement ? ownerResource(snapshot, placement.resourceId) : undefined;
      if (!placement || !resource) return undefined;
      if (!editor.editable) {
        const fields = Object.fromEntries(editor.touchedFields.filter((key) => key === 'featured' || key === 'selectedForDirectory')
          .map((key) => [key, editor.draft[key]]));
        return makeIntent('set-link-options', fields, { target: { placementId: editor.placementId }, editor });
      }
      const fields = {
        ...Object.fromEntries(editor.touchedFields
          .filter((key) => !['kind', 'format', 'topics'].includes(key))
          .map((key) => [key, editor.draft[key]])),
        ...classificationFields(editor.draft, editor.touchedFields),
      };
      return makeIntent('edit-link', fields,
        { target: { resourceId: placement.resourceId, placementId: editor.placementId }, resourceVersion: resource.version, editor });
    }
    if (editor.kind === 'link-resource') {
      const resource = ownerResource(snapshot, editor.resourceId);
      if (!resource) return undefined;
      const fields = {
        ...Object.fromEntries(editor.touchedFields
          .filter((key) => !['kind', 'format', 'topics'].includes(key))
          .map((key) => [key, editor.draft[key]])),
        ...classificationFields(editor.draft, editor.touchedFields),
      };
      return makeIntent('edit-resource', fields,
        { target: { resourceId: editor.resourceId }, resourceVersion: resource.version, editor });
    }
    if (editor.kind === 'add-link') {
      const optionalFields = Object.fromEntries(editor.touchedFields.filter((key) => key === 'description')
        .map((key) => [key, editor.draft[key]]));
      return makeIntent('add-link', { title: editor.draft.title, url: editor.draft.url,
        selectedForDirectory: editor.draft.selectedForDirectory, ...optionalFields,
        ...classificationFields(editor.draft, editor.touchedFields, true) }, { editor });
    }
    if (editor.kind === 'move-link') {
      if (!creatorOwnerMoveDestinationIsValid(editor, snapshot)) return rejectEditorField(editor, 'position', creatorOwnerMovePositionMessage(editor, snapshot));
      return makeIntent('move-link', { destination: Number(editor.targetPosition) }, { target: { placementId: editor.placementId }, editor });
    }
    if (editor.kind === 'reference') {
      if (!editor.selected) return rejectEditorField(editor, 'selection', 'Elige una ficha vigente del catálogo antes de agregarla a tu página.');
      return makeIntent('reference-link', { url: editor.selected.url, selectedForDirectory: editor.selectedForDirectory },
        { target: { resourceId: editor.selected.id }, editor });
    }
    if (editor.kind === 'claim') {
      const urls = parseCreatorOwnerClaimUrls(editor.knownUrls);
      if (!urls) return rejectEditorField(editor, 'knownUrls', invalidClaimUrlMessage);
      const resources = [
        ...editor.selected.map(({ resourceId, url }) => ({ resourceId, url })),
        ...urls.map((url) => ({ url })),
      ];
      if (!resources.length) return rejectEditorField(editor, 'destinations', 'Selecciona una ficha o agrega una URL conocida.');
      return makeIntent('create-claim', { resources, evidence: editor.evidence }, { editor });
    }
    return undefined;
  }

  function submitCurrentEditor(): boolean {
    const latest = stateRef.current;
    const editor = latest.editor;
    if (!editor) return false;
    const preserveExit = preserveExitSubmitRef.current;
    preserveExitSubmitRef.current = false;
    if (editor.kind === 'photo') {
      const profile = latest.observed.profile;
      const file = editor.file;
      if (!file || !profile || editor.key !== `photo:${profile.id}`) return false;
      const error = !CREATOR_PHOTO_MIME_TYPES.includes(file.type) ? photoFormatMessage
        : file.size === 0 || file.size > CREATOR_PHOTO_MAX_UPLOAD_BYTES ? photoSizeMessage : undefined;
      if (error) {
        const input = rootRef.current?.querySelector<HTMLInputElement>('#owner-photo-file');
        input?.setCustomValidity(error);
        input?.reportValidity();
        return false;
      }
      void startPhotoUpload(editor, preserveExit); return true;
    }
    if (editor.kind === 'profile' && editor.section === 'redes' && !validateSocialUrls(editor)) return false;
    const intent = intentForEditor(editor);
    if (!intent) return false;
    void startCommand(intent, latest.operation.status === 'conflict' && Boolean(latest.operation.readCompleted), preserveExit);
    return true;
  }

  async function startPhotoUpload(editor: Extract<CreatorOwnerEditorDraft, { kind: 'photo' }>, preserveExit = false) {
    const latest = stateRef.current;
    const profile = latest.observed.profile;
    const file = editor.file;
    const retryingConflict = latest.operation.status === 'conflict' && latest.operation.readCompleted
      && latest.operation.intent.editorKey === editor.key
      && (latest.operation.intent.action === 'photo-authorize' || latest.operation.intent.action === 'photo-finalize');
    if (!file || !profile || editor.key !== `photo:${profile.id}` || latest.session.state !== 'ready'
      || latest.operation.status !== 'idle' && !retryingConflict) return;
    const intent: CreatorOwnerIntent = { id: nextId('photo'), editorKey: editor.key, action: 'photo-authorize',
      profileId: profile.id, creatorVersion: latest.observed.creatorVersion,
    };
    const generation = ++operationGenerationRef.current;
    const operationId = nextSessionOperationId();
    const binding = latest.sessionBinding;
    const accountEmail = latest.accountEmail;
    const isAdmin = latest.isAdmin;
    const originalProfileId = profile.id;
    const root = rootRef.current;
    const ownerDocument = document;
    const token = latest.session.csrfToken;
    dispatch({ type: 'operation-started', intent, ...(preserveExit ? { preserveExit: true } : {}) });
    const current = () => operationIsCurrent(generation, binding, accountEmail, isAdmin, originalProfileId, root, ownerDocument);
    let finalizeSent = false;
    let finalizeIntent: CreatorOwnerIntent | undefined;
    try {
      const authorization = await fetch('/api/creador/foto/autorizar/', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'x-csrf-token': token,
          'x-creator-page-binding': binding, [CREATOR_CONTRACT_HEADER]: CREATOR_CONTRACT_VERSION },
        body: JSON.stringify({ creatorVersion: latest.observed.creatorVersion }) });
      if (!current()) return;
      if (!authorization.ok) {
        const payload = await readCreatorSessionResponse(authorization);
        if (!current()) return;
        if (rejectBoundWrite(authorization.status, payload, operationId, intent.id)) return;
        if (authorization.status === 409 || authorization.status === 404 && payload?.error === 'PROFILE_NOT_FOUND') {
          await readOwnerSnapshot('conflict', { ...intent,
            ...(authorization.status === 404 ? { targetMissing: true as const } : {}) });
          return;
        }
        if (authorization.status >= 500 || authorization.status === 408) {
          operationGenerationRef.current += 1;
          dispatch({ type: 'operation-unknown', intent, message: 'No pudimos confirmar la preparación. Comprueba el estado guardado antes de volver a cargar.' });
        } else {
          operationGenerationRef.current += 1;
          dispatch({ type: 'operation-rejected', intentId: intent.id, message: 'No pudimos preparar la carga. El archivo seleccionado sigue disponible.' });
        }
        return;
      }
      const prepared = await readCreatorOwnerPhotoAuthorizationAcknowledgement(authorization, { profileId: profile.id,
        ...(latest.observed.creatorVersion !== null ? { creatorVersion: latest.observed.creatorVersion } : {}) });
      if (!current()) return;
      if (prepared.kind !== 'confirmed') {
        operationGenerationRef.current += 1;
        dispatch({ type: 'operation-rejected', intentId: intent.id, message: 'No pudimos validar la preparación. La foto anterior sigue activa y conservamos el archivo.' });
        return;
      }
      confirmBoundWrite(operationId, token);
      const form = new FormData();
      for (const [key, value] of Object.entries(prepared.post.fields)) form.append(key, value);
      form.append('file', file);
      const uploadResponse = await fetch(prepared.post.url, { method: 'POST', mode: 'cors', credentials: 'omit', body: form });
      if (!current()) return;
      if (!uploadResponse.ok) {
        operationGenerationRef.current += 1;
        dispatch({ type: 'operation-rejected', intentId: intent.id, message: 'No pudimos subir la foto. La anterior sigue activa y conservamos el archivo seleccionado.' });
        return;
      }
      finalizeIntent = { ...intent, action: 'photo-finalize' };
      dispatch({ type: 'operation-started', intent: finalizeIntent, ...(preserveExit ? { preserveExit: true } : {}) });
      const finalizeId = nextSessionOperationId();
      finalizeSent = true;
      const finish = await fetch('/api/creador/foto/finalizar/', { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'x-csrf-token': token,
          'x-creator-page-binding': binding, [CREATOR_CONTRACT_HEADER]: CREATOR_CONTRACT_VERSION },
        body: JSON.stringify({ creatorVersion: latest.observed.creatorVersion, uploadId: prepared.uploadId }) });
      if (!current()) return;
      if (!finish.ok) {
        const payload = await readCreatorSessionResponse(finish);
        if (!current()) return;
        if (rejectBoundWrite(finish.status, payload, finalizeId, intent.id)) return;
        if (finish.status === 409 || finish.status === 404 && payload?.error === 'PROFILE_NOT_FOUND') {
          await readOwnerSnapshot('conflict', { ...finalizeIntent,
            ...(finish.status === 404 ? { targetMissing: true as const } : {}) });
          return;
        }
        if (finish.status >= 500 || finish.status === 408) {
          operationGenerationRef.current += 1;
          dispatch({ type: 'operation-unknown', intent: finalizeIntent, message: 'No pudimos confirmar si la foto se guardó. Comprueba el estado antes de volver a cargar.' });
        } else {
          operationGenerationRef.current += 1;
          const fieldError = finish.status === 422 ? photoRejectionMessage(payload?.error) : undefined;
          dispatch({ type: 'operation-rejected', intentId: intent.id,
            message: 'No pudimos guardar la foto. La anterior sigue activa y conservamos el archivo.',
            ...(fieldError ? { fieldErrors: { photo: fieldError } } : {}) });
        }
        return;
      }
      const finalized = await readCreatorOwnerPhotoFinalizeAcknowledgement(finish, { profileId: profile.id, uploadId: prepared.uploadId });
      if (!current()) return;
      if (finalized.kind !== 'confirmed') {
        operationGenerationRef.current += 1;
        dispatch({ type: 'operation-unknown', intent: finalizeIntent, message: 'La respuesta no confirma la foto con claridad. Comprueba el estado guardado antes de volver a cargar.' });
        return;
      }
      confirmBoundWrite(finalizeId, token);
      const confirmedIntent: CreatorOwnerIntent = { ...finalizeIntent, acknowledgement: {
        profileId: finalized.profileId, disposition: finalized.disposition, creatorVersionFloor: finalized.historicalCreatorVersion,
      } };
      await readOwnerSnapshot('acknowledged', confirmedIntent);
    } catch {
      if (current()) {
        operationGenerationRef.current += 1;
        if (finalizeSent && finalizeIntent) dispatch({ type: 'operation-unknown', intent: finalizeIntent,
          message: 'No pudimos confirmar si la foto se guardó. Comprueba el estado antes de volver a cargar.' });
        else dispatch({ type: 'operation-rejected', intentId: intent.id,
          message: 'No pudimos subir la foto. La anterior sigue activa y conservamos el archivo seleccionado.' });
      }
    }
  }

  function checkClick() {
    const operation = stateRef.current.operation;
    if (operation.status === 'unknown' || operation.status === 'conflict') void readOwnerSnapshot(operation.status, operation.intent);
    else if (operation.status === 'refresh-failed') void readOwnerSnapshot(operation.fact, operation.intent);
  }

  function checkClaimHistory() {
    if (stateRef.current.operation.status === 'idle' && stateRef.current.session.state === 'ready') void readOwnerSnapshot('claims');
  }

  async function checkSession() {
    const latest = stateRef.current;
    if (latest.session.state !== 'recovery-required') return;
    const recoveryReason = latest.session.reason;
    const binding = latest.sessionBinding;
    const accountEmail = latest.accountEmail;
    const profileId = latest.observed.profile?.id ?? null;
    const isAdmin = latest.isAdmin;
    const root = rootRef.current;
    const ownerDocument = document;
    if (latest.operation.status === 'sending' || latest.operation.status === 'reading') {
      setMessage('Espera a que termine la operación de lectura antes de comprobar la sesión.', 'info');
      return;
    }
    const operationId = nextSessionOperationId();
    const checkId = nextId('session-check');
    if (!isCreatorSessionBinding(binding)) {
      recordSessionEvidence({ type: 'session-evidence', operationId, source: 'bound', outcome: 'terminal', reason: 'invalid-context',
        message: 'No pudimos comprobar el contexto de esta página. Ingresa con la cuenta original y vuelve a abrirla.' });
      return;
    }
    const current = () => {
      const state = stateRef.current;
      return rootRef.current === root && document === ownerDocument && state.sessionBinding === binding
        && state.accountEmail === accountEmail && state.isAdmin === isAdmin && (state.observed.profile?.id ?? null) === profileId
        && state.session.state === 'checking' && state.session.checkId === checkId
        && state.operation.status !== 'sending' && state.operation.status !== 'reading';
    };
    if (!queueSessionPolicyAction({ type: 'session-check-started', operationId, checkId })) return;
    try {
      const response = await fetch('/api/creador/sesion/', { method: 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: { 'x-creator-page-binding': binding, accept: 'application/json' } });
      if (!current()) return;
      const payload = await readCreatorSessionResponse(response);
      if (!current()) return;
      const result = classifyCreatorSessionCheck(response.status, payload);
      if (result.state === 'ready') {
        if (!recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'renewed',
          csrfToken: result.csrfToken, message: 'Sesión comprobada.' })) return;
        const logoutForm = document.querySelector<HTMLFormElement>('[data-account-logout]');
        const tokenInput = logoutForm?.querySelector<HTMLInputElement>('input[name="csrfToken"]');
        if (tokenInput) tokenInput.value = result.csrfToken;
      } else if (result.state === 'expired') {
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'recoverable', reason: 'expired',
          message: 'No hay una sesión activa. Ingresa con la misma cuenta en otra pestaña y vuelve a comprobarla.' });
      } else if (result.state === 'disabled') {
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'terminal', reason: 'disabled',
          message: 'Esta cuenta está desactivada. Conservamos tus cambios.' });
      } else if (result.state === 'context-changed') {
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'recoverable', reason: 'different-principal',
          message: 'La sesión activa pertenece a otra cuenta o tiene otros permisos. Ingresa con la cuenta original antes de volver a guardar.' });
      } else if (result.state === 'invalid-context') {
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'terminal', reason: 'invalid-context',
          message: 'No pudimos comprobar el contexto de esta página. Abre una página nueva con la cuenta original.' });
      } else {
        recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'recoverable', reason: recoveryReason,
          message: 'No pudimos comprobar la sesión. Inténtalo de nuevo; tus cambios siguen aquí.' });
      }
    } catch {
      if (current()) recordSessionEvidence({ type: 'session-evidence', operationId, source: 'session-check', checkId, outcome: 'recoverable', reason: recoveryReason,
        message: 'No pudimos conectar para comprobar la sesión. Tus cambios siguen aquí.' });
    }
  }

  function submitCreateProfile(): boolean {
    const latest = stateRef.current;
    const editor = latest.editor;
    if (editor?.kind !== 'create-profile') return false;
    const preserveExit = preserveExitSubmitRef.current;
    preserveExitSubmitRef.current = false;
    const form = rootRef.current?.querySelector<HTMLFormElement>('[data-owner-form="crear"]');
    if (!form) return false;
    const intent = intentForEditor(editor);
    if (!intent) return false;
    void startCommand(intent, latest.operation.status === 'conflict' && Boolean(latest.operation.readCompleted), preserveExit);
    return true;
  }

  function createProfile() {
    submitCreateProfile();
  }

  function publishProfile() {
    if (!stateRef.current.observed.profile) return;
    void startCommand(makeIntent('publish-profile', {}));
  }

  function deleteSeries(seriesId: string) {
    const series = stateRef.current.observed.series[seriesId];
    if (!series || !window.confirm(`¿Eliminar la serie «${series.name}»? Se conservarán los enlaces de tu página, sus opciones y las demás series.`)) return;
    void startCommand(makeIntent('delete-series', {}, { target: { seriesId } }));
  }

  function mutateChapter(placementId: string, operation: 'add-chapter' | 'remove-chapter') {
    const seriesId = stateRef.current.location.query.serie;
    if (!seriesId || !stateRef.current.observed.series[seriesId]?.chapters.includes(placementId)
      && operation === 'remove-chapter') return;
    void startCommand(makeIntent(operation, {}, { target: { seriesId, placementId } }));
  }

  function updateSeriesDraft(value: { name?: string; slug?: string; description?: string }, manuallyEditedSlug = false) {
    dispatch({ type: 'update-series-draft', value, ...(manuallyEditedSlug ? { manuallyEditedSlug: true } : {}) });
  }

  function updateOwnerClassification(change: ResourceClassificationChange) {
    const editor = stateRef.current.editor;
    if (!editor || editor.kind !== 'link-placement' && editor.kind !== 'link-resource' && editor.kind !== 'add-link') return;
    const transition = transitionResourceClassification(editor.draft, change);
    if (!transition.accepted) {
      dispatch({ type: 'editor-field-rejected', editorKey: editor.key, field: 'topics', message: 'Elige hasta tres temas.' });
      return;
    }
    const value: Partial<CreatorOwnerClassificationDraft> = {};
    if (transition.value.kind !== editor.draft.kind) value.kind = transition.value.kind;
    if (transition.value.format !== editor.draft.format) value.format = transition.value.format;
    if (transition.value.topics.length !== editor.draft.topics.length
      || transition.value.topics.some((topic, index) => topic !== editor.draft.topics[index])) value.topics = transition.value.topics;
    if (Object.keys(value).length === 0) return;
    if (editor.kind === 'add-link') dispatch({ type: 'update-add-link-draft', value });
    else dispatch({ type: 'update-link-draft', value });
  }

  function submitEditorForm(preserveExit = false): boolean {
    const editor = stateRef.current.editor;
    if (!editor) return false;
    preserveExitSubmitRef.current = preserveExit;
    const selector = editor.kind === 'create-profile' ? '[data-owner-form="crear"]'
      : '[data-owner-dialog] form[data-owner-form]:not([hidden])';
    const form = rootRef.current?.querySelector<HTMLFormElement>(selector);
    const submitter = form?.querySelector<HTMLButtonElement>('button[type="submit"]:enabled');
    const generation = operationGenerationRef.current;
    if (!(form && submitter)) return false;
    form.requestSubmit(submitter);
    return operationGenerationRef.current !== generation;
  }

  function saveRecoveryDraft() {
    const operation = stateRef.current.operation;
    if (operation.status === 'conflict' && operation.readCompleted && !operation.intent.targetMissing) submitCurrentEditor();
  }

  function resolveRecovery(choice: 'saved' | 'draft') {
    const latest = stateRef.current;
    const operation = latest.operation;
    if ((operation.status === 'unknown' || operation.status === 'conflict') && operation.readCompleted) {
      const editor = latest.editor;
      const returningFromExitPrompt = choice === 'draft' && latest.location.prompt === 'exit';
      if (returningFromExitPrompt) dispatch({ type: 'clear-transition' });
      dispatch({ type: 'resolve-operation', choice });
      if (choice === 'saved' && operation.intent.action !== 'publish-profile') returnFocusRef.current?.focus({ preventScroll: true });
      else if (editor && (returningFromExitPrompt || editor.kind === 'move-chapter' || editor.kind === 'move-link')) {
        window.requestAnimationFrame(() => {
          const current = stateRef.current;
          if (current.editor?.key !== editor.key || current.operation.status !== 'idle'
            || current.location.prompt !== 'none') return;
          const moveSelector = editor.kind === 'move-chapter' ? '#owner-chapter-target-position'
            : editor.kind === 'move-link' ? '#owner-link-target-position' : undefined;
          const root = rootRef.current;
          const form = root?.querySelector<HTMLFormElement>('[data-owner-form]:not([hidden])');
          const target = moveSelector ? root?.querySelector<HTMLElement>(moveSelector)
            : [...(form?.querySelectorAll<HTMLElement>('input:not([type="hidden"]), textarea, select, button') ?? [])]
              .find((candidate) => !candidate.matches(':disabled, [readonly]') && !candidate.closest('[hidden]'));
          target?.focus({ preventScroll: true });
          if (target && moveSelector) target.scrollIntoView({ block: 'center', inline: 'nearest' });
        });
      }
    }
  }

  function resolveExit(action: 'save' | 'discard' | 'continue') {
    const latest = stateRef.current;
    if (action === 'continue') {
      preserveExitSubmitRef.current = false;
      dispatch({ type: 'resolve-transition', action });
      return;
    }
    if (action === 'discard') {
      preserveExitSubmitRef.current = false;
      if (isWriteActive(latest)) {
        setMessage('Estamos guardando la acción iniciada. Espera a que termine antes de salir.', 'info');
        return;
      }
      const acknowledgedReadCanFinish = latest.operation.status === 'reading'
        && creatorOwnerPreservesAcknowledgedRead(latest.operation, latest.location.exitRequest);
      if (!acknowledgedReadCanFinish && (latest.operation.status === 'reading' || latest.operation.status === 'refresh-failed'
        || latest.operation.status === 'unknown' || latest.operation.status === 'conflict')) operationGenerationRef.current += 1;
      dispatch({ type: 'resolve-transition', action });
      if (!latest.location.exitRequest) queueMicrotask(() => returnFocusRef.current?.focus({ preventScroll: true }));
      return;
    }
    const editor = latest.editor;
    dispatch({ type: 'resolve-transition', action: 'authorize' });
    if (!editor) return;
    window.requestAnimationFrame(() => {
      const current = stateRef.current;
      if (current.editor !== editor || current.location.prompt !== 'none') {
        preserveExitSubmitRef.current = false;
        if (current.location.transitionAuthorization === 'save') {
          dispatch({ type: 'resolve-transition', action: 'cancel-authorize' });
        }
        return;
      }
      preserveExitSubmitRef.current = true;
      if (!submitEditorForm(true)) {
        preserveExitSubmitRef.current = false;
        dispatch({ type: 'resolve-transition', action: 'cancel-authorize' });
      }
    });
  }

  function copyLink(url: string) {
    const requestId = copyRequestRef.current + 1;
    copyRequestRef.current = requestId;
    const identity = creatorCopyIdentity(stateRef.current.observed.profile);
    const applyCopyFeedback = (feedback: { text: string; kind: 'success' | 'error' }) => {
      if (copyRequestRef.current !== requestId
        || creatorCopyIdentity(stateRef.current.observed.profile) !== identity) return;
      setCopyFeedback(feedback);
    };
    setCopyFeedback(undefined);
    const success = 'Enlace copiado.';
    const failure = 'No pudimos copiar el enlace. Puedes copiarlo desde la dirección de tu página.';
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(url)
        .then(() => applyCopyFeedback({ text: success, kind: 'success' }))
        .catch(() => applyCopyFeedback({ text: failure, kind: 'error' }));
      return;
    }
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const input = document.createElement('textarea');
    input.value = url;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    input.remove();
    returnFocus?.focus({ preventScroll: true });
    applyCopyFeedback({ text: copied ? success : failure, kind: copied ? 'success' : 'error' });
  }

  const chapterRecoveryInDetail = creatorOwnerChapterRecoveryIsVisibleInDetail(state);
  const recoveryAction = deriveCreatorOwnerRecoveryAction(state);
  const listOperation = !state.editor && !chapterRecoveryInDetail
    && ['series', 'links', 'owner'].includes(recoveryAction.surface) && recoveryAction.kind !== 'none'
    && 'intent' in recoveryAction.operation && recoveryAction.operation.intent
    ? recoveryAction.operation as ListRecoveryOperation : undefined;
  const listRecoveryKind = listOperation
    ? listOperation.status === 'reading' || listOperation.status === 'refresh-failed' ? listOperation.fact : listOperation.status
    : undefined;
  const listRejection = state.message?.scope === 'list-action' ? state.message : undefined;
  const listIntent = listOperation?.intent ?? listRejection?.intent;
  const listFeedback = listOperation ? <section class="creator-owner__conflict" data-owner-recovery
    data-owner-stale={listOperation.status === 'refresh-failed' ? 'true' : undefined} data-recovery-kind={listRecoveryKind}
    data-owner-list-recovery={listOperation.intent.action === 'remove-link' || listOperation.intent.action === 'reinclude-link' ? 'links'
      : isCreatorOwnerListAction(listOperation.intent.action) ? 'series' : 'owner'}>
    <h3>{listRecoveryHeading(listOperation.intent.action)}</h3>
    <p class={listOperation.status === 'reading' ? undefined : 'creator-owner__status--error'}
      role={listOperation.status === 'reading' ? 'status' : 'alert'}>{listOperation.message}</p>
    {listOperation.status === 'refresh-failed' && <CreatorOwnerReadRecoveryAction state={state} dataAttribute="data-owner-refresh-retry" label="Reintentar actualización" onRetryRead={checkClick} />}
    {listOperation.status === 'unknown' && !listOperation.readCompleted && <CreatorOwnerReadRecoveryAction state={state} dataAttribute="data-owner-compare" label="Comprobar el estado guardado" onRetryRead={checkClick} />}
    {(listOperation.status === 'unknown' || listOperation.status === 'conflict') && listOperation.readCompleted
      && <button class="button button--outline" type="button" data-owner-use-saved onClick={() => resolveRecovery('saved')}>Usar lo guardado</button>}
  </section> : listRejection && <p class="creator-owner__status creator-owner__status--error" data-owner-list-action-error tabIndex={-1} role="alert">{listRejection.text}</p>;
  const actionFeedback = listIntent && isCreatorOwnerListAction(listIntent.action)
    && (props.view === 'enlaces' || props.view === 'series') ? { intent: listIntent, content: listFeedback } : undefined;
  const showActivitySummary = !(props.view === 'estadisticas' && props.hasStatisticsDetail);

  return <div ref={rootRef} data-owner-operation={state.operation.status}
    data-owner-stale={state.operation.status === 'refresh-failed' ? 'true' : undefined}>
    <CreatorOwnerIdentityPanel
      state={state}
      logout={props.logout}
      showActivitySummary={showActivitySummary}
      statusInSection={Boolean(listRejection || listOperation && state.message?.text === listOperation.message)}
      disabled={writeDisabled}
      onOpenProfile={openProfileEditor}
      onCreateProfile={createProfile}
      onPublish={publishProfile}
      onActivityPeriod={(period) => dispatch({ type: 'set-activity-period', period })}
      onRetryActivity={() => dispatch({ type: 'activity-retry' })}
      onCreateProfileInput={(value) => dispatch({ type: 'update-profile-draft', value })}
      onRetryRead={checkClick}
      onCheckSession={() => void checkSession()}
      onResolveRecovery={resolveRecovery}
      onSaveRecoveryDraft={saveRecoveryDraft}
      onExit={resolveExit}
      onCopyLink={copyLink}
      copyFeedback={copyFeedback}
    >
      {!actionFeedback && listFeedback}
      {props.view === 'series' && <CreatorOwnerSeriesPanel
        state={state}
        actionFeedback={actionFeedback}
        disabled={writeDisabled}
        onSeriesSearch={(value) => dispatch({ type: 'set-series-search', value })}
        onChapterSearch={(value) => dispatch({ type: 'set-chapter-search', value })}
        onChapterMembership={(value) => dispatch({ type: 'set-pending-membership', value })}
        onCreate={() => openSeriesEditor()}
        onEditSeries={openSeriesEditor}
        onDeleteSeries={deleteSeries}
        onAddChapter={(placementId) => mutateChapter(placementId, 'add-chapter')}
        onRemoveChapter={(placementId) => mutateChapter(placementId, 'remove-chapter')}
        onMoveChapter={openMoveEditor}
        onRetryRead={checkClick}
      />}
      {props.view === 'enlaces' && <CreatorOwnerLinksPanel
        state={state}
        actionFeedback={actionFeedback}
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
        onOpen={() => openClaimEditor()} onRefresh={checkClaimHistory} onRetryRead={checkClick} onRetryCatalog={retryCatalog} />}
      {props.view === 'estadisticas' && props.hasStatisticsDetail ? props.statistics : null}
    </CreatorOwnerIdentityPanel>
    <CreatorOwnerEditorDialog
      state={state}
      onUpdateProfile={(value) => dispatch({ type: 'update-profile-draft', value })}
      onUpdateSocial={(key, value) => dispatch({ type: 'update-socials-draft', value: { [key]: value } })}
      onUpdateSeries={updateSeriesDraft}
      onUpdateMove={(value) => dispatch({ type: 'update-move-draft', targetPosition: value })}
      onUpdateLink={(value) => dispatch({ type: 'update-link-draft', value })}
      onUpdateAddLink={(value) => dispatch({ type: 'update-add-link-draft', value })}
      onClassificationChange={updateOwnerClassification}
      onUpdateMoveLink={(value) => dispatch({ type: 'update-move-link-draft', targetPosition: value })}
      onUpdateReference={(value) => dispatch({ type: 'update-reference-draft', ...value })}
      onUpdateClaim={(value) => dispatch({ type: 'update-claim-draft', value })}
      onCatalogSearch={(value) => dispatch({ type: 'catalog-search', value })}
      onCatalogPage={(value) => dispatch({ type: 'catalog-page', value })}
      onCatalogRetry={retryCatalog}
      onSetPhoto={(file) => dispatch({ type: 'update-photo-file', file })}
      onSubmit={submitCurrentEditor}
      onRequestClose={closeOrGuardEditor}
      onRetryRead={checkClick}
      onResolveRecovery={resolveRecovery}
      onSaveRecoveryDraft={saveRecoveryDraft}
      onExit={resolveExit}
      onCheckSession={() => void checkSession()}
    />
  </div>;
}

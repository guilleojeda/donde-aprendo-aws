import type {
  CreatorCatalogSelectionDTO,
  CreatorClaimDTO,
  CreatorOwnerSnapshotDTO,
  CreatorOwnerSnapshotV2DTO,
  CreatorOwnerSnapshotWireDTO,
  CreatorProgram,
  CreatorSocial,
} from '../types/creators';
import type { CreatorOwnerSeriesMembership, CreatorOwnerSeriesQuery } from './creator-owner-series';
import { CREATOR_SOCIALS } from './creator-values.mjs';
import { isCreatorOwnerV3Resource } from './creator-owner-data';
import { DEFAULT_CREATOR_OWNER_LINKS_QUERY, type CreatorOwnerLinksQuery } from './creator-owner-links';
import { normalizeOwnerLinksQuery, normalizeOwnerSeriesQuery } from './creator-owner-navigation';

export type CreatorOwnerProfileDraft = {
  displayName: string;
  slug: string;
  city: string;
  country: string;
  programs: CreatorProgram[];
  bio: string;
};
export type CreatorOwnerProfileField = keyof CreatorOwnerProfileDraft;
export type CreatorOwnerIdentityField = CreatorOwnerProfileField | `socials.${CreatorSocial}` | 'photo';

export type CreatorOwnerSocialsDraft = Record<CreatorSocial, string>;
export type CreatorOwnerSeriesDraft = { name: string; slug: string; description: string };
export type CreatorOwnerSeriesField = keyof CreatorOwnerSeriesDraft;
export type CreatorOwnerClassificationDraft = { kind: string; format: string; topics: string[] };
export type CreatorOwnerClassificationField = keyof CreatorOwnerClassificationDraft | 'kind-format';
export type CreatorOwnerLinkDraft = {
  title: string;
  url: string;
  description: string;
  featured: boolean;
  selectedForDirectory: boolean;
} & CreatorOwnerClassificationDraft;
export type CreatorOwnerPlacementField = keyof CreatorOwnerLinkDraft;
export type CreatorOwnerResourceField = 'title' | 'url' | 'description' | keyof CreatorOwnerClassificationDraft;
export type CreatorOwnerAddLinkField = 'title' | 'url' | 'description' | 'selectedForDirectory' | keyof CreatorOwnerClassificationDraft;
export type CreatorOwnerEditorField = CreatorOwnerIdentityField | CreatorOwnerSeriesField | CreatorOwnerResourceField
  | 'position' | 'selection' | 'destinations' | 'knownUrls' | 'evidence' | CreatorOwnerClassificationField;
export type CreatorOwnerFieldMessages = Partial<Record<CreatorOwnerEditorField, string>>;
export type CreatorOwnerClaimSelection = { resourceId: string; url: string; title: string };
export type CreatorOwnerReferenceCandidate = Pick<CreatorCatalogSelectionDTO, 'id' | 'url' | 'title'>;

export function creatorOwnerClassificationDraft(resource: CreatorOwnerSnapshotDTO['resources'][number]): CreatorOwnerClassificationDraft {
  if (isCreatorOwnerV3Resource(resource)
    && (resource.classification.state === 'explicit' || resource.classification.state === 'legacy')) {
    return {
      kind: resource.classification.kind,
      format: resource.classification.format,
      topics: [...resource.classification.topics],
    };
  }
  return { kind: '', format: '', topics: [] };
}

/** Editor data is only the user's current input. The canonical base stays in `observed`. */
export type CreatorOwnerEditorDraft =
  | { kind: 'create-profile'; key: 'create-profile'; draft: Pick<CreatorOwnerProfileDraft, 'displayName' | 'slug'> }
  | { kind: 'profile'; key: string; section: 'datos'; draft: CreatorOwnerProfileDraft; touchedFields: CreatorOwnerProfileField[] }
  | { kind: 'profile'; key: string; section: 'redes'; draft: CreatorOwnerSocialsDraft; touchedFields: CreatorSocial[] }
  | { kind: 'photo'; key: string; file?: File }
  | { kind: 'series'; key: string; seriesId: string | null; draft: CreatorOwnerSeriesDraft; touchedFields: CreatorOwnerSeriesField[]; slugManuallyEdited: boolean }
  | { kind: 'move-chapter'; key: string; seriesId: string; placementId: string; targetPosition: string }
  | { kind: 'link-placement'; key: string; placementId: string; editable: boolean; draft: CreatorOwnerLinkDraft; touchedFields: CreatorOwnerPlacementField[] }
  | { kind: 'link-resource'; key: string; resourceId: string; draft: Pick<CreatorOwnerLinkDraft, 'title' | 'url' | 'description' | 'kind' | 'format' | 'topics'>; touchedFields: CreatorOwnerResourceField[] }
  | { kind: 'add-link'; key: 'add-link'; draft: CreatorOwnerLinkDraft; touchedFields: CreatorOwnerAddLinkField[] }
  | { kind: 'move-link'; key: string; placementId: string; targetPosition: string }
  | { kind: 'reference'; key: 'reference'; selected?: CreatorOwnerReferenceCandidate; selectedForDirectory: boolean }
  | { kind: 'claim'; key: 'claim'; selected: CreatorOwnerClaimSelection[]; knownUrls: string; evidence: string };

export type CreatorOwnerCommandAction =
  | 'save-profile' | 'publish-profile' | 'add-link' | 'reference-link' | 'reinclude-link'
  | 'edit-link' | 'set-link-options' | 'remove-link' | 'move-link'
  | 'create-series' | 'edit-series' | 'delete-series' | 'add-chapter' | 'remove-chapter' | 'move-chapter'
  | 'edit-resource' | 'create-claim' | 'photo-authorize' | 'photo-finalize';

export type CreatorOwnerListAction = 'remove-link' | 'reinclude-link' | 'delete-series' | 'add-chapter' | 'remove-chapter';

export function isCreatorOwnerListAction(action?: CreatorOwnerCommandAction): action is CreatorOwnerListAction {
  return action === 'remove-link' || action === 'reinclude-link' || action === 'delete-series'
    || action === 'add-chapter' || action === 'remove-chapter';
}

export interface CreatorOwnerIntent {
  id: string;
  editorKey?: string;
  action: CreatorOwnerCommandAction;
  profileId: string | null;
  creatorVersion: number | null;
  target?: { resourceId?: string; placementId?: string; seriesId?: string };
  targetMissing?: true;
  base?: { resourceVersion?: number };
  acknowledgement?: {
    profileId: string | null;
    disposition: string;
    creatorVersionFloor?: number;
    resourceId?: string;
    resourceVersionFloor?: number;
    placementId?: string;
    seriesId?: string;
    claimId?: string;
    claimVersion?: number;
  };
}

export type CreatorOwnerReadFact = 'acknowledged' | 'unknown' | 'conflict' | 'claims';

export type CreatorOwnerOperation =
  | { status: 'idle' }
  | { status: 'sending'; intent: CreatorOwnerIntent }
  | { status: 'reading'; intent?: CreatorOwnerIntent; fact: CreatorOwnerReadFact; message: string }
  | { status: 'refresh-failed'; intent?: CreatorOwnerIntent; fact: CreatorOwnerReadFact; message: string; readContractObsolete?: true }
  | { status: 'unknown'; intent: CreatorOwnerIntent; message: string; readCompleted?: true }
  | { status: 'conflict'; intent: CreatorOwnerIntent; message: string; readCompleted?: true };

export type CreatorOwnerRecoveryChoice = 'saved' | 'draft';
export type CreatorOwnerView = 'enlaces' | 'series' | 'solicitudes' | 'estadisticas';
export type CreatorOwnerTransition = { href: string; kind: 'anchor' | 'form' | 'history' | 'logout'; historyIndex?: number };

export type CreatorOwnerSession =
  | { state: 'ready'; csrfToken: string }
  | { state: 'recovery-required'; reason: 'expired' | 'csrf' | 'different-principal' | 'disabled' | 'check-required'; message: string; csrfToken?: string }
  | { state: 'checking'; reason: 'expired' | 'csrf' | 'different-principal' | 'disabled' | 'check-required'; message: string; checkId: string; csrfToken?: string }
  | { state: 'blocked'; reason: 'disabled' | 'invalid-context' | 'obsolete-contract'; message: string };

export interface CreatorOwnerLocation {
  view: CreatorOwnerView;
  query: CreatorOwnerSeriesQuery;
  pendingSeriesSearch: string;
  pendingChapterSearch: string;
  pendingMembership: CreatorOwnerSeriesMembership;
  linksQuery: CreatorOwnerLinksQuery;
  pendingLinksQuery: CreatorOwnerLinksQuery;
  linksQueryError?: string;
  exitRequest?: CreatorOwnerTransition;
  transition?: CreatorOwnerTransition;
  transitionAuthorization?: 'save' | 'discard';
  prompt: 'none' | 'exit';
  focusAfterRender?: string;
}

export interface CreatorOwnerState {
  observed: CreatorOwnerSnapshotDTO;
  accountEmail: string;
  sessionBinding: string;
  sessionEvidence: { latestBoundOperationId: number; latestSessionCheckOperationId: number };
  isAdmin: boolean;
  publicOrigin: string;
  seriesQueryError?: string;
  editor?: CreatorOwnerEditorDraft;
  operation: CreatorOwnerOperation;
  session: CreatorOwnerSession;
  location: CreatorOwnerLocation;
  activity: {
    period: 7 | 30;
    sequence: number;
    status: 'idle' | 'loading' | 'ready' | 'error';
    report?: import('./creator-statistics-types').CreatorStatisticsSummaryReady;
    message?: string;
  };
  catalog: {
    status: 'idle' | 'loading' | 'ready' | 'error';
    entries?: CreatorCatalogSelectionDTO[];
    message?: string;
    search: string;
    page: number;
    needsRefresh: boolean;
    rejectedReferenceSelections: Pick<CreatorCatalogSelectionDTO, 'id' | 'url'>[];
    rejectedClaimSelection?: readonly CreatorOwnerClaimSelection[];
  };
  message?: { text: string; kind: 'info' | 'success' | 'error'; sessionDerived?: true; scope?: 'publish-profile' | 'list-action'; intent?: CreatorOwnerIntent };
  editorFeedback?: {
    editorKey: string;
    text?: string;
    fieldErrors?: CreatorOwnerFieldMessages;
  };
  runtimeReady: boolean;
}

export type CreatorOwnerSessionPolicyAction =
  | { type: 'session-check-started'; operationId: number; checkId: string }
  | { type: 'session-evidence'; operationId: number; source: 'bound' | 'session-check'; checkId?: string;
      outcome: 'recoverable' | 'terminal' | 'read-confirmed' | 'write-confirmed' | 'renewed'; reason?: 'expired' | 'csrf' | 'different-principal' | 'disabled' | 'check-required' | 'invalid-context' | 'obsolete-contract';
      message: string; csrfToken?: string };

export type CreatorOwnerAction = CreatorOwnerSessionPolicyAction
  | { type: 'runtime-ready' }
  | { type: 'open-editor'; editor: CreatorOwnerEditorDraft }
  | { type: 'close-editor' }
  | { type: 'update-profile-draft'; value: Partial<CreatorOwnerProfileDraft> }
  | { type: 'update-socials-draft'; value: Partial<CreatorOwnerSocialsDraft> }
  | { type: 'update-series-draft'; value: Partial<CreatorOwnerSeriesDraft>; manuallyEditedSlug?: boolean }
  | { type: 'update-move-draft'; targetPosition: string }
  | { type: 'update-link-draft'; value: Partial<CreatorOwnerLinkDraft> }
  | { type: 'update-add-link-draft'; value: Partial<CreatorOwnerLinkDraft> }
  | { type: 'update-move-link-draft'; targetPosition: string }
  | { type: 'update-reference-draft'; selected?: CreatorOwnerReferenceCandidate; selectedForDirectory?: boolean }
  | { type: 'update-claim-draft'; value: { selected?: CreatorOwnerClaimSelection[]; knownUrls?: string; evidence?: string } }
  | { type: 'update-photo-file'; file?: File }
  | { type: 'editor-field-rejected'; editorKey: string; field: CreatorOwnerEditorField; message: string }
  | { type: 'catalog-load-started' }
  | { type: 'catalog-load-ready'; entries: CreatorCatalogSelectionDTO[]; message?: string }
  | { type: 'catalog-load-failed'; message: string }
  | { type: 'catalog-search'; value: string }
  | { type: 'catalog-page'; value: number }
  | { type: 'catalog-require-refresh'; message: string; rejectedSelection?: Pick<CreatorCatalogSelectionDTO, 'id' | 'url'>;
      rejectedClaimSelection?: readonly CreatorOwnerClaimSelection[] }
  | { type: 'operation-started'; intent: CreatorOwnerIntent; preserveExit?: boolean }
  | { type: 'operation-reading'; intent?: CreatorOwnerIntent; fact: CreatorOwnerReadFact; message: string }
  | { type: 'operation-read-failed'; intent?: CreatorOwnerIntent; fact: CreatorOwnerReadFact; message: string; suppressGlobalMessage?: boolean; focusAfterRender?: string; readContractObsolete?: true }
  | { type: 'operation-read-installed'; intent?: CreatorOwnerIntent; fact: CreatorOwnerReadFact; snapshot: CreatorOwnerSnapshotDTO; message: string; consumeEditor?: boolean; focusAfterRender?: string }
  | { type: 'operation-unknown'; intent: CreatorOwnerIntent; message: string }
  | { type: 'operation-rejected'; intentId: string; message: string; fieldErrors?: CreatorOwnerFieldMessages }
  | { type: 'resolve-operation'; choice: CreatorOwnerRecoveryChoice }
  | { type: 'set-message'; text: string; kind?: 'info' | 'success' | 'error' }
  | { type: 'set-series-search'; value: string }
  | { type: 'set-chapter-search'; value: string }
  | { type: 'set-pending-membership'; value: CreatorOwnerSeriesMembership }
  | { type: 'apply-query'; query: CreatorOwnerSeriesQuery; focusSelector?: string; preservePending?: boolean }
  | { type: 'set-links-pending-query'; query: Partial<CreatorOwnerLinksQuery> }
  | { type: 'apply-links-query'; query: CreatorOwnerLinksQuery; focusSelector?: string; preservePending?: boolean }
  | { type: 'set-series-query-error'; reason: 'series' }
  | { type: 'set-links-query-error'; reason: 'links' }
  | { type: 'clear-focus'; selector: string }
  | { type: 'request-exit'; transition: CreatorOwnerTransition }
  | { type: 'clear-transition' }
  | { type: 'resolve-transition'; action: 'discard' | 'continue' | 'authorize' | 'cancel-authorize' }
  | { type: 'set-prompt'; prompt: CreatorOwnerLocation['prompt'] }
  | { type: 'activity-loading'; period: 7 | 30; sequence: number }
  | { type: 'set-activity-period'; period: 7 | 30 }
  | { type: 'activity-retry' }
  | { type: 'activity-ready'; period: 7 | 30; sequence: number; report: import('./creator-statistics-types').CreatorStatisticsSummaryReady }
  | { type: 'activity-failed'; period: 7 | 30; sequence: number; message: string };

export type CreatorOwnerSessionPolicyState = Pick<CreatorOwnerState, 'session' | 'sessionEvidence'>;
export type CreatorOwnerSessionPolicyResult = CreatorOwnerSessionPolicyState & {
  feedback?: CreatorOwnerState['message'];
  clearFeedback?: true;
  attemptFeedback?: NonNullable<CreatorOwnerState['message']>;
  accepted: boolean;
};

export function reduceCreatorOwnerSessionPolicy(
  state: CreatorOwnerSessionPolicyState,
  action: CreatorOwnerSessionPolicyAction,
): CreatorOwnerSessionPolicyResult {
  const current = state.session;
  if (action.type === 'session-check-started') {
    if (action.operationId <= state.sessionEvidence.latestSessionCheckOperationId || current.state !== 'recovery-required') return { ...state, accepted: false };
    return { ...state, sessionEvidence: { ...state.sessionEvidence, latestSessionCheckOperationId: action.operationId },
      session: { ...current, state: 'checking', checkId: action.checkId },
      feedback: { text: 'Comprobando la sesión…', kind: 'info', sessionDerived: true }, accepted: true };
  }
  if (action.source === 'bound' && (action.operationId <= state.sessionEvidence.latestBoundOperationId
    || action.operationId <= state.sessionEvidence.latestSessionCheckOperationId)) return { ...state, accepted: false };
  if (action.source === 'session-check' && (action.operationId !== state.sessionEvidence.latestSessionCheckOperationId
    || state.sessionEvidence.latestBoundOperationId > action.operationId
    || current.state !== 'checking' || current.checkId !== action.checkId)) return { ...state, accepted: false };
  if (current.state === 'blocked') return { ...state, accepted: false };

  const evidence = action.source === 'bound'
    ? { ...state.sessionEvidence, latestBoundOperationId: action.operationId }
    : state.sessionEvidence;
  if (action.outcome === 'read-confirmed') {
    if (action.source !== 'bound') return { ...state, accepted: false };
    if (current.state !== 'ready') {
      const message = 'La lectura confirmó esta página. Comprueba la sesión para habilitar cambios.';
      return { ...state, sessionEvidence: evidence, session: { state: 'recovery-required', reason: 'check-required', message,
        ...(current.csrfToken ? { csrfToken: current.csrfToken } : {}) },
        feedback: { text: message, kind: 'info', sessionDerived: true }, accepted: true };
    }
    return { ...state, sessionEvidence: evidence, clearFeedback: true, accepted: true };
  }
  if (action.outcome === 'write-confirmed' || action.outcome === 'renewed') {
    if (action.source === 'session-check' && action.outcome !== 'renewed'
      || action.source === 'bound' && action.outcome !== 'write-confirmed'
      || typeof action.csrfToken !== 'string') return { ...state, accepted: false };
    const recovering = current.state !== 'ready';
    const feedback = recovering ? { text: action.source === 'session-check'
      ? 'Sesión comprobada. Tus cambios siguen aquí; puedes decidir qué guardar.'
      : 'La respuesta ligada confirmó el acceso a esta página. Conservamos tus cambios.', kind: 'success' as const, sessionDerived: true as const } : undefined;
    return { ...state, sessionEvidence: evidence, session: { state: 'ready', csrfToken: action.csrfToken },
      ...(feedback ? { feedback } : { clearFeedback: true as const }),
      ...(action.source === 'session-check' ? { attemptFeedback: {
        text: 'La sesión está comprobada. El resultado del intento sigue pendiente; comprueba lo guardado antes de decidir si volver a enviarlo.', kind: 'info' as const,
      } } : {}), accepted: true };
  }
  if (action.outcome === 'terminal') {
    if (action.reason !== 'disabled' && action.reason !== 'invalid-context' && action.reason !== 'obsolete-contract') return { ...state, accepted: false };
    return { ...state, sessionEvidence: evidence, session: { state: 'blocked', reason: action.reason, message: action.message },
      feedback: { text: action.message, kind: 'error', sessionDerived: true },
      ...(action.source === 'session-check' ? { attemptFeedback: { text: action.message, kind: 'error' as const, sessionDerived: true as const } } : {}), accepted: true };
  }
  if (action.outcome === 'recoverable') {
    if (!action.reason || action.reason === 'invalid-context' || action.reason === 'obsolete-contract' || action.reason === 'disabled' && action.source === 'bound') return { ...state, accepted: false };
    return { ...state, sessionEvidence: evidence, session: { state: 'recovery-required', reason: action.reason, message: action.message,
      ...(current.state === 'ready' ? { csrfToken: current.csrfToken } : current.csrfToken ? { csrfToken: current.csrfToken } : {}) },
      feedback: { text: action.message, kind: 'error', sessionDerived: true },
      ...(action.source === 'session-check' ? { attemptFeedback: { text: action.message, kind: 'error' as const, sessionDerived: true as const } } : {}), accepted: true };
  }
  return { ...state, accepted: false };
}

function copyClaim(claim: CreatorClaimDTO): CreatorClaimDTO {
  return { ...claim, resourceIds: [...claim.resourceIds], ...(claim.resources ? { resources: claim.resources.map((item) => ({ ...item })) } : {}) };
}

export function copyCreatorOwnerSnapshot(snapshot: CreatorOwnerSnapshotDTO): CreatorOwnerSnapshotDTO;
export function copyCreatorOwnerSnapshot(snapshot: CreatorOwnerSnapshotV2DTO): CreatorOwnerSnapshotV2DTO;
export function copyCreatorOwnerSnapshot(snapshot: CreatorOwnerSnapshotWireDTO): CreatorOwnerSnapshotWireDTO {
  const common = {
    creatorVersion: snapshot.creatorVersion,
    profile: snapshot.profile ? { ...snapshot.profile, programs: [...snapshot.profile.programs], socials: { ...snapshot.profile.socials }, ...(snapshot.profile.photo ? { photo: { ...snapshot.profile.photo } } : {}) } : null,
    placements: Object.fromEntries(Object.entries(snapshot.placements).map(([id, placement]) => [id, { ...placement }])),
    order: { featured: [...snapshot.order.featured], ordinary: [...snapshot.order.ordinary] },
    series: Object.fromEntries(Object.entries(snapshot.series).map(([id, series]) => [id, { ...series, chapters: [...series.chapters] }])),
    claims: snapshot.claims.map(copyClaim),
  };
  if (snapshot.schemaVersion === 3) {
    return {
      schemaVersion: 3,
      ...common,
      resources: snapshot.resources.map((resource) => ({
        ...resource,
        classification: resource.classification.state === 'explicit' || resource.classification.state === 'legacy'
          ? { ...resource.classification, topics: [...resource.classification.topics] }
          : { ...resource.classification },
      })),
    };
  }
  return { schemaVersion: 2, ...common, resources: snapshot.resources.map((resource) => ({ ...resource })) };
}

export function createCreatorOwnerState(input: {
  data: CreatorOwnerSnapshotDTO;
  accountEmail: string;
  csrfToken: string;
  sessionBinding: string;
  isAdmin: boolean;
  publicOrigin: string;
  seriesQuery: CreatorOwnerSeriesQuery;
  view: CreatorOwnerView;
  linksQuery?: CreatorOwnerLinksQuery;
  seriesQueryError?: string;
  linksQueryError?: string;
  initialActivityPeriod?: 7 | 30;
  initialCreate?: { displayName: string; slug: string };
  pendingSeriesSearch?: string;
  pendingChapterSearch?: string;
  pendingMembership?: CreatorOwnerSeriesMembership;
  pendingLinksQuery?: CreatorOwnerLinksQuery;
}): CreatorOwnerState {
  const observed = copyCreatorOwnerSnapshot(input.data);
  const profile = observed.profile;
  const seriesQuery = normalizeOwnerSeriesQuery(observed, input.seriesQuery);
  const linksQuery = input.linksQuery ?? DEFAULT_CREATOR_OWNER_LINKS_QUERY;
  return {
    observed,
    accountEmail: input.accountEmail,
    sessionBinding: input.sessionBinding,
    sessionEvidence: { latestBoundOperationId: 0, latestSessionCheckOperationId: 0 },
    isAdmin: input.isAdmin,
    publicOrigin: input.publicOrigin,
    ...(input.seriesQueryError ? { seriesQueryError: input.seriesQueryError } : {}),
    ...(profile === null ? { editor: { kind: 'create-profile', key: 'create-profile', draft: { displayName: '', slug: '', ...input.initialCreate } } as const } : {}),
    operation: { status: 'idle' },
    session: { state: 'ready', csrfToken: input.csrfToken },
    location: {
      view: input.view,
      query: seriesQuery,
      pendingSeriesSearch: input.pendingSeriesSearch ?? seriesQuery.buscarSeries,
      pendingChapterSearch: input.pendingChapterSearch ?? seriesQuery.buscarCapitulos,
      pendingMembership: input.pendingMembership ?? seriesQuery.pertenencia,
      linksQuery: normalizeOwnerLinksQuery(observed, linksQuery),
      pendingLinksQuery: normalizeOwnerLinksQuery(observed, input.pendingLinksQuery ?? linksQuery),
      ...(input.linksQueryError ? { linksQueryError: input.linksQueryError } : {}),
      prompt: 'none',
    },
    activity: { period: input.initialActivityPeriod ?? 7, sequence: 0, status: 'idle' },
    catalog: { status: 'idle', search: '', page: 1, needsRefresh: false, rejectedReferenceSelections: [] },
    runtimeReady: false,
  };
}

function cloneEditor(editor: CreatorOwnerEditorDraft): CreatorOwnerEditorDraft {
  switch (editor.kind) {
    case 'create-profile': return { ...editor, draft: { ...editor.draft } };
    case 'profile': return editor.section === 'datos'
      ? { ...editor, draft: { ...editor.draft, programs: [...editor.draft.programs] }, touchedFields: [...editor.touchedFields] }
      : { ...editor, draft: { ...editor.draft }, touchedFields: [...editor.touchedFields] };
    case 'photo': return { ...editor };
    case 'series': return { ...editor, draft: { ...editor.draft }, touchedFields: [...editor.touchedFields] };
    case 'move-chapter': return { ...editor };
    case 'link-placement': return { ...editor, draft: { ...editor.draft, topics: [...editor.draft.topics] }, touchedFields: [...editor.touchedFields] };
    case 'link-resource': return { ...editor, draft: { ...editor.draft, topics: [...editor.draft.topics] }, touchedFields: [...editor.touchedFields] };
    case 'add-link': return { ...editor, draft: { ...editor.draft, topics: [...editor.draft.topics] }, touchedFields: [...editor.touchedFields] };
    case 'move-link': return { ...editor };
    case 'reference': return { ...editor, ...(editor.selected ? { selected: { ...editor.selected } } : {}) };
    case 'claim': return { ...editor, selected: editor.selected.map((item) => ({ ...item })) };
  }
}

function operationMatches(state: CreatorOwnerState, intentId: string): CreatorOwnerIntent | undefined {
  const operation = state.operation;
  return operation.status !== 'idle' && 'intent' in operation && operation.intent?.id === intentId ? operation.intent : undefined;
}

export function creatorOwnerPreservesAcknowledgedRead(operation: CreatorOwnerOperation, transition?: CreatorOwnerTransition): boolean {
  return (!transition || transition.kind === 'history')
    && (operation.status === 'reading' || operation.status === 'refresh-failed')
    && operation.fact === 'acknowledged' && Boolean(operation.intent?.acknowledgement);
}

export function creatorOwnerChapterRecoveryIsVisibleInDetail(state: CreatorOwnerState): boolean {
  const operation = state.operation;
  const seriesId = state.location.query.serie;
  return (operation.status === 'reading' || operation.status === 'refresh-failed')
    && operation.fact === 'acknowledged'
    && (operation.intent?.action === 'add-chapter' || operation.intent?.action === 'remove-chapter')
    && state.location.view === 'series' && !state.seriesQueryError && seriesId !== undefined
    && operation.intent.target?.seriesId === seriesId && Boolean(state.observed.series[seriesId]);
}

export type CreatorOwnerRecoverySurface = 'none' | 'dialog' | 'identity' | 'series' | 'links' | 'claims' | 'owner';
export type CreatorOwnerRecoveryActionKind = 'none' | 'pending' | 'session-check' | 'retry' | 'compare' | 'resolve';
export interface CreatorOwnerRecoveryAction {
  kind: CreatorOwnerRecoveryActionKind;
  surface: CreatorOwnerRecoverySurface;
  operation: CreatorOwnerOperation;
}

/**
 * Derive the one recovery action and active interaction surface for the owner UI.
 * Renderers may choose their copy and layout, but must not independently decide
 * whether this operation is pending, retryable, comparable, or resolvable.
 */
export function deriveCreatorOwnerRecoveryAction(state: CreatorOwnerState): CreatorOwnerRecoveryAction {
  const operation = state.operation;
  if (operation.status === 'idle' || operation.status === 'sending') return { kind: 'none', surface: 'none', operation };
  const intent = 'intent' in operation ? operation.intent : undefined;
  let surface: CreatorOwnerRecoverySurface;
  if (state.editor?.kind === 'create-profile') surface = 'identity';
  else if (state.editor) surface = 'dialog';
  else if (state.location.prompt === 'exit') surface = 'dialog';
  else if (intent?.action === 'publish-profile'
    || intent?.action === 'save-profile' && !state.observed.profile) surface = 'identity';
  else if (operation.status === 'reading' && operation.fact === 'claims' || state.location.view === 'solicitudes') surface = 'claims';
  else if (state.location.view === 'series') surface = 'series';
  else if (state.location.view === 'enlaces') surface = 'links';
  else surface = 'owner';
  if (state.session.state === 'recovery-required' || state.session.state === 'checking') return { kind: 'session-check', surface, operation };
  if (operation.status === 'reading') return { kind: 'pending', surface, operation };
  if (operation.status === 'refresh-failed') return { kind: 'retry', surface, operation };
  if ((operation.status === 'unknown' || operation.status === 'conflict') && operation.readCompleted) return { kind: 'resolve', surface, operation };
  if (operation.status === 'unknown' || operation.status === 'conflict') return { kind: 'compare', surface, operation };
  return { kind: 'none', surface, operation };
}

const ownerRecoveryRetryFocus = '[data-owner-refresh-retry]';
const ownerRecoveryCompareFocus = '[data-owner-check], [data-owner-compare]';
const ownerRecoveryPublishCompareFocus = '[data-owner-publish-check]';
const ownerRecoveryDecisionFocus = '[data-owner-conflict-save], [data-owner-use-saved], [data-owner-return-to-draft]';
const ownerEditorDraftFocus = '[data-owner-dialog] form[data-owner-form]:not([hidden]) input:not([type="hidden"]), [data-owner-dialog] form[data-owner-form]:not([hidden]) textarea, [data-owner-dialog] form[data-owner-form]:not([hidden]) select, [data-owner-dialog] form[data-owner-form]:not([hidden]) button[type="submit"]:enabled';
const ownerContentErrorFocus = '[data-owner-dialog] [data-owner-content-error-focus]';

export function creatorOwnerEditorDraftFocus(editor: CreatorOwnerEditorDraft): string {
  return editor.kind === 'create-profile' ? '#owner-create-name' : ownerEditorDraftFocus;
}

/**
 * Derive the actionable control for a pending owner recovery. This remains
 * independent of the session shell: while the session is blocked the shell
 * owns focus, and the same selector becomes usable after renewal.
 */
export function deriveCreatorOwnerRecoveryFocus(state: CreatorOwnerState): string | undefined {
  const action = deriveCreatorOwnerRecoveryAction(state);
  const operation = action.operation;
  if (operation.status === 'refresh-failed' && operation.readContractObsolete) return undefined;
  const pendingAction = 'intent' in operation ? operation.intent?.action : undefined;
  if (action.kind === 'retry' || action.kind === 'session-check' && operation.status === 'refresh-failed') return ownerRecoveryRetryFocus;
  if (action.kind === 'compare' || action.kind === 'session-check' && operation.status === 'unknown' && !operation.readCompleted) {
    return pendingAction === 'publish-profile' ? ownerRecoveryPublishCompareFocus : ownerRecoveryCompareFocus;
  }
  if (action.kind === 'resolve' || action.kind === 'session-check'
    && (operation.status === 'unknown' || operation.status === 'conflict') && operation.readCompleted) return ownerRecoveryDecisionFocus;
  return undefined;
}

export function creatorOwnerWriteRejectedFocus(state: CreatorOwnerState, intent: CreatorOwnerIntent): string {
  if (state.editor && intent.editorKey && state.editor.key === intent.editorKey) {
    const feedback = state.editorFeedback?.editorKey === state.editor.key ? state.editorFeedback.fieldErrors : undefined;
    if (feedback) {
      if (state.editor.kind === 'create-profile') return feedback.displayName ? '#owner-create-name' : '#owner-create-slug';
      if (state.editor.kind === 'profile' && state.editor.section === 'datos') {
        const selectors: Record<CreatorOwnerProfileField, string> = {
          displayName: '#owner-display-name', slug: '#owner-slug', city: '#owner-city', country: '#owner-country',
          programs: '#owner-program-user-group-leaders', bio: '#owner-bio',
        };
        const field = (Object.keys(selectors) as CreatorOwnerProfileField[]).find((key) => feedback[key]);
        if (field) return selectors[field];
      }
      if (state.editor.kind === 'profile' && state.editor.section === 'redes') {
        const key = CREATOR_SOCIALS.find((social: CreatorSocial) => feedback[`socials.${social}`]);
        if (key) return `#owner-social-${key}`;
      }
      if (feedback['kind-format']) return '#owner-add-link-kind, #owner-link-kind';
      if (feedback.topics) return '[data-owner-topics-group] [data-resource-topic-options] > label:last-child input[data-resource-topic]:not(:disabled)';
      if (state.editor.kind !== 'profile' && state.editor.kind !== 'photo') return ownerContentErrorFocus;
    }
    return creatorOwnerEditorDraftFocus(state.editor);
  }
  if (intent.action === 'publish-profile') return '[data-owner-publish]';
  if (intent.action === 'save-profile' && !state.observed.profile) return '#owner-create-name';
  if (isCreatorOwnerListAction(intent.action)) return '[data-owner-list-action-error]';
  if (state.location.view === 'series') return '#owner-series-title';
  if (state.location.view === 'enlaces') return '#owner-links-title';
  if (state.location.view === 'solicitudes') return '#owner-claims-title';
  return '#owner-profile-name';
}

function normalizeAfterRead(state: CreatorOwnerState, snapshot: CreatorOwnerSnapshotDTO) {
  const query = normalizeOwnerSeriesQuery(snapshot, state.location.query);
  const linksQuery = normalizeOwnerLinksQuery(snapshot, state.location.linksQuery);
  const pendingLinksQuery = normalizeOwnerLinksQuery(snapshot, state.location.pendingLinksQuery);
  return {
    query,
    linksQuery,
    pendingLinksQuery,
  };
}

export function creatorOwnerDraftIsDirty(editor: CreatorOwnerEditorDraft | undefined, snapshot: CreatorOwnerSnapshotDTO): boolean {
  if (!editor) return false;
  const profile = snapshot.profile;
  switch (editor.kind) {
    case 'create-profile': return Boolean(editor.draft.displayName || editor.draft.slug);
    case 'profile': {
      if (!profile) return true;
      if (editor.section === 'redes') return CREATOR_SOCIALS
        .some((key) => editor.draft[key] !== (profile.socials[key] ?? ''));
      return editor.draft.displayName !== profile.displayName || editor.draft.slug !== profile.slug
        || editor.draft.city !== (profile.city ?? '') || editor.draft.country !== (profile.country ?? '')
        || editor.draft.bio !== (profile.bio ?? '') || editor.draft.programs.join('\0') !== profile.programs.join('\0');
    }
    case 'photo': return Boolean(editor.file);
    case 'series': {
      const saved = editor.seriesId ? snapshot.series[editor.seriesId] : undefined;
      return editor.draft.name !== (saved?.name ?? '') || editor.draft.slug !== (saved?.slug ?? '')
        || editor.draft.description !== (saved?.description ?? '');
    }
    case 'move-chapter': {
      const order = snapshot.series[editor.seriesId]?.chapters ?? [];
      return editor.targetPosition !== String(order.indexOf(editor.placementId) + 1);
    }
    case 'link-placement': {
      const placement = snapshot.placements[editor.placementId];
      const resource = placement && snapshot.resources.find(({ id }) => id === placement.resourceId);
      if (!placement || !resource) return true;
      const featured = snapshot.order.featured.includes(editor.placementId);
      return editor.draft.title !== resource.title || editor.draft.url !== resource.url
        || editor.draft.description !== (resource.description ?? '') || editor.draft.featured !== featured
        || editor.draft.selectedForDirectory !== placement.selectedForDirectory
        || isCreatorOwnerV3Resource(resource) && (editor.draft.kind !== (resource.classification.state === 'explicit' || resource.classification.state === 'legacy' ? resource.classification.kind : '')
          || editor.draft.format !== (resource.classification.state === 'explicit' || resource.classification.state === 'legacy' ? resource.classification.format : '')
          || JSON.stringify(editor.draft.topics) !== JSON.stringify(resource.classification.state === 'explicit' || resource.classification.state === 'legacy' ? resource.classification.topics : []));
    }
    case 'link-resource': {
      const resource = snapshot.resources.find(({ id }) => id === editor.resourceId);
      return !resource || editor.draft.title !== resource.title || editor.draft.url !== resource.url
        || editor.draft.description !== (resource.description ?? '')
        || isCreatorOwnerV3Resource(resource) && (editor.draft.kind !== (resource.classification.state === 'explicit' || resource.classification.state === 'legacy' ? resource.classification.kind : '')
          || editor.draft.format !== (resource.classification.state === 'explicit' || resource.classification.state === 'legacy' ? resource.classification.format : '')
          || JSON.stringify(editor.draft.topics) !== JSON.stringify(resource.classification.state === 'explicit' || resource.classification.state === 'legacy' ? resource.classification.topics : []));
    }
    case 'add-link': return Boolean(editor.draft.title || editor.draft.url || editor.draft.description
      || editor.draft.featured || !editor.draft.selectedForDirectory || editor.draft.kind || editor.draft.format || editor.draft.topics.length);
    case 'move-link': {
      const current = creatorOwnerLinkMoveContext(snapshot, editor.placementId);
      return !current || editor.targetPosition !== String(current.position);
    }
    case 'reference': return Boolean(editor.selected) || !editor.selectedForDirectory;
    case 'claim': return editor.selected.length > 0 || Boolean(editor.knownUrls.trim() || editor.evidence.trim());
  }
}

function cancelAuthorizedSaveTransition(location: CreatorOwnerLocation): CreatorOwnerLocation {
  if (location.transitionAuthorization !== 'save') return location;
  return { ...location, exitRequest: undefined, transition: undefined, transitionAuthorization: undefined, prompt: 'none' };
}

export function creatorOwnerLinkMoveContext(snapshot: CreatorOwnerSnapshotDTO, placementId: string): {
  group: 'featured' | 'ordinary';
  position: number;
  count: number;
} | undefined {
  const group = snapshot.order.featured.includes(placementId) ? 'featured' : 'ordinary';
  const order = snapshot.order[group];
  const index = order.indexOf(placementId);
  return index < 0 ? undefined : { group, position: index + 1, count: order.length };
}

type MoveEditor = Extract<CreatorOwnerEditorDraft, { kind: 'move-chapter' | 'move-link' }>;

function creatorOwnerMovePositionLimit(editor: MoveEditor, snapshot: CreatorOwnerSnapshotDTO): number {
  if (editor.kind === 'move-link') return creatorOwnerLinkMoveContext(snapshot, editor.placementId)?.count ?? 0;
  const chapters = snapshot.series[editor.seriesId]?.chapters;
  return chapters?.includes(editor.placementId) ? chapters.length : 0;
}

export function creatorOwnerMovePositionMessage(editor: MoveEditor, snapshot: CreatorOwnerSnapshotDTO): string {
  const maximum = creatorOwnerMovePositionLimit(editor, snapshot);
  return maximum ? `Ingresa una posición entera entre 1 y ${maximum}.` : 'Ingresa una posición entera mayor que cero.';
}

export function creatorOwnerMoveDestinationIsValid(editor: CreatorOwnerEditorDraft, snapshot: CreatorOwnerSnapshotDTO): boolean {
  if (editor.kind !== 'move-link' && editor.kind !== 'move-chapter') return true;
  const destination = Number(editor.targetPosition);
  return Number.isSafeInteger(destination) && destination >= 1 && destination <= creatorOwnerMovePositionLimit(editor, snapshot);
}

export function creatorOwnerCanSubmitEditor(state: CreatorOwnerState): boolean {
  const editor = state.editor;
  const snapshot = state.observed;
  if (!editor || state.operation.status !== 'idle' || state.session.state !== 'ready') return false;
  if (editor.kind === 'create-profile') return snapshot.profile === null;
  if (!snapshot.profile) return false;
  if (editor.kind === 'profile') return true;
  if (editor.kind === 'photo') return Boolean(editor.file) && editor.key === `photo:${snapshot.profile.id}`;
  if (editor.kind === 'series') return editor.seriesId === null || Boolean(snapshot.series[editor.seriesId]);
  if (editor.kind === 'move-chapter') return Boolean(snapshot.series[editor.seriesId]?.chapters.includes(editor.placementId));
  if (editor.kind === 'link-placement') {
    const placement = snapshot.placements[editor.placementId];
    if (!placement) return false;
    const resource = snapshot.resources.find(({ id }) => id === placement.resourceId);
    return Boolean(resource && (!editor.editable || resource.metadataEditable));
  }
  if (editor.kind === 'link-resource') return snapshot.resources.some(({ id, reincludeAllowed }) => id === editor.resourceId && reincludeAllowed);
  if (editor.kind === 'add-link') return true;
  if (editor.kind === 'move-link') return [...snapshot.order.featured, ...snapshot.order.ordinary].includes(editor.placementId);
  if (editor.kind === 'reference') return creatorOwnerReferenceSubmissionStatus(state, editor.selected) === 'ready';
  if (editor.kind === 'claim') return creatorOwnerClaimSelectionIsCurrent(state, editor.selected);
  return false;
}

export function creatorOwnerReferenceSubmissionStatus(state: CreatorOwnerState, selected?: CreatorOwnerReferenceCandidate): 'ready' | 'needs-selection' | 'refresh' | 'rejected' {
  if (!selected) return 'needs-selection';
  if (state.catalog.rejectedReferenceSelections.some(({ id, url }) => id === selected.id && url === selected.url)) return 'rejected';
  if (state.catalog.status !== 'ready' || state.catalog.needsRefresh) return 'refresh';
  return state.catalog.entries?.some(({ id, url }) => id === selected.id && url === selected.url) ? 'ready' : 'refresh';
}

export function creatorOwnerClaimSelectionIsCurrent(state: CreatorOwnerState, selection: readonly CreatorOwnerClaimSelection[]): boolean {
  if (creatorOwnerClaimSelectionNeedsRefresh(state, selection)) return false;
  return selection.every((item) => {
    const catalogMatch = state.catalog.entries?.find(({ id }) => id === item.resourceId);
    if (catalogMatch) return catalogMatch.url === item.url;
    return state.observed.resources.some(({ id, url, metadataEditable }) => id === item.resourceId && url === item.url && !metadataEditable);
  });
}

export function creatorOwnerClaimSelectionNeedsRefresh(state: CreatorOwnerState, selection: readonly CreatorOwnerClaimSelection[]): boolean {
  if (selection.length === 0) return false;
  const rejected = state.catalog.rejectedClaimSelection;
  return state.catalog.needsRefresh || Boolean(rejected?.some(({ resourceId, url }) =>
    selection.some((item) => item.resourceId === resourceId && item.url === url)));
}

function updateEditor(state: CreatorOwnerState, update: (editor: CreatorOwnerEditorDraft) => CreatorOwnerEditorDraft,
  fields?: readonly string[]): CreatorOwnerState {
  if (!state.editor || state.operation.status !== 'idle') return state;
  const editor = update(state.editor);
  if (editor === state.editor) return state;
  const next = { ...state, editor };
  return fields ? clearEditorFeedback(next, fields) : next;
}

function clearEditorFeedback(state: CreatorOwnerState, fields?: readonly string[]): CreatorOwnerState {
  const feedback = state.editorFeedback;
  if (!feedback) return state;
  const withoutFeedback = (value: CreatorOwnerState): CreatorOwnerState => {
    const next = { ...value };
    delete next.editorFeedback;
    return next;
  };
  if (!fields || feedback.editorKey !== state.editor?.key) {
    return withoutFeedback(state);
  }
  if (!feedback.fieldErrors) {
    return withoutFeedback(state);
  }
  const remaining = Object.fromEntries(Object.entries(feedback.fieldErrors)
    .filter(([field]) => !fields.includes(field)));
  if (Object.keys(remaining).length === 0) return withoutFeedback(state);
  return { ...state, editorFeedback: { ...feedback, fieldErrors: remaining } };
}

function editorFeedbackFields(fields: readonly string[]): string[] {
  return fields.some((field) => field === 'kind' || field === 'format') ? [...fields, 'kind-format'] : [...fields];
}

export function creatorOwnerReducer(state: CreatorOwnerState, action: CreatorOwnerAction): CreatorOwnerState {
  if (action.type === 'session-check-started' || action.type === 'session-evidence') {
    const result = reduceCreatorOwnerSessionPolicy(state, action);
    const nextState = { ...state, session: result.session, sessionEvidence: result.sessionEvidence };
    const recoveryFocus = action.type === 'session-evidence' && action.source === 'session-check'
      && action.outcome === 'renewed' && result.accepted && !state.location.focusAfterRender
      ? deriveCreatorOwnerRecoveryFocus(nextState) : undefined;
    return { ...nextState,
      ...(recoveryFocus ? { location: { ...state.location, focusAfterRender: recoveryFocus } } : {}),
      ...(result.clearFeedback ? { message: state.message?.sessionDerived ? undefined : state.message } : result.feedback ? { message: result.feedback } : {}),
      ...(result.attemptFeedback && state.operation.status === 'unknown' ? { operation: { ...state.operation, message: result.attemptFeedback.text } } : {}) };
  }

  switch (action.type) {
    case 'runtime-ready': return { ...state, runtimeReady: true };
    case 'open-editor': return state.operation.status === 'idle' && state.session.state === 'ready' && !state.editor
      ? clearEditorFeedback({ ...state, editor: cloneEditor(action.editor), message: undefined }) : state;
    case 'close-editor': return state.operation.status === 'idle' ? clearEditorFeedback({ ...state, editor: undefined, message: undefined }) : state;
    case 'update-profile-draft': {
      if (!state.editor && !state.observed.profile && state.operation.status === 'idle') {
        return clearEditorFeedback({ ...state, editor: { kind: 'create-profile', key: 'create-profile', draft: {
          displayName: action.value.displayName ?? '', slug: action.value.slug ?? '',
        } } });
      }
      const nextState = updateEditor(state, (editor) => editor.kind === 'create-profile'
        ? { ...editor, draft: { ...editor.draft, ...action.value } } : editor.kind === 'profile' && editor.section === 'datos'
          ? { ...editor, draft: { ...editor.draft, ...action.value }, touchedFields: [...new Set([...editor.touchedFields, ...Object.keys(action.value) as CreatorOwnerProfileField[]])] } : editor);
      return clearEditorFeedback(nextState, Object.keys(action.value));
    }
    case 'update-socials-draft': {
      const fields = Object.keys(action.value) as CreatorSocial[];
      const nextState = updateEditor(state, (editor) => editor.kind === 'profile' && editor.section === 'redes'
        ? { ...editor, draft: { ...editor.draft, ...action.value }, touchedFields: [...new Set([...editor.touchedFields, ...fields])] } : editor);
      return nextState === state ? state : clearEditorFeedback(nextState, fields.map((key) => `socials.${key}`));
    }
    case 'update-series-draft': return updateEditor(state, (editor) => editor.kind === 'series'
      ? { ...editor, draft: { ...editor.draft, ...action.value },
        touchedFields: [...new Set([...editor.touchedFields, ...Object.keys(action.value) as CreatorOwnerSeriesField[]])],
        slugManuallyEdited: action.manuallyEditedSlug ?? editor.slugManuallyEdited } : editor, Object.keys(action.value));
    case 'update-move-draft': return updateEditor(state, (editor) => editor.kind === 'move-chapter' ? { ...editor, targetPosition: action.targetPosition } : editor, ['position']);
    case 'update-link-draft': return updateEditor(state, (editor) => editor.kind === 'link-placement'
      ? { ...editor, draft: { ...editor.draft, ...action.value }, touchedFields: [...new Set([...editor.touchedFields, ...Object.keys(action.value) as CreatorOwnerPlacementField[]])] }
      : editor.kind === 'link-resource' ? { ...editor, draft: { ...editor.draft, ...action.value },
        touchedFields: [...new Set([...editor.touchedFields, ...Object.keys(action.value).filter((field): field is CreatorOwnerResourceField => ['title', 'url', 'description', 'kind', 'format', 'topics'].includes(field))])] } : editor, editorFeedbackFields(Object.keys(action.value)));
    case 'update-add-link-draft': return updateEditor(state, (editor) => editor.kind === 'add-link'
      ? { ...editor, draft: { ...editor.draft, ...action.value },
        touchedFields: [...new Set([...editor.touchedFields, ...Object.keys(action.value) as CreatorOwnerAddLinkField[]])] } : editor, editorFeedbackFields(Object.keys(action.value)));
    case 'update-move-link-draft': return updateEditor(state, (editor) => editor.kind === 'move-link' ? { ...editor, targetPosition: action.targetPosition } : editor, ['position']);
    case 'update-reference-draft': return updateEditor(state, (editor) => editor.kind === 'reference'
      ? { ...editor, ...(Object.hasOwn(action, 'selected') ? { selected: action.selected } : {}),
        ...(action.selectedForDirectory !== undefined ? { selectedForDirectory: action.selectedForDirectory } : {}) } : editor,
      Object.hasOwn(action, 'selected') ? ['selection'] : []);
    case 'update-claim-draft': {
      const fields = Object.keys(action.value);
      if (action.value.selected || action.value.knownUrls !== undefined) fields.push('destinations');
      if (action.value.selected) fields.push('selection');
      return updateEditor(state, (editor) => editor.kind === 'claim'
        ? { ...editor, ...(action.value.selected ? { selected: action.value.selected.map((item) => ({ ...item })) } : {}),
          ...(action.value.knownUrls !== undefined ? { knownUrls: action.value.knownUrls } : {}), ...(action.value.evidence !== undefined ? { evidence: action.value.evidence } : {}) } : editor, fields);
    }
    case 'update-photo-file': {
      const nextState = updateEditor(state, (editor) => editor.kind === 'photo' ? { ...editor, file: action.file } : editor);
      return nextState === state ? state : clearEditorFeedback(nextState, ['photo']);
    }
    case 'editor-field-rejected':
      return state.editor?.key === action.editorKey && state.operation.status === 'idle'
        ? { ...state, editorFeedback: { editorKey: action.editorKey, fieldErrors: { [action.field]: action.message } },
          message: undefined, location: { ...state.location, focusAfterRender: ownerContentErrorFocus } }
        : state;
    case 'catalog-load-started': return { ...state, catalog: { ...state.catalog, status: 'loading', message: undefined } };
    case 'catalog-load-ready': {
      const rejected = state.catalog.rejectedClaimSelection;
      // A claim rejection can involve several selected records. Until the
      // refreshed index shows which ones changed, keep those pairs from replay.
      const showsChangedSelection = rejected?.some(({ resourceId, url }) => {
        const current = action.entries.find(({ id }) => id === resourceId);
        return current ? current.url !== url : state.catalog.entries?.some(({ id }) => id === resourceId);
      });
      return { ...state, catalog: { ...state.catalog, status: 'ready', entries: action.entries.map((entry) => ({ ...entry })), message: action.message,
        needsRefresh: false, rejectedClaimSelection: showsChangedSelection ? undefined : rejected,
        rejectedReferenceSelections: state.catalog.rejectedReferenceSelections.filter(({ id, url }) => action.entries.some((entry) => entry.id === id && entry.url === url)) } };
    }
    case 'catalog-load-failed': return { ...state, catalog: { ...state.catalog, status: 'error', message: action.message } };
    case 'catalog-search': return { ...state, catalog: { ...state.catalog, search: action.value, page: 1 } };
    case 'catalog-page': return { ...state, catalog: { ...state.catalog, page: Math.max(1, action.value) } };
    case 'catalog-require-refresh': return { ...state, catalog: { ...state.catalog, needsRefresh: true, message: action.message,
      rejectedReferenceSelections: action.rejectedSelection ? [...state.catalog.rejectedReferenceSelections, action.rejectedSelection] : state.catalog.rejectedReferenceSelections,
      ...(action.rejectedClaimSelection ? { rejectedClaimSelection: action.rejectedClaimSelection } : {}) } };
    case 'operation-started': return (state.operation.status === 'idle'
      || state.operation.status === 'sending' && state.operation.intent.id === action.intent.id
      || state.operation.status === 'conflict' && state.operation.readCompleted && state.operation.intent.editorKey === action.intent.editorKey)
      && state.session.state === 'ready'
      ? { ...clearEditorFeedback({ ...state, operation: { status: 'sending', intent: action.intent }, message: undefined }),
        ...(action.preserveExit ? {} : state.location.prompt === 'exit' || state.location.transitionAuthorization === 'save'
          ? { location: { ...state.location, exitRequest: undefined, transition: undefined, transitionAuthorization: undefined, prompt: 'none' as const } } : {}) } : state;
    case 'operation-reading': return { ...state, operation: { status: 'reading', ...(action.intent ? { intent: action.intent } : {}), fact: action.fact, message: action.message },
      location: action.fact === 'unknown' || action.fact === 'conflict' ? cancelAuthorizedSaveTransition(state.location) : state.location };
    case 'operation-read-failed': {
      const operation: CreatorOwnerOperation = { status: 'refresh-failed', ...(action.intent ? { intent: action.intent } : {}), fact: action.fact, message: action.message,
        ...(action.readContractObsolete ? { readContractObsolete: true as const } : {}) };
      const location = { ...cancelAuthorizedSaveTransition(state.location), focusAfterRender: action.focusAfterRender };
      const recoveryFocus = action.focusAfterRender ?? deriveCreatorOwnerRecoveryFocus({ ...state, operation, location });
      const editorMatches = Boolean(action.intent?.editorKey && state.editor?.key === action.intent.editorKey);
      return { ...state, operation, location: recoveryFocus ? { ...location, focusAfterRender: recoveryFocus } : location,
      ...(action.suppressGlobalMessage || editorMatches ? { message: undefined } : { message: { text: action.message, kind: 'error' as const } }) };
    }
    case 'operation-read-installed': {
      const snapshot = copyCreatorOwnerSnapshot(action.snapshot);
      const navigation = normalizeAfterRead(state, snapshot);
      let operation: CreatorOwnerOperation;
      if (action.fact === 'conflict') operation = action.intent ? { status: 'conflict', intent: action.intent, message: action.message, readCompleted: true } : { status: 'idle' };
      else if (action.fact === 'unknown') operation = action.intent ? { status: 'unknown', intent: action.intent, message: action.message, readCompleted: true } : { status: 'idle' };
      else operation = { status: 'idle' };
      const publicationRecovery = action.intent?.action === 'publish-profile'
        && (action.fact === 'unknown' || action.fact === 'conflict');
      const recoveryFocus = action.focusAfterRender ?? deriveCreatorOwnerRecoveryFocus({ ...state, operation });
      return clearEditorFeedback({ ...state, observed: snapshot, operation,
        ...(action.fact === 'claims' || action.fact === 'acknowledged' && !state.seriesQueryError ? { seriesQueryError: undefined } : {}),
        ...(action.consumeEditor ? { editor: undefined } : {}),
        location: { ...state.location, focusAfterRender: recoveryFocus, ...navigation,
          ...(action.fact === 'acknowledged' && state.location.transitionAuthorization === 'save'
            && (!action.consumeEditor || !state.location.transition)
            ? { transition: undefined, transitionAuthorization: undefined } : {}),
          ...(action.fact === 'acknowledged' || action.fact === 'claims' ? { linksQueryError: undefined } : {}) },
        ...(publicationRecovery ? { message: undefined } : action.message ? { message: { text: action.message, kind: action.fact === 'acknowledged' || action.fact === 'claims' ? 'success' : 'info' } } : { message: undefined }) });
    }
    case 'operation-unknown': {
      const operation: CreatorOwnerOperation = { status: 'unknown', intent: action.intent, message: action.message };
      const location = cancelAuthorizedSaveTransition(state.location);
      const recoveryFocus = deriveCreatorOwnerRecoveryFocus({ ...state, operation, location });
      const editorMatches = Boolean(action.intent.editorKey && state.editor?.key === action.intent.editorKey);
      return { ...state, operation, location: recoveryFocus ? { ...location, focusAfterRender: recoveryFocus } : location,
        ...(action.intent.action === 'publish-profile' || editorMatches ? { message: undefined } : { message: { text: action.message, kind: 'error' as const } }) };
    }
    case 'operation-rejected': {
      const intent = operationMatches(state, action.intentId);
      const location = cancelAuthorizedSaveTransition(state.location);
      if (!intent) return state;
      const editorMatches = Boolean(intent.editorKey && state.editor?.key === intent.editorKey);
      const fieldErrors = action.fieldErrors && Object.keys(action.fieldErrors).length > 0 ? action.fieldErrors : undefined;
      const sessionFeedback = editorMatches && state.session.state !== 'ready' && state.message?.sessionDerived === true;
      const nextState = { ...state, operation: { status: 'idle' as const }, location,
        ...(editorMatches && !sessionFeedback ? { editorFeedback: fieldErrors ? { editorKey: intent.editorKey!, fieldErrors } : { editorKey: intent.editorKey!, text: action.message } } : {}),
        message: editorMatches ? undefined : {
          text: action.message,
          kind: 'error' as const,
          ...(intent.action === 'publish-profile' ? { scope: 'publish-profile' as const } : {}),
          ...(isCreatorOwnerListAction(intent.action) ? { scope: 'list-action' as const, intent } : {}),
        } };
      const recoveryFocus = creatorOwnerWriteRejectedFocus(nextState, intent);
      return recoveryFocus ? { ...nextState, location: { ...nextState.location, focusAfterRender: recoveryFocus } } : nextState;
    }
    case 'resolve-operation': {
      if ((state.operation.status !== 'unknown' && state.operation.status !== 'conflict') || !state.operation.readCompleted) return state;
      const publicationAdopted = action.choice === 'saved' && state.operation.intent.action === 'publish-profile';
      const editorRecoveryFocus = action.choice === 'saved'
        ? state.location.view === 'series'
          ? state.location.query.serie ? '#owner-chapter-search' : '#owner-series-search'
          : state.location.view === 'enlaces' ? '#owner-link-search'
            : state.location.view === 'solicitudes' ? '[data-claim-section-open]'
              : '#owner-activity-title'
        : undefined;
      const editor = action.choice === 'draft' ? state.editor : undefined;
      const positionError = editor && (editor.kind === 'move-link' || editor.kind === 'move-chapter')
        && !creatorOwnerMoveDestinationIsValid(editor, state.observed) ? creatorOwnerMovePositionMessage(editor, state.observed) : undefined;
      const draftFocus = editor ? positionError ? ownerContentErrorFocus : creatorOwnerEditorDraftFocus(editor) : undefined;
      return { ...state, operation: { status: 'idle' }, ...(action.choice === 'saved' ? { editor: undefined } : {}),
        ...(positionError && editor ? { editorFeedback: { editorKey: editor.key, fieldErrors: { position: positionError } } } : {}),
        location: { ...state.location, focusAfterRender: publicationAdopted ? '#owner-profile-name' : editorRecoveryFocus ?? draftFocus ?? state.location.focusAfterRender },
        message: { text: action.choice === 'saved' ? 'Usaste el estado guardado. No repetimos la acción anterior.' : 'Conservamos el borrador. Guardarlo ahora será una acción nueva.', kind: 'info' } };
    }
    case 'set-message': return { ...state, message: { text: action.text, kind: action.kind ?? 'info' } };
    case 'set-series-search': return { ...state, location: { ...state.location, pendingSeriesSearch: action.value } };
    case 'set-chapter-search': return { ...state, location: { ...state.location, pendingChapterSearch: action.value } };
    case 'set-pending-membership': return { ...state, location: { ...state.location, pendingMembership: action.value } };
    case 'apply-query': return { ...state, seriesQueryError: undefined, location: { ...state.location, query: action.query,
      pendingSeriesSearch: action.preservePending ? state.location.pendingSeriesSearch : action.query.buscarSeries,
      pendingChapterSearch: action.preservePending ? state.location.pendingChapterSearch : action.query.buscarCapitulos,
      pendingMembership: action.preservePending ? state.location.pendingMembership : action.query.pertenencia,
      focusAfterRender: action.focusSelector } };
    case 'set-links-pending-query': return { ...state, location: { ...state.location, pendingLinksQuery: { ...state.location.pendingLinksQuery, ...action.query } } };
    case 'apply-links-query': return { ...state, location: { ...state.location, linksQuery: action.query,
      pendingLinksQuery: action.preservePending ? state.location.pendingLinksQuery : action.query,
      linksQueryError: undefined, focusAfterRender: action.focusSelector } };
    case 'set-series-query-error': return { ...state, seriesQueryError: 'series' };
    case 'set-links-query-error': return { ...state, location: { ...state.location, linksQueryError: 'links' } };
    case 'clear-focus': return state.location.focusAfterRender === action.selector ? { ...state, location: { ...state.location, focusAfterRender: undefined } } : state;
    case 'request-exit': return { ...state, location: { ...state.location, exitRequest: action.transition, transition: undefined, transitionAuthorization: undefined, prompt: 'exit' } };
    case 'clear-transition': return { ...state, location: { ...state.location, exitRequest: undefined, transition: undefined, transitionAuthorization: undefined, prompt: 'none' } };
    case 'resolve-transition': {
      if (action.action === 'authorize') {
        const transition = state.location.exitRequest;
        if (!transition && !(state.editor && state.location.prompt === 'exit')) return state;
        return { ...state, location: { ...state.location, transition, transitionAuthorization: 'save', exitRequest: undefined, prompt: 'none' } };
      }
      if (action.action === 'cancel-authorize') return state.location.transitionAuthorization === 'save'
        ? { ...state, location: { ...state.location, transition: undefined, transitionAuthorization: undefined, prompt: 'none' } } : state;
      if (action.action === 'continue') return { ...state, location: { ...state.location,
        transition: undefined, exitRequest: undefined, transitionAuthorization: undefined, prompt: 'none',
        ...(state.editor ? { focusAfterRender: creatorOwnerEditorDraftFocus(state.editor) } : {}) } };
      const operation = state.operation;
      const keepsConfirmedRead = creatorOwnerPreservesAcknowledgedRead(operation, state.location.exitRequest);
      return clearEditorFeedback({ ...state, editor: undefined, operation: keepsConfirmedRead ? operation : { status: 'idle' }, location: { ...state.location,
        transition: state.location.exitRequest, transitionAuthorization: state.location.exitRequest ? 'discard' : undefined, exitRequest: undefined, prompt: 'none' } });
    }
    case 'set-prompt': return { ...state, location: { ...state.location, prompt: action.prompt } };
    case 'activity-loading': return action.sequence > state.activity.sequence ? { ...state, activity: { ...state.activity, period: action.period, sequence: action.sequence, status: 'loading', message: undefined } } : state;
    case 'set-activity-period': return { ...state, activity: { period: action.period, sequence: state.activity.sequence, status: 'idle' } };
    case 'activity-retry': return { ...state, activity: { ...state.activity, sequence: state.activity.sequence + 1, status: 'idle' } };
    case 'activity-ready': return state.activity.sequence === action.sequence && state.activity.period === action.period ? { ...state, activity: { ...state.activity, status: 'ready', report: action.report, message: undefined } } : state;
    case 'activity-failed': return state.activity.sequence === action.sequence && state.activity.period === action.period ? { ...state, activity: { ...state.activity, status: 'error', message: action.message } } : state;
  }
}

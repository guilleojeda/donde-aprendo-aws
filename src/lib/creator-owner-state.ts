import type {
  CreatorEditorDTO,
  CreatorCatalogSelectionDTO,
  CreatorClaimDTO,
  CreatorEditableResourceDTO,
  CreatorLinkDTO,
  CreatorProfileDTO,
  CreatorSeriesDTO,
} from '../types/creators';
import type { CreatorOwnerSeriesMembership, CreatorOwnerSeriesQuery } from './creator-owner-series';
import { creatorOwnerChapterOrder } from './creator-owner-series';
import { creatorOwnerLinkGroup, DEFAULT_CREATOR_OWNER_LINKS_QUERY, selectCreatorOwnerLinks } from './creator-owner-links';
import { normalizeOwnerLinksQuery, normalizeOwnerSeriesQuery } from './creator-owner-navigation';
import type { CreatorOwnerLinksQuery } from './creator-owner-links';

export type CreatorOwnerProfileDraft = {
  displayName: string;
  slug: string;
  city: string;
  country: string;
  programs: CreatorProfileDTO['programs'];
  bio: string;
};

export type CreatorOwnerSocialsDraft = Record<'instagram' | 'x' | 'linkedin' | 'awsBuilder' | 'website', string>;
export type CreatorOwnerSeriesDraft = { name: string; slug: string; description: string };
export type CreatorOwnerLinkDraft = {
  title: string;
  url: string;
  description: string;
  featured: boolean;
  selectedForDirectory: boolean;
};
export type CreatorOwnerClaimSelection = { resourceId: string; url: string; title: string };

export type CreatorOwnerEditor =
  | { kind: 'create-profile'; key: 'create-profile'; base: null; draft: Pick<CreatorOwnerProfileDraft, 'displayName' | 'slug'> }
  | { kind: 'profile'; key: string; section: 'datos'; base: CreatorProfileDTO; draft: CreatorOwnerProfileDraft }
  | { kind: 'profile'; key: string; section: 'redes'; base: CreatorProfileDTO; draft: CreatorOwnerSocialsDraft }
  | { kind: 'photo'; key: string; base: CreatorProfileDTO; file?: File; uploadId?: string; uploadedFile?: File }
  | { kind: 'series'; key: string; baseProfile: CreatorProfileDTO; baseSeries: CreatorSeriesDTO | null; draft: CreatorOwnerSeriesDraft; requestedSlug?: string; slugManuallyEdited: boolean }
  | {
    kind: 'move-chapter';
    key: string;
    seriesId: string;
    placementId: string;
    baseProfile: CreatorProfileDTO;
    baseSeries: CreatorSeriesDTO;
    basePlacement: CreatorLinkDTO;
    baseOrder: readonly string[];
    targetPosition: string;
    suggestionPosition?: number;
  };

export type CreatorOwnerLinkEditor =
  | { kind: 'link-placement'; key: string; baseProfile: CreatorProfileDTO; baseLink: CreatorLinkDTO; editable: boolean; draft: CreatorOwnerLinkDraft;
      optionsOnly?: true; pendingAddDraft?: CreatorOwnerLinkDraft; pendingDirectoryOptionDecision?: true }
  | { kind: 'link-resource'; key: string; baseResource: CreatorEditableResourceDTO; draft: Pick<CreatorOwnerLinkDraft, 'title' | 'url' | 'description'> }
  | { kind: 'add-link'; key: 'add-link'; baseProfile: CreatorProfileDTO; draft: CreatorOwnerLinkDraft }
  | { kind: 'move-link'; key: string; baseProfile: CreatorProfileDTO; baseLink: CreatorLinkDTO; baseOrder: readonly string[]; targetPosition: string; suggestionPosition?: number }
  | { kind: 'reference'; key: 'reference'; baseProfile: CreatorProfileDTO; selected?: CreatorCatalogSelectionDTO; selectedForDirectory: boolean }
  | { kind: 'claim'; key: 'claim'; baseProfile: CreatorProfileDTO; selected: CreatorOwnerClaimSelection[]; knownUrls: string; evidence: string };

export type CreatorOwnerView = 'enlaces' | 'series' | 'solicitudes' | 'estadisticas';

export type CreatorOwnerEditorDraft = Exclude<CreatorOwnerEditor | CreatorOwnerLinkEditor, { kind: 'photo' }>;

export type CreatorOwnerEffect =
  | { kind: 'profile-updated'; profile: CreatorProfileDTO }
  | { kind: 'series-updated'; profileId: string; profileVersion: number; series: CreatorSeriesDTO }
  | { kind: 'series-deleted'; profileId: string; profileVersion: number; seriesId: string }
  | {
    kind: 'chapters-updated';
    profileId: string;
    profileVersion: number;
    seriesId: string;
    changes: Array<{ placementId: string; membership: { seriesId: string; position: number } | null; placementVersion: number }>;
  }
  | {
    kind: 'chapter-moved';
    profileId: string;
    profileVersion: number;
    seriesId: string;
    changes: Array<{ placementId: string; position: number; placementVersion: number }>;
  }
  | { kind: 'link-updated'; profileId: string; profileVersion: number; link: CreatorLinkDTO; resource?: CreatorEditableResourceDTO }
  | { kind: 'link-moved'; profileId: string; profileVersion: number; changes: Array<{ placementId: string; position: number; placementVersion: number }> }
  | { kind: 'link-added'; profileId: string; profileVersion: number; link: CreatorLinkDTO; source: 'url' | 'reference' | 'reinclude'; created: boolean; resource?: CreatorEditableResourceDTO }
  | { kind: 'link-removed'; profileId: string; profileVersion: number; placementId: string }
  | { kind: 'resource-updated'; resource: CreatorEditableResourceDTO }
  | { kind: 'claim-submitted'; profileId: string; claim: CreatorClaimDTO }
  | { kind: 'photo-updated'; profileId: string; profileVersion: number; photo: NonNullable<CreatorProfileDTO['photo']> };

export interface CreatorOwnerWriteIntent {
  id: string;
  editorKey: string;
  kind: 'create-profile' | 'save-profile' | 'publish' | 'save-series' | 'delete-series'
    | 'chapter-add' | 'chapter-remove' | 'chapter-move' | 'photo'
    | 'save-link' | 'add-link' | 'move-link' | 'remove-link' | 'reinclude-resource' | 'reference' | 'claim';
  capture: CreatorOwnerEditor | CreatorOwnerLinkEditor | CreatorOwnerListContext;
  /** A delivered Add conflict proves that this attempt wrote no placement. */
  addDidNotCommit?: true;
}

export interface CreatorOwnerListContext {
  kind: 'list-command';
  key: string;
  operation: 'publish' | 'delete-series' | 'chapter-add' | 'chapter-remove' | 'remove-link' | 'reinclude-resource';
  baseProfile: CreatorProfileDTO;
  baseSeries?: CreatorSeriesDTO;
  basePlacement?: CreatorLinkDTO;
  baseResource?: CreatorEditableResourceDTO;
  seriesId?: string;
  placementId?: string;
}

export type CreatorOwnerAttempt =
  | { status: 'idle' }
  | { status: 'sending'; intent: CreatorOwnerWriteIntent }
  | { status: 'checking'; intent: CreatorOwnerWriteIntent; checkId: string }
  | {
    status: 'uncertain' | 'conflict';
    intent: CreatorOwnerWriteIntent;
    message: string;
    /** This message is superseded when a newer explicit session check completes. */
    sessionDerived?: true;
    code?: string;
    comparison?: CreatorOwnerComparison;
  }
  | { status: 'confirmed'; intentId: string };

export interface CreatorOwnerComparison {
  id: string;
  editorKey: string;
  snapshot: CreatorEditorDTO;
  draftAtCompare?: CreatorOwnerEditor | CreatorOwnerLinkEditor;
  seriesId?: string;
  recoveredLinkId?: string;
  savedAddPlacementId?: string;
  canAdopt: boolean;
  message: string;
}

export type CreatorOwnerSession =
  | { state: 'ready'; csrfToken: string }
  | { state: 'recovery-required'; reason: 'expired' | 'csrf' | 'different-principal' | 'disabled' | 'check-required'; message: string; csrfToken?: string }
  | { state: 'checking'; reason: 'expired' | 'csrf' | 'different-principal' | 'disabled' | 'check-required'; message: string; checkId: string; csrfToken?: string }
  | { state: 'blocked'; reason: 'disabled' | 'invalid-context'; message: string };

export type CreatorOwnerTransition = { href: string; kind: 'anchor' | 'form' | 'history' | 'logout'; historyIndex?: number };

export type CreatorOwnerLocation = {
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
  prompt: 'none' | 'exit' | 'delete-series';
  deleteSeriesId?: string;
  focusAfterRender?: string;
};

export interface CreatorOwnerState {
  observed: CreatorEditorDTO;
  accountEmail: string;
  sessionBinding: string;
  sessionEvidence: { latestBoundOperationId: number; latestSessionCheckOperationId: number };
  isAdmin: boolean;
  publicOrigin: string;
  seriesQueryError?: string;
  editor?: CreatorOwnerEditor | CreatorOwnerLinkEditor;
  attempt: CreatorOwnerAttempt;
  session: CreatorOwnerSession;
  location: CreatorOwnerLocation;
  activity: {
    period: 7 | 30;
    sequence: number;
    status: 'idle' | 'loading' | 'ready' | 'error';
    report?: import('./creator-statistics-types').CreatorStatisticsReady;
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
  };
  claimHistory: {
    status: 'idle' | 'loading' | 'error';
    sequence: number;
    message?: string;
    /** True only for feedback derived from a session/account classification. */
    sessionDerived?: boolean;
  };
  message?: { text: string; kind: 'info' | 'success' | 'error'; sessionDerived?: true };
  runtimeReady: boolean;
}

export type CreatorOwnerAction =
  | { type: 'runtime-ready' }
  | { type: 'open-editor'; editor: CreatorOwnerEditor | CreatorOwnerLinkEditor }
  | { type: 'close-editor' }
  | { type: 'update-profile-draft'; value: Partial<CreatorOwnerProfileDraft> }
  | { type: 'update-socials-draft'; value: Partial<CreatorOwnerSocialsDraft> }
  | { type: 'update-series-draft'; value: Partial<CreatorOwnerSeriesDraft>; manuallyEditedSlug?: boolean }
  | { type: 'update-move-draft'; targetPosition: string }
  | { type: 'update-link-draft'; value: Partial<CreatorOwnerLinkDraft> }
  | { type: 'update-add-link-draft'; value: Partial<CreatorOwnerLinkDraft> }
  | { type: 'resume-shared-add' }
  | { type: 'update-move-link-draft'; targetPosition: string }
  | { type: 'set-link-move-suggestion'; targetPosition?: number }
  | { type: 'update-reference-draft'; selected?: CreatorCatalogSelectionDTO; selectedForDirectory?: boolean }
  | { type: 'update-claim-draft'; value: { selected?: CreatorOwnerClaimSelection[]; knownUrls?: string; evidence?: string } }
  | { type: 'catalog-load-started' }
  | { type: 'catalog-load-ready'; entries: CreatorCatalogSelectionDTO[]; message?: string }
  | { type: 'catalog-load-failed'; message: string }
  | { type: 'catalog-search'; value: string }
  | { type: 'catalog-page'; value: number }
  | { type: 'catalog-require-refresh'; message: string }
  | { type: 'claim-history-started'; sequence: number }
  | { type: 'claim-history-ready'; sequence: number; claims: CreatorClaimDTO[]; message: string }
  | { type: 'claim-history-failed'; sequence: number; message: string; sessionDerived?: boolean }
  | { type: 'claim-history-session-cleared'; sequence: number }
  | { type: 'claim-attempt-checked'; intentId: string; checkId: string; message: string }
  | { type: 'set-move-suggestion'; targetPosition?: number }
  | { type: 'update-photo-file'; file?: File }
  | { type: 'photo-upload-started'; intentId: string; uploadId: string; file: File }
  | { type: 'clear-photo-upload'; intentId: string }
  | { type: 'photo-check-complete'; intentId: string; snapshot: CreatorEditorDTO; uploaded: boolean; uploadedFile?: File }
  | { type: 'begin-write'; intent: CreatorOwnerWriteIntent; exitTransition?: CreatorOwnerLocation['transition'] }
  | { type: 'write-uncertain'; intentId: string; status: 'uncertain' | 'conflict'; message: string; code?: string }
  | { type: 'write-rejected'; intentId: string; message: string }
  | { type: 'clear-attempt'; message: string }
  | { type: 'write-confirmed'; intentId: string; effect: CreatorOwnerEffect; correction: boolean }
  | { type: 'begin-check'; intentId: string; checkId: string }
  | { type: 'check-failed'; intentId: string; checkId: string; message: string; sessionDerived?: boolean }
  | { type: 'check-compared'; intentId: string; checkId: string; comparison: CreatorOwnerComparison }
  | { type: 'adopt-comparison'; comparisonId: string; addPlacementId?: string }
  | { type: 'session-check-started'; operationId: number; checkId: string }
  | { type: 'session-evidence'; operationId: number; source: 'history' | 'bound' | 'session-check'; checkId?: string;
      outcome: 'recoverable' | 'terminal' | 'read-confirmed' | 'write-confirmed' | 'renewed'; reason?: 'expired' | 'csrf' | 'different-principal' | 'disabled' | 'check-required' | 'invalid-context';
      message: string; csrfToken?: string }
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
  | { type: 'request-exit'; transition: NonNullable<CreatorOwnerLocation['transition']> }
  | { type: 'clear-transition' }
  | { type: 'resolve-transition'; action: 'discard' | 'continue' }
  | { type: 'set-prompt'; prompt: CreatorOwnerLocation['prompt']; seriesId?: string }
  | { type: 'activity-loading'; period: 7 | 30; sequence: number }
  | { type: 'set-activity-period'; period: 7 | 30 }
  | { type: 'activity-retry' }
  | { type: 'activity-ready'; period: 7 | 30; sequence: number; report: import('./creator-statistics-types').CreatorStatisticsReady }
  | { type: 'activity-failed'; period: 7 | 30; sequence: number; message: string }
  | { type: 'adopt-snapshot'; snapshot: CreatorEditorDTO };

export type CreatorOwnerSessionPolicyState = Pick<CreatorOwnerState, 'session' | 'sessionEvidence'>;
export type CreatorOwnerSessionPolicyAction = Extract<CreatorOwnerAction, { type: 'session-check-started' | 'session-evidence' }>;
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
  if (action.source === 'history' && (action.operationId <= state.sessionEvidence.latestBoundOperationId
    || action.operationId <= state.sessionEvidence.latestSessionCheckOperationId)) return { ...state, accepted: false };
  if (action.source === 'bound' && (action.operationId <= state.sessionEvidence.latestBoundOperationId
    || action.operationId <= state.sessionEvidence.latestSessionCheckOperationId)) return { ...state, accepted: false };
  if (action.source === 'session-check' && (action.operationId !== state.sessionEvidence.latestSessionCheckOperationId
    || state.sessionEvidence.latestBoundOperationId > action.operationId)) return { ...state, accepted: false };
  if (action.source === 'history' && action.outcome === 'recoverable') {
    if (current.state === 'blocked' || current.state === 'checking') return { ...state, accepted: false };
    const reason = action.reason;
    if (!reason || reason === 'invalid-context') return { ...state, accepted: false };
    const session: CreatorOwnerSession = { state: 'recovery-required', reason, message: action.message,
      ...(current.state === 'ready' ? { csrfToken: current.csrfToken } : current.csrfToken ? { csrfToken: current.csrfToken } : {}) };
    const feedback = { text: action.message, kind: 'error' as const, sessionDerived: true as const };
    return { ...state, session, feedback, accepted: true };
  }
  if (action.source === 'session-check' && (current.state !== 'checking' || current.checkId !== action.checkId)) return { ...state, accepted: false };
  if (current.state === 'blocked') return { ...state, accepted: false };
  const boundEvidence = action.source === 'bound'
    ? { ...state.sessionEvidence, latestBoundOperationId: action.operationId }
    : state.sessionEvidence;
  if (action.outcome === 'read-confirmed') {
    if (action.source !== 'bound') return { ...state, accepted: false };
    if (current.state !== 'ready') {
      const message = 'La lectura confirmó esta página. Comprueba la sesión para habilitar cambios.';
      return { ...state, sessionEvidence: boundEvidence, session: { state: 'recovery-required', reason: 'check-required', message,
        ...(current.csrfToken ? { csrfToken: current.csrfToken } : {}) },
        feedback: { text: message, kind: 'info', sessionDerived: true }, accepted: true };
    }
    return { ...state, sessionEvidence: boundEvidence, clearFeedback: true, accepted: true };
  }
  if (action.outcome === 'write-confirmed' || action.outcome === 'renewed') {
    if (action.source === 'session-check' && action.outcome !== 'renewed'
      || action.source === 'bound' && action.outcome !== 'write-confirmed'
      || action.source === 'history' || typeof action.csrfToken !== 'string') return { ...state, accepted: false };
    const wasRecovery = current.state !== 'ready';
    const feedback = wasRecovery ? { text: action.source === 'session-check'
      ? 'Sesión comprobada. Tus cambios siguen aquí; puedes decidir qué guardar.'
      : 'La respuesta ligada confirmó el acceso a esta página. Conservamos tus cambios.', kind: 'success' as const, sessionDerived: true as const } : undefined;
    return { ...state, sessionEvidence: boundEvidence, session: { state: 'ready', csrfToken: action.csrfToken },
      ...(feedback ? { feedback } : { clearFeedback: true as const }),
      ...(action.source === 'session-check' ? { attemptFeedback: {
        text: 'La sesión está comprobada. El resultado del intento sigue pendiente; comprueba lo guardado antes de decidir si volver a enviarlo.', kind: 'info' as const,
      } } : {}), accepted: true };
  }
  if (action.outcome === 'terminal') {
    if (!action.reason || (action.reason !== 'disabled' && action.reason !== 'invalid-context')) return { ...state, accepted: false };
    if (action.source === 'history' && action.reason !== 'invalid-context') return { ...state, accepted: false };
    return { ...state, sessionEvidence: boundEvidence, session: { state: 'blocked', reason: action.reason, message: action.message },
      feedback: { text: action.message, kind: 'error', sessionDerived: true },
      ...(action.source === 'session-check' ? { attemptFeedback: { text: action.message, kind: 'error' as const, sessionDerived: true as const } } : {}), accepted: true };
  }
  if (action.outcome === 'recoverable') {
    if (!action.reason || action.reason === 'invalid-context'
      || action.reason === 'disabled' && action.source === 'bound') return { ...state, accepted: false };
    return { ...state, sessionEvidence: boundEvidence, session: { state: 'recovery-required', reason: action.reason, message: action.message,
      ...(current.state === 'ready' ? { csrfToken: current.csrfToken } : current.csrfToken ? { csrfToken: current.csrfToken } : {}) },
      feedback: { text: action.message, kind: 'error', sessionDerived: true },
      ...(action.source === 'session-check' ? { attemptFeedback: { text: action.message, kind: 'error' as const, sessionDerived: true as const } } : {}), accepted: true };
  }
  return { ...state, accepted: false };
}

function copySnapshot(data: CreatorEditorDTO): CreatorEditorDTO {
  const profile = data.profile ? {
    ...data.profile,
    programs: [...data.profile.programs],
    socials: { ...data.profile.socials },
    ...(data.profile.photo ? { photo: { ...data.profile.photo } } : {}),
  } : null;
  return {
    profile,
    links: data.links.map((link) => ({ ...link, series: link.series.map((item) => ({ ...item })) })),
    editableResources: data.editableResources.map((resource) => ({ ...resource })),
    claims: data.claims.map((claim) => ({ ...claim, resourceIds: [...claim.resourceIds], ...(claim.resources ? { resources: claim.resources.map((item) => ({ ...item })) } : {}) })),
    series: data.series.map((item) => ({ ...item })),
  };
}

function copyClaim(claim: CreatorClaimDTO): CreatorClaimDTO {
  return { ...claim, resourceIds: [...claim.resourceIds], ...(claim.resources ? { resources: claim.resources.map((item) => ({ ...item })) } : {}) };
}

/** Claim rows version independently of the profile, so every owner observation uses this merge. */
function mergeClaimObservations(previous: readonly CreatorClaimDTO[], incoming: readonly CreatorClaimDTO[]): CreatorClaimDTO[] {
  const merged = previous.map(copyClaim);
  const indexes = new Map(merged.map((claim, index) => [claim.id, index]));
  for (const observed of incoming) {
    const index = indexes.get(observed.id);
    if (index === undefined) {
      indexes.set(observed.id, merged.length);
      merged.push(copyClaim(observed));
      continue;
    }
    const current = merged[index];
    if (observed.version !== undefined && (current.version === undefined || observed.version > current.version)) {
      merged[index] = copyClaim(observed);
    }
  }
  return merged;
}

function copySnapshotWithClaimMerge(previous: CreatorEditorDTO, data: CreatorEditorDTO): CreatorEditorDTO {
  const snapshot = copySnapshot(data);
  if (previous.profile && snapshot.profile?.id === previous.profile.id) {
    snapshot.claims = mergeClaimObservations(previous.claims, snapshot.claims);
  }
  return snapshot;
}

function completeListCheck(state: CreatorOwnerState, intentId: string, comparison: CreatorOwnerComparison): CreatorOwnerState {
  const snapshot = copySnapshotWithClaimMerge(state.observed, comparison.snapshot);
  const currentQuery = normalizeOwnerSeriesQuery(snapshot, state.location.query);
  const seriesStillExists = Boolean(currentQuery.serie);
  const currentLinksQuery = normalizeOwnerLinksQuery(snapshot, state.location.linksQuery);
  const pendingLinksQuery = normalizeOwnerLinksQuery(snapshot, state.location.pendingLinksQuery);
  const focusAfterRender = state.location.exitRequest && state.location.prompt === 'exit' ? '#owner-exit-continue'
    : state.location.view === 'enlaces'
      ? state.location.linksQueryError ? '#contenido' : '#owner-link-search'
      : state.location.view === 'series'
        ? state.seriesQueryError ? '#contenido' : seriesStillExists ? '#owner-chapter-search' : '#owner-series-title'
        : '#contenido';
  return {
    ...state,
    observed: snapshot,
    attempt: { status: 'confirmed', intentId },
    message: { text: 'La lista guardada está actualizada. Puedes continuar con otra acción.', kind: 'success' },
    location: { ...state.location,
      query: currentQuery,
      pendingChapterSearch: seriesStillExists ? state.location.pendingChapterSearch : '',
      pendingMembership: seriesStillExists ? state.location.pendingMembership : 'todos',
      linksQuery: currentLinksQuery, pendingLinksQuery,
      focusAfterRender },
  };
}

function cloneEditor(editor: CreatorOwnerEditor | CreatorOwnerLinkEditor): CreatorOwnerEditor | CreatorOwnerLinkEditor {
  switch (editor.kind) {
    case 'create-profile': return { ...editor, draft: { ...editor.draft } };
    case 'profile': return editor.section === 'datos'
      ? { ...editor, base: { ...editor.base, programs: [...editor.base.programs], socials: { ...editor.base.socials } }, draft: { ...editor.draft, programs: [...editor.draft.programs] } }
      : { ...editor, base: { ...editor.base, programs: [...editor.base.programs], socials: { ...editor.base.socials } }, draft: { ...editor.draft } };
    case 'photo': return { ...editor };
    case 'series': return { ...editor, baseProfile: { ...editor.baseProfile }, baseSeries: editor.baseSeries ? { ...editor.baseSeries } : null, draft: { ...editor.draft } };
    case 'move-chapter': return { ...editor, baseProfile: { ...editor.baseProfile }, baseSeries: { ...editor.baseSeries }, basePlacement: { ...editor.basePlacement, series: editor.basePlacement.series.map((item) => ({ ...item })) }, baseOrder: [...editor.baseOrder] };
    case 'link-placement': return { ...editor, baseProfile: { ...editor.baseProfile }, baseLink: { ...editor.baseLink, series: editor.baseLink.series.map((item) => ({ ...item })) }, draft: { ...editor.draft }, ...(editor.pendingAddDraft ? { pendingAddDraft: { ...editor.pendingAddDraft } } : {}) };
    case 'link-resource': return { ...editor, baseResource: { ...editor.baseResource }, draft: { ...editor.draft } };
    case 'add-link': return { ...editor, baseProfile: { ...editor.baseProfile }, draft: { ...editor.draft } };
    case 'move-link': return { ...editor, baseProfile: { ...editor.baseProfile }, baseLink: { ...editor.baseLink, series: editor.baseLink.series.map((item) => ({ ...item })) }, baseOrder: [...editor.baseOrder] };
    case 'reference': return { ...editor, baseProfile: { ...editor.baseProfile }, ...(editor.selected ? { selected: { ...editor.selected } } : {}) };
    case 'claim': return { ...editor, baseProfile: { ...editor.baseProfile }, selected: editor.selected.map((item) => ({ ...item })) };
  }
}

export function createCreatorOwnerState(input: {
  data: CreatorEditorDTO;
  accountEmail: string;
  csrfToken: string;
  sessionBinding: string;
  isAdmin: boolean;
  publicOrigin: string;
  seriesQuery: CreatorOwnerSeriesQuery;
  view?: CreatorOwnerView;
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
  const data = copySnapshot(input.data);
  const profile = data.profile;
  const linksQuery = input.linksQuery ?? DEFAULT_CREATOR_OWNER_LINKS_QUERY;
  return {
    observed: data,
    accountEmail: input.accountEmail,
    sessionBinding: input.sessionBinding,
    sessionEvidence: { latestBoundOperationId: 0, latestSessionCheckOperationId: 0 },
    isAdmin: input.isAdmin,
    publicOrigin: input.publicOrigin,
    ...(input.seriesQueryError ? { seriesQueryError: input.seriesQueryError } : {}),
    editor: profile ? undefined : {
      kind: 'create-profile', key: 'create-profile', base: null,
      draft: input.initialCreate ?? { displayName: '', slug: '' },
    },
    attempt: { status: 'idle' },
    session: { state: 'ready', csrfToken: input.csrfToken },
    location: {
      query: { ...input.seriesQuery },
      pendingSeriesSearch: input.pendingSeriesSearch ?? input.seriesQuery.buscarSeries,
      pendingChapterSearch: input.pendingChapterSearch ?? input.seriesQuery.buscarCapitulos,
      pendingMembership: input.pendingMembership ?? input.seriesQuery.pertenencia,
      view: input.view ?? 'enlaces',
      linksQuery: { ...linksQuery },
      pendingLinksQuery: { ...(input.pendingLinksQuery ?? linksQuery) },
      ...(input.linksQueryError ? { linksQueryError: input.linksQueryError } : {}),
      prompt: 'none',
    },
    activity: { period: input.initialActivityPeriod ?? 30, sequence: 0, status: 'idle' },
    catalog: { status: 'idle', search: '', page: 1, needsRefresh: false, rejectedReferenceSelections: [] },
    claimHistory: { status: 'idle', sequence: 0 },
    runtimeReady: false,
  };
}

function profileDraft(profile: CreatorProfileDTO): CreatorOwnerProfileDraft {
  return {
    displayName: profile.displayName,
    slug: profile.slug,
    city: profile.city ?? '',
    country: profile.country ?? '',
    programs: [...profile.programs],
    bio: profile.bio ?? '',
  };
}

function socialsDraft(profile: CreatorProfileDTO): CreatorOwnerSocialsDraft {
  return {
    instagram: profile.socials.instagram ?? '',
    x: profile.socials.x ?? '',
    linkedin: profile.socials.linkedin ?? '',
    awsBuilder: profile.socials.awsBuilder ?? '',
    website: profile.socials.website ?? '',
  };
}

function profileWithVersion(profile: CreatorProfileDTO, version: number): CreatorProfileDTO {
  return { ...profile, programs: [...profile.programs], socials: { ...profile.socials }, version };
}

function applyEffect(data: CreatorEditorDTO, effect: CreatorOwnerEffect): CreatorEditorDTO {
  const next = copySnapshot(data);
  switch (effect.kind) {
    case 'profile-updated':
      if (next.profile === null || next.profile.id === effect.profile.id) next.profile = { ...effect.profile, programs: [...effect.profile.programs], socials: { ...effect.profile.socials } };
      return next;
    case 'photo-updated':
      if (next.profile?.id === effect.profileId) next.profile = { ...next.profile, version: effect.profileVersion, photo: { ...effect.photo } };
      return next;
    case 'series-updated':
      if (next.profile?.id !== effect.profileId) return next;
      next.profile = profileWithVersion(next.profile, effect.profileVersion);
      next.series = effect.series.version === 0
        ? next.series.filter(({ id }) => id !== effect.series.id)
        : [...next.series.filter(({ id }) => id !== effect.series.id), { ...effect.series }];
      return next;
    case 'series-deleted':
      if (next.profile?.id !== effect.profileId) return next;
      next.profile = profileWithVersion(next.profile, effect.profileVersion);
      next.series = next.series.filter(({ id }) => id !== effect.seriesId);
      next.links = next.links.map((link) => ({ ...link, series: link.series.filter(({ seriesId }) => seriesId !== effect.seriesId) }));
      return next;
    case 'chapters-updated': {
      if (next.profile?.id !== effect.profileId) return next;
      next.profile = profileWithVersion(next.profile, effect.profileVersion);
      const changes = new Map(effect.changes.map((change) => [change.placementId, change]));
      next.links = next.links.map((link) => {
        const change = changes.get(link.placementId);
        if (!change) return link;
        const memberships = link.series.filter(({ seriesId }) => seriesId !== effect.seriesId);
        if (change.membership) memberships.push({ ...change.membership });
        return { ...link, placementVersion: change.placementVersion, series: memberships };
      });
      return next;
    }
    case 'chapter-moved': {
      if (next.profile?.id !== effect.profileId) return next;
      next.profile = profileWithVersion(next.profile, effect.profileVersion);
      const changes = new Map(effect.changes.map((change) => [change.placementId, change]));
      next.links = next.links.map((link) => {
        const change = changes.get(link.placementId);
        if (!change) return link;
        return {
          ...link,
          placementVersion: change.placementVersion,
          series: link.series.map((membership) => membership.seriesId === effect.seriesId
            ? { ...membership, position: change.position }
            : membership),
        };
      });
      return next;
    }
    case 'link-updated': {
      if (next.profile?.id !== effect.profileId) return next;
      next.profile = profileWithVersion(next.profile, effect.profileVersion);
      next.links = next.links.map((link) => link.placementId === effect.link.placementId ? { ...effect.link, series: effect.link.series.map((item) => ({ ...item })) } : link);
      if (effect.resource) next.editableResources = next.editableResources.map((resource) => resource.id === effect.resource?.id ? { ...effect.resource } : resource);
      return next;
    }
    case 'link-moved': {
      if (next.profile?.id !== effect.profileId) return next;
      next.profile = profileWithVersion(next.profile, effect.profileVersion);
      const changes = new Map(effect.changes.map((change) => [change.placementId, change]));
      next.links = next.links.map((link) => {
        const change = changes.get(link.placementId);
        return change ? { ...link, position: change.position, placementVersion: change.placementVersion } : link;
      });
      return next;
    }
    case 'link-added': {
      if (next.profile?.id !== effect.profileId) return next;
      next.profile = profileWithVersion(next.profile, effect.profileVersion);
      const canonicalLink = { ...effect.link, series: effect.link.series.map((item) => ({ ...item })) };
      next.links = effect.created
        ? [...next.links, canonicalLink]
        : next.links.map((link) => link.placementId === effect.link.placementId ? canonicalLink : link);
      const resource = effect.resource ?? {
        id: effect.link.resourceId, title: effect.link.title, url: effect.link.url,
        ...(Object.hasOwn(effect.link, 'description') ? { description: effect.link.description } : {}),
        version: effect.link.resourceVersion,
      };
      if (next.editableResources.some(({ id }) => id === resource.id)) {
        next.editableResources = next.editableResources.map((prior) => prior.id === resource.id ? resource : prior);
      } else if (effect.resource) {
        next.editableResources = [...next.editableResources, resource];
      }
      return next;
    }
    case 'link-removed':
      if (next.profile?.id !== effect.profileId) return next;
      next.profile = profileWithVersion(next.profile, effect.profileVersion);
      next.links = next.links.filter(({ placementId }) => placementId !== effect.placementId);
      return next;
    case 'resource-updated':
      next.editableResources = next.editableResources.map((resource) => resource.id === effect.resource.id ? { ...effect.resource } : resource);
      return next;
    case 'claim-submitted':
      if (next.profile?.id !== effect.profileId) return next;
      next.claims = mergeClaimObservations(next.claims, [effect.claim]);
      return next;
  }
}

type ReferenceCompletionSource = 'acknowledged' | 'adopted';

interface CreatorOwnerReferenceCompletion {
  editor: CreatorOwnerEditor | CreatorOwnerLinkEditor | undefined;
  hasPendingIntent: boolean;
  message: string;
  focusAfterRender?: string;
}

function completeReference(
  submitted: Extract<CreatorOwnerLinkEditor, { kind: 'reference' }>,
  current: Extract<CreatorOwnerLinkEditor, { kind: 'reference' }>,
  savedPlacement: CreatorLinkDTO | undefined,
  profile: CreatorProfileDTO,
  rejectedSelections: readonly Pick<CreatorCatalogSelectionDTO, 'id' | 'url'>[],
  source: ReferenceCompletionSource,
  created?: boolean,
): CreatorOwnerReferenceCompletion {
  const submittedSelection = submitted.selected;
  const saved = submittedSelection && savedPlacement?.resourceId === submittedSelection.id
    && savedPlacement.url === submittedSelection.url ? savedPlacement : undefined;
  const sameSelection = Boolean(submittedSelection && current.selected
    && current.selected.id === submittedSelection.id && current.selected.url === submittedSelection.url);
  const keepFocusInPicker = source === 'adopted'
    ? { focusAfterRender: current.selected ? '#owner-link-directory-option' : '#owner-catalog-search' }
    : {};

  if (!saved) {
    const rejectedSelection = referenceSelectionWasRejected(rejectedSelections, current.selected);
    const selected = rejectedSelection ? undefined : current.selected;
    return { editor: { ...current, baseProfile: { ...profile }, ...(rejectedSelection ? { selected: undefined } : {}) }, hasPendingIntent: true,
      message: rejectedSelection
        ? 'No encontramos la referencia enviada en la página guardada. Esa dirección ya fue rechazada; elige una selección vigente para continuar.'
        : 'No encontramos la referencia enviada en la página guardada. Conservamos la selección para una acción manual.',
      ...(source === 'adopted' ? { focusAfterRender: selected ? '#owner-link-directory-option' : '#owner-catalog-search' } : {}) };
  }

  if (sameSelection && current.selectedForDirectory !== submitted.selectedForDirectory) {
    return { editor: { kind: 'link-placement', key: `link:${saved.placementId}`, baseProfile: { ...profile },
      baseLink: { ...saved, series: saved.series.map((item) => ({ ...item })) }, editable: false, optionsOnly: true,
      draft: { ...linkDraft(saved), selectedForDirectory: current.selectedForDirectory }, pendingDirectoryOptionDecision: true },
    hasPendingIntent: true,
    message: 'La referencia enviada está en tu página. Conservamos tu decisión posterior sobre la propuesta para que puedas guardarla o descartarla en opciones.',
    focusAfterRender: '#owner-link-directory-option' };
  }

  if (sameSelection) {
    const message = source === 'acknowledged' && created === false
      ? 'Ese contenido ya estaba en tu página. No cambiamos su ficha, opciones, posición ni series.'
      : source === 'acknowledged'
        ? 'Contenido agregado a tu página. La ficha compartida conserva sus datos.'
        : 'La página guardada incluye la referencia original. No repetimos la solicitud.';
    return { editor: undefined, hasPendingIntent: false, message };
  }

  return { editor: { ...current, baseProfile: { ...profile } }, hasPendingIntent: true,
    message: 'La página guardada incluye la referencia enviada. Conservamos la selección actual para una acción manual.',
    ...keepFocusInPicker };
}

function sharedAddDraft(editor: Extract<CreatorOwnerLinkEditor, { kind: 'link-placement' }>,
  profile: CreatorProfileDTO): CreatorOwnerLinkEditor {
  if (!editor.pendingAddDraft) throw new TypeError('La continuación no contiene el borrador completo del alta.');
  return { kind: 'add-link', key: 'add-link', baseProfile: profile,
    draft: { ...editor.pendingAddDraft } };
}

function addAfterDuplicate(
  editor: Extract<CreatorOwnerLinkEditor, { kind: 'add-link' }>,
  link: CreatorLinkDTO,
  profile: CreatorProfileDTO,
  editable: boolean,
  openSaved = false,
  submittedDraft?: CreatorOwnerLinkDraft,
): CreatorOwnerEditor | CreatorOwnerLinkEditor | undefined {
  const pendingAddDraft = { ...editor.draft };
  const textDiffers = pendingAddDraft.title !== link.title || pendingAddDraft.url !== link.url
    || pendingAddDraft.description !== (link.description ?? '');
  const optionDiffers = pendingAddDraft.selectedForDirectory !== link.selectedForDirectory;
  const optionChangedAfterSubmit = Boolean(submittedDraft
    && pendingAddDraft.selectedForDirectory !== submittedDraft.selectedForDirectory);
  if (!openSaved && !editable && !optionDiffers && !optionChangedAfterSubmit && textDiffers) {
    return { ...editor, baseProfile: { ...profile }, draft: pendingAddDraft };
  }
  if (!openSaved && !textDiffers && !optionDiffers && !optionChangedAfterSubmit) return undefined;
  const keepIndependentSharedAdd = !editable && (textDiffers || optionDiffers || optionChangedAfterSubmit);
  return {
    kind: 'link-placement', key: `link:${link.placementId}`, baseProfile: { ...profile },
    baseLink: { ...link, series: link.series.map((item) => ({ ...item })) }, editable,
    draft: editable ? { ...pendingAddDraft, featured: link.featured }
      : { ...linkDraft(link), selectedForDirectory: pendingAddDraft.selectedForDirectory },
    ...(keepIndependentSharedAdd ? { pendingAddDraft } : {}),
    ...(optionDiffers || optionChangedAfterSubmit ? { pendingDirectoryOptionDecision: true as const } : {}),
  };
}

type AddSettlement =
  | { kind: 'created'; correction: boolean }
  | { kind: 'duplicate'; submittedDraft?: CreatorOwnerLinkDraft }
  | { kind: 'observed'; submittedDraft?: CreatorOwnerLinkDraft };

function settleAdd(
  editor: Extract<CreatorOwnerLinkEditor, { kind: 'add-link' }>,
  link: CreatorLinkDTO,
  profile: CreatorProfileDTO,
  editable: boolean,
  settlement: AddSettlement,
): CreatorOwnerEditor | CreatorOwnerLinkEditor | undefined {
  if (settlement.kind === 'created') {
    if (!settlement.correction) return undefined;
    if (editable) return { kind: 'link-placement', key: `link:${link.placementId}`, baseProfile: { ...profile },
      baseLink: { ...link, series: link.series.map((item) => ({ ...item })) }, editable: true,
      draft: { ...editor.draft, featured: link.featured } };
    return { ...editor, baseProfile: { ...profile } };
  }
  return addAfterDuplicate(editor, link, profile, editable, settlement.kind === 'observed', settlement.submittedDraft);
}

function editorAfterEffect(editor: CreatorOwnerEditor | CreatorOwnerLinkEditor | undefined, intent: CreatorOwnerWriteIntent, effect: CreatorOwnerEffect, correction: boolean, data: CreatorEditorDTO): CreatorOwnerEditor | CreatorOwnerLinkEditor | undefined {
  if (!editor || editor.key !== intent.editorKey) return editor;
  if (effect.kind === 'profile-updated') {
    if (intent.kind === 'create-profile' && editor.kind === 'create-profile') {
      if (!correction) return undefined;
      return { kind: 'profile', key: `profile:datos:${effect.profile.id}`, section: 'datos', base: { ...effect.profile },
        draft: { ...profileDraft(effect.profile), displayName: editor.draft.displayName, slug: editor.draft.slug } };
    }
    if (editor.kind === 'profile' && editor.base.id === effect.profile.id) {
      const draft = correction ? editor.draft : editor.section === 'datos' ? profileDraft(effect.profile) : socialsDraft(effect.profile);
      return { ...editor, base: { ...effect.profile }, draft } as CreatorOwnerEditor;
    }
  }
  if (effect.kind === 'photo-updated' && editor.kind === 'photo' && editor.base.id === effect.profileId) {
    return { ...editor, base: data.profile ? { ...data.profile } : editor.base, uploadId: undefined, uploadedFile: undefined, file: correction ? editor.file : undefined };
  }
  if (effect.kind === 'series-updated' && editor.kind === 'series' && editor.baseProfile.id === effect.profileId) {
    if (!editor.baseSeries) return { ...editor, baseProfile: profileWithVersion(editor.baseProfile, effect.profileVersion), baseSeries: { ...effect.series }, requestedSlug: undefined,
      draft: correction ? editor.draft : { name: effect.series.name, slug: effect.series.slug, description: effect.series.description ?? '' } };
    if (editor.baseSeries.id === effect.series.id) return { ...editor, baseProfile: profileWithVersion(editor.baseProfile, effect.profileVersion), baseSeries: { ...effect.series },
      draft: correction ? editor.draft : { name: effect.series.name, slug: effect.series.slug, description: effect.series.description ?? '' } };
  }
  if (effect.kind === 'chapter-moved' && editor.kind === 'move-chapter' && editor.seriesId === effect.seriesId) {
    const changed = effect.changes.find(({ placementId }) => placementId === editor.placementId);
    const link = data.links.find(({ placementId }) => placementId === editor.placementId);
    const series = data.series.find(({ id }) => id === editor.seriesId);
    if (changed && link && series) {
      return { ...editor, baseProfile: data.profile ? { ...data.profile } : editor.baseProfile, baseSeries: { ...series },
        basePlacement: { ...link, series: link.series.map((membership) => ({ ...membership })) },
        baseOrder: creatorOwnerChapterOrder(data.links, editor.seriesId).map(({ placementId }) => placementId),
        targetPosition: correction ? editor.targetPosition : String(creatorOwnerChapterOrder(data.links, editor.seriesId).findIndex(({ placementId }) => placementId === editor.placementId) + 1) };
    }
  }
  if (effect.kind === 'link-updated' && editor.kind === 'link-placement' && editor.baseLink.placementId === effect.link.placementId) {
    const updated = data.links.find(({ placementId }) => placementId === effect.link.placementId) ?? effect.link;
    if (!correction && editor.pendingAddDraft) return sharedAddDraft(editor, data.profile ?? editor.baseProfile);
    return { kind: 'link-placement', key: editor.key,
      baseProfile: data.profile ? { ...data.profile } : editor.baseProfile, baseLink: { ...updated }, editable: editor.editable,
      draft: correction ? editor.draft : linkDraft(updated),
      ...(editor.optionsOnly ? { optionsOnly: true as const } : {}),
      ...(editor.pendingAddDraft ? { pendingAddDraft: { ...editor.pendingAddDraft } } : {}),
      ...(correction && editor.pendingDirectoryOptionDecision ? { pendingDirectoryOptionDecision: true as const } : {}) };
  }
  if (effect.kind === 'resource-updated' && editor.kind === 'link-resource' && editor.baseResource.id === effect.resource.id) {
    return { ...editor, baseResource: { ...effect.resource }, draft: correction ? editor.draft : resourceDraft(effect.resource) };
  }
  if (effect.kind === 'link-moved' && editor.kind === 'move-link'
    && effect.changes.some(({ placementId }) => placementId === editor.baseLink.placementId)) {
    const updated = data.links.find(({ placementId }) => placementId === editor.baseLink.placementId);
    if (updated) {
      const group = creatorOwnerLinkGroup(data.links, updated.featured);
      return { ...editor, baseProfile: data.profile ? { ...data.profile } : editor.baseProfile, baseLink: { ...updated },
        baseOrder: group.map(({ placementId }) => placementId), targetPosition: correction ? editor.targetPosition : String(group.findIndex(({ placementId }) => placementId === updated.placementId) + 1) };
    }
  }
  if (effect.kind === 'link-added' && editor.kind === 'add-link' && editor.baseProfile.id === effect.profileId) {
    const updated = data.links.find(({ placementId }) => placementId === effect.link.placementId) ?? effect.link;
    const editable = data.editableResources.some(({ id }) => id === updated.resourceId);
    const submittedDraft = intent.capture.kind === 'add-link' ? intent.capture.draft : undefined;
    return settleAdd(editor, updated, data.profile ?? editor.baseProfile, editable, effect.created
      ? { kind: 'created', correction }
      : { kind: 'duplicate', ...(submittedDraft ? { submittedDraft } : {}) });
  }
  if (effect.kind === 'claim-submitted' && editor.kind === 'claim') {
    const submitted = intent.capture.kind === 'claim' ? intent.capture : undefined;
    if (!submitted || !correction) return correction ? editor : undefined;
    const selected = editor.selected.filter((item) => !submitted.selected.some((sent) => sent.resourceId === item.resourceId && sent.url === item.url));
    return { ...editor, selected,
      knownUrls: editor.knownUrls === submitted.knownUrls ? '' : editor.knownUrls,
      evidence: editor.evidence === submitted.evidence ? '' : editor.evidence };
  }
  return editor;
}

export function linkDraft(link: CreatorLinkDTO): CreatorOwnerLinkDraft {
  return { title: link.title, url: link.url, description: link.description ?? '', featured: link.featured, selectedForDirectory: link.selectedForDirectory };
}

export function resourceDraft(resource: CreatorEditableResourceDTO): Pick<CreatorOwnerLinkDraft, 'title' | 'url' | 'description'> {
  return { title: resource.title, url: resource.url, description: resource.description ?? '' };
}

export function creatorOwnerDraftIsDirty(editor: CreatorOwnerEditor | CreatorOwnerLinkEditor | undefined): boolean {
  if (!editor) return false;
  if (editor.kind === 'photo') return Boolean(editor.file);
  switch (editor.kind) {
    case 'create-profile': return Boolean(editor.draft.displayName.trim() || editor.draft.slug.trim());
    case 'profile':
      if (editor.section === 'datos') {
        const value = editor.draft as CreatorOwnerProfileDraft;
        return value.displayName !== editor.base.displayName || value.slug !== editor.base.slug
          || value.city !== (editor.base.city ?? '') || value.country !== (editor.base.country ?? '')
          || value.bio !== (editor.base.bio ?? '')
          || value.programs.length !== editor.base.programs.length
          || value.programs.some((item, index) => item !== editor.base.programs[index]);
      }
      return Object.entries(editor.draft as CreatorOwnerSocialsDraft).some(([key, value]) => value !== (editor.base.socials[key as keyof CreatorProfileDTO['socials']] ?? ''));
    case 'series': return editor.draft.name !== (editor.baseSeries?.name ?? '')
      || editor.draft.slug !== (editor.baseSeries?.slug ?? '')
      || editor.draft.description !== (editor.baseSeries?.description ?? '');
    case 'move-chapter': return editor.targetPosition !== String(editor.baseOrder.indexOf(editor.placementId) + 1);
    default: return creatorOwnerLinkDraftIsDirty(editor);
  }
}

export function creatorOwnerLinkDraftIsDirty(editor: CreatorOwnerLinkEditor): boolean {
  switch (editor.kind) {
    case 'link-placement': return editor.draft.title !== editor.baseLink.title
      || editor.draft.url !== editor.baseLink.url
      || editor.draft.description !== (editor.baseLink.description ?? '')
      || creatorOwnerLinkOptionsAreDirty(editor)
      || Boolean(editor.pendingAddDraft);
    case 'link-resource': return JSON.stringify(editor.draft) !== JSON.stringify(resourceDraft(editor.baseResource));
    case 'add-link': return Boolean(editor.draft.title.trim() || editor.draft.url.trim() || editor.draft.description.trim() || !editor.draft.selectedForDirectory);
    case 'move-link': return editor.targetPosition !== String(editor.baseOrder.indexOf(editor.baseLink.placementId) + 1);
    case 'reference': return Boolean(editor.selected) || !editor.selectedForDirectory;
    case 'claim': return editor.selected.length > 0 || Boolean(editor.knownUrls.trim() || editor.evidence.trim());
  }
}

export function creatorOwnerLinkOptionsAreDirty(editor: Extract<CreatorOwnerLinkEditor, { kind: 'link-placement' }>): boolean {
  return editor.draft.featured !== editor.baseLink.featured
    || editor.draft.selectedForDirectory !== editor.baseLink.selectedForDirectory
    || Boolean(editor.pendingDirectoryOptionDecision);
}

export function creatorOwnerReferenceSubmissionStatus(state: CreatorOwnerState,
  selection: Pick<CreatorCatalogSelectionDTO, 'id' | 'url'> | undefined): 'ready' | 'needs-selection' | 'catalog-unavailable' | 'rejected' | 'stale-selection' {
  if (!selection) return 'needs-selection';
  if (referenceSelectionWasRejected(state.catalog.rejectedReferenceSelections, selection)) return 'rejected';
  if (state.catalog.status !== 'ready' || state.catalog.needsRefresh) return 'catalog-unavailable';
  return state.catalog.entries?.some(({ id, url }) => id === selection.id && url === selection.url) ? 'ready' : 'stale-selection';
}

export function creatorOwnerClaimSelectionIsCurrent(state: CreatorOwnerState,
  selections: readonly CreatorOwnerClaimSelection[]): boolean {
  if (state.catalog.needsRefresh && selections.length > 0) return false;
  const shared = new Set(state.observed.links.filter((link) => !state.observed.editableResources.some(({ id }) => id === link.resourceId))
    .map(({ resourceId, url }) => `${resourceId}\u0000${url}`));
  return selections.every(({ resourceId, url }) => shared.has(`${resourceId}\u0000${url}`)
    || state.catalog.entries?.some((item) => item.id === resourceId && item.url === url));
}

export function creatorOwnerCanSubmitEditor(state: CreatorOwnerState): boolean {
  const editor = state.editor;
  if (!editor) return false;
  if (editor.kind === 'photo') return Boolean(editor.file);
  if (editor.kind === 'reference') return creatorOwnerReferenceSubmissionStatus(state, editor.selected) === 'ready';
  if (editor.kind === 'claim') {
    if (!editor.selected.length && !editor.knownUrls.trim()) return false;
    return creatorOwnerClaimSelectionIsCurrent(state, editor.selected);
  }
  if (editor.kind === 'link-placement' && editor.pendingAddDraft && !editor.editable) {
    return creatorOwnerLinkOptionsAreDirty(editor);
  }
  return true;
}

function currentAttempt(state: CreatorOwnerState, intentId: string): CreatorOwnerWriteIntent | undefined {
  return 'intent' in state.attempt && state.attempt.intent.id === intentId ? state.attempt.intent : undefined;
}

function isCreatorOwnerProfileForIntent(snapshot: CreatorEditorDTO, intent: CreatorOwnerWriteIntent): boolean {
  const capture = intent.capture;
  const profile = capture.kind === 'photo' ? capture.base : undefined;
  return Boolean(profile && snapshot.profile?.id === profile.id);
}

function sameEditor(left: CreatorOwnerEditor | CreatorOwnerLinkEditor, right: CreatorOwnerEditor | CreatorOwnerLinkEditor): boolean {
  if (left.key !== right.key || left.kind !== right.kind) return false;
  if (left.kind === 'photo' && right.kind === 'photo') return left.file === right.file && left.uploadId === right.uploadId;
  if (left.kind === 'reference' && right.kind === 'reference') {
    return left.selectedForDirectory === right.selectedForDirectory
      && left.selected?.id === right.selected?.id && left.selected?.url === right.selected?.url;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameReferenceSelection(left: Pick<CreatorCatalogSelectionDTO, 'id' | 'url'> | undefined,
  right: Pick<CreatorCatalogSelectionDTO, 'id' | 'url'> | undefined): boolean {
  return Boolean(left && right && left.id === right.id && left.url === right.url);
}

function referenceSelectionWasRejected(rejectedSelections: readonly Pick<CreatorCatalogSelectionDTO, 'id' | 'url'>[],
  selected: Pick<CreatorCatalogSelectionDTO, 'id' | 'url'> | undefined): boolean {
  return Boolean(selected && rejectedSelections.some((rejected) => sameReferenceSelection(rejected, selected)));
}

export function creatorOwnerEditorChangedSince(capture: CreatorOwnerEditor | CreatorOwnerLinkEditor | CreatorOwnerListContext, current: CreatorOwnerEditor | CreatorOwnerLinkEditor | undefined): boolean {
  if (capture.kind === 'list-command') return false;
  if (!current || capture.key !== current.key || capture.kind !== current.kind) return true;
  if (capture.kind === 'photo' && current.kind === 'photo') return capture.file !== current.file;
  if (capture.kind === 'profile' && current.kind === 'profile') return JSON.stringify(capture.draft) !== JSON.stringify(current.draft);
  if (capture.kind === 'create-profile' && current.kind === 'create-profile') return JSON.stringify(capture.draft) !== JSON.stringify(current.draft);
  if (capture.kind === 'series' && current.kind === 'series') return JSON.stringify(capture.draft) !== JSON.stringify(current.draft);
  if (capture.kind === 'move-chapter' && current.kind === 'move-chapter') return capture.targetPosition !== current.targetPosition;
  return JSON.stringify(capture) !== JSON.stringify(current);
}

export function creatorOwnerReducer(state: CreatorOwnerState, action: CreatorOwnerAction): CreatorOwnerState {
  switch (action.type) {
    case 'runtime-ready': return { ...state, runtimeReady: true };
    case 'open-editor': return { ...state, editor: cloneEditor(action.editor), attempt: { status: 'idle' }, location: { ...state.location, prompt: 'none', exitRequest: undefined, transition: undefined }, message: undefined };
    case 'close-editor': {
      const waitingForExitChoice = Boolean(state.location.exitRequest && state.location.prompt === 'exit');
      return { ...state, editor: undefined, attempt: { status: 'idle' }, location: { ...state.location,
        prompt: waitingForExitChoice ? 'exit' : 'none', ...(waitingForExitChoice ? {} : { exitRequest: undefined }),
        ...(waitingForExitChoice ? { focusAfterRender: '#owner-exit-discard' } : {}) } };
    }
    case 'update-profile-draft':
      if (state.editor?.kind === 'profile' && state.editor.section === 'datos') return { ...state, editor: { ...state.editor, draft: { ...state.editor.draft, ...action.value, programs: action.value.programs ?? state.editor.draft.programs } } };
      if (state.editor?.kind === 'create-profile') return { ...state, editor: { ...state.editor, draft: { ...state.editor.draft, displayName: action.value.displayName ?? state.editor.draft.displayName, slug: action.value.slug ?? state.editor.draft.slug } } };
      return state;
    case 'update-socials-draft':
      return state.editor?.kind === 'profile' && state.editor.section === 'redes' ? { ...state, editor: { ...state.editor, draft: { ...state.editor.draft, ...action.value } } } : state;
    case 'update-series-draft':
      if (state.editor?.kind !== 'series') return state;
      return { ...state, editor: { ...state.editor, draft: { ...state.editor.draft, ...action.value }, requestedSlug: state.editor.baseSeries ? state.editor.requestedSlug : undefined,
        slugManuallyEdited: action.manuallyEditedSlug ? true : state.editor.slugManuallyEdited } };
    case 'update-move-draft':
      return state.editor?.kind === 'move-chapter' ? { ...state, editor: { ...state.editor, targetPosition: action.targetPosition } } : state;
    case 'set-move-suggestion':
      return state.editor?.kind === 'move-chapter' ? { ...state, editor: { ...state.editor, suggestionPosition: action.targetPosition } } : state;
    case 'update-link-draft':
      if (state.editor?.kind === 'link-placement') return { ...state, editor: { ...state.editor, draft: { ...state.editor.draft, ...action.value } } };
      if (state.editor?.kind === 'link-resource') return { ...state, editor: { ...state.editor, draft: {
        ...state.editor.draft,
        ...(action.value.title !== undefined ? { title: action.value.title } : {}),
        ...(action.value.url !== undefined ? { url: action.value.url } : {}),
        ...(action.value.description !== undefined ? { description: action.value.description } : {}),
      } } };
      return state;
    case 'update-add-link-draft':
      return state.editor?.kind === 'add-link' ? { ...state, editor: { ...state.editor, draft: { ...state.editor.draft, ...action.value } } } : state;
    case 'resume-shared-add': {
      const editor = state.editor;
      if (editor?.kind !== 'link-placement' || !editor.pendingAddDraft
        || (state.attempt.status !== 'confirmed' && state.attempt.status !== 'idle')) return state;
      return { ...state, editor: sharedAddDraft(editor, editor.baseProfile),
        message: { text: 'Recuperaste el borrador del alta. Las opciones de la ficha compartida siguen sin cambios.', kind: 'info' },
        location: { ...state.location, focusAfterRender: '#owner-add-link-title' } };
    }
    case 'update-move-link-draft':
      return state.editor?.kind === 'move-link' ? { ...state, editor: { ...state.editor, targetPosition: action.targetPosition, suggestionPosition: undefined } } : state;
    case 'set-link-move-suggestion':
      return state.editor?.kind === 'move-link' ? { ...state, editor: { ...state.editor, suggestionPosition: action.targetPosition } } : state;
    case 'update-reference-draft':
      if (state.editor?.kind !== 'reference') return state;
      {
        if (referenceSelectionWasRejected(state.catalog.rejectedReferenceSelections, action.selected)) {
          const message = 'Esa dirección ya fue rechazada por estar desactualizada. Elige una selección vigente del catálogo.';
          return { ...state, message: { text: message, kind: 'info' } };
        }
        const selectedIsCurrent = action.selected && state.catalog.status === 'ready' && !state.catalog.needsRefresh
          && state.catalog.entries?.some(({ id, url }) => id === action.selected?.id && url === action.selected.url);
        const resolvesResourceConflict = selectedIsCurrent && state.attempt.status === 'conflict'
          && state.attempt.intent.kind === 'reference' && state.attempt.intent.editorKey === state.editor.key
          && ['RESOURCE_CONFLICT', 'STALE_RESOURCE_REFERENCE'].includes(state.attempt.code ?? '');
        return { ...state, editor: { ...state.editor,
          ...(Object.hasOwn(action, 'selected') ? { selected: action.selected } : {}),
          ...(action.selectedForDirectory !== undefined ? { selectedForDirectory: action.selectedForDirectory } : {}) },
        ...(resolvesResourceConflict ? { attempt: { status: 'idle' as const }, message: {
          text: 'La ficha vigente quedó seleccionada. Puedes agregarla manualmente; no repetimos la solicitud anterior.', kind: 'info' as const,
        } } : {}) };
      }
    case 'update-claim-draft':
      return state.editor?.kind === 'claim' ? { ...state, editor: { ...state.editor,
        ...(action.value.selected ? { selected: action.value.selected.map((item) => ({ ...item })) } : {}),
        ...(action.value.knownUrls !== undefined ? { knownUrls: action.value.knownUrls } : {}),
        ...(action.value.evidence !== undefined ? { evidence: action.value.evidence } : {}) } } : state;
    case 'catalog-load-started': return { ...state, catalog: { ...state.catalog, status: 'loading', message: undefined } };
    case 'catalog-load-ready': {
      const conflictedReference = state.attempt.status === 'conflict'
        && state.attempt.intent.kind === 'reference'
        && ['RESOURCE_CONFLICT', 'STALE_RESOURCE_REFERENCE'].includes(state.attempt.code ?? '')
        ? state.attempt.intent : undefined;
      const entries = action.entries.map((item) => ({ ...item }));
      const currentReferenceEditor = state.editor?.kind === 'reference' ? state.editor : undefined;
      const referenceEditor = conflictedReference && currentReferenceEditor?.key === conflictedReference.editorKey
        ? currentReferenceEditor : undefined;
      const submitted = conflictedReference?.capture.kind === 'reference' ? conflictedReference.capture.selected : undefined;
      const selected = currentReferenceEditor?.selected;
      const selectionIsSubmitted = Boolean(selected && submitted && selected.id === submitted.id && selected.url === submitted.url);
      const selectionIsCurrent = Boolean(selected && entries.some(({ id, url }) => id === selected.id && url === selected.url));
      const selectedWasRejected = referenceSelectionWasRejected(state.catalog.rejectedReferenceSelections, selected);
      const preserveLaterSelection = Boolean(referenceEditor && selected && !selectionIsSubmitted && selectionIsCurrent && !selectedWasRejected);
      const clearReferenceSelection = selectedWasRejected || Boolean(referenceEditor && !preserveLaterSelection);
      const editor = currentReferenceEditor && clearReferenceSelection
        ? { ...currentReferenceEditor, selected: undefined } : state.editor;
      return { ...state, editor,
        ...(selectedWasRejected ? { message: { text: 'La dirección rechazada sigue desactualizada. Conservamos cualquier otra selección y su opción.', kind: 'info' as const } } : {}),
        ...(preserveLaterSelection ? {
          attempt: { status: 'idle' as const },
          message: { text: 'La ficha vigente quedó seleccionada. Puedes agregarla manualmente; no repetimos la solicitud anterior.', kind: 'info' as const },
        } : {}),
        catalog: { ...state.catalog, status: 'ready', entries, needsRefresh: false, message: action.message } };
    }
    case 'catalog-load-failed': return { ...state, catalog: { ...state.catalog, status: 'error', message: action.message } };
    case 'catalog-search': return { ...state, catalog: { ...state.catalog, search: action.value, page: 1 } };
    case 'catalog-page': return { ...state, catalog: { ...state.catalog, page: action.value } };
    case 'catalog-require-refresh': return { ...state, catalog: { ...state.catalog, needsRefresh: true, message: action.message } };
    case 'claim-history-started': return { ...state, claimHistory: { status: 'loading', sequence: action.sequence,
      message: 'Comprobando solicitudes…' } };
    case 'claim-history-ready': {
      if (state.claimHistory.sequence !== action.sequence) return state;
      return { ...state, observed: { ...state.observed, claims: mergeClaimObservations(state.observed.claims, action.claims) },
        claimHistory: { status: 'idle', sequence: action.sequence, message: action.message } };
    }
    case 'claim-history-failed': return state.claimHistory.sequence === action.sequence
      ? { ...state, claimHistory: { status: 'error', sequence: action.sequence, message: action.message,
        ...(action.sessionDerived ? { sessionDerived: true } : {}) } } : state;
    case 'claim-history-session-cleared': {
      if (state.claimHistory.sequence > action.sequence || state.claimHistory.status !== 'error' || !state.claimHistory.sessionDerived) return state;
      return { ...state, claimHistory: { status: 'idle', sequence: state.claimHistory.sequence } };
    }
    case 'claim-attempt-checked':
      if (state.attempt.status !== 'checking' || state.attempt.intent.id !== action.intentId || state.attempt.checkId !== action.checkId) return state;
      return { ...state, attempt: { status: 'confirmed', intentId: action.intentId }, message: { text: action.message, kind: 'info' } };
    case 'update-photo-file':
      return state.editor?.kind === 'photo' ? { ...state, editor: { ...state.editor, file: action.file } } : state;
    case 'photo-upload-started':
      if (state.editor?.kind !== 'photo') return state;
      if (!('intent' in state.attempt) || state.attempt.intent.id !== action.intentId || state.attempt.intent.capture.kind !== 'photo') return state;
      return { ...state, editor: { ...state.editor, uploadId: action.uploadId, uploadedFile: action.file },
        attempt: { ...state.attempt, intent: { ...state.attempt.intent, capture: { ...state.attempt.intent.capture, uploadId: action.uploadId, uploadedFile: action.file } } } };
    case 'clear-photo-upload':
      return state.editor?.kind === 'photo' && currentAttempt(state, action.intentId) ? { ...state, editor: { ...state.editor, uploadId: undefined, uploadedFile: undefined } } : state;
    case 'photo-check-complete': {
      const intent = currentAttempt(state, action.intentId);
      if (!intent || intent.kind !== 'photo' || !isCreatorOwnerProfileForIntent(action.snapshot, intent)) return state;
      const snapshot = copySnapshotWithClaimMerge(state.observed, action.snapshot);
      const editor = state.editor?.kind === 'photo' && state.editor.key === intent.editorKey && snapshot.profile
        ? { ...state.editor, base: { ...snapshot.profile }, uploadId: undefined, uploadedFile: undefined,
          file: action.uploaded && state.editor.file === action.uploadedFile ? undefined : state.editor.file }
        : state.editor;
      return { ...state, observed: snapshot, editor, attempt: { status: 'confirmed', intentId: action.intentId },
        message: { text: action.uploaded
          ? editor?.kind === 'photo' && editor.file ? 'La foto anterior quedó guardada. Conservamos el archivo nuevo; súbelo cuando quieras cambiarla.' : 'La foto quedó guardada.'
          : 'Comprobamos la foto activa. Conservamos el archivo elegido; puedes iniciar una carga nueva cuando quieras.', kind: 'success' },
        location: state.location.exitRequest && state.location.prompt === 'exit'
          ? { ...state.location, focusAfterRender: '#owner-exit-discard' } : state.location };
    }
    case 'begin-write':
      if (state.attempt.status === 'sending' || state.session.state !== 'ready') return state;
      if (state.attempt.status === 'checking') {
        const resubmittingClaimAfterHistoryCheck = state.attempt.intent.kind === 'claim' && action.intent.kind === 'claim'
          && state.attempt.intent.editorKey === action.intent.editorKey;
        if (!resubmittingClaimAfterHistoryCheck) return state;
      }
      return { ...state, attempt: { status: 'sending', intent: action.intent }, message: undefined,
        location: { ...state.location, exitRequest: undefined, prompt: 'none', transition: action.exitTransition } };
    case 'write-uncertain': {
      let intent = currentAttempt(state, action.intentId);
      if (!intent) return state;
      if (intent.kind === 'add-link' && action.status === 'conflict'
        && ['PROFILE_CONFLICT', 'LINK_CONFLICT', 'URL_CONFLICT', 'PLACEMENT_ORDER_EXHAUSTED'].includes(action.code ?? '')) {
        intent = { ...intent, addDidNotCommit: true };
      }
      const rejected = action.status === 'conflict' && ['RESOURCE_CONFLICT', 'STALE_RESOURCE_REFERENCE'].includes(action.code ?? '')
        && intent.kind === 'reference' && intent.capture.kind === 'reference' ? intent.capture.selected : undefined;
      const quarantinePair = rejected && !referenceSelectionWasRejected(state.catalog.rejectedReferenceSelections, rejected);
      const catalog = quarantinePair ? { ...state.catalog, rejectedReferenceSelections: [...state.catalog.rejectedReferenceSelections, { id: rejected.id, url: rejected.url }] } : state.catalog;
      return { ...state, catalog, attempt: { status: action.status, intent, message: action.message, ...(action.code ? { code: action.code } : {}) }, message: { text: action.message, kind: 'error' }, location: { ...state.location, exitRequest: undefined, transition: undefined, prompt: 'none' } };
    }
    case 'write-rejected': {
      const intent = currentAttempt(state, action.intentId);
      if (!intent) return state;
      return { ...state, attempt: { status: 'idle' }, message: { text: action.message, kind: 'error' }, location: { ...state.location, exitRequest: undefined, transition: undefined, prompt: 'none' } };
    }
    case 'clear-attempt': return { ...state, attempt: { status: 'idle' }, message: { text: action.message, kind: 'info' } };
    case 'write-confirmed': {
      const intent = currentAttempt(state, action.intentId);
      if (!intent) return state;
      const observed = applyEffect(state.observed, action.effect);
      const referenceCapture = intent.kind === 'reference' && intent.capture.kind === 'reference' ? intent.capture : undefined;
      const referenceEditor = state.editor?.kind === 'reference' && state.editor.key === intent.editorKey ? state.editor : undefined;
      const referenceEffect = action.effect.kind === 'link-added' && action.effect.source === 'reference' ? action.effect : undefined;
      const referenceCompletion = referenceCapture && referenceEditor
        && referenceEffect?.profileId === referenceEditor.baseProfile.id && observed.profile
        ? completeReference(referenceCapture, referenceEditor,
          observed.links.find(({ placementId }) => placementId === referenceEffect.link.placementId) ?? referenceEffect.link,
          observed.profile, state.catalog.rejectedReferenceSelections, 'acknowledged', referenceEffect.created)
        : undefined;
      const editor = referenceCompletion
        ? referenceCompletion.editor : editorAfterEffect(state.editor, intent, action.effect, action.correction, observed);
      const linksQuery = selectCreatorOwnerLinks(observed.links, observed.series, state.location.linksQuery).query;
      const linkPlacementId = intent.kind === 'save-link' && intent.capture.kind === 'link-placement'
        ? intent.capture.baseLink.placementId : undefined;
      const updatedLinkNoLongerMatches = !action.correction && action.effect.kind === 'link-updated' && linkPlacementId !== undefined
        && !selectCreatorOwnerLinks(observed.links, observed.series, state.location.linksQuery).matches.some(({ placementId }) => placementId === linkPlacementId);
      const resumedSharedAdd = action.effect.kind === 'link-updated' && editor?.kind === 'add-link';
      const duplicateUrl = action.effect.kind === 'link-added' && action.effect.source === 'url' && !action.effect.created;
      const retainsPendingEdit = action.correction || resumedSharedAdd || (duplicateUrl && Boolean(editor));
      const confirmationMessage = referenceCompletion?.message ?? (duplicateUrl
        ? editor?.kind === 'add-link' || editor?.kind === 'link-placement' && editor.pendingAddDraft
          ? 'Ese contenido ya estaba en tu página. Conservamos tu borrador.'
          : 'Ese contenido ya estaba en tu página. No cambiamos su ficha, opciones, posición ni series.'
        : resumedSharedAdd ? 'Guardaste las opciones del enlace. El borrador del alta sigue pendiente.'
        : action.correction ? 'Cambios guardados. Conservamos la corrección que escribiste mientras se guardaba.'
        : updatedLinkNoLongerMatches ? 'Cambios guardados. El enlace ya no coincide con la búsqueda o los filtros actuales.'
          : action.effect.kind === 'link-added' && action.effect.source === 'reference' ? 'Contenido agregado a tu página. La ficha compartida conserva sus datos.'
            : action.effect.kind === 'link-added' && action.effect.source === 'reinclude' ? 'Ficha reincorporada. Sus capítulos anteriores no se restauran automáticamente.'
              : action.effect.kind === 'link-added' ? 'Enlace agregado a tu página.' : 'Cambios guardados.');
      return {
        ...state,
        observed,
        editor,
        attempt: { status: 'confirmed', intentId: action.intentId },
        message: { text: confirmationMessage, kind: 'success' },
        location: { ...state.location,
          ...(action.effect.kind === 'series-deleted' ? { query: { ...state.location.query, serie: '', buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1 }, pendingChapterSearch: '', pendingMembership: 'todos' as const } : {}),
          ...(referenceCompletion ? { transition: referenceCompletion.hasPendingIntent ? undefined : state.location.transition,
            prompt: 'none' as const } : retainsPendingEdit ? { transition: undefined, prompt: 'none' as const } : {}),
          ...(action.effect.kind === 'link-removed' || action.effect.kind === 'link-added' || action.effect.kind === 'link-updated'
            ? { linksQuery, pendingLinksQuery: linksQuery } : {}),
          ...(referenceCompletion ? { focusAfterRender: referenceCompletion.focusAfterRender }
            : resumedSharedAdd ? { focusAfterRender: '#owner-add-link-title' }
            : action.effect.kind === 'series-deleted' ? { focusAfterRender: '#owner-series-title' }
            : action.effect.kind === 'chapters-updated' || action.effect.kind === 'chapter-moved' ? { focusAfterRender: '#owner-chapter-search' }
              : action.effect.kind === 'link-removed' || action.effect.kind === 'link-added' || action.effect.kind === 'link-moved'
                || updatedLinkNoLongerMatches ? { focusAfterRender: '#owner-link-search' } : {}) },
      };
    }
    case 'begin-check': {
      const intent = currentAttempt(state, action.intentId);
      if (!intent || (state.attempt.status !== 'uncertain' && state.attempt.status !== 'conflict')) return state;
      return { ...state, attempt: { status: 'checking', intent, checkId: action.checkId }, message: { text: 'Consultando el estado guardado…', kind: 'info' } };
    }
    case 'check-failed': {
      if (state.attempt.status !== 'checking' || state.attempt.intent.id !== action.intentId || state.attempt.checkId !== action.checkId) return state;
      return { ...state, attempt: { status: 'uncertain', intent: state.attempt.intent, message: action.message,
        ...(action.sessionDerived ? { sessionDerived: true as const } : {}) },
        message: { text: action.message, kind: 'error', ...(action.sessionDerived ? { sessionDerived: true as const } : {}) },
        location: state.location.prompt === 'exit' ? { ...state.location, focusAfterRender: '#owner-exit-compare' } : state.location };
    }
    case 'check-compared': {
      if (state.attempt.status !== 'checking' || state.attempt.intent.id !== action.intentId || state.attempt.checkId !== action.checkId
        || state.attempt.intent.editorKey !== action.comparison.editorKey) return state;
      if (state.attempt.intent.capture.kind === 'list-command') {
        return action.comparison.canAdopt ? completeListCheck(state, action.intentId, action.comparison) : state;
      }
      return { ...state, attempt: { status: 'uncertain', intent: state.attempt.intent, message: action.comparison.message, comparison: action.comparison },
        message: { text: action.comparison.message, kind: 'info' },
        location: state.location.prompt === 'exit' ? { ...state.location,
          focusAfterRender: action.comparison.canAdopt ? '#owner-adopt' : '#owner-exit-compare' } : state.location };
    }
    case 'adopt-comparison': {
      if (state.attempt.status !== 'uncertain' || state.attempt.comparison?.id !== action.comparisonId || !state.attempt.comparison.canAdopt) return state;
      const comparison = state.attempt.comparison;
      if (state.attempt.intent.capture.kind === 'list-command') return state;
      const current = state.editor;
      if (action.addPlacementId && (current?.kind !== 'add-link'
        || comparison.savedAddPlacementId !== action.addPlacementId)) return state;
      if (current && current.key !== comparison.editorKey) return state;
      if (!current) return state;
      if (comparison.draftAtCompare && current && !sameEditor(comparison.draftAtCompare, current)) {
        const message = 'Tus campos cambiaron después de la comparación. Vuelve a comprobar antes de adoptar.';
        return { ...state, attempt: { ...state.attempt, comparison: undefined, message }, message: { text: message, kind: 'info' },
          location: { ...state.location, focusAfterRender: state.location.prompt === 'exit' ? '#owner-exit-compare' : '#owner-compare' } };
      }
      const snapshot = copySnapshotWithClaimMerge(state.observed, comparison.snapshot);
      const selectedSeriesStillExists = snapshot.series.some(({ id }) => id === state.location.query.serie);
      const referenceCapture = state.attempt.intent.kind === 'reference' && state.attempt.intent.capture.kind === 'reference'
        ? state.attempt.intent.capture : undefined;
      const recoveredReference = comparison.recoveredLinkId
        ? snapshot.links.find(({ placementId }) => placementId === comparison.recoveredLinkId) : undefined;
      const referenceCompletion = current.kind === 'reference' && referenceCapture
        && snapshot.profile?.id === current.baseProfile.id
        ? completeReference(referenceCapture, current, recoveredReference, snapshot.profile,
          state.catalog.rejectedReferenceSelections, 'adopted')
        : undefined;
      let editor: CreatorOwnerEditor | CreatorOwnerLinkEditor | undefined = current;
      if (referenceCompletion) {
        editor = referenceCompletion.editor;
      } else if (current.kind === 'create-profile') {
        if (snapshot.profile) editor = undefined;
      } else if (current.kind === 'profile' && snapshot.profile && snapshot.profile.id === current.base.id) {
        editor = current.section === 'datos'
          ? { ...current, base: { ...snapshot.profile }, draft: profileDraft(snapshot.profile) }
          : { ...current, base: { ...snapshot.profile }, draft: socialsDraft(snapshot.profile) };
      } else if (current.kind === 'series' && snapshot.profile && snapshot.profile.id === current.baseProfile.id) {
        const matched = current.baseSeries
          ? snapshot.series.find(({ id }) => id === current.baseSeries?.id)
          : comparison.seriesId ? snapshot.series.find(({ id }) => id === comparison.seriesId) : undefined;
        if (matched) {
          const original = state.attempt.intent.capture.kind === 'series' ? state.attempt.intent.capture.draft : current.draft;
          const draft = current.baseSeries ? { ...current.draft } : {
            name: current.draft.name !== original.name ? current.draft.name : matched.name,
            slug: current.draft.slug !== original.slug ? current.draft.slug : matched.slug,
            description: current.draft.description !== original.description ? current.draft.description : matched.description ?? '',
          };
          editor = { ...current, baseProfile: { ...snapshot.profile }, baseSeries: { ...matched }, requestedSlug: undefined, draft };
        } else if (!current.baseSeries && !current.requestedSlug) {
          editor = { ...current, baseProfile: { ...snapshot.profile } };
        }
      } else if (current.kind === 'move-chapter' && snapshot.profile && snapshot.profile.id === current.baseProfile.id) {
        const series = snapshot.series.find(({ id }) => id === current.seriesId);
        const placement = snapshot.links.find(({ placementId }) => placementId === current.placementId);
        if (series && placement?.series.some(({ seriesId }) => seriesId === current.seriesId)) {
          editor = { ...current, baseProfile: { ...snapshot.profile }, baseSeries: { ...series }, basePlacement: placement,
            baseOrder: creatorOwnerChapterOrder(snapshot.links, current.seriesId).map(({ placementId }) => placementId) };
        }
      } else if (current.kind === 'link-placement' && snapshot.profile?.id === current.baseProfile.id) {
        const link = snapshot.links.find(({ placementId }) => placementId === current.baseLink.placementId);
        if (link) editor = { ...current, baseProfile: { ...snapshot.profile }, baseLink: { ...link },
          draft: { ...linkDraft(link), ...(current.pendingDirectoryOptionDecision
            ? { selectedForDirectory: current.draft.selectedForDirectory } : {}) },
          editable: !current.optionsOnly && snapshot.editableResources.some(({ id }) => id === link.resourceId) };
        else if (current.pendingAddDraft) {
          // The removed placement is authoritative. Resume the independent
          // Add draft with the adopted profile; never recreate the placement.
          editor = sharedAddDraft(current, snapshot.profile);
        } else if (current.optionsOnly) {
          const selection = state.catalog.entries?.find(({ id, url }) => id === current.baseLink.resourceId && url === current.baseLink.url);
          editor = { kind: 'reference', key: 'reference', baseProfile: { ...snapshot.profile },
            ...(selection && !referenceSelectionWasRejected(state.catalog.rejectedReferenceSelections, selection)
              ? { selected: { ...selection } } : {}), selectedForDirectory: current.draft.selectedForDirectory };
        }
      } else if (current.kind === 'link-resource') {
        const resource = snapshot.editableResources.find(({ id }) => id === current.baseResource.id);
        const stillRetained = resource && !snapshot.links.some(({ resourceId }) => resourceId === resource.id);
        if (stillRetained) editor = { ...current, baseResource: { ...resource }, draft: resourceDraft(resource) };
      } else if (current.kind === 'move-link' && snapshot.profile?.id === current.baseProfile.id) {
        const link = snapshot.links.find(({ placementId }) => placementId === current.baseLink.placementId);
        if (link) {
          const group = creatorOwnerLinkGroup(snapshot.links, link.featured);
          editor = { ...current, baseProfile: { ...snapshot.profile }, baseLink: { ...link }, baseOrder: group.map(({ placementId }) => placementId) };
        }
      } else if (current.kind === 'add-link' && snapshot.profile?.id === current.baseProfile.id) {
        const recovered = action.addPlacementId ? snapshot.links.find(({ placementId }) => placementId === action.addPlacementId)
          : undefined;
        if (!recovered) editor = { ...current, baseProfile: { ...snapshot.profile } };
        else {
          const editable = snapshot.editableResources.some(({ id }) => id === recovered.resourceId);
          const submittedDraft = state.attempt.intent.capture.kind === 'add-link' ? state.attempt.intent.capture.draft : undefined;
          editor = settleAdd(current, recovered, snapshot.profile, editable,
            { kind: 'observed', ...(submittedDraft ? { submittedDraft } : {}) });
        }
      }
      const changedOperation = editor && (editor.key !== current.key || editor.kind !== current.kind);
      const cancelsExitRequest = Boolean(changedOperation || referenceCompletion?.hasPendingIntent);
      const keepsExitPrompt = Boolean(!cancelsExitRequest && state.location.exitRequest && state.location.prompt === 'exit');
      const adoptionMessage = referenceCompletion?.message ?? (current.kind === 'series' && !current.baseSeries && !comparison.seriesId
        ? 'Usaste la versión actual del perfil. No encontramos la serie original; conservamos el contenido para un nuevo intento manual.'
        : current.kind === 'series' ? 'Usaste las versiones guardadas como base. Conservamos toda tu corrección; pulsa Guardar para enviarla.'
          : current.kind === 'add-link' && !action.addPlacementId ? 'Usaste la página guardada como base. El borrador del alta sigue separado de las fichas guardadas.'
            : current.kind === 'add-link' ? 'Abriste la ficha que elegiste. Revisa la corrección antes de guardarla.'
              : current.kind === 'link-placement' && editor?.kind === 'add-link'
                ? 'La colocación ya no está en tu página. No la reincorporamos; conservamos el borrador del alta con el perfil actual.'
                : current.kind === 'link-placement' && editor?.kind === 'reference'
                  ? 'La colocación ya no está en tu página. Conservamos la selección y su opción para una decisión manual; no repetimos ni recreamos la referencia.'
              : current.kind === 'link-placement' && current.pendingDirectoryOptionDecision
                ? 'Conservamos tu decisión posterior sobre la propuesta. Puedes guardarla o descartarla antes de salir.'
                : 'Usaste los datos guardados. Puedes iniciar otra corrección cuando quieras.');
      return {
        ...state, observed: snapshot, editor, attempt: { status: 'confirmed', intentId: state.attempt.intent.id },
        message: { text: adoptionMessage, kind: 'success' },
        location: { ...state.location, query: { ...state.location.query, serie: selectedSeriesStillExists ? state.location.query.serie : '', paginaCapitulos: 1,
          ...(selectedSeriesStillExists ? {} : { buscarCapitulos: '', pertenencia: 'todos' }) },
          linksQuery: selectCreatorOwnerLinks(snapshot.links, snapshot.series, state.location.linksQuery).query,
          pendingLinksQuery: selectCreatorOwnerLinks(snapshot.links, snapshot.series, state.location.linksQuery).query,
          pendingChapterSearch: selectedSeriesStillExists ? state.location.pendingChapterSearch : '',
          pendingMembership: selectedSeriesStillExists ? state.location.pendingMembership : 'todos',
          ...(cancelsExitRequest ? { exitRequest: undefined, transition: undefined, prompt: 'none' as const }
            : referenceCompletion && !keepsExitPrompt ? { prompt: 'none' as const } : {}),
          focusAfterRender: keepsExitPrompt ? editor ? '#owner-exit-continue' : '#owner-exit-discard'
            : referenceCompletion ? referenceCompletion.focusAfterRender
            : current.kind === 'series' && !snapshot.series.some(({ id }) => id === current.baseSeries?.id) ? '#owner-series-title'
              : editor?.kind === 'add-link' ? '#owner-add-link-title'
                : editor?.kind === 'reference' ? editor.selected ? '#owner-link-directory-option' : '#owner-catalog-search'
                : editor?.kind === 'link-placement' && (current.kind === 'add-link' || editor.pendingDirectoryOptionDecision)
                  ? editor.editable && current.kind === 'add-link' ? '#owner-link-title' : '#owner-link-directory-option'
                : current.kind === 'link-placement' || current.kind === 'link-resource' || current.kind === 'move-link' ? '#owner-link-search' : undefined },
      };
    }
    case 'session-check-started':
    case 'session-evidence': {
      const nextPolicy = reduceCreatorOwnerSessionPolicy(state, action);
      if (!nextPolicy.accepted) return state;
      let attempt = state.attempt;
      if ((attempt.status === 'uncertain' || attempt.status === 'conflict') && attempt.sessionDerived && nextPolicy.attemptFeedback) {
        const { sessionDerived: _sessionDerived, ...currentAttempt } = attempt;
        attempt = { ...currentAttempt, message: nextPolicy.attemptFeedback.text,
          ...(nextPolicy.attemptFeedback.sessionDerived ? { sessionDerived: true as const } : {}) };
      }
      const message = nextPolicy.feedback ?? (nextPolicy.clearFeedback && state.message?.sessionDerived ? undefined : state.message);
      return { ...state, session: nextPolicy.session, sessionEvidence: nextPolicy.sessionEvidence,
        attempt, message };
    }
    case 'set-message': return { ...state, message: { text: action.text, kind: action.kind ?? 'info' } };
    case 'set-series-search': return { ...state, location: { ...state.location, pendingSeriesSearch: action.value } };
    case 'set-chapter-search': return { ...state, location: { ...state.location, pendingChapterSearch: action.value } };
    case 'apply-query': return { ...state, seriesQueryError: undefined, location: { ...state.location, query: action.query,
      ...(action.preservePending ? {} : { pendingSeriesSearch: action.query.buscarSeries }),
      ...(action.preservePending && action.query.serie === state.location.query.serie ? {} : {
        pendingChapterSearch: action.query.buscarCapitulos, pendingMembership: action.query.pertenencia,
      }),
      ...(action.preservePending ? {} : { focusAfterRender: action.focusSelector }) } };
    case 'set-links-pending-query': return { ...state, location: { ...state.location, pendingLinksQuery: { ...state.location.pendingLinksQuery, ...action.query } } };
    case 'apply-links-query': return { ...state, location: { ...state.location, linksQueryError: undefined, linksQuery: action.query,
      ...(action.preservePending ? {
        pendingLinksQuery: normalizeOwnerLinksQuery(state.observed, state.location.pendingLinksQuery),
      } : { pendingLinksQuery: action.query, focusAfterRender: action.focusSelector }) } };
    case 'set-series-query-error': return { ...state, seriesQueryError: action.reason };
    case 'set-links-query-error': return { ...state, location: { ...state.location, linksQueryError: action.reason } };
    case 'set-pending-membership': return { ...state, location: { ...state.location, pendingMembership: action.value } };
    case 'clear-focus': return state.location.focusAfterRender !== action.selector
      ? state : { ...state, location: { ...state.location, focusAfterRender: undefined } };
    case 'request-exit': return { ...state, location: { ...state.location, exitRequest: action.transition, prompt: 'exit' } };
    case 'clear-transition': return { ...state, location: { ...state.location, transition: undefined } };
    case 'resolve-transition': {
      if (action.action === 'continue') {
        const focusAfterRender = state.editor ? undefined : state.location.view === 'enlaces' ? '#owner-link-search'
          : state.location.view === 'series' ? state.location.query.serie ? '#owner-chapter-search' : '#owner-series-search' : undefined;
        return { ...state, location: { ...state.location, exitRequest: undefined, transition: undefined, prompt: 'none',
          ...(focusAfterRender ? { focusAfterRender } : {}) } };
      }
      return { ...state, editor: undefined, attempt: { status: 'idle' }, location: { ...state.location,
        transition: state.location.exitRequest, exitRequest: undefined, prompt: 'none' } };
    }
    case 'set-prompt': return { ...state, location: { ...state.location, prompt: action.prompt, deleteSeriesId: action.seriesId } };
    case 'activity-loading': return { ...state, activity: { period: action.period, sequence: action.sequence, status: 'loading' } };
    case 'set-activity-period': return state.activity.period === action.period ? state : { ...state, activity: { period: action.period, sequence: state.activity.sequence, status: 'idle' } };
    case 'activity-retry': return { ...state, activity: { period: state.activity.period, sequence: state.activity.sequence + 1, status: 'idle' } };
    case 'activity-ready':
      return state.activity.sequence === action.sequence && state.activity.period === action.period ? { ...state, activity: { ...state.activity, status: 'ready', report: action.report, message: undefined } } : state;
    case 'activity-failed':
      return state.activity.sequence === action.sequence && state.activity.period === action.period ? { ...state, activity: { ...state.activity, status: 'error', message: action.message } } : state;
    case 'adopt-snapshot': return { ...state, observed: copySnapshotWithClaimMerge(state.observed, action.snapshot) };
  }
}

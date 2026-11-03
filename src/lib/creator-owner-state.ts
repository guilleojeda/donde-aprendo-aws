import type {
  CreatorEditorDTO,
  CreatorLinkDTO,
  CreatorProfileDTO,
  CreatorSeriesDTO,
} from '../types/creators';
import type { CreatorOwnerSeriesMembership, CreatorOwnerSeriesQuery } from './creator-owner-series';
import { creatorOwnerChapterOrder } from './creator-owner-series';

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

export type CreatorOwnerEditorDraft = Exclude<CreatorOwnerEditor, { kind: 'photo' }>;

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
  | { kind: 'photo-updated'; profileId: string; profileVersion: number; photo: NonNullable<CreatorProfileDTO['photo']> };

export interface CreatorOwnerWriteIntent {
  id: string;
  editorKey: string;
  kind: 'create-profile' | 'save-profile' | 'publish' | 'save-series' | 'delete-series'
    | 'chapter-add' | 'chapter-remove' | 'chapter-move' | 'photo';
  capture: CreatorOwnerEditor | CreatorOwnerListContext;
}

export interface CreatorOwnerListContext {
  kind: 'list-command';
  key: string;
  operation: 'publish' | 'delete-series' | 'chapter-add' | 'chapter-remove';
  baseProfile: CreatorProfileDTO;
  baseSeries?: CreatorSeriesDTO;
  basePlacement?: CreatorLinkDTO;
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
    comparison?: CreatorOwnerComparison;
  }
  | { status: 'confirmed'; intentId: string };

export interface CreatorOwnerComparison {
  id: string;
  editorKey: string;
  snapshot: CreatorEditorDTO;
  draftAtCompare?: CreatorOwnerEditor;
  seriesId?: string;
  canAdopt: boolean;
  message: string;
}

export type CreatorOwnerSession =
  | { state: 'ready'; csrfToken: string }
  | { state: 'recovery-required'; reason: 'expired' | 'csrf'; message: string }
  | { state: 'checking'; reason: 'expired' | 'csrf'; message: string }
  | { state: 'blocked'; reason: 'different-principal' | 'disabled' | 'invalid-context'; message: string };

export type CreatorOwnerLocation = {
  query: CreatorOwnerSeriesQuery;
  pendingSeriesSearch: string;
  pendingChapterSearch: string;
  pendingMembership: CreatorOwnerSeriesMembership;
  transition?: { href: string; kind: 'anchor' | 'form' | 'history' | 'logout'; historyIndex?: number };
  prompt: 'none' | 'exit' | 'delete-series';
  deleteSeriesId?: string;
  focusAfterRender?: string;
};

export interface CreatorOwnerState {
  observed: CreatorEditorDTO;
  accountEmail: string;
  sessionBinding: string;
  isAdmin: boolean;
  publicOrigin: string;
  seriesQueryError?: string;
  editor?: CreatorOwnerEditor;
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
  message?: { text: string; kind: 'info' | 'success' | 'error' };
  runtimeReady: boolean;
}

export type CreatorOwnerAction =
  | { type: 'runtime-ready' }
  | { type: 'open-editor'; editor: CreatorOwnerEditor }
  | { type: 'close-editor' }
  | { type: 'update-profile-draft'; value: Partial<CreatorOwnerProfileDraft> }
  | { type: 'update-socials-draft'; value: Partial<CreatorOwnerSocialsDraft> }
  | { type: 'update-series-draft'; value: Partial<CreatorOwnerSeriesDraft>; manuallyEditedSlug?: boolean }
  | { type: 'update-move-draft'; targetPosition: string }
  | { type: 'set-move-suggestion'; targetPosition?: number }
  | { type: 'update-photo-file'; file?: File }
  | { type: 'photo-upload-started'; intentId: string; uploadId: string; file: File }
  | { type: 'clear-photo-upload'; intentId: string }
  | { type: 'photo-check-complete'; intentId: string; snapshot: CreatorEditorDTO; uploaded: boolean; uploadedFile?: File }
  | { type: 'begin-write'; intent: CreatorOwnerWriteIntent }
  | { type: 'write-uncertain'; intentId: string; status: 'uncertain' | 'conflict'; message: string }
  | { type: 'write-rejected'; intentId: string; message: string }
  | { type: 'clear-attempt'; message: string }
  | { type: 'write-confirmed'; intentId: string; effect: CreatorOwnerEffect; correction: boolean }
  | { type: 'begin-check'; intentId: string; checkId: string }
  | { type: 'check-failed'; intentId: string; checkId: string; message: string }
  | { type: 'check-compared'; intentId: string; checkId: string; comparison: CreatorOwnerComparison }
  | { type: 'adopt-comparison'; comparisonId: string }
  | { type: 'session-required'; reason: 'expired' | 'csrf'; message: string }
  | { type: 'session-check-started' }
  | { type: 'session-renewed'; csrfToken: string }
  | { type: 'session-blocked'; reason: 'different-principal' | 'disabled' | 'invalid-context'; message: string }
  | { type: 'set-message'; text: string; kind?: 'info' | 'success' | 'error' }
  | { type: 'set-series-search'; value: string }
  | { type: 'set-chapter-search'; value: string }
  | { type: 'set-pending-membership'; value: CreatorOwnerSeriesMembership }
  | { type: 'apply-query'; query: CreatorOwnerSeriesQuery }
  | { type: 'set-series-query-error'; reason: 'series' }
  | { type: 'clear-focus' }
  | { type: 'set-transition'; transition?: CreatorOwnerLocation['transition'] }
  | { type: 'resolve-transition'; action: 'save' | 'discard' | 'continue' }
  | { type: 'set-prompt'; prompt: CreatorOwnerLocation['prompt']; seriesId?: string }
  | { type: 'activity-loading'; period: 7 | 30; sequence: number }
  | { type: 'set-activity-period'; period: 7 | 30 }
  | { type: 'activity-retry' }
  | { type: 'activity-ready'; period: 7 | 30; sequence: number; report: import('./creator-statistics-types').CreatorStatisticsReady }
  | { type: 'activity-failed'; period: 7 | 30; sequence: number; message: string }
  | { type: 'adopt-snapshot'; snapshot: CreatorEditorDTO };

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

function cloneEditor(editor: CreatorOwnerEditor): CreatorOwnerEditor {
  switch (editor.kind) {
    case 'create-profile': return { ...editor, draft: { ...editor.draft } };
    case 'profile': return editor.section === 'datos'
      ? { ...editor, base: { ...editor.base, programs: [...editor.base.programs], socials: { ...editor.base.socials } }, draft: { ...editor.draft, programs: [...editor.draft.programs] } }
      : { ...editor, base: { ...editor.base, programs: [...editor.base.programs], socials: { ...editor.base.socials } }, draft: { ...editor.draft } };
    case 'photo': return { ...editor };
    case 'series': return { ...editor, baseProfile: { ...editor.baseProfile }, baseSeries: editor.baseSeries ? { ...editor.baseSeries } : null, draft: { ...editor.draft } };
    case 'move-chapter': return { ...editor, baseProfile: { ...editor.baseProfile }, baseSeries: { ...editor.baseSeries }, basePlacement: { ...editor.basePlacement, series: editor.basePlacement.series.map((item) => ({ ...item })) }, baseOrder: [...editor.baseOrder] };
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
  seriesQueryError?: string;
  initialCreate?: { displayName: string; slug: string };
  pendingSeriesSearch?: string;
  pendingChapterSearch?: string;
  pendingMembership?: CreatorOwnerSeriesMembership;
}): CreatorOwnerState {
  const data = copySnapshot(input.data);
  const profile = data.profile;
  return {
    observed: data,
    accountEmail: input.accountEmail,
    sessionBinding: input.sessionBinding,
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
      prompt: 'none',
    },
    activity: { period: 30, sequence: 0, status: 'idle' },
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
  }
}

function editorAfterEffect(editor: CreatorOwnerEditor | undefined, intent: CreatorOwnerWriteIntent, effect: CreatorOwnerEffect, correction: boolean, data: CreatorEditorDTO): CreatorOwnerEditor | undefined {
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
  return editor;
}

export function creatorOwnerDraftIsDirty(editor: CreatorOwnerEditor | undefined): boolean {
  if (!editor || editor.kind === 'photo') return Boolean(editor && editor.file);
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
  }
}

function currentAttempt(state: CreatorOwnerState, intentId: string): CreatorOwnerWriteIntent | undefined {
  return 'intent' in state.attempt && state.attempt.intent.id === intentId ? state.attempt.intent : undefined;
}

function isCreatorOwnerProfileForIntent(snapshot: CreatorEditorDTO, intent: CreatorOwnerWriteIntent): boolean {
  const capture = intent.capture;
  const profile = capture.kind === 'photo' ? capture.base : undefined;
  return Boolean(profile && snapshot.profile?.id === profile.id);
}

function sameEditor(left: CreatorOwnerEditor, right: CreatorOwnerEditor): boolean {
  if (left.key !== right.key || left.kind !== right.kind) return false;
  if (left.kind === 'photo' && right.kind === 'photo') return left.file === right.file && left.uploadId === right.uploadId;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function creatorOwnerEditorChangedSince(capture: CreatorOwnerEditor | CreatorOwnerListContext, current: CreatorOwnerEditor | undefined): boolean {
  if (capture.kind === 'list-command') return false;
  if (!current || capture.key !== current.key || capture.kind !== current.kind) return true;
  if (capture.kind === 'photo' && current.kind === 'photo') return capture.file !== current.file;
  if (capture.kind === 'profile' && current.kind === 'profile') return JSON.stringify(capture.draft) !== JSON.stringify(current.draft);
  if (capture.kind === 'create-profile' && current.kind === 'create-profile') return JSON.stringify(capture.draft) !== JSON.stringify(current.draft);
  if (capture.kind === 'series' && current.kind === 'series') return JSON.stringify(capture.draft) !== JSON.stringify(current.draft);
  if (capture.kind === 'move-chapter' && current.kind === 'move-chapter') return capture.targetPosition !== current.targetPosition;
  return true;
}

export function creatorOwnerReducer(state: CreatorOwnerState, action: CreatorOwnerAction): CreatorOwnerState {
  switch (action.type) {
    case 'runtime-ready': return { ...state, runtimeReady: true };
    case 'open-editor': return { ...state, editor: cloneEditor(action.editor), attempt: { status: 'idle' }, location: { ...state.location, prompt: 'none', transition: undefined }, message: undefined };
    case 'close-editor': return { ...state, editor: undefined, attempt: { status: 'idle' }, location: { ...state.location, prompt: 'none' } };
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
      const snapshot = copySnapshot(action.snapshot);
      const editor = state.editor?.kind === 'photo' && state.editor.key === intent.editorKey && snapshot.profile
        ? { ...state.editor, base: { ...snapshot.profile }, uploadId: undefined, uploadedFile: undefined,
          file: action.uploaded && state.editor.file === action.uploadedFile ? undefined : state.editor.file }
        : state.editor;
      return { ...state, observed: snapshot, editor, attempt: { status: 'confirmed', intentId: action.intentId },
        message: { text: action.uploaded
          ? editor?.kind === 'photo' && editor.file ? 'La foto anterior quedó guardada. Conservamos el archivo nuevo; súbelo cuando quieras cambiarla.' : 'La foto quedó guardada.'
          : 'Comprobamos la foto activa. Conservamos el archivo elegido; puedes iniciar una carga nueva cuando quieras.', kind: 'success' } };
    }
    case 'begin-write':
      if (state.attempt.status === 'sending' || state.attempt.status === 'checking' || state.session.state !== 'ready') return state;
      return { ...state, attempt: { status: 'sending', intent: action.intent }, message: undefined };
    case 'write-uncertain': {
      const intent = currentAttempt(state, action.intentId);
      if (!intent) return state;
      return { ...state, attempt: { status: action.status, intent, message: action.message }, message: { text: action.message, kind: 'error' }, location: { ...state.location, transition: undefined, prompt: 'none' } };
    }
    case 'write-rejected': {
      const intent = currentAttempt(state, action.intentId);
      if (!intent) return state;
      return { ...state, attempt: { status: 'idle' }, message: { text: action.message, kind: 'error' }, location: { ...state.location, transition: undefined, prompt: 'none' } };
    }
    case 'clear-attempt': return { ...state, attempt: { status: 'idle' }, message: { text: action.message, kind: 'info' } };
    case 'write-confirmed': {
      const intent = currentAttempt(state, action.intentId);
      if (!intent) return state;
      const observed = applyEffect(state.observed, action.effect);
      const editor = editorAfterEffect(state.editor, intent, action.effect, action.correction, observed);
      return {
        ...state,
        observed,
        editor,
        attempt: { status: 'confirmed', intentId: action.intentId },
        message: { text: action.correction ? 'Cambios guardados. Conservamos la corrección que escribiste mientras se guardaba.' : 'Cambios guardados.', kind: 'success' },
        location: { ...state.location,
          ...(action.effect.kind === 'series-deleted' ? { query: { ...state.location.query, serie: '', buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1 }, pendingChapterSearch: '', pendingMembership: 'todos' as const } : {}),
          ...(action.correction ? { transition: undefined, prompt: 'none' as const } : {}),
          ...(action.effect.kind === 'series-deleted' ? { focusAfterRender: '#owner-series-title' }
            : action.effect.kind === 'chapters-updated' || action.effect.kind === 'chapter-moved' ? { focusAfterRender: '#owner-chapter-search' } : {}) },
      };
    }
    case 'begin-check': {
      const intent = currentAttempt(state, action.intentId);
      if (!intent || (state.attempt.status !== 'uncertain' && state.attempt.status !== 'conflict')) return state;
      return { ...state, attempt: { status: 'checking', intent, checkId: action.checkId }, message: { text: 'Consultando el estado guardado…', kind: 'info' } };
    }
    case 'check-failed': {
      if (state.attempt.status !== 'checking' || state.attempt.intent.id !== action.intentId || state.attempt.checkId !== action.checkId) return state;
      return { ...state, attempt: { status: 'uncertain', intent: state.attempt.intent, message: action.message }, message: { text: action.message, kind: 'error' } };
    }
    case 'check-compared': {
      if (state.attempt.status !== 'checking' || state.attempt.intent.id !== action.intentId || state.attempt.checkId !== action.checkId
        || state.attempt.intent.editorKey !== action.comparison.editorKey) return state;
      return { ...state, attempt: { status: 'uncertain', intent: state.attempt.intent, message: action.comparison.message, comparison: action.comparison }, message: { text: action.comparison.message, kind: 'info' } };
    }
    case 'adopt-comparison': {
      if (state.attempt.status !== 'uncertain' || state.attempt.comparison?.id !== action.comparisonId || !state.attempt.comparison.canAdopt) return state;
      const comparison = state.attempt.comparison;
      const current = state.editor;
      if (current && current.key !== comparison.editorKey) return state;
      const listOperation = ['publish', 'delete-series', 'chapter-add', 'chapter-remove'].includes(state.attempt.intent.kind);
      const hasEditor = current !== undefined;
      if (!hasEditor && !listOperation) return state;
      if (comparison.draftAtCompare && current && !sameEditor(comparison.draftAtCompare, current)) {
        return { ...state, attempt: { ...state.attempt, comparison: undefined }, message: { text: 'Tus campos cambiaron después de la comparación. Vuelve a comprobar antes de adoptar.', kind: 'info' } };
      }
      const snapshot = copySnapshot(comparison.snapshot);
      if (!current && listOperation) {
        const query = state.location.query;
        const seriesStillExists = snapshot.series.some(({ id }) => id === query.serie);
        return {
          ...state,
          observed: snapshot,
          attempt: { status: 'confirmed', intentId: state.attempt.intent.id },
          message: { text: 'La lista guardada está actualizada. Revisa el resultado y decide si quieres iniciar otra acción.', kind: 'success' },
          location: { ...state.location,
            query: { ...query, serie: seriesStillExists ? query.serie : '', paginaCapitulos: 1,
              ...(seriesStillExists ? {} : { buscarCapitulos: '', pertenencia: 'todos' }) },
            pendingChapterSearch: seriesStillExists ? state.location.pendingChapterSearch : '',
            pendingMembership: seriesStillExists ? state.location.pendingMembership : 'todos',
            focusAfterRender: seriesStillExists ? '#owner-chapter-search' : '#owner-series-title' },
        };
      }
      if (!current) return state;
      const selectedSeriesStillExists = snapshot.series.some(({ id }) => id === state.location.query.serie);
      let editor: CreatorOwnerEditor | undefined = current;
      if (current.kind === 'create-profile') {
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
      }
      return {
        ...state, observed: snapshot, editor, attempt: { status: 'confirmed', intentId: state.attempt.intent.id },
        message: { text: current.kind === 'series' && !current.baseSeries && !comparison.seriesId
          ? 'Usaste la versión actual del perfil. No encontramos la serie original; conservamos el contenido para un nuevo intento manual.'
          : current.kind === 'series' ? 'Usaste las versiones guardadas como base. Conservamos toda tu corrección; pulsa Guardar para enviarla.'
            : 'Usaste los datos guardados. Puedes iniciar otra corrección cuando quieras.', kind: 'success' },
        location: { ...state.location, query: { ...state.location.query, serie: selectedSeriesStillExists ? state.location.query.serie : '', paginaCapitulos: 1,
          ...(selectedSeriesStillExists ? {} : { buscarCapitulos: '', pertenencia: 'todos' }) },
          pendingChapterSearch: selectedSeriesStillExists ? state.location.pendingChapterSearch : '',
          pendingMembership: selectedSeriesStillExists ? state.location.pendingMembership : 'todos',
          focusAfterRender: current.kind === 'series' && !snapshot.series.some(({ id }) => id === current.baseSeries?.id) ? '#owner-series-title' : undefined },
      };
    }
    case 'session-required':
      return { ...state, session: { state: 'recovery-required', reason: action.reason, message: action.message }, message: { text: action.message, kind: 'error' } };
    case 'session-check-started':
      return state.session.state === 'recovery-required' ? { ...state, session: { ...state.session, state: 'checking' }, message: { text: 'Comprobando la sesión…', kind: 'info' } } : state;
    case 'session-renewed':
      return { ...state, session: { state: 'ready', csrfToken: action.csrfToken }, message: { text: 'Sesión comprobada. Tus cambios siguen aquí; puedes decidir qué guardar.', kind: 'success' } };
    case 'session-blocked':
      return { ...state, session: { state: 'blocked', reason: action.reason, message: action.message }, message: { text: action.message, kind: 'error' } };
    case 'set-message': return { ...state, message: { text: action.text, kind: action.kind ?? 'info' } };
    case 'set-series-search': return { ...state, location: { ...state.location, pendingSeriesSearch: action.value } };
    case 'set-chapter-search': return { ...state, location: { ...state.location, pendingChapterSearch: action.value } };
    case 'apply-query': return { ...state, seriesQueryError: undefined, location: { ...state.location, query: { ...action.query }, pendingSeriesSearch: action.query.buscarSeries, pendingChapterSearch: action.query.buscarCapitulos, pendingMembership: action.query.pertenencia,
      focusAfterRender: action.query.serie ? action.query.serie !== state.location.query.serie ? '#owner-series-chapters-title' : '#owner-chapter-search' : '#owner-series-search' } };
    case 'set-series-query-error': return { ...state, seriesQueryError: action.reason };
    case 'set-pending-membership': return { ...state, location: { ...state.location, pendingMembership: action.value } };
    case 'clear-focus': return { ...state, location: { ...state.location, focusAfterRender: undefined } };
    case 'set-transition': return { ...state, location: { ...state.location, transition: action.transition } };
    case 'resolve-transition': {
      if (action.action === 'continue') return { ...state, location: { ...state.location, transition: undefined, prompt: 'none' } };
      if (action.action === 'discard') return { ...state, editor: undefined, attempt: { status: 'idle' }, location: { ...state.location, prompt: 'none' } };
      return { ...state, location: { ...state.location, prompt: 'none' } };
    }
    case 'set-prompt': return { ...state, location: { ...state.location, prompt: action.prompt, deleteSeriesId: action.seriesId } };
    case 'activity-loading': return { ...state, activity: { period: action.period, sequence: action.sequence, status: 'loading' } };
    case 'set-activity-period': return state.activity.period === action.period ? state : { ...state, activity: { period: action.period, sequence: state.activity.sequence, status: 'idle' } };
    case 'activity-retry': return { ...state, activity: { period: state.activity.period, sequence: state.activity.sequence + 1, status: 'idle' } };
    case 'activity-ready':
      return state.activity.sequence === action.sequence && state.activity.period === action.period ? { ...state, activity: { ...state.activity, status: 'ready', report: action.report, message: undefined } } : state;
    case 'activity-failed':
      return state.activity.sequence === action.sequence && state.activity.period === action.period ? { ...state, activity: { ...state.activity, status: 'error', message: action.message } } : state;
    case 'adopt-snapshot': return { ...state, observed: copySnapshot(action.snapshot) };
  }
}

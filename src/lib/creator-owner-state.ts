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
import { creatorOwnerChapterOrder, selectCreatorOwnerChapters, selectCreatorOwnerSeries } from './creator-owner-series';
import { creatorOwnerLinkGroup, DEFAULT_CREATOR_OWNER_LINKS_QUERY, selectCreatorOwnerLinks } from './creator-owner-links';
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
  | { kind: 'link-placement'; key: string; baseProfile: CreatorProfileDTO; baseLink: CreatorLinkDTO; editable: boolean; draft: CreatorOwnerLinkDraft; sharedTextCorrection?: Pick<CreatorOwnerLinkDraft, 'title' | 'url' | 'description'> }
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
  | { kind: 'claim-submitted'; claim: CreatorClaimDTO }
  | { kind: 'photo-updated'; profileId: string; profileVersion: number; photo: NonNullable<CreatorProfileDTO['photo']> };

export interface CreatorOwnerWriteIntent {
  id: string;
  editorKey: string;
  kind: 'create-profile' | 'save-profile' | 'publish' | 'save-series' | 'delete-series'
    | 'chapter-add' | 'chapter-remove' | 'chapter-move' | 'photo'
    | 'save-link' | 'add-link' | 'move-link' | 'remove-link' | 'reinclude-resource' | 'reference' | 'claim';
  capture: CreatorOwnerEditor | CreatorOwnerLinkEditor | CreatorOwnerListContext;
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
  canAdopt: boolean;
  message: string;
}

export type CreatorOwnerSession =
  | { state: 'ready'; csrfToken: string }
  | { state: 'recovery-required'; reason: 'expired' | 'csrf'; message: string }
  | { state: 'checking'; reason: 'expired' | 'csrf'; message: string }
  | { state: 'blocked'; reason: 'different-principal' | 'disabled' | 'invalid-context'; message: string };

export type CreatorOwnerLocation = {
  view: CreatorOwnerView;
  query: CreatorOwnerSeriesQuery;
  pendingSeriesSearch: string;
  pendingChapterSearch: string;
  pendingMembership: CreatorOwnerSeriesMembership;
  linksQuery: CreatorOwnerLinksQuery;
  pendingLinksQuery: CreatorOwnerLinksQuery;
  linksQueryError?: string;
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
  };
  claimHistory: { status: 'idle' | 'loading' | 'error'; sequence: number; startedClaimIds: string[]; message?: string };
  message?: { text: string; kind: 'info' | 'success' | 'error' };
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
  | { type: 'claim-history-failed'; sequence: number; message: string }
  | { type: 'claim-attempt-checked'; intentId: string; checkId: string; message: string }
  | { type: 'set-move-suggestion'; targetPosition?: number }
  | { type: 'update-photo-file'; file?: File }
  | { type: 'photo-upload-started'; intentId: string; uploadId: string; file: File }
  | { type: 'clear-photo-upload'; intentId: string }
  | { type: 'photo-check-complete'; intentId: string; snapshot: CreatorEditorDTO; uploaded: boolean; uploadedFile?: File }
  | { type: 'begin-write'; intent: CreatorOwnerWriteIntent }
  | { type: 'write-uncertain'; intentId: string; status: 'uncertain' | 'conflict'; message: string; code?: string }
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
  | { type: 'set-links-pending-query'; query: Partial<CreatorOwnerLinksQuery> }
  | { type: 'apply-links-query'; query: CreatorOwnerLinksQuery; focusSelector?: string }
  | { type: 'set-series-query-error'; reason: 'series' }
  | { type: 'set-links-query-error'; reason: 'links' }
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

function cloneEditor(editor: CreatorOwnerEditor | CreatorOwnerLinkEditor): CreatorOwnerEditor | CreatorOwnerLinkEditor {
  switch (editor.kind) {
    case 'create-profile': return { ...editor, draft: { ...editor.draft } };
    case 'profile': return editor.section === 'datos'
      ? { ...editor, base: { ...editor.base, programs: [...editor.base.programs], socials: { ...editor.base.socials } }, draft: { ...editor.draft, programs: [...editor.draft.programs] } }
      : { ...editor, base: { ...editor.base, programs: [...editor.base.programs], socials: { ...editor.base.socials } }, draft: { ...editor.draft } };
    case 'photo': return { ...editor };
    case 'series': return { ...editor, baseProfile: { ...editor.baseProfile }, baseSeries: editor.baseSeries ? { ...editor.baseSeries } : null, draft: { ...editor.draft } };
    case 'move-chapter': return { ...editor, baseProfile: { ...editor.baseProfile }, baseSeries: { ...editor.baseSeries }, basePlacement: { ...editor.basePlacement, series: editor.basePlacement.series.map((item) => ({ ...item })) }, baseOrder: [...editor.baseOrder] };
    case 'link-placement': return { ...editor, baseProfile: { ...editor.baseProfile }, baseLink: { ...editor.baseLink, series: editor.baseLink.series.map((item) => ({ ...item })) }, draft: { ...editor.draft } };
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
    catalog: { status: 'idle', search: '', page: 1, needsRefresh: false },
    claimHistory: { status: 'idle', sequence: 0, startedClaimIds: [] },
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
      if (!next.links.some(({ placementId }) => placementId === effect.link.placementId)) {
        next.links = [...next.links, { ...effect.link, series: effect.link.series.map((item) => ({ ...item })) }];
      }
      if (effect.resource && !next.editableResources.some(({ id }) => id === effect.resource?.id)) next.editableResources = [...next.editableResources, { ...effect.resource }];
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
      if (!next.claims.some(({ id }) => id === effect.claim.id)) next.claims = [...next.claims, { ...effect.claim, resourceIds: [...effect.claim.resourceIds], ...(effect.claim.resources ? { resources: effect.claim.resources.map((item) => ({ ...item })) } : {}) }];
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
  source: ReferenceCompletionSource,
  created?: boolean,
): CreatorOwnerReferenceCompletion {
  const submittedSelection = submitted.selected;
  const saved = submittedSelection && savedPlacement?.resourceId === submittedSelection.id
    && savedPlacement.url === submittedSelection.url ? savedPlacement : undefined;
  const sameSelection = Boolean(submittedSelection && current.selected
    && current.selected.id === submittedSelection.id && current.selected.url === submittedSelection.url);
  const keepFocusInPicker = source === 'adopted' ? { focusAfterRender: '#owner-catalog-search' } : {};

  if (!saved) {
    return { editor: { ...current, baseProfile: { ...profile } }, hasPendingIntent: true,
      message: 'No encontramos la referencia enviada en la página guardada. Conservamos la selección para una acción manual.',
      ...keepFocusInPicker };
  }

  if (sameSelection && current.selectedForDirectory !== submitted.selectedForDirectory) {
    return { editor: { kind: 'link-placement', key: `link:${saved.placementId}`, baseProfile: { ...profile },
      baseLink: { ...saved, series: saved.series.map((item) => ({ ...item })) }, editable: false,
      draft: { ...linkDraft(saved), selectedForDirectory: current.selectedForDirectory } },
    hasPendingIntent: true,
    message: 'La referencia enviada está en tu página. Conservamos el cambio de propuesta para que lo guardes en opciones.',
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
    return { ...editor, baseProfile: data.profile ? { ...data.profile } : editor.baseProfile, baseLink: { ...updated },
      draft: correction ? editor.draft : linkDraft(updated) };
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
    if (!correction) return undefined;
    if (editable) return { kind: 'link-placement', key: `link:${updated.placementId}`, baseProfile: data.profile ?? editor.baseProfile,
      baseLink: { ...updated }, editable: true, draft: { ...editor.draft } };
    return { ...editor, baseProfile: data.profile ?? editor.baseProfile };
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
    case 'link-placement': return JSON.stringify(editor.draft) !== JSON.stringify(linkDraft(editor.baseLink)) || Boolean(editor.sharedTextCorrection);
    case 'link-resource': return JSON.stringify(editor.draft) !== JSON.stringify(resourceDraft(editor.baseResource));
    case 'add-link': return Boolean(editor.draft.title.trim() || editor.draft.url.trim() || editor.draft.description.trim() || !editor.draft.selectedForDirectory);
    case 'move-link': return editor.targetPosition !== String(editor.baseOrder.indexOf(editor.baseLink.placementId) + 1);
    case 'reference': return Boolean(editor.selected) || !editor.selectedForDirectory;
    case 'claim': return editor.selected.length > 0 || Boolean(editor.knownUrls.trim() || editor.evidence.trim());
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

function sameEditor(left: CreatorOwnerEditor | CreatorOwnerLinkEditor, right: CreatorOwnerEditor | CreatorOwnerLinkEditor): boolean {
  if (left.key !== right.key || left.kind !== right.kind) return false;
  if (left.kind === 'photo' && right.kind === 'photo') return left.file === right.file && left.uploadId === right.uploadId;
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeLinksQuery(
  links: readonly CreatorLinkDTO[],
  series: readonly CreatorSeriesDTO[],
  query: CreatorOwnerLinksQuery,
): CreatorOwnerLinksQuery {
  const seriesExists = query.serie === 'todos' || series.some(({ id }) => id === query.serie);
  return selectCreatorOwnerLinks(links, series, seriesExists ? query : { ...query, serie: 'todos' }).query;
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
    case 'update-move-link-draft':
      return state.editor?.kind === 'move-link' ? { ...state, editor: { ...state.editor, targetPosition: action.targetPosition, suggestionPosition: undefined } } : state;
    case 'set-link-move-suggestion':
      return state.editor?.kind === 'move-link' ? { ...state, editor: { ...state.editor, suggestionPosition: action.targetPosition } } : state;
    case 'update-reference-draft':
      if (state.editor?.kind !== 'reference') return state;
      {
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
      const editor = conflictedReference && state.editor?.kind === 'reference'
        && state.editor.key === conflictedReference.editorKey
        ? { ...state.editor, selected: undefined } : state.editor;
      return { ...state, editor,
        catalog: { ...state.catalog, status: 'ready', entries: action.entries.map((item) => ({ ...item })), needsRefresh: false, message: action.message } };
    }
    case 'catalog-load-failed': return { ...state, catalog: { ...state.catalog, status: 'error', message: action.message } };
    case 'catalog-search': return { ...state, catalog: { ...state.catalog, search: action.value, page: 1 } };
    case 'catalog-page': return { ...state, catalog: { ...state.catalog, page: action.value } };
    case 'catalog-require-refresh': return { ...state, catalog: { ...state.catalog, needsRefresh: true, message: action.message } };
    case 'claim-history-started': return { ...state, claimHistory: { status: 'loading', sequence: action.sequence,
      startedClaimIds: state.observed.claims.map(({ id }) => id), message: 'Comprobando solicitudes…' } };
    case 'claim-history-ready': {
      if (state.claimHistory.sequence !== action.sequence) return state;
      const fetchedIds = new Set(action.claims.map(({ id }) => id));
      const startedIds = new Set(state.claimHistory.startedClaimIds);
      const addedWhileReading = state.observed.claims.filter(({ id }) => !startedIds.has(id) && !fetchedIds.has(id));
      const claims = [...action.claims, ...addedWhileReading];
      return { ...state, observed: { ...state.observed, claims: claims.map((claim) => ({ ...claim, resourceIds: [...claim.resourceIds], ...(claim.resources ? { resources: claim.resources.map((item) => ({ ...item })) } : {}) })) },
        claimHistory: { status: 'idle', sequence: action.sequence, startedClaimIds: [], message: action.message } };
    }
    case 'claim-history-failed': return state.claimHistory.sequence === action.sequence
      ? { ...state, claimHistory: { status: 'error', sequence: action.sequence, startedClaimIds: [], message: action.message } } : state;
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
      if (state.attempt.status === 'sending' || state.session.state !== 'ready') return state;
      if (state.attempt.status === 'checking') {
        const resubmittingClaimAfterHistoryCheck = state.attempt.intent.kind === 'claim' && action.intent.kind === 'claim'
          && state.attempt.intent.editorKey === action.intent.editorKey;
        if (!resubmittingClaimAfterHistoryCheck) return state;
      }
      return { ...state, attempt: { status: 'sending', intent: action.intent }, message: undefined };
    case 'write-uncertain': {
      const intent = currentAttempt(state, action.intentId);
      if (!intent) return state;
      return { ...state, attempt: { status: action.status, intent, message: action.message, ...(action.code ? { code: action.code } : {}) }, message: { text: action.message, kind: 'error' }, location: { ...state.location, transition: undefined, prompt: 'none' } };
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
      const referenceCapture = intent.kind === 'reference' && intent.capture.kind === 'reference' ? intent.capture : undefined;
      const referenceEditor = state.editor?.kind === 'reference' && state.editor.key === intent.editorKey ? state.editor : undefined;
      const referenceEffect = action.effect.kind === 'link-added' && action.effect.source === 'reference' ? action.effect : undefined;
      const referenceCompletion = referenceCapture && referenceEditor
        && referenceEffect?.profileId === referenceEditor.baseProfile.id && observed.profile
        ? completeReference(referenceCapture, referenceEditor,
          observed.links.find(({ placementId }) => placementId === referenceEffect.link.placementId) ?? referenceEffect.link,
          observed.profile, 'acknowledged', referenceEffect.created)
        : undefined;
      const editor = referenceCompletion
        ? referenceCompletion.editor : editorAfterEffect(state.editor, intent, action.effect, action.correction, observed);
      const linksQuery = selectCreatorOwnerLinks(observed.links, observed.series, state.location.linksQuery).query;
      const linkPlacementId = intent.kind === 'save-link' && intent.capture.kind === 'link-placement'
        ? intent.capture.baseLink.placementId : undefined;
      const updatedLinkNoLongerMatches = !action.correction && action.effect.kind === 'link-updated' && linkPlacementId !== undefined
        && !selectCreatorOwnerLinks(observed.links, observed.series, state.location.linksQuery).matches.some(({ placementId }) => placementId === linkPlacementId);
      const confirmationMessage = referenceCompletion?.message ?? (action.correction ? 'Cambios guardados. Conservamos la corrección que escribiste mientras se guardaba.'
        : updatedLinkNoLongerMatches ? 'Cambios guardados. El enlace ya no coincide con la búsqueda o los filtros actuales.'
        : action.effect.kind === 'link-added' && !action.effect.created ? 'Ese contenido ya estaba en tu página. No cambiamos su ficha, opciones, posición ni series.'
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
            prompt: 'none' as const } : action.correction ? { transition: undefined, prompt: 'none' as const } : {}),
          ...(action.effect.kind === 'link-removed' || action.effect.kind === 'link-added' || action.effect.kind === 'link-updated'
            ? { linksQuery, pendingLinksQuery: linksQuery } : {}),
          ...(referenceCompletion ? { focusAfterRender: referenceCompletion.focusAfterRender }
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
      const listOperation = ['publish', 'delete-series', 'chapter-add', 'chapter-remove', 'remove-link', 'reinclude-resource'].includes(state.attempt.intent.kind);
      const hasEditor = current !== undefined;
      if (!hasEditor && !listOperation) return state;
      if (comparison.draftAtCompare && current && !sameEditor(comparison.draftAtCompare, current)) {
        return { ...state, attempt: { ...state.attempt, comparison: undefined }, message: { text: 'Tus campos cambiaron después de la comparación. Vuelve a comprobar antes de adoptar.', kind: 'info' } };
      }
      const snapshot = copySnapshot(comparison.snapshot);
      if (!current && listOperation) {
        const query = selectCreatorOwnerSeries(snapshot.series, state.location.query).query;
        const seriesStillExists = Boolean(query.serie) && snapshot.series.some(({ id }) => id === query.serie);
        const currentLinksQuery = normalizeLinksQuery(snapshot.links, snapshot.series, state.location.linksQuery);
        const pendingLinksQuery = normalizeLinksQuery(snapshot.links, snapshot.series, state.location.pendingLinksQuery);
        const currentQuery = seriesStillExists
          ? selectCreatorOwnerChapters(snapshot, query).query
          : { ...query, serie: '', buscarCapitulos: '', pertenencia: 'todos' as const, paginaCapitulos: 1 };
        const focusAfterRender = state.location.view === 'enlaces'
          ? state.location.linksQueryError ? '#contenido' : '#owner-link-search'
          : state.location.view === 'series'
            ? state.seriesQueryError ? '#contenido' : seriesStillExists ? '#owner-chapter-search' : '#owner-series-title'
            : '#contenido';
        return {
          ...state,
          observed: snapshot,
          attempt: { status: 'confirmed', intentId: state.attempt.intent.id },
          message: { text: 'La lista guardada está actualizada. Revisa el resultado y decide si quieres iniciar otra acción.', kind: 'success' },
          location: { ...state.location,
            query: currentQuery,
            pendingChapterSearch: seriesStillExists ? state.location.pendingChapterSearch : '',
            pendingMembership: seriesStillExists ? state.location.pendingMembership : 'todos',
            linksQuery: currentLinksQuery, pendingLinksQuery,
            focusAfterRender },
        };
      }
      if (!current) return state;
      const selectedSeriesStillExists = snapshot.series.some(({ id }) => id === state.location.query.serie);
      const referenceCapture = state.attempt.intent.kind === 'reference' && state.attempt.intent.capture.kind === 'reference'
        ? state.attempt.intent.capture : undefined;
      const recoveredReference = comparison.recoveredLinkId
        ? snapshot.links.find(({ placementId }) => placementId === comparison.recoveredLinkId) : undefined;
      const referenceCompletion = current.kind === 'reference' && referenceCapture
        && snapshot.profile?.id === current.baseProfile.id
        ? completeReference(referenceCapture, current, recoveredReference, snapshot.profile, 'adopted')
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
        if (link) editor = { ...current, baseProfile: { ...snapshot.profile }, baseLink: { ...link }, draft: linkDraft(link), sharedTextCorrection: undefined,
          editable: snapshot.editableResources.some(({ id }) => id === link.resourceId) };
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
        const recovered = comparison.recoveredLinkId ? snapshot.links.find(({ placementId }) => placementId === comparison.recoveredLinkId)
          : undefined;
        if (!recovered) editor = { ...current, baseProfile: { ...snapshot.profile } };
        else {
          const sent = state.attempt.intent.capture.kind === 'add-link' ? state.attempt.intent.capture.draft : current.draft;
          const lateText = ['title', 'url', 'description'].some((key) => current.draft[key as 'title' | 'url' | 'description'] !== sent[key as 'title' | 'url' | 'description']);
          const lateOption = current.draft.selectedForDirectory !== sent.selectedForDirectory;
          const editable = snapshot.editableResources.some(({ id }) => id === recovered.resourceId);
          editor = { kind: 'link-placement', key: `link:${recovered.placementId}`, baseProfile: { ...snapshot.profile }, baseLink: { ...recovered }, editable,
            draft: { ...linkDraft(recovered),
              ...(editable && lateText ? { title: current.draft.title, url: current.draft.url, description: current.draft.description } : {}),
              ...(lateOption ? { selectedForDirectory: current.draft.selectedForDirectory } : {}) },
            ...(!editable && lateText ? { sharedTextCorrection: { title: current.draft.title, url: current.draft.url, description: current.draft.description } } : {}) };
        }
      }
      const adoptionMessage = referenceCompletion?.message ?? (current.kind === 'series' && !current.baseSeries && !comparison.seriesId
        ? 'Usaste la versión actual del perfil. No encontramos la serie original; conservamos el contenido para un nuevo intento manual.'
        : current.kind === 'series' ? 'Usaste las versiones guardadas como base. Conservamos toda tu corrección; pulsa Guardar para enviarla.'
          : current.kind === 'add-link' && !comparison.recoveredLinkId ? 'No encontramos la URL original en tu página. Usaste las versiones actuales como base; puedes volver a agregarla manualmente.'
            : current.kind === 'add-link' ? 'Encontramos la URL del intento original. Revisa el contenido guardado y las correcciones antes de continuar.'
              : current.kind === 'link-placement' || current.kind === 'link-resource' ? 'Usaste los datos guardados. Puedes iniciar otra corrección cuando quieras.'
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
          ...(referenceCompletion ? { transition: referenceCompletion.hasPendingIntent ? undefined : state.location.transition,
            prompt: 'none' as const } : {}),
          focusAfterRender: referenceCompletion ? referenceCompletion.focusAfterRender
            : current.kind === 'series' && !snapshot.series.some(({ id }) => id === current.baseSeries?.id) ? '#owner-series-title'
              : current.kind === 'link-placement' || current.kind === 'link-resource' || current.kind === 'move-link' || current.kind === 'add-link' ? '#owner-link-search' : undefined },
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
    case 'set-links-pending-query': return { ...state, location: { ...state.location, pendingLinksQuery: { ...state.location.pendingLinksQuery, ...action.query } } };
    case 'apply-links-query': return { ...state, location: { ...state.location, linksQueryError: undefined, linksQuery: { ...action.query }, pendingLinksQuery: { ...action.query }, focusAfterRender: action.focusSelector ?? '#owner-links-title' } };
    case 'set-series-query-error': return { ...state, seriesQueryError: action.reason };
    case 'set-links-query-error': return { ...state, location: { ...state.location, linksQueryError: action.reason } };
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

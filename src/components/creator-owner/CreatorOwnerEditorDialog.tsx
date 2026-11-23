import { useLayoutEffect, useRef } from 'preact/hooks';
import type { CreatorCatalogSelectionDTO, CreatorOwnerSnapshotDTO, CreatorProgram, CreatorSocial } from '../../types/creators';
import type { ResourceClassificationChange } from '../../lib/resource-form-policy.mjs';
import {
  CREATOR_FIELD_LIMITS,
  CREATOR_PHOTO_FORMATS,
  CREATOR_PHOTO_MAX_PIXELS,
  CREATOR_PHOTO_MAX_UPLOAD_BYTES,
  CREATOR_PHOTO_MIME_TYPES,
  CREATOR_PROGRAMS,
  CREATOR_SLUG_MIN_LENGTH,
  CREATOR_SLUG_PATTERN,
  CREATOR_SOCIALS,
} from '../../lib/creator-values.mjs';
import {
  creatorOwnerCanSubmitEditor,
  creatorOwnerClaimSelectionIsCurrent,
  creatorOwnerClaimSelectionNeedsRefresh,
  creatorOwnerLinkMoveContext,
  creatorOwnerMoveDestinationIsValid,
  creatorOwnerReferenceSubmissionStatus,
  deriveCreatorOwnerRecoveryAction,
  type CreatorOwnerEditorDraft,
  type CreatorOwnerClaimSelection,
  type CreatorOwnerLinkDraft,
  type CreatorOwnerRecoveryChoice,
  type CreatorOwnerReferenceCandidate,
  type CreatorOwnerState,
} from '../../lib/creator-owner-state';
import { creatorOwnerNavigationLists } from '../../lib/creator-owner-presentation';
import { isCreatorOwnerV3Resource } from '../../lib/creator-owner-data';
import ResourceClassificationFields from '../ResourceClassificationFields';
import ResourceMetadataFields from '../ResourceMetadataFields';
import { pageCreatorOwnerCatalog } from '../../lib/creator-owner-catalog';
import { usableCreatorOwnerFocusTarget } from '../../lib/creator-owner-focus';
import {
  nativeCreatorOwnerFieldMessage,
  type CreatorOwnerField,
  identityFieldDescribedBy,
  identityFieldErrorId,
  identityFieldHelpId,
  IdentityFieldError,
  useNativeFieldErrors,
  useNativeIdentityFieldErrors,
} from './CreatorOwnerIdentityFeedback';

interface Props {
  state: CreatorOwnerState;
  onUpdateProfile(value: { displayName?: string; slug?: string; city?: string; country?: string; bio?: string; programs?: CreatorProgram[] }): void;
  onUpdateSocial(key: CreatorSocial, value: string): void;
  onUpdateSeries(value: { name?: string; slug?: string; description?: string }, manuallyEditedSlug?: boolean): void;
  onUpdateMove(value: string): void;
  onUpdateLink(value: Partial<CreatorOwnerLinkDraft>): void;
  onUpdateAddLink(value: Partial<CreatorOwnerLinkDraft>): void;
  onClassificationChange(change: ResourceClassificationChange): void;
  onUpdateMoveLink(value: string): void;
  onUpdateReference(value: { selected?: CreatorOwnerReferenceCandidate; selectedForDirectory?: boolean }): void;
  onUpdateClaim(value: { selected?: Array<{ resourceId: string; url: string; title: string }>; knownUrls?: string; evidence?: string }): void;
  onCatalogSearch(value: string): void;
  onCatalogPage(value: number): void;
  onCatalogRetry(): void;
  onSetPhoto(file?: File): void;
  onSubmit(): void;
  onRequestClose(): void;
  onRetryRead(): void;
  onResolveRecovery(choice: CreatorOwnerRecoveryChoice): void;
  onSaveRecoveryDraft(): void;
  onExit(action: 'save' | 'discard' | 'continue'): void;
  onCheckSession(): void;
}

const PROGRAMS: readonly CreatorProgram[] = CREATOR_PROGRAMS;
const SOCIAL_LABELS: Record<CreatorSocial, string> = {
  instagram: 'Instagram',
  x: 'X',
  linkedin: 'LinkedIn',
  awsBuilder: 'AWS Builder Center',
  website: 'Sitio web o newsletter',
};
const SOCIALS = CREATOR_SOCIALS.map((key) => [key, SOCIAL_LABELS[key]] as const);

function inputLabel(value: string): string {
  return value || '—';
}

function contentFieldProps(field: CreatorOwnerField, error?: string, helpId?: string, focusError = error,
  additionalDescribedBy?: string) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': identityFieldDescribedBy('owner', field, Boolean(error), helpId, additionalDescribedBy),
    'data-owner-content-error-focus': focusError ? true : undefined,
  };
}

function referenceFeedback(state: CreatorOwnerState, status: ReturnType<typeof creatorOwnerReferenceSubmissionStatus>, feedback: string): string {
  if (state.catalog.status !== 'ready' || state.catalog.needsRefresh) return '';
  if (status === 'needs-selection') return 'Elige una ficha del catálogo para agregarla a tu página.';
  if (status === 'rejected') return 'La ficha seleccionada ya no está vigente. Actualiza el catálogo y elige otra.';
  if (status === 'refresh') return 'Actualiza el catálogo y vuelve a elegir una ficha vigente.';
  return feedback;
}

function comparisonSavedLabel(label: string): string {
  switch (label) {
    case 'Posición guardada': return label;
    case 'Nombre visible': return 'Nombre visible guardado';
    case 'Nombre': return 'Nombre guardado';
    case 'Dirección': return 'Dirección guardada';
    case 'Ciudad': return 'Ciudad guardada';
    case 'País': return 'País guardado';
    case 'Presentación': return 'Presentación guardada';
    case 'Programas': return 'Programas guardados';
    case 'Descripción': return 'Descripción guardada';
    case 'URL enviada': return 'URL enviada';
    default: return `${label} guardado`;
  }
}

function classificationComparisonRows(resource: CreatorOwnerSnapshotDTO['resources'][number], draft: { kind: string; format: string; topics: string[] }): Array<[string, string, string]> {
  if (!isCreatorOwnerV3Resource(resource)) return [];
  const saved = resource.classification.state === 'explicit' || resource.classification.state === 'legacy'
    ? resource.classification : undefined;
  return [
    ['Tipo de recurso', saved?.kind ?? 'Sin clasificar', draft.kind || 'Sin clasificar'],
    ['Formato', saved?.format ?? '—', draft.format || '—'],
    ['Temas', saved?.topics.join(', ') ?? '—', draft.topics.join(', ') || '—'],
  ];
}

function comparisonRows(editor: CreatorOwnerEditorDraft, snapshot: CreatorOwnerSnapshotDTO): Array<[string, string, string]> {
  if (editor.kind === 'profile' && editor.section === 'datos') {
    const saved = snapshot.profile;
    return [
      ['Nombre visible', saved?.displayName ?? 'No hay página guardada', editor.draft.displayName],
      ['Dirección', saved?.slug ?? '—', editor.draft.slug],
      ['Ciudad', saved?.city ?? '', editor.draft.city],
      ['País', saved?.country ?? '', editor.draft.country],
      ['Presentación', saved?.bio ?? '', editor.draft.bio],
      ['Programas', saved?.programs.join(', ') ?? '', editor.draft.programs.join(', ')],
    ];
  }
  if (editor.kind === 'profile' && editor.section === 'redes') {
    return SOCIALS.map(([key, label]) => [label, snapshot.profile?.socials[key] ?? '', editor.draft[key]]);
  }
  if (editor.kind === 'series') {
    const saved = editor.seriesId ? snapshot.series[editor.seriesId] : undefined;
    return [
      ['Nombre', saved?.name ?? 'No se encontró la serie', editor.draft.name],
      ['Dirección', saved?.slug ?? '—', editor.draft.slug],
      ['Descripción', saved?.description ?? '', editor.draft.description],
    ];
  }
  if (editor.kind === 'move-chapter') {
    const order = snapshot.series[editor.seriesId]?.chapters ?? [];
    const savedPosition = order.indexOf(editor.placementId) + 1;
    const seriesName = snapshot.series[editor.seriesId]?.name ?? 'esta serie';
    return [['Posición guardada', savedPosition > 0 ? `${savedPosition} de ${order.length}` : 'El capítulo ya no está en la serie', `${editor.targetPosition} en ${seriesName}`]];
  }
  if (editor.kind === 'link-placement') {
    const placement = snapshot.placements[editor.placementId];
    const resource = placement ? snapshot.resources.find(({ id }) => id === placement.resourceId) : undefined;
    if (!placement || !resource) {
      return [
        ['Enlace', 'Ya no está en tu página', editor.draft.title],
        ['URL', '—', editor.draft.url],
        ['Descripción', '—', editor.draft.description],
      ];
    }
    return [
      ['Título', resource.title, editor.editable ? editor.draft.title : 'Ficha compartida'],
      ['URL', resource.url, editor.editable ? editor.draft.url : 'Ficha compartida'],
      ['Descripción', resource.description ?? '', editor.editable ? editor.draft.description : 'Ficha compartida'],
      ...(editor.editable ? classificationComparisonRows(resource, editor.draft) : []),
      ['Destacado', snapshot.order.featured.includes(editor.placementId) ? 'Sí' : 'No', editor.draft.featured ? 'Sí' : 'No'],
      ['Propuesta al directorio', placement.selectedForDirectory ? 'Sí' : 'No', editor.draft.selectedForDirectory ? 'Sí' : 'No'],
    ];
  }
  if (editor.kind === 'link-resource') {
    const saved = snapshot.resources.find(({ id }) => id === editor.resourceId);
    return [
      ['Título', saved?.title ?? 'Ficha ya no disponible', editor.draft.title],
      ['URL', saved?.url ?? '—', editor.draft.url],
      ['Descripción', saved?.description ?? '', editor.draft.description],
      ...(saved ? classificationComparisonRows(saved, editor.draft) : []),
    ];
  }
  if (editor.kind === 'move-link') {
    const display = creatorOwnerNavigationLists(snapshot);
    const position = creatorOwnerLinkMoveContext(snapshot, editor.placementId);
    const saved = display.links.find(({ placementId }) => placementId === editor.placementId);
    return [['Posición guardada', position ? `${position.position} de ${position.count}` : 'El enlace ya no está en la página', editor.targetPosition],
      ...(saved ? [['Enlace', saved.title, saved.title] as [string, string, string]] : [])];
  }
  if (editor.kind === 'add-link') return [['URL enviada', editor.draft.url, editor.draft.url]];
  if (editor.kind === 'reference') {
    const selected = editor.selected;
    return [['Referencia seleccionada', selected ? `${selected.title} · ${selected.url}` : 'Sin selección',
      selected ? `${selected.title} · ${selected.url}` : 'Sin selección']];
  }
  if (editor.kind === 'claim') {
    return [['Contenido seleccionado', editor.selected.map(({ title, url }) => `${title} · ${url}`).join(' | ') || 'Sin selección',
      editor.selected.map(({ title, url }) => `${title} · ${url}`).join(' | ') || 'Sin selección'],
    ['URLs conocidas', 'No se pueden usar para identificar esta solicitud', editor.knownUrls],
    ['Contexto privado', 'No se puede confirmar por similitud', editor.evidence]];
  }
  if (editor.kind === 'photo') {
    const photo = snapshot.profile?.photo;
    return [['Foto guardada', photo ? `Versión ${photo.version}` : 'Sin foto guardada', editor.file?.name ?? 'Sin archivo seleccionado']];
  }
  return [];
}

function ComparisonRows({ rows }: { rows: Array<[string, string, string]> }) {
  return <dl>{rows.map(([label, saved, local]) => <div key={label}>
    <dt>{label}</dt><dd>{comparisonSavedLabel(label)}: {inputLabel(saved)} | Tu borrador: {inputLabel(local)}</dd>
  </div>)}</dl>;
}

function operationMatchesEditor(state: CreatorOwnerState, editor: CreatorOwnerEditorDraft): boolean {
  const operation = state.operation;
  return operation.status !== 'idle' && 'intent' in operation && operation.intent?.editorKey === editor.key;
}

export default function CreatorOwnerEditorDialog({
  state, onUpdateProfile, onUpdateSocial, onUpdateSeries, onUpdateMove, onUpdateLink, onUpdateAddLink,
  onClassificationChange,
  onUpdateMoveLink, onUpdateReference, onUpdateClaim, onCatalogSearch, onCatalogPage, onCatalogRetry,
  onSetPhoto, onSubmit, onRequestClose, onRetryRead, onResolveRecovery, onSaveRecoveryDraft, onExit, onCheckSession,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const wasExitPromptOpen = useRef(false);
  const editor = state.editor;
  const nativeIdentity = useNativeIdentityFieldErrors(editor?.key);
  const nativeContent = useNativeFieldErrors<CreatorOwnerField>(editor?.key, nativeCreatorOwnerFieldMessage);
  const editorIsDialog = Boolean(editor && editor.kind !== 'create-profile');
  const prompt = state.location.prompt === 'exit';
  const inlineCreatePrompt = prompt && editor?.kind === 'create-profile';
  const shouldOpenDialog = editorIsDialog || prompt && !inlineCreatePrompt;
  const operation = state.operation;
  const locked = operation.status !== 'idle';
  const matches = Boolean(editor && operationMatchesEditor(state, editor));
  const canSubmit = creatorOwnerCanSubmitEditor(state);
  const recoverablePhotoConflict = editor?.kind === 'photo' && operation.status === 'conflict'
    && !operation.intent.targetMissing && (operation.intent.action === 'photo-authorize' || operation.intent.action === 'photo-finalize');
  const canSubmitAfterConflict = editor && operation.status === 'conflict' && !operation.intent.targetMissing
    && !(state.catalog.needsRefresh && operation.intent.action === 'create-claim')
    && (editor.kind !== 'photo' || recoverablePhotoConflict)
    && creatorOwnerMoveDestinationIsValid(editor, state.observed)
    ? creatorOwnerCanSubmitEditor({ ...state, operation: { status: 'idle' } })
    : false;
  const rows = editor && matches ? comparisonRows(editor, state.observed) : [];
  const title = !editor ? 'Tu página'
    : editor.kind === 'create-profile' ? 'Prepara tu página'
      : editor.kind === 'profile' ? editor.section === 'datos' ? 'Editar datos' : 'Editar redes'
        : editor.kind === 'photo' ? 'Editar foto'
          : editor.kind === 'series' ? editor.seriesId ? 'Editar serie' : 'Crear serie'
            : editor.kind === 'move-chapter' ? 'Mover capítulo'
              : editor.kind === 'link-placement' ? editor.editable ? 'Editar ficha' : 'Editar opciones'
                : editor.kind === 'link-resource' ? 'Editar contenido retirado'
                  : editor.kind === 'add-link' ? 'Agregar enlace'
                    : editor.kind === 'move-link' ? 'Mover enlace'
                      : editor.kind === 'reference' ? 'Buscar en el catálogo' : 'Solicitar edición';
  const comparisonReady = operation.status === 'unknown' || operation.status === 'conflict'
    ? operation.readCompleted === true : false;
  const comparison = editor && rows.length > 0 && comparisonReady
    ? rows : undefined;
  const editorFeedback = editor && state.editorFeedback?.editorKey === editor.key ? state.editorFeedback : undefined;
  const editorFieldErrors = { ...nativeIdentity.errors, ...nativeContent.errors, ...(editorFeedback?.fieldErrors ?? {}) };
  const contentFieldErrors = editorFieldErrors as Partial<Record<CreatorOwnerField, string>>;
  const contentError = (field: CreatorOwnerField): string | undefined => contentFieldErrors[field];
  const resourceForEditor = editor?.kind === 'link-placement'
    ? (() => { const placement = state.observed.placements[editor.placementId]; return placement ? state.observed.resources.find(({ id }) => id === placement.resourceId) : undefined; })()
    : editor?.kind === 'link-resource' ? state.observed.resources.find(({ id }) => id === editor.resourceId) : undefined;
  const showClassification = editor?.kind === 'add-link'
    || Boolean(resourceForEditor && isCreatorOwnerV3Resource(resourceForEditor) && resourceForEditor.classification.state !== 'event');
  const classificationEditable = editor?.kind === 'add-link'
    || Boolean(resourceForEditor && isCreatorOwnerV3Resource(resourceForEditor) && resourceForEditor.classificationEditable);
  const classificationErrors = {
    kind: contentError('kind') ?? nativeContent.errors.kind, format: contentError('format') ?? nativeContent.errors.format,
    kindFormat: contentError('kind-format') ?? nativeContent.errors['kind-format'], topics: contentError('topics') ?? nativeContent.errors.topics,
  };
  const editorHasFieldErrors = Object.values(editorFieldErrors).some(Boolean);
  const photoError = editorFieldErrors.photo;
  const photoHelpId = identityFieldHelpId('owner', 'photo');
  const claimDestinationsErrorId = identityFieldErrorId('owner', 'destinations');
  const claimDestinationsError = contentError('destinations');

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const continuingExitPrompt = dialog.open && wasExitPromptOpen.current;
    wasExitPromptOpen.current = shouldOpenDialog && prompt;
    if (shouldOpenDialog) {
      if (!dialog.open) dialog.showModal();
      if (prompt) {
        const active = document.activeElement;
        if (continuingExitPrompt && active instanceof HTMLElement && dialog.contains(active)
          && usableCreatorOwnerFocusTarget(active)) return;
        const requestedFocus = state.location.focusAfterRender;
        if (!requestedFocus || !dialog.querySelector<HTMLElement>(requestedFocus)) {
          const selector = !editor && operation.status === 'idle' ? '[data-owner-exit-discard]'
            : '[data-owner-exit-save]:enabled, [data-owner-exit-continue]';
          dialog.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
        }
      }
      else if (editorIsDialog) {
        const selector = editor?.kind === 'photo' ? 'input[type="file"]'
          : editor?.kind === 'link-placement' && !editor.editable ? '#owner-link-directory-option'
            : 'input:not([type="hidden"]), textarea';
        dialog.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
      }
    } else if (dialog.open) dialog.close();
  }, [shouldOpenDialog, editorIsDialog ? editor?.key : undefined, prompt, prompt && !editor && operation.status === 'idle']);

  const editorSubmit = (event: SubmitEvent) => { event.preventDefault(); onSubmit(); };
  const feedback = editorFeedback
    ? editorHasFieldErrors ? '' : editorFeedback.text ?? ''
    : matches
      ? operation.status === 'sending'
        ? 'Guardando la acción iniciada. Espera a que termine antes de salir.'
        : ''
      : state.message?.text ?? '';
  const feedbackIsError = Boolean(editorFeedback?.text || !matches && state.message?.kind === 'error');
  const referenceStatus = editor?.kind === 'reference' ? creatorOwnerReferenceSubmissionStatus(state, editor.selected) : 'ready';
  const referenceStatusMessage = referenceFeedback(state, referenceStatus, feedback);
  const moveChapterSequence = editor?.kind === 'move-chapter' ? state.observed.series[editor.seriesId]?.chapters ?? [] : [];
  const moveChapterContext = editor?.kind === 'move-chapter'
    ? (() => {
      const placement = state.observed.placements[editor.placementId];
      const resource = placement && state.observed.resources.find(({ id }) => id === placement.resourceId);
      return `En «${state.observed.series[editor.seriesId]?.name ?? 'esta serie'}», «${resource?.title ?? 'Capítulo'}» ocupa la posición actual ${moveChapterSequence.indexOf(editor.placementId) + 1} de ${moveChapterSequence.length}.`;
    })()
    : '';
  const sessionRecovery = state.session.state !== 'ready' && <section class="creator-owner__status" data-session-recovery-shell>
    <p data-session-recovery-status role="status" aria-live="polite">{state.session.message}</p>
    {(state.session.state === 'recovery-required' || state.session.state === 'checking') && <>
      <a class="button button--outline" data-session-recovery-sign-in href="/cuenta/ingresar/" target="_blank" rel="noopener noreferrer">Ingresar en otra pestaña</a>
      <button class="button button--outline" type="button" data-session-recovery-check disabled={state.session.state === 'checking'} onClick={onCheckSession}>Comprobar sesión</button>
    </>}
    {state.session.state === 'blocked' && <a class="button button--outline" data-session-recovery-sign-in href="/cuenta/ingresar/" target="_blank" rel="noopener noreferrer">Ingresar en otra pestaña</a>}
  </section>;

  return <dialog class="creator-owner__dialog" data-owner-dialog data-owner-operation={operation.status} ref={dialogRef}
    aria-labelledby="creator-owner-dialog-title" onCancel={(event) => { event.preventDefault(); onRequestClose(); }}>
    <div class="creator-owner__dialog-panel">
      <header class="creator-owner__dialog-heading">
        <div><p class="creator-owner__eyebrow">Tu página</p><h2 id="creator-owner-dialog-title" data-owner-dialog-title>{title}</h2></div>
        <button class="creator-owner__close" type="button" data-owner-close aria-label="Cerrar edición" onClick={onRequestClose}>×</button>
      </header>

      {!editor && prompt && sessionRecovery}

      {editorIsDialog && editor?.kind === 'profile' && editor.section === 'datos' && <form class="creator-owner__form" data-owner-form="datos" onSubmit={editorSubmit}>
        {sessionRecovery}
        <div class={`creator-owner__field${editorFieldErrors.displayName ? ' creator-owner__field--invalid' : ''}`} data-owner-identity-field="displayName"><label htmlFor="owner-display-name">Nombre visible</label><input id="owner-display-name" name="displayName" value={editor.draft.displayName} autoComplete="name" maxLength={CREATOR_FIELD_LIMITS.displayName} required readOnly={locked}
          data-owner-identity-field="displayName" aria-invalid={editorFieldErrors.displayName ? 'true' : undefined}
          aria-describedby={identityFieldDescribedBy('owner', 'displayName', Boolean(editorFieldErrors.displayName))}
          onInvalid={(event) => nativeIdentity.onInvalid('displayName', event.currentTarget as HTMLInputElement, event)}
          onInput={(event) => { const input = event.currentTarget as HTMLInputElement; nativeIdentity.onInput('displayName'); onUpdateProfile({ displayName: input.value }); }} /><IdentityFieldError id={identityFieldErrorId('owner', 'displayName')} text={editorFieldErrors.displayName} /></div>
        <div class={`creator-owner__field${editorFieldErrors.slug ? ' creator-owner__field--invalid' : ''}`} data-owner-identity-field="slug"><label htmlFor="owner-slug">Dirección de tu página</label>
          <div class="creator-owner__slug-field"><span aria-hidden="true">/c/</span><input id="owner-slug" name="slug" value={editor.draft.slug} required minLength={CREATOR_SLUG_MIN_LENGTH} maxLength={CREATOR_FIELD_LIMITS.slug}
            pattern={CREATOR_SLUG_PATTERN} autoComplete="off" autoCapitalize="none" spellcheck={false} readOnly={locked}
            data-owner-identity-field="slug" aria-invalid={editorFieldErrors.slug ? 'true' : undefined}
            aria-describedby={identityFieldDescribedBy('owner', 'slug', Boolean(editorFieldErrors.slug))}
            onInvalid={(event) => nativeIdentity.onInvalid('slug', event.currentTarget as HTMLInputElement, event)}
            onInput={(event) => { const input = event.currentTarget as HTMLInputElement; nativeIdentity.onInput('slug'); onUpdateProfile({ slug: input.value }); }} /></div>
          <IdentityFieldError id={identityFieldErrorId('owner', 'slug')} text={editorFieldErrors.slug} />
          <small id={identityFieldHelpId('owner', 'slug')}>3–40 caracteres: minúsculas, números y guiones sencillos. Cambiarla conserva la dirección anterior como alias.</small>
        </div>
        <div class={`creator-owner__field${editorFieldErrors.city ? ' creator-owner__field--invalid' : ''}`} data-owner-identity-field="city"><label htmlFor="owner-city">Ciudad <span>(opcional)</span></label><input id="owner-city" name="city" value={editor.draft.city} autoComplete="address-level2" maxLength={CREATOR_FIELD_LIMITS.city} readOnly={locked}
          data-owner-identity-field="city" aria-invalid={editorFieldErrors.city ? 'true' : undefined} aria-describedby={identityFieldDescribedBy('owner', 'city', Boolean(editorFieldErrors.city))}
          onInvalid={(event) => nativeIdentity.onInvalid('city', event.currentTarget as HTMLInputElement, event)}
          onInput={(event) => { const input = event.currentTarget as HTMLInputElement; nativeIdentity.onInput('city'); onUpdateProfile({ city: input.value }); }} /><IdentityFieldError id={identityFieldErrorId('owner', 'city')} text={editorFieldErrors.city} /></div>
        <div class={`creator-owner__field${editorFieldErrors.country ? ' creator-owner__field--invalid' : ''}`} data-owner-identity-field="country"><label htmlFor="owner-country">País <span>(opcional)</span></label><input id="owner-country" name="country" value={editor.draft.country} autoComplete="country-name" maxLength={CREATOR_FIELD_LIMITS.country} readOnly={locked}
          data-owner-identity-field="country" aria-invalid={editorFieldErrors.country ? 'true' : undefined} aria-describedby={identityFieldDescribedBy('owner', 'country', Boolean(editorFieldErrors.country))}
          onInvalid={(event) => nativeIdentity.onInvalid('country', event.currentTarget as HTMLInputElement, event)}
          onInput={(event) => { const input = event.currentTarget as HTMLInputElement; nativeIdentity.onInput('country'); onUpdateProfile({ country: input.value }); }} /><IdentityFieldError id={identityFieldErrorId('owner', 'country')} text={editorFieldErrors.country} /></div>
        <fieldset class={`creator-owner__field creator-owner__programs${editorFieldErrors.programs ? ' creator-owner__field--invalid' : ''}`} data-owner-identity-field="programs" aria-invalid={editorFieldErrors.programs ? 'true' : undefined} aria-describedby={identityFieldDescribedBy('owner', 'programs', Boolean(editorFieldErrors.programs))} disabled={locked}><legend>Programas de AWS <span>(opcional)</span></legend>
          {PROGRAMS.map((program) => <label htmlFor={`owner-program-${program.toLowerCase().replaceAll(' ', '-')}`} key={program}>
            <input id={`owner-program-${program.toLowerCase().replaceAll(' ', '-')}`} type="checkbox" name="programs" value={program} checked={editor.draft.programs.includes(program)}
              aria-describedby={identityFieldDescribedBy('owner', 'programs', Boolean(editorFieldErrors.programs))}
              onChange={(event) => { nativeIdentity.onInput('programs'); onUpdateProfile({ programs: event.currentTarget.checked ? [...editor.draft.programs, program] : editor.draft.programs.filter((item) => item !== program) }); }} /><span>{program}</span>
          </label>)}
          <IdentityFieldError id={identityFieldErrorId('owner', 'programs')} text={editorFieldErrors.programs} />
        </fieldset>
        <div class={`creator-owner__field${editorFieldErrors.bio ? ' creator-owner__field--invalid' : ''}`} data-owner-identity-field="bio"><label htmlFor="owner-bio">Sobre ti <span>(opcional)</span></label><textarea id="owner-bio" name="bio" rows={5} maxLength={CREATOR_FIELD_LIMITS.bio} value={editor.draft.bio} readOnly={locked}
          data-owner-identity-field="bio" aria-invalid={editorFieldErrors.bio ? 'true' : undefined} aria-describedby={identityFieldDescribedBy('owner', 'bio', Boolean(editorFieldErrors.bio))}
          onInvalid={(event) => nativeIdentity.onInvalid('bio', event.currentTarget as HTMLTextAreaElement, event)}
          onInput={(event) => { const input = event.currentTarget as HTMLTextAreaElement; nativeIdentity.onInput('bio'); onUpdateProfile({ bio: input.value }); }} /><small id={identityFieldHelpId('owner', 'bio')}>Hasta {CREATOR_FIELD_LIMITS.bio} caracteres.</small><IdentityFieldError id={identityFieldErrorId('owner', 'bio')} text={editorFieldErrors.bio} /></div>
        {feedback && <p class="creator-owner__status" data-owner-form-status="datos" role={editorFeedback?.text || state.message?.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback}</p>}
        {matches && <OperationFeedback state={state} rows={comparison} canSaveDraft={Boolean(canSubmitAfterConflict)} onRetryRead={onRetryRead} onResolve={onResolveRecovery} onSaveDraft={onSaveRecoveryDraft} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canSubmit}>Guardar datos</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor?.kind === 'profile' && editor.section === 'redes' && <form class="creator-owner__form" data-owner-form="redes" onSubmit={editorSubmit}>
        {sessionRecovery}
        <p id="owner-social-help">Las direcciones deben ser URL HTTP o HTTPS completas. Deja un campo vacío para quitar esa red.</p>
        {SOCIALS.map(([key, label]) => {
          const field = `socials.${key}` as const;
          const error = editorFieldErrors[field];
          return <div class={`creator-owner__field${error ? ' creator-owner__field--invalid' : ''}`} key={key}>
            <label htmlFor={`owner-social-${key}`}>{label}</label>
            <input id={`owner-social-${key}`} name={`social-${key}`} type="url" inputMode="url" autoComplete="url" placeholder="https://" maxLength={CREATOR_FIELD_LIMITS.social} value={editor.draft[key]} readOnly={locked}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={identityFieldDescribedBy('owner', field, Boolean(error), 'owner-social-help')}
              onInput={(event) => { const input = event.currentTarget as HTMLInputElement; input.setCustomValidity(''); nativeIdentity.onInput(field); onUpdateSocial(key, input.value); }}
              onInvalid={(event) => nativeIdentity.onInvalid(field, event.currentTarget as HTMLInputElement, event)} />
            <IdentityFieldError id={identityFieldErrorId('owner', field)} text={error} />
          </div>;
        })}
        {feedback && <p class={`creator-owner__status${feedbackIsError ? ' creator-owner__status--error' : ''}`} data-owner-form-status="redes" role={feedbackIsError ? 'alert' : 'status'}>{feedback}</p>}
        {matches && <OperationFeedback state={state} rows={comparison} canSaveDraft={Boolean(canSubmitAfterConflict)} onRetryRead={onRetryRead} onResolve={onResolveRecovery} onSaveDraft={onSaveRecoveryDraft} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canSubmit}>Guardar redes</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor?.kind === 'photo' && <form class="creator-owner__form" data-owner-form="foto" onSubmit={editorSubmit}>
        {sessionRecovery}
        <p id={photoHelpId}>{CREATOR_PHOTO_FORMATS.map((format) => format.toUpperCase()).join(', ')}; hasta {CREATOR_PHOTO_MAX_UPLOAD_BYTES / (1024 * 1024)} MiB y {CREATOR_PHOTO_MAX_PIXELS / 1_000_000} megapíxeles. La foto se guarda sólo cuando termina la carga.</p>
        {state.observed.profile?.photo && <img class="creator-owner__photo creator-owner__photo--preview" src={`/media/fotos/${encodeURIComponent(state.observed.profile.id)}/${encodeURIComponent(String(state.observed.profile.photo.version))}.webp`} alt="Foto actual del perfil" width={112} height={112} data-owner-photo-preview />}
        <div class={`creator-owner__field${photoError ? ' creator-owner__field--invalid' : ''}`}>
          <label htmlFor="owner-photo-file">Elegir una foto</label>
          <input id="owner-photo-file" name="photo" type="file" accept={CREATOR_PHOTO_MIME_TYPES.join(',')} required disabled={locked} data-busy-control
            aria-invalid={photoError ? 'true' : undefined} aria-describedby={identityFieldDescribedBy('owner', 'photo', Boolean(photoError), photoHelpId)}
            onInvalid={(event) => nativeIdentity.onInvalid('photo', event.currentTarget as HTMLInputElement, event)}
            onChange={(event) => { const input = event.currentTarget as HTMLInputElement; input.setCustomValidity(''); nativeIdentity.onInput('photo'); onSetPhoto(input.files?.[0]); }} />
          <IdentityFieldError id={identityFieldErrorId('owner', 'photo')} text={photoError} />
        </div>
        {feedback && <p class={`creator-owner__status${feedbackIsError ? ' creator-owner__status--error' : ''}`} data-owner-form-status="foto" role={feedbackIsError ? 'alert' : 'status'}>{feedback}</p>}
        {matches && <OperationFeedback state={state} rows={comparison} canSaveDraft={Boolean(canSubmitAfterConflict)} onRetryRead={onRetryRead} onResolve={onResolveRecovery} onSaveDraft={onSaveRecoveryDraft} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canSubmit}>Subir y guardar foto</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor?.kind === 'series' && <form class="creator-owner__form" data-owner-form="serie" data-series-form onSubmit={editorSubmit}>
        {sessionRecovery}
        <p class="creator-owner__form-context">{editor.seriesId ? `Editas «${state.observed.series[editor.seriesId]?.name ?? 'esta serie'}».` : 'La serie será pública cuando tu página esté publicada y visible y tenga al menos un capítulo visible.'}</p>
        <div class={`creator-owner__field${contentError('name') ? ' creator-owner__field--invalid' : ''}`}><label htmlFor="owner-series-name">Nombre de la serie</label><input id="owner-series-name" name="name" value={editor.draft.name} maxLength={CREATOR_FIELD_LIMITS.name} required data-series-name-suggestion readOnly={locked}
          {...contentFieldProps('name', contentError('name'))}
          onInvalid={(event) => nativeContent.onInvalid('name', event.currentTarget as HTMLInputElement, event)}
          onInput={(event) => { nativeContent.onInput('name'); onUpdateSeries({ name: (event.currentTarget as HTMLInputElement).value }); }} /><IdentityFieldError id={identityFieldErrorId('owner', 'name')} text={contentError('name')} /></div>
        <div class={`creator-owner__field${contentError('slug') ? ' creator-owner__field--invalid' : ''}`}><label htmlFor="owner-series-slug">Dirección de la serie</label>
          <div class="creator-owner__slug-field"><span aria-hidden="true">/series/</span><input id="owner-series-slug" name="slug" value={editor.draft.slug} required minLength={CREATOR_SLUG_MIN_LENGTH} maxLength={CREATOR_FIELD_LIMITS.slug}
            pattern={CREATOR_SLUG_PATTERN} autoComplete="off" autoCapitalize="none" spellcheck={false} data-series-slug-suggestion readOnly={locked}
            {...contentFieldProps('slug', contentError('slug'), 'owner-series-slug-help')}
            onInvalid={(event) => nativeContent.onInvalid('slug', event.currentTarget as HTMLInputElement, event)}
            onInput={(event) => { nativeContent.onInput('slug'); onUpdateSeries({ slug: (event.currentTarget as HTMLInputElement).value }, true); }} /></div>
          <small id="owner-series-slug-help">3–40 caracteres: minúsculas, números y guiones sencillos.</small>
          <IdentityFieldError id={identityFieldErrorId('owner', 'slug')} text={contentError('slug')} />
        </div>
        <div class={`creator-owner__field${contentError('description') ? ' creator-owner__field--invalid' : ''}`}><label htmlFor="owner-series-description">Descripción <span>(opcional)</span></label><textarea id="owner-series-description" name="description" rows={4} maxLength={CREATOR_FIELD_LIMITS.description} value={editor.draft.description} readOnly={locked}
          {...contentFieldProps('description', contentError('description'))}
          onInvalid={(event) => nativeContent.onInvalid('description', event.currentTarget as HTMLTextAreaElement, event)}
          onInput={(event) => { nativeContent.onInput('description'); onUpdateSeries({ description: (event.currentTarget as HTMLTextAreaElement).value }); }} /><IdentityFieldError id={identityFieldErrorId('owner', 'description')} text={contentError('description')} /></div>
        {feedback && <p class={`creator-owner__status${feedbackIsError ? ' creator-owner__status--error' : ''}`} data-owner-form-status="serie" role={feedbackIsError ? 'alert' : 'status'} aria-live="polite">{feedback}</p>}
        {matches && <OperationFeedback state={state} rows={comparison} canSaveDraft={Boolean(canSubmitAfterConflict)} onRetryRead={onRetryRead} onResolve={onResolveRecovery} onSaveDraft={onSaveRecoveryDraft} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canSubmit}>Guardar serie</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor?.kind === 'move-chapter' && <form class="creator-owner__form" data-owner-form="mover-capitulo" data-chapter-move-form aria-label="Mover capítulo en la serie" onSubmit={editorSubmit}>
        {sessionRecovery}
        <p id="owner-chapter-move-context" class="creator-owner__move-context" data-chapter-move-context aria-live="polite">{moveChapterContext}</p>
        <div class={`creator-owner__field${contentError('position') ? ' creator-owner__field--invalid' : ''}`}><label htmlFor="owner-chapter-target-position">Posición en esta serie</label><input id="owner-chapter-target-position" name="targetPosition" type="number" min={1} max={Math.max(1, moveChapterSequence.length)} step={1} required inputMode="numeric" {...contentFieldProps('position', contentError('position'))} aria-describedby={`owner-chapter-move-context${contentError('position') ? ` ${identityFieldErrorId('owner', 'position')}` : ''}`} value={editor.targetPosition} readOnly={locked}
          onInvalid={(event) => nativeContent.onInvalid('position', event.currentTarget as HTMLInputElement, event)}
          onInput={(event) => { nativeContent.onInput('position'); onUpdateMove((event.currentTarget as HTMLInputElement).value); }} /><IdentityFieldError id={identityFieldErrorId('owner', 'position')} text={contentError('position')} /></div>
        {feedback && <p class={`creator-owner__status${feedbackIsError ? ' creator-owner__status--error' : ''}`} data-owner-form-status="mover-capitulo" role={feedbackIsError ? 'alert' : 'status'} aria-live="polite">{feedback}</p>}
        {matches && <OperationFeedback state={state} rows={comparison} canSaveDraft={Boolean(canSubmitAfterConflict)} onRetryRead={onRetryRead} onResolve={onResolveRecovery} onSaveDraft={onSaveRecoveryDraft} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canSubmit}>Guardar posición</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor?.kind === 'link-placement' && <form class="creator-owner__form" data-owner-form="enlace" data-link-edit-form onSubmit={editorSubmit}>
        {sessionRecovery}
        <p class="creator-owner__form-context">{editor.editable ? 'Esta ficha es tuya: los cambios del contenido y las opciones de la página se guardan juntos.'
            : 'Esta ficha es compartida. Puedes editar sus opciones; su título, URL y descripción siguen a cargo de quien la administra.'}</p>
        <fieldset class="creator-owner__field creator-owner__link-fields" data-link-metadata-fields>
          <legend>Ficha del contenido</legend>
          {editor.editable && <details class="creator-owner__link-help"><summary>Sobre esta ficha</summary><p>El título, la URL y la descripción también se muestran a quienes referencian esta ficha.</p></details>}
          <ResourceMetadataFields idPrefix="owner-link" values={editor.draft} policy="owner"
            errors={{ title: editor.editable ? contentError('title') : undefined, url: editor.editable ? contentError('url') : undefined, description: editor.editable ? contentError('description') : undefined }}
            readOnly={locked || !editor.editable} hookPrefix="owner" titleId="owner-link-title" urlId="owner-link-url" descriptionId="owner-link-description"
            onInput={(field) => nativeContent.onInput(field)}
            onInvalid={(field, event) => nativeContent.onInvalid(field, event.currentTarget as HTMLInputElement, event)}
            onChange={(field, value) => onUpdateLink({ [field]: value })} />
        </fieldset>
        {showClassification && <ResourceClassificationFields idPrefix="owner-link" value={editor.draft} errors={classificationErrors}
          disabled={locked || !classificationEditable} required={Boolean(editor.draft.kind || editor.draft.format || editor.draft.topics.length)}
          hookPrefix="owner"
          onKindChange={(value) => { nativeContent.onInput('kind'); nativeContent.onInput('format'); onClassificationChange({ type: 'kind', value }); }}
          onFormatChange={(value) => { nativeContent.onInput('format'); onClassificationChange({ type: 'format', value }); }}
          onKindInvalid={(event) => nativeContent.onInvalid('kind', event.target as HTMLInputElement, event)}
          onFormatInvalid={(event) => nativeContent.onInvalid('format', event.target as HTMLInputElement, event)}
          onTopicChange={(value, checked) => { nativeContent.onInput('topics'); onClassificationChange({ type: 'topic', value, checked }); }} />}
        <fieldset class="creator-owner__field creator-owner__link-fields" data-link-options disabled={locked}>
          <legend>Opciones de tu página</legend>
          <label class="creator-owner__link-checkbox"><input type="checkbox" name="featured" checked={editor.draft.featured} onChange={(event) => onUpdateLink({ featured: event.currentTarget.checked })} /><span>Destacar en tu página</span></label>
          <label class="creator-owner__link-checkbox"><input id="owner-link-directory-option" type="checkbox" name="selectedForDirectory" checked={editor.draft.selectedForDirectory} onChange={(event) => onUpdateLink({ selectedForDirectory: event.currentTarget.checked })} /><span>Proponer al directorio</span></label>
          <details class="creator-owner__link-help"><summary>Sobre el directorio</summary><p>La propuesta requiere aprobación. Quitarla no quita el enlace de tu página; la actualización del directorio puede demorar.</p></details>
        </fieldset>
        {feedback && <p class={`creator-owner__status${feedbackIsError ? ' creator-owner__status--error' : ''}`} data-owner-form-status="enlace" role={feedbackIsError ? 'alert' : 'status'} aria-live="polite">{feedback}</p>}
        {matches && <OperationFeedback state={state} rows={comparison} canSaveDraft={Boolean(canSubmitAfterConflict)} onRetryRead={onRetryRead} onResolve={onResolveRecovery} onSaveDraft={onSaveRecoveryDraft} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canSubmit}>Guardar cambios</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor?.kind === 'link-resource' && <form class="creator-owner__form" data-owner-form="enlace" data-link-edit-form onSubmit={editorSubmit}>
        {sessionRecovery}
        <p>Editas una ficha propia que ya no está colocada en tu página. Guardar aquí no la reincorpora.</p>
        <fieldset class="creator-owner__field creator-owner__link-fields" data-link-metadata-fields>
          <legend>Ficha del contenido</legend>
          <ResourceMetadataFields idPrefix="owner-link" values={editor.draft} policy="owner"
            errors={{ title: contentError('title'), url: contentError('url'), description: contentError('description') }}
            readOnly={locked} hookPrefix="owner" titleId="owner-link-title" urlId="owner-link-url" descriptionId="owner-link-description"
            onInput={(field) => nativeContent.onInput(field)}
            onInvalid={(field, event) => nativeContent.onInvalid(field, event.currentTarget as HTMLInputElement, event)}
            onChange={(field, value) => onUpdateLink({ [field]: value })} />
        </fieldset>
        {showClassification && <ResourceClassificationFields idPrefix="owner-link" value={editor.draft} errors={classificationErrors}
          disabled={locked || !classificationEditable} required={Boolean(editor.draft.kind || editor.draft.format || editor.draft.topics.length)}
          hookPrefix="owner"
          onKindChange={(value) => { nativeContent.onInput('kind'); nativeContent.onInput('format'); onClassificationChange({ type: 'kind', value }); }}
          onFormatChange={(value) => { nativeContent.onInput('format'); onClassificationChange({ type: 'format', value }); }}
          onKindInvalid={(event) => nativeContent.onInvalid('kind', event.target as HTMLInputElement, event)}
          onFormatInvalid={(event) => nativeContent.onInvalid('format', event.target as HTMLInputElement, event)}
          onTopicChange={(value, checked) => { nativeContent.onInput('topics'); onClassificationChange({ type: 'topic', value, checked }); }} />}
        {feedback && <p class={`creator-owner__status${feedbackIsError ? ' creator-owner__status--error' : ''}`} data-owner-form-status="enlace" role={feedbackIsError ? 'alert' : 'status'} aria-live="polite">{feedback}</p>}
        {matches && <OperationFeedback state={state} rows={comparison} canSaveDraft={Boolean(canSubmitAfterConflict)} onRetryRead={onRetryRead} onResolve={onResolveRecovery} onSaveDraft={onSaveRecoveryDraft} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canSubmit}>Guardar ficha</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor?.kind === 'add-link' && <form class="creator-owner__form" data-owner-form="alta-enlace" data-link-add-form onSubmit={editorSubmit}>
        {sessionRecovery}
        <p>Agrega una URL a tu página. La propuesta al directorio queda seleccionada inicialmente; puedes cambiarla antes de guardar.</p>
        <ResourceMetadataFields idPrefix="owner-add-link" values={editor.draft} policy="owner"
          errors={{ title: contentError('title'), url: contentError('url'), description: contentError('description') }}
          readOnly={locked} hookPrefix="owner" titleId="owner-add-link-title" urlId="owner-add-link-url" descriptionId="owner-add-link-description"
          onInput={(field) => nativeContent.onInput(field)}
          onInvalid={(field, event) => nativeContent.onInvalid(field, event.currentTarget as HTMLInputElement, event)}
          onChange={(field, value) => onUpdateAddLink({ [field]: value })} />
        {showClassification && <ResourceClassificationFields idPrefix="owner-add-link" value={editor.draft} errors={classificationErrors}
          disabled={locked} required={Boolean(editor.draft.kind || editor.draft.format || editor.draft.topics.length)}
          hookPrefix="owner"
          onKindChange={(value) => { nativeContent.onInput('kind'); nativeContent.onInput('format'); onClassificationChange({ type: 'kind', value }); }}
          onFormatChange={(value) => { nativeContent.onInput('format'); onClassificationChange({ type: 'format', value }); }}
          onKindInvalid={(event) => nativeContent.onInvalid('kind', event.target as HTMLInputElement, event)}
          onFormatInvalid={(event) => nativeContent.onInvalid('format', event.target as HTMLInputElement, event)}
          onTopicChange={(value, checked) => { nativeContent.onInput('topics'); onClassificationChange({ type: 'topic', value, checked }); }} />}
        <label class="creator-owner__link-checkbox"><input type="checkbox" name="selectedForDirectory" checked={editor.draft.selectedForDirectory} disabled={locked} onChange={(event) => onUpdateAddLink({ selectedForDirectory: event.currentTarget.checked })} /><span>Proponer al directorio</span></label>
        <details class="creator-owner__link-help"><summary>Sobre el directorio</summary><p>La propuesta requiere aprobación. Quitarla no quita el enlace de tu página; la actualización del directorio puede demorar.</p></details>
        {feedback && <p class={`creator-owner__status${feedbackIsError ? ' creator-owner__status--error' : ''}`} data-link-add-status role={feedbackIsError ? 'alert' : 'status'} aria-live="polite">{feedback}</p>}
        {matches && <OperationFeedback state={state} rows={comparison} canSaveDraft={Boolean(canSubmitAfterConflict)} onRetryRead={onRetryRead} onResolve={onResolveRecovery} onSaveDraft={onSaveRecoveryDraft} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canSubmit}>Agregar enlace</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor?.kind === 'move-link' && <form class="creator-owner__form" data-owner-form="mover-enlace" data-link-move-form aria-label="Mover enlace a una posición" onSubmit={editorSubmit}>
        {sessionRecovery}
        {(() => {
          const link = creatorOwnerNavigationLists(state.observed).links.find(({ placementId }) => placementId === editor.placementId);
          const position = creatorOwnerLinkMoveContext(state.observed, editor.placementId);
          return <p class="creator-owner__move-context" id="owner-link-move-context" data-link-move-context aria-live="polite">Grupo {position?.group === 'featured' ? 'destacado' : 'sin destacar'}: {position?.count ?? 0} enlaces. {link && position ? `«${link.title}» está en la posición ${position.position}.` : 'El enlace ya no está en tu página.'}</p>;
        })()}
        <div class={`creator-owner__field${contentError('position') ? ' creator-owner__field--invalid' : ''}`}><label htmlFor="owner-link-target-position">Posición dentro del grupo</label><input id="owner-link-target-position" name="targetPosition" type="number" min={1}
          max={Math.max(1, creatorOwnerLinkMoveContext(state.observed, editor.placementId)?.count ?? 0)} step={1} required inputMode="numeric" {...contentFieldProps('position', contentError('position'))} aria-describedby={`owner-link-move-context${contentError('position') ? ` ${identityFieldErrorId('owner', 'position')}` : ''}`} value={editor.targetPosition} readOnly={locked}
          onInvalid={(event) => nativeContent.onInvalid('position', event.currentTarget as HTMLInputElement, event)}
          onInput={(event) => { nativeContent.onInput('position'); onUpdateMoveLink((event.currentTarget as HTMLInputElement).value); }} /><IdentityFieldError id={identityFieldErrorId('owner', 'position')} text={contentError('position')} /></div>
        {feedback && <p class={`creator-owner__status${feedbackIsError ? ' creator-owner__status--error' : ''}`} data-owner-form-status="mover-enlace" role={feedbackIsError ? 'alert' : 'status'} aria-live="polite">{feedback}</p>}
        {matches && <OperationFeedback state={state} rows={comparison} canSaveDraft={Boolean(canSubmitAfterConflict)} onRetryRead={onRetryRead} onResolve={onResolveRecovery} onSaveDraft={onSaveRecoveryDraft} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canSubmit}>Guardar posición</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor?.kind === 'reference' && <form class="creator-owner__form" data-owner-form="referencia" data-catalog-reference-form onSubmit={editorSubmit}>
        {sessionRecovery}
        <p>Busca por título o URL y agrega una ficha existente. Esto crea una referencia; no concede permiso para editarla.</p>
        <fieldset class={`creator-owner__field creator-owner__content-group${contentError('selection') ? ' creator-owner__field--invalid' : ''}`} data-owner-reference-selection aria-invalid={contentError('selection') ? 'true' : undefined}
          aria-describedby={contentError('selection') ? identityFieldErrorId('owner', 'selection') : undefined}>
          <legend>Ficha del catálogo</legend>
          <CatalogPicker state={state} mode="reference" selected={[]} selectedReference={editor.selected} onSearch={onCatalogSearch} onPage={onCatalogPage} onRetry={onCatalogRetry}
            onSelect={(item, checked) => onUpdateReference({ selected: checked ? item : undefined })} disabled={locked} errorFocus={Boolean(contentError('selection'))} />
          <IdentityFieldError id={identityFieldErrorId('owner', 'selection')} text={contentError('selection')} />
        </fieldset>
        {editor.selected && <label class="creator-owner__link-checkbox creator-owner__catalog-directory"><input id="owner-link-directory-option" type="checkbox" name="selectedForDirectory" checked={editor.selectedForDirectory} disabled={locked}
          onChange={(event) => onUpdateReference({ selectedForDirectory: event.currentTarget.checked })} /><span>Proponer al directorio</span></label>}
        {editor.selected && <details class="creator-owner__link-help"><summary>Sobre el directorio</summary><p>La propuesta requiere aprobación. Agregar una referencia no concede permiso para editar la ficha compartida.</p></details>}
        <p class={`creator-owner__status${feedbackIsError ? ' creator-owner__status--error' : ''}`} data-catalog-status role={feedbackIsError ? 'alert' : 'status'} aria-live="polite">{referenceStatusMessage}</p>
        {matches && <OperationFeedback state={state} rows={comparison} canSaveDraft={Boolean(canSubmitAfterConflict)} onRetryRead={onRetryRead} onResolve={onResolveRecovery} onSaveDraft={onSaveRecoveryDraft} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" data-catalog-reference disabled={!canSubmit}>Agregar a mi página</button><button class="button button--outline" type="button" data-owner-cancel data-catalog-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor?.kind === 'claim' && <form class="creator-owner__form" data-owner-form="reclamacion" data-claim-form onSubmit={editorSubmit}>
        {sessionRecovery}
        <p>Selecciona contenido del catálogo o agrega URLs conocidas. Enviar una solicitud no agrega contenido a tu página ni concede permiso para editar.</p>
        <fieldset class={`creator-owner__field creator-owner__content-group${claimDestinationsError ? ' creator-owner__field--invalid' : ''}`} data-owner-claim-destinations aria-invalid={claimDestinationsError ? 'true' : undefined}
          aria-describedby={claimDestinationsError ? claimDestinationsErrorId : undefined}>
          <legend>Destinos de la solicitud</legend>
          <CatalogPicker state={state} mode="claim" selected={editor.selected} onSearch={onCatalogSearch} onPage={onCatalogPage} onRetry={onCatalogRetry}
            onSelect={(item, checked) => onUpdateClaim({ selected: checked
              ? [...editor.selected.filter(({ resourceId }) => resourceId !== item.id), { resourceId: item.id, url: item.url, title: item.title }]
              : editor.selected.filter(({ resourceId }) => resourceId !== item.id) })} disabled={locked} errorFocus={Boolean(contentError('selection'))}
            errorDescriptionId={claimDestinationsError ? claimDestinationsErrorId : undefined} />
          <ul class="creator-owner__claim-selection" data-claim-selection aria-label="Selección para solicitar edición" hidden={!editor.selected.length}>
            {editor.selected.map((item) => <li key={item.resourceId}><span>{item.title} — {item.url}</span><button class="button button--outline" type="button" data-claim-deselect={item.resourceId} aria-label={`Quitar ${item.title} de la selección`} disabled={locked}
              onClick={() => onUpdateClaim({ selected: editor.selected.filter(({ resourceId }) => resourceId !== item.resourceId) })}>Quitar</button></li>)}
          </ul>
          <p class="creator-owner__catalog-selected" data-catalog-selected-count aria-live="polite">{editor.selected.length ? `${editor.selected.length} ${editor.selected.length === 1 ? 'recurso seleccionado.' : 'recursos seleccionados.'}` : 'Ningún recurso seleccionado.'}</p>
          <div class={`creator-owner__field${contentError('knownUrls') ? ' creator-owner__field--invalid' : ''}`}><label htmlFor="owner-claim-urls">URLs conocidas <span>(opcional, una por línea)</span></label><textarea id="owner-claim-urls" name="knownUrls" rows={4} data-claim-urls autoComplete="url" value={editor.knownUrls} readOnly={locked}
            {...contentFieldProps('knownUrls', contentError('knownUrls'), undefined, claimDestinationsError,
              claimDestinationsError ? claimDestinationsErrorId : undefined)}
            onInvalid={(event) => nativeContent.onInvalid('knownUrls', event.currentTarget as HTMLTextAreaElement, event)}
            onInput={(event) => { nativeContent.onInput('knownUrls'); onUpdateClaim({ knownUrls: (event.currentTarget as HTMLTextAreaElement).value }); }} /><IdentityFieldError id={identityFieldErrorId('owner', 'knownUrls')} text={contentError('knownUrls')} /></div>
          <IdentityFieldError id={claimDestinationsErrorId} text={claimDestinationsError} />
        </fieldset>
        <div class={`creator-owner__field${contentError('evidence') ? ' creator-owner__field--invalid' : ''}`}><label htmlFor="owner-claim-evidence">Contexto privado <span>(opcional)</span></label><textarea id="owner-claim-evidence" name="evidence" rows={3} maxLength={CREATOR_FIELD_LIMITS.evidence} data-claim-evidence value={editor.evidence} readOnly={locked}
          {...contentFieldProps('evidence', contentError('evidence'))}
          onInvalid={(event) => nativeContent.onInvalid('evidence', event.currentTarget as HTMLTextAreaElement, event)}
          onInput={(event) => { nativeContent.onInput('evidence'); onUpdateClaim({ evidence: (event.currentTarget as HTMLTextAreaElement).value }); }} /><small>Hasta {CREATOR_FIELD_LIMITS.evidence} caracteres. Sólo lo ven quienes gestionan esta solicitud.</small><IdentityFieldError id={identityFieldErrorId('owner', 'evidence')} text={contentError('evidence')} /></div>
        {feedback && <p class={`creator-owner__status${feedbackIsError ? ' creator-owner__status--error' : ''}`} data-claim-status role={feedbackIsError ? 'alert' : 'status'} aria-live="polite">{feedback}</p>}
        {matches && <OperationFeedback state={state} rows={comparison} canSaveDraft={false} onRetryRead={onRetryRead} onResolve={onResolveRecovery} onSaveDraft={onSaveRecoveryDraft} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" data-claim-submit disabled={!canSubmit}>Enviar solicitud</button><button class="button button--outline" type="button" data-owner-cancel data-claim-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {prompt && !inlineCreatePrompt && <div class="creator-owner__exit" data-owner-exit-prompt role="alertdialog" aria-labelledby="owner-exit-title" aria-describedby="owner-exit-copy">
        <h3 id="owner-exit-title">{editor ? 'Tienes cambios sin guardar' : 'La acción todavía necesita atención'}</h3>
        <p id="owner-exit-copy">{operation.status === 'sending' ? 'La solicitud está en curso. Espera a que termine antes de salir.'
          : editor ? 'Puedes guardar esta corrección, descartarla o seguir editando.'
            : 'Comprueba el estado guardado o decide si sigues a la página solicitada.'}</p>
        {(!editor && (matches || operation.status !== 'idle' && operation.status !== 'sending'))
          && <OperationFeedback state={state} rows={comparison} canSaveDraft={Boolean(canSubmitAfterConflict)} onRetryRead={onRetryRead} onResolve={onResolveRecovery} onSaveDraft={onSaveRecoveryDraft} />}
        <div class="creator-owner__dialog-actions">
          {editor && <button class="button button--dark" type="button" data-owner-exit-save disabled={!canSubmit} onClick={() => onExit('save')}>Guardar y salir</button>}
          <button id="owner-exit-discard" class="button button--outline" type="button" data-owner-exit-discard disabled={operation.status === 'sending'} onClick={() => onExit('discard')}>
            {editor ? 'Descartar cambios' : operation.status === 'idle' ? 'Seguir a la página solicitada' : 'Descartar y seguir'}
          </button>
          <button id="owner-exit-continue" class="button button--outline" type="button" data-owner-exit-continue onClick={() => onExit('continue')}>{editor ? 'Seguir editando' : 'Quedarme aquí'}</button>
        </div>
      </div>}
    </div>
  </dialog>;
}

function OperationFeedback({ state, rows, canSaveDraft, onRetryRead, onResolve, onSaveDraft }: {
  state: CreatorOwnerState;
  rows: Array<[string, string, string]> | undefined;
  canSaveDraft: boolean;
  onRetryRead(): void;
  onResolve(choice: CreatorOwnerRecoveryChoice): void;
  onSaveDraft(): void;
}) {
  const operation = state.operation;
  const recoveryAction = deriveCreatorOwnerRecoveryAction(state);
  if (operation.status === 'idle' || operation.status === 'sending' || recoveryAction.kind === 'none') return null;
  const fact = operation.status === 'reading' || operation.status === 'refresh-failed' ? operation.fact : undefined;
  const incompatibleRead = operation.status === 'refresh-failed' && operation.readContractObsolete === true;
  const claimIntent = (operation.status === 'unknown' || operation.status === 'conflict') && operation.intent.action === 'create-claim';
  const photoConflict = operation.status === 'conflict'
    && (operation.intent.action === 'photo-authorize' || operation.intent.action === 'photo-finalize');
  const moveDraft = state.editor?.kind === 'move-chapter' || state.editor?.kind === 'move-link' ? state.editor : undefined;
  const canCorrectMoveDraft = operation.status === 'conflict' && operation.readCompleted && !operation.intent.targetMissing
    && moveDraft && moveDraft.key === operation.intent.editorKey
    && creatorOwnerCanSubmitEditor({ ...state, operation: { status: 'idle' } })
    && !creatorOwnerMoveDestinationIsValid(moveDraft, state.observed);
  const canReselect = operation.status === 'conflict' && state.catalog.needsRefresh
    && (operation.intent.action === 'reference-link' || operation.intent.action === 'create-claim');
  const title = fact === 'acknowledged' ? 'La acción está confirmada'
    : fact === 'claims' || claimIntent ? 'No sabemos si se envió la solicitud'
      : operation.status === 'conflict' ? 'El contenido cambió'
        : 'No pudimos confirmar el resultado';
  return <section class="creator-owner__conflict" data-owner-conflict data-owner-recovery data-recovery-kind={operation.status} data-owner-stale={operation.status === 'refresh-failed' ? true : undefined} aria-live="polite">
    <h3>{title}</h3>
    <p data-owner-conflict-copy>{operation.message}</p>
    {photoConflict && <p data-owner-photo-recovery>Tu archivo sigue seleccionado. Puedes cargarlo con la versión actual del perfil.</p>}
    {claimIntent && operation.status === 'unknown' && <p>El historial puede mostrar solicitudes parecidas, pero no permite confirmar si este envío fue el original. Volver al borrador y enviarlo otra vez puede crear un duplicado.</p>}
    {rows && <div class="creator-owner__comparison" data-owner-comparison><ComparisonRows rows={rows} /></div>}
    {incompatibleRead && <a class="button button--outline" data-owner-current-page href={`${state.publicOrigin}/cuenta/`} target="_blank" rel="noopener noreferrer">Abrir la página actual</a>}
    {!incompatibleRead && recoveryAction.kind === 'retry' && <button class="button button--outline" type="button" data-owner-refresh-retry disabled={state.session.state !== 'ready'} onClick={onRetryRead}>Reintentar actualización</button>}
    {recoveryAction.kind === 'compare' && <button class="button button--outline" type="button" data-owner-check disabled={state.session.state !== 'ready'} onClick={onRetryRead}>Comprobar estado guardado</button>}
    {recoveryAction.kind === 'resolve' && operation.status === 'unknown' && <div class="creator-owner__dialog-actions">
      <button class="button button--outline" type="button" data-owner-use-saved onClick={() => onResolve('saved')}>Usar lo guardado</button>
      <button class="button button--outline" type="button" data-owner-return-to-draft onClick={() => onResolve('draft')}>Volver al borrador</button>
    </div>}
    {recoveryAction.kind === 'resolve' && operation.status === 'conflict' && <div class="creator-owner__dialog-actions">
      {canSaveDraft && <button class="button button--dark" type="button" data-owner-conflict-save data-owner-photo-retry={photoConflict ? true : undefined} onClick={onSaveDraft}>{photoConflict ? 'Cargar de nuevo esta foto' : 'Guardar mi borrador'}</button>}
      {canReselect && <button class="button button--outline" type="button" data-owner-return-to-draft onClick={() => onResolve('draft')}>Volver al borrador</button>}
      {canCorrectMoveDraft && <button class="button button--outline" type="button" data-owner-return-to-draft data-owner-move-draft-correction onClick={() => onResolve('draft')}>Corregir posición</button>}
      <button class="button button--outline" type="button" data-owner-use-saved onClick={() => onResolve('saved')}>Usar lo guardado</button>
    </div>}
    {canCorrectMoveDraft && <p data-owner-move-draft-range>El orden cambió y esa posición ya no existe. Conservamos el borrador para que elijas una posición vigente.</p>}
    {operation.status === 'conflict' && operation.readCompleted && !canSaveDraft && !canReselect && !canCorrectMoveDraft && <p>No se puede guardar este cambio con el destino actual. Conservamos el borrador para que puedas copiarlo o usar lo guardado.</p>}
  </section>;
}

function CatalogPicker({ state, mode, selected, selectedReference, onSearch, onPage, onRetry, onSelect, disabled = false, errorFocus = false,
  errorDescriptionId }: {
  state: CreatorOwnerState;
  mode: 'reference' | 'claim';
  selected: readonly CreatorOwnerClaimSelection[];
  selectedReference?: CreatorOwnerReferenceCandidate;
  onSearch(value: string): void;
  onPage(value: number): void;
  onRetry(): void;
  onSelect(item: CreatorCatalogSelectionDTO, checked: boolean): void;
  disabled?: boolean;
  errorFocus?: boolean;
  errorDescriptionId?: string;
}) {
  const resultsRef = useRef<HTMLUListElement>(null);
  const previousPageRef = useRef<HTMLButtonElement>(null);
  const nextPageRef = useRef<HTMLButtonElement>(null);
  const pageFocusRequestRef = useRef<{ direction: 'previous' | 'next'; page: number } | null>(null);
  const catalog = state.catalog;
  const entries = catalog.entries ?? [];
  const selection = pageCreatorOwnerCatalog(entries, catalog.search, catalog.page);
  const claimNeedsRefresh = mode === 'claim' && creatorOwnerClaimSelectionNeedsRefresh(state, selected);
  const needsRefresh = catalog.needsRefresh || claimNeedsRefresh;
  const claimNeedsReselection = mode === 'claim' && !needsRefresh && !creatorOwnerClaimSelectionIsCurrent(state, selected);
  const rows = needsRefresh ? [] : selection.rows;
  const hasRejectedVisibleReference = mode === 'reference' && selection.rows.some(({ id, url }) =>
    catalog.rejectedReferenceSelections.some((rejected) => rejected.id === id && rejected.url === url));
  const canRefresh = catalog.status === 'error' || needsRefresh || catalog.status === 'ready' && hasRejectedVisibleReference;
  const loadLabel = catalog.status === 'loading' ? 'Cargando el catálogo…'
    : catalog.status === 'error' ? catalog.message ?? 'No pudimos cargar el catálogo.'
      : needsRefresh ? catalog.message ?? 'Actualiza el catálogo antes de continuar.'
        : 'Busca contenido existente por título o URL.';
  const showCatalogStatus = catalog.status !== 'ready' || needsRefresh;

  useLayoutEffect(() => {
    const request = pageFocusRequestRef.current;
    if (!request || selection.page !== request.page) return;
    pageFocusRequestRef.current = null;
    const activated = request.direction === 'previous' ? previousPageRef.current : nextPageRef.current;
    const opposite = request.direction === 'previous' ? nextPageRef.current : previousPageRef.current;
    const destination = activated && !activated.disabled ? activated : opposite && !opposite.disabled ? opposite : resultsRef.current;
    if (!destination) return;
    destination.focus();
    destination.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selection.page]);

  const changePage = (direction: 'previous' | 'next', page: number) => {
    pageFocusRequestRef.current = { direction, page };
    onPage(page);
  };
  const updateSearch = (value: string) => { pageFocusRequestRef.current = null; onSearch(value); };

  return <section class="creator-owner__catalog" data-owner-catalog aria-label="Buscar contenido publicado" aria-busy={catalog.status === 'loading'}>
    <div class="creator-owner__catalog-search" role="search">
      <div class="creator-owner__field"><label htmlFor="owner-catalog-search">Buscar por título o URL</label>
        <input id="owner-catalog-search" type="search" name="buscarCatalogo" data-catalog-search autoComplete="off" value={catalog.search} disabled={disabled}
          data-owner-content-error-focus={errorFocus ? true : undefined}
          onInput={(event) => updateSearch((event.currentTarget as HTMLInputElement).value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); pageFocusRequestRef.current = null; resultsRef.current?.focus(); } }} />
      </div>
      <button class="button button--outline" type="button" data-catalog-search-submit disabled={disabled || catalog.status !== 'ready' || needsRefresh}
        onClick={() => { updateSearch(catalog.search); resultsRef.current?.focus(); }}>Buscar</button>
    </div>
    {showCatalogStatus && <p class="creator-owner__status" data-catalog-index-status role={catalog.status === 'error' ? 'alert' : 'status'} aria-live="polite">{loadLabel}</p>}
    {canRefresh && <button class="button button--outline" type="button" data-catalog-retry disabled={disabled} onClick={onRetry}>{catalog.status === 'error' ? 'Reintentar carga del catálogo' : 'Actualizar catálogo'}</button>}
    {claimNeedsReselection && <p class="creator-owner__status creator-owner__status--error" data-catalog-claim-selection-status role="alert" aria-live="polite">Una ficha seleccionada cambió de URL. Quítala o vuelve a elegirla antes de enviar la solicitud.</p>}
    {catalog.status === 'ready' && !needsRefresh && <>
      <p data-catalog-count aria-live="polite">{selection.matches.length} {selection.matches.length === 1 ? 'resultado' : 'resultados'}</p>
      <ul class="creator-owner__catalog-results" data-catalog-results aria-label="Resultados del catálogo" tabIndex={-1} ref={resultsRef}>
        {rows.map((item) => {
          const rejected = mode === 'reference' && catalog.rejectedReferenceSelections.some(({ id, url }) => id === item.id && url === item.url);
          return <li class="creator-owner__catalog-row" data-catalog-row={item.id} key={item.id}>
            <label><input type={mode === 'reference' ? 'radio' : 'checkbox'} name={mode === 'reference' ? 'catalogReference' : undefined}
              data-catalog-select data-resource-id={item.id} checked={mode === 'reference'
                ? selectedReference?.id === item.id && selectedReference.url === item.url
                : selected.some(({ resourceId, url }) => resourceId === item.id && url === item.url)}
              disabled={disabled || rejected}
              aria-describedby={errorDescriptionId}
              aria-label={`${mode === 'claim' ? 'Solicitar edición de' : 'Seleccionar'} ${item.title}`}
              onChange={(event) => onSelect(item, event.currentTarget.checked)} />
              <span class="creator-owner__catalog-item"><strong>{item.title}</strong><span>{item.url}</span>{rejected && <span data-catalog-rejected>URL desactualizada.</span>}</span>
            </label>
          </li>;
        })}
      </ul>
      <p class="creator-owner__empty" data-catalog-empty hidden={selection.matches.length > 0}>
        {entries.length ? 'No hay recursos que coincidan con la búsqueda.' : 'El catálogo no tiene recursos disponibles en este momento.'}
      </p>
      <nav class="creator-owner__catalog-pagination" aria-label="Páginas del catálogo">
        <button ref={previousPageRef} class="button button--outline" type="button" data-catalog-page="previous" disabled={disabled || selection.page <= 1} onClick={() => changePage('previous', selection.page - 1)}>Anterior</button>
        <span data-catalog-page-label aria-live="polite">Página {selection.page} de {selection.pageCount}</span>
        <button ref={nextPageRef} class="button button--outline" type="button" data-catalog-page="next" disabled={disabled || selection.page >= selection.pageCount} onClick={() => changePage('next', selection.page + 1)}>Siguiente</button>
      </nav>
    </>}
  </section>;
}

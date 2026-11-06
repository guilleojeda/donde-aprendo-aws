import { useEffect, useRef } from 'preact/hooks';
import type { CreatorCatalogSelectionDTO, CreatorEditorDTO, CreatorProfileDTO } from '../../types/creators';
import { normalizeCreatorText } from '../../lib/creator-values.mjs';
import type { CreatorOwnerAttempt, CreatorOwnerComparison, CreatorOwnerEditor, CreatorOwnerLinkDraft, CreatorOwnerLinkEditor, CreatorOwnerState, CreatorOwnerWriteIntent } from '../../lib/creator-owner-state';
import { pageCreatorOwnerCatalog } from '../../lib/creator-owner-catalog';

interface Props {
  state: CreatorOwnerState;
  onUpdateProfile(value: { displayName?: string; slug?: string; city?: string; country?: string; bio?: string; programs?: CreatorProfileDTO['programs'] }): void;
  onUpdateSocial(key: 'instagram' | 'x' | 'linkedin' | 'awsBuilder' | 'website', value: string): void;
  onUpdateSeries(value: { name?: string; slug?: string; description?: string }, manuallyEditedSlug?: boolean): void;
  onUpdateMove(value: string): void;
  onSetMoveSuggestion(value?: number): void;
  onUpdateLink(value: Partial<CreatorOwnerLinkDraft>): void;
  onUpdateAddLink(value: Partial<CreatorOwnerLinkDraft>): void;
  onUpdateMoveLink(value: string): void;
  onUpdateReference(value: { selected?: CreatorCatalogSelectionDTO; selectedForDirectory?: boolean }): void;
  onUpdateClaim(value: { selected?: Array<{ resourceId: string; url: string; title: string }>; knownUrls?: string; evidence?: string }): void;
  onCatalogSearch(value: string): void;
  onCatalogPage(value: number): void;
  onCatalogRetry(): void;
  onSetPhoto(file?: File): void;
  onSubmit(): void;
  onRequestClose(): void;
  onCheck(): void;
  onAdopt(comparisonId: string): void;
  onExit(action: 'save' | 'discard' | 'continue'): void;
  onCheckSession(): void;
  onCheckClaim(): void;
}

const PROGRAMS: CreatorProfileDTO['programs'] = ['User Group Leaders', 'Community Builders', 'Heroes'];
const SOCIALS = [
  ['instagram', 'Instagram'],
  ['x', 'X'],
  ['linkedin', 'LinkedIn'],
  ['awsBuilder', 'AWS Builder Center'],
  ['website', 'Sitio web o newsletter'],
] as const;

function attemptForEditor(attempt: CreatorOwnerAttempt, editor: CreatorOwnerEditor | CreatorOwnerLinkEditor): boolean {
  return 'intent' in attempt && attempt.intent.editorKey === editor.key;
}

function comparisonRows(
  editor: CreatorOwnerEditor | CreatorOwnerLinkEditor,
  data: CreatorEditorDTO,
  comparison?: CreatorOwnerComparison,
  intent?: CreatorOwnerWriteIntent,
): Array<[string, string, string]> {
  if (editor.kind === 'profile' && data.profile?.id === editor.base.id) {
    if (editor.section === 'datos') {
      const saved = data.profile;
      return [
        ['Nombre visible', saved.displayName, editor.draft.displayName],
        ['Dirección', saved.slug, editor.draft.slug],
        ['Ciudad', saved.city ?? '', editor.draft.city],
        ['País', saved.country ?? '', editor.draft.country],
        ['Presentación', saved.bio ?? '', editor.draft.bio],
        ['Programas', saved.programs.join(', '), editor.draft.programs.join(', ')],
      ];
    }
    return SOCIALS.map(([key, label]) => [label, data.profile?.socials[key] ?? '', editor.draft[key]]);
  }
  if (editor.kind === 'series' && data.profile?.id === editor.baseProfile.id) {
    const saved = editor.baseSeries ? data.series.find(({ id }) => id === editor.baseSeries?.id) : undefined;
    const recovered = saved ?? (editor.baseSeries === null && comparison?.seriesId ? data.series.find(({ id }) => id === comparison.seriesId) : undefined);
    return [
      ['Nombre', recovered?.name ?? 'No se encontró la serie', editor.draft.name],
      ['Dirección', recovered?.slug ?? '—', editor.draft.slug],
      ['Descripción', recovered?.description ?? '', editor.draft.description],
    ];
  }
  if (editor.kind === 'move-chapter') {
    const order = data.links.filter((link) => link.series.some(({ seriesId }) => seriesId === editor.seriesId))
      .sort((left, right) => (left.series.find(({ seriesId }) => seriesId === editor.seriesId)?.position ?? 0)
        - (right.series.find(({ seriesId }) => seriesId === editor.seriesId)?.position ?? 0));
    const savedPosition = order.findIndex(({ placementId }) => placementId === editor.placementId) + 1;
    const name = data.series.find(({ id }) => id === editor.seriesId)?.name ?? 'esta serie';
    return [['Posición guardada', savedPosition > 0 ? `${savedPosition} de ${order.length}` : 'El capítulo ya no está en la serie', `${editor.targetPosition} en ${name}`]];
  }
  if (editor.kind === 'link-placement') {
    const saved = data.links.find(({ placementId }) => placementId === editor.baseLink.placementId);
    if (!saved) return [['Enlace', 'Ya no está en tu página', editor.draft.title]];
    return [
      ['Título', saved.title, editor.editable ? editor.draft.title : 'Ficha compartida'],
      ['URL', saved.url, editor.editable ? editor.draft.url : 'Ficha compartida'],
      ['Descripción', saved.description ?? '', editor.editable ? editor.draft.description : 'Ficha compartida'],
      ['Destacado', saved.featured ? 'Sí' : 'No', editor.draft.featured ? 'Sí' : 'No'],
      ['Propuesta al directorio', saved.selectedForDirectory ? 'Sí' : 'No', editor.draft.selectedForDirectory ? 'Sí' : 'No'],
    ];
  }
  if (editor.kind === 'link-resource') {
    const saved = data.editableResources.find(({ id }) => id === editor.baseResource.id);
    return [['Título', saved?.title ?? 'Ficha ya no disponible', editor.draft.title], ['URL', saved?.url ?? '—', editor.draft.url], ['Descripción', saved?.description ?? '', editor.draft.description]];
  }
  if (editor.kind === 'move-link') {
    const saved = data.links.find(({ placementId }) => placementId === editor.baseLink.placementId);
    const group = saved ? data.links.filter(({ featured }) => featured === saved.featured).sort((left, right) => left.position - right.position || left.placementId.localeCompare(right.placementId)) : [];
    const position = group.findIndex(({ placementId }) => placementId === editor.baseLink.placementId) + 1;
    return [['Posición guardada', position > 0 ? `${position} de ${group.length}` : 'El enlace ya no está en la página', editor.targetPosition]];
  }
  if (editor.kind === 'add-link') {
    const originalUrl = intent?.kind === 'add-link' && intent.capture.kind === 'add-link'
      ? normalizeCreatorText(intent.capture.draft.url) : normalizeCreatorText(editor.draft.url);
    const found = comparison?.recoveredLinkId
      ? data.links.find(({ placementId }) => placementId === comparison.recoveredLinkId)
      : data.links.find(({ url }) => url === originalUrl);
    const result = found ? `${originalUrl} · ${found.title} · ${found.url}` : `No aparece en la página: ${originalUrl}`;
    return [['URL del intento', result, editor.draft.url]];
  }
  if (editor.kind === 'reference') {
    const profileRows: Array<[string, string, string]> = data.profile?.id === editor.baseProfile.id
      ? [['Nombre visible', data.profile.displayName, editor.baseProfile.displayName], ['Dirección', data.profile.slug, editor.baseProfile.slug]]
      : [];
    const submitted = intent?.kind === 'reference' && intent.capture.kind === 'reference' ? intent.capture.selected : undefined;
    const recovered = comparison?.recoveredLinkId
      ? data.links.find(({ placementId }) => placementId === comparison.recoveredLinkId) : undefined;
    const original = submitted && recovered?.resourceId === submitted.id && recovered.url === submitted.url ? recovered : undefined;
    const originalResult = original ? `Encontrada: ${original.title} · ${original.url}`
      : submitted ? `No encontrada: ${submitted.title} · ${submitted.url}` : 'No se encontró la referencia original.';
    const currentSelection = editor.selected ? `${editor.selected.title} · ${editor.selected.url}` : 'Sin selección';
    const currentPlacement = editor.selected ? data.links.find(({ resourceId, url }) => resourceId === editor.selected?.id && url === editor.selected?.url) : undefined;
    const currentIsSubmittedPair = Boolean(submitted && editor.selected
      && submitted.id === editor.selected.id && submitted.url === editor.selected.url);
    const currentPlacementState = currentPlacement
      ? currentIsSubmittedPair ? 'La página guarda el par enviado con A.' : 'Ya estaba en tu página.'
      : 'No aparece en la página guardada.';
    const savedDirectoryOption = currentPlacement
      ? currentPlacement.selectedForDirectory ? 'Sí' : 'No'
      : 'Sin colocación guardada para esta selección.';
    return [
      ...profileRows,
      ['Referencia enviada', originalResult, 'El resultado corresponde a la selección original.'],
      ['Selección actual', currentPlacementState, currentSelection],
      ['Propuesta al directorio', savedDirectoryOption, editor.selectedForDirectory ? 'Sí' : 'No'],
    ];
  }
  return [];
}

function checkLabel(editor: CreatorOwnerEditor | CreatorOwnerLinkEditor): string {
  if (editor.kind === 'photo') return 'Comprobar qué foto quedó activa';
  if (editor.kind === 'claim') return 'Comprobar solicitudes';
  if (editor.kind === 'add-link') return 'Comprobar si se agregó la URL original';
  return 'Comprobar';
}

function recoveryActionLabel(editor: CreatorOwnerEditor | CreatorOwnerLinkEditor, status: CreatorOwnerAttempt['status']): string {
  if (editor.kind === 'claim') return 'Comprobar solicitudes';
  return status === 'conflict' && editor.kind !== 'photo' ? 'Comparar con lo guardado' : checkLabel(editor);
}

function adoptLabel(editor: CreatorOwnerEditor | CreatorOwnerLinkEditor): string {
  if (editor.kind === 'profile') return editor.section === 'redes' ? 'Usar las redes guardadas' : 'Usar los datos guardados';
  if (editor.kind === 'series') return editor.baseSeries ? 'Conservar mi corrección' : 'Continuar con el contenido guardado';
  if (editor.kind === 'move-chapter') return 'Conservar este destino';
  if (editor.kind === 'link-placement' || editor.kind === 'link-resource') return 'Usar los datos guardados';
  if (editor.kind === 'move-link') return 'Conservar este destino';
  if (editor.kind === 'add-link') return 'Continuar con el contenido guardado';
  if (editor.kind === 'reference') return 'Usar la página guardada';
  return 'Usar los datos guardados';
}

function savedValue(value: string): string { return value || '—'; }

function comparisonSavedLabel(label: string): string {
  switch (label) {
    case 'Nombre visible': return 'Nombre visible guardado';
    case 'Nombre': return 'Nombre guardado';
    case 'Dirección': return 'Dirección guardada';
    case 'Ciudad': return 'Ciudad guardada';
    case 'País': return 'País guardado';
    case 'Presentación': return 'Presentación guardada';
    case 'Programas': return 'Programas guardados';
    case 'Descripción': return 'Descripción guardada';
    case 'Posición guardada': return 'Posición guardada';
    case 'URL del intento': return 'Resultado del intento original';
    case 'Referencia enviada': return 'Resultado de A';
    case 'Selección actual': return 'Estado en la página guardada';
    case 'Propuesta al directorio': return 'Opción guardada de la selección actual';
    default: return `Valor guardado (${label})`;
  }
}

export default function CreatorOwnerEditorDialog({ state, onUpdateProfile, onUpdateSocial, onUpdateSeries, onUpdateMove, onSetMoveSuggestion, onUpdateLink, onUpdateAddLink, onUpdateMoveLink, onUpdateReference, onUpdateClaim, onCatalogSearch, onCatalogPage, onCatalogRetry, onSetPhoto, onSubmit, onRequestClose, onCheck, onAdopt, onExit, onCheckSession, onCheckClaim }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editor = state.editor;
  const editorIsDialog = editor && editor.kind !== 'create-profile';
  const prompt = state.location.prompt === 'exit';
  const shouldOpenDialog = Boolean(editorIsDialog || prompt);
  const attemptMatches = editor ? attemptForEditor(state.attempt, editor) : false;
  const checking = attemptMatches && state.attempt.status === 'checking';
  const canResubmitClaimWhileChecking = editor?.kind === 'claim' && state.attempt.status === 'checking'
    && state.attempt.intent.kind === 'claim' && state.attempt.intent.editorKey === editor.key;
  const canWrite = state.runtimeReady && state.session.state === 'ready'
    && state.attempt.status !== 'sending' && (state.attempt.status !== 'checking' || canResubmitClaimWhileChecking)
    && !(attemptMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict'));
  const dialogTitle = !editor ? 'Tu página' : editor.kind === 'create-profile' ? 'Prepara tu página' : editor.kind === 'profile' ? editor.section === 'datos' ? 'Editar datos' : 'Editar redes'
    : editor.kind === 'photo' ? 'Editar foto'
      : editor.kind === 'series' ? editor.baseSeries ? 'Editar serie' : 'Crear serie'
        : editor.kind === 'move-chapter' ? 'Mover capítulo'
          : editor.kind === 'link-placement' ? editor.editable ? 'Editar ficha' : 'Editar opciones'
            : editor.kind === 'link-resource' ? 'Editar contenido retirado'
              : editor.kind === 'add-link' ? 'Agregar enlace'
                : editor.kind === 'move-link' ? 'Mover enlace'
                  : editor.kind === 'reference' ? 'Buscar en el catálogo' : 'Solicitar edición';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (shouldOpenDialog) {
      if (!dialog.open) dialog.showModal();
      if (prompt) dialog.querySelector<HTMLElement>('[data-owner-exit-save]')?.focus({ preventScroll: true });
      else if (editorIsDialog) {
        const selector = editor?.kind === 'photo' ? 'input[type="file"]'
          : editor?.kind === 'link-placement' && !editor.editable ? '#owner-link-directory-option' : 'input:not([type="hidden"]), textarea';
        dialog.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
      }
    } else if (dialog.open) dialog.close();
  }, [shouldOpenDialog, editorIsDialog ? editor?.key : undefined, prompt]);

  const activeComparison = attemptMatches && state.attempt.status === 'uncertain' ? state.attempt.comparison : undefined;
  const rows = editor && activeComparison && 'intent' in state.attempt
    ? comparisonRows(editor, activeComparison.snapshot, activeComparison, state.attempt.intent) : [];
  const canAdopt = Boolean(activeComparison?.canAdopt && editor?.kind !== 'photo');
  const attemptMessage = attemptMatches && 'message' in state.attempt ? state.attempt.message : undefined;
  const statusText = attemptMessage ?? state.message?.text ?? '';
  const promptListAttempt = !editor && 'intent' in state.attempt && state.attempt.intent.capture.kind === 'list-command';
  const promptRecoveryMatches = promptListAttempt || Boolean(editor && attemptMatches);
  const promptRecovery = promptRecoveryMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict' || state.attempt.status === 'checking');
  const moveContext = editor?.kind === 'move-chapter'
    ? `En «${editor.baseSeries.name}», «${state.observed.links.find(({ placementId }) => placementId === editor.placementId)?.title ?? 'Capítulo'}» ocupa la posición actual ${editor.baseOrder.indexOf(editor.placementId) + 1} de ${editor.baseOrder.length}.` : '';

  return <dialog class="creator-owner__dialog" data-owner-dialog ref={dialogRef} aria-labelledby="creator-owner-dialog-title"
    onCancel={(event) => { event.preventDefault(); onRequestClose(); }}>
    <div class="creator-owner__dialog-panel">
      <header class="creator-owner__dialog-heading">
        <div><p class="creator-owner__eyebrow">Tu página</p><h2 id="creator-owner-dialog-title" data-owner-dialog-title>{dialogTitle}</h2></div>
        <button class="creator-owner__close" type="button" data-owner-close aria-label="Cerrar edición" onClick={onRequestClose}>×</button>
      </header>

      {state.session.state !== 'ready' && <section class="creator-owner__status" data-session-recovery-shell>
        <p data-session-recovery-status role="status" aria-live="polite">{state.session.message}</p>
        {(state.session.state === 'recovery-required' || state.session.state === 'checking') && <>
          <a class="button button--outline" data-session-recovery-sign-in href="/cuenta/ingresar/" target="_blank" rel="noopener noreferrer">Ingresar en otra pestaña</a>
          <button class="button button--outline" type="button" data-session-recovery-check disabled={state.session.state === 'checking'} onClick={onCheckSession}>Comprobar sesión</button>
        </>}
      </section>}

      {editorIsDialog && editor.kind === 'profile' && editor.section === 'datos' && <form class="creator-owner__form" hidden={prompt} data-owner-form="datos" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <div class="creator-owner__field"><label htmlFor="owner-display-name">Nombre visible</label><input id="owner-display-name" name="displayName" value={editor.draft.displayName} autoComplete="name" maxLength={120} required
          onInput={(event) => onUpdateProfile({ displayName: (event.currentTarget as HTMLInputElement).value })} /></div>
        <div class="creator-owner__field"><label htmlFor="owner-slug">Dirección de tu página</label>
          <div class="creator-owner__slug-field"><span aria-hidden="true">/c/</span><input id="owner-slug" name="slug" value={editor.draft.slug} required minLength={3} maxLength={40}
            pattern="[a-z0-9]+(-[a-z0-9]+)*" autoComplete="off" autoCapitalize="none" spellcheck={false}
            onInput={(event) => onUpdateProfile({ slug: (event.currentTarget as HTMLInputElement).value })} /></div>
          <small>3–40 caracteres: minúsculas, números y guiones sencillos. Cambiarla conserva la dirección anterior como alias.</small>
        </div>
        <div class="creator-owner__field"><label htmlFor="owner-city">Ciudad <span>(opcional)</span></label><input id="owner-city" name="city" value={editor.draft.city} autoComplete="address-level2" maxLength={100} onInput={(event) => onUpdateProfile({ city: (event.currentTarget as HTMLInputElement).value })} /></div>
        <div class="creator-owner__field"><label htmlFor="owner-country">País <span>(opcional)</span></label><input id="owner-country" name="country" value={editor.draft.country} autoComplete="country-name" maxLength={100} onInput={(event) => onUpdateProfile({ country: (event.currentTarget as HTMLInputElement).value })} /></div>
        <fieldset class="creator-owner__field creator-owner__programs"><legend>Programas de AWS <span>(opcional)</span></legend>
          {PROGRAMS.map((program) => <label htmlFor={`owner-program-${program.toLowerCase().replaceAll(' ', '-')}`} key={program}>
            <input id={`owner-program-${program.toLowerCase().replaceAll(' ', '-')}`} type="checkbox" name="programs" value={program} checked={editor.draft.programs.includes(program)}
              onChange={(event) => onUpdateProfile({ programs: event.currentTarget.checked ? [...editor.draft.programs, program] : editor.draft.programs.filter((item) => item !== program) })} /><span>{program}</span>
          </label>)}
        </fieldset>
        <div class="creator-owner__field"><label htmlFor="owner-bio">Sobre ti <span>(opcional)</span></label><textarea id="owner-bio" name="bio" rows={5} maxLength={2000} value={editor.draft.bio}
          onInput={(event) => onUpdateProfile({ bio: (event.currentTarget as HTMLTextAreaElement).value })} /><small>Hasta 2000 caracteres.</small></div>
        <input name="version" type="hidden" value={editor.base.version} />
        <p class="creator-owner__status" data-owner-form-status="datos" role="status" aria-live="polite">{statusText}</p>
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canWrite}>Guardar datos</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
        {attemptMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict' || checking) && <Recovery state={state} editor={editor} rows={rows} canAdopt={canAdopt} onCheck={onCheck} onAdopt={onAdopt} />}
      </form>}

      {editorIsDialog && editor.kind === 'profile' && editor.section === 'redes' && <form class="creator-owner__form" hidden={prompt} data-owner-form="redes" onSubmit={(event) => { event.preventDefault(); if (event.currentTarget.reportValidity()) onSubmit(); }}>
        <p>Las direcciones deben ser URL HTTP o HTTPS completas. Deja un campo vacío para quitar esa red.</p>
        {SOCIALS.map(([key, label]) => <div class="creator-owner__field" key={key}>
          <label htmlFor={`owner-social-${key}`}>{label}</label>
          <input id={`owner-social-${key}`} name={`social-${key}`} type="url" inputMode="url" autoComplete="url" placeholder="https://" maxLength={500} value={editor.draft[key]}
            onInput={(event) => { const input = event.currentTarget as HTMLInputElement; input.setCustomValidity(''); onUpdateSocial(key, input.value); }}
            onInvalid={(event) => (event.currentTarget as HTMLInputElement).setCustomValidity('Ingresa una URL HTTP o HTTPS sin usuario ni contraseña.')} />
        </div>)}
        <input name="version" type="hidden" value={editor.base.version} />
        <p class="creator-owner__status" data-owner-form-status="redes" role="status" aria-live="polite">{statusText}</p>
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canWrite}>Guardar redes</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
        {attemptMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict' || checking) && <Recovery state={state} editor={editor} rows={rows} canAdopt={canAdopt} onCheck={onCheck} onAdopt={onAdopt} />}
      </form>}

      {editorIsDialog && editor.kind === 'photo' && <form class="creator-owner__form" hidden={prompt} data-owner-form="foto" onSubmit={(event) => { event.preventDefault(); if (event.currentTarget.reportValidity()) onSubmit(); }}>
        <p>JPEG, PNG o WebP; hasta 15 MiB y 40 megapíxeles. La foto se guarda sólo cuando termina la carga.</p>
        {editor.base.photo && <img class="creator-owner__photo creator-owner__photo--preview" src={`/media/fotos/${encodeURIComponent(editor.base.id)}/${encodeURIComponent(String(editor.base.photo.version))}.webp`} alt="Foto actual del perfil" width={112} height={112} data-owner-photo-preview />}
        <div class="creator-owner__field"><label htmlFor="owner-photo-file">Elegir una foto</label><input id="owner-photo-file" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required data-busy-control
          onChange={(event) => onSetPhoto((event.currentTarget as HTMLInputElement).files?.[0])} /></div>
        <p class="creator-owner__status" data-owner-form-status="foto" role="status" aria-live="polite">{statusText}</p>
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canWrite || !editor.file}>Subir y guardar foto</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
        {attemptMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict' || checking) && <button class="button button--outline" type="button" data-owner-check-photo disabled={checking} onClick={onCheck}>{checkLabel(editor)}</button>}
      </form>}

      {editorIsDialog && editor.kind === 'series' && <form class="creator-owner__form" hidden={prompt} data-owner-form="serie" data-series-form onSubmit={(event) => { event.preventDefault(); if (event.currentTarget.reportValidity()) onSubmit(); }}>
        <p class="creator-owner__form-context" data-series-form-context>{editor.baseSeries ? `Editas «${editor.baseSeries.name}».` : 'Esta serie se crea como borrador; puedes agregar capítulos después.'}</p>
        <div class="creator-owner__field"><label htmlFor="owner-series-name">Nombre de la serie</label><input id="owner-series-name" name="name" value={editor.draft.name} maxLength={120} required data-series-name-suggestion
          onInput={(event) => onUpdateSeries({ name: (event.currentTarget as HTMLInputElement).value })} /></div>
        <div class="creator-owner__field"><label htmlFor="owner-series-slug">Dirección de la serie</label>
          <div class="creator-owner__slug-field"><span aria-hidden="true">/series/</span><input id="owner-series-slug" name="slug" value={editor.draft.slug} required minLength={3} maxLength={40}
            pattern="[a-z0-9]+(-[a-z0-9]+)*" autoComplete="off" autoCapitalize="none" spellcheck={false} data-series-slug-suggestion
            onInput={(event) => onUpdateSeries({ slug: (event.currentTarget as HTMLInputElement).value }, true)} /></div>
          <small>3–40 caracteres: minúsculas, números y guiones sencillos.</small>
        </div>
        <div class="creator-owner__field"><label htmlFor="owner-series-description">Descripción <span>(opcional)</span></label><textarea id="owner-series-description" name="description" rows={4} maxLength={2000} value={editor.draft.description}
          onInput={(event) => onUpdateSeries({ description: (event.currentTarget as HTMLTextAreaElement).value })} /></div>
        <p class="creator-owner__status" data-owner-form-status="serie" role="status" aria-live="polite">{statusText}</p>
        {editor.baseSeries && <input name="version" type="hidden" value={editor.baseSeries.version} />}
        {attemptMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict' || checking) && <Recovery state={state} editor={editor} rows={rows} canAdopt={canAdopt} onCheck={onCheck} onAdopt={onAdopt} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canWrite}>Guardar serie</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor.kind === 'move-chapter' && <form class="creator-owner__form" hidden={prompt} data-owner-form="mover-capitulo" data-chapter-move-form aria-label="Mover capítulo en la serie" onSubmit={(event) => { event.preventDefault(); if (event.currentTarget.reportValidity()) onSubmit(); }}>
        <p id="owner-chapter-move-context" class="creator-owner__move-context" data-chapter-move-context aria-live="polite">{moveContext}</p>
        <div class="creator-owner__field"><label htmlFor="owner-chapter-target-position">Posición en esta serie</label><input id="owner-chapter-target-position" name="targetPosition" type="number" min={1} max={editor.baseOrder.length} step={1} required inputMode="numeric" aria-describedby="owner-chapter-move-context" value={editor.targetPosition}
          onInput={(event) => onUpdateMove((event.currentTarget as HTMLInputElement).value)} /></div>
        <p class="creator-owner__status" data-owner-form-status="mover-capitulo" role="status" aria-live="polite">{statusText}</p>
        {editor.suggestionPosition && <div data-chapter-move-suggestion-shell><button class="button button--outline" type="button" data-chapter-move-suggestion data-viable-position={editor.suggestionPosition} onClick={() => { onUpdateMove(String(editor.suggestionPosition)); onSetMoveSuggestion(undefined); }}>Usar posición intermedia {editor.suggestionPosition}</button></div>}
        {attemptMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict' || checking) && <Recovery state={state} editor={editor} rows={rows} canAdopt={canAdopt} onCheck={onCheck} onAdopt={onAdopt} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canWrite}>Guardar posición</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor.kind === 'link-placement' && <form class="creator-owner__form" hidden={prompt} data-owner-form="enlace" data-link-edit-form onSubmit={(event) => { event.preventDefault(); if (event.currentTarget.reportValidity()) onSubmit(); }}>
        <p class="creator-owner__form-context">{editor.editable ? 'Esta ficha es tuya: los cambios del contenido y las opciones de la página se guardan juntos.' : 'Esta ficha es compartida. Puedes editar sus opciones; su título, URL y descripción siguen a cargo de quien la administra.'}</p>
        {editor.sharedTextCorrection && <p class="creator-owner__status" data-link-add-shared-correction role="status">Conservamos aparte el texto que escribiste después de enviar. La ficha compartida mantiene su título, URL y descripción.</p>}
        <fieldset class="creator-owner__field creator-owner__link-fields" data-link-metadata-fields disabled={!editor.editable}>
          <legend>Ficha del contenido</legend>
          {editor.editable && <details class="creator-owner__link-help"><summary>Sobre esta ficha</summary><p>El título, la URL y la descripción también se muestran a quienes referencian esta ficha.</p></details>}
          <div class="creator-owner__field"><label htmlFor="owner-link-title">Título</label><input id="owner-link-title" name="title" value={editor.draft.title} maxLength={200} required disabled={!editor.editable} onInput={(event) => onUpdateLink({ title: (event.currentTarget as HTMLInputElement).value })} /></div>
          <div class="creator-owner__field"><label htmlFor="owner-link-url">URL</label><input id="owner-link-url" name="url" type="url" inputMode="url" value={editor.draft.url} maxLength={2048} required disabled={!editor.editable} onInput={(event) => onUpdateLink({ url: (event.currentTarget as HTMLInputElement).value })} /></div>
          <div class="creator-owner__field"><label htmlFor="owner-link-description">Descripción <span>(opcional)</span></label><textarea id="owner-link-description" name="description" rows={4} value={editor.draft.description} maxLength={2000} disabled={!editor.editable} onInput={(event) => onUpdateLink({ description: (event.currentTarget as HTMLTextAreaElement).value })} /></div>
        </fieldset>
        <fieldset class="creator-owner__field creator-owner__link-fields" data-link-options>
          <legend>Opciones de tu página</legend>
          <label class="creator-owner__link-checkbox"><input type="checkbox" name="featured" checked={editor.draft.featured} onChange={(event) => onUpdateLink({ featured: event.currentTarget.checked })} /><span>Destacar en tu página</span></label>
          <label class="creator-owner__link-checkbox"><input id="owner-link-directory-option" type="checkbox" name="selectedForDirectory" checked={editor.draft.selectedForDirectory} onChange={(event) => onUpdateLink({ selectedForDirectory: event.currentTarget.checked })} /><span>Proponer al directorio</span></label>
          <details class="creator-owner__link-help"><summary>Sobre el directorio</summary><p>La propuesta requiere aprobación. Quitarla no quita el enlace de tu página; la actualización del directorio puede demorar.</p></details>
        </fieldset>
        <p class="creator-owner__status" data-owner-form-status="enlace" role="status" aria-live="polite">{statusText}</p>
        {attemptMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict' || checking) && <Recovery state={state} editor={editor} rows={rows} canAdopt={canAdopt} onCheck={onCheck} onAdopt={onAdopt} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canWrite}>Guardar cambios</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor.kind === 'link-resource' && <form class="creator-owner__form" hidden={prompt} data-owner-form="enlace" data-link-edit-form onSubmit={(event) => { event.preventDefault(); if (event.currentTarget.reportValidity()) onSubmit(); }}>
        <p>Editas una ficha propia que ya no está colocada en tu página. Guardar aquí no la reincorpora.</p>
        <fieldset class="creator-owner__field creator-owner__link-fields" data-link-metadata-fields>
          <legend>Ficha del contenido</legend>
          <div class="creator-owner__field"><label htmlFor="owner-link-title">Título</label><input id="owner-link-title" name="title" value={editor.draft.title} maxLength={200} required onInput={(event) => onUpdateLink({ title: (event.currentTarget as HTMLInputElement).value })} /></div>
          <div class="creator-owner__field"><label htmlFor="owner-link-url">URL</label><input id="owner-link-url" name="url" type="url" inputMode="url" value={editor.draft.url} maxLength={2048} required onInput={(event) => onUpdateLink({ url: (event.currentTarget as HTMLInputElement).value })} /></div>
          <div class="creator-owner__field"><label htmlFor="owner-link-description">Descripción <span>(opcional)</span></label><textarea id="owner-link-description" name="description" rows={4} value={editor.draft.description} maxLength={2000} onInput={(event) => onUpdateLink({ description: (event.currentTarget as HTMLTextAreaElement).value })} /></div>
        </fieldset>
        <p class="creator-owner__status" data-owner-form-status="enlace" role="status" aria-live="polite">{statusText}</p>
        {attemptMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict' || checking) && <Recovery state={state} editor={editor} rows={rows} canAdopt={canAdopt} onCheck={onCheck} onAdopt={onAdopt} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canWrite}>Guardar ficha</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor.kind === 'add-link' && <form class="creator-owner__form" hidden={prompt} data-owner-form="alta-enlace" data-link-add-form onSubmit={(event) => { event.preventDefault(); if (event.currentTarget.reportValidity()) onSubmit(); }}>
        <p>Agrega una URL a tu página. La propuesta al directorio queda seleccionada inicialmente; puedes cambiarla antes de guardar.</p>
        <div class="creator-owner__field"><label htmlFor="owner-add-link-title">Título</label><input id="owner-add-link-title" name="title" value={editor.draft.title} maxLength={200} required onInput={(event) => onUpdateAddLink({ title: (event.currentTarget as HTMLInputElement).value })} /></div>
        <div class="creator-owner__field"><label htmlFor="owner-add-link-url">URL</label><input id="owner-add-link-url" name="url" type="url" inputMode="url" value={editor.draft.url} maxLength={2048} required onInput={(event) => onUpdateAddLink({ url: (event.currentTarget as HTMLInputElement).value })} /></div>
        <div class="creator-owner__field"><label htmlFor="owner-add-link-description">Descripción <span>(opcional)</span></label><textarea id="owner-add-link-description" name="description" rows={4} value={editor.draft.description} maxLength={2000} onInput={(event) => onUpdateAddLink({ description: (event.currentTarget as HTMLTextAreaElement).value })} /></div>
        <label class="creator-owner__link-checkbox"><input type="checkbox" name="selectedForDirectory" checked={editor.draft.selectedForDirectory} onChange={(event) => onUpdateAddLink({ selectedForDirectory: event.currentTarget.checked })} /><span>Proponer al directorio</span></label>
        <details class="creator-owner__link-help"><summary>Sobre el directorio</summary><p>La propuesta requiere aprobación. Quitarla no quita el enlace de tu página; la actualización del directorio puede demorar.</p></details>
        <p class="creator-owner__status" data-link-add-status role="status" aria-live="polite">{statusText}</p>
        {attemptMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict' || checking) && <Recovery state={state} editor={editor} rows={rows} canAdopt={canAdopt} onCheck={onCheck} onAdopt={onAdopt} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canWrite}>Agregar enlace</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor.kind === 'move-link' && <form class="creator-owner__form" hidden={prompt} data-owner-form="mover-enlace" data-link-move-form aria-label="Mover enlace a una posición" onSubmit={(event) => { event.preventDefault(); if (event.currentTarget.reportValidity()) onSubmit(); }}>
        <p class="creator-owner__move-context" id="owner-link-move-context" data-link-move-context aria-live="polite">Grupo {editor.baseLink.featured ? 'destacado' : 'sin destacar'}: {editor.baseOrder.length} enlaces. Este enlace está en la posición {editor.baseOrder.indexOf(editor.baseLink.placementId) + 1}.</p>
        <div class="creator-owner__field"><label htmlFor="owner-link-target-position">Posición dentro del grupo</label><input id="owner-link-target-position" name="targetPosition" type="number" min={1} max={editor.baseOrder.length} step={1} required inputMode="numeric" aria-describedby="owner-link-move-context" value={editor.targetPosition} onInput={(event) => onUpdateMoveLink((event.currentTarget as HTMLInputElement).value)} /></div>
        <p class="creator-owner__status" data-owner-form-status="mover-enlace" role="status" aria-live="polite">{statusText}</p>
        {editor.suggestionPosition && <div data-link-move-suggestion-shell><button class="button button--outline" type="button" data-link-move-suggestion data-viable-position={editor.suggestionPosition} onClick={() => { onUpdateMoveLink(String(editor.suggestionPosition)); onSetMoveSuggestion(undefined); }}>Usar posición intermedia {editor.suggestionPosition}</button></div>}
        {attemptMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict' || checking) && <Recovery state={state} editor={editor} rows={rows} canAdopt={canAdopt} onCheck={onCheck} onAdopt={onAdopt} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" disabled={!canWrite}>Guardar posición</button><button class="button button--outline" type="button" data-owner-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor.kind === 'reference' && <form class="creator-owner__form" hidden={prompt} data-owner-form="referencia" data-catalog-reference-form onSubmit={(event) => { event.preventDefault(); if (event.currentTarget.reportValidity()) onSubmit(); }}>
        <p>Busca por título o URL y agrega una ficha existente. Esto crea una referencia; no concede permiso para editarla.</p>
        <CatalogPicker state={state} mode="reference" selected={editor.selected ? [editor.selected.id] : []} onSearch={onCatalogSearch} onPage={onCatalogPage} onRetry={onCatalogRetry}
          onSelect={(item, checked) => onUpdateReference({ selected: checked ? item : undefined })} />
        {editor.selected && <label class="creator-owner__link-checkbox creator-owner__catalog-directory"><input id="owner-link-directory-option" type="checkbox" name="selectedForDirectory" checked={editor.selectedForDirectory} onChange={(event) => onUpdateReference({ selectedForDirectory: event.currentTarget.checked })} /><span>Proponer al directorio</span></label>}
        {editor.selected && <details class="creator-owner__link-help"><summary>Sobre el directorio</summary><p>La propuesta requiere aprobación. Agregar una referencia no concede permiso para editar la ficha compartida.</p></details>}
        <p class="creator-owner__status" data-catalog-status role="status" aria-live="polite">{statusText || state.catalog.message}</p>
        {attemptMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict' || checking) && <Recovery state={state} editor={editor} rows={rows} canAdopt={canAdopt} onCheck={onCheck} onAdopt={onAdopt} />}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" data-catalog-reference disabled={!canWrite || !editor.selected || state.catalog.status !== 'ready' || state.catalog.needsRefresh || attemptMatches && state.attempt.status !== 'idle' && state.attempt.status !== 'confirmed'}>Agregar a mi página</button><button class="button button--outline" type="button" data-owner-cancel data-catalog-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {editorIsDialog && editor.kind === 'claim' && <form class="creator-owner__form" hidden={prompt} data-owner-form="reclamacion" data-claim-form onSubmit={(event) => { event.preventDefault(); if (event.currentTarget.reportValidity()) onSubmit(); }}>
        <p>Selecciona contenido del catálogo o agrega URLs conocidas. Enviar una solicitud no agrega contenido a tu página ni concede permiso para editar.</p>
        <CatalogPicker state={state} mode="claim" selected={editor.selected.map(({ resourceId }) => resourceId)} onSearch={onCatalogSearch} onPage={onCatalogPage} onRetry={onCatalogRetry}
          onSelect={(item, checked) => onUpdateClaim({ selected: checked
            ? [...editor.selected.filter(({ resourceId }) => resourceId !== item.id), { resourceId: item.id, url: item.url, title: item.title }]
            : editor.selected.filter(({ resourceId }) => resourceId !== item.id) })} />
        <ul class="creator-owner__claim-selection" data-claim-selection aria-label="Selección para solicitar edición" hidden={!editor.selected.length}>
          {editor.selected.map((item) => <li key={item.resourceId}><span>{item.title} — {item.url}</span><button class="button button--outline" type="button" data-claim-deselect={item.resourceId} aria-label={`Quitar ${item.title} de la selección`} onClick={() => onUpdateClaim({ selected: editor.selected.filter(({ resourceId }) => resourceId !== item.resourceId) })}>Quitar</button></li>)}
        </ul>
        <p class="creator-owner__catalog-selected" data-catalog-selected-count aria-live="polite">{editor.selected.length ? `${editor.selected.length} ${editor.selected.length === 1 ? 'recurso seleccionado.' : 'recursos seleccionados.'}` : 'Ningún recurso seleccionado.'}</p>
        <div class="creator-owner__field"><label htmlFor="owner-claim-urls">URLs conocidas <span>(opcional, una por línea)</span></label><textarea id="owner-claim-urls" name="knownUrls" rows={4} data-claim-urls autoComplete="url" value={editor.knownUrls} onInput={(event) => onUpdateClaim({ knownUrls: (event.currentTarget as HTMLTextAreaElement).value })} /></div>
        <div class="creator-owner__field"><label htmlFor="owner-claim-evidence">Contexto privado <span>(opcional)</span></label><textarea id="owner-claim-evidence" name="evidence" rows={3} maxLength={2000} data-claim-evidence value={editor.evidence} onInput={(event) => onUpdateClaim({ evidence: (event.currentTarget as HTMLTextAreaElement).value })} /><small>Hasta 2000 caracteres. Sólo lo ven quienes gestionan esta solicitud.</small></div>
        <p class="creator-owner__status" data-claim-status role="status" aria-live="polite">{statusText}</p>
        {attemptMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict' || checking) && <section class="creator-owner__conflict" data-claim-recovery aria-live="polite"><p>{state.attempt.status === 'checking' ? 'Comprobando solicitudes…' : attemptMessage}</p><button class="button button--outline" type="button" data-claim-check disabled={checking} onClick={onCheckClaim}>Comprobar solicitudes</button></section>}
        <div class="creator-owner__dialog-actions"><button class="button button--dark" type="submit" data-claim-submit disabled={!canWrite || !(editor.selected.length || editor.knownUrls.trim())}>Enviar solicitud</button><button class="button button--outline" type="button" data-owner-cancel data-claim-cancel onClick={onRequestClose}>Cancelar</button></div>
      </form>}

      {prompt && <div class="creator-owner__exit" data-owner-exit-prompt role="alertdialog" aria-labelledby="owner-exit-title" aria-describedby="owner-exit-copy">
        <h3 id="owner-exit-title">Tienes cambios sin guardar</h3>
        <p id="owner-exit-copy">Puedes guardar esta corrección, descartarla o seguir editando.</p>
        {promptRecovery && <section class="creator-owner__conflict" data-exit-recovery>
          <p>{'message' in state.attempt ? state.attempt.message : 'Comprobando el estado guardado…'}</p>
          {state.attempt.status === 'uncertain' && state.attempt.comparison?.canAdopt && <button class="button button--outline" type="button" data-owner-adopt
            onClick={() => onAdopt(state.attempt.status === 'uncertain' ? state.attempt.comparison?.id ?? '' : '')}>
            {promptListAttempt ? 'Usar la lista guardada' : editor ? adoptLabel(editor) : 'Usar los datos guardados'}
          </button>}
          {(state.attempt.status === 'uncertain' || state.attempt.status === 'conflict') && !state.attempt.comparison && <button id="owner-exit-compare" class="button button--outline" type="button" data-owner-compare onClick={onCheck}>{editor ? recoveryActionLabel(editor, state.attempt.status) : 'Comprobar'}</button>}
          {state.attempt.status === 'checking' && <p role="status" aria-live="polite">Comprobando…</p>}
        </section>}
        <div class="creator-owner__dialog-actions">
          {editor && <button class="button button--dark" type="button" data-owner-exit-save disabled={!canWrite} onClick={() => onExit('save')}>Guardar y salir</button>}
          <button class="button button--outline" type="button" data-owner-exit-discard disabled={state.attempt.status === 'sending'} onClick={() => onExit('discard')}>Descartar cambios</button>
          <button class="button button--outline" type="button" data-owner-exit-continue onClick={() => onExit('continue')}>Seguir editando</button>
        </div>
      </div>}
    </div>
  </dialog>;
}

function Recovery({ state, editor, rows, canAdopt, onCheck, onAdopt }: {
  state: CreatorOwnerState;
  editor: CreatorOwnerEditor | CreatorOwnerLinkEditor;
  rows: Array<[string, string, string]>;
  canAdopt: boolean;
  onCheck(): void;
  onAdopt(id: string): void;
}) {
  const attempt = state.attempt;
  if (attempt.status !== 'uncertain' && attempt.status !== 'conflict' && attempt.status !== 'checking') return null;
  const intent = 'intent' in attempt ? attempt.intent : undefined;
  if (!intent || intent.editorKey !== editor.key) return null;
  const comparison = attempt.status === 'uncertain' ? attempt.comparison : undefined;
  const comparisonActionLabel = editor.kind === 'series' && !editor.baseSeries && comparison && !comparison.seriesId
    ? 'Usar la versión actual del perfil' : adoptLabel(editor);
  return <section class="creator-owner__conflict" data-owner-conflict={true} data-series-conflict={editor.kind === 'series' ? true : undefined} aria-live="polite">
    <h3>{editor.kind === 'move-chapter' || editor.kind === 'move-link' ? 'El orden cambió' : editor.kind === 'series' ? 'La serie cambió' : editor.kind === 'add-link' ? 'Comprueba la URL original' : 'Compara con lo guardado'}</h3>
    <p data-owner-conflict-copy>{attempt.status === 'checking' ? 'Consultando el estado guardado…' : attempt.message}</p>
    {comparison && <>
      <div class="creator-owner__comparison" data-owner-comparison>
        <p>{comparison.message}</p>
        {rows.length > 0 && <dl>{rows.map(([label, saved, local]) => <div key={label}><dt>{label}</dt><dd>{comparisonSavedLabel(label)}: {savedValue(saved)} | Tu corrección: {savedValue(local)}</dd></div>)}</dl>}
      </div>
      {canAdopt && <button class="button button--outline" type="button" data-owner-adopt onClick={() => onAdopt(comparison.id)}>{comparisonActionLabel}</button>}
      <button class="button button--outline" type="button" data-owner-compare onClick={onCheck}>Comparar con lo guardado</button>
    </>}
    {!comparison && <button id="owner-compare" class="button button--outline" type="button" data-owner-compare disabled={attempt.status === 'checking'} onClick={onCheck}>{attempt.status === 'checking' ? 'Comprobando…' : recoveryActionLabel(editor, attempt.status)}</button>}
  </section>;
}

function CatalogPicker({ state, mode, selected, onSearch, onPage, onRetry, onSelect }: {
  state: CreatorOwnerState;
  mode: 'reference' | 'claim';
  selected: string[];
  onSearch(value: string): void;
  onPage(value: number): void;
  onRetry(): void;
  onSelect(item: CreatorCatalogSelectionDTO, checked: boolean): void;
}) {
  const resultsRef = useRef<HTMLUListElement>(null);
  const catalog = state.catalog;
  const entries = catalog.entries ?? [];
  const selection = pageCreatorOwnerCatalog(entries, catalog.search, catalog.page);
  const rows = catalog.needsRefresh ? [] : selection.rows;
  const hasRejectedVisibleReference = mode === 'reference' && selection.rows.some(({ id, url }) =>
    catalog.rejectedReferenceSelections.some((rejected) => rejected.id === id && rejected.url === url));
  const canRefresh = catalog.status === 'error' || catalog.needsRefresh || catalog.status === 'ready' && hasRejectedVisibleReference;
  const loadLabel = catalog.status === 'loading' ? 'Cargando el catálogo…'
    : catalog.status === 'error' ? catalog.message ?? 'No pudimos cargar el catálogo.'
      : catalog.needsRefresh ? catalog.message ?? 'Actualiza el catálogo antes de continuar.'
        : catalog.status === 'ready' ? `${selection.matches.length} ${selection.matches.length === 1 ? 'resultado' : 'resultados'}` : 'Busca contenido existente por título o URL.';

  return <section class="creator-owner__catalog" data-owner-catalog aria-label="Buscar contenido publicado" aria-busy={catalog.status === 'loading'}>
    <div class="creator-owner__catalog-search" role="search">
      <div class="creator-owner__field"><label htmlFor="owner-catalog-search">Buscar por título o URL</label>
        <input id="owner-catalog-search" type="search" name="buscarCatalogo" data-catalog-search autoComplete="off" value={catalog.search}
          onInput={(event) => onSearch((event.currentTarget as HTMLInputElement).value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); resultsRef.current?.focus(); } }} />
      </div>
      <button class="button button--outline" type="button" data-catalog-search-submit disabled={catalog.status !== 'ready' || catalog.needsRefresh}
        onClick={() => { onSearch(catalog.search); resultsRef.current?.focus(); }}>Buscar</button>
    </div>
    <p class="creator-owner__status" data-catalog-index-status role={catalog.status === 'error' ? 'alert' : 'status'} aria-live="polite">{loadLabel}</p>
    {canRefresh && <button class="button button--outline" type="button" data-catalog-retry onClick={onRetry}>{catalog.status === 'error' ? 'Reintentar carga del catálogo' : 'Actualizar catálogo'}</button>}
    {catalog.status === 'ready' && !catalog.needsRefresh && <>
      <p data-catalog-count aria-live="polite">{selection.matches.length} {selection.matches.length === 1 ? 'resultado' : 'resultados'}</p>
      <ul class="creator-owner__catalog-results" data-catalog-results aria-label="Resultados del catálogo" tabIndex={-1} ref={resultsRef}>
        {rows.map((item) => {
          const rejected = mode === 'reference' && catalog.rejectedReferenceSelections.some(({ id, url }) => id === item.id && url === item.url);
          return <li class="creator-owner__catalog-row" data-catalog-row={item.id} key={item.id}>
          <label><input type={mode === 'reference' ? 'radio' : 'checkbox'} name={mode === 'reference' ? 'catalogReference' : undefined}
            data-catalog-select data-resource-id={item.id} checked={selected.includes(item.id)}
            disabled={rejected}
            aria-label={`${mode === 'claim' ? 'Solicitar edición de' : 'Seleccionar'} ${item.title}`}
            onChange={(event) => onSelect(item, event.currentTarget.checked)} />
            <span class="creator-owner__catalog-item"><strong>{item.title}</strong><span>{item.url}</span>
              {rejected && <span data-catalog-rejected>URL desactualizada.</span>}
            </span>
          </label>
        </li>; })}
      </ul>
      <p class="creator-owner__empty" data-catalog-empty hidden={selection.matches.length > 0}>
        {entries.length ? 'No hay recursos que coincidan con la búsqueda.' : 'El catálogo no tiene recursos disponibles en este momento.'}
      </p>
      <nav class="creator-owner__catalog-pagination" aria-label="Páginas del catálogo">
        <button class="button button--outline" type="button" data-catalog-page="previous" disabled={selection.page <= 1} onClick={() => onPage(selection.page - 1)}>Anterior</button>
        <span data-catalog-page-label aria-live="polite">Página {selection.page} de {selection.pageCount}</span>
        <button class="button button--outline" type="button" data-catalog-page="next" disabled={selection.page >= selection.pageCount} onClick={() => onPage(selection.page + 1)}>Siguiente</button>
      </nav>
    </>}
  </section>;
}

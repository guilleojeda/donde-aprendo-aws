import { useEffect, useRef } from 'preact/hooks';
import type { CreatorEditorDTO, CreatorProfileDTO } from '../../types/creators';
import type { CreatorOwnerAttempt, CreatorOwnerEditor, CreatorOwnerState } from '../../lib/creator-owner-state';

interface Props {
  state: CreatorOwnerState;
  onUpdateProfile(value: { displayName?: string; slug?: string; city?: string; country?: string; bio?: string; programs?: CreatorProfileDTO['programs'] }): void;
  onUpdateSocial(key: 'instagram' | 'x' | 'linkedin' | 'awsBuilder' | 'website', value: string): void;
  onUpdateSeries(value: { name?: string; slug?: string; description?: string }, manuallyEditedSlug?: boolean): void;
  onUpdateMove(value: string): void;
  onSetMoveSuggestion(value?: number): void;
  onSetPhoto(file?: File): void;
  onSubmit(): void;
  onRequestClose(): void;
  onCheck(): void;
  onAdopt(comparisonId: string): void;
  onExit(action: 'save' | 'discard' | 'continue'): void;
  onCheckSession(): void;
}

const PROGRAMS: CreatorProfileDTO['programs'] = ['User Group Leaders', 'Community Builders', 'Heroes'];
const SOCIALS = [
  ['instagram', 'Instagram'],
  ['x', 'X'],
  ['linkedin', 'LinkedIn'],
  ['awsBuilder', 'AWS Builder Center'],
  ['website', 'Sitio web o newsletter'],
] as const;

function attemptForEditor(attempt: CreatorOwnerAttempt, editor: CreatorOwnerEditor): boolean {
  return 'intent' in attempt && attempt.intent.editorKey === editor.key;
}

function comparisonRows(editor: CreatorOwnerEditor, data: CreatorEditorDTO, comparisonSeriesId?: string): Array<[string, string, string]> {
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
    const recovered = saved ?? (editor.baseSeries === null && comparisonSeriesId ? data.series.find(({ id }) => id === comparisonSeriesId) : undefined);
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
  return [];
}

function checkLabel(editor: CreatorOwnerEditor): string {
  return editor.kind === 'photo' ? 'Comprobar qué foto quedó activa' : 'Comprobar';
}

function recoveryActionLabel(editor: CreatorOwnerEditor, status: CreatorOwnerAttempt['status']): string {
  return status === 'conflict' && editor.kind !== 'photo' ? 'Comparar con lo guardado' : checkLabel(editor);
}

function adoptLabel(editor: CreatorOwnerEditor): string {
  if (editor.kind === 'profile') return editor.section === 'redes' ? 'Usar las redes guardadas' : 'Usar los datos guardados';
  if (editor.kind === 'series') return editor.baseSeries ? 'Conservar mi corrección' : 'Continuar con el contenido guardado';
  if (editor.kind === 'move-chapter') return 'Conservar este destino';
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
    default: return `Valor guardado (${label})`;
  }
}

export default function CreatorOwnerEditorDialog({ state, onUpdateProfile, onUpdateSocial, onUpdateSeries, onUpdateMove, onSetMoveSuggestion, onSetPhoto, onSubmit, onRequestClose, onCheck, onAdopt, onExit, onCheckSession }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const editor = state.editor;
  const editorIsDialog = editor && editor.kind !== 'create-profile';
  const prompt = state.location.prompt === 'exit';
  const shouldOpenDialog = Boolean(editorIsDialog || prompt);
  const attemptMatches = editor ? attemptForEditor(state.attempt, editor) : false;
  const checking = attemptMatches && state.attempt.status === 'checking';
  const canWrite = state.runtimeReady && state.session.state === 'ready'
    && state.attempt.status !== 'sending' && !checking
    && !(attemptMatches && (state.attempt.status === 'uncertain' || state.attempt.status === 'conflict'));
  const dialogTitle = !editor ? 'Tu página' : editor.kind === 'create-profile' ? 'Prepara tu página' : editor.kind === 'profile' ? editor.section === 'datos' ? 'Editar datos' : 'Editar redes'
    : editor.kind === 'photo' ? 'Editar foto'
      : editor.kind === 'series' ? editor.baseSeries ? 'Editar serie' : 'Crear serie'
        : editor.kind === 'move-chapter' ? 'Mover capítulo' : '';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (shouldOpenDialog) {
      if (!dialog.open) dialog.showModal();
      if (prompt) dialog.querySelector<HTMLElement>('[data-owner-exit-save]')?.focus({ preventScroll: true });
      else if (editorIsDialog) {
        const selector = editor?.kind === 'photo' ? 'input[type="file"]' : 'input:not([type="hidden"]), textarea';
        dialog.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
      }
    } else if (dialog.open) dialog.close();
  }, [shouldOpenDialog, editorIsDialog ? editor?.key : undefined, prompt]);

  const activeComparison = attemptMatches && state.attempt.status === 'uncertain' ? state.attempt.comparison : undefined;
  const rows = editor && activeComparison ? comparisonRows(editor, activeComparison.snapshot, activeComparison.seriesId) : [];
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

      {prompt && <div class="creator-owner__exit" data-owner-exit-prompt role="alertdialog" aria-labelledby="owner-exit-title" aria-describedby="owner-exit-copy">
        <h3 id="owner-exit-title">Tienes cambios sin guardar</h3>
        <p id="owner-exit-copy">Puedes guardar esta corrección, descartarla o seguir editando.</p>
        {promptRecovery && <section class="creator-owner__conflict" data-exit-recovery>
          <p>{'message' in state.attempt ? state.attempt.message : 'Comprobando el estado guardado…'}</p>
          {state.attempt.status === 'uncertain' && state.attempt.comparison?.canAdopt && <button class="button button--outline" type="button" data-owner-adopt
            onClick={() => onAdopt(state.attempt.status === 'uncertain' ? state.attempt.comparison?.id ?? '' : '')}>
            {promptListAttempt ? 'Usar la lista guardada' : editor ? adoptLabel(editor) : 'Usar los datos guardados'}
          </button>}
          {(state.attempt.status === 'uncertain' || state.attempt.status === 'conflict') && !state.attempt.comparison && <button class="button button--outline" type="button" data-owner-compare onClick={onCheck}>{editor ? recoveryActionLabel(editor, state.attempt.status) : 'Comprobar'}</button>}
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
  editor: CreatorOwnerEditor;
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
    <h3>{editor.kind === 'move-chapter' ? 'El orden de capítulos cambió' : editor.kind === 'series' ? 'La serie cambió' : 'Compara con lo guardado'}</h3>
    <p data-owner-conflict-copy>{attempt.status === 'checking' ? 'Consultando el estado guardado…' : attempt.message}</p>
    {comparison && <>
      <div class="creator-owner__comparison" data-owner-comparison>
        <p>{comparison.message}</p>
        {rows.length > 0 && <dl>{rows.map(([label, saved, local]) => <div key={label}><dt>{label}</dt><dd>{comparisonSavedLabel(label)}: {savedValue(saved)} | Tu corrección: {savedValue(local)}</dd></div>)}</dl>}
      </div>
      {canAdopt && <button class="button button--outline" type="button" data-owner-adopt onClick={() => onAdopt(comparison.id)}>{comparisonActionLabel}</button>}
      <button class="button button--outline" type="button" data-owner-compare onClick={onCheck}>Comparar con lo guardado</button>
    </>}
    {!comparison && <button class="button button--outline" type="button" data-owner-compare disabled={attempt.status === 'checking'} onClick={onCheck}>{attempt.status === 'checking' ? 'Comprobando…' : recoveryActionLabel(editor, attempt.status)}</button>}
  </section>;
}

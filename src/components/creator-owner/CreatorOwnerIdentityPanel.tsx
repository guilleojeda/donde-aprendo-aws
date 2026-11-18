import type { ComponentChildren } from 'preact';
import type { CreatorSocial } from '../../types/creators';
import { canonicalCreatorPath, isPublicCreator, safeCreatorSocialUrl } from '../../lib/creator-public.mjs';
import { CREATOR_FIELD_LIMITS, CREATOR_SLUG_MIN_LENGTH, CREATOR_SLUG_PATTERN, CREATOR_SOCIALS } from '../../lib/creator-values.mjs';
import { creatorOwnerCanSubmitEditor, deriveCreatorOwnerRecoveryAction, type CreatorOwnerRecoveryChoice, type CreatorOwnerState } from '../../lib/creator-owner-state';

const SOCIAL_LABELS: Record<CreatorSocial, string> = {
  instagram: 'Instagram', x: 'X', linkedin: 'LinkedIn', awsBuilder: 'AWS Builder Center', website: 'Sitio web o newsletter',
};
const SOCIALS = CREATOR_SOCIALS.map((key) => ({ key, label: SOCIAL_LABELS[key] }));

interface Props {
  state: CreatorOwnerState;
  children?: ComponentChildren;
  logout?: ComponentChildren;
  showActivitySummary?: boolean;
  disabled: boolean;
  onOpenProfile(section: 'datos' | 'redes' | 'foto'): void;
  onCreateProfile(): void;
  onPublish(): void;
  onActivityPeriod(period: 7 | 30): void;
  onRetryActivity(): void;
  onCreateProfileInput(value: { displayName?: string; slug?: string }): void;
  onRetryRead(): void;
  onCheckSession(): void;
  onResolveRecovery(choice: CreatorOwnerRecoveryChoice): void;
  onSaveRecoveryDraft(): void;
  onCopyLink(url: string): void;
}

function socialLabel(value: string | undefined): string {
  return value ?? '—';
}

function ComparisonRows({ rows }: { rows: Array<[string, string, string]> }) {
  return <dl>{rows.map(([label, saved, draft]) => <div key={label}>
    <dt>{label}</dt><dd>Guardado: {saved || '—'} | Tu borrador: {draft || '—'}</dd>
  </div>)}</dl>;
}

function OwnerSectionNavigation({ view, period }: { view: CreatorOwnerState['location']['view']; period: 7 | 30 }) {
  return <nav class="creator-owner__link-tools" aria-label="Secciones de Tu página">
    <a class="button button--outline" data-owner-navigation aria-current={view === 'series' ? 'page' : undefined} href="/cuenta/?vista=series">Series</a>
    <a class="button button--outline" data-owner-navigation aria-current={view === 'enlaces' ? 'page' : undefined} href="/cuenta/?vista=enlaces">Enlaces</a>
    <a class="button button--outline" data-owner-navigation aria-current={view === 'estadisticas' ? 'page' : undefined} href={`/cuenta/?vista=estadisticas&periodo=${period}&pagina=1`}>Estadísticas</a>
    <a class="button button--outline" data-owner-navigation aria-current={view === 'solicitudes' ? 'page' : undefined} href="/cuenta/?vista=solicitudes">Solicitudes</a>
  </nav>;
}

export default function CreatorOwnerIdentityPanel({ state, children, logout, showActivitySummary = true, disabled, onOpenProfile, onCreateProfile, onPublish, onActivityPeriod, onRetryActivity, onCreateProfileInput, onRetryRead, onCheckSession, onResolveRecovery, onSaveRecoveryDraft, onCopyLink }: Props) {
  const profile = state.observed.profile;
  const isPublic = isPublicCreator(profile);
  const operation = state.operation;
  const recoveryAction = deriveCreatorOwnerRecoveryAction(state);
  const createEditor = state.editor?.kind === 'create-profile' ? state.editor : undefined;
  const createLocked = operation.status !== 'idle';
  const createMatchesOperation = Boolean(createEditor && operation.status !== 'idle' && 'intent' in operation
    && operation.intent?.editorKey === createEditor.key);
  const createCanSaveAfterConflict = Boolean(createEditor && operation.status === 'conflict'
    && creatorOwnerCanSubmitEditor({ ...state, operation: { status: 'idle' } }));
  const createRows = createEditor ? [
    ['Nombre visible', profile?.displayName ?? 'No hay página guardada', createEditor.draft.displayName],
    ['Dirección', profile?.slug ?? '—', createEditor.draft.slug],
  ] as Array<[string, string, string]> : undefined;
  const publishOperation = operation.status !== 'idle' && 'intent' in operation && operation.intent?.action === 'publish-profile';
  const createRecoveryAction = createMatchesOperation && recoveryAction.surface === 'identity' ? recoveryAction : undefined;
  const publishRecoveryAction = publishOperation && recoveryAction.surface === 'identity' ? recoveryAction : undefined;
  const photoPath = profile?.photo?.version !== undefined
    ? `/media/fotos/${encodeURIComponent(profile.id)}/${encodeURIComponent(String(profile.photo.version))}.webp`
    : undefined;
  const canonicalPath = profile ? canonicalCreatorPath(profile.slug) : undefined;
  let canonicalUrl: string | undefined;
  if (canonicalPath) {
    try { canonicalUrl = new URL(canonicalPath, state.publicOrigin).href; } catch { canonicalUrl = canonicalPath; }
  }
  const canReadActivity = Boolean(profile?.published);
  const activity = state.activity;
  const activityStatus = activity.message ?? (activity.status === 'loading' || activity.status === 'idle' ? `Cargando estadísticas de los últimos ${activity.period} días…`
    : activity.status === 'ready' ? activity.report?.freshness === 'stale' ? 'No pudimos actualizar; mostramos el informe anterior y conservamos sus fechas.' : 'Actividad actualizada.' : '');
  const hasActivityWarning = Boolean(activity.report?.warnings.length);
  const formattedCount = (value: number | null | undefined) => value === null ? 'Datos limitados'
    : typeof value === 'number' ? new Intl.NumberFormat('es-AR').format(value) : '—';
  const formatDate = (value: string | undefined, withTime = false) => {
    if (!value) return '';
    const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
    return new Intl.DateTimeFormat('es-AR', withTime
      ? { dateStyle: 'medium', timeStyle: 'short', timeZone: activity.report?.range.timeZone ?? 'UTC' }
      : { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  };

  return <div class="creator-owner" data-creator-owner data-owner-root data-csrf={state.session.state === 'ready' ? state.session.csrfToken : ''}
    data-session-binding={state.sessionBinding} data-public-origin={state.publicOrigin} data-creator-version={state.observed.creatorVersion} data-owner-operation={operation.status}>
    <div class="creator-owner__account-bar">
      <a class="creator-owner__back" data-owner-navigation href="/" aria-label="Volver al sitio">Volver al sitio</a>
      <details class="creator-owner__account-menu">
        <summary aria-label="Abrir menú de cuenta">
          <img class="creator-owner__avatar" src={photoPath} alt="" width="36" height="36" data-owner-avatar hidden={!photoPath} />
          <span class="creator-owner__avatar creator-owner__avatar--initials" aria-hidden="true" data-owner-avatar-initial hidden={Boolean(photoPath)}>{profile?.displayName.slice(0, 1).toUpperCase() ?? state.accountEmail.slice(0, 1).toUpperCase()}</span>
          <span>Cuenta</span>
        </summary>
        <div class="creator-owner__account-popover">
          <p class="creator-owner__email">{state.accountEmail}</p>
          {state.isAdmin && <a data-owner-navigation href="/cuenta/administracion/">Administración</a>}
          {logout}
        </div>
      </details>
    </div>

    <main id="contenido" class="creator-owner__main site-container" tabindex={-1}>
      <header class="creator-owner__page-heading">
        <p class="creator-owner__eyebrow">Espacio de creador</p>
        <h1>Tu página</h1>
        <p>Administra tu página y comparte su enlace cuando esté visible.</p>
      </header>

      {state.message && <p class={`creator-owner__status${state.message.kind === 'error' ? ' creator-owner__status--error' : ''}`} data-owner-status role={state.message.kind === 'error' ? 'alert' : 'status'} aria-live="polite">{state.message.text}</p>}
      {state.session.state !== 'ready' && <section class="creator-owner__status" data-session-recovery-shell
        hidden={Boolean(state.editor && state.editor.kind !== 'create-profile')}>
        <p data-session-recovery-status role="status" aria-live="polite">{state.session.message}</p>
        {state.session.state === 'recovery-required' || state.session.state === 'checking'
          ? <>
            <a class="button button--outline" data-session-recovery-sign-in href="/cuenta/ingresar/" target="_blank" rel="noopener noreferrer">Ingresar en otra pestaña</a>
            <button class="button button--outline" type="button" data-session-recovery-check disabled={state.session.state === 'checking'} onClick={onCheckSession}>Comprobar sesión</button>
          </>
          : <a class="button button--outline" data-session-recovery-new href="/cuenta/">Abrir una página nueva</a>}
      </section>}

      {(createEditor || !profile) && <section class="creator-owner__create" data-owner-create-panel aria-labelledby="creator-owner-create-title">
        <p class="creator-owner__eyebrow">Primer paso</p>
        <h2 id="creator-owner-create-title">{profile ? 'Borrador conservado' : 'Prepara tu página'}</h2>
        <p>{profile ? 'Ya hay una página guardada. Conservamos el borrador original para que puedas revisar qué enviaste.' : 'El nombre y la dirección se pueden elegir por separado. Al crearla queda como borrador; publicar es una acción posterior.'}</p>
        <form class="creator-owner__form" data-owner-form="crear" onSubmit={(event) => { event.preventDefault(); if (event.currentTarget instanceof HTMLFormElement && event.currentTarget.reportValidity() && creatorOwnerCanSubmitEditor(state)) onCreateProfile(); }}>
          <div class="creator-owner__field">
            <label htmlFor="owner-create-name">Nombre visible</label>
            <input id="owner-create-name" name="displayName" value={createEditor?.draft.displayName ?? ''}
              autocomplete="name" maxlength={CREATOR_FIELD_LIMITS.displayName} required data-owner-create-name readOnly={createLocked}
              onInput={(event) => onCreateProfileInput({ displayName: (event.currentTarget as HTMLInputElement).value })} />
          </div>
          <div class="creator-owner__field">
            <label htmlFor="owner-create-slug">Dirección de tu página</label>
            <div class="creator-owner__slug-field"><span aria-hidden="true">/c/</span>
              <input id="owner-create-slug" name="slug" value={createEditor?.draft.slug ?? ''}
                required minlength={CREATOR_SLUG_MIN_LENGTH} maxlength={CREATOR_FIELD_LIMITS.slug} pattern={CREATOR_SLUG_PATTERN} autocomplete="off" autocapitalize="none" spellcheck={false} data-owner-create-slug readOnly={createLocked}
                onInput={(event) => onCreateProfileInput({ slug: (event.currentTarget as HTMLInputElement).value })} />
            </div>
            <small>3–40 caracteres: minúsculas, números y guiones sencillos.</small>
          </div>
          <button class="button button--dark" type="submit" disabled={disabled || !creatorOwnerCanSubmitEditor(state)}>Crear borrador</button>
          {(createRecoveryAction?.kind === 'retry' || createRecoveryAction?.kind === 'session-check') && operation.status === 'refresh-failed' && <section class="creator-owner__conflict" data-owner-recovery data-recovery-kind={operation.status} data-owner-stale role="alert">
            <p>{operation.message}</p><button class="button button--outline" type="button" data-owner-refresh-retry disabled={state.session.state !== 'ready'} onClick={onRetryRead}>Reintentar actualización</button>
          </section>}
          {createRecoveryAction?.kind === 'pending' && operation.status === 'reading' && <p class="creator-owner__status" data-owner-operation-message role="status" aria-live="polite">{operation.message}</p>}
          {createRecoveryAction && (createRecoveryAction.kind === 'compare' || createRecoveryAction.kind === 'resolve') && operation.status === 'unknown' && <section class="creator-owner__conflict" data-owner-recovery data-recovery-kind="unknown" aria-live="polite">
            <h3>No sabemos si se guardó</h3><p>{operation.message}</p>
            {operation.readCompleted && createRows && <ComparisonRows rows={createRows} />}
            {!operation.readCompleted ? <button class="button button--outline" type="button" data-owner-check disabled={state.session.state !== 'ready'} onClick={onRetryRead}>Comprobar estado guardado</button>
              : <div class="creator-owner__dialog-actions">
                <button class="button button--outline" type="button" data-owner-use-saved onClick={() => onResolveRecovery('saved')}>Usar lo guardado</button>
                <button class="button button--outline" type="button" data-owner-return-to-draft onClick={() => onResolveRecovery('draft')}>Volver al borrador</button>
              </div>}
          </section>}
          {createRecoveryAction?.kind === 'resolve' && operation.status === 'conflict' && <section class="creator-owner__conflict" data-owner-recovery data-recovery-kind="conflict" aria-live="polite">
            <h3>El contenido cambió</h3><p>{operation.message}</p>{operation.readCompleted && createRows && <ComparisonRows rows={createRows} />}
            <div class="creator-owner__dialog-actions">
              {createCanSaveAfterConflict && <button class="button button--dark" type="button" data-owner-conflict-save onClick={onSaveRecoveryDraft}>Guardar mi borrador</button>}
              <button class="button button--outline" type="button" data-owner-use-saved onClick={() => onResolveRecovery('saved')}>Usar lo guardado</button>
            </div>
          </section>}
        </form>
      </section>}

      {!profile && showActivitySummary && <section class="creator-owner__activity" data-owner-activity data-owner-profile-state="none" data-owner-creator-id=""
        data-owner-activity-initial-period={activity.period} aria-labelledby="owner-activity-title">
        <header class="creator-owner__section-heading">
          <div><p class="creator-owner__eyebrow">Actividad</p><h2 id="owner-activity-title">Estadísticas de tu página</h2></div>
        </header>
        <p class="creator-owner__activity-empty" data-owner-activity-empty>La actividad empieza cuando publiques tu página.</p>
      </section>}
      {!profile && <OwnerSectionNavigation view={state.location.view} period={activity.period} />}

      {profile && <div class="creator-owner__profile" data-owner-profile>
        <section class="creator-owner__identity" aria-labelledby="owner-profile-name">
          <div class="creator-owner__identity-heading">
            <img class="creator-owner__photo" src={photoPath} alt="Foto de perfil" width="96" height="96" data-owner-photo hidden={!photoPath} />
            <div class="creator-owner__photo creator-owner__photo--placeholder" aria-hidden="true" data-owner-photo-placeholder hidden={Boolean(photoPath)}>{profile.displayName.slice(0, 1).toUpperCase()}</div>
            <div class="creator-owner__identity-copy">
              <p class="creator-owner__eyebrow">Identidad pública</p>
              <h2 id="owner-profile-name" data-owner-name tabIndex={-1}>{profile.displayName}</h2>
              <p class="creator-owner__slug" data-owner-slug>{canonicalPath}</p>
              {(profile.hidden || !profile.published) && <span class="creator-owner__badge" data-owner-state>{profile.hidden ? 'Oculta' : 'Borrador'}</span>}
            </div>
          </div>
          <div class="creator-owner__profile-actions">
            <button class="button button--outline" type="button" data-owner-edit="datos" disabled={disabled} onClick={() => onOpenProfile('datos')}>Editar datos</button>
            <button class="button button--outline" type="button" data-owner-edit="redes" disabled={disabled} onClick={() => onOpenProfile('redes')}>Editar redes</button>
            <button class="button button--outline" type="button" data-owner-edit="foto" disabled={disabled} onClick={() => onOpenProfile('foto')}>Editar foto</button>
          </div>
        </section>

        <section class="creator-owner__public" aria-label="Página pública" data-owner-public>
          {isPublic && <>
            <p data-owner-public-copy>Tu página está publicada y visible.</p>
            <a class="button button--outline" data-owner-public-link href={canonicalUrl} target="_blank" rel="noopener noreferrer" aria-label="Ver página pública (abre en otra pestaña)">Ver página pública <span aria-hidden="true">↗</span></a>
            <button class="button button--outline" type="button" data-owner-copy onClick={() => {
              if (!canonicalUrl) return;
              onCopyLink(canonicalUrl);
            }}>Copiar enlace</button>
          </>}
          {profile.hidden && <p data-owner-hidden-copy>La página está oculta por administración. Puedes editar tus datos; sólo administración puede cambiar su visibilidad.</p>}
          {!profile.published && <>
            <p data-owner-draft-copy>Tu página está en borrador. Puedes completar el perfil y publicarla cuando esté lista.</p>
            {!profile.hidden && <button class="button button--dark" type="button" data-owner-publish disabled={disabled} onClick={onPublish}>Publicar página</button>}
          </>}
          {publishRecoveryAction?.kind === 'pending' && operation.status === 'reading' && <p class="creator-owner__status" data-owner-operation-message role="status" aria-live="polite">{operation.message}</p>}
          {(publishRecoveryAction?.kind === 'retry' || publishRecoveryAction?.kind === 'session-check') && operation.status === 'refresh-failed' && <section class="creator-owner__conflict" data-owner-recovery data-recovery-kind={operation.fact === 'unknown' ? 'unknown' : 'refresh-failed'} data-owner-stale role="alert" aria-live="polite">
            <h3>{operation.fact === 'unknown' ? 'No sabemos si se publicó' : 'No pudimos actualizar la publicación'}</h3>
            <p>{operation.message}</p>
            <button class="button button--outline" type="button" data-owner-refresh-retry disabled={state.session.state !== 'ready'} onClick={onRetryRead}>Reintentar actualización</button>
          </section>}
          {publishRecoveryAction?.kind === 'compare' && operation.status === 'unknown' && <section class="creator-owner__conflict" data-owner-recovery data-recovery-kind="unknown" aria-live="polite">
            <h3>No sabemos si se publicó</h3>
            <p>{operation.message}</p>
            <button class="button button--outline" type="button" data-owner-publish-check disabled={state.session.state !== 'ready'} onClick={onRetryRead}>Comprobar estado guardado</button>
          </section>}
          {publishRecoveryAction?.kind === 'resolve' && (operation.status === 'unknown' || operation.status === 'conflict') && operation.readCompleted && <section class="creator-owner__conflict" data-owner-recovery data-recovery-kind={operation.status} aria-live="polite">
            <h3>Estado de publicación comprobado</h3>
            <p>{operation.message}</p>
            <button class="button button--outline" type="button" data-owner-use-saved onClick={() => onResolveRecovery('saved')}>Usar lo guardado</button>
          </section>}
        </section>

        {showActivitySummary && <section class="creator-owner__activity" data-owner-activity data-owner-profile-state={profile.hidden ? 'hidden' : profile.published ? 'published' : 'draft'} data-owner-creator-id={profile.id}
          data-owner-activity-initial-period={activity.period} aria-labelledby="owner-activity-title">
          <header class="creator-owner__section-heading">
            <div><p class="creator-owner__eyebrow">Actividad</p><h2 id="owner-activity-title">Estadísticas de tu página</h2></div>
            {canReadActivity && <a class="creator-owner__activity-detail" data-owner-activity-detail data-owner-navigation href={`/cuenta/?vista=estadisticas&periodo=${activity.period}&pagina=1`}>Ver detalle</a>}
          </header>
          {canReadActivity ? <div class="creator-owner__activity-content" data-owner-activity-content>
            <div class="creator-owner__activity-totals" data-owner-activity-total-group aria-label={`Totales de los últimos ${activity.period} días`}>
              <div><span>Visitas</span><strong data-owner-activity-total="views">{formattedCount(activity.report?.totals.views)}</strong></div>
              <div><span>Visitantes estimados</span><strong data-owner-activity-total="visitors">{formattedCount(activity.report?.totals.visitors)}</strong></div>
              <div><span>Clics en enlaces</span><strong data-owner-activity-total="clicks">{formattedCount(activity.report?.totals.clicks)}</strong></div>
            </div>
            <div class="creator-owner__activity-feedback"><p data-owner-activity-status role="status" aria-live="polite">
              {activityStatus}{hasActivityWarning && <span class="creator-owner__activity-warning" data-owner-activity-warning>Parte del detalle puede estar incompleto.</span>}
            </p>
              {activity.status === 'error' || activity.report?.freshness === 'stale' ? <button class="button button--outline" data-owner-activity-retry type="button" onClick={onRetryActivity}>Reintentar</button> : null}
            </div>
            {activity.report && <div class="creator-owner__activity-context">
              <p><span>Período:</span> <time dateTime={activity.report.range.startDate}>{formatDate(activity.report.range.startDate)}</time> – <time dateTime={activity.report.range.endDate}>{formatDate(activity.report.range.endDate)}</time> <span>· Zona {activity.report.range.timeZone}</span></p>
              <p>Última actualización: <time dateTime={activity.report.updatedAt}>{formatDate(activity.report.updatedAt, true)}</time></p>
            </div>}
            <div class="creator-owner__activity-controls"><fieldset><legend>Período del resumen</legend>
              <button type="button" data-owner-activity-period="7" aria-pressed={activity.period === 7} onClick={() => onActivityPeriod(7)}>7 días</button>
              <button type="button" data-owner-activity-period="30" aria-pressed={activity.period === 30} onClick={() => onActivityPeriod(30)}>30 días</button>
            </fieldset></div>
            <details class="creator-owner__activity-help">
              <summary>Sobre estas estadísticas</summary>
              <p>Las visitas y los clics reúnen tu página y tus series. Los visitantes son estimados y no identifican personas con exactitud.</p>
              <p>La captura empieza cuando se observa actividad; no reconstruye el período anterior. Los datos recientes pueden tardar en procesarse y algunas personas bloquean la medición.</p>
            </details>
          </div> : <p class="creator-owner__activity-empty" data-owner-activity-empty>La actividad empieza cuando publiques tu página.</p>}
        </section>}

        <OwnerSectionNavigation view={state.location.view} period={activity.period} />

        <section class="creator-owner__details" aria-labelledby="owner-details-title">
          <div class="creator-owner__section-heading"><div><p class="creator-owner__eyebrow">Tu identidad</p><h2 id="owner-details-title">Sobre ti</h2></div></div>
          <dl class="creator-owner__facts">
            <div><dt>Ubicación</dt><dd data-owner-location>{[profile.city, profile.country].filter(Boolean).join(', ') || 'Sin ubicación agregada'}</dd></div>
            <div><dt>Programas de AWS</dt><dd data-owner-programs>{profile.programs.length ? profile.programs.join(', ') : 'Sin programas agregados'}</dd></div>
          </dl>
          <p class="creator-owner__bio" data-owner-bio>{profile.bio || 'Agrega una presentación breve para contar quién eres.'}</p>
        </section>
        <section class="creator-owner__socials" aria-labelledby="owner-socials-title">
          <div class="creator-owner__section-heading"><div><p class="creator-owner__eyebrow">Dónde encontrarte</p><h2 id="owner-socials-title">Redes y sitio web</h2></div></div>
          <ul data-owner-social-list>
            {SOCIALS.map(({ key, label }) => {
              const url = safeCreatorSocialUrl(profile.socials[key]);
              return <li data-owner-social={key} hidden={!url} key={key}>{url
                ? <a href={url} target="_blank" rel="noopener noreferrer"><span data-owner-social-label>{label}</span><span class="creator-owner__social-url" data-owner-social-url>{socialLabel(url)}</span></a>
                : <span><span data-owner-social-label>{label}</span><span class="creator-owner__social-url" data-owner-social-url>—</span></span>}</li>;
            })}
          </ul>
          <p class="creator-owner__empty" data-owner-no-socials hidden={SOCIALS.some(({ key }) => safeCreatorSocialUrl(profile.socials[key]))}>Aún no agregaste redes o enlaces externos.</p>
        </section>
      </div>}
      {children}
      <footer class="creator-owner__help"><a href="mailto:contact@dondeaprendoaws.com">¿Necesitas ayuda? Contacta al equipo.</a></footer>
    </main>
  </div>;
}

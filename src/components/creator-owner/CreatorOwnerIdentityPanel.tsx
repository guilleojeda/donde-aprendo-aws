import type { ComponentChildren } from 'preact';
import type { CreatorSocial } from '../../types/creators';
import type { CreatorOwnerState } from '../../lib/creator-owner-state';

const SOCIALS: Array<{ key: CreatorSocial; label: string }> = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'x', label: 'X' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'awsBuilder', label: 'AWS Builder Center' },
  { key: 'website', label: 'Sitio web o newsletter' },
];

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
  onCheck(): void;
  onCheckSession(): void;
  onAdopt(comparisonId: string): void;
  onCopyLink(url: string): void;
  onRetryCreateProfile(): void;
}

function safeSocialUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function socialLabel(value: string | undefined): string {
  return value ?? '—';
}

function OwnerSectionNavigation({ view, period }: { view: CreatorOwnerState['location']['view']; period: 7 | 30 }) {
  return <nav class="creator-owner__link-tools" aria-label="Secciones de Tu página">
    <a class="button button--outline" data-owner-navigation aria-current={view === 'series' ? 'page' : undefined} href="/cuenta/?vista=series">Series</a>
    <a class="button button--outline" data-owner-navigation aria-current={view === 'enlaces' ? 'page' : undefined} href="/cuenta/?vista=enlaces">Enlaces</a>
    <a class="button button--outline" data-owner-navigation aria-current={view === 'estadisticas' ? 'page' : undefined} href={`/cuenta/?vista=estadisticas&periodo=${period}&pagina=1`}>Estadísticas</a>
    <a class="button button--outline" data-owner-navigation aria-current={view === 'solicitudes' ? 'page' : undefined} href="/cuenta/?vista=solicitudes">Solicitudes</a>
  </nav>;
}

export default function CreatorOwnerIdentityPanel({ state, children, logout, showActivitySummary = true, disabled, onOpenProfile, onCreateProfile, onPublish, onActivityPeriod, onRetryActivity, onCreateProfileInput, onCheck, onCheckSession, onAdopt, onCopyLink, onRetryCreateProfile }: Props) {
  const profile = state.observed.profile;
  const photoPath = profile?.photo?.version !== undefined
    ? `/media/fotos/${encodeURIComponent(profile.id)}/${encodeURIComponent(String(profile.photo.version))}.webp`
    : undefined;
  const canonicalPath = profile ? `/c/${encodeURIComponent(profile.slug)}/` : undefined;
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
    data-session-binding={state.sessionBinding} data-public-origin={state.publicOrigin} data-profile-version={profile?.version}>
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
      {state.session.state !== 'ready' && <section class="creator-owner__status" data-session-recovery-shell>
        <p data-session-recovery-status role="status" aria-live="polite">{state.session.message}</p>
        {state.session.state === 'recovery-required' || state.session.state === 'checking'
          ? <>
            <a class="button button--outline" data-session-recovery-sign-in href="/cuenta/ingresar/" target="_blank" rel="noopener noreferrer">Ingresar en otra pestaña</a>
            <button class="button button--outline" type="button" data-session-recovery-check disabled={state.session.state === 'checking'} onClick={onCheckSession}>Comprobar sesión</button>
          </>
          : <a class="button button--outline" href="/cuenta/">Abrir una página nueva</a>}
      </section>}

      {!profile && <section class="creator-owner__create" data-owner-create-panel aria-labelledby="creator-owner-create-title">
        <p class="creator-owner__eyebrow">Primer paso</p>
        <h2 id="creator-owner-create-title">Prepara tu página</h2>
        <p>El nombre y la dirección se pueden elegir por separado. Al crearla queda como borrador; publicar es una acción posterior.</p>
        <form class="creator-owner__form" data-owner-form="crear" onSubmit={(event) => { event.preventDefault(); onCreateProfile(); }}>
          <div class="creator-owner__field">
            <label htmlFor="owner-create-name">Nombre visible</label>
            <input id="owner-create-name" name="displayName" value={state.editor?.kind === 'create-profile' ? state.editor.draft.displayName : ''}
              autocomplete="name" maxlength={120} required data-owner-create-name
              onInput={(event) => onCreateProfileInput({ displayName: (event.currentTarget as HTMLInputElement).value })} />
          </div>
          <div class="creator-owner__field">
            <label htmlFor="owner-create-slug">Dirección de tu página</label>
            <div class="creator-owner__slug-field"><span aria-hidden="true">/c/</span>
              <input id="owner-create-slug" name="slug" value={state.editor?.kind === 'create-profile' ? state.editor.draft.slug : ''}
                required minlength={3} maxlength={40} pattern="[a-z0-9]+(-[a-z0-9]+)*" autocomplete="off" autocapitalize="none" spellcheck={false} data-owner-create-slug
                onInput={(event) => onCreateProfileInput({ slug: (event.currentTarget as HTMLInputElement).value })} />
            </div>
            <small>3–40 caracteres: minúsculas, números y guiones sencillos.</small>
          </div>
          <button class="button button--dark" type="submit" disabled={disabled}>Crear borrador</button>
          {(state.attempt.status === 'uncertain' || state.attempt.status === 'conflict') && state.attempt.intent.kind === 'create-profile' && <button class="button button--outline" type="button" onClick={onCheck}>Comprobar</button>}
          {state.attempt.status === 'uncertain' && state.attempt.comparison && <section class="creator-owner__conflict" data-owner-conflict>
            <h3>Revisar el borrador</h3><p>{state.attempt.comparison.message}</p>
            {state.attempt.comparison.canAdopt && <button class="button button--outline" type="button" data-owner-adopt onClick={() => onAdopt(state.attempt.status === 'uncertain' ? state.attempt.comparison?.id ?? '' : '')}>Continuar con los datos guardados</button>}
            {!state.attempt.comparison.canAdopt && !state.observed.profile && <button class="button button--outline" type="button" onClick={onRetryCreateProfile}>Volver a intentar crear borrador</button>}
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
              <h2 id="owner-profile-name" data-owner-name>{profile.displayName}</h2>
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
          {profile.published && !profile.hidden && <>
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
          {state.attempt.status === 'uncertain' && state.attempt.intent.kind === 'publish' && <button class="button button--outline" type="button" data-owner-publish-check onClick={onCheck}>Comprobar estado guardado</button>}
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
              const url = safeSocialUrl(profile.socials[key]);
              return <li data-owner-social={key} hidden={!url} key={key}>{url
                ? <a href={url} target="_blank" rel="noopener noreferrer"><span data-owner-social-label>{label}</span><span class="creator-owner__social-url" data-owner-social-url>{socialLabel(url)}</span></a>
                : <span><span data-owner-social-label>{label}</span><span class="creator-owner__social-url" data-owner-social-url>—</span></span>}</li>;
            })}
          </ul>
          <p class="creator-owner__empty" data-owner-no-socials hidden={SOCIALS.some(({ key }) => safeSocialUrl(profile.socials[key]))}>Aún no agregaste redes o enlaces externos.</p>
        </section>
      </div>}
      {children}
      <footer class="creator-owner__help"><a href="mailto:contact@dondeaprendoaws.com">¿Necesitas ayuda? Contacta al equipo.</a></footer>
    </main>
  </div>;
}

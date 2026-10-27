import type { CreatorEditorDTO, CreatorProfileDTO, CreatorProgram, CreatorSocial } from '../types/creators';
import { createCreatorFormState, type FormValueSnapshot } from './creator-form-state';
import { createCreatorSessionRecovery } from './creator-session-recovery';
import { createCreatorWriteGuard, readCreatorVersionChanges } from './creator-write-state';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProfile(value: unknown): value is CreatorProfileDTO {
  return isRecord(value)
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.displayName === 'string' && typeof value.slug === 'string'
    && Number.isSafeInteger(value.version) && Number(value.version) >= 0
    && typeof value.published === 'boolean' && typeof value.hidden === 'boolean'
    && Array.isArray(value.programs) && isRecord(value.socials);
}

function isOwnerData(value: unknown): value is CreatorEditorDTO {
  return isRecord(value) && (value.profile === null || isProfile(value.profile))
    && Array.isArray(value.links) && Array.isArray(value.editableResources)
    && Array.isArray(value.claims) && Array.isArray(value.series);
}

const root = document.querySelector<HTMLElement>('[data-creator-owner]');
const initial = document.querySelector<HTMLScriptElement>('#creator-owner-data');
let state: CreatorEditorDTO | undefined;
if (root && initial?.textContent) {
  try {
    const parsed: unknown = JSON.parse(initial.textContent);
    if (isOwnerData(parsed)) state = parsed;
  } catch {
    state = undefined;
  }
}

const formState = root ? createCreatorFormState(root) : undefined;
const writeGuard = root ? createCreatorWriteGuard(root) : undefined;
let csrfToken = root?.dataset.csrf;
let activeForm: HTMLFormElement | undefined;
let activeEditor: 'datos' | 'redes' | 'foto' | undefined;
let returnFocus: HTMLElement | undefined;
let pendingExitAction: (() => void) | undefined;
let conflictProfile: CreatorProfileDTO | undefined;
let manualSlug = false;
let photoUploadId: string | undefined;
type ProfileFormAction = (event: Event) => Promise<void> | void;
const profileFormActions = new WeakMap<HTMLFormElement, ProfileFormAction>();

const dialog = root?.querySelector<HTMLDialogElement>('[data-owner-dialog]');
const exitPrompt = root?.querySelector<HTMLElement>('[data-owner-exit-prompt]');
const pageStatus = root?.querySelector<HTMLElement>('[data-owner-status]');
const sessionRecovery = root ? createCreatorSessionRecovery({
  root,
  ...(dialog ? { additionalRoot: dialog } : {}),
  isWriteActive: () => writeGuard?.isActive() ?? false,
  updateCsrf: (token) => {
    csrfToken = token;
    const logoutForm = root.querySelector<HTMLFormElement>('[data-account-logout]');
    const logoutToken = logoutForm?.querySelector<HTMLInputElement>('input[name="csrfToken"]');
    if (logoutForm && logoutToken) {
      logoutToken.value = token;
      formState?.commit(formState.capture(logoutForm));
    }
  },
}) : undefined;
const SOCIALS: Array<{ key: CreatorSocial; label: string }> = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'x', label: 'X' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'awsBuilder', label: 'AWS Builder Center' },
  { key: 'website', label: 'Sitio web o newsletter' },
];
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const PHOTO_UNCONFIRMED = 'No pudimos confirmar si la foto se guardó. Comprueba cuál está activa antes de volver a intentarlo.';

function formFor(name: string): HTMLFormElement | null {
  return root?.querySelector<HTMLFormElement>(`form[data-owner-form="${name}"]`) ?? null;
}

function field(form: HTMLFormElement | undefined | null, name: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  return form?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`) ?? null;
}

function announce(target: Element | null | undefined, message: string, kind: 'error' | 'success' | 'info' = 'info') {
  if (!(target instanceof HTMLElement)) return;
  target.textContent = message;
  target.dataset.kind = kind;
  target.hidden = false;
}

function clearAnnouncement(target: HTMLElement | null | undefined) {
  if (!target) return;
  target.textContent = '';
  target.hidden = true;
  delete target.dataset.kind;
}

function clearRecoveryNotice() {
  if (!root) return;
  root.querySelectorAll<HTMLElement>('[data-session-recovery-shell]').forEach((shell) => { shell.hidden = true; });
  root.querySelectorAll<HTMLElement>('[data-session-recovery-status]').forEach((status) => {
    status.textContent = '';
    status.hidden = true;
  });
  root.querySelectorAll<HTMLAnchorElement>('[data-session-recovery-sign-in]').forEach((link) => { link.hidden = true; });
  root.querySelectorAll<HTMLButtonElement>('[data-session-recovery-check]').forEach((button) => {
    button.hidden = true;
    button.disabled = false;
  });
}

function statusFor(name: string | undefined): HTMLElement | null {
  if (name === 'crear') return root?.querySelector<HTMLElement>('[data-owner-create-status]') ?? null;
  return name ? root?.querySelector<HTMLElement>(`[data-owner-form-status="${name}"]`) ?? null
    : root?.querySelector<HTMLElement>('[data-owner-profile-status]') ?? null;
}

function announceWrite(name: string | undefined, message: string, kind: 'error' | 'success' | 'info' = 'info') {
  if (sessionRecovery?.blocksWrites()) {
    if (name === 'foto') announce(statusFor(name), 'El archivo elegido sigue seleccionado. Comprueba la sesión antes de volver a pulsar «Subir y guardar foto».', 'info');
    return;
  }
  announce(statusFor(name), message, kind);
  announce(pageStatus, message, kind);
}

function statusMessage(status: number): string {
  if (status === 401) return sessionRecovery?.writeFailureMessage() ?? 'Tu sesión terminó. Vuelve a ingresar con la misma cuenta.';
  if (status === 403) return sessionRecovery?.blocksWrites()
    ? sessionRecovery.writeFailureMessage()
    : 'Tu cuenta no tiene permiso para completar esta acción.';
  if (status === 409) return 'El perfil cambió desde que abriste esta edición. Conservamos tu corrección para que compares las versiones antes de continuar.';
  if (status === 422) return 'Revisa los datos: el servicio no acepta alguno de ellos. Tus cambios siguen en el formulario.';
  if (status === 503 || status >= 500) return 'No pudimos guardar los cambios. Tus datos siguen en el formulario; inténtalo de nuevo en unos minutos.';
  return 'No pudimos completar la acción. Revisa los datos e inténtalo de nuevo.';
}

async function responsePayload(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.clone().json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

async function jsonRequest(path: string, method: string, body?: unknown): Promise<Response> {
  if (!csrfToken) throw new Error('missing-csrf');
  const response = await fetch(`${path.replace(/\/$/, '')}/`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'x-csrf-token': csrfToken,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  await sessionRecovery?.observeWriteResponse(response);
  return response;
}

async function runProfileFormAction(event: Event, action: ProfileFormAction) {
  if (sessionRecovery?.blocksWrites()) {
    event.preventDefault();
    sessionRecovery.announceBlocked();
    return;
  }
  await writeGuard?.run(event, () => action(event));
  if (!dialog?.open) runPendingExitAction();
}

function onWrite(form: HTMLFormElement | null, action: ProfileFormAction) {
  if (!form) return;
  profileFormActions.set(form, action);
  form.addEventListener('submit', (event) => runProfileFormAction(event, action));
}

function suggestedSlug(value: string): string {
  return value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

function setHidden(target: Element | null | undefined, hidden: boolean) {
  if (target instanceof HTMLElement) target.hidden = hidden;
}

function canonicalPath(profile: CreatorProfileDTO): string {
  return `/c/${encodeURIComponent(profile.slug)}/`;
}

function canonicalUrl(profile: CreatorProfileDTO): string {
  return new URL(canonicalPath(profile), root?.dataset.publicOrigin || window.location.href).href;
}

function photoPath(profile: CreatorProfileDTO): string | undefined {
  if (profile.photo?.version !== undefined) {
    return `/media/fotos/${encodeURIComponent(profile.id)}/${encodeURIComponent(String(profile.photo.version))}.webp`;
  }
  return undefined;
}

function safeSocialUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href.replace(/["<>]/g, (character) => encodeURIComponent(character))
      : undefined;
  } catch {
    return undefined;
  }
}

function textAt(selector: string, text: string) {
  const target = root?.querySelector<HTMLElement>(selector);
  if (target) target.textContent = text;
}

function setAnchor(target: HTMLAnchorElement | null | undefined, href: string | undefined) {
  if (!target) return;
  if (href) target.setAttribute('href', href);
  else target.removeAttribute('href');
}

function createPublicAction(kind: 'publish' | 'copy' | 'view'): HTMLElement | undefined {
  if (!root || typeof document.createElement !== 'function') return undefined;
  const publicArea = root.querySelector<HTMLElement>('[data-owner-public]');
  if (!publicArea) return undefined;
  if (kind === 'publish') {
    const button = document.createElement('button');
    button.className = 'button button--dark';
    button.type = 'button';
    button.dataset.ownerPublish = '';
    button.textContent = 'Publicar página';
    publicArea.append(button);
    return button;
  }
  if (kind === 'copy') {
    const button = document.createElement('button');
    button.className = 'button button--outline';
    button.type = 'button';
    button.dataset.ownerCopy = '';
    button.textContent = 'Copiar enlace';
    publicArea.append(button);
    return button;
  }
  const anchor = document.createElement('a');
  anchor.className = 'button button--outline';
  anchor.dataset.ownerPublicLink = '';
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.setAttribute('aria-label', 'Ver página pública (abre en otra pestaña)');
  anchor.textContent = 'Ver página pública ↗';
  publicArea.append(anchor);
  return anchor;
}

function updateSocials(profile: CreatorProfileDTO) {
  root?.querySelectorAll<HTMLElement>('[data-owner-social]').forEach((item) => {
    const key = item.dataset.ownerSocial as CreatorSocial | undefined;
    if (!key || !SOCIALS.some((social) => social.key === key)) return;
    const value = safeSocialUrl(profile.socials[key]);
    item.hidden = !value;
    const link = item.querySelector<HTMLAnchorElement>('a');
    setAnchor(link, value);
    const url = item.querySelector<HTMLElement>('[data-owner-social-url]');
    if (url) url.textContent = value ?? '';
  });
  const hasSocial = SOCIALS.some(({ key }) => Boolean(safeSocialUrl(profile.socials[key])));
  setHidden(root?.querySelector('[data-owner-no-socials]'), hasSocial);
}

function updateActivityProfile(profile: CreatorProfileDTO | null) {
  const activity = root?.querySelector<HTMLElement>('[data-owner-activity]');
  if (!activity) return;
  const profileState = profile?.hidden ? 'hidden' : profile?.published ? 'published' : profile ? 'draft' : 'none';
  const canReadActivity = Boolean(profile?.published);
  activity.dataset.ownerProfileState = profileState;
  activity.dataset.ownerCreatorId = profile?.id ?? '';
  setHidden(activity.querySelector('[data-owner-activity-content]'), !canReadActivity);
  const empty = activity.querySelector<HTMLElement>('[data-owner-activity-empty]');
  if (empty) {
    empty.textContent = profile
      ? 'La actividad empieza cuando publiques tu página.'
      : 'Prepara y publica tu página para comenzar a medir la actividad.';
    setHidden(empty, canReadActivity);
  }
  activity.querySelectorAll<HTMLElement>('[data-owner-activity-detail]').forEach((link) => { link.hidden = !canReadActivity; });
  if (typeof activity.dispatchEvent === 'function' && typeof Event === 'function') {
    activity.dispatchEvent(new Event('creator-owner:profile-updated'));
  }
}

function updateProfileView() {
  const profile = state?.profile;
  if (!root) return;
  setHidden(root.querySelector('[data-owner-create-panel]'), Boolean(profile));
  setHidden(root.querySelector('[data-owner-profile]'), !profile);
  updateActivityProfile(profile ?? null);
  if (!profile) return;

  textAt('[data-owner-name]', profile.displayName);
  textAt('[data-owner-slug]', canonicalPath(profile));
  textAt('[data-owner-location]', [profile.city, profile.country].filter(Boolean).join(', ') || 'Sin ubicación agregada');
  textAt('[data-owner-programs]', profile.programs.length ? profile.programs.join(', ') : 'Sin programas agregados');
  textAt('[data-owner-bio]', profile.bio || 'Agrega una presentación breve para contar quién eres.');
  const stateLabel = profile.hidden ? 'Oculta' : profile.published ? '' : 'Borrador';
  textAt('[data-owner-state]', stateLabel);
  setHidden(root.querySelector('[data-owner-state]'), !stateLabel);
  setHidden(root.querySelector('[data-owner-public-copy]'), !(profile.published && !profile.hidden));
  setHidden(root.querySelector('[data-owner-hidden-copy]'), !profile.hidden);
  setHidden(root.querySelector('[data-owner-draft-copy]'), profile.published);

  const publicLink = root.querySelector<HTMLAnchorElement>('[data-owner-public-link]') ?? createPublicAction('view') as HTMLAnchorElement | undefined;
  const copyButton = root.querySelector<HTMLButtonElement>('[data-owner-copy]') ?? createPublicAction('copy') as HTMLButtonElement | undefined;
  const publishButton = root.querySelector<HTMLButtonElement>('[data-owner-publish]') ?? createPublicAction('publish') as HTMLButtonElement | undefined;
  const visible = profile.published && !profile.hidden;
  setHidden(publicLink, !visible);
  setAnchor(publicLink, visible ? canonicalUrl(profile) : undefined);
  setHidden(copyButton, !visible);
  if (copyButton) copyButton.dataset.url = visible ? canonicalUrl(profile) : '';
  setHidden(publishButton, !(!profile.published && !profile.hidden));

  const imageUrl = photoPath(profile);
  root.querySelectorAll<HTMLImageElement>('[data-owner-photo], [data-owner-photo-preview], [data-owner-avatar]').forEach((image) => {
    setHidden(image, !imageUrl);
    if (imageUrl) image.setAttribute('src', imageUrl);
    image.setAttribute('alt', image.hasAttribute('data-owner-avatar') ? '' : `Foto de ${profile.displayName}`);
  });
  setHidden(root.querySelector('[data-owner-photo-placeholder]'), Boolean(imageUrl));
  const initial = root.querySelector<HTMLElement>('[data-owner-avatar-initial]');
  if (initial) {
    initial.textContent = profile.displayName.slice(0, 1).toUpperCase();
    setHidden(initial, Boolean(imageUrl));
  }
  updateSocials(profile);
}

function setFormFromProfile(form: HTMLFormElement, name: string, profile: CreatorProfileDTO) {
  if (name === 'datos') {
    const values: Record<string, string> = {
      displayName: profile.displayName,
      slug: profile.slug,
      city: profile.city ?? '',
      country: profile.country ?? '',
      bio: profile.bio ?? '',
      version: String(profile.version),
    };
    for (const [key, value] of Object.entries(values)) {
      const control = field(form, key);
      if (control) control.value = value;
    }
    form.querySelectorAll<HTMLInputElement>('input[name="programs"]').forEach((checkbox) => {
      checkbox.checked = profile.programs.includes(checkbox.value as CreatorProgram);
    });
    return;
  }
  if (name === 'redes') {
    for (const { key } of SOCIALS) {
      const control = field(form, `social-${key}`);
      if (control) control.value = profile.socials[key] ?? '';
    }
    const version = field(form, 'version');
    if (version) version.value = String(profile.version);
  }
}

function capture(form: HTMLFormElement): FormValueSnapshot | undefined {
  return formState?.capture(form);
}

function submitWasUnchanged(snapshot: FormValueSnapshot | undefined): boolean {
  formState?.commit(snapshot);
  return !(formState?.hasPendingChanges() ?? false);
}

function clearConflict(form: HTMLFormElement | undefined) {
  conflictProfile = undefined;
  const box = form?.querySelector<HTMLElement>('[data-owner-conflict]');
  setHidden(box, true);
  setHidden(box?.querySelector('[data-owner-comparison]'), true);
  setHidden(box?.querySelector('[data-owner-adopt]'), true);
}

function showConflict(form: HTMLFormElement | undefined, name: string | undefined) {
  const box = form?.querySelector<HTMLElement>('[data-owner-conflict]');
  setHidden(box, false);
  const copy = box?.querySelector<HTMLElement>('[data-owner-conflict-copy]');
  if (copy) copy.textContent = name === 'crear'
    ? 'Otra pestaña pudo crear la página mientras editabas, o la dirección elegida ya está ocupada. Compara lo que quedó guardado antes de continuar.'
    : 'El perfil cambió desde que abriste esta edición. Compara los valores guardados con tu corrección antes de continuar.';
  announceWrite(name, statusMessage(409), 'error');
}

function validateReceipt(
  payload: Record<string, unknown> | null,
  changes: Awaited<ReturnType<typeof readCreatorVersionChanges>>,
  current: CreatorProfileDTO | null,
  next: CreatorProfileDTO,
): boolean {
  if (!payload || changes === null) return false;
  if (current && current.id !== next.id) return false;
  const matching = changes.find((change) => change.entity === 'profile' && change.id === next.id);
  if (!current) return matching?.before === 0 && matching.after === next.version;
  if (changes.length === 0) return next.version === current.version;
  return matching?.before === current.version && matching.after === next.version;
}

function hydrateInactiveForms(active?: HTMLFormElement) {
  if (!state?.profile) return;
  for (const name of ['datos', 'redes'] as const) {
    const form = formFor(name);
    if (!form || form === active) continue;
    setFormFromProfile(form, name, state.profile);
    formState?.commit(capture(form));
  }
}

function runPendingExitAction() {
  if (writeGuard?.isActive() || hasPendingChanges()) return;
  const action = pendingExitAction;
  pendingExitAction = undefined;
  action?.();
}

function closeDialog({ navigate = true }: { navigate?: boolean } = {}) {
  if (!hasPendingChanges() && !sessionRecovery?.blocksWrites()) clearRecoveryNotice();
  if (activeEditor) clearConflict(formFor(activeEditor) ?? undefined);
  if (dialog?.open) dialog.close();
  setHidden(exitPrompt, true);
  if (activeEditor) {
    const form = formFor(activeEditor);
    if (form) form.hidden = true;
  }
  activeEditor = undefined;
  if (activeForm !== formFor('crear')) activeForm = undefined;
  clearConflict(undefined);
  const focus = returnFocus;
  returnFocus = undefined;
  if (focus && focus.isConnected) window.requestAnimationFrame(() => focus.focus());
  if (navigate) runPendingExitAction();
}

function hasPendingChanges(): boolean {
  return formState?.hasPendingChanges() ?? false;
}

function showExitPrompt(afterExit?: () => void, trigger?: HTMLElement) {
  if (writeGuard?.isActive()) {
    announceWrite(activeEditor, 'Estamos guardando la acción iniciada. Espera a que termine antes de salir.', 'info');
    return;
  }
  pendingExitAction = afterExit;
  if (trigger) returnFocus = trigger;
  setHidden(exitPrompt, false);
  setHidden(exitPrompt?.querySelector('[data-owner-exit-save]'), false);
  setHidden(exitPrompt?.querySelector('[data-owner-exit-discard]'), false);
  setHidden(exitPrompt?.querySelector('[data-owner-exit-continue]'), false);
  if (dialog && !dialog.open) dialog.showModal();
  const firstAction = exitPrompt?.querySelector<HTMLElement>('[data-owner-exit-save]');
  firstAction?.focus?.();
}

function resetForm(name: string, form: HTMLFormElement) {
  if (name === 'crear') {
    if (state?.profile) {
      const displayName = field(form, 'displayName');
      const slug = field(form, 'slug');
      if (displayName) displayName.value = state.profile.displayName;
      if (slug) slug.value = state.profile.slug;
    } else {
      const displayName = field(form, 'displayName');
      const slug = field(form, 'slug');
      if (displayName) displayName.value = '';
      if (slug) slug.value = '';
      manualSlug = false;
    }
  } else if (name === 'foto') {
    const photo = field(form, 'photo') as HTMLInputElement | null;
    if (photo) {
      photo.value = '';
    }
    photoUploadId = undefined;
    setHidden(form.querySelector('[data-owner-check-photo]'), true);
  } else if (state?.profile) {
    setFormFromProfile(form, name, state.profile);
  }
  const statusName = name === 'crear' ? '[data-owner-create-status]' : `[data-owner-form-status="${name}"]`;
  const status = root?.querySelector<HTMLElement>(statusName);
  clearAnnouncement(status);
  formState?.commit(capture(form));
}

function requestClose() {
  if (writeGuard?.isActive()) {
    announceWrite(activeEditor, 'La escritura ya empezó y sigue en curso. Espera a que termine antes de salir.', 'info');
    return;
  }
  if (hasPendingChanges()) {
    showExitPrompt();
    return;
  }
  closeDialog();
}

function openEditor(name: 'datos' | 'redes' | 'foto', trigger: HTMLElement) {
  if (!state?.profile || !dialog) return;
  if (hasPendingChanges()) {
    showExitPrompt();
    return;
  }
  const form = formFor(name);
  if (!form) return;
  clearAnnouncement(statusFor(name));
  clearAnnouncement(pageStatus);
  const title = root?.querySelector<HTMLElement>('[data-owner-dialog-title]');
  if (title) title.textContent = name === 'datos' ? 'Editar datos' : name === 'redes' ? 'Editar redes' : 'Editar foto';
  for (const other of ['datos', 'redes', 'foto'] as const) {
    const unit = formFor(other);
    if (!unit) continue;
    unit.hidden = other !== name;
    clearConflict(unit);
  }
  setHidden(exitPrompt, true);
  setHidden(root?.querySelector('[data-owner-check-photo]'), true);
  if (name !== 'foto') setFormFromProfile(form, name, state.profile);
  formState?.commit(capture(form));
  activeEditor = name;
  activeForm = form;
  returnFocus = trigger;
  dialog.showModal();
  const first = form.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, button');
  window.requestAnimationFrame(() => first?.focus?.());
}

function updateProfileState(profile: CreatorProfileDTO) {
  if (!state) return;
  state.profile = profile;
  root?.setAttribute('data-profile-version', String(profile.version));
  updateProfileView();
}

function maybeExitAfterSave(noPendingChanges: boolean) {
  if (!noPendingChanges) return;
  const createForm = formFor('crear');
  if (activeForm === createForm && state?.profile) {
    setHidden(root?.querySelector('[data-owner-create-panel]'), true);
    activeForm = undefined;
  }
  if (activeEditor || pendingExitAction) closeDialog();
}

async function saveProfileForm(form: HTMLFormElement, name: 'crear' | 'datos' | 'redes') {
  const profile = state?.profile ?? null;
  const snapshot = capture(form);
  const data = new FormData(form);
  let body: Record<string, unknown>;
  if (name === 'redes') {
    const socials: Partial<Record<CreatorSocial, string>> = {};
    for (const { key } of SOCIALS) {
      const value = String(data.get(`social-${key}`) ?? '').trim();
      if (value) {
        try {
          const url = new URL(value);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid-url');
        } catch {
          const invalid = field(form, `social-${key}`);
          invalid?.setCustomValidity('Ingresa una URL HTTP o HTTPS sin usuario ni contraseña.');
          invalid?.reportValidity();
          return;
        }
        socials[key] = value;
      }
    }
    body = { socials, ...(profile ? { version: profile.version } : {}) };
  } else if (name === 'datos') {
    body = {
      displayName: String(data.get('displayName') ?? '').trim(),
      slug: String(data.get('slug') ?? '').trim(),
      city: String(data.get('city') ?? '').trim(),
      country: String(data.get('country') ?? '').trim(),
      programs: data.getAll('programs').map(String),
      bio: String(data.get('bio') ?? '').trim(),
      ...(profile ? { version: profile.version } : {}),
    };
  } else {
    body = {
      displayName: String(data.get('displayName') ?? '').trim(),
      slug: String(data.get('slug') ?? '').trim(),
      ...(profile ? { version: profile.version } : {}),
    };
  }

  if (!form.reportValidity()) return;
  form.setAttribute('aria-busy', 'true');
  try {
    const response = await jsonRequest('/api/creador/perfil', 'PUT', body);
    if (!response.ok) {
      if (response.status === 409) showConflict(form, name);
      else announceWrite(name, statusMessage(response.status), 'error');
      return;
    }
    const payload = await responsePayload(response);
    if (!payload || !isProfile(payload.profile)) {
      announceWrite(name, 'El servicio guardó la solicitud, pero no pudimos comprobar el perfil actualizado. Conservamos esta edición para revisarla.', 'error');
      return;
    }
    const next = payload.profile;
    const changes = await readCreatorVersionChanges(response);
    if (!validateReceipt(payload, changes, profile, next)) {
      setHidden(form.querySelector('[data-owner-conflict]'), false);
      const copy = form.querySelector<HTMLElement>('[data-owner-conflict-copy]');
      if (copy) copy.textContent = 'La solicitud respondió sin un recibo que podamos verificar. Compara el estado guardado antes de volver a intentar.';
      announceWrite(name, 'El servicio respondió sin un recibo de versión válido. Conservamos tu edición y no adoptamos un estado que no pudimos comprobar.', 'error');
      return;
    }
    const unchanged = submitWasUnchanged(snapshot);
    updateProfileState(next);
    clearRecoveryNotice();
    hydrateInactiveForms(form);
    if (name === 'crear' && !unchanged) {
      setHidden(root?.querySelector('[data-owner-create-panel]'), false);
      textAt('#creator-owner-create-title', 'Completa tu borrador');
      const saveButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (saveButton) saveButton.textContent = 'Guardar cambios';
      announceWrite(name, 'Borrador creado. Conservamos los cambios que escribiste durante el guardado; revísalos y vuelve a guardar cuando quieras.', 'success');
      return;
    }
    if (!unchanged) {
      announceWrite(name, 'Cambios guardados. Conservamos la corrección que llegó durante el guardado; puedes seguir editándola.', 'success');
      return;
    }
    if (name === 'datos' || name === 'redes') {
      setFormFromProfile(form, name, next);
      formState?.commit(capture(form));
      announceWrite(name, profileMessage(next), 'success');
    } else {
      announceWrite(name, 'Borrador creado. Agrega lo que quieras y publícalo cuando esté listo.', 'success');
    }
    maybeExitAfterSave(true);
  } catch {
    announceWrite(name, 'No pudimos conectar con el servicio. Tus datos siguen en el formulario; inténtalo de nuevo.', 'error');
  } finally {
    form.removeAttribute('aria-busy');
  }
}

function profileMessage(profile: CreatorProfileDTO): string {
  if (profile.hidden) return 'Perfil guardado. La página sigue oculta por administración.';
  if (profile.published) return 'Perfil guardado. El cambio ya está en tu página pública.';
  return 'Perfil guardado como borrador. Publícalo cuando esté listo.';
}

function showConflictComparison(form: HTMLFormElement, current: CreatorProfileDTO, name: 'crear' | 'datos' | 'redes') {
  const compare = form.querySelector<HTMLElement>('[data-owner-comparison]');
  if (!compare) return;
  const lines: string[] = [`Versión guardada: ${current.version}.`];
  if (name === 'crear') {
    lines.push(`Nombre guardado: ${current.displayName || '—'} | Tu corrección: ${String(field(form, 'displayName')?.value ?? '') || '—'}`);
    lines.push(`Dirección guardada: ${current.slug || '—'} | Tu corrección: ${String(field(form, 'slug')?.value ?? '') || '—'}`);
  } else if (name === 'datos') {
    const fields: Array<[string, string, string]> = [
      ['Nombre visible', 'displayName', current.displayName],
      ['Dirección', 'slug', current.slug],
      ['Ciudad', 'city', current.city ?? ''],
      ['País', 'country', current.country ?? ''],
      ['Presentación', 'bio', current.bio ?? ''],
    ];
    for (const [label, key, saved] of fields) {
      const local = String(field(form, key)?.value ?? '');
      lines.push(`${label} guardado: ${saved || '—'} | Tu corrección: ${local || '—'}`);
    }
    const selected = [...form.querySelectorAll<HTMLInputElement>('input[name="programs"]')].filter((item) => item.checked).map((item) => item.value);
    lines.push(`Programas guardados: ${current.programs.join(', ') || '—'} | Tus correcciones: ${selected.join(', ') || '—'}`);
  } else {
    for (const { key, label } of SOCIALS) {
      const local = String(field(form, `social-${key}`)?.value ?? '');
      lines.push(`${label} guardado: ${current.socials[key] || '—'} | Tu corrección: ${local || '—'}`);
    }
  }
  compare.textContent = lines.join('\n');
  compare.classList.add('creator-owner__comparison');
  setHidden(compare, false);
  setHidden(form.querySelector('[data-owner-adopt]'), false);
  conflictProfile = current;
}

async function compareSavedVersion(form: HTMLFormElement, name: 'crear' | 'datos' | 'redes') {
  announceWrite(name, 'Consultando la versión guardada…', 'info');
  try {
    const response = await fetch('/api/creador/perfil/', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) await sessionRecovery?.observeWriteResponse(response);
    if (!response.ok) {
      announceWrite(name, response.status === 401 ? sessionRecovery?.writeFailureMessage() ?? statusMessage(401) : 'No pudimos leer la versión guardada. Tus cambios siguen aquí; inténtalo de nuevo.', 'error');
      return;
    }
    const payload = await responsePayload(response);
    if (!payload || !Object.hasOwn(payload, 'profile')) {
      announceWrite(name, 'No pudimos confirmar que la versión guardada corresponde a esta página. Conservamos tu edición.', 'error');
      return;
    }
    if (name === 'crear' && payload.profile === null && !state?.profile) {
      const compare = form.querySelector<HTMLElement>('[data-owner-comparison]');
      if (compare) compare.textContent = 'No hay una página guardada en esta cuenta. La dirección elegida puede estar ocupada; corrígela y vuelve a guardar.';
      setHidden(compare, false);
      setHidden(form.querySelector('[data-owner-adopt]'), true);
      conflictProfile = undefined;
      announceWrite(name, 'No se encontró una página para adoptar. Puedes corregir la dirección y volver a guardar.', 'info');
      return;
    }
    if (!isProfile(payload.profile) || (state?.profile && payload.profile.id !== state.profile.id)
      || (!state?.profile && name !== 'crear')) {
      announceWrite(name, 'No pudimos confirmar que la versión guardada corresponde a esta página. Conservamos tu edición.', 'error');
      return;
    }
    showConflictComparison(form, payload.profile, name);
    announceWrite(name, 'Compara los valores y elige expresamente si quieres adoptar la versión guardada.', 'info');
  } catch {
    announceWrite(name, 'No pudimos conectar para leer la versión guardada. Tus cambios siguen aquí.', 'error');
  }
}

function adoptSavedVersion(form: HTMLFormElement, name: 'crear' | 'datos' | 'redes') {
  if (!conflictProfile) return;
  const adopted = conflictProfile;
  updateProfileState(adopted);
  if (name === 'crear') {
    const displayName = field(form, 'displayName');
    const slug = field(form, 'slug');
    if (displayName) displayName.value = adopted.displayName;
    if (slug) slug.value = adopted.slug;
    setHidden(root?.querySelector('[data-owner-create-panel]'), true);
    activeForm = undefined;
    hydrateInactiveForms();
  } else setFormFromProfile(form, name, adopted);
  formState?.commit(capture(form));
  clearConflict(form);
  announceWrite(name, 'Adoptaste explícitamente la versión guardada. Puedes hacer otra corrección y volver a guardar.', 'success');
}

function validPhoto(photo: unknown): photo is NonNullable<CreatorProfileDTO['photo']> {
  return isRecord(photo) && (typeof photo.version === 'string' || typeof photo.version === 'number');
}

async function checkPhotoStatus(form: HTMLFormElement) {
  const checkButton = form.querySelector<HTMLButtonElement>('[data-owner-check-photo]');
  if (checkButton) checkButton.disabled = true;
  try {
    const response = await fetch('/api/creador/perfil/', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) await sessionRecovery?.observeWriteResponse(response);
    const payload = response.ok ? await responsePayload(response) : null;
    if (!payload || !isProfile(payload.profile) || payload.profile.id !== state?.profile?.id) {
      announceWrite('foto', response.status === 401 ? sessionRecovery?.writeFailureMessage() ?? PHOTO_UNCONFIRMED : PHOTO_UNCONFIRMED, 'error');
      return;
    }
    const latest = payload.profile;
    const currentVersion = state?.profile?.version;
    if (photoUploadId && String(latest.photo?.version) === photoUploadId) {
      updateProfileState(latest);
      const input = field(form, 'photo') as HTMLInputElement | null;
      if (input) input.value = '';
      formState?.commit(capture(form));
      setHidden(checkButton, true);
      announceWrite('foto', 'La foto seleccionada quedó guardada. Ya puedes comprobarla en tu página.', 'success');
      maybeExitAfterSave(!hasPendingChanges());
      return;
    }
    updateProfileState(latest);
    if (latest.version !== currentVersion) hydrateInactiveForms(form);
    setHidden(checkButton, false);
    announceWrite('foto', 'La versión guardada ya está comprobada. La foto elegida sigue disponible; puedes iniciar una carga nueva si todavía quieres cambiarla.', 'info');
  } catch {
    announceWrite('foto', PHOTO_UNCONFIRMED, 'error');
  } finally {
    if (checkButton) checkButton.disabled = false;
  }
}

async function uploadPhoto(form: HTMLFormElement) {
  if (!form.reportValidity()) return;
  const input = form.querySelector<HTMLInputElement>('input[type="file"]');
  const file = input?.files?.[0];
  const profile = state?.profile;
  if (!file || !profile) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_PHOTO_BYTES) {
    announceWrite('foto', 'Elige una imagen JPEG, PNG o WebP de hasta 15 MiB.', 'error');
    return;
  }
  const expectedVersion = profile.version;
  form.setAttribute('aria-busy', 'true');
  let finalizationRequested = false;
  photoUploadId = undefined;
  setHidden(form.querySelector('[data-owner-check-photo]'), true);
  try {
    const authorize = await jsonRequest('/api/creador/foto/autorizar', 'POST', { version: expectedVersion });
    if (!authorize.ok) {
      if (authorize.status === 409) {
        setHidden(form.querySelector('[data-owner-check-photo]'), false);
        announceWrite('foto', 'El perfil cambió desde que abriste esta edición. Conservamos la foto seleccionada; comprueba qué foto quedó activa antes de volver a cargar.', 'error');
      }
      else announceWrite('foto', statusMessage(authorize.status), 'error');
      return;
    }
    const upload = await responsePayload(authorize);
    if (!upload || typeof upload.uploadId !== 'string' || !isRecord(upload.post)
      || typeof upload.post.url !== 'string' || !isRecord(upload.post.fields)) {
      announceWrite('foto', 'No pudimos preparar la carga. La foto anterior sigue activa y el archivo elegido se conserva.', 'error');
      return;
    }
    photoUploadId = upload.uploadId;
    const formData = new FormData();
    for (const [key, value] of Object.entries(upload.post.fields)) {
      if (typeof value === 'string') formData.append(key, value);
    }
    formData.append('file', file);
    const sent = await fetch(upload.post.url, { method: 'POST', mode: 'cors', credentials: 'omit', body: formData });
    if (!sent.ok) {
      announceWrite('foto', 'No pudimos subir la foto. La imagen anterior sigue activa; el archivo elegido se conserva.', 'error');
      return;
    }
    finalizationRequested = true;
    const finish = await jsonRequest('/api/creador/foto/finalizar', 'POST', { uploadId: upload.uploadId, version: expectedVersion });
    if (!finish.ok) {
      if (finish.status >= 500) {
        setHidden(form.querySelector('[data-owner-check-photo]'), false);
        announceWrite('foto', PHOTO_UNCONFIRMED, 'error');
      } else {
        if (finish.status === 409) {
          setHidden(form.querySelector('[data-owner-check-photo]'), false);
          announceWrite('foto', 'El perfil cambió antes de guardar la foto. El archivo seleccionado se conserva; comprueba qué foto quedó activa antes de volver a cargar.', 'error');
        } else announceWrite('foto', statusMessage(finish.status), 'error');
      }
      return;
    }
    const payload = await responsePayload(finish);
    const changes = await readCreatorVersionChanges(finish);
    const photo = payload?.photo;
    const matching = changes?.find((change) => change.entity === 'profile' && change.id === profile.id);
    if (!payload || !validPhoto(photo) || changes === null || matching?.before !== expectedVersion || matching.after !== expectedVersion + 1) {
      setHidden(form.querySelector('[data-owner-check-photo]'), false);
      announceWrite('foto', PHOTO_UNCONFIRMED, 'error');
      return;
    }
    const updated = { ...profile, photo, version: matching.after };
    updateProfileState(updated);
    clearRecoveryNotice();
    if (input) input.value = '';
    formState?.commit(capture(form));
    announceWrite('foto', 'Foto guardada.', 'success');
    maybeExitAfterSave(!hasPendingChanges());
  } catch {
    if (finalizationRequested) {
      setHidden(form.querySelector('[data-owner-check-photo]'), false);
      announceWrite('foto', PHOTO_UNCONFIRMED, 'error');
    } else {
      announceWrite('foto', 'No pudimos completar la carga. La foto anterior sigue activa y el archivo elegido se conserva.', 'error');
    }
  } finally {
    form.removeAttribute('aria-busy');
  }
}

function handleExitChoice(choice: 'save' | 'discard' | 'continue', event?: Event) {
  const createForm = formFor('crear');
  const current = activeForm;
  const currentName = current?.dataset.ownerForm;
  if (choice === 'continue') {
    setHidden(exitPrompt, true);
    if (current === createForm) closeDialog({ navigate: false });
    else {
      const first = current?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, button');
      first?.focus?.();
    }
    pendingExitAction = undefined;
    return;
  }
  if (choice === 'save') {
    if (!current) return;
    if (!current.reportValidity()) return;
    if (!event) return;
    const action = profileFormActions.get(current);
    if (!action) return;
    setHidden(exitPrompt, true);
    void runProfileFormAction(event, action);
    return;
  }
  if (current && currentName) resetForm(currentName, current);
  if (current === createForm && state?.profile) setHidden(root?.querySelector('[data-owner-create-panel]'), true);
  closeDialog();
}

if (root && state && csrfToken && dialog) {
  updateProfileView();
  const createForm = formFor('crear');
  const dataForm = formFor('datos');
  const socialForm = formFor('redes');
  const photoForm = formFor('foto');

  root.addEventListener('account:logout', (event) => {
    if (writeGuard?.isActive() || hasPendingChanges()) {
      event.preventDefault();
      const logoutForm = event.target instanceof HTMLFormElement ? event.target : undefined;
      const trigger = logoutForm?.querySelector<HTMLButtonElement>('button[type="submit"]') ?? undefined;
      showExitPrompt(() => logoutForm?.requestSubmit(), trigger);
    }
  });

  root.addEventListener('submit', (event) => {
    const navigation = event.target;
    if (!(navigation instanceof HTMLFormElement) || !navigation.hasAttribute('data-owner-navigation') || !hasPendingChanges()) return;
    event.preventDefault();
    const submitter = (event as SubmitEvent).submitter;
    showExitPrompt(
      () => navigation.requestSubmit(),
      submitter instanceof HTMLElement ? submitter : undefined,
    );
  });

  if (createForm) {
    const form = createForm;
    onWrite(form, async (event) => {
      event.preventDefault();
      activeForm = form;
      await saveProfileForm(form, 'crear');
    });
  }
  if (dataForm) {
    const form = dataForm;
    onWrite(form, async (event) => {
      event.preventDefault();
      activeForm = form;
      await saveProfileForm(form, 'datos');
    });
  }
  if (socialForm) {
    const form = socialForm;
    onWrite(form, async (event) => {
      event.preventDefault();
      activeForm = form;
      await saveProfileForm(form, 'redes');
    });
  }
  if (photoForm) {
    const form = photoForm;
    onWrite(form, async (event) => {
      event.preventDefault();
      activeForm = form;
      await uploadPhoto(form);
    });
  }

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    const control = target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const form = control.form;
    const name = form?.dataset.ownerForm;
    if (!form || !name) return;
    if (name === 'crear') {
      activeForm = form;
      if (control.name === 'slug') manualSlug = true;
      if (control.name === 'displayName' && !manualSlug) {
        const slug = field(form, 'slug');
        if (slug) slug.value = suggestedSlug(control.value);
      }
    }
    control.setCustomValidity?.('');
  });

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const editButton = target.closest<HTMLElement>('[data-owner-edit]');
    const editName = editButton?.dataset.ownerEdit;
    if (editName === 'datos' || editName === 'redes' || editName === 'foto') {
      if (!editButton) return;
      if (hasPendingChanges()) {
        event.preventDefault();
        showExitPrompt(undefined, editButton);
        return;
      }
      openEditor(editName, editButton);
      return;
    }
    if (target.closest('[data-owner-close], [data-owner-cancel]')) {
      event.preventDefault();
      requestClose();
      return;
    }
    const exitSave = target.closest('[data-owner-exit-save]');
    if (exitSave) { event.preventDefault(); handleExitChoice('save', event); return; }
    const exitDiscard = target.closest('[data-owner-exit-discard]');
    if (exitDiscard) { event.preventDefault(); handleExitChoice('discard'); return; }
    const exitContinue = target.closest('[data-owner-exit-continue]');
    if (exitContinue) { event.preventDefault(); handleExitChoice('continue'); return; }
    const compareButton = target.closest('[data-owner-compare]');
    const conflictName = activeForm?.dataset.ownerForm;
    if (compareButton && activeForm && (conflictName === 'crear' || activeEditor === 'datos' || activeEditor === 'redes')) {
      event.preventDefault();
      void compareSavedVersion(activeForm, conflictName === 'crear' ? 'crear' : activeEditor as 'datos' | 'redes');
      return;
    }
    const adoptButton = target.closest('[data-owner-adopt]');
    if (adoptButton && activeForm && (conflictName === 'crear' || activeEditor === 'datos' || activeEditor === 'redes')) {
      event.preventDefault();
      adoptSavedVersion(activeForm, conflictName === 'crear' ? 'crear' : activeEditor as 'datos' | 'redes');
      return;
    }
    const photoCheck = target.closest('[data-owner-check-photo]');
    if (photoCheck && activeForm) {
      event.preventDefault();
      void checkPhotoStatus(activeForm);
      return;
    }
    const publish = target.closest<HTMLElement>('[data-owner-publish]');
    if (publish) {
      event.preventDefault();
      if (hasPendingChanges()) {
        showExitPrompt(undefined, publish);
        return;
      }
      const profile = state?.profile;
      if (!profile || profile.hidden || profile.published) return;
      if (sessionRecovery?.blocksWrites()) {
        sessionRecovery.announceBlocked();
        return;
      }
      void writeGuard?.run(event, async () => {
        const status = statusFor(undefined);
        try {
          const response = await jsonRequest('/api/creador/perfil/publicar', 'POST', { version: profile.version });
          if (!response.ok) {
            if (response.status === 409) announceWrite(undefined, statusMessage(409), 'error');
            else announceWrite(undefined, statusMessage(response.status), 'error');
            return;
          }
          const payload = await responsePayload(response);
          const changes = await readCreatorVersionChanges(response);
          if (!payload || !isProfile(payload.profile) || !validateReceipt(payload, changes, profile, payload.profile)) {
            announceWrite(undefined, 'No pudimos comprobar la versión de tu página después de publicar. Revisa su estado antes de compartirla.', 'error');
            return;
          }
          updateProfileState(payload.profile);
          clearRecoveryNotice();
          hydrateInactiveForms();
          announce(status, payload.profile.hidden ? 'La página está publicada, pero sigue oculta por administración.' : 'Tu página ya está publicada y visible al público.', 'success');
        } catch {
          announceWrite(undefined, 'No pudimos conectar para publicar. Tu página sigue como estaba; inténtalo de nuevo.', 'error');
        }
      });
      return;
    }
    const copy = target.closest('[data-owner-copy]') as HTMLButtonElement | null;
    if (copy) {
      const url = copy.dataset.url;
      if (!url) return;
      const status = root.querySelector<HTMLElement>('[data-owner-copy-status]');
      void (async () => {
        try {
          await navigator.clipboard.writeText(url);
          announce(status, 'Enlace copiado.', 'success');
        } catch {
          announce(status, `Copia esta dirección: ${url}`, 'info');
        }
      })();
      return;
    }
    const navigation = target.closest<HTMLAnchorElement>('a[data-owner-navigation]');
    if (navigation && hasPendingChanges()) {
      event.preventDefault();
      showExitPrompt(() => window.location.assign(navigation.href), navigation);
    }
  });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    requestClose();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) requestClose();
  });
  window.addEventListener('beforeunload', (event) => {
    if (!hasPendingChanges()) return;
    event.preventDefault();
  });

} else if (root) {
  announce(pageStatus, 'No pudimos leer los datos de tu página. Recarga para volver a intentarlo.', 'error');
}

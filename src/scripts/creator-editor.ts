import type {
  CreatorEditorDTO,
  CreatorLinkDTO,
  CreatorProfileDTO,
} from '../types/creators';
import { creatorEditorFailureMessage } from '../lib/creator-editor-errors';
import { creatorSeriesFailureMessage } from '../lib/creator-series-editor-errors';
import { createCreatorFormState, type FormValueSnapshot } from './creator-form-state';
import { createCreatorSessionRecovery } from './creator-session-recovery';
import { createCreatorWriteGuard, readCreatorVersionChanges, type CreatorVersionChange } from './creator-write-state';

const root = document.querySelector<HTMLElement>('[data-creator-editor]');
const initial = document.querySelector<HTMLScriptElement>('#creator-editor-data');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEditorData(value: unknown): value is CreatorEditorDTO {
  return isRecord(value)
    && (value.profile === null || isRecord(value.profile))
    && Array.isArray(value.links)
    && Array.isArray(value.editableResources)
    && Array.isArray(value.claims)
    && Array.isArray(value.series);
}

let state: CreatorEditorDTO | undefined;
if (root && initial?.textContent) {
  try {
    const parsed: unknown = JSON.parse(initial.textContent);
    if (isEditorData(parsed)) state = parsed;
  } catch {
    state = undefined;
  }
}

const formState = root ? createCreatorFormState(root) : undefined;
const writeGuard = root ? createCreatorWriteGuard(root) : undefined;
let csrfToken = root?.dataset.csrf;
const sessionRecovery = root ? createCreatorSessionRecovery({
  root,
  isWriteActive: () => writeGuard?.isActive() ?? false,
  updateCsrf: (token) => { csrfToken = token; },
}) : undefined;
const pageStatus = root?.querySelector<HTMLElement>('[data-page-status]');
const MAX_REQUEST_BYTES = 32 * 1024;
const REQUEST_TOO_LARGE = 'creator-request-too-large';
const SERIES_FOCUS_PREFIX = 'creator-series-';
const PHOTO_FINALIZATION_UNCONFIRMED = 'No pudimos confirmar si la foto se guardó. Recarga la página para comprobar cuál está activa antes de volver a intentarlo.';

function restoreSeriesFocus() {
  const hash = window.location.hash;
  if (!hash.startsWith(`#${SERIES_FOCUS_PREFIX}`)) return;
  let targetId: string;
  try {
    targetId = decodeURIComponent(hash.slice(1));
  } catch {
    return;
  }
  if (!targetId.startsWith(SERIES_FOCUS_PREFIX)) return;
  const target = document.getElementById(targetId);
  if (!target) return;
  window.requestAnimationFrame(() => {
    target.focus();
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  });
}

restoreSeriesFocus();

function announce(target: Element | null | undefined, message: string, kind: 'error' | 'success' | 'info' = 'info') {
  if (!(target instanceof HTMLElement)) return;
  target.textContent = message;
  target.dataset.kind = kind;
  target.hidden = false;
}

function statusText(status: number): string {
  if (status === 401) return sessionRecovery?.writeFailureMessage() ?? 'Tu sesión terminó. Inicia sesión y vuelve a intentarlo.';
  if (status === 403) return sessionRecovery?.blocksWrites()
    ? sessionRecovery.writeFailureMessage()
    : 'Tu cuenta no tiene permiso para completar esta acción.';
  if (status === 409) return 'No pudimos completar el cambio porque hay un conflicto. Revisa el estado antes de volver a intentarlo.';
  if (status === 422) return 'El servicio no acepta alguno de estos datos. Revisa la información e inténtalo de nuevo; tus datos siguen en el formulario.';
  if (status === 413) return 'La solicitud supera el límite de 32 KiB. Reduce la cantidad de IDs o la referencia e inténtalo de nuevo.';
  if (status === 503 || status >= 500) return 'No pudimos guardar los cambios. Tus datos siguen en el formulario; inténtalo de nuevo en unos minutos.';
  return 'No pudimos completar la acción. Revisa los datos e inténtalo de nuevo.';
}

function requestFailureMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message === REQUEST_TOO_LARGE
    ? 'La solicitud supera el límite de 32 KiB. Reduce la cantidad de IDs o la referencia; tus datos siguen en el formulario.'
    : fallback;
}

function setBusy(form: HTMLFormElement, busy: boolean) {
  form.setAttribute('aria-busy', String(busy));
}

function onWrite(
  target: EventTarget,
  type: string,
  action: (event: Event) => Promise<void> | void,
  onBlocked?: () => void,
) {
  target.addEventListener(type, (event) => {
    if (sessionRecovery?.blocksWrites()) {
      event.preventDefault();
      onBlocked?.();
      sessionRecovery.announceBlocked();
      return;
    }
    return writeGuard?.run(event, () => action(event));
  });
}

async function api(path: string, method: string, body?: unknown): Promise<Response> {
  if (!csrfToken) throw new Error('missing-csrf');
  const serializedBody = body === undefined ? undefined : JSON.stringify(body);
  if (serializedBody !== undefined && new TextEncoder().encode(serializedBody).byteLength > MAX_REQUEST_BYTES) {
    throw new Error(REQUEST_TOO_LARGE);
  }
  const response = await fetch(`${path.replace(/\/$/, '')}/`, {
    method,
    credentials: 'same-origin',
    headers: {
      'x-csrf-token': csrfToken,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(serializedBody === undefined ? {} : { body: serializedBody }),
  });
  await sessionRecovery?.observeWriteResponse(response);
  return response;
}

async function photoErrorMessage(response: Response): Promise<string> {
  if (response.status === 409) {
    const payload = await responsePayload(response);
    if (payload?.error === 'PROFILE_VERSION_CONFLICT') {
      return 'El perfil cambió desde que abriste esta página. Recarga antes de volver a intentar la foto.';
    }
    return statusText(response.status);
  }
  return statusText(response.status);
}

function linkByPlacement(id: string): CreatorLinkDTO | undefined {
  return state?.links.find((link) => link.placementId === id);
}

function immediateCheckboxState(checkbox: HTMLInputElement) {
  const placementId = checkbox.closest<HTMLElement>('[data-placement-id]')?.dataset.placementId;
  const link = placementId ? linkByPlacement(placementId) : undefined;
  if (!placementId || !link) return undefined;
  return {
    placementId,
    link,
    value: checkbox.matches('[data-featured]') ? link.featured : link.selectedForDirectory,
  };
}

function linksStatus() {
  return root?.querySelector<HTMLElement>('[data-links-status]');
}

function observedVersion(change: CreatorVersionChange): number | undefined {
  if (!state) return undefined;
  if (change.entity === 'profile') return state.profile?.id === change.id ? state.profile.version : undefined;
  if (change.entity === 'series') return state.series.find((item) => item.id === change.id)?.version;
  if (change.entity === 'placement') return state.links.find((item) => item.placementId === change.id)?.placementVersion;
  const link = state.links.find((item) => item.resourceId === change.id);
  if (link) return link.resourceVersion;
  return state.editableResources.find((item) => item.id === change.id)?.version;
}

function applyVersionChanges(changes: CreatorVersionChange[]) {
  let gap = false;
  for (const change of changes) {
    const observed = observedVersion(change);
    if (observed === undefined) continue;
    if (observed !== change.before) {
      gap = true;
      continue;
    }
    if (!state) continue;
    if (change.entity === 'profile' && state.profile?.id === change.id) state.profile.version = change.after;
    if (change.entity === 'series') {
      const series = state.series.find((item) => item.id === change.id);
      if (series) series.version = change.after;
    }
    if (change.entity === 'placement') {
      const link = state.links.find((item) => item.placementId === change.id);
      if (link) link.placementVersion = change.after;
    }
    if (change.entity === 'resource') {
      state.links.filter((item) => item.resourceId === change.id).forEach((item) => { item.resourceVersion = change.after; });
      const resource = state.editableResources.find((item) => item.id === change.id);
      if (resource) resource.version = change.after;
    }
  }
  return gap;
}

async function responsePayload(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.clone().json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function updateOwnedContent(entity: CreatorVersionChange['entity'] | undefined, id: string | undefined, payload: Record<string, unknown> | null) {
  if (!state || !entity || !id || !payload) return;
  if (entity === 'profile' && isRecord(payload.profile) && (!id || payload.profile.id === id)) {
    state.profile = payload.profile as unknown as CreatorProfileDTO;
    setCopyProfileUrl();
  } else if (entity === 'profile' && isRecord(payload.photo) && state.profile?.id === id) {
    state.profile.photo = payload.photo as CreatorProfileDTO['photo'];
  } else if (entity === 'resource' && isRecord(payload.resource) && payload.resource.id === id) {
    const resource = payload.resource;
    state.links.filter((link) => link.resourceId === id).forEach((link) => {
      if (typeof resource.title === 'string') link.title = resource.title;
      if (typeof resource.url === 'string') link.url = resource.url;
      if (typeof resource.description === 'string') link.description = resource.description;
    });
    const retained = state.editableResources.find((item) => item.id === id);
    if (retained) {
      if (typeof resource.title === 'string') retained.title = resource.title;
      if (typeof resource.url === 'string') retained.url = resource.url;
      if (typeof resource.description === 'string') retained.description = resource.description;
    }
  } else if (entity === 'series' && isRecord(payload.series) && payload.series.id === id) {
    const index = state.series.findIndex((series) => series.id === id);
    if (index >= 0) {
      state.series[index] = payload.series as unknown as CreatorEditorDTO['series'][number];
      root?.querySelectorAll<HTMLButtonElement>('[data-copy-series-url]').forEach((button) => {
        if (button.closest<HTMLElement>('[data-series-id]')?.dataset.seriesId === id) {
          const profileSlug = state?.profile?.slug;
          const seriesSlug = state?.series.find((series) => series.id === id)?.slug;
          if (profileSlug && seriesSlug) button.dataset.url = `${new URL(window.location.href).origin}/c/${encodeURIComponent(profileSlug)}/series/${encodeURIComponent(seriesSlug)}/`;
        }
      });
    }
  } else if (entity === 'placement' && isRecord(payload.link) && payload.link.placementId === id) {
    const index = state.links.findIndex((link) => link.placementId === id);
    if (index >= 0) {
      const current = state.links[index];
      for (const field of ['featured', 'selectedForDirectory'] as const) {
        if (typeof payload.link[field] === 'boolean') current[field] = payload.link[field] as boolean;
      }
      if (typeof payload.link.position === 'number') current.position = payload.link.position;
    }
  }
}

function createdProfileId(
  entity: CreatorVersionChange['entity'] | undefined,
  id: string | undefined,
  payload: Record<string, unknown> | null,
  changes: CreatorVersionChange[] | null,
): string | undefined {
  if (!state || id || entity !== 'profile' || state.profile !== null || !payload || !isRecord(payload.profile)
    || typeof payload.profile.id !== 'string') return id;
  const profileId = payload.profile.id;
  return changes?.some((change) => change.entity === 'profile'
    && change.id === profileId && change.before === 0 && change.after === 1)
    ? profileId
    : undefined;
}

function markStructuralControlsStale() {
  writeGuard?.markStale('[data-move], [data-remove-link], [data-featured], [data-directory], [data-readd-link], [data-series-add-chapter-form] button, [data-series-move], [data-series-remove-chapter], [data-delete-series]');
}

function showViewTransition(message: string) {
  const shell = root?.querySelector<HTMLElement>('[data-view-transition-shell]');
  if (shell) shell.hidden = false;
  const banner = root?.querySelector<HTMLElement>('[data-view-transition]');
  announce(banner, message);
  markStructuralControlsStale();
}

function setCopyProfileUrl() {
  const button = root?.querySelector<HTMLButtonElement>('[data-copy-profile-url]');
  const slug = state?.profile?.slug;
  if (button && slug) button.dataset.url = `${new URL(window.location.href).origin}/c/${encodeURIComponent(slug)}/`;
}

async function finishSuccessfulWrite(
  response: Response,
  statusTarget: Element | null | undefined,
  successMessage: string,
  submittedValues?: FormValueSnapshot,
  focusId?: string,
  options: { structural?: boolean; ownEntity?: CreatorVersionChange['entity']; ownId?: string; pendingMessage?: string } = {},
) {
  const changes = await readCreatorVersionChanges(response);
  const receiptGap = changes === null || applyVersionChanges(changes);
  const payload = await responsePayload(response);
  if (!receiptGap) updateOwnedContent(options.ownEntity, createdProfileId(options.ownEntity, options.ownId, payload, changes), payload);
  formState?.commit(submittedValues);
  const hasPendingChanges = formState?.hasPendingChanges() ?? false;
  if (hasPendingChanges) {
    if (focusId) window.location.hash = focusId;
    let message = options.pendingMessage
      ?? `${successMessage} Conservamos los cambios que aún no enviaste; puedes seguir editándolos y guardarlos.`;
    if (receiptGap) {
      showViewTransition(`${successMessage} El recibo no coincide con las versiones que esta página observó. Conservamos tus campos; las acciones que dependen de la lista quedaron pausadas. Guarda otros cambios válidos o revierte los pendientes antes de actualizar la vista. Si un formulario da conflicto, copia su corrección antes de actualizar.`);
      message = `${successMessage} El recibo no coincide con una versión que esta página observó. Conservamos los cambios pendientes y habilitamos una actualización segura cuando los guardes o reviertas.`;
    } else if (options.structural) {
      showViewTransition(options.pendingMessage
        ?? `${successMessage} Guarda o revierte los cambios pendientes; la página se actualizará cuando termines. Tus campos se conservan.`);
    }
    announce(statusTarget, message, 'success');
    return true;
  }

  announce(statusTarget, successMessage, 'success');
  if (focusId) window.location.hash = focusId;
  window.location.reload();
  return true;
}

async function finishWrite(
  response: Response,
  statusTarget: Element | null | undefined,
  successMessage: string,
  submittedValues?: FormValueSnapshot,
  options: { structural?: boolean; ownEntity?: CreatorVersionChange['entity']; ownId?: string; pendingMessage?: string } = {},
) {
  if (!response.ok) {
    const message = await creatorEditorFailureMessage(response, statusText(response.status));
    announce(statusTarget, message, 'error');
    return false;
  }
  return finishSuccessfulWrite(response, statusTarget, successMessage, submittedValues, undefined, options);
}

async function finishSeriesWrite(
  response: Response,
  statusTarget: Element | null | undefined,
  successMessage: string,
  focusId?: string,
  submittedValues?: FormValueSnapshot,
  options: { structural?: boolean; ownEntity?: CreatorVersionChange['entity']; ownId?: string; pendingMessage?: string } = {},
) {
  if (!response.ok) {
    const message = await creatorSeriesFailureMessage(response, statusText(response.status));
    announce(statusTarget, message, 'error');
    return false;
  }
  return finishSuccessfulWrite(response, statusTarget, successMessage, submittedValues, focusId, options);
}

function seriesStatus(element: Element): HTMLElement | null {
  return element.closest<HTMLElement>('[data-series-id]')?.querySelector<HTMLElement>('[data-series-status]') ?? null;
}

function currentProfileVersion(): number | undefined {
  return state?.profile?.version;
}

function validateSocialUrls(form: HTMLFormElement): boolean {
  const message = 'Ingresa una URL HTTP o HTTPS sin usuario ni contraseña.';
  const fields = form.querySelectorAll<HTMLInputElement>('input[name^="social-"]');
  for (const field of fields) {
    const value = field.value.trim();
    let error = '';
    if (value) {
      try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) error = message;
      } catch {
        error = message;
      }
    }
    field.setCustomValidity(error);
  }
  return form.reportValidity();
}

function profileSavedMessage(): string {
  if (state?.profile?.published && !state.profile.hidden) {
    return 'Perfil guardado. Si tu página ya está publicada, el cambio queda visible enseguida.';
  }
  if (state?.profile?.published && state.profile.hidden) {
    return 'Perfil guardado. La página sigue oculta por administración y no aparece al público.';
  }
  return 'Perfil guardado como borrador. Publica tu página para que el público vea los cambios.';
}

async function linkCreatedMessage(response: Response): Promise<string> {
  const profile = state?.profile;
  if (!profile?.published) {
    return 'Enlace agregado a tu página. Publica tu página para que aparezca al público.';
  }
  if (profile.hidden) {
    return 'Enlace agregado a tu página. La página sigue oculta por administración y no aparece al público.';
  }

  try {
    const body: unknown = await response.clone().json();
    const link = isRecord(body) ? body.link : undefined;
    if (isRecord(link) && link.hidden === true) {
      return 'Enlace agregado a tu página. El enlace está oculto por administración y no aparece al público.';
    }
    if (isRecord(link) && link.hidden === false) {
      return 'Enlace agregado a tu página y visible en tu perfil público.';
    }
  } catch {
    // A missing moderation value must not be described as public visibility.
  }
  return 'Enlace agregado a tu página. Revisa su estado antes de compartirlo.';
}

function seriesById(id: string) {
  return state?.series.find((series) => series.id === id);
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

if (root && state && csrfToken) {
  const refreshViewButton = root.querySelector<HTMLButtonElement>('[data-refresh-view]');
  refreshViewButton?.addEventListener('click', () => {
    if (formState?.hasPendingChanges()) {
      announce(root.querySelector('[data-view-transition]'), 'Guarda los cambios pendientes o revierte manualmente tus campos antes de actualizar la vista.');
      return;
    }
    window.location.reload();
  });
  const profileForm = root.querySelector<HTMLFormElement>('[data-profile-form]');
  const profileStatus = root.querySelector<HTMLElement>('[data-profile-status]');
  const publishButton = root.querySelector<HTMLButtonElement>('[data-publish-profile]');
  profileForm?.querySelectorAll<HTMLInputElement>('input[name^="social-"]').forEach((field) => {
    field.addEventListener('input', () => field.setCustomValidity(''));
  });

  if (profileForm) onWrite(profileForm, 'submit', async (event) => {
    event.preventDefault();
    if (!validateSocialUrls(profileForm)) return;
    const values = new FormData(profileForm);
    const submittedValues = formState?.capture(profileForm);
    const socials: Record<string, string> = {};
    for (const key of ['instagram', 'x', 'linkedin', 'awsBuilder', 'website']) {
      const value = String(values.get(`social-${key}`) ?? '').trim();
      if (value) socials[key] = value;
    }
    const profile: Record<string, unknown> = {
      displayName: String(values.get('displayName') ?? '').trim(),
      slug: String(values.get('slug') ?? '').trim(),
      city: String(values.get('city') ?? '').trim(),
      country: String(values.get('country') ?? '').trim(),
      programs: values.getAll('programs').map(String),
      bio: String(values.get('bio') ?? '').trim(),
      socials,
    };
    if (state?.profile) profile.version = state.profile.version;

    setBusy(profileForm, true);
    try {
      const response = await api('/api/creador/perfil', 'PUT', profile);
      await finishWrite(response, profileStatus, profileSavedMessage(), submittedValues, { ownEntity: 'profile', ownId: state?.profile?.id });
    } catch (error) {
      announce(profileStatus, requestFailureMessage(error, 'No pudimos conectar con el servicio. Tus datos siguen en el formulario; inténtalo de nuevo.'), 'error');
    } finally {
      setBusy(profileForm, false);
    }
  });

  if (publishButton) onWrite(publishButton, 'click', async () => {
    if (!state?.profile) return;
    publishButton.disabled = true;
    try {
      const response = await api('/api/creador/perfil/publicar', 'POST', { version: state.profile.version });
      await finishWrite(response, profileStatus, state.profile.hidden
        ? 'Tu página está publicada, pero sigue oculta por administración.'
        : 'Tu página ya está publicada y visible al público.', undefined, { ownEntity: 'profile', ownId: state.profile.id });
    } catch (error) {
      announce(profileStatus, requestFailureMessage(error, 'No pudimos conectar con el servicio. Inténtalo de nuevo.'), 'error');
    } finally {
      publishButton.disabled = false;
    }
  });

  const copyButton = root.querySelector<HTMLButtonElement>('[data-copy-profile-url]');
  copyButton?.addEventListener('click', async () => {
    const url = copyButton.dataset.url;
    if (!url) return;
    const publishedStatus = root.querySelector<HTMLElement>('[data-copy-status]');
    try {
      await navigator.clipboard.writeText(url);
      announce(publishedStatus, 'Enlace copiado.', 'success');
    } catch {
      announce(publishedStatus, `Copia este enlace: ${url}`, 'info');
    }
  });

  root.querySelectorAll<HTMLButtonElement>('[data-copy-resource-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const resourceId = button.dataset.resourceIdValue;
      if (!resourceId) return;
      try {
        await navigator.clipboard.writeText(resourceId);
        announce(linksStatus(), 'ID del recurso copiado. Puedes pegarlo en la solicitud de vinculación.', 'success');
      } catch {
        announce(linksStatus(), `Copia este ID y pégalo en la solicitud: ${resourceId}`, 'info');
      }
    });
  });

  const linkCreateForm = root.querySelector<HTMLFormElement>('[data-add-link-form]');
  const linkCreateStatus = root.querySelector<HTMLElement>('[data-link-create-status]');
  if (linkCreateForm) onWrite(linkCreateForm, 'submit', async (event) => {
    event.preventDefault();
    if (!linkCreateForm.reportValidity()) return;
    const values = new FormData(linkCreateForm);
    const submittedValues = formState?.capture(linkCreateForm);
    const body = {
      title: String(values.get('title') ?? '').trim(),
      url: String(values.get('url') ?? '').trim(),
      description: String(values.get('description') ?? '').trim(),
    };
    setBusy(linkCreateForm, true);
    try {
      const response = await api('/api/creador/enlaces', 'POST', body);
      await finishWrite(response, linkCreateStatus, await linkCreatedMessage(response), submittedValues, { structural: true });
    } catch (error) {
      announce(linkCreateStatus, requestFailureMessage(error, 'No pudimos conectar con el servicio. Tus datos siguen en el formulario; inténtalo de nuevo.'), 'error');
    } finally {
      setBusy(linkCreateForm, false);
    }
  });

  root.querySelectorAll<HTMLFormElement>('[data-resource-form]').forEach((form) => {
    onWrite(form, 'submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const item = form.closest<HTMLElement>('[data-resource-id]');
      const resourceId = item?.dataset.resourceId;
      const link = state?.links.find((candidate) => candidate.resourceId === resourceId);
      const retained = state?.editableResources.find((candidate) => candidate.id === resourceId);
      const version = link?.resourceVersion ?? retained?.version;
      if (!resourceId || version === undefined) return;
      const values = new FormData(form);
      const submittedValues = formState?.capture(form);
      const body = {
        title: String(values.get('title') ?? '').trim(),
        url: String(values.get('url') ?? '').trim(),
        description: String(values.get('description') ?? '').trim(),
        version,
      };
      setBusy(form, true);
      try {
        const response = await api(`/api/creador/recursos/${encodeURIComponent(resourceId)}`, 'PATCH', body);
        await finishWrite(response, linksStatus(), 'Ficha guardada para los perfiles que usan este recurso.', submittedValues, { ownEntity: 'resource', ownId: resourceId });
      } catch (error) {
        announce(linksStatus(), requestFailureMessage(error, 'No pudimos conectar con el servicio. Tus datos siguen en el formulario; inténtalo de nuevo.'), 'error');
      } finally {
        setBusy(form, false);
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
    onWrite(button, 'click', async () => {
      const item = button.closest<HTMLElement>('[data-placement-id]');
      const placementId = item?.dataset.placementId;
      const direction = button.dataset.move;
      const current = placementId ? linkByPlacement(placementId) : undefined;
      if (!current || current.placementVersion === undefined || (direction !== 'up' && direction !== 'down')) return;
      const group = [...(state?.links ?? [])]
        .filter((link) => link.featured === current.featured)
        .sort((left, right) => left.position - right.position);
      const index = group.findIndex((link) => link.placementId === current.placementId);
      const target = group[index + (direction === 'up' ? -1 : 1)];
      if (!target) return;
      const profileVersion = currentProfileVersion();
      if (profileVersion === undefined) return;
      button.disabled = true;
      try {
        const response = await api(`/api/creador/enlaces/${encodeURIComponent(current.placementId)}`, 'PATCH', {
          position: target.position,
          version: current.placementVersion,
          profileVersion,
        });
        await finishWrite(response, linksStatus(), 'Orden actualizado.', undefined, { structural: true, ownEntity: 'placement', ownId: current.placementId });
      } catch (error) {
        announce(linksStatus(), requestFailureMessage(error, 'No pudimos conectar con el servicio. Inténtalo de nuevo.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  root.querySelectorAll<HTMLInputElement>('[data-featured], [data-directory]').forEach((checkbox) => {
    onWrite(checkbox, 'change', async () => {
      const observed = immediateCheckboxState(checkbox);
      if (!observed) return;
      const { placementId, link: current, value: previousValue } = observed;
      checkbox.disabled = true;
      const body = checkbox.matches('[data-featured]')
        ? { featured: checkbox.checked, ...(current.placementVersion !== undefined ? { version: current.placementVersion } : {}) }
        : { selectedForDirectory: checkbox.checked, ...(current.placementVersion !== undefined ? { version: current.placementVersion } : {}) };
      const submittedValues = formState?.capture(checkbox);
      try {
        const response = await api(`/api/creador/enlaces/${encodeURIComponent(placementId)}`, 'PATCH', body);
        const saved = await finishWrite(response, linksStatus(), checkbox.matches('[data-directory]')
          ? 'Selección guardada. La página se actualiza ahora; el directorio puede tardar hasta una hora más la publicación del sitio.'
          : 'Preferencia guardada.', submittedValues, {
          structural: checkbox.matches('[data-featured]'),
          ownEntity: 'placement',
          ownId: placementId,
        });
        if (!saved) checkbox.checked = previousValue;
      } catch (error) {
        announce(linksStatus(), requestFailureMessage(error, 'No pudimos conectar con el servicio. Inténtalo de nuevo.'), 'error');
        checkbox.checked = previousValue;
      } finally {
        checkbox.disabled = false;
      }
    }, () => {
      const observedValue = immediateCheckboxState(checkbox)?.value;
      if (observedValue !== undefined) checkbox.checked = observedValue;
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-remove-link]').forEach((button) => {
    onWrite(button, 'click', async () => {
      const item = button.closest<HTMLElement>('[data-placement-id]');
      const placementId = item?.dataset.placementId;
      if (!placementId) return;
      const profileVersion = currentProfileVersion();
      button.disabled = true;
      try {
        const response = await api(`/api/creador/enlaces/${encodeURIComponent(placementId)}`, 'DELETE',
          profileVersion === undefined ? undefined : { profileVersion });
        await finishWrite(response, linksStatus(), 'Enlace quitado de tu página. La ficha que administras sigue disponible para volver a agregarla.', undefined, { structural: true });
      } catch (error) {
        announce(linksStatus(), requestFailureMessage(error, 'No pudimos conectar con el servicio. Inténtalo de nuevo.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-readd-link]').forEach((button) => {
    onWrite(button, 'click', async () => {
      const item = button.closest<HTMLElement>('[data-retained-resource-id]');
      const resourceId = item?.dataset.retainedResourceId;
      const resource = state?.editableResources.find((candidate) => candidate.id === resourceId);
      if (!resource) return;
      button.disabled = true;
      try {
        const response = await api('/api/creador/enlaces', 'POST', {
          resourceId: resource.id,
          resourceVersion: resource.version,
        });
        await finishWrite(response, linksStatus(), 'Recurso agregado nuevamente a tu página.', undefined, { structural: true });
      } catch {
        announce(linksStatus(), 'No pudimos conectar con el servicio. Inténtalo de nuevo.', 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  const seriesCreateForm = root.querySelector<HTMLFormElement>('[data-series-create-form]');
  const seriesCreateStatus = seriesCreateForm?.querySelector<HTMLElement>('[data-series-create-status]');
  const seriesNameInput = seriesCreateForm?.querySelector<HTMLInputElement>('[data-series-name-suggestion]');
  const seriesSlugInput = seriesCreateForm?.querySelector<HTMLInputElement>('[data-series-slug-suggestion]');
  let seriesSlugEdited = (seriesSlugInput?.value.length ?? 0) > 0;
  seriesSlugInput?.addEventListener('input', () => { seriesSlugEdited = true; });
  seriesNameInput?.addEventListener('input', () => {
    if (seriesSlugInput && !seriesSlugEdited) seriesSlugInput.value = suggestedSlug(seriesNameInput.value);
  });

  if (seriesCreateForm) onWrite(seriesCreateForm, 'submit', async (event) => {
    event.preventDefault();
    if (!seriesCreateForm.reportValidity()) return;
    const profileVersion = currentProfileVersion();
    if (profileVersion === undefined) return;
    const values = new FormData(seriesCreateForm);
    const submittedValues = formState?.capture(seriesCreateForm);
    const name = String(values.get('name') ?? '').trim();
    const slug = String(values.get('slug') ?? '').trim();
    const description = String(values.get('description') ?? '').trim();
    const body = { name, slug, ...(description ? { description } : {}), profileVersion };
    setBusy(seriesCreateForm, true);
    try {
      const response = await api('/api/creador/series', 'POST', body);
      const createdMessage = 'Serie creada. Ahora puedes agregar capítulos desde los enlaces de tu página.';
      await finishSeriesWrite(response, seriesCreateStatus, createdMessage, undefined, submittedValues, {
        structural: true,
        pendingMessage: 'Serie creada. Para agregar capítulos, guarda los cambios pendientes en los otros formularios; la página se actualizará cuando termines. Tus campos se conservan.',
      });
    } catch (error) {
      announce(seriesCreateStatus, requestFailureMessage(error, 'No pudimos crear la serie. Tus datos siguen en el formulario; inténtalo de nuevo.'), 'error');
    } finally {
      setBusy(seriesCreateForm, false);
    }
  });

  root.querySelectorAll<HTMLFormElement>('[data-series-form]').forEach((form) => {
    const status = form.querySelector<HTMLElement>('[data-series-form-status]');
    onWrite(form, 'submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const seriesId = form.closest<HTMLElement>('[data-series-id]')?.dataset.seriesId;
      const series = seriesId ? seriesById(seriesId) : undefined;
      const profileVersion = currentProfileVersion();
      if (!series || profileVersion === undefined) return;
      const values = new FormData(form);
      const submittedValues = formState?.capture(form);
      const body = {
        version: series.version,
        profileVersion,
        name: String(values.get('name') ?? '').trim(),
        slug: String(values.get('slug') ?? '').trim(),
        description: String(values.get('description') ?? '').trim(),
      };
      setBusy(form, true);
      try {
        const response = await api(`/api/creador/series/${encodeURIComponent(series.id)}`, 'PATCH', body);
        await finishSeriesWrite(response, status, 'Cambios guardados.', undefined, submittedValues, { ownEntity: 'series', ownId: series.id });
      } catch (error) {
        announce(status, requestFailureMessage(error, 'No pudimos guardar la serie. Tus datos siguen en el formulario; inténtalo de nuevo.'), 'error');
      } finally {
        setBusy(form, false);
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-copy-series-url]').forEach((button) => {
    button.addEventListener('click', async () => {
      const url = button.dataset.url;
      if (!url) return;
      const status = button.closest<HTMLElement>('[data-series-id]')?.querySelector<HTMLElement>('[data-series-status]');
      try {
        await navigator.clipboard.writeText(url);
        announce(status, 'Dirección copiada.', 'success');
      } catch {
        announce(status, `Copia esta dirección: ${url}`, 'info');
      }
    });
  });

  root.querySelectorAll<HTMLFormElement>('[data-series-add-chapter-form]').forEach((form) => {
    const fieldset = form.querySelector<HTMLFieldSetElement>('fieldset');
    const status = form.closest<HTMLElement>('[data-series-id]')?.querySelector<HTMLElement>('[data-series-status]');
    onWrite(form, 'submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const seriesId = form.closest<HTMLElement>('[data-series-id]')?.dataset.seriesId;
      const profileVersion = currentProfileVersion();
      const values = new FormData(form);
      const submittedValues = formState?.capture(form);
      const placementId = String(values.get('placementId') ?? '');
      if (!seriesId || !placementId || profileVersion === undefined) return;
      const current = linkByPlacement(placementId);
      if (!current || current.series.some((item) => item.seriesId === seriesId)) return;
      if (fieldset) fieldset.disabled = true;
      try {
        const response = await api(`/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}`, 'PUT', { profileVersion });
        await finishSeriesWrite(response, status, `Se agregó ${current.title} a la serie.`, undefined, submittedValues, { structural: true });
      } catch (error) {
        announce(status, requestFailureMessage(error, 'No pudimos agregar el capítulo. Inténtalo de nuevo.'), 'error');
      } finally {
        if (fieldset) fieldset.disabled = false;
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-series-move]').forEach((button) => {
    onWrite(button, 'click', async () => {
      const section = button.closest<HTMLElement>('[data-series-id]');
      const seriesId = section?.dataset.seriesId;
      const item = button.closest<HTMLElement>('[data-series-chapter]');
      const placementId = item?.dataset.seriesPlacementId;
      const direction = button.dataset.seriesMove;
      const profileVersion = currentProfileVersion();
      if (!seriesId || !placementId || (direction !== 'up' && direction !== 'down') || profileVersion === undefined) return;
      button.disabled = true;
      try {
        const response = await api(`/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}`, 'PATCH', {
          profileVersion,
          direction,
        });
        await finishSeriesWrite(response, seriesStatus(button), 'Orden de capítulos actualizado.', item?.id, undefined, { structural: true });
      } catch (error) {
        announce(seriesStatus(button), requestFailureMessage(error, 'No pudimos cambiar el orden. Inténtalo de nuevo.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-series-remove-chapter]').forEach((button) => {
    onWrite(button, 'click', async () => {
      const section = button.closest<HTMLElement>('[data-series-id]');
      const seriesId = section?.dataset.seriesId;
      const item = button.closest<HTMLElement>('[data-series-chapter]');
      const placementId = item?.dataset.seriesPlacementId;
      const profileVersion = currentProfileVersion();
      if (!seriesId || !placementId || profileVersion === undefined) return;
      button.disabled = true;
      try {
        const response = await api(`/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}`, 'DELETE', { profileVersion });
        const focusId = section?.querySelector<HTMLElement>('[id$="-chapters-title"]')?.id;
        await finishSeriesWrite(response, seriesStatus(button), 'Capítulo quitado de esta serie. El enlace permanece en tu página y en otras series.', focusId, undefined, { structural: true });
      } catch (error) {
        announce(seriesStatus(button), requestFailureMessage(error, 'No pudimos quitar el capítulo. Inténtalo de nuevo.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-delete-series]').forEach((button) => {
    onWrite(button, 'click', async () => {
      const section = button.closest<HTMLElement>('[data-series-id]');
      const seriesId = section?.dataset.seriesId;
      const series = seriesId ? seriesById(seriesId) : undefined;
      const profileVersion = currentProfileVersion();
      if (!series || profileVersion === undefined) return;
      const confirmed = window.confirm(`¿Eliminar la serie «${series.name}»? Se conservarán los enlaces de tu página y su selección para el directorio.`);
      if (!confirmed) return;
      const deletedForm = section?.querySelector<HTMLFormElement>('[data-series-form]');
      button.disabled = true;
      try {
        const response = await api(`/api/creador/series/${encodeURIComponent(series.id)}`, 'DELETE', {
          version: series.version,
          profileVersion,
        });
        if (response.ok && section) {
          section.querySelectorAll<HTMLElement>('input, textarea, select, button').forEach((control) => {
            control.setAttribute('data-creator-stale', 'true');
          });
          writeGuard?.markStale('[data-creator-stale]');
          announce(deletedForm?.querySelector('[data-series-form-status]'), 'La serie ya se eliminó. Sus controles ya no se pueden guardar; actualiza la vista después de guardar las otras correcciones.', 'info');
        }
        await finishSeriesWrite(response, seriesStatus(button), 'Serie eliminada. Tus enlaces y su selección para el directorio siguen en tu página.', 'creator-series-editor-title', section ? formState?.capture(section) : undefined, { structural: true });
      } catch (error) {
        announce(seriesStatus(button), requestFailureMessage(error, 'No pudimos eliminar la serie. Inténtalo de nuevo.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  const claimForm = root.querySelector<HTMLFormElement>('[data-claim-form]');
  const claimStatus = root.querySelector<HTMLElement>('[data-claim-status]');
  if (claimForm) onWrite(claimForm, 'submit', async (event) => {
    event.preventDefault();
    if (!claimForm.reportValidity()) return;
    const values = new FormData(claimForm);
    const submittedValues = formState?.capture(claimForm);
    const resourceIds = String(values.get('resourceIds') ?? '').split(',').map((id) => id.trim()).filter(Boolean);
    const uniqueResourceIds = [...new Set(resourceIds)];
    if (uniqueResourceIds.length === 0 || uniqueResourceIds.length !== resourceIds.length) {
      announce(claimStatus, 'Escribe uno o más IDs exactos, separados por comas y sin repetir.', 'error');
      return;
    }
    const sourceId = String(values.get('sourceId') ?? '').trim();
    const evidence = String(values.get('evidence') ?? '').trim();
    const body = {
      resourceIds: uniqueResourceIds,
      ...(sourceId ? { sourceId } : {}),
      ...(evidence ? { evidence } : {}),
    };
    setBusy(claimForm, true);
    try {
      const response = await api('/api/creador/reclamaciones', 'POST', body);
      await finishWrite(response, claimStatus, 'Solicitud enviada para revisión. La solicitud no cambia los permisos mientras se verifica.', submittedValues, { structural: true });
    } catch (error) {
      announce(claimStatus, requestFailureMessage(error, 'No pudimos conectar con el servicio. Tus datos siguen en el formulario; inténtalo de nuevo.'), 'error');
    } finally {
      setBusy(claimForm, false);
    }
  });

  const photoForm = root.querySelector<HTMLFormElement>('[data-photo-form]');
  const photoStatus = root.querySelector<HTMLElement>('[data-photo-status]');
  if (photoForm) onWrite(photoForm, 'submit', async (event) => {
    event.preventDefault();
    if (!photoForm.reportValidity()) return;
    const file = photoForm.querySelector<HTMLInputElement>('input[type="file"]')?.files?.[0];
    const currentProfile: CreatorProfileDTO | null = state?.profile ?? null;
    if (!file || !currentProfile) return;
    const supportedType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    if (!supportedType || file.size > 15 * 1024 * 1024) {
      announce(photoStatus, 'Elige una imagen JPEG, PNG o WebP de hasta 15 MiB.', 'error');
      return;
    }
    const submittedValues = formState?.capture(photoForm);
    setBusy(photoForm, true);
    let finalizationRequested = false;
    try {
      const authorize = await api('/api/creador/foto/autorizar', 'POST', { version: currentProfile.version });
      if (!authorize.ok) {
        announce(photoStatus, await photoErrorMessage(authorize), 'error');
        return;
      }
      const upload: unknown = await authorize.json();
      if (!isRecord(upload) || typeof upload.uploadId !== 'string' || !isRecord(upload.post)
        || typeof upload.post.url !== 'string' || !isRecord(upload.post.fields)) {
        announce(photoStatus, 'No pudimos preparar la carga de la foto. La imagen anterior sigue activa.', 'error');
        return;
      }
      const formData = new FormData();
      for (const [key, value] of Object.entries(upload.post.fields)) {
        if (typeof value === 'string') formData.append(key, value);
      }
      formData.append('file', file);
      const sent = await fetch(upload.post.url, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        body: formData,
      });
      if (!sent.ok) {
        announce(photoStatus, 'No pudimos subir la foto. La imagen anterior sigue activa; puedes intentarlo otra vez.', 'error');
        return;
      }
      finalizationRequested = true;
      const finish = await api('/api/creador/foto/finalizar', 'POST', {
        uploadId: upload.uploadId,
        version: currentProfile.version,
      });
      if (!finish.ok) {
        if (finish.status >= 500) {
          announce(photoStatus, PHOTO_FINALIZATION_UNCONFIRMED, 'error');
        } else {
          announce(photoStatus, await photoErrorMessage(finish), 'error');
        }
        return;
      }
      await finishWrite(finish, photoStatus, 'Foto guardada.', submittedValues, { ownEntity: 'profile', ownId: currentProfile.id });
    } catch (error) {
      const fallback = finalizationRequested
        ? PHOTO_FINALIZATION_UNCONFIRMED
        : 'No pudimos completar la carga. La imagen anterior sigue activa; inténtalo de nuevo.';
      announce(photoStatus, requestFailureMessage(error, fallback), 'error');
    } finally {
      setBusy(photoForm, false);
    }
  });
} else if (root) {
  announce(pageStatus, 'No pudimos leer los datos de tu página. Recarga para volver a intentarlo.', 'error');
}

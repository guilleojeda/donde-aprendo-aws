import type { CreatorEditorDTO } from '../types/creators';
import { creatorEditorFailureMessage } from '../lib/creator-editor-errors';
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
) {
  target.addEventListener(type, (event) => {
    if (sessionRecovery?.blocksWrites()) {
      event.preventDefault();
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

function linksStatus() {
  return root?.querySelector<HTMLElement>('[data-links-status]');
}

function observedVersion(change: CreatorVersionChange): number | undefined {
  if (!state) return undefined;
  if (change.entity === 'profile') return state.profile?.id === change.id ? state.profile.version : undefined;
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
  if (entity === 'resource' && isRecord(payload.resource) && payload.resource.id === id) {
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

function markStructuralControlsStale() {
  writeGuard?.markStale('[data-move], [data-remove-link], [data-featured], [data-directory], [data-readd-link]');
}

function showViewTransition(message: string) {
  const shell = root?.querySelector<HTMLElement>('[data-view-transition-shell]');
  if (shell) shell.hidden = false;
  const banner = root?.querySelector<HTMLElement>('[data-view-transition]');
  announce(banner, message);
  markStructuralControlsStale();
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
  if (!receiptGap) updateOwnedContent(options.ownEntity, options.ownId, payload);
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

if (root && state && csrfToken) {
  const refreshViewButton = root.querySelector<HTMLButtonElement>('[data-refresh-view]');
  refreshViewButton?.addEventListener('click', () => {
    if (formState?.hasPendingChanges()) {
      announce(root.querySelector('[data-view-transition]'), 'Guarda los cambios pendientes o revierte manualmente tus campos antes de actualizar la vista.');
      return;
    }
    window.location.reload();
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

} else if (root) {
  announce(pageStatus, 'No pudimos leer los datos de tu página. Recarga para volver a intentarlo.', 'error');
}

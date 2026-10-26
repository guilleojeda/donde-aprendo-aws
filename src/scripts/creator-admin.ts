import { createCreatorFormState, type FormValueSnapshot } from './creator-form-state';
import { createCreatorSessionRecovery } from './creator-session-recovery';
import { createCreatorWriteGuard, readCreatorVersionChanges, type CreatorVersionChange } from './creator-write-state';

interface CreatorAdminState {
  resources: Record<string, unknown>[];
  profiles: Record<string, unknown>[];
  claims: Record<string, unknown>[];
}

const root = document.querySelector<HTMLElement>('[data-creator-admin]');
const initial = document.querySelector<HTMLScriptElement>('#creator-admin-data');
const MAX_REQUEST_BYTES = 32 * 1024;
const REQUEST_TOO_LARGE = 'creator-request-too-large';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAdminState(value: unknown): value is CreatorAdminState {
  return isRecord(value)
    && Array.isArray(value.resources)
    && Array.isArray(value.profiles)
    && Array.isArray(value.claims)
    && [...value.resources, ...value.profiles, ...value.claims].every(isRecord);
}

let state: CreatorAdminState | undefined;
if (initial?.textContent) {
  try {
    const parsed: unknown = JSON.parse(initial.textContent);
    if (isAdminState(parsed)) state = parsed;
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

function announce(target: Element | null | undefined, message: string, kind: 'error' | 'success' = 'success') {
  if (!(target instanceof HTMLElement)) return;
  target.textContent = message;
  target.dataset.kind = kind;
}

function errorMessage(status: number): string {
  if (status === 401) return sessionRecovery?.writeFailureMessage() ?? 'Tu sesión terminó. Inicia sesión y vuelve a intentarlo.';
  if (status === 403) return sessionRecovery?.blocksWrites()
    ? sessionRecovery.writeFailureMessage()
    : 'Esta cuenta no tiene permiso para completar esta acción.';
  if (status === 409) return 'El registro cambió desde la última lectura. Recarga la página antes de volver a guardar.';
  if (status === 422) return 'Revisa la clasificación o los IDs seleccionados e inténtalo de nuevo.';
  if (status === 413) return 'La solicitud supera el límite de 32 KiB. Reduce los IDs seleccionados e inténtalo de nuevo.';
  if (status === 503 || status >= 500) return 'No pudimos guardar el cambio. Inténtalo de nuevo en unos minutos.';
  return 'No pudimos completar la acción. Revisa los datos e inténtalo de nuevo.';
}

async function responseErrorMessage(response: Response): Promise<string> {
  if (response.status !== 409) return errorMessage(response.status);
  try {
    const payload: unknown = await response.clone().json();
    const code = isRecord(payload) && typeof payload.error === 'string' ? payload.error : '';
    if (['PROFILE_CONFLICT', 'RESOURCE_CONFLICT', 'CLAIM_CONFLICT'].includes(code)) {
      return errorMessage(response.status);
    }
  } catch {
    // Keep the neutral fallback for a conflict without a recognized code.
  }
  return 'No pudimos completar el cambio porque hay un conflicto. Revisa el estado antes de volver a intentarlo.';
}

function requestFailureMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message === REQUEST_TOO_LARGE
    ? 'La solicitud supera el límite de 32 KiB. Reduce los IDs seleccionados e inténtalo de nuevo.'
    : fallback;
}

async function partialLinkDetails(response: Response, requestedIds: string[]): Promise<{ ids: string[]; changes: CreatorVersionChange[] | null }> {
  if (response.status !== 409 && response.status !== 503) return { ids: [], changes: null };
  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return { ids: [], changes: null };
  }
  if (!isRecord(body) || !Array.isArray(body.linkedResourceIds)) return { ids: [], changes: null };
  const requested = new Set(requestedIds);
  const ids = body.linkedResourceIds.filter((id): id is string => typeof id === 'string' && requested.has(id));
  const changes = await readCreatorVersionChanges(response);
  return { ids, changes };
}

function itemStatus(item: Element | null | undefined) {
  return item?.querySelector<HTMLElement>('[data-item-status]');
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

function onWrite(target: EventTarget, type: string, action: (event: Event) => Promise<void> | void) {
  target.addEventListener(type, (event) => {
    if (sessionRecovery?.blocksWrites()) {
      event.preventDefault();
      sessionRecovery.announceBlocked();
      return;
    }
    return writeGuard?.run(event, () => action(event));
  });
}

function applyVersionChanges(changes: CreatorVersionChange[]) {
  let gap = false;
  for (const change of changes) {
    const items = change.entity === 'profile' ? state?.profiles : change.entity === 'resource' ? state?.resources : [];
    const item = items?.find((candidate) => candidate.id === change.id);
    if (!item) continue;
    if (item.version !== change.before) {
      gap = true;
      continue;
    }
    item.version = change.after;
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

function updateOwnedContent(payload: Record<string, unknown> | null, entity: 'classification' | 'resource-action' | 'profile-action' | undefined, id?: string) {
  if (!state || !payload || !entity || !id) return;
  if (entity === 'classification' && isRecord(payload.resource)) {
    const returned = payload.resource;
    const current = state.resources.find((item) => item.id === id);
    if (current) {
      for (const field of ['category', 'kind', 'format', 'topics']) {
        if (Object.hasOwn(returned, field)) current[field] = returned[field];
      }
    }
  }
  if (entity === 'resource-action' && isRecord(payload.resource)) {
    const returned = payload.resource;
    const current = state.resources.find((item) => item.id === id);
    if (current) {
      for (const field of ['published', 'directoryApproval', 'directoryControl', 'hidden']) {
        if (Object.hasOwn(returned, field)) current[field] = returned[field];
      }
    }
  }
  if (entity === 'profile-action' && isRecord(payload.profile)) {
    const returned = payload.profile;
    const current = state.profiles.find((item) => item.id === id);
    if (current && Object.hasOwn(returned, 'hidden')) current.hidden = returned.hidden;
  }
}

function markAdminActionsStale(selector: string, within: ParentNode = root as HTMLElement) {
  within.querySelectorAll<HTMLElement>(selector).forEach((control) => {
    control.setAttribute('data-creator-stale', 'true');
  });
  writeGuard?.markStale('[data-creator-stale]');
}

function showViewTransition(message: string) {
  const shell = root?.querySelector<HTMLElement>('[data-view-transition-shell]');
  if (shell) shell.hidden = false;
  const status = root?.querySelector<HTMLElement>('[data-view-transition]');
  announce(status, message, 'success');
}

async function finishAdminWrite(
  response: Response,
  target: Element | null | undefined,
  successMessage: string,
  submittedValues?: FormValueSnapshot,
  options: { structural?: boolean; entity?: 'classification' | 'resource-action' | 'profile-action'; id?: string } = {},
) {
  const changes = await readCreatorVersionChanges(response);
  const receiptGap = changes === null || applyVersionChanges(changes);
  const payload = await responsePayload(response);
  if (!receiptGap) updateOwnedContent(payload, options.entity, options.id);
  formState?.commit(submittedValues);
  const hasPendingChanges = formState?.hasPendingChanges() ?? false;
  if (hasPendingChanges) {
    let message = `${successMessage} Conservamos los cambios que aún no enviaste; puedes seguir editándolos y guardarlos.`;
    if (receiptGap) {
      showViewTransition(`${successMessage} El recibo no coincide con las versiones que esta página observó. Conservamos tus campos; revisa cualquier conflicto antes de actualizar la vista. Guarda otros cambios válidos o revierte los pendientes. Si un formulario da conflicto, copia su corrección antes de actualizar.`);
      message = `${successMessage} El recibo no coincide con una versión que esta página observó. Conservamos los cambios pendientes y habilitamos una actualización segura cuando los guardes o reviertas.`;
    } else if (options.structural) {
      showViewTransition(`${successMessage} Guarda o revierte los cambios pendientes; la página se actualizará cuando termines. Tus campos se conservan.`);
    }
    announce(target, message);
    return;
  }
  announce(target, successMessage);
  window.location.reload();
}

function busy(form: HTMLFormElement, value: boolean) {
  form.setAttribute('aria-busy', String(value));
}

if (root && state && csrfToken) {
  const refreshViewButton = root.querySelector<HTMLButtonElement>('[data-refresh-view]');
  refreshViewButton?.addEventListener('click', () => {
    if (formState?.hasPendingChanges()) {
      announce(root.querySelector('[data-view-transition]'), 'Guarda los cambios pendientes o revierte manualmente tus campos antes de actualizar la vista.', 'error');
      return;
    }
    window.location.reload();
  });
  root.querySelectorAll<HTMLFormElement>('[data-classification-form]').forEach((form) => {
    onWrite(form, 'submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const item = form.closest<HTMLElement>('[data-admin-resource]');
      const resourceId = item?.dataset.adminResource;
      const resource = state?.resources.find((candidate) => candidate.id === resourceId);
      if (!resourceId || !resource) return;
      const version = typeof resource.version === 'number' ? resource.version : undefined;
      const values = new FormData(form);
      const topicValues = String(values.get('topics') ?? '').split(',').map((topic) => topic.trim()).filter(Boolean);
      const allowedTopics = new Set(Array.from(form.querySelectorAll<HTMLOptionElement>('datalist option')).map((option) => option.value));
      if (topicValues.length > 3 || new Set(topicValues).size !== topicValues.length
        || topicValues.some((topic) => !allowedTopics.has(topic))) {
        announce(itemStatus(item), 'Elige hasta tres temas válidos, sin repetirlos.', 'error');
        return;
      }
      const body = {
        category: String(values.get('category') ?? '').trim(),
        kind: String(values.get('kind') ?? '').trim(),
        format: String(values.get('format') ?? '').trim(),
        topics: topicValues,
        ...(version !== undefined ? { version } : {}),
      };
      const submittedValues = formState?.capture(form);
      busy(form, true);
      try {
        const response = await api(`/api/admin/recursos/${encodeURIComponent(resourceId)}`, 'PATCH', body);
        if (!response.ok) {
          announce(itemStatus(item), await responseErrorMessage(response), 'error');
          return;
        }
        await finishAdminWrite(response, itemStatus(item), 'Clasificación guardada.', submittedValues, { entity: 'classification', id: resourceId });
      } catch (error) {
        announce(itemStatus(item), requestFailureMessage(error, 'No pudimos conectar con el servicio. Inténtalo de nuevo.'), 'error');
      } finally {
        busy(form, false);
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-resource-action]').forEach((button) => {
    onWrite(button, 'click', async () => {
      const item = button.closest<HTMLElement>('[data-admin-resource]');
      const resourceId = item?.dataset.adminResource;
      const action = button.dataset.resourceAction;
      if (!resourceId || !['aprobar', 'revocar', 'ocultar', 'restaurar'].includes(action ?? '')) return;
      button.disabled = true;
      try {
        const response = await api(`/api/admin/recursos/${encodeURIComponent(resourceId)}/${action}`, 'POST', {});
        if (!response.ok) {
          announce(itemStatus(item), await responseErrorMessage(response), 'error');
          return;
        }
        if (item) markAdminActionsStale('[data-resource-action]', item);
        await finishAdminWrite(response, itemStatus(item), action === 'aprobar'
          ? 'Recurso aprobado para el directorio.'
          : action === 'revocar'
            ? 'Aprobación revocada. El enlace puede seguir visible en páginas de creadores.'
            : action === 'ocultar'
              ? 'Recurso oculto en las páginas públicas.'
              : 'Recurso restaurado.', undefined, { structural: true, entity: 'resource-action', id: resourceId });
      } catch (error) {
        announce(itemStatus(item), requestFailureMessage(error, 'No pudimos conectar con el servicio. Inténtalo de nuevo.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-profile-action]').forEach((button) => {
    onWrite(button, 'click', async () => {
      const item = button.closest<HTMLElement>('[data-admin-profile]');
      const profileId = item?.dataset.adminProfile;
      const action = button.dataset.profileAction;
      if (!profileId || !['ocultar', 'restaurar'].includes(action ?? '')) return;
      button.disabled = true;
      try {
        const response = await api(`/api/admin/perfiles/${encodeURIComponent(profileId)}/${action}`, 'POST', {});
        if (!response.ok) {
          announce(itemStatus(item), await responseErrorMessage(response), 'error');
          return;
        }
        if (item) markAdminActionsStale('[data-profile-action]', item);
        await finishAdminWrite(response, itemStatus(item), action === 'ocultar' ? 'Perfil oculto.' : 'Perfil restaurado.', undefined, { structural: true, entity: 'profile-action', id: profileId });
      } catch (error) {
        announce(itemStatus(item), requestFailureMessage(error, 'No pudimos conectar con el servicio. Inténtalo de nuevo.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  root.querySelectorAll<HTMLFormElement>('[data-claim-resolution]').forEach((form) => {
    onWrite(form, 'submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const item = form.closest<HTMLElement>('[data-admin-claim]');
      const claimId = item?.dataset.adminClaim;
      const claim = state?.claims.find((candidate) => (candidate.id ?? candidate.claimId) === claimId);
      if (!claimId || !claim || typeof claim.accountId !== 'string'
        || !Array.isArray(claim.resourceIds)) return;
      const claimResourceIds = claim.resourceIds.filter((id): id is string => typeof id === 'string');
      if (claimResourceIds.length !== claim.resourceIds.length) return;
      const allowedIds = new Set(claimResourceIds);
      const values = new FormData(form);
      const submittedValues = formState?.capture(form);
      const selectedIds = values.getAll('resourceIds').map(String);
      if (selectedIds.length === 0 || selectedIds.some((id) => !allowedIds.has(id))) {
        announce(itemStatus(item), 'Selecciona uno o más IDs incluidos en la solicitud.', 'error');
        return;
      }
      busy(form, true);
      try {
        const response = await api('/api/admin/reclamaciones/vincular', 'POST', {
          accountId: claim.accountId,
          ...(typeof claim.sourceId === 'string' && claim.sourceId ? { sourceId: claim.sourceId } : {}),
          resourceIds: selectedIds,
        });
        if (!response.ok) {
          const { ids: linkedIds, changes } = await partialLinkDetails(response, selectedIds);
          if (changes) {
            const receiptGap = applyVersionChanges(changes);
            if (receiptGap) writeGuard?.markStale('button:not([data-refresh-view]), [data-featured], [data-directory]');
          }
          if (linkedIds.length > 0) {
            const linked = new Set(linkedIds);
            form.querySelectorAll<HTMLInputElement>('input[name="resourceIds"]').forEach((checkbox) => {
              if (linked.has(checkbox.value)) {
                checkbox.checked = true;
                checkbox.setAttribute('data-creator-stale', 'true');
              }
            });
            markAdminActionsStale('[data-claim-resolution] button', item ?? form);
            markAdminActionsStale('[data-claim-resolution] input[name="resourceIds"]', item ?? form);
            const remainingIds = selectedIds.filter((id) => !linked.has(id));
            showViewTransition('La vinculación se completó parcialmente. Actualiza la vista antes de resolver otra vez esta solicitud.');
            announce(itemStatus(item), remainingIds.length > 0
              ? `Vinculación parcial. Ya vinculados: ${linkedIds.join(', ')}. Pendientes: ${remainingIds.join(', ')}. Los checks de los pendientes se conservaron; recarga para actualizar el estado y reintenta sólo esos IDs.`
              : `Los recursos ya vinculados son: ${linkedIds.join(', ')}. Recarga para actualizar el estado de la solicitud.`, 'error');
            return;
          }
          announce(itemStatus(item), await responseErrorMessage(response), 'error');
          return;
        }
        markAdminActionsStale('[data-resource-action], [data-profile-action]');
        markAdminActionsStale('[data-claim-resolution] button, [data-claim-resolution] input[name="resourceIds"]', item ?? form);
        await finishAdminWrite(response, itemStatus(item), 'Recursos vinculados a la cuenta.', submittedValues, { structural: true });
      } catch (error) {
        announce(itemStatus(item), requestFailureMessage(error, 'No pudimos conectar con el servicio. Inténtalo de nuevo.'), 'error');
      } finally {
        busy(form, false);
      }
    });
  });
} else if (root) {
  const status = root.querySelector<HTMLElement>('[data-admin-status]');
  announce(status, 'No pudimos leer los datos de administración. Recarga para volver a intentarlo.', 'error');
}

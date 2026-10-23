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

const csrfToken = root?.dataset.csrf;

function announce(target: Element | null | undefined, message: string, kind: 'error' | 'success' = 'success') {
  if (!(target instanceof HTMLElement)) return;
  target.textContent = message;
  target.dataset.kind = kind;
}

function errorMessage(status: number): string {
  if (status === 401) return 'Tu sesión terminó. Inicia sesión y vuelve a intentarlo.';
  if (status === 403) return 'Esta cuenta no tiene permiso para completar esta acción.';
  if (status === 409) return 'El registro cambió desde la última lectura. Recarga la página antes de volver a guardar.';
  if (status === 422) return 'Revisa la clasificación o los IDs seleccionados e inténtalo de nuevo.';
  if (status === 413) return 'La solicitud supera el límite de 32 KiB. Reduce los IDs seleccionados e inténtalo de nuevo.';
  if (status === 503 || status >= 500) return 'No pudimos guardar el cambio. Inténtalo de nuevo en unos minutos.';
  return 'No pudimos completar la acción. Revisa los datos e inténtalo de nuevo.';
}

function requestFailureMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message === REQUEST_TOO_LARGE
    ? 'La solicitud supera el límite de 32 KiB. Reduce los IDs seleccionados e inténtalo de nuevo.'
    : fallback;
}

async function partiallyLinkedResourceIds(response: Response, requestedIds: string[]): Promise<string[]> {
  if (response.status !== 409 && response.status !== 503) return [];
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return [];
  }
  if (!isRecord(body) || !Array.isArray(body.linkedResourceIds)) return [];
  const requested = new Set(requestedIds);
  return body.linkedResourceIds.filter((id): id is string => typeof id === 'string' && requested.has(id));
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
  return fetch(`${path.replace(/\/$/, '')}/`, {
    method,
    credentials: 'same-origin',
    headers: {
      'x-csrf-token': csrfToken,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(serializedBody === undefined ? {} : { body: serializedBody }),
  });
}

function busy(form: HTMLFormElement, value: boolean) {
  form.setAttribute('aria-busy', String(value));
  form.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.disabled = value;
  });
}

if (root && state && csrfToken) {
  root.querySelectorAll<HTMLFormElement>('[data-classification-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
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
      busy(form, true);
      try {
        const response = await api(`/api/admin/recursos/${encodeURIComponent(resourceId)}`, 'PATCH', body);
        if (!response.ok) {
          announce(itemStatus(item), errorMessage(response.status), 'error');
          return;
        }
        announce(itemStatus(item), 'Clasificación guardada.');
        window.location.reload();
      } catch (error) {
        announce(itemStatus(item), requestFailureMessage(error, 'No pudimos conectar con el servicio. Inténtalo de nuevo.'), 'error');
      } finally {
        busy(form, false);
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-resource-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const item = button.closest<HTMLElement>('[data-admin-resource]');
      const resourceId = item?.dataset.adminResource;
      const action = button.dataset.resourceAction;
      if (!resourceId || !['aprobar', 'revocar', 'ocultar', 'restaurar'].includes(action ?? '')) return;
      button.disabled = true;
      try {
        const response = await api(`/api/admin/recursos/${encodeURIComponent(resourceId)}/${action}`, 'POST', {});
        if (!response.ok) {
          announce(itemStatus(item), errorMessage(response.status), 'error');
          return;
        }
        announce(itemStatus(item), action === 'aprobar'
          ? 'Recurso aprobado para el directorio.'
          : action === 'revocar'
            ? 'Aprobación revocada. El enlace puede seguir visible en páginas de creadores.'
            : action === 'ocultar'
              ? 'Recurso oculto en las páginas públicas.'
              : 'Recurso restaurado.');
        window.location.reload();
      } catch (error) {
        announce(itemStatus(item), requestFailureMessage(error, 'No pudimos conectar con el servicio. Inténtalo de nuevo.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-profile-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const item = button.closest<HTMLElement>('[data-admin-profile]');
      const profileId = item?.dataset.adminProfile;
      const action = button.dataset.profileAction;
      if (!profileId || !['ocultar', 'restaurar'].includes(action ?? '')) return;
      button.disabled = true;
      try {
        const response = await api(`/api/admin/perfiles/${encodeURIComponent(profileId)}/${action}`, 'POST', {});
        if (!response.ok) {
          announce(itemStatus(item), errorMessage(response.status), 'error');
          return;
        }
        announce(itemStatus(item), action === 'ocultar' ? 'Perfil oculto.' : 'Perfil restaurado.');
        window.location.reload();
      } catch (error) {
        announce(itemStatus(item), requestFailureMessage(error, 'No pudimos conectar con el servicio. Inténtalo de nuevo.'), 'error');
      } finally {
        button.disabled = false;
      }
    });
  });

  root.querySelectorAll<HTMLFormElement>('[data-claim-resolution]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
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
      const selectedIds = values.getAll('resourceIds').map(String);
      if (selectedIds.length === 0 || selectedIds.some((id) => !allowedIds.has(id))) {
        announce(itemStatus(item), 'Selecciona uno o más IDs incluidos en la solicitud.', 'error');
        return;
      }
      const resourceCheckboxes = [...form.querySelectorAll<HTMLInputElement>('input[name="resourceIds"]')];
      const disabledBeforeRequest = new Set(resourceCheckboxes.filter((checkbox) => checkbox.disabled));
      const linkedDuringRequest = new Set<string>();
      resourceCheckboxes.forEach((checkbox) => { checkbox.disabled = true; });
      busy(form, true);
      try {
        const response = await api('/api/admin/reclamaciones/vincular', 'POST', {
          accountId: claim.accountId,
          ...(typeof claim.sourceId === 'string' && claim.sourceId ? { sourceId: claim.sourceId } : {}),
          resourceIds: selectedIds,
        });
        if (!response.ok) {
          const linkedIds = await partiallyLinkedResourceIds(response, selectedIds);
          if (linkedIds.length > 0) {
            const linked = new Set(linkedIds);
            form.querySelectorAll<HTMLInputElement>('input[name="resourceIds"]').forEach((checkbox) => {
              if (linked.has(checkbox.value)) {
                checkbox.checked = true;
                linkedDuringRequest.add(checkbox.value);
              }
            });
            const remainingIds = selectedIds.filter((id) => !linked.has(id));
            announce(itemStatus(item), remainingIds.length > 0
              ? `Vinculación parcial. Ya vinculados: ${linkedIds.join(', ')}. Pendientes: ${remainingIds.join(', ')}. Los checks de los pendientes se conservaron; recarga para actualizar el estado y reintenta sólo esos IDs.`
              : `Los recursos ya vinculados son: ${linkedIds.join(', ')}. Recarga para actualizar el estado de la solicitud.`, 'error');
            return;
          }
          announce(itemStatus(item), errorMessage(response.status), 'error');
          return;
        }
        announce(itemStatus(item), 'Recursos vinculados a la cuenta.');
        window.location.reload();
      } catch (error) {
        announce(itemStatus(item), requestFailureMessage(error, 'No pudimos conectar con el servicio. Inténtalo de nuevo.'), 'error');
      } finally {
        busy(form, false);
        resourceCheckboxes.forEach((checkbox) => {
          checkbox.disabled = disabledBeforeRequest.has(checkbox) || linkedDuringRequest.has(checkbox.value);
        });
      }
    });
  });
} else if (root) {
  const status = root.querySelector<HTMLElement>('[data-admin-status]');
  announce(status, 'No pudimos leer los datos de administración. Recarga para volver a intentarlo.', 'error');
}

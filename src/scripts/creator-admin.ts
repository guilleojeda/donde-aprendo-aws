import { createCreatorFormState, type FormValueSnapshot } from './creator-form-state';
import { createCreatorSessionRecovery } from './creator-session-recovery';
import { createCreatorWriteGuard, readCreatorVersionChanges, type CreatorVersionChange } from './creator-write-state';
import { validateTaxonomy } from '../lib/resource-taxonomy.mjs';

interface CreatorAdminState {
  resources: Record<string, unknown>[];
  profiles: Record<string, unknown>[];
  claims: Record<string, unknown>[];
}

type AdminEntity = 'resource' | 'profile';
type AdminCommandKind = 'classification' | 'resource-action' | 'profile-action' | 'claim';

interface AdminTarget {
  entity: AdminEntity;
  id: string;
  version?: number;
}

interface AdminCommandContext {
  kind: AdminCommandKind;
  targets: readonly AdminTarget[];
}

interface AdminCompletion {
  payload: Record<string, unknown> | null;
  linkedIds: string[];
  claimReviewRequired: boolean;
  receiptProblem: boolean;
  gaps: CreatorVersionChange[];
}

const root = document.querySelector<HTMLElement>('[data-creator-admin]');
const initial = document.querySelector<HTMLScriptElement>('#creator-admin-data');
const MAX_REQUEST_BYTES = 32 * 1024;
const REQUEST_TOO_LARGE = 'creator-request-too-large';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resourceDomToken(id: string): string {
  return encodeURIComponent(id);
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
  updateCsrf: (token) => {
    csrfToken = token;
    const logoutToken = root.querySelector<HTMLInputElement>('[data-account-logout] input[name="csrfToken"]');
    if (logoutToken) logoutToken.value = token;
  },
}) : undefined;

function announce(target: Element | null | undefined, message: string, kind: 'error' | 'success' = 'success') {
  if (!(target instanceof HTMLElement)) return;
  target.hidden = false;
  target.textContent = message;
  target.dataset.kind = kind;
}

let beforeUnloadInstalled = false;

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!formState?.hasPendingChanges()) return;
  event.preventDefault();
  event.returnValue = '';
}

function syncBeforeUnload(): boolean {
  const pending = formState?.hasPendingChanges() ?? false;
  if (pending === beforeUnloadInstalled) return pending;
  if (pending) window.addEventListener('beforeunload', onBeforeUnload);
  else window.removeEventListener('beforeunload', onBeforeUnload);
  beforeUnloadInstalled = pending;
  return pending;
}

function onFormStateChange() {
  syncBeforeUnload();
}

function onAdminLogout(event: Event) {
  if (!formState?.hasPendingChanges()) return;
  event.preventDefault();
  syncBeforeUnload();
  announce(root?.querySelector('[data-admin-status]'),
    'Guarda o revierte los cambios pendientes antes de cerrar sesión.', 'error');
}

if (root) {
  root.addEventListener('input', onFormStateChange);
  root.addEventListener('change', onFormStateChange);
  root.addEventListener('account:logout', onAdminLogout);
  syncBeforeUnload();
  root.querySelector<HTMLElement>('[data-admin-logout-shell]')?.removeAttribute('inert');
}

function observedVersion(record: Record<string, unknown> | undefined): number | undefined {
  const version = record?.version;
  return typeof version === 'number' && Number.isSafeInteger(version) && version >= 0 ? version : undefined;
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

async function responseErrorMessage(
  response: Response,
  knownPayload?: Record<string, unknown> | null,
): Promise<string> {
  if (response.status !== 409 && response.status !== 422) return errorMessage(response.status);
  try {
    const payload: unknown = knownPayload ?? await response.clone().json();
    const code = isRecord(payload) && typeof payload.error === 'string' ? payload.error : '';
    if (response.status === 422 && code === 'CREATOR_CONTENT_TOO_LARGE') {
      return 'La página alcanzó su capacidad. Libera espacio en ella antes de volver a vincular recursos.';
    }
    if (['PROFILE_CONFLICT', 'RESOURCE_CONFLICT', 'CLAIM_CONFLICT'].includes(code)) {
      return errorMessage(response.status);
    }
  } catch {
    // Keep the neutral fallback for a conflict without a recognized code.
  }
  return response.status === 409
    ? 'No pudimos completar el cambio porque hay un conflicto. Revisa el estado antes de volver a intentarlo.'
    : errorMessage(response.status);
}

function requestFailureMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message === REQUEST_TOO_LARGE
    ? 'La solicitud supera el límite de 32 KiB. Reduce los IDs seleccionados e inténtalo de nuevo.'
    : fallback;
}

function itemStatus(item: Element | null | undefined) {
  return item?.querySelector<HTMLElement>('[data-item-status]');
}

function adminResourceCommandUrl(resourceId: string, action?: string): string {
  const pathname = action
    ? `/api/admin/recursos/${action}/`
    : '/api/admin/recursos/';
  const query = new URLSearchParams({ id: resourceId });
  return `${pathname}?${query.toString()}`;
}

async function api(url: string, method: string, body?: unknown): Promise<Response> {
  if (!csrfToken) throw new Error('missing-csrf');
  const serializedBody = body === undefined ? undefined : JSON.stringify(body);
  if (serializedBody !== undefined && new TextEncoder().encode(serializedBody).byteLength > MAX_REQUEST_BYTES) {
    throw new Error(REQUEST_TOO_LARGE);
  }
  const response = await fetch(url, {
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
  const gaps: CreatorVersionChange[] = [];
  for (const change of changes) {
    const items = change.entity === 'profile' ? state?.profiles : change.entity === 'resource' ? state?.resources : [];
    const item = items?.find((candidate) => candidate.id === change.id);
    if (!item) continue;
    if (item.version !== change.before) {
      gaps.push(change);
      continue;
    }
    item.version = change.after;
  }
  return gaps;
}

function targetKey(entity: string, id: string): string {
  return `${entity}:${id}`;
}

function receiptScopeIsValid(
  changes: CreatorVersionChange[],
  context: AdminCommandContext,
): boolean {
  const targets = new Set(context.targets.map(({ entity, id }) => targetKey(entity, id)));
  for (const change of changes) {
    if (change.entity !== 'resource' && change.entity !== 'profile') return false;
    const key = targetKey(change.entity, change.id);
    if (!targets.has(key)) return false;
  }

  if (context.kind === 'claim') {
    return true;
  }

  const target = context.targets[0];
  if (!target || changes.length > 1) return false;
  if (changes.length === 0) return true;
  const [change] = changes;
  return change.entity === target.entity && change.id === target.id
    && (target.version === undefined || change.before === target.version);
}

function isVersionStep(change: CreatorVersionChange): boolean {
  return Number.isSafeInteger(change.before + 1) && change.after === change.before + 1;
}

function receiptChainIsValid(
  changes: CreatorVersionChange[],
  context: AdminCommandContext,
  linkedIds: readonly string[],
): boolean {
  if (!changes.every(isVersionStep)) return false;
  if (context.kind !== 'claim') return true;

  // Each confirmed grant can emit one profile step followed by one resource step.
  // Either may be absent. Use the first available slot so later grants have room.
  let offset = 0;
  let profileAfter: number | undefined;
  for (const id of linkedIds) {
    const profile = changes[offset];
    if (profile?.entity === 'profile') {
      if (profileAfter !== undefined && profile.before !== profileAfter) return false;
      profileAfter = profile.after;
      offset += 1;
    }
    const resource = changes[offset];
    if (resource?.entity === 'resource' && resource.id === id) offset += 1;
  }
  return offset === changes.length;
}

function singleTargetCanonicalIsValid(
  payload: Record<string, unknown> | null,
  changes: CreatorVersionChange[],
  context: AdminCommandContext,
): boolean {
  if (context.kind === 'claim') return true;
  const target = context.targets[0];
  if (!target || !payload) return false;
  const property = target.entity === 'resource' ? 'resource' : 'profile';
  const returned = isRecord(payload[property]) ? payload[property] as Record<string, unknown> : null;
  const canonicalVersion = observedVersion(returned ?? undefined);
  if (!returned || returned.id !== target.id || canonicalVersion === undefined) return false;
  if (changes.length === 0) return target.version === undefined || canonicalVersion === target.version;
  return changes.length === 1 && changes[0].after === canonicalVersion;
}

function claimLinkedPrefix(
  payload: Record<string, unknown> | null,
  context: AdminCommandContext,
  response: Response,
  changes: CreatorVersionChange[] | null,
): { ids: string[]; valid: boolean } {
  if (context.kind !== 'claim' || !Array.isArray(payload?.linkedResourceIds)) return { ids: [], valid: false };
  const requested = context.targets.filter(({ entity }) => entity === 'resource').map(({ id }) => id);
  if (new Set(requested).size !== requested.length) return { ids: [], valid: false };
  const ids: string[] = [];
  for (let index = 0; index < payload.linkedResourceIds.length; index += 1) {
    const value = payload.linkedResourceIds[index];
    if (typeof value !== 'string' || value !== requested[index]) break;
    ids.push(value);
  }
  const complete = ids.length === requested.length;
  const quotaFailure = response.status === 422 && payload.error === 'CREATOR_CONTENT_TOO_LARGE';
  const failedAt = typeof payload.failedResourceId === 'string' ? requested.indexOf(payload.failedResourceId) : -1;
  const stageMatches = complete
    ? !Object.hasOwn(payload, 'failedResourceId') && !quotaFailure
    : !response.ok && failedAt > 0 && ids.length === failedAt;
  const valid = ids.length === payload.linkedResourceIds.length && stageMatches;
  if (response.ok || valid) return { ids, valid };

  // The server stops at failedResourceId. Without a known stop, only a coherent
  // chain of resource steps can corroborate IDs, and a full prefix is unsafe.
  if (failedAt >= 0) return { ids: ids.slice(0, failedAt), valid: false };
  const earlierIds = ids.slice(0, requested.length - 1);
  if (!changes || !receiptScopeIsValid(changes, context) || !receiptChainIsValid(changes, context, earlierIds)) {
    return { ids: [], valid: false };
  }
  const changedResources = new Set(changes.filter(({ entity }) => entity === 'resource').map(({ id }) => id));
  const unsupported = earlierIds.findIndex((id) => !changedResources.has(id));
  return { ids: unsupported < 0 ? earlierIds : earlierIds.slice(0, unsupported), valid: false };
}

async function completeAdminWrite(response: Response, context: AdminCommandContext): Promise<AdminCompletion> {
  const payload = await responsePayload(response);
  const claimReviewRequired = context.kind === 'claim' && !response.ok
    && (Array.isArray(payload?.linkedResourceIds)
      || payload?.error === 'PARTIAL_CLAIM_WRITE'
      || typeof payload?.profileChanged === 'boolean'
      || typeof payload?.failedResourceId === 'string'
      || (Array.isArray(payload?.versionChanges) && payload.versionChanges.length > 0));
  if (!response.ok && !claimReviewRequired) {
    return { payload, linkedIds: [], claimReviewRequired: false, receiptProblem: false, gaps: [] };
  }

  const changes = readCreatorVersionChanges(payload);
  const linkedReceipt = context.kind === 'claim'
    ? claimLinkedPrefix(payload, context, response, changes)
    : { ids: [], valid: true };
  const linkedIds = linkedReceipt.ids;
  const profileDeltaPresent = changes?.some(({ entity }) => entity === 'profile') ?? false;
  const profileChangedMatchesReceipt = context.kind !== 'claim'
    || (typeof payload?.profileChanged === 'boolean' && payload.profileChanged === profileDeltaPresent);
  const usable = changes !== null && linkedReceipt.valid
    && profileChangedMatchesReceipt
    && receiptScopeIsValid(changes ?? [], context)
    && receiptChainIsValid(changes ?? [], context, linkedIds)
    && singleTargetCanonicalIsValid(payload, changes ?? [], context);
  if (!usable) {
    pauseAdminRows(context.targets);
    return {
      payload,
      linkedIds,
      claimReviewRequired,
      receiptProblem: true,
      gaps: [],
    };
  }

  const gaps = applyVersionChanges(changes);
  pauseAdminRows(gaps);
  return {
    payload,
    linkedIds,
    claimReviewRequired,
    receiptProblem: false,
    gaps,
  };
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

function pauseAdminRows(records: readonly Pick<CreatorVersionChange, 'entity' | 'id'>[]) {
  if (!root) return;
  for (const { entity, id } of records) {
    const selector = entity === 'resource' ? '[data-admin-resource]'
      : entity === 'profile' ? '[data-admin-profile]' : undefined;
    const datasetKey = entity === 'resource' ? 'adminResource'
      : entity === 'profile' ? 'adminProfile' : undefined;
    if (!selector || !datasetKey) continue;
    const expectedValue = entity === 'resource' ? resourceDomToken(id) : id;
    const row = Array.from(root.querySelectorAll<HTMLElement>(selector))
      .find((candidate) => candidate.dataset[datasetKey] === expectedValue);
    if (row) markAdminActionsStale('button', row);
  }
}

function showViewTransition(message: string) {
  const shell = root?.querySelector<HTMLElement>('[data-view-transition-shell]');
  if (shell) shell.hidden = false;
  const status = root?.querySelector<HTMLElement>('[data-view-transition]');
  announce(status, message, 'success');
}

async function finishAdminCompletion(
  completion: AdminCompletion,
  target: Element | null | undefined,
  successMessage: string,
  submittedValues: FormValueSnapshot | undefined,
  options: {
    structural?: boolean;
    entity?: 'classification' | 'resource-action' | 'profile-action';
    id?: string;
  } = {},
) {
  const receiptGap = completion.receiptProblem || completion.gaps.length > 0;
  if (!receiptGap) updateOwnedContent(completion.payload, options.entity, options.id);
  formState?.commit(submittedValues);
  const hasPendingChanges = syncBeforeUnload();
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

async function finishAdminWrite(
  response: Response,
  target: Element | null | undefined,
  successMessage: string,
  submittedValues: FormValueSnapshot | undefined,
  context: AdminCommandContext,
  options: {
    structural?: boolean;
    entity?: 'classification' | 'resource-action' | 'profile-action';
    id?: string;
  } = {},
) {
  const completion = await completeAdminWrite(response, context);
  await finishAdminCompletion(completion, target, successMessage, submittedValues, options);
}

function busy(form: HTMLFormElement, value: boolean) {
  form.setAttribute('aria-busy', String(value));
}

if (root && state && csrfToken) {
  const refreshViewButton = root.querySelector<HTMLButtonElement>('[data-refresh-view]');
  refreshViewButton?.addEventListener('click', () => window.location.reload());
  root.querySelectorAll<HTMLFormElement>('[data-classification-form]').forEach((form) => {
    onWrite(form, 'submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const item = form.closest<HTMLElement>('[data-admin-resource]');
      const domToken = item?.dataset.adminResource;
      const resource = state?.resources.find((candidate) => typeof candidate.id === 'string'
        && resourceDomToken(candidate.id) === domToken);
      const resourceId = typeof resource?.id === 'string' ? resource.id : undefined;
      if (resourceId === undefined || !resource) return;
      const version = observedVersion(resource);
      const values = new FormData(form);
      const topicValues = String(values.get('topics') ?? '').split(',').map((topic) => topic.trim()).filter(Boolean);
      const kind = String(values.get('kind') ?? '');
      const format = String(values.get('format') ?? '');
      try {
        validateTaxonomy({ kind, format, topics: topicValues });
      } catch {
        announce(itemStatus(item), 'Revisa el tipo, formato y los temas seleccionados.', 'error');
        return;
      }
      const body = {
        category: String(values.get('category') ?? ''),
        kind,
        format,
        topics: topicValues,
        ...(version !== undefined ? { version } : {}),
      };
      const context: AdminCommandContext = {
        kind: 'classification',
        targets: [{ entity: 'resource', id: resourceId, ...(version !== undefined ? { version } : {}) }],
      };
      const submittedValues = formState?.capture(form);
      busy(form, true);
      try {
        const response = await api(adminResourceCommandUrl(resourceId), 'PATCH', body);
        if (!response.ok) {
          announce(itemStatus(item), await responseErrorMessage(response), 'error');
          return;
        }
        await finishAdminWrite(response, itemStatus(item), 'Clasificación guardada.', submittedValues, context, { entity: 'classification', id: resourceId });
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
      const domToken = item?.dataset.adminResource;
      const resource = state?.resources.find((candidate) => typeof candidate.id === 'string'
        && resourceDomToken(candidate.id) === domToken);
      const resourceId = typeof resource?.id === 'string' ? resource.id : undefined;
      const action = button.dataset.resourceAction;
      if (resourceId === undefined || !resource || !['aprobar', 'revocar', 'ocultar', 'restaurar'].includes(action ?? '')) return;
      button.disabled = true;
      try {
        const version = observedVersion(resource);
        const context: AdminCommandContext = {
          kind: 'resource-action',
          targets: [{ entity: 'resource', id: resourceId, ...(version !== undefined ? { version } : {}) }],
        };
        const response = await api(adminResourceCommandUrl(resourceId, action), 'POST', {
          ...(version === undefined ? {} : { version }),
        });
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
              : 'Recurso restaurado.', undefined, context, { structural: true, entity: 'resource-action', id: resourceId });
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
      const profile = state?.profiles.find((candidate) => candidate.id === profileId);
      if (!profile) return;
      button.disabled = true;
      try {
        const version = observedVersion(profile);
        const context: AdminCommandContext = {
          kind: 'profile-action',
          targets: [{ entity: 'profile', id: profileId, ...(version !== undefined ? { version } : {}) }],
        };
        const response = await api(`/api/admin/perfiles/${encodeURIComponent(profileId)}/${action}/`, 'POST', {
          ...(version === undefined ? {} : { version }),
        });
        if (!response.ok) {
          announce(itemStatus(item), await responseErrorMessage(response), 'error');
          return;
        }
        if (item) markAdminActionsStale('[data-profile-action]', item);
        await finishAdminWrite(response, itemStatus(item), action === 'ocultar' ? 'Perfil oculto.' : 'Perfil restaurado.', undefined, context, { structural: true, entity: 'profile-action', id: profileId });
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
      const idByDomToken = new Map(claimResourceIds.map((id) => [resourceDomToken(id), id]));
      const values = new FormData(form);
      const submittedValues = formState?.capture(form);
      const selectedIds: string[] = [];
      for (const selectedValue of values.getAll('resourceIds')) {
        const id = idByDomToken.get(String(selectedValue));
        if (id === undefined) {
          announce(itemStatus(item), 'Selecciona uno o más IDs incluidos en la solicitud.', 'error');
          return;
        }
        selectedIds.push(id);
      }
      if (selectedIds.length === 0) {
        announce(itemStatus(item), 'Selecciona uno o más IDs incluidos en la solicitud.', 'error');
        return;
      }
      const selectionControls = [...form.querySelectorAll<HTMLInputElement>('input[name="resourceIds"]')];
      const selectionDisabled = selectionControls.map((control) => control.disabled);
      const profileId = typeof claim.profileId === 'string' && claim.profileId.length > 0 ? claim.profileId : undefined;
      const context: AdminCommandContext = {
        kind: 'claim',
        targets: [
          ...selectedIds.map((id): AdminTarget => {
            const resource = state?.resources.find((candidate) => candidate.id === id);
            const version = observedVersion(resource);
            return { entity: 'resource', id, ...(version !== undefined ? { version } : {}) };
          }),
          ...(profileId ? (() => {
            const profile = state?.profiles.find((candidate) => candidate.id === profileId);
            const version = observedVersion(profile);
            return [{ entity: 'profile' as const, id: profileId, ...(version !== undefined ? { version } : {}) }];
          })() : []),
        ],
      };
      selectionControls.forEach((control) => { control.disabled = true; });
      busy(form, true);
      try {
        const response = await api('/api/admin/reclamaciones/vincular/', 'POST', {
          accountId: claim.accountId,
          ...(typeof claim.sourceId === 'string' && claim.sourceId ? { sourceId: claim.sourceId } : {}),
          resourceIds: selectedIds,
        });
        const completion = await completeAdminWrite(response, context);
        if (response.ok || completion.claimReviewRequired) {
          markAdminActionsStale('[data-claim-resolution] button, [data-claim-resolution] input[name="resourceIds"]', item ?? form);
        }
        if (!response.ok) {
          const linkedIds = completion.linkedIds;
          if (completion.claimReviewRequired) {
            formState?.commit(formState.capture(form));
            syncBeforeUnload();
            const remainingIds = selectedIds.slice(linkedIds.length);
            showViewTransition(linkedIds.length === 0
              ? 'No pudimos confirmar el resultado de la vinculación. Actualiza la vista para revisar esta solicitud.'
              : remainingIds.length === 0
                ? 'Los recursos seleccionados están vinculados. Actualiza la vista para comprobar el estado de la solicitud.'
                : 'La vinculación se completó parcialmente. Actualiza la vista antes de resolver otra vez esta solicitud.');
            let partialMessage = linkedIds.length === 0
              ? 'No pudimos confirmar qué recursos se vincularon. Conservamos tus checks y bloqueamos esta solicitud hasta que actualices la vista.'
              : remainingIds.length > 0
                ? `Vinculación parcial. Ya vinculados: ${linkedIds.join(', ')}. Pendientes: ${remainingIds.join(', ')}. Los checks de los pendientes se conservaron; recarga para actualizar el estado y reintenta sólo esos IDs.`
                : `Los recursos ya vinculados son: ${linkedIds.join(', ')}. Recarga para actualizar el estado de la solicitud.`;
            if (completion.receiptProblem || completion.gaps.length > 0) {
              partialMessage += ' El recibo no coincide con las versiones observadas; actualiza la vista antes de resolver otra vez esta solicitud.';
            }
            if (response.status === 422 && completion.payload?.error === 'CREATOR_CONTENT_TOO_LARGE') {
              partialMessage += ` ${await responseErrorMessage(response, completion.payload)}`;
            }
            announce(itemStatus(item), partialMessage, 'error');
            return;
          }
          announce(itemStatus(item), await responseErrorMessage(response, completion.payload), 'error');
          return;
        }
        await finishAdminCompletion(completion, itemStatus(item), 'Recursos vinculados a la cuenta.', submittedValues, {
          structural: true,
        });
      } catch (error) {
        announce(itemStatus(item), requestFailureMessage(error, 'No pudimos conectar con el servicio. Inténtalo de nuevo.'), 'error');
      } finally {
        selectionControls.forEach((control, index) => {
          if (!control.hasAttribute('data-creator-stale')) control.disabled = selectionDisabled[index] ?? false;
        });
        busy(form, false);
      }
    });
  });
} else if (root) {
  const status = root.querySelector<HTMLElement>('[data-admin-status]');
  announce(status, 'No pudimos leer los datos de administración. Recarga para volver a intentarlo.', 'error');
}

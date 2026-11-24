import { updateFieldDescription } from '../lib/field-description.mjs';
import { createCreatorFormState, type FormValueSnapshot } from './creator-form-state';
import { createCreatorSessionRecovery } from './creator-session-recovery';
import { createCreatorWriteGuard, readCreatorVersionChanges, type CreatorVersionChange } from './creator-write-state';
import { validateResourceClassification } from '../lib/resource-form-policy.mjs';
import { bindResourceClassification } from '../lib/resource-classification-dom.mjs';

interface CreatorAdminState {
  resources: Record<string, unknown>[];
  profiles: Record<string, unknown>[];
  claims: Record<string, unknown>[];
}

type AdminEntity = 'resource' | 'profile';
type AdminCommandKind = 'classification' | 'resource-action' | 'profile-action' | 'claim';
type AdminOutcome = 'confirmed' | 'validation' | 'conflict' | 'uncertain';

interface AdminTarget {
  entity: AdminEntity;
  id: string;
  version?: number;
}

interface AdminCommandContext {
  kind: AdminCommandKind;
  targets: readonly AdminTarget[];
  accountId?: string;
}

interface AdminCompletion {
  outcome: AdminOutcome;
  payload: Record<string, unknown> | null;
  linkedIds: string[];
  claimReviewRequired: boolean;
  uncertainResourceId?: string;
  receiptProblem: boolean;
  gaps: CreatorVersionChange[];
}

const root = document.querySelector<HTMLElement>('[data-creator-admin]');
const initial = document.querySelector<HTMLScriptElement>('#creator-admin-data');
const MAX_REQUEST_BYTES = 32 * 1024;
const REQUEST_TOO_LARGE = 'creator-request-too-large';
const CLAIM_RESOLUTION_CONTROLS = '[data-claim-resolution] button, [data-claim-resolution] input[type="checkbox"]';
type AdminField = 'category' | 'kind' | 'format' | 'kind-format' | 'topics' | 'reviewed' | 'resourceIds';

type AdminControl = HTMLInputElement | HTMLSelectElement;

interface AdminFormAttempt {
  form: HTMLFormElement;
  submittedValues: FormValueSnapshot | undefined;
  focusAtSubmit: Element | null;
}

const pendingNativeFocus = new WeakSet<HTMLFormElement>();

const ADMIN_FIELD_MESSAGES: Record<AdminField, Record<string, string>> = {
  category: { required: 'Completa la categoría.' },
  kind: { required: 'Selecciona un tipo.' },
  format: { required: 'Selecciona un formato.' },
  'kind-format': { invalid_combination: 'Elige una combinación válida de tipo y formato.' },
  topics: { invalid_option: 'Elige hasta 3 temas válidos y distintos.' },
  reviewed: { required: 'Confirma que revisaste la referencia y los recursos seleccionados.' },
  resourceIds: {
    invalid_selection: 'Selecciona los recursos exactos que verificaste.',
    invalid_selection_unavailable: 'Ese recurso ya no está disponible. Elige otro ID exacto.',
    invalid_selection_claimed: 'Ese recurso ya está vinculado a otra página. Elige otro ID exacto.',
  },
};

function formFieldError(form: HTMLFormElement, field: AdminField) {
  return form.querySelector<HTMLElement>(`[data-admin-field-error="${field}"]`);
}

function fieldGroup(form: HTMLFormElement, field: AdminField) {
  return form.querySelector<HTMLElement>(`[data-admin-field-group="${field}"]`);
}

function fieldControls(form: HTMLFormElement, field: AdminField): AdminControl[] {
  const group = fieldGroup(form, field);
  return group
    ? [...group.querySelectorAll<AdminControl>('input, select')]
    : [...form.querySelectorAll<AdminControl>(`[name="${field}"]`)];
}

function fieldTargets(form: HTMLFormElement, field: AdminField): HTMLElement[] {
  const group = fieldGroup(form, field);
  const controls = fieldControls(form, field);
  return group ? [group, ...controls] : controls;
}

function unchangedSinceSubmit(attempt: AdminFormAttempt, field: AdminField): boolean {
  const controls = fieldControls(attempt.form, field);
  const current = formState?.capture(attempt.form);
  return controls.length > 0 && controls.every((control) => attempt.submittedValues?.has(control)
    && attempt.submittedValues.get(control) === current?.get(control));
}

function messageForField(field: AdminField, reason: string): string | undefined {
  const messages = ADMIN_FIELD_MESSAGES[field];
  if (!messages || !Object.hasOwn(messages, reason)) return undefined;
  const message = messages[reason];
  return typeof message === 'string' ? message : undefined;
}

function showFieldError(form: HTMLFormElement, field: AdminField, reason: string): HTMLElement | undefined {
  const error = formFieldError(form, field);
  const message = messageForField(field, reason);
  if (!error || !message || !error.id) return undefined;
  error.textContent = message;
  error.hidden = false;
  fieldTargets(form, field).forEach((target) => {
    target.setAttribute('aria-invalid', 'true');
    updateFieldDescription(target, error.id, true);
  });
  return error;
}

function clearFieldError(form: HTMLFormElement, field: AdminField) {
  const error = formFieldError(form, field);
  if (!error || error.hidden) return;
  error.hidden = true;
  error.textContent = '';
  const remainingIds = new Set([...form.querySelectorAll<HTMLElement>('[data-admin-field-error]:not([hidden])')]
    .map((element) => element.id));
  fieldTargets(form, field).forEach((target) => {
    const ids = updateFieldDescription(target, error.id, false);
    if (!ids.some((id) => remainingIds.has(id))) target.removeAttribute('aria-invalid');
  });
}

function clearAllFieldErrors(form: HTMLFormElement) {
  for (const error of form.querySelectorAll<HTMLElement>('[data-admin-field-error]:not([hidden])')) {
    clearFieldError(form, error.dataset.adminFieldError as AdminField);
  }
}

function shouldRestoreFocus(focusAtSubmit: Element | null): boolean {
  const active = document.activeElement;
  return !active || active === document.body || active === document.documentElement || active === focusAtSubmit;
}

function focusVisible(target: HTMLElement) {
  target.focus({ preventScroll: true });
  target.scrollIntoView?.({ block: 'nearest' });
}

function focusFieldError(form: HTMLFormElement, field: AdminField, attempt?: AdminFormAttempt) {
  if (attempt && !shouldRestoreFocus(attempt.focusAtSubmit)) return;
  const active = document.activeElement;
  if ((active instanceof HTMLInputElement || active instanceof HTMLSelectElement)
    && attempt?.submittedValues?.has(active)
    && attempt.submittedValues.get(active) !== formState?.capture(active).get(active)) return;
  const target = fieldControls(form, field).find((control) => !control.matches(':disabled'));
  if (!target) return;
  target.focus({ preventScroll: true });
  const error = formFieldError(form, field);
  const controlRegion = target.closest<HTMLElement>('label') ?? target.parentElement ?? target;
  const groupedRegion = fieldGroup(form, field);
  const errorRegion = error?.parentElement;
  const candidate = groupedRegion ?? errorRegion;
  const candidateHeight = candidate?.getBoundingClientRect().height;
  const scrollTarget = candidateHeight !== undefined && candidateHeight <= window.innerHeight
    ? candidate
    : field === 'resourceIds' && error ? error : controlRegion;
  scrollTarget?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
}

function nativeField(field: HTMLElement): AdminField | undefined {
  const name = field.getAttribute('name');
  if (name === 'category' || name === 'kind' || name === 'format' || name === 'topics'
    || name === 'reviewed' || name === 'resourceIds') return name;
  return undefined;
}

function handleNativeInvalid(event: Event, form: HTMLFormElement, control: AdminControl) {
  const field = nativeField(control);
  if (!field || !control.validity.valueMissing || !showFieldError(form, field, 'required')) return;
  event.preventDefault();
  if (pendingNativeFocus.has(form)) return;
  pendingNativeFocus.add(form);
  const focusAtInvalid = document.activeElement;
  setTimeout(() => {
    pendingNativeFocus.delete(form);
    if (control.isConnected && !control.matches(':disabled') && !control.validity.valid
      && shouldRestoreFocus(focusAtInvalid)) focusFieldError(form, field);
  }, 0);
}

function handleFieldChange(form: HTMLFormElement, control: AdminControl) {
  const field = nativeField(control);
  if (!field) return;
  if (field === 'kind' || field === 'format') clearFieldError(form, 'kind-format');
  if (field === 'topics' && control instanceof HTMLInputElement && control.dataset.resourceTopicRejected === 'true') return;
  if (field === 'topics' || field === 'resourceIds'
    || (control.validity.valid && (field !== 'category' || control.value.trim()))) clearFieldError(form, field);
}

function diagnosticsFor(
  payload: Record<string, unknown> | null,
  response: Response,
  context: AdminCommandContext,
): Array<{ field: AdminField; reason: string }> {
  if (!payload || !Array.isArray(payload.fieldErrors) || payload.fieldErrors.length === 0 || payload.fieldErrors.length > 8) return [];
  if (context.kind === 'classification' && (response.status !== 422 || payload.error !== 'INVALID_CLASSIFICATION')) return [];
  if (context.kind === 'claim' && (payload.failureStage !== 'before-grant-write'
    || !((response.status === 404 && payload.error === 'RESOURCE_NOT_FOUND')
      || (response.status === 409 && payload.error === 'RESOURCE_ALREADY_CLAIMED'))
    || Object.hasOwn(payload, 'linkedResourceIds') || Object.hasOwn(payload, 'versionChanges')
    || Object.hasOwn(payload, 'uncertainResourceId') || Object.hasOwn(payload, 'failedResourceId'))) return [];
  const allowed = new Set<AdminField>(context.kind === 'classification'
    ? ['category', 'topics', 'kind-format']
    : context.kind === 'claim' ? ['resourceIds'] : []);
  const details: Array<{ field: AdminField; reason: string }> = [];
  for (const entry of payload.fieldErrors) {
    if (!isRecord(entry) || typeof entry.field !== 'string' || typeof entry.reason !== 'string'
      || !allowed.has(entry.field as AdminField) || !messageForField(entry.field as AdminField, entry.reason)) return [];
    const reason = context.kind === 'claim' && entry.field === 'resourceIds'
      ? payload.error === 'RESOURCE_NOT_FOUND' ? 'invalid_selection_unavailable'
        : payload.error === 'RESOURCE_ALREADY_CLAIMED' ? 'invalid_selection_claimed' : entry.reason
      : entry.reason;
    details.push({ field: entry.field as AdminField, reason });
  }
  return details;
}

function applyFieldDiagnostics(
  completion: AdminCompletion,
  response: Response,
  context: AdminCommandContext,
  attempt: AdminFormAttempt,
): AdminField | undefined {
  if (completion.outcome !== 'validation' || completion.claimReviewRequired) return undefined;
  let first: AdminField | undefined;
  for (const { field, reason } of diagnosticsFor(completion.payload, response, context)) {
    if (unchangedSinceSubmit(attempt, field) && showFieldError(attempt.form, field, reason)) first ??= field;
  }
  return first;
}

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

function announce(
  target: Element | null | undefined,
  message: string,
  kind: 'error' | 'success' = 'success',
  live = true,
) {
  if (!(target instanceof HTMLElement)) return;
  target.setAttribute('aria-live', live ? 'polite' : 'off');
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

function managedAdminForm(element: Element | null): element is HTMLFormElement {
  return element instanceof HTMLFormElement
    && (element.matches('[data-classification-form]') || element.matches('[data-claim-resolution]'));
}

if (root) {
  root.addEventListener('input', onFormStateChange);
  root.addEventListener('change', onFormStateChange);
  root.addEventListener('account:logout', onAdminLogout);
  root.addEventListener('invalid', (event) => {
    const control = event.target;
    const form = control instanceof HTMLElement ? control.closest('form') : null;
    if (managedAdminForm(form) && (control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
      handleNativeInvalid(event, form, control);
    }
  }, true);
  const clearChangedField = (event: Event) => {
    const control = event.target;
    const form = control instanceof HTMLElement ? control.closest('form') : null;
    if (managedAdminForm(form) && (control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) {
      handleFieldChange(form, control);
    }
  };
  root.addEventListener('input', clearChangedField);
  root.addEventListener('change', clearChangedField);
  syncBeforeUnload();
  root.querySelector<HTMLElement>('[data-admin-logout-shell]')?.removeAttribute('inert');
}

function observedVersion(record: Record<string, unknown> | undefined): number | undefined {
  const version = record?.version;
  return typeof version === 'number' && Number.isSafeInteger(version) && version >= 0 ? version : undefined;
}

function requiresSessionRecovery(status?: number): boolean {
  return (status === 401 || status === 403) && sessionRecovery?.blocksWrites() === true;
}

function errorMessage(status: number): string {
  if (requiresSessionRecovery(status)) return 'El cambio quedó sin guardar. Usa los controles de sesión para continuar.';
  if (status === 401) return 'Tu sesión terminó. Inicia sesión y vuelve a intentarlo.';
  if (status === 403) return 'Esta cuenta no tiene permiso para completar esta acción.';
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
): { ids: string[]; valid: boolean; uncertainResourceId?: string } {
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
  const uncertainId = typeof payload.uncertainResourceId === 'string' ? payload.uncertainResourceId : undefined;
  const hasFailureStage = Object.hasOwn(payload, 'failureStage');
  const hasFailedId = Object.hasOwn(payload, 'failedResourceId');
  const hasUncertainId = Object.hasOwn(payload, 'uncertainResourceId');
  const claimsUncertainty = payload.error === 'CLAIM_GRANT_UNCERTAIN';
  const definiteStop = failedAt >= 0 && !hasFailureStage && !claimsUncertainty && !hasUncertainId;
  const uncertainStage = claimsUncertainty && response.status === 503 && !hasFailureStage && !hasFailedId
    && !complete && uncertainId === requested[ids.length];
  const stageMatches = claimsUncertainty || hasUncertainId ? uncertainStage
    : complete ? !hasFailedId && (response.ok
      ? !hasFailureStage : payload.failureStage === 'claim-status' && !quotaFailure)
      : !response.ok && !hasFailureStage && failedAt > 0 && ids.length === failedAt;
  const valid = ids.length === payload.linkedResourceIds.length && stageMatches;
  if (response.ok || valid) return { ids, valid, ...(valid && uncertainStage ? { uncertainResourceId: uncertainId } : {}) };

  if (definiteStop) {
    // Preserve the prefix before a malformed stop, but not when the delivered
    // linked IDs have a gap before that stop.
    return { ids: ids.length < failedAt ? [] : ids.slice(0, failedAt), valid: false };
  }
  const uncertainAt = uncertainId === undefined ? -1 : requested.indexOf(uncertainId);
  const earlierIds = ids.slice(0, uncertainAt >= 0 ? uncertainAt : requested.length - 1);
  if (!changes || !receiptScopeIsValid(changes, context) || !receiptChainIsValid(changes, context, earlierIds)) {
    return { ids: [], valid: false };
  }
  const changedResources = new Set(changes.filter(({ entity }) => entity === 'resource').map(({ id }) => id));
  const unsupported = earlierIds.findIndex((id) => !changedResources.has(id));
  return { ids: unsupported < 0 ? earlierIds : earlierIds.slice(0, unsupported), valid: false };
}

async function completeAdminWrite(response: Response, context: AdminCommandContext): Promise<AdminCompletion> {
  const payload = await responsePayload(response);
  const beforeGrantWrite = context.kind === 'claim'
    && payload?.failureStage === 'before-grant-write' && typeof payload.error === 'string'
    && payload.error !== 'PARTIAL_CLAIM_WRITE' && payload.error !== 'CLAIM_GRANT_UNCERTAIN'
    && !['linkedResourceIds', 'versionChanges', 'profileChanged', 'failedResourceId', 'uncertainResourceId']
      .some((field) => Object.hasOwn(payload, field));
  const claimReviewRequired = context.kind === 'claim' && !response.ok && !beforeGrantWrite
    && (Array.isArray(payload?.linkedResourceIds)
      || response.status >= 500 || response.status === 409 || response.status === 422
      || payload?.error === 'PARTIAL_CLAIM_WRITE'
      || payload?.error === 'CLAIM_GRANT_UNCERTAIN'
      || typeof payload?.profileChanged === 'boolean'
      || typeof payload?.failedResourceId === 'string'
      || Boolean(payload && (Object.hasOwn(payload, 'failureStage') || Object.hasOwn(payload, 'uncertainResourceId')))
      || (Array.isArray(payload?.versionChanges) && payload.versionChanges.length > 0));
  if (!response.ok && !claimReviewRequired) {
    const definitelyNoWrite = [400, 401, 403, 404, 405, 413, 415, 422].includes(response.status);
    const outcome: AdminOutcome = beforeGrantWrite || definitelyNoWrite
      ? 'validation'
      : response.status === 409
        ? 'conflict'
        : 'uncertain';
    if (outcome === 'conflict' || outcome === 'uncertain') {
      pauseAdminRows(context.targets);
      pauseRelatedClaims(context);
    }
    return { outcome, payload, linkedIds: [], claimReviewRequired: false, receiptProblem: false, gaps: [] };
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
    pauseRelatedClaims(context);
    return {
      outcome: 'uncertain',
      payload,
      linkedIds,
      claimReviewRequired,
      receiptProblem: true,
      gaps: [],
    };
  }

  const gaps = applyVersionChanges(changes);
  const uncertainResourceId = linkedReceipt.uncertainResourceId;
  const uncertainTargets = uncertainResourceId === undefined ? [] : context.targets.filter(({ entity, id }) =>
    entity === 'profile' || (entity === 'resource' && id === uncertainResourceId));
  pauseAdminRows([...gaps, ...uncertainTargets]);
  const statusScopeConfirmed = response.ok || payload?.failureStage === 'claim-status';
  const relatedRecords = context.kind === 'claim' && claimReviewRequired
    ? statusScopeConfirmed ? [] : context.targets.filter(({ entity }) => entity === 'resource')
    : [...gaps, ...uncertainTargets];
  pauseRelatedClaims(context, relatedRecords,
    context.kind === 'claim' && statusScopeConfirmed ? { statusScope: true } : undefined);
  return {
    outcome: response.ok && gaps.length === 0 ? 'confirmed' : 'uncertain',
    payload,
    linkedIds,
    claimReviewRequired,
    uncertainResourceId,
    receiptProblem: false,
    gaps,
  };
}

function unknownAdminWrite(context: AdminCommandContext): AdminCompletion {
  pauseAdminRows(context.targets);
  pauseRelatedClaims(context);
  return {
    outcome: 'uncertain',
    payload: null,
    linkedIds: [],
    claimReviewRequired: context.kind === 'claim',
    receiptProblem: false,
    gaps: [],
  };
}

function pauseAdminRows(
  records: readonly Pick<CreatorVersionChange, 'entity' | 'id'>[],
  controlSelector = 'button',
) {
  if (!root) return;
  const rows = new Set<HTMLElement>();
  uniqueRecords(records).forEach(({ entity, id }) => {
    const selector = entity === 'resource' ? '[data-admin-resource]' : '[data-admin-profile]';
    const datasetKey = entity === 'resource' ? 'adminResource' : 'adminProfile';
    const expectedValue = entity === 'resource' ? resourceDomToken(id) : id;
    const row = [...root.querySelectorAll<HTMLElement>(selector)]
      .find((candidate) => candidate.dataset[datasetKey] === expectedValue);
    if (row) rows.add(row);
  });
  const controls = [...rows].flatMap((row) => [...row.querySelectorAll<HTMLElement>(controlSelector)]);
  controls.forEach((control) => control.setAttribute('data-creator-stale', 'true'));
}

async function responsePayload(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.clone().json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function uniqueRecords(records: readonly Pick<CreatorVersionChange, 'entity' | 'id'>[]) {
  const unique = new Map<string, Pick<CreatorVersionChange, 'entity' | 'id'>>();
  records.forEach((record) => unique.set(targetKey(record.entity, record.id), record));
  return [...unique.values()];
}

function pauseRelatedClaims(
  context: AdminCommandContext,
  records: readonly Pick<CreatorVersionChange, 'entity' | 'id'>[] = context.targets,
  { statusScope = false }: { statusScope?: boolean } = {},
) {
  if (!root || !state) return;
  const statusResourceIds = new Set(context.kind === 'claim'
    ? context.targets.filter(({ entity }) => entity === 'resource').map(({ id }) => id) : []);
  const affected = uniqueRecords(records);
  const dependencyResourceIds = new Set(affected.filter(({ entity }) => entity === 'resource').map(({ id }) => id));
  const profileIds = new Set(affected.filter(({ entity }) => entity === 'profile').map(({ id }) => id));
  if ((!statusScope || statusResourceIds.size === 0)
    && dependencyResourceIds.size === 0 && profileIds.size === 0) return;
  const claims = state.claims.filter((claim) => {
    const statusMatch = statusScope && typeof context.accountId === 'string' && claim.accountId === context.accountId
        && Array.isArray(claim.resourceIds)
        && claim.resourceIds.some((id) => statusResourceIds.has(id));
    const dependencyMatch = (typeof claim.profileId === 'string' && profileIds.has(claim.profileId))
      || (Array.isArray(claim.resourceIds) && claim.resourceIds.some((id) => dependencyResourceIds.has(id)));
    return statusMatch || dependencyMatch;
  });
  const claimIds = new Set(claims.map((claim) => claim.id).filter((id): id is string => typeof id === 'string'));
  const rows = [...root.querySelectorAll<HTMLElement>('[data-admin-claim]')].filter((row) => {
    const claimId = row.dataset.adminClaim;
    return Boolean(claimId && claimIds.has(claimId));
  });
  rows.forEach((row) => {
    row.querySelectorAll<HTMLElement>(CLAIM_RESOLUTION_CONTROLS).forEach((control) => {
      control.setAttribute('data-creator-stale', 'true');
    });
    const form = row.querySelector<HTMLFormElement>('[data-claim-resolution]');
    // Frozen selections remain visible but can't be saved or reverted here.
    if (form) formState?.allowPausedSnapshot(formState.capture(form));
  });
}

function showViewTransition(message?: string) {
  const shell = root?.querySelector<HTMLElement>('[data-view-transition-shell]');
  if (shell) shell.hidden = false;
  const status = root?.querySelector<HTMLElement>('[data-view-transition]');
  if (message) announce(status, message, 'success');
  else if (status) {
    status.hidden = true;
    status.textContent = '';
    delete status.dataset.kind;
  }
}

function clearContextualStatus(target: Element | null | undefined) {
  if (!(target instanceof HTMLElement)) return;
  target.textContent = '';
  target.hidden = true;
}

function focusContextualStatus(target: Element | null | undefined, focusAtSubmit: Element | null | undefined) {
  if (!(target instanceof HTMLElement) || !shouldRestoreFocus(focusAtSubmit ?? null)) return;
  const active = document.activeElement;
  if (!target.hidden && !(active instanceof HTMLInputElement || active instanceof HTMLSelectElement)) focusVisible(target);
}

async function finishAdminCompletion(
  completion: AdminCompletion,
  target: Element | null | undefined,
  successMessage: string,
  submittedValues: FormValueSnapshot | undefined,
  context: AdminCommandContext,
  response?: Response,
  requestError?: unknown,
  options: {
    structural?: boolean;
    attempt?: AdminFormAttempt;
    focusAtSubmit?: Element | null;
  } = {},
) {
  const receiptGap = completion.gaps.length > 0;
  const unverifiableReceipt = completion.receiptProblem;
  const uncertainReceipt = unverifiableReceipt || receiptGap || completion.outcome === 'uncertain';
  if (response && options.attempt) {
    const appliedField = applyFieldDiagnostics(completion, response, context, options.attempt);
    if (appliedField !== undefined) {
      clearContextualStatus(target);
      focusFieldError(options.attempt.form, appliedField, options.attempt);
      return;
    }
  }
  if (completion.outcome !== 'confirmed' || receiptGap) {
    const message = uncertainReceipt
      ? context.kind === 'claim'
        ? !completion.receiptProblem && receiptGap
          ? 'La vinculación se completó, pero el recibo no coincide con las versiones observadas. Actualiza la vista para revisar esta solicitud.'
          : 'No pudimos confirmar el resultado de la vinculación. Actualiza la vista para revisar esta solicitud.'
        : 'No pudimos confirmar el resultado del cambio. Actualiza la vista para revisar el estado.'
      : response
        ? await responseErrorMessage(response, completion.payload)
        : requestFailureMessage(requestError, 'No pudimos completar la acción. Revisa los datos e inténtalo de nuevo.');
    if (completion.outcome === 'validation') {
      announce(target, message, 'error', !requiresSessionRecovery(response?.status));
      focusContextualStatus(target, options.focusAtSubmit);
      return;
    }
    if (context.kind === 'claim') formState?.allowPausedSnapshot(submittedValues);
    syncBeforeUnload();
    showViewTransition();
    announce(target, message, 'error');
    focusContextualStatus(target, options.focusAtSubmit);
    return;
  }

  if (options.structural) {
    const actionSelector = context.kind === 'resource-action' ? '[data-resource-action]'
      : context.kind === 'profile-action' ? '[data-profile-action]' : undefined;
    if (actionSelector) pauseAdminRows(context.targets, actionSelector);
  }
  formState?.commit(submittedValues);
  const hasPendingChanges = syncBeforeUnload();
  if (hasPendingChanges) {
    let message = `${successMessage} Conservamos los cambios que aún no enviaste; puedes seguir editándolos y guardarlos.`;
    if (options.structural) {
      showViewTransition(`${successMessage} Guarda o revierte los cambios pendientes; la página se actualizará cuando termines. Tus campos se conservan.`);
    }
    announce(target, message);
    return;
  }
  announce(target, successMessage);
  window.location.reload();
}

async function finishAdminWrite(
  response: Response | null,
  target: Element | null | undefined,
  successMessage: string,
  submittedValues: FormValueSnapshot | undefined,
  context: AdminCommandContext,
  requestError?: unknown,
  options: {
    structural?: boolean;
    attempt?: AdminFormAttempt;
    focusAtSubmit?: Element | null;
  } = {},
) {
  const completion = response ? await completeAdminWrite(response, context) : unknownAdminWrite(context);
  await finishAdminCompletion(completion, target, successMessage, submittedValues, context, response ?? undefined, requestError, options);
}

function busy(form: HTMLFormElement, value: boolean) {
  form.setAttribute('aria-busy', String(value));
}

if (root && state && csrfToken) {
  const refreshViewButton = root.querySelector<HTMLButtonElement>('[data-refresh-view]');
  refreshViewButton?.addEventListener('click', () => window.location.reload());
  root.querySelectorAll<HTMLFormElement>('[data-classification-form]').forEach((form) => {
    bindResourceClassification(form, {
      onKindChange: () => clearFieldError(form, 'kind-format'),
      onFormatChange: () => clearFieldError(form, 'kind-format'),
      onTopicChange: () => clearFieldError(form, 'topics'),
      onTopicRejected: () => {
        if (showFieldError(form, 'topics', 'invalid_option')) focusFieldError(form, 'topics');
      },
    });
    onWrite(form, 'submit', async (event) => {
      event.preventDefault();
      clearAllFieldErrors(form);
      const item = form.closest<HTMLElement>('[data-admin-resource]');
      const domToken = item?.dataset.adminResource;
      const resource = state?.resources.find((candidate) => typeof candidate.id === 'string'
        && resourceDomToken(candidate.id) === domToken);
      const resourceId = typeof resource?.id === 'string' ? resource.id : undefined;
      if (resourceId === undefined || !resource) return;
      const version = observedVersion(resource);
      const values = new FormData(form);
      const topicValues = values.getAll('topics').map(String);
      const kind = String(values.get('kind') ?? '');
      const format = String(values.get('format') ?? '');
      try {
        const validation = validateResourceClassification({ kind, format, topics: topicValues });
        if (!validation.valid) {
          const field = validation.field as AdminField;
          if (showFieldError(form, field, validation.reason)) {
            clearContextualStatus(itemStatus(item));
            focusFieldError(form, field);
          } else announce(itemStatus(item), 'Revisa el tipo, formato y los temas seleccionados.', 'error');
          return;
        }
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
      const attempt = { form, submittedValues, focusAtSubmit: document.activeElement };
      busy(form, true);
      try {
        const response = await api(adminResourceCommandUrl(resourceId), 'PATCH', body);
        await finishAdminWrite(response, itemStatus(item), 'Clasificación guardada.', submittedValues, context, undefined, {
          attempt, focusAtSubmit: attempt.focusAtSubmit,
        });
      } catch (error) {
        if (error instanceof Error && error.message === REQUEST_TOO_LARGE) {
          announce(itemStatus(item), requestFailureMessage(error, ''), 'error');
        } else {
          await finishAdminWrite(null, itemStatus(item), 'Clasificación guardada.', submittedValues, context, error, {
            attempt, focusAtSubmit: attempt.focusAtSubmit,
          });
        }
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
      const version = observedVersion(resource);
      const context: AdminCommandContext = {
        kind: 'resource-action',
        targets: [{ entity: 'resource', id: resourceId, ...(version !== undefined ? { version } : {}) }],
      };
      const focusAtSubmit = document.activeElement;
      button.disabled = true;
      try {
        const response = await api(adminResourceCommandUrl(resourceId, action), 'POST', {
          ...(version === undefined ? {} : { version }),
        });
        await finishAdminWrite(response, itemStatus(item), action === 'aprobar'
          ? 'Recurso aprobado para el directorio.'
          : action === 'revocar'
            ? 'Aprobación revocada. El enlace puede seguir visible en páginas de creadores.'
            : action === 'ocultar'
              ? 'Recurso oculto en las páginas públicas.'
                : 'Recurso restaurado.', undefined, context, undefined, { structural: true, focusAtSubmit });
      } catch (error) {
        if (error instanceof Error && error.message === REQUEST_TOO_LARGE) {
          announce(itemStatus(item), requestFailureMessage(error, ''), 'error');
        } else {
          await finishAdminWrite(null, itemStatus(item), action === 'aprobar'
            ? 'Recurso aprobado para el directorio.'
            : action === 'revocar'
              ? 'Aprobación revocada. El enlace puede seguir visible en páginas de creadores.'
              : action === 'ocultar'
                ? 'Recurso oculto en las páginas públicas.'
                : 'Recurso restaurado.', undefined, context, error, { structural: true, focusAtSubmit });
        }
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
      const version = observedVersion(profile);
      const context: AdminCommandContext = {
        kind: 'profile-action',
        targets: [{ entity: 'profile', id: profileId, ...(version !== undefined ? { version } : {}) }],
      };
      const focusAtSubmit = document.activeElement;
      button.disabled = true;
      try {
        const response = await api(`/api/admin/perfiles/${encodeURIComponent(profileId)}/${action}/`, 'POST', {
          ...(version === undefined ? {} : { version }),
        });
        await finishAdminWrite(response, itemStatus(item), action === 'ocultar' ? 'Perfil oculto.' : 'Perfil restaurado.', undefined, context, undefined, { structural: true, focusAtSubmit });
      } catch (error) {
        if (error instanceof Error && error.message === REQUEST_TOO_LARGE) {
          announce(itemStatus(item), requestFailureMessage(error, ''), 'error');
        } else {
          await finishAdminWrite(null, itemStatus(item), action === 'ocultar' ? 'Perfil oculto.' : 'Perfil restaurado.', undefined, context, error, { structural: true, focusAtSubmit });
        }
      } finally {
        button.disabled = false;
      }
    });
  });

  root.querySelectorAll<HTMLFormElement>('[data-claim-resolution]').forEach((form) => {
    onWrite(form, 'submit', async (event) => {
      event.preventDefault();
      clearAllFieldErrors(form);
      const item = form.closest<HTMLElement>('[data-admin-claim]');
      const claimId = item?.dataset.adminClaim;
      const claim = state?.claims.find((candidate) => candidate.id === claimId);
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
        showFieldError(form, 'resourceIds', 'invalid_selection');
        clearContextualStatus(itemStatus(item));
        focusFieldError(form, 'resourceIds');
        return;
      }
      const attempt = { form, submittedValues, focusAtSubmit: document.activeElement };
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
        accountId: claim.accountId,
      };
      selectionControls.forEach((control) => { control.disabled = true; });
      busy(form, true);
      let responseField: AdminField | undefined;
      let focusStatus = false;
      try {
        const response = await api('/api/admin/reclamaciones/vincular/', 'POST', {
          accountId: claim.accountId,
          ...(typeof claim.sourceId === 'string' && claim.sourceId ? { sourceId: claim.sourceId } : {}),
          resourceIds: selectedIds,
        });
        const completion = await completeAdminWrite(response, context);
        if (!response.ok) {
          responseField = applyFieldDiagnostics(completion, response, context, attempt);
          if (responseField !== undefined) {
            clearContextualStatus(itemStatus(item));
            return;
          }
          const linkedIds = completion.linkedIds;
          if (completion.claimReviewRequired) {
            formState?.allowPausedSnapshot(formState.capture(form));
            syncBeforeUnload();
            if (completion.payload?.error === 'CLAIM_GRANT_UNCERTAIN'
              || (completion.payload && Object.hasOwn(completion.payload, 'uncertainResourceId'))) {
              const confirmed = linkedIds.length > 0 ? `Ya vinculados: ${linkedIds.join(', ')}. ` : '';
              const uncertain = completion.uncertainResourceId
                ? `No pudimos confirmar si se vinculó ${completion.uncertainResourceId}.`
                : 'No pudimos confirmar el resultado de la vinculación.';
              const message = `${confirmed}${uncertain} Actualiza la vista para revisar esta solicitud.`;
              showViewTransition();
              announce(itemStatus(item), message, 'error');
              focusStatus = true;
              return;
            }
            const remainingIds = selectedIds.slice(linkedIds.length);
            let partialMessage: string;
            if (linkedIds.length === 0 || (completion.receiptProblem && remainingIds.length === 0)) {
              partialMessage = linkedIds.length === 0
                ? 'No pudimos confirmar qué recursos se vincularon. Conservamos tus checks y bloqueamos esta solicitud hasta que actualices la vista.'
                : 'No pudimos confirmar el resultado de la vinculación. Actualiza la vista para revisar esta solicitud.';
            } else if (completion.receiptProblem) {
              partialMessage = `Ya vinculados: ${linkedIds.join(', ')}. Sin confirmar: ${remainingIds.join(', ')}. Actualiza la vista para revisar el resultado.`;
            } else if (remainingIds.length > 0) {
              partialMessage = `Vinculación parcial. Ya vinculados: ${linkedIds.join(', ')}. Pendientes: ${remainingIds.join(', ')}. Los checks de los pendientes se conservaron; recarga para actualizar el estado y reintenta sólo esos IDs.`;
            } else {
              partialMessage = `Los recursos ya vinculados son: ${linkedIds.join(', ')}. Recarga para actualizar el estado de la solicitud.`;
            }
            showViewTransition();
            if (completion.receiptProblem || completion.gaps.length > 0) {
              partialMessage += ' El recibo no coincide con las versiones observadas; actualiza la vista antes de resolver otra vez esta solicitud.';
            }
            if (response.status === 422 && completion.payload?.error === 'CREATOR_CONTENT_TOO_LARGE') {
              partialMessage += ` ${await responseErrorMessage(response, completion.payload)}`;
            }
            announce(itemStatus(item), partialMessage, 'error');
            focusStatus = true;
            return;
          }
          announce(itemStatus(item), await responseErrorMessage(response, completion.payload), 'error',
            !requiresSessionRecovery(response.status));
          focusStatus = true;
          return;
        }
        await finishAdminCompletion(completion, itemStatus(item), 'Recursos vinculados a la cuenta.', submittedValues, context, response, undefined, {
          structural: true, attempt, focusAtSubmit: attempt.focusAtSubmit,
        });
      } catch (error) {
        if (error instanceof Error && error.message === REQUEST_TOO_LARGE) {
          announce(itemStatus(item), requestFailureMessage(error, ''), 'error');
        } else {
          unknownAdminWrite(context);
          formState?.allowPausedSnapshot(submittedValues);
          syncBeforeUnload();
          const message = 'No pudimos confirmar el resultado de la vinculación. Actualiza la vista para revisar esta solicitud.';
          showViewTransition();
          announce(itemStatus(item), message, 'error');
          focusStatus = true;
        }
      } finally {
        selectionControls.forEach((control, index) => {
          if (!control.hasAttribute('data-creator-stale')) control.disabled = selectionDisabled[index] ?? false;
        });
        busy(form, false);
        if (responseField !== undefined) focusFieldError(form, responseField, attempt);
        else if (focusStatus) focusContextualStatus(itemStatus(item), attempt.focusAtSubmit);
      }
    });
  });
} else if (root) {
  const status = root.querySelector<HTMLElement>('[data-admin-status]');
  announce(status, 'No pudimos leer los datos de administración. Recarga para volver a intentarlo.', 'error');
}

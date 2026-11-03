import type { CreatorCatalogSelectionDTO, CreatorClaimDTO, CreatorClaimResourceDTO, CreatorEditableResourceDTO, CreatorEditorDTO, CreatorLinkDTO, CreatorProfileDTO, CreatorProgram, CreatorSocial } from '../types/creators';
import {
  isAdoptableOwnerData,
  isCreatorLink,
  isEditableResource,
  isOwnerData,
  isProfile,
  isSafeClaimUrl,
} from '../lib/creator-owner-data';
import { normalizeCreatorText } from '../lib/creator-values.mjs';
import { createCreatorFormState, type FormValueSnapshot } from './creator-form-state';
import { createCreatorSessionRecovery } from './creator-session-recovery';
import {
  createCreatorWriteGuard,
  readCreatorVersionChanges,
  validateCreatorOwnerReceipts,
  type CreatorOwnerReceiptParticipant,
} from './creator-write-state';
import {
  creatorOwnerLinksCountLabel,
  creatorOwnerLinkGroup,
  creatorOwnerLinksHref,
  creatorOwnerLinksQueryFromForm,
  DEFAULT_CREATOR_OWNER_LINKS_QUERY,
  parseCreatorOwnerLinksQuery,
  selectCreatorOwnerLinks,
  type CreatorOwnerLinksQuery,
} from '../lib/creator-owner-links';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOwnerSnapshot(): Promise<Response> {
  return fetch('/api/creador/perfil/', {
    method: 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: { 'x-creator-page-binding': root?.dataset.sessionBinding ?? '' },
  });
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
const placementIdByResource = new Map((state?.links ?? []).map(({ resourceId, placementId }) => [resourceId, placementId]));
const CATALOG_INDEX_PATH = '/catalog-selection.json';
const CATALOG_TYPES = new Set(['content', 'source', 'community', 'event']);
const OWNER_HISTORY_INDEX_KEY = 'creatorOwnerHistoryIndex';
const OWNER_ACTIVE_WRITE_EXIT_MESSAGE = 'Estamos guardando la acción iniciada. Espera a que termine antes de salir.';

const formState = root ? createCreatorFormState(root) : undefined;
const writeGuard = root ? createCreatorWriteGuard(root) : undefined;
let csrfToken = root?.dataset.csrf;
let activeForm: HTMLFormElement | undefined;
let activeEditor: 'datos' | 'redes' | 'foto' | 'enlace' | 'alta-enlace' | 'referencia' | 'reclamacion' | 'mover-enlace' | undefined;
let returnFocus: HTMLElement | undefined;
let pendingExitAction: (() => void) | undefined;
let ownerHistoryIndex = 0;
let ownerHistoryRestoreIndex: number | undefined;
let pendingOwnerHistoryNavigation: {
  fromIndex: number;
  toIndex: number;
  restoring: boolean;
  cancelled: boolean;
  proceed: boolean;
} | undefined;
let focusOwnerLocationAfterHistory = false;
let conflictProfile: CreatorProfileDTO | undefined;
let conflictOwnerSnapshot: (CreatorEditorDTO & { profile: CreatorProfileDTO }) | undefined;
let conflictProfileContext: { form: HTMLFormElement; name: 'crear' | 'datos' | 'redes'; contextRevision: number } | undefined;
let ownerEditorRevision = 0;
let createFormRevision = 0;
let ownerWriteRevision = 0;
let profileCompareGeneration = 0;
let activeLinkContext: { kind: 'placement'; placementId: string } | { kind: 'resource'; resourceId: string } | undefined;
let conflictLinkData: CreatorEditorDTO | undefined;
let linkContextRevision = 0;
let linkCompareGeneration = 0;
let conflictLinkContextRevision: number | undefined;
let activeMoveContext: { placementId: string } | undefined;
let moveContextRevision = 0;
let moveCompareGeneration = 0;
let moveComparisonData: CreatorEditorDTO | undefined;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let manualSlug = false;
let photoUploadId: string | undefined;
let photoUploadFile: File | undefined;
let catalogEntries: CreatorCatalogSelectionDTO[] | undefined;
let catalogLoad: Promise<void> | undefined;
let catalogSelection: CreatorCatalogSelectionDTO | undefined;
let catalogSelectionCurrent = true;
let catalogSelectionBaseline: string | undefined;
let catalogDirectoryBaseline = true;
let catalogSearchQuery = '';
let catalogPageNumber = 1;
let catalogNeedsRefresh = false;
let catalogComparisonData: CreatorEditorDTO | undefined;
let catalogComparisonGeneration = 0;
let catalogSubmitting = false;
let catalogSubmittingResourceId: string | undefined;
let catalogSubmittingDirectory: boolean | undefined;
let catalogConflictKind: 'profile' | 'link' | 'receipt' | undefined;
let catalogProfileCompared = false;
let catalogIndexRefreshed = false;
let pendingCatalogOptionCorrection: { resourceId: string; placementId: string; selectedForDirectory: boolean } | undefined;
let catalogResetSelectionOnNextOpen = false;
let activeCatalogCorrectionPlacementId: string | undefined;
let lastCatalogReferenceMessage: string | undefined;
type ClaimSelection = CreatorClaimResourceDTO & { title?: string };
let claimSelection = new Map<string, ClaimSelection>();
let claimSelectionRevisions = new Map<string, number>();
let claimSelectionBaseline = '';
let claimUrlsBaseline = '';
let claimEvidenceBaseline = '';
let claimStalePairs = new Set<string>();
let claimNeedsRefresh = false;
let claimSubmitting = false;
let claimChecking = false;
type ProfileFormAction = (event: Event) => Promise<void> | void;
type AddedLinkDraft = { title: string; url: string; description: string; selectedForDirectory: boolean };
let uncertainAddedLinkDraft: AddedLinkDraft | undefined;
let pendingSharedAddPlacementId: string | undefined;
let uncertainPublishIntent: { profileId: string } | undefined;
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
  if (name === 'alta-enlace') return root?.querySelector<HTMLElement>('[data-link-add-status]') ?? null;
  if (name === 'referencia') return root?.querySelector<HTMLElement>('[data-catalog-status]') ?? null;
  if (name === 'reclamacion') return claimForm()?.querySelector<HTMLElement>('[data-claim-status]') ?? null;
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

async function isOrderMoveCalculationUnavailable(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  const payload = await responsePayload(response);
  return payload?.error === 'ORDER_MOVE_CALCULATION_UNAVAILABLE';
}

function clearUncertainPublication() {
  uncertainPublishIntent = undefined;
  const check = root?.querySelector<HTMLButtonElement>('[data-owner-publish-check]');
  if (check) {
    check.hidden = true;
    check.disabled = false;
  }
}

function announcePublicationStatus(message: string, kind: 'error' | 'success' | 'info' = 'info') {
  const status = statusFor(undefined);
  if (status) {
    if (pageStatus && pageStatus !== status) clearAnnouncement(pageStatus);
    announce(status, message, kind);
    return;
  }
  announce(pageStatus, message, kind);
}

function requirePublicationCheck(
  profile: CreatorProfileDTO,
  message = 'No pudimos confirmar si la publicación se guardó. Comprueba el estado guardado antes de volver a intentarlo.',
) {
  uncertainPublishIntent = { profileId: profile.id };
  setHidden(root?.querySelector('[data-owner-publish]'), true);
  const check = root?.querySelector<HTMLButtonElement>('[data-owner-publish-check]');
  if (check) {
    check.disabled = false;
    check.hidden = false;
  }
  announcePublicationStatus(message);
}

function checkUncertainPublication() {
  if (!uncertainPublishIntent) return;
  if (writeGuard?.isActive()) {
    announcePublicationStatus('Espera a que termine la acción antes de actualizar la página para comprobar el estado.');
    return;
  }
  if (activeEditor !== undefined || activeForm !== undefined || hasPendingChanges()) {
    announcePublicationStatus('Guarda o descarta tus correcciones antes de actualizar la página para comprobar el estado.');
    return;
  }
  const button = root?.querySelector<HTMLButtonElement>('[data-owner-publish-check]');
  if (button) button.disabled = true;
  announcePublicationStatus('Actualizando esta página para comprobar el estado guardado; no se volverá a publicar.');
  window.location.reload();
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
    if (activeEditor !== 'reclamacion') sessionRecovery.announceBlocked();
    return;
  }
  await writeGuard?.run(event, async () => {
    ownerWriteRevision += 1;
    await action(event);
  });
  if (event.target === catalogForm()) setCatalogSelectionLabel();
  if (!dialog?.open) runPendingExitAction();
}

function onWrite(form: HTMLFormElement | null, action: ProfileFormAction) {
  if (!form) return;
  profileFormActions.set(form, action);
  form.addEventListener('submit', (event) => runProfileFormAction(event, action));
}

function linkForm(): HTMLFormElement | null {
  const form = formFor('enlace') ?? root?.querySelector<HTMLFormElement>('[data-link-edit-form]') ?? null;
  if (form && !form.dataset.ownerForm) form.dataset.ownerForm = 'enlace';
  return form;
}

function linkContextsEqual(
  left: typeof activeLinkContext,
  right: typeof activeLinkContext,
): boolean {
  if (!left || !right || left.kind !== right.kind) return left === right;
  return left.kind === 'placement'
    ? left.placementId === (right as { kind: 'placement'; placementId: string }).placementId
    : left.resourceId === (right as { kind: 'resource'; resourceId: string }).resourceId;
}

function linkComparisonIsCurrent(
  form: HTMLFormElement,
  context: NonNullable<typeof activeLinkContext>,
  revision: number,
  generation: number,
): boolean {
  return generation === linkCompareGeneration
    && revision === linkContextRevision
    && activeForm === form
    && activeEditor === 'enlace'
    && !form.hidden
    && linkContextsEqual(activeLinkContext, context);
}

function addLinkForm(): HTMLFormElement | null {
  const form = formFor('alta-enlace') ?? root?.querySelector<HTMLFormElement>('[data-link-add-form]') ?? null;
  if (form && !form.dataset.ownerForm) form.dataset.ownerForm = 'alta-enlace';
  return form;
}

function catalogForm(): HTMLFormElement | null {
  return formFor('referencia') ?? root?.querySelector<HTMLFormElement>('[data-catalog-reference-form]') ?? null;
}

function claimForm(): HTMLFormElement | null {
  return formFor('reclamacion') ?? root?.querySelector<HTMLFormElement>('[data-claim-form]') ?? null;
}

function catalogPanel(): HTMLElement | null {
  return root?.querySelector<HTMLElement>('[data-owner-catalog]') ?? null;
}

function catalogControl<T extends HTMLElement>(selector: string): T | null {
  return root?.querySelector<T>(selector) ?? null;
}

function catalogSelectionKey(item = catalogSelection): string | undefined {
  return item ? `${item.id}\n${item.url}` : undefined;
}

function claimSelectionSignature(selection = claimSelection): string {
  return [...selection.values()]
    .map(({ resourceId, url }) => `${resourceId}\n${url}`)
    .sort()
    .join('\n\u0000\n');
}

function claimStatusLabel(status: string | undefined): string {
  if (!status) return 'Solicitud recibida';
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    revoked: 'Revocada',
    resolved: 'Resuelta',
    partial: 'Parcialmente resuelta',
  };
  return labels[status] ?? status;
}

function claimResourceLabel(claim: CreatorClaimDTO, resourceId: string): string {
  const own = state?.editableResources.find(({ id }) => id === resourceId);
  if (own) return own.title;
  const ownLink = state?.links.find(({ resourceId: id }) => id === resourceId);
  if (ownLink) return ownLink.title;
  const publicItem = catalogEntries?.find(({ id }) => id === resourceId);
  if (publicItem) return publicItem.title;
  return claim.resources?.find(({ resourceId: id }) => id === resourceId)?.url ?? 'Contenido solicitado';
}

function renderClaimHistory() {
  const history = root?.querySelector<HTMLElement>('[data-claim-history]');
  if (!history || !state) return;
  history.querySelectorAll<HTMLElement>('[data-claim-record]').forEach((record) => record.remove());
  history.querySelectorAll<HTMLElement>('[data-claim-empty]').forEach((record) => record.remove());
  if (!state.claims.length) {
    const empty = document.createElement('li');
    empty.className = 'creator-owner__empty';
    empty.dataset.claimEmpty = '';
    empty.textContent = 'No tienes solicitudes todavía.';
    history.append(empty);
    return;
  }
  state.claims.forEach((claim) => {
    const record = document.createElement('li');
    record.className = 'creator-owner__claim-record';
    record.dataset.claimRecord = claim.id;
    const heading = document.createElement('div');
    heading.className = 'creator-owner__claim-heading';
    const status = document.createElement('strong');
    status.dataset.claimStatus = '';
    status.textContent = claimStatusLabel(claim.status);
    heading.append(status);
    if (claim.createdAt !== undefined) {
      const date = new Date(claim.createdAt);
      if (Number.isFinite(date.getTime())) {
        const time = document.createElement('time');
        time.dataset.claimDate = '';
        time.dateTime = date.toISOString();
        time.textContent = new Intl.DateTimeFormat('es', {
          dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
        }).format(date);
        heading.append(time);
      }
    }
    const resources = document.createElement('ul');
    resources.className = 'creator-owner__claim-resources';
    claim.resourceIds.forEach((resourceId) => {
      const item = document.createElement('li');
      item.dataset.claimResourceId = resourceId;
      item.textContent = claimResourceLabel(claim, resourceId);
      resources.append(item);
    });
    record.append(heading, resources);
    if (claim.evidence !== undefined) {
      const evidence = document.createElement('p');
      evidence.className = 'creator-owner__claim-evidence';
      evidence.dataset.claimEvidenceText = '';
      evidence.textContent = claim.evidence;
      record.append(evidence);
    }
    history.append(record);
  });
}

function sameCatalogSelection(left: string | undefined, right: string | undefined): boolean {
  return left === right;
}

function renderClaimSelection() {
  const list = catalogControl<HTMLUListElement>('[data-claim-selection]');
  if (!list) return;
  list.querySelectorAll<HTMLElement>('[data-claim-selection-item]').forEach((item) => item.remove());
  list.hidden = activeEditor !== 'reclamacion' || claimSelection.size === 0;
  if (list.hidden) return;
  claimSelection.forEach((item) => {
    const row = document.createElement('li');
    row.dataset.claimSelectionItem = '';
    const label = document.createElement('span');
    label.textContent = item.title ? `${item.title} — ${item.url}` : item.url;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button button--outline';
    remove.dataset.claimDeselect = item.resourceId;
    remove.setAttribute('aria-label', `Quitar ${item.title ?? item.url} de la selección`);
    remove.textContent = 'Quitar';
    row.append(label, remove);
    list.append(row);
  });
}

function isCatalogItem(value: unknown): value is CreatorCatalogSelectionDTO {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'id,tipo,title,url'
    || typeof value.id !== 'string' || value.id.length === 0
    || typeof value.title !== 'string' || value.title.trim().length === 0
    || typeof value.url !== 'string' || !CATALOG_TYPES.has(String(value.tipo))) return false;
  try {
    const url = new URL(value.url);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function parseCatalogIndex(value: unknown): CreatorCatalogSelectionDTO[] | undefined {
  if (!Array.isArray(value) || !value.every(isCatalogItem)) return undefined;
  const ids = new Set<string>();
  for (const item of value) {
    if (ids.has(item.id)) return undefined;
    ids.add(item.id);
  }
  return value;
}

function setCatalogSelectionLabel() {
  renderClaimSelection();
  const selected = catalogControl<HTMLElement>('[data-catalog-selected-count]');
  if (activeEditor === 'reclamacion') {
    if (selected) selected.textContent = claimSelection.size === 0
      ? 'Ningún recurso seleccionado.'
      : `${claimSelection.size} ${claimSelection.size === 1 ? 'recurso seleccionado.' : 'recursos seleccionados.'}`;
  } else {
  const selectionIsVisible = [...(catalogControl<HTMLUListElement>('[data-catalog-results]')
    ?.querySelectorAll<HTMLElement>('[data-catalog-row]') ?? [])]
    .some((row) => row.dataset.catalogRow === catalogSelection?.id);
  if (selected) selected.textContent = catalogSelection
    ? selectionIsVisible ? '1 recurso seleccionado.' : `1 recurso seleccionado: ${catalogSelection.title}`
    : 'Ningún recurso seleccionado.';
  }
  const submit = catalogControl<HTMLButtonElement>('[data-catalog-reference]');
  const unavailable = !catalogSelection || !catalogSelectionCurrent || catalogNeedsRefresh
    || catalogConflictKind !== undefined || pendingCatalogOptionCorrection !== undefined;
  if (submit) {
    if (unavailable) submit.setAttribute('data-creator-stale', 'true');
    else submit.removeAttribute('data-creator-stale');
    submit.disabled = unavailable || catalogSubmitting;
  }
  const correction = catalogControl<HTMLButtonElement>('[data-catalog-correction-open]');
  if (correction) {
    const link = pendingCatalogOptionCorrection
      ? state?.links.find(({ placementId }) => placementId === pendingCatalogOptionCorrection?.placementId)
      : undefined;
    correction.hidden = !pendingCatalogOptionCorrection;
    correction.textContent = link ? `Revisar opciones de «${link.title}»` : 'Revisar opciones de esta colocación';
  }
}

function catalogMatchesQuery(item: CreatorCatalogSelectionDTO, query: string): boolean {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase();
  return item.title.toLocaleLowerCase().includes(normalized)
    || item.url.toLocaleLowerCase().includes(normalized);
}

function renderCatalogResults() {
  const results = catalogControl<HTMLUListElement>('[data-catalog-results]');
  const count = catalogControl<HTMLElement>('[data-catalog-count]');
  const empty = catalogControl<HTMLElement>('[data-catalog-empty]');
  const previous = catalogControl<HTMLButtonElement>('[data-catalog-page="previous"]');
  const next = catalogControl<HTMLButtonElement>('[data-catalog-page="next"]');
  const pageLabel = catalogControl<HTMLElement>('[data-catalog-page-label]');
  if (!results) return;
  results.querySelectorAll<HTMLElement>('[data-catalog-row]').forEach((row) => row.remove());
  const matches = catalogNeedsRefresh
    ? []
    : (catalogEntries ?? []).filter((item) => catalogMatchesQuery(item, catalogSearchQuery));
  const pageCount = Math.max(1, Math.ceil(matches.length / 25));
  catalogPageNumber = Math.min(Math.max(1, catalogPageNumber), pageCount);
  const visible = matches.slice((catalogPageNumber - 1) * 25, catalogPageNumber * 25);
  if (count) {
    setHidden(count, catalogEntries === undefined);
    if (catalogEntries !== undefined) count.textContent = `${matches.length} ${matches.length === 1 ? 'resultado' : 'resultados'}`;
  }
  if (pageLabel) pageLabel.textContent = `Página ${catalogPageNumber} de ${pageCount}`;
  if (previous) previous.disabled = catalogPageNumber <= 1;
  if (next) next.disabled = catalogPageNumber >= pageCount;
  if (empty) {
    empty.textContent = catalogNeedsRefresh
      ? 'Actualiza el catálogo para revisar la ficha seleccionada.'
      : matches.length ? 'No hay recursos en esta página.' : 'No hay recursos que coincidan con la búsqueda.';
    setHidden(empty, matches.length !== 0 || catalogEntries === undefined);
  }
  visible.forEach((item) => {
    const row = document.createElement('li');
    row.className = 'creator-owner__catalog-row';
    row.dataset.catalogRow = item.id;
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.catalogSelect = '';
    checkbox.setAttribute('form', 'owner-catalog-search-form');
    checkbox.checked = activeEditor === 'reclamacion'
      ? claimSelection.has(item.id)
      : catalogSelection?.id === item.id;
    checkbox.setAttribute('aria-label', `${activeEditor === 'reclamacion' ? 'Solicitar edición de' : 'Seleccionar'} ${item.title}`);
    const copy = document.createElement('span');
    copy.className = 'creator-owner__catalog-item';
    const title = document.createElement('strong');
    title.textContent = item.title;
    const url = document.createElement('span');
    url.textContent = item.url;
    copy.append(title, url);
    label.append(checkbox, copy);
    row.append(label);
    results.append(row);
  });
  setCatalogSelectionLabel();
}

function showCatalogLoadError(message: string) {
  announce(statusFor('referencia'), message, 'error');
  setHidden(catalogControl('[data-catalog-retry]'), false);
  announce(root?.querySelector<HTMLElement>('[data-claim-index-status]'), message, 'error');
  setHidden(root?.querySelector('[data-claim-index-retry]'), false);
  const empty = catalogControl<HTMLElement>('[data-catalog-empty]');
  setHidden(empty, true);
  setCatalogSelectionLabel();
}

async function loadCatalog({ refresh = false }: { refresh?: boolean } = {}): Promise<void> {
  if (!refresh && catalogEntries) {
    renderCatalogResults();
    return;
  }
  if (catalogLoad) return catalogLoad;
  const retry = catalogControl<HTMLButtonElement>('[data-catalog-retry]');
  if (retry) retry.hidden = true;
  setHidden(root?.querySelector('[data-claim-index-retry]'), true);
  setHidden(catalogControl('[data-catalog-count]'), catalogEntries === undefined);
  setHidden(catalogControl('[data-catalog-empty]'), true);
  announce(statusFor('referencia'), refresh ? 'Actualizando el catálogo…' : 'Cargando el catálogo…', 'info');
  announce(root?.querySelector<HTMLElement>('[data-claim-index-status]'), refresh ? 'Actualizando el catálogo…' : 'Cargando el catálogo…', 'info');
  catalogPanel()?.setAttribute('aria-busy', 'true');
  const request = (async () => {
    const wasStale = catalogNeedsRefresh;
    const response = await fetch(CATALOG_INDEX_PATH, { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('catalog-unavailable');
    let value: unknown;
    try { value = await response.json(); } catch { throw new Error('catalog-malformed'); }
    const parsed = parseCatalogIndex(value);
    if (!parsed) throw new Error('catalog-malformed');
    catalogEntries = parsed;
    catalogNeedsRefresh = false;
    catalogSelectionCurrent = true;
    if (claimNeedsRefresh) {
      claimNeedsRefresh = false;
      const staleItem = [...claimStalePairs]
        .map((resourceId) => parsed.find((item) => item.id === resourceId))
        .find((item): item is CreatorCatalogSelectionDTO => Boolean(item));
      if (staleItem) {
        catalogSearchQuery = staleItem.title;
        catalogPageNumber = 1;
        const search = catalogControl<HTMLInputElement>('[data-catalog-search]');
        if (search) search.value = staleItem.title;
      }
      announce(statusFor('reclamacion'), 'Catálogo actualizado. Quita y vuelve a seleccionar las fichas cuya URL cambió para confirmar la observación actual.', 'info');
    }
    if (catalogConflictKind === 'link') {
      catalogIndexRefreshed = true;
      if (catalogProfileCompared) catalogConflictKind = undefined;
    }
    if (catalogSelection) {
      const refreshed = parsed.find(({ id }) => id === catalogSelection?.id);
      if (refreshed) {
        const changedUrl = refreshed.url !== catalogSelection.url;
        catalogSelection = refreshed;
        announce(statusFor('referencia'), changedUrl
          ? 'La URL observada cambió. Revisa la ficha y pulsa «Agregar a mi página» para confirmar la referencia actual.'
          : wasStale
            ? 'Catálogo actualizado. Revisa la ficha y pulsa «Agregar a mi página» para confirmar la referencia.'
            : '', 'info');
      } else {
        catalogSelectionCurrent = false;
        announce(statusFor('referencia'), 'El recurso seleccionado ya no aparece en el catálogo. Elige otra ficha antes de continuar.', 'error');
      }
    } else if (wasStale) {
      announce(statusFor('referencia'), 'Catálogo actualizado. Revisa el recurso antes de volver a agregarlo.', 'info');
    } else if (parsed.length === 0) {
      announce(statusFor('referencia'), 'El catálogo no tiene recursos disponibles en este momento.', 'info');
    } else if (catalogSearchQuery) {
      const matches = parsed.filter((item) => catalogMatchesQuery(item, catalogSearchQuery)).length;
      announce(statusFor('referencia'), matches
        ? `${matches} ${matches === 1 ? 'resultado' : 'resultados'} para la búsqueda.`
        : 'No hay recursos que coincidan con la búsqueda.', 'info');
    } else {
      clearAnnouncement(statusFor('referencia'));
    }
    clearAnnouncement(root?.querySelector<HTMLElement>('[data-claim-index-status]'));
    setHidden(root?.querySelector('[data-claim-index-retry]'), true);
    renderCatalogResults();
    setCatalogSelectionLabel();
    renderClaimHistory();
    if (retry) retry.hidden = true;
  })();
  const handled = request.catch((error: unknown) => {
    showCatalogLoadError(error instanceof Error && error.message === 'catalog-malformed'
      ? 'No pudimos leer el catálogo. El servicio respondió con un formato inesperado; vuelve a intentarlo.'
      : 'No pudimos cargar el catálogo. Puedes volver a intentarlo.');
  }).finally(() => {
    if (catalogLoad === handled) catalogLoad = undefined;
    catalogPanel()?.removeAttribute('aria-busy');
  });
  catalogLoad = handled;
  await handled;
}

function openCatalog(trigger: HTMLElement) {
  if (!state?.profile || !dialog) return;
  const form = catalogForm();
  if (!form) return;
  if (activeEditor === 'referencia' && !form.hidden) {
    void loadCatalog();
    return;
  }
  resetCatalogIntentAfterConfirmedSave(form);
  catalogComparisonGeneration += 1;
  catalogComparisonData = undefined;
  const directory = field(form, 'selectedForDirectory') as HTMLInputElement | null;
  catalogSelectionBaseline = catalogSelectionKey();
  catalogDirectoryBaseline = directory?.checked ?? true;
  setHidden(catalogPanel(), false);
  showDialogForm(form, 'referencia', 'Buscar en el catálogo', trigger);
  void loadCatalog();
}

function resetClaimIntent(form: HTMLFormElement) {
  claimSelection.clear();
  claimSelectionRevisions.clear();
  claimSelectionBaseline = '';
  claimStalePairs.clear();
  claimNeedsRefresh = false;
  const urls = field(form, 'knownUrls');
  const evidence = field(form, 'evidence');
  if (urls) urls.value = '';
  if (evidence) evidence.value = '';
  claimUrlsBaseline = '';
  claimEvidenceBaseline = '';
  const check = root?.querySelector<HTMLButtonElement>('[data-claim-check]');
  if (check) check.hidden = true;
  clearAnnouncement(statusFor('reclamacion'));
  setCatalogSelectionLabel();
  renderCatalogResults();
  formState?.commit(capture(form));
}

function openClaimRequest(trigger: HTMLElement) {
  const form = claimForm();
  if (!form || !dialog) return;
  if (!state?.profile) {
    announce(pageStatus, 'Primero crea el borrador de tu página para solicitar edición.', 'info');
    return;
  }
  if (activeEditor === 'reclamacion' && !form.hidden) {
    addSharedRowSelection(trigger);
    return;
  }
  claimSelectionBaseline = claimSelectionSignature();
  claimUrlsBaseline = field(form, 'knownUrls')?.value ?? '';
  claimEvidenceBaseline = field(form, 'evidence')?.value ?? '';
  setHidden(catalogPanel(), false);
  showDialogForm(form, 'reclamacion', 'Solicitar edición', trigger);
  addSharedRowSelection(trigger);
  setCatalogSelectionLabel();
  renderCatalogResults();
  void loadCatalog();
}

function addSharedRowSelection(trigger: HTMLElement) {
  const resourceId = trigger.dataset.resourceId;
  const url = trigger.dataset.url;
  if (!resourceId || !url) return;
  const link = state?.links.find((item) => item.resourceId === resourceId && item.url === url);
  if (!link || state?.editableResources.some(({ id }) => id === resourceId)) {
    announce(statusFor('reclamacion'), 'La ficha compartida cambió. Actualiza Enlaces antes de solicitar edición.', 'error');
    return;
  }
  if (!claimSelection.has(resourceId)) {
    claimSelection.set(resourceId, { resourceId, url, title: link.title });
    claimSelectionRevisions.set(resourceId, (claimSelectionRevisions.get(resourceId) ?? 0) + 1);
    setCatalogSelectionLabel();
  }
}

function reopenCatalogSelection(resourceId: string, searchQuery: string, pageNumber: number) {
  const trigger = catalogControl<HTMLElement>('[data-catalog-open]');
  const item = catalogEntries?.find((candidate) => candidate.id === resourceId);
  if (!trigger || !item) {
    announce(statusFor('referencia'), 'La ficha que elegiste ya no está disponible en este catálogo. Actualízalo antes de continuar.', 'error');
    return;
  }
  openCatalog(trigger);
  catalogSearchQuery = searchQuery;
  catalogPageNumber = pageNumber;
  const search = catalogControl<HTMLInputElement>('[data-catalog-search]');
  if (search) search.value = searchQuery;
  catalogSelection = item;
  catalogSelectionCurrent = true;
  catalogSelectionBaseline = undefined;
  const matches = (catalogEntries ?? []).filter((candidate) => catalogMatchesQuery(candidate, catalogSearchQuery));
  const matchIndex = matches.findIndex((candidate) => candidate.id === resourceId);
  if (matchIndex >= 0) catalogPageNumber = Math.floor(matchIndex / 25) + 1;
  const form = catalogForm();
  const directory = form && field(form, 'selectedForDirectory') as HTMLInputElement | null;
  catalogDirectoryBaseline = directory?.checked ?? true;
  renderCatalogResults();
  const selected = [...(catalogControl<HTMLUListElement>('[data-catalog-results]')?.querySelectorAll<HTMLElement>('[data-catalog-row]') ?? [])]
    .find((row) => row.dataset.catalogRow === resourceId)
    ?.querySelector<HTMLElement>('[data-catalog-select]');
  if (selected) window.requestAnimationFrame(() => selected.focus());
}

function selectCatalogItem(target: HTMLInputElement) {
  if (activeEditor === 'reclamacion') {
    const row = target.closest<HTMLElement>('[data-catalog-row]');
    const resourceId = row?.dataset.catalogRow;
    const item = resourceId ? catalogEntries?.find(({ id }) => id === resourceId) : undefined;
    if (!resourceId || !item) return;
    if (!target.checked) {
      claimSelection.delete(resourceId);
      claimStalePairs.delete(resourceId);
    } else {
      claimSelection.set(resourceId, { resourceId, url: item.url, title: item.title });
    }
    claimSelectionRevisions.set(resourceId, (claimSelectionRevisions.get(resourceId) ?? 0) + 1);
    setCatalogSelectionLabel();
    target.setAttribute('aria-label', `${target.checked ? 'Quitar solicitud de edición de' : 'Solicitar edición de'} ${item.title}`);
    return;
  }
  const row = target.closest<HTMLElement>('[data-catalog-row]');
  const resourceId = row?.dataset.catalogRow;
  if (!resourceId) return;
  if (!target.checked) {
    if (resourceId === catalogSelection?.id) catalogSelection = undefined;
  } else {
    if (pendingCatalogOptionCorrection && resourceId !== pendingCatalogOptionCorrection.resourceId) {
      target.checked = false;
      const trigger = catalogControl<HTMLElement>('[data-catalog-open]');
      const searchQuery = catalogSearchQuery;
      const pageNumber = catalogPageNumber;
      showExitPrompt(() => reopenCatalogSelection(resourceId, searchQuery, pageNumber), trigger ?? undefined);
      return;
    }
    const directory = field(catalogForm(), 'selectedForDirectory') as HTMLInputElement | null;
    const currentDirectory = directory?.checked ?? catalogSubmittingDirectory;
    const submittedLink = catalogSubmittingResourceId
      ? state?.links.find(({ resourceId: id }) => id === catalogSubmittingResourceId)
      : undefined;
    const directoryCorrectionPending = catalogSubmittingDirectory !== undefined
      && currentDirectory !== catalogSubmittingDirectory
      && (!submittedLink || currentDirectory !== submittedLink.selectedForDirectory);
    if (catalogSubmitting && catalogSubmittingResourceId !== resourceId && directoryCorrectionPending) {
      target.checked = false;
      announce(statusFor('referencia'), 'Espera a que termine de agregar esta ficha antes de cambiar de selección; su opción todavía está en revisión.', 'info');
      return;
    }
    const item = catalogEntries?.find((candidate) => candidate.id === resourceId);
    if (!item) return;
    catalogSelection = item;
    catalogSelectionCurrent = true;
  }
  renderCatalogResults();
  const focusRow = [...(catalogControl<HTMLUListElement>('[data-catalog-results]')?.querySelectorAll<HTMLElement>('[data-catalog-row]') ?? [])]
    .find((candidate) => candidate.dataset.catalogRow === resourceId);
  const focusTarget = focusRow?.querySelector<HTMLElement>('[data-catalog-select]');
  if (focusTarget) window.requestAnimationFrame(() => focusTarget.focus());
}

function resetCatalogReference(form: HTMLFormElement) {
  catalogSelection = undefined;
  catalogSelectionCurrent = true;
  catalogSearchQuery = '';
  catalogPageNumber = 1;
  const search = catalogControl<HTMLInputElement>('[data-catalog-search]');
  if (search) search.value = '';
  const directory = field(form, 'selectedForDirectory') as HTMLInputElement | null;
  if (directory) directory.checked = true;
  catalogSelectionBaseline = undefined;
  catalogDirectoryBaseline = true;
  catalogNeedsRefresh = false;
  catalogComparisonData = undefined;
  catalogConflictKind = undefined;
  catalogProfileCompared = false;
  catalogIndexRefreshed = false;
  pendingCatalogOptionCorrection = undefined;
  clearConflict(form);
  clearAnnouncement(statusFor('referencia'));
  renderCatalogResults();
}

function resetCatalogIntentAfterConfirmedSave(form: HTMLFormElement): boolean {
  if (!catalogResetSelectionOnNextOpen || catalogLoad || catalogSubmitting
    || pendingCatalogOptionCorrection || catalogConflictKind || catalogNeedsRefresh || !catalogSelectionCurrent) return false;
  catalogResetSelectionOnNextOpen = false;
  catalogSelection = undefined;
  catalogSelectionCurrent = true;
  const directory = field(form, 'selectedForDirectory') as HTMLInputElement | null;
  if (directory) directory.checked = true;
  catalogSelectionBaseline = undefined;
  catalogDirectoryBaseline = true;
  clearAnnouncement(statusFor('referencia'));
  formState?.commit(capture(form));
  renderCatalogResults();
  return true;
}

function resetAddedLinkForm(form: HTMLFormElement) {
  const title = field(form, 'title');
  const url = field(form, 'url');
  const description = field(form, 'description');
  const selected = field(form, 'selectedForDirectory') as HTMLInputElement | null;
  const reviewOptions = form.querySelector<HTMLButtonElement>('[data-link-add-options]');
  if (title) title.value = '';
  if (url) url.value = '';
  if (description) description.value = '';
  if (selected) selected.checked = true;
  if (reviewOptions) reviewOptions.hidden = true;
  pendingSharedAddPlacementId = undefined;
  uncertainAddedLinkDraft = undefined;
  formState?.commit(capture(form));
}

function readAddedLinkDraft(form: HTMLFormElement): AddedLinkDraft {
  return {
    title: String(field(form, 'title')?.value ?? ''),
    url: String(field(form, 'url')?.value ?? ''),
    description: String(field(form, 'description')?.value ?? ''),
    selectedForDirectory: Boolean((field(form, 'selectedForDirectory') as HTMLInputElement | null)?.checked),
  };
}

function sameAddedLinkDraft(left: AddedLinkDraft, right: AddedLinkDraft): boolean {
  return left.title === right.title && left.url.trim() === right.url.trim()
    && left.description === right.description
    && left.selectedForDirectory === right.selectedForDirectory;
}

function sameAddedLinkText(left: AddedLinkDraft, right: AddedLinkDraft): boolean {
  return left.title === right.title && left.url.trim() === right.url.trim()
    && left.description === right.description;
}

function markAddedLinkUncertain(draft: AddedLinkDraft) {
  if (uncertainAddedLinkDraft?.url.trim() !== draft.url.trim()) uncertainAddedLinkDraft = draft;
}

function hideDialogForms() {
  dialog?.querySelectorAll<HTMLFormElement>('form[data-owner-form]').forEach((form) => { form.hidden = true; });
}

function showDialogForm(form: HTMLFormElement, name: NonNullable<typeof activeEditor>, title: string, trigger?: HTMLElement) {
  if (!dialog) return;
  ownerEditorRevision += 1;
  if (name !== 'mover-enlace') {
    moveContextRevision += 1;
    moveCompareGeneration += 1;
    moveComparisonData = undefined;
    activeMoveContext = undefined;
  }
  hideDialogForms();
  setHidden(catalogPanel(), name !== 'referencia' && name !== 'reclamacion');
  form.hidden = false;
  setHidden(exitPrompt, true);
  const heading = root?.querySelector<HTMLElement>('[data-owner-dialog-title]');
  if (heading) heading.textContent = title;
  activeForm = form;
  activeEditor = name;
  returnFocus = trigger ?? returnFocus;
  if (!dialog.open) dialog.showModal();
  const first = name === 'referencia' || name === 'reclamacion'
    ? catalogControl<HTMLElement>('[data-catalog-search]')
    : form.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, button');
  window.requestAnimationFrame(() => first?.focus?.());
}

function ownerHistoryState(index: number): Record<string, unknown> {
  const current = isRecord(window.history?.state) ? window.history.state : {};
  return { ...current, [OWNER_HISTORY_INDEX_KEY]: index };
}

function ownerHistoryIndexFrom(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  const index = value[OWNER_HISTORY_INDEX_KEY];
  return typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 ? index : undefined;
}

function isSameTabNavigationClick(event: Event, anchor: HTMLAnchorElement): boolean {
  if (event.defaultPrevented) return false;
  const click = event as MouseEvent;
  if ((typeof click.button === 'number' && click.button !== 0)
    || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (anchor.hasAttribute('download')) return false;
  const target = anchor.getAttribute('target');
  if (target && target.toLowerCase() !== '_self') return false;
  const href = anchor.getAttribute('href') ?? anchor.href;
  if (!href) return false;
  let destination: URL;
  try {
    destination = new URL(href, window.location.href);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(destination.protocol)) return false;
  const current = new URL(window.location.href);
  const sameDocument = destination.origin === current.origin
    && destination.pathname === current.pathname
    && destination.search === current.search;
  return !(sameDocument && href.includes('#'));
}

function guardOwnerNavigationClick(
  event: Event,
  anchor: HTMLAnchorElement,
  returnFocusTarget: HTMLElement | null = anchor,
) {
  if (!isSameTabNavigationClick(event, anchor)) return;
  if (!writeGuard?.isActive() && !hasPendingChanges()) return;
  event.preventDefault();
  showExitPrompt(() => window.location.assign(anchor.href), returnFocusTarget ?? undefined);
}

function initializeOwnerHistory() {
  if (typeof window.history?.replaceState !== 'function') {
    ownerHistoryIndex = 0;
    return;
  }
  ownerHistoryIndex = ownerHistoryIndexFrom(window.history.state) ?? 0;
  window.history.replaceState(ownerHistoryState(ownerHistoryIndex), '', window.location.href);
}

function pushOwnerHistory(href: string) {
  if (typeof window.history?.pushState !== 'function') return;
  ownerHistoryIndex += 1;
  window.history.pushState(ownerHistoryState(ownerHistoryIndex), '', href);
}

function replaceOwnerHistory(href: string) {
  if (typeof window.history?.replaceState !== 'function') return;
  window.history.replaceState(ownerHistoryState(ownerHistoryIndex), '', href);
}

function focusRestoredOwnerLocation() {
  const target = root?.querySelector<HTMLElement>('[data-link-search]');
  if (target) window.requestAnimationFrame(() => target.focus());
}

function ownerLinksFocusIsVisible(target: HTMLElement | undefined): boolean {
  const ownerLinks = root?.querySelector<HTMLElement>('[data-owner-links]');
  if (!target?.isConnected || !ownerLinks || target.closest('[data-owner-links]') !== ownerLinks) return false;
  for (let ancestor: HTMLElement | null = target; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.hidden || ancestor.getAttribute('aria-hidden') === 'true') return false;
    if (ancestor === root) return true;
  }
  return false;
}

function restoreOwnerLinksFocusIfLost(target: HTMLElement | undefined, wasInOwnerLinks: boolean) {
  const selectedView = new URL(window.location.href).searchParams.get('vista');
  if (!wasInOwnerLinks || (selectedView && selectedView !== 'enlaces') || ownerLinksFocusIsVisible(target)) return;

  const previousPageLabel = target?.closest('[data-link-page]')?.textContent?.trim();
  const pageLinks = [...(root?.querySelectorAll<HTMLAnchorElement>('[data-link-page]') ?? [])];
  const pagerTarget = pageLinks.find((link) => link.textContent?.trim() === previousPageLabel) ?? pageLinks[0];
  if (pagerTarget?.isConnected) window.requestAnimationFrame(() => pagerTarget.focus());
  else focusRestoredOwnerLocation();
}

function completePendingOwnerHistoryNavigation() {
  const navigation = pendingOwnerHistoryNavigation;
  if (!navigation) return;
  if (navigation.restoring) {
    navigation.proceed = true;
    return;
  }
  pendingOwnerHistoryNavigation = undefined;
  ownerHistoryIndex = navigation.fromIndex;
  const delta = navigation.toIndex - navigation.fromIndex;
  if (delta === 0) {
    ownerHistoryIndex = navigation.toIndex;
    restoreLinksFromLocation();
    focusRestoredOwnerLocation();
    return;
  }
  if (typeof window.history?.go !== 'function') return;
  focusOwnerLocationAfterHistory = true;
  window.history.go(delta);
}

function handleOwnerPopstate(event: PopStateEvent) {
  const focusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  const ownerLinks = root?.querySelector<HTMLElement>('[data-owner-links]');
  const focusWasInOwnerLinks = Boolean(focusedElement && ownerLinks
    && focusedElement.closest('[data-owner-links]') === ownerLinks);
  const targetIndex = ownerHistoryIndexFrom(event?.state);
  const hasPendingEditorChanges = Boolean(dialog?.open && activeEditor && hasPendingChanges());
  if (targetIndex !== undefined && targetIndex === ownerHistoryRestoreIndex) {
    ownerHistoryIndex = targetIndex;
    ownerHistoryRestoreIndex = undefined;
    const pending = pendingOwnerHistoryNavigation;
    if (pending?.fromIndex === targetIndex) {
      pending.restoring = false;
      if (pending.cancelled) pendingOwnerHistoryNavigation = undefined;
      else if (pending.proceed) {
        pending.proceed = false;
        completePendingOwnerHistoryNavigation();
      }
    }
    return;
  }
  if (targetIndex === undefined) {
    if (hasPendingEditorChanges) showExitPrompt(() => {
      restoreLinksFromLocation();
      restoreOwnerLinksFocusIfLost(focusedElement, focusWasInOwnerLinks);
    });
    else {
      restoreLinksFromLocation();
      restoreOwnerLinksFocusIfLost(focusedElement, focusWasInOwnerLinks);
    }
    return;
  }
  if (targetIndex === ownerHistoryIndex) {
    restoreLinksFromLocation();
    restoreOwnerLinksFocusIfLost(focusedElement, focusWasInOwnerLinks);
    return;
  }

  if (writeGuard?.isActive()) {
    announceWrite(activeEditor, 'La escritura ya empezó. Espera a que termine antes de cambiar la vista.', 'info');
    if (typeof window.history?.go !== 'function') return;
    ownerHistoryRestoreIndex = ownerHistoryIndex;
    window.history.go(ownerHistoryIndex - targetIndex);
    return;
  }

  if (hasPendingEditorChanges) {
    const fromIndex = ownerHistoryIndex;
    pendingOwnerHistoryNavigation = {
      fromIndex,
      toIndex: targetIndex,
      restoring: true,
      cancelled: false,
      proceed: false,
    };
    pendingExitAction = completePendingOwnerHistoryNavigation;
    showExitPrompt();
    if (typeof window.history?.go !== 'function') return;
    ownerHistoryRestoreIndex = fromIndex;
    window.history.go(fromIndex - targetIndex);
    return;
  }

  ownerHistoryIndex = targetIndex;
  restoreLinksFromLocation();
  if (focusOwnerLocationAfterHistory) {
    focusOwnerLocationAfterHistory = false;
    focusRestoredOwnerLocation();
  } else {
    restoreOwnerLinksFocusIfLost(focusedElement, focusWasInOwnerLinks);
  }
}

function setLinkFormValues(
  form: HTMLFormElement,
  value: CreatorLinkDTO | CreatorEditableResourceDTO,
  kind: 'placement-own' | 'placement-shared' | 'resource',
) {
  for (const name of ['title', 'url', 'description']) {
    const control = field(form, name);
    if (control) control.value = name === 'description' ? value.description ?? '' : value[name as 'title' | 'url'];
  }
  const isPlacement = kind !== 'resource';
  const canEditMetadata = kind !== 'placement-shared';
  const metadata = form.querySelector<HTMLElement>('[data-link-metadata-fields]');
  const options = form.querySelector<HTMLElement>('[data-link-options]');
  setHidden(metadata, !canEditMetadata);
  setHidden(options, !isPlacement);
  if (metadata?.tagName === 'FIELDSET') (metadata as HTMLFieldSetElement).disabled = !canEditMetadata;
  if (options?.tagName === 'FIELDSET') (options as HTMLFieldSetElement).disabled = !isPlacement;
  const featured = field(form, 'featured') as HTMLInputElement | null;
  const selected = field(form, 'selectedForDirectory') as HTMLInputElement | null;
  if (featured) featured.checked = isPlacement && (value as CreatorLinkDTO).featured;
  if (selected) selected.checked = isPlacement && (value as CreatorLinkDTO).selectedForDirectory;
  form.dataset.linkEditKind = kind;
  clearAnnouncement(statusFor('enlace'));
  clearConflict(form);
  formState?.commit(capture(form));
}

function openLinkContext(trigger: HTMLElement, correction?: { placementId: string; selectedForDirectory: boolean }) {
  if (!state?.profile || !dialog) return;
  const resourceId = trigger.dataset.resourceId;
  const row = trigger.closest<HTMLElement>('[data-link-row]');
  const placementId = trigger.dataset.placementId || row?.dataset.linkRow || correction?.placementId;
  const form = linkForm();
  if (!form) return;

  if (resourceId) {
    const resource = state.editableResources.find((item) => item.id === resourceId);
    if (!resource || state.links.some((link) => link.resourceId === resourceId)) return;
    linkContextRevision += 1;
    activeLinkContext = { kind: 'resource', resourceId };
    setLinkFormValues(form, resource, 'resource');
    showDialogForm(form, 'enlace', `Editar ficha: ${resource.title}`, trigger);
    restoreCatalogReferenceNotice();
    return;
  }
  const link = state.links.find((item) => item.placementId === placementId);
  if (!link) return;
  const resource = state.editableResources.find((item) => item.id === link.resourceId);
  linkContextRevision += 1;
  activeLinkContext = { kind: 'placement', placementId: link.placementId };
  setLinkFormValues(form, link, resource ? 'placement-own' : 'placement-shared');
  if (correction) {
    const selectedForDirectory = field(form, 'selectedForDirectory') as HTMLInputElement | null;
    if (selectedForDirectory) selectedForDirectory.checked = correction.selectedForDirectory;
  }
  showDialogForm(form, 'enlace', resource ? `Editar ficha: ${link.title}` : `Editar opciones: ${link.title}`, trigger);
  restoreCatalogReferenceNotice();
}

function continueAddedLinkInEditor(
  sourceForm: HTMLFormElement,
  link: CreatorLinkDTO,
  correction: { title: string; url: string; description: string; selectedForDirectory: boolean },
  preserveSharedTextCorrection = false,
): 'editable' | 'shared' | 'shared-correction' | undefined {
  const form = linkForm();
  if (!form || !state) return undefined;
  const canEditMetadata = state.editableResources.some(({ id }) => id === link.resourceId);
  if (!canEditMetadata && preserveSharedTextCorrection) {
    for (const name of ['title', 'url', 'description'] as const) {
      const input = field(sourceForm, name);
      if (input) input.value = correction[name];
    }
    pendingSharedAddPlacementId = link.placementId;
    setHidden(sourceForm.querySelector('[data-link-add-options]'), false);
    showDialogForm(sourceForm, 'alta-enlace', 'Revisar corrección de alta');
    uncertainAddedLinkDraft = undefined;
    return 'shared-correction';
  }
  const row = [...(root?.querySelectorAll<HTMLElement>('[data-link-row]') ?? [])]
    .find((item) => item.dataset.linkRow === link.placementId);
  const trigger = row?.querySelector<HTMLElement>('[data-link-edit]') ?? document.createElement('button');
  if (!row) trigger.dataset.placementId = link.placementId;
  openLinkContext(trigger, { placementId: link.placementId, selectedForDirectory: correction.selectedForDirectory });
  if (activeForm !== form || activeEditor !== 'enlace'
    || activeLinkContext?.kind !== 'placement' || activeLinkContext.placementId !== link.placementId) return undefined;
  if (canEditMetadata) {
    for (const name of ['title', 'url', 'description'] as const) {
      const input = field(form, name);
      if (input) input.value = correction[name];
    }
  }
  const selected = field(form, 'selectedForDirectory') as HTMLInputElement | null;
  if (selected) selected.checked = correction.selectedForDirectory;
  resetAddedLinkForm(sourceForm);
  return canEditMetadata ? 'editable' : 'shared';
}

function restoreCatalogReferenceNotice() {
  if (!lastCatalogReferenceMessage) return;
  announce(statusFor('enlace'), lastCatalogReferenceMessage, 'success');
  lastCatalogReferenceMessage = undefined;
}

function refreshPendingCatalogOptionCorrection() {
  const correction = pendingCatalogOptionCorrection;
  if (!correction) return undefined;
  const link = state?.links.find(({ placementId }) => placementId === correction.placementId);
  const directory = field(catalogForm(), 'selectedForDirectory') as HTMLInputElement | null;
  if (!link || !directory) return correction;
  catalogDirectoryBaseline = link.selectedForDirectory;
  pendingCatalogOptionCorrection = directory.checked === link.selectedForDirectory
    ? undefined
    : { ...correction, selectedForDirectory: directory.checked };
  return pendingCatalogOptionCorrection;
}

function updateCatalogOptionCorrection() {
  if (catalogSubmitting) return;
  const previousCorrection = pendingCatalogOptionCorrection;
  let correction = refreshPendingCatalogOptionCorrection();
  const directory = field(catalogForm(), 'selectedForDirectory') as HTMLInputElement | null;
  if (!correction && catalogSelection && directory) {
    const link = state?.links.find(({ resourceId }) => resourceId === catalogSelection?.id);
    if (link) {
      catalogDirectoryBaseline = link.selectedForDirectory;
      if (directory.checked !== link.selectedForDirectory) {
        correction = {
          resourceId: link.resourceId,
          placementId: link.placementId,
          selectedForDirectory: directory.checked,
        };
        pendingCatalogOptionCorrection = correction;
      }
    }
  }
  setCatalogSelectionLabel();
  if (correction) return;
  if (!previousCorrection) return;
  if (!hasPendingChanges()) catalogResetSelectionOnNextOpen = true;
  announce(statusFor('referencia'), 'La opción de la propuesta vuelve a coincidir con la que está guardada.', 'info');
}

function openCatalogCorrectionOptions(trigger: HTMLElement): boolean {
  const correction = refreshPendingCatalogOptionCorrection();
  if (!correction || !state?.profile || !dialog) return false;
  const link = state.links.find(({ placementId }) => placementId === correction.placementId);
  if (!link || link.resourceId !== correction.resourceId) {
    announce(statusFor('referencia'), 'La colocación ya no está disponible. Actualiza tu página antes de revisar sus opciones.', 'error');
    return false;
  }
  lastCatalogReferenceMessage = undefined;
  openLinkContext(trigger, correction);
  if (activeEditor !== 'enlace' || activeLinkContext?.kind !== 'placement'
    || activeLinkContext.placementId !== correction.placementId) return false;
  pendingCatalogOptionCorrection = undefined;
  activeCatalogCorrectionPlacementId = correction.placementId;
  const catalog = catalogForm();
  const directory = catalog && field(catalog, 'selectedForDirectory') as HTMLInputElement | null;
  if (catalogSelection?.id === correction.resourceId && directory) directory.checked = true;
  catalogSelectionBaseline = catalogSelectionKey();
  catalogDirectoryBaseline = directory?.checked ?? true;
  if (catalog) formState?.commit(capture(catalog));
  setCatalogSelectionLabel();
  announceWrite('enlace', 'La referencia ya está en tu página. Esta propuesta sigue sin guardar; confirma el cambio en las opciones de la colocación.', 'info');
  return true;
}

async function savePendingCatalogOptionCorrection() {
  const trigger = catalogControl<HTMLElement>('[data-catalog-correction-open]');
  const form = linkForm();
  if (!trigger || !form || !openCatalogCorrectionOptions(trigger)) return;
  await saveLinkForm(form);
}

function moveForm(): HTMLFormElement | null {
  return formFor('mover-enlace') ?? root?.querySelector<HTMLFormElement>('[data-link-move-form]') ?? null;
}

function movePositionInput(form: HTMLFormElement): HTMLInputElement | null {
  return form.querySelector<HTMLInputElement>('input[name="targetPosition"]');
}

function setMoveDescription(form: HTMLFormElement, link: CreatorLinkDTO) {
  const group = creatorOwnerLinkGroup(state?.links ?? [], link.featured);
  const currentIndex = group.findIndex(({ placementId }) => placementId === link.placementId);
  const input = movePositionInput(form);
  const context = form.querySelector<HTMLElement>('[data-link-move-context]');
  if (!input || !context || currentIndex < 0) return;
  const requested = Number(input.value);
  const groupName = link.featured ? 'Destacados' : 'Sin destacar';
  input.setAttribute('min', '1');
  input.setAttribute('max', String(group.length));
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > group.length) {
    context.textContent = `${groupName}: elige una posición del 1 al ${group.length}.`;
    return;
  }
  const withoutTarget = group.filter(({ placementId }) => placementId !== link.placementId);
  const insertionIndex = requested - 1;
  const previous = withoutTarget[insertionIndex - 1];
  const next = withoutTarget[insertionIndex];
  const neighbors = [
    previous ? `Después de «${previous.title}»` : 'Al inicio del grupo',
    next ? `Antes de «${next.title}»` : 'Al final del grupo',
  ];
  context.textContent = `${groupName}: posición ${requested} de ${group.length}. ${neighbors.join('. ')}.`;
}

function openMoveContext(trigger: HTMLElement) {
  if (!state?.profile || !dialog) return;
  const row = trigger.closest<HTMLElement>('[data-link-row]');
  const placementId = trigger.dataset.placementId || row?.dataset.linkRow;
  const link = state.links.find((item) => item.placementId === placementId);
  const form = moveForm();
  if (!link || !form) return;
  const group = creatorOwnerLinkGroup(state.links, link.featured);
  const index = group.findIndex(({ placementId: id }) => id === link.placementId);
  if (index < 0) return;
  moveContextRevision += 1;
  moveCompareGeneration += 1;
  moveComparisonData = undefined;
  activeMoveContext = { placementId: link.placementId };
  clearConflict(form);
  clearAnnouncement(statusFor('mover-enlace'));
  setHidden(form.querySelector('[data-link-move-suggestion-shell]'), true);
  const suggestion = form.querySelector<HTMLButtonElement>('[data-link-move-suggestion]');
  if (suggestion) delete suggestion.dataset.viablePosition;
  const input = movePositionInput(form);
  if (input) input.value = String(index + 1);
  setMoveDescription(form, link);
  formState?.commit(capture(form));
  showDialogForm(form, 'mover-enlace', `Mover enlace: ${link.title}`, trigger);
}

function openAddLink(trigger: HTMLElement) {
  if (!state?.profile || !dialog) return;
  const form = addLinkForm();
  if (!form) return;
  linkContextRevision += 1;
  linkCompareGeneration += 1;
  conflictLinkData = undefined;
  conflictLinkContextRevision = undefined;
  activeLinkContext = undefined;
  clearAnnouncement(statusFor('alta-enlace'));
  if (!activeForm || activeForm !== form) resetAddedLinkForm(form);
  formState?.commit(capture(form));
  showDialogForm(form, 'alta-enlace', 'Agregar enlace', trigger);
}

function reviewPendingSharedAddOptions(button: HTMLButtonElement) {
  const placementId = pendingSharedAddPlacementId;
  const link = placementId && state?.links.find(({ placementId: id }) => id === placementId);
  if (!placementId || !link) {
    announceWrite('alta-enlace', 'Ese enlace ya no está disponible en la lista. Conservamos tu corrección de alta.', 'error');
    return;
  }
  const row = [...(root?.querySelectorAll<HTMLElement>('[data-link-row]') ?? [])]
    .find((item) => item.dataset.linkRow === placementId);
  const trigger = row?.querySelector<HTMLElement>('[data-link-edit]') ?? document.createElement('button');
  if (!row) trigger.dataset.placementId = placementId;
  const openOptions = () => {
    const current = state?.links.find(({ placementId: id }) => id === placementId);
    if (!current) {
      announceWrite('alta-enlace', 'Ese enlace ya no está disponible en la lista. Conservamos tu corrección de alta.', 'error');
      return;
    }
    openLinkContext(trigger);
  };
  if (hasPendingChanges()) showExitPrompt(openOptions, button);
  else openOptions();
}

function currentLinksQuery(): CreatorOwnerLinksQuery {
  const params = new URL(window.location.href).searchParams;
  const parsed = parseCreatorOwnerLinksQuery(params, state?.series ?? []);
  return parsed.valid ? parsed.query : DEFAULT_CREATOR_OWNER_LINKS_QUERY;
}

function createLinkRow(link: CreatorLinkDTO): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.dataset.linkRow = link.placementId;
  const content = document.createElement('th');
  content.setAttribute('scope', 'row');
  const title = document.createElement('span');
  title.className = 'creator-owner__link-title';
  title.dataset.linkTitle = '';
  title.textContent = link.title;
  const host = document.createElement('span');
  host.className = 'creator-owner__link-url';
  try { host.textContent = new URL(link.url).host; } catch { host.textContent = link.url; }
  content.append(title, host);
  row.append(content);

  const seriesCell = document.createElement('td');
  seriesCell.dataset.label = 'Series';
  const names = link.series.map(({ seriesId }) => state?.series.find(({ id }) => id === seriesId)?.name).filter((name): name is string => Boolean(name));
  seriesCell.textContent = names.length ? names.join(', ') : 'Sin serie';
  row.append(seriesCell);

  const statusCell = document.createElement('td');
  statusCell.className = 'creator-owner__link-status';
  statusCell.dataset.label = 'Directorio';
  const statusValues = [
    link.selectedForDirectory ? 'Propuesta al directorio' : 'No propuesta',
    ({ pending: 'Pendiente', approved: 'Aprobado', revoked: 'Revocado' } as Record<string, string>)[link.directoryApproval] ?? 'Sin revisión',
  ];
  if (state?.profile?.hidden) statusValues.push('Página oculta por administración');
  else if (!state?.profile?.published) statusValues.push('Página no pública hasta publicar');
  if (link.hidden) statusValues.push('Ficha oculta en la página pública');
  else if (state?.profile?.published && !state.profile.hidden) statusValues.push('Visible en la página pública');
  statusValues.forEach((value) => { const item = document.createElement('span'); item.textContent = value; statusCell.append(item); });
  row.append(statusCell);

  const featured = document.createElement('td');
  featured.dataset.label = 'Destacado';
  featured.textContent = link.featured ? 'Destacado' : 'Sin destacar';
  row.append(featured);

  const actions = document.createElement('td');
  actions.className = 'creator-owner__link-actions';
  actions.dataset.label = 'Acciones';
  const edit = document.createElement('button');
  edit.className = 'button button--outline';
  edit.type = 'button';
  edit.dataset.linkEdit = '';
  edit.dataset.placementId = link.placementId;
  const ownsResource = state?.editableResources.some(({ id }) => id === link.resourceId) ?? false;
  edit.textContent = ownsResource ? 'Editar ficha' : 'Editar opciones';
  if (!ownsResource) {
    const request = document.createElement('button');
    request.className = 'button button--outline';
    request.type = 'button';
    request.dataset.claimOpen = '';
    request.dataset.placementId = link.placementId;
    request.dataset.resourceId = link.resourceId;
    request.dataset.url = link.url;
    request.setAttribute('aria-label', `Solicitar edición de ${link.title}`);
    request.textContent = 'Solicitar edición';
    actions.append(request);
  }
  const move = document.createElement('button');
  move.className = 'button button--outline';
  move.type = 'button';
  move.dataset.linkMove = '';
  move.dataset.placementId = link.placementId;
  move.setAttribute('aria-label', 'Mover a la posición');
  move.textContent = 'Mover a la posición…';
  const remove = document.createElement('button');
  remove.className = 'button button--outline';
  remove.type = 'button';
  remove.dataset.linkRemove = '';
  remove.dataset.placementId = link.placementId;
  remove.textContent = 'Quitar de tu página';
  actions.append(edit, move, remove);
  row.append(actions);
  return row;
}

function createRetainedRow(resource: CreatorEditableResourceDTO): HTMLLIElement {
  const row = document.createElement('li');
  row.dataset.retainedResource = resource.id;
  const summary = document.createElement('span');
  const title = document.createElement('strong');
  title.textContent = resource.title;
  const host = document.createElement('span');
  host.className = 'creator-owner__link-url';
  try { host.textContent = new URL(resource.url).host; } catch { host.textContent = resource.url; }
  summary.append(title, host);
  row.append(summary);
  const actions = document.createElement('div');
  actions.className = 'creator-owner__link-actions';
  const edit = document.createElement('button');
  edit.className = 'button button--outline';
  edit.type = 'button';
  edit.dataset.linkEdit = '';
  edit.dataset.resourceId = resource.id;
  edit.textContent = 'Editar ficha';
  const reinclude = document.createElement('button');
  reinclude.className = 'button button--outline';
  reinclude.type = 'button';
  reinclude.dataset.linkReinclude = '';
  reinclude.dataset.resourceId = resource.id;
  reinclude.dataset.resourceVersion = String(resource.version);
  reinclude.textContent = 'Volver a agregar';
  actions.append(edit, reinclude);
  row.append(actions);
  return row;
}

function renderOwnerLinks(query = currentLinksQuery()) {
  if (!root || !state) return undefined;
  const region = root.querySelector<HTMLElement>('[data-owner-links]');
  const table = region?.tagName === 'TABLE' ? region as HTMLTableElement : region?.querySelector<HTMLTableElement>('table');
  const body = table?.querySelector<HTMLTableSectionElement>('[data-link-rows]');
  if (!region || !table || !body) return undefined;
  const selected = selectCreatorOwnerLinks(state.links, state.series, query);
  const seriesFilter = region.querySelector<HTMLSelectElement>('select[name="serie"]');
  if (seriesFilter) {
    seriesFilter.querySelectorAll<HTMLOptionElement>('option').forEach((option) => option.remove());
    const allSeries = document.createElement('option');
    allSeries.value = 'todos';
    allSeries.textContent = 'Todas las series';
    seriesFilter.append(allSeries);
    state.series.forEach((series) => {
      const option = document.createElement('option');
      option.value = series.id;
      option.textContent = series.name;
      seriesFilter.append(option);
    });
    seriesFilter.value = selected.query.serie;
  }
  table.querySelectorAll<HTMLTableRowElement>('[data-link-row]').forEach((row) => row.remove());
  selected.rows.forEach((link) => body.append(createLinkRow(link)));
  const empty = region.querySelector<HTMLElement>('[data-link-empty]');
  if (empty) {
    empty.textContent = selected.totalMatches
      ? 'No hay enlaces en esta página de resultados.'
      : state.links.length ? 'No hay enlaces que coincidan con estos filtros.' : 'Todavía no agregaste enlaces.';
    setHidden(empty, selected.rows.length > 0);
  }
  const count = region.querySelector<HTMLElement>('[data-link-count]');
  if (count) count.textContent = creatorOwnerLinksCountLabel(selected.totalMatches, selected.totalLinks);
  const pager = region.querySelector<HTMLElement>('[data-link-pagination]');
  const label = pager?.querySelector<HTMLElement>('span');
  if (label) label.textContent = `Página ${selected.query.paginaEnlaces} de ${selected.pageCount}`;
  pager?.querySelectorAll<HTMLAnchorElement>('[data-link-page]').forEach((link) => link.remove());
  if (pager) {
    const addPageLink = (text: string, page: number) => {
      const link = document.createElement('a');
      link.className = 'button button--outline';
      link.dataset.linkPage = '';
      link.href = creatorOwnerLinksHref(selected.query, page);
      link.textContent = text;
      pager.append(link);
    };
    if (selected.query.paginaEnlaces > 1) addPageLink('Anterior', selected.query.paginaEnlaces - 1);
    if (selected.query.paginaEnlaces < selected.pageCount) addPageLink('Siguiente', selected.query.paginaEnlaces + 1);
  }

  const retainedSection = root.querySelector<HTMLElement>('[data-owner-retained-links]');
  const retainedList = retainedSection?.querySelector<HTMLElement>('[data-retained-resources]') ?? retainedSection;
  if (retainedList) {
    const existing = new Map([...retainedList.querySelectorAll<HTMLElement>('[data-retained-resource]')]
      .map((item) => [item.dataset.retainedResource ?? '', item]));
    const activeResources = new Set(state.links.map(({ resourceId }) => resourceId));
    const retained = state.editableResources.filter(({ id }) => !activeResources.has(id));
    const retainedIds = new Set(retained.map(({ id }) => id));
    existing.forEach((item, id) => {
      if (activeResources.has(id)) item.hidden = true;
      else if (!retainedIds.has(id)) item.remove();
    });
    retained.forEach((resource) => {
      const item = existing.get(resource.id) ?? createRetainedRow(resource);
      item.dataset.retainedResource = resource.id;
      const title = item.querySelector<HTMLElement>('strong');
      if (title) title.textContent = resource.title;
      const host = item.querySelector<HTMLElement>('.creator-owner__link-url');
      if (host) {
        try { host.textContent = new URL(resource.url).host; } catch { host.textContent = resource.url; }
      }
      const edit = item.querySelector<HTMLElement>('[data-link-edit]');
      if (edit) {
        edit.dataset.resourceId = resource.id;
        edit.textContent = 'Editar ficha';
      }
      const reinclude = item.querySelector<HTMLElement>('[data-link-reinclude]');
      if (reinclude) {
        reinclude.dataset.resourceId = resource.id;
        reinclude.dataset.resourceVersion = String(resource.version);
      }
      item.hidden = false;
      if (item.parentElement !== retainedList) retainedList.append(item);
    });
    setHidden(retainedSection, retained.length === 0);
  }
  return selected.query;
}

function renderOwnerLinksAfterCollectionChange() {
  const params = new URL(window.location.href).searchParams;
  const currentView = params.get('vista');
  if (currentView === 'enlaces' || currentView === null) {
    const seriesFilters = params.getAll('serie');
    const requestedSeries = seriesFilters.length === 1 ? seriesFilters[0] : undefined;
    if (requestedSeries && requestedSeries !== 'todos'
      && !state?.series.some(({ id }) => id === requestedSeries)) {
      params.set('serie', 'todos');
      const parsed = parseCreatorOwnerLinksQuery(params, state?.series ?? []);
      if (parsed.valid) return updateLinksQuery(parsed.query, 'replace');
    }
  }
  const current = currentLinksQuery();
  const effective = renderOwnerLinks(current);
  if (effective && effective.paginaEnlaces !== current.paginaEnlaces) updateLinksQuery(effective, 'replace');
  return effective;
}

function ownerLinkMatchesCurrentQuery(placementId: string): boolean {
  if (!state) return false;
  const query = currentLinksQuery();
  return selectCreatorOwnerLinks(state.links, state.series, query).matches
    .some((link) => link.placementId === placementId);
}

function updateLinksQuery(
  query: CreatorOwnerLinksQuery,
  historyMode: 'push' | 'replace' = 'push',
  restorePageFocus?: 'Anterior' | 'Siguiente',
) {
  const effectiveQuery = renderOwnerLinks(query) ?? query;
  const href = creatorOwnerLinksHref(effectiveQuery, effectiveQuery.paginaEnlaces);
  if (historyMode === 'push') {
    if (href !== `${window.location.pathname}${window.location.search}`) pushOwnerHistory(href);
  } else replaceOwnerHistory(href);
  const filterForm = root?.querySelector<HTMLFormElement>('[data-link-filters]');
  if (filterForm) {
    const page = field(filterForm, 'paginaEnlaces');
    if (page) page.value = String(effectiveQuery.paginaEnlaces);
    for (const name of ['buscar', 'serie', 'directorio', 'destacado', 'orden']) {
      const control = field(filterForm, name);
      if (control) control.value = effectiveQuery[name as 'buscar' | 'serie' | 'directorio' | 'destacado' | 'orden'];
    }
  }
  if (restorePageFocus) {
    const pageLinks = root?.querySelectorAll<HTMLAnchorElement>('[data-link-page]') ?? [];
    const target = [...pageLinks].find((link) => link.textContent?.trim() === restorePageFocus) ?? pageLinks[0];
    if (target) window.requestAnimationFrame(() => target.focus());
  }
  return effectiveQuery;
}

function restoreLinksFromLocation() {
  const parsed = parseCreatorOwnerLinksQuery(new URL(window.location.href).searchParams, state?.series ?? []);
  if (!parsed.valid) return;
  const effective = renderOwnerLinks(parsed.query);
  if (!effective) return;
  const filterForm = root?.querySelector<HTMLFormElement>('[data-link-filters]');
  if (filterForm) {
    for (const [name, value] of Object.entries(effective)) {
      const control = field(filterForm, name);
      if (control) control.value = String(value);
    }
  }
  if (effective.paginaEnlaces !== parsed.query.paginaEnlaces) {
    replaceOwnerHistory(creatorOwnerLinksHref(effective));
  }
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
  const publishCheck = root.querySelector<HTMLButtonElement>('[data-owner-publish-check]');
  const visible = profile.published && !profile.hidden;
  setHidden(publicLink, !visible);
  setAnchor(publicLink, visible ? canonicalUrl(profile) : undefined);
  setHidden(copyButton, !visible);
  if (copyButton) copyButton.dataset.url = visible ? canonicalUrl(profile) : '';
  setHidden(publishButton, Boolean(uncertainPublishIntent) || !(!profile.published && !profile.hidden));
  setHidden(publishCheck, !uncertainPublishIntent);

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
  renderOwnerLinksAfterCollectionChange();
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
      if (control) {
        control.value = profile.socials[key] ?? '';
        control.setCustomValidity?.('');
      }
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

function clearProfileConflict(form: HTMLFormElement | undefined) {
  profileCompareGeneration += 1;
  conflictProfile = undefined;
  conflictOwnerSnapshot = undefined;
  conflictProfileContext = undefined;
  const box = form?.querySelector<HTMLElement>('[data-owner-conflict]');
  setHidden(box, true);
  const comparison = box?.querySelector<HTMLElement>('[data-owner-comparison]');
  if (comparison) comparison.textContent = '';
  setHidden(comparison, true);
  setHidden(box?.querySelector('[data-owner-adopt]'), true);
}

function clearConflict(form: HTMLFormElement | undefined) {
  clearProfileConflict(form);
  conflictLinkData = undefined;
  conflictLinkContextRevision = undefined;
  linkCompareGeneration += 1;
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
  changes: Awaited<ReturnType<typeof readCreatorVersionChanges>>,
  current: CreatorProfileDTO | null,
  next: CreatorProfileDTO,
): boolean {
  if (changes === null) return false;
  if (current && current.id !== next.id) return false;
  const participants: CreatorOwnerReceiptParticipant[] = [current
    ? { entity: 'profile', id: current.id, before: current.version, transition: 'increment' }
    : { entity: 'profile', id: next.id, before: 0, transition: 'created-one', required: true }];
  if (!validateCreatorOwnerReceipts(changes, participants)) return false;
  const receipt = changes.find((change) => change.entity === 'profile' && change.id === next.id);
  if (current && !receipt && !sameProfileSnapshot(current, next)) return false;
  return next.version === (receipt?.after ?? current?.version);
}

function sameOptionalProfileField(
  left: CreatorProfileDTO,
  right: CreatorProfileDTO,
  fieldName: 'city' | 'country' | 'bio' | 'photo',
): boolean {
  return Object.hasOwn(left, fieldName) === Object.hasOwn(right, fieldName)
    && JSON.stringify(left[fieldName]) === JSON.stringify(right[fieldName]);
}

function sameProfileSnapshot(left: CreatorProfileDTO, right: CreatorProfileDTO): boolean {
  return left.id === right.id && left.displayName === right.displayName && left.slug === right.slug
    && sameOptionalProfileField(left, right, 'city') && sameOptionalProfileField(left, right, 'country')
    && sameOptionalProfileField(left, right, 'bio') && sameOptionalProfileField(left, right, 'photo')
    && JSON.stringify(left.programs) === JSON.stringify(right.programs)
    && JSON.stringify(left.socials) === JSON.stringify(right.socials)
    && left.published === right.published && left.hidden === right.hidden;
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
  ownerEditorRevision += 1;
  linkContextRevision += 1;
  linkCompareGeneration += 1;
  moveContextRevision += 1;
  moveCompareGeneration += 1;
  moveComparisonData = undefined;
  catalogComparisonGeneration += 1;
  catalogComparisonData = undefined;
  activeCatalogCorrectionPlacementId = undefined;
  if (!hasPendingChanges() && !sessionRecovery?.blocksWrites()) clearRecoveryNotice();
  if (activeEditor) clearConflict(formFor(activeEditor) ?? undefined);
  if (dialog?.open) dialog.close();
  setHidden(exitPrompt, true);
  if (activeEditor) {
    const form = formFor(activeEditor);
    if (form) form.hidden = true;
  }
  setHidden(catalogPanel(), true);
  activeEditor = undefined;
  activeLinkContext = undefined;
  activeMoveContext = undefined;
  if (activeForm !== formFor('crear')) activeForm = undefined;
  clearConflict(undefined);
  const focus = returnFocus;
  returnFocus = undefined;
  const fallbackFocus = root?.querySelector<HTMLElement>('[data-link-search]');
  if (focus && focus.isConnected) window.requestAnimationFrame(() => focus.focus());
  else if (fallbackFocus) window.requestAnimationFrame(() => fallbackFocus.focus());
  if (navigate) runPendingExitAction();
}

function hasPendingChanges(): boolean {
  if (activeEditor === 'reclamacion' && activeForm === claimForm()) {
    const form = activeForm;
    return claimSelectionSignature() !== claimSelectionBaseline
      || (field(form, 'knownUrls')?.value ?? '') !== claimUrlsBaseline
      || (field(form, 'evidence')?.value ?? '') !== claimEvidenceBaseline
      || claimStalePairs.size > 0 || claimNeedsRefresh;
  }
  if (activeEditor !== 'referencia' || activeForm !== catalogForm()) return formState?.hasPendingChanges() ?? false;
  const directory = field(activeForm, 'selectedForDirectory') as HTMLInputElement | null;
  return catalogConflictKind !== undefined
    || catalogNeedsRefresh
    || !catalogSelectionCurrent
    || pendingCatalogOptionCorrection !== undefined
    || !sameCatalogSelection(catalogSelectionKey(), catalogSelectionBaseline)
    || (directory?.checked ?? true) !== catalogDirectoryBaseline;
}

function showExitPrompt(afterExit?: () => void, trigger?: HTMLElement) {
  if (writeGuard?.isActive()) {
    announceWrite(activeEditor, OWNER_ACTIVE_WRITE_EXIT_MESSAGE, 'info');
    return;
  }
  if (afterExit !== undefined) {
    if (pendingOwnerHistoryNavigation) pendingOwnerHistoryNavigation = undefined;
    pendingExitAction = afterExit;
  } else if (!pendingOwnerHistoryNavigation) pendingExitAction = undefined;
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
    createFormRevision += 1;
    profileCompareGeneration += 1;
    clearConflict(form);
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
    photoUploadFile = undefined;
    setHidden(form.querySelector('[data-owner-check-photo]'), true);
  } else if (name === 'enlace') {
    const context = activeLinkContext;
    if (context?.kind === 'placement') {
      const link = state?.links.find(({ placementId }) => placementId === context.placementId);
      if (link) {
        const resource = state?.editableResources.find(({ id }) => id === link.resourceId);
        setLinkFormValues(form, link, resource ? 'placement-own' : 'placement-shared');
      }
    } else if (context?.kind === 'resource') {
      const resource = state?.editableResources.find(({ id }) => id === context.resourceId);
      if (resource) setLinkFormValues(form, resource, 'resource');
    }
  } else if (name === 'alta-enlace') {
    resetAddedLinkForm(form);
  } else if (name === 'referencia') {
    resetCatalogReference(form);
  } else if (name === 'reclamacion') {
    resetClaimIntent(form);
  } else if (name === 'mover-enlace') {
    const target = activeMoveContext && state?.links.find(({ placementId }) => placementId === activeMoveContext?.placementId);
    const group = target ? creatorOwnerLinkGroup(state?.links ?? [], target.featured) : [];
    const input = movePositionInput(form);
    const currentIndex = target ? group.findIndex(({ placementId }) => placementId === target.placementId) : -1;
    if (input && currentIndex >= 0) input.value = String(currentIndex + 1);
    if (target) setMoveDescription(form, target);
    setHidden(form.querySelector('[data-link-move-suggestion-shell]'), true);
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
  linkContextRevision += 1;
  linkCompareGeneration += 1;
  activeLinkContext = undefined;
  conflictLinkData = undefined;
  conflictLinkContextRevision = undefined;
  clearAnnouncement(statusFor(name));
  clearAnnouncement(pageStatus);
  const title = root?.querySelector<HTMLElement>('[data-owner-dialog-title]');
  if (title) title.textContent = name === 'datos' ? 'Editar datos' : name === 'redes' ? 'Editar redes' : 'Editar foto';
  for (const other of ['datos', 'redes', 'foto', 'enlace'] as const) {
    const unit = formFor(other);
    if (unit) clearConflict(unit);
  }
  setHidden(exitPrompt, true);
  setHidden(root?.querySelector('[data-owner-check-photo]'), true);
  if (name !== 'foto') setFormFromProfile(form, name, state.profile);
  formState?.commit(capture(form));
  showDialogForm(form, name, name === 'datos' ? 'Editar datos' : name === 'redes' ? 'Editar redes' : 'Editar foto', trigger);
}

function updateProfileState(profile: CreatorProfileDTO) {
  if (!state) return;
  if (uncertainPublishIntent?.profileId === profile.id) clearUncertainPublication();
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
      const value = normalizeCreatorText(String(data.get(`social-${key}`) ?? ''));
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
      displayName: normalizeCreatorText(String(data.get('displayName') ?? '')),
      slug: normalizeCreatorText(String(data.get('slug') ?? '')),
      city: normalizeCreatorText(String(data.get('city') ?? '')),
      country: normalizeCreatorText(String(data.get('country') ?? '')),
      programs: data.getAll('programs').map(String),
      bio: normalizeCreatorText(String(data.get('bio') ?? '')),
      ...(profile ? { version: profile.version } : {}),
    };
  } else {
    body = {
      displayName: normalizeCreatorText(String(data.get('displayName') ?? '')),
      slug: normalizeCreatorText(String(data.get('slug') ?? '')),
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
    const payloadMatches = (name === 'redes'
      ? profile !== null && next.displayName === profile.displayName && next.slug === profile.slug
      : next.displayName === body.displayName && next.slug === body.slug)
      && (profile === null || (name === 'crear'
        ? true
        : name === 'datos'
          ? next.city === body.city && next.country === body.country
            && JSON.stringify(next.programs) === JSON.stringify(body.programs) && next.bio === body.bio
            && JSON.stringify(next.socials) === JSON.stringify(profile.socials)
            && JSON.stringify(next.photo) === JSON.stringify(profile.photo)
            && next.published === profile.published && next.hidden === profile.hidden
          : JSON.stringify(next.socials) === JSON.stringify(body.socials)
            && next.city === profile.city && next.country === profile.country
            && JSON.stringify(next.programs) === JSON.stringify(profile.programs) && next.bio === profile.bio
            && JSON.stringify(next.photo) === JSON.stringify(profile.photo)
            && next.published === profile.published && next.hidden === profile.hidden));
    if (response.status !== 200 || !payloadMatches || !validateReceipt(changes, profile, next)) {
      setHidden(form.querySelector('[data-owner-conflict]'), false);
      const copy = form.querySelector<HTMLElement>('[data-owner-conflict-copy]');
      if (copy) copy.textContent = 'La solicitud respondió sin un recibo que podamos verificar. Compara el estado guardado antes de volver a intentar.';
      announceWrite(name, 'El servicio respondió sin un recibo de versión válido. Conservamos tu edición y no adoptamos un estado que no pudimos comprobar.', 'error');
      return;
    }
    const unchanged = submitWasUnchanged(snapshot);
    if (name === 'crear') createFormRevision += 1;
    clearProfileConflict(form);
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

function showLinkConflict(form: HTMLFormElement, message = 'El enlace cambió desde que abriste esta edición. Compara lo guardado con tu corrección antes de decidir cómo seguir.') {
  const conflict = form.querySelector<HTMLElement>('[data-link-conflict]');
  setHidden(conflict, false);
  const copy = conflict?.querySelector<HTMLElement>('[data-owner-conflict-copy]');
  if (copy) copy.textContent = message;
  announceWrite('enlace', statusMessage(409), 'error');
}

function moveComparisonIsCurrent(
  form: HTMLFormElement,
  placementId: string,
  revision: number,
  generation: number,
): boolean {
  return generation === moveCompareGeneration
    && revision === moveContextRevision
    && activeForm === form
    && activeEditor === 'mover-enlace'
    && !form.hidden
    && activeMoveContext?.placementId === placementId;
}

function showMoveConflict(form: HTMLFormElement, message = 'El orden cambió desde que abriste este movimiento. Compara el orden guardado con tu destino antes de decidir cómo seguir.') {
  const conflict = form.querySelector<HTMLElement>('[data-owner-conflict]');
  setHidden(conflict, false);
  const copy = conflict?.querySelector<HTMLElement>('[data-owner-conflict-copy]');
  if (copy) copy.textContent = message;
  setHidden(conflict?.querySelector('[data-owner-comparison]'), true);
  setHidden(conflict?.querySelector('[data-owner-adopt]'), true);
  moveComparisonData = undefined;
  announceWrite('mover-enlace', 'El orden guardado cambió desde que abriste este movimiento. Compara antes de elegir cómo seguir.', 'error');
}

async function compareSavedMove(form: HTMLFormElement) {
  const context = activeMoveContext;
  const profileId = state?.profile?.id;
  if (!context || !profileId) return;
  const revision = moveContextRevision;
  const generation = ++moveCompareGeneration;
  announceWrite('mover-enlace', 'Consultando el orden guardado…', 'info');
  try {
    const response = await readOwnerSnapshot();
    if (response.status === 401) await sessionRecovery?.observeWriteResponse(response);
    if (!moveComparisonIsCurrent(form, context.placementId, revision, generation)) return;
    if (!response.ok) {
      announceWrite('mover-enlace', response.status === 401 ? sessionRecovery?.writeFailureMessage() ?? statusMessage(401) : 'No pudimos leer el orden guardado. Tu destino sigue aquí.', 'error');
      return;
    }
    const payload = await responsePayload(response);
    if (!moveComparisonIsCurrent(form, context.placementId, revision, generation)) return;
    if (!payload || !isOwnerData(payload) || payload.profile?.id !== profileId) {
      announceWrite('mover-enlace', 'No pudimos confirmar que la respuesta corresponde a esta página. Conservamos tu destino.', 'error');
      return;
    }
    const target = payload.links.find(({ placementId }) => placementId === context.placementId);
    if (!target) {
      announceWrite('mover-enlace', 'Este enlace ya no está en la página. Conservamos tu destino para que decidas cómo seguir.', 'error');
      return;
    }
    const savedGroup = creatorOwnerLinkGroup(payload.links, target.featured);
    const savedOrdinal = savedGroup.findIndex(({ placementId }) => placementId === target.placementId) + 1;
    const requested = movePositionInput(form)?.value ?? '';
    const order = savedGroup.map((link, index) => `${index + 1}. ${link.title}${link.hidden ? ' (oculto)' : ''}`).join('\n');
    const comparison = form.querySelector<HTMLElement>('[data-owner-comparison]');
    if (comparison) comparison.textContent = `Grupo guardado: ${target.featured ? 'Destacados' : 'Sin destacar'} (${savedGroup.length} enlaces).\nPosición guardada: ${savedOrdinal}. Tu destino: ${requested || '—'}.\nOrden guardado:\n${order}`;
    setHidden(comparison, false);
    setHidden(form.querySelector('[data-owner-adopt]'), false);
    moveComparisonData = payload;
    announceWrite('mover-enlace', 'Compara el orden y elige expresamente si quieres usar las versiones guardadas.', 'info');
  } catch {
    if (moveComparisonIsCurrent(form, context.placementId, revision, generation)) {
      announceWrite('mover-enlace', 'No pudimos conectar para leer el orden guardado. Tu destino sigue aquí.', 'error');
    }
  }
}

function adoptSavedMove(form: HTMLFormElement) {
  const context = activeMoveContext;
  const adopted = moveComparisonData;
  if (!context || !adopted || activeEditor !== 'mover-enlace' || activeForm !== form || form.hidden
    || !state?.profile || adopted.profile?.id !== state.profile.id) return;
  if (!adopted.links.some(({ placementId }) => placementId === context.placementId)) return;
  const targetPositionInput = movePositionInput(form);
  const requested = targetPositionInput?.value;
  adoptOwnerSnapshot(adopted, form);
  if (targetPositionInput && requested !== undefined) targetPositionInput.value = requested;
  const target = state.links.find(({ placementId }) => placementId === context.placementId);
  if (target) setMoveDescription(form, target);
  restoreMoveFocus(context.placementId);
  clearConflict(form);
  moveComparisonData = undefined;
  announceWrite('mover-enlace', 'Adoptaste expresamente el orden y las versiones guardadas. Tu destino sigue en el formulario para que decidas si quieres guardarlo.', 'success');
}

function updateEditableResourceFromLink(next: CreatorLinkDTO) {
  if (!state) return;
  const resourceIndex = state.editableResources.findIndex(({ id }) => id === next.resourceId);
  // A reference DTO alone does not grant edit authority.
  if (resourceIndex < 0) return;
  const current = state.editableResources[resourceIndex];
  const { description: _description, ...withoutDescription } = current;
  state.editableResources[resourceIndex] = {
    ...withoutDescription,
    title: next.title,
    url: next.url,
    ...(Object.hasOwn(next, 'description') ? { description: next.description } : {}),
    version: next.resourceVersion,
  };
}

function keepEditableResourceObservation(next: CreatorLinkDTO): CreatorLinkDTO {
  const resource = state?.editableResources.find(({ id }) => id === next.resourceId);
  if (!resource) return next;
  const { description: _description, ...withoutDescription } = next;
  return {
    ...withoutDescription,
    title: resource.title,
    url: resource.url,
    ...(Object.hasOwn(resource, 'description') ? { description: resource.description } : {}),
    resourceVersion: resource.version,
  };
}

function updateLinkState(next: CreatorLinkDTO, profileVersion: number) {
  if (!state?.profile) return;
  placementIdByResource.set(next.resourceId, next.placementId);
  state.links = state.links.map((link) => link.placementId === next.placementId ? next : link);
  updateEditableResourceFromLink(next);
  state.profile = { ...state.profile, version: profileVersion };
  root?.setAttribute('data-profile-version', String(profileVersion));
  renderOwnerLinksAfterCollectionChange();
}

function restoreLinkFocus(context: typeof activeLinkContext) {
  if (context?.kind === 'placement') {
    const rows = root?.querySelectorAll<HTMLElement>('[data-link-row]') ?? [];
    const row = [...rows].find((item) => item.dataset.linkRow === context.placementId);
    const edit = row?.querySelector<HTMLElement>('[data-link-edit]');
    returnFocus = edit ?? root?.querySelector<HTMLElement>('[data-link-search]') ?? undefined;
  } else returnFocus = root?.querySelector<HTMLElement>('[data-link-search]') ?? undefined;
}

async function saveLinkForm(form: HTMLFormElement) {
  if (!state?.profile || !activeLinkContext) {
    announceWrite('enlace', 'Vuelve a abrir el enlace para cargar sus versiones actuales.', 'error');
    return;
  }
  const context = activeLinkContext;
  linkCompareGeneration += 1;
  conflictLinkData = undefined;
  conflictLinkContextRevision = undefined;
  const snapshot = capture(form);
  const data = new FormData(form);
  const title = normalizeCreatorText(String(data.get('title') ?? ''));
  const url = normalizeCreatorText(String(data.get('url') ?? ''));
  const description = normalizeCreatorText(String(data.get('description') ?? ''));
  if (!form.reportValidity()) return;
  form.setAttribute('aria-busy', 'true');
  try {
    if (context.kind === 'resource') {
      const current = state.editableResources.find(({ id }) => id === context.resourceId);
      if (!current || state.links.some((link) => link.resourceId === context.resourceId)) {
        announceWrite('enlace', 'La ficha ya no está retirada. Actualiza la página antes de editarla.', 'error');
        return;
      }
      const descriptionChanged = description !== (current.description ?? '');
      const body = {
        title,
        url,
        ...(descriptionChanged ? { description } : {}),
        version: current.version,
      };
      const response = await jsonRequest(`/api/creador/recursos/${encodeURIComponent(current.id)}`, 'PATCH', body);
      if (!response.ok) {
        if (response.status === 409) showLinkConflict(form);
        else announceWrite('enlace', statusMessage(response.status), 'error');
        return;
      }
      const payload = await responsePayload(response);
      const changes = await readCreatorVersionChanges(response);
      const resource = payload?.resource;
      const receiptValid = validateCreatorOwnerReceipts(changes, [
        { entity: 'resource', id: current.id, before: current.version, transition: 'increment' },
      ]);
      const receipt = changes?.find((change) => change.entity === 'resource' && change.id === current.id);
      const descriptionPresent = descriptionChanged || Object.hasOwn(current, 'description');
      const expectedDescription = descriptionChanged ? description : current.description;
      if (response.status !== 200 || !isEditableResource(resource) || resource.id !== current.id || !receiptValid
        || resource.title !== title || resource.url !== url
        || Object.hasOwn(resource, 'description') !== descriptionPresent || resource.description !== expectedDescription
        || resource.version !== (receipt?.after ?? current.version)
        || (!receipt && (resource.title !== current.title || resource.url !== current.url
          || Object.hasOwn(resource, 'description') !== Object.hasOwn(current, 'description')
          || resource.description !== current.description))) {
        showLinkConflict(form, 'La respuesta no trae una versión verificable de la ficha. Conservamos tu edición y no la marcamos como guardada.');
        announceWrite('enlace', 'No pudimos comprobar el recibo de la ficha. Conservamos tu edición para revisarla.', 'error');
        return;
      }
      state.editableResources = state.editableResources.map((item) => item.id === current.id ? resource : item);
      renderOwnerLinks();
      clearRecoveryNotice();
      const unchanged = submitWasUnchanged(snapshot);
      if (unchanged) {
        setLinkFormValues(form, resource, 'resource');
        restoreLinkFocus(context);
        announceWrite('enlace', 'Ficha guardada.', 'success');
      } else announceWrite('enlace', 'Ficha guardada. Conservamos la corrección que escribiste mientras se guardaba; revísala antes de seguir.', 'success');
      maybeExitAfterSave(unchanged);
      return;
    }

    const current = state.links.find(({ placementId }) => placementId === context.placementId);
    if (!current) {
      announceWrite('enlace', 'Este enlace ya no está en tu página. Actualiza la lista antes de guardarlo.', 'error');
      return;
    }
    const profileAtSubmit = state.profile;
    if (typeof current.placementVersion !== 'number' || !Number.isSafeInteger(current.placementVersion) || current.placementVersion < 0) {
      announceWrite('enlace', 'Vuelve a abrir el enlace para cargar sus versiones actuales.', 'error');
      return;
    }
    const canEditMetadata = state.editableResources.some(({ id }) => id === current.resourceId);
    const featured = Boolean((field(form, 'featured') as HTMLInputElement | null)?.checked);
    const selectedForDirectory = Boolean((field(form, 'selectedForDirectory') as HTMLInputElement | null)?.checked);
    const metadataChanges: Partial<Record<'title' | 'url' | 'description', string>> = {};
    if (canEditMetadata) {
      if (title !== current.title) metadataChanges.title = title;
      if (url !== current.url) metadataChanges.url = url;
      if (description !== (current.description ?? '')) metadataChanges.description = description;
    }
    const body: Record<string, unknown> = {
      profileVersion: profileAtSubmit.version,
      placementVersion: current.placementVersion,
      resourceVersion: current.resourceVersion,
      ...metadataChanges,
      featured,
      selectedForDirectory,
    };
    const response = await jsonRequest(`/api/creador/enlaces/${encodeURIComponent(current.placementId)}/editar`, 'PATCH', body);
    if (!response.ok) {
      if (response.status === 409) showLinkConflict(form);
      else announceWrite('enlace', statusMessage(response.status), 'error');
      return;
    }
    const payload = await responsePayload(response);
    const changes = await readCreatorVersionChanges(response);
    const next = payload?.link;
    const profileVersion = profileAtSubmit.version;
    const placementVersion = current.placementVersion;
    const allowedReceipts: CreatorOwnerReceiptParticipant[] = [
      { entity: 'profile', id: profileAtSubmit.id, before: profileVersion, transition: 'increment' },
      { entity: 'placement', id: current.placementId, before: placementVersion, transition: 'increment' },
      ...(canEditMetadata ? [{ entity: 'resource' as const, id: current.resourceId, before: current.resourceVersion, transition: 'increment' as const }] : []),
    ];
    const receiptsValid = validateCreatorOwnerReceipts(changes, allowedReceipts);
    const profileReceipt = changes?.find((change) => change.entity === 'profile' && change.id === profileAtSubmit.id);
    const resourceReceipt = changes?.find((change) => change.entity === 'resource' && change.id === current.resourceId);
    const placementReceipt = changes?.find((change) => change.entity === 'placement' && change.id === current.placementId);
    const expectedTitle = Object.hasOwn(metadataChanges, 'title') ? metadataChanges.title : current.title;
    const expectedUrl = Object.hasOwn(metadataChanges, 'url') ? metadataChanges.url : current.url;
    const descriptionWasChanged = Object.hasOwn(metadataChanges, 'description');
    const expectedDescriptionPresent = descriptionWasChanged || Object.hasOwn(current, 'description');
    const expectedDescription = descriptionWasChanged ? metadataChanges.description : current.description;
    const anyRecordReceipt = Boolean(resourceReceipt || placementReceipt);
    const compatible = response.status === 200 && receiptsValid && Boolean(profileReceipt) === anyRecordReceipt
      && isCreatorLink(next)
      && next.placementId === current.placementId && next.resourceId === current.resourceId
      && next.title === expectedTitle
      && next.url === expectedUrl
      && Object.hasOwn(next, 'description') === expectedDescriptionPresent
      && next.description === expectedDescription
      && next.featured === featured && next.selectedForDirectory === selectedForDirectory
      && next.resourceVersion === (resourceReceipt?.after ?? current.resourceVersion)
      && next.placementVersion === (placementReceipt?.after ?? placementVersion)
      && (resourceReceipt !== undefined || (next.title === current.title && next.url === current.url
        && Object.hasOwn(next, 'description') === Object.hasOwn(current, 'description')
        && next.description === current.description))
      && (placementReceipt !== undefined || (next.featured === current.featured
        && next.selectedForDirectory === current.selectedForDirectory))
      && next.position === current.position && next.hidden === current.hidden
      && next.directoryApproval === current.directoryApproval
      && JSON.stringify(next.series) === JSON.stringify(current.series)
      ;
    if (!payload || !compatible) {
      showLinkConflict(form, 'La respuesta no corresponde a las versiones observadas o a esta edición. Conservamos tu corrección y no adoptamos un estado que no pudimos comprobar.');
      announceWrite('enlace', 'No pudimos comprobar el recibo de versión del enlace. Conservamos tu edición para revisarla.', 'error');
      return;
    }
    const changed = Boolean(profileReceipt);
    const nextProfileVersion = profileReceipt?.after ?? state.profile.version;
    updateLinkState(next, nextProfileVersion);
    const matchesCurrentQuery = ownerLinkMatchesCurrentQuery(next.placementId);
    clearRecoveryNotice();
    const unchanged = submitWasUnchanged(snapshot);
    if (unchanged && changed && activeCatalogCorrectionPlacementId === current.placementId) {
      catalogResetSelectionOnNextOpen = true;
      activeCatalogCorrectionPlacementId = undefined;
    }
    if (unchanged) {
      setLinkFormValues(form, next, canEditMetadata ? 'placement-own' : 'placement-shared');
      restoreLinkFocus(context);
      announceWrite('enlace', matchesCurrentQuery
        ? 'Cambios guardados.'
        : 'Cambios guardados. El enlace ya no coincide con los filtros actuales.', 'success');
    } else announceWrite('enlace', `Cambios guardados. Conservamos la corrección que escribiste durante el guardado; revísala antes de volver a guardar.${matchesCurrentQuery ? '' : ' El enlace guardado ya no coincide con los filtros actuales.'}`, 'success');
    maybeExitAfterSave(unchanged);
  } catch {
    announceWrite('enlace', 'No pudimos confirmar la respuesta del servicio. La edición sigue abierta; comprueba el estado antes de volver a guardar.', 'error');
  } finally {
    form.removeAttribute('aria-busy');
  }
}

function restoreMoveFocus(placementId: string) {
  const row = [...(root?.querySelectorAll<HTMLElement>('[data-link-row]') ?? [])]
    .find((item) => item.dataset.linkRow === placementId);
  returnFocus = row?.querySelector<HTMLElement>('[data-link-move]')
    ?? root?.querySelector<HTMLElement>('[data-link-search]')
    ?? undefined;
}

async function saveMoveForm(form: HTMLFormElement) {
  const context = activeMoveContext;
  const ownerState = state;
  const profile = ownerState?.profile;
  const targetPositionInput = movePositionInput(form);
  const target = context && ownerState?.links.find(({ placementId }) => placementId === context.placementId);
  const targetPlacementVersion = target?.placementVersion;
  if (!ownerState || !profile || !target || !targetPositionInput
    || typeof targetPlacementVersion !== 'number' || !Number.isSafeInteger(targetPlacementVersion) || targetPlacementVersion < 0) {
    announceWrite('mover-enlace', 'Vuelve a abrir el enlace para cargar el orden y sus versiones actuales.', 'error');
    return;
  }
  const group = creatorOwnerLinkGroup(ownerState.links, target.featured);
  const targetPosition = Number(targetPositionInput.value);
  if (!form.reportValidity() || !Number.isSafeInteger(targetPosition)
    || targetPosition < 1 || targetPosition > group.length) return;

  moveCompareGeneration += 1;
  moveComparisonData = undefined;
  const snapshot = capture(form);
  setHidden(form.querySelector('[data-link-move-suggestion-shell]'), true);
  form.setAttribute('aria-busy', 'true');
  try {
    const response = await jsonRequest(`/api/creador/enlaces/${encodeURIComponent(target.placementId)}/mover`, 'POST', {
      profileVersion: profile.version,
      placementVersion: targetPlacementVersion,
      targetPosition,
    });
    if (!response.ok) {
      if (response.status === 409) {
        showMoveConflict(form);
      } else if (response.status === 422) {
        const payload = await responsePayload(response);
        const viablePosition = payload?.error === 'ORDER_MOVE_LIMIT' && Number.isSafeInteger(payload.viablePosition)
          ? Number(payload.viablePosition)
          : undefined;
        const currentGroup = creatorOwnerLinkGroup(ownerState.links, target.featured);
        const currentIndex = currentGroup.findIndex(({ placementId }) => placementId === target.placementId);
        const towardRequested = viablePosition !== undefined && currentIndex >= 0
          && viablePosition >= 1 && viablePosition <= currentGroup.length
          && viablePosition !== currentIndex + 1
          && Math.abs(viablePosition - (currentIndex + 1)) < Math.abs(targetPosition - (currentIndex + 1));
        const suggestionShell = form.querySelector<HTMLElement>('[data-link-move-suggestion-shell]');
        const suggestion = form.querySelector<HTMLButtonElement>('[data-link-move-suggestion]');
        if (towardRequested && suggestion && suggestionShell) {
          suggestion.dataset.viablePosition = String(viablePosition);
          suggestion.textContent = `Usar posición intermedia ${viablePosition}`;
          setHidden(suggestionShell, false);
        }
        announceWrite('mover-enlace', payload?.error === 'ORDER_MOVE_LIMIT'
          ? 'Ese movimiento supera el límite de una sola operación. Conservamos el destino solicitado; puedes elegir una posición intermedia y guardar de nuevo.'
          : statusMessage(422), 'error');
      } else if (await isOrderMoveCalculationUnavailable(response)) {
        announceWrite('mover-enlace', 'No pudimos calcular este movimiento', 'error');
      } else announceWrite('mover-enlace', statusMessage(response.status), 'error');
      return;
    }

    const payload = await responsePayload(response);
    const changes = await readCreatorVersionChanges(response);
    const rawLinks = payload?.links;
    const candidates = Array.isArray(rawLinks) && rawLinks.every(isCreatorLink) ? rawLinks : undefined;
    const byId = new Map((candidates ?? []).map((link) => [link.placementId, link]));
    const nextTarget = byId.get(target.placementId);
    const groupIds = new Set(group.map(({ placementId }) => placementId));
    const candidateSetMatches = candidates !== undefined && byId.size === candidates.length
      && byId.has(target.placementId) && [...byId.keys()].every((id) => groupIds.has(id));
    const allowedReceipts: CreatorOwnerReceiptParticipant[] = [
      { entity: 'profile', id: profile.id, before: profile.version, transition: 'increment' },
      ...[...byId.keys()].flatMap((id) => {
        const current = ownerState.links.find(({ placementId }) => placementId === id);
        return current && typeof current.placementVersion === 'number'
          ? [{ entity: 'placement' as const, id, before: current.placementVersion, transition: 'increment' as const }]
          : [];
      }),
    ];
    const receiptsValid = validateCreatorOwnerReceipts(changes, allowedReceipts);
    const profileReceipt = changes?.find((change) => change.entity === 'profile' && change.id === profile.id);
    const placementReceipts = changes?.filter((change) => change.entity === 'placement') ?? [];
    const groupCandidatesValid = [...byId.values()].every((candidate) => {
      const current = ownerState.links.find(({ placementId }) => placementId === candidate.placementId);
      const placementReceipt = changes?.find((change) => change.entity === 'placement' && change.id === candidate.placementId);
      return current !== undefined && typeof current.placementVersion === 'number'
        && Number.isSafeInteger(current.placementVersion) && current.placementVersion >= 0
        && candidate.resourceId === current.resourceId
        && candidate.featured === current.featured
        && candidate.position >= 0
        && (candidate.position === current.position || placementReceipt !== undefined)
        && candidate.series.length === current.series.length
        && JSON.stringify(candidate.series) === JSON.stringify(current.series)
        && candidate.placementVersion === (placementReceipt?.after ?? current.placementVersion);
    });
    const resultingGroup = group.map((link) => {
      const candidate = byId.get(link.placementId);
      return candidate ? { ...link, position: candidate.position } : link;
    }).sort((left, right) => left.position - right.position || left.placementId.localeCompare(right.placementId));
    const resultingOrdinal = resultingGroup.findIndex(({ placementId }) => placementId === target.placementId) + 1;
    const valid = response.status === 200 && payload !== null && Array.isArray(rawLinks)
      && isCreatorLink(nextTarget) && candidateSetMatches && groupCandidatesValid
      && resultingOrdinal === targetPosition && receiptsValid
      && Boolean(profileReceipt) === (placementReceipts.length > 0);
    if (!valid) {
      showMoveConflict(form, 'La respuesta no coincide con el orden o las versiones observadas. Conservamos el destino y no adoptamos datos sin confirmar.');
      announceWrite('mover-enlace', 'No pudimos comprobar el recibo del movimiento. Conservamos tu destino para revisarlo antes de volver a guardar.', 'error');
      return;
    }

    const changedById = new Map([...byId.values()].map((candidate) => [candidate.placementId, candidate]));
    ownerState.links = ownerState.links.map((current) => {
      const candidate = changedById.get(current.placementId);
      return candidate
        ? { ...current, position: candidate.position, placementVersion: candidate.placementVersion }
        : current;
    });
    const nextProfileVersion = profileReceipt?.after ?? profile.version;
    ownerState.profile = { ...profile, version: nextProfileVersion };
    root?.setAttribute('data-profile-version', String(nextProfileVersion));
    renderOwnerLinks();
    const updatedTarget = ownerState.links.find(({ placementId }) => placementId === target.placementId);
    if (updatedTarget) setMoveDescription(form, updatedTarget);
    restoreMoveFocus(target.placementId);
    clearConflict(form);
    clearRecoveryNotice();
    const unchanged = submitWasUnchanged(snapshot);
    if (unchanged) {
      announceWrite('mover-enlace', placementReceipts.length ? 'Orden guardado.' : 'Ese enlace ya estaba en esa posición.', 'success');
    } else announceWrite('mover-enlace', 'Orden guardado. Conservamos el destino que cambiaste mientras se guardaba; revísalo antes de volver a guardar.', 'success');
    maybeExitAfterSave(unchanged);
  } catch {
    announceWrite('mover-enlace', 'No pudimos confirmar la respuesta del servicio. El formulario conserva el destino; comprueba el orden antes de volver a guardar.', 'error');
  } finally {
    form.removeAttribute('aria-busy');
  }
}

async function reconcileOwnerData(canAdopt?: () => boolean): Promise<boolean> {
  const editorRevision = ownerEditorRevision;
  const writeRevision = ownerWriteRevision;
  const formAtReadStart = activeForm;
  const editorAtReadStart = activeEditor;
  const addLinkFormAtReadStart = formAtReadStart?.dataset.ownerForm === 'alta-enlace'
    && editorAtReadStart === 'alta-enlace';
  const catalogFormAtReadStart = formAtReadStart === catalogForm() && editorAtReadStart === 'referencia';
  const canAdoptCurrentContext = () => ownerEditorRevision === editorRevision
    && ownerWriteRevision === writeRevision
    && (addLinkFormAtReadStart || catalogFormAtReadStart
      ? activeForm === formAtReadStart && activeEditor === editorAtReadStart
      : formAtReadStart === undefined && editorAtReadStart === undefined
        && activeForm === undefined && activeEditor === undefined
        && !(formState?.hasPendingChanges() ?? false));
  try {
    const response = await readOwnerSnapshot();
    if (response.status === 401) await sessionRecovery?.observeWriteResponse(response);
    if (!response.ok) return false;
    const payload = await responsePayload(response);
    if (!payload || !isOwnerData(payload) || !state?.profile || payload.profile?.id !== state.profile.id) return false;
    if (!canAdoptCurrentContext() || (canAdopt && !canAdopt())) return false;
    state.profile = payload.profile;
    state.links = payload.links;
    state.editableResources = payload.editableResources;
    state.series = payload.series;
    payload.links.forEach(({ resourceId, placementId }) => placementIdByResource.set(resourceId, placementId));
    updateProfileView();
    renderOwnerLinksAfterCollectionChange();
    return true;
  } catch {
    return false;
  }
}

function adoptOwnerSnapshot(payload: CreatorEditorDTO, active?: HTMLFormElement) {
  if (!payload.profile) return;
  state = payload;
  placementIdByResource.clear();
  payload.links.forEach(({ resourceId, placementId }) => placementIdByResource.set(resourceId, placementId));
  root?.setAttribute('data-profile-version', String(payload.profile.version));
  updateProfileView();
  renderOwnerLinksAfterCollectionChange();
  hydrateInactiveForms(active);
}

async function saveAddedLink(form: HTMLFormElement) {
  if (!state?.profile) {
    announceWrite('alta-enlace', 'Primero crea el borrador de tu página para agregar contenido.', 'error');
    return;
  }
  const snapshot = capture(form);
  const data = new FormData(form);
  const title = normalizeCreatorText(String(data.get('title') ?? ''));
  const url = normalizeCreatorText(String(data.get('url') ?? ''));
  const description = normalizeCreatorText(String(data.get('description') ?? ''));
  const selectedForDirectory = Boolean((field(form, 'selectedForDirectory') as HTMLInputElement | null)?.checked);
  if (!form.reportValidity()) return;
  const draft = readAddedLinkDraft(form);
  form.setAttribute('aria-busy', 'true');
  try {
    const uncertainDraft = uncertainAddedLinkDraft;
    if (uncertainDraft && uncertainDraft.url.trim() !== url) {
      if (!await reconcileOwnerData()) {
        announceWrite('alta-enlace', 'No pudimos comprobar si la URL del intento anterior ya está en tu página. Conservamos tus cambios y no agregamos la URL corregida hasta confirmar el estado.', 'error');
        return;
      }
      const uncertainLink = state?.links.find((item) => item.url === uncertainDraft.url.trim());
      if (uncertainLink) {
        const currentDraft = readAddedLinkDraft(form);
        const continuation = continueAddedLinkInEditor(form, uncertainLink, currentDraft,
          !sameAddedLinkText(currentDraft, uncertainDraft));
        if (continuation) {
          announceWrite(continuation === 'shared-correction' ? 'alta-enlace' : 'enlace', continuation === 'editable'
            ? 'La URL del intento anterior ya está en tu página. Conservamos la corrección en la edición de la ficha para que la guardes.'
            : continuation === 'shared-correction'
              ? 'La URL del intento anterior ya está en tu página. Conservamos aquí tu corrección de alta; la ficha compartida mantiene sus datos. Puedes guardarla o descartarla, y revisar las opciones por separado.'
              : 'La URL del intento anterior ya está en tu página. La ficha compartida conserva sus datos; sólo puedes editar sus opciones.', 'info');
        } else announceWrite('alta-enlace', 'La URL del intento anterior ya está en tu página. Conservamos los cambios; vuelve a abrir su edición antes de agregar otra URL.', 'error');
        return;
      }
      uncertainAddedLinkDraft = undefined;
      if (!submitWasUnchanged(snapshot)) {
        announceWrite('alta-enlace', 'La URL del intento anterior no está en tu página. Conservamos la corrección que escribiste mientras comprobábamos; vuelve a guardar para agregarla.', 'info');
        return;
      }
    }
    const profileAtSubmit = state?.profile;
    if (!profileAtSubmit) {
      announceWrite('alta-enlace', 'La página ya no está disponible. Conservamos el formulario para volver a intentarlo.', 'error');
      return;
    }
    const response = await jsonRequest('/api/creador/enlaces', 'POST', { title, url, description, selectedForDirectory });
    if (!response.ok) {
      if (response.status >= 500) markAddedLinkUncertain(draft);
      announceWrite('alta-enlace', statusMessage(response.status), 'error');
      return;
    }
    const payload = await responsePayload(response);
    if (!payload || !isCreatorLink(payload.link)) {
      markAddedLinkUncertain(draft);
      announceWrite('alta-enlace', 'El servicio respondió sin una ficha que podamos verificar. Conservamos el formulario; comprueba el estado antes de volver a enviarlo.', 'error');
      return;
    }
    const link = payload.link;
    if (payload.created !== true) {
      const changes = await readCreatorVersionChanges(response);
      if (response.status !== 200 || payload.created !== false
        || payload.link.url !== url || !validateCreatorOwnerReceipts(changes, [])) {
        markAddedLinkUncertain(draft);
        announceWrite('alta-enlace', 'El servicio encontró una URL existente, pero no pudimos verificar su respuesta. Conservamos el formulario para revisar la lista.', 'error');
        return;
      }
      if (!await reconcileOwnerData()) {
        markAddedLinkUncertain(draft);
        announceWrite('alta-enlace', 'El enlace ya existía o la solicitud anterior pudo completarse. Conservamos el formulario y no cambiamos sus opciones; actualiza la lista antes de volver a intentar.', 'error');
        return;
      }
      const currentDraft = readAddedLinkDraft(form);
      const currentSharedLink = pendingSharedAddPlacementId
        ? state?.links.find(({ placementId }) => placementId === pendingSharedAddPlacementId)
        : undefined;
      if (currentSharedLink?.placementId === payload.link.placementId) {
        const textCorrection = !sameAddedLinkText(currentDraft, {
          title: currentSharedLink.title,
          url: currentSharedLink.url,
          description: currentSharedLink.description ?? '',
          selectedForDirectory: currentSharedLink.selectedForDirectory,
        });
        if (textCorrection) {
          announceWrite('alta-enlace', 'La ficha compartida ya está en tu página y conserva sus datos. No guardamos esta corrección sobre ella; cambia la URL para agregar otra ficha, revisa las opciones o descarta la corrección.', 'info');
          return;
        }
        if (currentDraft.selectedForDirectory !== currentSharedLink.selectedForDirectory) {
          const continuation = continueAddedLinkInEditor(form, currentSharedLink, currentDraft);
          if (continuation) {
            announceWrite('enlace', 'La ficha compartida ya estaba en tu página. Conservamos la propuesta al directorio en sus opciones; guarda ese cambio por separado.', 'info');
            return;
          }
        }
      }
      const unchanged = submitWasUnchanged(snapshot);
      const correctionAfterUncertain = Boolean(uncertainAddedLinkDraft
        && uncertainAddedLinkDraft.url.trim() === url
        && !sameAddedLinkDraft(currentDraft, uncertainAddedLinkDraft));
      const existing = state?.links.find((item) => item.url === url);
      const matchesCurrentQuery = existing ? ownerLinkMatchesCurrentQuery(existing.placementId) : true;
      if ((!unchanged || correctionAfterUncertain) && existing) {
        const correctionBaseline = uncertainAddedLinkDraft ?? draft;
        const continuation = continueAddedLinkInEditor(form, existing, currentDraft,
          !sameAddedLinkText(currentDraft, correctionBaseline));
        if (continuation) {
          announceWrite(continuation === 'shared-correction' ? 'alta-enlace' : 'enlace', continuation === 'editable'
            ? 'Ese enlace ya estaba en tu página. Conservamos tus correcciones en la edición de la ficha para que las guardes.'
            : continuation === 'shared-correction'
              ? 'Ese enlace ya estaba en tu página. Conservamos aquí tu corrección de alta; la ficha compartida mantiene sus datos. Puedes guardarla o descartarla, y revisar las opciones por separado.'
              : 'Ese enlace ya estaba en tu página. La ficha compartida conserva su título, URL y descripción; sólo puedes editar sus opciones.', 'info');
          return;
        }
      }
      if (unchanged) {
        resetAddedLinkForm(form);
        restoreLinkFocus(existing ? { kind: 'placement', placementId: existing.placementId } : undefined);
        announceWrite('alta-enlace', `Ese enlace ya estaba en tu página. No duplicamos la ficha ni cambiamos sus opciones.${matchesCurrentQuery ? '' : ' No coincide con los filtros actuales.'}`, 'success');
      } else announceWrite('alta-enlace', `Ese enlace ya estaba en tu página. Conservamos la corrección que escribiste mientras se comprobaba.${matchesCurrentQuery ? '' : ' No coincide con los filtros actuales.'}`, 'info');
      maybeExitAfterSave(unchanged);
      return;
    }
    const changes = await readCreatorVersionChanges(response);
    const profileReceipt = changes?.find((change) => change.entity === 'profile' && change.id === profileAtSubmit.id);
    const placementReceipt = changes?.find((change) => change.entity === 'placement' && change.id === link.placementId);
    const resourceReceipt = changes?.find((change) => change.entity === 'resource' && change.id === link.resourceId);
    const newResource = Boolean(resourceReceipt);
    const validResourceShape = newResource
      ? link.title === title && link.url === url
        && Object.hasOwn(link, 'description') && link.description === description
      : link.url === url;
    const validReceipt = response.status === 201 && link.position >= 0 && link.url === url && validResourceShape
      && link.selectedForDirectory === selectedForDirectory && link.featured === false
      && link.series.length === 0
      && !state.links.some(({ placementId }) => placementId === link.placementId)
      && (!placementIdByResource.has(link.resourceId) || placementIdByResource.get(link.resourceId) === link.placementId)
      && validateCreatorOwnerReceipts(changes, [
        { entity: 'profile', id: profileAtSubmit.id, before: profileAtSubmit.version, transition: 'increment', required: true },
        { entity: 'placement', id: link.placementId, before: 0, transition: 'created', required: true },
        { entity: 'resource', id: link.resourceId, before: 0, transition: 'created-one' },
      ])
      && link.placementVersion === placementReceipt?.after
      && placementReceipt?.after === profileReceipt?.after
      && (!resourceReceipt || link.resourceVersion === resourceReceipt.after)
      && profileReceipt?.after !== undefined;
    if (!validReceipt) {
      markAddedLinkUncertain(draft);
      announceWrite('alta-enlace', 'No pudimos comprobar el recibo del enlace. Conservamos el formulario para revisar el estado antes de volver a enviarlo.', 'error');
      return;
    }
    const appliedLink = resourceReceipt ? link : keepEditableResourceObservation(link);
    state.links.push(appliedLink);
    placementIdByResource.set(appliedLink.resourceId, appliedLink.placementId);
    if (newResource && !state.editableResources.some(({ id }) => id === link.resourceId)) {
      state.editableResources.push({ id: link.resourceId, title: link.title, url: link.url,
        ...(Object.hasOwn(link, 'description') ? { description: link.description } : {}), version: link.resourceVersion });
    }
    state.profile = { ...profileAtSubmit, version: profileReceipt.after };
    root?.setAttribute('data-profile-version', String(state.profile.version));
    renderOwnerLinks();
      const matchesCurrentQuery = ownerLinkMatchesCurrentQuery(appliedLink.placementId);
    clearRecoveryNotice();
    const unchanged = submitWasUnchanged(snapshot);
    const visibility = `${state.profile.hidden
      ? ' La página sigue oculta por administración.'
      : !state.profile.published ? ' Se verá cuando tu página esté publicada.'
        : appliedLink.hidden ? ' La ficha está oculta en la página pública.'
          : ' El enlace está visible en tu página pública.'}`;
    if (unchanged) {
      resetAddedLinkForm(form);
      restoreLinkFocus(undefined);
      const result = newResource
        ? 'Enlace agregado a tu página.'
        : 'Enlace del catálogo agregado; conservamos su ficha original y sus datos.';
      const filterMessage = matchesCurrentQuery ? '' : ' No coincide con los filtros actuales.';
      announceWrite('alta-enlace', `${result}${visibility}${filterMessage}`, 'success');
    } else {
      const filterMessage = matchesCurrentQuery ? '' : ' El enlace guardado no coincide con los filtros actuales.';
      const continuation = continueAddedLinkInEditor(form, appliedLink, {
        title: String(field(form, 'title')?.value ?? ''),
        url: String(field(form, 'url')?.value ?? ''),
        description: String(field(form, 'description')?.value ?? ''),
        selectedForDirectory: Boolean((field(form, 'selectedForDirectory') as HTMLInputElement | null)?.checked),
      }, !sameAddedLinkText(readAddedLinkDraft(form), draft));
      if (continuation === 'editable') {
        announceWrite('enlace', `Enlace agregado. Conservamos la corrección que escribiste durante el guardado; revísala y guárdala en la edición de la ficha.${visibility}${filterMessage}`, 'success');
      } else if (continuation === 'shared-correction') {
        announceWrite('alta-enlace', `Enlace compartido agregado. Conservamos aquí la corrección de alta; los datos de la ficha siguen protegidos. Puedes guardarla o descartarla y revisar las opciones por separado.${visibility}${filterMessage}`, 'info');
      } else if (continuation === 'shared') {
        announceWrite('enlace', `Enlace agregado. La ficha compartida conserva su título, URL y descripción; sólo puedes editar sus opciones.${visibility}${filterMessage}`, 'info');
      } else announceWrite('alta-enlace', `Enlace agregado. Conservamos la corrección que escribiste durante el guardado; revísala antes de seguir.${visibility}${filterMessage}`, 'success');
    }
    maybeExitAfterSave(unchanged);
  } catch {
    markAddedLinkUncertain(draft);
    announceWrite('alta-enlace', 'No pudimos confirmar la respuesta del servicio. El formulario sigue abierto; puedes reintentar la URL, que se resolverá sin duplicar su ficha.', 'error');
  } finally {
    form.removeAttribute('aria-busy');
  }
}

function showCatalogProfileConflict(form: HTMLFormElement) {
  catalogConflictKind = 'profile';
  catalogProfileCompared = false;
  catalogIndexRefreshed = false;
  const conflict = form.querySelector<HTMLElement>('[data-catalog-conflict]');
  const copy = conflict?.querySelector<HTMLElement>('[data-owner-conflict-copy]');
  if (copy) copy.textContent = 'La versión de tu página cambió. Compara su estado y elige expresamente si quieres usarla antes de volver a intentar agregar esta ficha.';
  setHidden(conflict, false);
  setHidden(conflict?.querySelector('[data-owner-comparison]'), true);
  setHidden(conflict?.querySelector('[data-owner-adopt]'), true);
  catalogComparisonData = undefined;
  setCatalogSelectionLabel();
  announceWrite('referencia', statusMessage(409), 'error');
}

function showCatalogLinkConflict(form: HTMLFormElement) {
  catalogConflictKind = 'link';
  catalogProfileCompared = false;
  catalogIndexRefreshed = false;
  const conflict = form.querySelector<HTMLElement>('[data-catalog-conflict]');
  const copy = conflict?.querySelector<HTMLElement>('[data-owner-conflict-copy]');
  if (copy) copy.textContent = 'El catálogo o las opciones de tu página cambiaron durante la referencia. No la reenviamos. Compara el estado guardado y actualiza el catálogo antes de volver a intentarlo.';
  setHidden(conflict, false);
  setHidden(conflict?.querySelector('[data-owner-comparison]'), true);
  setHidden(conflict?.querySelector('[data-owner-adopt]'), true);
  const retry = catalogControl<HTMLButtonElement>('[data-catalog-retry]');
  if (retry) {
    retry.textContent = 'Actualizar catálogo';
    retry.hidden = false;
  }
  catalogComparisonData = undefined;
  setCatalogSelectionLabel();
  announceWrite('referencia', 'La referencia encontró cambios concurrentes. Compara tu página y actualiza el catálogo; no se volvió a enviar.', 'error');
}

function showCatalogReceiptConflict(form: HTMLFormElement) {
  catalogConflictKind = 'receipt';
  catalogProfileCompared = false;
  catalogIndexRefreshed = false;
  const conflict = form.querySelector<HTMLElement>('[data-catalog-conflict]');
  const copy = conflict?.querySelector<HTMLElement>('[data-owner-conflict-copy]');
  if (copy) copy.textContent = 'No pudimos confirmar si la referencia se guardó. Compara el estado de tu página antes de decidir si vuelves a intentarlo.';
  setHidden(conflict, false);
  setHidden(conflict?.querySelector('[data-owner-comparison]'), true);
  setHidden(conflict?.querySelector('[data-owner-adopt]'), true);
  catalogComparisonData = undefined;
  setCatalogSelectionLabel();
  announceWrite('referencia', 'No pudimos comprobar el recibo. Conservamos la selección y no se reenviará automáticamente; compara tu página antes de continuar.', 'error');
}

async function compareCatalogProfile(form: HTMLFormElement) {
  const currentProfile = state?.profile;
  if (!currentProfile || activeEditor !== 'referencia' || activeForm !== form) return;
  const generation = ++catalogComparisonGeneration;
  const profileId = currentProfile.id;
  announceWrite('referencia', 'Consultando la versión guardada de tu página…', 'info');
  try {
    const response = await readOwnerSnapshot();
    if (generation !== catalogComparisonGeneration || activeEditor !== 'referencia' || activeForm !== form) return;
    if (response.status === 401) await sessionRecovery?.observeWriteResponse(response);
    if (generation !== catalogComparisonGeneration || activeEditor !== 'referencia' || activeForm !== form) return;
    if (!response.ok) {
      announceWrite('referencia', response.status === 401
        ? sessionRecovery?.writeFailureMessage() ?? statusMessage(401)
        : 'No pudimos leer la versión guardada. Conservamos tu selección; puedes intentarlo de nuevo.', 'error');
      return;
    }
    const payload = await responsePayload(response);
    if (generation !== catalogComparisonGeneration || activeEditor !== 'referencia' || activeForm !== form) return;
    if (!isAdoptableOwnerData(payload) || payload.profile?.id !== profileId) {
      announceWrite('referencia', 'No pudimos confirmar que la versión guardada corresponde a esta página. Conservamos tu selección.', 'error');
      return;
    }
    catalogProfileCompared = true;
    const profileChanged = payload.profile.version !== currentProfile.version;
    const comparison = form.querySelector<HTMLElement>('[data-owner-comparison]');
    if (comparison) {
      comparison.textContent = `Versión guardada de tu página: ${payload.profile.version}.\nNombre: ${payload.profile.displayName}.\nLa ficha seleccionada y la opción del directorio se conservaron para que decidas cómo continuar.`;
      comparison.classList.add('creator-owner__comparison');
    }
    setHidden(comparison, false);
    setHidden(form.querySelector('[data-owner-adopt]'), !profileChanged);
    catalogComparisonData = payload;
    if (!profileChanged && catalogConflictKind === 'profile') {
      catalogConflictKind = undefined;
      announceWrite('referencia', 'La página no cambió. Revisaste el estado; puedes volver a intentar la referencia manualmente.', 'info');
    } else if (!profileChanged && catalogConflictKind === 'receipt') {
      catalogConflictKind = undefined;
      announceWrite('referencia', 'El perfil no cambió. Conservamos la ficha y su propuesta; puedes volver a intentar la referencia manualmente.', 'info');
    } else if (!profileChanged && catalogConflictKind === 'link') {
      if (catalogIndexRefreshed) {
        catalogConflictKind = undefined;
        announceWrite('referencia', 'El perfil no cambió y el catálogo está actualizado. Revisa la ficha y vuelve a intentar manualmente.', 'info');
      } else {
        announceWrite('referencia', 'El perfil no cambió. Actualiza el catálogo y revisa la ficha antes de volver a intentar.', 'info');
      }
    } else {
      announceWrite('referencia', 'Revisa el estado guardado y elige «Usar la versión guardada» antes de volver a intentar.', 'info');
    }
    setCatalogSelectionLabel();
  } catch {
    if (generation === catalogComparisonGeneration && activeEditor === 'referencia' && activeForm === form) {
      announceWrite('referencia', 'No pudimos conectar para leer la versión guardada. Tu selección sigue aquí.', 'error');
    }
  }
}

function adoptCatalogProfile(form: HTMLFormElement) {
  const payload = catalogComparisonData;
  if (activeEditor !== 'referencia' || activeForm !== form || !payload
    || !isAdoptableOwnerData(payload) || payload.profile?.id !== state?.profile?.id) return;
  adoptOwnerSnapshot(payload, form);
  catalogComparisonData = undefined;
  catalogComparisonGeneration += 1;
  catalogConflictKind = undefined;
  catalogProfileCompared = false;
  catalogIndexRefreshed = false;
  const retry = catalogControl<HTMLButtonElement>('[data-catalog-retry]');
  if (retry) retry.hidden = true;
  const conflict = form.querySelector<HTMLElement>('[data-catalog-conflict]');
  setHidden(conflict, true);
  const comparison = conflict?.querySelector<HTMLElement>('[data-owner-comparison]');
  if (comparison) comparison.textContent = '';
  setHidden(comparison, true);
  setHidden(conflict?.querySelector('[data-owner-adopt]'), true);
  setCatalogSelectionLabel();
  announceWrite('referencia', 'Usaste la versión guardada. La ficha seleccionada y la propuesta al directorio siguen aquí; pulsa «Agregar a mi página» para volver a intentar.', 'success');
}

function catalogReferenceReceiptIsValid(
  response: Response,
  payload: Record<string, unknown> | null,
  changes: Awaited<ReturnType<typeof readCreatorVersionChanges>>,
  item: CreatorCatalogSelectionDTO,
  requestedForDirectory: boolean,
  profile: CreatorProfileDTO,
): payload is Record<string, unknown> & { link: CreatorLinkDTO } {
  const link = payload?.link;
  if (!payload || !isCreatorLink(link) || link.resourceId !== item.id
    || link.url !== item.url || link.selectedForDirectory !== requestedForDirectory
    || link.featured || link.series.length !== 0 || link.position < 0
    || state?.links.some(({ resourceId }) => resourceId === item.id)) return false;
  const profileReceipt = changes?.find((change) => change.entity === 'profile' && change.id === profile.id);
  const placementReceipt = changes?.find((change) => change.entity === 'placement' && change.id === link.placementId);
  return response.status === 201 && payload.created === true
    && !state?.links.some(({ placementId }) => placementId === link.placementId)
    && (!placementIdByResource.has(item.id) || placementIdByResource.get(item.id) === link.placementId)
    && validateCreatorOwnerReceipts(changes, [
      { entity: 'profile', id: profile.id, before: profile.version, transition: 'increment', required: true },
      { entity: 'placement', id: link.placementId, before: 0, transition: 'created', required: true },
    ])
    && link.placementVersion === placementReceipt?.after
    && placementReceipt?.after === profileReceipt?.after
    && profileReceipt?.after !== undefined;
}

function catalogDuplicateReceiptIsValid(
  response: Response,
  payload: Record<string, unknown> | null,
  changes: Awaited<ReturnType<typeof readCreatorVersionChanges>>,
  item: CreatorCatalogSelectionDTO,
): payload is Record<string, unknown> & { link: CreatorLinkDTO } {
  if (!payload || response.status !== 200 || payload.created !== false || !validateCreatorOwnerReceipts(changes, [])
    || !isCreatorLink(payload.link) || payload.link.resourceId !== item.id || payload.link.url !== item.url) return false;
  const existing = state?.links.find(({ resourceId }) => resourceId === item.id);
  return (!existing || existing.placementId === payload.link.placementId)
    && (!placementIdByResource.has(item.id) || placementIdByResource.get(item.id) === payload.link.placementId);
}

function parseClaimUrls(value: string): string[] | undefined {
  const urls = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return urls.every(isSafeClaimUrl) ? urls : undefined;
}

function confirmedClaimReceipt(
  response: Response,
  payload: Record<string, unknown> | null,
  changes: Awaited<ReturnType<typeof readCreatorVersionChanges>>,
  submitted: Array<{ resourceId?: string; url: string }>,
  evidence: string | undefined,
): CreatorClaimDTO | undefined {
  if (response.status !== 202 || !payload || changes === null || changes.length !== 0
    || Object.keys(payload).sort().join(',') !== 'claim,versionChanges'
    || !isRecord(payload.claim)) return undefined;
  const claim = payload.claim;
  const claimKeys = Object.keys(claim).sort().join(',');
  if (!['createdAt,id,resourceIds,resources,status', 'createdAt,evidence,id,resourceIds,resources,status'].includes(claimKeys)
    || typeof claim.id !== 'string' || !claim.id
    || !Array.isArray(claim.resourceIds) || !claim.resourceIds.every((id) => typeof id === 'string' && id.length > 0)
    || claim.status !== 'pending'
    || typeof claim.createdAt !== 'number' || !Number.isFinite(claim.createdAt) || claim.createdAt <= 0
    || (claim.evidence !== undefined && typeof claim.evidence !== 'string')
    || (evidence === undefined ? claim.evidence !== undefined : claim.evidence !== evidence)) return undefined;

  const resourceIds = claim.resourceIds;
  if (!Array.isArray(claim.resources) || claim.resources.length !== resourceIds.length) return undefined;
  const received: CreatorClaimResourceDTO[] = [];
  for (const [index, candidate] of claim.resources.entries()) {
    if (!isRecord(candidate) || Object.keys(candidate).sort().join(',') !== 'resourceId,url'
      || typeof candidate.resourceId !== 'string' || candidate.resourceId !== resourceIds[index]
      || typeof candidate.url !== 'string' || !isSafeClaimUrl(candidate.url)) return undefined;
    received.push({ resourceId: candidate.resourceId, url: candidate.url });
  }
  if (new Set(resourceIds).size !== resourceIds.length) return undefined;
  const selected = submitted.filter((item): item is CreatorClaimResourceDTO => typeof item.resourceId === 'string');
  const suppliedUrls = new Set(submitted.filter(({ resourceId }) => resourceId === undefined).map(({ url }) => url));
  for (const pair of selected) {
    if (!received.some(({ resourceId, url }) => resourceId === pair.resourceId && url === pair.url)) return undefined;
  }
  for (const pair of received) {
    const isSelectedPair = selected.some(({ resourceId, url }) => resourceId === pair.resourceId && url === pair.url);
    if (!isSelectedPair && !suppliedUrls.has(pair.url)) return undefined;
  }
  for (const url of suppliedUrls) {
    if (selected.some((pair) => pair.url === url)) continue;
    if (!received.some((pair) => pair.url === url)) return undefined;
  }
  if (received.length > submitted.length || received.length < selected.length) return undefined;
  return {
    id: claim.id,
    resourceIds,
    resources: received,
    status: 'pending',
    createdAt: claim.createdAt,
    ...(typeof claim.evidence === 'string' ? { evidence: claim.evidence } : {}),
  };
}

async function submitClaimForm(form: HTMLFormElement) {
  if (claimSubmitting) return;
  if (!state?.profile) {
    announceWrite('reclamacion', 'Primero prepara tu página para solicitar edición.', 'error');
    return;
  }
  if (claimNeedsRefresh || [...claimSelection.keys()].some((resourceId) => claimStalePairs.has(resourceId))) {
    announceWrite('reclamacion', 'Actualiza el catálogo y vuelve a seleccionar cada ficha cuyo destino pudo cambiar.', 'error');
    setHidden(catalogControl('[data-catalog-retry]'), false);
    return;
  }
  if (!form.reportValidity()) return;
  const urlsField = field(form, 'knownUrls');
  const evidenceField = field(form, 'evidence');
  const rawUrls = urlsField?.value ?? '';
  const urls = parseClaimUrls(rawUrls);
  if (!urls) {
    announceWrite('reclamacion', 'Revisa las URLs: cada línea debe ser una dirección HTTP o HTTPS completa, sin usuario ni contraseña, de hasta 2048 caracteres.', 'error');
    return;
  }
  const rawEvidence = evidenceField?.value ?? '';
  if (rawEvidence.length > 2000) {
    announceWrite('reclamacion', 'El contexto privado puede tener hasta 2000 caracteres.', 'error');
    return;
  }
  const evidence = normalizeCreatorText(rawEvidence) || undefined;
  const selectedResources = [...claimSelection.values()].map(({ resourceId, url }) => ({ resourceId, url }));
  const submitted = [...selectedResources, ...urls.map((url) => ({ url }))];
  if (submitted.length === 0) {
    announceWrite('reclamacion', 'Selecciona una ficha o agrega al menos una URL conocida.', 'error');
    return;
  }

  const selectionRevisions = new Map([...claimSelection.keys()].map((resourceId) => [resourceId, claimSelectionRevisions.get(resourceId) ?? 0]));
  const requestBody = { resources: submitted, ...(evidence === undefined ? {} : { evidence }) };
  const check = root?.querySelector<HTMLButtonElement>('[data-claim-check]');
  claimSubmitting = true;
  form.setAttribute('aria-busy', 'true');
  if (check) check.hidden = true;
  try {
    const response = await jsonRequest('/api/creador/reclamaciones', 'POST', requestBody);
    const payload = await responsePayload(response);
    if (response.status === 409 && ['RESOURCE_CONFLICT', 'RESOURCE_URL_CONFLICT', 'STALE_RESOURCE_REFERENCE'].includes(String(payload?.error))) {
      claimStalePairs = new Set(selectedResources.map(({ resourceId }) => resourceId));
      claimNeedsRefresh = claimStalePairs.size > 0;
      const retry = catalogControl<HTMLButtonElement>('[data-catalog-retry]');
      if (retry) retry.hidden = !claimNeedsRefresh;
      announceWrite('reclamacion', claimNeedsRefresh
        ? 'El destino de una ficha seleccionada pudo cambiar. Actualiza el catálogo, quita la selección anterior y vuelve a elegir la ficha vigente.'
        : 'La URL necesita revisión. Corrígela manualmente antes de volver a enviar.', 'error');
      return;
    }
    if (!response.ok) {
      if (response.status >= 500) {
        if (check) check.hidden = false;
        announceWrite('reclamacion', 'No pudimos confirmar si la solicitud llegó al servicio. Conservamos el formulario; comprueba Solicitudes antes de volver a intentar.', 'error');
        return;
      }
      const message = response.status === 404
        ? 'No encontramos una URL o ficha seleccionada. Conservamos la solicitud para que corrijas las URLs conocidas.'
        : response.status === 409
          ? 'La solicitud necesita revisión. Conservamos tus selecciones y URLs para que las compruebes antes de continuar.'
          : response.status === 403
            ? 'Esta cuenta no puede enviar la solicitud. Conservamos el contexto para que revises el acceso.'
            : statusMessage(response.status);
      announceWrite('reclamacion', message, 'error');
      return;
    }
    const changes = await readCreatorVersionChanges(response);
    const confirmed = confirmedClaimReceipt(response, payload, changes, submitted, evidence);
    if (!confirmed) {
      if (check) check.hidden = false;
      announceWrite('reclamacion', 'No pudimos confirmar esta respuesta. Conservamos el formulario; comprueba Solicitudes antes de volver a intentar.', 'error');
      return;
    }

    state.claims = [...state.claims, confirmed];
    renderClaimHistory();
    selectionRevisions.forEach((revision, resourceId) => {
      const current = claimSelection.get(resourceId);
      if (current && claimSelectionRevisions.get(resourceId) === revision
        && selectedResources.some((item) => item.resourceId === resourceId && item.url === current.url)) {
        claimSelection.delete(resourceId);
        claimStalePairs.delete(resourceId);
      }
    });
    if ((urlsField?.value ?? '') === rawUrls && urlsField) urlsField.value = '';
    if ((evidenceField?.value ?? '') === rawEvidence && evidenceField) evidenceField.value = '';
    claimSelectionBaseline = '';
    claimUrlsBaseline = '';
    claimEvidenceBaseline = '';
    setCatalogSelectionLabel();
    renderCatalogResults();
    announceWrite('reclamacion', 'Solicitud enviada. La revisión no agrega contenido ni concede permiso de edición.', 'success');
    maybeExitAfterSave(!hasPendingChanges());
  } catch {
    if (check) check.hidden = false;
    announceWrite('reclamacion', 'No pudimos confirmar si la solicitud llegó al servicio. Conservamos el formulario; comprueba Solicitudes antes de volver a intentar.', 'error');
  } finally {
    claimSubmitting = false;
    form.removeAttribute('aria-busy');
  }
}

async function checkClaimHistory() {
  if (claimChecking) return;
  const check = root?.querySelector<HTMLButtonElement>('[data-claim-check]');
  const claimIdsAtReadStart = new Set(state?.claims.map(({ id }) => id) ?? []);
  claimChecking = true;
  if (check) check.disabled = true;
  try {
    const response = await readOwnerSnapshot();
    if (response.status === 401) await sessionRecovery?.observeWriteResponse(response);
    if (!response.ok) {
      announceWrite('reclamacion', response.status === 401
        ? sessionRecovery?.writeFailureMessage() ?? statusMessage(401)
        : `No pudimos comprobar Solicitudes (${response.status}). Conservamos el formulario.`, 'error');
      return;
    }
    let payload: unknown;
    try { payload = await response.json(); } catch { payload = undefined; }
    if (!isOwnerData(payload) || !state?.profile || payload.profile?.id !== state.profile.id) {
      announceWrite('reclamacion', 'La respuesta de Solicitudes no coincide con esta página. Conservamos el formulario para que revises la cuenta activa.', 'error');
      return;
    }
    const readClaimIds = new Set(payload.claims.map(({ id }) => id));
    const confirmedDuringRead = state.claims.filter(({ id }) =>
      !claimIdsAtReadStart.has(id) && !readClaimIds.has(id));
    state.claims = [...payload.claims, ...confirmedDuringRead];
    renderClaimHistory();
    announceWrite('reclamacion', 'Solicitudes comprobadas. El formulario que estabas preparando sigue disponible.', 'success');
  } catch {
    announceWrite('reclamacion', 'No pudimos comprobar Solicitudes. Conservamos el formulario para intentarlo más tarde.', 'error');
  } finally {
    claimChecking = false;
    if (check) check.disabled = false;
  }
}

async function saveCatalogReference(form: HTMLFormElement) {
  if (!state?.profile) {
    announceWrite('referencia', 'Primero crea el borrador de tu página para agregar contenido.', 'error');
    return;
  }
  if (pendingCatalogOptionCorrection) {
    await savePendingCatalogOptionCorrection();
    return;
  }
  if (catalogSubmitting) return;
  if (catalogConflictKind) {
    announceWrite('referencia', 'Compara el estado guardado y completa la recuperación indicada antes de volver a intentar.', 'error');
    return;
  }
  const item = catalogSelection;
  const directory = field(form, 'selectedForDirectory') as HTMLInputElement | null;
  if (!item || !catalogSelectionCurrent || catalogNeedsRefresh
    || !catalogEntries?.some(({ id, url }) => id === item.id && url === item.url)) {
    announceWrite('referencia', 'Elige una ficha vigente del catálogo antes de agregarla a tu página.', 'error');
    return;
  }
  if (!form.reportValidity()) return;
  const snapshot = capture(form);
  const submittedSelection = catalogSelectionKey(item);
  const requestedForDirectory = directory?.checked ?? true;
  const profile = state.profile;
  catalogSubmitting = true;
  catalogSubmittingResourceId = item.id;
  catalogSubmittingDirectory = requestedForDirectory;
  form.setAttribute('aria-busy', 'true');
  setCatalogSelectionLabel();
  try {
    const response = await jsonRequest('/api/creador/referencias', 'POST', {
      resourceId: item.id,
      url: item.url,
      profileVersion: profile.version,
      selectedForDirectory: requestedForDirectory,
    });
    const payload = await responsePayload(response);
    if (response.status === 409 && ['STALE_RESOURCE_REFERENCE', 'RESOURCE_CONFLICT'].includes(String(payload?.error))) {
      catalogNeedsRefresh = true;
      catalogSelectionCurrent = false;
      const retry = catalogControl<HTMLButtonElement>('[data-catalog-retry]');
      if (retry) retry.hidden = false;
      announceWrite('referencia', 'La URL observada pudo cambiar. Actualiza el catálogo y revisa la ficha antes de volver a intentarlo.', 'error');
      renderCatalogResults();
      return;
    }
    if (response.status === 409 && payload?.error === 'PROFILE_CONFLICT') {
      showCatalogProfileConflict(form);
      return;
    }
    if (response.status === 409 && payload?.error === 'LINK_CONFLICT') {
      showCatalogLinkConflict(form);
      return;
    }
    if (!response.ok) {
      announceWrite('referencia', response.status === 403
        ? 'No pudimos completar la referencia con esta cuenta. Conservamos la selección para que revises el acceso antes de continuar.'
        : statusMessage(response.status), 'error');
      return;
    }
    if (!payload || !isCreatorLink(payload.link) || payload.link.resourceId !== item.id || payload.link.url !== item.url) {
      showCatalogReceiptConflict(form);
      return;
    }
    const changes = await readCreatorVersionChanges(response);
    if (payload.created === false) {
      if (!catalogDuplicateReceiptIsValid(response, payload, changes, item)) {
        showCatalogReceiptConflict(form);
        return;
      }
      let existing = state.links.find(({ resourceId }) => resourceId === item.id);
      if (!existing && await reconcileOwnerData()) {
        existing = state?.links.find(({ resourceId }) => resourceId === item.id);
      }
      if (!existing || existing.placementId !== payload.link.placementId) {
        showCatalogReceiptConflict(form);
        return;
      }
      const link = existing;
      clearRecoveryNotice();
      formState?.commit(snapshot);
      catalogSelectionBaseline = submittedSelection;
      const currentDirectory = directory?.checked ?? requestedForDirectory;
      const sameSelection = sameCatalogSelection(catalogSelectionKey(), submittedSelection);
      const directoryChangedDuringRequest = currentDirectory !== requestedForDirectory;
      if (sameSelection) {
        catalogDirectoryBaseline = link.selectedForDirectory;
        pendingCatalogOptionCorrection = undefined;
        if (directoryChangedDuringRequest && currentDirectory !== link.selectedForDirectory) {
          pendingCatalogOptionCorrection = {
            resourceId: link.resourceId,
            placementId: link.placementId,
            selectedForDirectory: currentDirectory,
          };
        } else if (!directoryChangedDuringRequest && directory && currentDirectory !== link.selectedForDirectory) {
          directory.checked = link.selectedForDirectory;
        }
        if (!pendingCatalogOptionCorrection) formState?.commit(capture(form));
      }
      setCatalogSelectionLabel();
      const unchanged = !hasPendingChanges();
      catalogResetSelectionOnNextOpen = unchanged;
      const message = pendingCatalogOptionCorrection
        ? 'Ese contenido ya estaba en tu página. Conservamos sus opciones actuales; revisa la propuesta en las opciones de esta colocación.'
        : 'Ese contenido ya estaba en tu página. Conservamos su ficha, opciones, posición y series.';
      lastCatalogReferenceMessage = message;
      announceWrite('enlace', message, 'success');
      announce(statusFor('referencia'), message, 'success');
      if (unchanged) restoreLinkFocus({ kind: 'placement', placementId: link.placementId });
      maybeExitAfterSave(unchanged);
      return;
    }
    const profileReceipt = changes?.find((change) => change.entity === 'profile' && change.id === profile.id);
    if (!catalogReferenceReceiptIsValid(response, payload, changes, item, requestedForDirectory, profile) || !profileReceipt) {
      showCatalogReceiptConflict(form);
      return;
    }
    const link = keepEditableResourceObservation(payload.link);
    state.links.push(link);
    placementIdByResource.set(link.resourceId, link.placementId);
    state.profile = { ...profile, version: profileReceipt.after };
    root?.setAttribute('data-profile-version', String(state.profile.version));
    renderOwnerLinksAfterCollectionChange();
    clearRecoveryNotice();
    formState?.commit(snapshot);
    catalogSelectionBaseline = submittedSelection;
    const currentDirectory = directory?.checked ?? requestedForDirectory;
    const sameSelection = sameCatalogSelection(catalogSelectionKey(), submittedSelection);
    if (sameSelection) {
      catalogDirectoryBaseline = link.selectedForDirectory;
      pendingCatalogOptionCorrection = currentDirectory === link.selectedForDirectory ? undefined : {
        resourceId: link.resourceId,
        placementId: link.placementId,
        selectedForDirectory: currentDirectory,
      };
    } else {
      pendingCatalogOptionCorrection = undefined;
    }
    setCatalogSelectionLabel();
    const unchanged = !hasPendingChanges();
    if (unchanged) {
      catalogResetSelectionOnNextOpen = true;
      const message = 'Contenido agregado a tu página. La ficha compartida conserva sus datos editoriales.';
      lastCatalogReferenceMessage = message;
      announceWrite('enlace', message, 'success');
      announce(statusFor('referencia'), message, 'success');
    } else if (pendingCatalogOptionCorrection) {
      const message = 'La referencia se agregó. La propuesta al directorio que cambiaste durante el envío sigue sin guardar; revisa las opciones de esta colocación.';
      lastCatalogReferenceMessage = message;
      announceWrite('enlace', message, 'info');
      announce(statusFor('referencia'), message, 'info');
    } else {
      const message = sameSelection
        ? 'La referencia se agregó. Conservamos la corrección que hiciste durante el envío; revísala y guárdala en las opciones de esta colocación.'
        : 'La referencia se agregó. Conservamos la selección que elegiste durante el envío; agrégala cuando quieras.';
      lastCatalogReferenceMessage = message;
      announceWrite('enlace', message, 'info');
      announce(statusFor('referencia'), message, 'info');
    }
    maybeExitAfterSave(unchanged);
  } catch {
    showCatalogReceiptConflict(form);
  } finally {
    catalogSubmitting = false;
    catalogSubmittingResourceId = undefined;
    catalogSubmittingDirectory = undefined;
    form.removeAttribute('aria-busy');
    setCatalogSelectionLabel();
  }
}

async function reincludeResource(resourceId: string, observedVersion: number) {
  if (!state?.profile) return;
  const resource = state.editableResources.find(({ id }) => id === resourceId);
  if (!resource || resource.version !== observedVersion || state.links.some((link) => link.resourceId === resourceId)) {
    announceWrite('enlace', 'La ficha cambió desde que se mostró esta opción. Actualiza la lista antes de reincorporarla.', 'error');
    return;
  }
  const profileAtSubmit = state.profile;
  try {
    const response = await jsonRequest('/api/creador/enlaces', 'POST', { resourceId, resourceVersion: observedVersion });
    if (!response.ok) {
      announceWrite('enlace', statusMessage(response.status), 'error');
      return;
    }
    const payload = await responsePayload(response);
    if (!payload || !isCreatorLink(payload.link) || payload.link.resourceId !== resourceId) {
      announceWrite('enlace', 'El servicio respondió sin una colocación que podamos verificar. La ficha se conserva para revisarla.', 'error');
      return;
    }
    const link = payload.link;
    if (payload.created !== true) {
      const changes = await readCreatorVersionChanges(response);
      if (response.status !== 200 || payload.created !== false
        || !validateCreatorOwnerReceipts(changes, []) || link.resourceId !== resourceId) {
        announceWrite('enlace', 'No pudimos comprobar la respuesta duplicada. Conservamos la ficha; actualiza la lista antes de continuar.', 'error');
        return;
      }
      if (!await reconcileOwnerData()) announceWrite('enlace', 'El enlace ya está en tu página. No pudimos actualizar la lista; vuelve a seleccionar «Volver a agregar» cuando termines cualquier edición para comprobarla.', 'info');
      else announceWrite('enlace', 'El enlace ya estaba en tu página. No cambiamos sus opciones.', 'info');
      return;
    }
    const changes = await readCreatorVersionChanges(response);
    const profileReceipt = changes?.find((change) => change.entity === 'profile' && change.id === profileAtSubmit.id);
    const placementReceipt = changes?.find((change) => change.entity === 'placement' && change.id === link.placementId);
    const validReceipt = response.status === 201 && link.title === resource.title && link.url === resource.url
      && Object.hasOwn(link, 'description') === Object.hasOwn(resource, 'description')
      && link.description === resource.description
      && link.resourceVersion === observedVersion && link.featured === false && link.selectedForDirectory === true
      && link.position >= 0 && link.series.length === 0
      && !state.links.some(({ placementId }) => placementId === link.placementId)
      && (!placementIdByResource.has(resourceId) || placementIdByResource.get(resourceId) === link.placementId)
      && validateCreatorOwnerReceipts(changes, [
        { entity: 'profile', id: profileAtSubmit.id, before: profileAtSubmit.version, transition: 'increment', required: true },
        { entity: 'placement', id: link.placementId, before: 0, transition: 'created', required: true },
      ])
      && link.placementVersion === placementReceipt?.after
      && placementReceipt?.after === profileReceipt?.after
      && profileReceipt?.after !== undefined;
    if (!validReceipt || !profileReceipt) {
      announceWrite('enlace', 'No pudimos comprobar el recibo de reincorporación. Conservamos la ficha y no la marcamos como agregada.', 'error');
      return;
    }
    state.links.push(link);
    placementIdByResource.set(link.resourceId, link.placementId);
    state.profile = { ...profileAtSubmit, version: profileReceipt.after };
    root?.setAttribute('data-profile-version', String(state.profile.version));
    renderOwnerLinks();
    const matchesCurrentQuery = ownerLinkMatchesCurrentQuery(link.placementId);
    window.requestAnimationFrame(() => root?.querySelector<HTMLElement>('[data-link-search]')?.focus());
    clearRecoveryNotice();
    announceWrite('enlace', `Ficha reincorporada a tu página. Sus capítulos anteriores no se restauran automáticamente.${matchesCurrentQuery ? '' : ' No coincide con los filtros actuales.'}`, 'success');
  } catch {
    announceWrite('enlace', 'No pudimos confirmar la respuesta del servicio. La ficha sigue disponible; comprueba la lista antes de volver a agregarla.', 'error');
  }
}

async function removeOwnerLink(placementId: string) {
  const link = state?.links.find(({ placementId: id }) => id === placementId);
  if (!state?.profile || !link) return;
  const ownsResource = state.editableResources.some(({ id }) => id === link.resourceId);
  const confirmation = ownsResource
    ? '¿Quieres quitar este enlace de tu página? La ficha queda guardada en “Contenido que puedes volver a agregar” para editarla o volver a agregarla después.'
    : '¿Quieres quitar esta referencia de tu página? La ficha compartida no se edita ni se retira del catálogo.';
  const confirmed = window.confirm(confirmation);
  if (!confirmed) return;
  const profile = state.profile;
  try {
    const response = await jsonRequest(`/api/creador/enlaces/${encodeURIComponent(placementId)}`, 'DELETE', { profileVersion: profile.version });
    if (!response.ok) {
      announceWrite('enlace', statusMessage(response.status), 'error');
      return;
    }
    const changes = await readCreatorVersionChanges(response);
    const profileReceipt = changes?.find((change) => change.entity === 'profile' && change.id === profile.id);
    if (response.status !== 204 || !validateCreatorOwnerReceipts(changes, [
      { entity: 'profile', id: profile.id, before: profile.version, transition: 'increment', required: true },
    ]) || !profileReceipt) {
      announceWrite('enlace', 'No pudimos comprobar que el enlace se quitó. Actualiza la lista antes de repetir la acción.', 'error');
      return;
    }
    state.links = state.links.filter((item) => item.placementId !== placementId);
    state.profile = { ...profile, version: profileReceipt.after };
    root?.setAttribute('data-profile-version', String(profileReceipt.after));
    renderOwnerLinksAfterCollectionChange();
    window.requestAnimationFrame(() => root?.querySelector<HTMLElement>('[data-link-search]')?.focus());
    clearRecoveryNotice();
    announceWrite('enlace', 'Enlace quitado de tu página. La ficha propia sigue disponible para volver a agregarla.', 'success');
  } catch {
    announceWrite('enlace', 'No pudimos confirmar la respuesta del servicio. Actualiza la lista para comprobar si el enlace sigue en tu página.', 'error');
  }
}

async function compareSavedLink(form: HTMLFormElement) {
  if (!state?.profile || !activeLinkContext) return;
  const context = activeLinkContext;
  const contextRevision = linkContextRevision;
  const generation = ++linkCompareGeneration;
  const profileId = state.profile.id;
  announceWrite('enlace', 'Consultando la versión guardada…', 'info');
  try {
    const response = await readOwnerSnapshot();
    if (response.status === 401) await sessionRecovery?.observeWriteResponse(response);
    if (!linkComparisonIsCurrent(form, context, contextRevision, generation)) return;
    if (!response.ok) {
      announceWrite('enlace', response.status === 401 ? sessionRecovery?.writeFailureMessage() ?? statusMessage(401) : 'No pudimos leer lo guardado. Tu corrección sigue aquí.', 'error');
      return;
    }
    const payload = await responsePayload(response);
    if (!linkComparisonIsCurrent(form, context, contextRevision, generation)) return;
    if (!payload || !isOwnerData(payload) || payload.profile?.id !== profileId) {
      announceWrite('enlace', 'No pudimos confirmar que la respuesta corresponde a esta página. Conservamos tu edición.', 'error');
      return;
    }
    const savedLink = context.kind === 'placement'
      ? payload.links.find(({ placementId }) => placementId === context.placementId)
      : undefined;
    const savedResource = context.kind === 'resource'
      ? payload.editableResources.find(({ id }) => id === context.resourceId)
      : undefined;
    if ((context.kind === 'placement' && !savedLink) || (context.kind === 'resource' && !savedResource)) {
      announceWrite('enlace', 'La ficha ya no está disponible en esta página. Conservamos tu corrección para que decidas qué hacer.', 'error');
      return;
    }
    const compare = form.querySelector<HTMLElement>('[data-owner-comparison]');
    const fields = [['Título', 'title'], ['URL', 'url'], ['Descripción', 'description']] as const;
    const localValues = fields.map(([label, name]) => `${label}: guardado “${context.kind === 'placement' ? (savedLink?.[name] ?? '') : (savedResource?.[name] ?? '')}” | tu corrección “${String(field(form, name)?.value ?? '')}”`);
    if (savedLink) localValues.push(`Destacado: guardado ${savedLink.featured ? 'sí' : 'no'} | tu corrección ${(field(form, 'featured') as HTMLInputElement | null)?.checked ? 'sí' : 'no'}`);
    if (savedLink) localValues.push(`Propuesta al directorio: guardado ${savedLink.selectedForDirectory ? 'sí' : 'no'} | tu corrección ${(field(form, 'selectedForDirectory') as HTMLInputElement | null)?.checked ? 'sí' : 'no'}`);
    if (compare) compare.textContent = `Versión de perfil guardada: ${payload.profile.version}.\n${localValues.join('\n')}`;
    setHidden(compare, false);
    setHidden(form.querySelector('[data-owner-adopt]'), false);
    conflictLinkData = payload;
    conflictLinkContextRevision = contextRevision;
    announceWrite('enlace', 'Compara los valores y elige expresamente si quieres adoptar la versión guardada.', 'info');
  } catch {
    if (linkComparisonIsCurrent(form, context, contextRevision, generation)) {
      announceWrite('enlace', 'No pudimos conectar para leer la versión guardada. Tu corrección sigue aquí.', 'error');
    }
  }
}

function adoptSavedLink(form: HTMLFormElement) {
  if (!conflictLinkData || !activeLinkContext || activeEditor !== 'enlace' || activeForm !== form
    || form.hidden || conflictLinkContextRevision !== linkContextRevision) return;
  const context = activeLinkContext;
  const adopted = conflictLinkData;
  if (!state?.profile || adopted.profile?.id !== state.profile.id) return;
  if (context.kind === 'placement' && !adopted.links.some(({ placementId }) => placementId === context.placementId)) return;
  if (context.kind === 'resource' && !adopted.editableResources.some(({ id }) => id === context.resourceId)) return;
  adoptOwnerSnapshot(adopted, form);
  if (context.kind === 'placement') {
    const link = adopted.links.find(({ placementId }) => placementId === context.placementId);
    if (!link) return;
    const own = adopted.editableResources.some(({ id }) => id === link.resourceId);
    setLinkFormValues(form, link, own ? 'placement-own' : 'placement-shared');
  } else {
    const resource = adopted.editableResources.find(({ id }) => id === context.resourceId);
    if (!resource) return;
    setLinkFormValues(form, resource, 'resource');
  }
  restoreLinkFocus(context);
  clearConflict(form);
  formState?.commit(capture(form));
  announceWrite('enlace', 'Adoptaste expresamente la versión guardada. Si quieres, ahora puedes hacer otra corrección.', 'success');
}

function profileMessage(profile: CreatorProfileDTO): string {
  if (profile.hidden) return 'Perfil guardado. La página sigue oculta por administración.';
  if (profile.published) return 'Perfil guardado. El cambio ya está en tu página pública.';
  return 'Perfil guardado como borrador. Publícalo cuando esté listo.';
}

function profileFormContextRevision(name: 'crear' | 'datos' | 'redes'): number {
  return name === 'crear' ? createFormRevision : ownerEditorRevision;
}

function isActiveProfileFormContext(
  form: HTMLFormElement,
  name: 'crear' | 'datos' | 'redes',
  contextRevision: number,
): boolean {
  if (activeForm !== form || form.hidden) return false;
  if (name === 'crear') {
    const panel = root?.querySelector<HTMLElement>('[data-owner-create-panel]');
    return form === formFor('crear') && !panel?.hidden && createFormRevision === contextRevision;
  }
  return ownerEditorRevision === contextRevision && activeEditor === name;
}

function showConflictComparison(
  form: HTMLFormElement,
  current: CreatorProfileDTO,
  name: 'crear' | 'datos' | 'redes',
  ownerSnapshot?: CreatorEditorDTO & { profile: CreatorProfileDTO },
) {
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
  conflictOwnerSnapshot = ownerSnapshot;
  conflictProfileContext = { form, name, contextRevision: profileFormContextRevision(name) };
}

async function compareSavedVersion(form: HTMLFormElement, name: 'crear' | 'datos' | 'redes') {
  const contextRevision = profileFormContextRevision(name);
  const generation = ++profileCompareGeneration;
  const isCurrent = () => generation === profileCompareGeneration
    && isActiveProfileFormContext(form, name, contextRevision);
  announceWrite(name, 'Consultando la versión guardada…', 'info');
  try {
    const response = await readOwnerSnapshot();
    if (response.status === 401) await sessionRecovery?.observeWriteResponse(response);
    if (!isCurrent()) return;
    if (!response.ok) {
      if (response.status === 401) {
        announceWrite(name, sessionRecovery?.writeFailureMessage() ?? statusMessage(401), 'error');
        return;
      }
      const failure = response.status === 409 || response.status === 422 ? await responsePayload(response) : null;
      if (!isCurrent()) return;
      const message = failure?.error === 'SESSION_CONTEXT_CHANGED'
        ? 'La cuenta o el rol activo no coinciden con esta página. Vuelve a la cuenta original para comparar; conservamos tu corrección.'
        : failure?.error === 'INVALID_CONTEXT'
          ? 'El contexto de esta página no es válido. Vuelve a abrirla desde la cuenta original; conservamos tu corrección.'
          : 'No pudimos leer la versión guardada. Tus cambios siguen aquí; inténtalo de nuevo.';
      announceWrite(name, message, 'error');
      return;
    }
    const payload = await responsePayload(response);
    if (!isCurrent()) return;
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
      conflictOwnerSnapshot = undefined;
      conflictProfileContext = undefined;
      announceWrite(name, 'No se encontró una página para adoptar. Puedes corregir la dirección y volver a guardar.', 'info');
      return;
    }
    if (!isAdoptableOwnerData(payload) || (state?.profile && payload.profile.id !== state.profile.id)
      || (!state?.profile && name !== 'crear')) {
      announceWrite(name, 'La respuesta no contiene un estado completo de esta página. Conservamos tu edición para que vuelvas a comparar.', 'error');
      return;
    }
    if (state?.profile && payload.profile.version < state.profile.version) {
      announceWrite(name, 'La lectura devolvió una versión anterior a la que ya observaste. Conservamos tu edición y no adoptamos ese estado.', 'error');
      return;
    }
    showConflictComparison(form, payload.profile, name, payload);
    announceWrite(name, 'Compara los valores y elige expresamente si quieres adoptar la versión guardada.', 'info');
  } catch {
    if (isCurrent()) announceWrite(name, 'No pudimos conectar para leer la versión guardada. Tus cambios siguen aquí.', 'error');
  }
}

function adoptSavedVersion(form: HTMLFormElement, name: 'crear' | 'datos' | 'redes') {
  if (!conflictProfile || !conflictProfileContext || conflictProfileContext.form !== form
    || conflictProfileContext.name !== name
    || !isActiveProfileFormContext(form, name, conflictProfileContext.contextRevision)) return;
  const adopted = conflictProfile;
  const snapshot = conflictOwnerSnapshot;
  if (!snapshot || !isAdoptableOwnerData(snapshot)
    || snapshot.profile.id !== adopted.id || snapshot.profile.version !== adopted.version
    || (state?.profile && (state.profile.id !== adopted.id || adopted.version < state.profile.version))) return;
  if (name === 'crear') {
    adoptOwnerSnapshot(snapshot, form);
    const displayName = field(form, 'displayName');
    const slug = field(form, 'slug');
    if (displayName) displayName.value = adopted.displayName;
    if (slug) slug.value = adopted.slug;
    setHidden(root?.querySelector('[data-owner-create-panel]'), true);
    activeForm = undefined;
    hydrateInactiveForms();
  } else {
    if (!state?.profile || state.profile.id !== adopted.id) return;
    adoptOwnerSnapshot(snapshot, form);
    setFormFromProfile(form, name, adopted);
  }
  formState?.commit(capture(form));
  clearConflict(form);
  announceWrite(name, 'Adoptaste explícitamente la versión guardada. Puedes hacer otra corrección y volver a guardar.', 'success');
}

function validPhoto(photo: unknown): photo is NonNullable<CreatorProfileDTO['photo']> {
  return isRecord(photo) && (typeof photo.version === 'string' || typeof photo.version === 'number');
}

async function checkPhotoStatus(form: HTMLFormElement) {
  const editorRevision = ownerEditorRevision;
  const writeRevision = ownerWriteRevision;
  const isCurrent = () => ownerEditorRevision === editorRevision
    && ownerWriteRevision === writeRevision
    && activeForm === form && activeEditor === 'foto' && !form.hidden;
  const checkButton = form.querySelector<HTMLButtonElement>('[data-owner-check-photo]');
  if (checkButton) checkButton.disabled = true;
  try {
    const response = await readOwnerSnapshot();
    if (response.status === 401) await sessionRecovery?.observeWriteResponse(response);
    if (!isCurrent()) return;
    const payload = response.ok ? await responsePayload(response) : null;
    if (!isCurrent()) return;
    if (!payload || !isAdoptableOwnerData(payload) || payload.profile.id !== state?.profile?.id) {
      announceWrite('foto', response.status === 401 ? sessionRecovery?.writeFailureMessage() ?? PHOTO_UNCONFIRMED : PHOTO_UNCONFIRMED, 'error');
      return;
    }
    const latest = payload.profile;
    if (photoUploadId && String(latest.photo?.version) === photoUploadId) {
      const input = field(form, 'photo') as HTMLInputElement | null;
      const selectedFile = input?.files?.[0];
      const acknowledgedFile = photoUploadFile;
      photoUploadId = undefined;
      photoUploadFile = undefined;
      adoptOwnerSnapshot(payload, form);
      if (selectedFile && selectedFile !== acknowledgedFile) {
        setHidden(checkButton, true);
        announceWrite('foto', 'La carga anterior quedó guardada. Conservamos la imagen nueva que elegiste; guárdala para cambiarla.', 'info');
        return;
      }
      if (input) input.value = '';
      formState?.commit(capture(form));
      setHidden(checkButton, true);
      announceWrite('foto', 'La foto seleccionada quedó guardada. Ya puedes comprobarla en tu página.', 'success');
      maybeExitAfterSave(!hasPendingChanges());
      return;
    }
    adoptOwnerSnapshot(payload, form);
    setHidden(checkButton, false);
    announceWrite('foto', 'La versión guardada ya está comprobada. La foto elegida sigue disponible; puedes iniciar una carga nueva si todavía quieres cambiarla.', 'info');
  } catch {
    if (isCurrent()) announceWrite('foto', PHOTO_UNCONFIRMED, 'error');
  } finally {
    if (checkButton && !writeGuard?.isActive()) checkButton.disabled = false;
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
  photoUploadFile = undefined;
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
    photoUploadFile = file;
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
    if (finish.status !== 200 || !payload || !validPhoto(photo) || !validateCreatorOwnerReceipts(changes, [
      { entity: 'profile', id: profile.id, before: expectedVersion, transition: 'increment', required: true },
    ]) || matching?.before !== expectedVersion || matching.after !== expectedVersion + 1) {
      setHidden(form.querySelector('[data-owner-check-photo]'), false);
      announceWrite('foto', PHOTO_UNCONFIRMED, 'error');
      return;
    }
    const updated = { ...profile, photo, version: matching.after };
    updateProfileState(updated);
    photoUploadId = undefined;
    photoUploadFile = undefined;
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
    if (pendingOwnerHistoryNavigation) {
      pendingOwnerHistoryNavigation.cancelled = true;
      if (!pendingOwnerHistoryNavigation.restoring) pendingOwnerHistoryNavigation = undefined;
    }
    return;
  }
  if (choice === 'save') {
    if (!current) return;
    const inlineCreate = current === createForm && current.closest('dialog') !== dialog;
    if (inlineCreate) {
      setHidden(exitPrompt, true);
      if (dialog?.open) dialog.close();
      current.querySelector<HTMLElement>('input:not([type="hidden"]), textarea')?.focus();
    }
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
  initializeOwnerHistory();
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
    if (!(navigation instanceof HTMLFormElement)) return;
    if (navigation.hasAttribute('data-catalog-search-form')) {
      event.preventDefault();
      catalogSearchQuery = String(field(navigation, 'buscarCatalogo')?.value ?? '').trim();
      catalogPageNumber = 1;
      if (catalogEntries === undefined || catalogNeedsRefresh) return;
      renderCatalogResults();
      const matches = (catalogEntries ?? []).filter((item) => catalogMatchesQuery(item, catalogSearchQuery)).length;
      announce(statusFor('referencia'), matches
        ? `${matches} ${matches === 1 ? 'resultado' : 'resultados'} para la búsqueda.`
        : 'No hay recursos que coincidan con la búsqueda.', 'info');
      return;
    }
    if (navigation.hasAttribute('data-link-filters')) {
      event.preventDefault();
      const query = creatorOwnerLinksQueryFromForm(navigation, currentLinksQuery());
      query.paginaEnlaces = 1;
      updateLinksQuery(query);
      return;
    }
    if (!navigation.hasAttribute('data-owner-navigation') || !hasPendingChanges()) return;
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

  const linkEditForm = linkForm();
  if (linkEditForm) {
    onWrite(linkEditForm, async (event) => {
      event.preventDefault();
      activeForm = linkEditForm;
      await saveLinkForm(linkEditForm);
    });
  }
  const addForm = addLinkForm();
  if (addForm) {
    onWrite(addForm, async (event) => {
      event.preventDefault();
      activeForm = addForm;
      await saveAddedLink(addForm);
    });
  }
  const reference = catalogForm();
  if (reference) {
    onWrite(reference, async (event) => {
      event.preventDefault();
      activeForm = reference;
      await saveCatalogReference(reference);
    });
  }
  const requestClaim = claimForm();
  if (requestClaim) {
    onWrite(requestClaim, async (event) => {
      event.preventDefault();
      activeForm = requestClaim;
      await submitClaimForm(requestClaim);
    });
  }
  const movementForm = moveForm();
  if (movementForm) {
    onWrite(movementForm, async (event) => {
      event.preventDefault();
      activeForm = movementForm;
      await saveMoveForm(movementForm);
    });
  }

  restoreLinksFromLocation();
  renderClaimHistory();
  if (root.querySelector('[data-owner-claims]')) void loadCatalog();

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    const control = target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const filterForm = control.form;
    if (control.matches('[data-link-search]')) {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const query = filterForm?.hasAttribute('data-link-filters')
          ? creatorOwnerLinksQueryFromForm(filterForm, currentLinksQuery())
          : currentLinksQuery();
        query.buscar = control.value;
        query.paginaEnlaces = 1;
        updateLinksQuery(query, 'replace');
        control.focus();
      }, 120);
      return;
    }
    const form = control.form;
    const name = form?.dataset.ownerForm;
    if (!form || !name) return;
    if (name === 'mover-enlace' && control.name === 'targetPosition' && activeMoveContext) {
      const target = state?.links.find(({ placementId }) => placementId === activeMoveContext?.placementId);
      if (target) setMoveDescription(form, target);
      control.setCustomValidity?.('');
      return;
    }
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

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.tagName !== 'SELECT') return;
    const control = target as HTMLSelectElement;
    const filterForm = control.form;
    if (!filterForm?.hasAttribute('data-link-filters')) return;
    if (searchTimer) clearTimeout(searchTimer);
    const query = creatorOwnerLinksQueryFromForm(filterForm, currentLinksQuery());
    query.paginaEnlaces = 1;
    updateLinksQuery(query);
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.tagName === 'INPUT' && target.matches('[data-catalog-select]')) {
      selectCatalogItem(target as HTMLInputElement);
      return;
    }
    if (target instanceof HTMLElement && target.tagName === 'INPUT' && target.matches('[data-catalog-directory]')) {
      updateCatalogOptionCorrection();
    }
  });

  root.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const claimOpenButton = target.closest<HTMLElement>('[data-claim-open]');
    if (claimOpenButton) {
      event.preventDefault();
      if (hasPendingChanges()) showExitPrompt(() => openClaimRequest(claimOpenButton), claimOpenButton);
      else openClaimRequest(claimOpenButton);
      return;
    }
    const claimDeselectButton = target.closest<HTMLButtonElement>('[data-claim-deselect]');
    if (claimDeselectButton) {
      event.preventDefault();
      const resourceId = claimDeselectButton.dataset.claimDeselect;
      if (!resourceId || !claimSelection.has(resourceId)) return;
      const restoreSelectionFocus = document.activeElement === claimDeselectButton;
      const selectionOrder = [...claimSelection.keys()];
      const removedIndex = selectionOrder.indexOf(resourceId);
      const nextFocusId = selectionOrder.slice(removedIndex + 1).find((id) => id !== resourceId)
        ?? selectionOrder.slice(0, removedIndex).reverse().find((id) => id !== resourceId);
      claimSelection.delete(resourceId);
      claimSelectionRevisions.set(resourceId, (claimSelectionRevisions.get(resourceId) ?? 0) + 1);
      claimStalePairs.delete(resourceId);
      setCatalogSelectionLabel();
      renderCatalogResults();
      if (restoreSelectionFocus) {
        const remainingRemove = nextFocusId
          ? [...(catalogControl<HTMLUListElement>('[data-claim-selection]')
            ?.querySelectorAll<HTMLButtonElement>('[data-claim-deselect]') ?? [])]
            .find((button) => button.dataset.claimDeselect === nextFocusId)
          : undefined;
        const matchingCheckbox = [...(catalogControl<HTMLUListElement>('[data-catalog-results]')
          ?.querySelectorAll<HTMLInputElement>('[data-catalog-select]') ?? [])]
          .find((checkbox) => checkbox.closest<HTMLElement>('[data-catalog-row]')?.dataset.catalogRow === resourceId);
        (remainingRemove ?? matchingCheckbox ?? catalogControl<HTMLInputElement>('[data-catalog-search]'))?.focus();
      }
      return;
    }
    const claimCheckButton = target.closest<HTMLButtonElement>('[data-claim-check]');
    if (claimCheckButton) {
      event.preventDefault();
      void checkClaimHistory();
      return;
    }
    const catalogOpenButton = target.closest<HTMLElement>('[data-catalog-open]');
    if (catalogOpenButton) {
      event.preventDefault();
      if (hasPendingChanges()) showExitPrompt(() => openCatalog(catalogOpenButton), catalogOpenButton);
      else openCatalog(catalogOpenButton);
      return;
    }
    const catalogRetryButton = target.closest<HTMLButtonElement>('[data-catalog-retry], [data-claim-index-retry]');
    if (catalogRetryButton) {
      event.preventDefault();
      await loadCatalog({ refresh: true });
      return;
    }
    const catalogPageButton = target.closest<HTMLButtonElement>('[data-catalog-page]');
    if (catalogPageButton) {
      event.preventDefault();
      const direction = catalogPageButton.dataset.catalogPage;
      const matches = (catalogEntries ?? []).filter((item) => catalogMatchesQuery(item, catalogSearchQuery));
      const pageCount = Math.max(1, Math.ceil(matches.length / 25));
      if (direction === 'previous') catalogPageNumber = Math.max(1, catalogPageNumber - 1);
      if (direction === 'next') catalogPageNumber = Math.min(pageCount, catalogPageNumber + 1);
      renderCatalogResults();
      const focusTarget = catalogControl<HTMLButtonElement>(`[data-catalog-page="${direction}"]`);
      const availableFocusTarget = focusTarget && !focusTarget.disabled
        ? focusTarget
        : catalogControl<HTMLButtonElement>(`[data-catalog-page="${direction === 'next' ? 'previous' : 'next'}"]`);
      if (availableFocusTarget && !availableFocusTarget.disabled) availableFocusTarget.focus();
      return;
    }
    const catalogCorrectionOpen = target.closest<HTMLButtonElement>('[data-catalog-correction-open]');
    if (catalogCorrectionOpen) {
      event.preventDefault();
      openCatalogCorrectionOptions(catalogCorrectionOpen);
      return;
    }
    const moveSuggestion = target.closest<HTMLButtonElement>('[data-link-move-suggestion]');
    if (moveSuggestion) {
      event.preventDefault();
      const form = moveForm();
      const input = form && movePositionInput(form);
      const requested = Number(moveSuggestion.dataset.viablePosition);
      const link = activeMoveContext && state?.links.find(({ placementId }) => placementId === activeMoveContext?.placementId);
      const group = link ? creatorOwnerLinkGroup(state?.links ?? [], link.featured) : [];
      if (!form || activeEditor !== 'mover-enlace' || !input || !Number.isSafeInteger(requested)
        || requested < 1 || requested > group.length || !link) return;
      input.value = String(requested);
      input.setCustomValidity('');
      setMoveDescription(form, link);
      input.focus();
      return;
    }
    const addOpen = target.closest<HTMLElement>('[data-link-add-open]');
    if (addOpen) {
      event.preventDefault();
      if (hasPendingChanges()) showExitPrompt(() => openAddLink(addOpen), addOpen);
      else openAddLink(addOpen);
      return;
    }
    const addOptions = target.closest<HTMLButtonElement>('[data-link-add-options]');
    if (addOptions) {
      event.preventDefault();
      reviewPendingSharedAddOptions(addOptions);
      return;
    }
    const linkEdit = target.closest<HTMLElement>('[data-link-edit]');
    if (linkEdit) {
      event.preventDefault();
      if (hasPendingChanges()) showExitPrompt(() => openLinkContext(linkEdit), linkEdit);
      else openLinkContext(linkEdit);
      return;
    }
    const linkMove = target.closest<HTMLElement>('[data-link-move]');
    if (linkMove) {
      event.preventDefault();
      if (writeGuard?.isActive()) {
        showExitPrompt(undefined, linkMove);
        return;
      }
      if (hasPendingChanges()) showExitPrompt(() => openMoveContext(linkMove), linkMove);
      else openMoveContext(linkMove);
      return;
    }
    const removeLink = target.closest<HTMLElement>('[data-link-remove]');
    if (removeLink) {
      event.preventDefault();
      const placementId = removeLink.dataset.placementId || removeLink.closest<HTMLElement>('[data-link-row]')?.dataset.linkRow;
      if (!placementId) return;
      const action = () => { void runProfileFormAction(event, () => removeOwnerLink(placementId)); };
      if (hasPendingChanges()) showExitPrompt(action, removeLink);
      else action();
      return;
    }
    const reinclude = target.closest<HTMLElement>('[data-link-reinclude]');
    if (reinclude) {
      event.preventDefault();
      const resourceId = reinclude.dataset.resourceId;
      const resourceVersion = Number(reinclude.dataset.resourceVersion);
      if (!resourceId || !Number.isSafeInteger(resourceVersion) || resourceVersion < 0) return;
      const action = () => { void runProfileFormAction(event, () => reincludeResource(resourceId, resourceVersion)); };
      if (hasPendingChanges()) showExitPrompt(action, reinclude);
      else action();
      return;
    }
    const pageLink = target.closest<HTMLAnchorElement>('[data-link-page]');
    if (pageLink) {
      if (!isSameTabNavigationClick(event, pageLink)) return;
      event.preventDefault();
      const parsed = parseCreatorOwnerLinksQuery(new URL(pageLink.href, window.location.href).searchParams, state?.series ?? []);
      const pageLabel = pageLink.textContent?.trim();
      if (parsed.valid) updateLinksQuery(parsed.query, 'push', pageLabel === 'Anterior' ? 'Anterior' : 'Siguiente');
      return;
    }
    const editButton = target.closest<HTMLElement>('[data-owner-edit]');
    const editName = editButton?.dataset.ownerEdit;
    if (editName === 'datos' || editName === 'redes' || editName === 'foto') {
      if (!editButton) return;
      if (hasPendingChanges()) {
        event.preventDefault();
        showExitPrompt(() => openEditor(editName, editButton), editButton);
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
    if (compareButton && activeForm && activeEditor === 'referencia') {
      event.preventDefault();
      void compareCatalogProfile(activeForm);
      return;
    }
    if (compareButton && activeForm && activeEditor === 'enlace') {
      event.preventDefault();
      void compareSavedLink(activeForm);
      return;
    }
    if (compareButton && activeForm && activeEditor === 'mover-enlace') {
      event.preventDefault();
      void compareSavedMove(activeForm);
      return;
    }
    if (compareButton && activeForm && (conflictName === 'crear' || activeEditor === 'datos' || activeEditor === 'redes')) {
      event.preventDefault();
      void compareSavedVersion(activeForm, conflictName === 'crear' ? 'crear' : activeEditor as 'datos' | 'redes');
      return;
    }
    const adoptButton = target.closest('[data-owner-adopt]');
    if (adoptButton && activeForm && activeEditor === 'referencia') {
      event.preventDefault();
      adoptCatalogProfile(activeForm);
      return;
    }
    if (adoptButton && activeForm && activeEditor === 'enlace') {
      event.preventDefault();
      adoptSavedLink(activeForm);
      return;
    }
    if (adoptButton && activeForm && activeEditor === 'mover-enlace') {
      event.preventDefault();
      adoptSavedMove(activeForm);
      return;
    }
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
    const publishCheck = target.closest<HTMLButtonElement>('[data-owner-publish-check]');
    if (publishCheck) {
      event.preventDefault();
      void checkUncertainPublication();
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
      if (uncertainPublishIntent) {
        announcePublicationStatus('Comprueba el estado guardado antes de volver a intentar publicar.');
        return;
      }
      if (sessionRecovery?.blocksWrites()) {
        sessionRecovery.announceBlocked();
        return;
      }
      void writeGuard?.run(event, async () => {
        ownerWriteRevision += 1;
        try {
          const response = await jsonRequest('/api/creador/perfil/publicar', 'POST', { version: profile.version });
          if (!response.ok) {
            if (response.status >= 500) {
              requirePublicationCheck(profile);
            } else if (response.status === 409) {
              requirePublicationCheck(
                profile,
                'El perfil cambió antes de publicar. Comprueba el estado guardado para continuar con la versión actual.',
              );
            } else if (sessionRecovery?.blocksWrites()) {
              const profileStatus = statusFor(undefined);
              if (profileStatus?.textContent === OWNER_ACTIVE_WRITE_EXIT_MESSAGE) clearAnnouncement(profileStatus);
              if (pageStatus?.textContent === OWNER_ACTIVE_WRITE_EXIT_MESSAGE) clearAnnouncement(pageStatus);
            } else {
              announceWrite(undefined, statusMessage(response.status), 'error');
            }
            return;
          }
          const payload = await responsePayload(response);
          const changes = await readCreatorVersionChanges(response);
          const published = payload?.profile;
          if (response.status !== 200 || !isProfile(published) || !profile
            || published.id !== profile.id || published.published !== true || published.hidden !== profile.hidden
            || published.displayName !== profile.displayName || published.slug !== profile.slug
            || published.city !== profile.city || published.country !== profile.country
            || JSON.stringify(published.programs) !== JSON.stringify(profile.programs)
            || published.bio !== profile.bio || JSON.stringify(published.socials) !== JSON.stringify(profile.socials)
            || JSON.stringify(published.photo) !== JSON.stringify(profile.photo)
            || !validateReceipt(changes, profile, published)) {
            requirePublicationCheck(profile);
            return;
          }
          updateProfileState(published);
          clearRecoveryNotice();
          hydrateInactiveForms();
          announcePublicationStatus(published.hidden
            ? 'La página está publicada, pero sigue oculta por administración.'
            : 'Tu página ya está publicada y visible al público.', 'success');
        } catch {
          requirePublicationCheck(profile);
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
    if (navigation) guardOwnerNavigationClick(event, navigation);
  });

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    requestClose();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) requestClose();
  });
  window.addEventListener('beforeunload', (event) => {
    if (!writeGuard?.isActive() && !hasPendingChanges()) return;
    event.preventDefault();
  });
  window.addEventListener('popstate', (event) => handleOwnerPopstate(event));
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const navigation = target.closest<HTMLAnchorElement>('a[href]');
    if (!navigation || !navigation.closest('.site-header')) return;
    const createForm = formFor('crear');
    const returnFocusTarget = activeForm && activeForm === createForm
      ? activeForm.querySelector<HTMLElement>('input:not([type="hidden"]), textarea')
      : null;
    guardOwnerNavigationClick(event, navigation, returnFocusTarget);
  });

} else if (root) {
  announce(pageStatus, 'No pudimos leer los datos de tu página. Recarga para volver a intentarlo.', 'error');
}

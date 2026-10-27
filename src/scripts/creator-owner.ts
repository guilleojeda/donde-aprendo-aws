import type { CreatorEditableResourceDTO, CreatorEditorDTO, CreatorLinkDTO, CreatorProfileDTO, CreatorProgram, CreatorSocial } from '../types/creators';
import { createCreatorFormState, type FormValueSnapshot } from './creator-form-state';
import { createCreatorSessionRecovery } from './creator-session-recovery';
import { createCreatorWriteGuard, readCreatorVersionChanges } from './creator-write-state';
import {
  creatorOwnerLinksCountLabel,
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

function isCreatorLink(value: unknown): value is CreatorLinkDTO {
  return isRecord(value)
    && typeof value.placementId === 'string' && value.placementId.length > 0
    && typeof value.resourceId === 'string' && value.resourceId.length > 0
    && typeof value.title === 'string' && typeof value.url === 'string'
    && typeof value.featured === 'boolean' && Number.isSafeInteger(value.position)
    && typeof value.selectedForDirectory === 'boolean' && typeof value.hidden === 'boolean'
    && typeof value.directoryApproval === 'string'
    && Number.isSafeInteger(value.resourceVersion) && Number(value.resourceVersion) >= 0
    && Number.isSafeInteger(value.placementVersion) && Number(value.placementVersion) >= 0
    && Array.isArray(value.series);
}

function isEditableResource(value: unknown): value is CreatorEditableResourceDTO {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0
    && typeof value.title === 'string' && typeof value.url === 'string'
    && Number.isSafeInteger(value.version) && Number(value.version) >= 0;
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

const formState = root ? createCreatorFormState(root) : undefined;
const writeGuard = root ? createCreatorWriteGuard(root) : undefined;
let csrfToken = root?.dataset.csrf;
let activeForm: HTMLFormElement | undefined;
let activeEditor: 'datos' | 'redes' | 'foto' | 'enlace' | 'alta-enlace' | undefined;
let returnFocus: HTMLElement | undefined;
let pendingExitAction: (() => void) | undefined;
let conflictProfile: CreatorProfileDTO | undefined;
let activeLinkContext: { kind: 'placement'; placementId: string } | { kind: 'resource'; resourceId: string } | undefined;
let conflictLinkData: CreatorEditorDTO | undefined;
let linkContextRevision = 0;
let linkCompareGeneration = 0;
let conflictLinkContextRevision: number | undefined;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
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
  if (name === 'alta-enlace') return root?.querySelector<HTMLElement>('[data-link-add-status]') ?? null;
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

function resetAddedLinkForm(form: HTMLFormElement) {
  const title = field(form, 'title');
  const url = field(form, 'url');
  const description = field(form, 'description');
  const selected = field(form, 'selectedForDirectory') as HTMLInputElement | null;
  if (title) title.value = '';
  if (url) url.value = '';
  if (description) description.value = '';
  if (selected) selected.checked = true;
  formState?.commit(capture(form));
}

function hideDialogForms() {
  dialog?.querySelectorAll<HTMLFormElement>('form[data-owner-form]').forEach((form) => { form.hidden = true; });
}

function showDialogForm(form: HTMLFormElement, name: NonNullable<typeof activeEditor>, title: string, trigger?: HTMLElement) {
  if (!dialog) return;
  hideDialogForms();
  form.hidden = false;
  setHidden(exitPrompt, true);
  const heading = root?.querySelector<HTMLElement>('[data-owner-dialog-title]');
  if (heading) heading.textContent = title;
  activeForm = form;
  activeEditor = name;
  returnFocus = trigger ?? returnFocus;
  dialog.showModal();
  const first = form.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, button');
  window.requestAnimationFrame(() => first?.focus?.());
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

function openLinkContext(trigger: HTMLElement) {
  if (!state?.profile || !dialog) return;
  const resourceId = trigger.dataset.resourceId;
  const row = trigger.closest<HTMLElement>('[data-link-row]');
  const placementId = trigger.dataset.placementId || row?.dataset.linkRow;
  const form = linkForm();
  if (!form) return;

  if (resourceId) {
    const resource = state.editableResources.find((item) => item.id === resourceId);
    if (!resource || state.links.some((link) => link.resourceId === resourceId)) return;
    linkContextRevision += 1;
    activeLinkContext = { kind: 'resource', resourceId };
    setLinkFormValues(form, resource, 'resource');
    showDialogForm(form, 'enlace', `Editar ficha: ${resource.title}`, trigger);
    return;
  }
  const link = state.links.find((item) => item.placementId === placementId);
  if (!link) return;
  const resource = state.editableResources.find((item) => item.id === link.resourceId);
  linkContextRevision += 1;
  activeLinkContext = { kind: 'placement', placementId: link.placementId };
  setLinkFormValues(form, link, resource ? 'placement-own' : 'placement-shared');
  showDialogForm(form, 'enlace', resource ? `Editar ficha: ${link.title}` : `Editar opciones: ${link.title}`, trigger);
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
    state?.profile?.hidden ? 'Página oculta por administración'
      : !state?.profile?.published ? 'No pública hasta publicar'
        : link.hidden ? 'Oculta en la página pública' : 'Visible en la página pública',
  ];
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
  edit.textContent = state?.editableResources.some(({ id }) => id === link.resourceId) ? 'Editar ficha' : 'Editar opciones';
  const remove = document.createElement('button');
  remove.className = 'button button--outline';
  remove.type = 'button';
  remove.dataset.linkRemove = '';
  remove.dataset.placementId = link.placementId;
  remove.textContent = 'Quitar de tu página';
  actions.append(edit, remove);
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

function updateLinksQuery(query: CreatorOwnerLinksQuery, historyMode: 'push' | 'replace' = 'push') {
  const effectiveQuery = renderOwnerLinks(query) ?? query;
  const href = creatorOwnerLinksHref(effectiveQuery, effectiveQuery.paginaEnlaces);
  if (historyMode === 'push') window.history.pushState({}, '', href);
  else window.history.replaceState({}, '', href);
  const filterForm = root?.querySelector<HTMLFormElement>('[data-link-filters]');
  if (filterForm) {
    const page = field(filterForm, 'paginaEnlaces');
    if (page) page.value = String(effectiveQuery.paginaEnlaces);
    for (const name of ['buscar', 'serie', 'directorio', 'destacado', 'orden']) {
      const control = field(filterForm, name);
      if (control) control.value = effectiveQuery[name as 'buscar' | 'serie' | 'directorio' | 'destacado' | 'orden'];
    }
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
    window.history.replaceState({}, '', creatorOwnerLinksHref(effective));
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
  conflictLinkData = undefined;
  conflictLinkContextRevision = undefined;
  linkCompareGeneration += 1;
  const box = form?.querySelector<HTMLElement>('[data-owner-conflict]');
  setHidden(box, true);
  const comparison = box?.querySelector<HTMLElement>('[data-owner-comparison]');
  if (comparison) comparison.textContent = '';
  setHidden(comparison, true);
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
  linkContextRevision += 1;
  linkCompareGeneration += 1;
  if (!hasPendingChanges() && !sessionRecovery?.blocksWrites()) clearRecoveryNotice();
  if (activeEditor) clearConflict(formFor(activeEditor) ?? undefined);
  if (dialog?.open) dialog.close();
  setHidden(exitPrompt, true);
  if (activeEditor) {
    const form = formFor(activeEditor);
    if (form) form.hidden = true;
  }
  activeEditor = undefined;
  activeLinkContext = undefined;
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
    const title = field(form, 'title');
    const url = field(form, 'url');
    const description = field(form, 'description');
    const selected = field(form, 'selectedForDirectory') as HTMLInputElement | null;
    if (title) title.value = '';
    if (url) url.value = '';
    if (description) description.value = '';
    if (selected) selected.checked = true;
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

function changesEqual(
  actual: Awaited<ReturnType<typeof readCreatorVersionChanges>>,
  expected: Array<{ entity: 'profile' | 'resource' | 'placement'; id: string; before: number; after: number }>,
): boolean {
  if (!actual || actual.length !== expected.length) return false;
  const key = (change: { entity: string; id: string }) => `${change.entity}:${change.id}`;
  const byKey = new Map(actual.map((change) => [key(change), change]));
  return expected.every((change) => {
    const observed = byKey.get(key(change));
    return observed?.before === change.before && observed.after === change.after;
  });
}

function showLinkConflict(form: HTMLFormElement, message = 'El enlace cambió desde que abriste esta edición. Compara lo guardado con tu corrección antes de decidir cómo seguir.') {
  const conflict = form.querySelector<HTMLElement>('[data-link-conflict]');
  setHidden(conflict, false);
  const copy = conflict?.querySelector<HTMLElement>('[data-owner-conflict-copy]');
  if (copy) copy.textContent = message;
  announceWrite('enlace', statusMessage(409), 'error');
}

function updateLinkState(next: CreatorLinkDTO, profileVersion: number) {
  if (!state?.profile) return;
  placementIdByResource.set(next.resourceId, next.placementId);
  state.links = state.links.map((link) => link.placementId === next.placementId ? next : link);
  const resourceIndex = state.editableResources.findIndex(({ id }) => id === next.resourceId);
  if (resourceIndex >= 0) {
    state.editableResources[resourceIndex] = {
      id: next.resourceId, title: next.title, url: next.url,
      description: next.description ?? '', version: next.resourceVersion,
    };
  }
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
  const title = String(data.get('title') ?? '').trim();
  const url = String(data.get('url') ?? '').trim();
  const description = String(data.get('description') ?? '').trim();
  if (!form.reportValidity()) return;
  form.setAttribute('aria-busy', 'true');
  try {
    if (context.kind === 'resource') {
      const current = state.editableResources.find(({ id }) => id === context.resourceId);
      if (!current || state.links.some((link) => link.resourceId === context.resourceId)) {
        announceWrite('enlace', 'La ficha ya no está retirada. Actualiza la página antes de editarla.', 'error');
        return;
      }
      const changed = title !== current.title || url !== current.url || description !== (current.description ?? '');
      if (!changed) {
        formState?.commit(snapshot);
        announceWrite('enlace', 'No hay cambios en la ficha.', 'info');
        maybeExitAfterSave(!hasPendingChanges());
        return;
      }
      const response = await jsonRequest(`/api/creador/recursos/${encodeURIComponent(current.id)}`, 'PATCH', {
        title, url, description, version: current.version,
      });
      if (!response.ok) {
        if (response.status === 409) showLinkConflict(form);
        else announceWrite('enlace', statusMessage(response.status), 'error');
        return;
      }
      const payload = await responsePayload(response);
      const changes = await readCreatorVersionChanges(response);
      const resource = payload?.resource;
      if (!isEditableResource(resource) || resource.id !== current.id || changes === null
        || resource.version !== current.version + 1
        || !changesEqual(changes, [{ entity: 'resource', id: current.id, before: current.version, after: resource.version }])) {
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
        announceWrite('enlace', 'Ficha guardada. Ya puedes volver a agregarla a tu página.', 'success');
      } else announceWrite('enlace', 'Ficha guardada. Conservamos la corrección que escribiste mientras se guardaba; revísala antes de seguir.', 'success');
      maybeExitAfterSave(unchanged);
      return;
    }

    const current = state.links.find(({ placementId }) => placementId === context.placementId);
    if (!current) {
      announceWrite('enlace', 'Este enlace ya no está en tu página. Actualiza la lista antes de guardarlo.', 'error');
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
    const resourceChanged = Object.keys(metadataChanges).length > 0;
    const placementChanged = featured !== current.featured || selectedForDirectory !== current.selectedForDirectory;
    const body: Record<string, unknown> = {
      profileVersion: state.profile.version,
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
    const changed = resourceChanged || placementChanged;
    const expected: Array<{ entity: 'profile' | 'resource' | 'placement'; id: string; before: number; after: number }> = [];
    if (resourceChanged) expected.push({ entity: 'resource', id: current.resourceId, before: current.resourceVersion, after: current.resourceVersion + 1 });
    if (placementChanged) expected.push({ entity: 'placement', id: current.placementId, before: current.placementVersion ?? -1, after: (current.placementVersion ?? -1) + 1 });
    if (changed) expected.push({ entity: 'profile', id: state.profile.id, before: state.profile.version, after: state.profile.version + 1 });
    const compatible = isCreatorLink(next)
      && next.placementId === current.placementId && next.resourceId === current.resourceId
      && next.title === (metadataChanges.title ?? current.title)
      && next.url === (metadataChanges.url ?? current.url)
      && (next.description ?? '') === (metadataChanges.description ?? current.description ?? '')
      && next.featured === featured && next.selectedForDirectory === selectedForDirectory
      && next.resourceVersion === current.resourceVersion + Number(resourceChanged)
      && next.placementVersion === (current.placementVersion ?? -1) + Number(placementChanged)
      && next.position === current.position && next.hidden === current.hidden
      && next.directoryApproval === current.directoryApproval
      && JSON.stringify(next.series) === JSON.stringify(current.series)
      && changesEqual(changes, expected);
    if (!payload || !compatible) {
      showLinkConflict(form, 'La respuesta no corresponde a las versiones observadas o a esta edición. Conservamos tu corrección y no adoptamos un estado que no pudimos comprobar.');
      announceWrite('enlace', 'No pudimos comprobar el recibo de versión del enlace. Conservamos tu edición para revisarla.', 'error');
      return;
    }
    const nextProfileVersion = changed ? state.profile.version + 1 : state.profile.version;
    updateLinkState(next, nextProfileVersion);
    const matchesCurrentQuery = ownerLinkMatchesCurrentQuery(next.placementId);
    clearRecoveryNotice();
    const unchanged = submitWasUnchanged(snapshot);
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

async function reconcileOwnerData(): Promise<boolean> {
  try {
    const response = await fetch('/api/creador/perfil/', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
    if (response.status === 401) await sessionRecovery?.observeWriteResponse(response);
    if (!response.ok) return false;
    const payload = await responsePayload(response);
    if (!payload || !isOwnerData(payload) || !state?.profile || payload.profile?.id !== state.profile.id) return false;
    state.profile = payload.profile;
    state.links = payload.links;
    state.editableResources = payload.editableResources;
    state.series = payload.series;
    payload.links.forEach(({ resourceId, placementId }) => placementIdByResource.set(resourceId, placementId));
    updateProfileView();
    return true;
  } catch {
    return false;
  }
}

async function saveAddedLink(form: HTMLFormElement) {
  if (!state?.profile) {
    announceWrite('alta-enlace', 'Primero crea el borrador de tu página para agregar contenido.', 'error');
    return;
  }
  const snapshot = capture(form);
  const data = new FormData(form);
  const title = String(data.get('title') ?? '').trim();
  const url = String(data.get('url') ?? '').trim();
  const description = String(data.get('description') ?? '').trim();
  const selectedForDirectory = Boolean((field(form, 'selectedForDirectory') as HTMLInputElement | null)?.checked);
  if (!form.reportValidity()) return;
  form.setAttribute('aria-busy', 'true');
  try {
    const response = await jsonRequest('/api/creador/enlaces', 'POST', { title, url, description, selectedForDirectory });
    if (!response.ok) {
      announceWrite('alta-enlace', statusMessage(response.status), 'error');
      return;
    }
    const payload = await responsePayload(response);
    if (!payload || !isCreatorLink(payload.link)) {
      announceWrite('alta-enlace', 'El servicio respondió sin una ficha que podamos verificar. Conservamos el formulario; comprueba el estado antes de volver a enviarlo.', 'error');
      return;
    }
    const link = payload.link;
    if (payload.created !== true) {
      const changes = await readCreatorVersionChanges(response);
      if (response.status !== 200 || !changesEqual(changes, [])) {
        announceWrite('alta-enlace', 'El servicio encontró una URL existente, pero no pudimos verificar su respuesta. Conservamos el formulario para revisar la lista.', 'error');
        return;
      }
      if (!await reconcileOwnerData()) {
        announceWrite('alta-enlace', 'El enlace ya existía o la solicitud anterior pudo completarse. Conservamos el formulario y no cambiamos sus opciones; actualiza la lista antes de volver a intentar.', 'error');
        return;
      }
      const unchanged = submitWasUnchanged(snapshot);
      const existing = state?.links.find((item) => item.url === url);
      const matchesCurrentQuery = existing ? ownerLinkMatchesCurrentQuery(existing.placementId) : true;
      if (unchanged) {
        resetAddedLinkForm(form);
        restoreLinkFocus(existing ? { kind: 'placement', placementId: existing.placementId } : undefined);
        announceWrite('alta-enlace', `Ese enlace ya estaba en tu página. No duplicamos la ficha ni cambiamos sus opciones.${matchesCurrentQuery ? '' : ' No coincide con los filtros actuales.'}`, 'success');
      } else announceWrite('alta-enlace', `Ese enlace ya estaba en tu página. Conservamos la corrección que escribiste mientras se comprobaba.${matchesCurrentQuery ? '' : ' No coincide con los filtros actuales.'}`, 'info');
      maybeExitAfterSave(unchanged);
      return;
    }
    const changes = await readCreatorVersionChanges(response);
    const profile = state.profile;
    const maxPosition = state.links.reduce((max, item) => Math.max(max, item.position), -1);
    const resourceChange = changes?.find((change) => change.entity === 'resource' && change.id === link.resourceId);
    const newResource = Boolean(resourceChange && resourceChange.before === 0 && resourceChange.after === link.resourceVersion);
    const attachedResource = !resourceChange && link.url === url;
    const commonChanges = [
      { entity: 'profile' as const, id: profile.id, before: profile.version, after: profile.version + 1 },
      { entity: 'placement' as const, id: link.placementId, before: 0, after: link.placementVersion ?? -1 },
    ];
    const expectedChanges = newResource && resourceChange
      ? [...commonChanges.slice(0, 1), { entity: 'resource' as const, id: link.resourceId, before: 0, after: link.resourceVersion }, commonChanges[1]]
      : commonChanges;
    const validResourceShape = newResource
      ? link.resourceVersion === 1 && link.title === title && link.description === description
      : attachedResource;
    const validReceipt = response.status === 201 && link.url === url && validResourceShape
      && link.selectedForDirectory === selectedForDirectory && link.featured === false
      && link.series.length === 0 && link.position > maxPosition
      && (!placementIdByResource.has(link.resourceId) || placementIdByResource.get(link.resourceId) === link.placementId)
      && changesEqual(changes, expectedChanges);
    if (!validReceipt) {
      announceWrite('alta-enlace', 'No pudimos comprobar el recibo del enlace. Conservamos el formulario para revisar el estado antes de volver a enviarlo.', 'error');
      return;
    }
    state.links.push(link);
    placementIdByResource.set(link.resourceId, link.placementId);
    if (newResource && !state.editableResources.some(({ id }) => id === link.resourceId)) {
      state.editableResources.push({ id: link.resourceId, title: link.title, url: link.url, description: link.description ?? '', version: link.resourceVersion });
    }
    state.profile = { ...profile, version: profile.version + 1 };
    root?.setAttribute('data-profile-version', String(state.profile.version));
    renderOwnerLinks();
    const matchesCurrentQuery = ownerLinkMatchesCurrentQuery(link.placementId);
    clearRecoveryNotice();
    const unchanged = submitWasUnchanged(snapshot);
    const visibility = `${state.profile.hidden
      ? ' La página sigue oculta por administración.'
      : !state.profile.published ? ' Se verá cuando tu página esté publicada.'
        : link.hidden ? ' La ficha está oculta en la página pública.'
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
      announceWrite('alta-enlace', `Enlace agregado. Conservamos la corrección que escribiste durante el guardado; revísala antes de seguir.${visibility}${filterMessage}`, 'success');
    }
    maybeExitAfterSave(unchanged);
  } catch {
    announceWrite('alta-enlace', 'No pudimos confirmar la respuesta del servicio. El formulario sigue abierto; puedes reintentar la URL, que se resolverá sin duplicar su ficha.', 'error');
  } finally {
    form.removeAttribute('aria-busy');
  }
}

async function reincludeResource(resourceId: string, observedVersion: number) {
  if (!state?.profile) return;
  const resource = state.editableResources.find(({ id }) => id === resourceId);
  if (!resource || resource.version !== observedVersion || state.links.some((link) => link.resourceId === resourceId)) {
    announceWrite('enlace', 'La ficha cambió desde que se mostró esta opción. Actualiza la lista antes de reincorporarla.', 'error');
    return;
  }
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
      if (!await reconcileOwnerData()) announceWrite('enlace', 'El enlace ya estaba en tu página. Actualiza la lista para comprobar su estado.', 'error');
      else announceWrite('enlace', 'El enlace ya estaba en tu página. No cambiamos sus opciones.', 'info');
      return;
    }
    const changes = await readCreatorVersionChanges(response);
    const currentProfile = state.profile;
    const maxPosition = state.links.reduce((max, item) => Math.max(max, item.position), -1);
    const validReceipt = response.status === 201 && link.title === resource.title && link.url === resource.url
      && link.resourceVersion === observedVersion && link.featured === false && link.selectedForDirectory === true
      && link.position > maxPosition && link.series.length === 0
      && (!placementIdByResource.has(resourceId) || placementIdByResource.get(resourceId) === link.placementId)
      && changesEqual(changes, [
        { entity: 'profile', id: currentProfile.id, before: currentProfile.version, after: currentProfile.version + 1 },
        { entity: 'placement', id: link.placementId, before: 0, after: link.placementVersion ?? -1 },
      ]);
    if (!validReceipt) {
      announceWrite('enlace', 'No pudimos comprobar el recibo de reincorporación. Conservamos la ficha y no la marcamos como agregada.', 'error');
      return;
    }
    state.links.push(link);
    placementIdByResource.set(link.resourceId, link.placementId);
    state.profile = { ...currentProfile, version: currentProfile.version + 1 };
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
    if (response.status !== 204 || !changesEqual(changes, [
      { entity: 'profile', id: profile.id, before: profile.version, after: profile.version + 1 },
    ])) {
      announceWrite('enlace', 'No pudimos comprobar que el enlace se quitó. Actualiza la lista antes de repetir la acción.', 'error');
      return;
    }
    state.links = state.links.filter((item) => item.placementId !== placementId);
    state.profile = { ...profile, version: profile.version + 1 };
    root?.setAttribute('data-profile-version', String(state.profile.version));
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
    const response = await fetch('/api/creador/perfil/', { method: 'GET', credentials: 'same-origin', cache: 'no-store' });
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
  state.profile = adopted.profile;
  state.links = adopted.links;
  state.editableResources = adopted.editableResources;
  state.series = adopted.series;
  adopted.links.forEach(({ resourceId, placementId }) => placementIdByResource.set(resourceId, placementId));
  root?.setAttribute('data-profile-version', String(adopted.profile.version));
  renderOwnerLinksAfterCollectionChange();
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
  clearConflict(form);
  formState?.commit(capture(form));
  announceWrite('enlace', 'Adoptaste expresamente la versión guardada. Si quieres, ahora puedes hacer otra corrección.', 'success');
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
    if (!(navigation instanceof HTMLFormElement)) return;
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

  restoreLinksFromLocation();

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

  root.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const addOpen = target.closest<HTMLElement>('[data-link-add-open]');
    if (addOpen) {
      event.preventDefault();
      if (hasPendingChanges()) showExitPrompt(() => openAddLink(addOpen), addOpen);
      else openAddLink(addOpen);
      return;
    }
    const linkEdit = target.closest<HTMLElement>('[data-link-edit]');
    if (linkEdit) {
      event.preventDefault();
      if (hasPendingChanges()) showExitPrompt(() => openLinkContext(linkEdit), linkEdit);
      else openLinkContext(linkEdit);
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
      event.preventDefault();
      const parsed = parseCreatorOwnerLinksQuery(new URL(pageLink.href, window.location.href).searchParams, state?.series ?? []);
      if (parsed.valid) updateLinksQuery(parsed.query);
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
    if (compareButton && activeForm && activeEditor === 'enlace') {
      event.preventDefault();
      void compareSavedLink(activeForm);
      return;
    }
    if (compareButton && activeForm && (conflictName === 'crear' || activeEditor === 'datos' || activeEditor === 'redes')) {
      event.preventDefault();
      void compareSavedVersion(activeForm, conflictName === 'crear' ? 'crear' : activeEditor as 'datos' | 'redes');
      return;
    }
    const adoptButton = target.closest('[data-owner-adopt]');
    if (adoptButton && activeForm && activeEditor === 'enlace') {
      event.preventDefault();
      adoptSavedLink(activeForm);
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
  window.addEventListener('popstate', () => restoreLinksFromLocation());

} else if (root) {
  announce(pageStatus, 'No pudimos leer los datos de tu página. Recarga para volver a intentarlo.', 'error');
}

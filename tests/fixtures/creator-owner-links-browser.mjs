import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { SurfaceElement as BrowserElement, SurfaceFormData as BrowserFormData } from './creator-owner-browser-dom.mjs';

const SITE_ORIGIN = 'https://donde-aprendo.example.invalid';
const controllerPath = new URL('../../src/scripts/creator-owner.ts', import.meta.url);
let controllerBundlePromise;

export function stablePlacementId(resourceId) {
  return `placement-${createHash('sha256').update(JSON.stringify(['creator-1', resourceId])).digest('hex')}`;
}

export function control(name, value = '', options = {}) {
  const element = new BrowserElement({ tagName: options.tagName ?? 'INPUT', name, value, type: options.type, dataset: options.dataset });
  element.checked = options.checked ?? false;
  return element;
}

function form(fields, dataset = {}) {
  const element = new BrowserElement({ tagName: 'FORM', dataset, lists: fields });
  element.elements = fields;
  for (const field of fields) field.form = element;
  return element;
}

function defaultProfile() {
  return {
    id: 'creator-1', displayName: 'Ana Creadora', slug: 'ana-creadora', version: 14,
    published: true, hidden: false, city: '', country: '', bio: '', programs: [], socials: {},
  };
}

export function createOwnerLinksSurface({ profile = defaultProfile(), links = [], editableResources = [], series = [], search = '', query = {} } = {}) {
  const document = { activeElement: null, listeners: new Map() };
  document.createElement = (tagName) => new BrowserElement({ tagName });
  const ownerButtons = ['datos', 'redes', 'foto'].map((name) => new BrowserElement({ tagName: 'BUTTON', dataset: { ownerEdit: name } }));
  const dataForm = form([
    control('displayName', profile.displayName), control('slug', profile.slug),
    control('version', String(profile.version), { type: 'hidden' }),
  ], { ownerForm: 'datos' });
  dataForm.hidden = true;
  const linkFields = [
    control('title'), control('url'), control('description', '', { tagName: 'TEXTAREA' }),
    control('featured', 'on', { type: 'checkbox' }),
    control('selectedForDirectory', 'on', { type: 'checkbox' }),
    control('resourceVersion', '', { type: 'hidden' }),
    control('placementVersion', '', { type: 'hidden' }),
    control('profileVersion', '', { type: 'hidden' }),
    control('version', '', { type: 'hidden' }),
  ];
  const metadataPanel = new BrowserElement({ dataset: { linkMetadataFields: '' }, lists: linkFields.slice(0, 3) });
  const optionsPanel = new BrowserElement({ dataset: { linkOptions: '' }, lists: linkFields.slice(3, 5) });
  const editStatus = new BrowserElement({ dataset: { linkEditStatus: '', ownerFormStatus: 'enlace' } });
  const comparison = new BrowserElement({ dataset: { ownerComparison: '' } });
  comparison.hidden = true;
  const conflict = new BrowserElement({ dataset: { ownerConflict: '', linkConflict: '' }, lists: [
    new BrowserElement({ dataset: { ownerConflictCopy: '' } }),
    new BrowserElement({ tagName: 'BUTTON', dataset: { ownerCompare: '' } }),
    comparison,
  ] });
  conflict.hidden = true;
  const linkCancel = new BrowserElement({ tagName: 'BUTTON', dataset: { ownerCancel: '', linkCancel: '' } });
  const linkSubmit = new BrowserElement({ tagName: 'BUTTON', type: 'submit' });
  const linkEditForm = form([metadataPanel, optionsPanel, ...linkFields.slice(5), editStatus, conflict, linkCancel, linkSubmit], { linkEditForm: '' });
  linkEditForm.elements = [...linkFields, editStatus, conflict, linkCancel, linkSubmit];
  for (const field of linkFields) field.form = linkEditForm;
  linkEditForm.hidden = true;
  const dialogTitle = new BrowserElement({ dataset: { ownerDialogTitle: '' } });
  const close = new BrowserElement({ tagName: 'BUTTON', dataset: { ownerClose: '' } });
  const exitPrompt = new BrowserElement({ dataset: { ownerExitPrompt: '' } });
  exitPrompt.hidden = true;
  const exitSave = new BrowserElement({ tagName: 'BUTTON', dataset: { ownerExitSave: '' } });
  const exitDiscard = new BrowserElement({ tagName: 'BUTTON', dataset: { ownerExitDiscard: '' } });
  const exitContinue = new BrowserElement({ tagName: 'BUTTON', dataset: { ownerExitContinue: '' } });
  exitSave.hidden = true;
  exitDiscard.hidden = true;
  exitContinue.hidden = true;
  exitPrompt.append(exitSave);
  exitPrompt.append(exitDiscard);
  exitPrompt.append(exitContinue);
  const dialogRecoveryShell = new BrowserElement({ dataset: { sessionRecoveryShell: '' } });
  const dialogRecoveryStatus = new BrowserElement({ dataset: { sessionRecoveryStatus: '' } });
  const dialogSignIn = new BrowserElement({ tagName: 'A', dataset: { sessionRecoverySignIn: '' } });
  const dialogCheck = new BrowserElement({ tagName: 'BUTTON', dataset: { sessionRecoveryCheck: '' } });
  dialogRecoveryShell.hidden = true;
  dialogRecoveryStatus.hidden = true;
  dialogSignIn.hidden = true;
  dialogCheck.hidden = true;
  const dialog = new BrowserElement({ tagName: 'DIALOG', dataset: { ownerDialog: '' }, lists: [
    dialogTitle, close, dataForm, linkEditForm, exitPrompt,
    dialogRecoveryShell, dialogRecoveryStatus, dialogSignIn, dialogCheck,
  ] });

  const rowElements = links.map((link) => {
    const title = new BrowserElement({ dataset: { linkTitle: '' }, textContent: link.title });
    const edit = new BrowserElement({ tagName: 'BUTTON', dataset: { linkEdit: '' } });
    const remove = new BrowserElement({ tagName: 'BUTTON', dataset: { linkRemove: '' } });
    const row = new BrowserElement({ dataset: { linkRow: link.placementId }, textContent: link.title, lists: [title, edit, remove] });
    row.link = link;
    row.title = title;
    return row;
  });
  const table = new BrowserElement({ dataset: { ownerLinks: '' }, lists: rowElements });
  const searchInput = new BrowserElement({ tagName: 'INPUT', name: 'buscar', value: search, dataset: { linkSearch: '' } });
  table.append(searchInput);

  const addFields = [
    control('title'), control('url'), control('description', '', { tagName: 'TEXTAREA' }),
    control('selectedForDirectory', 'on', { type: 'checkbox', checked: true }),
  ];
  const addStatus = new BrowserElement({ dataset: { linkAddStatus: '' } });
  const addSubmit = new BrowserElement({ tagName: 'BUTTON', type: 'submit' });
  const addForm = form([...addFields, addStatus, addSubmit], { linkAddForm: '' });
  const availableResources = editableResources.map((resource) => {
    const edit = new BrowserElement({ tagName: 'BUTTON', dataset: { linkEdit: '' }, textContent: `Editar ficha ${resource.title}` });
    const reinclude = new BrowserElement({
      tagName: 'BUTTON', dataset: { linkReinclude: '', resourceId: resource.id, resourceVersion: String(resource.version) },
      textContent: 'Volver a agregar',
    });
    const retained = new BrowserElement({ dataset: { retainedResource: resource.id }, lists: [edit, reinclude] });
    if (links.some((link) => link.resourceId === resource.id)) retained.hidden = true;
    retained.resource = resource;
    return retained;
  });
  const retainedLinks = new BrowserElement({ dataset: { ownerRetainedLinks: '' }, lists: availableResources });
  const publish = new BrowserElement({ tagName: 'BUTTON', dataset: { ownerPublish: '' } });
  const pageStatus = new BrowserElement({ dataset: { ownerStatus: '' } });
  const copyStatus = new BrowserElement({ dataset: { ownerCopyStatus: '' } });
  const sessionShell = new BrowserElement({ dataset: { sessionRecoveryShell: '' } });
  const sessionStatus = new BrowserElement({ dataset: { sessionRecoveryStatus: '' } });
  const signIn = new BrowserElement({ tagName: 'A', dataset: { sessionRecoverySignIn: '' } });
  const checkSession = new BrowserElement({ tagName: 'BUTTON', dataset: { sessionRecoveryCheck: '' } });
  sessionShell.hidden = true;
  sessionStatus.hidden = true;
  signIn.hidden = true;
  checkSession.hidden = true;
  const navigation = new BrowserElement({ tagName: 'A', dataset: { ownerNavigation: '' } });
  navigation.setAttribute('href', '/cuenta/?vista=estadisticas&periodo=30&pagina=1');
  const linksRegion = new BrowserElement({ lists: [table, addForm, retainedLinks] });
  const root = new BrowserElement({ dataset: {
    csrf: 'csrf-a', sessionBinding: 'a'.repeat(64), publicOrigin: SITE_ORIGIN, profileVersion: String(profile.version),
  }, lists: [
    ...ownerButtons, publish, pageStatus, copyStatus, linksRegion, dialog, navigation,
    sessionShell, sessionStatus, signIn, checkSession,
  ] });
  root.ownerDocument = document;
  for (const element of root.descendants()) element.ownerDocument = document;
  const initial = new BrowserElement({ textContent: JSON.stringify({
    profile, links, editableResources, claims: [], series, csrfToken: 'csrf-a', sessionBinding: 'a'.repeat(64),
  }) });
  const documentListeners = new Map();
  document.querySelector = (selector) => selector === '[data-creator-owner]' || selector === '[data-owner-root]' ? root
    : selector === '#creator-owner-data' ? initial : null;
  document.querySelectorAll = (selector) => root.querySelectorAll(selector);
  document.getElementById = (id) => id === 'creator-owner-data' ? initial : null;
  document.addEventListener = (type, listener) => documentListeners.set(type, listener);
  document.listeners = documentListeners;
  root.parentElement = document;

  const historyCalls = [];
  const confirmCalls = [];
  let confirmResult = false;
  const initialQuery = new URLSearchParams({
    vista: 'enlaces', buscar: search, orden: 'pagina', paginaEnlaces: '1', ...query,
  });
  const window = {
    location: {
      href: `${SITE_ORIGIN}/cuenta/?${initialQuery.toString()}`,
      pathname: '/cuenta/',
      get search() { return new URL(this.href).search; },
      assign(url) { this.href = String(url); },
      reload() {},
    },
    history: {
      pushState(_state, _title, url) { historyCalls.push({ method: 'pushState', url: String(url) }); window.location.href = new URL(String(url), SITE_ORIGIN).href; },
      replaceState(_state, _title, url) { historyCalls.push({ method: 'replaceState', url: String(url) }); window.location.href = new URL(String(url), SITE_ORIGIN).href; },
      back() {},
    },
    addEventListener() {},
    requestAnimationFrame(callback) { callback(); },
    confirm(message) { confirmCalls.push(String(message)); return confirmResult; },
  };
  return {
    root, profile, links, editableResources, series,
    dialog, dialogTitle, linkEditForm, linkFields, linkStatus: editStatus, conflict, comparison,
    metadataPanel, optionsPanel,
    linkCancel, linkSubmit, dataForm, exitPrompt, exitSave, exitDiscard, exitContinue,
    rows: rowElements, table, searchInput, addForm, addFields, addStatus, availableResources,
    retainedLinks,
    publish, pageStatus, sessionShell, sessionStatus, signIn, checkSession,
    document, documentListeners, window, historyCalls, confirmCalls,
    setConfirmResult(value) { confirmResult = value; },
  };
}

export function editableLink(overrides = {}) {
  return {
    placementId: stablePlacementId('resource-editable'), resourceId: 'resource-editable', title: 'Guía editable',
    url: 'https://example.invalid/guia', description: 'Descripción inicial', featured: false,
    position: 0, selectedForDirectory: true, hidden: false, directoryApproval: 'approved',
    resourceVersion: 3, placementVersion: 8, series: [], ...overrides,
  };
}

export function sharedLink(overrides = {}) {
  return {
    placementId: stablePlacementId('resource-shared'), resourceId: 'resource-shared', title: 'Guía compartida',
    url: 'https://example.invalid/compartida', description: 'Ficha ajena', featured: false,
    position: 1, selectedForDirectory: true, hidden: false, directoryApproval: 'pending',
    resourceVersion: 5, placementVersion: 9, series: [], ...overrides,
  };
}

export function editableResource(overrides = {}) {
  return { id: 'resource-orphan', title: 'Reincorporable', url: 'https://example.invalid/reincorporable', description: '', version: 6, ...overrides };
}

export async function mountOwnerLinks({ surface, fetch: fetchImpl }) {
  controllerBundlePromise ??= build({
    entryPoints: [controllerPath.pathname], bundle: true, write: false,
    platform: 'browser', format: 'iife', target: 'es2022',
  }).then(({ outputFiles }) => outputFiles[0].text);
  const requests = [];
  const wrappedFetch = async (input, init = {}) => {
    const target = new URL(String(input), SITE_ORIGIN);
    const options = { ...init, headers: new Headers(init.headers) };
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    const request = {
      path: target.pathname.replace(/\/$/, ''), method: options.method ?? 'GET',
      body, headers: new Headers(options.headers), url: target,
    };
    requests.push(request);
    const response = await fetchImpl(request, options);
    request.status = response?.status;
    request.responseHeaders = new Headers(response?.headers);
    return response;
  };
  runInNewContext(await controllerBundlePromise, {
    document: surface.document, window: surface.window,
    Element: BrowserElement, HTMLElement: BrowserElement,
    HTMLFormElement: BrowserElement, HTMLDialogElement: BrowserElement,
    FormData: BrowserFormData, Response, Request, Headers, URL, File, Blob,
    TextEncoder, Event, fetch: wrappedFetch, setTimeout, clearTimeout, queueMicrotask,
  });
  return requests;
}

export async function settle() { await new Promise((resolve) => setTimeout(resolve, 0)); }

export function writes(requests) {
  return requests.filter(({ method }) => !['GET', 'HEAD'].includes(method));
}

export function jsonResponse(value, status = 200) {
  return Response.json(value, { status });
}

export function createLinksApi({ surface, override } = {}) {
  const profile = { ...surface.profile };
  let links = surface.links.map((link) => ({ ...link }));
  const editableResources = surface.editableResources.map((resource) => ({ ...resource }));
  let sessionResult = { status: 200, body: { csrfToken: 'csrf-refreshed' } };

  function snapshot() {
    return { profile: { ...profile }, links: links.map((link) => ({ ...link })), editableResources: editableResources.map((resource) => ({ ...resource })) };
  }

  function setSession(result) {
    sessionResult = result;
  }

  async function fetch(request) {
    const intercepted = await override?.(request, { profile, links, editableResources, snapshot });
    if (intercepted instanceof Response) return intercepted;
    if (request.path === '/api/creador/sesion') return jsonResponse(sessionResult.body, sessionResult.status);
    if (request.path === '/api/creador/perfil') return jsonResponse({
      profile: { ...profile }, links: links.map((link) => ({ ...link })),
      editableResources: editableResources.map((resource) => ({ ...resource })), claims: [],
      series: surface.series.map((item) => ({ ...item })),
    });
    const edit = request.path.match(/^\/api\/creador\/enlaces\/([^/]+)\/editar$/);
    if (request.method === 'PATCH' && edit) {
      const link = links.find((item) => item.placementId === decodeURIComponent(edit[1]));
      if (!link) return jsonResponse({ error: 'PLACEMENT_NOT_FOUND' }, 404);
      const before = { profile: profile.version, resource: link.resourceVersion, placement: link.placementVersion };
      const resourceChanged = ['title', 'url', 'description'].some((key) => Object.hasOwn(request.body, key) && link[key] !== request.body[key]);
      const placementChanged = ['featured', 'selectedForDirectory'].some((key) => Object.hasOwn(request.body, key) && link[key] !== request.body[key]);
      for (const key of ['title', 'url', 'description', 'featured', 'selectedForDirectory']) {
        if (Object.hasOwn(request.body, key)) link[key] = request.body[key];
      }
      if (resourceChanged) {
        link.resourceVersion += 1;
        const editable = editableResources.find((item) => item.id === link.resourceId);
        if (editable) Object.assign(editable, {
          title: link.title, url: link.url, description: link.description, version: link.resourceVersion,
        });
      }
      if (placementChanged) link.placementVersion += 1;
      if (resourceChanged || placementChanged) profile.version += 1;
      const versionChanges = [];
      if (resourceChanged) versionChanges.push({ entity: 'resource', id: link.resourceId, before: before.resource, after: link.resourceVersion });
      if (placementChanged) versionChanges.push({ entity: 'placement', id: link.placementId, before: before.placement, after: link.placementVersion });
      if (resourceChanged || placementChanged) versionChanges.push({ entity: 'profile', id: profile.id, before: before.profile, after: profile.version });
      return jsonResponse({ link: { ...link }, versionChanges });
    }
    if (request.method === 'POST' && request.path === '/api/creador/enlaces') {
      if (request.body?.resourceId) {
        const resource = editableResources.find((item) => item.id === request.body.resourceId);
        if (!resource || resource.version !== request.body.resourceVersion) return jsonResponse({ error: 'RESOURCE_CONFLICT' }, 409);
        const existing = links.find((item) => item.resourceId === resource.id);
        if (existing) return jsonResponse({ link: { ...existing }, created: false, versionChanges: [] });
        const id = stablePlacementId(resource.id);
        const link = {
          placementId: id, resourceId: resource.id, title: resource.title, url: resource.url,
          description: resource.description ?? '', featured: false, position: links.length,
          selectedForDirectory: true, hidden: false, directoryApproval: 'pending',
          resourceVersion: resource.version, placementVersion: profile.version + 1, series: [],
        };
        const before = profile.version;
        profile.version += 1;
        links.push(link);
        return jsonResponse({ link: { ...link }, created: true, versionChanges: [
          { entity: 'profile', id: profile.id, before, after: profile.version },
          { entity: 'placement', id: link.placementId, before: 0, after: link.placementVersion },
        ] }, 201);
      }
      const duplicate = links.find((item) => item.url === request.body.url);
      if (duplicate) return jsonResponse({ link: { ...duplicate }, created: false, versionChanges: [] });
      const id = `resource-added-${links.length + 1}`;
      const link = {
        placementId: stablePlacementId(id), resourceId: id, title: request.body.title,
        url: request.body.url, description: request.body.description ?? '', featured: false,
        position: links.length, selectedForDirectory: request.body.selectedForDirectory ?? true,
        hidden: false, directoryApproval: 'pending', resourceVersion: 1,
        placementVersion: profile.version + 1, series: [],
      };
      const before = profile.version;
      profile.version += 1;
      links.push(link);
      editableResources.push({ id: link.resourceId, title: link.title, url: link.url, description: link.description, version: link.resourceVersion });
      return jsonResponse({ link: { ...link }, created: true, versionChanges: [
        { entity: 'profile', id: profile.id, before, after: profile.version },
        { entity: 'resource', id: link.resourceId, before: 0, after: link.resourceVersion },
        { entity: 'placement', id: link.placementId, before: 0, after: link.placementVersion },
      ] }, 201);
    }
    const editRetained = request.path.match(/^\/api\/creador\/recursos\/([^/]+)$/);
    if (request.method === 'PATCH' && editRetained) {
      const resource = editableResources.find((item) => item.id === decodeURIComponent(editRetained[1]));
      if (!resource) return jsonResponse({ error: 'RESOURCE_NOT_FOUND' }, 404);
      if (request.body?.version !== resource.version) return jsonResponse({ error: 'RESOURCE_CONFLICT' }, 409);
      const before = resource.version;
      Object.assign(resource, {
        ...(Object.hasOwn(request.body, 'title') ? { title: request.body.title } : {}),
        ...(Object.hasOwn(request.body, 'url') ? { url: request.body.url } : {}),
        ...(Object.hasOwn(request.body, 'description') ? { description: request.body.description } : {}),
      });
      resource.version += 1;
      return jsonResponse({ resource: { ...resource }, versionChanges: [{ entity: 'resource', id: resource.id, before, after: resource.version }] });
    }
    const remove = request.path.match(/^\/api\/creador\/enlaces\/([^/]+)$/);
    if (request.method === 'DELETE' && remove) {
      const index = links.findIndex((item) => item.placementId === decodeURIComponent(remove[1]));
      if (index < 0) return jsonResponse({ error: 'PLACEMENT_NOT_FOUND' }, 404);
      links.splice(index, 1);
      const before = profile.version;
      profile.version += 1;
      return new Response(null, { status: 204, headers: {
        'Creator-Write-Versions': JSON.stringify([{ entity: 'profile', id: profile.id, before, after: profile.version }]),
      } });
    }
    return jsonResponse({ error: 'NOT_FOUND', path: request.path, method: request.method }, 404);
  }

  function updateLink(id, patch) {
    const link = links.find((item) => item.placementId === id);
    if (link) Object.assign(link, patch);
  }

  return { fetch, snapshot, setSession, updateLink, profile, links, editableResources };
}

import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { SurfaceElement, SurfaceFormData } from './creator-owner-browser-dom.mjs';
import { createOwnerLinksSurface, control } from './creator-owner-links-browser.mjs';

export const SITE_ORIGIN = 'https://dondeaprendo.example.invalid';
export const CATALOG_INDEX_PATH = '/catalog-selection.json';
const controllerPath = new URL('../../src/scripts/creator-owner.ts', import.meta.url);
let controllerBundlePromise;

export function catalogItem(index, overrides = {}) {
  return {
    id: `catalog-resource-${String(index).padStart(3, '0')}`,
    title: `Guía de catálogo ${String(index + 1).padStart(3, '0')}`,
    url: `https://catalog.example.invalid/guide-${index + 1}`,
    tipo: 'content',
    ...overrides,
  };
}

function form(fields, dataset = {}) {
  const element = new SurfaceElement({ tagName: 'FORM', dataset, lists: fields });
  element.elements = fields;
  for (const field of fields) field.form = element;
  return element;
}

export function createCreatorOwnerCatalogSurface({
  profile,
  links = [],
  editableResources = [],
  series = [],
  query = {},
  index = [],
} = {}) {
  const initialQuery = { vista: 'enlaces', ...query };
  const surface = createOwnerLinksSurface({ profile, links, editableResources, series, query: initialQuery });
  const { root, dialog, document, window } = surface;
  const initial = document.getElementById('creator-owner-data');
  initial.textContent = JSON.stringify({
    profile: surface.profile,
    links,
    editableResources,
    claims: [],
    series,
    csrfToken: 'csrf-a',
    sessionBinding: root.dataset.sessionBinding,
  });

  const catalogOpen = new SurfaceElement({
    tagName: 'BUTTON', type: 'button', dataset: { catalogOpen: '' }, textContent: 'Buscar en el catálogo',
  });
  surface.addOpen.parentElement?.append(catalogOpen);

  const catalogView = new SurfaceElement({ tagName: 'SECTION', dataset: { ownerCatalog: '' } });
  catalogView.hidden = true;
  const catalogSearchForm = form([
    control('buscarCatalogo', '', { type: 'search', dataset: { catalogSearch: '' } }),
    new SurfaceElement({ tagName: 'BUTTON', type: 'submit', dataset: { catalogSearchSubmit: '' }, textContent: 'Buscar' }),
  ], { catalogSearchForm: '' });
  const catalogResults = new SurfaceElement({ tagName: 'UL', dataset: { catalogResults: '' } });
  const catalogCount = new SurfaceElement({ tagName: 'P', dataset: { catalogCount: '' }, textContent: '0 resultados' });
  const catalogEmpty = new SurfaceElement({ tagName: 'P', dataset: { catalogEmpty: '' }, textContent: 'No hay resultados.' });
  const catalogStatus = new SurfaceElement({ tagName: 'P', dataset: { catalogStatus: '' }, textContent: '' });
  catalogStatus.setAttribute('role', 'status');
  const catalogRetry = new SurfaceElement({
    tagName: 'BUTTON', type: 'button', dataset: { catalogRetry: '' }, textContent: 'Reintentar búsqueda',
  });
  catalogRetry.hidden = true;
  const catalogPrevious = new SurfaceElement({
    tagName: 'BUTTON', type: 'button', dataset: { catalogPage: 'previous' }, textContent: 'Anterior',
  });
  const catalogPage = new SurfaceElement({ tagName: 'SPAN', dataset: { catalogPageLabel: '' }, textContent: 'Página 1 de 1' });
  const catalogNext = new SurfaceElement({
    tagName: 'BUTTON', type: 'button', dataset: { catalogPage: 'next' }, textContent: 'Siguiente',
  });
  const catalogDirectory = control('selectedForDirectory', 'on', {
    type: 'checkbox', checked: true, dataset: { catalogDirectory: '' },
  });
  const catalogDirectoryLabel = new SurfaceElement({ tagName: 'LABEL', textContent: 'Proponer al directorio' });
  catalogDirectoryLabel.append(catalogDirectory);
  const referenceConflict = new SurfaceElement({ tagName: 'SECTION', dataset: { ownerConflict: '', catalogConflict: '' } });
  referenceConflict.hidden = true;
  const referenceConflictCopy = new SurfaceElement({ dataset: { ownerConflictCopy: '' } });
  const referenceCompare = new SurfaceElement({
    tagName: 'BUTTON', type: 'button', dataset: { ownerCompare: '' }, textContent: 'Comparar con lo guardado',
  });
  const referenceComparison = new SurfaceElement({ dataset: { ownerComparison: '' } });
  referenceComparison.hidden = true;
  const referenceAdopt = new SurfaceElement({
    tagName: 'BUTTON', type: 'button', dataset: { ownerAdopt: '' }, textContent: 'Usar la versión guardada',
  });
  referenceAdopt.hidden = true;
  referenceConflict.append(referenceConflictCopy, referenceCompare, referenceComparison, referenceAdopt);
  const catalogReference = new SurfaceElement({
    tagName: 'BUTTON', type: 'submit', dataset: { catalogReference: '' }, textContent: 'Agregar a mi página',
  });
  const catalogCancel = new SurfaceElement({
    tagName: 'BUTTON', type: 'button', dataset: { ownerCancel: '', catalogCancel: '' }, textContent: 'Cancelar',
  });
  const selectedCount = new SurfaceElement({ tagName: 'P', dataset: { catalogSelectedCount: '' }, textContent: '0 seleccionados' });
  const referenceForm = new SurfaceElement({
    tagName: 'FORM', dataset: { ownerForm: 'referencia', catalogReferenceForm: '' },
    lists: [catalogDirectoryLabel, catalogCount, catalogResults, catalogEmpty, selectedCount,
      referenceConflict, catalogReference, catalogCancel],
  });
  Object.defineProperty(referenceForm, 'elements', {
    get() {
      return [catalogDirectory, ...catalogResults.querySelectorAll('input, select, textarea')];
    },
  });
  catalogDirectory.form = referenceForm;
  referenceForm.hidden = true;
  catalogView.append(
    catalogSearchForm, catalogStatus, catalogRetry, catalogPrevious, catalogPage,
    catalogNext, referenceForm,
  );
  dialog.append(surface.addForm, catalogView);
  root.ownerDocument = document;
  for (const element of root.descendants()) element.ownerDocument = document;

  return {
    ...surface,
    root, dialog, document, window, index,
    catalogOpen, catalogView, catalogSearchForm,
    catalogSearch: catalogSearchForm.elements.find(({ dataset }) => dataset.catalogSearch !== undefined),
    catalogResults, catalogCount, catalogEmpty, catalogStatus, catalogRetry,
    catalogPrevious, catalogPage, catalogNext, catalogDirectory, catalogReference, catalogCancel,
    selectedCount, referenceForm, referenceConflict, referenceConflictCopy, referenceCompare,
    referenceComparison, referenceAdopt,
  };
}

export async function mountCreatorOwnerCatalog({ surface, index = surface.index, apiLinks = surface.links, respond } = {}) {
  controllerBundlePromise ??= build({
    entryPoints: [controllerPath.pathname],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  }).then(({ outputFiles }) => outputFiles[0].text);

  const requests = [];
  const apiState = {
    profile: structuredClone(surface.profile),
    links: structuredClone(apiLinks),
    editableResources: structuredClone(surface.editableResources),
    claims: [],
    series: structuredClone(surface.series),
  };
  const fetch = async (input, init = {}) => {
    const target = new URL(String(input), SITE_ORIGIN);
    const headers = new Headers(init.headers);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    const request = {
      path: target.pathname.replace(/\/$/, '') || '/',
      method: init.method ?? 'GET',
      body,
      headers,
      url: target,
    };
    requests.push(request);
    const intercepted = await respond?.(request, requests.length - 1, { profileVersion: apiState.profile.version });
    const response = intercepted instanceof Response
      ? intercepted
      : defaultResponse(request, index, apiState, apiState.profile.id);
    request.status = response?.status;
    return response;
  };

  runInNewContext(await controllerBundlePromise, {
    document: surface.document,
    window: surface.window,
    Element: SurfaceElement,
    HTMLElement: SurfaceElement,
    HTMLFormElement: SurfaceElement,
    HTMLDialogElement: SurfaceElement,
    FormData: SurfaceFormData,
    Response,
    Request,
    Headers,
    URL,
    URLSearchParams,
    AbortController,
    File,
    Blob,
    TextEncoder,
    Event,
    fetch,
    navigator: { clipboard: { writeText: async () => {} } },
    setTimeout,
    clearTimeout,
    queueMicrotask,
  });
  surface.requests = requests;
  surface.catalogApiState = { snapshot() { return structuredClone(apiState); } };
  return requests;
}

function defaultResponse(request, index, apiState, profileId) {
  if (request.path === CATALOG_INDEX_PATH && request.method === 'GET') return Response.json(index);
  if (request.path === '/api/creador/sesion' && request.method === 'GET') {
    return Response.json({ csrfToken: 'csrf-a' });
  }
  if (request.path === '/api/creador/perfil' && request.method === 'GET') {
    return Response.json({
      profile: apiState.profile,
      links: apiState.links,
      editableResources: apiState.editableResources,
      claims: apiState.claims,
      series: apiState.series,
    });
  }
  if (request.path === '/api/creador/referencias' && request.method === 'POST') {
    const existing = apiState.links.find(({ resourceId }) => resourceId === request.body.resourceId);
    if (existing) return Response.json({ link: { ...existing }, created: false, versionChanges: [] });
    const before = apiState.profile.version;
    const nextVersion = before + 1;
    const item = index.find(({ id }) => id === request.body.resourceId);
    const link = {
      placementId: `placement-${request.body.resourceId}`,
      resourceId: request.body.resourceId,
      title: item?.title ?? 'Guía catálogo',
      url: request.body.url,
      description: '',
      featured: false,
      position: apiState.links.reduce((maximum, item) => Math.max(maximum, item.position), -1) + 1,
      selectedForDirectory: request.body.selectedForDirectory ?? true,
      hidden: false,
      directoryApproval: 'pending',
      resourceVersion: 0,
      placementVersion: nextVersion,
      series: [],
    };
    apiState.profile = { ...apiState.profile, version: nextVersion };
    apiState.links.push(link);
    return Response.json({
      link,
      created: true,
      versionChanges: [
        { entity: 'profile', id: profileId, before, after: nextVersion },
        { entity: 'placement', id: link.placementId, before: 0, after: nextVersion },
      ],
    }, { status: 201 });
  }
  if (request.path === '/api/creador/enlaces' && request.method === 'POST') {
    const before = apiState.profile.version;
    const nextVersion = before + 1;
    const link = {
      placementId: 'placement-manual-url',
      resourceId: 'resource-manual-url',
      title: request.body.title,
      url: request.body.url,
      description: request.body.description ?? '',
      featured: false,
      position: apiState.links.reduce((maximum, item) => Math.max(maximum, item.position), -1) + 1,
      selectedForDirectory: request.body.selectedForDirectory ?? true,
      hidden: false,
      directoryApproval: 'pending',
      resourceVersion: 1,
      placementVersion: 1,
      series: [],
    };
    apiState.profile = { ...apiState.profile, version: nextVersion };
    apiState.links.push(link);
    apiState.editableResources.push({
      id: link.resourceId, title: link.title, url: link.url,
      description: link.description, version: link.resourceVersion,
    });
    return Response.json({ link, created: true, versionChanges: [
      { entity: 'profile', id: profileId, before, after: nextVersion },
      { entity: 'resource', id: link.resourceId, before: 0, after: link.resourceVersion },
      { entity: 'placement', id: link.placementId, before: 0, after: link.placementVersion },
    ] }, { status: 201 });
  }
  return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
}

export function jsonResponse(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers });
}

export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

export async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await settle();
  }
  if (!predicate()) throw new Error(message);
}

export function writes(requests) {
  return requests.filter(({ method }) => !['GET', 'HEAD'].includes(method));
}


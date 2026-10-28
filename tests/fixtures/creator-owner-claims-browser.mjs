import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { SurfaceElement, SurfaceFormData } from './creator-owner-browser-dom.mjs';
import { createCreatorOwnerCatalogSurface, catalogItem } from './creator-owner-catalog-browser.mjs';

export { catalogItem };

const controllerPath = new URL('../../src/scripts/creator-owner.ts', import.meta.url);
let controllerBundlePromise;

function form(fields, dataset = {}) {
  const element = new SurfaceElement({ tagName: 'FORM', dataset, lists: fields });
  element.elements = fields;
  for (const field of fields) field.form = element;
  return element;
}

function control(name, value = '', options = {}) {
  const element = new SurfaceElement({
    tagName: options.tagName ?? 'INPUT', name, value, type: options.type,
    dataset: options.dataset, textContent: options.textContent ?? '',
  });
  element.checked = options.checked ?? false;
  if (options.maxLength !== undefined) {
    element.maxLength = options.maxLength;
    element.setAttribute('maxlength', options.maxLength);
  }
  return element;
}

function claimRecord(overrides = {}) {
  return {
    id: 'claim-existing',
    resourceIds: ['resource-own', 'resource-public', 'resource-url', 'legacy-private-id'],
    resources: [
      { resourceId: 'resource-own', url: 'https://old.example.invalid/own' },
      { resourceId: 'resource-public', url: 'https://catalog.example.invalid/public' },
      { resourceId: 'resource-url', url: 'https://supplied.example.invalid/known' },
    ],
    status: 'pending',
    createdAt: 1_798_000_000_000,
    evidence: 'Referencia privada del dueño',
    ...overrides,
  };
}

export function createCreatorOwnerClaimsSurface({
  profile,
  links = [],
  editableResources = [],
  series = [],
  claims = [claimRecord()],
  query = {},
  index = [],
} = {}) {
  const surface = createCreatorOwnerCatalogSurface({ profile, links, editableResources, series, query, index });
  const { root, dialog, catalogView, document } = surface;
  surface.catalogSearchForm.setAttribute('id', 'owner-catalog-search-form');
  surface.catalogSearchForm.setAttribute('method', 'get');
  const initial = document.getElementById('creator-owner-data');
  const initialData = JSON.parse(initial.textContent);
  initialData.claims = structuredClone(claims);
  initial.textContent = JSON.stringify(initialData);

  // Catalog search, results, count and pagination are one shared surface for
  // reference mode and claim mode, matching the production owner dialog.
  for (const element of [surface.catalogCount, surface.catalogResults, surface.catalogEmpty, surface.selectedCount]) {
    element.remove();
  }
  catalogView.append(surface.catalogCount, surface.catalogResults, surface.catalogEmpty, surface.selectedCount);

  const requestEdit = new SurfaceElement({
    tagName: 'BUTTON', type: 'button', dataset: { claimOpen: '', claimSectionOpen: '' },
    textContent: 'Solicitar edición',
  });
  const claimsSection = new SurfaceElement({
    tagName: 'SECTION', dataset: { ownerClaims: '' }, textContent: 'Solicitudes',
    lists: [requestEdit],
  });
  claimsSection.hidden = (query.vista ?? 'enlaces') !== 'solicitudes';
  root.append(claimsSection);

  const claimHistory = new SurfaceElement({ tagName: 'UL', dataset: { claimHistory: '' } });
  claimsSection.append(claimHistory);

  const claimUrls = control('knownUrls', '', {
    tagName: 'TEXTAREA', dataset: { claimUrls: '' }, maxLength: 100_000,
  });
  const claimEvidence = control('evidence', '', {
    tagName: 'TEXTAREA', dataset: { claimEvidence: '' }, maxLength: 2000,
  });
  const claimStatus = new SurfaceElement({ tagName: 'P', dataset: { claimStatus: '' } });
  claimStatus.setAttribute('role', 'status');
  const claimCheck = new SurfaceElement({
    tagName: 'BUTTON', type: 'button', dataset: { claimCheck: '' }, textContent: 'Comprobar solicitudes',
  });
  claimCheck.hidden = true;
  const claimSubmit = new SurfaceElement({
    tagName: 'BUTTON', type: 'submit', dataset: { claimSubmit: '' }, textContent: 'Enviar solicitud',
  });
  const claimCancel = new SurfaceElement({
    tagName: 'BUTTON', type: 'button', dataset: { ownerCancel: '', claimCancel: '' }, textContent: 'Cancelar',
  });
  const claimForm = form([claimUrls, claimEvidence, claimStatus, claimCheck, claimSubmit, claimCancel], {
    ownerForm: 'reclamacion', claimForm: '',
  });
  claimForm.hidden = true;
  catalogView.append(claimForm);

  const claimListRows = claims.map((claim) => {
    const row = new SurfaceElement({ tagName: 'LI', dataset: { claimRecord: claim.id } });
    row.append(new SurfaceElement({ dataset: { claimStatus: '' }, textContent: claim.status ?? 'Solicitud recibida' }));
    row.append(new SurfaceElement({ tagName: 'TIME', dataset: { claimDate: '' }, textContent: claim.createdAt ? new Date(claim.createdAt).toISOString() : '' }));
    const resources = Array.isArray(claim.resources) ? claim.resources : [];
    for (const resourceId of claim.resourceIds ?? []) {
      const supplied = resources.find(({ resourceId: suppliedId }) => suppliedId === resourceId);
      const own = links.find(({ resourceId: ownId }) => ownId === resourceId)
        ?? editableResources.find(({ id: ownId }) => ownId === resourceId);
      row.append(new SurfaceElement({
        dataset: { claimResourceId: resourceId },
        textContent: own?.title ?? supplied?.url ?? 'Contenido solicitado',
      }));
    }
    if (claim.evidence) row.append(new SurfaceElement({ dataset: { claimEvidenceText: '' }, textContent: claim.evidence }));
    row.claim = claim;
    claimHistory.append(row);
    return row;
  });

  for (const row of surface.rows) {
    if (row.link?.resourceId) {
      const requestButton = new SurfaceElement({
        tagName: 'BUTTON', type: 'button',
        dataset: {
          claimOpen: '', resourceId: row.link.resourceId,
          placementId: row.link.placementId, url: row.link.url,
        },
        textContent: 'Solicitar edición',
      });
      row.append(requestButton);
      row.claimOpen = requestButton;
    }
  }

  for (const element of root.descendants()) element.ownerDocument = document;

  return {
    ...surface,
    root, document, dialog, catalogView, claimsSection, requestEdit,
    navigation: root.querySelectorAll('a').find(({ dataset }) => dataset.ownerNavigation !== undefined),
    claimForm, claimUrls, claimEvidence, claimStatus, claimCheck, claimSubmit, claimCancel,
    claimHistory, claimListRows,
  };
}

export async function mountCreatorOwnerClaims({
  surface,
  index = surface.index,
  resolvedByUrl = {},
  sessionResponse = () => Response.json({ csrfToken: 'csrf-a' }),
  respond,
} = {}) {
  controllerBundlePromise ??= build({
    entryPoints: [controllerPath.pathname],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  }).then(({ outputFiles }) => outputFiles[0].text);

  const initial = JSON.parse(surface.document.getElementById('creator-owner-data').textContent);
  const apiState = {
    profile: structuredClone(initial.profile),
    links: structuredClone(initial.links),
    editableResources: structuredClone(initial.editableResources),
    claims: structuredClone(initial.claims),
    series: structuredClone(initial.series),
  };
  const requests = [];
  const fetch = async (input, init = {}) => {
    const target = new URL(String(input), 'https://dondeaprendo.example.invalid');
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
    const intercepted = await respond?.(request, requests.length - 1, { apiState });
    let response = intercepted instanceof Response ? intercepted : undefined;
    if (!response && request.path === '/catalog-selection.json' && request.method === 'GET') {
      response = Response.json(index);
    } else if (!response && request.path === '/api/creador/sesion' && request.method === 'GET') {
      response = await sessionResponse(request);
    } else if (!response && request.path === '/api/creador/perfil' && request.method === 'GET') {
      response = Response.json(apiState);
    } else if (!response && request.path === '/api/creador/reclamaciones' && request.method === 'POST') {
      const submitted = request.body?.resources ?? [];
      const resources = submitted.map((item, index) => ({
        resourceId: item.resourceId ?? resolvedByUrl[item.url] ?? `resolved-url-${index + 1}`,
        url: item.url,
      }));
      const claim = {
        id: `claim-created-${apiState.claims.length + 1}`,
        resourceIds: resources.map(({ resourceId }) => resourceId),
        resources,
        status: 'pending',
        createdAt: 1_798_000_000_001,
        ...(typeof request.body?.evidence === 'string' ? { evidence: request.body.evidence } : {}),
      };
      apiState.claims.push(claim);
      response = Response.json({ claim, versionChanges: [] }, { status: 202 });
    }
    if (!response) response = Response.json({ error: 'NOT_FOUND' }, { status: 404 });
    request.status = response.status;
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
  surface.claimApiState = { snapshot() { return structuredClone(apiState); } };
  return requests;
}

export function visibleText(surface) {
  return surface.root.descendants()
    .filter((element) => {
      for (let parent = element; parent; parent = parent.parentElement) if (parent.hidden) return false;
      return true;
    })
    .map((element) => element.textContent)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function visibleControls(surface) {
  return surface.root.querySelectorAll('input, textarea, select').filter((element) => {
    for (let parent = element; parent; parent = parent.parentElement) if (parent.hidden) return false;
    return true;
  });
}

export async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (!predicate()) throw new Error(message);
}

export function claimCatalogRows(surface) {
  return surface.catalogResults.querySelectorAll('[data-catalog-row]');
}

export function rowResourceId(row) {
  return row?.dataset?.catalogRow;
}

export function textOf(element) {
  if (!element) return '';
  return [element.textContent, ...element.descendants().map(({ textContent }) => textContent)]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function submitClaim(surface) {
  return surface.claimForm.dispatch('submit');
}

export function submitCatalogSearch(surface, value) {
  surface.catalogSearch.value = value;
  return surface.catalogSearchForm.dispatch('submit');
}

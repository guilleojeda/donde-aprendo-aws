import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SurfaceElement } from './fixtures/creator-owner-browser-dom.mjs';
import {
  createLinksApi,
  createOwnerLinksSurface,
  editableLink,
  editableResource,
  jsonResponse,
  mountOwnerLinks,
  settle,
  sharedLink,
  stablePlacementId,
  writes,
} from './fixtures/creator-owner-links-browser.mjs';

async function mountCase({ links = [], editableResources = [], series = [], search = '', query = {}, override } = {}) {
  const surface = createOwnerLinksSurface({ links, editableResources, series, search, query });
  const api = createLinksApi({ surface, override });
  const requests = await mountOwnerLinks({ surface, fetch: api.fetch });
  return { surface, api, requests };
}

function editableReference(link) {
  return {
    id: link.resourceId, title: link.title, url: link.url,
    description: link.description, version: link.resourceVersion,
  };
}

async function ownedScenario({ link = editableLink(), links = [link], editableResources = [], ...options } = {}) {
  return mountCase({
    ...options, links,
    editableResources: [editableReference(link), ...editableResources],
  });
}

function rowFor(surface, placementId) {
  return surface.table.querySelectorAll('[data-link-row]').find((row) => row.dataset.linkRow === placementId);
}

function editButton(row) {
  return row.querySelector('[data-link-edit]');
}

function editControl(surface, name) {
  return surface.linkEditForm.elements.find((item) => item.name === name);
}

function addControl(surface, name) {
  return surface.addForm.elements.find((item) => item.name === name);
}

async function openLink(surface, placementId) {
  const row = rowFor(surface, placementId);
  assert.ok(row, `placement ${placementId} is present in the owner table`);
  await editButton(row).dispatch('click');
  assert.equal(surface.dialog.open, true, 'the real controller opens its contextual owner dialog');
}

async function saveLink(surface) {
  await surface.linkEditForm.dispatch('submit');
  await settle();
}

function oneWrite(requests, method, path) {
  const matching = writes(requests).filter((request) => request.method === method && request.path === path);
  assert.equal(matching.length, 1, `expected one ${method} ${path} request`);
  return matching[0];
}

test('el bundle real del controlador instala el handler que abre la edición contextual', async () => {
  const link = editableLink();
  const { surface } = await ownedScenario({ link });
  assert.equal(surface.root.querySelectorAll('[data-owner-dialog]').length, 1);
  assert.equal(surface.root.querySelectorAll('[data-link-edit-form]').length, 1);
  await openLink(surface, link.placementId);
  assert.equal(surface.dialog.open, true, 'the real compiled controller handles the row edit action');
  assert.equal(surface.linkEditForm.hidden, false);
});

test('editar un enlace abre el único diálogo owner y conserva versiones y datos observados', async () => {
  const link = editableLink();
  const { surface } = await ownedScenario({ link });
  await openLink(surface, link.placementId);

  assert.equal(surface.dialog.open, true);
  assert.equal(surface.linkEditForm.hidden, false);
  assert.equal(surface.root.querySelectorAll('[data-owner-dialog]').length, 1, 'the link shares the profile dialog');
  assert.equal(surface.root.querySelectorAll('[data-owner-exit-prompt]').length, 1, 'the link shares the owner exit guard');
  assert.equal(editControl(surface, 'title').value, link.title);
  assert.equal(editControl(surface, 'url').value, link.url);
  assert.equal(editControl(surface, 'description').value, link.description);
});

test('una ficha compartida deja disponibles sólo las opciones de colocación', async () => {
  const link = sharedLink();
  const { surface } = await mountCase({ links: [link] });
  await openLink(surface, link.placementId);

  for (const name of ['title', 'url', 'description']) {
    const input = editControl(surface, name);
    assert.ok(input.hidden || input.disabled || surface.metadataPanel.hidden,
      `${name} is not editable on a shared catalog record`);
  }
  for (const name of ['featured', 'selectedForDirectory']) {
    const option = editControl(surface, name);
    assert.equal(option.hidden, false, `${name} remains an owner-controlled placement option`);
    assert.equal(option.disabled, false);
  }
});

test('un Guardar actualiza metadatos, destacado y selección del directorio mediante un PATCH atómico', async () => {
  const link = editableLink();
  const { surface, requests } = await ownedScenario({ link });
  await openLink(surface, link.placementId);
  editControl(surface, 'title').value = 'Guía actualizada';
  editControl(surface, 'url').value = 'https://example.invalid/guia-actualizada';
  editControl(surface, 'description').value = 'Descripción actualizada';
  editControl(surface, 'featured').checked = true;
  editControl(surface, 'selectedForDirectory').checked = false;
  await saveLink(surface);

  const request = oneWrite(requests, 'PATCH', `/api/creador/enlaces/${link.placementId}/editar`);
  assert.deepEqual(Object.keys(request.body).sort(), [
    'description', 'featured', 'placementVersion', 'profileVersion', 'resourceVersion', 'selectedForDirectory', 'title', 'url',
  ]);
  assert.deepEqual(request.body, {
    title: 'Guía actualizada', url: 'https://example.invalid/guia-actualizada',
    description: 'Descripción actualizada', featured: true, selectedForDirectory: false,
    resourceVersion: link.resourceVersion, placementVersion: link.placementVersion, profileVersion: 14,
  });
  assert.equal(request.headers.get('x-csrf-token'), 'csrf-a');
  assert.equal(surface.dialog.open, false, 'a verified save closes the clean contextual edit');
});

test('guardar opciones de ficha compartida no envía metadatos y conserva una sola escritura', async () => {
  const link = sharedLink();
  const { surface, requests } = await mountCase({ links: [link] });
  await openLink(surface, link.placementId);
  editControl(surface, 'featured').checked = true;
  editControl(surface, 'selectedForDirectory').checked = false;
  await saveLink(surface);

  const request = oneWrite(requests, 'PATCH', `/api/creador/enlaces/${link.placementId}/editar`);
  assert.deepEqual(Object.keys(request.body).sort(), ['featured', 'placementVersion', 'profileVersion', 'resourceVersion', 'selectedForDirectory']);
  assert.equal(request.body.featured, true);
  assert.equal(request.body.selectedForDirectory, false);
});

test('cancelar y descartar un cambio local no escribe', async () => {
  const link = editableLink();
  const { surface, requests } = await ownedScenario({ link });
  await openLink(surface, link.placementId);
  editControl(surface, 'title').value = 'Corrección local';
  await surface.linkCancel.dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  assert.equal(surface.exitSave.hidden, false);
  assert.equal(surface.exitDiscard.hidden, false);
  assert.equal(surface.exitContinue.hidden, false);
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.dialog.open, false);
  assert.equal(writes(requests).length, 0);
  assert.equal(editControl(surface, 'title').value, link.title);
});

test('un segundo cambio durante el PATCH queda abierto y no se guarda dentro del primer recibo', async () => {
  const link = editableLink();
  let release;
  let started;
  const requestStarted = new Promise((resolve) => { started = resolve; });
  const responsePending = new Promise((resolve) => { release = resolve; });
  const { surface, requests } = await ownedScenario({ link, override: async (request) => {
    if (request.method !== 'PATCH') return undefined;
    started();
    return responsePending;
  } });
  await openLink(surface, link.placementId);
  editControl(surface, 'title').value = 'Corrección enviada';
  const firstSubmit = surface.linkEditForm.dispatch('submit');
  await Promise.race([requestStarted, new Promise((resolve) => setTimeout(resolve, 100))]);
  assert.equal(writes(requests).length, 1, 'the contextual form starts its real PATCH request');
  editControl(surface, 'title').value = 'Corrección tardía';
  await surface.linkEditForm.dispatch('submit');
  assert.equal(writes(requests).length, 1, 'the existing owner write guard blocks a second request');

  const request = writes(requests)[0];
  release(jsonResponse({
    link: { ...link, title: request.body.title, resourceVersion: link.resourceVersion + 1 },
    versionChanges: [
      { entity: 'resource', id: link.resourceId, before: link.resourceVersion, after: link.resourceVersion + 1 },
      { entity: 'profile', id: 'creator-1', before: 14, after: 15 },
    ],
  }));
  await firstSubmit;
  assert.equal(surface.dialog.open, true);
  assert.equal(editControl(surface, 'title').value, 'Corrección tardía');
  assert.equal(writes(requests).length, 1, 'late edits never cause an automatic follow-up write');
});

for (const failure of [
  { name: '503', status: 503, body: { error: 'TEMPORARILY_UNAVAILABLE' } },
  { name: '422', status: 422, body: { error: 'INVALID_RESOURCE' } },
]) {
  test(`un ${failure.name} conserva abierto el formulario y sus correcciones`, async () => {
    const link = editableLink();
    const { surface, requests } = await ownedScenario({ link, override: (request) =>
      request.method === 'PATCH' ? jsonResponse(failure.body, failure.status) : undefined });
    await openLink(surface, link.placementId);
    editControl(surface, 'title').value = `Corrección ${failure.name}`;
    await saveLink(surface);

    assert.equal(surface.dialog.open, true);
    assert.equal(editControl(surface, 'title').value, `Corrección ${failure.name}`);
    assert.equal(surface.linkStatus.hidden, false);
    assert.equal(surface.linkStatus.dataset.kind, 'error');
    assert.equal(writes(requests).length, 1);
  });
}

test('409 conserva la edición y una comparación explícita muestra los valores actuales sin rebase', async () => {
  const link = editableLink();
  const { surface, api, requests } = await ownedScenario({ link, override: (request) =>
    request.method === 'PATCH' ? jsonResponse({ error: 'PLACEMENT_CONFLICT' }, 409) : undefined });
  api.updateLink(link.placementId, { title: 'Versión guardada', resourceVersion: link.resourceVersion + 1 });
  Object.assign(api.editableResources[0], { title: 'Versión guardada', version: link.resourceVersion + 1 });
  api.profile.version += 1;
  await openLink(surface, link.placementId);
  editControl(surface, 'title').value = 'Mi corrección';
  await saveLink(surface);

  assert.equal(surface.dialog.open, true);
  assert.equal(editControl(surface, 'title').value, 'Mi corrección');
  assert.equal(surface.conflict.hidden, false);
  assert.equal(writes(requests).length, 1, '409 does not retry or rebase the edit');
  await surface.conflict.querySelector('[data-owner-compare]').dispatch('click');
  await settle();
  assert.equal(surface.comparison.hidden, false);
  assert.match(surface.comparison.textContent, /Versión guardada/);
  assert.match(surface.comparison.textContent, /Mi corrección/);
  assert.equal(writes(requests).length, 1, 'only the explicit current-version read follows comparison');
  assert.equal(requests.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length, 1);
});

test('una comparación tardía de A no aparece ni se adopta sobre la edición posterior de B', async () => {
  const first = editableLink({ resourceId: 'resource-a', placementId: 'placement-a', title: 'Título A' });
  const second = editableLink({ resourceId: 'resource-b', placementId: 'placement-b', title: 'Título B', position: 1 });
  const editableResources = [first, second].map((link) => ({
    id: link.resourceId, title: link.title, url: link.url,
    description: link.description, version: link.resourceVersion,
  }));
  let resolveComparison;
  const pendingComparison = new Promise((resolve) => { resolveComparison = resolve; });
  const { surface, api, requests } = await mountCase({ links: [first, second], editableResources, override: (request) => {
    if (request.method === 'PATCH') return jsonResponse({ error: 'LINK_CONFLICT' }, 409);
    if (request.method === 'GET' && request.path === '/api/creador/perfil') return pendingComparison;
    return undefined;
  } });

  await openLink(surface, first.placementId);
  editControl(surface, 'title').value = 'Corrección local de A';
  await saveLink(surface);
  await surface.conflict.querySelector('[data-owner-compare]').dispatch('click');
  await settle();
  await surface.linkCancel.dispatch('click');
  await surface.exitDiscard.dispatch('click');
  await openLink(surface, second.placementId);
  editControl(surface, 'title').value = 'Corrección local de B';

  resolveComparison(jsonResponse({
    profile: api.profile, links: api.links, editableResources: api.editableResources, claims: [], series: [],
  }));
  await settle();
  assert.equal(editControl(surface, 'title').value, 'Corrección local de B');
  assert.equal(surface.conflict.hidden, true, 'A’s late compare cannot reopen the conflict panel for B');
  assert.equal(surface.comparison.textContent, '', 'A’s values are not displayed as B’s comparison');
  assert.equal(surface.adoptLink.hidden, true, 'A’s read cannot expose adoption while B is active');

  await saveLink(surface);
  await surface.adoptLink.dispatch('click');
  assert.equal(editControl(surface, 'title').value, 'Corrección local de B');
  assert.equal(surface.comparison.textContent, '', 'the late A response cannot be adopted over B');
  assert.equal(writes(requests).length, 2, 'each explicit save sent once; compare remained read-only');
});

for (const failure of [
  { name: '401', status: 401, body: { error: 'UNAUTHENTICATED' } },
  { name: 'CSRF', status: 403, body: { error: 'CSRF_REJECTED' } },
]) {
  test(`${failure.name} conserva la corrección y requiere comprobación antes del reintento manual`, async () => {
    const link = editableLink();
    let reject = true;
    const { surface, api, requests } = await ownedScenario({ link, override: (request) => {
      if (request.method === 'PATCH' && reject) {
        reject = false;
        return jsonResponse(failure.body, failure.status);
      }
      return undefined;
    } });
    await openLink(surface, link.placementId);
    editControl(surface, 'title').value = 'Edición conservada';
    await saveLink(surface);
    assert.equal(writes(requests).length, 1, 'the rejected write is never replayed');
    assert.equal(editControl(surface, 'title').value, 'Edición conservada');
    assert.equal(surface.sessionShell.hidden, false);
    assert.equal(surface.dialog.querySelector('[data-session-recovery-shell]').hidden, false);
    assert.equal(requests.some(({ method, path }) => method === 'GET' && path === '/api/creador/perfil'), false,
      'auth recovery does not fetch content to adopt a newer version');

    await surface.checkSession.dispatch('click');
    await settle();
    const sessionChecks = requests.filter(({ method, path }) => method === 'GET' && path === '/api/creador/sesion');
    assert.equal(sessionChecks.length, 1);
    assert.equal(sessionChecks[0].headers.get('x-creator-page-binding'), 'a'.repeat(64));
    assert.equal(writes(requests).length, 1, 'checking the session is a read and does not replay the edit');
    assert.match(surface.sessionStatus.textContent, /volver a guardar/i);

    await saveLink(surface);
    const writesAfterManualRetry = writes(requests);
    assert.equal(writesAfterManualRetry.length, 2, "only the user's explicit second save sends the request");
    assert.equal(writesAfterManualRetry[1].headers.get('x-csrf-token'), 'csrf-refreshed');
    assert.equal(writesAfterManualRetry[1].body.title, 'Edición conservada');
    assert.equal(api.snapshot().links[0].title, 'Edición conservada');
  });
}

test('otra cuenta o cambio de rol mantiene bloqueado el mismo borrador y no escribe', async () => {
  const link = editableLink();
  const { surface, api, requests } = await ownedScenario({ link, override: (request) =>
    request.method === 'PATCH' ? jsonResponse({ error: 'UNAUTHENTICATED' }, 401) : undefined });
  api.setSession({ status: 409, body: { error: 'SESSION_CONTEXT_CHANGED' } });
  await openLink(surface, link.placementId);
  editControl(surface, 'description').value = 'Se conserva';
  await saveLink(surface);
  await surface.checkSession.dispatch('click');
  await settle();
  assert.match(surface.sessionStatus.textContent, /misma cuenta|permisos originales/i);
  await saveLink(surface);
  assert.equal(writes(requests).length, 1, 'the changed identity cannot send a second write');
  assert.equal(api.snapshot().links[0].description, link.description);
  assert.equal(editControl(surface, 'description').value, 'Se conserva');
});

test('la recuperación bloquea quitar y reincorporar después de un rechazo de sesión', async (context) => {
  await context.test('quitar', async () => {
    const link = editableLink();
    const { surface, requests } = await ownedScenario({ link, override: (request) =>
      request.method === 'PATCH' ? jsonResponse({ error: 'UNAUTHENTICATED' }, 401) : undefined });
    await openLink(surface, link.placementId);
    editControl(surface, 'title').value = 'Edición no enviada';
    await saveLink(surface);
    await surface.linkCancel.dispatch('click');
    await surface.exitDiscard.dispatch('click');
    const remove = rowFor(surface, link.placementId).querySelector('[data-link-remove]');
    await remove.dispatch('click');
    await settle();
    assert.equal(writes(requests).length, 1, 'the owner recovery guard blocks a second mutation before confirmation');
    assert.equal(surface.confirmCalls.length, 0);
  });

  await context.test('reincorporar', async () => {
    const resource = editableResource();
    const { surface, requests } = await mountCase({ editableResources: [resource], override: (request) =>
      request.method === 'POST' ? jsonResponse({ error: 'UNAUTHENTICATED' }, 401) : undefined });
    const reinclude = surface.availableResources[0].querySelector('[data-link-reinclude]');
    await reinclude.dispatch('click');
    await settle();
    await reinclude.dispatch('click');
    await settle();
    assert.equal(writes(requests).length, 1, 'the owner recovery guard blocks the retry without sending another POST');
  });
});

test('una respuesta incierta o un recibo incompatible no confirma guardado ni cierra el editor', async (context) => {
  const link = editableLink();
  const cases = [
    ['respuesta de red incierta', async (request, state) => {
      const current = state.links[0];
      current.title = request.body.title;
      current.resourceVersion += 1;
      state.profile.version += 1;
      throw new Error('connection lost after commit');
    }],
    ['recibo incompatible', async (request, state) => {
      const current = state.links[0];
      const before = current.resourceVersion;
      current.title = request.body.title;
      current.resourceVersion += 1;
      state.profile.version += 1;
      return jsonResponse({
        link: { ...current },
        versionChanges: [{ entity: 'resource', id: 'otro-recurso', before, after: before + 1 }],
      });
    }],
  ];
  for (const [name, response] of cases) {
    await context.test(name, async () => {
      const { surface, api, requests } = await ownedScenario({ link, override: (request, state) =>
        request.method === 'PATCH' ? response(request, state) : undefined });
      await openLink(surface, link.placementId);
      editControl(surface, 'title').value = 'Guardado no comprobado';
      await saveLink(surface);
      assert.equal(surface.dialog.open, true);
      assert.equal(editControl(surface, 'title').value, 'Guardado no comprobado');
      assert.notEqual(surface.linkStatus.dataset.kind, 'success');
      assert.doesNotMatch(surface.linkStatus.textContent, /^(?:cambios|enlace|corrección) guardad[oa]s?\./i);
      assert.equal(writes(requests).length, 1, 'uncertain state never triggers an automatic replay');
      assert.equal(api.snapshot().links[0].title, 'Guardado no comprobado', 'the simulated server may already have committed');
    });
  }
});

test('cerrar ofrece guardar, descartar y seguir; sólo las elecciones explícitas cambian el borrador', async () => {
  const link = editableLink();
  const { surface, requests } = await ownedScenario({ link });
  await openLink(surface, link.placementId);
  editControl(surface, 'title').value = 'Cambiar y seguir';
  await surface.linkCancel.dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitContinue.dispatch('click');
  assert.equal(surface.dialog.open, true);
  assert.equal(editControl(surface, 'title').value, 'Cambiar y seguir');
  assert.equal(writes(requests).length, 0);

  await surface.linkCancel.dispatch('click');
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.dialog.open, false);
  assert.equal(writes(requests).length, 0);

  await openLink(surface, link.placementId);
  editControl(surface, 'title').value = 'Guardar al cerrar';
  await surface.linkCancel.dispatch('click');
  await surface.exitSave.dispatch('click');
  await settle();
  assert.equal(writes(requests).length, 1);
  assert.equal(surface.dialog.open, false);
});

test('cambiar de fila usa el mismo guard: seguir mantiene una sola edición y descartar abre la fila elegida', async () => {
  const first = editableLink();
  const second = sharedLink({ title: 'Ficha siguiente' });
  const { surface, requests } = await ownedScenario({ link: first, links: [first, second] });
  await openLink(surface, first.placementId);
  editControl(surface, 'title').value = 'Corrección primera';
  await editButton(rowFor(surface, second.placementId)).dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  assert.equal(surface.root.querySelectorAll('[data-owner-dialog]').length, 1);
  assert.equal(surface.root.querySelectorAll('[data-link-edit-form]').length, 1);
  await surface.exitContinue.dispatch('click');
  assert.equal(surface.dialog.open, true);
  assert.equal(editControl(surface, 'title').value, 'Corrección primera');
  assert.equal(writes(requests).length, 0);

  await editButton(rowFor(surface, second.placementId)).dispatch('click');
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.dialog.open, true);
  assert.equal(editControl(surface, 'title').value, second.title);
  assert.equal(writes(requests).length, 0);
});

test('editar perfil mientras un enlace está sucio ofrece el mismo guard y no abre un segundo borrador', async () => {
  const link = editableLink();
  const { surface, requests } = await ownedScenario({ link });
  await openLink(surface, link.placementId);
  editControl(surface, 'title').value = 'No perder';
  await surface.root.querySelector('[data-owner-edit="datos"]').dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  assert.equal(surface.dialog.open, true);
  assert.equal(surface.linkEditForm.hidden, false);
  assert.equal(surface.dataForm.hidden, true, 'profile editing waits for the one active owner draft');
  await surface.exitContinue.dispatch('click');
  assert.equal(editControl(surface, 'title').value, 'No perder');
  assert.equal(writes(requests).length, 0);
});

test('navegar con una edición sucia ofrece las tres opciones y conserva URL si se sigue editando', async () => {
  const link = editableLink();
  const { surface, requests } = await ownedScenario({ link });
  await openLink(surface, link.placementId);
  editControl(surface, 'description').value = 'No abandonar';
  const click = await surface.root.querySelector('[data-owner-navigation]').dispatch('click');
  assert.equal(click.defaultPrevented, true);
  assert.equal(surface.exitSave.hidden, false);
  assert.equal(surface.exitDiscard.hidden, false);
  assert.equal(surface.exitContinue.hidden, false);
  await surface.exitContinue.dispatch('click');
  assert.equal(surface.window.location.pathname, '/cuenta/');
  assert.equal(surface.dialog.open, true);
  assert.equal(editControl(surface, 'description').value, 'No abandonar');
  assert.equal(writes(requests).length, 0);
});

test('la búsqueda AJAX conserva filtros y foco, clampa la página y no escribe, publica ni consulta Analytics', async () => {
  const links = Array.from({ length: 51 }, (_, index) => {
    const resourceId = `resource-filtered-${index + 1}`;
    return sharedLink({
      placementId: stablePlacementId(resourceId), resourceId,
      title: index === 0 ? 'Lambda Quickstart' : `Otra guía ${index + 1}`,
      url: `https://example.invalid/filtered-${index + 1}`, position: index,
      featured: true, directoryApproval: 'pending',
      series: [{ seriesId: 'serie-1', position: 0 }],
    });
  });
  const nonMatch = sharedLink({
    placementId: stablePlacementId('resource-networking'), resourceId: 'resource-networking',
    title: 'Networking Guide', url: 'https://example.invalid/networking', position: 51,
    featured: true, directoryApproval: 'pending', series: [],
  });
  links.push(nonMatch);
  const { surface, requests } = await mountCase({
    links,
    series: [{ id: 'serie-1', name: 'AWS Lambda', slug: 'aws-lambda', version: 1 }],
    query: { serie: 'serie-1', directorio: 'pendientes', destacado: 'si', orden: 'titulo-asc', paginaEnlaces: '3' },
  });
  surface.searchInput.focus();
  surface.searchInput.value = 'Lambda';
  await surface.searchInput.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 250));

  assert.equal(surface.document.activeElement, surface.searchInput);
  const url = new URL(surface.window.location.href);
  assert.equal(url.pathname, '/cuenta/');
  for (const [key, value] of Object.entries({
    vista: 'enlaces', buscar: 'Lambda', serie: 'serie-1', directorio: 'pendientes',
    destacado: 'si', orden: 'titulo-asc', paginaEnlaces: '3',
  })) {
    const expected = key === 'paginaEnlaces' ? '1' : value;
    assert.equal(url.searchParams.get(key), expected, `${key} stays valid in the owner URL`);
  }
  assert.equal(rowFor(surface, links[0].placementId).hidden, false);
  const nonMatchRow = rowFor(surface, nonMatch.placementId);
  assert.ok(!nonMatchRow || nonMatchRow.hidden, 'the non-matching row is hidden or removed from the current page');
  assert.equal(writes(requests).length, 0);
  assert.equal(requests.some(({ path }) => /analytics|ga4|medicion|\/api\/creador\/estadisticas/i.test(path)), false);
});

test('aplicar una consulta ya abierta no duplica historial y Back/Forward restaura filtros y filas', async () => {
  const links = [
    sharedLink({
      placementId: 'placement-approved-history', resourceId: 'resource-approved-history',
      title: 'Guía aprobada', url: 'https://example.invalid/approved-history', position: 0,
      directoryApproval: 'approved',
    }),
    sharedLink({
      placementId: 'placement-revoked-history', resourceId: 'resource-revoked-history',
      title: 'Guía revocada', url: 'https://example.invalid/revoked-history', position: 1,
      directoryApproval: 'revoked',
    }),
  ];
  const surface = createOwnerLinksSurface({ links });
  const popstateListeners = [];
  const historyEntries = [surface.window.location.href];
  let historyIndex = 0;
  surface.window.addEventListener = (type, listener) => {
    if (type === 'popstate') popstateListeners.push(listener);
  };
  const setHistoryLocation = (url) => {
    surface.window.location.href = new URL(String(url), surface.window.location.href).href;
  };
  surface.window.history = {
    pushState(_state, _title, url) {
      surface.historyCalls.push({ method: 'pushState', url: String(url) });
      historyEntries.splice(historyIndex + 1);
      historyEntries.push(new URL(String(url), surface.window.location.href).href);
      historyIndex++;
      surface.window.location.href = historyEntries[historyIndex];
    },
    replaceState(_state, _title, url) {
      surface.historyCalls.push({ method: 'replaceState', url: String(url) });
      historyEntries[historyIndex] = new URL(String(url), surface.window.location.href).href;
      surface.window.location.href = historyEntries[historyIndex];
    },
    back() {
      if (historyIndex === 0) return;
      historyIndex--;
      setHistoryLocation(historyEntries[historyIndex]);
      for (const listener of popstateListeners) listener({ type: 'popstate' });
    },
    forward() {
      if (historyIndex >= historyEntries.length - 1) return;
      historyIndex++;
      setHistoryLocation(historyEntries[historyIndex]);
      for (const listener of popstateListeners) listener({ type: 'popstate' });
    },
  };
  const api = createLinksApi({ surface });
  const requests = await mountOwnerLinks({ surface, fetch: api.fetch });

  const filterForm = new SurfaceElement({ tagName: 'FORM', dataset: { linkFilters: '' } });
  const fields = [
    new SurfaceElement({ tagName: 'INPUT', name: 'vista', value: 'enlaces' }),
    new SurfaceElement({ tagName: 'INPUT', name: 'paginaEnlaces', value: '1' }),
    surface.searchInput,
    new SurfaceElement({ tagName: 'SELECT', name: 'serie', value: 'todos' }),
    new SurfaceElement({ tagName: 'SELECT', name: 'directorio', value: 'todos' }),
    new SurfaceElement({ tagName: 'SELECT', name: 'destacado', value: 'todos' }),
    new SurfaceElement({ tagName: 'SELECT', name: 'orden', value: 'pagina' }),
    new SurfaceElement({ tagName: 'BUTTON', type: 'submit' }),
  ];
  filterForm.elements = fields;
  filterForm.append(...fields);
  for (const field of fields) {
    field.form = filterForm;
    field.ownerDocument = surface.document;
  }
  surface.root.append(filterForm);

  const directory = filterForm.querySelector('[name="directorio"]');
  directory.value = 'revocados';
  await directory.dispatch('change');
  const approvedRow = rowFor(surface, links[0].placementId);
  assert.ok(!approvedRow || approvedRow.hidden, 'the non-matching row is removed or hidden');
  assert.equal(rowFor(surface, links[1].placementId).hidden, false);

  await filterForm.dispatch('submit');
  const pushes = () => surface.historyCalls.filter(({ method }) => method === 'pushState');
  assert.equal(pushes().length, 1, 'Apply does not push the same query opened by the select change');
  assert.equal(new URL(surface.window.location.href).searchParams.get('directorio'), 'revocados');
  assert.equal(writes(requests).length, 0);

  surface.window.history.back();
  assert.equal(new URL(surface.window.location.href).searchParams.get('directorio'), null);
  assert.equal(directory.value, 'todos');
  assert.equal(rowFor(surface, links[0].placementId).hidden, false);
  assert.equal(rowFor(surface, links[1].placementId).hidden, false);

  surface.window.history.forward();
  assert.equal(new URL(surface.window.location.href).searchParams.get('directorio'), 'revocados');
  assert.equal(directory.value, 'revocados');
  const approvedRowAfterForward = rowFor(surface, links[0].placementId);
  assert.ok(!approvedRowAfterForward || approvedRowAfterForward.hidden, 'forward restores the same filtered collection');
  assert.equal(rowFor(surface, links[1].placementId).hidden, false);
});

test('quitar la última fila de la página final actualiza URL y página a la vez', async () => {
  const links = Array.from({ length: 26 }, (_, index) => sharedLink({
    placementId: `placement-final-${index}`, resourceId: `resource-final-${index}`,
    title: `Título ${index}`, url: `https://example.invalid/final-${index}`, position: index,
  }));
  const { surface } = await mountCase({ links, query: { paginaEnlaces: '2' } });
  assert.equal(surface.table.querySelectorAll('[data-link-row]').length, 1);
  surface.setConfirmResult(true);
  await rowFor(surface, links[25].placementId).querySelector('[data-link-remove]').dispatch('click');
  await settle();
  assert.equal(surface.table.querySelectorAll('[data-link-row]').length, 25);
  assert.equal(new URL(surface.window.location.href).searchParams.get('paginaEnlaces'), '1');
  assert.equal(surface.searchInput.ownerDocument.activeElement, surface.searchInput);
});

test('al guardar, una fila que deja de coincidir con la búsqueda sale sin perder el control de la tabla', async () => {
  const link = editableLink({ title: 'Guía Lambda' });
  const { surface, requests } = await ownedScenario({ link, search: 'Lambda' });
  await openLink(surface, link.placementId);
  editControl(surface, 'title').value = 'Guía Networking';
  await saveLink(surface);

  const row = rowFor(surface, link.placementId);
  assert.ok(!row || row.hidden, 'the changed row no longer appears under the active search');
  assert.equal(surface.table.hidden, false, 'the stable table controller remains usable');
  assert.equal(new URL(surface.window.location.href).searchParams.get('buscar'), 'Lambda');
  assert.equal(writes(requests).length, 1);
});

test('guardar fuera del filtro conserva la consulta y lo anuncia junto al estado de guardado', async () => {
  const link = editableLink({ title: 'Guía Lambda' });
  const { surface } = await ownedScenario({ link, search: 'Lambda' });
  await openLink(surface, link.placementId);
  editControl(surface, 'title').value = 'Guía de redes';
  await saveLink(surface);
  assert.equal(new URL(surface.window.location.href).searchParams.get('buscar'), 'Lambda');
  assert.match(surface.linkStatus.textContent, /Cambios guardados.*no coincide con los filtros actuales/i);
});

test('una fila que cambia a otra página pero sigue en la selección no anuncia que quedó fuera de filtros', async () => {
  const links = Array.from({ length: 26 }, (_, index) => {
    const resourceId = `resource-title-order-${index}`;
    const shared = sharedLink({
      placementId: `placement-title-order-${index}`, resourceId,
      title: `Guía ${String(index).padStart(2, '0')}`,
      url: `https://example.invalid/title-order-${index}`, position: index,
    });
    return index === 0 ? editableLink({ ...shared, description: 'Descripción', resourceVersion: 3, placementVersion: 8 }) : shared;
  });
  const link = links[0];
  const { surface } = await ownedScenario({
    link, links,
    query: { orden: 'titulo-desc', paginaEnlaces: '2' },
  });
  await openLink(surface, link.placementId);
  editControl(surface, 'title').value = 'Guía Z arriba';
  await saveLink(surface);
  assert.equal(new URL(surface.window.location.href).searchParams.get('paginaEnlaces'), '2');
  assert.equal(rowFor(surface, link.placementId), undefined, 'the sorted row moved to the first page');
  assert.doesNotMatch(surface.linkStatus.textContent, /no coincide con los filtros actuales/i);
});

test('agregar un enlace que no coincide con el filtro lo anuncia sin alterar la consulta', async () => {
  const { surface } = await mountCase({ links: [], query: { directorio: 'no-propuestos' } });
  await surface.addOpen.dispatch('click');
  addControl(surface, 'title').value = 'Propuesta nueva';
  addControl(surface, 'url').value = 'https://example.invalid/propuesta-nueva';
  await surface.addForm.dispatch('submit');
  await settle();
  assert.equal(new URL(surface.window.location.href).searchParams.get('directorio'), 'no-propuestos');
  assert.match(surface.addStatus.textContent, /Enlace agregado.*no coincide con los filtros actuales/i);
});

for (const selectedForDirectory of [true, false]) {
  test(`agregar URL conserva la selección de directorio elegida (${selectedForDirectory ? 'predeterminada' : 'opt-out'})`, async () => {
    const { surface, requests } = await mountCase({ links: [] });
    assert.equal(addControl(surface, 'selectedForDirectory').checked, true, 'new links start selected for the directory');
    addControl(surface, 'title').value = 'Nuevo enlace';
    addControl(surface, 'url').value = 'https://example.invalid/nuevo';
    addControl(surface, 'description').value = 'Descripción';
    addControl(surface, 'selectedForDirectory').checked = selectedForDirectory;
    await surface.addForm.dispatch('submit');
    await settle();

    const request = oneWrite(requests, 'POST', '/api/creador/enlaces');
    assert.equal(request.status, 201, 'a newly created resource/placement uses the service creation status');
    assert.deepEqual(request.body, {
      title: 'Nuevo enlace', url: 'https://example.invalid/nuevo',
      description: 'Descripción', selectedForDirectory,
    });
  });
}

test('reintentar un alta de URL incierta no duplica el recurso ni su colocación', async () => {
  const { surface, api, requests } = await mountCase({ links: [], override: (request, state) => {
    if (request.method !== 'POST' || request.path !== '/api/creador/enlaces' || state.profile.version !== 14) return undefined;
    const link = {
      placementId: stablePlacementId('resource-created-before-timeout'), resourceId: 'resource-created-before-timeout',
      title: request.body.title, url: request.body.url, description: request.body.description,
      featured: false, position: 0, selectedForDirectory: request.body.selectedForDirectory,
      hidden: false, directoryApproval: 'pending', resourceVersion: 1, placementVersion: 15, series: [],
    };
    state.links.push(link);
    state.editableResources.push({
      id: link.resourceId, title: link.title, url: link.url, description: link.description, version: link.resourceVersion,
    });
    state.profile.version += 1;
    return jsonResponse({ error: 'TEMPORARILY_UNAVAILABLE' }, 503);
  } });
  addControl(surface, 'title').value = 'Retry URL';
  addControl(surface, 'url').value = 'https://example.invalid/retry';
  await surface.addForm.dispatch('submit');
  await settle();
  assert.equal(api.snapshot().links.length, 1, 'the first uncertain request created one stable URL record');
  await surface.addForm.dispatch('submit');
  await settle();
  const posts = requests.filter(({ method, path }) => method === 'POST' && path === '/api/creador/enlaces');
  assert.equal(posts.length, 2);
  assert.equal(posts[1].status, 200, 'an idempotent existing URL returns the existing resource status');
  assert.equal(api.snapshot().links.length, 1, 'the retry resolves the existing URL instead of duplicating it');
  assert.equal(new Set(api.snapshot().links.map(({ url }) => url)).size, 1);
});

test('retirar, editar la ficha retenida y reincorporar usan resourceId y la versión observada', async () => {
  const link = editableLink({ title: 'Ficha propia', url: 'https://example.invalid/propia', resourceVersion: 3 });
  const resource = editableResource({ id: link.resourceId, title: link.title, url: link.url, description: link.description, version: link.resourceVersion });
  const { surface, api, requests } = await mountCase({ links: [link], editableResources: [resource] });
  await rowFor(surface, link.placementId).querySelector('[data-link-remove]').dispatch('click');
  assert.equal(writes(requests).length, 0, 'the first click only opens the native removal confirmation');
  assert.equal(surface.confirmCalls.length, 1);
  assert.match(surface.confirmCalls[0], /quitar.*página/i);
  assert.match(surface.confirmCalls[0], /ficha.*volver a agregar/i);
  surface.setConfirmResult(true);
  await rowFor(surface, link.placementId).querySelector('[data-link-remove]').dispatch('click');
  await settle();

  const removed = oneWrite(requests, 'DELETE', `/api/creador/enlaces/${link.placementId}`);
  assert.equal(removed.status, 204);
  assert.deepEqual(JSON.parse(removed.responseHeaders.get('creator-write-versions')), [
    { entity: 'profile', id: 'creator-1', before: 14, after: 15 },
  ], 'deletion receipts only the profile; the removed placement has no after-version');
  assert.deepEqual(removed.body, { profileVersion: 14 });
  const removedRow = rowFor(surface, link.placementId);
  assert.ok(!removedRow || removedRow.hidden, 'a removed placement is not left visible in the table');
  const retained = surface.availableResources[0];
  assert.equal(retained.hidden, false);
  await retained.querySelector('[data-link-edit]').dispatch('click');
  assert.equal(surface.dialog.open, true);
  assert.equal(surface.linkEditForm.hidden, false);
  assert.equal(surface.optionsPanel.hidden, true, 'a resource without a placement has no placement options');
  editControl(surface, 'title').value = 'Ficha propia corregida';
  editControl(surface, 'url').value = 'https://example.invalid/propia-corregida';
  editControl(surface, 'description').value = 'Descripción corregida';
  await saveLink(surface);

  const resourceWrite = oneWrite(requests, 'PATCH', `/api/creador/recursos/${link.resourceId}`);
  assert.deepEqual(resourceWrite.body, {
    title: 'Ficha propia corregida', url: 'https://example.invalid/propia-corregida',
    description: 'Descripción corregida', version: link.resourceVersion,
  });
  await retained.querySelector('[data-link-reinclude]').dispatch('click');
  await settle();
  const reinclude = oneWrite(requests, 'POST', '/api/creador/enlaces');
  assert.equal(reinclude.status, 201);
  assert.deepEqual(reinclude.body, { resourceId: link.resourceId, resourceVersion: link.resourceVersion + 1 });
  const restored = api.snapshot().links[0];
  assert.equal(restored.title, 'Ficha propia corregida');
  assert.equal(restored.placementId, link.placementId, 'the stable resource-to-placement identity survives removal');
  assert.equal(restored.url, 'https://example.invalid/propia-corregida');
  assert.equal(restored.featured, false);
  assert.equal(restored.selectedForDirectory, true);
  assert.equal(restored.position, 0);
  assert.deepEqual(restored.series, [], 're-adding a placement does not restore removed series chapters');
});

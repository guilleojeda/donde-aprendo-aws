import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jsonResponse, settle, sharedLink, stablePlacementId, writes } from './fixtures/creator-owner-links-browser.mjs';
import { mountOwnerLinkMove } from './fixtures/creator-owner-link-move-browser.mjs';

function moveLink(index, overrides = {}) {
  const resourceId = `move-resource-${index}`;
  return sharedLink({
    placementId: stablePlacementId(resourceId), resourceId,
    title: `Guía ${String(index).padStart(2, '0')}`,
    url: `https://move.example/${index}`,
    description: `Descripción ${index}`,
    position: index * 10,
    featured: false,
    selectedForDirectory: true,
    directoryApproval: 'approved',
    resourceVersion: index + 2,
    placementVersion: index + 4,
    series: [],
    ...overrides,
  });
}

function compareLinks(left, right) {
  return left.position - right.position || left.placementId.localeCompare(right.placementId);
}

function makeMoveEndpoint({ respond, beforeMove, decorateResponse, afterMove } = {}) {
  const calls = [];
  const override = async (request, state) => {
    const match = request.path.match(/^\/api\/creador\/enlaces\/([^/]+)\/mover\/?$/);
    if (request.method !== 'POST' || !match) return undefined;
    calls.push(request);
    const customResponse = await respond?.(request, state, calls.length);
    if (customResponse instanceof Response) return customResponse;
    await beforeMove?.(request, state, calls.length);

    const placementId = decodeURIComponent(match[1]);
    const target = state.links.find((link) => link.placementId === placementId);
    if (!target) return jsonResponse({ error: 'PLACEMENT_NOT_FOUND' }, 404);
    if (request.body.profileVersion !== state.profile.version
      || request.body.placementVersion !== target.placementVersion) {
      return jsonResponse({ error: 'ORDER_CONFLICT' }, 409);
    }
    const group = state.links.filter((link) => link.featured === target.featured).sort(compareLinks);
    const currentIndex = group.findIndex((link) => link.placementId === target.placementId);
    const originalPositions = new Map(group.map((link) => [link.placementId, link.position]));
    const targetPosition = request.body.targetPosition;
    if (!Number.isSafeInteger(targetPosition) || targetPosition < 1 || targetPosition > group.length) {
      return jsonResponse({ error: 'INVALID_TARGET_POSITION' }, 422);
    }
    if (targetPosition === currentIndex + 1) {
      return jsonResponse({ links: [{ ...target }], versionChanges: [] });
    }

    const desired = [...group];
    desired.splice(currentIndex, 1);
    const destination = targetPosition - 1;
    desired.splice(destination, 0, target);
    let targetValue;
    const before = desired[destination - 1];
    const after = desired[destination + 1];
    if (!before && after?.position > 0) targetValue = after.position - 1;
    else if (!after && before?.position < Number.MAX_SAFE_INTEGER) targetValue = before.position + 1;
    else if (before && after && after.position - before.position > 1) targetValue = Math.floor((before.position + after.position) / 2);
    if (Number.isSafeInteger(targetValue)
      && (!before || targetValue > before.position)
      && (!after || targetValue < after.position)) {
      target.position = targetValue;
    } else {
      desired.forEach((link, index) => { link.position = index * 10; });
    }

    const changed = desired.filter((link) => link.position !== originalPositions.get(link.placementId));
    if (!changed.length) return jsonResponse({ links: [{ ...target }], versionChanges: [] });
    const profileBefore = state.profile.version;
    state.profile.version += 1;
    const versionChanges = [{ entity: 'profile', id: state.profile.id, before: profileBefore, after: state.profile.version }];
    for (const link of changed) {
      const placementBefore = link.placementVersion;
      link.placementVersion += 1;
      versionChanges.push({ entity: 'placement', id: link.placementId, before: placementBefore, after: link.placementVersion });
    }
    const candidates = new Map([[target.placementId, { ...target }]]);
    for (const link of changed) candidates.set(link.placementId, { ...link, series: (link.series ?? []).map((item) => ({ ...item })) });
    const payload = { links: [...candidates.values()], versionChanges };
    await decorateResponse?.(payload, request, state, calls.length);
    const response = jsonResponse(payload);
    await afterMove?.(request, state, calls.length, response);
    return response;
  };
  return { override, calls };
}

function rowFor(surface, placementId) {
  return surface.table.querySelectorAll('[data-link-row]').find((row) => row.dataset.linkRow === placementId);
}

function formText(form) {
  return [form, ...form.descendants()].map((element) => element.textContent).filter(Boolean).join(' ');
}

async function openMove(surface, placementId) {
  const row = rowFor(surface, placementId);
  assert.ok(row, `the placement ${placementId} is currently in the table`);
  await row.querySelector('[data-link-move]').dispatch('click');
  assert.equal(surface.dialog.open, true, 'moving opens the existing owner dialog');
  assert.equal(surface.moveForm.hidden, false, 'the shared dialog shows one contextual move form');
}

async function submitMove(surface) {
  await surface.moveForm.dispatch('submit');
  await settle();
}

test('mover usa el grupo completo con ocultos, ignora búsqueda/página y conserva ficha compartida y contexto', async () => {
  const links = [];
  for (let index = 0; index < 27; index += 1) {
    links.push(moveLink(index, {
      title: `Objetivo ${String(28 - index).padStart(2, '0')}`,
      featured: true, directoryApproval: 'pending',
      series: [{ seriesId: 'series-1', position: index * 10 }],
    }));
  }
  const hiddenNeighbor = moveLink(27, {
    title: 'Vecina oculta fuera del filtro', featured: true, hidden: true,
    series: [{ seriesId: 'series-1', position: 270 }],
  });
  links.push(hiddenNeighbor);
  const target = moveLink(28, {
    title: 'Objetivo 01', featured: true, directoryApproval: 'pending',
    series: [{ seriesId: 'series-1', position: 280 }],
  });
  links.push(target);
  for (let index = 29; index < 50; index += 1) links.push(moveLink(index, { featured: true }));
  for (let index = 50; index < 58; index += 1) links.push(moveLink(index));

  const initialPublicFields = new Map(links.map((link) => [link.placementId, {
    featured: link.featured, selectedForDirectory: link.selectedForDirectory,
    title: link.title, url: link.url, description: link.description,
    series: structuredClone(link.series), resourceVersion: link.resourceVersion,
  }]));
  const endpoint = makeMoveEndpoint({ decorateResponse: (payload) => {
    const candidate = payload.links.find(({ placementId }) => placementId === target.placementId);
    candidate.title = 'Título ajeno al recibo de orden';
    candidate.resourceVersion += 1;
  } });
  const { surface, api, requests } = await mountOwnerLinkMove({
    links,
    series: [{ id: 'series-1', name: 'Ruta que no limita el orden', slug: 'ruta', version: 3 }],
    query: {
      buscar: 'Objetivo', directorio: 'pendientes', destacado: 'si',
      orden: 'titulo-desc', paginaEnlaces: '2',
    },
    override: endpoint.override,
  });
  assert.equal(surface.table.querySelectorAll('[data-link-row]').length, 3,
    'the title, directory and featured filters return three matches on page two');
  assert.ok(rowFor(surface, target.placementId), 'the target appears on the filtered second page');
  assert.equal(surface.editableResources.length, 0, 'the target is a shared reference without metadata authority');
  const originalQuery = surface.window.location.search;

  await openMove(surface, target.placementId);
  assert.equal(surface.targetPosition.value, '29', 'the form starts from the target ordinal in all 50 featured links');
  assert.equal(surface.targetPosition.getAttribute('min'), '1');
  assert.equal(surface.targetPosition.getAttribute('max'), '50');
  assert.match(formText(surface.moveForm), /destacad/i, 'the full featured group is named');
  assert.match(surface.moveContext.textContent, /Vecina oculta fuera del filtro/i,
    'the destination context includes a hidden neighbor excluded by the query');

  surface.targetPosition.value = '28';
  await surface.targetPosition.dispatch('input');
  assert.match(surface.moveContext.textContent, /Vecina oculta fuera del filtro/i);
  await submitMove(surface);

  assert.equal(endpoint.calls.length, 1);
  assert.equal(endpoint.calls[0].method, 'POST');
  assert.equal(endpoint.calls[0].path, `/api/creador/enlaces/${target.placementId}/mover`);
  assert.deepEqual(endpoint.calls[0].body, {
    profileVersion: 14, placementVersion: target.placementVersion, targetPosition: 28,
  });
  assert.equal(writes(requests).length, 1, 'one action sends one move request');
  assert.equal(api.snapshot().profile.version, 15);
  assert.equal(api.snapshot().links.find(({ placementId }) => placementId === target.placementId).position, 265,
    'the new stored position places the target immediately before the hidden neighbor');
  assert.equal(api.snapshot().links.find(({ placementId }) => placementId === hiddenNeighbor.placementId).placementVersion,
    hiddenNeighbor.placementVersion, 'a neighbor whose stored position did not change keeps its version');
  for (const link of api.snapshot().links) {
    const before = initialPublicFields.get(link.placementId);
    assert.deepEqual({
      featured: link.featured, selectedForDirectory: link.selectedForDirectory,
      title: link.title, url: link.url, description: link.description,
      series: link.series, resourceVersion: link.resourceVersion,
    }, before, 'moving does not edit group membership, metadata, directory options, chapters or resource versions');
  }
  assert.equal(rowFor(surface, target.placementId).querySelector('[data-link-title]').textContent, target.title,
    'an unreceipted title in the move DTO does not replace the observed title');
  assert.ok(rowFor(surface, target.placementId).querySelector('[data-link-move]'),
    'a table row recreated from the receipt retains its move action');
  assert.equal(surface.window.location.search, originalQuery, 'search, filters, sort and page stay in the URL');
  assert.ok(surface.document.activeElement === surface.searchInput
    || surface.document.activeElement === rowFor(surface, target.placementId)?.querySelector('[data-link-move]'),
  'focus returns to the row action or the stable search control if the target left the page');
  assert.equal(surface.dialog.open, false, 'a compatible receipt closes the sole move editor when there are no late edits');
});

test('un DTO de movimiento sin recibo resource no adelanta la ficha ni la versión del siguiente PATCH', async () => {
  const links = [moveLink(0), moveLink(1)];
  const target = links[0];
  const endpoint = makeMoveEndpoint({ decorateResponse: (payload) => {
    const candidate = payload.links.find(({ placementId }) => placementId === target.placementId);
    candidate.title = 'Cambio de recurso sin recibo';
    candidate.resourceVersion += 1;
  } });
  const editableResources = [{
    id: target.resourceId, title: target.title, url: target.url,
    description: target.description, version: target.resourceVersion,
  }];
  const { surface, requests } = await mountOwnerLinkMove({ links, editableResources, override: endpoint.override });
  await openMove(surface, target.placementId);
  surface.targetPosition.value = '2';
  await surface.targetPosition.dispatch('input');
  await submitMove(surface);

  const row = rowFor(surface, target.placementId);
  assert.equal(row.querySelector('[data-link-title]').textContent, target.title,
    'the move response does not adopt metadata that no resource receipt confirms');
  await row.querySelector('[data-link-edit]').dispatch('click');
  assert.equal(surface.linkEditForm.hidden, false);
  const title = surface.linkEditForm.elements.find((field) => field.name === 'title');
  title.value = 'Edición posterior';
  await title.dispatch('input');
  await surface.linkEditForm.dispatch('submit');
  await settle();
  const patch = requests.find(({ method, path }) => method === 'PATCH' && path.endsWith('/editar'));
  assert.ok(patch);
  assert.equal(patch.body.resourceVersion, target.resourceVersion,
    'the later metadata save uses the last version observed with authority, not the movement DTO');
  assert.equal(patch.body.title, 'Edición posterior');
});

test('el grupo no destacado calcula 1..N de sus ocho enlaces sin contar los destacados', async () => {
  const links = [
    moveLink(0, { featured: true }),
    ...Array.from({ length: 8 }, (_, index) => moveLink(index + 1, { featured: false, position: index * 10 })),
  ];
  const endpoint = makeMoveEndpoint();
  const { surface, api } = await mountOwnerLinkMove({ links, override: endpoint.override });
  const target = links[7];
  await openMove(surface, target.placementId);
  assert.equal(surface.targetPosition.value, '7');
  assert.equal(surface.targetPosition.getAttribute('max'), '8');
  assert.match(formText(surface.moveForm), /sin destacar/i);
  surface.targetPosition.value = '1';
  await submitMove(surface);
  const orderedGroup = api.snapshot().links.filter(({ featured }) => !featured).sort(compareLinks);
  assert.equal(orderedGroup[0].placementId, target.placementId);
  assert.equal(api.snapshot().links.find(({ placementId }) => placementId === links[0].placementId).featured, true,
    'moving within the unfeatured group leaves the featured group intact');
});

test('un recibo no-op con target y versionChanges vacíos confirma el destino observado sin subir versiones', async () => {
  const links = [moveLink(0), moveLink(1), moveLink(2)];
  const endpoint = makeMoveEndpoint();
  const { surface, api, requests } = await mountOwnerLinkMove({ links, override: endpoint.override });
  await openMove(surface, links[1].placementId);
  assert.equal(surface.targetPosition.value, '2');
  const before = api.snapshot();
  await submitMove(surface);
  assert.equal(endpoint.calls.length, 1);
  assert.deepEqual(endpoint.calls[0].body, {
    profileVersion: before.profile.version,
    placementVersion: before.links[1].placementVersion,
    targetPosition: 2,
  });
  assert.equal(api.snapshot().profile.version, before.profile.version);
  assert.deepEqual(api.snapshot().links.map(({ placementId, position, placementVersion }) => ({ placementId, position, placementVersion })),
    before.links.map(({ placementId, position, placementVersion }) => ({ placementId, position, placementVersion })));
  assert.equal(writes(requests).length, 1);
});

test('422 conserva el destino y ofrece una posición viable que sólo se aplica tras una elección explícita', async () => {
  const links = Array.from({ length: 5 }, (_, index) => moveLink(index));
  const endpoint = makeMoveEndpoint({ respond: (_request, _state, callNumber) =>
    callNumber === 1 ? jsonResponse({ error: 'ORDER_MOVE_LIMIT', viablePosition: 2 }, 422) : undefined });
  const { surface, api } = await mountOwnerLinkMove({ links, override: endpoint.override });
  const target = links[4];
  await openMove(surface, target.placementId);
  surface.targetPosition.value = '1';
  await surface.targetPosition.dispatch('input');
  await submitMove(surface);
  assert.equal(surface.moveForm.hidden, false);
  assert.equal(surface.targetPosition.value, '1', 'the rejected destination stays intact');
  assert.match(surface.moveStatus.textContent, /límite|posición/i);
  assert.equal(endpoint.calls.length, 1, '422 does not auto-try a different target');
  assert.equal(api.snapshot().profile.version, 14);
  const suggestion = surface.moveForm.querySelectorAll('button')
    .find((button) => button !== surface.moveSave && /2/.test(button.textContent));
  assert.ok(suggestion, 'the viable ordinal is offered as an explicit control');
  await suggestion.dispatch('click');
  assert.equal(surface.targetPosition.value, '2');
  assert.equal(endpoint.calls.length, 1, 'choosing a suggestion changes only the input');
  await submitMove(surface);
  assert.equal(endpoint.calls.length, 2, 'the creator must submit the accepted position explicitly');
  assert.equal(api.snapshot().profile.version, 15);
});

test('409 conserva intención, compara y adopta sólo por elección; el segundo conflicto tampoco se reenvía', async () => {
  const links = Array.from({ length: 4 }, (_, index) => moveLink(index));
  const target = links[3];
  const endpoint = makeMoveEndpoint({ respond: (_request, state, callNumber) => {
    if (callNumber === 1) {
      state.profile.version += 1;
      state.links[3].position = 15;
      state.links[3].placementVersion += 1;
      return jsonResponse({ error: 'ORDER_CONFLICT' }, 409);
    }
    if (callNumber === 2) return jsonResponse({ error: 'ORDER_CONFLICT' }, 409);
    return undefined;
  } });
  const { surface, requests } = await mountOwnerLinkMove({ links, override: endpoint.override });
  await openMove(surface, target.placementId);
  surface.targetPosition.value = '1';
  await surface.targetPosition.dispatch('input');
  await submitMove(surface);
  assert.equal(surface.moveForm.hidden, false);
  assert.equal(surface.targetPosition.value, '1', 'the original requested ordinal remains visible');
  assert.equal(endpoint.calls.length, 1, 'a conflict never replays the mutation');
  assert.equal(surface.conflict.hidden, false, 'the shared owner conflict UI is available for the move');

  await surface.conflict.querySelector('[data-owner-compare]').dispatch('click');
  await settle();
  assert.notEqual(surface.comparison.textContent, '', 'the current saved order is compared with the local target');
  assert.equal(surface.adoptLink.hidden, false, 'adoption requires an explicit control');
  assert.equal(endpoint.calls.length, 1, 'comparison is a read and does not retry');
  await surface.adoptLink.dispatch('click');
  assert.equal(endpoint.calls.length, 1, 'adopting observed versions does not replay the move');
  assert.equal(surface.targetPosition.value, '1', 'explicit adoption keeps the requested destination');

  await submitMove(surface);
  assert.equal(endpoint.calls.length, 2, 'only the explicit second submit retries against adopted versions');
  assert.equal(endpoint.calls[1].body.profileVersion, 15);
  assert.equal(endpoint.calls[1].body.placementVersion, target.placementVersion + 1);
  assert.equal(surface.moveForm.hidden, false);
  assert.equal(surface.targetPosition.value, '1');
  assert.equal(writes(requests).length, 2);
});

test('401 conserva el destino, comprueba la misma sesión y sólo reintenta tras Guardar manual', async () => {
  const links = [moveLink(0), moveLink(1)];
  const endpoint = makeMoveEndpoint({ respond: (_request, _state, callNumber) =>
    callNumber === 1 ? jsonResponse({ error: 'UNAUTHENTICATED' }, 401) : undefined });
  const { surface, api, requests } = await mountOwnerLinkMove({ links, override: endpoint.override });
  await openMove(surface, links[1].placementId);
  surface.targetPosition.value = '1';
  await surface.targetPosition.dispatch('input');
  await submitMove(surface);
  assert.equal(surface.targetPosition.value, '1');
  assert.equal(surface.dialog.querySelector('[data-session-recovery-shell]').hidden, false);
  assert.equal(endpoint.calls.length, 1, 'authentication recovery does not replay the attempted write');
  await surface.checkSession.dispatch('click');
  await settle();
  assert.equal(requests.filter(({ method, path }) => method === 'GET' && path === '/api/creador/sesion').length, 1);
  assert.equal(endpoint.calls.length, 1);
  assert.match(surface.sessionStatus.textContent, /volver a guardar/i);
  await submitMove(surface);
  assert.equal(endpoint.calls.length, 2, 'the user explicitly retries after the same session is confirmed');
  assert.equal(api.snapshot().links.find(({ placementId }) => placementId === links[1].placementId).position, 0,
    'the manual retry moves only within its unfeatured group');
});

for (const failure of [
  ['503', (_links) => ({ respond: () => jsonResponse({ error: 'UNAVAILABLE' }, 503) })],
  ['recibo incompatible', (links) => ({ respond: (_request, state) => jsonResponse({
    links: [{ ...state.links.find(({ placementId }) => placementId === links[0].placementId) }],
    versionChanges: [{ entity: 'placement', id: 'otro-placement', before: 1, after: 2 }],
  }) })],
]) {
  test(`${failure[0]} conserva abierto el destino del movimiento y no afirma guardado`, async () => {
    const links = [moveLink(0), moveLink(1), moveLink(2)];
    const endpoint = makeMoveEndpoint(failure[1](links));
    const { surface, requests } = await mountOwnerLinkMove({ links, override: endpoint.override });
    await openMove(surface, links[2].placementId);
    surface.targetPosition.value = '1';
    await surface.targetPosition.dispatch('input');
    await submitMove(surface);
    assert.equal(surface.moveForm.hidden, false);
    assert.equal(surface.targetPosition.value, '1');
    assert.notEqual(surface.moveStatus.dataset.kind, 'success');
    assert.doesNotMatch(surface.moveStatus.textContent, /^(?:movimiento|orden) guardad[oa]s?\./i);
    assert.equal(endpoint.calls.length, 1, 'the failure does not trigger a replay');
    assert.equal(writes(requests).length, 1);
    await submitMove(surface);
    assert.equal(endpoint.calls.length, 2, 'a second attempt requires an explicit submit');
    assert.equal(endpoint.calls[1].body.profileVersion, 14, 'the rejected receipt did not advance the observed profile version');
    assert.equal(endpoint.calls[1].body.placementVersion, links[2].placementVersion,
      'the rejected receipt did not advance the observed placement version');
  });
}

test('acuse de red perdido conserva el destino como incierto sin reenvío', async () => {
  const links = [moveLink(0), moveLink(1), moveLink(2)];
  const endpoint = makeMoveEndpoint({ afterMove: () => { throw new Error('connection lost after commit'); } });
  const { surface, api, requests } = await mountOwnerLinkMove({ links, override: endpoint.override });
  await openMove(surface, links[2].placementId);
  surface.targetPosition.value = '1';
  await surface.targetPosition.dispatch('input');
  await submitMove(surface);
  assert.equal(surface.moveForm.hidden, false);
  assert.equal(surface.targetPosition.value, '1');
  assert.notEqual(surface.moveStatus.dataset.kind, 'success');
  assert.equal(endpoint.calls.length, 1);
  assert.equal(writes(requests).length, 1);
  assert.equal(api.snapshot().profile.version, 15, 'the remote operation may already have committed');
});

test('una corrección de destino durante el request queda pendiente y no se mezcla con el recibo enviado', async () => {
  let release;
  let entered;
  const held = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  const links = [moveLink(0), moveLink(1), moveLink(2), moveLink(3)];
  const endpoint = makeMoveEndpoint({ beforeMove: async (_request, _state, callNumber) => {
    if (callNumber === 1) { entered(); await held; }
  } });
  const { surface, api } = await mountOwnerLinkMove({ links, override: endpoint.override });
  await openMove(surface, links[3].placementId);
  surface.targetPosition.value = '2';
  await surface.targetPosition.dispatch('input');
  const pending = surface.moveForm.dispatch('submit');
  await started;
  assert.equal(surface.targetPosition.disabled, false, 'the move target remains editable during the request');
  surface.targetPosition.value = '3';
  await surface.targetPosition.dispatch('input');
  const duplicateSubmit = surface.moveForm.dispatch('submit');
  await settle();
  assert.equal(endpoint.calls.length, 1, 'the active move form cannot start a second write while the first is pending');
  release();
  await Promise.all([pending, duplicateSubmit]);
  assert.equal(endpoint.calls.length, 1);
  assert.equal(endpoint.calls[0].body.targetPosition, 2, 'the server receives only the captured destination');
  assert.equal(surface.targetPosition.value, '3', 'the late correction remains in the form');
  assert.equal(surface.moveForm.hidden, false, 'the editor stays open for the unsent correction');
  assert.equal(api.snapshot().profile.version, 15, 'only the captured move is committed');
});

test('el borrador de movimiento usa Guardar, Descartar y Seguir editando al cambiar de fila', async () => {
  const links = [moveLink(0), moveLink(1), moveLink(2)];
  const endpoint = makeMoveEndpoint();
  const { surface, requests } = await mountOwnerLinkMove({ links, override: endpoint.override });
  await openMove(surface, links[0].placementId);
  surface.targetPosition.value = '2';
  await surface.targetPosition.dispatch('input');

  await rowFor(surface, links[1].placementId).querySelector('[data-link-move]').dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitContinue.dispatch('click');
  assert.equal(surface.moveForm.hidden, false);
  assert.equal(surface.targetPosition.value, '2', 'continue keeps the same placement and destination');
  assert.equal(writes(requests).length, 0);

  await rowFor(surface, links[1].placementId).querySelector('[data-link-move]').dispatch('click');
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.moveForm.hidden, false);
  assert.equal(surface.targetPosition.value, '2', 'discard opens the second placement at its own current ordinal');
  assert.equal(writes(requests).length, 0, 'discarding the first destination sends no move');

  surface.targetPosition.value = '1';
  await surface.targetPosition.dispatch('input');
  await rowFor(surface, links[2].placementId).querySelector('[data-link-move]').dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitSave.dispatch('click');
  await settle();
  assert.equal(endpoint.calls.length, 1, 'Save confirms the active move before opening the requested placement');
  assert.equal(endpoint.calls[0].path, `/api/creador/enlaces/${links[1].placementId}/mover`);
  assert.equal(endpoint.calls[0].body.targetPosition, 1);
  assert.equal(surface.dialog.open, true);
  assert.equal(surface.moveForm.hidden, false);
  assert.equal(surface.targetPosition.value, '3', 'the next placement opens with its current ordinal after the saved move');
  assert.equal(surface.window.location.search, '?vista=enlaces&buscar=&orden=pagina&paginaEnlaces=1',
    'changing rows preserves the current table context');
});

test('una comparación tardía del movimiento de A no contamina el editor activo de B', async () => {
  let releaseCompare;
  let markCompareStarted;
  let comparisonPayload;
  const compareGate = new Promise((resolve) => { releaseCompare = resolve; });
  const compareStarted = new Promise((resolve) => { markCompareStarted = resolve; });
  const links = [moveLink(0), moveLink(1), moveLink(2)];
  const endpoint = makeMoveEndpoint({ respond: (_request, state, callNumber) => {
    if (callNumber !== 1) return undefined;
    state.profile.version += 1;
    state.links[0].position = 15;
    state.links[0].placementVersion += 1;
    return jsonResponse({ error: 'ORDER_CONFLICT' }, 409);
  } });
  const override = async (request, state) => {
    const moved = await endpoint.override(request, state);
    if (moved instanceof Response) return moved;
    if (request.method === 'GET' && request.path.replace(/\/$/, '') === '/api/creador/perfil') {
      comparisonPayload = {
        profile: { ...state.profile },
        links: state.links.map((link) => ({ ...link, series: (link.series ?? []).map((item) => ({ ...item })) })),
        editableResources: state.editableResources.map((resource) => ({ ...resource })),
        claims: [], series: [],
      };
      markCompareStarted();
      await compareGate;
      return jsonResponse(comparisonPayload);
    }
    return undefined;
  };
  const { surface, requests } = await mountOwnerLinkMove({ links, override });

  await openMove(surface, links[0].placementId);
  surface.targetPosition.value = '3';
  await surface.targetPosition.dispatch('input');
  await submitMove(surface);
  assert.equal(surface.moveConflict.hidden, false);

  const comparison = surface.conflict.querySelector('[data-owner-compare]').dispatch('click');
  await compareStarted;
  await rowFor(surface, links[1].placementId).querySelector('[data-link-move]').dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.moveForm.hidden, false);
  assert.equal(surface.targetPosition.value, '2', 'B is now the active unit with its own destination');
  assert.equal(surface.moveConflict.hidden, true, 'A’s conflict does not remain attached to B');

  releaseCompare();
  await comparison;
  assert.equal(surface.moveConflict.hidden, true, 'A’s delayed read cannot reopen conflict UI over B');
  assert.equal(surface.comparison.textContent, '', 'A’s saved order is not displayed as B’s comparison');
  assert.equal(surface.adoptLink.hidden, true, 'A’s late read cannot enable adoption while B is active');
  assert.equal(writes(requests).length, 1, 'compare is read-only and the conflict did not replay the move');
});


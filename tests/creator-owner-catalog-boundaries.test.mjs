import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATALOG_INDEX_PATH,
  catalogItem,
  createCreatorOwnerCatalogSurface,
  deferred,
  jsonResponse,
  mountCreatorOwnerCatalog,
  settle,
  waitFor,
} from './fixtures/creator-owner-catalog-browser.mjs';
import { callApi, createCreatorPagesHarness, seedResource, sessionCsrf } from './fixtures/creator-pages.mjs';
import { currentUrlKey } from '../src/lib/catalog-url.mjs';

const api = (harness, route, method = 'GET', body) => callApi(harness, route, {
  session: 'creator-a',
  csrf: sessionCsrf['creator-a'],
  method,
  ...(body === undefined ? {} : { body }),
});

async function mountRealCatalog({ suffix, index = catalogItem(11, {
  id: `phase6-real-${suffix}`,
  url: `https://phase6.example.invalid/${suffix}`,
}), additionalIndex = [], beforeApi, afterApi, open = true } = {}) {
  const harness = await createCreatorPagesHarness();
  const created = await api(harness, '/api/creador/perfil', 'PUT', {
    displayName: 'Fase seis', slug: `fase-seis-${suffix}`,
  });
  assert.equal(created.status, 200);
  const profile = (await created.json()).profile;
  let catalogRows = [index, ...additionalIndex];
  const resources = catalogRows.map((item) => ({
    id: item.id, title: item.title, url: item.url, description: '', category: 'Otros', order: 0,
    featured: false, kind: item.tipo, format: 'Artículo', topics: [], published: true, hidden: false,
    approvalRevoked: false, version: 1,
  }));
  for (const resource of resources) await seedResource(harness.store, resource);
  const resource = resources[0];
  const surface = createCreatorOwnerCatalogSurface({
    profile, links: [], editableResources: [], series: [], index: catalogRows,
  });
  surface.referenceForm.setAttribute('method', 'get');
  const correctionAction = surface.document.createElement('button');
  correctionAction.type = 'button';
  correctionAction.dataset.catalogCorrectionOpen = '';
  correctionAction.textContent = 'Revisar opciones de esta colocación';
  correctionAction.hidden = true;
  surface.referenceForm.append(correctionAction);
  surface.catalogCorrectionOpen = correctionAction;
  const requests = await mountCreatorOwnerCatalog({
    surface,
    index: catalogRows,
    respond: async (request) => {
      if (request.method === 'GET' && request.path === CATALOG_INDEX_PATH) return jsonResponse(catalogRows);
      if (!request.path.startsWith('/api/')) return undefined;
      const intercepted = await beforeApi?.(request, { harness, profile, resource, index });
      if (intercepted instanceof Response) return intercepted;
      const response = await api(harness, request.path, request.method, request.body);
      return await afterApi?.(request, response, { harness, profile, resource, index }) ?? response;
    },
  });
  if (open) {
    await surface.catalogOpen.dispatch('click');
    await waitFor(() => surface.catalogResults.querySelectorAll('[data-catalog-row]').length === catalogRows.length,
      'the real owner controller loads the public selection');
    const checkbox = surface.catalogResults.querySelector('[data-catalog-select]');
    checkbox.checked = true;
    await checkbox.dispatch('change');
  }
  return {
    harness, profile, resource, index, surface, requests,
    setCatalogRows(value) { catalogRows = value; },
  };
}

const referenceWrites = (requests) => requests.filter(({ path, method }) => path === '/api/creador/referencias' && method === 'POST');
const placementWrites = (requests) => requests.filter(({ path, method }) => path.endsWith('/editar') && method === 'PATCH');

async function primeOwnerWriteGuard(surface, requests) {
  surface.catalogReference.disabled = true;
  const fields = new Map(surface.addFields.map((item) => [item.name, item]));
  fields.get('title').value = 'Enlace manual previo';
  fields.get('url').value = 'https://phase6.example.invalid/manual-before-catalog';
  fields.get('description').value = 'Alta normal antes de abrir catálogo';
  await surface.addForm.dispatch('submit');
  await waitFor(() => requests.some(({ path, method }) => path === '/api/creador/enlaces' && method === 'POST'),
    'an earlier normal URL write completes through the shared write guard');
  assert.equal(requests.find(({ path, method }) => path === '/api/creador/enlaces' && method === 'POST').status, 201);
}

test('el RESOURCE_CONFLICT real exige actualizar el índice y confirmar el par nuevo a mano', async () => {
  let resourceConflict;
  const context = await mountRealCatalog({ suffix: 'resource-conflict', async afterApi(request, response) {
    if (request.path === '/api/creador/referencias' && response.status === 409) resourceConflict = await response.clone().json();
    return response;
  } });
  const { harness, index, resource, surface, requests } = context;
  const movedUrl = 'https://phase6.example.invalid/current-destination';
  const originalReservation = await harness.store.get(currentUrlKey(resource.url));
  assert.equal(await harness.store.transact({
    checks: [
      { key: `resource:${resource.id}`, version: resource.version },
      { key: currentUrlKey(resource.url), version: originalReservation.version },
      { key: currentUrlKey(movedUrl), version: null },
    ],
    puts: [
      { key: `resource:${resource.id}`, value: { ...resource, url: movedUrl, version: resource.version + 1 } },
      { key: currentUrlKey(movedUrl), value: {
        recordType: 'urlReservation', url: movedUrl, status: 'reserved', resourceId: resource.id, version: 1,
      } },
    ],
    deletes: [currentUrlKey(resource.url)],
  }), true);

  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 1, 'the old observed pair reaches the real API');
  assert.equal(referenceWrites(requests)[0].status, 409);
  assert.equal(resourceConflict.error, 'RESOURCE_CONFLICT');
  assert.equal(surface.catalogRetry.hidden, false);
  assert.equal(surface.catalogReference.disabled, true);
  assert.match(surface.catalogStatus.textContent, /actualiza el catálogo|URL observada pudo cambiar/i);
  assert.equal(requests.filter(({ path, method }) => path === '/api/creador/perfil' && method === 'GET').length, 0,
    'a stale resource URL never starts a private owner read');
  assert.equal(requests.some(({ path }) => path === '/api/creador/enlaces'), false,
    'the stale pair never falls back to literal URL creation');

  context.setCatalogRows([{ ...index, url: movedUrl }]);
  await surface.catalogRetry.dispatch('click');
  await waitFor(() => surface.catalogResults.descendants().some(({ textContent }) => textContent.includes(movedUrl)),
    'explicit refresh presents the current public URL');
  assert.equal(surface.catalogResults.querySelector('[data-catalog-select]').checked, true,
    'the selected resource identity remains selected for review');
  assert.equal(referenceWrites(requests).length, 1, 'refreshing the public index does not replay the POST');
  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 2, 'a second explicit submit uses the refreshed pair');
  assert.equal(referenceWrites(requests)[1].status, 201);
  assert.equal(referenceWrites(requests)[1].body.url, movedUrl);
  const owner = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(owner.links[0].url, movedUrl);
});

test('el LINK_CONFLICT CAS real requiere comparar, adoptar y volver a enviar manualmente', async () => {
  let linkConflict;
  const referenceErrors = [];
  let raceHookInstalled = false;
  const context = await mountRealCatalog({ suffix: 'link-conflict', beforeApi(request, { harness, profile }) {
    if (raceHookInstalled || request.path !== '/api/creador/referencias' || request.method !== 'POST') return undefined;
    raceHookInstalled = true;
    const transact = harness.store.transact.bind(harness.store);
    let raced = false;
    harness.store.transact = async (transaction) => {
      if (!raced && transaction.puts.some(({ key }) => key.startsWith(`placement:${profile.id}:`))) {
        raced = true;
        const key = `profile:${profile.id}`;
        const current = await harness.store.get(key);
        await transact({ checks: [{ key, version: current.version }], puts: [{ key, value: { ...current, version: current.version + 1 } }] });
      }
      return transact(transaction);
    };
    return undefined;
  }, async afterApi(request, response) {
    if (request.path === '/api/creador/referencias' && response.status === 409) {
      const error = await response.clone().json();
      referenceErrors.push(error);
      linkConflict = error;
    }
    return response;
  } });
  const { profile, index, surface, requests } = context;
  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 1, 'the real CAS race returns its conflict');
  assert.equal(referenceWrites(requests)[0].status, 409);
  assert.equal(linkConflict.error, 'LINK_CONFLICT');
  assert.equal(surface.referenceConflict.hidden, false);
  assert.equal(surface.catalogRetry.hidden, false, 'ambiguous CAS conflicts offer an explicit index refresh too');
  assert.equal(surface.catalogReference.disabled, true, 'the failed request cannot be replayed before recovery');
  assert.equal(requests.filter(({ path, method }) => path === '/api/creador/perfil' && method === 'GET').length, 0);
  assert.equal(referenceWrites(requests).length, 1);

  await surface.referenceCompare.dispatch('click');
  await waitFor(() => surface.referenceAdopt.hidden === false, 'Compare returns the new owner profile version');
  assert.equal(referenceWrites(requests).length, 1, 'comparison does not replay the reference');
  await surface.referenceAdopt.dispatch('click');
  assert.equal(surface.root.dataset.profileVersion, String(profile.version + 1));
  assert.equal(surface.catalogReference.disabled, false, 'explicit adoption enables a manual retry');
  assert.equal(surface.catalogResults.querySelector('[data-catalog-select]').checked, true);
  assert.equal(surface.catalogDirectory.checked, true);

  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 2, 'the owner explicitly retries with the adopted version');
  assert.equal(referenceWrites(requests)[1].body.profileVersion, profile.version + 1);
  assert.equal(referenceWrites(requests)[1].body.resourceId, index.id);
  assert.equal(referenceWrites(requests)[1].body.url, index.url);
  assert.equal(referenceWrites(requests)[1].status, 201, JSON.stringify(referenceErrors));
});

test('el checkbox tardío se guarda con PATCH de opciones y recibos reales, nunca con otra referencia', async () => {
  const pendingResponse = deferred();
  let heldResponse;
  const context = await mountRealCatalog({ suffix: 'late-option', afterApi(request, response) {
    if (request.path === '/api/creador/referencias' && request.method === 'POST' && !heldResponse) {
      heldResponse = response;
      return pendingResponse.promise;
    }
    return response;
  } });
  const { harness, profile, index, surface, requests } = context;
  const savingReference = surface.referenceForm.dispatch('submit');
  await waitFor(() => heldResponse instanceof Response, 'the real reference transaction commits before its receipt is released');
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');
  pendingResponse.resolve(heldResponse);
  await savingReference;
  await settle();

  assert.equal(referenceWrites(requests).length, 1);
  assert.equal(referenceWrites(requests)[0].status, 201);
  assert.equal(surface.catalogDirectory.checked, false, 'the late option correction remains visible');
  assert.match(surface.catalogStatus.textContent, /sigue sin guardar|opciones de esta colocación/i);
  const correction = surface.catalogCorrectionOpen;
  assert.equal(correction.hidden, false, 'the saved placement has an explicit options action');
  assert.equal(surface.catalogReference.disabled, true, 'the idempotent reference button cannot masquerade as an options save');

  await correction.dispatch('click');
  const option = surface.linkEditForm.elements.find(({ name }) => name === 'selectedForDirectory');
  assert.equal(surface.linkEditForm.hidden, false);
  assert.equal(surface.metadataPanel.hidden, true, 'a shared reference still cannot edit metadata');
  assert.equal(option.checked, false, 'the unsaved late correction transfers into the placement form');
  await surface.linkEditForm.dispatch('submit');
  await waitFor(() => placementWrites(requests).length === 1, 'saving options calls the real placement PATCH');

  const reference = referenceWrites(requests)[0];
  const placement = placementWrites(requests)[0];
  assert.equal(placement.status, 200);
  assert.equal(placement.body.profileVersion, profile.version + 1);
  assert.equal(placement.body.placementVersion, profile.version + 1);
  assert.equal(placement.body.resourceVersion, 1);
  assert.deepEqual(placement.body, {
    profileVersion: profile.version + 1,
    placementVersion: profile.version + 1,
    resourceVersion: 1,
    featured: false,
    selectedForDirectory: false,
  });
  assert.equal(referenceWrites(requests).length, 1, 'the correction did not repeat the reference POST');
  assert.equal(surface.root.dataset.profileVersion, String(profile.version + 2));
  assert.equal(surface.table.querySelectorAll('[data-link-row]').length, 1);
  assert.ok(surface.table.descendants().some(({ textContent }) => /No propuesta/.test(textContent)));
  const stored = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(stored.links[0].selectedForDirectory, false, 'the options PATCH persists the requested state in the real store');
  assert.equal(stored.links[0].placementVersion, profile.version + 2);
  assert.equal(reference.body.selectedForDirectory, true);
});

test('después de guardar una propuesta opt-out, abrir catálogo inicia una alta nueva con default true', async () => {
  const first = catalogItem(30, { id: 'phase6-default-first', url: 'https://phase6.example.invalid/default-first' });
  const second = catalogItem(31, { id: 'phase6-default-second', url: 'https://phase6.example.invalid/default-second' });
  const third = catalogItem(32, { id: 'phase6-default-third', url: 'https://phase6.example.invalid/default-third' });
  const { harness, surface, requests } = await mountRealCatalog({
    suffix: 'fresh-default', index: first, additionalIndex: [second, third],
  });
  assert.equal(surface.catalogDirectory.checked, true);
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');
  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 1, 'the first catalog reference is saved with opt-out');
  assert.equal(referenceWrites(requests)[0].status, 201);
  assert.equal(referenceWrites(requests)[0].body.selectedForDirectory, false);
  assert.equal(surface.dialog.open, false, 'the confirmed, clean save closes the dialog');
  const firstSaved = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(firstSaved.links.find(({ resourceId }) => resourceId === first.id).selectedForDirectory, false);

  await surface.catalogOpen.dispatch('click');
  await waitFor(() => surface.dialog.open && surface.catalogResults.querySelectorAll('[data-catalog-row]').length === 3,
    'reopening starts from the cached catalog results');
  assert.equal(surface.catalogResults.querySelectorAll('[data-catalog-select]').some(({ checked }) => checked), false,
    'the previous resource is not carried into a new intention');
  assert.equal(surface.catalogDirectory.checked, true,
    'the new reference starts with the approved directory proposal enabled');

  const secondRow = surface.catalogResults.querySelectorAll('[data-catalog-row]')
    .find(({ dataset }) => dataset.catalogRow === second.id);
  const secondCheckbox = secondRow.querySelector('[data-catalog-select]');
  secondCheckbox.checked = true;
  await secondCheckbox.dispatch('change');
  assert.equal(surface.catalogDirectory.checked, true);
  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 2, 'the new selection is submitted independently');
  assert.equal(referenceWrites(requests)[1].body.resourceId, second.id);
  assert.equal(referenceWrites(requests)[1].body.selectedForDirectory, true);
  assert.equal(referenceWrites(requests)[1].status, 201);
  const saved = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(saved.links.find(({ resourceId }) => resourceId === second.id).selectedForDirectory, true);

  await surface.catalogOpen.dispatch('click');
  await waitFor(() => surface.dialog.open && surface.catalogResults.querySelectorAll('[data-catalog-row]').length === 3,
    'a new open after the second confirmed reference starts another intention');
  const existingFirst = surface.catalogResults.querySelectorAll('[data-catalog-row]')
    .find(({ dataset }) => dataset.catalogRow === first.id).querySelector('[data-catalog-select]');
  existingFirst.checked = true;
  await existingFirst.dispatch('change');
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');
  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 3, 'the existing resource returns its duplicate receipt');
  assert.equal(referenceWrites(requests)[2].status, 200);
  assert.equal(referenceWrites(requests)[2].body.selectedForDirectory, false);
  assert.equal(surface.dialog.open, false, 'a clean duplicate receipt closes the catalog without another action');
  const duplicateOwner = await (await api(harness, '/api/creador/perfil')).json();
  const duplicateLink = duplicateOwner.links.find(({ resourceId }) => resourceId === first.id);
  const duplicateRow = surface.table.querySelectorAll('[data-link-row]')
    .find(({ dataset }) => dataset.linkRow === duplicateLink.placementId);
  assert.ok(duplicateRow, 'the confirmed existing placement remains in its owner row');
  assert.equal(surface.document.activeElement, duplicateRow.querySelector('[data-link-edit]'),
    'focus returns to the options control in the confirmed row');

  await surface.catalogOpen.dispatch('click');
  await waitFor(() => surface.dialog.open && surface.catalogResults.querySelectorAll('[data-catalog-row]').length === 3,
    'opening after the confirmed duplicate starts a new intention');
  assert.equal(surface.catalogResults.querySelectorAll('[data-catalog-select]').some(({ checked }) => checked), false);
  assert.equal(surface.catalogDirectory.checked, true,
    'a clean HTTP 200 no-op does not leave its checkbox as the next resource default');
  const thirdRow = surface.catalogResults.querySelectorAll('[data-catalog-row]')
    .find(({ dataset }) => dataset.catalogRow === third.id);
  const thirdCheckbox = thirdRow.querySelector('[data-catalog-select]');
  thirdCheckbox.checked = true;
  await thirdCheckbox.dispatch('change');
  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 4, 'the next resource is added independently');
  assert.equal(referenceWrites(requests)[3].status, 201);
  assert.equal(referenceWrites(requests)[3].body.resourceId, third.id);
  assert.equal(referenceWrites(requests)[3].body.selectedForDirectory, true);
  const finalOwner = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(finalOwner.links.find(({ resourceId }) => resourceId === third.id).selectedForDirectory, true);
});

test('un 503 libera la referencia tras el coordinador para un reintento manual confirmado por la API real', async () => {
  let failReference = true;
  const context = await mountRealCatalog({ suffix: 'write-503-retry', open: false, beforeApi(request) {
    if (failReference && request.path === '/api/creador/referencias' && request.method === 'POST') {
      failReference = false;
      return jsonResponse({ error: 'UNAVAILABLE' }, 503);
    }
    return undefined;
  } });
  const { surface, requests, index, harness } = context;
  await primeOwnerWriteGuard(surface, requests);
  await surface.catalogOpen.dispatch('click');
  await waitFor(() => surface.catalogResults.querySelectorAll('[data-catalog-row]').length === 1,
    'the catalog opens after a prior owner write');
  const checkbox = surface.catalogResults.querySelector('[data-catalog-select]');
  checkbox.checked = true;
  await checkbox.dispatch('change');
  assert.equal(surface.catalogReference.disabled, false);

  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 1, 'the first reference attempt receives the injected 503');
  assert.equal(referenceWrites(requests)[0].status, 503);
  assert.equal(surface.dialog.open, true);
  assert.equal(checkbox.checked, true);
  assert.equal(surface.catalogReference.disabled, false,
    'release of the shared write guard restores the catalog-specific enabled state');
  assert.equal(referenceWrites(requests).length, 1, 'the failure does not trigger an automatic retry');

  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 2, 'a deliberate second submit reaches the real reference API');
  assert.equal(referenceWrites(requests)[1].status, 201);
  assert.deepEqual(referenceWrites(requests)[1].body, {
    resourceId: index.id,
    url: index.url,
    profileVersion: context.profile.version + 1,
    selectedForDirectory: true,
  });
  const owner = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(owner.links.filter(({ resourceId }) => resourceId === index.id).length, 1);
  assert.equal(owner.links.find(({ resourceId }) => resourceId === index.id).selectedForDirectory, true);
});

test('un recibo incompatible que sí se guardó ofrece comparar y permite completar la referencia sin duplicarla', async () => {
  let corruptFirstReceipt = true;
  const context = await mountRealCatalog({ suffix: 'receipt-recovery', open: false, async afterApi(request, response) {
    if (corruptFirstReceipt && request.path === '/api/creador/referencias' && request.method === 'POST'
      && response.status === 201) {
      corruptFirstReceipt = false;
      return jsonResponse({ ...(await response.clone().json()), versionChanges: [] }, 201);
    }
    return response;
  } });
  const { surface, requests, index, profile, harness } = context;
  await primeOwnerWriteGuard(surface, requests);
  await surface.catalogOpen.dispatch('click');
  await waitFor(() => surface.catalogResults.querySelectorAll('[data-catalog-row]').length === 1,
    'the catalog opens after a prior owner write');
  const checkbox = surface.catalogResults.querySelector('[data-catalog-select]');
  checkbox.checked = true;
  await checkbox.dispatch('change');

  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 1, 'the API commits while the test returns an incompatible receipt');
  assert.equal(referenceWrites(requests)[0].status, 201);
  assert.equal(surface.catalogReference.disabled, true, 'uncertain state waits for explicit comparison');
  assert.equal(surface.referenceConflict.hidden, false);
  assert.equal(surface.referenceCompare.hidden, false);
  assert.equal(checkbox.checked, true);
  assert.equal(referenceWrites(requests).length, 1, 'the incompatible receipt is not replayed automatically');

  await surface.referenceCompare.dispatch('click');
  await waitFor(() => surface.referenceAdopt.hidden === false, 'comparison finds the committed profile version');
  assert.equal(surface.catalogReference.disabled, true);
  assert.equal(referenceWrites(requests).length, 1, 'comparison is read-only');
  await surface.referenceAdopt.dispatch('click');
  assert.equal(surface.root.dataset.profileVersion, String(profile.version + 2),
    'adoption also includes the earlier manual URL save');
  assert.equal(surface.catalogReference.disabled, false, 'explicit adoption unlocks the manual idempotent retry');
  assert.equal(checkbox.checked, true);

  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 2, 'the owner explicitly retries with the adopted version');
  assert.equal(referenceWrites(requests)[1].status, 200);
  assert.equal(referenceWrites(requests)[1].body.resourceId, index.id);
  assert.equal(referenceWrites(requests)[1].body.url, index.url);
  const owner = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(owner.links.filter(({ resourceId }) => resourceId === index.id).length, 1,
    'the incompatible 201 followed by a valid duplicate receipt still leaves one placement');
  assert.match(surface.catalogStatus.textContent, /ya estaba en tu página|conservamos su ficha/i);
});

test('Guardar y salir confirma la corrección tardía con PATCH en vez de repetir la referencia', async () => {
  const pendingResponse = deferred();
  let heldResponse;
  const context = await mountRealCatalog({ suffix: 'late-option-exit', afterApi(request, response) {
    if (request.path === '/api/creador/referencias' && request.method === 'POST' && !heldResponse) {
      heldResponse = response;
      return pendingResponse.promise;
    }
    return response;
  } });
  const { harness, profile, surface, requests } = context;
  const savingReference = surface.referenceForm.dispatch('submit');
  await waitFor(() => heldResponse instanceof Response, 'the real reference transaction is committed');
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');
  pendingResponse.resolve(heldResponse);
  await savingReference;
  await surface.catalogCancel.dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitSave.dispatch('click');
  await waitFor(() => placementWrites(requests)[0]?.status === 200, 'the shared save guard persists the placement correction');
  assert.equal(surface.dialog.open, false, JSON.stringify({
    title: surface.dialogTitle.textContent,
    exitPromptHidden: surface.exitPrompt.hidden,
    referenceStatus: surface.catalogStatus.textContent,
    linkStatus: surface.linkStatus.textContent,
    profileVersion: surface.root.dataset.profileVersion,
    writes: requests.filter(({ method }) => method !== 'GET').map(({ path, method, body, status }) => ({ path, method, body, status })),
  }));
  assert.equal(referenceWrites(requests).length, 1, 'save-and-exit never repeats the idempotent reference POST');
  assert.equal(placementWrites(requests)[0].body.selectedForDirectory, false);
  assert.equal(placementWrites(requests)[0].body.profileVersion, profile.version + 1);
  const stored = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(stored.links[0].selectedForDirectory, false);
  assert.equal(stored.profile.version, profile.version + 2);
});

test('un cuerpo de comparación tardío no puede reemplazar una versión owner ya adoptada', async () => {
  let firstBody;
  let bodyController;
  let comparisonReads = 0;
  const context = await mountRealCatalog({ suffix: 'late-compare', beforeApi: async (request, { harness }) => {
    if (request.path !== '/api/creador/perfil' || request.method !== 'GET') return undefined;
    comparisonReads += 1;
    if (comparisonReads !== 1) return undefined;
    const response = await api(harness, request.path, 'GET');
    firstBody = await response.text();
    return new Response(new ReadableStream({ start(controller) { bodyController = controller; } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  } });
  const { harness, profile, surface, requests } = context;
  const versionTwoResponse = await api(harness, '/api/creador/perfil', 'PUT', {
    version: profile.version, displayName: 'Versión dos',
  });
  const versionTwo = (await versionTwoResponse.json()).profile;
  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 1, 'stale profile returns its real conflict');
  assert.equal(referenceWrites(requests)[0].status, 409);

  await surface.referenceCompare.dispatch('click');
  await waitFor(() => bodyController, 'first owner comparison has headers and a delayed body');
  const versionThreeResponse = await api(harness, '/api/creador/perfil', 'PUT', {
    version: versionTwo.version, displayName: 'Versión tres',
  });
  const versionThree = (await versionThreeResponse.json()).profile;
  await surface.referenceCompare.dispatch('click');
  await waitFor(() => surface.referenceAdopt.hidden === false, 'second owner comparison completes');
  await surface.referenceAdopt.dispatch('click');
  assert.equal(surface.root.dataset.profileVersion, String(versionThree.version));
  bodyController.enqueue(new TextEncoder().encode(firstBody));
  bodyController.close();
  await settle();
  await settle();
  assert.equal(surface.root.dataset.profileVersion, String(versionThree.version), 'the older response cannot roll the adopted profile back');
  assert.equal(surface.referenceComparison.hidden, true, 'the old comparison cannot reopen an adoption action');
  assert.equal(surface.referenceAdopt.hidden, true);
  assert.equal(referenceWrites(requests).length, 1, 'comparison races never replay the reference write');
});

test('revertir una corrección tardía a la opción guardada la limpia y deja listo el siguiente intento', async () => {
  const pendingResponse = deferred();
  let heldResponse;
  const context = await mountRealCatalog({ suffix: 'late-option-revert', afterApi(request, response) {
    if (request.path === '/api/creador/referencias' && request.method === 'POST' && !heldResponse) {
      heldResponse = response;
      return pendingResponse.promise;
    }
    return response;
  } });
  const { surface, requests } = context;
  const savingReference = surface.referenceForm.dispatch('submit');
  await waitFor(() => heldResponse instanceof Response, 'the reference commits before its receipt is released');
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');
  pendingResponse.resolve(heldResponse);
  await savingReference;

  assert.equal(surface.catalogCorrectionOpen.hidden, false, 'the later false value is pending after the 201');
  surface.catalogDirectory.checked = true;
  await surface.catalogDirectory.dispatch('change');
  assert.equal(surface.catalogCorrectionOpen.hidden, true, 'returning to the confirmed value clears the correction');
  assert.equal(surface.catalogReference.disabled, false, 'the catalog is ready for a distinct next intent');
  assert.equal(placementWrites(requests).length, 0, 'reversion does not issue an unnecessary PATCH');

  await surface.catalogCancel.dispatch('click');
  assert.equal(surface.dialog.open, false, 'the reverted state no longer needs the exit guard');
  await surface.catalogOpen.dispatch('click');
  await waitFor(() => surface.catalogResults.querySelectorAll('[data-catalog-row]').length === 1,
    'the next catalog intent opens from the cached valid index');
  assert.equal(surface.catalogResults.querySelector('[data-catalog-select]').checked, false,
    'the prior confirmed resource is not silently reused');
  assert.equal(surface.catalogDirectory.checked, true);
});

test('cambiar de recurso con una corrección pendiente ofrece guardar y deja la nueva selección sin enviar', async () => {
  const first = catalogItem(40, { id: 'phase6-switch-save-first', url: 'https://phase6.example.invalid/switch-save-first' });
  const second = catalogItem(41, { id: 'phase6-switch-save-second', url: 'https://phase6.example.invalid/switch-save-second' });
  const pendingResponse = deferred();
  let heldResponse;
  const context = await mountRealCatalog({ suffix: 'switch-save', index: first, additionalIndex: [second], afterApi(request, response) {
    if (request.path === '/api/creador/referencias' && request.method === 'POST' && !heldResponse) {
      heldResponse = response;
      return pendingResponse.promise;
    }
    return response;
  } });
  const { harness, profile, surface, requests } = context;
  const savingReference = surface.referenceForm.dispatch('submit');
  await waitFor(() => heldResponse instanceof Response, 'the reference commits before its receipt is released');
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');
  pendingResponse.resolve(heldResponse);
  await savingReference;
  await waitFor(() => referenceWrites(requests).length === 1, 'the first resource receives its real 201 receipt');

  surface.catalogSearchForm.setAttribute('method', 'get');
  surface.catalogSearch.value = second.title;
  await surface.catalogSearchForm.dispatch('submit');
  assert.equal(surface.catalogResults.querySelectorAll('[data-catalog-row]').length, 1,
    'the pending A correction remains selected while the search shows B');
  assert.equal(surface.catalogResults.querySelector('[data-catalog-row]').dataset.catalogRow, second.id);

  const secondCheckbox = surface.catalogResults.querySelectorAll('[data-catalog-row]')
    .find(({ dataset }) => dataset.catalogRow === second.id).querySelector('[data-catalog-select]');
  secondCheckbox.checked = true;
  await secondCheckbox.dispatch('change');
  assert.equal(surface.exitPrompt.hidden, false, 'the existing exit guard handles a context switch');
  assert.equal(surface.catalogResults.querySelector('[data-catalog-select]').checked, false,
    'B remains unselected until the choice is resolved');
  assert.equal(surface.selectedCount.textContent, `1 recurso seleccionado: ${first.title}`,
    'the filtered-out A remains the active draft');
  assert.equal(placementWrites(requests).length, 0, 'the correction is not saved before the explicit choice');

  await surface.exitSave.dispatch('click');
  await waitFor(() => placementWrites(requests)[0]?.status === 200, 'Save persists A with current placement versions');
  assert.equal(surface.dialog.open, true, 'saving A returns to the catalog with B still present');
  assert.equal(surface.catalogSearch.value, second.title, 'Save preserves the catalog query that identified B');
  const checked = surface.catalogResults.querySelectorAll('[data-catalog-select]').find(({ checked: value }) => value);
  assert.equal(checked.closest('[data-catalog-row]').dataset.catalogRow, second.id);
  assert.equal(referenceWrites(requests).length, 1, 'B has not been submitted as part of A\'s save');
  assert.equal(placementWrites(requests)[0].body.selectedForDirectory, false);
  assert.equal(placementWrites(requests)[0].body.profileVersion, profile.version + 1);
  assert.equal(placementWrites(requests)[0].body.placementVersion, profile.version + 1);

  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 2, 'B requires its own explicit Add action');
  assert.equal(referenceWrites(requests)[1].body.resourceId, second.id);
  assert.equal(referenceWrites(requests)[1].status, 201);
  const owner = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(owner.links.find(({ resourceId }) => resourceId === first.id).selectedForDirectory, false);
  assert.equal(owner.links.find(({ resourceId }) => resourceId === second.id).selectedForDirectory, true);
});

test('descartar al cambiar de recurso elimina sólo la corrección anterior y conserva B para agregarlo después', async () => {
  const first = catalogItem(42, { id: 'phase6-switch-discard-first', url: 'https://phase6.example.invalid/switch-discard-first' });
  const second = catalogItem(43, { id: 'phase6-switch-discard-second', url: 'https://phase6.example.invalid/switch-discard-second' });
  const pendingResponse = deferred();
  let heldResponse;
  const { harness, surface, requests } = await mountRealCatalog({ suffix: 'switch-discard', index: first, additionalIndex: [second], afterApi(request, response) {
    if (request.path === '/api/creador/referencias' && request.method === 'POST' && !heldResponse) {
      heldResponse = response;
      return pendingResponse.promise;
    }
    return response;
  } });
  const savingReference = surface.referenceForm.dispatch('submit');
  await waitFor(() => heldResponse instanceof Response, 'the reference commits before its receipt is released');
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');
  pendingResponse.resolve(heldResponse);
  await savingReference;
  surface.catalogSearchForm.setAttribute('method', 'get');
  surface.catalogSearch.value = second.title;
  await surface.catalogSearchForm.dispatch('submit');
  assert.equal(surface.catalogResults.querySelector('[data-catalog-row]').dataset.catalogRow, second.id);
  const secondCheckbox = surface.catalogResults.querySelectorAll('[data-catalog-row]')
    .find(({ dataset }) => dataset.catalogRow === second.id).querySelector('[data-catalog-select]');
  secondCheckbox.checked = true;
  await secondCheckbox.dispatch('change');
  assert.equal(surface.exitPrompt.hidden, false);

  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.dialog.open, true, 'discarding A returns to the requested catalog choice');
  assert.equal(surface.catalogSearch.value, second.title, 'Discard restores the query that identified B');
  const checked = surface.catalogResults.querySelectorAll('[data-catalog-select]').find(({ checked: value }) => value);
  assert.equal(checked.closest('[data-catalog-row]').dataset.catalogRow, second.id);
  assert.equal(placementWrites(requests).length, 0, 'Discard never PATCHes A');
  assert.equal(referenceWrites(requests).length, 1, 'Discard never creates B implicitly');
  let owner = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(owner.links.find(({ resourceId }) => resourceId === first.id).selectedForDirectory, true,
    'only the local correction to A was discarded');

  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 2, 'B remains an explicit later reference');
  assert.equal(referenceWrites(requests)[1].body.resourceId, second.id);
  owner = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(owner.links.find(({ resourceId }) => resourceId === second.id).selectedForDirectory, true);
});

test('seguir editando al intentar cambiar de recurso conserva A y su corrección sin PATCH', async () => {
  const first = catalogItem(44, { id: 'phase6-switch-continue-first', url: 'https://phase6.example.invalid/switch-continue-first' });
  const second = catalogItem(45, { id: 'phase6-switch-continue-second', url: 'https://phase6.example.invalid/switch-continue-second' });
  const pendingResponse = deferred();
  let heldResponse;
  const { surface, requests } = await mountRealCatalog({ suffix: 'switch-continue', index: first, additionalIndex: [second], afterApi(request, response) {
    if (request.path === '/api/creador/referencias' && request.method === 'POST' && !heldResponse) {
      heldResponse = response;
      return pendingResponse.promise;
    }
    return response;
  } });
  const savingReference = surface.referenceForm.dispatch('submit');
  await waitFor(() => heldResponse instanceof Response, 'the reference commits before its receipt is released');
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');
  pendingResponse.resolve(heldResponse);
  await savingReference;
  surface.catalogSearchForm.setAttribute('method', 'get');
  surface.catalogSearch.value = second.title;
  await surface.catalogSearchForm.dispatch('submit');
  const secondCheckbox = surface.catalogResults.querySelectorAll('[data-catalog-row]')
    .find(({ dataset }) => dataset.catalogRow === second.id).querySelector('[data-catalog-select]');
  secondCheckbox.checked = true;
  await secondCheckbox.dispatch('change');
  assert.equal(surface.exitPrompt.hidden, false);

  await surface.exitContinue.dispatch('click');
  assert.equal(surface.exitPrompt.hidden, true);
  assert.equal(surface.dialog.open, true);
  assert.equal(surface.catalogSearch.value, second.title);
  assert.equal(surface.catalogResults.querySelector('[data-catalog-row]').dataset.catalogRow, second.id,
    'Continue preserves B as the current search result without selecting it');
  assert.equal(surface.selectedCount.textContent, `1 recurso seleccionado: ${first.title}`,
    'A remains the pending selection even though the query shows B');
  assert.equal(surface.catalogResults.querySelector('[data-catalog-select]').checked, false);
  assert.equal(surface.catalogDirectory.checked, false);
  assert.equal(surface.catalogCorrectionOpen.hidden, false);
  assert.equal(placementWrites(requests).length, 0);
  assert.equal(referenceWrites(requests).length, 1);
});

test('permite elegir B durante una referencia en curso si A no tiene una corrección de opción', async () => {
  const first = catalogItem(50, { id: 'phase6-inflight-first', url: 'https://phase6.example.invalid/inflight-first' });
  const second = catalogItem(51, { id: 'phase6-inflight-second', url: 'https://phase6.example.invalid/inflight-second' });
  const pendingResponse = deferred();
  let heldResponse;
  const context = await mountRealCatalog({ suffix: 'inflight-switch', index: first, additionalIndex: [second], afterApi(request, response) {
    if (request.path === '/api/creador/referencias' && request.method === 'POST' && !heldResponse) {
      heldResponse = response;
      return pendingResponse.promise;
    }
    return response;
  } });
  const { harness, surface, requests } = context;
  const savingFirst = surface.referenceForm.dispatch('submit');
  await waitFor(() => heldResponse instanceof Response, 'A commits while its receipt is delayed');
  const secondCheckbox = surface.catalogResults.querySelectorAll('[data-catalog-row]')
    .find(({ dataset }) => dataset.catalogRow === second.id).querySelector('[data-catalog-select]');
  secondCheckbox.checked = true;
  await secondCheckbox.dispatch('change');
  assert.equal(surface.catalogResults.querySelectorAll('[data-catalog-select]').find(({ checked }) => checked)
    .closest('[data-catalog-row]').dataset.catalogRow, second.id, 'ordinary inflight switching remains available');
  pendingResponse.resolve(heldResponse);
  await savingFirst;
  assert.equal(referenceWrites(requests).length, 1, 'the receipt does not submit B automatically');
  const selected = surface.catalogResults.querySelectorAll('[data-catalog-select]').find(({ checked }) => checked);
  assert.equal(selected.closest('[data-catalog-row]').dataset.catalogRow, second.id, 'B remains the unsubmitted choice');

  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 2, 'B still needs its own explicit Add action');
  assert.equal(referenceWrites(requests)[1].body.resourceId, second.id);
  const owner = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(owner.links.length, 2);
});

test('el fallo al guardar opciones conserva la corrección para un reintento explícito', async () => {
  let failFirstPatch = true;
  const pendingResponse = deferred();
  let heldResponse;
  const context = await mountRealCatalog({ suffix: 'late-option-patch-error', afterApi(request, response) {
    if (request.path === '/api/creador/referencias' && request.method === 'POST' && !heldResponse) {
      heldResponse = response;
      return pendingResponse.promise;
    }
    return response;
  }, beforeApi(request) {
    if (failFirstPatch && request.path.endsWith('/editar') && request.method === 'PATCH') {
      failFirstPatch = false;
      return jsonResponse({ error: 'UNAVAILABLE' }, 503);
    }
    return undefined;
  } });
  const { harness, surface, requests } = context;
  const savingReference = surface.referenceForm.dispatch('submit');
  await waitFor(() => heldResponse instanceof Response, 'the reference commits before its receipt is released');
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');
  pendingResponse.resolve(heldResponse);
  await savingReference;
  await surface.catalogCorrectionOpen.dispatch('click');
  const directory = surface.linkEditForm.elements.find(({ name }) => name === 'selectedForDirectory');
  assert.equal(directory.checked, false, 'the latest correction reaches the current link form');

  await surface.linkEditForm.dispatch('submit');
  await waitFor(() => placementWrites(requests).length === 1, 'the injected PATCH failure is observable');
  assert.equal(placementWrites(requests)[0].status, 503);
  assert.equal(directory.checked, false, 'the failed write keeps the correction visible');
  let owner = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(owner.links[0].selectedForDirectory, true, 'the failed PATCH did not change the stored option');

  await surface.linkEditForm.dispatch('submit');
  await waitFor(() => placementWrites(requests).length === 2, 'a deliberate retry uses current observed versions');
  assert.equal(placementWrites(requests)[1].status, 200);
  assert.equal(placementWrites(requests)[1].body.selectedForDirectory, false);
  owner = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(owner.links[0].selectedForDirectory, false);
});

test('una corrección posterior durante PATCH conserva la última opción y la versión recién confirmada', async () => {
  const pendingReference = deferred();
  const pendingPatch = deferred();
  let heldReference;
  let heldPatch;
  const context = await mountRealCatalog({ suffix: 'late-option-patch-revision', afterApi(request, response) {
    if (request.path === '/api/creador/referencias' && request.method === 'POST' && !heldReference) {
      heldReference = response;
      return pendingReference.promise;
    }
    if (request.method === 'PATCH' && request.path.endsWith('/editar') && !heldPatch) {
      heldPatch = response;
      return pendingPatch.promise;
    }
    return response;
  } });
  const { harness, profile, surface, requests } = context;
  const savingReference = surface.referenceForm.dispatch('submit');
  await waitFor(() => heldReference instanceof Response, 'the reference commits before its receipt is released');
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');
  pendingReference.resolve(heldReference);
  await savingReference;
  await surface.catalogCorrectionOpen.dispatch('click');
  const directory = surface.linkEditForm.elements.find(({ name }) => name === 'selectedForDirectory');
  const savingOptions = surface.linkEditForm.dispatch('submit');
  await waitFor(() => heldPatch instanceof Response, 'the option transaction commits before its receipt is released');
  directory.checked = true;
  await directory.dispatch('change');
  pendingPatch.resolve(heldPatch);
  await savingOptions;

  assert.equal(directory.checked, true, 'the post-submit choice remains visible after the older receipt arrives');
  assert.match(surface.linkStatus.textContent, /conservamos la corrección/i);
  assert.equal(placementWrites(requests).length, 1);
  assert.equal(placementWrites(requests)[0].body.profileVersion, profile.version + 1);
  await surface.linkEditForm.dispatch('submit');
  await waitFor(() => placementWrites(requests).length === 2, 'the latest option is sent in a new explicit PATCH');
  assert.equal(placementWrites(requests)[1].body.profileVersion, profile.version + 2);
  assert.equal(placementWrites(requests)[1].body.placementVersion, profile.version + 2);
  assert.equal(placementWrites(requests)[1].body.selectedForDirectory, true);
  const owner = await (await api(harness, '/api/creador/perfil')).json();
  assert.equal(owner.links[0].selectedForDirectory, true);
});

test('buscar con carga fallida o índice malformado conserva el error hasta reintentar', async (t) => {
  for (const failure of ['503', 'malformed']) {
    await t.test(failure, async () => {
      const harness = await createCreatorPagesHarness();
      const created = await api(harness, '/api/creador/perfil', 'PUT', {
        displayName: 'Búsqueda', slug: `busqueda-${failure}`,
      });
      assert.equal(created.status, 200);
      const profile = (await created.json()).profile;
      const surface = createCreatorOwnerCatalogSurface({ profile, index: [] });
      surface.catalogSearchForm.setAttribute('method', 'get');
      const requests = await mountCreatorOwnerCatalog({ surface, respond(request) {
        if (request.method !== 'GET' || request.path !== CATALOG_INDEX_PATH) return undefined;
        return failure === '503'
          ? jsonResponse({ error: 'UNAVAILABLE' }, 503)
          : new Response('{malformed', { status: 200, headers: { 'content-type': 'application/json' } });
      } });
      await surface.catalogOpen.dispatch('click');
      await waitFor(() => /No pudimos (cargar|leer) el catálogo/i.test(surface.catalogStatus.textContent),
        'the initial index request exposes its failure');
      const initialStatus = surface.catalogStatus.textContent;
      surface.catalogSearch.value = 'no existe';
      await surface.catalogSearchForm.dispatch('submit');

      assert.equal(surface.catalogSearchForm.getAttribute('method'), 'get', 'the search uses the real GET form contract');
      assert.equal(surface.catalogStatus.textContent, initialStatus, 'search does not replace a load failure with no matches');
      assert.equal(surface.catalogRetry.hidden, false, 'retry remains available after searching');
      assert.equal(surface.catalogEmpty.hidden, true, 'no empty-result message is shown without a valid index');
      assert.equal(surface.catalogCount.hidden, true, 'a zero count is not announced before a valid index exists');
      assert.equal(surface.catalogResults.querySelectorAll('[data-catalog-row]').length, 0);
      assert.equal(requests.filter(({ path, method }) => path === CATALOG_INDEX_PATH && method === 'GET').length, 1,
        'search does not silently retry the failed index request');
    });
  }
});

test('buscar durante la carga conserva el estado y aplica el término cuando llega un índice válido', async () => {
  const harness = await createCreatorPagesHarness();
  const created = await api(harness, '/api/creador/perfil', 'PUT', {
    displayName: 'Búsqueda pendiente', slug: 'busqueda-pendiente',
  });
  const profile = (await created.json()).profile;
  const first = catalogItem(52, { id: 'phase6-loading-search-first', title: 'Coincidencia pendiente' });
  const indexResponse = deferred();
  const surface = createCreatorOwnerCatalogSurface({ profile, index: [] });
  surface.catalogSearchForm.setAttribute('method', 'get');
  const requests = await mountCreatorOwnerCatalog({ surface, respond(request) {
    if (request.method === 'GET' && request.path === CATALOG_INDEX_PATH) return indexResponse.promise;
    return undefined;
  } });
  await surface.catalogOpen.dispatch('click');
  await waitFor(() => requests.some(({ path, method }) => path === CATALOG_INDEX_PATH && method === 'GET'),
    'the catalog starts one explicit index request');
  const loadingStatus = surface.catalogStatus.textContent;
  assert.match(loadingStatus, /Cargando el catálogo/);
  assert.equal(surface.catalogCount.hidden, true);
  surface.catalogSearch.value = 'Coincidencia pendiente';
  await surface.catalogSearchForm.dispatch('submit');
  assert.equal(surface.catalogStatus.textContent, loadingStatus, 'search does not replace the loading status');
  assert.equal(surface.catalogEmpty.hidden, true);

  indexResponse.resolve(jsonResponse([first]));
  await waitFor(() => surface.catalogResults.querySelectorAll('[data-catalog-row]').length === 1,
    'the saved query filters the valid response when it arrives');
  assert.equal(surface.catalogResults.querySelector('[data-catalog-row]').dataset.catalogRow, first.id);
  assert.match(surface.catalogStatus.textContent, /1 resultado para la búsqueda/);
});

test('Buscar filtra y anuncia cero resultados sólo después de cargar un índice válido', async () => {
  const first = catalogItem(46, { id: 'phase6-valid-search-first', title: 'Coincidencia exacta' });
  const second = catalogItem(47, { id: 'phase6-valid-search-second', title: 'Otro recurso' });
  const { surface } = await mountRealCatalog({ suffix: 'valid-search', index: first, additionalIndex: [second] });
  surface.catalogSearchForm.setAttribute('method', 'get');
  surface.catalogSearch.value = 'Coincidencia exacta';
  await surface.catalogSearchForm.dispatch('submit');
  assert.equal(surface.catalogResults.querySelectorAll('[data-catalog-row]').length, 1);
  assert.match(surface.catalogStatus.textContent, /1 resultado para la búsqueda/);

  surface.catalogSearch.value = 'término sin coincidencias';
  await surface.catalogSearchForm.dispatch('submit');
  assert.equal(surface.catalogResults.querySelectorAll('[data-catalog-row]').length, 0);
  assert.equal(surface.catalogEmpty.hidden, false);
  assert.match(surface.catalogStatus.textContent, /No hay recursos que coincidan/);
});

test('desmarcar un resultado conserva el foco en la misma fila por identidad estable', async () => {
  const first = catalogItem(48, { id: 'phase6-focus-first' });
  const second = catalogItem(49, { id: 'phase6-focus-second' });
  const { surface } = await mountRealCatalog({ suffix: 'focus-deselect', index: first, additionalIndex: [second] });
  const checkbox = surface.catalogResults.querySelectorAll('[data-catalog-row]')
    .find(({ dataset }) => dataset.catalogRow === first.id).querySelector('[data-catalog-select]');
  checkbox.focus();
  checkbox.checked = false;
  await checkbox.dispatch('change');
  const focused = surface.document.activeElement;
  assert.equal(focused?.isConnected, true, 'focus is not left on the removed checkbox');
  assert.notEqual(focused, checkbox, 'focus is moved off the detached checkbox instance');
  assert.equal(focused?.getAttribute('aria-label'), `Seleccionar ${first.title}`);
  const currentRow = surface.catalogResults.querySelectorAll('[data-catalog-row]')
    .find(({ dataset }) => dataset.catalogRow === first.id);
  assert.equal(focused, currentRow?.querySelector('[data-catalog-select]'));
  assert.equal(focused?.closest('[data-catalog-row]')?.dataset.catalogRow, first.id,
    'focus remains at the toggled resource instead of jumping to the first result');
});

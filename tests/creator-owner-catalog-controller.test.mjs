import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CATALOG_INDEX_PATH,
  createCreatorOwnerCatalogSurface,
  catalogItem,
  deferred,
  jsonResponse,
  mountCreatorOwnerCatalog,
  settle,
  waitFor,
  writes,
} from './fixtures/creator-owner-catalog-browser.mjs';

const SITE_ORIGIN = 'https://dondeaprendo.example.invalid';
const profile = {
  id: 'creator-catalog-1', displayName: 'Ana Catálogo', slug: 'ana-catalogo', version: 14,
  published: true, hidden: false, city: '', country: '', bio: '', programs: [], socials: {},
};

function rows(surface) {
  return surface.catalogResults.querySelectorAll('[data-catalog-row]');
}

function rowId(row) {
  return row.dataset.catalogRow ?? row.dataset.catalogId ?? row.dataset.resourceId;
}

function rowFor(surface, id) {
  return rows(surface).find((row) => rowId(row) === id);
}

function elementText(element) {
  return [element?.textContent, ...(element?.descendants?.() ?? []).map(({ textContent }) => textContent)]
    .filter(Boolean).join(' ');
}

function indexReads(requests) {
  return requests.filter(({ method, path }) => method === 'GET' && path === CATALOG_INDEX_PATH);
}

function referenceWrites(requests) {
  return writes(requests).filter(({ method, path }) => method === 'POST' && path === '/api/creador/referencias');
}

async function mount({ index = [], links = [], apiLinks = links, editableResources = [], series = [], query = {}, respond } = {}) {
  const surface = createCreatorOwnerCatalogSurface({
    profile: structuredClone(profile), links, editableResources, series, query, index,
  });
  const requests = await mountCreatorOwnerCatalog({ surface, index, apiLinks, respond });
  return { surface, requests };
}

async function openCatalog(surface, requests) {
  await surface.catalogOpen.dispatch('click');
  await waitFor(() => surface.dialog.open, 'Buscar en el catálogo opens the existing owner dialog');
  await waitFor(() => surface.catalogView.hidden === false, 'the catalog form becomes visible in the owner dialog');
  await waitFor(() => surface.referenceForm.hidden === false, 'the selection form is visible when catalog search opens');
  await waitFor(() => indexReads(requests).length > 0, 'opening catalog search starts its lazy index request');
}

async function selectCatalogItem(surface, id) {
  const row = rowFor(surface, id);
  assert.ok(row, `catalog item ${id} is in the active result page`);
  const checkbox = row.querySelector('[data-catalog-select]');
  assert.ok(checkbox, 'each catalog result has a selection control');
  checkbox.checked = true;
  checkbox.focus();
  await checkbox.dispatch('change');
  return checkbox;
}

async function submitCatalogSearch(surface, value) {
  surface.catalogSearch.value = value;
  await surface.catalogSearchForm.dispatch('submit');
  await settle();
}

function referenceReceipt(request, item, selectedForDirectory = request.body.selectedForDirectory ?? true) {
  const nextVersion = request.body.profileVersion + 1;
  const link = {
    placementId: `placement-${item.id}`,
    resourceId: item.id,
    title: item.title,
    url: item.url,
    description: '',
    featured: false,
    position: 0,
    selectedForDirectory,
    hidden: false,
    directoryApproval: 'pending',
    resourceVersion: 0,
    placementVersion: nextVersion,
    series: [],
  };
  return jsonResponse({
    link,
    created: true,
    versionChanges: [
      { entity: 'profile', id: profile.id, before: request.body.profileVersion, after: nextVersion },
      { entity: 'placement', id: link.placementId, before: 0, after: nextVersion },
    ],
  }, 201);
}

test('el alta normal por URL funciona sin abrir ni descargar el catálogo', async () => {
  const { surface, requests } = await mount({ index: [catalogItem(0)] });
  assert.equal(indexReads(requests).length, 0, 'the owner page does not download the index at startup');
  await surface.addOpen.dispatch('click');
  const field = (name) => surface.addForm.elements.find((element) => element.name === name);
  field('title').value = 'Recurso agregado por URL';
  field('url').value = 'https://known.example.invalid/normal-url';
  field('description').value = 'No requiere el catálogo público.';
  await surface.addForm.dispatch('submit');
  await waitFor(() => writes(requests).some(({ path }) => path === '/api/creador/enlaces'),
    'the existing URL form reaches the normal creation endpoint');
  await waitFor(() => surface.addStatus.textContent.length > 0, 'the existing URL form receives visible feedback');

  const request = writes(requests).find(({ path }) => path === '/api/creador/enlaces');
  assert.equal(request.method, 'POST');
  assert.equal(request.status, 201);
  assert.deepEqual(request.body, {
    title: 'Recurso agregado por URL',
    url: 'https://known.example.invalid/normal-url',
    description: 'No requiere el catálogo público.',
    selectedForDirectory: true,
  });
  assert.equal(indexReads(requests).length, 0, 'URL fallback never depends on the index request');
  assert.match(surface.addStatus.textContent, /agregado|guardad/i);
});

test('el índice se descarga al abrir y una petición en curso se comparte', async () => {
  const item = catalogItem(0);
  const pending = deferred();
  const { surface, requests } = await mount({
    index: [item],
    respond: (request) => request.path === CATALOG_INDEX_PATH ? pending.promise : undefined,
  });

  assert.equal(indexReads(requests).length, 0, 'the static public index is not downloaded during initial owner startup');
  assert.equal(surface.root.querySelectorAll('[data-owner-dialog]').length, 1,
    'catalog search reuses the single owner dialog');
  await surface.catalogOpen.dispatch('click');
  await waitFor(() => surface.dialog.open, 'the owner opens the existing dialog');
  await waitFor(() => indexReads(requests).length === 1, 'the first open creates one lazy catalog request');
  await surface.catalogOpen.dispatch('click');
  await settle();
  assert.equal(indexReads(requests).length, 1, 'opening again while the first fetch is pending does not duplicate it');

  pending.resolve(jsonResponse([item]));
  await waitFor(() => rows(surface).length === 1, 'the real controller renders the returned public item');
  assert.equal(indexReads(requests).length, 1, 'the loaded index stays cached for later filter and page changes');
});

test('buscar título y URL recorre 50 elementos, conserva una selección singular y renderiza texto sin markup', async () => {
  const index = Array.from({ length: 50 }, (_, itemIndex) => catalogItem(itemIndex));
  const longTitle = `${'Curso AWS avanzado '.repeat(40)}<script>alert("x")</script> 'quoted' "AWS"`;
  const safeUrl = 'https://catalog.example.invalid/target-outside-page-one?next=%22%3Cscript%3Ealert(1)%3C%2Fscript%3E&label=%22quoted%22';
  const hostile = catalogItem(47, { title: longTitle, url: safeUrl, tipo: 'event' });
  index[47] = hostile;
  index[0] = catalogItem(0, { tipo: 'source' });
  index[26] = catalogItem(26, { tipo: 'community' });
  const { surface, requests } = await mount({ index });
  await openCatalog(surface, requests);
  await waitFor(() => rows(surface).length === 25, 'the first page contains 25 matching public resources');
  assert.match(surface.catalogCount.textContent, /50/);

  const selectedId = index[0].id;
  const selected = await selectCatalogItem(surface, selectedId);
  await surface.catalogNext.dispatch('click');
  await waitFor(() => rows(surface).some((row) => rowId(row) === index[25].id), 'the second page is shown');
  assert.equal(rows(surface).length, 25, 'the second page also contains at most 25 results');
  assert.equal(surface.selectedCount.textContent.match(/\d+/)?.[0], '1',
    'the first-page selection remains while a different page is visible; phase 6 uses one target');

  await submitCatalogSearch(surface, 'target-outside-page-one');
  await waitFor(() => rows(surface).length === 1, 'search matches URL across the complete index, outside page one');
  assert.equal(rowId(rows(surface)[0]), hostile.id);
  assert.ok(elementText(rows(surface)[0]).includes(longTitle), 'the complete long title remains text');
  assert.ok(elementText(rows(surface)[0]).includes(safeUrl), 'the complete safe HTTPS URL remains available');
  assert.equal(rows(surface)[0].querySelector('script'), null, 'a title marker does not create a script element');
  assert.equal(rows(surface)[0].querySelector('img'), null, 'quotes and markup markers remain text');
  assert.equal(surface.selectedCount.textContent.match(/\d+/)?.[0], '1',
    'filtering keeps the singular selection from page one');

  await submitCatalogSearch(surface, 'quoted');
  await waitFor(() => rows(surface).length === 1, 'search also matches title text on the full collection');
  assert.equal(rowId(rows(surface)[0]), hostile.id);
  assert.equal(selected.checked, true, 'the selected row stays selected when filtering away from it');

  await submitCatalogSearch(surface, 'no existe en el índice');
  await waitFor(() => surface.catalogEmpty.hidden === false, 'zero matches have an explicit empty state');
  assert.equal(rows(surface).length, 0);
  assert.equal(indexReads(requests).length, 1, 'local search does not refetch the index');
});

test('referencia nueva adopta el recibo actual, conserva la selección de directorio y no concede edición', async () => {
  const item = catalogItem(0, { tipo: 'community', title: 'Comunidad Lambda', url: 'https://comunidad.example.invalid/lambda' });
  const { surface, requests } = await mount({ index: [item] });
  await openCatalog(surface, requests);
  await waitFor(() => rows(surface).length === 1, 'the public selection is rendered');
  await selectCatalogItem(surface, item.id);
  assert.equal(surface.catalogDirectory.checked, true, 'directory proposal is selected by default');
  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 1, 'Add to my page calls the dedicated reference command');
  await waitFor(() => surface.table.querySelectorAll('[data-link-row]').length === 1,
    'a valid profile and placement receipt is adopted without a follow-up owner read');

  const request = referenceWrites(requests)[0];
  assert.equal(request.status, 201);
  assert.deepEqual(Object.keys(request.body).filter((key) => key !== 'selectedForDirectory').sort(), ['profileVersion', 'resourceId', 'url']);
  assert.equal(request.body.resourceId, item.id);
  assert.equal(request.body.url, item.url);
  assert.equal(request.body.profileVersion, profile.version);
  assert.equal(request.body.selectedForDirectory ?? true, true,
    'the checked default may be explicit or rely on the endpoint default');
  assert.equal(request.headers.get('x-csrf-token'), 'csrf-a');
  assert.equal(requests.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length, 0,
    'the complete version receipt is sufficient to update the owner table');
  assert.equal(writes(requests).some(({ path }) => path === '/api/creador/enlaces'), false,
    'catalog references do not use the new-URL creation endpoint');
  assert.equal(writes(requests).some(({ path }) => path.includes('/recursos/')), false,
    'referencing never calls the resource metadata editor');
  const apiState = surface.catalogApiState.snapshot();
  assert.equal(apiState.profile.version, profile.version + 1);
  assert.equal(apiState.links[0].resourceVersion, 0);
  assert.equal(apiState.links[0].placementVersion, profile.version + 1);
  assert.equal(apiState.editableResources.some(({ id }) => id === item.id), false,
    'the reference does not create an editable-resource authority');

  const row = surface.table.querySelectorAll('[data-link-row]')[0];
  assert.equal(elementText(row).includes(item.title), true);
  await row.querySelector('[data-link-edit]').dispatch('click');
  assert.equal(surface.linkEditForm.hidden, false);
  assert.equal(surface.metadataPanel.hidden, true, 'a reference does not create edit authority for the catalog record');
  assert.equal(surface.linkEditForm.elements.find(({ name }) => name === 'selectedForDirectory')?.disabled, false,
    'the owner still controls options on the new placement');
  assert.equal(surface.root.dataset.profileVersion, String(profile.version + 1), 'the matching profile receipt is adopted');
  assert.match(surface.linkStatus.textContent, /agregado|enlace.*página/i);
  assert.equal(referenceWrites(requests).length, 1, 'the accepted current receipt is not replayed');
});

test('el directorio es opcional y una corrección tardía del checkbox no se pierde ni crea otra referencia', async () => {
  const item = catalogItem(4, { tipo: 'event', title: 'Evento publicado', url: 'https://events.example.invalid/registro' });
  const pending = deferred();
  const { surface, requests } = await mount({ index: [item], respond: (request) => {
    if (request.method === 'POST' && request.path === '/api/creador/referencias') return pending.promise;
    return undefined;
  } });
  await openCatalog(surface, requests);
  await selectCatalogItem(surface, item.id);
  surface.catalogDirectory.checked = true;
  await surface.catalogDirectory.dispatch('change');
  const saving = surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 1, 'one reference is sent with the captured option');
  assert.equal(referenceWrites(requests)[0].body.selectedForDirectory, true);
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');

  pending.resolve(referenceReceipt(referenceWrites(requests)[0], item, true));
  await saving;
  await settle();
  assert.equal(referenceWrites(requests).length, 1, 'a late checkbox correction is not automatically submitted');
  assert.equal(surface.catalogDirectory.checked, false, 'the correction written during the request remains editable');
  const ownerRow = surface.table.querySelectorAll('[data-link-row]')[0];
  assert.match(elementText(ownerRow), /Propuesta al directorio/,
    'the page adopts the confirmed submitted value, not the unsubmitted late correction');
  assert.equal(surface.dialog.open, true, 'the dialog remains open while the late correction is unsaved');
  assert.match(surface.catalogStatus.textContent, /correcci|revísala|guard/i);
});

test('una respuesta duplicada HTTP 200 preserva la colocación observada, sus series y la consulta', async () => {
  const item = catalogItem(1, { id: 'resource-existing', url: 'https://catalog.example.invalid/observed-resource' });
  const series = [{ id: 'series-existing', name: 'Serie existente', slug: 'serie-existente', version: 3 }];
  const existing = {
    placementId: 'placement-existing', resourceId: item.id, title: 'Metadata ya observada',
    url: item.url, description: 'Descripción conservada', featured: true, position: 37,
    selectedForDirectory: false, hidden: false, directoryApproval: 'approved',
    resourceVersion: 9, placementVersion: 12,
    series: [{ seriesId: 'series-existing', position: 4 }],
  };
  const { surface, requests } = await mount({
    index: [item], links: [], apiLinks: [existing], series, query: { buscar: 'observed-resource' },
  });
  await openCatalog(surface, requests);
  await selectCatalogItem(surface, item.id);
  assert.equal(surface.catalogDirectory.checked, true, 'the dialog default does not replace a linked row\'s opt-out');
  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 1, 'the server validates the observed ID and URL pair');
  await waitFor(() => surface.table.querySelectorAll('[data-link-row]').length === 1,
    'the current duplicate receipt reconciles the existing placement into the owner table');

  const post = referenceWrites(requests)[0];
  assert.equal(post.status, 200);
  assert.equal(post.body.resourceId, item.id);
  assert.equal(post.body.url, item.url);
  assert.equal(post.body.selectedForDirectory ?? true, true,
    'the default is an input to the command, never an override on an existing placement');
  assert.deepEqual(surface.catalogApiState.snapshot().links, [existing],
    'the API state keeps all observed metadata, options, order, versions, and series unchanged');
  assert.equal(surface.catalogApiState.snapshot().profile.version, profile.version,
    'the existing-placement no-op does not advance the profile version');
  assert.equal(new URL(surface.window.location.href).searchParams.get('buscar'), 'observed-resource',
    'the active owner query survives duplicate reconciliation');

  const row = surface.table.querySelectorAll('[data-link-row]')[0];
  assert.match(elementText(row), /Metadata ya observada/);
  assert.match(elementText(row), /Serie existente/);
  assert.match(elementText(row), /No propuesta/);
  assert.match(elementText(row), /Destacado/);
  assert.equal(row.querySelector('[data-link-edit]').textContent, 'Editar opciones',
    'the returned duplicate does not turn an existing shared placement into an editable resource');
  const active = surface.document.activeElement;
  assert.ok(active?.isConnected, 'focus remains on a live owner control after duplicate reconciliation');
  assert.ok(active === surface.searchInput || active === surface.catalogSearch
    || active === surface.catalogReference || row === active || row.descendants().includes(active)
    || surface.catalogResults.descendants().includes(active),
  'focus stays with the owner query, the current result, or its reconciled row');
  await row.querySelector('[data-link-edit]').dispatch('click');
  assert.equal(surface.metadataPanel.hidden, true);
});

test('un 409 por URL desactualizada sólo refresca tras elección y no reenvía el par antiguo', async () => {
  const oldItem = catalogItem(2);
  const currentItem = { ...oldItem, url: 'https://catalog.example.invalid/current-url-after-refresh' };
  let indexAttempt = 0;
  let referenceAttempt = 0;
  const { surface, requests } = await mount({ index: [oldItem], respond: (request) => {
    if (request.method === 'GET' && request.path === CATALOG_INDEX_PATH) {
      indexAttempt += 1;
      if (indexAttempt > 1) return jsonResponse([currentItem]);
    }
    if (request.method === 'POST' && request.path === '/api/creador/referencias') {
      referenceAttempt += 1;
      return referenceAttempt === 1
        ? jsonResponse({ error: 'STALE_RESOURCE_REFERENCE' }, 409)
        : referenceReceipt(request, currentItem);
    }
    return undefined;
  } });
  await openCatalog(surface, requests);
  const checkbox = await selectCatalogItem(surface, oldItem.id);
  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 1, 'one explicit reference attempt was sent');
  await settle();

  assert.equal(referenceWrites(requests)[0].status, 409);
  assert.equal(referenceWrites(requests)[0].body.url, oldItem.url);
  assert.equal(checkbox.checked, true, 'the selected pair remains available for explicit review');
  assert.equal(indexReads(requests).length, 1, 'a stale URL does not trigger a hidden index refresh');
  assert.equal(requests.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length, 0,
    'a stale reference is not adopted from an unrelated owner read');
  assert.equal(writes(requests).some(({ path }) => path === '/api/creador/enlaces'), false,
    'a stale catalog URL is never silently converted to a new URL');
  assert.equal(surface.dialog.open, true);
  assert.equal(surface.catalogRetry.hidden, false,
    'the page offers a visible, user-controlled recovery action after the stale response');
  assert.match(surface.catalogStatus.textContent, /cambió|revis|actualiz/i);
  assert.doesNotMatch(surface.catalogStatus.textContent, /agregado|guardado correctamente/i,
    'a stale response is not described as a successful reference');

  await surface.catalogRetry.dispatch('click');
  await waitFor(() => indexReads(requests).length === 2, 'only the explicit retry refreshes the public index');
  await waitFor(() => rowFor(surface, oldItem.id)?.querySelector('[data-catalog-select]'),
    'the updated public item is presented for review');
  assert.ok(elementText(rowFor(surface, oldItem.id)).includes(currentItem.url));
  assert.equal(referenceWrites(requests).length, 1, 'refreshing the index does not send a POST');
  const refreshedSelection = rowFor(surface, oldItem.id).querySelector('[data-catalog-select]');
  assert.equal(refreshedSelection.checked, true, 'the selected resource remains available after refresh');
  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 2, 'a second click explicitly submits the refreshed pair');
  assert.equal(referenceWrites(requests)[1].body.url, currentItem.url);
});

test('un PROFILE_CONFLICT requiere comparar y adoptar antes de reintentar el mismo par', async () => {
  const item = catalogItem(9);
  let postCount = 0;
  const { surface, requests } = await mount({ index: [item], respond: (request) => {
    if (request.method === 'POST' && request.path === '/api/creador/referencias') {
      postCount += 1;
      return postCount === 1
        ? jsonResponse({ error: 'PROFILE_CONFLICT' }, 409)
        : referenceReceipt(request, item, false);
    }
    if (request.method === 'GET' && request.path === '/api/creador/perfil') {
      return jsonResponse({
        profile: { ...profile, version: profile.version + 1 },
        links: [], editableResources: [], claims: [], series: [],
      });
    }
    return undefined;
  } });
  await openCatalog(surface, requests);
  const checkbox = await selectCatalogItem(surface, item.id);
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');
  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 1, 'the stale profile receives one reference attempt');
  assert.equal(referenceWrites(requests)[0].status, 409);
  assert.equal(surface.referenceConflict.hidden, false, 'profile conflict exposes the shared compare flow');
  assert.equal(surface.root.dataset.profileVersion, String(profile.version), 'profile version is not adopted before comparison');
  assert.equal(referenceWrites(requests).length, 1, '409 never replays the reference automatically');

  await surface.referenceCompare.dispatch('click');
  await waitFor(() => requests.some(({ method, path }) => method === 'GET' && path === '/api/creador/perfil'),
    'Compare reads the current owner state explicitly');
  await waitFor(() => surface.referenceAdopt.hidden === false, 'the current version becomes an explicit choice');
  assert.equal(surface.root.dataset.profileVersion, String(profile.version), 'comparison alone does not change the submitted version');
  assert.equal(referenceWrites(requests).length, 1, 'comparison does not retry the write');

  await surface.referenceAdopt.dispatch('click');
  await settle();
  assert.equal(surface.root.dataset.profileVersion, String(profile.version + 1), 'the owner version changes only after adoption');
  assert.equal(checkbox.checked, true, 'the selected ID and observed URL survive version adoption');
  assert.equal(surface.catalogDirectory.checked, false, 'the directory correction survives comparison and adoption');
  assert.equal(referenceWrites(requests).length, 1, 'adoption still does not write');

  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 2, 'the person explicitly retries after adopting the observed version');
  assert.deepEqual(referenceWrites(requests)[1].body, {
    resourceId: item.id,
    url: item.url,
    profileVersion: profile.version + 1,
    selectedForDirectory: false,
  });
  assert.equal(referenceWrites(requests)[1].status, 201);
});

test('503, 403 y un recibo incompatible conservan la selección y no cierran con éxito', async (t) => {
  const cases = [
    ['503', jsonResponse({ error: 'UNAVAILABLE' }, 503)],
    ['403', jsonResponse({ error: 'FORBIDDEN' }, 403)],
    ['recibo incompatible', jsonResponse({ link: { id: 'wrong' }, created: true, versionChanges: [] }, 201)],
  ];
  for (const [label, response] of cases) {
    await t.test(label, async () => {
      const item = catalogItem(3);
      const { surface, requests } = await mount({ index: [item], respond: (request) => {
        if (request.method === 'POST' && request.path === '/api/creador/referencias') return response;
        return undefined;
      } });
      await openCatalog(surface, requests);
      const checkbox = await selectCatalogItem(surface, item.id);
      await surface.referenceForm.dispatch('submit');
      await waitFor(() => referenceWrites(requests).length === 1, 'one reference attempt reaches the service');
      await settle();

      assert.equal(referenceWrites(requests).length, 1, 'an error or bad receipt is not replayed');
      assert.equal(checkbox.checked, true, 'the selected catalog item is retained');
      assert.equal(surface.dialog.open, true, 'an unconfirmed reference does not close the dialog');
      assert.match(surface.catalogStatus.textContent, /no pudimos|respuesta|revis|conservar/i);
      assert.doesNotMatch(surface.catalogStatus.textContent, /agregado correctamente|ya está en tu página/i);
      assert.equal(surface.table.querySelectorAll('[data-link-row]').length, 0,
        'an unconfirmed response is not inserted into the owner table');
      assert.equal(requests.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length, 0);
    });
  }
});

test('el fallo del índice tiene reintento explícito y no bloquea alta URL normal', async () => {
  const validIndex = [catalogItem(0)];
  let indexAttempt = 0;
  const { surface, requests } = await mount({ index: validIndex, respond: (request) => {
    if (request.path === CATALOG_INDEX_PATH && request.method === 'GET' && indexAttempt++ === 0) {
      return jsonResponse({ error: 'UNAVAILABLE' }, 503);
    }
    return undefined;
  } });
  await surface.catalogOpen.dispatch('click');
  await waitFor(() => indexReads(requests).length === 1, 'the failed lazy request is recorded');
  await waitFor(() => surface.catalogRetry.hidden === false, 'a failed index load offers an explicit retry');
  assert.match(surface.catalogStatus.textContent, /no pudimos|no disponible|inténtalo/i);
  await surface.catalogRetry.dispatch('click');
  await waitFor(() => rows(surface).length === 1, 'the retry applies the valid public index');
  assert.equal(indexReads(requests).length, 2);

  await surface.addOpen.dispatch('click');
  const field = (name) => surface.addForm.elements.find((element) => element.name === name);
  field('title').value = 'URL sigue operativa';
  field('url').value = 'https://known.example.invalid/after-index-failure';
  field('description').value = '';
  await surface.addForm.dispatch('submit');
  await waitFor(() => writes(requests).some(({ path }) => path === '/api/creador/enlaces'),
    'the normal URL flow remains usable after the failed catalog request');
  assert.equal(writes(requests).filter(({ path }) => path === '/api/creador/enlaces').length, 1);
});

test('un índice malformado no se presenta como catálogo vacío válido y permite reintentar', async () => {
  const validIndex = [catalogItem(1)];
  let indexAttempt = 0;
  const { surface, requests } = await mount({ index: validIndex, respond: (request) => {
    if (request.path !== CATALOG_INDEX_PATH) return undefined;
    indexAttempt += 1;
    if (indexAttempt === 1) return jsonResponse([{ id: 4, title: 'malformado', url: 'https://bad.example.invalid', tipo: 'private' }]);
    return undefined;
  } });
  await surface.catalogOpen.dispatch('click');
  await waitFor(() => indexReads(requests).length === 1, 'the malformed response was received');
  await waitFor(() => surface.catalogRetry.hidden === false, 'the malformed public index produces recovery controls');
  assert.equal(rows(surface).length, 0, 'malformed identifiers or unsupported types are not rendered');
  assert.doesNotMatch(surface.catalogStatus.textContent, /sin resultados|no hay resultados/i,
    'a contract error stays distinct from a successful zero-result query');
  await surface.catalogRetry.dispatch('click');
  await waitFor(() => rows(surface).length === 1, 'an explicit retry recovers the public index');
  assert.equal(indexReads(requests).length, 2);
});

test('una respuesta 401 de referencia comprueba la misma sesión sin repetir la escritura', async () => {
  const item = catalogItem(6);
  const { surface, requests } = await mount({ index: [item], respond: (request) => {
    if (request.method === 'POST' && request.path === '/api/creador/referencias') {
      return jsonResponse({ error: 'UNAUTHENTICATED' }, 401);
    }
    return undefined;
  } });
  await openCatalog(surface, requests);
  const checkbox = await selectCatalogItem(surface, item.id);
  await surface.referenceForm.dispatch('submit');
  await waitFor(() => referenceWrites(requests).length === 1, 'one reference write receives 401');
  await waitFor(() => surface.dialog.querySelector('[data-session-recovery-shell]')?.hidden === false,
    'the shared session recovery is shown inside the active catalog dialog');
  assert.equal(referenceWrites(requests).length, 1);
  assert.equal(referenceWrites(requests)[0].headers.get('x-csrf-token'), 'csrf-a');

  const check = surface.dialog.querySelector('[data-session-recovery-check]');
  await check.dispatch('click');
  await waitFor(() => requests.some(({ path, method }) => path === '/api/creador/sesion' && method === 'GET'),
    'the owner checks the current session explicitly');
  await settle();
  const sessionCheck = requests.find(({ path, method }) => path === '/api/creador/sesion' && method === 'GET');
  assert.equal(sessionCheck.headers.get('x-creator-page-binding'), 'a'.repeat(64),
    'recovery is bound to the same owner identity and role');
  assert.equal(referenceWrites(requests).length, 1, 'session recovery never silently replays the failed reference');
  assert.equal(checkbox.checked, true, 'the selection remains available for an explicit user retry');
});

test('la guardia común protege la referencia y ofrece guardar, descartar o seguir editando', async () => {
  const item = catalogItem(8);
  const { surface, requests } = await mount({ index: [item] });
  await openCatalog(surface, requests);
  const checkbox = await selectCatalogItem(surface, item.id);
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');
  await surface.catalogCancel.dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false, 'leaving a dirty reference opens the shared write guard');

  await surface.exitContinue.dispatch('click');
  assert.equal(surface.dialog.open, true);
  assert.equal(checkbox.checked, true);
  assert.equal(surface.catalogDirectory.checked, false);
  assert.equal(writes(requests).length, 0, 'continue keeps editing without a write');

  await surface.catalogCancel.dispatch('click');
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.dialog.open, false, 'discard closes the reference editor');
  assert.equal(writes(requests).length, 0, 'discard does not reference the resource');

  await surface.catalogOpen.dispatch('click');
  await waitFor(() => surface.dialog.open, 'catalog can be reopened after discard');
  const reopenedCheckbox = rowFor(surface, item.id)?.querySelector('[data-catalog-select]');
  assert.ok(reopenedCheckbox, 'the cached index is still available');
  reopenedCheckbox.checked = true;
  await reopenedCheckbox.dispatch('change');
  surface.catalogDirectory.checked = false;
  await surface.catalogDirectory.dispatch('change');
  await surface.catalogCancel.dispatch('click');
  await surface.exitSave.dispatch('click');
  await waitFor(() => referenceWrites(requests).length === 1, 'Save sends the active reference intent once');
  assert.equal(referenceWrites(requests)[0].body.selectedForDirectory, false);
});


import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createOwnerLinksSurface,
  createLinksApi,
  jsonResponse,
  mountOwnerLinks,
  sharedLink,
  settle,
  writes,
} from './fixtures/creator-owner-links-browser.mjs';
import { mountOwnerSeriesController } from './fixtures/creator-owner-series-browser.mjs';

const INDEX_STATE_KEY = 'creatorOwnerHistoryIndex';

function waitFor(predicate, message) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const check = () => {
      if (predicate()) resolve();
      else if (++attempt >= 50) reject(new Error(message));
      else setImmediate(check);
    };
    check();
  });
}

function addControl(surface, name) {
  return surface.addFields.find(({ name: candidate }) => candidate === name);
}

function editControl(surface, name) {
  return surface.linkFields.find(({ name: candidate }) => candidate === name);
}

function placeAddFormInOwnerDialog(surface) {
  surface.addForm.remove();
  surface.dialog.append(surface.addForm);
}

function installIndexedHistory(surface) {
  const { window } = surface;
  let entries = [{ href: window.location.href, state: { [INDEX_STATE_KEY]: 0 } }];
  let index = 0;
  const currentUrl = (value) => new URL(String(value), window.location.href).href;
  const dispatchAt = (nextIndex) => {
    index = nextIndex;
    window.location.href = entries[index].href;
    window.dispatchEvent({ type: 'popstate', state: entries[index].state });
  };
  const go = (delta) => {
    const next = Math.max(0, Math.min(entries.length - 1, index + delta));
    if (next !== index) dispatchAt(next);
  };
  const history = {
    get state() { return entries[index].state; },
    get entries() { return entries; },
    get index() { return index; },
    pushState(state, _title, href) {
      entries = entries.slice(0, index + 1);
      entries.push({ href: currentUrl(href), state: structuredClone(state) });
      index = entries.length - 1;
      window.location.href = entries[index].href;
    },
    replaceState(state, _title, href) {
      entries[index] = { href: currentUrl(href), state: structuredClone(state) };
      window.location.href = entries[index].href;
    },
    go,
    back() { go(-1); },
    forward() { go(1); },
  };
  window.history = history;
  return history;
}

test('el alta confirmada pasa las correcciones tardías al editor autorizado y valida cada recibo', async () => {
  let releaseCreate;
  let markCreateStarted;
  const createStarted = new Promise((resolve) => { markCreateStarted = resolve; });
  const createGate = new Promise((resolve) => { releaseCreate = resolve; });
  let releasePatch;
  let markSecondPatchStarted;
  const secondPatchStarted = new Promise((resolve) => { markSecondPatchStarted = resolve; });
  const secondPatchGate = new Promise((resolve) => { releasePatch = resolve; });
  let patchCount = 0;
  const surface = createOwnerLinksSurface({ links: [] });
  placeAddFormInOwnerDialog(surface);
  const api = createLinksApi({ surface, override: async (request) => {
    if (request.method !== 'PATCH' || !request.path.endsWith('/editar')) return undefined;
    patchCount += 1;
    if (patchCount === 1) return jsonResponse({ error: 'TEMPORARILY_UNAVAILABLE' }, 503);
    if (patchCount === 2) {
      markSecondPatchStarted();
      await secondPatchGate;
    }
    return undefined;
  } });
  let createCount = 0;
  const requests = await mountOwnerLinks({ surface, fetch: async (request) => {
    const response = await api.fetch(request);
    if (request.method === 'POST' && request.path === '/api/creador/enlaces' && ++createCount === 1) {
      markCreateStarted();
      await createGate;
    }
    return response;
  } });

  await surface.addOpen.dispatch('click');
  addControl(surface, 'title').value = 'Título enviado';
  addControl(surface, 'url').value = 'https://example.invalid/late-add';
  addControl(surface, 'description').value = 'Descripción enviada';
  addControl(surface, 'selectedForDirectory').checked = true;
  const create = surface.addForm.dispatch('submit');
  await createStarted;

  addControl(surface, 'title').value = 'Corrección de título';
  addControl(surface, 'url').value = 'https://example.invalid/late-add-corrected';
  addControl(surface, 'description').value = 'Corrección de descripción';
  addControl(surface, 'selectedForDirectory').checked = false;
  releaseCreate();
  await create;
  await settle();

  assert.equal(surface.addForm.hidden, true,
    'a confirmed new resource hands a pending correction to the existing link editor');
  assert.equal(surface.linkEditForm.hidden, false);
  assert.deepEqual({
    title: editControl(surface, 'title').value,
    url: editControl(surface, 'url').value,
    description: editControl(surface, 'description').value,
    selectedForDirectory: editControl(surface, 'selectedForDirectory').checked,
  }, {
    title: 'Corrección de título',
    url: 'https://example.invalid/late-add-corrected',
    description: 'Corrección de descripción',
    selectedForDirectory: false,
  });
  assert.equal(writes(requests).filter(({ method, path }) => method === 'POST' && path === '/api/creador/enlaces').length, 1,
    'the handoff does not automatically repeat the creation');

  await surface.linkEditForm.dispatch('submit');
  await settle();
  assert.equal(surface.dialog.open, true, 'a failed edit receipt leaves the correction open');
  assert.equal(editControl(surface, 'title').value, 'Corrección de título');
  assert.equal(editControl(surface, 'url').value, 'https://example.invalid/late-add-corrected');
  assert.equal(editControl(surface, 'description').value, 'Corrección de descripción');
  assert.equal(editControl(surface, 'selectedForDirectory').checked, false);
  assert.equal(writes(requests).filter(({ method, path }) => method === 'POST' && path === '/api/creador/enlaces').length, 1);

  const firstPatch = surface.linkEditForm.dispatch('submit');
  await secondPatchStarted;
  editControl(surface, 'title').value = 'Corrección adicional de título';
  editControl(surface, 'url').value = 'https://example.invalid/late-add-final';
  editControl(surface, 'description').value = 'Corrección adicional de descripción';
  editControl(surface, 'selectedForDirectory').checked = true;
  releasePatch();
  await firstPatch;
  await settle();
  assert.equal(surface.dialog.open, true, 'new edits made during PATCH remain pending in the same editor');
  assert.equal(editControl(surface, 'title').value, 'Corrección adicional de título');
  assert.equal(editControl(surface, 'url').value, 'https://example.invalid/late-add-final');
  assert.equal(editControl(surface, 'description').value, 'Corrección adicional de descripción');
  assert.equal(editControl(surface, 'selectedForDirectory').checked, true);
  assert.equal(writes(requests).filter(({ method, path }) => method === 'PATCH' && path.endsWith('/editar')).length, 2,
    'no automatic follow-up write saves the later correction');

  await surface.linkEditForm.dispatch('submit');
  await settle();
  const saved = api.snapshot().links[0];
  assert.equal(saved.title, 'Corrección adicional de título');
  assert.equal(saved.url, 'https://example.invalid/late-add-final');
  assert.equal(saved.description, 'Corrección adicional de descripción');
  assert.equal(saved.selectedForDirectory, true);
  assert.equal(surface.dialog.open, false, 'the clean confirmed edit closes after the transferred draft is saved');
  assert.equal(addControl(surface, 'title').value, '', 'the hidden add form has no stale draft after handoff');
  assert.deepEqual(writes(requests).map(({ method }) => method), ['POST', 'PATCH', 'PATCH', 'PATCH']);
});

test('un reintento duplicate tras perder el acuse conserva las correcciones del primer envío', async () => {
  let releaseCreate;
  let markCreateStarted;
  const createStarted = new Promise((resolve) => { markCreateStarted = resolve; });
  const createGate = new Promise((resolve) => { releaseCreate = resolve; });
  const surface = createOwnerLinksSurface({ links: [] });
  placeAddFormInOwnerDialog(surface);
  const api = createLinksApi({ surface });
  let posts = 0;
  const requests = await mountOwnerLinks({ surface, fetch: async (request) => {
    const response = await api.fetch(request);
    if (request.method === 'POST' && request.path === '/api/creador/enlaces' && ++posts === 1) {
      markCreateStarted();
      await createGate;
      throw new TypeError('simulated lost acknowledgement after commit');
    }
    return response;
  } });

  await surface.addOpen.dispatch('click');
  addControl(surface, 'title').value = 'Título enviado';
  addControl(surface, 'url').value = 'https://example.invalid/lost-ack';
  addControl(surface, 'description').value = 'Descripción enviada';
  const first = surface.addForm.dispatch('submit');
  await createStarted;
  addControl(surface, 'title').value = 'Título corregido tras el timeout';
  addControl(surface, 'description').value = 'Descripción corregida tras el timeout';
  addControl(surface, 'selectedForDirectory').checked = false;
  releaseCreate();
  await first;
  await settle();

  assert.equal(api.snapshot().links[0].title, 'Título enviado', 'the first write may have committed its sent snapshot');
  assert.equal(surface.dialog.open, true);
  assert.equal(surface.addForm.hidden, false);
  assert.equal(addControl(surface, 'title').value, 'Título corregido tras el timeout');
  assert.equal(addControl(surface, 'selectedForDirectory').checked, false);

  await surface.addForm.dispatch('submit');
  await settle();
  assert.equal(surface.addForm.hidden, true,
    'the duplicate receipt compares against the first uncertain snapshot and hands off the correction');
  assert.equal(surface.linkEditForm.hidden, false);
  assert.equal(editControl(surface, 'title').value, 'Título corregido tras el timeout');
  assert.equal(editControl(surface, 'description').value, 'Descripción corregida tras el timeout');
  assert.equal(editControl(surface, 'selectedForDirectory').checked, false);
  assert.deepEqual(writes(requests).map(({ method }) => method), ['POST', 'POST'],
    'confirming the existing URL does not automatically PATCH or create again');

  await surface.linkEditForm.dispatch('submit');
  await settle();
  const saved = api.snapshot().links[0];
  assert.equal(saved.title, 'Título corregido tras el timeout');
  assert.equal(saved.description, 'Descripción corregida tras el timeout');
  assert.equal(saved.selectedForDirectory, false);
  assert.equal(surface.dialog.open, false);
  assert.deepEqual(writes(requests).map(({ method }) => method), ['POST', 'POST', 'PATCH']);
});

test('si cambia la URL tras un acuse perdido, comprueba la URL original antes de corregir esa ficha', async () => {
  let releaseCreate;
  let markCreateStarted;
  const createStarted = new Promise((resolve) => { markCreateStarted = resolve; });
  const createGate = new Promise((resolve) => { releaseCreate = resolve; });
  const surface = createOwnerLinksSurface({ links: [] });
  placeAddFormInOwnerDialog(surface);
  let ownerReads = 0;
  let releaseOwnerRead;
  let markOwnerReadStarted;
  const ownerReadStarted = new Promise((resolve) => { markOwnerReadStarted = resolve; });
  const ownerReadGate = new Promise((resolve) => { releaseOwnerRead = resolve; });
  const api = createLinksApi({ surface, override: (request) => {
    if (request.method === 'GET' && request.path === '/api/creador/perfil') {
      ownerReads += 1;
      if (ownerReads === 1) return jsonResponse({ error: 'TEMPORARILY_UNAVAILABLE' }, 503);
      if (ownerReads === 2) {
        markOwnerReadStarted();
        return ownerReadGate;
      }
    }
    return undefined;
  } });
  let posts = 0;
  const requests = await mountOwnerLinks({ surface, fetch: async (request) => {
    const response = await api.fetch(request);
    if (request.method === 'POST' && request.path === '/api/creador/enlaces' && ++posts === 1) {
      markCreateStarted();
      await createGate;
      throw new TypeError('simulated lost acknowledgement after commit');
    }
    return response;
  } });

  await surface.addOpen.dispatch('click');
  addControl(surface, 'title').value = 'Título enviado';
  addControl(surface, 'url').value = 'https://example.invalid/original-url';
  addControl(surface, 'description').value = 'Descripción enviada';
  const first = surface.addForm.dispatch('submit');
  await createStarted;
  addControl(surface, 'title').value = 'Título corregido';
  addControl(surface, 'url').value = 'https://example.invalid/corrected-url';
  addControl(surface, 'description').value = 'Descripción corregida';
  addControl(surface, 'selectedForDirectory').checked = false;
  releaseCreate();
  await first;
  await settle();

  await surface.addForm.dispatch('submit');
  await settle();
  assert.equal(surface.addForm.hidden, false, 'a failed read of the original URL keeps the corrected draft open');
  assert.equal(addControl(surface, 'url').value, 'https://example.invalid/corrected-url');
  assert.equal(requests.filter(({ method, path }) => method === 'POST' && path === '/api/creador/enlaces').length, 1,
    'the corrected URL is not sent while the first destination remains uncertain');
  assert.equal(requests.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length, 1);

  const retry = surface.addForm.dispatch('submit');
  await ownerReadStarted;
  addControl(surface, 'title').value = 'Título corregido durante GET';
  addControl(surface, 'url').value = 'https://example.invalid/corrected-during-get';
  addControl(surface, 'description').value = 'Descripción corregida durante GET';
  addControl(surface, 'selectedForDirectory').checked = true;
  releaseOwnerRead();
  await retry;
  await settle();
  assert.equal(surface.addForm.hidden, true,
    'the retry reconciles the original destination instead of creating the corrected URL as a second link');
  assert.equal(surface.linkEditForm.hidden, false);
  assert.equal(editControl(surface, 'title').value, 'Título corregido durante GET');
  assert.equal(editControl(surface, 'url').value, 'https://example.invalid/corrected-during-get');
  assert.equal(editControl(surface, 'description').value, 'Descripción corregida durante GET');
  assert.equal(editControl(surface, 'selectedForDirectory').checked, true);
  assert.deepEqual(writes(requests).map(({ method }) => method), ['POST'],
    'the manual retry uses a read and hands off; it does not issue a second POST');
  assert.equal(requests.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length, 2,
    'the earlier URL is checked against the owner state before changing the destination');

  await surface.linkEditForm.dispatch('submit');
  await settle();
  assert.equal(api.snapshot().links.length, 1);
  assert.equal(api.snapshot().links[0].title, 'Título corregido durante GET');
  assert.equal(api.snapshot().links[0].url, 'https://example.invalid/corrected-during-get');
  assert.equal(api.snapshot().links[0].description, 'Descripción corregida durante GET');
  assert.equal(api.snapshot().links[0].selectedForDirectory, true);
  assert.deepEqual(writes(requests).map(({ method }) => method), ['POST', 'PATCH']);
});

test('una URL distinta sólo se agrega si la comprobación no encuentra el destino del intento incierto', async () => {
  const surface = createOwnerLinksSurface({ links: [] });
  placeAddFormInOwnerDialog(surface);
  let failedPosts = 0;
  let releaseRead;
  let markReadStarted;
  const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
  const readGate = new Promise((resolve) => { releaseRead = resolve; });
  let ownerReads = 0;
  const api = createLinksApi({ surface, override: (request) => {
    if (request.method === 'POST' && request.path === '/api/creador/enlaces' && ++failedPosts === 1) {
      return jsonResponse({ error: 'TEMPORARILY_UNAVAILABLE' }, 503);
    }
    if (request.method === 'GET' && request.path === '/api/creador/perfil' && ++ownerReads === 1) {
      markReadStarted();
      return readGate;
    }
    return undefined;
  } });
  const requests = await mountOwnerLinks({ surface, fetch: api.fetch });

  await surface.addOpen.dispatch('click');
  addControl(surface, 'title').value = 'Título del destino anterior';
  addControl(surface, 'url').value = 'https://example.invalid/not-committed';
  addControl(surface, 'description').value = 'Descripción anterior';
  await surface.addForm.dispatch('submit');
  await settle();
  assert.equal(api.snapshot().links.length, 0, 'the first uncertain request did not commit');

  addControl(surface, 'title').value = 'Título corregido';
  addControl(surface, 'url').value = 'https://example.invalid/new-destination';
  addControl(surface, 'description').value = 'Descripción corregida';
  addControl(surface, 'selectedForDirectory').checked = false;
  const retry = surface.addForm.dispatch('submit');
  await readStarted;
  addControl(surface, 'title').value = 'Título corregido durante GET';
  addControl(surface, 'url').value = 'https://example.invalid/final-destination';
  addControl(surface, 'description').value = 'Descripción corregida durante GET';
  addControl(surface, 'selectedForDirectory').checked = true;
  releaseRead();
  await retry;
  await settle();

  const operations = requests.filter(({ method }) => method !== 'GET');
  const methodsAndUrls = requests.map(({ method, path, body }) => ({ method, path, url: body?.url }));
  assert.deepEqual(methodsAndUrls.map(({ method }) => method), ['POST', 'GET']);
  assert.equal(methodsAndUrls[0].url, 'https://example.invalid/not-committed',
    'the original destination receives the first manual attempt');
  assert.equal(methodsAndUrls[1].path, '/api/creador/perfil',
    'the controller checks the original destination before sending a distinct URL');
  assert.equal(operations.length, 1,
    'edits made during the absent-state check are not submitted as the earlier retry snapshot');
  assert.equal(api.snapshot().links.length, 0);
  assert.equal(surface.dialog.open, true);
  assert.equal(addControl(surface, 'title').value, 'Título corregido durante GET');
  assert.equal(addControl(surface, 'url').value, 'https://example.invalid/final-destination');

  await surface.addForm.dispatch('submit');
  await settle();
  assert.equal(api.snapshot().links.length, 1);
  assert.equal(api.snapshot().links[0].url, 'https://example.invalid/final-destination');
  assert.equal(api.snapshot().links[0].title, 'Título corregido durante GET');
  assert.equal(api.snapshot().links[0].description, 'Descripción corregida durante GET');
  assert.equal(api.snapshot().links[0].selectedForDirectory, true);
  assert.deepEqual(writes(requests).map(({ method }) => method), ['POST', 'POST']);
  assert.equal(surface.dialog.open, false, 'the confirmed new destination closes its clean editor');
});

test('corrección tardía al agregar una ficha compartida sólo pasa por el editor de opciones permitido', async () => {
  let releaseCreate;
  let markCreateStarted;
  const createStarted = new Promise((resolve) => { markCreateStarted = resolve; });
  const createGate = new Promise((resolve) => { releaseCreate = resolve; });
  let releaseOwnerRead;
  let markOwnerReadStarted;
  const ownerReadStarted = new Promise((resolve) => { markOwnerReadStarted = resolve; });
  const ownerReadGate = new Promise((resolve) => { releaseOwnerRead = resolve; });
  let ownerReads = 0;
  const shared = sharedLink({ position: 0 });
  const surface = createOwnerLinksSurface({ links: [shared] });
  placeAddFormInOwnerDialog(surface);
  const api = createLinksApi({ surface, override: (request) => {
    if (request.method === 'GET' && request.path === '/api/creador/perfil' && ++ownerReads === 1) {
      markOwnerReadStarted();
      return ownerReadGate;
    }
    return undefined;
  } });
  let createCount = 0;
  const requests = await mountOwnerLinks({ surface, fetch: async (request) => {
    const response = await api.fetch(request);
    if (request.method === 'POST' && request.path === '/api/creador/enlaces' && ++createCount === 1) {
      markCreateStarted();
      await createGate;
      throw new TypeError('simulated lost acknowledgement for a shared duplicate');
    }
    return response;
  } });

  await surface.addOpen.dispatch('click');
  addControl(surface, 'title').value = 'No reemplazar título compartido';
  addControl(surface, 'url').value = shared.url;
  addControl(surface, 'description').value = 'No reemplazar descripción compartida';
  const create = surface.addForm.dispatch('submit');
  await createStarted;
  addControl(surface, 'selectedForDirectory').checked = false;
  releaseCreate();
  await create;
  await settle();

  assert.equal(surface.addForm.hidden, false,
    'the uncertain shared attempt keeps the local option correction available');
  addControl(surface, 'title').value = 'No reemplazar título compartido B';
  addControl(surface, 'url').value = 'https://example.invalid/shared-correction-b';
  addControl(surface, 'description').value = 'No reemplazar descripción compartida B';
  const retry = surface.addForm.dispatch('submit');
  await ownerReadStarted;
  addControl(surface, 'title').value = 'No reemplazar título compartido C';
  addControl(surface, 'url').value = 'https://example.invalid/shared-correction-c';
  addControl(surface, 'description').value = 'No reemplazar descripción compartida C';
  addControl(surface, 'selectedForDirectory').checked = true;
  releaseOwnerRead();
  await retry;
  await settle();

  assert.equal(surface.linkEditForm.hidden, false,
    'the confirmed duplicate is handed to its existing options editor');
  assert.equal(surface.metadataPanel.hidden, true);
  assert.equal(surface.optionsPanel.hidden, false);
  assert.equal(editControl(surface, 'title').value, shared.title);
  assert.equal(editControl(surface, 'url').value, shared.url);
  assert.equal(editControl(surface, 'description').value, shared.description);
  assert.equal(editControl(surface, 'selectedForDirectory').checked, true,
    'the latest option correction is adopted after the delayed read');
  assert.match(surface.linkStatus.textContent, /compartida|datos originales/i,
    'the owner is told that shared metadata remains unchanged');
  assert.deepEqual(writes(requests).map(({ method }) => method), ['POST'],
    'adopting the shared placement neither replays creation nor writes metadata');

  await surface.linkEditForm.dispatch('submit');
  await settle();
  const patch = writes(requests).find(({ method, path }) => method === 'PATCH' && path.endsWith('/editar'));
  assert.ok(patch);
  assert.deepEqual(Object.keys(patch.body).sort(), [
    'featured', 'placementVersion', 'profileVersion', 'resourceVersion', 'selectedForDirectory',
  ]);
  assert.equal(patch.body.selectedForDirectory, true);
  const saved = api.snapshot().links[0];
  assert.equal(saved.title, shared.title);
  assert.equal(saved.url, shared.url);
  assert.equal(saved.description, shared.description);
  assert.equal(saved.selectedForDirectory, true);
  assert.equal(writes(requests).filter(({ method }) => method === 'POST').length, 1,
    'the confirmed duplicate is not replayed while editing shared options');
});

test('Back y Forward pasan por Guardar, Descartar o Seguir y conservan el contexto de la serie', async () => {
  const series = { id: 'series-a', name: 'Ruta A', slug: 'ruta-a', description: 'Descripción inicial', version: 3 };
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: { id: 'creator-series-1', displayName: 'Ana Series', slug: 'ana-series', version: 14, published: true, hidden: false, city: '', country: '', bio: '', programs: [], socials: {} },
    series: [series],
  });
  installIndexedHistory(surface);

  await surface.seriesRows[0].querySelector('[data-series-chapters]').dispatch('click');
  const chapterLocation = surface.window.location.href;
  await surface.chapterRegion.querySelector('[data-series-edit]').dispatch('click');
  surface.seriesFormFields.name.value = 'Ruta A corregida';
  await surface.seriesFormFields.name.dispatch('input');

  surface.window.history.back();
  assert.equal(surface.exitPrompt.hidden, false,
    'Back asks how to handle the active series correction');
  assert.equal(surface.window.history.index, 1);
  assert.equal(surface.window.history.entries.length, 2,
    'intercepting Back preserves both existing history entries');
  assert.equal(surface.window.location.href, chapterLocation,
    'the browser URL is restored while the decision is pending');
  assert.equal(surface.chapterRegion.hidden, false);
  assert.equal(surface.seriesListView.hidden, true);
  assert.equal(surface.dialog.open, true);
  assert.equal(surface.seriesFormFields.name.value, 'Ruta A corregida');

  await surface.exitContinue.dispatch('click');
  assert.equal(surface.dialog.open, true);
  assert.equal(surface.exitPrompt.hidden, true);
  assert.equal(surface.window.location.href, chapterLocation,
    'Continue keeps the current history entry and editor context');
  assert.equal(surface.window.history.index, 1);
  assert.equal(surface.document.activeElement, surface.seriesFormFields.name);

  surface.window.history.back();
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitSave.dispatch('click');
  await waitFor(() => surface.seriesListView.hidden === false && surface.dialog.open === false,
    'Save commits the current series and completes the pending Back');
  const save = writes(requests).find(({ method, path }) => method === 'PATCH' && path === '/api/creador/series/series-a');
  assert.ok(save, 'the correction is saved to the same series ID that was edited');
  assert.equal(api.state.series.find(({ id }) => id === 'series-a').name, 'Ruta A corregida');
  assert.equal(surface.document.activeElement, surface.seriesSearch,
    'after Back, focus moves into the restored series list');
  assert.equal(surface.window.history.index, 0);
  assert.equal(surface.window.history.entries.length, 2,
    'saving traverses the original Back entry without pushing or replacing history');
  assert.equal(new URL(surface.window.location.href).searchParams.has('serie'), false);

  surface.window.history.forward();
  assert.equal(surface.chapterRegion.hidden, false, 'Forward restores the chapter view from its own history entry');
  await surface.chapterBack.dispatch('click');
  const listLocation = surface.window.location.href;
  assert.equal(surface.window.history.entries.length, 3);
  surface.window.history.back();
  assert.equal(surface.window.history.index, 1);
  const returnToChapterLocation = surface.window.location.href;
  assert.equal(surface.chapterRegion.hidden, false);
  await surface.chapterRegion.querySelector('[data-series-edit]').dispatch('click');
  surface.seriesFormFields.description.value = 'Descartar esta descripción';
  await surface.seriesFormFields.description.dispatch('input');
  surface.window.history.forward();

  assert.equal(surface.exitPrompt.hidden, false,
    'Forward also asks before leaving a dirty series editor');
  assert.equal(surface.window.location.href, returnToChapterLocation,
    'the current chapter history entry is restored while the Forward decision is pending');
  assert.equal(surface.window.history.index, 1);
  assert.equal(surface.window.history.entries.length, 3);
  assert.equal(surface.chapterRegion.hidden, false);
  assert.equal(surface.seriesFormFields.description.value, 'Descartar esta descripción');
  const writesBeforeDiscard = writes(requests).length;
  await surface.exitDiscard.dispatch('click');
  await waitFor(() => surface.seriesListView.hidden === false && surface.dialog.open === false,
    'Discard completes the pending Forward without saving the correction');
  assert.equal(writes(requests).length, writesBeforeDiscard,
    'discarding the forward navigation does not write');
  assert.equal(surface.document.activeElement, surface.seriesSearch,
    'after Forward, focus moves into the restored series list');
  assert.equal(surface.window.location.href, new URL(listLocation).href);
  assert.equal(surface.window.history.index, 2);
  assert.equal(surface.window.history.entries.length, 3,
    'discard traverses the original Forward entry without changing stack length');
  assert.equal(api.state.series.find(({ id }) => id === 'series-a').description, 'Descripción inicial');
});

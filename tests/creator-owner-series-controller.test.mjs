import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  jsonResponse,
  mountOwnerSeriesController,
  settle,
  writes,
} from './fixtures/creator-owner-series-browser.mjs';
import { SurfaceElement } from './fixtures/creator-owner-browser-dom.mjs';

const profile = (overrides = {}) => ({
  id: 'creator-series-1', displayName: 'Ana Series', slug: 'ana-series', version: 14,
  published: true, hidden: false, city: '', country: '', bio: '', programs: [], socials: {},
  ...overrides,
});

const series = (id, overrides = {}) => ({
  id, name: `Ruta ${id}`, slug: `ruta-${id}`, description: `Descripción ${id}`, version: 3, ...overrides,
});

function chapter(index, seriesId, overrides = {}) {
  const resourceId = `series-resource-${index}`;
  return {
    placementId: `placement-${String(index).padStart(3, '0')}`,
    resourceId,
    title: `Capítulo ${String(index + 1).padStart(2, '0')}`,
    url: `https://chapters.example/${index}`,
    description: `Descripción ${index}`,
    featured: index % 2 === 0,
    position: index * 10,
    selectedForDirectory: index % 3 === 0,
    hidden: false,
    directoryApproval: 'approved',
    resourceVersion: index + 2,
    placementVersion: index + 5,
    series: seriesId ? [{ seriesId, position: index * 10 }] : [],
    ...overrides,
  };
}

function seriesRow(surface, seriesId) {
  return surface.seriesList.querySelectorAll('[data-owner-series-row]')
    .find((row) => row.dataset.ownerSeriesRow === seriesId);
}

function chapterRow(surface, placementId) {
  return surface.chapterRegion.querySelectorAll('[data-chapter-row]')
    .find((row) => row.dataset.chapterRow === placementId);
}

function elementText(element) {
  return [element.textContent, ...element.descendants().map(({ textContent }) => textContent)]
    .filter(Boolean).join(' ');
}

async function openEdit(surface, seriesId) {
  const row = seriesRow(surface, seriesId);
  assert.ok(row, `series ${seriesId} appears in the owner list`);
  await row.querySelector('[data-series-edit]').dispatch('click');
  assert.equal(surface.dialog.open, true, 'series metadata opens the existing owner dialog');
  assert.equal(surface.seriesForm.hidden, false, 'one contextual series form is active');
}

async function openChapterMove(surface, placementId) {
  const row = chapterRow(surface, placementId);
  assert.ok(row, `chapter ${placementId} appears in the selected series results`);
  await row.querySelector('[data-chapter-move]').dispatch('click');
  assert.equal(surface.dialog.open, true, 'chapter movement reuses the owner dialog');
  assert.equal(surface.moveForm.hidden, false, 'the active form edits only the selected chapter position');
}

async function submit(form) {
  await form.dispatch('submit');
  await settle();
}

test('crear y editar usan una sola intención contextual; la corrección tardía no se mezcla con el recibo', async () => {
  let release;
  let markStarted;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { markStarted = resolve; });
  const old = series('existing');
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: profile(), series: [old],
    override: async (request) => {
      if (request.method === 'PATCH' && request.path === `/api/creador/series/${old.id}`) {
        markStarted();
        await gate;
      }
      return undefined;
    },
  });

  await surface.seriesCreateOpen.dispatch('click');
  assert.equal(surface.seriesForm.hidden, false);
  surface.seriesFormFields.name.value = 'Nueva ruta';
  surface.seriesFormFields.slug.value = 'nueva-ruta';
  surface.seriesFormFields.description.value = 'Descripción enviada';
  await surface.seriesFormFields.name.dispatch('input');
  await surface.seriesFormFields.slug.dispatch('input');
  await submit(surface.seriesForm);
  assert.equal(writes(requests).length, 1);
  const createRequest = writes(requests)[0];
  assert.equal(createRequest.path, '/api/creador/series');
  assert.equal(createRequest.method, 'POST');
  assert.deepEqual(createRequest.body, {
    name: 'Nueva ruta', slug: 'nueva-ruta', description: 'Descripción enviada', profileVersion: 14,
  });
  assert.equal(api.state.profile.version, 15);
  assert.ok(api.state.series.some(({ slug }) => slug === 'nueva-ruta'));

  await openEdit(surface, old.id);
  surface.seriesFormFields.description.value = 'Descripción capturada';
  await surface.seriesFormFields.description.dispatch('input');
  const pending = surface.seriesForm.dispatch('submit');
  await started;
  surface.seriesFormFields.description.value = 'Corrección posterior';
  await surface.seriesFormFields.description.dispatch('input');
  release();
  await pending;
  const patchRequest = writes(requests)[1];
  assert.equal(patchRequest.path, `/api/creador/series/${old.id}`);
  assert.equal(patchRequest.method, 'PATCH');
  assert.equal(patchRequest.body.version, old.version);
  assert.equal(patchRequest.body.profileVersion, 15);
  assert.equal(patchRequest.body.description, 'Descripción capturada');
  assert.equal(surface.seriesFormFields.description.value, 'Corrección posterior');
  assert.equal(surface.seriesForm.hidden, false, 'late metadata stays open for a separate save');
  assert.equal(api.state.profile.version, 16);
  assert.equal(writes(requests).length, 2, 'one create and one metadata save are sent');
});

test('la guardia de series ofrece Seguir editando, Descartar y Guardar al cambiar de unidad', async () => {
  const first = series('first');
  const second = series('second');
  const { surface, requests } = await mountOwnerSeriesController({ profile: profile(), series: [first, second] });
  await openEdit(surface, first.id);
  surface.seriesFormFields.description.value = 'Borrador A';
  await surface.seriesFormFields.description.dispatch('input');

  await seriesRow(surface, second.id).querySelector('[data-series-edit]').dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitContinue.dispatch('click');
  assert.equal(surface.seriesForm.hidden, false);
  assert.equal(surface.seriesFormFields.description.value, 'Borrador A');
  assert.equal(writes(requests).length, 0);

  await seriesRow(surface, second.id).querySelector('[data-series-edit]').dispatch('click');
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.seriesForm.hidden, false);
  assert.equal(surface.seriesFormFields.name.value, second.name);
  assert.equal(surface.seriesFormFields.description.value, second.description);
  assert.equal(writes(requests).length, 0, 'discarding a series draft sends no write');

  surface.seriesFormFields.description.value = 'Borrador B';
  await surface.seriesFormFields.description.dispatch('input');
  await surface.seriesRows.find((row) => row.dataset.seriesId === second.id)
    .querySelector('[data-series-chapters]').dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitSave.dispatch('click');
  await settle();
  assert.equal(writes(requests).length, 1, 'Save uses the active series form once before leaving it');
  assert.equal(requests[0].path, `/api/creador/series/${second.id}`);
  assert.equal(requests[0].body.description, 'Borrador B');
  assert.equal(surface.dialog.open, false, 'the next series unit is not opened over the confirmed save');
});

test('PUT y DELETE de capítulo reconcilian el DTO completo y preservan otras pertenencias', async () => {
  const main = series('main');
  const other = series('other');
  const already = chapter(0, main.id, { series: [{ seriesId: main.id, position: 0 }, { seriesId: other.id, position: 90 }] });
  const available = chapter(1, undefined, { series: [{ seriesId: other.id, position: 0 }] });
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: profile(), links: [already, available], series: [main, other], query: { serie: main.id },
  });

  const add = chapterRow(surface, available.placementId)?.querySelector('[data-chapter-add]');
  assert.ok(add, 'an available link has an explicit add action');
  await add.dispatch('click');
  await settle();
  const addRequest = requests[0];
  assert.ok(addRequest, 'the contextual Add action is connected to the owner controller');
  assert.equal(addRequest.method, 'PUT');
  assert.equal(addRequest.path, `/api/creador/series/${main.id}/capitulos/${available.placementId}`);
  assert.deepEqual(addRequest.body, { profileVersion: 14 });
  assert.ok(requests[1], 'the 200 without a link DTO is followed by one owner read');
  const profileReadAfterAdd = requests.find((request, index) => index > requests.indexOf(addRequest)
    && request.method === 'GET' && request.path === '/api/creador/perfil');
  assert.ok(profileReadAfterAdd, 'the 200 without a link DTO is followed by one owner read');
  const attached = api.state.links.find(({ placementId }) => placementId === available.placementId);
  assert.ok(attached.series.some(({ seriesId }) => seriesId === main.id));
  assert.ok(attached.series.some(({ seriesId }) => seriesId === other.id), 'the existing series membership survives adding another');

  const remove = chapterRow(surface, available.placementId)?.querySelector('[data-chapter-remove]');
  assert.ok(remove, 'reconciled rows expose the membership removal action');
  await remove.dispatch('click');
  await settle();
  assert.equal(writes(requests)[1].method, 'DELETE');
  assert.ok(requests.find((request, index) => index > requests.indexOf(writes(requests)[1])
    && request.method === 'GET' && request.path === '/api/creador/perfil'),
  'the 204 is reconciled from the owner DTO');
  const removed = api.state.links.find(({ placementId }) => placementId === available.placementId);
  assert.equal(removed.series.some(({ seriesId }) => seriesId === main.id), false);
  assert.ok(removed.series.some(({ seriesId }) => seriesId === other.id), 'removing one membership leaves other series intact');
  assert.equal(api.state.links.length, 2, 'chapter removal never removes the profile placement');
  assert.equal(writes(requests).length, 2);
});

test('un GET fallido después de un PUT confirmado permite reintentar sólo la lectura', async () => {
  const targetSeries = series('retry-read');
  const link = chapter(0);
  let failNextRead = false;
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: profile(), links: [link], series: [targetSeries], query: { serie: targetSeries.id },
    override: (request) => {
      if (request.method === 'PUT' && request.path.includes('/capitulos/')) failNextRead = true;
      if (failNextRead && request.method === 'GET' && request.path === '/api/creador/perfil') {
        failNextRead = false;
        return jsonResponse({ error: 'UNAVAILABLE' }, 503);
      }
      return undefined;
    },
  });
  await chapterRow(surface, link.placementId).querySelector('[data-chapter-add]').dispatch('click');
  await settle();
  assert.equal(api.state.links[0].series.some(({ seriesId }) => seriesId === targetSeries.id), true,
    'the service mutation committed even though the following read failed');
  assert.equal(writes(requests).length, 1, 'a failed reconcile does not repeat the membership PUT');
  assert.match(surface.addChapterStatus.textContent, /agreg|guard|actualiz/i,
    'feedback distinguishes the confirmed write from the failed refresh');
  assert.equal(surface.reconcileRetry.hidden, false, 'the user can retry the owner read locally');

  await surface.reconcileRetry.dispatch('click');
  await settle();
  assert.equal(writes(requests).length, 1);
  assert.equal(requests.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length, 2);
  assert.ok(chapterRow(surface, link.placementId)?.querySelector('[data-chapter-remove]'),
    'the read retry updates the visible membership from the committed DTO');
});

test('mover usa el ordinal de la serie completa bajo búsqueda y adopta sólo pertenencia y placementVersion', async () => {
  const targetSeries = series('fifty', { version: 7 });
  const links = [];
  for (let index = 0; index < 58; index += 1) {
    links.push(chapter(index, index < 50 ? targetSeries.id : undefined, {
      ...(index < 28 ? { title: `Capítulo objetivo ${String(index).padStart(2, '0')}` } : {}),
      ...(index === 28 ? { hidden: true, title: 'Capítulo oculto vecino' } : {}),
      ...(index === 29 ? {
        title: 'Capítulo objetivo meta',
        position: 999,
        series: [{ seriesId: targetSeries.id, position: 290 }, { seriesId: 'other-series', position: 4 }],
      } : {}),
    }));
  }
  const target = links[29];
  const targetVersion = target.placementVersion;
  const moveBodies = [];
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), links,
    series: [targetSeries, series('other-series')],
    query: {
      serie: targetSeries.id, pertenencia: 'incluidos', buscarCapitulos: 'Capítulo objetivo',
      paginaCapitulos: '2',
    },
    override: (request, state) => {
      if (request.method !== 'POST' || !request.path.endsWith('/mover')) return undefined;
      moveBodies.push(structuredClone(request.body));
      const targetLink = state.links.find(({ placementId }) => placementId === target.placementId);
      const beforeProfile = state.profile.version;
      const members = state.links.filter((link) => link.series.some(({ seriesId }) => seriesId === targetSeries.id))
        .sort((left, right) => left.series.find(({ seriesId }) => seriesId === targetSeries.id).position
          - right.series.find(({ seriesId }) => seriesId === targetSeries.id).position);
      const currentIndex = members.findIndex(({ placementId }) => placementId === target.placementId);
      const next = [...members];
      next.splice(currentIndex, 1);
      next.splice(request.body.targetPosition - 1, 0, targetLink);
      const changed = [];
      next.forEach((link, index) => {
        const entry = link.series.find(({ seriesId }) => seriesId === targetSeries.id);
        const position = index * 10;
        if (entry.position === position) return;
        const beforePlacement = link.placementVersion;
        entry.position = position;
        link.placementVersion += 1;
        changed.push({ link, beforePlacement });
      });
      state.profile.version += 1;
      const links = changed.map(({ link }) => ({ ...link, series: link.series.map((item) => ({ ...item })),
        ...(link.placementId === target.placementId ? { title: 'DTO con metadatos ajenos', resourceVersion: target.resourceVersion + 1 } : {}) }));
      return jsonResponse({ links, versionChanges: [
        { entity: 'profile', id: state.profile.id, before: beforeProfile, after: state.profile.version },
        ...changed.map(({ link, beforePlacement }) => ({ entity: 'placement', id: link.placementId, before: beforePlacement, after: link.placementVersion })),
      ] });
    },
  });

  assert.equal(surface.chapterRows.length, 4, 'page two contains the last four of 29 matching chapters');
  await openChapterMove(surface, target.placementId);
  assert.equal(surface.targetPosition.value, '30', 'ordinal counts every chapter of the series, not filtered rows or global position');
  assert.equal(surface.targetPosition.getAttribute('max'), '50');
  assert.match(surface.moveContext.textContent, /50/);
  surface.targetPosition.value = '29';
  await surface.targetPosition.dispatch('input');
  assert.match(surface.moveContext.textContent, /Capítulo oculto vecino/i,
    'the neighbor calculation includes a hidden member outside the chapter search');
  await submit(surface.moveForm);

  const moveWrites = writes(requests);
  assert.equal(moveWrites.length, 1);
  assert.equal(moveWrites[0].method, 'POST');
  assert.equal(moveWrites[0].path, `/api/creador/series/${targetSeries.id}/capitulos/${target.placementId}/mover`);
  assert.deepEqual(moveBodies[0], { profileVersion: 14, seriesVersion: 7, placementVersion: targetVersion, targetPosition: 29 });
  assert.equal(surface.window.location.search.includes('paginaCapitulos=2'), true, 'chapter query and page remain in the URL');
  assert.equal(surface.dialog.open, false);

  const visibleTargetRow = chapterRow(surface, target.placementId);
  assert.match(elementText(visibleTargetRow), /Capítulo objetivo meta/,
    'the movement response does not replace the chapter title with unreceipted metadata');
  assert.doesNotMatch(elementText(visibleTargetRow), /DTO con metadatos ajenos/);
  await openChapterMove(surface, target.placementId);
  surface.targetPosition.value = '28';
  await surface.targetPosition.dispatch('input');
  await submit(surface.moveForm);
  assert.equal(writes(requests).length, 2);
  assert.equal(moveBodies[1].profileVersion, 15);
  assert.equal(moveBodies[1].seriesVersion, 7);
  assert.equal(moveBodies[1].placementVersion, targetVersion + 1,
    'the next series move uses the confirmed placement receipt, not an unrelated DTO version');
});

test('422 mantiene el destino y sólo permite probar una alternativa después de Guardar explícito', async () => {
  const targetSeries = series('limited');
  const links = Array.from({ length: 5 }, (_, index) => chapter(index, targetSeries.id));
  let moveCalls = 0;
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: profile(), links, series: [targetSeries], query: { serie: targetSeries.id },
    override: (request) => {
      if (request.method === 'POST' && request.path.endsWith('/mover') && ++moveCalls === 1) {
        return jsonResponse({ error: 'ORDER_MOVE_LIMIT', viablePosition: 2 }, 422);
      }
      return undefined;
    },
  });
  const target = links[4];
  await openChapterMove(surface, target.placementId);
  surface.targetPosition.value = '1';
  await surface.targetPosition.dispatch('input');
  await submit(surface.moveForm);
  assert.equal(surface.targetPosition.value, '1');
  assert.equal(surface.moveForm.hidden, false);
  assert.equal(moveCalls, 1, '422 never triggers a second move automatically');
  assert.equal(surface.moveSuggestion.hidden, false);
  await surface.moveSuggestion.dispatch('click');
  assert.equal(surface.targetPosition.value, '2');
  assert.equal(moveCalls, 1, 'choosing the suggestion only changes the target field');
  await submit(surface.moveForm);
  assert.equal(moveCalls, 2, 'the creator explicitly saves the suggested ordinal');
  assert.equal(api.state.profile.version, 15);
  assert.equal(writes(requests).length, 2);
});

test('409 requiere comparación y adopción explícitas; una segunda carrera no reenvía', async () => {
  const targetSeries = series('conflict');
  const links = Array.from({ length: 4 }, (_, index) => chapter(index, targetSeries.id));
  let moveCalls = 0;
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), links, series: [targetSeries], query: { serie: targetSeries.id },
    override: (request, state) => {
      if (request.method !== 'POST' || !request.path.endsWith('/mover')) return undefined;
      moveCalls += 1;
      if (moveCalls === 1) {
        const target = state.links[3];
        target.series[0].position = 15;
        target.placementVersion += 1;
        state.profile.version += 1;
      }
      return jsonResponse({ error: 'SERIES_CONFLICT' }, 409);
    },
  });
  await openChapterMove(surface, links[3].placementId);
  surface.targetPosition.value = '1';
  await surface.targetPosition.dispatch('input');
  await submit(surface.moveForm);
  assert.equal(surface.targetPosition.value, '1');
  assert.equal(surface.moveForm.hidden, false);
  assert.equal(surface.moveConflict.hidden, false);
  assert.equal(moveCalls, 1, 'the first conflict is not replayed');

  await surface.moveConflict.querySelector('[data-owner-compare]').dispatch('click');
  await settle();
  assert.match(surface.moveConflict.querySelector('[data-owner-comparison]').textContent, /posición|orden/i);
  assert.equal(surface.moveConflict.querySelector('[data-owner-adopt]').hidden, false);
  assert.equal(moveCalls, 1, 'comparison is read-only');
  await surface.moveConflict.querySelector('[data-owner-adopt]').dispatch('click');
  assert.equal(surface.targetPosition.value, '1', 'explicit adoption preserves the requested destination');
  assert.equal(moveCalls, 1, 'adopting current versions does not replay the intent');

  await submit(surface.moveForm);
  assert.equal(moveCalls, 2, 'a second POST requires another explicit Save');
  assert.equal(requests.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length, 1);
  assert.equal(writes(requests).length, 2);
  assert.equal(surface.targetPosition.value, '1');
  assert.equal(surface.moveForm.hidden, false, 'a second conflict still preserves the local destination');
});

test('401 conserva el movimiento y permite reintentar manualmente tras confirmar la misma sesión', async () => {
  const targetSeries = series('session');
  const links = [chapter(0, targetSeries.id), chapter(1, targetSeries.id)];
  let moveCalls = 0;
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: profile(), links, series: [targetSeries], query: { serie: targetSeries.id },
    override: (request) => request.method === 'POST' && request.path.endsWith('/mover') && ++moveCalls === 1
      ? jsonResponse({ error: 'UNAUTHENTICATED' }, 401)
      : undefined,
  });
  await openChapterMove(surface, links[1].placementId);
  surface.targetPosition.value = '1';
  await surface.targetPosition.dispatch('input');
  await submit(surface.moveForm);
  assert.equal(surface.targetPosition.value, '1');
  assert.equal(surface.dialog.querySelector('[data-session-recovery-shell]').hidden, false);
  assert.equal(moveCalls, 1, 'the 401 does not replay the order mutation');
  await surface.checkSession.dispatch('click');
  await settle();
  const sessionCheck = requests.find(({ method, path }) => method === 'GET' && path === '/api/creador/sesion');
  assert.ok(sessionCheck);
  assert.equal(sessionCheck.headers.get('x-creator-page-binding'), surface.root.dataset.sessionBinding);
  assert.equal(moveCalls, 1);
  await submit(surface.moveForm);
  assert.equal(moveCalls, 2, 'only the manual save retries after the same account and role are confirmed');
  assert.equal(writes(requests).at(-1).headers.get('x-csrf-token'), 'csrf-refreshed');
  assert.equal(api.state.links.find(({ placementId }) => placementId === links[1].placementId).series[0].position, 0);
});

test('la serie se elimina sólo tras confirmación y un recibo válido; sus enlaces siguen en la página', async () => {
  const first = series('delete');
  const second = series('keep');
  const shared = chapter(0, first.id, { series: [{ seriesId: first.id, position: 0 }, { seriesId: second.id, position: 10 }] });
  const { surface, api, requests } = await mountOwnerSeriesController({ profile: profile(), links: [shared], series: [first, second] });
  const button = seriesRow(surface, first.id).querySelector('[data-series-delete]');
  await button.dispatch('click');
  assert.equal(surface.confirmCalls.length, 1);
  assert.match(surface.confirmCalls[0], /enlaces|otras series/i, 'confirmation states what remains after deleting a series');
  assert.equal(writes(requests).length, 0, 'canceling deletion makes no write');

  surface.setConfirmResult(true);
  await button.dispatch('click');
  await settle();
  assert.ok(requests[0], 'the confirmed delete action is handled by the owner controller');
  const deleteRequest = writes(requests)[0];
  assert.equal(deleteRequest.method, 'DELETE');
  assert.equal(deleteRequest.path, `/api/creador/series/${first.id}`);
  assert.equal(deleteRequest.status, 204);
  assert.deepEqual(JSON.parse(deleteRequest.responseHeaders.get('Creator-Write-Versions')),
    [{ entity: 'profile', id: api.state.profile.id, before: 14, after: 15 }],
  'series deletion confirms the profile only; it does not invent a deleted-series receipt');
  assert.ok(requests.find((request) => request.method === 'GET' && request.path === '/api/creador/perfil'), 'the list is reconciled after the 204');
  assert.equal(api.state.links.length, 1, 'deleting a series retains its placement');
  assert.ok(api.state.links[0].series.some(({ seriesId }) => seriesId === second.id), 'other series membership remains');
  assert.equal(api.state.series.some(({ id }) => id === first.id), false);
  assert.equal(seriesRow(surface, first.id), undefined, 'a confirmed deletion removes the series row from the active list');
  assert.equal(surface.seriesForm.hidden, true, 'a deleted series has no active metadata form');
  await submit(surface.seriesForm);
  assert.equal(writes(requests).length, 1, 'the deleted series cannot be submitted after its confirmed removal');
});

test('una comparación de A que termina después de cambiar a B no abre ni adopta A sobre B', async () => {
  let releaseRead;
  let markReadStarted;
  let moveCalls = 0;
  let delayedReadUsed = false;
  const readGate = new Promise((resolve) => { releaseRead = resolve; });
  const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
  const first = series('compare-a');
  const second = series('compare-b');
  const links = [chapter(0, first.id), chapter(1, first.id), chapter(2, second.id)];
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), links, series: [first, second], query: { serie: first.id },
    override: async (request, state) => {
      if (request.method === 'POST' && request.path.endsWith('/mover')) {
        moveCalls += 1;
        state.profile.version += 1;
        return jsonResponse({ error: 'SERIES_CONFLICT' }, 409);
      }
      if (request.method === 'GET' && request.path === '/api/creador/perfil' && !delayedReadUsed) {
        delayedReadUsed = true;
        markReadStarted();
        await readGate;
      }
      return undefined;
    },
  });
  await openChapterMove(surface, links[1].placementId);
  surface.targetPosition.value = '1';
  await surface.targetPosition.dispatch('input');
  await submit(surface.moveForm);
  const compare = surface.moveConflict.querySelector('[data-owner-compare]').dispatch('click');
  await readStarted;
  await seriesRow(surface, second.id).querySelector('[data-series-chapters]').dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.dialog.open, false, 'discard closes A before switching to B');
  releaseRead();
  await compare;
  assert.equal(surface.moveConflict.hidden, true, 'the late A comparison cannot reopen over another series');
  assert.equal(surface.moveConflict.querySelector('[data-owner-comparison]').textContent, '');
  assert.equal(surface.moveConflict.querySelector('[data-owner-adopt]').hidden, true);
  assert.equal(moveCalls, 1);
  assert.equal(writes(requests).length, 1, 'the compare and context switch do not repeat the movement');
});

test('la búsqueda de series actualiza la URL sin escribir y el historial restaura la consulta observada', async () => {
  const seriesList = Array.from({ length: 30 }, (_, index) => series(`route-${String(index).padStart(2, '0')}`, {
    name: `Ruta ${String(index).padStart(2, '0')}`,
  }));
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), series: seriesList,
    query: { vista: 'series', buscarSeries: 'Ruta', paginaSeries: '2' },
  });
  assert.equal(surface.seriesRows.length, 5, 'the selected initial page contains the last five of thirty series');
  surface.window.history.replaceState({}, '', '/cuenta/?vista=series&buscarSeries=Ruta&paginaSeries=1');
  surface.window.history.pushState({}, '', '/cuenta/?vista=series&buscarSeries=Ruta&paginaSeries=2');
  surface.historyCalls.length = 0;
  const initialSearch = surface.window.location.search;
  const requestCountBeforeSearch = requests.length;
  assert.match(initialSearch, /buscarSeries=Ruta/);
  assert.match(initialSearch, /paginaSeries=2/);

  surface.seriesSearch.value = 'sin-coincidencias';
  surface.seriesSearch.focus();
  await surface.seriesSearch.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 300));
  const noMatchesSearch = surface.window.location.search;
  assert.match(noMatchesSearch, /buscarSeries=sin-coincidencias/,
    'typing the series search updates the active query');
  assert.match(noMatchesSearch, /paginaSeries=1/,
    'changing search resets the series page to the first result page');
  assert.match(surface.seriesCount.textContent, /^0\s+series$/i,
    'the owner list reports no matches without pretending the underlying collection is empty');
  assert.equal(surface.document.activeElement, surface.seriesSearch,
    'filtering keeps focus in the search field');
  assert.equal(writes(requests).length, 0, 'searching and changing query state do not write');
  assert.equal(requests.length, requestCountBeforeSearch, 'searching uses the loaded owner data without an API request');

  const historyCount = surface.historyCalls.length;
  await surface.seriesFilter.dispatch('submit');
  assert.equal(surface.historyCalls.length, historyCount,
    'applying the already-current search does not add a duplicate history entry');
  surface.window.history.back();
  assert.match(surface.window.location.search, /buscarSeries=Ruta/);
  assert.match(surface.window.location.search, /paginaSeries=1/,
    'Back restores the previous query after the repeated Apply was deduplicated');
  assert.equal(surface.document.activeElement, surface.seriesSearch,
    'restoring a still-visible series search does not move focus');
  surface.window.history.forward();
  assert.match(surface.window.location.search, /buscarSeries=sin-coincidencias/,
    'Forward restores the later query');
  assert.equal(surface.document.activeElement, surface.seriesSearch,
    'forward navigation keeps focus in the visible search field');
  assert.equal(writes(requests).length, 0);
});

test('un 409 de metadatos exige comparar y adoptar antes de un segundo Guardar', async () => {
  const existing = series('metadata-conflict');
  let patches = 0;
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: profile(), series: [existing],
    override: (request, state) => {
      if (request.method !== 'PATCH') return undefined;
      patches += 1;
      if (patches === 1) {
        state.profile.version += 1;
        const current = state.series.find(({ id }) => id === existing.id);
        current.version += 1;
        current.name = 'Nombre guardado desde otra pestaña';
        return jsonResponse({ error: 'SERIES_CONFLICT' }, 409);
      }
      return undefined;
    },
  });
  await openEdit(surface, existing.id);
  surface.seriesFormFields.description.value = 'Descripción local';
  await surface.seriesFormFields.description.dispatch('input');
  await submit(surface.seriesForm);
  assert.equal(patches, 1, 'a metadata conflict is not replayed');
  assert.equal(surface.seriesForm.hidden, false);
  assert.equal(surface.seriesFormFields.description.value, 'Descripción local');
  assert.equal(surface.seriesFormConflict.hidden, false);

  await surface.seriesFormConflict.querySelector('[data-owner-compare]').dispatch('click');
  await settle();
  assert.match(surface.seriesFormConflict.querySelector('[data-owner-comparison]').textContent, /Nombre guardado desde otra pestaña/);
  assert.equal(surface.seriesFormConflict.querySelector('[data-owner-adopt]').hidden, false);
  assert.equal(patches, 1, 'comparison is read-only');
  await surface.seriesFormConflict.querySelector('[data-owner-adopt]').dispatch('click');
  assert.equal(surface.seriesFormFields.description.value, 'Descripción local', 'adoption keeps the creator’s correction');
  assert.equal(patches, 1, 'adopting observed versions does not replay the edit');

  await submit(surface.seriesForm);
  assert.equal(patches, 2, 'a fresh explicit save is required after adoption');
  const confirmedSave = writes(requests).at(-1);
  assert.equal(confirmedSave.body.profileVersion, api.state.profile.version - 1);
  assert.equal(confirmedSave.body.version, api.state.series[0].version - 1);
  assert.equal(confirmedSave.body.description, 'Descripción local');
});

test('una comparación tardía de serie A no aparece ni se adopta sobre la edición de B', async () => {
  let releaseRead;
  let markReadStarted;
  const readGate = new Promise((resolve) => { releaseRead = resolve; });
  const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
  let delayedReadUsed = false;
  const first = series('series-compare-a');
  const second = series('series-compare-b');
  let patches = 0;
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), series: [first, second],
    override: async (request, state) => {
      if (request.method === 'PATCH') {
        patches += 1;
        state.profile.version += 1;
        return jsonResponse({ error: 'SERIES_CONFLICT' }, 409);
      }
      if (request.method === 'GET' && request.path === '/api/creador/perfil' && !delayedReadUsed) {
        delayedReadUsed = true;
        markReadStarted();
        await readGate;
      }
      return undefined;
    },
  });

  await openEdit(surface, first.id);
  surface.seriesFormFields.description.value = 'Corrección local de A';
  await surface.seriesFormFields.description.dispatch('input');
  await submit(surface.seriesForm);
  const compare = surface.seriesFormConflict.querySelector('[data-owner-compare]').dispatch('click');
  await readStarted;
  await seriesRow(surface, second.id).querySelector('[data-series-edit]').dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.seriesFormFields.name.value, second.name);
  releaseRead();
  await compare;
  assert.equal(surface.seriesFormFields.name.value, second.name);
  assert.equal(surface.seriesFormFields.description.value, second.description);
  assert.equal(surface.seriesFormConflict.hidden, true, 'the delayed A comparison cannot reopen over B');
  assert.equal(surface.seriesFormConflict.querySelector('[data-owner-comparison]').textContent, '');
  assert.equal(surface.seriesFormConflict.querySelector('[data-owner-adopt]').hidden, true);
  assert.equal(patches, 1);
  assert.equal(writes(requests).length, 1, 'comparison and switching context do not repeat a series write');
});

test('401 de edición de serie conserva la corrección y sólo reintenta tras comprobar la sesión', async () => {
  const existing = series('metadata-session');
  let patches = 0;
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), series: [existing],
    override: (request) => request.method === 'PATCH' && ++patches === 1
      ? jsonResponse({ error: 'UNAUTHENTICATED' }, 401)
      : undefined,
  });
  await openEdit(surface, existing.id);
  surface.seriesFormFields.description.value = 'No perder esta descripción';
  await surface.seriesFormFields.description.dispatch('input');
  await submit(surface.seriesForm);
  assert.equal(patches, 1, 'the failed save is not replayed by recovery');
  assert.equal(surface.seriesForm.hidden, false);
  assert.equal(surface.seriesFormFields.description.value, 'No perder esta descripción');
  assert.equal(surface.dialog.querySelector('[data-session-recovery-shell]').hidden, false);

  await surface.checkSession.dispatch('click');
  await settle();
  const sessionCheck = requests.find(({ method, path }) => method === 'GET' && path === '/api/creador/sesion');
  assert.ok(sessionCheck);
  assert.equal(sessionCheck.headers.get('x-creator-page-binding'), surface.root.dataset.sessionBinding);
  assert.equal(patches, 1);
  await submit(surface.seriesForm);
  assert.equal(patches, 2, 'the creator manually retries after session recovery');
  assert.equal(writes(requests).at(-1).headers.get('x-csrf-token'), 'csrf-refreshed');
});

test('un movimiento demorado conserva una corrección tardía y no acepta un segundo submit', async () => {
  let release;
  let markStarted;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { markStarted = resolve; });
  const targetSeries = series('move-late');
  const links = Array.from({ length: 3 }, (_, index) => chapter(index, targetSeries.id));
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), links, series: [targetSeries], query: { serie: targetSeries.id },
    override: async (request) => {
      if (request.method === 'POST' && request.path.endsWith('/mover')) {
        markStarted();
        await gate;
      }
      return undefined;
    },
  });
  const target = links[2];
  await openChapterMove(surface, target.placementId);
  surface.targetPosition.value = '1';
  await surface.targetPosition.dispatch('input');
  const pending = surface.moveForm.dispatch('submit');
  await started;
  surface.targetPosition.value = '2';
  await surface.targetPosition.dispatch('input');
  await surface.moveForm.dispatch('submit');
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1,
    'the pending command cannot be submitted twice');
  release();
  await pending;
  assert.equal(surface.moveForm.hidden, false, 'a correction entered during the request remains open');
  assert.equal(surface.targetPosition.value, '2');
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1);
});

test('503 y recibo incompatible conservan la intención de mover sin afirmar éxito', async (t) => {
  for (const failure of ['503', 'receipt']) {
    await t.test(failure, async () => {
      const targetSeries = series(`failure-${failure}`);
      const links = [chapter(0, targetSeries.id), chapter(1, targetSeries.id)];
      const { surface, requests } = await mountOwnerSeriesController({
        profile: profile(), links, series: [targetSeries], query: { serie: targetSeries.id },
        override: (request, state) => {
          if (request.method !== 'POST' || !request.path.endsWith('/mover')) return undefined;
          if (failure === '503') return jsonResponse({ error: 'UNAVAILABLE' }, 503);
          const target = state.links.find(({ placementId }) => placementId === links[1].placementId);
          return jsonResponse({ links: [target], versionChanges: [
            { entity: 'profile', id: 'unexpected-profile', before: 14, after: 15 },
          ] });
        },
      });
      await openChapterMove(surface, links[1].placementId);
      surface.targetPosition.value = '1';
      await surface.targetPosition.dispatch('input');
      await submit(surface.moveForm);
      assert.equal(requests.filter(({ method }) => method === 'POST').length, 1);
      assert.equal(surface.moveForm.hidden, false);
      assert.equal(surface.targetPosition.value, '1');
      assert.doesNotMatch(surface.moveStatus.textContent, /guardado|movido con éxito/i);
    });
  }
});

test('un rechazo al borrar conserva la serie y permite seguir trabajando', async () => {
  const existing = series('delete-rejected');
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: profile(), series: [existing],
    override: (request) => request.method === 'DELETE'
      ? jsonResponse({ error: 'UNAVAILABLE' }, 503)
      : undefined,
  });
  const button = seriesRow(surface, existing.id).querySelector('[data-series-delete]');
  surface.setConfirmResult(true);
  await button.dispatch('click');
  await settle();
  assert.ok(requests[0], 'the delete action is handled by the owner controller');
  assert.equal(requests[0].method, 'DELETE');
  assert.equal(api.state.series.some(({ id }) => id === existing.id), true);
  assert.ok(seriesRow(surface, existing.id), 'a rejected deletion leaves the series available');
  assert.equal(surface.seriesForm.hidden, true, 'the failure does not open a second or stale form');
  assert.match(surface.pageStatus.textContent, /no pudimos|intenta|error/i);
  await openEdit(surface, existing.id);
  assert.equal(surface.seriesForm.hidden, false, 'the retained row can still open its metadata form after rejection');
});

test('un recibo inválido de borrado no elimina la serie ni afirma éxito', async () => {
  const existing = series('delete-invalid-receipt');
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: profile(), series: [existing],
    override: (request) => request.method === 'DELETE'
      ? new Response(null, { status: 204, headers: { 'Creator-Write-Versions': JSON.stringify([
        { entity: 'profile', id: 'wrong-profile', before: 14, after: 15 },
      ]) } })
      : undefined,
  });
  surface.setConfirmResult(true);
  await seriesRow(surface, existing.id).querySelector('[data-series-delete]').dispatch('click');
  await settle();
  assert.equal(writes(requests).length, 1);
  assert.equal(api.state.series.some(({ id }) => id === existing.id), true, 'the fixture did not commit an incompatible response');
  assert.ok(seriesRow(surface, existing.id), 'the client keeps the row when it cannot verify the receipt');
  assert.match(surface.pageStatus.textContent, /no pudimos|confirmar|recibo|error/i);
});

test('un slug ocupado conserva el campo y un recibo metadata incompatible no afirma guardado', async (t) => {
  await t.test('slug ocupado', async () => {
    const existing = series('slug-current');
    const other = series('slug-other', { slug: 'reservado' });
    const { surface, requests } = await mountOwnerSeriesController({
      profile: profile(), series: [existing, other],
      override: (request) => request.method === 'PATCH'
        ? jsonResponse({ error: 'SERIES_SLUG_TAKEN' }, 409)
        : undefined,
    });
    await openEdit(surface, existing.id);
    surface.seriesFormFields.slug.value = other.slug;
    await surface.seriesFormFields.slug.dispatch('input');
    await submit(surface.seriesForm);
    assert.equal(writes(requests).length, 1);
    assert.equal(surface.seriesForm.hidden, false);
    assert.equal(surface.seriesFormFields.slug.value, other.slug);
    assert.doesNotMatch(surface.seriesFormStatus.textContent, /guardado|actualizado/i);
  });

  await t.test('acuse inválido', async () => {
    const existing = series('metadata-invalid-receipt');
    const { surface, requests } = await mountOwnerSeriesController({
      profile: profile(), series: [existing],
      override: (request, state) => request.method === 'PATCH'
        ? jsonResponse({
          series: { ...state.series[0], version: existing.version + 1 },
          profileVersion: state.profile.version + 1,
          versionChanges: [{ entity: 'profile', id: 'unexpected-profile', before: 14, after: 15 }],
        })
        : undefined,
    });
    await openEdit(surface, existing.id);
    surface.seriesFormFields.description.value = 'Corrección pendiente';
    await surface.seriesFormFields.description.dispatch('input');
    await submit(surface.seriesForm);
    assert.equal(writes(requests).length, 1);
    assert.equal(surface.seriesForm.hidden, false);
    assert.equal(surface.seriesFormFields.description.value, 'Corrección pendiente');
    assert.doesNotMatch(surface.seriesFormStatus.textContent, /guardado|actualizado/i);
  });
});

test('una serie creada sin descripción confirma el no-op en el servidor y los PATCH conservan intención', async (t) => {
  await t.test('alta vacía seguida de editar y guardar sin cambios', async () => {
    const noOpReply = (request, current) => {
      if (request.method !== 'PATCH' || request.body.version !== current.series[0]?.version
        || request.body.profileVersion !== current.profile.version
        || request.body.name !== current.series[0]?.name || request.body.slug !== current.series[0]?.slug
        || Object.hasOwn(request.body, 'description')) return undefined;
      return new Response(JSON.stringify({
        series: { ...current.series[0] },
        profileVersion: current.profile.version,
        versionChanges: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const { surface, api, requests } = await mountOwnerSeriesController({ profile: profile(), series: [], override: noOpReply });
    await surface.seriesCreateOpen.dispatch('click');
    surface.seriesFormFields.name.value = 'Serie sin descripción';
    surface.seriesFormFields.slug.value = 'serie-sin-descripcion';
    await surface.seriesFormFields.name.dispatch('input');
    await surface.seriesFormFields.slug.dispatch('input');
    await submit(surface.seriesForm);

    const created = api.state.series[0];
    assert.equal(Object.hasOwn(created, 'description'), false,
      'creating an empty optional description leaves it absent on the server');
    const createCount = writes(requests).length;
    await openEdit(surface, created.id);
    await submit(surface.seriesForm);

    assert.equal(writes(requests).length, createCount + 1, 'saving unchanged optional metadata still checks the server versions');
    assert.deepEqual(writes(requests).at(-1).body, {
      version: created.version,
      profileVersion: 15,
      name: created.name,
      slug: created.slug,
    }, 'the no-op sends unchanged required fields and omits the absent optional description');
    assert.equal(api.state.profile.version, 15, 'the no-op does not advance the profile version');
    assert.equal(api.state.series[0].version, 1, 'the no-op does not advance the series version');
    assert.equal(Object.hasOwn(api.state.series[0], 'description'), false,
      'the server no-op keeps the stored optional description absent');
    assert.match(surface.seriesFormStatus.textContent, /Cambios guardados/i,
      'a valid server receipt confirms the unchanged save');
  });

  await t.test('un campo description vacío presente también es un no-op', async () => {
    const existing = series('description-empty-present', { description: '' });
    const noOpReply = (request, current) => {
      if (request.method !== 'PATCH' || request.body.version !== existing.version
        || request.body.profileVersion !== current.profile.version
        || request.body.name !== existing.name || request.body.slug !== existing.slug
        || Object.hasOwn(request.body, 'description')) return undefined;
      return new Response(JSON.stringify({
        series: { ...current.series[0] }, profileVersion: current.profile.version, versionChanges: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const { surface, api, requests } = await mountOwnerSeriesController({ profile: profile(), series: [existing], override: noOpReply });
    await openEdit(surface, existing.id);
    await submit(surface.seriesForm);
    assert.equal(writes(requests).length, 1, 'the unchanged PATCH confirms versions and the no-op receipt');
    assert.deepEqual(writes(requests)[0].body, {
      version: existing.version, profileVersion: 14, name: existing.name, slug: existing.slug,
    });
    assert.equal(api.state.profile.version, 14);
    assert.equal(api.state.series[0].version, existing.version);
    assert.equal(api.state.series[0].description, '');
    assert.match(surface.seriesFormStatus.textContent, /Cambios guardados/i);
  });

  await t.test('PATCH conserva name y slug para CAS, omite descripción igual y permite borrarla', async () => {
    const existing = series('metadata-intent', { name: 'Nombre actual', slug: 'nombre-actual', description: 'Descripción actual' });
    const { surface, api, requests } = await mountOwnerSeriesController({ profile: profile(), series: [existing] });
    await openEdit(surface, existing.id);
    surface.seriesFormFields.name.value = 'Nombre nuevo';
    surface.seriesFormFields.slug.value = 'nombre-nuevo';
    surface.seriesFormFields.description.value = 'Descripción nueva';
    await surface.seriesFormFields.name.dispatch('input');
    await surface.seriesFormFields.slug.dispatch('input');
    await surface.seriesFormFields.description.dispatch('input');
    await submit(surface.seriesForm);

    const rename = writes(requests).at(-1);
    assert.deepEqual(rename.body, {
      version: existing.version,
      profileVersion: 14,
      name: 'Nombre nuevo',
      slug: 'nombre-nuevo',
      description: 'Descripción nueva',
    });
    assert.equal(api.state.series[0].name, 'Nombre nuevo');
    assert.equal(api.state.series[0].slug, 'nombre-nuevo');
    assert.equal(api.state.series[0].description, 'Descripción nueva');

    await openEdit(surface, existing.id);
    surface.seriesFormFields.description.value = '';
    await surface.seriesFormFields.description.dispatch('input');
    await submit(surface.seriesForm);
    const clearDescription = writes(requests).at(-1);
    assert.deepEqual(clearDescription.body, {
      version: existing.version + 1,
      profileVersion: 15,
      name: 'Nombre nuevo',
      slug: 'nombre-nuevo',
      description: '',
    }, 'clearing an existing description remains an explicit write with the required fields for server validation');
    assert.equal(api.state.series[0].description, '');
    assert.equal(api.state.profile.version, 16);
    assert.equal(api.state.series[0].version, existing.version + 2);
  });

  for (const racedVersion of ['profile', 'series']) {
    await t.test(`un no-op con ${racedVersion} obsoleta llega al servidor y conserva el conflicto`, async () => {
      const existing = series(`stale-empty-noop-${racedVersion}`, { description: '' });
      let raced = false;
      const override = (request, current) => {
        if (request.method !== 'PATCH' || raced) return;
        raced = true;
        if (racedVersion === 'profile') current.profile.version += 1;
        else current.series[0].version += 1;
      };
      const { surface, api, requests } = await mountOwnerSeriesController({ profile: profile(), series: [existing], override });
      await openEdit(surface, existing.id);
      await submit(surface.seriesForm);

      assert.equal(writes(requests).length, 1, 'the unchanged edit is sent with its captured CAS versions');
      assert.deepEqual(writes(requests)[0].body, {
        version: existing.version, profileVersion: 14, name: existing.name, slug: existing.slug,
      });
      assert.equal(writes(requests)[0].status, 409, 'the server rejects the stale no-op instead of the client hiding the race');
      assert.equal(api.state.profile.version, racedVersion === 'profile' ? 15 : 14);
      assert.equal(api.state.series[0].version, existing.version + Number(racedVersion === 'series'));
      assert.match(surface.seriesFormStatus.textContent, /cambió/i);
    });
  }
});

test('la paginación de Series y Capítulos conserva un destino de foco disponible; entrar y volver mantiene contexto', async () => {
  const targetSeries = series('focus-00', { name: 'Ruta 00' });
  const seriesList = Array.from({ length: 51 }, (_, index) => series(`focus-${String(index).padStart(2, '0')}`, {
    name: `Ruta ${String(index).padStart(2, '0')}`,
  }));
  const links = Array.from({ length: 51 }, (_, index) => chapter(index, targetSeries.id));
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), links, series: seriesList,
    query: { buscarSeries: 'Ruta', paginaSeries: '1' },
  });
  const pageLink = (nav, selector, label) => nav.querySelectorAll(selector)
    .find((item) => item.textContent.trim() === label);
  const activatePage = async (nav, selector, label, expectedFocus) => {
    const active = pageLink(nav, selector, label);
    assert.ok(active, `${label} is available before activation`);
    active.focus();
    await active.dispatch('click');
    assert.ok(surface.document.activeElement?.isConnected, 'the resulting focus target remains connected');
    assert.equal(surface.document.activeElement.textContent.trim(), expectedFocus,
      `focus stays on ${expectedFocus} when the activated direction is or becomes unavailable`);
  };

  const seriesSelector = '[data-series-page]';
  await activatePage(surface.seriesPagination, seriesSelector, 'Siguiente', 'Siguiente');
  await activatePage(surface.seriesPagination, seriesSelector, 'Siguiente', 'Anterior');
  await activatePage(surface.seriesPagination, seriesSelector, 'Anterior', 'Anterior');
  await activatePage(surface.seriesPagination, seriesSelector, 'Anterior', 'Siguiente');
  surface.window.history.back();
  await settle();
  assert.match(surface.window.location.search, /paginaSeries=2/);
  assert.equal(surface.document.activeElement.textContent.trim(), 'Siguiente',
    'browser Back keeps focus on the replacement pagination link');
  surface.window.history.forward();
  await settle();
  assert.match(surface.window.location.search, /paginaSeries=1/);
  assert.equal(surface.document.activeElement.textContent.trim(), 'Siguiente',
    'browser Forward keeps focus on the connected pagination link');
  assert.match(surface.window.location.search, /buscarSeries=Ruta/);
  assert.match(surface.window.location.search, /paginaSeries=1/);

  const chapterEntry = seriesRow(surface, targetSeries.id).querySelector('[data-series-chapters]');
  chapterEntry.focus();
  await chapterEntry.dispatch('click');
  assert.equal(surface.document.activeElement, surface.chapterSearch,
    'entering Chapters places focus in its search field');
  assert.equal(new URLSearchParams(surface.window.location.search).get('buscarSeries'), 'Ruta',
    'the list search remains part of the chapter context');
  assert.equal(new URLSearchParams(surface.window.location.search).get('serie'), targetSeries.id);

  const chapterSelector = '[data-series-chapter-page]';
  await activatePage(surface.chapterPagination, chapterSelector, 'Siguiente', 'Siguiente');
  await activatePage(surface.chapterPagination, chapterSelector, 'Siguiente', 'Anterior');
  await activatePage(surface.chapterPagination, chapterSelector, 'Anterior', 'Anterior');
  await activatePage(surface.chapterPagination, chapterSelector, 'Anterior', 'Siguiente');
  const back = surface.chapterBack;
  back.focus();
  await back.dispatch('click');
  assert.equal(surface.document.activeElement, surface.seriesSearch,
    'returning to the list places focus in the series search field');
  const returned = new URLSearchParams(surface.window.location.search);
  assert.equal(returned.get('buscarSeries'), 'Ruta');
  assert.equal(returned.get('paginaSeries'), '1');
  assert.equal(returned.has('serie'), false);
  assert.equal(writes(requests).length, 0, 'navigation changes only the URL and rendered collection');
});

test('el historial del navegador devuelve el foco al buscador visible al alternar lista y capítulos', async () => {
  const seriesList = Array.from({ length: 51 }, (_, index) => series(`history-${String(index).padStart(2, '0')}`, {
    name: `Ruta ${String(index).padStart(2, '0')}`,
  }));
  const targetSeries = seriesList[0];
  const link = chapter(0, targetSeries.id, { title: 'Capítulo de historial' });
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), links: [link], series: seriesList,
    query: { buscarSeries: 'Ruta', paginaSeries: '1' },
  });
  const listUrl = surface.window.location.href;
  const entry = seriesRow(surface, targetSeries.id).querySelector('[data-series-chapters]');
  entry.focus();
  await entry.dispatch('click');
  await settle();
  assert.equal(surface.document.activeElement, surface.chapterSearch,
    'opening Chapters focuses the search in its visible panel');
  assert.equal(surface.seriesListView.hidden, true);
  const chaptersUrl = surface.window.location.href;

  surface.window.history.back = () => {
    surface.window.location.href = listUrl;
    surface.window.dispatchEvent({ type: 'popstate', state: { creatorOwnerHistoryIndex: 0 } });
  };
  surface.window.history.forward = () => {
    surface.window.location.href = chaptersUrl;
    surface.window.dispatchEvent({ type: 'popstate', state: { creatorOwnerHistoryIndex: 1 } });
  };

  surface.window.history.back();
  await settle();
  assert.equal(surface.seriesListView.hidden, false);
  assert.equal(surface.chapterRegion.hidden, true);
  assert.equal(surface.document.activeElement, surface.seriesSearch,
    'Back moves focus out of the hidden chapter panel to the visible list search');
  assert.equal(new URLSearchParams(surface.window.location.search).get('buscarSeries'), 'Ruta');
  assert.equal(new URLSearchParams(surface.window.location.search).has('serie'), false);

  surface.window.history.forward();
  await settle();
  assert.equal(surface.seriesListView.hidden, true);
  assert.equal(surface.chapterRegion.hidden, false);
  assert.equal(surface.document.activeElement, surface.chapterSearch,
    'Forward moves focus out of the hidden list to the visible chapter search');
  assert.equal(new URLSearchParams(surface.window.location.search).get('serie'), targetSeries.id);
  assert.equal(writes(requests).length, 0, 'Back and Forward only restore the observed URL and view');
});

test('quitar la última coincidencia mantiene filtro/página y lleva el foco al buscador', async () => {
  const targetSeries = series('remove-last');
  const link = chapter(0, targetSeries.id, { title: 'Coincidencia única' });
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), links: [link], series: [targetSeries],
    query: { serie: targetSeries.id, buscarCapitulos: 'Coincidencia', pertenencia: 'incluidos', paginaCapitulos: '1' },
  });
  const remove = chapterRow(surface, link.placementId)?.querySelector('[data-chapter-remove]');
  assert.ok(remove, 'the included chapter has an explicit membership action');
  remove.focus();
  await remove.dispatch('click');
  await settle();
  assert.equal(writes(requests).length, 1);
  assert.ok(requests.find(({ method, path }) => method === 'GET' && path === '/api/creador/perfil'),
    'membership removal reconciles the owner DTO');
  const currentQuery = new URLSearchParams(surface.window.location.search);
  assert.equal(currentQuery.get('serie'), targetSeries.id);
  assert.equal(currentQuery.get('buscarCapitulos'), 'Coincidencia');
  assert.equal(currentQuery.get('pertenencia'), 'incluidos');
  assert.equal(currentQuery.get('paginaCapitulos'), '1');
  assert.equal(surface.document.activeElement, surface.chapterSearch,
    'when the action row disappears from the active filter, focus returns to chapter search');
});

async function beginExternalSeriesDeletionRecovery() {
  const deleted = series('deleted');
  const many = [deleted, ...Array.from({ length: 26 }, (_, index) => series(`other-${index}`))];
  const link = chapter(0, undefined);
  let releaseRead;
  let markReadStarted;
  let holdRetryRead = false;
  const readStarted = new Promise((resolve) => { markReadStarted = resolve; });
  const readGate = new Promise((resolve) => { releaseRead = resolve; });
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), links: [link], series: many,
    query: { buscarSeries: 'Ruta', paginaSeries: 2, serie: deleted.id, buscarCapitulos: 'Capítulo', paginaCapitulos: 1 },
    override: async (request, state) => {
      if (request.method === 'PUT' && request.path.endsWith(`/capitulos/${link.placementId}`)) {
        state.series = state.series.filter(({ id }) => id !== deleted.id);
        state.profile.version += 1;
        return jsonResponse({ error: 'PROFILE_CONFLICT' }, 409);
      }
      if (holdRetryRead && request.method === 'GET' && request.path === '/api/creador/perfil') {
        markReadStarted();
        await readGate;
      }
      return undefined;
    },
  });
  surface.reconcileRetry.remove();
  surface.ownerSeries.append(surface.reconcileRetry);

  await surface.chapterRegion.querySelector('[data-chapter-add]').dispatch('click');
  await settle();
  assert.equal(surface.reconcileRetry.closest('[data-owner-series-chapters]'), null,
    'the recovery control matches the SSR common-area placement outside the chapter panel');
  return {
    surface,
    requests,
    async retryWithFocus() {
      holdRetryRead = true;
      surface.reconcileRetry.focus();
      const pending = surface.reconcileRetry.dispatch('click');
      await readStarted;
      return { pending, releaseRead };
    },
  };
}

test('reconciliar una serie eliminada por otra pestaña vuelve a la lista Series y conserva su consulta, estado y foco perdido', async () => {
  const { surface, requests, retryWithFocus } = await beginExternalSeriesDeletionRecovery();
  const { pending, releaseRead } = await retryWithFocus();
  const body = new SurfaceElement({ tagName: 'BODY' });
  body.ownerDocument = surface.document;
  surface.document.body = body;
  surface.document.activeElement = body;
  releaseRead();
  await pending;
  await settle();

  const location = new URL(surface.window.location.href);
  assert.equal(location.searchParams.get('vista'), 'series');
  assert.equal(location.searchParams.has('serie'), false, 'a removed series is no longer selected in the URL');
  assert.equal(location.searchParams.get('buscarSeries'), 'Ruta');
  assert.equal(location.searchParams.get('paginaSeries'), '2');
  assert.equal(location.searchParams.has('buscarCapitulos'), false, 'chapter search belongs to the deleted series');
  assert.equal(surface.seriesListView.hidden, false);
  assert.equal(surface.chapterRegion.hidden, true, 'the stale chapter panel is not left active');
  assert.equal(surface.seriesSearch.value, 'Ruta');
  assert.equal(surface.document.activeElement, surface.seriesSearch,
    'when disabling the common-area retry leaves focus on BODY, recovery moves it to the current Series search');
  assert.match(surface.seriesListView.querySelector('[data-series-write-status]').textContent, /lista está actualizada/i,
    'recovery status remains visible in the list that is now shown');
  const writesBeforeStaleAction = writes(requests).length;
  await surface.chapterRegion.querySelector('[data-chapter-add]').dispatch('click');
  await settle();
  assert.equal(writes(requests).length, writesBeforeStaleAction, 'a stale hidden chapter action cannot write after normalization');
});

test('normalizar la serie eliminada no roba el foco si el usuario eligió otro control visible', async () => {
  const { surface, retryWithFocus } = await beginExternalSeriesDeletionRecovery();
  const { pending, releaseRead } = await retryWithFocus();
  surface.seriesCreateOpen.focus();
  releaseRead();
  await pending;
  await settle();
  assert.equal(surface.seriesListView.hidden, false);
  assert.equal(surface.document.activeElement, surface.seriesCreateOpen,
    'focus stays on a connected visible control chosen while the owner read was pending');
});

test('si el borrado local termina después de navegar a sus capítulos, confirma en la lista Series actual', async () => {
  const deleted = series('pending-delete', { name: 'Ruta 000 pendiente de borrar' });
  const many = [deleted, ...Array.from({ length: 26 }, (_, index) => series(`other-${index}`))];
  let releaseDelete;
  let markDeleteStarted;
  const deleteStarted = new Promise((resolve) => { markDeleteStarted = resolve; });
  const deleteGate = new Promise((resolve) => { releaseDelete = resolve; });
  const { surface } = await mountOwnerSeriesController({
    profile: profile(), series: many,
    override: async (request) => {
      if (request.method === 'DELETE' && request.path.endsWith(`/series/${deleted.id}`)) {
        markDeleteStarted();
        await deleteGate;
      }
      return undefined;
    },
  });
  surface.setConfirmResult(true);
  const row = surface.seriesList.querySelectorAll('[data-owner-series-row]')
    .find((candidate) => candidate.dataset.ownerSeriesRow === deleted.id);
  assert.ok(row);
  const deletion = row.querySelector('[data-series-delete]').dispatch('click');
  await deleteStarted;
  await row.querySelector('[data-series-chapters]').dispatch('click');
  assert.equal(new URL(surface.window.location.href).searchParams.get('serie'), deleted.id,
    'the chapter panel is opened while the confirmed delete is still pending');

  releaseDelete();
  await deletion;
  await settle();
  const location = new URL(surface.window.location.href);
  assert.equal(location.searchParams.get('vista'), 'series');
  assert.equal(location.searchParams.has('serie'), false);
  assert.equal(surface.seriesListView.hidden, false);
  assert.equal(surface.chapterRegion.hidden, true);
  assert.match(surface.seriesListView.querySelector('[data-series-write-status]').textContent, /Serie eliminada/i);
  assert.equal(surface.document.activeElement, surface.seriesSearch);
});

test('adoptar un DTO sin la serie seleccionada normaliza la vista Series sin cambiar a Enlaces', async () => {
  const removed = series('adopted-away');
  const link = chapter(0, removed.id);
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), links: [link], series: [removed], query: { serie: removed.id, buscarSeries: 'Ruta', paginaSeries: 1 },
    override: (request, state) => {
      if (request.method === 'PUT' && request.path === '/api/creador/perfil') {
        state.series = [];
        state.profile.version += 1;
        return jsonResponse({ error: 'PROFILE_VERSION_CONFLICT' }, 409);
      }
      return undefined;
    },
  });
  const conflict = surface.document.createElement('section');
  const compare = surface.document.createElement('button');
  compare.type = 'button'; compare.dataset.ownerCompare = '';
  const comparison = surface.document.createElement('div');
  comparison.dataset.ownerComparison = ''; comparison.hidden = true;
  const adopt = surface.document.createElement('button');
  adopt.type = 'button'; adopt.dataset.ownerAdopt = ''; adopt.hidden = true;
  conflict.dataset.ownerConflict = '';
  conflict.append(compare, comparison, adopt);
  surface.dataForm.append(conflict);

  await surface.root.querySelector('[data-owner-edit="datos"]').dispatch('click');
  const name = surface.dataForm.elements.find(({ name }) => name === 'displayName');
  name.value = 'Corrección local';
  await name.dispatch('input');
  await surface.dataForm.dispatch('submit'); await settle();
  await compare.dispatch('click'); await settle();
  await adopt.dispatch('click');

  const location = new URL(surface.window.location.href);
  assert.equal(location.searchParams.get('vista'), 'series');
  assert.equal(location.searchParams.has('serie'), false);
  assert.equal(surface.seriesListView.hidden, false);
  assert.equal(surface.chapterRegion.hidden, true);
  assert.equal(surface.root.dataset.profileVersion, '15');
  assert.equal(writes(requests).length, 1, 'adoption itself does not replay the profile write');
});


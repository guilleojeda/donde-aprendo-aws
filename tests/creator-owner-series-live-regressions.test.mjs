import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mountOwnerSeriesController, jsonResponse, settle, writes } from './fixtures/creator-owner-series-browser.mjs';
import { createCreatorOwnerLinkMoveRouteHarness } from './fixtures/creator-owner-link-move-route.mjs';

const app = await createCreatorOwnerLinkMoveRouteHarness();
after(() => app.close());

const profile = (overrides = {}) => ({
  id: 'creator-series-1', displayName: 'Ana Series', slug: 'ana-series', version: 14,
  published: true, hidden: false, city: '', country: '', bio: '', programs: [], socials: {},
  ...overrides,
});

const series = (id, overrides = {}) => ({
  id, name: `Ruta ${id}`, slug: `ruta-${id}`, description: `Descripción ${id}`, version: 3, ...overrides,
});

function chapter(index, memberships = []) {
  return {
    placementId: `placement-${String(index).padStart(3, '0')}`,
    resourceId: `series-resource-${index}`,
    title: `Capítulo ${String.fromCharCode(65 + index)}`,
    url: `https://chapters.example/${index}`,
    description: '',
    featured: false,
    position: index * 10,
    selectedForDirectory: true,
    hidden: false,
    directoryApproval: 'approved',
    resourceVersion: index + 2,
    placementVersion: index + 5,
    series: memberships.map((membership) => ({ ...membership })),
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

async function submit(form) {
  await form.dispatch('submit');
  await settle();
}

test('el SSR inicial conserva el panel de capítulos oculto y el controlador lo activa al elegir una serie', async () => {
  await app.resetRuntime();
  await app.createProfile({ slug: 'ana-series-live' });
  const savedSeries = await app.createSeries({ name: 'A Ruta visible', slug: 'ruta-visible' });
  for (let index = 1; index < 30; index += 1) {
    await app.createSeries({ name: `Ruta de prueba ${String(index).padStart(2, '0')}`, slug: `ruta-prueba-${index}` });
  }
  const savedLink = await app.addLink({ title: 'Capítulo inicial', url: 'https://series.example/inicial' });
  await app.assignChapter(savedSeries.id, savedLink.placementId);
  await app.api('/api/creador/perfil/publicar/', {}, { method: 'POST' });

  const rendered = await app.render({ search: '?vista=series' });
  assert.equal((rendered.html.match(/data-owner-series-row=/g) ?? []).length, 25, 'the initial list shows one page from the 30 saved series');
  assert.match(rendered.html, /data-series-empty(?:\s|=|>)/, 'the empty-state node is present even when SSR has matching rows');
  assert.match(rendered.html, /<p[^>]*data-series-empty[^>]*\bhidden(?:\s|=|>)/, 'the scaffold starts hidden while rows are present');
  const chapterPanel = rendered.html.match(/<section\b(?=[^>]*\bdata-owner-series-chapters(?:\s|=|>))[^>]*>([\s\S]*?)<\/section>/i);
  assert.ok(chapterPanel, 'the server renders the reusable chapter panel');
  assert.match(chapterPanel[0], /\bhidden(?:\s|=|>)/i, 'the unselected panel starts hidden');
  assert.match(chapterPanel[1], /data-series-chapter-filters/);
  assert.match(chapterPanel[1], /data-chapter-search/);
  assert.match(chapterPanel[1], /data-chapter-membership/);
  assert.match(chapterPanel[1], /data-chapter-rows/);
  assert.doesNotMatch(chapterPanel[1], /data-chapter-row=/, 'no series is selected in the initial query');

  const saved = await app.api('/api/creador/perfil/', undefined, { method: 'GET' });
  const { surface } = await mountOwnerSeriesController({
    profile: saved.profile,
    links: saved.links,
    editableResources: saved.editableResources,
    claims: saved.claims,
    series: saved.series,
  });
  await seriesRow(surface, savedSeries.id).querySelector('[data-series-chapters]').dispatch('click');
  assert.equal(surface.seriesListView.hidden, true);
  assert.equal(surface.chapterRegion.hidden, false);
  assert.equal(surface.chapterRegion.querySelector('[data-chapter-search]'), surface.chapterSearch);
  assert.equal(chapterRow(surface, savedLink.placementId).querySelector('[data-chapter-remove]') !== null, true);
  assert.match(surface.chapterRegion.querySelector('[data-series-context-name]').textContent, /A Ruta visible/);
  assert.match(surface.chapterRegion.querySelector('[data-series-chapter-summary]').textContent, /1 capítulo guardado/);
  const publicLink = surface.chapterRegion.querySelector('[data-series-public]');
  assert.equal(publicLink.hidden, false);
  assert.match(publicLink.href, /\/c\/ana-series-live\/series\/ruta-visible\/$/);
});

test('una corrección tardía al crear queda vinculada a la serie recién creada', async () => {
  let release;
  let markStarted;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { markStarted = resolve; });
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: profile(),
    override: async (request) => {
      if (request.method === 'POST' && request.path === '/api/creador/series') {
        markStarted();
        await gate;
      }
      return undefined;
    },
  });

  await surface.seriesCreateOpen.dispatch('click');
  surface.seriesFormFields.name.value = 'Ruta nueva';
  surface.seriesFormFields.slug.value = 'ruta-nueva';
  surface.seriesFormFields.description.value = 'Descripción enviada';
  await surface.seriesFormFields.slug.dispatch('input');
  const firstSave = surface.seriesForm.dispatch('submit');
  await started;
  surface.seriesFormFields.description.value = 'Corrección tardía';
  await surface.seriesFormFields.description.dispatch('input');
  release();
  await firstSave;

  assert.equal(surface.seriesForm.hidden, false);
  assert.equal(surface.seriesFormFields.description.value, 'Corrección tardía');
  await submit(surface.seriesForm);

  const writesSent = writes(requests);
  assert.equal(writesSent.length, 2);
  assert.equal(writesSent[0].method, 'POST');
  assert.equal(writesSent[1].method, 'PATCH');
  assert.equal(writesSent[1].path, `/api/creador/series/${api.state.series[0].id}`);
  assert.equal(writesSent[1].body.version, 1);
  assert.equal(writesSent[1].body.profileVersion, 15);
  assert.equal(writesSent[1].body.description, 'Corrección tardía');
  assert.equal(api.state.series.length, 1, 'the late correction updates the created series instead of creating a duplicate');
  assert.equal(api.state.series[0].description, 'Corrección tardía');
});

test('publicar y cambiar el slug refresca los enlaces públicos de series en la vista activa', async () => {
  const draft = profile({ published: false, slug: 'ana-series' });
  const targetSeries = series('public-context', { slug: 'ruta-publica' });
  const link = chapter(0, [{ seriesId: targetSeries.id, position: 0 }]);
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: draft, links: [link], series: [targetSeries],
    override: (request, state) => {
      if (request.method === 'POST' && request.path === '/api/creador/perfil/publicar') {
        const before = state.profile.version;
        state.profile.published = true;
        state.profile.version += 1;
        return jsonResponse({ profile: { ...state.profile }, versionChanges: [
          { entity: 'profile', id: state.profile.id, before, after: state.profile.version },
       ] });
      }
      if (request.method === 'PUT' && request.path === '/api/creador/perfil') {
        const before = state.profile.version;
        state.profile.displayName = request.body.displayName;
        state.profile.slug = request.body.slug;
        state.profile.city = request.body.city;
        state.profile.country = request.body.country;
        state.profile.bio = request.body.bio;
        state.profile.programs = request.body.programs;
        state.profile.version += 1;
        return jsonResponse({ profile: { ...state.profile }, versionChanges: [
          { entity: 'profile', id: state.profile.id, before, after: state.profile.version },
       ] });
      }
      return undefined;
    },
  });

  assert.equal(seriesRow(surface, targetSeries.id).querySelectorAll('a')
    .some((anchor) => anchor.textContent === 'Abrir serie pública'), false, 'a draft series has no public link');
  await surface.publish.dispatch('click');
  await settle();

  const listPublicLink = seriesRow(surface, targetSeries.id).querySelectorAll('a')
    .find((anchor) => anchor.textContent === 'Abrir serie pública');
  assert.ok(listPublicLink, 'publication adds the public series action while the list is open');
  assert.equal(listPublicLink.href, '/c/ana-series/series/ruta-publica/');

  await seriesRow(surface, targetSeries.id).querySelector('[data-series-chapters]').dispatch('click');
  assert.equal(surface.chapterRegion.hidden, false);
  const editProfile = surface.root.querySelector('[data-owner-edit="datos"]');
  await editProfile.dispatch('click');
  const slug = surface.dataForm.elements.find(({ name }) => name === 'slug');
  slug.value = 'ana-cursos';
  await slug.dispatch('input');
  await surface.dataForm.dispatch('submit');
  await settle();

  assert.equal(api.state.profile.slug, 'ana-cursos');
  const refreshedListLink = seriesRow(surface, targetSeries.id).querySelectorAll('a')
    .find((anchor) => anchor.textContent === 'Abrir serie pública');
  assert.equal(refreshedListLink.href, '/c/ana-cursos/series/ruta-publica/');
  assert.equal(surface.chapterRegion.querySelector('[data-series-public]').href, '/c/ana-cursos/series/ruta-publica/');
  assert.match(surface.window.location.href, new RegExp(`serie=${targetSeries.id}`), 'the selected series query stays open after profile updates');
  assert.equal(requests.filter(({ path }) => path === '/api/creador/perfil/publicar').length, 1);
  assert.equal(requests.filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').length, 1);
});

test('al guardar desde la lista, el foco vuelve al buscador visible si el trigger se desconecta al renderizar', async () => {
  const existing = series('focus-series-list');
  const { surface } = await mountOwnerSeriesController({ profile: profile(), series: [existing] });
  const row = seriesRow(surface, existing.id);
  const trigger = row.querySelector('[data-series-edit]');
  const removeRow = row.remove.bind(row);
  row.remove = () => {
    // SurfaceElement does not propagate disconnection to descendants like a real DOM tree.
    trigger.isConnected = false;
    removeRow();
  };

  await trigger.dispatch('click');
  surface.seriesFormFields.description.value = 'Descripción actualizada';
  await surface.seriesFormFields.description.dispatch('input');
  await submit(surface.seriesForm);

  assert.equal(trigger.isConnected, false, 'the focused row action was replaced by the render');
  assert.equal(surface.chapterRegion.hidden, true);
  assert.equal(surface.document.activeElement, surface.seriesSearch, 'focus returns to the search in the visible list');
  assert.notEqual(surface.document.activeElement, surface.chapterSearch, 'the hidden chapter search is not focused');
  assert.equal(seriesRow(surface, existing.id).id, existing.id, 'the rebuilt row retains its public fragment ID');
});

test('un trigger desconectado dentro de capítulos usa el buscador de capítulos como fallback', async () => {
  const targetSeries = series('focus-series-chapters');
  const link = chapter(0, [{ seriesId: targetSeries.id, position: 0 }]);
  const { surface } = await mountOwnerSeriesController({
    profile: profile(), links: [link], series: [targetSeries], query: { serie: targetSeries.id },
  });
  const trigger = chapterRow(surface, link.placementId).querySelector('[data-chapter-move]');
  await trigger.dispatch('click');
  // Force the post-render native state; the test DOM keeps descendants connected after a parent removal.
  trigger.isConnected = false;
  await surface.moveForm.querySelector('[data-owner-cancel]').dispatch('click');

  assert.equal(surface.document.activeElement, surface.chapterSearch, 'focus follows the selected chapter view');
  assert.notEqual(surface.document.activeElement, surface.seriesSearch);
});

test('la búsqueda pasa de resultados a cero coincidencias y vuelve a mostrar las series', async () => {
  const seriesList = [series('search-a'), series('search-b')];
  const { surface, requests } = await mountOwnerSeriesController({ profile: profile(), series: seriesList });

  assert.equal(surface.seriesEmpty.hidden, true);
  surface.seriesSearch.value = 'sin-coincidencias';
  await surface.seriesSearch.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.equal(surface.seriesCount.textContent, '0 series');
  assert.equal(surface.seriesEmpty.hidden, false);
  assert.match(surface.seriesEmpty.textContent, /no hay series que coincidan/i);
  assert.equal(writes(requests).length, 0);

  surface.seriesSearch.value = 'ruta';
  await surface.seriesSearch.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.equal(surface.seriesCount.textContent, '2 series');
  assert.equal(surface.seriesEmpty.hidden, true);
  assert.equal(surface.seriesRows.length, 2);
  assert.equal(writes(requests).length, 0);
});

test('adoptar la comparación de una serie conserva la corrección y mantiene la guardia de salida', async () => {
  const existing = series('metadata-adopt');
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), series: [existing],
    override: (request, state) => {
      if (request.method !== 'PATCH') return undefined;
      state.profile.version += 1;
      state.series[0].version += 1;
      state.series[0].description = 'Descripción remota';
      return jsonResponse({ error: 'SERIES_CONFLICT' }, 409);
    },
  });

  await seriesRow(surface, existing.id).querySelector('[data-series-edit]').dispatch('click');
  surface.seriesFormFields.description.value = 'Corrección local';
  await surface.seriesFormFields.description.dispatch('input');
  await submit(surface.seriesForm);
  await surface.seriesFormConflict.querySelector('[data-owner-compare]').dispatch('click');
  await settle();
  await surface.seriesFormConflict.querySelector('[data-owner-adopt]').dispatch('click');
  assert.equal(surface.seriesFormFields.description.value, 'Corrección local');

  await surface.seriesForm.querySelector('[data-owner-cancel]').dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false, 'adoption does not mark the local correction as saved');
  assert.equal(surface.dialog.open, true);
  assert.equal(writes(requests).length, 1, 'canceling after adoption does not send a write');
});

test('adoptar el orden completo incorpora altas y bajas y conserva el destino pendiente', async () => {
  const targetSeries = series('membership-adopt');
  const a = chapter(0, [{ seriesId: targetSeries.id, position: 0 }]);
  const b = chapter(1, [{ seriesId: targetSeries.id, position: 10 }]);
  const c = chapter(2, [{ seriesId: targetSeries.id, position: 20 }]);
  const d = chapter(3);
  let firstMove = true;
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: profile(), links: [a, b, c, d], series: [targetSeries], query: { serie: targetSeries.id },
    override: (request, state) => {
      if (request.method !== 'POST' || !request.path.endsWith('/mover') || !firstMove) return undefined;
      firstMove = false;
      state.profile.version += 1;
      const serverA = state.links.find(({ placementId }) => placementId === a.placementId);
      const serverB = state.links.find(({ placementId }) => placementId === b.placementId);
      const serverC = state.links.find(({ placementId }) => placementId === c.placementId);
      const serverD = state.links.find(({ placementId }) => placementId === d.placementId);
      serverB.series = serverB.series.filter(({ seriesId }) => seriesId !== targetSeries.id);
      serverB.placementVersion += 1;
      serverD.series.push({ seriesId: targetSeries.id, position: 10 });
      serverD.placementVersion += 1;
      serverA.series.find(({ seriesId }) => seriesId === targetSeries.id).position = 0;
      serverC.series.find(({ seriesId }) => seriesId === targetSeries.id).position = 20;
      return jsonResponse({ error: 'SERIES_CONFLICT' }, 409);
    },
  });

  await chapterRow(surface, c.placementId).querySelector('[data-chapter-move]').dispatch('click');
  surface.targetPosition.value = '2';
  await surface.targetPosition.dispatch('input');
  await submit(surface.moveForm);
  await surface.moveConflict.querySelector('[data-owner-compare]').dispatch('click');
  await settle();
  await surface.moveConflict.querySelector('[data-owner-adopt]').dispatch('click');

  assert.equal(chapterRow(surface, b.placementId).querySelector('[data-chapter-add]') !== null, true);
  assert.equal(chapterRow(surface, b.placementId).querySelector('[data-chapter-remove]'), null);
  assert.equal(chapterRow(surface, d.placementId).querySelector('[data-chapter-remove]') !== null, true);
  assert.equal(chapterRow(surface, d.placementId).querySelector('[data-chapter-add]'), null);
  assert.equal(surface.targetPosition.value, '2', 'adoption preserves the requested destination');
  await surface.moveForm.querySelector('[data-owner-cancel]').dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false, 'adoption leaves the pending destination guarded');
  await surface.exitContinue.dispatch('click');

  await submit(surface.moveForm);
  const writesSent = writes(requests);
  assert.equal(writesSent.length, 2);
  assert.deepEqual(writesSent[1].body, {
    profileVersion: 15,
    seriesVersion: targetSeries.version,
    placementVersion: c.placementVersion,
    targetPosition: 2,
  });
  assert.equal(surface.moveForm.hidden, true, 'the second movement accepts the complete adopted membership map');
  const serverOrder = api.state.links
    .filter((link) => link.series.some(({ seriesId }) => seriesId === targetSeries.id))
    .sort((left, right) => left.series.find(({ seriesId }) => seriesId === targetSeries.id).position
      - right.series.find(({ seriesId }) => seriesId === targetSeries.id).position)
    .map(({ placementId }) => placementId);
  assert.deepEqual(serverOrder, [a.placementId, c.placementId, d.placementId]);
});

test('adoptar un snapshot con cambios fuera de la membresía actualiza profileVersion y placementVersion', async () => {
  const targetSeries = series('version-adopt');
  const a = chapter(0, [{ seriesId: targetSeries.id, position: 0 }]);
  const b = chapter(1, [{ seriesId: targetSeries.id, position: 10 }]);
  const c = chapter(2, [{ seriesId: targetSeries.id, position: 20 }]);
  let firstMove = true;
  const { surface, requests } = await mountOwnerSeriesController({
    profile: profile(), links: [a, b, c], series: [targetSeries], query: { serie: targetSeries.id },
    override: (request, state) => {
      if (request.method !== 'POST' || !request.path.endsWith('/mover') || !firstMove) return undefined;
      firstMove = false;
      state.profile.version += 1;
      const remoteTarget = state.links.find(({ placementId }) => placementId === c.placementId);
      remoteTarget.selectedForDirectory = !remoteTarget.selectedForDirectory;
      remoteTarget.placementVersion += 1;
      return jsonResponse({ error: 'SERIES_CONFLICT' }, 409);
    },
  });

  await chapterRow(surface, c.placementId).querySelector('[data-chapter-move]').dispatch('click');
  surface.targetPosition.value = '2';
  await surface.targetPosition.dispatch('input');
  await submit(surface.moveForm);
  await surface.moveConflict.querySelector('[data-owner-compare]').dispatch('click');
  await settle();
  await surface.moveConflict.querySelector('[data-owner-adopt]').dispatch('click');
  await submit(surface.moveForm);

  const moves = writes(requests).filter(({ method, path }) => method === 'POST' && path.endsWith('/mover'));
  assert.equal(moves.length, 2);
  assert.equal(moves[1].body.profileVersion, 15, 'the explicit snapshot adoption uses the current profile version');
  assert.equal(moves[1].body.seriesVersion, targetSeries.version, 'the series version remains tied to the adopted series');
  assert.equal(moves[1].body.placementVersion, c.placementVersion + 1, 'the target placement version comes from the full GET snapshot');
  assert.equal(surface.moveForm.hidden, true, 'the next movement succeeds instead of repeating the stale conflict');
});

test('adoptar una serie usa metadatos remotos al guardar una corrección local', async () => {
  const existing = series('identity-adopt');
  let firstPatch = true;
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: profile(), series: [existing],
    override: (request, state) => {
      if (request.method !== 'PATCH' || !firstPatch) return undefined;
      firstPatch = false;
      state.profile.version += 1;
      state.series[0].version += 1;
      state.series[0].name = 'Nombre remoto';
      state.series[0].slug = 'slug-remoto';
      state.series[0].description = 'Descripción remota';
      return jsonResponse({ error: 'SERIES_CONFLICT' }, 409);
    },
  });

  await seriesRow(surface, existing.id).querySelector('[data-series-edit]').dispatch('click');
  surface.seriesFormFields.description.value = 'Descripción local';
  await surface.seriesFormFields.description.dispatch('input');
  await submit(surface.seriesForm);
  await surface.seriesFormConflict.querySelector('[data-owner-compare]').dispatch('click');
  await settle();
  await surface.seriesFormConflict.querySelector('[data-owner-adopt]').dispatch('click');

  assert.equal(surface.seriesFormFields.name.value, 'Nombre remoto');
  assert.equal(surface.seriesFormFields.slug.value, 'slug-remoto');
  assert.equal(surface.seriesFormFields.description.value, 'Descripción local', 'the pending correction remains available to save');
  await submit(surface.seriesForm);

  const patches = writes(requests).filter(({ method }) => method === 'PATCH');
  assert.equal(patches.length, 2);
  assert.deepEqual(patches[1].body, {
    version: existing.version + 1,
    profileVersion: 15,
    name: 'Nombre remoto',
    slug: 'slug-remoto',
    description: 'Descripción local',
  });
  assert.equal(api.state.series[0].name, 'Nombre remoto');
  assert.equal(api.state.series[0].slug, 'slug-remoto');
  assert.equal(api.state.series[0].description, 'Descripción local');
});

test('adoptar un snapshot incorpora un capítulo remoto antes de validar el siguiente recibo', async () => {
  const targetSeries = series('new-placement-adopt');
  const a = chapter(0, [{ seriesId: targetSeries.id, position: 0 }]);
  const b = chapter(1, [{ seriesId: targetSeries.id, position: 10 }]);
  const c = chapter(2, [{ seriesId: targetSeries.id, position: 20 }]);
  const added = chapter(3, [{ seriesId: targetSeries.id, position: 30 }]);
  let firstMove = true;
  const { surface, api, requests } = await mountOwnerSeriesController({
    profile: profile(), links: [a, b, c], series: [targetSeries], query: { serie: targetSeries.id },
    override: (request, state) => {
      if (request.method !== 'POST' || !request.path.endsWith('/mover') || !firstMove) return undefined;
      firstMove = false;
      state.profile.version += 1;
      state.links.push(added);
      return jsonResponse({ error: 'SERIES_CONFLICT' }, 409);
    },
  });

  await chapterRow(surface, c.placementId).querySelector('[data-chapter-move]').dispatch('click');
  surface.targetPosition.value = '2';
  await surface.targetPosition.dispatch('input');
  await submit(surface.moveForm);
  await surface.moveConflict.querySelector('[data-owner-compare]').dispatch('click');
  await settle();
  await surface.moveConflict.querySelector('[data-owner-adopt]').dispatch('click');

  assert.ok(chapterRow(surface, added.placementId), 'the new placement appears after adopting the complete GET snapshot');
  await submit(surface.moveForm);
  const moves = writes(requests).filter(({ method, path }) => method === 'POST' && path.endsWith('/mover'));
  assert.equal(moves.length, 2);
  assert.equal(moves[1].body.profileVersion, 15);
  assert.equal(surface.moveForm.hidden, true, 'a successful receipt is accepted against the adopted membership map');
  assert.equal(api.state.links.length, 4);
  assert.ok(api.state.links.find(({ placementId }) => placementId === added.placementId)
    .series.some(({ seriesId }) => seriesId === targetSeries.id));
});

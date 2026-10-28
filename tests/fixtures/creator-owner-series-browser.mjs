import {
  createOwnerLinksSurface,
  mountOwnerLinks,
  jsonResponse,
  settle,
  writes,
} from './creator-owner-links-browser.mjs';
import { SurfaceElement } from './creator-owner-browser-dom.mjs';

function appendForm(parent, name, controls, extra = []) {
  const form = new SurfaceElement({ tagName: 'FORM', dataset: { ownerForm: name }, lists: [...controls, ...extra] });
  form.elements = [...controls, ...extra.filter((element) => ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName))];
  form.hidden = true;
  for (const control of form.elements) {
    control.form = form;
  }
  parent.append(form);
  return form;
}

function input(name, value = '', type = 'text', dataset = {}) {
  return new SurfaceElement({ tagName: 'INPUT', name, value, type, dataset });
}

function ownerDto(state) {
  const liveSeriesIds = new Set(state.series.map(({ id }) => id));
  return {
    profile: structuredClone(state.profile),
    links: state.links.map((link) => ({
      ...structuredClone(link),
      series: (link.series ?? []).filter(({ seriesId }) => liveSeriesIds.has(seriesId)),
    })),
    editableResources: structuredClone(state.editableResources),
    claims: structuredClone(state.claims),
    series: structuredClone(state.series),
  };
}

function makeSeriesRow(series) {
  const row = new SurfaceElement({ tagName: 'LI', dataset: { ownerSeriesRow: series.id, seriesId: series.id } });
  const edit = new SurfaceElement({ tagName: 'BUTTON', dataset: { seriesEdit: '', seriesId: series.id }, textContent: `Editar ${series.name}` });
  const chapters = new SurfaceElement({ tagName: 'A', dataset: { seriesChapters: '', seriesId: series.id }, textContent: `Gestionar capítulos de ${series.name}` });
  const remove = new SurfaceElement({ tagName: 'BUTTON', dataset: { seriesDelete: '', seriesId: series.id }, textContent: `Eliminar ${series.name}` });
  row.append(edit, chapters, remove);
  return row;
}

function makeChapterRow(link, seriesId) {
  const membership = link.series.find((item) => item.seriesId === seriesId);
  const row = new SurfaceElement({ tagName: 'LI', dataset: { chapterRow: link.placementId, placementId: link.placementId }, textContent: `${link.title} ${link.url}` });
  row.link = link;
  row.membership = membership;
  if (membership) {
    const move = new SurfaceElement({ tagName: 'BUTTON', dataset: { chapterMove: '', placementId: link.placementId }, textContent: `Mover ${link.title}` });
    const remove = new SurfaceElement({ tagName: 'BUTTON', dataset: { chapterRemove: '', placementId: link.placementId }, textContent: `Quitar ${link.title}` });
    row.append(move, remove);
  } else {
    const add = new SurfaceElement({ tagName: 'BUTTON', dataset: { chapterAdd: '', placementId: link.placementId }, textContent: `Agregar ${link.title}` });
    row.append(add);
  }
  return row;
}

function createOwnerSeriesSurface({ profile, links = [], editableResources = [], claims = [], series = [], query = {} } = {}) {
  const selectedSeriesId = query.serie ?? '';
  const surface = createOwnerLinksSurface({ profile, links, editableResources, series, query: { vista: 'series', ...query } });
  wireHistory(surface);
  const initial = surface.document.getElementById('creator-owner-data');
  initial.textContent = JSON.stringify({
    profile, links, editableResources, claims, series,
    csrfToken: 'csrf-a', sessionBinding: 'a'.repeat(64),
  });

  const navigation = new SurfaceElement({ dataset: { ownerSeriesNavigation: '' } });
  const seriesRegion = new SurfaceElement({ dataset: { ownerSeries: '' } });
  const seriesFilter = new SurfaceElement({ tagName: 'FORM', dataset: { seriesFilters: '' } });
  const seriesSearch = input('buscarSeries', String(query.buscarSeries ?? ''), 'search', { seriesSearch: '' });
  const seriesPage = input('paginaSeries', String(query.paginaSeries ?? '1'), 'hidden');
  const seriesApply = new SurfaceElement({ tagName: 'BUTTON', type: 'submit', textContent: 'Aplicar búsqueda' });
  seriesSearch.form = seriesFilter;
  seriesPage.form = seriesFilter;
  seriesFilter.elements = [seriesSearch, seriesPage];
  seriesFilter.append(seriesSearch, seriesPage, seriesApply);
  const normalizedSeriesSearch = String(query.buscarSeries ?? '').trim().toLocaleLowerCase();
  const matchingSeries = series.filter((item) => `${item.name} ${item.slug}`.toLocaleLowerCase().includes(normalizedSeriesSearch))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  const seriesPageNumber = Math.max(1, Number.parseInt(String(query.paginaSeries ?? '1'), 10) || 1);
  const seriesPageRows = matchingSeries.slice((seriesPageNumber - 1) * 25, seriesPageNumber * 25);
  const seriesList = new SurfaceElement({ tagName: 'UL', dataset: { ownerSeriesList: '' }, lists: seriesPageRows.map(makeSeriesRow) });
  const seriesCount = new SurfaceElement({ dataset: { seriesCount: '' }, textContent: `${matchingSeries.length} series` });
  const createSeries = new SurfaceElement({ tagName: 'BUTTON', dataset: { seriesCreateOpen: '' }, textContent: 'Crear serie' });
  seriesRegion.append(seriesFilter, seriesCount, createSeries, seriesList);

  const chapterRegion = new SurfaceElement({ dataset: { ownerSeriesChapters: '' } });
  chapterRegion.hidden = !selectedSeriesId;
  const chapterFilter = new SurfaceElement({ tagName: 'FORM', dataset: { chapterFilters: '' } });
  const chapterSearch = input('buscarCapitulos', String(query.buscarCapitulos ?? ''), 'search', { chapterSearch: '' });
  const membershipFilter = new SurfaceElement({ tagName: 'SELECT', name: 'pertenencia', value: String(query.pertenencia ?? 'todos') });
  const chapterPage = input('paginaCapitulos', String(query.paginaCapitulos ?? '1'), 'hidden');
  for (const control of [chapterSearch, membershipFilter, chapterPage]) control.form = chapterFilter;
  chapterFilter.elements = [chapterSearch, membershipFilter, chapterPage];
  chapterFilter.append(chapterSearch, membershipFilter, chapterPage);
  const back = new SurfaceElement({ tagName: 'A', dataset: { seriesBack: '' }, textContent: 'Volver a series' });
  const chapterList = new SurfaceElement({ tagName: 'OL', dataset: { chapterRows: '' } });
  const selected = series.find(({ id }) => id === selectedSeriesId);
  if (selected) {
    const normalizedChapterSearch = String(query.buscarCapitulos ?? '').trim().toLocaleLowerCase();
    const membershipFilter = String(query.pertenencia ?? 'todos');
    const chapterMatches = links.filter((link) => {
      const belongs = link.series.some((item) => item.seriesId === selectedSeriesId);
      if (membershipFilter === 'incluidos' && !belongs) return false;
      if (membershipFilter === 'disponibles' && belongs) return false;
      return `${link.title} ${link.url}`.toLocaleLowerCase().includes(normalizedChapterSearch);
    }).sort((left, right) => left.title.localeCompare(right.title) || left.placementId.localeCompare(right.placementId));
    const chapterPageNumber = Math.max(1, Number.parseInt(String(query.paginaCapitulos ?? '1'), 10) || 1);
    const pageRows = chapterMatches.slice((chapterPageNumber - 1) * 25, chapterPageNumber * 25);
    for (const link of pageRows) chapterList.append(makeChapterRow(link, selectedSeriesId));
  }
  chapterRegion.append(back, chapterFilter, chapterList);
  surface.root.append(navigation, seriesRegion, chapterRegion);

  const seriesFormName = input('name');
  const seriesFormSlug = input('slug');
  const seriesFormDescription = new SurfaceElement({ tagName: 'TEXTAREA', name: 'description', value: '' });
  const seriesFormStatus = new SurfaceElement({ dataset: { ownerFormStatus: 'serie' } });
  const seriesFormSave = new SurfaceElement({ tagName: 'BUTTON', type: 'submit', textContent: 'Guardar serie' });
  const seriesFormCancel = new SurfaceElement({ tagName: 'BUTTON', dataset: { ownerCancel: '' }, textContent: 'Cancelar' });
  const seriesFormConflict = makeConflict('serie');
  const seriesForm = appendForm(surface.dialog, 'serie', [seriesFormName, seriesFormSlug, seriesFormDescription, seriesFormStatus], [seriesFormConflict, seriesFormSave, seriesFormCancel]);

  const moveContext = new SurfaceElement({ dataset: { chapterMoveContext: '' } });
  const targetPosition = input('targetPosition', '1', 'number');
  targetPosition.setAttribute('min', '1');
  const moveStatus = new SurfaceElement({ dataset: { ownerFormStatus: 'mover-capitulo' } });
  const moveSuggestion = new SurfaceElement({ tagName: 'BUTTON', dataset: { chapterMoveSuggestion: '' } });
  const moveSuggestionShell = new SurfaceElement({ dataset: { chapterMoveSuggestionShell: '' }, lists: [moveSuggestion] });
  const moveSave = new SurfaceElement({ tagName: 'BUTTON', type: 'submit', textContent: 'Guardar posición' });
  const moveCancel = new SurfaceElement({ tagName: 'BUTTON', dataset: { ownerCancel: '' }, textContent: 'Cancelar' });
  const moveConflict = makeConflict('mover-capitulo');
  const moveForm = appendForm(surface.dialog, 'mover-capitulo', [targetPosition, moveStatus], [moveContext, moveSuggestionShell, moveConflict, moveSave, moveCancel]);

  const addChapterStatus = new SurfaceElement({ dataset: { ownerFormStatus: 'capitulo' } });
  const reconcileRetry = new SurfaceElement({ tagName: 'BUTTON', dataset: { seriesReconcileRetry: '' }, textContent: 'Volver a consultar la serie' });
  reconcileRetry.hidden = true;
  chapterRegion.append(addChapterStatus, reconcileRetry);
  surface.ownerSeries = seriesRegion;
  surface.seriesList = seriesList;
  surface.seriesFilter = seriesFilter;
  surface.seriesSearch = seriesSearch;
  surface.seriesApply = seriesApply;
  surface.seriesCreateOpen = createSeries;
  surface.seriesForm = seriesForm;
  surface.seriesFormFields = { name: seriesFormName, slug: seriesFormSlug, description: seriesFormDescription };
  surface.seriesFormStatus = seriesFormStatus;
  surface.seriesFormSave = seriesFormSave;
  surface.seriesFormConflict = seriesFormConflict;
  surface.seriesRows = [...seriesList.querySelectorAll('[data-owner-series-row]')];
  surface.chapterRegion = chapterRegion;
  surface.chapterRows = chapterList.querySelectorAll('[data-chapter-row]');
  surface.chapterSearch = chapterSearch;
  surface.membershipFilter = membershipFilter;
  surface.targetPosition = targetPosition;
  surface.moveForm = moveForm;
  surface.moveContext = moveContext;
  surface.moveStatus = moveStatus;
  surface.moveSuggestion = moveSuggestion;
  surface.moveSuggestionShell = moveSuggestionShell;
  surface.moveSave = moveSave;
  surface.addChapterStatus = addChapterStatus;
  surface.reconcileRetry = reconcileRetry;
  for (const element of [
    ...seriesRegion.descendants(), ...chapterRegion.descendants(), ...surface.dialog.descendants(),
  ]) element.ownerDocument = surface.document;
  return Object.assign(surface, { moveConflict });
}

function wireHistory(surface) {
  const { window } = surface;
  const listeners = new Map();
  let entries = [window.location.href];
  let index = 0;
  window.addEventListener = (type, listener) => {
    const registered = listeners.get(type) ?? [];
    registered.push(listener);
    listeners.set(type, registered);
  };
  window.dispatchEvent = (event) => {
    for (const listener of listeners.get(event.type) ?? []) listener(event);
  };
  window.history.pushState = (_state, _title, href) => {
    entries = entries.slice(0, index + 1);
    entries.push(new URL(String(href), window.location.href).href);
    index = entries.length - 1;
    surface.historyCalls.push({ method: 'pushState', url: String(href) });
    window.location.href = entries[index];
  };
  window.history.replaceState = (_state, _title, href) => {
    entries[index] = new URL(String(href), window.location.href).href;
    surface.historyCalls.push({ method: 'replaceState', url: String(href) });
    window.location.href = entries[index];
  };
  window.history.back = () => {
    if (index === 0) return;
    index -= 1;
    window.location.href = entries[index];
    window.dispatchEvent({ type: 'popstate' });
  };
  window.history.forward = () => {
    if (index + 1 >= entries.length) return;
    index += 1;
    window.location.href = entries[index];
    window.dispatchEvent({ type: 'popstate' });
  };
}

function makeConflict(name) {
  const copy = new SurfaceElement({ dataset: { ownerConflictCopy: '' } });
  const compare = new SurfaceElement({ tagName: 'BUTTON', dataset: { ownerCompare: '' }, textContent: 'Comparar con lo guardado' });
  const comparison = new SurfaceElement({ dataset: { ownerComparison: '' } });
  comparison.hidden = true;
  const adopt = new SurfaceElement({ tagName: 'BUTTON', dataset: { ownerAdopt: '' }, textContent: 'Usar lo guardado' });
  adopt.hidden = true;
  const conflict = new SurfaceElement({ dataset: { ownerConflict: '', seriesConflict: name }, lists: [copy, compare, comparison, adopt] });
  conflict.hidden = true;
  return conflict;
}

function cloneLink(link) {
  return { ...structuredClone(link), series: (link.series ?? []).map((item) => ({ ...item })) };
}

function createSeriesApi(surface, { override } = {}) {
  const state = {
    profile: structuredClone(surface.profile),
    links: surface.links.map(cloneLink),
    editableResources: structuredClone(surface.editableResources),
    claims: [],
    series: structuredClone(surface.series),
  };
  let sessionResponse = { status: 200, body: { csrfToken: 'csrf-refreshed' } };

  function snapshot() { return ownerDto(state); }
  function receipt(entity, id, before, after) { return { entity, id, before, after }; }

  async function fetch(request) {
    const intercepted = await override?.(request, state, snapshot);
    if (intercepted instanceof Response) return intercepted;
    if (request.path === '/api/creador/sesion') return jsonResponse(sessionResponse.body, sessionResponse.status);
    if (request.path === '/api/creador/perfil') return jsonResponse(snapshot());

    if (request.method === 'POST' && request.path === '/api/creador/series') {
      if (request.body.profileVersion !== state.profile.version) return jsonResponse({ error: 'PROFILE_CONFLICT' }, 409);
      const id = `series-created-${state.series.length + 1}`;
      const before = state.profile.version;
      const series = { id, name: request.body.name, slug: request.body.slug, ...(request.body.description ? { description: request.body.description } : {}), version: 1 };
      state.profile.version += 1;
      state.series.push(series);
      return jsonResponse({ series, profileVersion: state.profile.version, versionChanges: [
        receipt('profile', state.profile.id, before, state.profile.version),
        receipt('series', id, 0, 1),
      ] }, 201);
    }

    const seriesMeta = request.path.match(/^\/api\/creador\/series\/([^/]+)$/);
    if (seriesMeta && request.method === 'PATCH') {
      const series = state.series.find(({ id }) => id === decodeURIComponent(seriesMeta[1]));
      if (!series) return jsonResponse({ error: 'SERIES_NOT_FOUND' }, 404);
      if (request.body.version !== series.version || request.body.profileVersion !== state.profile.version) return jsonResponse({ error: 'SERIES_CONFLICT' }, 409);
      const beforeProfile = state.profile.version;
      const beforeSeries = series.version;
      for (const key of ['name', 'slug', 'description']) if (Object.hasOwn(request.body, key)) series[key] = request.body[key];
      state.profile.version += 1;
      series.version += 1;
      return jsonResponse({ series: { ...series }, profileVersion: state.profile.version, versionChanges: [
        receipt('profile', state.profile.id, beforeProfile, state.profile.version),
        receipt('series', series.id, beforeSeries, series.version),
      ] });
    }
    if (seriesMeta && request.method === 'DELETE') {
      const index = state.series.findIndex(({ id }) => id === decodeURIComponent(seriesMeta[1]));
      if (index < 0) return jsonResponse({ error: 'SERIES_NOT_FOUND' }, 404);
      if (request.body.version !== state.series[index].version) return jsonResponse({ error: 'SERIES_CONFLICT' }, 409);
      if (request.body.profileVersion !== state.profile.version) return jsonResponse({ error: 'PROFILE_CONFLICT' }, 409);
      const before = state.profile.version;
      state.series.splice(index, 1);
      state.profile.version += 1;
      return new Response(null, { status: 204, headers: { 'Creator-Write-Versions': JSON.stringify([receipt('profile', state.profile.id, before, state.profile.version)]) } });
    }

    const chapter = request.path.match(/^\/api\/creador\/series\/([^/]+)\/capitulos\/([^/]+)(?:\/(mover))?$/);
    if (chapter) {
      const seriesId = decodeURIComponent(chapter[1]);
      const placementId = decodeURIComponent(chapter[2]);
      const moving = chapter[3] === 'mover';
      const series = state.series.find(({ id }) => id === seriesId);
      const link = state.links.find(({ placementId: id }) => id === placementId);
      if (!series) return jsonResponse({ error: 'SERIES_NOT_FOUND' }, 404);
      if (!link) return jsonResponse({ error: 'PLACEMENT_NOT_FOUND' }, 404);
      if (request.method === 'POST' && moving) return moveChapter(state, series, link, request.body);
      if (request.body.profileVersion !== state.profile.version) return jsonResponse({ error: 'PROFILE_CONFLICT' }, 409);
      const membership = link.series.find((item) => item.seriesId === seriesId);
      if (request.method === 'PUT') {
        if (membership) return jsonResponse({ status: 200, versionChanges: [] });
        const beforeProfile = state.profile.version;
        const beforePlacement = link.placementVersion;
        const position = state.links.flatMap((candidate) => candidate.series)
          .filter((item) => item.seriesId === seriesId)
          .reduce((max, item) => Math.max(max, item.position), -10) + 10;
        link.series.push({ seriesId, position });
        link.placementVersion += 1;
        state.profile.version += 1;
        return jsonResponse({ status: 200, versionChanges: [
          receipt('profile', state.profile.id, beforeProfile, state.profile.version),
          receipt('placement', link.placementId, beforePlacement, link.placementVersion),
        ] });
      }
      if (request.method === 'DELETE') {
        if (!membership) return jsonResponse({ error: 'SERIES_MEMBERSHIP_NOT_FOUND' }, 404);
        const beforeProfile = state.profile.version;
        const beforePlacement = link.placementVersion;
        link.series = link.series.filter((item) => item.seriesId !== seriesId);
        link.placementVersion += 1;
        state.profile.version += 1;
        return new Response(null, { status: 204, headers: { 'Creator-Write-Versions': JSON.stringify([
          receipt('profile', state.profile.id, beforeProfile, state.profile.version),
          receipt('placement', link.placementId, beforePlacement, link.placementVersion),
        ]) } });
      }
    }
    return jsonResponse({ error: 'NOT_FOUND', path: request.path, method: request.method }, 404);
  }

  function moveChapter(current, series, target, body) {
    if (!target.series.some(({ seriesId }) => seriesId === series.id)) return jsonResponse({ error: 'SERIES_MEMBERSHIP_NOT_FOUND' }, 404);
    if (body.profileVersion !== current.profile.version || body.seriesVersion !== series.version
      || body.placementVersion !== target.placementVersion) return jsonResponse({ error: 'SERIES_CONFLICT' }, 409);
    const members = current.links.filter((link) => link.series.some(({ seriesId }) => seriesId === series.id))
      .sort((left, right) => left.series.find(({ seriesId }) => seriesId === series.id).position
        - right.series.find(({ seriesId }) => seriesId === series.id).position
        || left.placementId.localeCompare(right.placementId));
    const currentIndex = members.findIndex(({ placementId }) => placementId === target.placementId);
    const ordinal = body.targetPosition;
    if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > members.length) return jsonResponse({ error: 'INVALID_TARGET_POSITION' }, 422);
    if (ordinal === currentIndex + 1) return jsonResponse({ links: [ownerDto(current).links.find(({ placementId }) => placementId === target.placementId)], versionChanges: [] });
    const ordered = [...members];
    ordered.splice(currentIndex, 1);
    ordered.splice(ordinal - 1, 0, target);
    const beforeMemberships = new Map(members.map((link) => [link.placementId, link.series.find(({ seriesId }) => seriesId === series.id).position]));
    const changed = [];
    ordered.forEach((link, index) => {
      const position = index * 10;
      if (beforeMemberships.get(link.placementId) === position) return;
      link.series = link.series.map((item) => item.seriesId === series.id ? { ...item, position } : item);
      link.placementVersion += 1;
      changed.push(link);
    });
    const beforeProfile = current.profile.version;
    current.profile.version += 1;
    const dto = ownerDto(current).links;
    const returned = new Map([[target.placementId, dto.find(({ placementId }) => placementId === target.placementId)]]);
    for (const changedLink of changed) returned.set(changedLink.placementId, dto.find(({ placementId }) => placementId === changedLink.placementId));
    const versionChanges = [receipt('profile', current.profile.id, beforeProfile, current.profile.version),
      ...changed.map((link) => receipt('placement', link.placementId, link.placementVersion - 1, link.placementVersion))];
    return jsonResponse({ links: [...returned.values()], versionChanges });
  }

  function setSession(result) { sessionResponse = result; }
  return { fetch, snapshot, state, setSession };
}

export async function mountOwnerSeriesController({ profile, links = [], editableResources = [], claims = [], series = [], query = {}, override } = {}) {
  const surface = createOwnerSeriesSurface({ profile, links, editableResources, claims, series, query });
  const api = createSeriesApi(surface, { override });
  const requests = await mountOwnerLinks({ surface, fetch: api.fetch });
  return { surface, api, requests, writes, settle };
}

export { createOwnerSeriesSurface, createSeriesApi, jsonResponse, settle, writes };

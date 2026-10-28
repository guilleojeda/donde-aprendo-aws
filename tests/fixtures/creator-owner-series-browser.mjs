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

function normalizeSearch(value) {
  return String(value).trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}

function ownerSeriesHref(query) {
  const params = new URLSearchParams();
  params.set('vista', 'series');
  if (query.buscarSeries) params.set('buscarSeries', query.buscarSeries);
  params.set('paginaSeries', String(query.paginaSeries));
  if (query.serie) params.set('serie', query.serie);
  if (query.buscarCapitulos) params.set('buscarCapitulos', query.buscarCapitulos);
  if (query.pertenencia !== 'todos') params.set('pertenencia', query.pertenencia);
  if (query.serie) params.set('paginaCapitulos', String(query.paginaCapitulos));
  return `/cuenta/?${params.toString()}`;
}

function makeSeriesRow(series, profile, visibleCount, query) {
  const row = new SurfaceElement({ tagName: 'LI', dataset: { ownerSeriesRow: series.id, seriesId: series.id } });
  row.className = 'creator-owner__series-row';
  row.setAttribute('id', series.id);
  const copy = new SurfaceElement({ tagName: 'DIV', textContent: '' });
  copy.className = 'creator-owner__series-copy';
  copy.append(
    new SurfaceElement({ tagName: 'H3', textContent: series.name }),
    new SurfaceElement({ tagName: 'P', textContent: series.slug }),
    new SurfaceElement({ tagName: 'P', textContent: `${visibleCount} ${visibleCount === 1 ? 'capítulo visible' : 'capítulos visibles'}` }),
  );
  const actions = new SurfaceElement({ tagName: 'DIV' });
  actions.className = 'creator-owner__series-actions';
  const edit = new SurfaceElement({ tagName: 'BUTTON', type: 'button', dataset: { seriesEdit: '', seriesId: series.id }, textContent: 'Editar' });
  const chapters = new SurfaceElement({ tagName: 'A', dataset: { seriesChapters: '', seriesId: series.id }, textContent: 'Gestionar capítulos' });
  chapters.href = ownerSeriesHref({ ...query, serie: series.id, buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1 });
  const remove = new SurfaceElement({ tagName: 'BUTTON', type: 'button', dataset: { seriesDelete: '', seriesId: series.id }, textContent: 'Eliminar' });
  actions.append(edit, chapters, remove);
  if (profile?.published && !profile.hidden && visibleCount > 0) {
    const publicLink = new SurfaceElement({ tagName: 'A', textContent: 'Abrir serie pública' });
    publicLink.href = `/c/${encodeURIComponent(profile.slug)}/series/${encodeURIComponent(series.slug)}/`;
    actions.append(publicLink);
  }
  row.append(copy, actions);
  return row;
}

function makeChapterRow(link, seriesId, completeOrder) {
  const membership = link.series.find((item) => item.seriesId === seriesId);
  const row = new SurfaceElement({ tagName: 'LI', dataset: { chapterRow: link.placementId, placementId: link.placementId } });
  row.className = 'creator-owner__chapter';
  const copy = new SurfaceElement({ tagName: 'DIV' });
  copy.className = 'creator-owner__chapter-copy';
  copy.append(new SurfaceElement({ tagName: 'H4', textContent: link.title }));
  const url = new SurfaceElement({ tagName: 'A', textContent: link.url });
  url.href = link.url;
  url.target = '_blank';
  url.rel = 'noopener noreferrer';
  copy.append(url);
  if (membership) {
    const ordinal = completeOrder.findIndex(({ placementId }) => placementId === link.placementId) + 1;
    copy.append(new SurfaceElement({ tagName: 'P', textContent: `Incluido en la posición ${ordinal} de ${completeOrder.length}` }));
  } else copy.append(new SurfaceElement({ tagName: 'P', textContent: 'Disponible para agregar' }));
  if (link.hidden) copy.append(new SurfaceElement({ tagName: 'SPAN', textContent: 'Oculto en catálogo' }));
  const actions = new SurfaceElement({ tagName: 'DIV' });
  actions.className = 'creator-owner__chapter-actions';
  if (membership) {
    actions.append(
      new SurfaceElement({ tagName: 'BUTTON', type: 'button', dataset: { chapterMove: '', placementId: link.placementId }, textContent: 'Mover capítulo' }),
      new SurfaceElement({ tagName: 'BUTTON', type: 'button', dataset: { chapterRemove: '', placementId: link.placementId }, textContent: 'Quitar capítulo' }),
    );
  } else actions.append(new SurfaceElement({ tagName: 'BUTTON', type: 'button', dataset: { chapterAdd: '', placementId: link.placementId }, textContent: 'Agregar capítulo' }));
  row.append(copy, actions);
  return row;
}

function pagination(query, page, pageCount, attribute) {
  const nav = new SurfaceElement({ tagName: 'NAV', dataset: { [attribute]: '' } });
  const label = new SurfaceElement({ tagName: 'SPAN', textContent: `Página ${page} de ${pageCount}` });
  nav.append(label);
  const pageQueryKey = attribute === 'seriesPagination' ? 'paginaSeries' : 'paginaCapitulos';
  const pageDataKey = attribute === 'seriesPagination' ? 'seriesPage' : 'seriesChapterPage';
  const add = (text, nextPage) => {
    const link = new SurfaceElement({ tagName: 'A', dataset: { [pageDataKey]: '' }, textContent: text });
    link.href = ownerSeriesHref({ ...query, [pageQueryKey]: nextPage });
    nav.append(link);
  };
  if (page > 1) add('Anterior', page - 1);
  if (page < pageCount) add('Siguiente', page + 1);
  return nav;
}

function createOwnerSeriesSurface({ profile, links = [], editableResources = [], claims = [], series = [], query = {} } = {}) {
  const initialQuery = {
    buscarSeries: query.buscarSeries ?? '', paginaSeries: Number(query.paginaSeries ?? 1),
    serie: query.serie ?? '', buscarCapitulos: query.buscarCapitulos ?? '',
    pertenencia: query.pertenencia ?? 'todos', paginaCapitulos: Number(query.paginaCapitulos ?? 1),
  };
  const surface = createOwnerLinksSurface({ profile, links, editableResources, series, query: { vista: 'series', ...query } });
  wireHistory(surface);
  const initial = surface.document.getElementById('creator-owner-data');
  initial.textContent = JSON.stringify({
    profile, links, editableResources, claims, series,
    csrfToken: 'csrf-a', sessionBinding: 'a'.repeat(64),
  });

  const seriesRegion = new SurfaceElement({ dataset: { ownerSeries: '' } });
  seriesRegion.className = 'creator-owner__series';
  seriesRegion.setAttribute('aria-labelledby', 'owner-series-title');
  const seriesHeader = new SurfaceElement({ tagName: 'HEADER' });
  const seriesTitle = new SurfaceElement({ tagName: 'H2', textContent: 'Series' });
  seriesTitle.setAttribute('id', 'owner-series-title');
  const seriesCreate = new SurfaceElement({ tagName: 'BUTTON', type: 'button', dataset: { seriesCreateOpen: '' }, textContent: 'Crear serie' });
  seriesHeader.append(seriesTitle, seriesCreate);
  const listView = new SurfaceElement({ tagName: 'SECTION', dataset: { ownerSeriesListView: '' } });
  listView.className = 'creator-owner__series-list-view';
  listView.hidden = Boolean(initialQuery.serie);
  const seriesFilter = new SurfaceElement({ tagName: 'FORM', dataset: { seriesFilters: '' } });
  seriesFilter.setAttribute('method', 'get');
  seriesFilter.setAttribute('action', '/cuenta/');
  const seriesView = input('vista', 'series', 'hidden');
  const seriesSearch = input('buscarSeries', String(initialQuery.buscarSeries), 'search', { seriesSearch: '' });
  seriesSearch.setAttribute('id', 'owner-series-search');
  seriesSearch.setAttribute('autocomplete', 'off');
  const seriesSearchLabel = new SurfaceElement({ tagName: 'LABEL', textContent: 'Buscar series' });
  seriesSearchLabel.setAttribute('for', 'owner-series-search');
  const seriesPage = input('paginaSeries', String(initialQuery.paginaSeries), 'hidden');
  const seriesApply = new SurfaceElement({ tagName: 'BUTTON', type: 'submit', textContent: 'Aplicar búsqueda' });
  for (const control of [seriesView, seriesSearch, seriesPage]) control.form = seriesFilter;
  seriesFilter.elements = [seriesView, seriesSearch, seriesPage];
  seriesFilter.append(seriesView, seriesSearchLabel, seriesSearch, seriesPage, seriesApply);
  const normalizedSeriesSearch = normalizeSearch(initialQuery.buscarSeries);
  const matchingSeries = series.filter((item) => normalizeSearch(`${item.name} ${item.slug}`).includes(normalizedSeriesSearch))
    .sort((left, right) => left.name.localeCompare(right.name, 'es', { sensitivity: 'base' }) || left.id.localeCompare(right.id));
  const seriesPageCount = Math.max(1, Math.ceil(matchingSeries.length / 25));
  const seriesPageNumber = Math.min(seriesPageCount, Math.max(1, initialQuery.paginaSeries));
  const seriesPageRows = matchingSeries.slice((seriesPageNumber - 1) * 25, seriesPageNumber * 25);
  const seriesList = new SurfaceElement({ tagName: 'UL', dataset: { ownerSeriesList: '' } });
  for (const item of seriesPageRows) {
    const visibleCount = links.filter((link) => !link.hidden && link.series.some(({ seriesId }) => seriesId === item.id)).length;
    seriesList.append(makeSeriesRow(item, profile, visibleCount, initialQuery));
  }
  const seriesCount = new SurfaceElement({ dataset: { seriesCount: '' }, textContent: `${matchingSeries.length} series` });
  const seriesEmpty = new SurfaceElement({ tagName: 'P', dataset: { seriesEmpty: '' }, textContent: matchingSeries.length ? 'No hay series en esta página.' : 'No hay series que coincidan con la búsqueda.' });
  seriesEmpty.hidden = seriesPageRows.length > 0;
  const seriesPagination = pagination(initialQuery, seriesPageNumber, seriesPageCount, 'seriesPagination');
  const seriesStatus = new SurfaceElement({ tagName: 'P', dataset: { seriesWriteStatus: '' } });
  listView.append(seriesFilter, seriesCount, seriesList, seriesEmpty, seriesPagination, seriesStatus);
  seriesRegion.append(seriesHeader);

  const chapterRegion = new SurfaceElement({ tagName: 'SECTION', dataset: { ownerSeriesChapters: '' } });
  chapterRegion.className = 'creator-owner__chapter-view';
  chapterRegion.hidden = !initialQuery.serie;
  const selected = series.find(({ id }) => id === initialQuery.serie);
  const chapterHeader = new SurfaceElement({ tagName: 'HEADER' });
  const back = new SurfaceElement({ tagName: 'A', dataset: { seriesBack: '' }, textContent: 'Volver a series' });
  back.href = ownerSeriesHref({ ...initialQuery, serie: '', buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1 });
  const context = new SurfaceElement({ tagName: 'DIV' });
  const contextName = new SurfaceElement({ tagName: 'H3', dataset: { seriesContextName: '' }, textContent: selected?.name ?? '' });
  contextName.setAttribute('id', 'owner-series-chapters-title');
  const contextCopy = new SurfaceElement({ tagName: 'P', dataset: { seriesChapterSummary: '' }, textContent: '' });
  context.append(contextName, contextCopy);
  const contextEdit = new SurfaceElement({ tagName: 'BUTTON', type: 'button', dataset: { seriesEdit: '', seriesId: selected?.id ?? '' }, textContent: selected ? `Editar ${selected.name}` : 'Editar serie' });
  chapterHeader.append(back, context, contextEdit);
  const publicLink = new SurfaceElement({ tagName: 'A', dataset: { seriesPublic: '' }, textContent: 'Abrir serie pública' });
  const hasVisibleChapter = Boolean(selected && links.some((link) => !link.hidden
    && link.series.some(({ seriesId }) => seriesId === selected.id)));
  const publicPath = selected && profile?.published && !profile.hidden && hasVisibleChapter
    ? `/c/${encodeURIComponent(profile.slug)}/series/${encodeURIComponent(selected.slug)}/` : undefined;
  publicLink.hidden = !publicPath;
  if (publicPath) publicLink.href = publicPath;
  else publicLink.removeAttribute('href');
  chapterHeader.append(publicLink);
  const chapterFilter = new SurfaceElement({ tagName: 'FORM', dataset: { seriesChapterFilters: '' } });
  chapterFilter.setAttribute('method', 'get');
  chapterFilter.setAttribute('action', '/cuenta/');
  const chapterView = input('vista', 'series', 'hidden');
  const chapterSeries = input('serie', initialQuery.serie, 'hidden');
  const chapterSeriesSearch = input('buscarSeries', initialQuery.buscarSeries, 'hidden');
  const chapterSeriesPage = input('paginaSeries', String(initialQuery.paginaSeries), 'hidden');
  const chapterSearch = input('buscarCapitulos', String(initialQuery.buscarCapitulos), 'search', { chapterSearch: '' });
  chapterSearch.setAttribute('id', 'owner-chapter-search');
  chapterSearch.setAttribute('autocomplete', 'off');
  const chapterSearchLabel = new SurfaceElement({ tagName: 'LABEL', textContent: 'Buscar en tus enlaces' });
  chapterSearchLabel.setAttribute('for', 'owner-chapter-search');
  const membershipFilter = new SurfaceElement({ tagName: 'SELECT', name: 'pertenencia', value: String(initialQuery.pertenencia), dataset: { chapterMembership: '' } });
  membershipFilter.setAttribute('id', 'owner-chapter-membership');
  const membershipLabel = new SurfaceElement({ tagName: 'LABEL', textContent: 'Pertenencia' });
  membershipLabel.setAttribute('for', 'owner-chapter-membership');
  for (const [value, text] of [['todos', 'Todos los enlaces'], ['incluidos', 'Incluidos'], ['disponibles', 'Disponibles']]) {
    const option = new SurfaceElement({ tagName: 'OPTION', value, textContent: text });
    option.selected = value === initialQuery.pertenencia;
    membershipFilter.append(option);
  }
  const chapterPage = input('paginaCapitulos', String(initialQuery.paginaCapitulos), 'hidden');
  for (const control of [chapterView, chapterSeries, chapterSeriesSearch, chapterSeriesPage, chapterSearch, membershipFilter, chapterPage]) control.form = chapterFilter;
  chapterFilter.elements = [chapterView, chapterSeries, chapterSeriesSearch, chapterSeriesPage, chapterSearch, membershipFilter, chapterPage];
  chapterFilter.append(chapterView, chapterSeries, chapterSeriesSearch, chapterSeriesPage, chapterSearchLabel, chapterSearch, membershipLabel, membershipFilter, chapterPage);
  const chapterCount = new SurfaceElement({ tagName: 'P', dataset: { chapterCount: '' } });
  const chapterList = new SurfaceElement({ tagName: 'OL', dataset: { chapterRows: '' } });
  const chapterEmpty = new SurfaceElement({ tagName: 'P', dataset: { chapterEmpty: '' } });
  const chapterStatus = new SurfaceElement({ tagName: 'P', dataset: { seriesWriteStatus: '' } });
  chapterStatus.setAttribute('role', 'status');
  chapterStatus.setAttribute('aria-live', 'polite');
  const reconcileRetry = new SurfaceElement({ tagName: 'BUTTON', type: 'button', dataset: { seriesReconcileRetry: '' }, textContent: 'Volver a consultar la lista' });
  reconcileRetry.hidden = true;
  const normalizedChapterSearch = normalizeSearch(initialQuery.buscarCapitulos);
  const completeOrder = links.filter((link) => link.series.some(({ seriesId }) => seriesId === initialQuery.serie))
    .sort((left, right) => left.series.find(({ seriesId }) => seriesId === initialQuery.serie).position
      - right.series.find(({ seriesId }) => seriesId === initialQuery.serie).position
      || left.placementId.localeCompare(right.placementId));
  const chapterMatches = links.filter((link) => {
    const included = link.series.some(({ seriesId }) => seriesId === initialQuery.serie);
    if (initialQuery.pertenencia === 'incluidos' && !included) return false;
    if (initialQuery.pertenencia === 'disponibles' && included) return false;
    return !normalizedChapterSearch || normalizeSearch(`${link.title} ${link.url}`).includes(normalizedChapterSearch);
  }).sort((left, right) => left.title.localeCompare(right.title, 'es', { sensitivity: 'base' })
    || left.placementId.localeCompare(right.placementId));
  const chapterPageCount = Math.max(1, Math.ceil(chapterMatches.length / 25));
  const chapterPageNumber = Math.min(chapterPageCount, Math.max(1, initialQuery.paginaCapitulos));
  const chapterPageRows = chapterMatches.slice((chapterPageNumber - 1) * 25, chapterPageNumber * 25);
  for (const link of chapterPageRows) chapterList.append(makeChapterRow(link, initialQuery.serie, completeOrder));
  chapterCount.textContent = `${chapterMatches.length} ${chapterMatches.length === 1 ? 'coincidencia' : 'coincidencias'} de ${links.length} ${links.length === 1 ? 'enlace' : 'enlaces'}`;
  chapterEmpty.textContent = chapterMatches.length ? 'No hay enlaces en esta página.' : 'No hay enlaces que coincidan con esta búsqueda y pertenencia.';
  chapterEmpty.hidden = chapterPageRows.length > 0;
  contextCopy.textContent = `${completeOrder.length} ${completeOrder.length === 1 ? 'capítulo guardado' : 'capítulos guardados'} en el orden completo.`;
  const chapterPagination = pagination(initialQuery, chapterPageNumber, chapterPageCount, 'chapterPagination');
  chapterRegion.append(chapterHeader, chapterFilter, chapterCount, chapterList, chapterEmpty, chapterPagination, chapterStatus, reconcileRetry);
  seriesRegion.append(chapterRegion, listView);
  surface.root.append(seriesRegion);

  const seriesFormContext = new SurfaceElement({ tagName: 'P', dataset: { seriesFormContext: '' } });
  const seriesFormName = input('name', '', 'text', { seriesNameSuggestion: '' });
  seriesFormName.setAttribute('id', 'owner-series-name');
  seriesFormName.setAttribute('maxlength', '120');
  seriesFormName.setAttribute('required', '');
  const seriesFormSlug = input('slug', '', 'text', { seriesSlugSuggestion: '' });
  seriesFormSlug.setAttribute('id', 'owner-series-slug');
  seriesFormSlug.setAttribute('minlength', '3');
  seriesFormSlug.setAttribute('maxlength', '40');
  seriesFormSlug.setAttribute('pattern', '[a-z0-9]+(-[a-z0-9]+)*');
  seriesFormSlug.setAttribute('required', '');
  const seriesFormDescription = new SurfaceElement({ tagName: 'TEXTAREA', name: 'description', value: '' });
  seriesFormDescription.setAttribute('id', 'owner-series-description');
  seriesFormDescription.setAttribute('maxlength', '2000');
  const seriesFormStatus = new SurfaceElement({ dataset: { ownerFormStatus: 'serie' } });
  const seriesFormSave = new SurfaceElement({ tagName: 'BUTTON', type: 'submit', textContent: 'Guardar serie' });
  const seriesFormCancel = new SurfaceElement({ tagName: 'BUTTON', dataset: { ownerCancel: '' }, textContent: 'Cancelar' });
  const seriesFormConflict = makeConflict('serie');
  const seriesForm = appendForm(surface.dialog, 'serie', [seriesFormName, seriesFormSlug, seriesFormDescription, seriesFormStatus], [seriesFormContext, seriesFormConflict, seriesFormSave, seriesFormCancel]);
  seriesForm.dataset.seriesForm = '';

  const moveContext = new SurfaceElement({ dataset: { chapterMoveContext: '' } });
  moveContext.setAttribute('aria-live', 'polite');
  const targetPosition = input('targetPosition', '1', 'number');
  targetPosition.setAttribute('min', '1');
  const moveStatus = new SurfaceElement({ dataset: { ownerFormStatus: 'mover-capitulo' } });
  const moveSuggestion = new SurfaceElement({ tagName: 'BUTTON', dataset: { chapterMoveSuggestion: '' } });
  const moveSuggestionShell = new SurfaceElement({ dataset: { chapterMoveSuggestionShell: '' }, lists: [moveSuggestion] });
  const moveSave = new SurfaceElement({ tagName: 'BUTTON', type: 'submit', textContent: 'Guardar posición' });
  const moveCancel = new SurfaceElement({ tagName: 'BUTTON', dataset: { ownerCancel: '' }, textContent: 'Cancelar' });
  const moveConflict = makeConflict('mover-capitulo');
  const moveForm = appendForm(surface.dialog, 'mover-capitulo', [targetPosition, moveStatus], [moveContext, moveSuggestionShell, moveConflict, moveSave, moveCancel]);
  moveForm.dataset.chapterMoveForm = '';
  targetPosition.setAttribute('id', 'owner-chapter-target-position');
  targetPosition.setAttribute('step', '1');
  targetPosition.setAttribute('required', '');

  surface.ownerSeries = seriesRegion;
  surface.root.selectors['[data-owner-series-chapters] [data-series-write-status]'] = chapterStatus;
  surface.root.selectors['[data-owner-series-list-view] [data-series-write-status]'] = seriesStatus;
  surface.seriesListView = listView;
  surface.seriesList = seriesList;
  surface.seriesCount = seriesCount;
  surface.seriesEmpty = seriesEmpty;
  surface.seriesPagination = seriesPagination;
  surface.seriesPage = seriesPage;
  surface.seriesFilter = seriesFilter;
  surface.seriesSearch = seriesSearch;
  surface.seriesApply = seriesApply;
  surface.seriesCreateOpen = seriesCreate;
  surface.seriesForm = seriesForm;
  surface.seriesFormFields = { name: seriesFormName, slug: seriesFormSlug, description: seriesFormDescription };
  surface.seriesFormContext = seriesFormContext;
  surface.seriesFormStatus = seriesFormStatus;
  surface.seriesFormSave = seriesFormSave;
  surface.seriesFormConflict = seriesFormConflict;
  Object.defineProperty(surface, 'seriesRows', { get: () => seriesList.querySelectorAll('[data-owner-series-row]') });
  surface.chapterRegion = chapterRegion;
  Object.defineProperty(surface, 'chapterRows', { get: () => chapterList.querySelectorAll('[data-chapter-row]') });
  surface.chapterSearch = chapterSearch;
  surface.chapterCount = chapterCount;
  surface.chapterEmpty = chapterEmpty;
  surface.chapterPagination = chapterPagination;
  surface.chapterPage = chapterPage;
  surface.chapterBack = back;
  surface.membershipFilter = membershipFilter;
  surface.targetPosition = targetPosition;
  surface.moveForm = moveForm;
  surface.moveContext = moveContext;
  surface.moveStatus = moveStatus;
  surface.moveSuggestion = moveSuggestion;
  surface.moveSuggestionShell = moveSuggestionShell;
  surface.moveSave = moveSave;
  surface.addChapterStatus = chapterStatus;
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

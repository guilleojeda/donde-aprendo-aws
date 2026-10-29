import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCreatorOwnerRuntime } from './fixtures/creator-owner-runtime.mjs';
import {
  createOwnerLinksSurface,
  mountOwnerLinks,
  settle,
} from './fixtures/creator-owner-links-browser.mjs';
import { createOwnerSeriesSurface } from './fixtures/creator-owner-series-browser.mjs';
import {
  createCreatorOwnerClaimsSurface,
  mountCreatorOwnerClaims,
  submitClaim,
} from './fixtures/creator-owner-claims-browser.mjs';
import { SurfaceElement as Element } from './fixtures/creator-owner-browser-dom.mjs';

async function api(runtime, path, body, method = 'PUT', session = 'creator-a') {
  const csrfToken = session === 'creator-a' ? 'csrf-a' : `csrf-${session}`;
  const response = await runtime.fetchApi(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, { session });
  assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
  return response;
}

async function ownerDto(runtime) {
  return (await api(runtime, '/api/creador/perfil/', undefined, 'GET')).json();
}

function addProfileConflict(form) {
  const compare = new Element({ tagName: 'BUTTON', dataset: { ownerCompare: '' } });
  const adopt = new Element({ tagName: 'BUTTON', dataset: { ownerAdopt: '' }, textContent: 'Usar la versión guardada' });
  const view = new Element({ dataset: { ownerComparison: '' } });
  const copy = new Element({ dataset: { ownerConflictCopy: '' } });
  adopt.hidden = true;
  view.hidden = true;
  const box = new Element({ dataset: { ownerConflict: '' }, lists: [compare, adopt, view, copy] });
  box.hidden = true;
  form.append(box);
  return { compare, adopt, view, box };
}

function elementText(element) {
  return [element?.textContent, ...(element?.descendants?.() ?? []).map(({ textContent }) => textContent)]
    .filter(Boolean).join(' ');
}

function createInlineCreateSurface(surface = createOwnerLinksSurface()) {
  const initial = surface.document.getElementById('creator-owner-data');
  const dto = JSON.parse(initial.textContent);
  dto.profile = null;
  initial.textContent = JSON.stringify(dto);

  const displayName = new Element({ tagName: 'INPUT', name: 'displayName' });
  const slug = new Element({ tagName: 'INPUT', name: 'slug' });
  const status = new Element({ dataset: { ownerCreateStatus: '' } });
  const compare = new Element({ tagName: 'BUTTON', dataset: { ownerCompare: '' }, textContent: 'Comparar con lo guardado' });
  const comparison = new Element({ dataset: { ownerComparison: '' } });
  const adopt = new Element({ tagName: 'BUTTON', dataset: { ownerAdopt: '' }, textContent: 'Usar la versión guardada' });
  const copy = new Element({ dataset: { ownerConflictCopy: '' } });
  comparison.hidden = true;
  adopt.hidden = true;
  const conflict = new Element({ dataset: { ownerConflict: '' }, lists: [compare, comparison, adopt, copy] });
  conflict.hidden = true;
  const form = new Element({ tagName: 'FORM', dataset: { ownerForm: 'crear' }, lists: [displayName, slug, status, conflict] });
  form.elements = [displayName, slug];
  displayName.form = form;
  slug.form = form;
  const panel = new Element({ tagName: 'SECTION', dataset: { ownerCreatePanel: '' }, lists: [form] });
  surface.root.append(panel);
  for (const element of panel.descendants()) element.ownerDocument = surface.document;
  return { ...surface, createPanel: panel, createForm: form, createName: displayName, createSlug: slug, createStatus: status, createConflict: conflict, createCompare: compare, createComparison: comparison, createAdopt: adopt };
}

test('una comprobación manual de series no avanza versiones detrás de una edición abierta', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  await api(runtime, '/api/creador/perfil/', { displayName: 'Ana original', slug: 'ana-original', bio: 'Original' });
  const created = await (await api(runtime, '/api/creador/series/', {
    name: 'Ruta original', slug: 'ruta-original', profileVersion: (await ownerDto(runtime)).profile.version,
  }, 'POST')).json();
  await api(runtime, '/api/creador/enlaces/', { title: 'Capítulo', url: 'https://example.com/chapter' }, 'POST');

  const initial = await ownerDto(runtime);
  const surface = createOwnerSeriesSurface({ ...initial, query: { serie: created.series.id } });
  let failChapterWrite = true;
  let resolveRetry;
  let heldRead;
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    if (failChapterWrite && request.path.includes('/capitulos/') && request.method === 'PUT') {
      failChapterWrite = false;
      return Response.json({ error: 'UNAVAILABLE' }, { status: 503 });
    }
    if (request.path === '/api/creador/perfil' && request.method === 'GET') {
      heldRead = await runtime.fetchApi(request.url, options);
      return new Promise((resolve) => { resolveRetry = resolve; });
    }
    return runtime.fetchApi(request.url, options);
  } });

  await surface.chapterRows[0].querySelector('[data-chapter-add]').dispatch('click');
  await settle();
  await settle();
  assert.equal(surface.reconcileRetry.hidden, false);

  await api(runtime, `/api/creador/series/${created.series.id}/`, {
    name: 'Ruta remota nueva', description: 'Descripción remota nueva',
    version: created.series.version, profileVersion: initial.profile.version,
  }, 'PATCH');
  const remoteBefore = await ownerDto(runtime);

  await surface.reconcileRetry.dispatch('click');
  await settle();
  assert.equal(typeof resolveRetry, 'function', 'the manual reconciliation GET is pending');
  await surface.root.querySelector('[data-series-edit]').dispatch('click');
  assert.equal(surface.seriesFormFields.name.value, 'Ruta original');
  surface.seriesFormFields.description.value = 'Sólo quise cambiar descripción';
  await surface.seriesFormFields.description.dispatch('input');

  resolveRetry(heldRead);
  await settle();
  await settle();
  await surface.seriesForm.dispatch('submit');
  await settle();

  const saved = await ownerDto(runtime);
  const patch = requests.find(({ method, path }) => method === 'PATCH' && path === `/api/creador/series/${created.series.id}`);
  assert.equal(patch.body.version, created.series.version, 'the active form keeps the version it observed');
  assert.equal(patch.status, 409, 'the server rejects the stale form instead of accepting an old value');
  assert.equal(saved.series[0].name, remoteBefore.series[0].name);
  assert.equal(saved.series[0].description, remoteBefore.series[0].description);
});

test('una lectura manual vieja no resucita una serie borrada y permite volver a comprobar', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  await api(runtime, '/api/creador/perfil/', { displayName: 'Ana original', slug: 'ana-original' });
  const created = await (await api(runtime, '/api/creador/series/', {
    name: 'Ruta a eliminar', slug: 'ruta-eliminar', profileVersion: (await ownerDto(runtime)).profile.version,
  }, 'POST')).json();
  await api(runtime, '/api/creador/enlaces/', { title: 'Capítulo', url: 'https://example.com/chapter' }, 'POST');

  const initial = await ownerDto(runtime);
  const surface = createOwnerSeriesSurface({ ...initial, query: { serie: created.series.id } });
  surface.setConfirmResult(true);
  let failChapterWrite = true;
  let holdFirstRead = true;
  let resolveRetry;
  let heldRead;
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    if (failChapterWrite && request.path.includes('/capitulos/') && request.method === 'PUT') {
      failChapterWrite = false;
      return Response.json({ error: 'UNAVAILABLE' }, { status: 503 });
    }
    if (holdFirstRead && request.path === '/api/creador/perfil' && request.method === 'GET') {
      holdFirstRead = false;
      heldRead = await runtime.fetchApi(request.url, options);
      return new Promise((resolve) => { resolveRetry = resolve; });
    }
    return runtime.fetchApi(request.url, options);
  } });

  await surface.chapterRows[0].querySelector('[data-chapter-add]').dispatch('click');
  await settle();
  await settle();
  assert.equal(surface.reconcileRetry.hidden, false);
  await surface.reconcileRetry.dispatch('click');
  await settle();
  assert.equal(typeof resolveRetry, 'function');

  await surface.chapterBack.dispatch('click');
  assert.equal(surface.seriesListView.hidden, false);
  await surface.seriesRows[0].querySelector('[data-series-delete]').dispatch('click');
  await settle();
  await settle();
  await settle();
  assert.equal((await ownerDto(runtime)).series.length, 0);
  assert.equal(surface.seriesRows.length, 0, 'the confirmed delete initially updates the visible list');

  resolveRetry(heldRead);
  await settle();
  await settle();
  assert.equal(surface.seriesRows.length, 0, 'the older full snapshot cannot restore a series deleted after its read started');
  assert.equal(surface.reconcileRetry.hidden, false, 'the rejected read leaves the explicit retry available');

  await surface.reconcileRetry.dispatch('click');
  await settle();
  await settle();
  assert.equal(surface.seriesRows.length, 0, 'a fresh explicit read adopts the current list');
  assert.equal(surface.reconcileRetry.hidden, true);
  assert.equal((await ownerDto(runtime)).series.length, 0);
  assert.equal(requests.filter(({ path, method }) => path === `/api/creador/series/${created.series.id}` && method === 'DELETE').length, 1);
});

test('una respuesta tardía de foto no cambia la edición Datos abierta después de cancelar', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  await api(runtime, '/api/creador/perfil/', { displayName: 'Ana original', slug: 'ana-original', bio: 'Original' });
  const initial = await ownerDto(runtime);
  const surface = createOwnerLinksSurface(initial);
  const file = new Element({ tagName: 'INPUT', name: 'photo', type: 'file' });
  const check = new Element({ tagName: 'BUTTON', dataset: { ownerCheckPhoto: '' } });
  check.hidden = true;
  const cancel = new Element({ tagName: 'BUTTON', dataset: { ownerCancel: '' } });
  const photoStatus = new Element({ dataset: { ownerFormStatus: 'foto' } });
  const photoForm = new Element({ tagName: 'FORM', dataset: { ownerForm: 'foto' }, lists: [file, check, cancel, photoStatus] });
  photoForm.elements = [file];
  file.form = photoForm;
  photoForm.hidden = true;
  surface.dialog.append(photoForm);
  for (const element of photoForm.descendants()) element.ownerDocument = surface.document;

  let resolveRead;
  let capturedRead;
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    if (request.path === '/api/creador/foto/autorizar') return Response.json({ error: 'PROFILE_CONFLICT' }, { status: 409 });
    if (request.path === '/api/creador/perfil' && request.method === 'GET') {
      capturedRead = await runtime.fetchApi(request.url, options);
      return new Promise((resolve) => { resolveRead = resolve; });
    }
    return runtime.fetchApi(request.url, options);
  } });

  await surface.root.querySelector('[data-owner-edit="foto"]').dispatch('click');
  file.files = [new File(['a'], 'test.png', { type: 'image/png' })];
  await photoForm.dispatch('submit');
  assert.equal(check.hidden, false);
  await api(runtime, '/api/creador/perfil/', {
    displayName: 'Ana remota', slug: 'ana-original', version: initial.profile.version,
  });

  await check.dispatch('click');
  await settle();
  assert.equal(typeof resolveRead, 'function', 'the photo status read is pending');
  await cancel.dispatch('click');
  await surface.exitDiscard.dispatch('click');
  await surface.root.querySelector('[data-owner-edit="datos"]').dispatch('click');
  const displayName = surface.dataForm.querySelector('[name="displayName"]');
  const version = surface.dataForm.querySelector('[name="version"]');
  displayName.value = 'Mi corrección local nueva';
  await displayName.dispatch('input');

  resolveRead(capturedRead);
  await settle();
  await settle();
  assert.equal(displayName.value, 'Mi corrección local nueva');
  assert.equal(version.value, String(initial.profile.version), 'the form retains its original version base');

  await surface.dataForm.dispatch('submit');
  await settle();
  const saved = await ownerDto(runtime);
  const write = requests.find(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
  assert.equal(write.body.version, initial.profile.version);
  assert.equal(write.status, 409, 'the saved form conflicts instead of adopting the late photo read version');
  assert.equal(saved.profile.displayName, 'Ana remota');
});

test('una lectura de foto no cruza una cancelación y reapertura del mismo formulario mientras se lee el cuerpo', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  await api(runtime, '/api/creador/perfil/', { displayName: 'Ana original', slug: 'ana-original' });
  const initial = await ownerDto(runtime);
  const surface = createOwnerLinksSurface(initial);
  const file = new Element({ tagName: 'INPUT', name: 'photo', type: 'file' });
  const check = new Element({ tagName: 'BUTTON', dataset: { ownerCheckPhoto: '' } });
  check.hidden = true;
  const cancel = new Element({ tagName: 'BUTTON', dataset: { ownerCancel: '' } });
  const photoStatus = new Element({ dataset: { ownerFormStatus: 'foto' } });
  const photoForm = new Element({ tagName: 'FORM', dataset: { ownerForm: 'foto' }, lists: [file, check, cancel, photoStatus] });
  photoForm.elements = [file];
  file.form = photoForm;
  photoForm.hidden = true;
  surface.dialog.append(photoForm);
  for (const element of photoForm.descendants()) element.ownerDocument = surface.document;

  let resolveBody;
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    if (request.path === '/api/creador/foto/autorizar') return Response.json({ error: 'PROFILE_CONFLICT' }, { status: 409 });
    if (request.path === '/api/creador/perfil' && request.method === 'GET') {
      const response = await runtime.fetchApi(request.url, options);
      const clone = response.clone.bind(response);
      response.clone = () => {
        const copy = clone();
        const json = copy.json.bind(copy);
        copy.json = async () => {
          const payload = await json();
          return new Promise((resolve) => { resolveBody = () => resolve(payload); });
        };
        return copy;
      };
      return response;
    }
    return runtime.fetchApi(request.url, options);
  } });

  const versionTwo = (await (await api(runtime, '/api/creador/perfil/', {
    displayName: 'Ana remota v2', slug: 'ana-original', version: initial.profile.version,
  })).json()).profile;
  await surface.root.querySelector('[data-owner-edit="foto"]').dispatch('click');
  file.files = [new File(['a'], 'test.png', { type: 'image/png' })];
  await photoForm.dispatch('submit');
  await check.dispatch('click');
  await settle();
  assert.equal(typeof resolveBody, 'function', 'the response headers arrived and the JSON body is pending');
  await api(runtime, '/api/creador/perfil/', {
    displayName: 'Ana remota v3', slug: 'ana-original', version: versionTwo.version,
  });

  await cancel.dispatch('click');
  await surface.exitDiscard.dispatch('click');
  await surface.root.querySelector('[data-owner-edit="foto"]').dispatch('click');
  resolveBody();
  await settle();
  await settle();

  await surface.root.querySelector('[data-owner-close]').dispatch('click');
  await surface.root.querySelector('[data-owner-edit="datos"]').dispatch('click');
  assert.equal(surface.dataForm.querySelector('[name="displayName"]').value, 'Ana original');
  assert.equal(surface.dataForm.querySelector('[name="version"]').value, String(initial.profile.version));
  assert.equal(requests.filter(({ path, method }) => path === '/api/creador/perfil' && method === 'GET').length, 1);
});

test('una comparación Datos cancelada no reemplaza la versión mostrada en Redes', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  await api(runtime, '/api/creador/perfil/', {
    displayName: 'Ana original', slug: 'ana-original', socials: { website: 'https://example.com/old' },
  });
  const initial = await ownerDto(runtime);
  const surface = createOwnerLinksSurface(initial);
  const dataConflict = addProfileConflict(surface.dataForm);
  const socialField = new Element({ tagName: 'INPUT', type: 'url', name: 'social-website' });
  const version = new Element({ tagName: 'INPUT', type: 'hidden', name: 'version' });
  const socialForm = new Element({ tagName: 'FORM', dataset: { ownerForm: 'redes' }, lists: [socialField, version] });
  socialForm.hidden = true;
  socialForm.elements = [socialField, version];
  for (const field of socialForm.elements) field.form = socialForm;
  surface.dialog.append(socialForm);
  const socialConflict = addProfileConflict(socialForm);
  for (const element of surface.dialog.descendants()) element.ownerDocument = surface.document;

  let resolveOldRead;
  let oldRead;
  let holdFirstRead = true;
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    if (request.path === '/api/creador/perfil' && request.method === 'GET' && holdFirstRead) {
      holdFirstRead = false;
      oldRead = await runtime.fetchApi(request.url, options);
      return new Promise((resolve) => { resolveOldRead = resolve; });
    }
    return runtime.fetchApi(request.url, options);
  } });

  const versionTwo = (await (await api(runtime, '/api/creador/perfil/', {
    displayName: 'Ana remota v2', version: initial.profile.version,
  })).json()).profile;
  await surface.root.querySelector('[data-owner-edit="datos"]').dispatch('click');
  surface.dataForm.querySelector('[name="displayName"]').value = 'Mi dato local';
  await surface.dataForm.dispatch('submit');
  await dataConflict.compare.dispatch('click');
  await settle();
  assert.equal(typeof resolveOldRead, 'function', 'the Datos comparison GET is pending');

  await surface.root.querySelector('[data-owner-close]').dispatch('click');
  await surface.exitDiscard.dispatch('click');
  const versionThree = (await (await api(runtime, '/api/creador/perfil/', {
    socials: { website: 'https://example.com/new-v3' }, version: versionTwo.version,
  })).json()).profile;
  await surface.root.querySelector('[data-owner-edit="redes"]').dispatch('click');
  socialField.value = 'https://example.com/my-local';
  await socialForm.dispatch('submit');
  await socialConflict.compare.dispatch('click');
  await settle();
  await settle();
  assert.match(socialConflict.view.textContent, /new-v3/);
  assert.equal(socialConflict.adopt.hidden, false);

  resolveOldRead(oldRead);
  await settle();
  await settle();
  const visibleComparison = socialConflict.view.textContent;
  await socialConflict.adopt.dispatch('click');

  assert.match(visibleComparison, /new-v3/);
  assert.equal(socialField.value, versionThree.socials.website);
  assert.equal(version.value, String(versionThree.version));
  assert.equal(requests.filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').length, 2);
});

test('una comparación cancelada no reaparece al reabrir el mismo formulario Datos', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  await api(runtime, '/api/creador/perfil/', { displayName: 'Ana original', slug: 'ana-original' });
  const initial = await ownerDto(runtime);
  const surface = createOwnerLinksSurface(initial);
  const conflict = addProfileConflict(surface.dataForm);
  let resolveRead;
  let oldRead;
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    if (request.path === '/api/creador/perfil' && request.method === 'GET') {
      oldRead = await runtime.fetchApi(request.url, options);
      return new Promise((resolve) => { resolveRead = resolve; });
    }
    return runtime.fetchApi(request.url, options);
  } });

  const versionTwo = (await (await api(runtime, '/api/creador/perfil/', {
    displayName: 'Ana remota v2', version: initial.profile.version,
  })).json()).profile;
  await surface.root.querySelector('[data-owner-edit="datos"]').dispatch('click');
  surface.dataForm.querySelector('[name="displayName"]').value = 'Mi dato local';
  await surface.dataForm.dispatch('submit');
  await conflict.compare.dispatch('click');
  await settle();
  assert.equal(typeof resolveRead, 'function');

  await surface.root.querySelector('[data-owner-close]').dispatch('click');
  await surface.exitDiscard.dispatch('click');
  await api(runtime, '/api/creador/perfil/', {
    displayName: 'Ana remota v3', version: versionTwo.version,
  });
  await surface.root.querySelector('[data-owner-edit="datos"]').dispatch('click');
  assert.equal(conflict.view.hidden, true);
  assert.equal(conflict.adopt.hidden, true);
  resolveRead(oldRead);
  await settle();
  await settle();

  assert.equal(conflict.view.hidden, true, 'a stale read cannot place an old comparison in the reopened form');
  assert.equal(conflict.adopt.hidden, true, 'no adoption action is exposed for a comparison not shown in this context');
  const displayName = surface.dataForm.querySelector('[name="displayName"]');
  const version = surface.dataForm.querySelector('[name="version"]');
  assert.equal(displayName.value, 'Ana original');
  assert.equal(version.value, String(initial.profile.version));
  await conflict.adopt.dispatch('click');
  assert.equal(displayName.value, 'Ana original');
  assert.equal(version.value, String(initial.profile.version));
  assert.equal(requests.filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').length, 1);
});

test('el primer formulario Crear permite comparar y adoptar expresamente el perfil creado en otra pestaña', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const surface = createInlineCreateSurface();
  const requests = await mountOwnerLinks({ surface, fetch: (request, options) => runtime.fetchApi(request.url, options) });
  const remote = (await (await api(runtime, '/api/creador/perfil/', {
    displayName: 'Creada en otra pestaña', slug: 'creada-otra-pestana',
  })).json()).profile;

  surface.createName.value = 'Mi borrador local';
  await surface.createName.dispatch('input');
  surface.createSlug.value = 'mi-borrador-local';
  await surface.createSlug.dispatch('input');
  await surface.createForm.dispatch('submit');
  assert.equal(requests[0].status, 409);
  assert.equal(surface.createConflict.hidden, false);

  await surface.createCompare.dispatch('click');
  await settle();
  await settle();
  assert.equal(surface.createComparison.hidden, false);
  assert.match(surface.createComparison.textContent, /Creada en otra pestaña/);
  assert.equal(surface.createAdopt.hidden, false);
  await surface.createAdopt.dispatch('click');

  assert.equal(surface.createName.value, remote.displayName);
  assert.equal(surface.createSlug.value, remote.slug);
  assert.equal(surface.createPanel.hidden, true);
  assert.equal(requests.filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').length, 1,
    'explicit adoption does not replay the create write');
});

test('adoptar el primer perfil también carga su snapshot owner completo', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const remote = (await (await api(runtime, '/api/creador/perfil/', {
    displayName: 'Página guardada', slug: 'pagina-guardada',
  })).json()).profile;
  const link = (await (await api(runtime, '/api/creador/enlaces/', {
    title: 'Guía guardada', url: 'https://example.invalid/guia-guardada', description: 'Ficha propia',
  }, 'POST')).json()).link;
  const otherLink = (await (await api(runtime, '/api/creador/enlaces/', {
    title: 'Otra guía', url: 'https://example.invalid/otra-guia', description: 'Sin serie',
  }, 'POST')).json()).link;
  const beforeSeries = await ownerDto(runtime);
  await api(runtime, '/api/creador/series/', {
    name: 'Serie guardada', slug: 'serie-guardada', profileVersion: beforeSeries.profile.version,
  }, 'POST');
  const afterSeries = await ownerDto(runtime);
  const remoteSeries = afterSeries.series[0];
  await api(runtime, `/api/creador/series/${remoteSeries.id}/capitulos/${link.placementId}`, {
    profileVersion: afterSeries.profile.version,
  }, 'PUT');

  const seriesSurface = createOwnerSeriesSurface({ profile: {
    id: 'placeholder', displayName: '', slug: '', version: 0,
    published: false, hidden: false, city: '', country: '', bio: '', programs: [], socials: {},
  } });
  const surface = createInlineCreateSurface(seriesSurface);
  surface.window.location.href = `https://dondeaprendo.example.invalid/cuenta/?vista=enlaces&serie=${encodeURIComponent(remoteSeries.id)}`;
  let reloads = 0;
  surface.window.location.reload = () => { reloads += 1; };
  const requests = await mountOwnerLinks({ surface, fetch: (request, options) => runtime.fetchApi(request.url, options) });

  surface.createName.value = 'Borrador local';
  await surface.createName.dispatch('input');
  surface.createSlug.value = 'borrador-local';
  await surface.createSlug.dispatch('input');
  await surface.createForm.dispatch('submit');
  assert.equal(requests[0].status, 409);
  await surface.createCompare.dispatch('click');
  await settle();
  await settle();
  assert.equal(surface.createAdopt.hidden, false, 'the saved first profile remains an explicit choice');
  await surface.createAdopt.dispatch('click');

  assert.equal(surface.createPanel.hidden, true);
  assert.equal(surface.root.dataset.profileVersion, String((await ownerDto(runtime)).profile.version));
  const row = surface.root.querySelector(`[data-link-row="${link.placementId}"]`);
  assert.ok(row, 'the page shows the saved link from the compared owner DTO');
  assert.match(elementText(row), /Guía guardada/);
  assert.equal(surface.root.querySelector(`[data-link-row="${otherLink.placementId}"]`), null,
    'the valid series query filters out the other saved link');
  assert.deepEqual(surface.seriesSelect.querySelectorAll('option').map(({ value, textContent }) => ({ value, textContent })), [
    { value: 'todos', textContent: 'Todas las series' },
    { value: remoteSeries.id, textContent: 'Serie guardada' },
  ], 'the series filter is rebuilt from the adopted owner DTO');
  assert.equal(surface.seriesSelect.value, remoteSeries.id, 'adoption preserves a selected series that is now valid');
  assert.equal(new URL(surface.window.location.href).searchParams.get('serie'), remoteSeries.id);
  await surface.seriesSelect.dispatch('change');
  assert.equal(surface.root.querySelectorAll('[data-link-row]').length, 1,
    'the adopted series can be selected to filter the table without reloading');
  surface.seriesSelect.value = 'todos';
  await surface.seriesSelect.dispatch('change');
  assert.equal(surface.root.querySelectorAll('[data-link-row]').length, 2,
    'all links return when the series filter is reset');
  assert.equal(reloads, 0, 'adoption and filter selection do not reload the document');

  const activeRow = surface.root.querySelector(`[data-link-row="${link.placementId}"]`);
  await activeRow.querySelector('[data-link-edit]').dispatch('click');
  assert.equal(surface.metadataPanel.hidden, false,
    'the adopted owner snapshot retains editable-resource authority for its own link');
  assert.equal(surface.linkFields.find(({ name }) => name === 'title').value, 'Guía guardada');
  assert.equal(requests.filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').length, 1,
    'adopting the snapshot does not replay the create write');
  assert.equal(remote.displayName, 'Página guardada');
});

test('un guardado Datos confirmado invalida comparaciones viejas y conserva correcciones tardías', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  runtime.setSession('creator-b');
  await api(runtime, '/api/creador/perfil/', { displayName: 'Ana', slug: 'ana-original' });
  await api(runtime, '/api/creador/perfil/', { displayName: 'Beto', slug: 'slug-ocupado' }, 'PUT', 'creator-b');
  const initial = await ownerDto(runtime);
  const surface = createOwnerLinksSurface(initial);
  const conflict = addProfileConflict(surface.dataForm);
  let releaseComparison;
  let signalComparison;
  const comparisonStarted = new Promise((resolve) => { signalComparison = resolve; });
  let releaseSave;
  let signalSave;
  const saveStarted = new Promise((resolve) => { signalSave = resolve; });
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    if (request.path === '/api/creador/perfil' && request.method === 'GET') {
      const response = await runtime.fetchApi(request.url, options);
      signalComparison();
      return new Promise((resolve) => { releaseComparison = () => resolve(response); });
    }
    if (request.path === '/api/creador/perfil' && request.method === 'PUT'
      && request.body?.slug === 'ana-disponible') {
      const response = await runtime.fetchApi(request.url, options);
      signalSave();
      return new Promise((resolve) => { releaseSave = () => resolve(response); });
    }
    return runtime.fetchApi(request.url, options);
  } });

  await surface.root.querySelector('[data-owner-edit="datos"]').dispatch('click');
  const name = surface.dataForm.querySelector('[name="displayName"]');
  const slug = surface.dataForm.querySelector('[name="slug"]');
  name.value = 'Nombre del primer intento';
  slug.value = 'slug-ocupado';
  await surface.dataForm.dispatch('submit');
  assert.equal(requests.find(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').status, 409);
  await conflict.compare.dispatch('click');
  await comparisonStarted;
  assert.equal(typeof releaseComparison, 'function');

  name.value = 'Nombre confirmado';
  slug.value = 'ana-disponible';
  const saving = surface.dataForm.dispatch('submit');
  await saveStarted;
  name.value = 'Corrección posterior';
  await name.dispatch('input');
  releaseSave();
  await saving;

  const saved = await ownerDto(runtime);
  assert.equal(saved.profile.displayName, 'Nombre confirmado');
  assert.equal(saved.profile.slug, 'ana-disponible');
  assert.equal(name.value, 'Corrección posterior', 'the correction made during the write remains in the editor');
  assert.equal(surface.root.dataset.profileVersion, String(saved.profile.version));
  assert.equal(conflict.view.hidden, true, 'a confirmed profile write removes the superseded comparison');
  assert.equal(conflict.adopt.hidden, true, 'the old version cannot be adopted after the write');

  releaseComparison();
  await settle();
  await settle();
  assert.equal(conflict.view.hidden, true, 'a comparison GET started before the write cannot reappear');
  assert.equal(conflict.adopt.hidden, true);
  assert.equal(name.value, 'Corrección posterior');
  assert.equal((await ownerDto(runtime)).profile.version, saved.profile.version);
});

test('un guardado Datos borra una comparación ya presentada y bloquea su adopción', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  runtime.setSession('creator-b');
  await api(runtime, '/api/creador/perfil/', { displayName: 'Ana', slug: 'ana-original' });
  await api(runtime, '/api/creador/perfil/', { displayName: 'Beto', slug: 'slug-ocupado' }, 'PUT', 'creator-b');
  const surface = createOwnerLinksSurface(await ownerDto(runtime));
  const conflict = addProfileConflict(surface.dataForm);
  let releaseSave;
  let signalSave;
  const saveStarted = new Promise((resolve) => { signalSave = resolve; });
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    if (request.path === '/api/creador/perfil' && request.method === 'PUT'
      && request.body?.slug === 'ana-disponible') {
      const response = await runtime.fetchApi(request.url, options);
      signalSave();
      return new Promise((resolve) => { releaseSave = () => resolve(response); });
    }
    return runtime.fetchApi(request.url, options);
  } });

  await surface.root.querySelector('[data-owner-edit="datos"]').dispatch('click');
  const name = surface.dataForm.querySelector('[name="displayName"]');
  const slug = surface.dataForm.querySelector('[name="slug"]');
  name.value = 'Mi primera corrección';
  slug.value = 'slug-ocupado';
  await surface.dataForm.dispatch('submit');
  assert.equal(requests.find(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').status, 409);
  await conflict.compare.dispatch('click');
  await settle();
  await settle();
  assert.equal(conflict.view.hidden, false, 'the conflict comparison has been presented before the save');
  assert.equal(conflict.adopt.hidden, false);

  name.value = 'Nombre confirmado';
  slug.value = 'ana-disponible';
  const saving = surface.dataForm.dispatch('submit');
  await saveStarted;
  name.value = 'Corrección tardía';
  await name.dispatch('input');
  releaseSave();
  await saving;

  const saved = await ownerDto(runtime);
  assert.equal(saved.profile.displayName, 'Nombre confirmado');
  assert.equal(name.value, 'Corrección tardía', 'the late correction stays in the open form');
  assert.equal(conflict.view.hidden, true, 'the already presented v1 comparison is removed by v2');
  assert.equal(conflict.adopt.hidden, true);
  await conflict.adopt.dispatch('click');
  assert.equal(surface.root.dataset.profileVersion, String(saved.profile.version));
  assert.equal(name.value, 'Corrección tardía', 'the stale adoption action cannot replace the later correction');
});

test('cancelar y cambiar la corrección de Crear invalida la comparación que todavía espera', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const surface = createInlineCreateSurface();
  let resolveRead;
  let oldRead;
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    if (request.path === '/api/creador/perfil' && request.method === 'GET') {
      oldRead = await runtime.fetchApi(request.url, options);
      return new Promise((resolve) => { resolveRead = resolve; });
    }
    return runtime.fetchApi(request.url, options);
  } });
  await api(runtime, '/api/creador/perfil/', {
    displayName: 'Creada en otra pestaña', slug: 'creada-otra-pestana',
  });
  surface.createName.value = 'Corrección local';
  await surface.createName.dispatch('input');
  surface.createSlug.value = 'correccion-local';
  await surface.createSlug.dispatch('input');
  await surface.createForm.dispatch('submit');
  await surface.createCompare.dispatch('click');
  await settle();
  assert.equal(typeof resolveRead, 'function', 'the create comparison is waiting on its GET');

  await surface.root.querySelector('[data-owner-close]').dispatch('click');
  await surface.exitDiscard.dispatch('click');
  surface.createName.value = 'Nueva corrección';
  await surface.createName.dispatch('input');
  surface.createSlug.value = 'nueva-correccion';
  await surface.createSlug.dispatch('input');
  resolveRead(oldRead);
  await settle();
  await settle();

  assert.equal(surface.createName.value, 'Nueva corrección');
  assert.equal(surface.createSlug.value, 'nueva-correccion');
  assert.equal(surface.createComparison.hidden, true, 'the cancelled comparison cannot appear in the later inline create context');
  assert.equal(surface.createAdopt.hidden, true, 'no adoption is offered for a saved value that was never compared here');
  assert.equal(requests.filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').length, 1);
});

test('una solicitud confirma evidencia normalizada sin borrar una corrección escrita durante el POST', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  await api(runtime, '/api/creador/perfil/', { displayName: 'Ana original', slug: 'ana-original' });
  await api(runtime, '/api/creador/enlaces/', { title: 'Contenido conocido', url: 'https://example.com/known' }, 'POST');
  const dto = await ownerDto(runtime);
  const surface = createCreatorOwnerClaimsSurface({ ...dto, index: [] });
  let markStarted;
  let release;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const requests = await mountCreatorOwnerClaims({ surface, respond: async (request) => {
    if (request.path !== '/api/creador/reclamaciones' || request.method !== 'POST') return undefined;
    const response = await runtime.fetchApi(request.path, {
      method: request.method,
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-a' },
      body: JSON.stringify(request.body),
    });
    markStarted();
    await gate;
    return response;
  } });

  await surface.requestEdit.dispatch('click');
  surface.claimUrls.value = 'https://example.com/known';
  const rawEvidence = '  Soy autor de esta ficha.\n';
  surface.claimEvidence.value = rawEvidence;
  const submission = submitClaim(surface);
  await started;
  const post = requests.find(({ path, method }) => path === '/api/creador/reclamaciones' && method === 'POST');
  assert.equal(post.body.evidence, 'Soy autor de esta ficha.');
  surface.claimEvidence.value = 'Corrección escrita durante la solicitud';
  await surface.claimEvidence.dispatch('input');
  release();
  await submission;

  const saved = await ownerDto(runtime);
  assert.equal(saved.claims.length, 1);
  assert.equal(saved.claims[0].evidence, 'Soy autor de esta ficha.');
  assert.equal(surface.claimEvidence.value, 'Corrección escrita durante la solicitud');
  assert.match(surface.claimStatus.textContent, /Solicitud enviada/);
  await surface.root.querySelector('[data-owner-close]').dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false, 'the later raw correction remains pending and asks before exit');
});

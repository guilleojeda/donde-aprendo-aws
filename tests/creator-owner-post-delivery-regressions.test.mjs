import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creatorPageSessionBinding } from '../src/lib/creator-session-context.mjs';
import { seedResource } from './fixtures/creator-pages.mjs';
import { createCreatorOwnerRuntime, SITE_ORIGIN } from './fixtures/creator-owner-runtime.mjs';
import {
  createLinksApi,
  createOwnerLinksSurface,
  editableLink,
  jsonResponse,
  mountOwnerLinks,
  sharedLink,
  settle,
  writes,
} from './fixtures/creator-owner-links-browser.mjs';
import { createOwnerLinkMoveSurface, ensureMoveActions } from './fixtures/creator-owner-link-move-browser.mjs';
import { SurfaceElement } from './fixtures/creator-owner-browser-dom.mjs';

const OWNER_ORIGIN = 'https://donde-aprendo.example.invalid';

function runtimeRequestOptions(options) {
  const headers = new Headers(options.headers);
  if (options.method && options.method !== 'GET') headers.set('origin', SITE_ORIGIN);
  return { ...options, headers };
}

function addReviewOptionsButton(surface) {
  const button = surface.document.createElement('button');
  button.type = 'button';
  button.dataset.linkAddOptions = '';
  button.hidden = true;
  button.textContent = 'Revisar opciones del enlace compartido agregado';
  surface.addForm.append(button);
  return button;
}

function addPublicProfileNodes(surface, profile) {
  const name = new SurfaceElement({ dataset: { ownerName: '' }, textContent: profile.displayName });
  const slug = new SurfaceElement({ dataset: { ownerSlug: '' }, textContent: `/c/${profile.slug}/` });
  const visibleCopy = new SurfaceElement({ dataset: { ownerPublicCopy: '' } });
  const hiddenCopy = new SurfaceElement({ dataset: { ownerHiddenCopy: '' } });
  const publishCopy = new SurfaceElement({ dataset: { ownerDraftCopy: '' } });
  const profileStatus = new SurfaceElement({ dataset: { ownerProfileStatus: '' } });
  profileStatus.setAttribute('role', 'status');
  profileStatus.setAttribute('aria-live', 'polite');
  const publicLink = new SurfaceElement({ tagName: 'A', dataset: { ownerPublicLink: '' } });
  publicLink.href = `${OWNER_ORIGIN}/c/${profile.slug}/`;
  const copy = new SurfaceElement({ tagName: 'BUTTON', dataset: { ownerCopy: '' } });
  copy.dataset.url = `${OWNER_ORIGIN}/c/${profile.slug}/`;
  const publishCheck = new SurfaceElement({ tagName: 'BUTTON', dataset: { ownerPublishCheck: '' }, textContent: 'Comprobar estado guardado' });
  publishCheck.hidden = true;
  surface.root.append(name, slug, visibleCopy, hiddenCopy, publishCopy, profileStatus, publicLink, copy, publishCheck);
  for (const node of [name, slug, visibleCopy, hiddenCopy, publishCopy, profileStatus, publicLink, copy, publishCheck]) node.ownerDocument = surface.document;
  return { name, slug, profileStatus, publicLink, copy, publishCheck };
}

function remoteOwnerSnapshot(snapshot, hidden) {
  const before = snapshot();
  const nextSeries = { id: 'series-current', name: 'Serie actual', slug: 'serie-actual', description: 'Descripción actual', version: 3 };
  return {
    profile: { ...before.profile, displayName: 'Nombre remoto', slug: 'slug-actual', hidden, version: before.profile.version + 1 },
    links: before.links.map((link, index) => ({
      ...link,
      title: index === 0 ? 'Guía remota' : link.title,
      resourceVersion: index === 0 ? link.resourceVersion + 1 : link.resourceVersion,
      series: index === 0 ? [{ seriesId: nextSeries.id, position: 0 }] : [],
    })),
    editableResources: before.editableResources.map((resource, index) => index === 0
      ? { ...resource, title: 'Guía remota', version: resource.version + 1 }
      : resource),
    claims: [],
    series: [nextSeries],
  };
}

for (const editor of ['link', 'move']) {
  for (const hidden of [false, true]) test(`${editor} adoption refreshes identity, canonical actions, and series after an explicit conflict choice (hidden=${hidden})`, async () => {
    const profile = { id: 'creator-1', displayName: 'Nombre original', slug: 'slug-original', version: 14,
      published: true, hidden: false, city: '', country: '', bio: '', programs: [], socials: {} };
    const oldSeries = { id: 'series-old', name: 'Serie anterior', slug: 'serie-anterior', description: '', version: 2 };
    const first = editableLink({
      title: 'Guía inicial', url: 'https://example.invalid/guia', position: 0,
      series: [{ seriesId: oldSeries.id, position: 0 }],
    });
    const second = editableLink({
      placementId: 'placement-second', resourceId: 'resource-second', title: 'Otro enlace',
      url: 'https://example.invalid/otro', position: 1, resourceVersion: 2, placementVersion: 4,
    });
    const resources = [
      { id: first.resourceId, title: first.title, url: first.url, description: first.description, version: first.resourceVersion },
      { id: second.resourceId, title: second.title, url: second.url, description: second.description, version: second.resourceVersion },
    ];
    const surface = editor === 'link'
      ? createOwnerLinksSurface({ profile, links: [first, second], editableResources: resources, series: [oldSeries], search: 'guía' })
      : createOwnerLinkMoveSurface({ profile, links: [first, second], editableResources: resources, series: [oldSeries], search: 'guía' });
    const publicNodes = addPublicProfileNodes(surface, profile);
    let remote;
    const api = createLinksApi({ surface, override: (request, state) => {
      if ((editor === 'link' && request.method === 'PATCH' && request.path.endsWith('/editar'))
        || (editor === 'move' && request.method === 'POST' && request.path.endsWith('/mover'))) {
        remote = remoteOwnerSnapshot(state.snapshot, hidden);
        return jsonResponse({ error: 'PROFILE_VERSION_CONFLICT' }, 409);
      }
      if (request.method === 'GET' && request.path === '/api/creador/perfil' && remote) return jsonResponse(remote);
      return undefined;
    } });
    await mountOwnerLinks({ surface, fetch: api.fetch });
    if (editor === 'move') ensureMoveActions(surface);

    await surface.root.querySelector(editor === 'link' ? '[data-link-edit]' : '[data-link-move]').dispatch('click');
    if (editor === 'link') {
      const title = surface.linkFields.find(({ name }) => name === 'title');
      title.value = 'Corrección local';
      await surface.linkEditForm.dispatch('submit');
      await surface.linkEditForm.querySelector('[data-owner-compare]').dispatch('click');
      await settle(); await settle();
      await surface.linkEditForm.querySelector('[data-owner-adopt]').dispatch('click');
      assert.equal(title.value, 'Guía remota', 'the explicit adoption keeps the link editor’s existing correction semantics');
    } else {
      surface.targetPosition.value = '2';
      await surface.moveForm.dispatch('submit');
      await surface.moveForm.querySelector('[data-owner-compare]').dispatch('click');
      await settle(); await settle();
      await surface.moveForm.querySelector('[data-owner-adopt]').dispatch('click');
      assert.equal(surface.targetPosition.value, '2', 'the requested move destination remains in the open form');
    }

    assert.equal(surface.root.dataset.profileVersion, String(remote.profile.version));
    assert.equal(publicNodes.name.textContent, 'Nombre remoto');
    assert.equal(publicNodes.slug.textContent, '/c/slug-actual/');
    assert.equal(publicNodes.publicLink.hidden, hidden);
    assert.equal(publicNodes.copy.hidden, hidden);
    assert.equal(publicNodes.copy.dataset.url, hidden ? '' : `${OWNER_ORIGIN}/c/slug-actual/`);
    const row = surface.root.querySelector('[data-link-row]');
    assert.match(row.querySelector('[data-label="Series"]').textContent, /Serie actual/);
    assert.equal(surface.searchInput.value, 'guía', 'the existing table query is retained across adoption');

    await surface.root.querySelector('[data-owner-cancel]').dispatch('click');
    if (!surface.exitPrompt.hidden) await surface.exitDiscard.dispatch('click');
    assert.equal(surface.dialog.open, false);
    assert.equal(surface.searchInput.value, 'guía');
    if (editor === 'link') assert.ok(surface.document.activeElement?.matches('[data-link-edit]'),
      'link focus returns to the matching row action after the table is rendered from the adopted snapshot');
    else assert.ok(surface.document.activeElement?.matches('[data-link-move]'),
      'move focus returns to the row action after the table is rendered from the adopted snapshot');
  });
}

async function ownerApi(runtime, path, body, method = 'PUT') {
  const response = await runtime.fetchApi(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-a' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, { session: 'creator-a' });
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${await response.clone().text()}`);
  return response;
}

async function draftRuntime() {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  await ownerApi(runtime, '/api/creador/perfil/', { displayName: 'Nombre borrador', slug: 'perfil-borrador' });
  const data = await (await ownerApi(runtime, '/api/creador/perfil/', undefined, 'GET')).json();
  return { runtime, data };
}

test('successful shared URL add keeps late text in the add form and never submits it automatically', async () => {
  const { runtime, data } = await draftRuntime();
  await seedResource(runtime.pages.store, {
    id: 'public-catalog', title: 'Título del catálogo', url: 'https://example.invalid/catalog-a',
    description: 'Descripción del catálogo', category: 'Otros', order: 1, featured: false,
    kind: 'content', format: 'Artículo', topics: [], published: true, hidden: false,
    approvalRevoked: false, directoryControl: 'editorial', version: 4,
  });
  const surface = createOwnerLinksSurface({ profile: data.profile, links: data.links, editableResources: data.editableResources, series: data.series });
  surface.addForm.remove();
  surface.dialog.append(surface.addForm);
  surface.addForm.dataset.ownerForm = 'alta-enlace';
  const reviewOptions = addReviewOptionsButton(surface);
  let release;
  let started;
  const createStarted = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    const response = await runtime.fetchApi(request.url, runtimeRequestOptions(options), { session: 'creator-a' });
    if (request.method === 'POST' && request.path === '/api/creador/enlaces') {
      started();
      await gate;
    }
    return response;
  } });

  await surface.addOpen.dispatch('click');
  const get = (name) => surface.addFields.find((item) => item.name === name);
  get('title').value = 'Título enviado';
  get('url').value = 'https://example.invalid/catalog-a';
  get('description').value = 'Descripción enviada';
  const saving = surface.addForm.dispatch('submit');
  await createStarted;
  get('title').value = 'Título corregido';
  get('url').value = 'https://example.invalid/corrected-b';
  get('description').value = 'Descripción corregida';
  get('selectedForDirectory').checked = false;
  release();
  await saving; await settle();

  const saved = await (await ownerApi(runtime, '/api/creador/perfil/', undefined, 'GET')).json();
  assert.equal(saved.links[0].resourceId, 'public-catalog');
  assert.deepEqual({ title: get('title').value, url: get('url').value, description: get('description').value }, {
    title: 'Título corregido', url: 'https://example.invalid/corrected-b', description: 'Descripción corregida',
  });
  assert.equal(get('selectedForDirectory').checked, false);
  assert.equal(surface.addForm.hidden, false);
  assert.equal(surface.linkEditForm.hidden, true);
  assert.equal(reviewOptions.hidden, false);
  assert.deepEqual(writes(requests).map(({ method, path }) => [method, path]), [['POST', '/api/creador/enlaces']]);

  await reviewOptions.dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.linkEditForm.hidden, false);
  assert.equal(surface.metadataPanel.hidden, true, 'shared metadata stays inaccessible in the placement editor');
  assert.equal(surface.linkFields.find(({ name }) => name === 'selectedForDirectory').checked, true,
    'the discarded add option did not dirty the hidden options editor');
  assert.equal(surface.addForm.hidden, true);
  assert.deepEqual(writes(requests).map(({ method, path }) => [method, path]), [['POST', '/api/creador/enlaces']]);
  await surface.linkCancel.dispatch('click');
  assert.equal(surface.exitPrompt.hidden, true, 'closing the clean options editor has no hidden pending add correction');
  assert.equal(surface.dialog.open, false);
});

test('duplicate response keeps late shared title or description when the URL remains unchanged', async () => {
  const shared = sharedLink({ position: 0 });
  const surface = createOwnerLinksSurface({ links: [shared] });
  surface.addForm.remove();
  surface.dialog.append(surface.addForm);
  surface.addForm.dataset.ownerForm = 'alta-enlace';
  const hiddenOptionBaseline = surface.linkFields.find(({ name }) => name === 'selectedForDirectory').checked;
  const reviewOptions = addReviewOptionsButton(surface);
  const cancel = surface.document.createElement('button');
  cancel.type = 'button';
  cancel.dataset.ownerCancel = '';
  surface.addForm.append(cancel);
  const api = createLinksApi({ surface });
  let release;
  let started;
  const duplicateStarted = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  let posts = 0;
  const requests = await mountOwnerLinks({ surface, fetch: async (request) => {
    const response = await api.fetch(request);
    if (request.method === 'POST' && request.path === '/api/creador/enlaces' && ++posts === 1) {
      started();
      await gate;
    }
    return response;
  } });

  await surface.addOpen.dispatch('click');
  const title = surface.addFields.find(({ name }) => name === 'title');
  const url = surface.addFields.find(({ name }) => name === 'url');
  const description = surface.addFields.find(({ name }) => name === 'description');
  title.value = 'Título enviado';
  url.value = shared.url;
  description.value = 'Descripción enviada';
  const saving = surface.addForm.dispatch('submit');
  await duplicateStarted;
  title.value = 'Corrección de título';
  description.value = 'Corrección de descripción';
  surface.addFields.find(({ name }) => name === 'selectedForDirectory').checked = false;
  release();
  await saving; await settle();

  assert.equal(surface.addForm.hidden, false);
  assert.equal(title.value, 'Corrección de título');
  assert.equal(url.value, shared.url);
  assert.equal(description.value, 'Corrección de descripción');
  assert.equal(reviewOptions.hidden, false);
  assert.equal(surface.linkEditForm.hidden, true);
  assert.deepEqual(writes(requests).map(({ method }) => method), ['POST'],
    'the duplicate handoff does not issue a correction write');

  await surface.addForm.dispatch('submit'); await settle();
  assert.equal(surface.addForm.hidden, false, 'a duplicate cannot be reported as saving shared metadata');
  assert.equal(title.value, 'Corrección de título');
  assert.equal(description.value, 'Corrección de descripción');
  assert.equal(surface.addFields.find(({ name }) => name === 'selectedForDirectory').checked, false);
  assert.match(surface.addStatus.textContent, /No guardamos esta corrección|conserva sus datos/i);
  assert.deepEqual(writes(requests).map(({ method }) => method), ['POST', 'POST'],
    'only the two explicit clicks send POSTs; neither saves shared metadata');

  await cancel.dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.dialog.open, false);
  assert.equal(title.value, '', 'discard is explicit and clears the late title');
  assert.equal(description.value, '');
  assert.equal(surface.linkEditForm.hidden, true);
  assert.equal(surface.linkFields.find(({ name }) => name === 'selectedForDirectory').checked, hiddenOptionBaseline,
    'the hidden options form retains its clean original baseline');
  await surface.addOpen.dispatch('click');
  assert.equal(surface.dialog.open, true);
  assert.equal(surface.exitPrompt.hidden, true, 'discard leaves no hidden pending correction when another editor opens');
  assert.equal(surface.addForm.hidden, false);
  assert.deepEqual(writes(requests).map(({ method }) => method), ['POST', 'POST']);
});

test('a late directory-option change stays in the authorized shared-placement editor', async () => {
  const shared = sharedLink({ position: 0 });
  const surface = createOwnerLinksSurface({ links: [shared] });
  surface.addForm.remove();
  surface.dialog.append(surface.addForm);
  surface.addForm.dataset.ownerForm = 'alta-enlace';
  const api = createLinksApi({ surface });
  let release;
  let started;
  const duplicateStarted = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const requests = await mountOwnerLinks({ surface, fetch: async (request) => {
    const response = await api.fetch(request);
    if (request.method === 'POST' && request.path === '/api/creador/enlaces') {
      started();
      await gate;
    }
    return response;
  } });

  await surface.addOpen.dispatch('click');
  const get = (name) => surface.addFields.find((item) => item.name === name);
  get('title').value = shared.title;
  get('url').value = shared.url;
  get('description').value = shared.description;
  const adding = surface.addForm.dispatch('submit');
  await duplicateStarted;
  get('selectedForDirectory').checked = false;
  release();
  await adding; await settle();

  assert.equal(surface.addForm.hidden, true);
  assert.equal(surface.linkEditForm.hidden, false);
  assert.equal(surface.metadataPanel.hidden, true);
  assert.equal(surface.optionsPanel.hidden, false);
  assert.equal(surface.linkFields.find(({ name }) => name === 'selectedForDirectory').checked, false);
  assert.deepEqual(writes(requests).map(({ method }) => method), ['POST'],
    'the option correction is available but is not saved with another POST');
  await surface.linkEditForm.dispatch('submit'); await settle();
  assert.equal(api.snapshot().links[0].selectedForDirectory, false);
  assert.deepEqual(writes(requests).map(({ method }) => method), ['POST', 'PATCH'],
    'only the explicit options save persists the directory change');
});

for (const correctedField of ['title', 'description']) test(`a late shared ${correctedField} correction with URL A can be discarded or reviewed without a false duplicate save`, async () => {
  const { runtime, data } = await draftRuntime();
  await seedResource(runtime.pages.store, {
    id: 'public-catalog', title: 'Título del catálogo', url: 'https://example.invalid/catalog-a',
    description: 'Descripción del catálogo', category: 'Otros', order: 1, featured: false,
    kind: 'content', format: 'Artículo', topics: [], published: true, hidden: false,
    approvalRevoked: false, directoryControl: 'editorial', version: 4,
  });
  const surface = createOwnerLinksSurface({ profile: data.profile, links: data.links, editableResources: data.editableResources, series: data.series });
  surface.addForm.remove();
  surface.dialog.append(surface.addForm);
  surface.addForm.dataset.ownerForm = 'alta-enlace';
  const reviewOptions = addReviewOptionsButton(surface);
  let release;
  let started;
  const createStarted = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    const response = await runtime.fetchApi(request.url, runtimeRequestOptions(options), { session: 'creator-a' });
    if (request.method === 'POST' && request.path === '/api/creador/enlaces' && !startedOnce) {
      startedOnce = true;
      started();
      await gate;
    }
    return response;
  } });
  let startedOnce = false;
  const get = (name) => surface.addFields.find((item) => item.name === name);
  await surface.addOpen.dispatch('click');
  get('title').value = 'Título del envío';
  get('url').value = 'https://example.invalid/catalog-a';
  get('description').value = 'Descripción del envío';
  const saving = surface.addForm.dispatch('submit');
  await createStarted;
  get(correctedField).value = correctedField === 'title' ? 'Título corregido' : 'Descripción corregida';
  release();
  await saving; await settle();

  assert.equal(get('url').value, 'https://example.invalid/catalog-a');
  assert.equal(reviewOptions.hidden, false);
  await surface.addForm.dispatch('submit'); await settle();
  assert.equal(get(correctedField).value, correctedField === 'title' ? 'Título corregido' : 'Descripción corregida');
  assert.equal(surface.addForm.hidden, false, 'the duplicate does not clear a title-only or description-only correction');
  assert.match(surface.addStatus.textContent, /No guardamos esta corrección|conserva sus datos/i);
  assert.equal(writes(requests).filter(({ path }) => path === '/api/creador/enlaces').length, 2,
    'one initial add and one explicit duplicate check; no automatic correction write');

  await reviewOptions.dispatch('click');
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.linkEditForm.hidden, false);
  assert.equal(surface.metadataPanel.hidden, true);
  assert.deepEqual(writes(requests).filter(({ path }) => path === '/api/creador/enlaces').length, 2);
});

test('a lost postcommit publish acknowledgement uses one local status and a guarded current-URL refresh', async () => {
  const { runtime, data } = await draftRuntime();
  const surface = createOwnerLinksSurface({ profile: data.profile, links: data.links, editableResources: data.editableResources, series: data.series });
  const publicNodes = addPublicProfileNodes(surface, data.profile);
  const dataCancel = surface.document.createElement('button');
  dataCancel.type = 'button';
  dataCancel.dataset.ownerCancel = '';
  surface.dataForm.append(dataCancel);
  let reloads = 0;
  const currentUrl = surface.window.location.href;
  surface.window.location.reload = () => { reloads += 1; };
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    const response = await runtime.fetchApi(request.url, runtimeRequestOptions(options), { session: 'creator-a' });
    if (request.path === '/api/creador/perfil/publicar' && response.ok) throw new TypeError('lost acknowledgement after commit');
    return response;
  } });

  await surface.publish.dispatch('click'); await settle(); await settle();
  const committed = await (await ownerApi(runtime, '/api/creador/perfil/', undefined, 'GET')).json();
  assert.equal(committed.profile.published, true, 'the real service committed before the simulated response loss');
  assert.match(publicNodes.profileStatus.textContent, /No pudimos confirmar si la publicación se guardó/);
  assert.doesNotMatch(publicNodes.profileStatus.textContent, /sigue como estaba/);
  assert.equal(surface.pageStatus.textContent, '', 'the global status does not repeat publication uncertainty');
  assert.equal(surface.publish.hidden, true, 'publish is held until the ambiguous state is checked');
  assert.equal(publicNodes.publishCheck.hidden, false);
  assert.equal(writes(requests).filter(({ path }) => path === '/api/creador/perfil/publicar').length, 1);

  await surface.root.descendants().find(({ dataset }) => dataset.ownerEdit === 'datos').dispatch('click');
  surface.dataForm.elements[0].value = 'Corrección local';
  await surface.dataForm.elements[0].dispatch('input');
  await publicNodes.publishCheck.dispatch('click');
  assert.equal(reloads, 0, 'a check cannot replace an active editor with pending corrections');
  assert.match(publicNodes.profileStatus.textContent, /Guarda o descarta tus correcciones/);
  assert.equal(surface.pageStatus.textContent, '');
  await dataCancel.dispatch('click');
  await surface.exitDiscard.dispatch('click');
  await publicNodes.publishCheck.dispatch('click'); await settle(); await settle();
  assert.equal(writes(requests).filter(({ path }) => path === '/api/creador/perfil/publicar').length, 1,
    'the deliberate refresh never repeats publish');
  assert.equal(reloads, 1, 'the check replaces the document with one fresh server-rendered owner page');
  assert.equal(surface.window.location.href, currentUrl, 'the current private URL and query remain the refresh target');
  assert.equal(publicNodes.publishCheck.disabled, true);
  assert.equal(surface.publish.hidden, true);
  assert.equal(publicNodes.publicLink.hidden, true, 'the old document is not partially updated before SSR replaces it');
  assert.match(publicNodes.profileStatus.textContent, /Actualizando esta página para comprobar/);
  assert.equal(surface.pageStatus.textContent, '', 'the refresh instruction stays in the profile status only');
});

test('a lost 503 publish acknowledgement offers the same explicit refresh without replaying', async () => {
  const { runtime, data } = await draftRuntime();
  const surface = createOwnerLinksSurface({ profile: data.profile, links: data.links, editableResources: data.editableResources, series: data.series });
  const publicNodes = addPublicProfileNodes(surface, data.profile);
  let reloads = 0;
  surface.window.location.reload = () => { reloads += 1; };
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    if (request.path === '/api/creador/perfil/publicar') return Response.json({ error: 'TEMPORARILY_UNAVAILABLE' }, { status: 503 });
    return runtime.fetchApi(request.url, runtimeRequestOptions(options), { session: 'creator-a' });
  } });

  await surface.publish.dispatch('click'); await settle(); await settle();
  const saved = await (await ownerApi(runtime, '/api/creador/perfil/', undefined, 'GET')).json();
  assert.equal(saved.profile.published, false, 'this 503 happened before the real service call');
  assert.equal(surface.publish.hidden, true);
  assert.equal(publicNodes.publishCheck.hidden, false);
  assert.match(publicNodes.profileStatus.textContent, /No pudimos confirmar si la publicación se guardó/);
  assert.equal(surface.pageStatus.textContent, '');
  await publicNodes.publishCheck.dispatch('click'); await settle(); await settle();
  assert.equal(reloads, 1);
  assert.equal(writes(requests).filter(({ path }) => path === '/api/creador/perfil/publicar').length, 1,
    'the 503 path never retries publication automatically');
  assert.equal(surface.publish.hidden, true, 'the old page keeps Publish hidden until SSR returns the saved draft');
});

test('an incompatible publish receipt offers an explicit refresh instead of claiming success', async () => {
  const { runtime, data } = await draftRuntime();
  const surface = createOwnerLinksSurface({ profile: data.profile, links: data.links, editableResources: data.editableResources, series: data.series });
  const publicNodes = addPublicProfileNodes(surface, data.profile);
  let reloads = 0;
  surface.window.location.reload = () => { reloads += 1; };
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    const response = await runtime.fetchApi(request.url, runtimeRequestOptions(options), { session: 'creator-a' });
    if (request.path === '/api/creador/perfil/publicar' && response.ok) {
      const payload = await response.json();
      return Response.json({ profile: { ...payload.profile, version: payload.profile.version + 1 } });
    }
    return response;
  } });

  await surface.publish.dispatch('click'); await settle(); await settle();
  const saved = await (await ownerApi(runtime, '/api/creador/perfil/', undefined, 'GET')).json();
  assert.equal(saved.profile.published, true, 'the service committed but returned an incompatible receipt to the controller');
  assert.equal(publicNodes.publishCheck.hidden, false);
  assert.match(publicNodes.profileStatus.textContent, /No pudimos confirmar si la publicación se guardó/);
  assert.equal(surface.pageStatus.textContent, '', 'an incompatible receipt is announced only in the profile status');
  await publicNodes.publishCheck.dispatch('click');
  assert.equal(reloads, 1, 'the user can replace the incomplete local state with a coherent SSR page');
  assert.equal(writes(requests).filter(({ path }) => path === '/api/creador/perfil/publicar').length, 1);
});

test('a publication 409 exposes the saved-state check, blocks repeat posts, and allows a manual save after refresh', async () => {
  const { runtime, data } = await draftRuntime();
  const surface = createOwnerLinksSurface({ profile: data.profile, links: data.links, editableResources: data.editableResources, series: data.series });
  const publicNodes = addPublicProfileNodes(surface, data.profile);
  let reloads = 0;
  surface.window.location.reload = () => { reloads += 1; };
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) =>
    runtime.fetchApi(request.url, runtimeRequestOptions(options), { session: 'creator-a' }) });

  await ownerApi(runtime, '/api/creador/perfil/', { version: data.profile.version, bio: 'Actualización en otra pestaña.' });
  await surface.publish.dispatch('click'); await settle(); await settle();

  const savedAfterConflict = await (await ownerApi(runtime, '/api/creador/perfil/', undefined, 'GET')).json();
  assert.equal(savedAfterConflict.profile.published, false, 'the stale publish was rejected without changing the saved draft');
  assert.equal(surface.publish.hidden, true, 'the stale page cannot submit its old version again');
  assert.equal(publicNodes.publishCheck.hidden, false, 'the existing explicit saved-state action becomes available');
  assert.match(publicNodes.profileStatus.textContent, /cambió antes de publicar/i);
  assert.equal(writes(requests).filter(({ path }) => path === '/api/creador/perfil/publicar').length, 1);

  await surface.publish.dispatch('click'); await settle();
  assert.equal(writes(requests).filter(({ path }) => path === '/api/creador/perfil/publicar').length, 1,
    'another click never replays the stale publish request');
  await publicNodes.publishCheck.dispatch('click'); await settle();
  assert.equal(reloads, 1, 'the check replaces the document with a fresh owner snapshot');
  assert.equal(writes(requests).filter(({ path }) => path === '/api/creador/perfil/publicar').length, 1,
    'checking the saved state does not repeat publication');

  const refreshed = createOwnerLinksSurface({ profile: savedAfterConflict.profile, links: savedAfterConflict.links,
    editableResources: savedAfterConflict.editableResources, series: savedAfterConflict.series });
  const refreshedRequests = await mountOwnerLinks({ surface: refreshed, fetch: async (request, options) =>
    runtime.fetchApi(request.url, runtimeRequestOptions(options), { session: 'creator-a' }) });
  await refreshed.publish.dispatch('click'); await settle(); await settle();
  assert.equal(writes(refreshedRequests).filter(({ path }) => path === '/api/creador/perfil/publicar').length, 1,
    'after inspection, the creator can manually publish from the current saved version');
  const final = await (await ownerApi(runtime, '/api/creador/perfil/', undefined, 'GET')).json();
  assert.equal(final.profile.published, true);
});

test('a 401 publish response uses session recovery; retry stays explicit after the same context returns', async () => {
  const { runtime, data } = await draftRuntime();
  const surface = createOwnerLinksSurface({ profile: data.profile, links: data.links, editableResources: data.editableResources, series: data.series });
  const publicNodes = addPublicProfileNodes(surface, data.profile);
  surface.root.dataset.sessionBinding = creatorPageSessionBinding({ accountId: 'private-account-a', isAdmin: false });
  runtime.setSession('creator-a', { principal: { state: 'anonymous' } });
  const requests = await mountOwnerLinks({ surface, fetch: async (request, options) => {
    return runtime.fetchApi(request.url, runtimeRequestOptions(options), { session: 'creator-a' });
  } });

  await surface.publish.dispatch('click'); await settle(); await settle();
  assert.equal(surface.sessionShell.hidden, false);

  runtime.setSession('creator-a', { principal: {
    state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-b', isAdmin: false,
  }, csrfToken: 'csrf-b' });
  await surface.checkSession.dispatch('click');
  await waitFor(() => surface.checkSession.hidden, 'same account session recovery completes');
  assert.equal(publicNodes.publishCheck.hidden, true);
  assert.equal(surface.publish.hidden, false, 'same-account session recovery allows an intentional retry');
  assert.equal(writes(requests).filter(({ path }) => path === '/api/creador/perfil/publicar').length, 1,
    'session recovery does not retry publish');

  await surface.publish.dispatch('click'); await settle(); await settle();
  assert.equal(writes(requests).filter(({ path }) => path === '/api/creador/perfil/publicar').length, 2,
    'only the second, explicit click retries publication');
  const retry = writes(requests).filter(({ path }) => path === '/api/creador/perfil/publicar').at(-1);
  assert.equal(retry.headers.get('x-csrf-token'), 'csrf-b', 'same-account recovery refreshes the CSRF token before retry');
  const saved = await (await ownerApi(runtime, '/api/creador/perfil/', undefined, 'GET')).json();
  assert.equal(saved.profile.published, true);
});

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

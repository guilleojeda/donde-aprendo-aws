import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCreatorOwnerRuntime } from './fixtures/creator-owner-runtime.mjs';
import { createOwnerSeriesSurface } from './fixtures/creator-owner-series-browser.mjs';
import { mountOwnerLinks, settle } from './fixtures/creator-owner-links-browser.mjs';

async function api(runtime, path, body, method = 'PUT', session = 'creator-a') {
  const response = await runtime.fetchApi(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': session === 'creator-a' ? 'csrf-a' : `csrf-${session}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, { session });
  assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`);
  return response;
}

async function ownerData(runtime, session = 'creator-a') {
  return (await api(runtime, '/api/creador/perfil/', undefined, 'GET', session)).json();
}

function requestOptions(options, session = 'creator-a') {
  const headers = new Headers(options.headers);
  if (options.method !== 'GET') headers.set('origin', 'https://dondeaprendoaws.com');
  return { ...options, headers };
}

async function profileFixture(runtime, slug = 'ana-series-recovery', session = 'creator-a') {
  await api(runtime, '/api/creador/perfil/', { displayName: 'Ana', slug }, 'PUT', session);
  return ownerData(runtime, session);
}

async function mount(runtime, initial, { fetch: overrideFetch, query } = {}) {
  const surface = createOwnerSeriesSurface({ ...initial, query });
  const requests = await mountOwnerLinks({
    surface,
    fetch: overrideFetch ?? ((request, options) => runtime.fetchApi(request.url, requestOptions(options))),
  });
  return { surface, requests };
}

async function openCreate(surface, { name, slug, description }) {
  await surface.seriesCreateOpen.dispatch('click');
  surface.seriesFormFields.name.value = name;
  surface.seriesFormFields.slug.value = slug;
  surface.seriesFormFields.description.value = description;
  await surface.seriesFormFields.slug.dispatch('input');
}

async function compare(surface) {
  const button = surface.seriesFormConflict.querySelector('[data-owner-compare]');
  assert.equal(surface.seriesFormConflict.hidden, false, 'recovery exposes the existing explicit compare action');
  await button.dispatch('click');
  await settle();
  await settle();
  return {
    text: surface.seriesFormConflict.querySelector('[data-owner-comparison]').textContent,
    adopt: surface.seriesFormConflict.querySelector('[data-owner-adopt]'),
  };
}

async function submit(surface) {
  await surface.seriesForm.dispatch('submit');
  await settle();
  await settle();
}

test('new-series profile conflict can adopt the current profile version and manually retry once', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const initial = await profileFixture(runtime);
  const { surface, requests } = await mount(runtime, initial);
  await openCreate(surface, { name: 'Ruta pendiente', slug: 'ruta-pendiente', description: 'Descripción conservada' });

  await api(runtime, '/api/creador/perfil/', {
    displayName: 'Ana actualizada en otra pestaña', version: initial.profile.version,
  });
  await submit(surface);
  assert.deepEqual(requests.filter(({ method }) => method === 'POST').map(({ status }) => status), [409]);
  assert.equal(surface.seriesFormConflict.hidden, false);

  const compared = await compare(surface);
  assert.match(compared.text, /Perfil guardado, versión 2/);
  assert.match(compared.text, /No hay una serie activa/);
  assert.equal(compared.adopt.hidden, false);
  assert.match(compared.adopt.textContent, /versión actual del perfil/i);
  await compared.adopt.dispatch('click');
  assert.equal(surface.seriesFormFields.name.value, 'Ruta pendiente');
  assert.equal(surface.seriesFormFields.slug.value, 'ruta-pendiente');
  assert.equal(surface.seriesFormFields.description.value, 'Descripción conservada');
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1,
    'comparison and adoption never replay the create request');

  await submit(surface);
  const posts = requests.filter(({ method }) => method === 'POST');
  assert.deepEqual(posts.map(({ status, body }) => ({ status, profileVersion: body.profileVersion })), [
    { status: 409, profileVersion: initial.profile.version },
    { status: 201, profileVersion: 2 },
  ]);
  assert.equal((await ownerData(runtime)).series[0].slug, 'ruta-pendiente');
});

test('a lost create response blocks another POST and compares the original slug before a manual PATCH', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const initial = await profileFixture(runtime, 'ana-lost-series');
  let loseResponse = true;
  const { surface, requests } = await mount(runtime, initial, {
    fetch: async (request, options) => {
      const response = await runtime.fetchApi(request.url, requestOptions(options));
      if (loseResponse && request.method === 'POST' && request.path === '/api/creador/series') {
        loseResponse = false;
        surface.seriesFormFields.name.value = 'Corrección posterior';
        surface.seriesFormFields.slug.value = 'ruta-corregida';
        surface.seriesFormFields.description.value = 'Descripción posterior';
        throw new Error('response lost after the real service committed');
      }
      return response;
    },
    query: { buscarSeries: 'ruta' },
  });
  await openCreate(surface, { name: 'Ruta enviada', slug: 'ruta-enviada', description: 'Descripción enviada' });
  await submit(surface);

  const savedAfterLoss = await ownerData(runtime);
  assert.equal(savedAfterLoss.series.length, 1);
  assert.equal(savedAfterLoss.series[0].slug, 'ruta-enviada');
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1,
    'an uncertain create is never replayed automatically');
  assert.equal(surface.seriesFormConflict.hidden, false,
    'the user can check the state without first retrying POST');

  await submit(surface);
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1,
    'Save cannot replace the unresolved create identity or send a changed slug');
  assert.match(surface.seriesFormStatus.textContent, /Compara el alta original/);
  assert.equal((await ownerData(runtime)).series.length, 1);

  const compared = await compare(surface);
  assert.match(compared.text, /Serie guardada, versión 1/);
  assert.match(compared.text, /Dirección guardada: ruta-enviada/);
  assert.match(compared.text, /Tu corrección: ruta-corregida/);
  assert.match(compared.text, /Corrección posterior/);
  assert.equal(compared.adopt.hidden, false);
  await compared.adopt.dispatch('click');
  assert.equal(surface.seriesFormFields.name.value, 'Corrección posterior');
  assert.equal(surface.seriesFormFields.slug.value, 'ruta-corregida');
  assert.equal(surface.seriesFormFields.description.value, 'Descripción posterior');
  assert.match(surface.dialogTitle.textContent, /Editar serie: Ruta enviada/);
  assert.equal(surface.window.location.search, '?vista=series&buscarSeries=ruta&paginaSeries=1',
    'adopting the owner snapshot keeps the series query');
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1);

  await submit(surface);
  const writes = requests.filter(({ method }) => method === 'POST' || method === 'PATCH');
  assert.deepEqual(writes.map(({ method, path, status, body }) => ({ method, path, status, body })), [
    {
      method: 'POST', path: '/api/creador/series', status: undefined,
      body: { name: 'Ruta enviada', slug: 'ruta-enviada', description: 'Descripción enviada', profileVersion: 1 },
    },
    {
      method: 'PATCH', path: `/api/creador/series/${savedAfterLoss.series[0].id}`, status: 200,
      body: { version: 1, profileVersion: 2, name: 'Corrección posterior', slug: 'ruta-corregida', description: 'Descripción posterior' },
    },
  ]);
  const saved = await ownerData(runtime);
  assert.equal(saved.series[0].name, 'Corrección posterior');
  assert.equal(saved.series[0].slug, 'ruta-corregida');
  assert.equal(saved.series[0].description, 'Descripción posterior');
});

test('edits during compare are displayed, while edits after compare must be checked again', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const initial = await profileFixture(runtime, 'ana-series-compare-edits');
  let loseResponse = true;
  let holdCompare = false;
  let release;
  let markStarted;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { markStarted = resolve; });
  const { surface, requests } = await mount(runtime, initial, {
    fetch: async (request, options) => {
      const response = await runtime.fetchApi(request.url, requestOptions(options));
      if (loseResponse && request.method === 'POST' && request.path === '/api/creador/series') {
        loseResponse = false;
        throw new Error('response lost after the real service committed');
      }
      if (holdCompare && request.method === 'GET' && request.path === '/api/creador/perfil') {
        holdCompare = false;
        markStarted();
        await gate;
      }
      return response;
    },
  });
  await openCreate(surface, { name: 'Ruta de comparación', slug: 'ruta-comparacion', description: 'Descripción enviada' });
  await submit(surface);

  holdCompare = true;
  const comparing = surface.seriesFormConflict.querySelector('[data-owner-compare]').dispatch('click');
  await started;
  surface.seriesFormFields.description.value = 'Corrección durante la comparación';
  release();
  await comparing;
  await settle();
  await settle();
  const comparison = surface.seriesFormConflict.querySelector('[data-owner-comparison]');
  const adopt = surface.seriesFormConflict.querySelector('[data-owner-adopt]');
  assert.match(comparison.textContent, /Corrección durante la comparación/);
  assert.equal(adopt.hidden, false);

  surface.seriesFormFields.name.value = 'Corrección posterior a la comparación';
  await adopt.dispatch('click');
  assert.equal(adopt.hidden, true, 'a stale comparison cannot be adopted');
  assert.match(surface.seriesFormStatus.textContent, /Vuelve a comparar/);
  assert.equal(surface.seriesFormFields.description.value, 'Corrección durante la comparación');
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1);

  const refreshed = await compare(surface);
  assert.equal(refreshed.adopt.hidden, false);
  await refreshed.adopt.dispatch('click');
  assert.equal(surface.seriesFormFields.name.value, 'Corrección posterior a la comparación');
  assert.equal(surface.seriesFormFields.description.value, 'Corrección durante la comparación');
  await submit(surface);
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1);
  assert.equal(requests.filter(({ method }) => method === 'PATCH').length, 1);
  const saved = await ownerData(runtime);
  assert.equal(saved.series[0].name, 'Corrección posterior a la comparación');
  assert.equal(saved.series[0].description, 'Corrección durante la comparación');
});

test('a precommit connection failure offers a check and only a user-requested manual retry', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const initial = await profileFixture(runtime, 'ana-precommit-series');
  let failBeforeCommit = true;
  const { surface, requests } = await mount(runtime, initial, {
    fetch: async (request, options) => {
      if (failBeforeCommit && request.method === 'POST' && request.path === '/api/creador/series') {
        failBeforeCommit = false;
        throw new Error('connection ended before the service received the request');
      }
      return runtime.fetchApi(request.url, requestOptions(options));
    },
  });
  await openCreate(surface, { name: 'Ruta sin envío', slug: 'ruta-sin-envio', description: 'Sigue aquí' });
  await submit(surface);
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1);
  assert.equal((await ownerData(runtime)).series.length, 0);

  const compared = await compare(surface);
  assert.match(compared.text, /Perfil guardado, versión 1/);
  assert.match(compared.text, /Esta comprobación no muestra una serie activa/);
  assert.equal(compared.adopt.hidden, false,
    'the unchanged profile version proves no create committed');
  await compared.adopt.dispatch('click');
  assert.equal(surface.seriesFormFields.description.value, 'Sigue aquí');
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1);

  await submit(surface);
  assert.deepEqual(requests.filter(({ method }) => method === 'POST').map(({ status, body }) => ({ status, profileVersion: body.profileVersion })), [
    { status: undefined, profileVersion: 1 },
    { status: 201, profileVersion: 1 },
  ]);
  assert.equal((await ownerData(runtime)).series.length, 1);
});

test('a valid create receipt still binds corrections entered during the request to a later edit', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const initial = await profileFixture(runtime, 'ana-valid-series');
  let release;
  let markStarted;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { markStarted = resolve; });
  const { surface, requests } = await mount(runtime, initial, {
    fetch: async (request, options) => {
      if (request.method === 'POST' && request.path === '/api/creador/series') {
        markStarted();
        await gate;
      }
      return runtime.fetchApi(request.url, requestOptions(options));
    },
  });
  await openCreate(surface, { name: 'Ruta válida', slug: 'ruta-valida', description: 'Descripción enviada' });
  const saving = surface.seriesForm.dispatch('submit');
  await started;
  surface.seriesFormFields.description.value = 'Corrección tardía';
  release();
  await saving;
  await settle();

  const created = (await ownerData(runtime)).series[0];
  assert.equal(created.description, 'Descripción enviada');
  assert.equal(surface.seriesFormFields.description.value, 'Corrección tardía');
  assert.match(surface.dialogTitle.textContent, /Editar serie: Ruta válida/);
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1);
  assert.equal(surface.seriesFormConflict.hidden, true,
    'a valid receipt does not expose recovery controls');
  await submit(surface);
  assert.equal(requests.filter(({ method }) => method === 'PATCH').length, 1,
    'the late correction uses the accepted series ID rather than another create');
  assert.equal((await ownerData(runtime)).series[0].description, 'Corrección tardía');
});

test('an uncertain creation whose series was renamed is not guessed from later form values', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const initial = await profileFixture(runtime, 'ana-renamed-series');
  let loseResponse = true;
  const { surface, requests } = await mount(runtime, initial, {
    fetch: async (request, options) => {
      const response = await runtime.fetchApi(request.url, requestOptions(options));
      if (loseResponse && request.method === 'POST' && request.path === '/api/creador/series') {
        loseResponse = false;
        throw new Error('response lost after the real service committed');
      }
      return response;
    },
  });
  await openCreate(surface, { name: 'Ruta original', slug: 'ruta-original', description: 'Descripción original' });
  await submit(surface);
  const saved = (await ownerData(runtime)).series[0];
  await api(runtime, `/api/creador/series/${saved.id}`, {
    version: saved.version, profileVersion: 2, name: 'Ruta renombrada', slug: 'ruta-renombrada', description: 'Descripción original',
  }, 'PATCH');
  surface.seriesFormFields.name.value = 'Nombre que escribió después';
  surface.seriesFormFields.slug.value = 'slug-que-escribio-despues';
  surface.seriesFormFields.description.value = 'Descripción que escribió después';

  const compared = await compare(surface);
  assert.match(compared.text, /no encontramos una serie activa con la dirección inicial «ruta-original»/i);
  assert.match(compared.text, /pudo cambiar de dirección o eliminarse/i);
  assert.equal(compared.adopt.hidden, true,
    'the current owner DTO cannot safely link the old slug alias to a series ID');
  assert.equal(surface.seriesFormFields.name.value, 'Nombre que escribió después');
  assert.equal(surface.seriesFormFields.slug.value, 'slug-que-escribio-despues');
  assert.equal(surface.seriesFormFields.description.value, 'Descripción que escribió después');
  assert.equal(requests.filter(({ method }) => method === 'POST' || method === 'PATCH').length, 1,
    'checking an unidentifiable record does not retry or write');
  assert.equal((await ownerData(runtime)).series[0].slug, 'ruta-renombrada');
});

test('an uncertain creation deleted after commit reports the retained alias and cannot adopt a missing record', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const initial = await profileFixture(runtime, 'ana-deleted-series');
  let loseResponse = true;
  const { surface, requests } = await mount(runtime, initial, {
    fetch: async (request, options) => {
      const response = await runtime.fetchApi(request.url, requestOptions(options));
      if (loseResponse && request.method === 'POST' && request.path === '/api/creador/series') {
        loseResponse = false;
        throw new Error('response lost after the real service committed');
      }
      return response;
    },
  });
  await openCreate(surface, { name: 'Ruta retirada', slug: 'ruta-retirada', description: 'Descripción pendiente' });
  await submit(surface);
  const saved = (await ownerData(runtime)).series[0];
  await api(runtime, `/api/creador/series/${saved.id}`, { version: saved.version, profileVersion: 2 }, 'DELETE');

  const compared = await compare(surface);
  assert.match(compared.text, /no encontramos una serie activa con la dirección inicial «ruta-retirada»/i);
  assert.match(compared.text, /las direcciones anteriores pueden seguir reservadas/i);
  assert.equal(compared.adopt.hidden, true);
  assert.equal(surface.seriesFormFields.description.value, 'Descripción pendiente');
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1);
  assert.equal((await ownerData(runtime)).series.length, 0);
  const publicAlias = await runtime.fetchApi('/c/ana-deleted-series/series/ruta-retirada/', {}, { session: 'creator-a' });
  assert.equal(publicAlias.status, 404, 'the deleted series alias remains reserved but no longer resolves publicly');
});

test('a compare response for a changed account cannot update the active profile or series draft', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const initial = await profileFixture(runtime, 'ana-account-series');
  runtime.setSession('creator-b');
  await profileFixture(runtime, 'beto-series', 'creator-b');
  let currentSession = 'creator-a';
  let blockRead = false;
  let release;
  let markStarted;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { markStarted = resolve; });
  const { surface, requests } = await mount(runtime, initial, {
    fetch: async (request, options) => {
      if (blockRead && request.method === 'GET' && request.path === '/api/creador/perfil') {
        markStarted();
        await gate;
        return runtime.fetchApi(request.url, requestOptions(options), { session: currentSession });
      }
      return runtime.fetchApi(request.url, requestOptions(options), { session: currentSession });
    },
  });
  await openCreate(surface, { name: 'Ruta de Ana', slug: 'ruta-de-ana', description: 'Borrador de Ana' });
  await api(runtime, '/api/creador/perfil/', { displayName: 'Ana actualizada', version: initial.profile.version });
  await submit(surface);
  assert.equal(surface.seriesFormConflict.hidden, false);

  blockRead = true;
  await surface.seriesFormConflict.querySelector('[data-owner-compare]').dispatch('click');
  await started;
  currentSession = 'creator-b';
  release();
  await settle();
  await settle();
  const comparison = surface.seriesFormConflict.querySelector('[data-owner-comparison]');
  assert.equal(comparison.hidden, true);
  assert.equal(surface.seriesFormConflict.querySelector('[data-owner-adopt]').hidden, true);
  assert.equal(surface.seriesFormFields.description.value, 'Borrador de Ana');
  assert.equal(requests.filter(({ method }) => method === 'POST').length, 1,
    'account change and compare do not replay series creation');
});

test('a compare response that arrives after the editor closes cannot reveal or adopt stale data', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const initial = await profileFixture(runtime, 'ana-stale-series');
  let blockRead = false;
  let release;
  let markStarted;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { markStarted = resolve; });
  const { surface } = await mount(runtime, initial, {
    fetch: async (request, options) => {
      if (blockRead && request.method === 'GET' && request.path === '/api/creador/perfil') {
        markStarted();
        await gate;
      }
      return runtime.fetchApi(request.url, requestOptions(options));
    },
  });
  await openCreate(surface, { name: 'Ruta con lectura tardía', slug: 'ruta-lectura-tardia', description: 'No perder' });
  // A definite profile conflict exposes the compare action without creating this series.
  await api(runtime, '/api/creador/perfil/', { displayName: 'Ana actualizada', version: initial.profile.version });
  await submit(surface);
  blockRead = true;
  await surface.seriesFormConflict.querySelector('[data-owner-compare]').dispatch('click');
  await started;
  await surface.seriesForm.querySelector('[data-owner-cancel]').dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.seriesForm.hidden, true);
  release();
  await settle();
  await settle();
  assert.equal(surface.seriesForm.hidden, true);
  assert.equal(surface.seriesFormConflict.hidden, true);
  assert.equal(surface.seriesFormConflict.querySelector('[data-owner-adopt]').hidden, true);
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { callApi, createCreatorPagesHarness, createDocumentStore, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';

// Approved owner design D2: one Save commits a link's metadata and placement
// options together. The old independent routes remain compatible consumers.
async function api(harness, path, body, { session = 'creator-a', method = 'PATCH', ...options } = {}) {
  return callApi(harness, path, { session, csrf: sessionCsrf[session], method, ...(body === undefined ? {} : { body }), ...options });
}

async function ok(response, statuses = [200]) {
  const body = await responseJson(response);
  assert.ok(statuses.includes(response.status), `HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function editor(harness, session = 'creator-a') {
  return ok(await api(harness, '/api/creador/perfil', undefined, { session, method: 'GET' }));
}

async function fixture({ series = false, store = createDocumentStore() } = {}) {
  const harness = await createCreatorPagesHarness({ store });
  await ok(await api(harness, '/api/creador/perfil', { displayName: 'Ana', slug: 'ana-atomic' }, { method: 'PUT' }));
  await ok(await api(harness, '/api/creador/perfil/publicar', {}, { method: 'POST' }));
  const first = await ok(await api(harness, '/api/creador/enlaces', {
    title: 'Título inicial', url: 'https://example.invalid/atomic-initial', description: 'Descripción inicial',
  }, { method: 'POST' }), [200, 201]);
  await ok(await api(harness, '/api/creador/enlaces', {
    title: 'Vecino', url: 'https://example.invalid/atomic-neighbor',
  }, { method: 'POST' }), [200, 201]);
  let observed = await editor(harness);
  if (series) {
    const created = await ok(await api(harness, '/api/creador/series', {
      name: 'Serie que se conserva', slug: 'serie-atomic', profileVersion: observed.profile.version,
    }, { method: 'POST' }), [201]);
    observed = await editor(harness);
    const link = observed.links.find((item) => item.placementId === first.link.placementId);
    await ok(await api(harness, `/api/creador/series/${created.series.id}/capitulos/${link.placementId}`, {
      profileVersion: observed.profile.version,
    }, { method: 'PUT' }));
    observed = await editor(harness);
  }
  const link = observed.links.find((item) => item.placementId === first.link.placementId);
  return { harness, observed, link, path: `/api/creador/enlaces/${link.placementId}/editar` };
}

function versions({ observed, link }) {
  return { profileVersion: observed.profile.version, placementVersion: link.placementVersion, resourceVersion: link.resourceVersion };
}

function changes(body) {
  return [...body.versionChanges].sort((a, b) => `${a.entity}:${a.id}`.localeCompare(`${b.entity}:${b.id}`));
}

async function snapshot(store) {
  return (await store.list('')).sort((a, b) => a.key.localeCompare(b.key));
}

function urlKey(url) { return `url:${createHash('sha256').update(url, 'utf8').digest('hex')}`; }

test('Guardar confirma ficha, URL, opciones y recibos juntos; conserva series, vecinos y visibilidad pública', async () => {
  const state = await fixture({ series: true });
  const { harness, observed, link } = state;
  const neighbor = observed.links.find((item) => item.placementId !== link.placementId);
  const start = harness.store.calls.length;
  const saved = await ok(await api(harness, state.path, {
    ...versions(state), title: 'Título confirmado', url: 'https://example.invalid/atomic-new', description: '',
    featured: true, selectedForDirectory: false,
  }));
  assert.equal(harness.store.calls.slice(start).filter((call) => call.operation === 'transact').length, 1,
    'one link intention must not commit metadata and options in separate transactions');
  assert.equal(saved.link.title, 'Título confirmado');
  assert.equal(saved.link.url, 'https://example.invalid/atomic-new');
  assert.equal(saved.link.description ?? '', '');
  assert.equal(saved.link.featured, true);
  assert.equal(saved.link.selectedForDirectory, false);
  assert.equal(saved.link.directoryApproval, 'pending', 'selection cannot grant approval');
  assert.equal(saved.link.position, link.position, 'this phase does not move links');
  assert.deepEqual(saved.link.series, link.series, 'an edit response retains current series tags');
  assert.deepEqual(changes(saved), [
    { entity: 'placement', id: link.placementId, before: link.placementVersion, after: link.placementVersion + 1 },
    { entity: 'profile', id: observed.profile.id, before: observed.profile.version, after: observed.profile.version + 1 },
    { entity: 'resource', id: link.resourceId, before: link.resourceVersion, after: link.resourceVersion + 1 },
  ]);
  const current = await editor(harness);
  assert.deepEqual(current.links.find((item) => item.placementId === neighbor.placementId), neighbor);
  assert.deepEqual(current.links.find((item) => item.placementId === link.placementId), saved.link);
  assert.equal(await harness.store.get(urlKey(link.url)), null);
  assert.equal((await harness.store.get(urlKey(saved.link.url))).resourceId, link.resourceId);
  const publicPage = await harness.service.readPublicProfile(observed.profile.slug);
  assert.equal(publicPage.status, 200);
  const publicLink = publicPage.links.find((item) => item.placementId === link.placementId);
  assert.equal(publicLink.title, saved.link.title);
  assert.equal(publicLink.url, saved.link.url);
});

test('metadata sola y opciones solas no inventan commits de entidades sin cambios; noop conserva todas las versiones', async () => {
  for (const delta of [{ title: 'Otro título' }, { featured: true }, { selectedForDirectory: false }, {}]) {
    const state = await fixture();
    const { harness, link, observed } = state;
    const body = Object.keys(delta).length ? delta : { title: link.title, featured: link.featured, selectedForDirectory: link.selectedForDirectory };
    const before = await snapshot(harness.store);
    const saved = await ok(await api(harness, state.path, { ...versions(state), ...body }));
    const expected = Object.keys(delta).length === 0 ? [] : [
      { entity: Object.hasOwn(delta, 'title') ? 'resource' : 'placement', id: Object.hasOwn(delta, 'title') ? link.resourceId : link.placementId,
        before: Object.hasOwn(delta, 'title') ? link.resourceVersion : link.placementVersion,
        after: (Object.hasOwn(delta, 'title') ? link.resourceVersion : link.placementVersion) + 1 },
      { entity: 'profile', id: observed.profile.id, before: observed.profile.version, after: observed.profile.version + 1 },
    ].sort((a, b) => a.entity.localeCompare(b.entity));
    assert.deepEqual(changes(saved), expected);
    if (!Object.keys(delta).length) assert.deepEqual(await snapshot(harness.store), before);
  }
});

test('tres versiones observadas son obligatorias, enteras seguras y no negativas; campos desconocidos no escriben', async () => {
  const state = await fixture();
  for (const field of ['profileVersion', 'placementVersion', 'resourceVersion']) {
    for (const value of [undefined, -1, '1', 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const body = { ...versions(state), title: 'No se guarda', [field]: value };
      const before = await snapshot(state.harness.store);
      const response = await api(state.harness, state.path, body);
      assert.equal(response.status, 400, `${field}=${String(value)}`);
      assert.deepEqual(await snapshot(state.harness.store), before);
    }
  }
  for (const field of ['position', 'series', 'published', 'hidden', 'directoryApproval', 'editorProfileId', 'accountId', 'isAdmin', 'version', 'unexpected']) {
    const before = await snapshot(state.harness.store);
    assert.equal((await api(state.harness, state.path, { ...versions(state), featured: true, [field]: field === 'series' ? [] : true })).status, 400, field);
    assert.deepEqual(await snapshot(state.harness.store), before);
  }
});

test('versiones stale de perfil, colocación o recurso rechazan también intenciones que coinciden con los valores actuales', async () => {
  const state = await fixture();
  for (const field of ['profileVersion', 'placementVersion', 'resourceVersion']) {
    const before = await snapshot(state.harness.store);
    const response = await api(state.harness, state.path, { ...versions(state), featured: state.link.featured, [field]: versions(state)[field] - 1 });
    assert.equal(response.status, 409, field);
    assert.deepEqual(await snapshot(state.harness.store), before);
  }
});

test('validación y colisión de URL rechazan la intención completa, incluidas sus opciones válidas', async () => {
  const state = await fixture();
  for (const delta of [
    { title: '' }, { title: 'x'.repeat(201) }, { description: 'x'.repeat(2001) },
    { url: 'javascript:alert(1)' }, { url: 'https://user:password@example.invalid/' },
    { url: `https://example.invalid/${'x'.repeat(2048)}` }, { featured: 'true' }, { selectedForDirectory: 1 },
  ]) {
    const before = await snapshot(state.harness.store);
    assert.equal((await api(state.harness, state.path, { ...versions(state), title: 'No parcial', featured: true, ...delta })).status, 422);
    assert.deepEqual(await snapshot(state.harness.store), before);
  }
  const before = await snapshot(state.harness.store);
  const response = await api(state.harness, state.path, { ...versions(state), url: 'https://example.invalid/atomic-neighbor', featured: true });
  assert.equal(response.status, 409);
  assert.equal((await responseJson(response)).error, 'URL_TAKEN');
  assert.deepEqual(await snapshot(state.harness.store), before);
});

test('una referencia compartida sólo edita opciones propias; sus metadatos siguen bajo la autoridad original', async () => {
  const state = await fixture();
  const { harness, link } = state;
  await ok(await api(harness, '/api/creador/perfil', { displayName: 'Bea', slug: 'bea-atomic' }, { method: 'PUT', session: 'creator-b' }));
  await ok(await api(harness, '/api/creador/enlaces', { title: 'No reemplaza', url: link.url }, { method: 'POST', session: 'creator-b' }), [200, 201]);
  const observed = await editor(harness, 'creator-b');
  const shared = { harness, observed, link: observed.links[0] };
  const sharedPath = `/api/creador/enlaces/${shared.link.placementId}/editar`;
  const beforeResource = await harness.store.get(`resource:${link.resourceId}`);
  const beforeOther = await editor(harness);
  const saved = await ok(await api(harness, sharedPath, { ...versions(shared), featured: true, selectedForDirectory: false }, { session: 'creator-b' }));
  assert.equal(saved.link.featured, true);
  assert.equal(saved.link.selectedForDirectory, false);
  assert.equal(saved.link.title, link.title);
  assert.ok(!saved.versionChanges.some(({ entity }) => entity === 'resource'));
  assert.deepEqual(await harness.store.get(`resource:${link.resourceId}`), beforeResource);
  assert.deepEqual(await editor(harness), beforeOther);
  const updated = await editor(harness, 'creator-b');
  for (const delta of [{ title: link.title }, { url: link.url }, { description: '' }]) {
    const before = await snapshot(harness.store);
    assert.equal((await api(harness, sharedPath, { ...versions({ observed: updated, link: updated.links[0] }), ...delta }, { session: 'creator-b' })).status, 403,
      'metadata authority is checked even when the submitted value has not changed');
    assert.deepEqual(await snapshot(harness.store), before);
  }
});

test('no se puede editar una colocación ajena ni convertir un recurso retirado en una colocación por editar', async () => {
  const state = await fixture();
  await ok(await api(state.harness, '/api/creador/perfil', { displayName: 'Bea', slug: 'bea-other' }, { method: 'PUT', session: 'creator-b' }));
  const before = await snapshot(state.harness.store);
  const foreign = await api(state.harness, state.path, { ...versions(state), featured: true }, { session: 'creator-b' });
  assert.equal(foreign.status, 404);
  assert.equal((await responseJson(foreign)).error, 'PLACEMENT_NOT_FOUND');
  assert.deepEqual(await snapshot(state.harness.store), before);
  assert.equal((await api(state.harness, `/api/creador/enlaces/${state.link.placementId}`, { profileVersion: state.observed.profile.version }, { method: 'DELETE' })).status, 204);
  const removed = await snapshot(state.harness.store);
  const missing = await api(state.harness, state.path, { ...versions(state), featured: true });
  assert.equal(missing.status, 404);
  assert.equal((await responseJson(missing)).error, 'PLACEMENT_NOT_FOUND');
  assert.deepEqual(await snapshot(state.harness.store), removed);
});

test('una carrera sobre cualquiera de las tres entidades o la reserva de destino no deja un commit parcial', async () => {
  for (const [conflict, noop] of [['profile', false], ['placement', false], ['resource', false], ['url', false], ['profile', true], ['placement', true], ['resource', true]]) {
    const store = createDocumentStore();
    const state = await fixture({ store });
    const originalTransact = store.transact.bind(store);
    let injected = false;
    let afterExternal;
    store.transact = async (transaction) => {
      if (!injected) {
        injected = true;
        const key = conflict === 'url' ? urlKey('https://example.invalid/racing-destination')
          : conflict === 'profile' ? `profile:${state.observed.profile.id}`
            : conflict === 'resource' ? `resource:${state.link.resourceId}`
              : `placement:${state.observed.profile.id}:${state.link.placementId}`;
        const current = await store.get(key);
        const value = current ? { ...current, version: current.version + 1 } : {
          recordType: 'urlReservation', url: 'https://example.invalid/racing-destination', resourceId: 'racing-resource', status: 'reserved', version: 1,
        };
        assert.equal(await originalTransact({ checks: [{ key, version: current?.version ?? null }], puts: [{ key, value }] }), true);
        afterExternal = await snapshot(store);
      }
      return originalTransact(transaction);
    };
    const response = await api(state.harness, state.path, { ...versions(state), ...(noop
      ? { title: state.link.title, featured: state.link.featured }
      : { title: 'Debe ser atómico', url: 'https://example.invalid/racing-destination', featured: true, selectedForDirectory: false }) });
    assert.equal(response.status, 409, conflict);
    assert.equal(injected, true, 'the valid command must reach its conditional commit');
    assert.deepEqual(await snapshot(store), afterExternal, `only the external ${conflict} commit may survive`);
  }
});

test('versión cero y registro de evento conservan identidad y usan la reserva de registrationUrl al editar', async () => {
  const state = await fixture();
  const { harness, link, observed } = state;
  const resourceKey = `resource:${link.resourceId}`;
  const placementKey = `placement:${observed.profile.id}:${link.placementId}`;
  const profileKey = `profile:${observed.profile.id}`;
  const resource = await harness.store.get(resourceKey);
  const placement = await harness.store.get(placementKey);
  const profile = await harness.store.get(profileKey);
  const event = { ...resource, recordType: 'event', registrationUrl: resource.url, version: 0 };
  delete event.url;
  assert.equal(await harness.store.transact({
    checks: [{ key: resourceKey, version: resource.version }, { key: placementKey, version: placement.version }, { key: profileKey, version: profile.version }],
    puts: [{ key: resourceKey, value: event }, { key: placementKey, value: { ...placement, version: 0 } }, { key: profileKey, value: { ...profile, version: 0 } }],
  }), true);
  const saved = await ok(await api(harness, state.path, {
    profileVersion: 0, placementVersion: 0, resourceVersion: 0,
    title: 'Evento actualizado', url: 'https://example.invalid/event-registration', featured: true,
  }));
  assert.equal(saved.link.resourceId, link.resourceId);
  assert.equal(saved.link.url, 'https://example.invalid/event-registration');
  assert.deepEqual(saved.versionChanges.map(({ before, after }) => [before, after]), [[0, 1], [0, 1], [0, 1]]);
  const stored = await harness.store.get(resourceKey);
  assert.equal(stored.registrationUrl, saved.link.url);
  assert.equal(Object.hasOwn(stored, 'url'), false);
  assert.equal(await harness.store.get(urlKey(link.url)), null);
  assert.equal((await harness.store.get(urlKey(saved.link.url))).resourceId, link.resourceId);
});

test('fallo de almacenamiento conserva ficha, opciones y ambas reservas de URL', async () => {
  const state = await fixture();
  const before = await snapshot(state.harness.store);
  state.harness.store.failNext('transact');
  const response = await api(state.harness, state.path, { ...versions(state), title: 'No parcial', url: 'https://example.invalid/uncommitted', featured: true });
  assert.equal(response.status, 503);
  assert.deepEqual(await snapshot(state.harness.store), before);
});

test('respuesta de Guardar corresponde al commit confirmado aunque otra escritura se complete antes del acuse', async () => {
  const store = createDocumentStore();
  const state = await fixture({ store });
  const originalTransact = store.transact.bind(store);
  let raced = false;
  store.transact = async (transaction) => {
    const committed = await originalTransact(transaction);
    if (committed && !raced) {
      raced = true;
      const key = `resource:${state.link.resourceId}`;
      const current = await store.get(key);
      await originalTransact({ checks: [{ key, version: current.version }], puts: [{ key, value: { ...current, title: 'Cambio posterior', version: current.version + 1 } }] });
    }
    return committed;
  };
  const saved = await ok(await api(state.harness, state.path, { ...versions(state), title: 'Versión que envié', featured: true }));
  assert.equal(saved.link.title, 'Versión que envié');
  assert.equal(saved.link.resourceVersion, state.link.resourceVersion + 1);
  assert.equal((await editor(state.harness)).links.find(({ placementId }) => placementId === state.link.placementId).title, 'Cambio posterior');
});

test('el nuevo comando preserva autenticación, origen, CSRF, método y límites de cuerpo', async () => {
  const state = await fixture();
  for (const options of [
    { session: null, csrf: undefined, expected: 401 },
    { origin: 'https://evil.invalid', expected: 403 },
    { origin: null, expected: 403 },
    { csrf: 'incorrect', expected: 403 },
    { method: 'POST', expected: 405 },
    { method: 'GET', expected: 405, noBody: true },
  ]) {
    const { expected, noBody, ...requestOptions } = options;
    const before = await snapshot(state.harness.store);
    const response = await api(state.harness, state.path, noBody ? undefined : { ...versions(state), featured: true }, requestOptions);
    assert.equal(response.status, expected);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.deepEqual(await snapshot(state.harness.store), before);
  }
  const before = await snapshot(state.harness.store);
  assert.equal((await api(state.harness, state.path, { ...versions(state), description: 'x'.repeat(33 * 1024), featured: true })).status, 413);
  assert.deepEqual(await snapshot(state.harness.store), before);
});

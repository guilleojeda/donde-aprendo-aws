import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentUrlCollision, currentUrlKey } from '../src/lib/catalog-url.mjs';
import { CREATOR_CONTRACT_VERSION } from '../src/lib/creator-values.mjs';
import { callApi, createCreatorPagesHarness, createDocumentStore, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';

async function api(harness, path, body, { session = 'creator-a', method = 'PATCH', ...options } = {}) {
  return callApi(harness, path, {
    session,
    csrf: sessionCsrf[session],
    ...(method === 'GET' ? {} : { creatorContract: CREATOR_CONTRACT_VERSION }),
    method,
    ...(body === undefined ? {} : { body }),
    ...options,
  });
}

async function owner(harness, session = 'creator-a') {
  const response = await api(harness, '/api/creador/perfil', undefined, { session, method: 'GET' });
  assert.equal(response.status, 200, await response.clone().text());
  const snapshot = await responseJson(response);
  assert.equal(snapshot.schemaVersion, 3);
  assert.equal(Object.hasOwn(snapshot.profile ?? {}, 'version'), false);
  assert.equal(Object.hasOwn(snapshot, 'links'), false);
  return snapshot;
}

async function jsonCommand(harness, path, body, { session = 'creator-a', method = 'POST', statuses = [200] } = {}) {
  const response = await api(harness, path, body, { session, method });
  const result = await responseJson(response);
  assert.ok(statuses.includes(response.status), `HTTP ${response.status}: ${JSON.stringify(result)}`);
  assert.equal(result.schemaVersion, 2);
  return { response, result };
}

async function profile(harness, session, { slug, displayName = session } = {}) {
  const before = await owner(harness, session);
  const { result } = await jsonCommand(harness, '/api/creador/perfil', {
    creatorVersion: before.profile ? before.creatorVersion : null,
    displayName,
    slug,
  }, { session, method: 'PUT' });
  assert.equal(result.operation, 'save-profile');
  return result;
}

async function add(harness, session, { title, url, description } = {}) {
  const before = await owner(harness, session);
  const { result } = await jsonCommand(harness, '/api/creador/enlaces', {
    creatorVersion: before.creatorVersion,
    title,
    url,
    ...(description === undefined ? {} : { description }),
  }, { session, statuses: [200, 201] });
  assert.equal(result.operation, 'add-link');
  return result;
}

function resourceFrom(snapshot, id) {
  const resource = snapshot.resources.find((item) => item.id === id);
  assert.ok(resource, `owner snapshot includes resource ${id}`);
  return resource;
}

async function fixture({ store = createDocumentStore(), withSeries = false } = {}) {
  const harness = await createCreatorPagesHarness({ store });
  await profile(harness, 'creator-a', { displayName: 'Ana', slug: 'ana-atomic' });
  let current = await owner(harness);
  const publish = await jsonCommand(harness, '/api/creador/perfil/publicar', {
    creatorVersion: current.creatorVersion,
  }, { method: 'POST' });
  assert.equal(publish.result.operation, 'publish-profile');
  current = await owner(harness);
  const first = await add(harness, 'creator-a', {
    title: 'Título inicial', url: 'https://example.invalid/atomic-initial', description: 'Descripción inicial',
  });
  const second = await add(harness, 'creator-a', {
    title: 'Vecino', url: 'https://example.invalid/atomic-neighbor',
  });
  current = await owner(harness);
  let seriesId;
  if (withSeries) {
    const created = await jsonCommand(harness, '/api/creador/series', {
      creatorVersion: current.creatorVersion,
      name: 'Serie que se conserva',
      slug: 'serie-atomic',
    }, { statuses: [200, 201] });
    assert.equal(created.result.operation, 'create-series');
    seriesId = created.result.seriesId;
    current = await owner(harness);
    const chapter = await jsonCommand(harness,
      `/api/creador/series/${seriesId}/capitulos/${first.placementId}`,
      { creatorVersion: current.creatorVersion }, { method: 'PUT' });
    assert.equal(chapter.result.operation, 'add-chapter');
  }
  current = await owner(harness);
  const resource = resourceFrom(current, first.resourceId);
  const placement = current.placements[first.placementId];
  return {
    harness,
    current,
    first,
    second,
    resource,
    placement,
    seriesId,
    path: `/api/creador/enlaces/${first.placementId}/editar`,
  };
}

async function rows(store) {
  return (await store.list('')).sort((left, right) => left.key.localeCompare(right.key));
}

test('one combined edit commits metadata and placement options atomically, then the full read and public view agree', async () => {
  const state = await fixture({ withSeries: true });
  const { harness, current, first, second, resource, seriesId } = state;
  const transactionsBefore = harness.store.calls.filter((call) => call.operation === 'transact').length;

  const { result: saved } = await jsonCommand(harness, state.path, {
    creatorVersion: current.creatorVersion,
    resourceVersion: resource.version,
    title: '  Título confirmado  ',
    url: 'https://example.invalid/atomic-new',
    description: '',
    featured: true,
    selectedForDirectory: false,
  }, { method: 'PATCH' });

  assert.equal(saved.operation, 'edit-link');
  assert.equal(saved.disposition, 'saved');
  assert.equal(saved.profileId, current.profile.id);
  assert.equal(saved.placementId, first.placementId);
  assert.equal(saved.resourceId, first.resourceId);
  assert.equal(saved.creatorVersion, current.creatorVersion + 1);
  assert.equal(saved.resourceVersion, resource.version + 1);
  assert.equal(Object.hasOwn(saved, 'versionChanges'), false,
    'the owner content contract carries no granular effects');
  assert.equal(Object.hasOwn(saved, 'link'), false,
    'a command acknowledgement does not patch the owner snapshot');
  const afterRows = await rows(harness.store);
  const addedTransactions = harness.store.calls.filter((call) => call.operation === 'transact').length - transactionsBefore;
  assert.equal(addedTransactions, 1, 'metadata and placement options share one conditional transaction');
  const editTransaction = harness.store.calls.filter((call) => call.operation === 'transact').at(-1).input;
  assert.deepEqual(editTransaction.puts.map(({ key }) => key).filter((key) => key.startsWith('placement:')), [],
    'the content edit does not write a versioned placement row');
  assert.ok(afterRows.some(({ key }) => key === `profile:${current.profile.id}`),
    'the resulting content remains in the existing profile record');

  const after = await owner(harness);
  assert.equal(after.creatorVersion, saved.creatorVersion);
  assert.equal(resourceFrom(after, first.resourceId).title, 'Título confirmado');
  assert.equal(resourceFrom(after, first.resourceId).url, 'https://example.invalid/atomic-new');
  assert.equal(resourceFrom(after, first.resourceId).description, '');
  assert.deepEqual(after.placements[first.placementId], { resourceId: first.resourceId, selectedForDirectory: false });
  assert.deepEqual(after.order, { featured: [first.placementId], ordinary: [second.placementId] });
  assert.deepEqual(after.series[seriesId].chapters, [first.placementId]);
  assert.deepEqual(afterRows.find(({ key }) => key === currentUrlKey('https://example.invalid/atomic-initial')), undefined);
  assert.equal((await harness.store.get(currentUrlKey('https://example.invalid/atomic-new'))).resourceId, first.resourceId);
  const publicPage = await harness.service.readPublicProfile(current.profile.slug);
  assert.equal(publicPage.status, 200);
  const publicLink = publicPage.links.find((item) => item.placementId === first.placementId);
  assert.equal(publicLink.title, 'Título confirmado');
  assert.equal(publicLink.url, 'https://example.invalid/atomic-new');
});

test('resource-only metadata keeps the aggregate revision while option changes advance it and a no-op does not', async () => {
  const state = await fixture();
  const { harness, current, first, resource } = state;
  const metadata = await jsonCommand(harness, state.path, {
    creatorVersion: current.creatorVersion,
    resourceVersion: resource.version,
    title: 'Nuevo título',
  }, { method: 'PATCH' });
  assert.equal(metadata.result.disposition, 'saved');
  assert.equal(metadata.result.creatorVersion, current.creatorVersion);
  assert.equal(metadata.result.resourceVersion, resource.version + 1);
  let after = await owner(harness);
  assert.equal(after.creatorVersion, current.creatorVersion);
  assert.equal(resourceFrom(after, first.resourceId).title, 'Nuevo título');

  const options = await jsonCommand(harness, `/api/creador/enlaces/${first.placementId}`, {
    creatorVersion: after.creatorVersion,
    featured: true,
    selectedForDirectory: false,
  }, { method: 'PATCH' });
  assert.equal(options.result.operation, 'set-link-options');
  assert.equal(options.result.disposition, 'saved');
  assert.equal(options.result.creatorVersion, after.creatorVersion + 1);
  after = await owner(harness);
  assert.deepEqual(after.order, { featured: [first.placementId], ordinary: [state.second.placementId] });
  assert.equal(after.placements[first.placementId].selectedForDirectory, false);

  const beforeNoop = await rows(harness.store);
  const noop = await jsonCommand(harness, state.path, {
    creatorVersion: after.creatorVersion,
    resourceVersion: resource.version + 1,
    title: 'Nuevo título',
    featured: true,
    selectedForDirectory: false,
  }, { method: 'PATCH' });
  assert.equal(noop.result.disposition, 'unchanged');
  assert.equal(noop.result.creatorVersion, after.creatorVersion);
  assert.equal(noop.result.resourceVersion, resource.version + 1);
  assert.deepEqual(await rows(harness.store), beforeNoop, 'an unchanged command checks observations without writing');
});

test('directory-only changes keep a nonterminal link position and its chapter membership through both edit routes', async () => {
  const state = await fixture({ withSeries: true });
  let snapshot = await owner(state.harness);
  const addSecondChapter = await jsonCommand(state.harness,
    `/api/creador/series/${state.seriesId}/capitulos/${state.second.placementId}`,
    { creatorVersion: snapshot.creatorVersion }, { method: 'PUT' });
  assert.equal(addSecondChapter.result.disposition, 'added');
  snapshot = await owner(state.harness);
  assert.deepEqual(snapshot.order.ordinary, [state.first.placementId, state.second.placementId]);
  assert.deepEqual(snapshot.series[state.seriesId].chapters, [state.first.placementId, state.second.placementId]);

  const optionRoute = await jsonCommand(state.harness, `/api/creador/enlaces/${state.first.placementId}`, {
    creatorVersion: snapshot.creatorVersion,
    selectedForDirectory: false,
  }, { method: 'PATCH' });
  assert.equal(optionRoute.result.disposition, 'saved');
  snapshot = await owner(state.harness);
  assert.deepEqual(snapshot.order.ordinary, [state.first.placementId, state.second.placementId],
    'changing directory selection does not move a nonterminal ordinary link');
  assert.deepEqual(snapshot.series[state.seriesId].chapters, [state.first.placementId, state.second.placementId]);

  const editRoute = await jsonCommand(state.harness, state.path, {
    creatorVersion: snapshot.creatorVersion,
    selectedForDirectory: true,
  }, { method: 'PATCH' });
  assert.equal(editRoute.result.disposition, 'saved');
  snapshot = await owner(state.harness);
  assert.deepEqual(snapshot.order.ordinary, [state.first.placementId, state.second.placementId],
    'combined edit keeps the same position when only directory selection changes');
  assert.deepEqual(snapshot.series[state.seriesId].chapters, [state.first.placementId, state.second.placementId],
    'directory-only edits preserve chapter membership in the same series');
  assert.equal(snapshot.placements[state.first.placementId].selectedForDirectory, true);
});

test('current creator and resource observations are required even for same-value intent; unknown or malformed fields write nothing', async () => {
  const state = await fixture();
  const { harness, current, resource } = state;
  for (const [field, values] of [
    ['creatorVersion', [undefined, null, -1, '1', 1.5, Number.MAX_SAFE_INTEGER + 1]],
    ['resourceVersion', [undefined, -1, '1', 1.5, Number.MAX_SAFE_INTEGER + 1]],
  ]) {
    for (const value of values) {
      const before = await rows(harness.store);
      const body = {
        creatorVersion: current.creatorVersion,
        resourceVersion: resource.version,
        title: resource.title,
        [field]: value,
      };
      const response = await api(harness, state.path, body, { method: 'PATCH' });
      assert.equal(response.status, 400, `${field}=${String(value)}`);
      assert.deepEqual(await rows(harness.store), before);
    }
  }

  const beforeStale = await rows(harness.store);
  const staleCreator = await api(harness, state.path, {
    creatorVersion: current.creatorVersion - 1,
    resourceVersion: resource.version,
    title: resource.title,
  }, { method: 'PATCH' });
  assert.equal(staleCreator.status, 409);
  assert.deepEqual(await rows(harness.store), beforeStale);
  const staleResource = await api(harness, state.path, {
    creatorVersion: current.creatorVersion,
    resourceVersion: resource.version - 1,
    title: resource.title,
  }, { method: 'PATCH' });
  assert.equal(staleResource.status, 409);
  assert.deepEqual(await rows(harness.store), beforeStale);

  for (const [field, value] of [
    ['position', 1], ['series', []], ['published', true], ['hidden', true],
    ['directoryApproval', 'approved'], ['editorProfileId', 'another-profile'],
    ['accountId', 'private-account-a'], ['isAdmin', true], ['version', 1], ['unexpected', true],
  ]) {
    const before = await rows(harness.store);
    const response = await api(harness, state.path, {
      creatorVersion: current.creatorVersion,
      resourceVersion: resource.version,
      featured: true,
      [field]: value,
    }, { method: 'PATCH' });
    assert.equal(response.status, 400, field);
    assert.deepEqual(await rows(harness.store), before);
  }
});

test('invalid metadata or option values and a URL collision reject the entire intended edit', async () => {
  const state = await fixture();
  const before = await rows(state.harness.store);
  for (const delta of [
    { title: '' }, { title: 'x'.repeat(201) }, { description: 'x'.repeat(2001) },
    { url: 'javascript:alert(1)' }, { url: 'https://user:password@example.invalid/' },
    { url: `https://example.invalid/${'x'.repeat(2048)}` }, { featured: 'true' }, { selectedForDirectory: 1 },
  ]) {
    const response = await api(state.harness, state.path, {
      creatorVersion: state.current.creatorVersion,
      resourceVersion: state.resource.version,
      title: 'No parcial',
      featured: true,
      ...delta,
    }, { method: 'PATCH' });
    assert.equal(response.status, 422, JSON.stringify(delta));
    assert.deepEqual(await rows(state.harness.store), before);
  }
  const collision = await api(state.harness, state.path, {
    creatorVersion: state.current.creatorVersion,
    resourceVersion: state.resource.version,
    url: 'https://example.invalid/atomic-neighbor',
    featured: true,
  }, { method: 'PATCH' });
  assert.equal(collision.status, 409);
  assert.equal((await responseJson(collision)).error, 'URL_TAKEN');
  assert.deepEqual(await rows(state.harness.store), before);
});

test('a shared reference may change its own options but never acquire resource metadata authority', async () => {
  const state = await fixture();
  await profile(state.harness, 'creator-b', { displayName: 'Bea', slug: 'bea-atomic' });
  let other = await owner(state.harness, 'creator-b');
  const attached = await jsonCommand(state.harness, '/api/creador/referencias', {
    creatorVersion: other.creatorVersion,
    resourceId: state.first.resourceId,
    url: state.resource.url,
    selectedForDirectory: false,
  }, { session: 'creator-b', statuses: [200, 201] });
  assert.equal(attached.result.disposition, 'attached');
  other = await owner(state.harness, 'creator-b');
  const shared = resourceFrom(other, state.first.resourceId);
  assert.equal(shared.metadataEditable, false);
  assert.equal(shared.reincludeAllowed, false);

  const placementId = attached.result.placementId;
  const resourceBefore = await state.harness.store.get(`resource:${state.first.resourceId}`);
  const beforeOwnerA = await owner(state.harness);
  const options = await jsonCommand(state.harness, `/api/creador/enlaces/${placementId}`, {
    creatorVersion: other.creatorVersion,
    featured: true,
    selectedForDirectory: false,
  }, { session: 'creator-b', method: 'PATCH' });
  assert.equal(options.result.disposition, 'saved');
  assert.equal(options.result.creatorVersion, other.creatorVersion + 1);
  assert.deepEqual(await state.harness.store.get(`resource:${state.first.resourceId}`), resourceBefore);
  assert.deepEqual(await owner(state.harness), beforeOwnerA, 'another profile’s placement options do not alter this owner');

  const afterOptions = await owner(state.harness, 'creator-b');
  for (const title of [state.resource.title, 'Must not edit']) {
    const before = await rows(state.harness.store);
    const response = await api(state.harness, `/api/creador/enlaces/${placementId}/editar`, {
      creatorVersion: afterOptions.creatorVersion,
      resourceVersion: shared.version,
      title,
    }, { session: 'creator-b', method: 'PATCH' });
    assert.equal(response.status, 403,
      'metadata authority is checked even when the submitted value is unchanged');
    assert.deepEqual(await rows(state.harness.store), before);
  }
});

test('another owner cannot edit a placement, and editing cannot recreate a removed placement', async () => {
  const state = await fixture();
  await profile(state.harness, 'creator-b', { displayName: 'Bea', slug: 'bea-other' });
  const before = await rows(state.harness.store);
  const otherOwner = await owner(state.harness, 'creator-b');
  const foreign = await api(state.harness, state.path, {
    creatorVersion: otherOwner.creatorVersion,
    featured: true,
  }, { session: 'creator-b', method: 'PATCH' });
  assert.equal(foreign.status, 404);
  assert.equal((await responseJson(foreign)).error, 'PLACEMENT_NOT_FOUND');
  assert.deepEqual(await rows(state.harness.store), before);

  const removed = await jsonCommand(state.harness, `/api/creador/enlaces/${state.first.placementId}`, {
    creatorVersion: state.current.creatorVersion,
  }, { method: 'DELETE' });
  assert.equal(removed.result.operation, 'remove-link');
  assert.equal(removed.result.disposition, 'removed');
  const snapshot = await owner(state.harness);
  const rowsAfterRemoval = await rows(state.harness.store);
  const missing = await api(state.harness, state.path, {
    creatorVersion: snapshot.creatorVersion,
    resourceVersion: resourceFrom(snapshot, state.first.resourceId).version,
    featured: true,
  }, { method: 'PATCH' });
  assert.equal(missing.status, 404);
  assert.equal((await responseJson(missing)).error, 'PLACEMENT_NOT_FOUND');
  assert.deepEqual(await rows(state.harness.store), rowsAfterRemoval);
});

test('a concurrent creator, resource, destination reservation, or stale no-op cannot leave a partial edit', async () => {
  for (const [conflict, noop] of [
    ['profile', false], ['resource', false], ['url', false], ['profile', true], ['resource', true],
  ]) {
    const store = createDocumentStore();
    const state = await fixture({ store });
    const originalTransact = store.transact.bind(store);
    let injected = false;
    let afterExternal;
    store.transact = async (transaction) => {
      if (!injected) {
        injected = true;
        const destination = 'https://example.invalid/racing-destination';
        const key = conflict === 'url' ? currentUrlKey(destination)
          : conflict === 'profile' ? `profile:${state.current.profile.id}`
            : `resource:${state.first.resourceId}`;
        const current = await store.get(key);
        const value = current
          ? { ...current, version: current.version + 1 }
          : currentUrlCollision(destination, ['racing-resource-a', 'racing-resource-b']);
        assert.equal(await originalTransact({
          checks: [{ key, version: current?.version ?? null }],
          puts: [{ key, value }],
        }), true);
        afterExternal = await rows(store);
      }
      return originalTransact(transaction);
    };
    const response = await api(state.harness, state.path, {
      creatorVersion: state.current.creatorVersion,
      resourceVersion: state.resource.version,
      ...(noop
        ? { title: state.resource.title }
        : { title: 'Debe ser atómico', url: 'https://example.invalid/racing-destination', featured: true, selectedForDirectory: false }),
    }, { method: 'PATCH' });
    assert.equal(response.status, 409, conflict);
    assert.equal(injected, true, 'the valid command reaches its conditional commit');
    assert.deepEqual(await rows(store), afterExternal, `only the external ${conflict} write survives`);
  }
});

test('event metadata edits retain the event identity and move its registration URL reservation', async () => {
  const state = await fixture();
  const { harness, current, first, resource } = state;
  const key = `resource:${first.resourceId}`;
  const stored = await harness.store.get(key);
  const event = { ...stored, recordType: 'event', registrationUrl: stored.url };
  delete event.url;
  assert.equal(await harness.store.transact({
    checks: [{ key, version: stored.version }],
    puts: [{ key, value: event }],
  }), true);

  const saved = await jsonCommand(harness, state.path, {
    creatorVersion: current.creatorVersion,
    resourceVersion: resource.version,
    title: 'Evento actualizado',
    url: 'https://example.invalid/event-registration',
  }, { method: 'PATCH' });
  assert.equal(saved.result.operation, 'edit-link');
  assert.equal(saved.result.resourceId, first.resourceId);
  assert.equal(saved.result.creatorVersion, current.creatorVersion,
    'resource-only metadata edits do not advance the creator content revision');
  assert.equal(saved.result.resourceVersion, resource.version + 1);
  const after = await owner(harness);
  assert.equal(resourceFrom(after, first.resourceId).url, 'https://example.invalid/event-registration');
  const finalResource = await harness.store.get(key);
  assert.equal(finalResource.registrationUrl, 'https://example.invalid/event-registration');
  assert.equal(Object.hasOwn(finalResource, 'url'), false);
  assert.equal(await harness.store.get(currentUrlKey('https://example.invalid/atomic-initial')), null);
  assert.equal((await harness.store.get(currentUrlKey('https://example.invalid/event-registration'))).resourceId, first.resourceId);
});

test('storage failures and invalid owner requests leave the complete aggregate and reservations unchanged', async () => {
  const state = await fixture();
  const before = await rows(state.harness.store);
  state.harness.store.failNext('transact');
  const failed = await api(state.harness, state.path, {
    creatorVersion: state.current.creatorVersion,
    resourceVersion: state.resource.version,
    title: 'No parcial',
    url: 'https://example.invalid/uncommitted',
    featured: true,
  }, { method: 'PATCH' });
  assert.equal(failed.status, 503);
  assert.deepEqual(await rows(state.harness.store), before);

  for (const options of [
    { session: null, csrf: undefined, expected: 401 },
    { origin: 'https://evil.invalid', expected: 403 },
    { origin: null, expected: 403 },
    { csrf: 'incorrect', expected: 403 },
    { method: 'POST', expected: 405 },
    { method: 'GET', expected: 405, noBody: true },
    { creatorContract: '1', expected: 409 },
  ]) {
    const { expected, noBody, ...requestOptions } = options;
    const response = await api(state.harness, state.path, noBody ? undefined : {
      creatorVersion: state.current.creatorVersion,
      resourceVersion: state.resource.version,
      featured: true,
    }, requestOptions);
    assert.equal(response.status, expected);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.deepEqual(await rows(state.harness.store), before);
  }
  const tooLarge = await api(state.harness, state.path, {
    creatorVersion: state.current.creatorVersion,
    resourceVersion: state.resource.version,
    description: 'x'.repeat(33 * 1024),
    featured: true,
  }, { method: 'PATCH' });
  assert.equal(tooLarge.status, 413);
  assert.deepEqual(await rows(state.harness.store), before);
});

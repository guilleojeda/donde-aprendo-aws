import assert from 'node:assert/strict';
import { seedResource } from '../fixtures/creator-pages.mjs';
import {
  test, expect, api, addLink, captureCreatorApi, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

function catalogEntry({ id, title, url, tipo = 'source' }) {
  return { id, title, url, tipo };
}

async function seedCatalogRecord(fixture, item) {
  if (item.tipo === 'event') {
    await seedResource(fixture.creatorStore, {
      id: item.id,
      title: item.title,
      recordType: 'event',
      registrationUrl: item.url,
      category: 'Evento',
      format: 'Evento',
      published: true,
    });
    return;
  }
  await seedResource(fixture.creatorStore, {
    id: item.id,
    title: item.title,
    url: item.url,
    kind: item.tipo,
    category: item.tipo === 'community' ? 'Comunidad' : 'Contenido',
    format: item.tipo,
    published: true,
  });
}

async function serveSelectionIndex(page, initialEntries, {
  firstStatus = 200,
  firstBody,
  firstGate,
} = {}) {
  let entries = structuredClone(initialEntries);
  const reads = [];
  await page.route('**/catalog-selection.json', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    reads.push(new URL(route.request().url()).pathname);
    if (reads.length === 1 && firstGate) await firstGate.promise;
    await route.fulfill({
      status: reads.length === 1 ? firstStatus : 200,
      contentType: 'application/json',
      body: reads.length === 1 && firstBody !== undefined
        ? firstBody
        : reads.length === 1 && firstStatus !== 200
          ? JSON.stringify({ error: 'CATALOG_UNAVAILABLE' })
          : JSON.stringify(entries),
    });
  });
  return {
    reads,
    replace(nextEntries) { entries = structuredClone(nextEntries); },
  };
}

function deferred() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

async function openOwnerCatalog(page, fixture) {
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Buscar en el cat\u00e1logo/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

function catalogSearch(page) {
  return page.getByRole('dialog').getByRole('searchbox').first();
}

function catalogCheckbox(page, title) {
  return page.getByRole('dialog').getByRole('checkbox', {
    name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  });
}

function linkWrites(capture) {
  return capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/referencias');
}

function placementOptionWrites(capture, placementId) {
  return capture.writes().filter(({ method, path }) => method === 'PATCH'
    && path === `/api/creador/enlaces/${placementId}/editar`);
}

async function holdReferencePost(page, { commit }) {
  const gate = deferred();
  let arrive;
  const reached = new Promise((resolve) => { arrive = resolve; });
  let observed;
  const handler = async (route) => {
    const request = route.request();
    if (request.method() !== 'POST'
      || new URL(request.url()).pathname.replace(/\/$/u, '') !== '/api/creador/referencias') {
      await route.continue();
      return;
    }
    let actual;
    if (commit) {
      actual = await route.fetch();
      observed = { status: actual.status(), body: await actual.json() };
    }
    arrive();
    await gate.promise;
    if (actual) await route.fulfill({ response: actual, status: 503 });
    else await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'SERVICE_UNAVAILABLE' }) });
  };
  await page.route('**/api/creador/**', handler);
  return {
    reached,
    get observed() { return observed; },
    release: () => gate.release(),
    async remove() {
      gate.release();
      await page.unroute('**/api/creador/**', handler).catch(() => {});
    },
  };
}

test('el catálogo público carga con reintento y busca por título y URL entre tipos publicados', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  const community = catalogEntry({
    id: 'phase5-catalog-community',
    title: 'Grupo de arquitectura serverless',
    url: 'https://communities.example.invalid/architecture',
    tipo: 'community',
  });
  const event = catalogEntry({
    id: 'phase5-catalog-event',
    title: 'Jornada de comunidades AWS',
    url: 'https://events.example.invalid/aws-community-day',
    tipo: 'event',
  });
  await seedCatalogRecord(fixture, community);
  await seedCatalogRecord(fixture, event);
  const firstLoad = deferred();
  const index = await serveSelectionIndex(page, [community, event], {
    firstBody: '{malformed',
    firstGate: firstLoad,
  });
  const capture = await captureCreatorApi(page);

  await openOwnerCatalog(page, fixture);
  await expect(page.getByRole('status').filter({ hasText: /cargando el cat\u00e1logo/i })).toBeVisible();
  firstLoad.release();
  await expect(page.getByRole('button', { name: /Reintentar.*cat\u00e1logo/i })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /no pudimos leer el cat\u00e1logo/i })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /no hay recursos que coincidan/i })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Resultados del cat\u00e1logo' }).getByRole('checkbox')).toHaveCount(0);
  await page.getByRole('button', { name: /Reintentar.*cat\u00e1logo/i }).click();
  await expect(catalogCheckbox(page, event.title)).toBeVisible();
  assert.equal(index.reads.length, 2, 'one failed public-index read and the explicit retry reached the provider boundary');

  const search = catalogSearch(page);
  await search.fill('aws-community-day');
  await search.press('Enter');
  await expect(catalogCheckbox(page, event.title)).toBeVisible();
  await expect(catalogCheckbox(page, community.title)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText(event.url);

  await search.fill('architecture');
  await search.press('Enter');
  await expect(catalogCheckbox(page, community.title)).toBeVisible();
  await expect(catalogCheckbox(page, event.title)).toHaveCount(0);

  await search.fill('no existe en el catálogo de prueba');
  await search.press('Enter');
  await expect(page.getByRole('dialog').getByRole('status').filter({ hasText: /no hay recursos que coincidan/i })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Resultados del catálogo' }).getByRole('checkbox')).toHaveCount(0);
  assert.deepEqual(linkWrites(capture), [], 'searches and a valid zero-result response do not write owner data');
  await capture.stop();
});

test('referenciar contenido existente conserva la colocación; una referencia nueva respeta la opción sin conceder edición', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const existing = await addLink(fixture, cookie, {
    title: 'Contenido propio ya agregado',
    url: 'https://owner-content.example.invalid/guide',
  });
  const existingOwner = await fixture.rawOwner(cookie);
  const existingPlacement = await fixture.rawPlacement(cookie, existing.placementId);
  const existingResource = await fixture.rawResource(existing.resourceId);
  const shared = catalogEntry({
    id: 'phase5-catalog-shared-event',
    title: 'Evento compartido de la comunidad',
    url: 'https://events.example.invalid/shared-day',
    tipo: 'event',
  });
  await seedCatalogRecord(fixture, shared);
  await serveSelectionIndex(page, [
    catalogEntry({ id: existing.resourceId, title: existing.title, url: existing.url, tipo: 'source' }),
    shared,
  ]);
  const capture = await captureCreatorApi(page);

  await openOwnerCatalog(page, fixture);
  const search = catalogSearch(page);
  await search.fill(existing.url);
  await search.press('Enter');
  await catalogCheckbox(page, existing.title).check();
  await expect(page.getByRole('dialog').getByRole('checkbox', { name: /proponer al directorio/i })).toBeChecked();
  await page.getByRole('button', { name: /Agregar a mi p\u00e1gina/i }).click();
  await expect(page.getByRole('status').filter({ hasText: /ya estaba en tu p\u00e1gina|conservamos su ficha/i }).first()).toBeVisible();
  assert.equal(linkWrites(capture).length, 1);
  await expect.poll(() => linkWrites(capture)[0]?.status).toBe(200);
  assert.equal(linkWrites(capture)[0].status, 200, 'the real service identifies an already linked resource');
  assert.deepEqual(await fixture.rawPlacement(cookie, existing.placementId), existingPlacement,
    'the existing placement, options, ordering, and version remain unchanged');
  assert.deepEqual(await fixture.rawResource(existing.resourceId), existingResource,
    'the existing content record is unchanged');
  assert.equal((await fixture.rawOwner(cookie)).profile.version, existingOwner.profile.version,
    'the duplicate reference is a no-op for the owner profile');

  // Open a fresh reference intent and use the server's catalog record, which is an event
  // whose actual registration URL is the URL carried through the published index.
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: /Cerrar edici\u00f3n/i }).click();
    const exit = page.getByRole('alertdialog');
    if (await exit.isVisible().catch(() => false)) await exit.getByRole('button', { name: /Descartar cambios/i }).click();
    await expect(dialog).not.toBeVisible();
  }
  await page.getByRole('button', { name: /Buscar en el cat\u00e1logo/i }).click();
  const freshSearch = dialog.getByRole('searchbox').first();
  await freshSearch.fill(shared.title);
  await freshSearch.press('Enter');
  await catalogCheckbox(page, shared.title).check();
  const directory = dialog.getByRole('checkbox', { name: /proponer al directorio/i });
  await expect(directory).toBeChecked();
  await directory.uncheck();
  const beforeReference = await fixture.rawOwner(cookie);
  const sharedBefore = await fixture.rawResource(shared.id);
  await page.getByRole('button', { name: /Agregar a mi p\u00e1gina/i }).click();

  const row = page.getByRole('row').filter({ hasText: shared.title });
  await expect(row).toBeVisible();
  assert.equal(linkWrites(capture).length, 2);
  await expect.poll(() => linkWrites(capture)[1]?.status).toBe(201);
  const newReference = linkWrites(capture)[1];
  assert.equal(newReference.status, 201);
  assert.deepEqual(newReference.body, {
    resourceId: shared.id,
    url: shared.url,
    profileVersion: beforeReference.profile.version,
    selectedForDirectory: false,
  });
  const afterReference = await fixture.rawOwner(cookie);
  assert.equal(afterReference.profile.version, beforeReference.profile.version + 1);
  const added = afterReference.profile && await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(added.response.status, 200);
  const sharedLink = added.body.links.find(({ resourceId }) => resourceId === shared.id);
  assert.ok(sharedLink, 'the real owner read exposes the reference added by the server');
  assert.equal(sharedLink.url, shared.url);
  assert.equal(sharedLink.selectedForDirectory, false, 'the explicit directory choice is saved on this placement');
  assert.deepEqual(await fixture.rawResource(shared.id), sharedBefore,
    'referencing shared event content does not alter its metadata or grant its editor record');
  assert.equal(added.body.editableResources.some(({ id }) => id === shared.id), false);
  await expect(row.getByRole('button', { name: /Editar ficha/i })).toHaveCount(0);
  await expect(row.getByRole('button', { name: /Editar opciones/i })).toBeVisible();

  const deniedMetadataEdit = await api(fixture, cookie, `/api/creador/recursos/${shared.id}`, {
    method: 'PATCH',
    body: { version: sharedBefore.version, title: 'Cambio no autorizado' },
  });
  assert.equal(deniedMetadataEdit.response.status, 403, 'the real authorization boundary rejects metadata edits to referenced shared content');
  assert.deepEqual(await fixture.rawResource(shared.id), sharedBefore);
  assert.equal(linkWrites(capture).length, 2, 'reconciliation and the forbidden metadata attempt do not replay either reference');
  await capture.stop();
});

test('un PROFILE_CONFLICT compara el perfil completo y permite reintentar manualmente la misma selección observada', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const item = catalogEntry({
    id: 'phase5-catalog-profile-conflict',
    title: 'Ficha para comparar versiones',
    url: 'https://catalog.example.invalid/profile-conflict',
    tipo: 'community',
  });
  await seedCatalogRecord(fixture, item);
  await serveSelectionIndex(page, [item]);
  const capture = await captureCreatorApi(page);
  await openOwnerCatalog(page, fixture);
  const search = catalogSearch(page);
  await search.fill(item.title);
  await search.press('Enter');
  await catalogCheckbox(page, item.title).check();
  const directory = page.getByRole('dialog').getByRole('checkbox', { name: /proponer al directorio/i });
  await expect(directory).toBeChecked();
  await directory.uncheck();

  const before = await fixture.rawOwner(cookie);
  const concurrent = await api(fixture, cookie, '/api/creador/perfil', {
    method: 'PUT',
    body: { version: before.profile.version, displayName: 'Nombre guardado en otra pestaña' },
  });
  assert.equal(concurrent.response.status, 200, JSON.stringify(concurrent.body));
  assert.equal(concurrent.body.profile.version, before.profile.version + 1);

  await page.getByRole('button', { name: /Agregar a mi p\u00e1gina/i }).click();
  await expect.poll(() => linkWrites(capture).length).toBe(1);
  await expect.poll(() => linkWrites(capture)[0]?.status).toBe(409);
  const first = linkWrites(capture)[0];
  assert.equal(first.status, 409);
  assert.equal(first.responseBody.error, 'PROFILE_CONFLICT', 'the real service rejects the stale observed profile base');
  assert.deepEqual(first.body, {
    resourceId: item.id,
    url: item.url,
    profileVersion: before.profile.version,
    selectedForDirectory: false,
  });
  assert.equal(await fixture.rawPlacement(cookie, `placement-${item.id}`), null,
    'a profile-version conflict creates no placement');

  const compare = page.getByRole('dialog').getByRole('button', { name: /Comparar.*guardado|Comparar.*p\u00e1gina/i });
  await expect(compare).toBeVisible();
  await compare.click();
  await expect(page.getByRole('dialog')).toContainText('Nombre guardado en otra pestaña');
  const adopt = page.getByRole('dialog').getByRole('button', {
    name: /conservar.*selecci[oó]n|selecci[oó]n.*conservar|usar.*datos guardados|usar.*perfil guardado|usar.*versi[oó]n guardada/i,
  });
  await expect(adopt).toBeVisible();
  await adopt.click();

  await expect(page.getByRole('heading', { name: 'Nombre guardado en otra pestaña' })).toBeVisible();
  await expect(catalogCheckbox(page, item.title)).toBeChecked();
  await expect(page.getByRole('dialog')).toContainText(item.url);
  await expect(directory).not.toBeChecked();
  assert.equal(linkWrites(capture).length, 1, 'reading and adopting the complete owner snapshot does not write');

  await page.getByRole('button', { name: /Agregar a mi p\u00e1gina/i }).click();
  await expect.poll(() => linkWrites(capture).length).toBe(2);
  await expect.poll(() => linkWrites(capture)[1]?.status).toBe(201);
  const retry = linkWrites(capture)[1];
  assert.equal(retry.status, 201);
  assert.deepEqual(retry.body, {
    resourceId: item.id,
    url: item.url,
    profileVersion: before.profile.version + 1,
    selectedForDirectory: false,
  }, 'the explicit continuation uses the adopted base and the same exact ID, URL, and directory choice');
  const saved = await fixture.request(cookie, '/api/creador/perfil');
  const savedDto = await saved.json();
  assert.equal(savedDto.profile.displayName, 'Nombre guardado en otra pestaña');
  assert.equal(savedDto.links.filter(({ resourceId }) => resourceId === item.id).length, 1);
  assert.equal(savedDto.links.find(({ resourceId }) => resourceId === item.id).selectedForDirectory, false);
  assert.equal(savedDto.editableResources.some(({ id }) => id === item.id), false);
  assert.equal(linkWrites(capture).length, 2, 'the successful manual continuation is not automatically replayed');
  await capture.stop();
});

test('un RESOURCE_CONFLICT exige actualizar el índice, revisar la URL actual y confirmar una segunda vez', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const oldItem = catalogEntry({
    id: 'phase5-catalog-stale-url',
    title: 'Evento con destino actualizado',
    url: 'https://events.example.invalid/old-registration',
    tipo: 'event',
  });
  const currentItem = { ...oldItem, url: 'https://events.example.invalid/current-registration' };
  // The public index is intentionally stale while the actual resource and URL
  // reservation already contain the current registration destination.
  await seedCatalogRecord(fixture, currentItem);
  const index = await serveSelectionIndex(page, [oldItem]);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });

  await openOwnerCatalog(page, fixture);
  await catalogCheckbox(page, oldItem.title).check();
  const initial = await fixture.rawOwner(cookie);
  await page.getByRole('button', { name: /Agregar a mi p\u00e1gina/i }).click();
  await expect.poll(() => linkWrites(capture).length).toBe(1);
  await expect.poll(() => linkWrites(capture)[0]?.status).toBe(409);
  const staleAttempt = linkWrites(capture)[0];
  assert.equal(staleAttempt.status, 409);
  assert.deepEqual(staleAttempt.body, {
    resourceId: oldItem.id,
    url: oldItem.url,
    profileVersion: initial.profile.version,
    selectedForDirectory: true,
  });
  assert.equal(await fixture.rawPlacement(cookie, `placement-${oldItem.id}`), null);
  assert.equal((await fixture.rawOwner(cookie)).profile.version, initial.profile.version);
  await expect(page.getByRole('button', { name: /Reintentar.*cat\u00e1logo/i })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /URL observada.*cambi|actualiza.*cat\u00e1logo/i }).first()).toBeVisible();
  assert.equal(linkWrites(capture).length, 1, 'the rejected pair was not silently converted or resent');

  index.replace([currentItem]);
  await page.getByRole('button', { name: /Reintentar.*cat\u00e1logo/i }).click();
  await expect(page.getByRole('dialog')).toContainText(currentItem.url);
  await expect(catalogCheckbox(page, oldItem.title)).toBeChecked();
  assert.equal(index.reads.length, 2, 'the updated public catalog is read only after the explicit retry');
  assert.equal(linkWrites(capture).length, 1, 'refreshing the index itself does not send a new reference');

  await page.getByRole('button', { name: /Agregar a mi p\u00e1gina/i }).click();
  await expect.poll(() => linkWrites(capture).length).toBe(2);
  await expect.poll(() => linkWrites(capture)[1]?.status).toBe(201);
  assert.equal(linkWrites(capture)[1].status, 201);
  assert.equal(linkWrites(capture)[1].body.url, currentItem.url,
    'the second explicit command uses the currently published event registration URL');
  const savedResource = await fixture.rawResource(currentItem.id);
  const after = await fixture.rawOwner(cookie);
  assert.equal(savedResource.registrationUrl, currentItem.url);
  assert.equal(after.profile.version, initial.profile.version + 1);
  const read = await fixture.request(cookie, '/api/creador/perfil');
  const dto = await read.json();
  const savedLink = dto.links.find(({ resourceId }) => resourceId === currentItem.id);
  assert.ok(savedLink);
  assert.equal(savedLink.url, currentItem.url);
  assert.equal(savedLink.selectedForDirectory, true);
  assert.equal(dto.editableResources.some(({ id }) => id === currentItem.id), false);
  assert.equal(linkWrites(capture).length, 2, 'the confirmed retry is one write and the stale pair was never replayed');
  await capture.stop();
});

for (const outcome of [
  { name: 'commit cuya respuesta se perdió', commit: true },
  { name: 'fallo antes del commit', commit: false },
]) {
  test(`referencia: ${outcome.name} comprueba el estado y conserva la corrección del directorio para continuar`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const item = catalogEntry({
      id: `phase5-reference-uncertain-${outcome.commit ? 'committed' : 'uncommitted'}`,
      title: 'Contenido con confirmación perdida',
      url: `https://catalog.example.invalid/reference-${outcome.commit ? 'committed' : 'uncommitted'}`,
      tipo: 'community',
    });
    await seedCatalogRecord(fixture, item);
    await serveSelectionIndex(page, [item]);
    const capture = await captureCreatorApi(page, { skipErrorBodies: true });
    await openOwnerCatalog(page, fixture);
    await catalogCheckbox(page, item.title).check();
    const directory = page.getByRole('dialog').getByRole('checkbox', { name: /proponer al directorio/i });
    await expect(directory).toBeChecked();
    const before = await fixture.rawOwner(cookie);
    const beforeResource = await fixture.rawResource(item.id);
    const readsBefore = capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length;

    const held = await holdReferencePost(page, outcome);
    let submit;
    try {
      submit = page.getByRole('button', { name: /Agregar a mi p\u00e1gina/i }).click();
      await expect.poll(() => linkWrites(capture).length).toBe(1);
      await held.reached;
      await directory.uncheck();
      held.release();
      await submit;
    } finally {
      held.release();
      await held.remove();
      await submit?.catch(() => {});
    }
    await expect.poll(() => linkWrites(capture)[0]?.status).toBe(503);
    const lostPost = linkWrites(capture)[0];
    assert.deepEqual(lostPost.body, {
      resourceId: item.id,
      url: item.url,
      profileVersion: before.profile.version,
      selectedForDirectory: true,
    }, 'the submitted request captures the original checkbox value and exact catalog pair');
    if (outcome.commit) {
      assert.equal(held.observed.status, 201, 'the real reference service committed before its acknowledgement was replaced');
      assert.equal((await fixture.rawOwner(cookie)).profile.version, before.profile.version + 1);
    } else {
      assert.equal(held.observed, undefined, 'the precommit transport failure never called the reference handler');
      assert.deepEqual(await fixture.rawOwner(cookie), before);
    }

    const check = page.getByRole('dialog').getByRole('button', { name: /Comprobar/i });
    await expect(check).toBeVisible();
    assert.equal(linkWrites(capture).length, 1, 'the first uncertain result does not replay the reference POST');
    await check.click();
    await expect.poll(() => capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length)
      .toBe(readsBefore + 1);
    await expect.poll(() => capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').at(-1)?.status)
      .toBe(200);
    assert.equal(linkWrites(capture).length, 1, 'Comprobar is a read and does not repeat the POST');

    const afterCheck = await fixture.request(cookie, '/api/creador/perfil').then((response) => response.json());
    const existing = afterCheck.links.find(({ resourceId }) => resourceId === item.id);
    assert.equal(Boolean(existing), outcome.commit, 'the raw owner read distinguishes a committed reference from a precommit failure');
    if (outcome.commit) assert.equal(existing.selectedForDirectory, true);
    else assert.equal(afterCheck.profile.version, before.profile.version);

    const adopt = page.getByRole('dialog').getByRole('button', {
      name: /conservar.*selecci[oó]n|selecci[oó]n.*conservar|usar.*datos guardados|usar.*lista guardada|usar.*versi[oó]n guardada/i,
    });
    await expect(adopt).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(item.url);
    await adopt.click();
    await expect(catalogCheckbox(page, item.title)).toBeChecked();
    await expect(page.getByRole('dialog')).toContainText(item.url);
    await expect(directory).not.toBeChecked();
    assert.equal(linkWrites(capture).length, 1, 'adopting the complete owner snapshot performs no write');

    if (outcome.commit) {
      const reviewOptions = page.getByRole('dialog').getByRole('button', { name: /Revisar opciones/i });
      await expect(reviewOptions).toBeVisible();
      await reviewOptions.click();
      const linkDialog = page.getByRole('dialog');
      await expect(linkDialog).toContainText(/Editar opciones/i);
      await expect(linkDialog.getByRole('checkbox', { name: /Proponer al directorio/i })).not.toBeChecked();
      await linkDialog.getByRole('button', { name: /Guardar cambios/i }).click();
      await expect.poll(() => placementOptionWrites(capture, existing.placementId).length).toBe(1);
      await expect.poll(() => placementOptionWrites(capture, existing.placementId)[0]?.status).toBe(200);
      const optionPatch = placementOptionWrites(capture, existing.placementId)[0];
      assert.equal(optionPatch.body.selectedForDirectory, false);
      assert.equal(optionPatch.body.profileVersion, afterCheck.profile.version);
      assert.equal(Object.hasOwn(optionPatch.body, 'title'), false);
      assert.equal(linkWrites(capture).length, 1, 'continuing the postcommit correction updates options without another reference POST');
      const final = await fixture.request(cookie, '/api/creador/perfil').then((response) => response.json());
      const saved = final.links.find(({ resourceId }) => resourceId === item.id);
      assert.equal(saved.selectedForDirectory, false);
      assert.equal(final.links.filter(({ resourceId }) => resourceId === item.id).length, 1);
      assert.equal(final.editableResources.some(({ id }) => id === item.id), false);
      assert.deepEqual(await fixture.rawResource(item.id), beforeResource,
        'neither reference recovery nor the options PATCH edits shared catalog metadata');
      assert.equal(final.profile.version, afterCheck.profile.version + 1);
    } else {
      await page.getByRole('button', { name: /Agregar a mi p\u00e1gina/i }).click();
      await expect.poll(() => linkWrites(capture).length).toBe(2);
      await expect.poll(() => linkWrites(capture)[1]?.status).toBe(201);
      assert.deepEqual(linkWrites(capture)[1].body, {
        resourceId: item.id,
        url: item.url,
        profileVersion: afterCheck.profile.version,
        selectedForDirectory: false,
      }, 'the explicit retry uses the compared base and preserves the corrected option');
      const final = await fixture.request(cookie, '/api/creador/perfil').then((response) => response.json());
      const saved = final.links.find(({ resourceId }) => resourceId === item.id);
      assert.ok(saved);
      assert.equal(saved.selectedForDirectory, false);
      assert.equal(final.links.filter(({ resourceId }) => resourceId === item.id).length, 1);
      assert.equal(final.editableResources.some(({ id }) => id === item.id), false);
      assert.deepEqual(await fixture.rawResource(item.id), beforeResource);
    }
    await capture.stop();
  });
}

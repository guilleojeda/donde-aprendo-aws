import assert from 'node:assert/strict';
import { currentUrlKey, currentUrlReservation } from '../../src/lib/catalog-url.mjs';
import {
  test,
  expect,
  api,
  addLink,
  addChapter,
  captureCreatorApi,
  createSeries,
  loggedInOwner,
  readOwnerSnapshot,
} from '../fixtures/creator-browser-test.mjs';

async function openLinksView(page, fixture) {
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
}

function addLinkForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="alta-enlace"]');
}

function linkEditForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="enlace"]');
}

function writesTo(capture, method, path) {
  return capture.writes().filter((write) => write.method === method && write.path === path);
}

async function responseFor(capture, method, path, index = 0) {
  await expect.poll(() => writesTo(capture, method, path)[index]?.status).toBeTruthy();
  return writesTo(capture, method, path)[index];
}

async function seedSharedCatalogResource(fixture, overrides = {}) {
  // This record matches a selectable row in the public catalog fixture. It has
  // no editor reference, so the creator can add a placement but not edit it.
  const resource = {
    id: 'fixture-source',
    title: 'Canal de ejemplo',
    url: 'https://example.com/canal',
    description: 'Videos sobre seguridad.',
    category: 'Canal de YouTube',
    kind: 'source',
    format: 'Canal de YouTube',
    topics: ['Seguridad'],
    country: 'AR',
    order: 9,
    featured: true,
    published: true,
    hidden: false,
    approvalRevoked: false,
    directoryControl: 'editorial',
    version: 4,
    ...overrides,
  };
  const reservation = currentUrlReservation(resource.url, resource.id);
  assert.equal(await fixture.creatorStore.transact({
    checks: [
      { key: `resource:${resource.id}`, version: null },
      { key: currentUrlKey(resource.url), version: null },
    ],
    puts: [
      { key: `resource:${resource.id}`, value: resource },
      { key: currentUrlKey(resource.url), value: reservation },
    ],
  }), true, 'the shared catalog fixture is present before the browser requests it');
  return resource;
}

test('un alta confirmada con acuse perdido sigue incierta hasta una decisión manual y no se repite', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page);
  const createPath = '/api/creador/enlaces';
  const firstUrl = 'https://links.example/alta-confirmada-sin-acuse';
  const manualUrl = 'https://links.example/alta-elegida-manualmente';
  await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const form = addLinkForm(page);
  await form.getByLabel('Título', { exact: true }).fill('Título enviado original');
  await form.getByLabel('URL', { exact: true }).fill(firstUrl);
  await form.getByLabel(/Descripción/).fill('Descripción original');

  let signalCommit;
  let releaseResponse;
  const committed = new Promise((resolve) => { signalCommit = resolve; });
  const responseGate = new Promise((resolve) => { releaseResponse = resolve; });
  let actualAdd;
  let submit;
  const dropCommittedAddResponse = async (route) => {
    const request = route.request();
    if (request.method() !== 'POST' || new URL(request.url()).pathname.replace(/\/$/u, '') !== createPath) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    actualAdd = { status: response.status(), body: await response.json(), requestBody: request.postDataJSON() };
    signalCommit();
    await responseGate;
    await route.abort('failed');
  };
  await page.route('**/api/creador/**', dropCommittedAddResponse);
  try {
    submit = form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await committed;
    assert.equal(actualAdd.status, 201, 'the actual service commits the first placement before its acknowledgement is lost');
    assert.equal(actualAdd.body.schemaVersion, 2);
    assert.equal(actualAdd.body.operation, 'add-link');
    assert.equal(actualAdd.body.disposition, 'resource-created');
    assert.equal(actualAdd.requestBody.title, 'Título enviado original');
    assert.equal(actualAdd.requestBody.url, firstUrl);
    assert.equal(actualAdd.requestBody.description, 'Descripción original');
    assert.ok(Number.isSafeInteger(actualAdd.requestBody.creatorVersion));
    assert.equal(Object.hasOwn(actualAdd.body, 'versionChanges'), false);

    await expect(form.getByLabel('Título', { exact: true })).toHaveAttribute('readonly', '');
    await expect(form.getByLabel('URL', { exact: true })).toHaveAttribute('readonly', '');
    await expect(form.getByLabel(/Descripción/)).toHaveAttribute('readonly', '');
    await expect(form.getByLabel('Proponer al directorio', { exact: false })).toBeDisabled();
    await expect(form.getByLabel('Título', { exact: true })).toHaveValue('Título enviado original');
    releaseResponse();
    await submit;
  } finally {
    releaseResponse();
    await page.unroute('**/api/creador/**', dropCommittedAddResponse).catch(() => {});
    await submit?.catch(() => {});
  }

  await expect(page.locator('[data-owner-recovery][data-recovery-kind="unknown"]')).toBeVisible();
  await page.getByRole('button', { name: 'Comprobar estado guardado', exact: true }).click();
  await capture.settle({ skipErrorBodies: true });
  const ownerRead = capture.records.find(({ method, path, status, responseBody }) => method === 'GET'
    && path === '/api/creador/perfil' && status === 200 && responseBody?.schemaVersion === 2
    && Object.values(responseBody.placements).some(({ resourceId }) => resourceId === actualAdd.body.resourceId));
  assert.ok(ownerRead, 'the real complete GET sees the matching placement but cannot attribute it to the lost request');
  await expect(page.locator('[data-owner-recovery][data-recovery-kind="unknown"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Usar lo guardado', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Volver al borrador', exact: true })).toBeVisible();
  assert.equal(writesTo(capture, 'POST', createPath).length, 1,
    'checking the committed result does not repeat the Add request');

  await page.getByRole('button', { name: 'Volver al borrador', exact: true }).click();
  await expect(form.getByLabel('Título', { exact: true })).toHaveValue('Título enviado original');
  await form.getByLabel('Título', { exact: true }).fill('Segundo alta elegida por la persona');
  await form.getByLabel('URL', { exact: true }).fill(manualUrl);
  await form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const secondAdd = await responseFor(capture, 'POST', createPath, 1);
  assert.equal(secondAdd.status, 201);
  await capture.settle({ skipErrorBodies: true });

  const saved = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(saved.response.status, 200);
  assert.deepEqual(Object.values(saved.body.placements).map(({ resourceId }) => resourceId), [
    actualAdd.body.resourceId,
    secondAdd.responseBody.resourceId,
  ]);
  assert.equal(saved.body.resources.find(({ id }) => id === actualAdd.body.resourceId).url, firstUrl);
  assert.equal(saved.body.resources.find(({ id }) => id === secondAdd.responseBody.resourceId).url, manualUrl);
  assert.equal(writesTo(capture, 'POST', createPath).length, 2,
    'the only second write follows the explicit return-to-draft choice');
  assert.equal(writesTo(capture, 'PATCH', '/api/creador/enlaces/' + actualAdd.body.placementId + '/editar').length, 0,
    'the first ambiguous Add never turns into an inferred metadata edit');
  await capture.stop({ skipErrorBodies: true });
});

test('alta rechazada antes del commit: conserva el formulario y sólo Guardar una entrada válida crea el enlace', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const before = await fixture.rawOwner(cookie);
  const beforeCreatorVersion = before.profile.version;
  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });

  await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const form = addLinkForm(page);
  await form.getByLabel('Título', { exact: true }).fill('Alta que no llegó al servicio');
  const invalidUrl = 'https://user:secret@links.example/alta-precommit';
  await form.getByLabel('URL', { exact: true }).fill(invalidUrl);
  assert.equal(await form.getByLabel('URL', { exact: true }).evaluate((input) => input.checkValidity()), true,
    'the browser accepts the URL syntax so the real service validates the forbidden credentials');
  await form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(422);

  const failed = writesTo(capture, 'POST', '/api/creador/enlaces');
  assert.equal(failed.length, 1);
  assert.equal(failed[0].status, 422);
  assert.equal(failed[0].body.url, invalidUrl);
  assert.equal((await fixture.rawOwner(cookie)).profile.version, beforeCreatorVersion,
    'the real validation rejection makes no profile or placement write');
  assert.equal(await fixture.creatorStore.get(currentUrlKey(invalidUrl)), null,
    'the rejected URL has no catalog reservation');
  await expect(form.locator('[data-link-add-status]')).toContainText(/Revisa los datos/i);
  await expect(page.getByRole('button', { name: 'Comprobar', exact: true })).toHaveCount(0,
    'a known validation rejection is not shown as an uncertain write');
  await expect(form.getByLabel('Título', { exact: true })).toHaveValue('Alta que no llegó al servicio');
  await expect(form.getByLabel('URL', { exact: true })).toHaveValue(invalidUrl);
  assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1,
    'the validation response is not replayed automatically');
  assert.equal((await fixture.rawOwner(cookie)).profile.version, beforeCreatorVersion);

  await form.getByLabel('URL', { exact: true }).fill('https://links.example/alta-precommit');
  await form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Alta que no llegó al servicio' })).toHaveCount(1);
  await capture.settle();
  const posts = writesTo(capture, 'POST', '/api/creador/enlaces');
  assert.equal(posts.length, 2, 'the invalid attempt and the corrected manual submit are the only create requests');
  assert.equal(posts[0].status, 422);
  assert.equal(posts[1].status, 201);
  assert.equal(posts[1].responseBody.disposition, 'resource-created');
  assert.ok((await fixture.rawOwner(cookie)).profile.version > beforeCreatorVersion);
  assert.equal((await fixture.rawResource(posts[1].responseBody.resourceId)).title, 'Alta que no llegó al servicio');
  await capture.stop();
});

test('referencia compartida: guardar opciones no ofrece ni persiste autoridad sobre los metadatos', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const shared = await seedSharedCatalogResource(fixture);
  const beforeReference = await readOwnerSnapshot(fixture, cookie);
  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page);

  await page.getByRole('button', { name: 'Buscar en el catálogo', exact: true }).click();
  await expect(page.locator('[data-catalog-row="fixture-source"]')).toBeVisible();
  await page.getByRole('radio', { name: 'Seleccionar Canal de ejemplo', exact: true }).check();
  const referenceForm = page.locator('[data-owner-dialog] form[data-owner-form="referencia"]');
  await expect(referenceForm.getByLabel('Proponer al directorio')).toBeChecked();
  await referenceForm.getByLabel('Proponer al directorio').uncheck();
  await referenceForm.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();

  const row = page.getByRole('row').filter({ hasText: shared.title });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('button', { name: 'Editar ficha', exact: true })).toHaveCount(0);
  const reference = writesTo(capture, 'POST', '/api/creador/referencias');
  assert.equal(reference.length, 1);
  assert.equal(reference[0].status, 201);
  assert.equal(reference[0].body.resourceId, shared.id);
  assert.equal(reference[0].body.url, shared.url);
  assert.equal(reference[0].body.selectedForDirectory, false);
  for (const field of ['title', 'description', 'version']) {
    assert.equal(Object.hasOwn(reference[0].body, field), false,
      `reference selection cannot submit shared metadata field ${field}`);
  }
  const referenced = reference[0].responseBody;
  assert.equal(reference[0].responseBody.disposition, 'attached');
  assert.equal((await fixture.creatorStore.get(`editor:${(await fixture.rawOwner(cookie)).profile.id}:${shared.id}`)), null,
    'referencing does not create an editor-authority record');
  assert.deepEqual(await fixture.rawResource(shared.id), shared);

  await row.getByRole('button', { name: 'Editar opciones', exact: true }).click();
  const editor = linkEditForm(page);
  await expect(editor.getByLabel('Título', { exact: true })).toHaveAttribute('readonly', '');
  await expect(editor.getByLabel('Título', { exact: true })).toBeEnabled();
  await expect(editor.getByLabel('Título', { exact: true })).toHaveValue(shared.title);
  await expect(editor.getByLabel('URL', { exact: true })).toHaveAttribute('readonly', '');
  await expect(editor.getByLabel('URL', { exact: true })).toBeEnabled();
  await expect(editor.getByLabel('URL', { exact: true })).toHaveValue(shared.url);
  await expect(editor.getByLabel(/Descripción/)).toHaveAttribute('readonly', '');
  await expect(editor.getByLabel(/Descripción/)).toBeEnabled();
  await expect(editor.getByLabel(/Descripción/)).toHaveValue(shared.description ?? '');
  await editor.getByLabel('Destacar en tu página').check();
  const placementId = referenced.placementId;
  const beforeOptions = await readOwnerSnapshot(fixture, cookie);
  await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await capture.settle();

  const optionPatch = writesTo(capture, 'PATCH', `/api/creador/enlaces/${placementId}`);
  assert.equal(optionPatch.length, 1);
  assert.equal(optionPatch[0].status, 200);
  assert.equal(optionPatch[0].responseBody.operation, 'set-link-options');
  assert.equal(optionPatch[0].responseBody.placementId, placementId);
  assert.equal(optionPatch[0].body.featured, true);
  assert.equal(Object.hasOwn(optionPatch[0].body, 'selectedForDirectory'), false,
    'the options command sends only the field the person changed');
  assert.equal(optionPatch[0].body.creatorVersion, beforeOptions.creatorVersion);
  for (const field of ['title', 'url', 'description']) {
    assert.equal(Object.hasOwn(optionPatch[0].body, field), false,
      `an options-only change cannot write shared ${field}`);
  }
  assert.equal(writesTo(capture, 'PATCH', `/api/creador/recursos/${shared.id}`).length, 0);
  const afterOptions = await readOwnerSnapshot(fixture, cookie);
  assert.ok(afterOptions.creatorVersion > beforeOptions.creatorVersion);
  assert.deepEqual(afterOptions.placements[placementId], {
    resourceId: shared.id,
    selectedForDirectory: false,
  });
  assert.ok(afterOptions.order.featured.includes(placementId));
  assert.ok(beforeReference.creatorVersion < beforeOptions.creatorVersion,
    'the reference is installed through the same creator revision read');
  assert.deepEqual(await fixture.rawResource(shared.id), shared,
    'the resource metadata and version remain byte-for-byte at their original values');
  await capture.stop();
});

test('último enlace de la página 2: cancelar no escribe; quitar conserva la consulta, otras colocaciones y autoridad', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const links = [];
  for (let index = 1; index <= 26; index += 1) {
    const suffix = String(index).padStart(3, '0');
    links.push(await addLink(fixture, cookie, {
      title: `Lista persistente ${suffix}`,
      url: `https://links.example/lista-persistente-${suffix}`,
    }));
  }
  const target = links[25];
  const targetTitle = `Lista persistente 026`;
  const survivingChapter = links[0];
  const series = await createSeries(fixture, cookie, {
    name: 'Serie de pertenencias conservadas', slug: 'pertenencias-conservadas',
  });
  await addChapter(fixture, cookie, series.id, survivingChapter.placementId);
  await addChapter(fixture, cookie, series.id, target.placementId);

  const ownerBeforeAction = await readOwnerSnapshot(fixture, cookie);
  const targetPlacementBefore = ownerBeforeAction.placements[target.placementId];
  const targetResourceBefore = await fixture.rawResource(target.resourceId);
  const targetEditorKey = `editor:${ownerBeforeAction.profile.id}:${target.resourceId}`;
  const targetEditorBefore = await fixture.creatorStore.get(targetEditorKey);
  const seriesBefore = ownerBeforeAction.series[series.id];
  const otherPlacementsBefore = Object.fromEntries(links.slice(0, 25)
    .map(({ placementId }) => [placementId, ownerBeforeAction.placements[placementId]]));
  assert.ok(seriesBefore.chapters.includes(target.placementId), 'the target is a chapter before removal');
  assert.ok(seriesBefore.chapters.includes(survivingChapter.placementId),
    'another chapter provides an unaffected membership oracle');
  assert.ok(targetEditorBefore, 'the owner retains editing authority over the removed resource');

  const search = 'Lista persistente';
  const capture = await captureCreatorApi(page);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces&buscar=${encodeURIComponent(search)}&orden=titulo-asc&paginaEnlaces=2`);
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  await expect(page.locator('[data-link-count]')).toHaveText('26 coincidencias de 26 enlaces');
  await expect(page.locator('[data-link-row]')).toHaveCount(1);
  const targetRow = page.getByRole('row').filter({ hasText: targetTitle });
  await expect(targetRow).toHaveCount(1);
  const initialQuery = new URL(page.url()).searchParams;
  assert.equal(initialQuery.get('buscar'), search);
  assert.equal(initialQuery.get('orden'), 'titulo-asc');
  assert.equal(initialQuery.get('paginaEnlaces'), '2', 'the target is alone on the last page before removal');

  let dismissedDialogType;
  page.once('dialog', async (dialog) => {
    dismissedDialogType = dialog.type();
    await dialog.dismiss();
  });
  await targetRow.getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
  assert.equal(dismissedDialogType, 'confirm', 'removal uses the browser confirmation dialog');
  await expect(targetRow).toHaveCount(1);
  assert.equal(capture.writes().length, 0, 'dismissing confirmation sends no write');
  assert.deepEqual((await readOwnerSnapshot(fixture, cookie)).placements[target.placementId], targetPlacementBefore);
  assert.deepEqual(await fixture.rawResource(target.resourceId), targetResourceBefore);
  assert.deepEqual(await fixture.creatorStore.get(targetEditorKey), targetEditorBefore);

  let acceptedDialogType;
  page.once('dialog', async (dialog) => {
    acceptedDialogType = dialog.type();
    await dialog.accept();
  });
  await targetRow.getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
  assert.equal(acceptedDialogType, 'confirm');
  const deletePath = `/api/creador/enlaces/${target.placementId}`;
  await expect.poll(() => writesTo(capture, 'DELETE', deletePath)[0]?.status).toBe(200);
  await capture.settle();

  const deletion = writesTo(capture, 'DELETE', deletePath);
  assert.equal(deletion.length, 1, 'accepting the dialog issues exactly one removal');
  assert.deepEqual(deletion[0].body, { creatorVersion: ownerBeforeAction.creatorVersion });
  const ownerAfterRemove = await readOwnerSnapshot(fixture, cookie);
  assert.ok(ownerAfterRemove.creatorVersion > ownerBeforeAction.creatorVersion);
  assert.equal(Object.hasOwn(ownerAfterRemove.placements, target.placementId), false,
    'the accepted removal deletes the placement and therefore drops its chapter membership');
  assert.deepEqual(await fixture.rawResource(target.resourceId), targetResourceBefore,
    'the catalog resource and its version survive removal');
  assert.deepEqual(await fixture.creatorStore.get(targetEditorKey), targetEditorBefore,
    'the editor-authority record survives removal');
  assert.deepEqual(ownerAfterRemove.series[series.id].chapters, [survivingChapter.placementId],
    'removal clears only the removed placement from the complete chapter sequence');
  for (const [placementId, placement] of Object.entries(otherPlacementsBefore)) {
    assert.deepEqual(ownerAfterRemove.placements[placementId], placement,
      'the other placements retain their options and resource identity');
  }
  for (const group of ['featured', 'ordinary']) {
    assert.deepEqual(ownerAfterRemove.order[group], ownerBeforeAction.order[group].filter((id) => id !== target.placementId),
      'removal preserves the order of every unrelated placement');
  }
  assert.deepEqual(ownerAfterRemove.series[series.id].name, seriesBefore.name,
    'removing one chapter does not change the series metadata');

  // The capture settles the HTTP response, not the React effect that applies
  // the canonical removal and clamps the visible query to the last page.
  await expect(page.locator('[data-link-count]')).toHaveText('25 coincidencias de 25 enlaces');
  await expect(page.locator('[data-link-row]')).toHaveCount(25);
  const queryAfterRemove = new URL(page.url()).searchParams;
  assert.equal(queryAfterRemove.get('buscar'), search);
  assert.equal(queryAfterRemove.get('orden'), 'titulo-asc');
  assert.equal(queryAfterRemove.get('paginaEnlaces'), '1', 'deleting the only last-page row clamps the page');
  const searchBox = page.getByRole('searchbox', { name: 'Buscar título, URL o serie' });
  await expect(searchBox).toBeVisible();
  await expect(searchBox).toBeFocused();
  const retained = page.locator(`[data-retained-resource="${target.resourceId}"]`);
  await expect(retained).toBeVisible();
  assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 0,
    'checking and rendering the removal does not re-add the resource');

  await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
  await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(201);
  await capture.settle();
  const readds = writesTo(capture, 'POST', '/api/creador/enlaces');
  assert.equal(readds.length, 1, 're-inclusion is a separate manual decision and one POST');
  const readd = readds[0];
  assert.equal(readd.status, 201);
  assert.equal(readd.responseBody.operation, 'reinclude-link');
  assert.equal(readd.responseBody.disposition, 'attached');
  assert.equal(readd.body.resourceId, target.resourceId);
  assert.equal(readd.body.resourceVersion, targetResourceBefore.version,
    're-inclusion uses the resource version observed by the owner list');
  const readdedLink = readd.responseBody;
  assert.equal(readdedLink.resourceId, target.resourceId);
  assert.equal(readdedLink.placementId, target.placementId, 'the same resource keeps its stable placement ID');
  const afterReadd = await readOwnerSnapshot(fixture, cookie);
  assert.deepEqual(afterReadd.series[series.id].chapters, [survivingChapter.placementId],
    're-inclusion does not restore the deleted chapter membership');
  assert.equal(afterReadd.order.ordinary.at(-1), target.placementId,
    'the manually re-included placement joins the end of the ordinary sequence');
  assert.equal(afterReadd.placements[target.placementId].resourceId, target.resourceId);
  assert.deepEqual(await fixture.rawResource(target.resourceId), targetResourceBefore);
  assert.deepEqual(await fixture.creatorStore.get(targetEditorKey), targetEditorBefore);
  assert.deepEqual(afterReadd.placements[survivingChapter.placementId], otherPlacementsBefore[survivingChapter.placementId]);
  assert.ok(afterReadd.creatorVersion > ownerAfterRemove.creatorVersion,
    'the manual re-inclusion follows the confirmed removal as a separate creator change');
  const queryAfterReadd = new URL(page.url()).searchParams;
  assert.equal(queryAfterReadd.get('buscar'), search);
  assert.equal(queryAfterReadd.get('orden'), 'titulo-asc');
  assert.equal(queryAfterReadd.get('paginaEnlaces'), '1');
  await capture.stop();
});

test('editar fuera de la búsqueda guarda, conserva el contexto y devuelve el foco al buscador', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const target = await addLink(fixture, cookie, {
    title: 'CASO-FILTRO enlace por corregir',
    url: 'https://links.example/filtro-edicion-target',
  });
  const remainingMatch = await addLink(fixture, cookie, {
    title: 'CASO-FILTRO enlace que sigue',
    url: 'https://links.example/filtro-edicion-restante',
  });
  const unrelated = await addLink(fixture, cookie, {
    title: 'Contenido sin coincidencia',
    url: 'https://links.example/filtro-edicion-ajeno',
  });
  const ownerBefore = await readOwnerSnapshot(fixture, cookie);
  const targetBefore = ownerBefore.placements[target.placementId];
  const resourceBefore = await fixture.rawResource(target.resourceId);
  const searchTerm = 'CASO-FILTRO';
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces&buscar=${encodeURIComponent(searchTerm)}&orden=titulo-desc`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  const initialUrl = new URL(page.url());
  assert.equal(initialUrl.searchParams.get('buscar'), searchTerm);
  assert.equal(initialUrl.searchParams.get('orden'), 'titulo-desc');
  const search = page.getByRole('searchbox', { name: 'Buscar título, URL o serie' });
  const targetRow = page.locator(`[data-link-row="${target.placementId}"]`);
  await expect(targetRow).toBeVisible();
  await expect(page.locator(`[data-link-row="${remainingMatch.placementId}"]`)).toBeVisible();
  await expect(page.locator(`[data-link-row="${unrelated.placementId}"]`)).toHaveCount(0);
  await expect(page.locator('[data-link-count-summary]')).toHaveText('2 coincidencias de 3 enlaces');

  const capture = await captureCreatorApi(page);
  await targetRow.locator('[data-link-edit]').click();
  const editor = linkEditForm(page);
  await expect(editor).toBeVisible();
  const savedTitle = 'Enlace con título nuevo';
  await editor.getByLabel('Título', { exact: true }).fill(savedTitle);
  await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await capture.settle();

  const editPath = `/api/creador/enlaces/${target.placementId}/editar`;
  const edits = writesTo(capture, 'PATCH', editPath);
  assert.equal(edits.length, 1, 'the filtered row is saved through one real owner PATCH');
  assert.equal(edits[0].status, 200);
  assert.deepEqual(edits[0].body, {
    creatorVersion: ownerBefore.creatorVersion,
    resourceVersion: resourceBefore.version,
    title: savedTitle,
  }, 'a metadata-only resource edit uses current owner/resource revisions and the raw touched field');
  assert.equal(edits[0].body.resourceVersion, resourceBefore.version);
  assert.equal(edits[0].body.title, savedTitle);
  assert.equal(edits[0].responseBody.operation, 'edit-link');
  assert.equal(edits[0].responseBody.disposition, 'saved');
  assert.ok(edits[0].responseBody.resourceVersion > resourceBefore.version);
  const afterEdit = await readOwnerSnapshot(fixture, cookie);
  const resourceAfterEdit = afterEdit.resources.find(({ id }) => id === target.resourceId);
  assert.equal(resourceAfterEdit.title, savedTitle,
    'the new title is persisted on the same resource identity');
  assert.equal(afterEdit.creatorVersion, ownerBefore.creatorVersion,
    'metadata-only edits leave the creator content revision unchanged');
  assert.equal(resourceAfterEdit.version, edits[0].responseBody.resourceVersion,
    'the complete owner read agrees with the resource version from the real acknowledgement');
  assert.deepEqual(afterEdit.placements[target.placementId], targetBefore,
    'changing resource metadata does not alter the placement options');
  assert.deepEqual(afterEdit.order, ownerBefore.order,
    'changing resource metadata does not alter either stored sequence');
  await expect(page.locator(`[data-link-row="${target.placementId}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-link-row="${remainingMatch.placementId}"]`)).toBeVisible();
  await expect(page.locator('[data-link-count-summary]')).toHaveText('1 coincidencia de 3 enlaces');
  await expect(page.locator('[data-link-count-summary]')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('[data-owner-status]')).toContainText(/Cambios guardados/iu);
  const updatedQuery = new URL(page.url()).searchParams;
  assert.equal(updatedQuery.get('buscar'), searchTerm);
  assert.equal(updatedQuery.get('orden'), 'titulo-desc');
  assert.equal(updatedQuery.get('paginaEnlaces') ?? '1', '1');

  await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
  await expect(search).toBeFocused();
  await search.press('ControlOrMeta+A');
  await search.press('Backspace');
  await expect(search).toHaveValue('');
  await expect.poll(() => new URL(page.url()).searchParams.has('buscar')).toBe(false);
  await expect(page.locator('[data-link-row]')).toHaveCount(3);
  const clearedQuery = new URL(page.url()).searchParams;
  assert.equal(clearedQuery.get('orden'), 'titulo-desc', 'keyboard-clearing search leaves the selected table order intact');
  const savedRow = page.locator(`[data-link-row="${target.placementId}"]`);
  await expect(savedRow).toBeVisible();
  await expect(savedRow.locator('[data-link-title]')).toHaveText(savedTitle);
  await savedRow.locator('[data-link-edit]').click();
  const cleanEditor = linkEditForm(page);
  await expect(cleanEditor).toBeVisible();
  await expect(cleanEditor.getByLabel('Título', { exact: true })).toHaveValue(savedTitle);
  await cleanEditor.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
  assert.equal(writesTo(capture, 'PATCH', editPath).length, 1, 'reopening and cancelling the clean saved row sends no second PATCH');
  assert.equal((await fixture.rawResource(target.resourceId)).title, savedTitle);
  await capture.stop();
});

import assert from 'node:assert/strict';
import { currentUrlKey, currentUrlReservation } from '../../src/lib/catalog-url.mjs';
import {
  test,
  expect,
  api,
  addLink,
  captureCreatorApi,
  loggedInOwner,
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

function receiptsFrom(record) {
  return record.status === 204
    ? JSON.parse(record.responseHeaders['creator-write-versions'] ?? '[]')
    : record.responseBody?.versionChanges ?? [];
}

function sortedReceipts(changes) {
  return [...changes].sort((left, right) => `${left.entity}:${left.id}`.localeCompare(`${right.entity}:${right.id}`));
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

test('alta propia con acuse perdido: comprueba la URL original y guarda después la corrección de texto y URL', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const before = await fixture.rawOwner(cookie);
  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page);

  await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const form = addLinkForm(page);
  const attemptedUrl = 'https://links.example/alta-recuperable';
  const correctedUrl = 'https://links.example/alta-recuperable-corregida';
  await form.getByLabel('Título', { exact: true }).fill('Título enviado A');
  await form.getByLabel('URL', { exact: true }).fill(attemptedUrl);
  await form.getByLabel(/Descripción/).fill('Descripción enviada A');

  let signalCommit;
  let releaseResponse;
  const committed = new Promise((resolve) => { signalCommit = resolve; });
  const responseGate = new Promise((resolve) => { releaseResponse = resolve; });
  let actualCreate;
  const createPath = '/api/creador/enlaces';
  const dropCommittedCreateResponse = async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    const path = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() !== 'POST' || path !== createPath || body.resourceId) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    actualCreate = { status: response.status(), body: await response.json(), requestBody: body };
    signalCommit();
    await responseGate;
    await route.abort('failed');
  };
  await page.route('**/api/creador/**', dropCommittedCreateResponse);

  let submit;
  try {
    submit = form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await committed;
    assert.equal(actualCreate.status, 201, 'the real create handler commits before the browser loses its response');
    assert.equal(actualCreate.body.created, true);
    assert.deepEqual(actualCreate.requestBody, {
      title: 'Título enviado A',
      url: attemptedUrl,
      description: 'Descripción enviada A',
      selectedForDirectory: true,
    });

    const createdLink = actualCreate.body.link;
    const afterCreate = await fixture.rawOwner(cookie);
    const rawResource = await fixture.rawResource(createdLink.resourceId);
    const rawPlacement = await fixture.rawPlacement(cookie, createdLink.placementId);
    assert.deepEqual({ title: rawResource.title, url: rawResource.url, description: rawResource.description, version: rawResource.version }, {
      title: 'Título enviado A', url: actualCreate.requestBody.url, description: 'Descripción enviada A', version: 1,
    });
    assert.equal(rawPlacement.resourceId, createdLink.resourceId);
    assert.equal(afterCreate.profile.version, before.profile.version + 1);
    assert.deepEqual(sortedReceipts(actualCreate.body.versionChanges), sortedReceipts([
      { entity: 'profile', id: before.profile.id, before: before.profile.version, after: afterCreate.profile.version },
      { entity: 'resource', id: createdLink.resourceId, before: 0, after: rawResource.version },
      { entity: 'placement', id: createdLink.placementId, before: 0, after: rawPlacement.version },
    ]));

    await form.getByLabel('Título', { exact: true }).fill('Corrección B escrita durante el envío');
    await form.getByLabel(/Descripción/).fill('Descripción B escrita durante el envío');
    await form.getByLabel('URL', { exact: true }).fill(correctedUrl);
    releaseResponse();
    await submit;
  } finally {
    releaseResponse();
    await page.unroute('**/api/creador/**', dropCommittedCreateResponse).catch(() => {});
    await submit?.catch(() => {});
  }

  const check = page.getByRole('button', { name: 'Comprobar si se agregó la URL original', exact: true });
  await expect(check, 'the first uncertain result must already expose a manual check').toBeVisible();
  await check.click();
  await expect(page.getByRole('button', { name: 'Usar la página guardada y conservar el alta', exact: true })).toBeVisible();
  const createdLink = actualCreate.body.link;
  await capture.settle();
  const recoveryRead = capture.records.find(({ method, path, responseBody }) => method === 'GET'
    && path === '/api/creador/perfil'
    && responseBody?.links?.some(({ placementId, resourceId, url }) =>
      placementId === createdLink.placementId && resourceId === createdLink.resourceId && url === attemptedUrl));
  assert.ok(recoveryRead, 'Comprobar finds the entity from the original submitted URL, not the late URL correction');
  assert.equal(writesTo(capture, 'POST', createPath).length, 1, 'checking the uncertain create does not repeat its POST');
  assert.equal(writesTo(capture, 'PATCH', `/api/creador/enlaces/${createdLink.placementId}/editar`).length, 0,
    'identifying the original entity does not auto-save late text or options');
  const recoveredResource = await fixture.rawResource(createdLink.resourceId);
  assert.deepEqual({
    title: recoveredResource.title, url: recoveredResource.url,
    description: recoveredResource.description, version: recoveredResource.version,
  }, {
    title: 'Título enviado A', url: attemptedUrl, description: 'Descripción enviada A', version: 1,
  });
  await expect(page.locator('[data-owner-dialog]')).toContainText('Título enviado A');
  await expect(form.getByLabel('Título', { exact: true })).toHaveValue('Corrección B escrita durante el envío');
  await expect(form.getByLabel('URL', { exact: true })).toHaveValue(correctedUrl);
  await expect(form.getByLabel(/Descripción/)).toHaveValue('Descripción B escrita durante el envío');
  const comparison = page.locator('[data-owner-comparison]');
  await expect(comparison).toContainText('No pudimos confirmar el alta');
  await expect(comparison).toContainText(attemptedUrl);
  await expect(comparison).toContainText(`Tu corrección: ${correctedUrl}`);

  const savedPlacement = page.getByRole('button', { name: 'Abrir ficha guardada: Título enviado A', exact: true });
  await expect(savedPlacement).toHaveAttribute('data-owner-adopt-link', createdLink.placementId);
  await savedPlacement.click();
  const recoveredRow = page.locator(`[data-link-row="${createdLink.placementId}"]`);
  await expect(recoveredRow.locator('[data-link-title]')).toHaveText('Título enviado A');
  const editor = linkEditForm(page);
  await expect(editor.getByLabel('Título', { exact: true })).toHaveValue('Corrección B escrita durante el envío');
  await expect(editor.getByLabel('Título', { exact: true })).toBeFocused();
  await expect(editor.getByLabel(/Descripción/)).toHaveValue('Descripción B escrita durante el envío');
  await expect(editor.getByLabel('URL', { exact: true })).toHaveValue(correctedUrl);
  const createLink = actualCreate.body.link;
  const afterCreate = await fixture.rawOwner(cookie);
  const afterCreateResource = await fixture.rawResource(createLink.resourceId);
  const afterCreatePlacement = await fixture.rawPlacement(cookie, createLink.placementId);
  await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await capture.settle();

  const createWrites = writesTo(capture, 'POST', createPath);
  const editWrites = writesTo(capture, 'PATCH', `/api/creador/enlaces/${actualCreate.body.link.placementId}/editar`);
  assert.equal(createWrites.length, 1, 'the original link is never created a second time during recovery');
  assert.equal(editWrites.length, 1, 'the later correction is a distinct, explicit PATCH');
  assert.equal(editWrites[0].status, 200);
  assert.equal(editWrites[0].body.profileVersion, afterCreate.profile.version);
  assert.equal(editWrites[0].body.resourceVersion, afterCreateResource.version);
  assert.equal(editWrites[0].body.placementVersion, afterCreatePlacement.version);
  assert.equal(editWrites[0].body.title, 'Corrección B escrita durante el envío');
  assert.equal(editWrites[0].body.url, correctedUrl, 'the explicit manual PATCH applies the late URL to the original resource identity');
  assert.equal(editWrites[0].body.description, 'Descripción B escrita durante el envío');
  assert.deepEqual(sortedReceipts(receiptsFrom(editWrites[0])), sortedReceipts([
    { entity: 'profile', id: afterCreate.profile.id, before: afterCreate.profile.version, after: afterCreate.profile.version + 1 },
    { entity: 'resource', id: createLink.resourceId, before: afterCreateResource.version, after: afterCreateResource.version + 1 },
  ]));
  assert.deepEqual({
    title: (await fixture.rawResource(createLink.resourceId)).title,
    description: (await fixture.rawResource(createLink.resourceId)).description,
    version: (await fixture.rawResource(createLink.resourceId)).version,
  }, {
    title: 'Corrección B escrita durante el envío',
    description: 'Descripción B escrita durante el envío',
    version: afterCreateResource.version + 1,
  });
  await capture.stop({ skipErrorBodies: true });
});

test('alta rechazada antes del commit: conserva el formulario y sólo Guardar una entrada válida crea el enlace', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const before = await fixture.rawOwner(cookie);
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
  assert.equal((await fixture.rawOwner(cookie)).profile.version, before.profile.version,
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
  assert.equal((await fixture.rawOwner(cookie)).profile.version, before.profile.version);

  await form.getByLabel('URL', { exact: true }).fill('https://links.example/alta-precommit');
  await form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Alta que no llegó al servicio' })).toHaveCount(1);
  await capture.settle();
  const posts = writesTo(capture, 'POST', '/api/creador/enlaces');
  assert.equal(posts.length, 2, 'the invalid attempt and the corrected manual submit are the only create requests');
  assert.equal(posts[0].status, 422);
  assert.equal(posts[1].status, 201);
  assert.equal(posts[1].responseBody.created, true);
  assert.equal((await fixture.rawOwner(cookie)).profile.version, before.profile.version + 1);
  assert.equal((await fixture.rawResource(posts[1].responseBody.link.resourceId)).title, 'Alta que no llegó al servicio');
  await capture.stop();
});

test('referencia compartida: guardar opciones no ofrece ni persiste autoridad sobre los metadatos', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const shared = await seedSharedCatalogResource(fixture);
  const beforeReference = await fixture.rawOwner(cookie);
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
  const referenced = reference[0].responseBody.link;
  assert.equal((await fixture.creatorStore.get(`editor:${(await fixture.rawOwner(cookie)).profile.id}:${shared.id}`)), null,
    'referencing does not create an editor-authority record');
  assert.deepEqual(await fixture.rawResource(shared.id), shared);

  await row.getByRole('button', { name: 'Editar opciones', exact: true }).click();
  const editor = linkEditForm(page);
  await expect(editor.getByLabel('Título', { exact: true })).toBeDisabled();
  await expect(editor.getByLabel('Título', { exact: true })).toHaveValue(shared.title);
  await expect(editor.getByLabel('URL', { exact: true })).toBeDisabled();
  await expect(editor.getByLabel('URL', { exact: true })).toHaveValue(shared.url);
  await expect(editor.getByLabel(/Descripción/)).toBeDisabled();
  await expect(editor.getByLabel(/Descripción/)).toHaveValue(shared.description ?? '');
  await editor.getByLabel('Destacar en tu página').check();
  const beforeOptions = await fixture.rawOwner(cookie);
  const placementBeforeOptions = await fixture.rawPlacement(cookie, referenced.placementId);
  await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await capture.settle();

  const optionPatch = writesTo(capture, 'PATCH', `/api/creador/enlaces/${referenced.placementId}/editar`);
  assert.equal(optionPatch.length, 1);
  assert.equal(optionPatch[0].status, 200);
  assert.equal(optionPatch[0].body.featured, true);
  assert.equal(optionPatch[0].body.selectedForDirectory, false);
  for (const field of ['title', 'url', 'description']) {
    assert.equal(Object.hasOwn(optionPatch[0].body, field), false,
      `an options-only change cannot write shared ${field}`);
  }
  assert.equal(writesTo(capture, 'PATCH', `/api/creador/recursos/${shared.id}`).length, 0);
  assert.deepEqual(sortedReceipts(receiptsFrom(optionPatch[0])), sortedReceipts([
    { entity: 'profile', id: beforeOptions.profile.id, before: beforeOptions.profile.version, after: beforeOptions.profile.version + 1 },
    { entity: 'placement', id: referenced.placementId, before: placementBeforeOptions.version, after: placementBeforeOptions.version + 1 },
  ]));
  assert.equal(beforeReference.profile.version + 1, referenced.placementVersion,
    'the reference creates its placement at the profile version it commits');
  assert.deepEqual(await fixture.rawResource(shared.id), shared,
    'the resource metadata and version remain byte-for-byte at their original values');
  const placement = await fixture.rawPlacement(cookie, referenced.placementId);
  assert.deepEqual({ featured: placement.featured, selectedForDirectory: placement.selectedForDirectory }, {
    featured: true, selectedForDirectory: false,
  });
  await capture.stop();
});

test('ficha retirada en conflicto: adoptar, reincorporar con esa versión y guardar manualmente desde la fila', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const link = await addLink(fixture, cookie, {
    title: 'Título inicial de ficha propia',
    url: 'https://links.example/ficha-retirada-conflicto',
  });
  const ownerBeforeRemove = await fixture.rawOwner(cookie);
  const removal = await api(fixture, cookie, `/api/creador/enlaces/${link.placementId}`, {
    method: 'DELETE', body: { profileVersion: ownerBeforeRemove.profile.version },
  });
  assert.equal(removal.response.status, 204);
  const originalResource = await fixture.rawResource(link.resourceId);
  const ownerAfterRemove = await fixture.rawOwner(cookie);
  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });

  const retained = page.locator(`[data-owner-retained-links] [data-retained-resource="${link.resourceId}"]`);
  await retained.getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const editor = linkEditForm(page);
  await editor.getByLabel('Título', { exact: true }).fill('Corrección local que debe quedar en conflicto');
  const concurrent = await api(fixture, cookie, `/api/creador/recursos/${link.resourceId}`, {
    method: 'PATCH', body: { title: 'Título guardado por otra edición', version: originalResource.version },
  });
  assert.equal(concurrent.response.status, 200);
  const remotelySaved = await fixture.rawResource(link.resourceId);
  const staleSave = editor.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
  const stalePath = `/api/creador/recursos/${link.resourceId}`;
  await expect.poll(() => writesTo(capture, 'PATCH', stalePath)[0]?.status).toBe(409);
  assert.equal(writesTo(capture, 'PATCH', stalePath).length, 1);
  assert.equal(writesTo(capture, 'PATCH', stalePath)[0].body.version, originalResource.version);
  assert.equal(writesTo(capture, 'PATCH', stalePath)[0].body.title, 'Corrección local que debe quedar en conflicto');
  await staleSave;
  await expect(editor.getByRole('button', { name: /Comprobar|Comparar con lo guardado/ })).toBeVisible();
  await editor.getByRole('button', { name: /Comprobar|Comparar con lo guardado/ }).click();
  await expect(editor).toContainText('Título guardado por otra edición');
  await expect(editor.getByLabel('Título', { exact: true })).toHaveValue('Corrección local que debe quedar en conflicto');
  assert.deepEqual(await fixture.rawResource(link.resourceId), remotelySaved,
    'comparison performs no write and leaves the remote raw resource intact');

  const adoptSaved = editor.getByRole('button', { name: /^(?:Usar los datos guardados|Usar la versión guardada)$/u });
  await expect(adoptSaved).toBeVisible();
  await adoptSaved.click();
  await expect(editor.getByLabel('Título', { exact: true })).toHaveValue('Título guardado por otra edición');
  assert.deepEqual(await fixture.rawResource(link.resourceId), remotelySaved,
    'adopting the comparison changes the editor base without writing the resource');
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
  const readdPath = '/api/creador/enlaces';
  await expect.poll(() => writesTo(capture, 'POST', readdPath)[0]?.status).toBe(201);
  assert.equal(writesTo(capture, 'POST', readdPath).length, 1);
  const readd = writesTo(capture, 'POST', readdPath)[0];
  await readd.settled;
  const readdedLink = readd.responseBody.link;
  assert.equal(readd.status, 201);
  assert.equal(readd.body.resourceId, link.resourceId);
  assert.equal(readd.body.resourceVersion, remotelySaved.version,
    'the next operation consumes the resource version from the full comparison adopted above');
  assert.equal(readdedLink.resourceVersion, remotelySaved.version);
  assert.deepEqual(await fixture.rawResource(link.resourceId), remotelySaved,
    're-adding consumes the adopted resource version without changing its shared catalog record');
  const readdedPlacement = await fixture.rawPlacement(cookie, readdedLink.placementId);
  assert.equal(readdedPlacement.version, readd.responseBody.versionChanges.find(({ entity, id }) => entity === 'placement' && id === readdedLink.placementId).after);

  const activeRow = page.getByRole('row').filter({ hasText: remotelySaved.title });
  await activeRow.getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const activeEditor = linkEditForm(page);
  await activeEditor.getByLabel('Título', { exact: true }).fill('Edición manual después de adoptar');
  await activeEditor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await capture.settle();

  const stalePatches = writesTo(capture, 'PATCH', stalePath);
  const activePatch = writesTo(capture, 'PATCH', `/api/creador/enlaces/${readdedLink.placementId}/editar`);
  assert.equal(stalePatches.length, 1, 'the stale retired-resource command is never replayed');
  assert.equal(stalePatches[0].status, 409);
  assert.equal(activePatch.length, 1, 'the later metadata edit is a separate manual write from the active row');
  assert.equal(activePatch[0].status, 200);
  assert.equal(activePatch[0].body.profileVersion, readd.responseBody.versionChanges.find(({ entity }) => entity === 'profile').after);
  assert.equal(activePatch[0].body.placementVersion, readdedPlacement.version);
  assert.equal(activePatch[0].body.resourceVersion, remotelySaved.version,
    'the manual row edit uses the resource version carried through adoption and re-add');
  assert.equal(activePatch[0].body.title, 'Edición manual después de adoptar');
  assert.deepEqual(sortedReceipts(receiptsFrom(activePatch[0])), sortedReceipts([
    { entity: 'profile', id: ownerAfterRemove.profile.id, before: ownerAfterRemove.profile.version + 1, after: ownerAfterRemove.profile.version + 2 },
    { entity: 'resource', id: link.resourceId, before: remotelySaved.version, after: remotelySaved.version + 1 },
  ]));
  assert.deepEqual(await fixture.rawResource(link.resourceId), {
    ...remotelySaved,
    title: 'Edición manual después de adoptar',
    version: remotelySaved.version + 1,
  });
  assert.equal((await fixture.rawOwner(cookie)).profile.version, ownerAfterRemove.profile.version + 2,
    'only re-add and the manual row edit advance the owner profile after removal');
  const finalPlacement = await fixture.rawPlacement(cookie, readdedLink.placementId);
  assert.equal(finalPlacement.version, readdedPlacement.version,
    'editing shared metadata does not advance the newly created placement');
  await capture.stop({ skipErrorBodies: true });
});

test('quitar confirmado y reincorporar rechazado: comprobar cada acción sin replay antes de una nueva decisión', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const link = await addLink(fixture, cookie, {
    title: 'Enlace para recuperar en lista',
    url: 'https://links.example/lista-incierta',
  });
  const beforeRemove = await fixture.rawOwner(cookie);
  const resourceBefore = await fixture.rawResource(link.resourceId);
  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page);

  let signalRemoveCommit;
  let releaseRemoveResponse;
  const removeCommitted = new Promise((resolve) => { signalRemoveCommit = resolve; });
  const removeResponseGate = new Promise((resolve) => { releaseRemoveResponse = resolve; });
  let actualRemoveStatus;
  let lostRemoveResponse = false;
  const controlListResponses = async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (!lostRemoveResponse && request.method() === 'DELETE' && path === `/api/creador/enlaces/${link.placementId}`) {
      const response = await route.fetch();
      actualRemoveStatus = response.status();
      lostRemoveResponse = true;
      signalRemoveCommit();
      await removeResponseGate;
      await route.abort('failed');
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', controlListResponses);

  let removeClick;
  try {
    page.once('dialog', (dialog) => dialog.accept());
    removeClick = page.getByRole('row').filter({ hasText: link.title })
      .getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    await removeCommitted;
    assert.equal(actualRemoveStatus, 204, 'the real service removes the placement before its response is dropped');
    assert.equal(await fixture.rawPlacement(cookie, link.placementId), null);
    releaseRemoveResponse();
    await removeClick;
  } finally {
    releaseRemoveResponse();
    await removeClick?.catch(() => {});
  }

  await expect(page.getByRole('button', { name: 'Comprobar', exact: true }),
    'the committed but unacknowledged list action exposes a check immediately').toBeVisible();
  await page.getByRole('button', { name: 'Comprobar', exact: true }).click();
  await expect(page.locator(`[data-link-row="${link.placementId}"]`)).toHaveCount(0);
  const retained = page.locator(`[data-retained-resource="${link.resourceId}"]`);
  await expect(retained).toBeVisible();
  assert.equal(writesTo(capture, 'DELETE', `/api/creador/enlaces/${link.placementId}`).length, 1,
    'checking the committed removal does not repeat DELETE');
  assert.equal(await fixture.rawPlacement(cookie, link.placementId), null);

  const concurrentEdit = await api(fixture, cookie, `/api/creador/recursos/${link.resourceId}`, {
    method: 'PATCH',
    body: { title: 'Ficha actualizada durante la retirada', version: resourceBefore.version },
  });
  assert.equal(concurrentEdit.response.status, 200);
  const latestResource = await fixture.rawResource(link.resourceId);
  assert.equal(latestResource.version, resourceBefore.version + 1);

  await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
  await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(409);
  assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1,
    'the stale re-add is one real service rejection before the placement transaction');
  assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces')[0].body.resourceVersion, resourceBefore.version);
  assert.equal(await fixture.rawPlacement(cookie, link.placementId), null,
    'the rejected re-add does not restore the placement');
  await expect(page.getByRole('button', { name: 'Comprobar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Comprobar', exact: true }).click();
  assert.equal(await fixture.rawPlacement(cookie, link.placementId), null,
    'checking the real stale-version rejection leaves the resource retired');
  assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1,
    'checking the failed re-add does not replay its POST');
  await expect(page.locator(`[data-retained-resource="${link.resourceId}"]`)).toContainText(latestResource.title);
  await expect(page.locator(`[data-retained-resource="${link.resourceId}"]`)).toBeVisible();

  await page.locator(`[data-retained-resource="${link.resourceId}"]`)
    .getByRole('button', { name: 'Volver a agregar', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: latestResource.title })).toHaveCount(1);
  await capture.settle();
  const deletes = writesTo(capture, 'DELETE', `/api/creador/enlaces/${link.placementId}`);
  const posts = writesTo(capture, 'POST', '/api/creador/enlaces');
  assert.equal(deletes.length, 1);
  assert.equal(posts.length, 2, 'one failed re-add and one manually selected re-add are the only POSTs');
  assert.equal(posts[0].status, 409);
  assert.equal(posts[0].body.resourceId, link.resourceId);
  assert.equal(posts[0].body.resourceVersion, resourceBefore.version);
  assert.equal(posts[1].status, 201);
  assert.equal(posts[1].body.resourceId, link.resourceId);
  assert.equal(posts[1].body.resourceVersion, latestResource.version);
  const after = await fixture.rawOwner(cookie);
  assert.equal(after.profile.version, beforeRemove.profile.version + 2,
    'only the committed remove and later successful re-add advance the profile');
  assert.deepEqual(await fixture.rawResource(link.resourceId), latestResource,
    'the failed re-add and later successful re-add do not change resource metadata');
  const placement = await fixture.rawPlacement(cookie, link.placementId);
  assert.equal(placement.resourceId, link.resourceId);
  assert.equal(placement.version, after.profile.version);
  await page.unroute('**/api/creador/**', controlListResponses).catch(() => {});
  await capture.stop({ skipErrorBodies: true });
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
  const survivingChapter = links[0];
  const ownerBeforeSeries = await fixture.rawOwner(cookie);
  const seriesResult = await api(fixture, cookie, '/api/creador/series', {
    method: 'POST',
    body: {
      name: 'Serie de pertenencias conservadas',
      slug: 'pertenencias-conservadas',
      profileVersion: ownerBeforeSeries.profile.version,
    },
  });
  assert.equal(seriesResult.response.status, 201);
  const series = seriesResult.body.series;
  for (const link of [survivingChapter, target]) {
    const owner = await fixture.rawOwner(cookie);
    const added = await api(fixture, cookie, `/api/creador/series/${series.id}/capitulos/${link.placementId}`, {
      method: 'PUT', body: { profileVersion: owner.profile.version },
    });
    assert.equal(added.response.status, 200, JSON.stringify(added.body));
  }

  const ownerBeforeAction = await fixture.rawOwner(cookie);
  const targetPlacementBefore = await fixture.rawPlacement(cookie, target.placementId);
  const targetResourceBefore = await fixture.rawResource(target.resourceId);
  const targetEditorKey = `editor:${ownerBeforeAction.profile.id}:${target.resourceId}`;
  const targetEditorBefore = await fixture.creatorStore.get(targetEditorKey);
  const seriesBefore = await fixture.rawSeries(cookie, series.id);
  const otherPlacementsBefore = await Promise.all(links.slice(0, 25)
    .map(({ placementId }) => fixture.rawPlacement(cookie, placementId)));
  assert.ok(targetPlacementBefore.series?.[series.id], 'the target is a chapter before removal');
  assert.ok((await fixture.rawPlacement(cookie, survivingChapter.placementId)).series?.[series.id],
    'another chapter provides an unaffected membership oracle');
  assert.ok(targetEditorBefore, 'the owner retains editing authority over the removed resource');

  const search = 'Lista persistente';
  const capture = await captureCreatorApi(page);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces&buscar=${encodeURIComponent(search)}&orden=titulo-asc&paginaEnlaces=2`);
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  await expect(page.locator('[data-link-count]')).toHaveText('26 coincidencias de 26 enlaces');
  await expect(page.locator('[data-link-row]')).toHaveCount(1);
  const targetRow = page.getByRole('row').filter({ hasText: target.title });
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
  assert.deepEqual(await fixture.rawPlacement(cookie, target.placementId), targetPlacementBefore);
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
  await expect.poll(() => writesTo(capture, 'DELETE', deletePath)[0]?.status).toBe(204);
  await capture.settle();

  const deletion = writesTo(capture, 'DELETE', deletePath);
  assert.equal(deletion.length, 1, 'accepting the dialog issues exactly one removal');
  assert.deepEqual(deletion[0].body, { profileVersion: ownerBeforeAction.profile.version });
  const ownerAfterRemove = await fixture.rawOwner(cookie);
  assert.equal(ownerAfterRemove.profile.version, ownerBeforeAction.profile.version + 1);
  assert.deepEqual(sortedReceipts(receiptsFrom(deletion[0])), sortedReceipts([
    { entity: 'profile', id: ownerBeforeAction.profile.id, before: ownerBeforeAction.profile.version, after: ownerAfterRemove.profile.version },
  ]));
  assert.equal(await fixture.rawPlacement(cookie, target.placementId), null,
    'the accepted removal deletes the placement and therefore drops its chapter membership');
  assert.deepEqual(await fixture.rawResource(target.resourceId), targetResourceBefore,
    'the catalog resource and its version survive removal');
  assert.deepEqual(await fixture.creatorStore.get(targetEditorKey), targetEditorBefore,
    'the editor-authority record survives removal');
  assert.deepEqual(await fixture.rawSeries(cookie, series.id), seriesBefore,
    'removing one chapter does not change the series record');
  assert.deepEqual(await Promise.all(links.slice(0, 25)
    .map(({ placementId }) => fixture.rawPlacement(cookie, placementId))), otherPlacementsBefore,
  'all other placements, including the other chapter, retain their raw positions, versions, and memberships');
  const remainingChapter = await fixture.rawPlacement(cookie, survivingChapter.placementId);
  assert.deepEqual(remainingChapter.series[series.id],
    otherPlacementsBefore[0].series[series.id], 'the other chapter remains in its series');

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
  const readdedLink = readd.responseBody.link;
  assert.equal(readd.status, 201);
  assert.equal(readd.body.resourceId, target.resourceId);
  assert.equal(readd.body.resourceVersion, targetResourceBefore.version,
    're-inclusion uses the resource version observed by the owner list');
  assert.equal(readd.responseBody.created, true);
  assert.equal(readdedLink.resourceId, target.resourceId);
  assert.equal(readdedLink.resourceVersion, targetResourceBefore.version);
  assert.deepEqual(readdedLink.series, [], 're-inclusion does not restore the deleted chapter');
  const readdedPlacement = await fixture.rawPlacement(cookie, readdedLink.placementId);
  assert.equal(readdedPlacement.resourceId, target.resourceId);
  assert.deepEqual(readdedPlacement.series ?? {}, {});
  assert.deepEqual(await fixture.rawResource(target.resourceId), targetResourceBefore);
  assert.deepEqual(await fixture.creatorStore.get(targetEditorKey), targetEditorBefore);
  assert.deepEqual(await fixture.rawPlacement(cookie, survivingChapter.placementId), otherPlacementsBefore[0]);
  assert.deepEqual(await fixture.rawSeries(cookie, series.id), seriesBefore);
  assert.equal((await fixture.rawOwner(cookie)).profile.version, ownerBeforeAction.profile.version + 2,
    'only the accepted removal and manual re-inclusion advance the profile');
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
  const ownerBefore = await fixture.rawOwner(cookie);
  const targetBefore = await fixture.rawPlacement(cookie, target.placementId);
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
  assert.equal(edits[0].body.profileVersion, ownerBefore.profile.version);
  assert.equal(edits[0].body.placementVersion, targetBefore.version);
  assert.equal(edits[0].body.resourceVersion, resourceBefore.version);
  assert.equal(edits[0].body.title, savedTitle);
  assert.equal((await fixture.rawResource(target.resourceId)).title, savedTitle,
    'the new title is persisted on the same resource identity');
  assert.equal((await fixture.rawOwner(cookie)).profile.version, ownerBefore.profile.version + 1);
  assert.deepEqual(await fixture.rawPlacement(cookie, target.placementId), targetBefore,
    'changing resource metadata does not alter the placement or its order');
  await expect(page.locator(`[data-link-row="${target.placementId}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-link-row="${remainingMatch.placementId}"]`)).toBeVisible();
  await expect(page.locator('[data-link-count-summary]')).toHaveText('1 coincidencia de 3 enlaces');
  await expect(page.locator('[data-link-count-summary]')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('[data-owner-status]')).toContainText(/(?:ya no coincide|no coincide).*(?:búsqueda|filtro|resultados)|(?:fuera|dejó).*(?:búsqueda|filtro|resultados)/iu);
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

test('alta de URL compartida: conserva texto tardío hasta descartar y guarda opciones sólo por decisión manual', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const shared = await seedSharedCatalogResource(fixture);
  const ownerBefore = await fixture.rawOwner(cookie);
  const editorKey = `editor:${ownerBefore.profile.id}:${shared.id}`;
  const editorReferenceBefore = await fixture.creatorStore.get(editorKey);
  assert.equal(editorReferenceBefore, null, 'the shared catalog row starts without owner edit authority');
  const catalogReads = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/catalog-selection.json') catalogReads.push(request.url());
  });
  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page);

  await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const addForm = addLinkForm(page);
  const submitted = {
    title: 'Título enviado para la referencia',
    url: shared.url,
    description: 'Descripción enviada para la referencia',
    selectedForDirectory: true,
  };
  await addForm.getByLabel('Título', { exact: true }).fill(submitted.title);
  await addForm.getByLabel('URL', { exact: true }).fill(submitted.url);
  await addForm.getByLabel(/Descripción/).fill(submitted.description);
  await addForm.getByLabel('Proponer al directorio').check();

  let signalCommit;
  let releaseReply;
  const committed = new Promise((resolve) => { signalCommit = resolve; });
  const replyGate = new Promise((resolve) => { releaseReply = resolve; });
  let actualAdd;
  let responseDelivered = false;
  const createPath = '/api/creador/enlaces';
  const holdRealSharedAdd = async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    const path = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (responseDelivered || request.method() !== 'POST' || path !== createPath || body.url !== shared.url) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    actualAdd = { status: response.status(), body: await response.json(), requestBody: body };
    signalCommit();
    await replyGate;
    responseDelivered = true;
    await route.fulfill({ response, json: actualAdd.body });
  };
  await page.route('**/api/creador/**', holdRealSharedAdd);
  let submit;
  try {
    submit = addForm.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await committed;
    assert.equal(actualAdd.status, 201, 'the real service creates only this creator’s placement while reusing the shared resource');
    assert.equal(actualAdd.body.created, true);
    assert.deepEqual(actualAdd.requestBody, submitted);
    assert.equal(actualAdd.body.link.resourceId, shared.id);
    assert.equal(actualAdd.body.link.title, shared.title, 'the response keeps canonical shared metadata');
    assert.equal(actualAdd.body.link.url, shared.url);
    assert.equal(actualAdd.body.link.description, shared.description);
    assert.equal(actualAdd.body.link.selectedForDirectory, true);
    assert.deepEqual(sortedReceipts(actualAdd.body.versionChanges), sortedReceipts([
      { entity: 'profile', id: ownerBefore.profile.id, before: ownerBefore.profile.version, after: ownerBefore.profile.version + 1 },
      { entity: 'placement', id: actualAdd.body.link.placementId, before: 0, after: actualAdd.body.link.placementVersion },
    ]));
    assert.equal(actualAdd.body.versionChanges.some(({ entity }) => entity === 'resource'), false,
      'referencing shared content never writes a resource version');
    assert.deepEqual(await fixture.rawResource(shared.id), shared);

    await addForm.getByLabel('Título', { exact: true }).fill('Título tardío de la referencia');
    await addForm.getByLabel('URL', { exact: true }).fill('https://links.example/referencia-corregida-tarde');
    await addForm.getByLabel(/Descripción/).fill('Descripción tardía de la referencia');
    await addForm.getByLabel('Proponer al directorio').uncheck();
    releaseReply();
    await submit;
  } finally {
    releaseReply();
    await page.unroute('**/api/creador/**', holdRealSharedAdd).catch(() => {});
    await submit?.catch(() => {});
  }

  await capture.settle();
  const link = actualAdd.body.link;
  const addWrites = writesTo(capture, 'POST', createPath);
  assert.equal(addWrites.length, 1, 'the real response is applied without a replay');
  assert.deepEqual(addWrites[0].body, submitted);
  assert.equal(writesTo(capture, 'PATCH', `/api/creador/enlaces/${link.placementId}/editar`).length, 0,
    'late metadata and the late opt-out do not trigger automatic writes');
  assert.equal(writesTo(capture, 'PATCH', `/api/creador/recursos/${shared.id}`).length, 0);
  await expect(addForm).toBeVisible();
  await expect(addForm.getByLabel('Título', { exact: true })).toHaveValue('Título tardío de la referencia');
  await expect(addForm.getByLabel('URL', { exact: true })).toHaveValue('https://links.example/referencia-corregida-tarde');
  await expect(addForm.getByLabel(/Descripción/)).toHaveValue('Descripción tardía de la referencia');
  await expect(addForm.getByLabel('Proponer al directorio')).not.toBeChecked();
  const row = page.getByRole('row').filter({ hasText: shared.title });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('button', { name: 'Editar ficha', exact: true })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Editar opciones', exact: true })).toBeVisible();
  const ownerAfterAdd = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(ownerAfterAdd.response.status, 200);
  assert.equal(ownerAfterAdd.body.editableResources.some(({ id }) => id === shared.id), false);
  assert.equal(await fixture.creatorStore.get(editorKey), null);
  const placementAfterAdd = await fixture.rawPlacement(cookie, link.placementId);
  assert.equal(placementAfterAdd.selectedForDirectory, true,
    'the late opt-out was not applied to the committed placement');
  const exitPrompt = page.locator('[data-owner-exit-prompt]');
  await addForm.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(exitPrompt).toBeVisible();
  await exitPrompt.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await expect(exitPrompt).toBeHidden();
  await expect(addForm).toBeVisible();
  await expect(addForm.getByLabel('Título', { exact: true })).toHaveValue('Título tardío de la referencia');
  await expect(addForm.getByLabel('URL', { exact: true })).toHaveValue('https://links.example/referencia-corregida-tarde');
  await expect(addForm.getByLabel(/Descripción/)).toHaveValue('Descripción tardía de la referencia');
  assert.equal(capture.writes().length, 1, 'continuing the guard leaves the submitted placement unchanged');

  await addForm.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(exitPrompt).toBeVisible();
  await exitPrompt.getByRole('button', { name: /^Descartar(?: cambios)?$/u }).click();
  await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
  assert.equal(capture.writes().length, 1, 'discard is local and never writes shared metadata or the late option');
  assert.deepEqual(await fixture.rawResource(shared.id), shared);

  await row.getByRole('button', { name: 'Editar opciones', exact: true }).click();
  const optionsForm = linkEditForm(page);
  await expect(optionsForm).toBeVisible();
  await expect(exitPrompt).toBeHidden();
  await expect(optionsForm.getByLabel('Título', { exact: true })).toBeDisabled();
  await expect(optionsForm.getByLabel('Título', { exact: true })).toHaveValue(shared.title);
  await expect(optionsForm.getByLabel('URL', { exact: true })).toBeDisabled();
  await expect(optionsForm.getByLabel('URL', { exact: true })).toHaveValue(shared.url);
  await expect(optionsForm.getByLabel(/Descripción/)).toBeDisabled();
  await expect(optionsForm.getByLabel(/Descripción/)).toHaveValue(shared.description ?? '');
  await expect(optionsForm.getByLabel('Proponer al directorio')).toBeChecked();
  await expect(optionsForm.getByLabel('Destacar en tu página')).not.toBeChecked();
  assert.equal(capture.writes().length, 1, 'opening the options-only editor after discard adds no write');
  assert.deepEqual(await fixture.rawResource(shared.id), shared);

  await optionsForm.getByLabel('Destacar en tu página').check();
  await optionsForm.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await capture.settle();
  const optionWrites = writesTo(capture, 'PATCH', `/api/creador/enlaces/${link.placementId}/editar`);
  assert.equal(optionWrites.length, 1, 'only the explicit options save sends a PATCH');
  const optionPatch = optionWrites[0];
  assert.equal(optionPatch.status, 200);
  assert.equal(optionPatch.body.profileVersion, ownerAfterAdd.body.profile.version);
  assert.equal(optionPatch.body.placementVersion, placementAfterAdd.version);
  assert.equal(optionPatch.body.resourceVersion, shared.version);
  assert.equal(optionPatch.body.featured, true);
  assert.equal(optionPatch.body.selectedForDirectory, true,
    'the manually saved option uses the clean saved base, not the late opt-out');
  for (const field of ['title', 'url', 'description']) {
    assert.equal(Object.hasOwn(optionPatch.body, field), false, `the options-only PATCH cannot write shared ${field}`);
  }
  assert.deepEqual(sortedReceipts(receiptsFrom(optionPatch)), sortedReceipts([
    { entity: 'profile', id: ownerAfterAdd.body.profile.id, before: ownerAfterAdd.body.profile.version, after: ownerAfterAdd.body.profile.version + 1 },
    { entity: 'placement', id: link.placementId, before: placementAfterAdd.version, after: placementAfterAdd.version + 1 },
  ]));
  assert.equal(writesTo(capture, 'PATCH', `/api/creador/recursos/${shared.id}`).length, 0);
  assert.deepEqual(await fixture.rawResource(shared.id), shared);
  const placementAfterOptions = await fixture.rawPlacement(cookie, link.placementId);
  assert.deepEqual({ featured: placementAfterOptions.featured, selectedForDirectory: placementAfterOptions.selectedForDirectory }, {
    featured: true, selectedForDirectory: true,
  });

  const dialog = page.locator('[data-owner-dialog]');
  await expect(dialog).not.toBeVisible();
  await row.getByRole('button', { name: 'Editar opciones', exact: true }).click();
  const reopenedOptions = linkEditForm(page);
  await expect(reopenedOptions).toBeVisible();
  await expect(exitPrompt).toBeHidden();
  await expect(reopenedOptions.getByLabel('Proponer al directorio')).toBeChecked();
  await expect(reopenedOptions.getByLabel('Destacar en tu página')).toBeChecked();
  await reopenedOptions.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(exitPrompt).toBeHidden();
  assert.equal(capture.writes().length, 2, 'closing and reopening a clean shared editor causes no hidden correction write');
  assert.deepEqual(await fixture.rawResource(shared.id), shared);

  await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const freshAddForm = addLinkForm(page);
  await expect(freshAddForm).toBeVisible();
  await expect(freshAddForm.getByLabel('Título', { exact: true })).toHaveValue('');
  await expect(freshAddForm.getByLabel('URL', { exact: true })).toHaveValue('');
  await expect(freshAddForm.getByLabel(/Descripción/)).toHaveValue('');
  await expect(freshAddForm.getByLabel('Proponer al directorio')).toBeChecked();
  await freshAddForm.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(freshAddForm).not.toBeVisible();
  await expect(exitPrompt).toBeHidden();
  assert.equal(capture.writes().length, 2, 'opening and cancelling a fresh add form adds no writes or exit guard');
  assert.deepEqual(await fixture.rawResource(shared.id), shared);
  assert.equal(catalogReads.length, 0, 'adding a URL never requires loading the catalog index');
  await capture.stop();
});

for (const saveOptions of [true, false]) {
test(`un alta repetida de una URL compartida devuelve el texto tardío al alta ${saveOptions ? 'después de guardar opciones' : 'sin guardar opciones'}`, async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const shared = await seedSharedCatalogResource(fixture);
  const placed = await api(fixture, cookie, '/api/creador/enlaces', {
    method: 'POST', body: { title: shared.title, url: shared.url, description: shared.description, selectedForDirectory: true },
  });
  assert.equal(placed.response.status, 201);
  assert.equal(placed.body.link.resourceId, shared.id);
  const placementId = placed.body.link.placementId;
  const other = saveOptions ? await seedSharedCatalogResource(fixture, {
    id: 'second-shared-resource', title: 'Otra ficha compartida', url: 'https://links.example/second-shared',
  }) : undefined;
  if (other) {
    const response = await api(fixture, cookie, '/api/creador/enlaces', {
      method: 'POST', body: { title: other.title, url: other.url, description: other.description, selectedForDirectory: false },
    });
    assert.equal(response.response.status, 201);
    assert.equal(response.body.link.resourceId, other.id);
  }
  const initial = await fixture.rawOwner(cookie);
  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let acknowledge, reached;
  const gate = new Promise((resolve) => { acknowledge = resolve; });
  const observed = new Promise((resolve) => { reached = resolve; });
  const handler = async (route) => {
    const request = route.request();
    if (request.method() !== 'POST' || new URL(request.url()).pathname.replace(/\/$/u, '') !== '/api/creador/enlaces') {
      return route.continue();
    }
    const response = await route.fetch();
    const result = await response.json();
    reached({ status: response.status(), result });
    await gate;
    await route.fulfill({ response, json: result });
  };
  await page.route('**/api/creador/**', handler);
  let submit;
  try {
    await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const add = addLinkForm(page);
    await add.getByLabel('Título', { exact: true }).fill(shared.title);
    await add.getByLabel('URL', { exact: true }).fill(shared.url);
    await add.getByLabel(/Descripción/).fill(shared.description);
    submit = add.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const actual = await observed;
    assert.equal(actual.status, 200);
    assert.equal(actual.result.created, false);
    assert.equal(actual.result.link.placementId, placementId);
    assert.deepEqual(actual.result.versionChanges, []);
    const lateTitle = 'A distinct late add title';
    const lateUrl = 'https://links.example/different-late-url';
    await add.getByLabel('Título', { exact: true }).fill(lateTitle);
    await add.getByLabel('URL', { exact: true }).fill(lateUrl);
    await add.getByLabel(/Descripción/).fill('Later description for the distinct URL');
    await add.getByLabel('Proponer al directorio').uncheck();
    acknowledge();
    await submit;

    const edit = linkEditForm(page);
    await expect(edit).toBeVisible();
    await expect(add).toHaveCount(0);
    await expect(edit.getByLabel('Título', { exact: true })).toBeDisabled();
    await expect(edit.getByLabel('Título', { exact: true })).toHaveValue(shared.title);
    await expect(edit.getByLabel('URL', { exact: true })).toHaveValue(shared.url);
    await expect(edit.locator('[data-link-add-shared-correction]')).toContainText('Conservamos aparte');
    await expect(edit.locator('[data-owner-form-status="enlace"]')).toContainText('Ese contenido ya estaba en tu página');
    await expect(edit.locator('[data-owner-form-status="enlace"]')).not.toContainText('Cambios guardados');
    assert.equal((await fixture.rawOwner(cookie)).profile.version, initial.profile.version);
    assert.equal((await fixture.rawPlacement(cookie, placementId)).selectedForDirectory, true);
    assert.equal(capture.writes().length, 1);

    const patches = () => writesTo(capture, 'PATCH', `/api/creador/enlaces/${placementId}/editar`);
    if (saveOptions) {
      await edit.getByRole('button', { name: 'Cancelar', exact: true }).click();
      const exit = page.locator('[data-owner-exit-prompt]');
      await exit.getByRole('button', { name: 'Guardar opciones y volver al borrador', exact: true }).click();
      await expect.poll(() => patches()[0]?.status).toBe(200);
      assert.deepEqual(patches()[0].body, {
        profileVersion: initial.profile.version, placementVersion: placed.body.link.placementVersion,
        resourceVersion: shared.version, featured: false, selectedForDirectory: false,
      });
    } else {
      await edit.getByRole('button', { name: 'Volver al borrador sin guardar las opciones', exact: true }).click();
    }
    await expect(add).toBeVisible();
    await expect(add.getByLabel('Título', { exact: true })).toHaveValue(lateTitle);
    await expect(add.getByLabel('URL', { exact: true })).toHaveValue(lateUrl);
    await expect(add.getByLabel(/Descripción/)).toHaveValue('Later description for the distinct URL');
    await expect(add.locator('[data-link-add-status]')).toContainText(saveOptions
      ? 'El borrador del alta sigue pendiente' : 'Las opciones de la ficha compartida siguen sin cambios');
    const current = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(current.body.links.length, other ? 2 : 1);
    assert.equal(current.body.links[0].url, shared.url);
    assert.equal(current.body.links[0].selectedForDirectory, !saveOptions);
    assert.deepEqual(current.body.editableResources, []);
    assert.deepEqual(await fixture.rawResource(shared.id), shared);
    const adds = () => writesTo(capture, 'POST', '/api/creador/enlaces');
    assert.equal(adds().length, 1);

    if (!saveOptions) {
      await add.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await page.locator('[data-owner-exit-prompt]').getByRole('button', { name: 'Descartar cambios', exact: true }).click();
      await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
      assert.equal(capture.writes().length, 1, 'reusing and discarding the draft sends no write');
      assert.deepEqual((await api(fixture, cookie, '/api/creador/perfil')).body, current.body);
      return;
    }

    // Another shared duplicate may receive the already-retained draft with no
    // further input during that request. A 200 with empty receipts cannot save it.
    await add.getByLabel('URL', { exact: true }).fill(other.url);
    await add.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await expect.poll(() => adds()[1]?.status).toBe(200);
    assert.equal(adds()[1].responseBody.link.resourceId, other.id);
    assert.deepEqual(adds()[1].responseBody.versionChanges, []);
    await expect(add.locator('[data-link-add-status]')).toContainText('Ese contenido ya estaba en tu página');
    await expect(add.getByLabel('Título', { exact: true })).toHaveValue(lateTitle);
    await expect(add.getByLabel(/Descripción/)).toHaveValue('Later description for the distinct URL');
    assert.deepEqual((await api(fixture, cookie, '/api/creador/perfil')).body, current.body);
    assert.deepEqual(await fixture.rawResource(other.id), other);

    await add.getByLabel('URL', { exact: true }).fill(lateUrl);
    await add.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await expect.poll(() => adds()[2]?.status).toBe(201);
    const final = await api(fixture, cookie, '/api/creador/perfil');
    assert.deepEqual(final.body.links.map(({ url, title, description }) => ({ url, title, description })), [
      { url: shared.url, title: shared.title, description: shared.description },
      { url: other.url, title: other.title, description: other.description },
      { url: lateUrl, title: lateTitle, description: 'Later description for the distinct URL' },
    ]);
    assert.deepEqual(final.body.editableResources.map(({ id }) => id), [adds()[2].responseBody.link.resourceId]);
    assert.deepEqual(await fixture.rawResource(shared.id), shared);
    assert.equal(adds().length, 3);
    assert.equal(patches().length, 1);
  } finally {
    acknowledge();
    await submit?.catch(() => {});
    await page.unroute('**/api/creador/**', handler).catch(() => {});
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});
}

import assert from 'node:assert/strict';
import {
  test, expect, addCookie, readOwnerSnapshot, createSeries, addLink, addChapter,
  captureCreatorApi, seriesRow, openSeriesView, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

test('la primera página SSR autentica por cookie, crea el perfil y rechaza otro origen', async ({ fixture, browser, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  const browserCookies = await page.context().cookies(fixture.origin);
  const liveCookie = browserCookies.find(({ name }) => name === cookie.name);
  expect(liveCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });
  assert.equal((await readOwnerSnapshot(fixture, cookie)).profile, null,
    'the fresh owner account has no profile before the browser action');

  const capture = await captureCreatorApi(page);
  const response = await page.goto(`${fixture.origin}/cuenta/`);
  assert.equal(response.status(), 200);
  await expect(page.getByRole('heading', { name: 'Tu página', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prepara tu página' })).toBeVisible();
  const createForm = page.locator('[data-owner-form="crear"]');
  await expect(createForm).toBeVisible();
  await createForm.getByLabel('Nombre visible').fill('Ana creada desde el navegador');
  await createForm.getByLabel('Dirección de tu página').fill('ana-creada-browser');
  await createForm.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.locator('[data-owner-name]')).toHaveText('Ana creada desde el navegador');
  await capture.settle();

  const write = capture.writes().find(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
  assert.ok(write, 'the authenticated UI creates a profile through the real endpoint');
  assert.equal(write.status, 200);
  assert.deepEqual(write.body, {
    displayName: 'Ana creada desde el navegador',
    slug: 'ana-creada-browser',
    creatorVersion: null,
  });
  assert.deepEqual({ schemaVersion: write.responseBody.schemaVersion, operation: write.responseBody.operation,
    profileId: write.responseBody.profileId, disposition: write.responseBody.disposition }, {
    schemaVersion: 2, operation: 'save-profile', profileId: (await readOwnerSnapshot(fixture, cookie)).profile.id,
    disposition: 'created',
  });
  assert.ok(Number.isSafeInteger(write.responseBody.creatorVersion));
  assert.equal(Object.hasOwn(write.responseBody, 'versionChanges'), false);
  const persisted = await readOwnerSnapshot(fixture, cookie);
  assert.equal(persisted.profile.displayName, 'Ana creada desde el navegador');
  assert.equal(persisted.profile.slug, 'ana-creada-browser');
  assert.equal(persisted.creatorVersion, write.responseBody.creatorVersion);

  const before = structuredClone(persisted);
  const rejected = await page.context().request.put(`${fixture.origin}/api/creador/perfil/`, {
    data: { creatorVersion: persisted.creatorVersion, displayName: 'No guardar desde otro origen' },
    headers: { origin: 'https://attacker.example', 'x-csrf-token': persisted.profile && (await fixture.principal(cookie)).csrfToken,
      'x-creator-contract': '2' },
  });
  assert.equal(rejected.status(), 403, 'the real Astro route rejects a hostile Origin');
  assert.deepEqual(await readOwnerSnapshot(fixture, cookie), before,
    'the rejected cross-origin request does not change the private owner state');

  const anonymousContext = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const anonymous = await anonymousContext.request.get(`${fixture.origin}/api/creador/perfil/`);
    assert.equal(anonymous.status(), 401, 'a separate context cannot read the private owner API');
  } finally {
    await anonymousContext.close();
  }
  await capture.stop();
});

test('la URL social inválida conserva la validación nativa y descartar limpia el error', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, {
    profileFields: { socials: { instagram: 'https://instagram.example.invalid/ana' } },
  });
  const initial = await readOwnerSnapshot(fixture, cookie);
  const capture = await captureCreatorApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${fixture.origin}/cuenta/`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark',
    'the account view respects the browser dark preference at a narrow viewport');
  await expect(page.locator('[data-theme-toggle]')).toHaveAttribute('aria-pressed', 'true');
  const horizontalSize = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(horizontalSize.document <= horizontalSize.viewport,
    `the owner view has no document-level horizontal overflow at 390px: ${JSON.stringify(horizontalSize)}`);
  assert.ok(horizontalSize.body <= horizontalSize.viewport,
    `the owner view has no body-level horizontal overflow at 390px: ${JSON.stringify(horizontalSize)}`);

  await page.getByRole('button', { name: 'Editar redes' }).click();
  const form = page.locator('[data-owner-dialog] form[data-owner-form="redes"]');
  await expect(form).toBeVisible();
  const instagram = form.locator('#owner-social-instagram');
  await instagram.fill('ftp://invalid.example.invalid/ana');
  await form.getByRole('button', { name: 'Guardar redes' }).click();
  const invalid = await instagram.evaluate((input) => ({ valid: input.checkValidity(), message: input.validationMessage }));
  assert.equal(invalid.valid, false, 'native browser validity blocks the unsupported scheme');
  assert.match(invalid.message, /HTTP o HTTPS/u);
  assert.equal(capture.writes().length, 0, 'an invalid URL never reaches the real profile endpoint');

  await form.getByRole('button', { name: 'Cancelar' }).click();
  const exitPrompt = page.locator('[data-owner-exit-prompt]');
  await expect(exitPrompt).toBeVisible();
  await exitPrompt.locator('[data-owner-exit-discard]').click();
  await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
  await page.getByRole('button', { name: 'Editar redes' }).click();
  const reopened = page.locator('[data-owner-dialog] form[data-owner-form="redes"] #owner-social-instagram');
  await expect(reopened).toHaveValue('https://instagram.example.invalid/ana');
  const restored = await reopened.evaluate((input) => ({ valid: input.checkValidity(), message: input.validationMessage }));
  assert.equal(restored.valid, true);
  assert.equal(restored.message, '', 'discard clears the stale native custom error');
  await page.locator('[data-owner-dialog] form[data-owner-form="redes"]')
    .getByRole('button', { name: 'Guardar redes' }).click();
  await capture.settle();

  const writes = capture.writes();
  assert.equal(writes.length, 1);
  const save = writes[0];
  assert.equal(save.method, 'PUT');
  assert.equal(save.path, '/api/creador/perfil');
  assert.equal(save.body.creatorVersion, initial.creatorVersion);
  assert.equal(Object.hasOwn(save.body, 'socials'), false,
    'the untouched restored social field stays absent from the request');
  assert.equal(save.status, 200);
  assert.equal(save.responseBody.operation, 'save-profile');
  assert.equal(save.responseBody.profileId, initial.profile.id);
  assert.equal(save.responseBody.disposition, 'unchanged');
  assert.equal(save.responseBody.creatorVersion, initial.creatorVersion);
  assert.equal(Object.hasOwn(save.responseBody, 'versionChanges'), false);
  const after = await readOwnerSnapshot(fixture, cookie);
  assert.equal(after.creatorVersion, initial.creatorVersion,
    'the service keeps its revision for the unchanged raw social values');
  assert.deepEqual(after.profile.socials, initial.profile.socials);
  await expect(page.locator('[data-owner-status]')).toContainText(/cambios guardados/i);
  await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
  await capture.stop();
});

test('editar metadatos y confirmar el borrado de una serie conserva los enlaces y las otras series', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const first = await createSeries(fixture, cookie, { name: 'Serie para borrar', slug: 'serie-borrar' });
  const second = await createSeries(fixture, cookie, { name: 'Serie que queda', slug: 'serie-queda' });
  const link = await addLink(fixture, cookie, { title: 'Capítulo compartido', url: 'https://links.example/compartido' });
  await addChapter(fixture, cookie, first.id, link.placementId);
  await addChapter(fixture, cookie, second.id, link.placementId);
  const capture = await captureCreatorApi(page);
  await openSeriesView(page, fixture);

  await seriesRow(page, first.id).getByRole('button', { name: 'Editar', exact: true }).click();
  const editForm = page.locator('[data-owner-dialog] form[data-owner-form="serie"]');
  await editForm.getByLabel(/Descripción/u).fill('  La descripción se guarda en esta serie  ');
  await editForm.getByRole('button', { name: 'Guardar serie', exact: true }).click();
  await expect(editForm).toHaveCount(0);
  const before = await readOwnerSnapshot(fixture, cookie);
  assert.equal(before.series[first.id].description, 'La descripción se guarda en esta serie');
  assert.deepEqual(before.series[first.id].chapters, [link.placementId]);
  assert.equal(before.series[second.id].description, undefined);

  const remove = seriesRow(page, first.id).locator('[data-series-delete]');
  const cancelledDialogPromise = page.waitForEvent('dialog');
  const cancelClick = remove.click();
  const cancelledDialog = await cancelledDialogPromise;
  assert.equal(cancelledDialog.type(), 'confirm');
  assert.match(cancelledDialog.message(), /enlaces|otras series/i);
  await cancelledDialog.dismiss();
  await cancelClick;
  assert.equal(capture.writes().filter(({ method }) => method === 'DELETE').length, 0,
    'dismissing the native confirm sends no delete');
  assert.ok(await fixture.rawSeries(cookie, first.id), 'dismissal leaves the actual series record in storage');
  assert.deepEqual((await readOwnerSnapshot(fixture, cookie)).placements, before.placements,
    'dismissal leaves all owner placements unchanged');

  const acceptedDialogPromise = page.waitForEvent('dialog');
  const acceptClick = remove.click();
  const acceptedDialog = await acceptedDialogPromise;
  assert.equal(acceptedDialog.type(), 'confirm');
  await acceptedDialog.accept();
  await acceptClick;
  await capture.settle();

  const deletion = capture.writes().find(({ method, path }) => method === 'DELETE' && path === `/api/creador/series/${first.id}`);
  assert.ok(deletion, `accepting the real browser dialog sends the actual DELETE; observed ${JSON.stringify(capture.records.map(({ method, path, status }) => ({ method, path, status })))}`);
  assert.equal(deletion.status, 200);
  assert.deepEqual(deletion.responseBody, {
    schemaVersion: 2,
    operation: 'delete-series',
    profileId: before.profile.id,
    creatorVersion: before.creatorVersion + 1,
    seriesId: first.id,
    disposition: 'deleted',
  });
  await expect(seriesRow(page, first.id)).toHaveCount(0);
  await expect(seriesRow(page, second.id)).toBeVisible();
  assert.equal(await fixture.rawSeries(cookie, first.id), null, 'the accepted delete removes the series record');
  const after = await readOwnerSnapshot(fixture, cookie);
  assert.deepEqual(after.placements, before.placements, 'deleting a Series does not remove its links');
  assert.deepEqual(after.order, before.order, 'deleting a Series leaves the general sequence unchanged');
  assert.equal(Object.hasOwn(after.series, first.id), false);
  assert.deepEqual(after.series[second.id].chapters, [link.placementId],
    'the surviving Series keeps its exact chapter sequence');
  assert.equal(after.series[second.id].name, second.name);
  assert.equal(after.placements[link.placementId].resourceId, link.resourceId);
  await capture.stop();
});

test('cincuenta enlaces se buscan por SSR sin JS y se consultan, paginan y editan en el navegador', async ({ fixture, page, browser }) => {
  const cookie = await loggedInOwner(fixture, page);
  const links = [];
  const targetIndex = 37;
  const selectiveQuery = 'BUSQUEDA-UNICA-LARGA-37';
  const selectivePrefix = `Guía ${String(targetIndex).padStart(2, '0')} AWS ${selectiveQuery} `;
  const selectiveTitle = `${selectivePrefix}${'X'.repeat(200 - selectivePrefix.length)}`;
  assert.equal(selectiveTitle.length, 200, 'the selective result exercises the maximum title length');
  for (let index = 0; index < 50; index += 1) {
    links.push(await addLink(fixture, cookie, {
      title: index === targetIndex ? selectiveTitle : `Guía ${String(index).padStart(2, '0')} AWS`,
      url: `https://links.example/guia/${index}`,
    }));
  }

  const noScriptContext = await browser.newContext({ ignoreHTTPSErrors: true, javaScriptEnabled: false });
  try {
    await addCookie(noScriptContext, fixture, cookie);
    const noScriptPage = await noScriptContext.newPage();
    const noScriptResponse = await noScriptPage.goto(`${fixture.origin}/cuenta/?vista=enlaces&buscar=Gu%C3%ADa&orden=titulo-asc&paginaEnlaces=2`);
    assert.equal(noScriptResponse.status(), 200);
    await expect(noScriptPage.locator('[data-link-row]')).toHaveCount(25);
    await expect(noScriptPage.locator('[data-link-count]')).toHaveText(/50 coincidencias de 50 enlaces/);
    await expect(noScriptPage.locator('[data-link-row]').filter({ hasText: 'Guía 49 AWS' })).toHaveCount(1,
      'the actual SSR filter and second page cover all fifty links without JavaScript');
    const selectiveResponse = await noScriptPage.goto(`${fixture.origin}/cuenta/?vista=enlaces&buscar=${encodeURIComponent(selectiveQuery)}`);
    assert.equal(selectiveResponse.status(), 200);
    await expect(noScriptPage.locator('[data-link-count]')).toHaveText('1 coincidencia de 50 enlaces');
    const selectiveRow = noScriptPage.locator(`[data-link-row="${links[targetIndex].placementId}"]`);
    await expect(selectiveRow).toHaveCount(1, 'SSR selects a matching item beyond the unfiltered first page');
    await expect(selectiveRow.locator('[data-link-title]')).toHaveText(selectiveTitle);
  } finally {
    await noScriptContext.close();
  }

  const capture = await captureCreatorApi(page);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  const search = page.locator('[data-link-search]');
  await search.fill(selectiveQuery);
  await expect(page.locator('[data-link-count]')).toHaveText('1 coincidencia de 50 enlaces');
  const enhancedSelectiveRow = page.locator(`[data-link-row="${links[targetIndex].placementId}"]`);
  await expect(enhancedSelectiveRow).toHaveCount(1);
  await expect(enhancedSelectiveRow.locator('[data-link-title]')).toHaveText(selectiveTitle);
  await search.fill('Guía');
  await expect(page.locator('[data-link-count]')).toHaveText(/50 coincidencias de 50 enlaces/);
  await expect(page.locator('[data-link-row]')).toHaveCount(25);
  await page.locator('[data-link-page]').filter({ hasText: 'Siguiente' }).click();
  await expect(page).toHaveURL(/paginaEnlaces=2/u);
  await expect(page.locator('[data-link-search]')).toHaveValue('Guía');
  await expect(page.locator('[data-link-row]')).toHaveCount(25);
  const targetRow = page.locator('[data-link-row]').filter({ hasText: 'Guía 49 AWS' });
  await expect(targetRow).toHaveCount(1);
  const target = links[49];
  await targetRow.locator('[data-link-edit]').click();
  const editForm = page.locator('[data-owner-dialog] form[data-owner-form="enlace"]');
  await expect(editForm).toBeVisible();
  await editForm.getByLabel('Título').fill('Guía 49 AWS editada');
  await editForm.getByRole('button', { name: 'Guardar cambios' }).click();
  await capture.settle();
  const update = capture.writes().find(({ method, path }) => method === 'PATCH'
    && path === `/api/creador/enlaces/${target.placementId}/editar`);
  assert.ok(update, `the selected second-page row sends its real owner edit request; observed ${JSON.stringify(capture.records.map(({ method, path, status }) => ({ method, path, status })))}`);
  assert.equal(update.status, 200);
  assert.equal(update.body.title, 'Guía 49 AWS editada');
  assert.ok(Number.isSafeInteger(update.body.creatorVersion));
  assert.equal(Object.hasOwn(update.body, 'profileVersion'), false);
  assert.equal(update.responseBody.schemaVersion, 2);
  assert.equal(update.responseBody.operation, 'edit-link');
  assert.equal(update.responseBody.profileId, (await readOwnerSnapshot(fixture, cookie)).profile.id);
  assert.equal(update.responseBody.placementId, target.placementId);
  assert.equal(update.responseBody.resourceId, target.resourceId);
  assert.equal(update.responseBody.disposition, 'saved');
  assert.ok(Number.isSafeInteger(update.responseBody.creatorVersion));
  assert.ok(Number.isSafeInteger(update.responseBody.resourceVersion));
  assert.equal(Object.hasOwn(update.responseBody, 'versionChanges'), false);
  const after = await readOwnerSnapshot(fixture, cookie);
  const resource = after.resources.find(({ id }) => id === target.resourceId);
  assert.equal(resource.title, 'Guía 49 AWS editada');
  assert.equal(after.placements[target.placementId].resourceId, target.resourceId);
  await expect(page.locator('[data-link-search]')).toHaveValue('Guía');
  await expect(page.locator('[data-link-count]')).toHaveText(/50 coincidencias de 50 enlaces/);
  await expect(page.locator('[data-link-row]')).toHaveCount(25);
  await expect(page.locator('[data-link-row]').filter({ hasText: 'Guía 49 AWS editada' })).toHaveCount(1);
  const updatedEdit = page.locator('[data-link-row]').filter({ hasText: 'Guía 49 AWS editada' }).locator('[data-link-edit]');
  await expect(updatedEdit).toBeVisible();
  await expect(updatedEdit).toBeEnabled();
  await expect(updatedEdit).toBeFocused();
  await updatedEdit.press('Enter');
  await expect(editForm).toBeVisible();
  await expect(editForm.getByLabel('Título')).toBeFocused();
  await editForm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
  await capture.stop();
});

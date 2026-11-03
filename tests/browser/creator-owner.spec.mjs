import assert from 'node:assert/strict';
import { test, expect, addCookie, api, createSeries, addLink, addChapter, captureCreatorApi, seriesForm, seriesRow, openSeriesView, createSeriesInBrowser, loggedInOwner } from '../fixtures/creator-browser-test.mjs';

test('el no-op de una serie nueva omite su descripción ausente y confirma las versiones reales', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const captured = await captureCreatorApi(page);
  await openSeriesView(page, fixture);

  const row = await createSeriesInBrowser(page, {
    name: 'Serie sin descripción',
    slug: 'serie-sin-descripcion',
  });
  await captured.settle();
  const createdWrite = captured.writes().find(({ method, path }) => method === 'POST' && path === '/api/creador/series');
  assert.ok(createdWrite, `the browser submits series creation to the actual creator endpoint; observed ${JSON.stringify(captured.records.map(({ method, path, status }) => ({ method, path, status })))}`);
  assert.equal(createdWrite.status, 201);
  assert.equal(Object.hasOwn(createdWrite.body, 'description'), false,
    'an empty optional description remains absent from the create request');
  const created = createdWrite.responseBody.series;
  const beforeProfile = (await fixture.rawOwner(cookie)).profile;
  const beforeSeries = await fixture.rawSeries(cookie, created.id);
  assert.equal(Object.hasOwn(beforeSeries, 'description'), false,
    'the actual service leaves an omitted optional description absent in storage');

  await row.locator('[data-series-edit]').click();
  const form = seriesForm(page);
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Guardar serie' }).click();
  await captured.settle();

  const patches = captured.writes().filter(({ method, path }) => method === 'PATCH' && path === `/api/creador/series/${created.id}`);
  assert.equal(patches.length, 1, 'the unchanged edit still sends one real PATCH for server version validation');
  assert.deepEqual(patches[0].body, {
    version: created.version,
    profileVersion: beforeProfile.version,
    name: created.name,
    slug: created.slug,
  }, 'the actual body keeps required name/slug and omits an absent description');
  assert.equal(patches[0].status, 200);
  assert.deepEqual(patches[0].responseBody.versionChanges, [], 'the server returned its real no-op receipt');
  assert.deepEqual((await fixture.rawOwner(cookie)).profile, beforeProfile);
  assert.deepEqual(await fixture.rawSeries(cookie, created.id), beforeSeries);
  await expect(page.locator('[data-owner-status]')).toBeVisible();
  await expect(page.locator('[data-owner-status]')).toContainText(/Cambios guardados/i);
  await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
  await captured.stop();
});

test('un description vacío ya persistido es un no-op real sin cambio de versión', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const created = await createSeries(fixture, cookie, {
    name: 'Serie con descripción vacía',
    slug: 'serie-description-vacia',
    description: '',
  });
  const beforeProfile = (await fixture.rawOwner(cookie)).profile;
  const beforeSeries = await fixture.rawSeries(cookie, created.id);
  assert.equal(Object.hasOwn(beforeSeries, 'description'), true);
  assert.equal(beforeSeries.description, '');

  const captured = await captureCreatorApi(page);
  await openSeriesView(page, fixture);
  await seriesRow(page, created.id).locator('[data-series-edit]').click();
  const form = seriesForm(page);
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Guardar serie' }).click();
  await captured.settle();

  const writes = captured.writes();
  assert.equal(writes.length, 1, 'the unchanged edit sends exactly one browser write');
  const patch = writes[0];
  assert.equal(patch.method, 'PATCH');
  assert.equal(patch.path, `/api/creador/series/${created.id}`);
  assert.deepEqual(patch.body, {
    version: created.version,
    profileVersion: beforeProfile.version,
    name: created.name,
    slug: created.slug,
  }, 'the unchanged empty description is omitted while required values and CAS versions remain');
  assert.equal(patch.status, 200);
  assert.deepEqual(patch.responseBody.versionChanges, []);
  assert.deepEqual((await fixture.rawOwner(cookie)).profile, beforeProfile);
  assert.deepEqual(await fixture.rawSeries(cookie, created.id), beforeSeries,
    'the raw empty description attribute and both versions remain unchanged');
  await expect(page.locator('[data-owner-status]')).toBeVisible();
  await expect(page.locator('[data-owner-status]')).toContainText(/Cambios guardados/i);
  await captured.stop();
});

test('editar y borrar la descripción envía los valores canónicos y avanza las versiones reales', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await createSeries(fixture, cookie, {
    name: 'Nombre inicial', slug: 'serie-inicial', description: 'Descripción inicial',
  });
  const before = await fixture.rawOwner(cookie);
  const captured = await captureCreatorApi(page);
  await openSeriesView(page, fixture);
  await seriesRow(page, initial.id).locator('[data-series-edit]').click();
  const form = seriesForm(page);
  await expect(form).toBeVisible();

  await form.getByLabel('Nombre de la serie').fill('Nombre nuevo');
  await form.getByLabel('Dirección de la serie').fill('serie-nueva');
  await form.getByLabel(/Descripción/).fill('Descripción nueva');
  await form.getByRole('button', { name: 'Guardar serie' }).click();
  await captured.settle();
  const rename = captured.writes().find(({ method, path }) => method === 'PATCH' && path === `/api/creador/series/${initial.id}`);
  assert.ok(rename, `expected the real rename PATCH; observed ${JSON.stringify(captured.records.map(({ method, path, status }) => ({ method, path, status })))}`);
  assert.deepEqual(rename.body, {
    version: initial.version,
    profileVersion: before.profile.version,
    name: 'Nombre nuevo',
    slug: 'serie-nueva',
    description: 'Descripción nueva',
  });
  assert.equal(rename.status, 200);
  assert.equal((await fixture.rawOwner(cookie)).profile.version, before.profile.version + 1);
  let stored = await fixture.rawSeries(cookie, initial.id);
  assert.equal(stored.name, 'Nombre nuevo');
  assert.equal(stored.slug, 'serie-nueva');
  assert.equal(stored.description, 'Descripción nueva');
  assert.equal(stored.version, initial.version + 1);

  await seriesRow(page, initial.id).locator('[data-series-edit]').click();
  await expect(form).toBeVisible();
  await form.getByLabel(/Descripción/).fill('');
  await form.getByRole('button', { name: 'Guardar serie' }).click();
  await captured.settle();
  const patches = captured.writes().filter(({ method, path }) => method === 'PATCH' && path === `/api/creador/series/${initial.id}`);
  assert.equal(patches.length, 2);
  assert.deepEqual(patches[1].body, {
    version: initial.version + 1,
    profileVersion: before.profile.version + 1,
    name: 'Nombre nuevo',
    slug: 'serie-nueva',
    description: '',
  }, 'clearing a persisted description remains an explicit write with required fields');
  assert.equal(patches[1].status, 200);
  assert.equal((await fixture.rawOwner(cookie)).profile.version, before.profile.version + 2);
  stored = await fixture.rawSeries(cookie, initial.id);
  assert.deepEqual({ name: stored.name, slug: stored.slug, description: stored.description, version: stored.version }, {
    name: 'Nombre nuevo', slug: 'serie-nueva', description: '', version: initial.version + 2,
  });
  await captured.stop();
});

async function submitStaleNoOp({ fixture, page, cookie, staleKind }) {
  const initial = await createSeries(fixture, cookie, {
    name: `Serie obsoleta ${staleKind}`,
    slug: `serie-obsoleta-${staleKind}`,
    description: '',
  });
  const initialOwner = await fixture.rawOwner(cookie);
  const initialSeries = await fixture.rawSeries(cookie, initial.id);
  const capture = await captureCreatorApi(page);
  await openSeriesView(page, fixture);
  await seriesRow(page, initial.id).locator('[data-series-edit]').click();
  const form = seriesForm(page);
  await expect(form).toBeVisible();

  let markEntered;
  let releaseForward;
  const entered = new Promise((resolve) => { markEntered = resolve; });
  const forward = new Promise((resolve) => { releaseForward = resolve; });
  let heldRequest;
  let responseStatus;
  let responseBody;
  let concurrentSnapshot;
  const path = `/api/creador/series/${initial.id}`;
  const blocker = async (route) => {
    if (route.request().method() !== 'PATCH' || new URL(route.request().url()).pathname.replace(/\/$/u, '') !== path) {
      await route.continue();
      return;
    }
    const request = route.request();
    heldRequest = {
      method: request.method(),
      path: new URL(request.url()).pathname.replace(/\/$/u, ''),
      body: JSON.parse(request.postData()),
    };
    markEntered();
    await forward;
    const response = await route.fetch();
    responseStatus = response.status();
    responseBody = await response.json();
    await route.fulfill({ response });
  };
  await page.route('**/api/creador/**', blocker);
  let clickSave;
  try {
    clickSave = form.getByRole('button', { name: 'Guardar serie' }).click();
    await entered;

    // A later correction is typed after this exact no-op body was captured.
    await form.getByLabel(/Descripción/).fill('Corrección local conservada');
    let concurrent;
    if (staleKind === 'perfil') {
      concurrent = await api(fixture, cookie, '/api/creador/perfil', {
        method: 'PUT',
        body: { version: initialOwner.profile.version, displayName: `Nombre externo ${staleKind}` },
      });
    } else {
      concurrent = await api(fixture, cookie, path, {
        method: 'PATCH',
        body: {
          version: initialSeries.version,
          profileVersion: initialOwner.profile.version,
          name: `Nombre externo ${staleKind}`,
          slug: initialSeries.slug,
        },
      });
    }
    assert.equal(concurrent.response.status, 200, 'the competing write uses the real service/API');
    concurrentSnapshot = {
      owner: await fixture.rawOwner(cookie),
      series: await fixture.rawSeries(cookie, initial.id),
    };
    assert.equal(concurrentSnapshot.owner.profile.version, initialOwner.profile.version + 1,
      'both real concurrent mutation paths advance the profile version exactly once');
    if (staleKind === 'perfil') {
      assert.equal(concurrentSnapshot.owner.profile.displayName, 'Nombre externo perfil');
      assert.deepEqual(concurrentSnapshot.series, initialSeries,
        'the competing profile update leaves the raw series record unchanged');
    } else {
      assert.equal(concurrentSnapshot.series.name, 'Nombre externo serie');
      assert.equal(concurrentSnapshot.series.version, initialSeries.version + 1);
    }
    releaseForward();
    await clickSave;
    await capture.settle();
  } finally {
    releaseForward();
    await page.unroute('**/api/creador/**', blocker).catch(() => {});
    await clickSave?.catch(() => {});
  }

  assert.deepEqual(heldRequest, {
    method: 'PATCH',
    path,
    body: {
      version: initialSeries.version,
      profileVersion: initialOwner.profile.version,
      name: initialSeries.name,
      slug: initialSeries.slug,
    },
  }, 'the actual browser sends the captured no-op with its original CAS versions');
  assert.equal(responseStatus, 409, 'the real server rejects the stale no-op');
  assert.equal(responseBody?.error, 'PROFILE_CONFLICT',
    'the real service checks the stale aggregate version before series metadata');
  await expect(form.locator('[data-series-conflict]')).toBeVisible();
  await expect(form.locator('[data-owner-form-status="serie"]')).toContainText(/cambió/i);
  await expect(form.getByLabel(/Descripción/)).toHaveValue('Corrección local conservada');

  const afterRejected = {
    owner: await fixture.rawOwner(cookie),
    series: await fixture.rawSeries(cookie, initial.id),
  };
  assert.deepEqual(afterRejected.owner, concurrentSnapshot.owner,
    'the rejected browser request leaves the concurrent raw owner record unchanged');
  assert.deepEqual(afterRejected.series, concurrentSnapshot.series,
    'the rejected browser request leaves the concurrent raw series record unchanged');
  const current = concurrentSnapshot.owner;
  const currentSeries = concurrentSnapshot.series;
  const profileVersion = concurrentSnapshot.owner.profile.version;
  if (staleKind === 'perfil') {
    assert.equal(current.profile.displayName, 'Nombre externo perfil');
    assert.deepEqual(currentSeries, initialSeries);
  } else {
    assert.equal(currentSeries.name, 'Nombre externo serie');
    assert.equal(currentSeries.version, initialSeries.version + 1);
    const isolatedResponse = await page.context().request.patch(`${fixture.origin}${path}/`, {
      data: {
        version: initialSeries.version,
        profileVersion,
        name: currentSeries.name,
        slug: currentSeries.slug,
      },
      headers: {
        origin: fixture.origin,
        'x-csrf-token': current.principal.csrfToken,
      },
    });
    const isolatedBody = await isolatedResponse.json();
    assert.equal(isolatedResponse.status(), 409);
    assert.equal(isolatedBody?.error, 'SERIES_CONFLICT',
      'a separate real API request with the current profile version reaches the series-version CAS');
    const afterIsolated = {
      owner: await fixture.rawOwner(cookie),
      series: await fixture.rawSeries(cookie, initial.id),
    };
    assert.deepEqual(afterIsolated.owner, concurrentSnapshot.owner,
      'the isolated series conflict leaves the concurrent raw owner record unchanged');
    assert.deepEqual(afterIsolated.series, concurrentSnapshot.series,
      'the isolated series conflict leaves the concurrent raw series record unchanged');
  }
  const browserPatch = capture.writes().filter(({ method, path: requestPath }) => method === 'PATCH' && requestPath === path);
  assert.equal(browserPatch.length, 1, 'the browser sent exactly one stale no-op, with no shortcut or replay');
  assert.equal(browserPatch[0].status, 409);
  await capture.stop();
}

test('un perfil obsoleto deja que el no-op llegue al servidor y conserva la corrección local', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  await submitStaleNoOp({ fixture, page, cookie, staleKind: 'perfil' });
});

test('una serie obsoleta deja que el no-op llegue al servidor y la verificación real alcanza su CAS', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  await submitStaleNoOp({ fixture, page, cookie, staleKind: 'serie' });
});

test('la URL social inválida bloquea el envío y descartar restaura la validación nativa', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, {
    profileFields: { socials: { instagram: 'https://instagram.example.invalid/ana' } },
  });
  const capture = await captureCreatorApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${fixture.origin}/cuenta/`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  const actualTheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  assert.equal(actualTheme, 'dark', 'the narrow browser uses its real preferred dark appearance');
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
  assert.equal(capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').length, 0,
    'an invalid URL never reaches the actual profile endpoint');

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

  const put = capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
  assert.equal(put.length, 1, `one valid restored value reaches the real profile service; observed ${JSON.stringify(capture.records.map(({ method, path, status }) => ({ method, path, status })))}`);
  assert.equal(put[0].status, 200);
  assert.deepEqual(put[0].body, {
    socials: { instagram: 'https://instagram.example.invalid/ana' },
    version: 1,
  });
  const owner = await fixture.rawOwner(cookie);
  assert.equal(owner.profile.version, 1, 'the real service confirms the unchanged social value without a version bump');
  assert.deepEqual(owner.profile.socials, { instagram: 'https://instagram.example.invalid/ana' });
  await expect(page.locator('[data-owner-form-status="redes"]')).toContainText(/guardad|actualizad/i);
  await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
  await capture.stop();
});

test('la confirmación nativa de borrar serie conserva los enlaces y sólo elimina la serie aceptada', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const first = await createSeries(fixture, cookie, { name: 'Serie para borrar', slug: 'serie-borrar' });
  const second = await createSeries(fixture, cookie, { name: 'Serie que queda', slug: 'serie-queda' });
  const link = await addLink(fixture, cookie, { title: 'Capítulo compartido', url: 'https://links.example/compartido' });
  await addChapter(fixture, cookie, first.id, link.placementId);
  await addChapter(fixture, cookie, second.id, link.placementId);
  const beforePlacement = await fixture.rawPlacement(cookie, link.placementId);
  const beforeOwner = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page);
  await openSeriesView(page, fixture);

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
  assert.deepEqual(await fixture.rawPlacement(cookie, link.placementId), beforePlacement,
    'dismissal leaves raw link persistence and memberships unchanged');

  const acceptedDialogPromise = page.waitForEvent('dialog');
  const acceptClick = remove.click();
  const acceptedDialog = await acceptedDialogPromise;
  assert.equal(acceptedDialog.type(), 'confirm');
  await acceptedDialog.accept();
  await acceptClick;
  await capture.settle();

  const deletion = capture.writes().find(({ method, path }) => method === 'DELETE' && path === `/api/creador/series/${first.id}`);
  assert.ok(deletion, `accepting the real browser dialog sends the actual DELETE; observed ${JSON.stringify(capture.records.map(({ method, path, status }) => ({ method, path, status })))}`);
  assert.equal(deletion.status, 204);
  assert.deepEqual(JSON.parse(deletion.responseHeaders['creator-write-versions']), [
    { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1 },
  ]);
  await expect(seriesRow(page, first.id)).toHaveCount(0);
  await expect(seriesRow(page, second.id)).toBeVisible();
  assert.equal(await fixture.rawSeries(cookie, first.id), null, 'the accepted delete removes the series record');
  const afterPlacement = await fixture.rawPlacement(cookie, link.placementId);
  assert.ok(afterPlacement, 'the raw placement remains stored');
  assert.deepEqual(afterPlacement.series[second.id], beforePlacement.series[second.id],
    'the surviving raw series membership remains unchanged');
  const ownerRead = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(ownerRead.response.status, 200);
  assert.deepEqual(ownerRead.body.links[0].series.map(({ seriesId }) => seriesId), [second.id]);
  assert.equal(ownerRead.body.links[0].placementId, link.placementId, 'the link remains on the creator page');
  await capture.stop();
});

test('el alta de serie comprometida puede comprobarse y continuar sin repetir el POST', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const capture = await captureCreatorApi(page);
  await openSeriesView(page, fixture, '&buscarSeries=ruta');
  await page.getByRole('button', { name: 'Crear serie' }).click();
  const form = seriesForm(page);
  await form.getByLabel('Nombre de la serie').fill('Ruta enviada');
  await form.getByLabel('Dirección de la serie').fill('ruta-enviada');
  await form.getByLabel(/Descripción/).fill('Descripción enviada');

  let markCommitted;
  let releaseResponse;
  const committed = new Promise((resolve) => { markCommitted = resolve; });
  const responseGate = new Promise((resolve) => { releaseResponse = resolve; });
  let deliveredStatus;
  let committedWrite;
  let committedSeries;
  const creationRoute = async (route) => {
    if (route.request().method() !== 'POST' || new URL(route.request().url()).pathname.replace(/\/$/u, '') !== '/api/creador/series') {
      await route.continue();
      return;
    }
    const request = route.request();
    const response = await route.fetch();
    const payload = await response.json();
    committedWrite = {
      method: request.method(),
      path: new URL(request.url()).pathname.replace(/\/$/u, ''),
      body: JSON.parse(request.postData()),
      status: response.status(),
      responseBody: payload,
    };
    deliveredStatus = 503;
    markCommitted();
    await responseGate;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'TEMPORARY_FAILURE' }) });
  };
  await page.route('**/api/creador/**', creationRoute);
  let save;
  try {
    save = form.getByRole('button', { name: 'Guardar serie' }).click();
    await committed;
    const savedAtCommit = await fixture.rawOwner(cookie);
    committedSeries = committedWrite.responseBody.series;
    assert.equal(committedWrite.status, 201);
    assert.equal(committedSeries.slug, 'ruta-enviada');
    assert.equal(savedAtCommit.profile.version, 2);
    assert.equal((await fixture.rawSeries(cookie, committedSeries.id)).version, 1);

    await form.getByLabel('Nombre de la serie').fill('Corrección posterior');
    await form.getByLabel('Dirección de la serie').fill('ruta-corregida');
    await form.getByLabel(/Descripción/).fill('Descripción posterior');
    releaseResponse();
    await save;
  } finally {
    releaseResponse();
    await page.unroute('**/api/creador/**', creationRoute).catch(() => {});
    await save?.catch(() => {});
  }
  await capture.settle();
  assert.equal(deliveredStatus, 503, 'the browser receives a lost/failed acknowledgement after the actual commit');
  const creationWrites = () => capture.writes()
    .filter(({ method, path }) => method === 'POST' && path === '/api/creador/series')
    .map(({ method, path, status, body }) => ({ method, path, status, body }));
  const originalPost = {
    name: 'Ruta enviada', slug: 'ruta-enviada', description: 'Descripción enviada', profileVersion: 1,
  };
  assert.deepEqual(creationWrites(), [{
    method: 'POST', path: '/api/creador/series', status: 503, body: originalPost,
  }], 'the browser observed exactly the one original POST and its lost acknowledgement');
  await expect(form.locator('[data-series-conflict]')).toBeVisible();
  await expect(form.getByLabel('Nombre de la serie')).toHaveValue('Corrección posterior');
  await expect(form.getByLabel('Dirección de la serie')).toHaveValue('ruta-corregida');
  await expect(form.getByLabel(/Descripción/)).toHaveValue('Descripción posterior');

  await expect(form.getByRole('button', { name: 'Guardar serie' })).toBeDisabled();
  await expect(form.locator('[data-owner-compare]')).toBeVisible();
  await capture.settle();
  await expect(form.locator('[data-owner-form-status="serie"]')).toContainText(/comprobar|confirmar/i);
  assert.deepEqual(committedWrite.body, originalPost, 'the separately observed server commit used the original request body');
  assert.deepEqual(creationWrites(), [{
    method: 'POST', path: '/api/creador/series', status: 503, body: originalPost,
  }], 'the first uncertain result offers Check without replaying the POST');
  assert.equal((await fixture.rawOwner(cookie)).profile.version, 2);
  assert.equal((await fixture.creatorStore.list('series:')).length, 1);

  await form.locator('[data-owner-compare]').click();
  const comparison = form.locator('[data-owner-comparison]');
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText('Nombre guardado: Ruta enviada');
  await expect(comparison).toContainText('Dirección guardada: ruta-enviada');
  await expect(comparison).toContainText('Tu corrección: ruta-corregida');
  await expect(comparison).toContainText('Corrección posterior');
  const adopt = form.locator('[data-owner-adopt]');
  await expect(adopt).toBeVisible();
  await adopt.click();
  await expect(form.getByLabel('Nombre de la serie')).toHaveValue('Corrección posterior');
  await expect(form.getByLabel('Dirección de la serie')).toHaveValue('ruta-corregida');
  await expect(form.getByLabel(/Descripción/)).toHaveValue('Descripción posterior');
  const preservedQuery = new URL(page.url()).searchParams;
  expect([...preservedQuery.keys()].sort()).toEqual(preservedQuery.has('paginaSeries')
    ? ['buscarSeries', 'paginaSeries', 'vista'] : ['buscarSeries', 'vista']);
  expect(preservedQuery.get('vista')).toBe('series');
  expect(preservedQuery.get('buscarSeries')).toBe('ruta');
  expect(preservedQuery.get('paginaSeries') ?? '1').toBe('1');
  assert.equal((await fixture.creatorStore.list('series:')).length, 1, 'explicit adoption preserves one committed series');
  assert.deepEqual(creationWrites(), [{
    method: 'POST', path: '/api/creador/series', status: 503, body: originalPost,
  }], 'comparison and adoption do not replay the creation request');

  await form.getByRole('button', { name: 'Guardar serie' }).click();
  await capture.settle();
  const update = capture.writes().find(({ method, path }) => method === 'PATCH' && path === `/api/creador/series/${committedSeries.id}`);
  assert.ok(update, 'the later correction updates the recovered series identity');
  assert.deepEqual(update.body, {
    version: 1,
    profileVersion: 2,
    name: 'Corrección posterior',
    slug: 'ruta-corregida',
    description: 'Descripción posterior',
  });
  assert.equal(update.status, 200);
  assert.deepEqual(capture.writes().map(({ method, path, status, body }) => ({ method, path, status, body })), [
    { method: 'POST', path: '/api/creador/series', status: 503, body: originalPost },
    {
      method: 'PATCH', path: `/api/creador/series/${committedSeries.id}`, status: 200,
      body: {
        version: 1, profileVersion: 2, name: 'Corrección posterior', slug: 'ruta-corregida',
        description: 'Descripción posterior',
      },
    },
  ], 'the browser sent one failed acknowledgement POST and one explicit later correction PATCH');
  assert.equal(committedWrite.status, 201, 'the actual server committed the original POST before its response was replaced');
  assert.deepEqual(committedWrite.body, originalPost);
  const stored = await fixture.rawSeries(cookie, committedSeries.id);
  assert.deepEqual({ name: stored.name, slug: stored.slug, description: stored.description, version: stored.version }, {
    name: 'Corrección posterior', slug: 'ruta-corregida', description: 'Descripción posterior', version: 2,
  });
  assert.equal((await fixture.creatorStore.list('series:')).length, 1);
  await capture.stop();
});

test('la primera página SSR autentica por cookie, crea un borrador y rechaza otro origen', async ({ fixture, browser, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  const browserCookies = await page.context().cookies(fixture.origin);
  const liveCookie = browserCookies.find(({ name }) => name === cookie.name);
  expect(liveCookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax' });
  assert.equal((await fixture.rawOwner(cookie)).profile, null, 'the fresh in-memory application has no prior owner profile');

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
  assert.ok(write, 'the authenticated UI creates the profile through the actual API route');
  assert.equal(write.status, 200);
  const persisted = await fixture.rawOwner(cookie);
  assert.equal(persisted.profile.displayName, 'Ana creada desde el navegador');
  assert.equal(persisted.profile.slug, 'ana-creada-browser');
  assert.equal(persisted.profile.version, 1);

  const principal = await fixture.principal(cookie);
  const before = structuredClone(persisted.profile);
  const rejected = await page.context().request.put(`${fixture.origin}/api/creador/perfil/`, {
    data: { version: before.version, displayName: 'No guardar desde otro origen' },
    headers: { origin: 'https://attacker.example', 'x-csrf-token': principal.csrfToken },
  });
  assert.equal(rejected.status(), 403, 'the actual Astro route and real service reject a hostile Origin');
  assert.deepEqual((await fixture.rawOwner(cookie)).profile, before,
    'the negative-control request does not change the raw saved profile');

  const anonymousContext = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const anonymous = await anonymousContext.request.get(`${fixture.origin}/api/creador/perfil/`);
    assert.equal(anonymous.status(), 401, 'another context cannot reuse the owner cookie or read the private API');
  } finally {
    await anonymousContext.close();
  }
  await capture.stop();
});

test('cincuenta enlaces se buscan por SSR sin JS y se consultan, paginan y editan en el navegador', async ({ fixture, page, browser }) => {
  const cookie = await loggedInOwner(fixture, page);
  const links = [];
  const targetIndex = 37;
  const selectiveQuery = 'BUSQUEDA-UNICA-LARGA-37';
  const selectivePrefix = `Guía ${String(targetIndex).padStart(2, '0')} AWS ${selectiveQuery} `;
  const selectiveTitle = `${selectivePrefix}${'X'.repeat(200 - selectivePrefix.length)}`;
  assert.equal(selectiveTitle.length, 200, 'the selective result exercises the maximum accepted title length');
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
      'the actual SSR filter and second page cover all fifty links with JavaScript disabled');
    const selectiveResponse = await noScriptPage.goto(`${fixture.origin}/cuenta/?vista=enlaces&buscar=${encodeURIComponent(selectiveQuery)}`);
    assert.equal(selectiveResponse.status(), 200);
    await expect(noScriptPage.locator('[data-link-count]')).toHaveText('1 coincidencia de 50 enlaces');
    const selectiveRow = noScriptPage.locator(`[data-link-row="${links[targetIndex].placementId}"]`);
    await expect(selectiveRow).toHaveCount(1, 'SSR selects the matching item that is beyond the unfiltered first page');
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
  await expect(enhancedSelectiveRow).toHaveCount(1, 'enhanced search selects the matching item beyond the unfiltered first page');
  await expect(enhancedSelectiveRow.locator('[data-link-title]')).toHaveText(selectiveTitle);
  await search.fill('Guía');
  await expect(page.locator('[data-link-count]')).toHaveText(/50 coincidencias de 50 enlaces/);
  await expect(page.locator('[data-link-row]')).toHaveCount(25);
  const nextPage = page.locator('[data-link-page]').filter({ hasText: 'Siguiente' });
  await nextPage.click();
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
  const update = capture.writes().find(({ method, path }) => method === 'PATCH' && path === `/api/creador/enlaces/${target.placementId}/editar`);
  assert.ok(update, `the selected second-page row sends its real owner edit request; observed ${JSON.stringify(capture.records.map(({ method, path, status }) => ({ method, path, status })))}`);
  assert.equal(update.status, 200);
  assert.equal(update.body.title, 'Guía 49 AWS editada');
  assert.equal((await fixture.rawResource(target.resourceId)).title, 'Guía 49 AWS editada');
  assert.equal((await fixture.rawPlacement(cookie, target.placementId)).resourceId, target.resourceId);
  await expect(page.locator('[data-link-search]')).toHaveValue('Guía');
  await expect(page.locator('[data-link-count]')).toHaveText(/50 coincidencias de 50 enlaces/);
  await expect(page.locator('[data-link-row]')).toHaveCount(25);
  await expect(page.locator('[data-link-row]').filter({ hasText: 'Guía 49 AWS editada' })).toHaveCount(1);
  const updatedRow = page.locator('[data-link-row]').filter({ hasText: 'Guía 49 AWS editada' });
  const updatedEdit = updatedRow.locator('[data-link-edit]');
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

function linkEditor(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="enlace"]');
}

function receiptsFrom(record) {
  return record.status === 204
    ? JSON.parse(record.responseHeaders['creator-write-versions'] ?? '[]')
    : record.responseBody?.versionChanges ?? [];
}

function sortedReceipts(changes) {
  return [...changes].sort((left, right) => `${left.entity}:${left.id}`.localeCompare(`${right.entity}:${right.id}`));
}

async function openLinksView(page, fixture) {
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
}

test('guardados canónicos: el PATCH de una ficha propia aplica el recibo canónico y conserva una corrección posterior', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const link = await addLink(fixture, cookie, { title: 'Título inicial', url: 'https://links.example/canonico' });
  const beforeOwner = await fixture.rawOwner(cookie);
  const beforeResource = await fixture.rawResource(link.resourceId);
  const beforePlacement = await fixture.rawPlacement(cookie, link.placementId);
  const capture = await captureCreatorApi(page);
  await openLinksView(page, fixture);
  const row = page.locator(`[data-link-row="${link.placementId}"]`);
  await row.locator('[data-link-edit]').click();
  const form = linkEditor(page);
  await expect(form).toBeVisible();
  await form.getByLabel('Título').fill('  Título canónico A  ');
  await form.getByLabel('Descripción').fill('  Descripción canónica A  ');
  await form.getByLabel('Destacar en tu página').check();
  await form.getByLabel('Proponer al directorio').uncheck();

  let signalCommit;
  let releaseResponse;
  const committed = new Promise((resolve) => { signalCommit = resolve; });
  const responseGate = new Promise((resolve) => { releaseResponse = resolve; });
  let actualCommit;
  let committedResource;
  let committedPlacement;
  let committedOwner;
  const editPath = `/api/creador/enlaces/${link.placementId}/editar`;
  const holdCommittedResponse = async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() !== 'PATCH' || path !== editPath) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const payload = await response.json();
    actualCommit = {
      status: response.status(),
      headers: response.headers(),
      body: payload,
      requestBody: JSON.parse(request.postData()),
    };
    signalCommit();
    await responseGate;
    await route.fulfill({ response, json: payload });
  };
  await page.route('**/api/creador/**', holdCommittedResponse);
  let saveA;
  try {
    saveA = form.getByRole('button', { name: 'Guardar cambios' }).click();
    await committed;
    assert.equal(actualCommit.status, 200, 'the real owner service commits A before its response is held');
    assert.equal(actualCommit.requestBody.profileVersion, beforeOwner.profile.version);
    assert.equal(actualCommit.requestBody.placementVersion, link.placementVersion);
    assert.equal(actualCommit.requestBody.resourceVersion, link.resourceVersion);
    assert.equal(actualCommit.requestBody.title, 'Título canónico A', 'the browser trims title before the actual write');
    assert.equal(actualCommit.requestBody.description, 'Descripción canónica A', 'the browser trims description before the actual write');
    assert.equal(actualCommit.requestBody.featured, true);
    assert.equal(actualCommit.requestBody.selectedForDirectory, false);
    if (Object.hasOwn(actualCommit.requestBody, 'url')) assert.equal(actualCommit.requestBody.url, beforeResource.url);
    committedResource = await fixture.rawResource(link.resourceId);
    committedPlacement = await fixture.rawPlacement(cookie, link.placementId);
    committedOwner = await fixture.rawOwner(cookie);
    assert.deepEqual({
      title: committedResource.title,
      url: committedResource.url,
      description: committedResource.description,
      version: committedResource.version,
    }, {
      title: 'Título canónico A', url: 'https://links.example/canonico',
      description: 'Descripción canónica A', version: beforeResource.version + 1,
    }, 'raw resource storage matches the committed canonical metadata');
    assert.deepEqual({
      featured: committedPlacement.featured,
      selectedForDirectory: committedPlacement.selectedForDirectory,
      version: committedPlacement.version,
    }, {
      featured: true, selectedForDirectory: false, version: beforePlacement.version + 1,
    }, 'raw placement storage matches the committed options and receipt');
    assert.equal(committedOwner.profile.version, beforeOwner.profile.version + 1);
    assert.deepEqual(sortedReceipts(actualCommit.body.versionChanges), sortedReceipts([
      { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1 },
      { entity: 'resource', id: link.resourceId, before: beforeResource.version, after: beforeResource.version + 1 },
      { entity: 'placement', id: link.placementId, before: beforePlacement.version, after: beforePlacement.version + 1 },
    ]), 'the genuine response receipts name exactly the persisted participants and bases');
    assert.deepEqual({
      title: actualCommit.body.link.title,
      description: actualCommit.body.link.description,
      resourceVersion: actualCommit.body.link.resourceVersion,
      placementVersion: actualCommit.body.link.placementVersion,
      featured: actualCommit.body.link.featured,
      selectedForDirectory: actualCommit.body.link.selectedForDirectory,
    }, {
      title: committedResource.title,
      description: committedResource.description,
      resourceVersion: committedResource.version,
      placementVersion: committedPlacement.version,
      featured: committedPlacement.featured,
      selectedForDirectory: committedPlacement.selectedForDirectory,
    }, 'the command DTO reports the prepared effect stored by the real service');

    await form.getByLabel('Título').fill('Título corregido B');
    await form.getByLabel('Descripción').fill('Descripción corregida B');
    releaseResponse();
    await saveA;
  } finally {
    releaseResponse();
    await page.unroute('**/api/creador/**', holdCommittedResponse).catch(() => {});
    await saveA?.catch(() => {});
  }

  await capture.settle();
  const firstPatch = capture.writes().find(({ method, path }) => method === 'PATCH' && path === editPath);
  assert.equal(firstPatch.status, 200);
  assert.deepEqual(sortedReceipts(receiptsFrom(firstPatch)), sortedReceipts([
    { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1 },
    { entity: 'resource', id: link.resourceId, before: beforeResource.version, after: beforeResource.version + 1 },
    { entity: 'placement', id: link.placementId, before: beforePlacement.version, after: beforePlacement.version + 1 },
  ]));
  await expect(form.getByLabel('Título')).toHaveValue('Título corregido B');
  await expect(form.getByLabel('Descripción')).toHaveValue('Descripción corregida B');
  await expect(page.locator(`[data-link-row="${link.placementId}"] [data-link-title]`)).toHaveText('Título canónico A');

  await form.getByRole('button', { name: 'Guardar cambios' }).click();
  await capture.settle();
  const patches = capture.writes().filter(({ method, path }) => method === 'PATCH' && path === editPath);
  assert.equal(patches.length, 2, 'the browser sends A once and then the still-pending B once');
  const secondPatch = patches[1];
  assert.equal(secondPatch.body.profileVersion, committedOwner.profile.version,
    'B consumes the profile version returned by A');
  assert.equal(secondPatch.body.placementVersion, committedPlacement.version);
  assert.equal(secondPatch.body.resourceVersion, committedResource.version,
    'B consumes the resource version returned by A');
  assert.equal(secondPatch.body.title, 'Título corregido B');
  assert.equal(secondPatch.body.description, 'Descripción corregida B');
  if (Object.hasOwn(secondPatch.body, 'featured')) assert.equal(secondPatch.body.featured, committedPlacement.featured);
  if (Object.hasOwn(secondPatch.body, 'selectedForDirectory')) {
    assert.equal(secondPatch.body.selectedForDirectory, committedPlacement.selectedForDirectory);
  }
  if (Object.hasOwn(secondPatch.body, 'url')) assert.equal(secondPatch.body.url, committedResource.url);
  assert.equal(secondPatch.status, 200);
  assert.deepEqual(sortedReceipts(receiptsFrom(secondPatch)), sortedReceipts([
    { entity: 'profile', id: committedOwner.profile.id, before: committedOwner.profile.version, after: committedOwner.profile.version + 1 },
    { entity: 'resource', id: link.resourceId, before: committedResource.version, after: committedResource.version + 1 },
  ]), 'a metadata-only continuation leaves the placement version untouched');
  const savedB = await fixture.rawResource(link.resourceId);
  assert.deepEqual({ title: savedB.title, description: savedB.description, version: savedB.version }, {
    title: 'Título corregido B', description: 'Descripción corregida B', version: committedResource.version + 1,
  });

  const rowAfterB = page.locator(`[data-link-row="${link.placementId}"]`);
  await rowAfterB.locator('[data-link-edit]').click();
  const optionsForm = linkEditor(page);
  await optionsForm.getByLabel('Destacar en tu página').uncheck();
  await optionsForm.getByRole('button', { name: 'Guardar cambios' }).click();
  await capture.settle();
  const allPatches = capture.writes().filter(({ method, path }) => method === 'PATCH' && path === editPath);
  assert.equal(allPatches.length, 3);
  const optionsOnly = allPatches[2];
  assert.equal(optionsOnly.body.profileVersion, committedOwner.profile.version + 1);
  assert.equal(optionsOnly.body.placementVersion, committedPlacement.version);
  assert.equal(optionsOnly.body.resourceVersion, committedResource.version + 1);
  assert.equal(optionsOnly.body.featured, false);
  if (Object.hasOwn(optionsOnly.body, 'selectedForDirectory')) assert.equal(optionsOnly.body.selectedForDirectory, false);
  for (const fieldName of ['title', 'url', 'description']) {
    if (Object.hasOwn(optionsOnly.body, fieldName)) assert.equal(optionsOnly.body[fieldName], savedB[fieldName],
      `any unchanged authorized ${fieldName} included by the options-only command matches the saved resource`);
  }
  assert.equal(optionsOnly.status, 200);
  assert.deepEqual(sortedReceipts(receiptsFrom(optionsOnly)), sortedReceipts([
    { entity: 'profile', id: committedOwner.profile.id, before: committedOwner.profile.version + 1, after: committedOwner.profile.version + 2 },
    { entity: 'placement', id: link.placementId, before: committedPlacement.version, after: committedPlacement.version + 1 },
  ]));
  assert.deepEqual(await fixture.rawResource(link.resourceId), {
    ...savedB,
  }, 'the options-only write does not change raw resource metadata or version');
  const finalPlacement = await fixture.rawPlacement(cookie, link.placementId);
  assert.deepEqual({ featured: finalPlacement.featured, selectedForDirectory: finalPlacement.selectedForDirectory }, {
    featured: false, selectedForDirectory: false,
  });
  await capture.stop();
});

test('guardados canónicos: guardar sin cambios una ficha propia retirada envía un PATCH y conserva la ausencia opcional', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const link = await addLink(fixture, cookie, { title: 'Ficha retirada', url: 'https://links.example/retirada-sin-description' });
  const beforeRemoval = await fixture.rawOwner(cookie);
  const removal = await api(fixture, cookie, `/api/creador/enlaces/${link.placementId}`, {
    method: 'DELETE', body: { profileVersion: beforeRemoval.profile.version },
  });
  assert.equal(removal.response.status, 204);
  assert.deepEqual(sortedReceipts(JSON.parse(removal.response.headers.get('creator-write-versions'))), sortedReceipts([
    { entity: 'profile', id: beforeRemoval.profile.id, before: beforeRemoval.profile.version, after: beforeRemoval.profile.version + 1 },
  ]), 'the real API removes the placement and retains only its profile receipt');
  assert.equal(await fixture.rawPlacement(cookie, link.placementId), null);
  const stored = await fixture.rawResource(link.resourceId);
  const legacyWithoutDescription = { ...stored };
  delete legacyWithoutDescription.description;
  const seededLegacyRecord = await fixture.creatorStore.transact({
    checks: [{ key: `resource:${link.resourceId}`, version: stored.version }],
    puts: [{ key: `resource:${link.resourceId}`, value: legacyWithoutDescription }],
  });
  assert.equal(seededLegacyRecord, true,
    'the fixture models a legacy missing optional field after the real API established ownership and removal');
  const before = await fixture.rawResource(link.resourceId);
  assert.equal(Object.hasOwn(before, 'description'), false);

  const capture = await captureCreatorApi(page);
  await openLinksView(page, fixture);
  const editor = page.locator(`[data-retained-resource="${link.resourceId}"] [data-link-edit]`);
  await expect(editor).toBeVisible();
  await editor.click();
  const form = linkEditor(page);
  await expect(form.getByLabel('Título')).toHaveValue(before.title);
  await expect(form.getByLabel('URL')).toHaveValue(before.url);
  await expect(form.getByLabel('Descripción')).toHaveValue('');
  await form.getByRole('button', { name: 'Guardar cambios' }).click();
  await capture.settle();

  const patches = capture.writes().filter(({ method, path }) => method === 'PATCH' && path === `/api/creador/recursos/${link.resourceId}`);
  assert.equal(patches.length, 1, 'the unchanged form reaches the real retired-resource endpoint exactly once');
  assert.equal(patches[0].body.version, before.version, 'the no-op carries the resource version observed by the editor');
  assert.ok(Object.hasOwn(patches[0].body, 'title') || Object.hasOwn(patches[0].body, 'url'),
    'the PATCH carries an unchanged editable field so the service can validate this no-op');
  if (Object.hasOwn(patches[0].body, 'title')) assert.equal(patches[0].body.title, before.title);
  if (Object.hasOwn(patches[0].body, 'url')) assert.equal(patches[0].body.url, before.url);
  assert.equal(Object.hasOwn(patches[0].body, 'description'), false,
    'unchanged absent description remains omitted');
  assert.equal(patches[0].status, 200);
  assert.deepEqual(patches[0].responseBody.versionChanges, []);
  assert.equal(Object.hasOwn(patches[0].responseBody.resource, 'description'), false);
  assert.deepEqual(await fixture.rawResource(link.resourceId), before,
    'the real no-op receipt leaves raw metadata, optional-field presence and resource version unchanged');
  await expect(form.locator('[data-owner-form-status="enlace"]')).toContainText(/Ficha guardada/i);
  await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
  await capture.stop();
});

test('guardados canónicos: un no-op de ficha retirada con base obsoleta llega al CAS real y conserva el formulario', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const link = await addLink(fixture, cookie, { title: 'Título guardado', url: 'https://links.example/retirada-obsoleta' });
  const beforeRemoval = await fixture.rawOwner(cookie);
  const removal = await api(fixture, cookie, `/api/creador/enlaces/${link.placementId}`, {
    method: 'DELETE', body: { profileVersion: beforeRemoval.profile.version },
  });
  assert.equal(removal.response.status, 204);
  const before = await fixture.rawResource(link.resourceId);

  const capture = await captureCreatorApi(page);
  await openLinksView(page, fixture);
  await page.locator(`[data-retained-resource="${link.resourceId}"] [data-link-edit]`).click();
  const form = linkEditor(page);
  await expect(form).toBeVisible();
  assert.equal(await form.getByLabel('Título').inputValue(), before.title);
  const concurrent = await api(fixture, cookie, `/api/creador/recursos/${link.resourceId}`, {
    method: 'PATCH', body: { title: 'Edición concurrente', version: before.version },
  });
  assert.equal(concurrent.response.status, 200, 'a separate real API write advances the retired resource while the browser keeps its old base');
  assert.deepEqual(sortedReceipts(concurrent.body.versionChanges), sortedReceipts([
    { entity: 'resource', id: link.resourceId, before: before.version, after: before.version + 1 },
  ]));
  const concurrentResource = await fixture.rawResource(link.resourceId);

  await form.getByRole('button', { name: 'Guardar cambios' }).click();
  const resourcePatchPath = `/api/creador/recursos/${link.resourceId}`;
  await expect.poll(() => capture.writes().find(({ method, path }) => method === 'PATCH' && path === resourcePatchPath)?.status)
    .toBe(409);
  const patches = capture.writes().filter(({ method, path }) => method === 'PATCH' && path === resourcePatchPath);
  assert.equal(patches.length, 1, 'the browser does not short-circuit the unchanged retired-resource Save');
  assert.equal(patches[0].body.version, before.version);
  assert.ok(Object.hasOwn(patches[0].body, 'title') || Object.hasOwn(patches[0].body, 'url'));
  if (Object.hasOwn(patches[0].body, 'title')) assert.equal(patches[0].body.title, before.title);
  if (Object.hasOwn(patches[0].body, 'url')) assert.equal(patches[0].body.url, before.url);
  if (!Object.hasOwn(before, 'description')) {
    assert.equal(Object.hasOwn(patches[0].body, 'description'), false,
      'an unchanged absent description remains omitted by the stale no-op command');
  } else if (Object.hasOwn(patches[0].body, 'description')) {
    assert.equal(patches[0].body.description, before.description,
      'an unchanged present description may be omitted or sent with its stored value');
  }
  assert.equal(patches[0].status, 409);
  await expect(form.getByRole('heading', { name: 'El enlace cambió' })).toBeVisible();
  await expect(form.getByLabel('Título')).toHaveValue(before.title,
    'the stale no-op retains its observed draft instead of adopting the concurrent title');
  await expect(form.getByLabel('URL')).toHaveValue(before.url);
  assert.deepEqual(await fixture.rawResource(link.resourceId), concurrentResource,
    'the stale browser PATCH changes no data after the independent resource commit');
  await capture.stop({ skipErrorBodies: true });
});

test('guardados canónicos: agregar capítulo aplica DTO y recibos juntos aunque falle el GET posterior', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const targetSeries = await createSeries(fixture, cookie, { name: 'Serie objetivo', slug: 'serie-objetivo' });
  const otherSeries = await createSeries(fixture, cookie, { name: 'Otra serie', slug: 'otra-serie' });
  const link = await addLink(fixture, cookie, { title: 'Capítulo disponible', url: 'https://links.example/capitulo-disponible' });
  await addChapter(fixture, cookie, otherSeries.id, link.placementId);
  const beforeOwner = await fixture.rawOwner(cookie);
  const beforePlacement = await fixture.rawPlacement(cookie, link.placementId);
  const capture = await captureCreatorApi(page);
  await openSeriesView(page, fixture, `&serie=${encodeURIComponent(targetSeries.id)}`);
  const targetRow = page.locator(`[data-chapter-row="${link.placementId}"]`);
  await expect(targetRow.locator('[data-chapter-add]')).toBeVisible();

  let committedAdd;
  let postWriteGetFailures = 0;
  let postWriteGets = 0;
  const failOnlyFirstPostWriteRead = async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() === 'PUT' && path === `/api/creador/series/${targetSeries.id}/capitulos/${link.placementId}`) {
      const response = await route.fetch();
      const rawBody = await response.text();
      committedAdd = {
        status: response.status(),
        headers: response.headers(),
        body: rawBody ? JSON.parse(rawBody) : null,
      };
      await route.fulfill({ response, body: rawBody });
      return;
    }
    if (committedAdd?.status === 200 && request.method() === 'GET' && path === '/api/creador/perfil') {
      postWriteGets += 1;
      if (postWriteGetFailures === 0) {
        postWriteGetFailures += 1;
        const actualRead = await route.fetch();
        assert.equal(actualRead.status(), 200, 'the owner GET reaches the real service before only its transport response is failed');
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'TEST_POST_WRITE_READ_UNAVAILABLE' }) });
        return;
      }
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', failOnlyFirstPostWriteRead);
  try {
    await targetRow.locator('[data-chapter-add]').click();
    await expect(targetRow.locator('[data-chapter-remove]')).toBeVisible();
    await expect(targetRow.locator('[data-chapter-add]')).toHaveCount(0);
    await expect(targetRow.locator('[data-chapter-remove]')).toBeEnabled();
    const committedOwner = await fixture.rawOwner(cookie);
    const committedPlacement = await fixture.rawPlacement(cookie, link.placementId);
    assert.equal(committedAdd.status, 200);
    assert.equal(committedAdd.body.status, 200);
    assert.equal(committedAdd.body.profileVersion, beforeOwner.profile.version + 1);
    assert.deepEqual(sortedReceipts(committedAdd.body.versionChanges), sortedReceipts([
      { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1 },
      { entity: 'placement', id: link.placementId, before: beforePlacement.version, after: beforePlacement.version + 1 },
    ]));
    const canonicalTarget = committedAdd.body.links.find(({ placementId }) => placementId === link.placementId);
    assert.ok(canonicalTarget, 'the chapter command returns the canonical affected placement');
    assert.deepEqual(canonicalTarget.series.map(({ seriesId }) => seriesId).sort(), [targetSeries.id, otherSeries.id].sort());
    assert.equal(canonicalTarget.series.find(({ seriesId }) => seriesId === targetSeries.id).position,
      committedPlacement.series[targetSeries.id].position);
    assert.equal(canonicalTarget.series.find(({ seriesId }) => seriesId === otherSeries.id).position,
      beforePlacement.series[otherSeries.id].position);
    assert.equal(canonicalTarget.placementVersion, committedPlacement.version);
    assert.deepEqual(committedPlacement.series[otherSeries.id], beforePlacement.series[otherSeries.id],
      'the pre-existing membership in the other series remains unchanged');
    assert.equal(committedOwner.profile.version, beforeOwner.profile.version + 1);
    await expect(page.locator('[data-owner-root]')).toHaveAttribute('data-profile-version', String(committedOwner.profile.version));
    if (postWriteGets > 0) assert.equal(postWriteGetFailures, 1,
      'only one actual post-write owner GET response is failed at the transport boundary');

    await targetRow.locator('[data-chapter-remove]').click();
    await expect(targetRow.locator('[data-chapter-add]')).toBeVisible();
    await expect(targetRow.locator('[data-chapter-remove]')).toHaveCount(0);
    await capture.settle();
    const addWrite = capture.writes().find(({ method, path }) => method === 'PUT' && path === `/api/creador/series/${targetSeries.id}/capitulos/${link.placementId}`);
    const removeWrite = capture.writes().find(({ method, path }) => method === 'DELETE' && path === `/api/creador/series/${targetSeries.id}/capitulos/${link.placementId}`);
    assert.ok(addWrite);
    assert.equal(addWrite.status, 200);
    assert.ok(removeWrite, 'the next chapter command is sent from the applied add result without a page reload');
    assert.equal(removeWrite.status, 204);
    assert.deepEqual(sortedReceipts(receiptsFrom(removeWrite)), sortedReceipts([
      { entity: 'profile', id: committedOwner.profile.id, before: committedOwner.profile.version, after: committedOwner.profile.version + 1 },
      { entity: 'placement', id: link.placementId, before: committedPlacement.version, after: committedPlacement.version + 1 },
    ]), 'the real 204 carries the profile and placement versions for membership removal');
    const afterRemove = await fixture.rawPlacement(cookie, link.placementId);
    assert.equal(Object.hasOwn(afterRemove.series ?? {}, targetSeries.id), false);
    assert.deepEqual(afterRemove.series[otherSeries.id], beforePlacement.series[otherSeries.id],
      'removing one membership preserves the placement in the other series');

    const editSeriesButton = page.locator('[data-owner-series-chapters] [data-series-edit]');
    await editSeriesButton.click();
    const seriesEditForm = seriesForm(page);
    await expect(seriesEditForm).toBeVisible();
    await seriesEditForm.getByLabel(/Descripción/).fill('Guardado después de agregar y quitar');
    await seriesEditForm.getByRole('button', { name: 'Guardar serie' }).click();
    await capture.settle();
    const seriesPatch = capture.writes().find(({ method, path }) => method === 'PATCH' && path === `/api/creador/series/${targetSeries.id}`);
    assert.ok(seriesPatch);
    assert.equal(seriesPatch.body.profileVersion, committedOwner.profile.version + 1,
      'the following real series save consumes the profile version returned by the 204 removal');
    assert.equal(seriesPatch.body.version, targetSeries.version);
    assert.equal(seriesPatch.status, 200);
    const afterSeriesSave = await fixture.rawOwner(cookie);
    assert.equal(afterSeriesSave.profile.version, committedOwner.profile.version + 2);
    assert.equal((await fixture.rawSeries(cookie, targetSeries.id)).description, 'Guardado después de agregar y quitar');
    await capture.stop();
  } finally {
    await page.unroute('**/api/creador/**', failOnlyFirstPostWriteRead).catch(() => {});
  }
});

for (const movementKind of ['link', 'chapter']) {
  test(`guardados canónicos: el movimiento de ${movementKind === 'link' ? 'un enlace' : 'un capítulo'} aplica sólo sus posiciones observadas`, async ({ fixture, page }, testInfo) => {
    const cookie = await loggedInOwner(fixture, page);
    const series = movementKind === 'chapter'
      ? await createSeries(fixture, cookie, { name: 'Serie del movimiento', slug: 'serie-del-movimiento' })
      : undefined;
    const otherSeries = movementKind === 'chapter'
      ? await createSeries(fixture, cookie, { name: 'Serie independiente', slug: 'serie-independiente' })
      : undefined;
    const target = await addLink(fixture, cookie, { title: 'Título observado v1', url: 'https://links.example/movimiento-target' });
    const neighbor = await addLink(fixture, cookie, { title: 'Vecino observado', url: 'https://links.example/movimiento-neighbor' });
    if (series && otherSeries) {
      await addChapter(fixture, cookie, series.id, target.placementId);
      await addChapter(fixture, cookie, series.id, neighbor.placementId);
      await addChapter(fixture, cookie, otherSeries.id, target.placementId);
    }
    const initialOwner = await fixture.rawOwner(cookie);
    const initialTargetPlacement = await fixture.rawPlacement(cookie, target.placementId);
    const initialNeighborPlacement = await fixture.rawPlacement(cookie, neighbor.placementId);
    const initialTargetResource = await fixture.rawResource(target.resourceId);
    assert.equal(initialTargetResource.version, target.resourceVersion);
    const capture = await captureCreatorApi(page);
    if (series) await openSeriesView(page, fixture, `&serie=${encodeURIComponent(series.id)}`);
    else await openLinksView(page, fixture);
    const initialRowSelector = movementKind === 'link'
      ? `[data-link-row="${target.placementId}"]`
      : `[data-chapter-row="${target.placementId}"]`;
    await expect(page.locator(`${initialRowSelector} ${movementKind === 'link' ? '[data-link-title]' : 'h4'}`)).toHaveText('Título observado v1');

    const external = await api(fixture, cookie, `/api/creador/recursos/${target.resourceId}`, {
      method: 'PATCH', body: { title: 'Título externo v2', description: 'Descripción externa v2', version: initialTargetResource.version },
    });
    assert.equal(external.response.status, 200);
    assert.deepEqual(sortedReceipts(external.body.versionChanges), sortedReceipts([
      { entity: 'resource', id: target.resourceId, before: initialTargetResource.version, after: initialTargetResource.version + 1 },
    ]), 'a separate real resource PATCH advances metadata after the browser loaded version 1');
    const externalResource = await fixture.rawResource(target.resourceId);
    assert.equal(externalResource.version, initialTargetResource.version + 1);

    if (movementKind === 'link') {
      const row = page.locator(`[data-link-row="${target.placementId}"]`);
      await row.locator('[data-link-move]').click();
      const moveForm = page.locator('[data-owner-dialog] form[data-owner-form="mover-enlace"]');
      await moveForm.getByLabel('Posición dentro del grupo').fill('2');
      await moveForm.getByRole('button', { name: 'Guardar posición' }).click();
      await capture.settle();
      const movePath = `/api/creador/enlaces/${target.placementId}/mover`;
      const move = capture.writes().find(({ method, path }) => method === 'POST' && path === movePath);
      assert.ok(move);
      assert.deepEqual(move.body, {
        profileVersion: initialOwner.profile.version,
        placementVersion: initialTargetPlacement.version,
        targetPosition: 2,
      });
      assert.equal(move.status, 200);
      const moveTarget = move.responseBody.links.find(({ placementId }) => placementId === target.placementId);
      assert.equal(moveTarget.title, externalResource.title);
      assert.equal(moveTarget.resourceVersion, externalResource.version,
        'the genuine move DTO contains the resource observation made after the page loaded');
      const movedPlacement = await fixture.rawPlacement(cookie, target.placementId);
      const movedNeighbor = await fixture.rawPlacement(cookie, neighbor.placementId);
      const movedOwner = await fixture.rawOwner(cookie);
      assert.equal(moveTarget.position, movedPlacement.position);
      assert.equal(moveTarget.placementVersion, movedPlacement.version);
      assert.notEqual(movedPlacement.position, initialTargetPlacement.position,
        'the requested target moved to the other position in its group');
      assert.deepEqual([
        { id: target.placementId, position: movedPlacement.position },
        { id: neighbor.placementId, position: movedNeighbor.position },
      ].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id)).map(({ id }) => id),
      [neighbor.placementId, target.placementId], 'targetPosition 2 places the neighbor before the target');
      const expectedMoveReceipts = [
        { entity: 'profile', id: initialOwner.profile.id, before: initialOwner.profile.version, after: initialOwner.profile.version + 1 },
        ...(movedPlacement.version === initialTargetPlacement.version
          ? [] : [{ entity: 'placement', id: target.placementId, before: initialTargetPlacement.version, after: movedPlacement.version }]),
        ...(movedNeighbor.version === initialNeighborPlacement.version
          ? [] : [{ entity: 'placement', id: neighbor.placementId, before: initialNeighborPlacement.version, after: movedNeighbor.version }]),
      ];
      assert.equal(movedOwner.profile.version, initialOwner.profile.version + 1);
      assert.deepEqual(sortedReceipts(receiptsFrom(move)), sortedReceipts(expectedMoveReceipts),
        'the receipt participants match the placement records that actually changed');
      await expect(page.locator(`[data-link-row="${target.placementId}"] [data-link-title]`)).toHaveText('Título observado v1',
        'the browser applies the placement receipt without adopting newer resource metadata from the move DTO');

      await page.locator(`[data-link-row="${target.placementId}"] [data-link-edit]`).click();
      const form = linkEditor(page);
      await expect(form.getByLabel('Título')).toHaveValue('Título observado v1');
      const titleInput = form.locator('#owner-link-title');
      await titleInput.fill('Corrección manual');
      await form.getByRole('button', { name: 'Guardar cambios' }).click();
      const staleEditPath = `/api/creador/enlaces/${target.placementId}/editar`;
      await expect.poll(() => capture.writes().find(({ method, path }) => method === 'PATCH' && path === staleEditPath)?.status)
        .toBe(409);
      const stalePatch = capture.writes().find(({ method, path, status }) => method === 'PATCH'
        && path === staleEditPath && status === 409);
      assert.ok(stalePatch, 'the following manual metadata Save reaches the server with the original resource base and conflicts');
      assert.equal(stalePatch.body.profileVersion, movedOwner.profile.version);
      assert.equal(stalePatch.body.resourceVersion, initialTargetResource.version);
      assert.equal(stalePatch.body.placementVersion, movedPlacement.version);

      const conflictSection = form.locator('[data-link-conflict]');
      const compareButton = conflictSection.locator('[data-owner-compare]');
      assert.equal(await compareButton.count(), 1,
        `the real 409 retains one compare control; conflict count ${await conflictSection.count()}`);
      const beforeCompare = await conflictSection.evaluate((section) => ({
        hidden: section.hidden,
        ariaHidden: section.getAttribute('aria-hidden'),
        formBusy: section.closest('form')?.getAttribute('aria-busy'),
        buttons: [...section.querySelectorAll('button')].map((button) => ({
          text: button.textContent?.trim(),
          hidden: button.hidden,
          disabled: button.disabled,
          ariaDisabled: button.getAttribute('aria-disabled'),
        })),
      }));
      await testInfo.attach('link-conflict-before-compare', {
        body: JSON.stringify(beforeCompare, null, 2),
        contentType: 'application/json',
      });
      await expect(form).not.toHaveAttribute('aria-busy', 'true');
      await expect(conflictSection).toBeVisible();
      await expect(compareButton).toBeEnabled();
      await compareButton.click();
      await expect(form.locator('[data-owner-comparison]')).toBeVisible();
      await expect(form.locator('[data-owner-comparison]')).toContainText('Título externo v2');
      await expect(form.locator('[data-owner-comparison]')).toContainText(/tu corrección.*Corrección manual/i,
        'the comparison after the 409 shows that the unsaved metadata correction remains in the editor');
      await form.locator('[data-owner-adopt]').click();
      await expect(titleInput).toHaveValue('Título externo v2');
      await titleInput.fill('Corrección manual');
      await form.getByRole('button', { name: 'Guardar cambios' }).click();
      const staleAndFinalPatches = () => capture.writes().filter(({ method, path }) => method === 'PATCH' && path === staleEditPath);
      await expect.poll(() => staleAndFinalPatches().find(({ status }) => status === 200)?.status).toBe(200);
      await capture.settle({ skipErrorBodies: true });
      const updates = staleAndFinalPatches();
      assert.equal(updates.length, 2, 'the stale request is not replayed; the manual correction is a distinct later command');
      assert.equal(updates[0].status, 409);
      assert.equal(updates[1].body.resourceVersion, externalResource.version,
        'the explicit GET adoption installs the real resource version before the manual retry');
      assert.equal(updates[1].body.profileVersion, movedOwner.profile.version);
      assert.equal(updates[1].status, 200);
      assert.deepEqual(sortedReceipts(receiptsFrom(updates[1])), sortedReceipts([
        { entity: 'profile', id: movedOwner.profile.id, before: movedOwner.profile.version, after: movedOwner.profile.version + 1 },
        { entity: 'resource', id: target.resourceId, before: externalResource.version, after: externalResource.version + 1 },
      ]));
      const saved = await fixture.rawResource(target.resourceId);
      assert.deepEqual({ title: saved.title, description: saved.description, version: saved.version }, {
        title: 'Corrección manual', description: 'Descripción externa v2', version: externalResource.version + 1,
      });
      assert.equal((await fixture.rawPlacement(cookie, target.placementId)).position, movedPlacement.position);
      assert.equal(capture.writes().filter(({ method, path }) => method === 'POST' && path === movePath).length, 1,
        'comparison, adoption and the later metadata Save do not replay the move');
      await capture.stop({ skipErrorBodies: true });
    } else {
      const row = page.locator(`[data-chapter-row="${target.placementId}"]`);
      await row.locator('[data-chapter-move]').click();
      const moveForm = page.locator('[data-owner-dialog] form[data-owner-form="mover-capitulo"]');
      await moveForm.getByLabel('Posición en esta serie').fill('2');
      await moveForm.getByRole('button', { name: 'Guardar posición' }).click();
      await capture.settle();
      const movePath = `/api/creador/series/${series.id}/capitulos/${target.placementId}/mover`;
      const move = capture.writes().find(({ method, path }) => method === 'POST' && path === movePath);
      assert.ok(move);
      assert.deepEqual(move.body, {
        profileVersion: initialOwner.profile.version,
        seriesVersion: series.version,
        placementVersion: initialTargetPlacement.version,
        targetPosition: 2,
      });
      assert.equal(move.status, 200);
      const moveTarget = move.responseBody.links.find(({ placementId }) => placementId === target.placementId);
      assert.equal(moveTarget.title, externalResource.title);
      assert.equal(moveTarget.resourceVersion, externalResource.version,
        'the genuine chapter-move DTO contains the resource observation made after the page loaded');
      const movedPlacement = await fixture.rawPlacement(cookie, target.placementId);
      const movedNeighbor = await fixture.rawPlacement(cookie, neighbor.placementId);
      const movedOwner = await fixture.rawOwner(cookie);
      assert.equal(movedPlacement.series[series.id].position,
        moveTarget.series.find(({ seriesId }) => seriesId === series.id).position);
      assert.deepEqual(movedPlacement.series[otherSeries.id], initialTargetPlacement.series[otherSeries.id],
        'the target retains its membership and position in the independent series');
      assert.equal(movedPlacement.featured, initialTargetPlacement.featured);
      assert.equal(movedPlacement.selectedForDirectory, initialTargetPlacement.selectedForDirectory);
      assert.notEqual(movedPlacement.series[series.id].position, initialTargetPlacement.series[series.id].position,
        'the target moved to the requested ordinal in this series');
      assert.deepEqual([
        { id: target.placementId, position: movedPlacement.series[series.id].position },
        { id: neighbor.placementId, position: movedNeighbor.series[series.id].position },
      ].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id)).map(({ id }) => id),
      [neighbor.placementId, target.placementId], 'targetPosition 2 places the neighbor before the target in this series');
      const expectedMoveReceipts = [
        { entity: 'profile', id: initialOwner.profile.id, before: initialOwner.profile.version, after: initialOwner.profile.version + 1 },
        ...(movedPlacement.version === initialTargetPlacement.version
          ? [] : [{ entity: 'placement', id: target.placementId, before: initialTargetPlacement.version, after: movedPlacement.version }]),
        ...(movedNeighbor.version === initialNeighborPlacement.version
          ? [] : [{ entity: 'placement', id: neighbor.placementId, before: initialNeighborPlacement.version, after: movedNeighbor.version }]),
      ];
      assert.deepEqual(sortedReceipts(receiptsFrom(move)), sortedReceipts(expectedMoveReceipts),
        'the receipt participants match the placement records that actually changed');
      assert.equal(movedOwner.profile.version, initialOwner.profile.version + 1);
      await expect(page.locator(`[data-chapter-row="${target.placementId}"] h4`)).toHaveText('Título observado v1',
        'the chapter editor retains its resource metadata while applying only this series placement');

      await page.locator(`[data-chapter-row="${target.placementId}"] [data-chapter-move]`).click();
      const nextMoveForm = page.locator('[data-owner-dialog] form[data-owner-form="mover-capitulo"]');
      await nextMoveForm.getByLabel('Posición en esta serie').fill('1');
      await nextMoveForm.getByRole('button', { name: 'Guardar posición' }).click();
      await capture.settle();
      const moves = capture.writes().filter(({ method, path }) => method === 'POST' && path === movePath);
      assert.equal(moves.length, 2, 'a second real chapter command continues without reloading the owner page');
      assert.equal(moves[1].body.profileVersion, movedOwner.profile.version,
        'the next chapter command consumes the profile version from the first move receipt');
      assert.equal(moves[1].body.placementVersion, movedPlacement.version,
        'the next chapter command consumes the target placement version from the first move receipt');
      assert.equal(moves[1].status, 200);
      const secondMoveOwner = await fixture.rawOwner(cookie);
      const secondMoveTarget = await fixture.rawPlacement(cookie, target.placementId);
      const secondMoveNeighbor = await fixture.rawPlacement(cookie, neighbor.placementId);
      assert.equal(secondMoveOwner.profile.version, movedOwner.profile.version + 1);
      assert.deepEqual([
        { id: target.placementId, position: secondMoveTarget.series[series.id].position },
        { id: neighbor.placementId, position: secondMoveNeighbor.series[series.id].position },
      ].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id)).map(({ id }) => id),
      [target.placementId, neighbor.placementId], 'the next targetPosition 1 puts the target before the neighbor');
      assert.equal((await fixture.rawResource(target.resourceId)).version, externalResource.version,
        'chapter movement leaves the separately changed resource version alone');
    }
    if (movementKind !== 'link') await capture.stop();
  });
}

function physicalMovePosition(placement, movementKind, seriesId) {
  return movementKind === 'link' ? placement.position : placement.series?.[seriesId]?.position;
}

function physicalMoveOrder(placements, movementKind, seriesId) {
  return placements
    .filter((placement) => movementKind === 'link' || Object.hasOwn(placement.series ?? {}, seriesId))
    .sort((left, right) => physicalMovePosition(left, movementKind, seriesId)
      - physicalMovePosition(right, movementKind, seriesId)
      || left.id.localeCompare(right.id))
    .map(({ id }) => id);
}

function orderAfterPhysicalMove(placements, movementKind, seriesId, targetId, targetPosition) {
  const desired = physicalMoveOrder(placements, movementKind, seriesId);
  const targetIndex = desired.indexOf(targetId);
  assert.notEqual(targetIndex, -1, `the selected target ${targetId} is in the requested order scope`);
  const [target] = desired.splice(targetIndex, 1);
  desired.splice(targetPosition - 1, 0, target);
  return desired;
}

async function rawMovementSnapshot(fixture, cookie, links, series) {
  const owner = await fixture.rawOwner(cookie);
  const placements = await Promise.all(links.map(({ placementId }) => fixture.rawPlacement(cookie, placementId)));
  const resources = await Promise.all(links.map(({ resourceId }) => fixture.rawResource(resourceId)));
  const storedSeries = await Promise.all(series.map(({ id }) => fixture.rawSeries(cookie, id)));
  return {
    profile: owner.profile,
    placements: placements.sort((left, right) => left.id.localeCompare(right.id)),
    resources: resources.sort((left, right) => left.id.localeCompare(right.id)),
    series: storedSeries.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function storeTransactionCalls(fixture) {
  return fixture.creatorStore.calls.filter(({ operation }) => operation === 'transact');
}

async function publishOwnerForPublicOrder(fixture, cookie) {
  const owner = await fixture.rawOwner(cookie);
  const result = await api(fixture, cookie, '/api/creador/perfil/publicar', {
    method: 'POST', body: { version: owner.profile.version },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.profile;
}

async function seedNativeMovementLinks(fixture, cookie, {
  prefix,
  count,
  globalPosition,
  primarySeries,
  primarySeriesPosition,
  extraMembership,
  titleAtIndex,
}) {
  const profileId = (await fixture.rawOwner(cookie)).profile.id;
  const checks = [];
  const puts = [];
  const links = [];
  for (let index = 0; index < count; index += 1) {
    const suffix = String(index).padStart(3, '0');
    const resourceId = `resource-${prefix}-${suffix}`;
    const placementId = `placement-${prefix}-${suffix}`;
    const url = `https://links.example/${prefix}-${suffix}`;
    const title = titleAtIndex?.(index) ?? `Límite ${suffix}`;
    const series = primarySeries ? { [primarySeries.id]: { position: primarySeriesPosition(index) } } : {};
    if (extraMembership?.index === index) {
      series[extraMembership.seriesId] = { position: extraMembership.position };
    }
    const placement = {
      recordType: 'placement', id: placementId, profileId, resourceId,
      position: globalPosition(index), featured: false, selectedForDirectory: true,
      ...(Object.keys(series).length ? { series } : {}), version: 1,
    };
    checks.push(
      { key: `resource:${resourceId}`, version: null },
      { key: `placement:${profileId}:${placementId}`, version: null },
    );
    puts.push(
      { key: `resource:${resourceId}`, value: {
        id: resourceId, title, url, description: '', version: 1,
        published: false, hidden: false, approvalRevoked: false, directoryControl: 'editorial',
      } },
      { key: `placement:${profileId}:${placementId}`, value: placement },
    );
    links.push({ placementId, resourceId, title, url, resourceVersion: 1, placementVersion: 1 });
  }
  // This is an initial in-memory fixture image. The moves under test still use the real Astro HTTP and service path.
  assert.equal(await fixture.creatorStore.transact({ checks, puts }), true,
    `the ${count} placement/resource rows are seeded before the browser command`);
  return links;
}

async function createThreeLinkMoveScenario(fixture, cookie, movementKind) {
  const series = await createSeries(fixture, cookie, {
    name: `Serie principal ${movementKind}`,
    slug: `serie-principal-${movementKind}`,
  });
  const otherSeries = await createSeries(fixture, cookie, {
    name: `Serie independiente ${movementKind}`,
    slug: `serie-independiente-${movementKind}`,
  });
  const links = await seedNativeMovementLinks(fixture, cookie, {
    prefix: `three-${movementKind}`,
    count: 3,
    globalPosition: (index) => index,
    primarySeries: series,
    primarySeriesPosition: (index) => index,
    extraMembership: { index: 0, seriesId: otherSeries.id, position: 0 },
    titleAtIndex: (index) => ['Destino inicial', 'Vecino uno', 'Vecino dos'][index],
  });
  await publishOwnerForPublicOrder(fixture, cookie);
  return { links, series, otherSeries, target: links[0] };
}

for (const movementKind of ['link', 'chapter']) {
  test(`orden factible: ${movementKind === 'link' ? 'un enlace' : 'un capítulo'} conserva una corrección mientras el cálculo no está disponible`, async ({ fixture, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const cookie = await loggedInOwner(fixture, page);
    const scenario = await createThreeLinkMoveScenario(fixture, cookie, movementKind);
    const { links, series, target } = scenario;
    const initial = await rawMovementSnapshot(fixture, cookie, links, [scenario.series, scenario.otherSeries]);
    const initialOrder = physicalMoveOrder(initial.placements, movementKind, series.id);
    assert.deepEqual(initialOrder, links.map(({ placementId }) => placementId),
      'the three real links or memberships begin in their created order');
    assert.equal(initialOrder[0], target.placementId, 'the selected placement begins at position one');
    const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
    if (movementKind === 'chapter') {
      await openSeriesView(page, fixture, `&serie=${encodeURIComponent(series.id)}`);
    } else {
      await openLinksView(page, fixture);
    }
    const row = page.locator(movementKind === 'link'
      ? `[data-link-row="${target.placementId}"]`
      : `[data-chapter-row="${target.placementId}"]`);
    await expect(row).toBeVisible();
    await row.locator(movementKind === 'link' ? '[data-link-move]' : '[data-chapter-move]').click();
    const form = page.locator(`[data-owner-dialog] form[data-owner-form="${movementKind === 'link' ? 'mover-enlace' : 'mover-capitulo'}"]`);
    const positionInput = form.getByLabel(movementKind === 'link' ? 'Posición dentro del grupo' : 'Posición en esta serie');
    const saveButton = form.getByRole('button', { name: 'Guardar posición' });
    const status = form.locator(`[data-owner-form-status="${movementKind === 'link' ? 'mover-enlace' : 'mover-capitulo'}"]`);
    await expect(positionInput).toHaveValue('1');
    await positionInput.fill('3');

    const movePath = movementKind === 'link'
      ? `/api/creador/enlaces/${target.placementId}/mover`
      : `/api/creador/series/${series.id}/capitulos/${target.placementId}/mover`;
    const transactionCountBefore = storeTransactionCalls(fixture).length;
    let signalIntercept;
    let releaseUnavailable;
    const intercepted = new Promise((resolve) => { signalIntercept = resolve; });
    const unavailableGate = new Promise((resolve) => { releaseUnavailable = resolve; });
    let unavailableCount = 0;
    const fulfillUnavailableBeforeHandler = async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace(/\/$/u, '');
      if (!unavailableCount && request.method() === 'POST' && path === movePath) {
        unavailableCount += 1;
        signalIntercept(request);
        await unavailableGate;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'ORDER_MOVE_CALCULATION_UNAVAILABLE' }),
        });
        return;
      }
      await route.continue();
    };
    await page.route('**/api/creador/**', fulfillUnavailableBeforeHandler);
    let firstSave;
    try {
      firstSave = saveButton.click();
      const interceptedRequest = await intercepted;
      assert.equal(interceptedRequest.method(), 'POST');
      assert.equal(new URL(interceptedRequest.url()).pathname.replace(/\/$/u, ''), movePath);
      const writeAtRequest = capture.writes().find(({ method, path }) => method === 'POST' && path === movePath);
      assert.ok(writeAtRequest, 'the actual browser submits the requested move before the transport returns the unavailable result');
      assert.equal(writeAtRequest.body.profileVersion, initial.profile.version);
      assert.equal(writeAtRequest.body.placementVersion,
        initial.placements.find(({ id }) => id === target.placementId).version);
      assert.equal(writeAtRequest.body.targetPosition, 3,
        'the intercepted request keeps the original target even as the user edits the open form');
      if (movementKind === 'chapter') {
        assert.equal(writeAtRequest.body.seriesVersion, initial.series.find(({ id }) => id === series.id).version);
      }
      await positionInput.fill('2');
      releaseUnavailable();
      await firstSave;
    } finally {
      releaseUnavailable();
      await page.unroute('**/api/creador/**', fulfillUnavailableBeforeHandler).catch(() => {});
      await firstSave?.catch(() => {});
    }
    await capture.settle({ skipErrorBodies: true });
    const unavailableWrite = capture.writes().filter(({ method, path }) => method === 'POST' && path === movePath);
    assert.equal(unavailableCount, 1);
    assert.equal(unavailableWrite.length, 1,
      'the unavailable calculation returns once without automatic replay');
    assert.equal(unavailableWrite[0].status, 503);
    await expect(form).toBeVisible();
    await expect(positionInput).toHaveValue('2', 'the corrected local target survives the delayed unavailable response');
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();
    await expect(form.locator(`[data-${movementKind === 'link' ? 'link' : 'chapter'}-move-suggestion-shell]`)).toBeHidden();
    const unavailableStatus = await status.textContent() ?? '';
    const explicitUnavailableCopy = /No pudimos calcular este movimiento/i.test(unavailableStatus);
    assert.doesNotMatch(unavailableStatus, /orden guardado|movimiento guardado/i,
      'an unavailable calculation is not shown as success');
    assert.equal(storeTransactionCalls(fixture).length, transactionCountBefore,
      'the synthetic 503 happened before the handler and caused no store transaction');
    assert.deepEqual(await rawMovementSnapshot(fixture, cookie, links, [scenario.series, scenario.otherSeries]), initial,
      'profile, versions, links, memberships, resources, and both series remain unchanged after the unavailable result');

    await saveButton.click();
    await capture.settle({ skipErrorBodies: true });
    const moves = capture.writes().filter(({ method, path }) => method === 'POST' && path === movePath);
    assert.equal(moves.length, 2, 'the user makes one distinct manual command after the unavailable response');
    assert.equal(moves[1].body.profileVersion, initial.profile.version);
    assert.equal(moves[1].body.placementVersion,
      initial.placements.find(({ id }) => id === target.placementId).version);
    assert.equal(moves[1].body.targetPosition, 2, 'the manual command uses the corrected target position');
    if (movementKind === 'chapter') {
      assert.equal(moves[1].body.seriesVersion, initial.series.find(({ id }) => id === series.id).version);
    }
    assert.equal(moves[1].status, 200, JSON.stringify(moves[1].responseBody));
    assert.equal(storeTransactionCalls(fixture).length, transactionCountBefore + 1,
      'the explicit retry creates one real transaction');

    const after = await rawMovementSnapshot(fixture, cookie, links, [scenario.series, scenario.otherSeries]);
    const expectedOrder = orderAfterPhysicalMove(initial.placements, movementKind, series.id, target.placementId, 2);
    assert.deepEqual(physicalMoveOrder(after.placements, movementKind, series.id), expectedOrder,
      'the real service applies the corrected insertion within the requested group');
    const initialById = new Map(initial.placements.map((placement) => [placement.id, placement]));
    const afterById = new Map(after.placements.map((placement) => [placement.id, placement]));
    const changedPlacementIds = [];
    for (const placement of initial.placements) {
      const saved = afterById.get(placement.id);
      const changed = physicalMovePosition(placement, movementKind, series.id)
        !== physicalMovePosition(saved, movementKind, series.id);
      if (changed) changedPlacementIds.push(placement.id);
      const expected = structuredClone(placement);
      if (movementKind === 'link') expected.position = saved.position;
      else expected.series[series.id].position = saved.series[series.id].position;
      if (changed) expected.version += 1;
      assert.deepEqual(saved, expected,
        `${placement.id} changes only the requested order field and advances its placement version iff that field changed`);
    }
    const profileUnversioned = ({ version, updatedAt, ...value }) => value;
    assert.equal(after.profile.version, initial.profile.version + 1);
    assert.deepEqual(profileUnversioned(after.profile), profileUnversioned(initial.profile));
    assert.deepEqual(after.series, initial.series,
      'moving link/chapter order does not modify either series metadata record');
    assert.deepEqual(after.resources, initial.resources,
      'movement leaves every resource and resource version unchanged');
    assert.deepEqual(sortedReceipts(receiptsFrom(moves[1])), sortedReceipts([
      { entity: 'profile', id: initial.profile.id, before: initial.profile.version, after: after.profile.version },
      ...changedPlacementIds.map((id) => ({
        entity: 'placement', id, before: initialById.get(id).version, after: afterById.get(id).version,
      })),
    ]), 'real receipts match every and only the raw order/version changes');
    const responseIds = moves[1].responseBody.links.map(({ placementId }) => placementId).sort();
    assert.deepEqual(responseIds, [...new Set([target.placementId, ...changedPlacementIds])].sort(),
      'the successful command returns the target and its actual changed neighbors');
    for (const link of moves[1].responseBody.links) {
      const saved = afterById.get(link.placementId);
      const resource = after.resources.find(({ id }) => id === saved.resourceId);
      assert.equal(link.placementVersion, saved.version);
      assert.equal(link.resourceVersion, resource.version);
      assert.equal(link.title, resource.title);
      assert.equal(link.featured, saved.featured);
      assert.equal(link.selectedForDirectory, saved.selectedForDirectory);
      if (movementKind === 'link') assert.equal(link.position, saved.position);
      else assert.equal(link.series.find(({ seriesId }) => seriesId === series.id)?.position, saved.series[series.id].position);
    }
    if (movementKind === 'link') {
      const publicProfile = await fixture.creatorRuntime.service.readPublicProfile('ana-browser');
      assert.equal(publicProfile.status, 200);
      assert.deepEqual(publicProfile.links.map(({ placementId }) => placementId), expectedOrder,
        'the public profile projects the committed link insertion');
      const publicOtherSeries = await fixture.creatorRuntime.service.readPublicSeries('ana-browser', scenario.otherSeries.slug);
      assert.equal(publicOtherSeries.status, 200);
      assert.deepEqual(publicOtherSeries.links.map(({ placementId }) => placementId), [target.placementId],
        'the target keeps its independent series membership');
    } else {
      const publicSeries = await fixture.creatorRuntime.service.readPublicSeries('ana-browser', series.slug);
      assert.equal(publicSeries.status, 200);
      assert.deepEqual(publicSeries.links.map(({ placementId }) => placementId), expectedOrder,
        'the public series projects the committed chapter insertion');
      const publicOtherSeries = await fixture.creatorRuntime.service.readPublicSeries('ana-browser', scenario.otherSeries.slug);
      assert.equal(publicOtherSeries.status, 200);
      assert.deepEqual(publicOtherSeries.links.map(({ placementId }) => placementId), [target.placementId],
        'the target keeps its independent series membership');
    }
    assert.equal(explicitUnavailableCopy, true,
      'the user receives the dedicated no-write calculation-unavailable message');
    await capture.stop({ skipErrorBodies: true });
  });
}

async function createTiedBoundaryScenario(fixture, cookie, movementKind) {
  const series = await createSeries(fixture, cookie, {
    name: `Serie de frontera ${movementKind}`,
    slug: `serie-frontera-${movementKind}`,
  });
  const otherSeries = await createSeries(fixture, cookie, {
    name: `Serie ajena ${movementKind}`,
    slug: `serie-ajena-${movementKind}`,
  });
  const links = await seedNativeMovementLinks(fixture, cookie, {
    prefix: `frontera-${movementKind}`,
    count: 101,
    globalPosition: () => 0,
    primarySeries: series,
    primarySeriesPosition: (index) => movementKind === 'chapter' ? 0 : index,
    ...(movementKind === 'chapter'
      ? { extraMembership: { index: 100, seriesId: otherSeries.id, position: 7 } }
      : {}),
  });
  const sortedLinks = [...links].sort((left, right) => left.placementId.localeCompare(right.placementId));
  const target = sortedLinks.at(-1);
  assert.ok(target);
  await publishOwnerForPublicOrder(fixture, cookie);
  return { links, target, series, otherSeries };
}

for (const movementKind of ['link', 'chapter']) {
  test(`orden factible: ${movementKind === 'link' ? 'un enlace' : 'un capítulo'} propone y guarda una inserción intermedia en el límite de 101 filas`, async ({ fixture, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const cookie = await loggedInOwner(fixture, page);
    const scenario = await createTiedBoundaryScenario(fixture, cookie, movementKind);
    const { links, target, series } = scenario;
    const initial = await rawMovementSnapshot(fixture, cookie, links, [scenario.series, scenario.otherSeries]);
    const initialOrder = physicalMoveOrder(initial.placements, movementKind, series.id);
    const initialTargetOrdinal = initialOrder.indexOf(target.placementId) + 1;
    assert.equal(initial.placements.length, 101, 'the application fixture has the approved 101-row boundary');
    assert.equal(initialOrder.length, 101, 'all 101 rows participate in the selected order scope');
    assert.equal(initialTargetOrdinal, 101, 'the tied final ID starts at the last ordinal');
    assert.ok(initial.placements.every((placement) => placement.position === 0),
      'all global positions begin tied at zero');
    if (movementKind === 'chapter') {
      assert.ok(initial.placements.every((placement) => placement.series[series.id]?.position === 0),
        'all 101 chapter memberships begin tied at zero');
    }
    const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
    if (movementKind === 'link') {
      await page.goto(`${fixture.origin}/cuenta/?vista=enlaces&paginaEnlaces=5`);
      await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
    } else {
      await page.goto(`${fixture.origin}/cuenta/?vista=series&serie=${encodeURIComponent(series.id)}&buscarCapitulos=${encodeURIComponent(target.title)}&paginaCapitulos=1`);
      await expect(page.getByRole('heading', { name: 'Series', exact: true })).toBeVisible();
      await expect(page.locator('[data-series-context-name]')).toHaveText(series.name);
    }
    const row = page.locator(movementKind === 'link'
      ? `[data-link-row="${target.placementId}"]`
      : `[data-chapter-row="${target.placementId}"]`);
    await expect(row).toBeVisible();
    await row.locator(movementKind === 'link' ? '[data-link-move]' : '[data-chapter-move]').click();
    const form = page.locator(`[data-owner-dialog] form[data-owner-form="${movementKind === 'link' ? 'mover-enlace' : 'mover-capitulo'}"]`);
    const positionInput = form.getByLabel(movementKind === 'link' ? 'Posición dentro del grupo' : 'Posición en esta serie');
    const saveButton = form.getByRole('button', { name: 'Guardar posición' });
    const suggestion = form.locator(`[data-${movementKind === 'link' ? 'link' : 'chapter'}-move-suggestion]`);
    const movePath = movementKind === 'link'
      ? `/api/creador/enlaces/${target.placementId}/mover`
      : `/api/creador/series/${series.id}/capitulos/${target.placementId}/mover`;
    await expect(positionInput).toHaveValue('101');
    const transactionCountBefore = storeTransactionCalls(fixture).length;
    await positionInput.fill('1');
    await saveButton.click();
    await capture.settle({ skipErrorBodies: true });
    const moves = capture.writes().filter(({ method, path }) => method === 'POST' && path === movePath);
    assert.equal(moves.length, 1, 'the rejected boundary request is sent once');
    assert.equal(moves[0].status, 422);
    await expect(form.locator(`[data-owner-form-status="${movementKind === 'link' ? 'mover-enlace' : 'mover-capitulo'}"]`))
      .toContainText(/Ese movimiento supera el límite/,
        'the unmocked 422 follows the ORDER_MOVE_LIMIT UI branch');
    assert.equal(moves[0].body.profileVersion, initial.profile.version);
    assert.equal(moves[0].body.placementVersion,
      initial.placements.find(({ id }) => id === target.placementId).version);
    assert.equal(moves[0].body.targetPosition, 1);
    if (movementKind === 'chapter') {
      assert.equal(moves[0].body.seriesVersion, initial.series.find(({ id }) => id === series.id).version);
    }
    const viablePosition = Number(await suggestion.getAttribute('data-viable-position'));
    assert.ok(Number.isSafeInteger(viablePosition) && viablePosition > 1 && viablePosition < initialTargetOrdinal,
      'the real ORDER_MOVE_LIMIT response offers a strictly intermediate ordinal without requiring a nearest suggestion');
    assert.equal(storeTransactionCalls(fixture).length, transactionCountBefore,
      'the real 422 performs no store transaction');
    assert.deepEqual(await rawMovementSnapshot(fixture, cookie, links, [scenario.series, scenario.otherSeries]), initial,
      'all profile, series, placement, resource, membership, and option values remain unchanged after 422');
    await expect(positionInput).toHaveValue('1', 'the original rejected target stays in the form until the user chooses the suggestion');
    await expect(suggestion).toBeVisible();
    await expect(suggestion).toContainText(`Usar posición intermedia ${viablePosition}`);
    await suggestion.click();
    await expect(positionInput).toHaveValue(String(viablePosition),
      'the verified suggestion changes only the local destination');
    await expect(saveButton).toBeEnabled();
    assert.equal(capture.writes().filter(({ method, path }) => method === 'POST' && path === movePath).length, 1,
      'choosing the suggestion does not send a write');
    assert.equal(storeTransactionCalls(fixture).length, transactionCountBefore,
      'choosing the suggestion does not transact or mutate storage');

    await saveButton.click();
    await capture.settle({ skipErrorBodies: true });
    const finalMoves = capture.writes().filter(({ method, path }) => method === 'POST' && path === movePath);
    assert.equal(finalMoves.length, 2, 'the next explicit Save is the only accepted second command');
    assert.equal(finalMoves[1].status, 200, JSON.stringify(finalMoves[1].responseBody));
    assert.equal(finalMoves[1].body.targetPosition, viablePosition);
    assert.equal(finalMoves[1].body.profileVersion, initial.profile.version);
    assert.equal(finalMoves[1].body.placementVersion, initial.placements.find(({ id }) => id === target.placementId).version);
    if (movementKind === 'chapter') assert.equal(finalMoves[1].body.seriesVersion, initial.series.find(({ id }) => id === series.id).version);
    const transactions = storeTransactionCalls(fixture).slice(transactionCountBefore);
    assert.equal(transactions.length, 1, 'the successful move is one atomic store transaction');
    const transaction = transactions[0].input;
    const uniquePhysicalKeys = new Set([
      ...transaction.checks.map(({ key }) => key),
      ...transaction.puts.map(({ key }) => key),
      ...transaction.deletes,
    ]);
    assert.ok(uniquePhysicalKeys.size <= 100,
      `the single transaction addresses at most 100 distinct items; observed ${uniquePhysicalKeys.size}`);

    const after = await rawMovementSnapshot(fixture, cookie, links, [scenario.series, scenario.otherSeries]);
    const expectedOrder = orderAfterPhysicalMove(initial.placements, movementKind, series.id, target.placementId, viablePosition);
    assert.deepEqual(physicalMoveOrder(after.placements, movementKind, series.id), expectedOrder,
      'the stored order is the literal insertion at the ordinal the user explicitly chose');
    const initialById = new Map(initial.placements.map((placement) => [placement.id, placement]));
    const afterById = new Map(after.placements.map((placement) => [placement.id, placement]));
    const changedPlacementIds = [];
    for (const placement of initial.placements) {
      const saved = afterById.get(placement.id);
      const changed = physicalMovePosition(placement, movementKind, series.id)
        !== physicalMovePosition(saved, movementKind, series.id);
      if (changed) changedPlacementIds.push(placement.id);
      const expected = structuredClone(placement);
      if (movementKind === 'link') expected.position = saved.position;
      else expected.series[series.id].position = saved.series[series.id].position;
      if (changed) expected.version += 1;
      assert.deepEqual(saved, expected,
        `${placement.id} changes only the requested order field and advances its version iff that field changed`);
    }
    assert.equal(after.profile.version, initial.profile.version + 1);
    const profileUnversioned = ({ version, updatedAt, ...value }) => value;
    assert.deepEqual(profileUnversioned(after.profile), profileUnversioned(initial.profile));
    assert.deepEqual(after.series, initial.series, 'series metadata and versions stay unchanged');
    assert.deepEqual(after.resources, initial.resources, 'all resources and their versions stay unchanged');
    assert.deepEqual(sortedReceipts(receiptsFrom(finalMoves[1])), sortedReceipts([
      { entity: 'profile', id: initial.profile.id, before: initial.profile.version, after: after.profile.version },
      ...changedPlacementIds.map((id) => ({
        entity: 'placement', id, before: initialById.get(id).version, after: afterById.get(id).version,
      })),
    ]), 'the successful command receipts exactly match the raw participants and version changes');
    const responseIds = finalMoves[1].responseBody.links.map(({ placementId }) => placementId).sort();
    assert.deepEqual(responseIds, [...new Set([target.placementId, ...changedPlacementIds])].sort(),
      'the response returns the target and only the actual changed neighbors');
    for (const link of finalMoves[1].responseBody.links) {
      const saved = afterById.get(link.placementId);
      const resource = after.resources.find(({ id }) => id === saved.resourceId);
      assert.equal(link.placementVersion, saved.version);
      assert.equal(link.resourceVersion, resource.version);
      assert.equal(link.title, resource.title);
      assert.equal(link.featured, saved.featured);
      assert.equal(link.selectedForDirectory, saved.selectedForDirectory);
      if (movementKind === 'link') assert.equal(link.position, saved.position);
      else assert.equal(link.series.find(({ seriesId }) => seriesId === series.id)?.position, saved.series[series.id].position);
    }
    if (movementKind === 'link') {
      const publicProfile = await fixture.creatorRuntime.service.readPublicProfile('ana-browser');
      assert.equal(publicProfile.status, 200);
      assert.deepEqual(publicProfile.links.map(({ placementId }) => placementId), expectedOrder,
        'the public profile projects the committed link insertion');
      const publicUnrelatedSeries = await fixture.creatorRuntime.service.readPublicSeries('ana-browser', scenario.series.slug);
      assert.equal(publicUnrelatedSeries.status, 200);
      assert.deepEqual(publicUnrelatedSeries.links.map(({ placementId }) => placementId),
        physicalMoveOrder(initial.placements, 'chapter', scenario.series.id),
        'the unrelated series retains its membership order');
    } else {
      const publicSeries = await fixture.creatorRuntime.service.readPublicSeries('ana-browser', series.slug);
      assert.equal(publicSeries.status, 200);
      assert.deepEqual(publicSeries.links.map(({ placementId }) => placementId), expectedOrder,
        'the public series projects the committed chapter insertion');
      const publicOtherSeries = await fixture.creatorRuntime.service.readPublicSeries('ana-browser', scenario.otherSeries.slug);
      assert.equal(publicOtherSeries.status, 200);
      assert.deepEqual(publicOtherSeries.links.map(({ placementId }) => placementId), [target.placementId],
        'the target keeps its independent membership and position');
    }
    await capture.stop({ skipErrorBodies: true });
  });
}

for (const malformedReceipt of [
  'un recibo de serie ajeno',
  'un recibo de perfil duplicado',
  'la falta del recibo de perfil',
  'una versión del DTO incompatible con el recibo',
]) {
  test(`guardados canónicos: el perfil no adopta ${malformedReceipt} y permite comparar y guardar manualmente`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const unrelatedSeries = malformedReceipt === 'un recibo de serie ajeno'
      ? await createSeries(fixture, cookie, { name: 'Serie sin cambios', slug: 'serie-sin-cambios' })
      : undefined;
    const beforeOwner = await fixture.rawOwner(cookie);
    const capture = await captureCreatorApi(page);
    await page.goto(`${fixture.origin}/cuenta/`);
    await expect(page.locator('[data-creator-owner]')).toBeVisible();
    await page.getByRole('button', { name: 'Editar datos' }).click();
    const form = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
    await form.getByLabel('Ciudad').fill('Ciudad A comprometida');

    let signalCommit;
    let releaseResponse;
    const committed = new Promise((resolve) => { signalCommit = resolve; });
    const responseGate = new Promise((resolve) => { releaseResponse = resolve; });
    let actualCommit;
    const holdAndCorruptReceipt = async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace(/\/$/u, '');
      if (request.method() !== 'PUT' || path !== '/api/creador/perfil') {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      const payload = await response.json();
      const headers = response.headers();
      const genuineReceipts = payload.versionChanges;
      actualCommit = { status: response.status(), body: payload, headers, requestBody: JSON.parse(request.postData()), genuineReceipts };
      signalCommit();
      await responseGate;
      const deliveredReceipts = [...genuineReceipts];
      if (malformedReceipt === 'un recibo de serie ajeno') {
        deliveredReceipts.push({ entity: 'series', id: unrelatedSeries.id, before: unrelatedSeries.version, after: unrelatedSeries.version + 1 });
      } else if (malformedReceipt === 'un recibo de perfil duplicado') {
        deliveredReceipts.push({ ...genuineReceipts[0] });
      } else if (malformedReceipt === 'la falta del recibo de perfil') {
        deliveredReceipts.splice(0, 1);
      } else {
        payload.profile = { ...payload.profile, version: payload.profile.version + 1 };
      }
      payload.versionChanges = deliveredReceipts;
      await route.fulfill({ response, json: payload });
    };
    await page.route('**/api/creador/**', holdAndCorruptReceipt);
    let save;
    try {
      save = form.getByRole('button', { name: 'Guardar datos' }).click();
      await committed;
      assert.equal(actualCommit.status, 200, 'the real profile service commits before only the acknowledgement is altered');
      assert.deepEqual(sortedReceipts(actualCommit.genuineReceipts), sortedReceipts([
        { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1 },
      ]));
      assert.equal((await fixture.rawOwner(cookie)).profile.city, 'Ciudad A comprometida');
      await form.getByLabel('Ciudad').fill('Ciudad B pendiente');
      releaseResponse();
      await save;
    } finally {
      releaseResponse();
      await page.unroute('**/api/creador/**', holdAndCorruptReceipt).catch(() => {});
      await save?.catch(() => {});
    }
    await capture.settle();
    const profileWrites = capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
    assert.equal(profileWrites.length, 1, 'the malformed successful acknowledgement does not replay the committed PUT');
    assert.equal(profileWrites[0].status, 200);
    const genuineProfileReceipt = {
      entity: 'profile', id: beforeOwner.profile.id,
      before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1,
    };
    const malformedReceipts = malformedReceipt === 'un recibo de serie ajeno'
      ? [
        { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1 },
        { entity: 'series', id: unrelatedSeries.id, before: unrelatedSeries.version, after: unrelatedSeries.version + 1 },
      ]
      : malformedReceipt === 'un recibo de perfil duplicado'
        ? [
        { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1 },
        { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1 },
        ]
        : malformedReceipt === 'la falta del recibo de perfil' ? [] : [genuineProfileReceipt];
    assert.deepEqual(sortedReceipts(receiptsFrom(profileWrites[0])), sortedReceipts(malformedReceipts),
      'the browser receives the intended extra or duplicate receipt after the real profile commit');
    if (malformedReceipt === 'una versión del DTO incompatible con el recibo') {
      assert.equal(profileWrites[0].responseBody.profile.version, beforeOwner.profile.version + 2,
        'the malformed profile DTO is one version ahead of the genuine receipt and persisted commit');
    }
    assert.equal(await page.locator('[data-owner-root]').getAttribute('data-profile-version'), String(beforeOwner.profile.version));
    await expect(form.getByLabel('Ciudad')).toHaveValue('Ciudad B pendiente',
      'the late correction remains in the form until the user makes an explicit comparison choice');
    await expect(form.locator('[data-owner-conflict]')).toBeVisible();
    await expect(form.locator('[data-owner-form-status="datos"]')).toContainText(/recibo de versión válido|no pudimos comprobar el recibo/i);
    assert.equal(profileWrites[0].body.city, 'Ciudad A comprometida');

    await form.locator('[data-owner-compare]').click();
    await expect(form.locator('[data-owner-comparison]')).toBeVisible();
    await expect(form.locator('[data-owner-comparison]')).toContainText('Ciudad A comprometida');
    await expect(form.locator('[data-owner-comparison]')).toContainText('Ciudad B pendiente');
    await form.locator('[data-owner-adopt]').click();
    await expect(form.getByLabel('Ciudad')).toHaveValue('Ciudad A comprometida');
    await expect(page.locator('[data-owner-root]')).toHaveAttribute('data-profile-version', String(beforeOwner.profile.version + 1));
    await form.getByLabel('Ciudad').fill('Ciudad B pendiente');
    await form.getByRole('button', { name: 'Guardar datos' }).click();
    await capture.settle();
    const finalWrites = capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
    assert.equal(finalWrites.length, 2, 'the next PUT is a distinct manual save after explicit GET adoption');
    assert.equal(finalWrites[1].body.version, beforeOwner.profile.version + 1);
    assert.equal(finalWrites[1].body.city, 'Ciudad B pendiente');
    assert.equal(finalWrites[1].status, 200);
    assert.deepEqual(sortedReceipts(receiptsFrom(finalWrites[1])), sortedReceipts([
      { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version + 1, after: beforeOwner.profile.version + 2 },
    ]));
    assert.deepEqual(capture.writes().map(({ method, path, status }) => ({ method, path, status })), [
      { method: 'PUT', path: '/api/creador/perfil', status: 200 },
      { method: 'PUT', path: '/api/creador/perfil', status: 200 },
    ], 'there is no retry between malformed acknowledgement, comparison, adoption and manual save');
    const finalOwner = await fixture.rawOwner(cookie);
    assert.equal(finalOwner.profile.city, 'Ciudad B pendiente');
    assert.equal(finalOwner.profile.version, beforeOwner.profile.version + 2);
    if (unrelatedSeries) assert.equal((await fixture.rawSeries(cookie, unrelatedSeries.id)).version, unrelatedSeries.version,
      'an unrelated known series named by the malformed receipt is not changed');
    await capture.stop();
  });
}

for (const inconsistentObservation of ['versión distinta', 'título distinto', 'presencia de descripción distinta']) {
  test(`guardados canónicos: un GET con el mismo recurso y ${inconsistentObservation} se rechaza y permite reintentar`, async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const link = await addLink(fixture, cookie, { title: 'Título inicial', url: 'https://links.example/observacion-repetida' });
  const initialOwner = await fixture.rawOwner(cookie);
  const initialResource = await fixture.rawResource(link.resourceId);
  const initialPlacement = await fixture.rawPlacement(cookie, link.placementId);
  const capture = await captureCreatorApi(page);
  await openLinksView(page, fixture);
  await page.locator(`[data-link-row="${link.placementId}"] [data-link-edit]`).click();
  const form = linkEditor(page);
  await form.getByLabel('Título').fill('Título A confirmado');

  let signalCommit;
  let releaseAck;
  const committed = new Promise((resolve) => { signalCommit = resolve; });
  const ackGate = new Promise((resolve) => { releaseAck = resolve; });
  let actualCommit;
  let corruptNextLinkAck = true;
  let corruptNextOwnerRead = true;
  const corruptAckThenOneOwnerRead = async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (corruptNextLinkAck && request.method() === 'PATCH' && path === `/api/creador/enlaces/${link.placementId}/editar`) {
      corruptNextLinkAck = false;
      const response = await route.fetch();
      const payload = await response.json();
      const headers = response.headers();
      const changes = payload.versionChanges;
      const wrongBase = changes.map((change) => change.entity === 'resource' && change.id === link.resourceId
        ? { ...change, before: change.before + 1, after: change.after + 1 }
        : change);
      actualCommit = { status: response.status(), payload, headers, changes, wrongBase };
      signalCommit();
      await ackGate;
      payload.link = { ...payload.link, resourceVersion: payload.link.resourceVersion + 1 };
      payload.versionChanges = wrongBase;
      await route.fulfill({ response, json: payload });
      return;
    }
    if (corruptNextOwnerRead && request.method() === 'GET' && path === '/api/creador/perfil') {
      corruptNextOwnerRead = false;
      const actual = await route.fetch();
      assert.equal(actual.status(), 200);
      const payload = await actual.json();
      const linkedCopy = payload.links.find(({ resourceId }) => resourceId === link.resourceId);
      const editableCopy = payload.editableResources.find(({ id }) => id === link.resourceId);
      assert.ok(linkedCopy && editableCopy, 'the real owner response repeats this owned resource in both authorized projections');
      if (inconsistentObservation === 'versión distinta') editableCopy.version += 1;
      else if (inconsistentObservation === 'título distinto') editableCopy.title = 'Contradicción de transporte';
      else {
        assert.equal(Object.hasOwn(linkedCopy, 'description'), true);
        assert.equal(editableCopy.description, linkedCopy.description);
        delete editableCopy.description;
      }
      await route.fulfill({ response: actual, json: payload });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', corruptAckThenOneOwnerRead);
  let saveA;
  let committedResource;
  let committedOwner;
  try {
    saveA = form.getByRole('button', { name: 'Guardar cambios' }).click();
    await committed;
    assert.equal(actualCommit.status, 200, 'the real link service commits before the acknowledgement receipt base is changed');
    assert.deepEqual(sortedReceipts(actualCommit.changes), sortedReceipts([
      { entity: 'profile', id: initialOwner.profile.id, before: initialOwner.profile.version, after: initialOwner.profile.version + 1 },
      { entity: 'resource', id: link.resourceId, before: initialResource.version, after: initialResource.version + 1 },
    ]));
    committedResource = await fixture.rawResource(link.resourceId);
    committedOwner = await fixture.rawOwner(cookie);
    assert.equal(committedResource.title, 'Título A confirmado');
    assert.equal(committedResource.version, initialResource.version + 1);
    assert.equal(committedOwner.profile.version, initialOwner.profile.version + 1);
    await form.getByLabel('Título').fill('Corrección B pendiente');
    releaseAck();
    await saveA;
  } finally {
    releaseAck();
    await saveA?.catch(() => {});
  }
  await capture.settle();
  const patches = capture.writes().filter(({ method, path }) => method === 'PATCH' && path === `/api/creador/enlaces/${link.placementId}/editar`);
  assert.equal(patches.length, 1, 'an invalid receipt is not replayed as another atomic link write');
  assert.equal(patches[0].status, 200);
  assert.deepEqual(sortedReceipts(receiptsFrom(patches[0])), sortedReceipts(actualCommit.wrongBase));
  const deliveredResourceReceipt = actualCommit.wrongBase.find(({ entity, id }) => entity === 'resource' && id === link.resourceId);
  assert.ok(deliveredResourceReceipt);
  assert.equal(deliveredResourceReceipt.before, initialResource.version + 1,
    'the delivered resource receipt starts one version beyond the command base');
  assert.equal(deliveredResourceReceipt.after, deliveredResourceReceipt.before + 1,
    'the delivered resource receipt still describes a coherent single-version transition');
  assert.equal(patches[0].responseBody.link.resourceVersion, deliveredResourceReceipt.after,
    'the delivered DTO version matches the receipt after value');
  assert.equal(patches[0].body.resourceVersion, initialResource.version,
    'the command still carries the original observed resource base');
  await expect(form.locator('[data-link-conflict]')).toBeVisible();
  await expect(form.getByLabel('Título')).toHaveValue('Corrección B pendiente');
  await expect(page.locator('[data-owner-root]')).toHaveAttribute('data-profile-version', String(initialOwner.profile.version));

  await form.locator('[data-owner-compare]').click();
  const compareStatus = form.locator('[data-owner-form-status="enlace"]');
  await expect(compareStatus).not.toContainText(/consultando la versión guardada/i);
  const malformedReadRejected = await form.locator('[data-owner-comparison]').isHidden()
    && await form.locator('[data-owner-adopt]').isHidden()
    && /no pudimos confirmar|no pudimos leer|no pudimos conectar/i.test(await compareStatus.textContent() ?? '');
  await expect(form.getByLabel('Título')).toHaveValue('Corrección B pendiente');
  await expect(page.locator(`[data-link-row="${link.placementId}"] [data-link-title]`)).toHaveText('Título inicial');
  await expect(page.locator('[data-owner-root]')).toHaveAttribute('data-profile-version', String(initialOwner.profile.version));
  assert.deepEqual(await fixture.rawPlacement(cookie, link.placementId), initialPlacement,
    'the malformed GET does not change the actual placement');
  assert.equal((await fixture.rawResource(link.resourceId)).version, committedResource.version);

  await form.locator('[data-owner-compare]').click();
  await expect(form.locator('[data-owner-comparison]')).toBeVisible();
  await expect(form.locator('[data-owner-comparison]')).toContainText('Título A confirmado');
  await expect(form.locator('[data-owner-comparison]')).toContainText('Corrección B pendiente');
  await form.locator('[data-owner-adopt]').click();
  await expect(form.getByLabel('Título')).toHaveValue('Título A confirmado');
  await expect(page.locator('[data-owner-root]')).toHaveAttribute('data-profile-version', String(committedOwner.profile.version));
  await form.getByLabel('Título').fill('Corrección B pendiente');
  await form.getByRole('button', { name: 'Guardar cambios' }).click();
  await capture.settle();

  const finalPatches = capture.writes().filter(({ method, path }) => method === 'PATCH' && path === `/api/creador/enlaces/${link.placementId}/editar`);
  assert.equal(finalPatches.length, 2, 'one original command and one later manual correction are the only PATCH requests');
  assert.equal(finalPatches[0].body.title, 'Título A confirmado');
  assert.equal(finalPatches[1].body.title, 'Corrección B pendiente');
  assert.equal(finalPatches[1].body.profileVersion, committedOwner.profile.version);
  assert.equal(finalPatches[1].body.resourceVersion, committedResource.version);
  assert.equal(finalPatches[1].body.placementVersion, initialPlacement.version);
  assert.equal(finalPatches[1].status, 200);
  assert.deepEqual(sortedReceipts(receiptsFrom(finalPatches[1])), sortedReceipts([
    { entity: 'profile', id: committedOwner.profile.id, before: committedOwner.profile.version, after: committedOwner.profile.version + 1 },
    { entity: 'resource', id: link.resourceId, before: committedResource.version, after: committedResource.version + 1 },
  ]));
  const ownerReads = capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil');
  assert.equal(ownerReads.length, 2, 'the first malformed comparison is rejected and a second real GET supplies the explicit adoption');
  const firstReadLink = ownerReads[0].responseBody.links.find(({ resourceId }) => resourceId === link.resourceId);
  const firstReadEditable = ownerReads[0].responseBody.editableResources.find(({ id }) => id === link.resourceId);
  const comparableObservation = (value, version) => ({
    title: value.title, version,
    ...(Object.hasOwn(value, 'description') ? { description: value.description } : {}),
  });
  assert.notDeepEqual(comparableObservation(firstReadLink, firstReadLink.resourceVersion), comparableObservation(firstReadEditable, firstReadEditable.version),
    'the first comparison saw the contradictory transport copies');
  if (inconsistentObservation === 'versión distinta') {
    assert.equal(firstReadEditable.title, firstReadLink.title,
      'the version-only mutation preserves the title in both real projections');
    assert.equal(firstReadEditable.version, firstReadLink.resourceVersion + 1,
      'only the editable projection version differs from the linked projection');
  } else if (inconsistentObservation === 'título distinto') {
    assert.equal(firstReadEditable.title, 'Contradicción de transporte');
    assert.equal(firstReadEditable.version, firstReadLink.resourceVersion,
      'the title-only mutation preserves the resource version in both real projections');
  } else {
    assert.equal(firstReadEditable.title, firstReadLink.title);
    assert.equal(firstReadEditable.version, firstReadLink.resourceVersion);
    assert.equal(Object.hasOwn(firstReadLink, 'description'), true);
    assert.equal(Object.hasOwn(firstReadEditable, 'description'), false,
      'only optional-field presence differs, with identical title and version');
  }
  const secondReadLink = ownerReads[1].responseBody.links.find(({ resourceId }) => resourceId === link.resourceId);
  const secondReadEditable = ownerReads[1].responseBody.editableResources.find(({ id }) => id === link.resourceId);
  assert.deepEqual({ title: secondReadLink.title, version: secondReadLink.resourceVersion }, { title: secondReadEditable.title, version: secondReadEditable.version },
    'the retry reads consistent real projections before adoption');
  const finalResource = await fixture.rawResource(link.resourceId);
  assert.equal(finalResource.title, 'Corrección B pendiente');
  assert.equal(finalResource.version, committedResource.version + 1);
  assert.equal(malformedReadRejected, true,
    'the contradictory repeated-resource observation is rejected without adopting it; the next valid comparison remains available');
  await page.unroute('**/api/creador/**', corruptAckThenOneOwnerRead).catch(() => {});
  await capture.stop();
  });
}

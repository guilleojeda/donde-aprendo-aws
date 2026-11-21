import assert from 'node:assert/strict';
import {
  test, expect, addCookie, api, readOwnerSnapshot, createSeries, addLink, addChapter, captureCreatorApi,
  seriesForm, seriesRow, openSeriesView, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';
import process from 'node:process';

test('Series distingue el primer uso vacío de una búsqueda aplicada sin coincidencias', async ({ fixture, page, browser }) => {
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  const noJsContext = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
  let ssr;
  try {
    await addCookie(noJsContext, fixture, cookie);
    ssr = await noJsContext.newPage();
    const response = await ssr.goto(`${fixture.origin}/cuenta/?vista=series`);
    assert.equal(response?.status(), 200);
    await expect(ssr.locator('[data-series-create-requirement]')).toHaveText('Primero prepara tu página para crear una serie.');
    await expect(ssr.locator('[data-series-empty]')).toHaveCount(0);
    await expect(ssr.locator('[data-series-filters], [data-series-pagination]')).toHaveCount(0);
  } finally {
    await ssr?.close();
    await noJsContext.close();
  }

  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  await expect(page.getByRole('heading', { name: 'Series', exact: true })).toBeVisible();
  await expect(page.locator('[data-series-create-requirement]')).toHaveText('Primero prepara tu página para crear una serie.');
  await expect(page.locator('[data-series-empty]')).toHaveCount(0);
  await expect(page.locator('[data-series-filters], [data-series-pagination]')).toHaveCount(0);

  // An explicit query remains distinguishable from the first-use empty state.
  await page.goto(`${fixture.origin}/cuenta/?vista=series&buscarSeries=búsqueda%20aplicada`);
  await expect(page).toHaveURL((url) => url.searchParams.get('buscarSeries') === 'búsqueda aplicada');
  await expect(page.locator('[data-series-empty]')).toHaveText('No hay series que coincidan con la búsqueda.');
  await expect(page.locator('[data-series-filters]')).toBeVisible();
});

const writtenMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function defer() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function writesFor(capture, method, path) {
  return capture.writes().filter((write) => write.method === method && write.path === path);
}

test('Series: el conteo conserva capítulos visibles y el enlace público sigue la elegibilidad canónica', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const link = await addLink(fixture, cookie, { title: 'Capítulo público de prueba', url: 'https://links.example/serie-publica' });
  const series = await createSeries(fixture, cookie, { name: 'Serie pública de prueba', slug: 'serie-publica-prueba' });
  await addChapter(fixture, cookie, series.id, link.placementId);

  await openSeriesView(page, fixture);
  let row = seriesRow(page, series.id);
  await expect(row).toContainText('1 capítulo visible');
  await expect(row.getByRole('link', { name: 'Abrir serie pública' })).toHaveCount(0,
    'a draft profile keeps its visible chapter count but has no public destination');

  let snapshot = await readOwnerSnapshot(fixture, cookie);
  const publication = await api(fixture, cookie, '/api/creador/perfil/publicar', {
    method: 'POST', body: { creatorVersion: snapshot.creatorVersion },
  });
  assert.equal(publication.response.status, 200, JSON.stringify(publication.body));
  await page.reload();
  row = seriesRow(page, series.id);
  const publicLink = row.getByRole('link', { name: 'Abrir serie pública' });
  await expect(publicLink).toHaveAttribute('href', '/c/ana-browser/series/serie-publica-prueba/');
  const publicPagePromise = page.context().waitForEvent('page');
  await publicLink.click();
  const publicPage = await publicPagePromise;
  await expect(publicPage.getByRole('heading', { name: 'Serie pública de prueba' })).toBeVisible();
  await publicPage.close();

  snapshot = await readOwnerSnapshot(fixture, cookie);
  const profileKey = `profile:${snapshot.profile.id}`;
  const setHidden = async (key, hidden) => {
    const stored = await fixture.creatorStore.get(key);
    assert.equal(await fixture.creatorStore.transact({
      checks: [{ key, version: stored.version }],
      puts: [{ key, value: { ...stored, hidden, version: stored.version + 1 } }],
    }), true, `${key} visibility changes at its observed version`);
  };
  await setHidden(profileKey, true);
  await page.reload();
  row = seriesRow(page, series.id);
  await expect(row).toContainText('1 capítulo visible');
  await expect(row.getByRole('link', { name: 'Abrir serie pública' })).toHaveCount(0,
    'hiding the profile removes the public path without changing its owner-visible chapter count');

  await setHidden(profileKey, false);
  await setHidden(`resource:${link.resourceId}`, true);
  await page.reload();
  row = seriesRow(page, series.id);
  await expect(row).toContainText('0 capítulos visibles');
  await expect(row.getByRole('link', { name: 'Abrir serie pública' })).toHaveCount(0,
    'hidden chapters do not make the public Series route eligible');
});

async function holdOneSuccessfulWrite(page, { method, path }) {
  const reached = defer();
  const responseGate = defer();
  let handled = false;
  let observed;
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (handled || request.method() !== method || pathname !== path) {
      await route.continue();
      return;
    }
    handled = true;
    const actual = await route.fetch();
    const actualBody = await actual.body();
    const actualJson = actualBody.length ? JSON.parse(actualBody.toString('utf8')) : undefined;
    observed = {
      method: request.method(),
      path: pathname,
      body: request.postData() ? JSON.parse(request.postData()) : undefined,
      actualStatus: actual.status(),
      ...(actualJson === undefined ? {} : { actualBody: actualJson }),
    };
    reached.resolve();
    await responseGate.promise;
    await route.fulfill({
      status: actual.status(),
      contentType: actual.headers()['content-type'] ?? 'application/json',
      body: actualBody,
    });
  };
  await page.route('**/api/creador/**', handler);
  return {
    reached: reached.promise,
    get observed() { return observed; },
    release: () => responseGate.resolve(),
    async remove() {
      responseGate.resolve();
      await page.unroute('**/api/creador/**', handler).catch(() => {});
    },
  };
}

async function seedSeriesChapters(fixture, cookie, seriesId, count, longTitleIndex) {
  const initial = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.schemaVersion, 2);
  let creatorVersion = initial.body.creatorVersion;
  const links = [];
  const query = 'BUSQUEDA-UNICA-LARGA-37';

  for (let index = 0; index < count; index += 1) {
    const suffix = String(index).padStart(2, '0');
    const prefix = index === longTitleIndex ? `Capítulo ${suffix} AWS ${query} ` : `Capítulo ${suffix} AWS `;
    const title = index === longTitleIndex ? `${prefix}${'X'.repeat(200 - prefix.length)}` : `${prefix}contenido`;
    const url = `https://links.example/series-acceptance/${suffix}`;
    const added = await api(fixture, cookie, '/api/creador/enlaces', {
      method: 'POST', body: { creatorVersion, title, url },
    });
    assert.equal(added.response.status, 201, JSON.stringify(added.body));
    assert.equal(added.body.operation, 'add-link');
    creatorVersion = added.body.creatorVersion;
    const link = {
      placementId: added.body.placementId,
      resourceId: added.body.resourceId,
      title,
      url,
    };
    links.push(link);

    // Hidden resources remain in the owner snapshot and stay manageable in Series.
    if (index === 3) {
      const stored = await fixture.rawResource(link.resourceId);
      const key = `resource:${link.resourceId}`;
      const hidden = await fixture.creatorStore.transact({
        checks: [{ key, version: stored.version }],
        puts: [{ key, value: { ...stored, hidden: true, version: stored.version + 1 } }],
      });
      assert.equal(hidden, true, 'the hidden-resource prerequisite is stored at its current resource version');
    }
  }

  for (const link of links) {
    const chapter = await api(fixture, cookie,
      `/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(link.placementId)}`,
      { method: 'PUT', body: { creatorVersion } });
    assert.equal(chapter.response.status, 200, JSON.stringify(chapter.body));
    assert.equal(chapter.body.operation, 'add-chapter');
    creatorVersion = chapter.body.creatorVersion;
  }
  return { links, longTitle: links[longTitleIndex].title };
}

test('Series: 0, 1 y 50 capítulos conservan búsqueda, paginación, contexto y foco, también en móvil', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  await openSeriesView(page, fixture);
  await expect(page.locator('[data-series-count]')).toHaveCount(0);
  await expect(page.locator('[data-series-empty]')).toHaveText('Todavía no creaste ninguna serie.');
  await expect(page.locator('[data-series-filters], [data-series-pagination]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Crear serie' })).toBeVisible();

  const series = await createSeries(fixture, cookie, { name: 'Ruta de cincuenta capítulos', slug: 'ruta-cincuenta' });
  await openSeriesView(page, fixture);
  await expect(page.locator('[data-series-count]')).toHaveText('1 serie');
  await expect(seriesRow(page, series.id)).toBeVisible();
  await openSeriesView(page, fixture, `&serie=${encodeURIComponent(series.id)}`);
  await expect(page.locator('[data-chapter-count]')).toHaveText('0 coincidencias de 0 enlaces');
  await expect(page.locator('[data-chapter-empty]')).toBeVisible();
  const one = await addLink(fixture, cookie, { title: 'Capítulo único', url: 'https://links.example/único' });
  await openSeriesView(page, fixture, `&serie=${encodeURIComponent(series.id)}`);
  await expect(page.locator('[data-chapter-count]')).toHaveText('1 coincidencia de 1 enlace');
  const oneRow = page.locator(`[data-chapter-row="${one.placementId}"]`);
  await expect(oneRow.locator('[data-chapter-add]')).toBeVisible();
  await oneRow.locator('[data-chapter-add]').click();
  await expect(oneRow.locator('[data-chapter-remove]')).toBeVisible();
  await expect(oneRow.locator('[data-chapter-move]')).toHaveCount(0);

  const seeded = await seedSeriesChapters(fixture, cookie, series.id, 49, 37);
  await page.goto(`${fixture.origin}/cuenta/?vista=series&serie=${encodeURIComponent(series.id)}`);
  await expect(page.locator('[data-chapter-count]')).toHaveText('50 coincidencias de 50 enlaces');
  await expect(page.locator('[data-chapter-row]')).toHaveCount(25);
  await expect(page.locator(`[data-chapter-row="${seeded.links[3].placementId}"]`)).toContainText('Oculto en catálogo',
    'hidden existing content remains available to the chapter manager');
  await page.locator('[data-series-chapter-page]').filter({ hasText: 'Siguiente' }).click();
  await expect(page).toHaveURL(/paginaCapitulos=2/u);
  await expect(page.locator('[data-chapter-search]')).toHaveValue('');
  await expect(page.locator('[data-chapter-row]')).toHaveCount(25);
  const target = seeded.links[37];
  const targetRow = page.locator(`[data-chapter-row="${target.placementId}"]`);
  await expect(targetRow).toHaveCount(1, 'the second chapter page reaches a row outside the first page');
  await expect(targetRow.locator('h4')).toHaveText(seeded.longTitle);

  const capture = await captureCreatorApi(page, { ignoreReads: true });
  const search = page.locator('[data-chapter-search]');
  await search.fill('BUSQUEDA-UNICA-LARGA-37');
  await expect(search).toBeFocused();
  await expect(page).toHaveURL((url) => !url.searchParams.has('buscarCapitulos'),
    'typing preserves the applied query until the search is confirmed');
  await expect(page.locator('[data-chapter-count]')).toHaveText('50 coincidencias de 50 enlaces');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(page.locator('[data-chapter-count]')).toHaveText('1 coincidencia de 50 enlaces');
  await expect(targetRow.locator('h4')).toHaveText(seeded.longTitle);
  await expect(targetRow.locator('[data-chapter-move]')).toBeVisible();
  await expect(page).toHaveURL(/buscarCapitulos=BUSQUEDA-UNICA-LARGA-37/u);

  await page.setViewportSize({ width: 390, height: 844 });
  const remove = targetRow.locator('[data-chapter-remove]');
  await remove.scrollIntoViewIfNeeded();
  await expect(remove).toBeVisible();
  const removeBox = await remove.boundingBox();
  assert.ok(removeBox && removeBox.x >= 0 && removeBox.x + removeBox.width <= 390,
    'the action for the long-title chapter remains within the mobile viewport');
  await remove.click();
  await capture.settle({ skipErrorBodies: true });
  await expect(page.locator('[data-chapter-search]')).toHaveValue('BUSQUEDA-UNICA-LARGA-37');
  await expect(page.locator(`[data-chapter-row="${target.placementId}"] button:focus, [data-chapter-search]:focus`)).toHaveCount(1,
    'focus returns to a pertinent action in the row, or to chapter search if that row/control is gone');
  assert.equal((await fixture.rawSeries(cookie, series.id)).chapters.includes(target.placementId), false,
    'the real remove action updates just this chapter membership');

  const add = targetRow.locator('[data-chapter-add]');
  await add.press('Enter');
  await capture.settle({ skipErrorBodies: true });
  await expect(page.locator(`[data-chapter-row="${target.placementId}"] button:focus, [data-chapter-search]:focus`)).toHaveCount(1,
    'keyboard Add keeps focus on a pertinent row action, or chapter search if that row/control is gone');
  await expect(page.locator('[data-chapter-search]')).toHaveValue('BUSQUEDA-UNICA-LARGA-37');
  const finalSeries = await fixture.rawSeries(cookie, series.id);
  assert.equal(finalSeries.chapters.at(-1), target.placementId,
    're-adding the chapter uses the actual end of the complete series order');
  const writes = capture.writes().filter(({ method }) => writtenMethods.has(method));
  assert.equal(writes.length, 2, 'the remove and keyboard Add are the only writes in the 50-row interaction');
  assert.equal(writes[0].method, 'DELETE');
  assert.equal(writes[1].method, 'PUT');
  assert.equal(writes[0].status, 200);
  assert.equal(writes[1].status, 200);
  await capture.stop({ skipErrorBodies: true });
});

test('Series: un acuse de capítulo retrasado reconcilia una serie eliminada sin repetir el cambio', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const removed = await createSeries(fixture, cookie, { name: 'Ruta que desaparecerá', slug: 'ruta-que-desaparecera' });
  const survivor = await createSeries(fixture, cookie, { name: 'Ruta para conservar', slug: 'ruta-para-conservar' });
  const link = await addLink(fixture, cookie, { title: 'Capítulo de contexto', url: 'https://links.example/contexto' });
  await addChapter(fixture, cookie, survivor.id, link.placementId);
  const before = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(before.response.status, 200, JSON.stringify(before.body));
  assert.equal(before.body.schemaVersion, 2);

  const path = `/api/creador/series/${removed.id}/capitulos/${link.placementId}`;
  const capture = await captureCreatorApi(page);
  await openSeriesView(page, fixture, `&buscarSeries=Ruta&serie=${encodeURIComponent(removed.id)}`);
  const held = await holdOneSuccessfulWrite(page, { method: 'PUT', path });
  let add;
  try {
    add = page.locator(`[data-chapter-row="${link.placementId}"] [data-chapter-add]`).click();
    await held.reached;
    assert.equal(held.observed.actualStatus, 200, 'the real chapter command commits before its successful acknowledgement is delayed');
    assert.deepEqual(held.observed.body, { creatorVersion: before.body.creatorVersion });
    assert.deepEqual(held.observed.actualBody, {
      operation: 'add-chapter',
      schemaVersion: 2,
      disposition: 'added',
      creatorVersion: before.body.creatorVersion + 1,
      profileId: before.body.profile.id,
      seriesId: removed.id,
      placementId: link.placementId,
    });

    const afterChapter = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(afterChapter.response.status, 200, JSON.stringify(afterChapter.body));
    assert.equal(afterChapter.body.creatorVersion, held.observed.actualBody.creatorVersion);
    assert.deepEqual(afterChapter.body.series[removed.id].chapters, [link.placementId]);
    assert.deepEqual(afterChapter.body.series[survivor.id].chapters, [link.placementId]);

    const deletion = await api(fixture, cookie, `/api/creador/series/${removed.id}`, {
      method: 'DELETE', body: { creatorVersion: afterChapter.body.creatorVersion },
    });
    assert.equal(deletion.response.status, 200, JSON.stringify(deletion.body));
    assert.equal(deletion.body.operation, 'delete-series');
    assert.equal(deletion.body.disposition, 'deleted');
    assert.equal(deletion.body.seriesId, removed.id);

    const afterDelete = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(afterDelete.response.status, 200, JSON.stringify(afterDelete.body));
    assert.equal(afterDelete.body.creatorVersion, before.body.creatorVersion + 2);
    assert.equal(Object.hasOwn(afterDelete.body.series, removed.id), false);
    assert.deepEqual(afterDelete.body.series[survivor.id].chapters, [link.placementId],
      'deleting the other Series keeps the shared chapter in the surviving sequence');
    assert.equal(Object.hasOwn(afterDelete.body.placements, link.placementId), true,
      'the retained placement remains in the complete owner snapshot');

    held.release();
    await add;
    await capture.settle({ skipErrorBodies: true });

    await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
    await expect(page).toHaveURL((url) => url.searchParams.get('buscarSeries') === 'Ruta'
      && !url.searchParams.has('serie') && !url.searchParams.has('buscarCapitulos'));
    await expect(seriesRow(page, removed.id)).toHaveCount(0);
    await expect(seriesRow(page, survivor.id)).toBeVisible();
    await expect(page.locator('#owner-series-title')).toBeFocused();

    const chapterWrites = writesFor(capture, 'PUT', path);
    assert.equal(chapterWrites.length, 1, 'delivering the old acknowledgement never replays the committed chapter command');
    assert.equal(chapterWrites[0].status, 200);
    assert.deepEqual(chapterWrites[0].body, { creatorVersion: before.body.creatorVersion });
    assert.deepEqual(chapterWrites[0].responseBody, held.observed.actualBody);
    const automaticRead = capture.records.filter(({ method, path: readPath, status }) =>
      method === 'GET' && readPath === '/api/creador/perfil' && status === 200).at(-1);
    assert.ok(automaticRead, 'the delayed acknowledgement completes through the browser owner read');
    assert.equal(automaticRead.responseBody.creatorVersion, afterDelete.body.creatorVersion);
    assert.equal(Object.hasOwn(automaticRead.responseBody.series, removed.id), false);
    assert.deepEqual(automaticRead.responseBody.series[survivor.id].chapters, [link.placementId]);

    await seriesRow(page, survivor.id).locator('[data-series-chapters]').click();
    await expect(page.locator(`[data-chapter-row="${link.placementId}"] [data-chapter-remove]`)).toBeVisible();
  } finally {
    held.release();
    await add?.catch(() => {});
    await held.remove();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('Series: el rechazo real de eliminar una fila queda en su contexto y se resuelve con teclado', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const target = await createSeries(fixture, cookie, { name: 'Serie con rechazo de fila', slug: 'serie-rechazo-fila' });
  const capture = await captureCreatorApi(page);
  try {
    await openSeriesView(page, fixture);
    const row = seriesRow(page, target.id);
    const listBefore = await readOwnerSnapshot(fixture, cookie);
    const concurrentListWrite = await api(fixture, cookie, '/api/creador/series', {
      method: 'POST',
      body: { creatorVersion: listBefore.creatorVersion, name: 'Serie concurrente de fila', slug: 'serie-concurrente-fila' },
    });
    assert.equal(concurrentListWrite.response.status, 201, JSON.stringify(concurrentListWrite.body));
    const deleteConfirmation = page.waitForEvent('dialog');
    const deleteClick = row.locator('[data-series-delete]').click();
    (await deleteConfirmation).accept();
    await deleteClick;
    const deletePath = `/api/creador/series/${target.id}`;
    await expect.poll(() => writesFor(capture, 'DELETE', deletePath).at(-1)?.status).toBe(409);
    await capture.settle();
    await expect(row).toBeVisible('a rejected row action leaves the series visible');
    const rowRecovery = row.locator('[data-owner-recovery]');
    await expect(rowRecovery).toBeVisible('the row owns the recovery for its failed no-field action');
    await expect(rowRecovery).toContainText(/no se guardó|contenido cambió|estado actual/iu);
    const rowDecision = rowRecovery.getByRole('button', { name: 'Usar lo guardado', exact: true });
    await expect(rowDecision).toBeFocused();
    await rowDecision.press('Enter');
    await expect(rowRecovery).toHaveCount(0);
    assert.equal(writesFor(capture, 'DELETE', deletePath).length, 1,
      'resolving a rejected series deletion never retries the DELETE');
    const afterDeleteRejection = await readOwnerSnapshot(fixture, cookie);
    assert.ok(afterDeleteRejection.series[target.id], 'the target series remains after the real rejection');
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Series: el rechazo real de quitar un capítulo queda en el detalle y se resuelve con teclado', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const target = await createSeries(fixture, cookie, { name: 'Serie con rechazo de capítulo', slug: 'serie-rechazo-capitulo' });
  const chapter = await addLink(fixture, cookie, { title: 'Capítulo para rechazo', url: 'https://links.example/rechazo-capitulo' });
  await addChapter(fixture, cookie, target.id, chapter.placementId);
  const capture = await captureCreatorApi(page);
  try {
    await openSeriesView(page, fixture);
    await seriesRow(page, target.id).locator('[data-series-chapters]').click();
    await expect(page.locator('[data-owner-series-chapters]')).toBeVisible();
    const detailBefore = await readOwnerSnapshot(fixture, cookie);
    const concurrentDetailWrite = await api(fixture, cookie, '/api/creador/series', {
      method: 'POST',
      body: { creatorVersion: detailBefore.creatorVersion, name: 'Serie concurrente de detalle', slug: 'serie-concurrente-detalle' },
    });
    assert.equal(concurrentDetailWrite.response.status, 201, JSON.stringify(concurrentDetailWrite.body));
    const chapterRow = page.locator(`[data-chapter-row="${chapter.placementId}"]`);
    await chapterRow.locator('[data-chapter-remove]').click();
    const removePath = `/api/creador/series/${target.id}/capitulos/${chapter.placementId}`;
    await expect.poll(() => writesFor(capture, 'DELETE', removePath).at(-1)?.status).toBe(409);
    await capture.settle();
    await expect(chapterRow).toContainText(/incluido en la posición/iu,
      'a rejected chapter action leaves the membership unchanged');
    const detailRecovery = page.locator('[data-owner-series-chapters] [data-owner-recovery]');
    await expect(detailRecovery).toBeVisible('the chapter detail owns the recovery for its failed no-field action');
    const detailDecision = detailRecovery.getByRole('button', { name: 'Usar lo guardado', exact: true });
    await expect(detailDecision).toBeFocused();
    await detailDecision.press('Enter');
    await expect(detailRecovery).toHaveCount(0);
    assert.equal(writesFor(capture, 'DELETE', removePath).length, 1,
      'resolving a rejected chapter removal never retries the DELETE');
    const afterChapterRejection = await readOwnerSnapshot(fixture, cookie);
    assert.deepEqual(afterChapterRejection.series[target.id].chapters, [chapter.placementId],
      'the real rejection has no effect on chapter membership');
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Series: el slug usa validación nativa y acepta segmentos con guiones sencillos', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  await openSeriesView(page, fixture);
  await page.getByRole('button', { name: 'Crear serie' }).click();
  const form = seriesForm(page);
  const slug = form.getByLabel('Dirección de la serie');
  const save = form.getByRole('button', { name: 'Guardar serie' });
  const invalidSlugs = ['ana serie', 'ana--serie', '-ana', 'ana-'];

  for (const [index, value] of invalidSlugs.entries()) {
    await form.getByLabel('Nombre de la serie').fill(`Inválida ${index}`);
    await slug.fill(value);
    const validity = await slug.evaluate((input) => ({
      valid: input.checkValidity(),
      patternMismatch: input.validity.patternMismatch,
      valueMissing: input.validity.valueMissing,
      tooShort: input.validity.tooShort,
    }));
    assert.deepEqual(validity, { valid: false, patternMismatch: true, valueMissing: false, tooShort: false });
    const writesBefore = capture.writes().length;
    await save.click();
    await expect(form).toBeVisible();
    await expect(slug).toBeFocused();
    if (index === 0) {
      await expect(slug).toHaveAttribute('aria-invalid', 'true',
        'a browser-native slug rejection is exposed as an invalid field, not only through the browser bubble');
      const describedBy = await slug.getAttribute('aria-describedby');
      assert.ok(describedBy, 'the native slug rejection has an accessible description reference');
      const descriptionIds = describedBy.trim().split(/\s+/u);
      for (const id of descriptionIds) await expect(form.locator(`[id="${id}"]`)).toBeVisible();
      const error = form.locator('[data-owner-field-error]').filter({ hasText: /dirección/iu });
      await expect(error).toBeVisible();
      assert.ok(descriptionIds.includes(await error.getAttribute('id')),
        'the native slug error is one of the descriptions announced for the slug input');
    }
    assert.equal(capture.writes().length, writesBefore,
      `native form validation blocks the invalid slug ${JSON.stringify(value)} before any API write`);
  }

  for (const [index, value] of ['ana', 'serie-2026', 'abc-1-def'].entries()) {
    await form.getByLabel('Nombre de la serie').fill(`Ruta válida ${index + 1}`);
    await slug.fill(value);
    assert.equal(await slug.evaluate((input) => input.checkValidity()), true,
      `${value} is accepted by the browser's native input constraints`);
    await save.click();
    await capture.settle({ skipErrorBodies: true });
    const writes = writesFor(capture, 'POST', '/api/creador/series');
    assert.equal(writes.length, index + 1);
    assert.equal(writes.at(-1).status, 201);
    assert.equal(writes.at(-1).body.creatorVersion > 0, true);
    assert.deepEqual(Object.keys(writes.at(-1).body).sort(), ['creatorVersion', 'name', 'slug']);
    assert.equal(writes.at(-1).body.name, `Ruta válida ${index + 1}`);
    assert.equal(writes.at(-1).body.slug, value);
    assert.equal(writes.at(-1).responseBody.operation, 'create-series');
    assert.equal(writes.at(-1).responseBody.schemaVersion, 2);
    assert.equal(writes.at(-1).responseBody.disposition, 'created');
    assert.equal(writes.at(-1).responseBody.creatorVersion, writes.at(-1).body.creatorVersion + 1);
    assert.equal(Object.hasOwn(writes.at(-1).responseBody, 'series'), false);
    const created = { id: writes.at(-1).responseBody.seriesId };
    assert.ok(created.id);
    assert.equal((await fixture.rawSeries(cookie, created.id)).slug, value);
    if (index < 2) {
      await page.getByRole('button', { name: 'Crear serie' }).click();
      await expect(form).toBeVisible();
    }
  }
  assert.equal(capture.writes().filter(({ method }) => method === 'POST').length, 3,
    'only the three natively valid slugs reach the real series API');
  await capture.stop({ skipErrorBodies: true });
});

test('Series: un slug reservado en alta conserva el formulario, cancela Guardar y salir y permite corregirlo', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const reserved = await createSeries(fixture, cookie, {
    name: 'Serie ya reservada', slug: 'serie-ya-reservada', description: 'La serie existente conserva su texto.',
  });
  const before = await readOwnerSnapshot(fixture, cookie);
  const capture = await captureCreatorApi(page);
  try {
    await openSeriesView(page, fixture);
    await page.getByRole('button', { name: 'Crear serie', exact: true }).click();
    const form = seriesForm(page);
    const name = form.getByLabel('Nombre de la serie', { exact: true });
    const slug = form.getByLabel('Dirección de la serie', { exact: true });
    const description = form.getByLabel(/Descripción/iu);
    await name.fill('Borrador de serie retenido');
    await slug.fill(reserved.slug);
    await description.fill('Descripción que debe seguir visible después del rechazo.');
    await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const exit = page.locator('[data-owner-exit-prompt]');
    await expect(exit).toBeVisible();
    await exit.getByRole('button', { name: 'Guardar y salir', exact: true }).click();

    await expect.poll(() => writesFor(capture, 'POST', '/api/creador/series').at(-1)?.status).toBe(409);
    await capture.settle();
    const rejection = writesFor(capture, 'POST', '/api/creador/series').at(-1);
    assert.equal(rejection.responseBody?.error, 'SERIES_SLUG_TAKEN');
    await expect(form).toBeVisible('the failed Guardar y salir returns to the series editor');
    await expect(exit).toHaveCount(0, 'a definitive series rejection must not resurrect the exit prompt');
    await expect(name).toHaveValue('Borrador de serie retenido');
    await expect(slug).toHaveValue(reserved.slug);
    await expect(description).toHaveValue('Descripción que debe seguir visible después del rechazo.');
    await expect(slug).toBeFocused();
    await expect(slug).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await slug.getAttribute('aria-describedby');
    assert.ok(describedBy, 'the reserved series slug has an accessible description reference');
    const descriptionIds = describedBy.trim().split(/\s+/u);
    for (const id of descriptionIds) await expect(form.locator(`[id="${id}"]`)).toBeVisible();
    const error = form.locator('[data-owner-field-error]').filter({ hasText: 'Esa dirección ya está reservada. Elige otra.' });
    await expect(error).toBeVisible();
    assert.ok(descriptionIds.includes(await error.getAttribute('id')),
      'the reserved slug error is associated with the editable slug input');
    assert.equal(Object.keys((await readOwnerSnapshot(fixture, cookie)).series).length, Object.keys(before.series).length,
      'the definitive reservation rejection creates no series');

    await slug.fill('serie-corregida-en-alta');
    await expect(slug).not.toHaveAttribute('aria-invalid', 'true');
    await expect(error).toBeHidden();
    await form.getByRole('button', { name: 'Guardar serie', exact: true }).click();
    await expect.poll(() => writesFor(capture, 'POST', '/api/creador/series').length).toBe(2);
    await expect.poll(() => writesFor(capture, 'POST', '/api/creador/series').at(-1)?.status).toBe(201);
    await expect(form).toHaveCount(0);
    await expect(page.locator('[data-owner-exit-prompt]')).toHaveCount(0);
    const after = await readOwnerSnapshot(fixture, cookie);
    const created = Object.values(after.series).find(({ slug: value }) => value === 'serie-corregida-en-alta');
    assert.ok(created, 'the corrected slug is persisted as a new series');
    assert.equal(created.name, 'Borrador de serie retenido');
    assert.equal(created.description, 'Descripción que debe seguir visible después del rechazo.');
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Series: un slug reservado al editar conserva todos los campos y persiste la corrección', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const target = await createSeries(fixture, cookie, {
    name: 'Serie que se edita', slug: 'serie-que-se-edita', description: 'Descripción original.',
  });
  const reserved = await createSeries(fixture, cookie, {
    name: 'Otra serie reservada', slug: 'otra-serie-reservada', description: 'No modificar.',
  });
  const capture = await captureCreatorApi(page);
  try {
    await openSeriesView(page, fixture);
    await seriesRow(page, target.id).locator('[data-series-edit]').click();
    const form = seriesForm(page);
    const name = form.getByLabel('Nombre de la serie', { exact: true });
    const slug = form.getByLabel('Dirección de la serie', { exact: true });
    const description = form.getByLabel(/Descripción/iu);
    await name.fill('Serie editada retenida');
    await slug.fill(reserved.slug);
    await description.fill('Descripción editada que se conserva.');
    await form.getByRole('button', { name: 'Guardar serie', exact: true }).click();
    await expect.poll(() => writesFor(capture, 'PATCH', `/api/creador/series/${target.id}`).at(-1)?.status).toBe(409);
    await capture.settle();
    const rejection = writesFor(capture, 'PATCH', `/api/creador/series/${target.id}`).at(-1);
    assert.equal(rejection.responseBody?.error, 'SERIES_SLUG_TAKEN');
    await expect(form).toBeVisible();
    await expect(name).toHaveValue('Serie editada retenida');
    await expect(slug).toHaveValue(reserved.slug);
    await expect(description).toHaveValue('Descripción editada que se conserva.');
    await expect(slug).toBeFocused();
    await expect(slug).toHaveAttribute('aria-invalid', 'true');
    const error = form.locator('[data-owner-field-error]').filter({ hasText: 'Esa dirección ya está reservada. Elige otra.' });
    await expect(error).toBeVisible();
    const describedBy = await slug.getAttribute('aria-describedby');
    assert.ok(describedBy?.split(/\s+/u).includes(await error.getAttribute('id')),
      'the edit rejection remains associated with the slug field');
    const savedAfterReject = await readOwnerSnapshot(fixture, cookie);
    assert.equal(savedAfterReject.series[target.id].slug, target.slug);
    assert.equal(savedAfterReject.series[target.id].name, target.name);
    assert.equal(savedAfterReject.series[target.id].description, target.description);

    await slug.fill('serie-editada-correctamente');
    await expect(slug).not.toHaveAttribute('aria-invalid', 'true');
    await expect(error).toBeHidden();
    await form.getByRole('button', { name: 'Guardar serie', exact: true }).click();
    await expect.poll(() => writesFor(capture, 'PATCH', `/api/creador/series/${target.id}`).length).toBe(2);
    await expect.poll(() => writesFor(capture, 'PATCH', `/api/creador/series/${target.id}`).at(-1)?.status).toBe(200);
    await expect(form).toHaveCount(0);
    const saved = await readOwnerSnapshot(fixture, cookie);
    assert.deepEqual(saved.series[target.id], {
      ...saved.series[target.id],
      name: 'Serie editada retenida',
      slug: 'serie-editada-correctamente',
      description: 'Descripción editada que se conserva.',
    });
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Series: el ordinal de mover capítulo referencia una descripción visible dentro de su diálogo', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Serie descrita', slug: 'serie-descrita' });
  const first = await addLink(fixture, cookie, { title: 'Primer capítulo', url: 'https://links.example/primero' });
  const second = await addLink(fixture, cookie, { title: 'Segundo capítulo', url: 'https://links.example/segundo' });
  await addChapter(fixture, cookie, series.id, first.placementId);
  await addChapter(fixture, cookie, series.id, second.placementId);
  await openSeriesView(page, fixture, `&serie=${encodeURIComponent(series.id)}`);

  await page.locator(`[data-chapter-row="${first.placementId}"] [data-chapter-move]`).click();
  const dialog = page.locator('[data-owner-dialog]');
  const form = dialog.locator('form[data-owner-form="mover-capitulo"]');
  await expect(dialog).toBeVisible();
  await expect(form).toBeVisible();
  const ordinal = form.getByLabel('Posición en esta serie');
  const referenceText = await ordinal.getAttribute('aria-describedby');
  assert.ok(referenceText, 'the ordinal field has an accessible description reference');
  const referenceIds = referenceText.trim().split(/\s+/u);
  assert.ok(referenceIds.length > 0);
  for (const id of referenceIds) {
    const description = form.locator(`[id="${id}"]`);
    await expect(description).toHaveCount(1);
    await expect(description).toBeVisible();
  }
  assert.deepEqual(await ordinal.evaluate((input, ids) => {
    const ownDialog = input.closest('[data-owner-dialog]');
    return {
      inDialog: Boolean(ownDialog),
      referencesInDialog: ids.map((id) => {
        const target = document.getElementById(id);
        return Boolean(target && ownDialog?.contains(target));
      }),
    };
  }, referenceIds), {
    inDialog: true,
    referencesInDialog: referenceIds.map(() => true),
  }, 'every aria-describedby target belongs to the same visible chapter-move dialog');
  const description = form.locator(`[id="${referenceIds[0]}"]`);
  await expect(description).toContainText(series.name);
  await expect(description).toContainText(/posición actual 1 de 2/i);
});

test('Series: el enlace de capítulos conserva clic modificado y la guardia permite Seguir o Descartar al navegar', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Serie con navegación', slug: 'serie-navegacion' });
  const link = await addLink(fixture, cookie, { title: 'Capítulo de navegación', url: 'https://links.example/navegacion' });
  await addChapter(fixture, cookie, series.id, link.placementId);
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  await openSeriesView(page, fixture);

  const chapters = seriesRow(page, series.id).locator('[data-series-chapters]');
  const listUrl = page.url();
  const destination = new URL(await chapters.getAttribute('href'), listUrl).href;
  const openedPagePromise = page.context().waitForEvent('page');
  await chapters.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  const openedPage = await openedPagePromise;
  await expect(openedPage).toHaveURL(destination);
  await expect(openedPage.locator('[data-series-context-name]')).toHaveText(series.name);
  assert.equal(page.url(), listUrl, 'a modified native link leaves the current list untouched');
  await openedPage.close();

  await chapters.click();
  await expect(page.locator('[data-series-context-name]')).toHaveText(series.name);
  const chapterUrl = page.url();
  await page.locator('[data-series-back]').click();
  await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-series-context-name]')).toHaveText(series.name);
  await page.goForward();
  await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(chapterUrl);

  await page.locator('[data-owner-series-chapters] [data-series-edit]').click();
  const form = seriesForm(page);
  await expect(form).toBeVisible();
  await form.getByLabel('Nombre de la serie').fill('Nombre sin guardar');
  await form.getByRole('button', { name: 'Cancelar' }).click();
  const exitPrompt = page.locator('[data-owner-exit-prompt]');
  await expect(exitPrompt).toBeVisible();
  await exitPrompt.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page).toHaveURL(chapterUrl);
  await expect(form.getByLabel('Nombre de la serie')).toHaveValue('Nombre sin guardar');

  const back = page.goBack();
  await expect(exitPrompt).toBeVisible();
  await exitPrompt.getByRole('button', { name: 'Descartar cambios' }).click();
  await back;
  await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
  await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
  assert.equal(capture.writes().length, 0, 'continuing and discarding navigation never saves the unsaved correction');

  await page.goForward();
  await expect(page.locator('[data-series-context-name]')).toHaveText(series.name);
  await expect(page.locator(`[data-chapter-row="${link.placementId}"] [data-chapter-remove]`)).toBeVisible();
  await capture.stop({ skipErrorBodies: true });
});

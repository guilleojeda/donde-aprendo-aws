import assert from 'node:assert/strict';
import {
  test, expect, api, readOwnerSnapshot, createSeries, addLink, addChapter, captureCreatorApi, seriesRow, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';
import { rasterPhotoFixtures } from '../fixtures/creator-photos.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function ownerPath(request) {
  return new URL(request.url()).pathname.replace(/\/$/u, '');
}

function fixtureSessionKey(fixture) {
  const keys = [...fixture.accountStore.sessions.keys()].filter((key) => key.startsWith('SESSION#'));
  assert.equal(keys.length, 1, 'the browser fixture has one real authenticated session');
  return keys[0];
}

function isAbandonedNavigationError(error) {
  return /net::ERR_ABORTED|navigation cancelled by beforeunload dialog|Target page, context or browser has been closed/iu.test(String(error));
}

function ownerWrites(capture, method = 'PUT') {
  return capture.writes().filter(({ method: actualMethod, path }) => actualMethod === method && path === '/api/creador/perfil');
}

function ownerReads(capture) {
  return capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil');
}

async function installPhotoProvider({ fixture, page, bytes, afterPost }) {
  const uploads = [];
  await page.route('https://creator-photos.example.invalid/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': fixture.origin,
        'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '' } });
    }
    assert.equal(request.method(), 'POST');
    const multipart = request.postDataBuffer();
    assert.ok(multipart.includes(bytes), 'the selected photo bytes reach the authorized upload');
    const key = multipart.toString('latin1').match(/Content-Disposition: form-data; name="key"\r\n\r\n([^\r\n]+)/u)?.[1];
    assert.ok(key, 'the upload uses the key from its authorization');
    fixture.photoObjects.seed(key, bytes);
    uploads.push({ key, multipart });
    await afterPost?.(uploads.length);
    return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': fixture.origin } });
  });
  return uploads;
}

function trackProfileWrites(page) {
  const requests = [];
  const responses = [];
  const onRequest = (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
      && ownerPath(request) === '/api/creador/perfil') requests.push(request);
  };
  const onResponse = (response) => {
    const request = response.request();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
      && ownerPath(request) === '/api/creador/perfil') {
      responses.push({ status: response.status() });
    }
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  return {
    requests,
    responses,
    stop() {
      page.off('request', onRequest);
      page.off('response', onResponse);
    },
  };
}

async function openEditor(page, fixture, view = 'enlaces') {
  await page.goto(`${fixture.origin}/cuenta/?vista=${view}`);
  await expect(page.locator('[data-owner-root]')).toBeVisible();
  await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
  const form = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
  await expect(form).toBeVisible();
  return form;
}

async function holdProfileWriteAfterCommit(page) {
  const entered = deferred();
  const release = deferred();
  const finished = deferred();
  let started = false;
  let actual;
  const handler = async (route) => {
    const request = route.request();
    if (started || request.method() !== 'PUT' || ownerPath(request) !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    started = true;
    try {
      const response = await route.fetch();
      const body = await response.body();
      actual = { status: response.status() };
      entered.resolve();
      await release.promise;
      await route.fulfill({ status: response.status(), headers: response.headers(), body });
    } finally {
      finished.resolve();
    }
  };
  await page.route('**/api/creador/**', handler);
  return {
    entered: entered.promise,
    finished: finished.promise,
    get actual() { return actual; },
    release: () => release.resolve(),
    async remove() {
      release.resolve();
      if (started) await finished.promise;
      await page.unroute('**/api/creador/**', handler).catch(() => {});
    },
  };
}

async function holdProfileWriteAndLoseAcknowledgement(page) {
  const entered = deferred();
  const release = deferred();
  const finished = deferred();
  let started = false;
  let actual;
  const handler = async (route) => {
    const request = route.request();
    if (started || request.method() !== 'PUT' || ownerPath(request) !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    started = true;
    try {
      const response = await route.fetch();
      const body = await response.body();
      actual = { status: response.status(), body };
      entered.resolve();
      await release.promise;
      await route.abort();
    } finally {
      finished.resolve();
    }
  };
  await page.route('**/api/creador/**', handler);
  return {
    entered: entered.promise,
    finished: finished.promise,
    get actual() { return actual; },
    release: () => release.resolve(),
    async remove() {
      release.resolve();
      if (started) await finished.promise;
      await page.unroute('**/api/creador/**', handler).catch(() => {});
    },
  };
}

async function holdNextOwnerRead(page) {
  const entered = deferred();
  const release = deferred();
  const finished = deferred();
  let started = false;
  let actual;
  let handlerError;
  const handler = async (route) => {
    const request = route.request();
    if (started || request.method() !== 'GET' || ownerPath(request) !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    started = true;
    try {
      const response = await route.fetch();
      const body = await response.body();
      actual = { status: response.status(), body: JSON.parse(body.toString('utf8')) };
      entered.resolve();
      await release.promise;
      await route.fulfill({ status: response.status(), headers: response.headers(), body });
    } catch (error) {
      handlerError = error;
      entered.resolve();
    } finally {
      finished.resolve();
    }
  };
  await page.route('**/api/creador/**', handler);
  return {
    entered: entered.promise,
    finished: finished.promise,
    get actual() { return actual; },
    release: () => release.resolve(),
    async remove() {
      release.resolve();
      if (started) await finished.promise;
      await page.unroute('**/api/creador/**', handler).catch(() => {});
      if (handlerError) throw handlerError;
    },
  };
}

async function pauseNextOwnerReadBeforeFetch(page) {
  const entered = deferred();
  const release = deferred();
  const finished = deferred();
  let started = false;
  let actual;
  let handlerError;
  const handler = async (route) => {
    const request = route.request();
    if (started || request.method() !== 'GET' || ownerPath(request) !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    started = true;
    entered.resolve();
    try {
      await release.promise;
      const response = await route.fetch();
      const body = await response.json();
      actual = { status: response.status(), body };
      await route.fulfill({ response, json: body });
    } catch (error) {
      handlerError = error;
    } finally {
      finished.resolve();
    }
  };
  await page.route('**/api/creador/**', handler);
  return {
    entered: entered.promise,
    finished: finished.promise,
    get actual() { return actual; },
    release: () => release.resolve(),
    async remove() {
      release.resolve();
      if (started) await finished.promise;
      await page.unroute('**/api/creador/**', handler).catch(() => {});
      if (handlerError) throw handlerError;
    },
  };
}

async function failNextOwnerRead(page) {
  let reads = 0;
  let actual;
  const entered = deferred();
  const handler = async (route) => {
    const request = route.request();
    if (request.method() !== 'GET' || ownerPath(request) !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    reads += 1;
    const response = await route.fetch();
    actual = { status: response.status() };
    entered.resolve();
    await route.fulfill({ response, status: 503 });
  };
  await page.route('**/api/creador/**', handler);
  return {
    entered: entered.promise,
    get reads() { return reads; },
    get actual() { return actual; },
    async remove() { await page.unroute('**/api/creador/**', handler).catch(() => {}); },
  };
}

test('una lectura fallida cancela la salida aunque después se confirme el guardado', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  const destination = page.url();
  await page.locator('#owner-link-order').selectOption('titulo-desc');
  await expect(page).toHaveURL(/orden=titulo-desc/u);
  const startingUrl = page.url();
  await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
  const form = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
  await form.getByLabel(/Ciudad/u).fill('Córdoba');
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const read = await failNextOwnerRead(page);
  try {
    const back = page.goBack();
    const prompt = page.locator('[data-owner-exit-prompt]');
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Guardar y salir', exact: true }).click();
    await read.entered;
    await expect.poll(() => ownerWrites(capture)[0]?.status).toBe(200);
    await expect(form.getByLabel(/Ciudad/u)).toHaveValue('Córdoba');
    const retry = page.getByRole('button', { name: 'Reintentar actualización', exact: true });
    await expect(retry).toBeVisible();
    await back;
    await expect(page).toHaveURL(startingUrl);
    assert.equal(read.actual.status, 200, 'only the delivered read failed, after the real save and GET');
    await read.remove();
    await retry.click();
    await expect(form).toHaveCount(0);
    await expect(page).toHaveURL(startingUrl);
    const saved = await api(fixture, cookie, '/api/creador/perfil/');
    assert.equal(saved.body.profile.city, 'Córdoba');
    assert.equal(ownerWrites(capture).length, 1, 'retrying the read does not save again');
    await page.goBack();
    await expect(page).toHaveURL(destination);
  } finally {
    await read.remove();
    await capture.stop({ skipErrorBodies: true });
  }
});

test('perder la autoridad sobre una ficha retirada bloquea guardar y conserva el borrador', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const added = await addLink(fixture, cookie);
  const removed = await api(fixture, cookie, `/api/creador/enlaces/${added.placementId}`, {
    method: 'DELETE', body: { creatorVersion: added.creatorVersion },
  });
  assert.equal(removed.response.status, 200);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await page.locator(`[data-retained-resource="${added.resourceId}"]`).getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const form = page.locator('[data-owner-dialog][open] form[data-owner-form="enlace"]');
  const title = form.getByLabel('Título', { exact: true });
  await title.fill('  Borrador sin autoridad vigente  ');
  const resource = await fixture.rawResource(added.resourceId);
  const reassigned = { ...resource, editorProfileId: 'other-creator-fixture', version: resource.version + 1 };
  const key = `resource:${added.resourceId}`;
  assert.equal(await fixture.creatorStore.transact({
    checks: [{ key, version: resource.version }],
    puts: [{ key, value: reassigned }],
  }), true);
  const capture = await captureCreatorApi(page);
  try {
    await form.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
    await expect.poll(() => capture.writes()[0]?.status).toBe(403);
    assert.equal(capture.writes()[0].responseBody.error, 'RESOURCE_EDIT_FORBIDDEN');
    await expect.poll(() => ownerReads(capture)[0]?.status).toBe(200);
    await expect(page.getByText(/No se puede guardar este cambio con el destino actual/u)).toBeVisible();
    await expect(title).toHaveValue('  Borrador sin autoridad vigente  ');
    await expect(title).toHaveAttribute('readonly', '');
    await expect(title).toBeEnabled();
    await expect(form.getByRole('button', { name: 'Guardar mi borrador', exact: true })).toHaveCount(0);
    assert.deepEqual(await fixture.rawResource(added.resourceId), reassigned);
    assert.equal(capture.writes().length, 1);
    await form.getByRole('button', { name: 'Usar lo guardado', exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(page.locator(`[data-retained-resource="${added.resourceId}"]`)).toHaveCount(0);
  } finally {
    await capture.stop();
  }
});

async function openSeriesView(page, fixture, params = '') {
  await page.goto(`${fixture.origin}/cuenta/?vista=series${params}`);
  await expect(page.locator('[data-owner-root]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Series', exact: true })).toBeVisible();
}

function chapterRow(page, placementId) {
  return page.locator(`[data-chapter-row="${placementId}"]`);
}

async function reconcileChapterChangeWithFailedRead({ fixture, page, operation }) {
  const cookie = await loggedInOwner(fixture, page);
  const target = await createSeries(fixture, cookie, { name: 'Ruta que desaparecerá', slug: 'ruta-que-desaparecera' });
  const survivor = await createSeries(fixture, cookie, { name: 'Ruta para conservar', slug: 'ruta-para-conservar' });
  const chapter = await addLink(fixture, cookie, { title: 'Capítulo confirmado', url: 'https://links.example/confirmado' });
  const capture = await captureCreatorApi(page);
  const selectedQuery = `&buscarSeries=conservar&serie=${encodeURIComponent(target.id)}&buscarCapitulos=&pertenencia=todos&paginaCapitulos=1`;
  await openSeriesView(page, fixture, selectedQuery);
  const row = chapterRow(page, chapter.placementId);

  if (operation === 'remove') {
    await row.getByRole('button', { name: 'Agregar capítulo', exact: true }).click();
    await expect(row).toContainText(/Incluido en la posición/);
  }

  const originalMethod = operation === 'add' ? 'PUT' : 'DELETE';
  const failedRead = await failNextOwnerRead(page);
  const change = row.getByRole('button', {
    name: operation === 'add' ? 'Agregar capítulo' : 'Quitar capítulo', exact: true,
  }).click();
  await failedRead.entered;
  await change;
  const commandPath = `/api/creador/series/${target.id}/capitulos/${chapter.placementId}`;
  const commandWrites = () => capture.writes().filter(({ method, path }) => method === originalMethod && path === commandPath);
  await expect.poll(() => commandWrites()[0]?.status).toBe(200);
  assert.equal(failedRead.reads, 1, 'the same document attempted one complete owner read after acknowledgement');
  assert.equal(failedRead.actual.status, 200, 'the read failure was delivered only after the real owner GET completed');
  await expect(row).toContainText(operation === 'add' ? 'Disponible para agregar' : /Incluido en la posición/,
    'the confirmed operation does not locally patch the stale list');
  await expect(page.getByText(new RegExp(`Capítulo ${operation === 'add' ? 'agregado' : 'quitado'}\\. No pudimos actualizar la lista`, 'iu')))
    .toBeVisible();
  await expect(row.getByRole('button', { name: /Agregar capítulo|Quitar capítulo/i })).toBeDisabled();

  assert.equal(commandWrites().length, 1, 'the confirmed chapter command is sent once');
  await failedRead.remove();

  const otherPage = await page.context().newPage();
  const otherCapture = await captureCreatorApi(otherPage);
  try {
    await openSeriesView(otherPage, fixture);
    const deleteConfirmation = otherPage.waitForEvent('dialog');
    const deleteClick = seriesRow(otherPage, target.id).locator('[data-series-delete]').click();
    const dialog = await deleteConfirmation;
    await dialog.accept();
    await deleteClick;
    await expect(seriesRow(otherPage, target.id)).toHaveCount(0);
    await expect(seriesRow(otherPage, survivor.id)).toBeVisible();
  } finally {
    await otherCapture.stop({ skipErrorBodies: true });
    await otherPage.close();
  }

  const retry = page.getByRole('button', { name: 'Reintentar actualización', exact: true });
  await expect(retry).toBeVisible();
  const chapterSearch = page.locator('[data-chapter-search]');
  const heldRetry = await holdNextOwnerRead(page);
  try {
    await retry.click();
    await heldRetry.entered;
    assert.equal(heldRetry.actual.status, 200, 'the explicit retry receives a real complete owner snapshot');
    assert.equal(Object.hasOwn(heldRetry.actual.body.series, target.id), false,
      'the second session removed the selected Series before this GET');
    await chapterSearch.fill('Búsqueda mientras se actualiza');
    await expect(chapterSearch).toBeFocused();
    heldRetry.release();
    await heldRetry.finished;
  } finally {
    await heldRetry.remove();
  }
  await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
  await expect(seriesRow(page, survivor.id)).toBeVisible();
  await expect(page).toHaveURL((url) => url.searchParams.get('buscarSeries') === 'conservar'
    && !url.searchParams.has('serie'));
  assert.equal(commandWrites().length, 1, 'retrying the complete read never replays the chapter command');

  const listHeading = page.locator('#owner-series-title');
  await expect(listHeading).toBeFocused();
  const profileReadsBeforeNextAction = capture.records.filter(({ method, path, status }) => method === 'GET'
    && path === '/api/creador/perfil' && status === 200).length;
  await page.getByRole('button', { name: 'Crear serie', exact: true }).click();
  const newSeries = page.locator('[data-owner-dialog] form[data-owner-form="serie"]');
  await newSeries.getByLabel('Nombre de la serie').fill('Ruta para conservar después');
  await newSeries.getByLabel('Dirección de la serie').fill('ruta-para-conservar-despues');
  await newSeries.getByRole('button', { name: 'Guardar serie', exact: true }).click();
  await expect.poll(() => capture.records.filter(({ method, path, status }) => method === 'GET'
    && path === '/api/creador/perfil' && status === 200).length).toBeGreaterThan(profileReadsBeforeNextAction);
  await expect(page.locator('[data-owner-series-row]').filter({ hasText: 'Ruta para conservar después' })).toBeVisible();
  assert.equal(commandWrites().length, 1, 'a later manual action uses the new Series and does not replay the old one');
  const nextSeriesWrite = capture.writes().find(({ method, path }) => method === 'POST' && path === '/api/creador/series');
  assert.equal(nextSeriesWrite?.status, 201, 'the later operation reaches the real command service');
  await capture.stop({ skipErrorBodies: true });
}

test('el foco permanece en el buscador de capítulos si la lectura conserva la serie', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Ruta que sigue vigente', slug: 'ruta-sigue-vigente' });
  const chapter = await addLink(fixture, cookie, { title: 'Capítulo con foco', url: 'https://links.example/foco-capitulo' });
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let read;
  try {
    await openSeriesView(page, fixture, `&buscarSeries=vigente&serie=${encodeURIComponent(series.id)}&buscarCapitulos=Cap%C3%ADtulo`);
    const search = page.locator('[data-chapter-search]');
    await expect(search).toBeVisible();
    read = await holdNextOwnerRead(page);
    const add = page.locator(`[data-chapter-row="${chapter.placementId}"] [data-chapter-add]`).click();
    await read.entered;
    assert.equal(read.actual.status, 200, 'the full read follows the committed chapter command');
    assert.deepEqual(read.actual.body.series[series.id].chapters, [chapter.placementId]);
    await search.focus();
    await expect(search).toBeFocused();
    read.release();
    await add;
    await read.finished;
    await expect(search).toBeVisible();
    await expect(search).toHaveValue('Capítulo');
    await expect(search).toBeFocused();
    await expect(page).toHaveURL((url) => url.searchParams.get('serie') === series.id
      && url.searchParams.get('buscarSeries') === 'vigente'
      && url.searchParams.get('buscarCapitulos') === 'Capítulo');
    await expect(page.locator(`[data-chapter-row="${chapter.placementId}"] [data-chapter-remove]`)).toBeVisible();
    assert.deepEqual(capture.writes().map(({ method, path, status }) => [method, path, status]), [
      ['PUT', `/api/creador/series/${series.id}/capitulos/${chapter.placementId}`, 200],
    ], 'installing the full snapshot does not replay the confirmed chapter command');
  } finally {
    read?.release();
    await read?.remove();
    await capture.stop({ skipErrorBodies: true });
  }
});

async function recoverChapterAfterBack({ fixture, page, operation, malformedBack = false }) {
  const cookie = await loggedInOwner(fixture, page);
  const target = await createSeries(fixture, cookie, { name: 'Ruta de recuperación', slug: 'ruta-de-recuperacion' });
  const unrelated = await createSeries(fixture, cookie, { name: 'Otra ruta intacta', slug: 'otra-ruta-intacta' });
  const chapter = await addLink(fixture, cookie, { title: 'Capítulo confirmado en servidor', url: 'https://links.example/back-recovery' });
  await addChapter(fixture, cookie, unrelated.id, chapter.placementId);
  if (operation === 'remove') await addChapter(fixture, cookie, target.id, chapter.placementId);
  const before = await readOwnerSnapshot(fixture, cookie);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let failedRead;
  try {
    const validListUrl = `${fixture.origin}/cuenta/?vista=series&buscarSeries=Ruta`;
    if (malformedBack) {
      await page.goto(`${fixture.origin}/cuenta/?vista=series&paginaSeries=0`);
      await expect(page.locator('[data-series-query-error]')).toBeVisible();
      await page.locator('[data-owner-navigation][href="/cuenta/?vista=series"]').click();
      await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
      await expect(page).toHaveURL((url) => url.searchParams.get('vista') === 'series'
        && !url.searchParams.has('paginaSeries') && !url.searchParams.has('serie'));
    } else await page.goto(validListUrl);
    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    const targetRow = seriesRow(page, target.id);
    const staleVisibleCount = operation === 'add' ? '0 capítulos visibles' : '1 capítulo visible';
    await expect(targetRow).toContainText(staleVisibleCount);
    await targetRow.getByRole('link', { name: 'Gestionar capítulos', exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('serie') === target.id);

    failedRead = await failNextOwnerRead(page);
    const row = page.locator(`[data-chapter-row="${chapter.placementId}"]`);
    const method = operation === 'add' ? 'PUT' : 'DELETE';
    const path = `/api/creador/series/${target.id}/capitulos/${chapter.placementId}`;
    await row.getByRole('button', { name: operation === 'add' ? 'Agregar capítulo' : 'Quitar capítulo', exact: true }).click();
    await failedRead.entered;
    await expect.poll(() => capture.writes().find((write) => write.method === method && write.path === path)?.status).toBe(200);
    assert.equal(failedRead.actual.status, 200, 'the app only loses the response after the real full owner GET succeeds');
    const committed = await readOwnerSnapshot(fixture, cookie);
    assert.equal(committed.creatorVersion, before.creatorVersion + 1);
    assert.deepEqual(committed.series[target.id].chapters, operation === 'add' ? [chapter.placementId] : []);
    assert.deepEqual(committed.series[unrelated.id].chapters, [chapter.placementId], 'the unrelated membership survives');
    assert.equal(capture.writes().length, 1, 'the acknowledged chapter command is sent exactly once');

    await page.evaluate((steps) => window.history.go(steps), malformedBack ? -2 : -1);
    const exit = page.locator('[data-owner-exit-prompt]');
    await expect(exit).toBeVisible();
    await exit.getByRole('button', { name: 'Descartar y seguir', exact: true }).click();
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin, 'native Back keeps the owner document alive');
    const recovery = page.locator('[data-owner-list-recovery="series"][data-owner-stale="true"]');
    await expect(recovery).toBeVisible();
    if (malformedBack) {
      await expect(page).toHaveURL((url) => url.searchParams.get('paginaSeries') === '0' && !url.searchParams.has('serie'));
      await expect(page.locator('[data-series-query-error]')).toBeVisible();
      await expect(page.locator('[data-owner-series-list-view]')).toBeHidden();
    } else {
      await expect(page).toHaveURL((url) => !url.searchParams.has('serie'));
      await expect(seriesRow(page, target.id)).toContainText(staleVisibleCount, 'the list remains read-only on its older coherent snapshot');
    }
    const retry = recovery.getByRole('button', { name: 'Reintentar actualización', exact: true });
    await expect(retry).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Crear serie', exact: true })).toBeDisabled();
    assert.deepEqual(capture.writes().map(({ method: writeMethod, path: writePath }) => [writeMethod, writePath]), [[method, path]],
      'discarding navigation neither replays the chapter write nor enables a dependent write');

    await failedRead.remove();
    let heldRead;
    let unrelatedFocus;
    if (malformedBack && operation === 'remove') {
      heldRead = await holdNextOwnerRead(page);
      await retry.focus();
      await retry.press('Enter');
      await heldRead.entered;
      unrelatedFocus = page.locator('.creator-owner__account-menu summary');
      await unrelatedFocus.focus();
      heldRead.release();
      await heldRead.finished;
      await expect(unrelatedFocus).toBeFocused();
    } else if (malformedBack) {
      await retry.focus();
      await retry.press('Enter');
    } else {
      await retry.focus();
      await retry.press('Enter');
    }
    await expect.poll(() => capture.records.filter(({ method: readMethod, path: readPath, status }) => readMethod === 'GET'
      && readPath === '/api/creador/perfil' && status === 200).length).toBe(1);
    await expect(page.locator('[data-owner-list-recovery]')).toHaveCount(0);
    if (malformedBack) {
      await expect(page.locator('[data-series-query-error]')).toBeVisible();
      await expect(page).toHaveURL((url) => url.searchParams.get('vista') === 'series'
        && url.searchParams.get('paginaSeries') === '0' && !url.searchParams.has('serie'));
      await expect(page.locator('[data-owner-series-list-view]')).toBeHidden();
      if (operation === 'add') await expect(page.locator('#owner-series-title')).toBeFocused();
      else await expect(unrelatedFocus).toBeFocused();
      await expect(page.getByRole('button', { name: 'Crear serie', exact: true })).toBeEnabled();
      await page.getByRole('link', { name: 'Series', exact: true }).click();
      await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
      await expect(page).toHaveURL((url) => !url.searchParams.has('paginaSeries') && !url.searchParams.has('serie'));
    } else {
      await expect(page.getByRole('button', { name: 'Crear serie', exact: true })).toBeEnabled();
      if (operation === 'add') await expect(page.locator('#owner-series-title')).toBeFocused();
    }
    const installedVersion = Number(await page.locator('[data-owner-root]').getAttribute('data-creator-version'));
    const installed = await readOwnerSnapshot(fixture, cookie);
    assert.equal(installedVersion, installed.creatorVersion, 'the page installs the newer complete server snapshot');
    assert.deepEqual(installed.series[target.id].chapters, operation === 'add' ? [chapter.placementId] : []);
    assert.deepEqual(installed.series[unrelated.id].chapters, [chapter.placementId]);
    assert.deepEqual(capture.records.filter(({ method: readMethod, path: readPath }) => readMethod === 'GET' && readPath === '/api/creador/perfil')
      .map(({ status }) => status), [503, 200], 'Back recovery consists only of the failed delivery and one fresh full GET');
    assert.equal(capture.writes().length, 1, 'installing the fresh snapshot never replays the chapter command');

    await page.getByRole('button', { name: 'Crear serie', exact: true }).click();
    const form = page.locator('[data-owner-dialog][open] form[data-owner-form="serie"]');
    await form.getByLabel('Nombre de la serie').fill('Ruta posterior a la lectura');
    await form.getByLabel('Dirección de la serie').fill('ruta-posterior-a-la-lectura');
    await form.getByRole('button', { name: 'Guardar serie', exact: true }).click();
    await expect.poll(() => capture.writes().find(({ method: writeMethod, path: writePath }) => writeMethod === 'POST'
      && writePath === '/api/creador/series')?.status).toBe(201);
    const final = await readOwnerSnapshot(fixture, cookie);
    assert.ok(Object.values(final.series).some(({ slug }) => slug === 'ruta-posterior-a-la-lectura'), 'the next explicit write commits on the real server');
    assert.deepEqual(final.series[target.id].chapters, operation === 'add' ? [chapter.placementId] : []);
    assert.deepEqual(final.series[unrelated.id].chapters, [chapter.placementId]);
    assert.equal(capture.writes().filter(({ method: writeMethod, path: writePath }) => writeMethod === method && writePath === path).length, 1);
  } finally {
    await failedRead?.remove();
    await capture.stop({ skipErrorBodies: true });
  }
}

async function recoverMoveAfterRangeShrinks({ fixture, page, kind, exitPrompt = false }) {
  const cookie = await loggedInOwner(fixture, page);
  const target = await addLink(fixture, cookie, { title: `Elemento objetivo ${kind}`, url: `https://links.example/move-target-${kind}` });
  const middle = await addLink(fixture, cookie, { title: `Elemento medio ${kind}`, url: `https://links.example/move-middle-${kind}` });
  const removed = await addLink(fixture, cookie, { title: `Elemento que sale ${kind}`, url: `https://links.example/move-removed-${kind}` });
  let series;
  if (kind === 'chapter') {
    series = await createSeries(fixture, cookie, { name: 'Serie para mover capítulo', slug: 'serie-mover-capitulo' });
    await addChapter(fixture, cookie, series.id, target.placementId);
    await addChapter(fixture, cookie, series.id, middle.placementId);
    await addChapter(fixture, cookie, series.id, removed.placementId);
  }
  const before = await readOwnerSnapshot(fixture, cookie);
  const capture = await captureCreatorApi(page);
  const pageUrl = kind === 'link' ? `${fixture.origin}/cuenta/?vista=enlaces`
    : `${fixture.origin}/cuenta/?vista=series&serie=${encodeURIComponent(series.id)}`;
  const movePath = kind === 'link' ? `/api/creador/enlaces/${target.placementId}/mover`
    : `/api/creador/series/${series.id}/capitulos/${target.placementId}/mover`;
  try {
    if (kind === 'link') {
      assert.deepEqual(before.order.ordinary, [target.placementId, middle.placementId, removed.placementId]);
    } else assert.deepEqual(before.series[series.id].chapters, [target.placementId, middle.placementId, removed.placementId]);
    if (exitPrompt && kind === 'chapter') {
      await openSeriesView(page, fixture);
      await seriesRow(page, series.id).locator('[data-series-chapters]').click();
      await expect(page).toHaveURL((url) => url.searchParams.get('serie') === series.id);
    } else if (exitPrompt) {
      await page.goto(pageUrl);
      await page.locator('#owner-link-order').selectOption('titulo-asc');
      await expect(page).toHaveURL(/orden=titulo-asc/u);
      await page.locator('#owner-link-order').selectOption('pagina');
      await expect(page).toHaveURL((url) => url.searchParams.get('orden') !== 'titulo-asc');
    } else await page.goto(pageUrl);
    const editorUrl = page.url();
    const targetRow = kind === 'link' ? page.locator(`[data-link-row="${target.placementId}"]`)
      : page.locator(`[data-chapter-row="${target.placementId}"]`);
    await targetRow.locator(kind === 'link' ? '[data-link-move]' : '[data-chapter-move]').click();
    const form = page.locator(kind === 'link' ? '[data-owner-dialog] form[data-link-move-form]' : '[data-owner-dialog] form[data-chapter-move-form]');
    await expect(form).toBeVisible();
    const position = form.locator(kind === 'link' ? '#owner-link-target-position' : '#owner-chapter-target-position');
    await position.fill('3');

    const removePath = kind === 'link' ? `/api/creador/enlaces/${removed.placementId}`
      : `/api/creador/series/${series.id}/capitulos/${removed.placementId}`;
    const concurrent = await api(fixture, cookie, removePath, { method: 'DELETE', body: { creatorVersion: before.creatorVersion } });
    assert.equal(concurrent.response.status, 200, JSON.stringify(concurrent.body));
    assert.equal(concurrent.body.operation, kind === 'link' ? 'remove-link' : 'remove-chapter');

    await form.getByRole('button', { name: 'Guardar posición', exact: true }).click();
    await expect.poll(() => capture.writes().find(({ method, path }) => method === 'POST' && path === movePath)?.status).toBe(409);
    await expect.poll(() => ownerReads(capture).filter(({ status }) => status === 200).length).toBe(1);
    let correction;
    if (exitPrompt) {
      const back = page.goBack();
      const exit = page.locator('[data-owner-exit-prompt]');
      await expect(exit).toBeVisible();
      await expect(page).toHaveURL(editorUrl, 'the blocked Back returns to the active move editor');
      await back;
      correction = exit.locator('[data-owner-move-draft-correction]');
    } else correction = form.locator('[data-owner-move-draft-correction]');
    await expect(correction).toBeVisible();
    const recoverySurface = exitPrompt ? page.locator('[data-owner-exit-prompt]') : form;
    await expect(recoverySurface.locator('[data-owner-use-saved]')).toBeVisible();
    await expect(form.locator('[data-owner-conflict-save]')).toHaveCount(0,
      'an out-of-range retained move cannot be submitted until its draft is corrected');
    await expect(position).toHaveAttribute('readonly', '');
    await expect(position).toHaveAttribute('max', '2');
    assert.deepEqual(capture.writes().map(({ status }) => status), [409], 'the stale out-of-range move is the only browser write so far');

    await correction.click();
    if (exitPrompt) {
      await expect(page.locator('[data-owner-exit-prompt]')).toHaveCount(0,
        'choosing to correct the draft cancels the pending Back transition');
      await expect(page).toHaveURL(editorUrl);
    }
    await expect(position).not.toHaveAttribute('readonly', '');
    await expect(position, 'the original draft remains available for correction').toHaveValue('3');
    await expect(position).toBeFocused();
    assert.equal(await position.evaluate((input) => input.validity.rangeOverflow), true,
      'the updated native max marks the retained destination as out of range');
    assert.equal(await form.evaluate((element) => element.checkValidity()), false,
      'the restored form uses native range validation before sending another command');
    await form.getByRole('button', { name: 'Guardar posición', exact: true }).click();
    assert.deepEqual(capture.writes().map(({ status }) => status), [409], 'native validation prevents a doomed second request');

    await position.fill('2');
    assert.equal(await form.evaluate((element) => element.checkValidity()), true);
    await form.getByRole('button', { name: 'Guardar posición', exact: true }).click();
    await expect.poll(() => capture.writes().filter(({ method, path }) => method === 'POST' && path === movePath).length).toBe(2);
    await expect.poll(() => capture.writes().filter(({ method, path, status }) => method === 'POST' && path === movePath && status === 200).length).toBe(1);
    await expect.poll(() => ownerReads(capture).filter(({ status }) => status === 200).length).toBe(2);

    const after = await readOwnerSnapshot(fixture, cookie);
    if (kind === 'link') {
      assert.deepEqual(after.order.ordinary, [middle.placementId, target.placementId], 'the corrected move persists the intended order');
      assert.equal(after.placements[removed.placementId], undefined, 'the concurrent removal persists');
    } else {
      assert.deepEqual(after.series[series.id].chapters, [middle.placementId, target.placementId], 'the corrected chapter move persists');
      assert.equal(after.placements[removed.placementId].resourceId, before.placements[removed.placementId].resourceId,
        'removing the chapter from the Series keeps its link placement');
    }
    assert.deepEqual(capture.writes().map(({ method, path, status }) => [method, path, status]), [
      ['POST', movePath, 409], ['POST', movePath, 200],
    ], 'the UI sends one stale move and one corrected move, with no 422 replay');
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
}

test('Back deja terminar y adoptar la lectura completa de un capítulo ya confirmado', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const target = await createSeries(fixture, cookie, { name: 'Ruta con lectura pendiente', slug: 'ruta-lectura-pendiente' });
  const chapter = await addLink(fixture, cookie, { title: 'Capítulo con lectura pendiente', url: 'https://links.example/pending-read' });
  const before = await readOwnerSnapshot(fixture, cookie);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let read;
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series&buscarSeries=pendiente`);
    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    await seriesRow(page, target.id).getByRole('link', { name: 'Gestionar capítulos', exact: true }).click();
    read = await holdNextOwnerRead(page);
    await page.locator(`[data-chapter-row="${chapter.placementId}"]`)
      .getByRole('button', { name: 'Agregar capítulo', exact: true }).click();
    await read.entered;
    await expect.poll(() => capture.writes().find(({ method, path }) => method === 'PUT'
      && path === `/api/creador/series/${target.id}/capitulos/${chapter.placementId}`)?.status).toBe(200);
    assert.equal(read.actual.status, 200, 'the held GET is the real complete owner read after the acknowledged command');
    assert.deepEqual(read.actual.body.series[target.id].chapters, [chapter.placementId]);
    const persisted = await readOwnerSnapshot(fixture, cookie);
    assert.equal(persisted.creatorVersion, before.creatorVersion + 1);

    await page.evaluate(() => window.history.back());
    const exit = page.locator('[data-owner-exit-prompt]');
    await expect(exit).toBeVisible();
    await exit.getByRole('button', { name: 'Descartar y seguir', exact: true }).click();
    await expect(page).toHaveURL((url) => !url.searchParams.has('serie'));
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin);
    const pendingRecovery = page.locator('[data-owner-list-recovery="series"][data-recovery-kind="acknowledged"]');
    await expect(pendingRecovery).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear serie', exact: true })).toBeDisabled();
    assert.equal(capture.writes().length, 1, 'discarding the Back prompt does not cancel or replay the committed command');
    assert.equal(Number(await page.locator('[data-owner-root]').getAttribute('data-creator-version')), before.creatorVersion,
      'the stale page cannot adopt the pending snapshot before the held GET is delivered');

    read.release();
    await read.finished;
    await expect(page.locator('[data-owner-list-recovery]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Crear serie', exact: true })).toBeEnabled();
    assert.equal(Number(await page.locator('[data-owner-root]').getAttribute('data-creator-version')), persisted.creatorVersion,
      'the still-current GET installs its newer coherent snapshot after navigation');
    assert.deepEqual(capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil')
      .map(({ status }) => status), [200], 'Back recovery adopts the in-flight read and issues no second read');

    await page.getByRole('button', { name: 'Crear serie', exact: true }).click();
    const form = page.locator('[data-owner-dialog][open] form[data-owner-form="serie"]');
    await form.getByLabel('Nombre de la serie').fill('Serie después de leer');
    await form.getByLabel('Dirección de la serie').fill('serie-despues-de-leer');
    await form.getByRole('button', { name: 'Guardar serie', exact: true }).click();
    await expect.poll(() => capture.writes().find(({ method, path }) => method === 'POST' && path === '/api/creador/series')?.status).toBe(201);
    const final = await readOwnerSnapshot(fixture, cookie);
    assert.deepEqual(final.series[target.id].chapters, [chapter.placementId]);
    assert.ok(Object.values(final.series).some(({ slug }) => slug === 'serie-despues-de-leer'));
    assert.equal(capture.writes().length, 2, 'only the original chapter command and the later explicit series save are written');
  } finally {
    read?.release();
    await read?.remove();
    await capture.stop({ skipErrorBodies: true });
  }
});

test('el guardado de perfil congela el borrador y Solicitudes espera el acuse y la lectura completa', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const capture = await captureCreatorApi(page);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-owner-root]')).toBeVisible();
  await page.getByRole('link', { name: 'Solicitudes', exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('vista') === 'solicitudes');
  const heldViewUrl = page.url();
  await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
  const form = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
  await expect(form).toBeVisible();
  const name = form.getByLabel('Nombre visible');
  await name.fill('Nombre confirmado');
  const write = await holdProfileWriteAfterCommit(page);
  const save = form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
  let read;
  try {
    await write.entered;
    assert.equal(write.actual.status, 200, 'the real profile service committed while acknowledgement delivery is held');
    await expect(name).toHaveAttribute('readonly', '');
    await expect(name).toBeEnabled();
    await expect(form.getByLabel(/Ciudad/)).toHaveAttribute('readonly', '');
    await expect(form.getByRole('checkbox', { name: 'Heroes', exact: true })).toBeDisabled();
    await expect(form.getByRole('button', { name: 'Guardar datos', exact: true })).toBeDisabled();
    await expect(page.locator('[data-claim-history-refresh]')).toBeDisabled();

    await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(form).toBeVisible();
    await expect(form.getByRole('status')).toContainText(/espera a que termine|guardando la acción iniciada/iu);
    const leaveConfirmation = page.waitForEvent('dialog');
    await page.evaluate(() => {
      setTimeout(() => window.history.back(), 0);
    });
    const leaveDialog = await leaveConfirmation;
    assert.equal(leaveDialog.type(), 'beforeunload', 'cross-document Back runs the native unsaved-change guard');
    await leaveDialog.dismiss();
    await expect(page).toHaveURL(heldViewUrl);
    await expect(page.locator('[data-owner-exit-prompt]')).toHaveCount(0,
      'sending-time cancellation/departure is refused without queuing a destination');
    await expect(page.getByRole('heading', { name: 'Solicitudes', exact: true })).toBeVisible();
    assert.equal(ownerWrites(capture).length, 1, 'waiting for the committed acknowledgement never replays or adds a write');

    assert.equal((await api(fixture, cookie, '/api/creador/perfil')).body.profile.displayName, 'Nombre confirmado',
      'the commit is real even though the same document has not received its acknowledgement');
    await expect(page.getByRole('heading', { name: 'Ana Browser', exact: true })).toBeVisible();

    read = await holdNextOwnerRead(page);
    write.release();
    await save;
    await read.entered;
    assert.equal(read.actual.status, 200, 'the held full owner read is the real post-commit GET');
    await expect(name).toHaveAttribute('readonly', '');
    await expect(name).toBeEnabled();
    await expect(form.getByLabel(/Ciudad/)).toHaveAttribute('readonly', '');
    await expect(form.getByRole('checkbox', { name: 'Heroes', exact: true })).toBeDisabled();
    await expect(page.locator('[data-claim-history-refresh]')).toBeDisabled();
    await expect(page.getByRole('heading', { name: 'Ana Browser', exact: true })).toBeVisible();
    read.release();
    await read.finished;
    await expect(page.getByRole('heading', { name: 'Nombre confirmado', exact: true })).toBeVisible();
    await expect(page.locator('[data-claim-history-refresh]')).toBeEnabled();
    await expect(page).toHaveURL(heldViewUrl, 'the rejected sending-time departure is not resumed after the full read');
    assert.equal(ownerWrites(capture).length, 1, 'releasing acknowledgement and full read does not run another command');
  } finally {
    write.release();
    read?.release();
    await save.catch(() => {});
    await write.remove();
    await read?.remove();
  }

  const readsBeforeClaimsRefresh = capture.records.filter(({ method }) => method === 'GET').length;
  const refreshClaims = page.locator('[data-claim-history-refresh]');
  await refreshClaims.click();
  await expect.poll(() => capture.records.filter(({ method, status }) => method === 'GET' && status !== undefined).length)
    .toBeGreaterThan(readsBeforeClaimsRefresh);
  const editor = await openEditor(page, fixture, 'solicitudes');
  await editor.getByLabel(/Ciudad/).fill('Mendoza');
  await editor.getByRole('button', { name: 'Guardar datos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nombre confirmado', exact: true })).toBeVisible();
  const fresh = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(fresh.response.status, 200);
  assert.equal(fresh.body.profile.displayName, 'Nombre confirmado');
  assert.equal(fresh.body.profile.city, 'Mendoza', 'one later ordinary save persists after the serialized recovery');
  assert.equal(ownerWrites(capture).length, 2, 'the initial and subsequent manual profile saves each occur once');
  await capture.stop({ skipErrorBodies: true });
});

test('una ficha retirada conserva su borrador hasta descartarlo y editarla después como acción independiente', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(initial.response.status, 200, JSON.stringify(initial.body));
  assert.equal(initial.body.schemaVersion, 2);
  const profileId = initial.body.profile.id;
  const originalUrl = 'https://missing-target.example.invalid/phase5-own-link';
  const created = await api(fixture, cookie, '/api/creador/enlaces/', {
    method: 'POST',
    headers: { 'X-Creator-Contract': '2' },
    body: {
      creatorVersion: initial.body.creatorVersion,
      title: 'Ficha propia original',
      url: originalUrl,
      description: 'Descripción original',
      selectedForDirectory: true,
    },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.schemaVersion, 2);
  assert.equal(created.body.operation, 'add-link');
  assert.equal(created.body.profileId, profileId);
  assert.equal(created.body.disposition, 'resource-created');
  const resourceId = created.body.resourceId;
  const placementId = created.body.placementId;
  assert.equal(typeof resourceId, 'string');
  assert.equal(typeof placementId, 'string');

  const afterCreate = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(afterCreate.response.status, 200, JSON.stringify(afterCreate.body));
  assert.equal(afterCreate.body.profile.id, profileId);
  assert.equal(afterCreate.body.placements[placementId].resourceId, resourceId);
  const initialResource = afterCreate.body.resources.find(({ id }) => id === resourceId);
  assert.ok(initialResource);
  assert.equal(initialResource.metadataEditable, true);
  assert.equal(initialResource.reincludeAllowed, false,
    'an active placement does not expose the retained-resource reinclude action');
  const editorKey = `editor:${profileId}:${resourceId}`;
  const authorityBefore = await fixture.creatorStore.get(editorKey);
  assert.deepEqual(authorityBefore, {
    recordType: 'editorReference', profileId, resourceId, version: 1,
  }, 'the real owner Add command created the existing EDITOR authority');

  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-owner-root]')).toBeVisible();
  const row = page.locator(`[data-link-row="${placementId}"]`);
  await expect(row).toBeVisible();
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  try {
    await row.getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const form = page.locator('[data-owner-dialog][open] form[data-owner-form="enlace"]');
    await expect(page.getByRole('heading', { name: 'Editar ficha', exact: true })).toBeVisible();
    const title = '  Corrección original que debe seguir copiable  ';
    const url = 'https://missing-target.example.invalid/draft-not-saved';
    const description = '  Descripción local que no se guardó  ';
    await form.getByLabel('Título', { exact: true }).fill(title);
    await form.getByLabel('URL', { exact: true }).fill(url);
    await form.getByLabel(/Descripción/u).fill(description);

    const removed = await api(fixture, cookie, `/api/creador/enlaces/${encodeURIComponent(placementId)}`, {
      method: 'DELETE',
      headers: { 'X-Creator-Contract': '2' },
      body: { creatorVersion: afterCreate.body.creatorVersion },
    });
    assert.equal(removed.response.status, 200, JSON.stringify(removed.body));
    assert.equal(removed.body.schemaVersion, 2);
    assert.equal(removed.body.operation, 'remove-link');
    assert.equal(removed.body.profileId, profileId);
    assert.equal(removed.body.placementId, placementId);

    const afterRemoval = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(afterRemoval.response.status, 200, JSON.stringify(afterRemoval.body));
    assert.ok(afterRemoval.body.creatorVersion > afterCreate.body.creatorVersion);
    assert.equal(Object.hasOwn(afterRemoval.body.placements, placementId), false,
      'the real removal leaves the original placement absent');
    const retained = afterRemoval.body.resources.find(({ id }) => id === resourceId);
    assert.ok(retained, 'the actual retained resource remains owner-readable through EDITOR');
    assert.equal(retained.metadataEditable, true);
    assert.equal(retained.reincludeAllowed, true);
    assert.deepEqual(await fixture.creatorStore.get(editorKey), authorityBefore,
      'removing a placement preserves the same EDITOR reference and version');

    const readsBeforeSave = ownerReads(capture).length;
    await form.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    const placementEdits = () => capture.records.filter(({ method, path }) => method === 'PATCH'
      && path === `/api/creador/enlaces/${placementId}/editar`);
    await expect.poll(() => placementEdits()[0]?.status ?? 0).toBeGreaterThanOrEqual(400);
    const rejectedEdit = placementEdits()[0];
    assert.ok([404, 409].includes(rejectedEdit.status),
      `the real stale/missing placement save should return 404 or 409, received ${rejectedEdit.status}`);
    assert.equal(new URL(rejectedEdit.url).pathname.replace(/\/$/u, ''), `/api/creador/enlaces/${placementId}/editar`);
    assert.equal(rejectedEdit.body.title, title, 'the failed command retains the raw title and exact placement target');
    assert.equal(rejectedEdit.body.url, url);
    assert.equal(rejectedEdit.body.description, description);

    await expect.poll(() => ownerReads(capture).length).toBeGreaterThan(readsBeforeSave);
    const compared = ownerReads(capture).at(-1);
    await expect.poll(() => compared.status).toBe(200);
    assert.equal(compared.responseBody.schemaVersion, 2);
    assert.equal(compared.responseBody.profile.id, profileId);
    assert.equal(Object.hasOwn(compared.responseBody.placements, placementId), false);
    assert.equal(compared.responseBody.creatorVersion, afterRemoval.body.creatorVersion);
    assert.equal(compared.responseBody.resources.find(({ id }) => id === resourceId).metadataEditable, true);
    assert.equal(compared.responseBody.resources.find(({ id }) => id === resourceId).reincludeAllowed, true);
    assert.deepEqual(await fixture.creatorStore.get(editorKey), authorityBefore);

    await expect(page.getByRole('heading', { name: 'Editar ficha', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Editar contenido retirado', exact: true })).toHaveCount(0);
    const retainedTitleDraft = form.getByLabel('Título', { exact: true });
    const retainedUrlDraft = form.getByLabel('URL', { exact: true });
    const retainedDescriptionDraft = form.getByLabel(/Descripción/u);
    await expect(retainedTitleDraft).toHaveValue(title);
    await expect(retainedTitleDraft).toHaveAttribute('readonly', '');
    await expect(retainedTitleDraft).toBeEnabled();
    await expect(retainedUrlDraft).toHaveValue(url);
    await expect(retainedUrlDraft).toHaveAttribute('readonly', '');
    await expect(retainedUrlDraft).toBeEnabled();
    await expect(retainedDescriptionDraft).toHaveValue(description);
    await expect(retainedDescriptionDraft).toHaveAttribute('readonly', '');
    await expect(retainedDescriptionDraft).toBeEnabled();
    await expect(form.locator('button[type="submit"]:enabled')).toHaveCount(0,
      'a missing target has no enabled Save; an absent Save is also valid');
    await expect(page.getByRole('button', {
      name: /Continuar editando la ficha retirada|Volver a elegir una referencia|Revisar el enlace actual/iu,
    })).toHaveCount(0, 'the missing target has no action that transforms the original draft into another editor');
    assert.equal(capture.writes().filter(({ method, path }) => method === 'POST'
      && ['/api/creador/enlaces', '/api/creador/referencias'].includes(path)).length, 0,
    'no automatic reinclude, reference or replacement write followed the removed-target read');

    await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const exitPrompt = page.locator('[data-owner-exit-prompt]');
    await expect(exitPrompt).toBeVisible();
    await exitPrompt.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
    await expect(page.locator('[data-owner-dialog][open]')).toHaveCount(0);
    const writesBeforeSeparateEdit = capture.writes().length;
    assert.equal(writesBeforeSeparateEdit, 1, 'explicit discard sends no second command');

    const retainedRow = page.locator(`[data-retained-resource="${resourceId}"]`);
    await expect(retainedRow).toBeVisible();
    await retainedRow.getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const retainedForm = page.locator('[data-owner-dialog][open] form[data-owner-form="enlace"]');
    await expect(page.getByRole('heading', { name: 'Editar contenido retirado', exact: true })).toBeVisible();
    await expect(retainedForm.getByLabel('Título', { exact: true })).toHaveValue(retained.title);
    const savedTitle = 'Ficha retirada editada manualmente';
    const savedDescription = 'Descripción guardada desde la acción independiente';
    await retainedForm.getByLabel('Título', { exact: true }).fill(savedTitle);
    await retainedForm.getByLabel(/Descripción/u).fill(savedDescription);
    const readsBeforeManualEdit = ownerReads(capture).length;
    await retainedForm.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
    const resourceEdits = () => capture.records.filter(({ method, url: requestUrl }) => {
      const parsed = new URL(requestUrl);
      return method === 'PATCH' && parsed.pathname.replace(/\/$/u, '') === '/api/creador/recursos'
        && parsed.searchParams.get('id') === resourceId;
    });
    await expect.poll(() => resourceEdits()[0]?.status ?? 0).toBe(200);
    assert.equal(resourceEdits().length, 1, 'one explicit retained-resource command uses the exact resource ID');
    assert.equal(resourceEdits()[0].body.title, savedTitle);
    assert.equal(resourceEdits()[0].body.description, savedDescription);
    await expect.poll(() => ownerReads(capture).length).toBeGreaterThan(readsBeforeManualEdit);
    const fresh = ownerReads(capture).at(-1);
    await expect.poll(() => fresh.status).toBe(200);
    assert.equal(fresh.responseBody.schemaVersion, 2);
    assert.equal(fresh.responseBody.profile.id, profileId);
    assert.equal(fresh.responseBody.creatorVersion, afterRemoval.body.creatorVersion,
      'editing retained metadata does not advance the content aggregate revision');
    assert.equal(Object.hasOwn(fresh.responseBody.placements, placementId), false);
    assert.equal(Object.values(fresh.responseBody.placements).some(({ resourceId: id }) => id === resourceId), false,
      'the separate metadata save does not resurrect any placement for this resource');
    const finalResource = fresh.responseBody.resources.find(({ id }) => id === resourceId);
    assert.equal(finalResource.title, savedTitle);
    assert.equal(finalResource.description, savedDescription);
    assert.ok(finalResource.version > retained.version);
    assert.equal(finalResource.metadataEditable, true);
    assert.equal(finalResource.reincludeAllowed, true);
    assert.deepEqual(await fixture.creatorStore.get(editorKey), authorityBefore,
      'the same EDITOR authority remains after the independent metadata update');
    assert.equal(capture.writes().length, 2,
      'the only page writes are the original rejected placement edit and the separate retained-resource edit');
    assert.equal(capture.writes().filter(({ method, path }) => method === 'POST'
      && ['/api/creador/enlaces', '/api/creador/referencias'].includes(path)).length, 0);
  } finally {
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('un acuse 200 con contexto incompatible queda incierto aunque la lectura real coincida', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const before = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(before.response.status, 200, JSON.stringify(before.body));
  assert.equal(before.body.schemaVersion, 2);
  const profileId = before.body.profile.id;
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const form = await openEditor(page, fixture);
  const draftName = 'Nombre cuyo acuse perdió contexto';
  await form.getByLabel('Nombre visible').fill(draftName);
  const writes = trackProfileWrites(page);
  let deliveredAck;
  let actualAck;
  let save;
  const damageContextOnly = async (route) => {
    const request = route.request();
    if (actualAck || request.method() !== 'PUT' || ownerPath(request) !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.json();
    actualAck = { status: response.status(), body };
    deliveredAck = { ...body, operation: 'another-operation', profileId: 'another-profile' };
    await route.fulfill({ response, json: deliveredAck });
  };
  await page.route('**/api/creador/**', damageContextOnly);
  try {
    save = form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    await expect.poll(() => writes.responses.length).toBe(1);
    assert.equal(actualAck.status, 200, 'the actual profile command committed before only its acknowledgement context was damaged');
    assert.equal(actualAck.body.schemaVersion, 2);
    assert.equal(actualAck.body.operation, 'save-profile');
    assert.equal(actualAck.body.profileId, profileId);
    assert.equal(deliveredAck.schemaVersion, actualAck.body.schemaVersion);
    assert.equal(deliveredAck.creatorVersion, actualAck.body.creatorVersion);
    assert.equal(deliveredAck.disposition, actualAck.body.disposition);
    assert.equal(deliveredAck.operation, 'another-operation');
    assert.equal(deliveredAck.profileId, 'another-profile');
    await save;
    await expect(form).toContainText(/No pudimos confirmar|No sabemos si se guardó/iu);
    await expect(form.getByRole('button', { name: 'Comprobar estado guardado', exact: true })).toBeVisible();
    assert.equal(writes.requests.length, 1, 'an incompatible acknowledgement never triggers a write retry');

    const readsBeforeCheck = ownerReads(capture).length;
    await form.getByRole('button', { name: 'Comprobar estado guardado', exact: true }).click();
    await expect.poll(() => ownerReads(capture).length).toBeGreaterThan(readsBeforeCheck);
    const comparisonRead = ownerReads(capture).at(-1);
    await expect.poll(() => comparisonRead.status).toBe(200);
    assert.equal(comparisonRead.responseBody.schemaVersion, 2);
    assert.equal(comparisonRead.responseBody.profile.displayName, draftName,
      'the explicit recovery control performs a complete actual owner GET');
    const saved = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(saved.response.status, 200);
    assert.equal(saved.body.profile.displayName, draftName,
      'a complete real GET can match the intended value without identifying which command produced it');
    await expect(form).toContainText(/No pudimos confirmar|No sabemos si se guardó/iu);
    await expect(form.getByRole('button', { name: 'Volver al borrador', exact: true })).toBeVisible();
    await expect(form.getByLabel('Nombre visible')).toHaveValue(draftName);
    assert.equal(writes.requests.length, 1, 'a similar saved value remains insufficient proof and the explicit comparison is read-only');

    await form.getByRole('button', { name: 'Volver al borrador', exact: true }).click();
    await expect(form.getByLabel('Nombre visible')).toHaveValue(draftName);
    await form.getByLabel(/Ciudad/).fill('Mendoza');
    assert.equal(writes.requests.length, 1, 'returning to the draft is an explicit choice, not a replay');
    await form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    await expect.poll(() => writes.requests.length).toBe(2);
    await expect.poll(() => writes.responses.length).toBe(2);
    assert.equal(writes.responses[1].status, 200, 'the next profile write follows the user\'s manual save');
    const fresh = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(fresh.response.status, 200);
    assert.equal(fresh.body.profile.displayName, draftName);
    assert.equal(fresh.body.profile.city, 'Mendoza', 'fresh persistence includes the later manual change');
    assert.equal(writes.requests.length, 2, 'only the original attempt and explicit manual save reached the service');
  } finally {
    await save?.catch(() => {});
    await page.unroute('**/api/creador/**', damageContextOnly).catch(() => {});
    writes.stop();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('un acuse válido conserva la confirmación aunque la lectura completa incluya un cambio posterior real', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const before = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(before.response.status, 200, JSON.stringify(before.body));
  assert.equal(before.body.schemaVersion, 2);
  const profileId = before.body.profile.id;
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const form = await openEditor(page, fixture);
  const confirmedName = 'Nombre confirmado por el acuse';
  await form.getByLabel('Nombre visible').fill(confirmedName);
  const writes = trackProfileWrites(page);
  const read = await pauseNextOwnerReadBeforeFetch(page);
  try {
    await form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    await read.entered;
    await expect.poll(() => writes.responses.length).toBe(1);
    assert.equal(writes.responses[0].status, 200, 'the current service acknowledged the actual profile command');
    let commandAck;
    await expect.poll(() => {
      commandAck = capture.writes().find(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
      return commandAck?.status;
    }).toBe(200);
    assert.equal(commandAck.responseBody.schemaVersion, 2);
    assert.equal(commandAck.responseBody.operation, 'save-profile');
    assert.equal(commandAck.responseBody.profileId, profileId);
    assert.ok(Number.isSafeInteger(commandAck.responseBody.creatorVersion));
    const sent = writes.requests[0].postDataJSON();
    assert.equal(sent.creatorVersion, before.body.creatorVersion);
    assert.equal(sent.displayName, confirmedName);
    assert.equal((await writes.requests[0].allHeaders())['x-creator-contract'], '2');

    const intervening = await api(fixture, cookie, '/api/creador/perfil', {
      method: 'PUT',
      headers: { 'X-Creator-Contract': '2' },
      body: { creatorVersion: commandAck.responseBody.creatorVersion, city: 'Córdoba' },
    });
    assert.equal(intervening.response.status, 200, JSON.stringify(intervening.body));
    assert.equal(intervening.body.schemaVersion, 2);
    assert.equal(intervening.body.operation, 'save-profile');
    assert.equal(intervening.body.profileId, profileId);
    assert.ok(intervening.body.creatorVersion > commandAck.responseBody.creatorVersion,
      'another legitimate profile write advances the current aggregate revision');

    read.release();
    await read.finished;
    assert.equal(read.actual.status, 200);
    assert.equal(read.actual.body.schemaVersion, 2);
    assert.ok(read.actual.body.creatorVersion > commandAck.responseBody.creatorVersion);
    assert.equal(read.actual.body.profile.displayName, confirmedName,
      'the full read preserves the profile fact confirmed by the original acknowledgement');
    assert.equal(read.actual.body.profile.city, 'Córdoba',
      'the full read includes a later real service change and is not required to equal the earlier acknowledgement');

    await expect(page.getByRole('heading', { name: confirmedName, exact: true })).toBeVisible();
    await expect(page.locator('[data-session-recovery-shell]')).toHaveCount(0);
    const next = await openEditor(page, fixture);
    await expect(next.getByLabel('Nombre visible')).toHaveValue(confirmedName);
    await expect(next.getByLabel(/Ciudad/)).toHaveValue('Córdoba');
    await next.getByLabel(/Ciudad/).fill('Salta');
    await next.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    await expect.poll(() => writes.requests.length).toBe(2);
    await expect.poll(() => writes.responses.length).toBe(2);
    assert.equal(writes.responses[1].status, 200, 'the next manual operation uses the accepted newer snapshot');
    const fresh = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(fresh.response.status, 200);
    assert.equal(fresh.body.profile.displayName, confirmedName);
    assert.equal(fresh.body.profile.city, 'Salta', 'the next manual save persists on top of the accepted current profile');
    assert.equal(writes.requests.length, 2, 'the intervening read and acknowledgement never cause a replay');
  } finally {
    read.release();
    await read.remove();
    writes.stop();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

for (const operation of ['add', 'remove']) {
  test(`un capítulo ${operation === 'add' ? 'agregado' : 'quitado'} conserva la confirmación y reintenta sólo el GET`, async ({ fixture, page }) => {
    await reconcileChapterChangeWithFailedRead({ fixture, page, operation });
  });

  test(`Back conserva la recuperación de un capítulo ${operation === 'add' ? 'agregado' : 'quitado'} hasta una lectura completa`, async ({ fixture, page }) => {
    await recoverChapterAfterBack({ fixture, page, operation });
  });

  test(`Back con query de series inválida conserva la recuperación del capítulo ${operation === 'add' ? 'agregado' : 'quitado'}`, async ({ fixture, page }) => {
    await recoverChapterAfterBack({ fixture, page, operation, malformedBack: true });
  });
}

for (const kind of ['link', 'chapter']) {
  test(`un conflicto de movimiento ${kind === 'link' ? 'de enlace' : 'de capítulo'} conserva el borrador y permite corregir la posición`, async ({ fixture, page }) => {
    await recoverMoveAfterRangeShrinks({ fixture, page, kind });
  });

  test(`Corregir posición desde la salida cancela Back y conserva el borrador de ${kind === 'link' ? 'enlace' : 'capítulo'}`, async ({ fixture, page }) => {
    await recoverMoveAfterRangeShrinks({ fixture, page, kind, exitPrompt: true });
  });
}

test('Volver al borrador desde el aviso de salida cancela Back y devuelve el foco al formulario', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let lost;
  let save;
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
    await page.locator('#owner-link-order').selectOption('titulo-asc');
    await page.locator('#owner-link-order').selectOption('pagina');
    const editorUrl = page.url();
    await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
    const form = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
    const displayName = form.getByLabel('Nombre visible');
    await displayName.fill('Borrador conservado tras salir');

    lost = await holdProfileWriteAndLoseAcknowledgement(page);
    save = form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    await lost.entered;
    assert.equal(lost.actual.status, 200, 'the server commits the original request before its acknowledgement is lost');
    lost.release();
    await lost.finished;
    await save;
    await form.getByRole('button', { name: 'Comprobar estado guardado', exact: true }).click();
    await expect(form.locator('[data-owner-return-to-draft]')).toBeVisible();
    assert.equal(capture.writes().length, 1, 'the unknown operation is not automatically replayed');

    const back = page.goBack();
    const exit = page.locator('[data-owner-exit-prompt]');
    await expect(exit).toBeVisible();
    await expect(page).toHaveURL(editorUrl, 'the blocked Back returns to the active editor');
    await back;
    await exit.locator('[data-owner-return-to-draft]').click();
    await expect(exit).toHaveCount(0, 'returning to the draft cancels the pending history transition');
    await expect(page).toHaveURL(editorUrl);
    await expect(displayName).toHaveValue('Borrador conservado tras salir');
    await expect(displayName).toBeFocused();
    assert.equal(capture.writes().length, 1, 'returning to the draft sends no second write');
  } finally {
    lost?.release();
    await save?.catch(() => {});
    await lost?.remove();
    await capture.stop({ skipErrorBodies: true });
  }
});

for (const conflictStage of ['authorization', 'finalization']) {
  test(`un conflicto de versión en ${conflictStage === 'authorization' ? 'autorizar' : 'finalizar'} permite una carga nueva con el mismo archivo`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const initial = await readOwnerSnapshot(fixture, cookie);
    const images = await rasterPhotoFixtures();
    const capture = await captureCreatorApi(page);
    let concurrent;
    const uploads = await installPhotoProvider({ fixture, page, bytes: images.png,
      afterPost: async (count) => {
        if (conflictStage !== 'finalization' || count !== 1) return;
        concurrent = await api(fixture, cookie, '/api/creador/perfil', {
          method: 'PUT', body: { creatorVersion: initial.creatorVersion, displayName: 'Perfil actualizado mientras sube la foto',
            slug: initial.profile.slug },
        });
        assert.equal(concurrent.response.status, 200, JSON.stringify(concurrent.body));
      } });
    try {
      await page.goto(`${fixture.origin}/cuenta/?vista=series`);
      await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
      const form = page.locator('[data-owner-dialog][open] form[data-owner-form="foto"]');
      const file = form.getByLabel('Elegir una foto');
      await file.setInputFiles({ name: 'foto-recuperable.png', mimeType: 'image/png', buffer: images.png });
      const selectedFile = await file.evaluateHandle((input) => input.files[0]);

      if (conflictStage === 'authorization') {
        concurrent = await api(fixture, cookie, '/api/creador/perfil', {
          method: 'PUT', body: { creatorVersion: initial.creatorVersion, displayName: 'Perfil actualizado antes de autorizar',
            slug: initial.profile.slug },
        });
        assert.equal(concurrent.response.status, 200, JSON.stringify(concurrent.body));
      }
      await form.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();
      const recovery = form.locator('[data-owner-recovery][data-recovery-kind="conflict"]');
      await expect(recovery).toBeVisible();
      const apiCalls = () => capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil'
        || method === 'POST' && (path === '/api/creador/foto/autorizar' || path === '/api/creador/foto/finalizar'));
      const conflictPath = conflictStage === 'authorization' ? '/api/creador/foto/autorizar' : '/api/creador/foto/finalizar';
      await expect.poll(() => capture.records.filter(({ method, path }) => method === 'POST' && path === conflictPath)[0]?.status).toBe(409);
      await expect.poll(() => ownerReads(capture).filter(({ status }) => status === 200).length).toBe(1);
      const rejected = capture.records.filter(({ method, path }) => method === 'POST' && path === conflictPath)[0];
      await rejected.settled;
      assert.equal(rejected.responseBody.error, 'PROFILE_VERSION_CONFLICT');
      const concurrentSnapshot = await readOwnerSnapshot(fixture, cookie);
      assert.equal(concurrentSnapshot.creatorVersion, initial.creatorVersion + 1);
      assert.equal(await file.evaluate((input, original) => input.files[0] === original, selectedFile), true,
        'the exact native File remains selected after the coherent conflict read');
      await expect(file).toBeDisabled();
      await expect(recovery.getByRole('button', { name: 'Cargar de nuevo esta foto', exact: true })).toBeEnabled();
      await expect(recovery.getByRole('button', { name: 'Usar lo guardado', exact: true })).toBeEnabled();
      await expect(recovery.locator('[data-owner-photo-recovery]')).toContainText('Tu archivo sigue seleccionado. Puedes cargarlo con la versión actual del perfil.');
      assert.equal(Number(await page.locator('[data-owner-root]').getAttribute('data-creator-version')), concurrentSnapshot.creatorVersion);

      await recovery.getByRole('button', { name: 'Cargar de nuevo esta foto', exact: true }).click();
      const authorizations = () => capture.records.filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/autorizar');
      const finalizations = () => capture.records.filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/finalizar');
      await expect.poll(() => authorizations().length).toBe(2);
      await expect.poll(() => finalizations().filter(({ status }) => status === 200).length).toBe(1);
      await expect.poll(() => ownerReads(capture).filter(({ status }) => status === 200).length).toBe(2);
      await capture.settle();
      assert.deepEqual(authorizations().map(({ status }) => status), conflictStage === 'authorization' ? [409, 200] : [200, 200]);
      assert.deepEqual(finalizations().map(({ status }) => status), conflictStage === 'authorization' ? [200] : [409, 200]);
      const retriedAuthorization = authorizations().at(-1);
      assert.equal(retriedAuthorization.body.creatorVersion, concurrentSnapshot.creatorVersion,
        'the manual retry authorizes against the complete current creator revision');
      const retriedUploadId = retriedAuthorization.responseBody.uploadId;
      assert.ok(retriedUploadId);
      if (conflictStage === 'finalization') {
        assert.notEqual(retriedUploadId, authorizations()[0].responseBody.uploadId,
          'manual recovery has a new upload ID rather than reusing the rejected finalization');
        assert.notEqual(finalizations()[1].body.uploadId, finalizations()[0].body.uploadId);
        assert.equal(finalizations()[0].body.creatorVersion, initial.creatorVersion);
      }
      assert.equal(uploads.length, conflictStage === 'authorization' ? 1 : 2,
        'only explicitly authorized uploads reach the provider');
      assert.deepEqual(uploads.map(({ key }) => key), fixture.photoPolicies.map(({ key }) => key));
      assert.equal(new Set(uploads.map(({ key }) => key)).size, uploads.length,
        'each manual recovery upload gets a new authorized object key');
      await expect(form).toHaveCount(0, 'the dialog closes only after the new photo and complete snapshot are confirmed');
      await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
      const replacementForm = page.locator('[data-owner-dialog][open] form[data-owner-form="foto"]');
      assert.equal(await replacementForm.getByLabel('Elegir una foto').evaluate((input) => input.files.length), 0,
        'the successful new upload consumes the selected photo draft');
      const saved = await readOwnerSnapshot(fixture, cookie);
      assert.equal(saved.profile.photo.version, retriedUploadId);
      assert.equal(saved.creatorVersion, concurrentSnapshot.creatorVersion + 1);
      assert.equal(saved.profile.displayName, conflictStage === 'authorization'
        ? 'Perfil actualizado antes de autorizar' : 'Perfil actualizado mientras sube la foto');
      assert.deepEqual(apiCalls().filter(({ method }) => method === 'POST').map(({ status }) => status),
        conflictStage === 'authorization' ? [409, 200, 200] : [200, 409, 200, 200],
        'the old authorization or finalization is never replayed automatically');
      assert.equal(uploads.length, fixture.photoPolicies.length, 'each provider upload has a distinct server authorization');
    } finally {
      await page.unroute('https://creator-photos.example.invalid/**').catch(() => {});
      await capture.stop();
    }
  });
}

test('la foto retenida no se puede cargar si el perfil de destino dejó de existir', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const principal = await fixture.principal(cookie);
  const current = await readOwnerSnapshot(fixture, cookie);
  const images = await rasterPhotoFixtures();
  const capture = await captureCreatorApi(page);
  const uploads = await installPhotoProvider({ fixture, page, bytes: images.png });
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
    const form = page.locator('[data-owner-dialog][open] form[data-owner-form="foto"]');
    const file = form.getByLabel('Elegir una foto');
    await file.setInputFiles({ name: 'foto-sin-destino.png', mimeType: 'image/png', buffer: images.png });
    const selectedFile = await file.evaluateHandle((input) => input.files[0]);

    const mappingKey = `account-profile:${principal.accountId}`;
    const mapping = await fixture.creatorStore.get(mappingKey);
    assert.ok(mapping?.profileId);
    assert.equal(await fixture.creatorStore.transact({ checks: [{ key: mappingKey, version: mapping.version }], deletes: [mappingKey] }), true,
      'the concurrent change removes the real owner-to-profile target mapping');

    await form.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();
    const recovery = form.locator('[data-owner-recovery][data-recovery-kind="refresh-failed"]');
    await expect(recovery).toBeVisible();
    await expect.poll(() => capture.records.filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/autorizar').length).toBe(1);
    await expect.poll(() => ownerReads(capture).length).toBe(1);
    const authorization = capture.records.find(({ method, path }) => method === 'POST' && path === '/api/creador/foto/autorizar');
    await authorization.settled;
    assert.equal(authorization.status, 404);
    assert.equal(authorization.responseBody.error, 'PROFILE_NOT_FOUND');
    await expect(recovery.getByRole('button', { name: 'Reintentar actualización', exact: true })).toBeEnabled();
    await expect(recovery.getByRole('button', { name: 'Cargar de nuevo esta foto', exact: true })).toHaveCount(0);
    await expect(recovery.getByRole('button', { name: 'Usar lo guardado', exact: true })).toHaveCount(0,
      'a read that cannot validate the missing target cannot offer either adopt-saved or upload-again');
    assert.equal(await file.evaluate((input, original) => input.files[0] === original, selectedFile), true);
    assert.equal(uploads.length, 0, 'the unbound photo never reaches the provider');
    assert.equal(capture.writes().length, 1, 'the missing target does not trigger a second authorization or a finalize');
    assert.equal(capture.records.filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/finalizar').length, 0);
    assert.equal(current.profile.id, mapping.profileId);
  } finally {
    await page.unroute('https://creator-photos.example.invalid/**').catch(() => {});
    await capture.stop();
  }
});

for (const group of ['ordinary', 'featured']) {
  test(`mover un enlace de grupo ${group === 'ordinary' ? 'ordinario' : 'destacado'} usa su ordinal y guarda el cambio`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const featuredFirst = await addLink(fixture, cookie, { title: 'Destacado primero', url: 'https://links.example/featured-first' });
    const featuredSecond = await addLink(fixture, cookie, { title: 'Destacado segundo', url: 'https://links.example/featured-second' });
    const ordinaryFirst = await addLink(fixture, cookie, { title: 'Ordinario primero', url: 'https://links.example/ordinary-first' });
    const ordinarySecond = await addLink(fixture, cookie, { title: 'Ordinario segundo', url: 'https://links.example/ordinary-second' });
    for (const placementId of [featuredFirst.placementId, featuredSecond.placementId]) {
      const current = await readOwnerSnapshot(fixture, cookie);
      const promoted = await api(fixture, cookie, `/api/creador/enlaces/${encodeURIComponent(placementId)}`, {
        method: 'PATCH', body: { creatorVersion: current.creatorVersion, featured: true },
      });
      assert.equal(promoted.response.status, 200, JSON.stringify(promoted.body));
    }
    const initial = await readOwnerSnapshot(fixture, cookie);
    assert.deepEqual(initial.order.featured, [featuredFirst.placementId, featuredSecond.placementId]);
    assert.deepEqual(initial.order.ordinary, [ordinaryFirst.placementId, ordinarySecond.placementId]);
    const movedPlacementId = group === 'ordinary' ? ordinaryFirst.placementId : featuredFirst.placementId;
    const groupOrder = group === 'ordinary' ? initial.order.ordinary : initial.order.featured;
    const capture = await captureCreatorApi(page);
    try {
      await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
      const openMove = page.locator(`[data-link-move][data-placement-id="${movedPlacementId}"]`);
      await openMove.click();
      const form = page.locator('[data-owner-dialog][open] form[data-link-move-form]');
      const position = form.getByLabel('Posición dentro del grupo');
      await expect(position).toHaveValue('1');
      await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(page.locator('[data-owner-exit-prompt]')).toHaveCount(0,
        'canceling the untouched group ordinal closes the dialog without a dirty prompt');

      await openMove.click();
      const reopened = page.locator('[data-owner-dialog][open] form[data-link-move-form]');
      const editedPosition = reopened.getByLabel('Posición dentro del grupo');
      await editedPosition.fill('2');
      await reopened.getByRole('button', { name: 'Cancelar', exact: true }).click();
      const guard = page.locator('[data-owner-exit-prompt]');
      await expect(guard).toBeVisible();
      await guard.getByRole('button', { name: 'Seguir editando', exact: true }).click();
      await expect(editedPosition).toHaveValue('2');
      await reopened.getByRole('button', { name: 'Guardar posición', exact: true }).click();
      await expect.poll(() => capture.writes()[0]?.status).toBe(200);
      await expect(page.locator('[data-owner-dialog][open]')).toHaveCount(0);
      const saved = await readOwnerSnapshot(fixture, cookie);
      const savedGroup = group === 'ordinary' ? saved.order.ordinary : saved.order.featured;
      assert.deepEqual(savedGroup, [groupOrder[1], groupOrder[0]], 'the submitted position reorders only its own group');
      assert.deepEqual(group === 'ordinary' ? saved.order.featured : saved.order.ordinary,
        group === 'ordinary' ? initial.order.featured : initial.order.ordinary, 'the other group remains untouched');
      assert.equal(capture.writes().length, 1, 'only the explicit position save reaches the server');
      assert.equal(capture.writes()[0].body.destination, 2);
    } finally {
      await capture.stop();
    }
  });
}

for (const decision of ['saved', 'draft']) {
  test(`un acuse perdido sigue siendo incierto con datos similares hasta que la persona elige ${decision === 'saved' ? 'lo guardado' : 'su borrador'}`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const capture = await captureCreatorApi(page);
    const form = await openEditor(page, fixture);
    const draftName = 'Nombre que coincide con el guardado';
    await form.getByLabel('Nombre visible').fill(draftName);
    const lost = await holdProfileWriteAndLoseAcknowledgement(page);
    const save = form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    try {
      await lost.entered;
      assert.equal(lost.actual.status, 200, 'the actual write committed before the acknowledgement was lost');
      assert.equal((await api(fixture, cookie, '/api/creador/perfil')).body.profile.displayName, draftName,
        'a separate real owner read sees the committed value before any recovery decision');
      lost.release();
      await save;
      await expect(form.getByRole('button', { name: 'Comprobar estado guardado', exact: true })).toBeVisible();
      await expect(form).toContainText(/No sabemos si se guardó|No pudimos confirmar el resultado/i);
      assert.equal(ownerWrites(capture).length, 1, 'the lost acknowledgement does not trigger an automatic write retry');

      await form.getByRole('button', { name: 'Comprobar estado guardado', exact: true }).click();
      await expect(form.getByRole('button', { name: 'Usar lo guardado', exact: true })).toBeVisible();
      await expect(form.getByRole('button', { name: 'Volver al borrador', exact: true })).toBeVisible();
      await expect(form).toContainText(/No sabemos si se guardó|No pudimos confirmar el resultado/i);
      await expect(form.getByLabel('Nombre visible')).toHaveValue(draftName);
      assert.equal(ownerWrites(capture).length, 1, 'a GET showing the same value does not prove which request saved it');

      if (decision === 'saved') {
        await form.getByRole('button', { name: 'Usar lo guardado', exact: true }).click();
        await expect(page.getByRole('heading', { name: draftName, exact: true })).toBeVisible();
        if (await form.isVisible()) await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
        assert.equal(ownerWrites(capture).length, 1, 'choosing the saved snapshot consumes the draft without another write');
        const next = await openEditor(page, fixture);
        await next.getByLabel(/Ciudad/).fill('Mendoza');
        await next.getByRole('button', { name: 'Guardar datos', exact: true }).click();
      } else {
        await form.getByRole('button', { name: 'Volver al borrador', exact: true }).click();
        await expect(form.getByLabel('Nombre visible')).toHaveValue(draftName);
        assert.equal(ownerWrites(capture).length, 1, 'returning to the draft does not itself replay the earlier write');
        await form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
      }

      await expect.poll(() => ownerWrites(capture).length).toBe(2);
      await expect.poll(() => ownerWrites(capture).at(-1)?.status).toBe(200);
      const final = await api(fixture, cookie, '/api/creador/perfil');
      assert.equal(final.response.status, 200);
      assert.equal(final.body.profile.displayName, draftName);
      if (decision === 'saved') assert.equal(final.body.profile.city, 'Mendoza');
      assert.equal(ownerWrites(capture).length, 2, 'only the later explicit manual action creates another command');
    } finally {
      lost.release();
      await save.catch(() => {});
      await lost.remove();
    }
    await capture.stop({ skipErrorBodies: true });
  });
}

test('un conflicto compara el borrador crudo con la lectura actual y ofrece guardar o descartar de forma explícita', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const otherPage = await page.context().newPage();
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const otherCapture = await captureCreatorApi(otherPage);
  try {
    const firstForm = await openEditor(page, fixture);
    const draft = '  Borrador de Lucía  ';
    await firstForm.getByLabel('Nombre visible').fill(draft);
    const otherForm = await openEditor(otherPage, fixture);
    await otherForm.getByLabel('Nombre visible').fill('Nombre guardado en otra pestaña');
    await otherForm.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    await expect(otherPage.getByRole('heading', { name: 'Nombre guardado en otra pestaña', exact: true })).toBeVisible();

    await firstForm.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    await expect(firstForm.getByRole('button', { name: 'Guardar mi borrador', exact: true })).toBeVisible();
    await expect(firstForm.getByRole('button', { name: 'Usar lo guardado', exact: true })).toBeVisible();
    await expect(firstForm.getByLabel('Nombre visible')).toHaveValue(draft);
    await expect(firstForm).toContainText('Nombre guardado en otra pestaña');
    assert.equal(ownerWrites(capture).length, 1, 'the conflict itself cannot commit the retained draft');
    await expect.poll(() => ownerWrites(capture)[0].status).toBe(409);
    assert.equal(ownerWrites(capture)[0].status, 409, 'the first request received the real server conflict');

    await firstForm.getByRole('button', { name: 'Guardar mi borrador', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Borrador de Lucía', exact: true })).toBeVisible();
    assert.equal(ownerWrites(capture).length, 2, 'Guardar mi borrador is a distinct manual command against the displayed base');
    await expect.poll(() => ownerWrites(capture)[1].status).toBe(200);
    assert.equal(ownerWrites(capture)[1].status, 200, 'the server accepts the explicit save against its current version');
    assert.ok(JSON.stringify(ownerWrites(capture)[1].body).includes(draft), 'the request retains the raw draft for server normalization');
    assert.equal((await api(fixture, cookie, '/api/creador/perfil')).body.profile.displayName, 'Borrador de Lucía');

    const laterForm = await openEditor(page, fixture);
    await laterForm.getByLabel('Nombre visible').fill('Borrador que voy a descartar');
    const originalDraftCity = await laterForm.getByLabel(/Ciudad/).inputValue();
    const remoteForm = await openEditor(otherPage, fixture);
    await remoteForm.getByLabel(/Ciudad/).fill('Rosario');
    await remoteForm.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    await expect(otherPage.getByRole('heading', { name: 'Borrador de Lucía', exact: true })).toBeVisible();
    await laterForm.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    await expect(laterForm.getByRole('button', { name: 'Usar lo guardado', exact: true })).toBeVisible();
    await expect(laterForm.getByLabel(/Ciudad/)).toHaveValue(originalDraftCity);
    await expect(laterForm).toContainText('Rosario', 'the comparison shows current saved data without merging it into the frozen draft');
    const writesBeforeDiscard = ownerWrites(capture).length;
    await laterForm.getByRole('button', { name: 'Usar lo guardado', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Borrador de Lucía', exact: true })).toBeVisible();
    if (await laterForm.isVisible()) await laterForm.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(ownerWrites(capture).length, writesBeforeDiscard, 'discarding the conflict draft sends no mutation');

    const nextForm = await openEditor(page, fixture);
    await nextForm.getByLabel(/Ciudad/).fill('Mendoza');
    await nextForm.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    await expect.poll(() => ownerWrites(capture).length).toBe(4);
    await expect.poll(() => ownerWrites(capture).at(-1)?.status).toBe(200);
    const final = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(final.response.status, 200);
    assert.equal(final.body.profile.displayName, 'Borrador de Lucía');
    assert.equal(final.body.profile.city, 'Mendoza', 'a later ordinary save persists from the state explicitly adopted');
  } finally {
    await capture.stop({ skipErrorBodies: true });
    await otherCapture.stop({ skipErrorBodies: true });
    await otherPage.close();
  }
});

test('una respuesta de sesión de una lectura abortada al salir no aparece en la página siguiente', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  const sessionKey = fixtureSessionKey(fixture);
  const writes = trackProfileWrites(page);
  const form = await openEditor(page, fixture);
  await form.getByLabel('Nombre visible').fill('Guardado antes de perder el acuse');
  const lost = await holdProfileWriteAndLoseAcknowledgement(page);
  const save = form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
  let actualSessionFailure;
  const readEntered = deferred();
  const readGate = deferred();
  const finished = deferred();
  let readStarted = false;
  let abandoned = false;
  let handlerError;
  const lateRead = async (route) => {
    const request = route.request();
    if (readStarted || request.method() !== 'GET' || ownerPath(request) !== '/api/creador/perfil') {
      await route.fallback();
      return;
    }
    readStarted = true;
    try {
      await fixture.accountStore.deleteSession(sessionKey);
      const response = await route.fetch();
      actualSessionFailure = { status: response.status(), body: await response.json() };
      readEntered.resolve();
      await readGate.promise;
      await route.fulfill({ response });
    } catch (error) {
      if (!abandoned || !isAbandonedNavigationError(error)) handlerError = error;
    } finally {
      finished.resolve();
    }
  };
  await page.route('**/api/creador/**', lateRead);
  try {
    await lost.entered;
    assert.equal(lost.actual.status, 200, 'the profile command committed before its delivery was lost');
    lost.release();
    await save;
    await expect(form.getByRole('button', { name: /Comprobar/ })).toBeVisible();
    await form.getByRole('button', { name: /Comprobar/ }).click();
    await readEntered.promise;
    assert.equal(actualSessionFailure.status, 401, 'the delayed failure is the real owner endpoint response after session revocation');
    assert.equal(actualSessionFailure.body.error, 'AUTH_REQUIRED');

    abandoned = true;
    await page.goto(`${fixture.origin}/`);
    await expect(page).toHaveURL(`${fixture.origin}/`);
    readGate.resolve();
    await finished.promise;
    if (handlerError) throw handlerError;
    await expect(page.locator('[data-session-recovery-shell]')).toHaveCount(0);
    await expect(page.locator('[data-owner-root]')).toHaveCount(0);
    assert.equal(writes.requests.length, 1, 'only the original committed command was sent before departure');
  } finally {
    lost.release();
    readGate.resolve();
    await save.catch(() => {});
    if (readStarted) await finished.promise;
    await lost.remove();
    await page.unroute('**/api/creador/**', lateRead).catch(() => {});
    writes.stop();
  }
});

test('una lectura 401 obsoleta no altera el nuevo editor Redes del mismo documento', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const sessionKey = fixtureSessionKey(fixture);
  const writes = trackProfileWrites(page);
  const form = await openEditor(page, fixture);
  const current = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(current.response.status, 200);
  const draftName = 'Borrador descartado antes de la lectura vieja';
  await form.getByLabel('Nombre visible').fill(draftName);
  fixture.creatorStore.failNext('transact');
  const save = form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
  await save;
  await expect(form.getByRole('button', { name: /Comprobar/ })).toBeVisible();
  await expect.poll(() => writes.requests.length).toBe(1);
  await expect.poll(() => writes.responses.length).toBe(1);
  assert.equal(writes.responses[0].status, 503, 'the actual profile transaction fails before committing A');
  assert.equal((await api(fixture, cookie, '/api/creador/perfil')).body.profile.displayName, current.body.profile.displayName,
    'an independent owner read confirms the failed command did not change the saved profile');

  const readEntered = deferred();
  const readGate = deferred();
  const readFinished = deferred();
  let readStarted = false;
  let priorSession;
  let readResult;
  let readError;
  const holdOldSessionFailure = async (route) => {
    const request = route.request();
    if (readStarted || request.method() !== 'GET' || ownerPath(request) !== '/api/creador/perfil') {
      await route.fallback();
      return;
    }
    readStarted = true;
    try {
      priorSession = await fixture.accountStore.getSession(sessionKey);
      assert.ok(priorSession, 'the check starts in the original authenticated session');
      await fixture.accountStore.deleteSession(sessionKey);
      const response = await route.fetch();
      const body = await response.body();
      readResult = { status: response.status(), body: JSON.parse(body.toString('utf8')) };
      readEntered.resolve();
      await readGate.promise;
      await route.fulfill({ status: response.status(), headers: response.headers(), body });
    } catch (error) {
      readError = error;
      readEntered.resolve();
    } finally {
      readFinished.resolve();
    }
  };
  await page.route('**/api/creador/**', holdOldSessionFailure);
  let check;
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  try {
    check = form.getByRole('button', { name: /Comprobar/ }).click();
    await readEntered.promise;
    assert.equal(readResult.status, 401, 'the held GET response is the real result after session-store revocation');
    assert.equal(readResult.body.error, 'AUTH_REQUIRED');

    await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const prompt = page.locator('[data-owner-exit-prompt]');
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
    await expect(form).toHaveCount(0);
    await page.getByRole('button', { name: 'Editar redes', exact: true }).click();
    const next = page.locator('[data-owner-dialog] form[data-owner-form="redes"]');
    await expect(next).toBeVisible();
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin,
      'the old read and the new editor stay in one browser document');

    assert.equal(await fixture.accountStore.putSession(sessionKey, priorSession), true,
      'the test restores the same original session after observing its real 401');
    readGate.resolve();
    await readFinished.promise;
    await check;
    if (readError) throw readError;
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(next).toBeVisible();
    await expect(next.getByRole('button', { name: 'Guardar redes', exact: true })).toBeEnabled();
    await expect(page.locator('[data-session-recovery-shell]')).toHaveCount(0,
      'the abandoned A response cannot replace the new editor with stale session feedback');

    const website = 'https://example.invalid/manual-redes';
    await next.getByLabel('Sitio web o newsletter', { exact: true }).fill(website);
    await next.getByRole('button', { name: 'Guardar redes', exact: true }).click();
    await expect.poll(() => writes.requests.length).toBe(2);
    await expect.poll(() => writes.responses.length).toBe(2);
    assert.equal(writes.responses.at(-1)?.status, 200);
    const final = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(final.response.status, 200);
    assert.equal(final.body.profile.socials.website, website,
      'the later manual B save reaches the server and persists after A’s obsolete 401');
    assert.equal(writes.requests.length, 2, 'the only writes are failed A and explicit B; A is never replayed');
  } finally {
    readGate.resolve();
    if (readStarted) await readFinished.promise;
    if (priorSession && !(await fixture.accountStore.getSession(sessionKey))) {
      await fixture.accountStore.putSession(sessionKey, priorSession);
    }
    await page.unroute('**/api/creador/**', holdOldSessionFailure).catch(() => {});
    writes.stop();
    if (readError) throw readError;
  }
});

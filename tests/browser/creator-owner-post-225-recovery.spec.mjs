import assert from 'node:assert/strict';
import {
  test, expect, addCookie, api, readOwnerSnapshot, createSeries, addLink, addChapter, captureCreatorApi, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function ownerPath(request) {
  return new URL(request.url()).pathname.replace(/\/$/u, '');
}

function sessionKey(fixture) {
  const keys = [...fixture.accountStore.sessions.keys()].filter((key) => key.startsWith('SESSION#'));
  assert.equal(keys.length, 1);
  return keys[0];
}

async function holdNextOwnerRead(page) {
  const entered = deferred();
  const release = deferred();
  const finished = deferred();
  let handled = false;
  let actual;
  let handlerError;
  const handler = async (route) => {
    const request = route.request();
    if (handled || request.method() !== 'GET' || ownerPath(request) !== '/api/creador/perfil') {
      await route.fallback();
      return;
    }
    handled = true;
    try {
      entered.resolve();
      await release.promise;
      const response = await route.fetch();
      const body = await response.body();
      actual = { status: response.status(), body: JSON.parse(body.toString('utf8')) };
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
      if (handled) await finished.promise;
      await page.unroute('**/api/creador/**', handler).catch(() => {});
      if (handlerError) throw handlerError;
    },
  };
}

test('un movimiento confirmado que pierde su Series reconcilia la lista y el foco móvil', async ({ fixture, page }) => {
  await page.setViewportSize({ width: 390, height: 650 });
  const cookie = await loggedInOwner(fixture, page);
  const target = await createSeries(fixture, cookie, { name: 'Serie que desaparecerá', slug: 'serie-que-desaparecera' });
  const first = await addLink(fixture, cookie, { title: 'Primer capítulo de movimiento', url: 'https://links.example/post-225-first' });
  const second = await addLink(fixture, cookie, { title: 'Segundo capítulo de movimiento', url: 'https://links.example/post-225-second' });
  await addChapter(fixture, cookie, target.id, first.placementId);
  await addChapter(fixture, cookie, target.id, second.placementId);

  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let read;
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series&buscarSeries=desaparecera&serie=${encodeURIComponent(target.id)}`);
    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    const move = page.locator(`[data-chapter-row="${second.placementId}"] [data-chapter-move]`);
    await move.click();
    const form = page.locator('[data-owner-dialog] form[data-chapter-move-form]');
    await form.getByLabel('Posición en esta serie').fill('1');
    read = await holdNextOwnerRead(page);
    const save = form.getByRole('button', { name: 'Guardar posición', exact: true }).click();
    await read.entered;
    const current = await readOwnerSnapshot(fixture, cookie);
    const deletion = await api(fixture, cookie, `/api/creador/series/${encodeURIComponent(target.id)}`, {
      method: 'DELETE', body: { creatorVersion: current.creatorVersion },
    });
    assert.equal(deletion.response.status, 200, JSON.stringify(deletion.body));
    read.release();
    await save;
    await read.finished;
    assert.equal(read.actual.status, 200);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin,
      'the move reconciliation remains in the original owner document');

    await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
    await expect(page).toHaveURL((url) => url.searchParams.get('buscarSeries') === 'desaparecera' && !url.searchParams.has('serie'));
    const heading = page.locator('#owner-series-title');
    await expect(heading).toBeFocused();
    const box = await heading.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(box && viewport && box.y >= 0 && box.y + box.height <= viewport.height,
      `the list heading is visible after detail removal: ${JSON.stringify({ box, viewport })}`);
    assert.equal(capture.writes().filter(({ method, path }) => method === 'POST'
      && path === `/api/creador/series/${target.id}/capitulos/${second.placementId}/mover`).length, 1);
  } finally {
    read?.release();
    await read?.remove();
    await capture.stop({ skipErrorBodies: true });
  }
});

test('un DELETE de capítulo confirmado que pierde su Series devuelve a la lista y conserva el foco visible', async ({ fixture, page }) => {
  await page.setViewportSize({ width: 390, height: 650 });
  const cookie = await loggedInOwner(fixture, page);
  const target = await createSeries(fixture, cookie, { name: 'Serie eliminada al quitar', slug: 'serie-eliminada-al-quitar' });
  const survivor = await createSeries(fixture, cookie, { name: 'Serie que sobrevive', slug: 'serie-que-sobrevive' });
  const chapter = await addLink(fixture, cookie, { title: 'Capítulo quitado', url: 'https://links.example/post-225-delete' });
  await addChapter(fixture, cookie, target.id, chapter.placementId);
  await addChapter(fixture, cookie, survivor.id, chapter.placementId);

  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let read;
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series&buscarSeries=sobrevive&serie=${encodeURIComponent(target.id)}`);
    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    const remove = page.locator(`[data-chapter-row="${chapter.placementId}"] [data-chapter-remove]`);
    read = await holdNextOwnerRead(page);
    const removal = remove.click();
    await read.entered;
    const current = await readOwnerSnapshot(fixture, cookie);
    const deletion = await api(fixture, cookie, `/api/creador/series/${encodeURIComponent(target.id)}`, {
      method: 'DELETE', body: { creatorVersion: current.creatorVersion },
    });
    assert.equal(deletion.response.status, 200, JSON.stringify(deletion.body));
    read.release();
    await removal;
    await read.finished;
    assert.equal(read.actual.status, 200);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin,
      'the chapter DELETE reconciliation remains in the original owner document');

    await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
    await expect(page).toHaveURL((url) => url.searchParams.get('buscarSeries') === 'sobrevive' && !url.searchParams.has('serie'));
    await expect(page.locator(`[data-owner-series-row="${survivor.id}"]`)).toBeVisible();
    const heading = page.locator('#owner-series-title');
    await expect(heading).toBeFocused();
    const box = await heading.boundingBox();
    const viewport = page.viewportSize();
    assert.ok(box && viewport && box.y >= 0 && box.y + box.height <= viewport.height,
      `the list heading is visible after chapter DELETE and Series removal: ${JSON.stringify({ box, viewport })}`);
    assert.equal(capture.writes().filter(({ method, path }) => method === 'DELETE'
      && path === `/api/creador/series/${target.id}/capitulos/${chapter.placementId}`).length, 1);
  } finally {
    read?.release();
    await read?.remove();
    await capture.stop({ skipErrorBodies: true });
  }
});

test('un 401 tras confirmar un capítulo exige sesión, conserva stale y permite sólo GET y luego otro guardado', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Serie de sesión', slug: 'serie-de-sesion' });
  const chapter = await addLink(fixture, cookie, { title: 'Capítulo de sesión', url: 'https://links.example/post-225-session' });
  const key = sessionKey(fixture);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let readStarted = false;
  const failedRead = deferred();
  const firstRead = async (route) => {
    const request = route.request();
    if (readStarted || request.method() !== 'GET' || ownerPath(request) !== '/api/creador/perfil') {
      await route.fallback();
      return;
    }
    readStarted = true;
    await fixture.accountStore.deleteSession(key);
    const response = await route.fetch();
    const body = await response.body();
    assert.equal(response.status(), 401);
    await route.fulfill({ status: response.status(), headers: response.headers(), body });
    failedRead.resolve();
  };
  await page.route('**/api/creador/**', firstRead);
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series&buscarSeries=sesion&serie=${encodeURIComponent(series.id)}`);
    await page.locator(`[data-chapter-row="${chapter.placementId}"] [data-chapter-add]`).click();
    await failedRead.promise;
    await expect.poll(() => capture.writes().find(({ method, path }) => method === 'PUT'
      && path === `/api/creador/series/${series.id}/capitulos/${chapter.placementId}`)?.status).toBe(200);
    await expect(page.locator('[data-owner-series-chapters] [data-owner-stale]')).toBeVisible();
    const staleRetry = page.locator('[data-owner-series-chapters] [data-owner-refresh-retry]');
    await expect(staleRetry).toBeDisabled();
    const sessionCheck = page.locator('[data-session-recovery-check]:visible').first();
    await expect(sessionCheck).toBeEnabled();

    const renewed = await fixture.login();
    await addCookie(page.context(), fixture, renewed);
    await sessionCheck.click();
    await expect(page.locator('[data-session-recovery-shell]:visible')).toHaveCount(0);
    await expect(staleRetry).toBeEnabled();

    let retryAttempt = 0;
    const retryActualStatuses = [];
    const retryReads = [0, 1].map(() => ({ entered: deferred(), release: deferred() }));
    const retryFailure = async (route) => {
      const request = route.request();
      if (retryAttempt >= retryReads.length || request.method() !== 'GET' || ownerPath(request) !== '/api/creador/perfil') {
        await route.fallback();
        return;
      }
      const retryRead = retryReads[retryAttempt];
      retryAttempt += 1;
      retryRead.entered.resolve();
      await retryRead.release.promise;
      const response = await route.fetch();
      const body = await response.body();
      retryActualStatuses.push(response.status());
      await route.fulfill({ status: 503, headers: response.headers(), body });
    };
    await page.unroute('**/api/creador/**', firstRead);
    await page.route('**/api/creador/**', retryFailure);
    await staleRetry.click();
    await retryReads[0].entered.promise;
    retryReads[0].release.resolve();
    await expect(page.locator('[data-owner-series-chapters] [data-owner-stale]')).toBeVisible();
    await expect(staleRetry).toBeEnabled();
    await expect(staleRetry).toBeFocused();
    await staleRetry.click();
    await retryReads[1].entered.promise;
    const unrelatedFocus = page.locator('[data-chapter-search]');
    await unrelatedFocus.focus();
    await expect(unrelatedFocus).toBeFocused();
    retryReads[1].release.resolve();
    await expect(page.locator('[data-owner-series-chapters] [data-owner-stale]')).toBeVisible();
    await expect(staleRetry).toBeEnabled();
    assert.deepEqual(retryActualStatuses, [200, 200],
      'both failing recovery GETs reached the real owner endpoint before controlled 503 delivery');
    await expect(unrelatedFocus).toBeFocused();
    await page.unroute('**/api/creador/**', retryFailure);
    await staleRetry.click();
    await expect(page.locator('[data-owner-series-chapters] [data-owner-stale]')).toHaveCount(0);
    await expect(page.locator(`[data-chapter-row="${chapter.placementId}"] [data-chapter-remove]`)).toBeVisible();
    assert.equal(capture.writes().filter(({ method, path }) => method === 'PUT'
      && path === `/api/creador/series/${series.id}/capitulos/${chapter.placementId}`).length, 1);

    await page.getByRole('button', { name: 'Crear serie', exact: true }).click();
    const form = page.locator('[data-owner-dialog] form[data-owner-form="serie"]');
    await form.getByLabel('Nombre de la serie').fill('Serie después de sesión');
    await form.getByLabel('Dirección de la serie').fill('serie-despues-de-sesion');
    await form.getByRole('button', { name: 'Guardar serie', exact: true }).click();
    await expect.poll(() => capture.writes().find(({ method, path }) => method === 'POST'
      && path === '/api/creador/series' && path !== `/api/creador/series/${series.id}`)?.status).toBe(201);
    const final = await readOwnerSnapshot(fixture, renewed);
    assert.deepEqual(final.series[series.id].chapters, [chapter.placementId]);
    assert.ok(Object.values(final.series).some(({ slug }) => slug === 'serie-despues-de-sesion'));
  } finally {
    await page.unroute('**/api/creador/**', firstRead).catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

test('la publicación perdida y su lectura fallida tienen una sola recuperación visible', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let publicationSeen = false;
  let upstreamPublication;
  const lostPublication = async (route) => {
    const request = route.request();
    if (!publicationSeen && request.method() === 'POST' && ownerPath(request) === '/api/creador/perfil/publicar') {
      publicationSeen = true;
      const response = await route.fetch();
      const body = await response.body();
      upstreamPublication = { status: response.status(), body: JSON.parse(body.toString('utf8')) };
      await route.abort();
      return;
    }
    await route.fallback();
  };
  await page.route('**/api/creador/**', lostPublication);
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    await page.getByRole('button', { name: 'Publicar página', exact: true }).click();
    await expect.poll(() => upstreamPublication?.status).toBe(200);
    assert.equal(upstreamPublication.body.operation, 'publish-profile');
    await expect.poll(() => capture.writes().filter(({ method, path }) => method === 'POST'
      && path === '/api/creador/perfil/publicar').length).toBe(1);
    assert.equal(capture.writes().find(({ method, path }) => method === 'POST'
      && path === '/api/creador/perfil/publicar')?.status, undefined,
    'the page lost the upstream publication acknowledgement after the real request completed');
    await expect(page.locator('[data-owner-recovery]')).toHaveCount(1);
    await expect(page.locator('[data-owner-status]')).toHaveCount(0);
    const compare = page.getByRole('button', { name: /Comprobar(?: el)? estado guardado/iu });
    await expect(compare).toHaveCount(1);
    await compare.click();
    const useSaved = page.getByRole('button', { name: 'Usar lo guardado', exact: true });
    await expect(useSaved).toHaveCount(1);
    await expect(page.locator('[data-owner-recovery]')).toHaveCount(1);
    await expect(page.locator('[data-owner-status]')).toHaveCount(0);
    await useSaved.click();
    await expect(page.locator('[data-owner-recovery]')).toHaveCount(0);
    await expect(page.locator('[data-owner-public-copy]')).toContainText('publicada y visible');
    const persisted = await readOwnerSnapshot(fixture, cookie);
    assert.equal(persisted.profile.published, true);
    assert.ok(capture.records.some(({ method, path, status, responseBody }) => method === 'GET'
      && path === '/api/creador/perfil' && status === 200 && responseBody?.profile?.published === true),
    'the explicit full owner read installed the persisted publication');
    assert.equal(capture.writes().filter(({ method, path }) => method === 'POST'
      && path === '/api/creador/perfil/publicar').length, 1, 'adopting the saved publication never replays the write');
  } finally {
    await page.unroute('**/api/creador/**', lostPublication).catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

test('una publicación confirmada conserva una única recuperación cuando falla su lectura', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let publicationSeen = false;
  let refreshFailed = false;
  const failPublicationRead = async (route) => {
    const request = route.request();
    if (!publicationSeen && request.method() === 'POST' && ownerPath(request) === '/api/creador/perfil/publicar') {
      publicationSeen = true;
      const response = await route.fetch();
      const body = await response.body();
      await route.fulfill({ status: response.status(), headers: response.headers(), body });
      return;
    }
    if (publicationSeen && !refreshFailed && request.method() === 'GET' && ownerPath(request) === '/api/creador/perfil') {
      refreshFailed = true;
      const response = await route.fetch();
      const body = await response.body();
      await route.fulfill({ status: 503, headers: response.headers(), body });
      return;
    }
    await route.fallback();
  };
  await page.route('**/api/creador/**', failPublicationRead);
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    await page.getByRole('button', { name: 'Publicar página', exact: true }).click();
    const recovery = page.locator('[data-owner-recovery]');
    await expect(recovery).toHaveCount(1);
    await expect(recovery).toContainText(/actualiz|estado|publicación/iu);
    await expect(page.locator('[data-owner-status]')).toHaveCount(0);
    await expect(recovery).toHaveAttribute('data-owner-stale', 'true');
    await expect(recovery.getByRole('button', { name: 'Reintentar actualización', exact: true })).toHaveCount(1);
    await page.unroute('**/api/creador/**', failPublicationRead);
    await recovery.getByRole('button', { name: 'Reintentar actualización', exact: true }).click();
    await expect(page.locator('[data-owner-recovery]')).toHaveCount(0);
    await expect(page.locator('[data-owner-public-copy]')).toContainText('publicada y visible');
    assert.equal(capture.writes().filter(({ method, path }) => method === 'POST'
      && path === '/api/creador/perfil/publicar').length, 1);
  } finally {
    await page.unroute('**/api/creador/**', failPublicationRead).catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

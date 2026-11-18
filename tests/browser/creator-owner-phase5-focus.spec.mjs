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
  assert.equal(keys.length, 1, 'the fixture starts with one authenticated session');
  return keys[0];
}

async function assertWithinViewport(page, target, description) {
  const box = await target.boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box && viewport && box.x >= 0 && box.y >= 0
    && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
  `${description} stays in the viewport: ${JSON.stringify({ box, viewport })}`);
}

async function holdFailedOwnerRead(page, status = 503) {
  const entered = deferred();
  let handled = false;
  let actual;
  const handler = async (route) => {
    const request = route.request();
    if (handled || request.method() !== 'GET' || ownerPath(request) !== '/api/creador/perfil') {
      await route.fallback();
      return;
    }
    handled = true;
    const response = await route.fetch();
    const body = await response.body();
    actual = { status: response.status(), body: JSON.parse(body.toString('utf8')) };
    entered.resolve();
    await route.fulfill({ status, headers: response.headers(), body });
  };
  await page.route('**/api/creador/**', handler);
  return {
    entered: entered.promise,
    get actual() { return actual; },
    async remove() {
      await page.unroute('**/api/creador/**', handler).catch(() => {});
    },
  };
}

async function openSeriesDetail(page, fixture, seriesId, search = '') {
  const listSearch = search.replace(/&serie=[^&]*/u, '');
  await page.goto(`${fixture.origin}/cuenta/?vista=series${listSearch}`);
  await expect(page.locator(`[data-owner-series-row="${seriesId}"]`)).toBeVisible();
  await page.locator(`[data-owner-series-row="${seriesId}"]`).getByRole('link', { name: 'Gestionar capítulos', exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('serie') === seriesId);
}

for (const operation of ['add', 'remove']) {
  test(`el ${operation === 'add' ? 'Add' : 'Remove'} de capítulo conserva el efecto ante lectura fallida y permite la siguiente acción`, async ({ fixture, page }) => {
    await page.setViewportSize({ width: 390, height: 650 });
    const cookie = await loggedInOwner(fixture, page);
    const series = await createSeries(fixture, cookie, {
      name: `Recuperación ${operation}`,
      slug: `recuperacion-${operation}`,
    });
    const chapter = await addLink(fixture, cookie, {
      title: `Capítulo ${operation}`,
      url: `https://links.example/phase5-${operation}`,
    });
    if (operation === 'remove') await addChapter(fixture, cookie, series.id, chapter.placementId);

    const query = `&buscarSeries=recuperacion&serie=${encodeURIComponent(series.id)}&buscarCapitulos=Capítulo&pertenencia=todos`;
    await openSeriesDetail(page, fixture, series.id, query);
    const activeUrl = page.url();
    const capture = await captureCreatorApi(page, { skipErrorBodies: true });
    const failedRead = await holdFailedOwnerRead(page);
    const commandMethod = operation === 'add' ? 'PUT' : 'DELETE';
    const commandPath = `/api/creador/series/${series.id}/capitulos/${chapter.placementId}`;

    try {
      await page.locator(`[data-chapter-row="${chapter.placementId}"]`)
        .getByRole('button', { name: operation === 'add' ? 'Agregar capítulo' : 'Quitar capítulo', exact: true }).click();
      await failedRead.entered;
      await expect.poll(() => capture.writes().find(({ method, path }) => method === commandMethod && path === commandPath)?.status)
        .toBe(200);
      assert.equal(failedRead.actual.status, 200, 'the browser received a real owner read before the controlled failure');

      const committed = await readOwnerSnapshot(fixture, cookie);
      assert.deepEqual(committed.series[series.id].chapters, operation === 'add' ? [chapter.placementId] : []);
      assert.equal(capture.writes().filter(({ method, path }) => method === commandMethod && path === commandPath).length, 1,
        'the chapter command is sent once');
      await expect(page.locator('[data-owner-series-chapters] [data-owner-stale]')).toBeVisible();
      await expect(page).toHaveURL(activeUrl);

      await failedRead.remove();
      const retry = page.locator('[data-owner-series-chapters] [data-owner-refresh-retry]');
      await expect(retry).toBeEnabled();
      await retry.click();
      await expect(page.locator('[data-owner-series-chapters] [data-owner-stale]')).toHaveCount(0);
      await expect(page).toHaveURL(activeUrl);
      await expect(page.locator(`[data-chapter-row="${chapter.placementId}"]`)
        .getByRole('button', { name: operation === 'add' ? 'Quitar capítulo' : 'Agregar capítulo', exact: true })).toBeVisible();
      assert.equal(capture.writes().filter(({ method, path }) => method === commandMethod && path === commandPath).length, 1,
        'retrying the read does not replay the chapter command');

      const nextMethod = operation === 'add' ? 'DELETE' : 'PUT';
      const nextButton = operation === 'add' ? 'Quitar capítulo' : 'Agregar capítulo';
      await page.locator(`[data-chapter-row="${chapter.placementId}"]`).getByRole('button', { name: nextButton, exact: true }).click();
      await expect.poll(() => capture.writes().filter(({ method, path }) => method === nextMethod && path === commandPath).length).toBe(1);
      await expect.poll(() => capture.writes().find(({ method, path }) => method === nextMethod && path === commandPath)?.status).toBe(200);
      const afterNextAction = await readOwnerSnapshot(fixture, cookie);
      assert.deepEqual(afterNextAction.series[series.id].chapters, operation === 'add' ? [] : [chapter.placementId]);
      assert.equal(capture.writes().filter(({ path }) => path === commandPath).length, 2,
        'the later chapter action is the only second write');
    } finally {
      await failedRead.remove();
      await capture.stop({ skipErrorBodies: true });
    }
  });
}

test('un Add incierto compara el estado guardado, conserva la URL y no repite la escritura', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Serie de comparación', slug: 'serie-de-comparacion' });
  const chapter = await addLink(fixture, cookie, {
    title: 'Capítulo de comparación',
    url: 'https://links.example/phase5-compare',
  });
  await openSeriesDetail(page, fixture, series.id, '&buscarSeries=comparacion&pertenencia=todos');
  const activeUrl = page.url();
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let commandHandled = false;
  const commandPath = `/api/creador/series/${series.id}/capitulos/${chapter.placementId}`;
  const loseAcknowledgement = async (route) => {
    const request = route.request();
    if (commandHandled || request.method() !== 'PUT' || ownerPath(request) !== commandPath) {
      await route.fallback();
      return;
    }
    commandHandled = true;
    const response = await route.fetch();
    assert.equal(response.status(), 200, 'the real Add command commits before its acknowledgement is lost');
    await response.body();
    await route.abort('failed');
  };
  await page.route('**/api/creador/**', loseAcknowledgement);
  try {
    await page.locator(`[data-chapter-row="${chapter.placementId}"] [data-chapter-add]`).click();
    const recovery = page.locator('[data-owner-list-recovery="series"][data-recovery-kind="unknown"]');
    await expect(recovery).toBeVisible();
    const compare = recovery.locator('[data-owner-compare]');
    await expect(compare).toBeVisible();
    assert.equal(capture.writes().filter(({ method, path }) => method === 'PUT' && path === commandPath).length, 1);
    const persisted = await readOwnerSnapshot(fixture, cookie);
    assert.deepEqual(persisted.series[series.id].chapters, [chapter.placementId]);
    await expect(page).toHaveURL(activeUrl);

    await page.unroute('**/api/creador/**', loseAcknowledgement);
    await compare.click();
    await expect(recovery).toContainText(/elige cómo continuar|guardado/iu);
    const useSaved = recovery.locator('[data-owner-use-saved]');
    await expect(useSaved).toBeVisible();
    assert.equal(capture.writes().filter(({ method, path }) => method === 'PUT' && path === commandPath).length, 1,
      'the comparison is read-only');
    await useSaved.click();
    await expect(recovery).toHaveCount(0);
    await expect(page.locator('#owner-chapter-search')).toBeFocused();
    await expect(page).toHaveURL(activeUrl);

    await page.locator(`[data-chapter-row="${chapter.placementId}"] [data-chapter-remove]`).click();
    await expect.poll(() => capture.writes().filter(({ method, path }) => method === 'DELETE' && path === commandPath).length).toBe(1);
    await expect.poll(() => capture.writes().find(({ method, path }) => method === 'DELETE' && path === commandPath)?.status).toBe(200);
    assert.equal(capture.writes().filter(({ path }) => path === commandPath).length, 2,
      'the next action is an explicit Remove, not a replay of Add');
  } finally {
    await page.unroute('**/api/creador/**', loseAcknowledgement).catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

test('el modal sin editor mantiene la recuperación 401 dentro de su superficie y no repite el Add tras verificar la sesión', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Serie sin editor', slug: 'serie-sin-editor' });
  const chapter = await addLink(fixture, cookie, { title: 'Capítulo sin editor', url: 'https://links.example/phase5-no-editor' });
  await openSeriesDetail(page, fixture, series.id, '&buscarSeries=sin-editor&pertenencia=todos');
  const activeUrl = page.url();
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const key = sessionKey(fixture);
  const failedRead = deferred();
  let readHandled = false;
  const expireRead = async (route) => {
    const request = route.request();
    if (readHandled || request.method() !== 'GET' || ownerPath(request) !== '/api/creador/perfil') {
      await route.fallback();
      return;
    }
    readHandled = true;
    await fixture.accountStore.deleteSession(key);
    const response = await route.fetch();
    assert.equal(response.status(), 401, 'the real owner read sees the revoked session');
    const body = await response.body();
    await route.fulfill({ status: 401, headers: response.headers(), body });
    failedRead.resolve();
  };
  await page.route('**/api/creador/**', expireRead);
  const commandPath = `/api/creador/series/${series.id}/capitulos/${chapter.placementId}`;
  try {
    await page.locator(`[data-chapter-row="${chapter.placementId}"] [data-chapter-add]`).click();
    await failedRead.promise;
    await expect.poll(() => capture.writes().find(({ method, path }) => method === 'PUT' && path === commandPath)?.status).toBe(200);
    await expect(page.locator('[data-session-recovery-shell]:visible')).toBeVisible();
    const writesBeforeSession = capture.writes().length;
    const readsBeforeSession = capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length;

    await page.goBack();
    const prompt = page.locator('[data-owner-dialog][open] [data-owner-exit-prompt]');
    await expect(prompt).toBeVisible();
    await expect(page).toHaveURL(activeUrl);
    const sessionCheck = page.locator('[data-owner-dialog][open] [data-session-recovery-check]').first();
    await expect(sessionCheck).toBeVisible();
    const renewed = await fixture.login();
    await addCookie(page.context(), fixture, renewed);
    await sessionCheck.click();
    await expect(page.locator('[data-owner-dialog][open] [data-session-recovery-shell]')).toHaveCount(0);
    assert.equal(capture.writes().length, writesBeforeSession, 'session verification never replays Add');
    assert.equal(capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length,
      readsBeforeSession, 'session verification does not read creator content');
    assert.equal(capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/sesion').length, 1);

    const retry = prompt.locator('[data-owner-refresh-retry]');
    await expect(retry).toHaveCount(1);
    await expect(retry).toBeEnabled();
    await expect(retry).toBeFocused();
    await assertWithinViewport(page, retry, 'the no-editor modal retry after session verification');
    await page.unroute('**/api/creador/**', expireRead);
    await retry.press('Enter');
    await expect.poll(() => capture.records.filter(({ method, path, status }) => method === 'GET'
      && path === '/api/creador/perfil' && status === 200).length).toBe(1);
    await expect(page.locator('[data-owner-dialog][open] [data-owner-refresh-retry]')).toHaveCount(0);
    assert.equal(capture.writes().length, writesBeforeSession, 'the read-only retry never replays Add');
    assert.deepEqual((await readOwnerSnapshot(fixture, renewed)).series[series.id].chapters, [chapter.placementId]);

    await prompt.getByRole('button', { name: 'Seguir a la página solicitada', exact: true }).click();
    await expect(page).toHaveURL((url) => !url.searchParams.has('serie'));
  } finally {
    await page.unroute('**/api/creador/**', expireRead).catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

test('la lectura que elimina la serie seleccionada adopta el capítulo y conserva el foco de la lista', async ({ fixture, page }) => {
  await page.setViewportSize({ width: 390, height: 650 });
  const cookie = await loggedInOwner(fixture, page);
  const target = await createSeries(fixture, cookie, { name: 'Serie que desaparece', slug: 'serie-que-desaparece' });
  const survivor = await createSeries(fixture, cookie, { name: 'Serie superviviente', slug: 'serie-superviviente' });
  const chapter = await addLink(fixture, cookie, { title: 'Capítulo adoptado', url: 'https://links.example/phase5-adoption' });
  await addChapter(fixture, cookie, survivor.id, chapter.placementId);
  await openSeriesDetail(page, fixture, target.id, '&buscarSeries=serie&pertenencia=todos');
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const readReady = deferred();
  let handled = false;
  const deleteBeforeRead = async (route) => {
    const request = route.request();
    if (handled || request.method() !== 'GET' || ownerPath(request) !== '/api/creador/perfil') {
      await route.fallback();
      return;
    }
    handled = true;
    const current = await readOwnerSnapshot(fixture, cookie);
    const deletion = await api(fixture, cookie, `/api/creador/series/${encodeURIComponent(target.id)}`, {
      method: 'DELETE', body: { creatorVersion: current.creatorVersion },
    });
    assert.equal(deletion.response.status, 200, JSON.stringify(deletion.body));
    const response = await route.fetch();
    const body = await response.body();
    assert.equal(response.status(), 200);
    await route.fulfill({ status: 200, headers: response.headers(), body });
    readReady.resolve(JSON.parse(body.toString('utf8')));
  };
  await page.route('**/api/creador/**', deleteBeforeRead);
  const commandPath = `/api/creador/series/${target.id}/capitulos/${chapter.placementId}`;
  try {
    await page.locator(`[data-chapter-row="${chapter.placementId}"] [data-chapter-add]`).click();
    await readReady.promise;
    await expect.poll(() => capture.writes().find(({ method, path }) => method === 'PUT' && path === commandPath)?.status).toBe(200);
    await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
    await expect(page).toHaveURL((url) => url.searchParams.get('buscarSeries') === 'serie' && !url.searchParams.has('serie'));
    await expect(page.locator('#owner-series-title')).toBeFocused();
    await assertWithinViewport(page, page.locator('#owner-series-title'), 'the list heading after selected-series loss');
    await expect(page.locator(`[data-owner-series-row="${survivor.id}"]`)).toBeVisible();
    assert.equal(capture.writes().filter(({ method, path }) => method === 'PUT' && path === commandPath).length, 1,
      'adoption after selected-series loss does not replay Add');
    const current = await readOwnerSnapshot(fixture, cookie);
    assert.equal(current.series[target.id], undefined);
    assert.deepEqual(current.series[survivor.id].chapters, [chapter.placementId]);

    await page.locator(`[data-owner-series-row="${survivor.id}"]`).getByRole('link', { name: 'Gestionar capítulos', exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('serie') === survivor.id);
    await expect(page.locator(`[data-chapter-row="${chapter.placementId}"] [data-chapter-remove]`)).toBeVisible();
  } finally {
    await page.unroute('**/api/creador/**', deleteBeforeRead).catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

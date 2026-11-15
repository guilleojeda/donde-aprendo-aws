import assert from 'node:assert/strict';
import { completeLogin, cookiePair } from '../fixtures/account-auth.mjs';
import {
  test,
  expect,
  addCookie,
  api,
  createSeries,
  addLink,
  captureCreatorApi,
  seriesRow,
  loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

function dataForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
}

function sessionCheck(page) {
  return page.locator('[data-owner-dialog][open] [data-session-recovery-check]');
}

async function openSeries(page, fixture, suffix = '') {
  await page.goto(`${fixture.origin}/cuenta/?vista=series${suffix}`);
  await expect(page.getByRole('heading', { name: 'Series', exact: true })).toBeVisible();
}

async function openDataEditor(page) {
  await page.getByRole('button', { name: 'Editar datos' }).click();
  const form = dataForm(page);
  await expect(form).toBeVisible();
  return form;
}

async function ensureDataEditor(page) {
  const form = dataForm(page);
  if (await form.isVisible()) return form;
  return openDataEditor(page);
}

function gate() {
  let release;
  let entered;
  const blocked = new Promise((resolve) => { entered = resolve; });
  const waiting = new Promise((resolve) => { release = resolve; });
  return { blocked, release, entered, waiting };
}

async function installOtherAccount(page, fixture) {
  const oidc = fixture.accountHarness.state.oidc;
  const previousClaims = oidc.claims;
  oidc.claims = { ...(previousClaims ?? {}), sub: 'second-browser-owner', email: 'otra-cuenta@example.invalid' };
  let result;
  try {
    result = await completeLogin(fixture.accountHarness);
  } finally {
    if (previousClaims === undefined) delete oidc.claims;
    else oidc.claims = previousClaims;
  }
  assert.equal(result.response.status, 303, 'the second identity uses the real account callback');
  assert.ok(result.sessionCookie);
  const pair = cookiePair(result.sessionCookie);
  const separator = pair.indexOf('=');
  const cookie = { pair, name: pair.slice(0, separator), value: pair.slice(separator + 1) };
  await addCookie(page.context(), fixture, cookie);
  return cookie;
}

test('el nombre y el slug elegidos en la primera ficha sobreviven a la hidratación tardía en Series', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  let releaseScripts;
  let notifyScript;
  const scriptsRequested = new Promise((resolve) => { notifyScript = resolve; });
  const scriptsReleased = new Promise((resolve) => { releaseScripts = resolve; });
  const blocker = async (route) => {
    if (route.request().resourceType() === 'script') {
      notifyScript();
      await scriptsReleased;
    }
    await route.continue();
  };
  await page.route('**/*', blocker);

  let navigation;
  const capture = await captureCreatorApi(page);
  try {
    navigation = page.goto(`${fixture.origin}/cuenta/?vista=series&buscarSeries=aplicada`, { waitUntil: 'load' });
    await scriptsRequested;

    const createForm = page.locator('form[data-owner-form="crear"]');
    const name = createForm.getByLabel('Nombre visible');
    const slug = createForm.getByLabel('Dirección de tu página');
    await expect(name).toBeVisible();
    await expect(slug).toBeVisible();
    await name.fill('Nombre elegido antes de cargar');
    await slug.fill('direccion-elegida');
    await expect(page.getByRole('button', { name: 'Crear borrador' })).toBeDisabled();
    await expect(page.locator('astro-island')).toHaveAttribute('ssr', '');
    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);

    releaseScripts();
    await navigation;
    await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
    await expect(page.getByRole('button', { name: 'Crear borrador' })).toBeEnabled();
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin,
      'the test must observe hydration of the document whose SSR fields were edited');
    await expect(name).toHaveValue('Nombre elegido antes de cargar');
    await expect(slug).toHaveValue('direccion-elegida');

    await page.getByRole('button', { name: 'Crear borrador' }).click();
    await capture.settle();
    const created = capture.writes().find(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
    assert.ok(created, 'the first-profile action reaches the real profile endpoint');
    assert.equal(created.status, 200);
    assert.equal(created.body.displayName, 'Nombre elegido antes de cargar');
    assert.equal(created.body.slug, 'direccion-elegida');
    assert.equal(created.body.creatorVersion, null);
    const stored = await fixture.rawOwner(cookie);
    assert.equal(created.responseBody.operation, 'save-profile');
    assert.equal(stored.profile.displayName, 'Nombre elegido antes de cargar');
    assert.equal(stored.profile.slug, 'direccion-elegida');
    assert.equal(stored.profile.version, created.responseBody.creatorVersion);
  } finally {
    releaseScripts();
    await navigation?.catch(() => {});
    await page.unroute('**/*', blocker).catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

test('la búsqueda sin aplicar sobrevive a la hidratación y la acción siguiente usa ese texto', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const first = await createSeries(fixture, cookie, { name: 'Serie aplicada', slug: 'serie-aplicada' });
  const second = await createSeries(fixture, cookie, { name: 'Serie pendiente', slug: 'serie-pendiente' });
  let releaseListScripts;
  let notifyListScript;
  const listScriptRequested = new Promise((resolve) => { notifyListScript = resolve; });
  const listScriptRelease = new Promise((resolve) => { releaseListScripts = resolve; });
  const listBlocker = async (route) => {
    if (route.request().resourceType() === 'script') {
      notifyListScript();
      await listScriptRelease;
    }
    await route.continue();
  };
  await page.route('**/*', listBlocker);
  let listNavigation;
  try {
    listNavigation = page.goto(`${fixture.origin}/cuenta/?vista=series&buscarSeries=aplicada`, { waitUntil: 'load' });
    await listScriptRequested;
    await expect(seriesRow(page, first.id)).toBeVisible();
    await expect(seriesRow(page, second.id)).toHaveCount(0);
    const search = page.getByLabel('Buscar series');
    await search.fill('pendiente');
    assert.equal(new URL(page.url()).searchParams.get('buscarSeries'), 'aplicada',
      'the typed query remains separate from the query that produced the SSR rows');
    await expect(page.locator('astro-island')).toHaveAttribute('ssr', '');
    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    releaseListScripts();
    await listNavigation;
    await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
    await expect(page.getByRole('button', { name: 'Crear serie', exact: true })).toBeEnabled();
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin,
      'the pending query and the next action must belong to the edited SSR document');
    await expect(search).toHaveValue('pendiente');
    await expect(seriesRow(page, first.id)).toBeVisible();
    await expect(seriesRow(page, second.id)).toHaveCount(0);
    await page.getByRole('button', { name: 'Aplicar búsqueda' }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('buscarSeries') === 'pendiente');
    await expect(seriesRow(page, second.id)).toBeVisible();
    await expect(seriesRow(page, first.id)).toHaveCount(0);
  } finally {
    releaseListScripts();
    await listNavigation?.catch(() => {});
    await page.unroute('**/*', listBlocker).catch(() => {});
  }
});

test('un rechazo antes del commit conserva la verdad guardada y no repite el guardado al comprobar', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profileFields: { city: 'Córdoba' } });
  const initial = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page);
  await openSeries(page, fixture);
  const form = await openDataEditor(page);
  await form.getByLabel('Nombre visible').fill('Corrección que no se guardará');

  let rejected = 0;
  const rejectBeforeHandler = async (route) => {
    if (route.request().method() === 'PUT'
      && new URL(route.request().url()).pathname.replace(/\/$/u, '') === '/api/creador/perfil') {
      rejected += 1;
      await route.abort();
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', rejectBeforeHandler);
  try {
    await form.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(form.getByRole('button', { name: 'Comprobar estado guardado', exact: true })).toBeVisible();
  } finally {
    await page.unroute('**/api/creador/**', rejectBeforeHandler).catch(() => {});
  }

  assert.equal(rejected, 1);
  assert.deepEqual((await fixture.rawOwner(cookie)).profile, initial.profile,
    'the controlled transport failure happened before the real handler and left storage unchanged');
  await form.getByRole('button', { name: 'Comprobar estado guardado', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Usar lo guardado', exact: true })).toBeVisible();
  await expect(form).toContainText('Ana Browser');
  await expect(form).toContainText('Corrección que no se guardará');
  assert.equal(capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').length, 1,
    'checking performs a read and does not replay the failed PUT');
  await form.getByRole('button', { name: 'Usar lo guardado', exact: true }).click();
  await expect(form).not.toBeVisible();
  assert.deepEqual((await fixture.rawOwner(cookie)).profile, initial.profile);
  const persisted = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(persisted.response.status, 200);
  assert.equal(persisted.body.profile.displayName, initial.profile.displayName);
  assert.equal(persisted.body.profile.city, initial.profile.city);
  const reopened = await openDataEditor(page);
  await expect(reopened.getByLabel('Nombre visible')).toHaveValue('Ana Browser');
  await expect(reopened.getByLabel(/Ciudad/)).toHaveValue('Córdoba');
  await reopened.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
  await capture.stop();
});

test('recuperar la misma sesión conserva el borrador y nunca repite la escritura automáticamente', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page);
  const writeCsrfTokens = [];
  const rememberWriteToken = (request) => {
    const path = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() === 'PUT' && path === '/api/creador/perfil') {
      writeCsrfTokens.push(request.headers()['x-csrf-token']);
    }
  };
  page.on('request', rememberWriteToken);
  await openSeries(page, fixture);
  const form = await openDataEditor(page);
  await form.getByLabel('Nombre visible').fill('Borrador tras recuperar sesión');

  let unauthorized = 0;
  const loseSessionBeforeHandler = async (route) => {
    if (route.request().method() === 'PUT'
      && new URL(route.request().url()).pathname.replace(/\/$/u, '') === '/api/creador/perfil' && unauthorized === 0) {
      unauthorized += 1;
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'AUTH_REQUIRED' }) });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', loseSessionBeforeHandler);
  try {
    await form.getByRole('button', { name: 'Guardar datos' }).click();
    await expect(sessionCheck(page)).toBeVisible();
    await sessionCheck(page).click();
    await expect(sessionCheck(page)).toBeHidden();
  } finally {
    await page.unroute('**/api/creador/**', loseSessionBeforeHandler).catch(() => {});
  }

  await expect(form.getByLabel('Nombre visible')).toHaveValue('Borrador tras recuperar sesión');
  assert.deepEqual((await fixture.rawOwner(cookie)).profile, initial.profile,
    'same-account CSRF recovery does not adopt data or replay the rejected request');
  const profileWrites = capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
  assert.equal(profileWrites.length, 1);
  const sessionReads = capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/sesion');
  assert.equal(sessionReads.length, 1);
  assert.equal(sessionReads[0].status, 200, 'session recovery goes through the real same-context endpoint');
  assert.equal(writeCsrfTokens.length, 1);
  assert.equal(writeCsrfTokens[0], sessionReads[0].responseBody.csrfToken,
    'the manual retry uses the token returned by the same-account session read');

  await form.getByRole('button', { name: 'Guardar datos' }).click();
  await capture.settle();
  const writesAfterManualSave = capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
  assert.equal(writesAfterManualSave.length, 2, 'the second request exists only after the person manually saves again');
  assert.equal(writesAfterManualSave[1].body.creatorVersion, initial.profile.version);
  assert.equal(writesAfterManualSave[1].body.displayName, 'Borrador tras recuperar sesión');
  assert.equal(writesAfterManualSave[1].status, 200);
  const final = await fixture.rawOwner(cookie);
  assert.equal(final.profile.displayName, 'Borrador tras recuperar sesión');
  assert.ok(final.profile.version > initial.profile.version);
  assert.equal(writeCsrfTokens.length, 2);
  assert.equal(writeCsrfTokens[1], sessionReads[0].responseBody.csrfToken);
  page.off('request', rememberWriteToken);
  await capture.stop();
});

// The mismatch must remain recoverable in the original document. These cases
// extend the existing blocked-account/role checks through the next real save.
for (const mismatch of ['cuenta', 'rol']) {
  test(`restaurar el contexto original (${mismatch}) conserva el editor y permite guardar manualmente`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const original = await fixture.rawOwner(cookie);
    const capture = await captureCreatorApi(page);
    await openSeries(page, fixture);
    const form = await openDataEditor(page);
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    await form.getByLabel('Nombre visible').fill('Corrección de cuenta original');
    const account = [...fixture.accountStore.accounts.values()].find((row) => row.identity.sub ===
      [...fixture.accountStore.sessions.values()][0].identity.sub);
    assert.ok(account);

    // Absence is an auth prerequisite; the actual application returns 401.
    await page.context().clearCookies({ name: cookie.name });
    await form.getByRole('button', { name: 'Guardar datos' }).click();
    await expect(sessionCheck(page)).toBeVisible();
    let other;
    if (mismatch === 'cuenta') other = await installOtherAccount(page, fixture);
    else {
      fixture.accountStore.seedAccount({ ...account, isAdmin: true });
      await addCookie(page.context(), fixture, cookie);
    }
    await sessionCheck(page).click();
    await capture.settle();
    const reads = capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/sesion');
    assert.equal(reads[0]?.status, 409, 'the real bound session endpoint rejects the wrong account/role');
    assert.equal(reads[0].responseBody.error, 'SESSION_CONTEXT_CHANGED');
    assert.equal(Object.hasOwn(reads[0].responseBody, 'csrfToken'), false);
    await expect(page.locator('[data-owner-dialog] [data-session-recovery-status]')).toContainText(/otra cuenta|otros permisos/i);
    await expect(form.getByLabel('Nombre visible')).toHaveValue('Corrección de cuenta original');
    await expect(form.getByRole('button', { name: 'Guardar datos' })).toBeDisabled();
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, original.profile);
    if (other) {
      const otherOwner = await fixture.rawOwner(other);
      assert.notEqual(otherOwner.principal.accountId, original.principal.accountId);
      assert.equal(otherOwner.owner ?? null, null);
      assert.equal(otherOwner.profile, null, 'another account inherits no profile or private content');
    } else {
      const changedRole = await fixture.principal(cookie);
      assert.equal(changedRole.accountId, original.principal.accountId);
      assert.notEqual(changedRole.isAdmin, original.principal.isAdmin);
    }
    assert.equal(capture.writes().length, 1, 'mismatch does not replay the rejected PUT');
    assert.equal(capture.writes()[0].status, 401);

    await expect(sessionCheck(page)).toBeEnabled();
    await expect(page.locator('main [data-session-recovery-check]')).toBeEnabled();
    // A repeated check under the wrong context remains safe and retryable.
    await sessionCheck(page).click();
    await capture.settle();
    assert.equal(capture.records.filter(({ method, path, status }) => method === 'GET'
      && path === '/api/creador/sesion' && status === 409).length, 2);
    await expect(sessionCheck(page)).toBeEnabled();
    if (mismatch === 'rol') fixture.accountStore.seedAccount(account);
    const renewed = await fixture.login();
    await addCookie(page.context(), fixture, renewed);
    const ownerReadsBefore = capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length;
    await sessionCheck(page).click();
    await expect(sessionCheck(page)).toHaveCount(0);
    await capture.settle();
    const restored = capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/sesion').at(-1);
    assert.equal(restored.status, 200);
    const principal = await fixture.principal(renewed);
    assert.equal(principal.accountId, original.principal.accountId);
    assert.equal(principal.isAdmin, original.principal.isAdmin);
    assert.equal(restored.responseBody.csrfToken, principal.csrfToken);
    assert.notEqual(principal.csrfToken, original.principal.csrfToken);
    await expect(page.locator('[data-account-logout] input[name="csrfToken"]')).toHaveValue(principal.csrfToken);
    assert.equal(capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length, ownerReadsBefore,
      'session checking does not read or adopt content');
    assert.equal(capture.writes().length, 1, 'session restoration performs no write');
    assert.deepEqual((await fixture.rawOwner(renewed)).profile, original.profile);
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin, 'the same edited document is retained');
    await expect(form.getByLabel('Nombre visible')).toHaveValue('Corrección de cuenta original');
    await expect(form.getByRole('button', { name: 'Guardar datos' })).toBeEnabled();
    const savedRequest = page.waitForRequest((request) => request.method() === 'PUT'
      && new URL(request.url()).pathname.replace(/\/$/u, '') === '/api/creador/perfil');
    await form.getByRole('button', { name: 'Guardar datos' }).click();
    assert.equal((await savedRequest).headers()['x-csrf-token'], principal.csrfToken);
    await capture.settle();
    assert.equal(capture.writes().length, 2);
    assert.equal(capture.writes()[1].status, 200);
    assert.equal(capture.writes()[1].body.creatorVersion, original.profile.version);
    const final = await fixture.rawOwner(renewed);
    assert.equal(final.profile.displayName, 'Corrección de cuenta original');
    assert.ok(final.profile.version > original.profile.version);
    const fresh = await api(fixture, renewed, '/api/creador/perfil');
    assert.equal(fresh.response.status, 200);
    assert.equal(fresh.body.profile.id, final.profile.id);
    assert.equal(fresh.body.creatorVersion, final.profile.version);
    assert.equal(fresh.body.profile.displayName, final.profile.displayName);
    await capture.stop();
  });
}

test('un fallo del resumen no bloquea capítulos y el detalle privado no aparece en la página pública', async ({ fixture, page, publicPage }) => {
  const cookie = await loggedInOwner(fixture, page);
  const beforePublication = await api(fixture, cookie, '/api/creador/perfil');
  const publication = await api(fixture, cookie, '/api/creador/perfil/publicar', {
    method: 'POST', body: { creatorVersion: beforePublication.body.creatorVersion },
  });
  assert.equal(publication.response.status, 200);
  const series = await createSeries(fixture, cookie, { name: 'Serie sin bloqueo', slug: 'serie-sin-bloqueo' });
  const link = await addLink(fixture, cookie, { title: 'Capítulo pese al resumen', url: 'https://links.example/actividad-fallida' });
  const before = await api(fixture, cookie, '/api/creador/perfil');
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  let statisticsRequest;
  const summaryResponse = page.waitForResponse((response) => new URL(response.url()).pathname.startsWith('/api/creador/estadisticas'));
  await page.route('**/api/creador/estadisticas/**', async (route) => {
    statisticsRequest = route.request();
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      headers: { 'cache-control': 'private, no-store' },
      body: JSON.stringify({ error: 'STATISTICS_UNAVAILABLE' }),
    });
  });
  await openSeries(page, fixture);
  const statsResponse = await summaryResponse;
  const activityStatus = page.getByRole('status').filter({ hasText: /estadísticas/i }).first();
  await expect(activityStatus).toContainText(/no pudimos cargar/i);
  assert.ok(statisticsRequest, 'the published Series view asks for the private summary');
  assert.equal(statsResponse.status(), 503);
  assert.match(statsResponse.headers()['cache-control'] ?? '', /private.*no-store/i);

  await seriesRow(page, series.id).getByRole('link', { name: 'Gestionar capítulos' }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('serie') === series.id);
  await page.getByRole('button', { name: 'Agregar capítulo' }).click();
  await capture.settle();
  const chapterPath = `/api/creador/series/${series.id}/capitulos/${link.placementId}`;
  const chapterWrite = capture.writes().find(({ method, path }) => method === 'PUT' && path === chapterPath);
  assert.ok(chapterWrite, 'the real Series action remains available after the activity request fails');
  assert.equal(chapterWrite.status, 200);
  assert.equal(chapterWrite.body.creatorVersion, before.body.creatorVersion);
  assert.equal(chapterWrite.responseBody.operation, 'add-chapter');
  const after = await api(fixture, cookie, '/api/creador/perfil');
  assert.ok(after.body.creatorVersion > before.body.creatorVersion);
  assert.deepEqual(after.body.series[series.id].chapters, [link.placementId]);

  const publicResponse = await publicPage.goto(`${fixture.origin}/c/${encodeURIComponent(after.body.profile.slug)}/series/${encodeURIComponent(series.slug)}/`);
  assert.equal(publicResponse?.status(), 200);
  const publicHtml = await publicPage.content();
  assert.doesNotMatch(publicHtml, /Estadísticas de tu página|Visitantes estimados|Clics en enlaces/u,
    'the private owner summary is absent from the public Series HTML');
  assert.equal(publicHtml.includes('STATISTICS_UNAVAILABLE'), false);
  await capture.stop();
});

test('el logout estático espera la escritura, respeta la corrección pendiente y envía una sola solicitud', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page);
  await openSeries(page, fixture);
  const accountMenu = page.locator('.creator-owner__account-menu');
  const accountMenuSummary = accountMenu.locator(':scope > summary');
  if (!await accountMenu.evaluate((element) => element.open)) await accountMenuSummary.click();
  const logoutForm = page.locator('form[data-account-logout]');
  await expect(logoutForm.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled();
  const logoutNode = await logoutForm.elementHandle();
  const logoutRequests = [];
  const logoutResponses = [];
  const logoutCaptureFailures = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/cuenta/salir/' && request.method() === 'POST') logoutRequests.push(request);
  });
  const captureLogoutResponse = async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    let response;
    try {
      response = await route.fetch();
      const rawBody = await response.body();
      logoutResponses.push({ status: response.status(), headers: response.headers(), body: JSON.parse(rawBody.toString('utf8')) });
    } catch (error) {
      logoutCaptureFailures.push(error);
      if (response) await route.fulfill({ response }).catch(() => {});
      else await route.abort().catch(() => {});
      return;
    }
    try {
      await route.fulfill({ response });
    } catch (error) {
      logoutCaptureFailures.push(error);
      await route.abort().catch(() => {});
    }
  };
  await page.route('**/cuenta/salir/', captureLogoutResponse);
  const writeGate = gate();
  const holdDataWrite = async (route) => {
    if (route.request().method() !== 'PUT'
      || new URL(route.request().url()).pathname.replace(/\/$/u, '') !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    writeGate.entered();
    await writeGate.waiting;
    await route.fulfill({ response });
  };
  await page.route('**/api/creador/**', holdDataWrite);
  const form = await openDataEditor(page);
  await form.getByLabel('Nombre visible').fill('Guardado antes de salir');
  let save;
  try {
    save = form.getByRole('button', { name: 'Guardar datos' }).click();
    await writeGate.blocked;
    await logoutForm.evaluate((formElement) => formElement.requestSubmit());
    await expect(form.locator('[data-owner-form-status="datos"]')).toContainText(/espera a que termine antes de salir/i);
    assert.equal(logoutRequests.length, 0, 'the static logout slot does not submit while a real write is in flight');
    writeGate.release();
    await save;
  } finally {
    writeGate.release();
    await save?.catch(() => {});
    await page.unroute('**/api/creador/**', holdDataWrite).catch(() => {});
  }
  await capture.settle();
  const savedProfile = capture.writes().find(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
  assert.equal(savedProfile?.status, 200);
  assert.equal(savedProfile?.body.creatorVersion, initial.profile.version);
  assert.equal(savedProfile?.responseBody.operation, 'save-profile');
  const afterProfileSave = await fixture.rawOwner(cookie);
  assert.ok(afterProfileSave.profile.version > initial.profile.version);
  assert.equal(afterProfileSave.profile.displayName, 'Guardado antes de salir');
  assert.equal(savedProfile.responseBody.creatorVersion, afterProfileSave.profile.version);

  assert.equal(await logoutNode.evaluate((node) => node.isConnected && node === document.querySelector('form[data-account-logout]')), true,
    'the Astro logout form stays the same DOM node across the confirmed shared profile write');
  if (!await accountMenu.evaluate((element) => element.open)) await accountMenuSummary.click();
  await expect(logoutForm.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled();
  const correctionForm = await ensureDataEditor(page);
  await correctionForm.getByLabel('Nombre visible').fill('Corrección que requiere decisión');
  await logoutForm.evaluate((formElement) => formElement.requestSubmit());
  await expect(page.getByRole('alertdialog')).toBeVisible();
  assert.equal(logoutRequests.length, 0, 'dirty state opens the guard before logout is submitted');
  await page.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await logoutForm.evaluate((formElement) => formElement.requestSubmit());
  await page.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect.poll(() => logoutResponses.length).toBe(1);
  assert.deepEqual(logoutCaptureFailures, [], 'the real logout response is read before the browser receives it');
  assert.equal(logoutResponses[0].status, 200);
  assert.match(logoutResponses[0].headers['cache-control'] ?? '', /private.*no-store/i);
  assert.equal(logoutRequests.length, 1, 'discarding the correction resumes exactly one static logout submission');
  assert.equal(new URL(logoutResponses[0].body.redirect).pathname, '/logout');
  assert.equal((await fixture.principal(cookie)).state, 'anonymous', 'the real account service revoked the session');
  await page.unroute('**/cuenta/salir/', captureLogoutResponse);
  await capture.stop();
});

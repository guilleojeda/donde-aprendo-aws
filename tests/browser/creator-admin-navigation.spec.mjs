import assert from 'node:assert/strict';
import { completeLogin, cookiePair, makeAccount, makeIdentity } from '../fixtures/account-auth.mjs';
import { expect, test, addCookie } from '../fixtures/creator-browser-test.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';

const adminPath = '/cuenta/administracion/';
const root = (page) => page.locator('[data-creator-admin]');
const row = (page, id) => page.locator(`[data-admin-resource="${id}"]`);

function resource(id, index) {
  return {
    id,
    title: `Recurso administrativo ${index}`,
    url: `https://admin-fixture.example.invalid/${id}`,
    description: '',
    category: 'Serverless',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    order: index,
    featured: false,
    published: false,
    directoryApproval: 'pending',
    directoryControl: 'editorial',
    version: 1,
  };
}

async function prepareAdmin(fixture, page, ids) {
  const cookie = await fixture.login();
  for (const [key, account] of fixture.accountStore.accounts) {
    fixture.accountStore.accounts.set(key, { ...account, isAdmin: true });
  }
  await addCookie(page.context(), fixture, cookie);
  for (const [index, id] of ids.entries()) {
    await seedResource(fixture.creatorStore, resource(id, index));
  }
  return cookie;
}

async function openAdmin(fixture, page, ids) {
  const cookie = await prepareAdmin(fixture, page, ids);
  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();
  return cookie;
}

async function loginAsSeparateOwner(fixture, sub, email) {
  const identity = makeIdentity({ sub });
  fixture.accountStore.seedAccount(makeAccount({ identity, email }));
  const oldClaims = fixture.accountHarness.state.oidc.claims;
  fixture.accountHarness.state.oidc.claims = { sub, email };
  try {
    const result = await completeLogin(fixture.accountHarness);
    assert.equal(result.response.status, 303, 'the owner account uses the real account callback');
    const pair = cookiePair(result.sessionCookie);
    return { pair, name: 'da_session', value: pair.slice('da_session='.length) };
  } finally {
    if (oldClaims === undefined) delete fixture.accountHarness.state.oidc.claims;
    else fixture.accountHarness.state.oidc.claims = oldClaims;
  }
}

function watchAdminWrites(page) {
  const writes = [];
  const onRequest = (request) => {
    const method = request.method();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/admin/') || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
    writes.push({ method, path: url.pathname.replace(/\/$/u, ''), status: undefined, request });
  };
  const onResponse = (response) => {
    const write = writes.find((candidate) => candidate.request === response.request());
    if (write) write.status = response.status();
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  return {
    writes,
    stop() {
      page.off('request', onRequest);
      page.off('response', onResponse);
    },
  };
}

async function nativeDecision(page, action, choice) {
  const originalUrl = page.url();
  const originalDocumentTime = await page.evaluate(() => performance.timeOrigin);
  if (choice === 'dismiss') page.setDefaultNavigationTimeout(3_000);
  const dialogPromise = page.waitForEvent('dialog', { timeout: 3_000 });
  const actionResult = action().then((value) => ({ value }), (error) => ({ error }));
  try {
    const dialog = await dialogPromise;
    const type = dialog.type();
    await dialog[choice]();
    assert.equal(type, 'beforeunload');
    const outcome = await actionResult;
    if (outcome.error) {
      const isExpectedCancelledNavigation = choice === 'dismiss'
        && /Timeout|ERR_ABORTED/iu.test(outcome.error.message);
      assert.equal(isExpectedCancelledNavigation, true,
        `only a cancelled native navigation may reject its Playwright action: ${outcome.error.message}`);
    }
    if (choice === 'dismiss') {
      assert.equal(page.url(), originalUrl, 'native Cancel leaves the current URL in place');
      assert.equal(await page.evaluate(() => performance.timeOrigin), originalDocumentTime,
        'native Cancel keeps the same document active');
    }
  } finally {
    if (choice === 'dismiss') page.setDefaultNavigationTimeout(30_000);
  }
}

async function cleanNativeTransition(page, action) {
  const dialogs = [];
  const onDialog = async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  };
  page.on('dialog', onDialog);
  const navigation = page.waitForNavigation({ timeout: 7_500 }).catch((error) => error);
  let actionError;
  let result;
  try {
    try {
      await action();
    } catch (error) {
      actionError = error;
    }
    result = await navigation;
  } finally {
    page.off('dialog', onDialog);
  }
  assert.deepEqual(dialogs, [], 'a clean/reverted document has no native beforeunload prompt');
  if (actionError) throw actionError;
  if (result instanceof Error) throw result;
  return result;
}

async function reloadWithoutDialog(page) {
  return cleanNativeTransition(page, () => page.reload());
}

async function saveClassificationAndWaitForCleanReload(page, id) {
  const responsePromise = page.waitForResponse((response) => response.request().method() === 'PATCH'
    && new URL(response.url()).pathname === `/api/admin/recursos/${id}/`);
  const navigation = cleanNativeTransition(page,
    () => row(page, id).getByRole('button', { name: 'Guardar clasificación' }).click());
  const response = await responsePromise;
  assert.equal(response.status(), 200, 'the real classification save succeeds');
  await navigation;
  return response;
}

async function markDocument(page) {
  return page.evaluate(() => {
    window.__adminNavigationDocument = `admin-document-${Math.random()}`;
    return window.__adminNavigationDocument;
  });
}

test('structural moderation keeps a different draft through GET filter Cancel, save, readback, and Leave', async ({ fixture, page }) => {
  const ids = ['admin-draft-a', 'admin-moderation-b'];
  await openAdmin(fixture, page, ids);
  const writes = watchAdminWrites(page);
  const originalUrl = page.url();

  try {
    await row(page, ids[0]).getByLabel('Categoría').fill('Seguridad');
    const moderationResponse = page.waitForResponse((response) => response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/admin/recursos/${ids[1]}/ocultar/`);
    await row(page, ids[1]).getByRole('button', { name: 'Ocultar recurso' }).click();
    assert.equal((await moderationResponse).status(), 200, 'the real structural moderation request succeeds');
    await expect(page.locator('[data-view-transition-shell]')).toBeVisible();
    await expect(row(page, ids[0]).getByLabel('Categoría')).toHaveValue('Seguridad');

    await page.locator('input[name="q"]').fill(ids[0]);
    await nativeDecision(page,
      () => page.getByRole('button', { name: 'Buscar y filtrar' }).click(),
      'dismiss');
    await expect(page).toHaveURL(originalUrl);
    await expect(row(page, ids[0]).getByLabel('Categoría')).toHaveValue('Seguridad');
    assert.equal(writes.writes.length, 1, 'cancelling native GET navigation performs no additional write');

    await saveClassificationAndWaitForCleanReload(page, ids[0]);
    const saved = await fixture.rawResource(ids[0]);
    assert.equal(saved.category, 'Seguridad', 'storage readback confirms the correction was persisted');
    assert.equal(saved.version, 2);
    assert.deepEqual(writes.writes.map(({ method, status }) => [method, status]), [['POST', 200], ['PATCH', 200]]);
    assert.equal((await fixture.rawResource(ids[1])).hidden, true, 'the structural action itself was persisted');

    await expect(row(page, ids[0]).getByLabel('Categoría')).toHaveValue('Seguridad');

    const marker = await markDocument(page);
    await row(page, ids[0]).getByLabel('Categoría').fill('Corrección sin guardar');
    await page.locator('input[name="q"]').fill(ids[0]);
    await nativeDecision(page,
      () => page.getByRole('button', { name: 'Buscar y filtrar' }).click(),
      'accept');
    await expect(page).toHaveURL((url) => url.pathname === adminPath && url.searchParams.get('q') === ids[0]);
    assert.equal(await page.evaluate(() => window.__adminNavigationDocument ?? null), null,
      'Leave replaced the document instead of only changing a message or URL');
    await expect(row(page, ids[0]).getByLabel('Categoría')).toHaveValue('Seguridad');
    assert.notEqual(marker, await page.evaluate(() => window.__adminNavigationDocument ?? null));
    assert.equal((await fixture.rawResource(ids[0])).category, 'Seguridad');
    assert.equal(writes.writes.length, 2, 'native Leave does not save or replay the discarded correction');
  } finally {
    writes.stop();
  }
});

test('an SSR correction made before the real admin module loads remains dirty after structural moderation', async ({ fixture, page }) => {
  const ids = ['admin-before-module-a', 'admin-before-module-b'];
  const cookie = await fixture.login();
  for (const [key, account] of fixture.accountStore.accounts) {
    fixture.accountStore.accounts.set(key, { ...account, isAdmin: true });
  }
  await addCookie(page.context(), fixture, cookie);
  for (const [index, id] of ids.entries()) await seedResource(fixture.creatorStore, resource(id, index));

  let allowModule;
  let notifyHeldModule;
  const moduleGate = new Promise((resolve) => { allowModule = resolve; });
  const heldModule = new Promise((resolve) => { notifyHeldModule = resolve; });
  const holdRealAdminModule = async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200, 'the actual admin module response is fetched and held unchanged');
    notifyHeldModule();
    await moduleGate;
    await route.fulfill({ response });
  };
  await page.route('**/src/scripts/creator-admin.ts', holdRealAdminModule);
  try {
    await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`, { waitUntil: 'commit' });
    await expect(root(page)).toBeVisible();
    await heldModule;
    await expect(row(page, ids[0]).getByLabel('Categoría')).toHaveValue('Serverless');
    await row(page, ids[0]).getByLabel('Categoría').fill('Seguridad antes de cargar el módulo');

    allowModule();
    await page.waitForLoadState('load');
    const moderationResponse = page.waitForResponse((response) => response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/admin/recursos/${ids[1]}/ocultar/`);
    await row(page, ids[1]).getByRole('button', { name: 'Ocultar recurso' }).click();
    assert.equal((await moderationResponse).status(), 200, 'the real structural write still succeeds');
    await expect(page.locator('[data-view-transition-shell]')).toBeVisible();
    await expect(page.locator('[data-view-transition]')).toContainText('Tus campos se conservan');
    await expect(row(page, ids[0]).getByLabel('Categoría')).toHaveValue('Seguridad antes de cargar el módulo');
    assert.equal((await fixture.rawResource(ids[0])).category, 'Serverless', 'the early correction is still a local draft');
    assert.equal((await fixture.rawResource(ids[1])).hidden, true, 'moderation B was persisted independently');

    const originalUrl = page.url();
    await page.locator('input[name="q"]').fill(ids[0]);
    await nativeDecision(page,
      () => page.getByRole('button', { name: 'Buscar y filtrar' }).click(),
      'dismiss');
    await expect(page).toHaveURL(originalUrl);
    await expect(row(page, ids[0]).getByLabel('Categoría')).toHaveValue('Seguridad antes de cargar el módulo');
  } finally {
    allowModule();
    await page.unroute('**/src/scripts/creator-admin.ts', holdRealAdminModule).catch(() => {});
  }
});

test('refresh, paging, and reload use the native guard and discard only after Leave', async ({ fixture, page }) => {
  const ids = Array.from({ length: 26 }, (_, index) => `admin-page-${String(index).padStart(2, '0')}`);
  await openAdmin(fixture, page, ids);
  await expect(page.getByRole('navigation', { name: 'Paginación de recursos' })).toContainText('Página 1 de 2');

  await row(page, ids[0]).getByLabel('Categoría').fill('Cambio antes de refrescar');
  const moderationResponse = page.waitForResponse((response) => response.request().method() === 'POST'
    && new URL(response.url()).pathname === `/api/admin/recursos/${ids[1]}/ocultar/`);
  await row(page, ids[1]).getByRole('button', { name: 'Ocultar recurso' }).click();
  assert.equal((await moderationResponse).status(), 200, 'a real structural action makes the contextual refresh control available');
  await expect(page.locator('[data-view-transition-shell]')).toBeVisible();
  assert.equal((await fixture.rawResource(ids[1])).hidden, true);

  await nativeDecision(page, () => page.locator('[data-refresh-view]').click(), 'dismiss');
  await expect(page).toHaveURL((url) => url.pathname === adminPath && url.searchParams.get('page') === '1');
  await expect(row(page, ids[0]).getByLabel('Categoría')).toHaveValue('Cambio antes de refrescar');

  await nativeDecision(page,
    () => page.getByRole('link', { name: 'Página siguiente' }).click(),
    'dismiss');
  await expect(page.getByRole('navigation', { name: 'Paginación de recursos' })).toContainText('Página 1 de 2');
  await expect(row(page, ids[0]).getByLabel('Categoría')).toHaveValue('Cambio antes de refrescar');

  await nativeDecision(page,
    () => page.getByRole('link', { name: 'Página siguiente' }).click(),
    'accept');
  await expect(page).toHaveURL((url) => url.searchParams.get('page') === '2');
  await expect(row(page, ids[25])).toBeVisible();
  await expect(row(page, ids[0])).toHaveCount(0);
  assert.equal((await fixture.rawResource(ids[0])).category, 'Serverless', 'pagination Leave discards, rather than persists, the draft');

  await row(page, ids[25]).getByLabel('Categoría').fill('Cambio antes de recargar');
  await nativeDecision(page, () => page.reload(), 'dismiss');
  await expect(page).toHaveURL((url) => url.searchParams.get('page') === '2');
  await expect(row(page, ids[25]).getByLabel('Categoría')).toHaveValue('Cambio antes de recargar');

  await nativeDecision(page, () => page.reload(), 'accept');
  await expect(row(page, ids[25]).getByLabel('Categoría')).toHaveValue('Serverless');
  assert.equal((await fixture.rawResource(ids[25])).category, 'Serverless', 'reload Leave does not write the local correction');
});

test('a reverted field is clean; own saves commit a baseline and late corrections remain dirty', async ({ fixture, page }) => {
  const id = 'admin-baseline';
  await openAdmin(fixture, page, [id]);
  const writes = watchAdminWrites(page);

  const category = row(page, id).getByLabel('Categoría');
  await category.fill('Temporal');
  await category.fill('Serverless');
  await reloadWithoutDialog(page);
  await expect(category).toHaveValue('Serverless');
  assert.equal((await fixture.rawResource(id)).version, 1, 'reverting to baseline performs no write');

  await category.fill('Clasificación propia');
  await saveClassificationAndWaitForCleanReload(page, id);
  assert.equal((await fixture.rawResource(id)).category, 'Clasificación propia');
  await expect(row(page, id).getByLabel('Categoría')).toHaveValue('Clasificación propia');

  let releaseResponse;
  let responseHeld;
  const held = new Promise((resolve) => { responseHeld = resolve; });
  const gate = new Promise((resolve) => { releaseResponse = resolve; });
  const holdActualWrite = async (route) => {
    if (route.request().method() !== 'PATCH' || !route.request().postData()?.includes('Valor enviado')) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    assert.equal(response.status(), 200, 'the backend performs the real classification write before its response is held');
    responseHeld(response);
    await gate;
    await route.fulfill({ response });
  };
  await page.route(`**/api/admin/recursos/${id}/`, holdActualWrite);
  try {
    await category.fill('Valor enviado');
    await row(page, id).getByRole('button', { name: 'Guardar clasificación' }).click();
    await held;
    await category.fill('Corrección posterior');
    releaseResponse();
    await expect(row(page, id).locator('[data-item-status]')).toContainText('Clasificación guardada');
    await expect(category).toHaveValue('Corrección posterior');
    assert.equal((await fixture.rawResource(id)).category, 'Valor enviado',
      'the server persisted only the submitted snapshot while the newer correction stayed local');

    await nativeDecision(page, () => page.reload(), 'dismiss');
    await expect(category).toHaveValue('Corrección posterior');

    fixture.creatorStore.failNext('transact', new Error('controlled storage failure after the real route reaches the store'));
    await category.fill('Cambio con guardado fallido');
    const failedSave = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && new URL(response.url()).pathname === `/api/admin/recursos/${id}/`);
    await row(page, id).getByRole('button', { name: 'Guardar clasificación' }).click();
    assert.equal((await failedSave).status(), 503, 'the actual admin endpoint reports the controlled storage failure');
    await expect(category).toHaveValue('Cambio con guardado fallido');
    assert.equal((await fixture.rawResource(id)).category, 'Valor enviado', 'failed save leaves persisted state unchanged');
    await nativeDecision(page, () => page.reload(), 'dismiss');
    await expect(category).toHaveValue('Cambio con guardado fallido');

    await saveClassificationAndWaitForCleanReload(page, id);
    assert.equal((await fixture.rawResource(id)).category, 'Cambio con guardado fallido',
      'a failed save remains manually retryable and the retry persists its correction');
    await expect(row(page, id).getByLabel('Categoría')).toHaveValue('Cambio con guardado fallido');
    assert.deepEqual(writes.writes.map(({ method, status }) => [method, status]), [
      ['PATCH', 200], ['PATCH', 200], ['PATCH', 503], ['PATCH', 200],
    ], 'the failure and explicit retry are two distinct real writes');
  } finally {
    releaseResponse();
    await page.unroute(`**/api/admin/recursos/${id}/`, holdActualWrite).catch(() => {});
    writes.stop();
  }
});

test('exit links and browser Back keep drafts on Cancel and really leave on confirmation', async ({ fixture, page }) => {
  await page.goto(fixture.origin);
  await openAdmin(fixture, page, ['admin-history']);
  const adminUrl = page.url();
  await row(page, 'admin-history').getByLabel('Categoría').fill('Historial local');

  await nativeDecision(page,
    () => page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Inicio', exact: true }).click(),
    'dismiss');
  await expect(page).toHaveURL(adminUrl);
  await expect(row(page, 'admin-history').getByLabel('Categoría')).toHaveValue('Historial local');

  await nativeDecision(page, () => page.goBack(), 'dismiss');
  await expect(page).toHaveURL(adminUrl);
  await expect(row(page, 'admin-history').getByLabel('Categoría')).toHaveValue('Historial local');

  await nativeDecision(page, () => page.goBack(), 'accept');
  await expect(page).toHaveURL(fixture.origin + '/');
  await expect(root(page)).toHaveCount(0);
});

test('GET filter controls stay clean and same-document, new-tab, and modifier navigation remain native', async ({ fixture, page }) => {
  await openAdmin(fixture, page, ['admin-native']);
  const cleanDialogs = [];
  const onDialog = async (dialog) => {
    cleanDialogs.push(dialog.type());
    await dialog.dismiss();
  };
  const externalTarget = async (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Admin link target</title>' });
  await page.context().route('https://admin-fixture.example.invalid/**', externalTarget);
  page.on('dialog', onDialog);
  try {
    await page.locator('input[name="q"]').fill('admin-native');
    await page.getByRole('button', { name: 'Buscar y filtrar' }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('q') === 'admin-native');
    assert.deepEqual(cleanDialogs, [], 'changing GET-only filter values does not make an admin correction dirty');

    await row(page, 'admin-native').getByLabel('Categoría').fill('Cambio conservado');
    const marker = await markDocument(page);
    await page.getByRole('link', { name: 'Saltar al contenido' }).focus();
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL((url) => url.hash === '#contenido');
    assert.equal(await page.evaluate(() => window.__adminNavigationDocument), marker,
      'a fragment-only navigation keeps the active document');
    await expect(row(page, 'admin-native').getByLabel('Categoría')).toHaveValue('Cambio conservado');

    const popupPromise = page.waitForEvent('popup');
    await row(page, 'admin-native').getByRole('link', { name: 'https://admin-fixture.example.invalid/admin-native' })
      .click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL('https://admin-fixture.example.invalid/admin-native');
    await popup.close();

    const modifierPopupPromise = page.context().waitForEvent('page');
    await page.getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Inicio', exact: true }).click({ modifiers: ['ControlOrMeta'] });
    const modifierPopup = await modifierPopupPromise;
    await modifierPopup.waitForURL(`${fixture.origin}/`);
    await modifierPopup.close();
    await expect(page).toHaveURL((url) => url.hash === '#contenido' && url.searchParams.get('q') === 'admin-native');
    await expect(row(page, 'admin-native').getByLabel('Categoría')).toHaveValue('Cambio conservado');
    assert.deepEqual(cleanDialogs, [], 'same-document and modifier/new-tab actions do not prompt or replace the dirty document');
  } finally {
    page.off('dialog', onDialog);
    await page.context().unroute('https://admin-fixture.example.invalid/**', externalTarget);
  }
});

test('dirty logout is cancelled before its real request; clean logout revokes the session', async ({ fixture, page }) => {
  const id = 'admin-logout';
  const cookie = await prepareAdmin(fixture, page, [id]);
  const initialPrincipal = await fixture.principal(cookie);
  let releaseModule;
  let notifyModuleHeld;
  let notifyModuleSettled;
  const moduleGate = new Promise((resolve) => { releaseModule = resolve; });
  const moduleHeld = new Promise((resolve) => { notifyModuleHeld = resolve; });
  const moduleSettled = new Promise((resolve) => { notifyModuleSettled = resolve; });
  const holdAdminModule = async (route) => {
    try {
      const response = await route.fetch();
      assert.equal(response.status(), 200, 'the real admin controller module is held unchanged');
      notifyModuleHeld();
      await moduleGate;
      await route.fulfill({ response });
    } finally {
      notifyModuleSettled();
    }
  };
  await page.route('**/src/scripts/creator-admin.ts', holdAdminModule);

  const logoutRequests = [];
  const onRequest = (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/cuenta/salir/') logoutRequests.push(request);
  };
  page.on('request', onRequest);
  try {
    await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`, { waitUntil: 'commit' });
    await expect(root(page)).toBeVisible();
    await moduleHeld;
    await row(page, id).getByLabel('Categoría').fill('Corrección antes del controlador');
    // Arrange the real account script before the delayed admin controller. Its
    // default disabled markup alone must not supply the protection under test.
    await page.evaluate(async () => { await import('/src/scripts/account-logout.ts'); });
    const logoutForm = page.locator('[data-account-logout]');
    await expect(logoutForm).toBeVisible();
    const logoutButton = logoutForm.getByRole('button', { name: 'Cerrar sesión' });
    const buttonBounds = await logoutButton.boundingBox();
    assert.ok(buttonBounds, 'the server-rendered logout control is visible while the controller is delayed');
    await page.mouse.click(buttonBounds.x + buttonBounds.width / 2, buttonBounds.y + buttonBounds.height / 2);
    assert.equal(logoutRequests.length, 0, 'the pre-controller native activation cannot submit logout');
    assert.equal((await fixture.principal(cookie)).state, 'authenticated');

    releaseModule();
    await page.waitForLoadState('load');
    await expect(logoutButton).toBeEnabled();

    await row(page, id).getByLabel('Categoría').fill('Antes de salir');
    await logoutButton.click();
    await expect.poll(async () => (await root(page).locator('[data-admin-status]:visible, [data-account-logout-status]:visible').allInnerTexts()).join(' '))
      .toMatch(/guarda|revierte/i);
    assert.equal(logoutRequests.length, 0, 'dirty logout is cancelled before account-auth receives its session mutation request');
    assert.equal((await fixture.principal(cookie)).state, 'authenticated', 'the real session remains usable after the cancellation');
    await expect(row(page, id).getByLabel('Categoría')).toHaveValue('Antes de salir');

    // Expire the existing session in the account fixture, then complete a real
    // same-account login and the bound session check before saving or logging out.
    for (const key of fixture.accountStore.sessions.keys()) fixture.accountStore.sessions.delete(key);
    const expiredWrite = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && new URL(response.url()).pathname === `/api/admin/recursos/${id}/`);
    await row(page, id).getByRole('button', { name: 'Guardar clasificación' }).click();
    assert.equal((await expiredWrite).status(), 401, 'the actual admin endpoint observes the expired session');
    await expect(root(page).locator('[data-session-recovery-check]')).toBeVisible();
    await expect(row(page, id).getByLabel('Categoría')).toHaveValue('Antes de salir');

    const renewedCookie = await fixture.login();
    const renewedPrincipal = await fixture.principal(renewedCookie);
    assert.equal(renewedPrincipal.state, 'authenticated');
    assert.equal(renewedPrincipal.accountId, initialPrincipal.accountId, 'the renewed browser session is the same account');
    await addCookie(page.context(), fixture, renewedCookie);
    const checkResponse = page.waitForResponse((response) => response.request().method() === 'GET'
      && new URL(response.url()).pathname === '/api/creador/sesion/');
    await root(page).locator('[data-session-recovery-check]').click();
    const sessionResponse = await checkResponse;
    assert.equal(sessionResponse.status(), 200, 'the real bound session check confirms the renewed session');
    const checkedSession = await sessionResponse.json();
    assert.equal(checkedSession.csrfToken, renewedPrincipal.csrfToken);
    await expect(logoutForm.locator('input[name="csrfToken"]')).toHaveValue(checkedSession.csrfToken,
      'session recovery updates the existing logout form token');
    await expect(row(page, id).getByLabel('Categoría')).toHaveValue('Antes de salir');

    await saveClassificationAndWaitForCleanReload(page, id);
    assert.equal((await fixture.rawResource(id)).category, 'Antes de salir');

    const logoutResponse = page.waitForResponse((response) => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/cuenta/salir/');
    await logoutButton.click();
    assert.equal((await logoutResponse).status(), 200, 'clean logout uses the real account script and endpoint');
    await expect(page).toHaveURL((url) => url.pathname === '/cuenta/');
    assert.equal(logoutRequests.length, 1, 'only the later clean logout reaches account-auth');
    assert.equal((await fixture.principal(renewedCookie)).state, 'anonymous', 'the clean logout actually revokes the renewed fixture session');
  } finally {
    releaseModule();
    await moduleSettled;
    await page.unroute('**/src/scripts/creator-admin.ts', holdAdminModule).catch(() => {});
    page.off('request', onRequest);
  }
});

test('a real partial claim commits its stale selections while another admin draft alone guards GET navigation', async ({ fixture, page }) => {
  const ids = ['admin-partial-a', 'admin-partial-b', 'admin-partial-c', 'admin-partial-draft'];
  await openAdmin(fixture, page, ids);
  const ownerCookie = await loginAsSeparateOwner(fixture, 'phase3-partial-claim-owner', 'phase3-owner@example.invalid');
  const ownerPrincipal = await fixture.principal(ownerCookie);
  const profileResponse = await fixture.request(ownerCookie, '/api/creador/perfil', {
    method: 'PUT',
    body: { displayName: 'Dueña de recursos', slug: 'duena-recursos', socials: {} },
  });
  assert.equal(profileResponse.status, 200, 'a separate real account creates the target profile');
  const claimResponse = await fixture.request(ownerCookie, '/api/creador/reclamaciones', {
    method: 'POST',
    body: { resourceIds: ids.slice(0, 3), evidence: 'Solicitud para validar la revisión administrativa.' },
  });
  assert.equal(claimResponse.status, 202, 'the real creator API creates the claim shown to administration');
  const claim = (await claimResponse.json()).claim;
  await page.reload();

  const claimForm = page.locator(`[data-admin-claim="${claim.id}"] form[data-claim-resolution]`);
  await expect(claimForm).toBeVisible();
  await claimForm.locator(`input[name="resourceIds"][value="${ids[1]}"]`).uncheck();
  await claimForm.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  await row(page, ids[3]).getByLabel('Categoría').fill('Borrador independiente');

  const transact = fixture.creatorStore.transact.bind(fixture.creatorStore);
  let secondResourceFailed = false;
  fixture.creatorStore.transact = async (operation) => {
    if (!secondResourceFailed && operation.puts?.some(({ key }) => key === `resource:${ids[2]}`)) {
      secondResourceFailed = true;
      throw new Error('controlled storage failure after the first selected resource committed');
    }
    return transact(operation);
  };
  const writes = watchAdminWrites(page);
  try {
    const partialResponse = page.waitForResponse((response) => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/admin/reclamaciones/vincular/');
    const linkRequest = page.waitForRequest((request) => request.method() === 'POST'
      && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await claimForm.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    const [request, response] = await Promise.all([linkRequest, partialResponse]);
    assert.deepEqual(JSON.parse(request.postData()).resourceIds, [ids[0], ids[2]]);
    assert.equal(response.status(), 503, 'the actual service reports the injected failure after its first real commit');
    assert.deepEqual((await response.json()).linkedResourceIds, [ids[0]]);
    assert.equal(secondResourceFailed, true);
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'pending',
      'the incomplete request is not represented as a fully resolved claim');

    const firstSelection = claimForm.locator(`input[name="resourceIds"][value="${ids[0]}"]`);
    const skippedSelection = claimForm.locator(`input[name="resourceIds"][value="${ids[1]}"]`);
    const incompleteSelection = claimForm.locator(`input[name="resourceIds"][value="${ids[2]}"]`);
    await expect(firstSelection).toBeChecked();
    await expect(firstSelection).toBeDisabled();
    await expect(skippedSelection).not.toBeChecked();
    await expect(skippedSelection).toBeDisabled();
    await expect(incompleteSelection).toBeChecked();
    await expect(incompleteSelection).toBeDisabled();
    await expect(page.locator('[data-view-transition-shell]')).toBeVisible();
    assert.equal((await fixture.rawResource(ids[0])).directoryControl, 'creator',
      'the successful first link remains the actual persisted effect of the partial request');
    assert.equal((await fixture.rawOwner(ownerCookie)).principal.accountId, ownerPrincipal.accountId);

    const previousUrl = page.url();
    await page.locator('input[name="q"]').fill(ids[3]);
    await nativeDecision(page,
      () => page.getByRole('button', { name: 'Buscar y filtrar' }).click(),
      'dismiss');
    await expect(page).toHaveURL(previousUrl);
    await expect(row(page, ids[3]).getByLabel('Categoría')).toHaveValue('Borrador independiente');
    assert.deepEqual(writes.writes.map(({ method, status }) => [method, status]), [['POST', 503]],
      'Cancel does not replay the partial linking request');

    await saveClassificationAndWaitForCleanReload(page, ids[3]);
    assert.equal((await fixture.rawResource(ids[3])).category, 'Borrador independiente');
    assert.deepEqual(writes.writes.map(({ method, status }) => [method, status]), [['POST', 503], ['PATCH', 200]],
      'after the other draft is saved, the committed disabled claim selection does not leave a dirty phantom');
  } finally {
    writes.stop();
    fixture.creatorStore.transact = transact;
  }
});

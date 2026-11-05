import assert from 'node:assert/strict';
import { test, expect, loggedInOwner, addCookie, captureCreatorApi } from '../fixtures/creator-browser-test.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const pathOf = (request) => new URL(request.url()).pathname.replace(/\/$/u, '');
const sessionCheck = (page) => page.locator('[data-owner-dialog] [data-session-recovery-check]');

async function setupCatalog(fixture, page, suffix) {
  const entries = [
    { id: `${suffix}-a`, title: 'Recovery A', url: `https://${suffix}.example/a`, tipo: 'community' },
    { id: `${suffix}-b`, title: 'Recovery B', url: `https://${suffix}.example/b`, tipo: 'community' },
  ];
  for (const entry of entries) {
    await seedResource(fixture.creatorStore, {
      id: entry.id, title: entry.title, url: entry.url, kind: 'community', category: 'Comunidad', format: 'community', published: true,
    });
  }
  await page.route('**/catalog-selection.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(entries),
  }));
  return entries;
}

async function gotoLinks(page, fixture) {
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
}

async function waitForRender(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function latest(capture, method, path, status) {
  await expect.poll(() => capture.records.filter((item) => item.method === method && item.path === path).at(-1)?.status).toBe(status);
  return capture.records.filter((item) => item.method === method && item.path === path).at(-1);
}

function apiResponse(page, method, path, status) {
  return page.waitForResponse((response) => response.request().method() === method
    && pathOf(response.request()) === path && response.status() === status);
}

test('claim mismatch restores the same draft, then checks history and permits a persisted manual request', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  const [resource] = await setupCatalog(fixture, page, 'claim-recovery');
  const account = [...fixture.accountStore.accounts.values()][0];
  const capture = await captureCreatorApi(page);
  const ownerBindings = [];
  const recordOwnerBinding = (request) => {
    if (request.method() !== 'GET') return;
    const path = pathOf(request);
    if (path === '/api/creador/perfil' || path === '/api/creador/sesion') {
      ownerBindings.push({ path, binding: request.headers()['x-creator-page-binding'] });
    }
  };
  page.on('request', recordOwnerBinding);
  let lostAcknowledgement = false;
  const transport = async (route) => {
    if (route.request().method() === 'POST' && pathOf(route.request()) === '/api/creador/reclamaciones' && !lostAcknowledgement) {
      lostAcknowledgement = true;
      const actual = await route.fetch();
      assert.equal(actual.status(), 202, 'the real claim handler commits the first request');
      await route.fulfill({ response: actual, status: 503 });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', transport);
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=solicitudes`);
    await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
    await page.getByRole('button', { name: 'Solicitar edición', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const form = page.locator('[data-owner-form="reclamacion"]');
    await form.getByRole('checkbox', { name: `Solicitar edición de ${resource.title}`, exact: true }).check();
    const evidence = form.getByLabel(/Contexto privado/i);
    await evidence.fill('Correction retained across role restoration');
    await form.getByRole('button', { name: /Enviar solicitud/i }).click();
    await latest(capture, 'POST', '/api/creador/reclamaciones', 503);

    const checkAttempt = dialog.getByRole('button', { name: 'Comprobar solicitudes', exact: true });
    await expect(checkAttempt).toBeEnabled();
    fixture.accountStore.seedAccount({ ...account, isAdmin: true });
    await checkAttempt.click();
    const mismatch = await latest(capture, 'GET', '/api/creador/perfil', 409);
    assert.equal(mismatch.responseBody.error, 'SESSION_CONTEXT_CHANGED');
    assert.equal(Object.hasOwn(mismatch.responseBody, 'profile'), false);
    const originalBinding = ownerBindings.filter((item) => item.path === '/api/creador/perfil').at(-1)?.binding;
    assert.match(originalBinding ?? '', /^[a-f0-9]{64}$/u);
    await expect(sessionCheck(page)).toBeEnabled();
    await expect(page.locator('main [data-session-recovery-check]')).toBeEnabled();
    await expect(form.getByRole('checkbox', { name: `Solicitar edición de ${resource.title}`, exact: true })).toBeChecked();
    await expect(evidence).toHaveValue('Correction retained across role restoration');
    await expect(form.getByRole('button', { name: /Enviar solicitud/i })).toBeDisabled();

    fixture.accountStore.seedAccount(account);
    const restoredCookie = await fixture.login();
    await addCookie(page.context(), fixture, restoredCookie);
    const ownerReadsBeforeSessionCheck = capture.records.filter((item) => item.method === 'GET' && item.path === '/api/creador/perfil').length;
    await sessionCheck(page).click();
    await expect(sessionCheck(page)).toHaveCount(0);
    const sessionRead = await latest(capture, 'GET', '/api/creador/sesion', 200);
    assert.equal(typeof sessionRead.responseBody?.csrfToken, 'string', 'the bound session check returns a fresh token');
    assert.equal(ownerBindings.filter((item) => item.path === '/api/creador/sesion').at(-1)?.binding, originalBinding,
      'session renewal remains bound to the original page context');
    await expect(page.locator('[data-account-logout] input[name="csrfToken"]')).toHaveValue(sessionRead.responseBody.csrfToken);
    assert.equal(capture.records.filter((item) => item.method === 'GET' && item.path === '/api/creador/perfil').length,
      ownerReadsBeforeSessionCheck, 'session restoration does not perform the separate claim-history read');
    await expect(evidence).toHaveValue('Correction retained across role restoration');
    await expect(checkAttempt).toBeEnabled();

    await checkAttempt.click();
    await latest(capture, 'GET', '/api/creador/perfil', 200);
    await expect(evidence).toHaveValue('Correction retained across role restoration');
    await evidence.fill('Manual continuation after restored session');
    await form.getByRole('button', { name: /Enviar solicitud/i }).click();
    const manualWrite = await latest(capture, 'POST', '/api/creador/reclamaciones', 202);
    assert.deepEqual(manualWrite.body, {
      resources: [{ resourceId: resource.id, url: resource.url }],
      evidence: 'Manual continuation after restored session',
    });

    const persistedResponse = await fixture.request(restoredCookie, '/api/creador/perfil');
    assert.equal(persistedResponse.status, 200);
    const persisted = await persistedResponse.json();
    assert.equal(persisted.claims.filter((claim) => claim.resourceIds.includes(resource.id)).length, 2,
      'both the uncertain first request and explicit manual continuation are durably recorded');
    assert.ok(persisted.claims.some((claim) => claim.evidence === 'Manual continuation after restored session'));
    assert.equal(capture.records.filter((item) => item.method === 'POST' && item.path === '/api/creador/reclamaciones').length, 2);
  } finally {
    fixture.accountStore.seedAccount(account);
    page.off('request', recordOwnerBinding);
    await page.unroute('**/api/creador/**', transport);
    await capture.stop({ skipErrorBodies: true });
  }
});

test('an obsolete claim-history mismatch cannot block a later confirmed manual claim', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const [resource] = await setupCatalog(fixture, page, 'claim-history-race');
  const account = [...fixture.accountStore.accounts.values()][0];
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  const obsolete = { arrived: deferred(), gate: deferred(), done: deferred() };
  let lostAcknowledgement = false;
  let holdMismatch = true;
  const transport = async (route) => {
    const request = route.request();
    const path = pathOf(request);
    if (request.method() === 'POST' && path === '/api/creador/reclamaciones' && !lostAcknowledgement) {
      lostAcknowledgement = true;
      const actual = await route.fetch();
      assert.equal(actual.status(), 202);
      await route.fulfill({ response: actual, status: 503 });
      return;
    }
    if (request.method() === 'GET' && path === '/api/creador/perfil' && holdMismatch) {
      const actual = await route.fetch();
      if (actual.status() === 409) {
        holdMismatch = false;
        obsolete.used = true;
        obsolete.status = actual.status();
        obsolete.body = await actual.json();
        obsolete.arrived.resolve();
        await obsolete.gate.promise;
        try {
          await route.fulfill({ response: actual, json: obsolete.body });
        } finally {
          obsolete.done.resolve();
        }
        return;
      }
      await route.fulfill({ response: actual });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', transport);
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=solicitudes`);
    await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
    await page.getByRole('button', { name: 'Solicitar edición', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const form = page.locator('[data-owner-form="reclamacion"]');
    await form.getByRole('checkbox', { name: `Solicitar edición de ${resource.title}`, exact: true }).check();
    const evidence = form.getByLabel(/Contexto privado/i);
    await evidence.fill('Uncertain first request');
    await form.getByRole('button', { name: /Enviar solicitud/i }).click();
    await latest(capture, 'POST', '/api/creador/reclamaciones', 503);

    fixture.accountStore.seedAccount({ ...account, isAdmin: true });
    const checkAttempt = dialog.getByRole('button', { name: 'Comprobar solicitudes', exact: true });
    await checkAttempt.click();
    await obsolete.arrived.promise;
    assert.equal(obsolete.status, 409);
    assert.equal(obsolete.body.error, 'SESSION_CONTEXT_CHANGED');

    fixture.accountStore.seedAccount(account);
    await evidence.fill('Confirmed manual continuation while history check waits');
    await form.getByRole('button', { name: /Enviar solicitud/i }).click();
    const manualWrite = await latest(capture, 'POST', '/api/creador/reclamaciones', 202);
    assert.equal(manualWrite.body.evidence, 'Confirmed manual continuation while history check waits');
    await expect(dialog).toHaveCount(0);

    const mismatchResponse = apiResponse(page, 'GET', '/api/creador/perfil', 409);
    obsolete.gate.resolve();
    await obsolete.done.promise;
    await mismatchResponse;
    await waitForRender(page);
    await expect(page.locator('main [data-session-recovery-check]')).toHaveCount(0);
    await expect(page.locator('[data-claim-open]').first()).toBeEnabled();

    const refreshedHistory = apiResponse(page, 'GET', '/api/creador/perfil', 200);
    await page.getByRole('button', { name: 'Actualizar solicitudes', exact: true }).click();
    await refreshedHistory;
    await expect(page.locator('[data-claim-index-status]')).toContainText('Solicitudes actualizadas');
    await page.locator('[data-claim-open][data-claim-section-open]').click();
    const resumedDialog = page.getByRole('dialog');
    const resumedForm = page.locator('[data-owner-form="reclamacion"]');
    await resumedForm.getByRole('checkbox', { name: `Solicitar edición de ${resource.title}`, exact: true }).check();
    await resumedForm.getByLabel(/Contexto privado/i).fill('Manual request after the obsolete mismatch was ignored');
    await resumedForm.getByRole('button', { name: /Enviar solicitud/i }).click();
    const finalManualWrite = await latest(capture, 'POST', '/api/creador/reclamaciones', 202);
    assert.equal(finalManualWrite.body.evidence, 'Manual request after the obsolete mismatch was ignored');
    await expect(resumedDialog).toHaveCount(0);

    const persistedResponse = await fixture.request(cookie, '/api/creador/perfil');
    assert.equal(persistedResponse.status, 200);
    const persisted = await persistedResponse.json();
    assert.ok(persisted.claims.some((claim) => claim.evidence === 'Confirmed manual continuation while history check waits'));
    assert.ok(persisted.claims.some((claim) => claim.evidence === 'Manual request after the obsolete mismatch was ignored'));
    assert.equal(capture.records.filter((item) => item.method === 'POST' && item.path === '/api/creador/reclamaciones').length, 3);
  } finally {
    fixture.accountStore.seedAccount(account);
    obsolete.gate.resolve();
    if (obsolete.used) await obsolete.done.promise;
    await page.unroute('**/api/creador/**', transport);
    await capture.stop({ skipErrorBodies: true });
  }
});

test('only the latest overlapping session check installs its token and permits the manual continuation', async ({ fixture, page }) => {
  const initialCookie = await loggedInOwner(fixture, page);
  const [resourceA, resourceB] = await setupCatalog(fixture, page, 'session-race');
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  const held = [];
  let lostAcknowledgement = false;
  const transport = async (route) => {
    const request = route.request();
    const path = pathOf(request);
    if (request.method() === 'POST' && path === '/api/creador/referencias' && !lostAcknowledgement) {
      lostAcknowledgement = true;
      const actual = await route.fetch();
      assert.equal(actual.status(), 201, 'the real reference handler commits A');
      await route.fulfill({ response: actual, status: 503 });
      return;
    }
    if (request.method() === 'GET' && path === '/api/creador/sesion') {
      const current = held.find((item) => !item.used);
      if (current) {
        current.used = true;
        try {
          const actual = await route.fetch();
          current.status = actual.status();
          current.body = await actual.json();
          current.arrived.resolve();
          await current.gate.promise;
          await route.fulfill({ response: actual, json: current.body });
        } finally {
          current.done.resolve();
        }
        return;
      }
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', transport);
  try {
    await gotoLinks(page, fixture);
    await page.getByRole('button', { name: /Buscar en el catálogo/i }).click();
    const form = page.locator('[data-owner-form="referencia"]');
    await form.getByRole('radio', { name: `Seleccionar ${resourceA.title}`, exact: true }).check();
    await form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    await latest(capture, 'POST', '/api/creador/referencias', 503);
    await form.getByRole('radio', { name: `Seleccionar ${resourceB.title}`, exact: true }).check();
    const directory = form.getByRole('checkbox', { name: 'Proponer al directorio', exact: true });
    await directory.uncheck();
    const compare = form.locator('[data-owner-compare]');

    await page.context().clearCookies({ name: initialCookie.name });
    const firstContentRead = apiResponse(page, 'GET', '/api/creador/perfil', 401);
    await compare.click();
    await firstContentRead;
    await expect(sessionCheck(page)).toBeEnabled();

    const firstCookie = await fixture.login();
    const firstPrincipal = await fixture.principal(firstCookie);
    await addCookie(page.context(), fixture, firstCookie);
    const firstCheck = { arrived: deferred(), gate: deferred(), done: deferred() };
    held.push(firstCheck);
    await sessionCheck(page).click();
    await firstCheck.arrived.promise;
    assert.equal(firstCheck.status, 200);
    assert.equal(firstCheck.body.csrfToken, firstPrincipal.csrfToken);
    await expect(compare).toBeEnabled();

    await page.context().clearCookies({ name: initialCookie.name });
    const secondContentRead = apiResponse(page, 'GET', '/api/creador/perfil', 401);
    await compare.click();
    await secondContentRead;
    await expect(sessionCheck(page)).toBeEnabled();

    const secondCookie = await fixture.login();
    const secondPrincipal = await fixture.principal(secondCookie);
    assert.notEqual(firstPrincipal.csrfToken, secondPrincipal.csrfToken);
    await addCookie(page.context(), fixture, secondCookie);
    const secondCheck = { arrived: deferred(), gate: deferred(), done: deferred() };
    held.push(secondCheck);
    await sessionCheck(page).click();
    await secondCheck.arrived.promise;
    assert.equal(secondCheck.status, 200);
    assert.equal(secondCheck.body.csrfToken, secondPrincipal.csrfToken);

    const firstDelivered = page.waitForResponse((response) => response.request().method() === 'GET'
      && pathOf(response.request()) === '/api/creador/sesion');
    firstCheck.gate.resolve();
    await firstCheck.done.promise;
    await firstDelivered;
    await waitForRender(page);
    await expect(sessionCheck(page)).toBeDisabled();
    await expect(page.locator('[data-account-logout] input[name="csrfToken"]')).not.toHaveValue(firstPrincipal.csrfToken);
    const secondDelivered = page.waitForResponse((response) => response.request().method() === 'GET'
      && pathOf(response.request()) === '/api/creador/sesion');
    secondCheck.gate.resolve();
    await secondCheck.done.promise;
    await secondDelivered;
    await waitForRender(page);
    await expect(sessionCheck(page)).toHaveCount(0);
    await expect(page.locator('[data-account-logout] input[name="csrfToken"]')).toHaveValue(secondPrincipal.csrfToken);

    const confirmARead = apiResponse(page, 'GET', '/api/creador/perfil', 200);
    await compare.click();
    await confirmARead;
    await expect(form.locator('[data-owner-adopt]')).toBeEnabled();
    await expect(form.getByRole('radio', { name: `Seleccionar ${resourceB.title}`, exact: true })).toBeChecked();
    await expect(directory).not.toBeChecked();
    await form.locator('[data-owner-adopt]').click();
    await expect(form.getByRole('radio', { name: `Seleccionar ${resourceB.title}`, exact: true })).toBeChecked();
    await expect(directory).not.toBeChecked();
    await form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    const manualWrite = await latest(capture, 'POST', '/api/creador/referencias', 201);
    assert.deepEqual(manualWrite.body, {
      resourceId: resourceB.id, url: resourceB.url, profileVersion: 2, selectedForDirectory: false,
    });
    const persistedResponse = await fixture.request(secondCookie, '/api/creador/perfil');
    assert.equal(persistedResponse.status, 200);
    const persisted = await persistedResponse.json();
    assert.equal(persisted.links.filter((link) => link.resourceId === resourceA.id).length, 1);
    assert.equal(persisted.links.filter((link) => link.resourceId === resourceB.id).length, 1);
    assert.equal(persisted.links.find((link) => link.resourceId === resourceB.id).selectedForDirectory, false);
    const referenceWrites = capture.records.filter((item) => item.method === 'POST' && item.path === '/api/creador/referencias');
    assert.equal(referenceWrites.length, 2, 'session and content checks do not replay A or B');
    assert.deepEqual(referenceWrites.map((item) => item.status), [503, 201]);
  } finally {
    for (const item of held) item.gate.resolve();
    await Promise.all(held.filter((item) => item.used).map((item) => item.done.promise));
    await page.unroute('**/api/creador/**', transport);
    await capture.stop({ skipErrorBodies: true });
  }
});

test('a delayed older disabled owner response cannot replace restored session readiness', async ({ fixture, page }) => {
  const initialCookie = await loggedInOwner(fixture, page);
  const [resourceA, resourceB] = await setupCatalog(fixture, page, 'session-owner-read-order');
  const account = [...fixture.accountStore.accounts.values()][0];
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  const mismatch = { arrived: deferred(), gate: deferred(), done: deferred() };
  const renewal = { arrived: deferred(), gate: deferred(), done: deferred() };
  const profileWrite = { arrived: deferred() };
  let lostAcknowledgement = false;
  let holdMismatch = false;
  let holdProfileWrite = false;
  let expectCurrentDisabled = false;
  let currentDisabledBody;
  const transport = async (route) => {
    const request = route.request();
    const path = pathOf(request);
    if (request.method() === 'POST' && path === '/api/creador/referencias' && !lostAcknowledgement) {
      lostAcknowledgement = true;
      const actual = await route.fetch();
      assert.equal(actual.status(), 201, 'the real reference handler commits A');
      await route.fulfill({ response: actual, status: 503 });
      return;
    }
    if (request.method() === 'PUT' && path === '/api/creador/perfil' && holdProfileWrite) {
      const actual = await route.fetch();
      assert.equal(actual.status(), 200, 'the real profile handler commits the uncertain draft');
      profileWrite.arrived.resolve();
      await route.abort('failed');
      return;
    }
    if (request.method() === 'GET' && path === '/api/creador/perfil') {
      const actual = await route.fetch();
      if (holdMismatch && actual.status() === 403) {
        holdMismatch = false;
        mismatch.status = actual.status();
        mismatch.body = await actual.json();
        mismatch.arrived.resolve();
        try {
          await mismatch.gate.promise;
          await route.fulfill({ response: actual, json: mismatch.body });
        } finally {
          mismatch.done.resolve();
        }
        return;
      }
      if (expectCurrentDisabled && actual.status() === 403) {
        currentDisabledBody = await actual.json();
        await route.fulfill({ response: actual, json: currentDisabledBody });
        return;
      }
      await route.fulfill({ response: actual });
      return;
    }
    if (request.method() === 'GET' && path === '/api/creador/sesion') {
      const actual = await route.fetch();
      const body = await actual.json();
      if (actual.ok()) {
        renewal.status = actual.status();
        renewal.body = body;
        renewal.arrived.resolve();
        try {
          await renewal.gate.promise;
          await route.fulfill({ response: actual, json: body });
        } finally {
          renewal.done.resolve();
        }
        return;
      }
      await route.fulfill({ response: actual, json: body });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', transport);
  try {
    await gotoLinks(page, fixture);
    await page.getByRole('button', { name: /Buscar en el catálogo/i }).click();
    const form = page.locator('[data-owner-form="referencia"]');
    await form.getByRole('radio', { name: `Seleccionar ${resourceA.title}`, exact: true }).check();
    await form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    await latest(capture, 'POST', '/api/creador/referencias', 503);
    await form.getByRole('radio', { name: `Seleccionar ${resourceB.title}`, exact: true }).check();
    const directory = form.getByRole('checkbox', { name: 'Proponer al directorio', exact: true });
    await directory.uncheck();

    await page.context().clearCookies({ name: initialCookie.name });
    const expiredRead = apiResponse(page, 'GET', '/api/creador/perfil', 401);
    await form.locator('[data-owner-compare]').click();
    await expiredRead;
    await expect(sessionCheck(page)).toBeEnabled();

    fixture.accountStore.seedAccount({ ...account, active: false });
    await addCookie(page.context(), fixture, initialCookie);
    holdMismatch = true;
    const compare = form.locator('[data-owner-compare]');
    await compare.click();
    await mismatch.arrived.promise;
    assert.equal(mismatch.status, 403);
    assert.equal(mismatch.body.error, 'ACCOUNT_DISABLED');
    assert.equal(Object.hasOwn(mismatch.body, 'profile'), false);

    fixture.accountStore.seedAccount(account);
    const restoredCookie = await fixture.login();
    await addCookie(page.context(), fixture, restoredCookie);
    const sessionRead = apiResponse(page, 'GET', '/api/creador/sesion', 200);
    await sessionCheck(page).click();
    await renewal.arrived.promise;
    assert.equal(renewal.status, 200);
    const delayedMismatch = apiResponse(page, 'GET', '/api/creador/perfil', 403);
    mismatch.gate.resolve();
    await mismatch.done.promise;
    await delayedMismatch;
    await waitForRender(page);
    await expect(sessionCheck(page)).toBeVisible();
    await expect(sessionCheck(page)).toBeDisabled();
    await expect(compare).toBeEnabled();
    await expect(form.locator('[data-owner-adopt]')).toHaveCount(0);
    await expect(form.getByRole('radio', { name: `Seleccionar ${resourceB.title}`, exact: true })).toBeChecked();
    await expect(directory).not.toBeChecked();
    await expect(page.locator('[data-owner-dialog]')).not.toContainText('Esta cuenta está desactivada.');

    renewal.gate.resolve();
    await renewal.done.promise;
    await sessionRead;
    await expect(sessionCheck(page)).toHaveCount(0);
    assert.equal(typeof renewal.body.csrfToken, 'string');
    await expect(page.locator('[data-account-logout] input[name="csrfToken"]')).toHaveValue(renewal.body.csrfToken);
    await waitForRender(page);
    await expect(compare).toBeEnabled();
    await expect(form.getByRole('radio', { name: `Seleccionar ${resourceB.title}`, exact: true })).toBeChecked();
    await expect(directory).not.toBeChecked();
    assert.equal(capture.records.filter((item) => item.method === 'POST' && item.path === '/api/creador/referencias').length, 1,
      'session renewal and a delayed owner error do not repeat or adopt the reference');

    const confirmedRead = apiResponse(page, 'GET', '/api/creador/perfil', 200);
    await compare.click();
    await confirmedRead;
    await expect(form.locator('[data-owner-adopt]')).toBeEnabled();
    await form.locator('[data-owner-adopt]').click();
    await expect(form.getByRole('radio', { name: `Seleccionar ${resourceB.title}`, exact: true })).toBeChecked();
    await expect(directory).not.toBeChecked();
    await form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    const manualWrite = await latest(capture, 'POST', '/api/creador/referencias', 201);
    assert.deepEqual(manualWrite.body, {
      resourceId: resourceB.id, url: resourceB.url, profileVersion: 2, selectedForDirectory: false,
    });
    const persistedResponse = await fixture.request(restoredCookie, '/api/creador/perfil');
    assert.equal(persistedResponse.status, 200);
    const persisted = await persistedResponse.json();
    assert.equal(persisted.links.filter((link) => link.resourceId === resourceA.id).length, 1);
    assert.equal(persisted.links.filter((link) => link.resourceId === resourceB.id).length, 1);
    assert.equal(persisted.links.find((link) => link.resourceId === resourceB.id).selectedForDirectory, false);
    assert.deepEqual(capture.records.filter((item) => item.method === 'POST' && item.path === '/api/creador/referencias')
      .map((item) => item.status), [503, 201]);

    await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
    const profileForm = page.locator('[data-owner-form="datos"]');
    await profileForm.getByLabel('Nombre visible').fill('Current disabled response stays terminal');
    holdProfileWrite = true;
    await profileForm.getByRole('button', { name: 'Guardar datos' }).click();
    await profileWrite.arrived.promise;
    await expect(profileForm.locator('[data-owner-compare]')).toBeVisible();
    fixture.accountStore.seedAccount({ ...account, active: false });
    expectCurrentDisabled = true;
    const currentDisabledRead = apiResponse(page, 'GET', '/api/creador/perfil', 403);
    await profileForm.locator('[data-owner-compare]').click();
    await currentDisabledRead;
    await expect(page.locator('[data-owner-dialog] [data-session-recovery-status]')).toContainText('Esta cuenta está desactivada.');
    assert.equal(currentDisabledBody?.error, 'ACCOUNT_DISABLED');
    await expect(sessionCheck(page)).toHaveCount(0);
    await expect(profileForm.getByRole('button', { name: 'Guardar datos' })).toBeDisabled();
  } finally {
    fixture.accountStore.seedAccount(account);
    mismatch.gate.resolve();
    renewal.gate.resolve();
    if (mismatch.status !== undefined) await mismatch.done.promise;
    if (renewal.status !== undefined) await renewal.done.promise;
    await page.unroute('**/api/creador/**', transport);
    await capture.stop({ skipErrorBodies: true });
  }
});

test('a delayed old claim-history mismatch stays retryable after session renewal', async ({ fixture, page }) => {
  const initialCookie = await loggedInOwner(fixture, page);
  const [resource] = await setupCatalog(fixture, page, 'claim-history-session-order');
  const account = [...fixture.accountStore.accounts.values()][0];
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  const mismatch = { arrived: deferred(), gate: deferred(), done: deferred() };
  let lostAcknowledgement = false;
  let holdMismatch = false;
  const transport = async (route) => {
    const request = route.request();
    const path = pathOf(request);
    if (request.method() === 'POST' && path === '/api/creador/reclamaciones' && !lostAcknowledgement) {
      lostAcknowledgement = true;
      const actual = await route.fetch();
      assert.equal(actual.status(), 202, 'the real claim handler commits the first request');
      await route.fulfill({ response: actual, status: 503 });
      return;
    }
    if (request.method() === 'GET' && path === '/api/creador/perfil') {
      const actual = await route.fetch();
      if (holdMismatch && actual.status() === 409) {
        holdMismatch = false;
        mismatch.status = actual.status();
        mismatch.body = await actual.json();
        mismatch.arrived.resolve();
        try {
          await mismatch.gate.promise;
          await route.fulfill({ response: actual, json: mismatch.body });
        } finally {
          mismatch.done.resolve();
        }
        return;
      }
      await route.fulfill({ response: actual });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', transport);
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=solicitudes`);
    await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
    await page.getByRole('button', { name: 'Solicitar edición', exact: true }).click();
    const form = page.locator('[data-owner-form="reclamacion"]');
    const evidence = form.getByLabel(/Contexto privado/i);
    await form.getByRole('checkbox', { name: `Solicitar edición de ${resource.title}`, exact: true }).check();
    await evidence.fill('First uncertain claim');
    await form.getByRole('button', { name: /Enviar solicitud/i }).click();
    await latest(capture, 'POST', '/api/creador/reclamaciones', 503);

    await page.context().clearCookies({ name: initialCookie.name });
    const expiredRead = apiResponse(page, 'GET', '/api/creador/perfil', 401);
    await form.getByRole('button', { name: 'Comprobar solicitudes', exact: true }).click();
    await expiredRead;
    await expect(sessionCheck(page)).toBeEnabled();

    fixture.accountStore.seedAccount({ ...account, isAdmin: !account.isAdmin });
    const mismatchedCookie = await fixture.login();
    await addCookie(page.context(), fixture, mismatchedCookie);
    const checkAttempt = form.getByRole('button', { name: 'Comprobar solicitudes', exact: true });
    holdMismatch = true;
    await checkAttempt.click();
    await mismatch.arrived.promise;
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.body.error, 'SESSION_CONTEXT_CHANGED');
    assert.equal(Object.hasOwn(mismatch.body, 'profile'), false);

    fixture.accountStore.seedAccount(account);
    const restoredCookie = await fixture.login();
    await addCookie(page.context(), fixture, restoredCookie);
    const sessionRead = apiResponse(page, 'GET', '/api/creador/sesion', 200);
    await sessionCheck(page).click();
    await sessionRead;
    await expect(sessionCheck(page)).toHaveCount(0);
    await expect(checkAttempt).toBeDisabled();

    const delayedMismatch = apiResponse(page, 'GET', '/api/creador/perfil', 409);
    mismatch.gate.resolve();
    await mismatch.done.promise;
    await delayedMismatch;
    await waitForRender(page);
    await expect(sessionCheck(page)).toHaveCount(0);
    await expect(checkAttempt).toBeEnabled();
    await expect(evidence).toHaveValue('First uncertain claim');
    assert.equal(capture.records.filter((item) => item.method === 'POST' && item.path === '/api/creador/reclamaciones').length, 1,
      'session renewal and history failure do not replay the claim');

    const historyRead = apiResponse(page, 'GET', '/api/creador/perfil', 200);
    await checkAttempt.click();
    await historyRead;
    await expect(evidence).toHaveValue('First uncertain claim');
    await evidence.fill('Manual claim after separate history check');
    await form.getByRole('button', { name: /Enviar solicitud/i }).click();
    await latest(capture, 'POST', '/api/creador/reclamaciones', 202);
    const persistedResponse = await fixture.request(restoredCookie, '/api/creador/perfil');
    assert.equal(persistedResponse.status, 200);
    const persisted = await persistedResponse.json();
    assert.equal(persisted.claims.filter((claim) => claim.resourceIds.includes(resource.id)).length, 2);
    assert.ok(persisted.claims.some((claim) => claim.evidence === 'Manual claim after separate history check'));
    assert.deepEqual(capture.records.filter((item) => item.method === 'POST' && item.path === '/api/creador/reclamaciones')
      .map((item) => item.status), [503, 202]);
  } finally {
    fixture.accountStore.seedAccount(account);
    mismatch.gate.resolve();
    if (mismatch.status !== undefined) await mismatch.done.promise;
    await page.unroute('**/api/creador/**', transport);
    await capture.stop({ skipErrorBodies: true });
  }
});

test('a later content mismatch can supersede an earlier successful session check', async ({ fixture, page }) => {
  const initialCookie = await loggedInOwner(fixture, page);
  const [resourceA, resourceB] = await setupCatalog(fixture, page, 'session-owner-read-reverse-order');
  const account = [...fixture.accountStore.accounts.values()][0];
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  const session = { arrived: deferred(), gate: deferred(), done: deferred() };
  const mismatch = { arrived: deferred(), gate: deferred(), done: deferred() };
  let lostAcknowledgement = false;
  let holdSession = false;
  let holdMismatch = false;
  const transport = async (route) => {
    const request = route.request();
    const path = pathOf(request);
    if (request.method() === 'POST' && path === '/api/creador/referencias' && !lostAcknowledgement) {
      lostAcknowledgement = true;
      const actual = await route.fetch();
      assert.equal(actual.status(), 201, 'the real reference handler commits A');
      await route.fulfill({ response: actual, status: 503 });
      return;
    }
    if (request.method() === 'GET' && path === '/api/creador/perfil') {
      const actual = await route.fetch();
      if (holdMismatch && actual.status() === 409) {
        holdMismatch = false;
        mismatch.status = actual.status();
        mismatch.body = await actual.json();
        mismatch.arrived.resolve();
        try {
          await mismatch.gate.promise;
          await route.fulfill({ response: actual, json: mismatch.body });
        } finally {
          mismatch.done.resolve();
        }
        return;
      }
      await route.fulfill({ response: actual });
      return;
    }
    if (request.method() === 'GET' && path === '/api/creador/sesion') {
      const actual = await route.fetch();
      const body = await actual.json();
      if (holdSession && actual.ok()) {
        holdSession = false;
        session.status = actual.status();
        session.body = body;
        session.arrived.resolve();
        try {
          await session.gate.promise;
          await route.fulfill({ response: actual, json: body });
        } finally {
          session.done.resolve();
        }
        return;
      }
      await route.fulfill({ response: actual, json: body });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', transport);
  try {
    await gotoLinks(page, fixture);
    await page.getByRole('button', { name: /Buscar en el catálogo/i }).click();
    const form = page.locator('[data-owner-form="referencia"]');
    await form.getByRole('radio', { name: `Seleccionar ${resourceA.title}`, exact: true }).check();
    await form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    await latest(capture, 'POST', '/api/creador/referencias', 503);
    await form.getByRole('radio', { name: `Seleccionar ${resourceB.title}`, exact: true }).check();

    await page.context().clearCookies({ name: initialCookie.name });
    const expiredRead = apiResponse(page, 'GET', '/api/creador/perfil', 401);
    await form.locator('[data-owner-compare]').click();
    await expiredRead;
    await expect(sessionCheck(page)).toBeEnabled();

    const checkedCookie = await fixture.login();
    await addCookie(page.context(), fixture, checkedCookie);
    holdSession = true;
    await sessionCheck(page).click();
    await session.arrived.promise;
    assert.equal(session.status, 200);

    fixture.accountStore.seedAccount({ ...account, isAdmin: !account.isAdmin });
    holdMismatch = true;
    const compare = form.locator('[data-owner-compare]');
    await compare.click();
    await mismatch.arrived.promise;
    assert.equal(mismatch.status, 409);
    assert.equal(mismatch.body.error, 'SESSION_CONTEXT_CHANGED');
    assert.equal(Object.hasOwn(mismatch.body, 'profile'), false);

    const delayedSession = apiResponse(page, 'GET', '/api/creador/sesion', 200);
    session.gate.resolve();
    await session.done.promise;
    await delayedSession;
    await expect(sessionCheck(page)).toHaveCount(0);
    assert.equal(typeof session.body.csrfToken, 'string');
    await expect(page.locator('[data-account-logout] input[name="csrfToken"]')).toHaveValue(session.body.csrfToken);
    await expect(compare).toBeDisabled();

    const delayedMismatch = apiResponse(page, 'GET', '/api/creador/perfil', 409);
    mismatch.gate.resolve();
    await mismatch.done.promise;
    await delayedMismatch;
    await waitForRender(page);
    await expect(sessionCheck(page)).toBeEnabled();
    await expect(compare).toBeEnabled();
    await expect(form.getByRole('radio', { name: `Seleccionar ${resourceB.title}`, exact: true })).toBeChecked();
    assert.equal(capture.records.filter((item) => item.method === 'POST' && item.path === '/api/creador/referencias').length, 1,
      'the later mismatch stays retryable and neither check repeats A');

    fixture.accountStore.seedAccount(account);
    const renewedCookie = await fixture.login();
    await addCookie(page.context(), fixture, renewedCookie);
    const renewed = apiResponse(page, 'GET', '/api/creador/sesion', 200);
    await sessionCheck(page).click();
    await renewed;
    await expect(sessionCheck(page)).toHaveCount(0);

    const confirmedRead = apiResponse(page, 'GET', '/api/creador/perfil', 200);
    await compare.click();
    await confirmedRead;
    await expect(form.locator('[data-owner-adopt]')).toBeEnabled();
    await form.locator('[data-owner-adopt]').click();
    await form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    await latest(capture, 'POST', '/api/creador/referencias', 201);
    const persistedResponse = await fixture.request(renewedCookie, '/api/creador/perfil');
    assert.equal(persistedResponse.status, 200);
    const persisted = await persistedResponse.json();
    assert.equal(persisted.links.filter((link) => link.resourceId === resourceA.id).length, 1);
    assert.equal(persisted.links.filter((link) => link.resourceId === resourceB.id).length, 1);
    assert.deepEqual(capture.records.filter((item) => item.method === 'POST' && item.path === '/api/creador/referencias')
      .map((item) => item.status), [503, 201]);
  } finally {
    fixture.accountStore.seedAccount(account);
    session.gate.resolve();
    mismatch.gate.resolve();
    if (session.status !== undefined) await session.done.promise;
    if (mismatch.status !== undefined) await mismatch.done.promise;
    await page.unroute('**/api/creador/**', transport);
    await capture.stop({ skipErrorBodies: true });
  }
});

test('an obsolete session-check network failure cannot replace newer readiness', async ({ fixture, page }) => {
  const initialCookie = await loggedInOwner(fixture, page);
  const [resourceA, resourceB] = await setupCatalog(fixture, page, 'session-network-failure');
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  const obsolete = { arrived: deferred(), gate: deferred(), done: deferred() };
  let lostAcknowledgement = false;
  let holdObsoleteRead = true;
  const transport = async (route) => {
    const request = route.request();
    const path = pathOf(request);
    if (request.method() === 'POST' && path === '/api/creador/referencias' && !lostAcknowledgement) {
      lostAcknowledgement = true;
      const actual = await route.fetch();
      assert.equal(actual.status(), 201);
      await route.fulfill({ response: actual, status: 503 });
      return;
    }
    if (request.method() === 'GET' && path === '/api/creador/sesion' && holdObsoleteRead) {
      holdObsoleteRead = false;
      obsolete.used = true;
      try {
        const actual = await route.fetch();
        obsolete.status = actual.status();
        obsolete.body = await actual.json();
        obsolete.arrived.resolve();
        await obsolete.gate.promise;
        await route.abort('failed');
      } finally {
        obsolete.done.resolve();
      }
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', transport);
  try {
    await gotoLinks(page, fixture);
    await page.getByRole('button', { name: /Buscar en el catálogo/i }).click();
    const form = page.locator('[data-owner-form="referencia"]');
    await form.getByRole('radio', { name: `Seleccionar ${resourceA.title}`, exact: true }).check();
    await form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    await latest(capture, 'POST', '/api/creador/referencias', 503);
    await form.getByRole('radio', { name: `Seleccionar ${resourceB.title}`, exact: true }).check();
    const compare = form.locator('[data-owner-compare]');

    await page.context().clearCookies({ name: initialCookie.name });
    const firstContentRead = apiResponse(page, 'GET', '/api/creador/perfil', 401);
    await compare.click();
    await firstContentRead;
    await expect(sessionCheck(page)).toBeEnabled();
    const obsoleteCookie = await fixture.login();
    const obsoletePrincipal = await fixture.principal(obsoleteCookie);
    await addCookie(page.context(), fixture, obsoleteCookie);
    await sessionCheck(page).click();
    await obsolete.arrived.promise;
    assert.equal(obsolete.status, 200);
    assert.equal(obsolete.body.csrfToken, obsoletePrincipal.csrfToken);

    await page.context().clearCookies({ name: initialCookie.name });
    const secondContentRead = apiResponse(page, 'GET', '/api/creador/perfil', 401);
    await compare.click();
    await secondContentRead;
    const currentCookie = await fixture.login();
    const currentPrincipal = await fixture.principal(currentCookie);
    assert.notEqual(obsoletePrincipal.csrfToken, currentPrincipal.csrfToken);
    await addCookie(page.context(), fixture, currentCookie);
    await sessionCheck(page).click();
    await expect(sessionCheck(page)).toHaveCount(0);
    await expect(page.locator('[data-account-logout] input[name="csrfToken"]')).toHaveValue(currentPrincipal.csrfToken);

    const failedSessionRead = page.waitForEvent('requestfailed', (request) => request.method() === 'GET'
      && pathOf(request) === '/api/creador/sesion');
    obsolete.gate.resolve();
    await obsolete.done.promise;
    await failedSessionRead;
    await waitForRender(page);
    await expect(sessionCheck(page)).toHaveCount(0);
    await expect(page.locator('[data-account-logout] input[name="csrfToken"]')).toHaveValue(currentPrincipal.csrfToken);
    await expect(compare).toBeEnabled();

    const confirmARead = apiResponse(page, 'GET', '/api/creador/perfil', 200);
    await compare.click();
    await confirmARead;
    await expect(form.locator('[data-owner-adopt]')).toBeEnabled();
    await form.locator('[data-owner-adopt]').click();
    await form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    await latest(capture, 'POST', '/api/creador/referencias', 201);
    const persistedResponse = await fixture.request(currentCookie, '/api/creador/perfil');
    assert.equal(persistedResponse.status, 200);
    const persisted = await persistedResponse.json();
    assert.equal(persisted.links.filter((link) => link.resourceId === resourceA.id).length, 1);
    assert.equal(persisted.links.filter((link) => link.resourceId === resourceB.id).length, 1);
    assert.equal(persisted.links.find((link) => link.resourceId === resourceB.id).selectedForDirectory, true);
    const referenceWrites = capture.records.filter((item) => item.method === 'POST' && item.path === '/api/creador/referencias');
    assert.equal(referenceWrites.length, 2, 'only the uncertain A and explicit manual B are written');
    assert.deepEqual(referenceWrites.map((item) => item.status), [503, 201]);
  } finally {
    obsolete.gate.resolve();
    if (obsolete.used) await obsolete.done.promise;
    await page.unroute('**/api/creador/**', transport);
    await capture.stop({ skipErrorBodies: true });
  }
});

import assert from 'node:assert/strict';
import { test as base, expect } from '@playwright/test';
import { startCreatorBrowserApp } from '../fixtures/creator-browser-app.mjs';

const test = base.extend({
  app: [async ({}, use) => {
    const app = await startCreatorBrowserApp();
    try {
      await use(app);
    } finally {
      await app.close();
    }
  }, { scope: 'worker' }],
  fixture: [async ({ app }, use) => {
    const fixture = await app.createFixture();
    fixture.publish();
    try {
      await use(fixture);
    } finally {
      fixture.clear();
    }
  }, { auto: true }],
});

const pageErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const errors = [];
  const listener = (error) => errors.push(error);
  page.on('pageerror', listener);
  pageErrors.set(page, { errors, listener });
});

test.afterEach(async ({ page }, testInfo) => {
  const observed = pageErrors.get(page);
  if (!observed) return;
  page.off('pageerror', observed.listener);
  expect(observed.errors.map((error) => error.message), `${testInfo.title}: uncaught browser page errors`).toEqual([]);
});

async function addCookie(context, fixture, cookie) {
  await context.addCookies([{
    name: cookie.name,
    value: cookie.value,
    url: fixture.origin,
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  }]);
}

async function api(fixture, cookie, route, options = {}) {
  const response = await fixture.request(cookie, route, options);
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, body };
}

async function createProfile(fixture, cookie, overrides = {}) {
  const result = await api(fixture, cookie, '/api/creador/perfil', {
    method: 'PUT',
    body: {
      displayName: 'Ana Browser',
      slug: 'ana-browser',
      socials: {},
      ...overrides,
    },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body?.profile?.version, 1);
  return result.body.profile;
}

async function createSeries(fixture, cookie, { name, slug, description } = {}) {
  const current = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(current.response.status, 200);
  const result = await api(fixture, cookie, '/api/creador/series', {
    method: 'POST',
    body: {
      name: name ?? 'Serie de prueba',
      slug: slug ?? 'serie-prueba',
      profileVersion: current.body.profile.version,
      ...(description === undefined ? {} : { description }),
    },
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.series;
}

async function addLink(fixture, cookie, { title, url } = {}) {
  const result = await api(fixture, cookie, '/api/creador/enlaces', {
    method: 'POST',
    body: { title: title ?? 'Enlace de prueba', url: url ?? 'https://links.example/prueba' },
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.link;
}

async function addChapter(fixture, cookie, seriesId, placementId) {
  const current = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(current.response.status, 200);
  const result = await api(fixture, cookie, `/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}`, {
    method: 'PUT',
    body: { profileVersion: current.body.profile.version },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

async function captureCreatorApi(page) {
  const records = [];
  const pending = new Map();
  const requestHandler = (request) => {
    const pathname = new URL(request.url()).pathname;
    if (!pathname.startsWith('/api/creador/')) return;
    const rawRequestBody = request.postData();
    let settle;
    const record = {
      method: request.method(),
      url: request.url(),
      path: pathname.replace(/\/$/u, ''),
      body: rawRequestBody ? JSON.parse(rawRequestBody) : undefined,
      responseBody: undefined,
      settled: new Promise((resolve) => { settle = resolve; }),
    };
    record.finish = settle;
    records.push(record);
    pending.set(request, record);
  };
  const responseHandler = async (response) => {
    const request = response.request();
    const record = pending.get(request);
    if (!record) return;
    record.status = response.status();
    record.responseHeaders = response.headers();
    const rawBody = await response.body().catch(() => Buffer.alloc(0));
    const rawResponseBody = rawBody.toString('utf8');
    try {
      record.responseBody = rawResponseBody ? JSON.parse(rawResponseBody) : undefined;
    } catch {
      record.responseBody = undefined;
    }
    record.finish();
    pending.delete(request);
  };
  page.on('request', requestHandler);
  page.on('response', responseHandler);
  return {
    records,
    writes() { return records.filter(({ method }) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)); },
    async settle() { await Promise.all(records.map(({ settled }) => settled)); },
    async stop() {
      await this.settle();
      page.off('request', requestHandler);
      page.off('response', responseHandler);
    },
  };
}

function seriesForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="serie"]');
}

function seriesRow(page, seriesId) {
  return page.locator(`[data-owner-series-row="${seriesId}"]`);
}

async function openSeriesView(page, fixture, search = '') {
  await page.goto(`${fixture.origin}/cuenta/?vista=series${search}`);
  await expect(page.locator('[data-creator-owner]'), `account-store calls: ${JSON.stringify(fixture.accountStore.calls.map(({ operation }) => operation))}; creator-store calls: ${JSON.stringify(fixture.creatorStore.calls.map(({ operation }) => operation))}`)
    .toBeVisible();
  await expect(page.getByRole('heading', { name: 'Series', exact: true })).toBeVisible();
}

async function createSeriesInBrowser(page, { name, slug, description = '' }) {
  await page.getByRole('button', { name: 'Crear serie' }).click();
  const form = seriesForm(page);
  await expect(form).toBeVisible();
  await form.getByLabel('Nombre de la serie').fill(name);
  await form.getByLabel('Dirección de la serie').fill(slug);
  if (description) await form.getByLabel(/Descripción/).fill(description);
  await form.getByRole('button', { name: 'Guardar serie' }).click();
  const row = page.locator('[data-owner-series-row]').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  return row;
}

async function loggedInOwner(fixture, page, { profile = true, profileFields = {} } = {}) {
  const cookie = await fixture.login();
  await addCookie(page.context(), fixture, cookie);
  const installed = (await page.context().cookies(fixture.origin)).find(({ name }) => name === cookie.name);
  assert.equal(installed?.value, cookie.value, 'the browser context receives the real account-session cookie');
  if (profile) await createProfile(fixture, cookie, profileFields);
  return cookie;
}

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
  await expect(form.locator('[data-owner-form-status="serie"]')).toContainText(/Cambios guardados/i);
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

  const patch = captured.writes().find(({ method, path }) => method === 'PATCH' && path === `/api/creador/series/${created.id}`);
  assert.ok(patch, `expected the real no-op PATCH; observed ${JSON.stringify(captured.records.map(({ method, path, status }) => ({ method, path, status })))}`);
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
  await expect(form.locator('[data-owner-form-status="serie"]')).toContainText(/Cambios guardados/i);
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

  const current = await fixture.rawOwner(cookie);
  const currentSeries = await fixture.rawSeries(cookie, initial.id);
  const profileVersion = current.profile.version;
  if (staleKind === 'perfil') {
    assert.equal(current.profile.displayName, 'Nombre externo perfil');
    assert.equal(currentSeries.version, initialSeries.version);
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
    assert.deepEqual(await fixture.rawSeries(cookie, initial.id), currentSeries,
      'the isolated stale series CAS leaves the concurrent saved values unchanged');
  }
  assert.deepEqual(await fixture.rawSeries(cookie, initial.id), currentSeries);
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
  assert.equal(capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/series').length, 1,
    'the browser made exactly one creation request before the acknowledgement was lost');
  await expect(form.locator('[data-series-conflict]')).toBeVisible();
  await expect(form.getByLabel('Nombre de la serie')).toHaveValue('Corrección posterior');
  await expect(form.getByLabel('Dirección de la serie')).toHaveValue('ruta-corregida');
  await expect(form.getByLabel(/Descripción/)).toHaveValue('Descripción posterior');

  await form.getByRole('button', { name: 'Guardar serie' }).click();
  await capture.settle();
  await expect(form.locator('[data-owner-form-status="serie"]')).toContainText(/no repetiremos|Compara el alta original/i);
  assert.equal(committedWrite.body.slug, 'ruta-enviada');
  assert.equal((await fixture.rawOwner(cookie)).profile.version, 2);
  assert.equal((await fixture.creatorStore.list('series:')).length, 1);

  await form.locator('[data-owner-compare]').click();
  const comparison = form.locator('[data-owner-comparison]');
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText('Serie guardada, versión 1');
  await expect(comparison).toContainText('Dirección guardada: ruta-enviada');
  await expect(comparison).toContainText('Tu corrección: ruta-corregida');
  await expect(comparison).toContainText('Corrección posterior');
  const adopt = form.locator('[data-owner-adopt]');
  await expect(adopt).toBeVisible();
  await adopt.click();
  await expect(form.getByLabel('Nombre de la serie')).toHaveValue('Corrección posterior');
  await expect(form.getByLabel('Dirección de la serie')).toHaveValue('ruta-corregida');
  await expect(form.getByLabel(/Descripción/)).toHaveValue('Descripción posterior');
  expect(new URL(page.url()).search).toBe('?vista=series&buscarSeries=ruta&paginaSeries=1');
  assert.equal((await fixture.creatorStore.list('series:')).length, 1, 'explicit adoption preserves one committed series');

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
  for (let index = 0; index < 50; index += 1) {
    links.push(await addLink(fixture, cookie, {
      title: `Guía ${String(index).padStart(2, '0')} AWS`,
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
  } finally {
    await noScriptContext.close();
  }

  const capture = await captureCreatorApi(page);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  const search = page.locator('[data-link-search]');
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

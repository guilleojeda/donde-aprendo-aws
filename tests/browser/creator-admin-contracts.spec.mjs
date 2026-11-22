import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { expect, test, addCookie, createProfile } from '../fixtures/creator-browser-test.mjs';
import {
  adminPath,
  loginAsSeparateOwner,
  prepareAdmin,
  resource,
  root,
  row,
} from '../fixtures/creator-admin.mjs';
import { adminResourceCommandMatches } from '../fixtures/creator-pages.mjs';

const profileRow = (page, id) => page.locator(`[data-admin-profile="${id}"]`);
const saveButton = (page, id) => row(page, id).getByRole('button', { name: 'Guardar clasificación' });

test('invalid SSR admin data exposes recovery feedback in the real page', async ({ fixture, page }) => {
  const id = 'admin-invalid-boundary';
  await prepareAdmin(fixture, page, [id]);
  const adminUrl = `${fixture.origin}${adminPath}?state=all&page=1`;
  let intercepted = false;
  const replaceInitialData = async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    const mutated = html.replace(
      /(<script\b[^>]*id="creator-admin-data"[^>]*>)[\s\S]*?(<\/script>)/u,
      '$1not valid JSON$2',
    );
    assert.notEqual(mutated, html, 'the actual admin document must contain its JSON data boundary');
    intercepted = true;
    await route.fulfill({ response, body: mutated });
  };
  await page.route(`${fixture.origin}${adminPath}**`, replaceInitialData);
  try {
    await page.goto(adminUrl);
    await expect(root(page)).toBeVisible();
    await expect(root(page).locator('[data-admin-status]')).toBeVisible();
    await expect(root(page).locator('[data-admin-status]')).toContainText('No pudimos leer los datos de administración');
    assert.equal(intercepted, true);
    await expect(row(page, id).getByLabel('Categoría')).toBeVisible();
  } finally {
    await page.unroute(`${fixture.origin}${adminPath}**`, replaceInitialData);
  }
});

test('known event moderation permission and validation feedback stays correctable', async ({ fixture, page }) => {
  const eventId = 'admin-event-feedback';
  const ordinaryId = 'admin-ordinary-feedback';
  await prepareAdmin(fixture, page, [
    resource(eventId, 0, {
      recordType: 'event',
      startsAt: '2099-05-01T17:00:00Z',
      endsAt: '2099-05-01T19:00:00Z',
      timeZone: 'UTC',
      organizer: 'Comunidad de prueba',
      mode: 'online',
      registrationUrl: 'https://events.example.invalid/admin-event-feedback',
    }),
    resource(ordinaryId, 1),
  ]);
  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();
  const eventRow = row(page, eventId);
  const ordinaryRow = row(page, ordinaryId);
  await expect(eventRow).toContainText('Los eventos se revisan sin clasificación de recursos.');
  await expect(eventRow.locator('[data-classification-form]')).toHaveCount(0);
  await expect(ordinaryRow.locator('[data-classification-form]')).toHaveCount(1);
  await ordinaryRow.getByLabel('Categoría').fill('Borrador conservado');

  const failures = [
    { status: 403, body: {}, message: 'Esta cuenta no tiene permiso para completar esta acción.' },
    { status: 422, body: {}, message: 'Revisa la clasificación o los IDs seleccionados' },
  ];
  let failureIndex = 0;
  const routeHandler = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'POST' || !url.pathname.endsWith('/recursos/aprobar/')
      || url.searchParams.get('id') !== eventId || failureIndex >= failures.length) {
      await route.continue();
      return;
    }
    const failure = failures[failureIndex++];
    if (failure.status === 'network') {
      await route.abort();
      return;
    }
    await route.fulfill({ status: failure.status, json: failure.body });
  };
  await page.route('**/api/admin/**', routeHandler);
  try {
    const approve = eventRow.getByRole('button', { name: 'Aprobar para el directorio' });
    for (const failure of failures) {
      await approve.click();
      await expect(eventRow.locator('[data-item-status]')).toContainText(failure.message);
      await expect(approve).toBeEnabled();
    }
    await expect(ordinaryRow.getByLabel('Categoría')).toHaveValue('Borrador conservado');
    assert.equal(failureIndex, failures.length);
  } finally {
    await page.unroute('**/api/admin/**', routeHandler);
  }

  const saved = page.waitForResponse((response) => response.request().method() === 'POST'
    && new URL(response.url()).pathname.endsWith('/recursos/aprobar/'));
  await eventRow.getByRole('button', { name: 'Aprobar para el directorio' }).click();
  assert.equal((await saved).status(), 200);
  await expect(eventRow.locator('[data-item-status]')).toContainText('Recurso aprobado para el directorio.');
  assert.equal((await fixture.rawResource(eventId)).published, true, 'the explicit retry persists the event approval');
});

for (const failure of [
  { label: 'a raw 503', status: 503, body: {}, message: 'No pudimos guardar el cambio.' },
  { label: 'a network failure', status: 'network', body: {}, message: 'No pudimos conectar con el servicio.' },
]) {
  test(`${failure.label} on event moderation pauses the target until verified Refresh`, async ({ fixture, page }) => {
    const eventId = `admin-event-unknown-${failure.status}`;
    const ordinaryId = `admin-ordinary-unknown-${failure.status}`;
    await prepareAdmin(fixture, page, [
      resource(eventId, 0, {
        recordType: 'event',
        startsAt: '2099-05-01T17:00:00Z',
        endsAt: '2099-05-01T19:00:00Z',
        timeZone: 'UTC',
        organizer: 'Comunidad de prueba',
        mode: 'online',
        registrationUrl: `https://events.example.invalid/${eventId}`,
      }),
      resource(ordinaryId, 1),
    ]);
    await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
    await expect(root(page)).toBeVisible();
    const eventRow = row(page, eventId);
    const ordinaryRow = row(page, ordinaryId);
    const approve = eventRow.getByRole('button', { name: 'Aprobar para el directorio' });
    await ordinaryRow.getByLabel('Categoría').fill('Borrador conservado');

    const routeHandler = async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() !== 'POST' || !url.pathname.endsWith('/recursos/aprobar/')
        || url.searchParams.get('id') !== eventId) {
        await route.continue();
        return;
      }
      if (failure.status === 'network') await route.abort('failed');
      else await route.fulfill({ status: failure.status, json: failure.body });
    };
    await page.route('**/api/admin/**', routeHandler);
    try {
      await approve.click();
      await expect(eventRow.locator('[data-item-status]')).toContainText(failure.message);
      await expect(approve).toBeDisabled();
      await expect(root(page).locator('[data-refresh-view]')).toBeVisible();
      await expect(ordinaryRow.getByLabel('Categoría')).toHaveValue('Borrador conservado');
      await expect(ordinaryRow.getByRole('button', { name: 'Guardar clasificación' })).toBeEnabled();

      // Revert the unrelated field to its rendered baseline so Refresh is an actual
      // reload here; the Phase 5 recovery spec covers the native confirmation path.
      await ordinaryRow.getByLabel('Categoría').fill('Serverless');
      await page.reload({ waitUntil: 'load' });
      await expect(root(page)).toBeVisible();
      await expect(row(page, eventId).getByRole('button', { name: 'Aprobar para el directorio' })).toBeEnabled();
      await expect(row(page, ordinaryId).getByLabel('Categoría')).toHaveValue('Serverless');
    } finally {
      await page.unroute('**/api/admin/**', routeHandler);
    }
  });
}

test('a current-version classification 422 remains correctable and does not require Refresh', async ({ fixture, page }) => {
  const id = 'admin-classification-current-422';
  await prepareAdmin(fixture, page, [resource(id, 0)]);
  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();
  const target = row(page, id);
  const requestBodies = [];
  const routeHandler = async (route) => {
    const request = route.request();
    if (request.method() !== 'PATCH' || !adminResourceCommandMatches(request.url(), id)) {
      await route.continue();
      return;
    }
    const body = request.postDataJSON();
    requestBodies.push(body);
    assert.equal(body.version, 1, 'the browser submits the currently rendered version');
    const response = await route.fetch({
      postData: JSON.stringify({ ...body, kind: 'community', format: 'Blog' }),
    });
    assert.equal(response.status(), 422, 'the real endpoint rejects the invalid taxonomy at version 1');
    const payload = await response.json();
    const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => name !== 'content-length'));
    await route.fulfill({
      status: response.status(),
      headers,
      json: {
        ...payload,
        fieldErrors: [
          { field: 'kind', reason: 'unknown_reason' },
          { field: 'not-a-control', reason: 'required' },
        ],
      },
    });
  };
  await page.route('**/api/admin/**', routeHandler);
  try {
    await target.getByLabel('Categoría').fill('Seguridad');
    const rejected = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && adminResourceCommandMatches(response.url(), id));
    await saveButton(page, id).click();
    assert.equal((await rejected).status(), 422);
    await expect(target.locator('[data-item-status]')).toContainText('Revisa la clasificación');
    await expect(saveButton(page, id)).toBeEnabled();
    await expect(root(page).locator('[data-refresh-view]')).toBeHidden();
    await expect(target.locator('[aria-invalid="true"]')).toHaveCount(0,
      'unusable field details stay at row scope instead of marking a control');
    assert.deepEqual(await fixture.rawResource(id), resource(id, 0),
      'the current-version validation rejection leaves storage unchanged');

    await page.unroute('**/api/admin/**', routeHandler);
    const saved = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && adminResourceCommandMatches(response.url(), id));
    await saveButton(page, id).click();
    const savedResponse = await saved;
    assert.equal(savedResponse.status(), 200);
    assert.equal(JSON.parse(savedResponse.request().postData()).version, 1);
    assert.equal(requestBodies.length, 1, 'the rejected command was not replayed automatically');
    assert.equal((await fixture.rawResource(id)).category, 'Seguridad');
    assert.equal((await fixture.rawResource(id)).version, 2);
  } finally {
    await page.unroute('**/api/admin/**', routeHandler).catch(() => {});
  }
});

test('a real concurrent classification advance makes the stale command refresh before the next version', async ({ fixture, page }) => {
  const [targetId, unrelatedId] = ['admin-classification-concurrent-target', 'admin-classification-concurrent-other'];
  const adminCookie = await prepareAdmin(fixture, page, [resource(targetId, 0), resource(unrelatedId, 1)]);
  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();
  const external = await fixture.request(adminCookie, `/api/admin/recursos/?id=${encodeURIComponent(targetId)}`, {
    method: 'PATCH',
    body: {
      category: 'Seguridad',
      kind: 'content',
      format: 'Artículo',
      topics: ['Serverless'],
      version: 1,
    },
  });
  assert.equal(external.status, 200, 'the independent admin command advances the stored target');
  assert.deepEqual((await external.json()).versionChanges, [
    { entity: 'resource', id: targetId, before: 1, after: 2 },
  ]);

  const writes = [];
  const captureWrite = (request) => {
    if (request.method() === 'PATCH' && adminResourceCommandMatches(request.url(), targetId)) writes.push(request);
  };
  page.on('request', captureWrite);
  try {
    await row(page, targetId).getByLabel('Categoría').fill('Certificaciones');
    const stale = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && adminResourceCommandMatches(response.url(), targetId));
    await saveButton(page, targetId).click();
    const staleResponse = await stale;
    assert.equal(staleResponse.status(), 409, 'the real endpoint rejects the stale rendered version');
    assert.equal(JSON.parse(staleResponse.request().postData()).version, 1);
    assert.equal((await fixture.rawResource(targetId)).category, 'Seguridad');
    assert.equal((await fixture.rawResource(targetId)).version, 2);
    assert.equal(writes.length, 1, 'the stale command is sent once');
    await expect(saveButton(page, targetId)).toBeDisabled();
    await expect(root(page).locator('[data-refresh-view]')).toBeVisible();
    await expect(saveButton(page, unrelatedId)).toBeEnabled();

    const beforeRefresh = await page.evaluate(() => performance.timeOrigin);
    const refresh = page.waitForNavigation({ waitUntil: 'load' });
    await root(page).locator('[data-refresh-view]').click();
    await refresh;
    assert.notEqual(await page.evaluate(() => performance.timeOrigin), beforeRefresh,
      'verified Refresh installs a new admin snapshot');
    await expect(row(page, targetId).getByLabel('Categoría')).toHaveValue('Seguridad');
    await expect(saveButton(page, targetId)).toBeEnabled();

    const next = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && adminResourceCommandMatches(response.url(), targetId));
    const nextReload = page.waitForNavigation({ waitUntil: 'load' });
    await row(page, targetId).getByLabel('Categoría').fill('Certificaciones');
    await saveButton(page, targetId).click();
    const nextResponse = await next;
    await nextReload;
    assert.equal(nextResponse.status(), 200);
    assert.equal(JSON.parse(nextResponse.request().postData()).version, 2,
      'the next legitimate command uses the refreshed version');
    assert.equal(writes.length, 2, 'Refresh and the next command do not replay the stale write');
    assert.equal((await fixture.rawResource(targetId)).category, 'Certificaciones');
    assert.equal((await fixture.rawResource(targetId)).version, 3);
  } finally {
    page.off('request', captureWrite);
  }
});

test('a real profile moderation storage 503 requires verified Refresh before one manual retry', async ({ fixture, page }) => {
  const resourceId = 'admin-profile-503-resource';
  const adminCookie = await prepareAdmin(fixture, page, [resourceId]);
  const ownerCookie = await loginAsSeparateOwner(
    fixture,
    'admin-profile-503-owner',
    'admin-profile-503-owner@example.invalid',
  );
  const profile = await createProfile(fixture, ownerCookie, {
    displayName: 'Perfil para error de almacenamiento',
    slug: 'perfil-error-almacenamiento',
  });
  await addCookie(page.context(), fixture, adminCookie);
  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();
  const target = profileRow(page, profile.id);
  const hide = target.getByRole('button', { name: 'Ocultar perfil' });
  await expect(hide).toBeVisible();
  const before = await fixture.creatorStore.get(`profile:${profile.id}`);
  const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
  assert.equal(before.hidden, false);

  const writes = [];
  const captureWrite = (request) => {
    if (request.method() === 'POST'
      && new URL(request.url()).pathname === `/api/admin/perfiles/${profile.id}/ocultar/`) writes.push(request);
  };
  page.on('request', captureWrite);
  try {
    fixture.creatorStore.failNext('transact', new Error('injected profile moderation storage failure'));
    const failed = page.waitForResponse((response) => response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/admin/perfiles/${profile.id}/ocultar/`);
    await hide.click();
    const failedResponse = await failed;
    assert.equal(failedResponse.status(), 503, 'the actual profile moderation transaction returned the injected storage failure');
    assert.deepEqual(JSON.parse(failedResponse.request().postData()), { version: before.version });
    assert.equal(writes.length, 1, 'the failed action was sent once and was not replayed');
    await expect(target.locator('[data-item-status]')).toContainText('No pudimos guardar el cambio.');
    await expect(hide).toBeDisabled();
    await expect(root(page).locator('[data-refresh-view]')).toBeVisible();
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin,
      'the failed request keeps the current admin document available for a manual retry');
    assert.deepEqual(await fixture.creatorStore.get(`profile:${profile.id}`), before,
      'the failed storage transaction left the profile unchanged');

    const recovery = root(page).getByRole('button', { name: 'Actualizar vista' });
    const feedback = target.getByRole('status').or(target.getByRole('alert'));
    await expect(target.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect.soft(feedback.or(recovery).and(page.locator(':focus')),
      'when moderation disables the initiating control, focus moves to its feedback or recovery').toHaveCount(1);
    const announcedErrors = root(page).getByRole('status').or(root(page).getByRole('alert'))
      .filter({ hasText: 'No pudimos guardar el cambio.' });
    await expect.soft(announcedErrors, 'only the affected row announces the moderation failure').toHaveCount(1);

    const refreshed = page.waitForNavigation({ waitUntil: 'load' });
    await recovery.click();
    await refreshed;
    assert.notEqual(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin,
      'Refresh performs a new real admin read before the manual retry');
    await expect(profileRow(page, profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeEnabled();
    assert.equal(writes.length, 1, 'Refresh does not replay the failed moderation request');

    const retry = page.waitForResponse((response) => response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/api/admin/perfiles/${profile.id}/ocultar/`);
    const navigation = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() });
    await hide.click();
    const retryResponse = await retry;
    assert.equal(retryResponse.status(), 200);
    assert.deepEqual(JSON.parse(retryResponse.request().postData()), { version: before.version });
    await navigation;
    assert.notEqual(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin,
      'the successful manual moderation reloads the refreshed admin row');
    assert.equal(writes.length, 2, 'the only second moderation request came from the explicit manual retry');
    const saved = await fixture.creatorStore.get(`profile:${profile.id}`);
    assert.equal(saved.hidden, true);
    assert.equal(saved.version, before.version + 1);
  } finally {
    page.off('request', captureWrite);
  }
});

test('admin recovery rejects a changed role before reads or writes and keeps the stale action blocked', async ({ fixture, page }) => {
  const id = 'admin-role-boundary';
  await prepareAdmin(fixture, page, [resource(id, 0)]);
  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();

  const [[accountKey, account]] = fixture.accountStore.accounts;
  assert.equal(account.isAdmin, true);
  fixture.accountStore.accounts.set(accountKey, { ...account, isAdmin: false });
  fixture.accountStore.sessions.clear();
  const before = await fixture.rawResource(id);
  const writeResponses = [];
  page.on('response', (response) => {
    if (['PATCH', 'POST', 'PUT', 'DELETE'].includes(response.request().method())
      && new URL(response.url()).pathname.startsWith('/api/admin/')) writeResponses.push(response);
  });

  await row(page, id).getByLabel('Categoría').fill('Cambio rechazado');
  const expired = page.waitForResponse((response) => response.request().method() === 'PATCH'
    && new URL(response.url()).pathname === '/api/admin/recursos/');
  await row(page, id).getByRole('button', { name: 'Guardar clasificación' }).click();
  assert.equal((await expired).status(), 401);
  await expect(root(page).locator('[data-session-recovery-check]')).toBeVisible();

  const renewed = await fixture.login();
  assert.equal((await fixture.principal(renewed)).isAdmin, false);
  await addCookie(page.context(), fixture, renewed);
  const sessionCheck = page.waitForResponse((response) => response.request().method() === 'GET'
    && new URL(response.url()).pathname === '/api/creador/sesion/');
  await root(page).locator('[data-session-recovery-check]').click();
  assert.equal((await sessionCheck).status(), 409);
  await expect(root(page).locator('[data-session-recovery-status]')).toContainText('otra cuenta o tiene otros permisos');
  await row(page, id).getByRole('button', { name: 'Guardar clasificación' }).click();
  await expect(root(page).locator('[data-session-recovery-status]')).toContainText('La sesión terminó');
  assert.equal(writeResponses.length, 1, 'role recovery does not replay or permit another admin write');
  assert.deepEqual(await fixture.rawResource(id), before, 'a changed role leaves the persisted resource unchanged');
});

test('expired admin profile moderation requires a real bound-session check and an explicit renewed retry', async ({ fixture, page }) => {
  const resourceId = 'admin-profile-session-resource';
  const adminCookie = await prepareAdmin(fixture, page, [resourceId]);
  const ownerCookie = await loginAsSeparateOwner(
    fixture,
    'admin-profile-session-owner',
    'admin-profile-session-owner@example.invalid',
  );
  const profile = await createProfile(fixture, ownerCookie, {
    displayName: 'Perfil para renovar sesión',
    slug: 'perfil-renovar-sesion',
  });
  await addCookie(page.context(), fixture, adminCookie);
  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();
  const target = profileRow(page, profile.id);
  const hide = target.getByRole('button', { name: 'Ocultar perfil' });
  await expect(hide).toBeVisible();

  const writes = [];
  const navigations = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === `/api/admin/perfiles/${profile.id}/ocultar/`) {
      writes.push(request);
    }
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });

  const adminSessionKey = `SESSION#${createHash('sha256').update(adminCookie.value, 'utf8').digest('base64url')}`;
  assert.equal(fixture.accountStore.sessions.delete(adminSessionKey), true,
    'only the fixture admin session is expired for this profile command');
  const before = await fixture.creatorStore.get(`profile:${profile.id}`);
  const expired = page.waitForResponse((response) => response.request().method() === 'POST'
    && new URL(response.url()).pathname === `/api/admin/perfiles/${profile.id}/ocultar/`);
  await hide.click();
  assert.equal((await expired).status(), 401, 'the expired profile command reaches the real admin endpoint');
  assert.equal((await fixture.creatorStore.get(`profile:${profile.id}`)).hidden, false,
    'the expired command does not persist profile moderation');
  assert.equal(writes.length, 1);

  const navigationCountBeforeCheck = navigations.length;
  const renewed = await fixture.login();
  const renewedPrincipal = await fixture.principal(renewed);
  assert.equal(renewedPrincipal.isAdmin, true);
  await addCookie(page.context(), fixture, renewed);
  const checked = page.waitForResponse((response) => response.request().method() === 'GET'
    && new URL(response.url()).pathname === '/api/creador/sesion/');
  await root(page).locator('[data-session-recovery-check]').click();
  assert.equal((await checked).status(), 200, 'the real bound-session check accepts the renewed same-admin session');
  assert.equal(writes.length, 1, 'session recovery does not replay profile moderation');
  assert.equal(navigations.length, navigationCountBeforeCheck, 'session recovery does not navigate away from the draft page');
  await expect(hide).toBeEnabled();
  assert.equal((await fixture.creatorStore.get(`profile:${profile.id}`)).hidden, false);

  const manual = page.waitForResponse((response) => response.request().method() === 'POST'
    && new URL(response.url()).pathname === `/api/admin/perfiles/${profile.id}/ocultar/`);
  const reload = page.waitForNavigation({ waitUntil: 'load' });
  await hide.click();
  const manualResponse = await manual;
  assert.equal(manualResponse.status(), 200);
  assert.equal(manualResponse.request().headers()['x-csrf-token'], renewedPrincipal.csrfToken,
    'the explicit retry sends the renewed CSRF token');
  await reload;
  assert.equal(writes.length, 2, 'only the explicit retry sends the second profile command');
  const saved = await fixture.creatorStore.get(`profile:${profile.id}`);
  assert.equal(saved.hidden, true);
  assert.equal(saved.version, before.version + 1);
});

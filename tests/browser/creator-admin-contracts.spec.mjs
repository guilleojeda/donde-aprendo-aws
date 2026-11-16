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

const profileRow = (page, id) => page.locator(`[data-admin-profile="${id}"]`);

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

test('real event moderation keeps its failure retryable while the ordinary classification draft stays usable', async ({ fixture, page }) => {
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
    { status: 503, body: {}, message: 'No pudimos guardar el cambio.' },
    { status: 403, body: {}, message: 'Esta cuenta no tiene permiso para completar esta acción.' },
    { status: 409, body: { error: 'RESOURCE_CONFLICT' }, message: 'El registro cambió desde la última lectura.' },
    { status: 409, body: { error: 'FUTURE_CONFLICT' }, message: 'No pudimos completar el cambio porque hay un conflicto.' },
    { status: 422, body: {}, message: 'Revisa la clasificación o los IDs seleccionados' },
    { status: 'network', body: {}, message: 'No pudimos conectar con el servicio.' },
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

import assert from 'node:assert/strict';
import {
  test,
  expect,
  captureCreatorApi,
  loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';
import { rasterPhotoFixtures } from '../fixtures/creator-photos.mjs';
import { creatorPageSessionBinding } from '../../src/lib/creator-session-context.mjs';

const ownerPath = '/api/creador/perfil';
const sessionPath = '/api/creador/sesion';

function dataForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
}

function photoForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="foto"]');
}

function sessionCheck(page) {
  return page.locator('[data-owner-dialog][open] [data-session-recovery-check]');
}

function apiEntries(capture, method, path) {
  return capture.records.filter((record) => record.method === method && record.path === path);
}

function originalAccount(fixture) {
  const account = [...fixture.accountStore.accounts.values()][0];
  assert.ok(account, 'the real login callback created the owner account');
  return account;
}

function bindBrowserRequests(page) {
  const requests = [];
  const listener = (request) => {
    const path = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() === 'PUT' && path === ownerPath
      || request.method() === 'POST' && path.startsWith('/api/creador/foto/')) {
      requests.push({ method: request.method(), path, headers: request.headers() });
    }
  };
  page.on('request', listener);
  return { requests, stop: () => page.off('request', listener) };
}

async function waitForStatus(capture, method, path, index, status) {
  await expect.poll(() => apiEntries(capture, method, path)[index]?.status).toBe(status);
  return apiEntries(capture, method, path)[index];
}

test('una edición lista con el mismo cookie rechaza el cambio de rol y se recupera antes del guardado manual', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const original = await fixture.rawOwner(cookie);
  const binding = creatorPageSessionBinding(original.principal);
  const account = originalAccount(fixture);
  const capture = await captureCreatorApi(page);
  const boundRequests = bindBrowserRequests(page);
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    await page.getByRole('button', { name: 'Editar datos' }).click();
    const form = dataForm(page);
    await expect(form).toBeVisible();
    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    await form.getByLabel('Nombre visible').fill('Corrección después del cambio de rol');

    fixture.accountStore.seedAccount({ ...account, isAdmin: !original.principal.isAdmin });
    const changed = await fixture.principal(cookie);
    assert.equal(changed.accountId, original.principal.accountId);
    assert.equal(changed.csrfToken, original.principal.csrfToken, 'the browser retains the exact same session cookie and CSRF token');
    assert.notEqual(changed.isAdmin, original.principal.isAdmin);
    const storeCallsBeforeWrite = fixture.creatorStore.calls.length;

    await form.getByRole('button', { name: 'Guardar datos' }).click();
    const rejected = await waitForStatus(capture, 'PUT', ownerPath, 0, 409);
    await capture.settle();
    assert.equal(rejected.responseBody.error, 'SESSION_CONTEXT_CHANGED');
    assert.equal(Object.hasOwn(rejected.responseBody, 'csrfToken'), false);
    assert.equal(Object.hasOwn(rejected.responseBody, 'profile'), false);
    assert.equal(boundRequests.requests[0].headers['x-creator-page-binding'], binding,
      'the browser sends the original opaque account-and-role binding');
    assert.equal(fixture.creatorStore.calls.length, storeCallsBeforeWrite,
      'the wrong-role write reaches the real HTTP boundary but no profile storage read or write');
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, original.profile,
      'the rejected profile correction has no persisted effect');
    assert.equal((await fixture.principal(cookie)).isAdmin, !original.principal.isAdmin,
      'the same cookie remains in the changed role while recovery is offered');
    await expect(sessionCheck(page)).toBeEnabled();
    await expect(form.getByLabel('Nombre visible')).toHaveValue('Corrección después del cambio de rol');
    assert.equal(capture.writes().length, 1, 'the rejected PUT is not replayed automatically');

    const storeCallsBeforeWrongCheck = fixture.creatorStore.calls.length;
    await sessionCheck(page).click();
    const wrongSession = await waitForStatus(capture, 'GET', sessionPath, 0, 409);
    assert.equal(wrongSession.responseBody.error, 'SESSION_CONTEXT_CHANGED');
    assert.equal(Object.hasOwn(wrongSession.responseBody, 'csrfToken'), false);
    assert.equal(fixture.creatorStore.calls.length, storeCallsBeforeWrongCheck,
      'the explicit mismatch check reads only session context');
    await expect(sessionCheck(page)).toBeEnabled();
    assert.equal(capture.writes().length, 1, 'a mismatch check performs no owner write');

    fixture.accountStore.seedAccount(account);
    const storeCallsBeforeRestoreCheck = fixture.creatorStore.calls.length;
    await sessionCheck(page).click();
    await expect(sessionCheck(page)).toHaveCount(0);
    const restoredSession = await waitForStatus(capture, 'GET', sessionPath, 1, 200);
    assert.deepEqual(restoredSession.responseBody, { csrfToken: original.principal.csrfToken });
    assert.equal(fixture.creatorStore.calls.length, storeCallsBeforeRestoreCheck,
      'restoring readiness does not read or adopt profile content');
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin,
      'session recovery keeps the original document and editor open');
    await expect(form.getByLabel('Nombre visible')).toHaveValue('Corrección después del cambio de rol');
    await expect(form.getByRole('button', { name: 'Guardar datos' })).toBeEnabled();
    assert.equal(capture.writes().length, 1, 'session recovery does not send a write');

    await form.getByRole('button', { name: 'Guardar datos' }).click();
    const saved = await waitForStatus(capture, 'PUT', ownerPath, 1, 200);
    await capture.settle();
    assert.equal(saved.body.version, original.profile.version);
    assert.equal(saved.body.displayName, 'Corrección después del cambio de rol');
    const final = await fixture.rawOwner(cookie);
    assert.equal(final.profile.displayName, saved.responseBody.profile.displayName);
    assert.equal(final.profile.version, original.profile.version + 1);
    assert.equal(capture.writes().length, 2, 'the only accepted write is the later explicit save');
    assert.deepEqual(boundRequests.requests.map(({ headers }) => headers['x-creator-page-binding']), [binding, binding]);
  } finally {
    boundRequests.stop();
    await capture.stop();
  }
});

test('la autorización de foto rechaza el mismo cambio de rol, conserva el archivo y sólo sube tras comprobar la sesión', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const original = await fixture.rawOwner(cookie);
  const account = originalAccount(fixture);
  const images = await rasterPhotoFixtures();
  const capture = await captureCreatorApi(page);
  const boundRequests = bindBrowserRequests(page);
  const providerUploads = [];
  const providerHandler = async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': fixture.origin,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '',
      } });
      return;
    }
    const payload = request.postDataBuffer() ?? Buffer.alloc(0);
    assert.ok(payload.includes(images.png), 'the provider receives the selected native PNG bytes');
    const key = payload.toString('latin1').match(/Content-Disposition: form-data; name="key"\r\n\r\n([^\r\n]+)/iu)?.[1];
    assert.ok(key, 'the direct upload uses the authorized object key');
    fixture.photoObjects.seed(key, images.png);
    providerUploads.push({ key, payload });
    await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': fixture.origin } });
  };
  await page.route('https://creator-photos.example.invalid/**', providerHandler);
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    await page.getByRole('button', { name: 'Editar foto' }).click();
    const form = photoForm(page);
    const file = form.getByLabel('Elegir una foto');
    await file.setInputFiles({ name: 'foto-vinculada.png', mimeType: 'image/png', buffer: images.png });
    const selectedFile = await file.evaluateHandle((input) => input.files[0]);

    fixture.accountStore.seedAccount({ ...account, isAdmin: !original.principal.isAdmin });
    const changed = await fixture.principal(cookie);
    assert.equal(changed.accountId, original.principal.accountId);
    assert.equal(changed.csrfToken, original.principal.csrfToken);
    assert.notEqual(changed.isAdmin, original.principal.isAdmin);
    const storeCallsBeforeAuthorize = fixture.creatorStore.calls.length;

    await form.getByRole('button', { name: 'Subir y guardar foto' }).click();
    const rejected = await waitForStatus(capture, 'POST', '/api/creador/foto/autorizar', 0, 409);
    await capture.settle();
    assert.equal(rejected.responseBody.error, 'SESSION_CONTEXT_CHANGED');
    assert.equal(Object.hasOwn(rejected.responseBody, 'csrfToken'), false);
    assert.equal(Object.hasOwn(rejected.responseBody, 'profile'), false);
    assert.equal(boundRequests.requests[0].headers['x-creator-page-binding'], creatorPageSessionBinding(original.principal));
    assert.equal(fixture.creatorStore.calls.length, storeCallsBeforeAuthorize,
      'the rejected authorization does not read the profile or create an upload');
    assert.equal(fixture.photoPolicies.length, 0, 'no signed upload policy is issued for the mismatched role');
    assert.equal(providerUploads.length, 0, 'the selected file is not sent to the object provider');
    assert.equal(apiEntries(capture, 'POST', '/api/creador/foto/finalizar').length, 0,
      'photo finalization never starts after authorization is rejected');
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, original.profile,
      'the rejected photo action leaves the persisted profile unchanged');
    assert.equal(await file.evaluate((input, previous) => input.files[0] === previous, selectedFile), true,
      'the exact native File stays selected after rejection');
    await expect(sessionCheck(page)).toBeEnabled();
    assert.equal(capture.writes().length, 1, 'the authorization is not retried automatically');

    fixture.accountStore.seedAccount(account);
    const storeCallsBeforeSessionCheck = fixture.creatorStore.calls.length;
    await sessionCheck(page).click();
    await expect(sessionCheck(page)).toHaveCount(0);
    const restoredSession = await waitForStatus(capture, 'GET', sessionPath, 0, 200);
    assert.deepEqual(restoredSession.responseBody, { csrfToken: original.principal.csrfToken });
    assert.equal(fixture.creatorStore.calls.length, storeCallsBeforeSessionCheck,
      'session renewal does not inspect, upload, or finalize the selected photo');
    assert.equal(fixture.photoPolicies.length, 0);
    assert.equal(providerUploads.length, 0);
    assert.equal(capture.writes().length, 1, 'only the user may start the later upload');
    assert.equal(await file.evaluate((input, previous) => input.files[0] === previous, selectedFile), true);

    await form.getByRole('button', { name: 'Subir y guardar foto' }).click();
    const authorized = await waitForStatus(capture, 'POST', '/api/creador/foto/autorizar', 1, 200);
    assert.equal(authorized.responseBody.uploadId, 'browser-photo-1');
    const finalized = await waitForStatus(capture, 'POST', '/api/creador/foto/finalizar', 0, 200);
    await capture.settle();
    assert.equal(finalized.body.version, original.profile.version);
    assert.equal(fixture.photoPolicies.length, 1);
    assert.equal(providerUploads.length, 1);
    const final = await fixture.rawOwner(cookie);
    assert.equal(final.profile.version, original.profile.version + 1);
    assert.equal(final.profile.photo.version, 'browser-photo-1');
    assert.equal(capture.writes().filter(({ path }) => path.endsWith('/autorizar')).length, 2);
    assert.equal(capture.writes().filter(({ path }) => path.endsWith('/finalizar')).length, 1,
      'the only finalization belongs to the later explicit photo submission');
  } finally {
    boundRequests.stop();
    await page.unroute('https://creator-photos.example.invalid/**', providerHandler).catch(() => {});
    await capture.stop();
  }
});

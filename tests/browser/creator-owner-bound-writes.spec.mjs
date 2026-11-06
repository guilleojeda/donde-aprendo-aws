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

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const pathOf = (request) => new URL(request.url()).pathname.replace(/\/$/u, '');
const ownerResponse = (page, method, path, status) => page.waitForResponse((response) => response.request().method() === method
  && pathOf(response.request()) === path && response.status() === status);
const waitForRender = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

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

test('la finalización de foto rechazada conserva la foto activa y el archivo hasta una nueva carga manual', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const emptyOwner = await fixture.rawOwner(cookie);
  const account = originalAccount(fixture);
  const images = await rasterPhotoFixtures();
  const initialUpload = await fixture.photos.beginUpload({
    profileId: emptyOwner.owner.profileId,
    expectedVersion: emptyOwner.profile.version,
  });
  fixture.photoObjects.seed(initialUpload.post.fields.key, images.jpeg);
  await fixture.photos.finalizeUpload({
    profileId: emptyOwner.owner.profileId,
    uploadId: initialUpload.uploadId,
    expectedVersion: emptyOwner.profile.version,
  });
  const original = await fixture.rawOwner(cookie);
  assert.equal(original.profile.photo.version, initialUpload.uploadId, 'the starting profile has an active, persisted photo');

  const capture = await captureCreatorApi(page);
  const boundRequests = bindBrowserRequests(page);
  const providerUploads = [];
  let storeCallsBeforeRejectedFinalize;
  let principalAfterRoleFlip;
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
    assert.ok(payload.includes(images.png), 'both native PNG upload attempts send the selected file bytes');
    const key = payload.toString('latin1').match(/Content-Disposition: form-data; name="key"\r\n\r\n([^\r\n]+)/iu)?.[1];
    assert.ok(key, 'the direct upload uses the authorized object key');
    fixture.photoObjects.seed(key, images.png);
    providerUploads.push({ key, payload });
    if (providerUploads.length === 1) {
      fixture.accountStore.seedAccount({ ...account, isAdmin: !original.principal.isAdmin });
      principalAfterRoleFlip = await fixture.principal(cookie);
      assert.equal(principalAfterRoleFlip.accountId, original.principal.accountId);
      assert.equal(principalAfterRoleFlip.csrfToken, original.principal.csrfToken);
      assert.notEqual(principalAfterRoleFlip.isAdmin, original.principal.isAdmin);
      storeCallsBeforeRejectedFinalize = fixture.creatorStore.calls.length;
    }
    await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': fixture.origin } });
  };
  await page.route('https://creator-photos.example.invalid/**', providerHandler);
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    const documentHandle = await page.evaluateHandle(() => document);
    await page.getByRole('button', { name: 'Editar foto' }).click();
    const form = photoForm(page);
    const file = form.getByLabel('Elegir una foto');
    await file.setInputFiles({ name: 'foto-vinculada.png', mimeType: 'image/png', buffer: images.png });
    const selectedFile = await file.evaluateHandle((input) => input.files[0]);

    await form.getByRole('button', { name: 'Subir y guardar foto' }).click();
    const rejected = await waitForStatus(capture, 'POST', '/api/creador/foto/finalizar', 0, 409);
    await capture.settle();
    assert.equal(providerUploads.length, 1, 'the provider accepted the upload before finalization was rejected');
    assert.equal(principalAfterRoleFlip.isAdmin, !original.principal.isAdmin,
      'the same account role changed after the provider stored the uploaded file');
    assert.equal(rejected.responseBody.error, 'SESSION_CONTEXT_CHANGED');
    assert.equal(Object.hasOwn(rejected.responseBody, 'csrfToken'), false);
    assert.equal(Object.hasOwn(rejected.responseBody, 'profile'), false);
    assert.equal(rejected.body.version, original.profile.version);
    assert.equal(rejected.body.uploadId, 'browser-photo-2');
    assert.equal(boundRequests.requests[0].headers['x-creator-page-binding'], creatorPageSessionBinding(original.principal));
    assert.equal(fixture.creatorStore.calls.length, storeCallsBeforeRejectedFinalize,
      'the mismatched finalization is rejected before profile storage is read or written');
    const afterRejectedFinalize = await fixture.rawOwner(cookie);
    assert.deepEqual(afterRejectedFinalize.profile, original.profile,
      'the prior active photo and profile version are unchanged after rejection');
    assert.equal(afterRejectedFinalize.profile.photo.version, original.profile.photo.version);
    assert.equal(afterRejectedFinalize.profile.version, original.profile.version);
    assert.equal(await file.evaluate((input, previous) => input.files[0] === previous, selectedFile), true,
      'the exact native File remains the photo draft');
    assert.equal(await page.evaluate((previous) => document === previous, documentHandle), true,
      'recovery stays in the original document');
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin);
    await expect(sessionCheck(page)).toBeEnabled();
    assert.equal(apiEntries(capture, 'POST', '/api/creador/foto/autorizar').length, 1);
    assert.equal(apiEntries(capture, 'POST', '/api/creador/foto/finalizar').length, 1,
      'the rejected finalization is not retried automatically');
    assert.equal(fixture.photoPolicies.length, 2, 'one existing photo plus one attempted replacement were authorized');

    fixture.accountStore.seedAccount(account);
    const restored = await fixture.principal(cookie);
    assert.equal(restored.accountId, original.principal.accountId);
    assert.equal(restored.csrfToken, original.principal.csrfToken);
    assert.equal(restored.isAdmin, original.principal.isAdmin, 'the original role is restored on the same cookie');
    const writesBeforeSessionCheck = capture.writes().length;
    const profileReadsBeforeSessionCheck = apiEntries(capture, 'GET', ownerPath).length;
    const storeCallsBeforeSessionCheck = fixture.creatorStore.calls.length;
    const objectCallsBeforeSessionCheck = fixture.photoObjects.calls.length;
    const policiesBeforeSessionCheck = fixture.photoPolicies.length;
    const uploadsBeforeSessionCheck = providerUploads.length;
    const sessionChecksBefore = apiEntries(capture, 'GET', sessionPath).length;
    await sessionCheck(page).click();
    await expect(sessionCheck(page)).toHaveCount(0);
    const restoredSession = await waitForStatus(capture, 'GET', sessionPath, sessionChecksBefore, 200);
    await capture.settle();
    assert.deepEqual(restoredSession.responseBody, { csrfToken: original.principal.csrfToken });
    assert.equal(capture.writes().length, writesBeforeSessionCheck, 'session checking sends no owner write');
    assert.equal(apiEntries(capture, 'GET', ownerPath).length, profileReadsBeforeSessionCheck,
      'session checking does not read or adopt profile content');
    assert.equal(fixture.creatorStore.calls.length, storeCallsBeforeSessionCheck);
    assert.equal(fixture.photoObjects.calls.length, objectCallsBeforeSessionCheck,
      'session checking does not read or transfer photo objects');
    assert.equal(fixture.photoPolicies.length, policiesBeforeSessionCheck);
    assert.equal(providerUploads.length, uploadsBeforeSessionCheck);
    assert.equal(apiEntries(capture, 'POST', '/api/creador/foto/finalizar').length, 1,
      'session checking does not replay finalization');
    assert.equal(await file.evaluate((input, previous) => input.files[0] === previous, selectedFile), true);
    assert.equal(await page.evaluate((previous) => document === previous, documentHandle), true);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin);
    await expect(form.getByRole('button', { name: 'Subir y guardar foto' })).toBeEnabled();

    await form.getByRole('button', { name: 'Subir y guardar foto' }).click();
    const authorized = await waitForStatus(capture, 'POST', '/api/creador/foto/autorizar', 1, 200);
    assert.equal(authorized.responseBody.uploadId, 'browser-photo-3', 'manual retry receives a fresh authorization');
    const saved = await waitForStatus(capture, 'POST', '/api/creador/foto/finalizar', 1, 200);
    await capture.settle();
    assert.deepEqual(saved.responseBody.versionChanges, [
      { entity: 'profile', id: original.profile.id, before: original.profile.version, after: original.profile.version + 1 },
    ]);
    const final = await fixture.rawOwner(cookie);
    assert.equal(final.profile.version, original.profile.version + 1);
    assert.equal(final.profile.photo.version, authorized.responseBody.uploadId);
    assert.deepEqual(providerUploads.map(({ key }) => key), fixture.photoPolicies.slice(1).map(({ key }) => key),
      'each browser upload uses a real authorization result');
    assert.equal(providerUploads.length, 2, 'only the rejected upload and the later manual upload reached the provider');
    assert.deepEqual(apiEntries(capture, 'POST', '/api/creador/foto/autorizar').map(({ status }) => status), [200, 200]);
    assert.deepEqual(apiEntries(capture, 'POST', '/api/creador/foto/finalizar').map(({ status }) => status), [409, 200]);
    assert.deepEqual(boundRequests.requests.map(({ headers }) => headers['x-creator-page-binding']),
      Array(4).fill(creatorPageSessionBinding(original.principal)));
    const storedPhoto = await fixture.photos.readPhoto({
      profileId: original.owner.profileId,
      version: final.profile.photo.version,
    });
    assert.equal(storedPhoto.contentType, 'image/webp');
    assert.equal(storedPhoto.body.toString('ascii', 0, 4), 'RIFF', 'the manually uploaded replacement is readable from storage');
  } finally {
    fixture.accountStore.seedAccount(account);
    boundRequests.stop();
    await page.unroute('https://creator-photos.example.invalid/**', providerHandler).catch(() => {});
    await capture.stop();
  }
});

for (const historyFailure of [
  { label: 'disabled-account 403', status: 403, error: 'ACCOUNT_DISABLED', change: (account) => ({ ...account, active: false }) },
  { label: 'changed-role 409', status: 409, error: 'SESSION_CONTEXT_CHANGED', change: (account) => ({ ...account, isAdmin: !account.isAdmin }) },
]) {
  for (const olderErrorFirst of [false, true]) {
  test(`a confirmed native photo supersedes older ${historyFailure.label} Solicitudes evidence delivered ${olderErrorFirst ? 'before' : 'after'} finalization`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const account = originalAccount(fixture);
    const startingProfile = (await fixture.rawOwner(cookie)).profile;
    const { png } = await rasterPhotoFixtures();
    const capture = await captureCreatorApi(page);
    const history = { arrived: deferred(), gate: deferred() };
    const finalize = { arrived: deferred(), gate: deferred() };
    await page.route('https://creator-photos.example.invalid/**', async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: {
          'access-control-allow-origin': fixture.origin, 'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '',
        } });
        return;
      }
      const payload = request.postDataBuffer() ?? Buffer.alloc(0);
      assert.ok(payload.includes(png), 'the provider receives the selected native file');
      const key = payload.toString('latin1').match(/Content-Disposition: form-data; name="key"\r\n\r\n([^\r\n]+)/iu)?.[1];
      assert.ok(key);
      fixture.photoObjects.seed(key, png);
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': fixture.origin } });
    });
    await page.route('**/api/creador/**', async (route) => {
      const request = route.request();
      if (request.method() === 'GET' && pathOf(request) === ownerPath) {
        const response = await route.fetch();
        assert.equal(response.status(), historyFailure.status);
        const body = await response.json();
        assert.equal(body.error, historyFailure.error);
        history.arrived.resolve();
        await history.gate.promise;
        await route.fulfill({ response, json: body });
        return;
      }
      if (request.method() === 'POST' && pathOf(request) === '/api/creador/foto/finalizar') {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        const body = await response.json();
        assert.equal(body.versionChanges[0].after, startingProfile.version + 1);
        finalize.arrived.resolve();
        await finalize.gate.promise;
        await route.fulfill({ response, json: body });
        return;
      }
      await route.continue();
    });
    try {
      await page.goto(`${fixture.origin}/cuenta/?vista=solicitudes`);
      await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
      fixture.accountStore.seedAccount(historyFailure.change(account));
      const historyResponse = ownerResponse(page, 'GET', ownerPath, historyFailure.status);
      await page.getByRole('button', { name: 'Actualizar solicitudes' }).click();
      await history.arrived.promise;
      fixture.accountStore.seedAccount(account);

      await page.getByRole('button', { name: 'Editar foto' }).click();
      const dialog = page.getByRole('dialog');
      const file = dialog.getByLabel('Elegir una foto');
      await file.setInputFiles({ name: 'ordering.png', mimeType: 'image/png', buffer: png });
      const finalizeResponse = ownerResponse(page, 'POST', '/api/creador/foto/finalizar', 200);
      await dialog.getByRole('button', { name: 'Subir y guardar foto' }).click();
      await finalize.arrived.promise;
      assert.equal((await fixture.rawOwner(cookie)).profile.version, startingProfile.version + 1,
        'the real finalization commits before its browser response is released');

      if (olderErrorFirst) {
        history.gate.resolve();
        await historyResponse;
        await waitForRender(page);
      }
      finalize.gate.resolve();
      await finalizeResponse;
      await expect(dialog).toHaveCount(0);
      if (!olderErrorFirst) {
        history.gate.resolve();
        await historyResponse;
        await waitForRender(page);
      }
      await expect(page.getByRole('button', { name: 'Editar datos' })).toBeEnabled();
      assert.equal(capture.records.find((record) => record.method === 'GET' && record.path === ownerPath)?.responseBody?.error,
        historyFailure.error, 'the stale history classification came from the real owner endpoint');

      await page.getByRole('button', { name: 'Editar datos' }).click();
      const form = dataForm(page);
      await form.getByLabel('Nombre visible').fill(`Manual save after ${historyFailure.label} ${olderErrorFirst ? 'early' : 'late'} history`);
      await form.getByRole('button', { name: 'Guardar datos' }).click();
      const saved = await waitForStatus(capture, 'PUT', ownerPath, 0, 200);
      assert.equal((await fixture.rawOwner(cookie)).profile.displayName, saved.responseBody.profile.displayName);
      assert.equal(capture.records.filter((record) => record.method === 'POST' && record.path.endsWith('/foto/finalizar')).length, 1,
        'the delayed history response never repeats photo finalization');
    } finally {
      fixture.accountStore.seedAccount(account);
      history.gate.resolve();
      finalize.gate.resolve();
      await page.unroute('**/api/creador/**').catch(() => {});
      await page.unroute('https://creator-photos.example.invalid/**').catch(() => {});
      await capture.stop({ skipErrorBodies: true });
    }
  });
  }
}

for (const historyFailure of [
  { label: 'disabled-account 403', status: 403, error: 'ACCOUNT_DISABLED', change: (account) => ({ ...account, active: false }) },
  { label: 'changed-role 409', status: 409, error: 'SESSION_CONTEXT_CHANGED', change: (account) => ({ ...account, isAdmin: !account.isAdmin }) },
]) {
test(`a newer photo finalization role denial stays recoverable after older ${historyFailure.label} Solicitudes evidence`, async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const account = originalAccount(fixture);
  const before = (await fixture.rawOwner(cookie)).profile;
  const { png } = await rasterPhotoFixtures();
  const capture = await captureCreatorApi(page);
  const history = { arrived: deferred(), gate: deferred() };
  let roleChanged = false;
  await page.route('https://creator-photos.example.invalid/**', async (route) => {
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
    assert.ok(payload.includes(png));
    const key = payload.toString('latin1').match(/Content-Disposition: form-data; name="key"\r\n\r\n([^\r\n]+)/iu)?.[1];
    assert.ok(key);
    fixture.photoObjects.seed(key, png);
    if (!roleChanged) {
      roleChanged = true;
      fixture.accountStore.seedAccount({ ...account, isAdmin: !account.isAdmin });
    }
    await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': fixture.origin } });
  });
  await page.route('**/api/creador/perfil/**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    assert.equal(response.status(), historyFailure.status);
    const body = await response.json();
    assert.equal(body.error, historyFailure.error);
    history.arrived.resolve();
    await history.gate.promise;
    await route.fulfill({ response, json: body });
  });
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=solicitudes`);
    await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
    fixture.accountStore.seedAccount(historyFailure.change(account));
    const historyResponse = ownerResponse(page, 'GET', ownerPath, historyFailure.status);
    await page.getByRole('button', { name: 'Actualizar solicitudes' }).click();
    await history.arrived.promise;
    fixture.accountStore.seedAccount(account);

    await page.getByRole('button', { name: 'Editar foto' }).click();
    const form = photoForm(page);
    const file = form.getByLabel('Elegir una foto');
    await file.setInputFiles({ name: 'newer-denial.png', mimeType: 'image/png', buffer: png });
    const selectedFile = await file.evaluateHandle((input) => input.files[0]);
    const rejectedResponse = waitForStatus(capture, 'POST', '/api/creador/foto/finalizar', 0, 409);
    await form.getByRole('button', { name: 'Subir y guardar foto' }).click();
    const rejected = await rejectedResponse;
    assert.equal(rejected.responseBody.error, 'SESSION_CONTEXT_CHANGED');
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, before, 'the rejected finalization does not mutate the profile');
    await expect(sessionCheck(page)).toBeEnabled();
    assert.equal(await file.evaluate((input, previous) => input.files[0] === previous, selectedFile), true);

    fixture.accountStore.seedAccount(account);
    history.gate.resolve();
    await historyResponse;
    await waitForRender(page);
    await expect(sessionCheck(page)).toBeEnabled();
    const renewed = ownerResponse(page, 'GET', sessionPath, 200);
    await sessionCheck(page).click();
    await renewed;
    await expect(sessionCheck(page)).toHaveCount(0);
    assert.equal(await file.evaluate((input, previous) => input.files[0] === previous, selectedFile), true,
      'the exact native File remains available after the explicit session-only check');
    const authorizeAgain = waitForStatus(capture, 'POST', '/api/creador/foto/autorizar', 1, 200);
    const finalizeAgain = waitForStatus(capture, 'POST', '/api/creador/foto/finalizar', 1, 200);
    await form.getByRole('button', { name: 'Subir y guardar foto' }).click();
    await authorizeAgain;
    await finalizeAgain;
    await capture.settle();
    assert.equal((await fixture.rawOwner(cookie)).profile.version, before.version + 1);
    assert.deepEqual(apiEntries(capture, 'POST', '/api/creador/foto/autorizar').map(({ status }) => status), [200, 200]);
    assert.deepEqual(apiEntries(capture, 'POST', '/api/creador/foto/finalizar').map(({ status }) => status), [409, 200]);
    assert.equal(capture.records.filter((record) => record.method === 'POST' && record.path.endsWith('/foto/finalizar')).length, 2,
      'the denied attempt is followed only by the explicit recovered upload');
  } finally {
    fixture.accountStore.seedAccount(account);
    history.gate.resolve();
    await page.unroute('**/api/creador/perfil/**').catch(() => {});
    await page.unroute('https://creator-photos.example.invalid/**').catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});
}

test('ACCOUNT_DISABLED on a regular profile save enters a terminal state and preserves the draft', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const original = await fixture.rawOwner(cookie);
  const account = originalAccount(fixture);
  const capture = await captureCreatorApi(page);
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    await page.getByRole('button', { name: 'Editar datos' }).click();
    const form = dataForm(page);
    await form.getByLabel('Nombre visible').fill('Draft retained for disabled account');
    fixture.accountStore.seedAccount({ ...account, active: false });
    const rejectedPromise = waitForStatus(capture, 'PUT', ownerPath, 0, 403);
    await form.getByRole('button', { name: 'Guardar datos' }).click();
    const rejected = await rejectedPromise;
    await capture.settle();
    assert.equal(rejected.responseBody.error, 'ACCOUNT_DISABLED');
    await expect(form.getByLabel('Nombre visible')).toHaveValue('Draft retained for disabled account');
    await expect(page.locator('[data-owner-dialog][open] [data-session-recovery-status]')).toContainText('Esta cuenta está desactivada.');
    await expect(sessionCheck(page)).toHaveCount(0);
    await expect(form.getByRole('button', { name: 'Guardar datos' })).toBeDisabled();
    assert.equal(capture.writes().length, 1, 'the real disabled response is not retried');
    fixture.accountStore.seedAccount(account);
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, original.profile);
  } finally {
    fixture.accountStore.seedAccount(account);
    await capture.stop({ skipErrorBodies: true });
  }
});

test('ACCOUNT_DISABLED photo authorization enters a terminal state without uploading or losing the File', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const original = await fixture.rawOwner(cookie);
  const account = originalAccount(fixture);
  const { png } = await rasterPhotoFixtures();
  const capture = await captureCreatorApi(page);
  const providerUploads = [];
  await page.route('https://creator-photos.example.invalid/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': fixture.origin } });
      return;
    }
    providerUploads.push(route.request().postDataBuffer());
    await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': fixture.origin } });
  });
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    await page.getByRole('button', { name: 'Editar foto' }).click();
    const form = photoForm(page);
    const file = form.getByLabel('Elegir una foto');
    await file.setInputFiles({ name: 'disabled-authorize.png', mimeType: 'image/png', buffer: png });
    const selectedFile = await file.evaluateHandle((input) => input.files[0]);
    fixture.accountStore.seedAccount({ ...account, active: false });
    const rejectedPromise = waitForStatus(capture, 'POST', '/api/creador/foto/autorizar', 0, 403);
    await form.getByRole('button', { name: 'Subir y guardar foto' }).click();
    const rejected = await rejectedPromise;
    await capture.settle();
    assert.equal(rejected.responseBody.error, 'ACCOUNT_DISABLED');
    await expect(page.locator('[data-owner-dialog][open] [data-session-recovery-status]')).toContainText('Esta cuenta está desactivada.');
    await expect(sessionCheck(page)).toHaveCount(0);
    await expect(form.getByRole('button', { name: 'Subir y guardar foto' })).toBeDisabled();
    assert.equal(await file.evaluate((input, previous) => input.files[0] === previous, selectedFile), true);
    assert.equal(providerUploads.length, 0);
    assert.equal(fixture.photoPolicies.length, 0);
    assert.equal(apiEntries(capture, 'POST', '/api/creador/foto/finalizar').length, 0);
    assert.equal(capture.writes().length, 1);
    fixture.accountStore.seedAccount(account);
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, original.profile);
  } finally {
    fixture.accountStore.seedAccount(account);
    await page.unroute('https://creator-photos.example.invalid/**').catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

test('ACCOUNT_DISABLED photo finalization enters a terminal state and preserves the File and active photo', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const original = await fixture.rawOwner(cookie);
  const account = originalAccount(fixture);
  const { png } = await rasterPhotoFixtures();
  const capture = await captureCreatorApi(page);
  const providerUploads = [];
  await page.route('https://creator-photos.example.invalid/**', async (route) => {
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
    assert.ok(payload.includes(png));
    const key = payload.toString('latin1').match(/Content-Disposition: form-data; name="key"\r\n\r\n([^\r\n]+)/iu)?.[1];
    assert.ok(key);
    fixture.photoObjects.seed(key, png);
    providerUploads.push({ key, payload });
    fixture.accountStore.seedAccount({ ...account, active: false });
    await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': fixture.origin } });
  });
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    await page.getByRole('button', { name: 'Editar foto' }).click();
    const form = photoForm(page);
    const file = form.getByLabel('Elegir una foto');
    await file.setInputFiles({ name: 'disabled-finalize.png', mimeType: 'image/png', buffer: png });
    const selectedFile = await file.evaluateHandle((input) => input.files[0]);
    const rejectedPromise = waitForStatus(capture, 'POST', '/api/creador/foto/finalizar', 0, 403);
    await form.getByRole('button', { name: 'Subir y guardar foto' }).click();
    const rejected = await rejectedPromise;
    await capture.settle();
    assert.equal(rejected.responseBody.error, 'ACCOUNT_DISABLED');
    await expect(page.locator('[data-owner-dialog][open] [data-session-recovery-status]')).toContainText('Esta cuenta está desactivada.');
    await expect(sessionCheck(page)).toHaveCount(0);
    await expect(form.getByRole('button', { name: 'Subir y guardar foto' })).toBeDisabled();
    assert.equal(await file.evaluate((input, previous) => input.files[0] === previous, selectedFile), true);
    assert.equal(providerUploads.length, 1, 'the authorized upload reaches the provider before the real finalization denial');
    assert.equal(fixture.photoPolicies.length, 1);
    assert.equal(capture.writes().length, 2, 'one authorization and one denied finalization are sent');
    fixture.accountStore.seedAccount(account);
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, original.profile,
      'the denied finalization leaves the previous photo and profile version unchanged');
  } finally {
    fixture.accountStore.seedAccount(account);
    await page.unroute('https://creator-photos.example.invalid/**').catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

test('a malformed successful photo authorization does not override older disabled Solicitudes evidence', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const original = await fixture.rawOwner(cookie);
  const account = originalAccount(fixture);
  const { png } = await rasterPhotoFixtures();
  const capture = await captureCreatorApi(page);
  const history = { arrived: deferred(), gate: deferred() };
  await page.route('**/api/creador/**', async (route) => {
    const request = route.request();
    if (request.method() === 'GET' && pathOf(request) === ownerPath) {
      const response = await route.fetch();
      assert.equal(response.status(), 403);
      const body = await response.json();
      assert.equal(body.error, 'ACCOUNT_DISABLED');
      history.arrived.resolve();
      await history.gate.promise;
      await route.fulfill({ response, json: body });
      return;
    }
    if (request.method() === 'POST' && pathOf(request) === '/api/creador/foto/autorizar') {
      const response = await route.fetch();
      assert.equal(response.status(), 200, 'the service returned a real authorization response');
      await route.fulfill({ response, json: {} });
      return;
    }
    await route.continue();
  });
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=solicitudes`);
    await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
    fixture.accountStore.seedAccount({ ...account, active: false });
    const historyResponse = ownerResponse(page, 'GET', ownerPath, 403);
    await page.getByRole('button', { name: 'Actualizar solicitudes' }).click();
    await history.arrived.promise;
    fixture.accountStore.seedAccount(account);

    await page.getByRole('button', { name: 'Editar foto' }).click();
    const form = photoForm(page);
    const file = form.getByLabel('Elegir una foto');
    await file.setInputFiles({ name: 'malformed-authorize.png', mimeType: 'image/png', buffer: png });
    const selectedFile = await file.evaluateHandle((input) => input.files[0]);
    await form.getByRole('button', { name: 'Subir y guardar foto' }).click();
    const malformed = await waitForStatus(capture, 'POST', '/api/creador/foto/autorizar', 0, 200);
    assert.deepEqual(malformed.responseBody, {});
    assert.equal(apiEntries(capture, 'POST', '/api/creador/foto/finalizar').length, 0);
    assert.equal(capture.writes().length, 1, 'an invalid authorization body does not start upload/finalization');

    history.gate.resolve();
    await historyResponse;
    await waitForRender(page);
    await expect(page.locator('[data-owner-dialog][open] [data-session-recovery-status]')).toContainText('Esta cuenta está desactivada.');
    await expect(sessionCheck(page)).toHaveCount(0);
    await expect(form.getByRole('button', { name: 'Subir y guardar foto' })).toBeDisabled();
    assert.equal(await file.evaluate((input, previous) => input.files[0] === previous, selectedFile), true);
    fixture.accountStore.seedAccount(account);
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, original.profile);
  } finally {
    fixture.accountStore.seedAccount(account);
    history.gate.resolve();
    await page.unroute('**/api/creador/**').catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

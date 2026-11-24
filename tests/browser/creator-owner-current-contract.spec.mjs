import assert from 'node:assert/strict';

import {
  api,
  captureCreatorApi,
  expect,
  loggedInOwner,
  test,
} from '../fixtures/creator-browser-test.mjs';
import { rasterPhotoFixtures } from '../fixtures/creator-photos.mjs';

const OWNER_PATH = '/api/creador/perfil';

function pathOf(request) {
  return new URL(request.url()).pathname.replace(/\/$/u, '');
}

function writesTo(capture, method, path) {
  return capture.writes().filter((write) => write.method === method && write.path === path);
}

async function currentSnapshot(fixture, cookie) {
  const result = await api(fixture, cookie, `${OWNER_PATH}/`, {
    headers: { 'x-creator-contract': '3' },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.schemaVersion, 3, 'the readback uses the one current owner contract');
  return result.body;
}

// Keep this preparation independent of the shared read helper while the
// baseline still returns its negotiated legacy shape for an unheadered GET.
async function ownerWithProfile(fixture, page) {
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  const created = await api(fixture, cookie, '/api/creador/perfil', {
    method: 'PUT',
    body: {
      creatorVersion: null,
      displayName: 'Ana Browser',
      slug: 'ana-browser',
      socials: {},
    },
  });
  assert.equal(created.response.status, 200, JSON.stringify(created.body));
  return cookie;
}

async function addLinkWithoutRead(fixture, cookie, values = {}) {
  const owner = await fixture.rawOwner(cookie);
  const result = await api(fixture, cookie, '/api/creador/enlaces', {
    method: 'POST',
    body: {
      creatorVersion: owner.profile.version,
      title: 'Enlace de contrato actual',
      url: 'https://contract.example.invalid/default',
      ...values,
    },
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body;
}

async function openLinks(page, fixture) {
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces&buscar=contract`);
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  await page.locator('#owner-link-order').selectOption('titulo-desc');
  await expect(page).toHaveURL((url) => url.searchParams.get('orden') === 'titulo-desc');
}

async function requestBack(page, activeUrl) {
  const attempt = page.goBack();
  attempt.catch(() => {});
  await expect(page.locator('[data-owner-exit-prompt]')).toBeVisible();
  await expect(page).toHaveURL(activeUrl);
  return attempt;
}

/**
 * Forward the browser request to the real local handler, changing only the
 * contract header for the selected write. Profile reads are observed and
 * forwarded unchanged so a current response cannot be supplied by the test.
 */
async function installContractForwarder(page, { method, path, contract }) {
  const events = { reads: [], writes: [] };
  const handler = async (route) => {
    const request = route.request();
    const pathname = pathOf(request);
    if (request.method() === 'GET' && pathname === OWNER_PATH) {
      const requestHeaders = await request.allHeaders();
      const response = await route.fetch();
      const rawBody = await response.body();
      const body = JSON.parse(rawBody.toString('utf8'));
      events.reads.push({ requestHeaders, status: response.status(), body });
      const headers = { ...response.headers() };
      delete headers['content-length'];
      await route.fulfill({ status: response.status(), headers, body: rawBody });
      return;
    }
    if (request.method() !== method || pathname !== path) {
      await route.continue();
      return;
    }
    const headers = await request.allHeaders();
    if (contract === undefined) delete headers['x-creator-contract'];
    else headers['x-creator-contract'] = contract;
    const response = await route.fetch({ headers });
    const rawBody = await response.body();
    const body = rawBody.length > 0 ? JSON.parse(rawBody.toString('utf8')) : undefined;
    events.writes.push({ requestHeaders: headers, status: response.status(), body });
    const responseHeaders = { ...response.headers() };
    delete responseHeaders['content-length'];
    await route.fulfill({ status: response.status(), headers: responseHeaders, body: rawBody });
  };
  await page.route('**/api/creador/**', handler);
  return {
    ...events,
    async remove() {
      await page.unroute('**/api/creador/**', handler).catch(() => {});
    },
  };
}

async function expectOrdinaryContractRejection(page, surface) {
  await expect(surface).toContainText(/actualiz|recarg|refresc|volver a cargar/iu);
  await expect(page.locator('[data-owner-recovery]')).toHaveCount(0,
    'a current-contract rejection is not a conflict, unknown result, or read recovery');
  await expect(page.locator('[data-owner-current-page]')).toHaveCount(0,
    'the retired old-tab continuation control is absent');
  await expect(page.locator('[data-session-recovery-shell]')).toHaveCount(0,
    'the rejection does not enter a session recovery or terminal block');
  await expect(page.locator('[data-session-recovery-new], [data-session-recovery-sign-in]')).toHaveCount(0,
    'the rejection does not offer a version-specific new-tab session action');
}

async function installPhotoProvider(page, fixture) {
  const uploads = [];
  const handler = async (route) => {
    const request = route.request();
    const cors = { 'access-control-allow-origin': fixture.origin };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: {
        ...cors,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '',
      } });
      return;
    }
    assert.equal(request.method(), 'POST');
    const contentType = request.headers()['content-type'];
    const payload = request.postDataBuffer() ?? Buffer.alloc(0);
    const formData = await new Request(request.url(), {
      method: 'POST', headers: { 'content-type': contentType }, body: payload,
    }).formData();
    const key = formData.get('key');
    const file = formData.get('file');
    assert.equal(typeof key, 'string');
    assert.ok(file && typeof file.arrayBuffer === 'function');
    uploads.push({ key, bytes: Buffer.from(await file.arrayBuffer()) });
    fixture.photoObjects.seed(key, uploads.at(-1).bytes);
    await route.fulfill({ status: 204, headers: cors });
  };
  await page.route('https://creator-photos.example.invalid/**', handler);
  return {
    uploads,
    async remove() {
      await page.unroute('https://creator-photos.example.invalid/**', handler).catch(() => {});
    },
  };
}

test('a current owner GET is real and an ordinary editor save rejects an obsolete write without effects or recovery', async ({ fixture, page }) => {
  const cookie = await ownerWithProfile(fixture, page);
  const created = await addLinkWithoutRead(fixture, cookie, {
    title: 'Ficha del contrato actual',
    url: 'https://contract.example.invalid/editor',
  });
  const before = await fixture.rawResource(created.resourceId);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const gate = await installContractForwarder(page, {
    method: 'PATCH', path: `/api/creador/enlaces/${created.placementId}/editar`, contract: '2',
  });
  let currentRead;
  try {
    await openLinks(page, fixture);
    const readsBeforeWrite = gate.reads.length;
    const row = page.locator(`[data-link-row="${created.placementId}"]`);
    await row.getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const form = page.locator('form[data-owner-form="enlace"]');
    const title = form.getByLabel('Título', { exact: true });
    await title.fill('Borrador que debe conservarse');
    await form.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'PATCH', `/api/creador/enlaces/${created.placementId}/editar`)[0]?.status).toBe(409);
    assert.equal(gate.writes[0].status, 409);
    assert.equal(gate.writes[0].body.error, 'CREATOR_CONTRACT_OBSOLETE',
      'the real write gate, not a synthetic response, identifies the obsolete contract');
    await expectOrdinaryContractRejection(page, form.locator('[data-owner-form-status="enlace"]'));
    assert.equal(gate.reads.length, readsBeforeWrite, 'the definitive rejection does not trigger a comparison GET');
    assert.deepEqual(await fixture.rawResource(created.resourceId), before,
      'the rejected write leaves the resource row unchanged');
    await expect(title).toHaveValue('Borrador que debe conservarse');
    assert.equal(writesTo(capture, 'PATCH', `/api/creador/enlaces/${created.placementId}/editar`).length, 1,
      'the rejected write is not replayed');

    await gate.remove();
    currentRead = await installContractForwarder(page, { method: '__no-match__', path: '__no-match__', contract: undefined });
    await form.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'PATCH', `/api/creador/enlaces/${created.placementId}/editar`)[1]?.status).toBe(200);
    await expect.poll(() => currentRead.reads.length).toBeGreaterThan(0);
    await expect(page.locator(`[data-link-row="${created.placementId}"]`)).toContainText('Borrador que debe conservarse');
    assert.ok(currentRead.reads.length > 0, 'the successful manual action is reconciled through the real owner GET');
    assert.ok(currentRead.reads.every(({ status, body }) => status === 200 && body.schemaVersion === 3),
      'the readback after the successful action is current');
    assert.ok(currentRead.reads.every(({ requestHeaders }) => requestHeaders['x-creator-contract'] === undefined),
      'the owner GET readback does not select a version with X-Creator-Contract');
    await currentRead.remove();
    currentRead = undefined;
    const saved = await currentSnapshot(fixture, cookie);
    assert.equal(saved.resources.find(({ id }) => id === created.resourceId).title, 'Borrador que debe conservarse',
      'a normal current-contract action remains available after the rejection');
  } finally {
    await currentRead?.remove();
    await gate.remove();
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Guardar y salir cancela la navegación after an obsolete add write and leaves a manual current save available', async ({ fixture, page }) => {
  const cookie = await ownerWithProfile(fixture, page);
  await openLinks(page, fixture);
  const activeUrl = page.url();
  await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const form = page.locator('form[data-owner-form="alta-enlace"]');
  await form.getByLabel('Título', { exact: true }).fill('Borrador de salida actual');
  await form.getByLabel('URL', { exact: true }).fill('https://contract.example.invalid/save-and-exit');
  const before = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const gate = await installContractForwarder(page, {
    method: 'POST', path: '/api/creador/enlaces', contract: undefined,
  });
  let back;
  try {
    back = await requestBack(page, activeUrl);
    await page.locator('[data-owner-exit-prompt]').getByRole('button', { name: 'Guardar y salir', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(409);
    assert.equal(gate.writes[0].body.error, 'CREATOR_CONTRACT_OBSOLETE');
    await back;
    await expect(page).toHaveURL(activeUrl);
    await expect(form).toBeVisible();
    await expectOrdinaryContractRejection(page, form.locator('[data-owner-form-status="alta-enlace"]'));
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, before.profile,
      'the rejected save-and-exit has no profile effect');
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1,
      'the canceled navigation does not replay the rejected add');

    await gate.remove();
    await form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[1]?.status).toBe(201);
    await expect(form).toHaveCount(0, 'the later manual save consumes the editor after the pending exit was canceled');
    await expect(page.locator('[data-link-row]').filter({ hasText: 'Borrador de salida actual' })).toBeVisible();
    await expect(page).toHaveURL(activeUrl, 'the later manual save stays on the original links view');
    const saved = await currentSnapshot(fixture, cookie);
    const resourceId = writesTo(capture, 'POST', '/api/creador/enlaces')[1].responseBody.resourceId;
    assert.equal(saved.resources.find(({ id }) => id === resourceId).title, 'Borrador de salida actual');
  } finally {
    back?.catch(() => {});
    await gate.remove();
    await capture.stop({ skipErrorBodies: true });
  }
});

test('publication and list actions keep the real contract rejection local without overwriting it as conflict or session recovery', async ({ fixture, page }) => {
  const cookie = await ownerWithProfile(fixture, page);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const publicationGate = await installContractForwarder(page, {
    method: 'POST', path: '/api/creador/perfil/publicar', contract: '2',
  });
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    await expect(page.getByRole('button', { name: 'Publicar página', exact: true })).toBeVisible();
    const readsBeforePublication = publicationGate.reads.length;
    const before = await fixture.rawOwner(cookie);
    await page.getByRole('button', { name: 'Publicar página', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/perfil/publicar')[0]?.status).toBe(409);
    assert.equal(publicationGate.writes[0].body.error, 'CREATOR_CONTRACT_OBSOLETE');
    await expectOrdinaryContractRejection(page, page.locator('[data-owner-publish-error]'));
    assert.equal(publicationGate.reads.length, readsBeforePublication,
      'a rejected publication does not perform a comparison read that could overwrite its message');
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, before.profile,
      'the rejected publication does not change the stored profile');

    await publicationGate.remove();
    await page.getByRole('button', { name: 'Publicar página', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/perfil/publicar')[1]?.status).toBe(200);
    assert.equal((await fixture.rawOwner(cookie)).profile.published, true,
      'a later manual publication uses the current write contract');
    assert.equal((await currentSnapshot(fixture, cookie)).profile.published, true);
  } finally {
    await publicationGate.remove();
    await capture.stop({ skipErrorBodies: true });
  }

  const listCapture = await captureCreatorApi(page, { skipErrorBodies: true });
  const target = await addLinkWithoutRead(fixture, cookie, {
    title: 'Ficha para rechazo de lista', url: 'https://contract.example.invalid/list',
  });
  const listGate = await installContractForwarder(page, {
    method: 'DELETE', path: `/api/creador/enlaces/${target.placementId}`, contract: undefined,
  });
  try {
    await openLinks(page, fixture);
    const readsBeforeRemoval = listGate.reads.length;
    const before = await fixture.rawOwner(cookie);
    const row = page.locator(`[data-link-row="${target.placementId}"]`);
    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    await expect.poll(() => writesTo(listCapture, 'DELETE', `/api/creador/enlaces/${target.placementId}`)[0]?.status).toBe(409);
    assert.equal(listGate.writes[0].body.error, 'CREATOR_CONTRACT_OBSOLETE');
    await expectOrdinaryContractRejection(page, page.locator('[data-owner-list-action-error]'));
    assert.equal(listGate.reads.length, readsBeforeRemoval,
      'a rejected list action does not read a conflicting snapshot');
    await expect(row).toBeVisible();
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, before.profile,
      'the rejected list action leaves placement and resource state unchanged');
    assert.equal(writesTo(listCapture, 'DELETE', `/api/creador/enlaces/${target.placementId}`).length, 1);

    await listGate.remove();
    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    await expect.poll(() => writesTo(listCapture, 'DELETE', `/api/creador/enlaces/${target.placementId}`)[1]?.status).toBe(200);
    const saved = await currentSnapshot(fixture, cookie);
    assert.equal(Object.hasOwn(saved.placements, target.placementId), false,
      'the later manual list action succeeds against the current snapshot');
  } finally {
    await listGate.remove();
    await listCapture.stop({ skipErrorBodies: true });
  }
});

test('photo authorization treats the real obsolete-contract 409 as an ordinary rejection before upload or finalization', async ({ fixture, page }) => {
  const cookie = await ownerWithProfile(fixture, page);
  const images = await rasterPhotoFixtures();
  const before = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const gate = await installContractForwarder(page, {
    method: 'POST', path: '/api/creador/foto/autorizar', contract: '2',
  });
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
    const form = page.locator('[data-owner-dialog][open] form[data-owner-form="foto"]');
    const file = form.getByLabel('Elegir una foto');
    await file.setInputFiles({ name: 'contract-authorize.png', mimeType: 'image/png', buffer: images.png });
    const readsBefore = gate.reads.length;
    await form.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();
    await expect.poll(() => capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/autorizar')[0]?.status).toBe(409);
    assert.equal(gate.writes[0].body.error, 'CREATOR_CONTRACT_OBSOLETE');
    await expectOrdinaryContractRejection(page, form.locator('[data-owner-form-status="foto"]'));
    assert.equal(gate.reads.length, readsBefore);
    assert.equal(capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/finalizar').length, 0,
      'authorization rejection does not enter the finalization phase');
    await expect.poll(() => file.evaluate((input) => input.files?.length ?? 0)).toBe(1);
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, before.profile,
      'the rejected authorization leaves the current photo unchanged');
  } finally {
    await gate.remove();
    await capture.stop({ skipErrorBodies: true });
  }
});

test('photo finalization treats the real obsolete-contract 409 as an ordinary rejection and a later current submit succeeds', async ({ fixture, page }) => {
  const cookie = await ownerWithProfile(fixture, page);
  const images = await rasterPhotoFixtures();
  const provider = await installPhotoProvider(page, fixture);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const gate = await installContractForwarder(page, {
    method: 'POST', path: '/api/creador/foto/finalizar', contract: undefined,
  });
  try {
    const before = await fixture.rawOwner(cookie);
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
    const form = page.locator('[data-owner-dialog][open] form[data-owner-form="foto"]');
    const file = form.getByLabel('Elegir una foto');
    await file.setInputFiles({ name: 'contract-finalize.png', mimeType: 'image/png', buffer: images.png });
    const readsBefore = gate.reads.length;
    await form.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();
    await expect.poll(() => capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/autorizar')[0]?.status).toBe(200);
    await expect.poll(() => capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/finalizar')[0]?.status).toBe(409);
    assert.equal(gate.writes[0].body.error, 'CREATOR_CONTRACT_OBSOLETE');
    assert.equal(provider.uploads.length, 1, 'the real authorization and provider upload precede finalization');
    await expectOrdinaryContractRejection(page, form.locator('[data-owner-form-status="foto"]'));
    assert.equal(gate.reads.length, readsBefore, 'finalization rejection does not trigger a conflict read');
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, before.profile,
      'the rejected finalization leaves the profile and photo unchanged');
    assert.equal(capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/finalizar').length, 1,
      'the rejected finalization is not replayed automatically');

    await gate.remove();
    await form.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();
    await expect.poll(() => capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/autorizar')[1]?.status).toBe(200);
    await expect.poll(() => capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/finalizar')[1]?.status).toBe(200);
    assert.equal(provider.uploads.length, 2, 'the provider sees only the explicit second submit');
    await expect(form).toHaveCount(0);
    const saved = await currentSnapshot(fixture, cookie);
    assert.notEqual(saved.profile.photo?.version, before.profile.photo?.version,
      'the later current-contract photo action is confirmed by a real readback');
  } finally {
    await gate.remove();
    await provider.remove();
    await capture.stop({ skipErrorBodies: true });
  }
});


import assert from 'node:assert/strict';
import {
  test, expect, api, captureCreatorApi, loggedInOwner, addCookie,
} from '../fixtures/creator-browser-test.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';
import { rasterPhotoFixtures } from '../fixtures/creator-photos.mjs';

const OWNER_PATH = '/api/creador/perfil';
const LINKS_PATH = '/api/creador/enlaces';
const CLAIMS_PATH = '/api/creador/reclamaciones';
const AUTHORIZE_PHOTO_PATH = '/api/creador/foto/autorizar';
const FINALIZE_PHOTO_PATH = '/api/creador/foto/finalizar';

function pathOf(request) {
  return new URL(request.url()).pathname.replace(/\/$/u, '');
}

function records(capture, method, path) {
  return capture.records.filter((record) => record.method === method && record.path === path);
}

function ownerReads(capture) {
  return records(capture, 'GET', OWNER_PATH);
}

async function waitForRecord(capture, method, path, index, status) {
  await expect.poll(() => records(capture, method, path)[index]?.status).toBe(status);
  return records(capture, method, path)[index];
}

async function waitForOwnerRead(capture, previousCount, status = 200) {
  await expect.poll(() => ownerReads(capture).length).toBeGreaterThan(previousCount);
  const read = ownerReads(capture).at(-1);
  await expect.poll(() => read.status).toBe(status);
  return read;
}

async function readOwner(fixture, cookie) {
  const result = await api(fixture, cookie, OWNER_PATH);
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

function addForm(page) {
  return page.locator('[data-owner-dialog][open] form[data-owner-form="alta-enlace"]');
}

function photoForm(page) {
  return page.locator('[data-owner-dialog][open] form[data-owner-form="foto"]');
}

async function openView(page, fixture, view, query = '') {
  await page.goto(fixture.origin + '/cuenta/?vista=' + encodeURIComponent(view) + query);
  await expect(page.locator('astro-island[component-url*="CreatorOwnerApp"]')).not.toHaveAttribute('ssr', '');
  await page.waitForLoadState('networkidle');
}

function multipartField(payload, fieldName) {
  const expression = new RegExp('Content-Disposition: form-data; name="' + fieldName + '"\\r\\n\\r\\n([^\\r\\n]+)', 'iu');
  return payload.toString('latin1').match(expression)?.[1];
}

function installPhotoProvider(page, fixture, images, { failPngOnce = false, pauseSecondPng = false } = {}) {
  const uploads = [];
  let failedPng = false;
  let releasePng;
  let reachPng;
  const pngReached = new Promise((resolve) => { reachPng = resolve; });
  const pngGate = new Promise((resolve) => { releasePng = resolve; });
  const handler = async (route) => {
    const request = route.request();
    const cors = { 'access-control-allow-origin': fixture.origin };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '',
        },
      });
      return;
    }
    const payload = request.postDataBuffer() ?? Buffer.alloc(0);
    const bytes = [images.jpeg, images.png, images.webp].find((candidate) => payload.includes(candidate));
    assert(bytes, 'the browser sends the selected file bytes to the signed provider boundary');
    const key = multipartField(payload, 'key');
    assert(key, 'the provider transfer uses the exact key from real authorization');
    assert.equal(request.method(), 'POST');
    assert.match(request.headers()['content-type'] ?? '', /multipart\/form-data/iu);
    uploads.push({ key, bytes: Buffer.from(bytes) });
    if (bytes === images.png && failPngOnce && !failedPng) {
      failedPng = true;
      await route.fulfill({ status: 503, headers: cors, body: 'controlled provider failure before finalize' });
      return;
    }
    fixture.photoObjects.seed(key, bytes);
    if (bytes === images.png && pauseSecondPng && uploads.filter((item) => item.bytes.equals(images.png)).length === 1) {
      reachPng();
      await pngGate;
    }
    await route.fulfill({ status: 204, headers: cors });
  };
  return {
    uploads,
    install: () => page.route('https://creator-photos.example.invalid/**', handler),
    async remove() { releasePng(); await page.unroute('https://creator-photos.example.invalid/**', handler).catch(() => {}); },
    pngReached,
    releasePng: () => releasePng(),
  };
}

test('el alta ya presente conserva todos los campos crudos y no consume la salida pendiente', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  await openView(page, fixture, 'enlaces', '&buscar=preparacion-historial');
  await page.locator('#owner-link-order').selectOption('titulo-desc');
  const activeUrl = page.url();
  const capture = await captureCreatorApi(page);
  const originalUrl = 'https://draft-reuse.example/saved';
  const manualUrl = 'https://draft-reuse.example/new-manual-choice';

  try {
    await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const first = addForm(page);
    await first.getByLabel('Título', { exact: true }).fill('Ficha guardada');
    await first.getByLabel('URL', { exact: true }).fill(originalUrl);
    await first.getByLabel(/Descripción/u).fill('Descripción guardada');
    await first.getByLabel('Proponer al directorio', { exact: true }).uncheck();
    await first.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const created = await waitForRecord(capture, 'POST', LINKS_PATH, 0, 201);
    assert.equal(created.body.url, originalUrl);
    const initialRead = await waitForOwnerRead(capture, 0, 200);
    const savedBeforeReuse = initialRead.responseBody;
    const firstReadCount = ownerReads(capture).length;

    await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const add = addForm(page);
    await add.getByLabel('Título', { exact: true }).fill('  Título privado del borrador  ');
    await add.getByLabel('URL', { exact: true }).fill(originalUrl);
    await add.getByLabel(/Descripción/u).fill('  Descripción privada del borrador  ');
    await expect(add.getByLabel('Proponer al directorio', { exact: true })).toBeChecked();

    const back = page.goBack();
    const prompt = page.locator('[data-owner-exit-prompt]');
    await expect(prompt).toBeVisible();
    assert.equal(records(capture, 'POST', LINKS_PATH).length, 1,
      'opening the guarded departure does not submit the retained Add draft');
    await prompt.getByRole('button', { name: 'Guardar y salir', exact: true }).click();

    const reused = await waitForRecord(capture, 'POST', LINKS_PATH, 1, 200);
    assert.equal(reused.body.url, originalUrl);
    assert.equal(reused.body.title, '  Título privado del borrador  ');
    assert.equal(reused.body.description, '  Descripción privada del borrador  ');
    assert.equal(reused.responseBody.disposition, 'already-present');
    assert.equal(reused.responseBody.placementId, created.responseBody.placementId);
    const comparison = await waitForOwnerRead(capture, firstReadCount, 200);
    assert.deepEqual(comparison.responseBody, savedBeforeReuse,
      'the explicit comparison is a complete real owner GET and reuse made no content change');

    await back;
    await expect(page).toHaveURL(activeUrl,
      'the guarded destination is cleared because reuse did not consume the Add metadata');
    await expect(add).toBeVisible();
    await expect(add.getByLabel('Título', { exact: true })).toHaveValue('  Título privado del borrador  ');
    await expect(add.getByLabel('URL', { exact: true })).toHaveValue(originalUrl);
    await expect(add.getByLabel(/Descripción/u)).toHaveValue('  Descripción privada del borrador  ');
    await expect(add.getByLabel('Proponer al directorio', { exact: true })).toBeChecked();
    await expect(add.getByRole('status')).toContainText(/metadatos|ficha/iu);
    await expect(add.getByRole('status')).toContainText(/no se guard|no guard|no cambi/iu);
    await expect(page.locator('[data-owner-dialog] form[data-owner-form="enlace"]:visible')).toHaveCount(0,
      'reuse does not open saved options or park the Add draft inside that editor');
    assert.equal(records(capture, 'POST', LINKS_PATH).length, 2,
      'neither the complete read nor the similar saved URL causes another write');

    await add.getByLabel('URL', { exact: true }).fill(manualUrl);
    const beforeManualRead = ownerReads(capture).length;
    await add.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const manual = await waitForRecord(capture, 'POST', LINKS_PATH, 2, 201);
    assert.equal(manual.body.url, manualUrl, 'the next mutation is a new explicit manual choice');
    assert.equal(manual.body.title, '  Título privado del borrador  ');
    assert.equal(manual.body.description, '  Descripción privada del borrador  ');
    assert.equal(manual.responseBody.disposition, 'resource-created');
    const finalRead = await waitForOwnerRead(capture, beforeManualRead, 200);
    const final = finalRead.responseBody;
    const newResource = final.resources.find((resource) => resource.url === manualUrl);
    assert.ok(newResource, 'the later explicit URL is persisted by a fresh owner read');
    assert.equal(newResource.title, 'Título privado del borrador');
    assert.equal(newResource.description, 'Descripción privada del borrador');
    const savedOriginal = final.resources.find((resource) => resource.url === originalUrl);
    assert.equal(savedOriginal.title, 'Ficha guardada');
    assert.equal(savedOriginal.description, 'Descripción guardada');
    await expect(page).toHaveURL(activeUrl, 'no queued departure survives the retained Add outcome');
    await expect(page.locator('[data-owner-dialog][open]')).toHaveCount(0);
    assert.equal(records(capture, 'POST', LINKS_PATH).length, 3);
  } finally {
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('un recurso reutilizado crea su colocación sin consumir el borrador y permite guardar opciones aparte', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  const shared = {
    id: 'phase5-resource-reused-draft',
    title: 'Metadatos editoriales guardados',
    url: 'https://draft-reuse.example/shared-resource',
    description: 'Descripción editorial guardada',
    category: 'Contenido',
    kind: 'source',
    format: 'Artículo',
    topics: ['AWS'],
    published: true,
    hidden: false,
    approvalRevoked: false,
    directoryControl: 'editorial',
    version: 4,
  };
  await seedResource(fixture.creatorStore, shared);
  await openView(page, fixture, 'enlaces');
  const capture = await captureCreatorApi(page);
  try {
    await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const add = addForm(page);
    await add.getByLabel('Título', { exact: true }).fill('Título local que no se guardará');
    await add.getByLabel('URL', { exact: true }).fill(shared.url);
    await add.getByLabel(/Descripción/u).fill('Descripción local que no se guardará');
    const firstReadCount = ownerReads(capture).length;
    await add.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const reused = await waitForRecord(capture, 'POST', LINKS_PATH, 0, 201);
    assert.equal(reused.body.url, shared.url);
    assert.equal(reused.body.title, 'Título local que no se guardará');
    assert.equal(reused.body.description, 'Descripción local que no se guardará');
    assert.equal(reused.responseBody.disposition, 'resource-reused',
      'the actual Add service attaches a new placement to the pre-existing shared resource');
    assert.equal(reused.responseBody.resourceId, shared.id);
    const saved = await waitForOwnerRead(capture, firstReadCount, 200);
    const savedResource = saved.responseBody.resources.find((resource) => resource.id === shared.id);
    assert.equal(savedResource.title, shared.title);
    assert.equal(savedResource.description, shared.description,
      'the Add metadata does not replace shared saved metadata');
    const placementId = reused.responseBody.placementId;
    assert.ok(saved.responseBody.placements[placementId],
      'the real owner GET installs the newly attached placement');
    await expect(add).toBeVisible();
    await expect(add.getByLabel('Título', { exact: true })).toHaveValue('Título local que no se guardará');
    await expect(add.getByLabel('URL', { exact: true })).toHaveValue(shared.url);
    await expect(add.getByLabel(/Descripción/u)).toHaveValue('Descripción local que no se guardará');
    await expect(add.getByRole('status')).toContainText(/metadatos|ficha/iu);
    await expect(add.getByRole('status')).toContainText(/no se guard|no guard|no cambi/iu);
    await expect(page.locator('[data-owner-dialog] form[data-owner-form="enlace"]:visible')).toHaveCount(0,
      'resource reuse does not move the Add text into a saved-resource editor');
    assert.equal(records(capture, 'POST', LINKS_PATH).length, 1);

    await add.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const prompt = page.locator('[data-owner-exit-prompt]');
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
    await expect(page.locator('[data-owner-dialog][open]')).toHaveCount(0);
    assert.equal(records(capture, 'POST', LINKS_PATH).length, 1,
      'ending the retained Add draft does not submit or retarget it');

    const row = page.locator('[data-link-row="' + placementId + '"]');
    await row.getByRole('button', { name: 'Editar opciones', exact: true }).click();
    const editor = page.locator('[data-owner-dialog][open] form[data-owner-form="enlace"]');
    const directoryChoice = editor.getByLabel('Proponer al directorio', { exact: true });
    const oldChoice = await directoryChoice.isChecked();
    await directoryChoice.setChecked(!oldChoice);
    await editor.getByRole('button', { name: /Guardar (opciones|cambios)/iu }).click();
    const optionsWrite = await waitForRecord(capture, 'PATCH', '/api/creador/enlaces/' + placementId, 0, 200);
    assert.equal(optionsWrite.body.selectedForDirectory, !oldChoice,
      'the next permitted write is the separate, explicit options edit');
    assert.equal(Object.hasOwn(optionsWrite.body, 'title'), false);
    assert.equal(Object.hasOwn(optionsWrite.body, 'description'), false);
    const optionRead = await waitForOwnerRead(capture, firstReadCount + 1, 200);
    assert.equal(optionRead.responseBody.placements[placementId].selectedForDirectory, !oldChoice);
    assert.equal(optionRead.responseBody.resources.find((resource) => resource.id === shared.id).title, shared.title);
    assert.equal(optionRead.responseBody.resources.find((resource) => resource.id === shared.id).description, shared.description);
    assert.equal(records(capture, 'POST', LINKS_PATH).length, 1,
      'saving shared options never resends the discarded Add metadata');
  } finally {
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('una reclamación confirmada por el servidor sigue incierta ante un historial parecido y sólo se reenvía por decisión manual', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  const candidate = {
    id: 'phase5-claim-uncertain-draft',
    title: 'Contenido para la solicitud incierta',
    url: 'https://claims.example.invalid/phase5-uncertain',
    kind: 'community',
    category: 'Comunidad',
    format: 'community',
    published: true,
  };
  await seedResource(fixture.creatorStore, candidate);
  await page.route('**/catalog-selection.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: candidate.id, title: candidate.title, url: candidate.url, tipo: 'community' }]),
  }));
  await openView(page, fixture, 'solicitudes');
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let originalPost;
  const loseCommittedAck = async (route) => {
    if (route.request().method() !== 'POST' || pathOf(route.request()) !== CLAIMS_PATH || originalPost) {
      await route.continue();
      return;
    }
    const actual = await route.fetch();
    originalPost = { status: actual.status(), body: await actual.json() };
    await route.abort('failed');
  };
  await page.route('**/api/creador/**', loseCommittedAck);
  const evidenceText = 'Solicitud con posible reenvío duplicado';
  const form = page.locator('[data-owner-dialog] form[data-owner-form="reclamacion"]');
  const dialog = page.getByRole('dialog');
  try {
    await page.getByRole('button', { name: 'Solicitar edición', exact: true }).click();
    await expect(dialog).toBeVisible();
    const selected = form.getByRole('checkbox', { name: 'Solicitar edición de ' + candidate.title, exact: true });
    await selected.check();
    const evidence = form.getByLabel(/Contexto privado/iu);
    await evidence.fill(evidenceText);
    await form.getByRole('button', { name: /Enviar solicitud/iu }).click();
    await expect(form.getByRole('button', { name: 'Comprobar estado guardado', exact: true })).toBeVisible();

    assert.equal(originalPost.status, 202, 'the actual claim service committed before the browser acknowledgement was lost');
    assert.ok(originalPost.body.claimId ?? originalPost.body.claim?.id,
      'the real submission assigned an identity before acknowledgement delivery failed');
    await expect(selected).toBeDisabled();
    await expect(evidence).toHaveAttribute('readonly', '');
    await expect(evidence).toHaveValue(evidenceText);
    assert.equal(records(capture, 'POST', CLAIMS_PATH).length, 1);

    const beforeCheck = ownerReads(capture).length;
    await form.getByRole('button', { name: 'Comprobar estado guardado', exact: true }).click();
    const observed = await waitForOwnerRead(capture, beforeCheck, 200);
    const matching = observed.responseBody.claims.filter((claim) => claim.evidence === evidenceText);
    assert.equal(matching.length, 1,
      'the real full GET sees the similar claim but cannot identify it as this POST acknowledgement');
    assert.ok(matching[0].id ?? matching[0].claimId);
    await expect(form.getByRole('button', { name: 'Usar lo guardado', exact: true })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Volver al borrador', exact: true })).toBeVisible();
    await expect(dialog).toContainText(/duplic/iu,
      'the local uncertainty explanation warns that a new manual POST could duplicate the committed request');
    await expect(selected).toBeDisabled();
    await expect(evidence).toHaveAttribute('readonly', '');
    await expect(evidence).toHaveValue(evidenceText);
    assert.equal(records(capture, 'POST', CLAIMS_PATH).length, 1,
      'GET/history similarity does not trigger an automatic non-idempotent retry');

    await form.getByRole('button', { name: 'Volver al borrador', exact: true }).click();
    await expect(selected).toBeEnabled();
    await expect(selected).toBeChecked();
    await expect(evidence).toBeEnabled();
    await expect(evidence).toHaveValue(evidenceText);
    const beforeManualRead = ownerReads(capture).length;
    await form.getByRole('button', { name: /Enviar solicitud/iu }).click();
    const manual = await waitForRecord(capture, 'POST', CLAIMS_PATH, 1, 202);
    assert.equal(manual.body.evidence, evidenceText);
    assert.deepEqual(manual.body.resources, [{ resourceId: candidate.id, url: candidate.url }]);
    const finalRead = await waitForOwnerRead(capture, beforeManualRead, 200);
    const final = finalRead.responseBody;
    const duplicates = final.claims.filter((claim) => claim.evidence === evidenceText);
    assert.equal(duplicates.length, 2, 'the explicit second POST demonstrates why the warning must be local and clear');
    assert.equal(new Set(duplicates.map((claim) => claim.id ?? claim.claimId)).size, 2);
    assert.equal(Object.values(final.placements).some((placement) => placement.resourceId === candidate.id), false,
      'claim submission and recovery do not create a placement or authority');
    assert.equal(records(capture, 'POST', CLAIMS_PATH).length, 2,
      'the only second POST follows the explicit return-to-draft decision');
  } finally {
    await page.unroute('**/api/creador/**', loseCommittedAck).catch(() => {});
    await page.unroute('**/catalog-selection.json').catch(() => {});
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('un finalize confirmado con lectura fallida conserva la foto y permite recuperarla antes de la siguiente carga manual', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const originalAccount = [...fixture.accountStore.accounts.values()][0];
  const initial = await readOwner(fixture, cookie);
  const profileId = initial.profile.id;
  const images = await rasterPhotoFixtures();
  const provider = installPhotoProvider(page, fixture, images, { pauseSecondPng: true });
  await provider.install();
  const capture = await captureCreatorApi(page);
  let committedFinalize;
  let accountChanged = false;
  const failPostFinalizeRead = async (route) => {
    if (route.request().method() !== 'POST' || pathOf(route.request()) !== FINALIZE_PHOTO_PATH || committedFinalize) {
      await route.continue();
      return;
    }
    const actual = await route.fetch();
    const body = await actual.json();
    committedFinalize = { status: actual.status(), body, request: route.request().postDataJSON() };
    fixture.accountStore.seedAccount({ ...originalAccount, isAdmin: true });
    accountChanged = true;
    await route.fulfill({ response: actual, json: body });
  };
  await page.route('**/api/creador/foto/finalizar/**', failPostFinalizeRead);
  try {
    await openView(page, fixture, 'series');
    const readsBeforeFinalize = ownerReads(capture).length;
    await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
    let form = photoForm(page);
    const file = form.getByLabel('Elegir una foto');
    await file.setInputFiles({ name: 'phase5-a.jpg', mimeType: 'image/jpeg', buffer: images.jpeg });
    const originalFile = await file.evaluateHandle((input) => input.files[0]);
    await form.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();
    const failedRead = await waitForOwnerRead(capture, readsBeforeFinalize, 409);
    assert.equal(committedFinalize.status, 200, 'the actual photo service finalized A and the browser received that acknowledgement');
    const firstPhotoVersion = committedFinalize.body.photo.version;
    assert.equal(failedRead.responseBody.error, 'SESSION_CONTEXT_CHANGED',
      'only the full post-commit owner read fails after the account context changes');
    await expect(form.getByRole('status')).toContainText(/foto.*guardad/iu);
    assert.equal(provider.uploads.length, 1);
    assert.equal(provider.uploads[0].bytes.equals(images.jpeg), true);
    assert.equal(records(capture, 'POST', AUTHORIZE_PHOTO_PATH).length, 1);
    assert.equal(records(capture, 'POST', FINALIZE_PHOTO_PATH).length, 1);
    await expect(file).toBeDisabled();
    assert.equal(await file.evaluate((input, selected) => input.files[0] === selected, originalFile), true,
      'the exact native File remains frozen while the confirmed save awaits its full read');
    await expect(page.locator('[data-session-recovery-check]:visible').first()).toBeEnabled();
    assert.equal(await file.evaluate((input, selected) => input.files[0] === selected, originalFile), true,
      'session expiry cannot replace the frozen File');
    assert.equal(records(capture, 'POST', AUTHORIZE_PHOTO_PATH).length, 1);
    assert.equal(records(capture, 'POST', FINALIZE_PHOTO_PATH).length, 1);

    fixture.accountStore.seedAccount(originalAccount);
    const restored = await fixture.login();
    await addCookie(page.context(), fixture, restored);
    const readsBeforeSessionCheck = ownerReads(capture).length;
    const writesBeforeSessionCheck = capture.writes().length;
    await page.locator('[data-session-recovery-check]:visible').first().click();
    await expect(page.locator('[data-session-recovery-check]')).toHaveCount(0);
    await expect.poll(() => records(capture, 'GET', '/api/creador/sesion').length).toBeGreaterThan(0);
    assert.equal(ownerReads(capture).length, readsBeforeSessionCheck,
      'restoring the bound session checks only session state and does not install an owner snapshot');
    assert.equal(capture.writes().length, writesBeforeSessionCheck,
      'session restoration never authorizes, uploads, or finalizes again');
    assert.equal(await file.evaluate((input, selected) => input.files[0] === selected, originalFile), true);

    const beforeRetry = ownerReads(capture).length;
    await form.getByRole('button', { name: 'Reintentar actualización', exact: true }).click();
    const observed = await waitForOwnerRead(capture, beforeRetry, 200);
    assert.equal(observed.responseBody.profile.photo.version, firstPhotoVersion,
      'the explicit GET installs the actual photo confirmed by the finalize acknowledgement');
    assert.equal(records(capture, 'POST', AUTHORIZE_PHOTO_PATH).length, 1);
    assert.equal(records(capture, 'POST', FINALIZE_PHOTO_PATH).length, 1);
    assert.equal(provider.uploads.length, 1);

    const firstStored = await fixture.photos.readPhoto({ profileId, version: firstPhotoVersion });
    assert.ok(Buffer.isBuffer(firstStored.body));
    assert.equal(firstStored.contentType, 'image/webp');
    if (!(await form.isVisible())) {
      await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
      form = photoForm(page);
    }
    const fileB = form.getByLabel('Elegir una foto');
    await fileB.setInputFiles({ name: 'phase5-b.png', mimeType: 'image/png', buffer: images.png });
    await expect.poll(() => provider.uploads.length).toBe(1);
    const beforeBRead = ownerReads(capture).length;
    await form.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();
    await provider.pngReached;
    assert.equal((await readOwner(fixture, restored)).profile.photo.version, firstPhotoVersion,
      'a newer manual upload cannot replace the active photo before its own finalize');
    assert.equal(records(capture, 'POST', AUTHORIZE_PHOTO_PATH).length, 2);
    assert.equal(records(capture, 'POST', FINALIZE_PHOTO_PATH).length, 1);
    provider.releasePng();
    const secondFinalize = await waitForRecord(capture, 'POST', FINALIZE_PHOTO_PATH, 1, 200);
    const finalRead = await waitForOwnerRead(capture, beforeBRead, 200);
    assert.equal(finalRead.responseBody.profile.photo.version, secondFinalize.responseBody.photo.version);
    const final = finalRead.responseBody;
    assert.notEqual(final.profile.photo.version, firstPhotoVersion,
      'the next explicit upload becomes current without rewriting the earlier photo');
    const stillReadable = await fixture.photos.readPhoto({ profileId, version: firstPhotoVersion });
    assert.deepEqual(stillReadable.body, firstStored.body, 'the first immutable photo bytes survive the later current photo');
    const historicalHttp = await page.request.get(fixture.origin + '/media/fotos/'
      + encodeURIComponent(profileId) + '/' + encodeURIComponent(String(firstPhotoVersion)) + '.webp');
    assert.equal(historicalHttp.status(), 200);
    assert.deepEqual(await historicalHttp.body(), firstStored.body);
    assert.match(historicalHttp.headers()['cache-control'] ?? '', /immutable/iu);
    assert.deepEqual(provider.uploads.map((upload) => upload.bytes), [images.jpeg, images.png]);
    assert.equal(records(capture, 'POST', AUTHORIZE_PHOTO_PATH).length, 2);
    assert.equal(records(capture, 'POST', FINALIZE_PHOTO_PATH).length, 2);
  } finally {
    if (accountChanged) fixture.accountStore.seedAccount(originalAccount);
    await provider.remove();
    await page.unroute('**/api/creador/foto/finalizar/**', failPostFinalizeRead).catch(() => {});
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('un fallo del proveedor antes del finalize retiene el archivo y la foto activa hasta una nueva carga manual', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await readOwner(fixture, cookie);
  const profileId = initial.profile.id;
  const images = await rasterPhotoFixtures();
  const provider = installPhotoProvider(page, fixture, images, { failPngOnce: true });
  await provider.install();
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let form;
  try {
    await openView(page, fixture, 'series');
    await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
    form = photoForm(page);
    let file = form.getByLabel('Elegir una foto');

    await file.setInputFiles({ name: 'phase5-old.jpg', mimeType: 'image/jpeg', buffer: images.jpeg });
    const firstReadCount = ownerReads(capture).length;
    await form.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();
    const oldRead = await waitForOwnerRead(capture, firstReadCount, 200);
    const oldOwner = oldRead.responseBody;
    assert.equal(records(capture, 'POST', AUTHORIZE_PHOTO_PATH).length, 1);
    assert.equal(records(capture, 'POST', FINALIZE_PHOTO_PATH).length, 1);
    const oldUploadId = oldOwner.profile.photo.version;
    const oldBytes = await fixture.photos.readPhoto({ profileId, version: oldUploadId });

    if (!(await form.isVisible())) {
      await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
      form = photoForm(page);
      file = form.getByLabel('Elegir una foto');
    }
    const png = file;
    await png.setInputFiles({ name: 'phase5-new.png', mimeType: 'image/png', buffer: images.png });
    const retainedFile = await png.evaluateHandle((input) => input.files[0]);
    await form.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();
    await expect(form.getByRole('button', { name: 'Subir y guardar foto', exact: true })).toBeEnabled();
    await expect.poll(() => provider.uploads.length).toBe(2);
    assert.equal(provider.uploads[1].bytes.equals(images.png), true);
    const afterFailure = await readOwner(fixture, cookie);
    assert.equal(afterFailure.profile.photo.version, oldUploadId,
      'the old photo remains active because provider bytes never reached the pre-finalize boundary');
    assert.equal(records(capture, 'POST', AUTHORIZE_PHOTO_PATH).length, 2,
      'the failed manual upload had one real authorization');
    assert.equal(records(capture, 'POST', FINALIZE_PHOTO_PATH).length, 1,
      'a provider failure before finalize sends no finalize request');
    assert.equal(await png.evaluate((input, selected) => input.files[0] === selected, retainedFile), true,
      'the exact File remains available after the pre-finalize failure');

    const beforeRetryRead = ownerReads(capture).length;
    await form.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();
    await expect.poll(() => provider.uploads.length).toBe(3);
    assert.equal(provider.uploads[2].bytes.equals(images.png), true);
    await expect.poll(() => records(capture, 'POST', AUTHORIZE_PHOTO_PATH).length).toBe(3);
    await expect.poll(() => records(capture, 'POST', FINALIZE_PHOTO_PATH).length).toBe(2);
    const finalRead = await waitForOwnerRead(capture, beforeRetryRead, 200);
    const finalOwner = finalRead.responseBody;
    assert.notEqual(finalOwner.profile.photo.version, oldUploadId);
    assert.equal((await fixture.photos.readPhoto({ profileId, version: oldUploadId })).body.equals(oldBytes.body), true,
      'successful replacement keeps the earlier immutable photo readable');
    const historicalHttp = await page.request.get(fixture.origin + '/media/fotos/'
      + encodeURIComponent(profileId) + '/' + encodeURIComponent(String(oldUploadId)) + '.webp');
    assert.equal(historicalHttp.status(), 200);
    assert.deepEqual(await historicalHttp.body(), oldBytes.body);
    assert.equal(records(capture, 'POST', AUTHORIZE_PHOTO_PATH).length, 3,
      'only the original upload, failed explicit upload, and manual retry were authorized');
    assert.equal(records(capture, 'POST', FINALIZE_PHOTO_PATH).length, 2,
      'only uploads whose provider transfer succeeded were finalized');
  } finally {
    await provider.remove();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('un TypeError después del CAS deja la foto incierta, conserva el candidato y comprueba lo guardado sin repetir la carga', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await readOwner(fixture, cookie);
  const profileId = initial.profile.id;
  const images = await rasterPhotoFixtures();
  const provider = installPhotoProvider(page, fixture, images);
  await provider.install();
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const originalTransact = fixture.creatorStore.transact.bind(fixture.creatorStore);
  const originalGet = fixture.creatorStore.get.bind(fixture.creatorStore);
  let committed = false;
  let uploadKey;
  let failConfirmation = true;
  fixture.creatorStore.transact = async (input) => {
    const result = await originalTransact(input);
    const completed = input.puts?.find(({ value }) => value?.state === 'complete');
    if (result === true && completed && !committed) {
      committed = true;
      uploadKey = completed.key;
      throw new TypeError('post-CAS acknowledgement failed');
    }
    return result;
  };
  fixture.creatorStore.get = async (key) => {
    if (key === uploadKey && committed && failConfirmation) {
      failConfirmation = false;
      throw new Error('confirmation read unavailable');
    }
    return originalGet(key);
  };

  try {
    await openView(page, fixture, 'series');
    await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
    const form = photoForm(page);
    const file = form.getByLabel('Elegir una foto');
    await file.setInputFiles({ name: 'phase5-post-cas.png', mimeType: 'image/png', buffer: images.png });
    const selectedFile = await file.evaluateHandle((input) => input.files[0]);
    await form.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();

    const authorization = await waitForRecord(capture, 'POST', AUTHORIZE_PHOTO_PATH, 0, 200);
    const uploadId = authorization.responseBody.uploadId;
    const uncertain = await waitForRecord(capture, 'POST', FINALIZE_PHOTO_PATH, 0, 503);
    assert.equal(uncertain.responseBody, undefined, 'the browser receives the unavailable result without trusting a body as a receipt');
    assert.equal(committed, true, 'the real service crossed the profile/upload CAS before the injected fault');
    assert.equal(uploadKey, `photo-upload:${uploadId}`);
    assert.equal(records(capture, 'POST', AUTHORIZE_PHOTO_PATH).length, 1);
    assert.equal(records(capture, 'POST', FINALIZE_PHOTO_PATH).length, 1);
    await expect(form.getByRole('button', { name: 'Comprobar estado guardado', exact: true })).toBeVisible();
    await expect(file).toBeDisabled();
    assert.equal(await file.evaluate((input, candidate) => input.files[0] === candidate, selectedFile), true,
      'the exact native File remains selected while the finalize result is uncertain');

    const beforeCheck = ownerReads(capture).length;
    await form.getByRole('button', { name: 'Comprobar estado guardado', exact: true }).click();
    const observed = await waitForOwnerRead(capture, beforeCheck, 200);
    assert.equal(observed.responseBody.profile.photo.version, uploadId,
      'the explicit read-only recovery observes the committed photo');
    assert.equal(records(capture, 'POST', AUTHORIZE_PHOTO_PATH).length, 1);
    assert.equal(records(capture, 'POST', FINALIZE_PHOTO_PATH).length, 1,
      'checking saved state never replays finalize');
    await expect(form.getByRole('button', { name: 'Usar lo guardado', exact: true })).toBeVisible();
    assert.equal(await file.evaluate((input, candidate) => input.files[0] === candidate, selectedFile), true,
      'the candidate remains available until the owner explicitly resolves the uncertainty');

    const media = await page.request.get(`${fixture.origin}/media/fotos/${encodeURIComponent(profileId)}/${encodeURIComponent(String(uploadId))}.webp`);
    assert.equal(media.status(), 200);
    assert.ok((await media.body()).length > 0, 'the recovered immutable media is readable through the application route');
    assert.match(media.headers()['cache-control'] ?? '', /immutable/iu);

    await form.getByRole('button', { name: 'Usar lo guardado', exact: true }).click();
    await expect(page.locator('[data-owner-dialog][open]')).toHaveCount(0);
    assert.equal(records(capture, 'POST', AUTHORIZE_PHOTO_PATH).length, 1);
    assert.equal(records(capture, 'POST', FINALIZE_PHOTO_PATH).length, 1,
      'adopting the recovered photo closes the candidate without a write replay');
  } finally {
    await provider.remove();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('los campos de texto llegan crudos al servicio, las ausencias se conservan y los vacíos se envían como intención de borrar', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page, {
    profileFields: { city: 'Córdoba', bio: 'Presentación que no se edita', socials: { website: 'https://saved.example/about' } },
  });
  await openView(page, fixture, 'enlaces');
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const url = 'https://raw-intent.example/original';
  let resourceId;
  let placementId;
  try {
    await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const add = addForm(page);
    await add.getByLabel('Título', { exact: true }).fill('  Título inicial  ');
    await add.getByLabel('URL', { exact: true }).fill(url);
    await add.getByLabel(/Descripción/u).fill('  Descripción conservada  ');
    await add.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const created = await waitForRecord(capture, 'POST', LINKS_PATH, 0, 201);
    assert.equal(created.body.title, '  Título inicial  ', 'the browser submits raw intended title text');
    assert.equal(created.body.description, '  Descripción conservada  ', 'the browser submits raw intended description text');
    resourceId = created.responseBody.resourceId;
    placementId = created.responseBody.placementId;
    const createdRead = await waitForOwnerRead(capture, 0, 200);
    let saved = createdRead.responseBody;
    const savedResource = saved.resources.find((resource) => resource.id === resourceId);
    assert.equal(savedResource.title, 'Título inicial', 'the real service owns text normalization');
    assert.equal(savedResource.description, 'Descripción conservada');

    const row = page.locator('[data-link-row="' + placementId + '"]');
    await row.getByRole('button', { name: 'Editar ficha', exact: true }).click();
    let editor = page.locator('[data-owner-dialog][open] form[data-owner-form="enlace"]');
    await editor.getByLabel('Título', { exact: true }).fill('  Título actualizado  ');
    let readCount = ownerReads(capture).length;
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    const firstEdit = await waitForRecord(capture, 'PATCH', '/api/creador/enlaces/' + placementId + '/editar', 0, 200);
    assert.equal(firstEdit.body.title, '  Título actualizado  ');
    assert.equal(Object.hasOwn(firstEdit.body, 'description'), false,
      'an untouched optional description is absent from the browser request');
    saved = (await waitForOwnerRead(capture, readCount, 200)).responseBody;
    assert.equal(saved.resources.find((resource) => resource.id === resourceId).title, 'Título actualizado');
    assert.equal(saved.resources.find((resource) => resource.id === resourceId).description, 'Descripción conservada');

    await row.getByRole('button', { name: 'Editar ficha', exact: true }).click();
    editor = page.locator('[data-owner-dialog][open] form[data-owner-form="enlace"]');
    await editor.getByLabel(/Descripción/u).fill('');
    readCount = ownerReads(capture).length;
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    const clearEdit = await waitForRecord(capture, 'PATCH', '/api/creador/enlaces/' + placementId + '/editar', 1, 200);
    assert.equal(Object.hasOwn(clearEdit.body, 'description'), true);
    assert.equal(clearEdit.body.description, '', 'an explicit clear remains present as a raw empty string');
    saved = (await waitForOwnerRead(capture, readCount, 200)).responseBody;
    assert.equal(saved.resources.find((resource) => resource.id === resourceId).description ?? '', '');

    await row.getByRole('button', { name: 'Editar ficha', exact: true }).click();
    editor = page.locator('[data-owner-dialog][open] form[data-owner-form="enlace"]');
    await editor.getByLabel('Título', { exact: true }).fill('  Título actualizado  ');
    await expect(editor.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeEnabled();
    readCount = ownerReads(capture).length;
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    const normalizedNoOp = await waitForRecord(capture, 'PATCH', '/api/creador/enlaces/' + placementId + '/editar', 2, 200);
    assert.equal(normalizedNoOp.body.title, '  Título actualizado  ',
      'a raw changed form value reaches the service even when its canonical value is unchanged');
    assert.equal(normalizedNoOp.responseBody.disposition, 'unchanged',
      'the server, not a client-normalized delta, decides that the command is a no-op');
    saved = (await waitForOwnerRead(capture, readCount, 200)).responseBody;
    assert.equal(saved.resources.find((resource) => resource.id === resourceId).title, 'Título actualizado');

    await page.goto(fixture.origin + '/cuenta/?vista=perfil');
    await expect(page.locator('astro-island[component-url*="CreatorOwnerApp"]')).not.toHaveAttribute('ssr', '');
    await page.getByRole('button', { name: 'Editar redes', exact: true }).click();
    const socials = page.locator('[data-owner-dialog][open] form[data-owner-form="redes"]');
    const website = socials.getByLabel('Sitio web o newsletter', { exact: true });
    await website.fill('');
    readCount = ownerReads(capture).length;
    await socials.getByRole('button', { name: 'Guardar redes', exact: true }).click();
    const clearSocial = await waitForRecord(capture, 'PUT', OWNER_PATH, 0, 200);
    assert.equal(Object.hasOwn(clearSocial.body, 'socials'), true);
    assert.equal(clearSocial.body.socials.website, '',
      'clearing a social is sent as a present blank value, while untouched fields remain absent');
    assert.equal(Object.hasOwn(clearSocial.body.socials, 'instagram'), false);
    const final = (await waitForOwnerRead(capture, readCount, 200)).responseBody;
    assert.equal(final.profile.socials.website ?? '', '',
      'the fresh service read shows the social has been removed');
    assert.equal(final.profile.bio, 'Presentación que no se edita',
      'an untouched optional profile field survives resource and social edits');
    assert.equal(final.profile.city, 'Córdoba');
    assert.equal(capture.writes().filter(({ method }) => method === 'PATCH').length, 3);
    assert.equal(records(capture, 'PUT', OWNER_PATH).length, 1);
  } finally {
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

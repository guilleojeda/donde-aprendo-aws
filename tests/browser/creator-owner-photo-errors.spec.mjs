import assert from 'node:assert/strict';
import {
  test, expect, captureCreatorApi, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';
import { rasterPhotoFixtures } from '../fixtures/creator-photos.mjs';

const AUTHORIZE_PATH = '/api/creador/foto/autorizar';
const FINALIZE_PATH = '/api/creador/foto/finalizar';

function photoForm(page) {
  return page.locator('[data-owner-dialog][open] form[data-owner-form="foto"]');
}

function records(capture, method, path) {
  return capture.records.filter((record) => record.method === method && record.path === path);
}

async function waitForRecord(capture, method, path, index, status) {
  await expect.poll(() => records(capture, method, path)[index]?.status).toBe(status);
  return records(capture, method, path)[index];
}

async function installPhotoProvider(page, fixture) {
  const uploads = [];
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
    assert.equal(request.method(), 'POST');
    const payload = request.postDataBuffer() ?? Buffer.alloc(0);
    const contentType = request.headers()['content-type'];
    assert.match(contentType ?? '', /^multipart\/form-data;\s*boundary=/iu,
      'the signed provider request uses a multipart form');
    const formData = await new Request(request.url(), {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: payload,
    }).formData();
    const key = formData.get('key');
    assert.equal(typeof key, 'string', 'the direct upload uses the exact key returned by real authorization');
    const file = formData.get('file');
    assert.ok(file && typeof file.arrayBuffer === 'function', 'the signed provider request contains a file part');
    const bytes = Buffer.from(await file.arrayBuffer());
    fixture.photoObjects.seed(key, bytes);
    uploads.push({ key, bytes: Buffer.from(bytes) });
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

async function seedCurrentPhoto(fixture, cookie, bytes) {
  const before = await fixture.rawOwner(cookie);
  const upload = await fixture.photos.beginUpload({
    profileId: before.owner.profileId,
    expectedVersion: before.profile.version,
  });
  fixture.photoObjects.seed(upload.post.fields.key, bytes);
  await fixture.photos.finalizeUpload({
    profileId: before.owner.profileId,
    uploadId: upload.uploadId,
    expectedVersion: before.profile.version,
  });
  return fixture.rawOwner(cookie);
}

async function descriptionEntries(page, field) {
  const ids = (await field.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean);
  return Promise.all(ids.map(async (id) => {
    const locator = page.locator(`#${id}`);
    return {
      id,
      locator,
      text: await locator.innerText(),
      fieldError: await locator.getAttribute('data-owner-field-error') !== null,
    };
  }));
}

async function expectPhotoFieldError(page, field, messagePattern, helpPattern = /JPEG|PNG|WebP|15 MiB|megapíxeles/iu) {
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const descriptions = await descriptionEntries(page, field);
  assert.ok(descriptions.length > 0, 'the invalid file control keeps an accessible description');
  const error = descriptions.find(({ fieldError, text }) => fieldError && messagePattern.test(text));
  assert.ok(error, `the associated field-error target contains a specific message (got: ${descriptions.map(({ text }) => text).join(' | ')})`);
  const help = descriptions.find(({ fieldError, text }) => !fieldError && helpPattern.test(text));
  assert.ok(help, 'the photo format and limit help remains associated with the file control');
  await expect(help.locator).toBeVisible();
  await expect(error.locator).toBeVisible();
  const owner = await field.evaluate((element) => element.closest('form')?.getAttribute('data-owner-form'));
  const errorOwner = await error.locator.evaluate((element) => element.closest('form')?.getAttribute('data-owner-form'));
  assert.equal(errorOwner, owner, 'the file error remains inside its owning form');
  await expect(field).toBeFocused();
  return error.locator;
}

async function expectPhotoFieldErrorCleared(page, field, oldError) {
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await expect(oldError).toBeHidden();
  const descriptions = await descriptionEntries(page, field);
  const help = descriptions.find(({ fieldError, text }) => !fieldError && /JPEG|PNG|WebP|15 MiB|megapíxeles/iu.test(text));
  assert.ok(help, 'the photo help remains associated after the correction');
  await expect(help.locator).toBeVisible();
}

test('la validación de foto atribuye el archivo, conserva la ayuda y limpia el error al elegir una imagen válida', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
  const form = photoForm(page);
  const file = form.getByLabel('Elegir una foto');
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const invalid = Buffer.from('not a supported image');
  const images = await rasterPhotoFixtures();

  try {
    await file.setInputFiles({ name: 'foto.pdf', mimeType: 'application/pdf', buffer: invalid });
    await form.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();
    await expect.poll(() => capture.writes().length).toBe(0);
    const error = await expectPhotoFieldError(page, file, /JPEG|PNG|WebP|imagen|formato/iu);
    await expect(form).toBeVisible();

    await file.setInputFiles({ name: 'foto-correcta.png', mimeType: 'image/png', buffer: images.png });
    await expectPhotoFieldErrorCleared(page, file, error);
    await expect.poll(() => capture.writes().length).toBe(0);
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Guardar y salir deja el editor usable tras un rechazo real del archivo y permite una nueva foto sin repetir etapas', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const images = await rasterPhotoFixtures();
  const original = await seedCurrentPhoto(fixture, cookie, images.jpeg);
  const provider = await installPhotoProvider(page, fixture);
  const capture = await captureCreatorApi(page);
  let back;

  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=enlaces&buscar=phase2-photo`);
    await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
    await page.locator('#owner-link-order').selectOption('titulo-desc');
    await expect(page).toHaveURL((url) => url.searchParams.get('orden') === 'titulo-desc');
    const activeUrl = page.url();
    await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
    const form = photoForm(page);
    const file = form.getByLabel('Elegir una foto');
    const invalid = Buffer.from('<!doctype html><html><body>not a photo</body></html>');
    await file.setInputFiles({ name: 'foto-dañada.png', mimeType: 'image/png', buffer: invalid });
    const selectedFile = await file.evaluateHandle((input) => input.files[0]);
    const preview = form.locator('[data-owner-photo-preview]');
    await expect(preview).toBeVisible();
    const originalPreview = await preview.getAttribute('src');
    assert.match(originalPreview ?? '', new RegExp(String(original.profile.photo.version), 'u'));

    back = page.goBack();
    back.catch(() => {});
    const prompt = page.locator('[data-owner-exit-prompt]');
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Guardar y salir', exact: true }).click();

    const authorization = await waitForRecord(capture, 'POST', AUTHORIZE_PATH, 0, 200);
    const finalized = await waitForRecord(capture, 'POST', FINALIZE_PATH, 0, 422);
    assert.equal(finalized.responseBody.error, 'UNSUPPORTED_PHOTO_FORMAT',
      'the UI receives the real file-attribution code from finalization');
    assert.equal(authorization.responseBody.operation, 'authorize-photo');
    assert.equal(provider.uploads.length, 1, 'the invalid file crossed the real signed-upload boundary once');
    assert.equal(provider.uploads[0].bytes.equals(invalid), true, 'the provider received the selected invalid file bytes');
    assert.equal(capture.writes().filter(({ path }) => path === AUTHORIZE_PATH).length, 1);
    assert.equal(capture.writes().filter(({ path }) => path === FINALIZE_PATH).length, 1);

    await back;
    await expect(page).toHaveURL(activeUrl);
    await expect(prompt).toBeHidden();
    await expect(form).toBeVisible();
    await expect(file).toBeEnabled();
    assert.equal(await file.evaluate((input, selected) => input.files[0] === selected, selectedFile), true,
      'the exact File remains available after the definitive file rejection');
    const photoError = await expectPhotoFieldError(page, file, /formato|JPEG|PNG|WebP|imagen/iu);
    await expect(preview).toHaveAttribute('src', originalPreview);
    const unchanged = await fixture.rawOwner(cookie);
    assert.equal(unchanged.profile.version, original.profile.version, 'the rejected file does not advance the profile');
    assert.deepEqual(unchanged.profile.photo, original.profile.photo, 'the previous selected photo remains current');
    const currentPhoto = await page.request.get(`${fixture.origin}${original.profile.photo.url}`);
    assert.equal(currentPhoto.status(), 200, 'the previous selected photo remains readable through the media route');

    await file.setInputFiles({ name: 'foto-correcta.png', mimeType: 'image/png', buffer: images.png });
    await expectPhotoFieldErrorCleared(page, file, photoError);
    await form.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();
    const retryAuthorization = await waitForRecord(capture, 'POST', AUTHORIZE_PATH, 1, 200);
    const retryFinalization = await waitForRecord(capture, 'POST', FINALIZE_PATH, 1, 200);
    assert.equal(retryAuthorization.responseBody.operation, 'authorize-photo');
    assert.equal(retryFinalization.responseBody.operation, 'finalize-photo');
    assert.equal(provider.uploads.length, 2, 'the corrected file is uploaded only after the explicit new submit');
    assert.equal(provider.uploads[1].bytes.equals(images.png), true, 'the provider received the corrected file bytes');
    assert.equal(capture.writes().filter(({ path }) => path === AUTHORIZE_PATH).length, 2);
    assert.equal(capture.writes().filter(({ path }) => path === FINALIZE_PATH).length, 2);
    const saved = await fixture.rawOwner(cookie);
    assert.ok(saved.profile.version > original.profile.version);
    assert.notEqual(saved.profile.photo.version, original.profile.photo.version);
    const savedPhoto = await page.request.get(`${fixture.origin}${saved.profile.photo.url}`);
    assert.equal(savedPhoto.status(), 200, 'the corrected photo is the persisted current photo');
  } finally {
    back?.catch(() => {});
    await provider.remove();
    await capture.stop({ skipErrorBodies: true });
  }
});

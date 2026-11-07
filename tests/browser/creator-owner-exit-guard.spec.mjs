import assert from 'node:assert/strict';
import { test, expect, loggedInOwner, captureCreatorApi } from '../fixtures/creator-browser-test.mjs';
import { rasterPhotoFixtures } from '../fixtures/creator-photos.mjs';

const prompt = (page) => page.locator('[data-owner-exit-prompt]');
const exitButton = (page, name) => prompt(page).getByRole('button', { name, exact: true });
const hydrated = async (page) => expect(page.locator('astro-island[component-url*="CreatorOwnerApp"]')).not.toHaveAttribute('ssr', '');

test('valid initial profile saves once before following the requested view', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  await hydrated(page);
  const capture = await captureCreatorApi(page);
  try {
    const form = page.locator('[data-owner-form="crear"]');
    await form.getByLabel('Nombre visible').fill('First guarded profile');
    await form.getByLabel('Dirección de tu página').fill('first-guarded-profile');
    await page.getByRole('navigation', { name: 'Secciones de Tu página' })
      .getByRole('link', { name: 'Solicitudes' }).click();
    await expect(prompt(page)).toBeVisible();
    assert.equal(capture.writes().length, 0, 'proposing a destination does not submit the hidden initial form');
    await exitButton(page, 'Guardar y salir').click();
    await expect(page).toHaveURL((url) => url.searchParams.get('vista') === 'solicitudes');
    await capture.settle();
    assert.deepEqual(capture.writes().map(({ method, path, status }) => [method, path, status]), [
      ['PUT', '/api/creador/perfil', 200],
    ]);
    const saved = await fixture.rawOwner(cookie);
    assert.equal(saved.profile.slug, 'first-guarded-profile');
    assert.equal(saved.profile.version, 1);
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('valid photo exit submits through native form validation before following Back', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const images = await rasterPhotoFixtures();
  const initial = await fixture.rawOwner(cookie);
  let uploads = 0;
  const upload = async (route) => {
    const request = route.request();
    const headers = { 'access-control-allow-origin': fixture.origin };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '' } });
      return;
    }
    const bytes = request.postDataBuffer();
    assert(bytes?.includes(images.png));
    const key = bytes.toString('latin1').match(/name="key"\r\n\r\n([^\r\n]+)/iu)?.[1];
    assert(key);
    fixture.photoObjects.seed(key, images.png);
    uploads += 1;
    await route.fulfill({ status: 204, headers });
  };
  await page.route('https://creator-photos.example.invalid/**', upload);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await hydrated(page);
  const destination = page.url();
  await page.locator('#owner-link-order').selectOption('titulo-desc');
  await expect(page).toHaveURL((url) => url.searchParams.get('orden') === 'titulo-desc');
  const capture = await captureCreatorApi(page);
  try {
    await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
    await page.locator('[data-owner-form="foto"]').getByLabel('Elegir una foto').setInputFiles({
      name: 'guarded-photo.png', mimeType: 'image/png', buffer: images.png,
    });
    const back = page.goBack();
    await expect(prompt(page)).toBeVisible();
    assert.equal(capture.writes().length, 0, 'a guarded Back does not upload before the explicit save choice');
    await exitButton(page, 'Guardar y salir').click();
    await back;
    await expect(page).toHaveURL(destination);
    await capture.settle();
    assert.equal(uploads, 1);
    assert.equal(capture.writes().length, 2, 'one authorization and one finalization');
    assert.equal(capture.writes().find(({ path }) => path === '/api/creador/foto/finalizar')?.status, 200);
    const saved = await fixture.rawOwner(cookie);
    assert(saved.profile.photo?.version);
    assert.equal(saved.profile.version, initial.profile.version + 1);
  } finally {
    await capture.stop({ skipErrorBodies: true });
    await page.unroute('https://creator-photos.example.invalid/**', upload);
  }
});

test('a photo confirmed during guarded Back waits for an explicit exit choice', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const images = await rasterPhotoFixtures();
  const initial = await fixture.rawOwner(cookie);
  let uploads = 0;
  const upload = async (route) => {
    const request = route.request();
    const headers = { 'access-control-allow-origin': fixture.origin };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '' } });
      return;
    }
    const bytes = request.postDataBuffer();
    assert(bytes?.includes(images.png));
    const key = bytes.toString('latin1').match(/name="key"\r\n\r\n([^\r\n]+)/iu)?.[1];
    assert(key);
    fixture.photoObjects.seed(key, images.png);
    uploads += 1;
    await route.fulfill({ status: 204, headers });
  };
  await page.route('https://creator-photos.example.invalid/**', upload);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await hydrated(page);
  const destination = page.url();
  await page.locator('#owner-link-order').selectOption('titulo-desc');
  await expect(page).toHaveURL((url) => url.searchParams.get('orden') === 'titulo-desc');
  const activeEntry = page.url();
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const finalize = async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    await route.abort('failed');
  };
  let releaseRead;
  const readGate = new Promise((resolve) => { releaseRead = resolve; });
  let resolveObservedRead;
  const observedRead = new Promise((resolve) => { resolveObservedRead = resolve; });
  const holdRead = async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    const body = await response.json();
    assert(body.profile.photo?.version);
    resolveObservedRead(body);
    await readGate;
    await route.fulfill({ response, json: body });
  };
  await page.route('**/api/creador/foto/finalizar/', finalize);
  await page.route('**/api/creador/perfil/', holdRead);
  try {
    await page.getByRole('button', { name: 'Editar foto', exact: true }).click();
    await page.locator('[data-owner-form="foto"]').getByLabel('Elegir una foto').setInputFiles({
      name: 'confirmed-during-back.png', mimeType: 'image/png', buffer: images.png,
    });
    await page.getByRole('button', { name: 'Subir y guardar foto', exact: true }).click();
    await expect(page.locator('[data-owner-check-photo]')).toBeEnabled();
    const saved = await fixture.rawOwner(cookie);
    assert.equal(saved.profile.version, initial.profile.version + 1);
    assert(saved.profile.photo?.version);

    const check = page.locator('[data-owner-check-photo]').click();
    const heldBody = await observedRead;
    assert.equal(heldBody.profile.photo.version, saved.profile.photo.version);
    const back = page.goBack();
    await expect(prompt(page)).toBeVisible();
    await expect(page).toHaveURL(activeEntry);
    releaseRead();
    await check;
    await expect(prompt(page)).toBeVisible();
    await expect(page).toHaveURL(activeEntry, 'confirming the saved photo does not approve the held Back');
    await expect(exitButton(page, 'Seguir a la página solicitada')).toBeVisible();
    await expect(exitButton(page, 'Seguir a la página solicitada')).toBeFocused();
    await expect(exitButton(page, 'Seguir a la página solicitada')).toBeEnabled();
    assert.equal(uploads, 1);
    assert.equal(capture.writes().filter(({ path }) => path === '/api/creador/foto/finalizar').length, 1);
    assert.equal(capture.writes().length, 2, 'the comparison does not replay authorization or finalization');
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, saved.profile);

    await exitButton(page, 'Seguir a la página solicitada').click();
    await back;
    await expect(page).toHaveURL(destination, 'only the explicit exit choice resumes the held Back');
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, saved.profile);
  } finally {
    releaseRead();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
    await page.unroute('**/api/creador/foto/finalizar/', finalize).catch(() => {});
    await page.unroute('**/api/creador/perfil/', holdRead).catch(() => {});
    await page.unroute('https://creator-photos.example.invalid/**', upload).catch(() => {});
  }
});

test('invalid profile fields retain native focus and do not authorize the proposed Back', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await hydrated(page);
  await page.locator('#owner-link-order').selectOption('titulo-desc');
  await expect(page).toHaveURL((url) => url.searchParams.get('orden') === 'titulo-desc');
  const activeEntry = page.url();
  const capture = await captureCreatorApi(page);
  try {
    await page.getByRole('button', { name: 'Editar datos' }).click();
    const form = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
    await form.getByLabel('Dirección de tu página').fill('Invalid Slug');
    const back = page.goBack();
    await expect(prompt(page)).toBeVisible();
    await expect(page).toHaveURL(activeEntry);
    await exitButton(page, 'Guardar y salir').click();
    await expect(form).toBeVisible();
    const slug = form.getByLabel('Dirección de tu página');
    await expect(slug).toBeVisible();
    await expect(slug).toBeFocused();
    assert.equal(await slug.evaluate((input) => input.validity.patternMismatch), true);
    assert.equal(capture.writes().length, 0, 'native invalidity blocks the exact form submission and queued Back');
    await expect(page).toHaveURL(activeEntry);
    await back;
    await expect(page).toHaveURL(activeEntry);
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

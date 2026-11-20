import assert from 'node:assert/strict';
import { CREATOR_FIELD_LIMITS } from '../../src/lib/creator-values.mjs';
import {
  test,
  expect,
  api,
  createProfile,
  captureCreatorApi,
  loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

const RESERVED_MESSAGE = 'Esa dirección ya está reservada. Elige otra.';

function createForm(page) {
  return page.locator('form[data-owner-form="crear"]');
}

function dataForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
}

function exitPrompt(page) {
  return page.locator('[data-owner-exit-prompt]');
}

async function openDataEditor(page) {
  await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
  const form = dataForm(page);
  await expect(form).toBeVisible();
  return form;
}

async function seedReservedProfile(fixture, slug) {
  const oidc = fixture.accountHarness.state.oidc;
  oidc.claims = { sub: 'reserved-owner', email: 'reserved-owner@example.invalid' };
  const otherCookie = await fixture.login();
  try {
    await createProfile(fixture, otherCookie, {
      displayName: 'Otra persona',
      slug,
    });
  } finally {
    delete oidc.claims;
  }
}

async function waitForOwnerWrite(capture, { status, since, method = 'PUT', path = '/api/creador/perfil' }) {
  assert.ok(Number.isInteger(since) && since >= 0, 'waitForOwnerWrite must start after a captured write boundary');
  const find = () => capture.writes().slice(since).find((record) => record.method === method
    && record.path === path && record.status === status);
  await expect.poll(find).toBeTruthy();
  return find();
}

async function fieldDescriptionText(page, field) {
  const value = await field.getAttribute('aria-describedby');
  const ids = (value ?? '').split(/\s+/u).filter(Boolean);
  const entries = [];
  for (const id of ids) {
    const locator = page.locator(`#${id}`);
    if (await locator.count()) entries.push({ id, locator, text: await locator.innerText() });
  }
  return entries;
}

async function expectFieldError(page, field, pattern, helpPattern) {
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const descriptions = await fieldDescriptionText(page, field);
  assert.ok(descriptions.length > 0, 'the invalid control keeps an accessible description');
  const error = descriptions.find(({ text }) => pattern.test(text)
    && (!helpPattern || !helpPattern.test(text)));
  assert.ok(error, `the accessible description includes a specific error (got: ${descriptions.map(({ text }) => text).join(' | ')})`);
  if (helpPattern) assert.ok(descriptions.some(({ text }) => helpPattern.test(text)),
    'the existing field help remains associated with the invalid control');
  await expect(error.locator).toBeVisible();
  const owner = await field.evaluate((element) => {
    const form = element.closest('form');
    return form ? [form.getAttribute('data-owner-form'), form.id] : null;
  });
  const errorOwner = await error.locator.evaluate((element) => {
    const form = element.closest('form');
    return form ? [form.getAttribute('data-owner-form'), form.id] : null;
  });
  assert.deepEqual(errorOwner, owner, 'the error is rendered inside the form that owns the control');
  return error.locator;
}

async function expectFieldErrorCleared(page, field, form, oldPattern, helpPattern = /3–40 caracteres/iu, oldError) {
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  const descriptions = await fieldDescriptionText(page, field);
  for (const description of descriptions) {
    if (oldPattern.test(description.text) && (!helpPattern || !helpPattern.test(description.text))) {
      await expect(description.locator).toBeHidden();
    }
  }
  if (oldError) await expect(oldError).toBeHidden();
  if (helpPattern) assert.ok(descriptions.some(({ text }) => helpPattern.test(text)),
    'the existing field help remains associated after correction');
  if (helpPattern) await expect(form.locator('small').filter({ hasText: helpPattern })).toBeVisible();
}

async function expectOnlyVisibleReservedError(page, form, { promptVisible = false } = {}) {
  const message = { exact: true };
  await expect(page.getByText(RESERVED_MESSAGE, message).filter({ visible: true }),
    'the reserved-address error is visible exactly once').toHaveCount(1);
  await expect(form.getByText(RESERVED_MESSAGE, message),
    'the reserved-address error belongs to the active form').toBeVisible();
  await expect(form).toBeVisible();
  if (promptVisible) await expect(exitPrompt(page)).toBeVisible();
  else await expect(exitPrompt(page)).toBeHidden();
}

async function expectUsableFormFocus(form) {
  await expect.poll(() => form.locator('input:focus, textarea:focus, select:focus, button:focus').count()).toBe(1);
  const focused = form.locator('input:focus, textarea:focus, select:focus, button:focus');
  await expect(focused).toBeVisible();
  await expect(focused).toBeEnabled();
}

async function installProfileRejections(page, fixture, modes) {
  let attempt = 0;
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() !== 'PUT' || pathname !== '/api/creador/perfil' || attempt >= modes.length) {
      await route.continue();
      return;
    }
    const mode = modes[attempt++];
    const body = request.postDataJSON();
    if (mode === 'group') body.programs = ['Programa no disponible'];
    else body.bio = 'x'.repeat(CREATOR_FIELD_LIMITS.bio + 1);
    const headers = new Headers(request.headers());
    headers.delete('content-length');
    const actual = await fixture.creatorRuntime.handle(new Request(request.url(), {
      method: request.method(),
      headers,
      body: JSON.stringify(body),
    }));
    assert.equal(actual.status, 422, 'the controlled browser response comes from the real service rejection');
    const payload = await actual.json();
    if (mode === 'unknown') payload.fieldErrors = [{ field: 'programas-internos', reason: 'unsupported' }];
    else delete payload.fieldErrors;
    const responseHeaders = Object.fromEntries(actual.headers.entries());
    delete responseHeaders['content-length'];
    await route.fulfill({
      status: actual.status,
      headers: responseHeaders,
      body: JSON.stringify(payload),
    });
  };
  await page.route('**/api/creador/perfil**', handler);
  return async () => page.unroute('**/api/creador/perfil**', handler).catch(() => {});
}

test('el alta inicial conserva el borrador y ubica una colisión real de dirección', async ({ fixture, page }) => {
  const reservedSlug = 'direccion-de-otra-persona';
  await seedReservedProfile(fixture, reservedSlug);
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const form = createForm(page);
  await expect(form).toBeVisible();
  const name = form.getByLabel('Nombre visible', { exact: true });
  const slug = form.getByLabel('Dirección de tu página', { exact: true });
  const capture = await captureCreatorApi(page);
  try {
    await name.fill('Borrador propio');
    await slug.fill(reservedSlug);
    const rejectedWriteStart = capture.writes().length;
    await form.getByRole('button', { name: 'Crear borrador', exact: true }).click();
    const rejected = await waitForOwnerWrite(capture, { status: 409, since: rejectedWriteStart });
    assert.equal(rejected.responseBody.error, 'SLUG_TAKEN', 'the browser saw the real reserved-alias rejection');

    await expect(form).toBeVisible();
    await expect(name).toHaveValue('Borrador propio');
    await expect(slug).toHaveValue(reservedSlug);
    await expect(slug).toBeFocused();
    const slugError = await expectFieldError(page, slug, /reservada|elige otra/iu, /3–40 caracteres/iu);
    await expect(form.locator('small').filter({ hasText: /3–40 caracteres/iu })).toBeVisible();
    await expectOnlyVisibleReservedError(page, form);
    assert.equal((await fixture.rawOwner(cookie)).profile, null, 'a rejected initial create does not persist a profile or slug');

    // A new navigation request after the rejected create gets its own inline
    // decision. The original form and its focused recovery field remain usable
    // while the person decides whether to keep editing.
    const activeUrl = page.url();
    await page.getByRole('navigation', { name: 'Secciones de Tu página' })
      .getByRole('link', { name: 'Enlaces', exact: true }).click();
    const freshPrompt = exitPrompt(page);
    await expect(freshPrompt).toBeVisible();
    await expect(form).toBeVisible();
    await expect(slug).toBeVisible();
    await slug.focus();
    await expect(slug).toBeFocused();
    await expectFieldError(page, slug, /reservada|elige otra/iu, /3–40 caracteres/iu);
    await freshPrompt.getByRole('button', { name: 'Seguir editando', exact: true }).click();
    await expect(freshPrompt).toBeHidden();
    await expect(form).toBeVisible();
    await expect(slug).toHaveValue(reservedSlug);
    await expectOnlyVisibleReservedError(page, form);
    await expectUsableFormFocus(form);

    // A normal Enter submission from the still-open, unrelated decision is a
    // fresh save. It closes that decision but does not follow its old target.
    await page.getByRole('navigation', { name: 'Secciones de Tu página' })
      .getByRole('link', { name: 'Enlaces', exact: true }).click();
    await expect(freshPrompt).toBeVisible();
    await slug.fill('direccion-propia');
    const correctedWriteStart = capture.writes().length;
    await expectFieldErrorCleared(page, slug, form, /reservada|elige otra/iu, /3–40 caracteres/iu, slugError);
    await slug.press('Enter');
    await waitForOwnerWrite(capture, { status: 200, since: correctedWriteStart });
    await expect(freshPrompt).toBeHidden();
    await expect(page).toHaveURL(activeUrl, 'a normal corrected save does not follow the stale exit target');
    const saved = await fixture.rawOwner(cookie);
    assert.equal(saved.profile.slug, 'direccion-propia');
    assert.equal(saved.profile.displayName, 'Borrador propio');
    assert.equal(saved.profile.published, false, 'initial create remains an unpublished draft');
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('el alta inicial también conserva el borrador cuando la colisión ocurre al Guardar y salir', async ({ fixture, page }) => {
  const reservedSlug = 'direccion-inicial-reservada';
  await seedReservedProfile(fixture, reservedSlug);
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const activeUrl = page.url();
  const form = createForm(page);
  await expect(form).toBeVisible();
  const name = form.getByLabel('Nombre visible', { exact: true });
  const slug = form.getByLabel('Dirección de tu página', { exact: true });
  const capture = await captureCreatorApi(page);
  try {
    await name.fill('Alta con salida guardada');
    await slug.fill(reservedSlug);
    await page.getByRole('navigation', { name: 'Secciones de Tu página' })
      .getByRole('link', { name: 'Enlaces', exact: true }).click();
    const prompt = exitPrompt(page);
    await expect(prompt).toBeVisible();
    const rejectedWriteStart = capture.writes().length;
    await prompt.getByRole('button', { name: 'Guardar y salir', exact: true }).click();
    const rejected = await waitForOwnerWrite(capture, { status: 409, since: rejectedWriteStart });
    assert.equal(rejected.responseBody.error, 'SLUG_TAKEN');

    await expect(form).toBeVisible();
    await expect(name).toHaveValue('Alta con salida guardada');
    await expect(slug).toHaveValue(reservedSlug);
    const slugError = await expectFieldError(page, slug, /reservada|elige otra/iu, /3–40 caracteres/iu);
    await expect(slug).toBeFocused();
    await expectOnlyVisibleReservedError(page, form);
    await expect(page).toHaveURL(activeUrl);
    assert.equal((await fixture.rawOwner(cookie)).profile, null, 'a failed exit save does not create the profile');

    await slug.fill('direccion-inicial-corregida');
    await expectFieldErrorCleared(page, slug, form, /reservada|elige otra/iu, /3–40 caracteres/iu, slugError);
    const correctedWriteStart = capture.writes().length;
    await form.getByRole('button', { name: 'Crear borrador', exact: true }).click();
    await waitForOwnerWrite(capture, { status: 200, since: correctedWriteStart });
    await expect(form).toBeHidden();
    await expect(page).toHaveURL(activeUrl, 'creating the corrected draft does not follow the rejected exit');
    const { profile } = await fixture.rawOwner(cookie);
    assert.equal(profile.slug, 'direccion-inicial-corregida');
    assert.equal(profile.displayName, 'Alta con salida guardada');
    assert.equal(profile.published, false);
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Editar datos conserva otros cambios y permite corregir una colisión de dirección en un guardado normal', async ({ fixture, page }) => {
  const reservedSlug = 'direccion-ya-reservada';
  await seedReservedProfile(fixture, reservedSlug);
  const cookie = await loggedInOwner(fixture, page, {
    profileFields: { city: 'Ciudad guardada', bio: 'Presentación guardada.' },
  });
  const before = await fixture.rawOwner(cookie);
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const form = await openDataEditor(page);
  const slug = form.getByLabel('Dirección de tu página', { exact: true });
  const city = form.getByLabel('Ciudad', { exact: false });
  const save = form.getByRole('button', { name: 'Guardar datos', exact: true });
  const capture = await captureCreatorApi(page);
  try {
    await slug.fill(reservedSlug);
    await city.fill('Ciudad del borrador');
    const rejectedWriteStart = capture.writes().length;
    await save.click();
    const rejected = await waitForOwnerWrite(capture, { status: 409, since: rejectedWriteStart });
    assert.equal(rejected.responseBody.error, 'SLUG_TAKEN');

    await expectOnlyVisibleReservedError(page, form);
    const slugError = await expectFieldError(page, slug, /reservada|elige otra/iu, /3–40 caracteres/iu);
    await expect(slug).toHaveValue(reservedSlug);
    await expect(city).toHaveValue('Ciudad del borrador');
    await expect(slug).toBeFocused();
    await expect(save).toBeVisible();
    await expect(save).toBeEnabled();
    const afterRejected = await fixture.rawOwner(cookie);
    assert.equal(afterRejected.profile.slug, before.profile.slug, 'the rejected slug never persists');
    assert.equal(afterRejected.profile.city, before.profile.city, 'the unrelated draft is not persisted by the rejected request');

    await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(exitPrompt(page)).toBeVisible();
    await expectOnlyVisibleReservedError(page, form, { promptVisible: true });
    await exitPrompt(page).getByRole('button', { name: 'Seguir editando', exact: true }).click();
    await expect(exitPrompt(page)).toBeHidden();
    await expect(form).toBeVisible();
    await expectOnlyVisibleReservedError(page, form);
    await expectUsableFormFocus(form);

    await slug.fill('direccion-corregida');
    await expectFieldErrorCleared(page, slug, form, /reservada|elige otra/iu, /3–40 caracteres/iu, slugError);
    const correctedWriteStart = capture.writes().length;
    await save.click();
    await waitForOwnerWrite(capture, { status: 200, since: correctedWriteStart });
    await expect(page.locator('[data-owner-dialog]')).toBeHidden();
    const saved = await fixture.rawOwner(cookie);
    assert.equal(saved.profile.slug, 'direccion-corregida');
    assert.equal(saved.profile.city, 'Ciudad del borrador');
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Guardar y salir cancela la salida tras una colisión y una decisión posterior puede salir tras guardar', async ({ fixture, page }) => {
  const reservedSlug = 'direccion-guardada-por-otra';
  await seedReservedProfile(fixture, reservedSlug);
  const cookie = await loggedInOwner(fixture, page, {
    profileFields: { city: 'Ciudad original', bio: 'Texto original.' },
  });
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces&buscar=identity-errors`);
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  const destination = page.url();
  await page.locator('#owner-link-order').selectOption('titulo-desc');
  await expect(page).toHaveURL((url) => url.searchParams.get('orden') === 'titulo-desc');
  const activeEntry = page.url();
  const form = await openDataEditor(page);
  const slug = form.getByLabel('Dirección de tu página', { exact: true });
  const city = form.getByLabel('Ciudad', { exact: false });
  const capture = await captureCreatorApi(page);
  let back;
  let secondBack;
  try {
    await slug.fill(reservedSlug);
    await city.fill('Ciudad conservada');
    back = page.goBack();
    back.catch(() => {});
    const firstPrompt = exitPrompt(page);
    await expect(firstPrompt).toBeVisible();
    await expect(page).toHaveURL(activeEntry);
    const rejectedWriteStart = capture.writes().length;
    await firstPrompt.getByRole('button', { name: 'Guardar y salir', exact: true }).click();
    const rejected = await waitForOwnerWrite(capture, { status: 409, since: rejectedWriteStart });
    assert.equal(rejected.responseBody.error, 'SLUG_TAKEN');

    await expectOnlyVisibleReservedError(page, form);
    await expect(slug).toHaveValue(reservedSlug);
    await expect(city).toHaveValue('Ciudad conservada');
    await expect(slug).toBeFocused();
    const slugError = await expectFieldError(page, slug, /reservada|elige otra/iu, /3–40 caracteres/iu);
    assert.equal((await fixture.rawOwner(cookie)).profile.slug, 'ana-browser',
      'Guardar y salir does not persist the colliding slug');
    await back;

    await slug.fill('direccion-elegida');
    await expectFieldErrorCleared(page, slug, form, /reservada|elige otra/iu, /3–40 caracteres/iu, slugError);
    const correctedWriteStart = capture.writes().length;
    await form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    await waitForOwnerWrite(capture, { status: 200, since: correctedWriteStart });
    await expect(page.locator('[data-owner-dialog]')).toBeHidden();
    await expect(page).toHaveURL(activeEntry);

    // Once the corrected value is saved, a new explicit exit decision can
    // resume the history transition without reusing the rejected attempt.
    const reopened = await openDataEditor(page);
    await reopened.getByLabel('Ciudad', { exact: false }).fill('Ciudad elegida al salir');
    secondBack = page.goBack();
    secondBack.catch(() => {});
    await expect(exitPrompt(page)).toBeVisible();
    const finalWriteStart = capture.writes().length;
    await exitPrompt(page).getByRole('button', { name: 'Guardar y salir', exact: true }).click();
    await waitForOwnerWrite(capture, { status: 200, since: finalWriteStart });
    await secondBack;
    await expect(page).toHaveURL(destination);
    const saved = await fixture.rawOwner(cookie);
    assert.equal(saved.profile.slug, 'direccion-elegida');
    assert.equal(saved.profile.city, 'Ciudad elegida al salir');
  } finally {
    back?.catch(() => {});
    secondBack?.catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Programas muestra el grupo para un rechazo real y conserva el aviso general sin diagnóstico aplicable', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, {
    profileFields: { city: 'Ciudad vigente', bio: 'Presentación vigente.' },
  });
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const form = await openDataEditor(page);
  const programs = form.getByRole('group', { name: /Programas de AWS/iu });
  const builders = form.getByLabel('Community Builders', { exact: true });
  const save = form.getByRole('button', { name: 'Guardar datos', exact: true });
  const capture = await captureCreatorApi(page);
  const removeProfileRejections = await installProfileRejections(page, fixture, ['group', 'absent', 'unknown']);
  try {
    await builders.check();
    const groupWriteStart = capture.writes().length;
    await save.click();
    const grouped = await waitForOwnerWrite(capture, { status: 422, since: groupWriteStart });
    assert.equal(grouped.responseBody.error, 'INVALID_PROGRAMS');
    await expect(form).toBeVisible();
    const programError = await expectFieldError(page, programs, /program|seleccion|válid|disponib/iu);
    const errorId = await programError.getAttribute('id');
    assert.ok(errorId, 'the checkbox group has a referencable error');
    const checkboxes = programs.getByRole('checkbox');
    await expect(checkboxes.first()).toBeFocused();
    for (const checkbox of await checkboxes.all()) {
      const descriptions = (await checkbox.getAttribute('aria-describedby') ?? '').split(/\s+/u);
      assert.ok(descriptions.includes(errorId), 'each checkbox has access to the group error');
    }

    const absentWriteStart = capture.writes().length;
    await save.click();
    const absent = await waitForOwnerWrite(capture, { status: 422, since: absentWriteStart });
    assert.equal(absent.responseBody.error, 'FIELD_TOO_LONG');
    assert.equal(absent.responseBody.fieldErrors, undefined);
    await expect(programError).toBeHidden();
    await expect(form.locator('[aria-invalid="true"]')).toHaveCount(0);
    const formMessage = form.locator('[role="status"], [role="alert"]').filter({
      hasText: /revisa los datos del formulario|(?:texto|información).*(?:límite|larg[oa])/iu,
    }).first();
    await expect(formMessage).toBeVisible();

    await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await exitPrompt(page).getByRole('button', { name: 'Descartar cambios', exact: true }).click();
    await expect(form).toHaveCount(0);
    await openDataEditor(page);
    await expect(formMessage).toHaveCount(0);
    await builders.check();

    const unknownWriteStart = capture.writes().length;
    await save.click();
    const unknown = await waitForOwnerWrite(capture, { status: 422, since: unknownWriteStart });
    assert.equal(unknown.responseBody.error, 'FIELD_TOO_LONG');
    assert.deepEqual(unknown.responseBody.fieldErrors, [{ field: 'programas-internos', reason: 'unsupported' }]);
    await expect(programError).toBeHidden();
    await expect(form.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(formMessage).toBeVisible();
    await expect(builders).toBeChecked();
    const saved = await fixture.rawOwner(cookie);
    assert.deepEqual(saved.profile.programs, [], 'all controlled rejections leave the saved program group unchanged');
  } finally {
    await removeProfileRejections();
    await capture.stop({ skipErrorBodies: true });
  }
});

test('la validación nativa de la dirección muestra feedback asociado y no envía la alta', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const form = createForm(page);
  const name = form.getByLabel('Nombre visible', { exact: true });
  const slug = form.getByLabel('Dirección de tu página', { exact: true });
  const capture = await captureCreatorApi(page);
  try {
    await slug.fill('No válido');
    await form.getByRole('button', { name: 'Crear borrador', exact: true }).click();
    await expect.poll(() => capture.writes().length).toBe(0);
    assert.equal(await slug.evaluate((input) => input.validity.patternMismatch), true);
    await expect(name).toBeFocused();
    const nameError = await expectFieldError(page, name, /nombre|completa|campo/iu);
    const slugError = await expectFieldError(page, slug, /direcci|minúscul|guion|válid|caracter/iu, /3–40 caracteres/iu);
    await expect(form.locator('small').filter({ hasText: /3–40 caracteres/iu })).toBeVisible();

    // Native invalidity blocks the write but does not make a new, explicit
    // exit choice inaccessible. Canceling that choice keeps both errors and
    // the original draft in the create form.
    await page.getByRole('navigation', { name: 'Secciones de Tu página' })
      .getByRole('link', { name: 'Enlaces', exact: true }).click();
    const nativePrompt = exitPrompt(page);
    await expect(nativePrompt).toBeVisible();
    await expect(form).toBeVisible();
    await slug.press('Enter');
    await expect(name).toBeFocused();
    await expect(nativePrompt).toBeVisible();
    await expect(nameError).toBeVisible();
    await expect(slugError).toBeVisible();
    assert.equal(capture.writes().length, 0, 'an invalid ordinary Enter preserves the decision without issuing a write');
    await nativePrompt.getByRole('button', { name: 'Seguir editando', exact: true }).click();
    await expect(nativePrompt).toBeHidden();
    await expect(form).toBeVisible();

    await slug.fill('direccion-valida');
    await expectFieldErrorCleared(page, slug, form, /direcci|minúscul|guion|válid|caracter/iu, /3–40 caracteres/iu, slugError);
    await expectFieldError(page, name, /nombre|completa|campo/iu);
    assert.equal(await slug.evaluate((input) => input.validity.valid), true);

    await name.fill('Nombre válido');
    await expectFieldErrorCleared(page, name, form, /nombre|completa|campo/iu, null, nameError);
    await expect.poll(() => capture.writes().length).toBe(0);
    const acceptedWriteStart = capture.writes().length;
    await form.getByRole('button', { name: 'Crear borrador', exact: true }).click();
    await waitForOwnerWrite(capture, { status: 200, since: acceptedWriteStart });
    const saved = await fixture.rawOwner(cookie);
    assert.equal(saved.profile.slug, 'direccion-valida');
    assert.equal(saved.profile.displayName, 'Nombre válido');
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('un nombre vacío sólo para una página publicada se atribuye al nombre y conserva el resto del borrador', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, {
    profileFields: { city: 'Ciudad vigente', bio: 'Presentación vigente.' },
  });
  const before = await fixture.rawOwner(cookie);
  const publication = await api(fixture, cookie, '/api/creador/perfil/publicar', {
    method: 'POST',
    body: { creatorVersion: before.profile.version },
  });
  assert.equal(publication.response.status, 200, JSON.stringify(publication.body));
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const form = await openDataEditor(page);
  const name = form.getByLabel('Nombre visible', { exact: true });
  const city = form.getByLabel('Ciudad', { exact: false });
  const capture = await captureCreatorApi(page);
  try {
    // Whitespace passes the browser's required check but is empty after the
    // service normalizes the published identity.
    await name.fill('   ');
    await city.fill('Ciudad del borrador');
    const rejectedWriteStart = capture.writes().length;
    await form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    const rejected = await waitForOwnerWrite(capture, { status: 422, since: rejectedWriteStart });
    assert.equal(rejected.responseBody.error, 'PROFILE_INCOMPLETE');
    assert.deepEqual(rejected.responseBody.fieldErrors, [{ field: 'displayName', reason: 'required' }]);
    await expect(form).toBeVisible();
    await expect(name).toHaveValue('   ');
    await expect(city).toHaveValue('Ciudad del borrador');
    await expect(name).toBeFocused();
    await expectFieldError(page, name, /nombre|completa|requer|visible/iu);
    const afterRejected = await fixture.rawOwner(cookie);
    assert.equal(afterRejected.profile.displayName, before.profile.displayName);
    assert.equal(afterRejected.profile.city, before.profile.city);
    assert.equal(afterRejected.profile.published, true);
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

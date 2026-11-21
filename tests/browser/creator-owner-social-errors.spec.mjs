import assert from 'node:assert/strict';
import { CREATOR_FIELD_LIMITS } from '../../src/lib/creator-values.mjs';
import {
  test,
  expect,
  captureCreatorApi,
  loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

function socialsForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="redes"]');
}

function exitPrompt(page) {
  return page.locator('[data-owner-exit-prompt]');
}

async function openSocials(page) {
  await page.getByRole('button', { name: 'Editar redes', exact: true }).click();
  const form = socialsForm(page);
  await expect(form).toBeVisible();
  return form;
}

async function waitForOwnerWrite(capture, { status, since }) {
  assert.ok(Number.isInteger(since) && since >= 0);
  const matching = () => capture.writes().slice(since).find(({ method, path, status: actual }) => method === 'PUT'
    && path === '/api/creador/perfil' && actual === status);
  await expect.poll(matching).toBeTruthy();
  return matching();
}

function oversizedUrl(suffix) {
  return `https://example.invalid/${suffix}${'x'.repeat(CREATOR_FIELD_LIMITS.social)}`;
}

async function installSocialRejections(page, fixture, modes) {
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
    if (mode === 'multiple' || mode === 'unknown') {
      body.socials = {
        ...(body.socials ?? {}),
        instagram: oversizedUrl('instagram-'),
        website: oversizedUrl('website-'),
      };
    } else if (mode === 'inapplicable') {
      body.bio = 'x'.repeat(2_001);
    }
    const headers = new Headers(request.headers());
    headers.delete('content-length');
    const actual = await fixture.creatorRuntime.handle(new Request(request.url(), {
      method: request.method(), headers, body: JSON.stringify(body),
    }));
    assert.equal(actual.status, 422, 'the controlled response comes from a real definitive service rejection');
    const payload = await actual.json();
    if (mode === 'multiple') {
      payload.fieldErrors = [
        { field: 'socials.instagram', reason: 'too_long' },
        { field: 'socials.website', reason: 'too_long' },
      ];
    } else if (mode === 'unknown') {
      payload.fieldErrors = [{ field: 'socials.not-a-control', reason: 'too_long' }];
    } else if (mode === 'inapplicable') {
      payload.fieldErrors = [{ field: 'bio', reason: 'too_long' }];
    }
    const responseHeaders = Object.fromEntries(actual.headers.entries());
    delete responseHeaders['content-length'];
    await route.fulfill({ status: actual.status, headers: responseHeaders, body: JSON.stringify(payload) });
  };
  await page.route('**/api/creador/perfil**', handler);
  return async () => page.unroute('**/api/creador/perfil**', handler).catch(() => {});
}

async function fieldError(field, pattern) {
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const describedBy = (await field.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean);
  assert.ok(describedBy.length > 0, 'the social control has an accessible description');
  const container = field.locator('xpath=ancestor::div[contains(@class, "creator-owner__field")]').first();
  const error = container.locator('[data-owner-field-error]');
  await expect(error).toHaveCount(1);
  assert.match(await error.innerText(), pattern, 'the field error names a corrective action');
  await expect(error).toBeVisible();
  assert.ok(describedBy.includes(await error.getAttribute('id')), 'the control references its visible error');
  return error;
}

async function expectFieldCleared(field, error) {
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
  await expect(error).toBeHidden();
}

for (const { reason, value, typeMismatch } of [
  { reason: 'protocolo inseguro', value: 'ftp://instagram.example.invalid/no', typeMismatch: false },
  { reason: 'credenciales', value: 'https://user:secret@example.invalid/no', typeMismatch: false },
  { reason: 'formato de URL', value: 'no-es-una-url', typeMismatch: true },
]) {
  test(`Redes muestra el error local de ${reason} y guarda solo al corregirlo`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page, {
      profileFields: {
        socials: {
          instagram: 'https://instagram.example.invalid/guardada',
          website: 'https://example.invalid/guardada',
        },
      },
    });
    const before = await fixture.rawOwner(cookie);
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    const form = await openSocials(page);
    const instagram = form.getByLabel('Instagram', { exact: true });
    const website = form.getByLabel('Sitio web o newsletter', { exact: true });
    const save = form.getByRole('button', { name: 'Guardar redes', exact: true });
    const capture = await captureCreatorApi(page);
    try {
      await instagram.fill(value);
      assert.equal(await instagram.evaluate((input) => input.validity.typeMismatch), typeMismatch);
      if (typeMismatch) await instagram.press('Enter');
      else await save.click();
      const error = await fieldError(instagram, /URL|HTTP|credenciales|dirección/iu);
      await expect(instagram).toBeFocused();
      await expect(form.getByText(/Las direcciones deben ser URL HTTP o HTTPS completas/iu)).toBeVisible();
      await expect(website).toHaveValue('https://example.invalid/guardada');
      assert.equal(capture.writes().length, 0, 'un envío inválido no escribe');
      assert.deepEqual((await fixture.rawOwner(cookie)).profile, before.profile);

      const corrected = 'https://instagram.example.invalid/corregida';
      await instagram.fill(corrected);
      await expectFieldCleared(instagram, error);
      assert.equal(await instagram.evaluate((input) => input.validity.valid), true);
      await save.click();
      await waitForOwnerWrite(capture, { status: 200, since: 0 });
      await expect(form).toBeHidden();
      assert.equal(capture.writes().length, 1);
      assert.deepEqual((await fixture.rawOwner(cookie)).profile.socials, {
        instagram: corrected, website: 'https://example.invalid/guardada',
      });
    } finally {
      await capture.stop({ skipErrorBodies: true });
    }
  });
}

test('Redes asocia varios diagnósticos conocidos, limpia cada corrección y persiste el intento corregido', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, {
    profileFields: {
      city: 'Ciudad conservada',
      socials: {
        instagram: 'https://instagram.example.invalid/guardada',
        website: 'https://example.invalid/guardada',
      },
    },
  });
  const before = await fixture.rawOwner(cookie);
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const form = await openSocials(page);
  const instagram = form.getByLabel('Instagram', { exact: true });
  const website = form.getByLabel('Sitio web o newsletter', { exact: true });
  const capture = await captureCreatorApi(page);
  const removeRejections = await installSocialRejections(page, fixture, ['multiple']);
  try {
    await instagram.fill('https://instagram.example.invalid/nueva');
    await website.fill('https://example.invalid/nueva');
    const rejectedWriteStart = capture.writes().length;
    await form.getByRole('button', { name: 'Guardar redes', exact: true }).click();
    const rejected = await waitForOwnerWrite(capture, { status: 422, since: rejectedWriteStart });
    assert.equal(rejected.responseBody.error, 'FIELD_TOO_LONG');
    assert.deepEqual(rejected.responseBody.fieldErrors, [
      { field: 'socials.instagram', reason: 'too_long' },
      { field: 'socials.website', reason: 'too_long' },
    ]);
    const instagramError = await fieldError(instagram, /Instagram|límite|URL/iu);
    const websiteError = await fieldError(website, /Sitio web|límite|URL/iu);
    await expect(instagram).toHaveValue('https://instagram.example.invalid/nueva');
    await expect(website).toHaveValue('https://example.invalid/nueva');
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, before.profile,
      'known social diagnostics reject before changing stored values');
    await expect(form.getByText(/Las direcciones deben ser URL HTTP o HTTPS completas/iu)).toBeVisible();

    await instagram.fill('https://instagram.example.invalid/corregida');
    await expectFieldCleared(instagram, instagramError);
    await expect(website).toHaveAttribute('aria-invalid', 'true');
    await expect(websiteError).toBeVisible();
    await website.fill('https://example.invalid/corregida');
    await expectFieldCleared(website, websiteError);

    const correctedWriteStart = capture.writes().length;
    await form.getByRole('button', { name: 'Guardar redes', exact: true }).click();
    await waitForOwnerWrite(capture, { status: 200, since: correctedWriteStart });
    const stored = await fixture.rawOwner(cookie);
    assert.deepEqual(stored.profile.socials, {
      instagram: 'https://instagram.example.invalid/corregida',
      website: 'https://example.invalid/corregida',
    });
    assert.equal(stored.profile.city, 'Ciudad conservada', 'the unrelated profile value remains intact');
  } finally {
    await removeRejections();
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Redes deja diagnósticos desconocidos o inaplicables como feedback general sin marcar una red', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, {
    profileFields: { socials: { website: 'https://example.invalid/guardada' } },
  });
  const before = await fixture.rawOwner(cookie);
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const form = await openSocials(page);
  const website = form.getByLabel('Sitio web o newsletter', { exact: true });
  const instagram = form.getByLabel('Instagram', { exact: true });
  const capture = await captureCreatorApi(page);
  const removeRejections = await installSocialRejections(page, fixture, ['unknown', 'inapplicable']);
  try {
    for (const [value, label] of [
      ['https://example.invalid/unknown', 'unknown'],
      ['https://example.invalid/inapplicable', 'inapplicable'],
    ]) {
      await website.fill(value);
      const rejectedWriteStart = capture.writes().length;
      await form.getByRole('button', { name: 'Guardar redes', exact: true }).click();
      const rejected = await waitForOwnerWrite(capture, { status: 422, since: rejectedWriteStart });
      assert.equal(rejected.responseBody.error, 'FIELD_TOO_LONG', label);
      await expect(form.locator('[data-owner-form-status="redes"]')).toBeVisible();
      await expect(form.locator('[data-owner-form-status="redes"]')).toContainText(/Revisa los datos del formulario/iu);
      await expect(form.locator('[aria-invalid="true"]')).toHaveCount(0);
      await expect(website).toHaveValue(value);
      await expect(instagram).toHaveValue('');
      assert.deepEqual((await fixture.rawOwner(cookie)).profile, before.profile,
        `${label} diagnostics leave the saved profile unchanged`);
    }

    await website.fill('https://example.invalid/corregida');
    const correctedWriteStart = capture.writes().length;
    await form.getByRole('button', { name: 'Guardar redes', exact: true }).click();
    await waitForOwnerWrite(capture, { status: 200, since: correctedWriteStart });
    assert.equal((await fixture.rawOwner(cookie)).profile.socials.website, 'https://example.invalid/corregida');
  } finally {
    await removeRejections();
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Guardar y salir en Redes cancela la salida en un rechazo y conserva la ubicación', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, {
    profileFields: { socials: { website: 'https://example.invalid/guardada' } },
  });
  const before = await fixture.rawOwner(cookie);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces&buscar=redes-errors`);
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  const destination = page.url();
  await page.locator('#owner-link-order').selectOption('titulo-desc');
  await expect(page).toHaveURL((url) => url.searchParams.get('orden') === 'titulo-desc');
  const activeUrl = page.url();
  const form = await openSocials(page);
  const website = form.getByLabel('Sitio web o newsletter', { exact: true });
  const instagram = form.getByLabel('Instagram', { exact: true });
  await instagram.fill('https://instagram.example.invalid/salida');
  await website.fill('https://example.invalid/salida');
  const capture = await captureCreatorApi(page);
  const removeRejections = await installSocialRejections(page, fixture, ['multiple']);
  let back;
  try {
    back = page.goBack();
    back.catch(() => {});
    await expect(exitPrompt(page)).toBeVisible();
    await expect(page).toHaveURL(activeUrl);
    const rejectedWriteStart = capture.writes().length;
    await exitPrompt(page).getByRole('button', { name: 'Guardar y salir', exact: true }).click();
    const rejected = await waitForOwnerWrite(capture, { status: 422, since: rejectedWriteStart });
    assert.equal(rejected.responseBody.error, 'FIELD_TOO_LONG');
    await expect(page).toHaveURL(activeUrl);
    await expect(exitPrompt(page)).toBeHidden();
    await expect(form).toBeVisible();
    await expect(instagram).toHaveValue('https://instagram.example.invalid/salida');
    await expect(website).toHaveValue('https://example.invalid/salida');
    await expect(website).toHaveAttribute('aria-invalid', 'true');
    await expect(instagram).toBeFocused();
    await expect(form.locator('[data-owner-field-error]').filter({ visible: true })).toHaveCount(2);
    await expect(page).not.toHaveURL(/cuenta\/salir/iu);
    await expect(page).not.toHaveURL(destination);
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, before.profile,
      'a failed Redes exit save has no stored effect');
  } finally {
    back?.catch(() => {});
    await removeRejections();
    await capture.stop({ skipErrorBodies: true });
  }
  assert.deepEqual((await fixture.rawOwner(cookie)).profile, before.profile);
});

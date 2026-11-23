import assert from 'node:assert/strict';
import { expect, test, createProfile } from '../fixtures/creator-browser-test.mjs';
import {
  adminPath,
  loginAsSeparateOwner,
  prepareAdmin,
  resource,
  root,
  submitCreatorClaim,
} from '../fixtures/creator-admin.mjs';

const claimRow = (page, id) => page.locator(`[data-admin-claim="${id}"]`);
const claimForm = (page, id) => claimRow(page, id).locator('form[data-claim-resolution]');
const claimSelection = (form, id) => form.locator(`input[name="resourceIds"][value="${id}"]`);
const reviewCheckbox = (form) => form.getByRole('checkbox', {
  name: 'Confirmo que revisé la referencia y los recursos seleccionados.',
});
const claimSubmit = (form) => form.getByRole('button', { name: 'Vincular recursos seleccionados' });

async function openAdmin(fixture, page) {
  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();
}

async function createOwnerProfile(fixture, suffix) {
  const cookie = await loginAsSeparateOwner(
    fixture,
    `admin-claim-errors-${suffix}`,
    `admin-claim-errors-${suffix}@example.invalid`,
  );
  const profile = await createProfile(fixture, cookie, {
    displayName: `Perfil ${suffix}`,
    slug: `claim-errors-${suffix}`,
  });
  const principal = await fixture.principal(cookie);
  return { cookie, principal, profile };
}

async function createClaim(fixture, cookie, resourceIds) {
  const result = await submitCreatorClaim(fixture, cookie, resourceIds, {
    evidence: 'Solicitud de prueba para errores de selección administrativa.',
  });
  assert.ok(result.id);
  return result;
}

function claimSelectionGroup(form) {
  return form.locator(':is(fieldset.creator-admin__claim-resources, [role="group"]):has(input[name="resourceIds"])');
}

async function expectSelectionError(form, pattern) {
  const group = claimSelectionGroup(form);
  await expect(group).toBeVisible();
  await expect(group).toHaveAttribute('aria-invalid', 'true');
  const describedBy = (await group.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean);
  assert.ok(describedBy.length > 0, 'the selection group keeps an accessible error description');
  let error;
  for (const id of describedBy) {
    const candidate = form.locator(`#${id}`);
    if (pattern.test(await candidate.innerText())) {
      error = candidate;
      break;
    }
  }
  assert.ok(error, 'the selection group exposes a specific corrective message');
  await expect(error).toBeVisible();
  const errorId = await error.getAttribute('id');
  assert.ok(errorId, 'the selection error has a stable association target');
  const controls = form.locator('input[name="resourceIds"]');
  for (let index = 0; index < await controls.count(); index += 1) {
    const descriptions = (await controls.nth(index).getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean);
    assert.ok(descriptions.includes(errorId), 'each resource checkbox points to the group correction');
  }
  return { group, error };
}

async function expectSelectionErrorCleared(form, error) {
  await expect(claimSelectionGroup(form)).not.toHaveAttribute('aria-invalid', 'true');
  await expect(form.locator('input[name="resourceIds"][aria-invalid="true"]')).toHaveCount(0);
  await expect(error).toBeHidden();
  const errorId = await error.getAttribute('id');
  if (errorId) {
    const controls = form.locator('input[name="resourceIds"]');
    for (let index = 0; index < await controls.count(); index += 1) {
      const descriptions = (await controls.nth(index).getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean);
      assert.equal(descriptions.includes(errorId), false, 'correcting the selection removes its obsolete description');
    }
  }
}

test('the claim review confirmation remains native and blocks the write', async ({ fixture, page }) => {
  const id = 'admin-claim-errors-native-review';
  await prepareAdmin(fixture, page, [resource(id, 0)]);
  const owner = await createOwnerProfile(fixture, 'native-review');
  const claim = await createClaim(fixture, owner.cookie, [id]);
  await openAdmin(fixture, page);

  const form = claimForm(page, claim.id);
  const review = reviewCheckbox(form);
  assert.equal(await review.getAttribute('required'), '', 'the reviewed confirmation stays a native required control');
  let writes = 0;
  const onRequest = (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/') writes += 1;
  };
  page.on('request', onRequest);
  try {
    await form.evaluate((element) => element.requestSubmit());
    await expect(review).toBeFocused();
    assert.equal(await review.evaluate((control) => control.validity.valueMissing), true,
      'the browser reports the missing reviewed confirmation as native invalidity');
    await expect(review).toHaveAttribute('aria-invalid', 'true');
    const describedBy = (await review.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean);
    assert.ok(describedBy.length > 0, 'the native confirmation keeps an accessible inline error description');
    let reviewError;
    for (const id of describedBy) {
      const candidate = form.locator(`#${id}`);
      if (await candidate.isVisible() && /confirma|revis/iu.test(await candidate.innerText())) {
        reviewError = candidate;
        break;
      }
    }
    assert.ok(reviewError, 'the native confirmation exposes a visible correction message');
    await expect(reviewError).toBeVisible();
    await expect(claimSelectionGroup(form)).not.toHaveAttribute('aria-invalid', 'true');
    await expect(form.locator('input[name="resourceIds"][aria-invalid="true"]')).toHaveCount(0);
    await expect.poll(() => writes).toBe(0);
    await review.check();
    await expect(review).not.toHaveAttribute('aria-invalid', 'true');
    await expect(reviewError).toBeHidden();
  } finally {
    page.off('request', onRequest);
  }
});

test('an empty resource selection is a correctable local group error before a real explicit retry', async ({ fixture, page }) => {
  const ids = ['admin-claim-errors-local-target', 'admin-claim-errors-local-draft'];
  await prepareAdmin(fixture, page, ids.map((id, index) => resource(id, index)));
  const owner = await createOwnerProfile(fixture, 'local-selection');
  const claim = await createClaim(fixture, owner.cookie, [ids[0]]);
  await openAdmin(fixture, page);

  const form = claimForm(page, claim.id);
  const selection = claimSelection(form, ids[0]);
  const review = reviewCheckbox(form);
  const submit = claimSubmit(form);
  await page.locator(`[data-admin-resource="${encodeURIComponent(ids[1])}"]`).getByLabel('Categoría').fill('Borrador conservado');
  await review.check();
  await selection.uncheck();

  let writes = 0;
  const onRequest = (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/') writes += 1;
  };
  page.on('request', onRequest);
  try {
    await submit.click();
    const emptyError = await expectSelectionError(form, /selecciona|elige|marca|recurso|ID/iu);
    await expect(selection).toBeFocused();
    await expect(selection).not.toBeChecked();
    await expect(review).toBeChecked();
    await expect(page.locator(`[data-admin-resource="${encodeURIComponent(ids[1])}"]`).getByLabel('Categoría'))
      .toHaveValue('Borrador conservado');
    assert.equal(writes, 0, 'an empty selection is rejected locally without a POST');

    await selection.check();
    await expectSelectionErrorCleared(form, emptyError.error);

    const retry = page.waitForResponse((response) => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await submit.click();
    const response = await retry;
    assert.equal(response.status(), 200, 'the corrected selection reaches the real claim service');
    assert.deepEqual(JSON.parse(response.request().postData()), {
      accountId: owner.principal.accountId,
      resourceIds: [ids[0]],
    });
    assert.equal(writes, 1, 'the local rejection is followed by one deliberate POST');
    const savedOwner = await fixture.rawOwner(owner.cookie);
    assert.deepEqual(Object.values(savedOwner.profile.placements).map(({ resourceId }) => resourceId), [ids[0]]);
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'resolved');
    await expect(page.locator(`[data-admin-resource="${encodeURIComponent(ids[1])}"]`).getByLabel('Categoría'))
      .toHaveValue('Borrador conservado');
  } finally {
    page.off('request', onRequest);
  }
});

for (const { colorScheme, viewport } of [
  { colorScheme: 'dark', viewport: { width: 390, height: 844 } },
  { colorScheme: 'light', viewport: { width: 1265, height: 720 } },
]) {
  test(`a long real claim keeps its group correction beside the focused control (${viewport.width}px, ${colorScheme})`, async ({ fixture, page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme });
    const suffix = `${viewport.width}-${colorScheme}`;
    const ids = Array.from({ length: 12 }, (_, index) => `admin-claim-errors-long-${suffix}-${index}`);
    const longUrlPrefix = 'https://admin-fixture.example.invalid/';
    const longFirstUrl = `${longUrlPrefix}${'x'.repeat(2048 - longUrlPrefix.length)}`;
    assert.equal(longFirstUrl.length, 2048, 'the first observed URL stays at the supported 2048-character limit');
    await prepareAdmin(fixture, page, ids.map((id, index) => resource(id, index,
      index === 0 ? { url: longFirstUrl } : {})));
    const owner = await createOwnerProfile(fixture, `long-${suffix}`);
    const claim = await createClaim(fixture, owner.cookie, ids);
    await openAdmin(fixture, page);

    const form = claimForm(page, claim.id);
    const selections = form.locator('input[name="resourceIds"]');
    const firstSelection = selections.first();
    const review = reviewCheckbox(form);
    const submit = claimSubmit(form);
    for (const control of await selections.all()) await control.uncheck();
    await review.check();

    let writes = 0;
    const onRequest = (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/') writes += 1;
    };
    page.on('request', onRequest);
    try {
      await submit.click();
      const selectionError = await expectSelectionError(form, /selecciona|elige|recurso|ID/iu);
      await expect(firstSelection).toBeFocused();
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(colorScheme);

      const geometry = await form.evaluate((element) => {
        const control = element.querySelector('input[name="resourceIds"]')?.getBoundingClientRect();
        const error = element.querySelector('[data-admin-field-error="resourceIds"]')?.getBoundingClientRect();
        return {
          viewport: window.innerHeight,
          control: control?.toJSON(),
          error: error?.toJSON(),
        };
      });
      assert.ok(geometry.control && geometry.error, 'the focused control and group diagnostic remain measurable');
      assert.ok(geometry.control.top >= 0 && geometry.control.bottom <= geometry.viewport,
        `the focused first checkbox is visible: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.error.top >= 0 && geometry.error.bottom <= geometry.viewport,
        `the group correction is visible with the focused control: ${JSON.stringify(geometry)}`);
      assert.equal(writes, 0, 'the empty selection is rejected without a POST');

      await firstSelection.check();
      await expectSelectionErrorCleared(form, selectionError.error);
      assert.equal(writes, 0, 'correcting the selection does not write until an explicit retry');
      for (const control of (await selections.all()).slice(1)) await control.check();

      const retry = page.waitForResponse((response) => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/admin/reclamaciones/vincular/');
      await submit.click();
      const response = await retry;
      assert.equal(response.status(), 200, 'the deliberate corrected retry reaches the real claim service');
      assert.equal(writes, 1, 'the deliberate retry performs one POST');
      assert.deepEqual(JSON.parse(response.request().postData()), {
        accountId: owner.principal.accountId,
        resourceIds: ids,
      });
      assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'resolved');
    } finally {
      page.off('request', onRequest);
    }
  });
}

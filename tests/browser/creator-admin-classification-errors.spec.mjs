import assert from 'node:assert/strict';
import { expect, test } from '../fixtures/creator-browser-test.mjs';
import {
  adminPath,
  prepareAdmin,
  resource,
  root,
  row,
} from '../fixtures/creator-admin.mjs';
import { adminResourceCommandMatches } from '../fixtures/creator-pages.mjs';

const saveButton = (page, id) => row(page, id).getByRole('button', { name: 'Guardar clasificación' });

function idsFromDescribedBy(control) {
  return control.getAttribute('aria-describedby').then((value) => (value ?? '').split(/\s+/u).filter(Boolean));
}

async function expectFieldError(control, form, pattern, { focus = true } = {}) {
  await expect(control).toHaveAttribute('aria-invalid', 'true');
  const ids = await idsFromDescribedBy(control);
  assert.ok(ids.length > 0, 'the invalid admin control keeps an accessible description');

  const described = [];
  for (const id of ids) {
    const candidate = form.locator(`[id="${id}"]`);
    if (await candidate.count() === 0 || !(await candidate.isVisible())) continue;
    const text = await candidate.innerText();
    described.push({ candidate, id, text });
  }
  const match = described.find(({ text }) => pattern.test(text));
  assert.ok(match, `the visible description names the correction (${described.map(({ text }) => text).join(' | ')})`);
  assert.ok(match.id, 'the visible field error has an id');
  if (focus) await expect(control).toBeFocused();
  return match.candidate;
}

async function expectGroupError(controls, form, pattern, { focus = true } = {}) {
  const errors = [];
  for (const control of controls) {
    await expect(control).toHaveAttribute('aria-invalid', 'true');
    const ids = await idsFromDescribedBy(control);
    assert.ok(ids.length > 0, 'every control in the taxonomy group keeps an accessible description');
    const visible = [];
    for (const id of ids) {
      const candidate = form.locator(`[id="${id}"]`);
      if (await candidate.count() === 0 || !(await candidate.isVisible())) continue;
      visible.push({ candidate, id, text: await candidate.innerText() });
    }
    const match = visible.find(({ text }) => pattern.test(text));
    assert.ok(match, `the group description names the correction (${visible.map(({ text }) => text).join(' | ')})`);
    errors.push(match);
  }
  assert.equal(new Set(errors.map(({ id }) => id)).size, 1,
    'kind and format share one accessible group diagnosis');
  if (focus) await expect(controls[0]).toBeFocused();
  return errors[0].candidate;
}

function captureAdminWrites(page, resourceId) {
  const writes = [];
  const listener = (request) => {
    if (request.method() === 'PATCH' && adminResourceCommandMatches(request.url(), resourceId)) writes.push(request);
  };
  page.on('request', listener);
  return {
    writes,
    stop() { page.off('request', listener); },
  };
}

async function openClassificationPage(fixture, page, resources) {
  await prepareAdmin(fixture, page, resources);
  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();
}

test('required classification fields are native, associated, focused, and isolated per row', async ({ fixture, page }) => {
  const [targetId, otherId] = ['admin-required-classification', 'admin-required-other-row'];
  await openClassificationPage(fixture, page, [resource(targetId, 0), resource(otherId, 1)]);
  const target = row(page, targetId);
  const other = row(page, otherId);
  const category = target.getByLabel('Categoría');
  const otherCategory = other.getByLabel('Categoría');
  const form = target.locator('[data-classification-form]');
  const writes = captureAdminWrites(page, targetId);
  try {
    await otherCategory.fill('Borrador de otra fila');
    await category.fill('');
    const helpId = 'admin-category-help-for-test';
    await category.evaluate((field, id) => {
      const help = document.createElement('small');
      help.id = id;
      help.textContent = 'Usa la etiqueta que verán los lectores.';
      field.closest('label')?.after(help);
      field.setAttribute('aria-describedby', id);
    }, helpId);
    await category.evaluate((field) => {
      field.addEventListener('invalid', (event) => {
        window.__adminNativeClassificationInvalid = {
          defaultPrevented: event.defaultPrevented,
          valueMissing: field.validity.valueMissing,
        };
      }, { once: true });
    });
    await saveButton(page, targetId).click();

    const categoryError = await expectFieldError(category, form, /categor|completa|obligator/iu);
    await expect.poll(() => page.evaluate(() => window.__adminNativeClassificationInvalid)).toEqual({
      defaultPrevented: true,
      valueMissing: true,
    });
    const describedBy = (await category.getAttribute('aria-describedby') ?? '').split(/\s+/u);
    assert.ok(describedBy.includes(helpId), 'the existing category help remains associated beside the error');
    await expect(form.locator(`#${helpId}`)).toBeVisible();
    await expect.poll(() => writes.writes.length).toBe(0);
    await expect(otherCategory).toHaveValue('Borrador de otra fila');
    await expect(other.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(other.locator('[role="alert"]')).toHaveCount(0);
    await category.fill('Corregida');
    await expect(categoryError).toBeHidden();
    await expect(category).not.toHaveAttribute('aria-invalid', 'true');
    assert.ok((await category.getAttribute('aria-describedby') ?? '').split(/\s+/u).includes(helpId),
      'correcting category keeps its pre-existing help association');
  } finally {
    writes.stop();
  }
});

test('native category rejection from the mobile viewport edge reveals its label, control, and diagnostic', async ({ fixture, page }) => {
  const id = 'admin-mobile-category-edge';
  await page.setViewportSize({ width: 390, height: 844 });
  await openClassificationPage(fixture, page, [resource(id, 0)]);
  const target = row(page, id);
  const form = target.locator('[data-classification-form]');
  const category = target.getByLabel('Categoría');
  const label = category.locator('xpath=ancestor::label[1]');
  const error = form.locator('[data-admin-field-error="category"]');
  const writes = captureAdminWrites(page, id);
  try {
    await category.fill('');
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect.poll(() => category.evaluate((element) => {
      const distanceFromBottom = () => window.innerHeight - element.getBoundingClientRect().bottom;
      const inset = 4;
      window.scrollBy({ top: inset - distanceFromBottom(), behavior: 'instant' });
      return Math.abs(distanceFromBottom() - inset);
    }), { message: 'the category control starts near the bottom of the mobile viewport' }).toBeLessThan(2);
    await category.press('Enter');
    await expectFieldError(category, form, /categor|completa|obligator/iu);
    await expect.poll(() => writes.writes.length).toBe(0);
    const boxes = await Promise.all([label, category, error].map(async (locator) => locator.boundingBox()));
    const viewportBottom = await page.evaluate(() => innerHeight);
    for (const [name, box] of [['label', boxes[0]], ['category', boxes[1]], ['error', boxes[2]]]) {
      assert.ok(box, `${name} remains measurable after native validation`);
      assert.ok(box.y >= 0 && box.y + box.height <= viewportBottom,
        `${name} is fully visible with the native diagnostic: ${JSON.stringify({ box, viewportBottom })}`);
    }
    assert.equal(await page.evaluate(() => innerWidth), 390);
    assert.equal(viewportBottom, 844);
  } finally {
    writes.stop();
  }
});

test('local taxonomy validation attributes topics separately and cleans the message on correction', async ({ fixture, page }) => {
  const [targetId, otherId] = ['admin-local-topics', 'admin-local-topics-other'];
  await openClassificationPage(fixture, page, [resource(targetId, 0), resource(otherId, 1)]);
  const target = row(page, targetId);
  const other = row(page, otherId);
  const form = target.locator('[data-classification-form]');
  const topics = target.getByLabel(/Temas/iu);
  const writes = captureAdminWrites(page, targetId);
  try {
    await other.getByLabel('Categoría').fill('Borrador de otra fila');
    await topics.fill('Serverless, Seguridad, Redes, Cómputo');
    await form.evaluate((element) => {
      element.addEventListener('submit', () => element.setAttribute('data-enter-submitted', 'true'),
        { capture: true, once: true });
    });
    await topics.press('Enter');
    await expect(form).toHaveAttribute('data-enter-submitted', 'true');

    const error = await expectFieldError(topics, form, /tema|tres|3/iu);
    await expect.poll(() => writes.writes.length).toBe(0);
    await expect(other.getByLabel('Categoría')).toHaveValue('Borrador de otra fila');
    await expect(other.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(other.locator('[role="alert"]')).toHaveCount(0);

    await topics.fill('Serverless');
    await expect(error).toBeHidden();
    await expect(topics).not.toHaveAttribute('aria-invalid', 'true');
    const describedBy = await topics.getAttribute('aria-describedby');
    assert.ok(!describedBy?.split(/\s+/u).includes(await error.getAttribute('id')),
      'correcting topics removes the obsolete diagnosis from aria-describedby');
  } finally {
    writes.stop();
  }
});

test('local kind and format validation marks both controls with one group diagnosis', async ({ fixture, page }) => {
  const id = 'admin-local-kind-format';
  await openClassificationPage(fixture, page, [resource(id, 0)]);
  const target = row(page, id);
  const form = target.locator('[data-classification-form]');
  const kind = target.getByLabel('Tipo');
  const format = target.getByLabel('Formato');
  const writes = captureAdminWrites(page, id);
  try {
    await kind.selectOption('community');
    await format.selectOption('Blog');
    await saveButton(page, id).click();

    const error = await expectGroupError([kind, format], form, /tipo|formato|combin/iu);
    await expect.poll(() => writes.writes.length).toBe(0);

    await kind.selectOption('content');
    await format.selectOption('Artículo');
    await expect(error).toBeHidden();
    await expect(kind).not.toHaveAttribute('aria-invalid', 'true');
    await expect(format).not.toHaveAttribute('aria-invalid', 'true');
  } finally {
    writes.stop();
  }
});

test('a real public-row classification rejection identifies category and persists an explicit correction', async ({ fixture, page }) => {
  const id = 'admin-public-category-rejection';
  await openClassificationPage(fixture, page, [resource(id, 0)]);
  const target = row(page, id);
  const form = target.locator('[data-classification-form]');
  const category = target.getByLabel('Categoría');
  const writes = captureAdminWrites(page, id);
  try {
    await category.fill('   ');
    await expect(category).toHaveValue('   ');
    const rejected = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && adminResourceCommandMatches(response.url(), id));
    await saveButton(page, id).click();
    const response = await rejected;
    assert.equal(response.status(), 422, 'the real public projection rejects normalized empty category');
    const payload = await response.json();
    assert.deepEqual(payload.fieldErrors, [{ field: 'category', reason: 'required' }],
      'the producer narrows this definitive rejection to the category control');
    await expectFieldError(category, form, /categor|completa|obligator/iu);
    await expect(category).toHaveValue('   ');
    assert.deepEqual(await fixture.rawResource(id), resource(id, 0),
      'the field rejection leaves the stored public row unchanged');
    assert.equal(writes.writes.length, 1, 'the rejected command is sent once');

    await category.fill('Seguridad');
    await expect(category).not.toHaveAttribute('aria-invalid', 'true');
    const saved = page.waitForResponse((candidate) => candidate.request().method() === 'PATCH'
      && adminResourceCommandMatches(candidate.url(), id));
    const reloaded = page.waitForNavigation({ waitUntil: 'load' });
    await saveButton(page, id).click();
    const savedResponse = await saved;
    assert.equal(savedResponse.status(), 200);
    await reloaded;
    assert.equal(writes.writes.length, 2, 'the correction is a deliberate second command');
    assert.equal((await fixture.rawResource(id)).category, 'Seguridad');
    assert.equal((await fixture.rawResource(id)).version, 2);
    await expect(row(page, id).getByLabel('Categoría')).toHaveValue('Seguridad');
    await expect(row(page, id).locator('[aria-invalid="true"]')).toHaveCount(0);
  } finally {
    writes.stop();
  }
});

test('a late kind-format diagnosis survives unrelated edits but is discarded after a relevant kind change', async ({ fixture, page }) => {
  const [targetId, otherId] = ['admin-late-taxonomy', 'admin-late-other-row'];
  await openClassificationPage(fixture, page, [resource(targetId, 0), resource(otherId, 1)]);
  const target = row(page, targetId);
  const other = row(page, otherId);
  const form = target.locator('[data-classification-form]');
  const otherForm = other.locator('[data-classification-form]');
  const category = target.getByLabel('Categoría');
  const kind = target.getByLabel('Tipo');
  const format = target.getByLabel('Formato');
  const otherCategory = other.getByLabel('Categoría');
  const otherTopics = other.getByLabel(/Temas/iu);
  const writes = captureAdminWrites(page, targetId);
  let requestCount = 0;
  const releases = [];
  const starts = [];
  const routeHandler = async (route) => {
    const request = route.request();
    if (request.method() !== 'PATCH' || !adminResourceCommandMatches(request.url(), targetId)) {
      await route.continue();
      return;
    }
    requestCount += 1;
    const index = requestCount - 1;
    let open;
    const gate = new Promise((resolve) => { open = resolve; });
    releases[index] = open;
    starts[index]?.();
    const body = request.postDataJSON();
    assert.equal(body.kind, 'community', 'the delayed request uses a locally valid kind');
    assert.equal(body.format, 'User Group', 'the delayed request uses a locally valid format');
    await gate;
    await route.fulfill({
      status: 422,
      json: {
        error: 'INVALID_CLASSIFICATION',
        message: 'resource classification is incomplete or invalid',
        fieldErrors: [{ field: 'kind-format', reason: 'invalid_combination' }],
      },
    });
  };
  const startedPromises = [0, 1].map(() => new Promise((resolve) => starts.push(resolve)));
  await page.route('**/api/admin/**', routeHandler);
  try {
    await kind.selectOption('community');
    await format.selectOption('User Group');
    await otherCategory.fill('Borrador de otra fila');
    await otherTopics.fill('Serverless, Seguridad, Redes, Cómputo');
    await saveButton(page, otherId).click();
    const otherError = await expectFieldError(otherTopics, otherForm, /tema|tres|3/iu);
    const firstResponse = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && adminResourceCommandMatches(response.url(), targetId));
    await saveButton(page, targetId).click();
    await startedPromises[0];

    await category.fill('Cambio no relacionado');
    await category.focus();
    await otherCategory.fill('Borrador editado durante la solicitud');
    await otherCategory.focus();
    releases[0]();
    const first = await firstResponse;
    assert.equal(first.status(), 422);
    const firstPayload = await first.json();
    assert.deepEqual(firstPayload.fieldErrors, [{ field: 'kind-format', reason: 'invalid_combination' }]);
    const groupError = await expectGroupError([kind, format], form, /tipo|formato|combin/iu, { focus: false });
    await expect(otherCategory).toBeFocused();
    await expect(otherError).toBeVisible();
    await expect(otherCategory).toHaveValue('Borrador editado durante la solicitud');
    await expect(otherTopics).toHaveAttribute('aria-invalid', 'true');

    await category.fill('Cambio no relacionado 2');
    const secondResponse = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && adminResourceCommandMatches(response.url(), targetId));
    await saveButton(page, targetId).click();
    await startedPromises[1];
    await kind.selectOption('source');
    await kind.focus();
    releases[1]();
    const second = await secondResponse;
    assert.equal(second.status(), 422);
    const secondPayload = await second.json();
    assert.deepEqual(secondPayload.fieldErrors, [{ field: 'kind-format', reason: 'invalid_combination' }]);
    await expect(groupError).toBeHidden();
    await expect(kind).not.toHaveAttribute('aria-invalid', 'true');
    await expect(format).not.toHaveAttribute('aria-invalid', 'true');
    await expect(target.locator('[data-item-status]')).toBeVisible();
    await expect(target.locator('[data-item-status]')).not.toHaveText('');
    await expect(otherError).toBeVisible();
    await expect(kind).toBeFocused();
    assert.equal(writes.writes.length, 2, 'late responses never replay a command');
  } finally {
    releases.forEach((open) => open?.());
    await page.unroute('**/api/admin/**', routeHandler).catch(() => {});
    writes.stop();
  }
});

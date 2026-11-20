import assert from 'node:assert/strict';
import {
  test, expect, addChapter, addLink, api, createProfile, createSeries, loggedInOwner, readOwnerSnapshot,
} from '../fixtures/creator-browser-test.mjs';

async function expectTextWithinPage(page, selector, context) {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.locator(selector).evaluateAll((elements) => ({
    viewport: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    text: elements.map((element) => {
      const box = element.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(element);
      return {
        text: element.textContent,
        width: element.clientWidth,
        scrollWidth: element.scrollWidth,
        outside: [...range.getClientRects()].some((rect) => rect.left < box.left - 1 || rect.right > box.right + 1),
      };
    }),
  }));
  expect(geometry.documentWidth, `${context}: document overflow`).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.text.length, `${context}: text must be rendered`).toBeGreaterThan(0);
  for (const text of geometry.text) {
    expect(text.scrollWidth, `${context}: ${text.text}`).toBeLessThanOrEqual(text.width + 1);
    expect(text.outside, `${context}: text must wrap within its box`).toBe(false);
  }
}

for (const { label, displayName, city, country } of [
  { label: 'nombre de 43 caracteres', displayName: 'CreatorHandleWithoutAnyWordBreaks1234567890', city: 'Córdoba', country: 'Argentina' },
  { label: 'nombre y ubicación máximos', displayName: 'A'.repeat(120), city: 'C'.repeat(100), country: 'P'.repeat(100) },
]) {
  test(`Perfil y serie públicos ajustan texto sin espacios: ${label}`, async ({ fixture, page, publicPage }) => {
    const cookie = await fixture.login();
    await createProfile(fixture, cookie, { displayName, city, country });
    const series = await createSeries(fixture, cookie, { name: 'S'.repeat(120), slug: 'texto-sin-espacios' });
    const link = await addLink(fixture, cookie);
    await addChapter(fixture, cookie, series.id, link.placementId);
    const published = await api(fixture, cookie, '/api/creador/perfil/publicar', {
      method: 'POST', body: { creatorVersion: (await readOwnerSnapshot(fixture, cookie)).creatorVersion },
    });
    assert.equal(published.response.status, 200, JSON.stringify(published.body));

    for (const publicView of [page, publicPage]) {
      for (const colorScheme of ['light', 'dark']) {
        await publicView.emulateMedia({ colorScheme });
        for (const width of [320, 390, 1280]) {
          await publicView.setViewportSize({ width, height: 844 });
          const context = `${label}, ${colorScheme}, ${width}px`;
          const profileResponse = await publicView.goto(`${fixture.origin}/c/ana-browser/`);
          expect(profileResponse?.status()).toBe(200);
          await expect(publicView.getByRole('heading', { name: displayName, exact: true })).toBeVisible();
          await expect(publicView.locator('.creator-profile__location')).toHaveText(`${city}, ${country}`);
          await expect(publicView.locator('#creator-series-title')).toHaveText(`Series de ${displayName}`);
          await expect(publicView.locator('#creator-links-title')).toHaveText(`Enlaces de ${displayName}`);
          await expectTextWithinPage(publicView, '#creator-name, .creator-profile__location, .creator-profile__section-heading h2', context);

          const seriesResponse = await publicView.goto(`${fixture.origin}/c/ana-browser/series/texto-sin-espacios/`);
          expect(seriesResponse?.status()).toBe(200);
          await expect(publicView.getByRole('heading', { name: series.name, exact: true })).toBeVisible();
          await expect(publicView.getByRole('link', { name: `Volver al perfil de ${displayName}`, exact: true })).toBeVisible();
          await expect(publicView.locator('.creator-public-series__creator a')).toHaveText(displayName);
          await expectTextWithinPage(publicView, '.creator-public-series__breadcrumbs, .creator-public-series__header > p, #creator-public-series-title', context);
          expect(await publicView.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(colorScheme);
        }
      }
    }
  });
}

test('Enlaces ajusta nombres de Series sin espacios dentro de la celda y conserva la tabla de escritorio', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const link = await addLink(fixture, cookie);
  const seriesNames = ['S'.repeat(120), 'T'.repeat(120)];
  for (const [index, name] of seriesNames.entries()) {
    const series = await createSeries(fixture, cookie, { name, slug: `serie-larga-${index}` });
    await addChapter(fixture, cookie, series.id, link.placementId);
  }
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
      const cell = page.locator(`[data-link-row="${link.placementId}"] td[data-label="Series"]`);
      await expect(cell).toHaveText(seriesNames.join(', '));
      await expectTextWithinPage(page, `[data-link-row="${link.placementId}"] td[data-label="Series"]`, `${colorScheme}, ${width}px`);
      expect(await page.locator('.creator-owner__link-table').evaluate((table) => getComputedStyle(table).display))
        .toBe(width === 1280 ? 'table' : 'block');
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(colorScheme);
    }
  }
});

test('Enlaces muestra los valores completos de los filtros y no desborda en móvil', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  await addLink(fixture, cookie);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();

  const filters = page.locator('form[data-link-filters]');
  await expect(filters).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const desktopWidths = await filters.locator('select').evaluateAll((selects) => Object.fromEntries(
    selects.map((select) => {
      const style = getComputedStyle(select);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas text measurement unavailable');
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const label = select.selectedOptions[0]?.textContent ?? '';
      const textWidth = context.measureText(label).width;
      const padding = Number.parseFloat(style.paddingInlineStart) + Number.parseFloat(style.paddingInlineEnd);
      // Chromium's native select affordance needs a small reserved area in
      // addition to the actual padding; measure against the loaded UI font.
      const requiredWidth = Math.ceil(textWidth + padding + 28);
      return [select.id, { width: Math.round(select.getBoundingClientRect().width), requiredWidth }];
    }),
  ));
  for (const [id, metrics] of Object.entries(desktopWidths)) {
    expect(metrics.width, `${id} must fit its selected label`).toBeGreaterThanOrEqual(metrics.requiredWidth);
  }
  await expect(filters.locator('#owner-link-series')).toHaveValue('todos');
  await expect(filters.locator('#owner-link-directory')).toHaveValue('todos');
  await expect(filters.locator('#owner-link-order')).toHaveValue('pagina');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
    await expect(filters).toBeVisible();
    const geometry = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      filtersWidth: document.querySelector('form[data-link-filters]')?.getBoundingClientRect().width ?? 0,
    }));
    expect(geometry.documentWidth, `document overflow at ${width}px`).toBeLessThanOrEqual(geometry.viewport);
    expect(geometry.filtersWidth).toBeLessThanOrEqual(geometry.viewport);
  }
});

test('Crear serie explica que la publicación depende de la página y del primer capítulo visible', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  await expect(page.getByRole('heading', { name: 'Series', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Crear serie', exact: true }).click();
  const form = page.locator('form[data-owner-form="serie"]');
  await expect(form).toBeVisible();
  await expect(form.locator('.creator-owner__form-context')).toHaveText(
    'La serie será pública cuando tu página esté publicada y visible y tenga al menos un capítulo visible.',
  );
  await expect(form).not.toContainText('se crea como borrador');
});

test('Enlaces separa visibilidad, selección y aprobación sin convertir una no propuesta en solicitud', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await readOwnerSnapshot(fixture, cookie);
  const title = 'Enlace no propuesto de prueba';
  const created = await api(fixture, cookie, '/api/creador/enlaces', {
    method: 'POST',
    body: {
      creatorVersion: initial.creatorVersion,
      title,
      url: 'https://content.example.invalid/no-propuesto',
      selectedForDirectory: false,
    },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));

  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  const row = page.locator('[data-link-row]').filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await expect(page.getByRole('columnheader', { name: 'Visibilidad en tu página', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Directorio', exact: true })).toBeVisible();

  const visibility = row.locator('td[data-label="Visibilidad en tu página"]');
  const directory = row.locator('td[data-label="Directorio"]');
  await expect(visibility).toHaveText('Página no pública hasta publicar');
  await expect(directory).toContainText('Selección: No propuesta');
  await expect(directory).toContainText('Aprobación del recurso: Pendiente');
  await expect(directory).not.toContainText('Propuesta al directorio');
  await expect(directory).not.toContainText('Solicitud enviada');

  const published = await api(fixture, cookie, '/api/creador/perfil/publicar', {
    method: 'POST', body: { creatorVersion: (await readOwnerSnapshot(fixture, cookie)).creatorVersion },
  });
  assert.equal(published.response.status, 200, JSON.stringify(published.body));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  const publishedRow = page.locator('[data-link-row]').filter({ hasText: title });
  await expect(publishedRow.locator('td[data-label="Visibilidad en tu página"]')).toHaveText('Visible en la página pública');
  await expect(publishedRow.locator('td[data-label="Directorio"]')).toContainText('Selección: No propuesta');
  await expect(publishedRow.locator('td[data-label="Directorio"]')).toContainText('Aprobación del recurso: Pendiente');

  const filters = page.locator('form[data-link-filters]');
  await filters.locator('select[name="directorio"]').selectOption('pendientes');
  await filters.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('directorio') === 'pendientes');
  await expect(page.locator('[data-link-row]').filter({ hasText: title })).toHaveCount(1,
    'the existing pending filter still includes a placement whose creator did not propose it');
});

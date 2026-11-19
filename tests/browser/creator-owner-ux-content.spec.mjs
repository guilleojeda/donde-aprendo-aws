import assert from 'node:assert/strict';
import {
  test, expect, api, loggedInOwner, readOwnerSnapshot,
} from '../fixtures/creator-browser-test.mjs';

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

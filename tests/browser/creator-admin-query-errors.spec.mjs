import assert from 'node:assert/strict';
import { addCookie, expect, test } from '../fixtures/creator-browser-test.mjs';
import { adminPath, prepareAdmin, resource } from '../fixtures/creator-admin.mjs';

test('admin GET retry retains search, state and page without JavaScript', async ({ fixture, page, publicPage }) => {
  const resources = Array.from({ length: 26 }, (_, index) =>
    resource(`retry-query-${index}`, index, { published: true, directoryApproval: 'approved' }));
  resources.push(resource('retry-query-pending', 26));
  const cookie = await prepareAdmin(fixture, page, resources);
  await addCookie(publicPage.context(), fixture, cookie);

  const initial = await publicPage.goto(`${fixture.origin}${adminPath}?state=invalid&page=0`);
  assert.equal(initial.status(), 200);
  const search = publicPage.getByRole('search');
  const results = publicPage.getByRole('region', { name: 'Recursos', exact: true });
  const filterButton = search.getByRole('button', { name: 'Buscar y filtrar' });
  const searchInput = search.getByLabel('Buscar por ID, título o URL');
  await expect(search.getByLabel('Estado')).toHaveValue('pending');
  await searchInput.fill('ninguna coincidencia');
  await filterButton.click();
  await expect(results.getByText(/^No hay recursos que coincidan/u)).toBeVisible();
  await expect(results.getByRole('heading', { level: 3 })).toHaveCount(0);
  await expect(publicPage.getByRole('main').getByRole('alert')).toHaveCount(0);
  await searchInput.fill('retry-query-');
  await search.getByLabel('Estado').selectOption('approved');
  await filterButton.click();
  await expect(results.getByText(/^Mostrando 1–25 de 26/u)).toBeVisible();
  await expect(results.getByRole('heading', { level: 3 })).toHaveCount(25);

  fixture.creatorStore.failNext('list');
  const failingRead = publicPage.waitForResponse((response) =>
    response.request().isNavigationRequest() && new URL(response.url()).pathname === adminPath);
  await publicPage.getByRole('link', { name: 'Página siguiente' }).click();
  assert.equal((await failingRead).status(), 503);
  const alert = publicPage.getByRole('main').getByRole('alert');
  await expect(alert).toContainText('No pudimos cargar administración');
  const retry = alert.getByRole('link', { name: 'Reintentar' });
  await expect(retry).toBeVisible();

  const retryRead = publicPage.waitForResponse((response) =>
    response.request().isNavigationRequest() && new URL(response.url()).pathname === adminPath);
  await retry.click();
  assert.equal((await retryRead).status(), 200);
  const recoveredUrl = new URL(publicPage.url());
  assert.equal(recoveredUrl.searchParams.get('q'), 'retry-query-');
  assert.equal(recoveredUrl.searchParams.get('state'), 'approved');
  assert.equal(recoveredUrl.searchParams.get('page'), '2');
  await expect(searchInput).toHaveValue('retry-query-');
  await expect(search.getByLabel('Estado')).toHaveValue('approved');
  await expect(results.getByText(/^Mostrando 26–26 de 26/u)).toBeVisible();
  await expect(results.getByRole('heading', { level: 3 })).toHaveCount(1);
  await expect(alert).toHaveCount(0);

  assert.equal(fixture.creatorStore.calls.filter(({ operation }) => operation === 'transact').length,
    resources.length, 'page reads and their retry never write to the creator store');
});

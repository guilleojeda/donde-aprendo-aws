import assert from 'node:assert/strict';
import testBase, { expect } from '@playwright/test';
import { startBuiltAgendaServer } from '../fixtures/built-agenda-server.mjs';
import { GROWTH_LAST_ID, GROWTH_TOTAL_CONTENT_COUNT } from '../fixtures/compact-directory-catalog.mjs';

const runBuiltGrowth = process.env.RUN_BUILT_CATALOG_GROWTH === '1';

const test = testBase.extend({
  app: [async ({}, use) => {
    const app = await startBuiltAgendaServer();
    try {
      await use(app);
    } finally {
      await app.close();
    }
  }, { scope: 'worker' }],
  browserErrors: [async ({ page }, use, testInfo) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error));
    try {
      await use();
    } finally {
      expect(errors.map((error) => error.message), testInfo.title + ': built catalog page errors').toEqual([]);
    }
  }, { auto: true }],
});

const builtTest = runBuiltGrowth ? test : test.skip;
test.setTimeout(90_000);

async function waitDirectory(page) {
  await expect(page.locator('[data-resource-list]')).toHaveAttribute('data-directory-ready', '');
}

async function visibleCardIds(page) {
  return page.locator('[data-resource-index]').evaluateAll((cards) => cards
    .filter((card) => !card.hidden)
    .map((card) => card.id));
}

builtTest('the built growth catalog keeps filters, local search, keyboard reveal and global search on the last card', async ({ app, page }) => {
  await page.goto(app.origin + '/aprender/');
  await waitDirectory(page);

  const cards = page.locator('[data-resource-index]');
  await expect.poll(() => cards.count()).toBe(GROWTH_TOTAL_CONTENT_COUNT);
  await expect.poll(async () => (await visibleCardIds(page)).length).toBe(12);

  const firstAddedByShowMore = await cards.nth(12).getAttribute('id');
  await page.locator('[data-show-more]').click();
  await expect.poll(async () => (await visibleCardIds(page)).length).toBe(24);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe(firstAddedByShowMore);
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    href: document.activeElement?.getAttribute('href'),
  }))).toEqual({
    tag: 'A',
    href: await page.locator('#' + firstAddedByShowMore + ' a[target="_blank"]').getAttribute('href'),
  });

  await page.locator('[data-filter-summary]').click();
  await page.getByLabel('Formato', { exact: true }).selectOption({ label: 'Artículo' });
  await page.getByLabel('Tema', { exact: true }).selectOption({ label: 'Serverless' });
  const filtered = await page.locator('[data-resource-index]').evaluateAll((entries) => entries
    .filter((entry) => !entry.hidden)
    .map((entry) => ({ format: entry.dataset.format, topics: entry.dataset.topics?.split('|') ?? [] })));
  assert.ok(filtered.length > 0, 'format and topic filters retain matching cards');
  assert.ok(filtered.every(({ format, topics }) => format === 'Artículo' && topics.includes('Serverless')),
    'format and topic filters apply to the complete generated directory');

  const query = 'Recurso agregado 1000';
  const searchInput = page.locator('[data-resource-search]');
  await searchInput.fill(query);
  await expect(page.locator('[data-result-count]')).toHaveText('1 recurso');
  const target = page.locator('#resource-' + GROWTH_LAST_ID);
  await expect(target).toBeVisible();
  await expect(target).toHaveAttribute('data-resource-index', String(GROWTH_TOTAL_CONTENT_COUNT - 1));

  await searchInput.fill('consulta sin coincidencias del crecimiento');
  await expect(page.locator('[data-result-count]')).toHaveText('0 recursos');
  await expect(page.locator('[data-no-results]')).toBeVisible();
  await searchInput.fill(query);
  await expect(target).toBeVisible();
  await expect(page.locator('[data-no-results]')).toBeHidden();

  await page.goto(app.origin + '/buscar/');
  const indexResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/search-index.json');
  await page.getByLabel('¿Qué quieres aprender?', { exact: true }).fill(query);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  const indexResponse = await indexResponsePromise;
  assert.equal(indexResponse.status(), 200, 'built global search serves the real generated index');
  await expect(page.locator('[data-search-status]')).toHaveText('1 resultado.');
  const result = page.locator('[data-search-results] a.search-results__result-link').filter({ hasText: query });
  await expect(result).toHaveCount(1);
  await expect(result).toHaveAttribute('href', '/aprender/#resource-' + GROWTH_LAST_ID);
  await result.click();

  await expect(page).toHaveURL(app.origin + '/aprender/#resource-' + GROWTH_LAST_ID);
  await waitDirectory(page);
  await expect(page.locator('#resource-' + GROWTH_LAST_ID)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe('resource-' + GROWTH_LAST_ID);
  assert.equal(await cards.count(), GROWTH_TOTAL_CONTENT_COUNT,
    'global search reveals the exact card without dropping the complete static catalog');
});

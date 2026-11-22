import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test as browserTest, expect } from '../fixtures/creator-browser-test.mjs';
import { startCreatorBrowserApp } from '../fixtures/creator-browser-app.mjs';
import { unifiedSearchLifecycleFixture } from '../fixtures/unified-search-lifecycle.mjs';

function appWithCatalog(itemIds) {
  return async ({}, use) => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'public-search-lifecycle-'));
    let app;
    try {
      const catalogFixture = path.join(temporaryDirectory, 'catalog.json');
      const selectedIds = new Set([...itemIds, 'community-cordoba', 'community-rosario']);
      const fixture = {
        ...unifiedSearchLifecycleFixture,
        items: unifiedSearchLifecycleFixture.items.filter(({ id }) => selectedIds.has(id)),
      };
      await writeFile(catalogFixture, `${JSON.stringify(fixture, null, 2)}\n`);
      app = await startCreatorBrowserApp({ catalogFixture });
      await use(app);
    } finally {
      try {
        await app?.close();
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    }
  };
}

const representativeTest = browserTest.extend({
  app: [appWithCatalog(['event-a-old-representative', 'event-z-current-representative', 'search-competitor']), { scope: 'worker' }],
});
const associationTest = browserTest.extend({
  app: [appWithCatalog(['event-series-active', 'event-series-expired']), { scope: 'worker' }],
});
const regroupingTest = browserTest.extend({
  app: [appWithCatalog(['event-merge-a', 'event-merge-b', 'event-merge-c']), { scope: 'worker' }],
});

representativeTest.setTimeout(90_000);
associationTest.setTimeout(90_000);
regroupingTest.setTimeout(90_000);

function watchSearchIndex(page) {
  const requests = [];
  const responses = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/search-index.json') requests.push(request.url());
  });
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/search-index.json') {
      responses.push({ url: response.url(), status: response.status() });
    }
  });
  return { requests, responses };
}

async function submitSearch(page, query, type, resultCount) {
  await page.getByLabel('¿Qué quieres aprender?').fill(query);
  await page.locator('#site-type').selectOption(type);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  if (resultCount === 0) {
    await expect(page.locator('[data-search-status]')).toContainText('No encontramos resultados');
  } else {
    await expect(page.locator('[data-search-status]')).toHaveText(`${resultCount} ${resultCount === 1 ? 'resultado' : 'resultados'}.`);
  }
  await expect(page.locator('[data-search-results] .search-results__result-link')).toHaveCount(resultCount);
}

function assertOneIndexLoad(loads) {
  assert.equal(loads.requests.length, 1, 'the search page fetches the downloadable index once');
  assert.equal(loads.responses.length, 1, 'later submissions do not receive a replacement index');
  assert.equal(loads.responses[0].status, 200, 'the production search-index route fulfills the cached load');
}

async function expectAgendaDestination(page, pathname, eventId) {
  await expect.poll(() => new URL(page.url()).pathname).toBe(pathname);
  await expect.poll(() => new URL(page.url()).hash).toBe(`#event-${eventId}`);
}

representativeTest('Enter on an exactly empty query clears displayed results and pagination', async ({ app, page }) => {
  await page.goto(`${app.origin}/buscar/`);
  const input = page.getByLabel('¿Qué quieres aprender?');
  const results = page.locator('[data-search-results] .search-results__result-link');
  const more = page.getByRole('button', { name: /Mostrar \d+ más/u });
  await page.locator('#site-type').selectOption('article');
  await input.fill('aws');
  await input.press('Enter');
  await expect(results).toHaveCount(20);
  await expect(more).toBeVisible();
  const firstResultHref = await results.first().getAttribute('href');
  await more.click();
  await expect.poll(() => results.count()).toBeGreaterThan(20);

  await input.fill('');
  await input.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Escribe una búsqueda para ver resultados.');
  await expect(results).toHaveCount(0);
  await expect(page.locator('[data-search-more]')).toBeHidden();
  await expect(input).toBeFocused();

  await input.fill('aws');
  await input.press('Enter');
  await expect(results).toHaveCount(20);
  await expect(results.first()).toHaveAttribute('href', firstResultHref);
  await expect(more).toBeVisible();
});

representativeTest('Enter on an exactly empty query prevents a held real index from restoring stale results', async ({ app, page }) => {
  await page.clock.setFixedTime(new Date('2100-01-01T11:30:00Z'));
  await page.goto(`${app.origin}/buscar/`);
  const loads = watchSearchIndex(page);
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const path = '**/search-index.json';
  const holdIndex = async (route) => {
    const response = await route.fetch();
    entered.resolve(response.status());
    await release.promise;
    await route.fulfill({ response });
  };
  await page.route(path, holdIndex);
  const input = page.getByLabel('¿Qué quieres aprender?');
  const status = page.getByRole('status');
  const results = page.locator('[data-search-results] .search-results__result-link');
  try {
    await page.locator('#site-type').selectOption('event');
    await input.fill('Taller AWS');
    await input.press('Enter');
    assert.equal(await entered.promise, 200, 'the held response comes from the real index route');
    await expect(status).toHaveText('Buscando…');

    await input.fill('');
    await page.evaluate(() => {
      const target = document.querySelector('[data-search-results]');
      window.staleSearchDestinations = [];
      new MutationObserver((records) => {
        for (const { addedNodes } of records) {
          for (const node of addedNodes) {
            if (node instanceof HTMLElement) {
              window.staleSearchDestinations.push(...Array.from(node.querySelectorAll('a'), (link) => link.getAttribute('href')));
            }
          }
        }
      }).observe(target, { childList: true });
    });
    await input.press('Enter');
    await expect.soft(status).toHaveText('Escribe una búsqueda para ver resultados.', { timeout: 2_000 });
    await expect(results).toHaveCount(0);

    const delivered = page.waitForResponse((response) => new URL(response.url()).pathname === '/search-index.json');
    release.resolve();
    const response = await delivered;
    assert.equal(response.status(), 200);
    assert.equal(await response.finished(), null);
    await expect(status).toHaveText('Escribe una búsqueda para ver resultados.');
    await expect(results).toHaveCount(0);
    await expect(page.locator('[data-search-more]')).toBeHidden();

    await submitSearch(page, 'Taller secreto', 'content', 1);
    const expectedDestination = '/aprender/#resource-search-competitor';
    await expect(results).toHaveAttribute('href', expectedDestination);
    assert.deepEqual(await page.evaluate(() => window.staleSearchDestinations), [expectedDestination]);
    assertOneIndexLoad(loads);
  } finally {
    release.resolve();
    await page.unroute(path, holdIndex);
  }
});

for (const failure of [
  { name: 'an HTTP failure', status: 503, json: { error: 'unavailable' } },
  { name: 'a decoded body with the wrong index shape', status: 200, json: { entries: [] } },
]) {
  representativeTest(`a search recovers from ${failure.name} with the same query, filter and focus`, async ({ app, page }) => {
    await page.goto(`${app.origin}/buscar/`);
    const loads = watchSearchIndex(page);
    await page.route('**/search-index.json', (route) => route.fulfill({
      status: failure.status,
      json: failure.json,
    }), { times: 1 });

    const form = page.getByRole('search');
    const input = form.getByLabel('¿Qué quieres aprender?');
    const filter = form.getByLabel('Tipo de contenido');
    const status = page.locator('[data-search-status]');
    const results = page.locator('[data-search-results] .search-results__result-link');
    const query = 'Taller secreto';
    const destination = '/aprender/#resource-search-competitor';

    await filter.selectOption('content');
    await input.fill(query);
    await input.press('Enter');

    const unavailable = /La búsqueda no está disponible.*Intenta de nuevo/u;
    await expect(status).toHaveText(unavailable);
    await expect.soft(form.getByRole('status')).toHaveText(unavailable, { timeout: 2_000 });
    await expect(input).toHaveValue(query);
    await expect(filter).toHaveValue('content');
    await expect(input).toBeFocused();
    await expect(results).toHaveCount(0);
    await expect(page.locator('[data-search-more]')).toBeHidden();
    assert.equal(new URL(page.url()).search, '', 'the typed query stays out of the URL');
    assert.deepEqual(loads.responses.map(({ status }) => status), [failure.status], 'failure does not retry automatically');

    await input.press('Enter');
    await expect(status).toHaveText('1 resultado.');
    await expect(results).toHaveAttribute('href', destination);
    await expect(input).toBeFocused();
    assert.deepEqual(loads.responses.map(({ status }) => status), [failure.status, 200], 'one explicit retry loads the real index');
  });
}

representativeTest('a surviving member destination resolves to its real agenda card', async ({ app, page }) => {
  await page.clock.setFixedTime(new Date('2100-01-01T11:30:00Z'));
  await page.goto(`${app.origin}/eventos/argentina/#event-event-z-current-representative`);
  await expectAgendaDestination(page, '/eventos/argentina/', 'event-z-current-representative');
  await expect(page.locator('#event-event-z-current-representative')).toHaveCount(1);

  const currentMember = page.locator('[data-event-member-id="event-z-current-representative"]');
  const card = page.locator('.event-card').filter({ has: currentMember });
  await expect(card).toBeVisible();
  await expect(card).toBeFocused();
  await expect(currentMember).toBeVisible();
});

representativeTest('the cached search page changes representative after the early cohost ends', async ({ app, page }) => {
  await page.clock.setFixedTime(new Date('2100-01-01T10:30:00Z'));
  await page.goto(`${app.origin}/buscar/`);
  const loads = watchSearchIndex(page);
  const firstIndexResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/search-index.json');

  await submitSearch(page, 'Taller AWS', 'event', 1);
  const response = await firstIndexResponse;
  assert.equal(response.status(), 200, 'the real /search-index.json route provides the browser index');
  const initialResult = page.locator('[data-search-results] .search-results__result-link');
  await expect(initialResult).toHaveAttribute('href', '/eventos/argentina/#event-event-a-old-representative');
  await expect(initialResult).toContainText('Taller AWS');

  await page.clock.setFixedTime(new Date('2100-01-01T11:30:00Z'));
  await submitSearch(page, 'Taller AWS', 'event', 1);
  const survivingResult = page.locator('[data-search-results] .search-results__result-link');
  await expect(survivingResult).toHaveAttribute('href', '/eventos/argentina/#event-event-z-current-representative');
  await expect(survivingResult).toContainText('TALLER ÁWS');
  await expect(survivingResult).toContainText('Arquitectura AWS en español');

  await submitSearch(page, 'Taller secreto', '', 1);
  await expect(page.locator('[data-search-results] .search-results__result-link'))
    .toHaveAttribute('href', '/aprender/#resource-search-competitor');
  await submitSearch(page, 'Taller confidencial', '', 2);
  assert.deepEqual(await page.locator('[data-search-results] .search-results__result-link').evaluateAll((links) => links.map((link) => link.getAttribute('href'))), [
    '/aprender/#resource-search-competitor',
    '/eventos/argentina/#event-event-z-current-representative',
  ]);

  await submitSearch(page, 'Comunidad Sur PE Rosario', 'event', 1);
  await expect(page.locator('[data-search-results] .search-results__result-link'))
    .toHaveAttribute('href', '/eventos/argentina/#event-event-z-current-representative');
  await page.locator('[data-search-results] .search-results__result-link').click();
  await expectAgendaDestination(page, '/eventos/argentina/', 'event-z-current-representative');
  const currentMember = page.locator('[data-event-member-id="event-z-current-representative"]');
  const card = page.locator('.event-card').filter({ has: currentMember });
  await expect(card).toBeVisible();
  await expect(card).toBeFocused();
  await expect(currentMember).toBeVisible();

  assertOneIndexLoad(loads);
});

associationTest('the cached search page removes ended-only creator links and keeps the active agenda destination', async ({ app, page }) => {
  await page.clock.setFixedTime(new Date('2100-02-01T10:30:00Z'));
  await page.goto(`${app.origin}/buscar/`);
  const loads = watchSearchIndex(page);
  const firstIndexResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/search-index.json');

  await submitSearch(page, 'Creador Efímero', 'event', 1);
  assert.equal((await firstIndexResponse).status(), 200);
  await expect(page.locator('[data-search-results] .search-results__result-link'))
    .toHaveAttribute('href', '/eventos/argentina/#event-event-series-active');
  await expect(page.locator('[data-search-results] .search-results__series-link')).toHaveCount(2);
  await expect(page.locator('[data-search-results] .search-results__series-link').nth(0))
    .toContainText('Serie que termina');
  await expect(page.locator('[data-search-results] .search-results__series-link').nth(0))
    .toHaveAttribute('href', '/c/creador-efimero/series/serie-que-termina/');

  await page.clock.setFixedTime(new Date('2100-02-01T11:30:00Z'));
  await submitSearch(page, 'Creador Efímero', 'event', 0);
  await submitSearch(page, 'Serie Compartida', 'event', 1);
  await expect(page.locator('[data-search-results] .search-results__series-link')).toHaveCount(1);
  await expect(page.locator('[data-search-results] .search-results__series-link'))
    .toHaveText('Serie Serie Compartida · Creador Compartido');
  await expect(page.locator('[data-search-results] .search-results__series-link'))
    .toHaveAttribute('href', '/c/creador-compartido/series/serie-compartida/');
  const survivingResult = page.locator('[data-search-results] .search-results__result-link').first();
  await expect(survivingResult).toHaveAttribute('href', '/eventos/argentina/#event-event-series-active');
  await survivingResult.click();
  await expectAgendaDestination(page, '/eventos/argentina/', 'event-series-active');
  await expect(page.locator('#event-event-series-active')).toBeVisible();
  await expect(page.locator('[data-event-member-id="event-series-active"]')).toBeVisible();

  assertOneIndexLoad(loads);
});

regroupingTest('cached search regroups the surviving members from previously separate occurrences', async ({ app, page }) => {
  await page.clock.setFixedTime(new Date('2100-03-01T10:30:00Z'));
  await page.goto(`${app.origin}/buscar/`);
  const loads = watchSearchIndex(page);
  const firstIndexResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/search-index.json');

  await submitSearch(page, 'Taller AWS', 'event', 2);
  assert.equal((await firstIndexResponse).status(), 200);
  assert.deepEqual(await page.locator('[data-search-results] .search-results__result-link').evaluateAll((links) => links.map((link) => link.getAttribute('href'))), [
    '/eventos/argentina/#event-event-merge-a',
    '/eventos/argentina/#event-event-merge-c',
  ]);

  await page.clock.setFixedTime(new Date('2100-03-01T11:30:00Z'));
  await submitSearch(page, 'Taller AWS', 'event', 1);
  const regroupedResult = page.locator('[data-search-results] .search-results__result-link');
  await expect(regroupedResult).toHaveAttribute('href', '/eventos/argentina/#event-event-merge-b');
  await submitSearch(page, 'Auditorio Córdoba', 'event', 1);
  await expect(page.locator('[data-search-results] .search-results__result-link'))
    .toHaveAttribute('href', '/eventos/argentina/#event-event-merge-b');

  assertOneIndexLoad(loads);
});

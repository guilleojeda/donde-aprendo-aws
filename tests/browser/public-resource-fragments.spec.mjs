import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test as browserTest, expect } from '../fixtures/creator-browser-test.mjs';
import { startCreatorBrowserApp } from '../fixtures/creator-browser-app.mjs';

const test = browserTest.extend({
  app: [async ({}, use) => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'public-resource-fragments-'));
    let app;
    try {
      const catalogFixture = path.join(temporaryDirectory, 'catalog.json');
      await writeFile(catalogFixture, `${JSON.stringify(fragmentCatalog(), null, 2)}\n`);
      app = await startCreatorBrowserApp({ catalogFixture });
      await use(app);
    } finally {
      try {
        await app?.close();
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    }
  }, { scope: 'worker' }],
});

test.setTimeout(90_000);

const unicodeContentId = 'import:material-é';
const literalPercentId = 'import:material-%C3%A9';
const unicodeSourceId = 'source:author-é';
const unicodeCommunityId = 'community:argentina-é';
const historyUnicodeContentId = 'history:module-é';
const historyPercentContentId = 'history:module-%C3%A9';

function catalogResource({
  id, title, kind = 'content', format = 'Curso', topics = ['Seguridad'], order,
  featured = false, country, sourceId, communityId,
}) {
  return {
    id,
    title,
    url: `https://resources.example.invalid/${encodeURIComponent(id)}`,
    description: `Material de prueba: ${title}.`,
    category: kind === 'community' ? 'Comunidad' : kind === 'source' ? 'Blog' : format,
    order,
    featured,
    kind,
    format,
    topics,
    ...(country ? { country } : {}),
    ...(sourceId ? { sourceId } : {}),
    ...(communityId ? { communityId } : {}),
    published: true,
  };
}

function fragmentCatalog() {
  return [
    catalogResource({
      id: unicodeContentId, title: 'Material Unicode de Faro', order: 100, featured: true,
    }),
    catalogResource({
      id: 'related-jump-content', title: 'Tutorial relacionado de CloudTrail', order: 90,
      sourceId: 'source-jump-target', communityId: 'community-jump-target',
    }),
    ...Array.from({ length: 13 }, (_, index) => catalogResource({
      id: `cloudtrail-guide-${index}`,
      title: `CloudTrail guía ${index}`,
      order: 80 - index,
    })),
    catalogResource({
      id: historyUnicodeContentId, title: 'Módulo Unicode para el historial', order: 20,
    }),
    catalogResource({
      id: historyPercentContentId, title: 'Módulo con porcentaje literal para el historial', order: 19,
    }),
    catalogResource({
      id: literalPercentId, title: 'Fuente con porcentaje literal', kind: 'source', format: 'Blog',
      topics: ['Seguridad'], order: 70,
    }),
    catalogResource({
      id: unicodeSourceId, title: 'Fuente Unicode recomendada', kind: 'source', format: 'Blog',
      topics: ['Seguridad'], order: 60, featured: true,
    }),
    catalogResource({
      id: 'source-jump-target', title: 'Fuente del salto relacionado', kind: 'source', format: 'Blog',
      topics: ['Seguridad'], order: 50,
    }),
    catalogResource({
      id: unicodeCommunityId, title: 'Comunidad Argentina recomendada', kind: 'community',
      format: 'User Group', topics: ['Comunidad'], country: 'AR', order: 40, featured: true,
    }),
    catalogResource({
      id: 'community-jump-target', title: 'Comunidad de Córdoba', kind: 'community',
      format: 'User Group', topics: ['Comunidad'], country: 'AR', order: 30,
    }),
  ];
}

function resourceCard(page, id) {
  return page.locator(`li.resource-card[id="resource-${id}"]`);
}

async function expectFocused(page, id) {
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe(`resource-${id}`);
}

test('home recommendations render canonical Unicode fragment hrefs for content, source, and country community', async ({ fixture, page }) => {
  await page.goto(`${fixture.origin}/`);
  const actual = await page.locator('a.home-recommendation').evaluateAll((links) => links.map((link) => ({
    title: link.querySelector('strong')?.textContent,
    href: link.getAttribute('href'),
  })));

  assert.deepEqual(actual, [
    { title: 'Material Unicode de Faro', href: '/aprender/#resource-import:material-%C3%A9' },
    { title: 'Fuente Unicode recomendada', href: '/creadores/#resource-source:author-%C3%A9' },
    { title: 'Comunidad Argentina recomendada', href: '/comunidades/argentina/#resource-community:argentina-%C3%A9' },
  ]);
});

test('clicking a generated homepage recommendation opens its real directory fragment and focuses the card', async ({ fixture, page }) => {
  await page.goto(`${fixture.origin}/`);
  await page.getByRole('link', { name: /Material Unicode/u }).click();

  await expect(page).toHaveURL(`${fixture.origin}/aprender/#resource-import:material-%C3%A9`);
  const target = resourceCard(page, unicodeContentId);
  await expect(target).toBeVisible();
  await expectFocused(page, unicodeContentId);
});

test('the real search form uses its fetched index href to open and focus the exact resource card', async ({ fixture, page }) => {
  await page.goto(`${fixture.origin}/buscar/`);
  await page.getByLabel('¿Qué quieres aprender?').fill('Material Faro');
  await page.locator('#site-type').selectOption('content');
  const indexResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/search-index.json');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  const response = await indexResponse;
  assert.equal(response.status(), 200, 'the production search-index route supplies the browser search');
  const index = await response.json();
  const indexHref = index.find(({ type, title }) => type === 'content' && title === 'Material Unicode de Faro')?.url;
  await expect(page.locator('[data-search-status]')).toContainText('1 resultado');
  const result = page.locator('[data-search-results] a').filter({ hasText: 'Material Unicode de Faro' });
  await expect(result).toHaveCount(1);
  const renderedHref = await result.getAttribute('href');

  await result.click();
  await expect(page).toHaveURL(`${fixture.origin}/aprender/#resource-import:material-%C3%A9`);
  const card = resourceCard(page, unicodeContentId);
  await expect(card).toBeVisible();
  await expectFocused(page, unicodeContentId);
  const cardVisible = await card.isVisible();
  const activeId = await page.evaluate(() => document.activeElement?.id ?? '');

  assert.deepEqual({ indexHref, renderedHref, cardVisible, activeId }, {
    indexHref: '/aprender/#resource-import:material-%C3%A9',
    renderedHref: '/aprender/#resource-import:material-%C3%A9',
    cardVisible: true,
    activeId: `resource-${unicodeContentId}`,
  });
});

test('clicking the community recommendation uses its country route while legacy hashes remain general', async ({ fixture, page }) => {
  await page.goto(`${fixture.origin}/`);
  await page.getByRole('link', { name: /Comunidad Argentina recomendada/u }).click();

  await expect(page).toHaveURL(`${fixture.origin}/comunidades/argentina/#resource-community:argentina-%C3%A9`);
  await expect(resourceCard(page, unicodeCommunityId)).toBeVisible();
  await expectFocused(page, unicodeCommunityId);
});

test('an initial encoded Unicode fragment reveals the canonical card, clears filters, and preserves campaign and sort', async ({ fixture, page }) => {
  const filteredUrl = `${fixture.origin}/aprender/?campaign=fragment-check&q=CloudTrail&format=Curso&sort=recent`;
  await page.goto(filteredUrl);
  await expect(resourceCard(page, unicodeContentId)).toBeHidden();

  await page.goto(`${fixture.origin}/`);
  await page.goto(`${filteredUrl}#resource-import:material-%C3%A9`);

  const target = resourceCard(page, unicodeContentId);
  await expect(target).toBeVisible();
  await expect(target).toHaveAttribute('id', `resource-${unicodeContentId}`);
  await expectFocused(page, unicodeContentId);
  await expect(page.locator('[data-resource-search]')).toHaveValue('');
  await expect(page.locator('[data-format-filter]')).toHaveValue('');
  await expect(page).toHaveURL(`${fixture.origin}/aprender/?campaign=fragment-check&sort=recent#resource-import:material-%C3%A9`);
  await expect(resourceCard(page, literalPercentId)).toHaveCount(0,
    'the exact raw fallback has a different kind and cannot replace the decoded Unicode record');
});

test('a double-encoded literal percent fragment reveals the literal-percent source ID exactly once', async ({ fixture, page }) => {
  const filteredUrl = `${fixture.origin}/creadores/?campaign=literal-percent&q=no-matching-source&format=Blog&sort=recent`;
  await page.goto(filteredUrl);
  await expect(resourceCard(page, literalPercentId)).toBeHidden();

  await page.goto(`${fixture.origin}/`);
  await page.goto(`${filteredUrl}#resource-import:material-%25C3%25A9`);

  await expect(resourceCard(page, literalPercentId)).toBeVisible();
  await expectFocused(page, literalPercentId);
  await expect(page.locator('[data-resource-search]')).toHaveValue('');
  await expect(page.locator('[data-format-filter]')).toHaveValue('');
  await expect(page).toHaveURL(`${fixture.origin}/creadores/?campaign=literal-percent&sort=recent#resource-import:material-%25C3%25A9`);
});

test('a real related-source link and browser Back and Forward restore its destination fragment', async ({ fixture, page }) => {
  const sourceUrl = `${fixture.origin}/aprender/?campaign=related-link&q=relacionado&format=Curso&sort=recent`;
  await page.goto(sourceUrl);
  const article = resourceCard(page, 'related-jump-content');
  await expect(article).toBeVisible();
  const sourceLink = article.getByRole('link', { name: 'Autor o fuente: Fuente del salto relacionado', exact: true });
  await expect(sourceLink).toHaveAttribute('href', '/creadores/#resource-source-jump-target');

  await sourceLink.click();
  await expect(page).toHaveURL(`${fixture.origin}/creadores/#resource-source-jump-target`);
  await expect(resourceCard(page, 'source-jump-target')).toBeVisible();
  await expectFocused(page, 'source-jump-target');

  await page.goBack();
  await expect(page).toHaveURL(sourceUrl);
  await expect(resourceCard(page, 'related-jump-content')).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(`${fixture.origin}/creadores/#resource-source-jump-target`);
  await expectFocused(page, 'source-jump-target');
});

test('same-document Unicode and literal-percent fragments restore exact targets through Back, Forward, and reload', async ({ fixture, page }) => {
  const baseUrl = `${fixture.origin}/aprender/?campaign=fragment-history&q=CloudTrail&format=Curso&sort=directory`;
  const firstHash = '#resource-history:module-%C3%A9';
  const secondHash = '#resource-history:module-%25C3%25A9';
  const ids = [historyUnicodeContentId, historyPercentContentId];
  const observations = [];

  const snapshot = () => page.evaluate((resourceIds) => {
    const resources = Object.fromEntries(resourceIds.map((id) => {
      const card = document.getElementById(`resource-${id}`);
      return [id, { visible: Boolean(card && !card.hidden), ariaHidden: card?.getAttribute('aria-hidden') ?? null }];
    }));
    return {
      url: `${location.pathname}${location.search}${location.hash}`,
      activeId: document.activeElement?.id || null,
      query: document.querySelector('[data-resource-search]')?.value ?? null,
      format: document.querySelector('[data-format-filter]')?.value ?? null,
      resources,
    };
  }, ids);

  const setHashThroughBrowser = async (hash) => page.evaluate((value) => new Promise((resolve) => {
    window.addEventListener('hashchange', () => resolve(location.href), { once: true });
    location.hash = value;
  }), hash);
  const snapshotAfterAddressTransition = async (expectedHash) => {
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(expectedHash);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
    return snapshot();
  };

  await page.goto(baseUrl);
  observations.push(await snapshot());
  await expect(resourceCard(page, historyUnicodeContentId)).toBeHidden();
  await expect(resourceCard(page, historyPercentContentId)).toBeHidden();

  await setHashThroughBrowser(firstHash);
  observations.push(await snapshotAfterAddressTransition(firstHash));
  await setHashThroughBrowser(secondHash);
  observations.push(await snapshotAfterAddressTransition(secondHash));

  await page.goBack();
  observations.push(await snapshotAfterAddressTransition(firstHash));
  await page.goForward();
  observations.push(await snapshotAfterAddressTransition(secondHash));
  await page.reload();
  observations.push(await snapshotAfterAddressTransition(secondHash));

  const filteredState = '?campaign=fragment-history&q=CloudTrail&format=Curso&sort=directory';
  const revealedState = '?campaign=fragment-history&sort=directory';
  const visibleResources = {
    [historyUnicodeContentId]: { visible: true, ariaHidden: 'false' },
    [historyPercentContentId]: { visible: true, ariaHidden: 'false' },
  };
  assert.deepEqual(observations, [
    {
      url: `/aprender/${filteredState}`,
      activeId: null, query: 'CloudTrail', format: 'Curso',
      resources: {
        [historyUnicodeContentId]: { visible: false, ariaHidden: 'true' },
        [historyPercentContentId]: { visible: false, ariaHidden: 'true' },
      },
    },
    {
      url: `/aprender/${revealedState}${firstHash}`,
      activeId: `resource-${historyUnicodeContentId}`, query: '', format: '', resources: visibleResources,
    },
    {
      url: `/aprender/${revealedState}${secondHash}`,
      activeId: `resource-${historyPercentContentId}`, query: '', format: '', resources: visibleResources,
    },
    {
      url: `/aprender/${revealedState}${firstHash}`,
      activeId: `resource-${historyUnicodeContentId}`, query: '', format: '', resources: visibleResources,
    },
    {
      url: `/aprender/${revealedState}${secondHash}`,
      activeId: `resource-${historyPercentContentId}`, query: '', format: '', resources: visibleResources,
    },
    {
      url: `/aprender/${revealedState}${secondHash}`,
      activeId: `resource-${historyPercentContentId}`, query: '', format: '', resources: visibleResources,
    },
  ], 'actual same-document navigation, Back/Forward, and reload retain exact raw IDs and canonical fragments');
});

test('a homepage hash decodes before legacy fallback lookup when Unicode and percent-spelled IDs collide', async ({ fixture, page }) => {
  await page.goto(`${fixture.origin}/#resource-import:material-%C3%A9`);

  await expect(page).toHaveURL(`${fixture.origin}/aprender/#resource-import:material-%C3%A9`);
  await expect(resourceCard(page, unicodeContentId)).toBeVisible();
  await expectFocused(page, unicodeContentId);
});

test('a legacy homepage hash for a country community still redirects to the general community directory', async ({ fixture, page }) => {
  await page.goto(`${fixture.origin}/#resource-community:argentina-%C3%A9`);

  await expect(page).toHaveURL(`${fixture.origin}/comunidades/#resource-community:argentina-%C3%A9`);
  await expect(resourceCard(page, unicodeCommunityId)).toBeVisible();
  await expectFocused(page, unicodeCommunityId);
});

test('a later homepage hashchange redirects a Unicode source link to the source directory', async ({ fixture, page }) => {
  await page.goto(`${fixture.origin}/`);
  await page.evaluate(() => { location.hash = '#resource-source:author-%C3%A9'; });

  await expect(page).toHaveURL(`${fixture.origin}/creadores/#resource-source:author-%C3%A9`);
  await expect(resourceCard(page, unicodeSourceId)).toBeVisible();
  await expectFocused(page, unicodeSourceId);
});

test('unknown and malformed homepage fragments stay put without throwing', async ({ fixture, page }) => {
  for (const fragment of ['#resource-unknown-resource', '#resource-%E0%A4%A']) {
    const expectedUrl = new URL(`/${fragment}`, fixture.origin).href;
    await page.goto(expectedUrl);
    await expect(page).toHaveURL(expectedUrl);
    await expect(page.getByRole('heading', { name: '¿Dónde aprendemos AWS?', exact: true })).toBeVisible();
  }
});

test('prototype-like unknown homepage fragments do not trigger inherited route lookups', async ({ fixture, page }) => {
  const expectedUrl = `${fixture.origin}/#resource-toString`;
  await page.goto(expectedUrl);

  await expect(page).toHaveURL(expectedUrl);
  await expect(page.getByRole('heading', { name: '¿Dónde aprendemos AWS?', exact: true })).toBeVisible();
});

test('the established directory and event homepage hashes keep their redirects', async ({ fixture, page }) => {
  await page.goto(`${fixture.origin}/#directory`);
  await expect(page).toHaveURL(`${fixture.origin}/aprender/`);

  await page.goto(`${fixture.origin}/#eventos`);
  await expect.poll(() => page.evaluate(() => {
    const url = new URL(location.href);
    return `${url.pathname}${url.hash}`;
  })).toBe('/eventos/#eventos');
});

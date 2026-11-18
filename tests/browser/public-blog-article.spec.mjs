import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { startCreatorBrowserApp } from '../fixtures/creator-browser-app.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ARTICLE = 'amazon-cloudfront-comprendiendo-el-cdn-de-aws';
const IMAGE_ARTICLE = 'analisis-de-costos-de-aws-con-cost-explorer';
const PANAMA_RESOURCE_ID = 'meetup-22667715';
const PANAMA_HREF = `/comunidades/panama/#resource-${PANAMA_RESOURCE_ID}`;
const PANAMA_EVENT_ID = 'meetup-event-316732293';
const PANAMA_EVENT_HREF = `/eventos/panama/#event-${PANAMA_EVENT_ID}`;
const PANAMA_GROUP = {
  id: PANAMA_RESOURCE_ID,
  title: 'AWS User Group Panamá',
  url: 'https://www.meetup.com/aws-user-group-panama/',
  description: 'Comunidad AWS de Panamá.',
  category: 'Comunidad',
  kind: 'community',
  format: 'User Group',
  topics: ['Comunidad'],
  country: 'PA',
  order: 50,
  featured: false,
  published: true,
};
const PANAMA_EVENT = {
  recordType: 'event',
  id: PANAMA_EVENT_ID,
  title: 'AWS Community Day Panamá',
  description: 'Encuentro de seguridad y datos.',
  startsAt: '2099-11-14T08:00:00-05:00',
  endsAt: '2099-11-14T13:00:00-05:00',
  timeZone: 'America/Panama',
  organizer: 'AWS User Group Panamá',
  mode: 'in-person',
  place: 'Ciudad de Panamá',
  city: 'Ciudad de Panamá',
  country: 'PA',
  communityId: PANAMA_RESOURCE_ID,
  registrationUrl: 'https://example.com/panama-event',
  published: true,
};

async function withCatalog({ includePanama, retainPanamaEvent = false, removeStudentBuilderGroups = false }, use) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'public-blog-article-'));
  let app;
  try {
    const base = JSON.parse(await readFile(path.join(ROOT, 'tests/fixtures/catalog.json'), 'utf8'));
    const items = base.filter(({ id, format }) => id !== PANAMA_RESOURCE_ID
      && (!removeStudentBuilderGroups || format !== 'Student Builder Group'));
    if (includePanama) items.push(PANAMA_GROUP);
    if (includePanama || retainPanamaEvent) items.push(PANAMA_EVENT);
    const catalogFixture = path.join(temporaryDirectory, 'catalog.json');
    await writeFile(catalogFixture, `${JSON.stringify(items, null, 2)}\n`);
    app = await startCreatorBrowserApp({ catalogFixture });
    await use(app);
  } finally {
    await app?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function articleSnapshot(page) {
  return page.locator('article.blog-article__body').evaluate((body) => ({
    text: body.textContent?.replace(/\s+/gu, ' ').trim(),
    headings: [...body.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) => ({
      tag: heading.tagName,
      id: heading.id,
      text: heading.textContent?.replace(/\s+/gu, ' ').trim(),
    })),
    images: [...body.querySelectorAll('img')].map((image) => ({
      src: image.getAttribute('src'),
      srcset: image.getAttribute('srcset'),
      sizes: image.getAttribute('sizes'),
      alt: image.getAttribute('alt'),
      width: image.getAttribute('width'),
      height: image.getAttribute('height'),
    })),
  }));
}

test('article search uses rendered headings and excludes headings inside fenced code', async ({ page }) => {
  await withCatalog({ includePanama: false }, async (app) => {
    const rawHeading = 'Alta disponibilidad y recuperación ante desastres cubren fallas distintas';
    await page.goto(`${app.origin}/blog/estrategias-de-recuperacion-de-desastres-en-aws/`);
    await expect(page.locator('.blog-article__body h2', { hasText: rawHeading })).toBeVisible();

    await page.goto(`${app.origin}/blog/10-laboratorios-practicos-de-aws-para-principiantes/`);
    const highlightedCode = page.locator('.blog-article__body pre code').first();
    assert.ok(await highlightedCode.locator('span').count() > 0, 'the rendered code retains Shiki token spans');
    assert.ok(await highlightedCode.locator('span[style]').count() > 0, 'the rendered code retains token color styles');

    await page.goto(`${app.origin}/buscar/`);
    await page.locator('#site-type').selectOption('article');
    const input = page.getByLabel('¿Qué quieres aprender?');
    const result = page.locator('[data-search-results] .search-results__result-link');
    await input.fill(rawHeading);
    await input.press('Enter');
    await expect(result).toHaveCount(1);
    await expect(result).toHaveAttribute('href', '/blog/estrategias-de-recuperacion-de-desastres-en-aws/');
    await result.click();
    await expect(page).toHaveURL(`${app.origin}/blog/estrategias-de-recuperacion-de-desastres-en-aws/`);
    await expect(page.locator('.blog-article__body h2', { hasText: rawHeading })).toBeVisible();

    await page.goto(`${app.origin}/buscar/`);
    await page.locator('#site-type').selectOption('article');
    await input.fill('Hola desde AWS');
    await input.press('Enter');
    await expect(page.getByRole('status')).toHaveText('No encontramos resultados. Prueba con otras palabras o elige «Todo el sitio».');
    await expect(result).toHaveCount(0);
  });
});

test('article country links keep the exact route while eligible and fall back after the last group is removed', async ({ page }) => {
  let eligibleSnapshot;
  let eligibleImageSnapshot;
  await withCatalog({ includePanama: true }, async (app) => {
    await page.goto(`${app.origin}/blog/${ARTICLE}/`);
    eligibleSnapshot = await articleSnapshot(page);
    const link = page.getByRole('link', { name: /comunidad en Panamá/iu });
    await expect(link).toHaveAttribute('href', PANAMA_HREF);
    await link.click();
    await expect(page).toHaveURL(`${app.origin}${PANAMA_HREF}`);
    await expect(page.locator(`#resource-${PANAMA_RESOURCE_ID}`)).toBeVisible();
    assert.equal(new URL(page.url()).hash, `#resource-${PANAMA_RESOURCE_ID}`);

    await page.goto(`${app.origin}/blog/amazon-redshift-el-poder-del-data-warehousing-en-aws/`);
    const eventLink = page.getByRole('link', { name: /Agenda de Panamá/iu });
    await expect(eventLink).toHaveAttribute('href', `https://dondeaprendoaws.com${PANAMA_EVENT_HREF}`);
    await page.goto(`${app.origin}${PANAMA_EVENT_HREF}`);
    await expect(page.locator(`#event-${PANAMA_EVENT_ID}`)).toBeVisible();

    await page.goto(`${app.origin}/blog/${IMAGE_ARTICLE}/`);
    eligibleImageSnapshot = await articleSnapshot(page);
    assert.deepEqual(eligibleImageSnapshot.images, [{
      src: '/assets/blog/61560601aa30cbebf1b2815d.jpg',
      alt: 'Cost Explorer',
      srcset: null,
      sizes: null,
      width: null,
      height: null,
    }], 'the authored local body image keeps its independent rendered asset contract');
    assert.ok(eligibleImageSnapshot.headings.some(({ id }) => id === 'antes-de-abrir-cost-explorer-por-primera-vez'),
      'the rendered Markdown heading keeps its stable ID');
  });

  await withCatalog({ includePanama: false }, async (app) => {
    await page.goto(`${app.origin}/blog/${ARTICLE}/`);
    const withdrawnSnapshot = await articleSnapshot(page);
    assert.deepEqual(withdrawnSnapshot, eligibleSnapshot,
      'rewriting a withdrawn destination does not change article text, heading IDs, or image attributes');

    await page.goto(`${app.origin}/blog/${IMAGE_ARTICLE}/`);
    assert.deepEqual(await articleSnapshot(page), eligibleImageSnapshot,
      'catalog rewrites do not change an unrelated article body image or heading IDs');

    await page.goto(`${app.origin}/blog/${ARTICLE}/`);
    const link = page.getByRole('link', { name: /comunidad en Panamá/iu });
    await expect(link).not.toHaveAttribute('href', PANAMA_HREF);
    await link.click();
    await expect(page).toHaveURL(`${app.origin}/comunidades/`);
    await page.waitForLoadState('load');
    assert.equal(await page.locator('main').count(), 1, 'the fallback is a real directory document');
    assert.equal(new URL(page.url()).search, '', 'the withdrawn country filter is not retained');
    assert.equal(new URL(page.url()).hash, '', 'the withdrawn resource fragment is not retained');
    await expect(page.locator('[data-resource-list]')).toBeVisible();
  });

  await withCatalog({ includePanama: false, retainPanamaEvent: true }, async (app) => {
    await page.goto(`${app.origin}/blog/amazon-redshift-el-poder-del-data-warehousing-en-aws/`);
    const eventLink = page.getByRole('link', { name: /Agenda de Panamá/iu });
    const href = await eventLink.getAttribute('href');
    assert.ok(href, 'the event article link remains rendered');
    const target = new URL(href, app.origin);
    assert.equal(target.pathname, '/eventos/', 'the withdrawn country event route falls back to the global agenda');
    assert.equal(target.hash, `#event-${PANAMA_EVENT_ID}`, 'the still-valid global event target is retained');
    await page.goto(`${app.origin}${target.pathname}${target.search}${target.hash}`);
    await expect(page.locator(`#event-${PANAMA_EVENT_ID}`)).toBeVisible();
  });
});

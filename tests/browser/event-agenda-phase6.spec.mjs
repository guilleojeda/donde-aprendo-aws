import assert from 'node:assert/strict';
import testBase, { expect } from '@playwright/test';
import { startBuiltAgendaServer } from '../fixtures/built-agenda-server.mjs';

const runBuiltAgenda = process.env.RUN_BUILT_AGENDA === '1';

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
      expect(errors.map((error) => error.message), `${testInfo.title}: built agenda page errors`).toEqual([]);
    }
  }, { auto: true }],
});
const builtTest = runBuiltAgenda ? test : test.skip;

test.setTimeout(90_000);

const agendaUrl = (origin, query = '') => `${origin}/eventos/${query}`;

/** Run after an isolated build with RUN_BUILT_AGENDA=1; normal browser CI does not require dist. */
builtTest('the built agenda admits the first civil period through navigation, history, view and zone', async ({ app, page }) => {
  await page.goto(agendaUrl(app.origin, '?view=month&date=0001-01-01&tz=UTC'));
  await expect(page.locator('[data-event-period-prev]')).toBeDisabled();
  await expect(page.locator('[data-event-period-next]')).toBeEnabled();
  await page.locator('[data-event-period-next]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('date')).toBe('0001-02-01');
  await page.evaluate(() => history.back());
  await expect.poll(() => new URL(page.url()).searchParams.get('date')).toBe('0001-01-01');
  await expect(page.locator('[data-event-period-prev]')).toBeDisabled();
  await page.locator('[data-event-view="week"]').click();
  await expect(page.locator('[data-event-view="week"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-event-period-prev]')).toBeDisabled();
  await page.locator('[data-event-secondary-disclosure] summary').click();
  await page.locator('[data-event-zone]').selectOption('America/Bogota');
  await expect.poll(() => new URL(page.url()).searchParams.get('tz')).toBe('America/Bogota');
  await expect(page.locator('[data-event-period-prev]')).toBeDisabled();

});

builtTest('the built agenda admits the last civil period and restores its event and arrows through Back', async ({ app, page }) => {
  await page.goto(agendaUrl(app.origin, '?view=month&date=9999-12-31&tz=UTC#event-phase6-last-day'));
  const card = page.locator('#event-phase6-last-day');
  await expect(card).toBeVisible();
  await expect(card).toBeFocused();
  await expect(page.locator('[data-event-period-prev]')).toBeEnabled();
  await expect(page.locator('[data-event-period-next]')).toBeDisabled();
  await page.locator('[data-event-period-prev]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('date')).toBe('9999-11-30');
  await expect(card).toBeHidden();
  await page.evaluate(() => history.back());
  await expect.poll(() => new URL(page.url()).hash).toBe('#event-phase6-last-day');
  await expect(page.locator('[data-event-period-prev]')).toBeEnabled();
  await expect(page.locator('[data-event-period-next]')).toBeDisabled();
  await expect(card).toBeVisible();
});

builtTest('the built agenda restores an initial fragment through period history and admits mode and zone changes', async ({ app, page }) => {
  await page.goto(agendaUrl(app.origin, '?view=month&date=2099-01-01&tz=UTC#event-fixture-event'));
  const card = page.locator('#event-fixture-event');
  await expect(card).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe('event-fixture-event');

  await page.locator('[data-event-period-next]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('date')).toBe('2099-02-01');
  await expect.poll(() => new URL(page.url()).hash).toBe('');
  await page.evaluate(() => history.back());
  await expect.poll(() => new URL(page.url()).searchParams.get('date')).toBe('2099-01-01');
  await expect.poll(() => new URL(page.url()).hash).toBe('#event-fixture-event');
  await expect(card).toBeVisible();
  await expect(page.locator('[data-event-period-next]')).toBeEnabled();

  await page.locator('[data-event-view="week"]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('view')).toBe('week');
  await expect.poll(() => new URL(page.url()).searchParams.get('date')).toBe('2099-01-01');
  await expect(page.locator('[data-event-view="week"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('select[data-event-mode]').selectOption('online');
  await expect.poll(() => new URL(page.url()).searchParams.get('mode')).toBe('online');
  await page.locator('[data-event-secondary-disclosure] summary').click();
  await page.locator('[data-event-zone]').selectOption('America/Bogota');
  await expect.poll(() => new URL(page.url()).searchParams.get('tz')).toBe('America/Bogota');
  await page.locator('select[data-event-mode]').selectOption('in-person');
  await expect.poll(() => new URL(page.url()).searchParams.get('mode')).toBe('in-person');
  await expect(page.locator('#event-fixture-event')).toBeVisible();
});

builtTest('a real built X over-limit failure leaves primary and other share actions usable before recovery', async ({ app, page }) => {
  await page.addInitScript(() => {
    window.__capturedCopies = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText(text) { window.__capturedCopies.push(text); return Promise.resolve(); } },
    });
  });
  const params = new URLSearchParams({
    view: 'month', date: '2099-01-01', tz: 'UTC', mode: 'in-person', country: 'AR', city: 'AR:Córdoba',
  });
  const selectCity = page.locator('select[data-event-city]');
  const menu = page.locator('[data-event-share-menu]');
  const x = page.locator('[data-event-share-x]');
  const linkedin = page.locator('[data-event-share-linkedin]');
  const copy = page.locator('[data-event-share-copy]');
  const count = page.locator('[data-event-count]');
  const event = page.locator('#event-phase6-short-city');

  await page.goto(agendaUrl(app.origin, `?${params}`));
  await expect(count).toHaveText('1 evento');
  await expect(event).toBeVisible();
  await menu.locator('summary').click();
  await expect(x).toBeVisible();

  const impossibleCity = `AR:${'A'.repeat(100)}`;
  await selectCity.selectOption(impossibleCity);
  await expect(count).toHaveText('0 eventos');
  await expect(event).toBeHidden();
  await expect.poll(() => x.getAttribute('href')).toBeNull();
  if (!(await menu.evaluate((details) => details.open))) await menu.locator('summary').click();
  await expect(x).toBeHidden();
  await expect(linkedin).toBeVisible();
  await expect(copy).toBeEnabled();
  const linkedinUrl = new URL(await linkedin.getAttribute('href'));
  assert.equal(linkedinUrl.hostname, 'www.linkedin.com');
  const textUrl = linkedinUrl.searchParams.get('text').split('\n').at(-1);
  assert.equal(new URL(textUrl).searchParams.get('city'), impossibleCity);
  await copy.click();
  await expect.poll(() => page.evaluate(() => window.__capturedCopies.length)).toBe(1);
  const copied = await page.evaluate(() => window.__capturedCopies[0]);
  assert.equal(new URL(copied.split('\n').at(-1)).searchParams.get('city'), impossibleCity);

  await selectCity.selectOption('AR:Córdoba');
  await expect(count).toHaveText('1 evento');
  await expect(event).toBeVisible();
  await expect(event.locator('[data-event-registration]')).toHaveAttribute('href', 'https://example.com/phase6/short-city');
  await expect(event.locator('a[href="/eventos/phase6-short-city.ics"]')).toHaveCount(1);
  if (!(await menu.evaluate((details) => details.open))) await menu.locator('summary').click();
  await expect(x).toBeVisible();
  const recoveredText = new URL(await x.getAttribute('href')).searchParams.get('text');
  assert.equal(new URL(recoveredText.split('\n').at(-1)).searchParams.get('city'), 'AR:Córdoba');

  params.set('city', impossibleCity);
  await page.goto(agendaUrl(app.origin, `?${params}`));
  await expect(selectCity).toHaveValue(impossibleCity);
  await expect(count).toHaveText('0 eventos');
  await menu.locator('summary').click();
  await expect(x).toBeHidden();
  await expect(linkedin).toBeVisible();
  await expect(copy).toBeEnabled();
});

builtTest('built native Copy reports the captured selection after a deferred write and selection change', async ({ app, page }) => {
  await page.addInitScript(() => {
    window.__copyCalls = [];
    window.__copyResolvers = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText(text) {
          window.__copyCalls.push(text);
          return new Promise((resolve) => { window.__copyResolvers.push(resolve); });
        },
      },
    });
  });
  await page.goto(agendaUrl(app.origin, '?view=month&date=2099-01-01&tz=UTC&mode=in-person&country=PE&city=PE%3ALima'));
  await page.locator('[data-event-share-menu] summary').click();
  await page.locator('[data-event-share-copy]').click();
  await expect.poll(() => page.evaluate(() => window.__copyCalls.length)).toBe(1);
  await expect(page.locator('[data-event-share-copy]')).toBeDisabled();

  await page.locator('select[data-event-mode]').selectOption('online');
  await expect(page.locator('[data-event-share-copy]')).toBeDisabled();
  await page.evaluate(() => window.__copyResolvers.shift()?.());
  await expect(page.locator('[data-event-share-status]')).toContainText(/selección anterior|agenda cambió/iu);
  await expect(page.locator('[data-event-share-copy]')).toBeEnabled();

  await page.locator('[data-event-share-menu] summary').click();
  await page.locator('[data-event-share-copy]').click();
  await expect.poll(() => page.evaluate(() => window.__copyCalls.length)).toBe(2);
  const [first, second] = await page.evaluate(() => window.__copyCalls);
  const firstUrl = new URL(first.split('\n').at(-1));
  const secondUrl = new URL(second.split('\n').at(-1));
  assert.match(first, /Encuentro AWS en Lima/u);
  assert.doesNotMatch(first, /Charla de AWS en línea/u);
  assert.match(second, /Charla de AWS en línea/u);
  assert.doesNotMatch(second, /Encuentro AWS en Lima/u);
  assert.equal(firstUrl.searchParams.get('city'), 'PE:Lima');
  assert.equal(firstUrl.searchParams.get('mode'), 'in-person');
  assert.equal(secondUrl.searchParams.get('mode'), 'online');
  assert.equal(secondUrl.searchParams.get('city'), 'PE:Lima', 'online selection keeps the chosen physical city in the URL');
  await page.evaluate(() => window.__copyResolvers.shift()?.());
  await expect(page.locator('[data-event-share-copy]')).toBeEnabled();
});

builtTest('a clipboard denial remains visible by Compartir and the next deliberate copy succeeds', async ({ app, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.copyAttempts = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText(value) {
          window.copyAttempts.push(value);
          if (window.copyAttempts.length === 1) return Promise.reject(new DOMException('Denied', 'NotAllowedError'));
          return Promise.resolve();
        },
      },
    });
  });
  await page.goto(agendaUrl(app.origin, '?view=month&date=2099-01-01&tz=UTC&mode=in-person&country=PE&city=PE%3ALima'));

  const share = page.locator('[data-event-share-controls]');
  const toggle = share.getByText('Compartir', { exact: true });
  const copy = share.getByRole('button', { name: 'Copiar', exact: true });
  const status = share.getByRole('status');
  const errorColor = await status.evaluate((element) => {
    const sample = document.createElement('span');
    sample.style.color = 'var(--color-error-text)';
    element.append(sample);
    const color = getComputedStyle(sample).color;
    sample.remove();
    return color;
  });

  await toggle.focus();
  await toggle.press('Enter');
  await copy.press('Enter');
  await expect(status).toHaveText(/No se pudo copiar.*Inténtalo de nuevo/u);
  await expect.soft(status).toHaveCSS('color', errorColor, { timeout: 2_000 });
  await expect(copy).toBeEnabled();
  await expect(toggle).toBeFocused();
  assert.equal(await page.evaluate(() => window.copyAttempts.length), 1);

  await toggle.press('Escape');
  await expect(copy).toBeHidden();
  await expect(status).toBeVisible();
  const bounds = await status.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390,
    'the entire error message fits inside the viewport');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390,
    'showing the clipboard error does not add horizontal overflow');
  await expect(toggle).toBeFocused();
  await toggle.press('Enter');
  await copy.press('Enter');
  await expect(status).toHaveText('Agenda copiada al portapapeles.');
  await expect(status).not.toHaveCSS('color', errorColor);
  const attempts = await page.evaluate(() => window.copyAttempts);
  assert.equal(attempts.length, 2);
  assert.match(attempts[1], /Encuentro AWS en Lima/u);
  assert.equal(attempts[1], attempts[0], 'the retry copies the same selected agenda');
});

builtTest('an unchanged empty built selection does not mutate retained archive cards on a zone change', async ({ app, page }) => {
  await page.goto(agendaUrl(app.origin, '?view=month&date=2099-02-01&tz=UTC&mode=online'));
  await expect(page.locator('[data-event-count]')).toHaveText('0 eventos');
  assert.ok(await page.locator('[data-event-member-id]').count() >= 240, 'the retained archive is present at representative size');
  await page.evaluate(() => {
    window.__agendaMutationCount = 0;
    const list = document.querySelector('[data-event-list]');
    window.__agendaMutationObserver = new MutationObserver((records) => {
      window.__agendaMutationCount += records.length;
    });
    window.__agendaMutationObserver.observe(list, {
      subtree: true, childList: true, attributes: true, characterData: true,
    });
  });
  await page.locator('[data-event-secondary-disclosure] summary').click();
  await page.locator('[data-event-zone]').selectOption('America/Bogota');
  await expect.poll(() => new URL(page.url()).searchParams.get('tz')).toBe('America/Bogota');
  const mutations = await page.evaluate(() => {
    window.__agendaMutationObserver.disconnect();
    return window.__agendaMutationCount;
  });
  assert.equal(mutations, 0, 'the built archive remains untouched when selection stays empty');
});

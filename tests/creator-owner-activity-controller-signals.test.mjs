import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { ActivityElement, activityBrowser } from './fixtures/creator-owner-activity-browser.mjs';
import { activityReport } from './fixtures/creator-owner-activity.mjs';

const bundle = await build({
  entryPoints: [new URL('../src/scripts/creator-owner-activity.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
}).then(({ outputFiles }) => outputFiles[0].text);

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(predicate(), message);
}

test('summary reports provider limits and labels totals for the selected period', async () => {
  const browser = activityBrowser();
  const totals = new ActivityElement({ attrs: {
    'data-owner-activity-total-group': '',
    'aria-label': 'Totales de los últimos 30 días',
  } });
  browser.activity.append(totals);
  const requests = [];
  const fetch = async (input, init) => {
    const url = new URL(String(input), browser.window.location.origin);
    requests.push({ url, init });
    const period = Number(url.searchParams.get('periodo'));
    return Response.json(activityReport({ period, warnings: [{ section: 'links', code: 'thresholding' }] }));
  };
  browser.window.fetch = fetch;

  runInNewContext(bundle, {
    document: browser.document,
    window: browser.window,
    fetch,
    URL,
    URLSearchParams,
    Headers,
    Response,
    AbortController,
    Element: ActivityElement,
    HTMLElement: ActivityElement,
    setTimeout,
    clearTimeout,
  });

  await waitFor(() => browser.status.textContent.includes('incompletos'), 'provider limitations are visible in activity');
  assert.equal(totals.getAttribute('aria-label'), 'Totales de los últimos 30 días');
  assert.equal(requests[0].init.credentials, 'same-origin');

  browser.periods[0].click();
  await waitFor(() => requests.length === 2 && totals.getAttribute('aria-label') === 'Totales de los últimos 7 días',
    'the accessible totals label follows the selected period');
  await waitFor(() => browser.status.textContent.includes('incompletos'), 'period change retains the provider limitation signal');
  assert.equal(requests[1].url.searchParams.get('periodo'), '7');
  assert.equal(requests[1].url.searchParams.get('pagina'), '1');
});

test('activity begins in the same document when the owner changes from draft to published', async () => {
  const browser = activityBrowser({ profileState: 'draft' });
  const requests = [];
  const fetch = async (input, init) => {
    const url = new URL(String(input), browser.window.location.origin);
    requests.push({ url, init });
    return Response.json(activityReport({ period: Number(url.searchParams.get('periodo')) }));
  };
  browser.window.fetch = fetch;

  runInNewContext(bundle, {
    document: browser.document,
    window: browser.window,
    fetch,
    URL,
    URLSearchParams,
    Headers,
    Response,
    AbortController,
    Element: ActivityElement,
    HTMLElement: ActivityElement,
    setTimeout,
    clearTimeout,
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 0, 'a draft does not start GA activity reads');
  browser.activity.dataset.ownerProfileState = 'published';
  browser.activity.dispatchEvent(new Event('creator-owner:profile-updated'));
  await waitFor(() => browser.totals.views.textContent === '137', 'the published profile loads within the current document');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.searchParams.get('periodo'), '30');
  assert.equal(requests[0].url.searchParams.get('pagina'), '1');
});

test('publishing a draft from the seven-day detail keeps its selected period', async () => {
  const browser = activityBrowser({ profileState: 'draft', search: '?vista=estadisticas&periodo=7&pagina=1' });
  browser.activity.dataset.ownerActivityInitialPeriod = '7';
  const requests = [];
  const fetch = async (input, init) => {
    const url = new URL(String(input), browser.window.location.origin);
    requests.push({ url, init });
    return Response.json(activityReport({ period: Number(url.searchParams.get('periodo')) }));
  };
  browser.window.fetch = fetch;

  runInNewContext(bundle, {
    document: browser.document,
    window: browser.window,
    fetch,
    URL,
    URLSearchParams,
    Headers,
    Response,
    AbortController,
    Element: ActivityElement,
    HTMLElement: ActivityElement,
    setTimeout,
    clearTimeout,
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 0, 'a draft does not start GA activity reads');
  assert.equal(browser.periods[0].getAttribute('aria-pressed'), 'true');
  browser.activity.dataset.ownerProfileState = 'published';
  browser.activity.dispatchEvent(new Event('creator-owner:profile-updated'));
  await waitFor(() => browser.totals.views.textContent === '137', 'publishing loads activity within the current document');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.searchParams.get('periodo'), '7');
  assert.equal(requests[0].url.searchParams.get('pagina'), '1');
  assert.equal(browser.detail.href, '/cuenta/?vista=estadisticas&periodo=7&pagina=1');
});

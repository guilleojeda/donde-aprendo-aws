import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { activityReport } from './fixtures/creator-owner-activity.mjs';
import { ActivityElement, activityBrowser } from './fixtures/creator-owner-activity-browser.mjs';

const controllerPath = new URL('../src/scripts/creator-owner-activity.ts', import.meta.url);
const controllerExists = existsSync(controllerPath);
const controllerBlocker = controllerExists
  ? false
  : 'execution blocked: src/scripts/creator-owner-activity.ts has not been implemented; the behavioral cases remain defined below';
let bundlePromise;

async function controllerBundle() {
  bundlePromise ??= build({
    entryPoints: [controllerPath.pathname],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  }).then(({ outputFiles }) => outputFiles[0].text);
  return bundlePromise;
}

function jsonResponse(value, status = 200) {
  return Response.json(value, { status });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function turn() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await turn();
  }
  assert.ok(predicate(), message);
}

async function mountActivity({ profileState = 'published', creatorId = 'fixture-id-1', search = '', respond } = {}) {
  const browser = activityBrowser({ profileState, creatorId, search });
  const requests = [];
  const fetch = async (input, init = {}) => {
    const base = input instanceof Request ? input : undefined;
    const url = new URL(base?.url ?? String(input), browser.window.location.origin);
    const headers = new Headers(init.headers ?? base?.headers);
    const request = {
      url,
      method: init.method ?? base?.method ?? 'GET',
      credentials: init.credentials ?? base?.credentials,
      headers,
      body: init.body ?? base?.body ?? undefined,
      signal: init.signal ?? base?.signal,
    };
    requests.push(request);
    if (respond) return respond(request, requests.length - 1);
    return jsonResponse(activityReport({ creatorId, period: Number(url.searchParams.get('periodo')), page: Number(url.searchParams.get('pagina')) }));
  };
  browser.window.fetch = fetch;
  runInNewContext(await controllerBundle(), {
    document: browser.document,
    window: browser.window,
    fetch,
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    AbortController,
    Element: ActivityElement,
    HTMLElement: ActivityElement,
    HTMLButtonElement: ActivityElement,
    HTMLAnchorElement: ActivityElement,
    setTimeout,
    clearTimeout,
  });
  return { ...browser, requests };
}

function assertActivityRequest(request, { period = 30, page = 1 } = {}) {
  assert.equal(request.method, 'GET');
  assert.ok(request.credentials === undefined || request.credentials === 'same-origin',
    'fetch keeps the default same-origin session-cookie behavior and never omits credentials');
  assert.equal(request.url.origin, 'https://example.test');
  assert.equal(request.url.pathname, '/api/creador/estadisticas/');
  assert.deepEqual([...request.url.searchParams.keys()].sort(), ['pagina', 'periodo'],
    'the statistics API receives no workspace, search, or navigation query parameters');
  assert.deepEqual(request.url.searchParams.getAll('periodo'), [String(period)]);
  assert.deepEqual(request.url.searchParams.getAll('pagina'), [String(page)]);
  assert.equal(request.body, undefined);
}

function value(browser, name) {
  return browser.totals[name].textContent;
}

function assertDetailLocation(browser, { period = 30, page = 1 } = {}) {
  const url = new URL(browser.detail.href, browser.window.location.origin);
  assert.equal(url.pathname, '/cuenta/');
  assert.deepEqual([...url.searchParams.keys()].sort(), ['pagina', 'periodo', 'vista']);
  assert.equal(url.searchParams.get('vista'), 'estadisticas');
  assert.equal(url.searchParams.get('periodo'), String(period));
  assert.equal(url.searchParams.get('pagina'), String(page));
}

test('bootstrap requires the real owner activity controller and bundles it for a browser VM', async () => {
  assert.ok(controllerExists, 'execution blocked: required src/scripts/creator-owner-activity.ts is absent');
  await controllerBundle();
});

test('published owner requests the default 30-day summary with only statistics query parameters', { skip: controllerBlocker }, async () => {
  const browser = await mountActivity({ search: '?vista=enlaces&pagina=9&buscar=texto-privado' });
  await waitFor(() => browser.requests.length === 1, 'published owner starts one summary request');
  assertActivityRequest(browser.requests[0]);
  await waitFor(() => value(browser, 'views') === '137', 'valid report is rendered after the request resolves');
  assertDetailLocation(browser, { period: 30, page: 1 });
});

test('summary renders the three provider totals and the actual report date range', { skip: controllerBlocker }, async () => {
  const browser = await mountActivity();
  await waitFor(() => value(browser, 'clicks') === '43', 'report totals are rendered');
  assert.equal(value(browser, 'views'), '137');
  assert.equal(value(browser, 'visitors'), '19');
  assert.equal(browser.rangeStart.getAttribute('datetime'), '2026-09-28');
  assert.equal(browser.rangeEnd.getAttribute('datetime'), '2026-10-27');
});

test('switching periods requests page one and updates the canonical detail link', { skip: controllerBlocker }, async () => {
  const browser = await mountActivity();
  await waitFor(() => browser.requests.length === 1, 'initial summary request starts');
  await waitFor(() => value(browser, 'views') === '137', 'initial report resolves');

  browser.periods[0].click();
  await waitFor(() => browser.requests.length === 2, 'selecting seven days requests a new summary');
  assertActivityRequest(browser.requests[1], { period: 7, page: 1 });
  await waitFor(() => browser.rangeStart.getAttribute('datetime') === '2026-10-21', 'seven-day range is applied');
  assertDetailLocation(browser, { period: 7, page: 1 });

  browser.periods[1].click();
  await waitFor(() => browser.requests.length === 3, 'selecting thirty days requests that period again');
  assertActivityRequest(browser.requests[2], { period: 30, page: 1 });
  await waitFor(() => browser.rangeStart.getAttribute('datetime') === '2026-09-28', 'thirty-day range is restored');
  assertDetailLocation(browser, { period: 30, page: 1 });
});

test('a late response for the former period cannot replace the newly selected period', { skip: controllerBlocker }, async () => {
  const pending = new Map();
  const browser = await mountActivity({ respond: (request) => {
    const period = Number(request.url.searchParams.get('periodo'));
    const response = deferred();
    pending.set(period, response);
    return response.promise;
  } });
  await waitFor(() => browser.requests.length === 1, 'default request starts');
  browser.periods[0].click();
  await waitFor(() => browser.requests.length === 2, 'seven-day request starts after selection');

  pending.get(7).resolve(jsonResponse(activityReport({ period: 7, totals: { views: 7, visitors: 3, clicks: 2 } })));
  await waitFor(() => value(browser, 'views') === '7', 'selected report is applied first');
  pending.get(30).resolve(jsonResponse(activityReport({ period: 30, totals: { views: 30, visitors: 4, clicks: 5 } })));
  await turn();

  assert.equal(value(browser, 'views'), '7');
  assert.equal(browser.rangeStart.getAttribute('datetime'), '2026-10-21');
  assertDetailLocation(browser, { period: 7, page: 1 });
  assertActivityRequest(browser.requests[0], { period: 30, page: 1 });
  assertActivityRequest(browser.requests[1], { period: 7, page: 1 });
});

test('foreign creator, wrong period, wrong page, and malformed reports are not rendered as valid', { skip: controllerBlocker }, async (t) => {
  const malformedReports = [
    ['another creator', activityReport({ creatorId: 'someone-else', totals: { views: 901, visitors: 8, clicks: 3 } })],
    ['wrong period', activityReport({ period: 7, totals: { views: 902, visitors: 8, clicks: 3 } })],
    ['wrong page', activityReport({ page: 2, totals: { views: 903, visitors: 8, clicks: 3 } })],
    ['malformed DTO', { ...activityReport(), daily: [{ date: 'not-a-date', views: 904, clicks: 3 }] }],
  ];
  for (const [label, report] of malformedReports) {
    await t.test(label, async () => {
      const browser = await mountActivity({ respond: () => jsonResponse(report) });
      await waitFor(() => /no pudimos|no se pudo|error|inválid|no.*disponible/iu.test(browser.status.textContent)
        && !/cargando/iu.test(browser.status.textContent),
        'invalid response replaces the loading state with feedback');
      assert.notEqual(value(browser, 'views'), String(report.totals?.views), 'unvalidated total is not shown as valid');
      assert.notEqual(value(browser, 'visitors'), String(report.totals?.visitors));
      assert.notEqual(value(browser, 'clicks'), String(report.totals?.clicks));
    });
  }
});

test('null metrics stay distinct from measured zero, and stale reports retain their update date', { skip: controllerBlocker }, async (t) => {
  await t.test('unknown metrics do not become zero', async () => {
    const browser = await mountActivity({ respond: () => jsonResponse(activityReport({
      totals: { views: null, visitors: 0, clicks: null },
    })) });
    await waitFor(() => value(browser, 'visitors') === '0', 'measured zero is rendered');
    assert.notEqual(value(browser, 'views'), '0');
    assert.notEqual(value(browser, 'clicks'), '0');
    assert.ok(value(browser, 'views').length > 0, 'unknown metric has a visible nonzero placeholder');
  });

  await t.test('stale data keeps its actual range and update timestamp with a brief signal', async () => {
    const startDate = '2026-09-27';
    const daily = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(Date.parse(`${startDate}T00:00:00.000Z`) + index * 86_400_000).toISOString().slice(0, 10);
      return { date, views: date < '2026-10-23' ? null : 0, clicks: date < '2026-10-23' ? null : 0 };
    });
    daily.at(-1).views = 137;
    daily.at(-1).clicks = 43;
    const browser = await mountActivity({ respond: () => jsonResponse(activityReport({
      freshness: 'stale',
      range: { startDate, endDate: daily.at(-1).date, timeZone: 'America/Argentina/Buenos_Aires' },
      daily,
      updatedAt: '2026-10-26T12:00:00.000Z',
    })) });
    await waitFor(() => value(browser, 'views') === '137', 'retained report is rendered');
    assert.equal(browser.rangeStart.getAttribute('datetime'), '2026-09-27');
    assert.equal(browser.rangeEnd.getAttribute('datetime'), '2026-10-26');
    assert.equal(browser.updated.getAttribute('datetime'), '2026-10-26T12:00:00.000Z');
    assert.notEqual(browser.rangeEnd.getAttribute('datetime'), '2026-10-27', 'stale range is not replaced with the current fixture window');
    assert.match(browser.status.textContent, /desactualiz|no .*actualiz|retenid|anterior/iu,
      'stale figures have a brief visible freshness signal');
  });
});

test('loading and failure feedback stay inside activity and leave editing available', { skip: controllerBlocker }, async () => {
  const response = deferred();
  const browser = await mountActivity({ respond: () => response.promise });
  await waitFor(() => browser.requests.length === 1, 'initial request starts');
  assert.ok(browser.activity.querySelector('[data-owner-activity-status]'));
  assert.match(browser.status.textContent, /carg/iu);
  assert.equal(browser.edit.disabled, false);
  response.resolve(new Response('temporarily unavailable', { status: 503 }));
  await waitFor(() => /no pudimos|no se pudo|error/iu.test(browser.status.textContent), 'activity shows the request failure');
  assert.equal(browser.status.parentElement, browser.activity);
  assert.equal(browser.edit.disabled, false, 'statistics do not disable profile editing');
  assert.ok([...Object.values(browser.totals)].every((item) => item.textContent !== '0'),
    'loading/failure does not invent zero totals');
});

test('503, malformed JSON, 401, and 403 retain unknown values and retry locally without mutations or reload', { skip: controllerBlocker }, async (t) => {
  const failures = [
    ['503', () => new Response('unavailable', { status: 503 })],
    ['malformed JSON', () => new Response('{broken', { status: 200, headers: { 'content-type': 'application/json' } })],
    ['401', () => new Response('', { status: 401 })],
    ['403', () => new Response('', { status: 403 })],
    ['network rejection', () => Promise.reject(new Error('offline'))],
  ];
  for (const [label, fail] of failures) {
    await t.test(label, async () => {
      const browser = await mountActivity({
        search: '?vista=enlaces&pagina=9&buscar=texto-privado',
        respond: (_request, index) => index === 0 ? fail() : jsonResponse(activityReport()),
      });
      const initialHref = browser.window.location.href;
      await waitFor(() => browser.requests.length === 1, 'one automatic GET starts');
      assertActivityRequest(browser.requests[0]);
      await waitFor(() => /no pudimos|no se pudo|error|sesión|acceso/iu.test(browser.status.textContent), 'failure is reported in activity');
      assert.equal(browser.requests.length, 1, 'failure does not trigger automatic retry or another request');
      assert.ok([...Object.values(browser.totals)].every((item) => item.textContent !== '0'),
        'failed response never becomes fabricated zeros');
      assert.equal(browser.edit.disabled, false);
      assert.equal(browser.retry.hidden, false, 'local retry action is available');

      browser.retry.click();
      await waitFor(() => browser.requests.length === 2, 'manual retry starts a second request');
      assertActivityRequest(browser.requests[1]);
      await waitFor(() => value(browser, 'views') === '137', 'manual retry can load the report');
      assert.deepEqual(browser.requests.map(({ method }) => method), ['GET', 'GET']);
      assert.equal(browser.window.location.reloadCount, 0, 'retry does not reload the workspace');
      assert.equal(browser.window.location.href, initialHref, 'retry preserves the original owner view and its management query');
    });
  }
});

test('no-profile and draft states do not request historical statistics or show fabricated totals', { skip: controllerBlocker }, async (t) => {
  for (const profileState of ['none', 'draft']) {
    await t.test(profileState, async () => {
      const browser = await mountActivity({ profileState });
      await turn();
      assert.equal(browser.requests.length, 0);
      assert.ok([...Object.values(browser.totals)].every((item) => item.textContent !== '0'));
    });
  }
});

test('a hidden published profile still requests its historical activity', { skip: controllerBlocker }, async () => {
  const browser = await mountActivity({ profileState: 'hidden' });
  await waitFor(() => browser.requests.length === 1, 'hidden published profile requests summary');
  assertActivityRequest(browser.requests[0], { period: 30, page: 1 });
  await waitFor(() => value(browser, 'views') === '137', 'historical activity is applied');
});

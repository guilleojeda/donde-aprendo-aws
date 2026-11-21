import assert from 'node:assert/strict';
import {
  test,
  expect,
  api,
  addCookie,
  readOwnerSnapshot,
  loggedInOwner,
  captureCreatorApi,
} from '../fixtures/creator-browser-test.mjs';

const SUMMARY_PATH = '/api/creador/estadisticas/resumen/';

async function assertDetail(page, period) {
  await page.locator('[data-owner-activity-detail]').click();
  await expect(page).toHaveURL((url) => url.searchParams.get('vista') === 'estadisticas'
    && url.searchParams.get('periodo') === String(period)
    && url.searchParams.get('pagina') === '1');
  const detail = page.locator('[data-owner-statistics]');
  const totals = period === 7 ? ['5', '3', '8'] : ['12', '6', '20'];
  await expect(detail).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(detail.locator('select[name="periodo"]')).toHaveValue(String(period));
  await expect(detail.locator('[data-owner-activity-total="views"]')).toHaveText(totals[0]);
  await expect(detail.locator('[data-owner-activity-total="visitors"]')).toHaveText(totals[1]);
  await expect(detail.locator('[data-owner-activity-total="clicks"]')).toHaveText(totals[2]);
}

async function publishOwner(fixture, cookie) {
  const owner = await readOwnerSnapshot(fixture, cookie);
  return api(fixture, cookie, '/api/creador/perfil/publicar', {
    method: 'POST', body: { creatorVersion: owner.creatorVersion },
  });
}

function statisticsReport(request, rows, metricNames = request.metrics.map(({ name }) => name)) {
  const dimensions = request.dimensions?.map(({ name }) => name) ?? [];
  return {
    dimensionHeaders: dimensions.map((name) => ({ name })),
    metricHeaders: metricNames.map((name) => ({ name, type: 'TYPE_INTEGER' })),
    rows: rows.map(({ dimensions: values, metrics }) => ({
      dimensionValues: values.map((value) => ({ value })),
      metricValues: metrics.map((value) => ({ value: String(value) })),
    })),
    rowCount: rows.length,
    metadata: { timeZone: 'America/Los_Angeles' },
    propertyQuota: { tokensPerHour: { consumed: 1, remaining: 39_999 } },
  };
}

function queryDays(request) {
  const { startDate, endDate } = request.dateRanges[0];
  const relativeStart = /^(\d+)daysAgo$/.exec(startDate);
  if (relativeStart && endDate === 'today') return Number(relativeStart[1]) + 1;
  return (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1;
}

function expandedStatisticsResponse(body) {
  const reportFor = (request) => {
    const dimensions = request.dimensions?.map(({ name }) => name) ?? [];
    const period = queryDays(request);
    if (dimensions.includes('date')) {
      const start = new Date(Date.UTC(2026, period === 30 ? 8 : 9, period === 30 ? 24 : 17));
      const rows = [];
      for (let index = 0; index < period; index += 1) {
        const date = new Date(start);
        date.setUTCDate(date.getUTCDate() + index);
        const value = date.toISOString().slice(0, 10).replaceAll('-', '');
        rows.push({ dimensions: [value, 'creator_view'], metrics: [2] });
        rows.push({ dimensions: [value, 'creator_link_click'], metrics: [3] });
      }
      return statisticsReport(request, rows);
    }
    if (dimensions.includes('customEvent:link_id')) {
      const offset = Number(request.offset ?? 0);
      const totalRows = 101;
      const count = Math.min(100, totalRows - offset);
      const rows = Array.from({ length: count }, (_, index) => ({
        dimensions: ['content-' + (offset + index)],
        metrics: [index + 1],
      }));
      const report = statisticsReport(request, rows);
      return { ...report, rowCount: totalRows };
    }
    if (dimensions.includes('sessionSourceMedium')) {
      return statisticsReport(request, [{ dimensions: ['example / referral'], metrics: [4] }]);
    }
    if (request.metrics.some(({ name }) => name === 'totalUsers')) {
      return statisticsReport(request, [{ dimensions: [], metrics: [12, 6] }]);
    }
    return statisticsReport(request, [{ dimensions: [], metrics: [20] }]);
  };
  if (Array.isArray(body.requests)) return { reports: body.requests.map(reportFor) };
  return reportFor(body);
}

test('el resumen real de 7 y 30 días abre cada informe privado con los mismos datos GA4', async ({ fixture, page, browser }) => {
  const cookie = await loggedInOwner(fixture, page);
  const published = await publishOwner(fixture, cookie);
  assert.equal(published.response.status, 200);
  const publishedOwner = await fixture.rawOwner(cookie);
  assert.equal(publishedOwner.profile.published, true);

  const summaryResponses = [];
  const summaryCaptureFailures = [];
  const captureSummaryResponse = async (route) => {
    let response;
    try {
      const url = new URL(route.request().url());
      const period = Number(url.searchParams.get('periodo'));
      response = await route.fetch();
      const rawBody = await response.body();
      summaryResponses.push({
        period,
        pathname: url.pathname,
        query: [...url.searchParams.keys()],
        status: response.status(),
        headers: response.headers(),
        body: JSON.parse(rawBody.toString('utf8')),
      });
    } catch (error) {
      summaryCaptureFailures.push(error);
      if (response) await route.fulfill({ response }).catch(() => {});
      else await route.abort().catch(() => {});
      return;
    }
    try {
      await route.fulfill({ response });
    } catch (error) {
      summaryCaptureFailures.push(error);
      await route.abort().catch(() => {});
    }
  };
  await page.route('**/api/creador/estadisticas/**', captureSummaryResponse);
  const beforeColdSummary = fixture.statistics.requests.length;
  await page.goto(`${fixture.origin}/cuenta/?vista=series&paginaSeries=1`);
  const summary = page.locator('[data-owner-activity]');
  await expect(summary).toBeVisible();
  await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('12');
  await expect(summary.locator('[data-owner-activity-total="visitors"]')).toHaveText('6');
  await expect(summary.locator('[data-owner-activity-total="clicks"]')).toHaveText('20');
  assert.ok(summaryResponses.length > 0, 'the published Series view requested the real summary endpoint');
  assert.ok(summaryResponses.every(({ period }) => period === 30), 'initial summary reads ask for 30 days');
  const initialReport = summaryResponses.find(({ period, status, body }) => period === 30 && status === 200
    && body.creatorId === publishedOwner.profile.id);
  assert.ok(initialReport, 'a real initial response contains the published profile report');
  assert.match(initialReport.headers['cache-control'] ?? '', /private.*no-store/i);
  assert.deepEqual(initialReport.body.totals, { views: 12, visitors: 6, clicks: 20 });
  const coldSummaryReports = fixture.statistics.requests.slice(beforeColdSummary)
    .flatMap((call) => call.requests ?? [call]);
  await expect(summary.locator('[data-owner-activity-period="30"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(summary.locator('[data-owner-activity-total-group]'))
    .toHaveAttribute('aria-label', 'Totales de los últimos 30 días');
  await expect(summary.locator('[data-owner-activity-detail]')).toHaveAttribute('href', '/cuenta/?vista=estadisticas&periodo=30&pagina=1#creator-statistics-title');

  const beforeSevenDayAction = summaryResponses.length;
  await summary.locator('[data-owner-activity-period="7"]').click();
  await expect(summary.locator('[data-owner-activity-period="7"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(summary.locator('[data-owner-activity-total-group]'))
    .toHaveAttribute('aria-label', 'Totales de los últimos 7 días');
  await expect(summary.locator('[data-owner-activity-detail]')).toHaveAttribute('href', '/cuenta/?vista=estadisticas&periodo=7&pagina=1#creator-statistics-title');
  await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('5');
  const sevenDayReports = summaryResponses.slice(beforeSevenDayAction).filter(({ period }) => period === 7);
  assert.ok(sevenDayReports.length > 0, 'selecting 7 days issued a real statistics request');
  assert.ok(sevenDayReports.some(({ status, body }) => status === 200
    && body.period === 7 && body.totals.views === 5 && body.totals.visitors === 3 && body.totals.clicks === 8),
  'the 7-day request returned the period-specific GA4 report');
  await assertDetail(page, 7);

  const beforeReturnThirtyDayAction = summaryResponses.length;
  await page.goto(`${fixture.origin}/cuenta/?vista=series&paginaSeries=1`);
  await expect(page.locator('[data-owner-activity]')).toBeVisible();
  const reloadedSummary = page.locator('[data-owner-activity]');
  await expect(reloadedSummary.locator('[data-owner-activity-period="30"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(reloadedSummary.locator('[data-owner-activity-total-group]'))
    .toHaveAttribute('aria-label', 'Totales de los últimos 30 días');
  await expect(reloadedSummary.locator('[data-owner-activity-total="views"]')).toHaveText('12');
  await expect(reloadedSummary.locator('[data-owner-activity-total="visitors"]')).toHaveText('6');
  await expect(reloadedSummary.locator('[data-owner-activity-total="clicks"]')).toHaveText('20');
  const returnedThirtyDayReports = summaryResponses.slice(beforeReturnThirtyDayAction).filter(({ period }) => period === 30);
  assert.ok(returnedThirtyDayReports.length > 0, 'returning to the summary issued a real 30-day statistics request');
  assert.ok(returnedThirtyDayReports.some(({ status, body }) => status === 200
    && body.period === 30 && body.totals.views === 12 && body.totals.visitors === 6 && body.totals.clicks === 20),
  'the returned 30-day request kept its distinct GA4 totals');
  await assertDetail(page, 30);

  const providerPeriods = fixture.statistics.requests.flatMap(({ requests }) => requests.map(queryDays));
  assert.ok(providerPeriods.includes(7), 'the real GA4 reader fetched the 7-day period');
  assert.ok(providerPeriods.includes(30), 'the real GA4 reader fetched the 30-day period');
  assert.deepEqual(summaryCaptureFailures, [], 'the route observer captures each real response before returning it unchanged');
  await page.unroute('**/api/creador/estadisticas/**', captureSummaryResponse);

  // Put the split-operation assertions after both working detail journeys so
  // the baseline measures what it really reads and preserves.
  assert.deepEqual(coldSummaryReports.map(({ dimensions }) => dimensions?.map(({ name }) => name) ?? []), [[], []],
    'a cold summary performs two totals reports without fetching any detail');
  for (const { pathname, query, body, headers } of summaryResponses) {
    assert.equal(pathname, SUMMARY_PATH);
    assert.deepEqual(query, ['periodo']);
    assert.match(headers['x-robots-tag'] ?? '', /noindex/i);
    for (const key of ['page', 'daily', 'links', 'sources']) assert.ok(!Object.hasOwn(body, key), key);
  }
  const rejectedQuery = await page.request.get(fixture.origin + SUMMARY_PATH + '?pagina=1');
  assert.equal(rejectedQuery.status(), 400);
  assert.match(rejectedQuery.headers()['cache-control'] ?? '', /private.*no-store/i);
  assert.match(rejectedQuery.headers()['x-robots-tag'] ?? '', /noindex/i);

  const visitor = await browser.newContext();
  try {
    const anonymous = await visitor.request.get(fixture.origin + SUMMARY_PATH);
    assert.equal(anonymous.status(), 401);
    assert.match(anonymous.headers()['cache-control'] ?? '', /private.*no-store/i);
    assert.match(anonymous.headers()['x-robots-tag'] ?? '', /noindex/i);
  } finally {
    await visitor.close();
  }
});

test('el formulario y la paginación del informe funcionan sin JavaScript', async ({ fixture, page, browser }) => {
  const cookie = await loggedInOwner(fixture, page);
  const published = await publishOwner(fixture, cookie);
  assert.equal(published.response.status, 200);

  const noJsContext = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
  try {
    await addCookie(noJsContext, fixture, cookie);
    fixture.statistics.setProviderResponder(({ body }) => expandedStatisticsResponse(body));
    const noJsPage = await noJsContext.newPage();
    const reportPage = (pageNumber) => (url) => url.pathname === '/cuenta/'
      && url.searchParams.get('vista') === 'estadisticas'
      && url.searchParams.get('periodo') === '30'
      && url.searchParams.get('pagina') === String(pageNumber);
    await noJsPage.goto(fixture.origin + '/cuenta/?vista=estadisticas&periodo=30&pagina=2');
    const detail = noJsPage.locator('[data-owner-statistics]');
    await expect(detail).toBeVisible();
    await expect(detail.locator('select[name="periodo"]')).toHaveValue('30');
    const savedDate = noJsPage.locator('tr').filter({ has: noJsPage.locator('time[datetime="2026-10-23"]') });
    await expect(savedDate.locator('td').nth(0)).toHaveText('2');
    await expect(savedDate.locator('td').nth(1)).toHaveText('3');
    await expect(detail.getByRole('link', { name: 'Anterior', exact: true })).toBeVisible();
    await expect(detail.getByRole('link', { name: 'Siguiente', exact: true })).toHaveCount(0);
    await detail.getByRole('link', { name: 'Anterior', exact: true }).click();
    await expect(noJsPage).toHaveURL(reportPage(1));
    await expect(detail.getByText('content-0', { exact: true })).toBeVisible();
    await expect(detail.getByText('content-100', { exact: true })).toHaveCount(0);
    await expect(noJsPage.getByRole('link', { name: 'Siguiente', exact: true })).toBeVisible();
    await noJsPage.getByRole('link', { name: 'Siguiente', exact: true }).click();
    await expect(noJsPage).toHaveURL(reportPage(2));
    await expect(detail.getByText('content-100', { exact: true })).toBeVisible();
    await expect(detail.getByText('content-0', { exact: true })).toHaveCount(0);
    await noJsPage.goto(fixture.origin + '/cuenta/?vista=estadisticas&periodo=7&pagina=2');
    await expect(noJsPage.locator('[data-owner-statistics] select[name="periodo"]')).toHaveValue('7');
    await noJsPage.locator('[data-owner-statistics] select[name="periodo"]').selectOption('30');
    await noJsPage.getByRole('button', { name: 'Ver período', exact: true }).click();
    await expect(noJsPage).toHaveURL(reportPage(1));
    await expect(noJsPage.locator('[data-owner-statistics] select[name="periodo"]')).toHaveValue('30');
    await expect(noJsPage.locator('[data-owner-activity-total="views"]')).toHaveText('12');
    const dailyRows = noJsPage.locator('table').filter({ hasText: 'Fecha' }).locator('tbody tr');
    await expect(dailyRows).toHaveCount(30);
  } finally {
    fixture.statistics.setProviderResponder(undefined);
    await noJsContext.close();
  }
});

test('la respuesta anterior no reemplaza el período elegido aunque su JSON termine de leerse después', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const published = await publishOwner(fixture, cookie);
  assert.equal(published.response.status, 200);

  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    let held = false;
    window.fetch = async (input, init) => {
      const response = await nativeFetch(input, init);
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      if (!held && url.pathname.startsWith('/api/creador/estadisticas')
        && url.searchParams.get('periodo') === '30') {
        held = true;
        const readJson = response.json.bind(response);
        Object.defineProperty(response, 'json', {
          configurable: true,
          value: async (...args) => {
            window.__ownerActivityThirtyBodyStarted = true;
            await new Promise((resolve) => { window.__releaseOwnerActivityThirtyBody = resolve; });
            try {
              const value = await readJson(...args);
              window.__ownerActivityThirtyBodyViews = value.totals?.views;
              return value;
            } finally {
              window.__ownerActivityThirtyBodyFinished = true;
            }
          },
        });
      }
      return response;
    };
  });

  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  await page.waitForFunction(() => window.__ownerActivityThirtyBodyStarted === true);
  const summary = page.locator('[data-owner-activity]');
  await expect(summary.locator('[data-owner-activity-status]')).toContainText(/Cargando estadísticas/u);
  await page.getByRole('button', { name: 'Editar datos' }).click();
  const edit = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
  await expect(edit).toBeVisible();
  await edit.getByLabel('Nombre visible').fill('Edición guardada mientras carga actividad');
  const saved = page.waitForResponse((response) => response.request().method() === 'PUT'
    && new URL(response.url()).pathname.replace(/\/$/u, '') === '/api/creador/perfil');
  await edit.getByRole('button', { name: 'Guardar datos' }).click();
  assert.equal((await saved).status(), 200);
  await expect(edit).not.toBeVisible();
  assert.equal((await fixture.rawOwner(cookie)).profile.displayName, 'Edición guardada mientras carga actividad');
  assert.equal(await page.evaluate(() => window.__ownerActivityThirtyBodyFinished === true), false,
    'saving persists while the original report body is still pending');
  await summary.locator('[data-owner-activity-period="7"]').click();
  await expect(summary.locator('[data-owner-activity-period="7"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(summary.locator('[data-owner-activity-total-group]'))
    .toHaveAttribute('aria-label', 'Totales de los últimos 7 días');
  await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('5');
  await expect(summary.locator('[data-owner-activity-total="visitors"]')).toHaveText('3');
  await expect(summary.locator('[data-owner-activity-total="clicks"]')).toHaveText('8');

  await page.evaluate(() => window.__releaseOwnerActivityThirtyBody());
  await page.waitForFunction(() => window.__ownerActivityThirtyBodyFinished === true);
  assert.equal(await page.evaluate(() => window.__ownerActivityThirtyBodyViews), 12,
    'the delayed body was the real 30-day response, not a synthetic result');
  await expect(summary.locator('[data-owner-activity-period="7"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(summary.locator('[data-owner-activity-total-group]'))
    .toHaveAttribute('aria-label', 'Totales de los últimos 7 días');
  await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('5');
  await expect(summary.locator('[data-owner-activity-total="visitors"]')).toHaveText('3');
  await expect(summary.locator('[data-owner-activity-total="clicks"]')).toHaveText('8');
  await expect(summary.locator('[data-owner-activity-detail]'))
    .toHaveAttribute('href', '/cuenta/?vista=estadisticas&periodo=7&pagina=1#creator-statistics-title');

  const providerPeriods = fixture.statistics.requests.flatMap(({ requests }) => requests.map(queryDays));
  assert.ok(providerPeriods.includes(7));
  assert.ok(providerPeriods.includes(30));
});

test('creador, período, rango y totales inválidos quedan sin cifras hasta un reintento, mientras la edición sigue disponible', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const published = await publishOwner(fixture, cookie);
  assert.equal(published.response.status, 200);
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  const mutations = [];
  const recordMutation = (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) mutations.push(request.method());
  };
  page.on('request', recordMutation);

  const invalidations = [
    ['creator ajeno', (body) => { body.creatorId = 'otro-creador'; }],
    ['período ajeno', (body) => { body.period = 7; }],
    ['rango inválido', (body) => { body.range.startDate = 'fecha-inválida'; }],
    ['totales inválidos', (body) => { body.totals.clicks = -1; }],
  ];

  try {
    for (const [label, invalidate] of invalidations) {
      let statisticsResponses = 0;
      const alterFirstResponse = async (route) => {
        const response = await route.fetch();
        statisticsResponses += 1;
        if (statisticsResponses !== 1) {
          await route.fulfill({ response });
          return;
        }
        const body = await response.json();
        invalidate(body);
        await route.fulfill({ response, body: JSON.stringify(body) });
      };
      await page.route('**/api/creador/estadisticas/**', alterFirstResponse);
      await page.goto(`${fixture.origin}/cuenta/?vista=series`);
      const summary = page.locator('[data-owner-activity]');
      const status = summary.locator('[data-owner-activity-status]');
      await expect(status, label).toContainText(/no pudimos validar|no pudimos cargar/iu);
      await expect(summary.locator('[data-owner-activity-total="views"]')).not.toHaveText(/^(12|901|902|903|904)$/u);
      await expect(summary.locator('[data-owner-activity-total="visitors"]')).not.toHaveText('6');
      await expect(summary.locator('[data-owner-activity-total="clicks"]')).not.toHaveText('20');
      await expect(summary.locator('[data-owner-activity-retry]')).toBeVisible();
      assert.equal(await page.getByRole('button', { name: 'Editar datos' }).isEnabled(), true,
        'an invalid statistics response does not disable profile editing');

      if (label === 'creator ajeno') {
        await page.getByRole('button', { name: 'Editar datos' }).click();
        const form = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
        await expect(form).toBeVisible();
        await form.getByLabel('Nombre visible').fill('Edición disponible durante el fallo');
        await form.getByRole('button', { name: 'Guardar datos' }).click();
        await capture.settle();
        const write = capture.writes().find(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
        assert.equal(write?.status, 200, 'the real profile edit completes while the invalid report is rejected');
        assert.equal((await fixture.rawOwner(cookie)).profile.displayName, 'Edición disponible durante el fallo');
      }

      const responsesBeforeRetry = statisticsResponses;
      await summary.locator('[data-owner-activity-retry]').click();
      await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('12');
      await expect(summary.locator('[data-owner-activity-total="visitors"]')).toHaveText('6');
      await expect(summary.locator('[data-owner-activity-total="clicks"]')).toHaveText('20');
      assert.ok(statisticsResponses > responsesBeforeRetry,
        `${label}: the explicit retry performs a valid read after the rejected body`);
      assert.equal(new URL(page.url()).searchParams.get('vista'), 'series', `${label}: retry stays in the owner view`);
      await page.unroute('**/api/creador/estadisticas/**', alterFirstResponse);
    }
    assert.deepEqual(mutations, ['PUT'], 'retry never writes; only the explicit profile edit mutates data');
  } finally {
    page.off('request', recordMutation);
    await capture.stop();
    await page.unroute('**/api/creador/estadisticas/**').catch(() => {});
  }
});

test('una lectura fallida del resumen se corrige en Actividad y reintenta solamente el período elegido', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  assert.equal((await publishOwner(fixture, cookie)).response.status, 200);
  const saved = await readOwnerSnapshot(fixture, cookie);
  const capture = await captureCreatorApi(page);
  let available = false;
  fixture.statistics.setProviderResponder(({ body }) => {
    if (!available && (body.requests ?? [body]).some((request) => queryDays(request) === 7)) {
      return new Response(null, { status: 503 });
    }
    return undefined;
  });

  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const summary = page.getByRole('region', { name: 'Estadísticas de tu página' });
  await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('12');
  const failed = page.waitForResponse((response) => new URL(response.url()).pathname === SUMMARY_PATH
    && new URL(response.url()).searchParams.get('periodo') === '7');
  await summary.getByRole('button', { name: '7 días', exact: true }).press('Enter');
  assert.equal((await failed).status(), 503);

  const status = summary.getByRole('status').filter({ hasText: 'No pudimos cargar las estadísticas' });
  await expect(status).toBeVisible();
  await expect(summary.getByRole('button', { name: '7 días', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(summary.locator('[data-owner-activity-total]')).toHaveText(['—', '—', '—']);
  const retry = summary.getByRole('button', { name: 'Reintentar', exact: true });
  await expect(retry).toBeVisible();
  assert.equal(await page.getByText('No pudimos cargar las estadísticas', { exact: false }).count(), 1);
  const color = await status.evaluate((element) => {
    const sample = document.createElement('span');
    sample.hidden = true;
    sample.style.color = 'var(--color-error-text)';
    element.append(sample);
    const colors = [getComputedStyle(element).color, getComputedStyle(sample).color];
    sample.remove();
    return colors;
  });

  available = true;
  const recovered = page.waitForResponse((response) => new URL(response.url()).pathname === SUMMARY_PATH
    && new URL(response.url()).searchParams.get('periodo') === '7');
  await retry.press('Enter');
  assert.equal((await recovered).status(), 200);
  await expect(summary.locator('[data-owner-activity-total]')).toHaveText(['5', '3', '8']);
  await expect(status).toHaveCount(0);
  await capture.settle();
  const summaryReads = capture.records.filter(({ path }) => path === SUMMARY_PATH.replace(/\/$/u, ''));
  assert.deepEqual(summaryReads.map(({ status }) => status), [200, 503, 200]);
  assert.deepEqual(capture.writes(), []);
  assert.deepEqual(await readOwnerSnapshot(fixture, cookie), saved);
  assert.equal(color[0], color[1], 'el fallo de Actividad usa el color semántico de error');
});

test('el detalle inválido permite corregir la consulta y un 503 conserva período y página al reintentar sin JavaScript', async ({ fixture, page, publicPage }) => {
  const cookie = await loggedInOwner(fixture, page);
  assert.equal((await publishOwner(fixture, cookie)).response.status, 200);
  const saved = await readOwnerSnapshot(fixture, cookie);
  await addCookie(publicPage.context(), fixture, cookie);
  let available = false;
  fixture.statistics.setProviderResponder(({ body }) => available
    ? expandedStatisticsResponse(body)
    : new Response(null, { status: 503 }));

  const invalid = await publicPage.goto(`${fixture.origin}/cuenta/?vista=estadisticas&periodo=9&pagina=2`);
  assert.equal(invalid.status(), 400);
  const detail = publicPage.getByRole('region', { name: 'Estadísticas de tu página' });
  const invalidQuery = detail.getByRole('alert', { name: 'El período o la página no son válidos' });
  await expect(invalidQuery).toBeVisible();
  assert.deepEqual(fixture.statistics.requests, []);
  available = true;
  await invalidQuery.getByRole('link', { name: 'Abrir estadísticas' }).press('Enter');
  await expect(publicPage).toHaveURL(`${fixture.origin}/cuenta/?vista=estadisticas&periodo=7&pagina=1`);
  await expect(detail.getByLabel('Período', { exact: true })).toHaveValue('7');
  await expect(invalidQuery).toHaveCount(0);

  available = false;
  const selected = `${fixture.origin}/cuenta/?vista=estadisticas&periodo=30&pagina=2`;
  const unavailable = await publicPage.goto(selected);
  assert.equal(unavailable.status(), 503);
  assert.match(unavailable.headers()['cache-control'], /private.*no-store/iu);
  const failure = detail.getByRole('alert', { name: 'No pudimos cargar tus estadísticas' });
  await expect(failure).toBeVisible();
  await expect(detail.locator('[data-owner-activity-total]')).toHaveCount(0);
  const retry = failure.getByRole('link', { name: 'Reintentar', exact: true });
  assert.ok(fixture.statistics.requests.some(({ requests }) => requests.some((request) => queryDays(request) === 30)),
    'el informe de 30 días llegó al lector de Analytics');

  available = true;
  const response = publicPage.waitForResponse((candidate) => candidate.request().isNavigationRequest()
    && candidate.url() === selected);
  await retry.press('Enter');
  assert.equal((await response).status(), 200);
  await expect(publicPage).toHaveURL(selected);
  await expect(failure).toHaveCount(0);
  await expect(detail.getByLabel('Período', { exact: true })).toHaveValue('30');
  await expect(detail.locator('[data-owner-activity-total]')).toHaveText(['12', '6', '20']);
  await expect(detail.getByText('content-100', { exact: true })).toBeVisible();
  assert.deepEqual(await readOwnerSnapshot(fixture, cookie), saved);
});

test('las limitaciones, los valores desconocidos, el cero medido y la recuperación stale permanecen visibles', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const published = await publishOwner(fixture, cookie);
  assert.equal(published.response.status, 200);
  let mode = 'limited';
  fixture.statistics.setProviderResponder(({ body, payload }) => {
    if (mode === 'unavailable') return new Response(null, { status: 503 });
    const isBatch = Array.isArray(body.requests);
    const requests = isBatch ? body.requests : [body];
    const reports = payload.reports ?? [payload];
    for (const [index, request] of requests.entries()) {
      const period = queryDays(request);
      const dimensions = request.dimensions?.map(({ name }) => name) ?? [];
      const measuresVisitors = request.metrics.some(({ name }) => name === 'totalUsers');
      const report = reports[index];
      if (mode === 'limited' && period === 30) {
        if (measuresVisitors) {
          report.metadata.samplingMetadatas = [{ samplesReadCount: '700', samplingSpaceSize: '1000' }];
        }
        if (dimensions.includes('customEvent:link_id')) report.metadata.dataLossFromOtherRow = true;
      }
      if (mode === 'limited' && period === 7 && dimensions.length === 0) {
        report.rows = [];
        report.rowCount = 0;
        if (measuresVisitors) report.metadata.subjectToThresholding = true;
      }
      if (mode === 'recovered' && period === 7 && dimensions.length === 0) {
        const values = request.metrics.map(({ name }) => name === 'totalUsers' ? 4 : measuresVisitors ? 7 : 9);
        report.rows = [{ dimensionValues: [], metricValues: values.map((value) => ({ value: String(value) })) }];
        report.rowCount = 1;
      }
    }
    return isBatch ? { ...payload, reports } : reports[0];
  });

  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const summary = page.locator('[data-owner-activity]');
  await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('12');
  await expect(summary.locator('[data-owner-activity-total="visitors"]')).toHaveText('6');
  await expect(summary.locator('[data-owner-activity-total="clicks"]')).toHaveText('20');
  const finiteSummaryWarning = await summary.locator('[data-owner-activity-status]').innerText();

  await summary.locator('[data-owner-activity-detail]').click();
  const detail = page.locator('[data-owner-statistics]');
  await expect(detail).toContainText('Google Analytics agrupó parte del detalle en “(other)”.');
  await expect(detail).toContainText(/limitó el detalle de clics por enlace/u);
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('12');

  await summary.locator('[data-owner-activity-period="7"]').click();
  await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('Datos limitados');
  await expect(summary.locator('[data-owner-activity-total="visitors"]')).toHaveText('Datos limitados');
  await expect(summary.locator('[data-owner-activity-total="clicks"]')).toHaveText('0');
  const limitedSevenDayWarning = await summary.locator('[data-owner-activity-status]').innerText();
  const selectedSevenDayRead = async () => ({
    startDate: await summary.locator('.creator-owner__activity-context time').nth(0).getAttribute('datetime'),
    endDate: await summary.locator('.creator-owner__activity-context time').nth(1).getAttribute('datetime'),
    updatedAt: await summary.locator('.creator-owner__activity-context time').nth(2).getAttribute('datetime'),
  });
  const originalSevenDayRead = await selectedSevenDayRead();
  const oldClock = Date.parse(originalSevenDayRead.updatedAt);
  const advancedClock = fixture.statistics.advanceTime(65 * 60 * 1000);
  assert.ok(advancedClock > oldClock + 60 * 60 * 1000, 'the controlled clock moves beyond cache freshness');
  mode = 'unavailable';

  await summary.locator('[data-owner-activity-period="30"]').click();
  await expect(summary.locator('[data-owner-activity-status]')).toContainText(/informe anterior|No pudimos actualizar/iu);
  await summary.locator('[data-owner-activity-period="7"]').click();
  await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('Datos limitados');
  await expect(summary.locator('[data-owner-activity-total="visitors"]')).toHaveText('Datos limitados');
  await expect(summary.locator('[data-owner-activity-total="clicks"]')).toHaveText('0');
  await expect(summary.locator('[data-owner-activity-status]')).toContainText(/informe anterior|No pudimos actualizar/iu);
  const staleSevenDayWarning = await summary.locator('[data-owner-activity-status]').innerText();
  await expect(summary.locator('[data-owner-activity-retry]')).toBeVisible();
  assert.deepEqual(await selectedSevenDayRead(), originalSevenDayRead,
    'a stale report preserves its original date range and successful update timestamp');

  mode = 'recovered';
  await summary.locator('[data-owner-activity-retry]').click();
  await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('7');
  await expect(summary.locator('[data-owner-activity-total="visitors"]')).toHaveText('4');
  await expect(summary.locator('[data-owner-activity-total="clicks"]')).toHaveText('9');
  const recoveredRead = await selectedSevenDayRead();
  assert.equal(recoveredRead.updatedAt, new Date(advancedClock).toISOString());
  assert.notEqual(recoveredRead.updatedAt, originalSevenDayRead.updatedAt);
  assert.match(await summary.locator('[data-owner-activity-status]').innerText(), /Actividad actualizada/i);
  for (const [state, message] of [
    ['finite 30-day report', finiteSummaryWarning],
    ['limited 7-day report', limitedSevenDayWarning],
    ['stale 7-day report', staleSevenDayWarning],
  ]) {
    assert.match(message, /incomplet|limitad|agrup|pérdida|restric|muestra/iu,
      `${state}: the provider limitation remains visible beside its totals`);
  }
  assert.ok(fixture.statistics.requests.some(({ requests }) =>
    requests.some((request) => queryDays(request) === 7)),
  'the real GA4 reader handled the period-specific report behind the stale recovery');
});

test('ningún perfil o borrador consulta GA y publicar desde el detalle de 7 días conserva el período y carga datos reales', async ({ fixture, page }) => {
  const oidc = fixture.accountHarness.state.oidc;
  const previousClaims = oidc.claims;
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  try {
    for (const state of ['none', 'draft']) {
      oidc.claims = { ...(previousClaims ?? {}), sub: `activity-owner-${state}` };
      const cookie = await loggedInOwner(fixture, page, { profile: state === 'draft' });
      const providerCallsBefore = fixture.statistics.requests.length;
      await page.goto(`${fixture.origin}/cuenta/?vista=estadisticas&periodo=7&pagina=1`);
      let summary = page.locator('[data-owner-activity]');
      await expect(summary).toBeVisible();
      await expect(summary).toHaveAttribute('data-owner-activity-initial-period', '7');
      await expect(summary.locator('[data-owner-activity-content]')).toBeHidden();
      await expect(summary.locator('[data-owner-activity-empty]')).toBeVisible();
      assert.equal(fixture.statistics.requests.length, providerCallsBefore,
        `${state}: the detail state does not call the real GA4 reader or invent totals`);

      if (state === 'none') {
        await expect(page.locator('[data-owner-create-panel]')).toBeVisible();
        await page.locator('[data-owner-create-panel]').getByLabel('Nombre visible').fill('Página de actividad');
        await page.locator('[data-owner-create-panel]').getByLabel('Dirección de tu página').fill('actividad-inicial');
        await page.locator('[data-owner-create-panel]').getByRole('button', { name: 'Crear borrador' }).click();
        await expect(page.locator('[data-owner-profile]')).toBeVisible();
        await capture.settle();
        assert.equal((await fixture.rawOwner(cookie)).profile.published, false,
          'creating the page creates a draft and does not start measurement');
        assert.equal(fixture.statistics.requests.length, providerCallsBefore,
          'creating the draft does not start measurement');
        await page.goto(`${fixture.origin}/cuenta/?vista=estadisticas&periodo=7&pagina=1`);
        summary = page.locator('[data-owner-activity]');
        await expect(summary).toBeVisible();
        await expect(summary).toHaveAttribute('data-owner-activity-initial-period', '7');
        await expect(summary.locator('[data-owner-activity-content]')).toBeHidden();
        await expect(summary.locator('[data-owner-activity-empty]')).toBeVisible();
      }
      assert.equal(fixture.statistics.requests.length, providerCallsBefore,
        `${state}: a draft remains unmeasured before the explicit publish action`);
      await expect(page.locator('[data-owner-publish]')).toBeVisible();

      const pageUrlBeforePublish = page.url();
      await page.locator('[data-owner-publish]').click();
      await expect(summary.locator('[data-owner-activity-content]')).toBeVisible();
      await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('5');
      await expect(summary.locator('[data-owner-activity-total="visitors"]')).toHaveText('3');
      await expect(summary.locator('[data-owner-activity-total="clicks"]')).toHaveText('8');
      assert.equal(page.url(), pageUrlBeforePublish, `${state}: publication updates activity in the owner document`);
      await expect(summary.locator('[data-owner-activity-period="7"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(summary.locator('[data-owner-activity-detail]'))
        .toHaveAttribute('href', '/cuenta/?vista=estadisticas&periodo=7&pagina=1#creator-statistics-title');
      const writes = capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/perfil/publicar');
      assert.equal(writes.length, state === 'none' ? 1 : 2, `${state}: one explicit publication request is sent`);
      assert.equal(writes.at(-1).status, 200);
      assert.equal((await fixture.rawOwner(cookie)).profile.published, true);
      const reports = fixture.statistics.requests.slice(providerCallsBefore).flatMap(({ requests }) => requests);
      assert.ok(reports.length > 0, `${state}: publication loads real GA4 data`);
      assert.ok(reports.every((request) => queryDays(request) === 7),
        `${state}: each report uses the selected seven-day period`);
    }
  } finally {
    oidc.claims = previousClaims;
    await capture.stop();
  }
});

test('un perfil publicado pero oculto conserva su resumen histórico sin ofrecer acciones públicas', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const published = await publishOwner(fixture, cookie);
  assert.equal(published.response.status, 200);
  const beforeHidden = await fixture.rawOwner(cookie);
  const profileKey = `profile:${beforeHidden.profile.id}`;
  const stored = await fixture.creatorStore.get(profileKey);
  assert.equal(await fixture.creatorStore.transact({
    checks: [{ key: profileKey, version: stored.version }],
    puts: [{ key: profileKey, value: {
      ...stored,
      hidden: true,
      version: stored.version + 1,
    } }],
  }), true);
  const hidden = await fixture.rawOwner(cookie);
  assert.equal(hidden.profile.published, true);
  assert.equal(hidden.profile.hidden, true);

  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const summary = page.locator('[data-owner-activity]');
  await expect(summary).toBeVisible();
  await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('12');
  await expect(summary.locator('[data-owner-activity-total="visitors"]')).toHaveText('6');
  await expect(summary.locator('[data-owner-activity-total="clicks"]')).toHaveText('20');
  await expect(page.locator('[data-owner-hidden-copy]')).toBeVisible();
  await expect(page.getByRole('link', { name: /Ver página pública/ })).toHaveCount(0);
  await expect(page.locator('[data-owner-public-url]')).toHaveText(`${fixture.origin}/c/ana-browser/`);
  await expect(page.getByRole('button', { name: 'Copiar enlace', exact: true })).toHaveCount(1);
  const creatorIds = fixture.statistics.requests.flatMap(({ requests }) => requests.flatMap(({ dimensionFilter }) =>
    dimensionFilter?.andGroup?.expressions
      .filter(({ filter }) => filter.fieldName === 'customEvent:creator_id')
      .map(({ filter }) => filter.stringFilter.value) ?? []));
  assert.ok(creatorIds.includes(hidden.profile.id), 'the real provider reader still loads this owner’s historical report');
});

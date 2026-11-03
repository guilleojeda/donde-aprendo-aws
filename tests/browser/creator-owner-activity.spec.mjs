import assert from 'node:assert/strict';
import {
  test,
  expect,
  api,
  loggedInOwner,
  captureCreatorApi,
} from '../fixtures/creator-browser-test.mjs';

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

test('el resumen real de 7 y 30 días abre cada informe privado con los mismos datos GA4', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const published = await api(fixture, cookie, '/api/creador/perfil/publicar', { method: 'POST', body: {} });
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
  await expect(summary.locator('[data-owner-activity-period="30"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(summary.locator('[data-owner-activity-total-group]'))
    .toHaveAttribute('aria-label', 'Totales de los últimos 30 días');
  await expect(summary.locator('[data-owner-activity-detail]')).toHaveAttribute('href', '/cuenta/?vista=estadisticas&periodo=30&pagina=1');

  const beforeSevenDayAction = summaryResponses.length;
  await summary.locator('[data-owner-activity-period="7"]').click();
  await expect(summary.locator('[data-owner-activity-period="7"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(summary.locator('[data-owner-activity-total-group]'))
    .toHaveAttribute('aria-label', 'Totales de los últimos 7 días');
  await expect(summary.locator('[data-owner-activity-detail]')).toHaveAttribute('href', '/cuenta/?vista=estadisticas&periodo=7&pagina=1');
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

  const providerPeriods = fixture.statistics.requests.flatMap(({ requests }) =>
    requests.map(({ dateRanges }) => dateRanges[0]?.startDate));
  assert.ok(providerPeriods.includes('6daysAgo'), 'the real GA4 reader fetched the 7-day period');
  assert.ok(providerPeriods.includes('29daysAgo'), 'the real GA4 reader fetched the 30-day period');
  assert.deepEqual(summaryCaptureFailures, [], 'the route observer captures each real response before returning it unchanged');
  await page.unroute('**/api/creador/estadisticas/**', captureSummaryResponse);
});

test('la respuesta anterior no reemplaza el período elegido aunque su JSON termine de leerse después', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const published = await api(fixture, cookie, '/api/creador/perfil/publicar', { method: 'POST', body: {} });
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
    .toHaveAttribute('href', '/cuenta/?vista=estadisticas&periodo=7&pagina=1');

  const providerPeriods = fixture.statistics.requests.flatMap(({ requests }) =>
    requests.map(({ dateRanges }) => dateRanges[0]?.startDate));
  assert.ok(providerPeriods.includes('6daysAgo'));
  assert.ok(providerPeriods.includes('29daysAgo'));
});

test('creator, período, página y DTO inválidos quedan sin cifras hasta un reintento, mientras la edición sigue disponible', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const published = await api(fixture, cookie, '/api/creador/perfil/publicar', { method: 'POST', body: {} });
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
    ['página ajena', (body) => { body.page = 2; }],
    ['DTO malformado', (body) => { body.daily[0].date = 'fecha-inválida'; }],
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

test('las limitaciones, los valores desconocidos, el cero medido y la recuperación stale permanecen visibles', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const published = await api(fixture, cookie, '/api/creador/perfil/publicar', { method: 'POST', body: {} });
  assert.equal(published.response.status, 200);
  let mode = 'limited';
  fixture.statistics.setProviderResponder(({ body, payload }) => {
    if (mode === 'unavailable') return new Response(null, { status: 503 });
    const reports = payload.reports;
    const period = body.requests[0]?.dateRanges?.[0]?.startDate === '6daysAgo' ? 7 : 30;
    if (mode === 'limited' && period === 30) {
      const linksIndex = body.requests.findIndex(({ dimensions }) =>
        dimensions?.some(({ name }) => name === 'customEvent:link_id'));
      reports[linksIndex] = {
        ...reports[linksIndex],
        metadata: { ...reports[linksIndex].metadata, dataLossFromOtherRow: true },
      };
    }
    if (mode === 'limited' && period === 7) {
      const visitsIndex = body.requests.findIndex(({ metrics }) => metrics.some(({ name }) => name === 'totalUsers'));
      const clicksIndex = body.requests.findIndex(({ dimensions, metrics }) =>
        !dimensions?.length && metrics.some(({ name }) => name === 'eventCount')
          && !metrics.some(({ name }) => name === 'totalUsers'));
      reports[visitsIndex] = {
        ...reports[visitsIndex],
        rows: [],
        rowCount: 0,
        metadata: { ...reports[visitsIndex].metadata, subjectToThresholding: true },
      };
      reports[clicksIndex] = { ...reports[clicksIndex], rows: [], rowCount: 0 };
    }
    if (mode === 'recovered' && period === 7) {
      for (const [index, request] of body.requests.entries()) {
        if (request.dimensions?.length) continue;
        const metrics = request.metrics.map(({ name }) => name);
        const values = metrics.map((name) => name === 'totalUsers' ? 4 : name === 'eventCount'
          ? metrics.includes('totalUsers') ? 7 : 9
          : 0);
        reports[index] = {
          ...reports[index],
          rows: [{ dimensionValues: [], metricValues: values.map((value) => ({ value: String(value) })) }],
          rowCount: 1,
        };
      }
    }
    return { ...payload, reports };
  });

  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const summary = page.locator('[data-owner-activity]');
  await expect(summary.locator('[data-owner-activity-total="views"]')).toHaveText('12');
  await expect(summary.locator('[data-owner-activity-total="visitors"]')).toHaveText('6');
  await expect(summary.locator('[data-owner-activity-total="clicks"]')).toHaveText('20');
  const finiteSummaryWarning = await summary.locator('[data-owner-activity-status]').innerText();

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
    requests.some(({ dateRanges }) => dateRanges[0]?.startDate === '6daysAgo')),
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
        .toHaveAttribute('href', '/cuenta/?vista=estadisticas&periodo=7&pagina=1');
      const writes = capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/perfil/publicar');
      assert.equal(writes.length, state === 'none' ? 1 : 2, `${state}: one explicit publication request is sent`);
      assert.equal(writes.at(-1).status, 200);
      assert.equal((await fixture.rawOwner(cookie)).profile.published, true);
      const providerCalls = fixture.statistics.requests.slice(providerCallsBefore);
      assert.equal(providerCalls.length, 1, `${state}: publication causes one real GA4 batch read`);
      assert.ok(providerCalls[0].requests.every(({ dateRanges }) => dateRanges[0]?.startDate === '6daysAgo'),
        `${state}: every report in that batch uses the selected seven-day period`);
    }
  } finally {
    oidc.claims = previousClaims;
    await capture.stop();
  }
});

test('un perfil publicado pero oculto conserva su resumen histórico sin ofrecer acciones públicas', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const published = await api(fixture, cookie, '/api/creador/perfil/publicar', { method: 'POST', body: {} });
  assert.equal(published.response.status, 200);
  const beforeHidden = await fixture.rawOwner(cookie);
  assert.equal(await fixture.creatorStore.transact({
    checks: [{ key: `profile:${beforeHidden.profile.id}`, version: beforeHidden.profile.version }],
    puts: [{ key: `profile:${beforeHidden.profile.id}`, value: {
      ...beforeHidden.profile,
      hidden: true,
      version: beforeHidden.profile.version + 1,
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
  await expect(page.getByRole('button', { name: 'Copiar enlace', exact: true })).toHaveCount(0);
  const creatorIds = fixture.statistics.requests.flatMap(({ requests }) => requests.flatMap(({ dimensionFilter }) =>
    dimensionFilter?.andGroup?.expressions
      .filter(({ filter }) => filter.fieldName === 'customEvent:creator_id')
      .map(({ filter }) => filter.stringFilter.value) ?? []));
  assert.ok(creatorIds.includes(hidden.profile.id), 'the real provider reader still loads this owner’s historical report');
});

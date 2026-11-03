import assert from 'node:assert/strict';
import {
  test,
  expect,
  api,
  loggedInOwner,
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
  await expect(summary.locator('[data-owner-activity-detail]')).toHaveAttribute('href', '/cuenta/?vista=estadisticas&periodo=30&pagina=1');

  const beforeSevenDayAction = summaryResponses.length;
  await summary.locator('[data-owner-activity-period="7"]').click();
  await expect(summary.locator('[data-owner-activity-period="7"]')).toHaveAttribute('aria-pressed', 'true');
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

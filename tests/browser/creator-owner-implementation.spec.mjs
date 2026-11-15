import assert from 'node:assert/strict';
import { test, expect, loggedInOwner } from '../fixtures/creator-browser-test.mjs';

test('an initial GET for a missing Series keeps its 400 error after hydration', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  assert.ok(cookie, 'the request uses the authenticated owner fixture');
  const missingSeriesId = 'series-that-does-not-exist';
  const response = await page.goto(`${fixture.origin}/cuenta/?vista=series&serie=${missingSeriesId}`);
  assert.equal(response?.status(), 400, 'the real SSR route rejects the initially missing Series query');

  await expect(page.locator('[data-series-query-error]')).toBeVisible();
  await expect(page.locator('[data-series-create-open]')).toBeEnabled();
  await expect(page.locator('[data-owner-series-list-view]')).toBeHidden();
  await expect(page.locator('[data-owner-series-chapters]')).toBeHidden();
  assert.equal(new URL(page.url()).searchParams.get('serie'), missingSeriesId,
    'client hydration preserves the rejected query instead of replacing it with a valid list URL');
  const historyState = await page.evaluate(() => history.state);
  assert.equal(historyState.creatorOwnerSeriesQueryValid, false,
    'the history entry retains its index for navigation while recording that its initial query was invalid');
});

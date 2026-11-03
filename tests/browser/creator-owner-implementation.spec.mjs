import assert from 'node:assert/strict';
import { test, expect, captureCreatorApi, loggedInOwner } from '../fixtures/creator-browser-test.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function profileForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
}

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

test('a delayed 401 from a discarded profile check cannot block the next editor or save', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const ownerPath = '/api/creador/perfil';
  let rejectedBody;
  let rejectedA = false;
  const rejectProfileA = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (!rejectedA && request.method() === 'PUT' && pathname === ownerPath) {
      rejectedA = true;
      rejectedBody = JSON.parse(request.postData() ?? '{}');
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"TEMPORARY_FAILURE"}' });
      return;
    }
    await route.continue();
  };

  let releaseCheck;
  const checkStarted = deferred();
  const checkGate = new Promise((resolve) => { releaseCheck = resolve; });
  let heldCheck = false;
  const holdExpiredCheck = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (!heldCheck && request.method() === 'GET' && pathname === ownerPath) {
      heldCheck = true;
      checkStarted.resolve();
      await checkGate;
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"SESSION_EXPIRED"}' });
      return;
    }
    await route.continue();
  };

  try {
    await page.route('**/api/creador/**', rejectProfileA);
    await page.goto(`${fixture.origin}/cuenta/?vista=series`);
    await expect(page.getByRole('heading', { name: 'Series', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Editar datos' }).click();
    const editorA = profileForm(page);
    await editorA.getByLabel('Nombre visible').fill('Corrección A que no llegó al servidor');
    await editorA.getByRole('button', { name: 'Guardar datos' }).click();
    await expect(editorA.locator('[data-owner-compare]')).toBeVisible();
    await capture.settle({ skipErrorBodies: true });
    assert.equal(rejectedA, true, 'A reached the real browser write boundary');
    assert.equal(capture.writes().length, 1);
    assert.equal(capture.writes()[0].status, 503);
    assert.equal(rejectedBody.displayName, 'Corrección A que no llegó al servidor');
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, initial.profile,
      'the injected 503 happened before the profile service changed the saved state');
    await page.unroute('**/api/creador/**', rejectProfileA);

    await page.route('**/api/creador/**', holdExpiredCheck);
    await editorA.locator('[data-owner-compare]').click();
    await checkStarted.promise;
    const exitPrompt = page.locator('[data-owner-exit-prompt]');
    await editorA.getByRole('button', { name: 'Cancelar' }).click();
    await expect(exitPrompt).toBeVisible();
    await exitPrompt.getByRole('button', { name: 'Descartar cambios' }).click();

    await page.getByRole('button', { name: 'Editar datos' }).click();
    const editorB = profileForm(page);
    await editorB.getByLabel('Nombre visible').fill('Corrección B guardada manualmente');
    await editorB.getByLabel(/Ciudad/).fill('Córdoba');
    const staleResponse = page.waitForResponse((response) => response.status() === 401
      && new URL(response.url()).pathname.replace(/\/$/u, '') === ownerPath);
    releaseCheck();
    const response = await staleResponse;
    await response.finished();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    await expect(page.locator('[data-session-recovery-shell]')).toHaveCount(0,
      'the discarded check cannot install session recovery over editor B');
    await expect(editorB.getByLabel('Nombre visible')).toHaveValue('Corrección B guardada manualmente');
    await expect(editorB.getByLabel(/Ciudad/)).toHaveValue('Córdoba');
    await expect(editorB.getByRole('button', { name: 'Guardar datos' })).toBeEnabled();

    await editorB.getByRole('button', { name: 'Guardar datos' }).click();
    await capture.settle({ skipErrorBodies: true });
    const writes = capture.writes();
    assert.equal(writes.length, 2, 'discarded A is never replayed when its old read completes');
    assert.deepEqual(writes.map(({ status, body }) => ({ status, name: body.displayName })), [
      { status: 503, name: 'Corrección A que no llegó al servidor' },
      { status: 200, name: 'Corrección B guardada manualmente' },
    ]);
    assert.equal(writes[1].body.version, initial.profile.version);
    assert.equal(writes[1].body.city, 'Córdoba');
    const saved = await fixture.rawOwner(cookie);
    assert.equal(saved.profile.displayName, 'Corrección B guardada manualmente');
    assert.equal(saved.profile.city, 'Córdoba');
    assert.equal(saved.profile.version, initial.profile.version + 1);
    assert.deepEqual(writes[1].responseBody.versionChanges, [
      { entity: 'profile', id: initial.profile.id, before: initial.profile.version, after: initial.profile.version + 1 },
    ]);
  } finally {
    releaseCheck();
    await page.unroute('**/api/creador/**', rejectProfileA).catch(() => {});
    await page.unroute('**/api/creador/**', holdExpiredCheck).catch(() => {});
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

import assert from 'node:assert/strict';
import { test, expect, api, addLink, captureCreatorApi, loggedInOwner } from '../fixtures/creator-browser-test.mjs';

const OWNER_PATH = '/api/creador/perfil';

function deferred() {
  let resolve;
  const promise = new Promise((accept) => { resolve = accept; });
  return { promise, resolve };
}

function writesTo(capture, method, path) {
  return capture.writes().filter((write) => write.method === method && write.path === path);
}

test('mixed owner snapshots are rejected and can be retried before the next manual save', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const removed = await addLink(fixture, cookie, {
    title: 'Snapshot removal target',
    url: 'https://snapshot-recovery.example/remove',
  });
  const kept = await addLink(fixture, cookie, {
    title: 'Snapshot kept link',
    url: 'https://snapshot-recovery.example/keep',
  });
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();

  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const removedAtServer = deferred();
  const removeHandler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() === 'DELETE' && pathname === `/api/creador/enlaces/${removed.placementId}`) {
      const response = await route.fetch();
      removedAtServer.resolve(response.status());
      await route.abort('failed');
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', removeHandler);

  const originalGet = fixture.creatorStore.get;
  const releaseProfileRead = deferred();
  let removeClick;
  let firstCheck;
  let retryCheck;
  try {
    page.once('dialog', (dialog) => dialog.accept());
    removeClick = page.locator(`[data-link-row="${removed.placementId}"]`)
      .getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    assert.equal(await removedAtServer.promise, 204, 'the real removal commits before its response is lost');
    assert.equal(await fixture.rawPlacement(cookie, removed.placementId), null, 'the removed placement is gone at the service boundary');
    await removeClick;
    await expect(page.locator('[data-owner-list-recovery="links"]')).toBeVisible();

    const ownerAfterRemoval = await fixture.rawOwner(cookie);
    const observedVersion = ownerAfterRemoval.profile.version;
    const afterRemoval = deferred();
    const profileKey = `profile:${ownerAfterRemoval.profile.id}`;
    let heldProfileRead = false;
    fixture.creatorStore.get = async function (key, ...args) {
      const value = await originalGet.call(this, key, ...args);
      if (!heldProfileRead && key === profileKey) {
        heldProfileRead = true;
        afterRemoval.resolve(value.version);
        await releaseProfileRead.promise;
      }
      return value;
    };

    const recoveryResponse = page.waitForResponse((response) => response.request().method() === 'GET'
      && new URL(response.url()).pathname.replace(/\/$/u, '') === OWNER_PATH);
    firstCheck = page.getByRole('button', { name: 'Comprobar', exact: true }).click();
    assert.equal(await afterRemoval.promise, observedVersion, 'the recovery GET starts from the current profile version');

    const externalEdit = await api(fixture, cookie, `/api/creador/enlaces/${kept.placementId}/editar`, {
      method: 'PATCH',
      body: {
        profileVersion: observedVersion,
        resourceVersion: kept.resourceVersion,
        placementVersion: kept.placementVersion,
        title: 'Snapshot edited in another tab',
        url: kept.url,
        description: '',
        selectedForDirectory: false,
        featured: false,
      },
    });
    assert.equal(externalEdit.response.status, 200, JSON.stringify(externalEdit.body));
    assert.equal(externalEdit.body.link.title, 'Snapshot edited in another tab');

    releaseProfileRead.resolve();
    const mixedResponse = await recoveryResponse;
    assert.equal(mixedResponse.status(), 409, 'the server rejects a snapshot whose profile changed during collection reads');
    const error = await mixedResponse.json();
    assert.equal(error.error, 'PROFILE_CONFLICT');
    assert.equal(Object.hasOwn(error, 'profile'), false);
    await firstCheck;
    await expect(page.locator('[data-owner-list-recovery="links"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Comprobar', exact: true })).toBeEnabled();
    await expect(page.locator(`[data-link-row="${kept.placementId}"]`)).toContainText('Snapshot kept link',
      'the rejected mixed response is not adopted into the current list');

    const retryResponse = page.waitForResponse((response) => response.request().method() === 'GET'
      && new URL(response.url()).pathname.replace(/\/$/u, '') === OWNER_PATH);
    retryCheck = page.getByRole('button', { name: 'Comprobar', exact: true }).click();
    const coherentResponse = await retryResponse;
    assert.equal(coherentResponse.status(), 200, 'a retry after the concurrent edit returns a coherent snapshot');
    await retryCheck;
    await expect(page.locator('[data-owner-list-recovery="links"]')).toHaveCount(0);
    await expect(page.locator(`[data-link-row="${kept.placementId}"]`)).toContainText('Snapshot edited in another tab');

    const latest = await fixture.rawOwner(cookie);
    assert.equal(latest.profile.version, observedVersion + 1);
    await page.locator(`[data-link-row="${kept.placementId}"]`).getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const dialog = page.locator('[data-owner-dialog]');
    await dialog.locator('#owner-link-title').fill('Snapshot manual edit after retry');
    const manualResponse = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && new URL(response.url()).pathname.replace(/\/$/u, '') === `/api/creador/enlaces/${kept.placementId}/editar`);
    await dialog.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    const saved = await manualResponse;
    assert.equal(saved.status(), 200, 'the next manual write uses the coherent recovered basis');
    assert.equal(saved.request().postDataJSON().profileVersion, latest.profile.version);

    const readBack = await api(fixture, cookie, OWNER_PATH);
    assert.equal(readBack.response.status, 200);
    assert.equal(readBack.body.profile.version, latest.profile.version + 1);
    assert.equal(readBack.body.links.find(({ placementId }) => placementId === kept.placementId).title, 'Snapshot manual edit after retry');
    assert.equal(writesTo(capture, 'DELETE', `/api/creador/enlaces/${removed.placementId}`).length, 1,
      'the recovery retry does not replay the original removal');
    assert.equal(writesTo(capture, 'PATCH', `/api/creador/enlaces/${kept.placementId}/editar`).length, 1,
      'the next persisted operation is one distinct manual edit');
  } finally {
    releaseProfileRead.resolve();
    await removeClick?.catch(() => {});
    await firstCheck?.catch(() => {});
    await retryCheck?.catch(() => {});
    fixture.creatorStore.get = originalGet;
    await page.unroute('**/api/creador/**', removeHandler).catch(() => {});
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

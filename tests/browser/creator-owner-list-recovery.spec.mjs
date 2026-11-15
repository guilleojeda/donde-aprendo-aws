import assert from 'node:assert/strict';
import { test, expect, api, addLink, captureCreatorApi, loggedInOwner, readOwnerSnapshot } from '../fixtures/creator-browser-test.mjs';

const OWNER_PATH = '/api/creador/perfil';
const STALE_LINK_RECOVERY = '[data-owner-list-recovery="links"][data-owner-stale="true"]';

function writesTo(capture, method, path) {
  return capture.writes().filter((write) => write.method === method && write.path === path);
}

test('un GET malformado y otro anterior no sustituyen la confirmación antes de continuar manualmente', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const target = await addLink(fixture, cookie, {
    title: 'Ficha para lectura retrasada',
    url: 'https://phase5-list-recovery.example/target',
  });
  await addLink(fixture, cookie, {
    title: 'Ficha que queda visible',
    url: 'https://phase5-list-recovery.example/kept',
  });
  const earlierSnapshot = await readOwnerSnapshot(fixture, cookie);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces&buscar=Ficha`);
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const readResponses = [];
  let controlledReads = 0;
  let expectAcknowledgedRead = false;
  const deletePath = `/api/creador/enlaces/${target.placementId}`;
  const transport = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() === 'DELETE' && pathname === deletePath) {
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      expectAcknowledgedRead = true;
      await route.fulfill({ response });
      return;
    }
    if (request.method() !== 'GET'
      || pathname !== OWNER_PATH || !expectAcknowledgedRead) {
      await route.continue();
      return;
    }
    const actual = await route.fetch();
    const actualBody = await actual.json();
    if (controlledReads === 0) {
      controlledReads += 1;
      const malformed = { ...earlierSnapshot, resources: null };
      readResponses.push({ kind: 'malformed', body: malformed });
      const headers = { ...actual.headers(), 'content-type': 'application/json' };
      delete headers['content-length'];
      await route.fulfill({ status: 200, headers, body: JSON.stringify(malformed) });
      return;
    }
    if (controlledReads === 1) {
      controlledReads += 1;
      readResponses.push({ kind: 'earlier-v2', body: earlierSnapshot });
      const headers = { ...actual.headers(), 'content-type': 'application/json' };
      delete headers['content-length'];
      await route.fulfill({ status: 200, headers, body: JSON.stringify(earlierSnapshot) });
      return;
    }
    readResponses.push({ kind: 'current-v2', body: actualBody });
    await route.fulfill({ response: actual, json: actualBody });
  };
  await page.route('**/api/creador/**', transport);

  const targetRow = page.locator(`[data-link-row="${target.placementId}"]`);
  let removeClick;
  try {
    page.once('dialog', (dialog) => dialog.accept());
    removeClick = targetRow.getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'DELETE', deletePath)[0]?.status).toBe(200);
    await removeClick;

    const removal = writesTo(capture, 'DELETE', deletePath);
    assert.equal(removal.length, 1);
    assert.equal(removal[0].responseBody.operation, 'remove-link');
    assert.equal(removal[0].body.creatorVersion, earlierSnapshot.creatorVersion);
    assert.ok(removal[0].responseBody.creatorVersion > earlierSnapshot.creatorVersion);
    await expect(page.locator(STALE_LINK_RECOVERY)).toBeVisible();
    await expect(page.locator('[data-owner-refresh-retry]')).toBeVisible();
    await expect(targetRow).toBeVisible('the old list stays visibly stale until the full read installs');
    assert.equal(readResponses[0]?.kind, 'malformed', 'the acknowledged command triggers its required full read');
    assert.deepEqual(readResponses[0]?.body, { ...earlierSnapshot, resources: null });

    await page.locator('[data-owner-refresh-retry]').click();
    await expect.poll(() => readResponses.length).toBe(2);
    await expect(page.locator(STALE_LINK_RECOVERY)).toBeVisible();
    assert.equal(readResponses[1].kind, 'earlier-v2');
    assert.equal(readResponses[1].body.creatorVersion, earlierSnapshot.creatorVersion);
    assert.ok(readResponses[1].body.creatorVersion < removal[0].responseBody.creatorVersion,
      'the controlled response is a real, earlier v2 owner read below the acknowledged version floor');
    await expect(targetRow).toBeVisible('an older complete response cannot replace the current stale display');

    await page.locator('[data-owner-refresh-retry]').click();
    await expect.poll(() => readResponses.length).toBe(3);
    assert.equal(readResponses[2].kind, 'current-v2');
    await expect(page.locator(STALE_LINK_RECOVERY)).toHaveCount(0);
    await expect(page.locator(`[data-link-row="${target.placementId}"]`)).toHaveCount(0);
    await expect(page.locator('[data-link-count-summary]')).toContainText('1 coincidencia de 1 enlace');
    await expect(page).toHaveURL((url) => url.searchParams.get('buscar') === 'Ficha');
    const recovered = await readOwnerSnapshot(fixture, cookie);
    assert.equal(Object.hasOwn(recovered.placements, target.placementId), false);
    assert.equal(recovered.resources.find(({ id }) => id === target.resourceId)?.reincludeAllowed, true,
      'the retained resource remains available only with current owner permission');

    const retained = page.locator(`[data-retained-resource="${target.resourceId}"]`);
    await expect(retained).toBeVisible();
    await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(201);
    await capture.settle({ skipErrorBodies: true });
    const reinclude = writesTo(capture, 'POST', '/api/creador/enlaces');
    assert.equal(reinclude.length, 1, 'the only POST follows the successful read as a distinct manual choice');
    assert.equal(reinclude[0].responseBody.operation, 'reinclude-link');
    assert.equal(reinclude[0].responseBody.disposition, 'attached');
    assert.equal(reinclude[0].body.creatorVersion, recovered.creatorVersion);
    assert.equal(reinclude[0].body.resourceVersion, target.resourceVersion);
    assert.equal(writesTo(capture, 'DELETE', deletePath).length, 1,
      'neither rejected read replays the confirmed removal');
    const final = await readOwnerSnapshot(fixture, cookie);
    assert.equal(final.placements[reinclude[0].responseBody.placementId].resourceId, target.resourceId);
    assert.ok(final.creatorVersion > recovered.creatorVersion);
  } finally {
    await page.unroute('**/api/creador/**', transport).catch(() => {});
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

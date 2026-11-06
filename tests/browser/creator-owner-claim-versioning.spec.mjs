import assert from 'node:assert/strict';
import { completeLogin, cookiePair, makeAccount, makeIdentity } from '../fixtures/account-auth.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';
import { test, expect, api, loggedInOwner } from '../fixtures/creator-browser-test.mjs';

const OWNER_PATH = '/api/creador/perfil';

function deferred() {
  let resolve;
  const promise = new Promise((accept) => { resolve = accept; });
  return { promise, resolve };
}

async function createClaim(fixture, cookie, resourceId, url, evidence) {
  const result = await api(fixture, cookie, '/api/creador/reclamaciones', {
    method: 'POST', body: { resources: [{ resourceId, url }], evidence },
  });
  assert.equal(result.response.status, 202, JSON.stringify(result.body));
  assert.equal(result.body.claim.version, 1);
  return result.body.claim;
}

async function adminCookie(fixture) {
  const sub = 'claim-versioning-admin';
  const email = 'claim-versioning-admin@example.invalid';
  const identity = makeIdentity({ sub });
  fixture.accountStore.seedAccount(makeAccount({ identity, email, isAdmin: true }));
  const oldClaims = fixture.accountHarness.state.oidc.claims;
  fixture.accountHarness.state.oidc.claims = { sub, email };
  try {
    const login = await completeLogin(fixture.accountHarness);
    assert.equal(login.response.status, 303);
    assert.ok(login.sessionCookie);
    return { pair: cookiePair(login.sessionCookie) };
  } finally {
    if (oldClaims === undefined) delete fixture.accountHarness.state.oidc.claims;
    else fixture.accountHarness.state.oidc.claims = oldClaims;
  }
}

async function seedClaimableResource(fixture, id, slug) {
  const resource = {
    id,
    title: `Recurso de ${slug}`,
    url: `https://${slug}.example.invalid/resource`,
    kind: 'community',
    category: 'Comunidad',
    format: 'community',
    published: true,
  };
  await seedResource(fixture.creatorStore, resource);
  return resource;
}

test('an older held publication snapshot cannot delete claim membership observed by Solicitudes', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const resource = await seedClaimableResource(fixture, 'claim-membership-race', 'claim-membership-race');
  await page.goto(`${fixture.origin}/cuenta/?vista=solicitudes`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();

  const historyArrived = deferred();
  const historyGate = deferred();
  const publicationArrived = deferred();
  const publicationGate = deferred();
  const oldSnapshotArrived = deferred();
  const oldSnapshotGate = deferred();
  let holdFirstHistoryRead = true;
  let holdPublicationRecovery = false;
  let oldSnapshot;
  let publicationStatus;
  let browserClaimPosts = 0;
  const countBrowserClaimPost = (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.replace(/\/$/u, '') === '/api/creador/reclamaciones') browserClaimPosts++;
  };
  page.on('request', countBrowserClaimPost);
  const transport = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() === 'GET' && pathname === OWNER_PATH && holdFirstHistoryRead) {
      holdFirstHistoryRead = false;
      historyArrived.resolve();
      await historyGate.promise;
      await route.continue();
      return;
    }
    if (request.method() === 'POST' && pathname === '/api/creador/perfil/publicar') {
      const response = await route.fetch();
      publicationStatus = response.status();
      publicationArrived.resolve();
      await publicationGate.promise;
      await route.abort().catch(() => {});
      return;
    }
    if (request.method() === 'GET' && pathname === OWNER_PATH && holdPublicationRecovery) {
      holdPublicationRecovery = false;
      const response = await route.fetch();
      oldSnapshot = await response.json();
      oldSnapshotArrived.resolve();
      await oldSnapshotGate.promise;
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', transport);

  try {
    await page.locator('[data-claim-history-refresh]').click();
    await historyArrived.promise;

    const publication = page.locator('[data-owner-publish]');
    await expect(publication).toBeEnabled();
    const waitForPublicationRecovery = page.locator('[data-owner-list-recovery="series"]');
    await publication.click();
    await publicationArrived.promise;
    assert.equal(publicationStatus, 200, 'the real publish completed before its browser acknowledgement was lost');
    publicationGate.resolve();
    await expect(waitForPublicationRecovery).toBeVisible();

    holdPublicationRecovery = true;
    await waitForPublicationRecovery.getByRole('button', { name: 'Comprobar', exact: true }).click();
    await oldSnapshotArrived.promise;
    assert.equal(oldSnapshot.profile.published, true);
    assert.deepEqual(oldSnapshot.claims, [], 'the held complete snapshot predates the claim');

    const claim = await createClaim(fixture, cookie, resource.id, resource.url, 'Membership observed during recovery.');
    const persistedBeforeRelease = await api(fixture, cookie, OWNER_PATH);
    assert.equal(persistedBeforeRelease.response.status, 200);
    assert.deepEqual(persistedBeforeRelease.body.claims.map(({ id }) => id), [claim.id]);

    // The ordinary history request began before the claim but reaches the real
    // handler now, so its actual response observes the newly committed row.
    historyGate.resolve();
    const visibleClaim = page.locator(`[data-claim-record="${claim.id}"]`);
    await expect(visibleClaim).toBeVisible();
    await expect(visibleClaim.locator('[data-claim-status]')).toHaveText('Pendiente');

    oldSnapshotGate.resolve();
    await expect(waitForPublicationRecovery).toHaveCount(0);
    await expect(visibleClaim).toBeVisible();
    await expect(visibleClaim.locator('[data-claim-status]')).toHaveText('Pendiente');
    const freshOwner = await api(fixture, cookie, OWNER_PATH);
    assert.equal(freshOwner.response.status, 200);
    assert.deepEqual(freshOwner.body.claims.map(({ id }) => id), [claim.id]);
    assert.equal(browserClaimPosts, 0, 'snapshot adoption never replays claim creation');
  } finally {
    historyGate.resolve();
    publicationGate.resolve();
    oldSnapshotGate.resolve();
    await page.unroute('**/api/creador/**', transport).catch(() => {});
    page.off('request', countBrowserClaimPost);
  }
});

test('an older history response cannot regress claim status adopted from a newer owner snapshot', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initialOwner = await fixture.rawOwner(cookie);
  const resource = await seedClaimableResource(fixture, 'claim-status-race', 'claim-status-race');
  const claim = await createClaim(fixture, cookie, resource.id, resource.url, 'Status observed through recovery.');
  const admin = await adminCookie(fixture);
  await page.goto(`${fixture.origin}/cuenta/?vista=solicitudes`);
  await expect(page.locator(`[data-claim-record="${claim.id}"] [data-claim-status]`)).toHaveText('Pendiente');

  const historyArrived = deferred();
  const historyGate = deferred();
  const oldHistory = {};
  let holdFirstHistoryRead = true;
  let browserClaimPosts = 0;
  let browserProfileWrites = 0;
  const countBrowserWrites = (request) => {
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() === 'POST' && pathname === '/api/creador/reclamaciones') browserClaimPosts++;
    if (request.method() === 'PUT' && pathname === OWNER_PATH) browserProfileWrites++;
  };
  page.on('request', countBrowserWrites);
  const transport = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() === 'GET' && pathname === OWNER_PATH && holdFirstHistoryRead) {
      holdFirstHistoryRead = false;
      const response = await route.fetch();
      oldHistory.status = response.status();
      oldHistory.body = await response.json();
      historyArrived.resolve();
      await historyGate.promise;
      await route.fulfill({ response });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', transport);

  try {
    await page.locator('[data-claim-history-refresh]').click();
    await historyArrived.promise;
    assert.equal(oldHistory.status, 200);
    assert.equal(oldHistory.body.claims[0].status, 'pending');
    assert.equal(oldHistory.body.claims[0].version, 1);

    const grant = await api(fixture, admin, '/api/admin/reclamaciones/vincular', {
      method: 'POST', body: { accountId: initialOwner.principal.accountId, resourceIds: [resource.id] },
    });
    assert.equal(grant.response.status, 200, JSON.stringify(grant.body));
    const persistedClaim = await fixture.creatorStore.get(`claim:${claim.id}`);
    assert.equal(persistedClaim.status, 'resolved');
    assert.equal(persistedClaim.version, 2, 'the existing claim row records the status advance');
    const currentOwner = await api(fixture, cookie, OWNER_PATH);
    assert.equal(currentOwner.response.status, 200);
    assert.equal(currentOwner.body.profile.version, oldHistory.body.profile.version + 1,
      'the actual admin link also advances the owner profile independently');
    assert.deepEqual(currentOwner.body.claims.map(({ status, version }) => ({ status, version })), [{ status: 'resolved', version: 2 }]);

    await page.getByRole('button', { name: 'Editar datos' }).click();
    const form = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
    await form.getByLabel('Nombre visible').fill('Perfil con versión anterior');
    const staleWrite = page.waitForResponse((response) => response.request().method() === 'PUT'
      && new URL(response.url()).pathname.replace(/\/$/u, '') === OWNER_PATH);
    await form.getByRole('button', { name: 'Guardar datos' }).click();
    assert.equal((await staleWrite).status(), 409, 'the old editor base is rejected after the real admin grant');

    const comparisonRead = page.waitForResponse((response) => response.request().method() === 'GET'
      && new URL(response.url()).pathname.replace(/\/$/u, '') === OWNER_PATH);
    await form.locator('[data-owner-compare]').click();
    const comparisonResponse = await comparisonRead;
    assert.equal(comparisonResponse.status(), 200);
    const comparison = await comparisonResponse.json();
    assert.equal(comparison.claims[0].status, 'resolved');
    assert.equal(comparison.claims[0].version, 2);
    await form.locator('[data-owner-adopt]').click();
    const status = page.locator(`[data-claim-record="${claim.id}"] [data-claim-status]`);
    await expect(status).toHaveText('Resuelta');

    historyGate.resolve();
    await expect(page.locator('[data-claim-index-status]')).toContainText('Solicitudes actualizadas');
    await expect(status).toHaveText('Resuelta', 'the delayed version-1 history row cannot regress adopted version 2');
    const afterBothReads = await api(fixture, cookie, OWNER_PATH);
    assert.equal(afterBothReads.response.status, 200);
    assert.deepEqual(afterBothReads.body.claims.map(({ status: claimStatus, version }) => ({ status: claimStatus, version })),
      [{ status: 'resolved', version: 2 }]);
    const adminRead = await api(fixture, admin, '/api/admin/reclamaciones');
    assert.equal(adminRead.response.status, 200);
    assert.equal(adminRead.body.claims.find(({ id }) => id === claim.id).status, 'resolved');

    await form.getByLabel('Nombre visible').fill('Siguiente manual guardado');
    const manualWrite = page.waitForResponse((response) => response.request().method() === 'PUT'
      && new URL(response.url()).pathname.replace(/\/$/u, '') === OWNER_PATH);
    await form.getByRole('button', { name: 'Guardar datos' }).click();
    assert.equal((await manualWrite).status(), 200, 'the recovered editor remains usable for a distinct manual save');
    const finalOwner = await fixture.rawOwner(cookie);
    assert.equal(finalOwner.profile.displayName, 'Siguiente manual guardado');
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).version, 2);
    assert.equal(browserProfileWrites, 2, 'one rejected old-base save and one explicit manual continuation');
    assert.equal(browserClaimPosts, 0, 'history and snapshot reads never replay the claim POST');
  } finally {
    historyGate.resolve();
    await page.unroute('**/api/creador/**', transport).catch(() => {});
    page.off('request', countBrowserWrites);
  }
});

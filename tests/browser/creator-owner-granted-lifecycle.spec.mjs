import assert from 'node:assert/strict';
import { currentUrlCollision, currentUrlKey, currentUrlReservation } from '../../src/lib/catalog-url.mjs';
import { completeLogin, cookiePair, makeAccount, makeIdentity } from '../fixtures/account-auth.mjs';
import {
  test, expect, api, addChapter, captureCreatorApi, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

const INITIAL_URL = 'https://imported.example.invalid/cohosted';
const UNRELATED_COHOST_URL = 'https://imported.example.invalid/other-cohosts';
const ACTIVE_URL = 'https://creator.example.invalid/cohosted-active';
const RETIRED_URL = 'https://creator.example.invalid/cohosted-retired';
const resourceId = 'phase1-granted-cohost-resource';
const cohostIds = ['phase1-imported-cohost-one', 'phase1-imported-cohost-two'];
const reservationCases = [
  { kind: 'unique', label: 'reserva inicial única' },
  { kind: 'collision', label: 'reserva inicial compartida con dos cohosts' },
];

async function adminCookie(fixture) {
  const sub = 'phase1-granted-lifecycle-admin';
  const email = 'phase1-admin@example.invalid';
  const identity = makeIdentity({ sub });
  fixture.accountStore.seedAccount(makeAccount({ identity, email, isAdmin: true }));
  const oldClaims = fixture.accountHarness.state.oidc.claims;
  fixture.accountHarness.state.oidc.claims = { sub, email };
  try {
    const login = await completeLogin(fixture.accountHarness);
    assert.equal(login.response.status, 303, 'the fixture signs in the administrator through the real account callback');
    assert.ok(login.sessionCookie);
    return { pair: cookiePair(login.sessionCookie) };
  } finally {
    if (oldClaims === undefined) delete fixture.accountHarness.state.oidc.claims;
    else fixture.accountHarness.state.oidc.claims = oldClaims;
  }
}

async function seedImportedCohosts(fixture, lifecycle) {
  const imported = [resourceId, ...cohostIds].map((id, index) => ({
    id,
    title: id === resourceId ? 'Ficha importada con cohosts' : `Ficha cohost ${index}`,
    url: lifecycle.kind === 'collision' || id === resourceId ? INITIAL_URL : UNRELATED_COHOST_URL,
    description: 'Recurso importado para el recorrido de ciclo de vida.',
    category: 'Contenido',
    kind: 'content',
    format: 'Artículo',
    topics: ['AWS'],
    published: true,
    hidden: false,
    approvalRevoked: false,
    directoryControl: 'editorial',
    version: 4,
  }));
  const reservationPuts = lifecycle.kind === 'collision'
    ? [{ key: currentUrlKey(INITIAL_URL), value: currentUrlCollision(INITIAL_URL, imported.map(({ id }) => id)) }]
    : [
      { key: currentUrlKey(INITIAL_URL), value: currentUrlReservation(INITIAL_URL, resourceId) },
      { key: currentUrlKey(UNRELATED_COHOST_URL), value: currentUrlCollision(UNRELATED_COHOST_URL, cohostIds) },
    ];
  assert.equal(await fixture.creatorStore.transact({
    checks: [
      ...imported.map(({ id }) => ({ key: `resource:${id}`, version: null })),
      ...reservationPuts.map(({ key }) => ({ key, version: null })),
    ],
    puts: [
      ...imported.map((resource) => ({ key: `resource:${resource.id}`, value: resource })),
      ...reservationPuts,
    ],
  }), true, 'the imported resource and independently seeded cohosts exist before the claim');
  return imported;
}

async function assertCohostState(fixture, lifecycle, imported) {
  if (lifecycle.kind === 'collision') {
    assert.deepEqual(await fixture.creatorStore.get(currentUrlKey(INITIAL_URL)), currentUrlCollision(INITIAL_URL, cohostIds),
      'the original collision keeps both unrelated cohosts after the granted resource leaves');
  } else {
    assert.equal(await fixture.creatorStore.get(currentUrlKey(INITIAL_URL)), null,
      'the unique old reservation is deleted when its granted resource leaves');
    assert.deepEqual(await fixture.creatorStore.get(currentUrlKey(UNRELATED_COHOST_URL)),
      currentUrlCollision(UNRELATED_COHOST_URL, cohostIds), 'the unrelated cohost reservation remains intact');
  }
  for (const resource of imported.filter(({ id }) => cohostIds.includes(id))) {
    assert.deepEqual(await fixture.rawResource(resource.id), resource, 'URL maintenance leaves unrelated cohost records untouched');
  }
}

function writesTo(capture, method, path) {
  return capture.writes().filter((write) => write.method === method && write.path === path);
}

async function responseFor(capture, method, path) {
  await expect.poll(() => writesTo(capture, method, path)[0]?.status).toBeTruthy();
  return writesTo(capture, method, path)[0];
}

function linkEditForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="enlace"]');
}

for (const lifecycle of reservationCases) {
test(`un recurso concedido conserva identidad al editar, retirar y volver a agregar (${lifecycle.label})`, async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profileFields: { slug: 'creator-cohost-lifecycle' } });
  const imported = await seedImportedCohosts(fixture, lifecycle);
  const ownerPrincipal = await fixture.principal(cookie);

  const claim = await api(fixture, cookie, '/api/creador/reclamaciones', {
    method: 'POST',
    body: { resources: [{ resourceId, url: INITIAL_URL }] },
  });
  assert.equal(claim.response.status, 202, JSON.stringify(claim.body));
  assert.deepEqual(claim.body.claim.resourceIds, [resourceId], 'the request names the exact imported resource ID and its observed URL');
  assert.deepEqual(await fixture.rawResource(resourceId), imported[0], 'submitting a claim does not grant editing authority');

  const admin = await adminCookie(fixture);
  const grant = await api(fixture, admin, '/api/admin/reclamaciones/vincular', {
    method: 'POST',
    body: { accountId: ownerPrincipal.accountId, resourceIds: [resourceId] },
  });
  assert.equal(grant.response.status, 200, JSON.stringify(grant.body));
  assert.deepEqual(grant.body.linkedResourceIds, [resourceId]);
  const grantedResource = await fixture.rawResource(resourceId);
  const rawOwner = await fixture.rawOwner(cookie);
  assert.equal(grantedResource.editorProfileId, rawOwner.profile.id);
  assert.equal(grantedResource.directoryControl, 'creator');
  assert.deepEqual(await fixture.creatorStore.get(currentUrlKey(INITIAL_URL)), lifecycle.kind === 'collision'
    ? currentUrlCollision(INITIAL_URL, [resourceId, ...cohostIds])
    : currentUrlReservation(INITIAL_URL, resourceId));

  const initialOwner = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(initialOwner.response.status, 200);
  const grantedLink = initialOwner.body.links.find((link) => link.resourceId === resourceId);
  assert.ok(grantedLink, 'the real administrative grant creates the owner placement');
  const series = await api(fixture, cookie, '/api/creador/series', {
    method: 'POST',
    body: { name: 'Capítulo antes de retirar', slug: 'capitulo-antes-de-retirar', profileVersion: initialOwner.body.profile.version },
  });
  assert.equal(series.response.status, 201, JSON.stringify(series.body));
  const chapter = await addChapter(fixture, cookie, series.body.series.id, grantedLink.placementId);
  assert.equal(chapter.profileVersion, series.body.profileVersion + 1);
  assert.deepEqual((await fixture.rawPlacement(cookie, grantedLink.placementId)).series, { [series.body.series.id]: { position: 0 } });

  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  const capture = await captureCreatorApi(page);
  try {
    const activeRow = page.locator(`[data-link-row="${grantedLink.placementId}"]`);
    await activeRow.getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const activeEditor = linkEditForm(page);
    await activeEditor.getByLabel('URL', { exact: true }).fill(ACTIVE_URL);
    await activeEditor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    const activeEdit = await responseFor(capture, 'PATCH', `/api/creador/enlaces/${grantedLink.placementId}/editar`);
    assert.equal(activeEdit.status, 200, JSON.stringify(activeEdit.responseBody));
    await expect(page.locator(`[data-link-row="${grantedLink.placementId}"]`))
      .toContainText(new URL(ACTIVE_URL).host);

    const activeResource = await fixture.rawResource(resourceId);
    assert.equal(activeResource.id, resourceId, 'editing the URL changes metadata without replacing the admitted resource');
    assert.equal(activeResource.url, ACTIVE_URL);
    await assertCohostState(fixture, lifecycle, imported);
    assert.deepEqual(await fixture.creatorStore.get(currentUrlKey(ACTIVE_URL)), currentUrlReservation(ACTIVE_URL, resourceId));
    assert.deepEqual((await fixture.rawPlacement(cookie, grantedLink.placementId)).series,
      { [series.body.series.id]: { position: 0 } }, 'editing shared metadata preserves this placement and its chapter');

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator(`[data-link-row="${grantedLink.placementId}"]`)
      .getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    const removal = await responseFor(capture, 'DELETE', `/api/creador/enlaces/${grantedLink.placementId}`);
    assert.equal(removal.status, 204);
    await expect(page.locator(`[data-link-row="${grantedLink.placementId}"]`)).toHaveCount(0);
    assert.equal(await fixture.rawPlacement(cookie, grantedLink.placementId), null);
    assert.deepEqual(await fixture.rawResource(resourceId), activeResource, 'removal retains the granted resource and its current URL');

    const retained = page.locator(`[data-retained-resource="${resourceId}"]`);
    await expect(retained).toBeVisible();
    await retained.getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const retiredEditor = linkEditForm(page);
    await expect(retiredEditor.getByLabel('URL', { exact: true })).toHaveValue(ACTIVE_URL);
    await retiredEditor.getByLabel('URL', { exact: true }).fill(RETIRED_URL);
    await retiredEditor.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
    const retiredEdit = await responseFor(capture, 'PATCH', `/api/creador/recursos/${resourceId}`);
    assert.equal(retiredEdit.status, 200, JSON.stringify(retiredEdit.responseBody));
    await expect(retained).toContainText(new URL(RETIRED_URL).host);

    const retiredResource = await fixture.rawResource(resourceId);
    assert.equal(retiredResource.id, resourceId);
    assert.equal(retiredResource.url, RETIRED_URL);
    assert.equal(await fixture.creatorStore.get(currentUrlKey(ACTIVE_URL)), null);
    assert.deepEqual(await fixture.creatorStore.get(currentUrlKey(RETIRED_URL)), currentUrlReservation(RETIRED_URL, resourceId));
    await assertCohostState(fixture, lifecycle, imported);

    await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
    const readd = await responseFor(capture, 'POST', '/api/creador/enlaces');
    assert.equal(readd.status, 201, JSON.stringify(readd.responseBody));
    assert.equal(readd.responseBody.link.resourceId, resourceId);
    assert.equal(readd.responseBody.link.placementId, grantedLink.placementId, 're-add restores the same stable placement identity');
    assert.equal(readd.responseBody.link.url, RETIRED_URL, 're-add uses the current URL from the retained resource editor');
    assert.deepEqual(readd.responseBody.link.series, [], 're-add does not restore the chapter removed with the placement');
    const readdedPlacement = await fixture.rawPlacement(cookie, grantedLink.placementId);
    assert.equal(readdedPlacement.resourceId, resourceId);
    assert.deepEqual(readdedPlacement.series ?? {}, {});
    assert.deepEqual(await fixture.rawResource(resourceId), retiredResource, 're-add leaves shared resource metadata unchanged');
    assert.deepEqual(await fixture.creatorStore.get(currentUrlKey(RETIRED_URL)), currentUrlReservation(RETIRED_URL, resourceId));
    await assertCohostState(fixture, lifecycle, imported);

    const freshOwner = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(freshOwner.response.status, 200);
    assert.deepEqual(freshOwner.body.links.map(({ placementId, resourceId: id, url, series: memberships }) => ({ placementId, resourceId: id, url, series: memberships })), [
      { placementId: grantedLink.placementId, resourceId, url: RETIRED_URL, series: [] },
    ], 'a fresh owner API read reports the restored stable placement, current URL, and no chapter');
    assert.deepEqual(freshOwner.body.editableResources.map(({ id, url }) => ({ id, url })), [{ id: resourceId, url: RETIRED_URL }]);

    const publish = await api(fixture, cookie, '/api/creador/perfil/publicar', {
      method: 'POST', body: { version: freshOwner.body.profile.version },
    });
    assert.equal(publish.response.status, 200, JSON.stringify(publish.body));
    const publicProfile = await page.goto(`${fixture.origin}/c/${freshOwner.body.profile.slug}/`);
    expect(publicProfile?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: freshOwner.body.profile.displayName, exact: true })).toBeVisible();
    const publicLink = page.locator(`[data-creator-link-id="${grantedLink.placementId}"]`);
    await expect(publicLink).toHaveAttribute('href', RETIRED_URL);
    await expect(page.locator('[data-creator-profile] [data-creator-link-id]')).toHaveCount(1);
    await expect(page.locator('.creator-profile__series')).toHaveCount(0,
      'the public read does not restore a series membership that belonged to the removed placement');

    assert.equal(writesTo(capture, 'PATCH', `/api/creador/enlaces/${grantedLink.placementId}/editar`).length, 1);
    assert.equal(writesTo(capture, 'DELETE', `/api/creador/enlaces/${grantedLink.placementId}`).length, 1);
    assert.equal(writesTo(capture, 'PATCH', `/api/creador/recursos/${resourceId}`).length, 1);
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1);
  } finally {
    await capture.stop();
  }
});
}

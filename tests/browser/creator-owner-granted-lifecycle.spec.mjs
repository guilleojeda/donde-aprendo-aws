import assert from 'node:assert/strict';
import { currentUrlCollision, currentUrlKey, currentUrlReservation } from '../../src/lib/catalog-url.mjs';
import { completeLogin, cookiePair, makeAccount, makeIdentity } from '../fixtures/account-auth.mjs';
import {
  test, expect, api, addLink, addChapter, captureCreatorApi, loggedInOwner,
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

async function responseFor(capture, method, path, index = 0) {
  await expect.poll(() => writesTo(capture, method, path)[index]?.status).toBeTruthy();
  return writesTo(capture, method, path)[index];
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
  assert.equal(claim.body.schemaVersion, 2);
  assert.equal(claim.body.operation, 'create-claim');
  assert.equal(claim.body.disposition, 'submitted');
  assert.equal(claim.body.profileId, (await fixture.rawOwner(cookie)).profile.id);
  assert.ok(claim.body.claimId);
  assert.ok(Number.isSafeInteger(claim.body.claimVersion));
  assert.equal(Object.hasOwn(claim.body, 'claim'), false,
    'the write acknowledgement identifies the committed claim without returning a separate client projection');
  assert.equal(Object.hasOwn(claim.body, 'creatorVersion'), false,
    'claim submission keeps its independent history version and does not advance the creator revision');
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
  const resource = initialOwner.body.resources.find(({ id }) => id === resourceId);
  const grantedPlacementId = Object.entries(initialOwner.body.placements)
    .find(([, placement]) => placement.resourceId === resourceId)?.[0];
  const originalPlacement = initialOwner.body.placements[grantedPlacementId];
  assert.ok(resource?.metadataEditable, 'the owner read projects current metadata authority only after the real grant');
  assert.ok(grantedPlacementId, 'the real administrative grant creates the owner placement');
  const series = await api(fixture, cookie, '/api/creador/series', {
    method: 'POST',
    body: { creatorVersion: initialOwner.body.creatorVersion, name: 'Capítulo antes de retirar', slug: 'capitulo-antes-de-retirar' },
  });
  assert.equal(series.response.status, 201, JSON.stringify(series.body));
  const chapter = await addChapter(fixture, cookie, series.body.seriesId, grantedPlacementId);
  assert.equal(chapter.operation, 'add-chapter');
  const withChapter = await api(fixture, cookie, '/api/creador/perfil');
  assert.deepEqual(withChapter.body.series[series.body.seriesId].chapters, [grantedPlacementId]);

  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  const capture = await captureCreatorApi(page);
  try {
    const activeRow = page.locator(`[data-link-row="${grantedPlacementId}"]`);
    await activeRow.getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const activeEditor = linkEditForm(page);
    await activeEditor.getByLabel('URL', { exact: true }).fill(ACTIVE_URL);
    await activeEditor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    const activeEdit = await responseFor(capture, 'PATCH', `/api/creador/enlaces/${grantedPlacementId}/editar`);
    assert.equal(activeEdit.status, 200, JSON.stringify(activeEdit.responseBody));
    assert.equal(activeEdit.responseBody.operation, 'edit-link');
    await expect(page.locator(`[data-link-row="${grantedPlacementId}"]`))
      .toContainText(new URL(ACTIVE_URL).host);

    const activeResource = await fixture.rawResource(resourceId);
    assert.equal(activeResource.id, resourceId, 'editing the URL changes metadata without replacing the admitted resource');
    assert.equal(activeResource.url, ACTIVE_URL);
    await assertCohostState(fixture, lifecycle, imported);
    assert.deepEqual(await fixture.creatorStore.get(currentUrlKey(ACTIVE_URL)), currentUrlReservation(ACTIVE_URL, resourceId));
    assert.deepEqual((await fixture.rawOwner(cookie)).profile.series[series.body.seriesId].chapters,
      [grantedPlacementId], 'editing shared metadata preserves this placement and its chapter');

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator(`[data-link-row="${grantedPlacementId}"]`)
      .getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    const removal = await responseFor(capture, 'DELETE', `/api/creador/enlaces/${grantedPlacementId}`);
    assert.equal(removal.status, 200);
    assert.equal(removal.responseBody.operation, 'remove-link');
    await expect(page.locator(`[data-link-row="${grantedPlacementId}"]`)).toHaveCount(0);
    assert.equal(Object.hasOwn((await fixture.rawOwner(cookie)).profile.placements, grantedPlacementId), false);
    assert.deepEqual(await fixture.rawResource(resourceId), activeResource, 'removal retains the granted resource and its current URL');

    const retained = page.locator(`[data-retained-resource="${resourceId}"]`);
    await expect(retained).toBeVisible();
    await retained.getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const retiredEditor = linkEditForm(page);
    await expect(retiredEditor.getByLabel('URL', { exact: true })).toHaveValue(ACTIVE_URL);
    await retiredEditor.getByLabel('URL', { exact: true }).fill(RETIRED_URL);
    await retiredEditor.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
    const retiredEdit = await responseFor(capture, 'PATCH', '/api/creador/recursos');
    assert.equal(retiredEdit.status, 200, JSON.stringify(retiredEdit.responseBody));
    assert.equal(new URL(retiredEdit.url).searchParams.get('id'), resourceId,
      'resource metadata edits use the literal query-ID route');
    assert.equal(retiredEdit.responseBody.operation, 'edit-resource');
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
    assert.equal(readd.responseBody.operation, 'reinclude-link');
    assert.equal(readd.responseBody.disposition, 'attached');
    assert.equal(readd.responseBody.resourceId, resourceId);
    assert.equal(readd.responseBody.placementId, grantedPlacementId, 're-add restores the same stable placement identity');
    assert.ok(readd.responseBody.resourceVersion >= retiredResource.version);
    const readdedOwner = await fixture.rawOwner(cookie);
    assert.deepEqual(readdedOwner.profile.placements[grantedPlacementId], originalPlacement,
      'reinclude keeps the saved placement options');
    assert.deepEqual(readdedOwner.profile.series[series.body.seriesId].chapters, [],
      're-add does not restore the chapter removed with the placement');
    assert.deepEqual(await fixture.rawResource(resourceId), retiredResource, 're-add leaves shared resource metadata unchanged');
    assert.deepEqual(await fixture.creatorStore.get(currentUrlKey(RETIRED_URL)), currentUrlReservation(RETIRED_URL, resourceId));
    await assertCohostState(fixture, lifecycle, imported);

    const freshOwner = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(freshOwner.response.status, 200);
    assert.deepEqual(freshOwner.body.placements[grantedPlacementId], readdedOwner.profile.placements[grantedPlacementId]);
    assert.equal(freshOwner.body.resources.find(({ id }) => id === resourceId).url, RETIRED_URL);
    assert.equal(freshOwner.body.resources.find(({ id }) => id === resourceId).metadataEditable, true);
    assert.deepEqual(freshOwner.body.series[series.body.seriesId].chapters, []);

    const publish = await api(fixture, cookie, '/api/creador/perfil/publicar', {
      method: 'POST', body: { creatorVersion: freshOwner.body.creatorVersion },
    });
    assert.equal(publish.response.status, 200, JSON.stringify(publish.body));
    const publicProfile = await page.goto(`${fixture.origin}/c/${freshOwner.body.profile.slug}/`);
    expect(publicProfile?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: freshOwner.body.profile.displayName, exact: true })).toBeVisible();
    const publicLink = page.locator(`[data-creator-link-id="${grantedPlacementId}"]`);
    await expect(publicLink).toHaveAttribute('href', RETIRED_URL);
    await expect(page.locator('[data-creator-profile] [data-creator-link-id]')).toHaveCount(1);
    await expect(page.locator('.creator-profile__series')).toHaveCount(0,
      'the public read does not restore a series membership that belonged to the removed placement');

    assert.equal(writesTo(capture, 'PATCH', `/api/creador/enlaces/${grantedPlacementId}/editar`).length, 1);
    assert.equal(writesTo(capture, 'DELETE', `/api/creador/enlaces/${grantedPlacementId}`).length, 1);
    assert.equal(writesTo(capture, 'PATCH', '/api/creador/recursos').length, 1);
    assert.equal(new URL(writesTo(capture, 'PATCH', '/api/creador/recursos')[0].url).searchParams.get('id'), resourceId,
      'resource IDs remain literal query parameters rather than path segments');
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1);
  } finally {
    await capture.stop();
  }
});
}

test('URL_COLLISION keeps Add-by-URL rejected after a later exact grant', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profileFields: { slug: 'creator-url-collision-rejected' } });
  const ownLink = await addLink(fixture, cookie, { title: 'Enlace propio compartido', url: INITIAL_URL });
  const imported = cohostIds.map((id, index) => ({
    id,
    title: `Cohost de revisión ${index + 1}`,
    url: INITIAL_URL,
    description: 'Ficha importada para probar la colisión de URL.',
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
  const collisionKey = currentUrlKey(INITIAL_URL);
  const initialReservation = await fixture.creatorStore.get(collisionKey);
  assert.ok(initialReservation, 'the owner placement first has a unique reservation');
  assert.equal(await fixture.creatorStore.transact({
    checks: [
      ...imported.map(({ id }) => ({ key: `resource:${id}`, version: null })),
      { key: collisionKey, version: initialReservation.version },
    ],
    puts: [
      ...imported.map((resource) => ({ key: `resource:${resource.id}`, value: resource })),
      { key: collisionKey, value: currentUrlCollision(INITIAL_URL, [ownLink.resourceId, ...imported.map(({ id }) => id)]) },
    ],
  }), true, 'the already placed owner resource and imported cohosts now share an exact collision');
  const ownResourceBefore = await fixture.rawResource(ownLink.resourceId);
  const beforeCollision = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(beforeCollision.response.status, 200);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  const capture = await captureCreatorApi(page);
  try {
    await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const addForm = page.locator('[data-owner-form="alta-enlace"]');
    await expect(addForm).toBeVisible();
    await addForm.getByLabel('Título', { exact: true }).fill('No autorizado sobre un cohost');
    await addForm.getByLabel('URL', { exact: true }).fill(INITIAL_URL);
    await addForm.getByLabel('Descripción', { exact: false }).fill('Borrador que debe conservarse');
    await addForm.getByRole('button', { name: 'Agregar enlace', exact: true }).click();

    const rejected = await responseFor(capture, 'POST', '/api/creador/enlaces');
    assert.equal(rejected.status, 409, JSON.stringify(rejected.responseBody));
    assert.equal(rejected.responseBody.error, 'URL_COLLISION');
    const collisionNotice = addForm.getByRole('alert').filter({ hasText: 'Hay varias fichas con esa URL' });
    await expect(collisionNotice).toHaveCount(1);
    await expect(collisionNotice).toBeVisible();
    await expect(addForm.locator('[aria-invalid="true"]')).toHaveCount(0);
    await expect(addForm.getByLabel('URL', { exact: true })).toBeEditable();
    await expect(page.locator('[data-owner-form="alta-enlace"]')).toBeVisible();
    await expect(addForm.getByLabel('Título', { exact: true })).toHaveValue('No autorizado sobre un cohost');
    await expect(addForm.getByLabel('Descripción', { exact: false })).toHaveValue('Borrador que debe conservarse');
    await expect(page.locator('[data-owner-form="enlace"]')).toHaveCount(0,
      'the local URL match never opens an unrelated cohost editor');
    for (const resource of imported) assert.deepEqual(await fixture.rawResource(resource.id), resource,
      'the rejected add leaves every cohost resource unchanged');
    const afterCollision = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(afterCollision.response.status, 200);
    assert.deepEqual(afterCollision.body.profile, beforeCollision.body.profile,
      'the rejected add does not alter profile fields');
    assert.equal(afterCollision.body.creatorVersion, beforeCollision.body.creatorVersion,
      'the rejected add does not advance the creator revision');
    assert.deepEqual(await fixture.rawResource(ownLink.resourceId), ownResourceBefore,
      'the local cohost match is not used to edit the owner resource');

    const chosen = imported[0];
    const claim = await api(fixture, cookie, '/api/creador/reclamaciones', {
      method: 'POST', body: { resources: [{ resourceId: chosen.id, url: chosen.url }] },
    });
    assert.equal(claim.response.status, 202, JSON.stringify(claim.body));
    const admin = await adminCookie(fixture);
    const ownerPrincipal = await fixture.principal(cookie);
    const grant = await api(fixture, admin, '/api/admin/reclamaciones/vincular', {
      method: 'POST', body: { accountId: ownerPrincipal.accountId, resourceIds: [chosen.id] },
    });
    assert.equal(grant.response.status, 200, JSON.stringify(grant.body));
    assert.deepEqual(grant.body.linkedResourceIds, [chosen.id]);
    const ownerAfterGrant = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(ownerAfterGrant.response.status, 200);
    assert.ok(Object.values(ownerAfterGrant.body.placements).some(({ resourceId: id }) => id === chosen.id),
      'the later exact grant independently places the selected cohost');

    await expect(page.locator('[data-owner-form="alta-enlace"]')).toBeVisible();
    await addForm.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const staleRetry = await responseFor(capture, 'POST', '/api/creador/enlaces', 1);
    assert.equal(staleRetry.status, 409, JSON.stringify(staleRetry.responseBody));
    assert.equal(staleRetry.responseBody.error, 'CREATOR_CONFLICT',
      'the page’s prior owner read cannot silently rebase the draft across an external exact grant');
    await expect(addForm.getByLabel('Título', { exact: true })).toHaveValue('No autorizado sobre un cohost');
    await expect(addForm.getByLabel('Descripción', { exact: false })).toHaveValue('Borrador que debe conservarse');

    await addForm.getByRole('button', { name: 'Guardar mi borrador', exact: true }).click();
    const retry = await responseFor(capture, 'POST', '/api/creador/enlaces', 2);
    assert.equal(retry.status, 409, JSON.stringify(retry.responseBody));
    assert.equal(retry.responseBody.error, 'URL_COLLISION');
    await expect(addForm.getByLabel('URL', { exact: true })).toBeEditable();
    await expect(page.locator('[data-owner-form="alta-enlace"]')).toBeVisible();
    await expect(addForm.getByLabel('Título', { exact: true })).toHaveValue('No autorizado sobre un cohost');
    await expect(addForm.getByLabel('Descripción', { exact: false })).toHaveValue('Borrador que debe conservarse');
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 3);
    const afterRetry = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(afterRetry.response.status, 200);
    assert.deepEqual(Object.values(afterRetry.body.placements).map(({ resourceId }) => resourceId).sort(), [ownLink.resourceId, chosen.id].sort(),
      'only the explicit administrative grant changed the owner placements');
    assert.equal(afterRetry.body.creatorVersion, ownerAfterGrant.body.creatorVersion,
      'the rejected Add-by-URL retry does not advance the profile');
    for (const resource of imported) {
      const current = await fixture.rawResource(resource.id);
      assert.equal(current.title, resource.title, 'the URL draft never overwrites cohost metadata');
      assert.equal(current.url, resource.url);
    }
    assert.deepEqual(await fixture.rawResource(ownLink.resourceId), ownResourceBefore,
      'the rejected draft never overwrites the owner cohost either');
  } finally {
    await capture.stop();
  }
});

test('literal dot resource IDs remain editable and re-addable through the retained editor', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profileFields: { slug: 'creator-literal-dot-resource' } });
  const ids = ['.', '..'];
  const resources = ids.map((id, index) => ({
    id,
    title: `Ficha literal ${index + 1}`,
    url: `https://literal-id.example.invalid/resource-${index + 1}`,
    description: `Descripción de ${id}`,
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
  assert.equal(await fixture.creatorStore.transact({
    checks: resources.map(({ id }) => ({ key: `resource:${id}`, version: null })),
    puts: resources.map((resource) => ({ key: `resource:${resource.id}`, value: resource })),
  }), true, 'both admitted exact IDs exist without URL reservations');

  const claim = await api(fixture, cookie, '/api/creador/reclamaciones', {
    method: 'POST', body: { resources: resources.map(({ id, url }) => ({ resourceId: id, url })) },
  });
  assert.equal(claim.response.status, 202, JSON.stringify(claim.body));
  const admin = await adminCookie(fixture);
  const ownerPrincipal = await fixture.principal(cookie);
  const placements = new Map();
  const initialResourceVersions = new Map();
  for (const resource of resources) {
    const grant = await api(fixture, admin, '/api/admin/reclamaciones/vincular', {
      method: 'POST', body: { accountId: ownerPrincipal.accountId, resourceIds: [resource.id] },
    });
    assert.equal(grant.response.status, 200, JSON.stringify(grant.body));
    assert.deepEqual(grant.body.linkedResourceIds, [resource.id]);
    const owner = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(owner.response.status, 200);
    const entry = Object.entries(owner.body.placements).find(([, placement]) => placement.resourceId === resource.id);
    assert.ok(entry, `the exact grant creates placement for literal ID ${resource.id}`);
    placements.set(resource.id, { placementId: entry[0], resourceId: resource.id });
    initialResourceVersions.set(resource.id, owner.body.resources.find(({ id }) => id === resource.id).version);
  }

  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  const capture = await captureCreatorApi(page);
  try {
    for (const resource of resources) {
      const link = placements.get(resource.id);
      const row = page.locator(`[data-link-row="${link.placementId}"]`);
      page.once('dialog', (dialog) => dialog.accept());
      await row.getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
      const removal = await responseFor(capture, 'DELETE', `/api/creador/enlaces/${link.placementId}`);
      assert.equal(removal.status, 200);
      await expect(page.locator(`[data-link-row="${link.placementId}"]`)).toHaveCount(0);

      const retained = page.locator(`[data-retained-resource="${resource.id}"]`);
      await expect(retained).toBeVisible();
      await retained.getByRole('button', { name: 'Editar ficha', exact: true }).click();
      const editForm = page.locator('[data-owner-form="enlace"]');
      const title = `Ficha corregida ${resource.id}`;
      const url = `https://literal-id.example.invalid/edited-${resource.id === '.' ? 'dot' : 'dot-dot'}`;
      await editForm.getByLabel('Título', { exact: true }).fill(title);
      await editForm.getByLabel('URL', { exact: true }).fill(url);
      await editForm.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
      const patch = await responseFor(capture, 'PATCH', '/api/creador/recursos', ids.indexOf(resource.id));
      assert.equal(patch.status, 200, JSON.stringify(patch.responseBody));
      assert.equal(new URL(patch.url).searchParams.get('id'), resource.id,
        'the request keeps the literal dot ID in the collection query');
      assert.deepEqual([...new URL(patch.url).searchParams.keys()], ['id']);
      await expect(page.locator(`[data-retained-resource="${resource.id}"]`)).toContainText(new URL(url).host);
      const edited = await fixture.rawResource(resource.id);
      assert.equal(edited.id, resource.id, 'the exact granted resource identity remains unchanged');
      assert.equal(edited.title, title, 'the explicit retained-resource edit persists');
      assert.equal(edited.url, url);
      assert.ok(edited.version > initialResourceVersions.get(resource.id),
        'the owner resource revision advances after its retained metadata edit');
      assert.equal(Object.hasOwn((await fixture.rawOwner(cookie)).profile.placements, link.placementId), false,
        'editing the retained resource does not re-create a placement');

      await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
      const readd = await responseFor(capture, 'POST', '/api/creador/enlaces', ids.indexOf(resource.id));
      assert.equal(readd.status, 201, JSON.stringify(readd.responseBody));
      assert.equal(readd.responseBody.operation, 'reinclude-link');
      assert.equal(readd.responseBody.disposition, 'attached');
      assert.equal(readd.responseBody.resourceId, resource.id);
      assert.equal(readd.responseBody.placementId, link.placementId,
        're-add keeps the stable placement ID for the exact literal resource');
      const readded = await fixture.rawOwner(cookie);
      assert.equal(readded.profile.placements[link.placementId].resourceId, resource.id);
      assert.equal((await fixture.rawResource(resource.id)).url, url);
      assert.ok(Object.values(readded.profile.series).every(({ chapters }) => !chapters.includes(link.placementId)));
      assert.equal((await fixture.rawResource(resource.id)).id, resource.id);
    }
    assert.equal(writesTo(capture, 'PATCH', '/api/creador/recursos').length, 2,
      'both literal IDs use the query fallback exactly once');
  } finally {
    await capture.stop();
  }
});

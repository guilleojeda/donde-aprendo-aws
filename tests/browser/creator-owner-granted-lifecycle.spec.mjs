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
    assert.equal(new URL(writesTo(capture, 'PATCH', `/api/creador/recursos/${resourceId}`)[0].url).search, '',
      'ordinary resource IDs retain the existing path-based edit route');
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1);
  } finally {
    await capture.stop();
  }
});
}

test('Add-by-URL confirms a unique duplicate before offering an explicit correction', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profileFields: { slug: 'creator-unique-url-duplicate' } });
  const existing = await addLink(fixture, cookie, { title: 'Título original', url: 'https://creator.example.invalid/unique-duplicate' });
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  const capture = await captureCreatorApi(page);
  try {
    await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const addForm = page.locator('[data-owner-form="alta-enlace"]');
    await expect(addForm).toBeVisible();
    await addForm.getByLabel('Título', { exact: true }).fill('Corrección manual');
    await addForm.getByLabel('URL', { exact: true }).fill(existing.url);
    await addForm.getByLabel('Descripción', { exact: false }).fill('Descripción corregida después del duplicado');
    await addForm.getByLabel('Proponer al directorio', { exact: false }).uncheck();
    await addForm.getByRole('button', { name: 'Agregar enlace', exact: true }).click();

    const duplicate = await responseFor(capture, 'POST', '/api/creador/enlaces');
    assert.equal(duplicate.status, 200, JSON.stringify(duplicate.responseBody));
    assert.equal(duplicate.responseBody.created, false, 'the server confirms the unique reservation as an existing placement');
    const editForm = page.locator('[data-owner-form="enlace"]');
    await expect(editForm).toBeVisible();
    await expect(editForm.getByLabel('Título', { exact: true })).toHaveValue('Corrección manual');
    await expect(editForm.getByLabel('Descripción', { exact: false })).toHaveValue('Descripción corregida después del duplicado');
    await expect(editForm.getByLabel('Proponer al directorio', { exact: false })).not.toBeChecked();
    await expect(editForm.locator('[data-owner-form-status="enlace"]'))
      .toContainText('Ese contenido ya estaba en tu página');
    assert.equal(writesTo(capture, 'PATCH', `/api/creador/enlaces/${existing.placementId}/editar`).length, 0,
      'the unique duplicate check does not save a correction on its own');

    await editForm.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    const save = await responseFor(capture, 'PATCH', `/api/creador/enlaces/${existing.placementId}/editar`);
    assert.equal(save.status, 200, JSON.stringify(save.responseBody));
    assert.equal(save.responseBody.link.title, 'Corrección manual');
    assert.equal(save.responseBody.link.selectedForDirectory, false);
    assert.equal(save.responseBody.link.placementId, existing.placementId);
    const persisted = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(persisted.response.status, 200);
    assert.equal(persisted.body.links[0].placementId, existing.placementId);
    assert.equal(persisted.body.links[0].resourceId, existing.resourceId);
    assert.equal(persisted.body.links[0].title, 'Corrección manual');
    assert.equal(persisted.body.links[0].selectedForDirectory, false);
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1,
      'the follow-up Save does not repeat the URL add');
  } finally {
    await capture.stop();
  }
});

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
    await expect(page.locator('[data-owner-form="alta-enlace"]')).toBeVisible();
    await expect(addForm.getByLabel('Título', { exact: true })).toHaveValue('No autorizado sobre un cohost');
    await expect(addForm.getByLabel('Descripción', { exact: false })).toHaveValue('Borrador que debe conservarse');
    await expect(page.locator('[data-owner-form="enlace"]')).toHaveCount(0,
      'the local URL match never opens an unrelated cohost editor');
    await expect(page.locator('[data-owner-compare]')).toHaveCount(0,
      'a definitive collision offers no recovery comparison or adoption');
    for (const resource of imported) assert.deepEqual(await fixture.rawResource(resource.id), resource,
      'the rejected add leaves every cohost resource unchanged');
    const afterCollision = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(afterCollision.response.status, 200);
    assert.deepEqual(afterCollision.body.profile, beforeCollision.body.profile,
      'the rejected add does not alter the profile');
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
    assert.ok(ownerAfterGrant.body.links.some(({ resourceId: id }) => id === chosen.id),
      'the later exact grant independently places the selected cohost');

    await expect(page.locator('[data-owner-form="alta-enlace"]')).toBeVisible();
    await expect(page.locator('[data-owner-compare]')).toHaveCount(0,
      'the later exact grant cannot become a recovered successful add');
    await addForm.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const retry = await responseFor(capture, 'POST', '/api/creador/enlaces', 1);
    assert.equal(retry.status, 409, JSON.stringify(retry.responseBody));
    assert.equal(retry.responseBody.error, 'URL_COLLISION');
    await expect(page.locator('[data-owner-form="alta-enlace"]')).toBeVisible();
    await expect(addForm.getByLabel('Título', { exact: true })).toHaveValue('No autorizado sobre un cohost');
    await expect(page.locator('[data-owner-compare]')).toHaveCount(0);
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 2);
    const afterRetry = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(afterRetry.response.status, 200);
    assert.deepEqual(afterRetry.body.links.map(({ resourceId }) => resourceId), [ownLink.resourceId, chosen.id],
      'only the explicit administrative grant changed the owner placements');
    assert.equal(afterRetry.body.profile.version, ownerAfterGrant.body.profile.version,
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
  for (const resource of resources) {
    const grant = await api(fixture, admin, '/api/admin/reclamaciones/vincular', {
      method: 'POST', body: { accountId: ownerPrincipal.accountId, resourceIds: [resource.id] },
    });
    assert.equal(grant.response.status, 200, JSON.stringify(grant.body));
    assert.deepEqual(grant.body.linkedResourceIds, [resource.id]);
    const owner = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(owner.response.status, 200);
    const link = owner.body.links.find(({ resourceId }) => resourceId === resource.id);
    assert.ok(link, `the exact grant creates placement for literal ID ${resource.id}`);
    placements.set(resource.id, link);
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
      assert.equal(removal.status, 204);
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
      assert.equal(edited.version, link.resourceVersion + 1,
        'the resource version advances once after its grant version');
      assert.equal(await fixture.rawPlacement(cookie, link.placementId), null,
        'editing the retained resource does not re-create a placement');

      await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
      const readd = await responseFor(capture, 'POST', '/api/creador/enlaces', ids.indexOf(resource.id));
      assert.equal(readd.status, 201, JSON.stringify(readd.responseBody));
      assert.equal(readd.responseBody.link.resourceId, resource.id);
      assert.equal(readd.responseBody.link.placementId, link.placementId,
        're-add keeps the stable placement ID for the exact literal resource');
      assert.equal(readd.responseBody.link.url, url);
      const readded = await fixture.rawPlacement(cookie, link.placementId);
      assert.equal(readded.resourceId, resource.id);
      assert.deepEqual(readded.series ?? {}, {});
      assert.equal((await fixture.rawResource(resource.id)).id, resource.id);
    }
    assert.equal(writesTo(capture, 'PATCH', '/api/creador/recursos').length, 2,
      'both literal IDs use the query fallback exactly once');
  } finally {
    await capture.stop();
  }
});

const testCatalogRow = (id, url) => ({ id, title: 'Ficha ' + id, url, category: 'Contenido',
  kind: 'content', format: 'Artículo', topics: ['AWS'], published: true, hidden: false,
  directoryControl: 'editorial', version: 1 });

async function putCatalogRows(fixture, records, url, reservation) {
  assert.equal(await fixture.creatorStore.transact({
    checks: records.map(({ id }) => ({ key: 'resource:' + id, version: null })),
    puts: [...records.map((value) => ({ key: 'resource:' + value.id, value })),
      ...(reservation ? [{ key: currentUrlKey(url), value: reservation }] : [])],
  }), true);
}

async function exactGrant(fixture, cookie, resourceId, url) {
  const claim = await api(fixture, cookie, '/api/creador/reclamaciones', {
    method: 'POST', body: { resources: [{ resourceId, url }] },
  });
  assert.equal(claim.response.status, 202, JSON.stringify(claim.body));
  const admin = await adminCookie(fixture);
  const ownerPrincipal = await fixture.principal(cookie);
  const grant = await api(fixture, admin, '/api/admin/reclamaciones/vincular', {
    method: 'POST', body: { accountId: ownerPrincipal.accountId, resourceIds: [resourceId] },
  });
  assert.equal(grant.response.status, 200, JSON.stringify(grant.body));
}

async function prepareUrlAdd(page, fixture, url) {
  await page.goto(fixture.origin + '/cuenta/?vista=enlaces');
  await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const form = page.locator('[data-owner-form="alta-enlace"]');
  await form.getByLabel('Título', { exact: true }).fill('Solo para el alta');
  await form.getByLabel('URL', { exact: true }).fill(url);
  return form;
}

async function verifySeparateAddDraft({ fixture, cookie, form, cohostId, originalUrl, capture, responseLost = false }) {
  const title = 'Corrección para una ficha distinta';
  const url = 'https://literal.example.invalid/alta-manual/';
  await form.getByLabel('Título', { exact: true }).fill(title);
  await form.getByLabel('URL', { exact: true }).fill(url);
  await form.getByLabel('Proponer al directorio').uncheck();
  const cohost = await fixture.rawResource(cohostId);
  const before = await api(fixture, cookie, '/api/creador/perfil');
  await form.locator('[data-owner-compare]').click();
  const adopt = form.getByRole('button', { name: 'Usar la página guardada y conservar el alta', exact: true });
  await expect(adopt).toBeVisible();
  const candidates = form.locator('[data-owner-adopt-link]');
  await expect(candidates).toHaveCount(responseLost ? 1 : 0);
  if (responseLost) {
    const savedCohost = before.body.links.find(({ resourceId }) => resourceId === cohostId);
    await expect(candidates).toHaveAttribute('data-owner-adopt-link', savedCohost.placementId);
    await expect(candidates).toContainText(savedCohost.title);
  }
  await adopt.click();
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Título', { exact: true })).toHaveValue(title);
  await expect(form.getByLabel('Título', { exact: true })).toBeFocused();
  await expect(form.getByLabel('URL', { exact: true })).toHaveValue(url);
  await expect(form.getByLabel('Proponer al directorio')).not.toBeChecked();
  assert.equal(capture.writes().length, 1);
  assert.deepEqual((await api(fixture, cookie, '/api/creador/perfil')).body, before.body);
  await form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const manual = await responseFor(capture, 'POST', '/api/creador/enlaces', 1);
  assert.equal(manual.status, 201);
  assert.equal(manual.body.url, url);
  const final = await api(fixture, cookie, '/api/creador/perfil');
  assert.deepEqual(final.body.links.find(({ resourceId }) => resourceId === cohostId),
    before.body.links.find(({ resourceId }) => resourceId === cohostId));
  const newLink = final.body.links.find(({ resourceId }) => resourceId === manual.responseBody.link.resourceId);
  assert.equal(newLink.title, title);
  assert.equal(newLink.url, url);
  assert.equal(newLink.selectedForDirectory, false);
  assert.deepEqual(await fixture.rawResource(cohostId), cohost);
  assert.deepEqual(capture.writes().map(({ method, body }) => [method, body.url]), [['POST', originalUrl], ['POST', url]]);
}

test('recuperar un alta con rechazo de colisión perdido conserva el borrador separado de un cohost concedido', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const url = 'https://literal.example.invalid/lost-rejected/?q=%2f';
  const ids = ['resource-6b7d41f8-43b8-4fa7-a373-a975d6a44a3b', 'fresh-grant-wrong-b'];
  const matching = { ...testCatalogRow(ids[0], url), title: 'Solo para el alta', description: '',
    published: false, approvalRevoked: false, version: 0 };
  const cohost = testCatalogRow(ids[1], url);
  await putCatalogRows(fixture, [matching, cohost], url, currentUrlCollision(url, ids));
  const form = await prepareUrlAdd(page, fixture, url);
  const capture = await captureCreatorApi(page);
  let signal;
  let release;
  const arrived = new Promise((resolve) => { signal = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/creador/enlaces/', async (route) => {
    if (route.request().method() !== 'POST' || route.request().postDataJSON().url !== url) return route.continue();
    const actual = await route.fetch();
    signal({ status: actual.status(), body: await actual.json() });
    await held;
    await route.abort('failed');
  });
  try {
    await form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const actual = await arrived;
    assert.equal(actual.status, 409);
    assert.equal(actual.body.error, 'URL_COLLISION');
    await exactGrant(fixture, cookie, ids[0], url);
    release();
    await verifySeparateAddDraft({ fixture, cookie, form, cohostId: ids[0], originalUrl: url, capture, responseLost: true });
    assert.deepEqual(await fixture.rawResource(ids[1]), cohost);
    assert.deepEqual(await fixture.creatorStore.get(currentUrlKey(url)), currentUrlCollision(url, ids));
  } finally {
    release();
    await capture.stop();
  }
});

test('comparar un conflicto de alta conserva el borrador separado de un cohost sin reserva', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const url = 'https://literal.example.invalid/lost-cas/?q=%2f';
  const nextUrl = 'https://literal.example.invalid/winner-moved/';
  const winner = await addLink(fixture, cookie, { title: 'Ficha con reserva única', url });
  const own0 = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal((await api(fixture, cookie, '/api/creador/enlaces/' + winner.placementId,
    { method: 'DELETE', body: { profileVersion: own0.body.profile.version } })).response.status, 204);
  const wrongId = 'unindexed-existing-wrong';
  await putCatalogRows(fixture, [testCatalogRow(wrongId, url)], url);
  await exactGrant(fixture, cookie, wrongId, url);
  const form = await prepareUrlAdd(page, fixture, url);
  const capture = await captureCreatorApi(page);
  const transact = fixture.creatorStore.transact;
  let won;
  fixture.creatorStore.transact = async function (command, ...args) {
    if (!won && command.puts?.some(({ value }) => value.recordType === 'placement' && value.resourceId === winner.resourceId)) {
      won = await api(fixture, cookie, '/api/creador/recursos/' + winner.resourceId, {
        method: 'PATCH', body: { version: winner.resourceVersion, url: nextUrl },
      });
    }
    return transact.call(this, command, ...args);
  };
  try {
    await form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const actual = await responseFor(capture, 'POST', '/api/creador/enlaces');
    assert.equal(won?.response.status, 200, JSON.stringify(won?.body));
    assert.equal(actual.status, 409, JSON.stringify(actual.responseBody));
    assert.equal(actual.responseBody.error, 'LINK_CONFLICT');
    await verifySeparateAddDraft({ fixture, cookie, form, cohostId: wrongId, originalUrl: url, capture });
    assert.equal((await fixture.rawResource(winner.resourceId)).url, nextUrl);
  } finally {
    fixture.creatorStore.transact = transact;
    await capture.stop();
  }
});

test('un alta repetida usa la versión canónica al guardar manualmente la corrección', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const url = 'https://literal.example.invalid/canonical-duplicate/?q=%2f';
  const existing = await addLink(fixture, cookie, { title: 'Ficha propia', url });
  const form = await prepareUrlAdd(page, fixture, url);
  const capture = await captureCreatorApi(page);
  try {
    const admin = await adminCookie(fixture);
    const hidden = await api(fixture, admin, '/api/admin/recursos/' + existing.resourceId + '/ocultar', {
      method: 'POST', body: { version: existing.resourceVersion },
    });
    assert.equal(hidden.response.status, 200, JSON.stringify(hidden.body));
    assert.equal(hidden.body.resource.version, existing.resourceVersion + 1);
    await form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const duplicate = await responseFor(capture, 'POST', '/api/creador/enlaces');
    assert.equal(duplicate.status, 200, JSON.stringify(duplicate.responseBody));
    assert.equal(duplicate.responseBody.created, false);
    assert.equal(duplicate.responseBody.link.resourceVersion, existing.resourceVersion + 1);
    assert.equal(duplicate.responseBody.link.hidden, true);
    const editor = page.locator('[data-owner-form="enlace"]');
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Guardar cambios' }).click();
    const patch = await responseFor(capture, 'PATCH', '/api/creador/enlaces/' + existing.placementId + '/editar');
    assert.equal(patch.status, 200, JSON.stringify(patch.responseBody));
    assert.equal(patch.body.resourceVersion, duplicate.responseBody.link.resourceVersion);
    const saved = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(saved.body.links.length, 1);
    assert.equal(saved.body.links[0].resourceId, existing.resourceId);
    assert.equal(saved.body.links[0].title, 'Solo para el alta');
    assert.equal(saved.body.links[0].hidden, true);
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1);
  } finally {
    await capture.stop();
  }
});

for (const inconsistency of ['otra URL', 'metadatos de la misma versión']) {
test(`un acuse incompatible con ${inconsistency} conserva el borrador y bloquea la edición de otra ficha`, async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const url = 'https://literal.example.invalid/ack-a/?q=%2f';
  const otherUrl = 'https://literal.example.invalid/ack-b/?q=%2f';
  const laterUrl = 'https://literal.example.invalid/ack-c/?q=%2f';
  const intended = await addLink(fixture, cookie, { title: 'Intended row A', url });
  const wrong = await addLink(fixture, cookie, { title: 'Unrelated row B', url: otherUrl });
  const form = await prepareUrlAdd(page, fixture, url);
  const capture = await captureCreatorApi(page);
  let signal;
  let release;
  const arrived = new Promise((resolve) => { signal = resolve; });
  const held = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/creador/enlaces/', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    signal({ status: response.status(), body: await response.json() });
    await held;
    const incompatible = inconsistency === 'otra URL' ? wrong : { ...intended, title: 'Metadato distinto sin cambio de versión' };
    await route.fulfill({ response, json: { created: false, link: incompatible, versionChanges: [] } });
  });
  try {
    await form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const actual = await arrived;
    assert.equal(actual.status, 200);
    assert.equal(actual.body.link.resourceId, intended.resourceId);
    await form.getByLabel('Título', { exact: true }).fill('Corrección para A solamente');
    await form.getByLabel('URL', { exact: true }).fill(laterUrl);
    release();
    await expect(form.locator('[data-owner-conflict-copy]')).toContainText('La respuesta no coincide');
    await expect(form.getByLabel('Título', { exact: true })).toHaveValue('Corrección para A solamente');
    await expect(form.getByLabel('URL', { exact: true })).toHaveValue(laterUrl);
    await expect(form.getByRole('button', { name: 'Agregar enlace', exact: true })).toBeDisabled();
    await expect(form.getByRole('button', { name: 'Comprobar si se agregó la URL original' })).toBeVisible();
    const saved = await api(fixture, cookie, '/api/creador/perfil');
    assert.deepEqual(saved.body.links.find(({ resourceId }) => resourceId === wrong.resourceId), wrong);
    assert.deepEqual(saved.body.links.find(({ resourceId }) => resourceId === intended.resourceId), intended);
    assert.equal(capture.writes().length, 1);
  } finally {
    release();
    await capture.stop();
  }
});
}

import assert from 'node:assert/strict';
import { expect, test, createProfile } from '../fixtures/creator-browser-test.mjs';
import {
  adminPath,
  loginAsSeparateOwner,
  prepareAdmin,
  resource,
  row,
  root,
  submitCreatorClaim,
} from '../fixtures/creator-admin.mjs';
import { adminResourceCommandMatches } from '../fixtures/creator-pages.mjs';

const profileRow = (page, id) => page.locator(`[data-admin-profile="${id}"]`);
const claimForm = (page, id) => page.locator(`[data-admin-claim="${id}"] [data-claim-resolution]`);
const claimSelection = (form, id) => form.locator(`input[name="resourceIds"][value="${id}"]`);
const saveButton = (page, id) => row(page, id).getByRole('button', { name: 'Guardar clasificación' });
const hideResource = (page, id) => row(page, id).getByRole('button', { name: 'Ocultar recurso' });

async function openAdmin(fixture, page) {
  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();
}

async function createOwnerProfile(fixture, suffix) {
  const cookie = await loginAsSeparateOwner(
    fixture,
    `admin-phase5-${suffix}`,
    `admin-phase5-${suffix}@example.invalid`,
  );
  const profile = await createProfile(fixture, cookie, {
    displayName: `Perfil ${suffix}`,
    slug: `p5-${suffix}`,
  });
  return { cookie, profile };
}

async function createClaim(fixture, cookie, resourceIds) {
  const response = await submitCreatorClaim(fixture, cookie, resourceIds, {
    evidence: 'Solicitud de prueba para la recuperación administrativa de Fase 5.',
  });
  assert.ok(response.id);
  return response;
}

async function nativeDecision(page, action, choice) {
  const originalUrl = page.url();
  const originalDocumentTime = await page.evaluate(() => performance.timeOrigin);
  if (choice === 'dismiss') page.setDefaultNavigationTimeout(3_000);
  const dialogPromise = page.waitForEvent('dialog', { timeout: 3_000 });
  const actionResult = action().then((value) => ({ value }), (error) => ({ error }));
  try {
    const dialog = await dialogPromise;
    assert.equal(dialog.type(), 'beforeunload');
    await dialog[choice]();
    const outcome = await actionResult;
    if (outcome.error) {
      const expectedCancelledNavigation = choice === 'dismiss'
        && /Timeout|ERR_ABORTED/iu.test(outcome.error.message);
      assert.equal(expectedCancelledNavigation, true, outcome.error.message);
    }
    if (choice === 'dismiss') {
      assert.equal(page.url(), originalUrl);
      assert.equal(await page.evaluate(() => performance.timeOrigin), originalDocumentTime);
    }
  } finally {
    if (choice === 'dismiss') page.setDefaultNavigationTimeout(30_000);
  }
}

async function saveDraftAndReload(page, id, category) {
  const navigation = page.waitForNavigation({ waitUntil: 'load' });
  const response = page.waitForResponse((candidate) => candidate.request().method() === 'PATCH'
    && adminResourceCommandMatches(candidate.url(), id));
  await row(page, id).getByLabel('Categoría').fill(category);
  await saveButton(page, id).click();
  const [saved] = await Promise.all([response, navigation]);
  return saved;
}

async function abortFirstResponseFor(page, matcher) {
  const targetWrites = [];
  let resolveFirst;
  const firstFinished = new Promise((resolve) => { resolveFirst = resolve; });
  const handler = async (route) => {
    const request = route.request();
    if (!matcher(request)) {
      await route.continue();
      return;
    }
    targetWrites.push({
      method: request.method(),
      url: request.url(),
      body: request.postData() ? JSON.parse(request.postData()) : undefined,
    });
    const response = await route.fetch();
    assert.equal(response.status(), 200, 'the real admin command commits before delivery is lost');
    const body = await response.json();
    if (targetWrites.length === 1) {
      try {
        await route.abort('failed');
      } finally {
        resolveFirst();
      }
    } else await route.fulfill({ response, json: body });
  };
  await page.route('**/api/admin/**', handler);
  return {
    targetWrites,
    firstFinished,
    async stop() {
      await page.unroute('**/api/admin/**', handler);
    },
  };
}

async function assertRelatedClaimPaused(page, relatedClaimId, relatedResourceId, unrelatedClaimId, unrelatedResourceId) {
  const related = claimForm(page, relatedClaimId);
  const unrelated = claimForm(page, unrelatedClaimId);
  await expect(claimSelection(related, relatedResourceId)).toBeDisabled();
  await expect(related.getByRole('checkbox', {
    name: 'Confirmo que revisé la referencia y los recursos seleccionados.',
  })).toBeDisabled();
  await expect(related.getByRole('button', { name: 'Vincular recursos seleccionados' })).toBeDisabled();
  await expect(claimSelection(unrelated, unrelatedResourceId)).toBeEnabled();
  await expect(unrelated.getByRole('checkbox', {
    name: 'Confirmo que revisé la referencia y los recursos seleccionados.',
  })).toBeEnabled();
  await expect(unrelated.getByRole('button', { name: 'Vincular recursos seleccionados' })).toBeEnabled();
}

async function preserveDraftThroughVerifiedRefresh(page, draftId, originalCategory, uncertainTargetId, uncertainTargetCategory = 'Serverless') {
  const draft = row(page, draftId).getByLabel('Categoría');
  await expect(draft).toHaveValue('Borrador independiente');
  const uncertainTarget = uncertainTargetId
    ? row(page, uncertainTargetId).getByLabel('Categoría')
    : null;

  await nativeDecision(page, () => root(page).locator('[data-refresh-view]').click(), 'dismiss');
  await expect(draft).toHaveValue('Borrador independiente', 'a cancelled native refresh retains the independent draft');
  if (uncertainTarget) {
    await expect(uncertainTarget).toHaveValue('Seguridad', 'a cancelled native refresh retains the uncertain submitted value');
    await uncertainTarget.fill(uncertainTargetCategory);
  }

  // Returning exactly to the server-rendered value must make the document clean.
  // This proves that the comparison baseline survived the uncertain command.
  await draft.fill(originalCategory);
  const dialogs = [];
  const collectDialog = async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  };
  page.on('dialog', collectDialog);
  try {
    const freshDocument = page.waitForNavigation({ waitUntil: 'load' });
    await root(page).locator('[data-refresh-view]').click();
    await freshDocument;
    assert.deepEqual(dialogs, [], 'Returning to the original baseline removes the native draft guard.');
    await expect(row(page, draftId).getByLabel('Categoría')).toHaveValue(originalCategory);
    if (uncertainTarget) await expect(uncertainTarget).toHaveValue('Seguridad');
  } finally {
    page.off('dialog', collectDialog);
  }
}

test('lost classification delivery preserves the commit, pauses only its scope, and recovers at the stored revision', async ({ fixture, page }) => {
  const ids = [
    'admin-phase5-classification-target',
    'admin-phase5-classification-related',
    'admin-phase5-classification-draft',
    'admin-phase5-classification-unrelated',
  ];
  await prepareAdmin(fixture, page, ids.map((id, index) => resource(id, index)));
  const relatedOwner = await createOwnerProfile(fixture, 'classification-related');
  const unrelatedOwner = await createOwnerProfile(fixture, 'classification-unrelated');
  const relatedClaim = await createClaim(fixture, relatedOwner.cookie, [ids[0]]);
  const unrelatedClaim = await createClaim(fixture, unrelatedOwner.cookie, [ids[3]]);
  await openAdmin(fixture, page);
  await row(page, ids[2]).getByLabel('Categoría').fill('Borrador independiente');

  const route = await abortFirstResponseFor(page,
    (request) => request.method() === 'PATCH' && adminResourceCommandMatches(request.url(), ids[0]));
  try {
    await row(page, ids[0]).getByLabel('Categoría').fill('Seguridad');
    await saveButton(page, ids[0]).click();
    await route.firstFinished;
    assert.equal(route.targetWrites.length, 1);
    assert.equal(route.targetWrites[0].body.category, 'Seguridad', JSON.stringify(route.targetWrites[0].body));

    const stored = await fixture.rawResource(ids[0]);
    assert.equal(stored.category, 'Seguridad', 'the classification is stored even though its receipt is lost');
    assert.equal(stored.version, 2);
    await expect(saveButton(page, ids[0])).toBeDisabled();
    await expect(hideResource(page, ids[0])).toBeDisabled();
    await assertRelatedClaimPaused(page, relatedClaim.id, ids[0], unrelatedClaim.id, ids[3]);
    await expect(saveButton(page, ids[3])).toBeEnabled();
    await expect(hideResource(page, ids[3])).toBeEnabled();
    await expect(row(page, ids[2]).getByLabel('Categoría')).toHaveValue('Borrador independiente');
    await expect(root(page).locator('[data-refresh-view]')).toBeVisible();

    await preserveDraftThroughVerifiedRefresh(page, ids[2], 'Serverless', ids[0]);
    assert.equal((await fixture.rawResource(ids[0])).category, 'Seguridad');
    assert.equal((await fixture.rawResource(ids[0])).version, 2,
      'verified Refresh preserves the real uncertain classification revision before the next command');
    const savedDraft = await saveDraftAndReload(page, ids[2], 'Certificaciones');
    assert.equal(savedDraft.status(), 200);
    assert.equal(JSON.parse(savedDraft.request().postData()).version, 1);
    assert.equal((await fixture.rawResource(ids[2])).category, 'Certificaciones');

    const reload = page.waitForNavigation({ waitUntil: 'load' });
    const next = page.waitForResponse((candidate) => candidate.request().method() === 'PATCH'
      && adminResourceCommandMatches(candidate.url(), ids[0]));
    await row(page, ids[0]).getByLabel('Categoría').fill('Certificaciones');
    await saveButton(page, ids[0]).click();
    const nextResponse = await next;
    await reload;
    assert.equal(nextResponse.status(), 200);
    assert.equal(JSON.parse(nextResponse.request().postData()).version, 2,
      'the next legitimate command uses the recovered revision');
    assert.equal(route.targetWrites.length, 2, 'lost delivery never triggers an automatic replay');
    assert.equal((await fixture.rawResource(ids[0])).category, 'Certificaciones');
    assert.equal((await fixture.rawResource(ids[0])).version, 3);
  } finally {
    await route.stop();
  }
});

test('lost resource moderation delivery preserves the commit, pauses dependent claims, and recovers with Restore', async ({ fixture, page }) => {
  const ids = [
    'admin-phase5-resource-target',
    'admin-phase5-resource-related',
    'admin-phase5-resource-draft',
    'admin-phase5-resource-unrelated',
  ];
  await prepareAdmin(fixture, page, ids.map((id, index) => resource(id, index)));
  const relatedOwner = await createOwnerProfile(fixture, 'resource-related');
  const unrelatedOwner = await createOwnerProfile(fixture, 'resource-unrelated');
  const relatedClaim = await createClaim(fixture, relatedOwner.cookie, [ids[0]]);
  const unrelatedClaim = await createClaim(fixture, unrelatedOwner.cookie, [ids[3]]);
  await openAdmin(fixture, page);
  await row(page, ids[2]).getByLabel('Categoría').fill('Borrador independiente');

  const route = await abortFirstResponseFor(page,
    (request) => request.method() === 'POST'
      && ['ocultar', 'restaurar'].some((action) => adminResourceCommandMatches(request.url(), ids[0], action)));
  try {
    await hideResource(page, ids[0]).click();
    await route.firstFinished;
    assert.equal(route.targetWrites.length, 1);

    const stored = await fixture.rawResource(ids[0]);
    assert.equal(stored.hidden, true, 'resource moderation is stored even though its receipt is lost');
    assert.equal(stored.version, 2);
    await expect(row(page, ids[0]).getByRole('button', { name: 'Ocultar recurso' })).toBeDisabled();
    await expect(row(page, ids[0]).getByRole('button', { name: 'Aprobar para el directorio' })).toBeDisabled();
    await assertRelatedClaimPaused(page, relatedClaim.id, ids[0], unrelatedClaim.id, ids[3]);
    await expect(hideResource(page, ids[3])).toBeEnabled();
    await expect(row(page, ids[2]).getByLabel('Categoría')).toHaveValue('Borrador independiente');
    await expect(root(page).locator('[data-refresh-view]')).toBeVisible();

    await preserveDraftThroughVerifiedRefresh(page, ids[2], 'Serverless');
    const savedDraft = await saveDraftAndReload(page, ids[2], 'Certificaciones');
    assert.equal(savedDraft.status(), 200);
    assert.equal(JSON.parse(savedDraft.request().postData()).version, 1);
    assert.equal((await fixture.rawResource(ids[2])).category, 'Certificaciones');

    const reload = page.waitForNavigation({ waitUntil: 'load' });
    const restore = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && adminResourceCommandMatches(candidate.url(), ids[0], 'restaurar'));
    await row(page, ids[0]).getByRole('button', { name: 'Restaurar recurso' }).click();
    const restoreResponse = await restore;
    await reload;
    assert.equal(restoreResponse.status(), 200);
    assert.deepEqual(JSON.parse(restoreResponse.request().postData()), { version: 2 });
    assert.equal(route.targetWrites.length, 2, 'lost delivery never triggers an automatic moderation replay');
    assert.ok(adminResourceCommandMatches(route.targetWrites[0].url, ids[0], 'ocultar'));
    assert.ok(adminResourceCommandMatches(route.targetWrites[1].url, ids[0], 'restaurar'));
    assert.equal((await fixture.rawResource(ids[0])).hidden, false);
    assert.equal((await fixture.rawResource(ids[0])).version, 3);
  } finally {
    await route.stop();
  }
});

test('lost profile moderation delivery preserves the commit, pauses only its profile claims, and recovers with Restore', async ({ fixture, page }) => {
  const ids = [
    'admin-phase5-profile-target-resource',
    'admin-phase5-profile-related-resource',
    'admin-phase5-profile-draft',
    'admin-phase5-profile-unrelated-resource',
  ];
  await prepareAdmin(fixture, page, ids.map((id, index) => resource(id, index)));
  const relatedOwner = await createOwnerProfile(fixture, 'profile-related');
  const unrelatedOwner = await createOwnerProfile(fixture, 'profile-unrelated');
  const relatedClaim = await createClaim(fixture, relatedOwner.cookie, [ids[0]]);
  const unrelatedClaim = await createClaim(fixture, unrelatedOwner.cookie, [ids[3]]);
  await openAdmin(fixture, page);
  await row(page, ids[2]).getByLabel('Categoría').fill('Borrador independiente');

  const route = await abortFirstResponseFor(page,
    (request) => request.method() === 'POST'
      && ['ocultar', 'restaurar'].some((action) =>
        new URL(request.url()).pathname === `/api/admin/perfiles/${relatedOwner.profile.id}/${action}/`));
  try {
    await profileRow(page, relatedOwner.profile.id).getByRole('button', { name: 'Ocultar perfil' }).click();
    await route.firstFinished;
    assert.equal(route.targetWrites.length, 1);

    const stored = await fixture.creatorStore.get(`profile:${relatedOwner.profile.id}`);
    assert.equal(stored.hidden, true, 'profile moderation is stored even though its receipt is lost');
    assert.equal(stored.version, 2);
    await expect(profileRow(page, relatedOwner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeDisabled();
    await expect(profileRow(page, relatedOwner.profile.id).locator('[data-profile-action="restaurar"]:not(:disabled)')).toHaveCount(0);
    await assertRelatedClaimPaused(page, relatedClaim.id, ids[0], unrelatedClaim.id, ids[3]);
    await expect(profileRow(page, unrelatedOwner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeEnabled();
    await expect(row(page, ids[2]).getByLabel('Categoría')).toHaveValue('Borrador independiente');
    await expect(root(page).locator('[data-refresh-view]')).toBeVisible();

    await preserveDraftThroughVerifiedRefresh(page, ids[2], 'Serverless');
    const savedDraft = await saveDraftAndReload(page, ids[2], 'Certificaciones');
    assert.equal(savedDraft.status(), 200);
    assert.equal(JSON.parse(savedDraft.request().postData()).version, 1);
    assert.equal((await fixture.rawResource(ids[2])).category, 'Certificaciones');

    const reload = page.waitForNavigation({ waitUntil: 'load' });
    const restore = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === `/api/admin/perfiles/${relatedOwner.profile.id}/restaurar/`);
    await profileRow(page, relatedOwner.profile.id).getByRole('button', { name: 'Restaurar perfil' }).click();
    const restoreResponse = await restore;
    await reload;
    assert.equal(restoreResponse.status(), 200);
    assert.deepEqual(JSON.parse(restoreResponse.request().postData()), { version: 2 });
    assert.equal(route.targetWrites.length, 2, 'lost delivery never triggers an automatic profile moderation replay');
    assert.ok(new URL(route.targetWrites[0].url).pathname.endsWith('/ocultar/'));
    assert.ok(new URL(route.targetWrites[1].url).pathname.endsWith('/restaurar/'));
    const restored = await fixture.creatorStore.get(`profile:${relatedOwner.profile.id}`);
    assert.equal(restored.hidden, false);
    assert.equal(restored.version, 3);
  } finally {
    await route.stop();
  }
});

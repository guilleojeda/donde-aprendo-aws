import assert from 'node:assert/strict';
import { addCookie, expect, test } from '../fixtures/creator-browser-test.mjs';
import {
  adminPath,
  loginAsSeparateOwner,
  prepareAdmin,
  resource,
  root,
  row,
} from '../fixtures/creator-admin.mjs';
import { adminResourceCommandMatches } from '../fixtures/creator-pages.mjs';

const profileRow = (page, id) => page.locator(`[data-admin-profile="${id}"]`);
const claimRow = (page, id) => page.locator(`[data-admin-claim="${id}"]`);
const claimForm = (page, id) => claimRow(page, id).locator('form[data-claim-resolution]');
const claimSelection = (form, id) => form.locator(`input[name="resourceIds"][value="${id}"]`);
const saveButton = (page, id) => row(page, id).getByRole('button', { name: 'Guardar clasificación' });
const moderateResource = (page, id) => row(page, id).getByRole('button', { name: 'Ocultar recurso' });

async function openAdmin(fixture, page, resources, query = '?state=all&page=1') {
  await page.goto(`${fixture.origin}${adminPath}${query}`);
  await expect(root(page)).toBeVisible();
}

async function createOwnerProfile(fixture, sub, email, { slug, displayName } = {}) {
  const cookie = await loginAsSeparateOwner(fixture, sub, email);
  const principal = await fixture.principal(cookie);
  const response = await fixture.request(cookie, '/api/creador/perfil', {
    method: 'PUT',
    body: {
      displayName: displayName ?? 'Dueña de recursos',
      slug: slug ?? `perfil-${sub}`,
      socials: {},
    },
  });
  assert.equal(response.status, 200, 'the real creator profile service creates the moderation target');
  const profile = (await response.json()).profile;
  return { cookie, principal, profile };
}

async function createClaim(fixture, cookie, resourceIds, sourceId) {
  const response = await fixture.request(cookie, '/api/creador/reclamaciones', {
    method: 'POST',
    body: {
      resourceIds,
      evidence: 'Solicitud de prueba para comprobar la revisión administrativa.',
      ...(sourceId ? { sourceId } : {}),
    },
  });
  assert.equal(response.status, 202, 'the real creator claim service creates the pending admin request');
  return (await response.json()).claim;
}

async function interceptAdminWrite(page, matches, deliver) {
  const observed = [];
  const handler = async (route) => {
    const request = route.request();
    if (!matches(request)) {
      await route.continue();
      return;
    }
    const actual = await route.fetch();
    const raw = await actual.text();
    let body;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      body = undefined;
    }
    const entry = {
      method: request.method(),
      url: request.url(),
      requestBody: request.postData() ? JSON.parse(request.postData()) : undefined,
      status: actual.status(),
      body,
      raw,
    };
    observed.push(entry);
    await deliver(route, actual, entry);
  };
  await page.route('**/api/admin/**', handler);
  return {
    observed,
    async stop() {
      await page.unroute('**/api/admin/**', handler);
    },
  };
}

async function fulfillActual(route, response, body) {
  await route.fulfill({ response, json: body });
}

async function waitForAdminWriteToSettle(page, unrelatedId) {
  await expect(saveButton(page, unrelatedId)).toBeEnabled();
  await expect(moderateResource(page, unrelatedId)).toBeEnabled();
}

async function assertReceiptFallback(page, targetId, unrelatedId) {
  await waitForAdminWriteToSettle(page, unrelatedId);
  const target = row(page, targetId);
  await expect(saveButton(page, targetId)).toBeDisabled();
  await expect(target.getByRole('button', { name: 'Aprobar para el directorio' })).toBeDisabled();
  await expect(moderateResource(page, targetId)).toBeDisabled();
}

async function submitClassification(page, id, category) {
  await row(page, id).getByLabel('Categoría').fill(category);
  const responsePromise = page.waitForResponse((response) => response.request().method() === 'PATCH'
    && adminResourceCommandMatches(response.url(), id));
  await saveButton(page, id).click();
  return responsePromise;
}

const badClassificationReceipts = [
  {
    label: 'missing versionChanges',
    async deliver(route, response, actual) {
      assert.equal(actual.status, 200);
      const delivered = { ...actual.body };
      delete delivered.versionChanges;
      await fulfillActual(route, response, delivered);
    },
  },
  {
    label: 'malformed versionChanges entry',
    async deliver(route, response, actual) {
      assert.equal(actual.status, 200);
      await fulfillActual(route, response, { ...actual.body, versionChanges: [{}] });
    },
  },
  {
    label: 'nonempty target receipt conflicts with canonical version',
    async deliver(route, response, actual) {
      assert.equal(actual.status, 200);
      const targetChange = actual.body.versionChanges.find(({ entity, id }) => entity === 'resource' && id === 'admin-receipt-target');
      assert.ok(targetChange);
      await fulfillActual(route, response, {
        ...actual.body,
        versionChanges: [{ ...targetChange, after: actual.body.resource.version + 1 }],
      });
    },
  },
  {
    label: 'unreadable JSON',
    async deliver(route, response, actual) {
      assert.equal(actual.status, 200);
      await route.fulfill({ response, body: '{"resource":' });
    },
  },
];

for (const scenario of badClassificationReceipts) {
  test(`an unreadable classification receipt pauses only its known row (${scenario.label})`, async ({ fixture, page }) => {
    const ids = ['admin-receipt-target', 'admin-receipt-draft'];
    await prepareAdmin(fixture, page, ids);
    await openAdmin(fixture, page, ids);
    await row(page, ids[1]).getByLabel('Categoría').fill('Borrador conservado');

    const route = await interceptAdminWrite(page,
      (request) => request.method() === 'PATCH' && adminResourceCommandMatches(request.url(), ids[0]),
      scenario.deliver);
    try {
      const response = await submitClassification(page, ids[0], 'Seguridad');
      assert.equal(response.status(), 200, 'the actual admin endpoint committed before receipt delivery was corrupted');
      assert.equal(route.observed.length, 1, 'the browser sent exactly one classification write');
      assert.equal(route.observed[0].body.resource.version, 2);
      assert.equal((await fixture.rawResource(ids[0])).category, 'Seguridad');

      await assertReceiptFallback(page, ids[0], ids[1]);
      await expect(row(page, ids[0]).locator('[data-classification-form]')).toHaveAttribute('aria-busy', 'false');
      await expect(row(page, ids[1]).getByLabel('Categoría')).toHaveValue('Borrador conservado');
      assert.equal((await fixture.rawResource(ids[1])).category, 'Serverless', 'the unrelated field remains a local draft');
    } finally {
      await route.stop();
    }
  });
}

test('an empty classification receipt contradicting the canonical increment pauses its target', async ({ fixture, page }) => {
  const ids = ['admin-empty-increment-target', 'admin-empty-increment-draft'];
  await prepareAdmin(fixture, page, ids);
  await openAdmin(fixture, page, ids);
  await row(page, ids[1]).getByLabel('Categoría').fill('Borrador paralelo');
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'PATCH' && adminResourceCommandMatches(request.url(), ids[0]),
    async (path, response, actual) => {
      assert.equal(actual.status, 200);
      assert.equal(actual.body.resource.version, 2, 'the service returned its real canonical increment');
      await fulfillActual(path, response, { ...actual.body, versionChanges: [] });
    });
  try {
    const response = await submitClassification(page, ids[0], 'Seguridad');
    assert.equal(response.status(), 200);
    await assertReceiptFallback(page, ids[0], ids[1]);
    assert.equal(route.observed.length, 1);
    assert.equal((await fixture.rawResource(ids[0])).version, 2);
  } finally {
    await route.stop();
  }
});

for (const foreign of [
  { label: 'resource', entity: 'resource', idIndex: 1 },
  { label: 'profile', entity: 'profile', idIndex: null },
]) {
  test(`an out-of-scope ${foreign.label} receipt is rejected before a foreign version is adopted`, async ({ fixture, page }) => {
    const ids = ['admin-scope-target-resource', 'admin-scope-foreign-resource', 'admin-scope-target-profile', 'admin-scope-draft'];
    await prepareAdmin(fixture, page, ids);
    const owner = await createOwnerProfile(fixture, `admin-scope-owner-${foreign.label}`, `scope-owner-${foreign.label}@example.invalid`);
    await openAdmin(fixture, page, ids);
    await row(page, ids[3]).getByLabel('Categoría').fill('Borrador para mantener la página');

    const targetId = ids[foreign.entity === 'resource' ? 0 : 2];
    const route = await interceptAdminWrite(page,
      (request) => request.method() === 'PATCH' && adminResourceCommandMatches(request.url(), targetId),
      async (currentRoute, response, actual) => {
        assert.equal(actual.status, 200);
        const targetChange = actual.body.versionChanges.find(({ entity, id }) => entity === 'resource' && id === targetId);
        assert.ok(targetChange, 'the real classification response reports its actual target');
        const foreignChange = foreign.entity === 'resource'
          ? { ...targetChange, id: ids[foreign.idIndex] }
          : { ...targetChange, entity: 'profile', id: owner.profile.id };
        await fulfillActual(currentRoute, response, { ...actual.body, versionChanges: [foreignChange] });
      });
    try {
      const response = await submitClassification(page, targetId, 'Seguridad');
      assert.equal(response.status(), 200);
      assert.equal((await fixture.rawResource(targetId)).version, 2, 'the actual target write committed');
      await assertReceiptFallback(page, targetId, ids[3]);
      await expect(row(page, targetId).locator('[data-classification-form]')).toHaveAttribute('aria-busy', 'false');

      if (foreign.entity === 'resource') {
        assert.equal((await fixture.rawResource(ids[1])).version, 1, 'the foreign resource did not change');
        await expect(saveButton(page, ids[1])).toBeEnabled();
        const foreignResponse = await submitClassification(page, ids[1], 'Comunidad');
        assert.equal(foreignResponse.status(), 200, 'the foreign resource remains saveable at its real version');
        assert.equal(JSON.parse(foreignResponse.request().postData()).version, 1);
        assert.equal((await fixture.rawResource(ids[1])).category, 'Comunidad');
      } else {
        assert.equal((await fixture.creatorStore.get(`profile:${owner.profile.id}`)).version, 1);
        const foreignAction = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
          && new URL(candidate.url()).pathname === `/api/admin/perfiles/${owner.profile.id}/ocultar/`);
        await profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' }).click();
        const profileResponse = await foreignAction;
        assert.equal(profileResponse.status(), 200, 'the foreign profile remains usable at its real version');
        assert.deepEqual(JSON.parse(profileResponse.request().postData()), { version: 1 });
        assert.equal((await fixture.creatorStore.get(`profile:${owner.profile.id}`)).version, 2);
      }
    } finally {
      await route.stop();
    }
  });
}

test('a malformed resource moderation receipt pauses its whole row after both finally blocks', async ({ fixture, page }) => {
  const ids = ['admin-resource-moderation-target', 'admin-resource-moderation-other'];
  await prepareAdmin(fixture, page, ids);
  await openAdmin(fixture, page, ids);
  await row(page, ids[1]).getByLabel('Categoría').fill('Borrador de otro recurso');
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && adminResourceCommandMatches(request.url(), ids[0], 'ocultar'),
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 200);
      await fulfillActual(currentRoute, response, { ...actual.body, versionChanges: [null] });
    });
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && adminResourceCommandMatches(candidate.url(), ids[0], 'ocultar'));
    await moderateResource(page, ids[0]).click();
    assert.equal((await responsePromise).status(), 200);
    assert.equal((await fixture.rawResource(ids[0])).hidden, true, 'the actual moderation write committed');

    await assertReceiptFallback(page, ids[0], ids[1]);
    await expect(row(page, ids[1]).getByLabel('Categoría')).toHaveValue('Borrador de otro recurso');
  } finally {
    await route.stop();
  }
});

test('a malformed profile moderation receipt stays paused while unrelated profile and resource controls work', async ({ fixture, page }) => {
  const ids = ['admin-profile-moderation-resource'];
  await prepareAdmin(fixture, page, ids);
  const first = await createOwnerProfile(fixture, 'admin-profile-target', 'profile-target@example.invalid');
  const second = await createOwnerProfile(fixture, 'admin-profile-other', 'profile-other@example.invalid', {
    slug: 'otro-perfil-admin',
    displayName: 'Otro perfil',
  });
  await openAdmin(fixture, page, ids);
  await row(page, ids[0]).getByLabel('Categoría').fill('Borrador de recurso');
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST'
      && new URL(request.url()).pathname === `/api/admin/perfiles/${first.profile.id}/ocultar/`,
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 200);
      await fulfillActual(currentRoute, response, { ...actual.body, versionChanges: 'malformed' });
    });
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === `/api/admin/perfiles/${first.profile.id}/ocultar/`);
    await profileRow(page, first.profile.id).getByRole('button', { name: 'Ocultar perfil' }).click();
    assert.equal((await responsePromise).status(), 200);
    assert.equal((await fixture.creatorStore.get(`profile:${first.profile.id}`)).hidden, true);

    await waitForAdminWriteToSettle(page, ids[0]);
    await expect(profileRow(page, second.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeEnabled();
    await expect(profileRow(page, first.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeDisabled();
    await expect(profileRow(page, first.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toHaveAttribute('data-creator-stale', 'true');
    await expect(row(page, ids[0]).getByLabel('Categoría')).toHaveValue('Borrador de recurso');
  } finally {
    await route.stop();
  }
});

test('a changed claim response missing only profile receipts pauses its submitted targets', async ({ fixture, page }) => {
  const ids = ['claim-selected-a', 'claim-selected-b', 'claim-unchecked', 'claim-source-related', 'claim-draft'];
  const sourceId = 'admin-claim-source-group';
  const records = ids.map((id, index) => resource(id, index, {
    ...(id === ids[3] ? { sourceId } : {}),
  }));
  await prepareAdmin(fixture, page, records);
  const owner = await createOwnerProfile(fixture, 'admin-claim-target', 'claim-target@example.invalid');
  const claim = await createClaim(fixture, owner.cookie, ids.slice(0, 3), sourceId);
  await openAdmin(fixture, page, ids);
  const initial = JSON.parse(await page.locator('#creator-admin-data').textContent());
  assert.equal(initial.claims.find(({ id }) => id === claim.id)?.profileId, owner.profile.id,
    'the private admin loader retains the claim profile ID produced by the real claim service');

  const form = claimForm(page, claim.id);
  await claimSelection(form, ids[2]).uncheck();
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  await row(page, ids[4]).getByLabel('Categoría').fill('Borrador independiente');
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 200, 'the real claim service completed before receipt delivery was corrupted');
      assert.deepEqual(actual.requestBody.resourceIds, ids.slice(0, 2));
      assert.deepEqual(actual.body.linkedResourceIds, ids.slice(0, 2));
      const actualProfileChanges = actual.body.versionChanges.filter(({ entity }) => entity === 'profile');
      assert.deepEqual(actualProfileChanges.map(({ before, after }) => [before, after]), [[1, 2], [2, 3]]);
      const deliveredChanges = actual.body.versionChanges.filter(({ entity }) => entity !== 'profile');
      assert.ok(deliveredChanges.some(({ entity }) => entity === 'resource'));
      assert.ok(deliveredChanges.some(({ entity }) => entity === 'placement'));
      await fulfillActual(currentRoute, response, { ...actual.body, versionChanges: deliveredChanges });
    });
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await responsePromise).status(), 200);
    assert.equal(route.observed.length, 1);
    assert.equal((await fixture.rawResource(ids[0])).directoryControl, 'creator');
    assert.equal((await fixture.rawResource(ids[1])).directoryControl, 'creator');
    assert.equal((await fixture.rawResource(ids[2])).directoryControl, 'editorial');
    assert.equal((await fixture.rawResource(ids[3])).directoryControl, 'editorial');
    assert.equal((await fixture.creatorStore.get(`profile:${owner.profile.id}`)).version, 3);

    await assertReceiptFallback(page, ids[0], ids[4]);
    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(claimSelection(form, ids[0])).toBeChecked();
    await expect(claimSelection(form, ids[1])).toBeChecked();
    await expect(claimSelection(form, ids[2])).not.toBeChecked();
    for (const id of ids.slice(0, 3)) await expect(claimSelection(form, id)).toBeDisabled();
    await expect(saveButton(page, ids[1])).toBeDisabled();
    await expect(moderateResource(page, ids[1])).toBeDisabled();
    await expect(moderateResource(page, ids[2])).toBeEnabled();
    await expect(moderateResource(page, ids[3])).toBeEnabled();
    await expect(profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeDisabled();
    await expect(row(page, ids[4]).getByLabel('Categoría')).toHaveValue('Borrador independiente');
    await expect(saveButton(page, ids[4])).toBeEnabled();
    assert.equal((await fixture.rawResource(ids[4])).category, 'Serverless');
  } finally {
    await route.stop();
  }
});

test('an out-of-scope claim receipt pauses the submitted selection without adopting the unchecked resource', async ({ fixture, page }) => {
  const ids = ['claim-scope-selected-a', 'claim-scope-selected-b', 'claim-scope-unchecked', 'claim-scope-source', 'claim-scope-draft'];
  const sourceId = 'admin-claim-scope-source';
  const records = ids.map((id, index) => resource(id, index, {
    ...(id === ids[3] ? { sourceId } : {}),
  }));
  await prepareAdmin(fixture, page, records);
  const owner = await createOwnerProfile(fixture, 'admin-claim-scope-owner', 'admin-claim-scope@example.invalid');
  const claim = await createClaim(fixture, owner.cookie, ids.slice(0, 3), sourceId);
  await openAdmin(fixture, page, ids);
  const form = claimForm(page, claim.id);
  await claimSelection(form, ids[2]).uncheck();
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  await row(page, ids[4]).getByLabel('Categoría').fill('Borrador retenido');
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 200);
      assert.deepEqual(actual.requestBody.resourceIds, ids.slice(0, 2));
      const selectedReceipt = actual.body.versionChanges.find(({ entity, id }) => entity === 'resource' && id === ids[0]);
      assert.ok(selectedReceipt, 'the actual service returned the selected resource receipt');
      await fulfillActual(currentRoute, response, {
        ...actual.body,
        versionChanges: actual.body.versionChanges.map((change) => change === selectedReceipt
          ? { ...change, id: ids[2] }
          : change),
      });
    });
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await responsePromise).status(), 200);
    assert.equal((await fixture.rawResource(ids[0])).directoryControl, 'creator');
    assert.equal((await fixture.rawResource(ids[1])).directoryControl, 'creator');
    assert.equal((await fixture.rawResource(ids[2])).directoryControl, 'editorial');
    assert.equal((await fixture.rawResource(ids[3])).directoryControl, 'editorial');

    await assertReceiptFallback(page, ids[0], ids[4]);
    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(saveButton(page, ids[1])).toBeDisabled();
    await expect(moderateResource(page, ids[1])).toBeDisabled();
    await expect(moderateResource(page, ids[2])).toBeEnabled();
    await expect(moderateResource(page, ids[3])).toBeEnabled();
    await expect(profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeDisabled();
    await expect(claimSelection(form, ids[0])).toBeChecked();
    await expect(claimSelection(form, ids[1])).toBeChecked();
    await expect(claimSelection(form, ids[2])).not.toBeChecked();
    await expect(row(page, ids[4]).getByLabel('Categoría')).toHaveValue('Borrador retenido');

    const uncheckedResponse = await submitClassification(page, ids[2], 'Comunidad');
    assert.equal(uncheckedResponse.status(), 200, 'the unchecked resource was not advanced from the foreign receipt');
    assert.equal(JSON.parse(uncheckedResponse.request().postData()).version, 1);
    assert.equal((await fixture.rawResource(ids[2])).category, 'Comunidad');
  } finally {
    await route.stop();
  }
});

test('an off-page claim target and absent profile row do not create placeholder targets', async ({ fixture, page }) => {
  const ids = Array.from({ length: 28 }, (_, index) => `admin-offpage-${String(index).padStart(2, '0')}`);
  const sourceId = 'admin-offpage-source';
  const records = ids.map((id, index) => resource(id, index, {
    ...(index === 0 || index === 27 ? { sourceId } : {}),
  }));
  await prepareAdmin(fixture, page, records);
  const owner = await createOwnerProfile(fixture, 'admin-legacy-claim-owner', 'legacy-claim@example.invalid');
  const claim = await createClaim(fixture, owner.cookie, [ids[27], ids[0]], sourceId);
  const list = fixture.creatorStore.list.bind(fixture.creatorStore);
  fixture.creatorStore.list = async (prefix) => {
    const rows = await list(prefix);
    return prefix === 'profile:' ? rows.filter(({ key }) => key !== `profile:${owner.profile.id}`) : rows;
  };
  await openAdmin(fixture, page, records);
  await expect(row(page, ids[27])).toHaveCount(0, 'the selected target is on page 2 and has no rendered row');
  await expect(profileRow(page, owner.profile.id)).toHaveCount(0, 'the controlled admin listing omits only this otherwise real profile row');
  const initial = JSON.parse(await page.locator('#creator-admin-data').textContent());
  assert.equal(initial.claims.find(({ id }) => id === claim.id)?.profileId, owner.profile.id,
    'the claim still carries its real profile identity through the private loader');
  const form = claimForm(page, claim.id);
  await claimSelection(form, ids[0]).uncheck();
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  await row(page, ids[1]).getByLabel('Categoría').fill('Borrador mientras se revisa un recurso fuera de página');

  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 200, 'the real service resolves the historical claim using its actual account mapping');
      assert.deepEqual(actual.requestBody.resourceIds, [ids[27]]);
      delete actual.body.versionChanges;
      await fulfillActual(currentRoute, response, actual.body);
    });
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await responsePromise).status(), 200);
    assert.equal((await fixture.rawResource(ids[27])).directoryControl, 'creator');
    assert.equal((await fixture.creatorStore.get(`profile:${owner.profile.id}`)).version, 2);

    await waitForAdminWriteToSettle(page, ids[1]);
    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(claimSelection(form, ids[27])).toBeChecked();
    await expect(claimSelection(form, ids[27])).toBeDisabled();
    await expect(claimSelection(form, ids[0])).not.toBeChecked();
    await expect(claimSelection(form, ids[0])).toBeDisabled();
    await expect(row(page, ids[27])).toHaveCount(0, 'no placeholder is created for an off-page known target');
    await expect(moderateResource(page, ids[0])).toBeEnabled();
    await expect(profileRow(page, owner.profile.id)).toHaveCount(0, 'receipt fallback does not invent a profile row');
    await expect(saveButton(page, ids[1])).toBeEnabled();
    await expect(row(page, ids[1]).getByLabel('Categoría')).toHaveValue('Borrador mientras se revisa un recurso fuera de página');
  } finally {
    await route.stop();
    fixture.creatorStore.list = list;
  }
});

const legacyClaimReceiptDeliveries = [
  {
    label: 'unreadable versionChanges',
    deliver(actual) {
      const delivered = { ...actual.body };
      delete delivered.versionChanges;
      return delivered;
    },
  },
  {
    label: 'missing required profile observation',
    deliver(actual) {
      const nonProfileChanges = actual.body.versionChanges.filter(({ entity }) => entity !== 'profile');
      assert.ok(nonProfileChanges.some(({ entity }) => entity === 'resource'));
      assert.ok(nonProfileChanges.some(({ entity }) => entity === 'placement'));
      return { ...actual.body, versionChanges: nonProfileChanges };
    },
  },
];

for (const receiptDelivery of legacyClaimReceiptDeliveries) {
test(`a legacy claim without profileId does not guess the account profile as a pause target (${receiptDelivery.label})`, async ({ fixture, page }) => {
  const ids = ['admin-legacy-selected', 'admin-legacy-unchecked', 'admin-legacy-draft'];
  await prepareAdmin(fixture, page, ids.map((id, index) => resource(id, index,
    index === 2 ? { sourceId: 'historical-source' } : {})));
  const owner = await createOwnerProfile(fixture, 'admin-legacy-no-profile', 'legacy-no-profile@example.invalid');
  const claimId = 'admin-legacy-claim-without-profile-id';
  const inserted = await fixture.creatorStore.transact({
    checks: [{ key: `claim:${claimId}`, version: null }],
    puts: [{ key: `claim:${claimId}`, value: {
      recordType: 'claim', id: claimId, accountId: owner.principal.accountId,
      resourceIds: [ids[0], ids[1]], sourceId: 'historical-source',
      evidence: 'Historical request without profile identity.',
      status: 'pending', createdAt: '2026-11-13T00:00:00.000Z', version: 1,
    } }],
  });
  assert.equal(inserted, true, 'only the historical claim prerequisite is prepared directly');
  await openAdmin(fixture, page, ids);
  const initial = JSON.parse(await page.locator('#creator-admin-data').textContent());
  assert.equal(Object.hasOwn(initial.claims.find(({ id }) => id === claimId), 'profileId'), false);
  const form = claimForm(page, claimId);
  await claimSelection(form, ids[1]).uncheck();
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  await row(page, ids[2]).getByLabel('Categoría').fill('Borrador con solicitud histórica');
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 200, 'the actual service still resolves this historical request from its account mapping');
      assert.deepEqual(actual.requestBody.resourceIds, [ids[0]]);
      await fulfillActual(currentRoute, response, receiptDelivery.deliver(actual));
    });
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await responsePromise).status(), 200);
    assert.equal((await fixture.rawResource(ids[0])).directoryControl, 'creator');
    assert.equal((await fixture.creatorStore.get(`profile:${owner.profile.id}`)).version, 2);

    await waitForAdminWriteToSettle(page, ids[2]);
    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(saveButton(page, ids[0])).toBeDisabled();
    await expect(moderateResource(page, ids[0])).toBeDisabled();
    await expect(moderateResource(page, ids[1])).toBeEnabled();
    await expect(profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeEnabled();
    await expect(moderateResource(page, ids[2])).toBeEnabled();
    await expect(row(page, ids[2]).getByLabel('Categoría')).toHaveValue('Borrador con solicitud histórica');
  } finally {
    await route.stop();
  }
});
}

test('a real partial claim with an unreadable receipt pauses every submitted target and keeps other drafts', async ({ fixture, page }) => {
  const ids = ['admin-partial-selected-a', 'admin-partial-selected-b', 'admin-partial-unchecked', 'admin-partial-source', 'admin-partial-draft'];
  const sourceId = 'admin-partial-source-group';
  const records = ids.map((id, index) => resource(id, index, {
    ...(id === ids[3] ? { sourceId } : {}),
  }));
  await prepareAdmin(fixture, page, records);
  const owner = await createOwnerProfile(fixture, 'admin-partial-owner', 'admin-partial-owner@example.invalid');
  const claim = await createClaim(fixture, owner.cookie, ids.slice(0, 3), sourceId);
  await openAdmin(fixture, page, ids);
  const form = claimForm(page, claim.id);
  await claimSelection(form, ids[2]).uncheck();
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  await row(page, ids[4]).getByLabel('Categoría').fill('Otro borrador permanece editable');

  const transact = fixture.creatorStore.transact.bind(fixture.creatorStore);
  let secondResourceFailed = false;
  fixture.creatorStore.transact = async (operation) => {
    if (!secondResourceFailed && operation.puts?.some(({ key }) => key === `resource:${ids[1]}`)) {
      secondResourceFailed = true;
      throw new Error('controlled storage failure after the first selected resource committed');
    }
    return transact(operation);
  };
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 503, 'the real resolver reports its actual first committed link');
      assert.deepEqual(actual.body.linkedResourceIds, [ids[0]]);
      delete actual.body.versionChanges;
      await fulfillActual(currentRoute, response, actual.body);
    });
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await responsePromise).status(), 503);
    assert.equal(secondResourceFailed, true);
    assert.deepEqual(route.observed[0].requestBody.resourceIds, ids.slice(0, 2));
    assert.equal((await fixture.rawResource(ids[0])).directoryControl, 'creator');
    assert.equal((await fixture.rawResource(ids[1])).directoryControl, 'editorial');
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'pending');

    await waitForAdminWriteToSettle(page, ids[4]);
    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(claimSelection(form, ids[0])).toBeChecked();
    await expect(claimSelection(form, ids[1])).toBeChecked();
    await expect(claimSelection(form, ids[2])).not.toBeChecked();
    for (const id of ids.slice(0, 3)) await expect(claimSelection(form, id)).toBeDisabled();
    await expect(claimRow(page, claim.id).locator('[data-item-status]')).toContainText(ids[0]);

    await expect(saveButton(page, ids[0])).toBeDisabled();
    await expect(saveButton(page, ids[1])).toBeDisabled();
    await expect(moderateResource(page, ids[0])).toBeDisabled();
    await expect(moderateResource(page, ids[1])).toBeDisabled();
    await expect(moderateResource(page, ids[2])).toBeEnabled();
    await expect(moderateResource(page, ids[3])).toBeEnabled();
    await expect(profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeDisabled();
    await expect(row(page, ids[4]).getByLabel('Categoría')).toHaveValue('Otro borrador permanece editable');
    assert.equal((await fixture.rawResource(ids[4])).category, 'Serverless');
  } finally {
    await route.stop();
    fixture.creatorStore.transact = transact;
  }
});

test('valid multi-resource grants accept chained profile receipts and keep unrelated moderation usable', async ({ fixture, page }) => {
  const ids = ['admin-chain-a', 'admin-chain-b', 'admin-chain-draft'];
  await prepareAdmin(fixture, page, ids);
  const owner = await createOwnerProfile(fixture, 'admin-chain-owner', 'admin-chain-owner@example.invalid');
  const otherOwner = await createOwnerProfile(fixture, 'admin-chain-other-owner', 'admin-chain-other@example.invalid', {
    slug: 'admin-cadena-otro-perfil',
    displayName: 'Otro perfil no relacionado',
  });
  const claim = await createClaim(fixture, owner.cookie, ids.slice(0, 2));
  await openAdmin(fixture, page, ids);
  const form = claimForm(page, claim.id);
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  await row(page, ids[2]).getByLabel('Categoría').fill('Mantener vivo el documento');
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 200);
      await currentRoute.fulfill({ response });
    });
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await responsePromise).status(), 200);
    const profileChanges = route.observed[0].body.versionChanges.filter(({ entity }) => entity === 'profile');
    assert.deepEqual(profileChanges, [
      { entity: 'profile', id: owner.profile.id, before: 1, after: 2 },
      { entity: 'profile', id: owner.profile.id, before: 2, after: 3 },
    ], 'the real multi-resource service returns its sequential profile commits');
    assert.deepEqual(route.observed[0].body.linkedResourceIds, ids.slice(0, 2));
    assert.equal((await fixture.creatorStore.get(`profile:${owner.profile.id}`)).version, 3);
    assert.equal((await fixture.rawResource(ids[0])).directoryControl, 'creator');
    assert.equal((await fixture.rawResource(ids[1])).directoryControl, 'creator');

    await waitForAdminWriteToSettle(page, ids[2]);
    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(form.locator('[data-item-status]')).not.toContainText(/recibo no coincide/i);
    await expect(moderateResource(page, ids[2])).toBeEnabled();
    await expect(profileRow(page, otherOwner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeEnabled();
    await expect(saveButton(page, ids[2])).toBeEnabled();
    await expect(row(page, ids[2]).getByLabel('Categoría')).toHaveValue('Mantener vivo el documento');

    const profileAction = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === `/api/admin/perfiles/${owner.profile.id}/ocultar/`);
    await profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' }).click();
    const profileResponse = await profileAction;
    assert.equal(profileResponse.status(), 200, 'the accepted chained profile version supports the next real command');
    assert.deepEqual(JSON.parse(profileResponse.request().postData()), { version: 3 });
    const savedProfile = await fixture.creatorStore.get(`profile:${owner.profile.id}`);
    assert.equal(savedProfile.hidden, true);
    assert.equal(savedProfile.version, 4);
  } finally {
    await route.stop();
  }
});

test('a real already-linked claim with linkedResourceIds and [] remains a valid no-op', async ({ fixture, page }) => {
  const ids = ['admin-noop-claim-resource', 'admin-noop-claim-draft'];
  const adminCookie = await prepareAdmin(fixture, page, ids);
  const owner = await createOwnerProfile(fixture, 'admin-noop-claim-owner', 'admin-noop-claim@example.invalid');
  const firstClaim = await createClaim(fixture, owner.cookie, [ids[0]]);
  const resolve = await fixture.request(adminCookie, '/api/admin/reclamaciones/vincular/', {
    method: 'POST',
    body: { accountId: owner.principal.accountId, resourceIds: [ids[0]] },
  });
  assert.equal(resolve.status, 200, 'the first real admin command establishes the editor, reference and placement');
  assert.deepEqual((await resolve.json()).linkedResourceIds, [ids[0]]);
  const nextClaim = await createClaim(fixture, owner.cookie, [ids[0]]);
  await openAdmin(fixture, page, ids);
  const form = claimForm(page, nextClaim.id);
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  await row(page, ids[1]).getByLabel('Categoría').fill('Otra corrección local');

  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response) => currentRoute.fulfill({ response }));
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await responsePromise).status(), 200);
    assert.deepEqual(route.observed[0].body.linkedResourceIds, [ids[0]]);
    assert.deepEqual(route.observed[0].body.versionChanges, [], 'the real service returned a genuine already-linked no-op');
    assert.equal((await fixture.creatorStore.get(`profile:${owner.profile.id}`)).version, 2);
    assert.equal((await fixture.rawResource(ids[0])).version, 2);

    await waitForAdminWriteToSettle(page, ids[1]);
    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(form.locator('[data-item-status]')).not.toContainText(/recibo no coincide/i);
    await expect(row(page, ids[1]).getByLabel('Categoría')).toHaveValue('Otra corrección local');
    await expect(moderateResource(page, ids[1])).toBeEnabled();
    await expect(saveButton(page, ids[1])).toBeEnabled();
    await expect(saveButton(page, ids[0])).toBeEnabled();
    const followup = await submitClassification(page, ids[0], 'Comunidad');
    assert.equal(followup.status(), 200, 'the real no-op receipt did not stale the selected resource');
    assert.equal(JSON.parse(followup.request().postData()).version, 2);
    assert.equal((await fixture.rawResource(ids[0])).category, 'Comunidad');
    assert.equal((await fixture.rawResource(ids[0])).version, 3);
    assert.equal(route.observed.length, 1);
    assert.equal((await fixture.creatorStore.get(`claim:${firstClaim.id}`)).status, 'resolved');
  } finally {
    await route.stop();
  }
});

test('a genuine version gap pauses one row while the valid receipt chain for another resource remains usable', async ({ fixture, page }) => {
  const ids = ['admin-gap-resource-a', 'admin-gap-resource-b', 'admin-gap-draft'];
  const adminCookie = await prepareAdmin(fixture, page, ids);
  const owner = await createOwnerProfile(fixture, 'admin-gap-owner', 'admin-gap-owner@example.invalid');
  const claim = await createClaim(fixture, owner.cookie, ids.slice(0, 2));
  await openAdmin(fixture, page, ids);

  const externalUpdate = await fixture.request(adminCookie, `/api/admin/recursos/?id=${encodeURIComponent(ids[0])}`, {
    method: 'PATCH',
    body: { category: 'Seguridad', kind: 'content', format: 'Artículo', topics: ['Serverless'], version: 1 },
  });
  assert.equal(externalUpdate.status, 200, 'a real independent admin command advances only the target resource');
  assert.deepEqual((await externalUpdate.json()).versionChanges, [
    { entity: 'resource', id: ids[0], before: 1, after: 2 },
  ]);
  await row(page, ids[2]).getByLabel('Categoría').fill('Draft survives a receipt gap');
  const form = claimForm(page, claim.id);
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();

  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response) => currentRoute.fulfill({ response }));
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await responsePromise).status(), 200);
    const changes = route.observed[0].body.versionChanges;
    assert.ok(changes.some(({ entity, id, before, after }) => entity === 'resource' && id === ids[0] && before === 2 && after === 3));
    assert.ok(changes.some(({ entity, id, before, after }) => entity === 'resource' && id === ids[1] && before === 1 && after === 2));
    assert.deepEqual(changes.filter(({ entity }) => entity === 'profile').map(({ before, after }) => [before, after]), [[1, 2], [2, 3]]);
    assert.equal((await fixture.creatorStore.get(`profile:${owner.profile.id}`)).version, 3);
    assert.equal((await fixture.rawResource(ids[0])).version, 3);
    assert.equal((await fixture.rawResource(ids[1])).version, 2);

    await waitForAdminWriteToSettle(page, ids[2]);
    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(saveButton(page, ids[0])).toBeDisabled();
    await expect(moderateResource(page, ids[0])).toBeDisabled();
    await expect(saveButton(page, ids[1])).toBeEnabled();
    await expect(moderateResource(page, ids[2])).toBeEnabled();
    const resourceResponse = await submitClassification(page, ids[1], 'Comunidad');
    assert.equal(resourceResponse.status(), 200, 'the independently valid resource receipt was applied');
    assert.deepEqual(JSON.parse(resourceResponse.request().postData()).version, 2);
    assert.equal((await fixture.rawResource(ids[1])).category, 'Comunidad');
    await expect(row(page, ids[2]).getByLabel('Categoría')).toHaveValue('Draft survives a receipt gap');
  } finally {
    await route.stop();
  }
});

test('a bad receipt remains stale through same-account session recovery, unrelated save, and safe refresh', async ({ fixture, page }) => {
  const ids = ['admin-recovery-target', 'admin-recovery-save', 'admin-recovery-later-draft'];
  const oldCookie = await prepareAdmin(fixture, page, ids);
  const originalPrincipal = await fixture.principal(oldCookie);
  await openAdmin(fixture, page, ids);
  await row(page, ids[1]).getByLabel('Categoría').fill('Unrelated write after recovery');
  await row(page, ids[2]).getByLabel('Categoría').fill('Later draft to retain');

  const writes = [];
  page.on('request', (request) => {
    if (request.method() !== 'PATCH' || !request.url().includes('/api/admin/')) return;
    writes.push({ url: request.url(), body: JSON.parse(request.postData() ?? '{}') });
  });
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'PATCH' && adminResourceCommandMatches(request.url(), ids[0]),
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 200, 'the target write committed before its response receipt was lost');
      const delivered = { ...actual.body };
      delete delivered.versionChanges;
      await fulfillActual(currentRoute, response, delivered);
    });
  try {
    const firstResponse = await submitClassification(page, ids[0], 'Seguridad');
    assert.equal(firstResponse.status(), 200);
    assert.equal((await fixture.rawResource(ids[0])).category, 'Seguridad');
    await assertReceiptFallback(page, ids[0], ids[1]);
    const documentMarker = await page.evaluate(() => {
      window.__creatorAdminRecoveryDocument = `${performance.timeOrigin}`;
      return window.__creatorAdminRecoveryDocument;
    });

    fixture.accountStore.sessions.clear();
    const expiredWrite = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && adminResourceCommandMatches(response.url(), ids[1]));
    await saveButton(page, ids[1]).click();
    assert.equal((await expiredWrite).status(), 401, 'the real session store rejects the unrelated save after expiry');
    await expect(root(page).locator('[data-session-recovery-check]')).toBeVisible();
    await expect(row(page, ids[1]).getByLabel('Categoría')).toHaveValue('Unrelated write after recovery');

    const renewedCookie = await fixture.login();
    const renewedPrincipal = await fixture.principal(renewedCookie);
    assert.equal(renewedPrincipal.state, 'authenticated');
    assert.equal(renewedPrincipal.accountId, originalPrincipal.accountId, 'the recovery session belongs to the same account');
    await addCookie(page.context(), fixture, renewedCookie);
    const checkPromise = page.waitForResponse((response) => response.request().method() === 'GET'
      && new URL(response.url()).pathname === '/api/creador/sesion/');
    await root(page).locator('[data-session-recovery-check]').click();
    const sessionCheck = await checkPromise;
    assert.equal(sessionCheck.status(), 200, 'the real session endpoint confirms the renewed account session');
    await expect(saveButton(page, ids[1])).toBeEnabled();
    await expect(moderateResource(page, ids[1])).toBeEnabled();
    await expect(moderateResource(page, ids[0])).toBeDisabled();
    await expect(saveButton(page, ids[0])).toBeDisabled();
    await expect(row(page, ids[1]).getByLabel('Categoría')).toHaveValue('Unrelated write after recovery');
    assert.equal(await page.evaluate(() => window.__creatorAdminRecoveryDocument), documentMarker,
      'session checking leaves the active document and target stale state untouched');

    const retry = await submitClassification(page, ids[1], 'Comunidad');
    assert.equal(retry.status(), 200, 'the same unrelated draft remains a deliberate fresh save after session check');
    assert.equal((await fixture.rawResource(ids[1])).category, 'Comunidad');
    await expect(row(page, ids[2]).getByLabel('Categoría')).toHaveValue('Later draft to retain');
    await expect(root(page).locator('[data-view-transition-shell]')).toBeVisible();
    await expect(saveButton(page, ids[2])).toBeEnabled();

    await row(page, ids[2]).getByLabel('Categoría').fill('Serverless');
    await expect(saveButton(page, ids[2])).toBeEnabled();
    await expect(root(page).locator('[data-refresh-view]')).toBeVisible();
    const reload = page.waitForLoadState('load');
    await root(page).locator('[data-refresh-view]').click();
    await reload;
    await expect(row(page, ids[0]).getByLabel('Categoría')).toHaveValue('Seguridad');
    await expect(row(page, ids[1]).getByLabel('Categoría')).toHaveValue('Comunidad');
    await expect(row(page, ids[2]).getByLabel('Categoría')).toHaveValue('Serverless');
    assert.deepEqual(writes.map(({ body }) => body.category), ['Seguridad', 'Unrelated write after recovery', 'Comunidad'],
      'recovery and safe refresh did not replay the lost-response write');
    assert.equal(route.observed.length, 1, 'the actual target mutation was attempted once');
  } finally {
    await route.stop();
  }
});

test('classification sends the raw scalar, persists server normalization, and gives taxonomy feedback', async ({ fixture, page }) => {
  const ids = ['admin-classification-ownership', 'admin-classification-draft'];
  await prepareAdmin(fixture, page, ids);
  await openAdmin(fixture, page, ids);
  await row(page, ids[1]).getByLabel('Categoría').fill('Borrador concurrente');
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'PATCH' && adminResourceCommandMatches(request.url(), ids[0]),
    async (currentRoute, response) => currentRoute.fulfill({ response }));
  try {
    const saved = await submitClassification(page, ids[0], '  Seguridad  ');
    assert.equal(saved.status(), 200);
    await waitForAdminWriteToSettle(page, ids[1]);
    assert.equal((await fixture.rawResource(ids[0])).category, 'Seguridad');
    assert.equal((await fixture.rawResource(ids[0])).version, 2);
    assert.deepEqual(route.observed[0].body.versionChanges, [
      { entity: 'resource', id: ids[0], before: 1, after: 2 },
    ]);

    await row(page, ids[0]).getByLabel('Tipo').selectOption('community');
    await row(page, ids[0]).getByLabel('Formato').selectOption('Blog');
    await row(page, ids[0]).getByLabel('Categoría').fill('Seguridad');
    await saveButton(page, ids[0]).click();
    await expect(row(page, ids[0]).locator('[data-item-status]')).toBeVisible();
    await waitForAdminWriteToSettle(page, ids[1]);
    const itemStatus = row(page, ids[0]).locator('[data-item-status]');
    await expect(itemStatus).toHaveAttribute('data-kind', 'error');
    assert.equal(route.observed.length, 1, 'invalid kind/format combinations are rejected before another write');
    assert.equal((await fixture.rawResource(ids[0])).version, 2, 'invalid taxonomy feedback is not a persisted write');
    assert.equal((await fixture.rawResource(ids[0])).kind, 'content');
    assert.equal(route.observed[0].requestBody.category, '  Seguridad  ',
      'the browser serializes the user scalar without applying server-owned canonicalization');
  } finally {
    await route.stop();
  }
});

test('a genuine unchanged classification accepts [] and keeps its observed version usable', async ({ fixture, page }) => {
  const ids = ['admin-classification-noop', 'admin-classification-noop-draft'];
  await prepareAdmin(fixture, page, ids);
  await openAdmin(fixture, page, ids);
  await row(page, ids[1]).getByLabel('Categoría').fill('Otro borrador');
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'PATCH' && adminResourceCommandMatches(request.url(), ids[0]),
    async (currentRoute, response) => currentRoute.fulfill({ response }));
  try {
    const responsePromise = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && adminResourceCommandMatches(response.url(), ids[0]));
    await saveButton(page, ids[0]).click();
    assert.equal((await responsePromise).status(), 200);
    assert.deepEqual(route.observed[0].body.versionChanges, [], 'the real unchanged classification returns a canonical no-op receipt');
    assert.equal(route.observed[0].body.resource.version, 1);
    assert.equal((await fixture.rawResource(ids[0])).version, 1);
    await waitForAdminWriteToSettle(page, ids[1]);
    await expect(row(page, ids[0]).locator('[data-item-status]')).not.toContainText(/recibo no coincide/i);
    await expect(saveButton(page, ids[0])).toBeEnabled();
    await expect(row(page, ids[0]).getByLabel('Categoría')).toHaveValue('Serverless');

    const nextWrite = await submitClassification(page, ids[0], 'Comunidad');
    assert.equal(nextWrite.status(), 200, 'the real no-op does not stale its matching row');
    assert.equal(JSON.parse(nextWrite.request().postData()).version, 1);
    assert.equal((await fixture.rawResource(ids[0])).category, 'Comunidad');
    assert.equal((await fixture.rawResource(ids[0])).version, 2);
  } finally {
    await route.stop();
  }
});

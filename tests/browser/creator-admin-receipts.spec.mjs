import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { addCookie, expect, test } from '../fixtures/creator-browser-test.mjs';
import { dynamoDbCreatorStateSizes } from '../../src/lib/creator-dynamodb-size.mjs';
import {
  adminPath,
  loginAsSeparateOwner,
  prepareAdmin,
  resource,
  root,
  row,
  submitCreatorClaim,
} from '../fixtures/creator-admin.mjs';
import { adminResourceCommandMatches } from '../fixtures/creator-pages.mjs';

const profileRow = (page, id) => page.locator(`[data-admin-profile="${id}"]`);
const claimRow = (page, id) => page.locator(`[data-admin-claim="${id}"]`);
const claimForm = (page, id) => claimRow(page, id).locator('form[data-claim-resolution]');
const claimSelection = (form, id) => form.locator(`input[name="resourceIds"][value="${id}"]`);
const saveButton = (page, id) => row(page, id).getByRole('button', { name: 'Guardar clasificación' });
const moderateResource = (page, id) => row(page, id).getByRole('button', { name: 'Ocultar recurso' });

async function openAdmin(fixture, page) {
  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();
}

async function createOwnerProfile(fixture, sub, email, { slug, displayName } = {}) {
  const cookie = await loginAsSeparateOwner(fixture, sub, email);
  const principal = await fixture.principal(cookie);
  const response = await fixture.request(cookie, '/api/creador/perfil', {
    method: 'PUT',
    body: {
      creatorVersion: null,
      displayName: displayName ?? 'Dueña de recursos',
      slug: slug ?? `perfil-${sub}`,
      socials: {},
    },
  });
  assert.equal(response.status, 200, 'the real creator profile service creates the moderation target');
  const acknowledgement = await response.json();
  assert.equal(acknowledgement.operation, 'save-profile');
  const read = await fixture.request(cookie, '/api/creador/perfil/');
  assert.equal(read.status, 200);
  const { profile } = await read.json();
  assert.equal(profile.id, acknowledgement.profileId);
  return { cookie, principal, profile };
}

function createClaim(fixture, cookie, resourceIds, sourceId) {
  return submitCreatorClaim(fixture, cookie, resourceIds, {
    evidence: 'Solicitud de prueba para comprobar la revisión administrativa.',
    sourceId,
  });
}

async function seedProfileAtGrantBoundary(fixture, profileId, resourceIds, { includeFirstPlacement = false } = {}) {
  const profileKey = `profile:${profileId}`;
  const current = await fixture.creatorStore.get(profileKey);
  const series = Object.fromEntries(Array.from({ length: 240 }, (_, index) => {
    const suffix = String(index).padStart(3, '0');
    return [`series-${suffix}`, {
      name: `Serie ${suffix}`,
      slug: `serie-${suffix}`,
      description: '',
      chapters: [],
      createdAt: 1,
      updatedAt: 1,
    }];
  }));
  const withSeries = { ...current, series };
  const contentBytes = dynamoDbCreatorStateSizes(withSeries).contentBytes;
  const placementId = (resourceId) => `placement-${createHash('sha256')
    .update(JSON.stringify([profileId, resourceId]), 'utf8').digest('hex')}`;
  const withFirstGrant = structuredClone(withSeries);
  const firstPlacement = placementId(resourceIds[0]);
  withFirstGrant.placements[firstPlacement] = { resourceId: resourceIds[0], selectedForDirectory: true };
  withFirstGrant.order.ordinary.push(firstPlacement);
  const growthForFirst = dynamoDbCreatorStateSizes(withFirstGrant).contentBytes - contentBytes;
  const targetBytes = 384 * 1024 - growthForFirst;
  let remaining = targetBytes - contentBytes;
  assert.ok(remaining >= 0 && remaining <= Object.keys(series).length * 2000,
    'the bounded series descriptions can place the first grant exactly at the content limit');
  for (const entry of Object.values(series)) {
    const length = Math.min(remaining, 2000);
    entry.description = 'x'.repeat(length);
    remaining -= length;
    if (remaining === 0) break;
  }
  assert.equal(remaining, 0);
  const atBoundary = { ...current, series };
  const exactFirst = structuredClone(atBoundary);
  exactFirst.placements[firstPlacement] = { resourceId: resourceIds[0], selectedForDirectory: true };
  exactFirst.order.ordinary.push(firstPlacement);
  assert.equal(dynamoDbCreatorStateSizes(exactFirst).contentBytes, 384 * 1024,
    'the first placement fits exactly at the same 384 KiB limit exercised by the quota acceptance test');
  const secondPlacement = placementId(resourceIds[1]);
  const afterSecond = structuredClone(exactFirst);
  afterSecond.placements[secondPlacement] = { resourceId: resourceIds[1], selectedForDirectory: true };
  afterSecond.order.ordinary.push(secondPlacement);
  assert.ok(dynamoDbCreatorStateSizes(afterSecond).contentBytes > 384 * 1024,
    'the second placement crosses the quota after the first one commits');
  assert.ok(dynamoDbCreatorStateSizes(atBoundary).itemBytes < 400 * 1024,
    'the seeded valid state remains below the separate physical item limit');
  assert.ok(dynamoDbCreatorStateSizes(exactFirst).itemBytes < 400 * 1024,
    'the inclusive placement fixture remains below the separate physical item limit');
  const seededState = includeFirstPlacement ? exactFirst : atBoundary;
  assert.equal(await fixture.creatorStore.transact({
    checks: [{ key: profileKey, version: current.version }],
    puts: [{ key: profileKey, value: seededState }],
  }), true, 'the valid quota fixture replaces only setup state before the real claim command');
  return { placementId };
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
    await openAdmin(fixture, page);
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
  await openAdmin(fixture, page);
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
    await openAdmin(fixture, page);
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
  await openAdmin(fixture, page);
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
  await openAdmin(fixture, page);
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
  await openAdmin(fixture, page);
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
      assert.deepEqual(deliveredChanges.map(({ entity, id }) => [entity, id]),
        ids.slice(0, 2).map((id) => ['resource', id]));
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
  await openAdmin(fixture, page);
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
  await openAdmin(fixture, page);
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
      assert.deepEqual(nonProfileChanges.map(({ entity, id }) => [entity, id]),
        [['resource', actual.requestBody.resourceIds[0]]]);
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
  await openAdmin(fixture, page);
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

const unreadablePartialClaimDeliveries = [
  {
    label: 'missing versionChanges',
    mutate(body) { delete body.versionChanges; },
  },
  {
    label: 'missing linkedResourceIds',
    mutate(body) { delete body.linkedResourceIds; },
  },
  {
    label: 'a version step for the unlinked resource',
    mutate(body) {
      body.versionChanges = [...body.versionChanges,
        { entity: 'resource', id: body.failedResourceId, before: 1, after: 2 }];
    },
  },
  {
    label: 'missing failedResourceId',
    stopLost: true,
    mutate(body) { delete body.failedResourceId; },
  },
  {
    label: 'the full selection without evidence of a late status failure',
    stopLost: true,
    mutate(body) {
      body.linkedResourceIds = [...body.linkedResourceIds, body.failedResourceId];
      delete body.failedResourceId;
    },
  },
];

for (const delivery of unreadablePartialClaimDeliveries) {
test(`a real partial claim with ${delivery.label} pauses submitted targets and keeps other drafts`, async ({ fixture, page }) => {
  const ids = ['admin-partial-selected-a', 'admin-partial-selected-b', 'admin-partial-unchecked', 'admin-partial-source', 'admin-partial-draft'];
  const sourceId = 'admin-partial-source-group';
  const records = ids.map((id, index) => resource(id, index, {
    ...(id === ids[3] ? { sourceId } : {}),
  }));
  await prepareAdmin(fixture, page, records);
  const owner = await createOwnerProfile(fixture, 'admin-partial-owner', 'admin-partial-owner@example.invalid');
  const claim = await createClaim(fixture, owner.cookie, ids.slice(0, 3), sourceId);
  await openAdmin(fixture, page);
  const form = claimForm(page, claim.id);
  await claimSelection(form, ids[2]).uncheck();
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  await row(page, ids[4]).getByLabel('Categoría').fill('Otro borrador permanece editable');

  const get = fixture.creatorStore.get.bind(fixture.creatorStore);
  let secondResourceFailed = false;
  fixture.creatorStore.get = async (key) => {
    if (!secondResourceFailed && key === `editor:${owner.profile.id}:${ids[1]}`) {
      secondResourceFailed = true;
      throw new Error('the second grant was stopped by its editor-reference read before the write');
    }
    return get(key);
  };
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 503, 'the real resolver reports its actual first committed link');
      assert.deepEqual(actual.body.linkedResourceIds, [ids[0]]);
      assert.equal(actual.body.failedResourceId, ids[1]);
      const delivered = { ...actual.body };
      delivery.mutate(delivered);
      await fulfillActual(currentRoute, response, delivered);
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
    const savedProfile = (await fixture.rawOwner(owner.cookie)).profile;
    assert.equal(savedProfile.version, 2);
    assert.deepEqual(Object.values(savedProfile.placements).map(({ resourceId }) => resourceId), [ids[0]]);
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'pending');

    await waitForAdminWriteToSettle(page, ids[4]);
    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(claimSelection(form, ids[0])).toBeChecked();
    await expect(claimSelection(form, ids[1])).toBeChecked();
    await expect(claimSelection(form, ids[2])).not.toBeChecked();
    for (const id of ids.slice(0, 3)) await expect(claimSelection(form, id)).toBeDisabled();
    const status = form.locator('[data-item-status]');
    if (delivery.label === 'missing linkedResourceIds') {
      await expect(status).toContainText(/No pudimos confirmar qué recursos se vincularon/i);
      await expect(status).not.toContainText(ids[0]);
    } else {
      await expect(status).toContainText(`Ya vinculados: ${ids[0]}`);
      await expect(status).toContainText(`${delivery.stopLost ? 'Sin confirmar' : 'Pendientes'}: ${ids[1]}`);
    }
    await expect(status).toContainText(/recibo no coincide/i);

    await expect(saveButton(page, ids[0])).toBeDisabled();
    await expect(saveButton(page, ids[1])).toBeDisabled();
    await expect(moderateResource(page, ids[0])).toBeDisabled();
    await expect(moderateResource(page, ids[1])).toBeDisabled();
    await expect(moderateResource(page, ids[2])).toBeEnabled();
    await expect(moderateResource(page, ids[3])).toBeEnabled();
    await expect(profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeDisabled();
    await expect(row(page, ids[4]).getByLabel('Categoría')).toHaveValue('Otro borrador permanece editable');
    assert.equal((await fixture.rawResource(ids[4])).category, 'Serverless');
    const savedDraft = await submitClassification(page, ids[4], 'Certificaciones');
    assert.equal(savedDraft.status(), 200, 'the unrelated retained draft stays saveable when the commit prefix is unknown');
    assert.equal(JSON.parse(savedDraft.request().postData()).version, 1);
    assert.equal((await fixture.rawResource(ids[4])).category, 'Certificaciones');
    assert.equal(route.observed.length, 1, 'saving the draft does not replay the partial grant');
  } finally {
    await route.stop();
    fixture.creatorStore.get = get;
  }
});
}

test('a definite stop after two durable grants does not expose an omitted middle ID as pending', async ({ fixture, page }) => {
  const ids = ['admin-prefix-gap-a', 'admin-prefix-gap-b', 'admin-prefix-gap-c', 'admin-prefix-gap-draft'];
  await prepareAdmin(fixture, page, ids);
  const owner = await createOwnerProfile(fixture, 'admin-prefix-gap-owner', 'admin-prefix-gap@example.invalid');
  const claim = await createClaim(fixture, owner.cookie, ids.slice(0, 3));
  await openAdmin(fixture, page);
  const form = claimForm(page, claim.id);
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  await row(page, ids[3]).getByLabel('Categoría').fill('Borrador independiente');

  const get = fixture.creatorStore.get.bind(fixture.creatorStore);
  fixture.creatorStore.get = async (key) => {
    if (key === `editor:${owner.profile.id}:${ids[2]}`) {
      throw new Error('the third grant stops before its transaction');
    }
    return get(key);
  };
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      if (route.observed.length === 1) {
        assert.equal(actual.status, 503);
        assert.deepEqual(actual.body.linkedResourceIds, ids.slice(0, 2));
        assert.equal(actual.body.failedResourceId, ids[2]);
        await fulfillActual(currentRoute, response, { ...actual.body, linkedResourceIds: [ids[0]] });
        return;
      }
      assert.equal(actual.status, 200, 'the manual suffix continuation reaches the real grant route');
      assert.deepEqual(actual.requestBody.resourceIds, [ids[2]]);
      await currentRoute.fulfill({ response });
    });
  try {
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    await waitForAdminWriteToSettle(page, ids[3]);
    const savedOwner = await fixture.rawOwner(owner.cookie);
    assert.deepEqual(Object.values(savedOwner.profile.placements).map(({ resourceId }) => resourceId), ids.slice(0, 2));
    for (const id of ids.slice(0, 2)) assert.equal((await fixture.rawResource(id)).directoryControl, 'creator');
    assert.equal((await fixture.rawResource(ids[2])).directoryControl, 'editorial');
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'pending');
    const committedVersions = await Promise.all(ids.slice(0, 2).map(async (id) =>
      (await fixture.rawResource(id)).version));

    const status = form.locator('[data-item-status]');
    await expect(status).toContainText(/No pudimos confirmar qué recursos se vincularon/i);
    await expect(status).not.toContainText(ids[1]);
    await expect(status).not.toContainText(`Pendientes: ${ids[1]}`);
    await expect(status).not.toContainText(`Sin confirmar: ${ids[1]}`);
    for (const id of ids.slice(0, 3)) await expect(claimSelection(form, id)).toBeDisabled();
    const automaticRefresh = page.waitForNavigation({ waitUntil: 'load', timeout: 10_000 }).catch(() => undefined);
    const savedDraft = await submitClassification(page, ids[3], 'Certificaciones');
    assert.equal(savedDraft.status(), 200);
    assert.equal(route.observed.length, 1, 'the unrelated save does not replay the stopped grant');

    // Refresh is the explicit recovery boundary. The suffix is sent only
    // after the fresh claim/resource view is installed; no client-side retry
    // is allowed to infer that C was pending from the malformed receipt.
    fixture.creatorStore.get = get;
    await automaticRefresh;
    await page.reload();
    await expect(root(page)).toBeVisible();
    const freshForm = claimForm(page, claim.id);
    await claimSelection(freshForm, ids[0]).uncheck();
    await claimSelection(freshForm, ids[1]).uncheck();
    await freshForm.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
    const continuation = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await freshForm.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await continuation).status(), 200);
    assert.equal(route.observed.length, 2, 'only the explicit suffix continuation follows the refresh');
    assert.deepEqual(route.observed[1].requestBody.resourceIds, [ids[2]]);
    assert.deepEqual(route.observed[1].body.linkedResourceIds, [ids[2]]);
    assert.deepEqual(await Promise.all(ids.slice(0, 2).map(async (id) => (await fixture.rawResource(id)).version)), committedVersions);
    assert.equal((await fixture.rawResource(ids[2])).directoryControl, 'creator');
    assert.equal((await fixture.rawResource(ids[2])).version, 2);
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'resolved');
  } finally {
    await route.stop();
    fixture.creatorStore.get = get;
  }
});

for (const lateStatus of [false, true]) {
test(lateStatus
  ? 'a late claim-status error pauses only same-account overlapping claim forms'
  : 'a successful grant pauses only same-account overlapping claim forms', async ({ fixture, page }) => {
  const suffix = lateStatus ? 'late' : 'success';
  const ids = [`admin-overlap-${suffix}-a`, `admin-overlap-${suffix}-b`,
    `admin-overlap-${suffix}-x`, `admin-overlap-${suffix}-draft`, `admin-overlap-${suffix}-other`];
  await prepareAdmin(fixture, page, ids);
  const owner = await createOwnerProfile(fixture, `admin-overlap-${suffix}-owner`, `admin-overlap-${suffix}@example.invalid`);
  const overlap = await createClaim(fixture, owner.cookie, [ids[0]]);
  const main = await createClaim(fixture, owner.cookie, [ids[0], ids[2]]);
  const disjoint = await createClaim(fixture, owner.cookie, [ids[1], ids[2]]);
  const otherOwner = await createOwnerProfile(fixture, `admin-overlap-${suffix}-other`, `admin-overlap-${suffix}-other@example.invalid`);
  const differentAccount = await createClaim(fixture, otherOwner.cookie, [ids[0]]);
  await openAdmin(fixture, page);
  const mainForm = claimForm(page, main.id);
  const disjointForm = claimForm(page, disjoint.id);
  const reviewName = 'Confirmo que revisé la referencia y los recursos seleccionados.';
  await claimSelection(mainForm, ids[2]).uncheck();
  await mainForm.getByRole('checkbox', { name: reviewName }).check();
  await claimSelection(disjointForm, ids[2]).uncheck();
  await disjointForm.getByRole('checkbox', { name: reviewName }).check();
  await row(page, ids[3]).getByLabel('Categoría').fill('Borrador ajeno al vínculo');

  const originalTransact = fixture.creatorStore.transact.bind(fixture.creatorStore);
  let statusWrites = 0;
  if (lateStatus) {
    fixture.creatorStore.transact = async (operation) => {
      const mainStatus = operation.puts?.some(({ key }) => key === `claim:${main.id}`) ?? false;
      const overlapStatus = operation.puts?.some(({ key }) => key === `claim:${overlap.id}`) ?? false;
      if (mainStatus || overlapStatus) {
        statusWrites += 1;
        if (mainStatus) return false;
      }
      return originalTransact(operation);
    };
  }
  const route = lateStatus ? await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      if (route.observed.length === 1) {
        assert.equal(actual.status, 409);
        assert.equal(actual.body.failureStage, 'claim-status');
      } else {
        assert.equal(actual.status, 200, 'the independent grant also works after a late status error');
        assert.deepEqual(actual.requestBody.resourceIds, [ids[1]]);
      }
      await fulfillActual(currentRoute, response, actual.body);
    }) : null;
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await mainForm.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    const initiatingResponse = await responsePromise;
    assert.equal(initiatingResponse.status(), lateStatus ? 409 : 200);
    assert.deepEqual(JSON.parse(initiatingResponse.request().postData()).resourceIds, [ids[0]],
      'the initiating command sends the selected A-only subset, not the whole claim');
    if (lateStatus) assert.equal(statusWrites, 2);
    assert.equal((await fixture.rawResource(ids[0])).directoryControl, 'creator');
    const savedOwner = await fixture.rawOwner(owner.cookie);
    assert.equal(Object.values(savedOwner.profile.placements).length, 1);
    if (lateStatus) {
      assert.equal((await fixture.creatorStore.get(`claim:${overlap.id}`)).status, 'resolved');
      assert.equal((await fixture.creatorStore.get(`claim:${main.id}`)).status, 'pending');
    } else {
      assert.equal((await fixture.creatorStore.get(`claim:${main.id}`)).status, 'partial');
      assert.equal((await fixture.creatorStore.get(`claim:${overlap.id}`)).status, 'resolved');
    }

    const overlapForm = claimForm(page, overlap.id);
    const differentForm = claimForm(page, differentAccount.id);
    await expect(mainForm.getByRole('button', { name: 'Vincular recursos seleccionados' })).toBeDisabled();
    await expect(claimSelection(mainForm, ids[2])).not.toBeChecked();
    await expect(overlapForm.getByRole('button', { name: 'Vincular recursos seleccionados' })).toBeDisabled();
    await expect(claimSelection(overlapForm, ids[0])).toBeDisabled();
    await expect(claimSelection(disjointForm, ids[1])).toBeChecked();
    await expect(claimSelection(disjointForm, ids[2])).not.toBeChecked();
    await expect(disjointForm.getByRole('checkbox', { name: reviewName })).toBeChecked();
    await expect(disjointForm.getByRole('button', { name: 'Vincular recursos seleccionados' })).toBeEnabled();
    await expect(differentForm.getByRole('button', { name: 'Vincular recursos seleccionados' })).toBeEnabled();

    const placementId = Object.entries(savedOwner.profile.placements)
      .find(([, placement]) => placement.resourceId === ids[0])?.[0];
    assert.ok(placementId);
    const removal = await fixture.request(owner.cookie, `/api/creador/enlaces/${placementId}`, {
      method: 'DELETE', body: { creatorVersion: savedOwner.profile.version },
    });
    assert.equal(removal.status, 200);
    const freshOwner = await fixture.rawOwner(owner.cookie);
    assert.equal(Object.values(freshOwner.profile.placements)
      .some(({ resourceId }) => resourceId === ids[0]), false);
    let stalePosts = 0;
    const onRequest = (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/') stalePosts += 1;
    };
    page.on('request', onRequest);
    await overlapForm.getByRole('button', { name: 'Vincular recursos seleccionados' }).click({ force: true });
    await new Promise((resolve) => setTimeout(resolve, 150));
    page.off('request', onRequest);
    assert.equal(stalePosts, 0, 'the stale resolved form cannot grant again after the owner removed the placement');

    const disjointGrant = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await disjointForm.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    const independentResponse = await disjointGrant;
    assert.equal(independentResponse.status(), 200);
    assert.deepEqual(JSON.parse(independentResponse.request().postData()).resourceIds, [ids[1]]);
    assert.equal((await fixture.creatorStore.get(`claim:${disjoint.id}`)).status, 'partial');
    assert.deepEqual(Object.values((await fixture.rawOwner(owner.cookie)).profile.placements)
      .map(({ resourceId }) => resourceId), [ids[1]]);

    const savedDraft = await submitClassification(page, ids[3], 'Certificaciones');
    assert.equal(savedDraft.status(), 200, 'the unrelated draft remains saveable');
    assert.equal((await fixture.rawResource(ids[3])).category, 'Certificaciones');
    if (lateStatus) assert.equal(route.observed.length, 2);
  } finally {
    if (route) await route.stop();
    fixture.creatorStore.transact = originalTransact;
  }
});
}

for (const { stop, contradictory } of [{ stop: 0 }, { stop: 1 }, { stop: 1, contradictory: true }]) {
  test(contradictory ? 'conflicting grant stops never present the uncertain resource as linked'
    : `a lost acknowledgement on grant ${stop + 1} pauses the affected rows until refresh`, async ({ fixture, page }) => {
    const ids = ['admin-unknown-grant-a', 'admin-unknown-grant-b', 'admin-unknown-grant-c'];
    const draftId = 'admin-unknown-grant-draft';
    const separateId = 'admin-unknown-disjoint';
    await prepareAdmin(fixture, page, [...ids, draftId, separateId]);
    const owner = await createOwnerProfile(fixture, 'admin-unknown-grant', 'admin-unknown-grant@example.invalid');
    const claim = await createClaim(fixture, owner.cookie, ids);
    const otherOwner = await createOwnerProfile(fixture, 'admin-unknown-disjoint', 'admin-unknown-disjoint@example.invalid');
    const sameResource = await createClaim(fixture, otherOwner.cookie, [ids[stop]]);
    const sameProfile = await createClaim(fixture, owner.cookie, [ids[2], draftId]);
    const disjoint = await createClaim(fixture, otherOwner.cookie, [separateId]);
    await openAdmin(fixture, page);
    const form = claimForm(page, claim.id);
    await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
    await claimSelection(claimForm(page, sameProfile.id), draftId).uncheck();
    await row(page, draftId).getByLabel('Categoría').fill('Otro borrador durante la revisión');

    const transact = fixture.creatorStore.transact.bind(fixture.creatorStore);
    let lost = 0;
    fixture.creatorStore.transact = async (operation) => {
      const result = await transact(operation);
      if (result && lost === 0 && operation.puts?.some(({ key }) => key === `editor:${owner.profile.id}:${ids[stop]}`)) {
        lost += 1;
        throw new Error('controlled loss of an acknowledgement after commit');
      }
      return result;
    };

    const route = await interceptAdminWrite(page,
      (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
      async (currentRoute, response, actual) => {
        if (contradictory) {
          await fulfillActual(currentRoute, response, {
            ...actual.body, linkedResourceIds: ids.slice(0, 2), failedResourceId: ids[2],
          });
        } else await currentRoute.fulfill({ response });
      });
    try {
      const button = form.getByRole('button', { name: 'Vincular recursos seleccionados' });
      await button.click();
      const status = form.locator('[data-item-status]');
      await expect(status).toContainText(contradictory
        ? 'No pudimos confirmar el resultado de la vinculación.'
        : `No pudimos confirmar si se vinculó ${ids[stop]}.`);
      await expect(status).not.toContainText('Pendientes:');
      if (stop > 0) await expect(status).toContainText(`Ya vinculados: ${ids[0]}.`);
      await waitForAdminWriteToSettle(page, draftId);
      assert.equal(lost, 1);
      assert.equal(route.observed[0].status, 503);
      assert.equal(route.observed[0].body.uncertainResourceId, ids[stop]);
      await expect(button).toBeDisabled();
      for (const [otherClaim, id] of [[sameResource, ids[stop]], [sameProfile, ids[2]]]) {
        const otherForm = claimForm(page, otherClaim.id);
        await expect(claimSelection(otherForm, id)).toBeDisabled();
        await expect(otherForm.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' })).toBeDisabled();
        await expect(otherForm.getByRole('button', { name: 'Vincular recursos seleccionados' })).toBeDisabled();
      }
      await expect(claimSelection(claimForm(page, sameProfile.id), draftId)).not.toBeChecked();
      await expect(claimSelection(claimForm(page, sameProfile.id), draftId)).toBeDisabled();
      await expect(claimSelection(claimForm(page, disjoint.id), separateId)).toBeEnabled();
      await expect(claimForm(page, disjoint.id).getByRole('button', { name: 'Vincular recursos seleccionados' })).toBeEnabled();
      await expect(saveButton(page, ids[stop])).toBeDisabled();
      await expect(moderateResource(page, ids[stop])).toBeDisabled();
      await expect(profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeDisabled();
      if (!contradictory) {
        await expect(saveButton(page, ids[stop + 1])).toBeEnabled();
        if (stop > 0) await expect(saveButton(page, ids[0])).toBeEnabled();
      }

      const stored = (await fixture.rawOwner(owner.cookie)).profile;
      assert.deepEqual(Object.values(stored.placements).map(({ resourceId }) => resourceId), ids.slice(0, stop + 1));
      assert.equal((await fixture.rawResource(ids[stop])).directoryControl, 'creator');
      assert.equal((await fixture.rawResource(ids[stop + 1])).directoryControl, 'editorial');
      assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'pending');

      const other = await submitClassification(page, draftId, 'Certificaciones');
      assert.equal(other.status(), 200);
      assert.equal((await fixture.rawResource(draftId)).category, 'Certificaciones');
      assert.equal(route.observed.length, 1, 'completing the unrelated draft never replays a grant');
      await expect(saveButton(page, ids[stop])).toBeEnabled();
      const afterRefresh = await submitClassification(page, ids[stop], 'Certificaciones');
      assert.equal(afterRefresh.status(), 200);
      assert.equal(JSON.parse(afterRefresh.request().postData()).version, 2);
      assert.equal((await fixture.rawResource(ids[stop])).category, 'Certificaciones');
      if (stop === 1 && !contradictory) {
        const refreshedClaim = claimForm(page, claim.id);
        const committedVersions = await Promise.all(ids.slice(0, 2).map(async (id) => (await fixture.rawResource(id)).version));
        for (const id of ids.slice(0, 2)) await claimSelection(refreshedClaim, id).uncheck();
        await refreshedClaim.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
        const continuation = page.waitForResponse((response) => response.request().method() === 'POST'
          && new URL(response.url()).pathname === '/api/admin/reclamaciones/vincular/');
        await refreshedClaim.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
        assert.equal((await continuation).status(), 200);
        assert.equal(route.observed.length, 2);
        assert.deepEqual(route.observed[1].requestBody.resourceIds, [ids[2]]);
        assert.deepEqual(route.observed[1].body.linkedResourceIds, [ids[2]]);
        assert.deepEqual(await Promise.all(ids.slice(0, 2).map(async (id) => (await fixture.rawResource(id)).version)), committedVersions);
        assert.equal((await fixture.rawResource(ids[2])).editorProfileId, owner.profile.id);
        assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'resolved');
      }
    } finally {
      await route.stop();
      fixture.creatorStore.transact = transact;
    }
  });
}

for (const deliveryFailure of ['lost response', 'gateway JSON error']) {
test(`a ${deliveryFailure} after a completed grant pauses the submitted scope`, async ({ fixture, page }) => {
  const [id, draftId] = ['admin-grant-response-lost', 'admin-grant-response-draft'];
  await prepareAdmin(fixture, page, [id, draftId]);
  const owner = await createOwnerProfile(fixture, 'admin-grant-response', 'admin-grant-response@example.invalid');
  const claim = await createClaim(fixture, owner.cookie, [id]);
  await openAdmin(fixture, page);
  const form = claimForm(page, claim.id);
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  await row(page, draftId).getByLabel('Categoría').fill('Borrador que se puede guardar');
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, _response, actual) => {
      assert.equal(actual.status, 200);
      assert.deepEqual(actual.body.linkedResourceIds, [id]);
      if (deliveryFailure === 'lost response') await currentRoute.abort();
      else await currentRoute.fulfill({ status: 502, json: { error: 'upstream unavailable' } });
    });
  try {
    const button = form.getByRole('button', { name: 'Vincular recursos seleccionados' });
    await button.click();
    await expect(form.locator('[data-item-status]')).toContainText(/No pudimos confirmar (el resultado|qué recursos)/);
    await waitForAdminWriteToSettle(page, draftId);
    await expect(button).toBeDisabled();
    await expect(saveButton(page, id)).toBeDisabled();
    await expect(profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeDisabled();
    assert.equal((await fixture.rawResource(id)).directoryControl, 'creator');
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'resolved');

    const saved = await submitClassification(page, draftId, 'Certificaciones');
    assert.equal(saved.status(), 200);
    assert.equal((await fixture.rawResource(draftId)).category, 'Certificaciones');
    await expect(saveButton(page, id)).toBeEnabled();
    assert.equal(route.observed.length, 1, 'the refresh never replayed the grant');
  } finally {
    await route.stop();
  }
});
}

test('a first-grant quota rejection explains capacity and leaves the entire claim editable', async ({ fixture, page }) => {
  const [existing, selected] = ['admin-quota-before-existing', 'admin-quota-before-selected'];
  await prepareAdmin(fixture, page, [existing, selected]);
  const owner = await createOwnerProfile(fixture, 'admin-quota-before-owner', 'admin-quota-before@example.invalid');
  await seedProfileAtGrantBoundary(fixture, owner.profile.id, [existing, selected], { includeFirstPlacement: true });
  const claim = await createClaim(fixture, owner.cookie, [selected]);
  const profileKey = `profile:${owner.profile.id}`;
  const claimKey = `claim:${claim.id}`;
  const [beforeProfile, beforeResource, beforeClaim] = await Promise.all([
    fixture.creatorStore.get(profileKey), fixture.rawResource(selected), fixture.creatorStore.get(claimKey),
  ]);
  await openAdmin(fixture, page);
  const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
  const form = claimForm(page, claim.id);
  const review = form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' });
  const grant = form.getByRole('button', { name: 'Vincular recursos seleccionados' });
  await review.check();
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 422);
      assert.equal(actual.body.error, 'CREATOR_CONTENT_TOO_LARGE');
      assert.equal(actual.body.failureStage, 'before-grant-write');
      assert.equal(Object.hasOwn(actual.body, 'linkedResourceIds'), false);
      assert.deepEqual(actual.requestBody.resourceIds, [selected]);
      await fulfillActual(currentRoute, response, actual.body);
    });
  try {
    await grant.click();
    const message = form.locator('[data-item-status]');
    await expect(message).toHaveText('La página alcanzó su capacidad. Libera espacio en ella antes de volver a vincular recursos.');
    await expect(message).toHaveAttribute('data-kind', 'error');
    await expect(claimSelection(form, selected)).toBeChecked();
    await expect(claimSelection(form, selected)).toBeEnabled();
    await expect(review).toBeEnabled();
    await expect(grant).toBeEnabled();
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin);
    assert.equal(route.observed.length, 1, 'the definitive rejection does not replay the grant');
    assert.deepEqual(await fixture.creatorStore.get(profileKey), beforeProfile);
    assert.deepEqual(await fixture.rawResource(selected), beforeResource);
    assert.deepEqual(await fixture.creatorStore.get(claimKey), beforeClaim);
    assert.equal(await fixture.creatorStore.get(`editor:${owner.profile.id}:${selected}`), null);
  } finally {
    await route.stop();
  }
});

const quotaPartialClaimScenarios = [
  { suffix: 'append', label: 'a confirmed committed prefix' },
  { suffix: 'resource-only', label: 'profileChanged false without linked IDs', includeFirstPlacement: true, mutation: 'omit-ids' },
  { suffix: 'profile-flag', label: 'an exact prefix without profileChanged', mutation: 'omit-profile-flag' },
  { suffix: 'versions-only', label: 'nonempty versions without IDs or flag', mutation: 'omit-ids-and-flag' },
  { suffix: 'full', label: 'impossible full prefix', mutation: 'full' },
  { suffix: 'extra', label: 'malformed overclaim beyond full prefix', mutation: 'extra' },
  { suffix: 'three', label: 'well-shaped overclaim of a proper prefix', mutation: 'full', selectThird: true },
  { suffix: 'stop-lost', label: 'well-shaped overclaim without the stop ID', mutation: 'omit-stop', selectThird: true },
  { suffix: 'stop-dupe', label: 'untrustworthy steps after losing the stop ID', mutation: 'omit-stop-duplicate', selectThird: true },
  { suffix: 'extra-three', label: 'malformed overclaim of a proper prefix', mutation: 'extra', selectThird: true },
  { suffix: 'editor-only', label: 'a confirmed editor-only prefix with no version changes', includeFirstPlacement: true, editorOnly: true },
  { suffix: 'body-lost', label: 'response body lost after a real partial commit', mutation: 'body-lost' },
];

for (const scenario of quotaPartialClaimScenarios) {
test(`a real quota 422 reports its cause and protects the committed prefix (${scenario.label})`, async ({ fixture, page }) => {
  const ids = ['admin-quota-grant-a', 'admin-quota-grant-b',
    ...(scenario.selectThird ? ['admin-quota-grant-c'] : [])];
  const draftId = 'admin-quota-draft';
  await prepareAdmin(fixture, page, [...ids, draftId]);
  const owner = await createOwnerProfile(fixture, `admin-quota-grant-${scenario.suffix}`, `admin-quota-grant-${scenario.suffix}@example.invalid`);
  const boundary = await seedProfileAtGrantBoundary(fixture, owner.profile.id, ids.slice(0, 2), {
    includeFirstPlacement: scenario.includeFirstPlacement,
  });
  if (scenario.editorOnly) {
    const record = await fixture.rawResource(ids[0]);
    const key = `resource:${ids[0]}`;
    assert.equal(await fixture.creatorStore.transact({
      checks: [{ key, version: record.version }],
      puts: [{ key, value: {
        ...record, version: 2, directoryControl: 'creator', editorProfileId: owner.profile.id, autoSync: false,
      } }],
    }), true, 'seed only the missing-reference prerequisite so the real grant must repair it');
    assert.equal(await fixture.creatorStore.get(`editor:${owner.profile.id}:${ids[0]}`), null);
  }
  const claim = await createClaim(fixture, owner.cookie, ids);
  await openAdmin(fixture, page);
  const form = claimForm(page, claim.id);
  await row(page, draftId).getByLabel('Categoría').fill('El borrador sigue editable');
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();

  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 422, 'the real claim service stops at B when its placement exceeds the creator quota');
      assert.equal(actual.body.error, 'CREATOR_CONTENT_TOO_LARGE');
      assert.deepEqual(actual.body.linkedResourceIds, [ids[0]]);
      assert.equal(actual.body.profileChanged, !scenario.includeFirstPlacement);
      assert.equal(actual.body.versionChanges.some(({ entity, id, before, after }) =>
        entity === 'resource' && id === ids[0] && before === 1 && after === 2), !scenario.editorOnly);
      assert.equal(actual.body.versionChanges.some(({ entity, id, before, after }) =>
        entity === 'profile' && id === owner.profile.id && before === 1 && after === 2), !scenario.includeFirstPlacement);
      assert.equal(actual.body.versionChanges.some(({ entity, id }) => entity === 'resource' && id === ids[1]), false,
        'the failed B attempt contributes no resource version receipt');
      if (scenario.mutation === 'body-lost') {
        await currentRoute.fulfill({ status: 422, contentType: 'application/json', body: '' });
        return;
      }
      const delivered = { ...actual.body };
      if (scenario.mutation?.startsWith('omit-ids')) delete delivered.linkedResourceIds;
      if (scenario.mutation === 'omit-profile-flag') delete delivered.profileChanged;
      if (scenario.mutation === 'omit-ids-and-flag') {
        delete delivered.profileChanged;
        delete delivered.failedResourceId;
      }
      if (scenario.mutation === 'full') delivered.linkedResourceIds = ids.slice(0, 2);
      if (scenario.mutation === 'extra') delivered.linkedResourceIds = [...ids.slice(0, 2), null];
      if (scenario.mutation?.startsWith('omit-stop')) {
        delivered.linkedResourceIds = ids.slice(0, 2);
        delete delivered.failedResourceId;
      }
      if (scenario.mutation === 'omit-stop-duplicate') {
        delivered.versionChanges = [
          ...actual.body.versionChanges,
          { entity: 'resource', id: ids[1], before: 1, after: 2 },
          { entity: 'resource', id: ids[1], before: 2, after: 3 },
        ];
      }
      await fulfillActual(currentRoute, response, delivered);
    });
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await responsePromise).status(), 422);
    assert.deepEqual(route.observed[0].requestBody.resourceIds, ids);
    const committedProfile = await fixture.creatorStore.get(`profile:${owner.profile.id}`);
    assert.equal(committedProfile.version, scenario.includeFirstPlacement ? 1 : 2);
    assert.equal((await fixture.rawResource(ids[0])).version, 2);
    assert.equal((await fixture.rawResource(ids[0])).directoryControl, 'creator');
    assert.equal(committedProfile.placements[boundary.placementId(ids[0])].resourceId, ids[0]);
    assert.equal((await fixture.creatorStore.get(`editor:${owner.profile.id}:${ids[0]}`)).version, 1);
    for (const id of ids.slice(1)) {
      assert.equal(Object.values(committedProfile.placements).some(({ resourceId }) => resourceId === id), false);
      assert.equal((await fixture.rawResource(id)).version, 1);
      assert.equal((await fixture.rawResource(id)).directoryControl, 'editorial');
      assert.equal(await fixture.creatorStore.get(`editor:${owner.profile.id}:${id}`), null);
    }
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'pending');

    await expect(form).toHaveAttribute('aria-busy', 'false');
    for (const id of ids) {
      await expect(claimSelection(form, id)).toBeChecked();
      await expect(claimSelection(form, id)).toBeDisabled();
    }
    if (scenario.mutation !== 'body-lost') {
      await expect(form.locator('[data-item-status]')).toContainText(/La página alcanzó su capacidad\. Libera espacio/i);
    }
    await expect(row(page, draftId).getByLabel('Categoría')).toHaveValue('El borrador sigue editable');
    await expect(saveButton(page, draftId)).toBeEnabled();

    if (scenario.mutation?.startsWith('omit-ids') || ['omit-stop-duplicate', 'body-lost'].includes(scenario.mutation)) {
      await expect(form.locator('[data-item-status]')).toContainText(/No pudimos confirmar qué recursos se vincularon/i);
      await expect(form.locator('[data-item-status]')).not.toContainText(ids[0]);
    } else {
      await expect(form.locator('[data-item-status]')).toContainText(`Ya vinculados: ${ids[0]}`);
      const label = scenario.mutation === 'omit-stop' ? 'Sin confirmar' : 'Pendientes';
      await expect(form.locator('[data-item-status]')).toContainText(`${label}: ${ids.slice(1).join(', ')}`);
    }
    if (scenario.mutation) {
      for (const id of ids) await expect(saveButton(page, id)).toBeDisabled();
      await expect(profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeDisabled();
    } else {
      const profileAction = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
        && new URL(candidate.url()).pathname === `/api/admin/perfiles/${owner.profile.id}/ocultar/`);
      await profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' }).click();
      const profileResponse = await profileAction;
      assert.equal(profileResponse.status(), 200);
      assert.deepEqual(JSON.parse(profileResponse.request().postData()), { version: scenario.includeFirstPlacement ? 1 : 2 },
        'the follow-up profile command uses the correct version whether the grant placed A or only repaired its editor reference');

      const savedA = await submitClassification(page, ids[0], 'Comunidad');
      assert.equal(savedA.status(), 200, 'the confirmed A receipt permits a follow-up save');
      assert.equal(JSON.parse(savedA.request().postData()).version, 2);
      assert.equal((await fixture.rawResource(ids[0])).category, 'Comunidad');
      assert.equal((await fixture.rawResource(ids[0])).version, 3);
    }

    assert.equal(route.observed[0].body.failedResourceId, ids[1]);
    const savedDraft = await submitClassification(page, draftId, 'Certificaciones');
    assert.equal(savedDraft.status(), 200, 'the independent draft remains saveable after the 422 partial result');
    assert.equal(JSON.parse(savedDraft.request().postData()).version, 1);
    assert.equal((await fixture.rawResource(draftId)).category, 'Certificaciones');
    assert.equal(route.observed.length, 1, 'the partial claim is not automatically replayed');
  } finally {
    await route.stop();
  }
});
}

for (const loseStage of [false, true]) {
test(loseStage ? 'a late conflict with the stage missing never labels committed resources pending'
  : 'a late claim-status conflict keeps the full confirmed selection even when its grants were no-ops', async ({ fixture, page }) => {
  const ids = ['admin-late-status-a', 'admin-late-status-b', 'admin-late-status-draft'];
  const adminCookie = await prepareAdmin(fixture, page, ids);
  const owner = await createOwnerProfile(fixture, 'admin-late-status-owner', 'admin-late-status@example.invalid');
  const grantBody = { accountId: owner.principal.accountId, resourceIds: ids.slice(0, 2) };
  if (!loseStage) {
    const initialGrant = await fixture.request(adminCookie, '/api/admin/reclamaciones/vincular/', {
      method: 'POST', body: grantBody,
    });
    assert.equal(initialGrant.status, 200);
    assert.deepEqual((await initialGrant.json()).linkedResourceIds, grantBody.resourceIds);
  }
  const claim = await createClaim(fixture, owner.cookie, ids.slice(0, 2));
  await openAdmin(fixture, page);
  const form = claimForm(page, claim.id);
  await row(page, ids[2]).getByLabel('Categoría').fill('Borrador durante el conflicto de estado');
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  const transact = fixture.creatorStore.transact.bind(fixture.creatorStore);
  let failedStatusUpdates = 0;
  fixture.creatorStore.transact = async (operation) => {
    if (operation.puts?.some(({ key }) => key === `claim:${claim.id}`) && failedStatusUpdates === 0) {
      failedStatusUpdates += 1;
      return false;
    }
    return transact(operation);
  };
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      if (!loseStage) await currentRoute.fulfill({ response });
      else {
        const delivered = { ...actual.body };
        delete delivered.failureStage;
        delivered.versionChanges = delivered.versionChanges.slice(0, 2);
        await fulfillActual(currentRoute, response, delivered);
      }
    });
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await responsePromise).status(), 409);
    assert.equal(failedStatusUpdates, 1);
    const receipt = route.observed[0].body;
    assert.equal(receipt.error, 'CLAIM_CONFLICT');
    assert.deepEqual(receipt.linkedResourceIds, grantBody.resourceIds);
    assert.equal(receipt.versionChanges.length, loseStage ? 4 : 0);
    assert.equal(receipt.profileChanged, loseStage);
    assert.equal(receipt.failureStage, 'claim-status');
    assert.equal(Object.hasOwn(receipt, 'failedResourceId'), false);
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'pending');
    assert.equal((await fixture.rawOwner(owner.cookie)).profile.version, 3);
    for (const id of grantBody.resourceIds) {
      assert.equal((await fixture.rawResource(id)).version, 2);
      await expect(claimSelection(form, id)).toBeDisabled();
      if (loseStage) await expect(saveButton(page, id)).toBeDisabled();
      else await expect(saveButton(page, id)).toBeEnabled();
    }
    const expected = loseStage ? `Ya vinculados: ${ids[0]}. Sin confirmar: ${ids[1]}.`
      : `Los recursos ya vinculados son: ${ids[0]}, ${ids[1]}`;
    await expect(form.locator('[data-item-status]')).toContainText(expected);
    await expect(form.locator('[data-item-status]')).not.toContainText('Pendientes:');
    await expect(row(page, ids[2]).getByLabel('Categoría')).toHaveValue('Borrador durante el conflicto de estado');
    const savedDraft = await submitClassification(page, ids[2], 'Certificaciones');
    assert.equal(savedDraft.status(), 200);
    assert.equal((await fixture.rawResource(ids[2])).category, 'Certificaciones');
    assert.equal(route.observed.length, 1, 'saving the independent draft does not replay the claim');

    const explicitRetry = await fixture.request(adminCookie, '/api/admin/reclamaciones/vincular/', {
      method: 'POST', body: grantBody,
    });
    assert.equal(explicitRetry.status, 200);
    assert.deepEqual((await explicitRetry.json()).versionChanges, []);
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'resolved');
    assert.equal((await fixture.rawOwner(owner.cookie)).profile.version, 3);
  } finally {
    await route.stop();
    fixture.creatorStore.transact = transact;
  }
});
}

for (const phantomProfile of [false, true]) {
test(phantomProfile ? 'an authority-only single grant rejects an appended phantom profile change'
  : 'a grant of an existing placement updates resource authority without advancing the profile', async ({ fixture, page }) => {
  const ids = ['admin-existing-placement-a', 'admin-existing-placement-draft'];
  const records = ids.map((id, index) => resource(id, index));
  await prepareAdmin(fixture, page, records);
  const owner = await createOwnerProfile(fixture, 'admin-existing-placement-owner', 'admin-existing-placement@example.invalid');
  const ownerState = await fixture.rawOwner(owner.cookie);
  const reference = await fixture.request(owner.cookie, '/api/creador/enlaces/', {
    method: 'POST',
    body: {
      creatorVersion: ownerState.profile.version,
      title: 'Referencia existente',
      url: records[0].url,
      selectedForDirectory: true,
    },
  });
  assert.equal(reference.status, 201, await reference.clone().text());
  const referenceBody = await reference.json();
  assert.equal(referenceBody.operation, 'add-link');
  assert.equal(referenceBody.disposition, 'resource-reused');
  const profileBeforeGrant = await fixture.rawOwner(owner.cookie);
  assert.equal(profileBeforeGrant.profile.version, 2);
  assert.equal(Object.values(profileBeforeGrant.profile.placements).some(({ resourceId: id }) => id === ids[0]), true);
  assert.equal((await fixture.rawResource(ids[0])).directoryControl, 'editorial');
  assert.equal(await fixture.creatorStore.get(`editor:${owner.profile.id}:${ids[0]}`), null);

  const claim = await createClaim(fixture, owner.cookie, [ids[0]]);
  await openAdmin(fixture, page);
  const form = claimForm(page, claim.id);
  await row(page, ids[1]).getByLabel('Categoría').fill('El borrador independiente se conserva');
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 200);
      assert.deepEqual(actual.body.linkedResourceIds, [ids[0]]);
      assert.equal(actual.body.profileChanged, false, 'the existing placement needs no profile mutation');
      assert.deepEqual(actual.body.versionChanges, [
        { entity: 'resource', id: ids[0], before: 1, after: 2 },
      ]);
      if (phantomProfile) {
        await fulfillActual(currentRoute, response, {
          ...actual.body,
          profileChanged: true,
          versionChanges: [...actual.body.versionChanges, { entity: 'profile', id: owner.profile.id, before: 2, after: 3 }],
        });
      } else await currentRoute.fulfill({ response });
    });
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await responsePromise).status(), 200);
    assert.equal((await fixture.rawOwner(owner.cookie)).profile.version, 2);
    assert.equal((await fixture.rawResource(ids[0])).version, 2);
    assert.equal((await fixture.rawResource(ids[0])).directoryControl, 'creator');
    assert.equal((await fixture.creatorStore.get(`editor:${owner.profile.id}:${ids[0]}`)).profileId, owner.profile.id);

    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(row(page, ids[1]).getByLabel('Categoría')).toHaveValue('El borrador independiente se conserva');
    await expect(saveButton(page, ids[1])).toBeEnabled();

    if (phantomProfile) {
      await expect(form.locator('[data-item-status]')).toContainText(/recibo no coincide/i);
      await expect(profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeDisabled();
      await expect(saveButton(page, ids[0])).toBeDisabled();
      const savedDraft = await submitClassification(page, ids[1], 'Certificaciones');
      assert.equal(savedDraft.status(), 200);
      assert.equal(JSON.parse(savedDraft.request().postData()).version, 1);
      assert.equal((await fixture.rawResource(ids[1])).category, 'Certificaciones');
      assert.equal((await fixture.rawOwner(owner.cookie)).profile.version, 2);
      assert.equal(route.observed.length, 1);
      return;
    }

    const profileAction = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === `/api/admin/perfiles/${owner.profile.id}/ocultar/`);
    await profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' }).click();
    const profileResponse = await profileAction;
    assert.equal(profileResponse.status(), 200);
    assert.deepEqual(JSON.parse(profileResponse.request().postData()), { version: 2 },
      'the profile action uses the unchanged version after a resource-only grant');
    assert.equal((await fixture.rawOwner(owner.cookie)).profile.version, 3);

    const savedResource = await submitClassification(page, ids[0], 'Comunidad');
    assert.equal(savedResource.status(), 200, 'the grant receipt advances the resource to version 2');
    assert.equal(JSON.parse(savedResource.request().postData()).version, 2);
    const savedDraft = await submitClassification(page, ids[1], 'Certificaciones');
    assert.equal(savedDraft.status(), 200);
    assert.equal(JSON.parse(savedDraft.request().postData()).version, 1);
    assert.equal((await fixture.rawResource(ids[0])).category, 'Comunidad');
    assert.equal((await fixture.rawResource(ids[1])).category, 'Certificaciones');
    assert.equal(route.observed.length, 1);
  } finally {
    await route.stop();
  }
});
}

const impossibleGrantVersionReceipts = [
  {
    suffix: 'jump',
    label: 'a resource version jump',
    mutate(body, ids) {
      const change = body.versionChanges.find(({ entity, id }) => entity === 'resource' && id === ids[0]);
      assert.ok(change);
      change.after += 1;
    },
  },
  {
    suffix: 'reversal',
    label: 'a resource version reversal',
    mutate(body, ids) {
      const change = body.versionChanges.find(({ entity, id }) => entity === 'resource' && id === ids[0]);
      assert.ok(change);
      change.after = change.before - 1;
    },
  },
  {
    suffix: 'duplicate',
    label: 'two resource increments for one claim command',
    mutate(body, ids) {
      body.versionChanges.push({ entity: 'resource', id: ids[0], before: 2, after: 3 });
    },
  },
  {
    suffix: 'extra-profile',
    label: 'more profile increments than linked resources',
    mutate(body) {
      const profileChanges = body.versionChanges.filter(({ entity }) => entity === 'profile');
      const latest = profileChanges.at(-1);
      assert.ok(latest);
      body.versionChanges.push({ entity: 'profile', id: latest.id, before: latest.after, after: latest.after + 1 });
    },
  },
  {
    suffix: 'swap',
    label: 'resource steps out of request order',
    mutate(body) {
      const [first, second] = body.versionChanges.flatMap(({ entity }, index) => entity === 'resource' ? [index] : []);
      [body.versionChanges[first], body.versionChanges[second]] = [body.versionChanges[second], body.versionChanges[first]];
    },
  },
];

for (const invalidReceipt of impossibleGrantVersionReceipts) {
test(`an impossible claim receipt pauses its targets but preserves a separate draft (${invalidReceipt.label})`, async ({ fixture, page }) => {
  const ids = ['admin-impossible-receipt-a', 'admin-impossible-receipt-b', 'admin-impossible-receipt-draft'];
  await prepareAdmin(fixture, page, ids);
  const owner = await createOwnerProfile(fixture, `admin-impossible-${invalidReceipt.suffix}`, `admin-impossible-${invalidReceipt.suffix}@example.invalid`);
  const claim = await createClaim(fixture, owner.cookie, ids.slice(0, 2));
  await openAdmin(fixture, page);
  const form = claimForm(page, claim.id);
  await row(page, ids[2]).getByLabel('Categoría').fill('Draft stays independent');
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();

  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 200, 'the real service committed both resource grants before the receipt was altered');
      const delivered = structuredClone(actual.body);
      invalidReceipt.mutate(delivered, ids);
      await fulfillActual(currentRoute, response, delivered);
    });
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await responsePromise).status(), 200);
    assert.equal((await fixture.creatorStore.get(`profile:${owner.profile.id}`)).version, 3);
    assert.equal((await fixture.rawResource(ids[0])).version, 2);
    assert.equal((await fixture.rawResource(ids[1])).version, 2);
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'resolved');

    await waitForAdminWriteToSettle(page, ids[2]);
    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(form.locator('[data-item-status]')).toContainText(/recibo no coincide/i);
    await expect(saveButton(page, ids[0])).toBeDisabled();
    await expect(saveButton(page, ids[1])).toBeDisabled();
    await expect(moderateResource(page, ids[0])).toBeDisabled();
    await expect(moderateResource(page, ids[1])).toBeDisabled();
    await expect(profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeDisabled();
    await expect(row(page, ids[2]).getByLabel('Categoría')).toHaveValue('Draft stays independent');
    await expect(saveButton(page, ids[2])).toBeEnabled();

    const savedDraft = await submitClassification(page, ids[2], 'Certificaciones');
    assert.equal(savedDraft.status(), 200, 'the unrelated draft remains saveable after an impossible grant receipt');
    assert.equal(JSON.parse(savedDraft.request().postData()).version, 1);
    assert.equal((await fixture.rawResource(ids[2])).category, 'Certificaciones');
    assert.equal(route.observed.length, 1, 'no claim replay accompanied the unrelated save');
  } finally {
    await route.stop();
  }
});
}

test('a genuine no-write claim rejection stays editable and allows another real write', async ({ fixture, page }) => {
  const ids = ['admin-no-write-target-a', 'admin-no-write-target-b', 'admin-no-write-draft'];
  const adminCookie = await prepareAdmin(fixture, page, ids);
  const otherOwner = await createOwnerProfile(fixture, 'admin-no-write-other-owner', 'admin-no-write-other@example.invalid');
  const foreignClaim = await createClaim(fixture, otherOwner.cookie, [ids[1]]);
  const foreignGrant = await fixture.request(adminCookie, '/api/admin/reclamaciones/vincular/', {
    method: 'POST',
    body: { accountId: otherOwner.principal.accountId, resourceIds: [ids[1]] },
  });
  assert.equal(foreignGrant.status, 200, 'a separate owner acquires B before the target claim is attempted');
  assert.deepEqual((await foreignGrant.json()).linkedResourceIds, [ids[1]]);

  const owner = await createOwnerProfile(fixture, 'admin-no-write-target-owner', 'admin-no-write-target@example.invalid');
  const claim = await createClaim(fixture, owner.cookie, ids.slice(0, 2));
  await openAdmin(fixture, page);
  const form = claimForm(page, claim.id);
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 409);
      assert.equal(actual.body.error, 'RESOURCE_ALREADY_CLAIMED');
      assert.equal(actual.body.failureStage, 'before-grant-write');
      assert.equal(Object.hasOwn(actual.body, 'linkedResourceIds'), false,
        'the service rejected the request during preflight before committing A');
      await currentRoute.fulfill({ response });
    });
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    assert.equal((await responsePromise).status(), 409);
    assert.equal((await fixture.creatorStore.get(`profile:${owner.profile.id}`)).version, 1);
    assert.equal((await fixture.rawResource(ids[0])).version, 1);
    assert.equal((await fixture.rawResource(ids[0])).directoryControl, 'editorial');
    assert.equal(await fixture.creatorStore.get(`editor:${owner.profile.id}:${ids[0]}`), null);
    assert.equal((await fixture.rawResource(ids[1])).editorProfileId, otherOwner.profile.id);
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'pending');
    assert.equal((await fixture.creatorStore.get(`claim:${foreignClaim.id}`)).status, 'resolved');

    await expect(form).toHaveAttribute('aria-busy', 'false');
    for (const id of ids.slice(0, 2)) {
      await expect(claimSelection(form, id)).toBeEnabled();
      await expect(saveButton(page, id)).toBeEnabled();
    }
    await expect(profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeEnabled();
    await expect(form.locator('[data-item-status]')).not.toContainText(/vinculación parcial/i);

    const saved = await submitClassification(page, ids[0], 'Después del rechazo previo');
    assert.equal(saved.status(), 200, 'the genuine no-write rejection did not stale resource A');
    assert.equal(JSON.parse(saved.request().postData()).version, 1);
    assert.equal((await fixture.rawResource(ids[0])).category, 'Después del rechazo previo');
    assert.equal(route.observed.length, 1, 'the failed claim was not automatically retried');
  } finally {
    await route.stop();
  }
});

test('a real moderation race after an already-linked no-op keeps the claim editable for an explicit retry', async ({ fixture, page }) => {
  const [a, b] = ['admin-noop-race-a', 'admin-noop-race-b'];
  const adminCookie = await prepareAdmin(fixture, page, [a, b]);
  const owner = await createOwnerProfile(fixture, 'admin-noop-race-owner', 'admin-noop-race@example.invalid');
  const grantPath = '/api/admin/reclamaciones/vincular/';
  const initialGrant = await fixture.request(adminCookie, grantPath, {
    method: 'POST', body: { accountId: owner.principal.accountId, resourceIds: [a] },
  });
  assert.equal(initialGrant.status, 200);
  const before = await fixture.rawOwner(owner.cookie);
  const originalA = await fixture.rawResource(a);
  const claim = await createClaim(fixture, owner.cookie, [a, b]);
  await openAdmin(fixture, page);
  const form = claimForm(page, claim.id);
  const reviewed = form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' });
  const submit = form.getByRole('button', { name: 'Vincular recursos seleccionados' });
  const isGrant = (request) => request.method() === 'POST' && new URL(request.url()).pathname === grantPath;
  const transact = fixture.creatorStore.transact.bind(fixture.creatorStore);
  let raceStarted = false;
  let moderation;
  fixture.creatorStore.transact = async (operation) => {
    if (!raceStarted && operation.puts?.some(({ key }) => key === `resource:${b}`)) {
      raceStarted = true;
      moderation = await fixture.request(adminCookie, `/api/admin/recursos/ocultar/?id=${b}`, {
        method: 'POST', body: { version: 1 },
      });
    }
    return transact(operation);
  };
  const route = await interceptAdminWrite(page, isGrant, (currentRoute, response) => currentRoute.fulfill({ response }));
  try {
    await reviewed.check();
    const firstResponse = page.waitForResponse((response) => isGrant(response.request()));
    await submit.click();
    assert.equal((await firstResponse).status(), 409);
    assert.equal(moderation.status, 200);
    assert.equal((await fixture.rawResource(b)).hidden, true);
    assert.equal((await fixture.rawResource(b)).directoryControl, 'editorial');
    assert.equal(await fixture.creatorStore.get(`editor:${owner.profile.id}:${b}`), null);
    assert.deepEqual((await fixture.rawOwner(owner.cookie)).profile, before.profile);
    assert.deepEqual(await fixture.rawResource(a), originalA);
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'pending');

    await expect(form).toHaveAttribute('aria-busy', 'false');
    for (const id of [a, b]) {
      await expect(claimSelection(form, id)).toBeChecked();
      await expect(claimSelection(form, id)).toBeEnabled();
      await expect(saveButton(page, id)).toBeEnabled();
    }
    await expect(submit).toBeEnabled();
    await expect(form.locator('[data-item-status]')).toContainText(/Recarga la página/i);
    assert.equal(route.observed[0].body.error, 'CLAIM_CONFLICT');
    assert.equal(Object.hasOwn(route.observed[0].body, 'linkedResourceIds'), false);
    assert.equal(Object.hasOwn(route.observed[0].body, 'failedResourceId'), false);

    await reviewed.uncheck();
    await openAdmin(fixture, page);
    await claimSelection(form, a).uncheck();
    await reviewed.check();
    const retryResponse = page.waitForResponse((response) => isGrant(response.request()));
    await submit.click();
    assert.equal((await retryResponse).status(), 200);
    assert.deepEqual(route.observed.map(({ requestBody }) => requestBody.resourceIds), [[a, b], [b]]);
    assert.deepEqual(route.observed[1].body.linkedResourceIds, [b]);
    assert.deepEqual(await fixture.rawResource(a), originalA);
    const after = await fixture.rawOwner(owner.cookie);
    assert.equal(after.profile.version, before.profile.version + 1);
    assert.deepEqual(Object.values(after.profile.placements).map(({ resourceId }) => resourceId).sort(), [a, b]);
    assert.equal((await fixture.rawResource(b)).directoryControl, 'creator');
    assert.equal((await fixture.rawResource(b)).hidden, true);
    assert.equal((await fixture.creatorStore.get(`claim:${claim.id}`)).status, 'resolved');
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
  await openAdmin(fixture, page);
  const form = claimForm(page, claim.id);
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  const draftCategory = row(page, ids[2]).getByLabel('Categoría');
  const linkedCategory = row(page, ids[0]).getByLabel('Categoría');
  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response, actual) => {
      assert.equal(actual.status, 200);
      await expect(form).toHaveAttribute('aria-busy', 'true');
      for (const id of ids.slice(0, 2)) await expect(claimSelection(form, id)).toBeDisabled();
      await expect(draftCategory).toBeEditable();
      await expect(linkedCategory).toBeEditable();
      await linkedCategory.fill('Clasificación de la ficha vinculada');
      await draftCategory.fill('Edición durante la vinculación');
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
    for (const id of ids.slice(0, 2)) await expect(claimSelection(form, id)).toBeDisabled();
    await expect(row(page, ids[2]).getByLabel('Categoría')).toBeEnabled();
    await expect(moderateResource(page, ids[2])).toBeEnabled();
    await expect(profileRow(page, otherOwner.profile.id).getByRole('button', { name: 'Ocultar perfil' })).toBeEnabled();
    await expect(saveButton(page, ids[2])).toBeEnabled();
    await expect(draftCategory).toHaveValue('Edición durante la vinculación');
    await expect(linkedCategory).toHaveValue('Clasificación de la ficha vinculada');

    const linkedResponse = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && adminResourceCommandMatches(response.url(), ids[0]));
    await saveButton(page, ids[0]).click();
    const linkedSave = await linkedResponse;
    assert.equal(linkedSave.status(), 200);
    const linkedBody = JSON.parse(linkedSave.request().postData());
    assert.equal(linkedBody.version, 2, 'the selected resource draft uses the valid grant receipt version');
    assert.equal(linkedBody.category, 'Clasificación de la ficha vinculada');
    assert.equal((await fixture.rawResource(ids[0])).category, linkedBody.category);

    const profileAction = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === `/api/admin/perfiles/${owner.profile.id}/ocultar/`);
    await profileRow(page, owner.profile.id).getByRole('button', { name: 'Ocultar perfil' }).click();
    const profileResponse = await profileAction;
    assert.equal(profileResponse.status(), 200, 'the accepted chained profile version supports the next real command');
    assert.deepEqual(JSON.parse(profileResponse.request().postData()), { version: 3 });
    const savedProfile = await fixture.creatorStore.get(`profile:${owner.profile.id}`);
    assert.equal(savedProfile.hidden, true);
    assert.equal(savedProfile.version, 4);
    const savedDraft = await submitClassification(page, ids[2], 'Edición durante la vinculación');
    assert.equal(savedDraft.status(), 200);
    assert.equal((await fixture.rawResource(ids[2])).category, 'Edición durante la vinculación');
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
  await openAdmin(fixture, page);
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

for (const partial of [false, true]) {
test(partial
  ? 'a genuine partial claim version gap preserves B through session recovery and refresh'
  : 'a genuine full claim version gap preserves B through session recovery and refresh', async ({ fixture, page }) => {
  const suffix = partial ? 'partial' : 'full';
  const ids = [`admin-gap-${suffix}-resource-a`, `admin-gap-${suffix}-resource-b`,
    `admin-gap-${suffix}-resource-c`, `admin-gap-${suffix}-draft`, `admin-gap-${suffix}-later-draft`];
  const adminCookie = await prepareAdmin(fixture, page, ids);
  const owner = await createOwnerProfile(fixture, `admin-gap-${suffix}-owner`, `admin-gap-${suffix}@example.invalid`);
  const claimIds = partial ? [ids[0], ids[2]] : [ids[0], ids[1]];
  const claim = await createClaim(fixture, owner.cookie, claimIds);
  await openAdmin(fixture, page);

  const externalUpdate = await fixture.request(adminCookie, `/api/admin/recursos/?id=${encodeURIComponent(ids[0])}`, {
    method: 'PATCH',
    body: { category: 'Seguridad', kind: 'content', format: 'Artículo', topics: ['Serverless'], version: 1 },
  });
  assert.equal(externalUpdate.status, 200, 'a real independent admin command advances only the target resource');
  assert.deepEqual((await externalUpdate.json()).versionChanges, [
    { entity: 'resource', id: ids[0], before: 1, after: 2 },
  ]);
  const affectedDraft = row(page, ids[0]).getByLabel('Categoría');
  const observedCategory = await affectedDraft.inputValue();
  const unsubmittedCategory = 'Edición local de una fila desactualizada';
  if (!partial) await affectedDraft.fill(unsubmittedCategory);
  const unrelatedDraft = row(page, ids[3]).getByLabel('Categoría');
  await unrelatedDraft.fill('Certificaciones');
  await row(page, ids[4]).getByLabel('Categoría').fill('Later draft survives recovery');
  const form = claimForm(page, claim.id);
  await form.getByRole('checkbox', { name: 'Confirmo que revisé la referencia y los recursos seleccionados.' }).check();
  const originalGet = fixture.creatorStore.get.bind(fixture.creatorStore);
  if (partial) {
    fixture.creatorStore.get = async (key) => {
      if (key === `editor:${owner.profile.id}:${ids[2]}`) {
        throw new Error('controlled failure before resource C grant transaction');
      }
      return originalGet(key);
    };
  }

  const route = await interceptAdminWrite(page,
    (request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/admin/reclamaciones/vincular/',
    async (currentRoute, response) => currentRoute.fulfill({ response }));
  try {
    const responsePromise = page.waitForResponse((candidate) => candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/admin/reclamaciones/vincular/');
    await form.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
    const grantResponse = await responsePromise;
    assert.equal(grantResponse.status(), partial ? 503 : 200);
    assert.deepEqual(JSON.parse(grantResponse.request().postData()).resourceIds, claimIds);
    const changes = route.observed[0].body.versionChanges;
    assert.ok(changes.some(({ entity, id, before, after }) => entity === 'resource' && id === ids[0] && before === 2 && after === 3));
    if (partial) {
      assert.equal(route.observed[0].body.error, 'PARTIAL_CLAIM_WRITE');
      assert.equal(changes.some(({ entity, id }) => entity === 'resource' && id === ids[2]), false);
      assert.deepEqual(route.observed[0].body.linkedResourceIds, [ids[0]]);
      assert.equal(route.observed[0].body.failedResourceId, ids[2]);
      assert.deepEqual(changes.filter(({ entity }) => entity === 'profile').map(({ before, after }) => [before, after]), [[1, 2]]);
    } else {
      assert.ok(changes.some(({ entity, id, before, after }) => entity === 'resource' && id === ids[1] && before === 1 && after === 2));
      assert.deepEqual(changes.filter(({ entity }) => entity === 'profile').map(({ before, after }) => [before, after]), [[1, 2], [2, 3]]);
    }
    assert.equal((await fixture.creatorStore.get(`profile:${owner.profile.id}`)).version, partial ? 2 : 3);
    assert.equal((await fixture.rawResource(ids[0])).version, 3);
    assert.equal((await fixture.rawResource(ids[1])).version, partial ? 1 : 2);
    const untouchedResource = await fixture.rawResource(ids[2]);
    assert.equal(untouchedResource.version, 1);
    assert.equal(untouchedResource.directoryControl, 'editorial');

    await waitForAdminWriteToSettle(page, ids[3]);
    await expect(form).toHaveAttribute('aria-busy', 'false');
    await expect(saveButton(page, ids[0])).toBeDisabled();
    await expect(moderateResource(page, ids[0])).toBeDisabled();
    if (!partial) await expect(affectedDraft).toHaveValue(unsubmittedCategory);
    await expect(saveButton(page, ids[1])).toBeEnabled();
    await expect(moderateResource(page, ids[3])).toBeEnabled();
    const resourceResponse = await submitClassification(page, ids[1], 'Comunidad');
    assert.equal(resourceResponse.status(), 200, 'the independently valid resource receipt was applied');
    assert.deepEqual(JSON.parse(resourceResponse.request().postData()).version, partial ? 1 : 2);
    assert.equal((await fixture.rawResource(ids[1])).category, 'Comunidad');
    await expect(unrelatedDraft).toHaveValue('Certificaciones');

    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    const originalPrincipal = await fixture.principal(adminCookie);
    fixture.accountStore.sessions.clear();
    const expiredWrite = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && adminResourceCommandMatches(response.url(), ids[3]));
    await saveButton(page, ids[3]).click();
    assert.equal((await expiredWrite).status(), 401, 'the real session store rejects the independent draft after expiry');
    await expect(root(page).locator('[data-session-recovery-check]')).toBeVisible();
    await expect(unrelatedDraft).toHaveValue('Certificaciones');

    const renewedCookie = await fixture.login();
    const renewedPrincipal = await fixture.principal(renewedCookie);
    assert.equal(renewedPrincipal.accountId, originalPrincipal.accountId);
    await addCookie(page.context(), fixture, renewedCookie);
    const checkPromise = page.waitForResponse((response) => response.request().method() === 'GET'
      && new URL(response.url()).pathname === '/api/creador/sesion/');
    await root(page).locator('[data-session-recovery-check]').click();
    assert.equal((await checkPromise).status(), 200);
    await expect(saveButton(page, ids[0])).toBeDisabled();
    await expect(saveButton(page, ids[1])).toBeEnabled();
    if (!partial) await expect(affectedDraft).toHaveValue(unsubmittedCategory);
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin,
      'renewing the same account preserves the receipt and document');

    await expect(unrelatedDraft).toHaveValue('Certificaciones');
    const draftResponse = page.waitForResponse((response) => response.request().method() === 'PATCH'
      && adminResourceCommandMatches(response.url(), ids[3]));
    await saveButton(page, ids[3]).click();
    const retriedDraft = await draftResponse;
    assert.equal(retriedDraft.status(), 200, 'the independent draft saves after explicit session renewal');
    assert.equal(JSON.parse(retriedDraft.request().postData()).version, 1);
    assert.equal(retriedDraft.request().headers()['x-csrf-token'], renewedPrincipal.csrfToken);
    assert.equal((await fixture.rawResource(ids[3])).category, 'Certificaciones');
    await expect(row(page, ids[4]).getByLabel('Categoría')).toHaveValue('Later draft survives recovery');
    await expect(root(page).locator('[data-refresh-view]')).toBeVisible();
    if (!partial) {
      await expect(affectedDraft).toHaveValue(unsubmittedCategory);
      await affectedDraft.fill(observedCategory);
    }
    const reload = page.waitForNavigation({ waitUntil: 'load' });
    const lastDraft = await submitClassification(page, ids[4], 'Seguridad');
    assert.equal(lastDraft.status(), 200);
    await reload;
    assert.notEqual(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin,
      'saving the last independent draft allows the actual refresh');
    assert.equal((await fixture.rawResource(ids[4])).category, 'Seguridad');
    assert.equal((await fixture.rawResource(ids[0])).category, 'Seguridad', 'the stale unsubmitted edit did not overwrite the acknowledged row');
    await expect(row(page, ids[0]).getByLabel('Categoría')).toHaveValue('Seguridad');
    await expect(row(page, ids[1]).getByLabel('Categoría')).toHaveValue('Comunidad');
    await expect(row(page, ids[3]).getByLabel('Categoría')).toHaveValue('Certificaciones');
    await expect(row(page, ids[4]).getByLabel('Categoría')).toHaveValue('Seguridad');
    assert.equal(route.observed.length, 1, 'session recovery and safe refresh never replay the claim grant');
  } finally {
    await route.stop();
    fixture.creatorStore.get = originalGet;
  }
});
}

test('a bad receipt remains stale through same-account session recovery, unrelated save, and safe refresh', async ({ fixture, page }) => {
  const ids = ['admin-recovery-target', 'admin-recovery-save', 'admin-recovery-later-draft'];
  const oldCookie = await prepareAdmin(fixture, page, ids);
  const originalPrincipal = await fixture.principal(oldCookie);
  await openAdmin(fixture, page);
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
  await openAdmin(fixture, page);
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
  await openAdmin(fixture, page);
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

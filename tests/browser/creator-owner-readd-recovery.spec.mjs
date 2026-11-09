import assert from 'node:assert/strict';
import {
  test,
  expect,
  api,
  addLink,
  addChapter,
  createSeries,
  captureCreatorApi,
  loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

const OWNER_PATH = '/api/creador/perfil';
const LINKS_PATH = '/api/creador/enlaces';

function writesTo(capture, method, path) {
  return capture.writes().filter((write) => write.method === method && write.path === path);
}

function profileForm(page) {
  return page.locator('[data-owner-dialog][open] form[data-owner-form="datos"]');
}

async function assertFocusInActiveDialog(page) {
  await expect.poll(() => page.evaluate(() => {
    const active = document.activeElement;
    const dialog = document.querySelector('[data-owner-dialog][open]');
    return {
      connected: Boolean(active?.isConnected),
      visible: Boolean(active?.getClientRects().length),
      insideActiveDialog: Boolean(dialog?.contains(active)),
    };
  })).toEqual({ connected: true, visible: true, insideActiveDialog: true });
}

test('Volver a agregar exige comprobar el perfil vigente antes de crear el enlace y conserva los campos adoptados', async ({ fixture, page }, testInfo) => {
  const cookie = await loggedInOwner(fixture, page, {
    profileFields: { city: 'Córdoba', country: 'Argentina', bio: 'Biografía inicial' },
  });
  const target = await addLink(fixture, cookie, {
    title: 'Recurso retenido para comprobar perfil',
    url: 'https://phase2-readd.example/target',
  });
  const series = await createSeries(fixture, cookie, {
    name: 'Serie que no debe restaurarse',
    slug: 'serie-no-restaurada',
  });
  await addChapter(fixture, cookie, series.id, target.placementId);

  let owner = await api(fixture, cookie, OWNER_PATH);
  assert.equal(owner.response.status, 200);
  const beforeHighlight = owner.body.links.find(({ resourceId }) => resourceId === target.resourceId);
  assert.ok(beforeHighlight, 'the setup link is an active owner placement');
  const placementBeforeHighlight = await fixture.rawPlacement(cookie, target.placementId);
  const resourceBeforeHighlight = await fixture.rawResource(target.resourceId);
  const highlighted = await api(fixture, cookie, `${LINKS_PATH}/${target.placementId}/editar`, {
    method: 'PATCH',
    body: {
      featured: true,
      profileVersion: owner.body.profile.version,
      placementVersion: placementBeforeHighlight.version,
      resourceVersion: resourceBeforeHighlight.version,
    },
  });
  assert.equal(highlighted.response.status, 200, JSON.stringify(highlighted.body));
  const beforeRemovalPlacement = await fixture.rawPlacement(cookie, target.placementId);
  assert.equal(beforeRemovalPlacement.featured, true);
  assert.ok(beforeRemovalPlacement.series?.[series.id], 'the target begins as a real Series chapter');

  owner = await api(fixture, cookie, OWNER_PATH);
  assert.equal(owner.response.status, 200);
  const removal = await api(fixture, cookie, `${LINKS_PATH}/${target.placementId}`, {
    method: 'DELETE', body: { profileVersion: owner.body.profile.version },
  });
  assert.equal(removal.response.status, 204);
  assert.equal(await fixture.rawPlacement(cookie, target.placementId), null,
    'the initial real removal leaves the owned resource retained without a placement');
  const observedOwner = await api(fixture, cookie, OWNER_PATH);
  assert.equal(observedOwner.response.status, 200);
  const observedProfile = observedOwner.body.profile;
  const retainedResource = observedOwner.body.editableResources.find(({ id }) => id === target.resourceId);
  assert.ok(retainedResource, 'the removed owned resource is eligible for explicit Re-add');
  assert.equal(observedOwner.body.links.some(({ resourceId }) => resourceId === target.resourceId), false);

  const capture = await captureCreatorApi(page);
  let baselineObservation;
  try {
    await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
    await expect(page.locator('[data-creator-owner]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
    const retained = page.locator(`[data-owner-retained-links] [data-retained-resource="${target.resourceId}"]`);
    await expect(retained).toBeVisible();
    const initialEditProfile = page.getByRole('button', { name: 'Editar datos', exact: true });
    await initialEditProfile.click();
    const initialProfileForm = profileForm(page);
    await expect(initialProfileForm).toBeVisible();
    await expect(initialProfileForm.getByLabel(/Ciudad/)).toHaveValue('Córdoba');
    await expect(initialProfileForm.getByLabel(/País/)).toHaveValue('Argentina');
    await assertFocusInActiveDialog(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-owner-dialog][open]')).toHaveCount(0);
    await expect(initialEditProfile).toBeFocused();
    assert.equal(capture.writes().length, 0,
      'inspecting the initially observed profile closes without a write before the independent update');

    const secondCookie = await fixture.login();
    const originalPrincipal = await fixture.principal(cookie);
    const secondPrincipal = await fixture.principal(secondCookie);
    assert.equal(secondPrincipal.accountId, originalPrincipal.accountId,
      'the second authenticated caller belongs to the same owner account');
    assert.notEqual(secondPrincipal.csrfToken, originalPrincipal.csrfToken,
      'the competing profile edit uses a separate real authenticated session');
    const competitorUpdate = await api(fixture, secondCookie, OWNER_PATH, {
      method: 'PUT',
      body: {
        version: observedProfile.version,
        displayName: observedProfile.displayName,
        slug: observedProfile.slug,
        city: 'Lima',
        country: 'Perú',
        bio: observedProfile.bio,
        programs: observedProfile.programs,
        socials: observedProfile.socials,
      },
    });
    assert.equal(competitorUpdate.response.status, 200, JSON.stringify(competitorUpdate.body));
    assert.equal(competitorUpdate.body.profile.version, observedProfile.version + 1,
      'the independent real profile write advances the version after the browser loaded');
    assert.equal(competitorUpdate.body.profile.city, 'Lima');
    assert.equal(competitorUpdate.body.profile.country, 'Perú');

    await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', LINKS_PATH)[0]?.status).toBeDefined();
    const firstReadd = writesTo(capture, 'POST', LINKS_PATH)[0];
    await firstReadd.settled;
    const recovery = page.locator('[data-owner-list-recovery="links"]');
    if (firstReadd.status === 201) await expect(recovery).toBeVisible();
    baselineObservation = {
      requestBody: firstReadd.body,
      responseStatus: firstReadd.status,
      responseBody: firstReadd.responseBody,
      recoveryVisibleAfter201: firstReadd.status === 201 ? await recovery.isVisible() : null,
      expectedProfileVersion: observedProfile.version,
      currentProfileVersion: competitorUpdate.body.profile.version,
    };
    assert.equal(firstReadd.status, 409,
      `stale Re-add must conflict without writing; observed ${JSON.stringify(baselineObservation)}`);
    assert.equal(firstReadd.responseBody?.error, 'PROFILE_CONFLICT');
    assert.deepEqual(firstReadd.body, {
      resourceId: target.resourceId,
      resourceVersion: retainedResource.version,
      profileVersion: observedProfile.version,
    }, 'the request compares the exact retained resource and captured owner profile versions');
    assert.equal(await fixture.rawPlacement(cookie, target.placementId), null,
      'a stale Re-add conflict creates no placement');
    assert.equal((await fixture.rawOwner(cookie)).profile.version, competitorUpdate.body.profile.version,
      'the conflict does not mutate the independently updated profile');
    assert.equal(capture.writes().length, 1, 'the stale attempt is not automatically replayed');
    await expect(recovery).toBeVisible();

    const writesBeforeCheck = capture.writes().length;
    const readsBeforeCheck = capture.records.filter(({ method, path }) => method === 'GET' && path === OWNER_PATH).length;
    await recovery.getByRole('button', { name: 'Comprobar', exact: true }).click();
    await expect(recovery).toHaveCount(0,
      'Comprobar adopts the real complete owner snapshot without a second adoption action');
    const checkReads = capture.records.filter(({ method, path }) => method === 'GET' && path === OWNER_PATH);
    assert.ok(checkReads.length > readsBeforeCheck, 'Comprobar performs a real current owner read');
    const adoptedRead = checkReads.at(-1);
    assert.equal(adoptedRead.status, 200);
    assert.equal(adoptedRead.responseBody.profile.version, competitorUpdate.body.profile.version);
    assert.equal(adoptedRead.responseBody.profile.city, 'Lima');
    assert.equal(adoptedRead.responseBody.profile.country, 'Perú');
    assert.equal(capture.writes().length, writesBeforeCheck,
      'comparison adopts the whole snapshot without replaying or issuing a write');
    await expect(retained).toBeVisible();
    assert.equal((await fixture.rawOwner(cookie)).profile.city, 'Lima');
    assert.equal((await fixture.rawOwner(cookie)).profile.country, 'Perú');

    const editProfile = page.getByRole('button', { name: 'Editar datos', exact: true });
    await editProfile.click();
    const adoptedProfileForm = profileForm(page);
    await expect(adoptedProfileForm).toBeVisible();
    await expect(adoptedProfileForm.getByLabel(/Ciudad/)).toHaveValue('Lima');
    await expect(adoptedProfileForm.getByLabel(/País/)).toHaveValue('Perú');
    await assertFocusInActiveDialog(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-owner-dialog][open]')).toHaveCount(0);
    await expect(editProfile).toBeFocused();
    assert.equal(capture.writes().length, writesBeforeCheck,
      'inspecting and closing the adopted profile does not save or replay changes');

    await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', LINKS_PATH)[1]?.status).toBe(201);
    const manualReadd = writesTo(capture, 'POST', LINKS_PATH)[1];
    await manualReadd.settled;
    assert.deepEqual(manualReadd.body, {
      resourceId: target.resourceId,
      resourceVersion: retainedResource.version,
      profileVersion: competitorUpdate.body.profile.version,
    }, 'only the separate manual retry uses the adopted current profile and exact resource bases');
    assert.equal(writesTo(capture, 'POST', LINKS_PATH).length, 2,
      'the failed attempt and one explicit manual retry are the only Re-add POSTs');
    assert.equal(manualReadd.responseBody?.link?.resourceId, target.resourceId);
    assert.equal(manualReadd.responseBody?.link?.url, target.url);
    const persistedOwner = await api(fixture, cookie, OWNER_PATH);
    assert.equal(persistedOwner.response.status, 200);
    const matchingLinks = persistedOwner.body.links.filter(({ resourceId }) => resourceId === target.resourceId);
    assert.equal(matchingLinks.length, 1, 'the manual retry creates exactly one placement for the exact resource');
    const readdedLink = matchingLinks[0];
    assert.equal(readdedLink.url, target.url, 'the existing current resource URL is preserved');
    assert.ok(readdedLink.placementId);
    const persistedEditableResource = persistedOwner.body.editableResources.find(({ id }) => id === target.resourceId);
    assert.deepEqual({ id: persistedEditableResource?.id, title: persistedEditableResource?.title,
      url: persistedEditableResource?.url, version: persistedEditableResource?.version }, {
      id: target.resourceId, title: target.title, url: target.url, version: retainedResource.version,
    }, 'the active owned resource remains editable without changing its resource identity or metadata');
    await expect(page.locator(`[data-link-row="${readdedLink.placementId}"]`)).toBeVisible();
    await expect(page.locator(`[data-owner-retained-links] [data-retained-resource="${target.resourceId}"]`)).toHaveCount(0);
    await expect(page.locator('[data-owner-list-recovery="links"]')).toHaveCount(0,
      'the browser accepts the canonical 201 result without retaining an uncertain prompt');
    const readdedPlacement = await fixture.rawPlacement(cookie, readdedLink.placementId);
    assert.ok(readdedPlacement);
    assert.equal(readdedPlacement.featured, false, 'a fresh placement does not restore the old highlight');
    assert.equal(readdedPlacement.series?.[series.id], undefined,
      'a fresh placement does not restore the old Series chapter');
    assert.equal((await fixture.rawOwner(cookie)).profile.version, competitorUpdate.body.profile.version + 1);

    await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
    const form = profileForm(page);
    await expect(form).toBeVisible();
    await expect(form.getByLabel(/Ciudad/)).toHaveValue('Lima');
    await expect(form.getByLabel(/País/)).toHaveValue('Perú');
    await assertFocusInActiveDialog(page);
    const nextName = 'Perfil guardado después de comprobar';
    await form.getByLabel('Nombre visible').fill(nextName);
    await form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'PUT', OWNER_PATH).at(-1)?.status).toBe(200);
    const laterProfileWrite = writesTo(capture, 'PUT', OWNER_PATH).at(-1);
    assert.equal(laterProfileWrite.body.version, competitorUpdate.body.profile.version + 1,
      'the later manual edit uses the profile version from the accepted Re-add result');
    assert.equal(laterProfileWrite.body.city, 'Lima');
    assert.equal(laterProfileWrite.body.country, 'Perú');
    const finalProfile = await api(fixture, cookie, OWNER_PATH);
    assert.equal(finalProfile.response.status, 200);
    assert.equal(finalProfile.body.profile.displayName, nextName);
    assert.equal(finalProfile.body.profile.city, 'Lima');
    assert.equal(finalProfile.body.profile.country, 'Perú');
    assert.equal(finalProfile.body.profile.version, competitorUpdate.body.profile.version + 2);
    assert.equal(capture.writes().length, 3,
      'the only browser mutations are the stale POST, manual POST and later profile PUT');
  } finally {
    if (baselineObservation) {
      await testInfo.attach('f2-readd-baseline-observation.json', {
        body: Buffer.from(JSON.stringify(baselineObservation, null, 2)),
        contentType: 'application/json',
      });
    }
    await capture.stop().catch(() => {});
  }
});

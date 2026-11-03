import assert from 'node:assert/strict';
import {
  test,
  expect,
  api,
  createSeries,
  addLink,
  addChapter,
  captureCreatorApi,
  seriesRow,
  loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

function dataForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
}

function socialsForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="redes"]');
}

async function openDataEditor(page) {
  await page.getByRole('button', { name: 'Editar datos' }).click();
  const form = dataForm(page);
  await expect(form).toBeVisible();
  return form;
}

async function expectResolvedHref(locator, origin, path) {
  const expected = new URL(path, origin).href;
  await expect.poll(() => locator.evaluate((element, base) => new URL(element.getAttribute('href'), base).href, origin))
    .toBe(expected);
}

test('Series: publicar y cambiar el slug actualiza las dos URLs públicas, conserva el alias y permite editar Redes', async ({ fixture, page, publicPage }) => {
  const cookie = await loggedInOwner(fixture, page, {
    profileFields: {
      socials: {
        instagram: 'https://instagram.example.invalid/ana',
        website: 'https://old.example.invalid/ana',
      },
    },
  });
  const initial = await fixture.rawOwner(cookie);
  const series = await createSeries(fixture, cookie, { name: 'Lambda desde cero', slug: 'lambda-desde-cero' });
  const link = await addLink(fixture, cookie, { title: 'Capítulo público', url: 'https://learn.example.invalid/lambda' });
  await addChapter(fixture, cookie, series.id, link.placementId);
  const capture = await captureCreatorApi(page);

  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  await expect(page.getByRole('heading', { name: 'Series', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar página' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ver página pública/ })).toBeHidden();
  await expect(seriesRow(page, series.id).getByRole('link', { name: 'Abrir serie pública' })).toBeHidden();

  const beforePublish = await fixture.rawOwner(cookie);
  await page.getByRole('button', { name: 'Publicar página' }).click();
  await capture.settle();
  const publishedWrite = capture.writes().find(({ method, path }) => method === 'POST' && path === '/api/creador/perfil/publicar');
  assert.ok(publishedWrite, 'publishing from the Series view reaches the real publication API');
  assert.equal(publishedWrite.status, 200);
  const afterPublish = await fixture.rawOwner(cookie);
  assert.equal(afterPublish.profile.published, true);
  assert.deepEqual(publishedWrite.responseBody.versionChanges, [
    { entity: 'profile', id: beforePublish.profile.id, before: beforePublish.profile.version, after: afterPublish.profile.version },
  ]);

  const originalProfileHref = `/c/${initial.profile.slug}/`;
  const originalSeriesHref = `${originalProfileHref}series/${series.slug}/`;
  const profileLink = page.getByRole('link', { name: /Ver página pública/ });
  const seriesLink = seriesRow(page, series.id).getByRole('link', { name: 'Abrir serie pública' });
  await expectResolvedHref(profileLink, fixture.origin, originalProfileHref);
  await expectResolvedHref(seriesLink, fixture.origin, originalSeriesHref);
  const originalProfileResponse = await publicPage.goto(new URL(originalProfileHref, fixture.origin).href);
  assert.equal(originalProfileResponse?.status(), 200);
  const originalSeriesResponse = await publicPage.goto(new URL(originalSeriesHref, fixture.origin).href);
  assert.equal(originalSeriesResponse?.status(), 200);

  const data = await openDataEditor(page);
  await data.getByLabel('Dirección de tu página').fill('ana-ruta-actualizada');
  await data.getByRole('button', { name: 'Guardar datos' }).click();
  await capture.settle();
  const slugWrite = capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').at(-1);
  assert.ok(slugWrite, 'the slug edit in the Series view reaches the real profile endpoint');
  assert.equal(slugWrite.status, 200);
  assert.equal(slugWrite.body.slug, 'ana-ruta-actualizada');
  const afterSlug = await fixture.rawOwner(cookie);
  assert.equal(afterSlug.profile.slug, 'ana-ruta-actualizada');
  assert.equal(afterSlug.profile.published, true, 'editing the address keeps the page published');
  assert.deepEqual(slugWrite.responseBody.versionChanges, [
    { entity: 'profile', id: afterSlug.profile.id, before: afterPublish.profile.version, after: afterSlug.profile.version },
  ]);
  const oldAlias = await fixture.creatorStore.get(`alias:${initial.profile.slug}`);
  assert.deepEqual(oldAlias, {
    recordType: 'profileAlias', slug: initial.profile.slug, profileId: initial.profile.id, version: 1,
  }, 'the actual alias record for the prior public address remains reserved');

  const currentProfileHref = `/c/${afterSlug.profile.slug}/`;
  const currentSeriesHref = `${currentProfileHref}series/${series.slug}/`;
  await expectResolvedHref(profileLink, fixture.origin, currentProfileHref);
  await expectResolvedHref(seriesLink, fixture.origin, currentSeriesHref);
  const currentProfileResponse = await publicPage.goto(new URL(currentProfileHref, fixture.origin).href);
  assert.equal(currentProfileResponse?.status(), 200);
  const currentSeriesResponse = await publicPage.goto(new URL(currentSeriesHref, fixture.origin).href);
  assert.equal(currentSeriesResponse?.status(), 200);

  const oldProfilePath = new URL(originalProfileHref, fixture.origin).pathname;
  const profileAlias = publicPage.waitForResponse((response) => response.status() === 308
    && new URL(response.url()).pathname === oldProfilePath);
  await publicPage.goto(new URL(originalProfileHref, fixture.origin).href);
  const profileAliasResponse = await profileAlias;
  assert.equal(profileAliasResponse.status(), 308);
  assert.equal(new URL(profileAliasResponse.headers()['location'], fixture.origin).pathname, currentProfileHref);
  await expect(publicPage).toHaveURL(new URL(currentProfileHref, fixture.origin).href);

  const oldSeriesPath = new URL(originalSeriesHref, fixture.origin).pathname;
  const seriesAlias = publicPage.waitForResponse((response) => response.status() === 308
    && new URL(response.url()).pathname === oldSeriesPath);
  await publicPage.goto(new URL(originalSeriesHref, fixture.origin).href);
  const seriesAliasResponse = await seriesAlias;
  assert.equal(seriesAliasResponse.status(), 308);
  assert.equal(new URL(seriesAliasResponse.headers()['location'], fixture.origin).pathname, currentSeriesHref);
  await expect(publicPage).toHaveURL(new URL(currentSeriesHref, fixture.origin).href);

  await page.getByRole('button', { name: 'Editar redes' }).click();
  let networks = socialsForm(page);
  await expect(networks).toBeVisible();
  const instagram = networks.getByLabel('Instagram');
  await instagram.fill('ftp://invalid.example.invalid/ana');
  await networks.getByRole('button', { name: 'Guardar redes' }).click();
  const invalid = await instagram.evaluate((input) => ({ valid: input.checkValidity(), message: input.validationMessage }));
  assert.equal(invalid.valid, false, 'native URL validity rejects schemes outside HTTP and HTTPS');
  assert.notEqual(invalid.message, '', 'the browser exposes why the invalid social URL cannot be submitted');
  await capture.settle();
  assert.equal(capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').length, 1,
    'invalid social data never reaches the real profile endpoint');

  await networks.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Editar redes' }).click();
  networks = socialsForm(page);
  await expect(networks.getByLabel('Instagram')).toHaveValue('https://instagram.example.invalid/ana');
  const restored = await networks.getByLabel('Instagram').evaluate((input) => ({ valid: input.checkValidity(), message: input.validationMessage }));
  assert.equal(restored.valid, true);
  assert.equal(restored.message, '', 'discarding the invalid correction clears native validity state');

  await networks.getByLabel('Instagram').fill('');
  await networks.getByLabel('Sitio web o newsletter').fill('https://new.example.invalid/ana');
  await networks.getByRole('button', { name: 'Guardar redes' }).click();
  await capture.settle();
  const networksWrite = capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').at(-1);
  assert.ok(networksWrite);
  assert.equal(networksWrite.status, 200);
  assert.deepEqual(networksWrite.body, {
    socials: { website: 'https://new.example.invalid/ana' },
    version: afterSlug.profile.version,
  }, 'the saved network update includes the valid URL and explicitly omits the cleared URL');

  const rawFinal = await fixture.rawOwner(cookie);
  const readFinal = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(readFinal.response.status, 200);
  assert.equal(rawFinal.profile.version, afterSlug.profile.version + 1);
  assert.deepEqual(rawFinal.profile.socials, { website: 'https://new.example.invalid/ana' });
  assert.deepEqual(readFinal.body.profile.socials, rawFinal.profile.socials,
    'a fresh owner read matches the raw profile after the real network write');
  assert.deepEqual(networksWrite.responseBody.versionChanges, [
    { entity: 'profile', id: rawFinal.profile.id, before: afterSlug.profile.version, after: rawFinal.profile.version },
  ]);
  await expectResolvedHref(profileLink, fixture.origin, currentProfileHref);
  await expectResolvedHref(seriesLink, fixture.origin, currentSeriesHref);
  await expect(page.locator('[data-owner-social="instagram"]')).toBeHidden();
  await expect(page.locator('[data-owner-social="website"] a')).toHaveAttribute('href', 'https://new.example.invalid/ana');
  await capture.stop();
});

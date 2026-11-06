import assert from 'node:assert/strict';
import { test, expect, api, loggedInOwner, captureCreatorApi } from '../fixtures/creator-browser-test.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';

const name = (root, label) => root.getByRole('button', { name: label, exact: true });
const pathOf = (request) => new URL(request.url()).pathname.replace(/\/$/u, '');
const ownerPath = '/api/creador/perfil';
const linksPath = '/api/creador/enlaces';
const option = (form) => form.getByRole('checkbox', { name: 'Proponer al directorio' });
const dialog = (page) => page.locator('[data-owner-dialog][open]');
const form = (page, kind) => dialog(page).locator(`form[data-owner-form="${kind}"]`);
async function openOwner(fixture, page) {
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
}

for (const lost of [false, true]) {
  test(`shared duplicate keeps the unsent Add option with ${lost ? 'lost' : 'delivered'} acknowledgement`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const shared = { id: 'review-shared-choice', title: 'Original catalog title', url: 'https://shared-review.example/catalog',
      description: 'Original description', kind: 'source', format: 'Canal de YouTube', category: 'Canal de YouTube',
      published: true, directoryControl: 'editorial', version: 4, order: 1 };
    await seedResource(fixture.creatorStore, shared);
    const placement = await api(fixture, cookie, linksPath, {
      method: 'POST', body: { title: shared.title, url: shared.url, description: shared.description, selectedForDirectory: false },
    });
    assert.equal(placement.response.status, 201);
    assert.equal(placement.body.link.selectedForDirectory, false);
    const savedBefore = (await api(fixture, cookie, ownerPath)).body;
    await openOwner(fixture, page);
    const capture = await captureCreatorApi(page, { skipErrorBodies: true });
    let confirmed;
    let observedNoOp;
    const noOp = new Promise((resolve) => { observedNoOp = resolve; });
    const transport = async (route) => {
      if (confirmed || route.request().method() !== 'POST') return route.continue();
      confirmed = true;
      const actual = await route.fetch();
      const body = await actual.json();
      observedNoOp({ status: actual.status(), body, sent: route.request().postDataJSON() });
      if (lost) await route.abort('failed');
      else await route.fulfill({ response: actual, json: body });
    };
    await page.route('**/api/creador/enlaces/', transport);
    try {
      await name(page, 'Agregar enlace').click();
      const add = form(page, 'alta-enlace');
      await add.getByLabel('Título', { exact: true }).fill('Draft title still pending');
      await add.getByLabel('URL', { exact: true }).fill(shared.url);
      await add.getByLabel(/Descripción/u).fill('Draft description still pending');
      await expect(option(add)).toBeChecked();
      await name(add, 'Agregar enlace').click();
      const actual = await noOp;
      assert.equal(actual.sent.selectedForDirectory, true);
      assert.equal(actual.status, 200);
      assert.equal(actual.body.created, false);
      assert.deepEqual(actual.body.versionChanges, []);
      assert.equal(actual.body.link.placementId, placement.body.link.placementId);
      assert.equal(actual.body.link.selectedForDirectory, false);
      if (lost) {
        await name(add, 'Comprobar si se agregó la URL original').click();
        await name(add, 'Abrir ficha guardada: ' + shared.title).click();
      }
      const saved = form(page, 'enlace');
      const resume = name(saved, 'Volver al borrador sin guardar las opciones');
      await expect(resume).toBeEnabled();
      await expect(saved.getByLabel('Título', { exact: true })).toBeDisabled();
      const optionOnSavedEditor = await option(saved).isChecked();
      await resume.click();
      await expect(add.getByLabel('Título', { exact: true })).toHaveValue('Draft title still pending');
      await expect(add.getByLabel(/Descripción/u)).toHaveValue('Draft description still pending');
      const recoveredAddChoice = await option(add).isChecked();
      assert.deepEqual((await api(fixture, cookie, ownerPath)).body, savedBefore, 'checking and returning to Add do not write');
      const nextUrl = 'https://shared-review.example/independent';
      await add.getByLabel('URL', { exact: true }).fill(nextUrl);
      const manual = page.waitForResponse((response) => response.request().method() === 'POST'
        && pathOf(response.request()) === linksPath && response.status() === 201);
      await name(add, 'Agregar enlace').click();
      const request = (await manual).request().postDataJSON();
      assert.equal(request.profileVersion, savedBefore.profile.version,
        'owner Add submits the observed profile version for receipt validation');
      const final = (await api(fixture, cookie, ownerPath)).body;
      const next = final.links.find(({ url }) => url === nextUrl);
      assert.equal(next.title, 'Draft title still pending');
      assert.equal(final.links.find(({ url }) => url === shared.url).selectedForDirectory, false);
      assert.equal(capture.writes().filter((record) => record.method === 'POST').length, 2);
      console.log(JSON.stringify({ lost, sentChoice: actual.sent.selectedForDirectory, storedChoice: actual.body.link.selectedForDirectory,
        optionOnSavedEditor, recoveredAddChoice, manualChoice: request.selectedForDirectory, persistedChoice: next.selectedForDirectory }));
      assert.equal(next.selectedForDirectory, true, 'manual Add must keep the explicitly retained directory choice');
    } finally {
      await page.unroute('**/api/creador/enlaces/', transport);
      await capture.stop({ skipErrorBodies: true });
    }
  });
}

test('native save and exit validates required fields without persisting an invalid profile', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const before = (await api(fixture, cookie, ownerPath)).body.profile;
  assert.equal(before.displayName, 'Ana Browser');
  assert.equal(before.published, false);
  await openOwner(fixture, page);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  try {
    await name(page, 'Editar datos').click();
    const editor = form(page, 'datos');
    const displayName = editor.getByLabel('Nombre visible');
    await displayName.fill('');
    assert.equal(await displayName.evaluate((input) => input.validity.valueMissing), true);
    await name(editor, 'Guardar datos').click();
    await expect(displayName).toBeFocused();
    assert.equal(capture.writes().length, 0);
    assert.deepEqual((await api(fixture, cookie, ownerPath)).body.profile, before);
    await name(editor, 'Cancelar').click();
    const prompt = dialog(page).locator('[data-owner-exit-prompt]');
    await expect(prompt).toBeVisible();
    await name(prompt, 'Guardar y salir').click();
    await expect(displayName).toBeFocused();
    assert.equal(capture.writes().length, 0, 'native-invalid exit save does not send a second write');
    const fresh = (await api(fixture, cookie, ownerPath)).body.profile;
    assert.deepEqual(fresh, before, 'a native-invalid form must not be persisted through a second save entry point');
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

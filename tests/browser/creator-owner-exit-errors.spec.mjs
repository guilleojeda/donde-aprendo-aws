import assert from 'node:assert/strict';
import {
  test, expect, api, addCookie, addLink, captureCreatorApi, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';

const ownerPath = (request) => new URL(request.url()).pathname.replace(/\/$/u, '');
const prompt = (page) => page.locator('[data-owner-exit-prompt]');

function writesTo(capture, method, path) {
  return capture.writes().filter((record) => record.method === method && record.path === path);
}

function readsOf(capture, path = '/api/creador/perfil') {
  return capture.records.filter((record) => record.method === 'GET' && record.path === path);
}

async function openLinksView(page, fixture) {
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces&buscar=preparacion-historial`);
  await expect(page.locator('astro-island[component-url*="CreatorOwnerApp"]')).not.toHaveAttribute('ssr', '');
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  const destination = page.url();
  await page.locator('#owner-link-order').selectOption('titulo-desc');
  await expect(page).toHaveURL((url) => url.searchParams.get('orden') === 'titulo-desc');
  return destination;
}

async function openAddLink(page) {
  await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const form = page.locator('[data-owner-dialog][open] form[data-owner-form="alta-enlace"]');
  await expect(form).toBeVisible();
  return form;
}

async function requestBack(page, activeUrl) {
  const attempt = page.goBack();
  attempt.catch(() => {});
  await expect(prompt(page)).toBeVisible();
  await expect(page).toHaveURL(activeUrl);
  return { attempt };
}

function fixtureSessionKey(fixture) {
  const keys = [...fixture.accountStore.sessions.keys()].filter((key) => key.startsWith('SESSION#'));
  assert.equal(keys.length, 1, 'the browser fixture has one real authenticated session');
  return keys[0];
}

test('Guardar y salir: un rechazo corregible de Agregar enlace cancela la salida y conserva el formulario', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const destination = await openLinksView(page, fixture);
  const activeUrl = page.url();
  const form = await openAddLink(page);
  const title = 'Borrador rechazado desde la salida';
  const invalidServiceUrl = 'https://user:secret@links.example/exit-rejection';
  await form.getByLabel('Título', { exact: true }).fill(title);
  await form.getByLabel('URL', { exact: true }).fill(invalidServiceUrl);
  assert.equal(await form.getByLabel('URL', { exact: true }).evaluate((input) => input.checkValidity()), true,
    'the browser accepts this URL syntax so the real service owns the rejection');

  const capture = await captureCreatorApi(page);
  let back;
  try {
    back = (await requestBack(page, activeUrl)).attempt;
    await prompt(page).getByRole('button', { name: 'Guardar y salir', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(422);
    await back;

    const rejected = writesTo(capture, 'POST', '/api/creador/enlaces')[0];
    assert.equal(rejected.body.url, invalidServiceUrl);
    assert.equal((await fixture.rawOwner(cookie)).profile.version, 1,
      'the real validation rejection performs no profile or placement write');
    await expect(page).toHaveURL(activeUrl, 'a definite rejection cancels the requested Back');
    await expect(form).toBeVisible('the editor remains visible after Guardar y salir is rejected');
    await expect(form.getByLabel('Título', { exact: true })).toHaveValue(title);
    await expect(form.getByLabel('URL', { exact: true })).toHaveValue(invalidServiceUrl);
    await expect(form.getByText(/sin usuario ni contraseña/i)).toBeVisible();
    await expect(prompt(page),
      'a rejected Guardar y salir does not replace the editor with a second unsaved-changes prompt').toBeHidden();
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1,
      'the rejected exit attempt is not retried automatically');

    // The original Back is canceled. A later navigation is a new user decision.
    const stayBack = page.goBack();
    await expect(prompt(page)).toBeVisible();
    await expect(page).toHaveURL(activeUrl);
    await prompt(page).getByRole('button', { name: 'Seguir editando', exact: true }).click();
    await stayBack;

    const discardBack = page.goBack();
    await expect(prompt(page)).toBeVisible();
    await prompt(page).getByRole('button', { name: 'Descartar cambios', exact: true }).click();
    await discardBack;
    await expect(page).toHaveURL(destination);
    await page.goForward();
    await expect(page).toHaveURL(activeUrl);
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1,
      'Back and Forward after the rejected exit do not create another write');
  } finally {
    back?.catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Guardar y salir: un Add reutilizado con acuse perdido conserva el borrador y no reenvía la escritura', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  const shared = {
    id: 'exit-reused-shared-resource',
    title: 'Metadatos editoriales guardados',
    url: 'https://links.example/exit-reused',
    description: 'Descripción editorial guardada',
    category: 'Contenido',
    kind: 'source',
    format: 'Artículo',
    topics: ['AWS'],
    published: true,
    hidden: false,
    approvalRevoked: false,
    directoryControl: 'editorial',
    version: 4,
  };
  await seedResource(fixture.creatorStore, shared);
  await openLinksView(page, fixture);
  const activeUrl = page.url();
  const form = await openAddLink(page);
  const title = 'Metadatos locales sin acuse';
  const description = 'Descripción que el Add reutilizado no debe guardar';
  await form.getByLabel('Título', { exact: true }).fill(title);
  await form.getByLabel('URL', { exact: true }).fill('https://links.example/exit-reused');
  await form.getByLabel(/Descripción/).fill(description);

  let actualAdd;
  const loseAcknowledgement = async (route) => {
    const request = route.request();
    if (actualAdd || request.method() !== 'POST' || ownerPath(request) !== '/api/creador/enlaces') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    actualAdd = { status: response.status(), body: await response.json() };
    await route.abort('failed');
  };
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let back;
  await page.route('**/api/creador/**', loseAcknowledgement);
  try {
    back = (await requestBack(page, activeUrl)).attempt;
    await prompt(page).getByRole('button', { name: 'Guardar y salir', exact: true }).click();
    await expect.poll(() => actualAdd?.status).toBe(201);
    await back;
    assert.equal(actualAdd.status, 201, 'the real Add command commits before its acknowledgement is lost');
    assert.equal(actualAdd.body.disposition, 'resource-reused');
    assert.ok(actualAdd.body.placementId);
    assert.equal(actualAdd.body.resourceId, shared.id);

    await expect(page).toHaveURL(activeUrl, 'a lost acknowledgement does not finish the requested Back');
    await expect(form).toBeVisible('the Add draft stays visible while its result is uncertain');
    await expect(form.getByRole('button', { name: 'Comprobar estado guardado', exact: true })).toBeVisible();
    await expect(form.getByLabel('Título', { exact: true })).toHaveValue(title);
    await expect(form.getByLabel(/Descripción/)).toHaveValue(description);
    await expect(prompt(page)).toBeHidden();

    await expect(page.getByRole('button', { name: 'Comprobar estado guardado', exact: true })).toHaveCount(1);
    const readsBeforeCheck = readsOf(capture).length;
    await form.getByRole('button', { name: 'Comprobar estado guardado', exact: true }).click();
    await expect.poll(() => readsOf(capture).length).toBe(readsBeforeCheck + 1);
    await expect.poll(() => readsOf(capture).at(-1)?.status).toBe(200);
    const observed = readsOf(capture).at(-1).responseBody;
    assert.equal(observed.placements[actualAdd.body.placementId].resourceId, shared.id,
      'the real read sees the placement side effect of the reused Add');
    assert.equal(observed.resources.find(({ id }) => id === shared.id).title, shared.title,
      'the reused Add does not apply its draft metadata to the shared resource');
    await expect(form.getByRole('button', { name: 'Usar lo guardado', exact: true })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Volver al borrador', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Usar lo guardado', exact: true })).toHaveCount(1);
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1,
      'the read-only check does not replay a non-idempotent Add');

    await form.getByRole('button', { name: 'Usar lo guardado', exact: true }).click();
    await expect(page.locator('[data-owner-dialog][open]')).toHaveCount(0);
    await expect(page).toHaveURL(activeUrl, 'recovering the saved state does not resume the canceled Back');
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1);

    await page.goBack();
    await expect(page).toHaveURL((url) => url.pathname === new URL(activeUrl).pathname
      && url.searchParams.get('orden') !== 'titulo-desc');
    await page.goForward();
    await expect(page).toHaveURL(activeUrl);
  } finally {
    await page.unroute('**/api/creador/**', loseAcknowledgement).catch(() => {});
    back?.catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Guardar y salir: un Add confirmado con lectura posterior fallida conserva la recuperación y no navega al reintentarla', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const destination = await openLinksView(page, fixture);
  const activeUrl = page.url();
  const form = await openAddLink(page);
  const url = 'https://links.example/exit-read-failure';
  await form.getByLabel('Título', { exact: true }).fill('Add con lectura posterior fallida');
  await form.getByLabel('URL', { exact: true }).fill(url);

  let failedRead = false;
  const failPostCommitRead = async (route) => {
    const request = route.request();
    if (!failedRead && request.method() === 'GET' && ownerPath(request) === '/api/creador/perfil') {
      failedRead = true;
      const response = await route.fetch();
      assert.equal(response.status(), 200, 'the controlled failure follows a real successful owner read');
      await route.fulfill({ response, status: 503 });
      return;
    }
    await route.continue();
  };
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let back;
  await page.route('**/api/creador/**', failPostCommitRead);
  try {
    back = (await requestBack(page, activeUrl)).attempt;
    await prompt(page).getByRole('button', { name: 'Guardar y salir', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(201);
    await expect.poll(() => readsOf(capture).at(-1)?.status).toBe(503);
    assert.equal(failedRead, true, 'the controlled failure followed the real Add');
    await back;

    await expect(page).toHaveURL(activeUrl);
    await expect(form).toBeVisible('the editor remains available after a confirmed write and failed read');
    const retry = form.getByRole('button', { name: 'Reintentar actualización', exact: true });
    await expect(retry).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar actualización', exact: true })).toHaveCount(1);
    await expect(form.getByLabel('URL', { exact: true })).toHaveValue(url);
    await expect(prompt(page)).toBeHidden();
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1,
      'a post-commit read failure never replays the Add');

    await page.unroute('**/api/creador/**', failPostCommitRead);
    await retry.click();
    await expect.poll(() => readsOf(capture).filter(({ status }) => status === 200).length).toBeGreaterThan(0);
    await expect(page).toHaveURL(activeUrl,
      'a successful read recovery still does not resume the canceled history transition');
    await expect(page.locator('[data-owner-dialog][open]')).toHaveCount(0,
      'the confirmed Add consumes its editor only after the explicit read recovery');
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1);
    assert.equal((await api(fixture, cookie, '/api/creador/perfil')).body.resources.some((resource) => resource.url === url), true);

    await page.goBack();
    await expect(page).toHaveURL(destination);
  } finally {
    await page.unroute('**/api/creador/**', failPostCommitRead).catch(() => {});
    back?.catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Guardar y salir: una sesión expirada conserva el Add, recupera sólo la sesión y exige un nuevo guardado', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  await openLinksView(page, fixture);
  const activeUrl = page.url();
  const form = await openAddLink(page);
  const title = 'Borrador tras renovar sesión';
  const url = 'https://links.example/exit-session-recovery';
  await form.getByLabel('Título', { exact: true }).fill(title);
  await form.getByLabel('URL', { exact: true }).fill(url);
  await fixture.accountStore.deleteSession(fixtureSessionKey(fixture));

  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let back;
  try {
    back = (await requestBack(page, activeUrl)).attempt;
    await prompt(page).getByRole('button', { name: 'Guardar y salir', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(401);
    await back;
    await expect(page).toHaveURL(activeUrl);
    await expect(form).toBeVisible();
    await expect(form.getByLabel('Título', { exact: true })).toHaveValue(title);
    await expect(form.getByLabel('URL', { exact: true })).toHaveValue(url);
    const recovery = form.locator('[data-session-recovery-shell]');
    await expect(recovery).toBeVisible();
    await expect(page.locator('[data-session-recovery-shell]:visible')).toHaveCount(1);
    await expect(prompt(page)).toBeHidden();
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1);

    const renewed = await fixture.login();
    await addCookie(page.context(), fixture, renewed);
    const sessionCheck = recovery.locator('[data-session-recovery-check]');
    await sessionCheck.click();
    await expect(page.locator('[data-session-recovery-shell]:visible')).toHaveCount(0);
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1,
      'session recovery performs no automatic Add');
    await expect(page).toHaveURL(activeUrl, 'session recovery does not resume the canceled Back');
    await expect(form.getByLabel('Título', { exact: true })).toBeEnabled();
    await form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces').length).toBe(2);
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[1]?.status).toBe(201);
    await expect(page).toHaveURL(activeUrl);
    assert.equal((await api(fixture, renewed, '/api/creador/perfil')).body.resources.some((resource) => resource.url === url), true);
  } finally {
    back?.catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

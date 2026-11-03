import assert from 'node:assert/strict';
import { completeLogin, cookiePair } from '../fixtures/account-auth.mjs';
import {
  test,
  expect,
  addCookie,
  api,
  createSeries,
  addLink,
  captureCreatorApi,
  seriesRow,
  loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';
import { rasterPhotoFixtures } from '../fixtures/creator-photos.mjs';

function dataForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
}

function sessionCheck(page) {
  return page.locator('[data-owner-dialog][open] [data-session-recovery-check]');
}

function multipartField(payload, fieldName) {
  const escapedName = fieldName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const field = payload.toString('latin1').match(new RegExp(`Content-Disposition: form-data; name="${escapedName}"\\r\\n\\r\\n([^\\r\\n]+)`, 'iu'));
  return field?.[1];
}

function photoForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="foto"]');
}

async function openSeries(page, fixture, suffix = '') {
  await page.goto(`${fixture.origin}/cuenta/?vista=series${suffix}`);
  await expect(page.getByRole('heading', { name: 'Series', exact: true })).toBeVisible();
}

async function openDataEditor(page) {
  await page.getByRole('button', { name: 'Editar datos' }).click();
  const form = dataForm(page);
  await expect(form).toBeVisible();
  return form;
}

async function ensureDataEditor(page) {
  const form = dataForm(page);
  if (await form.isVisible()) return form;
  return openDataEditor(page);
}

async function writeProfileFromForm(form, name, city) {
  await form.getByLabel('Nombre visible').fill(name);
  if (city !== undefined) await form.getByLabel(/Ciudad/).fill(city);
  await form.getByRole('button', { name: 'Guardar datos' }).click();
}

function gate() {
  let release;
  let entered;
  const blocked = new Promise((resolve) => { entered = resolve; });
  const waiting = new Promise((resolve) => { release = resolve; });
  return { blocked, release, entered, waiting };
}

async function installOtherAccount(page, fixture) {
  const oidc = fixture.accountHarness.state.oidc;
  const previousClaims = oidc.claims;
  oidc.claims = { ...(previousClaims ?? {}), sub: 'second-browser-owner', email: 'otra-cuenta@example.invalid' };
  let result;
  try {
    result = await completeLogin(fixture.accountHarness);
  } finally {
    if (previousClaims === undefined) delete oidc.claims;
    else oidc.claims = previousClaims;
  }
  assert.equal(result.response.status, 303, 'the second identity uses the real account callback');
  assert.ok(result.sessionCookie);
  const pair = cookiePair(result.sessionCookie);
  const separator = pair.indexOf('=');
  const cookie = { pair, name: pair.slice(0, separator), value: pair.slice(separator + 1) };
  await addCookie(page.context(), fixture, cookie);
  return cookie;
}

test('el nombre y el slug elegidos en la primera ficha sobreviven a la hidratación tardía en Series', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  let releaseScripts;
  let notifyScript;
  const scriptsRequested = new Promise((resolve) => { notifyScript = resolve; });
  const scriptsReleased = new Promise((resolve) => { releaseScripts = resolve; });
  const blocker = async (route) => {
    if (route.request().resourceType() === 'script') {
      notifyScript();
      await scriptsReleased;
    }
    await route.continue();
  };
  await page.route('**/*', blocker);

  let navigation;
  const capture = await captureCreatorApi(page);
  try {
    navigation = page.goto(`${fixture.origin}/cuenta/?vista=series&buscarSeries=aplicada`, { waitUntil: 'load' });
    await scriptsRequested;

    const createForm = page.locator('form[data-owner-form="crear"]');
    const name = createForm.getByLabel('Nombre visible');
    const slug = createForm.getByLabel('Dirección de tu página');
    await expect(name).toBeVisible();
    await expect(slug).toBeVisible();
    await name.fill('Nombre elegido antes de cargar');
    await slug.fill('direccion-elegida');
    await expect(page.getByRole('button', { name: 'Crear borrador' })).toBeDisabled();
    await expect(page.locator('astro-island')).toHaveAttribute('ssr', '');
    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);

    releaseScripts();
    await navigation;
    await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
    await expect(page.getByRole('button', { name: 'Crear borrador' })).toBeEnabled();
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin,
      'the test must observe hydration of the document whose SSR fields were edited');
    await expect(name).toHaveValue('Nombre elegido antes de cargar');
    await expect(slug).toHaveValue('direccion-elegida');

    await page.getByRole('button', { name: 'Crear borrador' }).click();
    await capture.settle();
    const created = capture.writes().find(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
    assert.ok(created, 'the first-profile action reaches the real profile endpoint');
    assert.equal(created.status, 200);
    assert.equal(created.body.displayName, 'Nombre elegido antes de cargar');
    assert.equal(created.body.slug, 'direccion-elegida');
    const stored = await fixture.rawOwner(cookie);
    assert.equal(stored.profile.displayName, created.responseBody.profile.displayName);
    assert.equal(stored.profile.slug, 'direccion-elegida');
    assert.equal(stored.profile.version, created.responseBody.profile.version);
  } finally {
    releaseScripts();
    await navigation?.catch(() => {});
    await page.unroute('**/*', blocker).catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

test('la búsqueda sin aplicar sobrevive a la hidratación y la acción siguiente usa ese texto', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const first = await createSeries(fixture, cookie, { name: 'Serie aplicada', slug: 'serie-aplicada' });
  const second = await createSeries(fixture, cookie, { name: 'Serie pendiente', slug: 'serie-pendiente' });
  let releaseListScripts;
  let notifyListScript;
  const listScriptRequested = new Promise((resolve) => { notifyListScript = resolve; });
  const listScriptRelease = new Promise((resolve) => { releaseListScripts = resolve; });
  const listBlocker = async (route) => {
    if (route.request().resourceType() === 'script') {
      notifyListScript();
      await listScriptRelease;
    }
    await route.continue();
  };
  await page.route('**/*', listBlocker);
  let listNavigation;
  try {
    listNavigation = page.goto(`${fixture.origin}/cuenta/?vista=series&buscarSeries=aplicada`, { waitUntil: 'load' });
    await listScriptRequested;
    await expect(seriesRow(page, first.id)).toBeVisible();
    await expect(seriesRow(page, second.id)).toHaveCount(0);
    const search = page.getByLabel('Buscar series');
    await search.fill('pendiente');
    assert.equal(new URL(page.url()).searchParams.get('buscarSeries'), 'aplicada',
      'the typed query remains separate from the query that produced the SSR rows');
    await expect(page.locator('astro-island')).toHaveAttribute('ssr', '');
    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    releaseListScripts();
    await listNavigation;
    await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
    await expect(page.getByRole('button', { name: 'Crear serie', exact: true })).toBeEnabled();
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin,
      'the pending query and the next action must belong to the edited SSR document');
    await expect(search).toHaveValue('pendiente');
    await expect(seriesRow(page, first.id)).toBeVisible();
    await expect(seriesRow(page, second.id)).toHaveCount(0);
    await page.getByRole('button', { name: 'Aplicar búsqueda' }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('buscarSeries') === 'pendiente');
    await expect(seriesRow(page, second.id)).toBeVisible();
    await expect(seriesRow(page, first.id)).toHaveCount(0);
  } finally {
    releaseListScripts();
    await listNavigation?.catch(() => {});
    await page.unroute('**/*', listBlocker).catch(() => {});
  }
});

test('una escritura compartida incierta ofrece comprobar al primer resultado, adopta el DTO observado y usa su versión en capítulos', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, {
    profileFields: { city: 'Córdoba', country: 'Argentina', bio: 'Bio inicial', programs: ['Heroes'] },
  });
  const series = await createSeries(fixture, cookie, { name: 'Serie para comprobar', slug: 'serie-para-comprobar' });
  const link = await addLink(fixture, cookie, { title: 'Capítulo disponible', url: 'https://links.example/capitulo-disponible' });
  const initial = await fixture.rawOwner(cookie);
  const beforeSeries = await fixture.rawSeries(cookie, series.id);
  const beforePlacement = await fixture.rawPlacement(cookie, link.placementId);
  const capture = await captureCreatorApi(page);
  await openSeries(page, fixture);
  const form = await openDataEditor(page);

  const ack = gate();
  let actualWrite;
  const loseAfterCommit = async (route) => {
    if (route.request().method() !== 'PUT'
      || new URL(route.request().url()).pathname.replace(/\/$/u, '') !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    actualWrite = { status: response.status(), body: await response.json() };
    ack.entered();
    await ack.waiting;
    await route.abort();
  };
  await page.route('**/api/creador/**', loseAfterCommit);
  let save;
  try {
    save = writeProfileFromForm(form, 'Nombre enviado', 'Ciudad enviada');
    await ack.blocked;
    assert.equal(actualWrite.status, 200, 'the actual profile service committed before its browser acknowledgement was lost');
    const committed = await fixture.rawOwner(cookie);
    assert.equal(committed.profile.version, initial.profile.version + 1);
    assert.equal(committed.profile.displayName, 'Nombre enviado');
    assert.deepEqual(actualWrite.body.versionChanges, [
      { entity: 'profile', id: initial.profile.id, before: initial.profile.version, after: committed.profile.version },
    ]);

    await form.getByLabel('Nombre visible').fill('Corrección B pendiente');
    const external = await api(fixture, cookie, '/api/creador/perfil', {
      method: 'PUT',
      body: {
        version: committed.profile.version,
        city: 'Mendoza',
        country: 'Argentina',
        bio: 'Bio guardada desde otra pestaña',
        programs: ['Community Builders'],
        socials: { website: 'https://remote.example/about' },
      },
    });
    assert.equal(external.response.status, 200, 'the newer saved DTO also comes from the real profile API');
    const saved = await fixture.rawOwner(cookie);
    assert.equal(saved.profile.version, committed.profile.version + 1);
    assert.equal(saved.profile.city, 'Mendoza');
    assert.equal(saved.profile.socials.website, 'https://remote.example/about');
    assert.deepEqual(external.body.versionChanges, [
      { entity: 'profile', id: committed.profile.id, before: committed.profile.version, after: saved.profile.version },
    ]);
    ack.release();
    await save;
  } finally {
    ack.release();
    await save?.catch(() => {});
    await page.unroute('**/api/creador/**', loseAfterCommit).catch(() => {});
  }

  await expect(form.getByRole('button', { name: /Comprobar/ })).toBeVisible();
  const failedWrite = capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
  assert.equal(failedWrite.length, 1, 'the uncertain profile write is not replayed to discover its result');
  assert.deepEqual(await fixture.rawSeries(cookie, series.id), beforeSeries,
    'the unrelated series remains unchanged before the explicit chapter action');

  await form.getByRole('button', { name: /Comprobar/ }).click();
  await expect(form.getByRole('button', { name: 'Usar los datos guardados' })).toBeVisible();
  await expect(form).toContainText('Nombre enviado');
  await expect(form).toContainText('Corrección B pendiente');
  await form.getByRole('button', { name: 'Usar los datos guardados' }).click();
  await expect(form.getByLabel('Nombre visible')).toHaveValue('Nombre enviado');
  await expect(form.getByLabel(/Ciudad/)).toHaveValue('Mendoza');
  await expect(form.getByLabel(/País/)).toHaveValue('Argentina');
  await expect(form.getByLabel(/Sobre ti/)).toHaveValue('Bio guardada desde otra pestaña');
  await expect(form.getByRole('checkbox', { name: 'Community Builders' })).toBeChecked();
  await expect(page.getByRole('heading', { name: 'Nombre enviado', exact: true })).toBeVisible();
  await expect(page.locator('[data-owner-social="website"] a')).toHaveAttribute('href', 'https://remote.example/about');

  const adopted = await fixture.rawOwner(cookie);
  assert.equal(adopted.profile.version, actualWrite.body.profile.version + 1,
    'the adopted snapshot includes the later external write, not only the lost response DTO');
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await seriesRow(page, series.id).getByRole('link', { name: 'Gestionar capítulos' }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('serie') === series.id);
  await page.getByRole('button', { name: 'Agregar capítulo' }).click();
  await capture.settle();

  const chapterPath = `/api/creador/series/${series.id}/capitulos/${link.placementId}`;
  const chapterWrite = capture.writes().find(({ method, path }) => method === 'PUT' && path === chapterPath);
  assert.ok(chapterWrite, 'chapter membership is saved through the real series API');
  assert.equal(chapterWrite.status, 200);
  assert.equal(chapterWrite.body.profileVersion, adopted.profile.version,
    'the chapter action consumes the full adopted profile version');
  const finalOwner = await fixture.rawOwner(cookie);
  const finalPlacement = await fixture.rawPlacement(cookie, link.placementId);
  assert.deepEqual(chapterWrite.responseBody.versionChanges, [
    { entity: 'profile', id: adopted.profile.id, before: adopted.profile.version, after: adopted.profile.version + 1 },
    { entity: 'placement', id: link.placementId, before: beforePlacement.version, after: beforePlacement.version + 1 },
  ]);
  assert.equal(finalOwner.profile.version, adopted.profile.version + 1);
  assert.equal(finalPlacement.series[series.id].position, 0);
  await capture.stop();
});

test('un rechazo antes del commit conserva la verdad guardada y no repite el guardado al comprobar', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profileFields: { city: 'Córdoba' } });
  const initial = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page);
  await openSeries(page, fixture);
  const form = await openDataEditor(page);
  await form.getByLabel('Nombre visible').fill('Corrección que no se guardará');

  let rejected = 0;
  const rejectBeforeHandler = async (route) => {
    if (route.request().method() === 'PUT'
      && new URL(route.request().url()).pathname.replace(/\/$/u, '') === '/api/creador/perfil') {
      rejected += 1;
      await route.abort();
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', rejectBeforeHandler);
  try {
    await form.getByRole('button', { name: 'Guardar datos' }).click();
    await expect(form.getByRole('button', { name: /Comprobar/ })).toBeVisible();
  } finally {
    await page.unroute('**/api/creador/**', rejectBeforeHandler).catch(() => {});
  }

  assert.equal(rejected, 1);
  assert.deepEqual((await fixture.rawOwner(cookie)).profile, initial.profile,
    'the controlled transport failure happened before the real handler and left storage unchanged');
  await form.getByRole('button', { name: /Comprobar/ }).click();
  await expect(form.getByRole('button', { name: 'Usar los datos guardados' })).toBeVisible();
  await expect(form).toContainText('Ana Browser');
  await expect(form).toContainText('Corrección que no se guardará');
  assert.equal(capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').length, 1,
    'checking performs a read and does not replay the failed PUT');
  await form.getByRole('button', { name: 'Usar los datos guardados' }).click();
  await expect(form.getByLabel('Nombre visible')).toHaveValue('Ana Browser');
  await expect(form.getByLabel(/Ciudad/)).toHaveValue('Córdoba');
  assert.deepEqual((await fixture.rawOwner(cookie)).profile, initial.profile);
  await capture.stop();
});

test('un GET ya iniciado no reemplaza la comparación al guardarse otra pestaña y la acción usa la versión adoptada', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Serie con lectura tardía', slug: 'serie-con-lectura-tardia' });
  const link = await addLink(fixture, cookie, { title: 'Capítulo después de comparar', url: 'https://links.example/capitulo-despues' });
  const initial = await fixture.rawOwner(cookie);
  const beforePlacement = await fixture.rawPlacement(cookie, link.placementId);
  await openSeries(page, fixture);
  const otherTab = await page.context().newPage();
  await openSeries(otherTab, fixture);
  const firstCapture = await captureCreatorApi(page);
  const secondCapture = await captureCreatorApi(otherTab);

  const firstForm = await openDataEditor(page);
  await firstForm.getByLabel('Nombre visible').fill('Corrección local que conservaré');
  const secondForm = await openDataEditor(otherTab);
  await writeProfileFromForm(secondForm, 'Guardado en otra pestaña');
  await secondCapture.settle();
  const savedInOtherTab = await fixture.rawOwner(cookie);
  assert.equal(savedInOtherTab.profile.version, initial.profile.version + 1);
  const firstOtherTabWrite = secondCapture.writes().find(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
  assert.equal(firstOtherTabWrite?.status, 200);
  assert.equal(firstOtherTabWrite?.responseBody.profile.version, savedInOtherTab.profile.version);
  assert.deepEqual(firstOtherTabWrite?.responseBody.versionChanges, [
    { entity: 'profile', id: initial.profile.id, before: initial.profile.version, after: savedInOtherTab.profile.version },
  ]);

  await firstForm.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(firstForm.getByRole('button', { name: /Comparar con lo guardado/ })).toBeVisible();

  const responseGate = gate();
  let capturedOldBody;
  let latestProfile;
  const delayOwnerReadBody = async (route) => {
    const request = route.request();
    if (request.method() === 'GET' && new URL(request.url()).pathname.replace(/\/$/u, '') === '/api/creador/perfil') {
      const response = await route.fetch();
      capturedOldBody = await response.json();
      responseGate.entered();
      await responseGate.waiting;
      await route.fulfill({ response, json: capturedOldBody });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', delayOwnerReadBody);
  let comparison;
  try {
    comparison = firstForm.getByRole('button', { name: /Comparar con lo guardado/ }).click();
    await responseGate.blocked;
    assert.equal(capturedOldBody.profile.version, savedInOtherTab.profile.version,
      'the delayed response is a real owner DTO read before the later save');

    const secondEdit = await ensureDataEditor(otherTab);
    await secondEdit.getByLabel(/Ciudad/).fill('Mendoza');
    await secondEdit.getByRole('button', { name: 'Guardar datos' }).click();
    await secondCapture.settle();
    latestProfile = await fixture.rawOwner(cookie);
    assert.equal(latestProfile.profile.version, savedInOtherTab.profile.version + 1);
    assert.equal(latestProfile.profile.city, 'Mendoza');
    const newestWrite = secondCapture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').at(-1);
    assert.equal(newestWrite?.status, 200);
    assert.equal(newestWrite?.responseBody.profile.version, latestProfile.profile.version);
    assert.deepEqual(newestWrite?.responseBody.versionChanges, [
      { entity: 'profile', id: initial.profile.id, before: savedInOtherTab.profile.version, after: latestProfile.profile.version },
    ]);
    responseGate.release();
    await comparison;
  } finally {
    responseGate.release();
    await comparison?.catch(() => {});
    await page.unroute('**/api/creador/**', delayOwnerReadBody).catch(() => {});
  }

  await expect(firstForm.getByLabel('Nombre visible')).toHaveValue('Corrección local que conservaré');
  await expect(firstForm.getByRole('button', { name: 'Usar los datos guardados' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ana Browser', exact: true })).toBeVisible();
  await expect(firstForm).toContainText('Guardado en otra pestaña');
  assert.equal((await fixture.rawOwner(cookie)).profile.version, latestProfile.profile.version,
    'delivering the older body does not roll back the actual third-version profile');

  await firstForm.getByRole('button', { name: /Comparar con lo guardado/ }).click();
  await expect(firstForm).toContainText('Mendoza');
  await firstForm.getByRole('button', { name: 'Usar los datos guardados' }).click();
  await expect(firstForm.getByLabel('Nombre visible')).toHaveValue('Guardado en otra pestaña');
  await expect(firstForm.getByLabel(/Ciudad/)).toHaveValue('Mendoza');
  await firstForm.getByRole('button', { name: 'Cancelar' }).click();
  await seriesRow(page, series.id).getByRole('link', { name: 'Gestionar capítulos' }).click();
  await page.getByRole('button', { name: 'Agregar capítulo' }).click();
  await firstCapture.settle();

  const chapterPath = `/api/creador/series/${series.id}/capitulos/${link.placementId}`;
  const chapterWrite = firstCapture.writes().find(({ method, path }) => method === 'PUT' && path === chapterPath);
  assert.ok(chapterWrite);
  assert.equal(chapterWrite.body.profileVersion, latestProfile.profile.version,
    'the new chapter command uses the explicitly adopted latest base');
  assert.equal(chapterWrite.status, 200);
  const after = await fixture.rawOwner(cookie);
  const placement = await fixture.rawPlacement(cookie, link.placementId);
  assert.equal(after.profile.version, latestProfile.profile.version + 1);
  assert.equal(placement.series[series.id].position, 0);
  assert.deepEqual(chapterWrite.responseBody.versionChanges, [
    { entity: 'profile', id: initial.profile.id, before: latestProfile.profile.version, after: latestProfile.profile.version + 1 },
    { entity: 'placement', id: link.placementId, before: beforePlacement.version, after: beforePlacement.version + 1 },
  ]);
  assert.equal(secondCapture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').length, 2);
  await firstCapture.stop();
  await secondCapture.stop();
  await otherTab.close();
});

test('recuperar la misma sesión conserva el borrador y nunca repite la escritura automáticamente', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page);
  const writeCsrfTokens = [];
  const rememberWriteToken = (request) => {
    const path = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() === 'PUT' && path === '/api/creador/perfil') {
      writeCsrfTokens.push(request.headers()['x-csrf-token']);
    }
  };
  page.on('request', rememberWriteToken);
  await openSeries(page, fixture);
  const form = await openDataEditor(page);
  await form.getByLabel('Nombre visible').fill('Borrador tras recuperar sesión');

  let unauthorized = 0;
  const loseSessionBeforeHandler = async (route) => {
    if (route.request().method() === 'PUT'
      && new URL(route.request().url()).pathname.replace(/\/$/u, '') === '/api/creador/perfil' && unauthorized === 0) {
      unauthorized += 1;
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'AUTH_REQUIRED' }) });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', loseSessionBeforeHandler);
  try {
    await form.getByRole('button', { name: 'Guardar datos' }).click();
    await expect(sessionCheck(page)).toBeVisible();
    await sessionCheck(page).click();
    await expect(sessionCheck(page)).toBeHidden();
  } finally {
    await page.unroute('**/api/creador/**', loseSessionBeforeHandler).catch(() => {});
  }

  await expect(form.getByLabel('Nombre visible')).toHaveValue('Borrador tras recuperar sesión');
  assert.deepEqual((await fixture.rawOwner(cookie)).profile, initial.profile,
    'same-account CSRF recovery does not adopt data or replay the rejected request');
  const profileWrites = capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
  assert.equal(profileWrites.length, 1);
  const sessionReads = capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/sesion');
  assert.equal(sessionReads.length, 1);
  assert.equal(sessionReads[0].status, 200, 'session recovery goes through the real same-context endpoint');
  assert.equal(writeCsrfTokens.length, 1);
  assert.equal(writeCsrfTokens[0], sessionReads[0].responseBody.csrfToken,
    'the manual retry uses the token returned by the same-account session read');

  await form.getByRole('button', { name: 'Guardar datos' }).click();
  await capture.settle();
  const writesAfterManualSave = capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
  assert.equal(writesAfterManualSave.length, 2, 'the second request exists only after the person manually saves again');
  assert.equal(writesAfterManualSave[1].body.version, initial.profile.version);
  assert.equal(writesAfterManualSave[1].body.displayName, 'Borrador tras recuperar sesión');
  assert.equal(writesAfterManualSave[1].status, 200);
  const final = await fixture.rawOwner(cookie);
  assert.equal(final.profile.displayName, 'Borrador tras recuperar sesión');
  assert.equal(final.profile.version, initial.profile.version + 1);
  assert.equal(writeCsrfTokens.length, 2);
  assert.equal(writeCsrfTokens[1], sessionReads[0].responseBody.csrfToken);
  page.off('request', rememberWriteToken);
  await capture.stop();
});

test('la recuperación bloquea una cuenta distinta y conserva el formulario sin repetir la escritura', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const original = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page);
  await openSeries(page, fixture);
  const form = await openDataEditor(page);
  await form.getByLabel('Nombre visible').fill('Corrección de cuenta original');

  const rejectChangedAccountWrite = async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'AUTH_REQUIRED' }) });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/perfil**', rejectChangedAccountWrite);
  await form.getByRole('button', { name: 'Guardar datos' }).click();
  await expect(sessionCheck(page)).toBeVisible();

  const other = await installOtherAccount(page, fixture);
  await sessionCheck(page).click();
  await capture.settle();
  await expect(page.locator('[data-owner-dialog] [data-session-recovery-status]')).toContainText(/otra cuenta|otros permisos/i);
  await expect(form.getByLabel('Nombre visible')).toHaveValue('Corrección de cuenta original');
  await expect(form.getByRole('button', { name: 'Guardar datos' })).toBeDisabled();
  const otherPrincipal = await fixture.principal(other);
  const otherOwner = await fixture.rawOwner(other);
  assert.notEqual(otherPrincipal.accountId, original.principal.accountId);
  assert.deepEqual((await fixture.rawOwner(cookie)).profile, original.profile);
  assert.equal(otherOwner.principal.accountId, otherPrincipal.accountId);
  assert.equal(otherOwner.owner ?? null, null,
    'the second authenticated account has no owner record in the shared creator store');
  assert.equal(otherOwner.profile, null,
    'a different authenticated account cannot inherit the original account profile');
  assert.equal(capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').length, 1,
    'the changed account is blocked without replaying the rejected write');
  const sessionRead = capture.records.find(({ method, path }) => method === 'GET' && path === '/api/creador/sesion');
  assert.equal(sessionRead?.status, 409, 'the real session endpoint rejects a binding from another account');
  await page.unroute('**/api/creador/perfil**', rejectChangedAccountWrite).catch(() => {});
  await capture.stop();
});

test('la misma cuenta con un rol distinto no hereda el contexto privado ni envía el borrador', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page);
  await openSeries(page, fixture);
  const form = await openDataEditor(page);
  await form.getByLabel('Nombre visible').fill('Corrección mientras cambia el rol');
  const rejectBeforeHandler = async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'AUTH_REQUIRED' }) });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', rejectBeforeHandler);
  try {
    await form.getByRole('button', { name: 'Guardar datos' }).click();
    await expect(sessionCheck(page)).toBeVisible();
    const [account] = [...fixture.accountStore.accounts.values()];
    assert.ok(account, 'the account callback created the real session identity record');
    fixture.accountStore.seedAccount({ ...account, isAdmin: true });
    const changedRole = await fixture.principal(cookie);
    assert.equal(changedRole.accountId, initial.principal.accountId);
    assert.notEqual(changedRole.isAdmin, initial.principal.isAdmin);

    await sessionCheck(page).click();
    await capture.settle();
    await expect(page.locator('[data-owner-dialog] [data-session-recovery-status]')).toContainText(/otros permisos/i);
    await expect(form.getByRole('button', { name: 'Guardar datos' })).toBeDisabled();
    await expect(form.getByLabel('Nombre visible')).toHaveValue('Corrección mientras cambia el rol');
    assert.deepEqual((await fixture.rawOwner(cookie)).profile, initial.profile,
      'the account and profile records are unchanged while the authorization role differs from the page');
    const sessionRead = capture.records.find(({ method, path }) => method === 'GET' && path === '/api/creador/sesion');
    assert.equal(sessionRead?.status, 409, 'the real session endpoint rejects the same account under a different role');
    assert.equal(capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil').length, 1,
      'role mismatch does not replay the profile write');
  } finally {
    await page.unroute('**/api/creador/**', rejectBeforeHandler).catch(() => {});
  }
  await capture.stop();
});

test('la foto A se comprueba tras perder el acuse, conserva el archivo B y luego guarda B con la base vigente', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await fixture.rawOwner(cookie);
  const images = await rasterPhotoFixtures();
  const capture = await captureCreatorApi(page);
  const directUploads = [];
  const providerFailures = [];
  let failNextProfileCheck = false;
  const finalizeGate = gate();
  let finalA;
  const uploadThroughProvider = async (route) => {
    try {
      const request = route.request();
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: {
          'access-control-allow-origin': fixture.origin,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? '',
        } });
        return;
      }
      const payload = request.postDataBuffer() ?? Buffer.alloc(0);
      const selected = payload.includes(images.jpeg) ? images.jpeg : payload.includes(images.png) ? images.png : undefined;
      assert.ok(selected, 'the browser sends the selected file bytes to the authorized provider boundary');
      const key = multipartField(payload, 'key');
      assert.ok(key, 'the browser uploads to the key from the signed multipart request');
      assert.equal(request.method(), 'POST');
      assert.match(request.headers()['content-type'] ?? '', /multipart\/form-data/i);
      fixture.photoObjects.seed(key, selected);
      directUploads.push({ key, selected });
      if (selected === images.jpeg) {
        finalizeGate.entered();
        await finalizeGate.waiting;
      }
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': fixture.origin } });
    } catch (error) {
      providerFailures.push(error);
      await route.abort().catch(() => {});
    }
  };
  const loseFinalA = async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue().catch((error) => logoutCaptureFailures.push(error));
      return;
    }
    const body = JSON.parse(route.request().postData() ?? '{}');
    if (!finalA) {
      const response = await route.fetch();
      finalA = { status: response.status(), body: await response.json(), requestBody: body };
      await route.abort();
      return;
    }
    await route.continue();
  };
  const failOneCheck = async (route) => {
    if (failNextProfileCheck && route.request().method() === 'GET'
      && new URL(route.request().url()).pathname.replace(/\/$/u, '') === '/api/creador/perfil') {
      failNextProfileCheck = false;
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'AUTH_REQUIRED' }) });
      return;
    }
    await route.continue();
  };
  await page.route('https://creator-photos.example.invalid/**', uploadThroughProvider);
  await page.route('**/api/creador/foto/finalizar/', loseFinalA);
  await page.route('**/api/creador/perfil/', failOneCheck);
  try {
    await openSeries(page, fixture);
    await page.getByRole('button', { name: 'Editar foto' }).click();
    const form = photoForm(page);
    await expect(form).toBeVisible();
    const file = form.getByLabel('Elegir una foto');
    await file.setInputFiles({ name: 'foto-a.jpg', mimeType: 'image/jpeg', buffer: images.jpeg });
    await form.getByRole('button', { name: 'Subir y guardar foto' }).click();
    await finalizeGate.blocked;

    await file.setInputFiles({ name: 'foto-b.png', mimeType: 'image/png', buffer: images.png });
    await expect.poll(() => file.evaluate((input) => input.files?.length ?? 0)).toBe(1);
    finalizeGate.release();
    await expect(form.getByRole('button', { name: /Comprobar.*foto|Comprobar.*estado/ })).toBeVisible();
    assert.equal(finalA.status, 200, 'the real photo service finalized A before its browser response was lost');
    const afterA = await fixture.rawOwner(cookie);
    assert.equal(afterA.profile.version, initial.profile.version + 1);
    assert.equal(afterA.profile.photo.version, 'browser-photo-1');
    assert.equal(finalA.requestBody.version, initial.profile.version);
    assert.deepEqual(finalA.body.versionChanges, [
      { entity: 'profile', id: initial.profile.id, before: initial.profile.version, after: afterA.profile.version },
    ]);

    failNextProfileCheck = true;
    await form.getByRole('button', { name: /Comprobar.*foto|Comprobar.*estado/ }).click();
    await expect(sessionCheck(page)).toBeVisible();
    await sessionCheck(page).click();
    await expect(sessionCheck(page)).toBeHidden();
    await file.evaluate((input) => input.files?.[0]?.name).then((value) => assert.equal(value, 'foto-b.png'));
    await form.getByRole('button', { name: /Comprobar.*foto|Comprobar.*estado/ }).click();
    await expect.poll(() => file.evaluate((input) => input.files?.length ?? 0)).toBe(1);
    await file.evaluate((input) => input.files?.[0]?.name).then((value) => assert.equal(value, 'foto-b.png'));

    const now = await fixture.rawOwner(cookie);
    assert.equal(now.profile.version, afterA.profile.version);
    const finalizesBeforeB = capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/finalizar');
    assert.equal(finalizesBeforeB.length, 1, 'checking A never replays its finalize request');
    await form.getByRole('button', { name: 'Subir y guardar foto' }).click();
    await expect.poll(async () => (await fixture.rawOwner(cookie)).profile.photo?.version).toBe('browser-photo-2');
    await capture.settle();

    const authorizationsSeen = capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/autorizar');
    const finalizesSeen = capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/foto/finalizar');
    assert.equal(authorizationsSeen.length, 2);
    assert.equal(finalizesSeen.length, 2);
    assert.equal(authorizationsSeen[0].body.version, initial.profile.version);
    assert.equal(finalizesSeen[0].body.version, initial.profile.version);
    assert.equal(authorizationsSeen[1].body.version, afterA.profile.version,
      'B is a new explicit upload based on the adopted photo A profile version');
    assert.equal(finalizesSeen[1].body.version, afterA.profile.version);
    assert.deepEqual(finalizesSeen[1].responseBody.versionChanges, [
      { entity: 'profile', id: initial.profile.id, before: afterA.profile.version, after: afterA.profile.version + 1 },
    ]);
    const final = await fixture.rawOwner(cookie);
    assert.equal(final.profile.version, afterA.profile.version + 1);
    assert.equal(final.profile.photo.version, 'browser-photo-2');
    assert.deepEqual(directUploads.map(({ selected }) => selected), [images.jpeg, images.png]);
    assert.deepEqual(fixture.photoPolicies.map(({ key }) => key), directUploads.map(({ key }) => key),
      'the real photo service authorized the exact temporary objects uploaded by the browser');
    assert.deepEqual(authorizationsSeen.map(({ responseBody }) => responseBody?.post?.fields?.key), directUploads.map(({ key }) => key),
      'each multipart upload uses the key returned by its real authorization response');
    assert.deepEqual(providerFailures, [], 'provider route failures are handled and reported as test assertions');
    const storedPhoto = await fixture.photos.readPhoto({
      profileId: initial.profile.id,
      version: final.profile.photo.version,
    });
    assert.ok(Buffer.isBuffer(storedPhoto.body));
    assert.equal(storedPhoto.contentType, 'image/webp');
    assert.equal(storedPhoto.body.toString('ascii', 0, 4), 'RIFF');
    await capture.stop();
  } finally {
    finalizeGate.release();
    await page.unroute('https://creator-photos.example.invalid/**', uploadThroughProvider).catch(() => {});
    await page.unroute('**/api/creador/foto/finalizar/', loseFinalA).catch(() => {});
    await page.unroute('**/api/creador/perfil/', failOneCheck).catch(() => {});
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('un fallo del resumen no bloquea capítulos y el detalle privado no aparece en la página pública', async ({ fixture, page, publicPage }) => {
  const cookie = await loggedInOwner(fixture, page);
  const publication = await api(fixture, cookie, '/api/creador/perfil/publicar', { method: 'POST', body: {} });
  assert.equal(publication.response.status, 200);
  const series = await createSeries(fixture, cookie, { name: 'Serie sin bloqueo', slug: 'serie-sin-bloqueo' });
  const link = await addLink(fixture, cookie, { title: 'Capítulo pese al resumen', url: 'https://links.example/actividad-fallida' });
  const before = await fixture.rawOwner(cookie);
  const beforePlacement = await fixture.rawPlacement(cookie, link.placementId);
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  let statisticsRequest;
  const summaryResponse = page.waitForResponse((response) => new URL(response.url()).pathname.startsWith('/api/creador/estadisticas'));
  await page.route('**/api/creador/estadisticas/**', async (route) => {
    statisticsRequest = route.request();
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      headers: { 'cache-control': 'private, no-store' },
      body: JSON.stringify({ error: 'STATISTICS_UNAVAILABLE' }),
    });
  });
  await openSeries(page, fixture);
  const statsResponse = await summaryResponse;
  const activityStatus = page.getByRole('status').filter({ hasText: /estadísticas/i }).first();
  await expect(activityStatus).toContainText(/no pudimos cargar/i);
  assert.ok(statisticsRequest, 'the published Series view asks for the private summary');
  assert.equal(statsResponse.status(), 503);
  assert.match(statsResponse.headers()['cache-control'] ?? '', /private.*no-store/i);

  await seriesRow(page, series.id).getByRole('link', { name: 'Gestionar capítulos' }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('serie') === series.id);
  await page.getByRole('button', { name: 'Agregar capítulo' }).click();
  await capture.settle();
  const chapterPath = `/api/creador/series/${series.id}/capitulos/${link.placementId}`;
  const chapterWrite = capture.writes().find(({ method, path }) => method === 'PUT' && path === chapterPath);
  assert.ok(chapterWrite, 'the real Series action remains available after the activity request fails');
  assert.equal(chapterWrite.status, 200);
  const after = await fixture.rawOwner(cookie);
  const placement = await fixture.rawPlacement(cookie, link.placementId);
  assert.equal(chapterWrite.body.profileVersion, before.profile.version);
  assert.deepEqual(chapterWrite.responseBody.versionChanges, [
    { entity: 'profile', id: before.profile.id, before: before.profile.version, after: before.profile.version + 1 },
    { entity: 'placement', id: link.placementId, before: beforePlacement.version, after: beforePlacement.version + 1 },
  ]);
  assert.equal(after.profile.version, before.profile.version + 1);
  assert.equal(placement.series[series.id].position, 0);

  const publicResponse = await publicPage.goto(`${fixture.origin}/c/${encodeURIComponent(after.profile.slug)}/series/${encodeURIComponent(series.slug)}/`);
  assert.equal(publicResponse?.status(), 200);
  const publicHtml = await publicPage.content();
  assert.doesNotMatch(publicHtml, /Estadísticas de tu página|Visitantes estimados|Clics en enlaces/u,
    'the private owner summary is absent from the public Series HTML');
  assert.equal(publicHtml.includes('STATISTICS_UNAVAILABLE'), false);
  await capture.stop();
});

test('el logout estático espera la escritura, respeta la corrección pendiente y envía una sola solicitud', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page);
  await openSeries(page, fixture);
  const accountMenu = page.locator('.creator-owner__account-menu');
  const accountMenuSummary = accountMenu.locator(':scope > summary');
  if (!await accountMenu.evaluate((element) => element.open)) await accountMenuSummary.click();
  const logoutForm = page.locator('form[data-account-logout]');
  await expect(logoutForm.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled();
  const logoutNode = await logoutForm.elementHandle();
  const logoutRequests = [];
  const logoutResponses = [];
  const logoutCaptureFailures = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/cuenta/salir/' && request.method() === 'POST') logoutRequests.push(request);
  });
  const captureLogoutResponse = async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    let response;
    try {
      response = await route.fetch();
      const rawBody = await response.body();
      logoutResponses.push({ status: response.status(), headers: response.headers(), body: JSON.parse(rawBody.toString('utf8')) });
    } catch (error) {
      logoutCaptureFailures.push(error);
      if (response) await route.fulfill({ response }).catch(() => {});
      else await route.abort().catch(() => {});
      return;
    }
    try {
      await route.fulfill({ response });
    } catch (error) {
      logoutCaptureFailures.push(error);
      await route.abort().catch(() => {});
    }
  };
  await page.route('**/cuenta/salir/', captureLogoutResponse);
  const writeGate = gate();
  const holdDataWrite = async (route) => {
    if (route.request().method() !== 'PUT'
      || new URL(route.request().url()).pathname.replace(/\/$/u, '') !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    writeGate.entered();
    await writeGate.waiting;
    await route.fulfill({ response });
  };
  await page.route('**/api/creador/**', holdDataWrite);
  const form = await openDataEditor(page);
  await form.getByLabel('Nombre visible').fill('Guardado antes de salir');
  let save;
  try {
    save = form.getByRole('button', { name: 'Guardar datos' }).click();
    await writeGate.blocked;
    await logoutForm.evaluate((formElement) => formElement.requestSubmit());
    await expect(form.locator('[data-owner-form-status="datos"]')).toContainText(/espera a que termine antes de salir/i);
    assert.equal(logoutRequests.length, 0, 'the static logout slot does not submit while a real write is in flight');
    writeGate.release();
    await save;
  } finally {
    writeGate.release();
    await save?.catch(() => {});
    await page.unroute('**/api/creador/**', holdDataWrite).catch(() => {});
  }
  await capture.settle();
  const savedProfile = capture.writes().find(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
  assert.equal(savedProfile?.status, 200);
  assert.equal(savedProfile?.body.version, initial.profile.version);
  const afterProfileSave = await fixture.rawOwner(cookie);
  assert.equal(afterProfileSave.profile.version, initial.profile.version + 1);
  assert.equal(afterProfileSave.profile.displayName, 'Guardado antes de salir');
  assert.deepEqual(savedProfile?.responseBody.versionChanges, [
    { entity: 'profile', id: initial.profile.id, before: initial.profile.version, after: afterProfileSave.profile.version },
  ]);

  assert.equal(await logoutNode.evaluate((node) => node.isConnected && node === document.querySelector('form[data-account-logout]')), true,
    'the Astro logout form stays the same DOM node across the confirmed shared profile write');
  if (!await accountMenu.evaluate((element) => element.open)) await accountMenuSummary.click();
  await expect(logoutForm.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled();
  const correctionForm = await ensureDataEditor(page);
  await correctionForm.getByLabel('Nombre visible').fill('Corrección que requiere decisión');
  await logoutForm.evaluate((formElement) => formElement.requestSubmit());
  await expect(page.getByRole('alertdialog')).toBeVisible();
  assert.equal(logoutRequests.length, 0, 'dirty state opens the guard before logout is submitted');
  await page.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await logoutForm.evaluate((formElement) => formElement.requestSubmit());
  await page.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect.poll(() => logoutResponses.length).toBe(1);
  assert.deepEqual(logoutCaptureFailures, [], 'the real logout response is read before the browser receives it');
  assert.equal(logoutResponses[0].status, 200);
  assert.match(logoutResponses[0].headers['cache-control'] ?? '', /private.*no-store/i);
  assert.equal(logoutRequests.length, 1, 'discarding the correction resumes exactly one static logout submission');
  assert.equal(new URL(logoutResponses[0].body.redirect).pathname, '/logout');
  assert.equal((await fixture.principal(cookie)).state, 'anonymous', 'the real account service revoked the session');
  await page.unroute('**/cuenta/salir/', captureLogoutResponse);
  await capture.stop();
});

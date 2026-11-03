import assert from 'node:assert/strict';
import {
  test, expect, api, createSeries, addLink, captureCreatorApi, seriesForm, seriesRow,
  openSeriesView, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function writesFor(capture, method, path) {
  return capture.writes().filter((write) => write.method === method && write.path === path);
}

function sortedReceipts(changes = []) {
  return [...changes].sort((left, right) => `${left.entity}:${left.id}`.localeCompare(`${right.entity}:${right.id}`));
}

async function holdPrecommit503(page, { method, path }) {
  const entered = deferred();
  let handled = false;
  let requestBody;
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (handled || request.method() !== method || pathname !== path) {
      await route.continue();
      return;
    }
    handled = true;
    requestBody = request.postData() ? JSON.parse(request.postData()) : undefined;
    entered.resolve();
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"TEMPORARY_FAILURE"}' });
  };
  await page.route('**/api/creador/**', handler);
  return {
    entered: entered.promise,
    get requestBody() { return requestBody; },
    async remove() { await page.unroute('**/api/creador/**', handler).catch(() => {}); },
  };
}

async function holdCommittedCreate(page) {
  const entered = deferred();
  const gate = deferred();
  let handled = false;
  let actual;
  let requestBody;
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (handled || request.method() !== 'POST' || pathname !== '/api/creador/series') {
      await route.continue();
      return;
    }
    handled = true;
    requestBody = request.postData() ? JSON.parse(request.postData()) : undefined;
    const response = await route.fetch();
    actual = { status: response.status(), headers: response.headers() };
    if (response.status() !== 204) actual.body = await response.json();
    entered.resolve();
    await gate.promise;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"TEMPORARY_FAILURE"}' });
  };
  await page.route('**/api/creador/**', handler);
  return {
    entered: entered.promise,
    get actual() { return actual; },
    get requestBody() { return requestBody; },
    release: () => gate.resolve(),
    async remove() {
      gate.resolve();
      await page.unroute('**/api/creador/**', handler).catch(() => {});
    },
  };
}

async function holdFirstOwnerRead(page) {
  const entered = deferred();
  const gate = deferred();
  const handlerFinished = deferred();
  let held = false;
  let snapshot;
  let heldRequest;
  let requestFailure;
  let handlerPromise;
  let handlerCancelled = false;
  let handlerFailed = false;
  let handlerError;
  const requestFailedHandler = (request) => {
    if (request === heldRequest) requestFailure = request.failure()?.errorText;
  };
  page.on('requestfailed', requestFailedHandler);
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (held || request.method() !== 'GET' || pathname !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    held = true;
    heldRequest = request;
    handlerPromise = (async () => {
      const response = await route.fetch();
      snapshot = await response.json();
      entered.resolve();
      await gate.promise;
      await route.fulfill({ response, json: snapshot });
    })();
    try {
      await handlerPromise;
    } catch (error) {
      const failure = heldRequest?.failure()?.errorText ?? requestFailure;
      if (failure === 'net::ERR_ABORTED') handlerCancelled = true;
      else {
        handlerFailed = true;
        handlerError = error;
      }
    } finally {
      handlerFinished.resolve();
    }
  };
  await page.route('**/api/creador/**', handler);
  return {
    entered: entered.promise,
    get snapshot() { return snapshot; },
    release: () => gate.resolve(),
    async wait() {
      if (held) await handlerFinished.promise;
      if (handlerFailed) throw handlerError;
      return handlerCancelled ? 'cancelled' : held ? 'delivered' : 'not-intercepted';
    },
    async remove() {
      gate.resolve();
      let waitError;
      try {
        await this.wait();
      } catch (error) {
        waitError = error;
      }
      await page.unroute('**/api/creador/**', handler);
      page.off('requestfailed', requestFailedHandler);
      if (handlerFailed) throw waitError ?? handlerError;
    },
  };
}

async function holdPatchBeforeHandler(page, path) {
  const entered = deferred();
  const gate = deferred();
  let handled = false;
  let body;
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (handled || request.method() !== 'PATCH' || pathname !== path) {
      await route.continue();
      return;
    }
    handled = true;
    body = request.postData() ? JSON.parse(request.postData()) : undefined;
    entered.resolve();
    await gate.promise;
    await route.continue();
  };
  await page.route('**/api/creador/**', handler);
  return {
    entered: entered.promise,
    get body() { return body; },
    release: () => gate.resolve(),
    async remove() {
      gate.resolve();
      await page.unroute('**/api/creador/**', handler).catch(() => {});
    },
  };
}

async function fillSeries(form, values) {
  await form.getByLabel('Nombre de la serie').fill(values.name);
  await form.getByLabel('Dirección de la serie').fill(values.slug);
  await form.getByLabel(/Descripción/).fill(values.description);
}

test('Series: el primer alta rechazada se comprueba, no encuentra entidad y sólo se reintenta con Guardar manual', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const ownerBefore = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  await openSeriesView(page, fixture);
  await page.getByRole('button', { name: 'Crear serie' }).click();
  const form = seriesForm(page);
  const draft = { name: 'Ruta pendiente', slug: 'ruta-pendiente', description: 'Descripción conservada' };
  await fillSeries(form, draft);

  const rejected = await holdPrecommit503(page, { method: 'POST', path: '/api/creador/series' });
  let save;
  try {
    save = form.getByRole('button', { name: 'Guardar serie' }).click();
    await rejected.entered;
    await save;
    await capture.settle({ skipErrorBodies: true });
  } finally {
    await rejected.remove();
    await save?.catch(() => {});
  }
  const posts = () => writesFor(capture, 'POST', '/api/creador/series');
  assert.equal(posts().length, 1);
  assert.equal(posts()[0].status, 503);
  assert.deepEqual(posts()[0].body, { ...draft, profileVersion: ownerBefore.profile.version });
  assert.deepEqual(rejected.requestBody, posts()[0].body);
  assert.equal(await fixture.creatorStore.list('series:').then((rows) => rows.length), 0,
    'the transport rejected the request before the real handler created any series');
  await expect(form.locator('[data-owner-compare]'), 'Comprobar must be available on the first uncertain result').toBeVisible();
  assert.equal(posts().length, 1, 'the browser does not replay while the user has not checked');

  await form.locator('[data-owner-compare]').click();
  const comparison = form.locator('[data-owner-comparison]');
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText(/no (?:hay|muestra) una serie activa/i);
  await expect(comparison).toContainText(draft.slug);
  await expect(form.getByLabel('Nombre de la serie')).toHaveValue(draft.name);
  await expect(form.getByLabel('Dirección de la serie')).toHaveValue(draft.slug);
  await expect(form.getByLabel(/Descripción/)).toHaveValue(draft.description);
  assert.equal(posts().length, 1, 'the actual empty-list read does not start a new POST');
  assert.equal(await fixture.creatorStore.list('series:').then((rows) => rows.length), 0);

  const continueFromComparedBase = form.locator('[data-owner-adopt]');
  await expect(continueFromComparedBase).toBeVisible();
  await continueFromComparedBase.click();
  await expect(form.getByLabel('Nombre de la serie')).toHaveValue(draft.name);
  await expect(form.getByLabel('Dirección de la serie')).toHaveValue(draft.slug);
  await expect(form.getByLabel(/Descripción/)).toHaveValue(draft.description);
  assert.equal(posts().length, 1, 'choosing the compared, unchanged profile base does not repeat the creation');

  await form.getByRole('button', { name: 'Guardar serie' }).click();
  await capture.settle({ skipErrorBodies: true });
  assert.deepEqual(posts().map(({ status, body }) => ({ status, body })), [
    { status: 503, body: { ...draft, profileVersion: ownerBefore.profile.version } },
    { status: 201, body: { ...draft, profileVersion: ownerBefore.profile.version } },
  ], 'the second POST exists only because the user pressed Save after checking that no entity was created');
  const created = posts()[1].responseBody.series;
  const rawSeries = await fixture.rawSeries(cookie, created.id);
  const ownerAfter = await fixture.rawOwner(cookie);
  assert.deepEqual({ name: rawSeries.name, slug: rawSeries.slug, description: rawSeries.description, version: rawSeries.version }, {
    ...draft, version: 1,
  });
  assert.equal(ownerAfter.profile.version, ownerBefore.profile.version + 1);
  assert.deepEqual(sortedReceipts(posts()[1].responseBody.versionChanges), sortedReceipts([
    { entity: 'profile', id: ownerBefore.profile.id, before: ownerBefore.profile.version, after: ownerAfter.profile.version },
    { entity: 'series', id: created.id, before: 0, after: rawSeries.version },
  ]));
  assert.equal(await fixture.creatorStore.list('series:').then((rows) => rows.length), 1);
  await capture.stop({ skipErrorBodies: true });
});

for (const mutation of [
  { kind: 'rename', name: 'Ruta cambiada por API', slug: 'ruta-renombrada' },
  { kind: 'delete' },
]) {
  test(`Series: un alta confirmada con respuesta perdida no se identifica por alias tras ${mutation.kind}`, async ({ fixture, page, publicPage }) => {
    const cookie = await loggedInOwner(fixture, page);
    const link = await addLink(fixture, cookie, {
      title: 'Capítulo público', url: 'https://links.example/serie-alias-publico',
    });
    const ownerBeforePublish = await fixture.rawOwner(cookie);
    const published = await api(fixture, cookie, '/api/creador/perfil/publicar', {
      method: 'POST', body: { version: ownerBeforePublish.profile.version },
    });
    assert.equal(published.response.status, 200, JSON.stringify(published.body));
    const capture = await captureCreatorApi(page, { ignoreReads: true });
    await openSeriesView(page, fixture);
    await page.getByRole('button', { name: 'Crear serie' }).click();
    const form = seriesForm(page);
    const submitted = { name: 'Ruta original', slug: 'ruta-original', description: 'Descripción enviada' };
    const correction = { name: 'Corrección local', slug: 'slug-local', description: 'Descripción local' };
    await fillSeries(form, submitted);
    const lost = await holdCommittedCreate(page);
    let save;
    try {
      save = form.getByRole('button', { name: 'Guardar serie' }).click();
      await lost.entered;
      assert.equal(lost.actual.status, 201, 'the real create committed before its acknowledgement was replaced');
      assert.deepEqual(lost.requestBody, { ...submitted, profileVersion: published.body.profile.version });
      const created = lost.actual.body.series;
      const ownerAfterCreate = await fixture.rawOwner(cookie);
      assert.deepEqual({ name: (await fixture.rawSeries(cookie, created.id)).name, version: (await fixture.rawSeries(cookie, created.id)).version }, {
        name: submitted.name, version: 1,
      });
      const membership = await api(fixture, cookie, `/api/creador/series/${created.id}/capitulos/${link.placementId}`, {
        method: 'PUT', body: { profileVersion: ownerAfterCreate.profile.version },
      });
      assert.equal(membership.response.status, 200, 'a real service write makes the renamed alias publicly resolvable');
      const afterMembership = await fixture.rawOwner(cookie);
      const rawSeries = await fixture.rawSeries(cookie, created.id);
      let changed;
      if (mutation.kind === 'rename') {
        changed = await api(fixture, cookie, `/api/creador/series/${created.id}`, {
          method: 'PATCH',
          body: {
            version: rawSeries.version,
            profileVersion: afterMembership.profile.version,
            name: mutation.name,
            slug: mutation.slug,
            description: submitted.description,
          },
        });
        assert.equal(changed.response.status, 200, JSON.stringify(changed.body));
      } else {
        changed = await api(fixture, cookie, `/api/creador/series/${created.id}`, {
          method: 'DELETE', body: { version: rawSeries.version, profileVersion: afterMembership.profile.version },
        });
        assert.equal(changed.response.status, 204);
      }
      await fillSeries(form, correction);
      lost.release();
      await save;
    } finally {
      lost.release();
      await lost.remove();
      await save?.catch(() => {});
    }

    const created = lost.actual.body.series;
    await capture.settle({ skipErrorBodies: true });
    const posts = writesFor(capture, 'POST', '/api/creador/series');
    assert.equal(posts.length, 1, 'the browser sent only the original create; API-side rename/delete is not a retry');
    assert.equal(posts[0].status, 503);
    await expect(form.locator('[data-owner-compare]'), 'the first lost acknowledgement offers a read directly').toBeVisible();
    await expect(form.getByLabel('Nombre de la serie')).toHaveValue(correction.name);
    await expect(form.getByLabel('Dirección de la serie')).toHaveValue(correction.slug);
    await expect(form.getByLabel(/Descripción/)).toHaveValue(correction.description);

    await form.locator('[data-owner-compare]').click();
    const comparison = form.locator('[data-owner-comparison]');
    await expect(comparison).toBeVisible();
    await expect(comparison).toContainText('ruta-original');
    await expect(comparison).toContainText(/pudo cambiar de dirección o eliminarse/i);
    await expect(form.locator('[data-owner-adopt]')).toBeHidden();
    await expect(form.getByLabel('Nombre de la serie')).toHaveValue(correction.name);
    await expect(form.getByLabel('Dirección de la serie')).toHaveValue(correction.slug);
    await expect(form.getByLabel(/Descripción/)).toHaveValue(correction.description);
    assert.equal(posts.length, 1, 'comparison does not create, rename, delete, or replay');
    if (mutation.kind === 'rename') {
      const active = await fixture.rawSeries(cookie, created.id);
      assert.equal(active.slug, mutation.slug);
      assert.equal(active.name, mutation.name);
      const oldAliasUrl = `${fixture.origin}/c/ana-browser/series/ruta-original/`;
      const aliasRedirectPromise = publicPage.waitForResponse((response) =>
        response.url() === oldAliasUrl && response.request().method() === 'GET');
      const canonicalResponse = await publicPage.goto(oldAliasUrl);
      const aliasRedirect = await aliasRedirectPromise;
      assert.equal(aliasRedirect.status(), 308, 'the old public alias still redirects to the renamed active series');
      assert.equal(aliasRedirect.headers()['location'], `/c/ana-browser/series/${mutation.slug}/`);
      assert.equal(canonicalResponse?.status(), 200, 'the anonymous visitor reaches the canonical public Series page');
      assert.equal(publicPage.url(), `${fixture.origin}/c/ana-browser/series/${mutation.slug}/`);
    } else {
      assert.equal(await fixture.rawSeries(cookie, created.id), null, 'the GET did not adopt a missing Series entity');
      const oldAliasUrl = `${fixture.origin}/c/ana-browser/series/ruta-original/`;
      const response = await publicPage.goto(oldAliasUrl);
      assert.equal(response?.status(), 404, 'a retained alias for a deleted series no longer resolves publicly');
      assert.equal(publicPage.url(), oldAliasUrl, 'the deleted alias does not navigate to a guessed Series identity');
    }
    await capture.stop({ skipErrorBodies: true });
  });
}

test('Series: una comparación de A que llega tarde tras abrir B no resucita A ni envejece la base de B', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const seriesA = await createSeries(fixture, cookie, { name: 'Serie A', slug: 'serie-a', description: 'A inicial' });
  const seriesB = await createSeries(fixture, cookie, { name: 'Serie B', slug: 'serie-b', description: 'B inicial' });
  const chapterForB = await addLink(fixture, cookie, {
    title: 'Capítulo para validar la base confirmada', url: 'https://links.example/base-confirmada',
  });
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  await openSeriesView(page, fixture);
  const listUrl = page.url();
  const beforeOwner = await fixture.rawOwner(cookie);
  const beforeA = await fixture.rawSeries(cookie, seriesA.id);
  const beforeB = await fixture.rawSeries(cookie, seriesB.id);
  const formA = seriesForm(page);
  await seriesRow(page, seriesA.id).locator('[data-series-edit]').click();
  await fillSeries(formA, { name: 'A borrador local', slug: 'a-borrador', description: 'A descripción local' });

  const remoteA1 = await api(fixture, cookie, `/api/creador/series/${seriesA.id}`, {
    method: 'PATCH',
    body: {
      version: beforeA.version,
      profileVersion: beforeOwner.profile.version,
      name: 'A guardada primero', slug: 'a-guardada-primero', description: 'A remota primera',
    },
  });
  assert.equal(remoteA1.response.status, 200, 'the first competing edit is a real API/service commit');
  const afterRemoteA1 = await fixture.rawOwner(cookie);
  const afterA1 = await fixture.rawSeries(cookie, seriesA.id);
  const pathA = `/api/creador/series/${seriesA.id}`;
  await formA.getByRole('button', { name: 'Guardar serie' }).click();
  await capture.settle({ skipErrorBodies: true });
  const aWrites = () => writesFor(capture, 'PATCH', pathA);
  assert.equal(aWrites().length, 1);
  assert.equal(aWrites()[0].status, 409, 'the browser receives the real stale-version conflict for A');
  await expect(formA.locator('[data-owner-compare]')).toBeVisible();

  const oldRead = await holdFirstOwnerRead(page);
  let compareA;
  try {
    compareA = formA.locator('[data-owner-compare]').click();
    await oldRead.entered;
    assert.equal(oldRead.snapshot.profile.version, afterRemoteA1.profile.version);
    assert.equal(oldRead.snapshot.series.find(({ id }) => id === seriesA.id).version, afterA1.version);
    const remoteA2 = await api(fixture, cookie, pathA, {
      method: 'PATCH',
      body: {
        version: afterA1.version,
        profileVersion: afterRemoteA1.profile.version,
        name: 'A guardada después', slug: 'a-guardada-despues', description: 'A remota segunda',
      },
    });
    assert.equal(remoteA2.response.status, 200, 'a newer real API edit makes the held comparison body stale');
    const latestOwner = await fixture.rawOwner(cookie);
    const latestA = await fixture.rawSeries(cookie, seriesA.id);

    await formA.getByRole('button', { name: 'Cancelar' }).click();
    const exitPrompt = page.locator('[data-owner-exit-prompt]');
    await expect(exitPrompt).toBeVisible();
    await exitPrompt.getByRole('button', { name: 'Descartar cambios' }).click();
    await expect(formA).not.toBeVisible();

    const correctionB = { name: 'B corrección local', slug: 'b-correccion', description: 'B descripción local' };
    const formB = seriesForm(page);
    await seriesRow(page, seriesB.id).locator('[data-series-edit]').click();
    await fillSeries(formB, correctionB);
    const pathB = `/api/creador/series/${seriesB.id}`;
    await formB.getByRole('button', { name: 'Guardar serie' }).click();
    await capture.settle({ skipErrorBodies: true });
    const bWrites = () => writesFor(capture, 'PATCH', pathB);
    assert.equal(bWrites().length, 1);
    assert.equal(bWrites()[0].status, 409, 'B also starts from the old page base and must check current data');
    await formB.locator('[data-owner-compare]').click();
    const comparisonB = formB.locator('[data-owner-comparison]');
    await expect(comparisonB).toBeVisible();
    await expect(comparisonB).toContainText(seriesB.name);
    for (const value of Object.values(correctionB)) await expect(comparisonB).toContainText(value);
    const keepCorrection = formB.getByRole('button', { name: /Conservar mi corrección/ });
    await expect(keepCorrection).toBeVisible();
    await keepCorrection.click();
    await formB.getByRole('button', { name: 'Guardar serie' }).click();
    await capture.settle({ skipErrorBodies: true });
    assert.equal(bWrites().length, 2);
    assert.equal(bWrites()[1].status, 200);
    assert.deepEqual(bWrites()[1].body, {
      version: beforeB.version,
      profileVersion: latestOwner.profile.version,
      ...correctionB,
    }, 'B uses the profile and series versions observed by B’s own comparison');
    const afterB = await fixture.rawSeries(cookie, seriesB.id);
    const ownerAfterB = await fixture.rawOwner(cookie);
    assert.deepEqual({ name: afterB.name, slug: afterB.slug, description: afterB.description, version: afterB.version }, {
      ...correctionB, version: beforeB.version + 1,
    });
    assert.equal(ownerAfterB.profile.version, latestOwner.profile.version + 1);

    oldRead.release();
    const oldReadOutcome = await oldRead.wait();
    assert.ok(oldReadOutcome === 'delivered' || oldReadOutcome === 'cancelled',
      'closing A may deliver its captured read or cancel it, but either outcome must leave B current');
    await compareA;
    await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
    await expect(seriesRow(page, seriesA.id)).toContainText('A guardada después');
    await expect(seriesRow(page, seriesA.id)).not.toContainText('A guardada primero');
    await expect(seriesRow(page, seriesB.id)).toContainText(correctionB.name);
    assert.equal(await fixture.rawOwner(cookie).then(({ profile }) => profile.version), ownerAfterB.profile.version);
    assert.equal(page.url(), listUrl, 'the late comparison response cannot navigate the active list context');

    await seriesRow(page, seriesB.id).locator('[data-series-chapters]').click();
    const chapterPath = `/api/creador/series/${seriesB.id}/capitulos/${chapterForB.placementId}`;
    const beforeChapter = await fixture.rawPlacement(cookie, chapterForB.placementId);
    await page.locator(`[data-chapter-row="${chapterForB.placementId}"] [data-chapter-add]`).click();
    await capture.settle({ skipErrorBodies: true });
    const chapterWrite = writesFor(capture, 'PUT', chapterPath);
    assert.equal(chapterWrite.length, 1);
    assert.equal(chapterWrite[0].status, 200,
      'the chapter continuation succeeds instead of using A’s stale comparison versions');
    assert.deepEqual(chapterWrite[0].body, { profileVersion: ownerAfterB.profile.version },
      'the next Series consumer uses the profile version confirmed by B’s own comparison/save');
    const afterChapter = await fixture.rawPlacement(cookie, chapterForB.placementId);
    assert.equal(afterChapter.series[seriesB.id].position, 0);
    const finalOwner = await fixture.rawOwner(cookie);
    assert.equal(finalOwner.profile.version, ownerAfterB.profile.version + 1);
    assert.deepEqual(sortedReceipts(chapterWrite[0].responseBody.versionChanges), sortedReceipts([
      { entity: 'profile', id: ownerAfterB.profile.id, before: ownerAfterB.profile.version, after: finalOwner.profile.version },
      { entity: 'placement', id: chapterForB.placementId, before: beforeChapter.version, after: afterChapter.version },
    ]));
    assert.equal((await fixture.rawSeries(cookie, seriesA.id)).version, latestA.version);
  } finally {
    oldRead.release();
    await oldRead.remove();
    await compareA?.catch(() => {});
  }
  await capture.stop({ skipErrorBodies: true });
});

test('Series: Guardar y salir persiste una vez y cierra la edición sólo tras el acuse real', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Ruta para salir', slug: 'ruta-para-salir', description: 'Antes' });
  const beforeOwner = await fixture.rawOwner(cookie);
  const beforeSeries = await fixture.rawSeries(cookie, series.id);
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  await openSeriesView(page, fixture);
  const row = seriesRow(page, series.id);
  await row.locator('[data-series-edit]').click();
  const form = seriesForm(page);
  await form.getByLabel(/Descripción/).fill('Guardado al salir');
  await form.getByRole('button', { name: 'Cancelar' }).click();
  const exitPrompt = page.locator('[data-owner-exit-prompt]');
  await expect(exitPrompt).toBeVisible();
  await exitPrompt.getByRole('button', { name: 'Guardar y salir' }).click();
  await capture.settle({ skipErrorBodies: true });

  await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
  await expect(exitPrompt).toBeHidden();
  const patch = writesFor(capture, 'PATCH', `/api/creador/series/${series.id}`);
  assert.equal(patch.length, 1);
  assert.equal(patch[0].status, 200);
  assert.deepEqual(patch[0].body, {
    version: beforeSeries.version,
    profileVersion: beforeOwner.profile.version,
    name: beforeSeries.name,
    slug: beforeSeries.slug,
    description: 'Guardado al salir',
  });
  const afterOwner = await fixture.rawOwner(cookie);
  const afterSeries = await fixture.rawSeries(cookie, series.id);
  assert.equal(afterSeries.description, 'Guardado al salir');
  assert.equal(afterSeries.version, beforeSeries.version + 1);
  assert.equal(afterOwner.profile.version, beforeOwner.profile.version + 1);
  assert.deepEqual(sortedReceipts(patch[0].responseBody.versionChanges), sortedReceipts([
    { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: afterOwner.profile.version },
    { entity: 'series', id: series.id, before: beforeSeries.version, after: afterSeries.version },
  ]));
  await capture.stop({ skipErrorBodies: true });
});

test('Series: Guardar y salir mantiene la edición y la corrección tardía tras un conflicto real', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const seriesA = await createSeries(fixture, cookie, { name: 'A inicial', slug: 'a-inicial', description: 'A antes' });
  const seriesB = await createSeries(fixture, cookie, { name: 'B inicial', slug: 'b-inicial', description: 'B antes' });
  const beforeOwner = await fixture.rawOwner(cookie);
  const beforeA = await fixture.rawSeries(cookie, seriesA.id);
  const beforeB = await fixture.rawSeries(cookie, seriesB.id);
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  await openSeriesView(page, fixture);
  const rowA = seriesRow(page, seriesA.id);
  await rowA.locator('[data-series-edit]').click();
  const form = seriesForm(page);
  const sent = { name: 'A enviada', slug: 'a-enviada', description: 'A descripción enviada' };
  const late = { name: 'A corrección tardía', slug: 'a-correccion-tardia', description: 'A descripción tardía' };
  await fillSeries(form, sent);
  await form.getByRole('button', { name: 'Cancelar' }).click();
  const exitPrompt = page.locator('[data-owner-exit-prompt]');
  await expect(exitPrompt).toBeVisible();

  const pathA = `/api/creador/series/${seriesA.id}`;
  const held = await holdPatchBeforeHandler(page, pathA);
  let saveAndExit;
  try {
    saveAndExit = exitPrompt.getByRole('button', { name: 'Guardar y salir' }).click();
    await held.entered;
    assert.deepEqual(held.body, {
      version: beforeA.version,
      profileVersion: beforeOwner.profile.version,
      ...sent,
    }, 'Guardar y salir sends the captured Series draft with its observed versions');
    await fillSeries(form, late);
    const competing = await api(fixture, cookie, `/api/creador/series/${seriesB.id}`, {
      method: 'PATCH',
      body: {
        version: beforeB.version,
        profileVersion: beforeOwner.profile.version,
        name: 'B actualizada por API', slug: 'b-api', description: 'B remota',
      },
    });
    assert.equal(competing.response.status, 200, 'the intervening edit commits through the actual service');
    held.release();
    await saveAndExit;
  } finally {
    held.release();
    await held.remove();
    await saveAndExit?.catch(() => {});
  }
  await capture.settle({ skipErrorBodies: true });
  const writes = writesFor(capture, 'PATCH', pathA);
  assert.equal(writes.length, 1, 'the guarded save is not replayed after the real conflict');
  assert.equal(writes[0].status, 409);
  assert.deepEqual(writes[0].body, held.body);
  await expect(page.locator('[data-owner-dialog]')).toBeVisible();
  await expect(form).toBeVisible();
  await expect(exitPrompt).toBeHidden();
  await expect(form.getByLabel('Nombre de la serie')).toHaveValue(late.name);
  await expect(form.getByLabel('Dirección de la serie')).toHaveValue(late.slug);
  await expect(form.getByLabel(/Descripción/)).toHaveValue(late.description);
  await expect(form.locator('[data-owner-compare]')).toBeVisible();
  await expect(form.locator('[data-owner-form-status="serie"]')).toContainText(/cambió|conflicto/i);
  assert.deepEqual(await fixture.rawSeries(cookie, seriesA.id), beforeA,
    'the failed exit save did not overwrite A with its submitted or late values');
  assert.equal((await fixture.rawSeries(cookie, seriesB.id)).slug, 'b-api');
  assert.equal((await fixture.rawOwner(cookie)).profile.version, beforeOwner.profile.version + 1);
  assert.equal(new URL(page.url()).searchParams.get('vista'), 'series', 'the editor did not complete its exit');
  await capture.stop({ skipErrorBodies: true });
});

import assert from 'node:assert/strict';
import {
  test, expect, api, createSeries, addLink, addChapter, captureCreatorApi,
  seriesForm, seriesRow, openSeriesView, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

const writtenMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function defer() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function writesFor(capture, method, path) {
  return capture.writes().filter((write) => write.method === method && write.path === path);
}

function transactionCount(fixture) {
  return fixture.creatorStore.calls.filter(({ operation }) => operation === 'transact').length;
}

function sortedReceipts(changes = []) {
  return [...changes].sort((left, right) => `${left.entity}:${left.id}`.localeCompare(`${right.entity}:${right.id}`));
}

async function holdOneWriteAs503(page, { method, path, commit }) {
  const reached = defer();
  const responseGate = defer();
  let handled = false;
  let observed;
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (handled || request.method() !== method || pathname !== path) {
      await route.continue();
      return;
    }
    handled = true;
    observed = {
      method: request.method(),
      path: pathname,
      body: request.postData() ? JSON.parse(request.postData()) : undefined,
    };
    if (commit) {
      const actual = await route.fetch();
      observed.actualStatus = actual.status();
      observed.actualHeaders = actual.headers();
      if (actual.status() !== 204) observed.actualBody = await actual.json();
    }
    reached.resolve();
    await responseGate.promise;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'TEMPORARY_FAILURE' }),
    });
  };
  await page.route('**/api/creador/**', handler);
  return {
    reached: reached.promise,
    get observed() { return observed; },
    release: () => responseGate.resolve(),
    async remove() {
      responseGate.resolve();
      await page.unroute('**/api/creador/**', handler).catch(() => {});
    },
  };
}

async function holdOneSuccessfulWrite(page, { method, path }) {
  const reached = defer();
  const responseGate = defer();
  let handled = false;
  let observed;
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (handled || request.method() !== method || pathname !== path) {
      await route.continue();
      return;
    }
    handled = true;
    observed = {
      method: request.method(),
      path: pathname,
      body: request.postData() ? JSON.parse(request.postData()) : undefined,
    };
    const actual = await route.fetch();
    observed.actualStatus = actual.status();
    if (actual.status() !== 204) observed.actualBody = await actual.json();
    reached.resolve();
    await responseGate.promise;
    await route.fulfill({ response: actual });
  };
  await page.route('**/api/creador/**', handler);
  return {
    reached: reached.promise,
    get observed() { return observed; },
    release: () => responseGate.resolve(),
    async remove() {
      responseGate.resolve();
      await page.unroute('**/api/creador/**', handler).catch(() => {});
    },
  };
}

async function openSeriesEdit(page, seriesId) {
  await seriesRow(page, seriesId).locator('[data-series-edit]').click();
  const form = seriesForm(page);
  await expect(form).toBeVisible();
  return form;
}

async function fillSeries(form, value) {
  await form.getByLabel('Nombre de la serie').fill(value.name);
  await form.getByLabel('Dirección de la serie').fill(value.slug);
  await form.getByLabel(/Descripción/).fill(value.description);
}

const editOutcomes = [
  { name: 'respuesta perdida después del commit', commit: true },
  { name: 'rechazo de transporte antes del commit', commit: false },
];

for (const outcome of editOutcomes) {
  test(`Series: ${outcome.name} muestra Comprobar en el primer resultado y conserva la sección completa`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const initialSeries = await createSeries(fixture, cookie, {
      name: 'Nombre inicial', slug: 'serie-inicial', description: '',
    });
    const beforeOwner = await fixture.rawOwner(cookie);
    const beforeSeries = await fixture.rawSeries(cookie, initialSeries.id);
    assert.equal(beforeSeries.description, '', 'the optional description starts empty in the persisted Series base');
    const sent = { name: 'Nombre enviado', slug: 'slug-enviado', description: 'Descripción enviada' };
    const correction = { name: 'Nombre corregido', slug: 'slug-corregido', description: '' };
    const path = `/api/creador/series/${initialSeries.id}`;
    const capture = await captureCreatorApi(page, { ignoreReads: true });
    await openSeriesView(page, fixture);
    const form = await openSeriesEdit(page, initialSeries.id);
    await fillSeries(form, sent);
    const transactionsBefore = transactionCount(fixture);
    const lost = await holdOneWriteAs503(page, { method: 'PATCH', path, commit: outcome.commit });
    let save;
    try {
      save = form.getByRole('button', { name: 'Guardar serie' }).click();
      await lost.reached;
      await fillSeries(form, correction);
      lost.release();
      await save;
      await capture.settle({ skipErrorBodies: true });
    } finally {
      lost.release();
      await lost.remove();
      await save?.catch(() => {});
    }

    const firstPatch = writesFor(capture, 'PATCH', path);
    assert.equal(firstPatch.length, 1, 'the uncertain operation has one browser PATCH before any explicit continuation');
    assert.equal(firstPatch[0].status, 503);
    assert.deepEqual(firstPatch[0].body, {
      version: beforeSeries.version,
      profileVersion: beforeOwner.profile.version,
      ...sent,
    });
    await expect(form.locator('[data-owner-compare]'), 'Comprobar must be available from the first uncertain result').toBeVisible();
    await expect(form.locator('[data-owner-compare]')).toContainText(/comprobar/i);
    await expect(form.getByLabel('Nombre de la serie')).toHaveValue(correction.name);
    await expect(form.getByLabel('Dirección de la serie')).toHaveValue(correction.slug);
    await expect(form.getByLabel(/Descripción/)).toHaveValue(correction.description);

    const currentOwner = await fixture.rawOwner(cookie);
    const currentSeries = await fixture.rawSeries(cookie, initialSeries.id);
    if (outcome.commit) {
      assert.equal(lost.observed.actualStatus, 200, 'the actual service committed before the 503 acknowledgement');
      assert.deepEqual({ name: currentSeries.name, slug: currentSeries.slug, description: currentSeries.description }, sent);
      assert.equal(currentSeries.version, beforeSeries.version + 1);
      assert.equal(currentOwner.profile.version, beforeOwner.profile.version + 1);
      assert.equal(transactionCount(fixture), transactionsBefore + 1);
      assert.deepEqual(sortedReceipts(lost.observed.actualBody.versionChanges), sortedReceipts([
        { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: currentOwner.profile.version },
        { entity: 'series', id: initialSeries.id, before: beforeSeries.version, after: currentSeries.version },
      ]), 'the actual committed response receipts match the raw versions');
    } else {
      assert.equal(lost.observed.actualStatus, undefined, 'the transport rejection did not call the actual series handler');
      assert.deepEqual(currentSeries, beforeSeries);
      assert.deepEqual(currentOwner.profile, beforeOwner.profile);
      assert.equal(transactionCount(fixture), transactionsBefore);
    }

    await form.locator('[data-owner-compare]').click();
    const comparison = form.locator('[data-owner-comparison]');
    await expect(comparison).toBeVisible();
    const comparedText = outcome.commit
      ? [sent.name, sent.slug]
      : [beforeSeries.name, beforeSeries.slug];
    for (const value of comparedText) await expect(comparison).toContainText(value);
    for (const value of [correction.name, correction.slug]) await expect(comparison).toContainText(value);
    await expect(comparison).toContainText(
      `Descripción guardada: ${outcome.commit ? sent.description : '—'} | Tu corrección: —`,
    );
    await expect(form.getByRole('button', { name: /Conservar mi corrección/ })).toBeVisible();
    assert.equal(writesFor(capture, 'PATCH', path).length, 1, 'the comparison read does not replay the uncertain write');
    await form.getByRole('button', { name: /Conservar mi corrección/ }).click();
    await expect(form.getByLabel('Nombre de la serie')).toHaveValue(correction.name);
    await expect(form.getByLabel('Dirección de la serie')).toHaveValue(correction.slug);
    await expect(form.getByLabel(/Descripción/)).toHaveValue(correction.description);
    assert.equal(writesFor(capture, 'PATCH', path).length, 1, 'the approved adoption choice is still local and unsaved');

    await form.getByRole('button', { name: 'Guardar serie' }).click();
    await capture.settle({ skipErrorBodies: true });
    const patches = writesFor(capture, 'PATCH', path);
    assert.equal(patches.length, 2, 'the only next write follows the explicit decision and manual Save');
    const currentBase = await fixture.rawOwner(cookie);
    const observedSeries = await fixture.rawSeries(cookie, initialSeries.id);
    assert.deepEqual(patches[1].body, {
      version: observedSeries.version - 1,
      profileVersion: currentBase.profile.version - 1,
      ...correction,
    }, 'the complete local section is sent against the state actually compared');
    assert.equal(patches[1].status, 200);
    const finalOwner = await fixture.rawOwner(cookie);
    const finalSeries = await fixture.rawSeries(cookie, initialSeries.id);
    assert.deepEqual({ name: finalSeries.name, slug: finalSeries.slug, description: finalSeries.description }, correction);
    assert.equal(finalSeries.version, beforeSeries.version + (outcome.commit ? 2 : 1));
    assert.equal(finalOwner.profile.version, beforeOwner.profile.version + (outcome.commit ? 2 : 1));
    assert.deepEqual(sortedReceipts(patches[1].responseBody.versionChanges), sortedReceipts([
      { entity: 'profile', id: beforeOwner.profile.id, before: currentBase.profile.version - 1, after: finalOwner.profile.version },
      { entity: 'series', id: initialSeries.id, before: observedSeries.version - 1, after: finalSeries.version },
    ]), 'the final manual save receipt matches the raw state transition');
    await capture.stop({ skipErrorBodies: true });
  });
}

test('Series: una creación con respuesta perdida se comprueba en el primer resultado y continúa sin repetir el POST', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const beforeOwner = await fixture.rawOwner(cookie);
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  await openSeriesView(page, fixture);
  await page.getByRole('button', { name: 'Crear serie' }).click();
  const form = seriesForm(page);
  await fillSeries(form, { name: 'Ruta enviada', slug: 'ruta-enviada', description: 'Descripción enviada' });
  const correction = { name: 'Ruta corregida', slug: 'ruta-corregida', description: 'Descripción corregida' };
  const lost = await holdOneWriteAs503(page, { method: 'POST', path: '/api/creador/series', commit: true });
  let save;
  try {
    save = form.getByRole('button', { name: 'Guardar serie' }).click();
    await lost.reached;
    await fillSeries(form, correction);
    lost.release();
    await save;
    await capture.settle({ skipErrorBodies: true });
  } finally {
    lost.release();
    await lost.remove();
    await save?.catch(() => {});
  }

  assert.equal(lost.observed.actualStatus, 201, 'the real service created the series before its response was replaced');
  assert.deepEqual(lost.observed.body, {
    profileVersion: 1,
    name: 'Ruta enviada', slug: 'ruta-enviada', description: 'Descripción enviada',
  });
  const created = lost.observed.actualBody.series;
  assert.equal((await fixture.rawOwner(cookie)).profile.version, 2);
  const rawCreated = await fixture.rawSeries(cookie, created.id);
  assert.deepEqual({ name: rawCreated.name, slug: rawCreated.slug, description: rawCreated.description, version: rawCreated.version }, {
    name: created.name, slug: created.slug, description: created.description, version: created.version,
  });
  assert.deepEqual(sortedReceipts(lost.observed.actualBody.versionChanges), sortedReceipts([
    { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: 2 },
    { entity: 'series', id: created.id, before: 0, after: rawCreated.version },
  ]), 'the actual create receipt agrees with the raw profile and series records');
  const post = writesFor(capture, 'POST', '/api/creador/series');
  assert.equal(post.length, 1);
  assert.equal(post[0].status, 503);
  await expect(form.locator('[data-owner-compare]'), 'Comprobar is available without a second Save').toBeVisible();
  await form.locator('[data-owner-compare]').click();
  const comparison = form.locator('[data-owner-comparison]');
  await expect(comparison).toBeVisible();
  await expect(comparison).toContainText('Ruta enviada');
  await expect(comparison).toContainText('ruta-enviada');
  await expect(comparison).toContainText('Descripción enviada');
  await expect(comparison).toContainText('Ruta corregida');
  await expect(form.getByRole('button', { name: /Continuar con el contenido guardado/ })).toBeVisible();
  await form.getByRole('button', { name: /Continuar con el contenido guardado/ }).click();
  await expect(form.getByLabel('Nombre de la serie')).toHaveValue(correction.name);
  await expect(form.getByLabel('Dirección de la serie')).toHaveValue(correction.slug);
  await expect(form.getByLabel(/Descripción/)).toHaveValue(correction.description);
  assert.equal(writesFor(capture, 'POST', '/api/creador/series').length, 1,
    'checking and continuing recover the created identity without replaying its POST');

  await form.getByRole('button', { name: 'Guardar serie' }).click();
  await capture.settle({ skipErrorBodies: true });
  const patch = writesFor(capture, 'PATCH', `/api/creador/series/${created.id}`);
  assert.equal(patch.length, 1, 'the correction is a distinct PATCH on the recovered series');
  assert.deepEqual(patch[0].body, { version: 1, profileVersion: 2, ...correction });
  assert.equal(patch[0].status, 200);
  assert.equal(writesFor(capture, 'POST', '/api/creador/series').length, 1);
  const finalSeries = await fixture.rawSeries(cookie, created.id);
  assert.deepEqual({ name: finalSeries.name, slug: finalSeries.slug, description: finalSeries.description, version: finalSeries.version }, {
    ...correction, version: 2,
  });
  const finalOwner = await fixture.rawOwner(cookie);
  assert.deepEqual(sortedReceipts(patch[0].responseBody.versionChanges), sortedReceipts([
    { entity: 'profile', id: finalOwner.profile.id, before: 2, after: 3 },
    { entity: 'series', id: created.id, before: 1, after: 2 },
  ]));
  await capture.stop({ skipErrorBodies: true });
});

const listActionOutcomes = [
  { name: 'commit con respuesta perdida', commit: true },
  { name: 'rechazo antes del commit', commit: false },
];

for (const outcome of listActionOutcomes) {
  test(`Series: borrar una serie después de ${outcome.name} compara el estado antes de otra decisión`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const target = await createSeries(fixture, cookie, { name: 'Serie objetivo', slug: 'serie-objetivo' });
    const survivor = await createSeries(fixture, cookie, { name: 'Serie superviviente', slug: 'serie-superviviente' });
    const link = await addLink(fixture, cookie, { title: 'Capítulo compartido', url: 'https://links.example/compartido' });
    await addChapter(fixture, cookie, target.id, link.placementId);
    await addChapter(fixture, cookie, survivor.id, link.placementId);
    const beforePlacement = await fixture.rawPlacement(cookie, link.placementId);
    const beforeOwner = await fixture.rawOwner(cookie);
    const path = `/api/creador/series/${target.id}`;
    const capture = await captureCreatorApi(page, { ignoreReads: true });
    await openSeriesView(page, fixture);
    const transactionsBefore = transactionCount(fixture);
    const lost = await holdOneWriteAs503(page, { method: 'DELETE', path, commit: outcome.commit });
    let click;
    try {
      const dialogPromise = page.waitForEvent('dialog');
      click = seriesRow(page, target.id).locator('[data-series-delete]').click();
      const dialog = await dialogPromise;
      await dialog.accept();
      await lost.reached;
      lost.release();
      await click;
      await capture.settle({ skipErrorBodies: true });
    } finally {
      lost.release();
      await lost.remove();
      await click?.catch(() => {});
    }
    const removeWrites = () => writesFor(capture, 'DELETE', path);
    assert.equal(removeWrites().length, 1, 'the uncertain delete has one request');
    assert.equal(removeWrites()[0].status, 503);
    assert.deepEqual(removeWrites()[0].body, {
      version: target.version,
      profileVersion: beforeOwner.profile.version,
    });
    await expect(page.locator('[data-series-reconcile-retry]'), 'the first delete result must expose Comprobar').toBeVisible();
    await expect(page.locator('[data-series-reconcile-retry]')).toContainText(/comprobar/i);
    assert.equal(await fixture.rawSeries(cookie, target.id) === null, outcome.commit);
    assert.equal(transactionCount(fixture), transactionsBefore + (outcome.commit ? 1 : 0));

    await page.locator('[data-series-reconcile-retry]').click();
    await capture.settle({ skipErrorBodies: true });
    if (outcome.commit) {
      await expect(seriesRow(page, target.id)).toHaveCount(0);
      await expect(seriesRow(page, survivor.id)).toBeVisible();
      assert.equal(await fixture.rawSeries(cookie, target.id), null);
      assert.equal(removeWrites().length, 1, 'a read confirms deletion without replay');
    } else {
      await expect(seriesRow(page, target.id)).toBeVisible();
      const unchangedTarget = await fixture.rawSeries(cookie, target.id);
      assert.deepEqual({ name: unchangedTarget.name, slug: unchangedTarget.slug, version: unchangedTarget.version }, {
        name: target.name, slug: target.slug, version: target.version,
      });
      assert.equal(removeWrites().length, 1, 'the rejected request is not retried while comparing');
      const dialogPromise = page.waitForEvent('dialog');
      const explicitDelete = seriesRow(page, target.id).locator('[data-series-delete]').click();
      const dialog = await dialogPromise;
      await dialog.accept();
      await explicitDelete;
      await capture.settle({ skipErrorBodies: true });
      assert.equal(removeWrites().length, 2, 'only a new user confirmation starts the second delete');
      assert.equal(removeWrites()[1].status, 204);
      assert.equal(await fixture.rawSeries(cookie, target.id), null);
      assert.deepEqual(JSON.parse(removeWrites()[1].responseHeaders['creator-write-versions']), [
        { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1 },
      ]);
    }
    const afterPlacement = await fixture.rawPlacement(cookie, link.placementId);
    assert.ok(afterPlacement, 'deleting a series never removes the shared chapter placement');
    assert.deepEqual(afterPlacement, beforePlacement,
      'deleting a series preserves the shared placement and its independent memberships');
    const visibleOwner = await api(fixture, cookie, '/api/creador/perfil');
    assert.equal(visibleOwner.response.status, 200);
    assert.deepEqual(visibleOwner.body.links[0].series.map(({ seriesId }) => seriesId), [survivor.id],
      'the real owner projection ignores the deleted series while retaining the surviving membership');
    assert.ok(await fixture.rawSeries(cookie, survivor.id));
    assert.equal((await fixture.rawOwner(cookie)).profile.version, beforeOwner.profile.version + 1);
    if (outcome.commit) {
      assert.deepEqual(JSON.parse(lost.observed.actualHeaders['creator-write-versions']), [
        { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1 },
      ]);
    }
    await capture.stop({ skipErrorBodies: true });
  });
}

for (const outcome of listActionOutcomes) {
  test(`Series: agregar un capítulo después de ${outcome.name} comprueba pertenencia sin replay`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const targetSeries = await createSeries(fixture, cookie, { name: 'Serie destino', slug: 'serie-destino' });
    const otherSeries = await createSeries(fixture, cookie, { name: 'Otra serie', slug: 'otra-serie' });
    const link = await addLink(fixture, cookie, { title: 'Capítulo disponible', url: 'https://links.example/disponible' });
    await addChapter(fixture, cookie, otherSeries.id, link.placementId);
    const beforePlacement = await fixture.rawPlacement(cookie, link.placementId);
    const beforeOwner = await fixture.rawOwner(cookie);
    const path = `/api/creador/series/${targetSeries.id}/capitulos/${link.placementId}`;
    const capture = await captureCreatorApi(page, { ignoreReads: true });
    await openSeriesView(page, fixture, `&serie=${encodeURIComponent(targetSeries.id)}`);
    const row = page.locator(`[data-chapter-row="${link.placementId}"]`);
    const transactionsBefore = transactionCount(fixture);
    const lost = await holdOneWriteAs503(page, { method: 'PUT', path, commit: outcome.commit });
    let add;
    try {
      add = row.locator('[data-chapter-add]').click();
      await lost.reached;
      lost.release();
      await add;
      await capture.settle({ skipErrorBodies: true });
    } finally {
      lost.release();
      await lost.remove();
      await add?.catch(() => {});
    }

    const addWrites = () => writesFor(capture, 'PUT', path);
    assert.equal(addWrites().length, 1);
    assert.equal(addWrites()[0].status, 503);
    assert.deepEqual(addWrites()[0].body, { profileVersion: beforeOwner.profile.version });
    await expect(page.locator('[data-series-reconcile-retry]'), 'Comprobar la lista is available after the first uncertain result').toBeVisible();
    await expect(page.locator('[data-series-reconcile-retry]')).toContainText(/comprobar/i);
    assert.equal(transactionCount(fixture), transactionsBefore + (outcome.commit ? 1 : 0));
    const afterAttempt = await fixture.rawPlacement(cookie, link.placementId);
    assert.equal(Boolean(afterAttempt.series[targetSeries.id]), outcome.commit);
    assert.deepEqual(afterAttempt.series[otherSeries.id], beforePlacement.series[otherSeries.id]);
    if (outcome.commit) {
      assert.deepEqual(sortedReceipts(lost.observed.actualBody.versionChanges), sortedReceipts([
        { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1 },
        { entity: 'placement', id: link.placementId, before: beforePlacement.version, after: afterAttempt.version },
      ]), 'the actual membership write receipt matches the raw profile and placement versions');
    }

    await page.locator('[data-series-reconcile-retry]').click();
    await capture.settle({ skipErrorBodies: true });
    if (outcome.commit) {
      await expect(row).toContainText(/incluido en la posición 1 de 1/i);
      await expect(row.locator('[data-chapter-remove]')).toBeEnabled();
      assert.equal(addWrites().length, 1, 'checking the committed membership does not replay the PUT');
    } else {
      await expect(row).toContainText('Disponible para agregar');
      await expect(row.locator('[data-chapter-add]')).toBeEnabled();
      assert.equal(addWrites().length, 1, 'checking an absent membership does not retry the PUT');
      await row.locator('[data-chapter-add]').click();
      await capture.settle({ skipErrorBodies: true });
      assert.equal(addWrites().length, 2, 'the user must choose Add again after seeing that the first request did not commit');
      assert.equal(addWrites()[1].status, 200);
      assert.deepEqual(addWrites()[1].body, { profileVersion: beforeOwner.profile.version });
      assert.deepEqual(sortedReceipts(addWrites()[1].responseBody.versionChanges), sortedReceipts([
        { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1 },
        { entity: 'placement', id: link.placementId, before: beforePlacement.version, after: beforePlacement.version + 1 },
      ]));
    }
    const finalPlacement = await fixture.rawPlacement(cookie, link.placementId);
    assert.deepEqual(finalPlacement.series[otherSeries.id], beforePlacement.series[otherSeries.id]);
    assert.equal(finalPlacement.series[targetSeries.id].position, 0);
    assert.equal((await fixture.rawOwner(cookie)).profile.version, beforeOwner.profile.version + 1);
    assert.equal(addWrites().length, outcome.commit ? 1 : 2);
    await capture.stop({ skipErrorBodies: true });
  });
}

test('Series: un recibo de versión incorrecto y una observación dañada no reemplazan la corrección tardía', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await createSeries(fixture, cookie, {
    name: 'Nombre base', slug: 'serie-base', description: 'Descripción base',
  });
  const beforeOwner = await fixture.rawOwner(cookie);
  const beforeSeries = await fixture.rawSeries(cookie, initial.id);
  const sent = { name: 'Nombre enviado', slug: 'slug-enviado', description: 'Descripción enviada' };
  const correction = { name: 'Nombre local', slug: 'slug-local', description: 'Descripción local' };
  const path = `/api/creador/series/${initial.id}`;
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  await openSeriesView(page, fixture);
  const form = await openSeriesEdit(page, initial.id);
  await fillSeries(form, sent);
  const entered = defer();
  const acknowledgementGate = defer();
  let actualCommit;
  let corruptedObservation = true;
  const corruptOnlyTheIntendedBoundaries = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() === 'PATCH' && pathname === path && !actualCommit) {
      const response = await route.fetch();
      const payload = await response.json();
      actualCommit = { status: response.status(), payload, requestBody: JSON.parse(request.postData()) };
      entered.resolve();
      await acknowledgementGate.promise;
      const delivered = structuredClone(payload);
      delivered.versionChanges = delivered.versionChanges.map((change) => change.entity === 'series' && change.id === initial.id
        ? { ...change, before: change.before + 1, after: change.after + 1 }
        : change);
      await route.fulfill({ response, json: delivered });
      return;
    }
    if (request.method() === 'GET' && pathname === '/api/creador/perfil' && corruptedObservation) {
      corruptedObservation = false;
      const response = await route.fetch();
      const payload = await response.json();
      const observedSeries = payload.series.find(({ id }) => id === initial.id);
      assert.ok(observedSeries, 'the malformed response is based on a real current owner snapshot');
      observedSeries.version = 0;
      await route.fulfill({ response, json: payload });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', corruptOnlyTheIntendedBoundaries);
  let save;
  try {
    save = form.getByRole('button', { name: 'Guardar serie' }).click();
    await entered.promise;
    await fillSeries(form, correction);
    acknowledgementGate.resolve();
    await save;
    await capture.settle({ skipErrorBodies: true });

    assert.equal(actualCommit.status, 200, 'the real service commits before only the acknowledgement receipt is damaged');
    assert.deepEqual(actualCommit.requestBody, {
      version: beforeSeries.version, profileVersion: beforeOwner.profile.version, ...sent,
    });
    const persistedAtCommit = await fixture.rawSeries(cookie, initial.id);
    const ownerAtCommit = await fixture.rawOwner(cookie);
    assert.deepEqual({ name: persistedAtCommit.name, slug: persistedAtCommit.slug, description: persistedAtCommit.description }, sent);
    assert.equal(persistedAtCommit.version, beforeSeries.version + 1);
    assert.equal(ownerAtCommit.profile.version, beforeOwner.profile.version + 1);
    assert.deepEqual(sortedReceipts(actualCommit.payload.versionChanges), sortedReceipts([
      { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: beforeOwner.profile.version + 1 },
      { entity: 'series', id: initial.id, before: beforeSeries.version, after: beforeSeries.version + 1 },
    ]), 'the undamaged service receipt matches the actual persisted profile and series versions');
    const patchWrites = writesFor(capture, 'PATCH', path);
    assert.equal(patchWrites.length, 1);
    assert.equal(patchWrites[0].status, 200);
    assert.notDeepEqual(sortedReceipts(patchWrites[0].responseBody.versionChanges), sortedReceipts(actualCommit.payload.versionChanges));
    await expect(form.locator('[data-owner-compare]'), 'an invalid first receipt must expose Comprobar immediately').toBeVisible();
    await expect(form.getByLabel('Nombre de la serie')).toHaveValue(correction.name);
    await expect(form.getByLabel('Dirección de la serie')).toHaveValue(correction.slug);
    await expect(form.getByLabel(/Descripción/)).toHaveValue(correction.description);
    await expect(form.locator('[data-owner-form-status="serie"]')).toContainText(/recibo|comprobar|confirmar/i);

    await form.locator('[data-owner-compare]').click();
    await expect(form.locator('[data-owner-compare]')).toBeVisible();
    await expect(form.getByRole('button', { name: /Conservar mi corrección/ })).toBeHidden();
    await expect(form.getByLabel('Nombre de la serie')).toHaveValue(correction.name);
    await expect(form.getByLabel('Dirección de la serie')).toHaveValue(correction.slug);
    await expect(form.getByLabel(/Descripción/)).toHaveValue(correction.description);
    assert.equal(writesFor(capture, 'PATCH', path).length, 1, 'a damaged observation is rejected without replaying the write');
    assert.equal(corruptedObservation, false, 'the first check consumed the deliberately malformed owner response');

    await form.locator('[data-owner-compare]').click();
    const comparison = form.locator('[data-owner-comparison]');
    await expect(comparison).toBeVisible();
    for (const value of Object.values(sent)) await expect(comparison).toContainText(value);
    for (const value of Object.values(correction)) await expect(comparison).toContainText(value);
    await expect(form.getByRole('button', { name: /Conservar mi corrección/ })).toBeVisible();
    await form.getByRole('button', { name: /Conservar mi corrección/ }).click();
    await expect(form.getByLabel('Nombre de la serie')).toHaveValue(correction.name);
    await expect(form.getByLabel('Dirección de la serie')).toHaveValue(correction.slug);
    await expect(form.getByLabel(/Descripción/)).toHaveValue(correction.description);
    await form.getByRole('button', { name: 'Guardar serie' }).click();
    await capture.settle({ skipErrorBodies: true });
    const patches = writesFor(capture, 'PATCH', path);
    assert.equal(patches.length, 2, 'the correction is saved once, manually, after a valid comparison');
    assert.deepEqual(patches[1].body, {
      version: beforeSeries.version + 1,
      profileVersion: beforeOwner.profile.version + 1,
      ...correction,
    });
    assert.equal(patches[1].status, 200);
    const finalOwner = await fixture.rawOwner(cookie);
    const finalSeries = await fixture.rawSeries(cookie, initial.id);
    assert.deepEqual({ name: finalSeries.name, slug: finalSeries.slug, description: finalSeries.description }, correction,
      'Conservar mi corrección keeps all three local fields rather than adopting remote name/slug with only a local description');
    assert.equal(finalSeries.version, beforeSeries.version + 2);
    assert.equal(finalOwner.profile.version, beforeOwner.profile.version + 2);
    assert.deepEqual(sortedReceipts(patches[1].responseBody.versionChanges), sortedReceipts([
      { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version + 1, after: finalOwner.profile.version },
      { entity: 'series', id: initial.id, before: beforeSeries.version + 1, after: finalSeries.version },
    ]), 'the recovered correction receipt agrees with the raw profile and series versions');
    await capture.stop({ skipErrorBodies: true });
  } finally {
    acknowledgementGate.resolve();
    await page.unroute('**/api/creador/**', corruptOnlyTheIntendedBoundaries).catch(() => {});
    await save?.catch(() => {});
  }
});

async function seedSeriesChapters(fixture, cookie, seriesId, count, longTitleIndex) {
  const profileId = (await fixture.rawOwner(cookie)).profile.id;
  const checks = [];
  const puts = [];
  const links = [];
  const query = 'BUSQUEDA-UNICA-LARGA-37';
  for (let index = 0; index < count; index += 1) {
    const suffix = String(index).padStart(2, '0');
    const resourceId = `resource-series-acceptance-${suffix}`;
    const placementId = `placement-series-acceptance-${suffix}`;
    const prefix = index === longTitleIndex ? `Capítulo ${suffix} AWS ${query} ` : `Capítulo ${suffix} AWS `;
    const title = index === longTitleIndex ? `${prefix}${'X'.repeat(200 - prefix.length)}` : `${prefix}contenido`;
    const url = `https://links.example/series-acceptance/${suffix}`;
    const placement = {
      recordType: 'placement', id: placementId, profileId, resourceId,
      position: (index + 1) * 10, featured: false, selectedForDirectory: true,
      series: { [seriesId]: { position: (index + 1) * 10 } }, version: 1,
    };
    checks.push(
      { key: `resource:${resourceId}`, version: null },
      { key: `placement:${profileId}:${placementId}`, version: null },
    );
    puts.push(
      { key: `resource:${resourceId}`, value: {
        id: resourceId, title, url, description: '', version: 1,
        published: false, hidden: index === 3, approvalRevoked: false, directoryControl: 'editorial',
      } },
      { key: `placement:${profileId}:${placementId}`, value: placement },
    );
    links.push({ placementId, resourceId, title, url });
  }
  assert.equal(await fixture.creatorStore.transact({ checks, puts }), true,
    'the test seeds only prerequisite rows; browser reads and mutations use the real service');
  return { links, longTitle: links[longTitleIndex].title };
}

test('Series: 0, 1 y 50 capítulos conservan búsqueda, paginación, contexto y foco, también en móvil', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  await openSeriesView(page, fixture);
  await expect(page.locator('[data-series-count]')).toHaveText('0 series');
  await expect(page.locator('[data-series-empty]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear serie' })).toBeVisible();

  const series = await createSeries(fixture, cookie, { name: 'Ruta de cincuenta capítulos', slug: 'ruta-cincuenta' });
  await openSeriesView(page, fixture);
  await expect(page.locator('[data-series-count]')).toHaveText('1 serie');
  await expect(seriesRow(page, series.id)).toBeVisible();
  await openSeriesView(page, fixture, `&serie=${encodeURIComponent(series.id)}`);
  await expect(page.locator('[data-chapter-count]')).toHaveText('0 coincidencias de 0 enlaces');
  await expect(page.locator('[data-chapter-empty]')).toBeVisible();
  const one = await addLink(fixture, cookie, { title: 'Capítulo único', url: 'https://links.example/único' });
  await openSeriesView(page, fixture, `&serie=${encodeURIComponent(series.id)}`);
  await expect(page.locator('[data-chapter-count]')).toHaveText('1 coincidencia de 1 enlace');
  const oneRow = page.locator(`[data-chapter-row="${one.placementId}"]`);
  await expect(oneRow.locator('[data-chapter-add]')).toBeVisible();
  await oneRow.locator('[data-chapter-add]').click();
  await expect(oneRow.locator('[data-chapter-remove]')).toBeVisible();

  const seeded = await seedSeriesChapters(fixture, cookie, series.id, 49, 37);
  await page.goto(`${fixture.origin}/cuenta/?vista=series&serie=${encodeURIComponent(series.id)}`);
  await expect(page.locator('[data-chapter-count]')).toHaveText('50 coincidencias de 50 enlaces');
  await expect(page.locator('[data-chapter-row]')).toHaveCount(25);
  await expect(page.locator(`[data-chapter-row="${seeded.links[3].placementId}"]`)).toContainText('Oculto en catálogo',
    'hidden existing content remains available to the chapter manager');
  await page.locator('[data-series-chapter-page]').filter({ hasText: 'Siguiente' }).click();
  await expect(page).toHaveURL(/paginaCapitulos=2/u);
  await expect(page.locator('[data-chapter-search]')).toHaveValue('');
  await expect(page.locator('[data-chapter-row]')).toHaveCount(25);
  const target = seeded.links[37];
  const targetRow = page.locator(`[data-chapter-row="${target.placementId}"]`);
  await expect(targetRow).toHaveCount(1, 'the second chapter page reaches a row outside the first page');
  await expect(targetRow.locator('h4')).toHaveText(seeded.longTitle);

  const capture = await captureCreatorApi(page, { ignoreReads: true });
  const search = page.locator('[data-chapter-search]');
  await search.fill('BUSQUEDA-UNICA-LARGA-37');
  await expect(search).toBeFocused();
  await expect(page.locator('[data-chapter-count]')).toHaveText('1 coincidencia de 50 enlaces');
  await expect(targetRow.locator('h4')).toHaveText(seeded.longTitle);
  await expect(page).toHaveURL(/buscarCapitulos=BUSQUEDA-UNICA-LARGA-37/u);

  await page.setViewportSize({ width: 390, height: 844 });
  const remove = targetRow.locator('[data-chapter-remove]');
  await remove.scrollIntoViewIfNeeded();
  await expect(remove).toBeVisible();
  const removeBox = await remove.boundingBox();
  assert.ok(removeBox && removeBox.x >= 0 && removeBox.x + removeBox.width <= 390,
    'the action for the long-title chapter remains within the mobile viewport');
  await remove.click();
  await capture.settle({ skipErrorBodies: true });
  await expect(page.locator('[data-chapter-search]')).toHaveValue('BUSQUEDA-UNICA-LARGA-37');
  await expect(page.locator(`[data-chapter-row="${target.placementId}"] button:focus, [data-chapter-search]:focus`)).toHaveCount(1,
    'focus returns to a pertinent action in the row, or to chapter search if that row/control is gone');
  assert.equal((await fixture.rawPlacement(cookie, target.placementId)).series?.[series.id], undefined,
    'the real remove action updates just this chapter membership');

  const add = targetRow.locator('[data-chapter-add]');
  await add.press('Enter');
  await capture.settle({ skipErrorBodies: true });
  await expect(page.locator(`[data-chapter-row="${target.placementId}"] button:focus, [data-chapter-search]:focus`)).toHaveCount(1,
    'keyboard Add keeps focus on a pertinent row action, or chapter search if that row/control is gone');
  await expect(page.locator('[data-chapter-search]')).toHaveValue('BUSQUEDA-UNICA-LARGA-37');
  const finalPlacement = await fixture.rawPlacement(cookie, target.placementId);
  assert.equal(finalPlacement.series[series.id].position, 500,
    're-adding the chapter uses the actual end of the complete series order');
  const writes = capture.writes().filter(({ method }) => writtenMethods.has(method));
  assert.equal(writes.length, 2, 'the remove and keyboard Add are the only writes in the 50-row interaction');
  assert.equal(writes[0].method, 'DELETE');
  assert.equal(writes[1].method, 'PUT');
  assert.equal(writes[0].status, 204, 'removing chapter membership uses the API’s empty success response');
  assert.equal(writes[1].status, 200);
  await capture.stop({ skipErrorBodies: true });
});

test('Series: el slug usa validación nativa y acepta segmentos con guiones sencillos', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  await openSeriesView(page, fixture);
  await page.getByRole('button', { name: 'Crear serie' }).click();
  const form = seriesForm(page);
  const slug = form.getByLabel('Dirección de la serie');
  const save = form.getByRole('button', { name: 'Guardar serie' });
  const invalidSlugs = ['ana serie', 'ana--serie', '-ana', 'ana-'];

  for (const [index, value] of invalidSlugs.entries()) {
    await form.getByLabel('Nombre de la serie').fill(`Inválida ${index}`);
    await slug.fill(value);
    const validity = await slug.evaluate((input) => ({
      valid: input.checkValidity(),
      patternMismatch: input.validity.patternMismatch,
      valueMissing: input.validity.valueMissing,
      tooShort: input.validity.tooShort,
    }));
    assert.deepEqual(validity, { valid: false, patternMismatch: true, valueMissing: false, tooShort: false });
    const writesBefore = capture.writes().length;
    await save.click();
    await expect(form).toBeVisible();
    await expect(slug).toBeFocused();
    assert.equal(capture.writes().length, writesBefore,
      `native form validation blocks the invalid slug ${JSON.stringify(value)} before any API write`);
  }

  for (const [index, value] of ['ana', 'serie-2026', 'abc-1-def'].entries()) {
    await form.getByLabel('Nombre de la serie').fill(`Ruta válida ${index + 1}`);
    await slug.fill(value);
    assert.equal(await slug.evaluate((input) => input.checkValidity()), true,
      `${value} is accepted by the browser's native input constraints`);
    await save.click();
    await capture.settle({ skipErrorBodies: true });
    const writes = writesFor(capture, 'POST', '/api/creador/series');
    assert.equal(writes.length, index + 1);
    assert.equal(writes.at(-1).status, 201);
    assert.deepEqual(writes.at(-1).body, {
      name: `Ruta válida ${index + 1}`,
      slug: value,
      profileVersion: index + 1,
    });
    const created = writes.at(-1).responseBody.series;
    assert.equal((await fixture.rawSeries(cookie, created.id)).slug, value);
    if (index < 2) {
      await page.getByRole('button', { name: 'Crear serie' }).click();
      await expect(form).toBeVisible();
    }
  }
  assert.equal(capture.writes().filter(({ method }) => method === 'POST').length, 3,
    'only the three natively valid slugs reach the real series API');
  await capture.stop({ skipErrorBodies: true });
});

test('Series: el ordinal de mover capítulo referencia una descripción visible dentro de su diálogo', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Serie descrita', slug: 'serie-descrita' });
  const first = await addLink(fixture, cookie, { title: 'Primer capítulo', url: 'https://links.example/primero' });
  const second = await addLink(fixture, cookie, { title: 'Segundo capítulo', url: 'https://links.example/segundo' });
  await addChapter(fixture, cookie, series.id, first.placementId);
  await addChapter(fixture, cookie, series.id, second.placementId);
  await openSeriesView(page, fixture, `&serie=${encodeURIComponent(series.id)}`);

  await page.locator(`[data-chapter-row="${first.placementId}"] [data-chapter-move]`).click();
  const dialog = page.locator('[data-owner-dialog]');
  const form = dialog.locator('form[data-owner-form="mover-capitulo"]');
  await expect(dialog).toBeVisible();
  await expect(form).toBeVisible();
  const ordinal = form.getByLabel('Posición en esta serie');
  const referenceText = await ordinal.getAttribute('aria-describedby');
  assert.ok(referenceText, 'the ordinal field has an accessible description reference');
  const referenceIds = referenceText.trim().split(/\s+/u);
  assert.ok(referenceIds.length > 0);
  for (const id of referenceIds) {
    const description = form.locator(`[id="${id}"]`);
    await expect(description).toHaveCount(1);
    await expect(description).toBeVisible();
  }
  assert.deepEqual(await ordinal.evaluate((input, ids) => {
    const ownDialog = input.closest('[data-owner-dialog]');
    return {
      inDialog: Boolean(ownDialog),
      referencesInDialog: ids.map((id) => {
        const target = document.getElementById(id);
        return Boolean(target && ownDialog?.contains(target));
      }),
    };
  }, referenceIds), {
    inDialog: true,
    referencesInDialog: referenceIds.map(() => true),
  }, 'every aria-describedby target belongs to the same visible chapter-move dialog');
  const description = form.locator(`[id="${referenceIds[0]}"]`);
  await expect(description).toContainText(series.name);
  await expect(description).toContainText(/posición actual 1 de 2/i);
});

test('Series: el enlace de capítulos conserva clic modificado y la guardia permite Seguir o Descartar al navegar', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Serie con navegación', slug: 'serie-navegacion' });
  const link = await addLink(fixture, cookie, { title: 'Capítulo de navegación', url: 'https://links.example/navegacion' });
  await addChapter(fixture, cookie, series.id, link.placementId);
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  await openSeriesView(page, fixture);

  const chapters = seriesRow(page, series.id).locator('[data-series-chapters]');
  const listUrl = page.url();
  const destination = new URL(await chapters.getAttribute('href'), listUrl).href;
  const openedPagePromise = page.context().waitForEvent('page');
  await chapters.click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] });
  const openedPage = await openedPagePromise;
  await expect(openedPage).toHaveURL(destination);
  await expect(openedPage.locator('[data-series-context-name]')).toHaveText(series.name);
  assert.equal(page.url(), listUrl, 'a modified native link leaves the current list untouched');
  await openedPage.close();

  await chapters.click();
  await expect(page.locator('[data-series-context-name]')).toHaveText(series.name);
  const chapterUrl = page.url();
  await page.locator('[data-series-back]').click();
  await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-series-context-name]')).toHaveText(series.name);
  await page.goForward();
  await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(chapterUrl);

  await page.locator('[data-owner-series-chapters] [data-series-edit]').click();
  const form = seriesForm(page);
  await expect(form).toBeVisible();
  await form.getByLabel('Nombre de la serie').fill('Nombre sin guardar');
  await form.getByRole('button', { name: 'Cancelar' }).click();
  const exitPrompt = page.locator('[data-owner-exit-prompt]');
  await expect(exitPrompt).toBeVisible();
  await exitPrompt.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page).toHaveURL(chapterUrl);
  await expect(form.getByLabel('Nombre de la serie')).toHaveValue('Nombre sin guardar');

  const back = page.goBack();
  await expect(exitPrompt).toBeVisible();
  await exitPrompt.getByRole('button', { name: 'Descartar cambios' }).click();
  await back;
  await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
  await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
  assert.equal(capture.writes().length, 0, 'continuing and discarding navigation never saves the unsaved correction');

  await page.goForward();
  await expect(page.locator('[data-series-context-name]')).toHaveText(series.name);
  await expect(page.locator(`[data-chapter-row="${link.placementId}"] [data-chapter-remove]`)).toBeVisible();
  await capture.stop({ skipErrorBodies: true });
});

test('Series: una respuesta antigua de capítulo llega después de borrar su contexto y Atrás normaliza el destino eliminado', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const removed = await createSeries(fixture, cookie, { name: 'Serie con lectura pendiente', slug: 'serie-pendiente' });
  const survivor = await createSeries(fixture, cookie, { name: 'Serie todavía activa', slug: 'serie-activa' });
  const link = await addLink(fixture, cookie, { title: 'Capítulo de contexto', url: 'https://links.example/contexto' });
  await addChapter(fixture, cookie, survivor.id, link.placementId);
  const beforeOwner = await fixture.rawOwner(cookie);
  const beforePlacement = await fixture.rawPlacement(cookie, link.placementId);
  const path = `/api/creador/series/${removed.id}/capitulos/${link.placementId}`;
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  await openSeriesView(page, fixture, `&serie=${encodeURIComponent(removed.id)}`);
  const held = await holdOneSuccessfulWrite(page, { method: 'PUT', path });
  let add;
  try {
    add = page.locator(`[data-chapter-row="${link.placementId}"] [data-chapter-add]`).click();
    await held.reached;
    assert.equal(held.observed.actualStatus, 200, 'the real chapter write completes before its response is delayed');
    const ownerAfterChapter = await fixture.rawOwner(cookie);
    const placementAfterChapter = await fixture.rawPlacement(cookie, link.placementId);
    assert.deepEqual(sortedReceipts(held.observed.actualBody.versionChanges), sortedReceipts([
      { entity: 'profile', id: beforeOwner.profile.id, before: beforeOwner.profile.version, after: ownerAfterChapter.profile.version },
      { entity: 'placement', id: link.placementId, before: beforePlacement.version, after: placementAfterChapter.version },
    ]), 'the delayed response receipts match the actual chapter write before the delete');
    const concurrentDelete = await api(fixture, cookie, `/api/creador/series/${removed.id}`, {
      method: 'DELETE', body: { version: removed.version, profileVersion: ownerAfterChapter.profile.version },
    });
    assert.equal(concurrentDelete.response.status, 204, 'the intervening delete uses the real service/API and current version');
    assert.equal(await fixture.rawSeries(cookie, removed.id), null);
    assert.deepEqual(JSON.parse(concurrentDelete.response.headers.get('creator-write-versions')), [
      { entity: 'profile', id: beforeOwner.profile.id, before: ownerAfterChapter.profile.version, after: ownerAfterChapter.profile.version + 1 },
    ]);
    held.release();
    await add;
  } finally {
    held.release();
    await held.remove();
    await add?.catch(() => {});
  }
  await capture.settle({ skipErrorBodies: true });
  assert.equal(capture.writes().filter(({ method, path: requestPath }) => method === 'PUT' && requestPath === path).length, 1,
    'the delayed successful chapter response is the original operation, not a replay');
  const rawAfterDelete = await fixture.rawPlacement(cookie, link.placementId);
  assert.deepEqual(rawAfterDelete.series, {
    ...beforePlacement.series,
    [removed.id]: { position: 0 },
  }, 'the deleted series record is gone while physical link data remains available to other series');
  const projectedAfterDelete = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(projectedAfterDelete.response.status, 200);
  assert.deepEqual(projectedAfterDelete.body.links[0].series.map(({ seriesId }) => seriesId), [survivor.id],
    'the current read excludes the deleted series and preserves the other membership');

  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  await page.goBack();
  await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
  const restoredUrl = new URL(page.url());
  assert.equal(restoredUrl.searchParams.has('serie'), false);
  assert.equal(restoredUrl.searchParams.has('buscarCapitulos'), false);
  await expect(seriesRow(page, removed.id)).toHaveCount(0);
  await expect(seriesRow(page, survivor.id)).toBeVisible();
  await seriesRow(page, survivor.id).locator('[data-series-chapters]').click();
  await expect(page.locator(`[data-chapter-row="${link.placementId}"] [data-chapter-remove]`)).toBeVisible();
  assert.equal(await fixture.rawSeries(cookie, survivor.id) !== null, true);
  await capture.stop({ skipErrorBodies: true });
});

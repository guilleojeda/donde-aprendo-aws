import assert from 'node:assert/strict';
import { makeAccount, makeIdentity } from '../fixtures/account-auth.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';
import { creatorPageSessionBinding } from '../../src/lib/creator-session-context.mjs';
import {
  test, expect, captureCreatorApi, loggedInOwner, addCookie,
} from '../fixtures/creator-browser-test.mjs';

const OWNER_PATH = '/api/creador/perfil';
const REFERENCE_PATH = '/api/creador/referencias';

function deferred() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

function catalogEntry(id, title, url) {
  return { id, title, url, tipo: 'community' };
}

async function seedCatalogRecord(fixture, item) {
  await seedResource(fixture.creatorStore, {
    id: item.id,
    title: item.title,
    url: item.url,
    kind: 'community',
    category: 'Comunidad',
    format: 'community',
    published: true,
  });
}

async function seedReferencePlacement(fixture, cookie, item, selectedForDirectory = true) {
  const before = await fixture.rawOwner(cookie);
  const response = await fixture.request(cookie, REFERENCE_PATH, { method: 'POST', body: {
    resourceId: item.id, url: item.url, profileVersion: before.profile.version, selectedForDirectory,
  } });
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  return response.json();
}

async function serveSelectionIndex(page, entries) {
  const handler = async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(entries) });
  };
  await page.route('**/catalog-selection.json', handler);
  return () => page.unroute('**/catalog-selection.json', handler).catch(() => {});
}

test('un cambio de título en el catálogo no invalida una comparación de referencia de B', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const oldA = catalogEntry('phase7-stale-a', 'Referencia A vencida', 'https://phase7.example/a-old');
  const currentA = { ...oldA, url: 'https://phase7.example/a-current' };
  const itemB = catalogEntry('phase7-reference-b', 'Referencia B original', 'https://phase7.example/b');
  const renamedB = { ...itemB, title: 'Referencia B con título actualizado' };
  await seedCatalogRecord(fixture, currentA);
  await seedCatalogRecord(fixture, itemB);
  const resourceBeforeB = await fixture.rawResource(itemB.id);

  const refreshArrived = deferred();
  const releaseRefresh = deferred();
  let indexReads = 0;
  await page.route('**/catalog-selection.json', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    indexReads += 1;
    if (indexReads === 2) {
      refreshArrived.release();
      await releaseRefresh.promise;
    }
    const entries = indexReads === 1 ? [oldA, itemB] : [currentA, renamedB];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(entries) });
  });

  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const transport = await installReferenceTransport(page, { loseReferenceAcknowledgement: false });
  let staleSubmit;
  try {
    await openLinksWithManagedHistory(page, fixture);
    await openCatalog(page);
    const dialog = page.getByRole('dialog');
    const form = page.locator('[data-owner-form="referencia"]');
    const directory = form.getByRole('checkbox', { name: 'Proponer al directorio', exact: true });
    const before = await freshOwner(fixture, cookie);
    await catalogRadio(page, oldA).check();
    staleSubmit = form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    const stale = await transport.writeArrived.promise;
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, 'RESOURCE_CONFLICT');
    await catalogRadio(page, itemB).check();
    await directory.uncheck();
    transport.writeGate.release();
    await staleSubmit;
    await expect.poll(() => referenceWrites(capture).length).toBe(1);
    await expect.poll(() => referenceWrites(capture)[0]?.status).toBe(409);
    assert.equal(referenceWrites(capture)[0].body.url, oldA.url);

    await dialog.getByRole('button', { name: 'Actualizar catálogo', exact: true }).click();
    await refreshArrived.promise;

    const comparison = form.locator('[data-owner-comparison]');
    await form.locator('[data-owner-compare]').click();
    await expect(comparison).toBeVisible();
    await expect(comparison).toContainText(itemB.title);
    await expect(comparison).toContainText(itemB.url);

    releaseRefresh.release();
    await expect(catalogRadio(page, renamedB)).toBeChecked();
    await expect(directory).not.toBeChecked();
    await expect(comparison).toBeVisible();
    await form.locator('[data-owner-adopt]').click();
    await expect(comparison).toHaveCount(0);
    await expect(catalogRadio(page, renamedB)).toBeChecked();
    await expect(directory).not.toBeChecked();
    assert.equal(indexReads, 2);
    assert.equal(referenceWrites(capture).length, 1,
      'the label-only refresh does not replay A or send B during comparison adoption');

    await addManuallySelectedB(page, capture, renamedB);
    const saved = await freshOwner(fixture, cookie);
    assert.equal(saved.profile.version, before.profile.version + 1);
    assert.deepEqual(saved.links.map(({ resourceId, url, selectedForDirectory }) => ({ resourceId, url, selectedForDirectory })), [
      { resourceId: itemB.id, url: itemB.url, selectedForDirectory: false },
    ], 'only the explicitly submitted, exact B pair is persisted with its later directory choice');
    assert.deepEqual(await fixture.rawResource(itemB.id), resourceBeforeB,
      'the manually saved reference leaves the shared catalog resource unchanged');
  } finally {
    releaseRefresh.release();
    transport.writeGate.release();
    await staleSubmit?.catch(() => {});
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('una referencia ya concedida conserva la continuación de opciones tras un conflicto de perfil', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const item = catalogEntry('review-options-owned-recovery', 'Ficha propia recuperable', 'https://review.example/options-owned-recovery');
  await seedCatalogRecord(fixture, item);
  await grantReferenceEditorship(fixture, cookie, item);
  const removeIndexRoute = await serveSelectionIndex(page, [item]);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const transport = await installReferenceTransport(page, { loseReferenceAcknowledgement: false });
  let submitted;
  try {
    await openLinksWithManagedHistory(page, fixture);
    await openCatalog(page);
    const reference = page.locator('[data-owner-form="referencia"]');
    await catalogRadio(page, item).check();
    const before = await freshOwner(fixture, cookie);
    const resourceBefore = await fixture.rawResource(item.id);
    submitted = reference.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    const actual = await transport.writeArrived.promise;
    assert.equal(actual.status, 200);
    assert.equal(actual.body.created, false, 'the already granted placement returns an authoritative no-op');
    assert.equal(actual.body.link.resourceId, item.id);
    const placementId = actual.body.link.placementId;
    await reference.getByRole('checkbox', { name: 'Proponer al directorio', exact: true }).uncheck();
    transport.writeGate.release();
    await submitted;

    const options = page.locator('[data-link-edit-form]');
    await expect(options).toBeVisible();
    await expect(options.getByLabel('URL', { exact: true })).toBeDisabled();
    const changed = await fixture.request(cookie, OWNER_PATH, { method: 'PUT', body: {
      displayName: 'Nombre concurrente de recuperación', version: before.profile.version,
    } });
    assert.equal(changed.status, 200, JSON.stringify(await changed.clone().json()));
    await options.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => optionWrites(capture, placementId)[0]?.status).toBe(409);
    await options.locator('[data-owner-compare]').click();
    await expect(options.locator('[data-owner-adopt]')).toBeEnabled();
    await options.locator('[data-owner-adopt]').click();

    await expect(options.getByRole('checkbox', { name: 'Proponer al directorio', exact: true })).not.toBeChecked();
    await expect(options.getByLabel('URL', { exact: true })).toBeDisabled();
    await options.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => optionWrites(capture, placementId)[1]?.status).toBe(200);
    const patch = optionWrites(capture, placementId)[1];
    assert.deepEqual(patch.body, {
      profileVersion: before.profile.version + 1,
      placementVersion: actual.body.link.placementVersion,
      resourceVersion: actual.body.link.resourceVersion,
      featured: actual.body.link.featured,
      selectedForDirectory: false,
    }, 'the explicit continuation sends only the corrected placement option against the adopted versions');
    assert.equal(Object.hasOwn(patch.body, 'title'), false);
    assert.equal(Object.hasOwn(patch.body, 'url'), false);
    assert.equal(Object.hasOwn(patch.body, 'description'), false);
    assert.equal(referenceWrites(capture).length, 1, 'recovery and the options save never replay the reference no-op');

    const final = await freshOwner(fixture, cookie);
    assert.equal(final.links.filter(({ resourceId }) => resourceId === item.id).length, 1);
    assert.equal(final.links[0].selectedForDirectory, false);
    assert.equal(final.editableResources.some(({ id }) => id === item.id), true,
      'the existing grant remains the owner resource authority');
    assert.deepEqual(await fixture.rawResource(item.id), resourceBefore,
      'the options-only continuation does not modify the shared resource');
  } finally {
    transport.writeGate.release();
    await submitted?.catch(() => {});
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
    await removeIndexRoute();
  }
});

async function openLinksWithManagedHistory(page, fixture) {
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
  await page.locator('form[data-link-filters]').locator('#owner-link-directory').selectOption('propuestos');
  await expect(page).toHaveURL((url) => url.searchParams.get('directorio') === 'propuestos');
}

async function openCatalog(page) {
  await page.getByRole('button', { name: /Buscar en el catálogo/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('[data-owner-form="referencia"]')).toBeVisible();
}

function catalogRadio(page, item) {
  return page.getByRole('dialog').getByRole('radio', { name: `Seleccionar ${item.title}`, exact: true });
}

function referenceWrites(capture) {
  return capture.writes().filter(({ method, path }) => method === 'POST' && path === REFERENCE_PATH);
}

function optionWrites(capture, placementId) {
  return capture.writes().filter(({ method, path }) => method === 'PATCH'
    && path === `/api/creador/enlaces/${placementId}/editar`);
}

async function installReferenceTransport(page, { loseReferenceAcknowledgement }) {
  const writeArrived = deferred();
  const writeGate = deferred();
  const writeFinished = deferred();
  const reads = [];
  let actualWrite;
  let writeSeen = false;
  let readIndex = 0;
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (!writeSeen && request.method() === 'POST' && pathname === REFERENCE_PATH) {
      writeSeen = true;
      try {
        const response = await route.fetch();
        const body = await response.json();
        actualWrite = { status: response.status(), body, requestBody: request.postDataJSON() };
        writeArrived.release(actualWrite);
        await writeGate.promise;
        if (loseReferenceAcknowledgement) await route.fulfill({ response, status: 503 });
        else await route.fulfill({ response, json: body });
      } finally {
        writeFinished.release();
      }
      return;
    }
    if (request.method() === 'GET' && pathname === OWNER_PATH && readIndex < reads.length) {
      const read = reads[readIndex++];
      try {
        const response = await route.fetch();
        const body = await response.json();
        read.actual = { status: response.status(), body };
        read.arrived.release(read.actual);
        await read.gate.promise;
        await route.fulfill({ response, json: body });
      } finally {
        read.finished.release();
      }
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', handler);
  return {
    get actualWrite() { return actualWrite; },
    writeArrived,
    writeGate,
    holdNextRead() {
      const read = { arrived: deferred(), gate: deferred(), finished: deferred(), actual: undefined };
      reads.push(read);
      return read;
    },
    async close() {
      writeGate.release();
      for (const read of reads) read.gate.release();
      await Promise.all([
        ...(writeSeen ? [writeFinished.promise] : []),
        ...reads.slice(0, readIndex).map(({ finished }) => finished.promise),
      ]);
      await page.unroute('**/api/creador/**', handler).catch(() => {});
    },
  };
}

async function freshOwner(fixture, cookie) {
  return fixture.request(cookie, OWNER_PATH).then((response) => response.json());
}

async function addManuallySelectedB(page, capture, itemB) {
  const form = page.locator('[data-owner-form="referencia"]');
  await expect(form).toBeVisible();
  await expect(catalogRadio(page, itemB)).toBeChecked();
  await expect(form.getByRole('checkbox', { name: 'Proponer al directorio', exact: true })).not.toBeChecked();
  await expect(form.getByRole('button', { name: 'Agregar a mi página', exact: true })).toBeEnabled();
  const focusedControl = form.locator('input:focus, button:focus, select:focus, textarea:focus');
  await expect(focusedControl,
    'the retained reference editor keeps focus on a visible enabled control').toHaveCount(1);
  await expect(focusedControl).toBeVisible();
  await expect(focusedControl).toBeEnabled();
  await form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
  await expect.poll(() => referenceWrites(capture).length).toBe(2);
  await expect.poll(() => referenceWrites(capture)[1]?.status).toBe(201);
}

for (const outcome of [
  { name: 'respuesta normal', loseReferenceAcknowledgement: false },
  { name: 'acknowledgement lost after commit', loseReferenceAcknowledgement: true },
]) {
  test(`Referencia A conserva B y su opción para la acción manual siguiente (${outcome.name})`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const suffix = outcome.loseReferenceAcknowledgement ? 'lost-ack' : 'normal-ack';
    const itemA = catalogEntry(`phase3-reference-a-${suffix}`, `Referencia A ${suffix}`, `https://phase3.example/${suffix}/a`);
    const itemB = catalogEntry(`phase3-reference-b-${suffix}`, `Referencia B pendiente ${suffix}`, `https://phase3.example/${suffix}/b`);
    await seedCatalogRecord(fixture, itemA);
    await seedCatalogRecord(fixture, itemB);
    const removeIndexRoute = await serveSelectionIndex(page, [itemA, itemB]);
    await openLinksWithManagedHistory(page, fixture);
    await openCatalog(page);
    await catalogRadio(page, itemA).check();
    const form = page.locator('[data-owner-form="referencia"]');
    const directory = form.getByRole('checkbox', { name: 'Proponer al directorio', exact: true });
    await expect(directory).toBeChecked();
    const before = await fixture.rawOwner(cookie);
    const resourceA = await fixture.rawResource(itemA.id);
    const resourceB = await fixture.rawResource(itemB.id);
    const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
    const transport = await installReferenceTransport(page, outcome);
    let submit;
    let pendingBack;
    try {
      submit = form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
      const actualA = await transport.writeArrived.promise;
      assert.equal(actualA.status, 201, 'A reaches the real reference service and commits before transport handling');
      assert.deepEqual(actualA.requestBody, {
        resourceId: itemA.id,
        url: itemA.url,
        profileVersion: before.profile.version,
        selectedForDirectory: true,
      });
      const committedA = await freshOwner(fixture, cookie);
      assert.equal(committedA.links.filter(({ resourceId }) => resourceId === itemA.id).length, 1);
      assert.equal(committedA.links.find(({ resourceId }) => resourceId === itemA.id).selectedForDirectory, true);

      if (!outcome.loseReferenceAcknowledgement) {
        await catalogRadio(page, itemB).check();
        await directory.uncheck();
        transport.writeGate.release();
        await submit;
        await capture.settle({ skipErrorBodies: true });
        assert.equal(referenceWrites(capture).length, 1, 'normal acknowledgement does not send B automatically');
        assert.equal(referenceWrites(capture)[0].status, 201);
        await expect(catalogRadio(page, itemB)).toBeChecked();
        await expect(directory).not.toBeChecked();

        const guardedUrl = page.url();
        const timeOrigin = await page.evaluate(() => performance.timeOrigin);
        pendingBack = page.goBack();
        const exitPrompt = page.locator('[data-owner-exit-prompt]');
        await expect(exitPrompt).toBeVisible();
        await exitPrompt.getByRole('button', { name: 'Seguir editando', exact: true }).click();
        await pendingBack;
        await expect(page).toHaveURL(guardedUrl);
        await expect(page.locator('[data-owner-exit-prompt]')).toHaveCount(0);
        await expect(page).toHaveURL(guardedUrl);
        assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);
        await expect(catalogRadio(page, itemB)).toBeChecked();
        await expect(directory).not.toBeChecked();
      } else {
        transport.writeGate.release();
        await submit;
        await capture.settle({ skipErrorBodies: true });
        assert.equal(referenceWrites(capture).length, 1, 'the lost-ack attempt is never replayed before its bound check');
        assert.equal(referenceWrites(capture)[0].status, 503);

        const firstRead = transport.holdNextRead();
        const firstCheck = form.locator('[data-owner-compare]').click();
        const observedA = await firstRead.arrived.promise;
        assert.equal(observedA.status, 200);
        assert.equal(observedA.body.links.filter(({ resourceId }) => resourceId === itemA.id).length, 1,
          'Comprobar reads the actual owner snapshot containing only committed A');

        await catalogRadio(page, itemB).check();
        await directory.uncheck();
        const guardedUrl = page.url();
        const timeOrigin = await page.evaluate(() => performance.timeOrigin);
        pendingBack = page.goBack();
        const exitPrompt = page.locator('[data-owner-exit-prompt]');
        await expect(exitPrompt).toBeVisible();
        await exitPrompt.getByRole('button', { name: 'Seguir editando', exact: true }).click();
        await pendingBack;
        await expect(page).toHaveURL(guardedUrl,
          'native Back is held by the real unsaved-reference guard while the owner read remains pending');
        await expect(page.locator('[data-owner-exit-prompt]')).toHaveCount(0);
        await expect(catalogRadio(page, itemB)).toBeChecked();
        await expect(directory).not.toBeChecked();
        assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);

        firstRead.gate.release();
        await firstCheck;
        const firstComparison = form.locator('[data-owner-comparison]');
        await expect(firstComparison).toBeVisible();
        await expect(firstComparison).toContainText(itemA.title,
          'the comparison names the observed result for original A');
        await expect(firstComparison).toContainText(itemA.url);
        await expect(firstComparison).toContainText(itemB.title,
          'the comparison distinguishes pending B from the saved result of A');
        await expect(firstComparison).toContainText(itemB.url);

        await directory.check();
        await form.locator('[data-owner-adopt]').click();
        await expect(form.locator('[data-owner-adopt]')).toHaveCount(0,
          'changing B after comparison invalidates that comparison instead of adopting it');
        const recheck = form.locator('[data-owner-compare]');
        await expect(form).toContainText('Tus campos cambiaron después de la comparación. Vuelve a comprobar antes de adoptar.',
          'the open reference dialog explains why the stale comparison cannot be adopted');
        await expect(recheck).toBeVisible();
        await expect(recheck).toBeEnabled();
        await expect(recheck).toBeFocused();
        await expect(recheck).toBeInViewport();
        await expect(catalogRadio(page, itemB)).toBeChecked();
        await expect(directory).toBeChecked();
        assert.equal(referenceWrites(capture).length, 1, 'invalidating a comparison performs no reference write');

        await directory.uncheck();
        const refreshedRead = page.waitForResponse((response) => response.request().method() === 'GET'
          && new URL(response.url()).pathname.replace(/\/$/u, '') === OWNER_PATH);
        await form.locator('[data-owner-compare]').click();
        assert.equal((await refreshedRead).status(), 200);
        const refreshedComparison = form.locator('[data-owner-comparison]');
        await expect(refreshedComparison).toBeVisible();
        await expect(refreshedComparison).toContainText(itemA.title);
        await expect(refreshedComparison).toContainText(itemA.url);
        await expect(refreshedComparison).toContainText(itemB.title);
        await expect(refreshedComparison).toContainText(itemB.url);

        const queuedUrl = page.url();
        const queuedTimeOrigin = await page.evaluate(() => performance.timeOrigin);
        pendingBack = page.goBack();
        await expect(exitPrompt).toBeVisible();
        await expect(exitPrompt.locator('[data-owner-adopt]')).toBeVisible();
        await exitPrompt.locator('[data-owner-adopt]').click();
        await expect(exitPrompt).toHaveCount(0,
          'adopting A from the native exit prompt cancels the queued navigation while retaining B');
        await expect(page.locator('[data-owner-form="referencia"]')).toBeVisible();
        await expect(catalogRadio(page, itemB)).toBeChecked();
        await expect(directory).not.toBeChecked();
        await pendingBack;
        await expect(page).toHaveURL(queuedUrl);
        assert.equal(await page.evaluate(() => performance.timeOrigin), queuedTimeOrigin);
        assert.equal(referenceWrites(capture).length, 1, 'recovery adoption does not replay A or submit pending B');
      }

      await addManuallySelectedB(page, capture, itemB);
      await capture.settle({ skipErrorBodies: true });
      const writes = referenceWrites(capture);
      assert.equal(writes.length, 2, 'the only requests are A and the later manual submission of B');
      assert.equal(writes[0].body.resourceId, itemA.id);
      assert.equal(writes[0].body.url, itemA.url);
      assert.equal(writes[0].body.selectedForDirectory, true);
      assert.equal(writes[1].status, 201);
      assert.deepEqual(writes[1].body, {
        resourceId: itemB.id,
        url: itemB.url,
        profileVersion: before.profile.version + 1,
        selectedForDirectory: false,
      }, 'manual B uses the profile version confirmed for A and its current directory choice');

      const final = await freshOwner(fixture, cookie);
      assert.equal(final.profile.version, before.profile.version + 2);
      for (const item of [itemA, itemB]) {
        const links = final.links.filter(({ resourceId }) => resourceId === item.id);
        assert.equal(links.length, 1, `${item.title} has exactly one saved placement`);
        assert.equal(links[0].url, item.url);
        assert.equal(final.editableResources.some(({ id }) => id === item.id), false,
          'referencing catalog content never grants shared-resource editing authority');
        assert.deepEqual(await fixture.rawResource(item.id), item === itemA ? resourceA : resourceB,
          'reference completion leaves catalog metadata unchanged');
      }
      assert.equal(final.links.find(({ resourceId }) => resourceId === itemA.id).selectedForDirectory, true);
      assert.equal(final.links.find(({ resourceId }) => resourceId === itemB.id).selectedForDirectory, false);
      assert.equal(referenceWrites(capture).filter(({ body }) => body.resourceId === itemA.id).length, 1,
        'A is never replayed during recovery or while submitting B');
      assert.equal(referenceWrites(capture).filter(({ body }) => body.resourceId === itemB.id).length, 1,
        'B is sent only once, after its explicit user action');
    } finally {
      transport.writeGate.release();
      await submit?.catch(() => {});
      await pendingBack?.catch(() => {});
      await transport.close();
      await capture.stop({ skipErrorBodies: true }).catch(() => {});
      await removeIndexRoute();
    }
  });
}

test('adoptar A devuelve el foco visible a B en un catálogo largo antes de su guardado manual', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const itemA = catalogEntry('phase6-reference-focus-a', 'Referencia A para foco visible', 'https://phase6.example/reference/focus/a');
  const itemB = catalogEntry('phase6-reference-focus-b', 'Referencia B con foco visible', 'https://phase6.example/reference/focus/b');
  const fillers = Array.from({ length: 73 }, (_, index) => catalogEntry(
    `phase6-reference-focus-filler-${index}`,
    `Opción larga ${String(index + 1).padStart(2, '0')}`,
    `https://phase6.example/reference/filler/${index + 1}`,
  ));
  const entries = [itemA, ...fillers, itemB];
  await seedCatalogRecord(fixture, itemA);
  await seedCatalogRecord(fixture, itemB);
  const removeIndexRoute = await serveSelectionIndex(page, entries);
  await openLinksWithManagedHistory(page, fixture);
  await openCatalog(page);
  const dialog = page.getByRole('dialog');
  const form = page.locator('[data-owner-form="referencia"]');
  const directory = form.getByRole('checkbox', { name: 'Proponer al directorio', exact: true });
  await catalogRadio(page, itemA).check();
  const before = await fixture.rawOwner(cookie);
  const resourceA = await fixture.rawResource(itemA.id);
  const resourceB = await fixture.rawResource(itemB.id);
  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const transport = await installReferenceTransport(page, { loseReferenceAcknowledgement: true });
  let submit;
  let check;
  let heldRead;

  try {
    submit = form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    const committedA = await transport.writeArrived.promise;
    assert.equal(committedA.status, 201, 'the actual reference handler commits A before its acknowledgement is lost');
    transport.writeGate.release();
    await submit;
    await capture.settle({ skipErrorBodies: true });
    assert.equal(referenceWrites(capture).length, 1);
    assert.equal(referenceWrites(capture)[0].status, 503);

    heldRead = transport.holdNextRead();
    check = form.locator('[data-owner-compare]').click();
    const observed = await heldRead.arrived.promise;
    assert.equal(observed.status, 200);
    assert.equal(observed.body.links.filter(({ resourceId }) => resourceId === itemA.id).length, 1,
      'the comparison reads the actual saved A');

    await page.locator('[data-catalog-page="next"]').click();
    await page.locator('[data-catalog-page="next"]').click();
    await expect(dialog.locator('[data-catalog-page-label]')).toHaveText('Página 3 de 3');
    const pendingB = catalogRadio(page, itemB);
    await pendingB.scrollIntoViewIfNeeded();
    await pendingB.check();
    await directory.uncheck();
    const results = dialog.locator('[data-catalog-results]');
    const scrolledBeforeAdoption = await results.evaluate((element) => element.scrollTop);
    assert.ok(scrolledBeforeAdoption > 0, 'B was selected near the bottom of the long, internally scrolled catalog');
    await page.locator('[data-catalog-page="previous"]').click();
    await page.locator('[data-catalog-page="previous"]').click();
    await expect(dialog.locator('[data-catalog-page-label]')).toHaveText('Página 1 de 3');
    await expect(catalogRadio(page, itemB)).toHaveCount(0,
      'the retained B is intentionally off-page when the saved A is adopted');

    heldRead.gate.release();
    await check;
    await expect(form.locator('[data-owner-comparison]')).toBeVisible();
    await form.locator('[data-owner-adopt]').click();
    await expect(catalogRadio(page, itemB)).toHaveCount(0);
    await expect(directory).toBeFocused();
    await expect(directory).toBeVisible();
    await expect(directory).toBeInViewport();
    const visibleFocus = await directory.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { active: document.activeElement === element, top: rect.top, bottom: rect.bottom, height: window.innerHeight };
    });
    assert.equal(visibleFocus.active, true);
    assert.ok(visibleFocus.top >= 0 && visibleFocus.bottom <= visibleFocus.height,
      'the retained directory choice stays inside the viewport after recovery adoption');
    assert.equal(referenceWrites(capture).length, 1, 'adopting the saved A does not submit B');
    await expect(directory).not.toBeChecked();

    await page.locator('[data-catalog-page="next"]').click();
    await page.locator('[data-catalog-page="next"]').click();
    await expect(catalogRadio(page, itemB)).toBeChecked();
    await directory.focus();
    await addManuallySelectedB(page, capture, itemB);
    await capture.settle({ skipErrorBodies: true });
    const writes = referenceWrites(capture);
    assert.equal(writes.length, 2);
    assert.deepEqual(writes.map(({ body }) => body.resourceId), [itemA.id, itemB.id]);
    assert.deepEqual(writes[1].body, {
      resourceId: itemB.id,
      url: itemB.url,
      profileVersion: before.profile.version + 1,
      selectedForDirectory: false,
    });
    const final = await freshOwner(fixture, cookie);
    assert.equal(final.profile.version, before.profile.version + 2);
    assert.equal(final.links.filter(({ resourceId }) => resourceId === itemA.id).length, 1);
    assert.deepEqual(final.links.filter(({ resourceId }) => resourceId === itemB.id).map(({ url, selectedForDirectory }) => ({ url, selectedForDirectory })), [
      { url: itemB.url, selectedForDirectory: false },
    ]);
    assert.deepEqual(await fixture.rawResource(itemA.id), resourceA);
    assert.deepEqual(await fixture.rawResource(itemB.id), resourceB);
  } finally {
    transport.writeGate.release();
    heldRead?.gate.release();
    await submit?.catch(() => {});
    await check?.catch(() => {});
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
    await removeIndexRoute();
  }
});

test('Referencia A recuperada continúa con una corrección manual de opciones y enfoca el control habilitado', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const item = catalogEntry('phase3-same-a-option', 'Referencia A con opción tardía', 'https://phase3.example/options/a');
  await seedCatalogRecord(fixture, item);
  const removeIndexRoute = await serveSelectionIndex(page, [item]);
  await openLinksWithManagedHistory(page, fixture);
  await openCatalog(page);
  await catalogRadio(page, item).check();
  const referenceForm = page.locator('[data-owner-form="referencia"]');
  const directory = referenceForm.getByRole('checkbox', { name: 'Proponer al directorio', exact: true });
  const before = await fixture.rawOwner(cookie);
  const resourceBefore = await fixture.rawResource(item.id);
  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const transport = await installReferenceTransport(page, { loseReferenceAcknowledgement: true });
  let submit;
  try {
    submit = referenceForm.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    const actualA = await transport.writeArrived.promise;
    assert.equal(actualA.status, 201, 'the real reference handler commits A before its acknowledgement is lost');
    transport.writeGate.release();
    await submit;
    await capture.settle({ skipErrorBodies: true });
    assert.equal(referenceWrites(capture).length, 1);
    assert.equal(referenceWrites(capture)[0].status, 503);

    const read = transport.holdNextRead();
    const check = referenceForm.locator('[data-owner-compare]').click();
    const observed = await read.arrived.promise;
    assert.equal(observed.status, 200);
    assert.equal(observed.body.links.filter(({ resourceId }) => resourceId === item.id).length, 1);
    await directory.uncheck();
    read.gate.release();
    await check;

    const comparison = referenceForm.locator('[data-owner-comparison]');
    await expect(comparison).toBeVisible();
    await expect(comparison).toContainText(item.title);
    await expect(comparison).toContainText(item.url);
    await expect(comparison).toContainText('Opción guardada de la selección actual: Sí | Tu corrección: No',
      'the comparison separates the saved A directory option from the later unchecked choice');
    await referenceForm.locator('[data-owner-adopt]').click();

    const optionsForm = page.locator('[data-owner-dialog] form[data-owner-form="enlace"]');
    await expect(optionsForm).toBeVisible();
    await expect(optionsForm.locator('[data-owner-form-status="enlace"]')).toContainText(
      'Conservamos tu decisión posterior sobre la propuesta',
      'the completion feedback identifies the option that remains unsaved');
    const title = optionsForm.getByLabel('Título', { exact: true });
    const url = optionsForm.getByLabel('URL', { exact: true });
    const option = optionsForm.getByRole('checkbox', { name: 'Proponer al directorio', exact: true });
    await expect(title).toHaveValue(item.title);
    await expect(url).toHaveValue(item.url);
    await expect(title).toBeDisabled();
    await expect(url).toBeDisabled();
    await expect(option).toBeVisible();
    await expect(option).toBeEnabled();
    await expect(option).not.toBeChecked();
    const focusedOption = optionsForm.locator('input[type="checkbox"]:focus');
    await expect(focusedOption,
      'switching to same-A options correction focuses a visible enabled option rather than disabled metadata').toHaveCount(1);
    await expect(focusedOption).toBeVisible();
    await expect(focusedOption).toBeEnabled();

    const afterReference = await freshOwner(fixture, cookie);
    const savedA = afterReference.links.find(({ resourceId }) => resourceId === item.id);
    assert.ok(savedA);
    assert.equal(afterReference.profile.version, before.profile.version + 1);
    assert.equal(await fixture.rawPlacement(cookie, savedA.placementId).then((placement) => placement.selectedForDirectory), true,
      'adopting the recovered snapshot does not persist the local option correction');
    assert.deepEqual(await fixture.rawResource(item.id), resourceBefore);

    await optionsForm.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => optionWrites(capture, savedA.placementId)[0]?.status).toBe(200);
    await capture.settle({ skipErrorBodies: true });
    const patch = optionWrites(capture, savedA.placementId)[0];
    assert.deepEqual(patch.body, {
      profileVersion: afterReference.profile.version,
      placementVersion: savedA.placementVersion,
      resourceVersion: savedA.resourceVersion,
      featured: savedA.featured,
      selectedForDirectory: false,
    }, 'the manual options save uses recovered versions and changes only the placement option');
    assert.equal(referenceWrites(capture).length, 1, 'neither recovery nor options Save repeats A');
    assert.equal(Object.hasOwn(patch.body, 'title'), false);
    assert.equal(Object.hasOwn(patch.body, 'url'), false);
    assert.equal(Object.hasOwn(patch.body, 'description'), false);
    const final = await freshOwner(fixture, cookie);
    assert.equal(final.profile.version, afterReference.profile.version + 1);
    assert.equal(final.links.filter(({ resourceId }) => resourceId === item.id).length, 1);
    assert.equal(final.links.find(({ resourceId }) => resourceId === item.id).selectedForDirectory, false);
    assert.equal(final.editableResources.some(({ id }) => id === item.id), false);
    assert.equal((await fixture.rawPlacement(cookie, savedA.placementId)).version, savedA.placementVersion + 1);
    assert.deepEqual(await fixture.rawResource(item.id), resourceBefore,
      'the reference recovery and options-only continuation never edit shared catalog metadata');
  } finally {
    transport.writeGate.release();
    await submit?.catch(() => {});
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
    await removeIndexRoute();
  }
});

test('restaurar el rol original conserva B y exige comprobar A antes del siguiente envío manual', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const principalBefore = await fixture.principal(cookie);
  const itemA = catalogEntry('session-reference-a', 'Referencia A de sesión', 'https://session.example/a');
  const itemB = catalogEntry('session-reference-b', 'Referencia B de sesión', 'https://session.example/b');
  await seedCatalogRecord(fixture, itemA);
  await seedCatalogRecord(fixture, itemB);
  const removeIndexRoute = await serveSelectionIndex(page, [itemA, itemB]);
  await openLinksWithManagedHistory(page, fixture);
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const before = await freshOwner(fixture, cookie);
  const account = [...fixture.accountStore.accounts.values()][0];
  const capture = await captureCreatorApi(page);
  const transport = await installReferenceTransport(page, { loseReferenceAcknowledgement: true });
  let submit;
  try {
    await openCatalog(page);
    const form = page.locator('[data-owner-form="referencia"]');
    await catalogRadio(page, itemA).check();
    submit = form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    const committed = await transport.writeArrived.promise;
    assert.equal(committed.status, 201);
    await catalogRadio(page, itemB).check();
    const directory = form.getByRole('checkbox', { name: 'Proponer al directorio', exact: true });
    await directory.uncheck();
    transport.writeGate.release();
    await submit;
    await expect(form.locator('[data-owner-compare]')).toBeEnabled();
    const savedA = await freshOwner(fixture, cookie);
    assert.equal(savedA.profile.version, before.profile.version + 1);
    assert.equal(savedA.links.length, 1);
    fixture.accountStore.seedAccount({ ...account, isAdmin: true });
    await form.locator('[data-owner-compare]').click();
    await capture.settle({ skipErrorBodies: true });
    const rejected = capture.records.filter(({ method, path }) => method === 'GET' && path === OWNER_PATH).at(-1);
    assert.equal(rejected.status, 409, 'the real owner GET detects the changed role');
    assert.equal(rejected.responseBody.error, 'SESSION_CONTEXT_CHANGED');
    assert.equal(Object.hasOwn(rejected.responseBody, 'profile'), false);
    await expect(catalogRadio(page, itemB)).toBeChecked();
    await expect(directory).not.toBeChecked();
    await expect(form.getByRole('button', { name: 'Agregar a mi página', exact: true })).toBeDisabled();
    const sessionCheck = page.locator('[data-owner-dialog] [data-session-recovery-check]');
    await expect(sessionCheck).toBeEnabled();
    // Returning to the original role and renewing the cookie is external auth
    // setup. All session checking/content recovery/saving uses native UI.
    fixture.accountStore.seedAccount(account);
    const renewed = await fixture.login();
    await addCookie(page.context(), fixture, renewed);
    const ownerReads = capture.records.filter(({ method, path }) => method === 'GET' && path === OWNER_PATH).length;
    const sessionRequest = page.waitForRequest((request) => request.method() === 'GET'
      && new URL(request.url()).pathname.replace(/\/$/u, '') === '/api/creador/sesion');
    await sessionCheck.click();
    const checkedRequest = await sessionRequest;
    assert.equal(checkedRequest.headers()['x-creator-page-binding'],
      // The opaque marker is independently derived from the original authority.
      creatorPageSessionBinding(principalBefore));
    await expect(sessionCheck).toHaveCount(0);
    await capture.settle({ skipErrorBodies: true });
    assert.equal(capture.records.filter(({ method, path }) => method === 'GET' && path === OWNER_PATH).length, ownerReads,
      'session restoration does not perform the separate content check');
    assert.equal(referenceWrites(capture).length, 1);
    assert.equal((await freshOwner(fixture, renewed)).profile.version, savedA.profile.version);
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);
    await expect(catalogRadio(page, itemB)).toBeChecked();
    await expect(directory).not.toBeChecked();
    await expect(form.getByRole('button', { name: 'Agregar a mi página', exact: true })).toBeDisabled();
    await expect(form.locator('[data-owner-compare]')).toBeEnabled();
    await form.locator('[data-owner-compare]').click();
    await expect(form.locator('[data-owner-adopt]')).toBeEnabled();
    assert.equal(referenceWrites(capture).length, 1, 'content comparison is also read-only');
    await form.locator('[data-owner-adopt]').click();
    await addManuallySelectedB(page, capture, itemB);
    await capture.settle({ skipErrorBodies: true });
    assert.deepEqual(referenceWrites(capture)[1].body, {
      resourceId: itemB.id, url: itemB.url, profileVersion: savedA.profile.version, selectedForDirectory: false,
    });
    const final = await freshOwner(fixture, renewed);
    assert.equal(final.profile.version, savedA.profile.version + 1);
    assert.equal(final.links.filter(({ resourceId }) => resourceId === itemA.id).length, 1);
    assert.equal(final.links.filter(({ resourceId }) => resourceId === itemB.id).length, 1);
    assert.equal(final.links.find(({ resourceId }) => resourceId === itemB.id).selectedForDirectory, false);
    assert.equal(final.editableResources.some(({ id }) => id === itemA.id || id === itemB.id), false);
    assert.equal(referenceWrites(capture).length, 2, 'only the initial A and later manual B were sent');
  } finally {
    fixture.accountStore.seedAccount(account);
    transport.writeGate.release();
    await submit?.catch(() => {});
    await transport.close();
    await removeIndexRoute();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('un no-op de referencia usa la versión canónica y guarda la opción tardía de A', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const item = catalogEntry('phase8-canonical-noop', 'Ficha antes', 'https://phase8.example/canonical/noop');
  await seedCatalogRecord(fixture, item);
  const saved = await seedReferencePlacement(fixture, cookie, item, true);
  const removeIndexRoute = await serveSelectionIndex(page, [item]);
  await openLinksWithManagedHistory(page, fixture);
  await openCatalog(page);
  await catalogRadio(page, item).check();

  const resource = await fixture.rawResource(item.id);
  assert.equal(await fixture.creatorStore.transact({
    checks: [{ key: `resource:${item.id}`, version: resource.version }],
    puts: [{ key: `resource:${item.id}`, value: { ...resource, title: 'Ficha después', version: resource.version + 1 } }],
  }), true);
  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const transport = await installReferenceTransport(page, { loseReferenceAcknowledgement: false });
  try {
    const form = page.locator('[data-owner-form="referencia"]');
    const submit = form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    const actual = await transport.writeArrived.promise;
    assert.equal(actual.status, 200);
    assert.equal(actual.body.created, false, 'the already-present exact resource returns a confirmed no-op');
    assert.equal(actual.body.link.placementId, saved.link.placementId);
    assert.equal(actual.body.link.resourceVersion, resource.version + 1);
    assert.equal(actual.body.link.title, 'Ficha después');
    await form.getByRole('checkbox', { name: 'Proponer al directorio', exact: true }).uncheck();
    transport.writeGate.release();
    await submit;

    const options = page.locator('[data-owner-dialog] form[data-owner-form="enlace"]');
    const directory = options.getByRole('checkbox', { name: 'Proponer al directorio', exact: true });
    await expect(options).toBeVisible();
    await expect(options.getByLabel('Título', { exact: true })).toHaveValue('Ficha después');
    await expect(directory).not.toBeChecked();
    await options.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => optionWrites(capture, saved.link.placementId)[0]?.status).toBe(200);
    const patch = optionWrites(capture, saved.link.placementId)[0];
    assert.equal(patch.body.resourceVersion, resource.version + 1,
      'manual options save uses the canonical resource version returned by the no-op');
    assert.equal(patch.body.selectedForDirectory, false);
    assert.equal(Object.hasOwn(patch.body, 'title'), false, 'the options continuation cannot edit shared metadata');
    assert.equal(referenceWrites(capture).length, 1, 'the confirmed no-op is not replayed');

    const final = await freshOwner(fixture, cookie);
    assert.equal(final.links.length, 1);
    assert.equal(final.links[0].placementId, saved.link.placementId);
    assert.equal(final.links[0].selectedForDirectory, false);
    assert.equal(final.links[0].resourceVersion, resource.version + 1);
    assert.equal(final.editableResources.some(({ id }) => id === item.id), false);
    assert.equal((await fixture.rawResource(item.id)).title, 'Ficha después');
  } finally {
    transport.writeGate.release();
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
    await removeIndexRoute();
  }
});

test('la opción tardía igual al valor guardado conserva la guarda ante Cancelar y navegación nativa', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const item = catalogEntry('phase8-equal-option-guard', 'Referencia con opción previa', 'https://phase8.example/guard/equal');
  await seedCatalogRecord(fixture, item);
  const saved = await seedReferencePlacement(fixture, cookie, item, false);
  const removeIndexRoute = await serveSelectionIndex(page, [item]);
  await openLinksWithManagedHistory(page, fixture);
  await openCatalog(page);
  await catalogRadio(page, item).check();
  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const transport = await installReferenceTransport(page, { loseReferenceAcknowledgement: false });
  let submit;
  let pendingBack;
  try {
    const reference = page.locator('[data-owner-form="referencia"]');
    submit = reference.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    const actual = await transport.writeArrived.promise;
    assert.equal(actual.status, 200);
    assert.equal(actual.body.created, false);
    assert.equal(actual.body.link.selectedForDirectory, false);
    await reference.getByRole('checkbox', { name: 'Proponer al directorio', exact: true }).uncheck();
    transport.writeGate.release();
    await submit;

    const options = page.locator('[data-owner-dialog] form[data-owner-form="enlace"]');
    await expect(options).toBeVisible();
    await expect(options.getByRole('checkbox', { name: 'Proponer al directorio', exact: true })).not.toBeChecked();
    await expect(options.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
    await options.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const prompt = page.locator('[data-owner-exit-prompt]');
    await expect(prompt).toBeVisible();
    await expect(prompt.getByRole('button', { name: 'Guardar y salir', exact: true })).toBeEnabled();
    await expect(prompt.getByRole('button', { name: 'Descartar cambios', exact: true })).toBeEnabled();
    await expect(prompt.getByRole('button', { name: 'Seguir editando', exact: true })).toBeEnabled();
    await prompt.getByRole('button', { name: 'Seguir editando', exact: true }).click();
    await expect(options).toBeVisible();

    const guardedUrl = page.url();
    pendingBack = page.goBack();
    await expect(prompt).toBeVisible();
    await expect(page).toHaveURL(guardedUrl, 'native Back waits for an explicit decision about the late option');
    await prompt.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
    await pendingBack;
    await expect(page).not.toHaveURL(guardedUrl);
    await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
    assert.equal(referenceWrites(capture).length, 1, 'Cancel and navigation do not repeat the reference');
    assert.equal(optionWrites(capture, saved.link.placementId).length, 0, 'discarding the late decision sends no option write');
    const persisted = await freshOwner(fixture, cookie);
    assert.equal(persisted.links.length, 1);
    assert.equal(persisted.links[0].selectedForDirectory, false);
    assert.equal(persisted.links[0].placementVersion, saved.link.placementVersion);
  } finally {
    transport.writeGate.release();
    await submit?.catch(() => {});
    await pendingBack?.catch(() => {});
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
    await removeIndexRoute();
  }
});

test('el par rechazado sigue deshabilitado al cerrar y volver a abrir un índice atrasado', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const oldA = catalogEntry('phase8-quarantined-a', 'Referencia A desactualizada', 'https://phase8.example/quarantine/old');
  const currentA = { ...oldA, url: 'https://phase8.example/quarantine/current' };
  await seedCatalogRecord(fixture, currentA);
  let indexReads = 0;
  await page.route('**/catalog-selection.json', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    indexReads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([oldA]) });
  });
  const capture = await captureCreatorApi(page);
  try {
    await openLinksWithManagedHistory(page, fixture);
    await openCatalog(page);
    const firstRadio = catalogRadio(page, oldA);
    await firstRadio.check();
    const form = page.locator('[data-owner-form="referencia"]');
    await form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    await expect.poll(() => referenceWrites(capture)[0]?.status).toBe(409);
    assert.equal(referenceWrites(capture)[0].responseBody.error, 'RESOURCE_CONFLICT');
    await form.getByRole('button', { name: 'Actualizar catálogo', exact: true }).click();
    await expect.poll(() => indexReads).toBe(2);
    await expect(catalogRadio(page, oldA)).toBeDisabled();
    await expect(catalogRadio(page, oldA)).not.toBeChecked();
    await expect(form.getByRole('button', { name: 'Actualizar catálogo', exact: true })).toBeVisible();
    await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const prompt = page.locator('[data-owner-exit-prompt]');
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
    await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();

    await openCatalog(page);
    const reopened = catalogRadio(page, oldA);
    await expect(reopened).toBeVisible();
    await expect(reopened).toBeDisabled();
    await expect(reopened).not.toBeChecked();
    await expect(page.locator('[data-owner-form="referencia"]').getByRole('button', { name: 'Actualizar catálogo', exact: true })).toBeVisible();
    await expect(page.locator('[data-owner-form="referencia"] [data-catalog-reference]')).toBeDisabled();
    await expect.poll(() => referenceWrites(capture).length).toBe(1);
    assert.equal(indexReads, 2, 'reopening uses the cached lagging index and retains the exact-pair quarantine');
    assert.equal((await freshOwner(fixture, cookie)).links.length, 0);
  } finally {
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

for (const [race, retainA] of [['profile', false], ['profile', true], ['resource-url', false]]) {
  test(`el conflicto de referencia por ${race} conserva la selección ${retainA ? 'original A' : 'posterior B'}`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const suffix = race === 'profile' ? 'profile-race' : 'resource-race';
    const itemA = catalogEntry(`phase8-${suffix}-a`, `Referencia A ${suffix}`, `https://phase8.example/${suffix}/a`);
    const itemB = catalogEntry(`phase8-${suffix}-b`, `Referencia B ${suffix}`, `https://phase8.example/${suffix}/b`);
    await seedCatalogRecord(fixture, itemA);
    await seedCatalogRecord(fixture, itemB);
    const manualTarget = retainA ? itemA : itemB;
    let indexReads = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/catalog-selection.json') indexReads += 1;
    });
    const removeIndexRoute = await serveSelectionIndex(page, [itemA, itemB]);
    const store = fixture.creatorStore;
    const transact = store.transact.bind(store);
    let conflictInjected = false;
    store.transact = async (transaction) => {
      if (!conflictInjected && transaction.puts?.some(({ value }) => value.recordType === 'placement' && value.resourceId === itemA.id)) {
        conflictInjected = true;
        if (race === 'profile') {
          const { profile } = await fixture.rawOwner(cookie);
          const changed = await fixture.request(cookie, OWNER_PATH, { method: 'PUT', body: {
            displayName: 'Nombre concurrente', version: profile.version,
          } });
          assert.equal(changed.status, 200, JSON.stringify(await changed.clone().json()));
        } else {
          const resource = await fixture.rawResource(itemA.id);
          const { currentUrlKey, currentUrlReservation } = await import('../../src/lib/catalog-url.mjs');
          const oldKey = currentUrlKey(itemA.url);
          const updated = { ...resource, url: `${itemA.url}/new`, version: resource.version + 1 };
          const newKey = currentUrlKey(updated.url);
          assert.equal(await transact({
            checks: [{ key: `resource:${itemA.id}`, version: resource.version }, { key: oldKey, version: 1 }, { key: newKey, version: null }],
            puts: [{ key: `resource:${itemA.id}`, value: updated }, { key: newKey, value: currentUrlReservation(updated.url, itemA.id) }],
            deletes: [oldKey],
          }), true);
        }
      }
      return transact(transaction);
    };
    const capture = await captureCreatorApi(page, { skipErrorBodies: true });
    const transport = await installReferenceTransport(page, { loseReferenceAcknowledgement: false });
    let submit;
    try {
      await openLinksWithManagedHistory(page, fixture);
      await openCatalog(page);
      const form = page.locator('[data-owner-form="referencia"]');
      await catalogRadio(page, itemA).check();
      submit = form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
      const actual = await transport.writeArrived.promise;
      assert.equal(actual.status, 409);
      assert.equal(conflictInjected, true);
      const expectedCode = race === 'resource-url' ? 'RESOURCE_CONFLICT' : 'LINK_CONFLICT';
      assert.equal(actual.body.error, expectedCode,
        'only a confirmed resource/URL-reservation loss rejects the exact catalog pair');
      if (!retainA) await catalogRadio(page, itemB).check();
      await form.getByRole('checkbox', { name: 'Proponer al directorio', exact: true }).uncheck();
      transport.writeGate.release();
      await submit;
      await expect.poll(() => referenceWrites(capture)[0]?.status).toBe(409);
      if (race === 'resource-url') {
        await expect(form.getByRole('button', { name: 'Actualizar catálogo', exact: true })).toBeVisible();
        await form.getByRole('button', { name: 'Actualizar catálogo', exact: true }).click();
        await expect(catalogRadio(page, manualTarget)).toBeChecked();
        await expect(catalogRadio(page, itemA)).toBeDisabled();
      } else {
        await expect(form.getByRole('button', { name: 'Actualizar catálogo', exact: true })).toHaveCount(0,
          'a profile-only loss does not invalidate a still-current catalog pair');
        await expect(catalogRadio(page, manualTarget)).toBeChecked();
      }
      if (race === 'profile') {
        await form.locator('[data-owner-compare]').click();
        await expect(form.locator('[data-owner-adopt]')).toBeEnabled();
        await form.locator('[data-owner-adopt]').click();
        await expect(catalogRadio(page, manualTarget)).toBeChecked();
      }
      await expect(form.getByRole('checkbox', { name: 'Proponer al directorio', exact: true })).not.toBeChecked();
      assert.equal(referenceWrites(capture).length, 1, 'comparison and adoption do not replay the failed reference');
      assert.equal((await freshOwner(fixture, cookie)).links.length, 0);
      await form.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
      await expect.poll(() => referenceWrites(capture)[1]?.status).toBe(201);
      assert.deepEqual(referenceWrites(capture)[1].body, {
        resourceId: manualTarget.id, url: manualTarget.url, profileVersion: (await freshOwner(fixture, cookie)).profile.version - 1,
        selectedForDirectory: false,
      });
      const final = await freshOwner(fixture, cookie);
      assert.equal(final.links.length, 1);
      assert.equal(final.links[0].resourceId, manualTarget.id);
      assert.equal(final.links[0].selectedForDirectory, false);
      assert.equal(final.editableResources.some(({ id }) => id === itemA.id || id === itemB.id), false);
      assert.equal(referenceWrites(capture).length, 2);
      assert.equal(referenceWrites(capture).filter(({ body }) => body.resourceId === itemA.id).length, retainA ? 2 : 1);
      assert.equal(indexReads, race === 'profile' ? 1 : 2);
    } finally {
      store.transact = transact;
      transport.writeGate.release();
      await submit?.catch(() => {});
      await transport.close();
      await capture.stop({ skipErrorBodies: true }).catch(() => {});
      await removeIndexRoute();
    }
  });
}

async function loginReferenceActor(fixture, sub, isAdmin = false) {
  const email = `${sub}@example.invalid`;
  if (isAdmin) fixture.accountStore.seedAccount(makeAccount({ identity: makeIdentity({ sub }), email, isAdmin: true }));
  const oldClaims = fixture.accountHarness.state.oidc.claims;
  fixture.accountHarness.state.oidc.claims = { sub, email };
  try {
    return await fixture.login();
  } finally {
    fixture.accountHarness.state.oidc.claims = oldClaims;
  }
}

async function grantReferenceEditorship(fixture, cookie, item) {
  const claim = await fixture.request(cookie, '/api/creador/reclamaciones', {
    method: 'POST', body: { resources: [{ resourceId: item.id, url: item.url }] },
  });
  assert.equal(claim.status, 202, JSON.stringify(await claim.clone().json()));
  const admin = await loginReferenceActor(fixture, 'reference-journey-admin', true);
  const editor = await fixture.principal(cookie);
  const grant = await fixture.request(admin, '/api/admin/reclamaciones/vincular', {
    method: 'POST', body: { accountId: editor.accountId, resourceIds: [item.id] },
  });
  assert.equal(grant.status, 200, JSON.stringify(await grant.clone().json()));
}

test('una referencia existente usa la URL vigente y permite guardar opciones después de un traslado', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const item = catalogEntry('review-moved-noop', 'Ficha importada', 'https://review.example/existing-old?literal=1');
  const moved = {...item, url: 'https://review-new.example/existing-new?literal=2/'};
  await seedCatalogRecord(fixture, item);
  const saved = await seedReferencePlacement(fixture, cookie, item, true);

  const editorCookie = await loginReferenceActor(fixture, 'reference-url-editor');
  const create = await fixture.request(editorCookie, OWNER_PATH, {
    method: 'PUT', body: { displayName: 'URL editor', slug: 'url-editor', socials: {} },
  });
  assert.equal(create.status, 200, JSON.stringify(await create.clone().json()));
  await grantReferenceEditorship(fixture, editorCookie, item);

  await openLinksWithManagedHistory(page, fixture);
  await expect(page.locator('[data-link-row]').filter({ hasText: item.title })).toContainText('review.example');
  const otherOwner = await freshOwner(fixture, editorCookie);
  const grantPlacement = otherOwner.links.find(({resourceId}) => resourceId === item.id);
  const change = await fixture.request(editorCookie, `/api/creador/enlaces/${grantPlacement.placementId}/editar`, { method: 'PATCH', body: {
    profileVersion: otherOwner.profile.version,
    placementVersion: grantPlacement.placementVersion,
    resourceVersion: grantPlacement.resourceVersion,
    url: moved.url,
  }});
  assert.equal(change.status, 200, JSON.stringify(await change.clone().json()));

  const removeIndexRoute = await serveSelectionIndex(page, [moved]);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const transport = await installReferenceTransport(page, { loseReferenceAcknowledgement: false });
  try {
    await openCatalog(page);
    const reference = page.locator('[data-owner-form="referencia"]');
    await catalogRadio(page, moved).check();
    await reference.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    const actual = await transport.writeArrived.promise;
    assert.equal(actual.status, 200);
    assert.equal(actual.body.created, false);
    assert.deepEqual(actual.body.versionChanges, []);
    assert.equal(actual.body.link.placementId, saved.link.placementId);
    assert.equal(actual.body.link.url, moved.url);
    assert.ok(actual.body.link.resourceVersion > saved.link.resourceVersion);
    await reference.getByRole('checkbox', { name: 'Proponer al directorio', exact: true }).uncheck();
    transport.writeGate.release();
    const options = page.locator('[data-link-edit-form]');
    await expect(options).toBeVisible();
    await expect(options.getByLabel('URL', { exact: true })).toHaveValue(moved.url);
    await expect(options.getByLabel('URL', { exact: true })).toBeDisabled();
    await expect(options.getByRole('checkbox', { name: 'Proponer al directorio', exact: true })).not.toBeChecked();
    assert.equal(capture.records.filter(({ method }) => method === 'GET').length, 0);
    assert.equal(optionWrites(capture, saved.link.placementId).length, 0);
    const canonicalResource = await fixture.rawResource(item.id);
    const beforeSave = await freshOwner(fixture, cookie);
    assert.equal(beforeSave.links[0].selectedForDirectory, true);
    await options.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => optionWrites(capture, saved.link.placementId)[0]?.status).toBe(200);
    assert.deepEqual(optionWrites(capture, saved.link.placementId)[0].body, {
      profileVersion: beforeSave.profile.version, placementVersion: saved.link.placementVersion,
      resourceVersion: actual.body.link.resourceVersion, featured: false, selectedForDirectory: false,
    });
    const persisted = await freshOwner(fixture, cookie);
    assert.deepEqual(persisted.links.map(({ resourceId, url, selectedForDirectory }) => ({ resourceId, url, selectedForDirectory })),
      [{ resourceId: item.id, url: moved.url, selectedForDirectory: false }]);
    assert.equal(persisted.editableResources.length, 0);
    assert.deepEqual(await fixture.rawResource(item.id), canonicalResource);
    assert.equal(referenceWrites(capture).length, 1);
    assert.equal(optionWrites(capture, saved.link.placementId).length, 1);
  } finally {
    await transport.close();
    await capture.stop({ skipErrorBodies: true });
    await removeIndexRoute();
  }
});


test('retirar y reincorporar tras una referencia confirmada usa la versión vigente de la ficha propia', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const item = catalogEntry('review-owned-reattach', 'Ficha propia importada', 'https://retained-old.review.example/legacy');
  const moved = { ...item, title: 'Ficha propia actual', url: 'https://retained-new.review.example/current' };
  await seedCatalogRecord(fixture, item);
  await grantReferenceEditorship(fixture, cookie, item);

  const initial = await freshOwner(fixture, cookie);
  const placement = initial.links.find(({resourceId}) => resourceId === item.id);
  const remove = await fixture.request(cookie, `/api/creador/enlaces/${placement.placementId}`, { method: 'DELETE', body: { profileVersion: initial.profile.version } });
  assert.equal(remove.status, 204);
  const retired = await freshOwner(fixture, cookie);
  await openLinksWithManagedHistory(page, fixture);
  const retained = page.locator(`[data-retained-resource="${item.id}"]`);
  await expect(retained).toContainText('retained-old.review.example');

  const change = await fixture.request(cookie, `/api/creador/recursos/${item.id}`, { method: 'PATCH', body: {
    version: retired.editableResources[0].version,
    title: moved.title,
    url: moved.url,
  }});
  assert.equal(change.status, 200, JSON.stringify(await change.clone().json()));
  const changed = await freshOwner(fixture, cookie);
  assert.equal(changed.profile.version, retired.profile.version);
  assert.equal(changed.editableResources[0].url, moved.url);

  const removeIndexRoute = await serveSelectionIndex(page, [moved]);
  const capture = await captureCreatorApi(page);
  try {
    await openCatalog(page);
    await catalogRadio(page, moved).check();
    await page.locator('[data-owner-form="referencia"]').getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    await expect.poll(() => referenceWrites(capture)[0]?.status).toBe(201);
    assert.equal(referenceWrites(capture)[0].responseBody.link.url, moved.url);
    const row = page.locator(`[data-link-row="${placement.placementId}"]`);
    await expect(row).toContainText('retained-new.review.example');
    await expect(retained).not.toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    await expect.poll(() => capture.writes().find(({method}) => method === 'DELETE')?.status).toBe(204);
    await expect(retained).toContainText('retained-new.review.example');
    await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
    const readds = () => capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/enlaces');
    await expect.poll(() => readds()[0]?.status).toBe(201);
    assert.deepEqual(readds()[0].body, { resourceId: item.id, resourceVersion: changed.editableResources[0].version });
    const final = await freshOwner(fixture, cookie);
    assert.deepEqual(final.links.map(({ placementId, resourceId, title, url, series }) => ({ placementId, resourceId, title, url, series })),
      [{ placementId: placement.placementId, resourceId: item.id, title: moved.title, url: moved.url, series: [] }]);
    assert.deepEqual(final.editableResources, changed.editableResources);
    assert.equal(referenceWrites(capture).length, 1);
    assert.equal(readds().length, 1);
  } finally {
    await capture.stop({skipErrorBodies:true});
    await removeIndexRoute();
  }
});

for (const { removalTiming, guarded } of [
  { removalTiming: 'before the request', guarded: false },
  { removalTiming: 'before the request', guarded: true },
  { removalTiming: 'during the transaction', guarded: false },
  { removalTiming: 'during the transaction', guarded: true },
]) {
  test(`reference options removed ${removalTiming} permit a separate manual reference (${guarded ? 'guarded Back' : 'editor'})`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const itemA = catalogEntry('phase9-removed-reference-a', 'Referencia A retirada', 'https://phase9.example/removed/a');
    const itemB = catalogEntry('phase9-manual-reference-b', 'Referencia B manual', 'https://phase9.example/manual/b');
    await seedCatalogRecord(fixture, itemA);
    await seedCatalogRecord(fixture, itemB);
    await grantReferenceEditorship(fixture, cookie, itemA);
    const initial = await freshOwner(fixture, cookie);
    const placement = initial.links.find(({ resourceId }) => resourceId === itemA.id);
    assert.ok(placement, 'the granted resource has its original exact placement');
    const resourceBefore = await fixture.rawResource(itemA.id);

    const removeIndexRoute = await serveSelectionIndex(page, [itemA, itemB]);
    const capture = await captureCreatorApi(page);
    const transport = await installReferenceTransport(page, { loseReferenceAcknowledgement: false });
    let submit;
    let removed;
    const store = fixture.creatorStore;
    const transact = store.transact;
    const removePlacement = () => fixture.request(cookie, `/api/creador/enlaces/${placement.placementId}`, {
      method: 'DELETE', body: { profileVersion: initial.profile.version },
    });
    try {
      await openLinksWithManagedHistory(page, fixture);
      await openCatalog(page);
      const reference = page.locator('[data-owner-form="referencia"]');
      await catalogRadio(page, itemA).check();
      submit = reference.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
      const actual = await transport.writeArrived.promise;
      assert.equal(actual.status, 200);
      assert.equal(actual.body.created, false, 'the original reference is an actual no-op');
      assert.equal(actual.body.link.placementId, placement.placementId);
      await reference.getByRole('checkbox', { name: 'Proponer al directorio', exact: true }).uncheck();
      transport.writeGate.release();
      await submit;

      const options = page.locator('[data-owner-dialog] form[data-owner-form="enlace"]');
      await expect(options).toBeVisible();
      const duringTransaction = removalTiming === 'during the transaction';
      if (duringTransaction) {
        store.transact = async function (command, ...args) {
          if (!removed && command.puts?.some(({ value }) => value.recordType === 'placement' && value.id === placement.placementId)) {
            removed = await removePlacement();
          }
          return transact.call(this, command, ...args);
        };
      } else {
        removed = await removePlacement();
      }
      await options.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
      await expect.poll(() => optionWrites(capture, placement.placementId)[0]?.status).toBe(duringTransaction ? 409 : 404);
      assert.equal(optionWrites(capture, placement.placementId)[0].responseBody.error,
        duringTransaction ? 'LINK_CONFLICT' : 'PLACEMENT_NOT_FOUND');
      assert.equal(removed?.status, 204, 'the real removal wins before the options write');
      const afterRemoval = await freshOwner(fixture, cookie);
      assert.equal(afterRemoval.profile.version, initial.profile.version + 1);
      assert.equal(afterRemoval.links.some(({ resourceId }) => resourceId === itemA.id), false);
      const originalUrl = page.url();
      const pendingBack = guarded ? page.goBack() : undefined;
      const exit = page.locator('[data-owner-exit-prompt]');
      const recovery = guarded ? exit : options;
      await expect(recovery.locator('[data-owner-compare]')).toBeVisible();
      await recovery.locator('[data-owner-compare]').click();
      await expect(recovery).toContainText('La colocación ya no está en tu página');
      await expect(recovery.locator('[data-owner-adopt]')).toBeEnabled();
      await recovery.locator('[data-owner-adopt]').click();
      await pendingBack;
      await expect(exit).toHaveCount(0);
      await expect(page).toHaveURL(originalUrl);
      assert.deepEqual(await freshOwner(fixture, cookie), afterRemoval, 'adoption leaves the removed placement absent');

      const nextReference = page.locator('[data-owner-dialog] form[data-owner-form="referencia"]');
      await expect(nextReference).toBeVisible();
      await expect(catalogRadio(page, itemA)).toBeChecked();
      const directory = nextReference.getByRole('checkbox', { name: 'Proponer al directorio', exact: true });
      await expect(directory).not.toBeChecked();
      assert.equal(referenceWrites(capture).length, 1, 'comparison and adoption do not replay the old reference');
      assert.equal(optionWrites(capture, placement.placementId).length, 1, 'the missing options PATCH is not retried');

      await catalogRadio(page, itemB).check();
      const manual = page.waitForResponse((response) => response.request().method() === 'POST'
        && new URL(response.url()).pathname.replace(/\/$/u, '') === REFERENCE_PATH && response.status() === 201);
      await nextReference.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
      const savedB = await manual;
      assert.equal(savedB.request().postDataJSON().resourceId, itemB.id);
      assert.equal(savedB.request().postDataJSON().profileVersion, afterRemoval.profile.version);

      const final = await freshOwner(fixture, cookie);
      assert.deepEqual(final.links.map(({ resourceId, url, selectedForDirectory }) => ({ resourceId, url, selectedForDirectory })), [
        { resourceId: itemB.id, url: itemB.url, selectedForDirectory: false },
      ]);
      assert.deepEqual(await fixture.rawResource(itemA.id), resourceBefore, 'the removed reference does not alter shared metadata');
      assert.equal(final.editableResources.some(({ id }) => id === itemA.id), true,
        'the saved removal preserves the exact existing edit authority');
      assert.equal(referenceWrites(capture).length, 2, 'only the original no-op and the separately chosen B reference were submitted');
      await expect(page).toHaveURL(originalUrl);
    } finally {
      store.transact = transact;
      transport.writeGate.release();
      await submit?.catch(() => {});
      await transport.close();
      await capture.stop({ skipErrorBodies: true }).catch(() => {});
      await removeIndexRoute();
    }
  });
}

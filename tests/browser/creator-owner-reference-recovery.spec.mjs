import assert from 'node:assert/strict';
import { seedResource } from '../fixtures/creator-pages.mjs';
import {
  test, expect, captureCreatorApi, loggedInOwner,
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

async function serveSelectionIndex(page, entries) {
  const handler = async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(entries) });
  };
  await page.route('**/catalog-selection.json', handler);
  return () => page.unroute('**/catalog-selection.json', handler).catch(() => {});
}

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
        await expect(form.locator('[data-owner-compare]')).toBeEnabled();
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
      'Conservamos el cambio de propuesta para que lo guardes en opciones',
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

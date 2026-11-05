import assert from 'node:assert/strict';
import {
  test, expect, api, addLink, addChapter, createSeries, createProfile, captureCreatorApi, loggedInOwner, openSeriesView,
} from '../fixtures/creator-browser-test.mjs';
import { completeLogin, cookiePair, makeAccount, makeIdentity } from '../fixtures/account-auth.mjs';

const OWNER_PATH = '/api/creador/perfil';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function linkFilters(page) {
  return page.locator('form[data-link-filters]');
}

function chapterFilters(page) {
  return page.locator('form[data-series-chapter-filters]');
}

function linkEditForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="enlace"]');
}

function profileForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
}

function addLinkForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="alta-enlace"]');
}

function writesTo(capture, method, path) {
  return capture.writes().filter((write) => write.method === method && write.path === path);
}

async function openLinksView(page, fixture, query = '') {
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces${query}`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
}

async function signInOtherOwner(fixture) {
  const sub = 'phase2-list-wrong-owner';
  const email = 'phase2-other@example.invalid';
  const identity = makeIdentity({ sub });
  fixture.accountStore.seedAccount(makeAccount({ identity, email }));
  const oldClaims = fixture.accountHarness.state.oidc.claims;
  fixture.accountHarness.state.oidc.claims = { sub, email };
  try {
    const login = await completeLogin(fixture.accountHarness);
    assert.equal(login.response.status, 303, 'the second owner uses the real account callback');
    assert.ok(login.sessionCookie);
    return { pair: cookiePair(login.sessionCookie) };
  } finally {
    if (oldClaims === undefined) delete fixture.accountHarness.state.oidc.claims;
    else fixture.accountHarness.state.oidc.claims = oldClaims;
  }
}

async function installListTransport(page, { writeMethod, writePath, readResponses = [] }) {
  const writeArrived = deferred();
  const writeGate = deferred();
  const writeFinished = deferred();
  const reads = readResponses.map((response) => ({
    ...response,
    arrived: deferred(),
    gate: deferred(),
    finished: deferred(),
  }));
  let writeSeen = false;
  let readIndex = 0;
  let actualWrite;
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (!writeSeen && request.method() === writeMethod && pathname === writePath) {
      writeSeen = true;
      try {
        const response = await route.fetch();
        actualWrite = { status: response.status(), headers: response.headers(), body: request.postDataJSON() };
        writeArrived.resolve();
        await writeGate.promise;
        await route.abort('failed');
      } finally {
        writeFinished.resolve();
      }
      return;
    }
    if (request.method() === 'GET' && pathname === OWNER_PATH && readIndex < reads.length) {
      const index = readIndex++;
      const control = reads[index];
      try {
        const response = await route.fetch();
        const rawBody = await response.body();
        let body;
        try { body = JSON.parse(rawBody.toString('utf8')); } catch { body = undefined; }
        control.actual = { status: response.status(), body };
        control.arrived.resolve(control.actual);
        if (control.hold) await control.gate.promise;
        if (control.kind === 'status') {
          await route.fulfill({ response, status: control.status, body: rawBody });
        } else if (control.kind === 'malformed') {
          const headers = { ...response.headers(), 'content-type': 'application/json' };
          delete headers['content-length'];
          await route.fulfill({ status: response.status(), headers, body: JSON.stringify({ ...body, links: null }) });
        } else if (control.body) {
          const headers = { ...response.headers(), 'content-type': 'application/json' };
          delete headers['content-length'];
          await route.fulfill({ status: response.status(), headers, body: JSON.stringify(control.body) });
        } else {
          await route.fulfill({ response, body: rawBody });
        }
      } finally {
        control.finished.resolve();
      }
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', handler);
  return {
    get actualWrite() { return actualWrite; },
    get readCount() { return readIndex; },
    writeArrived,
    writeGate,
    read(index) { return reads[index]; },
    async close() {
      writeGate.resolve();
      for (const control of reads) control.gate.resolve();
      await Promise.all([
        ...(writeSeen ? [writeFinished.promise] : []),
        ...reads.slice(0, readIndex).map(({ finished }) => finished.promise),
      ]);
      await page.unroute('**/api/creador/**', handler).catch(() => {});
    },
  };
}

test('Enlaces conserva la búsqueda y página elegidas durante una lectura real y normaliza sólo el filtro de una serie eliminada', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const removedSeries = await createSeries(fixture, cookie, { name: 'Serie que desaparece', slug: 'serie-desaparece-lista' });
  const links = [];
  for (let index = 1; index <= 27; index += 1) {
    links.push(await addLink(fixture, cookie, {
      title: `Phase2 recuperación de lista ${String(index).padStart(2, '0')}`,
      url: `https://phase2-list.example/${index}`,
    }));
  }
  for (const link of links) await addChapter(fixture, cookie, removedSeries.id, link.placementId);
  const target = links[0];
  const beforeRemove = await fixture.rawOwner(cookie);
  await openLinksView(page, fixture, `&serie=${encodeURIComponent(removedSeries.id)}`);
  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const removePath = `/api/creador/enlaces/${target.placementId}`;
  const transport = await installListTransport(page, {
    writeMethod: 'DELETE', writePath: removePath, readResponses: [{ kind: 'actual', hold: true }],
  });
  let removeClick;
  try {
    page.once('dialog', (dialog) => dialog.accept());
    removeClick = page.locator(`[data-link-row="${target.placementId}"]`)
      .getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    await transport.writeArrived.promise;
    assert.equal(transport.actualWrite.status, 204, 'the real owner DELETE commits before its acknowledgement is dropped');
    assert.equal(await fixture.rawPlacement(cookie, target.placementId), null);
    const sendingHref = page.url();
    await page.locator('[data-link-page]').filter({ hasText: 'Siguiente' }).click();
    await expect(page).toHaveURL(sendingHref);
    await expect(page.locator('[data-owner-exit-prompt]')).toHaveCount(0,
      'pagination during an active write keeps the existing wait behavior without opening a discard prompt');
    await expect(page.locator('[data-owner-status]')).toContainText(/Estamos guardando la acción iniciada/i);
    transport.writeGate.resolve();
    await removeClick;
    await expect(page.getByRole('button', { name: 'Comprobar', exact: true })).toBeVisible();

    const ownerAfterRemove = await fixture.rawOwner(cookie);
    const deleteSeries = await api(fixture, cookie, `/api/creador/series/${removedSeries.id}`, {
      method: 'DELETE', body: { version: removedSeries.version, profileVersion: ownerAfterRemove.profile.version },
    });
    assert.equal(deleteSeries.response.status, 204, 'the concurrent series removal uses the real creator API');

    const checkClick = page.getByRole('button', { name: 'Comprobar', exact: true }).click();
    const actualRead = await transport.read(0).arrived.promise;
    assert.equal(actualRead.status, 200);
    assert.equal(actualRead.body.series.some(({ id }) => id === removedSeries.id), false,
      'the delayed recovery response is the real post-deletion owner snapshot');

    const filters = linkFilters(page);
    const search = filters.getByRole('searchbox', { name: 'Buscar título, URL o serie' });
    await search.fill('Phase2 recuperación de lista');
    await filters.locator('#owner-link-directory').selectOption('propuestos');
    await filters.locator('#owner-link-order').selectOption('titulo-desc');
    await expect(page).toHaveURL((url) => url.searchParams.get('buscar') === 'Phase2 recuperación de lista'
      && url.searchParams.get('directorio') === 'propuestos' && url.searchParams.get('orden') === 'titulo-desc');
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    const nextPage = page.locator('[data-link-page]').filter({ hasText: 'Siguiente' });
    await expect(nextPage).toBeVisible();
    await nextPage.click();
    await expect(page.locator('[data-owner-exit-prompt]')).toHaveCount(0,
      'a page change is display navigation within the current list recovery');
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin,
      'paging keeps the original owner document and recovery attempt alive');
    await expect(page).toHaveURL((url) => url.searchParams.get('paginaEnlaces') === '2'
      && url.searchParams.get('serie') === removedSeries.id);
    await expect(page.locator('[data-link-row]')).toHaveCount(2,
      'the pending list still has two visible rows on its second page before recovery adoption');

    transport.read(0).gate.resolve();
    await checkClick;
    await expect(page.getByRole('button', { name: 'Comprobar', exact: true })).toHaveCount(0,
      'a valid list snapshot is adopted automatically after the explicit check');
    await expect(page).toHaveURL((url) => url.searchParams.get('serie') === null
      && url.searchParams.get('buscar') === 'Phase2 recuperación de lista'
      && url.searchParams.get('directorio') === 'propuestos'
      && url.searchParams.get('orden') === 'titulo-desc'
      && url.searchParams.get('paginaEnlaces') === '2');
    await expect(search).toHaveValue('Phase2 recuperación de lista');
    await expect(filters.locator('#owner-link-directory')).toHaveValue('propuestos');
    await expect(filters.locator('#owner-link-order')).toHaveValue('titulo-desc');
    await expect(page.locator('[data-link-row]')).toHaveCount(1,
      'the adopted all-series query keeps its valid second page after the removed link and series disappear');
    await expect(search).toBeFocused();

    const freshBeforeManual = await fixture.request(cookie, '/api/creador/perfil').then((response) => response.json());
    assert.equal(freshBeforeManual.profile.version, beforeRemove.profile.version + 2,
      'the fresh owner read includes the committed removal and concurrent series deletion');
    const visibleId = await page.locator('[data-link-row]').getAttribute('data-link-row');
    const visibleLink = freshBeforeManual.links.find(({ placementId }) => placementId === visibleId);
    assert.ok(visibleLink);
    await page.locator(`[data-link-row="${visibleId}"]`).getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const editor = linkEditForm(page);
    await editor.getByLabel(/Descripción/).fill('Guardado manual después de recuperar la lista.');
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'PATCH', `/api/creador/enlaces/${visibleId}/editar`)[0]?.status).toBe(200);
    await capture.settle({ skipErrorBodies: true });

    const deleteWrites = writesTo(capture, 'DELETE', removePath);
    const editWrites = writesTo(capture, 'PATCH', `/api/creador/enlaces/${visibleId}/editar`);
    assert.equal(deleteWrites.length, 1, 'checking never repeats the original DELETE');
    assert.equal(editWrites.length, 1, 'the next write is a distinct manual edit');
    assert.equal(editWrites[0].body.profileVersion, freshBeforeManual.profile.version,
      'the manual command uses the profile version adopted from the recovery read');
    assert.equal((await fixture.rawResource(visibleLink.resourceId)).description, 'Guardado manual después de recuperar la lista.');
    assert.equal((await fixture.rawOwner(cookie)).profile.version, freshBeforeManual.profile.version + 1);
  } finally {
    transport.writeGate.resolve();
    transport.read(0).gate.resolve();
    await removeClick?.catch(() => {});
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('Enlaces cancela búsquedas pendientes ante Back, Forward y paginación; la recuperación enfoca un control visible', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const links = [];
  for (let index = 1; index <= 53; index += 1) {
    links.push(await addLink(fixture, cookie, {
      title: `Review navegación ${String(index).padStart(2, '0')}`,
      url: `https://phase2-list-navigation.example/${index}`,
    }));
  }
  const target = links[0];
  await openLinksView(page, fixture, `&buscar=${encodeURIComponent('Review navegación')}`);
  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const removePath = `/api/creador/enlaces/${target.placementId}`;
  const transport = await installListTransport(page, {
    writeMethod: 'DELETE', writePath: removePath, readResponses: [{ kind: 'actual', hold: true }],
  });
  let removeClick;
  let checkClick;
  try {
    page.once('dialog', (dialog) => dialog.accept());
    removeClick = page.locator(`[data-link-row="${target.placementId}"]`)
      .getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    await transport.writeArrived.promise;
    assert.equal(transport.actualWrite.status, 204, 'the actual DELETE commits before its acknowledgement is dropped');
    assert.equal(await fixture.rawPlacement(cookie, target.placementId), null);
    transport.writeGate.resolve();
    await removeClick;
    const recovery = page.locator('[data-owner-list-recovery="links"]');
    await expect(recovery).toBeVisible();

    checkClick = recovery.getByRole('button', { name: 'Comprobar', exact: true }).click();
    const actualRead = await transport.read(0).arrived.promise;
    assert.equal(actualRead.status, 200);
    assert.equal(actualRead.body.links.some(({ placementId }) => placementId === target.placementId), false,
      'the held GET is the real post-delete owner snapshot');

    const savedSearch = 'Review navegación';
    const search = page.locator('#owner-link-search');
    const expectedPage = (pageNumber) => (url) => (url.searchParams.get('paginaEnlaces') ?? '1') === String(pageNumber)
      && url.searchParams.get('buscar') === savedSearch;
    await page.clock.install({ time: new Date() });
    await page.clock.pauseAt(new Date(Date.now() + 1000));

    await page.locator('[data-link-page]').filter({ hasText: 'Siguiente' }).click();
    await expect(page).toHaveURL(expectedPage(2));
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);

    await search.fill('Búsqueda pendiente Back');
    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(expectedPage(1));
    await page.clock.runFor(140);
    await expect(search).toHaveValue(savedSearch);
    await expect(page).toHaveURL(expectedPage(1));

    await search.fill('Búsqueda pendiente Forward');
    await page.evaluate(() => history.forward());
    await expect(page).toHaveURL(expectedPage(2));
    await page.clock.runFor(140);
    await expect(search).toHaveValue(savedSearch);
    await expect(page).toHaveURL(expectedPage(2));

    await search.fill('Búsqueda pendiente paginación');
    await page.locator('[data-link-page]').filter({ hasText: 'Anterior' }).click();
    await expect(page).toHaveURL(expectedPage(1));
    await page.clock.runFor(140);
    await expect(search).toHaveValue(savedSearch);
    await expect(page).toHaveURL(expectedPage(1));
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin,
      'Back, Forward and pagination keep the same owner document and pending list recovery');

    await page.evaluate(() => document.querySelector('[data-link-page]').scrollIntoView({ block: 'center' }));
    const scrollBeforeAdoption = await page.evaluate(() => scrollY);
    await page.clock.resume();
    transport.read(0).gate.resolve();
    await checkClick;
    await expect(recovery).toHaveCount(0, 'the explicit check adopts the complete saved list');
    await expect(page).toHaveURL(expectedPage(1));
    await expect(search).toHaveValue(savedSearch);
    await expect(search).toBeFocused();
    const focus = await page.evaluate(() => {
      const rect = document.activeElement.getBoundingClientRect();
      return { id: document.activeElement.id, top: Math.round(rect.top), bottom: Math.round(rect.bottom), viewport: innerHeight, scrollY };
    });
    assert.equal(focus.id, 'owner-link-search');
    assert.ok(focus.top >= 0 && focus.bottom <= focus.viewport,
      `recovery focus is visible after scrolling a long Links list: ${JSON.stringify(focus)}`);
    assert.ok(scrollBeforeAdoption > 0, 'the recovery happened after scrolling down the long Links list');

    const savedBeforeManual = await fixture.request(cookie, OWNER_PATH).then((response) => response.json());
    const visibleId = await page.locator('[data-link-row]').first().getAttribute('data-link-row');
    const visibleLink = savedBeforeManual.links.find(({ placementId }) => placementId === visibleId);
    assert.ok(visibleLink);
    await page.locator(`[data-link-row="${visibleId}"]`).getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const editor = linkEditForm(page);
    await editor.getByLabel(/Descripción/).fill('Edición manual después de navegar y recuperar.');
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'PATCH', `/api/creador/enlaces/${visibleId}/editar`)[0]?.status).toBe(200);
    await capture.settle({ skipErrorBodies: true });
    assert.equal(writesTo(capture, 'DELETE', removePath).length, 1, 'navigation and checking never replay the removed link');
    assert.equal((await fixture.rawResource(visibleLink.resourceId)).description, 'Edición manual después de navegar y recuperar.');
    assert.equal((await fixture.rawOwner(cookie)).profile.version, savedBeforeManual.profile.version + 1,
      'a distinct manual save persists against the adopted profile version');
  } finally {
    transport.writeGate.resolve();
    transport.read(0).gate.resolve();
    await page.clock.resume().catch(() => {});
    await removeClick?.catch(() => {});
    await checkClick?.catch(() => {});
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('Enlaces conserva el texto escrito si la búsqueda y la adopción terminan en orden inverso', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const links = [];
  for (let index = 1; index <= 5; index += 1) {
    links.push(await addLink(fixture, cookie, {
      title: `Review next ${index}`,
      url: `https://phase2-list-adoption.example/${index}`,
    }));
  }
  const target = links[0];
  await openLinksView(page, fixture, `&buscar=${encodeURIComponent('Review next')}`);
  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const removePath = `/api/creador/enlaces/${target.placementId}`;
  const transport = await installListTransport(page, {
    writeMethod: 'DELETE', writePath: removePath, readResponses: [{ kind: 'actual', hold: true }],
  });
  let removeClick;
  let checkClick;
  try {
    await page.clock.install({ time: new Date() });
    page.once('dialog', (dialog) => dialog.accept());
    removeClick = page.locator(`[data-link-row="${target.placementId}"]`)
      .getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    await transport.writeArrived.promise;
    assert.equal(transport.actualWrite.status, 204);
    assert.equal(await fixture.rawPlacement(cookie, target.placementId), null);
    transport.writeGate.resolve();
    await removeClick;

    const recovery = page.locator('[data-owner-list-recovery="links"]');
    checkClick = recovery.getByRole('button', { name: 'Comprobar', exact: true }).click();
    assert.equal((await transport.read(0).arrived.promise).status, 200);
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const search = page.locator('#owner-link-search');
    const pendingSearch = 'Review next 2';
    await search.fill(pendingSearch);
    await page.clock.runFor(119);
    await expect(search).toHaveValue(pendingSearch);
    await expect(page).toHaveURL((url) => url.searchParams.get('buscar') === 'Review next');

    const replaceStateWrites = await page.evaluateHandle(() => {
      const writes = [];
      const replace = history.replaceState;
      history.replaceState = function (...args) {
        writes.push(String(args[2]));
        return replace.apply(this, args);
      };
      return writes;
    });
    transport.read(0).gate.resolve();
    await checkClick;
    await expect(recovery).toHaveCount(0, 'the held actual snapshot is adopted by the explicit list check');
    const inputAtAdoption = await search.inputValue();
    assert.equal(inputAtAdoption, pendingSearch, 'adoption keeps the search text already entered before the timer commits');
    await page.clock.runFor(150);
    await expect(search).toHaveValue(pendingSearch);
    await expect(page).toHaveURL((url) => url.searchParams.get('buscar') === pendingSearch);
    const urlWrites = await replaceStateWrites.jsonValue();
    assert.equal(new URL(urlWrites.at(-1), page.url()).searchParams.get('buscar'), pendingSearch,
      'a delayed adoption effect cannot replace the newer URL after the debounce commits');
    await page.clock.resume();

    const savedBeforeManual = await fixture.request(cookie, OWNER_PATH).then((response) => response.json());
    const visibleId = await page.locator('[data-link-row]').getAttribute('data-link-row');
    assert.equal(visibleId, links[1].placementId, 'the final search shows the row selected by the still-current text');
    await page.locator(`[data-link-row="${visibleId}"]`).getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const editor = linkEditForm(page);
    await editor.getByLabel(/Descripción/).fill('Guardado manual después de conservar la búsqueda.');
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'PATCH', `/api/creador/enlaces/${visibleId}/editar`)[0]?.status).toBe(200);
    await capture.settle({ skipErrorBodies: true });
    assert.equal(writesTo(capture, 'DELETE', removePath).length, 1, 'the recovery read does not replay the delete');
    assert.equal((await fixture.rawResource(links[1].resourceId)).description, 'Guardado manual después de conservar la búsqueda.');
    assert.equal((await fixture.rawOwner(cookie)).profile.version, savedBeforeManual.profile.version + 1,
      'the explicit edit persists after adoption using the current profile version');
  } finally {
    transport.writeGate.resolve();
    transport.read(0).gate.resolve();
    await page.clock.resume().catch(() => {});
    await removeClick?.catch(() => {});
    await checkClick?.catch(() => {});
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('Series conserva la búsqueda, pertenencia y página de capítulos durante la recuperación y permite el siguiente alta manual', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Ruta para filtrar capítulos', slug: 'ruta-filtros-capitulos' });
  const links = [];
  for (let index = 1; index <= 30; index += 1) {
    links.push(await addLink(fixture, cookie, {
      title: `Phase2 capítulo ${String(index).padStart(2, '0')}`,
      url: `https://phase2-chapters.example/${index}`,
    }));
  }
  const target = links[0];
  await openSeriesView(page, fixture, `&serie=${encodeURIComponent(series.id)}`);
  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const addPath = `/api/creador/series/${series.id}/capitulos/${target.placementId}`;
  const transport = await installListTransport(page, {
    writeMethod: 'PUT', writePath: addPath, readResponses: [{ kind: 'actual', hold: true }],
  });
  let addClick;
  try {
    addClick = page.locator(`[data-chapter-row="${target.placementId}"]`)
      .getByRole('button', { name: 'Agregar capítulo', exact: true }).click();
    await transport.writeArrived.promise;
    assert.equal(transport.actualWrite.status, 200, 'the real chapter PUT commits before its acknowledgement is dropped');
    assert.ok((await fixture.rawPlacement(cookie, target.placementId)).series[series.id]);
    transport.writeGate.resolve();
    await addClick;
    await expect(page.locator('[data-series-reconcile-retry]')).toBeVisible();

    const checkClick = page.locator('[data-series-reconcile-retry]').click();
    const actualRead = await transport.read(0).arrived.promise;
    assert.equal(actualRead.status, 200);
    const filters = chapterFilters(page);
    await page.locator('[data-series-back]').click();
    const contextPrompt = page.locator('[data-owner-exit-prompt]');
    await expect(contextPrompt).toBeVisible();
    await contextPrompt.getByRole('button', { name: 'Seguir editando', exact: true }).click();
    await expect(contextPrompt).toHaveCount(0);
    await expect(page).toHaveURL((url) => url.searchParams.get('serie') === series.id,
      'leaving the selected series remains guarded while the list check is pending');
    await filters.getByRole('searchbox', { name: 'Buscar en tus enlaces' }).fill('Phase2 capítulo');
    await filters.getByLabel('Pertenencia').selectOption('disponibles');
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    await filters.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    await expect(page.locator('[data-owner-exit-prompt]')).toHaveCount(0,
      'submitting chapter search and membership keeps the current recovery attempt');
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin,
      'the Series GET filter stays in the original owner document');
    await expect(page).toHaveURL((url) => url.searchParams.get('serie') === series.id
      && url.searchParams.get('buscarCapitulos') === 'Phase2 capítulo'
      && url.searchParams.get('pertenencia') === 'disponibles');

    const nextPage = page.locator('[data-series-chapter-page]').filter({ hasText: 'Siguiente' });
    await expect(nextPage).toBeVisible();
    await nextPage.click();
    await expect(page.locator('[data-owner-exit-prompt]')).toHaveCount(0,
      'chapter pagination within the same series remains usable while checking');
    await expect(page).toHaveURL((url) => url.searchParams.get('paginaCapitulos') === '2');
    await expect(page.locator('[data-chapter-row]')).toHaveCount(5,
      'the still-unadopted browser snapshot shows all 30 links as available');

    const pageTwoIds = await page.locator('[data-chapter-row]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-placement-id')));
    await page.goBack();
    await expect(page).toHaveURL((url) => url.searchParams.get('serie') === series.id
      && url.searchParams.get('buscarCapitulos') === 'Phase2 capítulo'
      && url.searchParams.get('pertenencia') === 'disponibles'
      && url.searchParams.get('paginaCapitulos') !== '2');
    await expect(page.locator('[data-owner-exit-prompt]')).toHaveCount(0,
      'native back navigation within the same chapter list does not trigger the exit guard');
    await expect(page.locator('[data-chapter-row]')).toHaveCount(25,
      'the previous history entry restores the first page of the same chapter query');
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin,
      'history traversal keeps the same owner document');
    await page.goForward();
    await expect(page).toHaveURL((url) => url.searchParams.get('serie') === series.id
      && url.searchParams.get('buscarCapitulos') === 'Phase2 capítulo'
      && url.searchParams.get('pertenencia') === 'disponibles'
      && url.searchParams.get('paginaCapitulos') === '2');
    await expect(page.locator('[data-owner-exit-prompt]')).toHaveCount(0,
      'native forward navigation restores page two without prompting');
    await expect(page.locator('[data-chapter-row]')).toHaveCount(5);
    assert.deepEqual(await page.locator('[data-chapter-row]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-placement-id'))), pageTwoIds,
      'forward history restores the same page-two rows');
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);

    await page.evaluate(() => document.querySelector('[data-series-chapter-page]').scrollIntoView({ block: 'center' }));
    const scrollBeforeAdoption = await page.evaluate(() => scrollY);
    transport.read(0).gate.resolve();
    await checkClick;
    await expect(page.locator('[data-series-reconcile-retry]')).toHaveCount(0);
    await expect(page).toHaveURL((url) => url.searchParams.get('serie') === series.id
      && url.searchParams.get('buscarCapitulos') === 'Phase2 capítulo'
      && url.searchParams.get('pertenencia') === 'disponibles'
      && url.searchParams.get('paginaCapitulos') === '2');
    await expect(chapterFilters(page).getByRole('searchbox', { name: 'Buscar en tus enlaces' }))
      .toHaveValue('Phase2 capítulo');
    await expect(chapterFilters(page).getByLabel('Pertenencia')).toHaveValue('disponibles');
    const chapterSearch = chapterFilters(page).getByRole('searchbox', { name: 'Buscar en tus enlaces' });
    await expect(chapterSearch).toBeFocused();
    const focus = await chapterSearch.evaluate((input) => {
      const rect = input.getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), viewport: innerHeight };
    });
    assert.ok(focus.top >= 0 && focus.bottom <= focus.viewport,
      `chapter recovery focus is visible after scrolling: ${JSON.stringify(focus)}`);
    assert.ok(scrollBeforeAdoption > 0, 'the chapter recovery happened after scrolling down the list');
    await expect(page.locator('[data-chapter-row]')).toHaveCount(4,
      'adoption preserves a still-valid chapter page instead of resetting it');

    const freshBeforeManual = await fixture.request(cookie, '/api/creador/perfil').then((response) => response.json());
    const manualRow = page.locator('[data-chapter-row]').first();
    const manualPlacementId = await manualRow.getAttribute('data-placement-id');
    await manualRow.getByRole('button', { name: 'Agregar capítulo', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'PUT', `/api/creador/series/${series.id}/capitulos/${manualPlacementId}`)[0]?.status).toBe(200);
    await capture.settle({ skipErrorBodies: true });
    const putWrites = writesTo(capture, 'PUT', `/api/creador/series/${series.id}/capitulos/${manualPlacementId}`);
    assert.equal(writesTo(capture, 'PUT', addPath).length, 1, 'checking does not replay the committed first chapter addition');
    assert.equal(putWrites.length, 1, 'the later addition is a separate user action');
    assert.equal(putWrites[0].body.profileVersion, freshBeforeManual.profile.version,
      'the manual chapter command uses the adopted profile version');
    const persistedOwner = await fixture.request(cookie, '/api/creador/perfil').then((response) => response.json());
    assert.ok(persistedOwner.links.find(({ placementId }) => placementId === manualPlacementId)
      .series.some(({ seriesId: id }) => id === series.id));
  } finally {
    transport.writeGate.resolve();
    transport.read(0).gate.resolve();
    await addClick?.catch(() => {});
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('Series limpia el contexto eliminado después de recuperar la lista y permite gestionar una serie superviviente', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const removedSeries = await createSeries(fixture, cookie, { name: 'Serie a retirar', slug: 'serie-a-retirar-fase2' });
  const survivor = await createSeries(fixture, cookie, { name: 'Serie superviviente', slug: 'serie-superviviente-fase2' });
  const target = await addLink(fixture, cookie, { title: 'Capítulo que queda disponible', url: 'https://phase2-series.example/target' });
  const survivorLink = await addLink(fixture, cookie, { title: 'Capítulo superviviente', url: 'https://phase2-series.example/survivor' });
  await addChapter(fixture, cookie, removedSeries.id, target.placementId);
  await addChapter(fixture, cookie, survivor.id, survivorLink.placementId);
  const before = await fixture.rawOwner(cookie);
  await openSeriesView(page, fixture,
    `&buscarSeries=superviviente&serie=${encodeURIComponent(removedSeries.id)}&buscarCapitulos=Phase2&pertenencia=incluidos&paginaCapitulos=2`);
  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const removeChapterPath = `/api/creador/series/${removedSeries.id}/capitulos/${target.placementId}`;
  const transport = await installListTransport(page, {
    writeMethod: 'DELETE', writePath: removeChapterPath, readResponses: [{ kind: 'actual', hold: true }],
  });
  let removeClick;
  try {
    removeClick = page.locator(`[data-chapter-row="${target.placementId}"]`)
      .getByRole('button', { name: 'Quitar capítulo', exact: true }).click();
    await transport.writeArrived.promise;
    assert.equal(transport.actualWrite.status, 204, 'the real chapter removal commits before its acknowledgement is dropped');
    assert.equal((await fixture.rawPlacement(cookie, target.placementId)).series?.[removedSeries.id], undefined);
    transport.writeGate.resolve();
    await removeClick;
    await expect(page.locator('[data-series-reconcile-retry]')).toBeVisible();

    const currentOwner = await fixture.rawOwner(cookie);
    const deleteSeries = await api(fixture, cookie, `/api/creador/series/${removedSeries.id}`, {
      method: 'DELETE', body: { version: removedSeries.version, profileVersion: currentOwner.profile.version },
    });
    assert.equal(deleteSeries.response.status, 204, 'the concurrent series deletion uses the real creator API');

    const checkClick = page.locator('[data-series-reconcile-retry]').click();
    const actualRead = await transport.read(0).arrived.promise;
    assert.equal(actualRead.status, 200);
    assert.equal(actualRead.body.series.some(({ id }) => id === removedSeries.id), false);

    const contextUrl = page.url();
    await page.locator('[data-series-back]').click();
    const contextPrompt = page.locator('[data-owner-exit-prompt]');
    await expect(contextPrompt).toBeVisible();
    await expect(page).toHaveURL(contextUrl,
      'leaving the selected series remains guarded while the recovery read is pending');
    await contextPrompt.getByRole('button', { name: 'Seguir editando', exact: true }).click();
    await expect(contextPrompt).toHaveCount(0);
    await expect(page).toHaveURL(contextUrl);

    transport.read(0).gate.resolve();
    await checkClick;
    await expect(page.locator('[data-owner-series-chapters]')).toBeHidden();
    await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
    await expect(page).toHaveURL((url) => url.searchParams.get('vista') === 'series'
      && url.searchParams.get('buscarSeries') === 'superviviente'
      && url.searchParams.get('serie') === null
      && url.searchParams.get('buscarCapitulos') === null
      && url.searchParams.get('pertenencia') === null
      && url.searchParams.get('paginaCapitulos') === null,
    'adoption removes only the deleted chapter context and keeps the valid Series search');
    await expect(page.locator('[data-owner-series-row="' + survivor.id + '"]')).toBeVisible();
    await expect(page.locator('#owner-series-title')).toBeFocused();
    assert.equal((await fixture.rawOwner(cookie)).profile.id, before.profile.id);

    const freshBeforeManual = await fixture.request(cookie, '/api/creador/perfil').then((response) => response.json());
    await page.locator(`[data-owner-series-row="${survivor.id}"]`)
      .getByRole('link', { name: 'Gestionar capítulos', exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('serie') === survivor.id);
    const row = page.locator(`[data-chapter-row="${target.placementId}"]`);
    await expect(row.getByRole('button', { name: 'Agregar capítulo', exact: true })).toBeEnabled();
    const addPath = `/api/creador/series/${survivor.id}/capitulos/${target.placementId}`;
    await row.getByRole('button', { name: 'Agregar capítulo', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'PUT', addPath)[0]?.status).toBe(200);
    await capture.settle({ skipErrorBodies: true });
    assert.equal(writesTo(capture, 'DELETE', removeChapterPath).length, 1,
      'checking the committed chapter removal does not replay DELETE');
    assert.equal(writesTo(capture, 'PUT', addPath).length, 1,
      'the next series action is a separate manual chapter addition');
    assert.equal(writesTo(capture, 'PUT', addPath)[0].body.profileVersion, freshBeforeManual.profile.version);
    const persisted = await fixture.rawPlacement(cookie, target.placementId);
    assert.ok(persisted.series[survivor.id]);
    assert.equal(persisted.series[removedSeries.id], undefined);
  } finally {
    transport.writeGate.resolve();
    transport.read(0).gate.resolve();
    await removeClick?.catch(() => {});
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('Enlaces permite reintentar una lectura no disponible y re-agregar manualmente la ficha retirada', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const target = await addLink(fixture, cookie, { title: 'Ficha para reintento 503', url: 'https://phase2-retry.example/target' });
  await addLink(fixture, cookie, { title: 'Otra ficha visible', url: 'https://phase2-retry.example/other' });
  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const deletePath = `/api/creador/enlaces/${target.placementId}`;
  const transport = await installListTransport(page, {
    writeMethod: 'DELETE', writePath: deletePath,
    readResponses: [{ kind: 'status', status: 503, hold: true }, { kind: 'actual' }],
  });
  let removeClick;
  try {
    page.once('dialog', (dialog) => dialog.accept());
    removeClick = page.locator(`[data-link-row="${target.placementId}"]`)
      .getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    await transport.writeArrived.promise;
    assert.equal(transport.actualWrite.status, 204);
    transport.writeGate.resolve();
    await removeClick;
    await expect(page.locator('[data-owner-list-recovery="links"]')).toBeVisible();

    const failedCheck = page.locator('[data-owner-compare]').click();
    await transport.read(0).arrived.promise;
    await linkFilters(page).getByRole('searchbox', { name: 'Buscar título, URL o serie' }).fill('Otra ficha');
    await expect(page).toHaveURL((url) => url.searchParams.get('buscar') === 'Otra ficha');
    transport.read(0).gate.resolve();
    await failedCheck;
    await expect(page.locator('[data-owner-compare]')).toBeEnabled();
    await expect(page.locator('[data-owner-list-recovery="links"]')).toContainText(/no pudimos leer|volver a comprobar/i);
    assert.equal(await fixture.rawPlacement(cookie, target.placementId), null,
      'the failed read cannot restore or replay the already committed removal');

    await page.locator('[data-owner-compare]').click();
    const validRead = await transport.read(1).arrived.promise;
    assert.equal(validRead.status, 200);
    await expect(page.locator('[data-owner-compare]')).toHaveCount(0,
      'the subsequent actual owner snapshot is adopted by the explicit Comprobar action');
    await expect(page).toHaveURL((url) => url.searchParams.get('buscar') === 'Otra ficha');
    await expect(linkFilters(page).getByRole('searchbox', { name: 'Buscar título, URL o serie' })).toHaveValue('Otra ficha');
    const beforeReadd = await fixture.request(cookie, OWNER_PATH).then((response) => response.json());
    const retained = page.locator(`[data-owner-retained-links] [data-retained-resource="${target.resourceId}"]`);
    await expect(retained).toBeVisible();
    await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(201);
    await capture.settle({ skipErrorBodies: true });
    const removalWrites = writesTo(capture, 'DELETE', deletePath);
    const readdWrites = writesTo(capture, 'POST', '/api/creador/enlaces');
    assert.equal(removalWrites.length, 1, 'the failed and retried reads never replay the committed DELETE');
    assert.equal(readdWrites.length, 1, 're-adding is a later manual command');
    assert.equal(readdWrites[0].body.resourceId, target.resourceId);
    assert.equal(readdWrites[0].body.resourceVersion,
      beforeReadd.editableResources.find(({ id }) => id === target.resourceId).version,
      'the manual re-add uses the resource version from the successful retry');
    const finalPlacement = await fixture.rawPlacement(cookie, readdWrites[0].responseBody.link.placementId);
    assert.ok(finalPlacement);
    assert.equal((await fixture.rawOwner(cookie)).profile.version, beforeReadd.profile.version + 1);
  } finally {
    transport.writeGate.resolve();
    await removeClick?.catch(() => {});
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('Enlaces rechaza una lectura malformada y una versión antigua antes de re-agregar manualmente', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const target = await addLink(fixture, cookie, { title: 'Ficha con lecturas rechazadas', url: 'https://phase2-bad-read.example/target' });
  const olderSnapshot = await fixture.request(cookie, OWNER_PATH).then((response) => response.json());
  await addLink(fixture, cookie, { title: 'Cambio que avanza la versión observada', url: 'https://phase2-bad-read.example/version-bump' });
  const currentBeforeRemove = await fixture.request(cookie, OWNER_PATH).then((response) => response.json());
  assert.ok(olderSnapshot.profile.version < currentBeforeRemove.profile.version,
    'the stale response is an actual earlier complete owner snapshot captured before the setup mutation');
  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const deletePath = `/api/creador/enlaces/${target.placementId}`;
  const transport = await installListTransport(page, {
    writeMethod: 'DELETE', writePath: deletePath,
    readResponses: [
      { kind: 'malformed' },
      { kind: 'body', body: olderSnapshot },
      { kind: 'actual' },
    ],
  });
  let removeClick;
  try {
    page.once('dialog', (dialog) => dialog.accept());
    removeClick = page.locator(`[data-link-row="${target.placementId}"]`)
      .getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    await transport.writeArrived.promise;
    assert.equal(transport.actualWrite.status, 204);
    transport.writeGate.resolve();
    await removeClick;
    await expect(page.locator('[data-owner-list-recovery="links"]')).toBeVisible();

    await page.locator('[data-owner-compare]').click();
    await transport.read(0).arrived.promise;
    await expect(page.locator('[data-owner-compare]')).toBeEnabled();
    await expect(page.locator('[data-owner-list-recovery="links"]')).toContainText(/completo y coherente/i);
    assert.equal(await fixture.rawPlacement(cookie, target.placementId), null,
      'the committed removal remains absent in the service while the browser still has its pre-check row');
    await expect(page.locator(`[data-link-row="${target.placementId}"]`)).toBeVisible();

    await page.locator('[data-owner-compare]').click();
    const staleRead = await transport.read(1).arrived.promise;
    assert.equal(staleRead.status, 200);
    assert.equal(transport.read(1).body.profile.version, olderSnapshot.profile.version);
    assert.ok(transport.read(1).body.profile.version < currentBeforeRemove.profile.version,
      'the controlled response is an actual earlier complete owner snapshot');
    await expect(page.locator('[data-owner-compare]')).toBeEnabled();
    await expect(page.locator('[data-owner-list-recovery="links"]')).toContainText(/versión anterior/i);

    await page.locator('[data-owner-compare]').click();
    const validRead = await transport.read(2).arrived.promise;
    assert.equal(validRead.status, 200);
    assert.equal(validRead.body.profile.version, (await fixture.rawOwner(cookie)).profile.version);
    await expect(page.locator('[data-owner-compare]')).toHaveCount(0);
    const beforeReadd = await fixture.request(cookie, OWNER_PATH).then((response) => response.json());
    const retained = page.locator(`[data-owner-retained-links] [data-retained-resource="${target.resourceId}"]`);
    await expect(retained).toBeVisible();
    await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(201);
    await capture.settle({ skipErrorBodies: true });
    assert.equal(writesTo(capture, 'DELETE', deletePath).length, 1,
      'malformed and old reads never replay the committed removal');
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1,
      'the final re-add is one distinct manual command');
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces')[0].body.resourceVersion,
      beforeReadd.editableResources.find(({ id }) => id === target.resourceId).version);
    assert.ok(await fixture.rawPlacement(cookie, writesTo(capture, 'POST', '/api/creador/enlaces')[0].responseBody.link.placementId));
  } finally {
    transport.writeGate.resolve();
    await removeClick?.catch(() => {});
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('Enlaces conserva el intento y permite reintentar cuando Comprobar recibe un perfil real de otra persona', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const target = await addLink(fixture, cookie, { title: 'Ficha con lectura ajena', url: 'https://phase2-wrong-owner.example/target' });
  const survivor = await addLink(fixture, cookie, { title: 'Ficha superviviente', url: 'https://phase2-wrong-owner.example/survivor' });
  const other = await signInOtherOwner(fixture);
  await createProfile(fixture, other.pair, { displayName: 'Otra persona', slug: 'otra-persona-lista-fase2' });
  await addLink(fixture, other.pair, { title: 'Ficha de la otra persona', url: 'https://phase2-wrong-owner.example/other' });
  const foreignSnapshot = await fixture.request(other.pair, OWNER_PATH).then((response) => response.json());
  const ownSnapshot = await fixture.request(cookie, OWNER_PATH).then((response) => response.json());
  assert.notEqual(foreignSnapshot.profile.id, ownSnapshot.profile.id);
  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const deletePath = `/api/creador/enlaces/${target.placementId}`;
  const transport = await installListTransport(page, {
    writeMethod: 'DELETE', writePath: deletePath,
    readResponses: [{ kind: 'body', body: foreignSnapshot, hold: true }, { kind: 'actual' }],
  });
  let removeClick;
  try {
    page.once('dialog', (dialog) => dialog.accept());
    removeClick = page.locator(`[data-link-row="${target.placementId}"]`)
      .getByRole('button', { name: 'Quitar de tu página', exact: true }).click();
    await transport.writeArrived.promise;
    assert.equal(transport.actualWrite.status, 204);
    transport.writeGate.resolve();
    await removeClick;
    await expect(page.locator('[data-owner-list-recovery="links"]')).toBeVisible();

    const changedSearch = linkFilters(page).getByRole('searchbox', { name: 'Buscar título, URL o serie' });
    const check = page.locator('[data-owner-compare]').click();
    await transport.read(0).arrived.promise;
    await changedSearch.fill('superviviente');
    await expect(page).toHaveURL((url) => url.searchParams.get('buscar') === 'superviviente',
      'a real search control changes the ordinary Links query while checking');
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    transport.read(0).gate.resolve();
    await check;
    await expect(page.locator('[data-owner-compare]')).toBeEnabled();
    await expect(page.locator('[data-owner-list-recovery="links"]')).toContainText(/no coincide|conservamos/i);
    assert.equal(await page.evaluate(() => performance.timeOrigin), timeOrigin);
    await expect(page.locator('[data-owner-activity]')).toHaveAttribute('data-owner-creator-id', ownSnapshot.profile.id,
      'the rejected foreign DTO cannot replace the active owner shell identity');
    await expect(page.locator(`[data-link-row="${survivor.placementId}"]`)).toBeVisible();
    await expect(page.locator('[data-link-row]').filter({ hasText: 'Ficha de la otra persona' })).toHaveCount(0,
      'the foreign owner content never appears in the current user’s visible list');
    assert.equal(await fixture.rawPlacement(cookie, target.placementId), null,
      'a shape-valid foreign DTO does not change the committed service state');

    await page.locator('[data-owner-compare]').click();
    const validRead = await transport.read(1).arrived.promise;
    assert.equal(validRead.status, 200);
    await expect(page.locator('[data-owner-compare]')).toHaveCount(0);
    await expect(page).toHaveURL((url) => url.searchParams.get('buscar') === 'superviviente');
    await expect(changedSearch).toHaveValue('superviviente');
    const beforeReadd = await fixture.request(cookie, OWNER_PATH).then((response) => response.json());
    const retained = page.locator(`[data-owner-retained-links] [data-retained-resource="${target.resourceId}"]`);
    await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(201);
    await capture.settle({ skipErrorBodies: true });
    assert.equal(writesTo(capture, 'DELETE', deletePath).length, 1);
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1);
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces')[0].body.resourceVersion,
      beforeReadd.editableResources.find(({ id }) => id === target.resourceId).version);
    assert.ok(await fixture.rawPlacement(cookie, writesTo(capture, 'POST', '/api/creador/enlaces')[0].responseBody.link.placementId));
  } finally {
    transport.writeGate.resolve();
    transport.read(0).gate.resolve();
    await removeClick?.catch(() => {});
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

for (const bodyOutcome of ['resolve', 'reject']) {
  test(`la lectura directa ya analizada de A no altera B si se libera y se ${bodyOutcome === 'resolve' ? 'resuelve' : 'rechaza'} después`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const initial = await fixture.rawOwner(cookie);
    const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
    let rejectedA = false;
    const rejectProfileA = async (route) => {
      const request = route.request();
      if (!rejectedA && request.method() === 'PUT' && new URL(request.url()).pathname.replace(/\/$/u, '') === OWNER_PATH) {
        rejectedA = true;
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'TEMPORARY_FAILURE' }) });
        return;
      }
      await route.continue();
    };
    try {
      await page.route('**/api/creador/**', rejectProfileA);
      await openLinksView(page, fixture);
      const openA = page.getByRole('button', { name: 'Editar datos', exact: true }).click();
      const editorA = profileForm(page);
      await editorA.getByLabel('Nombre visible').fill('Borrador A que se descarta');
      await editorA.getByRole('button', { name: 'Guardar datos', exact: true }).click();
      await expect(editorA.locator('[data-owner-compare]')).toBeVisible();
      assert.equal(rejectedA, true, 'A reaches the actual browser write boundary and receives the controlled pre-commit 503');
      assert.deepEqual((await fixture.rawOwner(cookie)).profile, initial.profile,
        'the controlled 503 leaves the saved profile unchanged');
      await page.unroute('**/api/creador/**', rejectProfileA);
      await openA.catch(() => {});

      await page.evaluate(() => {
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const control = { entered: false, completed: false, shouldReject: false, release, gate };
        window.__phase2DirectJson = control;
        const nativeFetch = window.fetch.bind(window);
        window.fetch = async (...args) => {
          const response = await nativeFetch(...args);
          const requestUrl = typeof args[0] === 'string' ? args[0] : args[0].url;
          if (new URL(requestUrl, window.location.href).pathname.replace(/\/$/u, '') === '/api/creador/perfil') {
            const nativeJson = response.json.bind(response);
            response.json = async () => {
              const payload = await nativeJson();
              control.entered = true;
              await control.gate;
              control.completed = true;
              if (control.shouldReject) throw new Error('controlled post-parse body rejection');
              return payload;
            };
          }
          return response;
        };
      });

      const check = editorA.locator('[data-owner-compare]').click();
      await page.waitForFunction(() => window.__phase2DirectJson?.entered === true);
      const cancel = editorA.getByRole('button', { name: 'Cancelar', exact: true }).click();
      const exitPrompt = page.locator('[data-owner-exit-prompt]');
      await expect(exitPrompt).toBeVisible();
      await exitPrompt.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
      await cancel.catch(() => {});
      const editorB = profileForm(page);
      await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
      await editorB.getByLabel('Nombre visible').fill('Borrador B activo');
      const cityB = editorB.getByLabel(/Ciudad/);
      await cityB.fill('Córdoba');
      await expect(cityB).toBeFocused();
      const feedbackB = await editorB.locator('[data-owner-form-status="datos"]').textContent();
      await page.evaluate((shouldReject) => {
        window.__phase2DirectJson.shouldReject = shouldReject;
        window.__phase2DirectJson.release();
      }, bodyOutcome === 'reject');
      await page.waitForFunction(() => window.__phase2DirectJson?.completed === true);
      await check.catch(() => {});
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

      await expect(page.locator('[data-session-recovery-shell]')).toHaveCount(0,
        'the superseded body continuation cannot install session recovery over B');
      await expect(editorB.getByLabel('Nombre visible')).toHaveValue('Borrador B activo');
      await expect(cityB).toHaveValue('Córdoba');
      await expect(cityB).toBeFocused();
      await expect(editorB.locator('[data-owner-form-status="datos"]')).toHaveText(feedbackB ?? '');
      await expect(editorB.getByRole('button', { name: 'Guardar datos', exact: true })).toBeEnabled();
      assert.equal((await fixture.rawOwner(cookie)).profile.version, initial.profile.version,
        'neither resolving nor rejecting the old check writes the profile');

      await editorB.getByRole('button', { name: 'Guardar datos', exact: true }).click();
      await capture.settle({ skipErrorBodies: true });
      const writes = capture.writes().filter(({ method, path }) => method === 'PUT' && path === OWNER_PATH);
      assert.equal(writes.length, 2, 'A is not replayed when its post-parse body settles; B is one separate manual write');
      assert.deepEqual(writes.map(({ status, body }) => ({ status, displayName: body.displayName })), [
        { status: 503, displayName: 'Borrador A que se descarta' },
        { status: 200, displayName: 'Borrador B activo' },
      ]);
      assert.equal(writes[1].body.version, initial.profile.version);
      assert.equal(writes[1].body.city, 'Córdoba');
      const saved = await fixture.rawOwner(cookie);
      assert.equal(saved.profile.displayName, 'Borrador B activo');
      assert.equal(saved.profile.city, 'Córdoba');
      assert.equal(saved.profile.version, initial.profile.version + 1);
    } finally {
      await page.evaluate(() => window.__phase2DirectJson?.release?.()).catch(() => {});
      await page.unroute('**/api/creador/**', rejectProfileA).catch(() => {});
      await capture.stop({ skipErrorBodies: true }).catch(() => {});
    }
  });
}

test('Publicar desde una consulta inicial inválida conserva el 400 hasta limpiar la URL y permite continuar', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const missingSeriesId = 'phase2-missing-links-series';
  const response = await page.goto(`${fixture.origin}/cuenta/?vista=enlaces&serie=${missingSeriesId}`);
  assert.equal(response?.status(), 400, 'the real SSR route rejects the initially missing Links series filter');
  await expect(page.locator('[data-links-query-error]')).toBeVisible();
  await expect(page.locator('[data-owner-publish]')).toBeVisible();
  const historyBeforeCheck = await page.evaluate(() => history.state);
  assert.equal(historyBeforeCheck.creatorOwnerLinksQueryValid, false,
    'the initial history entry records that its query was invalid');

  const capture = await captureCreatorApi(page, { ignoreReads: true, skipErrorBodies: true });
  const transport = await installListTransport(page, {
    writeMethod: 'POST', writePath: '/api/creador/perfil/publicar', readResponses: [{ kind: 'actual', hold: true }],
  });
  let publishClick;
  let checkClick;
  try {
    publishClick = page.locator('[data-owner-publish]').click();
    await transport.writeArrived.promise;
    assert.equal(transport.actualWrite.status, 200, 'the real Publish request commits before its acknowledgement is dropped');
    assert.equal((await fixture.rawOwner(cookie)).profile.published, true);
    transport.writeGate.resolve();
    await publishClick;
    const recovery = page.locator('[data-owner-list-recovery]');
    await expect(recovery).toBeVisible();

    checkClick = recovery.getByRole('button', { name: 'Comprobar', exact: true }).click();
    const actualRead = await transport.read(0).arrived.promise;
    assert.equal(actualRead.status, 200);
    assert.equal(actualRead.body.profile.published, true,
      'the held recovery GET is the genuine post-Publish owner snapshot');
    transport.read(0).gate.resolve();
    await checkClick;

    await expect(recovery).toHaveCount(0, 'the explicit check adopts the eligible list snapshot');
    await expect(page.locator('[data-links-query-error]')).toBeVisible();
    await expect(page.locator('#contenido'),
      'a query-error view focuses its visible shared main region, not a hidden list control').toBeFocused();
    assert.equal(new URL(page.url()).searchParams.get('serie'), missingSeriesId,
      'adoption preserves the initially rejected query until the user clears it');
    const historyAfterCheck = await page.evaluate(() => history.state);
    assert.equal(historyAfterCheck.creatorOwnerLinksQueryValid, false,
      'adoption keeps the original invalid-history marker');

    await page.getByRole('link', { name: 'Limpiar búsqueda y filtros', exact: true }).click();
    await expect(page.locator('[data-links-query-error]')).toHaveCount(0);
    await expect(page.locator('[data-link-filters]')).toBeVisible();
    await expect(page).toHaveURL((url) => url.searchParams.get('serie') === null);
    const beforeManual = await fixture.rawOwner(cookie);
    assert.equal(beforeManual.profile.published, true,
      'the adopted snapshot retains the confirmed publication before the next action');

    await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const form = addLinkForm(page);
    await form.getByLabel('Título', { exact: true }).fill('Acción manual después de publicar');
    await form.getByLabel('URL', { exact: true }).fill('https://phase2-list.example/manual-after-publish');
    await form.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(201);
    await capture.settle({ skipErrorBodies: true });
    assert.equal(writesTo(capture, 'POST', '/api/creador/perfil/publicar').length, 1,
      'checking never replays Publish');
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1,
      'the new link is a distinct explicit action');
    const saved = await fixture.request(cookie, OWNER_PATH).then((fresh) => fresh.json());
    assert.ok(saved.links.some(({ title, url }) => title === 'Acción manual después de publicar'
      && url === 'https://phase2-list.example/manual-after-publish'));
    assert.equal(saved.profile.version, beforeManual.profile.version + 1,
      'the manual action persists after the adopted profile version');
  } finally {
    transport.writeGate.resolve();
    transport.read(0).gate.resolve();
    await Promise.all([publishClick?.catch(() => {}), checkClick?.catch(() => {})]);
    await transport.close();
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

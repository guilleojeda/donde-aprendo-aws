import assert from 'node:assert/strict';
import { seedResource } from '../fixtures/creator-pages.mjs';
import {
  test, expect, api, addLink, captureCreatorApi, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

function catalogEntry({ id, title, url, tipo = 'source' }) {
  return { id, title, url, tipo };
}

async function seedCatalogRecord(fixture, item) {
  if (item.tipo === 'event') {
    await seedResource(fixture.creatorStore, {
      id: item.id,
      title: item.title,
      recordType: 'event',
      registrationUrl: item.url,
      category: 'Evento',
      format: 'Evento',
      published: true,
    });
    return;
  }
  await seedResource(fixture.creatorStore, {
    id: item.id,
    title: item.title,
    url: item.url,
    kind: item.tipo,
    category: item.tipo === 'community' ? 'Comunidad' : 'Contenido',
    format: item.tipo,
    published: true,
  });
}

async function serveSelectionIndex(page, initialEntries, {
  firstStatus = 200,
  firstBody,
  firstGate,
} = {}) {
  let entries = structuredClone(initialEntries);
  const reads = [];
  await page.route('**/catalog-selection.json', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    reads.push(new URL(route.request().url()).pathname);
    if (reads.length === 1 && firstGate) await firstGate.promise;
    await route.fulfill({
      status: reads.length === 1 ? firstStatus : 200,
      contentType: 'application/json',
      body: reads.length === 1 && firstBody !== undefined
        ? firstBody
        : reads.length === 1 && firstStatus !== 200
          ? JSON.stringify({ error: 'CATALOG_UNAVAILABLE' })
          : JSON.stringify(entries),
    });
  });
  return {
    reads,
    replace(nextEntries) { entries = structuredClone(nextEntries); },
  };
}

function deferred() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

async function openOwnerCatalog(page, fixture) {
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Buscar en el cat\u00e1logo/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('un catálogo listo invita a seleccionar y reserva Actualiza para una selección invalidada', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  const item = catalogEntry({
    id: 'phase11-ready-copy',
    title: 'Referencia lista para seleccionar',
    url: 'https://catalog.example.invalid/ready-copy',
  });
  const index = await serveSelectionIndex(page, [item]);
  await openOwnerCatalog(page, fixture);

  const form = page.locator('form[data-catalog-reference-form]');
  await expect(form.locator('[data-catalog-status]')).toHaveText('Elige una ficha del catálogo para agregarla a tu página.');
  await expect(form.locator('[data-catalog-status]')).not.toContainText(/actualiza|desactualiz/i);

  await catalogRadio(page, item.title).check();
  await expect(form.locator('[data-catalog-status]')).toHaveText('');
  await expect(page.locator('[data-catalog-reference]')).toBeEnabled();

  // A failed reference write is the real invalidation path; it must still
  // expose the refresh action and stale-catalog explanation after the fix.
  const invalidateReference = async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/\/$/u, '');
    if (route.request().method() !== 'POST' || pathname !== '/api/creador/referencias') return route.continue();
    return route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'RESOURCE_CONFLICT' }),
    });
  };
  await page.route('**/api/creador/**', invalidateReference);
  await page.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Actualizar catálogo', exact: true })).toBeVisible();
  await expect(page.locator('[data-catalog-index-status]')).toContainText('Actualiza el catálogo');
  await page.unroute('**/api/creador/**', invalidateReference).catch(() => {});
  assert.equal(index.reads.length, 1, 'the ready-state copy uses the initial index read only');
});

test('el estado migrado conserva una red opcional vacía en SSR sin mostrarla en público', async ({ fixture, page, publicPage }) => {
  const cookie = await loggedInOwner(fixture, page);
  let stored = await fixture.rawOwner(cookie);
  const publish = await api(fixture, cookie, '/api/creador/perfil/publicar', {
    method: 'POST', body: { creatorVersion: stored.profile.version },
  });
  assert.equal(publish.response.status, 200, JSON.stringify(publish.body));

  stored = await fixture.rawOwner(cookie);
  const migrated = {
    ...stored.profile,
    socials: { ...stored.profile.socials, website: '' },
  };
  assert.equal(await fixture.creatorStore.transact({
    checks: [{ key: `profile:${stored.profile.id}`, version: stored.profile.version }],
    puts: [{ key: `profile:${stored.profile.id}`, value: migrated }],
  }), true, 'the fixture installs a persisted legacy blank social value after the real publication command');

  const serviceRead = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(serviceRead.response.status, 200, JSON.stringify(serviceRead.body));
  assert.equal(serviceRead.body.profile.socials.website, '', 'the real owner service preserves the stored blank value');

  const ownerPage = await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  assert.equal(ownerPage?.status(), 200, 'SSR accepts the actual service observation containing the legacy blank social');
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  await expect(page.locator('astro-island[component-url*="CreatorOwnerApp"]')).not.toHaveAttribute('ssr', '');

  const publicResponse = await publicPage.goto(`${fixture.origin}/c/${stored.profile.slug}/`);
  assert.equal(publicResponse?.status(), 200);
  await expect(publicPage.locator('[data-creator-link-id="social:website"]')).toHaveCount(0,
    'the public profile omits the blank social destination');
});

async function openOwnerClaimCatalog(page, fixture) {
  await page.goto(`${fixture.origin}/cuenta/?vista=solicitudes`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Solicitudes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Solicitar edición', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel(/URLs conocidas/i)).toBeVisible();
}

function catalogSearch(page) {
  return page.getByRole('dialog').getByRole('searchbox').first();
}

function catalogRadio(page, title) {
  return page.getByRole('dialog').getByRole('radio', {
    name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  });
}

function catalogPageButton(page, direction) {
  return page.getByRole('dialog').getByRole('button', {
    name: direction === 'previous' ? 'Anterior' : 'Siguiente', exact: true,
  });
}

function catalogPickerSelection(page, item, mode) {
  const escapedTitle = item.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return mode === 'reference'
    ? page.getByRole('dialog').getByRole('radio', { name: new RegExp(escapedTitle) })
    : page.getByRole('dialog').getByRole('checkbox', { name: new RegExp(`Solicitar edición de ${escapedTitle}`) });
}

async function tabToCatalogControl(page, control) {
  await catalogSearch(page).focus();
  for (let keypress = 0; keypress < 80; keypress += 1) {
    if (await control.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  assert.fail(`Keyboard Tab did not reach ${await control.getAttribute('aria-label') ?? 'the requested catalog control'}`);
}

async function expectPagerFocus(button) {
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await expect(button).toBeInViewport();
  await expect(button).toBeFocused();
}

async function typeCatalogSearch(page, query, { replace = false } = {}) {
  const search = catalogSearch(page);
  await search.focus();
  if (replace) await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(query);
  await expect(search).toHaveValue(query);
  await expect(search).toBeFocused();
  return search;
}

async function clearCatalogSearch(page) {
  const search = catalogSearch(page);
  await search.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
}

async function expectNoPickerSideEffects(capture, index) {
  await capture.stop();
  assert.deepEqual(capture.writes(), [], 'paging, selecting, and searching make no creator API writes');
  assert.deepEqual(index.reads, ['/catalog-selection.json'], 'picker interactions reuse the one initial selection-index read');
}

function focusCatalogEntries() {
  return Array.from({ length: 51 }, (_, index) => {
    const ordinal = String(index + 1).padStart(2, '0');
    return catalogEntry({
      id: `phase11-picker-${ordinal}`,
      title: index === 50 ? 'F10 unique search result' : `F10 picker entry ${ordinal}`,
      url: `https://picker.example.invalid/f10-${ordinal}`,
    });
  });
}

function linkWrites(capture) {
  return capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/referencias');
}

async function holdReferencePost(page, { commit }) {
  const gate = deferred();
  let arrive;
  const reached = new Promise((resolve) => { arrive = resolve; });
  let observed;
  const handler = async (route) => {
    const request = route.request();
    if (request.method() !== 'POST'
      || new URL(request.url()).pathname.replace(/\/$/u, '') !== '/api/creador/referencias') {
      await route.continue();
      return;
    }
    let actual;
    if (commit) {
      actual = await route.fetch();
      observed = { status: actual.status(), body: await actual.json() };
    }
    arrive();
    await gate.promise;
    if (actual) await route.fulfill({ response: actual, status: 503 });
    else await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'SERVICE_UNAVAILABLE' }) });
  };
  await page.route('**/api/creador/**', handler);
  return {
    reached,
    get observed() { return observed; },
    release: () => gate.release(),
    async remove() {
      gate.release();
      await page.unroute('**/api/creador/**', handler).catch(() => {});
    },
  };
}

test('el catálogo público carga con reintento y busca por título y URL entre tipos publicados', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  const community = catalogEntry({
    id: 'phase5-catalog-community',
    title: 'Grupo de arquitectura serverless',
    url: 'https://communities.example.invalid/architecture',
    tipo: 'community',
  });
  const event = catalogEntry({
    id: 'phase5-catalog-event',
    title: 'Jornada de comunidades AWS',
    url: 'https://events.example.invalid/aws-community-day',
    tipo: 'event',
  });
  await seedCatalogRecord(fixture, community);
  await seedCatalogRecord(fixture, event);
  const firstLoad = deferred();
  const index = await serveSelectionIndex(page, [community, event], {
    firstBody: '{malformed',
    firstGate: firstLoad,
  });
  const capture = await captureCreatorApi(page);

  await openOwnerCatalog(page, fixture);
  await expect(page.getByRole('status').filter({ hasText: /cargando el cat\u00e1logo/i })).toBeVisible();
  firstLoad.release();
  await expect(page.getByRole('button', { name: /Reintentar.*cat\u00e1logo/i })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /no pudimos leer el cat\u00e1logo/i })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /no hay recursos que coincidan/i })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Resultados del cat\u00e1logo' }).getByRole('radio')).toHaveCount(0);
  await page.getByRole('button', { name: /Reintentar.*cat\u00e1logo/i }).click();
  await expect(catalogRadio(page, event.title)).toBeVisible();
  await expect(page.locator('[data-catalog-index-status]')).toHaveCount(0,
    'the ready picker keeps its result count in one dedicated live region');
  await expect(page.locator('[data-catalog-count]')).toHaveCount(1);
  assert.equal(index.reads.length, 2, 'one failed public-index read and the explicit retry reached the provider boundary');

  const search = catalogSearch(page);
  await search.fill('aws-community-day');
  await search.press('Enter');
  await expect(catalogRadio(page, event.title)).toBeVisible();
  await expect(catalogRadio(page, community.title)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText(event.url);

  await search.fill('architecture');
  await search.press('Enter');
  await expect(catalogRadio(page, community.title)).toBeVisible();
  await expect(catalogRadio(page, event.title)).toHaveCount(0);

  await search.fill('no existe en el catálogo de prueba');
  await search.press('Enter');
  await expect(page.getByRole('dialog').locator('[data-catalog-count]')).toHaveText('0 resultados');
  await expect(page.getByRole('list', { name: 'Resultados del catálogo' }).getByRole('radio')).toHaveCount(0);
  assert.deepEqual(linkWrites(capture), [], 'searches and a valid zero-result response do not write owner data');
  await capture.stop();
});

for (const mode of ['reference', 'claim']) {
  const openPicker = mode === 'reference' ? openOwnerCatalog : openOwnerClaimCatalog;
  const pickerLabel = mode === 'reference' ? 'referencias' : 'reclamaciones';

  test(`el selector de ${pickerLabel} enfoca el paginador opuesto al desactivar Anterior en el primer límite`, async ({ fixture, page }) => {
    await loggedInOwner(fixture, page);
    const entries = focusCatalogEntries();
    const index = await serveSelectionIndex(page, entries);
    await openPicker(page, fixture);
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 1 de 3');
    const capture = await captureCreatorApi(page);

    const selected = catalogPickerSelection(page, entries[0], mode);
    await selected.check();
    const previous = catalogPageButton(page, 'previous');
    const next = catalogPageButton(page, 'next');
    await tabToCatalogControl(page, next);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 2 de 3');
    await expectPagerFocus(next);

    await page.keyboard.press('Shift+Tab');
    await expectPagerFocus(previous);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 1 de 3');
    await expect(previous).toBeDisabled();
    await expectPagerFocus(next);
    await expect(selected).toBeChecked();

    await page.keyboard.press('Enter');
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 2 de 3');
    await expectPagerFocus(next);

    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 1 de 3');
    await expectPagerFocus(next);
    await typeCatalogSearch(page, 'F10');
    await expect(page.locator('[data-catalog-count]')).toHaveText('51 resultados');
    await clearCatalogSearch(page);
    await expect(selected).toBeChecked();
    await expectNoPickerSideEffects(capture, index);
  });

  test(`el selector de ${pickerLabel} conserva selección y enfoca Anterior al desactivar Siguiente en el último límite`, async ({ fixture, page }) => {
    await loggedInOwner(fixture, page);
    const entries = focusCatalogEntries();
    const index = await serveSelectionIndex(page, entries);
    await openPicker(page, fixture);
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 1 de 3');
    const capture = await captureCreatorApi(page);

    const next = catalogPageButton(page, 'next');
    const previous = catalogPageButton(page, 'previous');
    await tabToCatalogControl(page, next);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 2 de 3');
    await expectPagerFocus(next);

    const selected = catalogPickerSelection(page, entries[25], mode);
    await selected.check();
    await tabToCatalogControl(page, next);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 3 de 3');
    await expect(next).toBeDisabled();
    await expectPagerFocus(previous);

    await page.keyboard.press('Enter');
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 2 de 3');
    await expectPagerFocus(previous);
    await expect(selected).toBeChecked();

    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 3 de 3');
    await expectPagerFocus(previous);
    await typeCatalogSearch(page, 'F10');
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 1 de 3');
    await expect(page.locator('[data-catalog-count]')).toHaveText('51 resultados');
    await clearCatalogSearch(page);
    await expectNoPickerSideEffects(capture, index);
  });

  test(`el selector de ${pickerLabel} conserva el foco y la selección al buscar desde una página interior`, async ({ fixture, page }) => {
    await loggedInOwner(fixture, page);
    const entries = focusCatalogEntries();
    const index = await serveSelectionIndex(page, entries);
    await openPicker(page, fixture);
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 1 de 3');
    const capture = await captureCreatorApi(page);

    const selected = catalogPickerSelection(page, entries[0], mode);
    await selected.check();
    const next = catalogPageButton(page, 'next');
    await tabToCatalogControl(page, next);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 2 de 3');
    await expectPagerFocus(next);

    await typeCatalogSearch(page, entries[0].title);
    await expect(page.locator('[data-catalog-count]')).toHaveText('1 resultado');
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 1 de 1');
    await expect(catalogPickerSelection(page, entries[0], mode)).toBeChecked();
    await expect(catalogPageButton(page, 'previous')).toBeDisabled();
    await expect(next).toBeDisabled();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('list', { name: 'Resultados del catálogo' })).toBeFocused();
    await expect(catalogPickerSelection(page, entries[0], mode)).toBeChecked();

    await typeCatalogSearch(page, 'no matching F10 result', { replace: true });
    await expect(page.locator('[data-catalog-count]')).toHaveText('0 resultados');
    await expect(page.locator('[data-catalog-empty]')).toBeVisible();
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 1 de 1');
    await expect(catalogPageButton(page, 'previous')).toBeDisabled();
    await expect(next).toBeDisabled();

    await clearCatalogSearch(page);
    await expect(page.locator('[data-catalog-count]')).toHaveText('51 resultados');
    await expect(page.locator('[data-catalog-page-label]')).toHaveText('Página 1 de 3');
    await expect(catalogPageButton(page, 'previous')).toBeDisabled();
    await expect(next).toBeEnabled();
    await expect(selected).toBeChecked();
    if (mode === 'claim') {
      await expect(page.locator('[data-claim-selection]')).toContainText(entries[0].title);
    }
    await expectNoPickerSideEffects(capture, index);
  });
}

test('referenciar contenido existente conserva la colocación; una referencia nueva respeta la opción sin conceder edición', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const existing = await addLink(fixture, cookie, {
    title: 'Contenido propio ya agregado',
    url: 'https://owner-content.example.invalid/guide',
  });
  const existingOwner = (await api(fixture, cookie, '/api/creador/perfil')).body;
  const existingPlacement = await fixture.rawPlacement(cookie, existing.placementId);
  const existingResource = await fixture.rawResource(existing.resourceId);
  assert.ok(existingResource, 'the add acknowledgement identifies a resource in the canonical catalog');
  const shared = catalogEntry({
    id: 'phase5-catalog-shared-event',
    title: 'Evento compartido de la comunidad',
    url: 'https://events.example.invalid/shared-day',
    tipo: 'event',
  });
  await seedCatalogRecord(fixture, shared);
  await serveSelectionIndex(page, [
    catalogEntry({ id: existing.resourceId, title: existingResource.title, url: existingResource.url, tipo: 'source' }),
    shared,
  ]);
  const capture = await captureCreatorApi(page);

  await openOwnerCatalog(page, fixture);
  const search = catalogSearch(page);
  await search.fill(existingResource.url);
  await search.press('Enter');
  await catalogRadio(page, existingResource.title).check();
  await expect(page.getByRole('dialog').getByRole('checkbox', { name: /proponer al directorio/i })).toBeChecked();
  await page.getByRole('button', { name: /Agregar a mi p\u00e1gina/i }).click();
  await expect(page.getByRole('status').filter({ hasText: /ya estaba en tu p\u00e1gina|conservamos su ficha/i }).first()).toBeVisible();
  assert.equal(linkWrites(capture).length, 1);
  await expect.poll(() => linkWrites(capture)[0]?.status).toBe(200);
  assert.equal(linkWrites(capture)[0].status, 200, 'the real service identifies an already linked resource');
  assert.equal(linkWrites(capture)[0].responseBody.operation, 'reference-link');
  assert.equal(linkWrites(capture)[0].responseBody.disposition, 'already-present');
  assert.deepEqual(await fixture.rawPlacement(cookie, existing.placementId), existingPlacement,
    'the existing placement, options, ordering, and version remain unchanged');
  assert.deepEqual(await fixture.rawResource(existing.resourceId), existingResource,
    'the existing content record is unchanged');
  assert.deepEqual((await api(fixture, cookie, '/api/creador/perfil')).body, existingOwner,
    'the duplicate reference leaves the canonical owner snapshot unchanged');

  // Open a fresh reference intent and use the server's catalog record, which is an event
  // whose actual registration URL is the URL carried through the published index.
  const dialog = page.getByRole('dialog');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: /Buscar en el cat\u00e1logo/i }).click();
  const freshSearch = dialog.getByRole('searchbox').first();
  await freshSearch.fill(shared.title);
  await freshSearch.press('Enter');
  await catalogRadio(page, shared.title).check();
  const directory = dialog.getByRole('checkbox', { name: /proponer al directorio/i });
  await expect(directory).toBeChecked();
  await directory.uncheck();
  const beforeReference = (await api(fixture, cookie, '/api/creador/perfil')).body;
  const sharedBefore = await fixture.rawResource(shared.id);
  await page.getByRole('button', { name: /Agregar a mi p\u00e1gina/i }).click();

  const row = page.getByRole('row').filter({ hasText: shared.title });
  await expect(row).toBeVisible();
  assert.equal(linkWrites(capture).length, 2);
  await expect.poll(() => linkWrites(capture)[1]?.status).toBe(201);
  const newReference = linkWrites(capture)[1];
  assert.equal(newReference.status, 201);
  assert.deepEqual(newReference.body, {
    resourceId: shared.id,
    url: shared.url,
    selectedForDirectory: false,
    creatorVersion: beforeReference.creatorVersion,
  });
  assert.equal(newReference.responseBody.operation, 'reference-link');
  assert.equal(newReference.responseBody.disposition, 'attached');
  assert.equal(newReference.responseBody.resourceId, shared.id);
  assert.ok(newReference.responseBody.placementId);
  const added = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(added.response.status, 200);
  assert.ok(added.body.creatorVersion > beforeReference.creatorVersion);
  assert.deepEqual(added.body.placements[newReference.responseBody.placementId], {
    resourceId: shared.id,
    selectedForDirectory: false,
  }, 'the explicit directory choice is saved on this placement');
  assert.equal(added.body.resources.find(({ id }) => id === shared.id).url, shared.url,
    'the real owner read exposes the current shared registration URL');
  assert.deepEqual(await fixture.rawResource(shared.id), sharedBefore,
    'referencing shared event content does not alter its metadata or grant its editor record');
  assert.equal(added.body.resources.find(({ id }) => id === shared.id).metadataEditable, false);
  await expect(row.getByRole('button', { name: /Editar ficha/i })).toHaveCount(0);
  await expect(row.getByRole('button', { name: /Editar opciones/i })).toBeVisible();

  const deniedMetadataEdit = await api(fixture, cookie, `/api/creador/recursos/?id=${encodeURIComponent(shared.id)}`, {
    method: 'PATCH',
    body: { resourceVersion: sharedBefore.version, title: 'Cambio no autorizado' },
  });
  assert.equal(deniedMetadataEdit.response.status, 403, 'the real authorization boundary rejects metadata edits to referenced shared content');
  assert.deepEqual(await fixture.rawResource(shared.id), sharedBefore);
  assert.equal(linkWrites(capture).length, 2, 'reconciliation and the forbidden metadata attempt do not replay either reference');
  await capture.stop();
});

test('un RESOURCE_CONFLICT exige actualizar el índice, revisar la URL actual y confirmar una segunda vez', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const oldItem = catalogEntry({
    id: 'phase5-catalog-stale-url',
    title: 'Evento con destino actualizado',
    url: 'https://events.example.invalid/old-registration',
    tipo: 'event',
  });
  const currentItem = { ...oldItem, url: 'https://events.example.invalid/current-registration' };
  // The public index is intentionally stale while the actual resource and URL
  // reservation already contain the current registration destination.
  await seedCatalogRecord(fixture, currentItem);
  const index = await serveSelectionIndex(page, [oldItem]);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });

  await openOwnerCatalog(page, fixture);
  await catalogRadio(page, oldItem.title).check();
  const initial = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(initial.response.status, 200);
  await page.getByRole('button', { name: /Agregar a mi p\u00e1gina/i }).click();
  await expect.poll(() => linkWrites(capture).length).toBe(1);
  await expect.poll(() => linkWrites(capture)[0]?.status).toBe(409);
  const staleAttempt = linkWrites(capture)[0];
  assert.equal(staleAttempt.status, 409);
  assert.deepEqual(staleAttempt.body, {
    resourceId: oldItem.id,
    url: oldItem.url,
    creatorVersion: initial.body.creatorVersion,
    selectedForDirectory: true,
  });
  const rejectedOwner = await api(fixture, cookie, '/api/creador/perfil');
  assert.deepEqual(rejectedOwner.body, initial.body,
    'the stale catalog pair does not create a placement or change the owner revision');
  assert.equal(Object.values(rejectedOwner.body.placements).some(({ resourceId }) => resourceId === oldItem.id), false);
  await expect(page.locator('[data-owner-recovery][data-recovery-kind="conflict"]')).toBeVisible();
  await page.getByRole('button', { name: 'Volver al borrador', exact: true }).click();
  const refreshCatalog = page.getByRole('button', { name: 'Actualizar catálogo', exact: true });
  await expect(refreshCatalog).toBeVisible();
  await expect(page.locator('[data-catalog-index-status]')).toContainText('Actualiza el catálogo');
  assert.equal(linkWrites(capture).length, 1, 'the rejected pair was not silently converted or resent');

  index.replace([currentItem]);
  await refreshCatalog.click();
  await expect(page.getByRole('dialog')).toContainText(currentItem.url);
  await expect(catalogRadio(page, oldItem.title)).not.toBeChecked();
  assert.equal(index.reads.length, 2, 'the updated public catalog is read only after the explicit retry');
  assert.equal(linkWrites(capture).length, 1, 'refreshing the index itself does not send a new reference');

  await catalogRadio(page, currentItem.title).check();
  await page.getByRole('button', { name: /Agregar a mi p\u00e1gina/i }).click();
  await expect.poll(() => linkWrites(capture).length).toBe(2);
  await expect.poll(() => linkWrites(capture)[1]?.status).toBe(201);
  assert.equal(linkWrites(capture)[1].status, 201);
  assert.equal(linkWrites(capture)[1].responseBody.operation, 'reference-link');
  assert.equal(linkWrites(capture)[1].responseBody.disposition, 'attached');
  assert.equal(linkWrites(capture)[1].body.url, currentItem.url,
    'the second explicit command uses the currently published event registration URL');
  assert.equal(linkWrites(capture)[1].body.creatorVersion, initial.body.creatorVersion);
  const savedResource = await fixture.rawResource(currentItem.id);
  const after = await api(fixture, cookie, '/api/creador/perfil');
  assert.ok(after.body.creatorVersion > initial.body.creatorVersion);
  assert.equal(savedResource.registrationUrl, currentItem.url);
  const savedPlacement = Object.entries(after.body.placements).find(([, placement]) => placement.resourceId === currentItem.id);
  assert.ok(savedPlacement);
  assert.equal(after.body.resources.find(({ id }) => id === currentItem.id).url, currentItem.url);
  assert.equal(savedPlacement[1].selectedForDirectory, true);
  assert.equal(after.body.resources.find(({ id }) => id === currentItem.id).metadataEditable, false);
  assert.equal(linkWrites(capture).length, 2, 'the confirmed retry is one write and the stale pair was never replayed');
  await capture.stop();
});

test('una referencia confirmada con acuse perdido permanece incierta hasta una decisión explícita', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const item = catalogEntry({
    id: 'phase5-reference-ack-lost',
    title: 'Referencia confirmada sin acuse',
    url: 'https://catalog.example.invalid/reference-ack-lost',
    tipo: 'community',
  });
  await seedCatalogRecord(fixture, item);
  await serveSelectionIndex(page, [item]);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const initial = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(initial.response.status, 200);
  const beforeResource = await fixture.rawResource(item.id);
  await openOwnerCatalog(page, fixture);
  await catalogRadio(page, item.title).check();
  const dialog = page.getByRole('dialog');
  const form = dialog.locator('form[data-owner-form="referencia"]');
  const directory = form.getByRole('checkbox', { name: 'Proponer al directorio', exact: true });
  await expect(directory).toBeChecked();

  const held = await holdReferencePost(page, { commit: true });
  let submit;
  try {
    submit = page.getByRole('button', { name: /Agregar a mi página/i }).click();
    await held.reached;
    const attempted = linkWrites(capture)[0];
    assert.ok(attempted, 'the real reference POST reached the service before its reply was held');
    assert.deepEqual(attempted.body, {
      resourceId: item.id,
      url: item.url,
      selectedForDirectory: true,
      creatorVersion: initial.body.creatorVersion,
    });
    await expect(directory).toBeDisabled();
    assert.equal(held.observed.status, 201);
    assert.equal(held.observed.body.operation, 'reference-link');
    assert.equal(held.observed.body.disposition, 'attached');
    held.release();
    await submit;
  } finally {
    held.release();
    await held.remove();
    await submit?.catch(() => {});
  }

  await expect(page.locator('[data-owner-recovery][data-recovery-kind="unknown"]')).toBeVisible();
  await page.getByRole('button', { name: 'Comprobar estado guardado', exact: true }).click();
  await capture.settle({ skipErrorBodies: true });
  const checked = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(checked.response.status, 200);
  const placement = Object.entries(checked.body.placements).find(([, value]) => value.resourceId === item.id);
  assert.ok(placement, 'the full owner read sees the committed reference');
  assert.equal(checked.body.resources.find(({ id }) => id === item.id).metadataEditable, false,
    'a reference does not grant metadata authority');
  await expect(page.locator('[data-owner-recovery][data-recovery-kind="unknown"]')).toBeVisible();
  assert.equal(linkWrites(capture).length, 1, 'the read does not replay the reference POST');

  await page.getByRole('button', { name: 'Usar lo guardado', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await api(fixture, cookie, '/api/creador/perfil');
  assert.deepEqual(saved.body.placements[placement[0]], {
    resourceId: item.id,
    selectedForDirectory: true,
  });
  assert.deepEqual(await fixture.rawResource(item.id), beforeResource,
    'the acknowledged reference and recovery read leave shared metadata unchanged');
  assert.equal(linkWrites(capture).length, 1, 'the explicit saved-state choice sends no second write');
  await capture.stop({ skipErrorBodies: true });
});

import assert from 'node:assert/strict';
import {
  test, expect, addCookie, api, createSeries, addLink, addChapter, captureCreatorApi, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

async function privatePage(response, page, status = 200) {
  assert.equal(response.status(), status);
  const headers = await response.allHeaders();
  assert.match(headers['cache-control'] ?? '', /private.*no-store/i);
  assert.equal(headers['referrer-policy'], 'no-referrer');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  assert.doesNotMatch(await response.text(), /analytics\.js|googletagmanager|google-analytics/i);
}

function linkRow(page, placementId) {
  return page.locator('[data-link-row]').filter({ has: page.locator('[data-link-edit][data-placement-id="' + placementId + '"]') });
}

async function initialScriptsGate(page) {
  let release;
  let notify;
  const requested = new Promise((resolve) => { notify = resolve; });
  const released = new Promise((resolve) => { release = resolve; });
  const handler = async (route) => {
    if (route.request().resourceType() === 'script') {
      notify();
      await released;
    }
    await route.continue();
  };
  await page.route('**/*', handler);
  return { requested, release, async close() { release(); await page.unroute('**/*', handler).catch(() => {}); } };
}

test('Enlaces: el texto y los filtros elegidos antes de hidratar se conservan y la consulta siguiente usa esos valores', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Ruta pendiente', slug: 'ruta-pendiente' });
  const initial = await addLink(fixture, cookie, { title: 'Aplicada única', url: 'https://shell.example/aplicada' });
  const a = await addLink(fixture, cookie, { title: 'Pendiente A', url: 'https://shell.example/a' });
  const b = await addLink(fixture, cookie, { title: 'Pendiente B', url: 'https://shell.example/b' });
  await addChapter(fixture, cookie, series.id, a.placementId);
  await addChapter(fixture, cookie, series.id, b.placementId);
  const before = (await api(fixture, cookie, '/api/creador/perfil')).body;
  const gate = await initialScriptsGate(page);
  let navigation;
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  try {
    navigation = page.goto(fixture.origin + '/cuenta/?vista=enlaces&buscar=Aplicada', { waitUntil: 'load' });
    await gate.requested;
    const filters = page.locator('form[data-link-filters]');
    await expect(linkRow(page, initial.placementId)).toBeVisible();
    await filters.getByRole('searchbox').fill('Pendiente');
    await filters.locator('select[name="serie"]').selectOption(series.id);
    await filters.locator('select[name="directorio"]').selectOption('pendientes');
    await filters.locator('select[name="destacado"]').selectOption('no');
    await filters.locator('select[name="orden"]').selectOption('titulo-desc');
    assert.equal(new URL(page.url()).searchParams.get('buscar'), 'Aplicada');
    await expect(linkRow(page, initial.placementId)).toBeVisible();
    const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
    gate.release();
    await navigation;
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin,
      'the controls must be observed in the SSR document edited before hydration');
    await expect(filters.getByRole('searchbox')).toHaveValue('Pendiente');
    await expect(filters.locator('select[name="serie"]')).toHaveValue(series.id);
    await expect(filters.locator('select[name="directorio"]')).toHaveValue('pendientes');
    await expect(filters.locator('select[name="destacado"]')).toHaveValue('no');
    await expect(filters.locator('select[name="orden"]')).toHaveValue('titulo-desc');
    // Enlaces keeps its ordinary automatic enhancement; GET submit remains an explicit fallback.
    await filters.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('buscar') === 'Pendiente'
      && url.searchParams.get('serie') === series.id && url.searchParams.get('directorio') === 'pendientes'
      && url.searchParams.get('destacado') === 'no' && url.searchParams.get('orden') === 'titulo-desc'
      && (url.searchParams.get('paginaEnlaces') ?? '1') === '1');
    await expect(page.locator('[data-link-row]')).toHaveCount(2);
    await expect(page.locator('[data-link-title]')).toHaveText(['Pendiente B', 'Pendiente A']);
    await capture.settle();
    assert.equal(capture.writes().length, 0, 'consulting the table never writes or changes directory selection');
    assert.deepEqual((await api(fixture, cookie, '/api/creador/perfil')).body, before);
  } finally {
    gate.release();
    await navigation?.catch(() => {});
    await gate.close();
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Enlaces: SSR sin JavaScript mantiene GET, escapa los títulos y deshabilita sólo mutaciones hasta hidratar', async ({ fixture, page, browser }) => {
  const cookie = await loggedInOwner(fixture, page);
  const title = 'Contenido </script><img data-owner-injection src=x> seguro';
  const link = await addLink(fixture, cookie, { title, url: 'https://shell.example/seguro' });
  const context = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
  try {
    await addCookie(context, fixture, cookie);
    const ssr = await context.newPage();
    await privatePage(await ssr.goto(fixture.origin + '/cuenta/?vista=enlaces'), ssr);
    await expect(ssr.locator('astro-island')).toHaveCount(1);
    await expect(linkRow(ssr, link.placementId)).toContainText(title);
    await expect(ssr.locator('[data-owner-injection]')).toHaveCount(0);
    await expect(ssr.getByRole('button', { name: 'Agregar enlace', exact: true })).toBeDisabled();
    await expect(ssr.getByRole('button', { name: 'Buscar en el catálogo', exact: true })).toBeDisabled();
    await expect(linkRow(ssr, link.placementId).getByRole('button', { name: 'Editar ficha', exact: true })).toBeDisabled();
    const filters = ssr.locator('[data-link-filters]');
    await expect(filters.getByRole('searchbox')).toBeEnabled();
    await filters.getByRole('searchbox').fill('sin coincidencia');
    await filters.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    await expect(ssr).toHaveURL(/buscar=sin(?:\+|%20)coincidencia/);
    await expect(ssr.locator('[data-link-row]')).toHaveCount(0);
    await expect(ssr.locator('[data-link-count]')).toHaveText('0 coincidencias de 1 enlace');
  } finally {
    await context.close();
  }
});

test('Enlaces: una URL inicialmente inválida sigue siendo un error privado400 después de hidratar', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  await addLink(fixture, cookie, { title: 'No se usa como resultado vacío' });
  for (const query of [
    'directorio=otro', 'paginaEnlaces=0', 'orden=otro', 'destacado=otro',
    'buscar=a&buscar=b', 'serie=serie-nunca-valida',
  ]) {
    const scripts = await initialScriptsGate(page);
    try {
      const response = await page.goto(fixture.origin + '/cuenta/?vista=enlaces&' + query, { waitUntil: 'commit' });
      // Observe the SSR response before a defective runtime can navigate away from it.
      await privatePage(response, page, 400);
      scripts.release();
      await page.waitForLoadState('load');
      await expect(page.locator('astro-island')).toHaveCount(1);
      await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
      await expect(page.getByRole('alert').filter({ hasText: 'La búsqueda o los filtros' })).toBeVisible();
      await expect(page.locator('[data-link-row]:visible')).toHaveCount(0);
      await expect(page.locator('[data-link-empty]:visible')).toHaveCount(0);
      assert.equal(new URL(page.url()).search, '?vista=enlaces&' + query);
    } finally {
      await scripts.close();
    }
  }
});

test('Enlaces: Atrás a un filtro de serie antes válido y ahora eliminado normaliza sólo ese filtro y deja la lista utilizable', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Ruta temporal', slug: 'ruta-temporal' });
  const link = await addLink(fixture, cookie, { title: 'Guía que permanece', url: 'https://shell.example/permanente' });
  await addChapter(fixture, cookie, series.id, link.placementId);
  await page.goto(fixture.origin + '/cuenta/?vista=enlaces&buscar=Gu%C3%ADa&serie=' + series.id + '&orden=titulo-desc');
  await expect(linkRow(page, link.placementId)).toBeVisible();
  await page.getByRole('navigation', { name: 'Secciones de Tu página' }).getByRole('link', { name: 'Estadísticas', exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('vista') === 'estadisticas');
  const beforeDelete = (await fixture.rawOwner(cookie)).profile;
  const deletion = await api(fixture, cookie, '/api/creador/series/' + series.id, {
    method: 'DELETE', body: { version: series.version, profileVersion: beforeDelete.version },
  });
  assert.equal(deletion.response.status, 204);
  await page.goBack();
  await expect(page).toHaveURL((url) => url.searchParams.get('vista') === 'enlaces'
    && (url.searchParams.get('serie') ?? 'todos') === 'todos'
    && url.searchParams.get('buscar') === 'Guía' && url.searchParams.get('orden') === 'titulo-desc');
  await expect(linkRow(page, link.placementId)).toBeVisible();
  const search = page.getByRole('searchbox', { name: 'Buscar título, URL o serie', exact: true });
  await expect(search).toBeFocused();
  await search.fill('permanente');
  await expect(linkRow(page, link.placementId)).toBeVisible();
  await search.fill('sin resultado');
  await expect(page.locator('[data-link-count]')).toHaveText('0 coincidencias de 1 enlace');
  await search.fill('');
  await expect(linkRow(page, link.placementId)).toBeVisible();
  await linkRow(page, link.placementId).getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const form = page.locator('[data-owner-dialog] form[data-owner-form="enlace"]');
  await form.getByLabel('Título', { exact: true }).fill('Guía posterior al historial');
  await form.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(form).not.toBeVisible();
  assert.equal((await fixture.rawResource(link.resourceId)).title, 'Guía posterior al historial');
});

test('la llegada sin perfil respeta fragmentos, clic modificado y la guardia del encabezado sin perder el nombre ni crear una página al descartar', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  try {
    await page.goto(fixture.origin + '/cuenta/');
    const form = page.locator('form[data-owner-form="crear"]');
    await form.getByLabel('Nombre visible', { exact: true }).fill('Nombre que debe conservarse');
    await form.getByLabel('Dirección de tu página', { exact: true }).fill('nombre-conservado');
    await page.getByRole('link', { name: 'Saltar al contenido', exact: true }).press('Enter');
    await expect(page).toHaveURL(/#contenido$/);
    await expect(page.locator('[data-owner-exit-prompt]')).not.toBeVisible();
    const home = page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: 'Inicio', exact: true });
    const popupPromise = page.context().waitForEvent('page');
    await home.click({ modifiers: ['ControlOrMeta'] });
    const popup = await popupPromise;
    await popup.waitForURL(fixture.origin + '/');
    assert.equal(new URL(popup.url()).pathname, '/');
    await popup.close();
    await expect(form.getByLabel('Nombre visible', { exact: true })).toHaveValue('Nombre que debe conservarse');
    await expect(page.locator('[data-owner-exit-prompt]')).not.toBeVisible();
    await home.click();
    const prompt = page.locator('[data-owner-exit-prompt]');
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Seguir editando', exact: true }).click();
    await expect(form.getByLabel('Nombre visible', { exact: true })).toHaveValue('Nombre que debe conservarse');
    await expect(form.getByLabel('Dirección de tu página', { exact: true })).toHaveValue('nombre-conservado');
    await home.click();
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: /^Descartar(?: cambios)?$/ }).click();
    await expect(page).toHaveURL(fixture.origin + '/');
    await capture.settle();
    assert.equal(capture.writes().length, 0);
    assert.equal((await fixture.rawOwner(cookie)).profile, null);
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('Enlaces móvil:0,1 y50 filas conservan búsqueda, validación nativa, edición y foco sin cambiar el orden público', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const capture = await captureCreatorApi(page, { ignoreReads: true });
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await page.goto(fixture.origin + '/cuenta/?vista=enlaces');
    await expect(page.locator('[data-link-count]')).toHaveText('0 coincidencias de 0 enlaces');
    await expect(page.getByRole('button', { name: 'Agregar enlace', exact: true })).toBeVisible();
    const title = 'Destino largo móvil '.padEnd(200, 'x');
    const link = await addLink(fixture, cookie, { title, url: 'https://shell.example/largo' });
    await page.reload();
    await expect(page.locator('[data-link-count]')).toHaveText('1 coincidencia de 1 enlace');
    await expect(linkRow(page, link.placementId)).toContainText(title);
    const sizes = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.equal(sizes.width, 390); assert.ok(sizes.scroll <= sizes.width);
    await linkRow(page, link.placementId).getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const form = page.locator('[data-owner-dialog] form[data-owner-form="enlace"]');
    await form.getByLabel('URL', { exact: true }).fill('no-es-una-url');
    await form.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    assert.equal(await form.getByLabel('URL', { exact: true }).evaluate((input) => input.checkValidity()), false);
    assert.equal(capture.writes().length, 0);
    await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.locator('[data-owner-exit-prompt]').getByRole('button', { name: /^Descartar(?: cambios)?$/ }).click();
    await expect(form).not.toBeVisible();
    for (let index = 1; index < 50; index += 1) {
      await addLink(fixture, cookie, { title: 'Otra guía ' + String(index).padStart(2, '0'), url: 'https://shell.example/volumen/' + index });
    }
    const before = (await api(fixture, cookie, '/api/creador/perfil')).body;
    await page.reload();
    await expect(page.locator('[data-link-count]')).toHaveText('50 coincidencias de 50 enlaces');
    await expect(page.locator('[data-link-row]')).toHaveCount(25);
    const search = page.getByRole('searchbox', { name: 'Buscar título, URL o serie', exact: true });
    await search.fill('Destino largo móvil');
    await expect(page.locator('[data-link-count]')).toHaveText('1 coincidencia de 50 enlaces');
    await expect(search).toBeFocused();
    await linkRow(page, link.placementId).getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const validUrl = form.getByLabel('URL', { exact: true });
    assert.equal(await validUrl.evaluate((input) => input.checkValidity()), true);
    await expect(validUrl).toHaveValue('https://shell.example/largo');
    const updatedTitle = 'Destino largo móvil editado '.padEnd(200, 'z');
    await form.getByLabel('Título', { exact: true }).fill(updatedTitle);
    await form.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(form).not.toBeVisible();
    await capture.settle();
    assert.equal(capture.writes().length, 1);
    const after = (await api(fixture, cookie, '/api/creador/perfil')).body;
    assert.equal((await fixture.rawResource(link.resourceId)).title, updatedTitle);
    assert.deepEqual(after.links.map(({ placementId, position, featured, selectedForDirectory, series }) => ({ placementId, position, featured, selectedForDirectory, series })),
      before.links.map(({ placementId, position, featured, selectedForDirectory, series }) => ({ placementId, position, featured, selectedForDirectory, series })));
    await expect(linkRow(page, link.placementId).getByRole('button', { name: 'Editar ficha', exact: true })).toBeFocused();
    await expect(search).toHaveValue('Destino largo móvil');
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

import assert from 'node:assert/strict';
import { completeLogin, cookiePair } from '../fixtures/account-auth.mjs';
import {
  test, expect, addCookie, api, createProfile, createSeries, addLink, addChapter, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

async function noJavaScript(browser, fixture, cookie, use) {
  const context = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
  try {
    await addCookie(context, fixture, cookie);
    await use(await context.newPage());
  } finally {
    await context.close();
  }
}

async function assertPrivate(response, page, status = 200) {
  assert.equal(response.status(), status);
  const headers = await response.allHeaders();
  assert.match(headers['cache-control'] ?? '', /private.*no-store/i);
  assert.equal(headers['referrer-policy'], 'no-referrer');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  assert.doesNotMatch(await response.text(), /analytics\.js|gtag\(|google-analytics|googletagmanager/i);
}

async function seedHiddenResource(fixture, resourceId) {
  const stored = await fixture.rawResource(resourceId);
  assert.ok(stored);
  assert.equal(await fixture.creatorStore.transact({
    checks: [{ key: `resource:${resourceId}`, version: stored.version }],
    puts: [{ key: `resource:${resourceId}`, value: { ...stored, hidden: true, version: stored.version + 1 } }],
  }), true);
}

test('Series hidrata una sola isla SSR Preact que posee la cabecera y los editores, sin iniciar el controlador anterior', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  const scripts = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
  });
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const island = page.locator('astro-island');
  await expect(island).toHaveCount(1);
  await expect(island).toHaveAttribute('renderer-url', /preact/);
  await expect(island).not.toHaveAttribute('ssr', '');
  await expect(island.getByRole('heading', { name: 'Tu página', exact: true })).toBeVisible();
  await expect(island.getByRole('heading', { name: 'Series', exact: true })).toBeVisible();
  await island.getByRole('button', { name: 'Editar datos', exact: true }).click();
  const dialog = island.getByRole('dialog');
  await expect(dialog.getByLabel('Nombre visible')).toHaveValue('Ana Browser');
  await expect(dialog.getByRole('button', { name: 'Guardar datos', exact: true })).toBeVisible();
  assert.ok(!scripts.some((pathname) => /\/src\/scripts\/creator-owner\.ts$/u.test(pathname)),
    'the legacy controller is never loaded alongside the island');
});

test('la selección validada de vista decide el runtime y conserva los demás GET y la llegada sin perfil', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page, { profile: false });
  await page.goto(`${fixture.origin}/cuenta/`);
  await expect(page.getByRole('heading', { name: 'Prepara tu página', exact: true })).toBeVisible();
  await expect(page.locator('astro-island')).toHaveCount(0);

  const cookie = await fixture.login();
  await addCookie(page.context(), fixture, cookie);
  await createProfile(fixture, cookie);
  for (const [query, selected] of [
    ['', 'Enlaces'],
    ['vista=enlaces', 'Enlaces'],
    ['vista=estadisticas&periodo=30&pagina=1', 'Estadísticas'],
    ['vista=solicitudes', 'Solicitudes'],
    ['vista=series&vista=solicitudes', 'Solicitudes'],
  ]) {
    await page.goto(`${fixture.origin}/cuenta/${query ? `?${query}` : ''}`);
    await expect(page.getByRole('navigation', { name: 'Secciones de Tu página' })
      .getByRole('link', { name: selected, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('astro-island')).toHaveCount(0);
  }
  await page.goto(`${fixture.origin}/cuenta/?vista=estadisticas&vista=series`);
  await expect(page.getByRole('heading', { name: 'Series', exact: true })).toBeVisible();
  await expect(page.locator('astro-island')).toHaveCount(1);
});

test('el HTML privado de Series escapa la identidad, ofrece navegación real y permite buscar sin JavaScript', async ({ fixture, page, browser }) => {
  const displayName = 'Ana </script><img data-owner-injection src=x>';
  const cookie = await loggedInOwner(fixture, page, { profileFields: { displayName, bio: 'Bio <script data-owner-injection>bad()</script>' } });
  await createSeries(fixture, cookie, { name: 'Lambda desde cero', slug: 'lambda-desde-cero' });
  await createSeries(fixture, cookie, { name: 'Otra ruta', slug: 'otra-ruta' });
  await noJavaScript(browser, fixture, cookie, async (ssr) => {
    const response = await ssr.goto(`${fixture.origin}/cuenta/?vista=series`);
    await assertPrivate(response, ssr);
    await expect(ssr.getByRole('heading', { name: displayName, exact: true })).toBeVisible();
    await expect(ssr.locator('[data-owner-injection]')).toHaveCount(0);
    const navigation = ssr.getByRole('navigation', { name: 'Secciones de Tu página' });
    await expect(navigation.getByRole('link', { name: 'Enlaces', exact: true })).toHaveAttribute('href', '/cuenta/?vista=enlaces');
    await expect(navigation.getByRole('link', { name: 'Estadísticas', exact: true })).toHaveAttribute('href', '/cuenta/?vista=estadisticas&periodo=30&pagina=1');
    await expect(navigation.getByRole('link', { name: 'Solicitudes', exact: true })).toHaveAttribute('href', '/cuenta/?vista=solicitudes');
    await ssr.getByRole('searchbox', { name: 'Buscar series', exact: true }).fill('Lambda');
    await ssr.getByRole('button', { name: 'Aplicar búsqueda', exact: true }).click();
    await expect(ssr).toHaveURL(/buscarSeries=Lambda/);
    await expect(ssr.locator('[data-owner-series-row]')).toHaveCount(1);
    await expect(ssr.locator('[data-owner-series-row]')).toContainText('Lambda desde cero');
    await expect(ssr.getByRole('searchbox', { name: 'Buscar series', exact: true })).toHaveValue('Lambda');
    assert.doesNotMatch(await ssr.locator('main').innerText(), /vista previa/i);
  });
});

test('los cambios que requieren el runtime esperan su instalación; los controles GET del SSR permanecen utilizables', async ({ fixture, page, browser }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie);
  await addLink(fixture, cookie);
  await noJavaScript(browser, fixture, cookie, async (ssr) => {
    await ssr.goto(`${fixture.origin}/cuenta/?vista=series`);
    await expect(ssr.getByRole('searchbox', { name: 'Buscar series', exact: true })).toBeEnabled();
    await expect(ssr.getByRole('button', { name: 'Aplicar búsqueda', exact: true })).toBeEnabled();
    await expect(ssr.getByRole('button', { name: 'Crear serie', exact: true })).toBeDisabled();
    const row = ssr.locator(`[data-owner-series-row="${series.id}"]`);
    await expect(row.getByRole('button', { name: 'Editar', exact: true })).toBeDisabled();
    await expect(row.getByRole('button', { name: 'Eliminar', exact: true })).toBeDisabled();
    await row.getByRole('link', { name: 'Gestionar capítulos', exact: true }).click();
    await expect(ssr.getByRole('searchbox', { name: 'Buscar en tus enlaces', exact: true })).toBeEnabled();
    await expect(ssr.getByRole('button', { name: 'Agregar capítulo', exact: true })).toBeDisabled();
  });
});

test('el SSR pagina las 30 series y cuenta sólo capítulos visibles antes de filtrar', async ({ fixture, page, browser }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = [];
  for (let index = 0; index < 30; index += 1) {
    const number = String(index).padStart(2, '0');
    series.push(await createSeries(fixture, cookie, { name: `Ruta ${number}`, slug: `ruta-${number}` }));
  }
  const visible = await addLink(fixture, cookie, { title: 'Capítulo visible', url: 'https://series.example/visible' });
  const hidden = await addLink(fixture, cookie, { title: 'Capítulo oculto', url: 'https://series.example/oculto' });
  await addChapter(fixture, cookie, series[0].id, visible.placementId);
  await addChapter(fixture, cookie, series[0].id, hidden.placementId);
  await seedHiddenResource(fixture, hidden.resourceId);
  await noJavaScript(browser, fixture, cookie, async (ssr) => {
    await ssr.goto(`${fixture.origin}/cuenta/?vista=series&buscarSeries=Ruta&paginaSeries=1`);
    await expect(ssr.locator('[data-owner-series-row]')).toHaveCount(25);
    await expect(ssr.locator(`[data-owner-series-row="${series[0].id}"]`)).toContainText('1 capítulo visible');
    await ssr.getByRole('navigation', { name: 'Páginas de series', exact: true })
      .getByRole('link', { name: 'Siguiente', exact: true }).click();
    await expect(ssr.locator('[data-owner-series-row]')).toHaveCount(5);
    await expect(ssr.getByRole('searchbox', { name: 'Buscar series', exact: true })).toHaveValue('Ruta');
    await expect(ssr).toHaveURL(/paginaSeries=2/);
    await ssr.getByRole('searchbox', { name: 'Buscar series', exact: true }).fill('no-coincide');
    await ssr.getByRole('button', { name: 'Aplicar búsqueda', exact: true }).click();
    await expect(ssr.locator('[data-owner-series-row]')).toHaveCount(0);
    await expect(ssr.locator('[data-series-count]')).toHaveText('0 series');
    await expect(ssr.getByRole('button', { name: 'Crear serie', exact: true })).toBeVisible();
  });
});

test('el SSR busca y pagina los 58 enlaces completos, incluidos capítulos ocultos y enlaces compartidos sin autoridad editorial', async ({ fixture, page, browser }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Ruta de 58', slug: 'ruta-de-58' });
  const links = [];
  for (let index = 0; index < 57; index += 1) {
    links.push(await addLink(fixture, cookie, { title: `Capítulo ${String(index + 1).padStart(2, '0')}`, url: `https://series.example/58/${index}` }));
  }
  const oidc = fixture.accountHarness.state.oidc;
  const previousClaims = oidc.claims;
  let otherCookie;
  try {
    oidc.claims = { ...(previousClaims ?? {}), sub: 'shared-resource-owner', email: 'shared-owner@example.invalid' };
    const login = await completeLogin(fixture.accountHarness);
    assert.equal(login.response.status, 303);
    const pair = cookiePair(login.sessionCookie);
    otherCookie = { pair };
  } finally {
    if (previousClaims === undefined) delete oidc.claims;
    else oidc.claims = previousClaims;
  }
  await createProfile(fixture, otherCookie, { displayName: 'Otra creadora', slug: 'otra-creadora' });
  await addLink(fixture, otherCookie, { title: 'Capítulo compartido', url: 'https://series.example/shared-chapter' });
  const shared = await addLink(fixture, cookie, { title: 'Capítulo compartido', url: 'https://series.example/shared-chapter' });
  links.push(shared);
  for (const link of links.slice(0, 50)) await addChapter(fixture, cookie, series.id, link.placementId);
  await seedHiddenResource(fixture, links[6].resourceId);
  await noJavaScript(browser, fixture, cookie, async (ssr) => {
    await ssr.goto(`${fixture.origin}/cuenta/?vista=series&serie=${encodeURIComponent(series.id)}&pertenencia=todos&buscarCapitulos=Cap%C3%ADtulo&paginaCapitulos=3`);
    await expect(ssr.locator('[data-chapter-row]')).toHaveCount(8);
    await expect(ssr.locator('[data-chapter-count]')).toContainText('58 coincidencias de 58 enlaces');
    const sharedRow = ssr.locator(`[data-chapter-row="${shared.placementId}"]`);
    await expect(sharedRow).toContainText('Capítulo compartido');
    await expect(sharedRow.locator('[data-link-edit], input[name="title"], input[name="url"], textarea[name="description"]')).toHaveCount(0);
    await ssr.getByRole('searchbox', { name: 'Buscar en tus enlaces', exact: true }).fill('Capítulo 07');
    await ssr.getByLabel('Pertenencia', { exact: true }).selectOption('incluidos');
    await ssr.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    await expect(ssr.locator('[data-chapter-row]')).toHaveCount(1);
    const hidden = ssr.locator(`[data-chapter-row="${links[6].placementId}"]`);
    await expect(hidden).toContainText('Oculto en catálogo');
    await expect(hidden.getByRole('button', { name: 'Mover capítulo', exact: true })).toBeVisible();
    await expect(hidden.getByRole('button', { name: 'Quitar capítulo', exact: true })).toBeVisible();
  });
});

test('el SSR sólo ofrece una serie pública con perfil publicado, visible y capítulos visibles', async ({ fixture, page, browser }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, { name: 'Serie visible', slug: 'serie-visible' });
  const empty = await createSeries(fixture, cookie, { name: 'Serie vacía', slug: 'serie-vacia' });
  const link = await addLink(fixture, cookie);
  await addChapter(fixture, cookie, series.id, link.placementId);
  await noJavaScript(browser, fixture, cookie, async (ssr) => {
    const seriesRow = ssr.locator(`[data-owner-series-row="${series.id}"]`);
    await ssr.goto(`${fixture.origin}/cuenta/?vista=series`);
    await expect(seriesRow.getByRole('link', { name: 'Abrir serie pública', exact: true })).toHaveCount(0);
    const published = await api(fixture, cookie, '/api/creador/perfil/publicar', { method: 'POST', body: {} });
    assert.equal(published.response.status, 200, JSON.stringify(published.body));
    await ssr.reload();
    await expect(seriesRow.getByRole('link', { name: 'Abrir serie pública', exact: true }))
      .toHaveAttribute('href', '/c/ana-browser/series/serie-visible/');
    await expect(ssr.locator(`[data-owner-series-row="${empty.id}"]`).getByRole('link', { name: 'Abrir serie pública', exact: true })).toHaveCount(0);
    const { profile } = await fixture.rawOwner(cookie);
    assert.equal(await fixture.creatorStore.transact({
      checks: [{ key: `profile:${profile.id}`, version: profile.version }],
      puts: [{ key: `profile:${profile.id}`, value: { ...profile, hidden: true, version: profile.version + 1 } }],
    }), true);
    await ssr.reload();
    await expect(seriesRow.getByRole('link', { name: 'Abrir serie pública', exact: true })).toHaveCount(0);
  });
});

test('la consulta inválida SSR devuelve 400 privado y no finge una colección vacía', async ({ fixture, page, browser }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie);
  await addLink(fixture, cookie);
  await noJavaScript(browser, fixture, cookie, async (ssr) => {
    for (const query of [
      `serie=${series.id}&pertenencia=otro`,
      `serie=${series.id}&paginaCapitulos=0`,
      `serie=${series.id}&serie=${series.id}`,
      'serie=series-inexistente',
    ]) {
      const response = await ssr.goto(`${fixture.origin}/cuenta/?vista=series&${query}`);
      await assertPrivate(response, ssr, 400);
      await expect(ssr.locator('[data-series-query-error]')).toBeVisible();
      await expect(ssr.locator('[data-chapter-row]:visible')).toHaveCount(0);
      await expect(ssr.locator('[data-chapter-empty]:visible')).toHaveCount(0);
    }
  });
});

import assert from 'node:assert/strict';
import {
  test,
  expect,
  addCookie,
  api,
  createSeries,
  loggedInOwner,
  readOwnerSnapshot,
} from '../fixtures/creator-browser-test.mjs';

test('sin perfil Crear serie explica el requisito y se habilita después de crear el borrador', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);

  const createSeriesButton = page.getByRole('button', { name: 'Crear serie', exact: true });
  await expect(createSeriesButton).toBeDisabled();
  await expect(page.locator('[data-series-create-requirement]')).toContainText('Primero prepara tu página');

  const createForm = page.locator('form[data-owner-form="crear"]');
  await createForm.getByLabel('Nombre visible', { exact: true }).fill('Página para series');
  await createForm.getByLabel('Dirección de tu página', { exact: true }).fill('pagina-para-series');
  await createForm.getByRole('button', { name: 'Crear borrador', exact: true }).click();

  await expect(page.locator('[data-owner-create-panel]')).toHaveCount(0);
  await expect(createSeriesButton).toBeEnabled();
  await expect(page.locator('[data-series-create-requirement]')).toHaveCount(0);
  assert.equal((await fixture.rawOwner(cookie)).profile.slug, 'pagina-para-series');
});

test('la vista sin perfil separa la preparación, actividad y navegación en escritorio y móvil', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page, { profile: false });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    await page.setViewportSize(viewport);
    for (const query of ['vista=series', 'vista=solicitudes', 'vista=estadisticas&periodo=7&pagina=1']) {
      await page.goto(`${fixture.origin}/cuenta/?${query}`);
      const spacing = await page.evaluate(() => {
        const box = (selector) => document.querySelector(selector)?.getBoundingClientRect();
        const create = box('[data-owner-create-panel]');
        const activity = box('[data-owner-activity]');
        const navigation = box('nav[aria-label="Secciones de Tu página"]');
        const content = box('[data-owner-series], [data-owner-links], [data-owner-claims], [data-owner-statistics]');
        const next = activity ?? navigation;
        return {
          createToNext: create && next ? next.top - create.bottom : -1,
          activityToNavigation: activity && navigation ? navigation.top - activity.bottom : undefined,
          navigationToContent: navigation && content ? content.top - navigation.bottom : undefined,
        };
      });
      assert.ok(spacing.createToNext >= 18, `${viewport.width}px ${query} first-use gap: ${JSON.stringify(spacing)}`);
      if (spacing.activityToNavigation !== undefined) {
        assert.ok(spacing.activityToNavigation >= 18, `${viewport.width}px ${query} activity/navigation gap: ${JSON.stringify(spacing)}`);
      }
      if (spacing.navigationToContent !== undefined) {
        assert.ok(spacing.navigationToContent >= 18, `${viewport.width}px ${query} navigation/content gap: ${JSON.stringify(spacing)}`);
      }
    }
  }
});

test('sin perfil Estadísticas apunta al resumen visible y enfoca su encabezado', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page, { profile: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fixture.origin}/cuenta/?vista=series`);
  const statisticsLink = page.getByRole('navigation', { name: 'Secciones de Tu página' })
    .getByRole('link', { name: 'Estadísticas', exact: true });
  await expect(statisticsLink).toHaveAttribute('href', /#owner-activity-title$/);
  await statisticsLink.click();
  await expect(page).toHaveURL((url) => url.searchParams.get('vista') === 'estadisticas' && url.hash === '#owner-activity-title');
  const heading = page.getByRole('heading', { name: 'Estadísticas de tu página', exact: true });
  await expect(heading).toBeFocused();
  const box = await heading.boundingBox();
  assert.ok(box, 'the summary heading has a layout box');
  const viewportBottom = await page.evaluate(() => innerHeight);
  assert.ok(box.y >= 0 && box.y + box.height <= viewportBottom,
    `summary heading is in the viewport: ${JSON.stringify({ box, viewportBottom })}`);
});

test('la navegación de secciones mantiene GET y llega con foco al contenido', async ({ fixture, page, browser }) => {
  const cookie = await loggedInOwner(fixture, page, {
    profileFields: {
      displayName: 'Una identidad de creadora con un nombre suficientemente largo para probar el salto de sección',
      bio: 'Una biografía breve para mantener contenido antes de la sección seleccionada.',
      socials: {
        instagram: 'https://instagram.com/ana',
        x: 'https://x.com/ana',
        linkedin: 'https://linkedin.com/in/ana',
        awsBuilder: 'https://builder.aws.com/ana',
        website: 'https://ana.example.com/',
      },
    },
  });
  await createSeries(fixture, cookie, { name: 'Serie de navegación', slug: 'serie-de-navegacion' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);

  const navigation = page.getByRole('navigation', { name: 'Secciones de Tu página' });
  const seriesLink = navigation.getByRole('link', { name: 'Series', exact: true });
  await expect(seriesLink).toHaveAttribute('href', '/cuenta/?vista=series#owner-series-title');
  await seriesLink.click();
  await expect(page).toHaveURL((url) => url.searchParams.get('vista') === 'series' && url.hash === '#owner-series-title');
  const seriesHeading = page.getByRole('heading', { name: 'Series', exact: true });
  await expect(seriesHeading).toBeFocused();
  const headingBox = await seriesHeading.boundingBox();
  assert.ok(headingBox, 'the selected section heading has a layout box');
  const viewportBottom = await page.evaluate(() => innerHeight);
  assert.ok(headingBox.y >= 0 && headingBox.y + headingBox.height <= viewportBottom,
    `selected section is in the viewport: ${JSON.stringify({ headingBox, viewportBottom })}`);

  const ssrContext = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
  try {
    await addCookie(ssrContext, fixture, cookie);
    const ssr = await ssrContext.newPage();
    await ssr.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
    const ssrSeriesLink = ssr.getByRole('navigation', { name: 'Secciones de Tu página' })
      .getByRole('link', { name: 'Series', exact: true });
    await expect(ssrSeriesLink).toHaveAttribute('href', '/cuenta/?vista=series#owner-series-title');
    await ssrSeriesLink.click();
    await expect(ssr).toHaveURL((url) => url.searchParams.get('vista') === 'series' && url.hash === '#owner-series-title');
    const ssrHeading = ssr.getByRole('heading', { name: 'Series', exact: true });
    await expect(ssrHeading).toBeVisible();
  } finally {
    await ssrContext.close();
  }
});

test('Copiar enlace llama al portapapeles y muestra feedback accesible junto al control', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const before = await readOwnerSnapshot(fixture, cookie);
  const published = await api(fixture, cookie, '/api/creador/perfil/publicar', {
    method: 'POST', body: { creatorVersion: before.creatorVersion },
  });
  assert.equal(published.response.status, 200, JSON.stringify(published.body));

  await page.addInitScript(() => {
    window.__copyWrites = [];
    window.__copyShouldFail = false;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText(value) {
          window.__copyWrites.push(value);
          return window.__copyShouldFail ? Promise.reject(new Error('clipboard unavailable')) : Promise.resolve();
        },
      },
    });
  });
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  const button = page.getByRole('button', { name: 'Copiar enlace', exact: true });
  const expectedUrl = `${fixture.origin}/c/ana-browser/`;
  await button.click();
  await expect(page.locator('[data-owner-copy-status]')).toHaveText('Enlace copiado.');
  assert.deepEqual(await page.evaluate(() => window.__copyWrites), [expectedUrl]);

  await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
  const profileForm = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
  await profileForm.getByLabel('Dirección de tu página', { exact: true }).fill('ana-browser-actualizada');
  await profileForm.getByRole('button', { name: 'Guardar datos', exact: true }).click();
  await expect(profileForm).not.toBeVisible();
  await expect(page.locator('[data-owner-copy-status]')).toHaveCount(0);

  await page.evaluate(() => { window.__copyShouldFail = true; });
  await button.click();
  await expect(page.locator('[data-owner-copy-status]')).toHaveText('No pudimos copiar el enlace. Puedes copiarlo desde la dirección de tu página.');

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    document.execCommand = () => { throw new Error('copy unavailable'); };
  });
  await button.click();
  await expect(page.locator('[data-owner-copy-status]')).toHaveText('No pudimos copiar el enlace. Puedes copiarlo desde la dirección de tu página.');
  await expect(button).toBeFocused();
});

import assert from 'node:assert/strict';
import { completeLogin, cookiePair, makeAccount, makeIdentity } from '../fixtures/account-auth.mjs';
import {
  addLink, api, captureCreatorApi, loggedInOwner, readOwnerSnapshot,
} from '../fixtures/creator-browser-test.mjs';
import {
  expect, seedCreatorResourceFilterProfile, test,
} from '../fixtures/creator-resource-filters.mjs';

function card(page, placementId) {
  return page.locator(`[data-creator-link-id="${placementId}"]`).locator('xpath=ancestor::li[1]');
}

function cards(page) {
  return page.locator('[data-creator-profile] .creator-profile__link-card');
}

function visibleCards(page) {
  return page.locator('[data-creator-profile] .creator-profile__link-card:not([hidden])');
}

async function openFilters(page) {
  const details = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Filtros' }) }).first();
  await expect(details).toHaveCount(1);
  const summary = details.locator('summary');
  const kind = page.getByLabel('Tipo de recurso', { exact: true });
  const format = page.getByLabel('Formato', { exact: true });
  const topic = page.getByLabel('Tema', { exact: true });
  return { details, summary, kind, format, topic };
}

function optionLabels(select) {
  return select.locator('option').allTextContents();
}

async function adminCookie(fixture) {
  const sub = 'creator-resource-filters-admin';
  const email = 'creator-resource-filters-admin@example.invalid';
  const identity = makeIdentity({ sub });
  fixture.accountStore.seedAccount(makeAccount({ identity, email, isAdmin: true }));
  const oldClaims = fixture.accountHarness.state.oidc.claims;
  fixture.accountHarness.state.oidc.claims = { sub, email };
  try {
    const login = await completeLogin(fixture.accountHarness);
    assert.equal(login.response.status, 303);
    return { pair: cookiePair(login.sessionCookie), name: 'da_session', value: cookiePair(login.sessionCookie).slice('da_session='.length) };
  } finally {
    if (oldClaims === undefined) delete fixture.accountHarness.state.oidc.claims;
    else fixture.accountHarness.state.oidc.claims = oldClaims;
  }
}

test('el SSR público proyecta clasificación segura, visibilidad, orden, series e identidad de colocación', async ({ fixture, page }) => {
  const seeded = await seedCreatorResourceFilterProfile(fixture.creatorStore);
  const requests = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  const response = await page.goto(`${fixture.origin}/c/${seeded.slug}/`);
  assert.equal(response?.status(), 200);
  await expect(page.getByRole('heading', { name: 'Enlaces de Ana Filtros', exact: true })).toBeVisible();

  const expectedVisible = [
    'placement-featured', 'placement-legacy', 'placement-community', 'placement-recording',
    'placement-event', 'placement-event-cohost', 'placement-unclassified', 'placement-invalid', 'placement-deselected',
  ];
  assert.deepEqual(await cards(page).locator('[data-creator-link-id]').evaluateAll((elements) => elements.map((element) => element.dataset.creatorLinkId)), expectedVisible);
  await expect(card(page, 'placement-hidden')).toHaveCount(0);
  await expect(page.locator('.creator-profile__link-card--featured')).toContainText('Video destacado');
  await expect(page.locator('.creator-profile__series')).toContainText('Ruta de eventos');
  await expect(page.locator('.creator-profile__series')).toContainText('3 capítulos');

  const expectedData = {
    'placement-featured': { kind: 'content', format: 'Video', topics: 'Seguridad|Redes' },
    'placement-legacy': { kind: 'content', format: 'Artículo', topics: 'Redes' },
    'placement-community': { kind: 'community', format: 'User Group', topics: 'Comunidad' },
    'placement-recording': { kind: 'content', format: 'Video', topics: 'Comunidad' },
    'placement-event': { kind: 'event', format: undefined, topics: undefined },
    'placement-event-cohost': { kind: 'event', format: undefined, topics: undefined },
    'placement-unclassified': { kind: 'unclassified', format: undefined, topics: undefined },
    'placement-invalid': { kind: 'unclassified', format: undefined, topics: undefined },
    'placement-deselected': { kind: 'source', format: 'Blog', topics: 'Redes' },
  };
  for (const [placementId, expected] of Object.entries(expectedData)) {
    const node = card(page, placementId);
    await expect(node).toHaveAttribute('data-kind', expected.kind);
    const attrs = await node.evaluate((element) => ({
      format: element.dataset.format ?? '', topics: element.dataset.topics ?? '',
    }));
    if (expected.format) assert.equal(attrs.format, expected.format);
    else assert.equal(attrs.format, '');
    if (expected.topics) assert.equal(attrs.topics, expected.topics);
    else assert.equal(attrs.topics, '');
  }
  const html = await page.locator('body').innerHTML();
  for (const internalField of ['classification', 'directoryApproval', 'resourceVersion', 'selectedForDirectory']) {
    assert.equal(html.includes(internalField), false, `public HTML does not expose ${internalField}`);
  }

  const seriesResponse = await page.goto(`${fixture.origin}/c/${seeded.slug}/series/ruta-de-eventos/`);
  assert.equal(seriesResponse?.status(), 200);
  assert.deepEqual(
    await page.locator('[data-creator-link-id]').evaluateAll((elements) => elements.map((element) => element.dataset.creatorLinkId)),
    ['placement-recording', 'placement-event-cohost', 'placement-event'],
    'the series keeps its chapter order and placement IDs independent of profile filtering',
  );
  assert.equal(requests.some((pathname) => pathname === '/catalog-selection.json'
    || pathname === '/search-index.json' || pathname.startsWith('/api/')), false);
});

test('los filtros públicos combinan dimensiones, conservan selecciones, limpian y restauran historial sin lecturas', async ({ fixture, page }) => {
  const seeded = await seedCreatorResourceFilterProfile(fixture.creatorStore);
  const foreignQuery = `  texto-sin-coincidencias ${'x'.repeat(220)}  `;
  const initialUrl = new URL(`${fixture.origin}/c/${seeded.slug}/`);
  initialUrl.searchParams.set('kind', 'content');
  initialUrl.searchParams.set('format', 'Video');
  initialUrl.searchParams.set('topic', 'Seguridad');
  initialUrl.searchParams.set('q', foreignQuery);
  initialUrl.searchParams.set('sort', 'foreign-order');
  initialUrl.searchParams.set('country', 'AR');
  initialUrl.searchParams.set('level', 'advanced');
  initialUrl.searchParams.set('group', 'foreign');
  await page.goto(initialUrl.toString());
  const filters = await openFilters(page);
  await expect(filters.details).not.toHaveAttribute('open', '');
  await expect(filters.kind).toHaveValue('content');
  await expect(filters.format).toHaveValue('Video');
  await expect(filters.topic).toHaveValue('Seguridad');
  await expect(filters.summary).toHaveText(/Filtros.*3/iu);
  await expect(card(page, 'placement-featured')).toBeVisible();
  await expect(visibleCards(page)).toHaveCount(1);
  await expect(page.locator('[data-result-count]')).toHaveText(/^1\b/u);
  const filterRequests = [];
  page.on('request', (request) => filterRequests.push(new URL(request.url()).pathname));

  assert.deepEqual(await optionLabels(filters.kind), [
    'Todos los tipos', 'Aprender', 'Creadores y canales', 'Comunidades', 'Eventos', 'Sin clasificar',
  ]);
  assert.deepEqual(await optionLabels(filters.format), ['Todos los formatos', 'Artículo', 'Blog', 'User Group', 'Video']);
  assert.deepEqual(await optionLabels(filters.topic), ['Todos los temas', 'Comunidad', 'Redes', 'Seguridad']);

  const callsBeforeFiltering = fixture.dynamoMock.calls.length;
  await filters.summary.click();
  await expect(filters.details).toHaveAttribute('open', '');
  await filters.kind.selectOption('event');
  await expect(filters.kind).toHaveValue('event');
  await expect(filters.format).toHaveValue('Video');
  await expect(filters.topic).toHaveValue('Seguridad');
  await expect(visibleCards(page)).toHaveCount(0);
  await expect(filters.summary).toHaveText(/Filtros.*3/iu);
  await expect(page.locator('[data-result-count]')).toHaveText(/^0\b/u);
  await expect(page.getByText('No encontramos enlaces con estos filtros', { exact: true })).toBeVisible();
  assert.equal(fixture.dynamoMock.calls.length, callsBeforeFiltering, 'changing filters is client-only after the public SSR read');
  let url = new URL(page.url());
  assert.deepEqual(
    ['kind', 'format', 'topic'].map((key) => url.searchParams.get(key)),
    ['event', 'Video', 'Seguridad'],
  );
  assert.deepEqual(
    ['q', 'sort', 'group'].map((key) => url.searchParams.get(key)),
    [foreignQuery, 'foreign-order', 'foreign'],
    'unrelated profile query parameters survive facet changes without affecting matches',
  );
  assert.equal(url.searchParams.get('country'), 'AR');
  assert.equal(url.searchParams.get('level'), 'advanced');

  await filters.format.selectOption('');
  await filters.topic.selectOption('');
  await expect(visibleCards(page)).toHaveCount(2);
  assert.deepEqual(
    await visibleCards(page).locator('[data-creator-link-id]').evaluateAll((elements) => elements.map((element) => element.dataset.creatorLinkId)),
    ['placement-event', 'placement-event-cohost'],
    'clearing format and topic reveals both event placements in creator order',
  );

  await filters.kind.selectOption('unclassified');
  await expect(visibleCards(page)).toHaveCount(2);
  assert.deepEqual(
    await visibleCards(page).locator('[data-creator-link-id]').evaluateAll((elements) => elements.map((element) => element.dataset.creatorLinkId)),
    ['placement-unclassified', 'placement-invalid'],
    'the unclassified facet includes absent and partial-invalid links in creator order',
  );

  await filters.kind.selectOption('content');
  await filters.topic.selectOption('Redes');
  await expect(visibleCards(page)).toHaveCount(2);
  assert.deepEqual(
    await visibleCards(page).locator('[data-creator-link-id]').evaluateAll((elements) => elements.map((element) => element.dataset.creatorLinkId)),
    ['placement-featured', 'placement-legacy'],
    'the second topic matches a multi-topic card independently of the first topic',
  );

  await filters.kind.selectOption('');
  await filters.topic.selectOption('');
  await filters.format.selectOption('');
  await expect(visibleCards(page)).toHaveCount(9);
  await expect(filters.summary).toHaveText(/^Filtros$/u);
  await expect(page.locator('[data-result-count]')).toHaveText(/^9\b/u);
  await expect(page.getByText('No encontramos enlaces con estos filtros', { exact: true })).toBeHidden();
  url = new URL(page.url());
  assert.equal(url.searchParams.has('kind'), false);
  assert.equal(url.searchParams.has('format'), false);
  assert.equal(url.searchParams.has('topic'), false);

  await page.goto(`${fixture.origin}/c/${seeded.slug}/?kind=bogus&format=Desconocido&topic=NoExiste`);
  const unknownFilters = await openFilters(page);
  await expect(unknownFilters.kind).toHaveValue('');
  await expect(unknownFilters.format).toHaveValue('');
  await expect(unknownFilters.topic).toHaveValue('');
  await expect(visibleCards(page)).toHaveCount(9);

  await unknownFilters.summary.click();
  await expect(unknownFilters.details).toHaveAttribute('open', '');
  await unknownFilters.kind.selectOption('source');
  await expect(visibleCards(page)).toHaveCount(1);
  await page.goBack();
  await expect(filters.kind).toHaveValue('');
  await expect(visibleCards(page)).toHaveCount(9);
  await page.goForward();
  await expect(unknownFilters.kind).toHaveValue('source');
  await expect(visibleCards(page)).toHaveCount(1);
  assert.equal(filterRequests.some((pathname) => pathname === '/catalog-selection.json'
    || pathname === '/search-index.json' || pathname.startsWith('/api/')), false,
  'filter changes do not read the catalog or creator APIs');
});

test('el panel cerrado tolera URL activa, teclado, tema y móvil y un alias conserva la consulta', async ({ fixture, page }) => {
  const seeded = await seedCreatorResourceFilterProfile(fixture.creatorStore);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`${fixture.origin}/c/${seeded.slug}/?kind=event`);
  const filters = await openFilters(page);
  await expect(filters.details).not.toHaveAttribute('open', '');
  await filters.summary.click();
  await expect(filters.details).toHaveAttribute('open', '');
  await filters.kind.press('Escape');
  await expect(filters.details).not.toHaveAttribute('open', '');
  await expect(filters.summary).toBeFocused();
  await filters.summary.click();
  await filters.summary.press('Tab');
  await expect(filters.details).toHaveAttribute('open', '');
  await expect(filters.kind).toBeFocused();
  await filters.topic.focus();
  await filters.topic.press('Tab');
  await expect(filters.details).not.toHaveAttribute('open', '');
  assert.equal(await page.locator('details').evaluate((element) => element.contains(document.activeElement)), false,
    'leaving the last facet with Tab leaves focus at its destination');
  await filters.summary.click();
  await expect(filters.details).toHaveAttribute('open', '');
  const themeToggle = page.locator('[data-theme-toggle]');
  await expect(themeToggle).toBeVisible();
  await themeToggle.click();
  await expect(filters.details).toHaveAttribute('open', '');
  await page.getByRole('heading', { name: 'Enlaces de Ana Filtros', exact: true }).click();
  await expect(filters.details).not.toHaveAttribute('open', '');
  await page.emulateMedia({ colorScheme: 'light' });
  await filters.summary.click();
  await expect(filters.details).toHaveAttribute('open', '');

  const alias = await page.goto(`${fixture.origin}/c/${seeded.aliasSlug}/?kind=source&unknown=ignored`);
  assert.equal(alias?.status(), 200);
  await expect(page).toHaveURL((url) => url.pathname === `/c/${seeded.slug}/` && url.searchParams.get('kind') === 'source');
});

test('sin JavaScript el perfil mantiene todos los enlaces e informa que los filtros requieren JavaScript', async ({ fixture, publicPage }) => {
  const seeded = await seedCreatorResourceFilterProfile(fixture.creatorStore);
  const requests = [];
  publicPage.on('request', (request) => requests.push(new URL(request.url()).pathname));
  const noJsResponse = await publicPage.goto(`${fixture.origin}/c/${seeded.slug}/`);
  assert.equal(noJsResponse?.status(), 200);
  await expect(cards(publicPage)).toHaveCount(9);
  await expect(publicPage.getByText(/JavaScript.*filtros|filtros.*JavaScript/iu)).toBeVisible();
  assert.equal(requests.some((pathname) => pathname === '/catalog-selection.json'
    || pathname === '/search-index.json' || pathname.startsWith('/api/')), false);
});

test('Mi página captura y edita la clasificación y el perfil público conserva la misma colocación al filtrar', async ({ fixture, page, browser }) => {
  const cookie = await loggedInOwner(fixture, page, { profileFields: { slug: 'formulario-filtros' } });
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  const capture = await captureCreatorApi(page);
  try {
    await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const add = page.locator('form[data-owner-form="alta-enlace"]');
    await add.getByLabel('Título', { exact: true }).fill('Clasificación capturada');
    await add.getByLabel('URL', { exact: true }).fill('https://filters.example/browser-created');
    await add.getByLabel(/Descripción/).fill('Capturada desde Mi página.');
    await add.getByLabel('Tipo de recurso', { exact: true }).selectOption('content');
    await add.getByLabel('Formato', { exact: true }).selectOption('Video');
    await add.getByRole('checkbox', { name: 'Seguridad', exact: true }).check();
    await add.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await expect.poll(() => capture.writes().find(({ method, path }) => method === 'POST' && path === '/api/creador/enlaces')?.status).toBe(201);
    const created = capture.writes().find(({ method, path }) => method === 'POST' && path === '/api/creador/enlaces');
    assert.deepEqual({ kind: created.body.kind, format: created.body.format, topics: created.body.topics }, {
      kind: 'content', format: 'Video', topics: ['Seguridad'],
    });
    const placementId = created.responseBody.placementId;
    assert.ok(placementId);
    const ownerAfterCreate = await readOwnerSnapshot(fixture, cookie);
    const witnessResult = await api(fixture, cookie, '/api/creador/enlaces', {
      method: 'POST',
      body: {
        creatorVersion: ownerAfterCreate.creatorVersion,
        title: 'Fuente testigo', url: 'https://filters.example/browser-witness', description: 'Fuente para comprobar facetas.',
        kind: 'source', format: 'Blog', topics: ['Redes'],
      },
    });
    assert.equal(witnessResult.response.status, 201, JSON.stringify(witnessResult.body));
    const witnessPlacementId = witnessResult.body.placementId;

    const beforePublish = await readOwnerSnapshot(fixture, cookie);
    const published = await api(fixture, cookie, '/api/creador/perfil/publicar', {
      method: 'POST', body: { creatorVersion: beforePublish.creatorVersion },
    });
    assert.equal(published.response.status, 200, JSON.stringify(published.body));
    const anonymousContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const anonymousPage = await anonymousContext.newPage();
    try {
      await anonymousPage.goto(`${fixture.origin}/c/formulario-filtros/?kind=content&format=Video&topic=Seguridad`);
      const offeredFilters = await openFilters(anonymousPage);
      assert.deepEqual(await optionLabels(offeredFilters.kind), ['Todos los tipos', 'Aprender', 'Creadores y canales'],
        'a profile offers only the kinds represented by its complete public link set');
      assert.deepEqual(await optionLabels(offeredFilters.format), ['Todos los formatos', 'Blog', 'Video']);
      await expect(visibleCards(anonymousPage)).toHaveCount(1);
      await expect(card(anonymousPage, placementId)).toBeVisible();
    } finally {
      await anonymousContext.close();
    }

    await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
    const row = page.locator(`[data-link-row="${placementId}"]`);
    await row.getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const edit = page.locator('form[data-owner-form="enlace"]');
    await edit.getByLabel('Tipo de recurso', { exact: true }).selectOption('content');
    await edit.getByLabel('Formato', { exact: true }).selectOption('Artículo');
    await edit.getByRole('checkbox', { name: 'Seguridad', exact: true }).uncheck();
    await edit.getByRole('checkbox', { name: 'Redes', exact: true }).check();
    await edit.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => capture.writes().find(({ method, path }) => method === 'PATCH' && path === `/api/creador/enlaces/${placementId}/editar`)?.status).toBe(200);
    const edited = capture.writes().find(({ method, path }) => method === 'PATCH' && path === `/api/creador/enlaces/${placementId}/editar`);
    assert.deepEqual({ kind: edited.body.kind, format: edited.body.format, topics: edited.body.topics }, {
      kind: 'content', format: 'Artículo', topics: ['Redes'],
    });
    const editedContext = await browser.newContext({ ignoreHTTPSErrors: true });
    const editedPage = await editedContext.newPage();
    try {
      await editedPage.goto(`${fixture.origin}/c/formulario-filtros/?format=Artículo`);
      await expect(visibleCards(editedPage)).toHaveCount(1);
      await expect(card(editedPage, placementId)).toBeVisible();
      await expect(card(editedPage, placementId)).toHaveAttribute('data-format', 'Artículo');
      await editedPage.goto(`${fixture.origin}/c/formulario-filtros/?format=Video`);
      await expect(visibleCards(editedPage)).toHaveCount(2,
        'an unrepresented format is ignored instead of hiding the edited content');
      await expect(card(editedPage, placementId)).toBeVisible();
      await editedPage.goto(`${fixture.origin}/c/formulario-filtros/?kind=source`);
      await expect(visibleCards(editedPage)).toHaveCount(1);
      await expect(card(editedPage, placementId)).toBeHidden();
      await expect(card(editedPage, witnessPlacementId)).toBeVisible();
    } finally {
      await editedContext.close();
    }
    assert.equal(await fixture.creatorStore.get(`resource:${created.responseBody.resourceId}`).then((resource) => resource.id), created.responseBody.resourceId);
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('una contribución pública llega al mismo almacenamiento y sobrevive a reutilización, concesión, edición y moderación del perfil', async ({ fixture, page, browser }) => {
  await page.goto(`${fixture.origin}/`);
  const form = page.locator('[data-contribution-form]');
  const contributionUrl = 'https://filters.example/contribution-shared';
  await form.getByLabel('Tu correo electrónico').fill('contributor@example.invalid');
  await form.getByLabel('Tu nombre completo').fill('Contributor Filters');
  await form.getByLabel('Título o nombre').fill('Contribución compartida');
  await form.getByLabel('URL').fill(contributionUrl);
  await form.getByLabel('Descripción').fill('Recurso que atraviesa la contribución y el perfil.');
  await form.getByLabel('¿Qué compartes?').selectOption('content');
  await form.getByLabel('Formato').selectOption('Curso');
  await form.getByRole('checkbox', { name: 'Comunidad', exact: true }).check();
  await form.locator('[data-contribution-submit]').click();
  await expect(form.locator('[data-contribution-status]')).toHaveAttribute('data-status', 'success');
  assert.equal(fixture.submissionRequests.length, 1);
  assert.strictEqual(fixture.submissionStore, fixture.creatorStore,
    'the real contribution handler and creator-page service share one physical Dynamo test store');
  const resourceId = 'resource-browser-contribution-1';
  const submitted = await fixture.rawResource(resourceId);
  assert.deepEqual({ kind: submitted.kind, format: submitted.format, topics: submitted.topics }, {
    kind: 'content', format: 'Curso', topics: ['Comunidad'],
  });

  const ownerCookie = await loggedInOwner(fixture, page, { profileFields: { slug: 'contribucion-filtros' } });
  const reused = await addLink(fixture, ownerCookie, { title: 'Borrador reutilizado', url: contributionUrl });
  assert.equal(reused.resourceId, resourceId);
  const ownerAfterReuse = await readOwnerSnapshot(fixture, ownerCookie);
  const witnessResult = await api(fixture, ownerCookie, '/api/creador/enlaces', {
    method: 'POST',
    body: {
      creatorVersion: ownerAfterReuse.creatorVersion,
      title: 'Fuente testigo', url: 'https://filters.example/contribution-witness', description: 'Fuente para comprobar facetas.',
      kind: 'source', format: 'Blog', topics: ['Redes'],
    },
  });
  assert.equal(witnessResult.response.status, 201, JSON.stringify(witnessResult.body));
  const owner = await fixture.principal(ownerCookie);
  const claim = await api(fixture, ownerCookie, '/api/creador/reclamaciones', {
    method: 'POST', body: { resources: [{ resourceId, url: contributionUrl }] },
  });
  assert.equal(claim.response.status, 202, JSON.stringify(claim.body));
  const admin = await adminCookie(fixture);
  const grant = await api(fixture, admin, '/api/admin/reclamaciones/vincular', {
    method: 'POST', body: { accountId: owner.accountId, resourceIds: [resourceId] },
  });
  assert.equal(grant.response.status, 200, JSON.stringify(grant.body));

  const beforeEdit = await readOwnerSnapshot(fixture, ownerCookie);
  const currentResource = await fixture.rawResource(resourceId);
  const edited = await api(fixture, ownerCookie, `/api/creador/enlaces/${reused.placementId}/editar`, {
    method: 'PATCH', body: {
      creatorVersion: beforeEdit.creatorVersion, resourceVersion: currentResource.version,
      title: 'Contribución editada', kind: 'content', format: 'Video', topics: ['Comunidad'],
    },
  });
  assert.equal(edited.response.status, 200, JSON.stringify(edited.body));
  const beforeApproval = await fixture.rawResource(resourceId);
  const approval = await api(fixture, admin, `/api/admin/recursos/aprobar/?id=${encodeURIComponent(resourceId)}`, {
    method: 'POST', body: { version: beforeApproval.version },
  });
  assert.equal(approval.response.status, 200, JSON.stringify(approval.body));
  const beforeRevoke = await fixture.rawResource(resourceId);
  const revoked = await api(fixture, admin, `/api/admin/recursos/revocar/?id=${encodeURIComponent(resourceId)}`, {
    method: 'POST', body: { version: beforeRevoke.version },
  });
  assert.equal(revoked.response.status, 200, JSON.stringify(revoked.body));

  const latestOwner = await readOwnerSnapshot(fixture, ownerCookie);
  const publish = await api(fixture, ownerCookie, '/api/creador/perfil/publicar', {
    method: 'POST', body: { creatorVersion: latestOwner.creatorVersion },
  });
  assert.equal(publish.response.status, 200, JSON.stringify(publish.body));
  const anonymousContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const anonymousPage = await anonymousContext.newPage();
  try {
    await anonymousPage.goto(`${fixture.origin}/c/contribucion-filtros/?kind=content&format=Video&topic=Comunidad`);
    await expect(visibleCards(anonymousPage)).toHaveCount(1);
    await expect(card(anonymousPage, reused.placementId)).toBeVisible();
    await expect(card(anonymousPage, reused.placementId)).toContainText('Contribución editada');
    await anonymousPage.goto(`${fixture.origin}/c/contribucion-filtros/?kind=community`);
    await expect(visibleCards(anonymousPage)).toHaveCount(2,
      'an unrepresented kind is ignored rather than hiding the contribution');
    await expect(card(anonymousPage, reused.placementId)).toBeVisible();
    await anonymousPage.goto(`${fixture.origin}/c/contribucion-filtros/?kind=source`);
    await expect(visibleCards(anonymousPage)).toHaveCount(1);
    await expect(card(anonymousPage, reused.placementId)).toBeHidden();
    await expect(card(anonymousPage, witnessResult.body.placementId)).toBeVisible();
  } finally {
    await anonymousContext.close();
  }
});

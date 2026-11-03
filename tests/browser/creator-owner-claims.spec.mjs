import assert from 'node:assert/strict';
import { currentUrlCollision, currentUrlKey } from '../../src/lib/catalog-url.mjs';
import { completeLogin, cookiePair, makeAccount, makeIdentity } from '../fixtures/account-auth.mjs';
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

async function serveSelectionIndex(page, entries, { firstStatus = 200, firstBody, alwaysFail = false } = {}) {
  let reads = 0;
  await page.route('**/catalog-selection.json', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    reads += 1;
    const failing = alwaysFail || reads === 1;
    await route.fulfill({
      status: failing ? firstStatus : 200,
      contentType: 'application/json',
      body: failing && firstBody !== undefined
        ? firstBody
        : failing && firstStatus !== 200
          ? JSON.stringify({ error: 'CATALOG_UNAVAILABLE' })
          : JSON.stringify(entries),
    });
  });
}

async function seedResourceWithoutReservation(store, resource) {
  const result = await store.transact({
    checks: [{ key: `resource:${resource.id}`, version: null }],
    puts: [{ key: `resource:${resource.id}`, value: { ...resource, version: resource.version ?? 0 } }],
  });
  assert.equal(result, true, `resource ${resource.id} is seeded without a duplicate URL reservation`);
}

async function openOwnerClaims(page, fixture) {
  await page.goto(`${fixture.origin}/cuenta/?vista=solicitudes`);
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Solicitudes', exact: true })).toBeVisible();
}

async function openClaimComposer(page) {
  await page.getByRole('button', { name: 'Solicitar edición', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel(/URLs conocidas/i)).toBeVisible();
}

function catalogSearch(page) {
  return page.getByRole('dialog').getByRole('searchbox').first();
}

function claimCandidate(page, title) {
  return page.getByRole('dialog').getByRole('checkbox', {
    name: new RegExp(`Solicitar edici[oó]n de ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });
}

function claimWrites(capture) {
  return capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/reclamaciones');
}

function linkEditWrites(capture, placementId) {
  return capture.writes().filter(({ method, path }) => method === 'PATCH'
    && path === `/api/creador/enlaces/${placementId}/editar`);
}

async function adminCookie(fixture) {
  const sub = 'phase5-browser-claims-admin';
  const email = 'phase5-admin@example.invalid';
  const identity = makeIdentity({ sub });
  fixture.accountStore.seedAccount(makeAccount({ identity, email, isAdmin: true }));
  const oldClaims = fixture.accountHarness.state.oidc.claims;
  fixture.accountHarness.state.oidc.claims = { sub, email };
  try {
    const login = await completeLogin(fixture.accountHarness);
    assert.equal(login.response.status, 303, 'the fixture signs in the administrator through the real account callback');
    assert.ok(login.sessionCookie);
    return { pair: cookiePair(login.sessionCookie) };
  } finally {
    if (oldClaims === undefined) delete fixture.accountHarness.state.oidc.claims;
    else fixture.accountHarness.state.oidc.claims = oldClaims;
  }
}

function deferred() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

async function holdClaimPost(page, { commit }) {
  const gate = deferred();
  let arrive;
  const reached = new Promise((resolve) => { arrive = resolve; });
  let observed;
  const handler = async (route) => {
    if (route.request().method() !== 'POST'
      || new URL(route.request().url()).pathname.replace(/\/$/u, '') !== '/api/creador/reclamaciones') {
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

async function holdOwnerRead(page) {
  const gate = deferred();
  let arrive;
  const reached = new Promise((resolve) => { arrive = resolve; });
  let observed;
  const handler = async (route) => {
    const request = route.request();
    if (request.method() !== 'GET' || new URL(request.url()).pathname.replace(/\/$/u, '') !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    const actual = await route.fetch();
    const body = await actual.body();
    observed = { status: actual.status(), dto: JSON.parse(body.toString('utf8')) };
    arrive();
    await gate.promise;
    await route.fulfill({ status: actual.status(), headers: actual.headers(), body });
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

test('una solicitud selecciona contenido y URLs, valida antes de escribir, deduplica recursos y refleja una resolución parcial', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const first = catalogEntry({
    id: 'phase5-claim-candidate-alpha',
    title: 'Guía pública de arquitectura',
    url: 'https://catalog.example.invalid/architecture',
    tipo: 'source',
  });
  const second = catalogEntry({
    id: 'phase5-claim-candidate-beta',
    title: 'Comunidad para practicar AWS',
    url: 'https://communities.example.invalid/practice',
    tipo: 'community',
  });
  const fromKnownUrl = catalogEntry({
    id: 'phase5-claim-known-url',
    title: 'Contenido encontrado por URL conocida',
    url: 'https://catalog.example.invalid/known-from-url',
    tipo: 'source',
  });
  await Promise.all([first, second, fromKnownUrl].map((item) => seedCatalogRecord(fixture, item)));
  await serveSelectionIndex(page, [first, second]);
  const capture = await captureCreatorApi(page);
  await openOwnerClaims(page, fixture);
  await openClaimComposer(page);

  const search = catalogSearch(page);
  await search.fill(first.title);
  await search.press('Enter');
  await claimCandidate(page, first.title).check();
  await search.fill(second.title);
  await search.press('Enter');
  await claimCandidate(page, second.title).check();
  const urls = page.getByLabel(/URLs conocidas/i);
  const evidence = page.getByLabel(/Contexto privado/i);
  await urls.fill('ftp://not-a-resource.example.invalid/file');
  await evidence.fill('Referencia privada con decisión automática desactivada.');
  await page.getByRole('button', { name: /Enviar solicitud/i }).click();
  const validationAlert = page.getByRole('alert');
  await expect(validationAlert).toBeVisible();
  await expect(validationAlert).toContainText(/URL/i);
  assert.equal(claimWrites(capture).length, 0, 'invalid URLs are rejected in the real browser before any POST');
  assert.equal((await fixture.request(cookie, '/api/creador/perfil').then((response) => response.json())).claims.length, 0);

  await urls.fill(`${first.url}\n${fromKnownUrl.url}`);
  const before = await fixture.rawOwner(cookie);
  const firstResourceBefore = await fixture.rawResource(first.id);
  await page.getByRole('button', { name: /Enviar solicitud/i }).click();
  await expect.poll(() => claimWrites(capture).length).toBe(1);
  await expect.poll(() => claimWrites(capture)[0]?.status).toBe(202);
  const post = claimWrites(capture)[0];
  assert.equal(post.status, 202);
  assert.deepEqual(Object.keys(post.body).sort(), ['evidence', 'resources']);
  assert.deepEqual(post.body.resources, [
    { resourceId: first.id, url: first.url },
    { resourceId: second.id, url: second.url },
    { url: first.url },
    { url: fromKnownUrl.url },
  ], 'the browser sends exact selected ID+URL pairs and known URLs, with no editable metadata or base versions');
  assert.equal(post.body.evidence, 'Referencia privada con decisión automática desactivada.');
  assert.equal(Object.hasOwn(post.body, 'profileVersion'), false);
  assert.equal(Object.hasOwn(post.body, 'sourceId'), false);
  assert.ok(post.body.resources.every((resource) => !Object.hasOwn(resource, 'sourceId')));

  const createdClaim = post.responseBody.claim;
  assert.ok(createdClaim.id);
  const storedClaim = await fixture.creatorStore.get(`claim:${createdClaim.id}`);
  assert.deepEqual(storedClaim.resourceIds, [first.id, second.id, fromKnownUrl.id],
    'the real service resolves the known URL and stores each distinct candidate once');
  assert.equal(new Set(storedClaim.resourceIds).size, 3);
  assert.equal((await fixture.rawOwner(cookie)).profile.version, before.profile.version,
    'claim creation does not change the creator profile version');
  assert.deepEqual(await fixture.rawResource(first.id), firstResourceBefore,
    'requesting edit access does not alter catalog metadata');

  const forbiddenEdit = await api(fixture, cookie, `/api/creador/recursos/${first.id}`, {
    method: 'PATCH', body: { version: firstResourceBefore.version, title: 'Cambio sin permiso' },
  });
  assert.equal(forbiddenEdit.response.status, 403, 'only administrative resolution can grant edit authority');
  assert.deepEqual(await fixture.rawResource(first.id), firstResourceBefore);

  const ownerPrincipal = await fixture.principal(cookie);
  const admin = await adminCookie(fixture);
  const resolvedOne = await api(fixture, admin, '/api/admin/reclamaciones/vincular', {
    method: 'POST',
    body: { accountId: ownerPrincipal.accountId, resourceIds: [first.id] },
  });
  assert.equal(resolvedOne.response.status, 200, JSON.stringify(resolvedOne.body));
  assert.deepEqual(resolvedOne.body.linkedResourceIds, [first.id]);

  await page.reload();
  const claimsRegion = page.getByRole('region', { name: 'Solicitudes' });
  await expect(claimsRegion).toContainText(/Parcialmente resuelta/i);
  await expect(claimsRegion).toContainText(first.title);
  await expect(claimsRegion).toContainText(second.title);
  await expect(claimsRegion).toContainText(fromKnownUrl.url);
  const partialRecords = claimsRegion.getByRole('listitem').filter({ hasText: /Parcialmente resuelta/i });
  await expect(partialRecords).toHaveCount(1, 'the local 202 result plus the server history produce one claim record');
  const visible = await page.locator('body').innerText();
  for (const privateId of [first.id, second.id, fromKnownUrl.id, createdClaim.id]) {
    assert.equal(visible.includes(privateId), false, `owner-visible history does not expose internal ID ${privateId}`);
  }
  const saved = await fixture.request(cookie, '/api/creador/perfil').then((response) => response.json());
  assert.equal(saved.claims.length, 1, 'refreshing owner history does not create duplicate claims');
  assert.equal(saved.claims[0].status, 'partial');
  await capture.stop();
});

test('Solicitudes acepta URLs conocidas aunque falle el índice público', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const ownerBefore = await fixture.rawOwner(cookie);
  const known = catalogEntry({
    id: 'phase5-claim-known-url-index-failure',
    title: 'Contenido identificado por la URL conocida',
    url: 'https://catalog.example.invalid/known-during-index-error',
  });
  await seedCatalogRecord(fixture, known);
  await serveSelectionIndex(page, [], { firstStatus: 503, alwaysFail: true });
  const capture = await captureCreatorApi(page);

  await openOwnerClaims(page, fixture);
  await openClaimComposer(page);
  const catalogRegion = page.getByRole('region', { name: 'Buscar contenido publicado' });
  await expect(catalogRegion.getByRole('button', { name: /Reintentar.*cat\u00e1logo/i })).toBeVisible();
  await expect(catalogRegion.getByRole('alert')).toBeVisible();
  await expect(catalogRegion.getByRole('status')).toHaveCount(0,
    'an unavailable catalog is exposed as an error, not as an empty valid result');

  const urls = page.getByLabel(/URLs conocidas/i);
  await urls.fill(known.url);
  await page.getByRole('button', { name: /Enviar solicitud/i }).click();
  await expect.poll(() => claimWrites(capture).length).toBe(1);
  await expect.poll(() => claimWrites(capture)[0]?.status).toBe(202);
  const post = claimWrites(capture)[0];
  assert.deepEqual(post.body, { resources: [{ url: known.url }] },
    'the form sends the manually supplied URL without inventing an ID while the index is unavailable');
  const stored = await fixture.creatorStore.get(`claim:${post.responseBody.claim.id}`);
  assert.deepEqual(stored.resourceIds, [known.id], 'the real service resolves the known URL reservation');
  assert.equal((await fixture.rawOwner(cookie)).profile.version, ownerBefore.profile.version,
    'a URL based request does not alter the owner profile');
  assert.equal(claimWrites(capture).length, 1);
  await capture.stop();
});

test('Solicitudes conserva un 202 manual que llega mientras Comprobar espera una lectura anterior', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const item = catalogEntry({
    id: 'phase5-claim-history-race',
    title: 'Ficha confirmada durante la lectura',
    url: 'https://catalog.example.invalid/history-race',
    tipo: 'community',
  });
  await seedCatalogRecord(fixture, item);
  await serveSelectionIndex(page, [item]);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  await openOwnerClaims(page, fixture);
  await openClaimComposer(page);
  await claimCandidate(page, item.title).check();
  await page.getByLabel(/Contexto privado/i).fill('Reintento explícito de una solicitud incierta.');

  const heldPost = await holdClaimPost(page, { commit: false });
  let firstSend;
  try {
    firstSend = page.getByRole('button', { name: /Enviar solicitud/i }).click();
    await expect.poll(() => claimWrites(capture).length).toBe(1);
    await heldPost.reached;
    heldPost.release();
    await firstSend;
  } finally {
    heldPost.release();
    await heldPost.remove();
    await firstSend?.catch(() => {});
  }
  const checkControl = page.getByRole('dialog').getByRole('button', { name: 'Comprobar solicitudes', exact: true });
  await expect(checkControl).toBeVisible();
  assert.equal(claimWrites(capture)[0].status, 503);
  assert.equal(heldPost.observed, undefined, 'the first failure occurred before the claim service handler');

  const readsBefore = capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length;
  const heldRead = await holdOwnerRead(page);
  let check;
  try {
    check = checkControl.click();
    await expect.poll(() => capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length)
      .toBe(readsBefore + 1);
    await heldRead.reached;
    assert.equal(heldRead.observed.dto.claims.length, 0,
      'the delayed owner response is a real snapshot from before the manual retry');

    await page.getByRole('button', { name: /Enviar solicitud/i }).click();
    await expect.poll(() => claimWrites(capture).length).toBe(2);
    await expect.poll(() => claimWrites(capture)[1]?.status).toBe(202);
    assert.deepEqual(claimWrites(capture)[1].body, {
      resources: [{ resourceId: item.id, url: item.url }],
      evidence: 'Reintento explícito de una solicitud incierta.',
    });
    const ownerAfterManualRetry = await fixture.request(cookie, '/api/creador/perfil').then((response) => response.json());
    assert.equal(ownerAfterManualRetry.claims.length, 1);
    assert.deepEqual(ownerAfterManualRetry.claims[0].resourceIds, [item.id]);
    const claimsRegion = page.getByRole('region', { name: 'Solicitudes' });
    await expect(claimsRegion).toContainText(item.title);
    await expect(claimsRegion.getByRole('listitem').filter({ hasText: 'Reintento explícito de una solicitud incierta.' })).toHaveCount(1,
      'the successful 202 is visible locally before the older GET is released');
    heldRead.release();
    await check;
  } finally {
    heldRead.release();
    await heldRead.remove();
    await check?.catch(() => {});
  }

  assert.equal(capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length,
    readsBefore + 1, 'Check uses the single held owner read');
  assert.equal(claimWrites(capture).length, 2, 'Check never replays either request; only the explicit retry reaches 202');
  const claimsRegion = page.getByRole('region', { name: 'Solicitudes' });
  await expect(claimsRegion).toContainText(item.title);
  await expect(claimsRegion.getByRole('listitem').filter({ hasText: 'Reintento explícito de una solicitud incierta.' })).toHaveCount(1,
    'the delayed empty snapshot does not remove the claim confirmed while it was pending');
  const checkedStatus = page.getByRole('status').filter({ hasText: /historial comprobado|solicitudes comprobadas|solicitudes actualizadas/i });
  await expect(checkedStatus).toBeVisible();
  await expect(checkedStatus).not.toContainText(/esta solicitud.*confirmada|confirmamos que.*enviaste/i);
  const visible = await page.locator('body').innerText();
  assert.equal(visible.includes(item.id), false, 'history uses a readable label, not the internal resource ID');
  await capture.stop();
});

test('Solicitudes conserva dos IDs con una URL compartida al paginar, filtrar y enviar', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const ownerBefore = await fixture.rawOwner(cookie);
  const sharedUrl = 'https://events.example.invalid/aws-community-day';
  const entries = Array.from({ length: 50 }, (_, index) => catalogEntry({
    id: `phase5-claim-page-${index}`,
    title: `Recurso del catálogo ${index}`,
    url: `https://catalog.example.invalid/page-${index}`,
  }));
  const first = catalogEntry({
    id: 'phase5-claim-cohost-a',
    title: 'AWS Community Day anfitriona A',
    url: sharedUrl,
    tipo: 'event',
  });
  const second = catalogEntry({
    id: 'phase5-claim-cohost-b',
    title: 'AWS Community Day anfitrión B',
    url: sharedUrl,
    tipo: 'event',
  });
  entries[4] = first;
  entries[33] = second;
  await Promise.all(entries.map((item) => {
    if (item.id === first.id) return seedCatalogRecord(fixture, item);
    if (item.id === second.id) {
      return seedResourceWithoutReservation(fixture.creatorStore, {
        id: item.id,
        title: item.title,
        recordType: 'event',
        registrationUrl: item.url,
        category: 'Evento',
        format: 'Evento',
        published: true,
      });
    }
    return seedCatalogRecord(fixture, item);
  }));
  const collision = currentUrlCollision(sharedUrl, [first.id, second.id]);
  assert.equal(await fixture.creatorStore.transact({
    checks: [{ key: currentUrlKey(sharedUrl), version: 1 }],
    puts: [{ key: currentUrlKey(sharedUrl), value: collision }],
  }), true, 'the real catalog store represents the two cohosts as an ambiguous URL reservation');
  await serveSelectionIndex(page, entries);
  const capture = await captureCreatorApi(page);

  await openOwnerClaims(page, fixture);
  await openClaimComposer(page);
  await expect(page.getByRole('dialog')).toContainText('Página 1 de 2');
  const search = catalogSearch(page);
  await claimCandidate(page, first.title).check();
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Página 2 de 2');
  await claimCandidate(page, second.title).check();

  await search.fill('aws-community-day');
  await search.press('Enter');
  await expect(claimCandidate(page, first.title)).toBeChecked();
  await expect(claimCandidate(page, second.title)).toBeChecked();
  await expect(page.getByRole('dialog')).toContainText(/2 recursos seleccionados/i);
  await page.getByRole('button', { name: /Enviar solicitud/i }).click();
  await expect.poll(() => claimWrites(capture).length).toBe(1);
  await expect.poll(() => claimWrites(capture)[0]?.status).toBe(202);
  const post = claimWrites(capture)[0];
  assert.deepEqual(post.body, {
    resources: [
      { resourceId: first.id, url: sharedUrl },
      { resourceId: second.id, url: sharedUrl },
    ],
  }, 'page and filter changes retain both exact resource ID plus URL pairs');
  const stored = await fixture.creatorStore.get(`claim:${post.responseBody.claim.id}`);
  assert.deepEqual(stored.resourceIds, [first.id, second.id]);
  assert.equal(new Set(stored.resourceIds).size, 2, 'the service preserves distinct cohost IDs despite the shared URL');
  assert.deepEqual(stored.resources, [
    { resourceId: first.id, url: sharedUrl },
    { resourceId: second.id, url: sharedUrl },
  ]);
  const visible = await page.locator('body').innerText();
  assert.equal(visible.includes(first.id), false);
  assert.equal(visible.includes(second.id), false);
  assert.equal((await fixture.rawOwner(cookie)).profile.version, ownerBefore.profile.version);
  assert.equal(claimWrites(capture).length, 1);
  await capture.stop();
});

const uncertainOutcomes = [
  { name: 'commit con respuesta perdida', commit: true },
  { name: 'fallo antes del commit', commit: false },
];

for (const outcome of uncertainOutcomes) {
  test(`Solicitudes: ${outcome.name} comprueba sólo el historial y conserva las bases para la siguiente edición`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const ownLink = await addLink(fixture, cookie, {
      title: 'Ficha propia antes de comprobar solicitudes',
      url: 'https://owner-content.example.invalid/history-refresh',
    });
    const candidate = catalogEntry({
      id: `phase5-claim-uncertain-${outcome.commit ? 'committed' : 'uncommitted'}`,
      title: 'Ficha compartida solicitada',
      url: `https://catalog.example.invalid/shared-${outcome.commit ? 'committed' : 'uncommitted'}`,
      tipo: 'community',
    });
    const secondCandidate = catalogEntry({
      id: `phase5-claim-continuation-${outcome.commit ? 'committed' : 'uncommitted'}`,
      title: 'Contenido de la continuación manual',
      url: `https://catalog.example.invalid/continuation-${outcome.commit ? 'committed' : 'uncommitted'}`,
      tipo: 'source',
    });
    await Promise.all([candidate, secondCandidate].map((item) => seedCatalogRecord(fixture, item)));
    const beforeReference = await fixture.rawOwner(cookie);
    const reference = await api(fixture, cookie, '/api/creador/referencias', {
      method: 'POST',
      body: {
        resourceId: candidate.id,
        url: candidate.url,
        profileVersion: beforeReference.profile.version,
        selectedForDirectory: true,
      },
    });
    assert.equal(reference.response.status, 201, JSON.stringify(reference.body));
    const initialOwner = await fixture.rawOwner(cookie);
    const initialResource = await fixture.rawResource(ownLink.resourceId);
    const initialPlacement = await fixture.rawPlacement(cookie, ownLink.placementId);
    assert.equal(initialOwner.profile.version, beforeReference.profile.version + 1);

    await serveSelectionIndex(page, [secondCandidate]);
    const capture = await captureCreatorApi(page, { skipErrorBodies: true });
    await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
    const sharedRow = page.getByRole('row').filter({ hasText: candidate.title });
    await expect(sharedRow.getByRole('button', { name: /Solicitar edici[oó]n/i })).toBeVisible();
    await sharedRow.getByRole('button', { name: /Solicitar edici[oó]n/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const urls = dialog.getByLabel(/URLs conocidas/i);
    const evidence = dialog.getByLabel(/Contexto privado/i);
    const selected = dialog.getByRole('list', { name: 'Selección para solicitar edición', exact: true });
    await expect(selected.getByRole('button', { name: `Quitar ${candidate.title} de la selección`, exact: true })).toBeVisible();
    await expect(selected).toContainText(candidate.url);
    await expect(dialog.getByRole('checkbox', { name: new RegExp(candidate.title) })).toHaveCount(0);
    await evidence.fill('Contenido exacto al enviar.');

    const heldPost = await holdClaimPost(page, outcome);
    let submit;
    try {
      submit = dialog.getByRole('button', { name: /Enviar solicitud/i }).click();
      await expect.poll(() => claimWrites(capture).length).toBe(1);
      await heldPost.reached;
      await evidence.fill('Corrección mientras se envía');
      await urls.fill(secondCandidate.url);
      heldPost.release();
      await submit;
    } finally {
      heldPost.release();
      await heldPost.remove();
      await submit?.catch(() => {});
    }
    const checkControl = dialog.getByRole('button', { name: 'Comprobar solicitudes', exact: true });
    await expect(checkControl).toBeVisible();
    await expect(evidence).toHaveValue('Corrección mientras se envía');
    await expect(urls).toHaveValue(secondCandidate.url);
    assert.equal(claimWrites(capture).length, 1, 'the first ambiguous POST is sent exactly once');
    const firstPost = claimWrites(capture)[0];
    assert.equal(firstPost.status, 503);
    assert.deepEqual(firstPost.body, {
      resources: [{ resourceId: candidate.id, url: candidate.url }],
      evidence: 'Contenido exacto al enviar.',
    });
    if (outcome.commit) {
      assert.equal(heldPost.observed.status, 202, 'the real claim service committed before the transport replaced its acknowledgement');
      assert.ok(heldPost.observed.body.claim.id);
    } else {
      assert.equal(heldPost.observed, undefined, 'the precommit transport failure did not call the claim handler');
    }

    // The history read deliberately observes a newer profile and resource than the
    // form's immutable base. It must update claims alone, not lend those versions to
    // the old values shown in the editor.
    const profileUpdate = await api(fixture, cookie, '/api/creador/perfil', {
      method: 'PUT',
      body: { version: initialOwner.profile.version, displayName: 'Nombre cambiado durante la comprobación' },
    });
    assert.equal(profileUpdate.response.status, 200, JSON.stringify(profileUpdate.body));
    const metadataUpdate = await api(fixture, cookie, `/api/creador/recursos/${ownLink.resourceId}`, {
      method: 'PATCH',
      body: { version: initialResource.version, title: 'Título cambiado durante la comprobación' },
    });
    assert.equal(metadataUpdate.response.status, 200, JSON.stringify(metadataUpdate.body));
    const externalOwner = await fixture.rawOwner(cookie);
    const externalResource = await fixture.rawResource(ownLink.resourceId);
    assert.equal(externalOwner.profile.version, initialOwner.profile.version + 1);
    assert.equal(externalResource.version, initialResource.version + 1);

    const historyGetsBefore = capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length;
    const heldRead = await holdOwnerRead(page);
    let check;
    let missingExitGuard;
    try {
      check = checkControl.click();
      await expect.poll(() => capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length)
        .toBe(historyGetsBefore + 1);
      await heldRead.reached;
      assert.equal(heldRead.observed.status, 200, 'the held result came from the real private owner read');
      assert.equal(heldRead.observed.dto.profile.version, externalOwner.profile.version);
      assert.equal(heldRead.observed.dto.editableResources.find(({ id }) => id === ownLink.resourceId).version, externalResource.version);
      assert.equal(heldRead.observed.dto.claims.length, outcome.commit ? 1 : 0);

      await evidence.fill('Corrección mientras se comprueba el historial');
      await urls.fill(secondCandidate.url);
      await dialog.getByRole('button', { name: /Cancelar/i }).click();
      const exit = page.getByRole('alertdialog');
      try {
        await expect(exit).toBeVisible();
      } catch (error) {
        missingExitGuard = error;
      }
      if (!missingExitGuard) {
        await exit.getByRole('button', { name: /Seguir editando/i }).click();
        await expect(page).toHaveURL(/vista=enlaces/);
        await expect(evidence).toHaveValue('Corrección mientras se comprueba el historial');
        await expect(urls).toHaveValue(secondCandidate.url);
      }
      heldRead.release();
      await check;
    } finally {
      heldRead.release();
      await heldRead.remove();
      await check?.catch(() => {});
    }
    if (missingExitGuard) {
      await capture.stop({ skipErrorBodies: true });
      throw missingExitGuard;
    }
    const historyGetsAfter = capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length;
    assert.equal(historyGetsAfter, historyGetsBefore + 1, 'Comprobar performs one read and no mutation');
    assert.equal(claimWrites(capture).length, 1, 'history checking never replays the non-idempotent POST');
    const checkedStatus = dialog.getByRole('status').filter({ hasText: /historial comprobado|solicitudes comprobadas|solicitudes actualizadas/i }).first();
    await expect(checkedStatus).toBeVisible();
    await expect(checkedStatus).not.toContainText(/esta solicitud.*confirmada|confirmamos que.*enviaste/i);
    await expect(evidence).toHaveValue('Corrección mientras se comprueba el historial');
    await expect(urls).toHaveValue(secondCandidate.url);
    await expect(page.getByText('Ana Browser', { exact: true })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: ownLink.title })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'Título cambiado durante la comprobación' })).toHaveCount(0);
    const visible = await page.locator('body').innerText();
    assert.equal(visible.includes(candidate.id), false);
    assert.equal(visible.includes(secondCandidate.id), false);

    // This second click is the user's explicit continuation. It intentionally uses
    // the corrected draft even when the first claim with the same candidate exists.
    await dialog.getByRole('button', { name: /Enviar solicitud/i }).click();
    await expect.poll(() => claimWrites(capture).length).toBe(2);
    await expect.poll(() => claimWrites(capture)[1]?.status).toBe(202);
    const continuation = claimWrites(capture)[1];
    assert.equal(continuation.status, 202);
    assert.deepEqual(continuation.body, {
      resources: [
        { resourceId: candidate.id, url: candidate.url },
        { url: secondCandidate.url },
      ],
      evidence: 'Corrección mientras se comprueba el historial',
    });
    const ownerAfterContinuation = await fixture.request(cookie, '/api/creador/perfil').then((response) => response.json());
    assert.equal(ownerAfterContinuation.claims.length, outcome.commit ? 2 : 1,
      'server state reflects one manual continuation, plus only the first POST when it really committed');
    assert.equal(claimWrites(capture).length, 2, 'the manual continuation is not automatically duplicated');

    // The current GET is still the original Enlaces document. A real edit from this
    // consumer must keep its old fields paired with their old CAS versions.
    await expect(dialog).not.toBeVisible();
    const staleRow = page.getByRole('row').filter({ hasText: ownLink.title });
    await expect(staleRow).toBeVisible();
    await staleRow.getByRole('button', { name: /Editar ficha/i }).click();
    const linkDialog = page.getByRole('dialog');
    const title = linkDialog.getByRole('textbox', { name: 'Título', exact: true });
    await expect(title).toHaveValue(ownLink.title);
    await expect(linkDialog.getByRole('textbox', { name: 'URL', exact: true })).toHaveValue(initialResource.url);
    await title.fill('Corrección contra la base anterior');
    await linkDialog.getByRole('button', { name: /Guardar cambios/i }).click();
    await expect.poll(() => linkEditWrites(capture, ownLink.placementId).length).toBe(1);
    await expect.poll(() => linkEditWrites(capture, ownLink.placementId)[0]?.status).toBe(409);
    const staleEdit = linkEditWrites(capture, ownLink.placementId)[0];
    assert.equal(staleEdit.status, 409);
    await expect(linkDialog).toContainText(/(?:página|enlace|ficha|estado guardado).*cambi[oó]/i);
    assert.equal(staleEdit.body.profileVersion, initialOwner.profile.version);
    assert.equal(staleEdit.body.resourceVersion, initialResource.version);
    assert.equal(staleEdit.body.placementVersion, initialPlacement.version);
    assert.equal(staleEdit.body.title, 'Corrección contra la base anterior');
    if (Object.hasOwn(staleEdit.body, 'url')) assert.equal(staleEdit.body.url, initialResource.url);
    assert.equal((await fixture.rawOwner(cookie)).profile.displayName, 'Nombre cambiado durante la comprobación');
    assert.equal((await fixture.rawResource(ownLink.resourceId)).title, 'Título cambiado durante la comprobación');
    assert.equal((await fixture.rawResource(ownLink.resourceId)).url, initialResource.url);

    const compare = linkDialog.getByRole('button', { name: /Comparar con lo guardado/i });
    await expect(compare).toBeVisible();
    await compare.click();
    await expect(linkDialog).toContainText('Título cambiado durante la comprobación');
    const adopt = linkDialog.getByRole('button', { name: /^(?:Usar los datos guardados|Usar la versión guardada)$/u });
    await expect(adopt).toBeVisible();
    await adopt.click();
    await expect(title).toHaveValue('Título cambiado durante la comprobación');
    await title.fill('Continuación manual con la base actual');
    await linkDialog.getByRole('button', { name: /Guardar cambios/i }).click();
    await expect.poll(() => linkEditWrites(capture, ownLink.placementId).length).toBe(2);
    await expect.poll(() => linkEditWrites(capture, ownLink.placementId)[1]?.status).toBe(200);
    const finalEdit = linkEditWrites(capture, ownLink.placementId)[1];
    assert.equal(finalEdit.status, 200);
    assert.equal(finalEdit.body.profileVersion, externalOwner.profile.version);
    assert.equal(finalEdit.body.resourceVersion, externalResource.version);
    assert.equal(finalEdit.body.placementVersion, initialPlacement.version);
    const finalResource = await fixture.rawResource(ownLink.resourceId);
    assert.equal(finalResource.title, 'Continuación manual con la base actual');
    assert.equal(finalResource.version, externalResource.version + 1);
    assert.equal(claimWrites(capture).length, 2, 'neither later editor recovery nor the claim check resends a claim');
    await capture.stop();
  });
}

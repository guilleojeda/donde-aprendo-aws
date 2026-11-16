import assert from 'node:assert/strict';
import { currentUrlCollision, currentUrlKey } from '../../src/lib/catalog-url.mjs';
import { completeLogin, cookiePair, makeAccount, makeIdentity } from '../fixtures/account-auth.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';
import {
  test, expect, api, captureCreatorApi, loggedInOwner,
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

function ownerReads(capture) {
  return capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil');
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
  const before = await api(fixture, cookie, '/api/creador/perfil').then((response) => response.body);
  const firstResourceBefore = await fixture.rawResource(first.id);
  const ownerReadsBeforeSubmit = ownerReads(capture).length;
  await page.getByRole('button', { name: /Enviar solicitud/i }).click();
  await expect.poll(() => claimWrites(capture).length).toBe(1);
  await expect.poll(() => claimWrites(capture)[0]?.status).toBe(202);
  await expect.poll(() => ownerReads(capture).length).toBe(ownerReadsBeforeSubmit + 1);
  await expect.poll(() => ownerReads(capture).at(-1)?.status).toBe(200);
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

  const claimId = post.responseBody.claimId;
  assert.equal(post.responseBody.schemaVersion, 2);
  assert.equal(post.responseBody.operation, 'create-claim');
  assert.equal(post.responseBody.disposition, 'submitted');
  assert.ok(claimId);
  assert.ok(Number.isSafeInteger(post.responseBody.claimVersion));
  assert.equal(Object.hasOwn(post.responseBody, 'claim'), false);
  const storedClaim = await fixture.creatorStore.get(`claim:${claimId}`);
  assert.deepEqual(storedClaim.resourceIds, [first.id, second.id, fromKnownUrl.id],
    'the real service resolves the known URL and stores each distinct candidate once');
  assert.equal(new Set(storedClaim.resourceIds).size, 3);
  const afterSubmission = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(afterSubmission.body.creatorVersion, before.creatorVersion,
    'claim creation does not change the creator content revision');
  const claimsRegion = page.getByRole('region', { name: 'Solicitudes' });
  await expect(claimsRegion).toContainText(/Pendiente/i,
    'the same owner document installs the claim history after the real 202 response');
  await expect(claimsRegion).toContainText(first.title);
  await expect(claimsRegion).toContainText(second.title);
  await expect(claimsRegion).toContainText(fromKnownUrl.url);
  assert.deepEqual(await fixture.rawResource(first.id), firstResourceBefore,
    'requesting edit access does not alter catalog metadata');

  const forbiddenEdit = await api(fixture, cookie, `/api/creador/recursos/?id=${encodeURIComponent(first.id)}`, {
    method: 'PATCH', body: { resourceVersion: firstResourceBefore.version, title: 'Cambio sin permiso' },
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

  const readsBeforeRefresh = ownerReads(capture).length;
  await page.locator('[data-claim-history-refresh]').click();
  await expect.poll(() => ownerReads(capture).length).toBe(readsBeforeRefresh + 1);
  await expect.poll(() => ownerReads(capture).at(-1)?.status).toBe(200);
  await expect(claimsRegion).toContainText(/Parcialmente resuelta/i);
  await expect(claimsRegion).toContainText(first.title);
  await expect(claimsRegion).toContainText(second.title);
  await expect(claimsRegion).toContainText(fromKnownUrl.url);
  const partialRecords = claimsRegion.getByRole('listitem').filter({ hasText: /Parcialmente resuelta/i });
  await expect(partialRecords).toHaveCount(1, 'the local 202 result plus the server history produce one claim record');
  const visible = await page.locator('body').innerText();
  for (const privateId of [first.id, second.id, fromKnownUrl.id, claimId]) {
    assert.equal(visible.includes(privateId), false, `owner-visible history does not expose internal ID ${privateId}`);
  }
  const saved = await fixture.request(cookie, '/api/creador/perfil').then((response) => response.json());
  assert.equal(saved.claims.length, 1, 'refreshing owner history does not create duplicate claims');
  assert.equal(saved.claims[0].status, 'partial');
  assert.equal(claimWrites(capture).length, 1, 'complete owner reads never replay claim creation');
  await capture.stop();
});

test('Solicitudes acepta una URL conocida al límite con padding aunque falle el índice público', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const ownerBefore = (await api(fixture, cookie, '/api/creador/perfil')).body;
  const knownUrlPrefix = 'https://catalog.example.invalid/known-during-index-error/';
  const knownUrl = `${knownUrlPrefix}${'a'.repeat(2048 - knownUrlPrefix.length)}`;
  assert.equal(knownUrl.length, 2048, 'the canonical URL reaches the frontend field limit before padding');
  const known = catalogEntry({
    id: 'phase5-claim-known-url-index-failure',
    title: 'Contenido identificado por la URL conocida',
    url: knownUrl,
  });
  const paddedKnownUrl = `  ${known.url}  `;
  assert.equal(paddedKnownUrl.length, 2052, 'the raw padded URL exceeds the limit only because of outer spaces');
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
  await urls.fill(paddedKnownUrl);
  const ownerReadsBeforeSubmit = ownerReads(capture).length;
  await page.getByRole('button', { name: /Enviar solicitud/i }).click();
  await expect.poll(() => claimWrites(capture).length).toBe(1);
  await expect.poll(() => claimWrites(capture)[0]?.status).toBe(202);
  await expect.poll(() => ownerReads(capture).length).toBe(ownerReadsBeforeSubmit + 1);
  await expect.poll(() => ownerReads(capture).at(-1)?.status).toBe(200);
  const post = claimWrites(capture)[0];
  assert.deepEqual(post.body, { resources: [{ url: paddedKnownUrl }], evidence: '' },
    'the form preserves the manually typed padded URL and raw empty evidence without inventing an ID while the index is unavailable');
  assert.equal(post.responseBody.operation, 'create-claim');
  const stored = await fixture.creatorStore.get(`claim:${post.responseBody.claimId}`);
  assert.deepEqual(stored.resourceIds, [known.id], 'the real service trims the free-text URL and resolves its current reservation');
  assert.deepEqual(stored.resources, [{ resourceId: known.id, url: known.url }],
    'the persisted claim points to the exact currently published resource and canonical URL');
  assert.equal((await api(fixture, cookie, '/api/creador/perfil')).body.creatorVersion, ownerBefore.creatorVersion,
    'a URL based request does not alter the owner profile');
  assert.equal(claimWrites(capture).length, 1, 'the acknowledgement and full read do not replay claim creation');
  await capture.stop();
});

test('Solicitudes conserva dos IDs con una URL compartida al paginar, filtrar y enviar', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const ownerBefore = (await api(fixture, cookie, '/api/creador/perfil')).body;
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
  const ownerReadsBeforeSubmit = ownerReads(capture).length;
  await page.getByRole('button', { name: /Enviar solicitud/i }).click();
  await expect.poll(() => claimWrites(capture).length).toBe(1);
  await expect.poll(() => claimWrites(capture)[0]?.status).toBe(202);
  await expect.poll(() => ownerReads(capture).length).toBe(ownerReadsBeforeSubmit + 1);
  await expect.poll(() => ownerReads(capture).at(-1)?.status).toBe(200);
  const post = claimWrites(capture)[0];
  assert.deepEqual(post.body, {
    resources: [
      { resourceId: first.id, url: sharedUrl },
      { resourceId: second.id, url: sharedUrl },
    ],
    evidence: '',
  }, 'page and filter changes retain both exact resource ID plus URL pairs');
  const stored = await fixture.creatorStore.get(`claim:${post.responseBody.claimId}`);
  assert.deepEqual(stored.resourceIds, [first.id, second.id]);
  assert.equal(new Set(stored.resourceIds).size, 2, 'the service preserves distinct cohost IDs despite the shared URL');
  assert.deepEqual(stored.resources, [
    { resourceId: first.id, url: sharedUrl },
    { resourceId: second.id, url: sharedUrl },
  ]);
  const visible = await page.locator('body').innerText();
  assert.equal(visible.includes(first.id), false);
  assert.equal(visible.includes(second.id), false);
  assert.equal((await api(fixture, cookie, '/api/creador/perfil')).body.creatorVersion, ownerBefore.creatorVersion);
  assert.equal(claimWrites(capture).length, 1, 'the full snapshot read does not replay the exact-ID request');
  await capture.stop();
});

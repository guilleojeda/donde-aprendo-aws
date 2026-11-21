import assert from 'node:assert/strict';
import { currentUrlCollision, currentUrlKey } from '../../src/lib/catalog-url.mjs';
import { CREATOR_FIELD_LIMITS } from '../../src/lib/creator-values.mjs';
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

async function serveSelectionIndex(page, initialEntries, {
  firstStatus = 200,
  firstBody,
  alwaysFail = false,
  failReads = [],
  failStatus = 503,
} = {}) {
  let entries = structuredClone(initialEntries);
  const failedReads = new Set(failReads);
  let reads = 0;
  await page.route('**/catalog-selection.json', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    reads += 1;
    const first = reads === 1;
    const failing = alwaysFail || first && firstStatus !== 200 || failedReads.has(reads);
    await route.fulfill({
      status: failing ? (first ? firstStatus : failStatus) : 200,
      contentType: 'application/json',
      body: first && firstBody !== undefined
        ? firstBody
        : failing
          ? JSON.stringify({ error: 'CATALOG_UNAVAILABLE' })
          : JSON.stringify(entries),
    });
  });
  return {
    get reads() { return reads; },
    replace(nextEntries) { entries = structuredClone(nextEntries); },
  };
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

test('Solicitudes sin página explica el requisito y mantiene la acción protegida', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page, { profile: false });
  await openOwnerClaims(page, fixture);
  const requestButton = page.getByRole('button', { name: 'Solicitar edición', exact: true });
  await expect(requestButton).toBeDisabled();
  await expect(requestButton).toHaveAttribute('aria-describedby', 'creator-owner-claims-requirement');
  await expect(page.locator('[data-claims-create-requirement]')).toContainText('Primero prepara tu página para solicitar edición.');
  await expect(page.locator('[data-claims-create-requirement] a')).toHaveAttribute('href', '#owner-create-name');
  const prepareLink = page.getByRole('link', { name: 'Preparar tu página', exact: true });
  await prepareLink.focus();
  await prepareLink.press('Enter');
  await expect(page.locator('#owner-create-name')).toBeFocused();
});

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

async function waitForClaimWrite(capture, { status, since }) {
  assert.ok(Number.isInteger(since) && since >= 0, 'waitForClaimWrite must start after a captured write boundary');
  const matching = () => claimWrites(capture).slice(since).find((record) => record.status === status);
  await expect.poll(matching).toBeTruthy();
  return matching();
}

async function installClaimRejections(page, fixture, modes) {
  let attempt = 0;
  const handler = async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() !== 'POST' || pathname !== '/api/creador/reclamaciones' || attempt >= modes.length) {
      await route.continue();
      return;
    }
    const mode = modes[attempt++];
    const body = request.postDataJSON();
    if (mode === 'known-url') {
      body.resources = [{ url: 'https://user:secret@example.invalid/private' }];
    } else if (mode === 'evidence' || mode === 'foreign') {
      body.evidence = 'x'.repeat(CREATOR_FIELD_LIMITS.evidence + 1);
    } else if (mode === 'selected') {
      body.resources = body.resources.map((target) => target.resourceId
        ? { ...target, url: 'https://user:secret@example.invalid/selected' }
        : target);
    }
    const headers = new Headers(request.headers());
    headers.delete('content-length');
    const actual = await fixture.creatorRuntime.handle(new Request(request.url(), {
      method: request.method(),
      headers,
      body: JSON.stringify(body),
    }));
    assert.equal(actual.status, 422, `the controlled ${mode} response comes from a real definitive claim rejection`);
    const payload = await actual.json();
    if (mode === 'known-url') payload.fieldErrors = [{ field: 'knownUrls', reason: 'invalid_url' }];
    else if (mode === 'evidence') payload.fieldErrors = [{ field: 'evidence', reason: 'too_long' }];
    else if (mode === 'foreign') payload.fieldErrors = [{ field: 'account.email', reason: 'too_long' }];
    const responseHeaders = Object.fromEntries(actual.headers.entries());
    delete responseHeaders['content-length'];
    await route.fulfill({ status: actual.status, headers: responseHeaders, body: JSON.stringify(payload) });
  };
  await page.route('**/api/creador/reclamaciones**', handler);
  return async () => page.unroute('**/api/creador/reclamaciones**', handler).catch(() => {});
}

async function expectClaimFieldError(page, field, pattern) {
  const control = page.getByLabel(field);
  await expect(control).toHaveAttribute('aria-invalid', 'true');
  const describedBy = (await control.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean);
  assert.ok(describedBy.length > 0, `${field} keeps an accessible description after rejection`);
  const descriptions = describedBy.map((id) => page.locator(`#${id}`));
  let matching;
  for (const locator of descriptions) {
    if (pattern.test(await locator.innerText())) { matching = locator; break; }
  }
  assert.ok(matching, `${field} exposes the specific correction in its description`);
  await expect(matching).toBeVisible();
  const owner = await control.evaluate((element) => element.closest('form')?.getAttribute('data-owner-form'));
  const errorOwner = await matching.evaluate((element) => element.closest('form')?.getAttribute('data-owner-form'));
  assert.equal(errorOwner, owner, `${field} error belongs to the same form`);
  return matching;
}

async function expectClaimFieldCleared(page, field, oldError) {
  const control = page.getByLabel(field);
  await expect(control).not.toHaveAttribute('aria-invalid', 'true');
  if (oldError) await expect(oldError).toBeHidden();
}

async function expectClaimDestinationGroupError(form, pattern) {
  const group = form.locator(':is(fieldset, [role="group"]):has(#owner-claim-urls):has([data-catalog-results], [data-catalog-select])');
  await expect(group).toBeVisible();
  await expect(group).toHaveAttribute('aria-invalid', 'true');
  await expect(group.locator('#owner-claim-urls')).toHaveCount(1,
    'the destination group contains the editable known-URLs control');
  await expect(group.locator('[data-catalog-results], [data-catalog-select]').first()).toBeVisible(
    'the destination group contains the catalog selection control');
  await expect(group.getByLabel(/Contexto privado/i)).toHaveCount(0,
    'private context is not part of the destination group');
  const describedBy = (await group.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean);
  assert.ok(describedBy.length > 0, 'the empty destination group keeps an accessible description');
  let matching;
  for (const id of describedBy) {
    const candidate = form.locator(`#${id}`);
    if (pattern.test(await candidate.innerText())) { matching = candidate; break; }
  }
  assert.ok(matching, 'the empty destination group exposes a corrective message');
  await expect(matching).toBeVisible();
  assert.equal(await group.evaluate((element) => element.closest('form')?.getAttribute('data-owner-form')),
    await matching.evaluate((element) => element.closest('form')?.getAttribute('data-owner-form')),
    'the destination error belongs to the same form');
  return { group, error: matching };
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
  await expect(page.locator('[data-claim-selection]')).toContainText(first.title);
  await expect(page.locator('[data-claim-selection]')).toContainText(second.title);
  await expect(urls).toHaveValue('ftp://not-a-resource.example.invalid/file');
  await expect(evidence).toHaveValue('Referencia privada con decisión automática desactivada.');
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
  await expect(claimsRegion).toContainText('Referencia privada con decisión automática desactivada.');
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
  const visible = await page.getByRole('region', { name: 'Solicitudes' }).innerText();
  for (const privateId of [first.id, second.id, fromKnownUrl.id, claimId]) {
    assert.equal(visible.includes(privateId), false, `owner-visible history does not expose internal ID ${privateId}`);
  }
  const saved = await fixture.request(cookie, '/api/creador/perfil').then((response) => response.json());
  assert.equal(saved.claims.length, 1, 'refreshing owner history does not create duplicate claims');
  assert.equal(saved.claims[0].status, 'partial');
  assert.equal(claimWrites(capture).length, 1, 'complete owner reads never replay claim creation');
  await capture.stop();
});

test('una selección de Solicitudes con URL obsoleta exige leer, actualizar el catálogo y elegir de nuevo', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const stale = catalogEntry({
    id: 'phase5-claim-stale-selected',
    title: 'Contenido cuyo destino cambió',
    url: 'https://catalog.example.invalid/claim-stale-old',
  });
  const current = { ...stale, url: 'https://catalog.example.invalid/claim-stale-current' };
  const extra = catalogEntry({
    id: 'phase5-claim-stale-extra',
    title: 'Contenido adicional conservado',
    url: 'https://catalog.example.invalid/claim-stale-extra',
  });
  const known = catalogEntry({
    id: 'phase5-claim-stale-known-url',
    title: 'Contenido de URL conocida conservado',
    url: 'https://catalog.example.invalid/claim-stale-known',
  });
  await Promise.all([current, extra, known].map((item) => seedCatalogRecord(fixture, item)));
  const staleEntries = [stale, extra, known];
  const currentEntries = [current, extra, known];
  const index = await serveSelectionIndex(page, staleEntries, { failReads: [2] });
  const capture = await captureCreatorApi(page);
  await openOwnerClaims(page, fixture);
  await openClaimComposer(page);

  const form = page.locator('form[data-owner-form="reclamacion"]');
  const staleCandidate = claimCandidate(page, stale.title);
  const extraCandidate = claimCandidate(page, extra.title);
  const urls = page.getByLabel(/URLs conocidas/i);
  const evidence = page.getByLabel(/Contexto privado/i);
  await staleCandidate.check();
  await extraCandidate.check();
  await urls.fill(known.url);
  await evidence.fill('Contexto privado conservado durante la actualización del catálogo.');
  const ownerReadsBefore = ownerReads(capture).length;
  const writesBefore = claimWrites(capture).length;
  await form.getByRole('button', { name: /Enviar solicitud/i }).click();
  await expect.poll(() => claimWrites(capture).length).toBe(writesBefore + 1);
  await expect.poll(() => claimWrites(capture).at(-1)?.status).toBe(409);
  await expect.poll(() => ownerReads(capture).length).toBe(ownerReadsBefore + 1);
  await expect.poll(() => ownerReads(capture).at(-1)?.status).toBe(200);
  const rejected = claimWrites(capture).at(-1);
  assert.equal(rejected.responseBody.error, 'RESOURCE_CONFLICT', 'the real claim service rejects the stale selected URL');
  assert.deepEqual(rejected.body, {
    resources: [
      { resourceId: stale.id, url: stale.url },
      { resourceId: extra.id, url: extra.url },
      { url: known.url },
    ],
    evidence: 'Contexto privado conservado durante la actualización del catálogo.',
  });
  assert.equal((await api(fixture, cookie, '/api/creador/perfil')).body.claims.length, 0,
    'a stale selection does not persist a partial request');

  const submit = form.getByRole('button', { name: /Enviar solicitud/i });
  await expect(submit).toBeDisabled();
  await expect(page.locator('[data-owner-recovery][data-recovery-kind="conflict"]')).toBeVisible();
  await expect(page.locator('[data-claim-selection]')).toContainText(stale.title);
  await expect(page.locator('[data-claim-selection]')).toContainText(extra.title);
  await expect(urls).toHaveValue(known.url);
  await expect(evidence).toHaveValue('Contexto privado conservado durante la actualización del catálogo.');

  await page.getByRole('button', { name: 'Volver al borrador', exact: true }).click();
  await expect(submit).toBeDisabled();
  const refresh = form.locator('[data-catalog-retry]');
  await expect(refresh).toBeVisible();
  await expect(page.locator('[data-claim-index-retry]')).toHaveCount(0);
  await expect(page.locator('[data-claim-selection]')).toContainText(stale.title);
  await expect(page.locator('[data-claim-selection]')).toContainText(extra.title);
  await expect(urls).toHaveValue(known.url);
  await expect(evidence).toHaveValue('Contexto privado conservado durante la actualización del catálogo.');

  await refresh.click();
  const retry = form.locator('[data-catalog-retry]');
  await expect(retry).toBeVisible();
  await expect(page.locator('[data-claim-index-retry]')).toHaveCount(0);
  await expect(submit).toBeDisabled();
  await expect(page.locator('[data-claim-selection]')).toContainText(stale.title);
  await expect(page.locator('[data-claim-selection]')).toContainText(extra.title);
  await expect(urls).toHaveValue(known.url);
  await expect(evidence).toHaveValue('Contexto privado conservado durante la actualización del catálogo.');
  assert.equal(index.reads, 2, 'the failed catalog refresh is one explicit read and never a claim write');
  assert.equal(claimWrites(capture).length, writesBefore + 1);

  index.replace(staleEntries);
  await retry.click();
  await expect(staleCandidate).toHaveCount(0);
  await expect(submit).toBeDisabled();
  await expect(page.locator('[data-claim-selection]')).toContainText(stale.title);
  await expect(page.locator('[data-claim-selection]')).toContainText(extra.title);
  await expect(urls).toHaveValue(known.url);
  await expect(evidence).toHaveValue('Contexto privado conservado durante la actualización del catálogo.');
  assert.equal(index.reads, 3, 'an unchanged successful read does not unlock or replay the stale selection');
  const refreshCurrent = form.locator('[data-catalog-retry]');
  await expect(refreshCurrent).toBeVisible();

  index.replace(currentEntries);
  await refreshCurrent.click();
  await expect.poll(() => index.reads).toBe(4);
  await expect(staleCandidate).not.toBeChecked();
  await staleCandidate.check();
  await expect(staleCandidate).toBeChecked();
  await expect(extraCandidate).toBeChecked();
  await expect(submit).toBeEnabled();
  await expect(urls).toHaveValue(known.url);
  await expect(evidence).toHaveValue('Contexto privado conservado durante la actualización del catálogo.');

  await submit.click();
  await expect.poll(() => claimWrites(capture).length).toBe(writesBefore + 2);
  await expect.poll(() => claimWrites(capture).at(-1)?.status).toBe(202);
  const accepted = claimWrites(capture).at(-1);
  assert.deepEqual(accepted.body.resources.slice().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), [
    { resourceId: extra.id, url: extra.url },
    { resourceId: current.id, url: current.url },
    { url: known.url },
  ].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  'the explicit retry sends the current selected pair, the extra selection, and the known URL');
  const stored = await fixture.creatorStore.get(`claim:${accepted.responseBody.claimId}`);
  assert.deepEqual(new Set(stored.resourceIds), new Set([current.id, extra.id, known.id]));
  assert.equal(stored.evidence, 'Contexto privado conservado durante la actualización del catálogo.');
  assert.equal((await api(fixture, cookie, '/api/creador/perfil')).body.claims.length, 1,
    'only the deliberate corrected submission persists a claim');
  assert.equal(claimWrites(capture).length, writesBefore + 2, 'the stale request is never auto-replayed');
  await capture.stop();
});

test('Solicitudes trata destinos vacíos como un error del grupo y conserva una selección editable', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const item = catalogEntry({
    id: 'phase5-claim-empty-destinations',
    title: 'Contenido para corregir la solicitud',
    url: 'https://catalog.example.invalid/empty-destinations',
  });
  await seedCatalogRecord(fixture, item);
  await serveSelectionIndex(page, [item]);
  const capture = await captureCreatorApi(page);
  await openOwnerClaims(page, fixture);
  const activeUrl = page.url();
  await openClaimComposer(page);

  const form = page.locator('form[data-owner-form="reclamacion"]');
  const urls = page.getByLabel(/URLs conocidas/i);
  const evidence = page.getByLabel(/Contexto privado/i);
  const privateContext = 'Contexto privado que debe sobrevivir a la corrección.';
  await evidence.fill(privateContext);
  await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const prompt = page.locator('[data-owner-exit-prompt]');
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Guardar y salir', exact: true }).click();
  await expect(form).toBeVisible();
  await expect(prompt).toBeHidden();
  await expect(page).toHaveURL(activeUrl, 'a failed local save-and-exit stays in the original claims view');
  const emptyDestinationError = await expectClaimDestinationGroupError(form, /selecciona una ficha|URL conocida|destino/iu);
  await expect(urls).toBeFocused();
  await expect(evidence).toHaveValue(privateContext);
  assert.equal(claimWrites(capture).length, 0, 'an empty destination group is rejected before any POST');
  assert.equal((await api(fixture, cookie, '/api/creador/perfil')).body.claims.length, 0);

  const candidate = claimCandidate(page, item.title);
  await candidate.check();
  await expect(candidate).toBeChecked();
  await expect(page.locator('[data-claim-selection]')).toContainText(item.title);
  await candidate.uncheck();
  await expect(candidate).not.toBeChecked();
  await urls.fill(item.url);
  await expect(emptyDestinationError.group).not.toHaveAttribute('aria-invalid', 'true');
  await expect(emptyDestinationError.error).toBeHidden();
  await form.getByRole('button', { name: /Enviar solicitud/i }).click();
  await expect.poll(() => claimWrites(capture).length).toBe(1);
  await expect.poll(() => claimWrites(capture)[0]?.status).toBe(202);
  const post = claimWrites(capture)[0];
  assert.deepEqual(post.body, { resources: [{ url: item.url }], evidence: privateContext });
  const stored = await fixture.creatorStore.get(`claim:${post.responseBody.claimId}`);
  assert.deepEqual(stored.resourceIds, [item.id], 'the corrected destination persists through the real claim service');
  assert.equal(stored.evidence, privateContext);
  await expect(page.getByRole('region', { name: 'Solicitudes' })).toContainText(privateContext);
  await expect(page).toHaveURL(activeUrl, 'the corrected normal save stays in the original claims view');
  await capture.stop();
});

test('Solicitudes atribuye sólo diagnósticos aplicables y deja selección, contexto y privacidad intactos', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const item = catalogEntry({
    id: 'phase5-claim-diagnostics',
    title: 'Contenido con diagnóstico de solicitud',
    url: 'https://catalog.example.invalid/claim-diagnostics',
  });
  await seedCatalogRecord(fixture, item);
  await serveSelectionIndex(page, [item]);
  const capture = await captureCreatorApi(page);
  const removeRejections = await installClaimRejections(page, fixture, ['known-url', 'evidence', 'selected', 'foreign']);
  const privateContext = 'Contexto privado no visible para otras personas.';
  try {
    await openOwnerClaims(page, fixture);
    await openClaimComposer(page);
    const form = page.locator('form[data-owner-form="reclamacion"]');
    const urls = page.getByLabel(/URLs conocidas/i);
    const evidence = page.getByLabel(/Contexto privado/i);

    await urls.fill('https://claim.example.invalid/escrita');
    await evidence.fill(privateContext);
    let rejectedWriteStart = claimWrites(capture).length;
    await form.getByRole('button', { name: /Enviar solicitud/i }).click();
    const knownUrlRejected = await waitForClaimWrite(capture, { status: 422, since: rejectedWriteStart });
    assert.equal(knownUrlRejected.responseBody.error, 'INVALID_URL');
    assert.deepEqual(knownUrlRejected.responseBody.fieldErrors, [{ field: 'knownUrls', reason: 'invalid_url' }]);
    assert.deepEqual(knownUrlRejected.body, { resources: [{ url: 'https://claim.example.invalid/escrita' }], evidence: privateContext });
    assert.equal(JSON.stringify(knownUrlRejected.responseBody).includes(privateContext), false);
    const knownUrlError = await expectClaimFieldError(page, /URLs conocidas/i, /URL|HTTP|HTTPS|dirección/iu);
    await expect(urls).toHaveValue('https://claim.example.invalid/escrita');
    await expect(evidence).toHaveValue(privateContext);
    assert.equal((await api(fixture, cookie, '/api/creador/perfil')).body.claims.length, 0);

    await urls.fill(item.url);
    await expectClaimFieldCleared(page, /URLs conocidas/i, knownUrlError);
    await evidence.fill(privateContext);
    rejectedWriteStart = claimWrites(capture).length;
    await form.getByRole('button', { name: /Enviar solicitud/i }).click();
    const evidenceRejected = await waitForClaimWrite(capture, { status: 422, since: rejectedWriteStart });
    assert.equal(evidenceRejected.responseBody.error, 'FIELD_TOO_LONG');
    assert.deepEqual(evidenceRejected.responseBody.fieldErrors, [{ field: 'evidence', reason: 'too_long' }]);
    assert.deepEqual(evidenceRejected.body, { resources: [{ url: item.url }], evidence: privateContext });
    const evidenceError = await expectClaimFieldError(page, /Contexto privado/i, /límite|caracteres|reduce/iu);
    await expect(urls).not.toHaveAttribute('aria-invalid', 'true');
    await expect(urls).toHaveValue(item.url);
    await expect(evidence).toHaveValue(privateContext);

    await evidence.fill(privateContext);
    await expectClaimFieldCleared(page, /Contexto privado/i, evidenceError);
    const selected = claimCandidate(page, item.title);
    await selected.check();
    await expect(selected).toBeChecked();
    await urls.fill('');
    rejectedWriteStart = claimWrites(capture).length;
    await form.getByRole('button', { name: /Enviar solicitud/i }).click();
    const selectedRejected = await waitForClaimWrite(capture, { status: 422, since: rejectedWriteStart });
    assert.equal(selectedRejected.responseBody.error, 'INVALID_URL');
    assert.equal(selectedRejected.responseBody.fieldErrors?.some(({ field }) => field === 'knownUrls') ?? false, false,
      'a selected-record rejection never attributes an error to the optional written-URLs field');
    await expect(selected).toBeChecked();
    await expect(selected).toBeEnabled();
    await expect(urls).not.toHaveAttribute('aria-invalid', 'true');
    await expect(evidence).toHaveValue(privateContext);
    assert.equal((await api(fixture, cookie, '/api/creador/perfil')).body.claims.length, 0);

    await selected.uncheck();
    await expect(selected).not.toBeChecked();
    await urls.fill(item.url);
    await evidence.fill(privateContext);
    rejectedWriteStart = claimWrites(capture).length;
    await form.getByRole('button', { name: /Enviar solicitud/i }).click();
    const foreignRejected = await waitForClaimWrite(capture, { status: 422, since: rejectedWriteStart });
    assert.equal(foreignRejected.responseBody.error, 'FIELD_TOO_LONG');
    assert.deepEqual(foreignRejected.responseBody.fieldErrors, [{ field: 'account.email', reason: 'too_long' }]);
    await expect(form.locator('[data-claim-status]')).toBeVisible();
    await expect(form.locator('[aria-invalid="true"]')).toHaveCount(0,
      'unknown or foreign diagnostics remain general feedback instead of marking a control');
    await expect(urls).toHaveValue(item.url);
    await expect(evidence).toHaveValue(privateContext);
    assert.equal((await api(fixture, cookie, '/api/creador/perfil')).body.claims.length, 0);

    const explicitWriteStart = claimWrites(capture).length;
    await removeRejections();
    await form.getByRole('button', { name: /Enviar solicitud/i }).click();
    await expect.poll(() => claimWrites(capture).length).toBe(explicitWriteStart + 1);
    const submitted = await waitForClaimWrite(capture, { status: 202, since: explicitWriteStart });
    assert.deepEqual(submitted.body, { resources: [{ url: item.url }], evidence: privateContext });
    const stored = await fixture.creatorStore.get(`claim:${submitted.responseBody.claimId}`);
    assert.deepEqual(stored.resourceIds, [item.id], 'the explicit corrected submission persists the selected destination');
    assert.equal(stored.evidence, privateContext);
    await expect(page.getByRole('region', { name: 'Solicitudes' })).toContainText(privateContext);
    assert.equal(claimWrites(capture).length, explicitWriteStart + 1, 'the service did not auto-replay a rejected request');
  } finally {
    await removeRejections();
    await capture.stop({ skipErrorBodies: true });
  }
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

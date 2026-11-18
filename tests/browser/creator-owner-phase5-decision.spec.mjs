import assert from 'node:assert/strict';
import {
  test, expect, captureCreatorApi, loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function ownerPath(request) {
  return new URL(request.url()).pathname.replace(/\/$/u, '');
}

function ownerReads(capture) {
  return capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil');
}

function ownerWrites(capture) {
  return capture.writes().filter(({ method, path }) => method === 'PUT' && path === '/api/creador/perfil');
}

async function enabledOwnerReadRetry(page) {
  const retry = page.locator('[data-owner-check]:visible, [data-owner-refresh-retry]:visible');
  await expect(retry).toHaveCount(1);
  await expect(retry).toBeEnabled();
  return retry;
}

async function holdNextOwnerRead(page) {
  const entered = deferred();
  const release = deferred();
  const finished = deferred();
  let started = false;
  let actual;
  let handlerError;
  const handler = async (route) => {
    const request = route.request();
    if (started || request.method() !== 'GET' || ownerPath(request) !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    started = true;
    try {
      const response = await route.fetch();
      const body = await response.body();
      actual = { status: response.status(), body: JSON.parse(body.toString('utf8')) };
      entered.resolve();
      await release.promise;
      await route.fulfill({ response, body });
    } catch (error) {
      handlerError = error;
      entered.resolve();
    } finally {
      finished.resolve();
    }
  };
  await page.route('**/api/creador/**', handler);
  return {
    entered: entered.promise,
    finished: finished.promise,
    get actual() { return actual; },
    release: () => release.resolve(),
    async remove() {
      release.resolve();
      if (started) await finished.promise;
      await page.unroute('**/api/creador/**', handler).catch(() => {});
      if (handlerError) throw handlerError;
    },
  };
}

/**
 * Start a real browser GET before the claim is committed and hold its response.
 * Subsequent owner reads during the gate receive that same authentic pre-claim
 * snapshot, so the browser observes a delayed stale read rather than a fixture
 * object invented outside the application boundary.
 */
async function holdPreClaimOwnerRead(page) {
  const entered = deferred();
  const release = deferred();
  const finished = deferred();
  let captured;
  let handlerError;
  const handler = async (route) => {
    const request = route.request();
    if (request.method() !== 'GET' || ownerPath(request) !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    try {
      if (!captured) {
        const response = await route.fetch();
        const body = await response.body();
        captured = { status: response.status(), headers: response.headers(), body: JSON.parse(body.toString('utf8')) };
        entered.resolve();
      } else {
        entered.resolve();
      }
      await release.promise;
      await route.fulfill({
        status: captured.status,
        headers: captured.headers,
        contentType: 'application/json',
        body: JSON.stringify(captured.body),
      });
    } catch (error) {
      handlerError = error;
      entered.resolve();
    } finally {
      finished.resolve();
    }
  };
  await page.route('**/api/creador/**', handler);
  const fetchPromise = page.evaluate(async () => {
    const root = document.querySelector('[data-owner-root]');
    const response = await fetch('/api/creador/perfil/', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'x-creator-page-binding': root?.getAttribute('data-session-binding') ?? '',
      },
    });
    return { status: response.status, body: await response.json() };
  });
  await entered.promise;
  return {
    fetchPromise,
    get captured() { return captured; },
    release: () => release.resolve(),
    async remove() {
      release.resolve();
      await finished.promise;
      await page.unroute('**/api/creador/**', handler).catch(() => {});
      if (handlerError) throw handlerError;
    },
  };
}

async function seedClaimCandidate(fixture) {
  const candidate = {
    id: 'phase5-decision-claim-candidate',
    title: 'Contenido para validar la lectura de solicitudes',
    url: 'https://claims.example.invalid/phase5-decision',
    kind: 'community',
    category: 'Comunidad',
    format: 'community',
    published: true,
  };
  await seedResource(fixture.creatorStore, candidate);
  return candidate;
}

async function seedOwnerClaim(fixture, cookie, claim) {
  const { principal, profile } = await fixture.rawOwner(cookie);
  assert.equal(principal.state, 'authenticated');
  assert.ok(profile?.id);
  const stored = {
    recordType: 'claim',
    id: claim.id,
    profileId: profile.id,
    accountId: principal.accountId,
    resourceIds: [...claim.resourceIds],
    ...(claim.resources === undefined ? {} : { resources: claim.resources.map((resource) => ({ ...resource })) }),
    ...(claim.evidence === undefined ? {} : { evidence: claim.evidence }),
    ...(claim.status === undefined ? {} : { status: claim.status }),
    ...(claim.createdAt === undefined ? {} : { createdAt: claim.createdAt }),
    ...(claim.version === undefined ? {} : { version: claim.version }),
  };
  assert.equal(await fixture.creatorStore.transact({
    checks: [{ key: `claim:${claim.id}`, version: null }, { key: `claim-ref:${profile.id}:${claim.id}`, version: null }],
    puts: [
      { key: `claim:${claim.id}`, value: stored },
      { key: `claim-ref:${profile.id}:${claim.id}`, value: { id: claim.id, version: claim.version ?? 1 } },
    ],
  }), true, `the prior owner claim ${claim.id} is seeded atomically`);
  return stored;
}

async function openClaims(page, fixture, candidate) {
  await page.route('**/catalog-selection.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([{ id: candidate.id, title: candidate.title, url: candidate.url, tipo: 'community' }]),
  }));
  await page.goto(`${fixture.origin}/cuenta/?vista=solicitudes`);
  await expect(page.locator('astro-island[component-url*="CreatorOwnerApp"]')).not.toHaveAttribute('ssr', '');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Solicitudes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Solicitar edición', exact: true }).click();
  const form = page.locator('[data-owner-dialog] form[data-owner-form="reclamacion"]');
  await expect(form).toBeVisible();
  await form.getByRole('checkbox', { name: `Solicitar edición de ${candidate.title}`, exact: true }).check();
  await form.getByLabel(/Contexto privado/iu).fill('Lectura de confirmación de fase 5');
  return form;
}

for (const [choice, label] of [
  ['stay', 'Quedarme aquí'],
  ['leave', 'Seguir a la página solicitada'],
]) {
  test(`un Save confirmado mantiene la decisión de Back abierta hasta ${choice === 'stay' ? 'quedarse' : 'salir'}`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
    await expect(page.locator('astro-island[component-url*="CreatorOwnerApp"]')).not.toHaveAttribute('ssr', '');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
    const destination = page.url();
    await page.locator('#owner-link-order').selectOption('titulo-desc');
    await expect(page).toHaveURL((url) => url.searchParams.get('orden') === 'titulo-desc');
    const activeUrl = page.url();
    await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
    const form = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
    await expect(form).toBeVisible();
    const submittedCity = `Fase 5 ${choice}`;
    await form.getByLabel(/Ciudad/u).fill(submittedCity);
    const capture = await captureCreatorApi(page, { skipErrorBodies: true });
    const read = await holdNextOwnerRead(page);
    let back;
    try {
      const save = form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
      await read.entered;
      await expect.poll(() => ownerWrites(capture)[0]?.status).toBe(200);
      back = page.goBack();
      const prompt = page.locator('[data-owner-exit-prompt]');
      await expect(prompt).toBeVisible();
      await expect(page).toHaveURL(activeUrl, 'the real Back remains on the active owner entry while the read is pending');

      read.release();
      await save;
      await read.finished;
      assert.equal(read.actual.status, 200, 'the held read is the real successful full owner GET after Save');
      assert.equal(read.actual.body.profile.city, submittedCity, 'the held full read contains the submitted city');
      assert.equal((await fixture.rawOwner(cookie)).profile.city, submittedCity, 'the real Save persists the submitted city');
      await expect(prompt).toBeVisible();
      await expect(page).toHaveURL(activeUrl, 'adopting the acknowledged full read does not choose the pending navigation');
      assert.equal(ownerWrites(capture).length, 1, 'the delayed read never replays the ordinary Save');
      await expect(prompt.getByRole('button', { name: label, exact: true })).toBeVisible();
      await prompt.getByRole('button', { name: label, exact: true }).click();
      if (choice === 'stay') {
        await expect(prompt).toHaveCount(0);
        await expect(page).toHaveURL(activeUrl);
        await page.goBack();
        await expect(page).toHaveURL(destination,
          'a later native Back is still available after explicitly staying');
      } else {
        await back;
        await expect(page).toHaveURL(destination,
          'only the explicit leave choice resumes the held native Back');
      }
      assert.equal(ownerWrites(capture).length, 1, 'the navigation decision never resends the Save');
    } finally {
      read.release();
      back?.catch(() => {});
      await read.remove();
      capture.stop({ skipErrorBodies: true }).catch(() => {});
    }
  });
}

test('una validación nativa de Guardar y salir no autoriza la salida de un guardado posterior', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await fixture.rawOwner(cookie);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('astro-island[component-url*="CreatorOwnerApp"]')).not.toHaveAttribute('ssr', '');
  const destination = page.url();
  await page.locator('#owner-link-order').selectOption('titulo-desc');
  await expect(page).toHaveURL((url) => url.searchParams.get('orden') === 'titulo-desc');
  const activeUrl = page.url();

  await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
  const form = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
  const name = form.getByLabel('Nombre visible', { exact: true });
  await name.fill('');
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const back = page.goBack();
  try {
    const prompt = page.locator('[data-owner-exit-prompt]');
    await expect(prompt).toBeVisible();
    await expect(page).toHaveURL(activeUrl);
    await prompt.getByRole('button', { name: 'Guardar y salir', exact: true }).click();
    await expect(name).toBeFocused();
    assert.equal(await name.evaluate((input) => input.validity.valueMissing), true);
    assert.equal(ownerWrites(capture).length, 0, 'native validation prevents a first request');
    assert.equal((await fixture.rawOwner(cookie)).profile.displayName, initial.profile.displayName);

    const correctedName = 'Nombre corregido después de validar';
    await name.fill(correctedName);
    await form.getByRole('button', { name: 'Guardar datos', exact: true }).click();
    await expect.poll(() => ownerWrites(capture)[0]?.status).toBe(200);
    await expect(form).not.toBeVisible();
    await expect(page).toHaveURL(activeUrl, 'the ordinary Save does not resume an abandoned Back');
    assert.equal((await fixture.rawOwner(cookie)).profile.displayName, correctedName);
    assert.equal(ownerWrites(capture).length, 1);
    await page.goBack();
    await expect(page).toHaveURL(destination, 'a new Back remains available after saving');
    await expect(prompt).toHaveCount(0);
  } finally {
    back.catch(() => {});
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('cerrar con Escape conserva el borrador para Guardar y salir sin cambiar la URL', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('astro-island[component-url*="CreatorOwnerApp"]')).not.toHaveAttribute('ssr', '');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
  const activeUrl = page.url();
  await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
  const form = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
  const city = form.getByLabel(/Ciudad/u);
  const savedCity = 'Guardado después de Escape';
  await city.fill(savedCity);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  try {
    await page.keyboard.press('Escape');
    const prompt = page.locator('[data-owner-exit-prompt]');
    await expect(prompt).toBeVisible();
    await expect(page).toHaveURL(activeUrl);
    await prompt.getByRole('button', { name: 'Guardar y salir', exact: true }).click();
    await expect.poll(() => ownerWrites(capture)[0]?.status).toBe(200);
    await expect(page.locator('[data-owner-dialog]')).not.toBeVisible();
    await expect(page).toHaveURL(activeUrl, 'local Escape close has no departure target');
    assert.equal((await fixture.rawOwner(cookie)).profile.city, savedCity);
    assert.equal(ownerWrites(capture).length, 1, 'Save and exit performs one ordinary profile write');
  } finally {
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('un Save fallido y su salida no navegan después de una comprobación: sólo una nueva decisión autoriza Back', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const initial = await fixture.rawOwner(cookie);
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('astro-island[component-url*="CreatorOwnerApp"]')).not.toHaveAttribute('ssr', '');
  await page.waitForLoadState('networkidle');
  const destination = page.url();
  await page.locator('#owner-link-order').selectOption('titulo-desc');
  await expect(page).toHaveURL((url) => url.searchParams.get('orden') === 'titulo-desc');
  const activeUrl = page.url();
  await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
  const form = page.locator('[data-owner-dialog] form[data-owner-form="datos"]');
  const city = form.getByLabel(/Ciudad/u);
  const draftCity = 'Borrador que debe quedarse';
  await city.fill(draftCity);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  let failed = false;
  const failSave = async (route) => {
    const request = route.request();
    if (!failed && request.method() === 'PUT' && ownerPath(request) === '/api/creador/perfil') {
      failed = true;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'TEMPORARY_FAILURE' }) });
      return;
    }
    await route.continue();
  };
  await page.route('**/api/creador/**', failSave);
  let back;
  try {
    back = page.goBack();
    const prompt = page.locator('[data-owner-exit-prompt]');
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Guardar y salir', exact: true }).click();
    await expect.poll(() => ownerWrites(capture)[0]?.status).toBe(503);
    await expect(prompt).toBeVisible('a failed Save keeps the original undecided Back surface available');
    await expect(city).toHaveValue(draftCity);
    await expect(prompt.getByRole('button', { name: 'Comprobar estado guardado', exact: true })).toBeVisible();
    await expect(page).toHaveURL(activeUrl);
    await page.unroute('**/api/creador/**', failSave);

    const readsBeforeCompare = ownerReads(capture).length;
    await prompt.getByRole('button', { name: 'Comprobar estado guardado', exact: true }).click();
    await expect.poll(() => ownerReads(capture).length).toBe(readsBeforeCompare + 1);
    const comparison = ownerReads(capture).at(-1);
    await expect.poll(() => comparison.status).toBe(200);
    assert.equal(comparison.responseBody.profile.city, initial.profile.city,
      'the real compare read retains the original saved city after the failed Save');
    assert.equal((await fixture.rawOwner(cookie)).profile.city, initial.profile.city,
      'the failed Save leaves the stored city unchanged before the explicit discard');
    await expect(prompt).toBeVisible();
    await expect(prompt.getByRole('button', { name: 'Volver al borrador', exact: true })).toBeVisible();
    await expect(city).toHaveValue(draftCity);
    await expect(page).toHaveURL(activeUrl, 'a failed Save does not consume the already requested history destination');
    assert.equal(ownerWrites(capture).length, 1, 'checking saved state never retries the failed Save');

    await prompt.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
    await back;
    await expect(page).toHaveURL(destination);
    assert.equal((await fixture.rawOwner(cookie)).profile.city, initial.profile.city,
      'discarding the failed draft does not change the stored city');
    assert.equal(ownerWrites(capture).length, 1, 'the eventual explicit discard also sends no write');
  } finally {
    await page.unroute('**/api/creador/**', failSave).catch(() => {});
    back?.catch(() => {});
    capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('una reclamación real no consume el borrador con un GET pre-claim: Retry instala el claim exacto sin replay', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const candidate = await seedClaimCandidate(fixture);
  const priorClaim = await seedOwnerClaim(fixture, cookie, {
    id: 'phase5-decision-prior-claim',
    resourceIds: [candidate.id],
    evidence: 'Lectura de confirmación de fase 5',
    status: 'pending',
    createdAt: Date.UTC(2026, 9, 22, 12),
    version: 1,
  });
  const form = await openClaims(page, fixture, candidate);
  const selected = form.getByRole('checkbox', { name: `Solicitar edición de ${candidate.title}`, exact: true });
  const evidence = form.getByLabel(/Contexto privado/iu);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const claimRead = await holdPreClaimOwnerRead(page);
  let claimPost;
  try {
    const preClaim = claimRead.captured;
    assert.equal(preClaim.status, 200, 'the pre-claim snapshot comes from an actual owner GET');
    assert.deepEqual(preClaim.body.claims.map(({ id }) => id), [priorClaim.id],
      'the authentic pre-claim snapshot contains only the prior similar claim');
    assert.equal(preClaim.body.claims[0].evidence, priorClaim.evidence);
    assert.ok(Number.isSafeInteger(preClaim.body.creatorVersion));

    const submit = form.getByRole('button', { name: /Enviar solicitud/iu }).click();
    await expect.poll(() => capture.writes().find(({ method, path }) => method === 'POST' && path === '/api/creador/reclamaciones')?.status)
      .toBe(202);
    claimPost = capture.writes().find(({ method, path }) => method === 'POST' && path === '/api/creador/reclamaciones');
    assert.equal(claimPost.responseBody.schemaVersion, 2);
    assert.equal(claimPost.responseBody.operation, 'create-claim');
    assert.equal(claimPost.responseBody.disposition, 'submitted');
    assert.ok(claimPost.responseBody.claimId);
    assert.ok(Number.isSafeInteger(claimPost.responseBody.claimVersion));
    const stored = await fixture.creatorStore.get(`claim:${claimPost.responseBody.claimId}`);
    assert.deepEqual(stored.resourceIds, [candidate.id], 'the real claim is persisted before the delayed full read returns');

    claimRead.release();
    await submit;
    const staleRead = await claimRead.fetchPromise;
    assert.equal(staleRead.status, 200);
    assert.equal(staleRead.body.creatorVersion, preClaim.body.creatorVersion,
      'the authentic delayed GET is at the unchanged creator revision');
    assert.deepEqual(staleRead.body.claims.map(({ id }) => id), [priorClaim.id],
      'the authentic delayed GET has a similar but different claim ID, not the new receipt identity');
    assert.equal(staleRead.body.claims.some(({ id }) => id === claimPost.responseBody.claimId), false,
      'the exact acknowledged claim is absent from the delayed pre-claim snapshot');
    await expect(form).toBeVisible();
    await expect(selected).toBeChecked();
    await expect(evidence).toHaveValue('Lectura de confirmación de fase 5');
    await enabledOwnerReadRetry(page);
    await expect(page.locator(`[data-claim-record="${claimPost.responseBody.claimId}"]`)).toHaveCount(0,
      'the stale read cannot report the claim as updated');
    assert.equal(capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/reclamaciones').length, 1,
      'the stale read does not replay the non-idempotent claim POST');

    await claimRead.remove();
    const claimKey = `claim:${claimPost.responseBody.claimId}`;
    const committedClaim = await fixture.creatorStore.get(claimKey);
    assert.equal(committedClaim.version, claimPost.responseBody.claimVersion);
    assert.equal(await fixture.creatorStore.transact({
      checks: [{ key: claimKey, version: committedClaim.version }],
      puts: [{ key: claimKey, value: { ...committedClaim, version: 0 } }],
    }), true, 'the provider-shaped store now serves the exact claim ID without a qualifying version');
    const readsBeforeRetry = ownerReads(capture).length;
    const tooOldRetry = await enabledOwnerReadRetry(page);
    await tooOldRetry.click();
    await expect.poll(() => ownerReads(capture).length).toBe(readsBeforeRetry + 1);
    const tooOldRead = ownerReads(capture).at(-1);
    await expect.poll(() => tooOldRead.status).toBe(200);
    const tooOld = tooOldRead.responseBody.claims.find(({ id }) => id === claimPost.responseBody.claimId);
    assert.ok(tooOld, 'the too-old full read contains the exact receipt identity');
    assert.equal(tooOld.version, undefined, 'the exact receipt identity has no qualifying version in the too-old read');
    await expect(form).toBeVisible();
    await expect(selected).toBeChecked();
    await expect(evidence).toHaveValue('Lectura de confirmación de fase 5');
    await enabledOwnerReadRetry(page);
    assert.equal(capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/reclamaciones').length, 1,
      'the absent/too-old exact read remains read-only');

    const tooOldStored = await fixture.creatorStore.get(claimKey);
    assert.equal(tooOldStored.version, 0);
    assert.equal(await fixture.creatorStore.transact({
      checks: [{ key: claimKey, version: 0 }],
      puts: [{ key: claimKey, value: { ...tooOldStored, version: 2 } }],
    }), true, 'the provider-shaped store advances the exact receipt to a newer version');
    const readsBeforeCurrent = ownerReads(capture).length;
    const currentRetry = await enabledOwnerReadRetry(page);
    await currentRetry.click();
    await expect.poll(() => ownerReads(capture).length).toBe(readsBeforeCurrent + 1);
    const currentRead = ownerReads(capture).at(-1);
    await expect.poll(() => currentRead.status).toBe(200);
    await expect.poll(() => page.locator(`[data-claim-record="${claimPost.responseBody.claimId}"]`).count()).toBe(1);
    await expect(page.locator(`[data-claim-record="${claimPost.responseBody.claimId}"]`)).toContainText(candidate.title);
    const current = currentRead.responseBody;
    const installedClaim = current.claims.find(({ id }) => id === claimPost.responseBody.claimId);
    assert.ok(installedClaim, 'the explicit Retry installs the claim returned by the current full read');
    assert.equal(installedClaim.id, claimPost.responseBody.claimId);
    assert.ok(installedClaim.version >= claimPost.responseBody.claimVersion,
      'the installed claim proves the exact receipt version or a later version');
    assert.equal(current.creatorVersion, preClaim.body.creatorVersion,
      'claim history adoption does not invent a creator profile revision');
    await expect(form).toHaveCount(0, 'the current read closes only after it proves the acknowledged claim');
    await expect(page.getByRole('button', { name: 'Solicitar edición', exact: true })).toBeEnabled();
    assert.equal(capture.writes().filter(({ method, path }) => method === 'POST' && path === '/api/creador/reclamaciones').length, 1,
      'current-read recovery remains read-only');
  } finally {
    claimRead.release();
    await claimRead.remove().catch(() => {});
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
    await page.unroute('**/catalog-selection.json').catch(() => {});
  }
});

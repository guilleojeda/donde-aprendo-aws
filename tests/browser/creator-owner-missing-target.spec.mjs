import assert from 'node:assert/strict';
import { completeLogin, cookiePair, makeAccount, makeIdentity } from '../fixtures/account-auth.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';
import {
  test, expect, api, addChapter, addLink, captureCreatorApi, createSeries,
  loggedInOwner, openSeriesView,
} from '../fixtures/creator-browser-test.mjs';

const OWNER_PATH = '/api/creador/perfil';

function linkEditor(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="enlace"]');
}

function seriesEditor(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="serie"]');
}

function writesTo(capture, method, path) {
  return capture.writes().filter((write) => write.method === method && write.path === path);
}

async function ownerDto(fixture, cookie) {
  const result = await api(fixture, cookie, OWNER_PATH);
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

async function openLinksView(page, fixture) {
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
}

async function ensurePlacementOptions(fixture, cookie, placementId, wanted) {
  const current = await ownerDto(fixture, cookie);
  const link = current.links.find(({ placementId: id }) => id === placementId);
  assert.ok(link, 'the option fixture starts with the real placement');
  if (link.featured === wanted.featured && link.selectedForDirectory === wanted.selectedForDirectory) return current;
  const result = await api(fixture, cookie, `/api/creador/enlaces/${placementId}/editar`, {
    method: 'PATCH',
    body: {
      profileVersion: current.profile.version,
      placementVersion: link.placementVersion,
      resourceVersion: link.resourceVersion,
      ...wanted,
    },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return ownerDto(fixture, cookie);
}

async function expectDepartedOptionsNotice(dialog) {
  const notice = dialog.locator('p').filter({
    hasText: /(?=.*no)(?=.*destacad)(?=.*posici[oó]n)(?=.*cap[ií]tulo)/isu,
  });
  await expect(notice, 'the comparison explains that old highlight, position and chapters will not be restored').toHaveCount(1);
  await expect(notice).toBeVisible();
}

async function expectFocusInsideEditor(page, form) {
  await expect(form).toBeVisible();
  await expect(page.locator(':focus')).toBeVisible();
  const focus = await form.evaluate((activeForm) => {
    const dialog = activeForm.closest('[data-owner-dialog]');
    const active = document.activeElement;
    const isElement = active instanceof HTMLElement;
    const control = active instanceof HTMLButtonElement || active instanceof HTMLInputElement
      || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
    return {
      withinDialog: Boolean(isElement && dialog?.contains(active)),
      withinForm: Boolean(isElement && activeForm.contains(active)),
      rendered: Boolean(isElement && active.getClientRects().length > 0
        && getComputedStyle(active).visibility !== 'hidden' && !active.closest('[hidden]')),
      disabled: Boolean(control && active.disabled),
      staleRecoveryControl: Boolean(active instanceof Element
        && active.matches('[data-owner-compare], [data-owner-adopt]')),
    };
  });
  assert.equal(focus.withinDialog, true, 'focus stays in the open native editor dialog');
  assert.equal(focus.withinForm, true, 'focus moves into the active editor form');
  assert.equal(focus.rendered, true, 'focus does not land on a hidden or unrendered control');
  assert.equal(focus.disabled, false, 'focus does not land on a disabled control');
  assert.equal(focus.staleRecoveryControl, false, 'focus leaves the obsolete comparison/adoption controls');
}

async function loginAdditionalOwner(fixture, sub) {
  const email = `${sub}@example.invalid`;
  const identity = makeIdentity({ sub });
  fixture.accountStore.seedAccount(makeAccount({ identity, email }));
  const oldClaims = fixture.accountHarness.state.oidc.claims;
  fixture.accountHarness.state.oidc.claims = { sub, email };
  try {
    const login = await completeLogin(fixture.accountHarness);
    assert.equal(login.response.status, 303);
    assert.ok(login.sessionCookie);
    return { pair: cookiePair(login.sessionCookie) };
  } finally {
    if (oldClaims === undefined) delete fixture.accountHarness.state.oidc.claims;
    else fixture.accountHarness.state.oidc.claims = oldClaims;
  }
}

function catalogEntry(id, title, url) {
  return { id, title, url, tipo: 'community' };
}

test('edición propia tras retirar la colocación conserva metadatos y exige una reincorporación nueva', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const series = await createSeries(fixture, cookie, {
    name: 'F1 retirada de capítulos', slug: 'f1-retirada-de-capitulos',
  });
  const link = await addLink(fixture, cookie, {
    title: 'Ficha propia antes de retirar', url: 'https://f1-own.example/current',
  });
  const following = await addLink(fixture, cookie, {
    title: 'Ficha que conserva su lugar', url: 'https://f1-own.example/following',
  });
  await ensurePlacementOptions(fixture, cookie, link.placementId, { featured: false, selectedForDirectory: true });
  await addChapter(fixture, cookie, series.id, link.placementId);
  const beforeRemoval = await ownerDto(fixture, cookie);
  const target = beforeRemoval.links.find(({ placementId }) => placementId === link.placementId);
  assert.ok(target?.series.some(({ seriesId }) => seriesId === series.id));
  const beforeOrder = beforeRemoval.links.map(({ placementId }) => placementId);
  assert(beforeOrder.indexOf(link.placementId) < beforeOrder.indexOf(following.placementId),
    'the target starts before the surviving link');
  const resourceBefore = await fixture.rawResource(link.resourceId);

  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page);
  try {
    await page.locator(`[data-link-row="${link.placementId}"]`)
      .getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const editor = linkEditor(page);
    await expect(editor).toBeVisible();
    const local = {
      title: 'Corrección local de ficha retirada',
      url: 'https://f1-own.example/corrected',
      description: 'Descripción corregida que debe sobrevivir a la retirada.',
    };
    await editor.getByLabel('Título', { exact: true }).fill(local.title);
    await editor.getByLabel('URL', { exact: true }).fill(local.url);
    await editor.getByLabel('Descripción', { exact: false }).fill(local.description);
    await editor.getByRole('checkbox', { name: 'Destacar en tu página', exact: true }).check();
    await editor.getByRole('checkbox', { name: 'Proponer al directorio', exact: true }).uncheck();

    const removed = await api(fixture, cookie, `/api/creador/enlaces/${link.placementId}`, {
      method: 'DELETE', body: { profileVersion: beforeRemoval.profile.version },
    });
    assert.equal(removed.response.status, 204, 'a second real API caller removes the placement');
    assert.equal(await fixture.rawPlacement(cookie, link.placementId), null);
    assert.ok((await ownerDto(fixture, cookie)).editableResources.some(({ id }) => id === link.resourceId),
      'the removed own resource remains separately authorized for metadata editing');

    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    const stalePath = `/api/creador/enlaces/${link.placementId}/editar`;
    await expect.poll(() => writesTo(capture, 'PATCH', stalePath)[0]?.status).not.toBeUndefined();
    const stale = writesTo(capture, 'PATCH', stalePath);
    await stale[0].settled;
    assert.ok([404, 409].includes(stale[0].status), `the removed placement save should fail, received ${stale[0].status}`);
    assert.equal(stale.length, 1, 'the failed placement save is not replayed');
    for (const [field, value] of Object.entries(local)) await expect(editor.getByLabel(field === 'description' ? 'Descripción' : field === 'title' ? 'Título' : 'URL', { exact: field !== 'description' })).toHaveValue(value);
    await expect(editor.getByRole('checkbox', { name: 'Destacar en tu página', exact: true })).toBeChecked();
    await expect(editor.getByRole('checkbox', { name: 'Proponer al directorio', exact: true })).not.toBeChecked();

    const writesBeforeCompare = capture.writes().length;
    await editor.locator('[data-owner-compare]').click();
    const comparison = editor.locator('[data-owner-comparison]');
    await expect(comparison).toBeVisible();
    const retainedComparisonMessage = 'La ficha propia sigue disponible, pero el enlace ya no está en tu página. Puedes continuar con título, URL y descripción; Guardar no lo vuelve a agregar.';
    await expect(page.getByText(retainedComparisonMessage, { exact: true })).toHaveCount(1,
      'the F1 explanation appears once across the page status, form status and comparison');
    const continueRetained = editor.getByRole('button', { name: 'Continuar editando la ficha retirada', exact: true });
    await expect(continueRetained).toBeVisible();
    await expectDepartedOptionsNotice(page.locator('[data-owner-dialog]'));
    for (const [field, value] of Object.entries(local)) {
      await expect(editor.getByLabel(field === 'description' ? 'Descripción' : field === 'title' ? 'Título' : 'URL', { exact: field !== 'description' })).toHaveValue(value);
    }
    await expect(editor.getByRole('checkbox', { name: 'Destacar en tu página', exact: true })).toBeChecked();
    await expect(editor.getByRole('checkbox', { name: 'Proponer al directorio', exact: true })).not.toBeChecked();
    assert.deepEqual(await fixture.rawResource(link.resourceId), resourceBefore,
      'comparison and the pending local metadata did not write the resource');
    assert.equal(capture.writes().length, writesBeforeCompare,
      'the actual comparison GET performs no additional writes');

    await continueRetained.click();
    await expect(editor.getByLabel('Título', { exact: true })).toHaveValue(local.title);
    await expect(editor.getByLabel('URL', { exact: true })).toHaveValue(local.url);
    await expect(editor.getByLabel('Descripción', { exact: false })).toHaveValue(local.description);
    await expect(editor.getByText('Editas una ficha propia que ya no está colocada en tu página. Guardar aquí no la reincorpora.', { exact: true })).toHaveCount(1);
    await expect(page.locator('[data-owner-status]')).toHaveCount(0,
      'the retained editor intro is the single explanation; adoption does not add a duplicate global status');
    await expectFocusInsideEditor(page, editor);
    await expect(editor.locator('[data-link-options]')).toHaveCount(0,
      'the retained-resource continuation carries metadata only');
    assert.equal(capture.writes().length, writesBeforeCompare,
      'choosing the continuation still does not save or replay by itself');

    await editor.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
    const resourcePath = `/api/creador/recursos/${link.resourceId}`;
    await expect.poll(() => writesTo(capture, 'PATCH', resourcePath)[0]?.status).toBe(200);
    const resourceWrites = writesTo(capture, 'PATCH', resourcePath);
    await resourceWrites[0].settled;
    const changedResource = await fixture.rawResource(link.resourceId);
    assert.deepEqual({ title: changedResource.title, url: changedResource.url, description: changedResource.description }, local);
    assert.equal(changedResource.version, resourceBefore.version + 1);
    assert.deepEqual((await ownerDto(fixture, cookie)).links.map(({ placementId }) => placementId), [following.placementId],
      'saving retained metadata does not put the removed placement back');

    const retained = page.locator(`[data-retained-resource="${link.resourceId}"]`);
    await expect(retained).toBeVisible();
    await retained.getByRole('button', { name: 'Volver a agregar', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(201);
    const readds = writesTo(capture, 'POST', '/api/creador/enlaces');
    await readds[0].settled;
    assert.equal(readds.length, 1, 'Re-add happens only after its separate explicit button press');
    assert.equal(readds[0].body.resourceId, link.resourceId);
    assert.equal(readds[0].body.resourceVersion, changedResource.version);
    const afterReadd = await ownerDto(fixture, cookie);
    const readded = afterReadd.links.find(({ resourceId }) => resourceId === link.resourceId);
    assert.ok(readded);
    assert.equal(readded.url, local.url);
    assert.deepEqual(readded.series, [], 'Re-add does not restore chapters from the removed placement');
    assert.equal(readded.featured, false, 'the departed highlight is not restored');
    const afterOrder = afterReadd.links.map(({ placementId }) => placementId);
    assert(afterOrder.indexOf(readded.placementId) > afterOrder.indexOf(following.placementId),
      'the re-added placement is appended after the surviving link instead of restoring its old position');
    assert.deepEqual((await fixture.rawPlacement(cookie, readded.placementId)).series ?? {}, {});
    assert.deepEqual(await fixture.rawResource(link.resourceId), changedResource);
    assert.equal(writesTo(capture, 'PATCH', `/api/creador/enlaces/${link.placementId}/editar`).length, 1,
      'the old placement correction never runs again after Re-add');
  } finally {
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('referencia compartida retirada conserva su par vigente y la propuesta para un alta y opciones manuales', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const item = {
    id: 'phase1-f1-current-shared',
    title: 'Referencia compartida vigente',
    url: 'https://f1-shared.example/current-exact-pair',
  };
  await seedResource(fixture.creatorStore, {
    ...item, kind: 'community', category: 'Comunidad', format: 'community',
    topics: ['AWS'], published: true, hidden: false, approvalRevoked: false,
    directoryControl: 'editorial',
  });
  const initialOwner = await ownerDto(fixture, cookie);
  const created = await api(fixture, cookie, '/api/creador/referencias', {
    method: 'POST', body: {
      resourceId: item.id, url: item.url,
      profileVersion: initialOwner.profile.version, selectedForDirectory: true,
    },
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  const placementId = created.body.link.placementId;
  const resourceBefore = await fixture.rawResource(item.id);
  const entry = catalogEntry(item.id, item.title, item.url);
  let indexReads = 0;
  const indexRoute = async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    indexReads += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([entry]) });
  };
  await page.route('**/catalog-selection.json', indexRoute);

  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page);
  try {
    await page.locator(`[data-link-row="${placementId}"]`)
      .getByRole('button', { name: 'Editar opciones', exact: true }).click();
    const editor = linkEditor(page);
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('Título', { exact: true })).toHaveValue(item.title);
    await expect(editor.getByLabel('URL', { exact: true })).toHaveValue(item.url);
    await expect(editor.getByLabel('Descripción', { exact: false })).toHaveValue(created.body.link.description ?? '');
    await editor.getByRole('checkbox', { name: 'Destacar en tu página', exact: true }).check();
    await editor.getByRole('checkbox', { name: 'Proponer al directorio', exact: true }).uncheck();

    const beforeRemoval = await ownerDto(fixture, cookie);
    const removed = await api(fixture, cookie, `/api/creador/enlaces/${placementId}`, {
      method: 'DELETE', body: { profileVersion: beforeRemoval.profile.version },
    });
    assert.equal(removed.response.status, 204, 'the real owner API removes this shared placement');
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    const stalePath = `/api/creador/enlaces/${placementId}/editar`;
    await expect.poll(() => writesTo(capture, 'PATCH', stalePath)[0]?.status).toBe(404);
    const stale = writesTo(capture, 'PATCH', stalePath);
    await stale[0].settled;
    assert.equal(stale[0].responseBody.error, 'PLACEMENT_NOT_FOUND');
    assert.equal(stale.length, 1);
    await expect(editor.getByLabel('Título', { exact: true })).toHaveValue(item.title);
    await expect(editor.getByLabel('URL', { exact: true })).toHaveValue(item.url);
    await expect(editor.getByRole('checkbox', { name: 'Destacar en tu página', exact: true })).toBeChecked();
    await expect(editor.getByRole('checkbox', { name: 'Proponer al directorio', exact: true })).not.toBeChecked();

    const writesBeforeCompare = capture.writes().length;
    await editor.locator('[data-owner-compare]').click();
    await expect(editor.locator('[data-owner-comparison]')).toBeVisible();
    const continueReference = editor.getByRole('button', { name: 'Volver a elegir una referencia', exact: true });
    await expect(continueReference).toBeVisible();
    await expectDepartedOptionsNotice(page.locator('[data-owner-dialog]'));
    assert.equal((await ownerDto(fixture, cookie)).links.some(({ placementId: id }) => id === placementId), false,
      'the comparison observes the actual removal and does not recreate the reference');
    assert.deepEqual(await fixture.rawResource(item.id), resourceBefore,
      'a failed options save and comparison leave the shared resource unchanged');
    assert.equal(capture.writes().length, writesBeforeCompare,
      'the comparison GET writes nothing and does not submit a reference');

    await editor.getByRole('checkbox', { name: 'Destacar en tu página', exact: true }).uncheck();
    await expect(editor.getByRole('checkbox', { name: 'Destacar en tu página', exact: true })).not.toBeChecked();
    await continueReference.click();
    await expect(editor.locator('[data-owner-comparison]')).toHaveCount(0,
      'adopting the stale comparison only clears recovery controls and keeps the new local option');
    await expect(editor.locator('[data-owner-compare]')).toBeVisible();
    assert.equal(indexReads, 0, 'a reducer-rejected stale continuation must not fetch or mutate catalog state');
    assert.equal(capture.writes().length, writesBeforeCompare);

    await editor.locator('[data-owner-compare]').click();
    await expect(editor.locator('[data-owner-comparison]')).toBeVisible();
    await expect(continueReference).toBeVisible();
    assert.equal(indexReads, 0, 'a fresh comparison does not itself fetch or submit the reference');
    await continueReference.click();
    const referenceForm = page.locator('[data-owner-dialog] form[data-owner-form="referencia"]');
    await expect(referenceForm).toBeVisible();
    await expect.poll(() => indexReads).toBe(1,
      'the catalog loads only after the reducer commits the recovered-reference editor');
    await expect(referenceForm.locator('[data-catalog-index-status]')).toContainText('1 resultado');
    await expect(referenceForm.getByRole('radio', { name: `Seleccionar ${item.title}`, exact: true })).toBeChecked();
    await expect(referenceForm.getByLabel('Proponer al directorio', { exact: true })).not.toBeChecked();
    await expectFocusInsideEditor(page, referenceForm);
    assert.equal(capture.writes().length, writesBeforeCompare,
      'the exact, currently eligible pair and directory choice remain local until the user presses Add');

    await referenceForm.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    const referencePath = '/api/creador/referencias';
    await expect.poll(() => writesTo(capture, 'POST', referencePath)[0]?.status).toBe(201);
    const referenceWrites = writesTo(capture, 'POST', referencePath);
    await referenceWrites[0].settled;
    assert.equal(referenceWrites.length, 1, 'the same exact pair is submitted once after explicit continuation');
    assert.equal(referenceWrites[0].body.resourceId, item.id);
    assert.equal(referenceWrites[0].body.url, item.url);
    assert.equal(referenceWrites[0].body.selectedForDirectory, false);
    const afterReference = await ownerDto(fixture, cookie);
    const saved = afterReference.links.find(({ resourceId }) => resourceId === item.id);
    assert.ok(saved);
    assert.equal(saved.placementId, referenceWrites[0].responseBody.link.placementId);
    assert.equal(saved.selectedForDirectory, false);
    assert.deepEqual(await fixture.rawResource(item.id), resourceBefore);

    await page.locator(`[data-link-row="${saved.placementId}"]`)
      .getByRole('button', { name: 'Editar opciones', exact: true }).click();
    const nextOptions = linkEditor(page);
    await expect(nextOptions).toBeVisible();
    await nextOptions.getByRole('checkbox', { name: 'Destacar en tu página', exact: true }).check();
    const optionsPath = `/api/creador/enlaces/${saved.placementId}/editar`;
    const previousOptionWriteCount = writesTo(capture, 'PATCH', optionsPath).length;
    assert.equal(previousOptionWriteCount, 1, 'the only earlier PATCH is the failed save against the removed placement');
    await nextOptions.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'PATCH', optionsPath)[previousOptionWriteCount]?.status).toBe(200);
    const optionWrites = writesTo(capture, 'PATCH', optionsPath);
    const manualOptionsWrite = optionWrites[previousOptionWriteCount];
    await manualOptionsWrite.settled;
    assert.equal(optionWrites.length, previousOptionWriteCount + 1,
      'one separate options write succeeds from the newly saved placement');
    assert.equal(manualOptionsWrite.body.profileVersion, afterReference.profile.version);
    assert.equal(manualOptionsWrite.body.placementVersion, saved.placementVersion);
    assert.equal(manualOptionsWrite.body.resourceVersion, saved.resourceVersion);
    assert.equal(manualOptionsWrite.body.featured, true);
    assert.equal(manualOptionsWrite.body.selectedForDirectory, false);
    const final = await ownerDto(fixture, cookie);
    const finalLink = final.links.find(({ placementId: id }) => id === saved.placementId);
    assert.equal(finalLink.featured, true);
    assert.equal(finalLink.selectedForDirectory, false);
    assert.equal(final.profile.version, afterReference.profile.version + 1);
    assert.equal(writesTo(capture, 'PATCH', stalePath).length, 2,
      'there is exactly one failed old-placement PATCH and one explicitly requested options PATCH after re-adding the same resource');
    assert.deepEqual(capture.writes().map(({ method, path, status }) => [method, path, status]), [
      ['PATCH', stalePath, 404],
      ['POST', referencePath, 201],
      ['PATCH', optionsPath, 200],
    ], 'comparison and recovery add no extra writes');
    assert.deepEqual(await fixture.rawResource(item.id), resourceBefore,
      'both explicit actions change only the owner placement, not shared metadata');
  } finally {
    await page.unroute('**/catalog-selection.json', indexRoute).catch(() => {});
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('opciones de referencia retirada conservan candidato rechazado y exigen reemplazo manual', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const sourceCookie = await loginAdditionalOwner(fixture, 'phase1-f1-reference-source');
  const sourceProfile = await api(fixture, sourceCookie, OWNER_PATH, {
    method: 'PUT', body: { displayName: 'Fuente compartida F1', slug: 'fuente-compartida-f1', socials: {} },
  });
  assert.equal(sourceProfile.response.status, 200, JSON.stringify(sourceProfile.body));
  const original = await addLink(fixture, sourceCookie, {
    title: 'Referencia A antes del traslado', url: 'https://f1-shared.example/original',
  });
  const replacement = {
    id: 'phase1-f1-reference-b', title: 'Referencia B para reemplazar A',
    url: 'https://f1-shared.example/replacement',
  };
  await seedResource(fixture.creatorStore, {
    id: replacement.id, title: replacement.title, url: replacement.url,
    kind: 'community', category: 'Comunidad', format: 'community',
    topics: ['AWS'], published: true, hidden: false, approvalRevoked: false,
    directoryControl: 'editorial',
  });

  const initialOwner = await ownerDto(fixture, cookie);
  const createdReference = await api(fixture, cookie, '/api/creador/referencias', {
    method: 'POST', body: {
      resourceId: original.resourceId, url: original.url,
      profileVersion: initialOwner.profile.version, selectedForDirectory: true,
    },
  });
  assert.equal(createdReference.response.status, 201, JSON.stringify(createdReference.body));
  const placementId = createdReference.body.link.placementId;
  const originalResource = await fixture.rawResource(original.resourceId);
  const sameUrlOtherId = catalogEntry('phase1-f1-same-url-other-id', 'Mismo URL con otra identidad', original.url);
  const originalEntry = catalogEntry(original.resourceId, original.title, original.url);
  const replacementEntry = catalogEntry(replacement.id, replacement.title, replacement.url);
  const movedEntry = catalogEntry(original.resourceId, 'Referencia A con URL vigente', 'https://f1-shared.example/current');
  let indexReads = 0;
  const indexRoute = async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    indexReads += 1;
    const entries = indexReads === 1
      ? [originalEntry, replacementEntry]
      : [movedEntry, sameUrlOtherId, replacementEntry];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(entries) });
  };
  await page.route('**/catalog-selection.json', indexRoute);

  await openLinksView(page, fixture);
  const capture = await captureCreatorApi(page);
  try {
    await page.locator(`[data-link-row="${placementId}"]`)
      .getByRole('button', { name: 'Editar opciones', exact: true }).click();
    const editor = linkEditor(page);
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('Título', { exact: true })).toHaveValue(original.title);
    await expect(editor.getByLabel('URL', { exact: true })).toHaveValue(original.url);
    await expect(editor.getByLabel('Descripción', { exact: false })).toHaveValue(original.description ?? '');
    await editor.getByRole('checkbox', { name: 'Destacar en tu página', exact: true }).check();
    await editor.getByRole('checkbox', { name: 'Proponer al directorio', exact: true }).uncheck();

    const beforeRemoval = await ownerDto(fixture, cookie);
    const removed = await api(fixture, cookie, `/api/creador/enlaces/${placementId}`, {
      method: 'DELETE', body: { profileVersion: beforeRemoval.profile.version },
    });
    assert.equal(removed.response.status, 204, 'the real owner API removes the shared reference');
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    const staleOptionsPath = `/api/creador/enlaces/${placementId}/editar`;
    await expect.poll(() => writesTo(capture, 'PATCH', staleOptionsPath)[0]?.status).not.toBeUndefined();
    const staleOptions = writesTo(capture, 'PATCH', staleOptionsPath);
    await staleOptions[0].settled;
    assert.ok([404, 409].includes(staleOptions[0].status), `the removed options save should fail, received ${staleOptions[0].status}`);
    assert.equal(staleOptions.length, 1);
    await expect(editor.getByLabel('Título', { exact: true })).toHaveValue(original.title);
    await expect(editor.getByLabel('URL', { exact: true })).toHaveValue(original.url);
    await expect(editor.getByLabel('Descripción', { exact: false })).toHaveValue(original.description ?? '');
    await expect(editor.getByRole('checkbox', { name: 'Destacar en tu página', exact: true })).toBeChecked();
    await expect(editor.getByRole('checkbox', { name: 'Proponer al directorio', exact: true })).not.toBeChecked();

    const writesBeforeCompare = capture.writes().length;
    await editor.locator('[data-owner-compare]').click();
    await expect(editor.locator('[data-owner-comparison]')).toBeVisible();
    const continueReference = editor.getByRole('button', { name: 'Volver a elegir una referencia', exact: true });
    await expect(continueReference).toBeVisible();
    await expectDepartedOptionsNotice(page.locator('[data-owner-dialog]'));
    assert.equal((await ownerDto(fixture, cookie)).links.some(({ placementId: id }) => id === placementId), false,
      'the real comparison observes the removed reference');
    assert.deepEqual(await fixture.rawResource(original.resourceId), originalResource,
      'the failed options save and comparison do not change shared metadata');
    assert.equal(capture.writes().length, writesBeforeCompare,
      'the actual owner comparison is a read and performs no extra write');

    await continueReference.click();
    const referenceForm = page.locator('[data-owner-dialog] form[data-owner-form="referencia"]');
    await expect(referenceForm).toBeVisible();
    await expect(referenceForm.getByLabel('Proponer al directorio', { exact: true })).not.toBeChecked();
    await expect.poll(() => indexReads).toBe(1);
    await expect(referenceForm.locator('[data-catalog-index-status]')).toContainText('resultados');
    await expect(referenceForm.getByRole('radio', { name: `Seleccionar ${original.title}`, exact: true })).toBeChecked();
    await expectFocusInsideEditor(page, referenceForm);
    assert.equal(capture.writes().length, writesBeforeCompare,
      'choosing the continuation and loading its catalog do not replay or submit a write');
    const changedBySource = await api(fixture, sourceCookie, `/api/creador/recursos/${original.resourceId}`, {
      method: 'PATCH', body: {
        version: originalResource.version,
        title: movedEntry.title,
        url: movedEntry.url,
      },
    });
    assert.equal(changedBySource.response.status, 200, JSON.stringify(changedBySource.body));
    assert.equal(changedBySource.body.resource.url, movedEntry.url,
      'the metadata owner changes the catalog target through the real resource API');

    await referenceForm.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/referencias')[0]?.status).toBe(409);
    const referenceWrites = writesTo(capture, 'POST', '/api/creador/referencias');
    await referenceWrites[0].settled;
    assert.equal(referenceWrites[0].responseBody.error, 'RESOURCE_CONFLICT',
      'the actual reference service rejects the stale ID/URL pair');
    assert.equal(referenceWrites[0].body.resourceId, original.resourceId);
    assert.equal(referenceWrites[0].body.url, original.url);
    assert.equal(referenceWrites[0].body.selectedForDirectory, false,
      'the original directory decision remains local until this explicit request');
    const recoveredCandidate = referenceForm.locator('[data-recovered-candidate]');
    await expect(recoveredCandidate).toBeVisible();
    await expect(recoveredCandidate).toContainText(original.title);
    await expect(recoveredCandidate).toContainText(original.url);
    await expect(recoveredCandidate.locator('[data-recovered-candidate-status]')).toContainText('rechazada');
    await expect(referenceForm.getByRole('button', { name: 'Agregar a mi página', exact: true })).toBeDisabled();
    await expect(referenceForm.getByRole('button', { name: 'Actualizar catálogo', exact: true })).toBeVisible();
    const writesAfterRejectedPair = capture.writes().length;

    await referenceForm.getByRole('button', { name: 'Actualizar catálogo', exact: true }).click();
    await expect.poll(() => indexReads).toBe(2);
    await expect(referenceForm.locator('[data-catalog-index-status]')).toContainText('resultados');
    await expect(recoveredCandidate).toContainText(original.title);
    await expect(recoveredCandidate).toContainText(original.url);
    await expect(recoveredCandidate.locator('[data-recovered-candidate-status]')).toContainText(/desactualizada|no disponible|rechazada/i);
    await expect(referenceForm.getByRole('button', { name: 'Agregar a mi página', exact: true })).toBeDisabled();
    const alternate = referenceForm.getByRole('radio', { name: `Seleccionar ${sameUrlOtherId.title}`, exact: true });
    await expect(alternate).not.toBeChecked();
    assert.equal(writesTo(capture, 'POST', '/api/creador/referencias').length, 1,
      'refresh does not replay the rejected pair or substitute its same-URL neighbor');
    assert.equal(capture.writes().length, writesAfterRejectedPair,
      'refresh performs no new writes while the rejected candidate remains unresolved');

    const replace = referenceForm.getByRole('button', { name: /^(?:Quitar|Reemplazar|Cambiar).*(?:referencia|selecci[oó]n)/iu });
    await expect(replace).toBeVisible();
    await replace.click();
    await expect(referenceForm.getByText(original.title, { exact: true })).toHaveCount(0,
      'the exact unavailable candidate leaves only after the explicit remove/replace action');
    await referenceForm.getByRole('radio', { name: `Seleccionar ${replacement.title}`, exact: true }).check();
    await expect(referenceForm.getByLabel('Proponer al directorio', { exact: true })).not.toBeChecked();
    await referenceForm.getByRole('button', { name: 'Agregar a mi página', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/referencias')[1]?.status).toBe(201);
    const finalReferenceWrites = writesTo(capture, 'POST', '/api/creador/referencias');
    await finalReferenceWrites[1].settled;
    assert.equal(finalReferenceWrites.length, 2, 'the next POST is a separate explicit reference choice');
    assert.equal(finalReferenceWrites[1].body.resourceId, replacement.id);
    assert.equal(finalReferenceWrites[1].body.url, replacement.url);
    assert.equal(finalReferenceWrites[1].body.selectedForDirectory, false);
    assert.equal(finalReferenceWrites.some(({ body }) => body.resourceId === sameUrlOtherId.id), false,
      'no same-URL different ID is ever substituted for the removed target');

    const afterReference = await ownerDto(fixture, cookie);
    const saved = afterReference.links.find(({ resourceId }) => resourceId === replacement.id);
    assert.ok(saved);
    assert.equal(saved.selectedForDirectory, false);
    assert.equal(afterReference.links.some(({ resourceId }) => resourceId === original.resourceId), false);
    assert.deepEqual(await fixture.rawResource(replacement.id), {
      id: replacement.id, title: replacement.title, url: replacement.url,
      kind: 'community', category: 'Comunidad', format: 'community',
      topics: ['AWS'], published: true, hidden: false, approvalRevoked: false,
      directoryControl: 'editorial', version: 0,
    }, 'adding the replacement reference does not mutate its shared resource');

    const replacementRow = page.locator(`[data-link-row="${saved.placementId}"]`);
    await replacementRow.getByRole('button', { name: 'Editar opciones', exact: true }).click();
    const options = linkEditor(page);
    await expect(options).toBeVisible();
    await options.getByRole('checkbox', { name: 'Destacar en tu página', exact: true }).check();
    await options.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    const nextOptionsPath = `/api/creador/enlaces/${saved.placementId}/editar`;
    await expect.poll(() => writesTo(capture, 'PATCH', nextOptionsPath)[0]?.status).toBe(200);
    const nextOptionsWrite = writesTo(capture, 'PATCH', nextOptionsPath);
    await nextOptionsWrite[0].settled;
    const finalOwner = await ownerDto(fixture, cookie);
    const finalLink = finalOwner.links.find(({ placementId: id }) => id === saved.placementId);
    assert.equal(finalLink.featured, true, 'a later manual options save succeeds from the adopted profile and new placement bases');
    assert.equal(finalLink.selectedForDirectory, false);
    assert.equal(finalLink.placementVersion, saved.placementVersion + 1);
    assert.equal(finalOwner.profile.version, afterReference.profile.version + 1);
    assert.equal(writesTo(capture, 'PATCH', staleOptionsPath).length, 1,
      'comparison, adoption and later options save never replay the removed placement patch');
  } finally {
    await page.unroute('**/catalog-selection.json', indexRoute).catch(() => {});
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('Series eliminada vuelve a la búsqueda válida, cancela la salida antigua y permite editar otra serie', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const search = 'Phase 1 recovery';
  const removedSeries = await createSeries(fixture, cookie, {
    name: `${search} retirada`, slug: 'phase-1-recovery-retirada', description: 'Descripción original.',
  });
  const survivor = await createSeries(fixture, cookie, {
    name: `${search} vigente`, slug: 'phase-1-recovery-vigente', description: 'Descripción que se mantiene.',
  });
  const chapter = await addLink(fixture, cookie, {
    title: 'Capítulo de la serie retirada', url: 'https://f1-series.example/chapter',
  });
  await addChapter(fixture, cookie, removedSeries.id, chapter.placementId);
  await openSeriesView(page, fixture, `&buscarSeries=${encodeURIComponent(search)}`);
  await expect(page.locator('astro-island')).not.toHaveAttribute('ssr', '');
  await expect(page.locator('#owner-series-search')).toHaveValue(search);
  const listIndex = await page.evaluate(() => history.state?.creatorOwnerIndex);
  const targetRow = page.locator(`[data-owner-series-row="${removedSeries.id}"]`);
  await targetRow.getByRole('link', { name: 'Gestionar capítulos', exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get('serie') === removedSeries.id
    && url.searchParams.get('buscarSeries') === search);
  const chapterUrl = page.url();
  const chapterIndex = await page.evaluate(() => history.state?.creatorOwnerIndex);
  await page.locator('[data-owner-series-chapters]')
    .getByRole('button', { name: 'Editar serie', exact: true }).click();
  const editor = seriesEditor(page);
  await expect(editor).toBeVisible();
  const local = {
    name: `${search} corrección local`, slug: 'phase-1-recovery-correccion',
    description: 'Descripción local conservada hasta decidir.',
  };
  await editor.getByLabel('Nombre de la serie', { exact: true }).fill(local.name);
  await editor.getByLabel('Dirección de la serie', { exact: true }).fill(local.slug);
  await editor.getByLabel('Descripción', { exact: false }).fill(local.description);

  const beforeDelete = await ownerDto(fixture, cookie);
  const removed = await api(fixture, cookie, `/api/creador/series/${removedSeries.id}`, {
    method: 'DELETE', body: {
      version: removedSeries.version,
      profileVersion: beforeDelete.profile.version,
    },
  });
  assert.equal(removed.response.status, 204, 'a second real API caller deletes the selected Series');
  assert.equal(await fixture.rawSeries(cookie, removedSeries.id), null);

  const capture = await captureCreatorApi(page);
  try {
    await editor.getByRole('button', { name: 'Guardar serie', exact: true }).click();
    const stalePath = `/api/creador/series/${removedSeries.id}`;
    await expect.poll(() => writesTo(capture, 'PATCH', stalePath)[0]?.status).toBe(409);
    const stale = writesTo(capture, 'PATCH', stalePath);
    await stale[0].settled;
    assert.equal(stale.length, 1, 'the deleted Series edit is attempted once');
    for (const [field, value] of Object.entries(local)) {
      await expect(editor.getByLabel(field === 'name' ? 'Nombre de la serie' : field === 'slug' ? 'Dirección de la serie' : 'Descripción', {
        exact: field !== 'description',
      })).toHaveValue(value);
    }

    const writesBeforeCompare = capture.writes().length;
    const pendingBack = page.goBack();
    pendingBack.catch(() => {});
    const exitPrompt = page.locator('[data-owner-exit-prompt]');
    await expect(exitPrompt).toBeVisible();
    await expect(page).toHaveURL(chapterUrl,
      'the requested navigation stays pending while the recovery decision is open');

    await exitPrompt.locator('[data-owner-compare]').click();
    await expect(exitPrompt.locator('[data-owner-comparison]')).toBeVisible();
    assert.equal(capture.writes().length, writesBeforeCompare,
      'the comparison read performs no write while the exit request is pending');
    for (const [field, value] of Object.entries(local)) {
      await expect(editor.getByLabel(field === 'name' ? 'Nombre de la serie' : field === 'slug' ? 'Dirección de la serie' : 'Descripción', {
        exact: field !== 'description',
      })).toHaveValue(value);
    }
    await expect(exitPrompt.getByRole('button', { name: 'Volver a Series', exact: true })).toBeVisible();
    const writesBeforeAdopt = capture.writes().length;
    await exitPrompt.getByRole('button', { name: 'Volver a Series', exact: true }).click();

    await expect(exitPrompt).toHaveCount(0,
      'closing the deleted Series editor cancels its older pending exit request');
    await pendingBack;
    assert.equal(capture.writes().length, writesBeforeAdopt,
      'returning to the Series list does not replay the deleted Series patch');
    await expect(page).toHaveURL((url) => url.pathname === '/cuenta/'
      && url.searchParams.get('vista') === 'series'
      && url.searchParams.get('buscarSeries') === search
      && !url.searchParams.has('serie') && !url.searchParams.has('buscarCapitulos')
      && !url.searchParams.has('pertenencia') && !url.searchParams.has('paginaCapitulos'));
    await expect(page.locator('[data-owner-series-chapters]')).toBeHidden();
    await expect(page.locator('[data-owner-series-list-view]')).toBeVisible();
    await expect(page.locator('#owner-series-search')).toHaveValue(search);
    await expect(page.locator(`[data-owner-series-row="${removedSeries.id}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-owner-series-row="${survivor.id}"]`)).toBeVisible();
    assert.equal(await page.evaluate(() => history.state?.creatorOwnerIndex), chapterIndex,
      'the old Back request did not consume the current Series history entry');
    assert.notEqual(chapterIndex, listIndex);
    await expect(page.locator(':focus')).toBeVisible();
    const focusStayedInSeries = await page.locator(':focus').evaluate((element) => Boolean(element.closest('[data-owner-series]')));
    assert.equal(focusStayedInSeries, true, 'the actual visible focus returns to the Series list context');

    await page.locator(`[data-owner-series-row="${survivor.id}"]`)
      .getByRole('button', { name: 'Editar', exact: true }).click();
    const survivingEditor = seriesEditor(page);
    await expect(survivingEditor).toBeVisible();
    const nextDescription = 'Edición manual después de volver a Series.';
    await survivingEditor.getByLabel('Descripción', { exact: false }).fill(nextDescription);
    await survivingEditor.getByRole('button', { name: 'Guardar serie', exact: true }).click();
    const nextPath = `/api/creador/series/${survivor.id}`;
    await expect.poll(() => writesTo(capture, 'PATCH', nextPath)[0]?.status).toBe(200);
    const nextWrite = writesTo(capture, 'PATCH', nextPath);
    await nextWrite[0].settled;
    assert.equal(nextWrite.length, 1, 'the next Series operation is a distinct manual save');
    assert.equal(nextWrite[0].body.version, survivor.version);
    assert.equal(nextWrite[0].body.profileVersion, (await ownerDto(fixture, cookie)).profile.version - 1);
    assert.equal((await fixture.rawSeries(cookie, survivor.id)).description, nextDescription,
      'the survivor edit persisted through the real API after recovery');
    assert.equal(writesTo(capture, 'PATCH', `/api/creador/series/${removedSeries.id}`).length, 1,
      'recovery never replays the deleted Series write');
  } finally {
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('edición propia conserva la explicación de varios reemplazos del mismo recurso', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const original = await addLink(fixture, cookie, {
    title: 'Ficha original con reemplazos ambiguos',
    url: 'https://f1-ambiguous.example/resource',
  });
  const historicalPlacement = await fixture.rawPlacement(cookie, original.placementId);
  assert.ok(historicalPlacement, 'the editor starts from a real owner placement');

  await openLinksView(page, fixture);
  await page.locator(`[data-link-row="${original.placementId}"]`)
    .getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const editor = linkEditor(page);
  await expect(editor).toBeVisible();
  const correction = 'Conservar esta corrección local';
  await editor.getByLabel('Título', { exact: true }).fill(correction);

  const beforeRemoval = await ownerDto(fixture, cookie);
  const removed = await api(fixture, cookie, `/api/creador/enlaces/${original.placementId}`, {
    method: 'DELETE', body: { profileVersion: beforeRemoval.profile.version },
  });
  assert.equal(removed.response.status, 204, 'the real owner API removes the edited placement');
  assert.equal(await fixture.rawPlacement(cookie, original.placementId), null);

  const ownerAfterRemoval = await fixture.rawOwner(cookie);
  assert.ok(ownerAfterRemoval?.owner && ownerAfterRemoval.profile);
  const replacementIds = ['f1-ambiguous-historical-a', 'f1-ambiguous-historical-b'];
  assert.equal(await fixture.creatorStore.transact({
    checks: [{ key: `profile:${ownerAfterRemoval.profile.id}`, version: ownerAfterRemoval.profile.version }],
    puts: [
      {
        key: `profile:${ownerAfterRemoval.profile.id}`,
        value: { ...ownerAfterRemoval.profile, version: ownerAfterRemoval.profile.version + 1 },
      },
      ...replacementIds.map((id, position) => ({
        key: `placement:${ownerAfterRemoval.profile.id}:${id}`,
        value: { ...historicalPlacement, id, position, version: ownerAfterRemoval.profile.version + 1 },
      })),
    ],
  }), true, 'seed the supported historical duplicate placements at the persistence boundary');

  const ownerBeforeRecovery = await fixture.rawOwner(cookie);
  const resourceBeforeRecovery = await fixture.rawResource(original.resourceId);
  const placementsBeforeRecovery = await Promise.all(replacementIds.map((id) => fixture.rawPlacement(cookie, id)));
  assert.ok(placementsBeforeRecovery.every(Boolean));

  // The unit case proves the comparison policy; this exercises the real API read through the app controller and dialog,
  // where replacing every non-adoptable message used to hide the policy explanation.
  const capture = await captureCreatorApi(page);
  try {
    const stalePath = `/api/creador/enlaces/${original.placementId}/editar`;
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'PATCH', stalePath)[0]?.status).toBe(404);
    const failedWrites = writesTo(capture, 'PATCH', stalePath);
    await failedWrites[0].settled;
    assert.equal(failedWrites.length, 1, 'the failed correction is attempted once');
    assert.equal(capture.writes().length, 1, 'only the failed placement correction has been written');
    assert.deepEqual(capture.writes().map(({ method, path, status }) => [method, path, status]), [
      ['PATCH', stalePath, 404],
    ]);
    await expect(editor.getByLabel('Título', { exact: true }),
      'the local correction survives the failed save').toHaveValue(correction);

    await editor.locator('[data-owner-compare]').click();
    const comparison = editor.locator('[data-owner-comparison]');
    await expect(comparison).toBeVisible();
    const comparisonReads = capture.records.filter(({ method, path }) => method === 'GET' && path === OWNER_PATH);
    assert.equal(comparisonReads.length, 1, 'comparison uses one real owner snapshot read');
    await comparisonReads[0].settled;
    const comparedOwner = comparisonReads[0].responseBody;
    assert.equal(comparisonReads[0].status, 200, 'the app receives a successful owner read');
    assert.equal(comparedOwner.profile.id, ownerBeforeRecovery.profile.id,
      'the app receives a valid snapshot for the profile that opened this edit');
    assert.equal(comparedOwner.links.some(({ placementId }) => placementId === original.placementId), false,
      'the compared snapshot keeps the original edited placement missing');
    assert.deepEqual(comparedOwner.links
      .filter(({ resourceId }) => resourceId === original.resourceId)
      .map(({ placementId }) => placementId).sort(), replacementIds.slice().sort(),
    'the compared snapshot contains the two matching historical placements');
    await expect(comparison).toContainText(
      'Hay varios enlaces actuales para el mismo recurso. No elegimos uno automáticamente y conservamos tu corrección.',
    );
    await expect(comparison).not.toContainText('La lectura no coincide con la página que abrió esta edición.');
    await expect(editor.locator('[data-owner-adopt]'),
      'ambiguous placements do not expose automatic adoption').toHaveCount(0);
    await expect(editor.getByLabel('Título', { exact: true })).toHaveValue(correction);

    const ownerAfterRecovery = await fixture.rawOwner(cookie);
    assert.deepEqual(ownerAfterRecovery.owner, ownerBeforeRecovery.owner,
      'the recovery read and comparison do not change raw owner state');
    assert.deepEqual(ownerAfterRecovery.profile, ownerBeforeRecovery.profile,
      'the recovery read and comparison do not change the profile');
    assert.deepEqual(await Promise.all(replacementIds.map((id) => fixture.rawPlacement(cookie, id))),
      placementsBeforeRecovery, 'the current placements remain unchanged');
    assert.deepEqual(await fixture.rawResource(original.resourceId), resourceBeforeRecovery,
      'the failed correction and comparison do not change shared resource metadata');
    assert.equal(await fixture.rawPlacement(cookie, original.placementId), null,
      'recovery does not recreate the original placement');
    assert.equal(capture.writes().length, 1,
      'the comparison read does not add a write or replay the failed correction');
  } finally {
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

import assert from 'node:assert/strict';

import { seedResource } from '../fixtures/creator-pages.mjs';
import {
  api,
  captureCreatorApi,
  expect,
  loggedInOwner,
  test,
} from '../fixtures/creator-browser-test.mjs';
import {
  adminPath,
  prepareAdmin,
  resource as adminResource,
  root as adminRoot,
  row as adminRow,
} from '../fixtures/creator-admin.mjs';

const QUICK = 2_500;

function sortedTopics(values) {
  return [...values].sort((left, right) => left.localeCompare(right, 'es'));
}

function form(page, name = 'enlace') {
  return page.locator(`form[data-owner-form="${name}"]`);
}

function taxonomy(formLocator) {
  const topicsGroup = formLocator.getByRole('group', { name: /temas/iu }).first();
  return {
    kind: formLocator.getByLabel('Tipo de recurso', { exact: true }),
    format: formLocator.getByLabel('Formato', { exact: true }),
    topicsGroup,
    topics: topicsGroup.locator('input[name="topics"]'),
  };
}

async function expectTaxonomy(formLocator) {
  const controls = taxonomy(formLocator);
  await expect(controls.kind).toBeVisible({ timeout: QUICK });
  await expect(controls.format).toBeVisible({ timeout: QUICK });
  await expect(controls.topicsGroup).toBeVisible({ timeout: QUICK });
  await expect(controls.topics).toHaveCount(17);
  return controls;
}

async function ownerSnapshot(fixture, cookie) {
  const result = await api(fixture, cookie, '/api/creador/perfil/', {
    headers: { 'x-creator-contract': '3' },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.schemaVersion, 3, 'the classification owner read uses snapshot schema 3');
  return result.body;
}

async function ownerApi(fixture, cookie, path, options = {}) {
  return api(fixture, cookie, path, { creatorContract: '3', ...options });
}

async function addClassified(fixture, cookie, values = {}) {
  const before = await ownerSnapshot(fixture, cookie);
  const body = {
    creatorVersion: before.creatorVersion,
    title: 'Enlace clasificado',
    url: 'https://links.example.invalid/classified',
    description: 'Descripción que se conserva con la taxonomía.',
    kind: 'content',
    format: 'Video',
    topics: ['Seguridad'],
    selectedForDirectory: true,
    ...values,
  };
  const result = await ownerApi(fixture, cookie, '/api/creador/enlaces/', { method: 'POST', body });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body;
}

async function openLinks(page, fixture) {
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
}

function writesTo(capture, method, path) {
  return capture.writes().filter((write) => write.method === method && write.path === path);
}

test('owner create sends classification through the real form and persists the explicit tuple', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  await openLinks(page, fixture);
  await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const editor = form(page, 'alta-enlace');
  const fields = await expectTaxonomy(editor);
  await editor.getByLabel('Título', { exact: true }).fill('Video de IAM clasificado');
  await editor.getByLabel('URL', { exact: true }).fill('https://links.example.invalid/owner-classification-create');
  await editor.getByLabel(/Descripción/iu).fill('Descripción de la ficha clasificada.');
  await fields.kind.selectOption('content');
  await fields.format.selectOption('Video');
  await editor.locator('input[name="topics"][value="Seguridad"]').check();

  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  try {
    await editor.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(201);
    const write = writesTo(capture, 'POST', '/api/creador/enlaces')[0];
    assert.deepEqual({ kind: write.body.kind, format: write.body.format, topics: write.body.topics }, {
      kind: 'content', format: 'Video', topics: ['Seguridad'],
    });
    const snapshot = await ownerSnapshot(fixture, cookie);
    const saved = snapshot.resources.find(({ id }) => id === write.responseBody.resourceId);
    assert.deepEqual(saved.classification, {
      state: 'explicit', kind: 'content', format: 'Video', topics: ['Seguridad'],
    });
    const stored = await fixture.rawResource(write.responseBody.resourceId);
    assert.deepEqual({ title: stored.title, url: stored.url, description: stored.description,
      kind: stored.kind, format: stored.format, topics: stored.topics }, {
      title: 'Video de IAM clasificado',
      url: 'https://links.example.invalid/owner-classification-create',
      description: 'Descripción de la ficha clasificada.',
      kind: 'content', format: 'Video', topics: ['Seguridad'],
    });
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('owner add omits an optional classification after its topic is checked and unchecked', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  await openLinks(page, fixture);
  await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const editor = form(page, 'alta-enlace');
  const fields = await expectTaxonomy(editor);
  await editor.getByLabel('Título', { exact: true }).fill('Ficha sin clasificación después de corregir');
  await editor.getByLabel('URL', { exact: true }).fill('https://links.example.invalid/owner-classification-empty');
  const topic = editor.locator('input[name="topics"][value="Seguridad"]');
  await topic.check();
  await topic.uncheck();
  await expect(fields.kind).toHaveValue('');
  await expect(fields.format).toHaveValue('');
  await expect(editor.locator('input[name="topics"]:checked')).toHaveCount(0);

  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  try {
    await editor.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(201);
    const write = writesTo(capture, 'POST', '/api/creador/enlaces')[0];
    assert.equal(Object.hasOwn(write.body, 'kind'), false);
    assert.equal(Object.hasOwn(write.body, 'format'), false);
    assert.equal(Object.hasOwn(write.body, 'topics'), false);
    const saved = (await ownerSnapshot(fixture, cookie)).resources.find(({ id }) => id === write.responseBody.resourceId);
    assert.deepEqual(saved.classification, { state: 'absent' });
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('owner native description feedback scrolls the shared field and keeps the imported draft', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const created = await addClassified(fixture, cookie, {
    title: 'Ficha con descripción importada', url: 'https://links.example.invalid/imported-long-description', description: 'Descripción inicial',
  });
  const current = await fixture.rawResource(created.resourceId);
  const longDescription = 'D'.repeat(4_000);
  assert.equal(await fixture.creatorStore.transact({
    checks: [{ key: `resource:${created.resourceId}`, version: current.version }],
    puts: [{ key: `resource:${created.resourceId}`, value: { ...current, description: longDescription, version: current.version + 1 } }],
  }), true);

  await page.setViewportSize({ width: 390, height: 420 });
  await openLinks(page, fixture);
  await page.getByRole('row').filter({ hasText: 'Ficha con descripción importada' })
    .getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const editor = form(page);
  const description = editor.getByLabel(/Descripción/iu);
  await expect(description).toHaveValue(longDescription);
  await description.focus();
  await description.press('End');
  await description.press('Backspace');
  const attemptedDescription = await description.inputValue();
  assert.ok(attemptedDescription.length > 2_000);
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  try {
    await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect(description).toBeFocused();
    const error = editor.locator('[data-owner-error="description"]');
    await expect(error).toBeVisible();
    await expect(description).toHaveValue(attemptedDescription);
    const field = editor.locator('[data-resource-metadata-field="description"]');
    const bounds = await field.boundingBox();
    assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 420, JSON.stringify(bounds));
    assert.equal(capture.writes().length, 0, 'native validation rejects the overlong imported draft before any network write');
    assert.equal((await fixture.rawResource(created.resourceId)).description, longDescription);
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('owner classification resets incompatible format and keeps the draft while correcting a fourth topic on mobile', async ({ fixture, page }) => {
  await loggedInOwner(fixture, page);
  await page.setViewportSize({ width: 390, height: 844 });
  await openLinks(page, fixture);
  await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const editor = form(page, 'alta-enlace');
  const fields = await expectTaxonomy(editor);
  const title = editor.getByLabel('Título', { exact: true });
  const url = editor.getByLabel('URL', { exact: true });
  const description = editor.getByLabel(/Descripción/iu);
  await title.fill('Borrador con clasificación corregible');
  await url.fill('https://links.example.invalid/owner-classification-errors');
  await description.fill('Este borrador sobrevive a los diagnósticos.');
  await fields.kind.selectOption('content');
  await fields.format.selectOption('Curso');
  for (const topic of ['Seguridad', 'Serverless', 'Redes']) await editor.locator(`input[name="topics"][value="${topic}"]`).check();

  await fields.kind.selectOption('source');
  await expect(fields.format).toHaveValue('');
  for (const topic of ['Seguridad', 'Serverless', 'Redes']) await expect(editor.locator(`input[name="topics"][value="${topic}"]`)).toBeChecked();
  const fourth = editor.locator('input[name="topics"][value="Cómputo"]');
  await fourth.scrollIntoViewIfNeeded();
  await fourth.click();
  await expect(fourth).not.toBeChecked();
  await expect(fourth).toBeFocused();
  const topicError = fields.topicsGroup.locator('[data-owner-field-error], [data-field-error], [role="alert"]')
    .filter({ hasText: /tema|tres|3/iu }).first();
  await expect(topicError).toBeVisible();
  await expect(fields.topicsGroup).toHaveAttribute('aria-invalid', 'true');
  await expect(title).toHaveValue('Borrador con clasificación corregible');
  await expect(url).toHaveValue('https://links.example.invalid/owner-classification-errors');
  await expect(description).toHaveValue('Este borrador sobrevive a los diagnósticos.');
  const bounds = await topicError.boundingBox();
  assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 844, JSON.stringify(bounds));

  await editor.locator('input[name="topics"][value="Seguridad"]').uncheck();
  await expect(topicError).toBeHidden();
  await fourth.check();
  await expect(fields.topicsGroup.locator('input[name="topics"]:checked')).toHaveCount(3);
  const capture = await captureCreatorApi(page);
  try {
    await editor.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    const formatError = fields.format.locator('xpath=..').locator('[data-owner-field-error], [data-field-error], [role="alert"]')
      .filter({ hasText: /formato|elige|oblig/iu }).first();
    await expect(formatError).toBeVisible();
    await expect(fields.format).toBeFocused();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces').length).toBe(0);
    await fields.format.selectOption('Blog');
    await expect(formatError).toBeHidden();
    const mutatePair = async (route) => {
      const request = route.request();
      if (request.method() !== 'POST' || new URL(request.url()).pathname.replace(/\/$/u, '') !== '/api/creador/enlaces') {
        await route.continue();
        return;
      }
      const body = request.postDataJSON();
      const response = await route.fetch({ postData: JSON.stringify({ ...body, format: 'Video' }) });
      await route.fulfill({ response });
    };
    await page.route('**/api/creador/**', mutatePair, { times: 1 });
    await editor.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(422);
    const rejected = writesTo(capture, 'POST', '/api/creador/enlaces')[0];
    assert.deepEqual(rejected.responseBody.fieldErrors, [{ field: 'kind-format', reason: 'invalid_combination' }]);
    await expect(fields.kind).toHaveAttribute('aria-invalid', 'true');
    await expect(fields.format).toHaveAttribute('aria-invalid', 'true');
    const pairError = editor.locator('[data-owner-field-error], [data-field-error], [role="alert"]')
      .filter({ hasText: /tipo|formato|combin/iu }).first();
    await expect(pairError).toBeVisible();
    await expect(fields.kind).toBeFocused();
    await page.unroute('**/api/creador/**', mutatePair).catch(() => {});
    await fields.kind.selectOption('content');
    await fields.format.selectOption('Curso');
    await expect(pairError).toBeHidden();
    await editor.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[1]?.status).toBe(201);
    const corrected = writesTo(capture, 'POST', '/api/creador/enlaces')[1].body;
    assert.deepEqual({ kind: corrected.kind, format: corrected.format, topics: sortedTopics(corrected.topics) }, {
      kind: 'content', format: 'Curso', topics: sortedTopics(['Serverless', 'Redes', 'Cómputo']),
    });
  } finally {
    await page.unroute('**/api/creador/**').catch(() => {});
    await capture.stop({ skipErrorBodies: true });
  }
});

test('active and retained edits persist classification without silently reincluding a removed placement', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const longDescription = 'D'.repeat(4_000);
  const created = await addClassified(fixture, cookie, {
    title: 'Ficha activa reclasificable', url: 'https://links.example.invalid/active-classification-edit', description: 'Descripción inicial',
  });
  const initialResource = await fixture.rawResource(created.resourceId);
  assert.equal(await fixture.creatorStore.transact({
    checks: [{ key: `resource:${created.resourceId}`, version: initialResource.version }],
    puts: [{ key: `resource:${created.resourceId}`, value: { ...initialResource, description: longDescription, version: initialResource.version + 1 } }],
  }), true);
  await openLinks(page, fixture);
  const row = page.locator(`[data-link-row="${created.placementId}"]`);
  await row.getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const editor = form(page);
  const fields = await expectTaxonomy(editor);
  await expect(editor.getByLabel(/Descripción/iu)).toHaveValue(longDescription);
  await fields.kind.selectOption('source');
  await fields.format.selectOption('Newsletter');
  await editor.locator('input[name="topics"][value="DevOps"]').check();
  await editor.getByLabel('Título', { exact: true }).fill('Ficha activa reclasificada');
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  await editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect.poll(() => writesTo(capture, 'PATCH', `/api/creador/enlaces/${created.placementId}/editar`)[0]?.status).toBe(200);
  const editBody = writesTo(capture, 'PATCH', `/api/creador/enlaces/${created.placementId}/editar`)[0].body;
  assert.equal(Object.hasOwn(editBody, 'description'), false, 'classification-only metadata edits omit the retained long description');
  await capture.stop({ skipErrorBodies: true });
  await expect(page.locator('[data-owner-dialog][open]')).toHaveCount(0);
  let snapshot = await ownerSnapshot(fixture, cookie);
  let saved = snapshot.resources.find(({ id }) => id === created.resourceId);
  assert.equal(saved.title, 'Ficha activa reclasificada');
  assert.equal(saved.description, longDescription);
  assert.deepEqual({ ...saved.classification, topics: sortedTopics(saved.classification.topics) }, {
    state: 'explicit', kind: 'source', format: 'Newsletter', topics: sortedTopics(['Seguridad', 'DevOps']),
  });

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator(`[data-link-row="${created.placementId}"]`).getByRole('button', { name: 'Quitar de tu página' }).click();
  await expect(page.locator(`[data-link-row="${created.placementId}"]`)).toHaveCount(0);
  snapshot = await ownerSnapshot(fixture, cookie);
  assert.equal(Object.values(snapshot.placements).some(({ resourceId }) => resourceId === created.resourceId), false);
  await page.locator(`[data-retained-resource="${created.resourceId}"]`).getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const retainedEditor = form(page);
  const retainedFields = await expectTaxonomy(retainedEditor);
  await expect(retainedFields.kind).toHaveValue('source');
  await expect(retainedFields.format).toHaveValue('Newsletter');
  await expect(retainedEditor.locator('input[name="topics"][value="DevOps"]')).toBeChecked();
  await retainedEditor.getByLabel('Título', { exact: true }).fill('Ficha retirada editada');
  await retainedEditor.getByRole('button', { name: 'Guardar ficha', exact: true }).click();
  await expect(page.locator('[data-owner-dialog][open]')).toHaveCount(0);
  snapshot = await ownerSnapshot(fixture, cookie);
  saved = snapshot.resources.find(({ id }) => id === created.resourceId);
  assert.equal(saved.title, 'Ficha retirada editada');
  assert.equal(saved.description, longDescription);
  assert.deepEqual({ ...saved.classification, topics: sortedTopics(saved.classification.topics) }, {
    state: 'explicit', kind: 'source', format: 'Newsletter', topics: sortedTopics(['Seguridad', 'DevOps']),
  });
  assert.equal(Object.values(snapshot.placements).some(({ resourceId }) => resourceId === created.resourceId), false);
  await expect(page.locator(`[data-retained-resource="${created.resourceId}"]`).getByRole('button', { name: 'Volver a agregar', exact: true })).toBeVisible();
});

test('reusing an existing URL preserves its authority and keeps the attempted classification in a recoverable add draft', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const shared = {
    id: 'phase1-reused-classification', title: 'Ficha editorial existente', url: 'https://links.example.invalid/reused-classification',
    description: 'Descripción editorial vigente.', category: 'Canal de YouTube', kind: 'source', format: 'Canal de YouTube',
    topics: ['Seguridad'], published: true, hidden: false, approvalRevoked: false, directoryControl: 'editorial', version: 4,
  };
  await seedResource(fixture.creatorStore, shared);
  await openLinks(page, fixture);
  await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const editor = form(page, 'alta-enlace');
  const fields = await expectTaxonomy(editor);
  await editor.getByLabel('Título', { exact: true }).fill('Título local no aplicado');
  await editor.getByLabel('URL', { exact: true }).fill(shared.url);
  await editor.getByLabel(/Descripción/iu).fill('Descripción local recuperable.');
  await fields.kind.selectOption('content');
  await fields.format.selectOption('Curso');
  await editor.locator('input[name="topics"][value="Fundamentos"]').check();
  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  try {
    await editor.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'POST', '/api/creador/enlaces')[0]?.status).toBe(201);
    const reused = writesTo(capture, 'POST', '/api/creador/enlaces')[0];
    assert.equal(reused.responseBody.disposition, 'resource-reused');
    assert.deepEqual({ kind: reused.body.kind, format: reused.body.format, topics: sortedTopics(reused.body.topics) }, {
      kind: 'content', format: 'Curso', topics: sortedTopics(['Fundamentos']),
    });
    const snapshot = await ownerSnapshot(fixture, cookie);
    const saved = snapshot.resources.find(({ id }) => id === shared.id);
    assert.equal(saved.title, shared.title);
    assert.equal(saved.description, shared.description);
    assert.deepEqual({ ...saved.classification, topics: sortedTopics(saved.classification.topics) }, {
      state: 'explicit', kind: 'source', format: 'Canal de YouTube', topics: sortedTopics(['Seguridad']),
    });
    assert.deepEqual(await fixture.rawResource(shared.id), shared, 'reuse never changes the shared canonical row');
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('Título', { exact: true })).toHaveValue('Título local no aplicado');
    await expect(editor.getByLabel(/Descripción/iu)).toHaveValue('Descripción local recuperable.');
    await expect(fields.kind).toHaveValue('content');
    await expect(fields.format).toHaveValue('Curso');
    await expect(editor.locator('input[name="topics"][value="Fundamentos"]')).toBeChecked();
    await expect(editor.getByRole('status')).toContainText(/metadatos|ficha|no se guard|no cambi/iu);
    assert.equal(writesTo(capture, 'POST', '/api/creador/enlaces').length, 1);
  } finally {
    await capture.stop({ skipErrorBodies: true });
  }
});

test('approved, revoked, shared, and event links keep classification read-only while preserving metadata and placement options', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const approved = await addClassified(fixture, cookie, { title: 'Ficha aprobada', url: 'https://links.example.invalid/approved' });
  const revoked = await addClassified(fixture, cookie, { title: 'Ficha revocada', url: 'https://links.example.invalid/revoked', format: 'Artículo', topics: ['Redes'] });
  const shared = {
    id: 'phase1-shared-resource', title: 'Ficha compartida', url: 'https://links.example.invalid/shared', description: 'Administrada por otra autoridad.',
    category: 'Canal de YouTube', kind: 'source', format: 'Canal de YouTube', topics: ['Seguridad'], published: true, hidden: false,
    approvalRevoked: false, directoryControl: 'editorial', version: 2,
  };
  const event = {
    id: 'phase1-shared-event', title: 'Evento compartido', recordType: 'event', registrationUrl: 'https://events.example.invalid/phase1',
    description: 'Los eventos no inventan taxonomía ordinaria.', category: 'Eventos', published: true, hidden: false, approvalRevoked: false,
    directoryControl: 'editorial', startsAt: '2099-05-01T17:00:00Z', endsAt: '2099-05-01T19:00:00Z', timeZone: 'UTC',
    organizer: 'Comunidad de prueba', mode: 'online', version: 1,
  };
  await seedResource(fixture.creatorStore, shared);
  await seedResource(fixture.creatorStore, event);
  let snapshot = await ownerSnapshot(fixture, cookie);
  for (const [id, state] of [[approved.resourceId, { published: true, approvalRevoked: false }], [revoked.resourceId, { published: false, approvalRevoked: true }]]) {
    const current = await fixture.rawResource(id);
    assert.equal(await fixture.creatorStore.transact({ checks: [{ key: `resource:${id}`, version: current.version }], puts: [{ key: `resource:${id}`, value: { ...current, ...state, version: current.version + 1 } }] }), true);
  }
  const sharedResult = await ownerApi(fixture, cookie, '/api/creador/referencias/', { method: 'POST', body: { creatorVersion: snapshot.creatorVersion, resourceId: shared.id, url: shared.url, selectedForDirectory: true } });
  assert.equal(sharedResult.response.status, 201, JSON.stringify(sharedResult.body));
  snapshot = await ownerSnapshot(fixture, cookie);
  const eventResult = await ownerApi(fixture, cookie, '/api/creador/referencias/', { method: 'POST', body: { creatorVersion: snapshot.creatorVersion, resourceId: event.id, url: event.registrationUrl, selectedForDirectory: false } });
  assert.equal(eventResult.response.status, 201, JSON.stringify(eventResult.body));

  await openLinks(page, fixture);
  for (const [title, state] of [['Ficha aprobada', 'disabled'], ['Ficha revocada', 'disabled'], ['Ficha compartida', 'disabled'], ['Evento compartido', 'absent']]) {
    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /Editar ficha|Editar opciones/iu }).click();
    const editor = form(page);
    if (state === 'absent') {
      await expect(editor.getByLabel('Tipo de recurso', { exact: true })).toHaveCount(0);
      await expect(editor.getByLabel('Formato', { exact: true })).toHaveCount(0);
      await expect(editor.getByRole('group', { name: /temas/iu })).toHaveCount(0);
    } else {
      const fields = await expectTaxonomy(editor);
      await expect(fields.kind).toBeDisabled();
      await expect(fields.format).toBeDisabled();
      for (let index = 0; index < await fields.topics.count(); index += 1) await expect(fields.topics.nth(index)).toBeDisabled();
    }
    const titleField = editor.getByLabel('Título', { exact: true });
    if (title === 'Ficha aprobada' || title === 'Ficha revocada') await expect(titleField).not.toHaveAttribute('readonly', '');
    else await expect(titleField).toHaveAttribute('readonly', '');
    await expect(editor.getByLabel('Proponer al directorio', { exact: false })).toBeEnabled();
    await page.locator('[data-owner-dialog][open]').getByRole('button', { name: /Cerrar edición/iu }).click();
  }
  const legacyApproved = {
    id: 'phase1-approved-legacy-level', title: 'Ficha legado aprobada', url: 'https://links.example.invalid/approved-legacy-level',
    description: 'La clasificación histórica conserva un nivel incompatible.', category: 'Blog', level: 'inicial', order: 1,
    featured: false, published: true, hidden: false, approvalRevoked: false, directoryControl: 'creator',
    editorProfileId: snapshot.profile.id, version: 1,
  };
  await seedResource(fixture.creatorStore, legacyApproved);
  snapshot = await ownerSnapshot(fixture, cookie);
  const legacyReference = await ownerApi(fixture, cookie, '/api/creador/referencias/', {
    method: 'POST', body: { creatorVersion: snapshot.creatorVersion, resourceId: legacyApproved.id, url: legacyApproved.url, selectedForDirectory: true },
  });
  assert.equal(legacyReference.response.status, 201, JSON.stringify(legacyReference.body));
  await openLinks(page, fixture);
  const legacyRow = page.getByRole('row').filter({ hasText: legacyApproved.title });
  await legacyRow.getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const legacyEditor = form(page);
  const legacyFields = await expectTaxonomy(legacyEditor);
  await expect(legacyFields.kind).toBeDisabled();
  await expect(legacyFields.format).toBeDisabled();
  const legacyTitle = legacyEditor.getByLabel('Título', { exact: true });
  await expect(legacyTitle).toBeEnabled();
  await expect(legacyTitle).not.toHaveAttribute('readonly', '');
  const legacyBefore = await fixture.rawResource(legacyApproved.id);
  await legacyTitle.fill('Intento de cambiar la ficha legado');
  const legacyCapture = await captureCreatorApi(page);
  try {
    await legacyEditor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    const path = `/api/creador/enlaces/${legacyReference.body.placementId}/editar`;
    await expect.poll(() => writesTo(legacyCapture, 'PATCH', path)[0]?.status).toBe(422);
    const rejected = writesTo(legacyCapture, 'PATCH', path)[0];
    assert.equal(rejected.responseBody.error, 'INVALID_CLASSIFICATION');
    assert.deepEqual(await fixture.rawResource(legacyApproved.id), legacyBefore, 'the candidate rejection does not mutate the approved legacy row');
    await expect(legacyEditor.locator('[data-owner-form-status="enlace"]')).toContainText(/administración|clasificación/iu);
    await expect(legacyFields.kind).not.toHaveAttribute('aria-invalid', 'true');
    await expect(legacyTitle).toHaveValue('Intento de cambiar la ficha legado');
  } finally {
    await legacyCapture.stop({ skipErrorBodies: true });
  }
  assert.deepEqual(await fixture.rawResource(shared.id), shared);
  assert.deepEqual(await fixture.rawResource(event.id), event);
});

test('a lost owner receipt preserves the classification draft and confirms by readback without replaying the write', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  await openLinks(page, fixture);
  await page.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
  const editor = form(page, 'alta-enlace');
  const fields = await expectTaxonomy(editor);
  await editor.getByLabel('Título', { exact: true }).fill('Guardado con acuse perdido');
  await editor.getByLabel('URL', { exact: true }).fill('https://links.example.invalid/lost-classification');
  await editor.getByLabel(/Descripción/iu).fill('Descripción recuperable.');
  await fields.kind.selectOption('community');
  await fields.format.selectOption('User Group');
  await editor.locator('input[name="topics"][value="Comunidad"]').check();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let actual;
  let submit;
  let requests = 0;
  const drop = async (route) => {
    const request = route.request();
    if (request.method() !== 'POST' || new URL(request.url()).pathname.replace(/\/$/u, '') !== '/api/creador/enlaces') return route.continue();
    requests += 1;
    const response = await route.fetch();
    actual = { status: response.status(), body: await response.json(), bodySent: request.postDataJSON() };
    await gate;
    await route.abort('failed');
  };
  await page.route('**/api/creador/**', drop);
  try {
    submit = editor.getByRole('button', { name: 'Agregar enlace', exact: true }).click();
    await expect.poll(() => actual?.status, { timeout: QUICK }).toBe(201);
    assert.equal(actual.status, 201);
    assert.deepEqual({ kind: actual.bodySent.kind, format: actual.bodySent.format, topics: actual.bodySent.topics }, { kind: 'community', format: 'User Group', topics: ['Comunidad'] });
    release();
    await submit;
  } finally {
    release();
    await submit?.catch(() => {});
  }
  await expect(page.locator('[data-owner-recovery][data-recovery-kind="unknown"]')).toBeVisible();
  await page.getByRole('button', { name: 'Comprobar estado guardado', exact: true }).click();
  const confirmed = await ownerSnapshot(fixture, cookie);
  const confirmedResource = confirmed.resources.find(({ id }) => id === actual.body.resourceId);
  assert.deepEqual(confirmedResource.classification, {
    state: 'explicit', kind: 'community', format: 'User Group', topics: ['Comunidad'],
  });
  await page.getByRole('button', { name: 'Volver al borrador', exact: true }).click();
  const restored = form(page, 'alta-enlace');
  const restoredFields = await expectTaxonomy(restored);
  await expect(restoredFields.kind).toHaveValue('community');
  await expect(restoredFields.format).toHaveValue('User Group');
  await expect(restored.locator('input[name="topics"][value="Comunidad"]')).toBeChecked();
  assert.equal(requests, 1, 'the explicit readback does not replay the committed command');
  await page.unroute('**/api/creador/**', drop).catch(() => {});
});

test('a confirmed v3 edit keeps its draft when the ensuing real v2 read arrives and opens a fresh current page without replaying', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page);
  const created = await addClassified(fixture, cookie, {
    title: 'Ficha para lectura obsoleta',
    url: 'https://links.example.invalid/old-read-classification',
  });
  await openLinks(page, fixture);
  await page.locator(`[data-link-row="${created.placementId}"]`).getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const editor = form(page);
  const fields = await expectTaxonomy(editor);
  await editor.getByLabel('Título', { exact: true }).fill('Ficha editada en cliente v3');
  await fields.format.selectOption('Curso');
  await editor.locator('input[name="topics"][value="Fundamentos"]').check();

  const capture = await captureCreatorApi(page);
  const editPath = `/api/creador/enlaces/${created.placementId}/editar`;
  let legacyRead;
  let forwardedReads = 0;
  const oldRead = async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/\/$/u, '');
    if (request.method() !== 'GET' || path !== '/api/creador/perfil') {
      await route.continue();
      return;
    }
    forwardedReads += 1;
    const headers = await request.allHeaders();
    headers['x-creator-contract'] = '2';
    const response = await route.fetch({ headers });
    const rawBody = await response.body();
    legacyRead = JSON.parse(rawBody.toString('utf8'));
    assert.equal(response.status(), 200, 'the actual service accepts the old read contract during the transition');
    assert.equal(legacyRead.schemaVersion, 2, 'the forwarded response is an actual v2 owner snapshot');
    await route.fulfill({ response, body: rawBody });
  };
  await page.route('**/api/creador/**', oldRead);
  const documentTimeOrigin = await page.evaluate(() => performance.timeOrigin);
  const activeUrl = page.url();
  let freshPage;
  try {
    const save = editor.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
    await expect.poll(() => writesTo(capture, 'PATCH', editPath)[0]?.status).toBe(200);
    await expect.poll(() => legacyRead?.schemaVersion, { timeout: QUICK }).toBe(2);
    await save;
    assert.equal(forwardedReads, 1, 'only the read following the confirmed v3 write was downgraded to v2');

    const write = writesTo(capture, 'PATCH', editPath)[0];
    assert.equal(write.responseBody.schemaVersion, 2, 'the confirmed write keeps its real schema-2 receipt');
    assert.equal(write.responseBody.operation, 'edit-link');
    assert.equal(write.status, 200);
    const legacyResource = legacyRead.resources.find(({ id }) => id === created.resourceId);
    assert.equal(legacyResource.title, 'Ficha editada en cliente v3', 'the downgraded read observes the committed edit');
    assert.ok(legacyResource.version >= write.responseBody.resourceVersion);
    assert.equal(writesTo(capture, 'PATCH', editPath).length, 1, 'the old read never replays the confirmed write');
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentTimeOrigin, 'the incompatible read does not reload the old tab');
    assert.equal(page.url(), activeUrl);

    const recovery = page.locator('[data-owner-recovery]');
    await expect(recovery).toContainText('La acción está confirmada');
    await expect(recovery).not.toHaveAttribute('data-recovery-kind', 'unknown');
    await expect(recovery).toContainText(/confirmad|desactualiz|lectura/iu);
    await expect(editor.getByLabel('Título', { exact: true })).toHaveValue('Ficha editada en cliente v3');
    await expect(fields.kind).toHaveValue('content');
    await expect(fields.format).toHaveValue('Curso');
    await expect(editor.locator('input[name="topics"][value="Fundamentos"]')).toBeChecked();

    const currentPage = page.getByRole('link', { name: 'Abrir la página actual', exact: true });
    await expect(currentPage).toBeVisible();
    const popup = page.waitForEvent('popup');
    await currentPage.click();
    freshPage = await popup;
    await freshPage.waitForLoadState('load');
    await expect(freshPage.locator('[data-creator-owner]')).toBeVisible();
    const fresh = await ownerSnapshot(fixture, cookie);
    const freshResource = fresh.resources.find(({ id }) => id === created.resourceId);
    assert.equal(fresh.schemaVersion, 3);
    assert.equal(freshResource.title, 'Ficha editada en cliente v3');
    assert.deepEqual({ ...freshResource.classification, topics: sortedTopics(freshResource.classification.topics) }, {
      state: 'explicit', kind: 'content', format: 'Curso', topics: sortedTopics(['Seguridad', 'Fundamentos']),
    });
    assert.equal(writesTo(capture, 'PATCH', editPath).length, 1, 'opening the current page and reading v3 do not send another write');
    assert.equal(forwardedReads, 1, 'recovery never repeats the incompatible GET automatically');
    await expect(editor.getByLabel('Título', { exact: true })).toHaveValue('Ficha editada en cliente v3');
  } finally {
    await freshPage?.close().catch(() => {});
    await page.unroute('**/api/creador/**', oldRead).catch(() => {});
    await capture.stop({ skipErrorBodies: true }).catch(() => {});
  }
});

test('admin preserves incompatible and unknown topics at mount and saves a deliberate checkbox correction', async ({ fixture, page }) => {
  const id = 'phase1-admin-incompatible';
  const initial = adminResource(id, 0, { kind: 'community', format: 'Blog', topics: ['Serverless', 'Tema heredado'] });
  await prepareAdmin(fixture, page, [initial]);
  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(adminRoot(page)).toBeVisible();
  const target = adminRow(page, id);
  const kind = target.getByLabel('Tipo de recurso', { exact: true });
  const format = target.getByLabel('Formato', { exact: true });
  await expect(kind).toHaveValue('community', { timeout: QUICK });
  await expect(format).toHaveValue('Blog');
  const inherited = target.locator('input[name="topics"][value="Tema heredado"]');
  await expect(inherited).toBeChecked();
  await expect(target.locator('input[name="topics"][value="Serverless"]')).toBeChecked();
  await kind.selectOption('content');
  await format.selectOption('Artículo');
  await inherited.uncheck();
  const saved = page.waitForResponse((response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname === '/api/admin/recursos/');
  await target.getByRole('button', { name: 'Guardar clasificación', exact: true }).click();
  const response = await saved;
  assert.equal(response.status(), 200);
  const body = response.request().postDataJSON();
  assert.deepEqual({ kind: body.kind, format: body.format, topics: body.topics }, { kind: 'content', format: 'Artículo', topics: ['Serverless'] });
  const stored = await fixture.rawResource(id);
  assert.deepEqual({ kind: stored.kind, format: stored.format, topics: stored.topics }, { kind: 'content', format: 'Artículo', topics: ['Serverless'] });
});

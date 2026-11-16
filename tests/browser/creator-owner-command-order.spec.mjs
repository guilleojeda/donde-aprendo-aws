import assert from 'node:assert/strict';
import {
  test,
  expect,
  api,
  captureCreatorApi,
  loggedInOwner,
  openSeriesView,
} from '../fixtures/creator-browser-test.mjs';
import {
  applyCreatorStateConversion,
  createCreatorStateConversionPlan,
} from '../../scripts/lib/creator-state-cutover.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';

const PROFILE_ID = 'profile-phase5-order';
const PRIMARY_SERIES = 'series-primary-order';
const OTHER_SERIES = 'series-other-order';
const MOVE_PATH = `/api/creador/series/${PRIMARY_SERIES}/capitulos/z/mover`;

const chapters = (snapshot, seriesId) => snapshot.series[seriesId].chapters;

function physicalKey(row) {
  return `${row.pk}\u0000${row.sk}`;
}

async function convertAndSeedCreator(fixture, accountId, { profileId, profileSlug, rows, resourceRows }) {
  const plan = createCreatorStateConversionPlan({ profileId, rows, resourceRows });
  const physical = new Map(rows.map((row) => [physicalKey(row), structuredClone(row)]));
  const convertedState = await applyCreatorStateConversion(plan, {
    tableName: 'profiles-test',
    async readPhysical(_table, key) {
      return structuredClone(physical.get(`${key.pk}\u0000${key.sk}`));
    },
    async transact(actions) {
      assert.equal(actions.length, 1, 'cutover performs the guarded one-META replacement');
      const item = actions[0].Put.Item;
      physical.set(physicalKey(item), structuredClone(item));
    },
  });
  const retainedAliases = [...physical.values()].filter(({ sk }) => sk.startsWith('SERIES_SLUG#'));
  const puts = [
    {
      key: `account-profile:${accountId}`,
      value: { recordType: 'accountProfile', profileId, version: 1 },
    },
    { key: `profile:${profileId}`, value: convertedState },
    {
      key: `alias:${profileSlug}`,
      value: { recordType: 'profileAlias', slug: profileSlug, profileId, version: 1 },
    },
    ...retainedAliases.map((alias) => ({ key: `series-alias:${profileId}:${alias.slug}`, value: alias })),
  ];
  assert.equal(await fixture.creatorStore.transact({
    checks: puts.map(({ key }) => ({ key, version: null })),
    puts,
  }), true, 'the public reader receives converted state and aliases retained by cutover');
  return { convertedState, retainedAliases };
}

function ownerRead(capture, predicate = () => true) {
  return capture.records.find(({ method, path, status, responseBody }) => method === 'GET'
    && path === '/api/creador/perfil' && status === 200 && responseBody?.schemaVersion === 2 && predicate(responseBody));
}

async function seedOrderState(fixture, cookie) {
  const principal = await fixture.principal(cookie);
  assert.equal(principal.state, 'authenticated');
  const createdAt = Date.UTC(2026, 10, 14);
  const resources = [
    ['resource-z', 'Capítulo z', 'https://order.example/z', false],
    ['resource-a', 'Capítulo a oculto', 'https://order.example/a', true],
  ].map(([id, title, url, hidden]) => ({
    id, title, url, hidden, description: '', category: 'Serverless', kind: 'content',
    format: 'Artículo', topics: ['Serverless'], order: 0, featured: false, published: false,
    approvalRevoked: false, directoryControl: 'editorial', version: 1, createdAt, updatedAt: createdAt,
  }));
  const pk = `PROFILE#${PROFILE_ID}`;
  const rows = [
      {
        pk, sk: 'META', recordType: 'profile', id: PROFILE_ID, version: 69,
        displayName: 'Orden independiente', slug: 'orden-independiente', published: false,
        hidden: false, createdAt, updatedAt: createdAt,
      },
      {
        pk, sk: 'PLACEMENT#z', recordType: 'placement', id: 'z', profileId: PROFILE_ID,
        resourceId: 'resource-z', position: 10, featured: false, selectedForDirectory: true,
        series: { [PRIMARY_SERIES]: { position: 7 }, [OTHER_SERIES]: { position: 0 } },
      },
      {
        pk, sk: 'PLACEMENT#a', recordType: 'placement', id: 'a', profileId: PROFILE_ID,
        resourceId: 'resource-a', position: 20, featured: false, selectedForDirectory: false,
        series: { [PRIMARY_SERIES]: { position: 7 } },
      },
      {
        pk, sk: `SERIES#${PRIMARY_SERIES}`, recordType: 'series', id: PRIMARY_SERIES, profileId: PROFILE_ID,
        name: 'Ruta principal', slug: 'ruta-principal', createdAt, updatedAt: createdAt,
      },
      {
        pk, sk: `SERIES#${OTHER_SERIES}`, recordType: 'series', id: OTHER_SERIES, profileId: PROFILE_ID,
        name: 'Ruta secundaria', slug: 'ruta-secundaria', createdAt, updatedAt: createdAt,
      },
      {
        pk, sk: 'SERIES_SLUG#ruta-principal', recordType: 'seriesAlias', profileId: PROFILE_ID,
        seriesId: PRIMARY_SERIES, slug: 'ruta-principal', version: 1,
      },
      {
        pk, sk: 'SERIES_SLUG#ruta-secundaria', recordType: 'seriesAlias', profileId: PROFILE_ID,
        seriesId: OTHER_SERIES, slug: 'ruta-secundaria', version: 1,
      },
  ];
  await convertAndSeedCreator(fixture, principal.accountId, {
    profileId: PROFILE_ID,
    profileSlug: 'orden-independiente',
    rows,
    resourceRows: resources,
  });
  for (const resource of resources) await seedResource(fixture.creatorStore, resource);
}

function chapterRow(page, placementId) {
  return page.locator(`[data-chapter-row="${placementId}"]`);
}

function moveForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="mover-capitulo"]');
}

test('F8: la comparación usa la secuencia de capítulos migrada aunque el orden general sea el opuesto', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  await seedOrderState(fixture, cookie);
  const initialRead = await api(fixture, cookie, '/api/creador/perfil/');
  assert.equal(initialRead.response.status, 200, JSON.stringify(initialRead.body));
  assert.deepEqual(initialRead.body.order, { featured: [], ordinary: ['z', 'a'] });
  assert.deepEqual(chapters(initialRead.body, PRIMARY_SERIES), ['a', 'z']);
  assert.deepEqual(chapters(initialRead.body, OTHER_SERIES), ['z']);
  assert.equal(initialRead.body.resources.find(({ id }) => id === 'resource-a').hidden, true,
    'the hidden chapter remains part of the owner order');

  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-link-row]')).toHaveCount(2);
  assert.deepEqual(await page.locator('[data-link-row]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-link-row'))),
    ['z', 'a'], 'the owner link table traverses the canonical general sequence instead of rebuilding its order');

  await openSeriesView(page, fixture, `&serie=${encodeURIComponent(PRIMARY_SERIES)}`);
  const hiddenChapter = chapterRow(page, 'a');
  const targetChapter = chapterRow(page, 'z');
  await expect(hiddenChapter).toBeVisible();
  await expect(targetChapter).toBeVisible();
  await targetChapter.locator('[data-chapter-move]').click();
  const form = moveForm(page);
  const destination = form.getByLabel('Posición en esta serie', { exact: true });
  await expect(destination).toHaveValue('2',
    'z is second in the chapter sequence despite appearing first in general order');
  await destination.fill('1');

  const externalProfileSave = await api(fixture, cookie, '/api/creador/perfil/', {
    method: 'PUT',
    headers: { 'X-Creator-Contract': '2' },
    body: { creatorVersion: initialRead.body.creatorVersion, city: 'Córdoba' },
  });
  assert.equal(externalProfileSave.response.status, 200, JSON.stringify(externalProfileSave.body));
  const afterExternal = await api(fixture, cookie, '/api/creador/perfil/');
  assert.equal(afterExternal.response.status, 200);
  assert.equal(afterExternal.body.profile.city, 'Córdoba');
  assert.deepEqual(afterExternal.body.order, { featured: [], ordinary: ['z', 'a'] });
  assert.deepEqual(chapters(afterExternal.body, PRIMARY_SERIES), ['a', 'z'],
    'the concurrent profile edit advances creator revision without changing either order');
  assert.deepEqual(chapters(afterExternal.body, OTHER_SERIES), ['z']);

  const capture = await captureCreatorApi(page, { skipErrorBodies: true });
  const readsBeforeMove = capture.records.filter(({ method, path }) => method === 'GET' && path === '/api/creador/perfil').length;
  await form.getByRole('button', { name: 'Guardar posición', exact: true }).click();
  await expect.poll(() => capture.writes().find(({ method, path }) => method === 'POST' && path === MOVE_PATH)?.status)
    .toBe(409);
  await capture.settle({ skipErrorBodies: true });
  const rejectedMove = capture.writes().find(({ method, path }) => method === 'POST' && path === MOVE_PATH);
  assert.deepEqual(rejectedMove.body, { creatorVersion: initialRead.body.creatorVersion, destination: 1 });
  assert.equal(rejectedMove.status, 409, 'the browser request conflicts with the real profile command');
  const currentState = await fixture.creatorStore.get(`profile:${PROFILE_ID}`);
  assert.equal(currentState.version, afterExternal.body.creatorVersion,
    'the stale command does not advance the current aggregate revision');
  assert.deepEqual(currentState.order, { featured: [], ordinary: ['z', 'a'] });
  assert.deepEqual(currentState.series[PRIMARY_SERIES].chapters, ['a', 'z']);
  assert.deepEqual(currentState.series[OTHER_SERIES].chapters, ['z'],
    'the rejected stale command leaves both chapter sequences intact');

  await expect.poll(() => capture.records.filter(({ method, path }) => method === 'GET'
    && path === '/api/creador/perfil').length).toBeGreaterThan(readsBeforeMove);
  await expect.poll(() => ownerRead(capture,
    (snapshot) => snapshot.creatorVersion === afterExternal.body.creatorVersion) !== undefined).toBe(true);
  const conflict = form.locator('[data-owner-conflict]');
  await expect(conflict).toBeVisible();
  await expect(form.locator('[data-owner-comparison]')).toBeVisible();
  const compared = ownerRead(capture, (snapshot) => snapshot.creatorVersion === afterExternal.body.creatorVersion);
  assert.ok(compared, 'the conflict automatically installs a real full owner GET at the new creator revision');
  assert.deepEqual(compared.responseBody.order, { featured: [], ordinary: ['z', 'a'] });
  assert.deepEqual(chapters(compared.responseBody, PRIMARY_SERIES), ['a', 'z']);
  assert.deepEqual(chapters(compared.responseBody, OTHER_SERIES), ['z']);
  const comparison = form.locator('[data-owner-comparison]');
  await expect(comparison).toContainText(/Posición guardada:\s*2 de 2/iu);

  await form.getByRole('button', { name: 'Guardar mi borrador', exact: true }).click();
  await expect.poll(() => capture.writes().filter(({ method, path }) => method === 'POST' && path === MOVE_PATH).at(-1)?.status)
    .toBe(200);
  await capture.settle({ skipErrorBodies: true });
  const savedMove = capture.writes().filter(({ method, path }) => method === 'POST' && path === MOVE_PATH).at(-1);
  assert.equal(savedMove.status, 200);
  assert.deepEqual(savedMove.body, { creatorVersion: afterExternal.body.creatorVersion, destination: 1 });
  await expect.poll(() => ownerRead(capture, (snapshot) => chapters(snapshot, PRIMARY_SERIES).join(',') === 'z,a') !== undefined)
    .toBe(true);
  const afterSavedMove = ownerRead(capture, (snapshot) => chapters(snapshot, PRIMARY_SERIES).join(',') === 'z,a');
  assert.ok(afterSavedMove, 'the acknowledged move is followed by a fresh full owner GET');
  assert.deepEqual(afterSavedMove.responseBody.order, { featured: [], ordinary: ['z', 'a'] });
  assert.deepEqual(chapters(afterSavedMove.responseBody, OTHER_SERIES), ['z']);
  assert.equal(afterSavedMove.responseBody.resources.find(({ id }) => id === 'resource-a').hidden, true);

  const close = page.locator('[data-owner-dialog][open] [data-owner-close]');
  if (await close.isVisible()) await close.click();
  const nextTarget = chapterRow(page, 'a');
  await expect(nextTarget).toBeVisible();
  await nextTarget.locator('[data-chapter-move]').click();
  const nextForm = moveForm(page);
  const nextDestination = nextForm.getByLabel('Posición en esta serie', { exact: true });
  await expect(nextDestination).toHaveValue('2');
  await nextDestination.fill('1');
  const nextPath = `/api/creador/series/${PRIMARY_SERIES}/capitulos/a/mover`;
  await nextForm.getByRole('button', { name: 'Guardar posición', exact: true }).click();
  await expect.poll(() => capture.writes().find(({ method, path }) => method === 'POST' && path === nextPath)?.status)
    .toBe(200);
  await capture.settle({ skipErrorBodies: true });
  const nextMove = capture.writes().find(({ method, path }) => method === 'POST' && path === nextPath);
  assert.equal(nextMove.status, 200);
  assert.deepEqual(nextMove.body, { creatorVersion: afterSavedMove.responseBody.creatorVersion, destination: 1 });
  await expect.poll(() => ownerRead(capture, (snapshot) => chapters(snapshot, PRIMARY_SERIES).join(',') === 'a,z') !== undefined)
    .toBe(true);
  const finalRead = ownerRead(capture, (snapshot) => chapters(snapshot, PRIMARY_SERIES).join(',') === 'a,z');
  assert.ok(finalRead, 'the next manual move is based on the refreshed snapshot and also reads back fully');
  assert.deepEqual(finalRead.responseBody.order, { featured: [], ordinary: ['z', 'a'] });
  assert.deepEqual(chapters(finalRead.responseBody, OTHER_SERIES), ['z']);
  assert.equal(finalRead.responseBody.resources.find(({ id }) => id === 'resource-a').hidden, true);
  await capture.stop({ skipErrorBodies: true });
});

test('cutover requires the current Series alias before writing and preserves current and historical public routes', async ({ fixture, page }) => {
  const profileId = 'creator-cutover-public-alias';
  const profileSlug = 'creator-cutover-public';
  const seriesId = 'series-cutover-public';
  const currentSlug = 'current-course';
  const historicalSlug = 'old-course';
  const resourceId = 'resource-cutover-public';
  const pk = `PROFILE#${profileId}`;
  const createdAt = Date.UTC(2026, 10, 14);
  const resourceRows = [{
    id: resourceId,
    title: 'Migrated chapter',
    url: 'https://cutover.example/migrated-chapter',
    description: 'Chapter retained during cutover',
    category: 'Serverless',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    order: 1,
    featured: false,
    published: true,
    hidden: false,
    approvalRevoked: false,
    directoryControl: 'creator',
    editorProfileId: profileId,
    version: 1,
    createdAt,
    updatedAt: createdAt,
  }];
  const rows = [
    {
      pk, sk: 'META', recordType: 'profile', id: profileId, version: 8,
      displayName: 'Cutover creator', slug: profileSlug, published: true, hidden: false,
      createdAt, updatedAt: createdAt,
    },
    {
      pk, sk: 'PLACEMENT#chapter', recordType: 'placement', id: 'chapter', profileId,
      resourceId, position: 1, featured: false, selectedForDirectory: true,
      series: { [seriesId]: { position: 1 } },
    },
    {
      pk, sk: `SERIES#${seriesId}`, recordType: 'series', id: seriesId, profileId,
      name: 'Current course', slug: currentSlug, createdAt, updatedAt: createdAt,
    },
    {
      pk, sk: `SERIES_SLUG#${currentSlug}`, recordType: 'seriesAlias', profileId,
      seriesId, slug: currentSlug, version: 2,
    },
    {
      pk, sk: `SERIES_SLUG#${historicalSlug}`, recordType: 'seriesAlias', profileId,
      seriesId, slug: historicalSlug, version: 1,
    },
  ];
  const withoutCurrentAlias = rows.filter(({ sk }) => sk !== `SERIES_SLUG#${currentSlug}`);
  const invalidPlan = {
    format: 'creator-state-cutover-v1',
    profileId,
    backup: { profileRows: withoutCurrentAlias, resourceRows, preservedRows: [] },
  };
  assert.throws(() => createCreatorStateConversionPlan({
    profileId, rows: withoutCurrentAlias, resourceRows,
  }), (error) => error.code === 'SERIES_CANONICAL_ALIAS_MISMATCH');
  let reads = 0;
  let writes = 0;
  await assert.rejects(() => applyCreatorStateConversion(invalidPlan, {
    tableName: 'profiles-test',
    async readPhysical() { reads += 1; },
    async transact() { writes += 1; },
  }), (error) => error.code === 'SERIES_CANONICAL_ALIAS_MISMATCH');
  assert.deepEqual({ reads, writes }, { reads: 0, writes: 0 }, 'invalid alias ownership fails before provider access and writes');

  const validPlan = createCreatorStateConversionPlan({ profileId, rows, resourceRows });
  const physicalWithoutAlias = new Map(rows.map((row) => [physicalKey(row), structuredClone(row)]));
  physicalWithoutAlias.delete(`${pk}\u0000SERIES_SLUG#${currentSlug}`);
  let preflightWrites = 0;
  await assert.rejects(() => applyCreatorStateConversion(validPlan, {
    tableName: 'profiles-test',
    async readPhysical(_table, key) {
      return structuredClone(physicalWithoutAlias.get(`${key.pk}\u0000${key.sk}`));
    },
    async transact() { preflightWrites += 1; },
  }), (error) => error.code === 'SOURCE_CHANGED');
  assert.equal(preflightWrites, 0, 'the physical preflight refuses a missing exported alias before mutation');

  const cookie = await loggedInOwner(fixture, page, { profile: false });
  const principal = await fixture.principal(cookie);
  const { retainedAliases } = await convertAndSeedCreator(fixture, principal.accountId, {
    profileId, profileSlug, rows, resourceRows,
  });
  assert.deepEqual(retainedAliases.map(({ slug }) => slug).sort(), [currentSlug, historicalSlug]);
  for (const resource of resourceRows) await seedResource(fixture.creatorStore, resource);

  const canonicalPath = `/c/${profileSlug}/series/${currentSlug}/`;
  const current = await page.goto(`${fixture.origin}${canonicalPath}`);
  assert.equal(current?.status(), 200);
  await expect(page.getByRole('link', { name: 'Migrated chapter', exact: true })).toBeVisible();

  const historical = await page.request.get(`${fixture.origin}/c/${profileSlug}/series/${historicalSlug}/?from=cutover`, {
    maxRedirects: 0,
  });
  assert.equal(historical.status(), 308);
  assert.equal(historical.headers().location, `${canonicalPath}?from=cutover`);
  const redirected = await page.request.get(new URL(historical.headers().location, fixture.origin).href);
  assert.equal(redirected.status(), 200);
});

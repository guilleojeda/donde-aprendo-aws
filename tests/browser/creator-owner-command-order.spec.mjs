import assert from 'node:assert/strict';
import {
  test,
  expect,
  api,
  captureCreatorApi,
  loggedInOwner,
  openSeriesView,
} from '../fixtures/creator-browser-test.mjs';
import { defaultState, seedState } from '../fixtures/creator-content.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';

const PROFILE_ID = 'profile-phase5-order';
const PRIMARY_SERIES = 'series-primary-order';
const OTHER_SERIES = 'series-other-order';
const MOVE_PATH = `/api/creador/series/${PRIMARY_SERIES}/capitulos/z/mover`;

const chapters = (snapshot, seriesId) => snapshot.series[seriesId].chapters;

function ownerRead(capture, predicate = () => true) {
  return capture.records.find(({ method, path, status, responseBody }) => method === 'GET'
    && path === '/api/creador/perfil' && status === 200 && responseBody?.schemaVersion === 2 && predicate(responseBody));
}

async function seedOrderState(fixture, cookie) {
  const principal = await fixture.principal(cookie);
  assert.equal(principal.state, 'authenticated');
  const createdAt = Date.UTC(2026, 10, 14);
  const state = defaultState({
    profileId: PROFILE_ID,
    creatorVersion: 70,
    profile: { displayName: 'Orden independiente', slug: 'orden-independiente' },
    placements: {
      z: { resourceId: 'resource-z', selectedForDirectory: true },
      a: { resourceId: 'resource-a', selectedForDirectory: false },
    },
    order: { featured: [], ordinary: ['z', 'a'] },
    series: {
      [PRIMARY_SERIES]: { name: 'Ruta principal', slug: 'ruta-principal', chapters: ['a', 'z'] },
      [OTHER_SERIES]: { name: 'Ruta secundaria', slug: 'ruta-secundaria', chapters: ['z'] },
    },
  });
  await seedState(fixture.creatorStore, principal.accountId, state);
  for (const [id, title, url, hidden] of [
    ['resource-z', 'Capítulo z', 'https://order.example/z', false],
    ['resource-a', 'Capítulo a oculto', 'https://order.example/a', true],
  ]) {
    await seedResource(fixture.creatorStore, {
      id,
      title,
      url,
      description: '',
      category: 'Serverless',
      kind: 'content',
      format: 'Artículo',
      topics: ['Serverless'],
      order: 0,
      featured: false,
      published: false,
      hidden,
      approvalRevoked: false,
      directoryControl: 'editorial',
      version: 1,
      createdAt,
      updatedAt: createdAt,
    });
  }
  return state;
}

function chapterRow(page, placementId) {
  return page.locator(`[data-chapter-row="${placementId}"]`);
}

function moveForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="mover-capitulo"]');
}

test('F8: la comparación usa la secuencia de capítulos guardada aunque el orden general sea el opuesto', async ({ fixture, page }) => {
  const cookie = await loggedInOwner(fixture, page, { profile: false });
  const state = await seedOrderState(fixture, cookie);
  const initialRead = await api(fixture, cookie, '/api/creador/perfil/');
  assert.equal(initialRead.response.status, 200, JSON.stringify(initialRead.body));
  assert.deepEqual(initialRead.body.order, { featured: [], ordinary: ['z', 'a'] });
  assert.deepEqual(chapters(initialRead.body, PRIMARY_SERIES), ['a', 'z']);
  assert.deepEqual(chapters(initialRead.body, OTHER_SERIES), ['z']);
  assert.equal(initialRead.body.resources.find(({ id }) => id === 'resource-a').hidden, true,
    'the hidden chapter remains part of the owner order');

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
  assert.deepEqual(state.order, { featured: [], ordinary: ['z', 'a'] },
    'the independently seeded general order remains the expected sequence');
  await capture.stop({ skipErrorBodies: true });
});

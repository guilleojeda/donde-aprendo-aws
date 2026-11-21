import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CREATOR_FIELD_LIMITS } from '../src/lib/creator-values.mjs';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';

async function api(harness, path, method = 'GET', body) {
  return callApi(harness, path, {
    session: 'creator-a',
    csrf: sessionCsrf['creator-a'],
    creatorContract: '2',
    method,
    ...(body === undefined ? {} : { body }),
  });
}

async function editor(harness) {
  const response = await api(harness, '/api/creador/perfil');
  assert.equal(response.status, 200);
  return responseJson(response);
}

async function draft() {
  const harness = await createCreatorPagesHarness();
  const response = await api(harness, '/api/creador/perfil', 'PUT', {
    creatorVersion: null,
    displayName: 'Ana de Contenido',
    slug: 'ana-contenido',
  });
  assert.equal(response.status, 200);
  return harness;
}

async function rejected(harness, path, body, code, method = 'POST') {
  const before = await editor(harness);
  const firstCall = harness.store.calls.length;
  const response = await api(harness, path, method, body);
  assert.equal(response.status, 422);
  const payload = await responseJson(response);
  assert.equal(payload.error, code);
  assert.deepEqual(await editor(harness), before, 'a rejected request leaves saved content and versions unchanged');
  assert.equal(harness.store.calls.slice(firstCall).some(({ operation, input }) =>
    operation === 'transact' && (input.puts?.length || input.deletes?.length)), false,
  'a definitive validation rejection makes neither reservations nor partial writes');
  return payload;
}

async function saved(harness, path, method, body, status) {
  const response = await api(harness, path, method, body);
  assert.equal(response.status, status);
  return responseJson(response);
}

const LINK = { title: 'Guía de contenido', url: 'https://example.com/guia', description: 'Descripción válida' };
const SERIES = { name: 'Serie de contenido', slug: 'serie-contenido', description: 'Descripción válida' };
const PRIVATE = 'texto privado de auditoría ';
const INVALID_URL = 'https://user:secret@example.com/recurso';

for (const { path, values, field } of [
  { path: '/api/creador/enlaces', values: LINK, field: 'title' },
  { path: '/api/creador/enlaces', values: LINK, field: 'url' },
  { path: '/api/creador/series', values: SERIES, field: 'name' },
  { path: '/api/creador/series', values: SERIES, field: 'description' },
]) {
  test(`un límite excedido identifica ${field} en ${path}`, async () => {
    const harness = await draft();
    const { creatorVersion } = await editor(harness);
    const oversized = PRIVATE.repeat(Math.ceil(CREATOR_FIELD_LIMITS[field] / PRIVATE.length) + 1);
    const payload = await rejected(harness, path, { creatorVersion, ...values, [field]: oversized }, 'FIELD_TOO_LONG');
    assert.equal(JSON.stringify(payload).includes(PRIVATE), false, 'the diagnostic never exposes submitted text');
    assert.deepEqual(payload.fieldErrors, [{ field, reason: 'too_long' }]);
  });
}

test('la edición de una ficha activa atribuye el límite y conserva sus opciones y revisiones', async () => {
  const harness = await draft();
  const { creatorVersion } = await editor(harness);
  const link = await saved(harness, '/api/creador/enlaces', 'POST', { creatorVersion, ...LINK }, 201);
  const payload = await rejected(harness, `/api/creador/enlaces/${link.placementId}/editar`, {
    creatorVersion: link.creatorVersion,
    resourceVersion: link.resourceVersion,
    description: 'x'.repeat(CREATOR_FIELD_LIMITS.description + 1),
    featured: true,
  }, 'FIELD_TOO_LONG', 'PATCH');
  assert.deepEqual(payload.fieldErrors, [{ field: 'description', reason: 'too_long' }]);
});

test('la edición de una ficha retirada atribuye el límite sin volver a crear la colocación', async () => {
  const harness = await draft();
  const { creatorVersion } = await editor(harness);
  const link = await saved(harness, '/api/creador/enlaces', 'POST', { creatorVersion, ...LINK }, 201);
  await saved(harness, `/api/creador/enlaces/${link.placementId}`, 'DELETE', { creatorVersion: link.creatorVersion }, 200);
  const payload = await rejected(harness, `/api/creador/recursos?id=${encodeURIComponent(link.resourceId)}`, {
    resourceVersion: link.resourceVersion,
    title: 'x'.repeat(CREATOR_FIELD_LIMITS.title + 1),
  }, 'FIELD_TOO_LONG', 'PATCH');
  assert.deepEqual(payload.fieldErrors, [{ field: 'title', reason: 'too_long' }]);
});

test('la edición de serie atribuye el límite y deja la serie y su dirección intactas', async () => {
  const harness = await draft();
  const { creatorVersion } = await editor(harness);
  const series = await saved(harness, '/api/creador/series', 'POST', { creatorVersion, ...SERIES }, 201);
  const payload = await rejected(harness, `/api/creador/series/${series.seriesId}`, {
    ...SERIES,
    creatorVersion: series.creatorVersion,
    description: 'x'.repeat(CREATOR_FIELD_LIMITS.description + 1),
  }, 'FIELD_TOO_LONG', 'PATCH');
  assert.deepEqual(payload.fieldErrors, [{ field: 'description', reason: 'too_long' }]);
});

test('una entrada ajena o anidada no se atribuye a un campo editable de enlace', async () => {
  const harness = await draft();
  const { creatorVersion } = await editor(harness);
  const oversized = 'x'.repeat(CREATOR_FIELD_LIMITS.title + 1);
  for (const body of [
    { ...LINK, metadata: { title: oversized } },
    { ...LINK, 'metadata.title': oversized },
    { ...LINK, title: [oversized] },
  ]) {
    const payload = await rejected(harness, '/api/creador/enlaces', { creatorVersion, ...body }, 'FIELD_TOO_LONG');
    assert.equal(payload.fieldErrors, undefined, 'invalid request shape cannot mark a real visible field');
  }
});

test('el rechazo de una URL escrita en una solicitud la atribuye sin exponer sus datos', async () => {
  const harness = await draft();
  const path = '/api/creador/reclamaciones';
  const payload = await rejected(harness, path, {
    resources: [{ url: INVALID_URL }],
    evidence: PRIVATE,
  }, 'INVALID_URL');
  assert.equal(JSON.stringify(payload).includes(INVALID_URL), false);
  assert.equal(JSON.stringify(payload).includes(PRIVATE), false);
  assert.deepEqual(payload.fieldErrors, [{ field: 'knownUrls', reason: 'invalid_url' }]);
});

test('el rechazo de la URL de una selección nunca marca el campo de URLs escritas', async () => {
  const harness = await draft();
  const selected = await rejected(harness, '/api/creador/reclamaciones', {
    resources: [{ resourceId: 'catalog-record', url: INVALID_URL }],
    evidence: PRIVATE,
  }, 'INVALID_URL');
  assert.equal(selected.fieldErrors?.some(({ field }) => field === 'knownUrls') ?? false, false,
    'a failure in a selected record cannot mark the optional written-URLs textarea');
});

test('la longitud del contexto privado se atribuye sin devolver el contenido de la solicitud', async () => {
  const harness = await draft();
  const payload = await rejected(harness, '/api/creador/reclamaciones', {
    resources: [{ url: LINK.url }],
    evidence: PRIVATE.repeat(Math.ceil(CREATOR_FIELD_LIMITS.evidence / PRIVATE.length) + 1),
  }, 'FIELD_TOO_LONG');
  assert.equal(JSON.stringify(payload).includes(PRIVATE), false);
  assert.deepEqual(payload.fieldErrors, [{ field: 'evidence', reason: 'too_long' }]);
});

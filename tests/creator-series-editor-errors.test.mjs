import assert from 'node:assert/strict';
import test from 'node:test';
import { creatorSeriesFailureMessage } from '../src/lib/creator-series-editor-errors.ts';

const profileConflictMessage = 'El perfil cambió desde que abriste la página. Recárgala antes de volver a guardar.';
const seriesConflictMessage = 'La serie, sus capítulos o el perfil cambiaron desde que abriste la página. Recárgala antes de volver a guardar.';
const refreshMessage = 'Otra edición guardó una versión más reciente. Tus datos siguen en el formulario; revisa el estado antes de volver a guardar.';
const reservedSlugMessage = 'La dirección de esta serie ya está reservada. Elige otra dirección.';

function conflict(error) {
  return new Response(JSON.stringify({ error, message: 'series slug is already reserved' }), {
    status: 409,
    headers: { 'content-type': 'application/json' },
  });
}

test('series slug reservations stay specific while known version conflicts require a reload', async () => {
  assert.equal(await creatorSeriesFailureMessage(conflict('SERIES_SLUG_TAKEN'), refreshMessage), reservedSlugMessage);
  assert.equal(await creatorSeriesFailureMessage(conflict('PROFILE_CONFLICT'), refreshMessage), profileConflictMessage);
  assert.equal(await creatorSeriesFailureMessage(conflict('SERIES_CONFLICT'), refreshMessage), seriesConflictMessage);
  assert.equal(await creatorSeriesFailureMessage(conflict('UNEXPECTED_CONFLICT'), refreshMessage), refreshMessage);

  const malformed = new Response('not json', { status: 409 });
  assert.equal(await creatorSeriesFailureMessage(malformed, refreshMessage), refreshMessage);
  assert.equal(await creatorSeriesFailureMessage(conflict('SERIES_SLUG_TAKEN'), 'generic message'), reservedSlugMessage);
  assert.equal(await creatorSeriesFailureMessage(new Response('bad request', { status: 422 }), refreshMessage), refreshMessage);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { creatorEditorFailureMessage } from '../src/lib/creator-editor-errors.ts';

const reloadMessage = 'El perfil, recurso o enlace cambió desde que abriste la página. Recárgala antes de volver a guardar.';
const neutralMessage = 'No pudimos completar el cambio porque hay un conflicto. Revisa el estado antes de volver a intentarlo.';

function conflict(error) {
  return Response.json({ error }, { status: 409 });
}

test('known creator version conflicts require a reload while unknown conflicts stay neutral', async () => {
  for (const error of ['PROFILE_CONFLICT', 'RESOURCE_CONFLICT', 'PLACEMENT_CONFLICT']) {
    assert.equal(await creatorEditorFailureMessage(conflict(error), neutralMessage), reloadMessage);
  }
  assert.equal(await creatorEditorFailureMessage(conflict('FUTURE_CONFLICT'), neutralMessage), neutralMessage);
  assert.equal(await creatorEditorFailureMessage(new Response('unreadable', { status: 409 }), neutralMessage), neutralMessage);
});

test('slug and URL conflicts keep their specific correction guidance', async () => {
  assert.equal(await creatorEditorFailureMessage(conflict('SLUG_TAKEN'), neutralMessage),
    'Esa dirección ya está reservada. Elige otra dirección para tu página.');
  assert.equal(await creatorEditorFailureMessage(conflict('URL_TAKEN'), neutralMessage),
    'Esa URL ya está asociada a otra ficha. Elige una URL diferente.');
});

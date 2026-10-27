import {
  createLinksApi,
  createOwnerLinksSurface,
  mountOwnerLinks,
} from './creator-owner-links-browser.mjs';
import { SurfaceElement } from './creator-owner-browser-dom.mjs';

export function createOwnerLinkMoveSurface(options = {}) {
  const surface = createOwnerLinksSurface(options);
  const targetPosition = new SurfaceElement({ tagName: 'INPUT', name: 'targetPosition', type: 'number', value: '1' });
  targetPosition.setAttribute('min', '1');
  const moveContext = new SurfaceElement({ dataset: { linkMoveContext: '' } });
  const moveStatus = new SurfaceElement({ dataset: { ownerFormStatus: 'mover-enlace' } });
  const suggestion = new SurfaceElement({ tagName: 'BUTTON', type: 'button', dataset: { linkMoveSuggestion: '' } });
  const suggestionShell = new SurfaceElement({ dataset: { linkMoveSuggestionShell: '' }, lists: [suggestion] });
  const save = new SurfaceElement({ tagName: 'BUTTON', type: 'submit', textContent: 'Guardar movimiento' });
  const cancel = new SurfaceElement({ tagName: 'BUTTON', type: 'button', dataset: { ownerCancel: '' }, textContent: 'Cancelar' });
  const form = new SurfaceElement({
    tagName: 'FORM',
    dataset: { ownerForm: 'mover-enlace' },
    lists: [moveContext, targetPosition, moveStatus, suggestionShell, surface.conflict, save, cancel],
  });
  form.elements = [targetPosition, moveStatus, save, cancel];
  form.hidden = true;
  for (const field of form.elements) {
    field.form = form;
    field.ownerDocument = surface.document;
  }
  surface.dialog.append(form);

  return {
    ...surface,
    moveForm: form,
    moveContext,
    moveConflict: surface.conflict,
    targetPosition,
    moveStatus,
    moveSuggestion: suggestion,
    moveSuggestionShell: suggestionShell,
    moveSave: save,
    moveCancel: cancel,
  };
}

export function ensureMoveActions(surface) {
  for (const row of surface.table.querySelectorAll('[data-link-row]')) {
    if (row.querySelector('[data-link-move]')) continue;
    const move = new SurfaceElement({
      tagName: 'BUTTON',
      type: 'button',
      dataset: { linkMove: '', placementId: row.dataset.linkRow },
      textContent: 'Mover a la posición…',
    });
    move.ownerDocument = surface.document;
    row.append(move);
  }
}

export async function mountOwnerLinkMove({ links = [], editableResources = [], series = [], search = '', query = {}, override } = {}) {
  const surface = createOwnerLinkMoveSurface({ links, editableResources, series, search, query });
  const api = createLinksApi({ surface, override });
  const requests = await mountOwnerLinks({ surface, fetch: api.fetch });
  ensureMoveActions(surface);
  return { surface, api, requests };
}

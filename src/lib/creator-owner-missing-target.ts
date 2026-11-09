import type { CreatorEditorDTO } from '../types/creators';
import type { CreatorOwnerWriteIntent } from './creator-owner-state';

export type CreatorOwnerMissingTargetKind =
  | 'series-removed'
  | 'pending-add'
  | 'options-only'
  | 'retained-resource'
  | 'reference'
  | 'replacement'
  | 'ambiguous-replacement';

export interface CreatorOwnerMissingTargetRecovery {
  kind: CreatorOwnerMissingTargetKind;
  actionLabel: string;
  message: string;
  canAdopt: boolean;
  targetPlacementId?: string;
  notice?: string;
}

function removedLinkNotice(kind: CreatorOwnerMissingTargetKind): string {
  if (kind === 'retained-resource') return 'El enlace retirado no recupera destacado, posición ni capítulos. Sólo se envían título, URL y descripción cuando presionas Guardar.';
  if (kind === 'reference' || kind === 'options-only') return 'El enlace retirado no recupera destacado, posición ni capítulos. Conservamos la propuesta al directorio para el alta manual de la referencia.';
  if (kind === 'replacement') return 'El enlace retirado no recupera destacado, posición ni capítulos. El enlace actual conserva sus opciones vigentes.';
  if (kind === 'pending-add') return 'El enlace retirado no recupera destacado, posición ni capítulos. El borrador del alta sigue separado.';
  return 'El enlace retirado no recupera destacado, posición ni capítulos. Hay varios enlaces actuales y no elegimos ninguno.';
}

/**
 * Classifies only an absent, previously known owner target. Comparison and
 * adoption use the same classification so labels never imply a different
 * continuation from the one the reducer can install.
 */
export function resolveCreatorOwnerMissingTarget(
  intent: CreatorOwnerWriteIntent,
  snapshot: CreatorEditorDTO,
  profileMatches: boolean,
): CreatorOwnerMissingTargetRecovery | undefined {
  if (intent.kind === 'save-series' && intent.capture.kind === 'series') {
    const baseSeries = intent.capture.baseSeries;
    if (baseSeries && !snapshot.series.some(({ id }) => id === baseSeries.id)) return {
      kind: 'series-removed',
      actionLabel: 'Volver a Series',
      message: 'La serie que editabas ya no está en la lista guardada. Puedes volver a Series con el estado actual.',
      canAdopt: profileMatches,
    };
  }

  if (intent.kind !== 'save-link' || intent.capture.kind !== 'link-placement') return undefined;
  const captured = intent.capture;
  if (snapshot.links.some(({ placementId }) => placementId === captured.baseLink.placementId)) return undefined;

  const notice = (kind: CreatorOwnerMissingTargetKind) => ({ notice: removedLinkNotice(kind) });
  const canAdopt = profileMatches;
  if (captured.pendingAddDraft) {
    return {
      ...notice('pending-add'),
      kind: 'pending-add',
      actionLabel: 'Continuar con el borrador del alta',
      message: 'El enlace ya no está en tu página. Puedes continuar con el borrador del alta y el perfil actual.',
      canAdopt,
    };
  }
  if (captured.optionsOnly) {
    return {
      ...notice('options-only'),
      kind: 'options-only',
      actionLabel: 'Volver a elegir una referencia',
      message: 'El enlace ya no está en tu página. Conservamos la referencia exacta y la propuesta al directorio para elegirla o reemplazarla manualmente.',
      canAdopt,
    };
  }

  const replacements = snapshot.links.filter(({ resourceId }) => resourceId === captured.baseLink.resourceId);
  if (replacements.length > 1) {
    return {
      ...notice('ambiguous-replacement'),
      kind: 'ambiguous-replacement',
      actionLabel: 'Revisar los enlaces actuales',
      message: 'Hay varios enlaces actuales para el mismo recurso. No elegimos uno automáticamente y conservamos tu corrección.',
      canAdopt: false,
    };
  }
  if (replacements.length === 1) {
    return {
      ...notice('replacement'),
      kind: 'replacement',
      actionLabel: 'Revisar el enlace actual',
      message: 'El mismo recurso tiene un enlace actual distinto. Puedes revisarlo antes de continuar.',
      canAdopt,
      targetPlacementId: replacements[0].placementId,
    };
  }

  const retained = captured.editable && snapshot.editableResources.some(({ id }) => id === captured.baseLink.resourceId);
  if (retained) {
    return {
      ...notice('retained-resource'),
      kind: 'retained-resource',
      actionLabel: 'Continuar editando la ficha retirada',
      message: 'La ficha propia sigue disponible, pero el enlace ya no está en tu página. Puedes continuar con título, URL y descripción; Guardar no lo vuelve a agregar.',
      canAdopt,
    };
  }
  return {
    ...notice('reference'),
    kind: 'reference',
    actionLabel: 'Volver a elegir una referencia',
    message: 'El enlace ya no está en tu página. Conservamos su referencia exacta y la propuesta al directorio para elegirla o reemplazarla manualmente.',
    canAdopt,
  };
}

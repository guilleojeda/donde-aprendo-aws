import type {
  CreatorEditorDTO,
  CreatorLinkDTO,
  CreatorProfileDTO,
  CreatorSeriesDTO,
  CreatorSocial,
} from '../types/creators';
import { normalizeCreatorText } from './creator-values.mjs';
import { isCreatorLink, isCreatorSeries, isProfile } from './creator-owner-data';
import {
  readCreatorVersionChanges,
  validateCreatorOwnerReceipts,
  type CreatorOwnerReceiptParticipant,
} from '../scripts/creator-write-state';
import {
  creatorSessionRecoveryReason,
  readCreatorSessionResponse,
} from './creator-session-response';
import {
  type CreatorOwnerComparison,
  type CreatorOwnerEffect,
  type CreatorOwnerEditor,
  type CreatorOwnerListContext,
  type CreatorOwnerWriteIntent,
} from './creator-owner-state';
import { creatorOwnerChapterOrder } from './creator-owner-series';

export interface CreatorOwnerRequest {
  path: string;
  method: 'PUT' | 'POST' | 'PATCH' | 'DELETE';
  body: Record<string, unknown>;
}

export type CreatorOwnerCommandOutcome =
  | { kind: 'confirmed'; effect: CreatorOwnerEffect }
  | { kind: 'uncertain'; message: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'rejected'; message: string; code?: string; viablePosition?: number }
  | { kind: 'session'; reason: 'expired' | 'csrf'; message: string };

export function creatorOwnerWriteIntent(id: string, capture: CreatorOwnerEditor | CreatorOwnerListContext): CreatorOwnerWriteIntent {
  const kind: CreatorOwnerWriteIntent['kind'] = capture.kind === 'list-command'
    ? capture.operation
    : capture.kind === 'create-profile' ? 'create-profile'
      : capture.kind === 'profile' ? 'save-profile'
        : capture.kind === 'photo' ? 'photo'
          : capture.kind === 'series' ? 'save-series' : 'chapter-move';
  return { id, editorKey: capture.key, kind, capture };
}

function socialValues(draft: Extract<CreatorOwnerEditor, { kind: 'profile'; section: 'redes' }>['draft']): Partial<Record<CreatorSocial, string>> {
  const values: Partial<Record<CreatorSocial, string>> = {};
  for (const key of ['instagram', 'x', 'linkedin', 'awsBuilder', 'website'] as const) {
    const value = normalizeCreatorText(draft[key]);
    if (!value) continue;
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid-url');
    } catch {
      throw new TypeError(`${key} requiere una URL HTTP o HTTPS completa sin usuario ni contraseña.`);
    }
    values[key] = value;
  }
  return values;
}

export function prepareCreatorOwnerRequest(intent: CreatorOwnerWriteIntent): CreatorOwnerRequest {
  const capture = intent.capture;
  if (intent.kind === 'create-profile') {
    if (capture.kind !== 'create-profile') throw new TypeError('El alta no contiene su borrador.');
    return { path: '/api/creador/perfil/', method: 'PUT', body: {
      displayName: normalizeCreatorText(capture.draft.displayName),
      slug: normalizeCreatorText(capture.draft.slug),
    } };
  }
  if (intent.kind === 'save-profile') {
    if (capture.kind !== 'profile') throw new TypeError('La edición del perfil no contiene su borrador.');
    if (capture.section === 'redes') {
      return { path: '/api/creador/perfil/', method: 'PUT', body: { version: capture.base.version, socials: socialValues(capture.draft) } };
    }
    const draft = capture.draft;
    return { path: '/api/creador/perfil/', method: 'PUT', body: {
      version: capture.base.version,
      displayName: normalizeCreatorText(draft.displayName),
      slug: normalizeCreatorText(draft.slug),
      city: normalizeCreatorText(draft.city),
      country: normalizeCreatorText(draft.country),
      programs: [...draft.programs],
      bio: normalizeCreatorText(draft.bio),
    } };
  }
  if (intent.kind === 'publish') {
    if (capture.kind !== 'list-command') throw new TypeError('La publicación no contiene su perfil base.');
    return { path: '/api/creador/perfil/publicar/', method: 'POST', body: { version: capture.baseProfile.version } };
  }
  if (intent.kind === 'save-series') {
    if (capture.kind !== 'series') throw new TypeError('La serie no contiene su editor.');
    const name = normalizeCreatorText(capture.draft.name);
    const slug = normalizeCreatorText(capture.draft.slug);
    const description = normalizeCreatorText(capture.draft.description);
    if (!capture.baseSeries) {
      return { path: '/api/creador/series/', method: 'POST', body: {
        name, slug, ...(description ? { description } : {}), profileVersion: capture.baseProfile.version,
      } };
    }
    return { path: `/api/creador/series/${encodeURIComponent(capture.baseSeries.id)}/`, method: 'PATCH', body: {
      version: capture.baseSeries.version,
      profileVersion: capture.baseProfile.version,
      name,
      slug,
      ...(description !== (capture.baseSeries.description ?? '') ? { description } : {}),
    } };
  }
  if (intent.kind === 'delete-series') {
    if (capture.kind !== 'list-command' || !capture.baseSeries) throw new TypeError('La eliminación no contiene la serie observada.');
    return { path: `/api/creador/series/${encodeURIComponent(capture.baseSeries.id)}/`, method: 'DELETE', body: {
      version: capture.baseSeries.version, profileVersion: capture.baseProfile.version,
    } };
  }
  if (intent.kind === 'chapter-add' || intent.kind === 'chapter-remove') {
    if (capture.kind !== 'list-command' || !capture.baseSeries || !capture.basePlacement) throw new TypeError('El capítulo no contiene su serie y enlace observados.');
    return {
      path: `/api/creador/series/${encodeURIComponent(capture.baseSeries.id)}/capitulos/${encodeURIComponent(capture.basePlacement.placementId)}/`,
      method: intent.kind === 'chapter-add' ? 'PUT' : 'DELETE',
      body: { profileVersion: capture.baseProfile.version },
    };
  }
  if (intent.kind === 'chapter-move') {
    if (capture.kind !== 'move-chapter') throw new TypeError('El movimiento no contiene su editor.');
    const targetPosition = Number(capture.targetPosition);
    return {
      path: `/api/creador/series/${encodeURIComponent(capture.seriesId)}/capitulos/${encodeURIComponent(capture.placementId)}/mover/`,
      method: 'POST',
      body: {
        profileVersion: capture.baseProfile.version,
        seriesVersion: capture.baseSeries.version,
        placementVersion: capture.basePlacement.placementVersion,
        targetPosition,
      },
    };
  }
  throw new TypeError('La foto necesita el protocolo de autorización, carga y finalización.');
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

async function responseObject(response: Response): Promise<Record<string, unknown> | undefined> {
  try { return object(await response.clone().json()); } catch { return undefined; }
}

function profileReceipt(changes: Awaited<ReturnType<typeof readCreatorVersionChanges>>, profile: CreatorProfileDTO) {
  return changes?.find((change) => change.entity === 'profile' && change.id === profile.id);
}

function versionMatches(changes: Awaited<ReturnType<typeof readCreatorVersionChanges>>, entity: 'profile' | 'series', id: string, before: number, after: unknown): boolean {
  const receipt = changes?.find((change) => change.entity === entity && change.id === id);
  return Number.isSafeInteger(after) && Number(after) === (receipt?.after ?? before);
}

function errorMessage(code: unknown, status: number, intent: CreatorOwnerWriteIntent): string {
  if (code === 'SLUG_TAKEN') return 'Esa dirección ya está reservada. Elige otra antes de guardar.';
  if (code === 'SERIES_SLUG_TAKEN') return 'Esa dirección ya se usa o sigue reservada para otra serie. Elige otra.';
  if (code === 'ORDER_MOVE_LIMIT') return 'Ese movimiento supera el límite de una operación. Conservamos tu destino; puedes elegir una posición intermedia y guardar de nuevo.';
  if (code === 'ORDER_MOVE_CALCULATION_UNAVAILABLE') return 'No pudimos calcular este movimiento. Conservamos el destino y no hicimos cambios.';
  if (status === 404 && intent.kind === 'chapter-add') return 'El enlace o la serie ya no está disponible. Comprueba la lista antes de continuar.';
  if (status === 422) return 'Revisa los datos: el servicio no acepta alguno de ellos. Tus cambios siguen aquí.';
  if (status === 403) return 'Esta cuenta no tiene permiso para completar esta acción. Tus cambios siguen aquí.';
  return 'No pudimos completar la acción. Tus cambios siguen aquí; revisa la información e inténtalo de nuevo.';
}

function sameOtherProfileFields(left: CreatorProfileDTO, right: CreatorProfileDTO, fields: ReadonlySet<string>): boolean {
  const keys = ['city', 'country', 'programs', 'bio', 'socials', 'photo', 'published', 'hidden'] as const;
  return keys.every((key) => fields.has(key) || JSON.stringify(left[key]) === JSON.stringify(right[key]));
}

function profilePayloadMatches(next: CreatorProfileDTO, prior: CreatorProfileDTO | null, intent: CreatorOwnerWriteIntent, body: Record<string, unknown>): boolean {
  if (intent.kind === 'create-profile') {
    return prior === null && next.displayName === body.displayName && next.slug === body.slug
      && next.version === 1 && !next.published && !next.hidden;
  }
  if (intent.kind === 'publish') return Boolean(prior && next.id === prior.id && next.published && sameOtherProfileFields(prior, next, new Set(['published']))
    && next.displayName === prior.displayName && next.slug === prior.slug && next.version >= prior.version);
  if (intent.kind !== 'save-profile' || !prior || next.id !== prior.id || !sameOtherProfileFields(prior, next,
    new Set(Object.keys(body)))) return false;
  if ('socials' in body) return JSON.stringify(next.socials) === JSON.stringify(body.socials)
    && next.displayName === prior.displayName && next.slug === prior.slug;
  return next.displayName === body.displayName && next.slug === body.slug
    && (body.city === undefined || next.city === body.city)
    && (body.country === undefined || next.country === body.country)
    && JSON.stringify(next.programs) === JSON.stringify(body.programs)
    && (body.bio === undefined || next.bio === body.bio);
}

function captureProfile(intent: CreatorOwnerWriteIntent): CreatorProfileDTO | null {
  if (intent.capture.kind === 'list-command') return intent.capture.baseProfile;
  if (intent.capture.kind === 'create-profile') return null;
  if (intent.capture.kind === 'profile' || intent.capture.kind === 'photo') return intent.capture.base;
  if (intent.capture.kind === 'series') return intent.capture.baseProfile;
  return intent.capture.baseProfile;
}

function requestBody(intent: CreatorOwnerWriteIntent): Record<string, unknown> {
  return prepareCreatorOwnerRequest(intent).body;
}

function commandParticipants(
  status: number,
  intent: CreatorOwnerWriteIntent,
  responseBody: Record<string, unknown>,
  changes: Awaited<ReturnType<typeof readCreatorVersionChanges>>,
  observed: CreatorEditorDTO,
): { valid: boolean; effect?: CreatorOwnerEffect } {
  const priorProfile = captureProfile(intent);
  if (intent.kind === 'create-profile' || intent.kind === 'save-profile' || intent.kind === 'publish') {
    const next = responseBody.profile;
    if (!isProfile(next) || !profilePayloadMatches(next, priorProfile, intent, requestBody(intent))) return { valid: false };
    const participants: CreatorOwnerReceiptParticipant[] = intent.kind === 'create-profile'
      ? [{ entity: 'profile', id: next.id, before: 0, transition: 'created-one', required: true }]
      : priorProfile ? [{ entity: 'profile', id: priorProfile.id, before: priorProfile.version, transition: 'increment' }] : [];
    const receiptValid = validateCreatorOwnerReceipts(changes, participants);
    if (!receiptValid || !versionMatches(changes, 'profile', next.id, priorProfile?.version ?? 0, next.version)) return { valid: false };
    const receipt = changes?.find((change) => change.entity === 'profile' && change.id === next.id);
    return { valid: true, effect: { kind: 'profile-updated', profile: { ...next, version: receipt?.after ?? next.version } } };
  }
  if (intent.kind === 'save-series') {
    if (intent.capture.kind !== 'series') return { valid: false };
    const editor = intent.capture;
    const series = responseBody.series;
    if (!isCreatorSeries(series)) return { valid: false };
    const body = requestBody(intent);
    const created = editor.baseSeries === null;
    if (created ? series.version !== 1 || observed.series.some(({ id }) => id === series.id)
      : series.id !== editor.baseSeries?.id) return { valid: false };
    const expectedDescriptionPresent = Object.hasOwn(body, 'description')
      ? typeof body.description === 'string'
      : !created && Object.hasOwn(editor.baseSeries ?? {}, 'description');
    const expectedDescription = Object.hasOwn(body, 'description')
      ? body.description
      : editor.baseSeries?.description;
    if (status !== 200 && status !== 201) return { valid: false };
    if (series.name !== body.name || series.slug !== body.slug
      || Object.hasOwn(series, 'description') !== expectedDescriptionPresent
      || series.description !== expectedDescription) return { valid: false };
    const seriesBefore = editor.baseSeries?.version ?? 0;
    const seriesReceiptId = editor.baseSeries?.id ?? series.id;
    const profileBefore = editor.baseProfile.version;
    const participants: CreatorOwnerReceiptParticipant[] = [
      { entity: 'profile', id: editor.baseProfile.id, before: profileBefore, transition: 'increment', required: created },
      { entity: 'series', id: seriesReceiptId, before: seriesBefore, transition: created ? 'created-one' : 'increment', required: created },
    ];
    if (!validateCreatorOwnerReceipts(changes, participants)
      || !versionMatches(changes, 'profile', editor.baseProfile.id, profileBefore, responseBody.profileVersion)
      || !versionMatches(changes, 'series', series.id, seriesBefore, series.version)) return { valid: false };
    const profile = profileReceipt(changes, editor.baseProfile);
    const seriesReceipt = changes?.find((change) => change.entity === 'series' && change.id === series.id);
    if (Boolean(profile) !== Boolean(seriesReceipt) || (created && (!profile || !seriesReceipt))) return { valid: false };
    return { valid: true, effect: { kind: 'series-updated', profileId: editor.baseProfile.id,
      profileVersion: profile?.after ?? profileBefore, series: { ...series, version: seriesReceipt?.after ?? series.version } } };
  }
  if (intent.kind === 'delete-series') {
    if (intent.capture.kind !== 'list-command' || status !== 204) return { valid: false };
    const context = intent.capture;
    const series = context.baseSeries;
    if (!series) return { valid: false };
    const changesList: CreatorOwnerReceiptParticipant[] = [
      { entity: 'profile', id: context.baseProfile.id, before: context.baseProfile.version, transition: 'increment', required: true },
    ];
    if (!validateCreatorOwnerReceipts(changes, changesList)) return { valid: false };
    const profile = profileReceipt(changes, context.baseProfile);
    if (!profile) return { valid: false };
    return { valid: true, effect: { kind: 'series-deleted', profileId: context.baseProfile.id, profileVersion: profile.after, seriesId: series.id } };
  }
  if (intent.kind === 'chapter-add' || intent.kind === 'chapter-remove') {
    if (intent.capture.kind !== 'list-command') return { valid: false };
    const context = intent.capture;
    const series = context.baseSeries;
    const placement = context.basePlacement;
    if (!series || !placement) return { valid: false };
    const isAdd = intent.kind === 'chapter-add';
    if (isAdd && status !== 200) return { valid: false };
    if (!isAdd && status !== 204) return { valid: false };
    if (!isAdd) {
      const participants: CreatorOwnerReceiptParticipant[] = [
        { entity: 'profile', id: context.baseProfile.id, before: context.baseProfile.version, transition: 'increment', required: true },
        { entity: 'placement', id: placement.placementId, before: placement.placementVersion ?? 0, transition: 'increment', required: true },
      ];
      if (!validateCreatorOwnerReceipts(changes, participants)) return { valid: false };
      const profile = profileReceipt(changes, context.baseProfile);
      const placementReceipt = changes?.find((change) => change.entity === 'placement' && change.id === placement.placementId);
      if (!profile || !placementReceipt) return { valid: false };
      return { valid: true, effect: { kind: 'chapters-updated', profileId: context.baseProfile.id, profileVersion: profile.after,
        seriesId: series.id, changes: [{ placementId: placement.placementId, membership: null, placementVersion: placementReceipt.after }] } };
    }
    const candidates = responseBody.links;
    if (!Array.isArray(candidates) || !candidates.every(isCreatorLink) || !Number.isSafeInteger(responseBody.profileVersion)
      || responseBody.status !== 200) return { valid: false };
    const unique = new Map<string, CreatorLinkDTO>();
    for (const candidate of candidates) {
      if (unique.has(candidate.placementId) || !observed.links.some(({ placementId }) => placementId === candidate.placementId)) return { valid: false };
      unique.set(candidate.placementId, candidate);
    }
    const allowed: CreatorOwnerReceiptParticipant[] = [
      { entity: 'profile', id: context.baseProfile.id, before: context.baseProfile.version, transition: 'increment' },
      ...[...unique.keys()].flatMap((id) => {
        const link = observed.links.find(({ placementId }) => placementId === id);
        return link && typeof link.placementVersion === 'number'
          ? [{ entity: 'placement' as const, id, before: link.placementVersion, transition: 'increment' as const }]
          : [];
      }),
    ];
    if (!validateCreatorOwnerReceipts(changes, allowed)) return { valid: false };
    const profile = profileReceipt(changes, context.baseProfile);
    const placementReceipts = (changes ?? []).filter(({ entity }) => entity === 'placement');
    if (Boolean(profile) !== (placementReceipts.length > 0)
      || !versionMatches(changes, 'profile', context.baseProfile.id, context.baseProfile.version, responseBody.profileVersion)) return { valid: false };
    const receiptMap = new Map(placementReceipts.map((change) => [change.id, change]));
    for (const candidate of unique.values()) {
      const before = observed.links.find(({ placementId }) => placementId === candidate.placementId);
      const receipt = receiptMap.get(candidate.placementId);
      if (!before || candidate.placementVersion !== (receipt?.after ?? before.placementVersion)
        || !candidate.series.some(({ seriesId }) => seriesId === series.id)) return { valid: false };
    }
    if (!unique.has(placement.placementId)) return { valid: false };
    const changesList = [...receiptMap].map(([placementId, receipt]) => {
      const candidate = unique.get(placementId);
      const membership = candidate?.series.find(({ seriesId }) => seriesId === series.id);
      return { placementId, placementVersion: receipt.after, membership: membership ? { ...membership } : null };
    });
    return { valid: true, effect: { kind: 'chapters-updated', profileId: context.baseProfile.id,
      profileVersion: profile?.after ?? context.baseProfile.version, seriesId: series.id, changes: changesList } };
  }
  if (intent.kind === 'chapter-move') {
    if (intent.capture.kind !== 'move-chapter' || status !== 200) return { valid: false };
    const editor = intent.capture;
    const candidates = responseBody.links;
    if (!Array.isArray(candidates) || !candidates.every(isCreatorLink)) return { valid: false };
    const byId = new Map<string, CreatorLinkDTO>();
    for (const candidate of candidates) {
      if (byId.has(candidate.placementId) || !editor.baseOrder.includes(candidate.placementId)) return { valid: false };
      byId.set(candidate.placementId, candidate);
    }
    if (!byId.has(editor.placementId)) return { valid: false };
    const allowed: CreatorOwnerReceiptParticipant[] = [
      { entity: 'profile', id: editor.baseProfile.id, before: editor.baseProfile.version, transition: 'increment' },
      ...[...byId.keys()].flatMap((id) => {
        const link = observed.links.find(({ placementId }) => placementId === id);
        return link && typeof link.placementVersion === 'number'
          ? [{ entity: 'placement' as const, id, before: link.placementVersion, transition: 'increment' as const }]
          : [];
      }),
    ];
    if (!validateCreatorOwnerReceipts(changes, allowed)) return { valid: false };
    const profile = profileReceipt(changes, editor.baseProfile);
    const placementReceipts = (changes ?? []).filter(({ entity }) => entity === 'placement');
    if (Boolean(profile) !== (placementReceipts.length > 0)) return { valid: false };
    const currentOrder = creatorOwnerChapterOrder(observed.links, editor.seriesId);
    const positions = new Map(currentOrder.map((link) => [link.placementId,
      link.series.find(({ seriesId }) => seriesId === editor.seriesId)?.position ?? 0]));
    const receiptById = new Map(placementReceipts.map((item) => [item.id, item]));
    for (const candidate of byId.values()) {
      const before = observed.links.find(({ placementId }) => placementId === candidate.placementId);
      const membership = candidate.series.find(({ seriesId }) => seriesId === editor.seriesId);
      const receipt = receiptById.get(candidate.placementId);
      if (!before || !membership || !Number.isSafeInteger(membership.position) || membership.position < 0
        || candidate.placementVersion !== (receipt?.after ?? before.placementVersion)) return { valid: false };
      positions.set(candidate.placementId, membership.position);
    }
    const resultingOrdinal = [...positions.entries()].sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
      .findIndex(([id]) => id === editor.placementId) + 1;
    if (resultingOrdinal !== Number(editor.targetPosition)) return { valid: false };
    const effectChanges = [...receiptById].map(([placementId, receipt]) => ({
      placementId,
      position: byId.get(placementId)?.series.find(({ seriesId }) => seriesId === editor.seriesId)?.position ?? 0,
      placementVersion: receipt.after,
    }));
    return { valid: true, effect: { kind: 'chapter-moved', profileId: editor.baseProfile.id, profileVersion: profile?.after ?? editor.baseProfile.version,
      seriesId: editor.seriesId, changes: effectChanges } };
  }
  return { valid: false };
}

export async function interpretCreatorOwnerResponse(
  response: Response,
  intent: CreatorOwnerWriteIntent,
  observed: CreatorEditorDTO,
): Promise<CreatorOwnerCommandOutcome> {
  const payload = await responseObject(response);
  const recoveryReason = creatorSessionRecoveryReason(response.status, await readCreatorSessionResponse(response));
  if (recoveryReason) return { kind: 'session', reason: recoveryReason, message: recoveryReason === 'expired'
    ? 'La sesión terminó. Ingresa con la misma cuenta en otra pestaña y comprueba la sesión antes de volver a guardar.'
    : 'La sesión cambió. Comprueba la sesión antes de volver a intentar; conservamos tus cambios.' };
  if (!response.ok) {
    const code = payload?.error;
    if (response.status === 503 && code === 'ORDER_MOVE_CALCULATION_UNAVAILABLE') {
      return { kind: 'rejected', message: errorMessage(code, response.status, intent), code: String(code) };
    }
    if (response.status === 422 && code === 'ORDER_MOVE_LIMIT') {
      return { kind: 'rejected', message: errorMessage(code, response.status, intent), code: String(code),
        ...(Number.isSafeInteger(payload?.viablePosition) ? { viablePosition: Number(payload?.viablePosition) } : {}) };
    }
    if (response.status === 409 && code !== 'SLUG_TAKEN' && code !== 'SERIES_SLUG_TAKEN') {
      return { kind: 'conflict', message: 'El estado guardado cambió desde que abriste esta edición. Comprueba lo guardado antes de decidir cómo seguir.' };
    }
    if (response.status === 408 || response.status >= 500) {
      return { kind: 'uncertain', message: 'No pudimos confirmar el resultado. Comprueba lo guardado antes de volver a intentar; no repetiremos la escritura.' };
    }
    return { kind: 'rejected', message: errorMessage(code, response.status, intent), ...(typeof code === 'string' ? { code } : {}) };
  }
  const changes = await readCreatorVersionChanges(response);
  if (!payload && response.status !== 204) return { kind: 'uncertain', message: 'La respuesta no se pudo comprobar. Comprueba el estado guardado antes de volver a intentar.' };
  const result = commandParticipants(response.status, intent, payload ?? {}, changes, observed);
  if (!result.valid || !result.effect) return { kind: 'uncertain', message: 'La respuesta no coincide con los datos y recibos de esta acción. Comprueba lo guardado antes de continuar.' };
  return { kind: 'confirmed', effect: result.effect };
}

export async function interpretCreatorOwnerPhotoFinalize(
  response: Response,
  intent: CreatorOwnerWriteIntent,
  uploadId: string,
): Promise<CreatorOwnerCommandOutcome> {
  const payload = await responseObject(response);
  const recoveryReason = creatorSessionRecoveryReason(response.status, await readCreatorSessionResponse(response));
  if (recoveryReason) return { kind: 'session', reason: recoveryReason, message: recoveryReason === 'expired'
    ? 'La sesión terminó. Ingresa con la misma cuenta en otra pestaña y comprueba la sesión antes de volver a guardar.'
    : 'La sesión cambió. Comprueba la sesión antes de volver a intentar; conservamos el archivo elegido.' };
  if (!response.ok) {
    if (response.status === 409) return { kind: 'conflict', message: 'El perfil cambió mientras se guardaba la foto. Comprueba cuál quedó activa antes de volver a cargar.' };
    if (response.status === 408 || response.status >= 500) return { kind: 'uncertain', message: 'No pudimos confirmar si la foto se guardó. Comprueba cuál quedó activa antes de volver a cargar.' };
    return { kind: 'rejected', message: errorMessage(payload?.error, response.status, intent), ...(typeof payload?.error === 'string' ? { code: payload.error } : {}) };
  }
  if (intent.capture.kind !== 'photo' || response.status !== 200 || !payload) {
    return { kind: 'uncertain', message: 'La respuesta no confirmó la foto guardada. Comprueba cuál quedó activa antes de volver a cargar.' };
  }
  const photo = payload.photo;
  if (typeof photo !== 'object' || photo === null || Array.isArray(photo)
    || (typeof (photo as Record<string, unknown>).version !== 'string'
      && !(typeof (photo as Record<string, unknown>).version === 'number' && Number.isSafeInteger((photo as Record<string, unknown>).version)))) {
    return { kind: 'uncertain', message: 'La respuesta no contiene una versión de foto válida. Comprueba cuál quedó activa antes de volver a cargar.' };
  }
  const version = (photo as Record<string, unknown>).version;
  if (String(version) !== uploadId) return { kind: 'uncertain', message: 'La respuesta de la foto no coincide con la carga iniciada. Comprueba cuál quedó activa antes de volver a cargar.' };
  const changes = await readCreatorVersionChanges(response);
  const profile = intent.capture.base;
  const participants: CreatorOwnerReceiptParticipant[] = [
    { entity: 'profile', id: profile.id, before: profile.version, transition: 'increment', required: true },
  ];
  if (!validateCreatorOwnerReceipts(changes, participants)) return { kind: 'uncertain', message: 'El recibo de la foto no coincide con la versión del perfil. Comprueba cuál quedó activa antes de volver a cargar.' };
  const receipt = changes?.find((change) => change.entity === 'profile' && change.id === profile.id);
  if (!receipt) return { kind: 'uncertain', message: 'Falta el recibo de versión de la foto. Comprueba cuál quedó activa antes de volver a cargar.' };
  return { kind: 'confirmed', effect: { kind: 'photo-updated', profileId: profile.id, profileVersion: receipt.after,
    photo: { version: version as string | number, ...(typeof (photo as Record<string, unknown>).url === 'string' ? { url: (photo as Record<string, unknown>).url as string } : {}) } } };
}

function compareLabel(intent: CreatorOwnerWriteIntent, foundSeries: CreatorSeriesDTO | undefined, snapshot: CreatorEditorDTO): string {
  if (intent.kind === 'save-series' && intent.capture.kind === 'series') {
    if (!intent.capture.baseSeries && foundSeries) return 'La serie creada coincide con la dirección enviada. Puedes continuar con el contenido guardado.';
    if (!foundSeries) return 'No encontramos una serie activa con la dirección original; pudo cambiar de dirección o eliminarse. No usamos aliases ni otras coincidencias para identificar el alta.';
    return `Serie guardada: ${foundSeries.name} · ${foundSeries.slug}. Tu corrección sigue en el editor.`;
  }
  if (intent.kind === 'photo') return 'Comprobamos la foto guardada. Confirma el resultado y conserva cualquier archivo nuevo elegido.';
  if (intent.kind === 'delete-series' || intent.kind === 'chapter-add' || intent.kind === 'chapter-remove') {
    return `La lista guardada tiene ${snapshot.series.length} series y ${snapshot.links.length} enlaces. Revisa el estado antes de iniciar otra acción.`;
  }
  if (intent.kind === 'publish') return `Estado guardado: ${snapshot.profile?.published ? 'publicada' : 'borrador'}${snapshot.profile?.hidden ? ' y oculta por administración' : ''}.`;
  return 'Compara los datos guardados con tu corrección y elige expresamente qué versión usar.';
}

export function createCreatorOwnerComparison(
  intent: CreatorOwnerWriteIntent,
  snapshot: CreatorEditorDTO,
  currentEditor?: CreatorOwnerEditor,
): CreatorOwnerComparison {
  const originalProfile = captureProfile(intent);
  const profileMatches = originalProfile ? snapshot.profile?.id === originalProfile.id : snapshot.profile !== null;
  let seriesId: string | undefined;
  let canAdopt = profileMatches;
  let message: string | undefined;
  if (intent.kind === 'save-series' && intent.capture.kind === 'series') {
    const capture = intent.capture;
    const matches = capture.baseSeries
      ? snapshot.series.filter(({ id }) => id === capture.baseSeries?.id)
      : snapshot.series.filter(({ slug }) => slug === normalizeCreatorText(capture.draft.slug));
    if (matches.length === 1) seriesId = matches[0].id;
    if (!capture.baseSeries && matches.length === 0 && snapshot.profile?.version === capture.baseProfile.version) {
      canAdopt = profileMatches;
      message = `No hay una serie activa con la dirección original «${normalizeCreatorText(capture.draft.slug)}»; pudo cambiar de dirección o eliminarse. El perfil conserva la versión ${snapshot.profile.version}; no usamos aliases para identificar el alta. Puedes adoptar esta base y volver a intentarlo manualmente.`;
    } else {
      canAdopt = profileMatches && matches.length === 1;
      if (!capture.baseSeries && matches.length !== 1) {
        message = `No encontramos una serie activa con la dirección original «${normalizeCreatorText(capture.draft.slug)}»; pudo cambiar de dirección o eliminarse. No usamos aliases ni otras coincidencias para identificar el alta.`;
      }
    }
  }
  if (intent.kind === 'create-profile') canAdopt = profileMatches && snapshot.profile !== null;
  if (intent.kind === 'chapter-move' && intent.capture.kind === 'move-chapter') {
    const item = intent.capture;
    canAdopt = profileMatches && snapshot.series.some(({ id }) => id === item.seriesId)
      && snapshot.links.some((link) => link.placementId === item.placementId && link.series.some(({ seriesId: id }) => id === item.seriesId));
  }
  return {
    id: `${intent.id}:compare`,
    editorKey: intent.editorKey,
    snapshot,
    ...(currentEditor ? { draftAtCompare: currentEditor } : {}),
    ...(seriesId ? { seriesId } : {}),
    canAdopt,
    message: message ?? compareLabel(intent, seriesId ? snapshot.series.find(({ id }) => id === seriesId) : undefined, snapshot),
  };
}

export function isCreatorOwnerWriteCapture(value: unknown): value is CreatorOwnerEditor | CreatorOwnerListContext {
  return Boolean(value && typeof value === 'object' && 'kind' in value);
}

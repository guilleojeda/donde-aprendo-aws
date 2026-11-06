import type {
  CreatorEditorDTO,
  CreatorEditableResourceDTO,
  CreatorLinkDTO,
  CreatorProfileDTO,
  CreatorSeriesDTO,
  CreatorSocial,
} from '../types/creators';
import { normalizeCreatorText } from './creator-values.mjs';
import { isCreatorClaim, isCreatorLink, isEditableResource, isCreatorSeries, isProfile, isSafeClaimUrl } from './creator-owner-data';
import {
  readCreatorVersionChanges,
  validateCreatorOwnerReceipts,
  type CreatorOwnerReceiptParticipant,
} from '../scripts/creator-write-state';
import {
  classifyCreatorSessionCheck,
  creatorSessionRecoveryReason,
} from './creator-session-response';
import {
  type CreatorOwnerComparison,
  type CreatorOwnerEffect,
  type CreatorOwnerEditor,
  type CreatorOwnerListContext,
  type CreatorOwnerLinkEditor,
  type CreatorOwnerWriteIntent,
} from './creator-owner-state';
import { parseCreatorOwnerClaimUrls } from './creator-owner-catalog';
import { creatorOwnerChapterOrder } from './creator-owner-series';
import { creatorOwnerLinkGroup } from './creator-owner-links';

export type CreatorOwnerRequestPath = `/api/creador/${string}/` | `/api/creador/recursos/?id=${'.' | '..'}`;

export interface CreatorOwnerRequest {
  path: CreatorOwnerRequestPath;
  method: 'PUT' | 'POST' | 'PATCH' | 'DELETE';
  body: Record<string, unknown>;
}

export type CreatorOwnerCommandOutcome =
  | { kind: 'confirmed'; effect: CreatorOwnerEffect }
  | { kind: 'uncertain'; message: string; code?: string }
  | { kind: 'conflict'; message: string; code?: string }
  | { kind: 'rejected'; message: string; code?: string; viablePosition?: number }
  | { kind: 'session'; reason: 'expired' | 'csrf' | 'different-principal'; message: string }
  | { kind: 'session-blocked'; reason: 'disabled' | 'invalid-context'; message: string };

export type CreatorOwnerSessionOutcome = Extract<CreatorOwnerCommandOutcome, { kind: 'session' | 'session-blocked' }>;

export function creatorOwnerWriteIntent(id: string, capture: CreatorOwnerEditor | CreatorOwnerLinkEditor | CreatorOwnerListContext): CreatorOwnerWriteIntent {
  const kind: CreatorOwnerWriteIntent['kind'] = capture.kind === 'list-command'
    ? capture.operation
    : capture.kind === 'create-profile' ? 'create-profile'
      : capture.kind === 'profile' ? 'save-profile'
        : capture.kind === 'photo' ? 'photo'
          : capture.kind === 'series' ? 'save-series'
            : capture.kind === 'move-chapter' ? 'chapter-move'
              : capture.kind === 'link-placement' || capture.kind === 'link-resource' ? 'save-link'
                : capture.kind === 'add-link' ? 'add-link'
                  : capture.kind === 'move-link' ? 'move-link'
                    : capture.kind === 'reference' ? 'reference' : 'claim';
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
  if (intent.kind === 'save-link') {
    if (capture.kind === 'link-placement') {
      const current = capture.baseLink;
      const body: Record<string, unknown> = {
        profileVersion: capture.baseProfile.version,
        placementVersion: current.placementVersion,
        resourceVersion: current.resourceVersion,
        featured: capture.draft.featured,
        selectedForDirectory: capture.draft.selectedForDirectory,
      };
      if (capture.editable) {
        if (normalizeCreatorText(capture.draft.title) !== current.title) body.title = normalizeCreatorText(capture.draft.title);
        if (normalizeCreatorText(capture.draft.url) !== current.url) body.url = normalizeCreatorText(capture.draft.url);
        if (normalizeCreatorText(capture.draft.description) !== (current.description ?? '')) body.description = normalizeCreatorText(capture.draft.description);
      }
      return { path: `/api/creador/enlaces/${encodeURIComponent(current.placementId)}/editar/`, method: 'PATCH', body };
    }
    if (capture.kind === 'link-resource') {
      const body: Record<string, unknown> = { version: capture.baseResource.version,
        title: normalizeCreatorText(capture.draft.title), url: normalizeCreatorText(capture.draft.url) };
      if (normalizeCreatorText(capture.draft.description) !== (capture.baseResource.description ?? '')) body.description = normalizeCreatorText(capture.draft.description);
      const resourceId = capture.baseResource.id;
      const path: CreatorOwnerRequest['path'] = resourceId === '.'
        ? '/api/creador/recursos/?id=.'
        : resourceId === '..'
          ? '/api/creador/recursos/?id=..'
          : `/api/creador/recursos/${encodeURIComponent(resourceId)}/`;
      return { path, method: 'PATCH', body };
    }
    throw new TypeError('La edición del enlace no contiene su colocación o ficha base.');
  }
  if (intent.kind === 'add-link') {
    if (capture.kind !== 'add-link') throw new TypeError('El alta del enlace no contiene su borrador.');
    return { path: '/api/creador/enlaces/', method: 'POST', body: {
      title: normalizeCreatorText(capture.draft.title), url: normalizeCreatorText(capture.draft.url),
      description: normalizeCreatorText(capture.draft.description), selectedForDirectory: capture.draft.selectedForDirectory,
    } };
  }
  if (intent.kind === 'move-link') {
    if (capture.kind !== 'move-link') throw new TypeError('El movimiento no contiene su enlace observado.');
    return { path: `/api/creador/enlaces/${encodeURIComponent(capture.baseLink.placementId)}/mover/`, method: 'POST', body: {
      profileVersion: capture.baseProfile.version, placementVersion: capture.baseLink.placementVersion,
      targetPosition: Number(capture.targetPosition),
    } };
  }
  if (intent.kind === 'remove-link') {
    if (capture.kind !== 'list-command' || !capture.basePlacement) throw new TypeError('Quitar el enlace no contiene su colocación observada.');
    return { path: `/api/creador/enlaces/${encodeURIComponent(capture.basePlacement.placementId)}/`, method: 'DELETE', body: { profileVersion: capture.baseProfile.version } };
  }
  if (intent.kind === 'reinclude-resource') {
    if (capture.kind !== 'list-command' || !capture.baseResource) throw new TypeError('Reincorporar el enlace no contiene su ficha observada.');
    return { path: '/api/creador/enlaces/', method: 'POST', body: { resourceId: capture.baseResource.id, resourceVersion: capture.baseResource.version } };
  }
  if (intent.kind === 'reference') {
    if (capture.kind !== 'reference' || !capture.selected) throw new TypeError('La referencia no contiene una ficha del catálogo seleccionada.');
    return { path: '/api/creador/referencias/', method: 'POST', body: {
      resourceId: capture.selected.id, url: capture.selected.url, profileVersion: capture.baseProfile.version,
      selectedForDirectory: capture.selectedForDirectory,
    } };
  }
  if (intent.kind === 'claim') {
    if (capture.kind !== 'claim') throw new TypeError('La solicitud no contiene su selección.');
    const urls = parseCreatorOwnerClaimUrls(capture.knownUrls);
    if (!urls) throw new TypeError('Cada URL debe ser HTTP o HTTPS completa, sin usuario ni contraseña.');
    const resources = [...capture.selected.map(({ resourceId, url }) => ({ resourceId, url })), ...urls.map((url) => ({ url }))];
    if (!resources.length) throw new TypeError('Selecciona una ficha o agrega al menos una URL conocida.');
    if (capture.evidence.length > 2000) throw new TypeError('El contexto privado admite hasta 2000 caracteres.');
    const evidence = normalizeCreatorText(capture.evidence);
    return { path: '/api/creador/reclamaciones/', method: 'POST', body: { resources, ...(evidence ? { evidence } : {}) } };
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
  if (code === 'URL_COLLISION') return 'Esta URL necesita revisión antes de poder agregarse. Conservamos el formulario.';
  if (code === 'RESOURCE_EDIT_FORBIDDEN') return 'Esta ficha compartida no se puede editar desde tu página. Conservamos los cambios de opciones.';
  if (code === 'CLAIM_TOO_LARGE') return 'La solicitud supera el tamaño permitido. Reduce el texto o las URLs y vuelve a intentarlo.';
  if (status === 404 && intent.kind === 'chapter-add') return 'El enlace o la serie ya no está disponible. Comprueba la lista antes de continuar.';
  if (status === 422) return 'Revisa los datos: el servicio no acepta alguno de ellos. Tus cambios siguen aquí.';
  if (status === 403) return 'Esta cuenta no tiene permiso para completar esta acción. Tus cambios siguen aquí.';
  return 'No pudimos completar la acción. Tus cambios siguen aquí; revisa la información e inténtalo de nuevo.';
}

export function classifyCreatorOwnerWriteSessionFailure(
  status: number,
  payload: Record<string, unknown> | null,
  retained: 'draft' | 'photo',
): CreatorOwnerSessionOutcome | undefined {
  const preserved = retained === 'photo' ? 'conservamos el archivo elegido' : 'conservamos tus cambios';
  const recoveryReason = creatorSessionRecoveryReason(status, payload);
  if (recoveryReason) return { kind: 'session', reason: recoveryReason, message: recoveryReason === 'expired'
    ? `La sesión terminó. Ingresa con la misma cuenta en otra pestaña y comprueba la sesión antes de volver a guardar; ${preserved}.`
    : `La sesión cambió. Comprueba la sesión antes de volver a intentar; ${preserved}.` };
  const sessionCheck = classifyCreatorSessionCheck(status, payload);
  if (sessionCheck.state === 'context-changed') return { kind: 'session', reason: 'different-principal',
    message: retained === 'photo'
      ? 'La cuenta o el rol activo no coincide con esta página. Comprueba la sesión; conservamos el archivo elegido.'
      : 'La cuenta o el rol activo no coincide con esta página. Comprueba la sesión; conservamos tus cambios.' };
  if (sessionCheck.state === 'disabled') return { kind: 'session-blocked', reason: 'disabled',
    message: retained === 'photo' ? 'Esta cuenta está desactivada. Conservamos el archivo elegido.' : 'Esta cuenta está desactivada. Conservamos tus cambios.' };
  if (sessionCheck.state === 'invalid-context') return { kind: 'session-blocked', reason: 'invalid-context',
    message: retained === 'photo'
      ? 'El contexto de esta página no es válido. Conservamos el archivo elegido; abre una página nueva con la cuenta original.'
      : 'El contexto de esta página no es válido. Conservamos tus cambios; abre una página nueva con la cuenta original.' };
  return undefined;
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
  if (intent.capture.kind === 'link-resource') return null;
  if (intent.capture.kind === 'move-chapter' || intent.capture.kind === 'link-placement'
    || intent.capture.kind === 'add-link' || intent.capture.kind === 'move-link' || intent.capture.kind === 'reference'
    || intent.capture.kind === 'claim') return intent.capture.baseProfile;
  return null;
}

function requestBody(intent: CreatorOwnerWriteIntent): Record<string, unknown> {
  return prepareCreatorOwnerRequest(intent).body;
}

function resourceFieldsMatch(link: CreatorLinkDTO, prior: CreatorLinkDTO | CreatorEditableResourceDTO): boolean {
  return link.title === prior.title && link.url === prior.url
    && Object.hasOwn(link, 'description') === Object.hasOwn(prior, 'description')
    && link.description === prior.description;
}

function canonicalResourceMatchesObservation(link: CreatorLinkDTO, prior: CreatorEditableResourceDTO): boolean {
  return link.resourceVersion > prior.version || (link.resourceVersion === prior.version && resourceFieldsMatch(link, prior));
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
  if (intent.kind === 'save-link') {
    if (intent.capture.kind === 'link-resource') {
      const editor = intent.capture;
      const resource = responseBody.resource;
      const body = requestBody(intent);
      const descriptionChanged = Object.hasOwn(body, 'description');
      const expectedDescriptionPresent = descriptionChanged || Object.hasOwn(editor.baseResource, 'description');
      const expectedDescription = descriptionChanged ? body.description : editor.baseResource.description;
      if (status !== 200 || !isEditableResource(resource) || resource.id !== editor.baseResource.id
        || resource.title !== body.title || resource.url !== body.url
        || Object.hasOwn(resource, 'description') !== expectedDescriptionPresent || resource.description !== expectedDescription) return { valid: false };
      const changed = resource.title !== editor.baseResource.title || resource.url !== editor.baseResource.url
        || Object.hasOwn(resource, 'description') !== Object.hasOwn(editor.baseResource, 'description')
        || resource.description !== editor.baseResource.description;
      const participants: CreatorOwnerReceiptParticipant[] = [
        { entity: 'resource', id: editor.baseResource.id, before: editor.baseResource.version, transition: 'increment', required: changed },
      ];
      if (!validateCreatorOwnerReceipts(changes, participants)) return { valid: false };
      const receipt = changes?.find(({ entity, id }) => entity === 'resource' && id === editor.baseResource.id);
      if (resource.version !== (receipt?.after ?? editor.baseResource.version) || Boolean(receipt) !== changed) return { valid: false };
      return { valid: true, effect: { kind: 'resource-updated', resource: { ...resource } } };
    }
    if (intent.capture.kind !== 'link-placement') return { valid: false };
    const editor = intent.capture;
    const current = editor.baseLink;
    const link = responseBody.link;
    const body = requestBody(intent);
    if (status !== 200 || !isCreatorLink(link) || link.placementId !== current.placementId || link.resourceId !== current.resourceId) return { valid: false };
    const expectedTitle = Object.hasOwn(body, 'title') ? body.title : current.title;
    const expectedUrl = Object.hasOwn(body, 'url') ? body.url : current.url;
    const expectedDescriptionPresent = Object.hasOwn(body, 'description') || Object.hasOwn(current, 'description');
    const expectedDescription = Object.hasOwn(body, 'description') ? body.description : current.description;
    if (link.title !== expectedTitle || link.url !== expectedUrl
      || Object.hasOwn(link, 'description') !== expectedDescriptionPresent || link.description !== expectedDescription
      || link.featured !== editor.draft.featured || link.selectedForDirectory !== editor.draft.selectedForDirectory
      || link.resourceVersion < 0 || link.position !== current.position || link.hidden !== current.hidden
      || link.directoryApproval !== current.directoryApproval || JSON.stringify(link.series) !== JSON.stringify(current.series)) return { valid: false };
    const metadataChanged = Object.hasOwn(body, 'title') || Object.hasOwn(body, 'url') || Object.hasOwn(body, 'description');
    const placementChanged = editor.draft.featured !== current.featured || editor.draft.selectedForDirectory !== current.selectedForDirectory;
    const participants: CreatorOwnerReceiptParticipant[] = [
      { entity: 'profile', id: editor.baseProfile.id, before: editor.baseProfile.version, transition: 'increment' },
      { entity: 'placement', id: current.placementId, before: current.placementVersion ?? 0, transition: 'increment', required: placementChanged },
      ...(editor.editable ? [{ entity: 'resource' as const, id: current.resourceId, before: current.resourceVersion, transition: 'increment' as const, required: metadataChanged }] : []),
    ];
    if (!validateCreatorOwnerReceipts(changes, participants)) return { valid: false };
    const profile = profileReceipt(changes, editor.baseProfile);
    const placement = changes?.find(({ entity, id }) => entity === 'placement' && id === current.placementId);
    const resource = changes?.find(({ entity, id }) => entity === 'resource' && id === current.resourceId);
    const anyChange = Boolean(placement || resource);
    if (Boolean(profile) !== anyChange || link.placementVersion !== (placement?.after ?? current.placementVersion)
      || link.resourceVersion !== (resource?.after ?? current.resourceVersion)
      || (placement ? !placementChanged : placementChanged)
      || (resource ? !metadataChanged : metadataChanged)) return { valid: false };
    const editableResource: CreatorEditableResourceDTO | undefined = editor.editable
      ? { id: link.resourceId, title: link.title, url: link.url, ...(Object.hasOwn(link, 'description') ? { description: link.description } : {}), version: link.resourceVersion }
      : undefined;
    return { valid: true, effect: { kind: 'link-updated', profileId: editor.baseProfile.id,
      profileVersion: profile?.after ?? editor.baseProfile.version, link: { ...link }, ...(editableResource ? { resource: editableResource } : {}) } };
  }
  if (intent.kind === 'add-link' || intent.kind === 'reference' || intent.kind === 'reinclude-resource') {
    const add = intent.kind === 'add-link';
    const reference = intent.kind === 'reference';
    const capture = intent.capture;
    const profile = capture.kind === 'list-command' ? capture.baseProfile
      : capture.kind === 'add-link' || capture.kind === 'reference' ? capture.baseProfile : undefined;
    if (!profile) return { valid: false };
    const link = responseBody.link;
    if (!isCreatorLink(link) || (Object.hasOwn(link, 'description') && typeof link.description !== 'string')) return { valid: false };
    const created = responseBody.created;
    const editableObservation = observed.editableResources.find(({ id }) => id === link.resourceId);
    if (created === false) {
      if (status !== 200 || !validateCreatorOwnerReceipts(changes, [])) return { valid: false };
      const matchesTarget = capture.kind === 'add-link' ? link.url === requestBody(intent).url
        : capture.kind === 'reference' && capture.selected?.id === link.resourceId && capture.selected.url === link.url;
      if (!matchesTarget) return { valid: false };
      const existing = observed.links.find(({ placementId }) => placementId === link.placementId);
      if (!existing || existing.resourceId !== link.resourceId || link.placementVersion !== existing.placementVersion
        || link.position !== existing.position || link.featured !== existing.featured
        || link.selectedForDirectory !== existing.selectedForDirectory
        || JSON.stringify(link.series) !== JSON.stringify(existing.series)
        || link.resourceVersion < existing.resourceVersion) return { valid: false };
      if (link.resourceVersion === existing.resourceVersion && (!resourceFieldsMatch(link, existing)
        || link.hidden !== existing.hidden || link.directoryApproval !== existing.directoryApproval)) return { valid: false };
      if (editableObservation && !canonicalResourceMatchesObservation(link, editableObservation)) return { valid: false };
      return { valid: true, effect: { kind: 'link-added', profileId: profile.id, profileVersion: profile.version,
        link: { ...link }, source: reference ? 'reference' : 'url', created: false } };
    }
    if (created !== true || status !== 201 || observed.links.some(({ placementId, resourceId }) =>
      placementId === link.placementId || resourceId === link.resourceId)) return { valid: false };
    let resourceWasCreated = false;
    if (add && capture.kind === 'add-link') {
      const body = requestBody(intent);
      if (link.url !== body.url || link.featured || link.selectedForDirectory !== capture.draft.selectedForDirectory || link.series.length !== 0 || link.position < 0) return { valid: false };
      resourceWasCreated = changes?.some(({ entity, id }) => entity === 'resource' && id === link.resourceId) ?? false;
      if (resourceWasCreated && (editableObservation || link.title !== body.title || link.url !== body.url
        || !Object.hasOwn(link, 'description') || link.description !== body.description)) return { valid: false };
    } else if (reference && capture.kind === 'reference' && capture.selected) {
      if (link.resourceId !== capture.selected.id || link.url !== capture.selected.url || link.featured
        || link.selectedForDirectory !== capture.selectedForDirectory || link.series.length !== 0 || link.position < 0) return { valid: false };
    } else if (intent.kind === 'reinclude-resource' && capture.kind === 'list-command' && capture.baseResource) {
      const resource = capture.baseResource;
      if (link.resourceId !== resource.id || link.title !== resource.title || link.url !== resource.url
        || Object.hasOwn(link, 'description') !== Object.hasOwn(resource, 'description') || link.description !== resource.description
        || link.resourceVersion !== resource.version || link.featured || !link.selectedForDirectory || link.series.length !== 0 || link.position < 0) return { valid: false };
    } else return { valid: false };
    if (editableObservation && !canonicalResourceMatchesObservation(link, editableObservation)) return { valid: false };
    const participants: CreatorOwnerReceiptParticipant[] = [
      { entity: 'profile', id: profile.id, before: profile.version, transition: 'increment', required: true },
      { entity: 'placement', id: link.placementId, before: 0, transition: 'created', required: true },
      ...(resourceWasCreated ? [{ entity: 'resource' as const, id: link.resourceId, before: 0, transition: 'created-one' as const }] : []),
    ];
    if (!validateCreatorOwnerReceipts(changes, participants)) return { valid: false };
    const profileChange = profileReceipt(changes, profile);
    const placementChange = changes?.find(({ entity, id }) => entity === 'placement' && id === link.placementId);
    const resourceChange = changes?.find(({ entity, id }) => entity === 'resource' && id === link.resourceId);
    if (!profileChange || !placementChange || link.placementVersion !== placementChange.after
      || placementChange.after !== profileChange.after || Boolean(resourceChange) !== resourceWasCreated
      || (resourceChange && link.resourceVersion !== resourceChange.after)) return { valid: false };
    const resource = resourceWasCreated ? { id: link.resourceId, title: link.title, url: link.url,
      ...(Object.hasOwn(link, 'description') ? { description: link.description } : {}), version: link.resourceVersion } : undefined;
    return { valid: true, effect: { kind: 'link-added', profileId: profile.id, profileVersion: profileChange.after,
      link: { ...link }, source: add ? 'url' : reference ? 'reference' : 'reinclude', created: true, ...(resource ? { resource } : {}) } };
  }
  if (intent.kind === 'remove-link') {
    const context = intent.capture;
    if (context.kind !== 'list-command' || status !== 204) return { valid: false };
    const placement = context.basePlacement;
    if (!placement) return { valid: false };
    const participants: CreatorOwnerReceiptParticipant[] = [
      { entity: 'profile', id: context.baseProfile.id, before: context.baseProfile.version, transition: 'increment', required: true },
    ];
    if (!validateCreatorOwnerReceipts(changes, participants)) return { valid: false };
    const profile = profileReceipt(changes, context.baseProfile);
    return profile ? { valid: true, effect: { kind: 'link-removed', profileId: context.baseProfile.id,
      profileVersion: profile.after, placementId: placement.placementId } } : { valid: false };
  }
  if (intent.kind === 'move-link') {
    if (intent.capture.kind !== 'move-link' || status !== 200 || !Array.isArray(responseBody.links)
      || !responseBody.links.every(isCreatorLink)) return { valid: false };
    const editor = intent.capture;
    const groupIds = new Set(editor.baseOrder);
    const candidates = responseBody.links as CreatorLinkDTO[];
    const byId = new Map(candidates.map((link) => [link.placementId, link]));
    // The service returns the target and changed placements, not the whole order group.
    if (byId.size !== candidates.length || !byId.has(editor.baseLink.placementId)
      || candidates.some(({ placementId }) => !groupIds.has(placementId))) return { valid: false };
    const placementParticipants = candidates.flatMap((candidate) => {
      const prior = observed.links.find(({ placementId }) => placementId === candidate.placementId);
      return prior && typeof prior.placementVersion === 'number'
        ? [{ entity: 'placement' as const, id: prior.placementId, before: prior.placementVersion, transition: 'increment' as const }]
        : [];
    });
    if (placementParticipants.length !== candidates.length) return { valid: false };
    const participants: CreatorOwnerReceiptParticipant[] = [
      { entity: 'profile', id: editor.baseProfile.id, before: editor.baseProfile.version, transition: 'increment' },
      ...placementParticipants,
    ];
    if (!validateCreatorOwnerReceipts(changes, participants)) return { valid: false };
    const profile = profileReceipt(changes, editor.baseProfile);
    const placementChanges = changes?.filter(({ entity }) => entity === 'placement') ?? [];
    if (Boolean(profile) !== (placementChanges.length > 0)) return { valid: false };
    const savedPositions = new Map(creatorOwnerLinkGroup(observed.links, editor.baseLink.featured).map((link) => [link.placementId, link.position]));
    for (const candidate of candidates) {
      const prior = observed.links.find(({ placementId }) => placementId === candidate.placementId);
      const receipt = placementChanges.find(({ id }) => id === candidate.placementId);
      if (!prior || candidate.resourceId !== prior.resourceId || candidate.featured !== prior.featured
        || candidate.selectedForDirectory !== prior.selectedForDirectory
        || JSON.stringify(candidate.series) !== JSON.stringify(prior.series)
        || candidate.position < 0 || !Number.isSafeInteger(candidate.position)
        || candidate.placementVersion !== (receipt?.after ?? prior.placementVersion)
        || (candidate.position !== prior.position) !== Boolean(receipt)) return { valid: false };
      savedPositions.set(candidate.placementId, candidate.position);
    }
    const resultingOrder = [...savedPositions.entries()].sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]));
    const currentOrder = [...editor.baseOrder];
    const oldIndex = currentOrder.indexOf(editor.baseLink.placementId);
    const targetPosition = Number(editor.targetPosition);
    if (oldIndex < 0 || !Number.isSafeInteger(targetPosition) || targetPosition < 1 || targetPosition > currentOrder.length) return { valid: false };
    currentOrder.splice(oldIndex, 1);
    currentOrder.splice(targetPosition - 1, 0, editor.baseLink.placementId);
    if (JSON.stringify(resultingOrder.map(([id]) => id)) !== JSON.stringify(currentOrder)) return { valid: false };
    return { valid: true, effect: { kind: 'link-moved', profileId: editor.baseProfile.id,
      profileVersion: profile?.after ?? editor.baseProfile.version,
      changes: candidates.map(({ placementId, position, placementVersion }) => ({ placementId, position, placementVersion: placementVersion ?? 0 })) } };
  }
  if (intent.kind === 'claim') {
    if (intent.capture.kind !== 'claim' || status !== 202 || !responseBody.claim || !validateCreatorOwnerReceipts(changes, [])) return { valid: false };
    const claim = responseBody.claim;
    const body = requestBody(intent);
    const submitted = body.resources;
    if (!Array.isArray(submitted) || !isCreatorClaim(claim) || !Array.isArray(claim.resources)
      || Object.keys(responseBody).sort().join(',') !== 'claim,versionChanges'
      || claim.status !== 'pending' || typeof claim.createdAt !== 'number' || !Number.isFinite(claim.createdAt)
      || claim.createdAt <= 0
      || claim.sourceId !== undefined || (Object.hasOwn(body, 'evidence') ? claim.evidence !== body.evidence : claim.evidence !== undefined)
      || claim.resources.length !== claim.resourceIds.length || new Set(claim.resourceIds).size !== claim.resourceIds.length
      || claim.resourceIds.some((id, index) => claim.resources?.[index]?.resourceId !== id || !isSafeClaimUrl(claim.resources?.[index]?.url ?? ''))) return { valid: false };
    for (const selected of intent.capture.selected) {
      if (!claim.resources.some(({ resourceId, url }) => resourceId === selected.resourceId && url === selected.url)) return { valid: false };
    }
    const submittedTargets = submitted.map(object).filter((item): item is Record<string, unknown> => Boolean(item));
    const submittedUrls = new Set(submittedTargets.filter((item) => typeof item.url === 'string').map(({ url }) => String(url)));
    const returnedUrls = new Set(claim.resources.map(({ url }) => url));
    if (submittedUrls.size !== returnedUrls.size || [...submittedUrls].some((url) => !returnedUrls.has(url))) return { valid: false };
    return { valid: true, effect: { kind: 'claim-submitted', claim: { ...claim, resourceIds: [...claim.resourceIds], resources: claim.resources.map((item) => ({ ...item })) } } };
  }
  return { valid: false };
}

export async function interpretCreatorOwnerResponse(
  response: Response,
  intent: CreatorOwnerWriteIntent,
  observed: CreatorEditorDTO,
): Promise<CreatorOwnerCommandOutcome> {
  const payload = await responseObject(response);
  const sessionOutcome = classifyCreatorOwnerWriteSessionFailure(response.status, payload ?? null, 'draft');
  if (sessionOutcome) return sessionOutcome;
  if (!response.ok) {
    const code = payload?.error;
    if (response.status === 409 && code === 'URL_COLLISION') {
      return { kind: 'rejected', message: errorMessage(code, response.status, intent), code };
    }
    if (response.status === 503 && code === 'ORDER_MOVE_CALCULATION_UNAVAILABLE') {
      return { kind: 'rejected', message: errorMessage(code, response.status, intent), code: String(code) };
    }
    if (response.status === 422 && code === 'ORDER_MOVE_LIMIT') {
      return { kind: 'rejected', message: errorMessage(code, response.status, intent), code: String(code),
        ...(Number.isSafeInteger(payload?.viablePosition) ? { viablePosition: Number(payload?.viablePosition) } : {}) };
    }
    if (response.status === 409 && code !== 'SLUG_TAKEN' && code !== 'SERIES_SLUG_TAKEN') {
      return { kind: 'conflict', message: code === 'PROFILE_CONFLICT'
        ? 'La página cambió desde que abriste esta acción. Comprueba los datos guardados antes de continuar.'
        : code === 'RESOURCE_CONFLICT' || code === 'STALE_RESOURCE_REFERENCE'
          ? 'La ficha del catálogo cambió desde que la elegiste. Actualiza el catálogo y vuelve a seleccionar el contenido.'
          : 'El estado guardado cambió desde que abriste esta edición. Comprueba lo guardado antes de decidir cómo seguir.',
        ...(typeof code === 'string' ? { code } : {}) };
    }
    if (response.status === 408 || response.status >= 500) {
      return { kind: 'uncertain', message: 'No pudimos confirmar el resultado. Comprueba lo guardado antes de volver a intentar; no repetiremos la escritura.', ...(typeof code === 'string' ? { code } : {}) };
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
  const sessionOutcome = classifyCreatorOwnerWriteSessionFailure(response.status, payload ?? null, 'photo');
  if (sessionOutcome) return sessionOutcome;
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

function compareLabel(intent: CreatorOwnerWriteIntent, foundSeries: CreatorSeriesDTO | undefined, snapshot: CreatorEditorDTO, recoveredLink?: CreatorLinkDTO): string {
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
  if (intent.kind === 'reference' && intent.capture.kind === 'reference') return recoveredLink
    ? 'La página guardada incluye la referencia enviada. La selección actual queda disponible para una decisión manual.'
    : 'No encontramos la referencia enviada en la página guardada. La selección actual queda disponible para una decisión manual.';
  if (intent.kind === 'claim') return 'Actualizamos sólo el historial de solicitudes. El resultado no identifica de forma segura si este envío fue registrado.';
  return 'Compara los datos guardados con tu corrección y elige expresamente qué versión usar.';
}

export function createCreatorOwnerComparison(
  intent: CreatorOwnerWriteIntent,
  snapshot: CreatorEditorDTO,
  currentEditor?: CreatorOwnerEditor | CreatorOwnerLinkEditor,
): CreatorOwnerComparison {
  const capture = intent.capture;
  const originalProfile = captureProfile(intent);
  const profileMatches = originalProfile ? snapshot.profile?.id === originalProfile.id : snapshot.profile !== null;
  let seriesId: string | undefined;
  let recoveredLinkId: string | undefined;
  let savedAddPlacementId: string | undefined;
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
  if (intent.kind === 'save-link' && capture.kind === 'link-placement') {
    canAdopt = profileMatches && snapshot.links.some(({ placementId }) => placementId === capture.baseLink.placementId);
  }
  if (intent.kind === 'save-link' && capture.kind === 'link-resource') {
    canAdopt = snapshot.editableResources.some(({ id }) => id === capture.baseResource.id)
      && !snapshot.links.some(({ resourceId }) => resourceId === capture.baseResource.id);
  }
  if (intent.kind === 'move-link' && capture.kind === 'move-link') {
    canAdopt = profileMatches && snapshot.links.some(({ placementId }) => placementId === capture.baseLink.placementId);
  }
  if (intent.kind === 'add-link' && intent.capture.kind === 'add-link') {
    const originalUrl = normalizeCreatorText(intent.capture.draft.url);
    const matches = originalUrl ? snapshot.links.filter(({ url }) => url === originalUrl) : [];
    if (!intent.addDidNotCommit && matches.length === 1) savedAddPlacementId = matches[0].placementId;
    message = intent.addDidNotCommit
      ? 'El intento no se guardó. Puedes usar la página guardada y continuar con el borrador del alta.'
      : savedAddPlacementId
        ? 'Hay una ficha guardada con esa URL. No pudimos confirmar el alta.'
        : matches.length > 1
          ? 'Hay varias fichas con esa URL. Conserva el borrador para decidir cómo continuar.'
          : 'La URL enviada no aparece en tu página. Puedes seguir con el borrador del alta.';
  }
  if (intent.kind === 'reference' && intent.capture.kind === 'reference') {
    const selected = intent.capture.selected;
    const matches = selected ? snapshot.links.filter(({ resourceId, url }) => resourceId === selected.id && url === selected.url) : [];
    if (matches.length === 1) recoveredLinkId = matches[0].placementId;
    canAdopt = profileMatches && matches.length <= 1;
  }
  if (intent.kind === 'remove-link' && intent.capture.kind === 'list-command') canAdopt = profileMatches;
  if (intent.kind === 'reinclude-resource' && intent.capture.kind === 'list-command') canAdopt = profileMatches;
  return {
    id: `${intent.id}:compare`,
    editorKey: intent.editorKey,
    snapshot,
    ...(currentEditor ? { draftAtCompare: currentEditor } : {}),
    ...(seriesId ? { seriesId } : {}),
    ...(recoveredLinkId ? { recoveredLinkId } : {}),
    ...(savedAddPlacementId ? { savedAddPlacementId } : {}),
    canAdopt,
    message: message ?? compareLabel(intent, seriesId ? snapshot.series.find(({ id }) => id === seriesId) : undefined, snapshot,
      recoveredLinkId ? snapshot.links.find(({ placementId }) => placementId === recoveredLinkId) : undefined),
  };
}

export function isCreatorOwnerWriteCapture(value: unknown): value is CreatorOwnerEditor | CreatorOwnerLinkEditor | CreatorOwnerListContext {
  return Boolean(value && typeof value === 'object' && 'kind' in value);
}

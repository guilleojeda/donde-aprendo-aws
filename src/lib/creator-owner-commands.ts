import { isCatalogResourceIdWithinLimit } from './catalog-identity.mjs';
import { CREATOR_CONTRACT_HEADER, CREATOR_CONTRACT_VERSION, isCreatorStateId } from './creator-values.mjs';

export { CREATOR_CONTRACT_HEADER, CREATOR_CONTRACT_VERSION };

export type CreatorOwnerOperation =
  | 'save-profile'
  | 'publish-profile'
  | 'add-link'
  | 'reference-link'
  | 'reinclude-link'
  | 'edit-link'
  | 'set-link-options'
  | 'remove-link'
  | 'move-link'
  | 'create-series'
  | 'edit-series'
  | 'delete-series'
  | 'add-chapter'
  | 'remove-chapter'
  | 'move-chapter'
  | 'edit-resource'
  | 'create-claim';

export interface CreatorOwnerWireTarget {
  resourceId?: string;
  placementId?: string;
  seriesId?: string;
}

export interface CreatorOwnerWireCommand {
  operation: CreatorOwnerOperation;
  profileId: string | null;
  creatorVersion: number | null;
  target?: CreatorOwnerWireTarget;
  base?: { resourceVersion?: number };
  /** Raw touched form fields chosen by the owner UI; values are passed through unchanged. */
  fields: Record<string, unknown>;
}

export interface CreatorOwnerRequest {
  path: string;
  method: 'PUT' | 'POST' | 'PATCH' | 'DELETE';
  body: Record<string, unknown>;
}

export interface CreatorOwnerAcknowledgementExpectation {
  operation: CreatorOwnerOperation;
  profileId: string | null;
  target?: CreatorOwnerWireTarget;
  creatorVersion?: number | null;
  resourceVersion?: number;
}

export interface CreatorOwnerAcknowledgement {
  kind: 'confirmed';
  operation: CreatorOwnerOperation;
  profileId: string | null;
  disposition: string;
  creatorVersionFloor?: number;
  resourceId?: string;
  resourceVersionFloor?: number;
  placementId?: string;
  seriesId?: string;
  claimId?: string;
  claimVersion?: number;
}

export type CreatorOwnerAcknowledgementResult = CreatorOwnerAcknowledgement | { kind: 'invalid' };

export interface CreatorOwnerPhotoAuthorization {
  kind: 'confirmed';
  profileId: string;
  uploadId: string;
  post: { url: string; fields: Record<string, string> };
}

export interface CreatorOwnerPhotoFinalization {
  kind: 'confirmed';
  profileId: string;
  uploadId: string;
  historicalCreatorVersion: number;
  disposition: 'finalized';
  photo: { version: string | number; url?: string };
}

type Route = Pick<CreatorOwnerRequest, 'path' | 'method'>;

function stateId(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || !isCreatorStateId(value)) throw new TypeError(`La identificación de ${label} no es válida.`);
  return value;
}

function resourceId(value: string | undefined): string {
  if (typeof value !== 'string' || !isCatalogResourceIdWithinLimit(value)) {
    throw new TypeError('La identificación del recurso no es válida.');
  }
  return value;
}

function requireCreatorVersion(command: CreatorOwnerWireCommand): number | null {
  if (command.operation === 'save-profile') {
    if (command.creatorVersion === null) return null;
    if (!Number.isSafeInteger(command.creatorVersion) || command.creatorVersion < 0) {
      throw new TypeError('La revisión del creador no es válida.');
    }
    return command.creatorVersion;
  }
  if (command.operation === 'create-claim' || command.operation === 'edit-resource') {
    if (command.creatorVersion !== null && (!Number.isSafeInteger(command.creatorVersion) || command.creatorVersion < 0)) {
      throw new TypeError('La revisión del creador no es válida.');
    }
    return null;
  }
  if (!Number.isSafeInteger(command.creatorVersion) || Number(command.creatorVersion) < 0) {
    throw new TypeError('La revisión del creador no es válida.');
  }
  return command.creatorVersion;
}

function requiredProfileId(command: CreatorOwnerWireCommand): string | null {
  if (command.operation === 'save-profile' && command.creatorVersion === null) {
    if (command.profileId !== null) throw new TypeError('El alta inicial no debe enviar un perfil observado.');
    return null;
  }
  return stateId(command.profileId ?? undefined, 'perfil');
}

function requireResourceVersion(command: CreatorOwnerWireCommand): number | undefined {
  const version = command.base?.resourceVersion;
  if (version === undefined) return undefined;
  if (!Number.isSafeInteger(version) || version < 0) throw new TypeError('La revisión del recurso no es válida.');
  return version;
}

function routeFor(command: CreatorOwnerWireCommand): Route {
  const target = command.target ?? {};
  const linkPath = () => `/api/creador/enlaces/${encodeURIComponent(stateId(target.placementId, 'enlace'))}`;
  const seriesPath = () => `/api/creador/series/${encodeURIComponent(stateId(target.seriesId, 'serie'))}`;
  const chapterPath = () => `${seriesPath()}/capitulos/${encodeURIComponent(stateId(target.placementId, 'capítulo'))}`;
  switch (command.operation) {
    case 'save-profile': return { path: '/api/creador/perfil/', method: 'PUT' };
    case 'publish-profile': return { path: '/api/creador/perfil/publicar/', method: 'POST' };
    case 'add-link': return { path: '/api/creador/enlaces/', method: 'POST' };
    case 'reference-link': return { path: '/api/creador/referencias/', method: 'POST' };
    case 'reinclude-link': return { path: '/api/creador/enlaces/', method: 'POST' };
    case 'edit-link': return { path: `${linkPath()}/editar/`, method: 'PATCH' };
    case 'set-link-options': return { path: `${linkPath()}/`, method: 'PATCH' };
    case 'remove-link': return { path: `${linkPath()}/`, method: 'DELETE' };
    case 'move-link': return { path: `${linkPath()}/mover/`, method: 'POST' };
    case 'create-series': return { path: '/api/creador/series/', method: 'POST' };
    case 'edit-series': return { path: `${seriesPath()}/`, method: 'PATCH' };
    case 'delete-series': return { path: `${seriesPath()}/`, method: 'DELETE' };
    case 'add-chapter': return { path: `${chapterPath()}/`, method: 'PUT' };
    case 'remove-chapter': return { path: `${chapterPath()}/`, method: 'DELETE' };
    case 'move-chapter': return { path: `${chapterPath()}/mover/`, method: 'POST' };
    case 'edit-resource': return {
      path: `/api/creador/recursos/?id=${encodeURIComponent(resourceId(target.resourceId))}`,
      method: 'PATCH',
    };
    case 'create-claim': return { path: '/api/creador/reclamaciones/', method: 'POST' };
  }
}

const RESERVED_FIELDS = new Set([
  'schemaVersion', 'operation', 'profileId', 'creatorVersion', 'resourceVersion',
  'resourceId', 'placementId', 'seriesId', 'profileVersion', 'placementVersion', 'version',
]);

/** Build one request from operation context and raw form fields. No domain decisions are made here. */
export function createCreatorOwnerRequest(command: CreatorOwnerWireCommand): CreatorOwnerRequest {
  if (!command || !command.fields || typeof command.fields !== 'object' || Array.isArray(command.fields)) {
    throw new TypeError('La acción no contiene campos de formulario válidos.');
  }
  requiredProfileId(command);
  const creatorVersion = requireCreatorVersion(command);
  const resourceVersion = requireResourceVersion(command);
  const route = routeFor(command);
  if (Object.keys(command.fields).some((key) => RESERVED_FIELDS.has(key))) {
    throw new TypeError('Los campos no pueden reemplazar el contexto de la solicitud.');
  }

  const body: Record<string, unknown> = { ...command.fields };
  if (command.operation !== 'edit-resource' && command.operation !== 'create-claim') {
    body.creatorVersion = creatorVersion;
  }
  if (resourceVersion !== undefined) body.resourceVersion = resourceVersion;
  if (command.operation === 'reference-link' || command.operation === 'reinclude-link') {
    body.resourceId = resourceId(command.target?.resourceId);
  }

  // profileId is deliberately local context; the service resolves it from the bound owner session.
  return { ...route, body };
}

const DISPOSITIONS: Record<CreatorOwnerOperation, ReadonlySet<string>> = {
  'save-profile': new Set(['created', 'saved', 'unchanged']),
  'publish-profile': new Set(['published', 'unchanged']),
  'add-link': new Set(['resource-created', 'resource-reused', 'already-present']),
  'reference-link': new Set(['attached', 'already-present']),
  'reinclude-link': new Set(['attached', 'already-present']),
  'edit-link': new Set(['saved', 'unchanged']),
  'set-link-options': new Set(['saved', 'unchanged']),
  'remove-link': new Set(['removed', 'unchanged']),
  'move-link': new Set(['moved', 'unchanged']),
  'create-series': new Set(['created']),
  'edit-series': new Set(['saved', 'unchanged']),
  'delete-series': new Set(['deleted', 'unchanged']),
  'add-chapter': new Set(['added', 'unchanged']),
  'remove-chapter': new Set(['removed', 'unchanged']),
  'move-chapter': new Set(['moved', 'unchanged']),
  'edit-resource': new Set(['saved', 'unchanged']),
  'create-claim': new Set(['submitted']),
};

const ACK_STATUSES: Record<CreatorOwnerOperation, ReadonlySet<number>> = {
  'save-profile': new Set([200]),
  'publish-profile': new Set([200]),
  'add-link': new Set([200, 201]),
  'reference-link': new Set([200, 201]),
  'reinclude-link': new Set([200, 201]),
  'edit-link': new Set([200]),
  'set-link-options': new Set([200]),
  'remove-link': new Set([200]),
  'move-link': new Set([200]),
  'create-series': new Set([201]),
  'edit-series': new Set([200]),
  'delete-series': new Set([200]),
  'add-chapter': new Set([200]),
  'remove-chapter': new Set([200]),
  'move-chapter': new Set([200]),
  'edit-resource': new Set([200]),
  'create-claim': new Set([202]),
};

function requiredAckFields(operation: CreatorOwnerOperation): string[] {
  const common = ['schemaVersion', 'operation', 'profileId', 'disposition'];
  if (operation === 'create-claim') return [...common, 'claimId', 'claimVersion'];
  if (operation === 'edit-resource') return [...common, 'resourceId', 'resourceVersion'];
  const fields = [...common, 'creatorVersion'];
  if (operation === 'add-link') return [...fields, 'resourceId', 'resourceVersion', 'placementId'];
  if (operation === 'reference-link' || operation === 'reinclude-link') return [...fields, 'resourceId', 'resourceVersion', 'placementId'];
  if (operation === 'edit-link') return [...fields, 'resourceId', 'placementId'];
  if (operation === 'set-link-options' || operation === 'remove-link' || operation === 'move-link') return [...fields, 'placementId'];
  if (operation === 'create-series' || operation === 'edit-series' || operation === 'delete-series') return [...fields, 'seriesId'];
  if (operation === 'add-chapter' || operation === 'remove-chapter' || operation === 'move-chapter') return [...fields, 'seriesId', 'placementId'];
  return fields;
}

function allowedAckFields(operation: CreatorOwnerOperation): string[] {
  const allowed = requiredAckFields(operation);
  if (operation === 'edit-link') allowed.push('resourceVersion');
  return allowed;
}

function requiredExpectedTargets(operation: CreatorOwnerOperation): (keyof CreatorOwnerWireTarget)[] {
  if (operation === 'reference-link' || operation === 'reinclude-link' || operation === 'edit-resource') return ['resourceId'];
  if (operation === 'edit-link') return ['resourceId', 'placementId'];
  if (operation === 'set-link-options' || operation === 'remove-link' || operation === 'move-link') return ['placementId'];
  if (operation === 'edit-series' || operation === 'delete-series') return ['seriesId'];
  if (operation === 'add-chapter' || operation === 'remove-chapter' || operation === 'move-chapter') return ['seriesId', 'placementId'];
  return [];
}

function isSafeAckId(field: string, value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (field === 'resourceId') return isCatalogResourceIdWithinLimit(value);
  return isCreatorStateId(value);
}

/** Read a command-specific acknowledgement and validate only its contract and request context. */
export async function readCreatorOwnerAcknowledgement(
  response: Response,
  expected: CreatorOwnerAcknowledgementExpectation,
): Promise<CreatorOwnerAcknowledgementResult> {
  if (!ACK_STATUSES[expected.operation]?.has(response.status)) return { kind: 'invalid' };
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return { kind: 'invalid' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { kind: 'invalid' };
  const ack = value as Record<string, unknown>;
  const required = requiredAckFields(expected.operation);
  const allowed = allowedAckFields(expected.operation);
  if (!required.every((key) => Object.hasOwn(ack, key))
    || Object.keys(ack).some((key) => !allowed.includes(key))
    || ack.schemaVersion !== 2 || ack.operation !== expected.operation
    || typeof ack.disposition !== 'string' || !DISPOSITIONS[expected.operation].has(ack.disposition)) return { kind: 'invalid' };
  if ((expected.operation === 'add-link' && ((response.status === 200) !== (ack.disposition === 'already-present')))
    || ((expected.operation === 'reference-link' || expected.operation === 'reinclude-link')
      && ((response.status === 200) !== (ack.disposition === 'already-present')))) return { kind: 'invalid' };

  for (const field of requiredExpectedTargets(expected.operation)) {
    const id = expected.target?.[field];
    if (id === undefined || !isSafeAckId(field, id)) return { kind: 'invalid' };
  }

  if (expected.profileId === null) {
    if (expected.operation === 'save-profile') {
      if (!isSafeAckId('profileId', ack.profileId)) return { kind: 'invalid' };
    } else return { kind: 'invalid' };
  } else if (ack.profileId !== expected.profileId) return { kind: 'invalid' };

  for (const field of ['resourceId', 'placementId', 'seriesId', 'claimId'] as const) {
    if (Object.hasOwn(ack, field) && !isSafeAckId(field, ack[field])) return { kind: 'invalid' };
    const expectedValue = field === 'claimId' ? undefined : expected.target?.[field];
    if (expectedValue !== undefined && ack[field] !== expectedValue) return { kind: 'invalid' };
  }

  const creatorVersionFloor = expected.operation === 'edit-resource' || expected.operation === 'create-claim'
    ? undefined
    : ack.creatorVersion;
  const resourceVersionFloor = Object.hasOwn(ack, 'resourceVersion') ? ack.resourceVersion : undefined;
  if ((creatorVersionFloor !== undefined && (!Number.isSafeInteger(creatorVersionFloor) || Number(creatorVersionFloor) < 0))
    || (resourceVersionFloor !== undefined && (!Number.isSafeInteger(resourceVersionFloor) || Number(resourceVersionFloor) < 0))
    || (expected.operation === 'edit-resource' && !Number.isSafeInteger(ack.resourceVersion))
    || (expected.operation === 'create-claim' && !Number.isSafeInteger(ack.claimVersion))
    || (typeof ack.claimVersion === 'number' && ack.claimVersion < 1)
    || (typeof expected.creatorVersion === 'number' && typeof creatorVersionFloor === 'number' && creatorVersionFloor < expected.creatorVersion)
    || (typeof expected.resourceVersion === 'number'
      && (typeof resourceVersionFloor !== 'number' || resourceVersionFloor < expected.resourceVersion))) return { kind: 'invalid' };

  return {
    kind: 'confirmed',
    operation: expected.operation,
    profileId: ack.profileId as string | null,
    disposition: ack.disposition,
    ...(typeof creatorVersionFloor === 'number' ? { creatorVersionFloor } : {}),
    ...(typeof ack.resourceId === 'string' ? { resourceId: ack.resourceId } : {}),
    ...(typeof resourceVersionFloor === 'number' ? { resourceVersionFloor } : {}),
    ...(typeof ack.placementId === 'string' ? { placementId: ack.placementId } : {}),
    ...(typeof ack.seriesId === 'string' ? { seriesId: ack.seriesId } : {}),
    ...(typeof ack.claimId === 'string' ? { claimId: ack.claimId } : {}),
    ...(typeof ack.claimVersion === 'number' ? { claimVersion: ack.claimVersion } : {}),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

async function readJsonRecord(response: Response): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await response.json();
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Validate the non-mutating signed-upload acknowledgement against the active profile. */
export async function readCreatorOwnerPhotoAuthorizationAcknowledgement(
  response: Response,
  expected: { profileId: string; creatorVersion?: number },
): Promise<CreatorOwnerPhotoAuthorization | { kind: 'invalid' }> {
  if (response.status !== 200) return { kind: 'invalid' };
  const ack = await readJsonRecord(response);
  if (!ack || !exactKeys(ack, ['schemaVersion', 'operation', 'profileId', 'uploadId', 'post'])
    || ack.schemaVersion !== 2 || ack.operation !== 'authorize-photo' || ack.profileId !== expected.profileId
    || typeof ack.uploadId !== 'string' || !isCreatorStateId(ack.uploadId) || !isObject(ack.post)
    || !exactKeys(ack.post, ['url', 'fields']) || typeof ack.post.url !== 'string') return { kind: 'invalid' };
  let destination: URL;
  try {
    destination = new URL(ack.post.url);
  } catch {
    return { kind: 'invalid' };
  }
  if (!['http:', 'https:'].includes(destination.protocol) || !destination.hostname
    || destination.username || destination.password || !isObject(ack.post.fields)
    || typeof ack.post.fields.key !== 'string' || ack.post.fields.key.length === 0
    || Object.values(ack.post.fields).some((field) => typeof field !== 'string')) return { kind: 'invalid' };
  return {
    kind: 'confirmed',
    profileId: ack.profileId,
    uploadId: ack.uploadId,
    post: { url: ack.post.url, fields: ack.post.fields as Record<string, string> },
  };
}

/** Validate exact completion context while retaining the commit revision as historical evidence. */
export async function readCreatorOwnerPhotoFinalizeAcknowledgement(
  response: Response,
  expected: { profileId: string; uploadId: string },
): Promise<CreatorOwnerPhotoFinalization | { kind: 'invalid' }> {
  if (response.status !== 200) return { kind: 'invalid' };
  const ack = await readJsonRecord(response);
  if (!ack || !exactKeys(ack, ['schemaVersion', 'operation', 'profileId', 'uploadId', 'creatorVersion', 'photo', 'disposition'])
    || ack.schemaVersion !== 2 || ack.operation !== 'finalize-photo' || ack.profileId !== expected.profileId
    || ack.uploadId !== expected.uploadId || !isCreatorStateId(ack.uploadId)
    || !Number.isSafeInteger(ack.creatorVersion) || Number(ack.creatorVersion) < 0
    || ack.disposition !== 'finalized' || !isObject(ack.photo)
    || !exactKeys(ack.photo, ['version', 'url'])) return { kind: 'invalid' };
  const version = ack.photo.version;
  if (!(typeof version === 'string' || (typeof version === 'number' && Number.isSafeInteger(version) && version >= 0))
    || String(version) !== expected.uploadId || typeof ack.photo.url !== 'string'
    || ack.photo.url !== `/media/fotos/${encodeURIComponent(expected.profileId)}/${encodeURIComponent(expected.uploadId)}.webp`) return { kind: 'invalid' };
  return {
    kind: 'confirmed',
    profileId: ack.profileId,
    uploadId: ack.uploadId,
    historicalCreatorVersion: ack.creatorVersion as number,
    disposition: 'finalized',
    photo: { version, url: ack.photo.url },
  };
}

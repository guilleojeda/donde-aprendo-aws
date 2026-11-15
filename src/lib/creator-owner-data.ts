import type {
  CreatorClaimDTO,
  CreatorClaimResourceDTO,
  CreatorOwnerPlacementViewDTO,
  CreatorOwnerSnapshotDTO,
} from '../types/creators';
import { isCatalogResourceIdWithinLimit } from './catalog-identity.mjs';
import { CREATOR_PROGRAMS, CREATOR_SOCIALS, isCreatorStateId } from './creator-values.mjs';
import { isSafeCatalogUrl } from './catalog-url-safety.mjs';

const PROGRAMS: ReadonlySet<string> = new Set(CREATOR_PROGRAMS);
const SOCIALS: ReadonlySet<string> = new Set(CREATOR_SOCIALS);
const DIRECTORY_APPROVALS = new Set(['pending', 'approved', 'revoked']);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function safeVersion(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function text(value: unknown): value is string {
  return typeof value === 'string';
}

function nonEmptyText(value: unknown): value is string {
  return text(value) && value.length > 0;
}

function hasOnlyKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(text);
}

function isProfile(value: unknown): boolean {
  if (!record(value) || !hasOnlyKeys(value,
    ['id', 'displayName', 'slug', 'programs', 'socials', 'published', 'hidden'],
    ['city', 'country', 'bio', 'photo'])) return false;
  if (!isCreatorStateId(value.id) || !text(value.displayName) || !text(value.slug)
    || typeof value.published !== 'boolean' || typeof value.hidden !== 'boolean'
    || !Array.isArray(value.programs) || !value.programs.every((program) => typeof program === 'string' && PROGRAMS.has(program))
    || !unique(value.programs as string[]) || !record(value.socials)) return false;
  if ((Object.hasOwn(value, 'city') && !text(value.city))
    || (Object.hasOwn(value, 'country') && !text(value.country))
    || (Object.hasOwn(value, 'bio') && !text(value.bio))) return false;
  if (Object.entries(value.socials).some(([key, social]) => !SOCIALS.has(key) || !isSafeCatalogUrl(social))) return false;
  if (Object.hasOwn(value, 'photo')) {
    const photo = value.photo;
    if (!record(photo) || !hasOnlyKeys(photo, ['version'], ['url'])
      || !(nonEmptyText(photo.version) || safeVersion(photo.version))
      || (Object.hasOwn(photo, 'url') && !text(photo.url))) return false;
  }
  return true;
}

function isResource(value: unknown): boolean {
  if (!record(value) || !hasOnlyKeys(value,
    ['id', 'version', 'title', 'url', 'hidden', 'directoryApproval', 'metadataEditable', 'reincludeAllowed'],
    ['description'])) return false;
  return nonEmptyText(value.id) && isCatalogResourceIdWithinLimit(value.id)
    && safeVersion(value.version) && text(value.title) && isSafeCatalogUrl(value.url)
    && (!Object.hasOwn(value, 'description') || text(value.description))
    && typeof value.hidden === 'boolean'
    && typeof value.directoryApproval === 'string' && DIRECTORY_APPROVALS.has(value.directoryApproval)
    && typeof value.metadataEditable === 'boolean' && typeof value.reincludeAllowed === 'boolean';
}

function isPlacement(value: unknown): boolean {
  return record(value) && hasOnlyKeys(value, ['resourceId', 'selectedForDirectory'])
    && nonEmptyText(value.resourceId) && isCatalogResourceIdWithinLimit(value.resourceId)
    && typeof value.selectedForDirectory === 'boolean';
}

function isSeries(value: unknown): boolean {
  if (!record(value) || !hasOnlyKeys(value, ['name', 'slug', 'chapters'], ['description'])) return false;
  return text(value.name) && text(value.slug) && isStringArray(value.chapters)
    && (!Object.hasOwn(value, 'description') || text(value.description));
}

function isClaimResources(value: unknown, resourceIds: unknown): value is CreatorClaimResourceDTO[] {
  if (!Array.isArray(value) || !Array.isArray(resourceIds) || !resourceIds.every(nonEmptyText)
    || value.length === 0 || value.length !== resourceIds.length) return false;
  return value.every((candidate, index) => record(candidate)
    && hasOnlyKeys(candidate, ['resourceId', 'url'])
    && nonEmptyText(candidate.resourceId) && candidate.resourceId === resourceIds[index]
    && isSafeCatalogUrl(candidate.url));
}

export function readCreatorClaimResources(value: unknown, resourceIds: unknown): CreatorClaimResourceDTO[] | undefined {
  if (value === undefined) return undefined;
  if (!isClaimResources(value, resourceIds)) {
    throw new TypeError('Los destinos de una solicitud recibida no tienen un formato válido.');
  }
  return value;
}

function isClaim(value: unknown): value is CreatorClaimDTO {
  if (!record(value) || !hasOnlyKeys(value, ['id', 'resourceIds'], ['version', 'resources', 'sourceId', 'status', 'createdAt', 'evidence'])) return false;
  if (!isCreatorStateId(value.id) || !isStringArray(value.resourceIds)
    || !value.resourceIds.every((id) => nonEmptyText(id) && isCatalogResourceIdWithinLimit(id))
    || !unique(value.resourceIds)) return false;
  if (Object.hasOwn(value, 'version') && !safeVersion(value.version, 1)) return false;
  if (Object.hasOwn(value, 'resources') && !isClaimResources(value.resources, value.resourceIds)) return false;
  return (!Object.hasOwn(value, 'sourceId') || text(value.sourceId))
    && (!Object.hasOwn(value, 'status') || text(value.status))
    && (!Object.hasOwn(value, 'createdAt') || (typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)))
    && (!Object.hasOwn(value, 'evidence') || text(value.evidence));
}

/** Strictly validate a complete v2 owner read without changing, defaulting or projecting it. */
export function readCreatorOwnerSnapshot(value: unknown): CreatorOwnerSnapshotDTO {
  if (!record(value) || !hasOnlyKeys(value,
    ['schemaVersion', 'creatorVersion', 'profile', 'resources', 'placements', 'order', 'series', 'claims'])) {
    throw new TypeError('No pudimos leer los datos del perfil.');
  }
  const { schemaVersion, creatorVersion, profile, resources, placements, order, series, claims } = value;
  if (schemaVersion !== 2 || !(creatorVersion === null || safeVersion(creatorVersion))
    || !(profile === null || isProfile(profile))
    || !Array.isArray(resources) || !resources.every(isResource)
    || !record(placements) || !record(order) || !record(series)
    || !Array.isArray(claims) || !claims.every(isClaim)) {
    throw new TypeError('No pudimos leer los datos del perfil.');
  }

  const resourceRows = resources as CreatorOwnerSnapshotDTO['resources'];
  const placementRows = placements as Record<string, unknown>;
  const sequence = order as Record<string, unknown>;
  const seriesRows = series as Record<string, unknown>;
  if (!hasOnlyKeys(order as Record<string, unknown>, ['featured', 'ordinary'])
    || !isStringArray(sequence.featured) || !isStringArray(sequence.ordinary)
    || !Object.entries(placements).every(([id, placement]) => isCreatorStateId(id) && isPlacement(placement))
    || !Object.entries(series).every(([id, item]) => isCreatorStateId(id) && isSeries(item))) {
    throw new TypeError('La estructura de enlaces y series recibida no tiene un formato válido.');
  }

  const resourceIds = resourceRows.map(({ id }) => id);
  const placementIds = Object.keys(placementRows);
  const seriesIds = Object.keys(seriesRows);
  if (!unique(resourceIds) || !unique(placementIds) || !unique(seriesIds)) {
    throw new TypeError('La observación repite una identidad de recurso, enlace o serie.');
  }
  const knownResources = new Set(resourceIds);
  const knownPlacements = new Set(placementIds);
  if (Object.values(placementRows).some((placement) => !record(placement)
    || typeof placement.resourceId !== 'string' || !knownResources.has(placement.resourceId))) {
    throw new TypeError('Un enlace guardado referencia una ficha que no está en la observación.');
  }

  const featured = sequence.featured as string[];
  const ordinary = sequence.ordinary as string[];
  if (!unique([...featured, ...ordinary]) || featured.length + ordinary.length !== placementIds.length
    || [...featured, ...ordinary].some((id) => !knownPlacements.has(id))) {
    throw new TypeError('El orden general no contiene cada enlace exactamente una vez.');
  }

  const placedResourceIds = new Set(Object.values(placementRows).flatMap((placement) =>
    record(placement) && typeof placement.resourceId === 'string' ? [placement.resourceId] : []));
  if (resourceRows.some((resource) => !placedResourceIds.has(resource.id)
    && !resource.metadataEditable && !resource.reincludeAllowed)) {
    throw new TypeError('La observación contiene una ficha retenida sin permiso vigente.');
  }
  if (Object.values(seriesRows).some((item) => !record(item) || !unique(item.chapters as string[])
    || (item.chapters as string[]).some((id) => !knownPlacements.has(id)))) {
    throw new TypeError('El orden de capítulos contiene una referencia inválida o duplicada.');
  }
  if ((profile === null) !== (creatorVersion === null)
    || (profile === null && (resourceRows.length > 0 || placementIds.length > 0 || featured.length > 0
      || ordinary.length > 0 || seriesIds.length > 0 || claims.length > 0))) {
    throw new TypeError('El estado sin perfil contiene datos de edición o carece de su revisión.');
  }

  return value as unknown as CreatorOwnerSnapshotDTO;
}

/** Compatibility name for callers being moved to the canonical owner contract. */
export const readCreatorEditorData = readCreatorOwnerSnapshot;

/** Type guard uses the same decoder and therefore the same trust-boundary rules. */
export function isCreatorOwnerSnapshot(value: unknown): value is CreatorOwnerSnapshotDTO {
  try {
    readCreatorOwnerSnapshot(value);
    return true;
  } catch {
    return false;
  }
}

/** Display join: resource metadata is read once; group and positions come from explicit sequences. */
export function joinCreatorOwnerPlacements(snapshot: CreatorOwnerSnapshotDTO): CreatorOwnerPlacementViewDTO[] {
  const resources = new Map(snapshot.resources.map((resource) => [resource.id, resource]));
  const featuredPositions = new Map(snapshot.order.featured.map((id, index) => [id, index + 1]));
  const ordinaryPositions = new Map(snapshot.order.ordinary.map((id, index) => [id, index + 1]));
  const memberships = new Map<string, CreatorOwnerPlacementViewDTO['series']>();
  for (const [seriesId, item] of Object.entries(snapshot.series)) {
    item.chapters.forEach((placementId, index) => {
      const values = memberships.get(placementId) ?? [];
      values.push({ seriesId, position: index + 1 });
      memberships.set(placementId, values);
    });
  }
  return Object.entries(snapshot.placements).map(([placementId, placement]) => {
    const resource = resources.get(placement.resourceId);
    if (!resource) throw new TypeError('Un enlace guardado referencia una ficha que no está en la observación.');
    const featured = featuredPositions.has(placementId);
    const position = featured ? featuredPositions.get(placementId) : ordinaryPositions.get(placementId);
    if (position === undefined) throw new TypeError('El orden general no contiene el enlace guardado.');
    return {
      placementId,
      resourceId: placement.resourceId,
      title: resource.title,
      url: resource.url,
      ...(Object.hasOwn(resource, 'description') ? { description: resource.description } : {}),
      featured,
      position,
      selectedForDirectory: placement.selectedForDirectory,
      hidden: resource.hidden,
      directoryApproval: resource.directoryApproval,
      resourceVersion: resource.version,
      metadataEditable: resource.metadataEditable,
      reincludeAllowed: resource.reincludeAllowed,
      series: memberships.get(placementId) ?? [],
    };
  });
}

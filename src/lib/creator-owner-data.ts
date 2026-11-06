import type {
  CreatorClaimDTO,
  CreatorClaimResourceDTO,
  CreatorEditableResourceDTO,
  CreatorEditorDTO,
  CreatorLinkDTO,
  CreatorProfileDTO,
  CreatorProgram,
  CreatorSeriesDTO,
  CreatorSeriesMembershipDTO,
  CreatorSocial,
} from '../types/creators';
import { creatorResourceProjectionsAgree } from './creator-resource-consistency';

const PROGRAMS = new Set<CreatorProgram>(['User Group Leaders', 'Community Builders', 'Heroes']);
const SOCIALS = new Set<CreatorSocial>(['instagram', 'x', 'linkedin', 'awsBuilder', 'website']);

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nonEmptyText(value: unknown): string | undefined {
  const result = text(value);
  return result && result.length > 0 ? result : undefined;
}

function readProfile(value: unknown): CreatorProfileDTO | null {
  if (value === null) return null;
  const item = record(value);
  if (!item) throw new TypeError('El perfil recibido no tiene un formato válido.');
  const id = nonEmptyText(item.id);
  const displayName = text(item.displayName);
  const slug = text(item.slug);
  const version = finiteNumber(item.version);
  if (!id || displayName === undefined || slug === undefined || version === undefined
    || typeof item.published !== 'boolean' || typeof item.hidden !== 'boolean') {
    throw new TypeError('El perfil recibido no tiene un formato válido.');
  }

  const programs = Array.isArray(item.programs)
    ? item.programs.filter((program): program is CreatorProgram => typeof program === 'string' && PROGRAMS.has(program as CreatorProgram))
    : [];
  const rawSocials = record(item.socials);
  const socials: Partial<Record<CreatorSocial, string>> = {};
  if (rawSocials) {
    for (const [key, value] of Object.entries(rawSocials)) {
      if (SOCIALS.has(key as CreatorSocial) && typeof value === 'string') socials[key as CreatorSocial] = value;
    }
  }
  const rawPhoto = record(item.photo);
  const photoVersion = rawPhoto?.version;
  const photo = (typeof photoVersion === 'string' || typeof photoVersion === 'number')
    ? {
        version: photoVersion,
        ...(typeof rawPhoto?.url === 'string' ? { url: rawPhoto.url } : {}),
      }
    : undefined;

  return {
    id,
    displayName,
    slug,
    ...(typeof item.city === 'string' ? { city: item.city } : {}),
    ...(typeof item.country === 'string' ? { country: item.country } : {}),
    programs,
    ...(typeof item.bio === 'string' ? { bio: item.bio } : {}),
    socials,
    ...(photo ? { photo } : {}),
    published: item.published,
    hidden: item.hidden,
    version,
  };
}

function readLink(value: unknown): CreatorLinkDTO {
  const item = record(value);
  if (!item) throw new TypeError('Un enlace recibido no tiene un formato válido.');
  const placementId = nonEmptyText(item.placementId);
  const resourceId = nonEmptyText(item.resourceId);
  const title = text(item.title);
  const url = text(item.url);
  const position = finiteNumber(item.position);
  const resourceVersion = finiteNumber(item.resourceVersion);
  const rawSeries = item.series === undefined ? [] : item.series;
  if (!placementId || !resourceId || title === undefined || url === undefined
    || position === undefined || resourceVersion === undefined
    || typeof item.featured !== 'boolean' || typeof item.selectedForDirectory !== 'boolean'
    || typeof item.hidden !== 'boolean'
    || !Array.isArray(rawSeries)) {
    throw new TypeError('Un enlace recibido no tiene un formato válido.');
  }
  const series = rawSeries.map((value): CreatorSeriesMembershipDTO => {
    const membership = record(value);
    const seriesId = nonEmptyText(membership?.seriesId);
    const seriesPosition = finiteNumber(membership?.position);
    if (!seriesId || seriesPosition === undefined || seriesPosition < 0) {
      throw new TypeError('Una pertenencia de serie recibida no tiene un formato válido.');
    }
    return { seriesId, position: seriesPosition };
  });
  if (new Set(series.map(({ seriesId }) => seriesId)).size !== series.length) {
    throw new TypeError('Un enlace recibido repite su pertenencia a una serie.');
  }
  return {
    placementId,
    resourceId,
    title,
    url,
    ...(typeof item.description === 'string' ? { description: item.description } : {}),
    featured: item.featured,
    position,
    selectedForDirectory: item.selectedForDirectory,
    hidden: item.hidden,
    directoryApproval: text(item.directoryApproval) ?? 'pending',
    resourceVersion,
    ...(finiteNumber(item.placementVersion) !== undefined ? { placementVersion: finiteNumber(item.placementVersion) } : {}),
    series,
  };
}

function readSeries(value: unknown): CreatorSeriesDTO {
  const item = record(value);
  if (!item) throw new TypeError('Una serie recibida no tiene un formato válido.');
  const id = nonEmptyText(item.id);
  const name = text(item.name);
  const slug = text(item.slug);
  const version = finiteNumber(item.version);
  if (!id || name === undefined || slug === undefined || version === undefined) {
    throw new TypeError('Una serie recibida no tiene un formato válido.');
  }
  return {
    id,
    name,
    slug,
    ...(typeof item.description === 'string' ? { description: item.description } : {}),
    version,
  };
}

function readEditableResource(value: unknown): CreatorEditableResourceDTO {
  const item = record(value);
  if (!item) throw new TypeError('Un recurso editable recibido no tiene un formato válido.');
  const id = nonEmptyText(item.id);
  const title = text(item.title);
  const url = text(item.url);
  const version = finiteNumber(item.version);
  if (!id || title === undefined || url === undefined || version === undefined) {
    throw new TypeError('Un recurso editable recibido no tiene un formato válido.');
  }
  return { id, title, url, ...(typeof item.description === 'string' ? { description: item.description } : {}), version };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item): item is string => typeof item === 'string');
}

export function readCreatorClaimResources(value: unknown, resourceIds: unknown): CreatorClaimResourceDTO[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !isStringArray(resourceIds) || value.length === 0 || value.length !== resourceIds.length) {
    throw new TypeError('Los destinos de una solicitud recibida no tienen un formato válido.');
  }
  return value.map((candidate, index) => {
    const item = record(candidate);
    if (!item || Object.keys(item).length !== 2 || !Object.hasOwn(item, 'resourceId') || !Object.hasOwn(item, 'url')) {
      throw new TypeError('Los destinos de una solicitud recibida no tienen un formato válido.');
    }
    const resourceId = nonEmptyText(item.resourceId);
    const url = nonEmptyText(item.url);
    if (!resourceId || resourceId !== resourceIds[index] || !url || url.length > 2048) {
      throw new TypeError('Los destinos de una solicitud recibida no tienen un formato válido.');
    }
    return { resourceId, url };
  });
}

function readClaim(value: unknown): CreatorClaimDTO {
  const item = record(value);
  if (!item) throw new TypeError('Una solicitud de vinculación recibida no tiene un formato válido.');
  const id = nonEmptyText(item.id ?? item.claimId);
  const version = item.version;
  if (!id || !Array.isArray(item.resourceIds)
    || (version !== undefined && (!Number.isSafeInteger(version) || Number(version) < 1))) {
    throw new TypeError('Una solicitud de vinculación recibida no tiene un formato válido.');
  }
  const resourceIds = item.resourceIds.filter((idValue): idValue is string => typeof idValue === 'string');
  if (resourceIds.length !== item.resourceIds.length) throw new TypeError('Una solicitud de vinculación recibida no tiene un formato válido.');
  const resources = readCreatorClaimResources(item.resources, resourceIds);
  return {
    id,
    resourceIds,
    ...(typeof version === 'number' ? { version } : {}),
    ...(resources ? { resources } : {}),
    ...(typeof item.sourceId === 'string' ? { sourceId: item.sourceId } : {}),
    ...(typeof item.status === 'string' ? { status: item.status } : {}),
    ...(finiteNumber(item.createdAt) !== undefined ? { createdAt: finiteNumber(item.createdAt) } : {}),
    ...(typeof item.evidence === 'string' ? { evidence: item.evidence } : {}),
  };
}

export function readCreatorEditorData(value: unknown): CreatorEditorDTO {
  const item = record(value);
  if (!item || !Array.isArray(item.links) || !Array.isArray(item.editableResources) || !Array.isArray(item.claims)) {
    throw new TypeError('No pudimos leer los datos del perfil.');
  }
  if (!creatorResourceProjectionsAgree(item.links, item.editableResources)) {
    throw new TypeError('Las proyecciones del contenido no corresponden a la misma observación.');
  }
  const rawSeries = item.series === undefined ? [] : item.series;
  if (!Array.isArray(rawSeries)) throw new TypeError('La lista de series recibida no tiene un formato válido.');
  return {
    profile: readProfile(item.profile),
    links: item.links.map(readLink),
    editableResources: item.editableResources.map(readEditableResource),
    claims: item.claims.map(readClaim),
    series: rawSeries.map(readSeries),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSafeClaimUrl(value: string): boolean {
  if (!value || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isProfile(value: unknown): value is CreatorProfileDTO {
  return isRecord(value)
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.displayName === 'string' && typeof value.slug === 'string'
    && Number.isSafeInteger(value.version) && Number(value.version) >= 0
    && typeof value.published === 'boolean' && typeof value.hidden === 'boolean'
    && Array.isArray(value.programs) && isRecord(value.socials);
}

export function isCreatorClaim(value: unknown): value is CreatorClaimDTO {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0
    || !Array.isArray(value.resourceIds) || !value.resourceIds.every((id) => typeof id === 'string')
    || (value.version !== undefined && (!Number.isSafeInteger(value.version) || Number(value.version) < 1))) return false;
  if (value.resources !== undefined) {
    if (!Array.isArray(value.resources)) return false;
    const observedIds = new Set<string>();
    for (const candidate of value.resources) {
      if (!isRecord(candidate) || Object.keys(candidate).sort().join(',') !== 'resourceId,url'
        || typeof candidate.resourceId !== 'string' || !value.resourceIds.includes(candidate.resourceId)
        || observedIds.has(candidate.resourceId) || typeof candidate.url !== 'string' || !isSafeClaimUrl(candidate.url)) return false;
      observedIds.add(candidate.resourceId);
    }
  }
  return (value.status === undefined || typeof value.status === 'string')
    && (value.createdAt === undefined || (typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)))
    && (value.evidence === undefined || typeof value.evidence === 'string');
}

export function isOwnerData(value: unknown): value is CreatorEditorDTO {
  return isRecord(value) && (value.profile === null || isProfile(value.profile))
    && Array.isArray(value.links) && Array.isArray(value.editableResources)
    && creatorResourceProjectionsAgree(value.links, value.editableResources)
    && Array.isArray(value.claims) && value.claims.every(isCreatorClaim) && Array.isArray(value.series);
}

export function isCreatorLink(value: unknown): value is CreatorLinkDTO {
  return isRecord(value)
    && typeof value.placementId === 'string' && value.placementId.length > 0
    && typeof value.resourceId === 'string' && value.resourceId.length > 0
    && typeof value.title === 'string' && typeof value.url === 'string'
    && typeof value.featured === 'boolean' && Number.isSafeInteger(value.position)
    && typeof value.selectedForDirectory === 'boolean' && typeof value.hidden === 'boolean'
    && typeof value.directoryApproval === 'string'
    && Number.isSafeInteger(value.resourceVersion) && Number(value.resourceVersion) >= 0
    && Number.isSafeInteger(value.placementVersion) && Number(value.placementVersion) >= 0
    && Array.isArray(value.series) && value.series.every((membership) => isRecord(membership)
      && typeof membership.seriesId === 'string' && membership.seriesId.length > 0
      && Number.isSafeInteger(membership.position) && Number(membership.position) >= 0);
}

export function isEditableResource(value: unknown): value is CreatorEditableResourceDTO {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0
    && typeof value.title === 'string' && typeof value.url === 'string'
    && Number.isSafeInteger(value.version) && Number(value.version) >= 0;
}

export function isCreatorSeries(value: unknown): value is CreatorSeriesDTO {
  return isRecord(value) && typeof value.id === 'string' && value.id.length > 0
    && typeof value.name === 'string' && typeof value.slug === 'string'
    && (value.description === undefined || typeof value.description === 'string')
    && Number.isSafeInteger(value.version) && Number(value.version) >= 1;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isStrictProfile(value: unknown): value is CreatorProfileDTO {
  if (!isProfile(value) || !value.programs.every((program) => typeof program === 'string' && PROGRAMS.has(program as CreatorProgram))
    || !value.programs.every((program, index) => value.programs.indexOf(program) === index)) return false;
  const socials = value.socials as Record<string, unknown>;
  if (Object.entries(socials).some(([key, item]) => !SOCIALS.has(key as CreatorSocial) || typeof item !== 'string')) return false;
  if ((value.city !== undefined && typeof value.city !== 'string')
    || (value.country !== undefined && typeof value.country !== 'string')
    || (value.bio !== undefined && typeof value.bio !== 'string')) return false;
  if (value.photo !== undefined) {
    if (!isRecord(value.photo) || (typeof value.photo.version !== 'string'
      && !(typeof value.photo.version === 'number' && Number.isSafeInteger(value.photo.version) && value.photo.version >= 0))
      || (value.photo.url !== undefined && typeof value.photo.url !== 'string')) return false;
  }
  return true;
}

function isStrictClaim(value: unknown): value is CreatorClaimDTO {
  if (!isCreatorClaim(value) || !unique(value.resourceIds)
    || (value.sourceId !== undefined && typeof value.sourceId !== 'string')) return false;
  if (value.resources !== undefined
    && (value.resources.length !== value.resourceIds.length
      || value.resources.some((resource, index) => resource.resourceId !== value.resourceIds[index]))) return false;
  return true;
}

/** Validate a raw owner snapshot before any decoder can drop or default malformed fields. */
export function isCreatorOwnerSnapshot(value: unknown): value is CreatorEditorDTO {
  if (!isRecord(value) || !(value.profile === null || isStrictProfile(value.profile))
    || !Array.isArray(value.links) || !Array.isArray(value.editableResources)
    || !Array.isArray(value.claims) || !Array.isArray(value.series)) return false;

  if (!value.links.every(isCreatorLink) || !value.editableResources.every(isEditableResource)
    || !value.claims.every(isStrictClaim) || !value.series.every(isCreatorSeries)) return false;

  const links = value.links as CreatorLinkDTO[];
  const editableResources = value.editableResources as CreatorEditableResourceDTO[];
  const claims = value.claims as CreatorClaimDTO[];
  const series = value.series as CreatorSeriesDTO[];
  if (!unique(links.map(({ placementId }) => placementId))
    || !unique(editableResources.map(({ id }) => id))
    || !unique(claims.map(({ id }) => id))
    || !unique(series.map(({ id }) => id))) return false;

  const seriesIds = new Set(series.map(({ id }) => id));
  for (const link of links) {
    const memberships = link.series;
    if ((link.description !== undefined && typeof link.description !== 'string')
      || !unique(memberships.map(({ seriesId }) => seriesId))
      || memberships.some(({ seriesId }) => !seriesIds.has(seriesId))) return false;
  }
  if (editableResources.some((resource) => resource.description !== undefined && typeof resource.description !== 'string')
    || series.some((item) => item.description !== undefined && typeof item.description !== 'string')) return false;
  if (!creatorResourceProjectionsAgree(links, editableResources)) return false;
  if (value.profile === null && (links.length > 0 || editableResources.length > 0 || claims.length > 0 || series.length > 0)) return false;
  return true;
}

export function isAdoptableOwnerData(value: unknown): value is CreatorEditorDTO & { profile: CreatorProfileDTO } {
  return isCreatorOwnerSnapshot(value) && value.profile !== null;
}

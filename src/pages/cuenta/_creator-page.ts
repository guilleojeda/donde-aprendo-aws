import { getCreatorRuntime } from '../../lib/creator-runtime.mjs';
import { selectAdminResources } from '../../lib/creator-admin-pagination.mjs';
import type {
  CreatorClaimDTO,
  CreatorEditableResourceDTO,
  CreatorEditorDTO,
  CreatorLinkDTO,
  CreatorProfileDTO,
  CreatorProgram,
  CreatorSeriesDTO,
  CreatorSeriesMembershipDTO,
  CreatorSocial,
} from '../../types/creators';

export type CreatorPrincipalState = 'authenticated' | 'anonymous' | 'disabled' | 'unavailable';

export interface CreatorPagePrincipal {
  state: CreatorPrincipalState;
  csrfToken?: string;
  isAdmin: boolean;
}

export interface CreatorEditorLoad {
  principal: CreatorPagePrincipal;
  status: number;
  data?: CreatorEditorDTO;
}

export interface CreatorAdminData {
  resources: Record<string, unknown>[];
  resourcePage: {
    query: string;
    state: string;
    page: number;
    pageSize: number;
    pageCount: number;
    totalFiltered: number;
    totalResources: number;
    firstVisible: number;
    lastVisible: number;
    stateCounts: { all: number; pending: number; approved: number; revoked: number; hidden: number };
  };
  profiles: Record<string, unknown>[];
  claims: Record<string, unknown>[];
}

export interface CreatorAdminLoad {
  principal: CreatorPagePrincipal;
  status: number;
  data?: CreatorAdminData;
}

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

function readClaim(value: unknown): CreatorClaimDTO {
  const item = record(value);
  if (!item) throw new TypeError('Una solicitud de vinculación recibida no tiene un formato válido.');
  const id = nonEmptyText(item.id ?? item.claimId);
  if (!id || !Array.isArray(item.resourceIds)) {
    throw new TypeError('Una solicitud de vinculación recibida no tiene un formato válido.');
  }
  const resourceIds = item.resourceIds.filter((idValue): idValue is string => typeof idValue === 'string');
  if (resourceIds.length !== item.resourceIds.length) throw new TypeError('Una solicitud de vinculación recibida no tiene un formato válido.');
  return {
    id,
    resourceIds,
    ...(typeof item.sourceId === 'string' ? { sourceId: item.sourceId } : {}),
    ...(typeof item.status === 'string' ? { status: item.status } : {}),
    ...(finiteNumber(item.createdAt) !== undefined ? { createdAt: finiteNumber(item.createdAt) } : {}),
    ...(typeof item.evidence === 'string' ? { evidence: item.evidence } : {}),
  };
}

function readEditorData(value: unknown): CreatorEditorDTO {
  const item = record(value);
  if (!item || !Array.isArray(item.links) || !Array.isArray(item.editableResources) || !Array.isArray(item.claims)) {
    throw new TypeError('No pudimos leer los datos del perfil.');
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

function listFrom(value: unknown, property: string): Record<string, unknown>[] {
  const direct = Array.isArray(value) ? value : record(value)?.[property];
  if (!Array.isArray(direct)) throw new TypeError(`La lista de ${property} recibida no tiene un formato válido.`);
  return direct.map((item) => {
    const parsed = record(item);
    if (!parsed) throw new TypeError(`Un elemento de ${property} no tiene un formato válido.`);
    return parsed;
  });
}

function readAdminResources(value: unknown): CreatorAdminData['resources'] {
  return listFrom(value, 'resources').map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    description: item.description,
    version: item.version,
    published: item.published,
    directoryApproval: item.directoryApproval,
    directoryControl: item.directoryControl,
    hidden: item.hidden,
    recordType: item.recordType,
    category: item.category,
    kind: item.kind,
    format: item.format,
    topics: item.topics,
  }));
}

function readAdminProfiles(value: unknown): CreatorAdminData['profiles'] {
  return listFrom(value, 'profiles').map((item) => ({
    id: item.id,
    displayName: item.displayName,
    slug: item.slug,
    published: item.published,
    hidden: item.hidden,
    version: item.version,
  }));
}

function readAdminClaims(value: unknown): CreatorAdminData['claims'] {
  return listFrom(value, 'claims').map((item) => ({
    id: item.id ?? item.claimId,
    accountId: item.accountId,
    resourceIds: item.resourceIds,
    sourceId: item.sourceId,
    evidence: item.evidence,
    status: item.status,
    createdAt: item.createdAt,
  }));
}

async function loadPrincipal(request: Request): Promise<CreatorPagePrincipal> {
  try {
    const runtime = await getCreatorRuntime();
    const result: unknown = await runtime.auth.getPrincipal(request);
    const item = record(result);
    const state = item?.state;
    if (item && state === 'authenticated') {
      return {
        state,
        ...(typeof item.csrfToken === 'string' ? { csrfToken: item.csrfToken } : {}),
        isAdmin: item.isAdmin === true,
      };
    }
    if (state === 'anonymous' || state === 'disabled' || state === 'unavailable') {
      return { state, isAdmin: false };
    }
    return { state: 'unavailable', isAdmin: false };
  } catch {
    return { state: 'unavailable', isAdmin: false };
  }
}

function privateHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function principalStatus(principal: CreatorPagePrincipal): number {
  if (principal.state === 'authenticated') return 200;
  if (principal.state === 'anonymous') return 401;
  if (principal.state === 'disabled') return 403;
  return 503;
}

async function requestJson(runtimePath: string, request: Request): Promise<{ status: number; body?: unknown }> {
  const runtime = await getCreatorRuntime();
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const internalRequest = new Request(new URL(runtimePath, request.url), {
    method: 'GET',
    headers,
  });
  const response = privateHeaders(await runtime.service.handle(internalRequest));
  if (!response.ok) return { status: response.status };
  const body: unknown = await response.json();
  return { status: response.status, body };
}

export async function loadCreatorEditor(request: Request): Promise<CreatorEditorLoad> {
  const principal = await loadPrincipal(request);
  if (principal.state !== 'authenticated') return { principal, status: principalStatus(principal) };
  if (!principal.csrfToken) return { principal: { state: 'unavailable', isAdmin: false }, status: 503 };
  try {
    const response = await requestJson('/api/creador/perfil', request);
    if (response.status !== 200 || response.body === undefined) return { principal, status: response.status };
    return { principal, status: 200, data: readEditorData(response.body) };
  } catch {
    return { principal, status: 503 };
  }
}

export async function loadCreatorAdmin(request: Request): Promise<CreatorAdminLoad> {
  const principal = await loadPrincipal(request);
  if (principal.state !== 'authenticated' || !principal.isAdmin) {
    return { principal, status: principal.state === 'authenticated' ? 403 : principalStatus(principal) };
  }
  if (!principal.csrfToken) return { principal: { state: 'unavailable', isAdmin: false }, status: 503 };
  try {
    const [resources, profiles, claims] = await Promise.all([
      requestJson('/api/admin/recursos', request),
      requestJson('/api/admin/perfiles', request),
      requestJson('/api/admin/reclamaciones', request),
    ]);
    const failing = [resources, profiles, claims].find((response) => response.status !== 200 || response.body === undefined);
    if (failing) return { principal, status: failing.status };
    const allResources = readAdminResources(resources.body);
    const selected = selectAdminResources(allResources, new URL(request.url).searchParams);
    return {
      principal,
      status: 200,
      data: {
        resources: selected.resources,
        resourcePage: {
          query: selected.query,
          state: selected.state,
          page: selected.page,
          pageSize: selected.pageSize,
          pageCount: selected.pageCount,
          totalFiltered: selected.totalFiltered,
          totalResources: selected.totalResources,
          firstVisible: selected.firstVisible,
          lastVisible: selected.lastVisible,
          stateCounts: selected.stateCounts,
        },
        profiles: readAdminProfiles(profiles.body),
        claims: readAdminClaims(claims.body),
      },
    };
  } catch {
    return { principal, status: 503 };
  }
}

export const CREATOR_PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function safeJsonForScript(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) return 'null';
  return json
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

import { getCreatorRuntime } from '../../lib/creator-runtime.mjs';
import { creatorPageSessionBinding } from '../../lib/creator-session-context.mjs';
import { selectAdminResources } from '../../lib/creator-admin-pagination.mjs';
import { readCreatorClaimResources, readCreatorEditorData } from '../../lib/creator-owner-data';
import type { CreatorEditorDTO } from '../../types/creators';

export type CreatorPrincipalState = 'authenticated' | 'anonymous' | 'disabled' | 'unavailable';

export interface CreatorPagePrincipal {
  state: CreatorPrincipalState;
  csrfToken?: string;
  sessionBinding?: string;
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

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
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
  return listFrom(value, 'claims').map((item) => {
    const resources = readCreatorClaimResources(item.resources, item.resourceIds);
    return {
      id: item.id ?? item.claimId,
      accountId: item.accountId,
      resourceIds: item.resourceIds,
      ...(resources ? { resources } : {}),
      sourceId: item.sourceId,
      evidence: item.evidence,
      status: item.status,
      createdAt: item.createdAt,
    };
  });
}

async function loadPrincipal(request: Request): Promise<CreatorPagePrincipal> {
  try {
    const runtime = await getCreatorRuntime();
    const result: unknown = await runtime.auth.getPrincipal(request);
    const item = record(result);
    const state = item?.state;
    if (item && state === 'authenticated') {
      const sessionBinding = creatorPageSessionBinding(item);
      if (!sessionBinding || typeof item.csrfToken !== 'string' || item.csrfToken.trim().length === 0
        || typeof item.isAdmin !== 'boolean') {
        return { state: 'unavailable', isAdmin: false };
      }
      return {
        state,
        csrfToken: item.csrfToken,
        sessionBinding,
        isAdmin: item.isAdmin,
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
    return { principal, status: 200, data: readCreatorEditorData(response.body) };
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

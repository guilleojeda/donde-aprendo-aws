import {
  creatorPageSessionBindingFailureForRequest,
} from './creator-session-context.mjs';
import { parseHttpsOrigin } from './account-origin.mjs';
import { CreatorStateError } from './creator-state.mjs';
import { CREATOR_CONTRACT_HEADER, CREATOR_CONTRACT_VERSION, isCreatorPhotoId } from './creator-values.mjs';

const PRIVATE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: PRIVATE_HEADERS });
}

function sessionJson(value, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      ...PRIVATE_HEADERS,
      'referrer-policy': 'no-referrer',
      ...additionalHeaders,
    },
  });
}

export async function creatorSessionContext(request, auth) {
  if (request.method !== 'GET') {
    return sessionJson({ error: 'METHOD_NOT_ALLOWED' }, 405, { allow: 'GET' });
  }

  let principal;
  try {
    principal = (await auth.getRequestContext(request)).principal;
  } catch {
    return sessionJson({ error: 'AUTH_UNAVAILABLE' }, 503);
  }

  if (principal?.state === 'anonymous') return sessionJson({ error: 'AUTH_REQUIRED' }, 401);
  if (principal?.state !== 'authenticated' && principal?.state !== 'disabled') return sessionJson({ error: 'AUTH_UNAVAILABLE' }, 503);

  if (principal.state === 'authenticated'
    && (typeof principal.csrfToken !== 'string' || principal.csrfToken.trim().length === 0)) {
    return sessionJson({ error: 'AUTH_UNAVAILABLE' }, 503);
  }

  const requestedBinding = request.headers.get('x-creator-page-binding');
  const bindingFailure = creatorPageSessionBindingFailureForRequest(requestedBinding, principal, { required: true });
  if (bindingFailure) return sessionJson({ error: bindingFailure.error }, bindingFailure.status);
  if (principal.state === 'disabled') return sessionJson({ error: 'ACCOUNT_DISABLED' }, 403);

  return sessionJson({ csrfToken: principal.csrfToken });
}

async function smallJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4096) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function photoErrorStatus(error) {
  if (error?.code === 'PROFILE_VERSION_CONFLICT') return 409;
  if (['PROFILE_NOT_FOUND', 'UPLOAD_NOT_FOUND'].includes(error?.code)) return 404;
  if (['UPLOAD_EXPIRED', 'UPLOAD_NOT_PENDING', 'TEMPORARY_PHOTO_NOT_FOUND'].includes(error?.code)) return 409;
  if (['INVALID_PHOTO', 'INVALID_PHOTO_SIZE', 'UNSUPPORTED_PHOTO_FORMAT', 'PHOTO_TOO_MANY_PIXELS'].includes(error?.code)) return 422;
  return 503;
}

/** Session recovery and the photo ownership/CSRF boundary; domain APIs retain their own guards. */
export function createCreatorHttpHandler({ service, photos, auth, store, origin }) {
  const accountOrigin = parseHttpsOrigin(origin, 'origin').origin;
  return async function handle(request) {
    const pathname = new URL(request.url).pathname.replace(/\/$/, '');
    if (pathname === '/api/creador/sesion') return creatorSessionContext(request, auth);
    if (!['/api/creador/foto/autorizar', '/api/creador/foto/finalizar'].includes(pathname)) {
      return service.handle(request);
    }
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    try {
      const principal = (await auth.getRequestContext(request)).principal;
      if (principal.state === 'anonymous') return json({ error: 'AUTH_REQUIRED' }, 401);
      if (principal.state === 'disabled') {
        const bindingFailure = creatorPageSessionBindingFailureForRequest(request.headers.get('x-creator-page-binding'), principal);
        return json({ error: bindingFailure?.error ?? 'ACCOUNT_DISABLED' }, bindingFailure?.status ?? 403);
      }
      if (principal.state !== 'authenticated' || typeof principal.accountId !== 'string'
        || typeof principal.csrfToken !== 'string') return json({ error: 'AUTH_UNAVAILABLE' }, 503);
      if (request.headers.get('origin') !== accountOrigin || request.headers.get('x-csrf-token') !== principal.csrfToken) {
        return json({ error: 'CSRF_REJECTED' }, 403);
      }
      const requestedBinding = request.headers.get('x-creator-page-binding');
      const bindingFailure = creatorPageSessionBindingFailureForRequest(requestedBinding, principal);
      if (bindingFailure) return json({ error: bindingFailure.error }, bindingFailure.status);
      if (request.headers.get(CREATOR_CONTRACT_HEADER) !== CREATOR_CONTRACT_VERSION) {
        return json({ error: 'CREATOR_CONTRACT_OBSOLETE' }, 409);
      }
      const body = await smallJson(request);
      const isAuthorization = pathname.endsWith('/autorizar');
      const allowed = isAuthorization ? ['creatorVersion'] : ['creatorVersion', 'uploadId'];
      if (!body || Object.keys(body).some((key) => !allowed.includes(key))
        || !Number.isSafeInteger(body.creatorVersion) || body.creatorVersion < 0
        || (!isAuthorization && (typeof body.uploadId !== 'string' || body.uploadId.length === 0))) {
        return json({ error: 'INVALID_BODY' }, 422);
      }
      const owner = await store.get(`account-profile:${principal.accountId}`);
      if (!owner) return json({ error: 'PROFILE_NOT_FOUND' }, 404);
      if (!isCreatorPhotoId(owner.profileId)) return json({ error: 'INVALID_OWNER' }, 503);
      if (!isAuthorization && !isCreatorPhotoId(body.uploadId)) return json({ error: 'INVALID_PHOTO_REQUEST' }, 422);
      const input = { profileId: owner.profileId, expectedVersion: body.creatorVersion };
      if (isAuthorization) {
        const result = await photos.beginUpload(input);
        return json({
          schemaVersion: 2,
          operation: 'authorize-photo',
          profileId: owner.profileId,
          uploadId: result.uploadId,
          post: result.post,
        });
      }
      const result = await photos.finalizeUpload({ ...input, uploadId: body.uploadId });
      return json({
        schemaVersion: 2,
        operation: 'finalize-photo',
        profileId: owner.profileId,
        uploadId: body.uploadId,
        creatorVersion: result.creatorVersion,
        photo: result.photo,
        disposition: 'finalized',
      });
    } catch (error) {
      if (error instanceof CreatorStateError) return json({ error: error.code }, error.status);
      if (error?.code === 'CREATOR_PHOTO_READ_LIMIT') return json({ error: 'INVALID_PHOTO_REQUEST' }, 422);
      const status = photoErrorStatus(error);
      return json({ error: status === 503 ? 'PHOTO_UNAVAILABLE' : error.code }, status);
    }
  };
}

export async function creatorPhotoResponse(photos, profileId, version, { request, auth } = {}) {
  const notFound = () => new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
  const serviceUnavailable = () => new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
  const imageResponse = (photo) => {
    const headers = new Headers(photo.headers);
    headers.set('cache-control', 'private, no-store');
    headers.set('content-type', photo.contentType);
    return new Response(new Uint8Array(photo.body), { headers });
  };

  try {
    const publicPhoto = await photos.readPhoto({ profileId, version, access: 'public' });
    if (publicPhoto) return imageResponse(publicPhoto);

    if (!auth || !request || typeof auth.getRequestContext !== 'function') return serviceUnavailable();
    const principal = (await auth.getRequestContext(request))?.principal;
    if (principal?.state === 'unavailable') return serviceUnavailable();
    if (principal?.state !== 'authenticated') return notFound();
    const ownerPhoto = await photos.readPhoto({ profileId, version, access: 'owner', accountId: principal.accountId });
    return ownerPhoto ? imageResponse(ownerPhoto) : notFound();
  } catch {
    return serviceUnavailable();
  }
}

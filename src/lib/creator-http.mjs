const PRIVATE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: PRIVATE_HEADERS });
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
  if (error instanceof TypeError || error instanceof RangeError) return 422;
  if (error?.code === 'PROFILE_VERSION_CONFLICT') return 409;
  if (['PROFILE_NOT_FOUND', 'UPLOAD_NOT_FOUND'].includes(error?.code)) return 404;
  if (['UPLOAD_EXPIRED', 'UPLOAD_NOT_PENDING', 'TEMPORARY_PHOTO_NOT_FOUND'].includes(error?.code)) return 409;
  if (['INVALID_PHOTO', 'INVALID_PHOTO_SIZE', 'UNSUPPORTED_PHOTO_FORMAT', 'PHOTO_TOO_MANY_PIXELS'].includes(error?.code)) return 422;
  return 503;
}

/** HTTP ownership and CSRF boundary for photo operations; other APIs use the domain service. */
export function createCreatorHttpHandler({ service, photos, auth, store, origin }) {
  return async function handle(request) {
    const pathname = new URL(request.url).pathname.replace(/\/$/, '');
    if (!['/api/creador/foto/autorizar', '/api/creador/foto/finalizar'].includes(pathname)) {
      return service.handle(request);
    }
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
    try {
      const principal = await auth.getPrincipal(request);
      if (principal.state === 'anonymous') return json({ error: 'AUTH_REQUIRED' }, 401);
      if (principal.state === 'disabled') return json({ error: 'ACCOUNT_DISABLED' }, 403);
      if (principal.state !== 'authenticated' || typeof principal.accountId !== 'string'
        || typeof principal.csrfToken !== 'string') return json({ error: 'AUTH_UNAVAILABLE' }, 503);
      if (request.headers.get('origin') !== origin || request.headers.get('x-csrf-token') !== principal.csrfToken) {
        return json({ error: 'CSRF_REJECTED' }, 403);
      }
      const body = await smallJson(request);
      const allowed = pathname.endsWith('/autorizar') ? ['version'] : ['version', 'uploadId'];
      if (!body || Object.keys(body).some((key) => !allowed.includes(key))
        || !Number.isSafeInteger(body.version) || body.version < 0) {
        return json({ error: 'INVALID_BODY' }, 422);
      }
      const owner = await store.get(`account-profile:${principal.accountId}`);
      if (!owner) return json({ error: 'PROFILE_NOT_FOUND' }, 404);
      if (typeof owner.profileId !== 'string' || !owner.profileId) return json({ error: 'INVALID_OWNER' }, 503);
      const input = { profileId: owner.profileId, expectedVersion: body.version };
      if (pathname.endsWith('/autorizar')) return json(await photos.beginUpload(input));
      return json(await photos.finalizeUpload({ ...input, uploadId: body.uploadId }));
    } catch (error) {
      const status = photoErrorStatus(error);
      return json({ error: status === 503 ? 'PHOTO_UNAVAILABLE' : error.code ?? 'INVALID_PHOTO_REQUEST' }, status);
    }
  };
}

export async function creatorPhotoResponse(photos, profileId, version) {
  try {
    const photo = await photos.readPhoto({ profileId, version });
    if (!photo) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
    return new Response(new Uint8Array(photo.body), {
      headers: { ...photo.headers, 'content-type': photo.contentType },
    });
  } catch {
    return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}

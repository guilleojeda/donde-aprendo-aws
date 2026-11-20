import type { APIRoute } from 'astro';
import { getCreatorRuntime } from '../../../../lib/creator-runtime.mjs';
import { creatorPhotoResponse } from '../../../../lib/creator-http.mjs';
export const prerender = false;
export const GET: APIRoute = async ({ params, request }) => {
  try {
    const runtime = getCreatorRuntime();
    return await creatorPhotoResponse(runtime.photos, params.profileId, params.version, {
      request,
      auth: runtime.auth,
    });
  } catch {
    return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
};

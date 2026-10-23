import type { APIRoute } from 'astro';
import { getCreatorRuntime } from '../../../../lib/creator-runtime.mjs';
import { creatorPhotoResponse } from '../../../../lib/creator-http.mjs';
export const prerender = false;
export const GET: APIRoute = async ({ params }) => {
  try {
    return await creatorPhotoResponse(getCreatorRuntime().photos, params.profileId, params.version);
  } catch {
    return new Response(null, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
};

import type { APIRoute } from 'astro';
import { getCreatorRuntime } from '../../lib/creator-runtime.mjs';

export const creatorRoute: APIRoute = async ({ request }) => {
  try {
    return await getCreatorRuntime().handle(request);
  } catch {
    return new Response(JSON.stringify({ error: 'SERVICE_UNAVAILABLE' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' },
    });
  }
};

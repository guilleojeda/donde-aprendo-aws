import type { APIRoute } from 'astro';
import { getAccountAuth } from '../../lib/account-runtime.mjs';
import { creatorSessionContext } from '../../lib/creator-http.mjs';
import { getCreatorRuntime } from '../../lib/creator-runtime.mjs';
import { withPrivateResponsePolicy } from '../../lib/private-response.mjs';

export const creatorRoute: APIRoute = async ({ request }) => {
  try {
    const pathname = new URL(request.url).pathname.replace(/\/$/u, '');
    if (pathname === '/api/creador/sesion') {
      return withPrivateResponsePolicy(await creatorSessionContext(request, getAccountAuth()));
    }
    return withPrivateResponsePolicy(await getCreatorRuntime().handle(request));
  } catch {
    return withPrivateResponsePolicy(new Response(JSON.stringify({ error: 'SERVICE_UNAVAILABLE' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }));
  }
};

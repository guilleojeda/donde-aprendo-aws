import type { APIRoute } from 'astro';
import { getAccountAuth } from '../../lib/account-runtime.mjs';

type UnavailableBehavior = 'account-page' | 'service-response';

function privateNoStore(response: Response): Response {
  const cacheDirectives = new Set(
    (response.headers.get('Cache-Control') ?? '')
      .toLowerCase()
      .split(',')
      .map((directive) => directive.trim().split('=')[0]),
  );
  if (cacheDirectives.has('private') && cacheDirectives.has('no-store')) return response;

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function createAccountRoute(unavailableBehavior: UnavailableBehavior): APIRoute {
  return async ({ request }) => {
    try {
      const auth = await getAccountAuth();
      return privateNoStore(await auth.handle(request));
    } catch {
      if (unavailableBehavior === 'account-page') {
        return new Response(null, {
          status: 303,
          headers: {
            Location: '/cuenta/?estado=no-disponible',
            'Cache-Control': 'private, no-store',
          },
        });
      }

      return new Response('No pudimos completar la solicitud. Inténtalo de nuevo.', {
        status: 503,
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }
  };
}

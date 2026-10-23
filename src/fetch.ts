import type { Fetchable } from 'astro';
import { astro, FetchState } from 'astro/fetch';

const privatePath = (pathname: string): boolean =>
  ['/cuenta', '/api/creador', '/api/admin'].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export default {
  async fetch(request) {
    const state = new FetchState(request);
    const response = await astro(state);

    if (privatePath(state.pathname)) {
      response.headers.set('Cache-Control', 'private, no-store');
    } else if (state.pathname === '/c' || state.pathname.startsWith('/c/')) {
      response.headers.set('Cache-Control', 'no-store');
    }

    return response;
  },
} satisfies Fetchable;

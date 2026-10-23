import type { Fetchable } from 'astro';
import { astro, FetchState } from 'astro/fetch';

const accountPath = (pathname: string): boolean =>
  pathname === '/cuenta' || pathname.startsWith('/cuenta/');

export default {
  async fetch(request) {
    const state = new FetchState(request);
    const response = await astro(state);

    if (accountPath(state.pathname)) {
      response.headers.set('Cache-Control', 'private, no-store');
    }

    return response;
  },
} satisfies Fetchable;

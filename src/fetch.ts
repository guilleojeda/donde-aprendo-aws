import type { Fetchable } from 'astro';
import { astro, FetchState } from 'astro/fetch';
import { isPrivatePath } from './lib/amplify-security.mjs';
import { withPrivateResponsePolicy } from './lib/private-response.mjs';

export default {
  async fetch(request) {
    const state = new FetchState(request);
    const response = await astro(state);

    if (isPrivatePath(state.pathname)) return withPrivateResponsePolicy(response);
    if (state.pathname === '/c' || state.pathname.startsWith('/c/')) {
      response.headers.set('Cache-Control', 'no-store');
    }

    return response;
  },
} satisfies Fetchable;

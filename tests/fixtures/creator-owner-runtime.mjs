import { createCreatorPagesHarness, SITE_ORIGIN } from './creator-pages.mjs';
import { createCreatorHttpHandler } from '../../src/lib/creator-http.mjs';

const COOKIE_NAME = 'da_session';

function sessionId(request) {
  const cookie = request.headers.get('cookie') ?? '';
  const value = cookie.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return value ? decodeURIComponent(value.slice(COOKIE_NAME.length + 1)) : undefined;
}

/**
 * Runs the real creator-page service and HTTP boundary against one mutable principal
 * map. SSR and API requests identify the same test session through the da_session cookie.
 */
export async function createCreatorOwnerRuntime({ statistics } = {}) {
  const sessions = new Map();
  const serviceCalls = [];
  const accountCalls = [];
  let overrideServiceResponse;
  const getPrincipal = async (request) => sessions.get(sessionId(request))?.principal ?? { state: 'anonymous' };
  const pages = await createCreatorPagesHarness({ authenticate: getPrincipal, statistics });

  const service = {
    async handle(request) {
      const id = sessionId(request);
      const path = new URL(request.url).pathname;
      serviceCalls.push({ id, method: request.method, path });
      const overridden = await overrideServiceResponse?.(request, sessions.get(id));
      if (overridden instanceof Response) return overridden;
      return http(request);
    },
  };

  const auth = {
    getPrincipal,
  };

  const accountAuth = {
    async getSession(request) {
      const id = sessionId(request);
      accountCalls.push({ id, path: new URL(request.url).pathname });
      return sessions.get(id)?.accountSession ?? { state: 'anonymous' };
    },
  };

  const http = createCreatorHttpHandler({ service: pages.service, photos: undefined, auth, store: pages.store, origin: SITE_ORIGIN });

  function setSession(id, {
    principal = {
      state: 'authenticated',
      accountId: id === 'creator-a' ? 'private-account-a' : `private-account-${id}`,
      csrfToken: id === 'creator-a' ? 'csrf-a' : `csrf-${id}`,
      isAdmin: id === 'admin',
    },
    account = { email: `${id}@example.invalid` },
    csrfToken = id === 'creator-a' ? 'csrf-a' : `csrf-${id}`,
  } = {}) {
    sessions.set(id, {
      principal,
      accountSession: principal.state === 'authenticated'
        ? { state: 'authenticated', account, csrfToken, expiresAt: Date.now() + 60_000 }
        : principal.state === 'disabled'
          ? { state: 'disabled', csrfToken }
          : { state: principal.state },
    });
  }

  function request(pathname = '/cuenta/', { session, search = '' } = {}) {
    return new Request(new URL(`${pathname}${search}`, SITE_ORIGIN), {
      headers: session ? { cookie: `${COOKIE_NAME}=${encodeURIComponent(session)}` } : {},
    });
  }

  async function fetchApi(path, options = {}, { session = 'creator-a' } = {}) {
    const target = new URL(path, SITE_ORIGIN);
    const headers = new Headers(options.headers);
    headers.set('cookie', `${COOKIE_NAME}=${encodeURIComponent(session)}`);
    if (options.method && options.method !== 'GET' && !headers.has('origin')) headers.set('origin', SITE_ORIGIN);
    return http(new Request(target, { ...options, headers }));
  }

  return {
    pages,
    service,
    auth,
    accountAuth,
    sessions,
    serviceCalls,
    accountCalls,
    setSession,
    request,
    fetchApi,
    overrideServiceResponse(handler) { overrideServiceResponse = handler; },
  };
}

export { SITE_ORIGIN };

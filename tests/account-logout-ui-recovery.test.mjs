import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';
import {
  COGNITO_DOMAIN, ORIGIN, TEST_EMAIL, completeLogin, cookiePair,
  createAccountHarness, location, makeIdentity, makeRequest, responseCookies, sessionRequest,
} from './fixtures/account-auth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratchParent = path.join(root, '.work/creator-pages/repair-r9/logout');
await mkdir(scratchParent, { recursive: true });
const tempDir = await mkdtemp(path.join(scratchParent, 'astro-test-'));
const accountSource = path.join(root, 'src/pages/cuenta/index.astro');
const logoutSource = path.join(root, 'src/pages/cuenta/salir/index.astro');
const container = await experimental_AstroContainer.create({ astroConfig: { site: ORIGIN } });

await build({
  entryPoints: { account: accountSource, logout: logoutSource, notFound: path.join(root, 'src/pages/404.astro') },
  outdir: tempDir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outExtension: { '.js': '.mjs' },
  define: {
    'import.meta.env.PUBLIC_PRODUCTION': '"true"',
    'import.meta.env.PUBLIC_SITE_ORIGIN': JSON.stringify(ORIGIN),
  },
  plugins: [{
    name: 'real-account-auth-for-astro',
    setup(api) {
      api.onLoad({ filter: /\/account-runtime\.mjs$/ }, () => ({
        contents: 'export function getAccountAuth() { return globalThis.__logoutUiAuth; }',
        loader: 'js',
      }));
      api.onLoad({ filter: /\/creator-runtime\.mjs$/ }, () => ({
        contents: `
          function sessionId(request) {
            const cookie = request.headers.get('cookie') ?? '';
            const value = cookie.split(';').map((part) => part.trim())
              .find((part) => part.startsWith('da_session='));
            return value ? decodeURIComponent(value.slice('da_session='.length)) : undefined;
          }
          export async function getCreatorRuntime() {
            return {
              auth: {
                async getPrincipal(request) {
                  return globalThis.__logoutUiCreatorSessions?.get(sessionId(request))
                    ?? { state: 'anonymous' };
                },
              },
              service: {
                async handle() {
                  return Response.json({ profile: null, links: [], editableResources: [], claims: [], series: [] });
                },
              },
            };
          }
        `,
        loader: 'js',
      }));
      api.onResolve({ filter: /\?raw$/ }, ({ path: requested, resolveDir }) => ({
        path: path.resolve(resolveDir, requested.slice(0, -4)),
        namespace: 'account-ui-raw',
      }));
      api.onLoad({ filter: /.*/, namespace: 'account-ui-raw' }, async ({ path: filename }) => ({
        contents: await readFile(filename, 'utf8'),
        loader: 'text',
      }));
      api.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      api.onLoad({ filter: /\.astro$/ }, async ({ path: filename }) => ({
        contents: transform(await readFile(filename, 'utf8'), {
          filename,
          internalURL: 'astro/compiler-runtime',
          resultScopedSlot: true,
          resolvePath: (specifier) => specifier,
        }).code,
        loader: 'ts',
      }));
    },
  }],
});

const [{ default: accountPage }, { default: logoutPage }, { default: notFoundPage }] = await Promise.all([
  import(pathToFileURL(path.join(tempDir, 'account.mjs'))),
  import(pathToFileURL(path.join(tempDir, 'logout.mjs'))),
  import(pathToFileURL(path.join(tempDir, 'notFound.mjs'))),
]);

after(async () => {
  delete globalThis.__logoutUiAuth;
  delete globalThis.__logoutUiCreatorSessions;
  await rm(tempDir, { recursive: true, force: true });
});

async function render(page, request) {
  return container.renderToResponse(page, { request, partial: false });
}

test('the real 404 layout excludes Analytics for private paths while public missing pages retain measurement', async () => {
  for (const pathname of ['/cuenta', '/cuenta/', '/cuenta/desconocida/', '/api/creador/desconocida/', '/api/admin/desconocida/']) {
    const response = await render(notFoundPage, new Request(`${ORIGIN}${pathname}?referencia=local`));
    const html = await response.text();
    assert.match(html, /Página no encontrada/);
    assert.match(html, /noindex, nofollow/);
    assert.doesNotMatch(html, /src="\/assets\/analytics\.js"/, pathname);
  }
  for (const pathname of ['/runtime-route-that-does-not-exist/', '/cuentanos/', '/api/creadores/']) {
    const response = await render(notFoundPage, new Request(`${ORIGIN}${pathname}`));
    assert.match(await response.text(), /src="\/assets\/analytics\.js"/, pathname);
  }
});

function csrfFrom(html) {
  const match = html.match(/<input\b(?=[^>]*\bname="csrfToken")(?=[^>]*\bvalue="([A-Za-z0-9_-]{43})")[^>]*>/);
  assert.ok(match, 'expected the rendered form to contain its CSRF token');
  return match[1];
}

function actionFrom(html) {
  const match = html.match(/<form\b(?=[^>]*\bmethod="post")(?=[^>]*\baction="([^"]+)")[^>]*>/);
  assert.ok(match, 'expected a real POST form in the rendered page');
  return match[1];
}

function logoutPost(sessionCookie, csrfToken, origin = ORIGIN) {
  return makeRequest('/cuenta/salir/', {
    method: 'POST',
    headers: { cookie: cookiePair(sessionCookie), origin },
    body: new URLSearchParams({ csrfToken }),
  });
}

function submitRenderedLogoutForm(sessionCookie, html) {
  return makeRequest(actionFrom(html), {
    method: 'POST',
    headers: { cookie: cookiePair(sessionCookie), origin: ORIGIN },
    body: new URLSearchParams({ csrfToken: csrfFrom(html) }),
  });
}

async function signedInPage(harness) {
  const login = await completeLogin(harness);
  globalThis.__logoutUiAuth = harness.auth;
  const creatorPrincipal = await harness.auth.getPrincipal(sessionRequest(login.sessionCookie));
  const creatorSessionId = decodeURIComponent(cookiePair(login.sessionCookie).slice('da_session='.length));
  globalThis.__logoutUiCreatorSessions = new Map([[creatorSessionId, creatorPrincipal]]);
  const pageResponse = await render(accountPage, sessionRequest(login.sessionCookie));
  assert.equal(pageResponse.status, 200);
  return { login, pageResponse, csrfToken: csrfFrom(await pageResponse.text()) };
}

test('the Astro logout error offers a real retry that confirms revocation and completes Cognito logout', async () => {
  const harness = await createAccountHarness();
  const { login, csrfToken } = await signedInPage(harness);
  const deleteSession = harness.store.deleteSession.bind(harness.store);
  let loseAcknowledgement = true;
  harness.store.deleteSession = async (key) => {
    await deleteSession(key);
    if (loseAcknowledgement) {
      loseAcknowledgement = false;
      throw new Error('controlled lost acknowledgement');
    }
  };

  const failedResponse = await render(logoutPage, logoutPost(login.sessionCookie, csrfToken));
  const failedHtml = await failedResponse.text();
  assert.equal(failedResponse.status, 503);
  assert.equal(failedResponse.headers.get('location'), null);
  assert.match(failedResponse.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(failedResponse.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(failedResponse.headers.has('x-account-logout-retry-csrf'), false);
  assert.equal(responseCookies(failedResponse).length, 0);
  assert.match(failedHtml, /No pudimos confirmar el cierre de sesión/);
  assert.match(failedHtml, /Reintentar cierre de sesión/);
  assert.equal(actionFrom(failedHtml), '/cuenta/salir/');
  assert.equal(csrfFrom(failedHtml), csrfToken);
  assert.doesNotMatch(failedHtml, new RegExp(TEST_EMAIL));
  assert.equal(harness.store.sessions.size, 0);

  const retryResponse = await render(logoutPage, submitRenderedLogoutForm(login.sessionCookie, failedHtml));
  assert.equal(retryResponse.status, 303);
  assert.equal(location(retryResponse).origin, COGNITO_DOMAIN);
  assert.equal(location(retryResponse).pathname, '/logout');
  assert.equal(harness.store.sessions.size, 0);
  assert.ok(responseCookies(retryResponse).some((cookie) => cookie.startsWith('da_session=;') && /Max-Age=0/i.test(cookie)));
  assert.ok(responseCookies(retryResponse).every((cookie) => !/Path=\/cuenta\//i.test(cookie)));
});

test('a reloaded disabled account page offers a protected logout with retry and the revoked cookie stays anonymous after reactivation', async () => {
  const harness = await createAccountHarness();
  const { login } = await signedInPage(harness);
  const account = await harness.store.getAccount(makeIdentity());
  harness.store.seedAccount({ ...account, active: false });

  const disabledResponse = await render(accountPage, sessionRequest(login.sessionCookie));
  const disabledHtml = await disabledResponse.text();
  assert.equal(disabledResponse.status, 403);
  assert.match(disabledResponse.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.match(disabledHtml, /Esta cuenta está desactivada/);
  assert.doesNotMatch(disabledHtml, new RegExp(TEST_EMAIL));
  assert.doesNotMatch(disabledHtml, /href="\/cuenta\/(?:administracion|creador|estadisticas)\//);
  assert.equal(actionFrom(disabledHtml), '/cuenta/salir/');
  const disabledCsrfToken = csrfFrom(disabledHtml);
  assert.equal(disabledCsrfToken, (await harness.auth.getSession(sessionRequest(login.sessionCookie))).csrfToken);

  const rejectedRequests = [
    logoutPost(login.sessionCookie, disabledCsrfToken, 'https://other.invalid'),
    makeRequest('/cuenta/salir/', {
      method: 'POST',
      headers: { cookie: cookiePair(login.sessionCookie), origin: ORIGIN },
      body: new URLSearchParams(),
    }),
  ];
  for (const request of rejectedRequests) {
    const rejected = await render(logoutPage, request);
    const rejectedHtml = await rejected.text();
    assert.equal(rejected.status, 403);
    assert.match(rejected.headers.get('cache-control') ?? '', /private.*no-store/i);
    assert.equal(responseCookies(rejected).length, 0);
    assert.doesNotMatch(rejectedHtml, /name="csrfToken"/);
    assert.equal((await harness.auth.getSession(sessionRequest(login.sessionCookie))).state, 'disabled');
  }
  assert.equal(harness.store.calls.filter(({ operation }) => operation === 'deleteSession').length, 0);

  harness.store.failNext('deleteSession', new Error('controlled disabled-session write failure'));
  const failedLogout = await render(logoutPage, submitRenderedLogoutForm(login.sessionCookie, disabledHtml));
  const failedLogoutHtml = await failedLogout.text();
  assert.equal(failedLogout.status, 503);
  assert.equal(failedLogout.headers.get('location'), null);
  assert.equal(responseCookies(failedLogout).length, 0);
  assert.match(failedLogoutHtml, /No pudimos confirmar el cierre de sesión/);
  assert.equal(actionFrom(failedLogoutHtml), '/cuenta/salir/');
  assert.equal(csrfFrom(failedLogoutHtml), disabledCsrfToken);
  assert.doesNotMatch(failedLogoutHtml, new RegExp(TEST_EMAIL));
  assert.equal(harness.store.sessions.size, 1);

  const logoutResponse = await render(logoutPage, submitRenderedLogoutForm(login.sessionCookie, failedLogoutHtml));
  assert.equal(logoutResponse.status, 303);
  assert.equal(location(logoutResponse).origin, COGNITO_DOMAIN);
  assert.equal(location(logoutResponse).pathname, '/logout');
  assert.equal(harness.store.sessions.size, 0);
  assert.ok(responseCookies(logoutResponse).some((cookie) => cookie.startsWith('da_session=;') && /Max-Age=0/i.test(cookie)));

  harness.store.seedAccount({ ...account, active: true });
  const afterReactivation = await render(accountPage, sessionRequest(login.sessionCookie));
  const afterReactivationHtml = await afterReactivation.text();
  assert.equal(afterReactivation.status, 200);
  assert.match(afterReactivationHtml, /Accede o crea una cuenta/);
  assert.doesNotMatch(afterReactivationHtml, new RegExp(TEST_EMAIL));
  assert.equal((await harness.auth.getSession(sessionRequest(login.sessionCookie))).state, 'anonymous');
});

test('the Astro route preserves GET 405 and no-cookie redirect behavior', async () => {
  const methodNotAllowed = await render(logoutPage, makeRequest('/cuenta/salir/'));
  assert.equal(methodNotAllowed.status, 405);
  assert.equal(methodNotAllowed.headers.get('allow'), 'POST');
  assert.match(methodNotAllowed.headers.get('cache-control') ?? '', /private.*no-store/i);

  const harness = await createAccountHarness();
  globalThis.__logoutUiAuth = harness.auth;
  const noCookie = await render(logoutPage, makeRequest('/cuenta/salir/', {
    method: 'POST',
    headers: { origin: ORIGIN },
  }));
  assert.equal(noCookie.status, 303);
  assert.equal(location(noCookie).href, `${ORIGIN}/cuenta/`);
  assert.ok(responseCookies(noCookie).every((cookie) => !/Path=\/cuenta\//i.test(cookie)));
});

test('runtime initialization failure stays unavailable and does not claim or redirect a completed logout', async () => {
  const harness = await createAccountHarness();
  const { login, csrfToken } = await signedInPage(harness);
  delete globalThis.__logoutUiAuth;

  const response = await render(logoutPage, logoutPost(login.sessionCookie, csrfToken));
  const html = await response.text();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('location'), null);
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(responseCookies(response).length, 0);
  assert.match(html, /No pudimos completar el cierre de sesión/);
  assert.doesNotMatch(html, /name="csrfToken"/);
  assert.equal(harness.store.sessions.size, 1);
});

test('a failed session read keeps logout unavailable and offers no unvalidated token', async () => {
  const harness = await createAccountHarness();
  const { login, csrfToken } = await signedInPage(harness);
  harness.store.failNext('getSession', new Error('controlled session read failure'));

  const response = await render(logoutPage, logoutPost(login.sessionCookie, csrfToken));
  const html = await response.text();
  assert.equal(response.status, 303);
  assert.equal(location(response).pathname, '/cuenta/');
  assert.equal(location(response).searchParams.get('estado'), 'no-disponible');
  assert.equal(responseCookies(response).length, 0);
  assert.doesNotMatch(html, /name="csrfToken"/);
  assert.equal(harness.store.sessions.size, 1);
});

test('a failed delete keeps an actionable retry, while invalid or cross-origin submissions do not revoke', async () => {
  const harness = await createAccountHarness();
  const { login, csrfToken } = await signedInPage(harness);

  const invalidToken = `${csrfToken[0] === 'A' ? 'B' : 'A'}${csrfToken.slice(1)}`;
  const invalidTokenResponse = await render(logoutPage, logoutPost(login.sessionCookie, invalidToken));
  const invalidTokenHtml = await invalidTokenResponse.text();
  assert.equal(invalidTokenResponse.status, 403);
  assert.doesNotMatch(invalidTokenHtml, /name="csrfToken"/);
  assert.equal(harness.store.sessions.size, 1);

  const foreignOriginResponse = await render(logoutPage, logoutPost(login.sessionCookie, csrfToken, 'https://other.invalid'));
  const foreignOriginHtml = await foreignOriginResponse.text();
  assert.equal(foreignOriginResponse.status, 403);
  assert.doesNotMatch(foreignOriginHtml, /name="csrfToken"/);
  assert.equal(responseCookies(foreignOriginResponse).length, 0);
  assert.equal(harness.store.sessions.size, 1);

  let requestBodyRead = false;
  const largeForeignRequest = new Request(new URL('/cuenta/salir/', ORIGIN), {
    method: 'POST',
    headers: {
      cookie: cookiePair(login.sessionCookie),
      origin: 'https://other.invalid',
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': '9000',
    },
    body: `csrfToken=${'A'.repeat(9000)}`,
  });
  for (const method of ['clone', 'formData', 'text']) {
    Object.defineProperty(largeForeignRequest, method, {
      value() {
        requestBodyRead = true;
        return Request.prototype[method].call(this);
      },
    });
  }
  const largeForeignResponse = await render(logoutPage, largeForeignRequest);
  assert.equal(largeForeignResponse.status, 403);
  assert.equal(requestBodyRead, false);
  assert.equal(harness.store.sessions.size, 1);

  harness.store.failNext('deleteSession', new Error('controlled write failure before delete'));
  const failedResponse = await render(logoutPage, logoutPost(login.sessionCookie, csrfToken));
  const failedHtml = await failedResponse.text();
  assert.equal(failedResponse.status, 503);
  assert.equal(responseCookies(failedResponse).length, 0);
  assert.equal(harness.store.sessions.size, 1);
  assert.equal(actionFrom(failedHtml), '/cuenta/salir/');
  assert.equal(csrfFrom(failedHtml), csrfToken);

  const retryResponse = await render(logoutPage, submitRenderedLogoutForm(login.sessionCookie, failedHtml));
  assert.equal(retryResponse.status, 303);
  assert.equal(location(retryResponse).origin, COGNITO_DOMAIN);
  assert.equal(location(retryResponse).pathname, '/logout');
  assert.equal(harness.store.sessions.size, 0);
});

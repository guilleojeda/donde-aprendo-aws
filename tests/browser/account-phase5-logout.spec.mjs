import assert from 'node:assert/strict';
import { COGNITO_DOMAIN } from '../fixtures/account-auth.mjs';
import { test, expect, addCookie, loggedInOwner } from '../fixtures/creator-browser-test.mjs';
import { request as playwrightRequest } from '@playwright/test';

async function openCreatorOutage(fixture, page) {
  const cookie = await fixture.login();
  await addCookie(page.context(), fixture, cookie);
  const originalRead = fixture.creatorRuntime.service.readCreatorEditor;
  fixture.creatorRuntime.service.readCreatorEditor = async () => {
    throw new Error('controlled creator configuration outage');
  };
  try {
    const response = await page.goto(`${fixture.origin}/cuenta/`, { waitUntil: 'load' });
    assert.equal(response?.status(), 503);
    await expect(page.getByRole('heading', { name: 'No pudimos cargar tu página', exact: true })).toBeVisible();
    const form = page.locator('form[data-account-logout]');
    await expect(form).toBeVisible();
    await expect(form.locator('button[type="submit"]')).toBeEnabled();
    return form;
  } catch (error) {
    fixture.creatorRuntime.service.readCreatorEditor = originalRead;
    throw error;
  }
}

async function openHealthyCreator(fixture, page) {
  await loggedInOwner(fixture, page);
  await page.goto(`${fixture.origin}/cuenta/`, { waitUntil: 'load' });
  const accountMenu = page.locator('.creator-owner__account-menu');
  if (!await accountMenu.evaluate((element) => element.open)) await accountMenu.locator(':scope > summary').click();
  const form = page.locator('form[data-account-logout]');
  await expect(form).toBeVisible();
  await expect(form.locator('button[type="submit"]')).toBeEnabled();
  return form;
}

function deleteCount(fixture) {
  return fixture.accountStore.calls.filter(({ operation }) => operation === 'deleteSession').length;
}

async function interceptProviderLogout(page) {
  const requests = [];
  const handler = async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, COGNITO_DOMAIN, 'only the fixed provider boundary is intercepted');
    assert.equal(url.pathname, '/logout');
    requests.push(url);
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<title>provider fixture</title>' });
  };
  await page.route('**/logout**', handler);
  return {
    requests,
    async close() {
      await page.unroute('**/logout**', handler).catch(() => {});
    },
  };
}

async function assertProviderCompletion(page, provider, appOrigin) {
  await expect.poll(() => provider.requests.length).toBe(1);
  await expect.poll(() => {
    const url = new URL(page.url());
    return url.origin === COGNITO_DOMAIN && url.pathname === '/logout';
  }).toBe(true);
  assert.equal(provider.requests[0].searchParams.get('logout_uri'), `${appOrigin}/cuenta/`,
    'the provider request keeps the application logout return parameter');
}

function watchLogoutPosts(page) {
  const posts = [];
  const listener = (request) => {
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname === '/cuenta/salir/') posts.push(request);
  };
  page.on('request', listener);
  return {
    posts,
    stop() { page.off('request', listener); },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test('the rendered creator outage keeps a visible logout control and completes provider logout', async ({ fixture, page }) => {
  const form = await openCreatorOutage(fixture, page);
  const provider = await interceptProviderLogout(page);
  const logoutPosts = watchLogoutPosts(page);
  try {
    const button = form.locator('button[type="submit"]');
    await expect(button).toHaveAccessibleName('Cerrar sesión');
    await button.click();
    await expect.poll(() => logoutPosts.posts.length).toBe(1);
    await assertProviderCompletion(page, provider, fixture.origin);
    assert.equal(fixture.accountStore.sessions.size, 0, 'the visible fallback logout revokes local state');
    assert.equal(deleteCount(fixture), 1);
  } finally {
    await provider.close();
    logoutPosts.stop();
  }
});

test('the signed-in creator shell recovers when the real logout response is withheld before headers', async ({ fixture, page }) => {
  const form = await openHealthyCreator(fixture, page);
  const provider = await interceptProviderLogout(page);
  const logoutPosts = watchLogoutPosts(page);
  const entered = deferred();
  const release = deferred();
  const finished = deferred();
  let firstLogout = true;
  let upstream;
  const holdResponse = async (route) => {
    if (!firstLogout || route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    firstLogout = false;
    try {
      // Keep the real application request, but use an independent HTTP
      // client. route.fetch() can process Set-Cookie in the browser context
      // before the intercepted response is delivered, which would make this
      // held-response assertion observe the wrong cookie state.
      upstream ??= await playwrightRequest.newContext({ ignoreHTTPSErrors: true });
      const intercepted = route.request();
      const response = await upstream.fetch(intercepted.url(), {
        method: intercepted.method(),
        headers: intercepted.headers(),
        data: intercepted.postDataBuffer() ?? undefined,
        maxRedirects: 0,
      });
      assert.equal(response.status(), 200);
      await response.body();
      assert.equal(fixture.accountStore.sessions.size, 0,
        'the real application commits local revocation before the response is handed to the browser');
      entered.resolve(response);
      await release.promise;
      // The timed-out first response stays undelivered. An abort after
      // client-side cancellation may report that the request already ended.
      await route.abort().catch(() => {});
    } catch (error) {
      entered.reject(error);
    } finally {
      finished.resolve();
    }
  };
  await page.route('**/cuenta/salir/**', holdResponse);
  try {
    const button = form.locator('button[type="submit"]');
    await expect(button).toHaveAccessibleName('Cerrar sesión');
    await button.click();
    await expect.poll(() => logoutPosts.posts.length).toBe(1);
    await entered.promise;
    assert.equal(deleteCount(fixture), 1);
    await expect.poll(async () => (await page.context().cookies()).some(({ name }) => name === 'da_session')).toBe(true);
    await expect(form.locator('[data-account-logout-status]')).toContainText(/No pudimos confirmar el cierre de sesión/i, { timeout: 10_000 });
    await expect(button).toBeEnabled();
    await expect(button).toHaveAccessibleName(/Reintentar cierre de sesión/i);
    assert.equal(logoutPosts.posts.length, 1, 'the browser exposes retry before sending another request');
    assert.equal(fixture.accountStore.sessions.size, 0);
    assert.equal(deleteCount(fixture), 1, 'a response-header timeout does not replay local revocation');

    release.resolve();
    await finished.promise;
    await page.unroute('**/cuenta/salir/**', holdResponse);
    await upstream?.dispose();
    upstream = undefined;
    await button.click();
    await expect.poll(() => logoutPosts.posts.length).toBe(2);
    await assertProviderCompletion(page, provider, fixture.origin);
    assert.equal(deleteCount(fixture), 1, 'the explicit retry only continues to Cognito');
  } finally {
    release.resolve();
    await finished.promise.catch(() => {});
    await page.unroute('**/cuenta/salir/**', holdResponse).catch(() => {});
    await upstream?.dispose().catch(() => {});
    await provider.close();
    logoutPosts.stop();
  }
});

test('the signed-in creator shell receives cookie deletion on truncated JSON and retries provider logout', async ({ fixture, page }) => {
  const form = await openHealthyCreator(fixture, page);
  const provider = await interceptProviderLogout(page);
  const logoutPosts = watchLogoutPosts(page);
  let firstLogout = true;
  let setCookie;
  const appLogout = async (route) => {
    if (!firstLogout || route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    firstLogout = false;
    const response = await route.fetch();
    const headers = response.headers();
    setCookie = headers['set-cookie'];
    delete headers['content-length'];
    delete headers['content-encoding'];
    await route.fulfill({ status: response.status(), headers, body: '{"redirect":' });
  };
  await page.route('**/cuenta/salir/**', appLogout);
  try {
    const button = form.locator('button[type="submit"]');
    await expect(button).toHaveAccessibleName('Cerrar sesión');
    await button.click();
    await expect.poll(() => logoutPosts.posts.length).toBe(1);
    await expect(form.locator('[data-account-logout-status]')).toContainText(/No pudimos confirmar el cierre de sesión/i);
    await expect(button).toBeEnabled();
    await expect(button).toHaveAccessibleName(/Reintentar cierre de sesión/i);
    assert.ok(setCookie && /da_session=;/i.test(setCookie), 'the browser received the local cookie deletion header');
    await expect.poll(async () => (await page.context().cookies()).some(({ name }) => name === 'da_session')).toBe(false);
    assert.equal(fixture.accountStore.sessions.size, 0, 'the real application boundary revoked local state');
    assert.equal(deleteCount(fixture), 1, 'the truncated response did not replay local revocation');

    await page.unroute('**/cuenta/salir/**', appLogout);
    await button.click();
    await expect.poll(() => logoutPosts.posts.length).toBe(2);
    await assertProviderCompletion(page, provider, fixture.origin);
    assert.equal(deleteCount(fixture), 1, 'the cookie-less retry only continues to Cognito');
  } finally {
    await page.unroute('**/cuenta/salir/**', appLogout).catch(() => {});
    await provider.close();
    logoutPosts.stop();
  }
});

test('the signed-in creator shell recovers from a stalled logout body after headers commit cookie deletion', async ({ fixture, page }) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      const request = new Request(args[0], args[1]);
      if (window.__phase5StallLogout !== true || new URL(request.url).pathname !== '/cuenta/salir/') return response;
      // The native request has received the real response headers and the
      // browser has processed Set-Cookie before the client sees this body.
      await response.arrayBuffer();
      const signal = args[1]?.signal;
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"redirect":"'));
          const abort = () => controller.error(signal?.reason ?? new Error('logout body aborted'));
          if (signal?.aborted) abort();
          else signal?.addEventListener('abort', abort, { once: true });
        },
      });
      return new Response(stream, { status: response.status, headers: { 'content-type': 'application/json' } });
    };
  });
  const form = await openHealthyCreator(fixture, page);
  const provider = await interceptProviderLogout(page);
  const logoutPosts = watchLogoutPosts(page);
  await page.evaluate(() => { window.__phase5StallLogout = true; });
  try {
    const button = form.locator('button[type="submit"]');
    await expect(button).toHaveAccessibleName('Cerrar sesión');
    await button.click();
    await expect.poll(() => logoutPosts.posts.length).toBe(1);
    await expect.poll(async () => (await page.context().cookies()).some(({ name }) => name === 'da_session')).toBe(false);
    assert.equal(fixture.accountStore.sessions.size, 0);
    assert.equal(deleteCount(fixture), 1);
    await expect(form.locator('[data-account-logout-status]')).toContainText(/No pudimos confirmar el cierre de sesión/i, { timeout: 10_000 });
    await expect(button).toBeEnabled();
    await expect(button).toHaveAccessibleName(/Reintentar cierre de sesión/i);
    assert.equal(logoutPosts.posts.length, 1, 'a stalled body does not trigger an automatic retry');
    assert.equal(deleteCount(fixture), 1, 'a stalled body does not replay local revocation');

    await page.evaluate(() => { window.__phase5StallLogout = false; });
    await button.click();
    await expect.poll(() => logoutPosts.posts.length).toBe(2);
    await assertProviderCompletion(page, provider, fixture.origin);
    assert.equal(deleteCount(fixture), 1, 'the stalled-body retry only continues to Cognito');
  } finally {
    await provider.close();
    logoutPosts.stop();
  }
});

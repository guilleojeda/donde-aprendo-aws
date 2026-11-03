import assert from 'node:assert/strict';
import { test as base, expect } from '@playwright/test';
import { startCreatorBrowserApp } from '../fixtures/creator-browser-app.mjs';

const test = base.extend({
  app: [async ({}, use) => {
    const app = await startCreatorBrowserApp();
    try {
      await use(app);
    } finally {
      await app.close();
    }
  }, { scope: 'worker' }],
  fixture: [async ({ app }, use) => {
    const fixture = await app.createFixture();
    fixture.publish();
    try {
      await use(fixture);
    } finally {
      fixture.clear();
    }
  }, { auto: true }],
  publicPage: async ({ browser }, use) => {
    const context = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
    try {
      await use(await context.newPage());
    } finally {
      await context.close();
    }
  },
  checkBrowserErrors: [async ({ page }, use, testInfo) => {
    const errors = [];
    const listener = (error) => errors.push(error);
    page.on('pageerror', listener);
    try {
      await use();
    } finally {
      page.off('pageerror', listener);
      expect(errors.map((error) => error.message), `${testInfo.title}: uncaught browser page errors`).toEqual([]);
    }
  }, { auto: true }],
});

async function addCookie(context, fixture, cookie) {
  await context.addCookies([{
    name: cookie.name,
    value: cookie.value,
    url: fixture.origin,
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
  }]);
}

async function api(fixture, cookie, route, options = {}) {
  const response = await fixture.request(cookie, route, options);
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, body };
}

async function createProfile(fixture, cookie, overrides = {}) {
  const result = await api(fixture, cookie, '/api/creador/perfil', {
    method: 'PUT',
    body: {
      displayName: 'Ana Browser',
      slug: 'ana-browser',
      socials: {},
      ...overrides,
    },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body?.profile?.version, 1);
  return result.body.profile;
}

async function createSeries(fixture, cookie, { name, slug, description } = {}) {
  const current = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(current.response.status, 200);
  const result = await api(fixture, cookie, '/api/creador/series', {
    method: 'POST',
    body: {
      name: name ?? 'Serie de prueba',
      slug: slug ?? 'serie-prueba',
      profileVersion: current.body.profile.version,
      ...(description === undefined ? {} : { description }),
    },
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.series;
}

async function addLink(fixture, cookie, { title, url } = {}) {
  const result = await api(fixture, cookie, '/api/creador/enlaces', {
    method: 'POST',
    body: { title: title ?? 'Enlace de prueba', url: url ?? 'https://links.example/prueba' },
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.body));
  return result.body.link;
}

async function addChapter(fixture, cookie, seriesId, placementId) {
  const current = await api(fixture, cookie, '/api/creador/perfil');
  assert.equal(current.response.status, 200);
  const result = await api(fixture, cookie, `/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}`, {
    method: 'PUT',
    body: { profileVersion: current.body.profile.version },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

async function captureCreatorApi(page, { ignoreReads = false, skipErrorBodies = false } = {}) {
  const records = [];
  const pending = new Map();
  const requestHandler = (request) => {
    const pathname = new URL(request.url()).pathname;
    if (!pathname.startsWith('/api/creador/')) return;
    if (ignoreReads && request.method() === 'GET') return;
    const rawRequestBody = request.postData();
    let settle;
    let responseReceived;
    const record = {
      method: request.method(),
      url: request.url(),
      path: pathname.replace(/\/$/u, ''),
      body: rawRequestBody ? JSON.parse(rawRequestBody) : undefined,
      responseBody: undefined,
      settled: new Promise((resolve) => { settle = resolve; }),
      responseObserved: new Promise((resolve) => { responseReceived = resolve; }),
      markResponseObserved: () => responseReceived(),
    };
    record.finish = settle;
    records.push(record);
    pending.set(request, record);
  };
  const requestFailedHandler = (request) => {
    const record = pending.get(request);
    if (!record) return;
    record.failed = request.failure()?.errorText ?? 'request failed';
    record.markResponseObserved();
    record.finish();
    pending.delete(request);
  };
  const responseHandler = async (response) => {
    const request = response.request();
    const record = pending.get(request);
    if (!record) return;
    record.status = response.status();
    record.responseHeaders = response.headers();
    record.markResponseObserved();
    if (skipErrorBodies && record.status >= 400) {
      record.finish();
      pending.delete(request);
      return;
    }
    const rawBody = await response.body().catch(() => Buffer.alloc(0));
    const rawResponseBody = rawBody.toString('utf8');
    try {
      record.responseBody = rawResponseBody ? JSON.parse(rawResponseBody) : undefined;
    } catch {
      record.responseBody = undefined;
    }
    record.finish();
    pending.delete(request);
  };
  page.on('request', requestHandler);
  page.on('requestfailed', requestFailedHandler);
  page.on('response', responseHandler);
  return {
    records,
    writes() { return records.filter(({ method }) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)); },
    async settle({ skipErrorBodies = false } = {}) {
      const captured = [...records];
      if (!skipErrorBodies) {
        await Promise.all(captured.map(({ settled }) => settled));
        return;
      }
      await Promise.all(captured.map(async (record) => {
        await record.responseObserved;
        if (record.failed) return;
        if (typeof record.status === 'number' && record.status >= 400) return;
        await record.settled;
      }));
    },
    async stop(options) {
      await this.settle(options);
      page.off('request', requestHandler);
      page.off('requestfailed', requestFailedHandler);
      page.off('response', responseHandler);
    },
  };
}

function seriesForm(page) {
  return page.locator('[data-owner-dialog] form[data-owner-form="serie"]');
}

function seriesRow(page, seriesId) {
  return page.locator(`[data-owner-series-row="${seriesId}"]`);
}

async function openSeriesView(page, fixture, search = '') {
  await page.goto(`${fixture.origin}/cuenta/?vista=series${search}`);
  await expect(page.locator('[data-creator-owner]'), `account-store calls: ${JSON.stringify(fixture.accountStore.calls.map(({ operation }) => operation))}; creator-store calls: ${JSON.stringify(fixture.creatorStore.calls.map(({ operation }) => operation))}`)
    .toBeVisible();
  await expect(page.getByRole('heading', { name: 'Series', exact: true })).toBeVisible();
}

async function createSeriesInBrowser(page, { name, slug, description = '' }) {
  await page.getByRole('button', { name: 'Crear serie' }).click();
  const form = seriesForm(page);
  await expect(form).toBeVisible();
  await form.getByLabel('Nombre de la serie').fill(name);
  await form.getByLabel('Dirección de la serie').fill(slug);
  if (description) await form.getByLabel(/Descripción/).fill(description);
  await form.getByRole('button', { name: 'Guardar serie' }).click();
  const row = page.locator('[data-owner-series-row]').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  return row;
}

async function loggedInOwner(fixture, page, { profile = true, profileFields = {} } = {}) {
  const cookie = await fixture.login();
  await addCookie(page.context(), fixture, cookie);
  const installed = (await page.context().cookies(fixture.origin)).find(({ name }) => name === cookie.name);
  assert.equal(installed?.value, cookie.value, 'the browser context receives the real account-session cookie');
  if (profile) await createProfile(fixture, cookie, profileFields);
  return cookie;
}

export { test, expect, addCookie, api, createProfile, createSeries, addLink, addChapter, captureCreatorApi, seriesForm, seriesRow, openSeriesView, createSeriesInBrowser, loggedInOwner };

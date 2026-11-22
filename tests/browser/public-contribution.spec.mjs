import assert from 'node:assert/strict';
import { currentUrlReservation } from '../../src/lib/catalog-url.mjs';
import { MAX_SUBMISSION_BODY_BYTES } from '../../src/api/submission.mjs';
import { test, expect } from '../fixtures/contribution-browser-test.mjs';

const SUBMITTED_AT = '2026-10-21T12:00:00.000Z';

function formControls(page) {
  const form = page.locator('[data-contribution-form]');
  return {
    form,
    email: form.getByLabel('Tu correo electrónico'),
    fullName: form.getByLabel('Tu nombre completo'),
    title: form.getByLabel('Título o nombre'),
    url: form.getByLabel('URL'),
    text: form.getByLabel('Descripción'),
    kind: form.getByLabel('¿Qué compartes?'),
    format: form.getByLabel('Formato'),
    submit: form.locator('[data-contribution-submit]'),
    status: form.locator('[data-contribution-status]'),
  };
}

async function openContribution(page, fixture) {
  await page.goto(`${fixture.origin}/`);
  const controls = formControls(page);
  await expect(controls.form).toBeVisible();
  await expect(controls.submit).toBeEnabled();
  return controls;
}

async function fillContribution(controls, {
  email = 'ana@example.invalid',
  fullName = 'Ana Contributor',
  title = 'Curso de AWS',
  url = 'https://example.invalid/contribution/one?source=browser',
  text = 'Descripción pública del recurso.',
  kind = 'content',
  format = 'Curso',
} = {}) {
  await controls.email.fill(email);
  await controls.fullName.fill(fullName);
  await controls.title.fill(title);
  await controls.url.fill(url);
  await controls.text.fill(text);
  await controls.kind.selectOption(kind);
  await controls.format.selectOption(format);
  return { email, fullName, title, url, text, kind, format };
}

async function waitForStoredSubmission(fixture, url, id = 'resource-browser-submission-1') {
  await expect.poll(() => fixture.pendingRows().some((item) => item.id === id)).toBe(true);
  const pending = fixture.pendingRows().find((item) => item.id === id);
  assert.ok(pending);
  assert.equal(pending.url, url);
  assert.equal(pending.published, false);
  const reservation = fixture.reservationRows().find((candidate) => candidate.id === currentUrlReservation(url, id).id);
  assert.deepEqual(reservation, currentUrlReservation(url, id));
  return pending;
}

async function expectUncertainStatus(status) {
  await expect(status).toHaveAttribute('data-status', 'error');
  await expect(status).toContainText(/(?:no pudimos|no se pudo|no fue posible) (?:confirmar|verificar)/iu);
}

function ariaIds(control) {
  return control.getAttribute('aria-describedby').then((value) => (
    value ?? ''
  ).split(/\s+/u).filter(Boolean));
}

async function findVisibleDescription(form, ids, pattern) {
  for (const id of ids) {
    const candidate = form.locator(`[id="${id}"]`);
    if (await candidate.count() === 0 || !(await candidate.isVisible())) continue;
    if (pattern.test(await candidate.innerText())) return candidate;
  }
  return undefined;
}

async function expectContributionFieldError(control, form, pattern, { focus = true } = {}) {
  await expect(control).toHaveAttribute('aria-invalid', 'true');
  const ids = await ariaIds(control);
  assert.ok(ids.includes('contribution-help'), 'the field keeps its permanent help association');
  const error = await findVisibleDescription(form, ids, pattern);
  assert.ok(error, `the field exposes a visible corrective message (${ids.join(', ')})`);
  const errorId = await error.getAttribute('id');
  assert.ok(errorId, 'the field error has a stable association target');
  assert.ok(ids.includes(errorId), 'the field points to its visible error');
  assert.equal(await error.evaluate((element) => element.closest('form')?.matches('[data-contribution-form]')), true,
    'the field error belongs to this contribution form');
  if (focus) await expect(control).toBeFocused();
  return error;
}

async function expectContributionGroupError(controls, form, pattern, { group, focus = true } = {}) {
  const errorIds = [];
  for (const control of controls) {
    await expect(control).toHaveAttribute('aria-invalid', 'true');
    const ids = await ariaIds(control);
    assert.ok(ids.includes('contribution-help'), 'group controls keep their permanent help association');
    const error = await findVisibleDescription(form, ids, pattern);
    assert.ok(error, 'each group control points to the visible group correction');
    errorIds.push(await error.getAttribute('id'));
  }
  assert.equal(new Set(errorIds).size, 1, 'group controls share one accessible diagnosis');
  if (group) await expect(group).toHaveAttribute('aria-invalid', 'true');
  if (focus) await expect(controls[0]).toBeFocused();
  return form.locator(`[id="${errorIds[0]}"]`);
}

async function expectContributionTopicsError(form, pattern, { focus = true } = {}) {
  const group = form.locator('fieldset:has(input[data-contribution-topic])').first();
  await expect(group).toBeVisible();
  await expect(group).toHaveAttribute('aria-invalid', 'true');
  await expect(group.locator('legend')).toContainText(/hasta tres/iu);
  const groupIds = await ariaIds(group);
  const error = await findVisibleDescription(form, groupIds, pattern);
  assert.ok(error, 'the topics group exposes a visible corrective message');
  const errorId = await error.getAttribute('id');
  assert.ok(errorId, 'the topics group error has a stable association target');
  const controls = form.locator('input[data-contribution-topic]');
  for (let index = 0; index < await controls.count(); index += 1) {
    const ids = await ariaIds(controls.nth(index));
    assert.ok(ids.includes(errorId), 'each topic checkbox points to the group correction');
  }
  if (focus) await expect(controls.first()).toBeFocused();
  return { group, error };
}

async function expectContributionFieldCleared(control, error) {
  await expect(control).not.toHaveAttribute('aria-invalid', 'true');
  await expect(error).toBeHidden();
  assert.ok((await ariaIds(control)).includes('contribution-help'),
    'correcting the field keeps its permanent help association');
}

async function installSubmissionMutation(page, fixture, {
  mutate = (payload) => payload,
  responseBody,
  responseStatus,
  hold = false,
} = {}) {
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  const endpoint = `${fixture.apiOrigin}/submissions`;
  const handler = async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    const payload = mutate(structuredClone(request.postDataJSON()));
    const actual = await route.fetch({
      postData: JSON.stringify(payload),
      headers: { ...request.headers(), 'content-type': 'application/json' },
    });
    const actualBodyText = await actual.text();
    let actualBody;
    try {
      actualBody = JSON.parse(actualBodyText);
    } catch {
      actualBody = undefined;
    }
    const body = typeof responseBody === 'function'
      ? responseBody({ actual, payload, body: actualBody })
      : responseBody === undefined ? actualBody : responseBody;
    started.resolve({ request, actual, payload, body, status: actual.status() });
    if (hold) await release.promise;
    const headers = actual.headers();
    delete headers['content-length'];
    await route.fulfill({
      status: responseStatus ?? actual.status(),
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  };
  await page.route(endpoint, handler);
  return {
    started: started.promise,
    release: () => release.resolve(),
    async remove() { await page.unroute(endpoint, handler).catch(() => {}); },
  };
}

test('native invalidity is keyboard-locatable, keeps help, and clears on correction', async ({ fixture, page }) => {
  const controls = await openContribution(page, fixture);

  await controls.form.evaluate((form) => {
    window.__contributionInvalidEvents = [];
    form.addEventListener('invalid', (event) => {
      window.__contributionInvalidEvents.push({
        id: event.target.id,
        defaultPrevented: event.defaultPrevented,
      });
    }, true);
  });

  await controls.submit.focus();
  await controls.submit.press('Enter');
  await expectContributionFieldError(controls.email, controls.form, /completa|obligator/iu);
  await expect(controls.status).toBeHidden();
  assert.ok((await ariaIds(controls.email)).includes('contribution-privacy'),
    'the email field keeps its privacy help beside the native error');
  await expect.poll(() => page.evaluate(() => window.__contributionInvalidEvents.length)).toBeGreaterThan(0);
  assert.equal(await page.evaluate(() => window.__contributionInvalidEvents.some((event) => (
    event.id === 'contribution-email' && event.defaultPrevented
  ))), true, 'the inline presentation prevents a duplicate native bubble');
  assert.equal(fixture.requests.length, 0, 'native invalidity blocks the network request');

  await fillContribution(controls, { email: 'correo-invalido', url: 'not-a-url' });
  await controls.submit.focus();
  await controls.submit.press('Enter');
  const emailError = await expectContributionFieldError(controls.email, controls.form, /correo electr[oó]nico v[aá]lido/iu);
  const urlError = await expectContributionFieldError(controls.url, controls.form, /URL v[aá]lida/iu, { focus: false });
  await expect(controls.status).toBeHidden();
  await controls.email.fill('ana@example.invalid');
  await expectContributionFieldCleared(controls.email, emailError);
  assert.ok((await ariaIds(controls.email)).includes('contribution-privacy'),
    'clearing the email error keeps its privacy help association');
  await expect(urlError).toBeVisible();
  await expect(controls.url).toHaveAttribute('aria-invalid', 'true');
  await controls.submit.focus();
  await controls.submit.press('Enter');
  await expect(controls.url).toBeFocused();
  assert.equal(fixture.requests.length, 0, 'a native URL mismatch remains client-side');

  await controls.url.fill('https://example.invalid/contribution/native-corrected');
  await expectContributionFieldCleared(controls.url, urlError);
  await expect(controls.url).toBeFocused();
  assert.ok((await ariaIds(controls.url)).includes('contribution-help'));
});

test('the fourth topic is explained as one correctable group and does not submit', async ({ fixture, page }) => {
  const controls = await openContribution(page, fixture);
  await fillContribution(controls, { url: 'https://example.invalid/contribution/fourth-topic' });
  const topics = controls.form.locator('input[data-contribution-topic]');
  for (const index of [0, 1, 2]) await topics.nth(index).check();
  await topics.nth(3).click();
  await expect(topics.nth(3)).not.toBeChecked();
  const { error } = await expectContributionTopicsError(controls.form, /tema|tres|3/iu, { focus: false });
  await expect(topics.nth(3)).toBeFocused();
  await expect(controls.status).toBeHidden();
  await expect(controls.form.locator('[data-contribution-error]:visible')).toHaveCount(1);
  assert.equal(fixture.requests.length, 0, 'the local topic limit does not call the service');

  await topics.nth(0).uncheck();
  await expect(error).toBeHidden();
  await expect(controls.form.locator('fieldset:has(input[data-contribution-topic])').first())
    .not.toHaveAttribute('aria-invalid', 'true');
  await expect(topics.nth(0)).not.toHaveAttribute('aria-invalid', 'true');
  await topics.nth(3).check();
  await expect(controls.form.locator('input[data-contribution-topic]:checked')).toHaveCount(3);
});

test('a real invalid URL rejection identifies the field, preserves the draft, and persists a deliberate correction', async ({ fixture, page }) => {
  const controls = await openContribution(page, fixture);
  const submitted = await fillContribution(controls, {
    url: 'ftp://example.invalid/no-segura',
    title: 'Título conservado ante rechazo de URL',
  });

  await controls.submit.click();
  const request = await fixture.waitForRequestCount(1);
  assert.equal(request.status, 400);
  assert.deepEqual(JSON.parse(request.resultBody).fieldErrors, [{ field: 'url', reason: 'invalid_url' }]);
  const urlError = await expectContributionFieldError(controls.url, controls.form, /URL|direcci[oó]n|HTTP/iu);
  await expect(controls.status).toBeHidden();
  await expect(controls.form.locator('[data-contribution-error]:visible')).toHaveCount(1);
  await expect(controls.title).toHaveValue(submitted.title);
  await expect(controls.url).toHaveValue(submitted.url);
  assert.equal(fixture.pendingRows().length, 0, 'a definitive field rejection writes nothing');

  await controls.url.fill('https://example.invalid/contribution/server-url-corrected');
  await expectContributionFieldCleared(controls.url, urlError);
  await controls.submit.click();
  await fixture.waitForRequestCount(2);
  await expect(controls.status).toHaveAttribute('data-status', 'success');
  const stored = await waitForStoredSubmission(fixture, 'https://example.invalid/contribution/server-url-corrected');
  assert.equal(stored.title, submitted.title, 'the corrected submission preserves the other draft values');
});

test('a real kind-format rejection shares one group diagnosis and accepts only the corrected retry', async ({ fixture, page }) => {
  const controls = await openContribution(page, fixture);
  const submitted = await fillContribution(controls, {
    kind: 'source',
    format: 'Blog',
    url: 'https://example.invalid/contribution/server-kind-format',
    title: 'Título conservado ante rechazo de combinación',
  });
  const mutation = await installSubmissionMutation(page, fixture, {
    mutate: (payload) => ({ ...payload, format: 'Video' }),
  });
  try {
    await controls.submit.click();
    const rejected = await mutation.started;
    assert.equal(rejected.status, 400);
    assert.deepEqual(rejected.body.fieldErrors, [{
      field: 'kind-format', reason: 'invalid_combination',
    }]);
    await expectContributionGroupError(
      [controls.kind, controls.format],
      controls.form,
      /tipo|formato|combin/iu,
    );
    await expect(controls.status).toBeHidden();
    await expect(controls.form.locator('[data-contribution-error]:visible')).toHaveCount(1);
    await expect(controls.title).toHaveValue(submitted.title);
    await expect(controls.url).toHaveValue(submitted.url);
    assert.equal(fixture.pendingRows().length, 0, 'a definitive group rejection writes nothing');
  } finally {
    await mutation.remove();
  }

  await controls.kind.selectOption('content');
  await controls.format.selectOption('Curso');
  await expect(controls.kind).not.toHaveAttribute('aria-invalid', 'true');
  await expect(controls.format).not.toHaveAttribute('aria-invalid', 'true');
  await controls.submit.click();
  await fixture.waitForRequestCount(2);
  await expect(controls.status).toHaveAttribute('data-status', 'success');
  const stored = await waitForStoredSubmission(fixture, submitted.url);
  assert.deepEqual({ kind: stored.kind, format: stored.format }, { kind: 'content', format: 'Curso' });
});

test('a late topics diagnosis applies to the submitted value without stealing newer focus or draft fields', async ({ fixture, page }) => {
  const controls = await openContribution(page, fixture);
  const submitted = await fillContribution(controls, {
    url: 'https://example.invalid/contribution/late-topics',
    title: 'Título enviado antes de la respuesta tardía',
  });
  const topics = controls.form.locator('input[data-contribution-topic]');
  for (const index of [0, 1, 2]) await topics.nth(index).check();
  const mutation = await installSubmissionMutation(page, fixture, {
    mutate: (payload) => ({ ...payload, topics: [...payload.topics, 'Redes'] }),
    hold: true,
  });
  let newerTitle;
  try {
    await controls.submit.click();
    await mutation.started;
    newerTitle = 'Título editado mientras llegaba el rechazo';
    await controls.title.fill(newerTitle);
    await controls.title.focus();
    mutation.release();
    const { group, error } = await expectContributionTopicsError(controls.form, /tema|tres|3/iu, { focus: false });
    await expect(controls.title).toHaveValue(newerTitle);
    await expect(controls.title).toBeFocused();
    await expect(controls.title).not.toHaveAttribute('aria-invalid', 'true');
    await expect(controls.url).toHaveValue(submitted.url);
    await expect(group).toBeVisible();
    await expect(error).toBeVisible();
    await expect(controls.status).toBeHidden();
  } finally {
    mutation.release();
    await mutation.remove();
  }

  await topics.nth(0).uncheck();
  await expect(controls.form.locator('fieldset:has(input[data-contribution-topic])').first())
    .not.toHaveAttribute('aria-invalid', 'true');
  await controls.submit.click();
  await fixture.waitForRequestCount(2);
  await expect(controls.status).toHaveAttribute('data-status', 'success');
  const stored = await waitForStoredSubmission(fixture, submitted.url);
  assert.deepEqual(stored.topics, ['Certificaciones', 'Comunidad']);
  assert.equal(stored.title, newerTitle);
});

test('a late topics diagnosis is discarded when the submitted topic value changes first', async ({ fixture, page }) => {
  const controls = await openContribution(page, fixture);
  const submitted = await fillContribution(controls, {
    url: 'https://example.invalid/contribution/stale-topics',
    title: 'Título cuyo diagnóstico queda obsoleto',
  });
  const topics = controls.form.locator('input[data-contribution-topic]');
  for (const index of [0, 1, 2]) await topics.nth(index).check();
  const mutation = await installSubmissionMutation(page, fixture, {
    mutate: (payload) => ({ ...payload, topics: [...payload.topics, 'Redes'] }),
    hold: true,
  });
  try {
    await controls.submit.click();
    const rejected = await mutation.started;
    assert.equal(rejected.status, 400);
    await topics.nth(0).uncheck();
    await topics.nth(0).focus();
    mutation.release();
    await expect(controls.status).toHaveAttribute('data-status', 'error');
    await expect(controls.status).toContainText(/revisa los datos/iu);
    await expect(controls.status).not.toBeFocused();
    await expect(topics.nth(0)).toBeFocused();
    await expect(controls.form.locator('fieldset:has(input[data-contribution-topic])').first())
      .not.toHaveAttribute('aria-invalid', 'true');
    await expect(controls.form.locator('[data-contribution-error]:visible')).toHaveCount(0);
    await expect(controls.title).toHaveValue(submitted.title);
    await expect(controls.url).toHaveValue(submitted.url);
    assert.deepEqual(rejected.body.fieldErrors, [{ field: 'topics', reason: 'invalid_option' }]);
  } finally {
    mutation.release();
    await mutation.remove();
  }

  await controls.submit.click();
  await fixture.waitForRequestCount(2);
  await expect(controls.status).toHaveAttribute('data-status', 'success');
  const stored = await waitForStoredSubmission(fixture, submitted.url);
  assert.deepEqual(stored.topics, ['Certificaciones', 'Comunidad']);
});

const generalResponseCases = [
  ['without diagnostics', {
    mutate: (payload) => ({ ...payload, website: 'https://bot.invalid' }),
  }],
  ['with a known field and an unknown reason', {
    mutate: (payload) => ({ ...payload, website: 'https://bot.invalid' }),
    responseBody: ({ body }) => ({
      ...body,
      fieldErrors: [{ field: 'url', reason: 'unknown_reason' }],
    }),
  }],
  ['with an unreadable response body', {
    mutate: (payload) => ({ ...payload, website: 'https://bot.invalid' }),
    responseBody: 'not-json',
  }],
  ['with a 500 and a field diagnostic', {
    mutate: (payload) => ({ ...payload, website: 'https://bot.invalid' }),
    responseStatus: 500,
    responseBody: {
      ok: false,
      code: 'storage_error',
      fieldErrors: [{ field: 'url', reason: 'invalid_url' }],
    },
  }],
];

for (const [label, mutationOptions] of generalResponseCases) {
  test(`a response ${label} stays general and editable`, async ({ fixture, page }) => {
    const controls = await openContribution(page, fixture);
    const submitted = await fillContribution(controls, {
      url: `https://example.invalid/contribution/general-${label.replaceAll(/\s+/gu, '-')}`,
      title: 'Borrador conservado ante rechazo general',
    });
    const mutation = await installSubmissionMutation(page, fixture, mutationOptions);
    try {
      const response = page.waitForResponse((received) => received.request().method() === 'POST'
        && received.url() === `${fixture.apiOrigin}/submissions`);
      await controls.submit.click();
      const rejected = await mutation.started;
      assert.equal(rejected.status, 400, 'the fixture handler rejects before storage');
      assert.equal((await response).status(), mutationOptions.responseStatus ?? 400);
      if (mutationOptions.responseStatus === 500) {
        await expectUncertainStatus(controls.status);
      } else {
        await expect(controls.status).toHaveAttribute('data-status', 'error');
        await expect(controls.status).toContainText(/revisa los datos/iu);
      }
      await expect(controls.status).toBeFocused();
      await expect(controls.form.locator('[aria-invalid="true"]')).toHaveCount(0);
      await expect(controls.form.locator('[data-contribution-error]:visible')).toHaveCount(0);
      await expect(controls.email).toHaveValue(submitted.email);
      await expect(controls.title).toHaveValue(submitted.title);
      await expect(controls.url).toHaveValue(submitted.url);
      assert.equal(fixture.pendingRows().length, 0, 'general rejection writes nothing');
    } finally {
      await mutation.remove();
    }

    await controls.title.fill(`${submitted.title} corregido`);
    await controls.submit.click();
    await fixture.waitForRequestCount(2);
    await expect(controls.status).toHaveAttribute('data-status', 'success');
    const stored = await waitForStoredSubmission(fixture, submitted.url);
    assert.equal(stored.title, `${submitted.title} corregido`);
  });
}

test('a definitive 400 with timely headers stays general while its response body is late', async ({ fixture, page }) => {
  test.setTimeout(45_000);
  await page.clock.install({ time: new Date('2026-10-21T11:00:00.000Z') });
  const controls = await openContribution(page, fixture);
  const submitted = await fillContribution(controls, {
    url: 'ftp://example.invalid/late-rejection-body',
    title: 'Borrador ante rechazo con cuerpo tardío',
  });
  const held = fixture.queueResponse({ mode: 'hold-body' });

  const response = page.waitForResponse((received) => received.request().method() === 'POST'
    && received.url() === `${fixture.apiOrigin}/submissions`);
  await controls.submit.click();
  await held.headersSent;
  assert.equal((await response).status(), 400, 'the browser received definitive rejection headers');
  await page.clock.runFor(13_000);
  await expect(controls.status).toHaveAttribute('data-status', 'error');
  await expect(controls.status).toContainText(/revisa los datos/iu);
  await expect(controls.status).toBeFocused();
  await expect(controls.form.locator('[aria-invalid="true"]')).toHaveCount(0);
  await expect(controls.form.locator('[data-contribution-error]:visible')).toHaveCount(0);
  await expect(controls.submit).toBeEnabled();
  await expect(controls.title).toHaveValue(submitted.title);
  await expect(controls.url).toHaveValue(submitted.url);
  assert.equal(fixture.pendingRows().length, 0, 'a definitive invalid request does not write while its body is late');

  await held.release();
  await held.bodySent;
  await controls.url.fill('https://example.invalid/contribution/late-rejection-corrected');
  await controls.submit.click();
  await fixture.waitForRequestCount(2);
  await expect(controls.status).toHaveAttribute('data-status', 'success');
  await waitForStoredSubmission(fixture, 'https://example.invalid/contribution/late-rejection-corrected');
});

async function advancePastDeliveryDeadline(page, controls) {
  await page.clock.runFor(6_000);
  await expect(controls.submit).toBeDisabled();
  await page.clock.runFor(6_500);
  await expectUncertainStatus(controls.status);
}

async function installContributionDeliveryControl(page, endpoint) {
  await page.addInitScript(({ targetEndpoint }) => {
    const nativeFetch = window.fetch.bind(window);
    const delivery = {
      captures: [],
      release(index) {
        this.captures[index]?.release?.();
      },
    };
    window.__contributionDelivery = delivery;

    window.fetch = async (input, options) => {
      const url = input instanceof Request ? input.url : new URL(String(input), document.baseURI).href;
      const method = options?.method ?? (input instanceof Request ? input.method : 'GET');
      if (method !== 'POST' || url !== targetEndpoint) return nativeFetch(input, options);

      const response = await nativeFetch(input, options);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const heldResponse = new Response(bytes, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      if (delivery.captures.length >= 2) return heldResponse;

      const gate = Promise.withResolvers();
      const capture = {
        status: response.status,
        bodyText: new TextDecoder().decode(bytes),
        delivery: 'unread',
        release: gate.resolve,
      };
      delivery.captures.push(capture);
      // The real read has settled before this gate. Aborting transport or
      // closing a stream can no longer revoke the bytes already read.
      async function holdCompletion(realRead) {
        const result = await realRead;
        if (capture.delivery === 'unread') {
          capture.delivery = 'held';
          await gate.promise;
          capture.delivery = 'released';
        }
        return result;
      }
      for (const name of ['arrayBuffer', 'bytes', 'json', 'text']) {
        if (typeof heldResponse[name] !== 'function') continue;
        const read = heldResponse[name].bind(heldResponse);
        heldResponse[name] = () => holdCompletion(read());
      }
      const getReader = heldResponse.body.getReader.bind(heldResponse.body);
      heldResponse.body.getReader = (options) => {
        const reader = getReader(options);
        const read = reader.read.bind(reader);
        reader.read = (...args) => holdCompletion(read(...args));
        return reader;
      };
      return heldResponse;
    };
  }, { targetEndpoint: endpoint });
}

async function waitForHeldCapture(page, index) {
  await expect.poll(() => page.evaluate((captureIndex) => Boolean(
    window.__contributionDelivery?.captures[captureIndex]?.delivery === 'held',
  ), index)).toBe(true);
  return page.evaluate((captureIndex) => window.__contributionDelivery.captures[captureIndex], index);
}

async function releaseHeldCapture(page, index) {
  await page.evaluate((captureIndex) => window.__contributionDelivery.release(captureIndex), index);
  await expect.poll(() => page.evaluate((captureIndex) => (
    window.__contributionDelivery.captures[captureIndex]?.delivery
  ), index)).toBe('released');
  await page.evaluate(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

test('submits the rendered form through the real handler and shows the exact pending receipt', async ({ fixture, page }) => {
  const controls = await openContribution(page, fixture);
  const submitted = await fillContribution(controls, { url: 'https://example.invalid/contribution/exact-receipt' });

  await controls.submit.click();
  const request = await fixture.waitForRequestCount(1);
  await expect(controls.status).toHaveAttribute('data-status', 'success');
  const pending = await waitForStoredSubmission(fixture, submitted.url);

  assert.equal(request.method, 'POST');
  assert.equal(request.status, 201);
  assert.match(request.headers['content-type'] ?? '', /^application\/json(?:;|$)/iu);
  assert.ok(request.bodyBytes > 0 && request.bodyBytes <= MAX_SUBMISSION_BODY_BYTES);
  assert.deepEqual(JSON.parse(request.body), {
    email: submitted.email,
    full_name: submitted.fullName,
    title: submitted.title,
    url: submitted.url,
    text: submitted.text,
    kind: submitted.kind,
    format: submitted.format,
    topics: [],
    website: '',
  });
  assert.equal(pending.title, submitted.title);
  assert.equal(pending.description, submitted.text);
  assert.equal(pending.submittedAt, SUBMITTED_AT);
  assert.equal(pending.submitterName, submitted.fullName);
  assert.equal(pending.submitterEmail, submitted.email);
  assert.equal(pending.kind, submitted.kind);
  assert.equal(pending.format, submitted.format);

  await expect(controls.status.locator('code')).toHaveText('resource-browser-submission-1');
  await expect(controls.status.locator('time')).toHaveAttribute('datetime', SUBMITTED_AT);
  assert.equal(await controls.status.locator('time').getAttribute('datetime'), pending.submittedAt);
  await expect(controls.status.locator('time')).toContainText('21 oct 2026');
  await expect(controls.status.locator('time')).toContainText('12:00');
  await expect(controls.status).not.toContainText(submitted.email);
  await expect(controls.status).not.toContainText(submitted.fullName);
  await expect(controls.status).toBeFocused();

  for (const field of [controls.email, controls.fullName, controls.title, controls.url, controls.text]) {
    await expect(field).toHaveValue('');
  }
  await expect(controls.kind).toHaveValue('');
  await expect(controls.format).toHaveValue('');
  await expect(controls.form.locator('input[name="topics"]:checked')).toHaveCount(0);
});

test('preserves an intervening edit and its focus while resetting only the unchanged submitted draft', async ({ fixture, page }) => {
  const controls = await openContribution(page, fixture);
  const submitted = await fillContribution(controls, {
    url: 'https://example.invalid/contribution/intervening-edit',
    text: 'Descripción enviada antes de la edición.',
  });
  const held = fixture.queueResponse({ mode: 'hold-body' });

  await controls.submit.click();
  await held.ready;
  await held.headersSent;
  await controls.text.fill('Edición nueva mientras el envío está pendiente.');
  await expect(controls.text).toBeFocused();
  held.release();

  await expect(controls.status).toHaveAttribute('data-status', 'success');
  await expect(controls.text).toHaveValue('Edición nueva mientras el envío está pendiente.');
  await expect(controls.text).toBeFocused();
  await expect(controls.email).toHaveValue(submitted.email);
  await expect(controls.fullName).toHaveValue(submitted.fullName);
  await expect(controls.title).toHaveValue(submitted.title);
  await expect(controls.url).toHaveValue(submitted.url);
  await waitForStoredSubmission(fixture, submitted.url);
  assert.equal(fixture.pendingRows()[0].description, submitted.text, 'the stored item is the submitted snapshot, not the later local edit');
  await expect(controls.status.locator('code')).toHaveText('resource-browser-submission-1');
});

test('retains a newer multi-field draft context and focus after the submitted receipt arrives', async ({ fixture, page }) => {
  const controls = await openContribution(page, fixture);
  const submitted = await fillContribution(controls, {
    url: 'https://example.invalid/contribution/multi-field-original',
    title: 'Título enviado originalmente',
    text: 'Descripción enviada originalmente.',
  });
  const held = fixture.queueResponse({ mode: 'hold-body' });

  await controls.submit.click();
  await held.ready;
  await held.headersSent;
  const newer = {
    title: 'Título editado mientras esperaba',
    url: 'https://example.invalid/contribution/multi-field-newer',
    text: 'Descripción editada mientras esperaba.',
  };
  await controls.title.fill(newer.title);
  await controls.url.fill(newer.url);
  await controls.text.fill(newer.text);
  await controls.kind.selectOption('source');
  await controls.format.selectOption('Blog');
  await controls.form.locator('input[data-contribution-topic]').first().check();
  await controls.title.focus();
  held.release();

  await expect(controls.status).toHaveAttribute('data-status', 'success');
  await expect(controls.status.locator('code')).toHaveText('resource-browser-submission-1');
  await expect(controls.status).toContainText(submitted.title);
  await expect(controls.status).not.toContainText(newer.title);
  await expect(controls.title).toHaveValue(newer.title);
  await expect(controls.url).toHaveValue(newer.url);
  await expect(controls.text).toHaveValue(newer.text);
  await expect(controls.kind).toHaveValue('source');
  await expect(controls.format).toHaveValue('Blog');
  await expect(controls.form.locator('input[data-contribution-topic]:checked')).toHaveCount(1);
  await expect(controls.title).toBeFocused();
  const pending = await waitForStoredSubmission(fixture, submitted.url);
  assert.equal(pending.title, submitted.title);
  assert.equal(pending.url, submitted.url);
  assert.equal(pending.description, submitted.text);
  assert.equal(pending.kind, submitted.kind);
  assert.equal(pending.format, submitted.format);
});

test('treats duplicate rejection as authoritative without a manufactured receipt or phantom write', async ({ fixture, page }) => {
  const controls = await openContribution(page, fixture);
  const url = 'https://example.invalid/contribution/duplicate';
  await fillContribution(controls, { url });
  await controls.submit.click();
  await fixture.waitForRequestCount(1);
  await expect(controls.status).toHaveAttribute('data-status', 'success');
  await waitForStoredSubmission(fixture, url);

  const duplicate = await fillContribution(controls, {
    fullName: 'Otra Persona',
    title: 'Segundo envío con la misma URL',
    text: 'Este intento debe conservarse para que la persona lo revise.',
    url,
  });
  await controls.submit.click();
  const request = await fixture.waitForRequestCount(2);
  await expect(controls.status).toHaveAttribute('data-status', 'error');
  await expect(controls.status).toContainText('ya está registrado');
  await expect(controls.status.locator('code')).toHaveCount(0);
  await expect(controls.status.locator('time')).toHaveCount(0);
  await expect(controls.title).toHaveValue(duplicate.title);
  await expect(controls.url).toHaveValue(url);
  assert.equal(request.status, 409);
  assert.equal(fixture.pendingRows().length, 1);
  assert.equal(fixture.reservationRows().length, 1);
  assert.equal(fixture.store.calls.filter(({ operation }) => operation === 'transactWrite').length, 1);
});

test('does not claim success for a malformed 201 after an intervening edit and keeps the real pending write without a receipt', async ({ fixture, page }) => {
  const controls = await openContribution(page, fixture);
  const submitted = await fillContribution(controls, {
    url: 'https://example.invalid/contribution/malformed-201',
    title: 'Envío con acuse truncado',
  });
  const malformed = fixture.queueResponse({ mode: 'hold-body', body: '{"ok":true,"code":"created"' });

  await controls.submit.click();
  const request = await fixture.waitForRequestCount(1);
  await malformed.ready;
  await malformed.headersSent;
  await controls.text.fill('Edición posterior al envío, sin acuse válido.');
  await expect(controls.text).toBeFocused();
  malformed.release();
  await expectUncertainStatus(controls.status);
  await expect(controls.status).not.toContainText('¡Gracias!');
  await expect(controls.status.locator('code')).toHaveCount(0);
  await expect(controls.status.locator('time')).toHaveCount(0);
  await expect(controls.email).toHaveValue(submitted.email);
  await expect(controls.fullName).toHaveValue(submitted.fullName);
  await expect(controls.title).toHaveValue(submitted.title);
  await expect(controls.url).toHaveValue(submitted.url);
  await expect(controls.text).toHaveValue('Edición posterior al envío, sin acuse válido.');
  await expect(controls.text).toBeFocused();
  assert.equal(request.status, 201, 'the transport committed with the real handler before its malformed delivery');
  assert.deepEqual(JSON.parse(request.resultBody), {
    ok: true,
    code: 'created',
    id: 'resource-browser-submission-1',
    submittedAt: SUBMITTED_AT,
  });
  await waitForStoredSubmission(fixture, submitted.url);
  assert.equal(fixture.store.calls.filter(({ operation }) => operation === 'transactWrite').length, 1);

  await expect(controls.submit).toBeEnabled();
  await controls.submit.click();
  const duplicate = await fixture.waitForRequestCount(2);
  await expect(controls.status).toHaveAttribute('data-status', 'error');
  await expect(controls.status).toContainText('ya está registrado');
  await expect(controls.status.locator('code')).toHaveCount(0);
  await expect(controls.status.locator('time')).toHaveCount(0);
  assert.equal(duplicate.status, 409, 'a deliberate retry after an unknown receipt remains duplicate-authoritative');
  assert.equal(fixture.pendingRows().length, 1);
  assert.equal(fixture.reservationRows().length, 1);
  assert.equal(fixture.store.calls.filter(({ operation }) => operation === 'transactWrite').length, 1);
});

test('bounds a stalled response before headers without replaying or clearing the pending draft', async ({ fixture, page }) => {
  test.setTimeout(45_000);
  await page.clock.install({ time: new Date('2026-10-21T11:00:00.000Z') });
  const controls = await openContribution(page, fixture);
  const submitted = await fillContribution(controls, {
    url: 'https://example.invalid/contribution/stalled-headers',
    title: 'Envío con respuesta sin cabeceras',
  });
  const held = fixture.queueResponse({ mode: 'hold-headers' });

  await controls.submit.click();
  await held.ready;
  await advancePastDeliveryDeadline(page, controls);
  await expect(controls.submit).toBeEnabled();
  await expect(controls.title).toHaveValue(submitted.title);
  await expect(controls.url).toHaveValue(submitted.url);
  await waitForStoredSubmission(fixture, submitted.url);
  assert.equal(fixture.requests.length, 1, 'a bounded header wait does not replay the write');
  assert.equal(fixture.store.calls.filter(({ operation }) => operation === 'transactWrite').length, 1);

  await held.release();
  await held.bodySent;
  await controls.submit.click();
  const duplicate = await fixture.waitForRequestCount(2);
  await expect(controls.status).toHaveAttribute('data-status', 'error');
  await expect(controls.status).toContainText('ya está registrado');
  assert.equal(duplicate.status, 409, 'continuation after unknown delivery is deliberate and duplicate-authoritative');
  assert.equal(fixture.store.calls.filter(({ operation }) => operation === 'transactWrite').length, 1);
});

const invalidReceiptCases = [
  ['missing id', { ok: true, code: 'created', submittedAt: SUBMITTED_AT }],
  ['field diagnostics without a valid receipt', {
    ok: true,
    code: 'created',
    submittedAt: SUBMITTED_AT,
    fieldErrors: [{ field: 'url', reason: 'invalid_url' }],
  }],
  ['whitespace-padded id', { ok: true, code: 'created', id: ' resource-browser-submission-1 ', submittedAt: SUBMITTED_AT }],
  ['control-character id', { ok: true, code: 'created', id: 'resource-browser-submission-1\u0000', submittedAt: SUBMITTED_AT }],
  ['overlong id', { ok: true, code: 'created', id: `resource-${'x'.repeat(257)}`, submittedAt: SUBMITTED_AT }],
  ['impossible date', { ok: true, code: 'created', id: 'resource-browser-submission-1', submittedAt: '2026-02-30T12:00:00.000Z' }],
  ['contradictory status', { ok: false, code: 'duplicate', id: 'resource-browser-submission-1', submittedAt: SUBMITTED_AT }],
];

for (const [label, receipt] of invalidReceiptCases) {
  test(`rejects a syntactically valid 201 receipt with ${label}`, async ({ fixture, page }) => {
    const controls = await openContribution(page, fixture);
    const submitted = await fillContribution(controls, {
      url: `https://example.invalid/contribution/invalid-receipt-${label.replaceAll(' ', '-')}`,
      title: 'Envío con acuse inválido',
    });
    const invalidReceipt = fixture.queueResponse({ mode: 'hold-body', body: JSON.stringify(receipt) });

    await controls.submit.click();
    const request = await fixture.waitForRequestCount(1);
    await invalidReceipt.ready;
    await invalidReceipt.headersSent;
    invalidReceipt.release();
    await expectUncertainStatus(controls.status);
    await expect(controls.status).not.toContainText('¡Gracias!');
    await expect(controls.status.locator('code')).toHaveCount(0);
    await expect(controls.status.locator('time')).toHaveCount(0);
    await expect(controls.form.locator('[aria-invalid="true"]')).toHaveCount(0,
      'receipt diagnostics cannot turn an unconfirmed outcome into a field error');
    await expect(controls.form.locator('[data-contribution-error]:visible')).toHaveCount(0,
      'an unconfirmed outcome keeps its general recovery message only');
    await expect(controls.submit).toBeEnabled();
    await expect(controls.title).toHaveValue(submitted.title);
    await expect(controls.url).toHaveValue(submitted.url);
    assert.equal(request.status, 201);
    assert.equal(fixture.pendingRows().length, 1, 'the real handler still left a pending row after the invalid receipt');
    assert.equal(fixture.reservationRows().length, 1);
    assert.equal(fixture.store.calls.filter(({ operation }) => operation === 'transactWrite').length, 1);
  });
}

test('bounds a stalled response body after headers and allows a deliberate next submission', async ({ fixture, page }) => {
  test.setTimeout(45_000);
  await page.clock.install({ time: new Date('2026-10-21T11:00:00.000Z') });
  const controls = await openContribution(page, fixture);
  const firstUrl = 'https://example.invalid/contribution/late-first';
  const first = await fillContribution(controls, {
    url: firstUrl,
    title: 'Primer intento con respuesta tardía',
  });
  const held = fixture.queueResponse({ mode: 'hold-body' });

  await controls.submit.click();
  const firstRequest = await fixture.waitForRequestCount(1);
  await held.ready;
  await held.headersSent;
  assert.equal(firstRequest.responseMode, 'hold-body');
  assert.deepEqual(JSON.parse(firstRequest.resultBody), {
    ok: true,
    code: 'created',
    id: 'resource-browser-submission-1',
    submittedAt: SUBMITTED_AT,
  });
  await advancePastDeliveryDeadline(page, controls);
  await expect(controls.submit).toBeEnabled();
  await expect(controls.title).toHaveValue(first.title);
  await waitForStoredSubmission(fixture, firstUrl);

  const second = await fillContribution(controls, {
    url: 'https://example.invalid/contribution/late-second',
    title: 'Segundo intento más reciente',
    text: 'El segundo intento debe conservar su propio acuse.',
  });
  await controls.submit.click();
  await fixture.waitForRequestCount(2);
  await expect(controls.status).toHaveAttribute('data-status', 'success');
  await expect(controls.status.locator('code')).toHaveText('resource-browser-submission-2');
  const storedSecond = await waitForStoredSubmission(fixture, second.url, 'resource-browser-submission-2');
  assert.equal(storedSecond.title, second.title, 'the newer attempt has its own submitted context');

  await held.release();
  const lateDelivery = await held.bodySent;
  assert.ok(firstRequest.responseBodySent, 'the controlled old response crossed the delivery boundary or was aborted by the client');
  assert.equal(typeof lateDelivery.delivered, 'boolean');
  await expect(controls.status.locator('code')).toHaveText('resource-browser-submission-2');
  assert.deepEqual(fixture.pendingRows().map(({ id, title, url }) => ({ id, title, url })), [
    { id: 'resource-browser-submission-1', title: first.title, url: first.url },
    { id: 'resource-browser-submission-2', title: second.title, url: second.url },
  ]);
  assert.equal(fixture.reservationRows().length, 2);
  assert.equal(fixture.store.calls.filter(({ operation }) => operation === 'transactWrite').length, 2);
});

test('keeps an actual late response from replacing a newer in-flight draft and receipt context', async ({ fixture, page }) => {
  test.setTimeout(45_000);
  await page.clock.install({ time: new Date('2026-10-21T11:00:00.000Z') });
  await installContributionDeliveryControl(page, `${fixture.apiOrigin}/submissions`);
  const controls = await openContribution(page, fixture);
  const first = await fillContribution(controls, {
    url: 'https://example.invalid/contribution/consumer-first',
    title: 'Primer envío del consumidor',
    text: 'Descripción del primer envío.',
  });

  await controls.submit.click();
  await fixture.waitForRequestCount(1);
  const firstCapture = await waitForHeldCapture(page, 0);
  assert.equal(firstCapture.status, 201);
  assert.deepEqual(JSON.parse(firstCapture.bodyText), {
    ok: true,
    code: 'created',
    id: 'resource-browser-submission-1',
    submittedAt: SUBMITTED_AT,
  });
  await advancePastDeliveryDeadline(page, controls);
  await expect(controls.submit).toBeEnabled();

  const second = await fillContribution(controls, {
    url: 'https://example.invalid/contribution/consumer-second',
    title: 'Segundo envío del consumidor',
    text: 'Descripción del segundo envío.',
  });
  await controls.submit.click();
  await fixture.waitForRequestCount(2);
  const secondCapture = await waitForHeldCapture(page, 1);
  assert.equal(secondCapture.status, 201);
  assert.deepEqual(JSON.parse(secondCapture.bodyText), {
    ok: true,
    code: 'created',
    id: 'resource-browser-submission-2',
    submittedAt: SUBMITTED_AT,
  });

  const newer = {
    title: 'Borrador nuevo mientras espera el segundo acuse',
    url: 'https://example.invalid/contribution/consumer-newer-draft',
    text: 'Descripción nueva mientras espera el segundo acuse.',
  };
  await controls.title.fill(newer.title);
  await controls.url.fill(newer.url);
  await controls.text.fill(newer.text);
  await controls.kind.selectOption('source');
  await controls.format.selectOption('Blog');
  await controls.text.focus();
  await expect(controls.submit).toBeDisabled();

  await releaseHeldCapture(page, 0);
  await expect(controls.status.locator('code')).toHaveCount(0);
  await expect(controls.submit).toBeDisabled();
  await expect(controls.title).toHaveValue(newer.title);
  await expect(controls.url).toHaveValue(newer.url);
  await expect(controls.text).toHaveValue(newer.text);
  await expect(controls.text).toBeFocused();
  assert.equal(await page.evaluate(() => window.__contributionDelivery.captures[1].delivery), 'held');

  await releaseHeldCapture(page, 1);
  await expect(controls.status).toHaveAttribute('data-status', 'success');
  await expect(controls.status.locator('code')).toHaveText('resource-browser-submission-2');
  await expect(controls.status).toContainText(second.title);
  await expect(controls.status).not.toContainText(newer.title);
  await expect(controls.submit).toBeEnabled();
  await expect(controls.title).toHaveValue(newer.title);
  await expect(controls.url).toHaveValue(newer.url);
  await expect(controls.text).toHaveValue(newer.text);
  await expect(controls.text).toBeFocused();

  assert.deepEqual(fixture.pendingRows().map(({ id, title, url, description }) => ({ id, title, url, description })), [
    { id: 'resource-browser-submission-1', title: first.title, url: first.url, description: first.text },
    { id: 'resource-browser-submission-2', title: second.title, url: second.url, description: second.text },
  ]);
  assert.equal(fixture.store.calls.filter(({ operation }) => operation === 'transactWrite').length, 2);
});

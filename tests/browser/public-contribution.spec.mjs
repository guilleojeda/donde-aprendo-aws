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

import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createSubmissionHandler, MAX_SUBMISSION_BODY_BYTES } from '../../src/api/submission.mjs';
import { startCreatorBrowserApp } from './creator-browser-app.mjs';

const execFileAsync = promisify(execFile);
const LOOPBACK = '127.0.0.1';

function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
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

async function unusedPort() {
  const server = createHttpServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK, resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object' && address.port > 0);
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

function isAllowedOrigin(origin, expectedOrigin) {
  return typeof origin === 'string' && origin === expectedOrigin;
}

function corsHeaders(origin, expectedOrigin) {
  if (!isAllowedOrigin(origin, expectedOrigin)) return {};
  return {
    'access-control-allow-origin': expectedOrigin,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
}

function resultHeaders(result, origin, expectedOrigin) {
  return {
    ...result.headers,
    ...corsHeaders(origin, expectedOrigin),
    'cache-control': 'no-store',
  };
}

async function readRequestBody(request, onChunk) {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.length;
    onChunk?.(chunk, byteLength);
    if (byteLength <= MAX_SUBMISSION_BODY_BYTES) chunks.push(chunk);
  }
  return {
    byteLength,
    body: byteLength <= MAX_SUBMISSION_BODY_BYTES ? Buffer.concat(chunks).toString('utf8') : 'x'.repeat(MAX_SUBMISSION_BODY_BYTES + 1),
  };
}

function createSubmissionStore() {
  const items = new Map();
  const calls = [];
  return {
    items,
    calls,
    async getItem({ Key }) {
      calls.push({ operation: 'getItem', key: copy(Key) });
      const item = items.get(Key?.id);
      return item ? { Item: copy(item) } : {};
    },
    async transactWrite(params) {
      calls.push({ operation: 'transactWrite', params: copy(params) });
      const puts = params.TransactItems.map(({ Put }) => Put);
      if (puts.some(({ Item }) => items.has(Item.id))) {
        const error = new Error('conditional transaction conflict');
        error.name = 'TransactionCanceledException';
        error.CancellationReasons = puts.map(({ Item }) => ({
          Code: items.has(Item.id) ? 'ConditionalCheckFailed' : 'None',
        }));
        throw error;
      }
      for (const { Item } of puts) items.set(Item.id, copy(Item));
    },
    snapshot() {
      return [...items.values()].map(copy);
    },
  };
}

async function startHttpsServer({ key, cert, port, state }) {
  const server = createHttpsServer({ key, cert }, async (request, response) => {
    const origin = request.headers.origin;
    const appOrigin = state.appOrigin;
    const allowedOrigin = isAllowedOrigin(origin, appOrigin);
    if (request.url !== '/submissions' || (!allowedOrigin && origin !== undefined)) {
      response.writeHead(403, resultHeaders({ headers: { 'content-type': 'application/json; charset=utf-8' } }, origin, appOrigin));
      response.end(JSON.stringify({ ok: false, code: 'invalid_request' }));
      return;
    }
    if (request.method === 'OPTIONS') {
      if (!allowedOrigin) {
        response.writeHead(403);
        response.end();
        return;
      }
      response.writeHead(204, corsHeaders(origin, appOrigin));
      response.end();
      return;
    }
    if (request.method !== 'POST') {
      response.writeHead(405, {
        allow: 'POST, OPTIONS',
        ...corsHeaders(origin, appOrigin),
      });
      response.end();
      return;
    }

    const requestRecord = {
      method: request.method,
      headers: { ...request.headers },
      body: undefined,
      bodyBytes: 0,
      status: undefined,
      resultBody: undefined,
      responseMode: undefined,
      responseHeadersSent: false,
      responseBodySent: false,
    };
    state.requests.push(requestRecord);
    const read = await readRequestBody(request, (_chunk, bytes) => { requestRecord.bodyBytes = bytes; });
    requestRecord.body = read.body;
    const result = await state.handler({ headers: request.headers, body: read.body });
    requestRecord.status = result.statusCode;
    requestRecord.resultBody = result.body;
    const plan = state.responsePlans.shift() ?? {
      mode: 'normal',
      ready: deferred(),
      headersSent: deferred(),
      bodySent: deferred(),
      releasePromise: deferred(),
    };
    requestRecord.responseMode = plan.mode;
    state.activePlans.add(plan);

    const writeHeaders = () => {
      if (response.destroyed || requestRecord.responseHeadersSent) return;
      response.writeHead(result.statusCode, resultHeaders(result, origin, appOrigin));
      response.flushHeaders?.();
      requestRecord.responseHeadersSent = true;
      plan.headersSent?.resolve();
    };
    const sendBody = (body = result.body) => {
      if (requestRecord.responseBodySent) return;
      if (response.destroyed) {
        requestRecord.responseBodySent = true;
        plan.bodySent?.resolve({ delivered: false });
        return;
      }
      writeHeaders();
      response.end(body);
      requestRecord.responseBodySent = true;
      plan.bodySent?.resolve({ delivered: true });
    };

    plan.release = () => {
      plan.releaseRequested = true;
      return plan.releasePromise.resolve();
    };
    plan.ready.resolve({ request: requestRecord, result });
    try {
      if (plan.mode === 'hold-headers') {
        await plan.releasePromise.promise;
        sendBody();
      } else if (plan.mode === 'hold-body') {
        writeHeaders();
        await plan.releasePromise.promise;
        sendBody(plan.body ?? result.body);
      } else {
        sendBody();
      }
    } finally {
      state.activePlans.delete(plan);
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK, resolve);
  });
  return server;
}

export async function startContributionBrowserApp({
  catalogFixture,
  hostname = LOOPBACK,
} = {}) {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'donde-aprendo-contribution-browser-'));
  let app;
  let submissionServer;
  let activeFixture;
  let closed = false;
  const serverState = {
    handler: null,
    requests: [],
    responsePlans: [],
    activePlans: new Set(),
  };

  const closeServer = async (server) => {
    if (!server) return;
    await new Promise((resolve) => server.close(() => resolve()));
  };

  try {
    const keyPath = path.join(temporaryDirectory, 'loopback-key.pem');
    const certificatePath = path.join(temporaryDirectory, 'loopback-cert.pem');
    await execFileAsync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-keyout', keyPath, '-out', certificatePath, '-subj', '/CN=127.0.0.1',
      '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ]);
    const [key, cert] = await Promise.all([readFile(keyPath, 'utf8'), readFile(certificatePath, 'utf8')]);
    const submissionPort = await unusedPort();
    const submissionOrigin = `https://${LOOPBACK}:${submissionPort}`;

    submissionServer = await startHttpsServer({
      key,
      cert,
      port: submissionPort,
      state: serverState,
    });
    app = await startCreatorBrowserApp({ catalogFixture, hostname, submissionApiUrl: `${submissionOrigin}/submissions` });
    serverState.appOrigin = app.origin;

    return {
      origin: app.origin,
      async createFixture({ submittedAt = '2026-10-21T12:00:00.000Z' } = {}) {
        if (closed) throw new Error('The contribution browser app is already closed.');
        if (activeFixture) throw new Error('A prior contribution fixture was not closed.');
        const store = createSubmissionStore();
        let idCounter = 0;
        const handler = createSubmissionHandler({
            tableName: 'contribution-browser-catalog',
            now: () => submittedAt,
            resourceId: () => `resource-browser-submission-${++idCounter}`,
            getItem: (params) => store.getItem(params),
            transactWrite: (params) => store.transactWrite(params),
          });
        serverState.handler = handler;
        serverState.requests = [];
        serverState.responsePlans = [];
        serverState.activePlans.clear();
        const fixture = {
          origin: app.origin,
          apiOrigin: submissionOrigin,
          store,
          get requests() { return serverState.requests; },
          queueResponse({ mode = 'normal', body } = {}) {
            const plan = {
              mode,
              body,
              ready: deferred(),
              headersSent: deferred(),
              bodySent: deferred(),
              releasePromise: deferred(),
            };
            plan.release = () => plan.releasePromise.resolve();
            serverState.responsePlans.push(plan);
            return {
              ready: plan.ready.promise,
              headersSent: plan.headersSent.promise,
              bodySent: plan.bodySent.promise,
              release: () => plan.releasePromise.resolve(),
              plan,
            };
          },
          async waitForRequestCount(count) {
            const deadline = Date.now() + 7_500;
            while (serverState.requests.length < count && Date.now() < deadline) {
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            assert.ok(serverState.requests.length >= count, `expected ${count} submission request(s), got ${serverState.requests.length}`);
            return serverState.requests[count - 1];
          },
          pendingRows() {
            return store.snapshot().filter((item) => item.published === false && item.recordType !== 'urlReservation');
          },
          reservationRows() {
            return store.snapshot().filter((item) => item.recordType === 'urlReservation');
          },
          snapshot() {
            return store.snapshot();
          },
          clear() {
            if (activeFixture !== fixture) throw new Error('The contribution fixture is not active.');
            for (const plan of serverState.responsePlans) plan.release?.();
            for (const plan of serverState.activePlans) plan.release?.();
            serverState.responsePlans = [];
            activeFixture = undefined;
          },
        };
        activeFixture = fixture;
        return fixture;
      },
      async close() {
        if (closed) return;
        closed = true;
        activeFixture?.clear();
        try {
          await closeServer(submissionServer);
          await app?.close();
        } finally {
          await rm(temporaryDirectory, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    try {
      await closeServer(submissionServer);
      await app?.close();
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
    throw error;
  }
}

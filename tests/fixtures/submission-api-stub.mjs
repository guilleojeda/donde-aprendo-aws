#!/usr/bin/env node

import { createServer } from 'node:http';
import { createSubmissionHandler, MAX_SUBMISSION_BODY_BYTES } from '../../src/api/submission.mjs';

const USAGE = 'Uso: node tests/fixtures/submission-api-stub.mjs [--port 8787] [--status 201|400|409|500] [--delay-ms 0..10000]';
const FIXED_SUBMITTED_AT = '2026-10-21T12:00:00.000Z';

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true };
    if (!['--port', '--status', '--delay-ms'].includes(flag)) {
      throw new Error(`Opción desconocida: ${flag}`);
    }
    if (values.has(flag)) throw new Error(`Opción repetida: ${flag}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Falta el valor para ${flag}`);
    values.set(flag, value);
    index += 1;
  }

  const integerOption = (flag, fallback, { min, max }) => {
    const raw = values.get(flag);
    if (raw === undefined) return fallback;
    if (!/^\d+$/u.test(raw)) throw new Error(`${flag} debe ser un número entero.`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${flag} debe estar entre ${min} y ${max}.`);
    }
    return value;
  };

  const port = integerOption('--port', 8787, { min: 1, max: 65_535 });
  const status = integerOption('--status', 201, { min: 201, max: 500 });
  if (![201, 400, 409, 500].includes(status)) throw new Error('--status debe ser 201, 400, 409 o 500.');
  const delayMs = integerOption('--delay-ms', 0, { min: 0, max: 10_000 });
  return { help: false, port, status, delayMs };
}

function isAllowedOrigin(origin) {
  if (typeof origin !== 'string') return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(parsed.hostname)
      && parsed.origin.toLowerCase() === origin.toLowerCase();
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  if (!isAllowedOrigin(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin',
  };
}

function writeResult(response, result, origin) {
  response.writeHead(result.statusCode, {
    ...result.headers,
    ...corsHeaders(origin),
    'cache-control': 'no-store',
  });
  response.end(result.body);
}

function writeError(response, statusCode, code, origin) {
  writeResult(response, {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ ok: false, code }),
  }, origin);
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(USAGE);
    return;
  }

  const submissionHandler = createSubmissionHandler({
    tableName: 'local-preview-only',
    now: () => FIXED_SUBMITTED_AT,
    putItem: async () => {
      if (options.status === 409) {
        const error = new Error('Local preview duplicate');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }
      if (options.status === 500) throw new Error('Local preview storage failure');
    },
  });

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const origin = request.headers.origin;
    const allowedOrigin = origin === undefined || isAllowedOrigin(origin);

    if (!allowedOrigin) {
      writeError(response, 403, 'invalid_request');
      return;
    }
    if (url.pathname !== '/submissions') {
      writeError(response, 404, 'invalid_request', origin);
      return;
    }
    if (request.method === 'OPTIONS') {
      if (origin === undefined) {
        writeError(response, 403, 'invalid_request');
        return;
      }
      response.writeHead(204, {
        ...corsHeaders(origin),
        'cache-control': 'no-store',
      });
      response.end();
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST, OPTIONS');
      writeError(response, 405, 'invalid_request', origin);
      return;
    }

    const chunks = [];
    let byteLength = 0;
    let oversized = false;
    request.on('data', (chunk) => {
      byteLength += chunk.length;
      if (byteLength > MAX_SUBMISSION_BODY_BYTES) {
        oversized = true;
        chunks.length = 0;
      } else if (!oversized) {
        chunks.push(chunk);
      }
    });
    request.on('error', () => {
      if (!response.destroyed) writeError(response, 400, 'invalid_request', origin);
    });
    request.on('end', async () => {
      const body = oversized ? 'x'.repeat(MAX_SUBMISSION_BODY_BYTES + 1) : Buffer.concat(chunks).toString('utf8');
      let result;

      if (options.status === 400 && !oversized) {
        result = await submissionHandler({
          headers: { 'content-type': 'application/json' },
          body: '{',
        });
      } else {
        result = await submissionHandler({
          headers: request.headers,
          body,
        });
      }

      const send = () => {
        if (!response.destroyed) writeResult(response, result, origin);
      };
      if (options.delayMs > 0) setTimeout(send, options.delayMs);
      else send();
    });
  });

  server.on('error', (error) => {
    console.error(`No se pudo iniciar el stub local: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(options.port, '127.0.0.1', () => {
    console.log(`Submission preview stub: http://127.0.0.1:${options.port}/submissions (status ${options.status}, delay ${options.delayMs} ms)`);
  });

  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    server.close();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

main().catch((error) => {
  console.error(`Error del stub local: ${error.message}`);
  process.exitCode = 1;
});

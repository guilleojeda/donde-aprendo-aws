import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { once } from 'node:events';
import { createServer as createHttpServer, request as requestHttp } from 'node:http';
import { createConnection, createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

if (process.versions.node.split('.')[0] !== '24') {
  throw new Error(`Mixed Astro preview requires Node 24; current runtime is ${process.version}.`);
}

const workspaceRoot = fileURLToPath(new URL('../', import.meta.url));
const artifactRoot = resolve(workspaceRoot, '.amplify-hosting');
const staticRoot = resolve(artifactRoot, 'static');
const computeRoot = resolve(artifactRoot, 'compute/default');
const entrypoint = resolve(computeRoot, 'entry.mjs');
const runtimeEnvironmentNames = [
  'ACCOUNT_ORIGIN',
  'COGNITO_ISSUER',
  'COGNITO_CLIENT_ID',
  'COGNITO_DOMAIN',
  'ACCOUNTS_TABLE',
];

function parseArguments(args) {
  const options = { host: '127.0.0.1', port: 4321 };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      process.stdout.write('Usage: npm run preview -- [--host HOST] [--port PORT]\n');
      process.exit(0);
    }
    const [name, inlineValue] = argument.split('=', 2);
    if (name !== '--host' && name !== '--port') throw new Error(`Unknown preview option: ${argument}`);
    const value = inlineValue ?? args[++index];
    if (!value) throw new Error(`Missing value for ${name}.`);
    if (name === '--host') options.host = value;
    if (name === '--port') {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid preview port: ${value}`);
      options.port = port;
    }
  }
  return options;
}

async function availablePort() {
  const server = createNetServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate the local compute port.');
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

function waitForCompute(child, port) {
  return new Promise((resolveReady, reject) => {
    let finished = false;
    const deadline = Date.now() + 10_000;
    const fail = (error) => {
      if (finished) return;
      finished = true;
      reject(error);
    };
    const exited = (code, signal) => fail(new Error(`Built compute exited before listening (code ${code ?? 'none'}, signal ${signal ?? 'none'}).`));
    child.once('exit', exited);

    const attempt = () => {
      if (finished) return;
      if (Date.now() >= deadline) return fail(new Error('Built compute did not start within 10 seconds.'));
      const socket = createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        if (finished) return;
        finished = true;
        child.off('exit', exited);
        resolveReady();
      });
      socket.once('error', () => {
        socket.destroy();
        if (!finished) delay(50).then(attempt);
      });
    };
    attempt();
  });
}

function staticIndexPath(requestUrl) {
  const url = new URL(requestUrl, 'http://preview.invalid');
  let filesystemPath;
  try {
    filesystemPath = resolve(staticRoot, `.${decodeURIComponent(url.pathname)}`, 'index.html');
  } catch {
    return requestUrl;
  }
  if (!filesystemPath.startsWith(`${staticRoot}${sep}`)
    || !existsSync(filesystemPath)
    || !statSync(filesystemPath).isFile()) return requestUrl;

  const requestPath = url.pathname === '/'
    ? '/index.html'
    : `${url.pathname.replace(/\/+$/u, '')}/index.html`;
  return `${requestPath}${url.search}`;
}

function listen(server, options) {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(options, resolveListen);
  });
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolveClose) => server.close(() => resolveClose()));
}

async function stopChild(child, exited) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const stopped = await Promise.race([exited, delay(1500).then(() => null)]);
  if (stopped) return;
  child.kill('SIGKILL');
  await exited;
}

async function main() {
  if (!existsSync(entrypoint) || !existsSync(staticRoot)) {
    throw new Error('Mixed preview needs a completed `npm run build` and its .amplify-hosting artifact.');
  }

  const options = parseArguments(process.argv.slice(2));
  const computePort = await availablePort();
  const childEnvironment = {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
    ...Object.fromEntries(runtimeEnvironmentNames
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]])),
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: String(computePort),
  };
  const child = spawn(process.execPath, ['entry.mjs'], {
    cwd: computeRoot,
    env: childEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  const exited = once(child, 'exit').then(([code, signal]) => ({ code, signal }));
  let proxy;

  try {
    await waitForCompute(child, computePort);
    proxy = createHttpServer((request, response) => {
      const path = staticIndexPath(request.url ?? '/');

      const upstream = requestHttp({
        hostname: '127.0.0.1',
        port: computePort,
        method: request.method,
        path,
        headers: { ...request.headers, host: `127.0.0.1:${computePort}` },
      }, (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      });
      upstream.on('error', () => {
        if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Preview compute unavailable.');
      });
      request.pipe(upstream);
    });

    await listen(proxy, { host: options.host, port: options.port });
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('Could not read the preview server address.');
    const displayHost = options.host === '0.0.0.0' || options.host === '::' ? 'localhost' : options.host;
    process.stdout.write(`Mixed Astro preview ready at http://${displayHost}:${address.port}\n`);

    const signal = await Promise.race([
      new Promise((resolveSignal) => {
        process.once('SIGINT', () => resolveSignal('SIGINT'));
        process.once('SIGTERM', () => resolveSignal('SIGTERM'));
      }),
      exited.then(({ code, signal: exitSignal }) => {
        throw new Error(`Built compute exited while preview was running (code ${code ?? 'none'}, signal ${exitSignal ?? 'none'}).`);
      }),
    ]);
    process.stdout.write(`Stopping mixed Astro preview after ${signal}.\n`);
  } finally {
    await closeServer(proxy);
    await stopChild(child, exited);
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

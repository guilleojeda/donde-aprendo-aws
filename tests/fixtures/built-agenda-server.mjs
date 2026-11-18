import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { normalize, relative, resolve } from 'node:path';

const CONTENT_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ics', 'text/calendar; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
]);

function fileForPath(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  const relativePath = decoded.endsWith('/') ? `${decoded}index.html` : decoded;
  const candidate = resolve(root, `.${normalize(relativePath)}`);
  const relativeCandidate = relative(root, candidate);
  return relativeCandidate.startsWith('..') || relativeCandidate.includes('\0') ? undefined : candidate;
}

/** Serve the already-built static site so browser evidence crosses the actual shipped HTML and JS. */
export async function startBuiltAgendaServer() {
  const { siteOutputRoot } = await import('../../scripts/lib/site-output.mjs');
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://built-agenda.test').pathname;
    const file = fileForPath(siteOutputRoot, pathname);
    if (!file) {
      response.writeHead(400).end();
      return;
    }
    try {
      const fileStat = await stat(file);
      if (!fileStat.isFile()) throw new Error('not a file');
      const body = await readFile(file);
      const extension = file.slice(file.lastIndexOf('.'));
      response.writeHead(200, { 'content-type': CONTENT_TYPES.get(extension) ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveServer);
  });
  const address = server.address();
  if (!address || typeof address !== 'object') throw new Error('Built agenda server did not expose a TCP address.');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())),
  };
}

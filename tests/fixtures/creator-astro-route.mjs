import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Compile production Astro/API entrypoints for AstroContainer. Route imports
 * can use the actual process runtime or the shared browser fixture runtime.
 */
export async function compileCreatorAstroRoutes(entries, {
  siteOrigin,
  scratchDirectory,
  runtimeModule = 'production',
  rawModules = 'source',
} = {}) {
  if (!entries || typeof entries !== 'object' || Object.keys(entries).length === 0) {
    throw new TypeError('route entries are required');
  }
  if (typeof siteOrigin !== 'string' || !siteOrigin) throw new TypeError('siteOrigin is required');
  if (!['production', 'fixture'].includes(runtimeModule)) throw new TypeError('unsupported route runtime module');
  if (!['source', 'empty'].includes(rawModules)) throw new TypeError('unsupported raw module mode');
  const scratch = path.resolve(scratchDirectory ?? path.join(root, 'node_modules/.cache/creator-entrypoints'));
  await mkdir(scratch, { recursive: true });
  const tempDir = await mkdtemp(path.join(scratch, 'routes-'));
  const runtimePath = runtimeModule === 'fixture'
    ? fileURLToPath(new URL('./creator-browser-runtime.mjs', import.meta.url))
    : undefined;
  const entryPoints = Object.fromEntries(Object.entries(entries).map(([name, source]) => [
    name,
    path.resolve(root, source),
  ]));
  try {
    await build({
      entryPoints,
      outdir: tempDir,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      outExtension: { '.js': '.mjs' },
      define: {
        'import.meta.env.PUBLIC_SITE_ORIGIN': JSON.stringify(siteOrigin),
        'import.meta.env.PUBLIC_PRODUCTION': '"true"',
      },
      plugins: [{
        name: 'actual-creator-entrypoints',
        setup(api) {
          api.onResolve({ filter: /account-runtime\.mjs$/ }, () => ({
            path: runtimePath ?? path.join(root, 'src/lib/account-runtime.mjs'),
            external: true,
          }));
          api.onResolve({ filter: /creator-runtime\.mjs$/ }, () => ({
            path: runtimePath ?? path.join(root, 'src/lib/creator-runtime.mjs'),
            external: true,
          }));
          api.onResolve({ filter: /\?raw$/ }, ({ path: requested, resolveDir }) => ({
            path: path.resolve(resolveDir, requested.slice(0, -4)),
            namespace: 'raw',
          }));
          api.onLoad({ filter: /.*/, namespace: 'raw' }, async ({ path: filename }) => ({
            contents: rawModules === 'empty' ? 'export default "";' : `export default ${JSON.stringify(await readFile(filename, 'utf8'))};`,
            loader: 'js',
          }));
          api.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
          api.onLoad({ filter: /\.astro$/ }, async ({ path: filename }) => ({
            contents: transform(await readFile(filename, 'utf8'), {
              filename,
              internalURL: 'astro/compiler-runtime',
              resultScopedSlot: true,
              resolvePath: (specifier) => specifier,
            }).code,
            loader: 'js',
          }));
        },
      }],
    });

    const routes = {};
    for (const name of Object.keys(entries)) {
      routes[name] = (await import(pathToFileURL(path.join(tempDir, `${name}.mjs`)).href));
    }
    return {
      routes,
      async cleanup() {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

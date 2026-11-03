import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { experimental_AstroContainer } from 'astro/container';

const require = createRequire(import.meta.url);
const preactServerEntry = require.resolve('@astrojs/preact/server.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scratch = path.join(root, 'node_modules/.cache/creator-owner-ssr');
let preactRendererPromise;

// astro.config.mjs uses preact() with default include/exclude options. The
// installed integration emits this same options object for astro:preact:opts.
async function loadPreactServerRenderer() {
  preactRendererPromise ??= (async () => {
    await mkdir(scratch, { recursive: true });
    const tempDir = await mkdtemp(path.join(scratch, 'preact-renderer-'));
    const outputPath = path.join(tempDir, 'preact-renderer.mjs');
    try {
      await build({
        entryPoints: [preactServerEntry],
        outfile: outputPath,
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        plugins: [{
          name: 'preact-test-options',
          setup(api) {
            api.onResolve({ filter: /^astro:preact:opts$/ }, () => ({ path: 'preact-test-options', namespace: 'preact-test-options' }));
            api.onLoad({ filter: /.*/, namespace: 'preact-test-options' }, () => ({
              contents: 'export default { include: undefined, exclude: undefined };',
              loader: 'js',
            }));
          },
        }],
      });
      return (await import(pathToFileURL(outputPath).href)).default;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  })();
  return preactRendererPromise;
}

export async function createCreatorOwnerAstroContainer(options = {}) {
  const container = await experimental_AstroContainer.create(options);
  container.addServerRenderer({ renderer: await loadPreactServerRenderer() });
  container.addClientRenderer({ name: '@astrojs/preact', entrypoint: '@astrojs/preact/client.js' });
  return container;
}

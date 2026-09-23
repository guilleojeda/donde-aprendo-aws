#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const run = promisify(execFile);
const outputDirectory = join(process.cwd(), 'build');
const lambdaDirectory = join(outputDirectory, 'submission');
const bundlePath = join(lambdaDirectory, 'index.mjs');
const zipPath = join(outputDirectory, 'submission.zip');

await rm(lambdaDirectory, { recursive: true, force: true });
await mkdir(lambdaDirectory, { recursive: true });
await rm(zipPath, { force: true });

await build({
  entryPoints: ['src/api/submission.mjs'],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'warning',
});

// A stable archive timestamp makes the content hash useful across repeated
// packaging of the same code, instead of changing on every local build.
const archiveTime = new Date('1980-01-02T00:00:00.000Z');
await chmod(bundlePath, 0o644);
await utimes(bundlePath, archiveTime, archiveTime);
await run('zip', ['-X', '-q', '-j', zipPath, bundlePath], {
  env: { ...process.env, TZ: 'UTC' },
});

const artifact = await readFile(zipPath);
const metadata = {
  path: 'build/submission.zip',
  sha256: createHash('sha256').update(artifact).digest('hex'),
  bytes: artifact.length,
};
await writeFile(join(outputDirectory, 'submission.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify(metadata));

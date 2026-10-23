#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const run = promisify(execFile);
const outputDirectory = join(process.cwd(), 'build');
const lambdaDirectory = join(outputDirectory, 'password-reset');
const bundlePath = join(lambdaDirectory, 'index.mjs');
const zipPath = join(outputDirectory, 'password-reset.zip');

await rm(lambdaDirectory, { recursive: true, force: true });
await mkdir(lambdaDirectory, { recursive: true });
await rm(zipPath, { force: true });

await build({
  entryPoints: ['src/api/password-reset.mjs'],
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

// Fix the archive timestamp so identical bundles produce identical ZIP hashes.
const archiveTime = new Date('1980-01-02T00:00:00.000Z');
await chmod(bundlePath, 0o644);
await utimes(bundlePath, archiveTime, archiveTime);
await run('zip', ['-X', '-q', '-j', zipPath, bundlePath], {
  env: { ...process.env, TZ: 'UTC' },
});

const artifact = await readFile(zipPath);
const sha256 = createHash('sha256').update(artifact).digest('hex');
const metadata = {
  path: 'build/password-reset.zip',
  s3Key: `password-reset/${sha256}.zip`,
  sha256,
  bytes: artifact.length,
};
await writeFile(join(outputDirectory, 'password-reset.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify(metadata));

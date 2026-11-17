import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import deployment from '../config/deployment.json' with { type: 'json' };
import { resolveReleaseContext } from './lib/deployment-context.mjs';

let admitted = false;
try {
  await resolveReleaseContext({ env: process.env, deployment });
  admitted = true;
} catch (error) {
  console.error(`Release admission failed: ${error.message}`);
  process.exitCode = 1;
}

if (admitted) {
  const astroCli = resolve('node_modules/astro/bin/astro.mjs');
  const result = spawnSync(process.execPath, [astroCli, 'build'], { stdio: 'inherit', env: process.env });
  if (result.error) {
    console.error(`Could not start Astro build: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
}

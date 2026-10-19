import { statSync } from 'node:fs';
import { resolve } from 'node:path';

export const siteOutputRoot = resolve('.amplify-hosting/static');

if (!statSync(siteOutputRoot, { throwIfNoEntry: false })?.isDirectory()) {
  throw new Error(`Mixed Astro client output is missing: ${siteOutputRoot}`);
}

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve('.');
const contextPath = process.env.RELEASE_CONTEXT_FILE && resolve(process.env.RELEASE_CONTEXT_FILE);

async function verify(script, contextFile, environment) {
  const args = [resolve(root, script)];
  const child = spawn(process.execPath, args, { cwd: root, env: {
    ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
    DIRECTORY_ACCEPTANCE_FIXTURE_MODE: 'enriched', RELEASE_CONTEXT_FILE: contextFile, ...environment,
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = [];
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => chunks.push(chunk));
  const [status, signal] = await once(child, 'exit');
  return { status, signal, output: Buffer.concat(chunks).toString('utf8') };
}

test('generated site and blog checks use the independent expected release context', async (t) => {
  assert.ok(contextPath, 'Build the real fixture and supply RELEASE_CONTEXT_FILE.');
  const context = JSON.parse(await readFile(contextPath, 'utf8'));
  assert.ok(['preview', 'production-fixture'].includes(context.mode));
  const actual = {
    PUBLIC_PRODUCTION: context.mode === 'preview' ? 'false' : 'true',
    PUBLIC_SITE_ORIGIN: context.siteOrigin,
  };
  const opposite = resolve(root, 'tests/fixtures',
    context.mode === 'preview' ? 'release-production-context.json' : 'release-preview-context.json');
  for (const script of ['scripts/verify-site.mjs', 'scripts/verify-blog.mjs']) {
    await t.test(`${script} accepts matching generated output`, async () => {
      const result = await verify(script, contextPath, actual);
      assert.equal(result.status, 0, result.output);
      assert.equal(result.signal, null);
    });
    await t.test(`${script} rejects output for the opposite expected target`, async () => {
      const result = await verify(script, opposite, actual);
      assert.notEqual(result.status, 0,
        'Matching PUBLIC_* inputs and generated output cannot override the independent target.');
      assert.match(result.output, /release|production|preview|context|origin|index/iu);
      assert.equal(result.signal, null);
    });
    await t.test(`${script} rejects absent or unreadable expected context`, async () => {
      const result = await verify(script, resolve(root, '.work/missing-release-context.json'), actual);
      assert.notEqual(result.status, 0, 'A requested independent target cannot silently fall back to PUBLIC_*.');
      assert.equal(result.signal, null);
    });
  }
});

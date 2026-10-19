import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const repositoryRoot = new URL('../', import.meta.url).pathname;

test('password-reset Lambda package is reproducible and content addressed', async () => {
  const packageOnce = async () => {
    const { stdout } = await run('node', ['scripts/package-password-reset.mjs'], {
      cwd: repositoryRoot,
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  };

  const first = await packageOnce();
  const firstZip = await readFile(join(repositoryRoot, first.path));
  const second = await packageOnce();
  const secondZip = await readFile(join(repositoryRoot, second.path));

  assert.deepEqual(second, first);
  assert.deepEqual(secondZip, firstZip);
  assert.equal(first.path, 'build/password-reset.zip');
  assert.equal(first.sha256, createHash('sha256').update(firstZip).digest('hex'));
  assert.equal(first.bytes, firstZip.length);
  assert.equal(first.s3Key, `password-reset/${first.sha256}.zip`);

  const { stdout: archiveFiles } = await run('unzip', ['-Z1', join(repositoryRoot, first.path)]);
  assert.deepEqual(archiveFiles.trim().split('\n'), ['index.mjs']);
});

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { test } from 'node:test';

async function loadBundledModule(path) {
  const { outputFiles } = await build({
    entryPoints: [new URL(path, import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const sessionResponse = await loadBundledModule('../src/lib/creator-session-response.ts');

test('session response parsing clones JSON and classifies recovery without changing the token', async () => {
  const response = new Response(JSON.stringify({ csrfToken: ' token ' }), { status: 200 });
  const payload = await sessionResponse.readCreatorSessionResponse(response);
  assert.deepEqual(payload, { csrfToken: ' token ' });
  assert.deepEqual(await response.json(), { csrfToken: ' token ' });
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(200, payload), { state: 'ready', csrfToken: ' token ' });
  assert.equal(sessionResponse.creatorSessionRecoveryReason(401, null), 'expired');
  assert.equal(sessionResponse.creatorSessionRecoveryReason(403, { error: 'CSRF_REJECTED' }), 'csrf');
  assert.equal(sessionResponse.creatorSessionRecoveryReason(403, { error: 'ACCOUNT_DISABLED' }), undefined);
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(409, { error: 'SESSION_CONTEXT_CHANGED' }), { state: 'context-changed' });
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(422, { error: 'INVALID_CONTEXT' }), { state: 'invalid-context' });
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(409, { error: 'PROFILE_CONFLICT' }), { state: 'unavailable' });
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(422, { error: 'INVALID_PHOTO' }), { state: 'unavailable' });
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(403, { error: 'ACCOUNT_DISABLED' }), { state: 'disabled' });
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(503, null), { state: 'unavailable' });
});

test('session binding accepts only the exact lowercase hexadecimal contract', () => {
  assert.equal(sessionResponse.isCreatorSessionBinding('a'.repeat(64)), true);
  assert.equal(sessionResponse.isCreatorSessionBinding('A'.repeat(64)), false);
  assert.equal(sessionResponse.isCreatorSessionBinding('a'.repeat(63)), false);
  assert.equal(sessionResponse.isCreatorSessionBinding(null), false);
});

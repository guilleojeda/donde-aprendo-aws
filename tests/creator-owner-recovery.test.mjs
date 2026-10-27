import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const componentPath = new URL('../src/components/CreatorOwnerProfile.astro', import.meta.url);
const recoveryPath = new URL('../src/scripts/creator-session-recovery.ts', import.meta.url);

test('la superficie de recuperación del propietario existe dentro del diálogo y fuera de él', async () => {
  const source = await readFile(componentPath, 'utf8');
  const dialogStart = source.indexOf('<dialog class="creator-owner__dialog"');
  const dialogEnd = source.indexOf('</dialog>', dialogStart);
  assert.ok(dialogStart >= 0 && dialogEnd > dialogStart, 'owner editor has its native dialog');

  const beforeDialog = source.slice(0, dialogStart);
  const dialogContent = source.slice(dialogStart, dialogEnd);
  assert.match(beforeDialog, /data-session-recovery-shell/, 'nonmodal creation and publication keep recovery actions reachable');
  assert.match(dialogContent, /data-session-recovery-shell/, 'an active owner edit has recovery actions inside its modal');
  assert.equal([...source.matchAll(/data-session-recovery-shell/g)].length, 2,
    'the owner renders one nonmodal surface and one modal surface for the same recovery state');
});

class TestElement {
  constructor() {
    this.hidden = true;
    this.disabled = false;
    this.textContent = '';
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async dispatch(type) {
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    for (const listener of this.listeners.get(type) ?? []) await listener(event);
    return event;
  }
}

test('una sola recuperación actualiza las acciones modales y no modales y comprueba la sesión una vez', async () => {
  const output = await build({
    entryPoints: [recoveryPath.pathname],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    target: 'es2022',
  });
  const module = { exports: {} };
  const fetchCalls = [];
  runInNewContext(output.outputFiles[0].text, {
    module,
    exports: module.exports,
    Response,
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return Response.json({ csrfToken: 'csrf-refreshed' });
    },
  });
  const { createCreatorSessionRecovery } = module.exports;
  assert.equal(typeof createCreatorSessionRecovery, 'function');

  const elements = new Map([
    ['[data-session-recovery-shell]', [new TestElement(), new TestElement()]],
    ['[data-session-recovery-status]', [new TestElement(), new TestElement()]],
    ['[data-session-recovery-sign-in]', [new TestElement(), new TestElement()]],
    ['[data-session-recovery-check]', [new TestElement(), new TestElement()]],
  ]);
  const root = {
    dataset: { sessionBinding: 'a'.repeat(64) },
    querySelector(selector) { return elements.get(selector)?.[0] ?? null; },
  };
  const dialogRoot = {
    querySelector(selector) { return elements.get(selector)?.[1] ?? null; },
  };
  const csrfTokens = [];
  const recovery = createCreatorSessionRecovery({
    root,
    additionalRoot: dialogRoot,
    isWriteActive: () => false,
    updateCsrf: (token) => csrfTokens.push(token),
  });

  await recovery.observeWriteResponse(Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 }));
  for (const surface of ['nonmodal', 'dialog']) {
    const index = surface === 'nonmodal' ? 0 : 1;
    assert.equal(elements.get('[data-session-recovery-shell]')[index].hidden, false, `${surface} shell is visible`);
    assert.equal(elements.get('[data-session-recovery-status]')[index].hidden, false, `${surface} status is announced`);
    assert.match(elements.get('[data-session-recovery-status]')[index].textContent, /Comprobar sesión/);
    assert.equal(elements.get('[data-session-recovery-sign-in]')[index].hidden, false, `${surface} sign-in action is available`);
    assert.equal(elements.get('[data-session-recovery-check]')[index].hidden, false, `${surface} check action is available`);
  }

  const dialogClick = await elements.get('[data-session-recovery-check]')[1].dispatch('click');
  assert.equal(dialogClick.defaultPrevented, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(csrfTokens.length, 1);
  assert.equal(csrfTokens[0], 'csrf-refreshed');
  assert.equal(fetchCalls.length, 1, 'both controls share one session-check operation');
  assert.equal(fetchCalls[0].url, '/api/creador/sesion/');
  assert.equal(fetchCalls[0].options.headers['X-Creator-Page-Binding'], 'a'.repeat(64));
  for (const index of [0, 1]) {
    assert.equal(elements.get('[data-session-recovery-sign-in]')[index].hidden, true);
    assert.equal(elements.get('[data-session-recovery-check]')[index].hidden, true);
    assert.match(elements.get('[data-session-recovery-status]')[index].textContent, /Sesión comprobada/);
  }
});

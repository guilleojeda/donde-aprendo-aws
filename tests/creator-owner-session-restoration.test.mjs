import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createCreatorOwnerAstroContainer } from './fixtures/creator-owner-astro-container.mjs';

async function loadModule(relativePath) {
  const { outputFiles } = await build({
    entryPoints: [new URL(relativePath, import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const ownerState = await loadModule('../src/lib/creator-owner-state.ts');
const commands = await loadModule('../src/lib/creator-owner-commands.ts');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const componentDir = path.join(root, 'src/components/creator-owner');
const cache = path.join(root, 'node_modules/.cache');
await mkdir(cache, { recursive: true });
const temporary = await mkdtemp(path.join(cache, 'creator-owner-session-'));
const container = await createCreatorOwnerAstroContainer();
const components = new Map();

after(async () => rm(temporary, { recursive: true, force: true }));

async function loadComponent(name) {
  if (!components.has(name)) {
    const output = path.join(temporary, `${name}.mjs`);
    await build({
      entryPoints: [path.join(componentDir, `${name}.tsx`)],
      outfile: output,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      jsx: 'automatic',
      jsxImportSource: 'preact',
    });
    components.set(name, (await import(pathToFileURL(output).href)).default);
  }
  return components.get(name);
}

async function render(name, props) {
  return container.renderToString(await loadComponent(name), { props });
}

const profile = {
  id: 'creator-session-ana',
  displayName: 'Ana de Lambda',
  slug: 'ana-lambda',
  city: 'Córdoba',
  country: 'Argentina',
  programs: ['Community Builders'],
  bio: 'Biografía guardada.',
  socials: {},
  published: false,
  hidden: false,
  version: 8,
};
const A = { id: 'catalog-a', title: 'Guía de IAM', url: 'https://catalog.example/iam', tipo: 'content' };
const B = { id: 'catalog-b', title: 'Taller de Lambda', url: 'https://catalog.example/lambda', tipo: 'content' };
const binding = 'a'.repeat(64);
const seriesQuery = {
  buscarSeries: '', paginaSeries: 1, serie: '', buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1,
};
const changedPrincipalMessage = 'La cuenta o el rol activo no coinciden con esta página. Conservamos tus cambios.';

function initialState() {
  return ownerState.createCreatorOwnerState({
    data: { profile, links: [], editableResources: [], claims: [], series: [] },
    accountEmail: 'ana@example.test',
    csrfToken: 'csrf-original',
    sessionBinding: binding,
    isAdmin: false,
    publicOrigin: 'https://example.test',
    seriesQuery,
  });
}

function reduce(state, action) {
  return ownerState.creatorOwnerReducer(state, action);
}

function nextOperationId(state) {
  return Math.max(state.sessionEvidence.latestBoundOperationId, state.sessionEvidence.latestSessionCheckOperationId) + 1;
}

function evidence(state, source, outcome, extra = {}) {
  const operationId = extra.operationId ?? nextOperationId(state);
  const { operationId: _operationId, ...details } = extra;
  return reduce(state, { type: 'session-evidence', operationId, source, outcome,
    message: details.message ?? 'Session evidence', ...details });
}

function enterRecoverableMismatch(state) {
  state = evidence(state, 'bound', 'recoverable', { reason: 'different-principal', message: changedPrincipalMessage });
  assert.equal(state.session.state, 'recovery-required');
  assert.equal(state.session.reason, 'different-principal');
  state = reduce(state, { type: 'session-check-started', operationId: nextOperationId(state), checkId: 'matching-session-check' });
  assert.equal(state.session.state, 'checking');
  return state;
}

function renewFromMatchingCheck(state, csrfToken) {
  assert.equal(state.session.state, 'checking');
  return evidence(state, 'session-check', 'renewed', { operationId: state.sessionEvidence.latestSessionCheckOperationId, checkId: state.session.checkId, csrfToken, message: 'Session checked' });
}

function stripSessionFeedback(state) {
  const { session: _session, sessionEvidence: _sessionEvidence, message: _message, ...productState } = state;
  return productState;
}

function profileEditorState() {
  let state = initialState();
  state = reduce(state, { type: 'open-editor', editor: {
    kind: 'profile', key: 'profile:datos', section: 'datos', base: state.observed.profile,
    draft: {
      displayName: profile.displayName,
      slug: profile.slug,
      city: profile.city,
      country: profile.country,
      programs: [...profile.programs],
      bio: profile.bio,
    },
  } });
  return reduce(state, { type: 'update-profile-draft', value: { displayName: 'Ana con cambios', bio: 'Borrador conservado.' } });
}

function referenceWithPendingAttempt() {
  let state = initialState();
  state = reduce(state, { type: 'open-editor', editor: {
    kind: 'reference', key: 'reference', baseProfile: state.observed.profile,
    selected: A, selectedForDirectory: true,
  } });
  state = reduce(state, { type: 'catalog-load-ready', entries: [A, B] });
  const intent = commands.creatorOwnerWriteIntent('reference-a', state.editor);
  state = reduce(state, { type: 'begin-write', intent });
  state = reduce(state, { type: 'update-reference-draft', selected: B, selectedForDirectory: false });
  state = reduce(state, { type: 'write-uncertain', intentId: intent.id, status: 'uncertain', message: 'Comprueba la referencia A.' });
  return state;
}

function identityProps(state) {
  const noop = () => {};
  return {
    state,
    disabled: state.session.state !== 'ready',
    onOpenProfile: noop,
    onCreateProfile: noop,
    onPublish: noop,
    onActivityPeriod: noop,
    onRetryActivity: noop,
    onCreateProfileInput: noop,
    onCheck: noop,
    onCheckSession: noop,
    onAdopt: noop,
    onCopyLink: noop,
    onRetryCreateProfile: noop,
  };
}

function dialogProps(state) {
  const noop = () => {};
  return {
    state,
    onUpdateProfile: noop,
    onUpdateSocial: noop,
    onUpdateSeries: noop,
    onUpdateMove: noop,
    onSetMoveSuggestion: noop,
    onUpdateLink: noop,
    onUpdateAddLink: noop,
    onUpdateMoveLink: noop,
    onUpdateReference: noop,
    onUpdateClaim: noop,
    onCatalogSearch: noop,
    onCatalogPage: noop,
    onCatalogRetry: noop,
    onSetPhoto: noop,
    onSubmit: noop,
    onRequestClose: noop,
    onCheck: noop,
    onAdopt: noop,
    onExit: noop,
    onCheckSession: noop,
    onCheckClaim: noop,
  };
}

function recoveryButton(html) {
  return html.match(/<button\b[^>]*data-session-recovery-check[^>]*>/u)?.[0];
}

test('one session evidence policy separates provisional history denials from terminal bound denials', async () => {
  const message = 'No se puede comprobar esta sesión.';
  for (const reason of ['disabled', 'invalid-context']) {
    let blocked = evidence(initialState(), 'bound', 'terminal', { reason, message });
    assert.equal(blocked.session.state, 'blocked', `${reason} stays terminal`);
    assert.equal(blocked.session.reason, reason);
    assert.strictEqual(reduce(blocked, { type: 'session-check-started', operationId: nextOperationId(blocked), checkId: 'cannot-check' }), blocked,
      `${reason} cannot enter session checking`);
    blocked = evidence(blocked, 'bound', 'recoverable', { reason: 'different-principal', message: 'Later content mismatch' });
    assert.equal(blocked.session.state, 'blocked', `${reason} remains absorbing when newer bound evidence mismatches`);
    assert.equal(blocked.session.reason, reason);
  }

  const historyDenied = evidence(initialState(), 'history', 'recoverable', { reason: 'disabled', message });
  assert.equal(historyDenied.session.state, 'advisory', 'ordinary Solicitudes evidence pauses writes without claiming terminal authority');
  assert.equal(historyDenied.sessionEvidence.latestBoundOperationId, 0, 'an advisory history result does not own bound authority');
  const newerMismatch = evidence(historyDenied, 'bound', 'recoverable', { operationId: 2, reason: 'different-principal', message: 'Later bound mismatch' });
  assert.equal(newerMismatch.session.state, 'recovery-required');
  assert.equal(newerMismatch.session.reason, 'different-principal', 'a newer bound 409 enables explicit restoration');

  const newerRead = evidence(historyDenied, 'bound', 'read-confirmed', { operationId: 2, message: 'Bound read confirmed' });
  assert.equal(newerRead.session.state, 'recovery-required', 'a profile GET clears the advisory but does not infer a CSRF token');
  assert.equal(newerRead.session.reason, 'check-required');
  assert.equal(newerRead.sessionEvidence.latestBoundOperationId, 2, 'a newer bound 200 makes the old history result obsolete');

  const olderHistoryAfterBound = reduce(newerMismatch, { type: 'session-evidence', operationId: 1, source: 'history', outcome: 'recoverable', reason: 'disabled', message });
  assert.equal(olderHistoryAfterBound.session.reason, 'different-principal', 'both response delivery orders preserve newer bound evidence');
  const confirmedWrite = evidence(historyDenied, 'bound', 'write-confirmed', { operationId: 2, csrfToken: 'csrf-original', message: 'Write confirmed' });
  assert.equal(confirmedWrite.session.state, 'ready', 'a real write may finish with its already validated token');
  assert.equal(confirmedWrite.session.csrfToken, 'csrf-original');

  const advisoryView = await render('CreatorOwnerIdentityPanel', identityProps(historyDenied));
  assert.equal(recoveryButton(advisoryView), undefined, 'the advisory hold offers no session check before newer bound evidence');
  assert.doesNotMatch(advisoryView, /Abrir una página nueva/u, 'the advisory hold is not presented as terminal');

  const checking = enterRecoverableMismatch(profileEditorState());
  assert.equal(checking.session.state, 'checking');
  assert.equal(checking.session.reason, 'different-principal');
  const nextWrite = commands.creatorOwnerWriteIntent('blocked-under-other-principal', checking.editor);
  assert.strictEqual(reduce(checking, { type: 'begin-write', intent: nextWrite }), checking,
    'the changed principal cannot send the retained correction');
});

test('matching session restoration changes session state and CSRF only, then enables the next manual profile command', () => {
  let state = profileEditorState();
  const observedBefore = state.observed;
  const bindingBefore = state.sessionBinding;
  state = enterRecoverableMismatch(state);
  const checkingState = state;
  state = renewFromMatchingCheck(state, 'csrf-original-renewed');

  assert.deepEqual(stripSessionFeedback(state), stripSessionFeedback(checkingState));
  assert.equal(state.session.state, 'ready');
  assert.equal(state.session.csrfToken, 'csrf-original-renewed');
  assert.equal(state.sessionBinding, bindingBefore);
  assert.deepEqual(state.observed, observedBefore, 'session recovery does not adopt content or advance its version');
  assert.deepEqual(state.editor.draft, {
    displayName: 'Ana con cambios', slug: profile.slug, city: profile.city, country: profile.country,
    programs: profile.programs, bio: 'Borrador conservado.',
  });

  const intent = commands.creatorOwnerWriteIntent('manual-profile-save', state.editor);
  const request = commands.prepareCreatorOwnerRequest(intent);
  assert.deepEqual(request, {
    path: '/api/creador/perfil/',
    method: 'PUT',
    body: {
      version: profile.version,
      displayName: 'Ana con cambios',
      slug: profile.slug,
      city: profile.city,
      country: profile.country,
      programs: profile.programs,
      bio: 'Borrador conservado.',
    },
  });
  assert.equal(state.session.csrfToken, 'csrf-original-renewed', 'the app can attach the renewed token to the explicit command');
  const sending = reduce(state, { type: 'begin-write', intent });
  assert.equal(sending.attempt.status, 'sending', 'the restored session permits a separately initiated manual save');
  assert.equal(sending.attempt.intent.id, intent.id);
});

test('a session check started after a content read owns later evidence, while a genuinely newer bound mismatch can supersede it', () => {
  let state = evidence(profileEditorState(), 'bound', 'recoverable', { reason: 'different-principal', message: changedPrincipalMessage });
  const olderContentReadId = nextOperationId(state);
  const checkId = 'later-session-check';
  state = reduce(state, { type: 'session-check-started', operationId: olderContentReadId + 1, checkId });
  const sessionCheckId = state.sessionEvidence.latestSessionCheckOperationId;
  const delayedContentMismatch = reduce(state, { type: 'session-evidence', operationId: olderContentReadId,
    source: 'bound', outcome: 'recoverable', reason: 'different-principal', message: 'Old content mismatch' });
  assert.strictEqual(delayedContentMismatch, state, 'the earlier content response cannot cancel the later session check');
  state = reduce(state, { type: 'session-evidence', operationId: sessionCheckId, source: 'session-check', checkId,
    outcome: 'renewed', csrfToken: 'csrf-from-matching-check', message: 'Session checked' });
  assert.equal(state.session.state, 'ready');
  assert.equal(state.session.csrfToken, 'csrf-from-matching-check');

  let newerMismatch = evidence(profileEditorState(), 'bound', 'recoverable', { reason: 'different-principal', message: changedPrincipalMessage });
  const oldSessionId = nextOperationId(newerMismatch);
  const laterCheckId = 'check-before-newer-bound-read';
  newerMismatch = reduce(newerMismatch, { type: 'session-check-started', operationId: oldSessionId, checkId: laterCheckId });
  const laterBoundId = nextOperationId(newerMismatch);
  newerMismatch = reduce(newerMismatch, { type: 'session-evidence', operationId: laterBoundId, source: 'bound', outcome: 'recoverable',
    reason: 'different-principal', message: 'Newer bound mismatch' });
  const staleCheck = reduce(newerMismatch, { type: 'session-evidence', operationId: oldSessionId, source: 'session-check', checkId: laterCheckId,
    outcome: 'renewed', csrfToken: 'obsolete-check-token', message: 'Stale session check' });
  assert.equal(staleCheck.session.state, 'recovery-required');
  assert.notEqual(staleCheck.session.state, 'ready');
  assert.ok(laterBoundId > oldSessionId);
});

test('session restoration preserves the later reference choice and leaves its earlier attempt unresolved', () => {
  let state = referenceWithPendingAttempt();
  const observedBefore = state.observed;
  const attemptBefore = state.attempt;
  const bindingBefore = state.sessionBinding;
  state = enterRecoverableMismatch(state);
  state = renewFromMatchingCheck(state, 'csrf-restored');

  assert.deepEqual(state.observed, observedBefore);
  assert.deepEqual(state.attempt, attemptBefore, 'session restoration does not compare or adopt the pending content write');
  assert.equal(state.editor.kind, 'reference');
  assert.deepEqual(state.editor.selected, B);
  assert.equal(state.editor.selectedForDirectory, false);
  assert.equal(state.sessionBinding, bindingBefore);
  assert.equal(state.session.csrfToken, 'csrf-restored');
});

test('session restoration retains the exact selected photo File object', () => {
  const file = new File(['photo bytes'], 'profile-correction.png', { type: 'image/png' });
  let state = initialState();
  state = reduce(state, { type: 'open-editor', editor: {
    kind: 'photo', key: 'photo', base: state.observed.profile, file,
  } });
  const observedBefore = state.observed;
  const bindingBefore = state.sessionBinding;
  state = enterRecoverableMismatch(state);
  state = renewFromMatchingCheck(state, 'csrf-restored');

  assert.strictEqual(state.editor.file, file);
  assert.deepEqual(state.observed, observedBefore);
  assert.equal(state.sessionBinding, bindingBefore);
  assert.equal(state.session.csrfToken, 'csrf-restored');
  assert.equal(state.attempt.status, 'idle', 'session checking does not start or continue a photo upload');
});

test('owner shell and editor dialog expose recovery controls for different-principal required/checking states', async () => {
  let state = profileEditorState();
  state = evidence(state, 'bound', 'recoverable', { reason: 'different-principal', message: changedPrincipalMessage });

  for (const [sessionState, disabled] of [['recovery-required', false], ['checking', true]]) {
    if (sessionState === 'checking') state = reduce(state, { type: 'session-check-started', operationId: nextOperationId(state), checkId: 'ui-check' });
    const shell = await render('CreatorOwnerIdentityPanel', identityProps(state));
    const dialog = await render('CreatorOwnerEditorDialog', dialogProps(state));
    for (const [name, html] of [['owner shell', shell], ['editor dialog', dialog]]) {
      const button = recoveryButton(html);
      assert.ok(button, `${name} renders Comprobar sesión while ${sessionState}`);
      assert.equal(/\sdisabled(?:="")?(?=\s|>)/u.test(button), disabled,
        `${name} ${disabled ? 'disables' : 'enables'} the control while ${sessionState}`);
      assert.match(html, /data-session-recovery-sign-in/u, `${name} keeps the existing sign-in-in-another-tab route`);
    }
  }
});

test('owner shell and editor dialog keep disabled and invalid-context sessions blocked', async () => {
  for (const reason of ['disabled', 'invalid-context']) {
    const state = evidence(profileEditorState(), 'bound', 'terminal', { reason, message: `Blocked: ${reason}` });
    const shell = await render('CreatorOwnerIdentityPanel', identityProps(state));
    const dialog = await render('CreatorOwnerEditorDialog', dialogProps(state));
    assert.equal(recoveryButton(shell), undefined, `${reason} does not expose a session recheck in the shell`);
    assert.equal(recoveryButton(dialog), undefined, `${reason} does not expose a session recheck in the dialog`);
    assert.match(shell, /href="\/cuenta\/"[^>]*>Abrir una página nueva/u,
      `${reason} retains the existing new-page path in the shell`);
    const saveButton = dialog.match(/<button\b[^>]*>Guardar datos<\/button>/u)?.[0];
    assert.ok(saveButton, `${reason} keeps the existing editor form visible`);
    assert.match(saveButton, /\sdisabled(?:="")?(?=\s|>)/u,
      `${reason} does not allow the retained draft to be submitted`);
    assert.equal(state.session.state, 'blocked');
  }
});

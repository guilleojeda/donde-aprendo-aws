import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [new URL('../src/lib/creator-owner-state.ts', import.meta.url).pathname],
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const ownerState = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);

const profile = {
  id: 'creator-session-ana', displayName: 'Ana de Lambda', slug: 'ana-lambda',
  city: 'Córdoba', country: 'Argentina', programs: ['Community Builders'],
  bio: 'Biografía guardada.', socials: {}, published: false, hidden: false,
};
const binding = 'a'.repeat(64);
const seriesQuery = {
  buscarSeries: '', paginaSeries: 1, serie: '', buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1,
};
const mismatch = 'La cuenta o el rol activo no coinciden con esta página. Conservamos tus cambios.';

function policyState() {
  return {
    session: { state: 'ready', csrfToken: 'csrf-original' },
    sessionEvidence: { latestBoundOperationId: 0, latestSessionCheckOperationId: 0 },
  };
}

function ownerStateWithDraft() {
  let state = ownerState.createCreatorOwnerState({
    data: {
      schemaVersion: 3, creatorVersion: 8, profile,
      resources: [], placements: {}, order: { featured: [], ordinary: [] }, series: {}, claims: [],
    },
    accountEmail: 'ana@example.test', csrfToken: 'csrf-original', sessionBinding: binding,
    isAdmin: false, publicOrigin: 'https://example.test', seriesQuery, view: 'series',
  });
  state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
    kind: 'profile', key: 'profile:datos', section: 'datos',
    touchedFields: [],
    draft: {
      displayName: profile.displayName, slug: profile.slug, city: profile.city, country: profile.country,
      programs: [...profile.programs], bio: profile.bio,
    },
  } });
  return ownerState.creatorOwnerReducer(state, { type: 'update-profile-draft', value: {
    displayName: 'Ana con cambios', bio: 'Borrador conservado.',
  } });
}

test('matching session restoration changes only readiness and CSRF while retaining the canonical snapshot and draft', () => {
  let state = ownerStateWithDraft();
  const observedBefore = ownerState.copyCreatorOwnerSnapshot(state.observed);
  const draftBefore = structuredClone(state.editor.draft);
  const operationBefore = state.operation;

  state = ownerState.creatorOwnerReducer(state, {
    type: 'session-evidence', operationId: 1, source: 'bound', outcome: 'recoverable',
    reason: 'different-principal', message: mismatch,
  });
  assert.equal(state.session.state, 'recovery-required');
  state = ownerState.creatorOwnerReducer(state, { type: 'session-check-started', operationId: 2, checkId: 'matching-session-check' });
  assert.equal(state.session.state, 'checking');
  state = ownerState.creatorOwnerReducer(state, {
    type: 'session-evidence', operationId: 2, source: 'session-check', outcome: 'renewed',
    checkId: 'matching-session-check', csrfToken: 'csrf-original-renewed', message: 'Sesión comprobada.',
  });

  assert.equal(state.session.state, 'ready');
  assert.equal(state.session.csrfToken, 'csrf-original-renewed');
  assert.equal(state.sessionBinding, binding);
  assert.deepEqual(state.observed, observedBefore, 'session checking does not adopt or advance owner content');
  assert.deepEqual(state.editor.draft, draftBefore, 'the exact local fields remain available for a separate manual action');
  assert.strictEqual(state.operation, operationBefore, 'session checking does not start or resolve a content operation');
  assert.equal(ownerState.creatorOwnerDraftIsDirty(state.editor, state.observed), true);
});

test('current owner snapshots copy classification topics and compare v3 drafts without aliasing', () => {
  const resource = {
    id: 'resource-session-classification', version: 3, title: 'Ficha', url: 'https://example.test/ficha',
    hidden: false, directoryApproval: 'pending', metadataEditable: true, reincludeAllowed: true,
    classification: { state: 'explicit', kind: 'content', format: 'Artículo', topics: ['Serverless'] },
    classificationEditable: true,
  };
  const snapshot = {
    schemaVersion: 3, creatorVersion: 8, profile, resources: [resource], placements: {},
    order: { featured: [], ordinary: [] }, series: {}, claims: [],
  };
  const copied = ownerState.copyCreatorOwnerSnapshot(snapshot);
  assert.equal(copied.schemaVersion, 3);
  assert.notStrictEqual(copied.resources[0], resource);
  assert.notStrictEqual(copied.resources[0].classification, resource.classification);
  assert.notStrictEqual(copied.resources[0].classification.topics, resource.classification.topics);
  copied.resources[0].classification.topics.push('Seguridad');
  assert.deepEqual(resource.classification.topics, ['Serverless']);

  const editor = {
    kind: 'link-resource', key: 'link-resource:resource-session-classification', resourceId: resource.id,
    draft: { title: resource.title, url: resource.url, description: '', kind: 'content', format: 'Artículo', topics: ['Serverless'] },
    touchedFields: [],
  };
  assert.equal(ownerState.creatorOwnerDraftIsDirty(editor, snapshot), false);
  assert.equal(ownerState.creatorOwnerDraftIsDirty({ ...editor, draft: { ...editor.draft, topics: ['Seguridad'] } }, snapshot), true);
});

test('a successful owner read requires explicit session checking and does not infer a renewed token', () => {
  const current = {
    ...policyState(),
    session: { state: 'recovery-required', reason: 'expired', message: 'Session expired.', csrfToken: 'csrf-original' },
  };
  const result = ownerState.reduceCreatorOwnerSessionPolicy(current, {
    type: 'session-evidence', operationId: 1, source: 'bound', outcome: 'read-confirmed', message: 'Read completed.',
  });
  assert.equal(result.accepted, true);
  assert.equal(result.session.state, 'recovery-required');
  assert.equal(result.session.reason, 'check-required');
  assert.equal(result.session.csrfToken, 'csrf-original');
  assert.equal(result.sessionEvidence.latestBoundOperationId, 1);
});

test('a later bound mismatch makes an in-flight session check obsolete', () => {
  let state = ownerState.reduceCreatorOwnerSessionPolicy(policyState(), {
    type: 'session-evidence', operationId: 1, source: 'bound', outcome: 'recoverable',
    reason: 'different-principal', message: mismatch,
  });
  state = ownerState.reduceCreatorOwnerSessionPolicy(state, {
    type: 'session-check-started', operationId: 2, checkId: 'older-check',
  });
  const newerMismatch = ownerState.reduceCreatorOwnerSessionPolicy(state, {
    type: 'session-evidence', operationId: 3, source: 'bound', outcome: 'recoverable',
    reason: 'different-principal', message: 'The bound request still has a different principal.',
  });
  const staleCheck = ownerState.reduceCreatorOwnerSessionPolicy(newerMismatch, {
    type: 'session-evidence', operationId: 2, source: 'session-check', outcome: 'renewed',
    checkId: 'older-check', csrfToken: 'stale-token', message: 'Old session check.',
  });
  assert.equal(newerMismatch.session.state, 'recovery-required');
  assert.equal(staleCheck.accepted, false);
  assert.equal(staleCheck.session.state, 'recovery-required');
  assert.notEqual(staleCheck.session.csrfToken, 'stale-token');
});

test('disabled and invalid-context bound outcomes remain terminal', () => {
  for (const reason of ['disabled', 'invalid-context']) {
    let state = ownerState.reduceCreatorOwnerSessionPolicy(policyState(), {
      type: 'session-evidence', operationId: 1, source: 'bound', outcome: 'terminal', reason, message: `Bloqueada: ${reason}`,
    });
    assert.equal(state.session.state, 'blocked');
    assert.equal(state.session.reason, reason);
    const laterMismatch = ownerState.reduceCreatorOwnerSessionPolicy(state, {
      type: 'session-evidence', operationId: 2, source: 'bound', outcome: 'recoverable',
      reason: 'different-principal', message: mismatch,
    });
    assert.equal(laterMismatch.accepted, false);
    assert.equal(laterMismatch.session.state, 'blocked');
    assert.equal(laterMismatch.session.reason, reason);
  }
});

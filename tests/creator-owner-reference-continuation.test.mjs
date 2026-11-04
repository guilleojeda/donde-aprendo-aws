import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function loadModule(path) {
  const { outputFiles } = await build({
    entryPoints: [new URL(path, import.meta.url).pathname],
    bundle: true, format: 'esm', platform: 'node', write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const ownerState = await loadModule('../src/lib/creator-owner-state.ts');
const commands = await loadModule('../src/lib/creator-owner-commands.ts');
const ownerSeries = await loadModule('../src/lib/creator-owner-series.ts');

// These are state/command-boundary tests. The browser acceptance executes the
// actual reference service, transport interruption, recovery and persisted save.
const A = { id: 'catalog-a', title: 'IAM guide', url: 'https://catalog.example/a?source=original', tipo: 'content' };
const B = { id: 'catalog-b', title: 'Lambda workshop', url: 'https://catalog.example/b', tipo: 'content' };
const profile = {
  id: 'profile-reference', displayName: 'Creator', slug: 'creator', programs: [], socials: {},
  bio: 'Initial biography', published: false, hidden: false, version: 10,
};
const series = { id: 'series-reference', name: 'My series', slug: 'my-series', version: 2 };

function placement(selection, overrides = {}) {
  return {
    placementId: `placement-${selection.id}`, resourceId: selection.id,
    title: selection.title, url: selection.url,
    featured: false, position: 0, selectedForDirectory: true, hidden: false,
    directoryApproval: 'approved', resourceVersion: 4, placementVersion: 3, series: [],
    ...overrides,
  };
}

function beginReference({ existing } = {}) {
  let state = ownerState.createCreatorOwnerState({
    data: { profile, links: existing ? [existing] : [], editableResources: [], claims: [], series: [series] },
    accountEmail: 'creator@example.test', csrfToken: 'csrf', sessionBinding: 'a'.repeat(64),
    isAdmin: false, publicOrigin: 'https://example.test', view: 'enlaces',
    seriesQuery: ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
  });
  state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
    kind: 'reference', key: 'reference', baseProfile: state.observed.profile,
    selected: A, selectedForDirectory: true,
  } });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [A, B] });
  const intent = commands.creatorOwnerWriteIntent('reference-a', state.editor);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
  return { state, intent };
}

function complete(mode, state, intent, { existing, recovered = true, queueExit = false } = {}) {
  const saved = existing ?? placement(A);
  // Missing A may coexist with another saved profile change. That read must
  // still become the current base for the next explicit reference.
  const version = existing ? 10 : 11;
  const snapshot = {
    profile: { ...profile, version, bio: 'Biography read from the server' },
    links: recovered ? [saved] : [], editableResources: [], claims: [], series: [series],
  };
  if (mode === 'acknowledged') {
    assert.equal(recovered, true);
    if (queueExit) state = queueTransition(state);
    state = ownerState.creatorOwnerReducer(state, {
      type: 'write-confirmed', intentId: intent.id,
      correction: ownerState.creatorOwnerEditorChangedSince(intent.capture, state.editor),
      effect: { kind: 'link-added', source: 'reference', created: !existing,
        profileId: profile.id, profileVersion: version, link: saved },
    });
  } else {
    state = ownerState.creatorOwnerReducer(state, {
      type: 'write-uncertain', intentId: intent.id, status: 'uncertain', message: 'Acknowledgement was lost.',
    });
    state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: 'check-a' });
    const comparison = commands.createCreatorOwnerComparison(intent, snapshot, state.editor);
    assert.equal(comparison.canAdopt, true);
    assert.equal(comparison.recoveredLinkId, recovered ? saved.placementId : undefined);
    state = ownerState.creatorOwnerReducer(state, {
      type: 'check-compared', intentId: intent.id, checkId: 'check-a', comparison,
    });
    if (queueExit) state = queueTransition(state);
    state = ownerState.creatorOwnerReducer(state, { type: 'adopt-comparison', comparisonId: comparison.id });
  }
  assert.equal(state.attempt.status, 'confirmed');
  assert.equal(state.observed.profile.version, version);
  assert.equal(state.observed.profile.bio, mode === 'acknowledged' ? profile.bio : snapshot.profile.bio,
    'acknowledged effects and explicit full-state adoption retain their different contracts');
  assert.deepEqual(state.observed.editableResources, [], 'reference completion does not create metadata-editing authority');
  return { state, saved, version };
}

function queueTransition(state) {
  state = ownerState.creatorOwnerReducer(state, { type: 'set-transition', transition: {
    href: '/cuenta/?vista=enlaces&buscar=previous', kind: 'history', historyIndex: 0,
  } });
  return ownerState.creatorOwnerReducer(state, { type: 'set-prompt', prompt: 'exit' });
}

function updateReference(state, value) {
  return ownerState.creatorOwnerReducer(state, { type: 'update-reference-draft', ...value });
}

function assertManualReference(state, selected, selectedForDirectory, version) {
  assert.equal(state.editor?.kind, 'reference', 'the later selection must remain in the reference editor');
  assert.deepEqual(state.editor.selected, selected);
  assert.equal(state.editor.selectedForDirectory, selectedForDirectory);
  assert.equal(state.editor.baseProfile.version, version);
  assert.equal(state.attempt.status, 'confirmed', 'completion does not begin a request for the later selection');
  const manual = commands.creatorOwnerWriteIntent('reference-manual', state.editor);
  const request = commands.prepareCreatorOwnerRequest(manual);
  assert.equal(request.path, '/api/creador/referencias/');
  assert.equal(request.method, 'POST');
  assert.deepEqual(request.body, { resourceId: selected.id, url: selected.url, profileVersion: version, selectedForDirectory });
  const sending = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent: manual });
  assert.equal(sending.attempt.status, 'sending', 'the next explicit command can use the adopted profile base');
  assert.equal(sending.attempt.intent.id, manual.id);
}

for (const mode of ['acknowledged', 'recovered']) {
  test(`${mode} reference A preserves later B and its directory choice, cancelling the queued exit`, () => {
    let { state, intent } = beginReference();
    state = updateReference(state, { selected: B, selectedForDirectory: false });
    const result = complete(mode, state, intent, { queueExit: true });
    assertManualReference(result.state, B, false, 11);
    assert.deepEqual(result.state.observed.links.map(({ resourceId }) => resourceId), [A.id]);
    assert.equal(result.state.location.transition, undefined, 'the old exit cannot consume the pending B selection');
    assert.equal(result.state.location.prompt, 'none');
  });

  test(`${mode} reference identity includes the literal URL, even when the resource ID is unchanged`, () => {
    let { state, intent } = beginReference();
    const differentPair = { ...A, url: `${A.url}&revision=2` };
    state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [differentPair, B] });
    state = updateReference(state, { selected: differentPair, selectedForDirectory: false });
    const result = complete(mode, state, intent);
    assertManualReference(result.state, differentPair, false, 11);
    assert.equal(result.state.observed.links[0].url, A.url, 'the saved A still describes the original observed pair');
  });

  test(`${mode} reference A keeps a cleared selection and the latest directory choice`, () => {
    let { state, intent } = beginReference();
    state = updateReference(state, { selected: undefined, selectedForDirectory: false });
    ({ state } = complete(mode, state, intent));
    assert.equal(state.editor?.kind, 'reference');
    assert.equal(state.editor.selected, undefined);
    assert.equal(state.editor.selectedForDirectory, false);
    assert.equal(state.editor.baseProfile.version, 11);
    assert.throws(() => commands.prepareCreatorOwnerRequest(commands.creatorOwnerWriteIntent('empty-selection', state.editor)),
      'a cleared selection cannot prepare another reference');
  });

  test(`${mode} reference A finishes when only its display label changed`, () => {
    let { state, intent } = beginReference();
    const label = { ...A, title: 'Updated IAM guide label' };
    state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [label, B] });
    state = updateReference(state, { selected: label });
    ({ state } = complete(mode, state, intent));
    assert.equal(state.editor, undefined, 'a label refresh is not later reference intent');
    assert.doesNotMatch(state.message.text, /Conservamos la corrección/u,
      'completion must not claim there is a pending correction for a display label');
  });

  test(`${mode} unchanged reference A finishes without inventing pending intent`, () => {
    const pending = beginReference();
    const { state } = complete(mode, pending.state, pending.intent);
    assert.equal(state.editor, undefined);
    assert.deepEqual(state.observed.links.map(({ resourceId }) => resourceId), [A.id]);
  });

  test(`${mode} same-pair option correction opens only placement options with the confirmed versions`, () => {
    let { state, intent } = beginReference();
    state = updateReference(state, { selectedForDirectory: false });
    ({ state } = complete(mode, state, intent));
    assert.equal(state.editor?.kind, 'link-placement');
    assert.equal(state.editor.editable, false);
    assert.equal(state.editor.baseLink.resourceId, A.id);
    assert.equal(state.editor.baseLink.selectedForDirectory, true);
    assert.equal(state.editor.draft.selectedForDirectory, false);
    const manual = commands.prepareCreatorOwnerRequest(commands.creatorOwnerWriteIntent('options-manual', state.editor));
    assert.equal(manual.method, 'PATCH');
    assert.equal(manual.path, `/api/creador/enlaces/placement-${A.id}/editar/`);
    assert.equal(manual.body.profileVersion, 11);
    assert.equal(manual.body.placementVersion, 3);
    assert.equal(manual.body.selectedForDirectory, false);
    assert.equal(Object.hasOwn(manual.body, 'title'), false, 'the explicit continuation cannot edit shared metadata');
  });

  test(`${mode} an existing-A no-op preserves its options/order/chapters and finishes without a later change`, () => {
    const existing = placement(A, { selectedForDirectory: false, featured: true, position: 17,
      series: [{ seriesId: series.id, position: 3 }] });
    const pending = beginReference({ existing });
    const { state } = complete(mode, pending.state, pending.intent, { existing });
    assert.equal(state.editor, undefined, 'the sent option differing from an existing placement is not a later correction');
    assert.deepEqual(state.observed.links, [existing]);
    assert.equal(state.observed.profile.version, 10);
  });

  test(`${mode} a later option correction is retained even when it equals the existing no-op option`, () => {
    const existing = placement(A, { selectedForDirectory: false, featured: true, position: 17,
      series: [{ seriesId: series.id, position: 3 }] });
    let { state, intent } = beginReference({ existing });
    state = updateReference(state, { selectedForDirectory: false });
    ({ state } = complete(mode, state, intent, { existing }));
    assert.equal(state.editor?.kind, 'link-placement');
    assert.equal(state.editor.editable, false);
    assert.equal(state.editor.draft.selectedForDirectory, false, 'compare latest choice to the submitted choice, not the saved option');
    assert.deepEqual(state.observed.links, [existing], 'the no-op itself changes no placement fields');
    const manual = commands.prepareCreatorOwnerRequest(commands.creatorOwnerWriteIntent('noop-options-manual', state.editor));
    assert.equal(manual.method, 'PATCH');
    assert.equal(manual.body.profileVersion, 10);
    assert.equal(manual.body.placementVersion, 3);
    assert.equal(manual.body.selectedForDirectory, false);
  });
}

test('adopting a read without original A preserves B for a manual reference without claiming A was found', () => {
  let { state, intent } = beginReference();
  state = updateReference(state, { selected: B, selectedForDirectory: false });
  ({ state } = complete('recovered', state, intent, { recovered: false }));
  assert.deepEqual(state.observed.links, []);
  assertManualReference(state, B, false, 11);
  assert.doesNotMatch(state.message.text, /Encontramos la referencia/u);
});

test('adopting unchanged recovered A from the exit prompt finishes the editor and retains the queued destination', () => {
  const pending = beginReference();
  const { state } = complete('recovered', pending.state, pending.intent, { queueExit: true });
  assert.equal(state.editor, undefined);
  assert.equal(state.location.prompt, 'none', 'a completed original reference cannot leave a stale exit prompt open');
  assert.equal(state.location.transition?.href, '/cuenta/?vista=enlaces&buscar=previous', 'the existing transition adapter can continue the chosen exit');
  assert.equal(state.location.transition?.kind, 'history');
});

test('changes after a reference comparison require another check before adoption', () => {
  let { state, intent } = beginReference();
  state = ownerState.creatorOwnerReducer(state, {
    type: 'write-uncertain', intentId: intent.id, status: 'uncertain', message: 'Acknowledgement was lost.',
  });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: 'check-a' });
  const snapshot = { profile: { ...profile, version: 11 }, links: [placement(A)], editableResources: [], claims: [], series: [series] };
  const comparison = commands.createCreatorOwnerComparison(intent, snapshot, state.editor);
  state = ownerState.creatorOwnerReducer(state, {
    type: 'check-compared', intentId: intent.id, checkId: 'check-a', comparison,
  });
  state = updateReference(state, { selected: B, selectedForDirectory: false });
  state = ownerState.creatorOwnerReducer(state, { type: 'adopt-comparison', comparisonId: comparison.id });
  assert.equal(state.attempt.status, 'uncertain');
  assert.equal(state.attempt.comparison, undefined, 'the outdated comparison cannot authorize adoption');
  assert.equal(state.observed.profile.version, 10);
  assert.deepEqual(state.observed.links, []);
  assert.equal(state.editor.selected.id, B.id);
  assert.equal(state.editor.selectedForDirectory, false);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: 'check-after-b' });
  assert.equal(state.attempt.status, 'checking', 'the changed selection leaves an executable explicit recheck');
});

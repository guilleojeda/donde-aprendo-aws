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

function beginReference({ existing, editableResource } = {}) {
  let state = ownerState.createCreatorOwnerState({
    data: { profile, links: existing ? [existing] : [], editableResources: editableResource ? [editableResource] : [], claims: [], series: [series] },
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
  return ownerState.creatorOwnerReducer(state, { type: 'request-exit', transition: {
    href: '/cuenta/?vista=enlaces&buscar=previous', kind: 'history', historyIndex: 0,
  } });
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

test('un refresco de catálogo tras el 409 tardío de A conserva el par vigente y la opción posterior de B', () => {
  let { state, intent } = beginReference();
  state = updateReference(state, { selected: B, selectedForDirectory: false });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: intent.id, status: 'conflict',
    code: 'RESOURCE_CONFLICT', message: 'Actualiza el catálogo y vuelve a seleccionar.' });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-require-refresh', message: 'Actualiza el catálogo.' });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-started' });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [A, B] });

  assert.deepEqual(state.editor.selected, B, 'a valid later selection is not cleared with rejected A');
  assert.equal(state.editor.selectedForDirectory, false, 'B keeps the later directory choice');
  assert.equal(state.attempt.status, 'idle', 'the rejected A no longer blocks a distinct valid manual selection');
  assert.match(state.message.text, /no repetimos la solicitud anterior/u);
  const manualIntent = commands.creatorOwnerWriteIntent('reference-manual-b', state.editor);
  assert.deepEqual(commands.prepareCreatorOwnerRequest(manualIntent).body, {
    resourceId: B.id, url: B.url, profileVersion: profile.version, selectedForDirectory: false,
  });
  assert.equal(ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent: manualIntent }).attempt.status, 'sending');
});

test('una carga tardía quita la selección exacta de A después de adoptar que no quedó guardada', () => {
  let { state, intent } = beginReference();
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: intent.id, status: 'conflict',
    code: 'RESOURCE_CONFLICT', message: 'La URL de A quedó desactualizada.' });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: 'check-stale-a-late-load' });
  const snapshot = { profile: { ...profile, version: 10 }, links: [], editableResources: [], claims: [], series: [series] };
  const comparison = commands.createCreatorOwnerComparison(intent, snapshot, state.editor);
  state = ownerState.creatorOwnerReducer(state, { type: 'check-compared', intentId: intent.id, checkId: 'check-stale-a-late-load', comparison });
  state = ownerState.creatorOwnerReducer(state, { type: 'adopt-comparison', comparisonId: comparison.id });
  assert.equal(state.editor.selected, undefined, 'adoption does not leave the rejected pair ready to submit again');
  assert.equal(state.location.focusAfterRender, '#owner-catalog-search', 'focus returns to an available picker control');

  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [A, B] });
  state = updateReference(state, { selected: A });
  assert.equal(state.attempt.status, 'confirmed');
  assert.equal(state.editor.selected, undefined, 'the lagging index cannot reactivate the rejected exact pair');
  assert.equal(state.editor.selectedForDirectory, true, 'the independent directory choice remains intact');
  assert.match(state.message.text, /dirección ya fue rechazada/u);
  assert.throws(() => commands.prepareCreatorOwnerRequest(commands.creatorOwnerWriteIntent('stale-a-retry', state.editor)),
    'the empty editor cannot prepare A again');
});

test('una etiqueta nueva no invalida la comparación, pero un par ID/URL nuevo sí', () => {
  let { state, intent } = beginReference();
  state = updateReference(state, { selected: B, selectedForDirectory: false });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: intent.id, status: 'conflict',
    code: 'RESOURCE_CONFLICT', message: 'La URL de A quedó desactualizada.' });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: 'check-label' });
  const snapshot = { profile: { ...profile, version: 10 }, links: [], editableResources: [], claims: [], series: [series] };
  const comparison = commands.createCreatorOwnerComparison(intent, snapshot, state.editor);
  state = ownerState.creatorOwnerReducer(state, { type: 'check-compared', intentId: intent.id, checkId: 'check-label', comparison });
  const relabeledB = { ...B, title: 'Lambda workshop (updated label)' };
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-started' });
  state = updateReference(state, { selected: relabeledB });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [A, relabeledB] });
  state = ownerState.creatorOwnerReducer(state, { type: 'adopt-comparison', comparisonId: comparison.id });
  assert.equal(state.attempt.status, 'confirmed', 'the exact B pair and option are unchanged despite its display label');
  assert.equal(state.editor.selected.title, relabeledB.title);
  assert.equal(state.editor.selectedForDirectory, false);

  let changed = beginReference();
  changed.state = updateReference(changed.state, { selected: B, selectedForDirectory: false });
  changed.state = ownerState.creatorOwnerReducer(changed.state, { type: 'write-uncertain', intentId: changed.intent.id, status: 'conflict',
    code: 'RESOURCE_CONFLICT', message: 'La URL de A quedó desactualizada.' });
  changed.state = ownerState.creatorOwnerReducer(changed.state, { type: 'begin-check', intentId: changed.intent.id, checkId: 'check-pair' });
  const changedComparison = commands.createCreatorOwnerComparison(changed.intent, snapshot, changed.state.editor);
  changed.state = ownerState.creatorOwnerReducer(changed.state, { type: 'check-compared', intentId: changed.intent.id, checkId: 'check-pair', comparison: changedComparison });
  const changedPair = { ...B, url: `${B.url}?revision=2` };
  changed.state = ownerState.creatorOwnerReducer(changed.state, { type: 'catalog-load-ready', entries: [A, changedPair] });
  changed.state = updateReference(changed.state, { selected: changedPair });
  changed.state = ownerState.creatorOwnerReducer(changed.state, { type: 'adopt-comparison', comparisonId: changedComparison.id });
  assert.equal(changed.state.attempt.status, 'uncertain', 'a different literal URL invalidates the old comparison');
  assert.equal(changed.state.attempt.comparison, undefined);
  assert.equal(changed.state.editor.selected.url, changedPair.url);
});

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
    assert.equal(ownerState.creatorOwnerDraftIsDirty(state.editor), true,
      'the later choice remains an explicit unsaved decision even when it equals the saved value');
    assert.deepEqual(state.observed.links, [existing], 'the no-op itself changes no placement fields');
    const manual = commands.prepareCreatorOwnerRequest(commands.creatorOwnerWriteIntent('noop-options-manual', state.editor));
    assert.equal(manual.method, 'PATCH');
    assert.equal(manual.body.profileVersion, 10);
    assert.equal(manual.body.placementVersion, 3);
    assert.equal(manual.body.selectedForDirectory, false);
  });
}

test('a confirmed reference no-op uses its canonical newer resource version and preserves a same-A manual option save', async () => {
  const existing = placement(A, { selectedForDirectory: false, resourceVersion: 4 });
  let { state, intent } = beginReference({ existing });
  const canonical = { ...existing, title: 'IAM guide updated elsewhere', resourceVersion: 5 };
  const response = new Response(JSON.stringify({ link: canonical, created: false, versionChanges: [] }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  const outcome = await commands.interpretCreatorOwnerResponse(response, intent, state.observed);
  assert.equal(outcome.kind, 'confirmed');
  assert.equal(outcome.effect.link.resourceVersion, 5,
    'the actual no-op result carries the canonical shared resource version');
  assert.equal(outcome.effect.link.title, canonical.title);

  state = updateReference(state, { selectedForDirectory: false });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-confirmed', intentId: intent.id,
    correction: true, effect: outcome.effect });
  assert.equal(state.editor?.kind, 'link-placement');
  assert.equal(state.editor.baseLink.resourceVersion, 5);
  assert.equal(state.editor.draft.selectedForDirectory, false);
  assert.equal(ownerState.creatorOwnerDraftIsDirty(state.editor), true);
  const manual = commands.prepareCreatorOwnerRequest(commands.creatorOwnerWriteIntent('canonical-noop-option', state.editor));
  assert.equal(manual.body.resourceVersion, 5,
    'the manual options request uses the canonical result, so a newer shared catalog version does not reject it');
  assert.equal(manual.body.selectedForDirectory, false);
  assert.equal(Object.hasOwn(manual.body, 'title'), false,
    'the reference continuation never gains shared-resource editing authority');
  assert.deepEqual(state.observed.editableResources, [], 'a shared reference does not create edit authority');
});

test('a reference no-op refreshes an existing owner resource projection without granting authority', async () => {
  const existing = placement(A, { selectedForDirectory: true, resourceVersion: 4 });
  let { state, intent } = beginReference({ existing, editableResource: { id: A.id, title: A.title, url: A.url, version: 4 } });
  const canonical = { ...existing, title: 'Owner resource updated elsewhere', resourceVersion: 5 };
  const response = new Response(JSON.stringify({ link: canonical, created: false, versionChanges: [] }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  const outcome = await commands.interpretCreatorOwnerResponse(response, intent, state.observed);
  assert.equal(outcome.kind, 'confirmed');
  state = ownerState.creatorOwnerReducer(state, { type: 'write-confirmed', intentId: intent.id,
    correction: false, effect: outcome.effect });
  assert.deepEqual(state.observed.editableResources, [
    { id: A.id, title: canonical.title, url: A.url, version: 5 },
  ], 'the canonical no-op keeps an already-owned editable projection consistent');
  assert.equal(state.editor, undefined, 'the no-op creates no additional editing step');
});

test('a reference no-op cannot confirm a different placement identity', async () => {
  const existing = placement(A);
  const { state, intent } = beginReference({ existing });
  const response = new Response(JSON.stringify({ link: { ...existing, placementId: 'another-placement' },
    created: false, versionChanges: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const outcome = await commands.interpretCreatorOwnerResponse(response, intent, state.observed);
  assert.equal(outcome.kind, 'uncertain', 'a mismatched canonical placement is not adopted');
});

test('a rejected exact catalog pair stays quarantined across closing and reopening the reference editor', () => {
  let { state, intent } = beginReference();
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: intent.id, status: 'conflict',
    code: 'RESOURCE_CONFLICT', message: 'La URL de A quedó desactualizada.' });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [A, B] });
  state = ownerState.creatorOwnerReducer(state, { type: 'close-editor' });
  state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
    kind: 'reference', key: 'reference', baseProfile: state.observed.profile, selected: undefined, selectedForDirectory: true,
  } });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [A, B] });
  state = updateReference(state, { selected: A });
  assert.equal(state.editor.selected, undefined, 'a lagging cached index cannot re-enable the exact rejected ID/URL pair');
  assert.equal(state.editor.selectedForDirectory, true, 'rejecting A does not change the independent directory choice');
  assert.equal(state.catalog.rejectedReferenceSelections.some(({ id, url }) => id === A.id && url === A.url), true);
  assert.match(state.message.text, /dirección ya fue rechazada/u);

  const currentA = { ...A, url: 'https://catalog.example/a-current' };
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [currentA, B] });
  state = updateReference(state, { selected: currentA, selectedForDirectory: false });
  assert.deepEqual(state.editor.selected, currentA, 'a refreshed replacement URL remains selectable for the same resource ID');
  state = updateReference(state, { selected: A });
  assert.deepEqual(state.editor.selected, currentA, 'the old literal pair stays rejected after a replacement refresh');
  const replacementRequest = commands.prepareCreatorOwnerRequest(commands.creatorOwnerWriteIntent('replacement-a', state.editor));
  assert.deepEqual(replacementRequest.body, { resourceId: A.id, url: currentA.url, profileVersion: profile.version, selectedForDirectory: false });
});

test('a late option decision survives a genuine options conflict and explicit snapshot adoption', () => {
  const existing = placement(A, { selectedForDirectory: false });
  let { state, intent } = beginReference({ existing });
  state = updateReference(state, { selectedForDirectory: false });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-confirmed', intentId: intent.id, correction: true,
    effect: { kind: 'link-added', source: 'reference', created: false, profileId: profile.id, profileVersion: profile.version, link: existing } });
  assert.equal(state.editor.kind, 'link-placement');
  assert.equal(ownerState.creatorOwnerDraftIsDirty(state.editor), true);

  const manual = commands.creatorOwnerWriteIntent('option-save', state.editor);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent: manual });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: manual.id, status: 'conflict',
    code: 'PROFILE_CONFLICT', message: 'El perfil cambió.' });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: manual.id, checkId: 'option-check' });
  const snapshot = { profile: { ...profile, version: 11 }, links: [existing], editableResources: [], claims: [], series: [series] };
  const comparison = commands.createCreatorOwnerComparison(manual, snapshot, state.editor);
  state = ownerState.creatorOwnerReducer(state, { type: 'check-compared', intentId: manual.id, checkId: 'option-check', comparison });
  state = ownerState.creatorOwnerReducer(state, { type: 'adopt-comparison', comparisonId: comparison.id });
  assert.equal(state.editor.kind, 'link-placement');
  assert.equal(state.editor.draft.selectedForDirectory, false);
  assert.equal(state.editor.pendingDirectoryOptionDecision, true);
  assert.equal(ownerState.creatorOwnerDraftIsDirty(state.editor), true,
    'adoption keeps the explicit later decision pending even though it equals the observed value');
  assert.match(state.message.text, /Conservamos tu decisión posterior sobre la propuesta/u);
  assert.equal(commands.prepareCreatorOwnerRequest(commands.creatorOwnerWriteIntent('option-save-again', state.editor)).body.profileVersion, 11);
});

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
  assert.equal(state.location.prompt, 'exit', 'recovery does not turn a proposed destination into an approved exit');
  assert.equal(state.location.exitRequest?.href, '/cuenta/?vista=enlaces&buscar=previous');
  assert.equal(state.location.exitRequest?.kind, 'history');
  assert.equal(state.location.transition, undefined, 'the comparison has not authorized navigation');
  assert.equal(state.location.focusAfterRender, '#owner-exit-discard', 'the remaining prompt choice receives focus');
  const discarded = ownerState.creatorOwnerReducer(state, { type: 'resolve-transition', action: 'discard' });
  assert.equal(discarded.location.exitRequest, undefined);
  assert.equal(discarded.location.transition?.href, '/cuenta/?vista=enlaces&buscar=previous', 'discard explicitly authorizes the queued exit');
});

test('guard and submit eligibility share current reference, claim, photo and option rules', () => {
  let { state } = beginReference();
  assert.equal(ownerState.creatorOwnerCanSubmitEditor(state), true, 'an exact current reference can submit');
  state = updateReference(state, { selected: undefined });
  assert.equal(ownerState.creatorOwnerCanSubmitEditor(state), false, 'an empty reference selection cannot submit');
  state = updateReference(state, { selected: A });
  assert.equal(ownerState.creatorOwnerCanSubmitEditor(state), true);
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-require-refresh', message: 'Refresh needed.' });
  assert.equal(ownerState.creatorOwnerCanSubmitEditor(state), false, 'a reference requires a current catalog pair');

  state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
    kind: 'claim', key: 'claim', baseProfile: state.observed.profile, selected: [], knownUrls: '', evidence: '',
  } });
  assert.equal(ownerState.creatorOwnerCanSubmitEditor(state), false, 'an empty claim cannot submit');
  state = ownerState.creatorOwnerReducer(state, { type: 'update-claim-draft', value: { knownUrls: 'https://known.example/' } });
  assert.equal(ownerState.creatorOwnerCanSubmitEditor(state), true, 'a known URL remains a valid claim route');
  state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
    kind: 'photo', key: 'photo', base: state.observed.profile,
  } });
  assert.equal(ownerState.creatorOwnerCanSubmitEditor(state), false, 'photo requires a selected file');
  state = ownerState.creatorOwnerReducer(state, { type: 'update-photo-file', file: { name: 'photo.png' } });
  assert.equal(ownerState.creatorOwnerCanSubmitEditor(state), true);

  const saved = placement(A, { selectedForDirectory: true });
  state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
    kind: 'link-placement', key: 'link:shared', baseProfile: state.observed.profile, baseLink: saved, editable: false,
    pendingAddDraft: { title: 'Independent draft', url: 'https://draft.example/', description: '', featured: false, selectedForDirectory: true },
    draft: { title: saved.title, url: saved.url, description: '', featured: saved.featured, selectedForDirectory: saved.selectedForDirectory },
  } });
  assert.equal(ownerState.creatorOwnerLinkOptionsAreDirty(state.editor), false);
  assert.equal(ownerState.creatorOwnerCanSubmitEditor(state), false, 'saving an unchanged shared option is unavailable');
  state = ownerState.creatorOwnerReducer(state, { type: 'update-link-draft', value: { selectedForDirectory: false } });
  assert.equal(ownerState.creatorOwnerLinkOptionsAreDirty(state.editor), true);
  assert.equal(ownerState.creatorOwnerDraftIsDirty(state.editor), true);
  assert.equal(ownerState.creatorOwnerCanSubmitEditor(state), true, 'the same current option difference enables Save');
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
  assert.equal(state.attempt.message, 'Tus campos cambiaron después de la comparación. Vuelve a comprobar antes de adoptar.',
    'the active attempt retains the reason so the open recovery dialog can show it');
  assert.equal(state.location.focusAfterRender, '#owner-compare', 'the executable recheck receives focus in the open dialog');
  assert.equal(state.observed.profile.version, 10);
  assert.deepEqual(state.observed.links, []);
  assert.equal(state.editor.selected.id, B.id);
  assert.equal(state.editor.selectedForDirectory, false);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: 'check-after-b' });
  assert.equal(state.attempt.status, 'checking', 'the changed selection leaves an executable explicit recheck');
});

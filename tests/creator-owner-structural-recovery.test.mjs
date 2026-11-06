import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function loadModule(path) {
  const { outputFiles } = await build({
    entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, format: 'esm', platform: 'node', write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const ownerState = await loadModule('../src/lib/creator-owner-state.ts');
const commands = await loadModule('../src/lib/creator-owner-commands.ts');
const ownerLinks = await loadModule('../src/lib/creator-owner-links.ts');
const ownerSeries = await loadModule('../src/lib/creator-owner-series.ts');

const profile = {
  id: 'profile-structural', displayName: 'Creator', slug: 'creator', programs: [], socials: {},
  published: false, hidden: false, version: 1,
};
const A = { id: 'catalog-a', title: 'Shared guide', url: 'https://catalog.example/a', tipo: 'content' };
const B = { id: 'catalog-b', title: 'Next guide', url: 'https://catalog.example/b', tipo: 'content' };
const link = {
  placementId: 'placement-a', resourceId: A.id, title: A.title, url: A.url, description: 'Saved description',
  featured: true, position: 0, selectedForDirectory: false, hidden: false, directoryApproval: 'approved',
  resourceVersion: 4, placementVersion: 1, series: [],
};

function initialState({ links = [link], editableResources = [] } = {}) {
  let state = ownerState.createCreatorOwnerState({
    data: { profile, links, editableResources, claims: [], series: [] },
    accountEmail: 'creator@example.test', csrfToken: 'csrf', sessionBinding: 'a'.repeat(64),
    isAdmin: false, publicOrigin: 'https://example.test', view: 'enlaces',
    linksQuery: ownerLinks.DEFAULT_CREATOR_OWNER_LINKS_QUERY,
    seriesQuery: ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
  });
  return ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [A, B] });
}

function pendingAdd() {
  let state = initialState();
  state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
    kind: 'add-link', key: 'add-link', baseProfile: profile,
    draft: { title: 'Independent Add title', url: A.url, description: 'Independent Add description',
      featured: false, selectedForDirectory: true },
  } });
  const intent = commands.creatorOwnerWriteIntent('add-a', state.editor);
  return ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
}

function beginComparison(state, intent, snapshot, code = 'LINK_CONFLICT', addPlacementId) {
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: intent.id,
    status: 'conflict', code, message: 'The options write conflicted.' });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: `${intent.id}:check` });
  const comparison = commands.createCreatorOwnerComparison(intent, snapshot, state.editor);
  state = ownerState.creatorOwnerReducer(state, { type: 'check-compared', intentId: intent.id,
    checkId: `${intent.id}:check`, comparison });
  state = ownerState.creatorOwnerReducer(state, { type: 'adopt-comparison', comparisonId: comparison.id, ...(addPlacementId ? { addPlacementId } : {}) });
  return { state, comparison };
}

for (const failure of [
  { status: 404, error: 'PLACEMENT_NOT_FOUND' },
  { status: 409, error: 'LINK_CONFLICT' },
]) {
  test(`a missing shared Add placement ${failure.status} adopts the owner profile and preserves the full Add draft`, async () => {
    let state = pendingAdd();
    const addIntent = state.attempt.intent;
    const duplicate = ownerState.creatorOwnerReducer(state, { type: 'write-confirmed', intentId: addIntent.id,
      correction: false, effect: { kind: 'link-added', profileId: profile.id, profileVersion: profile.version,
        link, source: 'url', created: false } });
    state = duplicate;
    assert.equal(state.editor.kind, 'link-placement');
    assert.deepEqual(state.editor.pendingAddDraft, addIntent.capture.draft);

    const optionsIntent = commands.creatorOwnerWriteIntent('options-a', state.editor);
    const failureResponse = new Response(JSON.stringify({ error: failure.error }), {
      status: failure.status, headers: { 'content-type': 'application/json' },
    });
    const outcome = await commands.interpretCreatorOwnerResponse(failureResponse, optionsIntent, state.observed);
    assert.equal(outcome.kind, 'conflict');
    if (failure.status === 404) assert.equal(outcome.code, 'PLACEMENT_NOT_FOUND');
    state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent: optionsIntent });

    const adopted = beginComparison(state, optionsIntent, {
      profile: { ...profile, version: 2 }, links: [], editableResources: [], claims: [], series: [],
    }, failure.error);
    state = adopted.state;
    assert.equal(adopted.comparison.canAdopt, true);
    assert.equal(state.editor.kind, 'add-link');
    assert.equal(state.editor.baseProfile.version, 2);
    assert.deepEqual(state.editor.draft, addIntent.capture.draft);
    assert.deepEqual(state.observed.links, [], 'adoption does not recreate the removed placement');

    const next = commands.prepareCreatorOwnerRequest(commands.creatorOwnerWriteIntent('next-add', state.editor));
    assert.equal(next.body.profileVersion, 2, 'the next Add uses the adopted profile version');
    assert.equal(next.body.url, A.url, 'the complete independent draft remains available for a manual choice');
  });
}

for (const failure of [
  { status: 404, error: 'PLACEMENT_NOT_FOUND' },
  { status: 409, error: 'LINK_CONFLICT' },
]) {
  test(`a missing reference options placement ${failure.status} returns to an explicit exact-pair decision`, async () => {
    let state = initialState();
    state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
      kind: 'reference', key: 'reference', baseProfile: profile, selected: A, selectedForDirectory: true,
    } });
    const referenceIntent = commands.creatorOwnerWriteIntent('reference-a', state.editor);
    state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent: referenceIntent });
    state = ownerState.creatorOwnerReducer(state, { type: 'update-reference-draft', selectedForDirectory: false });
    state = ownerState.creatorOwnerReducer(state, { type: 'write-confirmed', intentId: referenceIntent.id,
      correction: true, effect: { kind: 'link-added', profileId: profile.id, profileVersion: profile.version,
        link, source: 'reference', created: false } });
    assert.equal(state.editor.kind, 'link-placement');
    assert.equal(state.editor.optionsOnly, true);

    const optionsIntent = commands.creatorOwnerWriteIntent('reference-options', state.editor);
    const response = await commands.interpretCreatorOwnerResponse(new Response(JSON.stringify({ error: failure.error }), {
      status: failure.status, headers: { 'content-type': 'application/json' },
    }), optionsIntent, state.observed);
    assert.equal(response.kind, 'conflict');
    if (failure.status === 404) assert.equal(response.code, 'PLACEMENT_NOT_FOUND');
    state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent: optionsIntent });

    const adopted = beginComparison(state, optionsIntent, {
      profile: { ...profile, version: 2 }, links: [], editableResources: [], claims: [], series: [],
    }, failure.error);
    state = adopted.state;
    assert.equal(adopted.comparison.canAdopt, true);
    assert.equal(state.editor.kind, 'reference');
    assert.equal(state.editor.baseProfile.version, 2);
    assert.deepEqual(state.editor.selected, A, 'only the exact removed resource ID and URL return to the picker');
    assert.equal(state.editor.selectedForDirectory, false, 'the later directory choice remains intact');
    assert.deepEqual(state.observed.links, [], 'adopting the removal does not recreate the placement');

    state = ownerState.creatorOwnerReducer(state, { type: 'update-reference-draft', selected: B });
    const next = commands.prepareCreatorOwnerRequest(commands.creatorOwnerWriteIntent('manual-reference-b', state.editor));
    assert.deepEqual(next.body, { resourceId: B.id, url: B.url, profileVersion: 2, selectedForDirectory: false });
  });
}

test('duplicate Add acknowledgement and explicit observed-placement recovery share the same Add continuation', () => {
  const acknowledgedState = pendingAdd();
  const addIntent = acknowledgedState.attempt.intent;
  const acknowledged = ownerState.creatorOwnerReducer(acknowledgedState, { type: 'write-confirmed', intentId: addIntent.id,
    correction: false, effect: { kind: 'link-added', profileId: profile.id, profileVersion: profile.version,
      link, source: 'url', created: false } });

  let recovery = pendingAdd();
  const original = recovery.attempt.intent;
  recovery = ownerState.creatorOwnerReducer(recovery, { type: 'write-uncertain', intentId: original.id,
    status: 'uncertain', message: 'The acknowledgement was lost.' });
  recovery = ownerState.creatorOwnerReducer(recovery, { type: 'begin-check', intentId: original.id, checkId: 'add-check' });
  const comparison = commands.createCreatorOwnerComparison(original, {
    profile, links: [link], editableResources: [], claims: [], series: [],
  }, recovery.editor);
  assert.equal(comparison.savedAddPlacementId, link.placementId);
  assert.match(comparison.message, /No pudimos confirmar el alta/u,
    'the owner read is an observation, not proof that this Add created the row');
  recovery = ownerState.creatorOwnerReducer(recovery, { type: 'check-compared', intentId: original.id,
    checkId: 'add-check', comparison });
  recovery = ownerState.creatorOwnerReducer(recovery, { type: 'adopt-comparison', comparisonId: comparison.id,
    addPlacementId: link.placementId });

  assert.equal(acknowledged.editor.kind, 'link-placement');
  assert.deepEqual(recovery.editor, acknowledged.editor,
    'both continuations preserve the same full Add draft and exact selected placement');
  assert.match(recovery.message.text, /Abriste la ficha que elegiste/u,
    'the adopted row is named as an explicit choice, not attributed to the lost request');
});

test('duplicate Add keeps only unsaved shared intent and leaves owned corrections in the resource editor', () => {
  const duplicateDrafts = [
    { title: link.title, url: link.url, description: link.description, featured: false, selectedForDirectory: link.selectedForDirectory },
    { title: 'Shared text correction', url: link.url, description: 'Changed description', featured: false, selectedForDirectory: link.selectedForDirectory },
  ];
  const settled = duplicateDrafts.map((draft, index) => {
    let state = initialState();
    state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
      kind: 'add-link', key: 'add-link', baseProfile: profile, draft,
    } });
    const intent = commands.creatorOwnerWriteIntent(`shared-${index}`, state.editor);
    state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
    return ownerState.creatorOwnerReducer(state, { type: 'write-confirmed', intentId: intent.id,
      correction: false, effect: { kind: 'link-added', profileId: profile.id, profileVersion: profile.version,
        link, source: 'url', created: false } });
  });
  assert.equal(settled[0].editor, undefined, 'an unchanged duplicate keeps the prior clean-close behavior');
  assert.equal(settled[1].editor.kind, 'add-link', 'shared text-only intent stays in the Add form');
  assert.equal(settled[1].editor.draft.title, duplicateDrafts[1].title);

  const ownedResource = { id: A.id, title: A.title, url: A.url, description: link.description, version: link.resourceVersion };
  let owned = initialState({ editableResources: [ownedResource] });
  const ownerDraft = { title: 'Owner correction', url: link.url, description: 'Owner description',
    featured: false, selectedForDirectory: link.selectedForDirectory };
  owned = ownerState.creatorOwnerReducer(owned, { type: 'open-editor', editor: {
    kind: 'add-link', key: 'add-link', baseProfile: profile, draft: ownerDraft,
  } });
  const addIntent = commands.creatorOwnerWriteIntent('owned-duplicate', owned.editor);
  owned = ownerState.creatorOwnerReducer(owned, { type: 'begin-write', intent: addIntent });
  owned = ownerState.creatorOwnerReducer(owned, { type: 'write-confirmed', intentId: addIntent.id,
    correction: false, effect: { kind: 'link-added', profileId: profile.id, profileVersion: profile.version,
      link, source: 'url', created: false } });
  assert.equal(owned.editor.kind, 'link-placement');
  assert.equal(owned.editor.editable, true);
  assert.equal(owned.editor.pendingAddDraft, undefined,
    'an owned correction belongs to the editable resource and is not duplicated as a pending Add');
  const saveIntent = commands.creatorOwnerWriteIntent('save-owned-correction', owned.editor);
  owned = ownerState.creatorOwnerReducer(owned, { type: 'begin-write', intent: saveIntent });
  owned = ownerState.creatorOwnerReducer(owned, { type: 'write-confirmed', intentId: saveIntent.id, correction: false,
    effect: { kind: 'link-updated', profileId: profile.id, profileVersion: 2,
      link: { ...link, title: ownerDraft.title, description: ownerDraft.description, resourceVersion: link.resourceVersion + 1 } } });
  assert.equal(owned.editor.kind, 'link-placement');
  assert.equal(owned.editor.pendingAddDraft, undefined, 'saving the explicit owned correction never sends it back to Add');
});

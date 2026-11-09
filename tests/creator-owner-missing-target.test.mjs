import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import {
  callApi,
  createCreatorPagesHarness,
  createDocumentStore,
  responseJson,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';
import { creatorPageSessionBinding } from '../src/lib/creator-session-context.mjs';

async function loadModule(path) {
  const { outputFiles } = await build({
    entryPoints: [new URL(path, import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const ownerState = await loadModule('../src/lib/creator-owner-state.ts');
const commands = await loadModule('../src/lib/creator-owner-commands.ts');
const ownerData = await loadModule('../src/lib/creator-owner-data.ts');
const ownerLinks = await loadModule('../src/lib/creator-owner-links.ts');
const ownerSeries = await loadModule('../src/lib/creator-owner-series.ts');

const accountIds = { 'creator-a': 'private-account-a', 'creator-b': 'private-account-b' };
const origin = 'https://dondeaprendoaws.com';
const ownerBinding = (session) => creatorPageSessionBinding({ accountId: accountIds[session], isAdmin: false });

async function api(harness, path, { session = 'creator-a', method = 'GET', body, headers = {} } = {}) {
  return callApi(harness, path, {
    session,
    csrf: sessionCsrf[session],
    method,
    ...(body === undefined ? {} : { body }),
    ...(Object.keys(headers).length ? { extraHeaders: headers } : {}),
  });
}

async function createProfile(harness, session, slug) {
  const response = await api(harness, '/api/creador/perfil', {
    session,
    method: 'PUT',
    body: { displayName: `Creator ${session}`, slug },
  });
  assert.equal(response.status, 200);
}

async function ownerSnapshot(harness, session = 'creator-a') {
  const response = await api(harness, '/api/creador/perfil', {
    session,
    headers: { 'x-creator-page-binding': ownerBinding(session) },
  });
  assert.equal(response.status, 200);
  return responseJson(response);
}

function stateFor(snapshot, { view = 'enlaces', seriesQuery, linksQuery } = {}) {
  return ownerState.createCreatorOwnerState({
    data: snapshot,
    accountEmail: 'creator@example.test',
    csrfToken: 'csrf-a',
    sessionBinding: ownerBinding('creator-a'),
    isAdmin: false,
    publicOrigin: origin,
    view,
    seriesQuery: seriesQuery ?? ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
    linksQuery: linksQuery ?? ownerLinks.DEFAULT_CREATOR_OWNER_LINKS_QUERY,
  });
}

function catalogSelection(link) {
  return { id: link.resourceId, title: link.title, url: link.url, tipo: 'content' };
}

function assertCandidateIdentity(actual, expected) {
  assert.equal(actual?.id, expected.id);
  assert.equal(actual?.url, expected.url);
  assert.equal(actual?.title, expected.title);
}

function openLinkEditor(state, link, { editable, optionsOnly = false, pendingAddDraft } = {}) {
  return ownerState.creatorOwnerReducer(state, {
    type: 'open-editor',
    editor: {
      kind: 'link-placement',
      key: `link:${link.placementId}`,
      baseProfile: state.observed.profile,
      baseLink: link,
      editable,
      ...(optionsOnly ? { optionsOnly: true } : {}),
      ...(pendingAddDraft ? { pendingAddDraft } : {}),
      draft: {
        title: link.title,
        url: link.url,
        description: link.description ?? '',
        featured: link.featured,
        selectedForDirectory: link.selectedForDirectory,
      },
    },
  });
}

function beginRecovery(state, intent, snapshot, { code = 'PLACEMENT_NOT_FOUND', queueExit = false } = {}) {
  state = ownerState.creatorOwnerReducer(state, {
    type: 'write-uncertain', intentId: intent.id, status: 'conflict', code, message: 'Compare el estado guardado.',
  });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: `${intent.id}:check` });
  const comparison = commands.createCreatorOwnerComparison(intent, snapshot, state.editor);
  state = ownerState.creatorOwnerReducer(state, {
    type: 'check-compared', intentId: intent.id, checkId: `${intent.id}:check`, comparison,
  });
  if (queueExit) {
    state = ownerState.creatorOwnerReducer(state, { type: 'request-exit', transition: {
      href: '/cuenta/?vista=enlaces&buscar=previous', kind: 'history', historyIndex: 0,
    } });
  }
  return { state, comparison };
}

async function createSeries(harness, name, slug) {
  const snapshot = await ownerSnapshot(harness);
  const response = await api(harness, '/api/creador/series', {
    method: 'POST', body: { name, slug, profileVersion: snapshot.profile.version },
  });
  assert.equal(response.status, 201);
  return (await responseJson(response)).series;
}

test('a known Series deleted after the owner version check is a recoverable service conflict and returns to the list', async () => {
  const backingStore = createDocumentStore();
  let targetSeriesId;
  let blockSeriesRead = false;
  let announceTargetRead;
  let releaseTargetRead;
  const targetReadReached = new Promise((resolve) => { announceTargetRead = resolve; });
  const continueTargetRead = new Promise((resolve) => { releaseTargetRead = resolve; });
  const store = {
    ...backingStore,
    async get(key) {
      if (blockSeriesRead && key.startsWith('series:') && key.endsWith(`:${targetSeriesId}`)) {
        blockSeriesRead = false;
        announceTargetRead();
        await continueTargetRead;
      }
      return backingStore.get(key);
    },
  };
  const harness = await createCreatorPagesHarness({ store });
  await createProfile(harness, 'creator-a', 'series-deleted-during-save');
  const series = await createSeries(harness, 'Series to remove', 'series-to-remove');
  targetSeriesId = series.id;
  const before = await ownerSnapshot(harness);
  const query = { ...ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
    buscarSeries: 'preserve this search', serie: series.id, buscarCapitulos: 'old chapter query', pertenencia: 'incluidos' };
  let state = stateFor(before, { view: 'series', seriesQuery: query });
  state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
    kind: 'series', key: `series:${series.id}`, baseProfile: before.profile, baseSeries: series,
    draft: { name: series.name, slug: series.slug, description: '' }, slugManuallyEdited: true,
  } });
  state = ownerState.creatorOwnerReducer(state, { type: 'update-series-draft', value: { name: 'Locally renamed series' } });
  const intent = commands.creatorOwnerWriteIntent('series-update', state.editor);
  const request = commands.prepareCreatorOwnerRequest(intent);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });

  // The real PATCH checks profileVersion before reading its known Series target.
  // Pausing only that target read lets a second service request delete it in between.
  blockSeriesRead = true;
  const pendingSave = api(harness, request.path, { method: request.method, body: request.body });
  await targetReadReached;
  let removed;
  try {
    removed = await api(harness, `/api/creador/series/${encodeURIComponent(series.id)}`, {
      method: 'DELETE', body: { version: series.version, profileVersion: before.profile.version },
    });
  } finally {
    releaseTargetRead();
  }
  assert.equal(removed.status, 204, 'the competing writer really deletes the known Series');

  const failedSave = await pendingSave;
  assert.equal(failedSave.status, 404);
  assert.equal((await responseJson(failedSave.clone())).error, 'SERIES_NOT_FOUND');
  const interpreted = await commands.interpretCreatorOwnerResponse(failedSave, intent, before);
  assert.equal(interpreted.code, 'SERIES_NOT_FOUND');
  assert.equal(interpreted.kind, 'conflict', 'a known-ID removal reaches Compare instead of generic rejection');
  if (interpreted.kind !== 'conflict') return;

  const current = await ownerSnapshot(harness);
  assert.equal(current.series.some(({ id }) => id === series.id), false, 'the fresh owner read observes the real deletion');
  const recovery = beginRecovery(state, intent, current, { code: interpreted.code, queueExit: true });
  assert.equal(recovery.comparison.canAdopt, true, 'the same-owner snapshot remains valid when the known Series is absent');
  assert.equal(recovery.state.attempt.status, 'uncertain');
  assert.equal(recovery.state.attempt.comparison.id, recovery.comparison.id);
  assert.equal(recovery.state.attempt.comparison.canAdopt, true);
  state = ownerState.creatorOwnerReducer(recovery.state, { type: 'adopt-comparison', comparisonId: recovery.comparison.id });
  assert.equal(state.attempt.status, 'confirmed');
  assert.equal(state.editor, undefined, 'the deleted Series editor closes only after explicit adoption');
  assert.deepEqual(state.observed.series, []);
  assert.equal(state.location.query.serie, '');
  assert.equal(state.location.query.buscarCapitulos, '');
  assert.equal(state.location.query.pertenencia, 'todos');
  assert.equal(state.location.query.buscarSeries, query.buscarSeries, 'valid Series search remains useful in the list');
  assert.equal(state.location.exitRequest, undefined, 'the old editor exit cannot run after the editor closes');
  assert.equal(state.location.transition, undefined);
  assert.equal(state.location.prompt, 'none');
});

test('ordinary owned placement removal recovers a retained metadata edit, invalidates stale comparison, and saves only by a later manual request', async () => {
  const harness = await createCreatorPagesHarness();
  await createProfile(harness, 'creator-a', 'ordinary-owned-removal');
  const created = await api(harness, '/api/creador/enlaces', {
    method: 'POST', body: { title: 'Saved title', url: 'https://owned.example/guide', description: 'Saved description' },
  });
  assert.equal(created.status, 201);
  const originalLink = (await responseJson(created)).link;
  const before = await ownerSnapshot(harness);
  let state = openLinkEditor(stateFor(before), originalLink, { editable: true });
  state = ownerState.creatorOwnerReducer(state, { type: 'update-link-draft', value: {
    title: 'Local correction', description: 'Local description', featured: true, selectedForDirectory: false,
  } });
  const intent = commands.creatorOwnerWriteIntent('owned-placement-edit', state.editor);
  const request = commands.prepareCreatorOwnerRequest(intent);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });

  const deleted = await api(harness, `/api/creador/enlaces/${encodeURIComponent(originalLink.placementId)}`, {
    method: 'DELETE', body: { profileVersion: before.profile.version },
  });
  assert.equal(deleted.status, 204, 'the competing owner write removes the placement');
  const failedSave = await api(harness, request.path, { method: request.method, body: request.body });
  assert.equal(failedSave.status, 404);
  assert.equal((await responseJson(failedSave.clone())).error, 'PLACEMENT_NOT_FOUND');
  const interpreted = await commands.interpretCreatorOwnerResponse(failedSave, intent, before);
  assert.equal(interpreted.kind, 'conflict');
  if (interpreted.kind !== 'conflict') return;
  assert.equal(interpreted.code, 'PLACEMENT_NOT_FOUND');

  const current = await ownerSnapshot(harness);
  assert.equal(current.links.some(({ placementId }) => placementId === originalLink.placementId), false);
  assert.deepEqual(current.editableResources.map(({ id }) => id), [originalLink.resourceId],
    'the actual service retains metadata authority after its placement disappears');
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: intent.id, status: 'conflict',
    code: interpreted.code, message: interpreted.message });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: 'owned-check-1' });
  let comparison = commands.createCreatorOwnerComparison(intent, current, state.editor);
  assert.equal(comparison.canAdopt, true, 'an ordinary Edit can adopt a valid same-owner snapshot with its placement absent');
  state = ownerState.creatorOwnerReducer(state, { type: 'check-compared', intentId: intent.id, checkId: 'owned-check-1', comparison });
  assert.equal(state.attempt.status, 'uncertain');
  assert.equal(state.attempt.comparison.id, comparison.id);
  assert.equal(state.attempt.comparison.canAdopt, true);

  state = ownerState.creatorOwnerReducer(state, { type: 'update-link-draft', value: { title: 'Changed after Compare' } });
  state = ownerState.creatorOwnerReducer(state, { type: 'adopt-comparison', comparisonId: comparison.id });
  assert.equal(state.attempt.status, 'uncertain', 'local edits made after Compare cannot be overwritten by adoption');
  assert.equal(state.attempt.comparison, undefined);
  assert.equal(state.observed.profile.version, before.profile.version);
  assert.equal(state.editor.draft.title, 'Changed after Compare');

  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: 'owned-check-2' });
  comparison = commands.createCreatorOwnerComparison(intent, current, state.editor);
  assert.equal(comparison.canAdopt, true);
  state = ownerState.creatorOwnerReducer(state, { type: 'check-compared', intentId: intent.id, checkId: 'owned-check-2', comparison });
  assert.equal(state.attempt.status, 'uncertain');
  assert.equal(state.attempt.comparison.id, comparison.id);
  state = ownerState.creatorOwnerReducer(state, { type: 'request-exit', transition: {
    href: '/cuenta/?vista=enlaces&buscar=previous', kind: 'history', historyIndex: 0,
  } });
  state = ownerState.creatorOwnerReducer(state, { type: 'adopt-comparison', comparisonId: comparison.id });
  assert.equal(state.editor.kind, 'link-resource', 'the next editor is the retained resource editor');
  assert.deepEqual(state.editor.baseResource, current.editableResources[0]);
  assert.equal(state.editor.draft.title, 'Changed after Compare', 'the explicit continuation keeps the local metadata correction');
  assert.equal(state.editor.draft.description, 'Local description');
  assert.equal(Object.hasOwn(state.editor.draft, 'featured'), false, 'removed placement options are not moved into metadata editing');
  assert.equal(Object.hasOwn(state.editor.draft, 'selectedForDirectory'), false);
  assert.deepEqual(state.observed.links, [], 'adoption does not re-add the placement');
  assert.equal(state.location.exitRequest, undefined, 'changing editor clears the old exit request');
  assert.equal(state.location.transition, undefined);
  assert.equal(state.location.prompt, 'none');

  const manualIntent = commands.creatorOwnerWriteIntent('manual-retained-metadata', state.editor);
  const manualRequest = commands.prepareCreatorOwnerRequest(manualIntent);
  assert.equal(manualRequest.method, 'PATCH');
  assert.deepEqual(manualRequest.body, {
    version: current.editableResources[0].version,
    title: 'Changed after Compare',
    url: originalLink.url,
    description: 'Local description',
  });
  const saved = await api(harness, manualRequest.path, { method: manualRequest.method, body: manualRequest.body });
  assert.equal(saved.status, 200, 'metadata changes require the new explicit resource request');
  assert.equal((await commands.interpretCreatorOwnerResponse(saved, manualIntent, current)).kind, 'confirmed');
  const afterManualSave = await ownerSnapshot(harness);
  assert.equal(afterManualSave.links.length, 0, 'metadata save still does not recreate or re-add a placement');
  assert.equal(afterManualSave.editableResources[0].title, 'Changed after Compare');
  assert.equal(afterManualSave.editableResources[0].description, 'Local description');
});

const replacementCorrection = {
  title: 'Local title correction',
  url: 'https://resource.example/local',
  description: 'Local description',
  featured: false,
  selectedForDirectory: true,
};

function prepareReplacementRecovery({ matchCount = 1, metadataAuthority = false } = {}) {
  const profile = { id: 'profile-history', displayName: 'Creator', slug: 'creator', programs: [], socials: {},
    published: false, hidden: false, version: 7 };
  const original = { placementId: 'legacy-placement', resourceId: 'resource-exact', title: 'Old title', url: 'https://resource.example/old',
    description: 'Old description', featured: false, position: 0, selectedForDirectory: true, hidden: false,
    directoryApproval: 'pending', resourceVersion: 3, placementVersion: 1, series: [] };
  const replacement = { ...original, placementId: 'replacement-placement-a', title: 'Current title', url: 'https://resource.example/current',
    description: 'Current description', featured: true, selectedForDirectory: false, resourceVersion: 5, placementVersion: 2 };
  const replacements = [replacement, ...(matchCount > 1 ? [{ ...replacement,
    placementId: 'replacement-placement-b', position: 1, placementVersion: 3 }] : [])];
  const currentResource = { id: replacement.resourceId, title: replacement.title, url: replacement.url,
    description: replacement.description, version: replacement.resourceVersion };
  const before = { profile: { ...profile, version: 6 }, links: [original], editableResources: [
    { id: original.resourceId, title: original.title, url: original.url, description: original.description, version: original.resourceVersion },
  ], claims: [], series: [] };
  const current = { profile, links: replacements, editableResources: metadataAuthority ? [currentResource] : [], claims: [], series: [] };
  assert.equal(ownerData.isCreatorOwnerSnapshot(before), true);
  assert.equal(ownerData.isCreatorOwnerSnapshot(current), true,
    'distinct placement IDs for one exact resource are valid DTOs, including the historical multiple-match case');
  let state = openLinkEditor(stateFor(before), original, { editable: true });
  state = ownerState.creatorOwnerReducer(state, { type: 'update-link-draft', value: replacementCorrection });
  const intent = commands.creatorOwnerWriteIntent('legacy-placement-edit', state.editor);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: intent.id, status: 'conflict',
    code: 'PLACEMENT_NOT_FOUND', message: 'Compare.' });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: 'replacement-check' });
  const comparison = commands.createCreatorOwnerComparison(intent, current, state.editor);
  state = ownerState.creatorOwnerReducer(state, { type: 'check-compared', intentId: intent.id, checkId: 'replacement-check', comparison });
  assert.equal(state.attempt.status, 'uncertain');
  assert.equal(state.attempt.comparison.id, comparison.id);
  assert.deepEqual(state.editor.draft, replacementCorrection, 'the old correction remains available until the user chooses');
  return { state, comparison, current, replacements };
}

test('a unique exact-resource replacement with current metadata authority keeps corrections and prepares a PATCH for its current base', () => {
  const { state: checked, comparison, current, replacements } = prepareReplacementRecovery({ metadataAuthority: true });
  assert.equal(comparison.canAdopt, true, 'the exact resource identity has one current placement despite the old placement ID being absent');
  const state = ownerState.creatorOwnerReducer(checked, { type: 'adopt-comparison', comparisonId: comparison.id });
  assert.equal(state.attempt.status, 'confirmed');
  assert.equal(state.editor.kind, 'link-placement', 'an actively placed resource never becomes a retained-resource editor');
  assert.equal(state.editor.baseLink.placementId, replacements[0].placementId);
  assert.equal(state.editor.editable, true, 'the current owner snapshot still grants metadata authority');
  assert.equal(state.editor.draft.title, replacementCorrection.title);
  assert.equal(state.editor.draft.url, replacementCorrection.url);
  assert.equal(state.editor.draft.description, replacementCorrection.description);
  assert.equal(state.editor.draft.featured, replacements[0].featured);
  assert.equal(state.editor.draft.selectedForDirectory, replacements[0].selectedForDirectory);

  const request = commands.prepareCreatorOwnerRequest(commands.creatorOwnerWriteIntent('current-placement-edit', state.editor));
  assert.equal(request.path, `/api/creador/enlaces/${encodeURIComponent(replacements[0].placementId)}/editar/`);
  assert.deepEqual(request.body, {
    profileVersion: current.profile.version,
    placementVersion: replacements[0].placementVersion,
    resourceVersion: replacements[0].resourceVersion,
    featured: replacements[0].featured,
    selectedForDirectory: replacements[0].selectedForDirectory,
    title: replacementCorrection.title,
    url: replacementCorrection.url,
    description: replacementCorrection.description,
  });
});

test('a unique exact-resource replacement with revoked metadata authority stays a placement edit and omits metadata from PATCH', () => {
  const { state: checked, comparison, replacements } = prepareReplacementRecovery();
  assert.equal(comparison.canAdopt, true);
  const state = ownerState.creatorOwnerReducer(checked, { type: 'adopt-comparison', comparisonId: comparison.id });
  assert.equal(state.editor.kind, 'link-placement');
  assert.equal(state.editor.baseLink.placementId, replacements[0].placementId);
  assert.equal(state.editor.editable, false, 'absence of current metadata authority cannot grant it from the stale editor');
  assert.equal(state.editor.draft.title, replacements[0].title);
  assert.equal(state.editor.draft.url, replacements[0].url);
  assert.equal(state.editor.draft.description, replacements[0].description);
  assert.equal(state.editor.draft.featured, replacements[0].featured);
  assert.equal(state.editor.draft.selectedForDirectory, replacements[0].selectedForDirectory);
  const request = commands.prepareCreatorOwnerRequest(commands.creatorOwnerWriteIntent('replacement-options', state.editor));
  assert.equal(request.path, `/api/creador/enlaces/${encodeURIComponent(replacements[0].placementId)}/editar/`);
  assert.equal(Object.hasOwn(request.body, 'title'), false);
  assert.equal(Object.hasOwn(request.body, 'url'), false);
  assert.equal(Object.hasOwn(request.body, 'description'), false,
    'a later placement request cannot send stale metadata without current authority');
});

test('an ordinary absent placement with revoked metadata authority falls back to its exact reference candidate', () => {
  const profile = { id: 'profile-authority-revoked', displayName: 'Creator', slug: 'creator', programs: [], socials: {},
    published: false, hidden: false, version: 9 };
  const oldProfile = { ...profile, version: 8 };
  const oldLink = { placementId: 'removed-owned-placement', resourceId: 'resource-now-unavailable', title: 'Known catalog guide',
    url: 'https://catalog.example/known-guide', description: 'Old public description', featured: false, position: 0,
    selectedForDirectory: true, hidden: false, directoryApproval: 'pending', resourceVersion: 4, placementVersion: 2, series: [] };
  const before = { profile: oldProfile, links: [oldLink], editableResources: [
    { id: oldLink.resourceId, title: oldLink.title, url: oldLink.url, description: oldLink.description, version: oldLink.resourceVersion },
  ], claims: [], series: [] };
  const current = { profile, links: [], editableResources: [], claims: [], series: [] };
  assert.equal(ownerData.isCreatorOwnerSnapshot(before), true);
  assert.equal(ownerData.isCreatorOwnerSnapshot(current), true);

  const selection = catalogSelection(oldLink);
  let state = ownerState.creatorOwnerReducer(stateFor(before), { type: 'catalog-load-ready', entries: [selection] });
  state = openLinkEditor(state, oldLink, { editable: true });
  state = ownerState.creatorOwnerReducer(state, { type: 'update-link-draft', value: {
    title: 'Local title correction', url: 'https://catalog.example/local-url', description: 'Local description correction',
    featured: true, selectedForDirectory: false,
  } });
  const intent = commands.creatorOwnerWriteIntent('ordinary-owned-after-authority-loss', state.editor);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: intent.id, status: 'conflict',
    code: 'PLACEMENT_NOT_FOUND', message: 'Compare.' });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: 'authority-loss-check' });
  const comparison = commands.createCreatorOwnerComparison(intent, current, state.editor);
  assert.equal(comparison.canAdopt, true, 'valid same-owner absence remains recoverable after metadata authority is revoked');
  state = ownerState.creatorOwnerReducer(state, { type: 'check-compared', intentId: intent.id,
    checkId: 'authority-loss-check', comparison });
  assert.equal(state.attempt.status, 'uncertain');
  assert.equal(state.attempt.comparison.id, comparison.id);
  assert.deepEqual(state.editor.draft, {
    title: 'Local title correction', url: 'https://catalog.example/local-url', description: 'Local description correction',
    featured: true, selectedForDirectory: false,
  }, 'the old correction remains available until explicit adoption');

  state = ownerState.creatorOwnerReducer(state, { type: 'adopt-comparison', comparisonId: comparison.id });
  assert.equal(state.editor.kind, 'reference', 'without a retained-resource authority the continuation is a reference decision');
  assertCandidateIdentity(state.editor.selected, { id: oldLink.resourceId, url: oldLink.url, title: oldLink.title });
  assert.equal(state.editor.selectedForDirectory, false);
  assert.deepEqual(state.observed.editableResources, []);
  assert.equal(ownerState.creatorOwnerReferenceSubmissionStatus(state, state.editor.selected), 'ready');
  assert.equal(ownerState.creatorOwnerCanSubmitEditor(state), true);

  const manualIntent = commands.creatorOwnerWriteIntent('manual-reference-after-authority-loss', state.editor);
  const request = commands.prepareCreatorOwnerRequest(manualIntent);
  assert.deepEqual(request.body, {
    resourceId: oldLink.resourceId,
    url: oldLink.url,
    profileVersion: current.profile.version,
    selectedForDirectory: false,
  });
  assert.equal(Object.hasOwn(request.body, 'title'), false);
  assert.equal(Object.hasOwn(request.body, 'description'), false);
  assert.equal(Object.hasOwn(request.body, 'featured'), false,
    'a reference request contains no stale metadata or departed placement options');
});

test('multiple valid exact-resource replacements never become a guessed target and keep the local correction', () => {
  const { state: checked, comparison, replacements } = prepareReplacementRecovery({ matchCount: 2, metadataAuthority: true });
  const state = ownerState.creatorOwnerReducer(checked, { type: 'adopt-comparison', comparisonId: comparison.id });
  const installedPlacementId = state.editor?.kind === 'link-placement' ? state.editor.baseLink.placementId : undefined;
  assert.equal(replacements.some(({ placementId }) => placementId === installedPlacementId), false,
    'neither valid current placement can be inferred as the intended replacement');
  assert.notEqual(state.editor?.kind, 'link-resource', 'active placements cannot be reclassified as retained content');
  const retainedDraft = state.editor?.kind === 'link-placement'
    ? state.editor.draft
    : state.attempt.comparison?.draftAtCompare?.draft;
  assert.equal(retainedDraft?.title, replacementCorrection.title);
  assert.equal(retainedDraft?.url, replacementCorrection.url);
  assert.equal(retainedDraft?.description, replacementCorrection.description,
    'the correction remains available until the user makes a valid explicit choice');
});

test('an options-only continuation does not gain metadata rights, and an independent Add draft wins over it', () => {
  const profile = { id: 'profile-modes', displayName: 'Creator', slug: 'creator', programs: [], socials: {},
    published: false, hidden: false, version: 4 };
  const link = { placementId: 'placement-mode', resourceId: 'resource-mode', title: 'Shared', url: 'https://shared.example/mode',
    featured: false, position: 0, selectedForDirectory: true, hidden: false, directoryApproval: 'pending',
    resourceVersion: 1, placementVersion: 1, series: [] };
  const before = { profile: { ...profile, version: 3 }, links: [link], editableResources: [], claims: [], series: [] };
  const current = { profile, links: [], editableResources: [
    { id: link.resourceId, title: 'New authority data', url: link.url, version: 2 },
  ], claims: [], series: [] };
  const selection = catalogSelection(link);

  let optionsState = ownerState.creatorOwnerReducer(stateFor(before), { type: 'catalog-load-ready', entries: [selection] });
  optionsState = openLinkEditor(optionsState, link, { editable: false, optionsOnly: true });
  optionsState = ownerState.creatorOwnerReducer(optionsState, { type: 'update-link-draft', value: { selectedForDirectory: false } });
  const optionsIntent = commands.creatorOwnerWriteIntent('options-only', optionsState.editor);
  optionsState = ownerState.creatorOwnerReducer(optionsState, { type: 'begin-write', intent: optionsIntent });
  optionsState = ownerState.creatorOwnerReducer(optionsState, { type: 'write-uncertain', intentId: optionsIntent.id,
    status: 'conflict', code: 'PLACEMENT_NOT_FOUND', message: 'Compare.' });
  optionsState = ownerState.creatorOwnerReducer(optionsState, { type: 'begin-check', intentId: optionsIntent.id, checkId: 'options-only-check' });
  const optionsComparison = commands.createCreatorOwnerComparison(optionsIntent, current, optionsState.editor);
  assert.equal(optionsComparison.canAdopt, true);
  optionsState = ownerState.creatorOwnerReducer(optionsState, { type: 'check-compared', intentId: optionsIntent.id,
    checkId: 'options-only-check', comparison: optionsComparison });
  assert.equal(optionsState.attempt.status, 'uncertain');
  assert.equal(optionsState.attempt.comparison.id, optionsComparison.id);
  optionsState = ownerState.creatorOwnerReducer(optionsState, { type: 'adopt-comparison', comparisonId: optionsComparison.id });
  assert.equal(optionsState.editor.kind, 'reference');
  assert.equal(optionsState.editor.selectedForDirectory, false);
  assert.deepEqual(optionsState.observed.editableResources, current.editableResources);

  const independentDraft = { title: 'Independent Add draft', url: 'https://new.example/', description: 'Keep this',
    featured: false, selectedForDirectory: true };
  let combined = openLinkEditor(stateFor(before), link, { editable: false, optionsOnly: true, pendingAddDraft: independentDraft });
  const combinedIntent = commands.creatorOwnerWriteIntent('add-precedence', combined.editor);
  combined = ownerState.creatorOwnerReducer(combined, { type: 'begin-write', intent: combinedIntent });
  combined = ownerState.creatorOwnerReducer(combined, { type: 'write-uncertain', intentId: combinedIntent.id,
    status: 'conflict', code: 'PLACEMENT_NOT_FOUND', message: 'Compare.' });
  combined = ownerState.creatorOwnerReducer(combined, { type: 'begin-check', intentId: combinedIntent.id, checkId: 'add-precedence-check' });
  const combinedComparison = commands.createCreatorOwnerComparison(combinedIntent, current, combined.editor);
  assert.equal(combinedComparison.canAdopt, true);
  combined = ownerState.creatorOwnerReducer(combined, { type: 'check-compared', intentId: combinedIntent.id,
    checkId: 'add-precedence-check', comparison: combinedComparison });
  assert.equal(combined.attempt.status, 'uncertain');
  assert.equal(combined.attempt.comparison.id, combinedComparison.id);
  combined = ownerState.creatorOwnerReducer(combined, { type: 'adopt-comparison', comparisonId: combinedComparison.id });
  assert.equal(combined.editor.kind, 'add-link', 'the independent draft has precedence over options-only reference recovery');
  assert.deepEqual(combined.editor.draft, independentDraft);
  assert.equal(combined.editor.baseProfile.version, current.profile.version);
});

test('real stale-reference rejection plus ordinary remove/options adoption retains the unavailable exact candidate until explicit replacement', async () => {
  const backingStore = createDocumentStore();
  let targetResourceId;
  let blockResourceRead = false;
  let announceResourceRead;
  let releaseResourceRead;
  const resourceReadReached = new Promise((resolve) => { announceResourceRead = resolve; });
  const continueResourceRead = new Promise((resolve) => { releaseResourceRead = resolve; });
  const store = {
    ...backingStore,
    async get(key) {
      if (blockResourceRead && key === `resource:${targetResourceId}`) {
        blockResourceRead = false;
        announceResourceRead();
        await continueResourceRead;
      }
      return backingStore.get(key);
    },
  };
  const harness = await createCreatorPagesHarness({ store });
  await createProfile(harness, 'creator-a', 'unavailable-candidate-a');
  await createProfile(harness, 'creator-b', 'unavailable-candidate-b');
  const created = await api(harness, '/api/creador/enlaces', {
    session: 'creator-b', method: 'POST', body: { title: 'Shared resource', url: 'https://shared.example/former-url' },
  });
  assert.equal(created.status, 201);
  const foreignLink = (await responseJson(created)).link;
  targetResourceId = foreignLink.resourceId;
  let before = await ownerSnapshot(harness);
  const referenceResponse = await api(harness, '/api/creador/referencias', {
    method: 'POST', body: { resourceId: foreignLink.resourceId, url: foreignLink.url,
      profileVersion: before.profile.version, selectedForDirectory: true },
  });
  assert.equal(referenceResponse.status, 201);
  before = await ownerSnapshot(harness);
  const oldPlacement = before.links[0];
  const rejectedCandidate = { id: oldPlacement.resourceId, url: oldPlacement.url, title: oldPlacement.title };
  let state = ownerState.creatorOwnerReducer(stateFor(before), {
    type: 'catalog-load-ready', entries: [catalogSelection(oldPlacement)],
  });

  state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
    kind: 'reference', key: 'reference', baseProfile: before.profile,
    selected: catalogSelection(oldPlacement), selectedForDirectory: true,
  } });
  const oldReferenceIntent = commands.creatorOwnerWriteIntent('old-reference-selection', state.editor);
  const oldReferenceRequest = commands.prepareCreatorOwnerRequest(oldReferenceIntent);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent: oldReferenceIntent });

  // The real reference service validates the owner profile before reading the selected resource.
  // Hold that resource read while its actual owner changes the URL, then let the stale request finish.
  blockResourceRead = true;
  const pendingReference = api(harness, oldReferenceRequest.path, {
    method: oldReferenceRequest.method, body: oldReferenceRequest.body,
  });
  await resourceReadReached;
  const creatorB = await ownerSnapshot(harness, 'creator-b');
  const currentResource = creatorB.editableResources.find(({ id }) => id === targetResourceId);
  const movedUrl = 'https://shared.example/current-url';
  let moved;
  try {
    moved = await api(harness, `/api/creador/recursos/${encodeURIComponent(targetResourceId)}`, {
      session: 'creator-b', method: 'PATCH', body: { url: movedUrl, version: currentResource.version },
    });
  } finally {
    releaseResourceRead();
  }
  assert.equal(moved.status, 200);

  const staleResponse = await pendingReference;
  assert.equal(staleResponse.status, 409);
  assert.equal((await responseJson(staleResponse.clone())).error, 'RESOURCE_CONFLICT');
  const staleOutcome = await commands.interpretCreatorOwnerResponse(staleResponse, oldReferenceIntent, before);
  assert.equal(staleOutcome.kind, 'conflict');
  assert.equal(staleOutcome.code, 'RESOURCE_CONFLICT');
  if (staleOutcome.kind !== 'conflict') return;
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: oldReferenceIntent.id,
    status: 'conflict', code: staleOutcome.code, message: staleOutcome.message });
  assert.deepEqual(state.catalog.rejectedReferenceSelections, [{ id: rejectedCandidate.id, url: rejectedCandidate.url }]);

  state = openLinkEditor(state, oldPlacement, { editable: false });
  state = ownerState.creatorOwnerReducer(state, { type: 'update-link-draft', value: { selectedForDirectory: false } });
  const intent = commands.creatorOwnerWriteIntent('ordinary-shared-options', state.editor);
  const request = commands.prepareCreatorOwnerRequest(intent);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
  const removed = await api(harness, `/api/creador/enlaces/${encodeURIComponent(oldPlacement.placementId)}`, {
    method: 'DELETE', body: { profileVersion: before.profile.version },
  });
  assert.equal(removed.status, 204);
  const failedOptions = await api(harness, request.path, { method: request.method, body: request.body });
  assert.equal(failedOptions.status, 404);
  assert.equal((await responseJson(failedOptions.clone())).error, 'PLACEMENT_NOT_FOUND');
  const optionsOutcome = await commands.interpretCreatorOwnerResponse(failedOptions, intent, before);
  assert.equal(optionsOutcome.kind, 'conflict');
  assert.equal(optionsOutcome.code, 'PLACEMENT_NOT_FOUND');
  if (optionsOutcome.kind !== 'conflict') return;

  const current = await ownerSnapshot(harness);
  assert.deepEqual(current.links, []);
  assert.deepEqual(current.editableResources, [], 'the removed shared reference did not grant metadata authority');
  const currentCatalogEntry = { id: targetResourceId, title: oldPlacement.title, url: movedUrl, tipo: 'content' };
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: intent.id, status: 'conflict',
    code: optionsOutcome.code, message: optionsOutcome.message });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-started' });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [currentCatalogEntry] });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: 'unavailable-candidate-check' });
  const comparison = commands.createCreatorOwnerComparison(intent, current, state.editor);
  assert.equal(comparison.canAdopt, true);
  state = ownerState.creatorOwnerReducer(state, { type: 'check-compared', intentId: intent.id,
    checkId: 'unavailable-candidate-check', comparison });
  assert.equal(state.attempt.status, 'uncertain');
  assert.equal(state.attempt.comparison.id, comparison.id);
  state = ownerState.creatorOwnerReducer(state, { type: 'adopt-comparison', comparisonId: comparison.id });
  assert.equal(state.editor.kind, 'reference');
  assertCandidateIdentity(state.editor.selected, rejectedCandidate);
  assert.equal(state.editor.selected.url, oldPlacement.url, 'same resource ID at a new URL does not rewrite the captured candidate');
  assert.equal(state.editor.selectedForDirectory, false);
  assert.equal(ownerState.creatorOwnerReferenceSubmissionStatus(state, state.editor.selected), 'rejected');
  assert.equal(ownerState.creatorOwnerCanSubmitEditor(state), false);

  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-started' });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-failed', message: 'Catalog temporarily unavailable.' });
  assertCandidateIdentity(state.editor.selected, rejectedCandidate);
  assert.deepEqual(state.catalog.rejectedReferenceSelections, [{ id: rejectedCandidate.id, url: rejectedCandidate.url }]);
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-started' });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [currentCatalogEntry] });
  assertCandidateIdentity(state.editor.selected, rejectedCandidate);
  assert.deepEqual(state.catalog.rejectedReferenceSelections, [{ id: rejectedCandidate.id, url: rejectedCandidate.url }]);
  assert.equal(ownerState.creatorOwnerReferenceSubmissionStatus(state, state.editor.selected), 'rejected');
  assert.equal(ownerState.creatorOwnerCanSubmitEditor(state), false);

  state = ownerState.creatorOwnerReducer(state, { type: 'update-reference-draft', selected: currentCatalogEntry });
  assertCandidateIdentity(state.editor.selected, currentCatalogEntry);
  assert.equal(ownerState.creatorOwnerReferenceSubmissionStatus(state, state.editor.selected), 'ready',
    'the user explicitly chooses the current exact pair after the old pair stays unavailable');
  const manualIntent = commands.creatorOwnerWriteIntent('manual-current-reference', state.editor);
  const manualRequest = commands.prepareCreatorOwnerRequest(manualIntent);
  assert.deepEqual(manualRequest.body, {
    resourceId: targetResourceId, url: movedUrl, profileVersion: current.profile.version, selectedForDirectory: false,
  });
  const manual = await api(harness, manualRequest.path, { method: manualRequest.method, body: manualRequest.body });
  assert.equal(manual.status, 201);
  const after = await ownerSnapshot(harness);
  assert.equal(after.links.length, 1);
  assert.equal(after.links[0].resourceId, targetResourceId);
  assert.equal(after.links[0].url, movedUrl);
  assert.deepEqual(after.editableResources, []);
});

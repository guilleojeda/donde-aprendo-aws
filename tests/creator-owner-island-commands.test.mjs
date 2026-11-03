import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { test } from 'node:test';

async function loadCommands() {
  const { outputFiles } = await build({
    entryPoints: [new URL('../src/lib/creator-owner-commands.ts', import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

async function loadState() {
  const { outputFiles } = await build({
    entryPoints: [new URL('../src/lib/creator-owner-state.ts', import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const commands = await loadCommands();
const ownerState = await loadState();

function editor(description, version = 2) {
  const profile = {
    id: 'profile-1', displayName: 'Creator', slug: 'creator', programs: [], socials: {},
    published: false, hidden: false, version: 4,
  };
  const series = { id: 'series-1', name: 'Ruta inicial', slug: 'ruta-inicial', version, ...(description !== undefined ? { description } : {}) };
  const draft = { name: series.name, slug: series.slug, description: '' };
  return {
    profile,
    series,
    draft,
    editor: { kind: 'series', key: 'series:series-1', baseProfile: profile, baseSeries: series, draft, slugManuallyEdited: true },
    observed: { profile, links: [], editableResources: [], claims: [], series: [series] },
  };
}

test('an explicit empty Series description is sent and its valid receipt is accepted; an omitted unchanged field stays absent', async () => {
  const clearing = editor('Descripción anterior');
  const intent = commands.creatorOwnerWriteIntent('clear-description', clearing.editor);
  const request = commands.prepareCreatorOwnerRequest(intent);
  assert.equal(Object.hasOwn(request.body, 'description'), true);
  assert.equal(request.body.description, '');

  const changes = [
    { entity: 'profile', id: 'profile-1', before: 4, after: 5 },
    { entity: 'series', id: 'series-1', before: 2, after: 3 },
  ];
  const response = new Response(JSON.stringify({
    series: { id: 'series-1', name: 'Ruta inicial', slug: 'ruta-inicial', description: '', version: 3 },
    profileVersion: 5,
    versionChanges: changes,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const outcome = await commands.interpretCreatorOwnerResponse(response, intent, clearing.observed);
  assert.equal(outcome.kind, 'confirmed');
  if (outcome.kind === 'confirmed') {
    assert.equal(outcome.effect.kind, 'series-updated');
    if (outcome.effect.kind === 'series-updated') {
      assert.equal(Object.hasOwn(outcome.effect.series, 'description'), true);
      assert.equal(outcome.effect.series.description, '');
      assert.equal(outcome.effect.profileVersion, 5);
    }
  }

  const absent = editor(undefined, 3);
  const unchangedIntent = commands.creatorOwnerWriteIntent('unchanged-empty-description', absent.editor);
  const unchangedRequest = commands.prepareCreatorOwnerRequest(unchangedIntent);
  assert.equal(Object.hasOwn(unchangedRequest.body, 'description'), false);
  const unchangedResponse = new Response(JSON.stringify({
    series: { id: 'series-1', name: 'Ruta inicial', slug: 'ruta-inicial', version: 3 },
    profileVersion: 4,
    versionChanges: [],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const unchangedOutcome = await commands.interpretCreatorOwnerResponse(unchangedResponse, unchangedIntent, absent.observed);
  assert.equal(unchangedOutcome.kind, 'confirmed');
  if (unchangedOutcome.kind === 'confirmed' && unchangedOutcome.effect.kind === 'series-updated') {
    assert.equal(Object.hasOwn(unchangedOutcome.effect.series, 'description'), false);
    assert.equal(unchangedOutcome.effect.profileVersion, 4);
  }
});

test('a confirmed first-profile receipt installs the profile when the observed DTO was null', () => {
  const initial = ownerState.createCreatorOwnerState({
    data: { profile: null, links: [], editableResources: [], claims: [], series: [] },
    accountEmail: 'creator@example.test', csrfToken: 'csrf', sessionBinding: 'a'.repeat(64), isAdmin: false,
    publicOrigin: 'https://example.test',
    seriesQuery: { buscarSeries: '', paginaSeries: 1, serie: '', buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1 },
  });
  const editor = initial.editor;
  assert.equal(editor?.kind, 'create-profile');
  const intent = commands.creatorOwnerWriteIntent('first-profile', editor);
  const sending = ownerState.creatorOwnerReducer(initial, { type: 'begin-write', intent });
  const profile = {
    id: 'profile-created', displayName: 'Creator', slug: 'creator', programs: [], socials: {},
    published: false, hidden: false, version: 1,
  };
  const confirmed = ownerState.creatorOwnerReducer(sending, {
    type: 'write-confirmed', intentId: intent.id, correction: false,
    effect: { kind: 'profile-updated', profile },
  });
  assert.equal(confirmed.observed.profile?.id, 'profile-created');
  assert.equal(confirmed.observed.profile?.version, 1);
  assert.equal(confirmed.editor, undefined);
});

test('a recovered Series creation adopts the saved fields and keeps only post-send corrections', () => {
  const profile = {
    id: 'profile-1', displayName: 'Creator', slug: 'creator', programs: [], socials: {},
    published: false, hidden: false, version: 4,
  };
  const initial = ownerState.createCreatorOwnerState({
    data: { profile, links: [], editableResources: [], claims: [], series: [] },
    accountEmail: 'creator@example.test', csrfToken: 'csrf', sessionBinding: 'a'.repeat(64), isAdmin: false,
    publicOrigin: 'https://example.test',
    seriesQuery: { buscarSeries: '', paginaSeries: 1, serie: '', buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1 },
  });
  const editor = {
    kind: 'series', key: 'series:new', baseProfile: profile, baseSeries: null,
    draft: { name: 'Sent name', slug: 'sent-slug', description: 'Sent description' }, slugManuallyEdited: true,
  };
  let state = ownerState.creatorOwnerReducer(initial, { type: 'open-editor', editor });
  const sentEditor = state.editor;
  const intent = commands.creatorOwnerWriteIntent('series-create', sentEditor);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
  state = ownerState.creatorOwnerReducer(state, { type: 'update-series-draft', value: { description: 'Correction after send' } });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: intent.id, status: 'uncertain', message: 'Comprobar' });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: 'check-1' });
  const savedSeries = { id: 'series-saved', name: 'Remote name', slug: 'sent-slug', description: 'Remote description', version: 1 };
  const snapshot = { profile: { ...profile, version: 5 }, links: [], editableResources: [], claims: [], series: [savedSeries] };
  const draftAtCompare = state.editor;
  state = ownerState.creatorOwnerReducer(state, {
    type: 'check-compared', intentId: intent.id, checkId: 'check-1',
    comparison: { id: 'series-create:compare', editorKey: editor.key, snapshot, draftAtCompare, seriesId: savedSeries.id,
      canAdopt: true, message: 'Serie guardada.' },
  });
  state = ownerState.creatorOwnerReducer(state, { type: 'adopt-comparison', comparisonId: 'series-create:compare' });
  assert.equal(state.observed.series[0].name, 'Remote name');
  assert.equal(state.editor?.kind, 'series');
  if (state.editor?.kind === 'series') {
    assert.equal(state.editor.baseSeries?.id, 'series-saved');
    assert.equal(state.editor.draft.name, 'Remote name', 'the sent name is the recovered server value, not a new correction');
    assert.equal(state.editor.draft.slug, 'sent-slug');
    assert.equal(state.editor.draft.description, 'Correction after send', 'only a field changed after the original send stays local');
  }
});

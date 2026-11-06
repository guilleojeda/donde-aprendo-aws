import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

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
const ownerCommands = await loadModule('../src/lib/creator-owner-commands.ts');

const profile = {
  id: 'claim-merge-profile', displayName: 'Creator', slug: 'creator', programs: [], socials: {},
  published: false, hidden: false, version: 7,
};
const oldPending = { id: 'claim-a', resourceIds: ['resource-a'], status: 'pending', version: 1, createdAt: 1 };
const currentResolved = { ...oldPending, status: 'resolved', version: 3 };
const anotherClaim = { id: 'claim-b', resourceIds: ['resource-b'], status: 'pending', version: 1, createdAt: 2 };

function initialState(claims = []) {
  return ownerState.createCreatorOwnerState({
    data: { profile, links: [], editableResources: [], claims, series: [] },
    accountEmail: 'creator@example.test', csrfToken: 'csrf', sessionBinding: 'a'.repeat(64), isAdmin: false,
    publicOrigin: 'https://example.test',
    seriesQuery: {
      buscarSeries: '', paginaSeries: 1, serie: '', buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1,
    },
  });
}

function snapshot(claims) {
  return { profile: { ...profile, version: profile.version + 1 }, links: [], editableResources: [], claims, series: [] };
}

function claimEditor() {
  return { kind: 'claim', key: 'claim', baseProfile: profile, selected: [], knownUrls: '', evidence: '' };
}

function comparisonAdoption(state, intent, comparisonSnapshot) {
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: intent.id, status: 'conflict', message: 'Check the saved state.' });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId: 'check-1' });
  state = ownerState.creatorOwnerReducer(state, { type: 'check-compared', intentId: intent.id, checkId: 'check-1', comparison: {
    id: 'comparison-1', editorKey: intent.editorKey, canAdopt: true, message: 'Saved state is available.', snapshot: comparisonSnapshot,
  } });
  return ownerState.creatorOwnerReducer(state, { type: 'adopt-comparison', comparisonId: 'comparison-1' });
}

test('claim history and delayed POST acknowledgements merge by claim version without deleting membership', () => {
  let state = initialState([currentResolved, anotherClaim]);
  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-started', sequence: 1 });
  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-ready', sequence: 1, claims: [oldPending], message: 'History returned.' });
  assert.deepEqual(state.observed.claims, [currentResolved, anotherClaim],
    'an older history result cannot regress status or remove another observed claim');

  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-started', sequence: 2 });
  const newerResolved = { ...currentResolved, version: 4 };
  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-ready', sequence: 2, claims: [newerResolved], message: 'History returned.' });
  assert.deepEqual(state.observed.claims, [newerResolved, anotherClaim],
    'a higher persisted claim version can advance status while retaining the union of membership');

  state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: claimEditor() });
  const intent = ownerCommands.creatorOwnerWriteIntent('late-post', state.editor);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-confirmed', intentId: intent.id, correction: false,
    effect: { kind: 'claim-submitted', profileId: profile.id, claim: oldPending } });
  assert.deepEqual(state.observed.claims, [newerResolved, anotherClaim],
    'a delivered creation acknowledgement cannot replace a newer observed resolution');
});

test('the validated private POST receipt retains its claim version and is owner-scoped', async () => {
  const editor = { ...claimEditor(), knownUrls: 'https://example.test/requested' };
  const intent = ownerCommands.creatorOwnerWriteIntent('claim-post', editor);
  const response = (version) => new Response(JSON.stringify({
    claim: { id: 'claim-receipt', resourceIds: ['resource-receipt'], resources: [
      { resourceId: 'resource-receipt', url: 'https://example.test/requested' },
    ], status: 'pending', createdAt: 10, ...(version === undefined ? {} : { version }) },
    versionChanges: [],
  }), { status: 202, headers: { 'content-type': 'application/json' } });
  const receipt = await ownerCommands.interpretCreatorOwnerResponse(response(1), intent,
  { profile, links: [], editableResources: [], claims: [], series: [] });
  assert.equal(receipt.kind, 'confirmed');
  assert.equal(receipt.effect.profileId, profile.id);
  assert.equal(receipt.effect.claim.version, 1);
  const incompatibleVersion = await ownerCommands.interpretCreatorOwnerResponse(response(2), intent,
    { profile, links: [], editableResources: [], claims: [], series: [] });
  assert.equal(incompatibleVersion.kind, 'uncertain', 'a new-record receipt cannot claim a later stored version');
  const legacyReceipt = await ownerCommands.interpretCreatorOwnerResponse(response(undefined), intent,
    { profile, links: [], editableResources: [], claims: [], series: [] });
  assert.equal(legacyReceipt.kind, 'confirmed', 'older private API consumers may omit the new optional version');
});

test('authoritative owner snapshots for editor, photo, list, and direct adoption use the same claim merge', () => {
  const scenarios = [
    ['direct snapshot', (state) => ownerState.creatorOwnerReducer(state, { type: 'adopt-snapshot', snapshot: snapshot([]) })],
    ['photo recovery', (state) => {
      const editor = { kind: 'photo', key: 'photo', base: profile, file: undefined };
      const intent = ownerCommands.creatorOwnerWriteIntent('photo-check', editor);
      state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor });
      state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
      return ownerState.creatorOwnerReducer(state, { type: 'photo-check-complete', intentId: intent.id,
        snapshot: snapshot([oldPending]), uploaded: false });
    }],
    ['list recovery', (state) => {
      const editor = { kind: 'list-command', key: 'publish', operation: 'publish', baseProfile: profile };
      const intent = ownerCommands.creatorOwnerWriteIntent('publish-check', editor);
      return comparisonAdoption(state, intent, snapshot([oldPending]));
    }],
    ['editor recovery', (state) => {
      const editor = { kind: 'profile', key: 'profile:datos', section: 'datos', base: profile,
        draft: { displayName: 'Creator', slug: 'creator', city: '', country: '', programs: [], bio: '' } };
      const intent = ownerCommands.creatorOwnerWriteIntent('profile-check', editor);
      state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor });
      return comparisonAdoption(state, intent, snapshot([oldPending]));
    }],
  ];

  for (const [label, adopt] of scenarios) {
    const state = adopt(initialState([currentResolved, anotherClaim]));
    assert.deepEqual(state.observed.claims, [currentResolved, anotherClaim],
      `${label} cannot replace a newer status or remove claim membership`);
  }
});

test('claim history accepts legacy rows but never replaces a known versionless observation', () => {
  const legacyPending = { id: 'claim-legacy', resourceIds: ['resource-legacy'], status: 'pending' };
  const state = initialState([legacyPending]);
  const started = ownerState.creatorOwnerReducer(state, { type: 'claim-history-started', sequence: 1 });
  const returned = ownerState.creatorOwnerReducer(started, { type: 'claim-history-ready', sequence: 1,
    claims: [{ ...legacyPending, status: 'resolved' }], message: 'History returned.' });
  assert.deepEqual(returned.observed.claims, [legacyPending],
    'when legacy rows contain no ordering version, keep the already observed value conservatively');
});

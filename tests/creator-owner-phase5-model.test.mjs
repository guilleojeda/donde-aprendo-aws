import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadModule(path) {
  const { outputFiles } = await build({
    entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, format: 'esm', platform: 'node', write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const catalog = await loadModule('../src/lib/creator-owner-catalog.ts');
const ownerState = await loadModule('../src/lib/creator-owner-state.ts');
const ownerCommands = await loadModule('../src/lib/creator-owner-commands.ts');
const ownerLinks = await loadModule('../src/lib/creator-owner-links.ts');
const ownerSeries = await loadModule('../src/lib/creator-owner-series.ts');

const profile = {
  id: 'profile-1', displayName: 'Creator', slug: 'creator', programs: [], socials: {},
  published: false, hidden: false, version: 1,
};

const resource = { id: 'resource-own', title: 'Contenido propio', url: 'https://example.test/own', version: 1 };
const link = {
  placementId: 'placement-own', resourceId: resource.id, title: resource.title, url: resource.url,
  featured: false, position: 0, selectedForDirectory: true, hidden: false, directoryApproval: 'pending',
  resourceVersion: 1, placementVersion: 1, series: [],
};

function initialState() {
  return ownerState.createCreatorOwnerState({
    data: { profile, links: [link], editableResources: [resource], claims: [], series: [] },
    accountEmail: 'creator@example.test', csrfToken: 'csrf', sessionBinding: 'a'.repeat(64), isAdmin: false,
    publicOrigin: 'https://example.test', view: 'enlaces', linksQuery: ownerLinks.DEFAULT_CREATOR_OWNER_LINKS_QUERY,
    seriesQuery: ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
  });
}

test('catalog selection rejects malformed types and IDs over the 256-byte resource limit', () => {
  const valid = { id: 'catalog-one', title: 'Curso', url: 'https://example.test/course', tipo: 'content' };
  assert.deepEqual(catalog.parseCreatorOwnerCatalog([valid]), [valid]);
  assert.equal(catalog.parseCreatorOwnerCatalog([{ ...valid, tipo: ['content'] }]), undefined);
  assert.equal(catalog.parseCreatorOwnerCatalog([{ ...valid, id: 'á'.repeat(129) }]), undefined);
  assert.equal(catalog.parseCreatorOwnerCatalog([{ ...valid, id: 'a'.repeat(256) }])?.[0]?.id.length, 256);
});

test('a resource-conflicted reference needs a fresh catalog reselect before a manual request', () => {
  let state = initialState();
  const previous = { id: 'catalog-resource', title: 'Ficha', url: 'https://example.test/old', tipo: 'content' };
  const current = { ...previous, title: 'Ficha actualizada', url: 'https://example.test/current' };
  state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
    kind: 'reference', key: 'reference', baseProfile: profile, selected: previous, selectedForDirectory: true,
  } });
  const originalBase = state.editor.baseProfile;
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [previous] });
  const originalIntent = ownerCommands.creatorOwnerWriteIntent('reference-original', state.editor);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent: originalIntent });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-uncertain', intentId: originalIntent.id, status: 'conflict',
    code: 'RESOURCE_CONFLICT', message: 'Actualiza el catálogo y vuelve a seleccionar.' });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-require-refresh', message: 'Actualiza el catálogo.' });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-started' });
  state = ownerState.creatorOwnerReducer(state, { type: 'catalog-load-ready', entries: [current] });

  assert.equal(state.attempt.status, 'conflict', 'refreshing the index does not replay or clear the failed write');
  assert.equal(state.editor.selected, undefined, 'the refreshed candidate must be explicitly reselected');
  state = ownerState.creatorOwnerReducer(state, { type: 'update-reference-draft', selected: current });
  assert.equal(state.attempt.status, 'idle', 'a current explicit selection retires the resource conflict');
  assert.equal(state.editor.baseProfile, originalBase, 'the failed attempt keeps the original observed profile base');
  assert.equal(state.editor.selected.url, current.url);

  const manualIntent = ownerCommands.creatorOwnerWriteIntent('reference-manual', state.editor);
  const request = ownerCommands.prepareCreatorOwnerRequest(manualIntent);
  assert.deepEqual(request.body, { resourceId: current.id, url: current.url, profileVersion: profile.version, selectedForDirectory: true });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent: manualIntent });
  assert.equal(state.attempt.status, 'sending', 'only the explicit second submission begins a new request');
  assert.equal(state.attempt.intent.id, 'reference-manual');
});

test('all phase 5 owner commands use Astro’s trailing-slash API paths', () => {
  const placementEditor = { kind: 'link-placement', key: `link:${link.placementId}`, baseProfile: profile,
    baseLink: link, editable: true, draft: { title: link.title, url: link.url, description: '', featured: false, selectedForDirectory: true } };
  const resourceEditor = { kind: 'link-resource', key: `resource:${resource.id}`, baseResource: resource,
    draft: { title: resource.title, url: resource.url, description: '' } };
  const addEditor = { kind: 'add-link', key: 'add-link', baseProfile: profile,
    draft: { title: 'New', url: 'https://example.test/new', description: '', featured: false, selectedForDirectory: true } };
  const moveEditor = { kind: 'move-link', key: 'move-link', baseProfile: profile, baseLink: link,
    baseOrder: [link.placementId], targetPosition: '1' };
  const removeContext = { kind: 'list-command', key: 'remove-link', operation: 'remove-link', baseProfile: profile, basePlacement: link };
  const reincludeContext = { kind: 'list-command', key: 'reinclude-resource', operation: 'reinclude-resource', baseProfile: profile, baseResource: resource };
  const referenceEditor = { kind: 'reference', key: 'reference', baseProfile: profile,
    selected: { id: 'catalog-resource', title: 'Catalog', url: 'https://example.test/catalog', tipo: 'content' }, selectedForDirectory: true };
  const claimEditor = { kind: 'claim', key: 'claim', baseProfile: profile, selected: [], knownUrls: 'https://example.test/known', evidence: '' };
  const paths = [placementEditor, resourceEditor, addEditor, moveEditor, removeContext, reincludeContext, referenceEditor, claimEditor]
    .map((editor, index) => ownerCommands.prepareCreatorOwnerRequest(ownerCommands.creatorOwnerWriteIntent(`route-${index}`, editor)).path);
  assert.deepEqual(paths, [
    `/api/creador/enlaces/${link.placementId}/editar/`, `/api/creador/recursos/${resource.id}/`,
    '/api/creador/enlaces/', `/api/creador/enlaces/${link.placementId}/mover/`,
    `/api/creador/enlaces/${link.placementId}/`, '/api/creador/enlaces/',
    '/api/creador/referencias/', '/api/creador/reclamaciones/',
  ]);
  assert.equal(ownerCommands.prepareCreatorOwnerRequest(ownerCommands.creatorOwnerWriteIntent('versioned-add', addEditor)).body.profileVersion,
    profile.version, 'owner URL Add carries the profile version while legacy callers remain optional server-side');
});

test('removing a placement advances the profile while retaining owned resource authority', () => {
  let state = initialState();
  const context = {
    kind: 'list-command', key: 'remove-placement-own', operation: 'remove-link', baseProfile: profile, basePlacement: link,
  };
  const intent = { id: 'remove-one', editorKey: context.key, kind: 'remove-link', capture: context };
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-confirmed', intentId: intent.id, correction: false,
    effect: { kind: 'link-removed', profileId: profile.id, profileVersion: 2, placementId: link.placementId } });
  assert.equal(state.observed.profile.version, 2);
  assert.deepEqual(state.observed.links, []);
  assert.deepEqual(state.observed.editableResources, [resource]);
});

test('editing a retained resource updates its draft without placing it back on the page', () => {
  let state = ownerState.createCreatorOwnerState({
    data: { profile, links: [], editableResources: [resource], claims: [], series: [] },
    accountEmail: 'creator@example.test', csrfToken: 'csrf', sessionBinding: 'a'.repeat(64), isAdmin: false,
    publicOrigin: 'https://example.test', view: 'enlaces', linksQuery: ownerLinks.DEFAULT_CREATOR_OWNER_LINKS_QUERY,
    seriesQuery: ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
  });
  state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
    kind: 'link-resource', key: `resource:${resource.id}`, baseResource: resource,
    draft: { title: resource.title, url: resource.url, description: '' },
  } });
  state = ownerState.creatorOwnerReducer(state, { type: 'update-link-draft', value: { title: 'Título corregido', url: 'https://example.test/corrected' } });
  assert.deepEqual(state.editor.draft, { title: 'Título corregido', url: 'https://example.test/corrected', description: '' });
  assert.equal(ownerState.creatorOwnerDraftIsDirty(state.editor), true);
  assert.deepEqual(state.observed.links, []);
  assert.deepEqual(state.observed.editableResources, [resource]);
});

test('moving a link accepts newer resource metadata but applies only position and placement versions', async () => {
  const links = [
    link,
    { ...link, placementId: 'placement-two', resourceId: 'resource-two', title: 'Segundo', url: 'https://example.test/two', position: 1 },
    { ...link, placementId: 'placement-three', resourceId: 'resource-three', title: 'Tercero', url: 'https://example.test/three', position: 2 },
  ];
  const resources = links.map(({ resourceId, title, url, resourceVersion }) => ({ id: resourceId, title, url, version: resourceVersion }));
  const observed = { profile, links, editableResources: resources, claims: [], series: [] };
  const editor = { kind: 'move-link', key: `move-link:${link.placementId}`, baseProfile: profile, baseLink: links[0],
    baseOrder: links.map(({ placementId }) => placementId), targetPosition: '3' };
  const intent = ownerCommands.creatorOwnerWriteIntent('move-with-resource-update', editor);
  const moved = [
    { ...links[1], position: 0, placementVersion: 2 },
    { ...links[2], position: 1, placementVersion: 2 },
    { ...links[0], title: 'Título externo', url: 'https://example.test/updated', description: 'Descripción externa', resourceVersion: 2,
      hidden: true, directoryApproval: 'approved', position: 2, placementVersion: 2 },
  ];
  const response = await ownerCommands.interpretCreatorOwnerResponse(new Response(JSON.stringify({ links: moved, versionChanges: [
    { entity: 'profile', id: profile.id, before: 1, after: 2 },
    ...links.map(({ placementId }) => ({ entity: 'placement', id: placementId, before: 1, after: 2 })),
  ] }), { status: 200, headers: { 'content-type': 'application/json' } }), intent, observed);
  assert.equal(response.kind, 'confirmed');
  assert.equal(response.effect.kind, 'link-moved');

  let state = ownerState.createCreatorOwnerState({
    data: observed, accountEmail: 'creator@example.test', csrfToken: 'csrf', sessionBinding: 'a'.repeat(64), isAdmin: false,
    publicOrigin: 'https://example.test', view: 'enlaces', linksQuery: ownerLinks.DEFAULT_CREATOR_OWNER_LINKS_QUERY,
    seriesQuery: ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
  });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-confirmed', intentId: intent.id, correction: false, effect: response.effect });
  const saved = state.observed.links.find(({ placementId }) => placementId === link.placementId);
  assert.equal(saved.position, 2);
  assert.equal(saved.placementVersion, 2);
  assert.equal(saved.title, link.title);
  assert.equal(saved.url, link.url);
  assert.equal(saved.resourceVersion, link.resourceVersion);
  assert.equal(saved.hidden, link.hidden);
  assert.equal(saved.directoryApproval, link.directoryApproval);
  assert.deepEqual(state.observed.editableResources, resources, 'the move does not adopt the newer resource projection');
});

test('a canonical link move may return only the target placement changed by the planner', async () => {
  const neighbor = { ...link, placementId: 'placement-neighbor', resourceId: 'resource-neighbor', title: 'Vecino',
    url: 'https://example.test/neighbor', position: 1 };
  const observed = { profile, links: [link, neighbor], editableResources: [resource,
    { id: neighbor.resourceId, title: neighbor.title, url: neighbor.url, version: neighbor.resourceVersion }], claims: [], series: [] };
  const editor = { kind: 'move-link', key: `move-link:${link.placementId}`, baseProfile: profile, baseLink: link,
    baseOrder: [link.placementId, neighbor.placementId], targetPosition: '2' };
  const intent = ownerCommands.creatorOwnerWriteIntent('partial-move-response', editor);
  const movedTarget = { ...link, title: 'Título externo v2', url: 'https://example.test/resource-v2', description: 'Descripción externa v2',
    resourceVersion: 2, hidden: true, directoryApproval: 'approved', position: 2, placementVersion: 2 };
  const response = await ownerCommands.interpretCreatorOwnerResponse(new Response(JSON.stringify({ links: [movedTarget], versionChanges: [
    { entity: 'profile', id: profile.id, before: 1, after: 2 },
    { entity: 'placement', id: link.placementId, before: 1, after: 2 },
  ] }), { status: 200, headers: { 'content-type': 'application/json' } }), intent, observed);
  assert.equal(response.kind, 'confirmed', 'the service DTO contains only the target and its actual receipt participant');
  assert.deepEqual(response.effect.changes, [{ placementId: link.placementId, position: 2, placementVersion: 2 }]);

  let state = ownerState.createCreatorOwnerState({ data: observed, accountEmail: 'creator@example.test', csrfToken: 'csrf',
    sessionBinding: 'a'.repeat(64), isAdmin: false, publicOrigin: 'https://example.test', view: 'enlaces',
    linksQuery: ownerLinks.DEFAULT_CREATOR_OWNER_LINKS_QUERY, seriesQuery: ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY });
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-confirmed', intentId: intent.id, correction: false, effect: response.effect });
  const savedTarget = state.observed.links.find(({ placementId }) => placementId === link.placementId);
  const savedNeighbor = state.observed.links.find(({ placementId }) => placementId === neighbor.placementId);
  assert.equal(savedTarget.position, 2);
  assert.equal(savedTarget.placementVersion, 2);
  assert.equal(savedTarget.title, link.title);
  assert.equal(savedTarget.url, link.url);
  assert.equal(savedTarget.resourceVersion, link.resourceVersion);
  assert.equal(savedTarget.hidden, link.hidden);
  assert.equal(savedTarget.directoryApproval, link.directoryApproval);
  assert.equal(savedNeighbor.position, neighbor.position);
  assert.equal(savedNeighbor.placementVersion, neighbor.placementVersion);
});

test('a saved link that leaves the active search keeps the query and returns focus to search', () => {
  const filteredLink = { ...link, title: 'CASO-FILTRO título anterior' };
  const query = { ...ownerLinks.DEFAULT_CREATOR_OWNER_LINKS_QUERY, buscar: 'CASO-FILTRO', orden: 'titulo-desc' };
  let state = ownerState.createCreatorOwnerState({
    data: { profile, links: [filteredLink], editableResources: [resource], claims: [], series: [] },
    accountEmail: 'creator@example.test', csrfToken: 'csrf', sessionBinding: 'a'.repeat(64), isAdmin: false,
    publicOrigin: 'https://example.test', view: 'enlaces', linksQuery: query,
    seriesQuery: ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
  });
  const editor = { kind: 'link-placement', key: `link:${filteredLink.placementId}`, baseProfile: profile, baseLink: filteredLink, editable: true,
    draft: { title: filteredLink.title, url: filteredLink.url, description: '', featured: filteredLink.featured, selectedForDirectory: filteredLink.selectedForDirectory } };
  state = ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor });
  const intent = ownerCommands.creatorOwnerWriteIntent('filtered-link-edit', editor);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-confirmed', intentId: intent.id, correction: false,
    effect: { kind: 'link-updated', profileId: profile.id, profileVersion: 2,
      link: { ...filteredLink, title: 'Título que sale del filtro', resourceVersion: 2 },
      resource: { ...resource, title: 'Título que sale del filtro', version: 2 } } });

  assert.match(state.message.text, /ya no coincide con la búsqueda o los filtros actuales/u);
  assert.deepEqual(state.location.linksQuery, query);
  assert.deepEqual(state.location.pendingLinksQuery, query);
  assert.equal(state.location.focusAfterRender, '#owner-link-search');
  assert.equal(state.observed.links[0].title, 'Título que sale del filtro');
});

test('claim-history refresh changes only claims and leaves observed edit versions untouched', () => {
  let state = initialState();
  const originalProfile = state.observed.profile;
  const originalLinks = state.observed.links;
  const originalResources = state.observed.editableResources;
  const claim = { id: 'claim-1', resourceIds: ['resource-shared'], status: 'pending', createdAt: 1 };
  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-started', sequence: 1 });
  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-ready', sequence: 1, claims: [claim], message: 'Solicitudes actualizadas.' });
  assert.deepEqual(state.observed.claims, [claim]);
  assert.strictEqual(state.observed.profile, originalProfile);
  assert.strictEqual(state.observed.links, originalLinks);
  assert.strictEqual(state.observed.editableResources, originalResources);
});

test('a confirmed bound write clears only superseded session-derived history feedback', () => {
  let state = initialState();
  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-started', sequence: 1 });
  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-failed', sequence: 1,
    message: 'Esta cuenta está desactivada. Conservamos tus cambios.', sessionDerived: true });
  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-session-cleared', sequence: 1 });
  assert.equal(state.claimHistory.status, 'idle');
  assert.equal(state.claimHistory.message, undefined);

  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-started', sequence: 2 });
  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-failed', sequence: 2,
    message: 'No pudimos leer Solicitudes. Puedes volver a intentarlo.' });
  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-session-cleared', sequence: 2 });
  assert.equal(state.claimHistory.status, 'error');
  assert.equal(state.claimHistory.message, 'No pudimos leer Solicitudes. Puedes volver a intentarlo.');
});

test('a stale claims GET keeps a claim accepted after that read started and leaves its attempt untouched', () => {
  let state = initialState();
  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-started', sequence: 1 });
  const intent = { id: 'manual-retry', editorKey: 'claim', kind: 'claim', capture: {
    kind: 'claim', key: 'claim', baseProfile: profile, selected: [], knownUrls: 'https://example.test/shared', evidence: '',
  } };
  const claim = { id: 'claim-after-read', resourceIds: ['resource-shared'], resources: [{ resourceId: 'resource-shared', url: 'https://example.test/shared' }], status: 'pending', createdAt: 2 };
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
  state = ownerState.creatorOwnerReducer(state, { type: 'write-confirmed', intentId: intent.id, correction: false,
    effect: { kind: 'claim-submitted', profileId: profile.id, claim } });
  const profileAtNewClaim = state.observed.profile;
  const linksAtNewClaim = state.observed.links;
  const resourcesAtNewClaim = state.observed.editableResources;
  const confirmedAttempt = state.attempt;
  state = ownerState.creatorOwnerReducer(state, { type: 'claim-history-ready', sequence: 1, claims: [], message: 'Solicitudes comprobadas.' });
  assert.deepEqual(state.observed.claims, [claim], 'the reducer merges records added after the read began');
  assert.strictEqual(state.attempt, confirmedAttempt, 'the history completion does not replace the newer attempt');
  assert.strictEqual(state.observed.profile, profileAtNewClaim);
  assert.strictEqual(state.observed.links, linksAtNewClaim);
  assert.strictEqual(state.observed.editableResources, resourcesAtNewClaim);
});

test('claim receipts must cover every distinct requested URL while allowing selected-pair URL deduplication', async () => {
  const firstUrl = 'https://example.test/first';
  const secondUrl = 'https://example.test/second';
  const claimEditor = { kind: 'claim', key: 'claim', baseProfile: profile, selected: [], knownUrls: `${firstUrl}\n${secondUrl}`, evidence: '' };
  const intent = ownerCommands.creatorOwnerWriteIntent('claim-incomplete', claimEditor);
  const incomplete = await ownerCommands.interpretCreatorOwnerResponse(new Response(JSON.stringify({
    claim: { id: 'claim-1', resourceIds: ['resolved-first'], resources: [{ resourceId: 'resolved-first', url: firstUrl }], status: 'pending', createdAt: 1 },
    versionChanges: [],
  }), { status: 202, headers: { 'content-type': 'application/json' } }), intent, { profile, links: [], editableResources: [], claims: [], series: [] });
  assert.equal(incomplete.kind, 'uncertain', 'a 202 that omits a submitted URL keeps the attempt recoverable');

  const dedupEditor = { ...claimEditor, selected: [{ resourceId: 'catalog-one', url: firstUrl, title: 'Catálogo' }], knownUrls: firstUrl };
  const dedupIntent = ownerCommands.creatorOwnerWriteIntent('claim-deduplicated', dedupEditor);
  const deduplicated = await ownerCommands.interpretCreatorOwnerResponse(new Response(JSON.stringify({
    claim: { id: 'claim-2', resourceIds: ['catalog-one'], resources: [{ resourceId: 'catalog-one', url: firstUrl }], status: 'pending', createdAt: 2 },
    versionChanges: [],
  }), { status: 202, headers: { 'content-type': 'application/json' } }), dedupIntent, { profile, links: [], editableResources: [], claims: [], series: [] });
  assert.equal(deduplicated.kind, 'confirmed', 'the same URL submitted as an exact selected pair and a known URL is valid after service deduplication');
});

test('a shared placement command contains only owner options, and its receipt cannot grant resource editing', async () => {
  const sharedLink = { ...link, resourceId: 'resource-shared', title: 'Ficha compartida', url: 'https://example.test/shared', resourceVersion: 7 };
  const observed = { profile, links: [sharedLink], editableResources: [], claims: [], series: [] };
  const editor = { kind: 'link-placement', key: `link:${sharedLink.placementId}`, baseProfile: profile, baseLink: sharedLink,
    editable: false, draft: { title: 'No enviar', url: 'https://example.test/unauthorized', description: 'No enviar', featured: true, selectedForDirectory: false } };
  const intent = ownerCommands.creatorOwnerWriteIntent('shared-options', editor);
  const request = ownerCommands.prepareCreatorOwnerRequest(intent);
  assert.deepEqual(Object.keys(request.body).sort(), ['featured', 'placementVersion', 'profileVersion', 'resourceVersion', 'selectedForDirectory']);
  assert.equal(request.body.featured, true);
  assert.equal(request.body.selectedForDirectory, false);

  const nextLink = { ...sharedLink, featured: true, selectedForDirectory: false, placementVersion: 2 };
  const response = new Response(JSON.stringify({ link: nextLink, versionChanges: [
    { entity: 'profile', id: profile.id, before: 1, after: 2 },
    { entity: 'placement', id: sharedLink.placementId, before: 1, after: 2 },
  ] }), { status: 200, headers: { 'content-type': 'application/json' } });
  const result = await ownerCommands.interpretCreatorOwnerResponse(response, intent, observed);
  assert.equal(result.kind, 'confirmed');
  assert.equal(result.effect.kind, 'link-updated');
  assert.equal(result.effect.resource, undefined);
  assert.equal(result.effect.link.title, 'Ficha compartida');
  assert.equal(result.effect.link.resourceVersion, 7);
});

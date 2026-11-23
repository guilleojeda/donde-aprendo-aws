import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [new URL('../src/lib/creator-owner-state.ts', import.meta.url).pathname],
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const ownerState = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);

const profile = {
  id: 'owner-classification-state', displayName: 'Creadora', slug: 'creadora', city: '', country: '',
  programs: [], bio: '', socials: {}, published: false, hidden: false,
};

function addEditorState() {
  const resource = {
    id: 'resource-classification-state', title: 'Ficha', url: 'https://state.example.invalid/ficha', description: '',
    kind: 'content', format: 'Artículo', topics: [], order: 1, featured: false, published: false, hidden: false,
    approvalRevoked: false, directoryControl: 'creator', editorProfileId: profile.id, version: 1,
    createdAt: 1, updatedAt: 1, classification: { state: 'absent' }, classificationEditable: true,
  };
  let state = ownerState.createCreatorOwnerState({
    data: {
      schemaVersion: 3, creatorVersion: 1, profile, resources: [resource],
      placements: {}, order: { featured: [], ordinary: [] }, series: {}, claims: [],
    },
    accountEmail: 'owner@example.invalid', csrfToken: 'csrf', sessionBinding: 'a'.repeat(64),
    isAdmin: false, publicOrigin: 'https://example.invalid',
    seriesQuery: { buscarSeries: '', paginaSeries: 1, serie: '', buscarCapitulos: '', pertenencia: 'todos', paginaCapitulos: 1 },
    view: 'enlaces',
  });
  return ownerState.creatorOwnerReducer(state, { type: 'open-editor', editor: {
    kind: 'add-link', key: 'add-link',
    draft: { title: 'Borrador', url: 'https://state.example.invalid/borrador', description: '', featured: false,
      selectedForDirectory: true, kind: '', format: '', topics: [] }, touchedFields: [],
  } });
}

function withFieldErrors(state, fieldErrors) {
  return { ...state, editorFeedback: { editorKey: 'add-link', fieldErrors } };
}

test('classification input clears only diagnostics for its changed dependency', () => {
  let state = withFieldErrors(addEditorState(), { 'kind-format': 'pair', topics: 'topics' });
  state = ownerState.creatorOwnerReducer(state, { type: 'update-add-link-draft', value: { kind: 'content', format: 'Artículo' } });
  assert.deepEqual(state.editorFeedback.fieldErrors, { topics: 'topics' });

  state = withFieldErrors(addEditorState(), { 'kind-format': 'pair', topics: 'topics' });
  state = ownerState.creatorOwnerReducer(state, { type: 'update-add-link-draft', value: { topics: ['Seguridad'] } });
  assert.deepEqual(state.editorFeedback.fieldErrors, { 'kind-format': 'pair' });
});

test('a late pair diagnosis remains visible when a later topic correction arrives', () => {
  let state = addEditorState();
  state = ownerState.creatorOwnerReducer(state, {
    type: 'editor-field-rejected', editorKey: 'add-link', field: 'kind-format', message: 'Elige un tipo y formato compatibles.',
  });
  state = ownerState.creatorOwnerReducer(state, { type: 'update-add-link-draft', value: { topics: ['Seguridad'] } });
  assert.deepEqual(state.editorFeedback.fieldErrors, { 'kind-format': 'Elige un tipo y formato compatibles.' });
});

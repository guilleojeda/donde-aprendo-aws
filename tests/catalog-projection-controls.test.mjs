import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCreatorRows, projectPublishedCatalog } from '../src/lib/catalog.mjs';

const record = (overrides = {}) => ({
  id: 'resource-control', title: 'Guía', url: 'https://example.test/guia?lang=es',
  description: 'Descripción', category: 'Artículo', order: 1, featured: false,
  kind: 'content', format: 'Artículo', topics: [], published: true,
  ...overrides,
});

test('approval revocation and hidden controls fail closed without entering the public projection', () => {
  assert.deepEqual(projectPublishedCatalog([record({ approvalRevoked: true })]), []);
  assert.deepEqual(projectPublishedCatalog([record({ hidden: true })]), []);
  assert.throws(() => projectPublishedCatalog([record({ approvalRevoked: 'true' })]), /revocation flag/);
  assert.throws(() => projectPublishedCatalog([record({ hidden: 1 })]), /hidden flag/);
});

test('private resource and creator control fields never enter the public DTO', () => {
  const item = record({ directoryControl: 'editorial', editorProfileId: 'private-profile', approvalRevoked: false });
  const result = projectPublishedCatalog([item]);
  assert.equal(result.length, 1);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('directoryControl'), false);
  assert.equal(serialized.includes('editorProfileId'), false);
  assert.equal(serialized.includes('approvalRevoked'), false);
});

const aggregate = (overrides = {}) => ({
  pk: 'PROFILE#profile-a', sk: 'META', recordType: 'creatorState', schemaVersion: 2,
  id: 'profile-a', version: 1, displayName: 'Creator A', slug: 'creator-a', published: true, hidden: false,
  placements: { placement1: { resourceId: 'resource-a', selectedForDirectory: true } },
  order: { featured: [], ordinary: ['placement1'] }, series: {},
  ...overrides,
});

test('legacy placement rows are ignored and malformed v2 selection cannot use legacy fields', () => {
  assert.deepEqual(normalizeCreatorRows([{
    pk: 'PROFILE#profile-a', sk: 'PLACEMENT#placement1', recordType: 'placement',
    id: 'placement1', profileId: 'profile-a', resourceId: 'resource-a', selectedForDirectory: true,
  }]), { creators: [] });
  assert.throws(() => normalizeCreatorRows([{
    ...aggregate({ placements: { placement1: {
      resourceId: 'resource-a', selectedForDirectory: null, selected: true,
    } } }),
  }]), /creator state placement is malformed/);
});

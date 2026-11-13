import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { test } from 'node:test';

async function loadBundledModule(path) {
  const { outputFiles } = await build({
    entryPoints: [new URL(path, import.meta.url).pathname],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const ownerData = await loadBundledModule('../src/lib/creator-owner-data.ts');
const sessionResponse = await loadBundledModule('../src/lib/creator-session-response.ts');

function ownerSnapshot(overrides = {}) {
  const profile = {
    id: 'profile-1', displayName: 'Creator', slug: 'creator', programs: ['Heroes'], socials: { x: 'https://x.example/creator' },
    published: false, hidden: false, version: 3,
  };
  const link = {
    placementId: 'placement-1', resourceId: 'resource-1', title: 'Resource', url: 'https://resource.example',
    featured: false, position: 0, selectedForDirectory: true, hidden: false, directoryApproval: 'approved',
    resourceVersion: 2, placementVersion: 0, series: [],
  };
  return {
    profile,
    links: [link],
    editableResources: [{ id: link.resourceId, title: link.title, url: link.url, version: link.resourceVersion }],
    claims: [],
    series: [],
    ...overrides,
  };
}

test('the SSR decoder preserves its normalization while strict adoption rejects the raw malformed shape', () => {
  const raw = ownerSnapshot({
    profile: {
      id: 'profile-1', displayName: 'Creator', slug: 'creator', city: null,
      programs: ['Heroes', 'not-a-program'], socials: { x: 'https://x.example/creator', unexpected: 'value', website: 3 },
      photo: { version: 'upload-1', url: 42 }, published: false, hidden: false, version: -2,
    },
    links: [{
      placementId: 'placement-1', resourceId: 'resource-1', title: 'Resource', url: 'https://resource.example',
      featured: false, position: 0, selectedForDirectory: true, hidden: false,
      resourceVersion: 2, placementVersion: 0,
    }],
    editableResources: [{ id: 'resource-1', title: 'Resource', url: 'https://resource.example', version: 2 }],
    claims: [{ claimId: 'claim-1', resourceIds: ['resource-1'], sourceId: 4, createdAt: Infinity, evidence: 1 }],
    series: undefined,
  });

  assert.equal(ownerData.isCreatorOwnerSnapshot(raw), false);
  const decoded = ownerData.readCreatorEditorData(raw);
  assert.deepEqual(decoded.profile.programs, ['Heroes']);
  assert.deepEqual(decoded.profile.socials, { x: 'https://x.example/creator' });
  assert.equal(Object.hasOwn(decoded.profile, 'city'), false);
  assert.deepEqual(decoded.profile.photo, { version: 'upload-1' });
  assert.equal(decoded.links[0].directoryApproval, 'pending');
  assert.equal(Object.hasOwn(decoded.links[0], 'placementVersion'), true);
  assert.deepEqual(decoded.claims[0], { id: 'claim-1', resourceIds: ['resource-1'] });
  assert.deepEqual(decoded.series, []);
  assert.equal(ownerData.isCreatorOwnerSnapshot(decoded), false, 'negative versions remain rejected after projection');
});

test('the owner decoder rejects disagreeing placed and editable resource projections', () => {
  const contradictions = [
    ['version', (editable) => { editable.version += 1; }],
    ['title', (editable) => { editable.title = 'Different title'; }],
    ['description presence', (editable) => { editable.description = 'Unexpected description'; }],
  ];
  for (const [label, change] of contradictions) {
    const value = ownerSnapshot();
    change(value.editableResources[0]);
    assert.equal(ownerData.isCreatorOwnerSnapshot(value), false, `${label} mismatch is not an owner snapshot`);
    assert.throws(() => ownerData.readCreatorEditorData(value), /proyecciones del contenido/i, label);
  }
});

test('strict owner snapshots require coherent unique entities and support a null-profile snapshot', () => {
  const valid = ownerSnapshot();
  assert.equal(ownerData.isCreatorOwnerSnapshot(valid), true);
  assert.equal(ownerData.isAdoptableOwnerData(valid), true);

  const duplicatePlacement = ownerSnapshot();
  duplicatePlacement.links.push({ ...duplicatePlacement.links[0], resourceId: 'resource-2' });
  assert.equal(ownerData.isCreatorOwnerSnapshot(duplicatePlacement), false);

  const duplicateSeries = ownerSnapshot({ series: [
    { id: 'series-1', name: 'One', slug: 'one', version: 1 },
    { id: 'series-1', name: 'Two', slug: 'two', version: 1 },
  ] });
  assert.equal(ownerData.isCreatorOwnerSnapshot(duplicateSeries), false);

  const malformedVersion = ownerSnapshot();
  malformedVersion.editableResources[0].version = Number.MAX_SAFE_INTEGER + 1;
  assert.equal(ownerData.isCreatorOwnerSnapshot(malformedVersion), false);

  const noProfile = { profile: null, links: [], editableResources: [], claims: [], series: [] };
  assert.equal(ownerData.isCreatorOwnerSnapshot(noProfile), true);
  assert.equal(ownerData.isAdoptableOwnerData(noProfile), false);
  assert.equal(ownerData.isOwnerData(noProfile), true);
});

test('claim versions are validated when present while legacy versionless claims remain accepted', () => {
  const legacy = ownerSnapshot({ claims: [{ id: 'claim-legacy', resourceIds: ['resource-1'], status: 'pending' }] });
  assert.equal(ownerData.isCreatorOwnerSnapshot(legacy), true);
  assert.deepEqual(ownerData.readCreatorEditorData(legacy).claims, legacy.claims);

  const versioned = ownerSnapshot({ claims: [{ id: 'claim-versioned', resourceIds: ['resource-1'], status: 'resolved', version: 4 }] });
  assert.equal(ownerData.isCreatorOwnerSnapshot(versioned), true);
  assert.deepEqual(ownerData.readCreatorEditorData(versioned).claims, versioned.claims);

  for (const version of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '4']) {
    const malformed = ownerSnapshot({ claims: [{ id: 'claim-malformed', resourceIds: ['resource-1'], version }] });
    assert.equal(ownerData.isCreatorOwnerSnapshot(malformed), false, `reject claim version ${String(version)}`);
    assert.throws(() => ownerData.readCreatorEditorData(malformed), TypeError);
  }
});

test('legacy owner guard stays shallow while strict adoption validates the complete raw shape', () => {
  const raw = ownerSnapshot({
    profile: { ...ownerSnapshot().profile, programs: ['invalid'] },
  });
  assert.equal(ownerData.isOwnerData(raw), true);
  assert.equal(ownerData.isCreatorOwnerSnapshot(raw), false);
  assert.equal(ownerData.isSafeClaimUrl('https://safe.example/path'), true);
  assert.equal(ownerData.isSafeClaimUrl('javascript:alert(1)'), false);
});

test('claim-resource projection retains optional presence and rejects mismatched destinations', () => {
  assert.equal(ownerData.readCreatorClaimResources(undefined, undefined), undefined);
  assert.deepEqual(ownerData.readCreatorClaimResources(
    [{ resourceId: 'resource-1', url: 'https://resource.example' }],
    ['resource-1'],
  ), [{ resourceId: 'resource-1', url: 'https://resource.example' }]);
  assert.throws(() => ownerData.readCreatorClaimResources(
    [{ resourceId: 'resource-2', url: 'https://resource.example' }],
    ['resource-1'],
  ), TypeError);
});

test('session response parsing clones JSON and classifies recovery without changing the token', async () => {
  const response = new Response(JSON.stringify({ csrfToken: ' token ' }), { status: 200 });
  const payload = await sessionResponse.readCreatorSessionResponse(response);
  assert.deepEqual(payload, { csrfToken: ' token ' });
  assert.deepEqual(await response.json(), { csrfToken: ' token ' });
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(200, payload), { state: 'ready', csrfToken: ' token ' });
  assert.equal(sessionResponse.creatorSessionRecoveryReason(401, null), 'expired');
  assert.equal(sessionResponse.creatorSessionRecoveryReason(403, { error: 'CSRF_REJECTED' }), 'csrf');
  assert.equal(sessionResponse.creatorSessionRecoveryReason(403, { error: 'ACCOUNT_DISABLED' }), undefined);
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(409, { error: 'SESSION_CONTEXT_CHANGED' }), { state: 'context-changed' });
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(422, { error: 'INVALID_CONTEXT' }), { state: 'invalid-context' });
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(409, { error: 'PROFILE_CONFLICT' }), { state: 'unavailable' });
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(422, { error: 'INVALID_PHOTO' }), { state: 'unavailable' });
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(403, { error: 'ACCOUNT_DISABLED' }), { state: 'disabled' });
  assert.deepEqual(sessionResponse.classifyCreatorSessionCheck(503, null), { state: 'unavailable' });
});

test('session binding accepts only the exact lowercase hexadecimal contract', () => {
  assert.equal(sessionResponse.isCreatorSessionBinding('a'.repeat(64)), true);
  assert.equal(sessionResponse.isCreatorSessionBinding('A'.repeat(64)), false);
  assert.equal(sessionResponse.isCreatorSessionBinding('a'.repeat(63)), false);
  assert.equal(sessionResponse.isCreatorSessionBinding(null), false);
});

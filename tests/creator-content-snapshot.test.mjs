import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the decoder used by the application, rather than another fixture
// decoder. Native acceptance establishes installation/rendering of these reads.
const { outputFiles } = await build({
  entryPoints: [new URL('../src/lib/creator-owner-data.ts', import.meta.url).pathname],
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'creator-snapshot-contract-'));
let decoder;
try {
  const compiledPath = join(temporaryDirectory, 'owner-data.mjs');
  await writeFile(compiledPath, outputFiles[0].contents);
  decoder = await import(pathToFileURL(compiledPath).href);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
const { readCreatorOwnerSnapshot } = decoder;

function snapshot() {
  return {
    schemaVersion: 3,
    creatorVersion: 17,
    profile: {
      id: 'creator-one', displayName: 'Creadora', slug: 'creadora',
      programs: ['Heroes'], socials: { website: 'https://example.com/creator' },
      published: true, hidden: false,
    },
    resources: [
      { id: 'resource:z', version: 4, title: 'Z', url: 'https://example.com/z', hidden: false, directoryApproval: 'approved', metadataEditable: true, reincludeAllowed: false,
        classification: { state: 'explicit', kind: 'content', format: 'Video', topics: ['Seguridad'] }, classificationEditable: false },
      { id: 'resource:a', version: 0, title: 'A', url: 'https://example.com/a', description: '', hidden: true, directoryApproval: 'pending', metadataEditable: false, reincludeAllowed: false,
        classification: { state: 'absent' }, classificationEditable: true },
      { id: 'retained:only', version: 2, title: 'Retenida', url: 'https://example.com/retained', hidden: false, directoryApproval: 'pending', metadataEditable: true, reincludeAllowed: true,
        classification: { state: 'legacy', kind: 'source', format: 'Blog', topics: [] }, classificationEditable: true },
    ],
    placements: {
      z: { resourceId: 'resource:z', selectedForDirectory: true },
      a: { resourceId: 'resource:a', selectedForDirectory: false },
    },
    order: { featured: [], ordinary: ['z', 'a'] },
    series: {
      first: { name: 'Primera', slug: 'primera', chapters: ['a', 'z'] },
      second: { name: 'Segunda', slug: 'segunda', description: '', chapters: ['z'] },
    },
    claims: [{ id: 'claim-only', resourceIds: ['claim:unplaced'], version: 1, status: 'pending' }],
  };
}

test('the owner decoder preserves one resource collection and independent complete sequences without filling absent fields', () => {
  const raw = snapshot();
  const original = structuredClone(raw);
  const decoded = readCreatorOwnerSnapshot(raw);
  assert.deepEqual(decoded, original);
  assert.deepEqual(raw, original, 'reading does not modify the received observation');
  assert.equal(Object.hasOwn(decoded.resources[0], 'description'), false);
  assert.equal(decoded.resources[1].description, '');
  assert.equal(Object.hasOwn(decoded.series.first, 'description'), false);
  assert.deepEqual(decoded.order.ordinary, ['z', 'a']);
  assert.deepEqual(decoded.series.first.chapters, ['a', 'z']);
  assert.equal(decoded.resources.some(({ id }) => id === 'claim:unplaced'), false,
    'claim history does not create a second resource projection');
});

test('the owner decoder accepts the explicit not-yet-created state without manufacturing a profile or collections', () => {
  const raw = {
    schemaVersion: 3, creatorVersion: null, profile: null, resources: [],
    placements: {}, order: { featured: [], ordinary: [] }, series: {}, claims: [],
  };
  assert.deepEqual(readCreatorOwnerSnapshot(raw), raw);
});

test('the owner decoder accepts only the current v3 wire shape, not v2 or unknown shapes', () => {
  const legacy = snapshot();
  legacy.schemaVersion = 2;
  for (const resource of legacy.resources) {
    delete resource.classification;
    delete resource.classificationEditable;
  }
  assert.throws(() => readCreatorOwnerSnapshot(legacy), TypeError, 'v2 owner snapshots are no longer readable');

  const unknownVersion = snapshot();
  unknownVersion.schemaVersion = 4;
  assert.throws(() => readCreatorOwnerSnapshot(unknownVersion), TypeError,
    'an unknown owner snapshot version is rejected');

  const unknownClassification = snapshot();
  unknownClassification.resources[0].classification = { state: 'future' };
  assert.throws(() => readCreatorOwnerSnapshot(unknownClassification), TypeError,
    'an unknown classification shape is rejected');
});

test('the owner decoder preserves a literal 256-byte UTF-8 resource identity', () => {
  const raw = snapshot();
  const id = 'aws:' + '列'.repeat(84);
  assert.equal(Buffer.byteLength(id, 'utf8'), 256);
  raw.resources[0].id = id;
  raw.placements.z.resourceId = id;
  const decoded = readCreatorOwnerSnapshot(raw);
  assert.equal(decoded.resources[0].id, id);
  assert.equal(decoded.placements.z.resourceId, id);
});

test('the owner decoder accepts a legacy blank social URL without normalizing the observation', () => {
  const raw = snapshot();
  raw.profile.socials.website = '';
  const original = structuredClone(raw);
  const decoded = readCreatorOwnerSnapshot(raw);
  assert.strictEqual(decoded, raw);
  assert.deepEqual(decoded.profile.socials, { website: '' });
  assert.deepEqual(raw, original);
});

const corruptions = [
  ['obsolete schema', (v) => { v.schemaVersion = 1; }],
  ['negative creator revision', (v) => { v.creatorVersion = -1; }],
  ['fractional creator revision', (v) => { v.creatorVersion = 1.5; }],
  ['unsafe creator revision', (v) => { v.creatorVersion = Number.MAX_SAFE_INTEGER + 1; }],
  ['profile without a creator revision', (v) => { v.creatorVersion = null; }],
  ['missing resource collection', (v) => { delete v.resources; }],
  ['duplicate resource identity', (v) => { v.resources.push(structuredClone(v.resources[0])); }],
  ['missing referenced resource', (v) => { v.resources.splice(0, 1); }],
  ['invalid resource revision', (v) => { v.resources[0].version = -1; }],
  ['invalid editability fact', (v) => { v.resources[0].metadataEditable = 'yes'; }],
  ['omitted editability fact', (v) => { delete v.resources[0].metadataEditable; }],
  ['invalid reinclude permission fact', (v) => { v.resources[2].reincludeAllowed = 'yes'; }],
  ['omitted reinclude permission fact', (v) => { delete v.resources[2].reincludeAllowed; }],
  ['reinclude permission on an already placed resource', (v) => { v.resources[0].reincludeAllowed = true; }],
  ['reinclude permission without metadata authority', (v) => { v.resources[2].metadataEditable = false; }],
  ['an unplaced resource without reinclude permission', (v) => { v.resources[2].reincludeAllowed = false; }],
  ['invalid selection fact', (v) => { v.placements.z.selectedForDirectory = 'false'; }],
  ['missing general sequence member', (v) => { v.order.ordinary = ['z']; }],
  ['duplicate within a general sequence', (v) => { v.order.ordinary.push('z'); }],
  ['overlapping general groups', (v) => { v.order.featured = ['z']; }],
  ['unknown general sequence member', (v) => { v.order.ordinary.push('missing'); }],
  ['missing general group', (v) => { delete v.order.featured; }],
  ['unknown chapter', (v) => { v.series.first.chapters.push('missing'); }],
  ['duplicate chapter', (v) => { v.series.first.chapters.push('z'); }],
  ['missing chapter sequence', (v) => { delete v.series.first.chapters; }],
  ['malformed optional description', (v) => { v.resources[0].description = 42; }],
  ['malformed optional location', (v) => { v.profile.city = null; }],
  ['unknown program', (v) => { v.profile.programs.push('Unknown'); }],
  ['a non-string social value', (v) => { v.profile.socials.website = 42; }],
  ['a malformed social URL string', (v) => { v.profile.socials.website = 'not a URL'; }],
  ['malformed claim evidence', (v) => { v.claims[0].evidence = 42; }],
  ['null profile with content', (v) => { v.profile = null; v.creatorVersion = null; }],
];

for (const [name, corrupt] of corruptions) {
  test(`the owner decoder rejects ${name} before it can be dropped or defaulted into apparent success`, () => {
    const raw = snapshot();
    corrupt(raw);
    const malformed = structuredClone(raw);
    assert.throws(() => readCreatorOwnerSnapshot(raw), TypeError);
    assert.deepEqual(raw, malformed);
  });
}

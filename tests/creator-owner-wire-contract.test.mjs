import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const compiled = await build({
  entryPoints: [
    new URL('../src/lib/creator-owner-data.ts', import.meta.url).pathname,
    new URL('../src/lib/creator-owner-series.ts', import.meta.url).pathname,
    new URL('../src/lib/creator-owner-commands.ts', import.meta.url).pathname,
  ],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: 'out',
  outExtension: { '.js': '.mjs' },
  write: false,
});
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'creator-owner-wire-'));
const modules = {};
try {
  for (const output of compiled.outputFiles) {
    const file = join(temporaryDirectory, output.path.split('/').at(-1));
    await writeFile(file, output.contents);
    const name = file.includes('creator-owner-data') ? 'data'
      : file.includes('creator-owner-series') ? 'series' : 'commands';
    modules[name] = await import(pathToFileURL(file).href);
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

const { readCreatorOwnerSnapshot, isCreatorOwnerSnapshot, joinCreatorOwnerPlacements } = modules.data;
const { creatorOwnerChapterOrder } = modules.series;
const {
  CREATOR_CONTRACT_HEADER,
  CREATOR_CONTRACT_VERSION,
  createCreatorOwnerRequest,
  readCreatorOwnerAcknowledgement,
  readCreatorOwnerPhotoAuthorizationAcknowledgement,
  readCreatorOwnerPhotoFinalizeAcknowledgement,
} = modules.commands;

test('owner and photo requests share the approved private contract discriminator', () => {
  assert.equal(CREATOR_CONTRACT_HEADER, 'X-Creator-Contract');
  assert.equal(CREATOR_CONTRACT_VERSION, '2');
});

function snapshot() {
  return {
    schemaVersion: 2,
    creatorVersion: 17,
    profile: {
      id: 'creator-one', displayName: 'Ada', slug: 'ada', programs: ['Heroes'], socials: {},
      published: true, hidden: false,
    },
    resources: [
      { id: 'resource:z', version: 4, title: 'Z', url: 'https://example.test/z', hidden: false,
        directoryApproval: 'approved', metadataEditable: true, reincludeAllowed: false },
      { id: 'resource:a', version: 0, title: 'A', url: 'https://example.test/a', description: '', hidden: true,
        directoryApproval: 'pending', metadataEditable: false, reincludeAllowed: false },
    ],
    placements: {
      z: { resourceId: 'resource:z', selectedForDirectory: true },
      a: { resourceId: 'resource:a', selectedForDirectory: false },
    },
    order: { featured: [], ordinary: ['z', 'a'] },
    series: { first: { name: 'First', slug: 'first', chapters: ['a', 'z'] } },
    claims: [],
  };
}

test('one strict decoder preserves explicit sequences and returns the wire observation unchanged', () => {
  const raw = snapshot();
  assert.strictEqual(readCreatorOwnerSnapshot(raw), raw);
  assert.equal(isCreatorOwnerSnapshot(raw), true);
  const invalid = structuredClone(raw);
  invalid.order.ordinary.pop();
  assert.equal(isCreatorOwnerSnapshot(invalid), false);
  assert.throws(() => readCreatorOwnerSnapshot(invalid), TypeError);
});

test('display joins read one resource projection and preserve independent literal general and chapter order', () => {
  const data = snapshot();
  const joined = joinCreatorOwnerPlacements(data);
  const byId = new Map(joined.map((link) => [link.placementId, link]));
  assert.deepEqual(data.order.ordinary, ['z', 'a']);
  assert.deepEqual(creatorOwnerChapterOrder(data, 'first').map(({ placementId }) => placementId), ['a', 'z']);
  assert.equal(byId.get('z')?.position, 1);
  assert.equal(byId.get('a')?.position, 2);
  assert.equal(byId.get('a')?.hidden, true);
  assert.deepEqual(byId.get('a')?.series, [{ seriesId: 'first', position: 1 }]);
});

test('wire request construction maps operations and carries raw presence without normalization', () => {
  const cases = [
    [{ operation: 'save-profile', profileId: 'creator-one', creatorVersion: 17, fields: { displayName: '  Ada  ', bio: '' } },
      'PUT', '/api/creador/perfil/', { displayName: '  Ada  ', bio: '', creatorVersion: 17 }],
    [{ operation: 'save-profile', profileId: null, creatorVersion: null, fields: { displayName: 'Ada' } },
      'PUT', '/api/creador/perfil/', { displayName: 'Ada', creatorVersion: null }],
    [{ operation: 'publish-profile', profileId: 'creator-one', creatorVersion: 17, fields: {} },
      'POST', '/api/creador/perfil/publicar/', { creatorVersion: 17 }],
    [{ operation: 'add-link', profileId: 'creator-one', creatorVersion: 17, fields: { title: '', url: ' https://example.test ' } },
      'POST', '/api/creador/enlaces/', { title: '', url: ' https://example.test ', creatorVersion: 17 }],
    [{ operation: 'reference-link', profileId: 'creator-one', creatorVersion: 17, target: { resourceId: 'aws:ref' }, fields: { url: 'https://example.test/ref' } },
      'POST', '/api/creador/referencias/', { url: 'https://example.test/ref', creatorVersion: 17, resourceId: 'aws:ref' }],
    [{ operation: 'reinclude-link', profileId: 'creator-one', creatorVersion: 17, target: { resourceId: 'aws:old' }, base: { resourceVersion: 4 }, fields: {} },
      'POST', '/api/creador/enlaces/', { creatorVersion: 17, resourceVersion: 4, resourceId: 'aws:old' }],
    [{ operation: 'edit-link', profileId: 'creator-one', creatorVersion: 17, target: { placementId: 'placement-a' }, fields: { title: 'raw' } },
      'PATCH', '/api/creador/enlaces/placement-a/editar/', { title: 'raw', creatorVersion: 17 }],
    [{ operation: 'set-link-options', profileId: 'creator-one', creatorVersion: 17, target: { placementId: 'placement-a' }, fields: { featured: true } },
      'PATCH', '/api/creador/enlaces/placement-a/', { featured: true, creatorVersion: 17 }],
    [{ operation: 'remove-link', profileId: 'creator-one', creatorVersion: 17, target: { placementId: 'placement-a' }, fields: {} },
      'DELETE', '/api/creador/enlaces/placement-a/', { creatorVersion: 17 }],
    [{ operation: 'move-link', profileId: 'creator-one', creatorVersion: 17, target: { placementId: 'placement-a' }, fields: { destination: 2 } },
      'POST', '/api/creador/enlaces/placement-a/mover/', { destination: 2, creatorVersion: 17 }],
    [{ operation: 'create-series', profileId: 'creator-one', creatorVersion: 17, fields: { name: 'X' } },
      'POST', '/api/creador/series/', { name: 'X', creatorVersion: 17 }],
    [{ operation: 'edit-series', profileId: 'creator-one', creatorVersion: 17, target: { seriesId: 'series-a' }, fields: { description: '' } },
      'PATCH', '/api/creador/series/series-a/', { description: '', creatorVersion: 17 }],
    [{ operation: 'delete-series', profileId: 'creator-one', creatorVersion: 17, target: { seriesId: 'series-a' }, fields: {} },
      'DELETE', '/api/creador/series/series-a/', { creatorVersion: 17 }],
    [{ operation: 'add-chapter', profileId: 'creator-one', creatorVersion: 17, target: { seriesId: 'series-a', placementId: 'placement-a' }, fields: {} },
      'PUT', '/api/creador/series/series-a/capitulos/placement-a/', { creatorVersion: 17 }],
    [{ operation: 'remove-chapter', profileId: 'creator-one', creatorVersion: 17, target: { seriesId: 'series-a', placementId: 'placement-a' }, fields: {} },
      'DELETE', '/api/creador/series/series-a/capitulos/placement-a/', { creatorVersion: 17 }],
    [{ operation: 'move-chapter', profileId: 'creator-one', creatorVersion: 17, target: { seriesId: 'series-a', placementId: 'placement-a' }, fields: { destination: 1 } },
      'POST', '/api/creador/series/series-a/capitulos/placement-a/mover/', { destination: 1, creatorVersion: 17 }],
    [{ operation: 'edit-resource', profileId: 'creator-one', creatorVersion: 17, target: { resourceId: 'aws:resource' }, base: { resourceVersion: 6 }, fields: { title: 'raw' } },
      'PATCH', '/api/creador/recursos/?id=aws%3Aresource', { title: 'raw', resourceVersion: 6 }],
    [{ operation: 'create-claim', profileId: 'creator-one', creatorVersion: null, fields: { resources: [{ resourceId: 'aws:resource', url: 'https://example.test' }] } },
      'POST', '/api/creador/reclamaciones/', { resources: [{ resourceId: 'aws:resource', url: 'https://example.test' }] }],
  ];
  for (const [command, method, path, body] of cases) {
    assert.deepEqual(createCreatorOwnerRequest(command), { method, path, body }, command.operation);
  }
  assert.throws(() => createCreatorOwnerRequest({ operation: 'publish-profile', profileId: 'creator-one', creatorVersion: 17, fields: { creatorVersion: 4 } }), /reemplazar/);
});

test('ack reader accepts a server revision floor without predicting exact increments', async () => {
  const response = Response.json({
    schemaVersion: 2, operation: 'add-link', profileId: 'creator-one', creatorVersion: 30,
    resourceId: 'aws:created', placementId: 'placement-new', resourceVersion: 0,
    disposition: 'resource-created',
  }, { status: 201 });
  const result = await readCreatorOwnerAcknowledgement(response, {
    operation: 'add-link', profileId: 'creator-one', creatorVersion: 17,
  });
  assert.deepEqual(result, {
    kind: 'confirmed', operation: 'add-link', profileId: 'creator-one', disposition: 'resource-created',
    creatorVersionFloor: 30, resourceId: 'aws:created', resourceVersionFloor: 0, placementId: 'placement-new',
  });
});

test('ack reader rejects mismatched context, malformed versions, legacy receipts and extra fields', async () => {
  const base = {
    schemaVersion: 2, operation: 'move-chapter', profileId: 'creator-one', creatorVersion: 18,
    seriesId: 'series-a', placementId: 'placement-a', disposition: 'moved',
  };
  const expected = {
    operation: 'move-chapter', profileId: 'creator-one', creatorVersion: 17,
    target: { seriesId: 'series-a', placementId: 'placement-a' },
  };
  assert.equal((await readCreatorOwnerAcknowledgement(Response.json(base), expected)).kind, 'confirmed');
  for (const mutate of [
    (value) => { value.profileId = 'creator-other'; },
    (value) => { value.operation = 'move-link'; },
    (value) => { value.seriesId = 'series-other'; },
    (value) => { value.placementId = 'placement-other'; },
    (value) => { value.creatorVersion = -1; },
    (value) => { value.creatorVersion = 17.5; },
    (value) => { value.versionChanges = []; },
    (value) => { delete value.creatorVersion; },
  ]) {
    const value = structuredClone(base);
    mutate(value);
    assert.equal((await readCreatorOwnerAcknowledgement(Response.json(value), expected)).kind, 'invalid');
  }
  assert.equal((await readCreatorOwnerAcknowledgement(new Response(null, { status: 204 }), expected)).kind, 'invalid');
  assert.equal((await readCreatorOwnerAcknowledgement(Response.json({
    schemaVersion: 2, operation: 'add-link', profileId: 'creator-one', creatorVersion: 18,
    resourceId: 'aws:created', placementId: 'placement-new', resourceVersion: 1,
    disposition: 'resource-created',
  }, { status: 200 }), { operation: 'add-link', profileId: 'creator-one', creatorVersion: 17 })).kind, 'invalid',
  'an already-present status cannot claim a newly created resource');
});

test('photo acknowledgements validate exact profile, upload and saved-photo identity while retaining historical revision', async () => {
  const authorization = await readCreatorOwnerPhotoAuthorizationAcknowledgement(Response.json({
    schemaVersion: 2,
    operation: 'authorize-photo',
    profileId: 'creator-one',
    uploadId: 'upload-one',
    post: { url: 'https://storage.example.test/upload', fields: { key: 'temporary/object', policy: 'opaque' } },
  }), { profileId: 'creator-one', creatorVersion: 17 });
  assert.deepEqual(authorization, {
    kind: 'confirmed', profileId: 'creator-one', uploadId: 'upload-one',
    post: { url: 'https://storage.example.test/upload', fields: { key: 'temporary/object', policy: 'opaque' } },
  });
  assert.equal((await readCreatorOwnerPhotoAuthorizationAcknowledgement(Response.json({
    schemaVersion: 2, operation: 'authorize-photo', profileId: 'other-profile', uploadId: 'upload-one',
    post: { url: 'https://storage.example.test/upload', fields: { key: 'temporary/object' } },
  }), { profileId: 'creator-one' })).kind, 'invalid');

  const photoUrl = '/media/fotos/creator-one/upload-one.webp';
  const finalized = await readCreatorOwnerPhotoFinalizeAcknowledgement(Response.json({
    schemaVersion: 2, operation: 'finalize-photo', profileId: 'creator-one', uploadId: 'upload-one',
    creatorVersion: 4, photo: { version: 'upload-one', url: photoUrl }, disposition: 'finalized',
  }), { profileId: 'creator-one', uploadId: 'upload-one' });
  assert.deepEqual(finalized, {
    kind: 'confirmed', profileId: 'creator-one', uploadId: 'upload-one', historicalCreatorVersion: 4,
    disposition: 'finalized', photo: { version: 'upload-one', url: photoUrl },
  }, 'a historical completion can report a revision below the current observation');
  assert.equal((await readCreatorOwnerPhotoFinalizeAcknowledgement(Response.json({
    schemaVersion: 2, operation: 'finalize-photo', profileId: 'creator-one', uploadId: 'upload-one',
    creatorVersion: 18, photo: { version: 'upload-other', url: photoUrl }, disposition: 'finalized',
  }), { profileId: 'creator-one', uploadId: 'upload-one' })).kind, 'invalid');
});

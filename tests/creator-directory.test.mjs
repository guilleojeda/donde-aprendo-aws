import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCatalog, projectPublishedCatalog } from '../src/lib/catalog.mjs';
import { fingerprintPublicCatalog } from '../src/lib/publication.mjs';

// These are public directory inputs, not account/session records or DynamoDB keys.
// The optional second argument extends the existing catalog projector; legacy
// callers without creator-controlled resources retain their existing behavior.
const resource = (overrides = {}) => ({
  id: 'resource-a', title: 'Guía de Lambda', url: 'https://example.test/guia?lang=es',
  description: 'Una guía en español', category: 'Artículo', kind: 'content',
  format: 'Artículo', topics: ['Serverless'], order: 1, featured: false,
  published: true, directoryControl: 'creator', ...overrides,
});
const profile = (id, overrides = {}) => ({ id, published: true, hidden: false, ...overrides });
const placement = (profileId, overrides = {}) => ({
  profileId, resourceId: 'resource-a', selected: true, ...overrides,
});
const state = (profiles = [profile('creator-a')], placements = [placement('creator-a')]) => ({ profiles, placements });
const project = (records = [resource()], creatorState = state()) => projectPublishedCatalog(records, creatorState);
const ids = (records) => records.map(({ id }) => id);

test('creator directory requires a selected placement on a published visible profile', () => {
  assert.deepEqual(ids(project()), ['resource-a']);
  assert.deepEqual(project([resource()], state([], [])), []);
  assert.deepEqual(project([resource()], state([profile('creator-a')], [placement('creator-a', { selected: false })])), []);
  assert.deepEqual(project([resource()], state([profile('creator-a', { published: false })])), []);
  assert.deepEqual(project([resource()], state([profile('creator-a', { hidden: true })])), []);
  assert.deepEqual(project([resource()], state([], [placement('missing-profile')])), []);
});

test('approval, resource moderation and creator selection are independent', () => {
  assert.deepEqual(project([resource({ published: false })]), []);
  assert.deepEqual(project([resource({ hidden: true })]), []);
  assert.deepEqual(ids(project([resource({ published: true, hidden: false })])), ['resource-a']);
});

test('one eligible profile sustains one directory entry for a shared resource', () => {
  const profiles = [profile('creator-a', { hidden: true }), profile('creator-b')];
  const placements = [placement('creator-a'), placement('creator-b')];
  assert.deepEqual(ids(project([resource()], state(profiles, placements))), ['resource-a']);
  assert.deepEqual(project([resource()], state(profiles, [placement('creator-a'), placement('creator-b', { selected: false })])), []);
});

test('withdrawing and reselecting retains the same resource and approval', () => {
  const approved = resource();
  const before = project([approved]);
  assert.deepEqual(project([approved], state([profile('creator-a')], [placement('creator-a', { selected: false })])), []);
  assert.deepEqual(project([approved]), before);
  assert.equal(approved.published, true);
});

test('legacy and anonymous submissions remain editorial until explicit transition', () => {
  const legacy = resource({ id: 'legacy' });
  delete legacy.directoryControl;
  const editorial = resource({ id: 'editorial', directoryControl: 'editorial' });
  const pending = resource({ id: 'anonymous-pending', directoryControl: 'editorial', published: false });
  assert.deepEqual(ids(project([legacy, editorial, pending], state([], []))).sort(), ['editorial', 'legacy']);
  assert.deepEqual(project([resource({ directoryControl: 'creator' })], state([], [])), []);
});

test('moderation hides editorial legacy too', () => {
  assert.deepEqual(project([resource({ directoryControl: 'editorial', hidden: true })], state([], [])), []);
});

test('malformed creator controls never widen directory visibility', () => {
  for (const bad of ['false', 1, null]) {
    assert.throws(() => project([resource({ hidden: bad })]), /invalid|malformed/i);
    assert.throws(() => project([resource()], state([profile('creator-a')], [placement('creator-a', { selected: bad })])), /invalid|malformed/i);
  }
  assert.throws(() => project([resource({ directoryControl: 'unknown' })]), /invalid|malformed/i);
  assert.throws(() => project([resource()], state([profile('creator-a', { published: 'true' })])), /invalid|malformed/i);
});

test('missing public creator state cannot publish creator-controlled records', () => {
  assert.throws(() => projectPublishedCatalog([resource()]), /creator|state|selection/i);
});

test('pending profile content needs no editorial classification to remain out of directory', () => {
  const pending = resource({ published: false, category: undefined, kind: undefined, format: undefined, topics: undefined });
  assert.deepEqual(project([pending]), []);
  assert.throws(() => project([{ ...pending, published: true }]), /category|format|kind/i);
});

test('public projection omits account, moderation and personal profile data', () => {
  const records = [resource({ editorProfileId: 'private-editor', submitterEmail: 'private@example.invalid', evidence: 'private-proof' })];
  const publicState = state([profile('creator-a', { accountId: 'private-account', bio: 'private-profile-bio', website: 'https://private.example.invalid', photo: 'private-photo' })]);
  const json = JSON.stringify(project(records, publicState));
  for (const sentinel of ['private-', 'editorProfileId', 'directoryControl', 'selected', 'profileId']) assert.equal(json.includes(sentinel), false, sentinel);
  assert.equal(project(records, publicState)[0].url, records[0].url);
});

test('directory hash changes only when the public directory result changes', () => {
  const baseline = fingerprintPublicCatalog(project());
  const hash = (records, creatorState) => fingerprintPublicCatalog(project(records, creatorState));
  assert.notEqual(hash([resource()], state([], [])), baseline);
  assert.notEqual(hash([resource({ hidden: true })], state()), baseline);
  assert.notEqual(hash([resource({ published: false })], state()), baseline);
  assert.notEqual(hash([resource({ title: 'Título actualizado' })], state()), baseline);
  assert.equal(hash([resource()], state([profile('creator-a', { version: 50, photo: 'new-photo', website: 'https://example.test/new' })])), baseline);
  assert.equal(hash([resource({ version: 50, submitterEmail: 'private@example.invalid' })], state()), baseline);
});

test('selection changes that another profile sustains do not cause a new directory build', () => {
  const profiles = [profile('creator-a'), profile('creator-b')];
  const both = project([resource()], state(profiles, [placement('creator-a'), placement('creator-b')]));
  const onlyB = project([resource()], state(profiles, [placement('creator-a', { selected: false }), placement('creator-b')]));
  assert.equal(fingerprintPublicCatalog(both), fingerprintPublicCatalog(onlyB));
  const neither = project([resource()], state(profiles, [placement('creator-a', { selected: false }), placement('creator-b', { selected: false })]));
  assert.notEqual(fingerprintPublicCatalog(neither), fingerprintPublicCatalog(onlyB));
});

test('catalog loader reads every public creator-state page with explicit fields and strong reads', async () => {
  const calls = [];
  const rows = [
    { ...profile('creator-a'), recordType: 'profile' },
    { ...placement('creator-a', { selected: false }), recordType: 'placement' },
  ];
  const result = await loadCatalog({
    tableName: 'catalog-test',
    creatorTableName: 'profiles-test',
    scanPage: async () => ({ Items: [resource()] }),
    scanCreatorPage: async (params) => {
      calls.push(params);
      const index = calls.length - 1;
      return { Items: [rows[index]], ...(index === 0 ? { LastEvaluatedKey: { pk: 'creator-a', sk: 'meta' } } : {}) };
    },
  });
  assert.deepEqual(result, []);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].ExclusiveStartKey, { pk: 'creator-a', sk: 'meta' });
  for (const params of calls) {
    assert.equal(params.TableName, 'profiles-test');
    assert.equal(params.ConsistentRead, true);
    assert.equal(params.Select, 'SPECIFIC_ATTRIBUTES');
    assert.ok(params.ProjectionExpression);
    const fields = Object.values(params.ExpressionAttributeNames ?? {});
    for (const field of ['accountId', 'email', 'csrfToken', 'evidence', 'identity', 'bio', 'socials', 'photo']) {
      assert.equal(fields.includes(field), false, field);
      assert.equal(new RegExp(`\\b${field}\\b`, 'u').test(params.ProjectionExpression), false, field);
    }
  }
});

test('a failed or incomplete creator-state read cannot publish a partial directory', async () => {
  await assert.rejects(loadCatalog({
    tableName: 'catalog-test', creatorTableName: 'profiles-test',
    scanPage: async () => ({ Items: [resource()] }),
    scanCreatorPage: async () => { throw new Error('creator-state unavailable'); },
  }), /creator-state unavailable/);
  await assert.rejects(loadCatalog({
    tableName: 'catalog-test', creatorTableName: 'profiles-test',
    scanPage: async () => ({ Items: [resource()] }),
    scanCreatorPage: async () => ({ LastEvaluatedKey: { pk: 'repeat' } }),
  }), /Items|page|incomplete|malformed|repeat/i);
});

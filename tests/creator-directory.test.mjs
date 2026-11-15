import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCatalog, projectPublishedCatalog } from '../src/lib/catalog.mjs';
import { fingerprintPublicCatalog } from '../src/lib/publication.mjs';
import { creatorAggregates, placement, profile, resource } from './fixtures/creator-series-directory.mjs';

const state = (profiles = [profile('creator-a')], placements = [placement('creator-a', 'resource-a')]) =>
  creatorAggregates(profiles, placements);
const project = (records = [resource({ id: 'resource-a' })], creatorState = state()) =>
  projectPublishedCatalog(records, creatorState);
const ids = (records) => records.map(({ id }) => id);
const physicalState = (creator) => ({
  ...creator,
  pk: `PROFILE#${creator.id}`,
  sk: 'META',
  recordType: 'creatorState',
});

test('creator directory requires a selected placement on a published visible profile', () => {
  assert.deepEqual(ids(project()), ['resource-a']);
  assert.deepEqual(project([resource({ id: 'resource-a' })], state([], [])), []);
  assert.deepEqual(project([resource({ id: 'resource-a' })], state([profile('creator-a')], [
    placement('creator-a', 'resource-a', { selectedForDirectory: false }),
  ])), []);
  assert.deepEqual(project([resource({ id: 'resource-a' })], state([profile('creator-a', { published: false })])), []);
  assert.deepEqual(project([resource({ id: 'resource-a' })], state([profile('creator-a', { hidden: true })])), []);
  assert.deepEqual(project([resource({ id: 'resource-a' })], state([], [placement('missing-profile', 'resource-a')])), []);
});

test('approval, resource moderation and creator selection are independent', () => {
  assert.deepEqual(project([resource({ id: 'resource-a', published: false })]), []);
  assert.deepEqual(project([resource({ id: 'resource-a', hidden: true })]), []);
  assert.deepEqual(ids(project([resource({ id: 'resource-a', published: true, hidden: false })])), ['resource-a']);
});

test('one eligible profile sustains one directory entry for a shared resource', () => {
  const profiles = [profile('creator-a', { hidden: true }), profile('creator-b')];
  const placements = [placement('creator-a', 'resource-a'), placement('creator-b', 'resource-a')];
  assert.deepEqual(ids(project([resource({ id: 'resource-a' })], state(profiles, placements))), ['resource-a']);
  assert.deepEqual(project([resource({ id: 'resource-a' })], state(profiles, [
    placement('creator-a', 'resource-a'),
    placement('creator-b', 'resource-a', { selectedForDirectory: false }),
  ])), []);
});

test('withdrawing and reselecting retains the same resource and approval', () => {
  const approved = resource({ id: 'resource-a' });
  const before = project([approved]);
  assert.deepEqual(project([approved], state([profile('creator-a')], [
    placement('creator-a', 'resource-a', { selectedForDirectory: false }),
  ])), []);
  assert.deepEqual(project([approved]), before);
  assert.equal(approved.published, true);
});

test('legacy and anonymous submissions remain editorial until explicit transition', () => {
  const legacy = resource({ id: 'legacy' });
  delete legacy.directoryControl;
  const editorial = resource({ id: 'editorial', directoryControl: 'editorial' });
  const pending = resource({ id: 'anonymous-pending', directoryControl: 'editorial', published: false });
  assert.deepEqual(ids(project([legacy, editorial, pending], state([], []))).sort(), ['editorial', 'legacy']);
  assert.deepEqual(project([resource({ id: 'resource-a', directoryControl: 'creator' })], state([], [])), []);
});

test('moderation hides editorial legacy too', () => {
  assert.deepEqual(project([resource({ id: 'resource-a', directoryControl: 'editorial', hidden: true })], state([], [])), []);
});

test('malformed creator controls never widen directory visibility', () => {
  for (const bad of ['false', 1, null]) {
    assert.throws(() => project([resource({ id: 'resource-a', hidden: bad })]), /invalid|malformed/i);
    assert.throws(() => project([resource({ id: 'resource-a' })], state([profile('creator-a')], [
      placement('creator-a', 'resource-a', { selectedForDirectory: bad }),
    ])), /invalid|malformed|creator state/i);
  }
  assert.throws(() => project([resource({ id: 'resource-a', directoryControl: 'unknown' })]), /invalid|malformed/i);
  assert.throws(() => project([resource({ id: 'resource-a' })], state([profile('creator-a', { published: 'true' })])), /invalid|malformed/i);
});

test('missing public creator state cannot publish creator-controlled records', () => {
  assert.throws(() => projectPublishedCatalog([resource({ id: 'resource-a' })]), /creator|state|selection/i);
});

test('pending profile content needs no editorial classification to remain out of directory', () => {
  const pending = resource({ id: 'resource-a', published: false, category: undefined, kind: undefined, format: undefined, topics: undefined });
  assert.deepEqual(project([pending]), []);
  assert.throws(() => project([{ ...pending, published: true }]), /category|format|kind/i);
});

test('public projection omits account, moderation and personal profile data', () => {
  const records = [resource({ id: 'resource-a', editorProfileId: 'private-editor', submitterEmail: 'private@example.invalid', evidence: 'private-proof' })];
  const publicState = state([profile('creator-a', {
    accountId: 'private-account', bio: 'private-profile-bio', website: 'https://private.example.invalid', photo: 'private-photo',
  })]);
  const json = JSON.stringify(project(records, publicState));
  for (const sentinel of ['private-', 'editorProfileId', 'directoryControl', 'selectedForDirectory', 'profileId']) {
    assert.equal(json.includes(sentinel), false, sentinel);
  }
  assert.equal(project(records, publicState)[0].url, records[0].url);
});

test('directory hash changes only when the public directory result changes', () => {
  const baseline = fingerprintPublicCatalog(project());
  const hash = (records, creatorState) => fingerprintPublicCatalog(project(records, creatorState));
  assert.notEqual(hash([resource({ id: 'resource-a' })], state([], [])), baseline);
  assert.notEqual(hash([resource({ id: 'resource-a', hidden: true })], state()), baseline);
  assert.notEqual(hash([resource({ id: 'resource-a', published: false })], state()), baseline);
  assert.notEqual(hash([resource({ id: 'resource-a', title: 'Título actualizado' })], state()), baseline);
  assert.equal(hash([resource({ id: 'resource-a' })], state([profile('creator-a', { version: 50, photo: 'new-photo', website: 'https://example.test/new' })])), baseline);
  assert.equal(hash([resource({ id: 'resource-a', version: 50, submitterEmail: 'private@example.invalid' })], state()), baseline);
});

test('selection changes that another profile sustains do not cause a new directory build', () => {
  const profiles = [profile('creator-a'), profile('creator-b')];
  const both = project([resource({ id: 'resource-a' })], state(profiles, [
    placement('creator-a', 'resource-a'), placement('creator-b', 'resource-a'),
  ]));
  const onlyB = project([resource({ id: 'resource-a' })], state(profiles, [
    placement('creator-a', 'resource-a', { selectedForDirectory: false }), placement('creator-b', 'resource-a'),
  ]));
  assert.equal(fingerprintPublicCatalog(both), fingerprintPublicCatalog(onlyB));
  const neither = project([resource({ id: 'resource-a' })], state(profiles, [
    placement('creator-a', 'resource-a', { selectedForDirectory: false }),
    placement('creator-b', 'resource-a', { selectedForDirectory: false }),
  ]));
  assert.notEqual(fingerprintPublicCatalog(neither), fingerprintPublicCatalog(onlyB));
});

test('catalog loader reads every aggregate-state page with its exact public projection and strong reads', async () => {
  const calls = [];
  const creator = profile('creator-a');
  const row = physicalState(creator);
  const rows = [
    { pk: 'SLUG#ana-antigua', sk: 'META', recordType: 'profileAlias', aliasPrivateSentinel: 'alias-private' },
    row,
  ];
  const result = await loadCatalog({
    tableName: 'catalog-test',
    creatorTableName: 'profiles-test',
    scanPage: async () => ({ Items: [resource({ id: 'resource-a' })] }),
    scanCreatorPage: async (params) => {
      calls.push(params);
      const index = calls.length - 1;
      return { Items: [rows[index]], ...(index === 0 ? { LastEvaluatedKey: { pk: 'SLUG#ana-antigua', sk: 'META' } } : {}) };
    },
  });
  assert.deepEqual(result, []);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].ExclusiveStartKey, { pk: 'SLUG#ana-antigua', sk: 'META' });
  for (const params of calls) {
    assert.equal(params.TableName, 'profiles-test');
    assert.equal(params.ConsistentRead, true);
    assert.equal(params.Select, 'SPECIFIC_ATTRIBUTES');
    assert.ok(params.ProjectionExpression);
    const fields = Object.values(params.ExpressionAttributeNames ?? {});
    for (const field of ['profileId', 'resourceId', 'selectedForDirectory', 'name', 'version', 'accountId', 'email', 'csrfToken', 'evidence', 'identity', 'bio', 'socials', 'photo', 'claims', 'uploads', 'analyticsCache']) {
      assert.equal(fields.includes(field), false, field);
      assert.equal(new RegExp(`\\b${field}\\b`, 'u').test(params.ProjectionExpression), false, field);
    }
    for (const field of ['schemaVersion', 'id', 'displayName', 'slug', 'published', 'hidden', 'placements', 'order', 'series']) {
      assert.ok(fields.includes(field), field);
    }
  }
});

test('a failed, incomplete, or obsolete creator-state read cannot publish a partial directory', async () => {
  const base = {
    tableName: 'catalog-test', creatorTableName: 'profiles-test',
    scanPage: async () => ({ Items: [resource({ id: 'resource-a' })] }),
  };
  await assert.rejects(loadCatalog({ ...base, scanCreatorPage: async () => { throw new Error('creator-state unavailable'); } }), /creator-state unavailable/);
  await assert.rejects(loadCatalog({ ...base, scanCreatorPage: async () => ({ LastEvaluatedKey: { pk: 'repeat' } }) }), /Items|page|incomplete|malformed|repeat/i);
  await assert.rejects(loadCatalog({ ...base, scanCreatorPage: async () => ({ Items: [{ ...profile('creator-a'), recordType: 'profile', pk: 'PROFILE#creator-a', sk: 'META' }] }) }), /schema identity|creatorState/i);
});

test('private statistics rows do not change public directory data, fields, or hash', async () => {
  const queries = [];
  const creator = profile('creator-a');
  const id = 'creator-a-resource-a';
  creator.placements[id] = { resourceId: 'resource-a', selectedForDirectory: true };
  creator.order.ordinary.push(id);
  const rows = [
    physicalState(creator),
    {
      pk: 'ANALYTICS#creator-a', sk: 'GA4#424203315#v1#7#1', recordType: 'analyticsCache',
      report: { privateStatisticsSentinel: 'private-statistics-report', totals: { views: 123456789 } },
      updatedAt: 1792848000000, expiresAt: 1792851600000, retainUntil: 1793452800000, ttl: 1793452800,
    },
  ];
  const actual = await loadCatalog({
    tableName: 'catalog-test', creatorTableName: 'profiles-test',
    scanPage: async () => ({ Items: [resource({ id: 'resource-a' })] }),
    scanCreatorPage: async (query) => { queries.push(query); return { Items: rows }; },
  });
  const expected = project([resource({ id: 'resource-a' })], creatorAggregates([creator]));
  assert.deepEqual(actual, expected);
  assert.equal(fingerprintPublicCatalog(actual), fingerprintPublicCatalog(expected));
  assert.doesNotMatch(JSON.stringify(actual), /private-statistics|123456789|analyticsCache/);
  const attributes = Object.values(queries[0].ExpressionAttributeNames);
  for (const name of ['report', 'totals', 'updatedAt', 'expiresAt', 'retainUntil', 'ttl']) assert.equal(attributes.includes(name), false, name);
});

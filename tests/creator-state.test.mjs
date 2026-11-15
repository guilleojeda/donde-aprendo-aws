import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertCreatorStateFits,
  CREATOR_CONTENT_LIMIT_BYTES,
  CreatorStateError,
  prepareCreatorStateWrite,
  readCreatorState,
  validateCreatorSequences,
} from '../src/lib/creator-state.mjs';
import { dynamoDbCreatorStateSizes, dynamoDbItemSize } from '../src/lib/creator-dynamodb-size.mjs';

function creatorState(overrides = {}) {
  return {
    recordType: 'creatorState',
    schemaVersion: 2,
    id: 'creator-one',
    version: 17,
    displayName: 'Creadora',
    slug: 'creadora',
    programs: ['Heroes'],
    socials: {},
    published: true,
    hidden: false,
    createdAt: 1,
    updatedAt: 2,
    placements: {
      'placement-z': { resourceId: 'resource:z', selectedForDirectory: true },
      'placement-a': { resourceId: 'resource:a', selectedForDirectory: false },
    },
    order: { featured: [], ordinary: ['placement-z', 'placement-a'] },
    series: {
      first: { name: 'Primera', slug: 'primera', chapters: ['placement-a', 'placement-z'] },
    },
    ...structuredClone(overrides),
  };
}

function assertInvalid(row, expectedId = 'creator-one') {
  assert.throws(() => readCreatorState(row, expectedId), (error) => {
    assert.ok(error instanceof CreatorStateError);
    assert.equal(error.status, 503);
    assert.equal(error.code, 'INVALID_CREATOR_STATE');
    return true;
  });
}

function assertSequenceInvalid(value) {
  assert.throws(() => validateCreatorSequences(value), (error) => {
    assert.ok(error instanceof CreatorStateError);
    assert.equal(error.status, 503);
    assert.equal(error.code, 'INVALID_CREATOR_STATE');
    return true;
  });
}

test('readCreatorState validates a logical store row without defaulting or mutating fields', () => {
  const row = creatorState({ city: 'Córdoba', photo: { version: 'upload-1', url: '/media/fotos/creator-one/upload-1.webp' } });
  const before = structuredClone(row);
  assert.equal(readCreatorState(row, 'creator-one'), row);
  assert.deepEqual(row, before);
});

test('readCreatorState accepts matching optional physical keys and rejects identity, schema, or key drift', () => {
  const row = { ...creatorState(), pk: 'PROFILE#creator-one', sk: 'META' };
  assert.equal(readCreatorState(row, 'creator-one'), row);
  assertInvalid({ ...row, version: undefined });
  assertInvalid({ ...row, recordType: 'profile' });
  assertInvalid({ ...row, schemaVersion: 1 });
  assertInvalid({ ...row, pk: 'PROFILE#other' });
  assertInvalid(row, 'creator-two');
  assertInvalid({ ...creatorState(), slug: 'ab' });
  assert.equal(readCreatorState(creatorState({ slug: '', published: false }), 'creator-one').slug, '',
    'the empty draft slug remains valid until explicit publication');
});

test('sequence validation accepts the projected content and rejects incomplete or overlapping orders', () => {
  const { placements, order, series } = creatorState();
  const projected = { placements, order, series };
  assert.equal(validateCreatorSequences(projected), projected);
  assertSequenceInvalid({ ...projected, order: { featured: [], ordinary: ['placement-z'] } });
  assertSequenceInvalid({
    ...projected,
    order: { featured: ['placement-z'], ordinary: ['placement-z', 'placement-a'] },
  });
  assertSequenceInvalid({
    ...projected,
    series: { first: { ...series.first, chapters: ['placement-a', 'placement-a'] } },
  });
});

test('candidate sizing includes exact physical keys and excludes only bounded root system fields from content', () => {
  const candidate = creatorState({
    photo: { version: 'upload-1', url: '/media/fotos/creator-one/upload-1.webp' },
  });
  const sizes = dynamoDbCreatorStateSizes(candidate);
  const physical = { ...candidate, pk: 'PROFILE#creator-one', sk: 'META' };
  assert.equal(sizes.itemBytes, dynamoDbItemSize(physical));
  for (const field of ['version', 'hidden', 'published', 'updatedAt', 'photo']) delete physical[field];
  assert.equal(sizes.contentBytes, dynamoDbItemSize(physical));
  assert.ok(sizes.itemBytes > sizes.contentBytes);
  assert.equal(assertCreatorStateFits(candidate), candidate);
});

test('creator-state write preparation binds its logical key, observed revision, and validated candidate', () => {
  const candidate = creatorState();
  const prepared = prepareCreatorStateWrite(candidate, candidate.version - 1);
  assert.deepEqual(prepared.check, { key: 'profile:creator-one', version: candidate.version - 1 });
  assert.deepEqual(prepared.put, { key: 'profile:creator-one', value: candidate });
  assert.strictEqual(prepared.put.value, candidate);
  assert.throws(() => prepareCreatorStateWrite(candidate, -1), TypeError);
});

test('content above the fixed 384 KiB allowance fails with the storage quota contract', () => {
  const series = {};
  for (let index = 0; index < 197; index += 1) {
    const suffix = String(index).padStart(3, '0');
    series[`series-${suffix}`] = {
      name: `Serie ${suffix}`,
      slug: `serie-${suffix}`,
      description: 'x'.repeat(2000),
      chapters: [],
    };
  }
  const candidate = creatorState({ series });
  assert.ok(dynamoDbCreatorStateSizes(candidate).contentBytes > CREATOR_CONTENT_LIMIT_BYTES);
  assert.throws(() => assertCreatorStateFits(candidate), (error) => {
    assert.equal(error.status, 422);
    assert.equal(error.code, 'CREATOR_CONTENT_TOO_LARGE');
    return true;
  });
  assert.throws(() => prepareCreatorStateWrite(candidate, candidate.version - 1), (error) => {
    assert.ok(error instanceof CreatorStateError);
    assert.equal(error.status, 422);
    assert.equal(error.code, 'CREATOR_CONTENT_TOO_LARGE');
    return true;
  });
});

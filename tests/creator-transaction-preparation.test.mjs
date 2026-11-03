import assert from 'node:assert/strict';
import { test } from 'node:test';
import { marshall } from '@aws-sdk/util-dynamodb';
import {
  createDynamoMoveStore,
  storedAttributeBytes,
} from './fixtures/creator-link-move.mjs';

// These cases use default limits; observation APIs also accept { budget } so
// move callers can stop page/image materialization before exceeding their cap.
const ITEM_LIMIT = 400 * 1024;
const TRANSACTION_LIMIT = 4 * 1024 * 1024;

function requireObservationStore(store) {
  assert.equal(typeof store.observe, 'function', 'the store exposes a raw-image point observation');
  assert.equal(typeof store.observeList, 'function', 'the store exposes raw-image list observations');
  assert.equal(typeof store.measurePut, 'function', 'the adapter measures a candidate Put with its real physical keys');
  assert.equal(typeof store.prepareTransaction, 'function', 'the store prepares concrete transactions');
}

function seedRawPlacement(mock, {
  id,
  profileId = 'profile-a',
  version,
  ttl = 1_900_000_000,
  futureField = 'opaque placement data',
} = {}) {
  const placement = {
    pk: `PROFILE#${profileId}`,
    sk: `PLACEMENT#${id}`,
    recordType: 'placement',
    id,
    profileId,
    resourceId: `resource-${id}`,
    position: 0,
    featured: false,
    selectedForDirectory: true,
    series: { legacy: { retained: true } },
    ttl,
    futureField,
  };
  if (version !== undefined) placement.version = version;
  mock.seed('profiles-test', placement);
  return placement;
}

function seedResourceAtSize(mock, id, bytes) {
  const value = { id, title: 'Recurso', version: 1, padding: '' };
  value.padding = 'x'.repeat(bytes - storedAttributeBytes(value));
  assert.equal(storedAttributeBytes(value), bytes);
  mock.seed('catalog-test', value);
  return value;
}

function samePhysicalKey(image, key) {
  return Object.entries(key).every(([attribute, value]) => image[attribute] === value);
}

function rawRequestItemBytes(mock, action, observations) {
  if (action.Put) return storedAttributeBytes(action.Put.Item);
  const operation = action.Delete ?? action.ConditionCheck;
  const original = observations.map(({ physicalImage }) => physicalImage)
    .find((image) => image && samePhysicalKey(image, operation.Key))
    ?? mock.read(operation.TableName, operation.Key);
  return original ? storedAttributeBytes(original) : 0;
}

function assertPreparedMetricsMatchRequest(prepared, mock, observations) {
  const request = mock.transactions.at(-1)?.input.TransactItems;
  assert.ok(request, 'commit sends a real TransactWrite command');
  const actualItemBytes = request.map((action) => rawRequestItemBytes(mock, action, observations));
  assert.equal(prepared.metrics.actionCount, request.length);
  assert.deepEqual(prepared.metrics.itemBytes, actualItemBytes,
    'the per-action images measured before commit are the images in the submitted command');
  assert.equal(prepared.metrics.aggregateBytes, actualItemBytes.reduce((sum, bytes) => sum + bytes, 0));
}

test('test physical-size model matches literal Binary and Set controls with DocumentClient undefined removal', () => {
  const item = {
    b: new Uint8Array([0, 255]),
    ss: new Set(['a', 'ñ', undefined]),
    ns: new Set([-12.5, 1e-20, undefined]),
    bs: new Set([new Uint8Array([1]), new Uint8Array([2, 3]), undefined]),
    obj: { x: 'y', dropped: undefined },
    list: ['y', undefined, new Uint8Array([4])],
    dropped: undefined,
  };

  assert.equal(storedAttributeBytes(item), 40,
    'literal UTF-8, raw binary, numeric significant-digit and container overhead sum to 40 bytes');
  const marshalled = marshall(item, { removeUndefinedValues: true });
  assert.deepEqual(Object.keys(marshalled).sort(), ['b', 'bs', 'list', 'ns', 'obj', 'ss']);
  assert.deepEqual([...marshalled.b.B], [0, 255]);
  assert.deepEqual(marshalled.ss.SS, ['a', 'ñ']);
  assert.deepEqual(marshalled.ns.NS, ['-12.5', '1e-20']);
  assert.deepEqual(marshalled.bs.BS.map((value) => [...value]), [[1], [2, 3]]);
  assert.deepEqual(marshalled.obj.M, { x: { S: 'y' } });
  assert.deepEqual(marshalled.list.L, [{ S: 'y' }, { B: new Uint8Array([4]) }]);

  assert.equal(storedAttributeBytes({ negativeFraction: -123.45 }), 20,
    'a negative scalar uses the approximate significant-digit byte count, not its JSON character length');
  assert.equal(storedAttributeBytes({ fraction: 0.00012 }), 10,
    'leading fractional zeroes do not inflate significant digits');
  assert.equal(storedAttributeBytes({ exponent: 1e-20 }), 10,
    'the approved approximate model counts significant digits, not exponent text length');
});

test('projection-aware mock Queries honor ExclusiveStartKey across bounded pages', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true, queryPageSize: 2 });
  for (const id of ['row-01', 'row-02', 'row-03']) seedRawPlacement(mock, { id });

  const rows = await store.list('placement:profile-a:');
  const queries = mock.calls.filter(({ name }) => name === 'QueryCommand');

  assert.deepEqual(rows.map(({ key }) => key), [
    'placement:profile-a:row-01',
    'placement:profile-a:row-02',
    'placement:profile-a:row-03',
  ]);
  assert.equal(queries.length, 2);
  assert.equal(Object.hasOwn(queries[0].input, 'ExclusiveStartKey'), false);
  assert.deepEqual(queries[1].input.ExclusiveStartKey, {
    pk: 'PROFILE#profile-a',
    sk: 'PLACEMENT#row-02',
  });
  assert.ok(rows.every(({ value }) => !Object.hasOwn(value, 'futureField')),
    'each page is projected before returning to the store');
});

test('point observations separate clean logical values from full raw images', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true });
  requireObservationStore(store);
  const absentVersion = seedRawPlacement(mock, { id: 'absent-version' });
  const explicitZero = seedRawPlacement(mock, { id: 'explicit-zero', version: 0 });

  const absent = await store.observe('placement:profile-a:absent-version');
  const zero = await store.observe('placement:profile-a:explicit-zero');

  assert.equal(absent.key, 'placement:profile-a:absent-version');
  assert.deepEqual(absent.physicalImage, absentVersion);
  assert.equal(Object.hasOwn(absent.physicalImage, 'version'), false);
  assert.equal(absent.value.version, 0, 'the logical compatibility value still normalizes absent version to zero');
  assert.equal(Object.hasOwn(absent.value, 'ttl'), false);
  assert.equal(Object.hasOwn(absent.value, 'futureField'), true,
    'Get-derived logical values keep unknown attributes other than TTL and physical keys');

  assert.deepEqual(zero.physicalImage, explicitZero);
  assert.equal(Object.hasOwn(zero.physicalImage, 'version'), true);
  assert.equal(zero.value.version, 0);
  const absentPrepared = await store.prepareTransaction({
    checks: [{ key: absent.key, version: absent.value.version }],
  }, [absent]);
  const zeroPrepared = await store.prepareTransaction({
    checks: [{ key: zero.key, version: zero.value.version }],
  }, [zero]);
  assert.equal(absentPrepared.metrics.itemBytes[0], storedAttributeBytes(absentVersion));
  assert.equal(zeroPrepared.metrics.itemBytes[0], storedAttributeBytes(explicitZero));
  assert.notEqual(absentPrepared.metrics.itemBytes[0], zeroPrepared.metrics.itemBytes[0],
    'logical version zero must not erase physical version presence from the measured image');
  assert.equal(absentPrepared.metrics.fits, true);
  assert.equal(await absentPrepared.commit(), true,
    'version zero ConditionCheck accepts a physically missing stored version');
  assertPreparedMetricsMatchRequest(absentPrepared, mock, [absent]);
  assert.equal(Object.hasOwn(mock.read('profiles-test', { pk: 'PROFILE#profile-a', sk: 'PLACEMENT#absent-version' }), 'version'), false,
    'the successful raw-image CAS leaves missing version absent');
  assert.equal(await zeroPrepared.commit(), true,
    'version zero ConditionCheck also accepts explicit stored zero');
  assertPreparedMetricsMatchRequest(zeroPrepared, mock, [zero]);
  assert.deepEqual(mock.calls.filter(({ name }) => name === 'GetCommand').length, 2);
});

test('placement list observations use one projected query plus its raw image sidecar, without per-row Gets', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true });
  requireObservationStore(store);
  const raw = seedRawPlacement(mock, { id: 'listed', futureField: 'future root attribute' });

  const observations = await store.observeList('placement:profile-a:');

  assert.equal(observations.length, 1);
  assert.equal(observations[0].key, 'placement:profile-a:listed');
  assert.deepEqual(observations[0].physicalImage, raw);
  assert.equal(observations[0].value.version, 0);
  assert.equal(Object.hasOwn(observations[0].value, 'ttl'), false);
  assert.equal(Object.hasOwn(observations[0].value, 'futureField'), false,
    'the logical Query projection does not absorb raw future fields');
  assert.equal(Object.hasOwn(observations[0].value.series, 'legacy'), true,
    'the existing projected series map keeps nested legacy members');
  assert.equal(mock.calls.filter(({ name }) => name === 'QueryCommand').length, 1);
  assert.equal(mock.calls.filter(({ name }) => name === 'GetCommand').length, 0,
    'the sidecar comes from the same Query rather than an extra read per placement');
  const callsBeforePreparation = mock.calls.length;
  const prepared = await store.prepareTransaction({
    checks: [{ key: observations[0].key, version: observations[0].value.version }],
  }, observations);
  assert.equal(mock.calls.length, callsBeforePreparation, 'physical check sizing consumes the sidecar');
  assert.equal(prepared.metrics.itemBytes[0], storedAttributeBytes(raw),
    'the unchanged CheckCondition is measured from its full original image');
});

test('prepared raw CheckCondition sizing includes projected-away Binary and Set attributes', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true });
  requireObservationStore(store);
  const raw = seedRawPlacement(mock, { id: 'native-physical-values', version: 0 });
  Object.assign(raw, {
    b: new Uint8Array([0, 255]),
    ss: new Set(['a', 'ñ']),
    ns: new Set([-12.5, 1e-20]),
    bs: new Set([new Uint8Array([1]), new Uint8Array([2, 3])]),
  });
  mock.seed('profiles-test', raw);

  const base = { ...raw };
  for (const name of ['b', 'ss', 'ns', 'bs']) delete base[name];
  assert.equal(storedAttributeBytes(raw) - storedAttributeBytes(base), 20,
    'raw Binary and homogeneous Set values add their literal raw-value sizes and attribute names');

  const [observation] = await store.observeList('placement:profile-a:');
  assert.deepEqual(observation.physicalImage, raw);
  for (const name of ['b', 'ss', 'ns', 'bs']) {
    assert.equal(Object.hasOwn(observation.value, name), false,
      `${name} remains outside the existing logical Query projection`);
  }
  const expectedImageBytes = storedAttributeBytes(raw);
  const prepared = await store.prepareTransaction({
    checks: [{ key: observation.key, version: observation.value.version }],
  }, [observation]);

  assert.equal(prepared.metrics.itemBytes[0], expectedImageBytes,
    'the unchanged condition image includes binary and all three native Set types');
  assert.equal(prepared.metrics.fits, true);
  assert.equal(await prepared.commit(), true);
  assertPreparedMetricsMatchRequest(prepared, mock, [observation]);
  assert.equal(mock.transactions[0].physicalBytes, expectedImageBytes);
  assert.deepEqual(mock.read('profiles-test', { pk: 'PROFILE#profile-a', sk: 'PLACEMENT#native-physical-values' }), raw,
    'a checks-only transaction leaves the physical binary/set values intact');
});

test('prepared transactions coalesce CAS with writes and keep measured images through commit', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true });
  requireObservationStore(store);
  mock.seed('profiles-test', {
    pk: 'PROFILE#profile-a', sk: 'META', recordType: 'profile', id: 'profile-a',
    displayName: 'Antes', version: 1, ttl: 1_900_000_000, futureProfileField: 'retain from Get',
  });
  const rawPlacement = seedRawPlacement(mock, { id: 'to-delete' });
  const profileObservation = await store.observe('profile:profile-a');
  const placementObservation = await store.observe('placement:profile-a:to-delete');
  const candidate = {
    ...profileObservation.value,
    displayName: 'Preparado',
    version: 2,
    pk: 'PROFILE#wrong-input',
    sk: 'WRONG',
  };
  const logicalInput = {
    checks: [
      { key: 'profile:profile-a', version: 1 },
      { key: 'placement:profile-a:to-delete', version: 0 },
      { key: 'alias:unused-slug', version: null },
    ],
    puts: [{ key: 'profile:profile-a', value: candidate }],
    deletes: ['placement:profile-a:to-delete'],
  };
  const callsBeforePreparation = mock.calls.length;
  const prepared = await store.prepareTransaction(logicalInput, [profileObservation, placementObservation]);
  const candidateMeasurement = store.measurePut('profile:profile-a', candidate);
  assert.equal(candidateMeasurement.itemBytes, storedAttributeBytes({
    ...candidate, pk: 'PROFILE#profile-a', sk: 'META',
  }), 'candidate measurement uses the same authoritative physical keys as preparation');

  await assert.rejects(store.prepareTransaction({
    checks: [
      { key: 'profile:profile-a', version: 1 },
      { key: 'profile:profile-a', version: 1 },
    ],
  }, [profileObservation]), /duplicate transaction check/);
  await assert.rejects(store.prepareTransaction({
    puts: [
      { key: 'profile:profile-a', value: candidate },
      { key: 'profile:profile-a', value: candidate },
    ],
  }, [profileObservation]), /duplicate transaction action/);

  assert.deepEqual(prepared.metrics.actionCount, 3,
    'check+Put and check+Delete each coalesce to one physical action, plus one absent ConditionCheck');
  assert.equal(prepared.metrics.fits, true);
  assert.equal(mock.calls.length, callsBeforePreparation, 'preparing from observations does not re-read');
  const measured = structuredClone(prepared.metrics);

  candidate.displayName = 'Mutado después de preparar';
  profileObservation.physicalImage.futureProfileField = 'mutación tardía';
  logicalInput.puts[0].value.version = 99;
  assert.deepEqual(prepared.metrics, measured, 'caller mutation cannot change prepared measurements');

  assert.equal(await prepared.commit(), true);
  assertPreparedMetricsMatchRequest(prepared, mock, [profileObservation, placementObservation]);
  const actions = mock.transactions.at(-1).input.TransactItems;
  assert.equal(actions.length, 3);
  const profilePut = actions.find(({ Put }) => Put?.Item.sk === 'META');
  const placementDelete = actions.find(({ Delete }) => Delete?.Key.sk === 'PLACEMENT#to-delete');
  const absentCheck = actions.find(({ ConditionCheck }) => ConditionCheck?.Key.pk === 'SLUG#unused-slug'
    && !ConditionCheck.ConditionExpression?.includes('#version'));

  assert.ok(profilePut);
  assert.equal(prepared.metrics.itemBytes[actions.indexOf(profilePut)], candidateMeasurement.itemBytes,
    'the scalar cost fact and final prepared image use one adapter-owned Put construction');
  assert.equal(profilePut.Put.Item.pk, 'PROFILE#profile-a', 'physical keys override caller-supplied keys');
  assert.equal(profilePut.Put.Item.displayName, 'Preparado', 'Put image is snapshotted before caller mutation');
  assert.equal(profilePut.Put.Item.futureProfileField, 'retain from Get');
  assert.equal(Object.hasOwn(profilePut.Put.Item, 'ttl'), false, 'Get-derived writes keep current TTL stripping');
  assert.ok(placementDelete);
  assert.match(placementDelete.Delete.ConditionExpression, /attribute_not_exists\(#version\) OR #version = :zero/);
  assert.ok(absentCheck, 'an absent target remains a ConditionCheck');
  assert.equal(prepared.metrics.itemBytes[actions.indexOf(placementDelete)], storedAttributeBytes(rawPlacement),
    'the Delete image metric uses the original raw image including TTL and opaque fields');
  assert.deepEqual(mock.read('profiles-test', { pk: 'PROFILE#profile-a', sk: 'PLACEMENT#to-delete' }), undefined);
});

test('a prepared CAS race returns false and leaves every other participant untouched', async () => {
  const { mock, store } = createDynamoMoveStore({ projectionAware: true });
  requireObservationStore(store);
  const rawProfile = {
    pk: 'PROFILE#profile-a', sk: 'META', recordType: 'profile', id: 'profile-a', version: 1,
  };
  mock.seed('profiles-test', rawProfile);
  const observation = await store.observe('profile:profile-a');
  const prepared = await store.prepareTransaction({
    checks: [
      { key: 'profile:profile-a', version: 1 },
      { key: 'alias:new-slug', version: null },
    ],
    puts: [
      { key: 'profile:profile-a', value: { ...observation.value, version: 2 } },
      { key: 'alias:new-slug', value: { recordType: 'profileAlias', slug: 'new-slug', profileId: 'profile-a', version: 1 } },
    ],
  }, [observation]);
  mock.raceBeforeNextTransaction(() => {
    mock.seed('profiles-test', { ...rawProfile, version: 3 });
  });

  assert.equal(await prepared.commit(), false, 'conditional failure keeps the existing store response contract');
  assert.equal(mock.read('profiles-test', { pk: 'PROFILE#profile-a', sk: 'META' }).version, 3);
  assert.equal(mock.read('profiles-test', { pk: 'SLUG#new-slug', sk: 'META' }), undefined,
    'a failed prepared transaction cannot partially commit another Put');
});

test('prepared count and item-size limits accept exact boundaries and reject one more byte/action', async () => {
  const { mock, store } = createDynamoMoveStore();
  requireObservationStore(store);

  seedResourceAtSize(mock, 'exact-item', ITEM_LIMIT);
  const exactItemObservation = await store.observe('resource:exact-item');
  const exactItem = await store.prepareTransaction({
    checks: [{ key: 'resource:exact-item', version: 1 }],
  }, [exactItemObservation]);
  assert.equal(exactItem.metrics.itemBytes[0], ITEM_LIMIT);
  assert.equal(exactItem.metrics.aggregateBytes, ITEM_LIMIT);
  assert.equal(exactItem.metrics.fits, true);

  const oversizedObservation = exactItemObservation;
  const oversizedValue = {
    ...oversizedObservation.value,
    padding: `${oversizedObservation.value.padding}x`,
    version: oversizedObservation.value.version + 1,
  };
  const oversized = await store.prepareTransaction({
    checks: [{ key: oversizedObservation.key, version: oversizedObservation.value.version }],
    puts: [{ key: oversizedObservation.key, value: oversizedValue }],
  }, [oversizedObservation]);
  assert.equal(oversized.metrics.itemBytes[0], ITEM_LIMIT + 1);
  assert.equal(oversized.metrics.fits, false);
  await assert.rejects(() => oversized.commit());
  assert.equal(mock.transactions.length, 0, 'an oversized candidate Put cannot be submitted');
  assert.equal(storedAttributeBytes(mock.read('catalog-test', { id: 'exact-item' })), ITEM_LIMIT,
    'the only oversized image is an unsubmitted candidate Put; stored provider items remain valid');

  const exactSizes = Array(10).fill(390_000).concat(TRANSACTION_LIMIT - 10 * 390_000);
  const exactObservations = exactSizes.map((bytes, index) => {
    const id = `aggregate-${index}`;
    seedResourceAtSize(mock, id, bytes);
    return id;
  });
  const exactRows = await Promise.all(exactObservations.map((id) => store.observe(`resource:${id}`)));
  const aggregate = await store.prepareTransaction({
    checks: exactRows.map(({ key, value }) => ({ key, version: value.version })),
  }, exactRows);
  assert.equal(aggregate.metrics.actionCount, 11);
  assert.equal(aggregate.metrics.aggregateBytes, TRANSACTION_LIMIT);
  assert.equal(aggregate.metrics.fits, true);

  const overSizes = [...exactSizes.slice(0, -1), exactSizes.at(-1) + 1];
  const overObservations = overSizes.map((bytes, index) => {
    const id = `aggregate-over-${index}`;
    seedResourceAtSize(mock, id, bytes);
    return id;
  });
  const overRows = await Promise.all(overObservations.map((id) => store.observe(`resource:${id}`)));
  const overAggregate = await store.prepareTransaction({
    checks: overRows.map(({ key, value }) => ({ key, version: value.version })),
  }, overRows);
  assert.equal(overAggregate.metrics.aggregateBytes, TRANSACTION_LIMIT + 1);
  assert.equal(overAggregate.metrics.fits, false);
  await assert.rejects(() => overAggregate.commit());
  assert.equal(mock.transactions.length, 0, 'an over-limit aggregate cannot be submitted');

  const exactActions = await store.prepareTransaction({
    checks: Array.from({ length: 100 }, (_, index) => ({ key: `alias:limit-${index}`, version: null })),
  }, []);
  const excessActions = await store.prepareTransaction({
    checks: Array.from({ length: 101 }, (_, index) => ({ key: `alias:limit-over-${index}`, version: null })),
  }, []);
  assert.equal(exactActions.metrics.actionCount, 100);
  assert.equal(exactActions.metrics.fits, true);
  assert.equal(excessActions.metrics.actionCount, 101);
  assert.equal(excessActions.metrics.fits, false);
  await assert.rejects(() => excessActions.commit());
  assert.equal(mock.transactions.length, 0, 'a 101-action transaction cannot be submitted');
  assert.equal(mock.transactions.length, 0, 'measuring prepared boundaries does not submit any transaction');
});

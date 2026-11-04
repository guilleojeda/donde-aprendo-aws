import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentUrlKey, currentUrlReservationId } from '../src/lib/catalog-url.mjs';
import { createDocumentStore, seedResource } from './fixtures/creator-pages.mjs';

test('logical store checks reservation contents and list order before committing other writes', async () => {
  const store = createDocumentStore();
  const resource = {
    id: 'resource-logical-cas',
    title: 'Before',
    url: 'https://logical.example/shared?raw=%2f',
    version: 1,
  };
  await seedResource(store, resource);
  const reservationKey = currentUrlKey(resource.url);
  const reservation = await store.get(reservationKey);
  assert.equal(reservation.id, currentUrlReservationId(resource.url),
    'logical reads expose the URL key as the physical reservation ID');

  const collision = { ...reservation, status: 'collision', resourceIds: ['resource-b', resource.id] };
  delete collision.resourceId;
  assert.equal(await store.transact({
    checks: [{ key: reservationKey, version: 1 }],
    puts: [{ key: reservationKey, value: collision }],
  }), true);
  const afterRace = await store.get(`resource:${resource.id}`);
  const updatedResource = { ...afterRace, title: 'Must remain unchanged', version: 2 };
  assert.equal(await store.transact({
    checks: [
      { key: reservationKey, version: reservation.version, expectedReservation: reservation },
      { key: `resource:${resource.id}`, version: afterRace.version },
    ],
    puts: [{ key: `resource:${resource.id}`, value: updatedResource }],
  }), false, 'same-version status and material attribute changes fail the observed-state check');
  assert.deepEqual(await store.get(`resource:${resource.id}`), afterRace,
    'a reservation mismatch does not partially commit another participant');

  const observedCollision = await store.get(reservationKey);
  const reversedObservation = {
    ...observedCollision,
    resourceIds: [...observedCollision.resourceIds].reverse(),
  };
  assert.equal(await store.transact({
    checks: [
      { key: reservationKey, version: observedCollision.version, expectedReservation: reversedObservation },
      { key: `resource:${resource.id}`, version: afterRace.version },
    ],
    puts: [{ key: `resource:${resource.id}`, value: updatedResource }],
  }), false, 'member list comparison preserves the observed order');
  assert.deepEqual(await store.get(`resource:${resource.id}`), afterRace);

  assert.equal(await store.transact({
    checks: [
      { key: reservationKey, version: observedCollision.version, expectedReservation: observedCollision },
      { key: `resource:${resource.id}`, version: afterRace.version },
    ],
    puts: [{ key: `resource:${resource.id}`, value: updatedResource }],
  }), true, 'the unchanged full reservation observation accepts the transaction');
  assert.deepEqual(await store.get(`resource:${resource.id}`), updatedResource);
});

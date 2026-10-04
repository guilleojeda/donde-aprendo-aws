import assert from 'node:assert/strict';
import test from 'node:test';
import { uniqueUpcomingEventGroups } from '../src/lib/events.mjs';
import { EVENT_COLLECTIONS, eventCollectionForPath, eventGroupsForModes } from '../src/lib/event-collections.mjs';

test('event collection routes have unique copy and disjoint published mode scopes', () => {
  const collections = Object.values(EVENT_COLLECTIONS);
  assert.deepEqual(collections.map(({ path }) => path), ['/eventos/online/', '/eventos/presenciales/']);
  assert.equal(new Set(collections.map(({ path }) => path)).size, collections.length);
  assert.deepEqual(EVENT_COLLECTIONS.online.modes, ['online']);
  assert.deepEqual(EVENT_COLLECTIONS.presenciales.modes, ['in-person', 'hybrid']);
  assert.deepEqual(new Set(collections.flatMap(({ modes }) => modes)), new Set(['online', 'in-person', 'hybrid']));
  for (const collection of collections) {
    assert.ok(collection.label && collection.title && collection.description && collection.intro);
    assert.equal(eventCollectionForPath(collection.path), collection);
  }
  assert.equal(eventCollectionForPath('/eventos/'), undefined);
});

test('mode collections select after deduplication and retain all co-host listings', () => {
  const events = [
    {
      id: 'event-online', title: 'Meetup online', startsAt: '2099-01-01T18:00:00Z', endsAt: '2099-01-01T19:00:00Z',
      timeZone: 'UTC', mode: 'online', registrationUrl: 'https://example.test/meetup', country: 'AR', communityId: 'community-ar',
    },
    {
      id: 'event-online-cohost', title: 'Meetup online', startsAt: '2099-01-01T18:00:00Z', endsAt: '2099-01-01T19:00:00Z',
      timeZone: 'UTC', mode: 'online', registrationUrl: 'https://example.test/meetup?ref=cohost', country: 'CO', communityId: 'community-co',
    },
    {
      id: 'event-hybrid', title: 'Meetup híbrido', startsAt: '2099-01-02T18:00:00Z', endsAt: '2099-01-02T19:00:00Z',
      timeZone: 'UTC', mode: 'hybrid', place: 'Centro', registrationUrl: 'https://example.test/hybrid', country: 'PE', communityId: 'community-pe',
    },
    {
      id: 'event-in-person', title: 'Meetup presencial', startsAt: '2099-01-03T18:00:00Z', endsAt: '2099-01-03T19:00:00Z',
      timeZone: 'UTC', mode: 'in-person', place: 'Centro', registrationUrl: 'https://example.test/in-person', country: 'CL', communityId: 'community-cl',
    },
  ];
  const allGroups = uniqueUpcomingEventGroups(events, new Date('2098-01-01T00:00:00Z'));
  const online = eventGroupsForModes(allGroups, EVENT_COLLECTIONS.online.modes);
  const inPerson = eventGroupsForModes(allGroups, EVENT_COLLECTIONS.presenciales.modes);

  assert.equal(allGroups.length, 3);
  assert.deepEqual(online.map(({ event }) => event.id), ['event-online']);
  assert.deepEqual(online[0].events.map(({ communityId }) => communityId), ['community-ar', 'community-co']);
  assert.deepEqual(inPerson.map(({ event }) => event.id), ['event-hybrid', 'event-in-person']);
  assert.equal(eventGroupsForModes(allGroups, undefined), allGroups);
});

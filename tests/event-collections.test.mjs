import assert from 'node:assert/strict';
import test from 'node:test';
import { uniqueUpcomingEventGroups } from '../src/lib/events.mjs';
import { EVENT_COLLECTIONS, eventCollectionForPath, eventGroupsForModes } from '../src/lib/event-collections.mjs';

test('event collection routes preserve their paths and include hybrid participation in both scopes', () => {
  const collections = Object.values(EVENT_COLLECTIONS);
  assert.deepEqual(collections.map(({ path }) => path), ['/eventos/online/', '/eventos/presenciales/']);
  assert.equal(new Set(collections.map(({ path }) => path)).size, collections.length);
  assert.deepEqual(EVENT_COLLECTIONS.online.modes, ['online', 'hybrid']);
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
      id: 'event-hybrid-cohost', title: 'Meetup híbrido', startsAt: '2099-01-02T18:00:00Z', endsAt: '2099-01-02T19:00:00Z',
      timeZone: 'UTC', mode: 'hybrid', place: 'Centro', registrationUrl: 'https://example.test/hybrid?ref=cohost', country: 'PE', communityId: 'community-pe-cohost',
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
  assert.deepEqual(online.map(({ event }) => event.id), ['event-online', 'event-hybrid']);
  assert.deepEqual(online[0].events.map(({ communityId }) => communityId), ['community-ar', 'community-co']);
  assert.deepEqual(online[1].events.map(({ id }) => id), ['event-hybrid', 'event-hybrid-cohost'],
    'an online collection keeps all co-host listings for one hybrid occurrence');
  assert.deepEqual(inPerson.map(({ event }) => event.id), ['event-hybrid', 'event-in-person']);
  assert.equal(inPerson.filter(({ event }) => event.id === 'event-hybrid').length, 1,
    'the hybrid occurrence appears once within each collection');
  assert.equal(eventGroupsForModes(allGroups, undefined), allGroups);
});

test('physical collections keep registrations with different Forms IDs as separate events', () => {
  const startsAt = '2099-01-01T18:00:00Z';
  const endsAt = '2099-01-01T20:00:00Z';
  const events = [
    {
      id: 'event-forms-cordoba', title: 'Taller presencial de AWS Lambda', startsAt, endsAt,
      timeZone: 'America/Argentina/Cordoba', mode: 'in-person', place: 'Auditorio Córdoba',
      country: 'AR', city: 'Córdoba', communityId: 'community-cordoba',
      registrationUrl: 'https://forms.office.com/Pages/ResponsePage.aspx?id=form-cordoba&source=agenda&ref=calendar',
    },
    {
      id: 'event-forms-rosario', title: 'Taller presencial de AWS Lambda', startsAt, endsAt,
      timeZone: 'America/Argentina/Cordoba', mode: 'in-person', place: 'Universidad de Rosario',
      country: 'AR', city: 'Rosario', communityId: 'community-rosario',
      registrationUrl: 'https://forms.office.com/Pages/ResponsePage.aspx?id=form-rosario&source=agenda&ref=calendar',
    },
  ];

  const groups = uniqueUpcomingEventGroups(events, '2098-01-01T00:00:00Z');
  const physical = eventGroupsForModes(groups, EVENT_COLLECTIONS.presenciales.modes);

  assert.deepEqual(physical.map(({ event }) => event.id), ['event-forms-cordoba', 'event-forms-rosario']);
});

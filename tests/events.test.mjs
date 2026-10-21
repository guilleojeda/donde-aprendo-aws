import assert from 'node:assert/strict';
import test from 'node:test';
import { projectPublishedCatalog } from '../src/lib/catalog.mjs';
import * as eventApi from '../src/lib/events.mjs';
import { eventDateLabel, eventEndTimeLabel, eventLocalDate, eventTimeLabel, upcomingEvents, uniqueUpcomingEventGroups, uniqueUpcomingEvents } from '../src/lib/events.mjs';
import { eventMatchesFilters } from '../src/lib/event-agenda-filter.mjs';
import { eventGroupCountries, eventGroupsForAgenda } from '../src/lib/event-agenda-groups.mjs';
import { createEventAgendaPeriod } from '../src/lib/event-agenda-period.mjs';
import { fingerprintPublicCatalog } from '../src/lib/publication.mjs';

const event = (overrides = {}) => ({
  recordType: 'event', id: 'event-paraguay', title: 'AWS Community Day Paraguay',
  description: 'Charlas técnicas de la comunidad.',
  startsAt: '2026-10-17T08:00:00-03:00', endsAt: '2026-10-17T18:00:00-03:00',
  timeZone: 'America/Asuncion', organizer: 'AWS User Group Paraguay',
  mode: 'in-person', place: 'SNPP, San Lorenzo, Paraguay',
  registrationUrl: 'https://example.test/register?source=community',
  published: true, submitterEmail: 'private@example.test', ...overrides,
});

test('projects published event details and excludes private submission data', () => {
  const [visible] = projectPublishedCatalog([event(), event({ id: 'draft', published: false })]);
  assert.equal(visible.recordType, 'event');
  assert.equal(visible.registrationUrl, 'https://example.test/register?source=community');
  assert.equal(JSON.stringify(visible).includes('private@example.test'), false);
  assert.equal(Object.hasOwn(visible, 'published'), false);
  assert.equal(projectPublishedCatalog([event({ country: 'PY' })])[0].country, 'PY');
  const [usVenue] = projectPublishedCatalog([event({ country: 'AR', venueCountry: 'US', city: 'Boston' })]);
  assert.equal(usVenue.country, 'AR');
  assert.equal(usVenue.venueCountry, 'US', 'the venue country is public independently of the organizer country enum');
  const [placed] = projectPublishedCatalog([event({ city: 'San Lorenzo', communityId: 'meetup-123', sourceGroupId: 'internal-only' })]);
  assert.equal(placed.city, 'San Lorenzo');
  assert.equal(placed.communityId, 'meetup-123');
  assert.equal(Object.hasOwn(placed, 'sourceGroupId'), false);
});

test('projects a recording event link only when it is an approved content field', () => {
  const [recording] = projectPublishedCatalog([{
    id: 'recording', title: 'Grabación', url: 'https://example.test/video', description: 'Una charla',
    category: 'Otros', order: 1, featured: false, kind: 'content', format: 'Video',
    topics: ['Comunidad'], eventId: 'event-paraguay', published: true,
  }]);
  assert.equal(recording.eventId, 'event-paraguay');
  assert.throws(() => projectPublishedCatalog([{
    id: 'source', title: 'Canal', url: 'https://example.test/channel', description: '',
    category: 'Canal de YouTube', order: 1, featured: false, kind: 'source', format: 'Canal de YouTube',
    topics: [], eventId: 'event-paraguay', published: true,
  }]), /invalid eventId/);
});

test('rejects invalid event dates, zones, venues and registration links', () => {
  for (const changed of [
    { startsAt: '2026-02-30T08:00:00-03:00' },
    { endsAt: '2026-10-17T07:00:00-03:00' },
    { timeZone: 'Invalid/Zone' },
    { place: undefined },
    { registrationUrl: 'javascript:alert(1)' },
    { country: 'XX' },
    { city: '  San Lorenzo' },
    { city: 'Ciudad\nOtra' },
    { venueCountry: 'us' },
    { venueCountry: 'USA' },
    { communityId: 'bad id' },
    { mode: 'online', city: 'San Lorenzo' },
  ]) assert.throws(() => projectPublishedCatalog([event(changed)]));
});

test('shows a cross-posted session once while keeping different sessions', () => {
  const first = event({ id: 'event-manual', title: 'AWS en Acción', registrationUrl: 'https://www.meetup.com/aws-ug/events/123' });
  const sameUrl = event({ id: 'meetup-event-123', title: 'AWS en Acción', registrationUrl: 'https://www.meetup.com/aws-ug/events/123/?source=agenda' });
  const crossPost = event({ id: 'meetup-event-456', title: 'AWS en Acción', registrationUrl: 'https://www.meetup.com/other-ug/events/456/' });
  const later = event({ id: 'meetup-event-789', title: 'Otra charla', registrationUrl: 'https://www.meetup.com/other-ug/events/789/' });
  assert.deepEqual(uniqueUpcomingEvents([later, crossPost, sameUrl, first], '2026-10-01T00:00:00Z').map(({ id }) => id),
    ['event-manual', 'meetup-event-789']);
});

test('general grouping keeps past events and separates reused registration URLs by start', () => {
  assert.equal(typeof eventApi.uniqueEventGroups, 'function',
    'events.mjs must export uniqueEventGroups(events) for the public agenda');

  const past = event({
    id: 'event-past', title: 'Serie de talleres', startsAt: '2026-10-10T08:00:00Z', endsAt: '2026-10-10T10:00:00Z',
    registrationUrl: 'https://example.test/series/session?source=past', place: 'Auditorio',
  });
  const pastCohost = event({
    id: 'event-past-cohost', title: 'Serie de talleres', startsAt: '2026-10-10T08:00:00Z', endsAt: '2026-10-10T10:00:00Z',
    registrationUrl: 'https://cohost.test/series/session', place: 'auditorio', communityId: 'community-past-cohost',
  });
  const sameInstantAlias = event({
    id: 'event-past-url-alias', title: 'Tema con otro título', startsAt: '2026-10-10T05:00:00-03:00', endsAt: '2026-10-10T07:00:00-03:00',
    registrationUrl: 'https://example.test/series/session/?source=alternate-time', place: 'Auditorio',
  });
  const future = event({
    id: 'event-z-future', title: 'Serie de talleres', startsAt: '2026-10-20T08:00:00Z', endsAt: '2026-10-20T10:00:00Z',
    registrationUrl: 'https://example.test/series/session/?source=future', place: 'Auditorio',
  });
  const secondFuture = event({
    id: 'event-a-second-future', title: 'Serie de talleres', startsAt: '2026-10-27T08:00:00Z', endsAt: '2026-10-27T10:00:00Z',
    registrationUrl: 'https://example.test/series/session?source=second-future', place: 'Auditorio',
  });
  const rows = [secondFuture, sameInstantAlias, pastCohost, future, past];
  const before = structuredClone(rows);

  const groups = eventApi.uniqueEventGroups(rows);

  assert.deepEqual(rows, before, 'grouping must not reorder or mutate the input');
  assert.deepEqual(groups.map(({ event: representative }) => representative.id), [
    'event-past', 'event-z-future', 'event-a-second-future',
  ]);
  assert.deepEqual(groups.map(({ events: members }) => members.map(({ id }) => id).sort()), [
    ['event-past', 'event-past-cohost', 'event-past-url-alias'], ['event-z-future'], ['event-a-second-future'],
  ]);

  const upcoming = uniqueUpcomingEventGroups(rows, '2026-10-19T00:00:00Z');
  assert.deepEqual(upcoming.map(({ event: representative }) => representative.id), [
    'event-z-future', 'event-a-second-future',
  ], 'upcoming wrappers must remove ended members before they can become representatives');
  assert.deepEqual(uniqueUpcomingEvents(rows, '2026-10-19T00:00:00Z').map(({ id }) => id), [
    'event-z-future', 'event-a-second-future',
  ]);
});

test('merges registration and session identities when a listing bridges two groups', () => {
  const startsAt = '2026-10-20T08:00:00Z';
  const endsAt = '2026-10-20T18:00:00Z';
  const firstSession = event({
    id: 'a-session-title', title: 'Serverless AWS', mode: 'online', startsAt, endsAt,
    registrationUrl: 'https://example.test/register-a', communityId: 'community-a',
  });
  const secondRegistration = event({
    id: 'b-registration-title', title: 'Meetup', mode: 'online', startsAt, endsAt,
    registrationUrl: 'https://example.test/register-b', communityId: 'community-b',
  });
  const bridge = event({
    id: 'c-bridge', title: 'Serverless AWS', mode: 'online', startsAt, endsAt,
    registrationUrl: 'https://example.test/register-b?source=bridge', communityId: 'community-c',
  });
  const firstRegistrationAlias = event({
    id: 'd-registration-a-alias', title: 'Another listing title', mode: 'online', startsAt, endsAt,
    registrationUrl: 'https://example.test/register-a?source=alias', communityId: 'community-d',
  });
  const secondRegistrationAlias = event({
    id: 'e-registration-b-alias', title: 'Yet another listing title', mode: 'online', startsAt, endsAt,
    registrationUrl: 'https://example.test/register-b/?source=alias', communityId: 'community-e',
  });
  const reusedUrl = event({
    id: 'f-next-occurrence', title: 'Serverless AWS', mode: 'online',
    startsAt: '2026-10-27T08:00:00Z', endsAt: '2026-10-27T10:00:00Z',
    registrationUrl: 'https://example.test/register-a?source=next', communityId: 'community-f',
  });
  const unrelated = event({
    id: '0-unrelated', title: 'Another online session', mode: 'online', startsAt, endsAt,
    registrationUrl: 'https://example.test/unrelated', communityId: 'community-0',
  });
  const rows = [reusedUrl, secondRegistrationAlias, bridge, unrelated, firstRegistrationAlias,
    secondRegistration, firstSession];

  const groups = eventApi.uniqueEventGroups(rows);

  assert.deepEqual(groups.map(({ event: representative }) => representative.id), [
    '0-unrelated', 'a-session-title', 'f-next-occurrence',
  ], 'group order and representatives follow start instant then ID after a merge');
  assert.deepEqual(groups[1].events.map(({ id }) => id), [
    'a-session-title', 'b-registration-title', 'c-bridge', 'd-registration-a-alias', 'e-registration-b-alias',
  ], 'the bridge retains both groups and later lookups through either old registration identity');
  assert.deepEqual(groups[1].events.map(({ communityId }) => communityId), [
    'community-a', 'community-b', 'community-c', 'community-d', 'community-e',
  ], 'all co-host references survive the merge');
  assert.deepEqual(groups[2].events.map(({ id }) => id), ['f-next-occurrence'],
    'a canonical URL reused at another start remains a separate occurrence');
  assert.deepEqual(eventApi.uniqueEventGroups([...rows].reverse()).map(({ event: representative, events }) => [
    representative.id, events.map(({ id }) => id),
  ]), groups.map(({ event: representative, events }) => [representative.id, events.map(({ id }) => id)]),
  'representatives, member order and group order do not depend on catalog input order');

  const upcoming = uniqueUpcomingEventGroups(rows, '2026-10-19T00:00:00Z');
  assert.deepEqual(upcoming.map(({ event: representative }) => representative.id), [
    '0-unrelated', 'a-session-title', 'f-next-occurrence',
  ]);
  assert.deepEqual(uniqueUpcomingEvents(rows, '2026-10-19T00:00:00Z').map(({ id }) => id), [
    '0-unrelated', 'a-session-title', 'f-next-occurrence',
  ]);

  const endedBridge = { ...bridge, endsAt: '2026-10-20T10:00:00Z' };
  const beforeUpcomingGrouping = uniqueUpcomingEventGroups(
    [firstSession, secondRegistration, endedBridge], '2026-10-20T11:00:00Z',
  );
  assert.deepEqual(beforeUpcomingGrouping.map(({ event: representative, events: members }) => [
    representative.id, members.map(({ id }) => id),
  ]), [
    ['a-session-title', ['a-session-title']],
    ['b-registration-title', ['b-registration-title']],
  ], 'upcoming wrappers discard an ended bridge before grouping the remaining listings');
});

test('a bridge cannot use an unknown city or venue to join incompatible physical groups', () => {
  const startsAt = '2026-10-20T08:00:00Z';
  const endsAt = '2026-10-20T10:00:00Z';
  const cordoba = event({
    id: 'a-cordoba-session', title: 'Sesión presencial', country: 'AR', city: 'Córdoba',
    place: 'Centro de Convenciones', startsAt, endsAt, registrationUrl: 'https://example.test/cordoba',
  });
  const rosarioRegistration = event({
    id: 'b-rosario-registration', title: 'Meetup', country: 'AR', city: 'Rosario',
    place: 'Centro de Convenciones', startsAt, endsAt, registrationUrl: 'https://example.test/rosario',
  });
  const noCityBridge = event({
    id: 'c-no-city-bridge', title: 'Sesión presencial', country: 'AR', city: undefined,
    place: 'Centro de Convenciones', startsAt, endsAt,
    registrationUrl: 'https://example.test/rosario?source=bridge',
  });
  const cityConflict = eventApi.uniqueEventGroups([cordoba, rosarioRegistration, noCityBridge]);
  assert.deepEqual(cityConflict.map(({ events }) => events.map(({ id }) => id)), [
    ['a-cordoba-session'], ['b-rosario-registration', 'c-no-city-bridge'],
  ], 'the strong registration identity remains intact without letting the unknown city bridge Córdoba and Rosario');

  const venueRegistration = event({
    id: 'b-other-venue-registration', title: 'Meetup', country: 'AR', city: 'Córdoba',
    place: 'Universidad Nacional', startsAt, endsAt, registrationUrl: 'https://example.test/other-venue',
  });
  const venueBridge = event({
    id: 'c-venue-bridge', title: 'Sesión presencial', country: 'AR', city: 'Córdoba',
    place: 'Centro de Convenciones', startsAt, endsAt,
    registrationUrl: 'https://example.test/other-venue?source=bridge',
  });
  const venueConflict = eventApi.uniqueEventGroups([cordoba, venueRegistration, venueBridge]);
  assert.deepEqual(venueConflict.map(({ events }) => events.map(({ id }) => id)), [
    ['a-cordoba-session'], ['b-other-venue-registration', 'c-venue-bridge'],
  ], 'the bridge does not join separate physical venues even when city and title match');
});

test('agenda group selection filters members together and chooses a live matching representative', () => {
  assert.equal(typeof eventApi.uniqueEventGroups, 'function',
    'events.mjs must export uniqueEventGroups(events) before agenda groups can include history');

  const startsAt = '2026-10-17T08:00:00Z';
  const common = {
    title: 'Sesión coorganizada', startsAt, timeZone: 'UTC',
    registrationUrl: 'https://example.test/shared-session',
  };
  const members = [
    event({ ...common, id: 'a-ended-match', endsAt: '2026-10-17T12:00:00Z', mode: 'hybrid', country: 'CO', city: 'Cali', communityId: 'community-co' }),
    event({ ...common, id: 'a-route-only', endsAt: '2026-10-17T18:00:00Z', mode: 'hybrid', country: 'CO', city: 'Bogotá', communityId: 'community-other' }),
    event({ ...common, id: 'a-filter-only', endsAt: '2026-10-17T18:00:00Z', mode: 'in-person', country: 'AR', city: 'Cali', communityId: 'community-co' }),
    event({ ...common, id: 'z-live-match', endsAt: '2026-10-17T20:00:00Z', mode: 'hybrid', country: 'CO', city: 'Cali', communityId: 'community-co' }),
    event({ ...common, id: 'b-live-match', endsAt: '2026-10-17T19:00:00Z', mode: 'hybrid', country: 'CO', city: 'Cali', communityId: 'community-co' }),
  ];
  const groups = eventApi.uniqueEventGroups(members);
  const upcomingGroups = uniqueUpcomingEventGroups(members, '2026-10-17T13:00:00Z');
  assert.equal(upcomingGroups[0].event.id, 'a-filter-only',
    'upcoming wrappers filter ended co-hosts before choosing a representative');
  assert.deepEqual(upcomingGroups[0].events.map(({ id }) => id).sort(), [
    'a-filter-only', 'a-route-only', 'b-live-match', 'z-live-match',
  ]);
  const options = {
    communityById: new Map(),
    now: '2026-10-17T13:00:00Z',
    filters: {
      mode: 'hybrid', country: 'CO', city: 'CO:Cali', community: 'community-co',
    },
  };

  const withoutCompleteMember = [{ ...groups[0], events: members.slice(1, 3) }];
  assert.deepEqual(eventGroupsForAgenda(withoutCompleteMember, options), [],
    'country/mode from one member and city/community from another cannot satisfy one selection');

  const [selected] = eventGroupsForAgenda(groups, options);
  assert.equal(selected.event.id, 'b-live-match',
    'a matching non-ended member wins; ties use start then ID');
  assert.deepEqual(selected.events.map(({ id }) => id).sort(), members.map(({ id }) => id).sort(),
    'the card retains every co-host even when its displayed member is selected by filters');

  const afterLiveEnds = eventGroupsForAgenda(groups, { ...options, now: '2026-10-17T21:00:00Z' });
  assert.equal(afterLiveEnds[0].event.id, 'a-ended-match',
    'with ended events included, the deterministic matching representative remains available');
  assert.deepEqual(eventGroupsForAgenda(groups, { ...options, now: '2026-10-17T21:00:00Z', includeEnded: false }), [],
    'disabling ended events removes the group when no matching member remains active');
});

test('keeps separate physical sessions with the same title, start and organizer country', () => {
  const cordoba = event({
    id: 'event-cordoba', title: 'Taller presencial de AWS Lambda',
    organizer: 'AWS User Group Córdoba', country: 'AR', city: 'Córdoba',
    place: 'Centro de Convenciones Córdoba', communityId: 'community-cordoba',
    registrationUrl: 'https://www.meetup.com/awsug-cordoba/events/501/',
  });
  const rosario = event({
    id: 'event-rosario', title: 'Taller presencial de AWS Lambda',
    organizer: 'AWS User Group Rosario', country: 'AR', city: 'Rosario',
    place: 'Universidad Nacional de Rosario', communityId: 'community-rosario',
    registrationUrl: 'https://www.meetup.com/awsug-rosario/events/502/',
  });
  const cordobaAtAnotherVenue = event({
    id: 'event-cordoba-campus', title: 'Taller presencial de AWS Lambda',
    organizer: 'AWS User Group Córdoba', country: 'AR', city: 'Córdoba',
    place: 'Universidad Nacional de Córdoba', communityId: 'community-cordoba',
    registrationUrl: 'https://www.meetup.com/awsug-cordoba/events/503/',
  });
  const accepted = projectPublishedCatalog([cordoba, rosario, cordobaAtAnotherVenue]);
  const groups = uniqueUpcomingEventGroups(accepted, '2026-10-05T12:00:00Z');

  assert.equal(accepted.length, 3);
  assert.deepEqual(groups.map(({ event: representative }) => representative.id), [
    'event-cordoba', 'event-cordoba-campus', 'event-rosario',
  ]);
  assert.deepEqual(groups.map(({ events }) => events.length), [1, 1, 1]);
});

test('groups by effective physical country using community context in the general and upcoming wrappers', () => {
  const communityById = new Map([
    ['community-co', { country: 'CO', city: 'Bogotá' }],
  ]);
  const shared = {
    title: 'Sesión en el mismo auditorio', startsAt: '2026-10-20T08:00:00Z',
    endsAt: '2026-10-20T10:00:00Z', mode: 'in-person', place: 'Auditorio central',
  };
  const communityFallback = event({
    ...shared, id: 'a-community-fallback', country: undefined, city: undefined,
    communityId: 'community-co', registrationUrl: 'https://example.test/community-fallback',
  });
  const explicitVenue = event({
    ...shared, id: 'b-explicit-venue', country: 'AR', venueCountry: 'CO', city: 'Bogotá',
    registrationUrl: 'https://example.test/explicit-venue',
  });
  const otherPhysicalCountry = event({
    ...shared, id: 'c-other-physical-country', country: 'AR', city: 'Córdoba',
    registrationUrl: 'https://example.test/other-country',
  });
  const rows = [otherPhysicalCountry, explicitVenue, communityFallback];

  const groups = eventApi.uniqueEventGroups(rows, communityById);
  assert.deepEqual(groups.map(({ events }) => events.map(({ id }) => id)), [
    ['a-community-fallback', 'b-explicit-venue'], ['c-other-physical-country'],
  ]);
  assert.deepEqual(eventGroupCountries(groups[0], communityById), ['CO'],
    'location options use the venue country rather than a co-host organizer country');

  const upcomingGroups = uniqueUpcomingEventGroups(rows, '2026-10-19T00:00:00Z', communityById);
  assert.deepEqual(upcomingGroups.map(({ events }) => events.length), [2, 1]);
  assert.deepEqual(uniqueUpcomingEvents(rows, '2026-10-19T00:00:00Z', communityById)
    .map(({ id }) => id), ['a-community-fallback', 'c-other-physical-country']);
});

test('agenda mode and location filters select local physical and global remote attendance once', () => {
  const communityById = new Map();
  const start = '2026-10-20T08:00:00Z';
  const common = { startsAt: start, endsAt: '2026-10-20T10:00:00Z' };
  const rows = [
    event({ ...common, id: 'ar-physical', title: 'AR físico', mode: 'in-person', country: 'AR', city: 'Córdoba', registrationUrl: 'https://example.test/ar-physical' }),
    event({ ...common, id: 'ar-hybrid', title: 'AR híbrido', mode: 'hybrid', country: 'AR', city: 'Córdoba', registrationUrl: 'https://example.test/ar-hybrid' }),
    event({ ...common, id: 'co-physical-same-city-name', title: 'CO físico', mode: 'in-person', country: 'AR', venueCountry: 'CO', city: 'Córdoba', registrationUrl: 'https://example.test/co-physical' }),
    event({ ...common, id: 'co-hybrid', title: 'CO híbrido', mode: 'hybrid', country: 'AR', venueCountry: 'CO', city: 'Bogotá', registrationUrl: 'https://example.test/co-hybrid' }),
    event({ ...common, id: 'remote', title: 'Remoto', mode: 'online', country: 'CO', city: undefined, registrationUrl: 'https://example.test/remote' }),
    event({ ...common, id: 'ar-physical-other-city', title: 'AR otra ciudad', mode: 'in-person', country: 'AR', city: 'Rosario', registrationUrl: 'https://example.test/ar-other-city' }),
  ];
  const groups = eventApi.uniqueEventGroups(rows, communityById);
  const select = (filters, extra = {}) => eventGroupsForAgenda(groups, {
    communityById, now: '2026-10-19T00:00:00Z', filters, ...extra,
  }).map(({ event: representative }) => representative.id);

  assert.deepEqual(select({ mode: 'in-person', country: 'AR', city: 'AR:Córdoba' }), [
    'ar-hybrid', 'ar-physical',
  ], 'presencial selects local physical and hybrid attendance, disambiguated by country and city');
  assert.deepEqual(select({ mode: 'online', country: 'AR', city: 'AR:Córdoba' }), [
    'ar-hybrid', 'co-hybrid', 'remote',
  ], 'online includes remote and hybrid attendance globally, even when a location is retained');
  assert.deepEqual(select({ mode: '', country: 'AR', city: 'AR:Córdoba' }), [
    'ar-hybrid', 'ar-physical', 'co-hybrid', 'remote',
  ], 'the combined mode unions local physical with global remote possibilities without duplicating hybrids');
  assert.deepEqual(select({ mode: 'hybrid', country: 'AR', city: 'AR:Córdoba' }), [
    'ar-hybrid', 'co-hybrid',
  ], 'the legacy hybrid mode stays exclusive while retaining both hybrid attendance options');
  assert.equal(new Set(select({ mode: '', country: 'AR', city: 'AR:Córdoba' })).size, 4);

  assert.deepEqual(select(
    { mode: 'in-person', country: 'AR', city: 'AR:Córdoba' },
    { country: 'CO', modes: ['online'] },
  ), ['ar-hybrid', 'ar-physical'], 'selection is driven by explicit filters, not hidden route country or mode restrictions');
});

test('community selection and every other condition must match the same co-host member', () => {
  const members = [
    event({
      id: 'a-co-community-ar-venue', title: 'Sesión compartida', mode: 'in-person', country: 'CO',
      venueCountry: 'AR', city: 'Córdoba', communityId: 'community-co',
      startsAt: '2026-10-20T08:00:00Z', endsAt: '2026-10-20T10:00:00Z',
      registrationUrl: 'https://example.test/community-venue',
    }),
    event({
      id: 'b-ar-community-same-venue', title: 'Sesión compartida', mode: 'in-person', country: 'AR',
      venueCountry: 'AR', city: 'Córdoba', communityId: 'community-ar',
      startsAt: '2026-10-20T08:00:00Z', endsAt: '2026-10-20T10:00:00Z',
      registrationUrl: 'https://example.test/community-venue?source=cohost',
    }),
  ];
  const [group] = eventApi.uniqueEventGroups(members);
  const options = {
    now: '2026-10-19T00:00:00Z',
    filters: { mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: 'community-co' },
  };

  const [selected] = eventGroupsForAgenda([group], options);
  assert.equal(selected.event.id, 'a-co-community-ar-venue',
    'a Colombia community may host an event physically in Argentina and supply the matching representative');
  assert.deepEqual(selected.events.map(({ id }) => id), ['a-co-community-ar-venue', 'b-ar-community-same-venue'],
    'the displayed card retains every co-host listing');

  const falseMatch = [{ ...group, events: members.map((member) => ({ ...member })) }];
  falseMatch[0].events[0].venueCountry = 'CO';
  falseMatch[0].events[0].city = 'Bogotá';
  assert.deepEqual(eventGroupsForAgenda(falseMatch, options), [],
    'location on one member cannot combine with community on another member');
});

test('agenda selection excludes ended and out-of-period members independently', () => {
  const period = createEventAgendaPeriod({ view: 'week', date: '2026-10-17', timeZone: 'UTC' });
  const rows = [
    event({
      id: 'ended-inside-period', title: 'Finalizado dentro', mode: 'in-person', country: 'AR', city: 'Córdoba',
      startsAt: '2026-10-17T07:00:00Z', endsAt: '2026-10-17T08:00:00Z',
      registrationUrl: 'https://example.test/ended-inside-period',
    }),
    event({
      id: 'active-inside-period', title: 'Activo dentro', mode: 'in-person', country: 'AR', city: 'Córdoba',
      startsAt: '2026-10-17T09:00:00Z', endsAt: '2026-10-17T10:00:00Z',
      registrationUrl: 'https://example.test/active-inside-period',
    }),
    event({
      id: 'active-outside-period', title: 'Activo fuera', mode: 'in-person', country: 'AR', city: 'Córdoba',
      startsAt: '2026-10-19T00:00:00Z', endsAt: '2026-10-19T02:00:00Z',
      registrationUrl: 'https://example.test/active-outside-period',
    }),
  ];
  const groups = eventApi.uniqueEventGroups(rows);
  const options = {
    period, includeEnded: false, now: '2026-10-17T09:30:00Z',
    filters: { mode: '', country: 'AR', city: 'AR:Córdoba' },
  };

  assert.deepEqual(eventGroupsForAgenda(groups, options).map(({ event: representative }) => representative.id),
    ['active-inside-period']);
  assert.deepEqual(eventGroupsForAgenda(groups, { ...options, now: '2026-10-17T11:00:00Z' }), [],
    'once the in-period event ends, neither ended events nor an active event outside the period returns');
  assert.deepEqual(eventGroupsForAgenda(groups, { ...options, includeEnded: true, now: '2026-10-17T11:00:00Z' })
    .map(({ event: representative }) => representative.id), ['ended-inside-period', 'active-inside-period'],
  'including ended events does not widen the selected period');
});

test('groups cross-posts at the same physical venue across normalized text and optional city', () => {
  const cordoba = event({
    id: 'event-session-cordoba', title: 'Taller en Acción', country: 'AR', mode: 'in-person',
    organizer: 'AWS User Group Córdoba', city: 'Córdoba', place: 'Auditorio, Córdoba',
    communityId: 'community-cordoba', registrationUrl: 'https://example.test/cordoba-session',
  });
  const cohost = event({
    id: 'event-session-cohost', title: 'Taller en Acción', country: 'AR', mode: 'hybrid',
    organizer: 'Comunidad coanfitriona', city: 'Cordoba', place: 'auditorio cordoba',
    communityId: 'community-cohost', registrationUrl: 'https://example.test/cohost-session?source=community',
  });
  const cityNotPublished = event({
    id: 'z-event-session-city-unknown', title: 'Taller en Acción', country: 'AR',
    organizer: 'Otro coanfitrión', city: undefined, place: 'AUDITORIO, CÓRDOBA',
    communityId: 'community-city-unknown', registrationUrl: 'https://example.test/unknown-city-session',
  });
  const accepted = projectPublishedCatalog([cohost, cityNotPublished, cordoba]);
  const [group] = uniqueUpcomingEventGroups(accepted, '2026-10-05T12:00:00Z');

  assert.equal(accepted.length, 3);
  assert.equal(group.events.length, 3);
  assert.deepEqual(eventGroupCountries(group, new Map()), ['AR']);
  assert.equal(eventGroupsForAgenda([group], {
    communityById: new Map(), filters: { country: 'AR' },
  }).length, 1);
});

test('canonical registration URLs retain physical co-hosts across countries and query variants', () => {
  const argentinaListing = event({
    id: 'event-shared-ar', title: 'Sesión compartida', country: 'AR', city: 'Bogotá',
    place: 'Centro de Convenciones', registrationUrl: 'https://example.test/shared-session',
  });
  const colombiaListing = event({
    id: 'event-shared-co', title: 'Sesión compartida', country: 'CO', city: 'Bogotá',
    place: 'Centro de Convenciones', registrationUrl: 'https://example.test/shared-session/?source=cohost',
  });
  const [group] = uniqueUpcomingEventGroups(
    projectPublishedCatalog([argentinaListing, colombiaListing]), '2026-10-05T12:00:00Z',
  );

  assert.deepEqual(eventGroupCountries(group, new Map()).sort(), ['AR', 'CO']);
  assert.equal(eventGroupsForAgenda([group], {
    communityById: new Map(), filters: { country: 'CO' },
  }).length, 1);
});

test('keeps same-session cross-posts connected to every canonical registration URL', () => {
  const first = event({
    id: 'event-a-first', title: 'AWS en Acción', country: 'AR', city: 'Córdoba',
    place: 'Auditorio Córdoba', registrationUrl: 'https://www.meetup.com/group/events/501',
  });
  const crossPost = event({
    id: 'event-b-cross-post', title: 'AWS en Acción', country: 'AR', city: 'Cordoba',
    place: 'Auditorio, Córdoba', registrationUrl: 'https://www.meetup.com/other-group/events/501/',
  });
  const sameCanonicalUrl = event({
    id: 'event-c-same-url', title: 'AWS en Acción', country: 'AR', city: 'Rosario',
    place: 'Universidad Nacional de Rosario', registrationUrl: 'https://www.meetup.com/other-group/events/501/?source=agenda',
  });
  const groups = uniqueUpcomingEventGroups(
    projectPublishedCatalog([sameCanonicalUrl, crossPost, first]), '2026-10-05T12:00:00Z',
  );

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].events.map(({ id }) => id), [
    'event-a-first', 'event-b-cross-post', 'event-c-same-url',
  ]);
});

test('a canonical co-host from another country does not split the session alias', () => {
  const first = event({
    id: 'event-mixed-url-first', title: 'Sesión presencial', country: 'PY', venueCountry: 'PY', city: 'Asunción',
    place: 'Centro de Convenciones', registrationUrl: 'https://example.test/first',
  });
  const cohost = event({
    id: 'event-mixed-url-cohost', title: 'Sesión presencial', country: 'AR', venueCountry: 'PY', city: 'Asunción',
    place: 'Centro de Convenciones', registrationUrl: 'https://example.test/first?source=cohost',
  });
  const laterCrossPost = event({
    id: 'event-mixed-url-later', title: 'Sesión presencial', country: 'PY', venueCountry: 'PY', city: 'Asunción',
    place: 'Centro de Convenciones', registrationUrl: 'https://example.test/another',
  });
  const groups = uniqueUpcomingEventGroups(
    projectPublishedCatalog([first, cohost, laterCrossPost]), '2026-10-05T12:00:00Z',
  );

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].events.map(({ id }) => id), [
    'event-mixed-url-cohost', 'event-mixed-url-first', 'event-mixed-url-later',
  ]);
});

test('does not bridge physical listings from different cities through a listing without city', () => {
  const noCity = event({
    id: 'event-a-no-city', title: 'Sesión presencial', country: 'AR', city: undefined,
    place: 'Centro de Convenciones', registrationUrl: 'https://example.test/no-city',
  });
  const cordoba = event({
    id: 'event-b-cordoba', title: 'Sesión presencial', country: 'AR', city: 'Córdoba',
    place: 'Centro de Convenciones', registrationUrl: 'https://example.test/cordoba',
  });
  const rosario = event({
    id: 'event-c-rosario', title: 'Sesión presencial', country: 'AR', city: 'Rosario',
    place: 'Centro de Convenciones', registrationUrl: 'https://example.test/rosario',
  });
  const now = '2026-10-05T12:00:00Z';
  const firstOrder = uniqueUpcomingEventGroups(projectPublishedCatalog([noCity, cordoba, rosario]), now);
  const reversedOrder = uniqueUpcomingEventGroups(projectPublishedCatalog([rosario, cordoba, noCity]), now);
  const visibleGroups = (groups) => groups.map(({ events }) => events.map(({ id }) => id).sort()).sort();

  assert.equal(firstOrder.length, 2);
  assert.deepEqual(visibleGroups(firstOrder), visibleGroups(reversedOrder));
  assert.ok(firstOrder.every(({ events }) =>
    !(events.some(({ city }) => city === 'Córdoba') && events.some(({ city }) => city === 'Rosario'))));
});

test('retains every co-host community when the agenda shows one event card', () => {
  const first = event({ id: 'event-community-a', communityId: 'community-a' });
  const crossPost = event({
    id: 'event-community-b', communityId: 'community-b',
    registrationUrl: 'https://example.test/other-community-registration',
  });
  const [group] = uniqueUpcomingEventGroups([crossPost, first], '2026-10-01T00:00:00Z');

  assert.equal(group.event.id, 'event-community-a');
  assert.deepEqual(group.events.map(({ communityId }) => communityId), ['community-a', 'community-b']);
  assert.deepEqual(uniqueUpcomingEvents([crossPost, first], '2026-10-01T00:00:00Z').map(({ id }) => id), ['event-community-a']);
  const card = { endsAt: group.event.endsAt, communities: group.events.map(({ communityId }) => communityId) };
  const filters = { from: '', to: '', mode: '', country: '', city: '', community: 'community-b' };
  assert.equal(eventMatchesFilters(card, filters, Date.parse('2026-10-01T00:00:00Z')), true);
});

test('sorts upcoming events by start and removes them after their end instant', () => {
  const first = event({ id: 'first' });
  const next = event({ id: 'next', startsAt: '2026-10-18T08:00:00-03:00', endsAt: '2026-10-18T18:00:00-03:00' });
  assert.deepEqual(upcomingEvents([next, first], '2026-10-17T11:00:00Z').map(({ id }) => id), ['first', 'next']);
  assert.deepEqual(upcomingEvents([next, first], '2026-10-17T21:00:00Z').map(({ id }) => id), ['next']);
});

test('formats the same instant in the event zone and another visitor zone', () => {
  assert.match(eventDateLabel('2026-10-17T08:00:00-03:00', 'America/Asuncion'), /17 de octubre de 2026/);
  assert.match(eventTimeLabel('2026-10-17T08:00:00-03:00', 'America/Asuncion'), /08:00/);
  assert.match(eventTimeLabel('2026-10-17T08:00:00-03:00', 'America/Mexico_City'), /05:00/);
  assert.equal(eventLocalDate('2026-10-17T00:30:00Z', 'America/Mexico_City'), '2026-10-16');
});

test('labels event end dates only when their local calendar date differs', () => {
  assert.equal(eventEndTimeLabel('2026-10-20T08:00:00Z', '2026-10-20T12:00:00Z', 'UTC'), '12:00 UTC');
  assert.equal(eventEndTimeLabel('2026-10-31T23:00:00Z', '2026-11-01T00:30:00Z', 'UTC'),
    '1 de noviembre de 2026 · 00:30 UTC');
  assert.equal(eventEndTimeLabel('2026-12-31T23:30:00-03:00', '2027-01-01T00:30:00-03:00', 'America/Argentina/Cordoba'),
    '1 de enero de 2027 · 00:30 GMT-3');
});

test('hourly publication hash changes at event expiry without a catalog edit', () => {
  const records = projectPublishedCatalog([event()]);
  const before = fingerprintPublicCatalog(records, '2026-10-17T20:59:59Z');
  assert.equal(fingerprintPublicCatalog(records, '2026-10-17T11:00:00Z'), before);
  assert.notEqual(fingerprintPublicCatalog(records, '2026-10-17T21:00:00Z'), before);
  assert.equal(fingerprintPublicCatalog(records, '2026-10-18T00:00:00Z'), fingerprintPublicCatalog(records, '2026-10-17T21:00:00Z'));
});

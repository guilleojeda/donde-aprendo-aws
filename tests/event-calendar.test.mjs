import assert from 'node:assert/strict';
import test from 'node:test';
import { eventCalendar } from '../src/lib/event-calendar.mjs';
import { trackRegistrationClick } from '../src/lib/event-analytics.mjs';
import { eventCalendarHref } from '../src/lib/catalog-routes.mjs';
import {
  eventMatchesFilters,
  parseEventAgendaSearch,
  secondaryEventAgendaFilterCount,
  serializeEventAgendaSearch,
  shouldOpenEventAgendaSecondaryFilters,
} from '../src/lib/event-agenda-filter.mjs';

const event = {
  id: 'meetup-event-456', title: 'AWS, seguridad; práctica',
  description: 'Primera línea\nSegunda línea con Bogotá y práctica '.repeat(3),
  startsAt: '2026-10-17T08:00:00-03:00', endsAt: '2026-10-17T10:00:00-03:00',
  mode: 'in-person', place: 'Auditorio, Bogotá',
  registrationUrl: 'https://www.meetup.com/aws-bogota/events/456/?source=agenda',
};

test('calendar download preserves the event instants, URL and escaped UTF-8 text', () => {
  const ics = eventCalendar(event, new Date('2026-09-29T12:00:00Z'));
  assert.equal(eventCalendarHref(event), '/eventos/meetup-event-456.ics');
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/u);
  assert.match(ics, /DTSTART:20261017T110000Z\r\nDTEND:20261017T130000Z/u);
  assert.match(ics, /UID:meetup-event-456@dondeaprendoaws\.com/u);
  assert.match(ics, /SUMMARY:AWS\\, seguridad\\; práctica/u);
  assert.match(ics, /URL:https:\/\/www\.meetup\.com\/aws-bogota\/events\/456\/\?source=agenda/u);
  assert.match(ics, /LOCATION:Auditorio\\, Bogotá/u);
  assert.ok(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.doesNotMatch(ics, /Primera línea\r\nSegunda/u, 'Text line breaks must be escaped.');
  assert.doesNotMatch(eventCalendar({ ...event, mode: 'online', place: undefined }), /LOCATION:/u);
});

test('agenda filters apply route defaults only when a query field is absent', () => {
  const allowed = {
    mode: new Set(['', 'online', 'in-person', 'hybrid']),
    country: new Set(['', 'CO', 'AR', 'PE']),
    city: new Set(['', 'CO:Bogotá', 'AR:Córdoba']),
    community: new Set(['', 'community-co', 'community-ar', 'community-pe']),
  };
  const defaults = { country: 'AR', mode: 'online' };
  const filters = parseEventAgendaSearch('?utm_source=community&view=month&date=2026-10-17&tz=UTC&from=2026-10-17&to=2026-10-20&mode=in-person&country=CO&city=CO%3ABogot%C3%A1&community=community-co', allowed, defaults);
  assert.deepEqual(filters, { mode: 'in-person', country: 'CO', city: 'CO:Bogotá', community: 'community-co' });
  const saved = serializeEventAgendaSearch(
    '?utm_source=community&country=AR&view=month&date=2026-10-17&tz=UTC&from=2026-10-17&to=2026-10-20&includeEnded=0', filters, defaults,
  );
  assert.equal(new URLSearchParams(saved).get('utm_source'), 'community');
  assert.equal(new URLSearchParams(saved).get('community'), 'community-co');
  assert.equal(new URLSearchParams(saved).get('view'), 'month');
  assert.equal(new URLSearchParams(saved).get('date'), '2026-10-17');
  assert.equal(new URLSearchParams(saved).get('tz'), 'UTC');
  assert.equal(new URLSearchParams(saved).has('from'), false);
  assert.equal(new URLSearchParams(saved).has('to'), false);
  assert.equal(new URLSearchParams(saved).has('includeEnded'), false);
  assert.deepEqual(parseEventAgendaSearch(`?${saved}`, allowed, defaults), filters);

  const explicitEmpty = serializeEventAgendaSearch('?view=week&date=2026-10-19&tz=UTC', {
    mode: '', country: '', city: '', community: '',
  }, defaults);
  const explicitEmptyQuery = new URLSearchParams(explicitEmpty);
  assert.equal(explicitEmptyQuery.has('mode'), true);
  assert.equal(explicitEmptyQuery.get('mode'), '', 'mode= overrides the route modality');
  assert.equal(explicitEmptyQuery.has('country'), true);
  assert.equal(explicitEmptyQuery.get('country'), '', 'country= overrides the route country');
  assert.deepEqual(parseEventAgendaSearch(`?${explicitEmpty}`, allowed, defaults), {
    mode: '', country: '', city: '', community: '',
  });

  const routeDefaults = serializeEventAgendaSearch('', {
    mode: 'online', country: 'AR', city: '', community: '',
  }, defaults);
  assert.equal(new URLSearchParams(routeDefaults).has('mode'), false,
    'a selected value equal to the route default can stay implicit');
  assert.equal(new URLSearchParams(routeDefaults).has('country'), false);
  assert.deepEqual(parseEventAgendaSearch(`?${routeDefaults}`, allowed, defaults), {
    mode: 'online', country: 'AR', city: '', community: '',
  });
});

test('agenda filter values validate public identities and location formats independently', () => {
  const allowed = {
    mode: new Set(['', 'online', 'in-person', 'hybrid']),
    country: new Set(['', 'CO', 'AR', 'PE']),
    // This is only the current resource catalog; a valid city need not appear in it.
    city: new Set(['', 'CO:Bogotá', 'AR:Córdoba']),
    community: new Set(['', 'community-co', 'community-ar', 'community-pe']),
  };

  assert.deepEqual(parseEventAgendaSearch('?from=2026-02-30&mode=unknown&country=AR&city=CO%3ABogot%C3%A1&community=unknown', allowed),
    { mode: '', country: 'AR', city: '', community: '' },
    'legacy date parameters do not become facet filters');
  assert.deepEqual(parseEventAgendaSearch('?mode=hybrid', allowed), {
    mode: 'hybrid', country: '', city: '', community: '',
  }, 'the legacy hybrid-only query remains readable');
  assert.deepEqual(parseEventAgendaSearch('?country=AR&community=community-co', allowed), {
    mode: '', country: 'AR', city: '', community: 'community-co',
  }, 'a community identity remains valid independently of its physical country');
  assert.deepEqual(parseEventAgendaSearch('?city=PE%3ALima', allowed), {
    mode: '', country: '', city: 'PE:Lima', community: '',
  }, 'a well-formed city remains selectable even when absent from the resource catalog');
  assert.deepEqual(parseEventAgendaSearch('?country=AR&city=PE%3ALima', allowed), {
    mode: '', country: 'AR', city: '', community: '',
  }, 'an explicitly selected country clears an incompatible city');

  const longCity = `AR:${'a'.repeat(100)}`;
  assert.equal(parseEventAgendaSearch(`?city=${encodeURIComponent(longCity)}`, allowed).city, longCity,
    'a city may contain up to 100 text characters after its country prefix');
  for (const city of [
    'ar:cordoba', 'ARG:Córdoba', 'AR:', 'Córdoba', ':Córdoba',
    `AR:${'a'.repeat(101)}`, 'AR:Cor\ndoba', 'AR:San\tJuan', 'AR:\u0000',
  ]) {
    assert.equal(parseEventAgendaSearch(`?city=${encodeURIComponent(city)}`, allowed).city, '',
      `malformed city ${JSON.stringify(city)} is discarded`);
  }
  assert.deepEqual(parseEventAgendaSearch('?mode=unknown&country=ar&city=AR%3AC%C3%B3rdoba', allowed, {
    country: 'CO', mode: 'online',
  }), { mode: 'online', country: 'CO', city: '', community: '' },
  'malformed or unknown values fall back to route defaults and clear incompatible cities');
});

test('online and combined selections treat location as a physical filter only', () => {
  const now = Date.parse('2026-10-17T11:00:00Z');
  const filters = { mode: '', country: 'AR', city: 'AR:Córdoba', community: '' };
  const remote = {
    endsAt: event.endsAt, mode: 'online', country: 'CO', city: '', communities: ['community-co'],
  };
  const hybridAbroad = {
    endsAt: event.endsAt, mode: 'hybrid', country: 'CO', city: 'CO:Bogotá', communities: ['community-co'],
  };
  const inPersonAbroad = {
    endsAt: event.endsAt, mode: 'in-person', country: 'CO', city: 'CO:Bogotá', communities: ['community-co'],
  };
  const hybridLocal = {
    endsAt: event.endsAt, mode: 'hybrid', country: 'AR', city: 'AR:Córdoba', communities: ['community-co'],
  };

  assert.equal(eventMatchesFilters(remote, filters, now), true,
    'combined mode includes online events from any country despite a physical location selection');
  assert.equal(eventMatchesFilters(hybridAbroad, filters, now), true,
    'combined mode includes an out-of-location hybrid through its remote participation');
  assert.equal(eventMatchesFilters(inPersonAbroad, filters, now), false,
    'combined mode excludes an in-person event outside the selected physical location');
  assert.equal(eventMatchesFilters(hybridAbroad, { ...filters, mode: 'online' }, now), true,
    'online mode includes hybrids globally and ignores the retained location');
  assert.equal(eventMatchesFilters(inPersonAbroad, { ...filters, mode: 'online' }, now), false);
  assert.equal(eventMatchesFilters(hybridAbroad, { ...filters, mode: 'in-person' }, now), false,
    'in-person mode requires the hybrid venue to match the selected location');
  assert.equal(eventMatchesFilters(hybridLocal, { ...filters, community: 'community-co' }, now), true,
    'physical location and community identity are independent facets');
  assert.equal(eventMatchesFilters(hybridLocal, { ...filters, mode: 'hybrid', community: '' }, now), true,
    'the legacy hybrid-only query keeps selecting hybrid events');
});

test('ended events are included only when requested, with the end instant treated as finalizado', () => {
  const ended = {
    endsAt: '2026-10-17T10:00:00Z', localDate: '2026-10-17', mode: 'online',
    country: 'CO', city: '', communities: ['community-co'],
  };
  const filters = { mode: '', country: '', city: '', community: '' };
  const afterEnd = Date.parse('2026-10-17T10:00:00.001Z');
  const atEnd = Date.parse(ended.endsAt);

  assert.equal(eventMatchesFilters(ended, filters, afterEnd), false,
    'the existing default still selects only events that have not ended');
  assert.equal(eventMatchesFilters(ended, filters, afterEnd, false), false);
  assert.equal(eventMatchesFilters(ended, filters, afterEnd, true), true,
    'the agenda can include a published event after its end');
  assert.equal(eventMatchesFilters(ended, filters, atEnd, true), true,
    'endsAt equal to now is already finalizado but remains visible when selected');
  assert.equal(eventMatchesFilters(ended, filters, atEnd, false), false);
});

test('secondary agenda filters open for community selections, not primary location controls', () => {
  const allowed = {
    mode: new Set(['', 'online', 'in-person']),
    country: new Set(['', 'CO']),
    city: new Set(['', 'CO:Bogotá']),
    community: new Set(['', 'community-co']),
  };
  const datesOnly = parseEventAgendaSearch('?from=2026-10-17&to=2026-10-20', allowed);
  assert.equal(secondaryEventAgendaFilterCount(datesOnly), 0);
  assert.equal(shouldOpenEventAgendaSecondaryFilters(datesOnly, true), false);
  assert.equal(shouldOpenEventAgendaSecondaryFilters(datesOnly, false), true);

  const active = parseEventAgendaSearch(
    '?mode=in-person&country=CO&city=CO%3ABogot%C3%A1&community=community-co', allowed,
  );
  assert.equal(secondaryEventAgendaFilterCount(active), 1,
    'only the community facet contributes to the secondary-filter count');
  assert.equal(shouldOpenEventAgendaSecondaryFilters(active, true), true);

  const primaryOnly = parseEventAgendaSearch('?mode=in-person&country=CO&city=CO%3ABogot%C3%A1', allowed);
  assert.equal(secondaryEventAgendaFilterCount(primaryOnly), 0,
    'mode and physical location stay outside the secondary filters');
  assert.equal(shouldOpenEventAgendaSecondaryFilters(primaryOnly, true), false);
  assert.equal(shouldOpenEventAgendaSecondaryFilters(primaryOnly, false), true,
    'the disclosure remains open by default on desktop');
});

test('registration telemetry uses only public facets and stays off preview hosts', () => {
  const calls = [];
  const context = { location: { hostname: 'main.d33kh9d3cyassq.amplifyapp.com' }, gtag: (...args) => calls.push(args) };
  const selected = { id: 'meetup-event-456', mode: 'in-person', country: 'CO', registrationUrl: 'https://example.test/private-url' };
  trackRegistrationClick(context, selected);
  assert.equal(calls.length, 0);
  context.location.hostname = 'dondeaprendoaws.com';
  trackRegistrationClick(context, selected);
  assert.deepEqual(calls, [['event', 'event_registration_click', {
    event_id: 'meetup-event-456', event_mode: 'in-person', event_country: 'CO',
  }]]);
  assert.equal(JSON.stringify(calls).includes('private-url'), false);
});

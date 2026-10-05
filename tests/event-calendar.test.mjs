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

test('agenda filters validate URL values, preserve unrelated parameters and match date, mode and city', () => {
  const allowed = {
    mode: new Set(['', 'online', 'in-person']),
    country: new Set(['', 'CO', 'AR']),
    city: new Set(['', 'CO:Bogotá', 'AR:Córdoba']),
    community: new Set(['', 'community-co', 'community-ar']),
  };
  const filters = parseEventAgendaSearch('?utm_source=community&from=2026-10-17&to=2026-10-20&mode=in-person&country=CO&city=CO%3ABogot%C3%A1&community=community-co', allowed);
  assert.deepEqual(filters, { from: '2026-10-17', to: '2026-10-20', mode: 'in-person', country: 'CO', city: 'CO:Bogotá', community: 'community-co' });
  const saved = serializeEventAgendaSearch('?utm_source=community&country=AR', filters);
  assert.equal(new URLSearchParams(saved).get('utm_source'), 'community');
  assert.equal(new URLSearchParams(saved).get('community'), 'community-co');
  assert.deepEqual(parseEventAgendaSearch(`?${saved}`, allowed), filters);
  assert.deepEqual(parseEventAgendaSearch('?from=2026-02-30&mode=unknown&country=AR&city=CO%3ABogot%C3%A1&community=unknown', allowed),
    { from: '', to: '', mode: '', country: 'AR', city: '', community: '' });
  const cohostCityAllowed = {
    ...allowed,
    city: new Set([...allowed.city, 'PE:Lima']),
    countriesForCity: new Map([['PE:Lima', new Set(['PE', 'CO'])]]),
  };
  assert.deepEqual(parseEventAgendaSearch('?country=CO&city=PE%3ALima', cohostCityAllowed), {
    from: '', to: '', mode: '', country: 'CO', city: 'PE:Lima', community: '',
  }, 'The representative city remains valid for an event co-hosted by Colombia.');
  assert.deepEqual(parseEventAgendaSearch('?country=AR&city=PE%3ALima', cohostCityAllowed), {
    from: '', to: '', mode: '', country: 'AR', city: '', community: '',
  }, 'A city from an incompatible country is cleared.');
  const card = { endsAt: event.endsAt, localDate: '2026-10-17', mode: 'in-person', country: 'CO', city: 'CO:Bogotá', communities: ['community-co', 'community-ar'] };
  assert.equal(eventMatchesFilters(card, filters, Date.parse('2026-10-17T11:00:00Z')), true);
  assert.equal(eventMatchesFilters(card, { ...filters, from: '2026-10-18' }, Date.parse('2026-10-17T11:00:00Z')), false);
  assert.equal(eventMatchesFilters(card, { ...filters, community: 'community-ar' }, Date.parse('2026-10-17T11:00:00Z')), true);
  assert.equal(eventMatchesFilters(card, { ...filters, community: 'other-community' }, Date.parse('2026-10-17T11:00:00Z')), false);
  const cohostedCard = { ...card, country: 'PE', countries: ['PE', 'CO'] };
  assert.equal(eventMatchesFilters(cohostedCard, { ...filters, country: 'CO' }, Date.parse('2026-10-17T11:00:00Z')), true,
    'The global country filter includes co-host countries while retaining one representative card.');
  assert.equal(eventMatchesFilters(cohostedCard, { ...filters, country: 'AR' }, Date.parse('2026-10-17T11:00:00Z')), false);
  assert.equal(eventMatchesFilters(card, filters, Date.parse('2026-10-17T13:00:00Z')), false);
});

test('mobile secondary agenda filters open for active URL filters and stay compact otherwise', () => {
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
  assert.equal(secondaryEventAgendaFilterCount(active), 4);
  assert.equal(shouldOpenEventAgendaSecondaryFilters(active, true), true);
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

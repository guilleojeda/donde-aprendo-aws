import assert from 'node:assert/strict';
import test from 'node:test';
import { eventGroupsForAgenda } from '../src/lib/event-agenda-groups.mjs';
import { buildEventAgendaShare } from '../src/lib/event-agenda-share.mjs';
import { createEventAgendaPeriod } from '../src/lib/event-agenda-period.mjs';

const sourceUrl = 'https://dondeaprendoaws.com/eventos/?legacy=discard#eventos';
const now = Date.parse('2026-10-21T12:00:00.000Z');

function event(id, overrides = {}) {
  return {
    recordType: 'event', id, title: `Evento ${id}`,
    startsAt: '2027-10-20T13:00:00.000Z', endsAt: '2027-10-20T14:00:00.000Z',
    timeZone: 'UTC', organizer: 'Comunidad AWS', mode: 'online',
    registrationUrl: `https://example.test/registro/${id}`,
    ...overrides,
  };
}

function share(period, selectedEvent, filters = { mode: 'online', country: '', city: '', community: '' }, communityById = new Map()) {
  return buildEventAgendaShare({
    selection: [{ event: selectedEvent, events: [selectedEvent] }],
    period, filters, communityById, url: sourceUrl, now,
  });
}

function post(href) {
  return new URL(href).searchParams.get('text');
}

test('adds the year when a same-year week is outside the supplied reference year', () => {
  const period = createEventAgendaPeriod({
    view: 'week', date: '2027-10-18', timeZone: 'America/Argentina/Cordoba',
  });
  const result = share(period, event('future-year'));

  assert.match(result.text, /\*Agenda eventos AWS, 18-24 de octubre de 2027\*/u);
  assert.match(post(result.linkedInHref), /del 18 al 24 de octubre de 2027/u);
  assert.match(post(result.xHref), /18-24 de octubre de 2027/u);
});

test('uses the readable Córdoba label for its Intl-recognized timezone alias', () => {
  const period = createEventAgendaPeriod({
    view: 'week', date: '2026-10-19', timeZone: 'America/Cordoba',
  });
  const result = share(period, event('cordoba-alias', {
    startsAt: '2026-10-21T13:00:00.000Z', endsAt: '2026-10-21T14:00:00.000Z',
  }));

  assert.match(result.text, /Horarios de Córdoba, Argentina \(UTC-3\)\./u);
  assert.match(post(result.linkedInHref), /Horarios de Córdoba, Argentina \(UTC-3\)\./u);
  assert.equal(new URL(result.url).searchParams.get('tz'), 'America/Cordoba');
});

test('shortening an X city does not interpret replacement-string metacharacters', () => {
  const city = `Foo$&${'界'.repeat(95)}`;
  const filters = { mode: 'in-person', country: 'AR', city: `AR:${city}`, community: '' };
  const selectedEvent = event('replacement-city', {
    mode: 'in-person', country: 'AR', venueCountry: 'AR', city,
    startsAt: '2026-10-21T13:00:00.000Z', endsAt: '2026-10-21T14:00:00.000Z',
  });
  const result = share(createEventAgendaPeriod({
    view: 'week', date: '2026-10-19', timeZone: 'America/Argentina/Cordoba',
  }), selectedEvent, filters);
  const x = post(result.xHref);

  assert.ok(x.includes('Foo$&'), 'the shortened city keeps its literal prefix');
  assert.ok(x.includes('…'), 'the city is abbreviated visibly');
  assert.ok(!x.includes(city), 'the over-limit city is not expanded back into the X body');
  assert.equal(new URL(result.url).searchParams.get('city'), filters.city);
});

test('keeps selected community titles literal while composing Copy headers', () => {
  const communityId = 'community-literal';
  const community = { id: communityId, title: 'AWS $& Comunidad', country: 'AR', city: 'Córdoba' };
  const filters = { mode: 'online', country: '', city: '', community: communityId };
  const result = share(
    createEventAgendaPeriod({ view: 'week', date: '2026-10-19', timeZone: 'UTC' }),
    event('literal-community', { startsAt: '2026-10-21T13:00:00.000Z', endsAt: '2026-10-21T14:00:00.000Z' }),
    filters,
    new Map([[communityId, community]]),
  );

  assert.equal(result.text.split(community.title).length - 1, 1);
  assert.match(result.text, /Comunidad: AWS \$& Comunidad/u);
});

test('uses singular grammar for one-result X and LinkedIn summaries', () => {
  const period = createEventAgendaPeriod({
    view: 'week', date: '2026-10-19', timeZone: 'America/Argentina/Cordoba',
  });
  const physicalFilters = { mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: '' };
  const physical = share(period, event('one-physical', {
    mode: 'in-person', country: 'AR', venueCountry: 'AR', city: 'Córdoba',
    startsAt: '2026-10-21T13:00:00.000Z', endsAt: '2026-10-21T14:00:00.000Z',
  }), physicalFilters);
  const physicalX = post(physical.xHref);
  assert.match(physicalX, /1 evento presencial en Córdoba, Argentina/u);
  assert.doesNotMatch(physicalX, /1 eventos? presenciales/u);

  const hybridFilters = { mode: 'hybrid', country: 'AR', city: 'AR:Córdoba', community: '' };
  const hybrid = share(period, event('one-hybrid', {
    mode: 'hybrid', country: 'AR', venueCountry: 'AR', city: 'Córdoba',
    startsAt: '2026-10-21T13:00:00.000Z', endsAt: '2026-10-21T14:00:00.000Z',
  }), hybridFilters);
  assert.match(post(hybrid.xHref), /1 evento híbrido, presencial en Córdoba, Argentina, y online/u);

  const oversized = share(period, event('one-linkedin', {
    title: 'Título largo '.repeat(400), mode: 'in-person', country: 'AR', venueCountry: 'AR', city: 'Córdoba',
    startsAt: '2026-10-21T13:00:00.000Z', endsAt: '2026-10-21T14:00:00.000Z',
  }), physicalFilters);
  const linkedIn = post(oversized.linkedInHref);
  assert.match(linkedIn, /1 evento presencial en Córdoba, Argentina/u);
  assert.doesNotMatch(linkedIn, /1 evento presenciales/u);

  const hybridOne = event('two-hybrid-one', {
    title: 'Primer híbrido '.repeat(220), mode: 'hybrid', country: 'AR', venueCountry: 'AR', city: 'Córdoba',
    startsAt: '2026-10-21T13:00:00.000Z', endsAt: '2026-10-21T14:00:00.000Z',
  });
  const hybridTwo = event('two-hybrid-two', {
    title: 'Segundo híbrido '.repeat(220), mode: 'hybrid', country: 'AR', venueCountry: 'AR', city: 'Córdoba',
    startsAt: '2026-10-21T15:00:00.000Z', endsAt: '2026-10-21T16:00:00.000Z',
  });
  const hybridOverflow = buildEventAgendaShare({
    selection: [hybridOne, hybridTwo].map((selectedEvent) => ({ event: selectedEvent, events: [selectedEvent] })),
    period, filters: hybridFilters, url: sourceUrl, now,
  });
  const hybridLinkedIn = post(hybridOverflow.linkedInHref);
  assert.match(hybridLinkedIn, /2 eventos híbridos, presenciales en Córdoba, Argentina, y opciones online/u);
  assert.doesNotMatch(hybridLinkedIn, /2 eventos eventos/u);
});

test('describes legacy hybrid mode as local physical access plus global online access', () => {
  const period = createEventAgendaPeriod({
    view: 'week', date: '2026-10-19', timeZone: 'America/Argentina/Cordoba',
  });
  const filters = { mode: 'hybrid', country: 'AR', city: 'AR:Córdoba', community: '' };
  const local = event('legacy-local', {
    title: 'Híbrido local', mode: 'hybrid', country: 'AR', venueCountry: 'AR', city: 'Córdoba',
    place: 'Centro Córdoba', startsAt: '2026-10-21T13:00:00.000Z', endsAt: '2026-10-21T14:00:00.000Z',
  });
  const foreign = event('legacy-foreign', {
    title: 'Híbrido remoto Colombia', mode: 'hybrid', country: 'CO', venueCountry: 'CO', city: 'Bogotá',
    place: 'Centro Bogotá', startsAt: '2026-10-22T13:00:00.000Z', endsAt: '2026-10-22T14:00:00.000Z',
  });
  const selection = eventGroupsForAgenda(
    [local, foreign].map((selectedEvent) => ({ event: selectedEvent, events: [selectedEvent] })),
    { filters, period, includeEnded: true, now },
  );
  assert.deepEqual(selection.map(({ event: selectedEvent }) => selectedEvent.id), ['legacy-local', 'legacy-foreign']);
  const result = buildEventAgendaShare({ selection, period, filters, url: sourceUrl, now });

  assert.match(result.text, /Híbridos, presenciales en Córdoba, Argentina, y online\./u);
  assert.match(post(result.linkedInHref), /Híbridos, presenciales en Córdoba, Argentina, y opciones online\./u);
  assert.match(post(result.xHref), /2 eventos híbridos, presenciales en Córdoba, Argentina, y online\./u);
  assert.match(post(result.linkedInHref), /Híbrido remoto Colombia - Online \(evento híbrido\)/u);
});

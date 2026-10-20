import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEventAgendaShare } from '../src/lib/event-agenda-share.mjs';
import { createEventAgendaPeriod } from '../src/lib/event-agenda-period.mjs';

const period = createEventAgendaPeriod({
  view: 'week',
  date: '2026-10-21',
  timeZone: 'America/Argentina/Cordoba',
});

function makeEvent(id, overrides = {}) {
  return {
    recordType: 'event',
    id,
    title: `Encuentro ${id}`,
    description: '',
    startsAt: '2026-10-21T13:00:00.000Z',
    endsAt: '2026-10-21T14:00:00.000Z',
    timeZone: 'UTC',
    organizer: 'Comunidad AWS',
    mode: 'hybrid',
    place: 'Centro comunitario',
    registrationUrl: `https://example.test/eventos/${id}`,
    ...overrides,
  };
}

function share(event, { filters, communityById = new Map() }) {
  return buildEventAgendaShare({
    selection: [{ event, events: [event] }],
    period,
    filters,
    communityById,
    url: 'https://example.test/eventos/?utm_source=implementation-test#agenda',
    now: Date.parse('2026-10-01T00:00:00.000Z'),
  });
}

test('an in-person hybrid uses physical participation and its effective event venue without location filters', () => {
  const community = { id: 'community-co', country: 'CO', city: 'Bogotá', title: 'AWS Bogotá' };
  const event = makeEvent('hybrid-in-person', {
    communityId: community.id,
    country: undefined,
    venueCountry: undefined,
    city: undefined,
  });
  const result = share(event, {
    filters: { mode: 'in-person', country: '', city: '', community: '' },
    communityById: new Map([[community.id, community]]),
  });
  const eventBlock = result.text.slice(result.text.indexOf(event.title));

  assert.match(eventBlock, /Asistencia: Participación presencial/u);
  assert.match(eventBlock, /Ubicación presencial: Bogotá, Colombia/u);
  assert.doesNotMatch(eventBlock, /presencial y remota/iu);
});

test('remote hybrid and online-only selections do not present a physical venue as attendance', () => {
  const remoteHybrid = makeEvent('remote-hybrid', {
    country: 'CO', venueCountry: 'CO', city: 'Bogotá', place: 'Centro AWS Bogotá',
  });
  const onlineOnly = makeEvent('online-only', {
    title: 'Sesión sólo en línea',
    mode: 'online',
    country: undefined,
    venueCountry: undefined,
    city: undefined,
    place: undefined,
  });
  const result = buildEventAgendaShare({
    selection: [remoteHybrid, onlineOnly].map((event) => ({ event, events: [event] })),
    period,
    filters: { mode: 'online', country: 'AR', city: 'AR:Córdoba', community: '' },
    communityById: new Map(),
    url: 'https://example.test/eventos/online/?utm_source=implementation-test#agenda',
    now: Date.parse('2026-10-01T00:00:00.000Z'),
  });
  const header = result.text.slice(0, result.text.indexOf(remoteHybrid.title));

  assert.match(result.text, /Asistencia: Participación remota \(evento híbrido\)/u);
  assert.match(result.text, /Asistencia: En línea/u);
  assert.doesNotMatch(header, /Córdoba/u, 'a location retained for remote filters is absent from the copy header');
  assert.doesNotMatch(result.text, /Ubicación presencial|Bogotá|Colombia/u,
    'the selected remote hybrid does not present its foreign venue as physical attendance');
});

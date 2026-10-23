import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEventAgendaShare } from '../src/lib/event-agenda-share.mjs';
import { createEventAgendaPeriod } from '../src/lib/event-agenda-period.mjs';

const period = createEventAgendaPeriod({
  view: 'week', date: '2026-10-19', timeZone: 'America/Argentina/Cordoba',
});

function makeEvent(id, overrides = {}) {
  const startsAt = overrides.startsAt ?? '2026-10-21T13:00:00.000Z';
  const endsAt = overrides.endsAt ?? '2026-10-21T14:00:00.000Z';
  assert.ok(Date.parse(endsAt) > Date.parse(startsAt), `${id} fixture ends after it starts`);
  return {
    recordType: 'event', id, title: `Encuentro ${id}`, description: '', startsAt, endsAt,
    timeZone: 'UTC', organizer: 'Comunidad AWS', mode: 'hybrid', place: 'Centro comunitario',
    registrationUrl: `https://example.test/eventos/${id}`, ...overrides,
  };
}

function share(events, { filters, communityById = new Map(), periodOverride = period }) {
  return buildEventAgendaShare({
    selection: events.map((event) => ({ event, events: [event] })),
    period: periodOverride,
    filters,
    communityById,
    url: 'https://example.test/eventos/?utm_source=implementation-test#agenda',
    now: Date.parse('2026-10-01T00:00:00.000Z'),
  });
}

function linkedInEventLine(result, event) {
  const body = new URL(result.linkedInHref).searchParams.get('text');
  assert.equal(typeof body, 'string', 'LinkedIn receives its prepared post body');
  const titleStart = body.indexOf(event.title);
  assert.ok(titleStart >= 0, 'LinkedIn enumerates this event in its full-list format');
  const lineStart = body.lastIndexOf('\n', titleStart - 1) + 1;
  const lineEnd = body.indexOf('\n', titleStart);
  return body.slice(lineStart, lineEnd < 0 ? body.length : lineEnd);
}

test('labels an in-person hybrid by its selected participation and effective venue', () => {
  const community = { id: 'community-co', country: 'CO', city: 'Bogotá', title: 'AWS Bogotá' };
  const event = makeEvent('hybrid-in-person', {
    communityId: community.id, country: undefined, venueCountry: undefined, city: undefined,
  });
  const result = share([event], {
    filters: { mode: 'in-person', country: '', city: '', community: '' },
    communityById: new Map([[community.id, community]]),
  });
  const eventText = result.text.slice(result.text.indexOf(event.title));

  assert.match(eventText, /presencial/iu);
  assert.match(eventText, /Bogotá, Colombia/u);
  assert.doesNotMatch(eventText, /Presencial y online|Online \(evento híbrido\)/iu,
    'a solo-physical selection does not claim remote participation');
  const linkedInLine = linkedInEventLine(result, event);
  assert.match(linkedInLine, /presencial/iu, 'LinkedIn agrees with the physical selection');
  assert.doesNotMatch(linkedInLine, /online|remota/iu,
    'LinkedIn does not claim remote participation for a solo-physical selection');
});

test('describes online hybrids as remote and omits their inactive physical location', () => {
  const remoteHybrid = makeEvent('remote-hybrid', {
    title: 'Sesión multiformato', country: 'CO', venueCountry: 'CO', city: 'Bogotá', place: 'Centro AWS Bogotá',
  });
  const onlineOnly = makeEvent('online-only', {
    title: 'Taller introductorio', mode: 'online', country: undefined, venueCountry: undefined,
    city: undefined, place: undefined,
  });
  const result = share([remoteHybrid, onlineOnly], {
    filters: { mode: 'online', country: 'AR', city: 'AR:Córdoba', community: '' },
  });

  assert.match(result.text, /Online \(evento híbrido\)|participación remota|remota/iu,
    'a remote-selected hybrid is identified as remote');
  assert.match(result.text, /Online|en línea/iu, 'an online-only event remains identified as online');
  const linkedInHybridLine = linkedInEventLine(result, remoteHybrid);
  const linkedInOnlineLine = linkedInEventLine(result, onlineOnly);
  assert.match(linkedInHybridLine, /online|remota/iu, 'LinkedIn identifies the hybrid as remotely attendable');
  assert.doesNotMatch(linkedInHybridLine, /presencial|Bogotá/iu,
    'LinkedIn does not present its foreign physical venue as the selected attendance');
  assert.match(linkedInOnlineLine, /online|en línea/iu, 'LinkedIn keeps the online-only mode');
  assert.doesNotMatch(linkedInOnlineLine, /Córdoba|presencial/iu,
    'LinkedIn does not attach the inactive Córdoba filter to an online event');
  const humanText = `${result.text}\n${new URL(result.linkedInHref).searchParams.get('text')}`;
  assert.doesNotMatch(humanText, /Centro AWS Bogotá|Ubicación presencial: Bogotá|Presencial: Córdoba/iu,
    'the remote selection does not present a physical venue as attendance');
  const url = new URL(result.url);
  assert.equal(url.searchParams.get('mode'), 'online');
  assert.equal(url.searchParams.get('country'), 'AR');
  assert.equal(url.searchParams.get('city'), 'AR:Córdoba',
    'the inactive physical filter remains available in the shared query');
});

test('describes a matching hybrid as presencial y online in the combined selection', () => {
  const localHybrid = makeEvent('combined-hybrid', {
    title: 'Híbrido local', country: 'AR', venueCountry: 'AR', city: 'Córdoba', place: 'Centro AWS Córdoba',
  });
  const result = share([localHybrid], {
    filters: { mode: '', country: 'AR', city: 'AR:Córdoba', community: '' },
  });
  const eventText = result.text.slice(result.text.indexOf(localHybrid.title));
  assert.match(eventText, /presencial y (?:online|remota)/iu,
    'the combined query describes both ways to attend a matching hybrid');
  assert.match(eventText, /Córdoba, Argentina/u, 'copy includes the effective physical location');
  const linkedInLine = linkedInEventLine(result, localHybrid);
  assert.match(linkedInLine, /presencial/iu, 'LinkedIn preserves the physical participation option');
  assert.match(linkedInLine, /online|remota/iu, 'LinkedIn preserves the remote participation option');
});

test('does not emit a location claim for an online-only event', () => {
  const onlineOnly = makeEvent('online-only-no-venue', {
    title: 'Encuentro técnico', mode: 'online', country: undefined, venueCountry: undefined,
    city: undefined, place: undefined,
  });
  const result = share([onlineOnly], {
    filters: { mode: 'online', country: 'AR', city: 'AR:Córdoba', community: '' },
  });
  const eventText = result.text.slice(result.text.indexOf(onlineOnly.title));
  assert.match(eventText, /Online|en línea/iu);
  assert.doesNotMatch(eventText, /Córdoba|Ubicación presencial|Presencial:/iu);
  const linkedInLine = linkedInEventLine(result, onlineOnly);
  assert.match(linkedInLine, /Online|en línea/iu);
  assert.doesNotMatch(linkedInLine, /Córdoba|presencial/iu);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { eventMatchesFilters, parseEventAgendaSearch, serializeEventAgendaSearch } from '../src/lib/event-agenda-filter.mjs';
import { createEventAgendaPeriod } from '../src/lib/event-agenda-period.mjs';
import { buildEventAgendaShare } from '../src/lib/event-agenda-share.mjs';
import { normalizeEventCityKey } from '../src/lib/event-location.mjs';

const allowed = {
  mode: new Set(['', 'online', 'in-person', 'hybrid']),
  country: new Set(['', 'AR', 'CO']),
  city: new Set(['', 'AR:Córdoba', 'CO:Córdoba', 'AR:San  José']),
  community: new Set(['']),
};

test('city comparison keys ignore accents, case, and repeated spaces while retaining country', () => {
  assert.equal(normalizeEventCityKey('AR:Córdoba'), normalizeEventCityKey('AR:CORDOBA'));
  assert.equal(normalizeEventCityKey('AR:San  José'), normalizeEventCityKey('AR:SAN JÓSE'));
  assert.notEqual(normalizeEventCityKey('AR:Cordoba'), normalizeEventCityKey('CO:Córdoba'));
  assert.equal(normalizeEventCityKey(''), '');
});

test('city aliases in old URLs resolve to the first current option and stale cities stay explicit', () => {
  for (const alias of ['AR:Cordoba', 'AR:CÓRDOBA']) {
    assert.deepEqual(parseEventAgendaSearch(`?country=AR&city=${encodeURIComponent(alias)}`, allowed), {
      mode: '', country: 'AR', city: 'AR:Córdoba', community: '',
    });
  }
  assert.deepEqual(parseEventAgendaSearch(`?city=${encodeURIComponent('AR:Villa Nueva')}`, allowed), {
    mode: '', country: '', city: 'AR:Villa Nueva', community: '',
  }, 'a well-formed city absent from current options remains a selected zero-result filter');
  assert.deepEqual(parseEventAgendaSearch('?country=CO&city=AR%3ACordoba', allowed), {
    mode: '', country: 'CO', city: '', community: '',
  }, 'a city alias from another country is still incompatible with the selected country');
});

test('effective city filters match equivalent accents but never cross country identity', () => {
  const now = Date.parse('2026-10-20T00:00:00Z');
  const filters = { mode: 'in-person', country: 'AR', city: 'AR:Cordoba', community: '' };
  const localAlias = {
    endsAt: '2026-10-21T00:00:00Z', mode: 'in-person', country: 'AR', city: 'AR:CÓRDOBA',
  };
  const otherCountry = {
    ...localAlias, mode: 'hybrid', country: 'CO', city: 'CO:Córdoba',
  };

  assert.equal(eventMatchesFilters(localAlias, filters, now), true);
  assert.equal(eventMatchesFilters(otherCountry, filters, now), false,
    'the same normalized city text in another country is not a physical match');
  assert.equal(eventMatchesFilters(otherCountry, { ...filters, mode: 'online' }, now), true,
    'online selection includes a hybrid globally regardless of its physical country');
});

test('hybrid sharing recognizes an accent-equivalent local venue and keeps online selection global', () => {
  const period = createEventAgendaPeriod({
    view: 'week', date: '2026-10-19', timeZone: 'America/Argentina/Cordoba',
  });
  const event = {
    id: 'hybrid-city-alias', title: 'Híbrido local', startsAt: '2026-10-21T13:00:00Z',
    endsAt: '2026-10-21T14:00:00Z', mode: 'hybrid', country: 'AR', venueCountry: 'AR',
    city: 'Cordoba', registrationUrl: 'https://example.test/hybrid-city-alias',
  };
  const parsed = parseEventAgendaSearch('?country=AR&city=AR%3ACordoba', allowed);
  const selection = [{ event, events: [event] }];
  const shared = buildEventAgendaShare({
    selection, period, filters: parsed, url: 'https://example.test/eventos/?city=old-alias',
    now: Date.parse('2026-10-01T00:00:00Z'),
  });

  assert.match(shared.text, /Híbrido local\nPresencial y online: Cordoba, Argentina/u,
    'a combined selection identifies both attendance options for the local hybrid');
  assert.equal(new URL(shared.url).searchParams.get('city'), 'AR:Córdoba',
    'the shared URL uses the effective option value after alias resolution');

  const remote = buildEventAgendaShare({
    selection, period,
    filters: { ...parsed, mode: 'online' },
    url: 'https://example.test/eventos/', now: Date.parse('2026-10-01T00:00:00Z'),
  });
  assert.match(remote.text, /Híbrido local\nOnline \(evento híbrido\)/u,
    'global online selection labels the remote attendance and omits the physical claim');
  assert.doesNotMatch(remote.text.slice(remote.text.indexOf('Híbrido local')), /Presencial:|Cordoba, Argentina/u);
  assert.equal(new URL(remote.url).searchParams.get('city'), 'AR:Córdoba',
    'inactive location filters remain available in the global online URL');
});

test('serializing an alias query preserves the effective location value', () => {
  const filters = parseEventAgendaSearch('?country=AR&city=AR%3ACordoba', allowed);
  const search = serializeEventAgendaSearch('', filters);
  assert.equal(new URLSearchParams(search).get('city'), 'AR:Córdoba');
  assert.equal(new URLSearchParams(search).get('country'), 'AR');
});

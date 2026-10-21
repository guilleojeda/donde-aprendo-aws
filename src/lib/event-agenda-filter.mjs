import { normalizeEventCityKey } from './event-location.mjs';

const FIELDS = ['mode', 'country', 'city', 'community'];
const SECONDARY_FIELDS = ['community'];
const EVENT_MODES = new Set(['', 'online', 'in-person', 'hybrid']);
const COUNTRY_CODE = /^[A-Z]{2}$/u;

function validCity(value) {
  if (typeof value !== 'string' || !value) return false;
  const match = /^([A-Z]{2}):(.+)$/u.exec(value);
  if (!match || match[0] !== value) return false;
  const city = match[2];
  return city.length <= 100 && city.trim() === city && !/[\r\n\u0000-\u001f\u007f]/u.test(city);
}

function validFilterValue(field, value, allowed) {
  if (typeof value !== 'string') return false;
  if (field === 'mode') return EVENT_MODES.has(value);
  if (field === 'country') return value === '' || (value.length === 2 && COUNTRY_CODE.test(value));
  if (field === 'city') return value === '' || validCity(value);
  return value === '' || Boolean(allowed.community?.has(value));
}

function routeDefault(field, defaults, allowed) {
  const candidate = defaults[field] ?? '';
  return validFilterValue(field, candidate, allowed) ? candidate : '';
}

function effectiveCityValue(value, allowed) {
  if (!value) return value;
  const cityKey = normalizeEventCityKey(value);
  if (!cityKey) return value;
  for (const allowedCity of allowed.city ?? []) {
    if (validCity(allowedCity) && normalizeEventCityKey(allowedCity) === cityKey) return allowedCity;
  }
  return value;
}

export function secondaryEventAgendaFilterCount(filters) {
  return SECONDARY_FIELDS.filter((field) => Boolean(filters[field])).length;
}

export function shouldOpenEventAgendaSecondaryFilters(filters, isMobile) {
  return secondaryEventAgendaFilterCount(filters) > 0 || !isMobile;
}

export function parseEventAgendaSearch(search, allowed, defaults = {}) {
  const query = new URLSearchParams(search);
  const parsed = Object.fromEntries(FIELDS.map((field) => {
    const fallback = routeDefault(field, defaults, allowed);
    const candidate = query.has(field) ? query.get(field) : fallback;
    const value = validFilterValue(field, candidate, allowed) ? candidate : fallback;
    return [field, field === 'city' ? effectiveCityValue(value, allowed) : value];
  }));

  if (parsed.country && parsed.city && parsed.city.slice(0, 2) !== parsed.country) parsed.city = '';
  return parsed;
}

export function serializeEventAgendaSearch(search, filters, defaults = {}) {
  const query = new URLSearchParams(search);
  for (const key of ['from', 'to', 'includeEnded']) query.delete(key);
  for (const field of FIELDS) {
    query.delete(field);
    const value = filters[field] ?? '';
    if (value !== (defaults[field] ?? '')) query.set(field, value);
  }
  return query.toString();
}

/** Match one normalized event member: country is physical and city is `CC:city`. */
export function eventMatchesFilters(event, filters, now = Date.now(), includeEnded = false) {
  const communities = event.communities ?? (event.communityId ? [event.communityId] : event.community ? [event.community] : []);
  const selectedCityKey = normalizeEventCityKey(filters.city ?? '');
  const eventCityKey = normalizeEventCityKey(event.city ?? '');
  const locationMatches = (!filters.country || event.country === filters.country)
    && (!filters.city || (selectedCityKey && selectedCityKey === eventCityKey));
  const remoteMatches = event.mode === 'online' || event.mode === 'hybrid';
  const physicalMatches = (event.mode === 'in-person' || event.mode === 'hybrid') && locationMatches;
  let modeMatches;

  switch (filters.mode ?? '') {
    case '':
      modeMatches = event.mode === undefined || remoteMatches || physicalMatches;
      break;
    case 'online':
      modeMatches = remoteMatches;
      break;
    case 'in-person':
      modeMatches = physicalMatches;
      break;
    case 'hybrid':
      modeMatches = event.mode === 'hybrid' && (remoteMatches || physicalMatches);
      break;
    default:
      modeMatches = false;
  }

  return (includeEnded || Date.parse(event.endsAt) > now)
    && modeMatches
    && (!filters.community || communities.includes(filters.community));
}

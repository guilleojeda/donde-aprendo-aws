import { eventLocalDate } from './events.mjs';
import { eventMatchesFilters } from './event-agenda-filter.mjs';

/**
 * @typedef {import('../types/catalog').CatalogEvent} CatalogEvent
 * @typedef {import('../types/catalog').CatalogResource} CatalogResource
 * @typedef {{from?: string, to?: string, mode?: CatalogEvent['mode'] | '', country?: string, city?: string, community?: string}} EventAgendaFilters
 * @typedef {{communityById?: Map<string, CatalogResource>, country?: string, modes?: readonly CatalogEvent['mode'][], filters?: EventAgendaFilters, includeEnded?: boolean, now?: Date | string | number}} EventAgendaOptions
 */

export function organizerCountry(event, communityById = new Map()) {
  return event.country ?? communityById.get(event.communityId ?? '')?.country;
}

export function eventGroupCountries(group, communityById) {
  return [...new Set(group.events.map((event) => organizerCountry(event, communityById))
    .filter((country) => Boolean(country)))];
}

function eventForAgendaFilters(event, communityById) {
  const country = organizerCountry(event, communityById);
  return {
    ...event,
    localDate: eventLocalDate(event.startsAt, event.timeZone),
    country,
    countries: country ? [country] : [],
    city: event.city ? `${country ?? ''}:${event.city}` : '',
    communities: event.communityId ? [event.communityId] : [],
  };
}

/**
 * Filter a group when one member satisfies the complete agenda selection; keep every co-host.
 * @param {EventAgendaOptions} [options]
 */
export function eventGroupsForAgenda(groups, options = {}) {
  const {
    country, modes, filters = {}, includeEnded = true, now = new Date(),
  } = options;
  /** @type {Map<string, CatalogResource>} */
  const communityById = options.communityById ?? new Map();
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new Error('Invalid event reference time');
  const selected = [];

  for (const group of groups) {
    const matchingEvents = group.events.filter((event) =>
      (!country || organizerCountry(event, communityById) === country)
      && (!modes || modes.includes(event.mode))
      && eventMatchesFilters(eventForAgendaFilters(event, communityById), filters, timestamp, includeEnded))
      .sort((left, right) =>
        Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id));

    if (matchingEvents.length === 0) continue;
    const representative = matchingEvents.find((event) => Date.parse(event.endsAt) > timestamp) ?? matchingEvents[0];
    selected.push({ ...group, event: representative });
  }

  return selected.sort((left, right) =>
    Date.parse(left.event.startsAt) - Date.parse(right.event.startsAt) || left.event.id.localeCompare(right.event.id));
}

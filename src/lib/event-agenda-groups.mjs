import { effectiveEventLocation } from './event-location.mjs';
import { eventMatchesFilters } from './event-agenda-filter.mjs';
import { eventOverlapsAgendaPeriod } from './event-agenda-period.mjs';

/**
 * @typedef {import('../types/catalog').CatalogEvent} CatalogEvent
 * @typedef {import('../types/catalog').CatalogResource} CatalogResource
 * @typedef {{mode?: CatalogEvent['mode'] | '', country?: string, city?: string, community?: string}} EventAgendaFilters
 * @typedef {{view: 'week' | 'month', date: string, timeZone: string, start: number, end: number}} EventAgendaPeriod
 * @typedef {{communityById?: Map<string, CatalogResource>, filters?: EventAgendaFilters, includeEnded?: boolean, now?: Date | string | number, period?: EventAgendaPeriod}} EventAgendaOptions
 */

/** Organizer country remains available for directory and analytics semantics. */
export function organizerCountry(event, communityById = new Map()) {
  return event.country ?? communityById.get(event.communityId ?? '')?.country;
}

/** Return physical countries represented by group members, without remote-only countries. */
export function eventGroupCountries(group, communityById = new Map()) {
  return [...new Set(group.events.map((event) => effectiveEventLocation(event, communityById).country)
    .filter(Boolean))];
}

function eventForAgendaFilters(event, communityById) {
  const location = effectiveEventLocation(event, communityById);
  return {
    ...event,
    country: location.country,
    city: location.country && location.city ? `${location.country}:${location.city}` : '',
    communities: event.communityId ? [event.communityId] : [],
  };
}

/** Filter each member as a whole; retain all co-host listings and choose a matching representative. */
/** @param {{event: CatalogEvent, events: CatalogEvent[]}[]} groups @param {EventAgendaOptions} [options] */
export function eventGroupsForAgenda(groups, options = {}) {
  const { filters = {}, includeEnded = true, now = new Date(), period } = options;
  /** @type {Map<string, CatalogResource>} */
  const communityById = options.communityById ?? new Map();
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new Error('Invalid event reference time');
  const selected = [];

  for (const group of groups) {
    const matchingEvents = group.events.filter((event) =>
      (!period || eventOverlapsAgendaPeriod(event, period))
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

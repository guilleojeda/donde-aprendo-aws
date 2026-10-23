import { COUNTRY_LABELS } from './resource-discovery.mjs';
import { effectiveEventLocation, normalizeEventCityKey } from './event-location.mjs';

const EVENT_MODES = new Set(['online', 'in-person', 'hybrid']);
const EVENT_FIELDS = ['id', 'title', 'description', 'startsAt', 'endsAt', 'timeZone', 'organizer', 'mode', 'registrationUrl'];
const EVENT_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const RESOURCE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

function normalizeEventText(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/gu, ' ').trim();
}

function compareEvents(left, right) {
  return Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id);
}

/** Match physical listings only when their published venue agrees; city can be absent. */
function sameEventVenue(left, right, communityById) {
  if (left.mode === 'online' || right.mode === 'online') return left.mode === right.mode;

  const leftPlace = normalizeEventText(left.place ?? '');
  const rightPlace = normalizeEventText(right.place ?? '');
  if (!leftPlace || leftPlace !== rightPlace) return false;

  const leftLocation = effectiveEventLocation(left, communityById);
  const rightLocation = effectiveEventLocation(right, communityById);
  if (leftLocation.country !== rightLocation.country) return false;
  const cityKey = ({ country, city }) => {
    if (!city) return '';
    return country
      ? normalizeEventCityKey(`${country}:${city}`)
      : normalizeEventText(city);
  };
  const leftCity = cityKey(leftLocation);
  const rightCity = cityKey(rightLocation);
  return !leftCity || !rightCity || leftCity === rightCity;
}

/** Keep strong registration matches while preventing a weak session match from bridging incompatible venues. */
function compatiblePhysicalVenuesAcrossGroups(left, right, communityById) {
  return left.events.every((leftEvent) => right.events.every((rightEvent) =>
    leftEvent.mode === 'online' || rightEvent.mode === 'online'
      || sameEventVenue(leftEvent, rightEvent, communityById)));
}

function mergeEventGroups(groups, groupByRegistration, groupBySession, left, right) {
  const [kept, removed] = compareEvents(left.event, right.event) <= 0 ? [left, right] : [right, left];
  kept.events.push(...removed.events);
  kept.events.sort(compareEvents);
  kept.event = kept.events[0];

  for (const [identity, group] of groupByRegistration) {
    if (group === removed) groupByRegistration.set(identity, kept);
  }
  for (const sessionGroups of groupBySession.values()) {
    const updatedGroups = [...new Set(sessionGroups.map((group) => group === removed ? kept : group))];
    sessionGroups.splice(0, sessionGroups.length, ...updatedGroups);
  }

  groups.splice(groups.indexOf(removed), 1);
  return kept;
}

export function projectPublicEvent(item, index, validateUrl) {
  const label = `Catalog record ${index + 1}`;
  for (const field of EVENT_FIELDS) {
    if (!Object.hasOwn(item, field)) throw new Error(`${label} is missing event field ${field}`);
  }
  const event = Object.fromEntries(['recordType', ...EVENT_FIELDS, 'place', 'country', 'venueCountry', 'city', 'communityId']
    .filter((field) => Object.hasOwn(item, field)).map((field) => [field, item[field]]));
  if (event.recordType !== 'event') throw new Error(`${label} has an invalid record type`);
  for (const field of ['id', 'title', 'organizer']) {
    if (typeof event[field] !== 'string' || !event[field].trim() || event[field].trim() !== event[field]) {
      throw new Error(`${label} has an invalid ${field}`);
    }
  }
  if (!RESOURCE_ID.test(event.id)) throw new Error(`${label} has an invalid id`);
  if (typeof event.description !== 'string') throw new Error(`${label} has an invalid description`);
  for (const field of ['startsAt', 'endsAt']) {
    if (typeof event[field] !== 'string' || !EVENT_DATE.test(event[field]) || Number.isNaN(Date.parse(event[field]))) {
      throw new Error(`${label} has an invalid ${field}`);
    }
    const [year, month, day] = event[field].slice(0, 10).split('-').map(Number);
    if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== event[field].slice(0, 10)) {
      throw new Error(`${label} has an invalid ${field}`);
    }
  }
  if (Date.parse(event.endsAt) <= Date.parse(event.startsAt)) throw new Error(`${label} ends before it starts`);
  try {
    new Intl.DateTimeFormat('es', { timeZone: event.timeZone });
  } catch {
    throw new Error(`${label} has an invalid timeZone`);
  }
  if (!EVENT_MODES.has(event.mode)) throw new Error(`${label} has an invalid mode`);
  if (event.mode !== 'online' && (typeof event.place !== 'string' || !event.place.trim())) {
    throw new Error(`${label} is missing an event place`);
  }
  if (event.place !== undefined && (typeof event.place !== 'string' || event.place.trim() !== event.place)) {
    throw new Error(`${label} has an invalid place`);
  }
  if (event.country !== undefined && !Object.hasOwn(COUNTRY_LABELS, event.country)) {
    throw new Error(`${label} has an invalid country`);
  }
  if (event.venueCountry !== undefined && (event.mode === 'online'
      || typeof event.venueCountry !== 'string' || event.venueCountry.length !== 2
      || !/^[A-Z]{2}$/u.test(event.venueCountry))) {
    throw new Error(`${label} has an invalid venueCountry`);
  }
  if (event.city !== undefined && (event.mode === 'online' || typeof event.city !== 'string'
      || !event.city.trim() || event.city.trim() !== event.city || event.city.length > 100
      || /[\r\n\u0000-\u001f\u007f]/u.test(event.city))) {
    throw new Error(`${label} has an invalid city`);
  }
  if (event.communityId !== undefined && !RESOURCE_ID.test(event.communityId)) {
    throw new Error(`${label} has an invalid communityId`);
  }
  validateUrl(event.registrationUrl, index);
  return event;
}

export function upcomingEvents(events, now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new Error('Invalid event reference time');
  return events.filter((event) => Date.parse(event.endsAt) > timestamp)
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id));
}

/** Group co-hosted listings for every published date, keeping a single representative per occurrence. */
export function uniqueEventGroups(events, communityById = new Map()) {
  const groups = [];
  const groupByRegistration = new Map();
  // A title/start/physical-country can have multiple venue groups.
  const groupBySession = new Map();
  const orderedEvents = [...events].sort(compareEvents);

  const identities = orderedEvents.map((event) => {
    const url = new URL(event.registrationUrl);
    url.searchParams.delete('source');
    url.searchParams.delete('ref');
    const canonicalUrl = `${url.origin}${url.pathname.replace(/\/$/u, '')}${url.search}`;
    const start = Date.parse(event.startsAt);
    const registrationIdentity = JSON.stringify([canonicalUrl, start]);
    const title = normalizeEventText(event.title);
    const locationScope = event.mode === 'online'
      ? 'online'
      : (effectiveEventLocation(event, communityById).country || 'unspecified');
    const session = `${start}:${title}:${locationScope}`;
    return { event, registrationIdentity, session };
  });

  // Complete every strong registration group before weak session matches can connect them.
  for (const { event, registrationIdentity, session } of identities) {
    let registrationGroup = groupByRegistration.get(registrationIdentity);
    if (registrationGroup) {
      registrationGroup.events.push(event);
    } else {
      registrationGroup = { event, events: [event] };
      groups.push(registrationGroup);
      groupByRegistration.set(registrationIdentity, registrationGroup);
    }

    const sessionGroups = groupBySession.get(session) ?? [];
    if (!sessionGroups.includes(registrationGroup)) sessionGroups.push(registrationGroup);
    groupBySession.set(session, sessionGroups);
  }

  // Reconcile only when the complete physical facts of both strong groups agree.
  for (const { event, registrationIdentity, session } of identities) {
    while (true) {
      const registrationGroup = groupByRegistration.get(registrationIdentity);
      const sessionGroups = groupBySession.get(session) ?? [];
      const matchingSession = sessionGroups.find((group) => group !== registrationGroup
        && group.events.some((item) => sameEventVenue(item, event, communityById))
        && compatiblePhysicalVenuesAcrossGroups(registrationGroup, group, communityById));
      if (!matchingSession) break;
      mergeEventGroups(groups, groupByRegistration, groupBySession, registrationGroup, matchingSession);
    }
  }
  return groups.sort((left, right) => compareEvents(left.event, right.event));
}

/** Group only events that are upcoming or in progress before choosing a representative. */
export function uniqueUpcomingEventGroups(events, now = new Date(), communityById = new Map()) {
  return uniqueEventGroups(upcomingEvents(events, now), communityById);
}

/** Show a co-hosted Meetup event once even when groups post separate listings. */
export function uniqueUpcomingEvents(events, now = new Date(), communityById = new Map()) {
  return uniqueUpcomingEventGroups(events, now, communityById).map(({ event }) => event);
}

export function eventDateLabel(instant, timeZone) {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(instant));
}

/** Calendar date in the stored organizer time zone, independent of the visitor's clock. */
export function eventLocalDate(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone })
    .formatToParts(new Date(instant));
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function eventTimeLabel(instant, timeZone) {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone, timeZoneName: 'short' })
    .format(new Date(instant));
}

/** Show the end time alone on the same local date, or add its date when the event spans dates. */
export function eventEndTimeLabel(startsAt, endsAt, timeZone) {
  const endTime = eventTimeLabel(endsAt, timeZone);
  return eventLocalDate(startsAt, timeZone) === eventLocalDate(endsAt, timeZone)
    ? endTime
    : `${eventDateLabel(endsAt, timeZone)} · ${endTime}`;
}

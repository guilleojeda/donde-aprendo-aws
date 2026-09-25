const EVENT_MODES = new Set(['online', 'in-person', 'hybrid']);
const EVENT_FIELDS = ['id', 'title', 'description', 'startsAt', 'endsAt', 'timeZone', 'organizer', 'mode', 'registrationUrl'];
const EVENT_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const RESOURCE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export function projectPublicEvent(item, index, validateUrl) {
  const label = `Catalog record ${index + 1}`;
  for (const field of EVENT_FIELDS) {
    if (!Object.hasOwn(item, field)) throw new Error(`${label} is missing event field ${field}`);
  }
  const event = Object.fromEntries(['recordType', ...EVENT_FIELDS, 'place']
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
  validateUrl(event.registrationUrl, index);
  return event;
}

export function upcomingEvents(events, now = new Date()) {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new Error('Invalid event reference time');
  return events.filter((event) => Date.parse(event.endsAt) > timestamp)
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id));
}

export function eventDateLabel(instant, timeZone) {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(new Date(instant));
}

export function eventTimeLabel(instant, timeZone) {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone, timeZoneName: 'short' })
    .format(new Date(instant));
}

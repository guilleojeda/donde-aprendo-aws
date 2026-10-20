const FORMATTERS = new Map();
const HOUR_MS = 3_600_000;

/** @typedef {'week' | 'month'} EventAgendaView */
/** @typedef {{view: EventAgendaView, date: string, timeZone: string, start: number, end: number}} EventAgendaPeriod */

function formatterFor(timeZone) {
  let formatter = FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

function normalizedTimeZone(value) {
  if (typeof value === 'string' && value) {
    try {
      formatterFor(value);
      return value;
    } catch {
      // Invalid query/browser zones use the agreed UTC fallback.
    }
  }
  return 'UTC';
}

function utcTimestamp(year, month, day, hour = 0, minute = 0, second = 0) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}

function partsAt(timestamp, timeZone) {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(new Date(timestamp))
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, Number(value)]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function wallTimestamp(parts) {
  return utcTimestamp(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second);
}

function timezoneOffsetAt(timestamp, timeZone) {
  const wholeSecond = Math.floor(timestamp / 1000) * 1000;
  return wallTimestamp(partsAt(timestamp, timeZone)) - wholeSecond;
}

function localDateAt(timestamp, timeZone) {
  const { year, month, day } = partsAt(timestamp, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function validCivilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(utcTimestamp(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function requireCivilDate(value) {
  if (!validCivilDate(value)) throw new RangeError(`Invalid agenda reference date: ${String(value)}`);
  return value;
}

function epochFromNow(now) {
  const timestamp = now === undefined
    ? Date.now()
    : now instanceof Date
      ? now.getTime()
      : typeof now === 'number'
        ? now
        : Date.parse(now);
  if (!Number.isFinite(timestamp)) throw new RangeError('Invalid agenda reference time');
  return timestamp;
}

function shiftCivilDate(date, amount) {
  const [year, month, day] = requireCivilDate(date).split('-').map(Number);
  const shifted = new Date(utcTimestamp(year, month, day + amount));
  return `${String(shifted.getUTCFullYear()).padStart(4, '0')}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  return new Date(utcTimestamp(year, month + 1, 0)).getUTCDate();
}

function shiftCivilMonth(date, amount) {
  const [year, month, day] = requireCivilDate(date).split('-').map(Number);
  const firstOfMonth = new Date(utcTimestamp(year, month, 1));
  firstOfMonth.setUTCMonth(firstOfMonth.getUTCMonth() + amount);
  const targetYear = firstOfMonth.getUTCFullYear();
  const targetMonth = firstOfMonth.getUTCMonth() + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

/** Find the earliest matching wall time, or the first local time after a forward gap. */
function localBoundary(date, timeZone) {
  const [year, month, day] = requireCivilDate(date).split('-').map(Number);
  const target = utcTimestamp(year, month, day);
  const offsets = new Set();

  // Sampling both sides also finds both offsets when a transition occurs at midnight.
  for (const hours of [-36, -12, 0, 12, 36]) offsets.add(timezoneOffsetAt(target + hours * HOUR_MS, timeZone));

  let probe = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offset = timezoneOffsetAt(probe, timeZone);
    offsets.add(offset);
    probe = target - offset;
  }

  const exact = [];
  const afterGap = [];
  for (const offset of offsets) {
    const candidate = target - offset;
    const localWallTime = wallTimestamp(partsAt(candidate, timeZone));
    if (localWallTime === target) exact.push(candidate);
    else if (localWallTime > target) afterGap.push({ candidate, difference: localWallTime - target });
  }

  if (exact.length) return Math.min(...exact);
  afterGap.sort((left, right) => left.difference - right.difference || left.candidate - right.candidate);
  if (afterGap.length) return afterGap[0].candidate;
  throw new RangeError(`Cannot resolve agenda boundary for ${date} in ${timeZone}`);
}

function periodBoundaries(view, date, timeZone) {
  let startDate;
  let endDate;
  if (view === 'month') {
    const [year, month] = date.split('-').map(Number);
    startDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
    endDate = shiftCivilMonth(startDate, 1);
  } else {
    const [year, month, day] = date.split('-').map(Number);
    const weekday = new Date(utcTimestamp(year, month, day)).getUTCDay();
    startDate = shiftCivilDate(date, -((weekday + 6) % 7));
    endDate = shiftCivilDate(startDate, 7);
  }
  return {
    start: localBoundary(startDate, timeZone),
    end: localBoundary(endDate, timeZone),
  };
}

/** @param {{view?: string, date?: string, timeZone?: string, now?: Date | string | number}} [options] @returns {EventAgendaPeriod} */
export function createEventAgendaPeriod(options = {}) {
  const timeZone = normalizedTimeZone(options.timeZone);
  const view = options.view === 'month' ? 'month' : 'week';
  const date = options.date === undefined
    ? localDateAt(epochFromNow(options.now), timeZone)
    : requireCivilDate(options.date);
  return { view, date, timeZone, ...periodBoundaries(view, date, timeZone) };
}

/** @param {EventAgendaPeriod} period @param {number} amount @returns {EventAgendaPeriod} */
export function shiftEventAgendaPeriod(period, amount) {
  if (!Number.isSafeInteger(amount)) throw new RangeError('Agenda period shift must be an integer');
  const date = period.view === 'month'
    ? shiftCivilMonth(period.date, amount)
    : shiftCivilDate(period.date, amount * 7);
  return createEventAgendaPeriod({ view: period.view, date, timeZone: period.timeZone });
}

/** @param {{startsAt: string, endsAt: string}} event @param {EventAgendaPeriod} period */
export function eventOverlapsAgendaPeriod(event, period) {
  const startsAt = Date.parse(event.startsAt);
  const endsAt = Date.parse(event.endsAt);
  return Number.isFinite(startsAt) && Number.isFinite(endsAt)
    && startsAt < period.end && endsAt > period.start;
}

function validTimeZone(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    formatterFor(value);
    return true;
  } catch {
    return false;
  }
}

/** @param {string | URLSearchParams} search @param {{timeZone?: string, now?: Date | string | number}} [options] @returns {EventAgendaPeriod} */
export function parseEventAgendaPeriod(search, options = {}) {
  const query = new URLSearchParams(search);
  const fallbackTimeZone = normalizedTimeZone(options.timeZone);
  const timeZone = validTimeZone(query.get('tz')) ? query.get('tz') : fallbackTimeZone;
  const explicitDate = validCivilDate(query.get('date')) ? query.get('date') : '';
  const legacyDate = !explicitDate
    ? [query.get('from'), query.get('to')].find((value) => validCivilDate(value)) ?? ''
    : '';
  const date = explicitDate || legacyDate || localDateAt(epochFromNow(options.now), timeZone);
  const view = legacyDate ? 'week' : query.get('view') === 'month' ? 'month' : 'week';
  return createEventAgendaPeriod({ view, date, timeZone });
}

/** @param {string | URLSearchParams} search @param {EventAgendaPeriod} period */
export function serializeEventAgendaPeriod(search, period) {
  const query = new URLSearchParams(search);
  for (const key of ['from', 'to', 'includeEnded']) query.delete(key);
  query.set('view', period.view);
  query.set('date', period.date);
  query.set('tz', period.timeZone);
  return query.toString();
}

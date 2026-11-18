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
      era: 'short',
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
    .map(({ type, value }) => [type, value]));
  const year = Number(parts.year);
  return {
    // Intl exposes Gregorian years before the era as 1 BC, while Date and
    // the agenda's civil arithmetic use astronomical year zero.
    year: parts.era?.includes('BC') ? 1 - year : year,
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
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
  return formatCivilDate({ year, month, day });
}

function parseReferenceDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match || match[0] !== value) return null;
  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  if (year < 1) return null;
  const date = new Date(utcTimestamp(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
    ? { year, month, day }
    : null;
}

export function isEventAgendaReferenceDate(value) {
  return parseReferenceDate(value) !== null;
}

function formatCivilDate({ year, month, day }) {
  const yearText = year > 9999
    ? `+${String(year).padStart(6, '0')}`
    : year < 0
      ? `-${String(Math.abs(year)).padStart(6, '0')}`
      : String(year).padStart(4, '0');
  return `${yearText}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function requireReferenceParts(value) {
  const parts = parseReferenceDate(value);
  if (!parts) throw new RangeError(`Invalid agenda reference date: ${String(value)}`);
  return parts;
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

function shiftCivilDateParts({ year, month, day }, amount) {
  const shifted = new Date(utcTimestamp(year, month, day + amount));
  return {
    year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(),
  };
}

function daysInMonth(year, month) {
  return new Date(utcTimestamp(year, month + 1, 0)).getUTCDate();
}

function shiftCivilMonthParts({ year, month, day }, amount) {
  const firstOfMonth = new Date(utcTimestamp(year, month, 1));
  firstOfMonth.setUTCMonth(firstOfMonth.getUTCMonth() + amount);
  const targetYear = firstOfMonth.getUTCFullYear();
  const targetMonth = firstOfMonth.getUTCMonth() + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return { year: targetYear, month: targetMonth, day: targetDay };
}

/** Find the earliest matching wall time, or the first local time after a forward gap. */
function localBoundary(parts, timeZone) {
  const { year, month, day } = parts;
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
  throw new RangeError(`Cannot resolve agenda boundary for ${formatCivilDate(parts)} in ${timeZone}`);
}

function periodBoundaries(view, parts, timeZone) {
  let startDate;
  let endDate;
  if (view === 'month') {
    startDate = { year: parts.year, month: parts.month, day: 1 };
    endDate = shiftCivilMonthParts(startDate, 1);
  } else {
    const weekday = new Date(utcTimestamp(parts.year, parts.month, parts.day)).getUTCDay();
    startDate = shiftCivilDateParts(parts, -((weekday + 6) % 7));
    endDate = shiftCivilDateParts(startDate, 7);
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
  const date = options.date === undefined ? localDateAt(epochFromNow(options.now), timeZone) : options.date;
  const { start, end } = periodBoundaries(view, requireReferenceParts(date), timeZone);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new RangeError('Agenda period must have finite, ordered boundaries');
  }
  return { view, date, timeZone, start, end };
}

/** Resolve a user selection, using the current local period if its requested date cannot be represented.
 * @param {{view?: string, date?: string, timeZone?: string, now?: Date | string | number}} options
 */
export function resolveEventAgendaPeriod(options) {
  try {
    return createEventAgendaPeriod(options);
  } catch (error) {
    if (!(error instanceof RangeError) || options.date === undefined) throw error;
    return createEventAgendaPeriod({ ...options, date: undefined });
  }
}

/** @param {EventAgendaPeriod} period @param {number} amount @returns {EventAgendaPeriod} */
export function shiftEventAgendaPeriod(period, amount) {
  if (!Number.isSafeInteger(amount)) throw new RangeError('Agenda period shift must be an integer');
  const parts = requireReferenceParts(period.date);
  const shifted = period.view === 'month'
    ? shiftCivilMonthParts(parts, amount)
    : shiftCivilDateParts(parts, amount * 7);
  return createEventAgendaPeriod({ view: period.view, date: formatCivilDate(shifted), timeZone: period.timeZone });
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
  const explicitDate = isEventAgendaReferenceDate(query.get('date')) ? query.get('date') : '';
  const legacyDate = !explicitDate
    ? [query.get('from'), query.get('to')].find((value) => isEventAgendaReferenceDate(value)) ?? ''
    : '';
  const date = explicitDate || legacyDate || undefined;
  const view = legacyDate ? 'week' : query.get('view') === 'month' ? 'month' : 'week';
  return resolveEventAgendaPeriod({ view, date, timeZone, now: options.now });
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

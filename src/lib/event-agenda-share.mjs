import parseTweet from 'twitter-text/dist/parseTweet.js';
import { serializeEventAgendaSearch } from './event-agenda-filter.mjs';
import { serializeEventAgendaPeriod } from './event-agenda-period.mjs';
import { effectiveEventLocation, eventCountryLabel } from './event-location.mjs';

const X_INTENT = 'https://x.com/intent/tweet';
const LINKEDIN_INTENT = 'https://www.linkedin.com/sharing/share-offsite/';
const LINKEDIN_UTF16_LIMIT = 3_000;
const X_WEIGHT_LIMIT = 280;
const X_INVALID_CHARACTERS = /[\uFFFE\uFEFF\uFFFF]/gu;

function referenceTimestamp(now) {
  const value = now === undefined ? Date.now() : now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(value)) throw new RangeError('Invalid agenda share reference time');
  return value;
}

function partsAt(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('es', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, hourCycle: 'h23', timeZone,
  }).formatToParts(new Date(instant));
  return Object.fromEntries(parts.filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
}

function capitalize(value) {
  return value ? `${value.slice(0, 1).toLocaleUpperCase('es')}${value.slice(1)}` : value;
}

function monthLabel(instant, timeZone) {
  return new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone }).format(new Date(instant));
}

function dateParts(instant, timeZone) {
  const values = partsAt(instant, timeZone);
  const monthName = new Intl.DateTimeFormat('es', { month: 'long', timeZone }).format(new Date(instant));
  return {
    day: Number(values.day),
    month: Number(values.month),
    monthName,
    year: Number(values.year),
  };
}

function periodBoundaries(period) {
  return {
    start: dateParts(period.start, period.timeZone),
    end: dateParts(period.end - 1, period.timeZone),
  };
}

function periodLabel(period, style, now) {
  if (period.view === 'month') {
    const month = monthLabel(period.start, period.timeZone);
    return style === 'linkedin' ? `en ${month}` : month;
  }
  const { start, end } = periodBoundaries(period);
  const sameYear = start.year === end.year;
  const sameMonth = sameYear && start.month === end.month;
  const referenceYear = dateParts(referenceTimestamp(now), period.timeZone).year;
  const includeYear = start.year !== referenceYear || end.year !== referenceYear;
  if (style === 'linkedin') {
    if (sameMonth) return `del ${start.day} al ${end.day} de ${start.monthName}${includeYear ? ` de ${start.year}` : ''}`;
    if (sameYear) return `del ${start.day} de ${start.monthName} al ${end.day} de ${end.monthName}${includeYear ? ` de ${start.year}` : ''}`;
    return `del ${start.day} de ${start.monthName} de ${start.year} al ${end.day} de ${end.monthName} de ${end.year}`;
  }
  if (sameMonth) return `${start.day}-${end.day} de ${start.monthName}${includeYear ? ` de ${start.year}` : ''}`;
  if (sameYear) return `${start.day} de ${start.monthName}-${end.day} de ${end.monthName}${includeYear ? ` de ${start.year}` : ''}`;
  return `${start.day} de ${start.monthName} de ${start.year}-${end.day} de ${end.monthName} de ${end.year}`;
}

function selectedLocation(filters) {
  if ((filters.mode ?? '') === 'online') return { city: '', country: '' };
  const country = filters.country ?? '';
  const cityFilter = filters.city ?? '';
  const separator = cityFilter.indexOf(':');
  const cityCountry = separator >= 0 ? cityFilter.slice(0, separator) : '';
  const city = separator >= 0 ? cityFilter.slice(separator + 1) : cityFilter;
  return { city, country: country || cityCountry };
}

function locationLabel({ city, country }) {
  const countryName = eventCountryLabel(country);
  return [city, countryName].filter(Boolean).join(', ');
}

function contextLabel(filters, style, count) {
  const location = locationLabel(selectedLocation(filters));
  const mode = filters.mode ?? '';
  const singular = count === 1;
  if (mode === 'online') return 'Online';
  if (mode === 'in-person') return `${singular ? 'Presencial' : 'Presenciales'}${location ? ` en ${location}` : ''}`;
  if (mode === 'hybrid') {
    const label = singular ? 'Híbrido' : 'Híbridos';
    const physical = singular ? 'presencial' : 'presenciales';
    const online = style === 'linkedin' ? 'opciones online' : 'online';
    return `${label}, ${physical}${location ? ` en ${location}` : ''}, y ${online}`;
  }
  if (!location) return style === 'linkedin'
    ? `${singular ? 'Presencial' : 'Presenciales'} y opciones online`
    : `${singular ? 'Presencial' : 'Presenciales'} y online`;
  return style === 'linkedin'
    ? `${singular ? 'Presencial' : 'Presenciales'} en ${location}, y opciones online`
    : `${singular ? 'Presencial' : 'Presenciales'} en ${location}, y online`;
}

function countLabel(count) {
  return `${count} ${count === 1 ? 'evento' : 'eventos'}`;
}

function xContext(filters, count, cityOverride) {
  const selected = selectedLocation(filters);
  const city = cityOverride === undefined ? selected.city : cityOverride;
  const location = locationLabel({ ...selected, city });
  const mode = filters.mode ?? '';
  if (mode === 'online') return `${countLabel(count)} online`;
  const eventKind = count === 1 ? 'evento' : 'eventos';
  if (mode === 'in-person') return `${count} ${eventKind} ${count === 1 ? 'presencial' : 'presenciales'}${location ? ` en ${location}` : ''}`;
  if (mode === 'hybrid') return `${count} ${eventKind} ${count === 1 ? 'híbrido' : 'híbridos'}, ${count === 1 ? 'presencial' : 'presenciales'}${location ? ` en ${location}` : ''}, y online`;
  return `${count} ${eventKind} ${count === 1 ? 'presencial' : 'presenciales'}${location ? ` en ${location}` : ''}, y online`;
}

function localDate(instant, timeZone) {
  const values = partsAt(instant, timeZone);
  return `${values.year}-${values.month}-${values.day}`;
}

function shortDateTime(instant, timeZone, includeYear = false) {
  const values = partsAt(instant, timeZone);
  const date = `${values.day}/${String(values.month).padStart(2, '0')}${includeYear ? `/${values.year}` : ''}`;
  return `${capitalize(values.weekday)} ${date}, ${values.hour}:${values.minute}`;
}

function eventDateTime(event, timeZone) {
  const startYear = partsAt(event.startsAt, timeZone).year;
  const endYear = partsAt(event.endsAt, timeZone).year;
  const includeYear = startYear !== endYear;
  const start = shortDateTime(event.startsAt, timeZone, includeYear);
  if (localDate(event.startsAt, timeZone) === localDate(event.endsAt, timeZone)) return start;
  return `${start}–${shortDateTime(event.endsAt, timeZone, includeYear)}`;
}

function eventAttendanceLabel(event, filters, communityById) {
  if (event.mode === 'online') return 'Online';
  if (event.mode === 'in-person') return 'Presencial';

  const location = effectiveEventLocation(event, communityById);
  const selected = selectedLocation(filters);
  if ((filters.mode ?? '') === 'in-person') return 'Presencial';
  const outsideSelectedLocation = (selected.country && selected.country !== location.country)
    || (selected.city && selected.city !== location.city);
  if ((filters.mode ?? '') === 'online' || outsideSelectedLocation) return 'Online (evento híbrido)';
  return 'Presencial y online';
}

function eventPhysicalLocationLabel(event, filters, communityById) {
  if (event.mode === 'online') return '';
  const attendance = eventAttendanceLabel(event, filters, communityById);
  if (attendance === 'Online (evento híbrido)') return '';
  return locationLabel(effectiveEventLocation(event, communityById));
}

function eventCopyAttendance(event, filters, communityById) {
  const attendance = eventAttendanceLabel(event, filters, communityById);
  const physical = eventPhysicalLocationLabel(event, filters, communityById);
  return physical && attendance !== 'Online (evento híbrido)' ? `${attendance}: ${physical}` : attendance;
}

function offsetAt(instant, timeZone) {
  const value = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(new Date(instant)).find(({ type }) => type === 'timeZoneName')?.value ?? 'GMT';
  return value.replace(/^GMT/u, 'UTC');
}

function zoneDisplay(timeZone) {
  const resolved = new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone;
  if (resolved === 'America/Cordoba') return 'Córdoba, Argentina';
  if (timeZone === 'UTC') return 'UTC';
  return timeZone;
}

function scheduleLine({ selection, period }) {
  const instants = selection.flatMap(({ event }) => [Date.parse(event.startsAt), Date.parse(event.endsAt)])
    .filter(Number.isFinite);
  if (!instants.length) instants.push(period.start, period.end - 1);
  const offsets = [...new Set(instants.sort((left, right) => left - right)
    .map((instant) => offsetAt(instant, period.timeZone)))];
  return `Horarios de ${zoneDisplay(period.timeZone)} (${offsets.join(' y ')}).`;
}

function canonicalAgendaUrl(url, period, filters) {
  const origin = new URL(url).origin;
  let search = serializeEventAgendaPeriod('', period);
  search = serializeEventAgendaSearch(search, filters, {});
  const result = new URL('/eventos/', origin);
  result.search = search;
  return result.href;
}

function ended(event, now) {
  return Date.parse(event.endsAt) <= referenceTimestamp(now);
}

function copyText({ selection, period, filters, communityById, url, now }) {
  const heading = `*Agenda eventos AWS, ${periodLabel(period, 'short', now)}*`;
  const context = contextLabel(filters, 'copy');
  const community = filters.community ? communityById.get(filters.community) : undefined;
  const headerLines = [heading, `${context}.`];
  if (community) headerLines.push(`Comunidad: ${community.title ?? filters.community}`);
  if (selection.length === 0) headerLines.push('No hay eventos que coincidan con estos filtros.');
  headerLines.push(scheduleLine({ selection, period }));
  const header = headerLines.join('\n');
  const blocks = selection.map(({ event }) => {
    const status = ended(event, now);
    return [
      `*${eventDateTime(event, period.timeZone)}*`,
      event.title,
      eventCopyAttendance(event, filters, communityById),
      event.registrationUrl,
      ...(status ? ['Finalizado'] : []),
    ].join('\n');
  });
  return [header, ...blocks, `Consultar la agenda completa:\n${url}`].join('\n\n');
}

function linkedinEventLine({ event, filters, communityById, period, now }) {
  const status = ended(event, now) ? ' - Finalizado' : '';
  return `- ${eventDateTime(event, period.timeZone)}: ${event.title} - ${eventAttendanceLabel(event, filters, communityById)}${status}`;
}

function linkedinFullText({ selection, period, filters, communityById, url, now }) {
  const firstLine = `Eventos para aprender AWS, ${periodLabel(period, 'linkedin', now)}. ${contextLabel(filters, 'linkedin')}.`;
  const emptyLine = selection.length === 0 ? '\nNo hay eventos que coincidan con estos filtros.' : '';
  const events = selection.map(({ event }) => linkedinEventLine({ event, filters, communityById, period, now }));
  return `${firstLine}${emptyLine}${events.length ? `\n${events.join('\n')}` : ''}\n\n${scheduleLine({ selection, period })}\n\nDetalles e inscripciones:\n${url}`;
}

function linkedinSummary({ selection, period, filters, url, now }) {
  const context = contextLabel(filters, 'linkedin', selection.length);
  const lowerInitial = context ? `${context.slice(0, 1).toLocaleLowerCase('es')}${context.slice(1)}` : context;
  const firstLine = `Eventos para aprender AWS, ${periodLabel(period, 'linkedin', now)}. ${countLabel(selection.length)} ${lowerInitial}.`;
  const emptyLine = selection.length === 0 ? '\nNo hay eventos que coincidan con estos filtros.' : '';
  return `${firstLine}${emptyLine}\n\n${scheduleLine({ selection, period })}\n\nLa lista completa de eventos, horarios e inscripciones:\n${url}`;
}

function graphemes(value) {
  return [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(value)].map(({ segment }) => segment);
}

function sanitizeX(value) {
  return value.normalize('NFC').replace(X_INVALID_CHARACTERS, ' ').replace(/ {2,}/gu, ' ').trim();
}

function xCandidate(body) {
  const parsed = parseTweet(`${body} `);
  return parsed.valid && parsed.weightedLength <= X_WEIGHT_LIMIT;
}

function xText({ selection, period, filters, url, now }) {
  const periodText = periodLabel(period, 'short', now);
  const makeBody = (city) => {
    const context = xContext(filters, selection.length, city);
    const emptyLine = selection.length === 0 ? ' No hay eventos que coincidan con estos filtros.' : '';
    return `Agenda de eventos para aprender AWS, ${periodText}. ${sanitizeX(context)}.${emptyLine}\n\nAgenda completa e inscripciones:\n${url}`;
  };
  const location = selectedLocation(filters);
  const fullCity = sanitizeX(location.city);
  const complete = makeBody(fullCity);
  if (xCandidate(complete)) return complete;
  if (!fullCity) throw new RangeError('The required X agenda summary does not fit the platform limit');
  const cityGraphemes = graphemes(fullCity);
  for (let length = cityGraphemes.length - 1; length >= 0; length -= 1) {
    const candidate = makeBody(`${cityGraphemes.slice(0, length).join('')}…`);
    if (xCandidate(candidate)) return candidate;
  }
  throw new RangeError('The required X agenda summary does not fit the platform limit');
}

/**
 * Format the already-selected, ordered event groups for copy and social sharing.
 * This function deliberately does not reselect, paginate, read the DOM, or mutate inputs.
 */
export function buildEventAgendaShare({ selection, period, filters, communityById = new Map(), url, now }) {
  const agendaUrl = canonicalAgendaUrl(url, period, filters);
  const text = copyText({ selection, period, filters, communityById, url: agendaUrl, now });
  const linkedInFull = linkedinFullText({ selection, period, filters, communityById, url: agendaUrl, now });
  const linkedInText = linkedInFull.length <= LINKEDIN_UTF16_LIMIT
    ? linkedInFull
    : linkedinSummary({ selection, period, filters, url: agendaUrl, now });
  const xBody = xText({ selection, period, filters, url: agendaUrl, now });
  const x = new URL(X_INTENT);
  x.searchParams.set('text', xBody);
  const linkedIn = new URL(LINKEDIN_INTENT);
  linkedIn.searchParams.set('text', linkedInText);
  return {
    url: agendaUrl,
    text,
    xHref: x.href,
    linkedInHref: linkedIn.href,
  };
}

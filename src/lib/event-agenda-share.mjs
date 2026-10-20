import parseTweet from 'twitter-text/dist/parseTweet.js';
import { serializeEventAgendaSearch } from './event-agenda-filter.mjs';
import { serializeEventAgendaPeriod } from './event-agenda-period.mjs';
import { effectiveEventLocation, eventCountryLabel } from './event-location.mjs';
import { eventDateLabel, eventLocalDate, eventTimeLabel } from './events.mjs';

const X_INTENT = 'https://x.com/intent/tweet';
const LINKEDIN_INTENT = 'https://www.linkedin.com/sharing/share-offsite/';
const X_WEIGHT_LIMIT = 280;
const X_INVALID_CHARACTERS = /[\uFFFE\uFEFF\uFFFF]/gu;

function referenceTimestamp(now) {
  const value = now === undefined ? Date.now() : now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(value)) throw new RangeError('Invalid agenda share reference time');
  return value;
}

function monthLabel(instant, timeZone, options = {}) {
  return new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone, ...options })
    .format(new Date(instant));
}

function periodCopyLabel(period) {
  if (period.view === 'month') return monthLabel(period.start, period.timeZone);
  const finalInstant = period.end - 1;
  return `Semana del ${eventDateLabel(period.start, period.timeZone)} al ${eventDateLabel(finalInstant, period.timeZone)}`;
}

function periodXLabel(period) {
  const startDate = eventLocalDate(period.start, period.timeZone);
  const endDate = eventLocalDate(period.end - 1, period.timeZone);
  const [startYear, startMonth, startDay] = startDate.split('-');
  const [endYear, endMonth, endDay] = endDate.split('-');
  if (period.view === 'month') return `Mes ${startMonth}/${startYear}`;
  if (startYear === endYear && startMonth === endMonth) return `Semana ${Number(startDay)}–${Number(endDay)}/${startMonth}/${startYear}`;
  if (startYear === endYear) return `Semana ${Number(startDay)}/${Number(startMonth)}–${Number(endDay)}/${Number(endMonth)}/${startYear}`;
  return `Semana ${Number(startDay)}/${Number(startMonth)}/${startYear}–${Number(endDay)}/${Number(endMonth)}/${endYear}`;
}

function modeLabel(mode) {
  switch (mode ?? '') {
    case 'online': return 'En línea';
    case 'in-person': return 'Presencial';
    case 'hybrid': return 'Híbrida';
    default: return 'Todas las modalidades';
  }
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

function dateTimeLine(event, timeZone) {
  const startDate = eventDateLabel(event.startsAt, timeZone);
  const endDate = eventDateLabel(event.endsAt, timeZone);
  const startTime = eventTimeLabel(event.startsAt, timeZone);
  const endTime = eventTimeLabel(event.endsAt, timeZone);
  const end = eventLocalDate(event.startsAt, timeZone) === eventLocalDate(event.endsAt, timeZone)
    ? endTime
    : `${endDate}, ${endTime}`;
  return `${startDate}, ${startTime} – ${end}`;
}

function eventAttendanceLabel(event, filters, communityById) {
  if (event.mode === 'online') return 'En línea';
  if (event.mode === 'in-person') return 'Presencial';

  const location = effectiveEventLocation(event, communityById);
  const selected = selectedLocation(filters);
  if ((filters.mode ?? '') === 'in-person') return 'Participación presencial';
  const outsideSelectedLocation = (selected.country && selected.country !== location.country)
    || (selected.city && selected.city !== location.city);
  if ((filters.mode ?? '') === 'online' || outsideSelectedLocation) return 'Participación remota (evento híbrido)';
  return 'Presencial y remota (evento híbrido)';
}

function eventPhysicalLocationLabel(event, filters, communityById) {
  if (event.mode === 'online') return '';
  if (event.mode === 'hybrid' && eventAttendanceLabel(event, filters, communityById).startsWith('Participación remota')) return '';
  return locationLabel(effectiveEventLocation(event, communityById));
}

function canonicalAgendaUrl(url, period, filters) {
  const origin = new URL(url).origin;
  let search = serializeEventAgendaPeriod('', period);
  search = serializeEventAgendaSearch(search, filters, {});
  const result = new URL('/eventos/', origin);
  result.search = search;
  return result.href;
}

function xCandidate(summary, url) {
  const result = parseTweet(`${summary}\n${url}`);
  return result.valid && result.weightedLength <= X_WEIGHT_LIMIT;
}

function graphemes(value) {
  return [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(value)]
    .map(({ segment }) => segment);
}

function makeXSummary({ selection, period, filters, url }) {
  const mode = modeLabel(filters.mode);
  const location = selectedLocation(filters);
  const countryName = eventCountryLabel(location.country);
  const fixedParts = [
    `Resumen: ${selection.length} ${selection.length === 1 ? 'evento' : 'eventos'}`,
    periodXLabel(period),
    mode,
  ];
  if (countryName) fixedParts.push(countryName);
  fixedParts.push(period.timeZone);
  const city = location.city.normalize('NFC').replace(X_INVALID_CHARACTERS, ' ').trim();
  const makeSummary = (cityLabel) => [fixedParts[0], fixedParts[1], fixedParts[2],
    ...(cityLabel ? [cityLabel] : []), ...(countryName ? [countryName] : []), period.timeZone]
    .join(' · ');

  const sanitizedFixed = fixedParts.join(' · ').normalize('NFC').replace(X_INVALID_CHARACTERS, ' ');
  if (!city) return sanitizedFixed;
  const completeLocation = makeSummary(city).normalize('NFC').replace(X_INVALID_CHARACTERS, ' ');
  if (xCandidate(completeLocation, url)) return completeLocation;

  const cityGraphemes = graphemes(city);
  for (let length = cityGraphemes.length - 1; length >= 0; length -= 1) {
    const label = `${cityGraphemes.slice(0, length).join('')}…`;
    const summary = makeSummary(label).normalize('NFC').replace(X_INVALID_CHARACTERS, ' ');
    if (xCandidate(summary, url)) return summary;
  }

  // Required period, count, mode, country and zone are never shortened.
  if (xCandidate(sanitizedFixed, url)) return sanitizedFixed;
  throw new RangeError('The required X agenda summary does not fit the platform limit');
}

function copyText({ selection, period, filters, communityById, url, now }) {
  const timestamp = referenceTimestamp(now);
  const periodLabel = periodCopyLabel(period);
  const mode = modeLabel(filters.mode);
  const location = selectedLocation(filters);
  const lines = [
    'Agenda compartida',
    `Período: ${periodLabel}`,
    `Zona horaria: ${period.timeZone}`,
    `Asistencia: ${mode}`,
  ];
  const locationText = locationLabel(location);
  if (locationText) lines.push(`Ubicación física de referencia: ${locationText}`);
  const community = filters.community ? communityById.get(filters.community) : undefined;
  if (filters.community) lines.push(`Comunidad: ${community?.title ?? filters.community}`);
  lines.push(selection.length === 0 ? 'Eventos seleccionados: 0 resultados' : `Eventos seleccionados: ${selection.length}`, '', ...selection.flatMap(({ event }, index) => {
    const eventLines = [
      `${index + 1}. ${event.title}`,
      dateTimeLine(event, period.timeZone),
      `Asistencia: ${eventAttendanceLabel(event, filters, communityById)}`,
      ...(eventPhysicalLocationLabel(event, filters, communityById)
        ? [`Ubicación presencial: ${eventPhysicalLocationLabel(event, filters, communityById)}`]
        : []),
      event.registrationUrl,
    ];
    if (Date.parse(event.endsAt) <= timestamp) eventLines.push('Finalizado');
    return [...eventLines, ''];
  }), `Abrir agenda del período: ${url}`);
  return lines.join('\n');
}

/**
 * Format the already-selected, ordered event groups for copy and social sharing.
 * This function deliberately does not reselect, paginate, read the DOM, or mutate inputs.
 */
export function buildEventAgendaShare({ selection, period, filters, communityById = new Map(), url, now }) {
  const agendaUrl = canonicalAgendaUrl(url, period, filters);
  const text = copyText({ selection, period, filters, communityById, url: agendaUrl, now });
  const summary = makeXSummary({ selection, period, filters, url: agendaUrl });
  const x = new URL(X_INTENT);
  x.searchParams.set('text', summary);
  x.searchParams.set('url', agendaUrl);
  const linkedIn = new URL(LINKEDIN_INTENT);
  linkedIn.searchParams.set('url', agendaUrl);
  return {
    url: agendaUrl,
    text,
    xHref: x.href,
    linkedInHref: linkedIn.href,
  };
}

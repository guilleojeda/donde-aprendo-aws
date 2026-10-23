import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { eventGroupsForAgenda } from '../src/lib/event-agenda-groups.mjs';
import { createEventAgendaPeriod } from '../src/lib/event-agenda-period.mjs';
import { uniqueEventGroups } from '../src/lib/events.mjs';

let shareApi;
const shareModuleUrl = new URL('../src/lib/event-agenda-share.mjs', import.meta.url).href;
try {
  shareApi = await import(shareModuleUrl);
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== shareModuleUrl) throw error;
  // Keep the planned public API failure inside each acceptance test.
}

const DEFAULT_NOW = Date.parse('2026-10-21T12:00:00.000Z');
const DEFAULT_ZONE = 'America/Argentina/Cordoba';
const LONG_IANA_ZONE = 'America/Argentina/ComodRivadavia';
const DEFAULT_SOURCE_URL = 'https://dondeaprendoaws.com/eventos/?utm_source=agenda-test#eventos';
const requireFromTest = createRequire(import.meta.url);
const X_WEIGHT_LIMIT = 280;

function formatter() {
  assert.ok(shareApi, 'src/lib/event-agenda-share.mjs must expose the agenda share formatter');
  assert.equal(typeof shareApi.buildEventAgendaShare, 'function',
    'event-agenda-share.mjs must export buildEventAgendaShare(input)');
  return shareApi.buildEventAgendaShare;
}

function makePeriod({ view = 'week', date = '2026-10-21', timeZone = DEFAULT_ZONE } = {}) {
  return createEventAgendaPeriod({ view, date, timeZone });
}

function makeEvent(id, overrides = {}) {
  const startsAt = overrides.startsAt ?? '2026-10-21T13:00:00.000Z';
  const endsAt = overrides.endsAt ?? '2026-10-21T14:00:00.000Z';
  assert.ok(Number.isFinite(Date.parse(startsAt)), `${id} has a valid start instant`);
  assert.ok(Number.isFinite(Date.parse(endsAt)), `${id} has a valid end instant`);
  assert.ok(Date.parse(endsAt) > Date.parse(startsAt), `${id} ends after it starts`);
  return {
    recordType: 'event',
    id,
    title: `Encuentro ${id}`,
    description: '',
    startsAt,
    endsAt,
    timeZone: 'UTC',
    organizer: 'Comunidad AWS',
    mode: 'in-person',
    place: 'Centro de eventos',
    country: 'AR',
    venueCountry: 'AR',
    city: 'Córdoba',
    communityId: 'community-ar',
    registrationUrl: `https://meetup.com/aws-latam/events/${id}`,
    ...overrides,
  };
}

function makeGroup(event, events = [event]) {
  return { event, events };
}

function baseInput(selection = [], overrides = {}) {
  return {
    selection,
    period: makePeriod(),
    filters: { mode: '', country: '', city: '', community: '' },
    communityById: new Map(),
    url: DEFAULT_SOURCE_URL,
    now: DEFAULT_NOW,
    ...overrides,
  };
}

function build(selection = [], overrides = {}) {
  const result = formatter()(baseInput(selection, overrides));
  assert.ok(result && typeof result === 'object', 'formatter returns its share outputs');
  for (const key of ['url', 'text', 'xHref', 'linkedInHref']) {
    assert.equal(typeof result[key], 'string', `formatter result includes a string ${key}`);
  }
  return result;
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function postFrom(href, expectedHost, expectedPath) {
  const intent = new URL(href);
  assert.equal(intent.hostname, expectedHost);
  assert.equal(intent.pathname, expectedPath);
  assert.deepEqual([...intent.searchParams.keys()], ['text'],
    'the destination receives one text parameter containing the whole post');
  return intent.searchParams.get('text');
}

function assertSocialTargets(result) {
  const x = new URL(result.xHref);
  assert.ok(['twitter.com', 'x.com'].includes(x.hostname), 'X opens an official web intent host');
  assert.equal(x.pathname, '/intent/tweet');
  assert.deepEqual([...x.searchParams.keys()], ['text'], 'X receives no separate url parameter');
  const linkedIn = new URL(result.linkedInHref);
  assert.equal(linkedIn.hostname, 'www.linkedin.com');
  assert.equal(linkedIn.pathname, '/sharing/share-offsite/');
  assert.deepEqual([...linkedIn.searchParams.keys()], ['text'], 'LinkedIn receives no separate url parameter');

  for (const [name, body] of [
    ['X', x.searchParams.get('text')],
    ['LinkedIn', linkedIn.searchParams.get('text')],
  ]) {
    assert.equal(countOccurrences(body, result.url), 1, `${name} body includes the selected agenda URL exactly once`);
  }
  const copiedUrls = countOccurrences(result.text, result.url);
  assert.equal(copiedUrls, 1, 'copied text includes the selected agenda URL exactly once');
  assertXWeight(x.searchParams.get('text'));
}

function assertXWeight(body) {
  const { parseTweet } = requireFromTest('twitter-text');
  assert.equal(typeof parseTweet, 'function', 'twitter-text exposes parseTweet');
  const parsed = parseTweet(body);
  assert.equal(parsed.valid, true, 'the complete X body, including its in-label URL, forms a valid post');
  assert.ok(parsed.weightedLength <= X_WEIGHT_LIMIT,
    'the complete X body, including its URL, fits the weighted 280-character limit');
  const withComposerSpace = parseTweet(`${body} `);
  assert.equal(withComposerSpace.valid, true, 'X accepts the observed trailing composer space');
  assert.ok(withComposerSpace.weightedLength <= X_WEIGHT_LIMIT,
    'the post still fits when the composer adds its observed trailing space');
}

function xPost(result) {
  const intent = new URL(result.xHref);
  assert.ok(['twitter.com', 'x.com'].includes(intent.hostname), 'X opens an official web intent host');
  assert.equal(intent.pathname, '/intent/tweet');
  assert.deepEqual([...intent.searchParams.keys()], ['text'], 'X receives only the complete post body');
  return intent.searchParams.get('text');
}

function linkedInPost(result) {
  return postFrom(result.linkedInHref, 'www.linkedin.com', '/sharing/share-offsite/');
}

function assertSummaryCount(post, count) {
  assert.match(post, new RegExp(`\\b${count}\\s+eventos?\\b`, 'iu'),
    `the X post identifies the selected occurrence count (${count})`);
}

function timeInZone(instant, timeZone) {
  return new Intl.DateTimeFormat('es', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
  }).format(new Date(instant));
}

function localDateParts(instant, timeZone) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('es', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZone,
  }).formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
  return {
    weekday: values.weekday.replace('.', '').toLocaleLowerCase('es'),
    date: `${values.day}/${values.month}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function monthAndYearInZone(instant, timeZone) {
  return new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone })
    .format(new Date(instant));
}

function copyEventBlock(text, title) {
  const start = text.indexOf(title);
  assert.ok(start >= 0, `text includes the complete event title: ${title.slice(0, 80)}`);
  const titleLineStart = text.lastIndexOf('\n', start - 1) + 1;
  const dateLineBreak = text.lastIndexOf('\n', titleLineStart - 2);
  const eventStart = dateLineBreak + 1;
  const nextBlankLine = text.indexOf('\n\n', start);
  return text.slice(eventStart, nextBlankLine < 0 ? text.length : nextBlankLine);
}

function linkedInEventLine(text, title) {
  const start = text.indexOf(title);
  assert.ok(start >= 0, `LinkedIn body includes the complete event title: ${title.slice(0, 80)}`);
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = text.indexOf('\n', start);
  return text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
}

function canonicalUrl({ date, view = 'week', timeZone = DEFAULT_ZONE, mode = '', country = '', city = '', community = '' }) {
  const search = new URLSearchParams();
  search.set('view', view);
  search.set('date', date);
  search.set('tz', timeZone);
  if (mode) search.set('mode', mode);
  if (country) search.set('country', country);
  if (city) search.set('city', city);
  if (community) search.set('community', community);
  return `https://dondeaprendoaws.com/eventos/?${search}`;
}

test('exports the public pure agenda-share API', () => {
  assert.equal(typeof formatter(), 'function');
});

test('matches the user-approved three-event copy, LinkedIn and X examples', () => {
  const period = makePeriod({ date: '2026-10-19' });
  const filters = { mode: '', country: 'AR', city: 'AR:Córdoba', community: '' };
  const events = [
    makeEvent('golden-serverless', {
      title: 'Arquitecturas serverless', mode: 'online', place: undefined,
      country: undefined, venueCountry: undefined, city: undefined,
      startsAt: '2026-10-21T21:00:00.000Z', endsAt: '2026-10-21T22:00:00.000Z',
      registrationUrl: 'https://meetup.com/aws-latam/events/serverless',
    }),
    makeEvent('golden-cordoba', {
      title: 'Meetup AWS Córdoba', mode: 'in-person',
      startsAt: '2026-10-22T22:00:00.000Z', endsAt: '2026-10-22T23:00:00.000Z',
      registrationUrl: 'https://meetup.com/aws-latam/events/cordoba',
    }),
    makeEvent('golden-security', {
      title: 'Seguridad en AWS', mode: 'online', place: undefined,
      country: undefined, venueCountry: undefined, city: undefined,
      startsAt: '2026-10-24T14:00:00.000Z', endsAt: '2026-10-24T15:00:00.000Z',
      registrationUrl: 'https://meetup.com/aws-latam/events/security',
    }),
  ];
  assert.deepEqual(events.map(({ startsAt }) => startsAt), [...events.map(({ startsAt }) => startsAt)].sort(),
    'golden event fixtures are in chronological selection order');
  const expectedLocalStarts = [
    { weekday: 'mié', date: '21/10', time: '18:00' },
    { weekday: 'jue', date: '22/10', time: '19:00' },
    { weekday: 'sáb', date: '24/10', time: '11:00' },
  ];
  assert.deepEqual(events.map(({ startsAt }) => localDateParts(startsAt, DEFAULT_ZONE)), expectedLocalStarts,
    'the golden dates and weekdays are independently confirmed with Intl in Córdoba');
  assert.deepEqual(localDateParts(period.start, DEFAULT_ZONE).date, '19/10',
    'the weekly fixture begins on Monday, 19 October in the selected zone');
  assert.deepEqual(localDateParts(period.end - 1, DEFAULT_ZONE).date, '25/10',
    'the weekly fixture ends on Sunday, 25 October in the selected zone');
  const selection = events.map((event) => makeGroup(event));
  const result = build(selection, { period, filters });
  const agendaUrl = canonicalUrl({ date: '2026-10-19', country: 'AR', city: 'AR:Córdoba' });
  assert.equal(result.url, agendaUrl, 'the example URL names the concrete week, zone and location');

  const expectedCopy = `*Agenda eventos AWS, 19-25 de octubre*\nPresenciales en Córdoba, Argentina, y online.\nHorarios de Córdoba, Argentina (UTC-3).\n\n*Mié 21/10, 18:00*\nArquitecturas serverless\nOnline\n${events[0].registrationUrl}\n\n*Jue 22/10, 19:00*\nMeetup AWS Córdoba\nPresencial: Córdoba, Argentina\n${events[1].registrationUrl}\n\n*Sáb 24/10, 11:00*\nSeguridad en AWS\nOnline\n${events[2].registrationUrl}\n\nConsultar la agenda completa:\n${agendaUrl}`;
  const expectedLinkedIn = `Eventos para aprender AWS, del 19 al 25 de octubre. Presenciales en Córdoba, Argentina, y opciones online.\n- Mié 21/10, 18:00: Arquitecturas serverless - Online\n- Jue 22/10, 19:00: Meetup AWS Córdoba - Presencial\n- Sáb 24/10, 11:00: Seguridad en AWS - Online\n\nHorarios de Córdoba, Argentina (UTC-3).\n\nDetalles e inscripciones:\n${agendaUrl}`;
  const expectedX = `Agenda de eventos para aprender AWS, 19-25 de octubre. 3 eventos presenciales en Córdoba, Argentina, y online.\n\nAgenda completa e inscripciones:\n${agendaUrl}`;
  assert.equal(result.text, expectedCopy, 'copy preserves the exact approved wording, list, punctuation and asterisks');
  assert.equal(linkedInPost(result), expectedLinkedIn, 'LinkedIn receives the exact approved full-list example');
  assert.equal(xPost(result), expectedX, 'X receives the exact approved concise example');
  assertSocialTargets(result);
  for (const event of events) {
    assert.equal(countOccurrences(result.text, event.registrationUrl), 1,
      'copy includes each original registration URL exactly once');
  }
  assert.doesNotMatch(result.text, /&amp;|&lt;|&gt;|<\/?(?:p|a|div|br)\b/iu,
    'copy is plain text, not escaped HTML');
});

test('copies all selected occurrences once in supplied order, including Unicode and registration URLs', () => {
  const events = Array.from({ length: 15 }, (_, index) => makeEvent(`share-${index + 1}`, {
    title: index === 0 ? 'Diseño <AWS & datos> — café' : `Encuentro compartible ${index + 1}`,
    startsAt: new Date(Date.parse('2026-10-21T13:00:00.000Z') + index * 60_000).toISOString(),
    endsAt: new Date(Date.parse('2026-10-21T14:00:00.000Z') + index * 60_000).toISOString(),
    mode: 'online', place: undefined, country: undefined, venueCountry: undefined, city: undefined,
    registrationUrl: `https://meetup.com/aws-latam/events/${index + 1}?source=share&lang=es`,
  }));
  const result = build(events.map((event) => makeGroup(event)), {
    period: makePeriod({ view: 'month', date: '2026-10-21' }),
  });

  let previousTitleIndex = -1;
  for (const event of events) {
    assert.equal(countOccurrences(result.text, event.title), 1, `${event.title} is copied exactly once`);
    assert.equal(countOccurrences(result.text, event.registrationUrl), 1,
      `${event.registrationUrl} is copied exactly once`);
    const titleIndex = result.text.indexOf(event.title);
    assert.ok(titleIndex > previousTitleIndex, 'copy keeps the complete selected occurrence order');
    previousTitleIndex = titleIndex;
  }
  assert.ok(result.text.includes('Diseño <AWS & datos> — café'), 'copy preserves Unicode and literal text');
  assert.ok(result.text.includes('source=share&lang=es'), 'copy preserves the original registration URL');
  assert.equal(countOccurrences(result.text, result.url), 1, 'copy includes the canonical period URL once');
  assert.doesNotMatch(result.text, /&amp;|&lt;|&gt;|<\/?(?:p|a|div|br)\b/iu,
    'copy is plain text rather than HTML-escaped content');
  assertSocialTargets(result);
  const x = xPost(result);
  assert.ok(!events.every(({ title }) => x.includes(title)), 'X does not enumerate the full event list');
});

test('uses the agenda selector representative once for a co-hosted occurrence', () => {
  const now = Date.parse('2026-10-21T16:00:00.000Z');
  const older = makeEvent('cohost-a-old', {
    title: 'Sesión coorganizada', startsAt: '2026-10-21T14:30:00.000Z', endsAt: '2026-10-21T15:00:00.000Z',
    place: 'Centro AWS Córdoba', registrationUrl: 'https://meetup.com/aws-latam/events/shared?host=old',
  });
  const active = makeEvent('cohost-z-active', {
    title: 'Sesión coorganizada', startsAt: '2026-10-21T14:30:00.000Z', endsAt: '2026-10-22T03:30:00.000Z',
    place: 'Centro AWS-Córdoba', registrationUrl: 'https://meetup.com/aws-latam/events/shared?host=active',
  });
  const groups = uniqueEventGroups([older, active]);
  assert.equal(groups.length, 1, 'the public event helper forms one co-host group');
  const [selected] = eventGroupsForAgenda(groups, {
    now, includeEnded: true, period: makePeriod(),
    filters: { mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: '' },
  });
  assert.equal(selected.event.id, 'cohost-z-active', 'the agenda selector chooses the active display row');
  assert.equal(selected.events.length, 2, 'the selected occurrence retains both co-host rows');

  const result = build([selected], {
    now, filters: { mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: '' },
  });
  assert.equal(countOccurrences(result.text, 'Sesión coorganizada'), 1, 'the occurrence appears once');
  assert.equal(countOccurrences(result.text, active.registrationUrl), 1,
    'copy uses the selected representative registration URL');
  assert.ok(!result.text.includes(older.registrationUrl), 'copy omits the hidden co-host registration URL');
  const copied = copyEventBlock(result.text, 'Sesión coorganizada');
  assert.ok(copied.includes('21/10') && copied.includes('22/10'),
    'the copied interval preserves its end date when it crosses the selected-zone day boundary');
  assert.ok(copied.includes(timeInZone(active.startsAt, DEFAULT_ZONE))
    && copied.includes(timeInZone(active.endsAt, DEFAULT_ZONE)), 'the representative supplies both interval times');
  assert.equal(countOccurrences(linkedInPost(result), 'Sesión coorganizada'), 1,
    'the social list uses the same representative once');
});

test('keeps full long titles and the full registration link in copy', () => {
  const title = `Taller de arquitectura ${'AWS y datos '.repeat(500)}fin`;
  const event = makeEvent('long-copy', {
    title, mode: 'hybrid', place: 'Centro de aprendizaje',
    registrationUrl: 'https://example.test/register?event=long-copy&source=agenda',
  });
  const result = build([makeGroup(event)]);

  assert.ok(result.text.length > 5_000, 'copy has no arbitrary text-length cap');
  assert.ok(result.text.includes(title), 'the complete long title remains in copy');
  assert.ok(result.text.includes(event.registrationUrl), 'the original registration link remains complete');
  assert.match(result.text, /presencial|físic/iu, 'hybrid attendance retains its physical option');
  assert.match(result.text, /remot[oa]|online|en línea/iu, 'hybrid attendance retains its remote option');
  assert.doesNotMatch(result.text, /gratis|gratuito/iu, 'the formatter makes no unsupported price claim');
});

test('formats event dates and times in the selected zone across local midnight and a year boundary', () => {
  const crossingLocalDay = makeEvent('cordoba-midnight', {
    title: 'Sesión que cruza la medianoche', startsAt: '2026-10-22T02:30:00.000Z',
    endsAt: '2026-10-22T03:30:00.000Z', timeZone: 'UTC', mode: 'online',
    place: undefined, country: undefined, venueCountry: undefined, city: undefined,
  });
  assert.deepEqual(localDateParts(crossingLocalDay.startsAt, DEFAULT_ZONE),
    { weekday: 'mié', date: '21/10', time: '23:30' });
  assert.deepEqual(localDateParts(crossingLocalDay.endsAt, DEFAULT_ZONE),
    { weekday: 'jue', date: '22/10', time: '00:30' });
  const localResult = build([makeGroup(crossingLocalDay)], {
    period: makePeriod({ view: 'week', date: '2026-10-19', timeZone: DEFAULT_ZONE }),
  });
  const localCopy = copyEventBlock(localResult.text, crossingLocalDay.title);
  const localLinkedIn = linkedInEventLine(linkedInPost(localResult), crossingLocalDay.title);
  for (const text of [localCopy, localLinkedIn]) {
    assert.ok(text.includes('21/10') && text.includes('22/10'),
      'both local dates remain visible when the event crosses midnight');
    assert.ok(text.includes(timeInZone(crossingLocalDay.startsAt, DEFAULT_ZONE))
      && text.includes(timeInZone(crossingLocalDay.endsAt, DEFAULT_ZONE)),
    'start and end are shown in the selected zone, not the stored UTC zone');
  }

  const yearBoundary = makeEvent('year-boundary', {
    title: 'Encuentro entre dos años', startsAt: '2027-01-01T02:30:00.000Z',
    endsAt: '2027-01-01T03:30:00.000Z', mode: 'online',
    place: undefined, country: undefined, venueCountry: undefined, city: undefined,
  });
  assert.deepEqual(localDateParts(yearBoundary.startsAt, DEFAULT_ZONE),
    { weekday: 'jue', date: '31/12', time: '23:30' });
  assert.deepEqual(localDateParts(yearBoundary.endsAt, DEFAULT_ZONE),
    { weekday: 'vie', date: '01/01', time: '00:30' });
  const yearResult = build([makeGroup(yearBoundary)], {
    period: makePeriod({ date: '2026-12-28', timeZone: DEFAULT_ZONE }),
  });
  for (const text of [copyEventBlock(yearResult.text, yearBoundary.title), linkedInEventLine(linkedInPost(yearResult), yearBoundary.title)]) {
    assert.match(text, /31\/12/u);
    assert.match(text, /01\/01/u);
    assert.match(text, /2026/u);
    assert.match(text, /2027/u);
  }

  const multiDay = makeEvent('multi-day', {
    title: 'Encuentro de más de un día', startsAt: '2026-10-25T01:00:00.000Z',
    endsAt: '2026-10-26T12:00:00.000Z', mode: 'online',
    place: undefined, country: undefined, venueCountry: undefined, city: undefined,
  });
  assert.deepEqual(localDateParts(multiDay.startsAt, DEFAULT_ZONE),
    { weekday: 'sáb', date: '24/10', time: '22:00' });
  assert.deepEqual(localDateParts(multiDay.endsAt, DEFAULT_ZONE),
    { weekday: 'lun', date: '26/10', time: '09:00' });
  const multiDayResult = build([makeGroup(multiDay)], {
    period: makePeriod({ date: '2026-10-19', timeZone: DEFAULT_ZONE }),
  });
  for (const text of [copyEventBlock(multiDayResult.text, multiDay.title), linkedInEventLine(linkedInPost(multiDayResult), multiDay.title)]) {
    assert.ok(text.includes('24/10') && text.includes('26/10'),
      'a multi-day event retains its full selected-zone date range');
    assert.ok(text.includes('22:00') && text.includes('09:00'), 'both ends of the multi-day interval remain visible');
  }
});

test('uses concrete week and month periods and names both ends of a week crossing month and year', () => {
  const event = makeEvent('period-labels', { title: 'Evento de referencia' });
  const weekResult = build([makeGroup(event)], { period: makePeriod({ date: '2026-10-19' }) });
  const weekTexts = [weekResult.text, linkedInPost(weekResult), xPost(weekResult)];
  assert.ok(weekTexts.every((text) => text.includes('octubre') && text.includes('19') && text.includes('25')),
    'the weekly output identifies the selected dates and month');

  const month = makePeriod({ view: 'month', date: '2026-10-21', timeZone: 'UTC' });
  const monthResult = build([makeGroup(event)], { period: month });
  const monthTexts = [monthResult.text, linkedInPost(monthResult), xPost(monthResult)];
  assert.ok(monthTexts.every((text) => text.includes('octubre') && text.includes('2026')),
    'the monthly output identifies its calendar month and year');

  const crossMonthPeriod = makePeriod({ date: '2026-08-31', timeZone: DEFAULT_ZONE });
  assert.equal(localDateParts(crossMonthPeriod.start, DEFAULT_ZONE).date, '31/08');
  assert.equal(localDateParts(crossMonthPeriod.end - 1, DEFAULT_ZONE).date, '06/09');
  const crossMonthResult = build([makeGroup(event)], { period: crossMonthPeriod });
  for (const text of [crossMonthResult.text, linkedInPost(crossMonthResult), xPost(crossMonthResult)]) {
    assert.ok(text.includes('agosto') && text.includes('septiembre'),
      'both month names appear when a week crosses a month boundary');
    assert.match(text, /31\D{0,15}agosto/iu, 'the first boundary date is named');
    assert.match(text, /6\D{0,15}septiembre/iu, 'the final boundary date is named');
  }
  assert.equal(new URL(crossMonthResult.url).searchParams.get('date'), '2026-08-31',
    'the concrete link retains the year even when the period text does not need it');

  const crossYearPeriod = makePeriod({ date: '2026-12-28', timeZone: DEFAULT_ZONE });
  assert.equal(localDateParts(crossYearPeriod.start, DEFAULT_ZONE).date, '28/12');
  assert.equal(localDateParts(crossYearPeriod.end - 1, DEFAULT_ZONE).date, '03/01');
  const crossYearResult = build([makeGroup(event)], { period: crossYearPeriod });
  for (const text of [crossYearResult.text, linkedInPost(crossYearResult), xPost(crossYearResult)]) {
    assert.ok(text.includes('diciembre') && text.includes('enero'), 'both sides of the week are named');
    assert.ok(text.includes('2026') && text.includes('2027'), 'both years are named when the week crosses years');
  }
});

test('labels ended entries, keeps in-progress events and leaves status out of X', () => {
  const ended = makeEvent('ended-share', {
    title: 'Sesión AWS concluida', startsAt: '2026-10-21T09:00:00.000Z', endsAt: '2026-10-21T12:00:00.000Z',
  });
  const current = makeEvent('current-share', {
    title: 'Encuentro en curso', startsAt: '2026-10-21T11:00:00.000Z', endsAt: '2026-10-21T13:00:00.000Z',
  });
  const result = build([makeGroup(ended), makeGroup(current)], { now: DEFAULT_NOW });
  const endedCopy = copyEventBlock(result.text, ended.title);
  const currentCopy = copyEventBlock(result.text, current.title);
  const linkedIn = linkedInPost(result);
  const x = xPost(result);

  assert.match(endedCopy, /Finalizado/iu, 'an included ended event is marked in copy');
  assert.match(linkedInEventLine(linkedIn, ended.title), /Finalizado/iu,
    'an included ended event is marked in LinkedIn');
  assert.ok(!/Finalizado/iu.test(currentCopy), 'a current event is not labeled finalized');
  assert.ok(!/Finalizado/iu.test(linkedInEventLine(linkedIn, current.title)), 'a current event is not labeled finalized in LinkedIn');
  assert.doesNotMatch(x, /Finalizado/iu, 'X does not add per-event status to its non-enumerating summary');
  const currentOnly = build([makeGroup(current)], { now: DEFAULT_NOW });
  assert.ok(currentOnly.text.includes(current.title), 'an in-progress event remains independently shareable');
  assert.doesNotMatch(currentOnly.text, /Finalizado/iu);
});

test('uses the effective community venue in copy and does not turn online filters into a location claim', () => {
  const community = {
    id: 'community-cordoba', title: 'AWS User Group Córdoba', url: 'https://example.test/aws-cordoba',
    description: '', category: 'Comunidad', order: 1, featured: false, kind: 'community', format: 'community',
    topics: [], country: 'AR', city: 'Córdoba',
  };
  const fallbackVenue = makeEvent('fallback-venue', {
    title: 'Encuentro con ubicación de comunidad', communityId: community.id,
    country: undefined, venueCountry: undefined, city: undefined, place: 'Centro de eventos',
  });
  const communityById = new Map([[community.id, community]]);
  const physicalFilters = { mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: community.id };
  const fallbackSelection = eventGroupsForAgenda(uniqueEventGroups([fallbackVenue], communityById), {
    communityById, filters: physicalFilters, period: makePeriod(), includeEnded: true, now: DEFAULT_NOW,
  });
  assert.equal(fallbackSelection.length, 1, 'the agenda selector uses the community location fallback');
  const fallbackResult = build(fallbackSelection, { communityById, filters: physicalFilters });
  assert.ok(fallbackResult.text.includes(community.title), 'copy includes a selected community context');
  assert.ok(fallbackResult.text.includes('Córdoba'), 'the fallback location is shown on physical attendance');
  assert.match(fallbackResult.text, /Argentina/iu, 'the fallback country is shown');

  const hybridOutsideLocation = makeEvent('remote-hybrid', {
    title: 'Híbrido remoto desde Bogotá', mode: 'hybrid', country: 'CO', venueCountry: 'CO', city: 'Bogotá',
    place: 'Centro AWS Bogotá', communityId: 'community-co',
  });
  const onlineOnly = makeEvent('online-only', {
    title: 'Sesión sólo en línea', mode: 'online', country: undefined, venueCountry: undefined,
    city: undefined, place: undefined, communityId: undefined,
  });
  const retainedLocationFilters = { mode: 'online', country: 'AR', city: 'AR:Córdoba', community: '' };
  const onlineSelection = eventGroupsForAgenda(uniqueEventGroups([hybridOutsideLocation, onlineOnly]), {
    filters: retainedLocationFilters, period: makePeriod(), includeEnded: true, now: DEFAULT_NOW,
  });
  assert.equal(onlineSelection.length, 2,
    'the selector keeps remote-capable hybrid and online events despite the retained city');
  const onlineResult = build(onlineSelection, { filters: retainedLocationFilters });
  assert.match(onlineResult.text, /Online \(evento híbrido\)|participación remota|remota/iu,
    'the remote hybrid is identified as remote participation');
  assert.match(onlineResult.text, /Online|en línea/iu, 'online-only events remain identified as online');
  for (const body of [onlineResult.text, linkedInPost(onlineResult), xPost(onlineResult)]) {
    assert.doesNotMatch(body, /Ubicación presencial|Centro AWS Bogotá|Presencial: Córdoba/iu,
      'remote participation does not display an inactive physical restriction');
  }
  const onlineUrl = new URL(onlineResult.url);
  assert.equal(onlineUrl.searchParams.get('mode'), retainedLocationFilters.mode);
  assert.equal(onlineUrl.searchParams.get('country'), retainedLocationFilters.country);
  assert.equal(onlineUrl.searchParams.get('city'), retainedLocationFilters.city,
    'the selected location remains in the link even when online mode makes it inactive');
  assert.ok(!onlineUrl.searchParams.has('includeEnded'), 'the checkbox state is not shared');
});

test('keeps community context only in copy when that community is selected', () => {
  const communityId = 'community-only-context';
  const community = { id: communityId, title: 'AWS Comunidad Sur', country: 'AR', city: 'Córdoba' };
  const event = makeEvent('community-copy', { title: 'Sesión de la comunidad', communityId });
  const result = build([makeGroup(event)], {
    filters: { mode: '', country: '', city: '', community: communityId },
    communityById: new Map([[communityId, community]]),
  });
  assert.match(result.text, /Comunidad: AWS Comunidad Sur/u);
  assert.ok(!linkedInPost(result).includes(community.title), 'LinkedIn does not add organizer lists or metadata');
  assert.ok(!xPost(result).includes(community.title), 'X does not add organizer lists or metadata');
  assert.equal(new URL(result.url).searchParams.get('community'), communityId);
});

test('uses frozen inputs without reading a DOM view or mutating the selection', () => {
  const event = Object.freeze(makeEvent('frozen-share', { title: 'Selección congelada' }));
  const events = Object.freeze([event]);
  const selectedGroup = Object.freeze({ event, events });
  const selection = Object.freeze([selectedGroup]);
  const period = Object.freeze(makePeriod());
  const filters = Object.freeze({ mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: '' });
  const community = Object.freeze({
    id: 'community-ar', title: 'AWS Córdoba', url: 'https://example.test/aws-cordoba', description: '',
    category: 'Comunidad', order: 1, featured: false, kind: 'community', format: 'community', topics: [],
    country: 'AR', city: 'Córdoba',
  });
  const communityById = new Map([[community.id, community]]);
  for (const method of ['set', 'delete', 'clear']) {
    Object.defineProperty(communityById, method, {
      value() { throw new Error(`formatter must not call Map.${method}`); },
    });
  }
  Object.freeze(communityById);
  const domView = new Proxy(Object.create(null), {
    get(_target, property) { throw new Error(`formatter tried to read DOM view.${String(property)}`); },
    ownKeys() { throw new Error('formatter tried to inspect the DOM view'); },
  });
  const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    get() { throw new Error('formatter tried to query document'); },
  });

  try {
    const input = baseInput(selection, { period, filters, communityById });
    input.view = domView;
    const result = formatter()(input);
    assert.ok(result.text.includes(event.title));
    assert.equal(selection[0].event, event);
    assert.deepEqual(selection[0].events, [event]);
    assert.deepEqual(filters, { mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: '' });
    assert.deepEqual(period, makePeriod());
    assert.deepEqual([...communityById], [[community.id, community]]);
  } finally {
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument);
    else delete globalThis.document;
  }
});

test('keeps the agenda URL stable when the checkbox changes the current selection', () => {
  const ended = makeEvent('checkbox-ended', {
    title: 'Evento visible con finalizados', startsAt: '2026-10-21T09:00:00.000Z', endsAt: '2026-10-21T10:00:00.000Z',
  });
  const current = makeEvent('checkbox-current', {
    title: 'Evento visible en curso', startsAt: '2026-10-21T11:00:00.000Z', endsAt: '2026-10-21T13:00:00.000Z',
  });
  const filters = { mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: '' };
  const withEnded = build([makeGroup(ended), makeGroup(current)], { filters });
  const withoutEnded = build([makeGroup(current)], { filters });

  assert.equal(withEnded.url, withoutEnded.url, 'the destination URL depends on period and filters');
  assert.notEqual(withEnded.text, withoutEnded.text, 'copy follows the selected occurrences');
  assert.notEqual(xPost(withEnded), xPost(withoutEnded), 'X count follows the selected occurrences');
  assertSummaryCount(xPost(withEnded), 2);
  assertSummaryCount(xPost(withoutEnded), 1);
  assert.ok(!new URL(withEnded.url).searchParams.has('includeEnded'));
  assert.ok(!new URL(withoutEnded.url).searchParams.has('includeEnded'));
});

test('builds the canonical global URL from the concrete period and resolved special-character filters', () => {
  const communityId = 'community-cordoba';
  const filters = { mode: 'hybrid', country: 'AR', city: 'AR:Córdoba & Alta+Gracia?#', community: communityId };
  const community = {
    id: communityId, title: 'Comunidad AWS Córdoba', url: 'https://example.test/comunidad-cordoba', description: '',
    category: 'Comunidad', order: 1, featured: false, kind: 'community', format: 'community', topics: [],
  };
  const result = build([makeGroup(makeEvent('canonical-url', {
    mode: 'hybrid', city: 'Córdoba & Alta+Gracia?#', communityId,
  }))], {
    period: makePeriod({ view: 'month', date: '2026-10-21', timeZone: DEFAULT_ZONE }),
    filters, communityById: new Map([[communityId, community]]),
    url: 'https://dondeaprendoaws.com/eventos/online/?utm_source=old&mode=online&from=2026-10-01&to=2026-10-31&includeEnded=0&legacy=keep-out#fragment',
  });
  const canonical = new URL(result.url);
  assert.equal(canonical.origin, 'https://dondeaprendoaws.com', 'the source page origin is reused');
  assert.equal(canonical.pathname, '/eventos/', 'share always opens the global agenda route');
  assert.equal(canonical.hash, '', 'the source fragment is cleared');
  assert.deepEqual([...canonical.searchParams.keys()].sort(),
    ['city', 'community', 'country', 'date', 'mode', 'tz', 'view'].sort(),
    'the URL contains only concrete period and resolved agenda filters');
  assert.equal(canonical.searchParams.get('view'), 'month');
  assert.equal(canonical.searchParams.get('date'), '2026-10-21');
  assert.equal(canonical.searchParams.get('tz'), DEFAULT_ZONE);
  assert.equal(canonical.searchParams.get('mode'), filters.mode);
  assert.equal(canonical.searchParams.get('country'), filters.country);
  assert.equal(canonical.searchParams.get('city'), filters.city, 'Unicode and query delimiters round-trip safely');
  assert.equal(canonical.searchParams.get('community'), communityId);
  for (const staleKey of ['utm_source', 'from', 'to', 'includeEnded', 'legacy']) {
    assert.ok(!canonical.searchParams.has(staleKey), `${staleKey} is not inherited from the source URL`);
  }
  assertSocialTargets(result);

  const cleared = build([], {
    period: makePeriod({ view: 'week', date: '2026-10-21', timeZone: 'UTC' }),
    filters: { mode: '', country: '', city: '', community: '' },
    url: 'https://dondeaprendoaws.com/eventos/online/?mode=online&country=AR&city=AR%3AC%C3%B3rdoba&from=old#old',
  });
  const clearedUrl = new URL(cleared.url);
  assert.equal(clearedUrl.pathname, '/eventos/');
  assert.deepEqual([...clearedUrl.searchParams.keys()].sort(), ['date', 'tz', 'view'],
    'empty resolved filters remove old route defaults and URL state');
  assert.equal(clearedUrl.searchParams.get('tz'), 'UTC');
});

test('keeps a zero-result selection shareable and reports the empty state without inventing events', () => {
  const result = build([], {
    period: makePeriod({ view: 'month', date: '2026-10-01', timeZone: 'UTC' }),
    url: 'https://dondeaprendoaws.com/eventos/?empty-case=1',
  });
  const emptyPhrase = 'No hay eventos que coincidan con estos filtros';
  assert.ok(result.text.includes(emptyPhrase));
  assert.ok(linkedInPost(result).includes(emptyPhrase));
  const x = xPost(result);
  assert.ok(x.includes(emptyPhrase));
  assertSummaryCount(x, 0);
  assert.ok(result.text.includes(monthAndYearInZone(Date.parse('2026-10-01T00:00:00.000Z'), 'UTC')));
  assert.equal(new URL(result.url).pathname, '/eventos/');
  assertSocialTargets(result);
});

test('uses singular count for one X result and leaves titles and the zone out of the X post', () => {
  const event = makeEvent('one-x', { title: 'Nombre único del encuentro' });
  const result = build([makeGroup(event)], { period: makePeriod({ date: '2026-10-19' }) });
  const x = xPost(result);
  assert.match(x, /1 evento\b/u);
  assert.doesNotMatch(x, /1 eventos\b/u);
  assert.ok(!x.includes(event.title), 'X links to the full agenda rather than enumerating events');
  assert.doesNotMatch(x, /Resumen|America\/|UTC|GMT|horarios/iu,
    'X does not add a summary prefix or a separate time-zone line');
  assertSocialTargets(result);
});

test('uses the selected zone independently from the physical location', () => {
  const event = makeEvent('zone-independent', {
    title: 'Encuentro físico en Córdoba', startsAt: '2026-10-21T21:00:00.000Z',
    endsAt: '2026-10-21T22:00:00.000Z',
  });
  assert.deepEqual(localDateParts(event.startsAt, 'America/Bogota'),
    { weekday: 'mié', date: '21/10', time: '16:00' },
    'Intl confirms this fixture is two hours behind its Córdoba venue label');
  const result = build([makeGroup(event)], {
    period: makePeriod({ date: '2026-10-19', timeZone: 'America/Bogota' }),
    filters: { mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: '' },
  });
  const copied = copyEventBlock(result.text, event.title);
  const linkedIn = linkedInEventLine(linkedInPost(result), event.title);
  assert.ok(copied.includes('16:00') && linkedIn.includes('16:00'),
    'event times follow Bogotá (UTC-5), although the venue filter is Córdoba');
  assert.ok(!copied.includes('18:00') && !linkedIn.includes('18:00'),
    'event times do not follow the Córdoba filter city');
  for (const text of [result.text, linkedInPost(result)]) {
    const start = text.indexOf('Horarios');
    assert.ok(start >= 0, 'the selected zone is named in long-form destinations');
    const line = text.slice(start, text.indexOf('\n', start));
    assert.match(line, /Bogotá|America\/Bogota/u, 'the selected time zone is independent of venue city');
    assert.match(line, /(?:UTC|GMT)[ -−]?5|[−-]05:00/u, 'the offset applies to the event dates');
  }
});

test('shows both offsets when a monthly selection crosses a daylight-saving change', () => {
  const first = makeEvent('dst-before', {
    title: 'Sesión antes del cambio', mode: 'online', place: undefined,
    country: undefined, venueCountry: undefined, city: undefined,
    startsAt: '2026-11-01T05:30:00.000Z', endsAt: '2026-11-01T06:00:00.000Z',
  });
  const second = makeEvent('dst-after', {
    title: 'Sesión después del cambio', mode: 'online', place: undefined,
    country: undefined, venueCountry: undefined, city: undefined,
    startsAt: '2026-11-15T15:00:00.000Z', endsAt: '2026-11-15T16:00:00.000Z',
  });
  const offsetAt = (instant) => new Intl.DateTimeFormat('en', {
    timeZone: 'America/New_York', timeZoneName: 'shortOffset',
  }).formatToParts(new Date(instant)).find(({ type }) => type === 'timeZoneName').value;
  assert.match(offsetAt(first.startsAt), /-4/u, 'the first fixture date uses New York UTC-4');
  assert.match(offsetAt(second.startsAt), /-5/u, 'the second fixture date uses New York UTC-5');
  const result = build([makeGroup(first), makeGroup(second)], {
    period: makePeriod({ view: 'month', date: '2026-11-01', timeZone: 'America/New_York' }),
  });
  for (const text of [result.text, linkedInPost(result)]) {
    const start = text.indexOf('Horarios');
    assert.ok(start >= 0, 'the selected zone and offsets are given in long-form destinations');
    const line = text.slice(start, text.indexOf('\n', start));
    assert.match(line, /[−-]0?4/u, 'the text includes the UTC-4 offset used before the clock change');
    assert.match(line, /[−-]0?5/u, 'the text includes the UTC-5 offset used after the clock change');
  }
  assertXWeight(xPost(result));
  assert.doesNotMatch(xPost(result), /America\/New_York|Horarios|UTC|GMT/iu,
    'X remains the short format without a time-zone line');
});

test('uses the complete LinkedIn list at exactly 3,000 UTF-16 units and the summary above it', () => {
  const period = makePeriod({ date: '2026-10-19' });
  const filters = { mode: '', country: 'AR', city: 'AR:Córdoba', community: '' };
  const agendaUrl = canonicalUrl({ date: '2026-10-19', country: 'AR', city: 'AR:Córdoba' });
  const marker = '⟦TÍTULO⟧';
  const approvedOneEventShape = `Eventos para aprender AWS, del 19 al 25 de octubre. Presenciales en Córdoba, Argentina, y opciones online.\n- Mié 21/10, 18:00: ${marker} - Online\n\nHorarios de Córdoba, Argentina (UTC-3).\n\nDetalles e inscripciones:\n${agendaUrl}`;
  const emoji = '👨‍👩‍👧‍👦';
  function boundaryTitle(targetLength) {
    const wantedLength = targetLength - approvedOneEventShape.length + marker.length;
    assert.ok(wantedLength > emoji.length, 'fixture leaves room for a complete emoji sequence near the limit');
    return `${'T'.repeat(wantedLength - emoji.length)}${emoji}`;
  }

  const exactTitle = boundaryTitle(3_000);
  const overLimitTitle = boundaryTitle(3_001);
  assert.equal(approvedOneEventShape.replace(marker, exactTitle).length, 3_000,
    'the independent approved-template fixture measures exactly 3,000 UTF-16 units');
  assert.equal(approvedOneEventShape.replace(marker, overLimitTitle).length, 3_001,
    'the next independent approved-template fixture measures exactly 3,001 UTF-16 units');
  assert.ok(exactTitle.endsWith(emoji) && overLimitTitle.endsWith(emoji),
    'the complete emoji sequence sits at the edge of both title fixtures');
  const atLimit = makeEvent('linkedin-3000', {
    title: exactTitle, mode: 'online', place: undefined,
    country: undefined, venueCountry: undefined, city: undefined,
    startsAt: '2026-10-21T21:00:00.000Z', endsAt: '2026-10-21T22:00:00.000Z',
  });
  const exact = build([makeGroup(atLimit)], { period, filters });
  const exactBody = linkedInPost(exact);
  assert.equal(exactBody.length, 3_000, 'the approved full list is measured in UTF-16 units');
  assert.ok(exactBody.includes(atLimit.title), 'the complete title, including its boundary emoji, remains');
  assert.ok(!exactBody.includes('La lista completa de eventos'), 'the full list is used at the inclusive boundary');
  assert.ok(exact.text.includes(atLimit.title), 'copy remains complete at the LinkedIn boundary');

  const overLimit = makeEvent('linkedin-3001', {
    title: overLimitTitle, mode: 'online', place: undefined,
    country: undefined, venueCountry: undefined, city: undefined,
    startsAt: '2026-10-21T21:00:00.000Z', endsAt: '2026-10-21T22:00:00.000Z',
  });
  const over = build([makeGroup(overLimit)], { period, filters });
  const summary = linkedInPost(over);
  assert.ok(summary.length < 3_000, 'the replacement summary fits the published LinkedIn ceiling');
  assert.ok(!summary.includes(overLimit.title), 'overflow replaces the entire event list');
  assert.match(summary, /1 evento\b/u, 'the replacement retains the selected occurrence count');
  assert.ok(summary.includes('19') && summary.includes('25') && summary.includes('octubre'),
    'the replacement retains the selected week');
  assert.match(summary, /Horarios.*Córdoba.*UTC-3/u, 'the replacement retains the selected zone and offset');
  assert.match(summary, /lista completa de eventos.*inscripciones/iu,
    'the replacement labels the link to the complete agenda');
  assert.equal(countOccurrences(summary, over.url), 1, 'the summary keeps the complete agenda link once');
  assert.ok(over.text.includes(overLimit.title), 'copy keeps the full long title despite LinkedIn overflow');
  assert.ok(over.text.includes(overLimit.registrationUrl), 'copy keeps the original registration link');
});

test('replaces an over-limit LinkedIn enumeration with the approved 48-event monthly summary', () => {
  const events = Array.from({ length: 48 }, (_, index) => makeEvent(`linkedin-month-${index + 1}`, {
    title: `Encuentro mensual ${index + 1} ${'arquitectura AWS '.repeat(12)}`,
    mode: 'hybrid', startsAt: new Date(Date.parse('2026-10-01T13:00:00.000Z') + index * 60_000).toISOString(),
    endsAt: new Date(Date.parse('2026-10-01T14:00:00.000Z') + index * 60_000).toISOString(),
  }));
  const result = build(events.map((event) => makeGroup(event)), {
    period: makePeriod({ view: 'month', date: '2026-10-01' }),
    filters: { mode: '', country: 'AR', city: 'AR:Córdoba', community: '' },
  });
  const expected = `Eventos para aprender AWS, en octubre de 2026. 48 eventos presenciales en Córdoba, Argentina, y opciones online.\n\nHorarios de Córdoba, Argentina (UTC-3).\n\nLa lista completa de eventos, horarios e inscripciones:\n${result.url}`;
  const summary = linkedInPost(result);
  assert.ok(events.reduce((total, event) => total + event.title.length, 0) > 3_000,
    'the independent full-list fixture has enough complete title text to exceed the local limit');
  assert.equal(summary, expected, 'the overflow result follows the approved linked-summary wording');
  for (const event of events) {
    assert.ok(result.text.includes(event.title), 'copy retains every complete title');
    assert.ok(result.text.includes(event.registrationUrl), 'copy retains every original registration URL');
    assert.ok(!summary.includes(event.title), 'LinkedIn replaces all event entries, not an arbitrary prefix');
  }
  assertSocialTargets(result);
});

test('keeps X period, count, mode, country and agenda URL intact while shortening only a long city', () => {
  const cities = [
    '界'.repeat(100),
    `A${'界'.repeat(99)}`,
  ];
  const { parseTweet } = requireFromTest('twitter-text');
  const weights = cities.map((city) => parseTweet(city).weightedLength);
  assert.equal(cities[0].length, 100);
  assert.equal(cities[1].length, 100);
  assert.equal(weights[0] - weights[1], 1,
    'the paired 100-character fixtures differ by one weighted unit to exercise both parities');

  for (const [index, city] of cities.entries()) {
    const event = makeEvent(`cjk-city-${index}`, { city, country: 'AR', venueCountry: 'AR' });
    const filters = { mode: 'in-person', country: 'AR', city: `AR:${city}`, community: '' };
    const period = makePeriod({ date: '2026-10-19', timeZone: LONG_IANA_ZONE });
    const result = build([makeGroup(event)], { period, filters });
    const post = xPost(result);
    const agendaUrl = result.url;
    const urlStart = post.indexOf(agendaUrl);
    const context = post.slice(0, urlStart);
    assert.ok(urlStart >= 0, 'X embeds the full agenda URL inside its text');
    assert.match(context, /1 evento\b/u, 'the count remains complete');
    assert.ok(context.includes('19') && context.includes('25') && context.includes('octubre'),
      'the selected period remains complete');
    assert.match(context, /presencial/iu, 'the selected participation mode remains complete');
    assert.ok(context.includes('Argentina'), 'the country remains complete');
    assert.ok(context.includes('…'), 'an over-limit city has a visible ellipsis');
    assert.ok(context.includes('界') && !context.includes(city), 'only the city is shortened');
    assert.doesNotMatch(context, /Resumen|ComodRivadavia|America\/|UTC|GMT/iu,
      'the short post has no unapproved prefix or separate IANA zone');
    assert.ok(new URL(agendaUrl).href.length > 280, 'the complete location remains in the long selection URL');
    assert.equal(new URL(agendaUrl).searchParams.get('city'), filters.city, 'the exact city filter is retained');
    assert.ok(result.text.includes(city), 'copy keeps the complete city and is not abbreviated for X');
    assert.ok(linkedInPost(result).includes(city), 'LinkedIn keeps the complete city and does not inherit X abbreviation');
    const parsed = parseTweet(post);
    assert.equal(parsed.valid, true);
    assert.ok(parsed.weightedLength <= X_WEIGHT_LIMIT);
    assertSocialTargets(result);
  }
});

test('shortens a city with repeated URL-like tokens that X weights at 23 each', () => {
  const city = Array.from({ length: 18 }, () => 'a.co').join(' ');
  const { parseTweet } = requireFromTest('twitter-text');
  const independentCityWeight = parseTweet(city).weightedLength;
  assert.equal(city.length, 89, 'the fixture is a valid city shorter than the 100-character field limit');
  assert.equal(independentCityWeight, 18 * 23 + 17,
    'X weights each of the 18 URL-like city tokens at 23 plus their spaces');

  const event = makeEvent('short-domain-city', { city, country: 'AR', venueCountry: 'AR' });
  const filters = { mode: 'in-person', country: 'AR', city: `AR:${city}`, community: '' };
  const result = build([makeGroup(event)], {
    period: makePeriod({ date: '2026-10-19', timeZone: LONG_IANA_ZONE }), filters,
  });
  const post = xPost(result);
  const context = post.slice(0, post.indexOf(result.url));
  assert.ok(context.includes('a.co'), 'the shortened location remains identifiable');
  assert.ok((context.match(/\ba\.co\b/giu) ?? []).length < 18, 'the URL-like city tokens are visibly shortened');
  assert.ok(context.includes('…'), 'the shortened city has an ellipsis');
  assert.ok(context.includes('1 evento') && context.includes('octubre'), 'the required count and period remain');
  assert.ok(context.includes('Argentina') && /presencial/iu.test(context),
    'the required country and participation mode remain');
  assert.equal(new URL(result.url).searchParams.get('city'), filters.city,
    'the full URL-like city filter remains unchanged');
  assert.ok(result.text.includes(city), 'copy retains the complete city name');
  assert.ok(linkedInPost(result).includes(city), 'LinkedIn retains the complete city name');
  assertSocialTargets(result);
});

test('keeps a CJK city unshortened when the complete X post fits', () => {
  const city = '界'.repeat(20);
  const event = makeEvent('cjk-city-fits', { city, country: 'AR', venueCountry: 'AR' });
  const filters = { mode: 'in-person', country: 'AR', city: `AR:${city}`, community: '' };
  const result = build([makeGroup(event)], { filters });
  const post = xPost(result);
  assert.ok(post.includes(city), 'the full city remains when it fits');
  assert.ok(!post.includes('…'), 'no city abbreviation is added unnecessarily');
  assertXWeight(post);
});

test('preserves emoji, NFC-normalizes accents and counts the complete X body including its label URL', () => {
  const family = '👨‍👩‍👧‍👦';
  const decomposed = 'e\u0301';
  const city = `${family} ${decomposed}`;
  const event = makeEvent('unicode-city', { city, country: 'AR', venueCountry: 'AR' });
  const result = build([makeGroup(event)], {
    filters: { mode: 'in-person', country: 'AR', city: `AR:${city}`, community: '' },
  });
  const post = xPost(result);
  assert.ok(post.includes(family), 'the family emoji sequence remains intact');
  assert.ok(post.normalize('NFC').includes(city.normalize('NFC')), 'the decomposed accent remains readable');
  assert.equal(countOccurrences(post, result.url), 1, 'the in-body URL is counted exactly once');
  assertXWeight(post);
  assertSocialTargets(result);
});

test('sanitizes X noncharacters without changing copied text or the exact location filter', () => {
  const city = 'Ciudad\uFFFE\uFEFF\uFFFF';
  const event = makeEvent('noncharacter-city', {
    title: 'Encuentro en Ciudad inválida', city, country: 'AR', venueCountry: 'AR',
  });
  const filters = { mode: 'in-person', country: 'AR', city: `AR:${city}`, community: '' };
  const result = build([makeGroup(event)], { filters });
  const post = xPost(result);

  assert.ok(post.includes('Ciudad'), 'the sanitized location remains identifiable');
  assert.doesNotMatch(post, /[\uFFFE\uFEFF\uFFFF]/u, 'X replaces invalid noncharacters');
  assert.ok(result.text.includes(city), 'copy preserves the original location characters');
  assert.equal(new URL(result.url).searchParams.get('city'), filters.city, 'the URL preserves the original filter');
  assert.equal(filters.city, `AR:${city}`, 'formatting leaves the selected filter unchanged');
  assertSocialTargets(result);
});

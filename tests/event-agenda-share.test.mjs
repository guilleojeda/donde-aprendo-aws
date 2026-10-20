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
// Independent documented fixture values; generated summaries are measured by twitter-text below.
const X_SHORT_URL_WEIGHT = 23;
const X_DEFAULT_WEIGHT = 2;
const X_FAMILY_EMOJI_WEIGHT = 2;
const X_NFC_ACCENT_WEIGHT = 1;
const X_ELLIPSIS_WEIGHT = 2;
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
  return {
    recordType: 'event',
    id,
    title: `Encuentro ${id}`,
    description: '',
    startsAt,
    endsAt: overrides.endsAt ?? '2026-10-21T14:00:00.000Z',
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
  assertXIntentWeight(result);
  return result;
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function dateInZone(instant, timeZone) {
  return new Intl.DateTimeFormat('es', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone,
  }).format(new Date(instant));
}

function timeInZone(instant, timeZone) {
  return new Intl.DateTimeFormat('es', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
  }).format(new Date(instant));
}

function monthAndYearInZone(instant, timeZone) {
  return new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone })
    .format(new Date(instant));
}

function copyHeader(text, selection) {
  const firstEventTitle = Math.min(...selection.map(({ event }) => text.indexOf(event.title)));
  assert.ok(Number.isFinite(firstEventTitle) && firstEventTitle >= 0, 'copy contains each selected event title');
  return text.slice(0, firstEventTitle);
}

function assertPeriodDatesInText(text, period, view, { compact = false } = {}) {
  if (compact) {
    const month = new Intl.DateTimeFormat('es', { month: '2-digit', timeZone: period.timeZone })
      .format(new Date(period.start));
    const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: period.timeZone })
      .format(new Date(period.start));
    assert.ok(text.includes(year) && new RegExp(`(?:${monthAndYearInZone(period.start, period.timeZone)}|\\b${month}\\b)`, 'iu').test(text),
      'compact period text identifies its month and year');
  } else {
    assert.ok(text.includes(monthAndYearInZone(period.start, period.timeZone)),
      'period text identifies its Spanish month and year');
  }
  if (view === 'week') {
    for (const boundary of [period.start, period.end - 1]) {
      const day = new Intl.DateTimeFormat('es', { day: 'numeric', timeZone: period.timeZone })
        .format(new Date(boundary));
      assert.match(text, new RegExp(`(?:^|\\D)${day}(?:\\D|$)`, 'u'),
        `week period text identifies boundary day ${day}`);
    }
  }
}

function assertSummaryCount(summary, count) {
  assert.match(summary, new RegExp(`(?:^|\\D)${count}(?:\\D|$)`, 'u'),
    `X summary identifies the selected occurrence count (${count})`);
}

function assertSocialTargets(result) {
  const x = new URL(result.xHref);
  assert.ok(['twitter.com', 'x.com'].includes(x.hostname), 'X opens an official web intent host');
  assert.equal(x.pathname, '/intent/tweet');
  assert.equal(x.searchParams.get('url'), result.url, 'X receives the agenda URL as a separate URL parameter');
  assert.ok(x.searchParams.has('text'), 'X receives its summary in the text parameter');

  const linkedIn = new URL(result.linkedInHref);
  assert.equal(linkedIn.hostname, 'www.linkedin.com');
  assert.equal(linkedIn.pathname, '/sharing/share-offsite/');
  assert.deepEqual([...linkedIn.searchParams.keys()], ['url'], 'LinkedIn receives only the agenda URL');
  assert.equal(linkedIn.searchParams.get('url'), result.url);
}

function xSummary(result) {
  const intent = new URL(result.xHref);
  return intent.searchParams.get('text');
}

function assertXIntentWeight(result) {
  const intent = new URL(result.xHref);
  const summary = intent.searchParams.get('text');
  assert.equal(intent.searchParams.get('url'), result.url,
    'the complete agenda URL remains a separate Web Intent parameter');
  const { parseTweet } = requireFromTest('twitter-text');
  assert.equal(typeof parseTweet, 'function', 'twitter-text exposes its official parseTweet contract');
  const post = parseTweet(`${summary}\n${result.url}`);
  assert.equal(post.valid, true, 'the actual X text plus URL forms a valid post');
  assert.ok(post.weightedLength <= X_WEIGHT_LIMIT, 'the actual X post fits the weighted 280-character limit');
}

test('exports the planned pure agenda-share API', () => {
  assert.equal(typeof formatter(), 'function');
});

test('copies all 15 selected occurrences once, in their supplied order, with raw Unicode and registration URLs', () => {
  const events = Array.from({ length: 15 }, (_, index) => makeEvent(`share-${index + 1}`, {
    title: index === 0 ? 'Diseño <AWS & datos> — café' : `Encuentro compartible ${index + 1}`,
    startsAt: new Date(Date.parse('2026-10-21T13:00:00.000Z') + index * 60_000).toISOString(),
    endsAt: new Date(Date.parse('2026-10-21T14:00:00.000Z') + index * 60_000).toISOString(),
    mode: 'online',
    place: undefined,
    country: undefined,
    venueCountry: undefined,
    city: undefined,
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
    assert.ok(titleIndex > previousTitleIndex, 'copy keeps the selected occurrence order');
    previousTitleIndex = titleIndex;
  }
  assert.ok(result.text.includes('Diseño <AWS & datos> — café'), 'copy preserves Unicode and literal text');
  assert.ok(result.text.includes('source=share&lang=es'), 'copy preserves the original registration URL');
  assert.equal(countOccurrences(result.text, result.url), 1, 'copy includes the canonical period URL once');
  assert.match(result.text, /en línea|online|remot[oa]/iu, 'copy identifies online attendance');
  assert.doesNotMatch(result.text, /&amp;|&lt;|&gt;|<\/?(?:p|a|div|br)\b/iu,
    'copy is plain text rather than HTML-escaped content');
  const summary = new URL(result.xHref).searchParams.get('text');
  assert.ok(!events.every(({ title }) => summary.includes(title)), 'X does not enumerate the complete title list');
});

test('uses the real agenda selector representative once for a co-hosted occurrence', () => {
  const now = Date.parse('2026-10-21T16:00:00.000Z');
  const older = makeEvent('cohost-a-old', {
    title: 'Sesión coorganizada',
    startsAt: '2026-10-21T14:30:00.000Z',
    endsAt: '2026-10-21T15:00:00.000Z',
    place: 'Centro AWS Córdoba',
    registrationUrl: 'https://meetup.com/aws-latam/events/shared?host=old',
  });
  const active = makeEvent('cohost-z-active', {
    title: 'Sesión coorganizada',
    startsAt: '2026-10-21T14:30:00.000Z',
    endsAt: '2026-10-22T03:30:00.000Z',
    place: 'Centro AWS-Córdoba',
    registrationUrl: 'https://meetup.com/aws-latam/events/shared?host=active',
  });
  const groups = uniqueEventGroups([older, active]);
  assert.equal(groups.length, 1, 'the public event helper forms one co-host group');
  const [selected] = eventGroupsForAgenda(groups, {
    now,
    includeEnded: true,
    period: makePeriod(),
    filters: { mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: '' },
  });
  assert.equal(selected.event.id, 'cohost-z-active', 'the agenda selector chooses the active display row');
  assert.equal(selected.events.length, 2, 'the selected occurrence retains both co-host rows');

  const result = build([selected], {
    now,
    filters: { mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: '' },
  });
  assert.equal(countOccurrences(result.text, 'Sesión coorganizada'), 1, 'the occurrence appears once');
  assert.equal(countOccurrences(result.text, active.registrationUrl), 1, 'copy uses the selected representative registration URL');
  assert.ok(!result.text.includes(older.registrationUrl), 'copy omits the hidden co-host registration URL');
  const eventBlock = result.text.slice(result.text.indexOf('Sesión coorganizada'));
  assert.ok(eventBlock.includes(dateInZone(active.endsAt, DEFAULT_ZONE)),
    'copy uses the selected representative end date when its occurrence crosses the chosen-zone day boundary');
  assert.ok(eventBlock.includes(timeInZone(active.startsAt, DEFAULT_ZONE)),
    'the single copied occurrence shows the selected event time in the chosen zone');
});

test('keeps the complete long title and plain-text event facts in the copied agenda', () => {
  const title = `Taller de arquitectura ${'AWS y datos '.repeat(500)}fin`;
  const event = makeEvent('long-copy', {
    title,
    mode: 'hybrid',
    place: 'Centro de aprendizaje',
    registrationUrl: 'https://example.test/register?event=long-copy&source=agenda',
  });
  const result = build([makeGroup(event)]);

  assert.ok(result.text.length > 5_000, 'the copied agenda has no arbitrary text-length cap');
  assert.ok(result.text.includes(title), 'the complete long title remains in the copy');
  assert.ok(result.text.includes(event.registrationUrl), 'the original registration link remains complete');
  assert.match(result.text, /presencial|físic/iu, 'hybrid attendance retains its physical option');
  assert.match(result.text, /remot[oa]|online|en línea/iu, 'hybrid attendance retains its remote option');
  assert.doesNotMatch(result.text, /gratis|gratuito/iu, 'the formatter makes no unsupported price claim');
});

test('formats event dates and 24-hour times in the chosen zone across local midnight and a year boundary', () => {
  const crossingLocalDay = makeEvent('cordoba-midnight', {
    title: 'Sesión que cruza la medianoche',
    startsAt: '2026-10-22T02:30:00.000Z',
    endsAt: '2026-10-22T03:30:00.000Z',
    timeZone: 'UTC',
    mode: 'online',
    place: undefined,
    country: undefined,
    venueCountry: undefined,
    city: undefined,
  });
  const localResult = build([makeGroup(crossingLocalDay)], {
    period: makePeriod({ view: 'week', date: '2026-10-21', timeZone: DEFAULT_ZONE }),
  });
  for (const instant of [crossingLocalDay.startsAt, crossingLocalDay.endsAt]) {
    assert.ok(localResult.text.includes(dateInZone(instant, DEFAULT_ZONE)),
      'copy includes the full Spanish day, month and year in the chosen zone');
    assert.ok(localResult.text.includes(timeInZone(instant, DEFAULT_ZONE)),
      'copy uses 24-hour event times in the chosen zone');
  }
  const localEventBlock = localResult.text.slice(localResult.text.indexOf(crossingLocalDay.title));
  assert.ok(localEventBlock.includes(timeInZone(crossingLocalDay.startsAt, DEFAULT_ZONE)),
    'the event start is not formatted in its stored UTC zone when the chosen zone differs');
  assert.ok(!localEventBlock.includes(timeInZone(crossingLocalDay.startsAt, 'UTC')),
    'the stored event zone does not replace the selected agenda zone');

  const yearEnd = makeEvent('year-boundary', {
    title: 'Encuentro entre dos años',
    startsAt: '2026-12-31T23:30:00.000Z',
    endsAt: '2027-01-01T00:30:00.000Z',
    mode: 'online',
    place: undefined,
    country: undefined,
    venueCountry: undefined,
    city: undefined,
  });
  const yearResult = build([makeGroup(yearEnd)], {
    period: makePeriod({ view: 'month', date: '2026-12-15', timeZone: 'UTC' }),
    url: 'https://dondeaprendoaws.com/eventos/?test=year-end',
    now: Date.parse('2026-12-01T00:00:00.000Z'),
  });
  assert.ok(yearResult.text.includes(dateInZone(yearEnd.startsAt, 'UTC')));
  assert.ok(yearResult.text.includes(dateInZone(yearEnd.endsAt, 'UTC')),
    'copy includes the next-year end date when an event crosses the calendar year');
});

test('puts concrete week and month periods in the copied header before event entries', () => {
  const weekEvent = makeEvent('header-week', { title: 'Evento semanal de cabecera' });
  const weekPeriod = makePeriod({ view: 'week', date: '2026-10-21', timeZone: DEFAULT_ZONE });
  const weekSelection = [makeGroup(weekEvent)];
  const weekResult = build(weekSelection, { period: weekPeriod });
  assertPeriodDatesInText(copyHeader(weekResult.text, weekSelection), weekPeriod, 'week');

  const monthEvent = makeEvent('header-month', { title: 'Evento mensual de cabecera' });
  const monthPeriod = makePeriod({ view: 'month', date: '2026-10-21', timeZone: 'UTC' });
  const monthSelection = [makeGroup(monthEvent)];
  const monthResult = build(monthSelection, { period: monthPeriod, now: DEFAULT_NOW });
  assertPeriodDatesInText(copyHeader(monthResult.text, monthSelection), monthPeriod, 'month');
});

test('labels finalized events while keeping a current event in the copy', () => {
  const ended = makeEvent('ended-share', {
    title: 'Encuentro finalizado',
    startsAt: '2026-10-21T09:00:00.000Z',
    endsAt: '2026-10-21T10:00:00.000Z',
  });
  const current = makeEvent('current-share', {
    title: 'Encuentro en curso',
    startsAt: '2026-10-21T11:00:00.000Z',
    endsAt: '2026-10-21T13:00:00.000Z',
  });
  const result = build([makeGroup(ended), makeGroup(current)], { now: DEFAULT_NOW });
  const currentOnly = build([makeGroup(current)], { now: DEFAULT_NOW });

  assert.ok(result.text.includes(ended.title), 'finalized selections remain in the complete copy');
  assert.ok(result.text.includes(current.title), 'an event still in progress remains in the complete copy');
  assert.match(result.text, /finalizado/iu, 'a finalized event is labeled');
  assert.ok(currentOnly.text.includes(current.title), 'a current event remains independently shareable');
  assert.doesNotMatch(currentOnly.text, /finalizado/iu, 'a current event is not labeled finalized');
});

test('uses the effective community venue and does not treat an online location as an active restriction', () => {
  const community = {
    id: 'community-cordoba', title: 'AWS User Group Córdoba', url: 'https://example.test/aws-cordoba',
    description: '', category: 'Comunidad', order: 1, featured: false, kind: 'community', format: 'community', topics: [],
    country: 'AR', city: 'Córdoba',
  };
  const fallbackVenue = makeEvent('fallback-venue', {
    title: 'Encuentro con ubicación de comunidad',
    communityId: community.id,
    country: undefined,
    venueCountry: undefined,
    city: undefined,
    place: 'Centro de eventos',
  });
  const communityById = new Map([[community.id, community]]);
  const physicalFilters = { mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: community.id };
  const fallbackSelection = eventGroupsForAgenda(uniqueEventGroups([fallbackVenue], communityById), {
    communityById, filters: physicalFilters, period: makePeriod(), includeEnded: true, now: DEFAULT_NOW,
  });
  assert.equal(fallbackSelection.length, 1,
    'the real selector uses the community city/country fallback for physical attendance');
  const fallbackResult = build(fallbackSelection, { communityById, filters: physicalFilters });
  assert.ok(fallbackResult.text.includes(community.title), 'a selected community remains useful in the copied agenda');
  assert.ok(fallbackResult.text.includes('Córdoba'), 'physical location fallback uses the community city');
  assert.match(fallbackResult.text, /Argentina/iu, 'physical location fallback uses the community country');

  const hybridOutsideLocation = makeEvent('remote-hybrid', {
    title: 'Híbrido remoto desde Bogotá', mode: 'hybrid', country: 'CO', venueCountry: 'CO', city: 'Bogotá',
    place: 'Centro AWS Bogotá', communityId: 'community-co',
  });
  const onlineOnly = makeEvent('online-only', {
    title: 'Sesión sólo en línea', mode: 'online', country: undefined, venueCountry: undefined, city: undefined,
    place: undefined, communityId: undefined,
  });
  const retainedLocationFilters = { mode: 'online', country: 'AR', city: 'AR:Córdoba', community: '' };
  const onlineSelection = eventGroupsForAgenda(uniqueEventGroups([hybridOutsideLocation, onlineOnly]), {
    filters: retainedLocationFilters, period: makePeriod(), includeEnded: true, now: DEFAULT_NOW,
  });
  assert.equal(onlineSelection.length, 2,
    'the real selector keeps remote-capable hybrid and online events when the retained city is foreign');
  const onlineResult = build(onlineSelection, { filters: retainedLocationFilters });
  assert.ok(onlineResult.text.includes(hybridOutsideLocation.title),
    'a hybrid event remains in a remote-mode selection despite its foreign physical venue');
  assert.ok(onlineResult.text.includes(onlineOnly.title), 'an online-only event remains selected');
  assert.ok(!onlineResult.text.includes('Córdoba'),
    'a location retained with online mode is not presented as a physical attendance restriction');
  const onlineUrl = new URL(onlineResult.url);
  assert.equal(onlineUrl.searchParams.get('mode'), retainedLocationFilters.mode);
  assert.equal(onlineUrl.searchParams.get('country'), retainedLocationFilters.country);
  assert.equal(onlineUrl.searchParams.get('city'), retainedLocationFilters.city,
    'applicable UI filters remain in the URL even when physical location does not constrain remote attendance');
  assert.ok(!new URL(onlineResult.url).searchParams.has('includeEnded'), 'the checkbox state is not shared');
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
    category: 'Comunidad', order: 1, featured: false, kind: 'community', format: 'community', topics: [], country: 'AR', city: 'Córdoba',
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

test('keeps the URL stable when the selected checkbox state changes the event list', () => {
  const ended = makeEvent('checkbox-ended', {
    title: 'Evento visible con finalizados', startsAt: '2026-10-21T09:00:00.000Z', endsAt: '2026-10-21T10:00:00.000Z',
  });
  const current = makeEvent('checkbox-current', {
    title: 'Evento visible en curso', startsAt: '2026-10-21T11:00:00.000Z', endsAt: '2026-10-21T13:00:00.000Z',
  });
  const filters = { mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: '' };
  const withEnded = build([makeGroup(ended), makeGroup(current)], { filters });
  const withoutEnded = build([makeGroup(current)], { filters });

  assert.equal(withEnded.url, withoutEnded.url, 'the X/LinkedIn destination URL depends only on period and filters');
  assert.notEqual(withEnded.text, withoutEnded.text, 'complete copy follows the currently selected occurrences');
  const allSummary = new URL(withEnded.xHref).searchParams.get('text');
  const currentSummary = new URL(withoutEnded.xHref).searchParams.get('text');
  assert.notEqual(allSummary, currentSummary, 'X summary and count reflect the current checkbox selection');
  assertSummaryCount(allSummary, 2);
  assertSummaryCount(currentSummary, 1);
  assert.ok(!new URL(withEnded.url).searchParams.has('includeEnded'));
  assert.ok(!new URL(withoutEnded.url).searchParams.has('includeEnded'));
});

test('builds the canonical global agenda URL from concrete period and resolved special-character filters', () => {
  const communityId = 'community-cordoba';
  const filters = {
    mode: 'hybrid', country: 'AR', city: 'AR:Córdoba & Alta+Gracia?#', community: communityId,
  };
  const community = {
    id: communityId, title: 'Comunidad AWS Córdoba', url: 'https://example.test/comunidad-cordoba', description: '',
    category: 'Comunidad', order: 1, featured: false, kind: 'community', format: 'community', topics: [],
  };
  const result = build([makeGroup(makeEvent('canonical-url', {
    mode: 'hybrid', city: 'Córdoba & Alta+Gracia?#', communityId,
  }))], {
    period: makePeriod({ view: 'month', date: '2026-10-21', timeZone: DEFAULT_ZONE }),
    filters,
    communityById: new Map([[communityId, community]]),
    url: 'https://dondeaprendoaws.com/eventos/online/?utm_source=old&mode=online&from=2026-10-01&to=2026-10-31&includeEnded=0&legacy=keep-out#fragment',
  });
  const canonical = new URL(result.url);
  assert.equal(canonical.origin, 'https://dondeaprendoaws.com', 'only the current page origin is reused');
  assert.equal(canonical.pathname, '/eventos/', 'share link always opens the global agenda route');
  assert.equal(canonical.hash, '', 'share link clears the source fragment');
  assert.deepEqual([...canonical.searchParams.keys()].sort(),
    ['city', 'community', 'country', 'date', 'mode', 'tz', 'view'].sort(),
    'share link rebuilds only concrete period and resolved filter parameters');
  assert.equal(canonical.searchParams.get('view'), 'month');
  assert.equal(canonical.searchParams.get('date'), '2026-10-21');
  assert.equal(canonical.searchParams.get('tz'), DEFAULT_ZONE);
  assert.equal(canonical.searchParams.get('mode'), filters.mode);
  assert.equal(canonical.searchParams.get('country'), filters.country);
  assert.equal(canonical.searchParams.get('city'), filters.city, 'Unicode and query delimiters round-trip safely');
  assert.equal(canonical.searchParams.get('community'), communityId, 'community filter round-trips safely');
  for (const staleKey of ['utm_source', 'from', 'to', 'includeEnded', 'legacy']) {
    assert.ok(!canonical.searchParams.has(staleKey), `${staleKey} is not inherited from the current page URL`);
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
    'resolved empty filters clear route defaults and old URL state');
  assert.equal(clearedUrl.searchParams.get('tz'), 'UTC');
});

test('supports an empty selection with an explicit zero count, period, URL, and direct social targets', () => {
  const result = build([], {
    period: makePeriod({ view: 'month', date: '2026-10-21', timeZone: 'UTC' }),
    url: 'https://dondeaprendoaws.com/eventos/?empty-case=1',
  });

  assert.match(result.text, /(?:^|\D)0(?:\D|$)/u, 'empty copy explicitly identifies zero selected occurrences');
  assert.ok(result.text.includes(monthAndYearInZone(Date.parse('2026-10-01T00:00:00.000Z'), 'UTC')),
    'empty copy still identifies the selected period');
  assert.equal(new URL(result.url).pathname, '/eventos/');
  assertSocialTargets(result);
});

test('puts period, count, applicable mode and location, and the full IANA zone in X without event titles', () => {
  const events = [
    makeEvent('summary-one', { title: 'Nombre privado de primera charla' }),
    makeEvent('summary-two', {
      title: 'Nombre privado de segunda charla',
      startsAt: '2026-10-21T15:00:00.000Z', endsAt: '2026-10-21T16:00:00.000Z',
    }),
  ];
  const period = makePeriod({ view: 'week', date: '2026-10-21', timeZone: DEFAULT_ZONE });
  const result = build(events.map((event) => makeGroup(event)), {
    filters: { mode: 'in-person', country: 'AR', city: 'AR:Córdoba', community: '' },
    period,
  });
  const summary = new URL(result.xHref).searchParams.get('text');

  assertSummaryCount(summary, 2);
  assert.match(summary, /agenda|resumen/iu, 'X identifies the post as an agenda summary');
  assert.match(summary, /presencial|in-person/iu, 'X identifies the selected mode');
  assert.ok(summary.includes('Córdoba'), 'X identifies its applicable physical location');
  assert.match(summary, /semana|week/iu, 'X identifies the selected period view');
  assertPeriodDatesInText(summary, period, 'week', { compact: true });
  assert.ok(summary.includes(DEFAULT_ZONE), 'X includes the complete IANA time-zone name');
  assert.ok(!summary.includes(events[0].title) && !summary.includes(events[1].title),
    'X summary links to the complete agenda instead of listing event titles');
  assertSocialTargets(result);
});

test('weights 18 short-domain location tokens and visibly shortens only the X summary', () => {
  const city = Array.from({ length: 18 }, () => 'a.co').join(' ');
  assert.equal(city.length, 89, 'fixture remains a valid 100-character city value');
  assert.equal(X_SHORT_URL_WEIGHT, 23, 'X counts each URL as 23 characters');
  assert.equal(18 * X_SHORT_URL_WEIGHT + 17, 431,
    'the independent fixture reference confirms the 18-token city weighs 431');
  assert.equal(X_SHORT_URL_WEIGHT + X_ELLIPSIS_WEIGHT, 25,
    'the independent fixture reference includes the visible ellipsis weight');

  const event = makeEvent('short-domain-city', { city, country: 'AR', venueCountry: 'AR' });
  const period = makePeriod({ view: 'week', date: '2026-10-21', timeZone: LONG_IANA_ZONE });
  const result = build([makeGroup(event)], {
    period,
    filters: { mode: 'in-person', country: 'AR', city: `AR:${city}`, community: '' },
  });
  const summary = xSummary(result);
  assertSummaryCount(summary, 1);
  assertPeriodDatesInText(summary, period, 'week', { compact: true });
  assert.match(summary, /presencial|in-person/iu, 'the shortened summary retains its mode');
  assert.ok(summary.includes('a.co'), 'the location remains identifiable after shortening');
  assert.ok((summary.match(/\ba\.co\b/giu) ?? []).length < 18, 'the over-limit location is visibly shortened');
  assert.match(summary, /…|\.{3}|más|truncad|recortad|omitid/iu, 'the shortened location has a visible truncation signal');
  assert.ok(summary.includes(LONG_IANA_ZONE), 'the shortened summary retains a long valid IANA zone');
  assert.equal(new URL(result.xHref).searchParams.get('url'), result.url, 'the separate final link is preserved');
  assert.ok(result.text.includes(city), 'the complete copied agenda retains the full location value');
});

test('keeps a 100-character CJK location within the weighted X budget without forcing truncation', () => {
  const city = '界'.repeat(100);
  assert.equal(city.length, 100);
  assert.equal(X_DEFAULT_WEIGHT, 2, 'the fixture uses X default weight two for these codepoints');
  assert.equal(city.length * X_DEFAULT_WEIGHT, 200, 'the independent CJK fixture reference weighs 200');
  const event = makeEvent('cjk-city', { city, country: 'AR', venueCountry: 'AR' });
  const filters = { mode: 'in-person', country: 'AR', city: `AR:${city}`, community: '' };
  const result = build([makeGroup(event)], {
    period: makePeriod({ view: 'month', date: '2026-10-21', timeZone: LONG_IANA_ZONE }),
    filters,
  });
  const summary = xSummary(result);

  assertSummaryCount(summary, 1);
  assert.match(summary, /mes|month/iu, 'summary identifies the selected calendar-month view');
  assertPeriodDatesInText(summary,
    makePeriod({ view: 'month', date: '2026-10-21', timeZone: LONG_IANA_ZONE }), 'month', { compact: true });
  assert.match(summary, /presencial|in-person/iu, 'summary retains its mode');
  assert.ok(summary.includes('界'), 'summary keeps the location identifiable');
  assert.ok(summary.includes(LONG_IANA_ZONE), 'summary retains the full long IANA zone');
  assert.ok(result.url.length > 280, 'the complete city filter creates a long share query');
  assert.equal(new URL(result.url).searchParams.get('city'), filters.city, 'the long query preserves the complete city filter');
  assertSocialTargets(result);
});

test('counts the known family emoji and NFC-normalizes decomposed accents in the X weight check', () => {
  const family = '👨‍👩‍👧‍👦';
  const decomposed = 'e\u0301';
  assert.equal(X_FAMILY_EMOJI_WEIGHT, 2, 'the known family sequence has weight two');
  assert.equal([...decomposed.normalize('NFC')].length * X_NFC_ACCENT_WEIGHT, 1,
    'the decomposed accent normalizes to one character with weight one');
  const city = `${family} ${decomposed}`;
  const event = makeEvent('unicode-city', { city, country: 'AR', venueCountry: 'AR' });
  const result = build([makeGroup(event)], {
    filters: { mode: 'in-person', country: 'AR', city: `AR:${city}`, community: '' },
  });
  const summary = xSummary(result);

  assert.ok(summary.includes(family), 'a valid family emoji remains intact in the X summary');
  assert.ok(summary.normalize('NFC').includes('é'), 'the decomposed accented city remains readable');
  assertSocialTargets(result);
});

test('replaces invalid noncharacters in the X summary while preserving copied text and URL filters', () => {
  const city = 'Ciudad\uFFFE\uFEFF\uFFFF';
  const event = makeEvent('noncharacter-city', {
    title: 'Encuentro en Ciudad inválida', city, country: 'AR', venueCountry: 'AR',
  });
  const filters = { mode: 'in-person', country: 'AR', city: `AR:${city}`, community: '' };
  const result = build([makeGroup(event)], { filters });
  const summary = xSummary(result);
  const canonical = new URL(result.url);

  assert.ok(summary.includes('Ciudad'), 'sanitized location remains identifiable');
  assert.doesNotMatch(summary, /[\uFFFE\uFEFF\uFFFF]/u, 'X summary replaces invalid noncharacters');
  assert.ok(result.text.includes(city), 'full copied text preserves the original event location');
  assert.equal(canonical.searchParams.get('city'), filters.city, 'the share URL preserves the original resolved filter');
  assert.equal(filters.city, `AR:${city}`, 'formatting leaves the selected filter object unchanged');
});

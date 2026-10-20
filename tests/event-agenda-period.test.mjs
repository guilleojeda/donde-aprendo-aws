import assert from 'node:assert/strict';
import test from 'node:test';
import { eventGroupsForAgenda } from '../src/lib/event-agenda-groups.mjs';
import { uniqueEventGroups } from '../src/lib/events.mjs';

let periodApi;
const periodModuleUrl = new URL('../src/lib/event-agenda-period.mjs', import.meta.url).href;
try {
  periodApi = await import(periodModuleUrl);
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== periodModuleUrl) throw error;
  // Keep the planned public API failure inside its test instead of aborting module loading.
}

function periodFunction(name) {
  assert.ok(periodApi, 'src/lib/event-agenda-period.mjs must expose the agenda period API');
  assert.equal(typeof periodApi[name], 'function', `event-agenda-period.mjs must export ${name}`);
  return periodApi[name];
}

const iso = (instant) => new Date(instant).toISOString();

test('period API exposes calendar construction, civil navigation and overlap helpers', () => {
  for (const name of ['createEventAgendaPeriod', 'shiftEventAgendaPeriod', 'eventOverlapsAgendaPeriod',
    'parseEventAgendaPeriod', 'serializeEventAgendaPeriod']) periodFunction(name);
});

test('weeks use Monday boundaries and switching views keeps the reference date', () => {
  const create = periodFunction('createEventAgendaPeriod');
  const input = Object.freeze({ view: 'week', date: '2024-10-01', timeZone: 'America/Argentina/Cordoba' });
  const week = create(input);
  assert.deepEqual(input, { view: 'week', date: '2024-10-01', timeZone: 'America/Argentina/Cordoba' });

  assert.deepEqual(week, {
    view: 'week', date: '2024-10-01', timeZone: 'America/Argentina/Cordoba',
    start: Date.parse('2024-09-30T03:00:00Z'), end: Date.parse('2024-10-07T03:00:00Z'),
  });

  const month = create({ view: 'month', date: week.date, timeZone: week.timeZone });
  assert.equal(month.date, week.date);
  assert.equal(month.view, 'month');
  assert.equal(month.start, Date.parse('2024-10-01T03:00:00Z'));
  assert.equal(month.end, Date.parse('2024-11-01T03:00:00Z'));

  const inTokyo = create({ view: 'week', date: week.date, timeZone: 'Asia/Tokyo' });
  assert.equal(inTokyo.date, week.date, 'changing time zone preserves the reference date');
  assert.equal(inTokyo.start, Date.parse('2024-09-29T15:00:00Z'));
});

test('month boundaries include leap day and navigation crosses year ends without losing the reference day', () => {
  const create = periodFunction('createEventAgendaPeriod');
  const shift = periodFunction('shiftEventAgendaPeriod');
  const leapMonth = create({ view: 'month', date: '2024-02-29', timeZone: 'America/New_York' });

  assert.equal(leapMonth.date, '2024-02-29');
  assert.equal(leapMonth.start, Date.parse('2024-02-01T05:00:00Z'));
  assert.equal(leapMonth.end, Date.parse('2024-03-01T05:00:00Z'));

  const december = Object.freeze(create({ view: 'month', date: '2024-12-31', timeZone: 'UTC' }));
  const january = shift(december, 1);
  assert.equal(january.date, '2025-01-31');
  assert.equal(shift(january, -1).date, '2024-12-31');

  const januaryThirtyFirst = create({ view: 'month', date: '2024-01-31', timeZone: 'UTC' });
  const february = shift(januaryThirtyFirst, 1);
  assert.equal(february.date, '2024-02-29', 'when the reference day does not exist, use the last day of that month');
  assert.equal(shift(february, 1).date, '2024-03-29');
});

test('weekly boundaries use local calendar days through daylight-saving transitions', () => {
  const create = periodFunction('createEventAgendaPeriod');
  const shift = periodFunction('shiftEventAgendaPeriod');
  const spring = create({ view: 'week', date: '2026-03-08', timeZone: 'America/New_York' });
  const fall = create({ view: 'week', date: '2026-11-01', timeZone: 'America/New_York' });
  const shiftedSpring = shift(create({ view: 'week', date: '2026-03-01', timeZone: 'America/New_York' }), 1);

  assert.equal(iso(spring.start), '2026-03-02T05:00:00.000Z');
  assert.equal(iso(spring.end), '2026-03-09T04:00:00.000Z');
  assert.equal((spring.end - spring.start) / 3_600_000, 167);
  assert.equal(shiftedSpring.date, '2026-03-08');
  assert.equal(shiftedSpring.start, spring.start);
  assert.equal(shiftedSpring.end, spring.end);
  assert.equal(iso(fall.start), '2026-10-26T04:00:00.000Z');
  assert.equal(iso(fall.end), '2026-11-02T05:00:00.000Z');
  assert.equal((fall.end - fall.start) / 3_600_000, 169);
});

test('a month can start at the first existing local time after a midnight DST gap', () => {
  const create = periodFunction('createEventAgendaPeriod');
  const october = create({ view: 'month', date: '2017-10-15', timeZone: 'America/Asuncion' });

  assert.equal(october.date, '2017-10-15');
  assert.equal(iso(october.start), '2017-10-01T04:00:00.000Z');
  assert.equal(iso(october.end), '2017-11-01T03:00:00.000Z');
});

test('calendar boundaries also support IANA zones whose offset is not a whole hour', () => {
  const create = periodFunction('createEventAgendaPeriod');
  const october = create({ view: 'month', date: '2026-10-19', timeZone: 'Asia/Kathmandu' });
  assert.equal(iso(october.start), '2026-09-30T18:15:00.000Z');
  assert.equal(iso(october.end), '2026-10-31T18:15:00.000Z');
});

test('invalid zones fall back to UTC and the supplied instant supplies a missing reference date', () => {
  const create = periodFunction('createEventAgendaPeriod');
  const invalidZone = create({ view: 'week', date: '2026-10-01', timeZone: 'Invalid/Zone' });
  assert.equal(invalidZone.timeZone, 'UTC');
  assert.equal(invalidZone.start, Date.parse('2026-09-28T00:00:00Z'));
  assert.equal(invalidZone.end, Date.parse('2026-10-05T00:00:00Z'));

  const today = create({ view: 'week', timeZone: 'America/Argentina/Cordoba', now: '2026-01-01T01:00:00Z' });
  assert.equal(today.date, '2025-12-31');
  assert.equal(today.view, 'week');
});

test('period overlap is half-open and includes an event that crosses the period start', () => {
  const create = periodFunction('createEventAgendaPeriod');
  const overlaps = periodFunction('eventOverlapsAgendaPeriod');
  const period = create({ view: 'week', date: '2026-10-01', timeZone: 'UTC' });

  assert.equal(overlaps({ startsAt: '2026-09-20T00:00:00Z', endsAt: '2026-09-28T00:00:00Z' }, period), false,
    'an event ending at the included start boundary is outside');
  assert.equal(overlaps({ startsAt: '2026-10-05T00:00:00Z', endsAt: '2026-10-06T00:00:00Z' }, period), false,
    'an event beginning at the excluded end boundary is outside');
  assert.equal(overlaps({ startsAt: '2026-09-27T22:00:00Z', endsAt: '2026-10-01T00:00:00Z' }, period), true,
    'an event that began before the week and continues into it is included');
  assert.equal(overlaps({ startsAt: '2026-09-28T00:00:00Z', endsAt: '2026-09-29T00:00:00Z' }, period), true);
  assert.equal(overlaps({ startsAt: '2026-10-04T23:00:00Z', endsAt: '2026-10-05T00:00:00Z' }, period), true);
});

test('period URLs prefer explicit dates, normalize legacy ranges and preserve unrelated query state', () => {
  const parse = periodFunction('parseEventAgendaPeriod');
  const create = periodFunction('createEventAgendaPeriod');
  const serialize = periodFunction('serializeEventAgendaPeriod');
  const explicit = parse(
    '?utm_source=community&view=month&date=2024-02-29&tz=America%2FNew_York&from=2026-10-01&to=2026-10-31&includeEnded=0',
    { timeZone: 'UTC', now: '2026-10-19T12:00:00Z' },
  );
  assert.deepEqual(explicit, create({ view: 'month', date: '2024-02-29', timeZone: 'America/New_York' }));

  const legacyFrom = parse('?view=month&from=2026-09-30&to=2026-10-02&tz=UTC', {
    timeZone: 'America/Argentina/Cordoba', now: '2026-10-19T12:00:00Z',
  });
  assert.equal(legacyFrom.view, 'week', 'a valid legacy range opens the week of its first valid date');
  assert.equal(legacyFrom.date, '2026-09-30');
  assert.equal(legacyFrom.timeZone, 'UTC');

  const legacyTo = parse('?from=2026-02-30&to=2026-10-01&view=month&tz=Invalid/Zone', {
    timeZone: 'America/Argentina/Cordoba', now: '2026-10-19T12:00:00Z',
  });
  assert.equal(legacyTo.view, 'week');
  assert.equal(legacyTo.date, '2026-10-01');
  assert.equal(legacyTo.timeZone, 'America/Argentina/Cordoba');

  const invalidExplicitDate = parse('?view=month&date=2026-02-30&from=2026-09-30&to=2026-10-02&tz=UTC', {
    timeZone: 'America/Argentina/Cordoba', now: '2026-10-19T12:00:00Z',
  });
  assert.equal(invalidExplicitDate.view, 'week');
  assert.equal(invalidExplicitDate.date, '2026-09-30');
  assert.equal(invalidExplicitDate.timeZone, 'UTC');

  const noValidDate = parse('?view=month&date=2026-02-30&tz=UTC', {
    timeZone: 'America/Argentina/Cordoba', now: '2026-01-01T01:00:00Z',
  });
  assert.equal(noValidDate.view, 'month');
  assert.equal(noValidDate.date, '2026-01-01');

  const browserZoneDate = parse('?view=month&date=2026-02-30', {
    timeZone: 'America/Argentina/Cordoba', now: '2026-01-01T01:00:00Z',
  });
  assert.equal(browserZoneDate.date, '2025-12-31');
  assert.equal(browserZoneDate.timeZone, 'America/Argentina/Cordoba');

  const invalidView = parse('?view=year&date=2026-10-01&tz=UTC', {
    timeZone: 'America/Argentina/Cordoba', now: '2026-10-19T12:00:00Z',
  });
  assert.equal(invalidView.view, 'week');
  assert.equal(invalidView.date, '2026-10-01');

  const saved = serialize(
    '?utm_source=community&mode=hybrid&from=2026-09-30&to=2026-10-02&includeEnded=0&view=month&date=2026-10-01&tz=Old/Zone',
    explicit,
  );
  const query = new URLSearchParams(saved);
  assert.equal(query.get('utm_source'), 'community');
  assert.equal(query.get('mode'), 'hybrid');
  assert.equal(query.get('view'), 'month');
  assert.equal(query.get('date'), '2024-02-29');
  assert.equal(query.get('tz'), 'America/New_York');
  assert.equal(query.has('from'), false);
  assert.equal(query.has('to'), false);
  assert.equal(query.has('includeEnded'), false);
  assert.equal([...query.keys()].filter((key) => ['view', 'date', 'tz'].includes(key)).length, 3);
});

test('agenda selection requires one matching member to overlap the period and keeps checkbox independent', () => {
  const create = periodFunction('createEventAgendaPeriod');
  const period = create({ view: 'week', date: '2026-10-01', timeZone: 'UTC' });
  const startsAt = '2026-09-27T22:00:00Z';
  const shared = { title: 'Sesión coorganizada', startsAt, timeZone: 'UTC', registrationUrl: 'https://example.test/session' };
  const members = [
    { ...shared, id: 'a-boundary', endsAt: '2026-09-28T00:00:00Z', mode: 'hybrid', country: 'CO', city: 'Cali', communityId: 'community-co' },
    { ...shared, id: 'b-filter-only', endsAt: '2026-10-02T00:00:00Z', mode: 'in-person', country: 'AR', city: 'Cali', communityId: 'community-co' },
    { ...shared, id: 'z-crosses-start', endsAt: '2026-10-01T00:00:00Z', mode: 'hybrid', country: 'CO', city: 'Cali', communityId: 'community-co' },
  ];
  const groups = uniqueEventGroups(members);
  for (const group of groups) {
    for (const event of group.events) Object.freeze(event);
    Object.freeze(group.events);
    Object.freeze(group);
  }
  Object.freeze(groups);
  const options = {
    communityById: new Map(), country: 'CO', modes: ['hybrid'], period,
    filters: { mode: 'hybrid', country: 'CO', city: 'CO:Cali', community: 'community-co' },
    now: '2026-10-10T00:00:00Z',
  };

  const [selected] = eventGroupsForAgenda(groups, options);
  assert.equal(selected.event.id, 'z-crosses-start',
    'the boundary-only member and members failing filters cannot determine group membership or display');
  assert.deepEqual(selected.events.map(({ id }) => id).sort(), members.map(({ id }) => id).sort());
  assert.deepEqual(eventGroupsForAgenda(uniqueEventGroups(members.slice(0, 2)), options), [],
    'a boundary-only matching member cannot combine with a different in-period member that fails the filters');
  assert.deepEqual(eventGroupsForAgenda(groups, { ...options, includeEnded: false }), [],
    'the period and event status are separate: the same event is omitted only when ended events are unchecked');
});

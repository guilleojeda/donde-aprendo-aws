import assert from 'node:assert/strict';
import test from 'node:test';
import { communityFactText, communityFormatCounts, communityFormatSummary } from '../src/lib/community-page-facts.mjs';
import { eventGroupCountries, eventGroupsForAgenda } from '../src/lib/event-agenda-groups.mjs';
import { eventAgendaSummaryText, eventCountNoun, nextEventAgendaTransition, summarizeUpcomingEvents } from '../src/lib/event-agenda-summary.mjs';
import { uniqueUpcomingEventGroups } from '../src/lib/events.mjs';
import { communityFaqItems, eventFaqItems } from '../src/lib/page-faq-content.mjs';

const now = new Date('2026-10-04T12:00:00.000Z');

test('community fact text handles empty, singular, plural and mixed formats naturally', () => {
  assert.equal(communityFormatCounts([]).length, 0);
  assert.equal(communityFactText([]), 'Todavía no hay comunidades AWS publicadas en el directorio.');
  assert.equal(communityFactText([], 'Costa Rica'), 'Todavía no hay comunidades AWS publicadas en Costa Rica.');
  assert.equal(communityFormatSummary([{ format: 'Student Builder Group' }]), '1 Student Builder Group');
  assert.equal(communityFactText([
    { format: 'User Group' },
    { format: 'User Group' },
    { format: 'Student Builder Group' },
  ]), 'El directorio reúne 1 Student Builder Group y 2 AWS User Groups.');
  assert.equal(communityFactText([{ format: 'Student Builder Group' }], 'Nicaragua'),
    'Comunidades AWS en Nicaragua: 1 Student Builder Group.');
});

test('community FAQs answer participation questions and point to the exact agenda route', () => {
  const countryItems = communityFaqItems({ countryName: 'Argentina', agendaPath: '/eventos/argentina/' });
  assert.equal(countryItems.length, 2);
  assert.match(countryItems[0].question, /sumo a una comunidad AWS en Argentina/u);
  assert.equal(countryItems[1].links?.[0]?.href, '/eventos/argentina/');

  const globalItems = communityFaqItems();
  assert.equal(globalItems.length, 2);
  assert.equal(globalItems[1].links?.[0]?.href, '/eventos/');
});

test('event FAQ variants keep their questions distinct for country and mode agendas', () => {
  for (const options of [{ countryName: 'Nicaragua' }, { collectionKey: 'online' }, { collectionKey: 'presenciales' }]) {
    const items = eventFaqItems(options);
    assert.ok(items.length >= 2 && items.length <= 3);
    assert.equal(new Set(items.map((item) => item.question)).size, items.length);
  }
});

function event(overrides = {}) {
  return {
    id: 'event-pe',
    title: 'Encuentro AWS',
    startsAt: '2026-10-05T12:00:00.000Z',
    endsAt: '2026-10-05T14:00:00.000Z',
    registrationUrl: 'https://meetup.example/events/123/',
    communityId: 'community-pe',
    country: 'PE',
    mode: 'online',
    ...overrides,
  };
}

test('national agenda scope follows all co-host organizers after one shared event is deduplicated', () => {
  const communities = new Map([
    ['community-pe', { id: 'community-pe', country: 'PE' }],
    ['community-co', { id: 'community-co', country: 'CO' }],
  ]);
  const primary = event();
  const cohost = event({ id: 'event-co', communityId: 'community-co', country: 'CO' });
  const groups = uniqueUpcomingEventGroups([cohost, primary], now);
  assert.equal(groups.length, 1);
  assert.deepEqual(eventGroupCountries(groups[0], communities).sort(), ['CO', 'PE']);
  const coAgenda = eventGroupsForAgenda(groups, { communityById: communities, country: 'CO' });
  assert.equal(coAgenda.length, 1);
  assert.equal(summarizeUpcomingEvents(coAgenda.map(({ event: item }) => item), now).count, 1);
  assert.equal(eventGroupsForAgenda(groups, { communityById: communities, country: 'AR' }).length, 0);
});

test('event facts select the next active event and change to zero after expiry', () => {
  const events = [
    event({ id: 'expired', startsAt: '2026-10-01T12:00:00Z', endsAt: '2026-10-01T13:00:00Z' }),
    event({ id: 'later', startsAt: '2026-10-07T12:00:00Z', endsAt: '2026-10-07T13:00:00Z' }),
    event({ id: 'next', startsAt: '2026-10-05T12:00:00Z', endsAt: '2026-10-05T13:00:00Z' }),
  ];
  const active = summarizeUpcomingEvents(events, now);
  assert.equal(active.count, 2);
  assert.equal(active.nextEvent.id, 'next');
  assert.equal(eventCountNoun(active.count), 'eventos');
  assert.equal(eventCountNoun(1), 'evento');

  const expired = summarizeUpcomingEvents(events, new Date('2026-10-08T00:00:00Z'));
  assert.deepEqual(expired, { count: 0, inProgressCount: 0, nextEvent: null });
  assert.equal(eventCountNoun(expired.count), 'eventos');
  assert.equal(nextEventAgendaTransition(events, new Date('2026-10-08T00:00:00Z')), null);
});

test('event summary reports events in progress without calling their start the next date', () => {
  const running = event({
    id: 'running',
    startsAt: now.toISOString(),
    endsAt: '2026-10-04T13:00:00.000Z',
    timeZone: 'UTC',
  });
  const endedAtBoundary = event({
    id: 'ended-at-boundary',
    startsAt: '2026-10-04T11:00:00.000Z',
    endsAt: now.toISOString(),
    timeZone: 'UTC',
  });
  const future = event({
    id: 'future',
    startsAt: '2026-10-05T12:00:00.000Z',
    endsAt: '2026-10-05T13:00:00.000Z',
    timeZone: 'UTC',
  });
  const facts = summarizeUpcomingEvents([endedAtBoundary, running, future], now);
  assert.equal(facts.count, 2);
  assert.equal(facts.inProgressCount, 1);
  assert.equal(facts.nextEvent.id, 'future');
  assert.equal(nextEventAgendaTransition([endedAtBoundary, running, future], now), Date.parse(running.endsAt));
  assert.match(eventAgendaSummaryText([endedAtBoundary, running, future], now, {
    intro: 'En la agenda de Argentina hay',
    emptyMessage: 'No hay eventos.',
  }), /^En la agenda de Argentina hay 2 eventos \(1 en curso\); el próximo comienza el /u);

  const onlyRunning = eventAgendaSummaryText([running], now, {
    intro: 'En la agenda de Argentina hay',
    emptyMessage: 'No hay eventos.',
  });
  assert.equal(onlyRunning, 'En la agenda de Argentina hay 1 evento en curso.');

  const notStarted = event({
    id: 'not-started',
    startsAt: '2026-10-04T13:00:00.000Z',
    endsAt: '2026-10-04T14:00:00.000Z',
    timeZone: 'UTC',
  });
  assert.equal(nextEventAgendaTransition([notStarted], now), Date.parse(notStarted.startsAt));
  const atStart = summarizeUpcomingEvents([notStarted], new Date(notStarted.startsAt));
  assert.deepEqual(atStart, { count: 1, inProgressCount: 1, nextEvent: null });
  assert.equal(nextEventAgendaTransition([notStarted], new Date(notStarted.startsAt)), Date.parse(notStarted.endsAt));
});

test('invalid event-fact reference time is rejected', () => {
  assert.throws(() => summarizeUpcomingEvents([], Number.NaN), /Invalid event summary reference time/u);
});

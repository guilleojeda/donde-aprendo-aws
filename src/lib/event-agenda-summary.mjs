import { eventDateLabel } from './events.mjs';

/** @param {Array<{ startsAt: string, endsAt: string, id?: string, timeZone?: string }>} events @param {Date | number} [now] */
export function summarizeUpcomingEvents(events, now = Date.now()) {
  const timestamp = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(timestamp)) throw new Error('Invalid event summary reference time');
  const active = events.filter((event) => Date.parse(event.endsAt) > timestamp)
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)
      || String(left.id ?? '').localeCompare(String(right.id ?? '')));
  const inProgress = active.filter((event) => Date.parse(event.startsAt) <= timestamp);
  const nextEvent = active.find((event) => Date.parse(event.startsAt) > timestamp) ?? null;
  return { count: active.length, inProgressCount: inProgress.length, nextEvent };
}

export function eventCountNoun(count) {
  return count === 1 ? 'evento' : 'eventos';
}

/** Build the visible fact line from the same event cards the agenda currently exposes.
 * @param {Array<{ startsAt: string, endsAt: string, id?: string, timeZone?: string }>} events
 * @param {Date | number} now
 * @param {{ intro: string, emptyMessage: string }} copy
 */
export function eventAgendaSummaryText(events, now, { intro, emptyMessage }) {
  const facts = summarizeUpcomingEvents(events, now);
  if (facts.count === 0) return emptyMessage;

  let sentence = `${intro} ${facts.count} ${eventCountNoun(facts.count)}`;
  if (facts.inProgressCount === facts.count) sentence += ' en curso';
  else if (facts.inProgressCount > 0) sentence += ` (${facts.inProgressCount} en curso)`;
  if (facts.nextEvent) {
    const nextDate = eventDateLabel(facts.nextEvent.startsAt, facts.nextEvent.timeZone);
    sentence += `; el próximo comienza el ${nextDate}`;
  }
  return `${sentence}.`;
}

/** Return the next start or end instant that can change the visible event summary. */
export function nextEventAgendaTransition(events, now = Date.now()) {
  const timestamp = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(timestamp)) throw new Error('Invalid event summary reference time');
  const transitions = [];
  for (const event of events) {
    const startsAt = Date.parse(event.startsAt);
    const endsAt = Date.parse(event.endsAt);
    if (startsAt > timestamp && endsAt > timestamp) transitions.push(startsAt);
    if (endsAt > timestamp) transitions.push(endsAt);
  }
  return transitions.length ? Math.min(...transitions) : null;
}

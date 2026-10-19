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
  const timestamp = now instanceof Date ? now.getTime() : Number(now);
  const finalizedCount = events.filter((event) => Date.parse(event.endsAt) <= timestamp).length;
  if (events.length === 0) return emptyMessage;

  const upcomingCount = facts.count - facts.inProgressCount;
  if (facts.count === 0) {
    return `${intro} ${events.length} ${eventCountNoun(events.length)} finalizado${events.length === 1 ? '' : 's'}.`;
  }
  if (finalizedCount === 0 && upcomingCount === 0) {
    return `${intro} ${facts.inProgressCount} ${eventCountNoun(facts.inProgressCount)} en curso.`;
  }

  const statusCounts = [];
  if (upcomingCount > 0) statusCounts.push(`${upcomingCount} próximo${upcomingCount === 1 ? '' : 's'}`);
  if (facts.inProgressCount > 0) statusCounts.push(`${facts.inProgressCount} en curso`);
  if (finalizedCount > 0) statusCounts.push(`${finalizedCount} finalizado${finalizedCount === 1 ? '' : 's'}`);
  const statusText = statusCounts.length > 1
    ? `${statusCounts.slice(0, -1).join(', ')} y ${statusCounts.at(-1)}`
    : statusCounts[0];
  let sentence = statusCounts.length > 1
    ? `${intro} ${events.length} ${eventCountNoun(events.length)}: ${statusText}`
    : `${intro} ${upcomingCount} ${eventCountNoun(upcomingCount)} próximo${upcomingCount === 1 ? '' : 's'}`;
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

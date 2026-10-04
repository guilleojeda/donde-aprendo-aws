import { eventGroupsForModes } from './event-collections.mjs';

export function organizerCountry(event, communityById) {
  return event.country ?? communityById.get(event.communityId ?? '')?.country;
}

export function eventGroupCountries(group, communityById) {
  return [...new Set(group.events.map((event) => organizerCountry(event, communityById))
    .filter((country) => Boolean(country)))];
}

/** Apply the agenda's country and mode scope to already-deduplicated event groups. */
export function eventGroupsForAgenda(groups, { communityById, country, modes } = {}) {
  const modeGroups = eventGroupsForModes(groups, modes);
  if (!country) return modeGroups;
  return modeGroups.filter((group) => eventGroupCountries(group, communityById).includes(country));
}

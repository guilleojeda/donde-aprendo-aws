import { communityCountryPath, eventCountryPath } from './community-country-pages.mjs';
import { effectiveEventLocation } from './event-location.mjs';

export const RESOURCE_PATHS = Object.freeze({
  content: '/aprender/',
  source: '/creadores/',
  community: '/comunidades/',
});

export function resourceHref(resource) {
  const path = resource.kind === 'community' && resource.country
    ? communityCountryPath(resource.country) ?? RESOURCE_PATHS.community
    : RESOURCE_PATHS[resource.kind];
  if (!path) throw new Error(`Unknown resource kind: ${resource.kind}`);
  return `${path}#resource-${resource.id}`;
}

export function eventHref(event, countryPages = [], resources = [], communityById = new Map(
  resources.filter((resource) => resource.kind === 'community').map((resource) => [resource.id, resource]),
)) {
  const { country } = effectiveEventLocation(event, communityById);
  const nationalPath = country && countryPages.some((page) => page.country === country)
    ? eventCountryPath(country)
    : undefined;
  return `${nationalPath ?? '/eventos/'}#event-${event.id}`;
}

export function eventCalendarHref(event) {
  return `/eventos/${event.id}.ics`;
}

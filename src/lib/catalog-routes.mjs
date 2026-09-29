export const RESOURCE_PATHS = Object.freeze({
  content: '/aprender/',
  source: '/creadores/',
  community: '/comunidades/',
});

export function resourceHref(resource) {
  const path = RESOURCE_PATHS[resource.kind];
  if (!path) throw new Error(`Unknown resource kind: ${resource.kind}`);
  return `${path}#resource-${resource.id}`;
}

export function eventHref(event) {
  return `/eventos/#event-${event.id}`;
}

export function eventCalendarHref(event) {
  return `/eventos/${event.id}.ics`;
}

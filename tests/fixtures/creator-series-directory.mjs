export const resource = (overrides = {}) => ({
  id: 'resource-shared',
  title: 'Guía de Lambda',
  url: 'https://example.test/guia-lambda',
  description: 'Una guía para crear funciones.',
  category: 'Serverless',
  kind: 'content',
  format: 'Artículo',
  topics: ['Serverless'],
  order: 1,
  featured: false,
  published: true,
  directoryControl: 'creator',
  ...overrides,
});

export const profile = (id, overrides = {}) => ({
  id,
  displayName: id === 'creator-a' ? 'Ana AWS' : 'Beto AWS',
  slug: id === 'creator-a' ? 'ana-aws' : 'beto-aws',
  published: true,
  hidden: false,
  ...overrides,
});

export const series = (id, profileId, overrides = {}) => ({
  id,
  profileId,
  name: id === 'series-a' ? 'Lambda desde cero' : 'Serverless en práctica',
  slug: id === 'series-a' ? 'lambda-desde-cero' : 'serverless-practico',
  description: `Descripción privada de ${id}`,
  version: 1,
  ...overrides,
});

export const placement = (profileId, resourceId, overrides = {}) => ({
  id: `${profileId}-${resourceId}`,
  profileId,
  resourceId,
  selected: true,
  series: {},
  ...overrides,
});

export function sharedResourceState({
  selectA = true,
  selectB = true,
  extraProfiles = [],
  extraSeries = [],
  extraPlacements = [],
} = {}) {
  return {
    profiles: [profile('creator-a'), profile('creator-b'), ...extraProfiles],
    series: [series('series-a', 'creator-a'), series('series-b', 'creator-b'), ...extraSeries],
    placements: [
      placement('creator-a', 'resource-shared', {
        selected: selectA,
        series: { 'series-a': { position: 0 } },
      }),
      placement('creator-b', 'resource-shared', {
        selected: selectB,
        series: { 'series-b': { position: 0 } },
      }),
      ...extraPlacements,
    ],
  };
}

export const event = (id, overrides = {}) => ({
  recordType: 'event',
  id,
  title: 'Encuentro de Lambda',
  description: 'Sesión sobre funciones serverless.',
  startsAt: '2020-01-01T10:00:00Z',
  endsAt: '2099-01-01T11:00:00Z',
  timeZone: 'UTC',
  organizer: 'Comunidad AWS',
  mode: 'online',
  registrationUrl: 'https://example.test/evento?source=creator',
  published: true,
  directoryControl: 'creator',
  ...overrides,
});

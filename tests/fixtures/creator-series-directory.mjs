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
  schemaVersion: 2,
  version: 1,
  placements: {},
  order: { featured: [], ordinary: [] },
  series: {},
});

export const series = (id, profileId, overrides = {}) => ({
  id,
  profileId,
  name: id === 'series-a' ? 'Lambda desde cero' : 'Serverless en práctica',
  slug: id === 'series-a' ? 'lambda-desde-cero' : 'serverless-practico',
  description: `Descripción privada de ${id}`,
  chapters: [],
  ...overrides,
});

export const placement = (profileId, resourceId, overrides = {}) => ({
  id: `${profileId}-${resourceId}`,
  profileId,
  resourceId,
  selectedForDirectory: true,
  featured: false,
  ...overrides,
});

/** Assemble fixture descriptors into the actual flat v2 creator-state shape. */
export function creatorAggregates(profiles, placements = [], seriesEntries = []) {
  const byId = new Map(profiles.map((entry) => [entry.id, structuredClone(entry)]));
  for (const { profileId, id, resourceId, selectedForDirectory, featured } of placements) {
    const creator = byId.get(profileId);
    if (!creator) continue;
    creator.placements[id] = { resourceId, selectedForDirectory };
    creator.order[featured ? 'featured' : 'ordinary'].push(id);
  }
  for (const { profileId, id, ...entry } of seriesEntries) {
    const creator = byId.get(profileId);
    if (!creator) continue;
    creator.series[id] = entry;
  }
  return { creators: [...byId.values()] };
}

export function sharedResourceState({
  selectA = true,
  selectB = true,
  extraProfiles = [],
  extraSeries = [],
  extraPlacements = [],
} = {}) {
  const profiles = [profile('creator-a'), profile('creator-b'), ...extraProfiles];
  const placementA = placement('creator-a', 'resource-shared', { selectedForDirectory: selectA });
  const placementB = placement('creator-b', 'resource-shared', { selectedForDirectory: selectB });
  const seriesA = series('series-a', 'creator-a', { chapters: [placementA.id] });
  const seriesB = series('series-b', 'creator-b', { chapters: [placementB.id] });
  return creatorAggregates(
    profiles,
    [placementA, placementB, ...extraPlacements],
    [seriesA, seriesB, ...extraSeries],
  );
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

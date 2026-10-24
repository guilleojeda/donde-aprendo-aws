import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCatalog, projectPublishedCatalog } from '../src/lib/catalog.mjs';
import { fingerprintPublicCatalog } from '../src/lib/publication.mjs';
import { buildSearchIndex, searchIndex } from '../src/lib/unified-search.mjs';
import {
  event,
  placement,
  profile,
  resource,
  series,
  sharedResourceState,
} from './fixtures/creator-series-directory.mjs';

const associations = (records) => records[0]?.series ?? [];

test('a shared resource publishes only each selected profile’s own eligible series', () => {
  const selectedByA = projectPublishedCatalog([resource()], sharedResourceState());
  const selectedOnlyByB = projectPublishedCatalog([resource()], sharedResourceState({ selectA: false }));

  assert.equal(selectedByA.length, 1);
  assert.equal(selectedOnlyByB.length, 1);
  assert.deepEqual(associations(selectedByA).map(({ seriesId }) => seriesId), ['series-a', 'series-b']);
  assert.deepEqual(associations(selectedOnlyByB), [{
    seriesId: 'series-b',
    name: 'Serverless en práctica',
    creatorName: 'Beto AWS',
    href: '/c/beto-aws/series/serverless-practico/',
  }]);
});

test('associations require an approved visible resource and an eligible current profile placement', () => {
  const state = sharedResourceState({
    selectA: false,
    selectB: true,
    extraProfiles: [
      profile('creator-hidden', { hidden: true }),
      profile('creator-draft', { published: false }),
    ],
    extraSeries: [
      series('series-hidden', 'creator-hidden', { name: 'No publicar', slug: 'no-publicar' }),
      series('series-draft', 'creator-draft', { name: 'Perfil en borrador', slug: 'perfil-en-borrador' }),
    ],
    extraPlacements: [
      placement('creator-hidden', 'resource-shared', {
        selected: true,
        series: { 'series-hidden': { position: 0 } },
      }),
      placement('creator-draft', 'resource-shared', {
        selected: true,
        series: { 'series-draft': { position: 0 } },
      }),
    ],
  });
  const selectedB = state.placements.find(({ profileId }) => profileId === 'creator-b');
  selectedB.series['series-deleted'] = { position: 0 };

  const visible = projectPublishedCatalog([resource()], state);
  assert.deepEqual(associations(visible).map(({ seriesId }) => seriesId), ['series-b']);
  assert.deepEqual(projectPublishedCatalog([resource({ published: false })], state), []);
  assert.deepEqual(projectPublishedCatalog([resource({ approvalRevoked: true })], state), []);
  assert.deepEqual(projectPublishedCatalog([resource({ hidden: true })], state), []);
});

test('editorial legacy inclusion has no series by itself, while a selected placement can publish one', () => {
  const legacy = resource({ directoryControl: 'editorial' });
  const withoutSelection = projectPublishedCatalog([legacy], sharedResourceState({ selectA: false, selectB: false }));
  const withSelection = projectPublishedCatalog([legacy], sharedResourceState({ selectA: true, selectB: false }));

  assert.equal(withoutSelection.length, 1);
  assert.deepEqual(associations(withoutSelection), []);
  assert.deepEqual(associations(withSelection).map(({ seriesId }) => seriesId), ['series-a']);
});

test('a placement cannot borrow another profile’s series identity', () => {
  const state = sharedResourceState({ selectA: true, selectB: false });
  const placementA = state.placements.find(({ profileId }) => profileId === 'creator-a');
  placementA.series['series-b'] = { position: 1 };

  const records = projectPublishedCatalog([resource()], state);
  assert.deepEqual(associations(records).map(({ seriesId }) => seriesId), ['series-a']);
});

test('same-named series from different profiles remain separate associations', () => {
  const state = sharedResourceState();
  state.series = state.series.map((entry) => ({ ...entry, name: 'Serie compartida', slug: 'serie-compartida' }));

  const records = projectPublishedCatalog([resource()], state);
  const index = buildSearchIndex([], records);
  const matches = searchIndex(index, 'Serie compartida');

  assert.deepEqual(associations(records).map(({ seriesId }) => seriesId), ['series-a', 'series-b']);
  assert.deepEqual(associations(records).map(({ href }) => href), [
    '/c/ana-aws/series/serie-compartida/',
    '/c/beto-aws/series/serie-compartida/',
  ]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].url, '/aprender/#resource-resource-shared');
  assert.deepEqual(matches[0].series.map(({ seriesId }) => seriesId), ['series-a', 'series-b']);
});

test('series projection exposes only deterministic public association fields', () => {
  const state = sharedResourceState({ selectA: true, selectB: true });
  state.profiles[0] = {
    ...state.profiles[0],
    accountId: 'private-account-should-not-leak',
    email: 'private-email@example.invalid',
    photo: 'private-photo-key',
  };
  state.series[0] = { ...state.series[0], privateNote: 'private-series-note' };
  state.placements.reverse();
  state.profiles.reverse();
  state.series.reverse();

  const records = projectPublishedCatalog([resource({ submitterEmail: 'private-submit@example.invalid' })], state);
  assert.equal(records.length, 1);
  assert.deepEqual(associations(records).map(({ seriesId }) => seriesId), ['series-a', 'series-b']);
  assert.deepEqual(Object.keys(associations(records)[0]).sort(), ['creatorName', 'href', 'name', 'seriesId']);
  assert.doesNotMatch(JSON.stringify(records), /private-account-should-not-leak|private-email|private-photo|private-series-note|private-submit|selectedForDirectory|profileId/);
});

test('public directory fingerprint follows association identity but ignores unexposed series and private data', () => {
  const publicState = sharedResourceState({ selectA: false, selectB: true });
  const project = (creatorState) => projectPublishedCatalog([resource()], creatorState);
  const baselineRecords = project(publicState);
  const baseline = fingerprintPublicCatalog(baselineRecords);
  const reorderedState = {
    profiles: [...publicState.profiles].reverse(),
    placements: [...publicState.placements].reverse(),
    series: [...publicState.series].reverse(),
  };

  assert.equal(fingerprintPublicCatalog(project(reorderedState)), baseline);
  assert.notEqual(fingerprintPublicCatalog(project(sharedResourceState())), baseline);
  assert.notEqual(fingerprintPublicCatalog(project({
    ...publicState,
    profiles: publicState.profiles.map((entry) => entry.id === 'creator-b' ? { ...entry, displayName: 'Beto Cloud' } : entry),
  })), baseline);
  assert.notEqual(fingerprintPublicCatalog(project({
    ...publicState,
    profiles: publicState.profiles.map((entry) => entry.id === 'creator-b' ? { ...entry, slug: 'beto-cloud' } : entry),
  })), baseline);
  assert.notEqual(fingerprintPublicCatalog(project({
    ...publicState,
    series: publicState.series.map((entry) => entry.id === 'series-b' ? { ...entry, name: 'Serverless avanzado' } : entry),
  })), baseline);
  assert.notEqual(fingerprintPublicCatalog(project({
    ...publicState,
    series: publicState.series.map((entry) => entry.id === 'series-b' ? { ...entry, slug: 'serverless-avanzado' } : entry),
  })), baseline);

  const unexposedChanges = {
    ...publicState,
    profiles: publicState.profiles.map((entry) => ({ ...entry, photo: 'changed-private-photo', socials: { x: 'changed-private-social' } })),
    series: publicState.series.map((entry) => ({ ...entry, description: 'Changed unpublished text', version: 91 })),
    placements: publicState.placements.map((entry) => ({
      ...entry,
      accountId: 'private-account',
      analyticsCache: { report: 'private-ga-report' },
      series: Object.fromEntries(Object.entries(entry.series).map(([id, membership]) => [id, { ...membership, position: 99 }])),
    })),
  };
  assert.equal(fingerprintPublicCatalog(project(unexposedChanges)), baseline);
});

test('catalog scan reads series projection fields while excluding aliases, accounts, sessions and analytics cache', async () => {
  const scanCalls = [];
  const creatorRows = [
    { pk: 'PROFILE#creator-a', sk: 'META', recordType: 'profile', id: 'creator-a', displayName: 'Ana AWS', slug: 'ana-aws', published: true },
    {
      pk: 'PROFILE#creator-a', sk: 'PLACEMENT#placement-a', recordType: 'placement', id: 'placement-a',
      profileId: 'creator-a', resourceId: 'resource-shared', selectedForDirectory: true,
      series: { 'series-a': { position: 0 } },
    },
    { pk: 'PROFILE#creator-a', sk: 'SERIES#series-a', recordType: 'series', id: 'series-a', profileId: 'creator-a', name: 'Lambda desde cero', slug: 'lambda-desde-cero', description: 'Privada en el índice', version: 1 },
    { pk: 'PROFILE#creator-a', sk: 'SERIES_SLUG#antigua', recordType: 'seriesSlug', id: 'series-a', slug: 'antigua', aliasPrivateSentinel: 'alias-private' },
    { pk: 'PROFILE_SLUG#ana-antigua', sk: 'PROFILE#creator-a', recordType: 'profileSlug', id: 'creator-a', aliasPrivateSentinel: 'alias-private' },
    { pk: 'ANALYTICS#creator-a', sk: 'GA4#1#1', recordType: 'analyticsCache', report: 'private-ga-report' },
    { pk: 'ACCOUNT#private-account', sk: 'SESSION#private-session', recordType: 'session', email: 'private@example.invalid', csrfToken: 'private-csrf' },
  ];

  const records = await loadCatalog({
    tableName: 'catalog-test',
    creatorTableName: 'creator-test',
    scanPage: async () => ({ Items: [resource()] }),
    scanCreatorPage: async (params) => {
      scanCalls.push(params);
      const start = params.ExclusiveStartKey ? 4 : 0;
      const Items = creatorRows.slice(start, start + 4);
      return { Items, ...(start === 0 ? { LastEvaluatedKey: { pk: 'PROFILE#creator-a', sk: 'SERIES_SLUG#antigua' } } : {}) };
    },
  });

  assert.deepEqual(associations(records), [{
    seriesId: 'series-a',
    name: 'Lambda desde cero',
    creatorName: 'Ana AWS',
    href: '/c/ana-aws/series/lambda-desde-cero/',
  }]);
  assert.equal(scanCalls.length, 2);
  assert.deepEqual(scanCalls[1].ExclusiveStartKey, { pk: 'PROFILE#creator-a', sk: 'SERIES_SLUG#antigua' });
  for (const params of scanCalls) {
    assert.equal(params.ConsistentRead, true);
    assert.equal(params.Select, 'SPECIFIC_ATTRIBUTES');
    const fields = Object.values(params.ExpressionAttributeNames ?? {});
    for (const field of ['displayName', 'name', 'slug', 'profileId', 'resourceId', 'selectedForDirectory', 'series']) {
      assert.ok(fields.includes(field), `scan includes ${field}`);
    }
    for (const field of ['accountId', 'email', 'csrfToken', 'report', 'identity', 'session', 'aliasPrivateSentinel']) {
      assert.equal(fields.includes(field), false, `scan excludes ${field}`);
      assert.equal(new RegExp(`\\b${field}\\b`, 'u').test(params.ProjectionExpression), false, `projection excludes ${field}`);
    }
  }
  assert.doesNotMatch(JSON.stringify(records), /alias-private|private-ga-report|private@example|private-csrf|Privada en el índice/);
});

test('global search finds a selected series and creator while keeping one resource destination', () => {
  const catalog = projectPublishedCatalog([resource()], sharedResourceState({ selectA: false, selectB: true }));
  const index = buildSearchIndex([], catalog);
  const bySeries = searchIndex(index, 'Serverless en práctica');
  const byCreatorAndSeries = searchIndex(index, 'Beto Serverless');

  assert.deepEqual(bySeries.map(({ type, url }) => [type, url]), [['content', '/aprender/#resource-resource-shared']]);
  assert.deepEqual(byCreatorAndSeries.map(({ type, url }) => [type, url]), [['content', '/aprender/#resource-resource-shared']]);
  assert.deepEqual(searchIndex(index, 'Lambda desde cero'), []);
  assert.equal(index.filter(({ url }) => url === '/aprender/#resource-resource-shared').length, 1);
  assert.deepEqual(index.find(({ url }) => url === '/aprender/#resource-resource-shared').series, [{
    seriesId: 'series-b',
    name: 'Serverless en práctica',
    creatorName: 'Beto AWS',
    href: '/c/beto-aws/series/serverless-practico/',
  }]);
});

test('global event search unions upcoming occurrence associations and excludes ended members', () => {
  const profiles = [profile('creator-a'), profile('creator-b'), profile('creator-c')];
  const seriesRows = [
    series('series-a', 'creator-a', { name: 'Lambda eventos vigentes', slug: 'lambda-vigente' }),
    series('series-b', 'creator-b', { name: 'Comunidad serverless', slug: 'comunidad-serverless' }),
    series('series-ended', 'creator-c', { name: 'Serie de evento terminado', slug: 'evento-terminado' }),
  ];
  const eventRows = [
    event('event-a', { endsAt: '2020-01-01T11:00:00Z' }),
    event('event-b'),
    event('event-c'),
  ];
  const placements = [
    placement('creator-c', 'event-a', { series: { 'series-ended': { position: 0 } } }),
    placement('creator-a', 'event-b', { series: { 'series-a': { position: 0 } } }),
    placement('creator-b', 'event-c', { series: { 'series-b': { position: 0 } } }),
  ];
  const catalog = projectPublishedCatalog(eventRows, { profiles, placements, series: seriesRows });
  const index = buildSearchIndex([], catalog);
  const result = searchIndex(index, 'Lambda eventos vigentes comunidad serverless', 'event');

  assert.equal(result.length, 1);
  assert.equal(result[0].url, '/eventos/#event-event-b');
  assert.deepEqual(result[0].series.map(({ seriesId }) => seriesId), ['series-a', 'series-b']);
  assert.deepEqual(searchIndex(index, 'Serie de evento terminado', 'event'), []);
});

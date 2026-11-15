import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCatalog, projectPublishedCatalog } from '../src/lib/catalog.mjs';
import { fingerprintPublicCatalog } from '../src/lib/publication.mjs';
import { buildSearchIndex, searchIndex } from '../src/lib/unified-search.mjs';
import {
  creatorAggregates,
  event,
  placement,
  profile,
  resource,
  series,
  sharedResourceState,
} from './fixtures/creator-series-directory.mjs';

const associations = (records) => records[0]?.series ?? [];
const physicalState = (creator) => ({
  ...creator,
  pk: `PROFILE#${creator.id}`,
  sk: 'META',
  recordType: 'creatorState',
});

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

test('associations require a published visible profile and selected chapter placement', () => {
  const hiddenPlacement = placement('creator-hidden', 'resource-shared');
  const draftPlacement = placement('creator-draft', 'resource-shared');
  const state = sharedResourceState({
    selectA: false,
    selectB: true,
    extraProfiles: [profile('creator-hidden', { hidden: true }), profile('creator-draft', { published: false })],
    extraSeries: [
      series('series-hidden', 'creator-hidden', { name: 'No publicar', slug: 'no-publicar', chapters: [hiddenPlacement.id] }),
      series('series-draft', 'creator-draft', { name: 'Perfil en borrador', slug: 'perfil-en-borrador', chapters: [draftPlacement.id] }),
    ],
    extraPlacements: [hiddenPlacement, draftPlacement],
  });

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

test('a Series sequence cannot reference another creator’s placement', () => {
  const state = sharedResourceState({ selectA: true, selectB: false });
  const creatorA = state.creators.find(({ id }) => id === 'creator-a');
  creatorA.series['series-a'].chapters = ['creator-b-resource-shared'];

  assert.throws(() => projectPublishedCatalog([resource()], state), /creator state Series.*chapters|chapter/i);
});

test('same-named series from different profiles remain separate associations', () => {
  const state = sharedResourceState();
  for (const creator of state.creators) {
    for (const entry of Object.values(creator.series)) {
      entry.name = 'Serie compartida';
      entry.slug = 'serie-compartida';
    }
  }

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
  state.creators[0].bio = 'private-profile-bio';
  state.creators[0].socials = { website: 'https://private.example.invalid' };
  state.creators[0].photo = { version: 'private-photo-key' };
  state.creators[0].series['series-a'].description = 'private-series-note';
  state.creators.reverse();
  for (const creator of state.creators) {
    creator.series = Object.fromEntries(Object.entries(creator.series).reverse());
  }

  const records = projectPublishedCatalog([resource({ submitterEmail: 'private-submit@example.invalid' })], state);
  assert.equal(records.length, 1);
  assert.deepEqual(associations(records).map(({ seriesId }) => seriesId), ['series-a', 'series-b']);
  assert.deepEqual(Object.keys(associations(records)[0]).sort(), ['creatorName', 'href', 'name', 'seriesId']);
  assert.doesNotMatch(JSON.stringify(records), /private-profile-bio|private.example|private-photo|private-series-note|private-submit|selectedForDirectory|profileId/);
});

test('public directory fingerprint follows association identity and ignores unexposed order and profile data', () => {
  const publicState = sharedResourceState({ selectA: false, selectB: true });
  const project = (creatorState) => projectPublishedCatalog([resource()], creatorState);
  const baselineRecords = project(publicState);
  const baseline = fingerprintPublicCatalog(baselineRecords);
  const reorderedState = structuredClone(publicState);
  reorderedState.creators.reverse();
  assert.equal(fingerprintPublicCatalog(project(reorderedState)), baseline);
  assert.notEqual(fingerprintPublicCatalog(project(sharedResourceState())), baseline);

  const changedName = structuredClone(publicState);
  changedName.creators.find(({ id }) => id === 'creator-b').displayName = 'Beto Cloud';
  assert.notEqual(fingerprintPublicCatalog(project(changedName)), baseline);
  const changedProfileSlug = structuredClone(publicState);
  changedProfileSlug.creators.find(({ id }) => id === 'creator-b').slug = 'beto-cloud';
  assert.notEqual(fingerprintPublicCatalog(project(changedProfileSlug)), baseline);
  const changedSeriesName = structuredClone(publicState);
  changedSeriesName.creators.find(({ id }) => id === 'creator-b').series['series-b'].name = 'Serverless avanzado';
  assert.notEqual(fingerprintPublicCatalog(project(changedSeriesName)), baseline);
  const changedSeriesSlug = structuredClone(publicState);
  changedSeriesSlug.creators.find(({ id }) => id === 'creator-b').series['series-b'].slug = 'serverless-avanzado';
  assert.notEqual(fingerprintPublicCatalog(project(changedSeriesSlug)), baseline);

  const unexposedChanges = structuredClone(publicState);
  const creatorB = unexposedChanges.creators.find(({ id }) => id === 'creator-b');
  creatorB.version = 91;
  creatorB.photo = { version: 'changed-private-photo' };
  creatorB.socials = { x: 'changed-private-social' };
  creatorB.series['series-b'].description = 'Changed public Series page description';
  creatorB.order.featured.push(...creatorB.order.ordinary.splice(0));
  assert.equal(fingerprintPublicCatalog(project(unexposedChanges)), baseline);
});

test('catalog scan reads aggregate order and Series fields while excluding auxiliary profile rows', async () => {
  const scanCalls = [];
  const creator = profile('creator-a');
  const placementRow = placement('creator-a', 'resource-shared');
  const creatorRows = [
    { pk: 'PROFILE#creator-a', sk: 'SERIES_SLUG#antigua', recordType: 'seriesAlias', aliasPrivateSentinel: 'alias-private' },
    physicalState(creatorAggregates(
      [creator], [placementRow], [series('series-a', 'creator-a', { chapters: [placementRow.id] })],
    ).creators[0]),
    { pk: 'ANALYTICS#creator-a', sk: 'GA4#1#1', recordType: 'analyticsCache', report: 'private-ga-report' },
    { pk: 'ACCOUNT#private-account', sk: 'SESSION#private-session', recordType: 'session', email: 'private@example.invalid', csrfToken: 'private-csrf' },
  ];

  const records = await loadCatalog({
    tableName: 'catalog-test',
    creatorTableName: 'creator-test',
    scanPage: async () => ({ Items: [resource()] }),
    scanCreatorPage: async (params) => {
      scanCalls.push(params);
      const start = params.ExclusiveStartKey ? 2 : 0;
      const Items = creatorRows.slice(start, start + 2);
      return { Items, ...(start === 0 ? { LastEvaluatedKey: { pk: 'PROFILE#creator-a', sk: 'META' } } : {}) };
    },
  });

  assert.deepEqual(associations(records), [{
    seriesId: 'series-a',
    name: 'Lambda desde cero',
    creatorName: 'Ana AWS',
    href: '/c/ana-aws/series/lambda-desde-cero/',
  }]);
  assert.equal(scanCalls.length, 2);
  assert.deepEqual(scanCalls[1].ExclusiveStartKey, { pk: 'PROFILE#creator-a', sk: 'META' });
  for (const params of scanCalls) {
    assert.equal(params.ConsistentRead, true);
    assert.equal(params.Select, 'SPECIFIC_ATTRIBUTES');
    const fields = Object.values(params.ExpressionAttributeNames ?? {});
    for (const field of ['schemaVersion', 'id', 'displayName', 'slug', 'published', 'hidden', 'placements', 'order', 'series']) {
      assert.ok(fields.includes(field), `scan includes ${field}`);
    }
    for (const field of ['version', 'profileId', 'resourceId', 'selectedForDirectory', 'name', 'accountId', 'email', 'csrfToken', 'report', 'identity', 'session', 'aliasPrivateSentinel']) {
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
  const profiles = [
    profile('creator-a', { slug: 'ana-aws' }),
    profile('creator-b', { displayName: 'Beto AWS', slug: 'beto-aws' }),
    profile('creator-c', { displayName: 'Carla AWS', slug: 'carla-aws' }),
  ];
  const placements = [
    placement('creator-c', 'event-a'),
    placement('creator-a', 'event-b'),
    placement('creator-b', 'event-c'),
  ];
  const seriesRows = [
    series('series-a', 'creator-a', { name: 'Lambda eventos vigentes', slug: 'lambda-vigente', chapters: [placements[1].id] }),
    series('series-b', 'creator-b', { name: 'Comunidad serverless', slug: 'comunidad-serverless', chapters: [placements[2].id] }),
    series('series-ended', 'creator-c', { name: 'Serie de evento terminado', slug: 'evento-terminado', chapters: [placements[0].id] }),
  ];
  const state = creatorAggregates(profiles, placements, seriesRows);
  const eventRows = [
    event('event-a', { endsAt: '2020-01-01T11:00:00Z' }),
    event('event-b'),
    event('event-c'),
  ];
  const catalog = projectPublishedCatalog(eventRows, state);
  const index = buildSearchIndex([], catalog);
  const result = searchIndex(index, 'Lambda eventos vigentes comunidad serverless', 'event');

  assert.equal(result.length, 1);
  assert.equal(result[0].url, '/eventos/#event-event-b');
  assert.deepEqual(result[0].series.map(({ seriesId }) => seriesId), ['series-a', 'series-b']);
  assert.deepEqual(searchIndex(index, 'Serie de evento terminado', 'event'), []);
});

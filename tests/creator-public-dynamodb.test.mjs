import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCreatorPagesService } from '../src/lib/creator-pages.mjs';
import { createCreatorStore } from '../src/lib/creator-store.mjs';

const TABLES = {
  accountsTableName: 'accounts-test',
  profilesTableName: 'profiles-test',
  catalogTableName: 'catalog-test',
};

function itemKey(table, key) {
  return `${table}:${key.pk}:${key.sk}`;
}

function publicReadFixture(corruptSequence) {
  const profileId = 'creator-public-test';
  const profileSlug = 'public-creator';
  const seriesId = 'series-public-test';
  const seriesSlug = 'public-series';
  const placementId = 'damaged-placement';
  const resourceId = 'resource-public-test';
  const creatorState = {
    pk: `PROFILE#${profileId}`,
    sk: 'META',
    recordType: 'creatorState',
    schemaVersion: 2,
    id: profileId,
    version: 2,
    displayName: 'Creador de prueba',
    slug: profileSlug,
    programs: [],
    socials: {},
    published: true,
    hidden: false,
    createdAt: 0,
    updatedAt: 0,
    placements: {
      [placementId]: { resourceId, selectedForDirectory: true },
    },
    order: { featured: [], ordinary: [placementId] },
    series: {
      [seriesId]: {
        name: 'Serie de prueba',
        slug: seriesSlug,
        chapters: [placementId],
      },
    },
  };
  if (corruptSequence === 'order') creatorState.order.ordinary = ['missing-placement'];
  if (corruptSequence === 'chapters') creatorState.series[seriesId].chapters = ['missing-placement'];

  const records = new Map([
    [itemKey(TABLES.profilesTableName, { pk: `SLUG#${profileSlug}`, sk: 'META' }), {
      pk: `SLUG#${profileSlug}`,
      sk: 'META',
      recordType: 'profileAlias',
      slug: profileSlug,
      profileId,
      version: 1,
    }],
    [itemKey(TABLES.profilesTableName, { pk: `PROFILE#${profileId}`, sk: 'META' }), creatorState],
    [itemKey(TABLES.profilesTableName, { pk: `PROFILE#${profileId}`, sk: `SERIES_SLUG#${seriesSlug}` }), {
      pk: `PROFILE#${profileId}`,
      sk: `SERIES_SLUG#${seriesSlug}`,
      recordType: 'seriesAlias',
      profileId,
      seriesId,
      slug: seriesSlug,
      version: 1,
    }],
  ]);
  const resource = {
    id: resourceId,
    title: 'Capítulo visible',
    url: 'https://example.com/chapter',
    published: true,
    hidden: false,
    version: 3,
  };

  const client = {
    async send(command) {
      const { input } = command;
      if (command.constructor.name === 'GetCommand') {
        return { Item: records.get(itemKey(input.TableName, input.Key)) };
      }
      if (command.constructor.name === 'BatchGetCommand') {
        const requestedIds = input.RequestItems[TABLES.catalogTableName].Keys.map(({ id }) => id);
        return {
          Responses: {
            [TABLES.catalogTableName]: requestedIds.includes(resource.id) ? [resource] : [],
          },
        };
      }
      throw new Error(`unexpected DynamoDB command ${command.constructor.name}`);
    },
  };
  const store = createCreatorStore({ ...TABLES, client });
  const service = createCreatorPagesService({
    store,
    authenticate: async () => ({ session: { state: 'anonymous' }, principal: { state: 'anonymous' } }),
    origin: 'https://dondeaprendoaws.com',
    createId: () => 'test-id',
  });

  return { service, profileSlug, seriesSlug, placementId, resourceId, seriesId };
}

test('DynamoDB public profile and series include the valid visible chapter', async () => {
  const { service, profileSlug, seriesSlug, placementId, resourceId, seriesId } = publicReadFixture();
  const profile = await service.readPublicProfile(profileSlug);
  assert.equal(profile.status, 200);
  assert.equal(profile.links.length, 1);
  assert.equal(profile.links[0].placementId, placementId);
  assert.equal(profile.links[0].resourceId, resourceId);
  assert.deepEqual(profile.links[0].series, [{
    seriesId,
    position: 1,
    name: 'Serie de prueba',
    href: `/c/${profileSlug}/series/${seriesSlug}/`,
  }]);
  assert.equal(profile.series[0].chapterCount, 1);

  const series = await service.readPublicSeries(profileSlug, seriesSlug);
  assert.equal(series.status, 200);
  assert.equal(series.series.id, seriesId);
  assert.equal(series.links.length, 1);
  assert.equal(series.links[0].placementId, placementId);
  assert.equal(series.links[0].resourceId, resourceId);
});

for (const corruptSequence of ['order', 'chapters']) {
  const label = corruptSequence === 'order' ? 'general order' : 'chapter order';

  test(`DynamoDB public profile fails closed for a malformed aggregate ${label}`, async () => {
    const { service, profileSlug } = publicReadFixture(corruptSequence);
    const result = await service.readPublicProfile(profileSlug);

    assert.equal(result.status, 503);
    assert.equal(Object.hasOwn(result, 'profile'), false);
    assert.equal(Object.hasOwn(result, 'series'), false);
    assert.equal(Object.hasOwn(result, 'links'), false);
  });

  test(`DynamoDB public series fails closed for a malformed aggregate ${label}`, async () => {
    const { service, profileSlug, seriesSlug } = publicReadFixture(corruptSequence);
    const result = await service.readPublicSeries(profileSlug, seriesSlug);

    assert.equal(result.status, 503);
    assert.equal(Object.hasOwn(result, 'profile'), false);
    assert.equal(Object.hasOwn(result, 'series'), false);
    assert.equal(Object.hasOwn(result, 'links'), false);
  });
}

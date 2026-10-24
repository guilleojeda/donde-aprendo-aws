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

function publicReadFixture(placementRecordType) {
  const profileId = 'creator-public-test';
  const profileSlug = 'public-creator';
  const seriesId = 'series-public-test';
  const seriesSlug = 'public-series';
  const placementId = 'damaged-placement';
  const resourceId = 'resource-public-test';
  const records = new Map([
    [itemKey(TABLES.profilesTableName, { pk: `SLUG#${profileSlug}`, sk: 'META' }), {
      pk: `SLUG#${profileSlug}`,
      sk: 'META',
      recordType: 'profileAlias',
      slug: profileSlug,
      profileId,
      version: 1,
    }],
    [itemKey(TABLES.profilesTableName, { pk: `PROFILE#${profileId}`, sk: 'META' }), {
      pk: `PROFILE#${profileId}`,
      sk: 'META',
      recordType: 'profile',
      id: profileId,
      slug: profileSlug,
      displayName: 'Creador de prueba',
      programs: [],
      socials: {},
      published: true,
      hidden: false,
      version: 2,
    }],
    [itemKey(TABLES.profilesTableName, { pk: `PROFILE#${profileId}`, sk: `SERIES#${seriesId}` }), {
      pk: `PROFILE#${profileId}`,
      sk: `SERIES#${seriesId}`,
      recordType: 'series',
      id: seriesId,
      profileId,
      name: 'Serie de prueba',
      slug: seriesSlug,
      version: 1,
    }],
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
  const placement = {
    pk: `PROFILE#${profileId}`,
    sk: `PLACEMENT#${placementId}`,
    id: placementId,
    profileId,
    resourceId,
    position: 0,
    featured: false,
    selectedForDirectory: true,
    series: { [seriesId]: { position: 0 } },
    version: 1,
    ...(placementRecordType === undefined ? {} : { recordType: placementRecordType }),
  };
  const resource = {
    id: resourceId,
    recordType: 'resource',
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
      if (command.constructor.name === 'QueryCommand') {
        const { ':pk': pk, ':sk': prefix } = input.ExpressionAttributeValues;
        if (pk !== `PROFILE#${profileId}`) throw new Error(`unexpected partition key ${pk}`);
        if (prefix === 'PLACEMENT#') return { Items: [placement] };
        if (prefix === 'SERIES#') {
          return {
            Items: [...records.values()].filter((item) => item.pk === pk && item.sk.startsWith(prefix)),
          };
        }
        throw new Error(`unexpected query prefix ${prefix}`);
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
    authenticate: async () => null,
    origin: 'https://dondeaprendoaws.com',
    createId: () => 'test-id',
  });

  return { service, profileSlug, seriesSlug, placementId, resourceId, seriesId };
}

test('DynamoDB public profile and series include the valid visible chapter', async () => {
  const { service, profileSlug, seriesSlug, placementId, resourceId, seriesId } = publicReadFixture('placement');
  const profile = await service.readPublicProfile(profileSlug);
  assert.equal(profile.status, 200);
  assert.equal(profile.links.length, 1);
  assert.equal(profile.links[0].placementId, placementId);
  assert.equal(profile.links[0].resourceId, resourceId);
  assert.deepEqual(profile.links[0].series, [{
    seriesId,
    position: 0,
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

for (const recordType of [undefined, 'placment']) {
  const description = recordType === undefined ? 'missing placement recordType' : 'misspelled placement recordType';

  test(`DynamoDB public profile fails closed for a ${description}`, async () => {
    const { service, profileSlug } = publicReadFixture(recordType);
    const result = await service.readPublicProfile(profileSlug);

    assert.equal(result.status, 503);
    assert.equal(Object.hasOwn(result, 'profile'), false);
    assert.equal(Object.hasOwn(result, 'series'), false);
    assert.equal(Object.hasOwn(result, 'links'), false);
  });

  test(`DynamoDB public series fails closed for a ${description}`, async () => {
    const { service, profileSlug, seriesSlug } = publicReadFixture(recordType);
    const result = await service.readPublicSeries(profileSlug, seriesSlug);

    assert.equal(result.status, 503);
    assert.equal(Object.hasOwn(result, 'profile'), false);
    assert.equal(Object.hasOwn(result, 'series'), false);
    assert.equal(Object.hasOwn(result, 'links'), false);
  });
}

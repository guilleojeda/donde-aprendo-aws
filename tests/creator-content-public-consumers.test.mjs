import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCatalog } from '../src/lib/catalog.mjs';
import { createCreatorPagesService } from '../src/lib/creator-pages.mjs';
import { createCreatorStore } from '../src/lib/creator-store.mjs';
import { CREATOR_PROFILE_ID, createCreatorContentHarness, creatorRequest, defaultState } from './fixtures/creator-content.mjs';

const TABLES = {
  accounts: 'accounts-test',
  profiles: 'profiles-test',
  catalog: 'catalog-test',
};

const SERIES_ID = 'series-stable-id';
const PROFILE_SLUG = 'ana-lambda';
const PROFILE_ALIAS = 'ana-antigua';
const SERIES_SLUG = 'lambda-actual';
const SERIES_ALIAS = 'lambda-anterior';
const RESOURCE_SHARED = 'resource:shared/東京';

function contentResource(id, overrides = {}) {
  return {
    id,
    title: `Título de ${id}`,
    url: `https://catalog.example/${encodeURIComponent(id)}`,
    description: 'Descripción pública',
    category: 'Serverless',
    order: 1,
    featured: false,
    kind: 'content',
    format: 'Artículo',
    topics: ['Cómputo'],
    published: true,
    hidden: false,
    directoryControl: 'creator',
    version: 4,
    ...overrides,
  };
}

function creatorState(overrides = {}) {
  return {
    pk: `PROFILE#${CREATOR_PROFILE_ID}`,
    sk: 'META',
    recordType: 'creatorState',
    schemaVersion: 2,
    id: CREATOR_PROFILE_ID,
    version: 19,
    displayName: 'Ana Lambda',
    slug: PROFILE_SLUG,
    city: 'Córdoba',
    country: 'Argentina',
    bio: 'Aprende Lambda con ejemplos.',
    programs: ['Community Builders'],
    socials: { website: 'https://ana.example/profile' },
    photo: {
      version: 'immutable-photo-v7',
      url: `/media/fotos/${CREATOR_PROFILE_ID}/immutable-photo-v7.webp`,
    },
    published: true,
    hidden: false,
    createdAt: 1_794_000_000_000,
    updatedAt: 1_794_000_001_000,
    placements: {
      'placement-z': { resourceId: RESOURCE_SHARED, selectedForDirectory: true },
      'placement-b': { resourceId: 'resource-b', selectedForDirectory: true },
      'placement-a': { resourceId: 'resource-a', selectedForDirectory: true },
      'placement-hidden': { resourceId: 'resource-hidden', selectedForDirectory: true },
      'placement-unselected': { resourceId: 'resource-unselected', selectedForDirectory: false },
    },
    order: {
      featured: ['placement-z'],
      ordinary: ['placement-b', 'placement-a', 'placement-hidden', 'placement-unselected'],
    },
    series: {
      [SERIES_ID]: {
        name: 'Lambda desde cero',
        slug: SERIES_SLUG,
        description: 'Serie pública',
        createdAt: 1_794_000_000_000,
        updatedAt: 1_794_000_001_000,
        chapters: ['placement-a', 'placement-hidden', 'placement-z'],
      },
    },
    ...structuredClone(overrides),
  };
}

function putItem(rows, table, item) {
  const key = item.id !== undefined && item.pk === undefined
    ? `id:${item.id}`
    : `${item.pk}:${item.sk ?? ''}`;
  rows.set(`${table}:${key}`, structuredClone(item));
}

function getItem(rows, table, key) {
  const suffix = Object.hasOwn(key, 'id') ? `id:${key.id}` : `${key.pk}:${key.sk ?? ''}`;
  return rows.get(`${table}:${suffix}`);
}

// Emulate only DynamoDB's requested top-level projection; the application still
// performs the public profile, Series, catalog and directory decisions.
function projectedItem(item, input) {
  if (!item || !input.ProjectionExpression) return structuredClone(item);
  const names = input.ExpressionAttributeNames ?? {};
  const fields = input.ProjectionExpression.split(',').map((part) => {
    const field = part.trim();
    return names[field] ?? field;
  });
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(item, field))
    .map((field) => [field, structuredClone(item[field])]));
}

function createPublicReaderHarness({ state = creatorState() } = {}) {
  const rows = new Map();
  const calls = [];
  putItem(rows, TABLES.profiles, state);
  for (const [slug, id] of [
    [PROFILE_SLUG, CREATOR_PROFILE_ID],
    [PROFILE_ALIAS, CREATOR_PROFILE_ID],
    ['beto-aws', 'creator-shared-b'],
  ]) {
    putItem(rows, TABLES.profiles, {
      pk: `SLUG#${slug}`, sk: 'META', recordType: 'profileAlias', slug, profileId: id, version: 1,
    });
  }
  for (const slug of [SERIES_SLUG, SERIES_ALIAS]) {
    putItem(rows, TABLES.profiles, {
      pk: `PROFILE#${CREATOR_PROFILE_ID}`, sk: `SERIES_SLUG#${slug}`,
      recordType: 'seriesAlias', profileId: CREATOR_PROFILE_ID, seriesId: SERIES_ID, slug, version: 1,
    });
  }

  const resources = [
    contentResource(RESOURCE_SHARED, { order: 1, title: 'Título compartido v1', editorProfileId: CREATOR_PROFILE_ID, autoSync: false }),
    contentResource('resource-b', { order: 2, editorProfileId: CREATOR_PROFILE_ID }),
    contentResource('resource-a', { order: 3, editorProfileId: CREATOR_PROFILE_ID }),
    contentResource('resource-hidden', { order: 4, hidden: true, editorProfileId: CREATOR_PROFILE_ID }),
    contentResource('resource-unselected', { order: 5, editorProfileId: CREATOR_PROFILE_ID }),
    contentResource('resource-hidden-profile', { order: 6, editorProfileId: 'creator-hidden' }),
    contentResource('resource-draft-profile', { order: 7, editorProfileId: 'creator-draft' }),
    contentResource('resource-pending', { order: 8, published: false, editorProfileId: 'creator-directory-gates' }),
    contentResource('resource-revoked', { order: 9, approvalRevoked: true, editorProfileId: 'creator-directory-gates' }),
  ];
  for (const resource of resources) putItem(rows, TABLES.catalog, resource);

  const additionalCreatorStates = [
    creatorState({
      id: 'creator-shared-b', pk: 'PROFILE#creator-shared-b', displayName: 'Beto AWS', slug: 'beto-aws',
      photo: { version: 'shared-b-v1', url: '/media/fotos/creator-shared-b/shared-b-v1.webp' },
      placements: { 'placement-shared-b': { resourceId: RESOURCE_SHARED, selectedForDirectory: true } },
      order: { featured: [], ordinary: ['placement-shared-b'] }, series: {},
    }),
    creatorState({
      id: 'creator-hidden', pk: 'PROFILE#creator-hidden', displayName: 'Creador oculto', slug: 'creador-oculto',
      hidden: true, placements: { 'placement-hidden-profile': { resourceId: 'resource-hidden-profile', selectedForDirectory: true } },
      order: { featured: [], ordinary: ['placement-hidden-profile'] }, series: {},
    }),
    creatorState({
      id: 'creator-draft', pk: 'PROFILE#creator-draft', displayName: 'Creador borrador', slug: 'creador-borrador',
      published: false, placements: { 'placement-draft-profile': { resourceId: 'resource-draft-profile', selectedForDirectory: true } },
      order: { featured: [], ordinary: ['placement-draft-profile'] }, series: {},
    }),
    creatorState({
      id: 'creator-directory-gates', pk: 'PROFILE#creator-directory-gates', displayName: 'Creadora de control', slug: 'creadora-control',
      placements: {
        'placement-pending': { resourceId: 'resource-pending', selectedForDirectory: true },
        'placement-revoked': { resourceId: 'resource-revoked', selectedForDirectory: true },
      },
      order: { featured: [], ordinary: ['placement-pending', 'placement-revoked'] }, series: {},
    }),
  ];
  for (const additionalState of additionalCreatorStates) putItem(rows, TABLES.profiles, additionalState);

  // These retained rows are present in the shared table, but public readers do
  // not need to query them to render profile, Series or directory data.
  putItem(rows, TABLES.profiles, {
    pk: `PROFILE#${CREATOR_PROFILE_ID}`, sk: 'EDITOR#resource-private',
    recordType: 'editorReference', profileId: CREATOR_PROFILE_ID, resourceId: 'resource-private',
  });
  putItem(rows, TABLES.profiles, {
    pk: `PROFILE#${CREATOR_PROFILE_ID}`, sk: 'CLAIM#claim-private',
    id: 'claim-private', version: 1,
  });
  putItem(rows, TABLES.profiles, {
    pk: 'ADMIN#CLAIMS', sk: 'CLAIM#claim-private', recordType: 'claim', id: 'claim-private',
    accountId: 'private-account', resourceIds: ['resource-private'], status: 'pending', version: 1,
    evidence: 'claim-private-sentinel',
  });
  putItem(rows, TABLES.profiles, {
    pk: `ANALYTICS#${CREATOR_PROFILE_ID}`, sk: 'GA4#1', recordType: 'analyticsCache',
    profileId: CREATOR_PROFILE_ID, propertyId: 'test-property', period: 7, page: 1,
    schemaVersion: 1, report: { privateNote: 'analytics-private-sentinel' },
    updatedAt: 1_794_000_001_000, expiresAt: 1_794_003_601_000, retainUntil: 1_794_604_801_000, ttl: 1_794_604_801,
  });
  putItem(rows, TABLES.accounts, {
    pk: 'ACCOUNT#private-account', sk: 'SESSION#private-session', recordType: 'session',
    email: 'private@example.invalid', csrfToken: 'session-private-sentinel',
  });

  const client = {
    async send(command) {
      const { input } = command;
      calls.push({ name: command.constructor.name, input: structuredClone(input) });
      if (command.constructor.name === 'GetCommand') {
        return { Item: projectedItem(getItem(rows, input.TableName, input.Key), input) };
      }
      if (command.constructor.name === 'QueryCommand') {
        const values = input.ExpressionAttributeValues ?? {};
        const pk = values[':pk'];
        const prefix = values[':sk'];
        const Items = [...rows.entries()]
          .filter(([key, item]) => key.startsWith(`${input.TableName}:`) && item.pk === pk && item.sk?.startsWith(prefix))
          .map(([, item]) => projectedItem(item, input));
        return { Items };
      }
      if (command.constructor.name === 'BatchGetCommand') {
        const [table, request] = Object.entries(input.RequestItems)[0];
        const Items = request.Keys.map((key) => getItem(rows, table, key))
          .filter(Boolean)
          .map((item) => projectedItem(item, request));
        return { Responses: { [table]: Items } };
      }
      if (command.constructor.name === 'ScanCommand') {
        const Items = [...rows.entries()]
          .filter(([key]) => key.startsWith(`${input.TableName}:`))
          .map(([, item]) => projectedItem(item, input));
        return { Items };
      }
      throw new Error(`unexpected DynamoDB command ${command.constructor.name}`);
    },
  };
  const store = createCreatorStore({
    accountsTableName: TABLES.accounts,
    profilesTableName: TABLES.profiles,
    catalogTableName: TABLES.catalog,
    client,
  });
  const service = createCreatorPagesService({
    store,
    authenticate: async () => ({ session: { state: 'anonymous' }, principal: { state: 'anonymous' } }),
    origin: 'https://dondeaprendoaws.com',
    createId: () => 'unused-public-read-test-id',
  });

  async function readCatalog() {
    return loadCatalog({
      tableName: TABLES.catalog,
      creatorTableName: TABLES.profiles,
      scanPage: async (input) => {
        calls.push({ name: 'catalogScan', input: structuredClone(input) });
        return client.send({ constructor: { name: 'ScanCommand' }, input });
      },
      scanCreatorPage: async (input) => {
        calls.push({ name: 'creatorScan', input: structuredClone(input) });
        return client.send({ constructor: { name: 'ScanCommand' }, input });
      },
    });
  }

  return { calls, rows, service, state, readCatalog };
}

function projectionFields(input) {
  if (!input.ProjectionExpression) return new Set();
  const names = input.ExpressionAttributeNames ?? {};
  return new Set(input.ProjectionExpression.split(',').map((part) => {
    const field = part.trim();
    return names[field] ?? field;
  }));
}

test('public profile reads preserve exact profile and photo identity with aggregate general order', async () => {
  const harness = createPublicReaderHarness();
  const profile = await harness.service.readPublicProfile(PROFILE_SLUG);

  assert.equal(profile.status, 200);
  assert.equal(profile.profile.id, CREATOR_PROFILE_ID);
  assert.equal(profile.profile.slug, PROFILE_SLUG);
  assert.deepEqual(profile.profile.photo, {
    version: 'immutable-photo-v7',
    url: `/media/fotos/${CREATOR_PROFILE_ID}/immutable-photo-v7.webp`,
  });
  assert.deepEqual(Object.keys(profile.profile).sort(), [
    'bio', 'city', 'country', 'displayName', 'hidden', 'id', 'photo', 'programs', 'published', 'slug', 'socials', 'version',
  ]);
  assert.deepEqual(profile.links.map(({ placementId }) => placementId), [
    'placement-z', 'placement-b', 'placement-a', 'placement-unselected',
  ], 'featured and ordinary sequences preserve the surviving links’ stored relative order');
  assert.deepEqual(profile.links.map(({ placementId, featured }) => [placementId, featured]), [
    ['placement-z', true],
    ['placement-b', false],
    ['placement-a', false],
    ['placement-unselected', false],
  ]);
  assert.equal(profile.series[0].id, SERIES_ID);
  assert.equal(profile.series[0].href, `/c/${PROFILE_SLUG}/series/${SERIES_SLUG}/`);
  assert.doesNotMatch(JSON.stringify(profile), /resource-private|claim-private|analytics-private-sentinel|session-private-sentinel/u);
});

test('public Series read follows its independent chapter sequence and exact IDs', async () => {
  const harness = createPublicReaderHarness();
  const seriesPage = await harness.service.readPublicSeries(PROFILE_SLUG, SERIES_SLUG);

  assert.equal(seriesPage.status, 200);
  assert.equal(seriesPage.profile.id, CREATOR_PROFILE_ID);
  assert.equal(seriesPage.series.id, SERIES_ID);
  assert.deepEqual(seriesPage.links.map(({ placementId }) => placementId), ['placement-a', 'placement-z'],
    'the chapter array, not general order, orders the public Series');
  assert.ok(seriesPage.links.every((link) => link.series.some(({ seriesId }) => seriesId === SERIES_ID)),
    'visible chapters remain tagged with their exact Series identity');
  assert.doesNotMatch(JSON.stringify(seriesPage), /resource-private|claim-private|analytics-private-sentinel|session-private-sentinel/u);
});

test('retained profile and Series aliases preserve canonical redirects and query strings', async () => {
  const harness = createPublicReaderHarness();
  const oldProfile = await harness.service.readPublicProfile(PROFILE_ALIAS, { suffix: '/series/lambda-actual/', search: '?from=old' });
  assert.deepEqual(oldProfile, {
    status: 308,
    redirectTo: `/c/${PROFILE_SLUG}/series/lambda-actual/?from=old`,
  });
  const oldSeries = await harness.service.readPublicSeries(PROFILE_SLUG, SERIES_ALIAS, { search: '?from=old' });
  assert.deepEqual(oldSeries, {
    status: 308,
    redirectTo: `/c/${PROFILE_SLUG}/series/${SERIES_SLUG}/?from=old`,
  });
});

test('catalog loading applies directory and creator visibility gates and follows current shared metadata', async () => {
  const harness = createPublicReaderHarness();
  const catalogScan = async () => harness.readCatalog();

  const firstProfile = await harness.service.readPublicProfile(PROFILE_SLUG);
  const firstSharedProfile = await harness.service.readPublicProfile('beto-aws');
  const firstCatalog = await catalogScan();
  assert.equal(firstSharedProfile.status, 200, JSON.stringify(firstSharedProfile));
  assert.deepEqual(firstCatalog.map(({ id }) => id).sort(), [RESOURCE_SHARED, 'resource-a', 'resource-b'].sort());
  assert.deepEqual(firstCatalog.find(({ id }) => id === RESOURCE_SHARED).series, [{
    seriesId: SERIES_ID,
    name: 'Lambda desde cero',
    creatorName: 'Ana Lambda',
    href: `/c/${PROFILE_SLUG}/series/${SERIES_SLUG}/`,
  }]);
  assert.equal(firstProfile.links.find(({ resourceId }) => resourceId === RESOURCE_SHARED).title, 'Título compartido v1');
  assert.equal(firstSharedProfile.links.find(({ resourceId }) => resourceId === RESOURCE_SHARED).title, 'Título compartido v1');

  const changedResource = contentResource(RESOURCE_SHARED, {
    order: 1, title: 'Título compartido actualizado', editorProfileId: CREATOR_PROFILE_ID, autoSync: false, version: 5,
  });
  putItem(harness.rows, TABLES.catalog, changedResource);

  const nextProfile = await harness.service.readPublicProfile(PROFILE_SLUG);
  const nextSharedProfile = await harness.service.readPublicProfile('beto-aws');
  const nextCatalog = await catalogScan();
  assert.equal(nextProfile.links.find(({ resourceId }) => resourceId === RESOURCE_SHARED).title, 'Título compartido actualizado');
  assert.equal(nextSharedProfile.links.find(({ resourceId }) => resourceId === RESOURCE_SHARED).title, 'Título compartido actualizado');
  assert.equal(nextCatalog.find(({ id }) => id === RESOURCE_SHARED).title, 'Título compartido actualizado');
  assert.deepEqual(nextCatalog.map(({ id }) => id).sort(), [RESOURCE_SHARED, 'resource-a', 'resource-b'].sort(),
    'unselected, hidden, unpublished, revoked and ineligible-profile resources stay out of the public directory');
  assert.doesNotMatch(JSON.stringify(nextCatalog), /editorProfileId|autoSync|privateSentinel|accountId|claim-private|analytics-private/u);

  const creatorScan = harness.calls.find(({ name }) => name === 'creatorScan');
  assert.ok(creatorScan?.input.ProjectionExpression);
  const scannedFields = projectionFields(creatorScan.input);
  for (const field of ['pk', 'sk', 'recordType', 'schemaVersion', 'id', 'displayName', 'slug', 'published', 'hidden', 'placements', 'order', 'series']) {
    assert.ok(scannedFields.has(field), `creator scan needs ${field} to validate/project aggregate eligibility`);
  }
  for (const field of ['accountId', 'ownerEmail', 'bio', 'socials', 'photo', 'claims', 'uploads', 'analyticsCache', 'editorProfileId']) {
    assert.equal(scannedFields.has(field), false, `creator directory scan must not request ${field}`);
  }
});

test('public profile fails closed when its aggregate sequence references a missing placement', async () => {
  const invalid = creatorState({ order: { featured: [], ordinary: ['placement-missing'] } });
  const harness = createPublicReaderHarness({ state: invalid });

  const profile = await harness.service.readPublicProfile(PROFILE_SLUG);
  assert.equal(profile.status, 503, 'a malformed public sequence must not render as an empty but healthy profile');
});

test('catalog loading rejects an aggregate whose sequence references a missing placement', async () => {
  const invalid = creatorState({ order: { featured: [], ordinary: ['placement-missing'] } });
  const harness = createPublicReaderHarness({ state: invalid });

  await assert.rejects(() => harness.readCatalog(), /creator|placement|sequence|order|profile/iu,
    'the build catalog loader must reject malformed aggregate data rather than silently omit creator content');
});

test('legacy creator IDs stay out of the directory after the other eligibility conditions are met', async () => {
  const pendingId = 'private\rresource';
  const hiddenId = 'private\0resource';
  const state = creatorState();
  state.placements['pending-private'] = { resourceId: pendingId, selectedForDirectory: true };
  state.placements['hidden-private'] = { resourceId: hiddenId, selectedForDirectory: false };
  state.order.ordinary.push('pending-private', 'hidden-private');
  state.series[SERIES_ID].chapters.splice(1, 0, 'pending-private');
  const harness = createPublicReaderHarness({ state });
  putItem(harness.rows, TABLES.catalog, contentResource(pendingId, { published: false }));
  putItem(harness.rows, TABLES.catalog, contentResource(hiddenId, { hidden: true }));

  const catalog = await harness.readCatalog();
  assert.deepEqual(catalog.map(({ id }) => id).sort(), [RESOURCE_SHARED, 'resource-a', 'resource-b'].sort());
  const publicProfile = await harness.service.readPublicProfile(PROFILE_SLUG);
  assert.equal(publicProfile.status, 200);
  assert.equal(publicProfile.links.find(({ placementId }) => placementId === 'pending-private').resourceId, pendingId,
    'public creator links keep exact legacy resource IDs independently of catalog admission');
  const publicSeries = await harness.service.readPublicSeries(PROFILE_SLUG, SERIES_SLUG);
  assert.deepEqual(publicSeries.links.map(({ placementId }) => placementId), [
    'placement-a', 'pending-private', 'placement-z',
  ], 'Series keeps its chapter order when a hidden chapter is omitted');

  putItem(harness.rows, TABLES.catalog, contentResource(pendingId));
  assert.deepEqual(await harness.readCatalog(), catalog,
    'the approved legacy ID remains absent without disturbing ordinary public catalog rows');
  const retainedPublicProfile = await harness.service.readPublicProfile(PROFILE_SLUG);
  assert.equal(retainedPublicProfile.links.find(({ placementId }) => placementId === 'pending-private').resourceId, pendingId,
    'catalog identity admission does not hide an existing creator-page link');
  const retainedPublicSeries = await harness.service.readPublicSeries(PROFILE_SLUG, SERIES_SLUG);
  assert.equal(retainedPublicSeries.links.find(({ placementId }) => placementId === 'pending-private').resourceId, pendingId);
});

test('hidden published profiles stay private publicly while their owner statistics remain ID-scoped', async () => {
  const reads = [];
  const state = defaultState({
    profileId: CREATOR_PROFILE_ID,
    profile: { slug: PROFILE_SLUG, published: true, hidden: true },
  });
  const harness = await createCreatorContentHarness({
    state,
    serviceOptions: {
      statistics: {
        async read(input) {
          reads.push(structuredClone(input));
          return { state: 'ready', creatorId: input.profileId, period: input.period, page: input.page };
        },
      },
    },
  });

  assert.equal((await harness.service.readPublicProfile(PROFILE_SLUG)).status, 404);
  const owner = await creatorRequest(harness, '/api/creador/estadisticas/', { session: 'creator-a' });
  assert.equal(owner.status, 200);
  assert.equal(owner.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await owner.json(), {
    state: 'ready', creatorId: CREATOR_PROFILE_ID, period: 7, page: 1,
  });
  const unrelatedOwner = await creatorRequest(harness, '/api/creador/estadisticas/', { session: 'creator-b' });
  assert.equal(unrelatedOwner.status, 200);
  assert.deepEqual(await unrelatedOwner.json(), { state: 'no-profile', period: 7, page: 1 });
  assert.deepEqual(reads, [{ profileId: CREATOR_PROFILE_ID, period: 7, page: 1 }]);
});

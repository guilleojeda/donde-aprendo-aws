import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { loadCatalog } from '../src/lib/catalog.mjs';
import { currentUrlReservation, currentUrlReservationId } from '../src/lib/catalog-url.mjs';
import { importMeetupCommunities } from '../scripts/import-meetup-communities.mjs';
import { mapMeetupCommunities } from '../src/lib/meetup-communities.mjs';
import { callApi, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import { createDynamoMoveHarness, dynamoConditionMatches } from './fixtures/creator-link-move.mjs';

const CATALOG = 'catalog-test';
const PROFILES = 'profiles-test';
const GROUP_ID = 'meetup-36431225';
const SIBLING_ID = 'meetup-38266376';
const GROUP_URL = 'https://www.meetup.com/aws-girls-argentina/';
const SIBLING_URL = 'https://www.meetup.com/aws-sbg-at-metropolitan-technological-univ-macul-campus/';
const DISPLAY_URL = 'https://community.example.org/aws-girls/';
const PROTECTED_EVENT_ID = 'meetup-event-316882965';
const PROTECTED_EVENT_URL = `${GROUP_URL}events/316882965/`;
const TARGET_NEW_EVENT_URL = `${GROUP_URL}events/316882966/`;
const PROFILE_SLUG = 'aws-girls-owner';
const PYTHON_PROVIDER = fileURLToPath(new URL('./fixtures/meetup-source-enrollment-provider.py', import.meta.url));

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function observeLocator(failures, row, label) {
  if (row?.meetupSourceUrl !== GROUP_URL) {
    failures.push(`${label}: expected meetupSourceUrl=${GROUP_URL}, got ${JSON.stringify(row?.meetupSourceUrl)}`);
  }
}

function projected(item, input) {
  if (!item) return undefined;
  const fields = projectionFields(input);
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(item, field))
    .map((field) => [field, clone(item[field])]));
}

function projectionFields(input) {
  const names = input.ExpressionAttributeNames ?? {};
  return input.ProjectionExpression.split(',').map((field) => {
    const token = field.trim();
    return names[token] ?? token;
  });
}

// This is an SDK boundary mock: the production importer and catalog reader
// issue their normal AWS SDK commands, while the mock only stores rows.
class CatalogDocumentClientMock {
  constructor() {
    this.tables = new Map();
    this.calls = [];
  }

  table(name) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name);
  }

  seed(tableName, item) {
    this.table(tableName).set(item.id ?? item.pk, clone(item));
  }

  remove(tableName, id) {
    this.table(tableName).delete(id);
  }

  read(tableName, id) {
    return clone(this.table(tableName).get(id));
  }

  async send(command) {
    const { input } = command;
    const name = command.constructor.name;
    this.calls.push({ name, input: clone(input) });
    if (name === 'GetCommand') {
      const item = this.table(input.TableName).get(input.Key.id);
      return item ? { Item: projected(item, input) } : {};
    }
    if (name === 'TransactWriteCommand') {
      for (const action of input.TransactItems) {
        const put = action.Put;
        assert.ok(put, 'the Meetup import uses conditional puts for item and URL reservation');
        if (this.table(put.TableName).has(put.Item.id)) {
          const error = new Error('conditional transaction conflict');
          error.name = 'TransactionCanceledException';
          error.CancellationReasons = [{ Code: 'ConditionalCheckFailed' }];
          throw error;
        }
      }
      for (const { Put } of input.TransactItems) this.seed(Put.TableName, Put.Item);
      return {};
    }
    if (name === 'ScanCommand') {
      return { Items: [...this.table(input.TableName).values()].map((item) => projected(item, input)) };
    }
    assert.fail(`unexpected AWS SDK command: ${name}`);
  }
}

async function api(harness, path, body, { method = 'POST', session = 'creator-a' } = {}) {
  const response = await callApi(harness, path, {
    method, session, csrf: sessionCsrf[session], creatorContract: '2',
    ...(body === undefined ? {} : { body }),
  });
  return { status: response.status, body: response.status === 204 ? null : await responseJson(response) };
}

function accepted(result, status, label) {
  assert.equal(result.status, status, `${label}: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function owner(harness) {
  const result = accepted(await api(harness, '/api/creador/perfil', undefined, { method: 'GET' }), 200, 'owner read');
  assert.equal(result.schemaVersion, 2);
  return result;
}

function ownerResource(snapshot, id) {
  const result = snapshot.resources.find((item) => item.id === id);
  assert.ok(result, `the actual owner API returns ${id}`);
  return result;
}

function ownerPlacement(snapshot, id) {
  const found = Object.entries(snapshot.placements).find(([, placement]) => placement.resourceId === id);
  assert.ok(found, `the actual owner API retains a placement for ${id}`);
  return found[0];
}

function physical(harness, id) {
  return harness.mock.read(CATALOG, { id });
}

async function createAndPublishProfile(harness) {
  const before = await owner(harness);
  accepted(await api(harness, '/api/creador/perfil', {
    creatorVersion: before.profile ? before.creatorVersion : null,
    displayName: 'AWS Girls Argentina', slug: PROFILE_SLUG, socials: {},
  }, { method: 'PUT' }), 200, 'save creator profile');
  const saved = await owner(harness);
  accepted(await api(harness, '/api/creador/perfil/publicar', {
    creatorVersion: saved.creatorVersion,
  }), 200, 'publish creator profile');
}

async function claimAndGrant(harness, resourceId, url) {
  accepted(await api(harness, '/api/creador/reclamaciones', {
    resources: [{ resourceId, url }], evidence: 'Soy responsable de este recurso de comunidad.',
  }), 202, `claim ${resourceId}`);
  accepted(await api(harness, '/api/admin/reclamaciones/vincular', {
    accountId: 'private-account-a', resourceIds: [resourceId],
  }, { session: 'admin' }), 200, `grant ${resourceId}`);
}

function communityEvent() {
  return {
    id: PROTECTED_EVENT_ID,
    recordType: 'event',
    title: 'Título protegido por el creador',
    description: 'El grant protege los detalles editados por el creador.',
    startsAt: '2099-01-01T19:00:00-03:00',
    endsAt: '2099-01-01T21:00:00-03:00',
    timeZone: 'America/Argentina/Cordoba',
    organizer: 'AWS Girls Argentina',
    mode: 'online',
    registrationUrl: PROTECTED_EVENT_URL,
    communityId: GROUP_ID,
    sourceGroupId: GROUP_ID,
    sourceModifiedAt: '20990101T000000Z',
    published: true,
    hidden: false,
    approvalRevoked: false,
    directoryControl: 'editorial',
    autoSync: true,
    version: 1,
  };
}

function rawRows(harness, ids) {
  return ids.map((id) => {
    const row = physical(harness, id);
    assert.ok(row, `the physical DynamoDB mock contains ${id}`);
    return row;
  });
}

async function publicCatalog(client, harness, profileId) {
  for (const id of [GROUP_ID, SIBLING_ID, PROTECTED_EVENT_ID]) {
    client.seed(CATALOG, physical(harness, id));
  }
  const profile = harness.mock.read(PROFILES, { pk: `PROFILE#${profileId}`, sk: 'META' });
  assert.ok(profile, 'the public catalog scan sees the actual creator aggregate row');
  client.seed(PROFILES, profile);
  return loadCatalog({ tableName: CATALOG, creatorTableName: PROFILES, docClient: client });
}

class HarnessBackfillDocumentClient {
  constructor(harness, ids) {
    this.harness = harness;
    this.ids = ids;
    this.updates = [];
  }

  async send(command) {
    const { input } = command;
    assert.equal(input.TableName, CATALOG);
    if (command.constructor.name === 'ScanCommand') {
      assert.equal(input.ConsistentRead, true);
      return { Items: this.ids.map((id) => physical(this.harness, id)).filter(Boolean).map((item) => projected(item, input)) };
    }
    if (command.constructor.name === 'GetCommand') {
      assert.equal(input.ConsistentRead, true);
      const item = physical(this.harness, input.Key.id);
      return item ? { Item: projected(item, input) } : {};
    }
    if (command.constructor.name === 'UpdateCommand') {
      this.updates.push(clone(input));
      const current = physical(this.harness, input.Key.id);
      if (!current || !dynamoConditionMatches(input, current)) {
        const error = new Error('Conditional locator backfill update did not match current item');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }
      const names = input.ExpressionAttributeNames ?? {};
      const values = input.ExpressionAttributeValues ?? {};
      const assignmentText = input.UpdateExpression.replace(/^SET\s+/u, '');
      const assignments = Object.fromEntries(assignmentText.split(',').map((assignment) => {
        const match = /^\s*(#[A-Za-z0-9_]+|[A-Za-z][A-Za-z0-9_]*)\s*=\s*(:[A-Za-z0-9_]+)\s*$/u.exec(assignment);
        assert.ok(match, `unsupported locator backfill assignment: ${assignment}`);
        return [names[match[1]] ?? match[1], values[match[2]]];
      }));
      assert.deepEqual(Object.keys(assignments).sort(), ['meetupSourceUrl', 'version']);
      const next = { ...current, ...assignments };
      this.harness.mock.seed(CATALOG, next);
      return { Attributes: clone(next) };
    }
    assert.fail(`unexpected backfill SDK command: ${command.constructor.name}`);
  }
}

test('reviewed Meetup enrollment survives grants, URL moves, moderation, and Python source sync', async () => {
  const locatorFailures = [];
  const runtimeFailures = [];
  const directory = JSON.parse(await readFile(new URL('../data/meetup-communities.json', import.meta.url), 'utf8'));
  const reviewedById = new Map(directory.groups.map((group) => [group.id, group]));
  const reviewedGroups = [reviewedById.get('36431225'), reviewedById.get('38266376')];
  assert.deepEqual(reviewedGroups.map(({ id, name, url, country, type }) => ({ id, name, url, country, type })), [
    {
      id: '36431225', name: 'AWS Girls Argentina', url: GROUP_URL, country: 'AR', type: 'User Group',
    },
    {
      id: '38266376',
      name: 'AWS SBG at Metropolitan Technological Univ.  - Macul Campus',
      url: SIBLING_URL, country: 'CL', type: 'Student Builder Group',
    },
  ], 'the independent expected identities come from the reviewed source file');

  const records = mapMeetupCommunities({ groups: reviewedGroups });
  assert.equal(records[0].id, GROUP_ID);
  observeLocator(locatorFailures, records[0], 'reviewed group map');
  assert.equal(records[0].url, GROUP_URL, 'the initial public URL and source locator agree');
  assert.equal(records[1].id, SIBLING_ID);
  if (records[1].meetupSourceUrl !== SIBLING_URL) {
    locatorFailures.push(`sibling group map: expected meetupSourceUrl=${SIBLING_URL}, got ${JSON.stringify(records[1].meetupSourceUrl)}`);
  }

  const client = new CatalogDocumentClientMock();
  const imported = await importMeetupCommunities(records, {
    tableName: CATALOG,
    getIdentity: async () => ({ Account: '719535286359' }),
    docClient: client,
  });
  assert.deepEqual(imported, { total: 2, created: 2, skipped: 0 });
  assert.ok(client.calls.some(({ name }) => name === 'GetCommand'));
  assert.ok(client.calls.some(({ name }) => name === 'TransactWriteCommand'));
  assert.deepEqual(client.read(CATALOG, GROUP_ID), { ...records[0], version: 1 });
  assert.deepEqual(client.read(CATALOG, currentUrlReservationId(GROUP_URL)), currentUrlReservation(GROUP_URL, GROUP_ID));

  const harness = await createDynamoMoveHarness({ projectionAware: true });
  for (const record of records) {
    const item = client.read(CATALOG, record.id);
    const reservation = client.read(CATALOG, currentUrlReservationId(record.url));
    harness.mock.seed(CATALOG, item);
    harness.mock.seed(CATALOG, reservation);
  }
  harness.mock.seed(CATALOG, communityEvent());
  harness.mock.seed(CATALOG, currentUrlReservation(PROTECTED_EVENT_URL, PROTECTED_EVENT_ID));
  await createAndPublishProfile(harness);

  await claimAndGrant(harness, GROUP_ID, GROUP_URL);
  let storedGroup = physical(harness, GROUP_ID);
  observeLocator(locatorFailures, storedGroup, 'creator grant');
  assert.equal(storedGroup.url, GROUP_URL);
  assert.equal(storedGroup.directoryControl, 'creator');
  assert.equal(storedGroup.published, true);

  await claimAndGrant(harness, PROTECTED_EVENT_ID, PROTECTED_EVENT_URL);
  const protectedAfterGrant = physical(harness, PROTECTED_EVENT_ID);
  assert.equal(protectedAfterGrant.autoSync, false,
    'the existing event grant suppresses automatic edits to that event only');
  observeLocator(locatorFailures, storedGroup, 'individual event grant');

  let snapshot = await owner(harness);
  const groupOwnerView = ownerResource(snapshot, GROUP_ID);
  assert.equal(groupOwnerView.url, GROUP_URL);
  assert.equal(Object.hasOwn(groupOwnerView, 'meetupSourceUrl'), false,
    'the private source locator is absent from the creator resource DTO');
  const groupPlacementId = ownerPlacement(snapshot, GROUP_ID);
  const resourceVersion = groupOwnerView.version;
  const move = accepted(await api(harness, `/api/creador/enlaces/${encodeURIComponent(groupPlacementId)}/editar`, {
    creatorVersion: snapshot.creatorVersion,
    resourceVersion,
    url: DISPLAY_URL,
  }, { method: 'PATCH' }), 200, 'creator moves public community URL');
  assert.equal(move.operation, 'edit-link');
  assert.equal(move.disposition, 'saved');

  storedGroup = physical(harness, GROUP_ID);
  assert.equal(storedGroup.url, DISPLAY_URL);
  observeLocator(locatorFailures, storedGroup, 'creator URL edit');
  assert.equal(storedGroup.kind, 'community');
  assert.equal(storedGroup.format, 'User Group');
  assert.equal(storedGroup.country, 'AR');
  assert.equal(storedGroup.published, true);
  assert.equal(storedGroup.directoryControl, 'creator');

  const movedReservation = currentUrlReservation(DISPLAY_URL, GROUP_ID);
  assert.equal(physical(harness, currentUrlReservationId(GROUP_URL)), undefined,
    'the old public URL reservation is deleted by the real creator transaction');
  assert.deepEqual(physical(harness, movedReservation.id), movedReservation,
    'the new public URL reservation exactly matches the edited URL and stable group ID');
  assert.deepEqual(physical(harness, currentUrlReservationId(SIBLING_URL)), currentUrlReservation(SIBLING_URL, SIBLING_ID),
    'the sibling reservation is unchanged');
  assert.deepEqual(physical(harness, SIBLING_ID), client.read(CATALOG, SIBLING_ID),
    'the sibling editorial resource row is unchanged');

  client.remove(CATALOG, currentUrlReservationId(GROUP_URL));
  client.seed(CATALOG, storedGroup);
  client.seed(CATALOG, movedReservation);
  const reimportWrites = client.calls.filter(({ name }) => name === 'TransactWriteCommand').length;
  assert.deepEqual(await importMeetupCommunities(records, {
    tableName: CATALOG,
    getIdentity: async () => ({ Account: '719535286359' }),
    docClient: client,
  }), { total: 2, created: 0, skipped: 2 },
  'reimport leaves an existing edited community and its sibling alone');
  assert.deepEqual(client.read(CATALOG, GROUP_ID), storedGroup,
    'reimport preserves the edited public URL, private locator, and current version');
  assert.deepEqual(client.read(CATALOG, movedReservation.id), movedReservation,
    'reimport retains the exact current public URL reservation');
  assert.equal(client.read(CATALOG, currentUrlReservationId(GROUP_URL)), undefined,
    'reimport does not recreate the old source URL reservation');
  assert.equal(client.calls.filter(({ name }) => name === 'TransactWriteCommand').length, reimportWrites,
    'an idempotent import sends no transaction after observing the existing ID');

  const classified = accepted(await api(harness, `/api/admin/recursos/?id=${encodeURIComponent(GROUP_ID)}`, {
    category: 'Comunidad', kind: 'community', format: 'User Group', topics: ['Comunidad', 'Arquitectura'],
    version: storedGroup.version,
  }, { method: 'PATCH', session: 'admin' }), 200, 'admin reclassifies the moved community');
  assert.equal(classified.resource.id, GROUP_ID);
  storedGroup = physical(harness, GROUP_ID);
  observeLocator(locatorFailures, storedGroup, 'admin classification');
  assert.equal(storedGroup.url, DISPLAY_URL);
  assert.deepEqual(storedGroup.topics, ['Comunidad', 'Arquitectura']);

  const revoke = accepted(await api(harness, `/api/admin/recursos/revocar/?id=${encodeURIComponent(GROUP_ID)}`, {
    version: storedGroup.version,
  }, { method: 'POST', session: 'admin' }), 200, 'admin revokes directory approval');
  assert.equal(revoke.resource.directoryApproval, 'revoked');
  storedGroup = physical(harness, GROUP_ID);
  observeLocator(locatorFailures, storedGroup, 'admin revocation');
  assert.equal(storedGroup.approvalRevoked, true);
  assert.equal(storedGroup.published, false);

  const approve = accepted(await api(harness, `/api/admin/recursos/aprobar/?id=${encodeURIComponent(GROUP_ID)}`, {
    version: storedGroup.version,
  }, { method: 'POST', session: 'admin' }), 200, 'admin reapproves the community');
  assert.equal(approve.resource.directoryApproval, 'approved');
  storedGroup = physical(harness, GROUP_ID);
  observeLocator(locatorFailures, storedGroup, 'admin reapproval');
  assert.equal(storedGroup.url, DISPLAY_URL);
  assert.equal(storedGroup.approvalRevoked, false);
  assert.equal(storedGroup.published, true);

  snapshot = await owner(harness);
  assert.equal(ownerResource(snapshot, GROUP_ID).url, DISPLAY_URL);
  assert.equal(Object.hasOwn(ownerResource(snapshot, GROUP_ID), 'meetupSourceUrl'), false);
  assert.ok(snapshot.placements[groupPlacementId], 'the creator placement survives classification and moderation');
  assert.equal(snapshot.placements[groupPlacementId].selectedForDirectory, true);
  assert.equal(snapshot.resources.find(({ id }) => id === PROTECTED_EVENT_ID).id, PROTECTED_EVENT_ID,
    'the individually granted event remains linked');

  const creatorPublic = await harness.service.readPublicProfile(PROFILE_SLUG);
  assert.equal(creatorPublic.status, 200);
  const publicGroup = creatorPublic.links.find(({ resourceId }) => resourceId === GROUP_ID);
  assert.equal(publicGroup.url, DISPLAY_URL);
  assert.equal(Object.hasOwn(publicGroup, 'meetupSourceUrl'), false);

  const catalog = await publicCatalog(client, harness, snapshot.profile.id);
  const catalogGroup = catalog.find(({ id }) => id === GROUP_ID);
  const catalogSibling = catalog.find(({ id }) => id === SIBLING_ID);
  assert.equal(catalogGroup.url, DISPLAY_URL);
  assert.equal(Object.hasOwn(catalogGroup, 'meetupSourceUrl'), false);
  assert.equal(catalogSibling.url, SIBLING_URL);
  assert.equal(Object.hasOwn(catalogSibling, 'meetupSourceUrl'), false);
  assert.ok(client.calls.some(({ name, input }) => name === 'ScanCommand'
    && input.TableName === CATALOG
    && !Object.values(input.ExpressionAttributeNames ?? {}).includes('meetupSourceUrl')),
  'the public catalog scan requests only its public projection');

  const pythonRows = rawRows(harness, [
    GROUP_ID,
    SIBLING_ID,
    movedReservation.id,
    currentUrlReservationId(SIBLING_URL),
    PROTECTED_EVENT_ID,
    currentUrlReservationId(PROTECTED_EVENT_URL),
  ]);
  const python = spawnSync('python3', [PYTHON_PROVIDER], {
    input: JSON.stringify({ rows: pythonRows }), encoding: 'utf8', timeout: 30000,
  });
  if (python.error) runtimeFailures.push(`Python provider process did not start: ${python.error.message}`);
  if (python.status !== 0) {
    const detail = python.stderr.trim().split('\n').at(-1) ?? 'no stderr';
    runtimeFailures.push(`Python production sync exited ${python.status}: ${detail}`);
  } else {
    let sync;
    try {
      sync = JSON.parse(python.stdout);
    } catch (error) {
      runtimeFailures.push(`Python provider returned invalid JSON: ${error.message}`);
    }
    if (sync) {
      assert.deepEqual(sync.result.failures, []);
      assert.equal(sync.result.groups, 2, 'only the two typed community rows enroll as Meetup sources');
      assert.equal(sync.result.feedsRead, 2);
      assert.equal(sync.result.upcomingEvents, 3, 'the feed includes the individually protected event plus two peers');
      assert.equal(sync.result.changed, 2, 'the protected event is skipped while valid new events commit');
      assert.deepEqual(sync.feedRequests.sort(), [
        `${GROUP_URL}events/ical/`, `${SIBLING_URL}events/ical/`,
      ].sort(), 'Python reads the original private feed and the sibling feed');
      assert.deepEqual(sync.pageRequests.sort(), [
        `${GROUP_URL}events/316882966/`, `${SIBLING_URL}events/382663761/`,
      ].sort(), 'the granted event detail stays protected while independent event details load');
      assert.ok(sync.sourceScans.some((input) => projectionFields(input).includes('meetupSourceUrl')),
      'the database-backed Python source scan explicitly reads the private locator');
      assert.ok(sync.eventScans.some((input) => projectionFields(input).includes('recordType')),
      'Python also observes typed event rows through its separate existing-event projection');
      assert.ok(sync.requests.every((url) => new URL(url).hostname === 'www.meetup.com'),
        'an external public destination never becomes an outbound source request');

      const syncedProtected = sync.events.find(({ id }) => id === PROTECTED_EVENT_ID);
      const syncedTarget = sync.events.find(({ id }) => id === 'meetup-event-316882966');
      const syncedSibling = sync.events.find(({ id }) => id === 'meetup-event-382663761');
      assert.equal(syncedProtected.title, 'Título protegido por el creador');
      assert.equal(syncedProtected.autoSync, false);
      assert.equal(syncedTarget.sourceGroupId, GROUP_ID);
      assert.equal(syncedTarget.communityId, GROUP_ID);
      assert.equal(syncedSibling.sourceGroupId, SIBLING_ID);
      assert.equal(sync.transactions.length, 2);
      assert.ok(sync.transactions.every((actions) => actions.length === 2
        && actions.every((action) => Object.hasOwn(action, 'Put'))),
      'Python commits each accepted event with its URL reservation in one transaction');
    }
  }

  assert.deepEqual({ locatorFailures, runtimeFailures }, { locatorFailures: [], runtimeFailures: [] },
    'the private source locator survives every real writer and lets the production Python sync use the original feed');
});

test('Python producer rows survive persistence and the actual JavaScript public projection', async () => {
  const targetSource = {
    id: GROUP_ID, title: 'AWS Girls Argentina', url: GROUP_URL,
    meetupSourceUrl: GROUP_URL, country: 'AR', kind: 'community', published: true,
  };
  const siblingSource = {
    id: SIBLING_ID, title: 'AWS SBG Macul', url: SIBLING_URL,
    meetupSourceUrl: SIBLING_URL, country: 'CL', kind: 'community', published: true,
  };
  const protectedEvent = { ...communityEvent(), autoSync: false };
  const python = spawnSync('python3', [PYTHON_PROVIDER], {
    input: JSON.stringify({
      rows: [targetSource, siblingSource, protectedEvent,
        currentUrlReservation(PROTECTED_EVENT_URL, PROTECTED_EVENT_ID)],
      eventPages: {
        [TARGET_NEW_EVENT_URL]: {
          '@type': 'Event', name: '\ufeff  Encuentro nuevo de AWS Girls  ',
          url: TARGET_NEW_EVENT_URL, description: '<p>  Nuevo <strong>encuentro</strong>. </p>',
          startDate: '2099-01-01T19:00:00.900-03:00', endDate: '2099-01-01T20:00:00.900-03:00',
          eventStatus: 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          location: {
            '@type': 'Place', name: '\ufeff Auditorio ',
            address: { streetAddress: '\ufeff Calle 1 ', addressLocality: '\ufeff Córdoba ' },
          },
        },
      },
    }), encoding: 'utf8', timeout: 30000,
  });
  assert.equal(python.error, undefined, python.error?.message);
  assert.equal(python.status, 0, python.stderr);
  const sync = JSON.parse(python.stdout);
  assert.deepEqual(sync.result.failures, []);
  assert.equal(sync.result.changed, 2, 'two new events commit while the protected event remains source-owned');
  assert.equal(sync.transactions.length, 2);

  const client = new CatalogDocumentClientMock();
  for (const row of sync.rows.filter(({ recordType }) => recordType === 'event' || recordType === 'urlReservation')) {
    client.seed(CATALOG, row);
  }
  const publicRows = await loadCatalog({ tableName: CATALOG, docClient: client });
  const events = publicRows.filter(({ recordType }) => recordType === 'event');
  assert.deepEqual(events.map(({ id }) => id).sort(), [
    PROTECTED_EVENT_ID, 'meetup-event-316882966', 'meetup-event-382663761',
  ].sort());

  const target = events.find(({ id }) => id === 'meetup-event-316882966');
  assert.equal(target.title, 'Encuentro nuevo de AWS Girls');
  assert.equal(target.description, 'Nuevo encuentro.');
  assert.equal(target.startsAt, '2099-01-01T19:00:00-03:00');
  assert.equal(target.endsAt, '2099-01-01T20:00:00-03:00');
  assert.equal(target.place, 'Auditorio, Calle 1');
  assert.equal(target.city, 'Córdoba');
  assert.equal(target.mode, 'in-person');
  assert.equal(target.registrationUrl, TARGET_NEW_EVENT_URL);
  for (const privateField of ['sourceGroupId', 'sourceModifiedAt', 'autoSync', 'version', 'approvalRevoked', 'published']) {
    assert.equal(Object.hasOwn(target, privateField), false,
      `the actual public event projection excludes ${privateField}`);
  }
  assert.equal(publicRows.some(({ id }) => id.startsWith('__url#')), false,
    'the stored URL reservation is not a public event record');

  const scan = client.calls.find(({ name, input }) => name === 'ScanCommand' && input.TableName === CATALOG);
  assert.ok(scan, 'the public read uses the actual catalog scan boundary');
  const projectedFields = projectionFields(scan.input);
  for (const required of ['recordType', 'description', 'startsAt', 'endsAt', 'registrationUrl']) {
    assert.ok(projectedFields.includes(required), `the physical projection requests ${required}`);
  }
});

test('a provider timezone rejected by the public runtime cannot poison other Meetup events', async () => {
  const python = spawnSync('python3', [PYTHON_PROVIDER], {
    input: JSON.stringify({
      rows: [
        {
          id: GROUP_ID, title: 'AWS Girls Argentina', url: GROUP_URL,
          meetupSourceUrl: GROUP_URL, country: 'AR', kind: 'community', published: true,
        },
        {
          id: SIBLING_ID, title: 'AWS SBG Macul', url: SIBLING_URL,
          meetupSourceUrl: SIBLING_URL, country: 'CL', kind: 'community', published: true,
        },
        { ...communityEvent(), autoSync: false },
      ],
      feedTimeZones: { [`${GROUP_URL}events/ical/`]: 'Factory' },
    }),
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(python.error, undefined, python.error?.message);
  assert.equal(python.status, 0, python.stderr);
  const sync = JSON.parse(python.stdout);

  const client = new CatalogDocumentClientMock();
  for (const row of sync.rows.filter(({ recordType }) => recordType === 'event' || recordType === 'urlReservation')) {
    client.seed(CATALOG, row);
  }
  const publicEvents = (await loadCatalog({ tableName: CATALOG, docClient: client }))
    .filter(({ recordType }) => recordType === 'event');
  assert.deepEqual(publicEvents.map(({ id, timeZone }) => [id, timeZone]).sort(), [
    [PROTECTED_EVENT_ID, 'America/Argentina/Cordoba'],
    ['meetup-event-382663761', 'America/Santiago'],
  ]);
  assert.equal(sync.result.changed, 1);
  assert.equal(sync.result.failures.length, 1);
  assert.match(sync.result.failures[0], /36431225.*timezone|timezone.*36431225/iu);
  assert.equal(sync.rows.some(({ id }) => id === currentUrlReservationId(TARGET_NEW_EVENT_URL)), false);
  assert.deepEqual(sync.transactions.map((actions) => actions.map(({ Put }) => Put.Item.id)), [[
    'meetup-event-382663761', currentUrlReservationId(`${SIBLING_URL}events/382663761/`),
  ]]);
});

test('a real backfill wins over a stale authorized full-item creator write, then a fresh edit preserves its locator', async () => {
  // This planned backfill module is intentionally loaded only in this focused race
  // test so the source-enrollment composition test remains independently runnable.
  const { applyMeetupSourceLocators, planMeetupSourceLocators } =
    await import('../scripts/backfill-meetup-source-locators.mjs');
  const reviewedInput = JSON.parse(await readFile(new URL('../data/meetup-communities.json', import.meta.url), 'utf8'))
    .groups.find(({ id }) => id === '36431225');
  assert.equal(reviewedInput.url, GROUP_URL);
  const [mapped] = mapMeetupCommunities({ groups: [reviewedInput] });
  const legacy = { ...mapped, version: 1 };
  delete legacy.meetupSourceUrl;

  const harness = await createDynamoMoveHarness({ projectionAware: true });
  harness.mock.seed(CATALOG, legacy);
  harness.mock.seed(CATALOG, currentUrlReservation(GROUP_URL, GROUP_ID));
  await createAndPublishProfile(harness);
  await claimAndGrant(harness, GROUP_ID, GROUP_URL);

  const adapter = new HarnessBackfillDocumentClient(harness, [GROUP_ID, currentUrlReservationId(GROUP_URL)]);
  const plan = await planMeetupSourceLocators({
    tableName: CATALOG,
    docClient: adapter,
    reviewed: { groups: [{ id: '36431225', url: GROUP_URL }] },
  });
  assert.equal(plan.updates.find(({ id }) => id === GROUP_ID)?.observedVersion,
    physical(harness, GROUP_ID).version, 'the real backfill plan observes the legacy resource revision');
  assert.deepEqual(plan.blocked, []);

  const before = await owner(harness);
  const placementId = ownerPlacement(before, GROUP_ID);
  let backfill;
  harness.mock.raceBeforeNextTransaction(async () => {
    backfill = await applyMeetupSourceLocators({ tableName: CATALOG, docClient: adapter, plan });
  });
  const stale = await api(harness, `/api/creador/enlaces/${encodeURIComponent(placementId)}/editar`, {
    creatorVersion: before.creatorVersion,
    resourceVersion: ownerResource(before, GROUP_ID).version,
    url: DISPLAY_URL,
  }, { method: 'PATCH' });
  assert.equal(stale.status, 409, JSON.stringify(stale.body),
    'the stale full-item creator write loses after the conditional backfill advances the resource revision');
  assert.deepEqual(backfill.updated.map(({ id }) => id), [GROUP_ID]);
  assert.equal(adapter.updates.length, 1);

  let afterBackfill = physical(harness, GROUP_ID);
  assert.equal(afterBackfill.meetupSourceUrl, GROUP_URL);
  assert.equal(afterBackfill.url, GROUP_URL, 'the rejected stale edit does not replace the current public URL');
  assert.equal(afterBackfill.version, before.resources.find(({ id }) => id === GROUP_ID).version + 1);
  assert.deepEqual(physical(harness, currentUrlReservationId(GROUP_URL)), currentUrlReservation(GROUP_URL, GROUP_ID),
    'the stale creator transaction leaves the existing reservation intact');
  assert.equal(physical(harness, currentUrlReservationId(DISPLAY_URL)), undefined,
    'the stale creator transaction creates no destination reservation');

  const fresh = await owner(harness);
  const freshPlacementId = ownerPlacement(fresh, GROUP_ID);
  const saved = accepted(await api(harness, `/api/creador/enlaces/${encodeURIComponent(freshPlacementId)}/editar`, {
    creatorVersion: fresh.creatorVersion,
    resourceVersion: ownerResource(fresh, GROUP_ID).version,
    url: DISPLAY_URL,
  }, { method: 'PATCH' }), 200, 'fresh authorized creator edit retries after backfill');
  assert.equal(saved.disposition, 'saved');

  afterBackfill = physical(harness, GROUP_ID);
  assert.equal(afterBackfill.meetupSourceUrl, GROUP_URL);
  assert.equal(afterBackfill.url, DISPLAY_URL);
  assert.equal(afterBackfill.version, fresh.resources.find(({ id }) => id === GROUP_ID).version + 1);
  assert.equal(physical(harness, currentUrlReservationId(GROUP_URL)), undefined);
  assert.deepEqual(physical(harness, currentUrlReservationId(DISPLAY_URL)), currentUrlReservation(DISPLAY_URL, GROUP_ID));
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { currentUrlReservation } from '../src/lib/catalog-url.mjs';
import { createCreatorPagesService } from '../src/lib/creator-pages.mjs';
import { createCreatorStore } from '../src/lib/creator-store.mjs';

const ORIGIN = 'https://dondeaprendoaws.com';
const TABLES = {
  accountsTableName: 'phase7-accounts',
  profilesTableName: 'phase7-profiles',
  catalogTableName: 'phase7-catalog',
};
const ACCOUNT_ID = 'phase7-owner-account';
const PROFILE_ID = 'phase7-owner-profile';

function createPhysicalClaimService({ failingResourceId, reservation, batchResourceId = 'phase7-absent-resource' } = {}) {
  const calls = [];
  const client = {
    async send(command) {
      calls.push(command);
      if (command.constructor.name === 'BatchGetCommand') {
        const requestItems = command.input.RequestItems;
        assert.deepEqual(Object.keys(requestItems), [TABLES.catalogTableName]);
        const batch = requestItems[TABLES.catalogTableName];
        assert.equal(batch.ConsistentRead, true);
        assert.deepEqual(batch.Keys, [{ id: failingResourceId ?? batchResourceId }]);
        if (failingResourceId) throw new Error('injected DynamoDB batch-read failure');
        return { Responses: { [TABLES.catalogTableName]: [] } };
      }
      if (command.constructor.name !== 'GetCommand') {
        throw new Error(`unexpected physical command ${command.constructor.name}`);
      }
      const { TableName, Key } = command.input;
      if (TableName === TABLES.accountsTableName
        && Key.pk === `PROFILE_OWNER#${createHash('sha256').update(ACCOUNT_ID, 'utf8').digest('hex')}`) {
        return { Item: { profileId: PROFILE_ID } };
      }
      if (TableName === TABLES.profilesTableName
        && Key.pk === `PROFILE#${PROFILE_ID}` && Key.sk === 'META') {
        return { Item: { recordType: 'profile', id: PROFILE_ID, version: 1 } };
      }
      if (TableName === TABLES.catalogTableName && reservation && Key.id === reservation.id) {
        return { Item: reservation };
      }
      throw new Error(`unexpected physical read ${TableName}:${JSON.stringify(Key)}`);
    },
  };
  const store = createCreatorStore({ ...TABLES, client });
  const service = createCreatorPagesService({
    store,
    origin: ORIGIN,
    createId: () => 'phase7-claim-id',
    authenticate: async () => ({
      session: { state: 'authenticated', account: { email: 'owner@example.invalid' }, csrfToken: 'phase7-csrf', expiresAt: 1 },
      principal: { state: 'authenticated', accountId: ACCOUNT_ID, csrfToken: 'phase7-csrf', isAdmin: false },
    }),
  });
  return { calls, service };
}

async function submitClaim(service, resourceId, submittedUrl = `https://catalog.example/${resourceId}`) {
  return service.handle(new Request(`${ORIGIN}/api/creador/reclamaciones`, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      'x-csrf-token': 'phase7-csrf',
    },
    body: JSON.stringify({
      resources: [{ ...(resourceId === undefined ? {} : { resourceId }), url: submittedUrl }],
    }),
  }));
}

test('physical claim target reads distinguish an absent resource from an operational lookup failure', async () => {
  const absent = createPhysicalClaimService();
  const notFound = await submitClaim(absent.service, 'phase7-absent-resource');
  assert.equal(notFound.status, 404);
  assert.equal((await notFound.json()).error, 'RESOURCE_NOT_FOUND');
  const absentRead = absent.calls.at(-1);
  assert.equal(absentRead.constructor.name, 'BatchGetCommand');
  assert.deepEqual(absentRead.input.RequestItems[TABLES.catalogTableName].Keys, [{ id: 'phase7-absent-resource' }]);
  assert.equal(absentRead.input.RequestItems[TABLES.catalogTableName].ConsistentRead, true);
  assert.equal(absent.calls.some((command) => command.constructor.name === 'TransactWriteCommand'), false,
    'an absent target does not attempt a claim or reference write');

  const operational = createPhysicalClaimService({ failingResourceId: 'phase7-failing-resource' });
  const unavailable = await submitClaim(operational.service, 'phase7-failing-resource');
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error, 'SERVICE_UNAVAILABLE');
  assert.equal(operational.calls.at(-1).constructor.name, 'BatchGetCommand');
  assert.equal(operational.calls.some((command) => command.constructor.name === 'TransactWriteCommand'), false,
    'an operational lookup failure is not treated as resource absence and never writes a claim');
});

test('a reserved URL whose successful batch omits its target remains an index mismatch', async () => {
  const url = 'https://catalog.example/phase7-url-target';
  const reservation = currentUrlReservation(url, 'phase7-url-resource');
  const indexed = createPhysicalClaimService({ reservation, batchResourceId: reservation.resourceId });
  const response = await submitClaim(indexed.service, undefined, url);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'URL_INDEX_MISMATCH');
  assert.equal(indexed.calls.some((command) => command.constructor.name === 'GetCommand'
    && command.input.TableName === TABLES.catalogTableName
    && command.input.Key.id === reservation.id), true, 'the valid URL reservation is found');
  assert.equal(indexed.calls.some((command) => command.constructor.name === 'BatchGetCommand'), true,
    'resource lookup uses the common found-row batch contract');
  assert.equal(indexed.calls.some((command) => command.constructor.name === 'TransactWriteCommand'), false,
    'a missing indexed target does not write a claim or reference');
});

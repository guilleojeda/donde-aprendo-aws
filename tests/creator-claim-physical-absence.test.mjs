import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { currentUrlReservation } from '../src/lib/catalog-url.mjs';
import { createCreatorPagesService } from '../src/lib/creator-pages.mjs';
import { createCreatorStore } from '../src/lib/creator-store.mjs';
import { CREATOR_CONTRACT_VERSION } from '../src/lib/creator-values.mjs';

const ORIGIN = 'https://dondeaprendoaws.com';
const TABLES = {
  accountsTableName: 'phase7-accounts',
  profilesTableName: 'phase7-profiles',
  catalogTableName: 'phase7-catalog',
};
const ACCOUNT_ID = 'phase7-owner-account';
const PROFILE_ID = 'phase7-owner-profile';

function createPhysicalClaimService({
  failingResourceId,
  reservation,
  batchResourceId = 'phase7-absent-resource',
  batchResponses,
} = {}) {
  const calls = [];
  const writeAttempts = [];
  let batchResponseIndex = 0;
  const client = {
    async send(command) {
      calls.push(command);
      if (command.constructor.name === 'BatchGetCommand') {
        const requestItems = command.input.RequestItems;
        assert.deepEqual(Object.keys(requestItems), [TABLES.catalogTableName]);
        const batch = requestItems[TABLES.catalogTableName];
        assert.equal(batch.ConsistentRead, true);
        assert.deepEqual(batch.Keys, [{ id: failingResourceId ?? batchResourceId }]);
        if (batchResponses) return batchResponses[batchResponseIndex++];
        if (failingResourceId) throw new Error('injected DynamoDB batch-read failure');
        return { Responses: { [TABLES.catalogTableName]: [] } };
      }
      if (command.constructor.name === 'TransactWriteCommand') {
        writeAttempts.push(command);
        return {};
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
        return { Item: {
          ...Key, recordType: 'creatorState', schemaVersion: 2, id: PROFILE_ID, version: 1,
          displayName: 'Fixture owner', slug: 'fixture-owner', published: false, hidden: false,
          programs: [], socials: {}, createdAt: 1000, updatedAt: 1000,
          placements: {}, order: { featured: [], ordinary: [] }, series: {},
        } };
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
  return { calls, service, writeAttempts };
}

async function submitClaim(service, resourceId, submittedUrl = `https://catalog.example/${resourceId}`) {
  return service.handle(new Request(`${ORIGIN}/api/creador/reclamaciones`, {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      'x-csrf-token': 'phase7-csrf',
      'x-creator-contract': CREATOR_CONTRACT_VERSION,
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

test('a batch row also marked unprocessed cannot create a claim after an empty retry', async () => {
  const resourceId = 'phase7-contradictory-resource';
  const url = `https://catalog.example/${resourceId}`;
  const contradictory = createPhysicalClaimService({
    batchResourceId: resourceId,
    batchResponses: [
      {
        Responses: { [TABLES.catalogTableName]: [{
          id: resourceId,
          title: 'Catalog resource',
          url,
          version: 1,
        }] },
        UnprocessedKeys: { [TABLES.catalogTableName]: { Keys: [{ id: resourceId }] } },
      },
      { Responses: { [TABLES.catalogTableName]: [] } },
    ],
  });

  const response = await submitClaim(contradictory.service, resourceId, url);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'SERVICE_UNAVAILABLE');
  assert.equal(contradictory.calls.filter((command) => command.constructor.name === 'BatchGetCommand').length, 1,
    'the contradictory first response fails before a retry can overwrite its meaning');
  assert.deepEqual(contradictory.writeAttempts, [], 'neither the claim nor its owner reference is written');
});

test('a resource found on a valid retry remains distinct from a genuinely absent target', async () => {
  const resourceId = 'phase7-retried-resource';
  const url = `https://catalog.example/${resourceId}`;
  const retried = createPhysicalClaimService({
    batchResourceId: resourceId,
    batchResponses: [
      { UnprocessedKeys: { [TABLES.catalogTableName]: { Keys: [{ id: resourceId }] } } },
      { Responses: { [TABLES.catalogTableName]: [{ id: resourceId, title: 'Catalog resource', url, version: 1 }] } },
    ],
  });

  const found = await submitClaim(retried.service, resourceId, url);
  assert.equal(found.status, 202);
  assert.equal(retried.calls.filter((command) => command.constructor.name === 'BatchGetCommand').length, 2);
  assert.equal(retried.calls.filter((command) => command.constructor.name === 'BatchGetCommand')
    .every((command) => command.input.RequestItems[TABLES.catalogTableName].ConsistentRead === true), true,
  'the initial and retry reads are strongly consistent');
  assert.equal(retried.writeAttempts.length, 1, 'the retried found resource reaches the claim and reference transaction');

  const absent = createPhysicalClaimService({ batchResourceId: resourceId });
  const missing = await submitClaim(absent.service, resourceId, url);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error, 'RESOURCE_NOT_FOUND');
  assert.deepEqual(absent.writeAttempts, [], 'a true absence does not create either claim record');
});

test('a malformed null batch result is unavailable and cannot create a claim', async () => {
  const resourceId = 'phase7-malformed-null-resource';
  const malformed = createPhysicalClaimService({
    batchResourceId: resourceId,
    batchResponses: [{ Responses: { [TABLES.catalogTableName]: null } }],
  });

  const response = await submitClaim(malformed.service, resourceId);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'SERVICE_UNAVAILABLE');
  assert.equal(malformed.calls.filter((command) => command.constructor.name === 'BatchGetCommand').length, 1);
  assert.deepEqual(malformed.writeAttempts, [], 'malformed provider data never reaches claim persistence');
});

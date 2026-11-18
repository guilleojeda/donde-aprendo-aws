import { createHash } from 'node:crypto';
import { DynamoDBClient, DynamoDBServiceException } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoDbItemSize } from './creator-dynamodb-size.mjs';
import { assertCreatorRecordIdentity } from './creator-record-identity.mjs';

const MAX_TRANSACTION_ACTIONS = 100;
const MAX_BATCH_GET_KEYS = 100;
const MAX_UNPROCESSED_RETRIES = 3;
const BATCH_GET_RETRY_DELAYS_MS = [10, 20, 40];
const DEFINITE_TRANSACTION_REJECTIONS = new Set([
  'TransactionCanceledException', 'ProvisionedThroughputExceededException', 'RequestLimitExceeded',
  'ThrottlingException', 'ResourceNotFoundException', 'ValidationException',
]);

export function isConfirmedTransactionRejection(error) {
  // A modeled rejection of the only provider attempt is evidence that this
  // write did not commit. Keep the outcome unknown after a transport failure
  // or retry. The cancellation reason is retained for the ordinary CAS path;
  // it does not change the provider-attempt guarantee here.
  return error instanceof DynamoDBServiceException && error.$metadata?.httpStatusCode === 400
    && error.$metadata?.attempts === 1 && DEFINITE_TRANSACTION_REJECTIONS.has(error.name);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requireTableName(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required`);
  return value.trim();
}

function identityPart(value, prefix, label) {
  if (!value.startsWith(prefix)) throw new TypeError(`unsupported logical key: ${value}`);
  const part = value.slice(prefix.length);
  if (!part || part.includes(':')) throw new TypeError(`invalid ${label} in logical key`);
  return part;
}

function parseProfileAndId(value, prefix, label, { allowIdColon = false } = {}) {
  if (!value.startsWith(prefix)) throw new TypeError(`unsupported logical key: ${value}`);
  const suffix = value.slice(prefix.length);
  const split = suffix.indexOf(':');
  if (split <= 0 || split === suffix.length - 1) throw new TypeError(`invalid ${label} logical key`);
  const profileId = suffix.slice(0, split);
  const id = suffix.slice(split + 1);
  if (profileId.includes(':') || (!allowIdColon && id.includes(':'))) throw new TypeError(`invalid ${label} logical key`);
  return { profileId, id };
}

function logicalKey(key) {
  if (typeof key !== 'string' || key.length === 0) throw new TypeError('logical key is required');
  if (key.startsWith('profile:')) {
    const id = identityPart(key, 'profile:', 'profile ID');
    return { table: 'profiles', key: { pk: `PROFILE#${id}`, sk: 'META' }, id, type: 'profile' };
  }
  if (key.startsWith('alias:')) {
    const slug = identityPart(key, 'alias:', 'slug');
    return { table: 'profiles', key: { pk: `SLUG#${slug}`, sk: 'META' }, id: slug, type: 'alias' };
  }
  if (key.startsWith('series-alias:')) {
    const { profileId, id: slug } = parseProfileAndId(key, 'series-alias:', 'series alias');
    return {
      table: 'profiles',
      key: { pk: `PROFILE#${profileId}`, sk: `SERIES_SLUG#${slug}` },
      profileId,
      id: slug,
      type: 'seriesAlias',
    };
  }
  if (key.startsWith('editor:')) {
    const { profileId, id } = parseProfileAndId(key, 'editor:', 'editor reference', { allowIdColon: true });
    return { table: 'profiles', key: { pk: `PROFILE#${profileId}`, sk: `EDITOR#${id}` }, profileId, id, type: 'editor' };
  }
  if (key.startsWith('claim-ref:')) {
    const { profileId, id } = parseProfileAndId(key, 'claim-ref:', 'claim reference');
    return { table: 'profiles', key: { pk: `PROFILE#${profileId}`, sk: `CLAIM#${id}` }, profileId, id, type: 'claimRef' };
  }
  if (key.startsWith('claim:')) {
    const id = identityPart(key, 'claim:', 'claim ID');
    return { table: 'profiles', key: { pk: 'ADMIN#CLAIMS', sk: `CLAIM#${id}` }, id, type: 'claim' };
  }
  if (key.startsWith('photo-upload:')) {
    const id = identityPart(key, 'photo-upload:', 'photo upload ID');
    return { table: 'profiles', key: { pk: `PHOTO_UPLOAD#${id}`, sk: 'META' }, id, type: 'photoUpload' };
  }
  if (key.startsWith('account-profile:')) {
    const accountId = key.slice('account-profile:'.length);
    if (!accountId) throw new TypeError('account ID is required');
    return { table: 'accounts', key: { pk: `PROFILE_OWNER#${sha256(accountId)}` }, type: 'accountProfile' };
  }
  if (key.startsWith('resource:')) {
    const id = key.slice('resource:'.length);
    if (!id) throw new TypeError('resource ID is required');
    return { table: 'catalog', key: { id }, id, type: 'resource' };
  }
  if (key.startsWith('url:')) {
    const digest = key.slice('url:'.length);
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new TypeError('URL logical key must contain a SHA-256 hex digest');
    const id = `__url#${digest}`;
    return { table: 'catalog', key: { id }, id, type: 'urlReservation' };
  }
  throw new TypeError(`unsupported logical key: ${key}`);
}

function tableNameFor(descriptor, tables) {
  return tables[descriptor.table];
}

function cleanItem(item, identity) {
  if (!item) return null;
  if (identity) assertCreatorRecordIdentity(item, identity);
  const { pk: _pk, sk: _sk, ...value } = item;
  if (identity?.type !== 'claim') delete value.ttl;
  // Aggregate revisions are mandatory persisted state. Do not turn a malformed
  // creatorState row with a missing revision into an apparent revision zero.
  return value.recordType === 'creatorState' || Object.hasOwn(value, 'version')
    ? value : { ...value, version: 0 };
}

function conflictCancel(error) {
  if (error?.name !== 'TransactionCanceledException' && error?.Code !== 'TransactionCanceledException') return false;
  // A modeled DynamoDB cancellation can be converted to an ordinary CAS miss
  // only when the single HTTP 400 attempt is known to have been rejected. A
  // retry, missing attempt metadata, or transport-shaped error leaves a grant
  // outcome ambiguous and must propagate to the command boundary. The
  // in-memory CAS store remains responsible for its own false result.
  if (!isConfirmedTransactionRejection(error)) return false;
  const reasons = error.CancellationReasons ?? error.cancellationReasons;
  if (!Array.isArray(reasons) || reasons.length === 0) return false;
  let hasConflict = false;
  for (const reason of reasons) {
    if (reason?.Code === 'None') continue;
    if (reason?.Code === 'ConditionalCheckFailed' || reason?.Code === 'TransactionConflict') {
      hasConflict = true;
      continue;
    }
    return false;
  }
  return hasConflict;
}

function physicalId(descriptor) {
  return `${descriptor.table}\u0000${JSON.stringify(descriptor.key)}`;
}

function expressionForExpectedReservation(descriptor, version, expected) {
  if (descriptor.type !== 'urlReservation') throw new TypeError('expected reservation state requires a URL reservation key');
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)
    || expected.id !== descriptor.id || expected.recordType !== 'urlReservation'
    || typeof expected.url !== 'string' || typeof expected.status !== 'string'
    || !Number.isSafeInteger(expected.version) || expected.version < 0
    || expected.version !== version) {
    throw new TypeError('invalid expected URL reservation state');
  }

  const names = {};
  const values = {};
  const predicates = [];
  let index = 0;
  for (const attribute of ['id', 'recordType', 'url', 'status', 'resourceId', 'resourceIds']) {
    const nameToken = `#observed${index}`;
    names[nameToken] = attribute;
    if (Object.hasOwn(expected, attribute)) {
      const valueToken = `:observed${index}`;
      values[valueToken] = structuredClone(expected[attribute]);
      predicates.push(`${nameToken} = ${valueToken}`);
    } else {
      predicates.push(`attribute_not_exists(${nameToken})`);
    }
    index += 1;
  }
  const versionCondition = expressionForCheck(descriptor, version);
  return {
    ConditionExpression: `(${versionCondition.ConditionExpression}) AND ${predicates.join(' AND ')}`,
    ExpressionAttributeNames: { ...versionCondition.ExpressionAttributeNames, ...names },
    ExpressionAttributeValues: { ...versionCondition.ExpressionAttributeValues, ...values },
  };
}

function expressionForCheck(descriptor, version) {
  const keyAttribute = descriptor.table === 'catalog' ? '#id' : '#pk';
  const names = { [keyAttribute]: descriptor.table === 'catalog' ? 'id' : 'pk' };
  const exists = `attribute_exists(${keyAttribute})`;
  if (version === null) {
    return {
      ConditionExpression: `attribute_not_exists(${keyAttribute})`,
      ExpressionAttributeNames: names,
    };
  }
  if (!Number.isSafeInteger(version) || version < 0) throw new TypeError('CAS version must be null or a non-negative integer');
  names['#version'] = 'version';
  if (version === 0) {
    return {
      ConditionExpression: `${exists} AND (attribute_not_exists(#version) OR #version = :zero)`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: { ':zero': 0 },
    };
  }
  return {
    ConditionExpression: `${exists} AND #version = :version`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: { ':version': version },
  };
}

function withPhysicalKeys(descriptor, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('stored value must be an object');
  return { ...value, ...descriptor.key };
}

function paginationFingerprint(value) {
  return JSON.stringify(value, Object.keys(value ?? {}).sort());
}

function keyFingerprint(value) {
  return JSON.stringify(value, Object.keys(value ?? {}).sort());
}

function addPageCursor(parameters, cursor) {
  if (cursor !== undefined) parameters.ExclusiveStartKey = cursor;
  return parameters;
}

function profileProjection() {
  const fields = ['pk', 'sk', 'recordType', 'schemaVersion', 'id', 'slug', 'displayName', 'published', 'hidden', 'version'];
  const names = Object.fromEntries(fields.map((field, index) => [`#p${index}`, field]));
  return { ProjectionExpression: fields.map((_, index) => `#p${index}`).join(', '), ExpressionAttributeNames: names };
}

function resourceProjection() {
  const fields = ['id', 'title', 'url', 'registrationUrl', 'description', 'category', 'kind', 'format', 'topics', 'order', 'featured', 'published', 'hidden', 'approvalRevoked', 'directoryControl', 'editorProfileId', 'autoSync', 'version', 'sourceId', 'recordType', 'addedAt', 'country', 'level', 'communityId', 'eventId', 'startsAt', 'endsAt', 'timeZone', 'organizer', 'mode', 'place', 'city', 'venueCountry'];
  const names = Object.fromEntries(fields.map((field, index) => [`#r${index}`, field]));
  return { ProjectionExpression: fields.map((_, index) => `#r${index}`).join(', '), ExpressionAttributeNames: names };
}

function claimProjection() {
  const fields = ['pk', 'sk', 'recordType', 'id', 'profileId', 'accountId', 'resourceIds', 'resources', 'sourceId', 'evidence', 'status', 'createdAt', 'updatedAt', 'resolvedAt', 'version', 'ttl'];
  const names = Object.fromEntries(fields.map((field, index) => [`#c${index}`, field]));
  return { ProjectionExpression: fields.map((_, index) => `#c${index}`).join(', '), ExpressionAttributeNames: names };
}

function openClaimProjection() {
  const fields = ['pk', 'sk', 'recordType', 'id', 'profileId', 'accountId', 'resourceIds', 'status', 'version'];
  const names = Object.fromEntries(fields.map((field, index) => [`#o${index}`, field]));
  return { ProjectionExpression: fields.map((_, index) => `#o${index}`).join(', '), ExpressionAttributeNames: names };
}

export function createCreatorStore({ accountsTableName, profilesTableName, catalogTableName, region, client } = {}) {
  const tables = {
    accounts: requireTableName(accountsTableName, 'accountsTableName'),
    profiles: requireTableName(profilesTableName, 'profilesTableName'),
    catalog: requireTableName(catalogTableName, 'catalogTableName'),
  };
  const documentClient = client ?? DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: region ?? process.env.AWS_REGION ?? 'us-east-1' }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  if (!documentClient || typeof documentClient.send !== 'function') throw new TypeError('client must implement send');

  async function readPages(commandFactory, table, parameters) {
    const rows = [];
    let cursor;
    const seen = new Set();
    for (;;) {
      const page = await documentClient.send(new commandFactory({ TableName: table, ...addPageCursor({ ...parameters }, cursor) }));
      if (!page || !Array.isArray(page.Items)) throw new Error('DynamoDB list response is missing Items');
      rows.push(...page.Items);
      const next = page.LastEvaluatedKey;
      if (next === undefined || next === null) return rows;
      if (typeof next !== 'object' || Array.isArray(next)) throw new Error('DynamoDB list response has an invalid LastEvaluatedKey');
      if (Object.keys(next).length === 0) return rows;
      const fingerprint = paginationFingerprint(next);
      if (seen.has(fingerprint)) throw new Error('DynamoDB list repeated a pagination key');
      seen.add(fingerprint);
      cursor = next;
    }
  }

  async function batchGetRows({ table, ids, keyForId, idForItem, idForKey, cleanForItem, projection, label }) {
    const rows = new Map();
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return rows;

    for (let offset = 0; offset < uniqueIds.length; offset += MAX_BATCH_GET_KEYS) {
      const batchIds = uniqueIds.slice(offset, offset + MAX_BATCH_GET_KEYS);
      const expected = new Set(batchIds);
      let pendingKeys = batchIds.map(keyForId);
      let retries = 0;

      while (pendingKeys.length > 0) {
        const response = await documentClient.send(new BatchGetCommand({
          RequestItems: {
            [table]: {
              Keys: pendingKeys,
              ConsistentRead: true,
              ...projection,
            },
          },
        }));
        if (!response || typeof response !== 'object' || Array.isArray(response)) {
          throw new Error('DynamoDB batch read response is malformed');
        }

        const rawResponses = response.Responses;
        if (rawResponses !== undefined && (!rawResponses || typeof rawResponses !== 'object' || Array.isArray(rawResponses))) {
          throw new Error('DynamoDB batch read Responses is malformed');
        }
        if (rawResponses && Object.keys(rawResponses).some((responseTable) => responseTable !== table)) {
          throw new Error('DynamoDB batch read returned an unexpected table');
        }
        // DynamoDB may omit a table key when no rows were found. That is a
        // complete absence only when no keys remain unprocessed below.
        const items = rawResponses && Object.hasOwn(rawResponses, table) ? rawResponses[table] : [];
        if (!Array.isArray(items)) throw new Error('DynamoDB batch read items are malformed');

        const requested = new Map(pendingKeys.map((key) => [keyFingerprint(key), key]));
        for (const item of items) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new Error(`DynamoDB batch read returned an invalid ${label}`);
          }
          const id = idForItem(item);
          const itemKey = keyForId(id);
          const itemFingerprint = keyFingerprint(itemKey);
          const requestedKey = requested.get(itemFingerprint);
          if (!requestedKey || !expected.has(id)) {
            throw new Error(`DynamoDB batch read returned an unexpected ${label}`);
          }
          if (rows.has(id)) throw new Error(`DynamoDB batch read returned an unexpected or duplicate ${label}`);
          rows.set(id, structuredClone(cleanForItem ? cleanForItem(item) : cleanItem(item)));
        }

        const rawUnprocessed = response.UnprocessedKeys;
        if (rawUnprocessed !== undefined && (!rawUnprocessed || typeof rawUnprocessed !== 'object' || Array.isArray(rawUnprocessed))) {
          throw new Error('DynamoDB batch read UnprocessedKeys is malformed');
        }
        if (rawUnprocessed && Object.keys(rawUnprocessed).some((responseTable) => responseTable !== table)) {
          throw new Error('DynamoDB batch read returned an unexpected unprocessed table');
        }
        const unprocessed = rawUnprocessed?.[table];
        if (unprocessed === undefined) break;
        if (!unprocessed || typeof unprocessed !== 'object' || Array.isArray(unprocessed) || !Array.isArray(unprocessed.Keys)) {
          throw new Error('DynamoDB batch read unprocessed keys are malformed');
        }
        if (unprocessed.Keys.length === 0) break;

        const seenKeys = new Set();
        for (const key of unprocessed.Keys) {
          const fingerprint = keyFingerprint(key);
          if (!key || typeof key !== 'object' || Array.isArray(key)
            || !requested.has(fingerprint) || seenKeys.has(fingerprint)) {
            throw new Error('DynamoDB batch read returned an invalid unprocessed key');
          }
          const id = idForKey(key);
          if (rows.has(id)) throw new Error(`DynamoDB batch read ${label} was both returned and unprocessed`);
          seenKeys.add(fingerprint);
        }
        if (retries >= MAX_UNPROCESSED_RETRIES) throw new Error('DynamoDB batch read exceeded unprocessed key retries');
        await new Promise((resolve) => setTimeout(resolve, BATCH_GET_RETRY_DELAYS_MS[retries]));
        retries += 1;
        pendingKeys = unprocessed.Keys;
      }
    }
    return rows;
  }

  async function getResources(ids) {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id.length === 0)) {
      throw new TypeError('resource IDs must be a list of non-empty strings');
    }
    return batchGetRows({
      table: tables.catalog,
      ids,
      keyForId: (id) => ({ id }),
      projection: resourceProjection(),
      idForItem: (item) => {
        if (typeof item.id !== 'string' || item.id.length === 0) {
          throw new Error('DynamoDB batch read returned an invalid resource');
        }
        return item.id;
      },
      idForKey: (key) => {
        if (!key || typeof key !== 'object' || Array.isArray(key)
          || Object.keys(key).length !== 1 || typeof key.id !== 'string' || key.id.length === 0) {
          throw new Error('DynamoDB batch read returned an invalid unprocessed key');
        }
        return key.id;
      },
      label: 'resource',
    });
  }

  async function getClaims(ids) {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id.length === 0)) {
      throw new TypeError('claim IDs must be a list of non-empty strings');
    }
    return batchGetRows({
      table: tables.profiles,
      ids,
      keyForId: (id) => ({ pk: 'ADMIN#CLAIMS', sk: `CLAIM#${id}` }),
      projection: claimProjection(),
      idForItem: (item) => {
        if (typeof item.pk !== 'string' || typeof item.sk !== 'string') {
          throw new Error('DynamoDB batch read returned an invalid claim');
        }
        const identity = assertCreatorRecordIdentity(item, { type: 'claim', pk: 'ADMIN#CLAIMS', sk: item.sk });
        return identity.id;
      },
      cleanForItem: (item) => {
        const identity = assertCreatorRecordIdentity(item, { type: 'claim', pk: 'ADMIN#CLAIMS', sk: item.sk });
        return cleanItem(item, identity);
      },
      idForKey: (key) => {
        if (!key || typeof key !== 'object' || Array.isArray(key)
          || Object.keys(key).length !== 2 || key.pk !== 'ADMIN#CLAIMS' || typeof key.sk !== 'string') {
          throw new Error('DynamoDB batch read returned an invalid unprocessed key');
        }
        const identity = assertCreatorRecordIdentity(
          { pk: key.pk, sk: key.sk, recordType: 'claim', id: key.sk.slice('CLAIM#'.length) },
          { type: 'claim', pk: key.pk, sk: key.sk },
        );
        return identity.id;
      },
      label: 'claim',
    });
  }

  async function list(prefix) {
    if (typeof prefix !== 'string') throw new TypeError('prefix must be a string');
    if (prefix.startsWith('editor:') && prefix !== 'editor:') {
      const match = prefix.match(/^editor:([^:]+):$/);
      const profileId = match?.[1];
      if (!profileId) throw new TypeError('editor query requires a profile ID and trailing separator');
      const rows = await readPages(QueryCommand, tables.profiles, {
        ConsistentRead: true,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
        ExpressionAttributeValues: { ':pk': `PROFILE#${profileId}`, ':sk': 'EDITOR#' },
        ProjectionExpression: '#pk, #sk, #recordType, #profileId, #resourceId, #version',
        ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk', '#recordType': 'recordType', '#profileId': 'profileId', '#resourceId': 'resourceId', '#version': 'version' },
      });
      return rows.map((row) => {
        const identity = assertCreatorRecordIdentity(row, {
          type: 'editor', pk: `PROFILE#${profileId}`, sk: row?.sk,
        });
        return {
          key: `editor:${identity.profileId}:${identity.resourceId}`,
          value: cleanItem(row),
        };
      });
    }
    if (prefix.startsWith('claim-ref:') && prefix !== 'claim-ref:') {
      const match = prefix.match(/^claim-ref:([^:]+):$/);
      const profileId = match?.[1];
      if (!profileId) throw new TypeError('claim reference query requires a profile ID and trailing separator');
      const rows = await readPages(QueryCommand, tables.profiles, {
        ConsistentRead: true,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
        ExpressionAttributeValues: { ':pk': `PROFILE#${profileId}`, ':sk': 'CLAIM#' },
        ProjectionExpression: '#pk, #sk, #recordType, #id, #version',
        ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk', '#recordType': 'recordType', '#id': 'id', '#version': 'version' },
      });
      return rows.map((row) => {
        const identity = assertCreatorRecordIdentity(row, {
          type: 'claimRef', pk: `PROFILE#${profileId}`, sk: row?.sk,
        });
        return {
          key: `claim-ref:${identity.profileId}:${identity.id}`,
          value: cleanItem(row),
        };
      });
    }
    if (prefix === 'profile:') {
      const projection = profileProjection();
      const rows = await readPages(ScanCommand, tables.profiles, { ConsistentRead: true, ...projection });
      return rows.filter((row) => row.recordType === 'creatorState'
        && row.schemaVersion === 2 && typeof row.id === 'string')
        .map((row) => ({ key: `profile:${row.id}`, value: cleanItem(row) }));
    }
    if (prefix === 'resource:') {
      const rows = await readPages(ScanCommand, tables.catalog, { ConsistentRead: true, ...resourceProjection() });
      return rows.filter((row) => typeof row.id === 'string' && !row.id.startsWith('__'))
        .map((row) => ({ key: `resource:${row.id}`, value: cleanItem(row) }));
    }
    if (prefix === 'claim:') {
      const projection = claimProjection();
      const rows = await readPages(QueryCommand, tables.profiles, {
        ConsistentRead: true,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
        ExpressionAttributeValues: { ':pk': 'ADMIN#CLAIMS', ':sk': 'CLAIM#' },
        ...projection,
        ExpressionAttributeNames: { ...projection.ExpressionAttributeNames, '#pk': 'pk', '#sk': 'sk' },
      });
      return rows.map((row) => {
        const identity = assertCreatorRecordIdentity(row, {
          type: 'claim', pk: 'ADMIN#CLAIMS', sk: row?.sk,
        });
        return { key: `claim:${identity.id}`, value: cleanItem(row, identity) };
      });
    }
    throw new TypeError(`unsupported logical list prefix: ${prefix}`);
  }

  async function listOpenClaimsForAccount(accountId) {
    if (typeof accountId !== 'string' || accountId.length === 0) {
      throw new TypeError('account ID must be a non-empty string');
    }
    const projection = openClaimProjection();
    const rows = await readPages(QueryCommand, tables.profiles, {
      ConsistentRead: true,
      KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
      FilterExpression: '#accountId = :accountId AND #status IN (:pending, :partial)',
      ExpressionAttributeValues: {
        ':pk': 'ADMIN#CLAIMS', ':sk': 'CLAIM#', ':accountId': accountId,
        ':pending': 'pending', ':partial': 'partial',
      },
      ...projection,
      ExpressionAttributeNames: {
        ...projection.ExpressionAttributeNames,
        '#pk': 'pk', '#sk': 'sk', '#accountId': 'accountId', '#status': 'status',
      },
    });
    return rows.flatMap((row) => {
      const identity = assertCreatorRecordIdentity(row, {
        type: 'claim', pk: 'ADMIN#CLAIMS', sk: row?.sk,
      });
      // Keep the provider filter as the authoritative population boundary,
      // while retaining a local guard against a malformed or non-Dynamo
      // adapter that returns an unsolicited row.
      if (row.accountId !== accountId || !['pending', 'partial'].includes(row.status)) return [];
      return [{ key: `claim:${identity.id}`, value: cleanItem(row) }];
    });
  }

  function buildPutItem(key, value) {
    const descriptor = logicalKey(key);
    return { descriptor, item: withPhysicalKeys(descriptor, value) };
  }

  function buildTransactionRequests({ checks = [], puts = [], deletes = [] } = {}) {
    if (!Array.isArray(checks) || !Array.isArray(puts) || !Array.isArray(deletes)) {
      throw new TypeError('transaction inputs must be arrays');
    }

    const actions = new Map();
    const conditions = new Map();
    for (const check of checks) {
      if (!check || typeof check !== 'object') throw new TypeError('invalid transaction check');
      const descriptor = logicalKey(check.key);
      const id = physicalId(descriptor);
      if (conditions.has(id)) throw new TypeError('duplicate transaction check for one item');
      const condition = {
        descriptor,
        key: check.key,
        version: check.version,
        expression: Object.hasOwn(check, 'expectedReservation')
          ? expressionForExpectedReservation(descriptor, check.version, check.expectedReservation)
          : expressionForCheck(descriptor, check.version),
      };
      conditions.set(id, condition);
    }
    for (const put of puts) {
      if (!put || typeof put !== 'object') throw new TypeError('invalid transaction put');
      const descriptor = logicalKey(put.key);
      const id = physicalId(descriptor);
      if (actions.has(id)) throw new TypeError('duplicate transaction action for one item');
      const action = { kind: 'put', descriptor, key: put.key, value: put.value };
      actions.set(id, action);
    }
    for (const key of deletes) {
      const descriptor = logicalKey(key);
      const id = physicalId(descriptor);
      if (actions.has(id)) throw new TypeError('duplicate transaction action for one item');
      const action = { kind: 'delete', descriptor, key };
      actions.set(id, action);
    }

    const ids = new Set([...conditions.keys(), ...actions.keys()]);
    if (ids.size > MAX_TRANSACTION_ACTIONS) {
      throw new RangeError(`DynamoDB transaction exceeds ${MAX_TRANSACTION_ACTIONS} physical actions`);
    }
    const requests = [];
    for (const id of ids) {
      const action = actions.get(id);
      const condition = conditions.get(id);
      if (!action && !condition) continue;
      const descriptor = action?.descriptor ?? condition.descriptor;
      const TableName = tableNameFor(descriptor, tables);
      if (action?.kind === 'put') {
        const { item } = buildPutItem(action.key, action.value);
        requests.push({ Put: { TableName, Item: item, ...(condition?.expression ?? {}) } });
      } else if (action?.kind === 'delete') {
        requests.push({ Delete: { TableName, Key: descriptor.key, ...(condition?.expression ?? {}) } });
      } else if (condition) {
        requests.push({ ConditionCheck: { TableName, Key: descriptor.key, ...condition.expression } });
      }
    }
    return requests;
  }

  async function sendTransaction(transactItems) {
    if (transactItems.length === 0) return true;
    try {
      await documentClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
      return true;
    } catch (error) {
      if (conflictCancel(error)) return false;
      throw error;
    }
  }


  return {
    async get(key) {
      const descriptor = logicalKey(key);
      const result = await documentClient.send(new GetCommand({
        TableName: tableNameFor(descriptor, tables),
        Key: descriptor.key,
        ConsistentRead: true,
      }));
      const identityType = descriptor.type === 'editor' || descriptor.type === 'claimRef' || descriptor.type === 'claim'
        ? descriptor.type
        : undefined;
      return cleanItem(result?.Item, identityType ? {
        type: identityType,
        pk: descriptor.key.pk,
        sk: descriptor.key.sk,
      } : undefined);
    },

    list,
    getResources,
    getClaims,
    listOpenClaimsForAccount,

    measurePut(key, value) {
      const descriptor = logicalKey(key);
      const item = withPhysicalKeys(descriptor, value);
      return { itemBytes: dynamoDbItemSize(item) };
    },

    async transact(transaction = {}) {
      return sendTransaction(buildTransactionRequests(transaction));
    },
  };
}

export const creatorStoreInternals = Object.freeze({ logicalKey, withPhysicalKeys });

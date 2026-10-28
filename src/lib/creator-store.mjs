import { createHash } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';

const MAX_TRANSACTION_ACTIONS = 100;
const MAX_BATCH_GET_KEYS = 100;
const MAX_UNPROCESSED_RETRIES = 3;
const BATCH_GET_RETRY_DELAYS_MS = [10, 20, 40];

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
  if (key.startsWith('series:')) {
    const { profileId, id } = parseProfileAndId(key, 'series:', 'series');
    return {
      table: 'profiles',
      key: { pk: `PROFILE#${profileId}`, sk: `SERIES#${id}` },
      profileId,
      id,
      type: 'series',
    };
  }
  if (key.startsWith('placement:')) {
    const { profileId, id } = parseProfileAndId(key, 'placement:', 'placement');
    return { table: 'profiles', key: { pk: `PROFILE#${profileId}`, sk: `PLACEMENT#${id}` }, profileId, id, type: 'placement' };
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

function cleanItem(item) {
  if (!item) return null;
  const { pk: _pk, sk: _sk, ttl: _ttl, ...value } = item;
  return { ...value, version: value.version ?? 0 };
}

function conditionalCancel(error) {
  if (error?.name !== 'TransactionCanceledException' && error?.Code !== 'TransactionCanceledException') return false;
  const reasons = error.CancellationReasons ?? error.cancellationReasons;
  return Array.isArray(reasons) && reasons.some((reason) => reason?.Code === 'ConditionalCheckFailed');
}

function physicalId(descriptor) {
  return `${descriptor.table}\u0000${JSON.stringify(descriptor.key)}`;
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

function addPageCursor(parameters, cursor) {
  if (cursor !== undefined) parameters.ExclusiveStartKey = cursor;
  return parameters;
}

function profileProjection() {
  const fields = ['pk', 'sk', 'recordType', 'id', 'slug', 'displayName', 'city', 'country', 'programs', 'bio', 'socials', 'photo', 'published', 'hidden', 'version', 'createdAt', 'updatedAt'];
  const names = Object.fromEntries(fields.map((field, index) => [`#p${index}`, field]));
  return { ProjectionExpression: fields.map((_, index) => `#p${index}`).join(', '), ExpressionAttributeNames: names };
}

function placementProjection() {
  const fields = ['pk', 'sk', 'recordType', 'id', 'profileId', 'resourceId', 'position', 'featured', 'selectedForDirectory', 'series', 'version'];
  const names = Object.fromEntries(fields.map((field, index) => [`#p${index}`, field]));
  return { ProjectionExpression: fields.map((_, index) => `#p${index}`).join(', '), ExpressionAttributeNames: names };
}

function seriesProjection() {
  const fields = ['pk', 'sk', 'recordType', 'id', 'profileId', 'name', 'slug', 'description', 'version'];
  const names = Object.fromEntries(fields.map((field, index) => [`#s${index}`, field]));
  return { ProjectionExpression: fields.map((_, index) => `#s${index}`).join(', '), ExpressionAttributeNames: names };
}

function resourceProjection() {
  const fields = ['id', 'title', 'url', 'registrationUrl', 'description', 'category', 'kind', 'format', 'topics', 'order', 'featured', 'published', 'hidden', 'approvalRevoked', 'directoryControl', 'editorProfileId', 'autoSync', 'version', 'sourceId', 'recordType', 'addedAt', 'country', 'level', 'communityId', 'eventId', 'startsAt', 'endsAt', 'timeZone', 'organizer', 'mode', 'place', 'city', 'venueCountry'];
  const names = Object.fromEntries(fields.map((field, index) => [`#r${index}`, field]));
  return { ProjectionExpression: fields.map((_, index) => `#r${index}`).join(', '), ExpressionAttributeNames: names };
}

function claimProjection() {
  const fields = ['pk', 'sk', 'recordType', 'id', 'profileId', 'accountId', 'resourceIds', 'resources', 'sourceId', 'evidence', 'status', 'createdAt', 'updatedAt', 'version'];
  const names = Object.fromEntries(fields.map((field, index) => [`#c${index}`, field]));
  return { ProjectionExpression: fields.map((_, index) => `#c${index}`).join(', '), ExpressionAttributeNames: names };
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

  async function getResources(ids) {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id.length === 0)) {
      throw new TypeError('resource IDs must be a list of non-empty strings');
    }
    const uniqueIds = [...new Set(ids)];
    const resources = new Map();
    if (uniqueIds.length === 0) return resources;

    const projection = resourceProjection();
    for (let offset = 0; offset < uniqueIds.length; offset += MAX_BATCH_GET_KEYS) {
      const batchIds = uniqueIds.slice(offset, offset + MAX_BATCH_GET_KEYS);
      const expected = new Set(batchIds);
      let pendingKeys = batchIds.map((id) => ({ id }));
      let retries = 0;

      while (pendingKeys.length > 0) {
        const response = await documentClient.send(new BatchGetCommand({
          RequestItems: {
            [tables.catalog]: {
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
        if (rawResponses && Object.keys(rawResponses).some((table) => table !== tables.catalog)) {
          throw new Error('DynamoDB batch read returned an unexpected table');
        }
        const items = rawResponses?.[tables.catalog] ?? [];
        if (!Array.isArray(items)) throw new Error('DynamoDB batch read items are malformed');
        const requested = new Set(pendingKeys.map(({ id }) => id));
        for (const item of items) {
          if (!item || typeof item !== 'object' || Array.isArray(item)
            || typeof item.id !== 'string' || !requested.has(item.id) || !expected.has(item.id)
            || resources.has(item.id)) {
            throw new Error('DynamoDB batch read returned an unexpected or duplicate resource');
          }
          resources.set(item.id, cleanItem(item));
        }

        const rawUnprocessed = response.UnprocessedKeys;
        if (rawUnprocessed !== undefined && (!rawUnprocessed || typeof rawUnprocessed !== 'object' || Array.isArray(rawUnprocessed))) {
          throw new Error('DynamoDB batch read UnprocessedKeys is malformed');
        }
        if (rawUnprocessed && Object.keys(rawUnprocessed).some((table) => table !== tables.catalog)) {
          throw new Error('DynamoDB batch read returned an unexpected unprocessed table');
        }
        const unprocessed = rawUnprocessed?.[tables.catalog];
        if (unprocessed === undefined) break;
        if (!unprocessed || typeof unprocessed !== 'object' || Array.isArray(unprocessed) || !Array.isArray(unprocessed.Keys)) {
          throw new Error('DynamoDB batch read unprocessed keys are malformed');
        }
        if (unprocessed.Keys.length === 0) break;

        const seenKeys = new Set();
        for (const key of unprocessed.Keys) {
          if (!key || typeof key !== 'object' || Array.isArray(key)
            || typeof key.id !== 'string' || !requested.has(key.id) || seenKeys.has(key.id)) {
            throw new Error('DynamoDB batch read returned an invalid unprocessed key');
          }
          seenKeys.add(key.id);
        }
        if (retries >= MAX_UNPROCESSED_RETRIES) throw new Error('DynamoDB batch read exceeded unprocessed key retries');
        await new Promise((resolve) => setTimeout(resolve, BATCH_GET_RETRY_DELAYS_MS[retries]));
        retries += 1;
        pendingKeys = unprocessed.Keys;
      }
    }

    const missing = uniqueIds.filter((id) => !resources.has(id));
    if (missing.length > 0) throw new Error(`DynamoDB batch read is missing expected resources: ${missing.join(', ')}`);
    return resources;
  }

  function profileScan(prefix) {
    if (prefix === 'profile:') {
      const projection = profileProjection();
      return { table: tables.profiles, params: { ConsistentRead: true, ...projection } };
    }
    if (prefix === 'placement:') {
      const projection = placementProjection();
      return { table: tables.profiles, params: { ConsistentRead: true, ...projection } };
    }
    throw new TypeError(`unsupported profile scan prefix: ${prefix}`);
  }

  async function list(prefix, { includeStoredVersionPresence = false } = {}) {
    if (typeof prefix !== 'string') throw new TypeError('prefix must be a string');
    if (includeStoredVersionPresence && !/^placement:[^:]+:$/.test(prefix)) {
      throw new TypeError('stored version presence is available only for a profile placement query');
    }
    if (prefix.startsWith('series:') && prefix !== 'series:') {
      const match = prefix.match(/^series:([^:]+):$/);
      const profileId = match?.[1];
      if (!profileId) throw new TypeError('series query requires a profile ID and trailing separator');
      const projection = seriesProjection();
      const rows = await readPages(QueryCommand, tables.profiles, {
        ConsistentRead: true,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
        ExpressionAttributeValues: { ':pk': `PROFILE#${profileId}`, ':sk': 'SERIES#' },
        ...projection,
        ExpressionAttributeNames: { ...projection.ExpressionAttributeNames, '#pk': 'pk', '#sk': 'sk' },
      });
      return rows.map((row) => {
        const id = typeof row.sk === 'string' && row.sk.startsWith('SERIES#') ? row.sk.slice('SERIES#'.length) : '';
        return { key: `series:${profileId}:${id}`, value: cleanItem(row) };
      });
    }
    if (prefix.startsWith('placement:') && prefix !== 'placement:') {
      const match = prefix.match(/^placement:([^:]+):$/);
      const profileId = match?.[1];
      if (!profileId) throw new TypeError('placement query requires a profile ID and trailing separator');
      const projection = placementProjection();
      const rows = await readPages(QueryCommand, tables.profiles, {
        ConsistentRead: true,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
        ExpressionAttributeValues: { ':pk': `PROFILE#${profileId}`, ':sk': 'PLACEMENT#' },
        ...projection,
        ExpressionAttributeNames: { ...projection.ExpressionAttributeNames, '#pk': 'pk', '#sk': 'sk' },
      });
      return rows.map((row) => {
        const storedProfileId = typeof row.pk === 'string' && row.pk.startsWith('PROFILE#')
          ? row.pk.slice('PROFILE#'.length)
          : '';
        const placementId = typeof row.sk === 'string' && row.sk.startsWith('PLACEMENT#')
          ? row.sk.slice('PLACEMENT#'.length)
          : '';
        if (!storedProfileId || storedProfileId.includes(':') || !placementId || placementId.includes(':')) {
          throw new Error('DynamoDB placement query returned an invalid storage key');
        }
        return {
          key: `placement:${storedProfileId}:${placementId}`,
          value: cleanItem(row),
          ...(includeStoredVersionPresence ? { storedVersionPresent: Object.hasOwn(row, 'version') } : {}),
        };
      });
    }
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
      return rows.filter((row) => row.recordType === 'editorReference').map((row) => ({
        key: `editor:${row.profileId}:${row.resourceId}`,
        value: cleanItem(row),
      }));
    }
    if (prefix.startsWith('claim-ref:') && prefix !== 'claim-ref:') {
      const match = prefix.match(/^claim-ref:([^:]+):$/);
      const profileId = match?.[1];
      if (!profileId) throw new TypeError('claim reference query requires a profile ID and trailing separator');
      const rows = await readPages(QueryCommand, tables.profiles, {
        ConsistentRead: true,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :sk)',
        ExpressionAttributeValues: { ':pk': `PROFILE#${profileId}`, ':sk': 'CLAIM#' },
        ProjectionExpression: '#pk, #sk, #id, #version',
        ExpressionAttributeNames: { '#pk': 'pk', '#sk': 'sk', '#id': 'id', '#version': 'version' },
      });
      return rows.filter((row) => typeof row.id === 'string').map((row) => ({
        key: `claim-ref:${profileId}:${row.id}`,
        value: cleanItem(row),
      }));
    }
    if (prefix === 'profile:' || prefix === 'placement:') {
      const { table, params } = profileScan(prefix);
      const rows = await readPages(ScanCommand, table, params);
      if (prefix === 'profile:') return rows.filter((row) => row.recordType === 'profile' && typeof row.id === 'string')
        .map((row) => ({ key: `profile:${row.id}`, value: cleanItem(row) }));
      return rows.filter((row) => row.recordType === 'placement' && typeof row.profileId === 'string' && typeof row.id === 'string')
        .map((row) => ({ key: `placement:${row.profileId}:${row.id}`, value: cleanItem(row) }));
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
      return rows.filter((row) => row.recordType === 'claim').map((row) => ({ key: `claim:${row.id}`, value: cleanItem(row) }));
    }
    throw new TypeError(`unsupported logical list prefix: ${prefix}`);
  }

  return {
    async get(key) {
      const descriptor = logicalKey(key);
      const result = await documentClient.send(new GetCommand({
        TableName: tableNameFor(descriptor, tables),
        Key: descriptor.key,
        ConsistentRead: true,
      }));
      return cleanItem(result?.Item);
    },

    list,
    getResources,

    async transact({ checks = [], puts = [], deletes = [] } = {}) {
      if (!Array.isArray(checks) || !Array.isArray(puts) || !Array.isArray(deletes)) throw new TypeError('transaction inputs must be arrays');
      const actions = new Map();
      const conditions = new Map();
      for (const check of checks) {
        if (!check || typeof check !== 'object') throw new TypeError('invalid transaction check');
        const descriptor = logicalKey(check.key);
        const id = physicalId(descriptor);
        if (conditions.has(id)) throw new TypeError('duplicate transaction check for one item');
        conditions.set(id, { descriptor, expression: expressionForCheck(descriptor, check.version) });
      }
      for (const put of puts) {
        if (!put || typeof put !== 'object') throw new TypeError('invalid transaction put');
        const descriptor = logicalKey(put.key);
        const id = physicalId(descriptor);
        if (actions.has(id)) throw new TypeError('duplicate transaction action for one item');
        actions.set(id, { kind: 'put', descriptor, value: put.value });
      }
      for (const key of deletes) {
        const descriptor = logicalKey(key);
        const id = physicalId(descriptor);
        if (actions.has(id)) throw new TypeError('duplicate transaction action for one item');
        actions.set(id, { kind: 'delete', descriptor });
      }

      const ids = new Set([...conditions.keys(), ...actions.keys()]);
      if (ids.size > MAX_TRANSACTION_ACTIONS) throw new RangeError(`DynamoDB transaction exceeds ${MAX_TRANSACTION_ACTIONS} physical actions`);
      const transactItems = [];
      for (const id of ids) {
        const action = actions.get(id);
        const condition = conditions.get(id);
        if (!action && !condition) continue;
        const descriptor = action?.descriptor ?? condition.descriptor;
        const TableName = tableNameFor(descriptor, tables);
        if (action?.kind === 'put') {
          const item = withPhysicalKeys(descriptor, action.value);
          const conditionInput = condition ? expressionForCheck(descriptor, [...checks].find((entry) => physicalId(logicalKey(entry.key)) === id).version) : {};
          transactItems.push({ Put: { TableName, Item: item, ...conditionInput } });
        } else if (action?.kind === 'delete') {
          const conditionInput = condition ? expressionForCheck(descriptor, [...checks].find((entry) => physicalId(logicalKey(entry.key)) === id).version) : {};
          transactItems.push({ Delete: { TableName, Key: descriptor.key, ...conditionInput } });
        } else if (condition) {
          transactItems.push({ ConditionCheck: { TableName, Key: descriptor.key, ...condition.expression } });
        }
      }
      if (transactItems.length === 0) return true;
      try {
        await documentClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
        return true;
      } catch (error) {
        if (conditionalCancel(error)) return false;
        throw error;
      }
    },
  };
}

export const creatorStoreInternals = Object.freeze({ logicalKey, sha256, MAX_TRANSACTION_ACTIONS });

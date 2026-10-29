import { currentUrlReservation, currentUrlReservationId } from './catalog-url.mjs';
import { isCatalogResourceIdWithinLimit, validateCatalogUrl } from './catalog.mjs';

/**
 * Atomically add a catalog item and its reservation for its current literal URL.
 * Existing IDs are deliberately left untouched so import reruns cannot restore
 * an old URL or approval state.
 */
export async function putCatalogResourceOnce({ tableName, item, getItem, transactWrite }) {
  if (typeof tableName !== 'string' || tableName.trim() === '') {
    throw new Error('Catalog resource write requires a table name');
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)
      || typeof item.id !== 'string' || item.id.length === 0
      || typeof item.url !== 'string' || item.url.length === 0) {
    throw new TypeError('Catalog resource write requires an ID and current URL');
  }
  if (!isCatalogResourceIdWithinLimit(item.id)) {
    throw new TypeError('Catalog resource ID must be at most 256 UTF-8 bytes');
  }
  validateCatalogUrl(item.url);
  if (typeof getItem !== 'function' || typeof transactWrite !== 'function') {
    throw new TypeError('Catalog resource write requires read and transaction operations');
  }

  const resource = { ...item, version: 1 };
  const reservationId = currentUrlReservationId(resource.url);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existingResource = await readItem(getItem, tableName, resource.id, ['id']);
    if (existingResource) return { status: 'id-exists' };

    const existingReservation = await readItem(
      getItem,
      tableName,
      reservationId,
      ['id', 'recordType', 'url', 'status', 'version', 'resourceId', 'resourceIds'],
    );
    const reservationStatus = await classifyPersistedReservation({
      item: existingReservation,
      requestedUrl: resource.url,
      resourceId: resource.id,
      tableName,
      getItem,
    });
    if (reservationStatus) return { status: reservationStatus.status, resourceIds: reservationStatus.resourceIds };

    const reservation = currentUrlReservation(resource.url, resource.id);
    try {
      await transactWrite({
        TransactItems: [
          {
            Put: {
              TableName: tableName,
              Item: resource,
              ConditionExpression: 'attribute_not_exists(#id)',
              ExpressionAttributeNames: { '#id': 'id' },
            },
          },
          {
            Put: {
              TableName: tableName,
              Item: reservation,
              ConditionExpression: 'attribute_not_exists(#id)',
              ExpressionAttributeNames: { '#id': 'id' },
            },
          },
        ],
      });
      return { status: 'created', item: resource };
    } catch (error) {
      if (!isConditionalTransactionConflict(error)) throw error;
      // A competing write may have won either the ID or URL. Re-read both
      // deterministic keys before deciding whether this is a duplicate.
      if (attempt === 1) throw error;
    }
  }

  throw new Error('Catalog resource write could not settle after a conditional conflict');
}

export function classifyReservation(item, requestedUrl, resourceId) {
  if (!item) return undefined;
  if (item.recordType !== 'urlReservation' || item.url !== requestedUrl || item.version !== 1) {
    throw new Error('Catalog URL reservation is inconsistent with its key');
  }
  if (item.status === 'reserved' && typeof item.resourceId === 'string' && item.resourceId.length > 0) {
    if (item.resourceId === resourceId) {
      throw new Error('Catalog URL reservation points to a missing resource');
    }
    return { status: 'duplicate', resourceIds: [item.resourceId] };
  }
  if (item.status === 'collision' && Array.isArray(item.resourceIds)
      && item.resourceIds.length >= 2
      && item.resourceIds.every((id) => typeof id === 'string' && id.length > 0)
      && new Set(item.resourceIds).size === item.resourceIds.length) {
    return { status: 'collision', resourceIds: [...item.resourceIds] };
  }
  throw new Error('Catalog URL reservation is malformed');
}

async function classifyPersistedReservation({ item, requestedUrl, resourceId, tableName, getItem }) {
  const reservationStatus = classifyReservation(item, requestedUrl, resourceId);
  if (!reservationStatus) return undefined;

  for (const referencedId of reservationStatus.resourceIds) {
    const referenced = await readItem(getItem, tableName, referencedId, ['id', 'recordType', 'url', 'registrationUrl']);
    const currentUrl = referenced?.recordType === 'event'
      ? referenced.registrationUrl
      : referenced?.url;
    if (currentUrl !== requestedUrl) {
      throw new Error(`Catalog URL reservation for ${requestedUrl} points to a missing or inconsistent resource`);
    }
  }

  return reservationStatus;
}

export function isConditionalTransactionConflict(error) {
  if (error?.name === 'ConditionalCheckFailedException'
      || error?.code === 'ConditionalCheckFailedException'
      || error?.name === 'TransactionConflictException'
      || error?.code === 'TransactionConflictException') return true;
  if (error?.name !== 'TransactionCanceledException' && error?.code !== 'TransactionCanceledException') return false;
  const reasons = error?.CancellationReasons;
  return Array.isArray(reasons)
    ? reasons.some((reason) => reason?.Code === 'ConditionalCheckFailed' || reason?.Code === 'TransactionConflict')
    : true;
}

export async function createDynamoCatalogAccess({ region, docClient }) {
  const { GetCommand, TransactWriteCommand } = await import('@aws-sdk/lib-dynamodb');
  let client = docClient;
  if (!client) {
    const [{ DynamoDBClient }, { DynamoDBDocumentClient }] = await Promise.all([
      import('@aws-sdk/client-dynamodb'),
      import('@aws-sdk/lib-dynamodb'),
    ]);
    client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }
  return {
    getItem: (params) => client.send(new GetCommand(params)),
    transactWrite: (params) => client.send(new TransactWriteCommand(params)),
  };
}

async function readItem(getItem, tableName, id, fields) {
  const ExpressionAttributeNames = Object.fromEntries(fields.map((field, index) => [`#field${index}`, field]));
  const ProjectionExpression = fields.map((_field, index) => `#field${index}`).join(',');
  const result = await getItem({
    TableName: tableName,
    Key: { id },
    ConsistentRead: true,
    ProjectionExpression,
    ExpressionAttributeNames,
  });
  if (!result || (result.Item !== undefined && (!result.Item || typeof result.Item !== 'object'))) {
    throw new Error('Catalog item read returned a malformed result');
  }
  return result.Item ?? null;
}

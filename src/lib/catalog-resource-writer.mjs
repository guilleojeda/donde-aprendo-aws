import {
  currentUrlReservation,
  currentUrlReservationId,
  decodeCurrentUrlReservation,
} from './catalog-url.mjs';
import { isCatalogResourceIdWithinLimit } from './catalog-identity.mjs';
import { validateCatalogUrl } from './catalog.mjs';

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
    try {
      const existingResource = await readItem(getItem, tableName, resource.id, ['id']);
      if (existingResource) {
        if (existingResource.id !== resource.id) throw new Error('Catalog resource has an inconsistent physical identity');
        return { status: 'id-exists' };
      }

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
    } catch (error) {
      // A member can move after the reservation read. Re-observe the whole
      // candidate/reservation/member set once before treating the observation
      // as a stable integrity failure. The reservation shape itself remains a
      // hard failure because a malformed row cannot safely authorize a write.
      if (!(error instanceof CatalogObservationError) || attempt === 1) throw error;
      continue;
    }

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
  const reservation = decodeCurrentUrlReservation(item, requestedUrl);
  if (reservation.status === 'reserved') {
    if (reservation.resourceIds[0] === resourceId) {
      throw new CatalogObservationError('Catalog URL reservation points to a missing resource');
    }
    return { status: 'duplicate', resourceIds: reservation.resourceIds };
  }
  return reservation;
}

async function classifyPersistedReservation({ item, requestedUrl, resourceId, tableName, getItem }) {
  const reservationStatus = classifyReservation(item, requestedUrl, resourceId);
  if (!reservationStatus) return undefined;

  for (const referencedId of reservationStatus.resourceIds) {
    const referenced = await readItem(getItem, tableName, referencedId, ['id', 'recordType', 'url', 'registrationUrl']);
    const currentUrl = referenced?.recordType === 'event'
      ? referenced.registrationUrl
      : referenced?.url;
    if (referenced?.id !== referencedId || currentUrl !== requestedUrl
        || (referenced.recordType !== undefined && referenced.recordType !== 'event')) {
      throw new CatalogObservationError(
        `Catalog URL reservation for ${requestedUrl} points to a missing or inconsistent resource`,
      );
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
  if (!Array.isArray(reasons) || reasons.length === 0) return false;
  let definiteConflict = false;
  for (const reason of reasons) {
    const code = reason?.Code;
    if (code === 'ConditionalCheckFailed' || code === 'TransactionConflict') {
      definiteConflict = true;
      continue;
    }
    if (code === 'None') continue;
    // Any unknown or operational cancellation reason makes the write result
    // uncertain. Do not replay an operation whose commit is not established.
    return false;
  }
  return definiteConflict;
}

export async function createDynamoCatalogAccess({ region, docClient }) {
  const { GetCommand, TransactWriteCommand } = await import('@aws-sdk/lib-dynamodb');
  let client = docClient;
  if (!client) {
    const [{ DynamoDBClient }, { DynamoDBDocumentClient }] = await Promise.all([
      import('@aws-sdk/client-dynamodb'),
      import('@aws-sdk/lib-dynamodb'),
    ]);
    client = DynamoDBDocumentClient.from(new DynamoDBClient({ region, maxAttempts: 1 }));
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
  if (!result || typeof result !== 'object' || Array.isArray(result) || (result.Item !== undefined
    && (!result.Item || typeof result.Item !== 'object' || Array.isArray(result.Item)))) {
    throw new Error('Catalog item read returned a malformed result');
  }
  return result.Item ?? null;
}

class CatalogObservationError extends Error {}

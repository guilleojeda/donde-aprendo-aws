import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

// The envelope was intentionally kept at version 1. The rollout boundary is
// the physical v2 key, not a second JSON envelope format.
const SCHEMA_VERSION = 1;
const V2 = 2;
const CACHE_RECORD = 'analyticsCache';

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required`);
  return value.trim();
}

function normalizeKey(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('statistics cache key must be an object');
  }
  const profileId = requiredString(value.profileId, 'profileId');
  if (value.profileId !== profileId) throw new TypeError('profileId must not have surrounding whitespace');
  if (value.period !== 7 && value.period !== 30) throw new TypeError('period must be 7 or 30');

  // The old adapter accepted { page } and all existing detail callers still
  // use that form. A key without a page is the new summary key.
  const kind = value.kind ?? (Object.hasOwn(value, 'page') ? 'page' : 'summary');
  if (kind !== 'summary' && kind !== 'period' && kind !== 'page') {
    throw new TypeError('statistics cache kind is invalid');
  }
  if (kind !== 'page' && Object.hasOwn(value, 'page')) {
    throw new TypeError('summary and period cache keys must not include page');
  }
  const page = kind === 'page' ? (value.page ?? 1) : undefined;
  if (kind === 'page' && (!Number.isSafeInteger(page) || page < 1)) {
    throw new TypeError('page must be a positive integer');
  }
  return { profileId, period: value.period, kind, ...(kind === 'page' ? { page } : {}) };
}

function sameIdentity(report, key) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  if (report.creatorId !== key.profileId || report.period !== key.period) return false;
  return key.kind !== 'page' || report.page === key.page;
}

function validEnvelope(envelope, key) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
    || envelope.schemaVersion !== SCHEMA_VERSION
    || !sameIdentity(envelope.report, key)
    || !Number.isSafeInteger(envelope.updatedAt)
    || !Number.isSafeInteger(envelope.expiresAt)
    || !Number.isSafeInteger(envelope.retainUntil)
    || envelope.updatedAt < 0
    || envelope.expiresAt < envelope.updatedAt
    || envelope.retainUntil < envelope.expiresAt) {
    throw new TypeError('invalid creator statistics cache envelope');
  }
  return envelope;
}

function isConditionalConflict(error) {
  return error?.name === 'ConditionalCheckFailedException'
    || error?.code === 'ConditionalCheckFailedException'
    || error?.Code === 'ConditionalCheckFailedException';
}

function conditionalError(error) {
  if (isConditionalConflict(error)) {
    const conflict = new Error('creator statistics cache predecessor changed');
    conflict.name = 'CreatorStatisticsCacheConflict';
    conflict.code = 'CREATOR_STATISTICS_CACHE_CONFLICT';
    conflict.conditionalConflict = true;
    conflict.cause = error;
    return conflict;
  }
  return error;
}

export function createCreatorStatisticsStore({ profilesTableName, propertyId, region, client } = {}) {
  const tableName = requiredString(profilesTableName, 'profilesTableName');
  const analyticsPropertyId = requiredString(propertyId, 'propertyId');
  const documentClient = client ?? DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: region ?? process.env.AWS_REGION ?? 'us-east-1' }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  if (!documentClient || typeof documentClient.send !== 'function') throw new TypeError('client must implement send');

  function physicalKey(value, version = V2) {
    const key = normalizeKey(value);
    const suffix = key.kind === 'summary'
      ? `${key.period}#summary`
      : key.kind === 'period'
        ? `${key.period}#period`
        : `${key.period}#page#${key.page}`;
    return {
      ...key,
      propertyId: analyticsPropertyId,
      pk: `ANALYTICS#${key.profileId}`,
      sk: version === 1
        ? `GA4#${analyticsPropertyId}#v1#${key.period}#${key.page ?? 1}`
        : `GA4#${analyticsPropertyId}#v2#${suffix}`,
    };
  }

  async function readPhysical(value, version) {
    const key = physicalKey(value, version);
    const result = await documentClient.send(new GetCommand({
      TableName: tableName,
      Key: { pk: key.pk, sk: key.sk },
      ConsistentRead: true,
    }));
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('malformed creator statistics cache response');
    }
    if (!Object.hasOwn(result, 'Item')) return undefined;
    const item = result.Item;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { invalid: true };
    }

    // Keep malformed rows observable to the cache service. Returning an empty
    // value here would turn a failed/invalid read into write authority.
    if (item.pk !== key.pk
      || item.sk !== key.sk
      || item.recordType !== CACHE_RECORD
      || item.profileId !== key.profileId
      || item.propertyId !== key.propertyId
      || item.period !== key.period
      || (key.kind === 'page' && item.page !== key.page)
      || (version === V2 && item.kind !== key.kind)) {
      return {
        schemaVersion: item.schemaVersion,
        report: item.report,
        updatedAt: item.updatedAt,
        expiresAt: item.expiresAt,
        retainUntil: item.retainUntil,
        revision: item.revision,
        invalid: true,
      };
    }
    return {
      schemaVersion: item.schemaVersion,
      report: item.report,
      updatedAt: item.updatedAt,
      expiresAt: item.expiresAt,
      retainUntil: item.retainUntil,
      ...(version === V2 ? { revision: item.revision } : {}),
    };
  }

  return {
    async get(value) {
      return readPhysical(value, V2);
    },

    // V1 is deliberately read-only. It is consulted only after a v2/provider
    // miss and never supplies an expected revision for a v2 write.
    async readLegacy(value) {
      return readPhysical(value, 1);
    },

    async put(value, envelope, expectedRevision) {
      const key = physicalKey(value, V2);
      const valid = validEnvelope(envelope, key);
      if (expectedRevision !== undefined
        && (typeof expectedRevision !== 'string' || expectedRevision.trim() === '')) {
        throw new TypeError('expectedRevision must be a non-empty string');
      }
      const revision = randomUUID();
      const item = {
        pk: key.pk,
        sk: key.sk,
        recordType: CACHE_RECORD,
        profileId: key.profileId,
        propertyId: key.propertyId,
        period: key.period,
        ...(key.kind === 'page' ? { page: key.page } : {}),
        kind: key.kind,
        revision,
        schemaVersion: valid.schemaVersion,
        report: valid.report,
        updatedAt: valid.updatedAt,
        expiresAt: valid.expiresAt,
        retainUntil: valid.retainUntil,
        ttl: Math.ceil(valid.retainUntil / 1000),
      };
      const names = {};
      const values = {};
      let condition;
      if (expectedRevision === undefined) {
        names['#pk'] = 'pk';
        condition = 'attribute_not_exists(#pk)';
      } else {
        names['#revision'] = 'revision';
        values[':expectedRevision'] = expectedRevision;
        condition = '#revision = :expectedRevision';
      }
      try {
        await documentClient.send(new PutCommand({
          TableName: tableName,
          Item: item,
          ConditionExpression: condition,
          ExpressionAttributeNames: names,
          ...(expectedRevision === undefined ? {} : { ExpressionAttributeValues: values }),
        }));
      } catch (error) {
        throw conditionalError(error);
      }
      return revision;
    },
  };
}

export { SCHEMA_VERSION as CREATOR_STATISTICS_CACHE_SCHEMA_VERSION };

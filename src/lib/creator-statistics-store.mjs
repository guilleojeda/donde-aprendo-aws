import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

const SCHEMA_VERSION = 1;

function requiredString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${name} is required`);
  return value.trim();
}

function cacheKey(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('statistics cache key must be an object');
  const profileId = requiredString(value.profileId, 'profileId');
  if (value.profileId !== profileId) throw new TypeError('profileId must not have surrounding whitespace');
  if (value.period !== 7 && value.period !== 30) throw new TypeError('period must be 7 or 30');
  const page = value.page ?? 1;
  if (!Number.isSafeInteger(page) || page < 1) throw new TypeError('page must be a positive integer');
  return { profileId, period: value.period, page };
}

function sameIdentity(report, key) {
  return report && typeof report === 'object' && !Array.isArray(report)
    && report.creatorId === key.profileId
    && report.period === key.period
    && report.page === key.page;
}

function requireEnvelope(envelope, key) {
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

export function createCreatorStatisticsStore({ profilesTableName, propertyId, region, client } = {}) {
  const tableName = requiredString(profilesTableName, 'profilesTableName');
  const analyticsPropertyId = requiredString(propertyId, 'propertyId');
  const documentClient = client ?? DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: region ?? process.env.AWS_REGION ?? 'us-east-1' }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  if (!documentClient || typeof documentClient.send !== 'function') throw new TypeError('client must implement send');

  function physicalKey(value) {
    const key = cacheKey(value);
    return {
      ...key,
      propertyId: analyticsPropertyId,
      pk: `ANALYTICS#${key.profileId}`,
      sk: `GA4#${analyticsPropertyId}#v${SCHEMA_VERSION}#${key.period}#${key.page}`,
    };
  }

  return {
    async get(value) {
      const key = physicalKey(value);
      const result = await documentClient.send(new GetCommand({
        TableName: tableName,
        Key: { pk: key.pk, sk: key.sk },
      }));
      const item = result?.Item;
      if (!item || item.recordType !== 'analyticsCache'
        || item.profileId !== key.profileId
        || item.propertyId !== key.propertyId
        || item.period !== key.period
        || item.page !== key.page) return undefined;
      return {
        schemaVersion: item.schemaVersion,
        report: item.report,
        updatedAt: item.updatedAt,
        expiresAt: item.expiresAt,
        retainUntil: item.retainUntil,
      };
    },

    async put(value, envelope) {
      const key = physicalKey(value);
      const valid = requireEnvelope(envelope, key);
      await documentClient.send(new PutCommand({
        TableName: tableName,
        Item: {
          pk: key.pk,
          sk: key.sk,
          recordType: 'analyticsCache',
          profileId: key.profileId,
          propertyId: key.propertyId,
          period: key.period,
          page: key.page,
          schemaVersion: valid.schemaVersion,
          report: valid.report,
          updatedAt: valid.updatedAt,
          expiresAt: valid.expiresAt,
          retainUntil: valid.retainUntil,
          ttl: Math.ceil(valid.retainUntil / 1000),
        },
      }));
    },
  };
}

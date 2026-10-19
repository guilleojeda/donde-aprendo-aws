import { createHash } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

function hash(value) {
  return createHash('sha256').update(value).digest('base64url');
}

function validateIdentity(identity) {
  if (!identity || typeof identity.issuer !== 'string' || identity.issuer.length === 0
    || typeof identity.sub !== 'string' || identity.sub.length === 0) {
    throw new TypeError('identity requires an issuer and subject');
  }
}

function conditionalFailure(error) {
  return error?.name === 'ConditionalCheckFailedException'
    || error?.Code === 'ConditionalCheckFailedException';
}

function withoutKeys(item) {
  if (!item) return null;
  const { pk, ttl, ...record } = item;
  return record;
}

function withTtl(key, record) {
  if (!Number.isFinite(record?.expiresAt) || record.expiresAt < 0) {
    throw new TypeError('record requires a finite expiration time');
  }
  return { ...record, pk: key, ttl: Math.ceil(record.expiresAt / 1000) };
}

export function createAccountStore({ tableName, region, client } = {}) {
  if (typeof tableName !== 'string' || tableName.trim() === '') throw new TypeError('tableName is required');
  const documentClient = client ?? DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: region ?? process.env.AWS_REGION ?? 'us-east-1' }),
    { marshallOptions: { removeUndefinedValues: true } },
  );
  if (!documentClient || typeof documentClient.send !== 'function') throw new TypeError('client must implement send');

  function accountKey(identity) {
    validateIdentity(identity);
    return `ACCOUNT#${hash(JSON.stringify([identity.issuer, identity.sub]))}`;
  }

  return {
    async putLoginAttempt(key, attempt) {
      if (typeof key !== 'string' || !key.startsWith('ATTEMPT#')) throw new TypeError('invalid login attempt key');
      try {
        await documentClient.send(new PutCommand({
          TableName: tableName,
          Item: withTtl(key, attempt),
          ConditionExpression: 'attribute_not_exists(pk)',
        }));
        return true;
      } catch (error) {
        if (conditionalFailure(error)) return false;
        throw error;
      }
    },

    async takeLoginAttempt(key) {
      if (typeof key !== 'string' || !key.startsWith('ATTEMPT#')) throw new TypeError('invalid login attempt key');
      try {
        const result = await documentClient.send(new DeleteCommand({
          TableName: tableName,
          Key: { pk: key },
          ConditionExpression: 'attribute_exists(pk)',
          ReturnValues: 'ALL_OLD',
        }));
        return withoutKeys(result.Attributes);
      } catch (error) {
        if (conditionalFailure(error)) return null;
        throw error;
      }
    },

    async ensureAccount(identity, email) {
      const key = accountKey(identity);
      const names = {
        '#identity': 'identity',
        '#active': 'active',
        '#epoch': 'epoch',
        '#authValidAfter': 'authValidAfter',
        '#email': 'email',
      };
      const values = {
        ':identity': identity,
        ':active': true,
        ':zero': 0,
      };
      let updateExpression = 'SET #identity = if_not_exists(#identity, :identity), #active = if_not_exists(#active, :active), #epoch = if_not_exists(#epoch, :zero), #authValidAfter = if_not_exists(#authValidAfter, :zero)';
      if (typeof email === 'string' && email.length > 0) {
        updateExpression += ', #email = :email';
        values[':email'] = email;
      }
      const result = await documentClient.send(new UpdateCommand({
        TableName: tableName,
        Key: { pk: key },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }));
      return withoutKeys(result.Attributes);
    },

    async getAccount(identity) {
      const result = await documentClient.send(new GetCommand({
        TableName: tableName,
        Key: { pk: accountKey(identity) },
        ConsistentRead: true,
      }));
      return withoutKeys(result.Item);
    },

    async advanceAuthBoundary(identity, atMs) {
      if (!Number.isFinite(atMs) || atMs < 0) throw new TypeError('atMs must be a finite timestamp');
      const key = accountKey(identity);
      try {
        await documentClient.send(new UpdateCommand({
          TableName: tableName,
          Key: { pk: key },
          UpdateExpression: 'SET #identity = if_not_exists(#identity, :identity), #active = if_not_exists(#active, :active), #epoch = if_not_exists(#epoch, :zero) + :one, #authValidAfter = :atMs',
          ConditionExpression: 'attribute_not_exists(#authValidAfter) OR #authValidAfter < :atMs',
          ExpressionAttributeNames: {
            '#identity': 'identity',
            '#active': 'active',
            '#epoch': 'epoch',
            '#authValidAfter': 'authValidAfter',
          },
          ExpressionAttributeValues: {
            ':identity': identity,
            ':active': true,
            ':zero': 0,
            ':one': 1,
            ':atMs': atMs,
          },
        }));
      } catch (error) {
        if (!conditionalFailure(error)) throw error;
      }
    },

    async putSession(key, session) {
      if (typeof key !== 'string' || !key.startsWith('SESSION#')) throw new TypeError('invalid session key');
      try {
        await documentClient.send(new PutCommand({
          TableName: tableName,
          Item: withTtl(key, session),
          ConditionExpression: 'attribute_not_exists(pk)',
        }));
        return true;
      } catch (error) {
        if (conditionalFailure(error)) return false;
        throw error;
      }
    },

    async getSession(key) {
      if (typeof key !== 'string' || !key.startsWith('SESSION#')) throw new TypeError('invalid session key');
      const result = await documentClient.send(new GetCommand({
        TableName: tableName,
        Key: { pk: key },
        ConsistentRead: true,
      }));
      return withoutKeys(result.Item);
    },

    async deleteSession(key) {
      if (typeof key !== 'string' || !key.startsWith('SESSION#')) throw new TypeError('invalid session key');
      await documentClient.send(new DeleteCommand({ TableName: tableName, Key: { pk: key } }));
    },
  };
}

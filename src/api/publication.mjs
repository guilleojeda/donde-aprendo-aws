import { AmplifyClient, GetJobCommand, ListJobsCommand, StartJobCommand } from '@aws-sdk/client-amplify';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { loadCatalog } from '../lib/catalog.mjs';
import { readPublishedCatalogHash, synchronizePublication, withPublicationLock } from '../lib/publication.mjs';

export const PUBLICATION_STATE_ID = '__system#publication';

export async function handler() {
  const tableName = requiredEnvironment('CATALOG_TABLE');
  const appId = requiredEnvironment('AMPLIFY_APP_ID');
  const branchName = requiredEnvironment('AMPLIFY_BRANCH');
  const manifestUrl = requiredEnvironment('PUBLICATION_MANIFEST_URL');
  const region = process.env.AWS_REGION || 'us-east-1';
  const catalog = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const amplify = new AmplifyClient({ region });

  const lockToken = randomUUID();
  const result = await withPublicationLock({
    acquire: async () => {
      const now = Math.floor(Date.now() / 1000);
      try {
        await catalog.send(new UpdateCommand({
          TableName: tableName,
          Key: { id: PUBLICATION_STATE_ID },
          UpdateExpression: 'SET lockToken = :token, lockUntil = :until',
          ConditionExpression: 'attribute_not_exists(lockUntil) OR lockUntil < :now',
          ExpressionAttributeValues: { ':token': lockToken, ':until': now + 90, ':now': now },
        }));
        return true;
      } catch (error) {
        if (error?.name === 'ConditionalCheckFailedException') return false;
        throw error;
      }
    },
    release: async () => {
      await catalog.send(new UpdateCommand({
        TableName: tableName,
        Key: { id: PUBLICATION_STATE_ID },
        UpdateExpression: 'REMOVE lockToken, lockUntil',
        ConditionExpression: 'lockToken = :token',
        ExpressionAttributeValues: { ':token': lockToken },
      }));
    },
    run: () => synchronizePublication({
      loadPublicCatalog: () => loadCatalog({
        tableName,
        creatorTableName: process.env.CREATOR_PROFILES_TABLE,
        region,
        docClient: catalog,
      }),
      readPublishedHash: () => readPublishedCatalogHash({ manifestUrl }),
      readState: async () => {
        const { Item } = await catalog.send(new GetCommand({
          TableName: tableName,
          Key: { id: PUBLICATION_STATE_ID },
          ConsistentRead: true,
        }));
        return Item;
      },
      markStarted: async (jobId) => {
        await catalog.send(new UpdateCommand({
          TableName: tableName,
          Key: { id: PUBLICATION_STATE_ID },
          UpdateExpression: 'SET pendingJobId = :jobId REMOVE publishedHash, pendingHash, lastFailureJobId, lastFailureStatus',
          ConditionExpression: 'attribute_not_exists(pendingJobId)',
          ExpressionAttributeValues: { ':jobId': jobId },
        }));
      },
      markSucceeded: async (jobId) => {
        await catalog.send(new UpdateCommand({
          TableName: tableName,
          Key: { id: PUBLICATION_STATE_ID },
          UpdateExpression: 'REMOVE pendingJobId, publishedHash, pendingHash',
          ConditionExpression: 'pendingJobId = :jobId',
          ExpressionAttributeValues: { ':jobId': jobId },
        }));
      },
      markFailed: async (jobId, status) => {
        await catalog.send(new UpdateCommand({
          TableName: tableName,
          Key: { id: PUBLICATION_STATE_ID },
          UpdateExpression: 'SET lastFailureJobId = :jobId, lastFailureStatus = :status REMOVE pendingJobId, publishedHash, pendingHash',
          ConditionExpression: 'pendingJobId = :jobId',
          ExpressionAttributeValues: { ':jobId': jobId, ':status': status },
        }));
      },
      getJob: async (jobId) => {
        const { job } = await amplify.send(new GetJobCommand({ appId, branchName, jobId }));
        return job?.summary;
      },
      listJobs: async () => {
        const { jobSummaries } = await amplify.send(new ListJobsCommand({ appId, branchName, maxResults: 20 }));
        return jobSummaries;
      },
      startJob: async (hash) => {
        const { jobSummary } = await amplify.send(new StartJobCommand({
          appId,
          branchName,
          jobType: 'RELEASE',
          jobReason: `Approved catalog changed: ${hash.slice(0, 12)}`,
        }));
        return jobSummary;
      },
    }),
  });
  console.info(JSON.stringify({ publication: result }));
  return result;
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured`);
  return value;
}

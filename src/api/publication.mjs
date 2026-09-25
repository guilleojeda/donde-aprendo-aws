import { AmplifyClient, GetJobCommand, ListJobsCommand, StartJobCommand } from '@aws-sdk/client-amplify';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { loadCatalog } from '../lib/catalog.mjs';
import { synchronizePublication } from '../lib/publication.mjs';

export const PUBLICATION_STATE_ID = '__system#publication';

export async function handler() {
  const tableName = requiredEnvironment('CATALOG_TABLE');
  const appId = requiredEnvironment('AMPLIFY_APP_ID');
  const branchName = requiredEnvironment('AMPLIFY_BRANCH');
  const region = process.env.AWS_REGION || 'us-east-1';
  const catalog = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  const amplify = new AmplifyClient({ region });

  const result = await synchronizePublication({
    loadPublicCatalog: () => loadCatalog({ tableName, region, docClient: catalog }),
    readState: async () => {
      const { Item } = await catalog.send(new GetCommand({
        TableName: tableName,
        Key: { id: PUBLICATION_STATE_ID },
        ConsistentRead: true,
      }));
      return Item;
    },
    markStarted: async (jobId, hash) => {
      await catalog.send(new UpdateCommand({
        TableName: tableName,
        Key: { id: PUBLICATION_STATE_ID },
        UpdateExpression: 'SET pendingJobId = :jobId, pendingHash = :hash REMOVE lastFailureJobId, lastFailureStatus',
        ConditionExpression: 'attribute_not_exists(pendingJobId)',
        ExpressionAttributeValues: { ':jobId': jobId, ':hash': hash },
      }));
    },
    markSucceeded: async (jobId, hash) => {
      await catalog.send(new UpdateCommand({
        TableName: tableName,
        Key: { id: PUBLICATION_STATE_ID },
        UpdateExpression: 'SET publishedHash = :hash REMOVE pendingJobId, pendingHash',
        ConditionExpression: 'pendingJobId = :jobId AND pendingHash = :hash',
        ExpressionAttributeValues: { ':jobId': jobId, ':hash': hash },
      }));
    },
    markFailed: async (jobId, status) => {
      await catalog.send(new UpdateCommand({
        TableName: tableName,
        Key: { id: PUBLICATION_STATE_ID },
        UpdateExpression: 'SET lastFailureJobId = :jobId, lastFailureStatus = :status REMOVE pendingJobId, pendingHash',
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
  });
  console.info(JSON.stringify({ publication: result }));
  return result;
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured`);
  return value;
}

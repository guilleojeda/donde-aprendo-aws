#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { mapMeetupCommunities } from '../src/lib/meetup-communities.mjs';
import { TARGET_ACCOUNT_ID } from '../src/lib/catalog-import.mjs';

export async function importMeetupCommunities(records, options = {}) {
  if (!Array.isArray(records) || records.length === 0) throw new Error('No Meetup communities to import');
  if (!options.tableName) throw new Error('DynamoDB table name is required');

  const getIdentity = options.getIdentity ?? (async () => {
    const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
    return new STSClient({ region: options.region ?? 'us-east-1' }).send(new GetCallerIdentityCommand({}));
  });
  const identity = await getIdentity();
  if (identity?.Account !== TARGET_ACCOUNT_ID) {
    throw new Error(`Wrong AWS account: expected ${TARGET_ACCOUNT_ID}, got ${identity?.Account ?? 'unknown'}`);
  }

  let put = options.put;
  if (!put) {
    const [{ DynamoDBClient }, { DynamoDBDocumentClient, PutCommand }] = await Promise.all([
      import('@aws-sdk/client-dynamodb'), import('@aws-sdk/lib-dynamodb'),
    ]);
    const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: options.region ?? 'us-east-1' }));
    put = (item) => client.send(new PutCommand({
      TableName: options.tableName,
      Item: item,
      ConditionExpression: 'attribute_not_exists(#id)',
      ExpressionAttributeNames: { '#id': 'id' },
    }));
  }

  let created = 0;
  let skipped = 0;
  for (const record of records) {
    try {
      await put(record);
      created += 1;
    } catch (error) {
      if (error?.name === 'ConditionalCheckFailedException') skipped += 1;
      else throw new Error(`Failed to import ${record.id}: ${error?.message ?? String(error)}`, { cause: error });
    }
  }
  return { total: records.length, created, skipped };
}

export async function main(args = process.argv.slice(2)) {
  const dryRun = args.includes('--dry-run');
  const tableName = process.env.CATALOG_TABLE ?? 'donde-aprendo-aws-catalog';
  const input = args.find((arg) => !arg.startsWith('--')) ?? 'data/meetup-communities.json';
  const directory = JSON.parse(await readFile(input, 'utf8'));
  const records = mapMeetupCommunities(directory);
  const result = dryRun
    ? { total: records.length, published: records.filter((record) => record.published).length }
    : await importMeetupCommunities(records, { tableName });
  console.log(JSON.stringify({ input, tableName, dryRun, ...result }));
  return result;
}

if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

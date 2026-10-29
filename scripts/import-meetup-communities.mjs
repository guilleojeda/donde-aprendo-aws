#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isMainThread } from 'node:worker_threads';
import { createDynamoCatalogAccess, putCatalogResourceOnce } from '../src/lib/catalog-resource-writer.mjs';
import { mapMeetupCommunities } from '../src/lib/meetup-communities.mjs';
import { isCatalogResourceIdWithinLimit } from '../src/lib/catalog.mjs';
import { TARGET_ACCOUNT_ID } from '../src/lib/catalog-import.mjs';

export async function importMeetupCommunities(records, options = {}) {
  if (!Array.isArray(records) || records.length === 0) throw new Error('No Meetup communities to import');
  if (!options.tableName) throw new Error('DynamoDB table name is required');
  for (const [index, record] of records.entries()) {
    if (!isCatalogResourceIdWithinLimit(record?.id)) {
      throw new Error(`Meetup community ${index + 1} has an ID longer than 256 UTF-8 bytes`);
    }
  }

  const getIdentity = options.getIdentity ?? (async () => {
    const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
    return new STSClient({ region: options.region ?? 'us-east-1' }).send(new GetCallerIdentityCommand({}));
  });
  const identity = await getIdentity();
  if (identity?.Account !== TARGET_ACCOUNT_ID) {
    throw new Error(`Wrong AWS account: expected ${TARGET_ACCOUNT_ID}, got ${identity?.Account ?? 'unknown'}`);
  }

  const access = options.getItem && options.transactWrite
    ? { getItem: options.getItem, transactWrite: options.transactWrite }
    : await createDynamoCatalogAccess({ region: options.region ?? 'us-east-1', docClient: options.docClient });

  let created = 0;
  let skipped = 0;
  const conflicts = [];
  for (const record of records) {
    try {
      const result = await putCatalogResourceOnce({ tableName: options.tableName, item: record, ...access });
      if (result.status === 'created') created += 1;
      else if (result.status === 'id-exists') skipped += 1;
      else {
        skipped += 1;
        conflicts.push({ id: record.id, url: record.url, status: result.status, resourceIds: result.resourceIds });
      }
    } catch (error) {
      throw new Error(`Failed to import ${record.id}: ${error?.message ?? String(error)}`, { cause: error });
    }
  }
  return { total: records.length, created, skipped, ...(conflicts.length ? { conflicts } : {}) };
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

#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { currentUrlCollision, currentUrlReservation, currentUrlReservationId, currentUrlKey } from '../src/lib/catalog-url.mjs';
import { DEFAULT_AWS_REGION, validateCatalogUrl } from '../src/lib/catalog.mjs';

export const TARGET_ACCOUNT_ID = '719535286359';
const MIGRATION_CONCURRENCY = 8;

export function buildCatalogUrlInventory(items) {
  if (!Array.isArray(items)) throw new TypeError('Catalog migration inventory must be an array');
  const resources = [];
  const reservationItems = [];
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Catalog migration record ${index + 1} is not an object`);
    }
    if (typeof item.id !== 'string' || item.id.length === 0) {
      throw new Error(`Catalog migration record ${index + 1} has an invalid ID`);
    }
    if (item.id.startsWith('__url#') || item.recordType === 'urlReservation') {
      if (item.recordType !== 'urlReservation' || typeof item.url !== 'string'
          || item.id !== currentUrlReservationId(item.url) || item.version !== 1
          || !(['reserved', 'collision'].includes(item.status))) {
        throw new Error(`Catalog URL reservation ${item.id} is malformed`);
      }
      try {
        validateCatalogUrl(item.url, index);
      } catch (error) {
        throw new Error(`Catalog URL reservation ${item.id} has an invalid URL`, { cause: error });
      }
      if (item.status === 'reserved' && (typeof item.resourceId !== 'string' || item.resourceId.length === 0)) {
        throw new Error(`Catalog URL reservation ${item.id} has no resource ID`);
      }
      if (item.status === 'collision' && (!Array.isArray(item.resourceIds) || item.resourceIds.length < 2
          || item.resourceIds.some((id) => typeof id !== 'string' || id.length === 0))) {
        throw new Error(`Catalog URL collision ${item.id} has invalid resource IDs`);
      }
      reservationItems.push(item);
      continue;
    }
    if (item.id.startsWith('__')) continue;
    if (item.recordType !== undefined && item.recordType !== 'event') {
      throw new Error(`Catalog migration record ${index + 1} has an unknown record type`);
    }
    const url = item.recordType === 'event' ? item.registrationUrl : item.url;
    try {
      validateCatalogUrl(url, index);
    } catch (error) {
      throw new Error(`Catalog migration record ${item.id} has no valid current URL`, { cause: error });
    }
    if (ids.has(item.id)) throw new Error(`Catalog migration inventory repeats resource ${item.id}`);
    ids.add(item.id);
    if (Object.hasOwn(item, 'version')
        && (!Number.isSafeInteger(item.version) || item.version < 0)) {
      throw new Error(`Catalog migration resource ${item.id} has an invalid version`);
    }
    resources.push({ id: item.id, url, version: item.version });
  }

  const hashUrls = new Map();
  const byUrl = new Map();
  for (const resource of resources) {
    const key = currentUrlKey(resource.url);
    const urls = hashUrls.get(key) ?? new Set();
    urls.add(resource.url);
    hashUrls.set(key, urls);
    const group = byUrl.get(resource.url) ?? [];
    group.push(resource);
    byUrl.set(resource.url, group);
  }
  const hashCollisions = [...hashUrls.entries()]
    .filter(([, urls]) => urls.size > 1)
    .map(([key, urls]) => ({ key, urls: [...urls].sort() }));
  const reservations = [...byUrl.entries()].map(([url, group]) => group.length === 1
    ? currentUrlReservation(url, group[0].id)
    : currentUrlCollision(url, group.map(({ id }) => id)));
  const collisions = [...byUrl.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([url, group]) => ({ url, resourceIds: group.map(({ id }) => id).sort() }));
  return {
    resources,
    reservationItems,
    reservations,
    collisions,
    hashCollisions,
    missingVersions: resources.filter(({ version }) => version === undefined).map(({ id }) => id),
  };
}

export async function scanCatalogMigrationItems(scanPage, tableName) {
  if (typeof scanPage !== 'function') throw new TypeError('Catalog migration scan reader must be a function');
  const items = [];
  let exclusiveStartKey;
  const seenKeys = new Set();
  do {
    const params = {
      TableName: tableName,
      Select: 'SPECIFIC_ATTRIBUTES',
      ConsistentRead: true,
      ProjectionExpression: '#id,#recordType,#url,#registrationUrl,#version,#status,#resourceId,#resourceIds',
      ExpressionAttributeNames: {
        '#id': 'id', '#recordType': 'recordType', '#url': 'url',
        '#registrationUrl': 'registrationUrl', '#version': 'version', '#status': 'status',
        '#resourceId': 'resourceId', '#resourceIds': 'resourceIds',
      },
    };
    if (exclusiveStartKey !== undefined) params.ExclusiveStartKey = exclusiveStartKey;
    const page = await scanPage(params);
    if (!page || !Array.isArray(page.Items)) throw new Error('Catalog migration scan returned an incomplete page');
    items.push(...page.Items);
    const nextKey = page.LastEvaluatedKey;
    if (nextKey !== undefined && nextKey !== null && (typeof nextKey !== 'object' || Array.isArray(nextKey))) {
      throw new Error('Catalog migration scan returned a malformed pagination key');
    }
    if (nextKey && typeof nextKey === 'object' && Object.keys(nextKey).length > 0) {
      const fingerprint = JSON.stringify(nextKey);
      if (seenKeys.has(fingerprint)) throw new Error('Catalog migration scan repeated a pagination key');
      seenKeys.add(fingerprint);
      exclusiveStartKey = nextKey;
    } else {
      exclusiveStartKey = undefined;
    }
  } while (exclusiveStartKey !== undefined);
  return items;
}

export async function migrateCatalogUrlReservations({ tableName, scanPage, getItem, putItem, updateItem }) {
  const initial = buildCatalogUrlInventory(await scanCatalogMigrationItems(scanPage, tableName));
  if (initial.hashCollisions.length > 0) {
    throw new Error(`SHA-256 URL key collision requires manual resolution: ${JSON.stringify(initial.hashCollisions)}`);
  }
  const backfills = await mapWithConcurrency(initial.missingVersions, async (id) => {
    try {
      await updateItem({
        TableName: tableName,
        Key: { id },
        UpdateExpression: 'SET #version = :zero',
        ConditionExpression: 'attribute_exists(#id) AND attribute_not_exists(#version)',
        ExpressionAttributeNames: { '#id': 'id', '#version': 'version' },
        ExpressionAttributeValues: { ':zero': 0 },
      });
      return true;
    } catch (error) {
      if (!isConditionalConflict(error)) throw error;
      const current = await readItem(getItem, tableName, id);
      if (!current || !Number.isSafeInteger(current.version) || current.version < 0) {
        throw new Error(`Catalog migration could not backfill version for ${id}`, { cause: error });
      }
      return false;
    }
  });
  const versionsBackfilled = backfills.filter(Boolean).length;

  const reservationWrites = await mapWithConcurrency(initial.reservations, async (expected) => {
    const current = await readItem(getItem, tableName, expected.id);
    if (reservationMatches(current, expected)) return false;
    if (current && !canReconcile(current, expected)) {
      throw new Error(`Catalog URL reservation ${expected.id} conflicts with the inventory; preserved existing data`);
    }
    const operation = current
      ? () => {
        const names = { '#version': 'version', '#url': 'url', '#status': 'status' };
        const values = { ':version': current.version, ':url': current.url, ':status': current.status };
        let condition = '#version = :version AND #url = :url AND #status = :status';
        if (current.status === 'reserved') {
          names['#resourceId'] = 'resourceId';
          values[':resourceId'] = current.resourceId;
          condition += ' AND #resourceId = :resourceId';
        } else {
          names['#resourceIds'] = 'resourceIds';
          values[':resourceIds'] = current.resourceIds;
          condition += ' AND #resourceIds = :resourceIds';
        }
        return putItem({
          TableName: tableName,
          Item: expected,
          ConditionExpression: condition,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        });
      }
      : () => putItem({
        TableName: tableName,
        Item: expected,
        ConditionExpression: 'attribute_not_exists(#id)',
        ExpressionAttributeNames: { '#id': 'id' },
      });
    try {
      await operation();
      return true;
    } catch (error) {
      if (!isConditionalConflict(error)) throw error;
      const after = await readItem(getItem, tableName, expected.id);
      if (!reservationMatches(after, expected)) {
        throw new Error(`Catalog URL reservation ${expected.id} changed during migration`, { cause: error });
      }
      return false;
    }
  });
  const reservationsWritten = reservationWrites.filter(Boolean).length;

  const final = buildCatalogUrlInventory(await scanCatalogMigrationItems(scanPage, tableName));
  if (final.missingVersions.length > 0) {
    throw new Error(`Catalog migration version coverage is incomplete for ${final.missingVersions.join(', ')}`);
  }
  await mapWithConcurrency(final.reservations, async (expected) => {
    const actual = await readItem(getItem, tableName, expected.id);
    if (!reservationMatches(actual, expected)) throw new Error(`Catalog URL reservation coverage is incomplete for ${expected.url}`);
  });
  const expectedReservationIds = new Set(final.reservations.map(({ id }) => id));
  for (const actual of final.reservationItems) {
    const expected = final.reservations.find(({ id }) => id === actual.id);
    if (!expectedReservationIds.has(actual.id) || !reservationMatches(actual, expected)) {
      throw new Error(`Catalog URL reservation ${actual.id} has no matching current resource`);
    }
  }
  if (final.reservationItems.length !== final.reservations.length) {
    throw new Error('Catalog URL reservation coverage is incomplete');
  }
  return {
    resources: final.resources.length,
    versionsBackfilled,
    reservationsWritten,
    reservationsVerified: final.reservations.length,
    collisions: final.collisions,
  };
}

async function mapWithConcurrency(items, mapper, concurrency = MIGRATION_CONCURRENCY) {
  if (items.length === 0) return [];
  const results = new Array(items.length);
  let nextIndex = 0;
  let failed = false;
  let firstError;

  async function worker() {
    while (!failed) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
        return;
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failed) throw firstError;
  return results;
}

function reservationMatches(actual, expected) {
  if (!actual || actual.id !== expected.id || actual.recordType !== 'urlReservation'
      || actual.url !== expected.url || actual.status !== expected.status || actual.version !== 1) return false;
  if (expected.status === 'reserved') return actual.resourceId === expected.resourceId;
  return Array.isArray(actual.resourceIds)
    && JSON.stringify([...actual.resourceIds].sort()) === JSON.stringify([...expected.resourceIds].sort());
}

function canReconcile(current, expected) {
  if (!current || current.recordType !== 'urlReservation' || current.url !== expected.url || current.version !== 1) return false;
  if (expected.status === 'collision') {
    return current.status === 'reserved' && expected.resourceIds.includes(current.resourceId);
  }
  return current.status === 'collision' && Array.isArray(current.resourceIds)
    && current.resourceIds.length > 0 && current.resourceIds.includes(expected.resourceId);
}

function isConditionalConflict(error) {
  return error?.name === 'ConditionalCheckFailedException'
    || error?.code === 'ConditionalCheckFailedException';
}

async function readItem(getItem, tableName, id) {
  const result = await getItem({ TableName: tableName, Key: { id }, ConsistentRead: true });
  return result?.Item ?? null;
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  if (argv.includes('--help')) {
    (dependencies.write ?? console.log)('Usage: migrate-catalog-url-reservations.mjs --table TABLE (--dry-run | --apply)');
    return { help: true };
  }
  const dryRun = argv.includes('--dry-run');
  const apply = argv.includes('--apply');
  if (dryRun === apply) throw new Error('Pass exactly one of --dry-run or --apply');
  const tableArg = argv.indexOf('--table');
  const tableName = tableArg >= 0 ? argv[tableArg + 1] : process.env.CATALOG_TABLE;
  if (typeof tableName !== 'string' || tableName.trim() === '') throw new Error('Catalog migration requires --table TABLE or CATALOG_TABLE');
  const getCallerIdentity = dependencies.getCallerIdentity ?? await createIdentityReader();
  const identity = await getCallerIdentity();
  if (identity?.Account !== TARGET_ACCOUNT_ID) {
    throw new Error(`Catalog migration account guard failed: expected ${TARGET_ACCOUNT_ID}, got ${identity?.Account ?? 'unknown'}`);
  }
  const access = dependencies.scanPage
    ? dependencies
    : await createDynamoAccess(process.env.AWS_REGION ?? DEFAULT_AWS_REGION);
  const inventory = buildCatalogUrlInventory(await scanCatalogMigrationItems(access.scanPage, tableName));
  if (inventory.hashCollisions.length) throw new Error(`SHA-256 URL key collision requires manual resolution: ${JSON.stringify(inventory.hashCollisions)}`);
  if (dryRun) {
    const report = {
      dryRun: true,
      tableName,
      resources: inventory.resources.length,
      missingVersions: inventory.missingVersions.length,
      reservations: inventory.reservations.length,
      collisions: inventory.collisions,
    };
    (dependencies.write ?? console.log)(JSON.stringify(report));
    return report;
  }
  const result = await migrateCatalogUrlReservations({ tableName, ...access });
  const report = { dryRun: false, tableName, ...result };
  (dependencies.write ?? console.log)(JSON.stringify(report));
  return report;
}

async function createIdentityReader() {
  const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
  const client = new STSClient({ region: process.env.AWS_REGION ?? DEFAULT_AWS_REGION });
  return () => client.send(new GetCallerIdentityCommand({}));
}

async function createDynamoAccess(region) {
  const [{ DynamoDBClient }, { DynamoDBDocumentClient, GetCommand, ScanCommand, PutCommand, UpdateCommand }] = await Promise.all([
    import('@aws-sdk/client-dynamodb'), import('@aws-sdk/lib-dynamodb'),
  ]);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  return {
    scanPage: (params) => client.send(new ScanCommand(params)),
    getItem: (params) => client.send(new GetCommand(params)),
    putItem: (params) => client.send(new PutCommand(params)),
    updateItem: (params) => client.send(new UpdateCommand(params)),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

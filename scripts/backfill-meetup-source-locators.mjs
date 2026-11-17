#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DEFAULT_AWS_REGION, validateCatalogUrl } from '../src/lib/catalog.mjs';
import { TARGET_ACCOUNT_ID } from '../src/lib/catalog-import.mjs';
import { canonicalMeetupSourceUrl } from '../src/lib/meetup-communities.mjs';
import { isPublicCatalogResourceId } from '../src/lib/catalog-identity.mjs';

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const CATALOG_SCAN_NAMES = Object.freeze({
  '#id': 'id',
  '#recordType': 'recordType',
  '#url': 'url',
  '#kind': 'kind',
  '#format': 'format',
  '#country': 'country',
  '#meetupSourceUrl': 'meetupSourceUrl',
  '#version': 'version',
});

/** Validate reviewed source URL through the shared canonical source rule. */
function reviewedSourceUrl(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value
      || CONTROL_CHARACTERS.test(value)) {
    throw new Error(`${label} must be a canonical Meetup group URL`);
  }
  const canonical = canonicalMeetupSourceUrl(value);
  if (canonical !== value) {
    throw new Error(`${label} must be a canonical Meetup group URL`);
  }
  return canonical;
}

function reviewedId(value, label) {
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) {
    throw new Error(`${label} must be the exact numeric-string Meetup group ID`);
  }
  if (!isPublicCatalogResourceId(`meetup-${value}`)) {
    throw new Error(`${label} produces a catalog ID over the public byte limit`);
  }
  return value;
}

function publicUrl(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value
      || CONTROL_CHARACTERS.test(value)) {
    throw new Error(`${label} must be an exact public URL`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error(`${label} must be an exact public URL`, { cause: error });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname
      || parsed.username || parsed.password) {
    throw new Error(`${label} must be an exact public URL`);
  }
  return value;
}

function optionalPublicUrl(value, label) {
  return value === undefined ? undefined : publicUrl(value, label);
}

function observedVersion(item) {
  if (item?.version === undefined) return null;
  if (!Number.isSafeInteger(item.version) || item.version < 0) return undefined;
  return item.version;
}

function nextVersion(version) {
  if (version === null) return 1;
  if (!Number.isSafeInteger(version) || version < 0 || !Number.isSafeInteger(version + 1)) {
    throw new Error(`Cannot advance invalid catalog revision ${String(version)}`);
  }
  return version + 1;
}

function sourcePresent(item) {
  return item !== null && item !== undefined
    && Object.hasOwn(item, 'meetupSourceUrl') && item.meetupSourceUrl !== undefined;
}

function sourceValue(item) {
  return sourcePresent(item) ? item.meetupSourceUrl : undefined;
}

function sourceProofKey(value) {
  return value === undefined ? null : value;
}

function isConditionalConflict(error) {
  return error?.name === 'ConditionalCheckFailedException'
    || error?.code === 'ConditionalCheckFailedException';
}

function exactObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

/** Validate and index the reviewed, durable source evidence before AWS reads. */
export function normalizeReviewedSources(reviewed) {
  exactObject(reviewed, 'Reviewed Meetup input');
  if (!Array.isArray(reviewed.groups)) throw new Error('Reviewed Meetup input must contain a groups array');

  const groups = [];
  const byId = new Map();
  const byUrl = new Map();
  for (const [index, group] of reviewed.groups.entries()) {
    exactObject(group, `Reviewed Meetup group ${index + 1}`);
    const id = reviewedId(group.id, `Reviewed Meetup group ${index + 1} ID`);
    const url = reviewedSourceUrl(group.url, `Reviewed Meetup group ${id} URL`);
    const groupPublicUrl = optionalPublicUrl(group.publicUrl, `Reviewed Meetup group ${id} publicUrl`);
    if (byId.has(id)) throw new Error(`Reviewed Meetup input repeats group ID ${id}`);
    const locatorKey = url.toLowerCase();
    if (byUrl.has(locatorKey)) {
      throw new Error(`Reviewed Meetup URL ${url} identifies multiple group IDs (${byUrl.get(locatorKey)} and ${id})`);
    }
    const normalized = { id, url, ...(groupPublicUrl === undefined ? {} : { publicUrl: groupPublicUrl }) };
    groups.push(normalized);
    byId.set(id, normalized);
    byUrl.set(locatorKey, id);
  }

  if (reviewed.renames !== undefined && !Array.isArray(reviewed.renames)) {
    throw new Error('Reviewed Meetup renames must be an array');
  }
  const renames = [];
  const renameById = new Map();
  for (const [index, rename] of (reviewed.renames ?? []).entries()) {
    exactObject(rename, `Reviewed Meetup rename ${index + 1}`);
    const id = reviewedId(rename.id, `Reviewed Meetup rename ${index + 1} ID`);
    const fromUrl = reviewedSourceUrl(rename.fromUrl, `Reviewed Meetup rename ${id} fromUrl`);
    const url = reviewedSourceUrl(rename.url, `Reviewed Meetup rename ${id} URL`);
    if (!byId.has(id)) throw new Error(`Reviewed Meetup rename ${id} has no matching group evidence`);
    if (byId.get(id).url !== url) {
      throw new Error(`Reviewed Meetup rename ${id} must target its group's reviewed URL`);
    }
    if (!Number.isSafeInteger(rename.fromVersion) || rename.fromVersion < 0) {
      throw new Error(`Reviewed Meetup rename ${id} must include a non-negative fromVersion`);
    }
    if (rename.fromUrl === url) throw new Error(`Reviewed Meetup rename ${id} does not change its source URL`);
    if (renameById.has(id)) throw new Error(`Reviewed Meetup input repeats rename evidence for group ID ${id}`);
    renames.push({ id, fromUrl, fromVersion: rename.fromVersion, url });
    renameById.set(id, renames.at(-1));
  }

  return { groups, byId, renames, renameById };
}

/** Consume every strongly consistent catalog scan page needed by the plan. */
export async function scanMeetupLocatorItems({ tableName, docClient }) {
  if (typeof tableName !== 'string' || tableName.trim() === '') {
    throw new Error('Meetup locator backfill requires a table name');
  }
  if (!docClient || typeof docClient.send !== 'function') {
    throw new TypeError('Meetup locator backfill requires a DynamoDB document client');
  }
  const items = [];
  const seenKeys = new Set();
  let exclusiveStartKey;
  let pageNumber = 0;
  do {
    pageNumber += 1;
    const input = {
      TableName: tableName,
      Select: 'SPECIFIC_ATTRIBUTES',
      ConsistentRead: true,
      ProjectionExpression: '#id,#recordType,#url,#kind,#format,#country,#meetupSourceUrl,#version',
      ExpressionAttributeNames: CATALOG_SCAN_NAMES,
    };
    if (exclusiveStartKey !== undefined) input.ExclusiveStartKey = exclusiveStartKey;
    let page;
    try {
      page = await docClient.send(new ScanCommand(input));
    } catch (error) {
      throw new Error(`Meetup locator scan failed on page ${pageNumber}: ${error?.message ?? String(error)}`, { cause: error });
    }
    if (!page || !Array.isArray(page.Items)) {
      throw new Error(`Meetup locator scan returned malformed page ${pageNumber}: Items must be an array`);
    }
    items.push(...page.Items);

    const nextKey = page.LastEvaluatedKey;
    if (nextKey !== undefined && nextKey !== null
        && (typeof nextKey !== 'object' || Array.isArray(nextKey))) {
      throw new Error(`Meetup locator scan returned a malformed pagination key on page ${pageNumber}`);
    }
    if (nextKey && typeof nextKey === 'object' && Object.keys(nextKey).length > 0) {
      if (Object.keys(nextKey).length !== 1 || typeof nextKey.id !== 'string' || nextKey.id.length === 0) {
        throw new Error(`Meetup locator scan returned a malformed pagination key on page ${pageNumber}`);
      }
      const fingerprint = JSON.stringify(nextKey);
      if (seenKeys.has(fingerprint)) throw new Error(`Meetup locator scan repeated a pagination key on page ${pageNumber}`);
      seenKeys.add(fingerprint);
      exclusiveStartKey = nextKey;
    } else {
      exclusiveStartKey = undefined;
    }
  } while (exclusiveStartKey !== undefined);
  return items;
}

function indexCatalogItems(items) {
  const byId = new Map();
  for (const [index, item] of items.entries()) {
    exactObject(item, `Catalog scan record ${index + 1}`);
    if (typeof item.id !== 'string' || item.id.length === 0) {
      throw new Error(`Catalog scan record ${index + 1} has an invalid ID`);
    }
    if (byId.has(item.id)) throw new Error(`Catalog scan repeated catalog ID ${item.id}`);
    byId.set(item.id, item);
  }
  return byId;
}

function blockedEntry(id, reason, details = {}) {
  return { id, reason, ...details };
}

function updateEntry(item, group, targetUrl, version, oldLocator) {
  return {
    id: item.id,
    meetupSourceUrl: targetUrl,
    observedVersion: version,
    observedMeetupSourceUrl: sourceProofKey(oldLocator),
    observedPublicUrl: item.url,
    reviewedGroupId: group.id,
  };
}

function unchangedEntry(item, version) {
  return {
    id: item.id,
    meetupSourceUrl: item.meetupSourceUrl,
    observedVersion: version,
  };
}

function validCatalogUrlEvidence(item) {
  if (typeof item?.url !== 'string' || item.url.length === 0 || item.url.trim() !== item.url
      || CONTROL_CHARACTERS.test(item.url)) return false;
  try {
    validateCatalogUrl(item.url);
    return true;
  } catch {
    return false;
  }
}

function validCatalogCommunityShape(item) {
  if (item.recordType !== undefined) return false;
  if (!validCatalogUrlEvidence(item)) return false;
  // A reclassified known Meetup row is still a normal catalog community for
  // this transition. The source identity is the reviewed exact ID, not kind.
  return typeof item.kind === 'string' && typeof item.format === 'string'
    && typeof item.country === 'string';
}

function storedLocatorOwners(items) {
  const byLocator = new Map();
  for (const item of items) {
    const { id, kind } = item;
    if (!id.startsWith('meetup-') || id.startsWith('meetup-event-')) continue;
    // Match runtime locator claims, including legacy and inactive
    // community IDs. Reviewed migration targets still require numeric IDs.
    if (kind !== 'community' && !/^meetup-[0-9]+$/u.test(id)) continue;
    const locator = canonicalMeetupSourceUrl(item.meetupSourceUrl);
    if (locator === null || locator !== item.meetupSourceUrl) continue;
    const key = locator.toLowerCase();
    const owners = byLocator.get(key) ?? new Set();
    owners.add(id);
    byLocator.set(key, owners);
  }
  return byLocator;
}

/**
 * Build a read-only locator migration plan. This function never submits an
 * update and rejects malformed reviewed evidence before touching DynamoDB.
 */
export async function planMeetupSourceLocators({ tableName, region = DEFAULT_AWS_REGION, docClient, reviewed }) {
  if (typeof region !== 'string' || region.trim() === '') throw new Error('Meetup locator backfill requires a non-empty AWS region');
  const sources = normalizeReviewedSources(reviewed);
  const items = await scanMeetupLocatorItems({ tableName, docClient });
  const catalogById = indexCatalogItems(items);
  const locatorOwners = storedLocatorOwners(items);
  const updates = [];
  const unchanged = [];
  const blocked = [];

  for (const group of sources.groups) {
    const id = `meetup-${group.id}`;
    const item = catalogById.get(id);
    if (!item) {
      blocked.push(blockedEntry(id, 'missing catalog community row', { reviewedGroupId: group.id }));
      continue;
    }
    if (!validCatalogCommunityShape(item)) {
      blocked.push(blockedEntry(id, 'catalog row has an invalid stored community shape', { reviewedGroupId: group.id }));
      continue;
    }
    const currentLocator = sourceValue(item);
    // Two sequential CAS writes must never rely on the second one releasing
    // its current locator. That write could lose a race and leave two owners.
    const occupiedLocators = [currentLocator, group.url].filter((value) => typeof value === 'string');
    const otherOwners = new Set(occupiedLocators.flatMap(
      (value) => [...(locatorOwners.get(value.toLowerCase()) ?? [])],
    ));
    otherOwners.delete(id);
    if (otherOwners.size > 0) {
      blocked.push(blockedEntry(id, 'stored Meetup source locator is already owned by another catalog row', {
        reviewedGroupId: group.id,
        duplicateIds: [...otherOwners],
      }));
      continue;
    }
    const version = observedVersion(item);
    if (version === undefined) {
      blocked.push(blockedEntry(id, 'catalog row has an invalid revision', { reviewedGroupId: group.id }));
      continue;
    }
    if (version === Number.MAX_SAFE_INTEGER && currentLocator !== group.url) {
      blocked.push(blockedEntry(id, 'catalog row revision cannot advance', { reviewedGroupId: group.id }));
      continue;
    }
    if (currentLocator !== undefined) {
      let validCurrentLocator = true;
      try {
        reviewedSourceUrl(currentLocator, `Catalog row ${id} meetupSourceUrl`);
      } catch {
        validCurrentLocator = false;
      }
      if (!validCurrentLocator) {
        blocked.push(blockedEntry(id, 'catalog row has an invalid existing source locator', { reviewedGroupId: group.id }));
        continue;
      }
      if (currentLocator === group.url) {
        unchanged.push(unchangedEntry(item, version));
        continue;
      }
      const rename = sources.renameById.get(group.id);
      if (!rename || rename.fromUrl !== currentLocator || rename.fromVersion !== version) {
        blocked.push(blockedEntry(id, 'existing source locator disagrees with reviewed evidence', {
          reviewedGroupId: group.id,
          observedMeetupSourceUrl: currentLocator,
          reviewedMeetupSourceUrl: group.url,
          observedVersion: version,
        }));
        continue;
      }
      updates.push(updateEntry(item, group, group.url, version, currentLocator));
      continue;
    }

    if (group.publicUrl !== undefined && group.publicUrl !== item.url) {
      blocked.push(blockedEntry(id, 'reviewed publicUrl does not match the current catalog URL', {
        reviewedGroupId: group.id,
        observedPublicUrl: item.url,
        reviewedPublicUrl: group.publicUrl,
      }));
      continue;
    }
    if (item.url !== group.url && group.publicUrl !== item.url) {
      blocked.push(blockedEntry(id, 'legacy public URL disagrees with reviewed source evidence', {
        reviewedGroupId: group.id,
        observedPublicUrl: item.url,
        reviewedMeetupSourceUrl: group.url,
      }));
      continue;
    }
    updates.push(updateEntry(item, group, group.url, version, undefined));
  }

  // A known numeric Meetup row without a reviewed mapping is unresolved, not
  // permission to infer its source from the editable public URL.
  const reviewedCatalogIds = new Set(sources.groups.map(({ id }) => `meetup-${id}`));
  for (const item of items) {
    if (typeof item?.id !== 'string' || !/^meetup-\d+$/u.test(item.id) || reviewedCatalogIds.has(item.id)) continue;
    blocked.push(blockedEntry(item.id, 'catalog Meetup row has no reviewed source evidence'));
  }

  return {
    version: 1,
    accountId: TARGET_ACCOUNT_ID,
    tableName,
    region,
    updates,
    unchanged,
    blocked,
  };
}

function planEntries(plan, name) {
  if (!Array.isArray(plan?.[name])) throw new Error(`Meetup locator plan.${name} must be an array`);
  return plan[name];
}

function planUpdateShape(entry) {
  exactObject(entry, 'Meetup locator plan update');
  if (typeof entry.id !== 'string' || !/^meetup-\d+$/u.test(entry.id)) throw new Error('Meetup locator plan update has an invalid ID');
  const reviewedGroupId = reviewedId(entry.id.slice('meetup-'.length), `Meetup locator plan update ${entry.id} ID`);
  if (entry.reviewedGroupId !== reviewedGroupId) throw new Error(`Meetup locator plan update ${entry.id} has mismatched reviewed identity`);
  reviewedSourceUrl(entry.meetupSourceUrl, `Meetup locator plan update ${entry.id}`);
  if (entry.observedMeetupSourceUrl !== null) {
    reviewedSourceUrl(entry.observedMeetupSourceUrl, `Meetup locator plan update ${entry.id} observed source`);
  }
  if (!validCatalogUrlEvidence({ url: entry.observedPublicUrl })) {
    throw new Error(`Meetup locator plan update ${entry.id} has invalid public URL evidence`);
  }
}

function buildUpdateInput(tableName, entry) {
  const versionCondition = entry.observedVersion === null
    ? 'attribute_not_exists(#version)'
    : '#version = :observedVersion';
  const locatorCondition = entry.observedMeetupSourceUrl === null
    ? 'attribute_not_exists(#meetupSourceUrl)'
    : '#meetupSourceUrl = :observedMeetupSourceUrl';
  return {
    TableName: tableName,
    Key: { id: entry.id },
    UpdateExpression: 'SET #meetupSourceUrl = :nextMeetupSourceUrl, #version = :nextVersion',
    ConditionExpression: `attribute_exists(#id) AND #id = :id AND #url = :observedPublicUrl AND ${versionCondition} AND ${locatorCondition}`,
    ExpressionAttributeNames: {
      '#id': 'id',
      '#url': 'url',
      '#version': 'version',
      '#meetupSourceUrl': 'meetupSourceUrl',
    },
    ExpressionAttributeValues: {
      ':id': entry.id,
      ':observedPublicUrl': entry.observedPublicUrl,
      ':nextMeetupSourceUrl': entry.meetupSourceUrl,
      ':nextVersion': nextVersion(entry.observedVersion),
      ...(entry.observedVersion === null ? {} : { ':observedVersion': entry.observedVersion }),
      ...(entry.observedMeetupSourceUrl === null ? {} : { ':observedMeetupSourceUrl': entry.observedMeetupSourceUrl }),
    },
  };
}

/** Apply only an unblocked plan, reporting provider races as stale IDs. */
export async function applyMeetupSourceLocators({ tableName, region, docClient, plan }) {
  if (typeof tableName !== 'string' || tableName.trim() === '') throw new Error('Meetup locator backfill requires a table name');
  if (!docClient || typeof docClient.send !== 'function') throw new TypeError('Meetup locator backfill requires a DynamoDB document client');
  if (plan?.version !== 1) throw new Error('Meetup locator plan has an unsupported version');
  if (plan.accountId !== TARGET_ACCOUNT_ID) throw new Error('Meetup locator plan targets an unexpected AWS account');
  if (plan.tableName !== tableName) throw new Error(`Meetup locator plan targets table ${plan.tableName}, not ${tableName}`);
  if (typeof plan.region !== 'string' || plan.region.trim() === '') throw new Error('Meetup locator plan has no AWS region');
  if (region !== undefined && region !== plan.region) throw new Error(`Meetup locator plan targets region ${plan.region}, not ${region}`);
  const blocked = planEntries(plan, 'blocked');
  const updates = planEntries(plan, 'updates');
  const unchanged = planEntries(plan, 'unchanged');
  if (blocked.length > 0) {
    throw new Error(`Cannot apply Meetup locator plan with blocked mappings: ${blocked.map((entry) => entry.id).join(', ')}`);
  }
  const seen = new Set();
  for (const entry of [...updates, ...unchanged]) {
    if (typeof entry?.id !== 'string' || seen.has(entry.id)) throw new Error(`Meetup locator plan repeats ID ${entry?.id ?? 'unknown'}`);
    seen.add(entry.id);
  }
  const writes = updates.map((entry) => {
    planUpdateShape(entry);
    return { entry, input: buildUpdateInput(tableName, entry) };
  });

  const updated = [];
  const stale = [];
  for (const { entry, input } of writes) {
    try {
      await docClient.send(new UpdateCommand(input));
      updated.push({ id: entry.id, meetupSourceUrl: entry.meetupSourceUrl, version: input.ExpressionAttributeValues[':nextVersion'] });
    } catch (error) {
      if (!isConditionalConflict(error)) throw error;
      stale.push({ id: entry.id, reason: 'conditional update lost a concurrent catalog change' });
    }
  }
  return { version: 1, updated, unchanged, stale };
}

function createIdentityReader(region) {
  return async () => {
    const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
    return new STSClient({ region }).send(new GetCallerIdentityCommand({}));
  };
}

async function createDynamoDocumentClient(region) {
  const [{ DynamoDBClient }, { DynamoDBDocumentClient }] = await Promise.all([
    import('@aws-sdk/client-dynamodb'),
    import('@aws-sdk/lib-dynamodb'),
  ]);
  return DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
}

function parseCliArguments(argv) {
  const parsed = parseArgs({
    args: argv,
    options: {
      table: { type: 'string' },
      region: { type: 'string' },
    },
    allowPositionals: true,
    strict: true,
  });
  const [command, input, ...extra] = parsed.positionals;
  if (!['plan', 'apply'].includes(command) || !input || extra.length > 0) {
    throw new TypeError('Usage: backfill-meetup-source-locators.mjs plan REVIEWED.json --table TABLE [--region REGION] | apply PLAN.json [--table TABLE] [--region REGION]');
  }
  return { command, input, tableName: parsed.values.table, region: parsed.values.region };
}

/** Operator entry point. Plan writes a reviewable artifact; apply consumes it exactly. */
export async function main(argv = process.argv.slice(2), dependencies = {}) {
  if (argv.includes('--help')) {
    (dependencies.write ?? console.log)('Usage: backfill-meetup-source-locators.mjs plan REVIEWED.json --table TABLE [--region REGION] | apply PLAN.json [--table TABLE] [--region REGION]');
    return { help: true };
  }
  const { command, input, tableName: optionTableName, region: optionRegion } = parseCliArguments(argv);
  const document = JSON.parse(await readFile(input, 'utf8'));
  const planMode = command === 'plan';
  if (!planMode && document?.accountId !== TARGET_ACCOUNT_ID) {
    throw new Error('Apply plan targets an unexpected AWS account');
  }
  const tableName = planMode ? optionTableName : optionTableName ?? document.tableName;
  const region = planMode
    ? optionRegion ?? process.env.AWS_REGION ?? DEFAULT_AWS_REGION
    : optionRegion ?? document.region;
  if (typeof tableName !== 'string' || tableName.trim() === '') throw new Error(`${command} requires a non-empty --table TABLE${planMode ? '' : ' or matching plan table'}`);
  if (typeof region !== 'string' || region.trim() === '') throw new Error(`${command} requires a non-empty AWS region`);
  if (!planMode && optionTableName !== undefined && optionTableName !== document.tableName) {
    throw new Error(`Plan table ${document.tableName} does not match --table ${optionTableName}`);
  }
  if (!planMode && optionRegion !== undefined && optionRegion !== document.region) {
    throw new Error(`Plan region ${document.region} does not match --region ${optionRegion}`);
  }
  const getCallerIdentity = dependencies.getCallerIdentity ?? createIdentityReader(region);
  const identity = await getCallerIdentity();
  if (identity?.Account !== TARGET_ACCOUNT_ID) {
    throw new Error(`Meetup locator backfill account guard failed: expected ${TARGET_ACCOUNT_ID}, got ${identity?.Account ?? 'unknown'}`);
  }
  const docClient = dependencies.docClient ?? await createDynamoDocumentClient(region);
  const plan = planMode
    ? await planMeetupSourceLocators({ tableName, region, docClient, reviewed: document })
    : document;
  const result = planMode
    ? plan
    : await applyMeetupSourceLocators({ tableName, region, docClient, plan });
  const report = planMode ? result : { version: 1, accountId: TARGET_ACCOUNT_ID, tableName, region, ...result };
  (dependencies.write ?? console.log)(JSON.stringify(report));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

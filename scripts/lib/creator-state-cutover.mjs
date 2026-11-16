import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { isCatalogResourceIdWithinLimit } from '../../src/lib/catalog-identity.mjs';
import { assertCreatorStateFits, isCreatorStateId } from '../../src/lib/creator-state.mjs';
import { dynamoDbCreatorStateSizes } from '../../src/lib/creator-dynamodb-size.mjs';
import {
  CREATOR_FIELD_LIMITS,
  CREATOR_PROGRAMS,
  CREATOR_SOCIALS,
  hasCreatorPublicIdentity,
  isCreatorSlug,
} from '../../src/lib/creator-values.mjs';
import { isSafeCatalogUrl } from '../../src/lib/catalog-url-safety.mjs';
import { isPublicCreator } from '../../src/lib/creator-public.mjs';

const PLAN_FORMAT = 'creator-state-cutover-v1';
const MAX_TRANSACTION_ACTIONS = 100;
const MAX_CLEANUP_DELETES = MAX_TRANSACTION_ACTIONS - 1;
const PROFILE_FIELDS = new Set([
  'pk', 'sk', 'recordType', 'id', 'version', 'displayName', 'slug', 'city', 'country', 'bio',
  'programs', 'socials', 'photo', 'published', 'hidden', 'createdAt', 'updatedAt',
]);
const PLACEMENT_FIELDS = new Set([
  'pk', 'sk', 'recordType', 'id', 'profileId', 'resourceId', 'position', 'featured',
  'selectedForDirectory', 'series', 'version',
]);
const SERIES_FIELDS = new Set([
  'pk', 'sk', 'recordType', 'id', 'profileId', 'name', 'slug', 'description',
  'version', 'createdAt', 'updatedAt',
]);
const SERIES_ALIAS_FIELDS = new Set([
  'pk', 'sk', 'recordType', 'seriesId', 'profileId', 'slug', 'version',
]);
const SAFE_KEY_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export class CreatorStateCutoverError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CreatorStateCutoverError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new CreatorStateCutoverError(code, message);
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(value, label) {
  if (!isRecord(value)) fail('INVALID_EXPORT', `${label} must be an object`);
  return value;
}

function requireString(value, label, { empty = false, max = Infinity } = {}) {
  if (typeof value !== 'string' || (!empty && value.length === 0) || value.length > max) {
    fail('INVALID_EXPORT', `${label} is malformed`);
  }
  return value;
}

function requireVersion(value, label, { optional = false } = {}) {
  if (value === undefined && optional) return;
  if (!Number.isSafeInteger(value) || value < 0) fail('INVALID_EXPORT', `${label} is malformed`);
}

function assertKnownFields(value, fields, label) {
  if (Object.keys(value).some((field) => !fields.has(field))) fail('INVALID_EXPORT', `${label} has unsupported fields`);
}

function physicalKey(row) {
  return `${row.pk}\u0000${row.sk}`;
}

function keyFor(row) {
  return { pk: row.pk, sk: row.sk };
}

function compareRankThenId(left, right) {
  const leftId = left.id ?? left.placementId;
  const rightId = right.id ?? right.placementId;
  return left.position - right.position || leftId.localeCompare(rightId);
}

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_EXPORT', 'export contains a non-finite number');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) fail('INVALID_EXPORT', 'export contains an unsupported value');
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

function validateExportRows(profileId, rows) {
  if (!Array.isArray(rows)) fail('INVALID_EXPORT', 'profile partition rows must be an array');
  const expectedPk = `PROFILE#${profileId}`;
  const seenKeys = new Set();
  const profiles = [];
  const placements = [];
  const series = [];
  const aliases = [];
  for (const rowValue of rows) {
    const row = requireRecord(rowValue, 'export row');
    requireString(row.pk, 'export row pk');
    requireString(row.sk, 'export row sk');
    if (row.pk !== expectedPk) fail('INVALID_EXPORT', 'export row belongs to a different profile partition');
    const key = physicalKey(row);
    if (seenKeys.has(key)) fail('INVALID_EXPORT', 'export contains a duplicate physical key');
    seenKeys.add(key);

    if (row.sk === 'META') profiles.push(row);
    else if (row.sk.startsWith('PLACEMENT#')) placements.push(row);
    else if (row.sk.startsWith('SERIES#')) series.push(row);
    else if (row.sk.startsWith('SERIES_SLUG#')) aliases.push(row);
  }
  if (profiles.length !== 1) fail('INVALID_EXPORT', 'export must contain exactly one META profile row');
  return { profile: profiles[0], placements, series, aliases, rows };
}

function validateProfileRow(row, profileId) {
  assertKnownFields(row, PROFILE_FIELDS, 'legacy profile row');
  if (row.pk !== `PROFILE#${profileId}` || row.sk !== 'META' || row.recordType !== 'profile'
    || row.id !== profileId || !isCreatorStateId(row.id)) {
    fail('INVALID_EXPORT', 'legacy META identity is malformed');
  }
  requireVersion(row.version, 'legacy profile version');
  if (row.version >= Number.MAX_SAFE_INTEGER) fail('REVISION_EXHAUSTED', 'creator revision cannot be increased safely');
  requireString(row.displayName, 'profile displayName', { empty: true, max: CREATOR_FIELD_LIMITS.displayName });
  requireString(row.slug, 'profile slug', { empty: true, max: CREATOR_FIELD_LIMITS.slug });
  if (row.slug !== '' && !isCreatorSlug(row.slug)) fail('INVALID_EXPORT', 'profile slug is malformed');
  for (const field of ['city', 'country', 'bio']) {
    if (Object.hasOwn(row, field)) requireString(row[field], `profile ${field}`, { empty: true, max: CREATOR_FIELD_LIMITS[field] });
  }
  if (Object.hasOwn(row, 'programs')
    && (!Array.isArray(row.programs) || row.programs.some((value) => !CREATOR_PROGRAMS.includes(value)))) {
    fail('INVALID_EXPORT', 'profile programs are malformed');
  }
  if (Object.hasOwn(row, 'socials')) {
    requireRecord(row.socials, 'profile socials');
    for (const [name, value] of Object.entries(row.socials)) {
      if (!CREATOR_SOCIALS.includes(name) || typeof value !== 'string'
        || value.length > CREATOR_FIELD_LIMITS.social || (value !== '' && !isSafeCatalogUrl(value))) {
        fail('INVALID_EXPORT', 'profile socials are malformed');
      }
    }
  }
  if (typeof row.published !== 'boolean' || typeof row.hidden !== 'boolean') {
    fail('INVALID_EXPORT', 'profile visibility fields are malformed');
  }
  if (isPublicCreator(row) && !hasCreatorPublicIdentity(row.displayName, row.slug)) {
    fail('INVALID_EXPORT', 'published visible profile has malformed public identity');
  }
  requireVersion(row.createdAt, 'profile createdAt');
  requireVersion(row.updatedAt, 'profile updatedAt');
}

function validateAliasRows(aliasRows, profileId) {
  const bySeriesId = new Map();
  for (const row of aliasRows) {
    assertKnownFields(row, SERIES_ALIAS_FIELDS, 'Series alias row');
    const slug = row.sk.slice('SERIES_SLUG#'.length);
    if (!slug || !isCreatorSlug(slug) || row.recordType !== 'seriesAlias'
      || row.profileId !== profileId || row.slug !== slug || !SAFE_KEY_ID.test(row.seriesId)
      || !Number.isSafeInteger(row.version) || row.version < 1) {
      fail('INVALID_EXPORT', 'Series alias row is malformed');
    }
    const entries = bySeriesId.get(row.seriesId) ?? [];
    entries.push(row);
    bySeriesId.set(row.seriesId, entries);
  }
  return bySeriesId;
}

function validateSeriesRows(seriesRows, profileId) {
  const result = new Map();
  for (const row of seriesRows) {
    const id = row.sk.slice('SERIES#'.length);
    assertKnownFields(row, SERIES_FIELDS, 'legacy Series row');
    if (!SAFE_KEY_ID.test(id) || row.recordType !== 'series' || row.id !== id || row.profileId !== profileId) {
      fail('INVALID_EXPORT', 'legacy Series identity is malformed');
    }
    if (result.has(id)) fail('INVALID_EXPORT', 'export contains duplicate Series IDs');
    requireString(row.name, `Series ${id} name`, { max: CREATOR_FIELD_LIMITS.name });
    if (!row.name.trim()) fail('INVALID_EXPORT', `Series ${id} name is empty`);
    requireString(row.slug, `Series ${id} slug`, { max: CREATOR_FIELD_LIMITS.slug });
    if (!isCreatorSlug(row.slug)) fail('INVALID_EXPORT', `Series ${id} slug is malformed`);
    if (Object.hasOwn(row, 'description')) {
      requireString(row.description, `Series ${id} description`, { empty: true, max: CREATOR_FIELD_LIMITS.description });
    }
    requireVersion(row.version, `Series ${id} version`, { optional: true });
    requireVersion(row.createdAt, `Series ${id} createdAt`, { optional: true });
    requireVersion(row.updatedAt, `Series ${id} updatedAt`, { optional: true });
    result.set(id, row);
  }
  return result;
}

function validateSeriesCanonicalAliases(seriesById, aliasesBySeriesId) {
  for (const [seriesId, series] of seriesById) {
    const ownsCurrentSlug = aliasesBySeriesId.get(seriesId)?.some(({ slug }) => slug === series.slug);
    if (!ownsCurrentSlug) {
      fail('SERIES_CANONICAL_ALIAS_MISMATCH', `live Series ${seriesId} does not own its current slug alias ${series.slug}`);
    }
  }
}

function validatePlacementRows(placementRows, profileId, resourcesById) {
  const result = new Map();
  for (const row of placementRows) {
    const id = row.sk.slice('PLACEMENT#'.length);
    assertKnownFields(row, PLACEMENT_FIELDS, 'legacy placement row');
    if (!SAFE_KEY_ID.test(id) || row.recordType !== 'placement' || row.id !== id || row.profileId !== profileId) {
      fail('INVALID_EXPORT', 'legacy placement identity is malformed');
    }
    if (result.has(id)) fail('INVALID_EXPORT', 'export contains duplicate placement IDs');
    if (!isCatalogResourceIdWithinLimit(row.resourceId) || row.resourceId.startsWith('__')
      || !resourcesById.has(row.resourceId)) {
      fail('MISSING_RESOURCE', `placement ${id} does not resolve to an exported resource`);
    }
    if (!Number.isSafeInteger(row.position) || row.position < 0
      || typeof row.featured !== 'boolean' || typeof row.selectedForDirectory !== 'boolean') {
      fail('INVALID_EXPORT', `placement ${id} ordering or options are malformed`);
    }
    requireVersion(row.version, `placement ${id} version`, { optional: true });
    result.set(id, row);
  }
  return result;
}

function validateResources(resourceRows, placements) {
  if (!Array.isArray(resourceRows)) fail('INVALID_EXPORT', 'resourceRows must be an array');
  const byId = new Map();
  for (const row of resourceRows) {
    requireRecord(row, 'resource row');
    if (!isCatalogResourceIdWithinLimit(row.id) || row.id.startsWith('__')
      || (row.recordType !== undefined && row.recordType !== 'event')) {
      fail('INVALID_EXPORT', 'exported resource identity is malformed');
    }
    if (byId.has(row.id)) fail('INVALID_EXPORT', 'resource export contains duplicate IDs');
    byId.set(row.id, row);
  }
  for (const row of placements) {
    if (!byId.has(row.resourceId)) fail('MISSING_RESOURCE', `placement ${row.id} does not resolve to an exported resource`);
  }
  return byId;
}

function seriesMemberships(placement, existingSeries, aliasesBySeriesId) {
  if (!Object.hasOwn(placement, 'series')) return [];
  const memberships = placement.series;
  if (!isRecord(memberships)) fail('INVALID_EXPORT', `placement ${placement.id} memberships are malformed`);
  const result = [];
  for (const [seriesId, membership] of Object.entries(memberships)) {
    if (!SAFE_KEY_ID.test(seriesId) || !isRecord(membership) || Object.keys(membership).length !== 1
      || !Number.isSafeInteger(membership.position) || membership.position < 0) {
      fail('INVALID_EXPORT', `placement ${placement.id} membership is malformed`);
    }
    if (!existingSeries.has(seriesId)) {
      if (!aliasesBySeriesId.has(seriesId)) {
        fail('UNEXPLAINED_SERIES_REFERENCE', `placement ${placement.id} references missing Series ${seriesId} without its retained alias`);
      }
      continue;
    }
    result.push({ seriesId, placementId: placement.id, position: membership.position });
  }
  return result;
}

function buildCandidate(profileId, profileRow, placementById, seriesById, aliasesBySeriesId) {
  const general = { featured: [], ordinary: [] };
  const chapters = new Map([...seriesById.keys()].map((id) => [id, []]));
  const placements = {};

  for (const [id, row] of placementById) {
    placements[id] = {
      resourceId: row.resourceId,
      selectedForDirectory: row.selectedForDirectory,
    };
    general[row.featured ? 'featured' : 'ordinary'].push({ id, position: row.position });
    for (const membership of seriesMemberships(row, seriesById, aliasesBySeriesId)) {
      chapters.get(membership.seriesId).push({ placementId: id, position: membership.position });
    }
  }
  for (const group of Object.values(general)) group.sort(compareRankThenId);
  const order = {
    featured: general.featured.map(({ id }) => id),
    ordinary: general.ordinary.map(({ id }) => id),
  };
  const series = {};
  for (const [id, row] of seriesById) {
    const item = {
      name: row.name,
      slug: row.slug,
      chapters: chapters.get(id).sort(compareRankThenId).map(({ placementId }) => placementId),
    };
    for (const field of ['description', 'createdAt', 'updatedAt']) {
      if (Object.hasOwn(row, field)) item[field] = row[field];
    }
    series[id] = item;
  }

  const candidate = {
    pk: `PROFILE#${profileId}`,
    sk: 'META',
    recordType: 'creatorState',
    schemaVersion: 2,
    id: profileId,
    version: profileRow.version + 1,
  };
  for (const field of ['displayName', 'slug', 'city', 'country', 'bio', 'photo', 'published', 'hidden', 'createdAt', 'updatedAt']) {
    if (Object.hasOwn(profileRow, field)) candidate[field] = structuredClone(profileRow[field]);
  }
  candidate.programs = structuredClone(profileRow.programs ?? []);
  candidate.socials = structuredClone(profileRow.socials ?? {});
  candidate.placements = placements;
  candidate.order = order;
  candidate.series = series;
  return assertCreatorStateFits(candidate);
}

/** Build one profile's full backup, conversion candidate and conditional cleanup plan from an isolated export. */
export function createCreatorStateConversionPlan({ profileId, rows, resourceRows = [], preservedRows = [] } = {}) {
  if (!isCreatorStateId(profileId)) fail('INVALID_EXPORT', 'profileId is malformed');
  if (!Array.isArray(preservedRows) || preservedRows.some((item) => !isRecord(item)
    || typeof item.table !== 'string' || !isRecord(item.key) || !isRecord(item.item))) {
    fail('INVALID_EXPORT', 'preservedRows must retain table, key and full item');
  }
  const partition = validateExportRows(profileId, rows);
  const resourcesById = validateResources(resourceRows, partition.placements);
  const seriesById = validateSeriesRows(partition.series, profileId);
  const placementById = validatePlacementRows(partition.placements, profileId, resourcesById);
  const aliasesBySeriesId = validateAliasRows(partition.aliases, profileId);
  validateSeriesCanonicalAliases(seriesById, aliasesBySeriesId);
  validateProfileRow(partition.profile, profileId);
  const candidate = buildCandidate(profileId, partition.profile, placementById, seriesById, aliasesBySeriesId);
  const conversionSourceRows = [
    partition.profile,
    ...partition.placements,
    ...partition.series,
    ...partition.aliases,
  ].sort((left, right) => left.sk.localeCompare(right.sk));
  const cleanupRows = [...partition.placements, ...partition.series]
    .sort((left, right) => left.sk.localeCompare(right.sk));
  const backup = {
    profileRows: structuredClone(rows),
    resourceRows: structuredClone(resourceRows),
    preservedRows: structuredClone(preservedRows),
  };
  const orderedBackup = [...rows].sort((left, right) => left.sk.localeCompare(right.sk));
  const sizes = dynamoDbCreatorStateSizes(candidate);
  return {
    format: PLAN_FORMAT,
    profileId,
    sourceFingerprint: fingerprint(conversionSourceRows),
    backupFingerprint: fingerprint({ rows: orderedBackup, resourceRows, preservedRows }),
    backup,
    conversionSourceRows: structuredClone(conversionSourceRows),
    convertedState: structuredClone(candidate),
    sizes: { contentBytes: sizes.contentBytes, itemBytes: sizes.itemBytes },
    conversion: {
      table: 'profiles',
      key: { pk: `PROFILE#${profileId}`, sk: 'META' },
      expectedProfileVersion: partition.profile.version,
    },
    cleanup: {
      table: 'profiles',
      rows: structuredClone(cleanupRows),
      maxDeletesPerTransaction: MAX_CLEANUP_DELETES,
    },
    restore: {
      table: 'profiles',
      originalMeta: structuredClone(partition.profile),
      rows: structuredClone(cleanupRows),
    },
  };
}

function getPlanInput(plan) {
  requireRecord(plan, 'conversion plan');
  if (plan.format !== PLAN_FORMAT || !isCreatorStateId(plan.profileId) || !isRecord(plan.backup)) {
    fail('INVALID_PLAN', 'conversion plan format or identity is invalid');
  }
  const rebuilt = createCreatorStateConversionPlan({
    profileId: plan.profileId,
    rows: plan.backup.profileRows,
    resourceRows: plan.backup.resourceRows,
    preservedRows: plan.backup.preservedRows,
  });
  for (const field of ['sourceFingerprint', 'backupFingerprint', 'conversionSourceRows', 'convertedState', 'sizes', 'conversion', 'cleanup', 'restore']) {
    if (!isDeepStrictEqual(plan[field], rebuilt[field])) fail('INVALID_PLAN', `conversion plan ${field} does not match its backup`);
  }
  return rebuilt;
}

function equalityCondition(row, { includeIdentity = true } = {}) {
  const names = { '#pk': 'pk' };
  const values = {};
  const terms = ['attribute_exists(#pk)'];
  const fields = [];
  if (includeIdentity) fields.push('recordType', 'id', 'profileId');
  for (const field of fields) {
    if (!Object.hasOwn(row, field)) continue;
    const token = `#a${Object.keys(values).length}`;
    const valueToken = `:a${Object.keys(values).length}`;
    names[token] = field;
    values[valueToken] = row[field];
    terms.push(`${token} = ${valueToken}`);
  }
  let index = Object.keys(values).length;
  for (const [field, value] of Object.entries(row)) {
    if (['pk', 'sk', 'recordType', 'id', 'profileId', 'version'].includes(field)
      || (value !== null && typeof value === 'object')) continue;
    const token = `#a${index}`;
    const valueToken = `:a${index}`;
    names[token] = field;
    values[valueToken] = value;
    terms.push(`${token} = ${valueToken}`);
    index += 1;
  }
  names['#version'] = 'version';
  if (Object.hasOwn(row, 'version')) {
    values[':version'] = row.version;
    terms.push('#version = :version');
  } else {
    terms.push('attribute_not_exists(#version)');
  }
  return {
    ConditionExpression: terms.join(' AND '),
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

export function buildCreatorStateConversionTransaction(plan, profilesTableName) {
  const verified = getPlanInput(plan);
  requireString(profilesTableName, 'profiles table name');
  const source = verified.backup.profileRows.find((row) => row.sk === 'META');
  return [{
    Put: {
      TableName: profilesTableName,
      Item: structuredClone(verified.convertedState),
      ...equalityCondition(source),
    },
  }];
}

function cleanupTransactionsForRows(verified, profilesTableName, rows) {
  const output = [];
  for (let offset = 0; offset < rows.length; offset += MAX_CLEANUP_DELETES) {
    const batch = rows.slice(offset, offset + MAX_CLEANUP_DELETES);
    const names = { '#recordType': 'recordType', '#id': 'id', '#version': 'version' };
    const values = {
      ':recordType': 'creatorState',
      ':id': verified.profileId,
      ':version': verified.convertedState.version,
    };
    const transactItems = [{
      ConditionCheck: {
        TableName: profilesTableName,
        Key: { pk: `PROFILE#${verified.profileId}`, sk: 'META' },
        ConditionExpression: '#recordType = :recordType AND #id = :id AND #version = :version',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    }];
    for (const row of batch) {
      transactItems.push({
        Delete: {
          TableName: profilesTableName,
          Key: keyFor(row),
          ...equalityCondition(row),
        },
      });
    }
    if (transactItems.length > MAX_TRANSACTION_ACTIONS) fail('INVALID_PLAN', 'cleanup transaction exceeds DynamoDB action limit');
    output.push(transactItems);
  }
  return output;
}

export function buildCreatorStateCleanupTransactions(plan, profilesTableName) {
  const verified = getPlanInput(plan);
  requireString(profilesTableName, 'profiles table name');
  return cleanupTransactionsForRows(verified, profilesTableName, verified.cleanup.rows);
}

async function assertRowsUnchanged(rows, tableName, readPhysical) {
  for (const expected of rows) {
    const current = await readPhysical(tableName, keyFor(expected));
    if (!isDeepStrictEqual(current, expected)) {
      fail('SOURCE_CHANGED', `source row changed at ${expected.pk}/${expected.sk}`);
    }
  }
}

/** Conditional, one-item forward replacement after an exact physical preflight. */
export async function applyCreatorStateConversion(plan, {
  tableName,
  readPhysical,
  transact,
} = {}) {
  const verified = getPlanInput(plan);
  requireString(tableName, 'profiles table name');
  if (typeof readPhysical !== 'function' || typeof transact !== 'function') {
    throw new TypeError('conversion apply requires readPhysical and transact functions');
  }
  const alreadyConverted = await readPhysical(tableName, verified.conversion.key);
  if (isDeepStrictEqual(alreadyConverted, verified.convertedState)) return alreadyConverted;
  await assertRowsUnchanged(verified.conversionSourceRows, tableName, readPhysical);
  await transact(buildCreatorStateConversionTransaction(verified, tableName));
  const current = await readPhysical(tableName, verified.conversion.key);
  if (!isDeepStrictEqual(current, verified.convertedState)) {
    fail('CONVERSION_VERIFY_FAILED', 'converted META does not match the planned aggregate');
  }
  return current;
}

/** Remove only unchanged legacy PLACEMENT/SERIES rows, retaining their alias and backup. */
export async function applyCreatorStateCleanup(plan, {
  tableName,
  readPhysical,
  transact,
} = {}) {
  const verified = getPlanInput(plan);
  requireString(tableName, 'profiles table name');
  if (typeof readPhysical !== 'function' || typeof transact !== 'function') {
    throw new TypeError('cleanup apply requires readPhysical and transact functions');
  }
  const currentState = await readPhysical(tableName, verified.conversion.key);
  if (!isDeepStrictEqual(currentState, verified.convertedState)) {
    fail('SOURCE_CHANGED', 'creator META changed after conversion; legacy cleanup is unsafe');
  }
  const pendingRows = [];
  for (const row of verified.cleanup.rows) {
    const current = await readPhysical(tableName, keyFor(row));
    if (current === undefined || current === null) continue;
    if (!isDeepStrictEqual(current, row)) fail('SOURCE_CHANGED', `legacy row changed at ${row.pk}/${row.sk}`);
    pendingRows.push(row);
  }
  const transactions = cleanupTransactionsForRows(verified, tableName, pendingRows);
  for (const items of transactions) await transact(items);
  for (const row of verified.cleanup.rows) {
    const current = await readPhysical(tableName, keyFor(row));
    if (current !== undefined && current !== null) fail('CLEANUP_VERIFY_FAILED', `legacy row remains at ${row.pk}/${row.sk}`);
  }
  const finalState = await readPhysical(tableName, verified.conversion.key);
  if (!isDeepStrictEqual(finalState, verified.convertedState)) {
    fail('SOURCE_CHANGED', 'creator META changed during legacy cleanup');
  }
  return { deletedCount: verified.cleanup.rows.length, state: finalState };
}

/** Restore the original META and any missing legacy rows while the cutover remains gated. */
export async function applyCreatorStateRestore(plan, {
  tableName,
  readPhysical,
  transact,
} = {}) {
  const verified = getPlanInput(plan);
  requireString(tableName, 'profiles table name');
  if (typeof readPhysical !== 'function' || typeof transact !== 'function') {
    throw new TypeError('restore requires readPhysical and transact functions');
  }
  const state = await readPhysical(tableName, verified.conversion.key);
  if (isDeepStrictEqual(state, verified.restore.originalMeta)) {
    await assertRowsUnchanged(verified.restore.rows, tableName, readPhysical);
    return state;
  }
  if (!isDeepStrictEqual(state, verified.convertedState)) {
    fail('SOURCE_CHANGED', 'creator META is not the planned aggregate; restore is unsafe');
  }

  const missing = [];
  for (const original of verified.restore.rows) {
    const current = await readPhysical(tableName, keyFor(original));
    if (current === undefined || current === null) missing.push(original);
    else if (!isDeepStrictEqual(current, original)) fail('SOURCE_CHANGED', `legacy row changed at ${original.pk}/${original.sk}`);
  }
  for (let offset = 0; offset < missing.length; offset += MAX_TRANSACTION_ACTIONS) {
    const items = missing.slice(offset, offset + MAX_TRANSACTION_ACTIONS).map((row) => ({
      Put: {
        TableName: tableName,
        Item: structuredClone(row),
        ConditionExpression: 'attribute_not_exists(#pk)',
        ExpressionAttributeNames: { '#pk': 'pk' },
      },
    }));
    await transact(items);
  }
  const currentState = await readPhysical(tableName, verified.conversion.key);
  if (!isDeepStrictEqual(currentState, verified.convertedState)) {
    fail('SOURCE_CHANGED', 'creator META changed before restore');
  }
  await transact([{
    Put: {
      TableName: tableName,
      Item: structuredClone(verified.restore.originalMeta),
      ...equalityCondition(verified.convertedState),
    },
  }]);
  const restored = await readPhysical(tableName, verified.conversion.key);
  if (!isDeepStrictEqual(restored, verified.restore.originalMeta)) {
    fail('RESTORE_VERIFY_FAILED', 'restored META does not match the backup');
  }
  return restored;
}

export const creatorStateCutoverInternals = Object.freeze({
  MAX_CLEANUP_DELETES,
  PLAN_FORMAT,
  compareRankThenId,
  fingerprint,
});

import { readFile } from 'node:fs/promises';
import { validateCatalogUrl } from './catalog-url-safety.mjs';
import { classifyLegacyResource, validateTaxonomy } from './resource-taxonomy.mjs';
import { DISCOVERY_FIELDS, validateDiscoveryMetadata } from './resource-discovery.mjs';
import { projectPublicEvent } from './events.mjs';
import { CREATOR_FIELD_LIMITS, hasCreatorPublicIdentity, isCreatorSlug, isCreatorStateId } from './creator-values.mjs';
import { canonicalCreatorSeriesPath, isPublicCreator } from './creator-public.mjs';
import {
  containsCarriageReturnOrNul,
  isCatalogResourceIdWithinLimit,
  isPublicCatalogResourceId,
  MAX_CATALOG_RESOURCE_ID_BYTES,
} from './catalog-identity.mjs';
import { CREATOR_STATE_SCHEMA_VERSION, validateCreatorSequences } from './creator-state.mjs';

export { isCatalogResourceIdWithinLimit, MAX_CATALOG_RESOURCE_ID_BYTES, validateCatalogUrl };

export const DEFAULT_AWS_REGION = 'us-east-1';

const PUBLIC_FIELDS = Object.freeze([
  'id',
  'title',
  'url',
  'description',
  'category',
  'order',
  'featured',
  'kind',
  'format',
  'topics',
]);
const LEGACY_REQUIRED_FIELDS = PUBLIC_FIELDS.slice(0, 7);

const SCAN_EXPRESSION_NAMES = Object.freeze({
  '#id': 'id',
  '#title': 'title',
  '#url': 'url',
  '#description': 'description',
  '#category': 'category',
  '#order': 'order',
  '#featured': 'featured',
  '#kind': 'kind',
  '#format': 'format',
  '#topics': 'topics',
  '#addedAt': 'addedAt',
  '#country': 'country',
  '#level': 'level',
  '#sourceId': 'sourceId',
  '#communityId': 'communityId',
  '#eventId': 'eventId',
  '#recordType': 'recordType',
  '#startsAt': 'startsAt',
  '#endsAt': 'endsAt',
  '#timeZone': 'timeZone',
  '#organizer': 'organizer',
  '#mode': 'mode',
  '#place': 'place',
  '#city': 'city',
  '#venueCountry': 'venueCountry',
  '#registrationUrl': 'registrationUrl',
  '#directoryControl': 'directoryControl',
  '#hidden': 'hidden',
  '#approvalRevoked': 'approvalRevoked',
});

const CREATOR_SCAN_EXPRESSION_NAMES = Object.freeze({
  '#pk': 'pk',
  '#sk': 'sk',
  '#recordType': 'recordType',
  '#schemaVersion': 'schemaVersion',
  '#id': 'id',
  '#displayName': 'displayName',
  '#slug': 'slug',
  '#published': 'published',
  '#hidden': 'hidden',
  '#placements': 'placements',
  '#order': 'order',
  '#series': 'series',
});

/**
 * Read the published public catalog.
 *
 * The source is selected explicitly. A fixture is useful for local/CI builds,
 * while production reads CATALOG_TABLE from DynamoDB. There is deliberately no
 * fallback from a failed or missing database read to a fixture.
 */
export async function loadCatalog(options = {}) {
  const config = resolveCatalogConfig(options);

  let items;
  let creatorState;
  if (config.fixturePath) {
    const fixture = await loadFixture(config.fixturePath);
    if (Array.isArray(fixture)) {
      items = fixture;
    } else {
      items = fixture.items;
      if (fixture.creators !== undefined) creatorState = { creators: fixture.creators };
    }
  } else {
    const scanPage = options.scanPage ?? createDynamoScanPage({
      region: config.region,
      docClient: options.docClient,
    });
    items = await scanCatalogItems(scanPage, config.tableName);
    if (config.creatorTableName) {
      const scanCreatorPage = options.scanCreatorPage ?? createDynamoScanPage({
        region: config.region,
        docClient: options.creatorDocClient ?? options.docClient,
      });
      creatorState = await scanCreatorItems(scanCreatorPage, config.creatorTableName);
    }
  }

  return creatorState === undefined
    ? projectPublishedCatalog(items)
    : projectPublishedCatalog(items, creatorState);
}

/**
 * Resolve the catalog source and fail when both source modes are configured.
 * Options are intentionally explicit so tests can inject a page reader without
 * importing or constructing the AWS clients.
 */
export function resolveCatalogConfig(options = {}, env = process.env) {
  const fixturePath = valueOrUndefined(options.fixturePath ?? env.CATALOG_FIXTURE);
  const tableName = valueOrUndefined(options.tableName ?? env.CATALOG_TABLE);
  const creatorTableName = valueOrUndefined(options.creatorTableName ?? env.CREATOR_PROFILES_TABLE);
  const region = valueOrUndefined(options.region ?? env.AWS_REGION) ?? DEFAULT_AWS_REGION;

  if (fixturePath && tableName) {
    throw new Error('Catalog source conflict: configure CATALOG_FIXTURE or CATALOG_TABLE, not both');
  }
  if (!fixturePath && !tableName) {
    throw new Error('Catalog source missing: set CATALOG_TABLE or explicitly set CATALOG_FIXTURE');
  }
  if (fixturePath && (options.scanPage || options.scanCreatorPage)) {
    throw new Error('Catalog source conflict: a fixture cannot be used with a live scan reader');
  }

  return { fixturePath, tableName, creatorTableName, region };
}

/**
 * Consume every DynamoDB scan page. The reader receives the same parameter
 * shape as DocumentClient.send(ScanCommand), which keeps this function easy to
 * test without credentials.
 */
export async function scanCatalogItems(scanPage, tableName) {
  if (typeof scanPage !== 'function') {
    throw new TypeError('Catalog scan reader must be a function');
  }
  if (!tableName) {
    throw new Error('Catalog scan requires a table name');
  }

  const items = [];
  let exclusiveStartKey;
  let pageNumber = 0;
  const seenKeys = new Set();

  do {
    pageNumber += 1;
    const params = {
      TableName: tableName,
      Select: 'SPECIFIC_ATTRIBUTES',
      ConsistentRead: true,
      ProjectionExpression: '#id,#title,#url,#description,#category,#order,#featured,#kind,#format,#topics,#addedAt,#country,#level,#sourceId,#communityId,#eventId,#recordType,#startsAt,#endsAt,#timeZone,#organizer,#mode,#place,#city,#venueCountry,#registrationUrl,#directoryControl,#hidden,#approvalRevoked,published',
      ExpressionAttributeNames: SCAN_EXPRESSION_NAMES,
    };
    if (exclusiveStartKey !== undefined) {
      params.ExclusiveStartKey = exclusiveStartKey;
    }

    let page;
    try {
      page = await scanPage(params);
    } catch (error) {
      throw new Error(`Catalog scan failed on page ${pageNumber}: ${error?.message ?? String(error)}`, {
        cause: error,
      });
    }

    if (!page || !Array.isArray(page.Items)) {
      throw new Error(`Catalog scan returned malformed page ${pageNumber}: Items must be an array`);
    }
    items.push(...page.Items);

    const nextKey = page.LastEvaluatedKey;
    if (nextKey !== undefined && nextKey !== null && (typeof nextKey !== 'object' || Array.isArray(nextKey))) {
      throw new Error(`Catalog scan returned a malformed pagination key on page ${pageNumber}`);
    }
    if (nextKey && typeof nextKey === 'object' && Object.keys(nextKey).length > 0) {
      const keyFingerprint = JSON.stringify(nextKey);
      if (seenKeys.has(keyFingerprint)) {
        throw new Error(`Catalog scan repeated a pagination key on page ${pageNumber}`);
      }
      seenKeys.add(keyFingerprint);
      exclusiveStartKey = nextKey;
    } else {
      exclusiveStartKey = undefined;
    }
  } while (exclusiveStartKey !== undefined);

  return items;
}

/** Read only public fields and ordered content from creator-state META items. */
export async function scanCreatorItems(scanPage, tableName) {
  if (typeof scanPage !== 'function') throw new TypeError('Creator-state scan reader must be a function');
  if (!tableName) throw new Error('Creator-state scan requires a table name');

  const items = [];
  let exclusiveStartKey;
  let pageNumber = 0;
  const seenKeys = new Set();
  do {
    pageNumber += 1;
    const params = {
      TableName: tableName,
      Select: 'SPECIFIC_ATTRIBUTES',
      ConsistentRead: true,
      ProjectionExpression: '#pk,#sk,#recordType,#schemaVersion,#id,#displayName,#slug,#published,#hidden,#placements,#order,#series',
      ExpressionAttributeNames: CREATOR_SCAN_EXPRESSION_NAMES,
    };
    if (exclusiveStartKey !== undefined) params.ExclusiveStartKey = exclusiveStartKey;
    let page;
    try {
      page = await scanPage(params);
    } catch (error) {
      throw new Error(`Creator-state scan failed on page ${pageNumber}: ${error?.message ?? String(error)}`, { cause: error });
    }
    if (!page || !Array.isArray(page.Items)) {
      throw new Error(`Creator-state scan returned malformed page ${pageNumber}: Items must be an array`);
    }
    items.push(...page.Items);
    const nextKey = page.LastEvaluatedKey;
    if (nextKey !== undefined && nextKey !== null && (typeof nextKey !== 'object' || Array.isArray(nextKey))) {
      throw new Error(`Creator-state scan returned a malformed pagination key on page ${pageNumber}`);
    }
    if (nextKey && typeof nextKey === 'object' && Object.keys(nextKey).length > 0) {
      const fingerprint = JSON.stringify(nextKey);
      if (seenKeys.has(fingerprint)) throw new Error(`Creator-state scan repeated a pagination key on page ${pageNumber}`);
      seenKeys.add(fingerprint);
      exclusiveStartKey = nextKey;
    } else {
      exclusiveStartKey = undefined;
    }
  } while (exclusiveStartKey !== undefined);
  return items;
}

export function normalizeCreatorRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Creator-state source must return an array of records');
  const aggregateRows = [];
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Creator-state record ${index + 1} is not an object`);
    }
    const aggregate = classifyCreatorTableRow(row, index);
    if (aggregate) aggregateRows.push(aggregate);
  }
  return normalizeCreatorAggregates(aggregateRows);
}

/**
 * Keep only the intentionally public fields from records published by the
 * owner. A malformed publication flag is an input error; a missing flag is
 * treated as unpublished and therefore is not eligible for projection.
 */
export function projectPublishedCatalog(items, creatorState) {
  if (!Array.isArray(items)) {
    throw new TypeError('Catalog source must return an array of records');
  }

  const creatorResources = items.filter((item) => item && typeof item === 'object' && !Array.isArray(item)
    && item.directoryControl === 'creator');
  if (creatorResources.length > 0 && creatorState === undefined) {
    throw new Error('Creator directory state is required to project creator-controlled resources');
  }
  const state = Array.isArray(creatorState)
    ? normalizeCreatorRows(creatorState)
    : normalizeCreatorState(creatorState ?? { creators: [] });
  const placementsByResource = new Map();
  const seriesByResource = new Map();
  for (const creator of state.creators) {
    const placementIds = [...creator.order.featured, ...creator.order.ordinary];
    for (const placementId of placementIds) {
      const placement = creator.placements[placementId];
      const list = placementsByResource.get(placement.resourceId) ?? [];
      list.push({ creator, placement });
      placementsByResource.set(placement.resourceId, list);
    }
    if (!isPublicCreator(creator)) continue;
    for (const [seriesId, series] of Object.entries(creator.series)) {
      for (const placementId of series.chapters) {
        const placement = creator.placements[placementId];
        if (!placement.selectedForDirectory) continue;
        const associations = seriesByResource.get(placement.resourceId) ?? new Map();
        associations.set(seriesId, {
          seriesId,
          name: series.name,
          creatorName: creator.displayName,
          href: canonicalCreatorSeriesPath(creator.slug, series.slug),
        });
        seriesByResource.set(placement.resourceId, associations);
      }
    }
  }

  const records = [];
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Catalog record ${index + 1} is not an object`);
    }
    if ((typeof item.id === 'string' && item.id.startsWith('__')) || item.recordType === 'urlReservation') continue;
    if (Object.hasOwn(item, 'published') && typeof item.published !== 'boolean') {
      throw new Error(`Catalog record ${index + 1} has a malformed published flag`);
    }
    if (Object.hasOwn(item, 'hidden') && typeof item.hidden !== 'boolean') {
      throw new Error(`Catalog record ${index + 1} has a malformed hidden flag`);
    }
    if (Object.hasOwn(item, 'approvalRevoked') && typeof item.approvalRevoked !== 'boolean') {
      throw new Error(`Catalog record ${index + 1} has a malformed approval revocation flag`);
    }
    if (Object.hasOwn(item, 'directoryControl') && !['creator', 'editorial'].includes(item.directoryControl)) {
      throw new Error(`Catalog record ${index + 1} has an invalid directory control`);
    }
    if (item.published !== true || item.approvalRevoked === true) {
      continue;
    }
    if (item.hidden === true) continue;
    const placements = placementsByResource.get(item.id) ?? [];
    if (item.directoryControl === 'creator') {
      // Legacy creator links use exact private IDs. CR and NUL cannot survive in directory card fragments.
      if (item.recordType === undefined && isCatalogResourceIdWithinLimit(item.id) && containsCarriageReturnOrNul(item.id)) {
        continue;
      }
      const eligible = placements.some(({ creator, placement }) => {
        return placement.selectedForDirectory && isPublicCreator(creator);
      });
      if (!eligible) continue;
    }

    const record = projectPublicRecord(item, index);
    const series = [...(seriesByResource.get(item.id)?.values() ?? [])]
      .sort((left, right) => left.seriesId < right.seriesId ? -1 : left.seriesId > right.seriesId ? 1 : 0);
    if (series.length) record.series = series;
    records.push(record);
  }

  records.sort(compareCatalogRecords);
  return records;
}

function normalizeCreatorState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)
      || !Array.isArray(state.creators)) {
    throw new TypeError('Creator directory state must contain a creator aggregate array');
  }
  return normalizeCreatorAggregates(state.creators);
}

/**
 * Classify table rows before logical creator admission. Only the profile META
 * row is a catalog input; auxiliary profile rows remain outside the public
 * reader. A selected aggregate must prove its physical key, discriminator,
 * and payload identity before its logical fields are considered.
 */
function classifyCreatorTableRow(row, index) {
  const creatorKey = typeof row.pk === 'string' && row.pk.startsWith('PROFILE#') && row.sk === 'META';
  if (row.recordType !== 'creatorState' && !creatorKey) return undefined;

  const id = typeof row.pk === 'string' && row.pk.startsWith('PROFILE#') ? row.pk.slice('PROFILE#'.length) : '';
  if (!id || row.sk !== 'META' || row.recordType !== 'creatorState' || row.id !== id) {
    throw new Error(`Creator-state aggregate ${index + 1} has an invalid schema identity`);
  }
  return row;
}

/**
 * Admit logical creator facts from either a fixture or a checked table row,
 * then retain only the fields used by the public catalog association pass.
 */
function normalizeCreatorAggregates(aggregates) {
  const creatorIds = new Set();
  const creators = aggregates.map((creator, index) => {
    if (!creator || typeof creator !== 'object' || Array.isArray(creator)
        || typeof creator.id !== 'string' || !isCreatorStateId(creator.id)
        || creator.schemaVersion !== CREATOR_STATE_SCHEMA_VERSION
        || typeof creator.displayName !== 'string' || creator.displayName.length > CREATOR_FIELD_LIMITS.displayName
        || typeof creator.slug !== 'string' || (creator.slug !== '' && !isCreatorSlug(creator.slug))
        || typeof creator.published !== 'boolean' || typeof creator.hidden !== 'boolean') {
      throw new Error(`Creator catalog aggregate ${index + 1} is malformed`);
    }
    if (isPublicCreator(creator) && !hasCreatorPublicIdentity(creator.displayName, creator.slug)) {
      throw new Error(`Creator catalog aggregate ${index + 1} has malformed public identity`);
    }
    if (creatorIds.has(creator.id)) throw new Error(`Creator catalog aggregate ${index + 1} is duplicated`);
    creatorIds.add(creator.id);
    validateCreatorSequences({ placements: creator.placements, order: creator.order, series: creator.series });
    return {
      id: creator.id,
      displayName: creator.displayName,
      slug: creator.slug,
      published: creator.published,
      hidden: creator.hidden,
      placements: creator.placements,
      order: creator.order,
      series: creator.series,
    };
  });
  return { creators };
}

/**
 * Validate and project one eligible record. The result is a fresh object with
 * no private or unknown fields, so callers can safely serialize it for HTML.
 */
export function projectPublicRecord(item, index = 0) {
  if (item.recordType === 'event') {
    if (!isCatalogResourceIdWithinLimit(item.id)) {
      throw new Error(`Catalog record ${index + 1} has an ID longer than ${MAX_CATALOG_RESOURCE_ID_BYTES} UTF-8 bytes`);
    }
    return projectPublicEvent(item, index, validateCatalogUrl);
  }
  if (item.recordType !== undefined) throw new Error(`Catalog record ${index + 1} has an invalid record type`);
  for (const field of LEGACY_REQUIRED_FIELDS) {
    if (!Object.hasOwn(item, field)) {
      throw new Error(`Catalog record ${index + 1} is missing public field ${field}`);
    }
  }

  const taxonomy = validateTaxonomy(hasAnyTaxonomy(item) ? item : classifyLegacyResource(item), index);
  const record = {
    id: item.id,
    title: item.title,
    url: item.url,
    description: item.description,
    category: item.category,
    order: item.order,
    featured: item.featured,
    ...taxonomy,
    ...Object.fromEntries(DISCOVERY_FIELDS.filter((field) => Object.hasOwn(item, field)).map((field) => [field, item[field]])),
    ...(taxonomy.kind === 'community' && Object.hasOwn(item, 'city') ? { city: item.city } : {}),
  };
  validatePublicRecord(record, index);
  return record;
}

export function validatePublicRecord(record, index = 0) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`Catalog record ${index + 1} is not an object`);
  }
  for (const field of PUBLIC_FIELDS) {
    if (!Object.hasOwn(record, field)) {
      throw new Error(`Catalog record ${index + 1} is missing public field ${field}`);
    }
  }
  if (!isPublicCatalogResourceId(record.id)) {
    if (typeof record.id === 'string' && record.id.length > 0 && !isCatalogResourceIdWithinLimit(record.id)) {
      throw new Error(`Catalog record ${index + 1} has an ID longer than ${MAX_CATALOG_RESOURCE_ID_BYTES} UTF-8 bytes`);
    }
    throw new Error(`Catalog record ${index + 1} has an invalid id`);
  }
  if (typeof record.title !== 'string' || record.title.length === 0) {
    throw new Error(`Catalog record ${index + 1} has an invalid title`);
  }
  if (typeof record.description !== 'string') {
    throw new Error(`Catalog record ${index + 1} has an invalid description`);
  }
  if (typeof record.category !== 'string' || record.category.length === 0) {
    const error = new Error(`Catalog record ${index + 1} has an invalid category`);
    if (record.category === '') error.fieldErrors = [{ field: 'category', reason: 'required' }];
    throw error;
  }
  if (!Number.isSafeInteger(record.order)) {
    throw new Error(`Catalog record ${index + 1} has an invalid order`);
  }
  if (typeof record.featured !== 'boolean') {
    throw new Error(`Catalog record ${index + 1} has an invalid featured flag`);
  }
  validateTaxonomy(record, index);
  validateDiscoveryMetadata(record, index);
  validateCatalogUrl(record.url, index);
  return record;
}

function hasAnyTaxonomy(item) {
  return ['kind', 'format', 'topics'].some((field) => Object.hasOwn(item, field));
}

export function compareCatalogRecords(left, right) {
  return (right.order ?? 0) - (left.order ?? 0) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

export async function loadFixture(fixturePath) {
  let contents;
  try {
    contents = await readFile(fixturePath, 'utf8');
  } catch (error) {
    throw new Error(`Catalog fixture could not be read: ${fixturePath}`, { cause: error });
  }

  let items;
  try {
    items = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Catalog fixture is not valid JSON: ${fixturePath}`, { cause: error });
  }
  if (Array.isArray(items)) return items;
  if (!items || typeof items !== 'object' || Array.isArray(items)
      || !Array.isArray(items.items)
      || Object.keys(items).some((field) => field !== 'items' && field !== 'creators')
      || (items.creators !== undefined && !Array.isArray(items.creators))) {
    throw new Error(`Catalog fixture must contain an array or an object with items and optional v2 creators: ${fixturePath}`);
  }
  return items;
}

function valueOrUndefined(value) {
  if (typeof value !== 'string') {
    return value == null ? undefined : String(value);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function createDynamoScanPage({ region, docClient }) {
  let clientPromise;
  return async (params) => {
    if (!clientPromise) {
      clientPromise = createDocumentClient(region, docClient);
    }
    const { client, ScanCommand } = await clientPromise;
    return client.send(new ScanCommand(params));
  };
}

async function createDocumentClient(region, providedClient) {
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  if (providedClient) {
    return { client: providedClient, ScanCommand };
  }
  const [{ DynamoDBClient }, { DynamoDBDocumentClient }] = await Promise.all([
    import('@aws-sdk/client-dynamodb'),
    import('@aws-sdk/lib-dynamodb'),
  ]);
  const rawClient = new DynamoDBClient({ region });
  return { client: DynamoDBDocumentClient.from(rawClient), ScanCommand };
}

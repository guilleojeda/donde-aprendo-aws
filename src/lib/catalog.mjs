import { readFile } from 'node:fs/promises';
import { classifyLegacyResource, validateTaxonomy } from './resource-taxonomy.mjs';
import { DISCOVERY_FIELDS, validateDiscoveryMetadata } from './resource-discovery.mjs';
import { projectPublicEvent } from './events.mjs';

export const DEFAULT_AWS_REGION = 'us-east-1';
export const MAX_CATALOG_RESOURCE_ID_BYTES = 256;

export function isCatalogResourceIdWithinLimit(id) {
  return typeof id === 'string' && id.length > 0
    && Buffer.byteLength(id, 'utf8') <= MAX_CATALOG_RESOURCE_ID_BYTES;
}

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
  '#id': 'id',
  '#profileId': 'profileId',
  '#resourceId': 'resourceId',
  '#published': 'published',
  '#hidden': 'hidden',
  '#selectedForDirectory': 'selectedForDirectory',
  '#selected': 'selected',
  '#slug': 'slug',
  '#displayName': 'displayName',
  '#name': 'name',
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
      creatorState = {
        profiles: fixture.profiles,
        placements: fixture.placements,
        ...(fixture.series === undefined ? {} : { series: fixture.series }),
      };
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
      creatorState = normalizeCreatorRows(await scanCreatorItems(scanCreatorPage, config.creatorTableName));
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

/** Read only the public profile, placement, and series projection from the separate table. */
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
      ProjectionExpression: '#pk,#sk,#recordType,#id,#profileId,#resourceId,#published,#hidden,#selectedForDirectory,#selected,#slug,#displayName,#name,#series',
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
  const profiles = [];
  const placements = [];
  const series = [];
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Creator-state record ${index + 1} is not an object`);
    }
    if (row.recordType === 'profile') {
      const pkId = typeof row.pk === 'string' && row.pk.startsWith('PROFILE#') ? row.pk.slice(8) : undefined;
      const id = row.id ?? pkId;
      if (typeof id !== 'string' || id.length === 0 || (pkId && pkId !== id)) {
        throw new Error(`Creator-state profile ${index + 1} has an invalid ID`);
      }
      if (typeof row.published !== 'boolean') throw new Error(`Creator-state profile ${index + 1} has a malformed published flag`);
      if (Object.hasOwn(row, 'hidden') && typeof row.hidden !== 'boolean') {
        throw new Error(`Creator-state profile ${index + 1} has a malformed hidden flag`);
      }
      if (Object.hasOwn(row, 'slug') && typeof row.slug !== 'string') {
        throw new Error(`Creator-state profile ${index + 1} has a malformed slug`);
      }
      if (Object.hasOwn(row, 'displayName') && typeof row.displayName !== 'string') {
        throw new Error(`Creator-state profile ${index + 1} has a malformed display name`);
      }
      profiles.push({
        id,
        published: row.published,
        hidden: row.hidden ?? false,
        ...(row.displayName === undefined ? {} : { displayName: row.displayName }),
        ...(row.slug === undefined ? {} : { slug: row.slug }),
      });
    } else if (row.recordType === 'placement') {
      const pkId = typeof row.pk === 'string' && row.pk.startsWith('PROFILE#') ? row.pk.slice(8) : undefined;
      const profileId = row.profileId ?? pkId;
      if (typeof profileId !== 'string' || profileId.length === 0 || (pkId && pkId !== profileId)
          || !isCatalogResourceIdWithinLimit(row.resourceId)) {
        throw new Error(`Creator-state placement ${index + 1} has invalid identifiers`);
      }
      const selectionField = Object.hasOwn(row, 'selectedForDirectory') ? 'selectedForDirectory' : 'selected';
      const selected = row[selectionField];
      if (typeof selected !== 'boolean') throw new Error(`Creator-state placement ${index + 1} has a malformed selection flag`);
      placements.push({
        profileId,
        resourceId: row.resourceId,
        selected,
        ...(Object.hasOwn(row, 'series') ? { series: row.series } : {}),
      });
    } else if (row.recordType === 'series') {
      const pkId = typeof row.pk === 'string' && row.pk.startsWith('PROFILE#') ? row.pk.slice(8) : undefined;
      const skId = typeof row.sk === 'string' && row.sk.startsWith('SERIES#') ? row.sk.slice(7) : undefined;
      const id = row.id ?? skId;
      const profileId = row.profileId ?? pkId;
      if (!pkId || !skId || !id || id !== skId || profileId !== pkId
          || typeof row.name !== 'string' || !row.name.trim() || row.name.trim() !== row.name
          || typeof row.slug !== 'string' || !isPublicSlug(row.slug)) {
        throw new Error(`Creator-state series ${index + 1} has invalid public metadata`);
      }
      series.push({ id, profileId, name: row.name, slug: row.slug });
    } else if (typeof row.sk === 'string' && row.sk.startsWith('PLACEMENT#')) {
      throw new Error(`Creator-state placement ${index + 1} has an invalid record type`);
    } else if (typeof row.sk === 'string' && row.sk.startsWith('SERIES#')) {
      throw new Error(`Creator-state series ${index + 1} has an invalid record type`);
    } else if (row.pk?.startsWith?.('PROFILE#') && row.sk === 'META') {
      throw new Error(`Creator-state profile ${index + 1} has an invalid record type`);
    }
  }
  return { profiles, placements, ...(series.length ? { series } : {}) };
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
  const state = normalizeCreatorState(creatorState ?? { profiles: [], placements: [] });
  const profilesById = new Map(state.profiles.map((profile) => [profile.id, profile]));
  const seriesById = new Map(state.series.map((series) => [series.id, series]));
  const placementsByResource = new Map();
  for (const placement of state.placements) {
    const list = placementsByResource.get(placement.resourceId) ?? [];
    list.push(placement);
    placementsByResource.set(placement.resourceId, list);
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
      const eligible = placements.some((placement) => {
        if (!placement.selected) return false;
        const profile = profilesById.get(placement.profileId);
        return profile?.published === true && profile.hidden === false;
      });
      if (!eligible) continue;
    }

    const record = projectPublicRecord(item, index);
    const series = projectEligibleSeries(placements, profilesById, seriesById);
    if (series.length) record.series = series;
    records.push(record);
  }

  records.sort(compareCatalogRecords);
  return records;
}

function normalizeCreatorState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)
      || !Array.isArray(state.profiles) || !Array.isArray(state.placements)) {
    throw new TypeError('Creator directory state must contain profile and placement arrays');
  }
  if (state.series !== undefined && !Array.isArray(state.series)) {
    throw new TypeError('Creator directory series must be an array when supplied');
  }
  const profileIds = new Set();
  const profiles = state.profiles.map((profile, index) => {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)
        || typeof profile.id !== 'string' || profile.id.length === 0
        || typeof profile.published !== 'boolean'
        || (Object.hasOwn(profile, 'hidden') && typeof profile.hidden !== 'boolean')) {
      throw new Error(`Creator directory profile ${index + 1} is malformed`);
    }
    if (profileIds.has(profile.id)) throw new Error(`Creator directory profile ${index + 1} is duplicated`);
    profileIds.add(profile.id);
    if (Object.hasOwn(profile, 'displayName') && typeof profile.displayName !== 'string') {
      throw new Error(`Creator directory profile ${index + 1} has a malformed display name`);
    }
    if (Object.hasOwn(profile, 'slug') && typeof profile.slug !== 'string') {
      throw new Error(`Creator directory profile ${index + 1} has a malformed slug`);
    }
    return {
      id: profile.id,
      published: profile.published,
      hidden: profile.hidden ?? false,
      ...(profile.displayName === undefined ? {} : { displayName: profile.displayName }),
      ...(profile.slug === undefined ? {} : { slug: profile.slug }),
    };
  });
  const placementKeys = new Set();
  const placements = state.placements.map((placement, index) => {
    if (!placement || typeof placement !== 'object' || Array.isArray(placement)
        || typeof placement.profileId !== 'string' || placement.profileId.length === 0
        || !isCatalogResourceIdWithinLimit(placement.resourceId)
        || typeof placement.selected !== 'boolean') {
      throw new Error(`Creator directory placement ${index + 1} is malformed`);
    }
    const key = JSON.stringify([placement.profileId, placement.resourceId]);
    if (placementKeys.has(key)) throw new Error(`Creator directory placement ${index + 1} is duplicated`);
    placementKeys.add(key);
    return {
      profileId: placement.profileId,
      resourceId: placement.resourceId,
      selected: placement.selected,
      ...(Object.hasOwn(placement, 'series') ? { series: normalizePlacementSeries(placement.series, index) } : {}),
    };
  });
  const seriesIds = new Set();
  const series = (state.series ?? []).map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
        || typeof entry.id !== 'string' || !entry.id || entry.id.trim() !== entry.id
        || typeof entry.profileId !== 'string' || !entry.profileId || entry.profileId.trim() !== entry.profileId
        || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.trim() !== entry.name
        || typeof entry.slug !== 'string' || !isPublicSlug(entry.slug)) {
      throw new Error(`Creator directory series ${index + 1} is malformed`);
    }
    if (seriesIds.has(entry.id)) throw new Error(`Creator directory series ${index + 1} is duplicated`);
    seriesIds.add(entry.id);
    return { id: entry.id, profileId: entry.profileId, name: entry.name, slug: entry.slug };
  });
  return { profiles, placements, series };
}

function normalizePlacementSeries(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Creator directory placement ${index + 1} has a malformed series map`);
  }
  return Object.fromEntries(Object.entries(value).map(([seriesId, membership]) => {
    if (!seriesId || seriesId.trim() !== seriesId || !membership || typeof membership !== 'object'
        || Array.isArray(membership) || !Number.isSafeInteger(membership.position) || membership.position < 0) {
      throw new Error(`Creator directory placement ${index + 1} has a malformed series membership`);
    }
    return [seriesId, { position: membership.position }];
  }));
}

function projectEligibleSeries(placements, profilesById, seriesById) {
  const associationsById = new Map();
  for (const placement of placements) {
    if (!placement.selected) continue;
    const profile = profilesById.get(placement.profileId);
    if (profile?.published !== true || profile.hidden !== false) continue;
    for (const seriesId of Object.keys(placement.series ?? {})) {
      const series = seriesById.get(seriesId);
      if (!series || series.profileId !== profile.id) continue;
      if (typeof profile.displayName !== 'string' || !profile.displayName.trim()
          || typeof profile.slug !== 'string' || !isPublicSlug(profile.slug)) {
        throw new Error(`Creator directory profile ${profile.id} is missing public series identity`);
      }
      associationsById.set(seriesId, {
        seriesId,
        name: series.name,
        creatorName: profile.displayName,
        href: `/c/${profile.slug}/series/${series.slug}/`,
      });
    }
  }
  return [...associationsById.values()].sort((left, right) => left.seriesId < right.seriesId ? -1 : left.seriesId > right.seriesId ? 1 : 0);
}

function isPublicSlug(value) {
  return typeof value === 'string' && value.length >= 3 && value.length <= 40
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
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
  if (typeof record.id !== 'string' || record.id.length === 0 || record.id.trim() !== record.id) {
    throw new Error(`Catalog record ${index + 1} has an invalid id`);
  }
  if (!isCatalogResourceIdWithinLimit(record.id)) {
    throw new Error(`Catalog record ${index + 1} has an ID longer than ${MAX_CATALOG_RESOURCE_ID_BYTES} UTF-8 bytes`);
  }
  if (typeof record.title !== 'string' || record.title.length === 0) {
    throw new Error(`Catalog record ${index + 1} has an invalid title`);
  }
  if (typeof record.description !== 'string') {
    throw new Error(`Catalog record ${index + 1} has an invalid description`);
  }
  if (typeof record.category !== 'string' || record.category.length === 0) {
    throw new Error(`Catalog record ${index + 1} has an invalid category`);
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

export function validateCatalogUrl(url, index = 0) {
  if (typeof url !== 'string' || url.length === 0 || url.trim() !== url || /[\u0000-\u001f\u007f]/.test(url)) {
    throw new Error(`Catalog record ${index + 1} has an invalid URL`);
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new Error(`Catalog record ${index + 1} has an invalid URL`, { cause: error });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new Error(`Catalog record ${index + 1} has an unsafe URL`);
  }
  return url;
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
      || !Array.isArray(items.items) || !Array.isArray(items.profiles) || !Array.isArray(items.placements)
      || (items.series !== undefined && !Array.isArray(items.series))) {
    throw new Error(`Catalog fixture must contain an array or an object with items, profiles, and placements: ${fixturePath}`);
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

import { readFile } from 'node:fs/promises';
import { classifyLegacyResource, validateTaxonomy } from './resource-taxonomy.mjs';

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
  if (config.fixturePath) {
    items = await loadFixture(config.fixturePath);
  } else {
    const scanPage = options.scanPage ?? createDynamoScanPage({
      region: config.region,
      docClient: options.docClient,
    });
    items = await scanCatalogItems(scanPage, config.tableName);
  }

  return projectPublishedCatalog(items);
}

/**
 * Resolve the catalog source and fail when both source modes are configured.
 * Options are intentionally explicit so tests can inject a page reader without
 * importing or constructing the AWS clients.
 */
export function resolveCatalogConfig(options = {}, env = process.env) {
  const fixturePath = valueOrUndefined(options.fixturePath ?? env.CATALOG_FIXTURE);
  const tableName = valueOrUndefined(options.tableName ?? env.CATALOG_TABLE);
  const region = valueOrUndefined(options.region ?? env.AWS_REGION) ?? DEFAULT_AWS_REGION;

  if (fixturePath && tableName) {
    throw new Error('Catalog source conflict: configure CATALOG_FIXTURE or CATALOG_TABLE, not both');
  }
  if (!fixturePath && !tableName) {
    throw new Error('Catalog source missing: set CATALOG_TABLE or explicitly set CATALOG_FIXTURE');
  }
  if (fixturePath && options.scanPage) {
    throw new Error('Catalog source conflict: a fixture cannot be used with a live scan reader');
  }

  return { fixturePath, tableName, region };
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
      ProjectionExpression: '#id,#title,#url,#description,#category,#order,#featured,#kind,#format,#topics,published',
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

/**
 * Keep only the intentionally public fields from records published by the
 * owner. A malformed publication flag is an input error; a missing flag is
 * treated as unpublished and therefore is not eligible for projection.
 */
export function projectPublishedCatalog(items) {
  if (!Array.isArray(items)) {
    throw new TypeError('Catalog source must return an array of records');
  }

  const records = [];
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Catalog record ${index + 1} is not an object`);
    }
    if (Object.hasOwn(item, 'published') && typeof item.published !== 'boolean') {
      throw new Error(`Catalog record ${index + 1} has a malformed published flag`);
    }
    if (item.published !== true) {
      continue;
    }

    const record = projectPublicRecord(item, index);
    records.push(record);
  }

  records.sort(compareCatalogRecords);
  return records;
}

/**
 * Validate and project one eligible record. The result is a fresh object with
 * no private or unknown fields, so callers can safely serialize it for HTML.
 */
export function projectPublicRecord(item, index = 0) {
  for (const field of LEGACY_REQUIRED_FIELDS) {
    if (!Object.hasOwn(item, field)) {
      throw new Error(`Catalog record ${index + 1} is missing public field ${field}`);
    }
  }

  const record = {
    id: item.id,
    title: item.title,
    url: item.url,
    description: item.description,
    category: item.category,
    order: item.order,
    featured: item.featured,
    ...validateTaxonomy(hasAnyTaxonomy(item) ? item : classifyLegacyResource(item), index),
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
  return right.order - left.order || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
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
  if (!Array.isArray(items)) {
    throw new Error(`Catalog fixture must contain an array: ${fixturePath}`);
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

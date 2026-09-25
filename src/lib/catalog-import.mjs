import { createHash } from 'node:crypto';

import { parse } from 'csv-parse/sync';

import {
  DEFAULT_AWS_REGION,
  validateCatalogUrl,
  validatePublicRecord,
} from './catalog.mjs';
import { classifyLegacyResource } from './resource-taxonomy.mjs';

export const TARGET_ACCOUNT_ID = '719535286359';

const REQUIRED_HEADERS = Object.freeze([
  'title',
  'url',
  'text',
  'Category',
  'Hide',
  'Rank',
  'imgUrl',
  'Order',
  'Destacado',
]);

/** Parse the supplied tab-separated migration export with a real CSV parser. */
export function parseCatalogTsv(source) {
  const rows = parse(source, {
    bom: true,
    columns: true,
    delimiter: '\t',
    skip_empty_lines: true,
    relax_column_count: false,
    // The supplied export has one legacy description ending in a stray quote.
    // csv-parse still handles the tabular structure when quote relaxation is
    // enabled; all fields are validated after parsing.
    relax_quotes: true,
    trim: false,
  });

  if (rows.length === 0) {
    throw new Error('Catalog TSV has no data rows');
  }
  const headers = Object.keys(rows[0]);
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  const extra = headers.filter((header) => !REQUIRED_HEADERS.includes(header));
  if (missing.length > 0 || extra.length > 0 || headers.length !== REQUIRED_HEADERS.length) {
    throw new Error(`Catalog TSV headers do not match the expected export (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`);
  }
  return rows;
}

/** Map legacy export rows to the DynamoDB public record shape. */
export function mapTsvRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Catalog TSV has no data rows');
  }

  const records = rows.map((row, index) => mapTsvRow(row, index));
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) {
      throw new Error(`Catalog TSV contains a duplicate URL/id: ${record.url}`);
    }
    ids.add(record.id);
  }
  return records;
}

export function mapTsvRow(row, index = 0) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new Error(`Catalog TSV row ${index + 1} is not an object`);
  }
  const title = requiredText(row.title, 'title', index);
  const url = requiredText(row.url, 'url', index);
  const category = requiredText(row.Category, 'Category', index);
  validateCatalogUrl(url, index);

  const orderText = requiredText(row.Order, 'Order', index);
  if (!/^-?\d+$/.test(orderText)) {
    throw new Error(`Catalog TSV row ${index + 1} has an invalid Order value`);
  }
  const order = Number(orderText);
  if (!Number.isSafeInteger(order)) {
    throw new Error(`Catalog TSV row ${index + 1} has an out-of-range Order value`);
  }

  const record = {
    id: stableCatalogId(url),
    title,
    url,
    description: typeof row.text === 'string' ? row.text : '',
    category,
    order,
    featured: parseFeatured(row.Destacado, index),
    published: true,
  };
  Object.assign(record, classifyLegacyResource(record));
  validatePublicRecord(record, index);
  return record;
}

export function stableCatalogId(url) {
  validateCatalogUrl(url);
  return `catalog-${createHash('sha256').update(url, 'utf8').digest('hex').slice(0, 32)}`;
}

/**
 * Insert initial records with a conditional put. Existing IDs are skipped so
 * owner edits and publication decisions survive a rerun.
 */
export async function importCatalog(records, options = {}) {
  const tableName = options.tableName;
  if (typeof tableName !== 'string' || tableName.trim() === '') {
    throw new Error('Catalog import requires --table or CATALOG_TABLE');
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Catalog import requires at least one record');
  }

  // Validate every item before the account check or any write, so bad source
  // data cannot produce a partial import.
  const importItems = [];
  for (const [index, record] of records.entries()) {
    if (record?.published !== true) {
      throw new Error(`Catalog import record ${index + 1} must set published=true`);
    }
    const publicRecord = {
      id: record.id,
      title: record.title,
      url: record.url,
      description: record.description,
      category: record.category,
      order: record.order,
      featured: record.featured,
      ...(record.kind && record.format && record.topics
        ? { kind: record.kind, format: record.format, topics: record.topics }
        : classifyLegacyResource(record)),
    };
    validatePublicRecord(publicRecord, index);
    importItems.push({ ...publicRecord, published: true });
  }

  const accountId = TARGET_ACCOUNT_ID;
  const getCallerIdentity = options.getCallerIdentity ?? await createCallerIdentityReader(options);
  const identity = await getCallerIdentity();
  if (!identity || identity.Account !== accountId) {
    throw new Error(`Catalog import account guard failed: expected ${accountId}, got ${identity?.Account ?? 'unknown'}`);
  }

  const putItem = options.putItem ?? await createDynamoWriter({
    region: options.region ?? DEFAULT_AWS_REGION,
    docClient: options.docClient,
  });

  let created = 0;
  let skipped = 0;
  for (const record of importItems) {
    const params = {
      TableName: tableName,
      Item: record,
      ConditionExpression: 'attribute_not_exists(#id)',
      ExpressionAttributeNames: { '#id': 'id' },
    };
    try {
      await putItem(params);
      created += 1;
    } catch (error) {
      if (isConditionalPutConflict(error)) {
        skipped += 1;
        continue;
      }
      throw new Error(`Catalog import failed while writing ${record.id}: ${error?.message ?? String(error)}`, {
        cause: error,
      });
    }
  }

  return { total: records.length, created, skipped };
}

export function isConditionalPutConflict(error) {
  return error?.name === 'ConditionalCheckFailedException'
    || error?.code === 'ConditionalCheckFailedException';
}

export function parseFeatured(value, index = 0) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === '' || normalized === '0' || normalized === 'false') {
    return false;
  }
  if (normalized === '1' || normalized === 'true') {
    return true;
  }
  throw new Error(`Catalog TSV row ${index + 1} has an invalid Destacado value`);
}

function requiredText(value, field, index) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(`Catalog TSV row ${index + 1} has an invalid ${field} value`);
  }
  return value;
}

async function createCallerIdentityReader(options) {
  if (options.stsClient) {
    const { GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
    return async () => options.stsClient.send(new GetCallerIdentityCommand({}));
  }
  const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts');
  const client = new STSClient({ region: options.region ?? DEFAULT_AWS_REGION });
  return async () => client.send(new GetCallerIdentityCommand({}));
}

async function createDynamoWriter({ region, docClient }) {
  const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
  let client = docClient;
  if (!client) {
    const [{ DynamoDBClient }, { DynamoDBDocumentClient }] = await Promise.all([
      import('@aws-sdk/client-dynamodb'),
      import('@aws-sdk/lib-dynamodb'),
    ]);
    client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  }
  return (params) => client.send(new PutCommand(params));
}

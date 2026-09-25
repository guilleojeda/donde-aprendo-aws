import { DEFAULT_AWS_REGION } from '../lib/catalog.mjs';
import {
  isConditionalPutConflict,
  stableCatalogId,
} from '../lib/catalog-import.mjs';
import { SUBMISSION_CATEGORIES } from '../lib/submission-categories.mjs';
import { classifyLegacyResource, legacyCategoryFor, validateTaxonomy } from '../lib/resource-taxonomy.mjs';

export const MAX_SUBMISSION_BODY_BYTES = 16 * 1024;

export const SUBMISSION_FIELD_LIMITS = Object.freeze({
  email: 254,
  full_name: 160,
  title: 240,
  url: 2_048,
  text: 8_000,
  Category: 64,
  kind: 24,
  format: 64,
});

const REQUIRED_FIELDS = Object.freeze([
  'email',
  'full_name',
  'title',
  'url',
  'text',
]);
const ACCEPTED_FIELDS = new Set([...REQUIRED_FIELDS, 'website', 'Category', 'kind', 'format', 'topics']);
const CATEGORY_SET = new Set(SUBMISSION_CATEGORIES);
const BASE64_BODY_LIMIT = Math.ceil(MAX_SUBMISSION_BODY_BYTES * 4 / 3) + 4;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/**
 * Create a Lambda proxy handler with injectable dependencies for local tests.
 * The production export below uses the real DynamoDB writer lazily, so merely
 * importing this module never requires AWS credentials.
 */
export function createSubmissionHandler(options = {}) {
  const putItem = options.putItem;
  const now = options.now ?? (() => new Date().toISOString());
  const tableName = options.tableName;
  const region = options.region ?? process.env.AWS_REGION ?? DEFAULT_AWS_REGION;
  let defaultPutItem;

  return async function submissionHandler(event = {}) {
    let submission;
    try {
      submission = parseSubmissionRequest(event);
    } catch (error) {
      return response(error.statusCode ?? 400, error.responseCode ?? 'invalid_request');
    }

    const resolvedTableName = resolveTableName(tableName);
    if (!resolvedTableName) {
      return response(500, 'storage_error');
    }

    const item = {
      id: stableCatalogId(submission.url),
      title: submission.title,
      url: submission.url,
      description: submission.text,
      category: submission.category,
      ...submission.taxonomy,
      order: 0,
      featured: false,
      published: false,
      submittedAt: now(),
      submitterName: submission.full_name,
      submitterEmail: submission.email,
    };

    try {
      const writer = putItem ?? (defaultPutItem ??= await createDynamoWriter(region));
      if (typeof writer !== 'function') {
        return response(500, 'storage_error');
      }
      await writer({
        TableName: resolvedTableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(#id)',
        ExpressionAttributeNames: { '#id': 'id' },
      });
    } catch (error) {
      if (isConditionalPutConflict(error)) {
        return response(409, 'duplicate');
      }
      return response(500, 'storage_error');
    }

    return response(201, 'created');
  };
}

/** The named Lambda export used by API Gateway. */
export const handler = createSubmissionHandler();

function parseSubmissionRequest(event) {
  const contentType = headerValue(event?.headers, 'content-type');
  if (!isJsonContentType(contentType)) {
    throw requestError(415, 'unsupported_media_type');
  }

  const body = decodeRequestBody(event);
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw requestError(400, 'invalid_request');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw requestError(400, 'invalid_request');
  }

  const unknownFields = Object.keys(payload).filter((field) => !ACCEPTED_FIELDS.has(field));
  if (unknownFields.length > 0) {
    throw requestError(400, 'invalid_request');
  }

  for (const field of REQUIRED_FIELDS) {
    const value = payload[field];
    const limit = SUBMISSION_FIELD_LIMITS[field];
    if (typeof value !== 'string' || value.length === 0 || value.length > limit || value.trim().length === 0) {
      throw requestError(400, 'invalid_request');
    }
    if (CONTROL_CHARACTERS.test(value)) {
      throw requestError(400, 'invalid_request');
    }
  }

  if (!EMAIL_PATTERN.test(payload.email) || payload.email.includes('..')) {
    throw requestError(400, 'invalid_request');
  }
  try {
    // stableCatalogId calls the shared catalog URL validator. Keeping the URL
    // unchanged here preserves query strings and makes duplicate detection
    // match imported records exactly.
    stableCatalogId(payload.url);
  } catch {
    throw requestError(400, 'invalid_request');
  }

  let taxonomy;
  let category;
  if (Object.hasOwn(payload, 'kind')) {
    if (Object.hasOwn(payload, 'Category')
      || typeof payload.kind !== 'string' || payload.kind.length > SUBMISSION_FIELD_LIMITS.kind
      || typeof payload.format !== 'string' || payload.format.length > SUBMISSION_FIELD_LIMITS.format) {
      throw requestError(400, 'invalid_request');
    }
    try {
      taxonomy = validateTaxonomy(payload);
    } catch {
      throw requestError(400, 'invalid_request');
    }
    category = legacyCategoryFor(taxonomy);
  } else {
    if (typeof payload.Category !== 'string' || payload.Category.length > SUBMISSION_FIELD_LIMITS.Category
      || !CATEGORY_SET.has(payload.Category) || Object.hasOwn(payload, 'format') || Object.hasOwn(payload, 'topics')) {
      throw requestError(400, 'invalid_request');
    }
    category = payload.Category;
    taxonomy = classifyLegacyResource({ title: payload.title, url: payload.url, category });
  }

  if (Object.hasOwn(payload, 'website')) {
    if (typeof payload.website !== 'string' || CONTROL_CHARACTERS.test(payload.website)) {
      throw requestError(400, 'invalid_request');
    }
    if (payload.website.trim().length > 0) {
      throw requestError(400, 'invalid_request');
    }
  }

  return { ...payload, category, taxonomy };
}

function decodeRequestBody(event) {
  const body = event?.body;
  if (typeof body !== 'string') {
    throw requestError(400, 'invalid_request');
  }

  const encoded = event?.isBase64Encoded === true;
  const bodyByteLimit = encoded ? BASE64_BODY_LIMIT : MAX_SUBMISSION_BODY_BYTES;
  if (Buffer.byteLength(body, 'utf8') > bodyByteLimit) {
    throw requestError(413, 'too_large');
  }

  if (!encoded) {
    if (Buffer.byteLength(body, 'utf8') > MAX_SUBMISSION_BODY_BYTES) {
      throw requestError(413, 'too_large');
    }
    return body;
  }

  if (!isStrictBase64(body)) {
    throw requestError(400, 'invalid_request');
  }
  let decoded;
  try {
    decoded = Buffer.from(body, 'base64');
  } catch {
    throw requestError(400, 'invalid_request');
  }
  if (decoded.length > MAX_SUBMISSION_BODY_BYTES) {
    throw requestError(413, 'too_large');
  }
  return decoded.toString('utf8');
}

function isStrictBase64(value) {
  return value.length > 0
    && value.length % 4 === 0
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value);
}

function headerValue(headers, wantedName) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return undefined;
  }
  const wanted = wantedName.toLowerCase();
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === wanted);
  return entry?.[1];
}

function isJsonContentType(value) {
  return typeof value === 'string'
    && value.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

function requestError(statusCode, responseCode) {
  const error = new Error(responseCode);
  error.statusCode = statusCode;
  error.responseCode = responseCode;
  return error;
}

function resolveTableName(configuredTableName) {
  const value = configuredTableName ?? process.env.CATALOG_TABLE;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function response(statusCode, code) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ ok: statusCode === 201, code }),
  };
}

async function createDynamoWriter(region) {
  const [{ DynamoDBClient }, { DynamoDBDocumentClient, PutCommand }] = await Promise.all([
    import('@aws-sdk/client-dynamodb'),
    import('@aws-sdk/lib-dynamodb'),
  ]);
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
  return (params) => client.send(new PutCommand(params));
}

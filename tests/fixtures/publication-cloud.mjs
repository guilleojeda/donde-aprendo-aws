import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const PUBLICATION_ID = '__system#publication';

function jobSummary(jobId, status) {
  return {
    commitId: 'a'.repeat(40),
    commitMessage: 'publication fixture job',
    commitTime: 1,
    jobArn: `arn:aws:amplify:us-east-1:123456789012:apps/d123456789/branches/main/jobs/${jobId}`,
    jobId,
    jobType: 'RELEASE',
    startTime: 1,
    status,
  };
}

/**
 * A loopback AWS protocol fixture for the publication Lambda. The Lambda uses
 * the real AWS SDK clients; this server only supplies controlled provider
 * responses and applies the submitted DynamoDB condition/update expressions.
 */
export async function startPublicationCloud({
  state = {},
  catalogItems = [],
  getJob = { statusCode: 404, errorType: 'NotFoundException', body: { message: 'Job not found' } },
  listJobs = { statusCode: 200, body: { jobSummaries: [] } },
  startJob = { statusCode: 200, body: { jobSummary: jobSummary('900', 'PENDING') } },
} = {}) {
  const cloud = {
    state: { id: PUBLICATION_ID, ...structuredClone(state) },
    catalogItems: structuredClone(catalogItems),
    getJob: structuredClone(getJob),
    listJobs: structuredClone(listJobs),
    startJob: structuredClone(startJob),
    calls: [],
    failures: [],
    beforeNextUpdate: undefined,
  };

  const server = createServer((request, response) => {
    void handleRequest(cloud, request, response).catch((error) => {
      cloud.failures.push(error);
      if (!response.headersSent) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ message: error.message }));
      } else {
        response.destroy(error);
      }
    });
  });

  async function handleRequest(cloudContext, request, response) {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const body = rawBody ? JSON.parse(rawBody) : {};
    const pathname = new URL(request.url, 'http://publication.test').pathname;
    const target = request.headers['x-amz-target'];

    if (typeof target === 'string' && target.startsWith('DynamoDB_20120810.')) {
      const operation = target.slice('DynamoDB_20120810.'.length);
      cloudContext.calls.push({ service: 'dynamodb', operation, input: structuredClone(body) });
      await handleDynamoDB(cloudContext, operation, body, response);
      return;
    }

    cloudContext.calls.push({ service: 'amplify', method: request.method, pathname, input: structuredClone(body) });
    const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (request.method === 'GET' && parts.length === 6
        && parts[0] === 'apps' && parts[2] === 'branches' && parts[4] === 'jobs') {
      await respond(response, cloudContext.getJob);
      return;
    }
    if (request.method === 'GET' && parts.length === 5
        && parts[0] === 'apps' && parts[2] === 'branches' && parts[4] === 'jobs') {
      await respond(response, cloudContext.listJobs);
      return;
    }
    if (request.method === 'POST' && parts.length === 5
        && parts[0] === 'apps' && parts[2] === 'branches' && parts[4] === 'jobs') {
      await respond(response, cloudContext.startJob);
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ message: `Unexpected request: ${request.method} ${pathname}` }));
  }

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const endpoint = `http://127.0.0.1:${address.port}`;

  return {
    endpoint,
    calls: cloud.calls,
    getState: () => structuredClone(cloud.state),
    setState: (value) => { cloud.state = { id: PUBLICATION_ID, ...structuredClone(value) }; },
    setGetJob: (value) => { cloud.getJob = structuredClone(value); },
    setListJobs: (value) => { cloud.listJobs = structuredClone(value); },
    setStartJob: (value) => { cloud.startJob = structuredClone(value); },
    beforeNextUpdate: (callback) => { cloud.beforeNextUpdate = callback; },
    close: async () => {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
      if (cloud.failures.length) throw cloud.failures[0];
    },
  };
}

async function handleDynamoDB(cloud, operation, input, response) {
  assert.equal(input.TableName, 'publication-recovery-test', 'the adapter uses the configured catalog table');

  if (operation === 'UpdateItem') {
    assert.deepEqual(decodeMap(input.Key), { id: PUBLICATION_ID },
      'every publication-state update targets the existing system row');
    const hook = cloud.beforeNextUpdate;
    if (hook) {
      const consumed = await hook({ input: structuredClone(input), state: structuredClone(cloud.state) });
      if (consumed !== false) cloud.beforeNextUpdate = undefined;
    }

    if (!conditionPasses(input.ConditionExpression, input.ExpressionAttributeNames ?? {},
      input.ExpressionAttributeValues ?? {}, cloud.state)) {
      response.writeHead(400, {
        'content-type': 'application/x-amz-json-1.0',
        'x-amzn-errortype': 'ConditionalCheckFailedException',
      });
      response.end(JSON.stringify({
        __type: 'com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException',
        message: 'The publication state changed before the conditional update.',
      }));
      return;
    }

    applyUpdateExpression(input.UpdateExpression, input.ExpressionAttributeNames ?? {},
      input.ExpressionAttributeValues ?? {}, cloud.state);
    sendJson(response, 200, {});
    return;
  }

  if (operation === 'GetItem') {
    assert.deepEqual(decodeMap(input.Key), { id: PUBLICATION_ID }, 'state reads target the publication control row');
    sendJson(response, 200, { Item: encodeMap(cloud.state) });
    return;
  }

  if (operation === 'Scan') {
    const names = input.ExpressionAttributeNames ?? {};
    const fields = input.ProjectionExpression?.split(',').map((token) => names[token.trim()] ?? token.trim());
    const items = cloud.catalogItems.map((item) => encodeMap(fields
      ? Object.fromEntries(fields.filter((field) => Object.hasOwn(item, field)).map((field) => [field, item[field]]))
      : item));
    sendJson(response, 200, { Items: items, Count: items.length, ScannedCount: items.length });
    return;
  }

  throw new Error(`Unexpected DynamoDB operation ${operation}`);
}

async function respond(response, providerResponse) {
  if (providerResponse.reset) {
    response.socket.destroy();
    return;
  }
  const body = typeof providerResponse.body === 'string'
    ? providerResponse.body
    : JSON.stringify(providerResponse.body ?? {});
  const headers = { 'content-type': 'application/json' };
  if (providerResponse.errorType) headers['x-amzn-errortype'] = providerResponse.errorType;
  response.writeHead(providerResponse.statusCode ?? 200, headers);
  response.end(body);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/x-amz-json-1.0' });
  response.end(JSON.stringify(body));
}

function decodeValue(value) {
  if (Object.hasOwn(value, 'S')) return value.S;
  if (Object.hasOwn(value, 'N')) return Number(value.N);
  if (Object.hasOwn(value, 'BOOL')) return value.BOOL;
  if (Object.hasOwn(value, 'NULL')) return null;
  if (Object.hasOwn(value, 'L')) return value.L.map(decodeValue);
  if (Object.hasOwn(value, 'M')) return decodeMap(value.M);
  throw new Error(`Unsupported DynamoDB attribute value ${JSON.stringify(value)}`);
}

function decodeMap(value) {
  return Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key, decodeValue(item)]));
}

function encodeValue(value) {
  if (typeof value === 'string') return { S: value };
  if (typeof value === 'number') return { N: String(value) };
  if (typeof value === 'boolean') return { BOOL: value };
  if (value === null) return { NULL: true };
  if (Array.isArray(value)) return { L: value.map(encodeValue) };
  if (typeof value === 'object') return { M: encodeMap(value) };
  throw new Error(`Unsupported fixture value ${String(value)}`);
}

function encodeMap(value) {
  return Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key, encodeValue(item)]));
}

function conditionPasses(expression, names, values, item) {
  if (!expression) return true;
  const orGroups = splitBoolean(expression, 'OR');
  return orGroups.some((orGroup) => splitBoolean(orGroup, 'AND')
    .every((term) => conditionTermPasses(stripOuterParens(term), names, values, item)));
}

function conditionTermPasses(term, names, values, item) {
  const missing = /^attribute_not_exists\(([^)]+)\)$/iu.exec(term);
  if (missing) return !Object.hasOwn(item, resolveName(missing[1].trim(), names));

  const present = /^attribute_exists\(([^)]+)\)$/iu.exec(term);
  if (present) return Object.hasOwn(item, resolveName(present[1].trim(), names));

  const comparison = /^([#A-Za-z][#A-Za-z0-9_]*)\s*(<>|<=|>=|=|<|>)\s*(:[A-Za-z0-9_]+)$/u.exec(term);
  if (!comparison) throw new Error(`Unsupported fixture condition expression: ${term}`);
  const attribute = resolveName(comparison[1], names);
  const expected = decodeValue(values[comparison[3]]);
  if (!Object.hasOwn(item, attribute)) return false;
  if (comparison[2] === '=') return item[attribute] === expected;
  if (comparison[2] === '<>') return item[attribute] !== expected;
  if (comparison[2] === '<') return item[attribute] < expected;
  if (comparison[2] === '<=') return item[attribute] <= expected;
  if (comparison[2] === '>') return item[attribute] > expected;
  return item[attribute] >= expected;
}

function applyUpdateExpression(expression, names, values, item) {
  const clauses = expression.matchAll(/(?:^|\s)(SET|REMOVE)\s+([\s\S]*?)(?=\s+(?:SET|REMOVE)\s+|$)/giu);
  for (const [, operation, clause] of clauses) {
    const parts = clause.split(',').map((part) => part.trim());
    if (operation.toUpperCase() === 'SET') {
      for (const assignment of parts) {
        const match = /^([#A-Za-z][#A-Za-z0-9_]*)\s*=\s*(:[A-Za-z0-9_]+)$/u.exec(assignment);
        if (!match) throw new Error(`Unsupported fixture SET expression: ${assignment}`);
        item[resolveName(match[1], names)] = decodeValue(values[match[2]]);
      }
    } else {
      for (const attribute of parts) delete item[resolveName(attribute, names)];
    }
  }
}

function splitBoolean(expression, operator) {
  const results = [];
  let depth = 0;
  let start = 0;
  const boundary = new RegExp(`\\s+${operator}\\s+`, 'giu');
  for (const match of expression.matchAll(boundary)) {
    for (let index = start; index < match.index; index += 1) {
      if (expression[index] === '(') depth += 1;
      else if (expression[index] === ')') depth -= 1;
    }
    if (depth === 0) {
      results.push(expression.slice(start, match.index).trim());
      start = match.index + match[0].length;
    }
  }
  results.push(expression.slice(start).trim());
  return results;
}

function stripOuterParens(expression) {
  let result = expression;
  while (result.startsWith('(') && result.endsWith(')')) {
    let depth = 0;
    let wrapsWholeExpression = true;
    for (let index = 0; index < result.length; index += 1) {
      if (result[index] === '(') depth += 1;
      else if (result[index] === ')') depth -= 1;
      if (depth === 0 && index < result.length - 1) {
        wrapsWholeExpression = false;
        break;
      }
    }
    if (!wrapsWholeExpression) break;
    result = result.slice(1, -1).trim();
  }
  return result;
}

function resolveName(value, names) {
  return names[value] ?? value;
}

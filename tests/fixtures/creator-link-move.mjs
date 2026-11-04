import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createCreatorStore } from '../../src/lib/creator-store.mjs';
import { createCreatorPagesHarness } from './creator-pages.mjs';

const TABLES = {
  accountsTableName: 'accounts-test',
  profilesTableName: 'profiles-test',
  catalogTableName: 'catalog-test',
};

function copy(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function storageKey(value) {
  return Object.hasOwn(value, 'pk') ? `${value.pk}\u0000${value.sk}` : value.id;
}

// DynamoDB stored-attribute accounting for the actual command images below.
// This measures the request; it does not decide the move window or its oracle.
function dynamoNumberPayloadBytes(value) {
  const coefficient = String(value).toLowerCase().split('e')[0];
  const significantDigits = coefficient.replace(/[^0-9]/g, '').replace(/^0+/, '').replace(/0+$/, '').length || 1;
  return 1 + Math.ceil(significantDigits / 2);
}

function storedSetValueBytes(value, expectedKind) {
  if (typeof value === 'string' && expectedKind === 'string') return Buffer.byteLength(value, 'utf8');
  if ((typeof value === 'number' || typeof value === 'bigint') && expectedKind === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('unsupported test item value');
    return dynamoNumberPayloadBytes(value);
  }
  if (value instanceof Uint8Array && expectedKind === 'binary') return value.byteLength;
  throw new TypeError('unsupported test set value');
}

function storedValueBytes(value, name = '') {
  if (value === undefined) return 0;
  const nameBytes = Buffer.byteLength(name, 'utf8');
  if (typeof value === 'string') return nameBytes + Buffer.byteLength(value, 'utf8');
  if (typeof value === 'number' && Number.isFinite(value)) {
    return nameBytes + dynamoNumberPayloadBytes(value);
  }
  if (typeof value === 'bigint') return nameBytes + dynamoNumberPayloadBytes(value);
  if (typeof value === 'boolean' || value === null) return nameBytes + 1;
  if (value instanceof Uint8Array) return nameBytes + value.byteLength;
  if (value instanceof Set) {
    const values = [...value].filter((item) => item !== undefined);
    if (values.length === 0) throw new TypeError('unsupported empty DynamoDB set');
    const first = values[0];
    const expectedKind = typeof first === 'string' ? 'string'
      : typeof first === 'number' || typeof first === 'bigint' ? 'number'
        : first instanceof Uint8Array ? 'binary' : null;
    if (!expectedKind) throw new TypeError('unsupported test set value');
    return nameBytes + values.reduce((sum, item) => sum + storedSetValueBytes(item, expectedKind), 0);
  }
  if (Array.isArray(value)) {
    return nameBytes + 3 + value.filter((item) => item !== undefined)
      .reduce((sum, item) => sum + 1 + storedValueBytes(item), 0);
  }
  if (typeof value === 'object') {
    return nameBytes + 3 + Object.entries(value).filter(([, item]) => item !== undefined)
      .reduce((sum, [key, item]) => sum + 1 + storedValueBytes(item, key), 0);
  }
  throw new TypeError('unsupported test item value');
}

// A DynamoDB item is the sum of its root attributes, not a Map attribute.
export function storedAttributeBytes(item) {
  return Object.entries(item).filter(([, value]) => value !== undefined)
    .reduce((sum, [name, value]) => sum + storedValueBytes(value, name), 0);
}

function transactionImageBytes(actions, read) {
  return actions.reduce((sum, action) => {
    if (action.Put) return sum + storedAttributeBytes(action.Put.Item);
    const item = action.Delete ?? action.ConditionCheck;
    const current = read(item.TableName, item.Key);
    return sum + (current ? storedAttributeBytes(current) : 0);
  }, 0);
}

// Evaluate the store's condition-expression subset and fail closed on unknown syntax.
function parseConditionExpression(expression, names, values) {
  const tokens = [];
  const tokenPattern = /\s*(attribute_exists|attribute_not_exists|AND|OR)\b|\s*([#:][A-Za-z0-9_]+)|\s*([A-Za-z_][A-Za-z0-9_]*)|\s*(=)|\s*(\()|\s*(\))/gy;
  let offset = 0;
  while (offset < expression.length) {
    tokenPattern.lastIndex = offset;
    const match = tokenPattern.exec(expression);
    if (!match) {
      if (expression.slice(offset).trim() === '') break;
      throw new TypeError(`unsupported DynamoDB condition expression near ${expression.slice(offset)}`);
    }
    offset = tokenPattern.lastIndex;
    if (match[1]) tokens.push({ type: match[1] });
    else if (match[2]) tokens.push({ type: match[2][0] === '#' ? 'name' : 'value', value: match[2] });
    else if (match[3]) tokens.push({ type: 'attribute', value: match[3] });
    else if (match[4]) tokens.push({ type: 'equals' });
    else if (match[5]) tokens.push({ type: 'left' });
    else if (match[6]) tokens.push({ type: 'right' });
  }

  let cursor = 0;
  const peek = (type) => tokens[cursor]?.type === type;
  const consume = (type) => {
    if (!peek(type)) throw new TypeError(`unsupported DynamoDB condition expression: expected ${type}`);
    return tokens[cursor++];
  };
  const readAttribute = () => {
    const token = tokens[cursor++];
    if (token?.type === 'name') {
      if (!Object.hasOwn(names, token.value) || typeof names[token.value] !== 'string' || names[token.value] === '') {
        throw new TypeError(`unbound DynamoDB expression name ${token.value}`);
      }
      return names[token.value];
    }
    if (token?.type === 'attribute') return token.value;
    throw new TypeError('unsupported DynamoDB condition expression: expected an attribute name');
  };

  function parsePrimary() {
    if (peek('left')) {
      consume('left');
      const expressionNode = parseOr();
      consume('right');
      return expressionNode;
    }
    if (peek('attribute_exists') || peek('attribute_not_exists')) {
      const operator = tokens[cursor++].type;
      consume('left');
      const attribute = readAttribute();
      consume('right');
      return { type: operator, attribute };
    }

    const attribute = readAttribute();
    consume('equals');
    const token = consume('value').value;
    if (!Object.hasOwn(values, token) || values[token] === undefined) {
      throw new TypeError(`unbound DynamoDB expression value ${token}`);
    }
    return { type: 'equals', attribute, value: values[token] };
  }

  function parseAnd() {
    let left = parsePrimary();
    while (peek('AND')) {
      consume('AND');
      left = { type: 'AND', left, right: parsePrimary() };
    }
    return left;
  }

  function parseOr() {
    let left = parseAnd();
    while (peek('OR')) {
      consume('OR');
      left = { type: 'OR', left, right: parseAnd() };
    }
    return left;
  }

  const tree = parseOr();
  if (cursor !== tokens.length) throw new TypeError('unsupported DynamoDB condition expression: trailing tokens');
  return tree;
}

function evaluateCondition(node, current) {
  if (node.type === 'AND') return evaluateCondition(node.left, current) && evaluateCondition(node.right, current);
  if (node.type === 'OR') return evaluateCondition(node.left, current) || evaluateCondition(node.right, current);
  const exists = current !== undefined && Object.hasOwn(current, node.attribute) && current[node.attribute] !== undefined;
  if (node.type === 'attribute_exists') return exists;
  if (node.type === 'attribute_not_exists') return !exists;
  return exists && isDeepStrictEqual(current[node.attribute], node.value);
}

function conditionalMatches(action, current) {
  const input = action.Put ?? action.Delete ?? action.ConditionCheck;
  const expression = input?.ConditionExpression;
  if (expression === undefined) return true;
  if (typeof expression !== 'string' || expression.trim() === '') {
    throw new TypeError('unsupported DynamoDB condition expression: expression must be non-empty text');
  }
  const tree = parseConditionExpression(
    expression,
    input.ExpressionAttributeNames ?? {},
    input.ExpressionAttributeValues ?? {},
  );
  return evaluateCondition(tree, current);
}

function conditionalFailure() {
  return Object.assign(new Error('conditional transaction failed'), {
    name: 'TransactionCanceledException',
    CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
  });
}

function projectQueryItem(item, input) {
  if (typeof input.ProjectionExpression !== 'string') return copy(item);
  const names = input.ExpressionAttributeNames ?? {};
  const fields = input.ProjectionExpression.split(',').map((field) => {
    const token = field.trim();
    return names[token] ?? token;
  });
  return Object.fromEntries(fields
    .filter((field) => Object.hasOwn(item, field))
    .map((field) => [field, copy(item[field])]));
}

function createMockClient({ projectionAware = false, queryPageSize } = {}) {
  if (queryPageSize !== undefined && (!Number.isSafeInteger(queryPageSize) || queryPageSize < 1)) {
    throw new TypeError('queryPageSize must be a positive safe integer');
  }
  const tables = new Map(Object.values(TABLES).map((name) => [name, new Map()]));
  const calls = [];
  const transactions = [];
  let beforeNextTransaction;
  let afterNextTransaction;
  let failureNextTransaction;

  function read(table, key) {
    return tables.get(table)?.get(storageKey(key));
  }

  function write(table, item) {
    tables.get(table).set(storageKey(item), copy(item));
  }

  async function send(command) {
    const name = command.constructor.name;
    const input = command.input;
    calls.push({ name, input: copy(input) });
    if (name === 'GetCommand') {
      const Item = read(input.TableName, input.Key);
      return Item === undefined ? {} : { Item: copy(Item) };
    }
    if (name === 'QueryCommand') {
      const values = input.ExpressionAttributeValues ?? {};
      const pk = values[':pk'];
      const skPrefix = values[':sk'];
      const cursorSk = input.ExclusiveStartKey?.sk;
      const matching = [...(tables.get(input.TableName)?.values() ?? [])]
        .filter((item) => item.pk === pk && item.sk.startsWith(skPrefix))
        .filter((item) => cursorSk === undefined || item.sk.localeCompare(cursorSk) > 0)
        .sort((left, right) => left.sk.localeCompare(right.sk));
      const pageRows = queryPageSize === undefined ? matching : matching.slice(0, queryPageSize);
      const Items = pageRows.map((item) => projectionAware ? projectQueryItem(item, input) : copy(item));
      const LastEvaluatedKey = queryPageSize !== undefined && matching.length > queryPageSize
        ? { pk, sk: pageRows.at(-1).sk }
        : undefined;
      return { Items, ...(LastEvaluatedKey ? { LastEvaluatedKey } : {}) };
    }
    if (name === 'BatchGetCommand') {
      const [table, request] = Object.entries(input.RequestItems)[0];
      const Responses = request.Keys.map((key) => read(table, key)).filter(Boolean).map(copy);
      return { Responses: { [table]: Responses } };
    }
    if (name !== 'TransactWriteCommand') throw new Error(`unexpected DynamoDB command ${name}`);

    const actions = input.TransactItems;
    transactions.push({
      actionCount: actions.length,
      physicalBytes: transactionImageBytes(actions, read),
      input: copy(input),
    });
    if (beforeNextTransaction) {
      const before = beforeNextTransaction;
      beforeNextTransaction = undefined;
      await before({ tables, actions: copy(actions) });
    }
    if (failureNextTransaction) {
      const failure = failureNextTransaction;
      failureNextTransaction = undefined;
      throw failure;
    }
    for (const action of actions) {
      const descriptor = action.Put ?? action.Delete ?? action.ConditionCheck;
      const current = read(descriptor.TableName, descriptor.Key ?? descriptor.Item);
      if (!conditionalMatches(action, current)) throw conditionalFailure();
    }
    for (const action of actions) {
      if (action.Put) write(action.Put.TableName, action.Put.Item);
      else if (action.Delete) tables.get(action.Delete.TableName).delete(storageKey(action.Delete.Key));
    }
    if (afterNextTransaction) {
      const after = afterNextTransaction;
      afterNextTransaction = undefined;
      await after({ tables, actions: copy(actions) });
    }
    return {};
  }

  return {
    calls,
    transactions,
    client: { send },
    seed(table, value) { write(table, value); },
    read,
    raceBeforeNextTransaction(callback) { beforeNextTransaction = callback; },
    mutateAfterNextTransaction(callback) { afterNextTransaction = callback; },
    failNextTransaction(error = new Error('injected transaction failure')) { failureNextTransaction = error; },
  };
}

export function createDynamoMoveStore(options = {}) {
  const mock = createMockClient(options);
  const store = createCreatorStore({ ...TABLES, client: mock.client });
  return { mock, store };
}

export async function createDynamoMoveHarness(options = {}) {
  const { mock, store } = createDynamoMoveStore(options);
  const harness = await createCreatorPagesHarness({ store });
  return { ...harness, mock, store };
}

export function seedMoveProfile(mock, {
  accountId = 'private-account-a',
  profileId = 'profile-move-a',
  displayName = 'Orden de prueba',
  slug = 'orden-prueba',
  version = 1,
  published = true,
} = {}) {
  mock.seed(TABLES.accountsTableName, {
    pk: `PROFILE_OWNER#${sha256(accountId)}`,
    profileId,
  });
  mock.seed(TABLES.profilesTableName, {
    pk: `PROFILE#${profileId}`,
    sk: 'META',
    recordType: 'profile',
    id: profileId,
    displayName,
    slug,
    programs: [],
    socials: {},
    published,
    hidden: false,
    version,
  });
  mock.seed(TABLES.profilesTableName, {
    pk: `SLUG#${slug}`,
    sk: 'META',
    recordType: 'profileAlias',
    slug,
    profileId,
    version: 1,
  });
}

export function seedMoveResource(mock, {
  id,
  title = id,
  url,
  description = '',
  version = 1,
  published = false,
  hidden = false,
  directoryControl = 'editorial',
  editorProfileId,
} = {}) {
  if (typeof id !== 'string' || typeof url !== 'string') throw new TypeError('resource id and URL are required');
  mock.seed(TABLES.catalogTableName, {
    id,
    title,
    url,
    description,
    published,
    hidden,
    approvalRevoked: false,
    directoryControl,
    ...(editorProfileId ? { editorProfileId } : {}),
    version,
  });
  mock.seed(TABLES.catalogTableName, {
    id: `__url#${sha256(url)}`,
    recordType: 'urlReservation',
    url,
    status: 'reserved',
    resourceId: id,
    version: 1,
  });
}

export function seedMovePlacement(mock, {
  id,
  profileId = 'profile-move-a',
  resourceId,
  position,
  featured = false,
  selectedForDirectory = true,
  version = 1,
  series,
} = {}) {
  mock.seed(TABLES.profilesTableName, {
    pk: `PROFILE#${profileId}`,
    sk: `PLACEMENT#${id}`,
    recordType: 'placement',
    id,
    profileId,
    resourceId,
    position,
    featured,
    selectedForDirectory,
    ...(series ? { series: copy(series) } : {}),
    version,
  });
}

export function seedMoveSeries(mock, {
  id,
  profileId = 'profile-move-a',
  name = 'Serie de prueba',
  slug = 'serie-prueba',
  version = 1,
} = {}) {
  mock.seed(TABLES.profilesTableName, {
    pk: `PROFILE#${profileId}`,
    sk: `SERIES#${id}`,
    recordType: 'series',
    id,
    profileId,
    name,
    slug,
    version,
  });
}

export function moveTransactionMetrics(mock) {
  return mock.transactions.map(({ actionCount }) => ({ actionCount }));
}

export function moveTransactionPhysicalBytes(mock) {
  return mock.transactions.map(({ physicalBytes }) => physicalBytes);
}

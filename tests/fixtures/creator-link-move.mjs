import { createHash } from 'node:crypto';
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
function storedValueBytes(value, name = '') {
  if (value === undefined) return 0;
  const nameBytes = Buffer.byteLength(name, 'utf8');
  if (typeof value === 'string') return nameBytes + Buffer.byteLength(value, 'utf8');
  if (typeof value === 'number' && Number.isFinite(value)) {
    const coefficient = String(value).toLowerCase().split('e')[0];
    const significantDigits = coefficient.replace(/[^0-9]/g, '').replace(/^0+/, '').replace(/0+$/, '').length || 1;
    return nameBytes + 1 + Math.ceil(significantDigits / 2);
  }
  if (typeof value === 'boolean' || value === null) return nameBytes + 1;
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

function conditionalMatches(action, current) {
  const input = action.Put ?? action.Delete ?? action.ConditionCheck;
  const expression = input?.ConditionExpression;
  if (!expression) return true;
  const names = input.ExpressionAttributeNames ?? {};
  const values = input.ExpressionAttributeValues ?? {};
  const keyAttribute = names['#pk'] ?? names['#id'];
  if (expression.includes(`attribute_not_exists(${Object.keys(names).find((key) => names[key] === keyAttribute)})`)) {
    return current === undefined;
  }
  if (expression.includes(`attribute_exists(${Object.keys(names).find((key) => names[key] === keyAttribute)})`)
    && current === undefined) return false;
  if (expression.includes('#version = :version') && current?.version !== values[':version']) return false;
  if (expression.includes('attribute_not_exists(#version) OR #version = :zero')
    && current?.version !== undefined && current.version !== values[':zero']) return false;
  return true;
}

function conditionalFailure() {
  return Object.assign(new Error('conditional transaction failed'), {
    name: 'TransactionCanceledException',
    CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
  });
}

function createMockClient() {
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
      const Items = [...(tables.get(input.TableName)?.values() ?? [])]
        .filter((item) => item.pk === pk && item.sk.startsWith(skPrefix))
        .map(copy);
      return { Items };
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

export function createDynamoMoveStore() {
  const mock = createMockClient();
  const store = createCreatorStore({ ...TABLES, client: mock.client });
  return { mock, store };
}

export async function createDynamoMoveHarness() {
  const { mock, store } = createDynamoMoveStore();
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

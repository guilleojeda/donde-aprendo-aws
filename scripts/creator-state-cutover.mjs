import { readFile, writeFile, chmod } from 'node:fs/promises';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  applyCreatorStateCleanup,
  applyCreatorStateConversion,
  applyCreatorStateRestore,
  createCreatorStateConversionPlan,
} from './lib/creator-state-cutover.mjs';

function parseArguments(argv) {
  const [command, ...args] = argv;
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!name.startsWith('--') || index + 1 >= args.length) throw new TypeError(`invalid argument: ${name}`);
    const key = name.slice(2);
    if (Object.hasOwn(options, key)) throw new TypeError(`duplicate option: ${name}`);
    options[key] = args[index + 1];
    index += 1;
  }
  return { command, options };
}

function required(options, key) {
  const value = options[key];
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`--${key} is required`);
  return value.trim();
}

function assertOnlyOptions(options, allowed) {
  const unexpected = Object.keys(options).find((key) => !allowed.has(key));
  if (unexpected) throw new TypeError(`unsupported option: --${unexpected}`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writePrivateJson(path, value) {
  const data = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path, data, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  await chmod(path, 0o600);
}

async function createPlan(options) {
  assertOnlyOptions(options, new Set(['input', 'output']));
  const input = await readJson(required(options, 'input'));
  const plan = createCreatorStateConversionPlan(input);
  await writePrivateJson(required(options, 'output'), plan);
  process.stdout.write(`${JSON.stringify({
    action: 'dry-run-plan-created',
    profileId: plan.profileId,
    sourceFingerprint: plan.sourceFingerprint,
    backupFingerprint: plan.backupFingerprint,
    contentBytes: plan.sizes.contentBytes,
    itemBytes: plan.sizes.itemBytes,
    legacyRowsToRemove: plan.cleanup.rows.length,
    backupPath: options.output,
  })}\n`);
}

async function applyPlan(options) {
  assertOnlyOptions(options, new Set(['plan', 'phase', 'table', 'region']));
  const plan = await readJson(required(options, 'plan'));
  const phase = required(options, 'phase');
  const tableName = required(options, 'table');
  const region = required(options, 'region');
  if (!['convert', 'cleanup', 'restore'].includes(phase)) {
    throw new TypeError('--phase must be convert, cleanup, or restore');
  }
  const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  });
  const readPhysical = async (table, key) => {
    const result = await documentClient.send(new GetCommand({
      TableName: table,
      Key: key,
      ConsistentRead: true,
    }));
    return result?.Item;
  };
  const transact = async (TransactItems) => documentClient.send(new TransactWriteCommand({ TransactItems }));
  const result = phase === 'convert'
    ? await applyCreatorStateConversion(plan, { tableName, readPhysical, transact })
    : phase === 'cleanup'
      ? await applyCreatorStateCleanup(plan, { tableName, readPhysical, transact })
      : await applyCreatorStateRestore(plan, { tableName, readPhysical, transact });
  process.stdout.write(`${JSON.stringify({
    action: `apply-${phase}-complete`,
    profileId: plan.profileId,
    sourceFingerprint: plan.sourceFingerprint,
    ...(phase === 'cleanup' ? { deletedCount: result.deletedCount } : { creatorVersion: result.version }),
  })}\n`);
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  if (command === 'plan') return createPlan(options);
  if (command === 'apply') return applyPlan(options);
  throw new TypeError('usage: creator-state-cutover.mjs plan --input EXPORT.json --output PLAN.json | apply --plan PLAN.json --phase convert|cleanup|restore --table TABLE --region REGION');
}

main().catch((error) => {
  const code = typeof error?.code === 'string' ? ` ${error.code}` : '';
  process.stderr.write(`${error?.name ?? 'Error'}${code}: ${error?.message ?? 'cutover tool failed'}\n`);
  process.exitCode = 1;
});

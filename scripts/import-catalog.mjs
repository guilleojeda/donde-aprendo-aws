#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isMainThread } from 'node:worker_threads';

import {
  importCatalog,
  mapTsvRows,
  parseCatalogTsv,
} from '../src/lib/catalog-import.mjs';

export const CLI_USAGE = `Usage: node scripts/import-catalog.mjs [options] path/to/catalog.tsv

Options:
  --dry-run           Parse and print the mapped public records; never contacts AWS.
  --table TABLE       DynamoDB table name (or set CATALOG_TABLE for a real import).
  --region REGION     AWS region (defaults to AWS_REGION or us-east-1).
  --input PATH        Provide the TSV path as an option instead of a positional argument.
  --help              Show this help text.

Real imports verify AWS account 719535286359 and conditionally create missing IDs.
Existing records are skipped so owner edits and publication flags are preserved.`;

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  if (args.help) {
    (dependencies.write ?? console.log)(CLI_USAGE);
    return { help: true };
  }
  const sourcePath = args.inputPath ?? args.positionals[0];
  if (!sourcePath) {
    throw new Error('Usage: node scripts/import-catalog.mjs [--dry-run] [--table TABLE] path/to/catalog.tsv');
  }

  const read = dependencies.readFile ?? readFile;
  const source = await read(sourcePath, 'utf8');
  const records = mapTsvRows(parseCatalogTsv(source));

  if (args.dryRun) {
    const output = {
      dryRun: true,
      source: sourcePath,
      count: records.length,
      published: records.filter((record) => record.published === true).length,
      records,
    };
    (dependencies.write ?? console.log)(JSON.stringify(output, null, 2));
    return output;
  }

  const tableName = args.tableName ?? process.env.CATALOG_TABLE;
  if (!tableName) {
    throw new Error('Catalog import requires --table TABLE or CATALOG_TABLE');
  }
  const result = await (dependencies.importCatalog ?? importCatalog)(records, {
    tableName,
    region: args.region ?? process.env.AWS_REGION ?? 'us-east-1',
  });
  const output = { dryRun: false, source: sourcePath, tableName, ...result };
  (dependencies.write ?? console.log)(JSON.stringify(output, null, 2));
  return output;
}

export function parseArgs(argv) {
  const result = { dryRun: false, positionals: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--table') {
      result.tableName = requireValue(argv, ++index, '--table');
    } else if (arg === '--region') {
      result.region = requireValue(argv, ++index, '--region');
    } else if (arg === '--input') {
      result.inputPath = requireValue(argv, ++index, '--input');
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      result.positionals.push(arg);
    }
  }
  if (result.help) {
    return result;
  }
  if (result.positionals.length > 1 || (result.inputPath && result.positionals.length > 0)) {
    throw new Error('Catalog import accepts one TSV input path');
  }
  return result;
}

function requireValue(argv, index, option) {
  const value = argv[index];
  if (!value || value.startsWith('-')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

if (isMainThread && process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

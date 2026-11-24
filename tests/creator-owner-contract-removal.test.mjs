import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ownerComponentDirectory = join(root, 'src/components/creator-owner');
const fixedSources = [
  'src/lib/creator-pages.mjs',
  'src/lib/creator-owner-data.ts',
  'src/lib/creator-owner-state.ts',
  'src/types/creators.ts',
  'src/pages/cuenta/_creator-page.ts',
];

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

test('the retired owner recovery mechanism and its selectors are removed from all affected sources', async () => {
  const obsoleteComponent = join(ownerComponentDirectory, 'CreatorOwnerReadRecoveryAction.tsx');
  assert.equal(await exists(obsoleteComponent), false,
    'the obsolete cross-version recovery component is deleted');

  const componentNames = (await readdir(ownerComponentDirectory))
    .filter((name) => name.endsWith('.tsx'))
    .map((name) => join(ownerComponentDirectory, name));
  const sourcePaths = [...fixedSources, ...componentNames];
  const sources = await Promise.all(sourcePaths.map(async (path) => [path, await readFile(path, 'utf8')]));
  const retiredMechanisms = [
    ['obsolete recovery component', /\bCreatorOwnerReadRecoveryAction\b/u],
    ['obsolete read flag', /\breadContractObsolete\b/u],
    ['obsolete session reason', /['"]obsolete-contract['"]/u],
    ['read contract-version selector argument', /\bcontractVersion\b/u],
    ['retired v2 resource DTO', /\bCreatorOwnerResourceV2DTO\b/u],
    ['retired v2 snapshot DTO', /\bCreatorOwnerSnapshotV2DTO\b/u],
    ['retired version-union wire DTO', /\bCreatorOwnerSnapshotWireDTO\b/u],
  ];
  for (const [path, source] of sources) {
    for (const [name, pattern] of retiredMechanisms) {
      assert.doesNotMatch(source, pattern, `${name} remains in ${path}`);
    }
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyCreatorStateCleanup,
  applyCreatorStateConversion,
  applyCreatorStateRestore,
  buildCreatorStateCleanupTransactions,
  buildCreatorStateConversionTransaction,
  createCreatorStateConversionPlan,
  creatorStateCutoverInternals,
} from '../scripts/lib/creator-state-cutover.mjs';

const PROFILE_ID = 'creator-cutover';
const PK = `PROFILE#${PROFILE_ID}`;

function legacyExport({
  includeDeletedAlias = true,
  count = 3,
  oversized = false,
  profile = {},
} = {}) {
  const rows = [{
    pk: PK,
    sk: 'META',
    recordType: 'profile',
    id: PROFILE_ID,
    version: 9,
    displayName: 'Creadora',
    slug: 'creadora',
    programs: ['Heroes'],
    socials: {},
    published: true,
    hidden: false,
    createdAt: 100,
    updatedAt: 200,
    ...profile,
  }];
  const resourceRows = [];
  const placementRows = [
    { id: 'z', resourceId: 'resource:z', position: 10, featured: true, selectedForDirectory: true, series: { course: { position: 7 } } },
    { id: 'a', resourceId: 'resource:a', position: 20, featured: false, selectedForDirectory: false, series: { course: { position: 7 } } },
    { id: 'hidden', resourceId: 'resource:hidden', position: 30, featured: false, selectedForDirectory: true, series: { deleted: { position: 0 }, 'hidden-check': { position: 1 } } },
  ];
  for (const placement of placementRows.slice(0, count)) {
    rows.push({
      pk: PK,
      sk: `PLACEMENT#${placement.id}`,
      recordType: 'placement',
      profileId: PROFILE_ID,
      position: placement.position,
      featured: placement.featured,
      selectedForDirectory: placement.selectedForDirectory,
      ...placement,
    });
    resourceRows.push({ id: placement.resourceId, title: placement.id === 'hidden' || placement.id === 'z' ? 'oculto' : 'visible', hidden: placement.id !== 'a' });
  }
  rows.push({
    pk: PK,
    sk: 'SERIES#course',
    recordType: 'series',
    id: 'course',
    profileId: PROFILE_ID,
    name: 'Curso',
    slug: 'curso',
    version: 3,
    createdAt: 50,
    updatedAt: 75,
  });
  rows.push({
    pk: PK,
    sk: 'SERIES#hidden-check',
    recordType: 'series',
    id: 'hidden-check',
    profileId: PROFILE_ID,
    name: 'Serie con enlace oculto',
    slug: 'serie-oculto',
    version: 1,
    createdAt: 80,
    updatedAt: 90,
  });
  for (const [seriesId, slug] of [['course', 'curso'], ['hidden-check', 'serie-oculto']]) {
    rows.push({
      pk: PK,
      sk: `SERIES_SLUG#${slug}`,
      recordType: 'seriesAlias',
      profileId: PROFILE_ID,
      seriesId,
      slug,
      version: 1,
    });
  }
  if (includeDeletedAlias) {
    rows.push({
      pk: PK,
      sk: 'SERIES_SLUG#curso-anterior',
      recordType: 'seriesAlias',
      profileId: PROFILE_ID,
      seriesId: 'deleted',
      slug: 'curso-anterior',
      version: 2,
    });
  }
  if (oversized) {
    for (let index = 0; index < 197; index += 1) {
      const id = `series-${String(index).padStart(3, '0')}`;
      rows.push({
        pk: PK,
        sk: `SERIES#${id}`,
        recordType: 'series',
        id,
        profileId: PROFILE_ID,
        name: `Serie ${index}`,
        slug: `serie-${String(index).padStart(3, '0')}`,
        description: 'x'.repeat(2000),
      });
      const slug = `serie-${String(index).padStart(3, '0')}`;
      rows.push({
        pk: PK,
        sk: `SERIES_SLUG#${slug}`,
        recordType: 'seriesAlias',
        profileId: PROFILE_ID,
        seriesId: id,
        slug,
        version: 1,
      });
    }
  }
  rows.push({
    pk: PK,
    sk: 'EDITOR#resource:retained',
    recordType: 'editorReference',
    profileId: PROFILE_ID,
    resourceId: 'resource:retained',
    version: 1,
  });
  return {
    profileId: PROFILE_ID,
    rows,
    resourceRows,
    preservedRows: [{ table: 'accounts', key: { pk: 'PROFILE_OWNER#account-hash' }, item: { pk: 'PROFILE_OWNER#account-hash', profileId: PROFILE_ID } }],
  };
}

function assertCutoverError(fn, code) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

function malformedHistoricalAliasPlan(input) {
  const validPlan = createCreatorStateConversionPlan(input);
  const rows = structuredClone(input.rows);
  rows.find(({ sk }) => sk === 'SERIES_SLUG#curso-anterior').seriesId = 17;
  const conversionSourceRows = rows
    .filter(({ sk }) => sk === 'META' || sk.startsWith('PLACEMENT#') || sk.startsWith('SERIES#') || sk.startsWith('SERIES_SLUG#'))
    .sort((left, right) => left.sk.localeCompare(right.sk));
  const malformed = structuredClone(validPlan);
  malformed.backup.profileRows = rows;
  malformed.conversionSourceRows = structuredClone(conversionSourceRows);
  malformed.sourceFingerprint = creatorStateCutoverInternals.fingerprint(conversionSourceRows);
  malformed.backupFingerprint = creatorStateCutoverInternals.fingerprint({
    rows: [...rows].sort((left, right) => left.sk.localeCompare(right.sk)),
    resourceRows: input.resourceRows,
    preservedRows: input.preservedRows,
  });
  return malformed;
}

test('legacy conversion preserves exact IDs and independently sorts general and tied chapter sequences', () => {
  const plan = createCreatorStateConversionPlan(legacyExport());
  assert.deepEqual(plan.convertedState.order, {
    featured: ['z'],
    ordinary: ['a', 'hidden'],
  });
  assert.deepEqual(plan.convertedState.series.course.chapters, ['a', 'z']);
  assert.deepEqual(plan.convertedState.series['hidden-check'].chapters, ['hidden'], 'hidden resources stay in chapter sequences');
  assert.equal(plan.convertedState.placements.z.resourceId, 'resource:z');
  assert.equal(plan.convertedState.placements.hidden.resourceId, 'resource:hidden', 'hidden resources remain in sequences');
  assert.equal(Object.hasOwn(plan.convertedState, 'city'), false, 'absent optional profile fields stay absent');
  assert.equal(Object.hasOwn(plan.convertedState.series.course, 'description'), false, 'absent Series description stays absent');
  assert.equal(plan.convertedState.version, 10);
  assert.equal(plan.convertedState.createdAt, 100);
  assert.equal(plan.backup.profileRows.some(({ sk }) => sk === 'EDITOR#resource:retained'), true);
  assert.equal(plan.cleanup.rows.some(({ sk }) => sk.startsWith('SERIES_SLUG#')), false, 'aliases remain outside cleanup');
  assert.equal(plan.backup.preservedRows[0].item.profileId, PROFILE_ID);
});

test('conversion rejects a visible legacy profile with a blank public identity before planning replacement', () => {
  assertCutoverError(
    () => createCreatorStateConversionPlan(legacyExport({ profile: { slug: '' } })),
    'INVALID_EXPORT',
  );
  assertCutoverError(
    () => createCreatorStateConversionPlan(legacyExport({ profile: { displayName: '   ' } })),
    'INVALID_EXPORT',
  );

  const draft = createCreatorStateConversionPlan(legacyExport({
    profile: { displayName: '', slug: '', published: false },
  }));
  assert.equal(draft.convertedState.slug, '');
  const hidden = createCreatorStateConversionPlan(legacyExport({
    profile: { displayName: '', slug: '', published: true, hidden: true },
  }));
  assert.equal(hidden.convertedState.hidden, true);
});

test('apply rejects a stale plan that would replace a visible corrupt profile before provider access', async () => {
  const plan = createCreatorStateConversionPlan(legacyExport());
  const stale = structuredClone(plan);
  stale.backup.profileRows.find(({ sk }) => sk === 'META').slug = '';
  let reads = 0;
  let writes = 0;
  await assert.rejects(() => applyCreatorStateConversion(stale, {
    tableName: 'profiles-test',
    async readPhysical() {
      reads += 1;
      return undefined;
    },
    async transact() {
      writes += 1;
    },
  }), (error) => error.code === 'INVALID_EXPORT');
  assert.deepEqual({ reads, writes }, { reads: 0, writes: 0 });
});

test('every live Series owns its exact current slug through one retained alias', async (context) => {
  const missing = legacyExport();
  missing.rows = missing.rows.filter(({ sk }) => sk !== 'SERIES_SLUG#curso');

  const wrongOwner = legacyExport();
  wrongOwner.rows.find(({ sk }) => sk === 'SERIES_SLUG#curso').seriesId = 'hidden-check';

  const duplicateClaim = legacyExport();
  duplicateClaim.rows.find(({ sk }) => sk === 'SERIES#hidden-check').slug = 'curso';

  for (const [label, invalid] of [
    ['missing canonical alias', missing],
    ['alias points to another live Series', wrongOwner],
    ['two live Series claim one canonical slug', duplicateClaim],
  ]) {
    await context.test(label, async () => {
      assertCutoverError(() => createCreatorStateConversionPlan(invalid), 'SERIES_CANONICAL_ALIAS_MISMATCH');

      let reads = 0;
      let writes = 0;
      await assert.rejects(() => applyCreatorStateConversion({
        format: 'creator-state-cutover-v1',
        profileId: invalid.profileId,
        backup: {
          profileRows: invalid.rows,
          resourceRows: invalid.resourceRows,
          preservedRows: invalid.preservedRows,
        },
      }, {
        tableName: 'profiles-test',
        async readPhysical() { reads += 1; },
        async transact() { writes += 1; },
      }), (error) => error.code === 'SERIES_CANONICAL_ALIAS_MISMATCH');
      assert.deepEqual({ reads, writes }, { reads: 0, writes: 0 }, 'invalid alias ownership stops before provider access or mutation');
    });
  }
});

test('a deleted-Series membership is omitted only with its exact retained alias', () => {
  const valid = createCreatorStateConversionPlan(legacyExport());
  assert.deepEqual(valid.convertedState.series.course.chapters, ['a', 'z']);
  assertCutoverError(() => createCreatorStateConversionPlan(legacyExport({ includeDeletedAlias: false })),
    'UNEXPLAINED_SERIES_REFERENCE');
});

test('apply rejects a typed-malformed historical Series alias before its replacement write', async () => {
  const input = legacyExport({ count: 2 });
  const malformedPlan = malformedHistoricalAliasPlan(input);
  const physical = new Map(malformedPlan.backup.profileRows.map((row) => [
    `${row.pk}\u0000${row.sk}`,
    structuredClone(row),
  ]));
  let reads = 0;
  let writes = 0;
  let failure;
  try {
    await applyCreatorStateConversion(malformedPlan, {
      tableName: 'profiles-test',
      async readPhysical(_table, key) {
        reads += 1;
        return structuredClone(physical.get(`${key.pk}\u0000${key.sk}`));
      },
      async transact(actions) {
        writes += 1;
        for (const action of actions) {
          if (action.Put) physical.set(`${action.Put.Item.pk}\u0000${action.Put.Item.sk}`, structuredClone(action.Put.Item));
        }
      },
    });
  } catch (error) {
    failure = error;
  }
  assert.deepEqual({ reads, writes }, { reads: 0, writes: 0 },
    'a malformed historical alias fails before provider reads or replacement writes');
  assert.ok(failure, 'the malformed alias must be rejected');
  assert.equal(failure.code, 'INVALID_EXPORT');
});

test('conversion rejects an oversized candidate before creating write actions', () => {
  assertCutoverError(() => createCreatorStateConversionPlan(legacyExport({ count: 2, oversized: true })),
    'CREATOR_CONTENT_TOO_LARGE');
});

test('conversion plan builds one guarded META replacement and bounded cleanup transactions', () => {
  const input = legacyExport();
  const plan = createCreatorStateConversionPlan(input);
  const [conversion] = buildCreatorStateConversionTransaction(plan, 'profiles-test');
  assert.equal(conversion.Put.TableName, 'profiles-test');
  assert.deepEqual(conversion.Put.Item, plan.convertedState);
  assert.match(conversion.Put.ConditionExpression, /#version = :version/u);
  assert.equal(conversion.Put.ExpressionAttributeValues[':version'], 9);

  const batches = buildCreatorStateCleanupTransactions(plan, 'profiles-test');
  assert.equal(batches.length, 1);
  assert.equal(batches[0][0].ConditionCheck.Key.sk, 'META');
  assert.equal(batches[0].length, plan.cleanup.rows.length + 1);
  assert.ok(batches[0].slice(1).every((action) => action.Delete.TableName === 'profiles-test'));
  assert.ok(batches[0].slice(1).every((action) => !action.Delete.Key.sk.startsWith('SERIES_SLUG#')));
});

test('dry-run source mismatch stops before any provider transaction', async () => {
  const plan = createCreatorStateConversionPlan(legacyExport());
  const current = new Map(plan.conversionSourceRows.map((row) => [`${row.pk}\u0000${row.sk}`, structuredClone(row)]));
  const changed = structuredClone(current.get(`${PK}\u0000PLACEMENT#z`));
  changed.position += 1;
  current.set(`${PK}\u0000PLACEMENT#z`, changed);
  let transactionCount = 0;
  await assert.rejects(() => applyCreatorStateConversion(plan, {
    tableName: 'profiles-test',
    async readPhysical(_table, key) { return structuredClone(current.get(`${key.pk}\u0000${key.sk}`)); },
    async transact() { transactionCount += 1; },
  }), (error) => error.code === 'SOURCE_CHANGED');
  assert.equal(transactionCount, 0);
});

test('conversion, cleanup, and pre-reopen restore preserve the exact legacy backup', async () => {
  const plan = createCreatorStateConversionPlan(legacyExport());
  const rows = new Map(plan.backup.profileRows.map((row) => [`${row.pk}\u0000${row.sk}`, structuredClone(row)]));
  const sourceRows = structuredClone([...rows.values()]);
  const readPhysical = async (_table, key) => structuredClone(rows.get(`${key.pk}\u0000${key.sk}`));
  const transact = async (items) => {
    for (const action of items) {
      const request = action.Put ?? action.Delete ?? action.ConditionCheck;
      const key = request.Key ?? request.Item;
      const mapKey = `${key.pk}\u0000${key.sk}`;
      if (action.Put) rows.set(mapKey, structuredClone(action.Put.Item));
      else if (action.Delete) rows.delete(mapKey);
    }
  };

  await applyCreatorStateConversion(plan, { tableName: 'profiles-test', readPhysical, transact });
  assert.deepEqual(rows.get(`${PK}\u0000META`), plan.convertedState);
  const retainedEditor = sourceRows.find(({ sk }) => sk.startsWith('EDITOR#'));
  assert.deepEqual(rows.get(`${PK}\u0000${retainedEditor.sk}`), retainedEditor);

  const cleanup = await applyCreatorStateCleanup(plan, { tableName: 'profiles-test', readPhysical, transact });
  assert.equal(cleanup.deletedCount, plan.cleanup.rows.length);
  assert.equal(plan.cleanup.rows.some((row) => rows.has(`${row.pk}\u0000${row.sk}`)), false);
  assert.deepEqual(rows.get(`${PK}\u0000META`), plan.convertedState);

  await applyCreatorStateRestore(plan, { tableName: 'profiles-test', readPhysical, transact });
  assert.deepEqual([...rows.values()].sort((a, b) => a.sk.localeCompare(b.sk)),
    sourceRows.sort((a, b) => a.sk.localeCompare(b.sk)));
});

test('the CLI dry-run writes a private plan file and prints only a summary', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'creator-state-cutover-'));
  try {
    const inputPath = join(directory, 'profile-export.json');
    const outputPath = join(directory, 'profile-plan.json');
    await writeFile(inputPath, JSON.stringify(legacyExport()), { mode: 0o600 });
    const result = spawnSync(process.execPath, [
      'scripts/creator-state-cutover.mjs', 'plan',
      '--input', inputPath, '--output', outputPath,
    ], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.action, 'dry-run-plan-created');
    assert.equal(summary.profileId, PROFILE_ID);
    assert.equal(result.stdout.includes('Creadora'), false, 'private source content is not printed to the terminal');
    const plan = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(plan.convertedState.version, 10);
    assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('converter plans no more than 99 row deletes alongside the META guard', () => {
  const input = legacyExport({ count: 0 });
  const resources = [];
  for (let index = 0; index < 100; index += 1) {
    const id = `placement-${String(index).padStart(3, '0')}`;
    const resourceId = `resource-${index}`;
    input.rows.push({
      pk: PK, sk: `PLACEMENT#${id}`, recordType: 'placement', id, profileId: PROFILE_ID,
      resourceId, position: index, featured: false, selectedForDirectory: true,
    });
    resources.push({ id: resourceId, title: `resource ${index}` });
  }
  input.resourceRows = resources;
  const plan = createCreatorStateConversionPlan(input);
  const batches = buildCreatorStateCleanupTransactions(plan, 'profiles-test');
  assert.deepEqual(batches.map((batch) => batch.length), [100, 4]);
  assert.ok(batches.every((batch) => batch[0].ConditionCheck && batch.length <= 100));
});

test('cleanup can safely resume after one conditional delete batch committed', async () => {
  const input = legacyExport({ count: 0 });
  for (let index = 0; index < 100; index += 1) {
    const id = `placement-${String(index).padStart(3, '0')}`;
    const resourceId = `resource-${index}`;
    input.rows.push({
      pk: PK, sk: `PLACEMENT#${id}`, recordType: 'placement', id, profileId: PROFILE_ID,
      resourceId, position: index, featured: false, selectedForDirectory: true,
    });
    input.resourceRows.push({ id: resourceId });
  }
  const plan = createCreatorStateConversionPlan(input);
  const rows = new Map(plan.backup.profileRows.map((row) => [`${row.pk}\u0000${row.sk}`, structuredClone(row)]));
  const readPhysical = async (_table, key) => structuredClone(rows.get(`${key.pk}\u0000${key.sk}`));
  let transactionCount = 0;
  const transact = async (items) => {
    transactionCount += 1;
    if (transactionCount === 2) throw new Error('interrupted after one cleanup batch');
    for (const action of items) {
      const request = action.Put ?? action.Delete ?? action.ConditionCheck;
      const key = request.Key ?? request.Item;
      const mapKey = `${key.pk}\u0000${key.sk}`;
      if (action.Delete) rows.delete(mapKey);
      else if (action.Put) rows.set(mapKey, structuredClone(action.Put.Item));
    }
  };
  await applyCreatorStateConversion(plan, { tableName: 'profiles-test', readPhysical, transact });
  transactionCount = 0;
  await assert.rejects(applyCreatorStateCleanup(plan, { tableName: 'profiles-test', readPhysical, transact }),
    /interrupted after one cleanup batch/u);
  assert.equal(plan.cleanup.rows.filter((row) => !rows.has(`${row.pk}\u0000${row.sk}`)).length, 99);

  const completeCleanup = async (items) => {
    for (const action of items) {
      const request = action.Put ?? action.Delete ?? action.ConditionCheck;
      const key = request.Key ?? request.Item;
      const mapKey = `${key.pk}\u0000${key.sk}`;
      if (action.Delete) rows.delete(mapKey);
      else if (action.Put) rows.set(mapKey, structuredClone(action.Put.Item));
    }
  };
  const cleanup = await applyCreatorStateCleanup(plan, {
    tableName: 'profiles-test', readPhysical, transact: completeCleanup,
  });
  assert.equal(cleanup.deletedCount, plan.cleanup.rows.length);
  assert.equal(plan.cleanup.rows.every((row) => !rows.has(`${row.pk}\u0000${row.sk}`)), true);
});

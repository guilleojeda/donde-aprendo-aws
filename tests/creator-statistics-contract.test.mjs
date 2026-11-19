import assert from 'node:assert/strict';
import test from 'node:test';
import { createCachedCreatorStatistics } from '../src/lib/creator-statistics.mjs';
import { createCreatorStatisticsStore } from '../src/lib/creator-statistics-store.mjs';
import {
  parseCreatorStatisticsReady,
  parseCreatorStatisticsSummaryReady,
} from '../src/lib/creator-statistics-response.ts';

const NOW = Date.parse('2026-10-24T15:00:00.000Z');
const STALE = NOW - 2 * 60 * 60 * 1000;
const PROFILE = 'creator-contract';
const QUERY = { profileId: PROFILE, period: 7, page: 1 };
const RANGE = {
  startDate: '2026-10-18',
  endDate: '2026-10-24',
  timeZone: 'America/Argentina/Buenos_Aires',
};

function detail(overrides = {}) {
  return {
    creatorId: PROFILE,
    period: 7,
    page: 1,
    range: RANGE,
    totals: { views: 10, visitors: 2, clicks: 3 },
    daily: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-10-${String(18 + index).padStart(2, '0')}`,
      views: 0,
      clicks: 0,
    })),
    links: { page: 1, pageSize: 100, totalRows: 0, rows: [] },
    sources: [],
    warnings: [],
    captureStartedAt: '2026-10-23T23:38:00Z',
    ...overrides,
  };
}

function periodReport(overrides = {}) {
  const { page, links, ...common } = detail();
  return { ...common, ...overrides };
}

function summary(overrides = {}) {
  const { daily, sources, ...common } = periodReport();
  return { ...common, ...overrides };
}

function physicalKey({ kind, profileId = PROFILE, period = 7, page = 1 }) {
  const suffix = kind === 'summary'
    ? `${period}#summary`
    : kind === 'period'
      ? `${period}#period`
      : `${period}#page#${page}`;
  return {
    pk: `ANALYTICS#${profileId}`,
    sk: `GA4#424203315#v2#${suffix}`,
  };
}

function storedRow(kind, report, updatedAt = NOW, revision = 'predecessor-revision') {
  return {
    ...physicalKey({ kind, ...QUERY }),
    recordType: 'analyticsCache',
    profileId: PROFILE,
    propertyId: '424203315',
    period: QUERY.period,
    ...(kind === 'page' ? { page: QUERY.page } : {}),
    kind,
    revision,
    schemaVersion: 1,
    report,
    updatedAt,
    expiresAt: updatedAt + 60 * 60 * 1000,
    retainUntil: updatedAt + 7 * 24 * 60 * 60 * 1000,
    ttl: Math.ceil(updatedAt / 1000) + 7 * 24 * 60 * 60,
  };
}

function dynamoCache(initialRows, concurrentWinner) {
  const rowId = ({ pk, sk }) => `${pk}\u0000${sk}`;
  const rows = new Map(initialRows.map((row) => [rowId(row), structuredClone(row)]));
  const gets = [];
  const puts = [];
  const client = {
    async send(command) {
      const { input } = command;
      if (command.constructor.name === 'GetCommand') {
        gets.push(input);
        const row = rows.get(rowId(input.Key));
        return row ? { Item: structuredClone(row) } : {};
      }
      assert.equal(command.constructor.name, 'PutCommand');
      puts.push(input);
      const id = rowId(input.Item);
      if (concurrentWinner && id === rowId(concurrentWinner)) {
        rows.set(id, structuredClone(concurrentWinner));
      }
      const existing = rows.get(id);
      const expected = input.ExpressionAttributeValues?.[':expectedRevision'];
      const accepted = input.ConditionExpression === 'attribute_not_exists(#pk)'
        ? existing === undefined
        : existing?.revision === expected;
      if (!accepted) {
        const error = new Error('conditional conflict');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }
      rows.set(id, structuredClone(input.Item));
      return {};
    },
  };
  return {
    cache: createCreatorStatisticsStore({ profilesTableName: 'creator-profiles-test', propertyId: '424203315', client }),
    gets,
    puts,
  };
}

const summaryOperation = {
  run: (service) => service.readSummary(QUERY),
  decode: (value) => parseCreatorStatisticsSummaryReady(value, QUERY.period, PROFILE),
  valid: summary(),
};
const detailOperation = {
  run: (service) => service.read(QUERY),
  decode: (value) => parseCreatorStatisticsReady(value, QUERY.period, QUERY.page, PROFILE),
  valid: detail(),
};

function fixture(rows, { concurrentWinner, unavailable } = {}) {
  let providerReads = 0;
  const storage = dynamoCache(rows, concurrentWinner);
  async function read(valid) {
    providerReads += 1;
    if (unavailable) throw unavailable;
    return structuredClone(valid);
  }
  const service = createCachedCreatorStatistics({
    cache: storage.cache,
    now: () => NOW,
    reader: {
      read: () => read(detailOperation.valid),
      readSummary: () => read(summaryOperation.valid),
    },
  });
  return { ...storage, service, providerReads: () => providerReads };
}

const badWarning = [{ section: 'visits' }];
const badPage = detail({
  links: { ...detail().links, rows: [{ linkId: 'link-one', clicks: 1 }] },
});

for (const [label, kind, malformed, operation] of [
  ['summary warning without code', 'summary', summary({ warnings: badWarning }), summaryOperation],
  ['summary with detail fields', 'summary', detail(), summaryOperation],
  ['period with a malformed warning read for a summary', 'period', periodReport({ warnings: badWarning }), summaryOperation],
  ['page with more links than its total', 'page', badPage, detailOperation],
]) {
  test(`the real cache serves a valid provider result for a fresh ${label}`, async () => {
    const data = fixture([storedRow(kind, malformed)]);
    const decoded = operation.decode(await operation.run(data.service));
    assert.ok(decoded, 'actual consumer must accept what the cache returns');
    assert.equal(decoded.freshness, 'fresh');
    assert.deepEqual(decoded.totals, operation.valid.totals);
    assert.equal(data.providerReads(), 1);
    assert.ok(data.gets.some(({ Key, ConsistentRead }) => ConsistentRead && Key.sk === physicalKey({ kind, ...QUERY }).sk));
    assert.equal(data.puts.some(({ Item }) => Item.kind === kind), false,
      'a malformed observation must not authorize replacing that row');
  });
}

for (const [kind, malformed, operation] of [
  ['summary', summary({ warnings: badWarning }), summaryOperation],
  ['page', badPage, detailOperation],
]) {
  test(`a malformed expired ${kind} cannot authorize a write during a successful refresh`, async () => {
    const data = fixture([storedRow(kind, malformed, STALE)]);
    const decoded = operation.decode(await operation.run(data.service));
    assert.ok(decoded);
    assert.equal(decoded.freshness, 'fresh');
    assert.deepEqual(decoded.totals, operation.valid.totals);
    assert.equal(data.providerReads(), 1);
    assert.equal(data.puts.some(({ Item }) => Item.kind === kind), false);
  });

  test(`outage fallback serves only a usable retained ${kind}`, async () => {
    const unavailable = new Error('provider unavailable');
    const bad = fixture([storedRow(kind, malformed, STALE)], { unavailable });
    await assert.rejects(operation.run(bad.service), unavailable);
    assert.equal(bad.providerReads(), 1);
    assert.equal(bad.puts.length, 0);

    const good = fixture([storedRow(kind, operation.valid, STALE)], { unavailable });
    const decoded = operation.decode(await operation.run(good.service));
    assert.ok(decoded);
    assert.equal(decoded.freshness, 'stale');
    assert.equal(decoded.updatedAt, new Date(STALE).toISOString());
    assert.equal(good.providerReads(), 1);
    assert.equal(good.puts.length, 0);
  });

  test(`a ${kind} CAS loser uses a valid winner and retains its provider candidate for a malformed one`, async () => {
    const previous = storedRow(kind, operation.valid, STALE);
    const winnerTotals = { views: 99, visitors: 9, clicks: 9 };
    for (const candidate of [malformed, operation.valid]) {
      const badWinner = candidate === malformed;
      const data = fixture([previous], {
        concurrentWinner: storedRow(kind, { ...candidate, totals: winnerTotals }, NOW - 2_000, 'winner'),
      });
      const decoded = operation.decode(await operation.run(data.service));
      assert.ok(decoded, 'actual consumer must accept the returned provider result or winner');
      assert.deepEqual(decoded.totals, badWinner ? operation.valid.totals : winnerTotals);
      assert.equal(decoded.updatedAt, new Date(badWinner ? NOW : NOW - 2_000).toISOString());
      assert.equal(data.providerReads(), 1);
      const writes = data.puts.filter(({ Item }) => Item.kind === kind);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].ExpressionAttributeValues[':expectedRevision'], previous.revision);
      const key = physicalKey({ kind, ...QUERY }).sk;
      assert.equal(data.gets.filter(({ Key, ConsistentRead }) => Key.sk === key && ConsistentRead).length, 2);
    }
  });
}

test('a summary can recover from a usable retained period created by a detail visit', async () => {
  const unavailable = new Error('provider unavailable');
  const storage = dynamoCache([]);
  let now = STALE;
  let summaryReads = 0;
  const service = createCachedCreatorStatistics({
    cache: storage.cache,
    now: () => now,
    reader: {
      read: async () => detail({ warnings: [
        { section: 'visits', code: 'limited-coverage' },
        { section: 'sources', code: 'limited-coverage' },
      ] }),
      readSummary: async () => {
        summaryReads += 1;
        throw unavailable;
      },
    },
  });
  assert.ok(detailOperation.decode(await service.read(QUERY)));
  assert.deepEqual(storage.puts.map(({ Item }) => Item.kind).sort(), ['page', 'period']);
  now = NOW;
  const recovered = summaryOperation.decode(await service.readSummary(QUERY));
  assert.ok(recovered);
  assert.equal(recovered.freshness, 'stale');
  assert.equal(recovered.updatedAt, new Date(STALE).toISOString());
  assert.deepEqual(recovered.totals, detailOperation.valid.totals);
  assert.deepEqual(recovered.warnings, [{ section: 'visits', code: 'limited-coverage' }]);
  assert.equal(summaryReads, 1);
  assert.equal(storage.puts.length, 2, 'serving the retained period does not write');
});

test('a malformed retained period cannot satisfy a summary during a provider outage', async () => {
  const unavailable = new Error('provider unavailable');
  const data = fixture([storedRow('period', periodReport({ warnings: badWarning }), STALE)], { unavailable });
  await assert.rejects(data.service.readSummary(QUERY), unavailable);
  assert.equal(data.providerReads(), 1);
  assert.equal(data.puts.length, 0);
});

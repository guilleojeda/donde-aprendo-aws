import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GetCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { currentUrlReservationId } from '../src/lib/catalog-url.mjs';
import { dynamoConditionMatches } from './fixtures/creator-link-move.mjs';
import {
  applyMeetupSourceLocators,
  planMeetupSourceLocators,
} from '../scripts/backfill-meetup-source-locators.mjs';

const TABLE = 'catalog-test';
const sourceUrl = (slug) => `https://www.meetup.com/${slug}/`;

function community(overrides = {}) {
  const id = overrides.id ?? 'meetup-241';
  return {
    id,
    title: `AWS community ${id.slice(7)}`,
    url: sourceUrl(`public-${id.slice(7)}`),
    kind: 'community',
    format: 'User Group',
    country: 'AR',
    published: true,
    version: 1,
    ...overrides,
  };
}

const reviewedGroup = (id, slug) => ({ id, url: sourceUrl(slug) });
const copy = (value) => value === undefined ? undefined : structuredClone(value);

function resolveName(token, names) {
  return names[token] ?? token;
}

function submittedLocator(input) {
  const names = input.ExpressionAttributeNames ?? {};
  const values = input.ExpressionAttributeValues ?? {};
  const set = /(?:^|\s)SET\s+(.+)$/iu.exec(input.UpdateExpression ?? '');
  assert.ok(set, 'backfill must submit an UpdateExpression');
  const assignments = Object.fromEntries(set[1].split(',').map((part) => {
    const match = /^\s*(#[A-Za-z0-9_]+|[A-Za-z][A-Za-z0-9_]*)\s*=\s*(:[A-Za-z0-9_]+)\s*$/u.exec(part);
    assert.ok(match, `unsupported backfill assignment: ${part}`);
    return [resolveName(match[1], names), values[match[2]]];
  }));
  assert.deepEqual(Object.keys(assignments).sort(), ['meetupSourceUrl', 'version'],
    'the update may change only the private locator and its revision');
  return assignments;
}

function assertSubmittedCas(input, { id, version, locator, observedItem }) {
  assert.deepEqual(input.Key, { id }, 'the update key must be the exact community record');
  assert.equal(observedItem.id, id);
  assert.equal(observedItem.version, version === null ? undefined : version);
  assert.equal(observedItem.meetupSourceUrl, locator);
  assert.equal(dynamoConditionMatches(input, observedItem), true,
    'the submitted DynamoDB condition must accept the exact observed item');
  assert.equal(dynamoConditionMatches(input, { ...observedItem, version: version === null ? 0 : version + 1 }), false,
    'the condition must reject a changed revision and distinguish absent version from zero');
  if (version === 0) {
    assert.equal(dynamoConditionMatches(input, { ...observedItem, version: undefined }), false,
      'a condition planned from explicit zero must reject an absent legacy revision');
  }
  assert.equal(dynamoConditionMatches(input, {
    ...observedItem,
    meetupSourceUrl: locator === undefined ? 'https://www.meetup.com/other-locator/' : `${locator}other/`,
  }), false, 'the condition must reject a changed locator');
  return submittedLocator(input);
}

/** Small provider fixture: it applies only the submitted ID, revision, and locator CAS guards. */
class CatalogDocumentClient {
  constructor(items, { pageSize = Infinity, beforeNextUpdate } = {}) {
    this.items = new Map(items.map((item) => [item.id, copy(item)]));
    this.pageSize = pageSize;
    this.beforeNextUpdate = beforeNextUpdate;
    this.scans = [];
    this.updates = [];
    this.updateSnapshots = [];
  }

  async send(command) {
    const input = command.input;
    assert.equal(input.TableName, TABLE);
    if (command instanceof ScanCommand) {
      this.scans.push(copy(input));
      assert.equal(input.ConsistentRead, true, 'the inventory read must be strongly consistent');
      const start = input.ExclusiveStartKey
        ? [...this.items.keys()].indexOf(input.ExclusiveStartKey.id) + 1
        : 0;
      const limit = Math.min(this.pageSize, input.Limit ?? Infinity);
      const page = [...this.items.values()].slice(start, start + limit);
      const hasMore = start + page.length < this.items.size;
      return {
        Items: copy(page),
        ...(hasMore ? { LastEvaluatedKey: { id: page.at(-1).id } } : {}),
      };
    }
    if (command instanceof GetCommand) {
      assert.equal(input.ConsistentRead, true, 'the apply re-read must be strongly consistent');
      return { Item: copy(this.items.get(input.Key.id)) };
    }
    if (command instanceof UpdateCommand) {
      this.updates.push(copy(input));
      const race = this.beforeNextUpdate;
      this.beforeNextUpdate = undefined;
      if (race) await race(this.items);

      const current = this.items.get(input.Key.id);
      this.updateSnapshots.push(copy(current));
      if (!current || !dynamoConditionMatches(input, current)) {
        const error = new Error('Conditional update failed against the current catalog item');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }

      const changed = submittedLocator(input);
      const next = { ...current, ...changed };
      this.items.set(current.id, next);
      return { Attributes: copy(next) };
    }
    throw new Error(`Unexpected DynamoDB command: ${command.constructor.name}`);
  }
}

const entries = (plan, name) => {
  assert.ok(Array.isArray(plan?.[name]), `plan.${name} must be an array`);
  return plan[name];
};
const byId = (list, id) => list.find((entry) => entry.id === id);

test('backfills active and inactive known groups without changing public URLs or reservations, then reports an idempotent no-op', async () => {
  const activeSourceUrl = sourceUrl('verified-source-241');
  const inactiveSourceUrl = sourceUrl('verified-source-242');
  const legacySourceUrl = sourceUrl('verified-source-243');
  const reclassifiedSourceUrl = sourceUrl('verified-source-244');
  const publicUrl = sourceUrl('edited-public-meetup-slug');
  const active = community({
    id: 'meetup-241', url: publicUrl, title: 'Edited public title', version: 3,
    meetupSourceUrl: activeSourceUrl, editorNote: 'keep this editor field',
  });
  const excludedAndRevoked = community({
    id: 'meetup-242', url: inactiveSourceUrl, country: 'BR',
    published: false, approvalRevoked: true, version: 0, internalFlag: 'keep',
  });
  const legacyWithoutVersion = community({ id: 'meetup-243', url: legacySourceUrl, version: undefined });
  delete legacyWithoutVersion.version;
  const reclassified = community({
    id: 'meetup-244', url: reclassifiedSourceUrl, kind: 'content', format: 'Artículo',
    country: 'CO', version: 4,
  });
  const event = { id: 'meetup-event-9001', recordType: 'event', sourceGroupId: 'meetup-241', version: 7 };
  const reservation = {
    id: currentUrlReservationId(publicUrl), recordType: 'urlReservation', url: publicUrl,
    status: 'reserved', version: 1, resourceId: active.id,
  };
  const unrelated = community({ id: 'learn-aws', kind: 'content' });
  const db = new CatalogDocumentClient([
    active, excludedAndRevoked, legacyWithoutVersion, reclassified, event, reservation, unrelated,
  ], { pageSize: 2 });
  const reviewed = { groups: [
    { id: '241', url: activeSourceUrl },
    { id: '242', url: inactiveSourceUrl },
    { id: '243', url: legacySourceUrl },
    { id: '244', url: reclassifiedSourceUrl },
  ] };

  const plan = await planMeetupSourceLocators({ tableName: TABLE, docClient: db, reviewed });
  assert.equal(entries(plan, 'updates').length, 3);
  assert.equal(entries(plan, 'unchanged').length, 1);
  assert.equal(entries(plan, 'blocked').length, 0);
  assert.ok(byId(plan.unchanged, active.id),
    'an enrolled locator survives a later public Meetup slug edit without being changed');
  assert.equal(db.updates.length, 0, 'planning records proposals without mutating the catalog');
  assert.ok(db.scans.length >= 3, 'planning must scan every inventory page');
  assert.equal(byId(plan.updates, active.id), undefined);
  assert.equal(byId(plan.updates, excludedAndRevoked.id)?.meetupSourceUrl, inactiveSourceUrl);
  assert.equal(byId(plan.updates, excludedAndRevoked.id)?.observedVersion, 0);
  assert.equal(byId(plan.updates, legacyWithoutVersion.id)?.observedVersion, null,
    'an absent legacy version is represented separately from explicit zero');

  const applied = await applyMeetupSourceLocators({ tableName: TABLE, docClient: db, plan });
  assert.equal(entries(applied, 'updated').length, 3);
  assert.equal(entries(applied, 'unchanged').length, 1);
  assert.equal(db.updates.length, 3);
  const initialVersions = new Map([
    [excludedAndRevoked.id, 0], [legacyWithoutVersion.id, null], [reclassified.id, 4],
  ]);
  for (const [index, input] of db.updates.entries()) {
    const id = input.Key.id;
    const observedItem = db.updateSnapshots[index];
    const submitted = assertSubmittedCas(input, {
      id,
      version: initialVersions.get(id),
      locator: undefined,
      observedItem,
    });
    if (initialVersions.get(id) === null) assert.ok(submitted.version >= 1);
    else assert.ok(submitted.version > initialVersions.get(id));
  }

  const savedActive = db.items.get(active.id);
  const savedInactive = db.items.get(excludedAndRevoked.id);
  assert.equal(savedActive.meetupSourceUrl, activeSourceUrl,
    'the reviewed source slug is independent of the editable public Meetup slug');
  assert.equal(savedActive.url, publicUrl);
  assert.equal(savedActive.title, active.title);
  assert.equal(savedActive.editorNote, active.editorNote);
  assert.equal(savedInactive.meetupSourceUrl, inactiveSourceUrl,
    'known excluded, unpublished or revoked rows can be made ready for future eligibility');
  assert.equal(savedInactive.url, excludedAndRevoked.url);
  assert.equal(savedInactive.country, 'BR');
  assert.equal(savedInactive.published, false);
  assert.equal(savedInactive.approvalRevoked, true);
  assert.equal(savedInactive.internalFlag, 'keep');
  assert.equal(db.items.get(legacyWithoutVersion.id).meetupSourceUrl, legacySourceUrl);
  assert.ok(db.items.get(legacyWithoutVersion.id).version >= 1);
  assert.equal(savedActive.version, active.version, 'the already enrolled row does not advance its revision');
  assert.ok(savedInactive.version > excludedAndRevoked.version);
  assert.deepEqual(db.items.get(reservation.id), reservation, 'the public URL reservation remains unchanged');
  assert.deepEqual(db.items.get(reclassified.id), {
    ...reclassified, meetupSourceUrl: reclassifiedSourceUrl, version: 5,
  }, 'a verified known group retains its current classification and can qualify again later');
  assert.deepEqual(db.items.get(event.id), event, 'event records sharing the Meetup prefix are not changed');
  assert.deepEqual(db.items.get(unrelated.id), unrelated);

  const versions = [
    savedActive.version, savedInactive.version, db.items.get(legacyWithoutVersion.id).version,
    db.items.get(reclassified.id).version,
  ];
  const repeatedPlan = await planMeetupSourceLocators({ tableName: TABLE, docClient: db, reviewed });
  assert.equal(entries(repeatedPlan, 'updates').length, 0);
  assert.equal(entries(repeatedPlan, 'unchanged').length, 4,
    'an already verified locator is explicitly reported as unchanged');
  const writes = db.updates.length;
  const repeated = await applyMeetupSourceLocators({ tableName: TABLE, docClient: db, plan: repeatedPlan });
  assert.equal(entries(repeated, 'updated').length, 0);
  assert.equal(entries(repeated, 'unchanged').length, 4);
  assert.equal(db.updates.length, writes);
  assert.deepEqual([
    db.items.get(active.id).version,
    db.items.get(excludedAndRevoked.id).version,
    db.items.get(legacyWithoutVersion.id).version,
    db.items.get(reclassified.id).version,
  ], versions);
});

test('blocks a direct legacy URL that conflicts with the reviewed seed instead of guessing', async () => {
  const ambiguous = community({ id: 'meetup-351', url: sourceUrl('legacy-direct-slug-351'), version: 4 });
  const independent = community({ id: 'meetup-352', url: 'https://group.example.org/aws-352/', version: 2 });
  const db = new CatalogDocumentClient([ambiguous, independent]);
  const reviewed = { groups: [
    reviewedGroup('351', 'different-reviewed-seed-slug-351'),
    { ...reviewedGroup('352', 'verified-seed-slug-352'), publicUrl: independent.url },
  ] };

  const plan = await planMeetupSourceLocators({ tableName: TABLE, docClient: db, reviewed });
  assert.ok(byId(plan.blocked, ambiguous.id));
  assert.equal(byId(plan.updates, ambiguous.id), undefined);
  assert.equal(byId(plan.updates, independent.id)?.meetupSourceUrl, reviewed.groups[1].url);

  let error;
  try { await applyMeetupSourceLocators({ tableName: TABLE, docClient: db, plan }); } catch (caught) { error = caught; }
  assert.ok(error, 'a plan with unresolved source evidence cannot be applied');
  assert.match(error.message, /block|review|ambig/iu);
  assert.equal(db.updates.length, 0, 'one ambiguous source prevents partial application');
  assert.equal(db.items.get(ambiguous.id).meetupSourceUrl, undefined);
  assert.equal(db.items.get(independent.id).meetupSourceUrl, undefined);
});

test('a legacy public URL mismatch requires an exact reviewed publicUrl association', async () => {
  const publicUrl = sourceUrl('legacy-direct-slug-365');
  const locator = sourceUrl('reviewed-source-slug-365');
  const candidate = community({ id: 'meetup-365', url: publicUrl, version: 2 });
  const db = new CatalogDocumentClient([candidate]);

  const missingAssociation = await planMeetupSourceLocators({
    tableName: TABLE,
    docClient: db,
    reviewed: { groups: [{ id: '365', url: locator }] },
  });
  assert.ok(byId(missingAssociation.blocked, candidate.id));
  assert.equal(entries(missingAssociation, 'updates').length, 0);
  assert.equal(db.updates.length, 0);

  const wrongAssociation = await planMeetupSourceLocators({
    tableName: TABLE,
    docClient: db,
    reviewed: { groups: [{ id: '365', url: locator, publicUrl: sourceUrl('not-the-observed-url') }] },
  });
  assert.ok(byId(wrongAssociation.blocked, candidate.id), 'the reviewed public URL must match the current item exactly');
  assert.equal(entries(wrongAssociation, 'updates').length, 0);
  assert.equal(db.updates.length, 0);

  const verifiedAssociation = { groups: [{ id: '365', url: locator, publicUrl }] };
  const plan = await planMeetupSourceLocators({ tableName: TABLE, docClient: db, reviewed: verifiedAssociation });
  assert.equal(entries(plan, 'blocked').length, 0);
  assert.equal(byId(plan.updates, candidate.id)?.meetupSourceUrl, locator);
  assert.equal(db.updates.length, 0, 'the reviewed plan remains read-only');
  const result = await applyMeetupSourceLocators({ tableName: TABLE, docClient: db, plan });
  assert.equal(entries(result, 'updated').length, 1);
  assert.equal(db.items.get(candidate.id).meetupSourceUrl, locator);
  assert.equal(db.items.get(candidate.id).url, publicUrl, 'association proof does not replace the public destination');
});

test('missing reviewed proof blocks mutation, while duplicate reviewed identities fail before scanning', async () => {
  const candidate = community({ id: 'meetup-361', url: sourceUrl('legacy-361'), version: 1 });
  const db = new CatalogDocumentClient([candidate]);
  const plan = await planMeetupSourceLocators({ tableName: TABLE, docClient: db, reviewed: { groups: [] } });
  assert.ok(byId(plan.blocked, candidate.id), 'a direct Meetup URL alone is not reviewed identity proof');
  let error;
  try { await applyMeetupSourceLocators({ tableName: TABLE, docClient: db, plan }); } catch (caught) { error = caught; }
  assert.ok(error);
  assert.equal(db.updates.length, 0);
  assert.equal(db.items.get(candidate.id).meetupSourceUrl, undefined);

  const duplicateProof = new CatalogDocumentClient([candidate]);
  await assert.rejects(planMeetupSourceLocators({
    tableName: TABLE,
    docClient: duplicateProof,
    reviewed: { groups: [reviewedGroup('361', 'first-361'), reviewedGroup('361', 'second-361')] },
  }), /duplicate|ambig|review/iu);
  assert.equal(duplicateProof.scans.length, 0, 'invalid reviewed proof is rejected before AWS reads');
  assert.equal(duplicateProof.updates.length, 0);

  const duplicateLocator = new CatalogDocumentClient([
    community({ id: 'meetup-362', url: sourceUrl('duplicate-locator-362') }),
    community({ id: 'meetup-363', url: sourceUrl('duplicate-locator-363') }),
  ]);
  await assert.rejects(planMeetupSourceLocators({
    tableName: TABLE,
    docClient: duplicateLocator,
    reviewed: {
      groups: [
        reviewedGroup('362', 'same-reviewed-group-locator'),
        reviewedGroup('363', 'same-reviewed-group-locator'),
      ],
    },
  }), /duplicate|ambig|review/iu);
  assert.equal(duplicateLocator.scans.length, 0, 'one source URL cannot ambiguously identify two reviewed group IDs');
  assert.equal(duplicateLocator.updates.length, 0);
});

test('an existing locator needs explicit current-locator and revision proof before an intentional rename', async () => {
  const oldLocator = sourceUrl('previously-verified-source-371');
  const newLocator = sourceUrl('reviewed-upstream-rename-371');
  const publicUrl = 'https://community.example.com/aws-371/';
  const existing = community({ id: 'meetup-371', url: publicUrl, meetupSourceUrl: oldLocator, version: 5 });
  const db = new CatalogDocumentClient([existing]);

  const seedOnly = { groups: [reviewedGroup('371', 'historic-seed-371')] };
  const ordinary = await planMeetupSourceLocators({ tableName: TABLE, docClient: db, reviewed: seedOnly });
  assert.ok(byId(ordinary.blocked, existing.id));
  assert.equal(entries(ordinary, 'updates').length, 0);
  assert.equal(db.items.get(existing.id).meetupSourceUrl, oldLocator);
  assert.equal(db.items.get(existing.id).version, 5);
  let blocked;
  try { await applyMeetupSourceLocators({ tableName: TABLE, docClient: db, plan: ordinary }); } catch (error) { blocked = error; }
  assert.ok(blocked);
  assert.equal(db.updates.length, 0);

  const reviewedRename = {
    groups: [reviewedGroup('371', 'reviewed-upstream-rename-371')],
    renames: [{ id: '371', fromUrl: oldLocator, fromVersion: 5, url: newLocator }],
  };
  const renamePlan = await planMeetupSourceLocators({ tableName: TABLE, docClient: db, reviewed: reviewedRename });
  assert.equal(entries(renamePlan, 'blocked').length, 0);
  assert.equal(byId(renamePlan.updates, existing.id)?.meetupSourceUrl, newLocator);
  assert.equal(byId(renamePlan.updates, existing.id)?.observedVersion, 5);
  const result = await applyMeetupSourceLocators({ tableName: TABLE, docClient: db, plan: renamePlan });
  assert.equal(entries(result, 'updated').length, 1);
  const submitted = assertSubmittedCas(db.updates.at(-1), {
    id: existing.id, version: 5, locator: oldLocator, observedItem: existing,
  });
  assert.equal(submitted.meetupSourceUrl, newLocator);
  assert.equal(submitted.version, 6);
  assert.equal(db.items.get(existing.id).url, publicUrl);
  assert.equal(db.items.get(existing.id).meetupSourceUrl, newLocator);

  const staleRename = await planMeetupSourceLocators({
    tableName: TABLE,
    docClient: db,
    reviewed: {
      groups: [reviewedGroup('371', 'another-rename-371')],
      renames: [{ id: '371', fromUrl: oldLocator, fromVersion: 5, url: sourceUrl('another-rename-371') }],
    },
  });
  assert.ok(byId(staleRename.blocked, existing.id));
  let staleRenameError;
  try { await applyMeetupSourceLocators({ tableName: TABLE, docClient: db, plan: staleRename }); } catch (error) { staleRenameError = error; }
  assert.ok(staleRenameError);
  assert.equal(db.updates.length, 1);
  assert.equal(db.items.get(existing.id).meetupSourceUrl, newLocator, 'stale rename evidence makes no durable change');
});

test('a stale plan cannot overwrite a concurrent full-item edit; a new plan safely completes it', async () => {
  const before = community({
    id: 'meetup-381', url: 'https://community.example.org/original/', version: 8,
    title: 'Before edit', editorNote: 'old note',
  });
  const db = new CatalogDocumentClient([before], {
    beforeNextUpdate: async (items) => {
      const current = items.get(before.id);
      items.set(before.id, {
        ...current,
        title: 'Concurrent title edit',
        url: 'https://community.example.org/concurrent-public-edit/',
        editorNote: 'concurrent note',
        version: 9,
      });
    },
  });
  const locator = sourceUrl('verified-source-381');
  const reviewedForPublicUrl = (publicUrl) => ({ groups: [{ id: '381', url: locator, publicUrl }] });
  const reviewed = reviewedForPublicUrl(before.url);
  const stalePlan = await planMeetupSourceLocators({ tableName: TABLE, docClient: db, reviewed });
  assert.equal(db.updates.length, 0, 'stale test plan creation does not mutate the item');
  assert.equal(byId(stalePlan.updates, before.id)?.observedVersion, 8);

  let staleResult;
  let staleError;
  try { staleResult = await applyMeetupSourceLocators({ tableName: TABLE, docClient: db, plan: stalePlan }); }
  catch (error) { staleError = error; }
  const concurrent = db.items.get(before.id);
  assert.equal(concurrent.meetupSourceUrl, undefined);
  assert.equal(concurrent.title, 'Concurrent title edit');
  assert.equal(concurrent.url, 'https://community.example.org/concurrent-public-edit/');
  assert.equal(concurrent.editorNote, 'concurrent note');
  assert.equal(concurrent.version, 9);
  assert.equal(db.updates.length, 1);
  assertSubmittedCas(db.updates[0], { id: before.id, version: 8, locator: undefined, observedItem: before });
  assert.equal(dynamoConditionMatches(db.updates[0], db.updateSnapshots[0]), false,
    'the same submitted conditions reject the concurrently advanced row at the provider boundary');
  if (staleError) assert.match(staleError.message, /stale|conditional|conflict/iu);
  else assert.ok(byId(staleResult?.stale, before.id), 'stale application reports the exact resource ID');

  const freshPlan = await planMeetupSourceLocators({
    tableName: TABLE, docClient: db, reviewed: reviewedForPublicUrl(concurrent.url),
  });
  assert.equal(db.updates.length, 1, 'the fresh plan also remains read-only until applied');
  assert.equal(byId(freshPlan.updates, before.id)?.observedVersion, 9);
  const freshResult = await applyMeetupSourceLocators({ tableName: TABLE, docClient: db, plan: freshPlan });
  assert.equal(entries(freshResult, 'updated').length, 1);
  const finished = db.items.get(before.id);
  assert.equal(finished.meetupSourceUrl, locator);
  assert.equal(finished.url, concurrent.url);
  assert.equal(finished.title, concurrent.title);
  assert.equal(finished.editorNote, concurrent.editorNote);
  assert.equal(finished.version, 10);
});

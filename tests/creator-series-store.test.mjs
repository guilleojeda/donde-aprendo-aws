import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDynamoMoveHarness, seedMoveProfile } from './fixtures/creator-link-move.mjs';
import { creatorRequest, readCreatorSnapshot } from './fixtures/creator-content.mjs';

test('Series metadata and its scoped alias are written together and deleting Series preserves its slug reservation', async () => {
  const harness = await createDynamoMoveHarness();
  const profileId = 'series-physical-a';
  const profileKey = { pk: `PROFILE#${profileId}`, sk: 'META' };
  const aliasKey = { pk: profileKey.pk, sk: 'SERIES_SLUG#curso-aws' };
  const table = 'profiles-test';
  seedMoveProfile(harness.mock, { profileId, slug: 'series-physical-a' });

  const created = await creatorRequest(harness, '/api/creador/series/', {
    method: 'POST',
    body: { creatorVersion: 1, name: 'Curso AWS', slug: 'curso-aws' },
  });
  assert.equal(created.status, 201, await created.clone().text());
  const { seriesId, creatorVersion } = await created.json();
  const alias = { recordType: 'seriesAlias', seriesId, profileId, slug: 'curso-aws', version: 1 };
  assert.deepEqual(harness.mock.read(table, aliasKey), { ...aliasKey, ...alias });
  assert.equal(harness.mock.read(table, profileKey).series[seriesId].name, 'Curso AWS');
  const writes = harness.mock.transactions.at(-1).input.TransactItems.map(({ Put }) => ({
    table: Put.TableName, key: { pk: Put.Item.pk, sk: Put.Item.sk }, conditional: Boolean(Put.ConditionExpression),
  }));
  assert.equal(writes.length, 2);
  assert.ok(writes.every((write) => write.table === table && write.conditional));
  assert.deepEqual(writes.map(({ key }) => key).sort((a, b) => a.sk.localeCompare(b.sk)), [profileKey, aliasKey]);
  assert.ok(harness.mock.calls.some(({ name, input }) => name === 'GetCommand' && input.TableName === table
    && input.ConsistentRead === true && input.Key.pk === aliasKey.pk && input.Key.sk === aliasKey.sk));
  assert.equal(harness.mock.read(table, { pk: profileKey.pk, sk: `SERIES#${seriesId}` }), undefined);

  const updated = await creatorRequest(harness, `/api/creador/series/${seriesId}/`, {
    method: 'PATCH', body: { creatorVersion, name: 'Curso de AWS actualizado' },
  });
  const updatedBody = await updated.json();
  assert.equal(updated.status, 200);
  const stale = await creatorRequest(harness, `/api/creador/series/${seriesId}/`, {
    method: 'PATCH', body: { creatorVersion, name: 'Obsoleto' },
  });
  assert.equal(stale.status, 409);
  assert.equal((await readCreatorSnapshot(harness)).series[seriesId].name, 'Curso de AWS actualizado');

  const removed = await creatorRequest(harness, `/api/creador/series/${seriesId}/`, {
    method: 'DELETE', body: { creatorVersion: updatedBody.creatorVersion },
  });
  const finalBody = await removed.json();
  assert.equal(removed.status, 200);
  assert.equal(harness.mock.read(table, profileKey).series[seriesId], undefined);
  assert.deepEqual(harness.mock.read(table, aliasKey), { ...aliasKey, ...alias });
  const reusedSlug = await creatorRequest(harness, '/api/creador/series/', {
    method: 'POST', body: { creatorVersion: finalBody.creatorVersion, name: 'Segundo curso', slug: 'curso-aws' },
  });
  assert.equal(reusedSlug.status, 409);
  assert.deepEqual((await readCreatorSnapshot(harness)).series, {});
  assert.deepEqual(harness.mock.read(table, aliasKey), { ...aliasKey, ...alias });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { callApi, responseJson, sessionCsrf } from './fixtures/creator-pages.mjs';
import {
  createDynamoMoveHarness, seedMoveProfile, seedMoveResource, seedMovePlacement,
  seedMoveSeries, storedAttributeBytes,
} from './fixtures/creator-link-move.mjs';
import { padPlacementMembershipsToBytes } from './fixtures/creator-order-physical.mjs';

const OWNER = 'profile-move-a';
const SERIES = 'classification-series';
const key = (id) => ({ pk: `PROFILE#${OWNER}`, sk: `PLACEMENT#${id}` });

for (const kind of ['link', 'chapter']) {
  test(`${kind}: an unrelated exhausted placement does not turn a physical limit into a version conflict`, async () => {
    for (const frozen of [false, true]) {
      const h = await createDynamoMoveHarness({ projectionAware: true });
      seedMoveProfile(h.mock);
      if (kind === 'chapter') seedMoveSeries(h.mock, { id: SERIES });
      for (const [id, position] of [['a', 0], ['z', 0], ['x', 100]]) {
        seedMoveResource(h.mock, { id: `resource-${id}`, url: `https://example.com/classification/${id}` });
        seedMovePlacement(h.mock, {
          id, resourceId: `resource-${id}`, position,
          version: id === 'x' && frozen ? Number.MAX_SAFE_INTEGER : 100,
          series: kind === 'chapter' ? { [SERIES]: { position } } : {},
        });
      }
      // z cannot precede a at rank0. Moving a requires version100 ->101,
      // whose extra numeric byte overflows this otherwise valid item.
      // x already follows both rows at100 and is never required to change.
      const a = padPlacementMembershipsToBytes(structuredClone(h.mock.read('profiles-test', key('a'))), 400 * 1024);
      assert.equal(storedAttributeBytes(a), 400 * 1024);
      h.mock.seed('profiles-test', a);
      const before = structuredClone(['a', 'z', 'x'].map((id) => h.mock.read('profiles-test', key(id))));
      const profileBefore = structuredClone(h.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: 'META' }));
      const path = kind === 'link' ? '/api/creador/enlaces/z/mover'
        : `/api/creador/series/${SERIES}/capitulos/z/mover`;
      const response = await callApi(h, path, {
        session: 'creator-a', csrf: sessionCsrf['creator-a'], method: 'POST',
        body: { profileVersion: 1, placementVersion: 100, targetPosition: 1,
          ...(kind === 'chapter' ? { seriesVersion: 1 } : {}) },
      });
      const body = await responseJson(response);
      assert.equal(response.status, 422, JSON.stringify({ frozen, body }));
      assert.equal(body.error, 'ORDER_MOVE_LIMIT');
      assert.equal(Object.hasOwn(body, 'viablePosition'), false);
      assert.equal(h.mock.transactions.length, 0);
      assert.deepEqual(['a', 'z', 'x'].map((id) => h.mock.read('profiles-test', key(id))), before);
      assert.deepEqual(h.mock.read('profiles-test', { pk: `PROFILE#${OWNER}`, sk: 'META' }), profileBefore);
    }
  });
}

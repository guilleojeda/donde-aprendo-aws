import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  currentUrlCollision,
  currentUrlHash,
  currentUrlKey,
  currentUrlReservation,
  currentUrlReservationId,
} from '../src/lib/catalog-url.mjs';

test('URL identity hashes the exact UTF-8 literal, including query order and trailing slash', () => {
  const url = 'https://example.test/curso/?b=2&a=1';
  const expected = createHash('sha256').update(Buffer.from(url, 'utf8')).digest('hex');
  assert.equal(currentUrlHash(url), expected);
  assert.equal(currentUrlKey(url), `url:${expected}`);
  assert.equal(currentUrlReservationId(url), `__url#${expected}`);
  assert.notEqual(currentUrlKey(url), currentUrlKey('https://example.test/curso?a=1&b=2'));
});

test('reservation and collision records use the shared physical key and version', () => {
  const url = 'https://example.test/resource?lang=es';
  assert.deepEqual(currentUrlReservation(url, 'legacy-id'), {
    id: currentUrlReservationId(url), recordType: 'urlReservation', url,
    status: 'reserved', resourceId: 'legacy-id', version: 1,
  });
  assert.deepEqual(currentUrlCollision(url, ['z-resource', 'a-resource']), {
    id: currentUrlReservationId(url), recordType: 'urlReservation', url,
    status: 'collision', resourceIds: ['a-resource', 'z-resource'], version: 1,
  });
  assert.throws(() => currentUrlCollision(url, ['only-one']), /at least two/);
});

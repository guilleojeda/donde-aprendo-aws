import assert from 'node:assert/strict';
import { storedAttributeBytes } from './creator-link-move.mjs';

// Keep every added membership valid, rather than relying on malformed legacy
// strings to create an item-size boundary. Existing memberships remain intact.
export function padPlacementMembershipsToBytes(row, targetBytes) {
  row.series ??= {};
  const delta = (key) => storedAttributeBytes({ ...row, series: { ...row.series, [key]: { position: 0 } } })
    - storedAttributeBytes(row);
  const minimum = delta('f');
  const full = delta('x'.repeat(128));
  let size = storedAttributeBytes(row);
  assert.ok(size <= targetBytes);
  const added = [];
  while (targetBytes - size > full) {
    const key = `pad-${added.length}`.padEnd(128, 'x');
    assert.equal(Object.hasOwn(row.series, key), false);
    row.series[key] = { position: 0 };
    added.push(key);
    size += full;
  }
  let remaining = targetBytes - size;
  if (remaining > 0 && remaining < minimum) {
    const last = added.pop();
    assert.ok(last, 'the boundary has enough space for a valid membership');
    delete row.series[last];
    const shorter = last.slice(0, -minimum);
    row.series[shorter] = { position: 0 };
    size -= minimum;
    remaining = targetBytes - size;
  }
  if (remaining) {
    const key = 'f'.repeat(remaining - (minimum - 1));
    assert.ok(key.length >= 1 && key.length <= 128);
    assert.equal(Object.hasOwn(row.series, key), false);
    row.series[key] = { position: 0 };
  }
  assert.equal(storedAttributeBytes(row), targetBytes);
  for (const [key, membership] of Object.entries(row.series)) {
    assert.match(key, /^[A-Za-z0-9_-]{1,128}$/u);
    assert.ok(Number.isSafeInteger(membership.position) && membership.position >= 0);
  }
  return row;
}

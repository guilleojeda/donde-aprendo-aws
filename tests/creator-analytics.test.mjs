import assert from 'node:assert/strict';
import test from 'node:test';

const moduleResult = await import('../src/lib/creator-analytics.mjs').then(
  (value) => ({ value }), (error) => ({ error }),
);
function api() {
  assert.equal(moduleResult.error, undefined, `Falta implementar la captura de perfiles: ${moduleResult.error?.message}`);
  return moduleResult.value;
}
function context(overrides = {}) {
  const events = [];
  return { events, location: { hostname: 'dondeaprendoaws.com' }, view: 'public', gtag: (...args) => events.push(args), ...overrides };
}
const creator = { id: 'creator-stable-a', slug: 'ana', email: 'private@example.invalid', accountId: 'private-account', bio: 'private-text' };
const link = { id: 'placement-stable-a', resourceId: 'resource-a', url: 'https://example.test/private-query?token=secret', title: 'Private title' };

test('public creator view emits the stable public ID with an explicit parameter allowlist', () => {
  const ctx = context();
  api().trackCreatorView(ctx, creator);
  assert.deepEqual(ctx.events, [['event', 'creator_view', { creator_id: creator.id }]]);
});

test('content clicks emit placement ID without text, destination URL or account data', () => {
  const ctx = context();
  api().trackCreatorLinkClick(ctx, creator, link);
  assert.deepEqual(ctx.events, [['event', 'creator_link_click', { creator_id: creator.id, link_id: link.id }]]);
});

test('social and personal website links use stable IDs distinct from content placements', () => {
  const ctx = context();
  for (const id of ['social:instagram', 'social:x', 'social:linkedin', 'social:aws-builder', 'social:website']) {
    api().trackCreatorLinkClick(ctx, creator, { ...link, id });
  }
  assert.equal(ctx.events.length, 5);
  assert.deepEqual(ctx.events.map((event) => event[2].link_id), ['social:instagram', 'social:x', 'social:linkedin', 'social:aws-builder', 'social:website']);
  assert.ok(ctx.events.every((event) => Object.keys(event[2]).sort().join(',') === 'creator_id,link_id'));
});

test('changing a creator slug preserves analytical identity', () => {
  const ctx = context();
  api().trackCreatorView(ctx, creator);
  api().trackCreatorView(ctx, { ...creator, slug: 'otro-nombre' });
  assert.deepEqual(ctx.events[0], ctx.events[1]);
});

test('editor, preview and nonproduction hosts emit no public creator events', () => {
  for (const overrides of [{ view: 'editor' }, { view: 'preview' }, { location: { hostname: 'localhost' } }, { location: { hostname: 'main.example.amplifyapp.com' } }]) {
    const ctx = context(overrides);
    api().trackCreatorView(ctx, creator);
    api().trackCreatorLinkClick(ctx, creator, link);
    assert.deepEqual(ctx.events, []);
  }
});

test('missing or failed analytics cannot break the public profile or link activation', () => {
  for (const gtag of [undefined, () => { throw new Error('blocked transport'); }]) {
    const ctx = context({ gtag });
    assert.doesNotThrow(() => api().trackCreatorView(ctx, creator));
    assert.doesNotThrow(() => api().trackCreatorLinkClick(ctx, creator, link));
  }
});

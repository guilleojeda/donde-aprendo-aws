import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCreatorOwnerLinkMoveRouteHarness } from './fixtures/creator-owner-link-move-route.mjs';

test('el campo de posición del capítulo referencia el párrafo que recibe su contexto accesible', async () => {
  const app = await createCreatorOwnerLinkMoveRouteHarness();
  try {
    await app.resetRuntime();
    await app.createProfile();
    const series = await app.createSeries();
    const link = await app.addLink();
    await app.assignChapter(series.id, link.placementId);
    const { response, html } = await app.render({ search: '?vista=series' });
    assert.equal(response.status, 200);
    const input = html.match(/<input\b(?=[^>]*\bid="owner-chapter-target-position")[^>]*>/i)?.[0];
    const context = html.match(/<p\b(?=[^>]*\bdata-chapter-move-context(?:\s|=|>))[^>]*>/i)?.[0];
    assert.ok(input);
    assert.ok(context);
    const describedBy = input.match(/\baria-describedby="([^"]+)"/)?.[1].split(/\s+/);
    const contextId = context.match(/\bid="([^"]+)"/)?.[1];
    assert.ok(contextId, 'the actual context paragraph must be addressable');
    assert.ok(describedBy?.includes(contextId), 'the focused input must describe itself with the actual context paragraph');
    assert.match(context, /\baria-live="polite"/, 'context updates retain their existing live region');
  } finally {
    await app.close();
  }
});

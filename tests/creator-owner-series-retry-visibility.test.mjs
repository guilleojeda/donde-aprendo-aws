import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createCreatorOwnerLinkMoveRouteHarness } from './fixtures/creator-owner-link-move-route.mjs';

const app = await createCreatorOwnerLinkMoveRouteHarness();
after(() => app.close());

function sectionRange(html, dataAttribute) {
  const escaped = dataAttribute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const opening = new RegExp(`<section\\b(?=[^>]*\\b${escaped}(?:\\s|=|>))[^>]*>`, 'i').exec(html);
  assert.ok(opening, `SSR renders section ${dataAttribute}`);
  const tags = /<\/?section\b[^>]*>/gi;
  tags.lastIndex = opening.index;
  let depth = 0;
  for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
    if (tag[0].startsWith('</')) depth -= 1;
    else depth += 1;
    if (depth === 0) return { start: opening.index, end: tags.lastIndex };
  }
  assert.fail(`SSR closes section ${dataAttribute}`);
}

test('el retry SSR queda fuera de los paneles alternables de lista y capítulos', async () => {
  await app.resetRuntime();
  await app.createProfile();
  const series = await app.createSeries({ name: 'Ruta recuperable', slug: 'ruta-recuperable' });

  for (const search of ['?vista=series', `?vista=series&serie=${encodeURIComponent(series.id)}`]) {
    const rendered = await app.render({ search });
    assert.equal(rendered.response.status, 200);
    const retries = [...rendered.html.matchAll(/<button\b([^>]*)data-series-reconcile-retry([^>]*)>([\s\S]*?)<\/button>/gi)];
    assert.equal(retries.length, 1, 'both series views reuse one retry control');
    assert.match(retries[0][3], /Volver a consultar la lista/);

    const retryIndex = retries[0].index;
    const chapterView = sectionRange(rendered.html, 'data-owner-series-chapters');
    const listView = sectionRange(rendered.html, 'data-owner-series-list-view');
    assert.ok(retryIndex >= Math.max(chapterView.end, listView.end),
      'the retry is outside both sections, so either hidden panel cannot hide it');
  }
});

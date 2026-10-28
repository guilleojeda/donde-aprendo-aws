import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createCreatorOwnerLinkMoveRouteHarness } from './fixtures/creator-owner-link-move-route.mjs';

const app = await createCreatorOwnerLinkMoveRouteHarness();
after(() => app.close());

function attribute(attrs, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return attrs.match(new RegExp(`(?:^|\\s)${escaped}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
    ?.slice(1).find((value) => value !== undefined);
}

function visibleText(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/gi, "'")
    .replace(/\s+/g, ' ').trim();
}

function rowsIn(html) {
  const table = html.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i);
  assert.ok(table, 'the owner table renders in SSR');
  return [...table[1].matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)].map(([, attrs, body]) => ({
    id: attribute(attrs, 'data-link-row'), attrs, body,
  })).filter((row) => row.id !== undefined);
}

function moveForm(html) {
  const matches = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)]
    .filter(([, attrs]) => /\bdata-owner-form="mover-enlace"/i.test(attrs));
  assert.equal(matches.length, 1, 'all rows reuse one move form in the owner dialog');
  return { attrs: matches[0][1], body: matches[0][2] };
}

function assertMoveActions(html, expectedRows) {
  const rows = rowsIn(html);
  assert.equal(rows.length, expectedRows);
  for (const row of rows) {
    const actions = [...row.body.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)]
      .filter(([, attrs]) => /\bdata-link-move(?:\s|=|>)/i.test(attrs));
    assert.equal(actions.length, 1, `placement ${row.id} has one contextual move action`);
    const action = actions[0];
    assert.match(visibleText(action[2]), /mover/i, 'the action is named for position movement');
  }
  return rows;
}

function assertPrivate(response, html) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(html, /<meta[^>]+name="robots"[^>]+noindex/i);
  assert.doesNotMatch(html, /analytics\.js|gtag\(|google-analytics/i);
}

test('sin enlaces no hay movimiento; con 1, 50 y 58 enlaces cada fila SSR ofrece su acción contextual', async () => {
  await app.resetRuntime();
  await app.createProfile();

  const empty = await app.render();
  assertPrivate(empty.response, empty.html);
  assert.equal(rowsIn(empty.html).length, 0);
  assert.doesNotMatch(empty.html, /data-link-move(?:\s|=|>)/i);
  assert.ok([...empty.html.matchAll(/<form\b[^>]*data-owner-form="mover-enlace"/gi)].length <= 1,
    'the empty page cannot render duplicate move drafts');

  const created = [await app.addLink({ index: 0, title: 'Una guía' })];
  const one = await app.render();
  assertPrivate(one.response, one.html);
  assertMoveActions(one.html, 1);
  const oneForm = moveForm(one.html);
  assert.match(oneForm.attrs, /\bhidden(?:\s|=|>)/i, 'the one move form starts closed');
  assert.match(oneForm.body, /name="targetPosition"/i);
  assert.match(visibleText(oneForm.body), /guardar|mover/i);

  for (let index = 1; index < 50; index += 1) {
    created.push(await app.addLink({ index, title: `Guía ${String(index + 1).padStart(2, '0')}` }));
  }
  for (const index of [0, 2, 4]) await app.setFeatured(created[index], true);
  await app.hideResource(created[0].resourceId);

  const fifty = await app.render();
  assertPrivate(fifty.response, fifty.html);
  assert.equal(rowsIn(fifty.html).length, 25);
  assertMoveActions(fifty.html, 25);
  assert.match(fifty.html, /data-link-empty[^>]*hidden/i, 'the populated table is not presented as empty');
  assert.ok(rowsIn(fifty.html).some(({ id, body }) => id === created[0].placementId && /oculta/i.test(visibleText(body))),
    'a hidden placement remains available to its owner for movement');

  for (let index = 50; index < 58; index += 1) {
    created.push(await app.addLink({ index, title: `Guía ${String(index + 1).padStart(2, '0')}` }));
  }
  const fiftyEight = await app.render();
  assertPrivate(fiftyEight.response, fiftyEight.html);
  assert.equal(rowsIn(fiftyEight.html).length, 25);
  assertMoveActions(fiftyEight.html, 25);
  assert.match(visibleText(fiftyEight.html), /58\s+coincidencias? de 58 enlaces/i);
  assert.equal(moveForm(fiftyEight.html).body.match(/name="targetPosition"/gi)?.length, 1);
});

test('el acceso antiguo redirige a Solicitudes y conserva el orden administrado desde Tu página', async () => {
  await app.resetRuntime();
  await app.createProfile({ session: 'creator-b', slug: 'bea-mover-residual' });
  const shared = await app.addLink({ session: 'creator-b', index: 0, title: 'Guía compartida', url: 'https://move.example/shared' });
  await app.createProfile({ slug: 'ana-mover-residual' });
  const first = await app.addLink({ index: 0, title: 'Guía compartida', url: 'https://move.example/shared' });
  const second = await app.addLink({ index: 1, title: 'Capítulo dos' });
  const series = await app.createSeries();
  await app.assignChapter(series.id, first.placementId);
  await app.assignChapter(series.id, second.placementId);

  const owner = await app.render();
  assertPrivate(owner.response, owner.html);
  assertMoveActions(owner.html, 2);
  assert.doesNotMatch(owner.html, /\bdata-move=/i, 'the owner table no longer exposes up/down swap controls');
  assert.doesNotMatch(owner.html, /\bdata-link-order-form/i);

  const before = await app.api('/api/creador/perfil/', undefined, { method: 'GET' });
  assert.equal(before.links.some(({ resourceId }) => resourceId === shared.resourceId), true);
  const residual = await app.render({ pathname: '/cuenta/creador/' });
  assert.equal(residual.response.status, 302);
  assert.equal(residual.response.headers.get('location'), '/cuenta/?vista=solicitudes');
  assert.match(residual.response.headers.get('cache-control') ?? '', /private.*no-store/);
  assert.doesNotMatch(residual.html, /\bdata-creator-editor|\bdata-claim-form|\bdata-resource-id-value/i);
  assert.deepEqual(await app.api('/api/creador/perfil/', undefined, { method: 'GET' }), before,
    'the redirect does not change placements, public order or chapter memberships');
});


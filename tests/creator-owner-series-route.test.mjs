import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createCreatorOwnerLinkMoveRouteHarness } from './fixtures/creator-owner-link-move-route.mjs';

const app = await createCreatorOwnerLinkMoveRouteHarness();
after(() => app.close());

function visibleText(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/gi, "'")
    .replace(/\s+/g, ' ').trim();
}

function attribute(attrs, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return attrs.match(new RegExp(`(?:^|\\s)${escaped}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
    ?.slice(1).find((value) => value !== undefined);
}

function forms(html) {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map(([, attrs, body]) => ({ attrs, body }));
}

function formByOwnerName(html, name) {
  const matches = forms(html).filter(({ attrs }) => new RegExp(`\\bdata-owner-form="${name}"`, 'i').test(attrs));
  assert.equal(matches.length, 1, `one shared ${name} form is rendered in the owner dialog`);
  return matches[0];
}

function contains(source, pattern, message) {
  assert.ok(pattern.test(source), message);
}

function rows(html, containerHook, rowHook) {
  const container = html.match(new RegExp(`<([a-z][a-z0-9-]*)\\b(?=[^>]*\\b${containerHook}(?:\\s|=|>))[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i'));
  assert.ok(container, `SSR renders ${containerHook}`);
  return [...container[2].matchAll(/<(?:li|tr|article)\b([^>]*)>([\s\S]*?)<\/(?:li|tr|article)>/gi)]
    .filter(([, attrs]) => new RegExp(`\\b${rowHook}(?:\\s|=|>)`, 'i').test(attrs))
    .map(([, attrs, body]) => ({ id: attribute(attrs, rowHook), attrs, body, text: visibleText(body) }));
}

function assertPrivate(response, html, expectedStatus = 200) {
  assert.equal(response.status, expectedStatus);
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(html, /<meta[^>]+name="robots"[^>]+noindex/i);
  assert.doesNotMatch(html, /analytics\.js|gtag\(|google-analytics/i);
}

test('la vista de series distingue cero, una serie y capítulos visibles sin recrear la pantalla residual', async () => {
  await app.resetRuntime();
  await app.createProfile({ slug: 'ana-enlaces' });
  await app.api('/api/creador/perfil/publicar/', {}, { method: 'POST' });

  const empty = await app.render({ search: '?vista=series' });
  assertPrivate(empty.response, empty.html);
  contains(visibleText(empty.html), /Series/i, 'the owner page renders the series view');
  contains(visibleText(empty.html), /Crear serie/i, 'an empty view offers series creation');
  contains(visibleText(empty.html), /0\s+(series|capítulos)/i, 'the empty series count is visible');
  assert.equal(rows(empty.html, 'data-owner-series-list', 'data-owner-series-row').length, 0);
  const seriesForm = formByOwnerName(empty.html, 'serie').body;
  assert.equal(seriesForm.match(/name="name"/gi)?.length, 1);
  assert.equal(forms(empty.html).filter(({ attrs }) => /data-owner-form="serie"/i.test(attrs)).length, 1,
    'create and edit reuse one owner form');
  const slug = seriesForm.match(/<input\b(?=[^>]*\bname="slug")[^>]*>/i)?.[0];
  assert.ok(slug, 'the contextual form includes the series slug field');
  assert.match(slug, /\brequired(?:\s|=|>)/i);
  assert.match(slug, /\bminlength="3"/i);
  assert.match(slug, /\bmaxlength="40"/i);
  const pattern = slug.match(/\bpattern="([^"]+)"/i)?.[1];
  assert.ok(pattern, 'the slug has browser-native validation');
  let nativePattern;
  assert.doesNotThrow(() => { nativePattern = new RegExp(`^(?:${pattern})$`, 'v'); });
  for (const valid of ['ana', 'serie-2026', 'abc-1-def']) assert.equal(nativePattern.test(valid), true);
  for (const invalid of ['bad slug', 'bad--slug', '-bad-slug', 'bad-slug-']) assert.equal(nativePattern.test(invalid), false);

  const series = await app.createSeries({ name: 'Lambda desde cero', slug: 'lambda-desde-cero' });
  const emptySeries = await app.createSeries({ name: 'Ruta vacía', slug: 'ruta-vacia' });
  const link = await app.addLink({ title: 'Primer capítulo', url: 'https://series.example/primero' });
  const hiddenLink = await app.addLink({ title: 'Capítulo oculto', url: 'https://series.example/oculto' });
  await app.assignChapter(series.id, link.placementId);
  await app.assignChapter(series.id, hiddenLink.placementId);
  await app.hideResource(hiddenLink.resourceId);
  const one = await app.render({ search: '?vista=series&buscarSeries=lambda' });
  assertPrivate(one.response, one.html);
  const [row] = rows(one.html, 'data-owner-series-list', 'data-owner-series-row');
  assert.equal(rows(one.html, 'data-owner-series-list', 'data-owner-series-row').length, 1);
  assert.equal(row.id, series.id);
  contains(row.text, /Lambda desde cero/, 'the matching series is rendered');
  contains(row.text, /1\s+capítulo visible/i, 'the row counts visible chapters and excludes hidden resources');
  contains(row.body, /data-series-edit/, 'the row has a contextual edit action');
  contains(row.body, /data-series-chapters/, 'the row has a chapter-management action');
  contains(one.html, /href="\/c\/ana-enlaces\/series\/lambda-desde-cero\//,
    'public series actions use the canonical page URL and remain separate from owner editing');
  const allSeries = await app.render({ search: '?vista=series' });
  const unlinkedEmpty = rows(allSeries.html, 'data-owner-series-list', 'data-owner-series-row')
    .find(({ id }) => id === emptySeries.id);
  assert.ok(unlinkedEmpty);
  assert.doesNotMatch(unlinkedEmpty.body, /href="\/c\/ana-enlaces\/series\//,
    'a series without visible chapters has no public link');
  assert.doesNotMatch(visibleText(one.html), /vista previa/i);
});

test('la lista de capítulos pagina todos los enlaces, incluidos los ya asignados y ocultos', async () => {
  await app.resetRuntime();
  await app.createProfile();
  const series = await app.createSeries({ name: 'Ruta de 58 capítulos', slug: 'ruta-58-capitulos' });
  const links = [];
  for (let index = 0; index < 58; index += 1) {
    links.push(await app.addLink({ index, title: `Capítulo ${String(index + 1).padStart(2, '0')}`, url: `https://series.example/58/${index}` }));
  }
  for (const link of links.slice(0, 50)) await app.assignChapter(series.id, link.placementId);
  await app.hideResource(links[6].resourceId);

  const all = await app.render({ search: `?vista=series&serie=${encodeURIComponent(series.id)}&pertenencia=todos&buscarCapitulos=Cap%C3%ADtulo&paginaCapitulos=3` });
  assertPrivate(all.response, all.html);
  contains(visibleText(all.html), /58\s+(coincidencias|enlaces)/i, 'the chapter search covers all 58 placements');
  assert.equal(rows(all.html, 'data-owner-series-chapters', 'data-chapter-row').length, 8,
    'the last page is derived from the full 58-link result, not the already assigned subset');
  assert.ok(rows(all.html, 'data-owner-series-chapters', 'data-chapter-row')
    .every(({ text }) => /disponible|agregar/i.test(text)), 'unassigned rows remain selectable after already assigned links');
  contains(all.html, /name="buscarCapitulos"/, 'chapter search is represented in the query');
  contains(all.html, /name="pertenencia"/, 'membership filter is represented in the query');
  contains(all.html, /name="paginaCapitulos"/, 'chapter page is represented in the query');
  assert.equal(forms(all.html).filter(({ attrs }) => /data-owner-form="mover-capitulo"/i.test(attrs)).length, 1);

  const hidden = await app.render({ search: `?vista=series&serie=${encodeURIComponent(series.id)}&pertenencia=incluidos&buscarCapitulos=Cap%C3%ADtulo%2007` });
  const [hiddenRow] = rows(hidden.html, 'data-owner-series-chapters', 'data-chapter-row');
  assert.equal(hiddenRow.id, links[6].placementId);
  contains(hiddenRow.text, /oculto/i, 'hidden members remain in the saved chapter order and owner search');
  contains(hiddenRow.body, /data-chapter-move/, 'a hidden member can be moved');
  contains(hiddenRow.body, /data-chapter-remove/, 'a hidden member can be removed');
  contains(formByOwnerName(hidden.html, 'mover-capitulo').body, /name="targetPosition"/, 'movement accepts an ordinal');
});

test('la lista de series busca, pagina el conjunto completo y cuenta sólo capítulos visibles', async () => {
  await app.resetRuntime();
  await app.createProfile({ slug: 'ana-series-paginadas' });
  const seriesList = [];
  for (let index = 0; index < 30; index += 1) {
    seriesList.push(await app.createSeries({
      name: `Ruta ${String(index).padStart(2, '0')}`,
      slug: `ruta-${String(index).padStart(2, '0')}`,
    }));
  }
  const visible = await app.addLink({ title: 'Capítulo visible', url: 'https://series.example/listado-visible' });
  const hidden = await app.addLink({ title: 'Capítulo oculto', url: 'https://series.example/listado-oculto' });
  await app.assignChapter(seriesList[0].id, visible.placementId);
  await app.assignChapter(seriesList[0].id, hidden.placementId);
  await app.hideResource(hidden.resourceId);

  const firstPage = await app.render({ search: '?vista=series&buscarSeries=Ruta&paginaSeries=1' });
  assertPrivate(firstPage.response, firstPage.html);
  assert.equal(rows(firstPage.html, 'data-owner-series-list', 'data-owner-series-row').length, 25);
  const firstRow = rows(firstPage.html, 'data-owner-series-list', 'data-owner-series-row')
    .find(({ id }) => id === seriesList[0].id);
  assert.ok(firstRow);
  contains(firstRow.text, /1\s+capítulo visible/i, 'hidden chapters do not inflate the visible count');
  contains(firstPage.html, /name="buscarSeries"[^>]*value="Ruta"/i, 'the search term remains in the form');
  contains(firstPage.html, /name="paginaSeries"[^>]*value="1"/i, 'the first page is represented in the form');

  const secondPage = await app.render({ search: '?vista=series&buscarSeries=Ruta&paginaSeries=2' });
  assertPrivate(secondPage.response, secondPage.html);
  assert.equal(rows(secondPage.html, 'data-owner-series-list', 'data-owner-series-row').length, 5,
    'the result set has 30 rows before applying the 25-row page');
  contains(secondPage.html, /name="buscarSeries"[^>]*value="Ruta"/i, 'page navigation preserves the active search');
  contains(secondPage.html, /name="paginaSeries"[^>]*value="2"/i, 'the current series page is preserved');

  const noMatches = await app.render({ search: '?vista=series&buscarSeries=no-coincide&paginaSeries=1' });
  assertPrivate(noMatches.response, noMatches.html);
  assert.equal(rows(noMatches.html, 'data-owner-series-list', 'data-owner-series-row').length, 0);
  contains(visibleText(noMatches.html), /0\s+series/i, 'a search with no matches is reported as zero results');
  contains(noMatches.html, /Crear serie/i, 'series creation remains available from a no-match result');
});

test('una referencia compartida puede ser capítulo, sin abrir edición de ficha desde Series', async () => {
  await app.resetRuntime();
  await app.createProfile({ session: 'creator-b', slug: 'bea-series' });
  await app.addLink({ session: 'creator-b', title: 'Guía compartida larga', url: 'https://series.example/shared' });
  await app.createProfile({ session: 'creator-a', slug: 'ana-series' });
  const reference = await app.addLink({ session: 'creator-a', title: 'Guía compartida larga', url: 'https://series.example/shared' });
  const series = await app.createSeries({ session: 'creator-a', name: 'Compartida', slug: 'serie-compartida' });
  await app.assignChapter(series.id, reference.placementId);

  const result = await app.render({ search: `?vista=series&serie=${encodeURIComponent(series.id)}&pertenencia=incluidos&buscarCapitulos=compartida` });
  assertPrivate(result.response, result.html);
  const [row] = rows(result.html, 'data-owner-series-chapters', 'data-chapter-row');
  assert.equal(row.id, reference.placementId);
  contains(row.text, /Guía compartida larga/, 'the shared placement remains selectable as a chapter');
  assert.doesNotMatch(row.body, /data-link-edit|name="(?:title|url|description)"/i,
    'chapter membership does not grant metadata editing');
});

test('borradores y perfiles ocultos no ofrecen URLs públicas de serie aunque tengan capítulos', async () => {
  for (const state of ['draft', 'hidden']) {
    await app.resetRuntime();
    const profile = await app.createProfile({ slug: `ana-${state}` });
    const series = await app.createSeries({ name: `Serie ${state}`, slug: `serie-${state}` });
    const link = await app.addLink({ title: 'Capítulo visible', url: `https://series.example/${state}` });
    await app.assignChapter(series.id, link.placementId);
    if (state === 'hidden') {
      await app.api('/api/creador/perfil/publicar/', {}, { method: 'POST' });
      const current = await app.api('/api/creador/perfil/', undefined, { method: 'GET' });
      await app.api(`/api/admin/perfiles/${profile.id}/ocultar/`, { version: current.profile.version }, { method: 'POST', session: 'admin' });
    }
    const result = await app.render({ search: '?vista=series' });
    assertPrivate(result.response, result.html);
    const [row] = rows(result.html, 'data-owner-series-list', 'data-owner-series-row');
    assert.match(row.text, new RegExp(`Serie ${state}`));
    assert.doesNotMatch(row.body, /href="\/c\/ana-[^/]+\/series\//,
      `${state} profile series are not presented as public links`);
  }
});

test('la búsqueda inválida de capítulos conserva privacidad y no presenta la lista como vacía', async () => {
  await app.resetRuntime();
  await app.createProfile();
  const series = await app.createSeries();
  await app.addLink({ title: 'Existe, pero la consulta es inválida', url: 'https://series.example/invalid-query' });

  for (const search of [
    `?vista=series&serie=${encodeURIComponent(series.id)}&pertenencia=otro`,
    `?vista=series&serie=${encodeURIComponent(series.id)}&paginaCapitulos=0`,
    `?vista=series&serie=${encodeURIComponent(series.id)}&serie=${encodeURIComponent(series.id)}`,
    '?vista=series&serie=series-inexistente',
  ]) {
    const invalid = await app.render({ search });
    assertPrivate(invalid.response, invalid.html, 400);
    contains(invalid.html, /data-series-query-error/, 'invalid series queries are identified as invalid');
    assert.doesNotMatch(invalid.html, /data-owner-series-chapters[^>]*[\s\S]*?data-chapter-row=/i,
      'invalid selection is not represented as a legitimate empty chapter collection');
  }
});

test('la navegación privada conserva accesos a Enlaces, Estadísticas y Solicitudes sin GA owner', async () => {
  await app.resetRuntime();
  await app.createProfile();
  const result = await app.render({ search: '?vista=series&buscarSeries=lambda&paginaSeries=2' });
  assertPrivate(result.response, result.html);
  contains(result.html, /vista=enlaces/, 'the owner can return to links');
  contains(result.html, /vista=estadisticas[^" ]*periodo=30[^" ]*pagina=1/, 'statistics retains its own query contract');
  contains(result.html, /cuenta\/creador\//, 'the secondary claims workflow remains reachable');
  contains(visibleText(result.html), /Solicitudes/, 'the secondary route is labeled for claims');
  for (const name of ['datos', 'redes', 'foto']) {
    assert.equal(forms(result.html).filter(({ attrs }) => new RegExp(`data-owner-form="${name}"`, 'i').test(attrs)).length, 1,
      `${name} remains one form in the shared owner dialog`);
  }
  assert.equal(forms(result.html).filter(({ attrs }) => /data-owner-form="serie"/i.test(attrs)).length, 1,
    'series stays inside the owner context and uses one shared form');
});

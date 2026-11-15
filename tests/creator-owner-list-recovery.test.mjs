import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadModule(path) {
  const { outputFiles } = await build({
    entryPoints: [new URL(path, import.meta.url).pathname],
    bundle: true, format: 'esm', platform: 'node', write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const links = await loadModule('../src/lib/creator-owner-links.ts');
const series = await loadModule('../src/lib/creator-owner-series.ts');
const navigation = await loadModule('../src/lib/creator-owner-navigation.ts');
const presentation = await loadModule('../src/lib/creator-owner-presentation.ts');

function ownerSnapshot({ linkCount = 26, seriesCount = 0 } = {}) {
  const placementIds = Array.from({ length: linkCount }, (_, index) => `placement-${String(index).padStart(3, '0')}`);
  const resources = placementIds.map((_, index) => ({
    id: `resource-${String(index).padStart(3, '0')}`,
    version: 1,
    title: `Recovery resource ${String(index).padStart(3, '0')}`,
    url: `https://recovery.example/resource/${index}`,
    hidden: index === 0,
    directoryApproval: index === 0 ? 'approved' : 'pending',
    metadataEditable: true,
    reincludeAllowed: false,
  }));
  const placements = Object.fromEntries(placementIds.map((placementId, index) => [placementId, {
    resourceId: resources[index].id,
    selectedForDirectory: index !== 1,
  }]));
  const seriesMap = Object.fromEntries(Array.from({ length: seriesCount }, (_, index) => {
    const id = `series-${String(index).padStart(3, '0')}`;
    return [id, {
      name: `Visible recovery collection ${String(index).padStart(3, '0')}`,
      slug: `collection-${String(index).padStart(3, '0')}`,
      chapters: index === 0 ? [...placementIds].reverse() : [],
    }];
  }));
  return {
    schemaVersion: 2,
    creatorVersion: 1,
    profile: { id: 'profile-list-recovery', displayName: 'Creator', slug: 'creator', programs: [], socials: {}, published: true, hidden: false },
    resources,
    placements,
    order: { featured: [], ordinary: placementIds },
    series: seriesMap,
    claims: [],
  };
}

test('link filters, title sorting, and 26-to-25 page clamping use the canonical placement view', () => {
  const snapshot = ownerSnapshot({ linkCount: 26, seriesCount: 1 });
  const lists = presentation.creatorOwnerNavigationLists(snapshot);
  const query = {
    ...links.DEFAULT_CREATOR_OWNER_LINKS_QUERY,
    buscar: 'Recovery resource',
    serie: 'series-000',
    directorio: 'todos',
    destacado: 'no',
    orden: 'titulo-desc',
    paginaEnlaces: 2,
  };
  const page = links.selectCreatorOwnerLinks(lists.links, lists.series, query);
  assert.equal(page.totalMatches, 26);
  assert.equal(page.totalLinks, 26, 'filters do not change the complete owner collection');
  assert.equal(page.rows.length, 1, 'the twenty-sixth page result is reachable on page two');
  assert.equal(page.query.paginaEnlaces, 2);
  assert.ok(page.matches[0].title > page.matches.at(-1).title,
    'alphabetical display sorting leaves the separately stored general sequence intact');
  assert.deepEqual(snapshot.order.ordinary, Array.from({ length: 26 }, (_, index) => `placement-${String(index).padStart(3, '0')}`));

  const afterOneRemoval = structuredClone(snapshot);
  const removed = 'placement-002';
  delete afterOneRemoval.placements[removed];
  afterOneRemoval.resources = afterOneRemoval.resources.filter(({ id }) => id !== 'resource-002');
  afterOneRemoval.order.ordinary = afterOneRemoval.order.ordinary.filter((id) => id !== removed);
  afterOneRemoval.series['series-000'].chapters = afterOneRemoval.series['series-000'].chapters.filter((id) => id !== removed);
  const afterRemovalLists = presentation.creatorOwnerNavigationLists(afterOneRemoval);
  const clamped = links.selectCreatorOwnerLinks(afterRemovalLists.links, afterRemovalLists.series, query);
  assert.equal(clamped.totalMatches, 25);
  assert.equal(clamped.query.paginaEnlaces, 1, 'page two clamps when the filtered result shrinks to one page');
  assert.equal(clamped.rows.length, 25);
});

test('a vanished Series clears only its query context and preserves valid link search and filters', () => {
  const before = ownerSnapshot({ linkCount: 26, seriesCount: 51 });
  const linkQuery = {
    ...links.DEFAULT_CREATOR_OWNER_LINKS_QUERY,
    buscar: 'Recovery resource',
    serie: 'series-000',
    directorio: 'no-propuestos',
    destacado: 'no',
    orden: 'titulo-desc',
    paginaEnlaces: 1,
  };
  const linksQuery = navigation.normalizeOwnerLinksQuery(before, linkQuery);
  const beforeSeriesQuery = {
    ...series.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
    buscarSeries: 'Visible recovery collection',
    paginaSeries: 2,
    serie: 'series-000',
    buscarCapitulos: 'Recovery resource',
    pertenencia: 'incluidos',
    paginaCapitulos: 2,
  };
  const beforeSeriesState = navigation.normalizeOwnerSeriesQuery(before, beforeSeriesQuery);
  assert.equal(beforeSeriesState.serie, 'series-000');

  const after = structuredClone(before);
  delete after.series['series-000'];
  const normalizedLinks = navigation.normalizeOwnerLinksQuery(after, linksQuery);
  assert.deepEqual(normalizedLinks, { ...linkQuery, serie: 'todos', paginaEnlaces: 1 });
  assert.deepEqual(navigation.normalizeOwnerSeriesQuery(after, beforeSeriesState), {
    ...beforeSeriesQuery,
    serie: '',
    buscarCapitulos: '',
    pertenencia: 'todos',
    paginaCapitulos: 1,
  });
});

test('Series paging is independent and chapter comparison order follows the stored sequence including hidden placements', () => {
  const snapshot = ownerSnapshot({ linkCount: 3, seriesCount: 26 });
  snapshot.order.ordinary = ['placement-002', 'placement-000', 'placement-001'];
  snapshot.series['series-000'].chapters = ['placement-001', 'placement-000'];
  snapshot.series['series-001'].chapters = ['placement-002'];

  const seriesQuery = { ...series.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
    buscarSeries: 'Visible recovery collection', paginaSeries: 2 };
  const page = series.selectCreatorOwnerSeries(snapshot, seriesQuery);
  assert.equal(page.totalMatches, 26);
  assert.equal(page.rows.length, 1);
  assert.equal(page.query.paginaSeries, 2);

  const chapterQuery = { ...series.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
    serie: 'series-000', buscarCapitulos: 'Recovery resource', pertenencia: 'incluidos', paginaCapitulos: 1 };
  const chapterSelection = series.selectCreatorOwnerChapters(snapshot, chapterQuery);
  assert.deepEqual(chapterSelection.completeOrder.map(({ placementId }) => placementId), ['placement-001', 'placement-000']);
  assert.deepEqual(chapterSelection.completeOrder.map(({ hidden }) => hidden), [false, true],
    'hidden chapters stay in the complete saved sequence used by comparison and movement');
  assert.deepEqual(snapshot.order.ordinary, ['placement-002', 'placement-000', 'placement-001'],
    'chapter order remains independent of the general link order');
  assert.deepEqual(chapterSelection.rows.map(({ placementId }) => placementId), ['placement-000', 'placement-001'],
    'the visible chapter table remains A–Z while completeOrder keeps the server sequence');
});

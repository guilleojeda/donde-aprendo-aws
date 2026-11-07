import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadModule(path) {
  const { outputFiles } = await build({
    entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, format: 'esm', platform: 'node', write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString('base64')}`);
}

const ownerState = await loadModule('../src/lib/creator-owner-state.ts');
const ownerCommands = await loadModule('../src/lib/creator-owner-commands.ts');
const ownerLinks = await loadModule('../src/lib/creator-owner-links.ts');
const ownerSeries = await loadModule('../src/lib/creator-owner-series.ts');

// These reducer cases use DTO snapshots as prerequisites. They establish query
// and continuation behavior at the state boundary; browser acceptance covers
// the actual delayed service read and its persisted command outcome.
const PAGE_SIZE = 25;
const profile = {
  id: 'profile-list-recovery', displayName: 'Creator', slug: 'creator', programs: [], socials: {},
  published: true, hidden: false, version: 1,
};

function makeSeries(index, id = `series-${String(index).padStart(3, '0')}`) {
  return { id, name: `Visible recovery collection ${String(index).padStart(3, '0')}`, slug: `collection-${String(index).padStart(3, '0')}`, version: 1 };
}

function makeLink(index, { title, seriesIds = [] } = {}) {
  return {
    placementId: `placement-${String(index).padStart(3, '0')}`,
    resourceId: `resource-${String(index).padStart(3, '0')}`,
    title: title ?? `Recovery resource ${String(index).padStart(3, '0')}`,
    url: `https://recovery.example/resource/${index}`,
    featured: false,
    position: index,
    selectedForDirectory: false,
    hidden: false,
    directoryApproval: 'pending',
    resourceVersion: 1,
    placementVersion: 1,
    series: seriesIds.map((seriesId, position) => ({ seriesId, position })),
  };
}

function makeData({ links = [], series = [], profileVersion = 1 } = {}) {
  return {
    profile: { ...profile, version: profileVersion },
    links,
    editableResources: links.map(({ resourceId, title, url, resourceVersion }) => ({
      id: resourceId, title, url, version: resourceVersion,
    })),
    claims: [],
    series,
  };
}

function initialState(data, { view, linksQuery, seriesQuery = ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY } = {}) {
  return ownerState.createCreatorOwnerState({
    data,
    accountEmail: 'creator@example.test',
    csrfToken: 'csrf',
    sessionBinding: 'a'.repeat(64),
    isAdmin: false,
    publicOrigin: 'https://recovery.example',
    view,
    linksQuery,
    seriesQuery,
  });
}

function beginUncertainListCheck(state, context, id) {
  const intent = ownerCommands.creatorOwnerWriteIntent(id, context);
  const request = ownerCommands.prepareCreatorOwnerRequest(intent);
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-write', intent });
  state = ownerState.creatorOwnerReducer(state, {
    type: 'write-uncertain', intentId: intent.id, status: 'uncertain', message: 'No se confirmó la respuesta.',
  });
  const checkId = `${id}:check`;
  state = ownerState.creatorOwnerReducer(state, { type: 'begin-check', intentId: intent.id, checkId });
  assert.equal(state.attempt.status, 'checking');
  return { state, intent, checkId, request };
}

function adoptSnapshot(state, intent, checkId, snapshot) {
  const originalSnapshot = structuredClone(snapshot);
  const comparison = ownerCommands.createCreatorOwnerComparison(intent, snapshot);
  assert.equal(comparison.canAdopt, true);
  state = ownerState.creatorOwnerReducer(state, {
    type: 'check-compared', intentId: intent.id, checkId, comparison,
  });
  assert.equal(state.attempt.status, 'confirmed', 'the valid list check adopts its complete snapshot in one reducer action');
  const afterCheck = state;
  state = ownerState.creatorOwnerReducer(state, { type: 'adopt-comparison', comparisonId: comparison.id });
  assert.equal(state, afterCheck, 'a list snapshot cannot be adopted through the separate editor adoption action');
  assert.deepEqual(snapshot, originalSnapshot, 'comparison/adoption does not mutate the supplied owner snapshot');
  assert.deepEqual(state.observed, snapshot, 'the state adopts the authoritative snapshot');
  return state;
}

function listContext(operation, baseData, { baseSeries, basePlacement } = {}) {
  return {
    kind: 'list-command',
    key: `list:${operation}`,
    operation,
    baseProfile: baseData.profile,
    ...(baseSeries ? { baseSeries } : {}),
    ...(basePlacement ? { basePlacement } : {}),
  };
}

test('Links recovery retains page 2 with 26 matches and clamps it when only 25 remain', async (t) => {
  for (const remaining of [26, 25]) {
    await t.test(`${remaining} matching links after the lost removal`, () => {
      const matchingLinks = Array.from({ length: remaining }, (_, index) => makeLink(index));
      const removed = makeLink(1000, { title: 'Recovery resource removed during the uncertain request' });
      const beforeData = makeData({ links: [...matchingLinks, removed] });
      const snapshot = makeData({ links: matchingLinks, profileVersion: profile.version + 1 });
      const query = {
        ...ownerLinks.DEFAULT_CREATOR_OWNER_LINKS_QUERY,
        buscar: 'Recovery resource',
        directorio: 'no-propuestos',
        destacado: 'no',
        orden: 'titulo-desc',
        paginaEnlaces: 2,
      };
      let state = initialState(beforeData, { view: 'enlaces' });
      const begun = beginUncertainListCheck(state, listContext('remove-link', beforeData, { basePlacement: removed }),
        `links-remove-${remaining}`);
      state = ownerState.creatorOwnerReducer(begun.state, { type: 'apply-links-query', query });
      const beforeSelection = ownerLinks.selectCreatorOwnerLinks(state.observed.links, state.observed.series, state.location.linksQuery);
      assert.equal(beforeSelection.totalMatches, remaining + 1);
      assert.equal(beforeSelection.query.paginaEnlaces, 2, 'page 2 was valid when the recovery read began');
      state = ownerState.creatorOwnerReducer(state, {
        type: 'set-links-pending-query', query: { buscar: 'Typed while checking', paginaEnlaces: 1 },
      });

      state = adoptSnapshot(state, begun.intent, begun.checkId, snapshot);
      const expectedPage = Math.min(2, Math.max(1, Math.ceil(remaining / PAGE_SIZE)));
      assert.deepEqual(state.location.linksQuery, { ...query, paginaEnlaces: expectedPage });
      const visible = ownerLinks.selectCreatorOwnerLinks(state.observed.links, state.observed.series, state.location.linksQuery);
      assert.equal(visible.totalMatches, remaining);
      assert.equal(visible.rows.length, remaining - (expectedPage - 1) * PAGE_SIZE);

      const nextContext = listContext('remove-link', state.observed, { basePlacement: state.observed.links[0] });
      const nextRequest = ownerCommands.prepareCreatorOwnerRequest(ownerCommands.creatorOwnerWriteIntent('next-link-action', nextContext));
      assert.equal(nextRequest.body.profileVersion, state.observed.profile.version,
        'the next manual list intent starts from the adopted profile version');
      assert.deepEqual(state.location.pendingLinksQuery, { ...query, buscar: 'Typed while checking', paginaEnlaces: 1 },
        'a search typed after the last applied query remains pending for its debounce');
    });
  }
});

test('a vanished Links series filter becomes all series and preserves the remaining current query', () => {
  const vanishedSeries = makeSeries(900, 'series-vanished-links-filter');
  const matchingLinks = Array.from({ length: 26 }, (_, index) => makeLink(index, { seriesIds: [vanishedSeries.id] }));
  const removed = makeLink(1001, { title: 'Recovery resource removed during the uncertain request', seriesIds: [vanishedSeries.id] });
  const beforeData = makeData({ links: [...matchingLinks, removed], series: [vanishedSeries] });
  const snapshot = makeData({
    links: matchingLinks.map((link) => ({ ...link, series: [] })),
    profileVersion: profile.version + 1,
  });
  const query = {
    ...ownerLinks.DEFAULT_CREATOR_OWNER_LINKS_QUERY,
    buscar: 'Recovery resource',
    serie: vanishedSeries.id,
    directorio: 'no-propuestos',
    destacado: 'no',
    orden: 'titulo-desc',
    paginaEnlaces: 2,
  };
  const stateBefore = initialState(beforeData, { view: 'enlaces', linksQuery: ownerLinks.DEFAULT_CREATOR_OWNER_LINKS_QUERY });
  const begun = beginUncertainListCheck(stateBefore, listContext('remove-link', beforeData, { basePlacement: removed }), 'links-vanished-filter');
  let state = ownerState.creatorOwnerReducer(begun.state, { type: 'apply-links-query', query });
  assert.equal(ownerLinks.selectCreatorOwnerLinks(state.observed.links, state.observed.series, state.location.linksQuery).totalMatches, 27,
    'the selected series filter is valid before the adopted snapshot changes');
  state = ownerState.creatorOwnerReducer(state, {
    type: 'set-links-pending-query', query: { buscar: 'Pending links search', paginaEnlaces: 1 },
  });

  state = adoptSnapshot(state, begun.intent, begun.checkId, snapshot);
  const nextRequest = ownerCommands.prepareCreatorOwnerRequest(ownerCommands.creatorOwnerWriteIntent(
    'next-link-after-filter-recovery', listContext('remove-link', state.observed, { basePlacement: state.observed.links[0] }),
  ));
  assert.equal(nextRequest.body.profileVersion, state.observed.profile.version);
  assert.deepEqual(state.location.linksQuery, { ...query, serie: 'todos' },
    'only the disappeared series filter is normalized; search, other filters, sort, and valid page remain');
  assert.deepEqual(state.location.pendingLinksQuery, {
    ...query, serie: 'todos', buscar: 'Pending links search', paginaEnlaces: 1,
  },
    'the current valid series filter and the not-yet-applied search both survive adoption');
  const visible = ownerLinks.selectCreatorOwnerLinks(state.observed.links, state.observed.series, state.location.linksQuery);
  assert.equal(visible.totalMatches, 26);
  assert.equal(visible.query.paginaEnlaces, 2);
});

test('Series list and selected-chapter page 2 are retained with 26 matches and clamped at 25', async (t) => {
  for (const remaining of [26, 25]) {
    await t.test(`${remaining} matching rows after recovery`, () => {
      const visibleSeries = Array.from({ length: remaining }, (_, index) => makeSeries(index));
      const removedSeries = makeSeries(1000, 'series-being-deleted');
      const beforeSeriesData = makeData({ series: [...visibleSeries, removedSeries] });
      const afterSeriesData = makeData({ series: visibleSeries, profileVersion: profile.version + 1 });
      const seriesQuery = {
        ...ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
        buscarSeries: 'Visible recovery collection',
        paginaSeries: 2,
      };
      let state = initialState(beforeSeriesData, { view: 'series', seriesQuery });
      const deleteIntent = beginUncertainListCheck(state, listContext('delete-series', beforeSeriesData, { baseSeries: removedSeries }),
        `series-list-delete-${remaining}`);
      state = ownerState.creatorOwnerReducer(deleteIntent.state, { type: 'set-series-search', value: 'Pending series search' });
      const currentSeriesPage = ownerSeries.selectCreatorOwnerSeries(state.observed.series, state.location.query);
      assert.equal(currentSeriesPage.totalMatches, remaining + 1);
      assert.equal(currentSeriesPage.query.paginaSeries, 2, 'page 2 was valid when the recovery read began');

      state = adoptSnapshot(state, deleteIntent.intent, deleteIntent.checkId, afterSeriesData);
      const expectedPage = Math.min(2, Math.max(1, Math.ceil(remaining / PAGE_SIZE)));
      assert.equal(state.location.query.buscarSeries, seriesQuery.buscarSeries);
      assert.equal(state.location.pendingSeriesSearch, 'Pending series search');
      const selectedPage = ownerSeries.selectCreatorOwnerSeries(state.observed.series, state.location.query);
      assert.equal(selectedPage.totalMatches, remaining);
      assert.equal(selectedPage.rows.length, remaining - (expectedPage - 1) * PAGE_SIZE);

      const nextContext = listContext('delete-series', state.observed, { baseSeries: state.observed.series[0] });
      const nextRequest = ownerCommands.prepareCreatorOwnerRequest(ownerCommands.creatorOwnerWriteIntent('next-series-action', nextContext));
      assert.equal(nextRequest.body.profileVersion, state.observed.profile.version,
        'the next manual series action uses the adopted profile version');
      assert.equal(state.location.query.paginaSeries, expectedPage);
    });
  }

  for (const remaining of [26, 25]) {
    await t.test(`${remaining} included chapters after recovery`, () => {
      const selectedSeries = makeSeries(2000, 'series-selected-for-chapters');
      const matchingChapters = Array.from({ length: remaining }, (_, index) => makeLink(index, {
        title: `Visible chapter ${String(index).padStart(3, '0')}`,
        seriesIds: [selectedSeries.id],
      }));
      const removedChapter = makeLink(3000, { title: 'Visible chapter removed', seriesIds: [selectedSeries.id] });
      const beforeData = makeData({ links: [...matchingChapters, removedChapter], series: [selectedSeries] });
      const afterLinks = [...matchingChapters, makeLink(3000, { title: removedChapter.title })];
      const snapshot = makeData({ links: afterLinks, series: [selectedSeries], profileVersion: profile.version + 1 });
      const query = {
        ...ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
        buscarSeries: 'Visible recovery collection',
        serie: selectedSeries.id,
        buscarCapitulos: 'Visible chapter',
        pertenencia: 'incluidos',
        paginaCapitulos: 2,
      };
      let state = initialState(beforeData, { view: 'series', seriesQuery: query });
      const chapterCheck = beginUncertainListCheck(state,
        listContext('chapter-remove', beforeData, { baseSeries: selectedSeries, basePlacement: removedChapter }),
        `chapter-remove-${remaining}`);
      state = chapterCheck.state;
      state = ownerState.creatorOwnerReducer(state, { type: 'set-chapter-search', value: 'Pending chapter search' });
      state = ownerState.creatorOwnerReducer(state, { type: 'set-pending-membership', value: 'disponibles' });
      const currentChapters = ownerSeries.selectCreatorOwnerChapters(state.observed, state.location.query);
      assert.equal(currentChapters.totalMatches, remaining + 1);
      assert.equal(currentChapters.query.paginaCapitulos, 2, 'page 2 was valid when the recovery read began');

      state = adoptSnapshot(state, chapterCheck.intent, chapterCheck.checkId, snapshot);
      const expectedPage = Math.min(2, Math.max(1, Math.ceil(remaining / PAGE_SIZE)));
      assert.equal(state.location.pendingSeriesSearch, query.buscarSeries);
      assert.equal(state.location.pendingChapterSearch, 'Pending chapter search');
      assert.equal(state.location.pendingMembership, 'disponibles');
      const visibleChapters = ownerSeries.selectCreatorOwnerChapters(state.observed, state.location.query);
      assert.equal(visibleChapters.totalMatches, remaining);
      assert.equal(visibleChapters.rows.length, remaining - (expectedPage - 1) * PAGE_SIZE);

      const nextContext = listContext('chapter-add', state.observed, {
        baseSeries: state.observed.series[0],
        basePlacement: state.observed.links.find(({ placementId }) => placementId === removedChapter.placementId),
      });
      const nextRequest = ownerCommands.prepareCreatorOwnerRequest(ownerCommands.creatorOwnerWriteIntent('next-chapter-action', nextContext));
      assert.equal(nextRequest.body.profileVersion, state.observed.profile.version,
        'the next manual chapter action uses the adopted profile version');
      assert.deepEqual(state.location.query, { ...query, paginaCapitulos: expectedPage });
    });
  }
});

test('when the selected Series disappeared, adoption clears only its chapter context and pending chapter fields', () => {
  const vanishedSeries = makeSeries(3000, 'series-removed-during-check');
  const survivingSeries = Array.from({ length: 26 }, (_, index) => makeSeries(index));
  const currentChapters = Array.from({ length: 26 }, (_, index) => makeLink(index, {
    title: `Visible chapter ${String(index).padStart(3, '0')}`,
    seriesIds: [vanishedSeries.id],
  }));
  const removedChapter = makeLink(1001, { title: 'Visible chapter removed', seriesIds: [vanishedSeries.id] });
  const beforeData = makeData({ links: [...currentChapters, removedChapter], series: [...survivingSeries, vanishedSeries] });
  const snapshot = makeData({
    links: [...currentChapters, removedChapter].map((link) => ({ ...link, series: [] })),
    series: survivingSeries,
    profileVersion: profile.version + 2,
  });
  const query = {
    ...ownerSeries.DEFAULT_CREATOR_OWNER_SERIES_QUERY,
    buscarSeries: 'Visible recovery collection',
    paginaSeries: 2,
    serie: vanishedSeries.id,
    buscarCapitulos: 'Visible chapter',
    pertenencia: 'incluidos',
    paginaCapitulos: 2,
  };
  let state = initialState(beforeData, { view: 'series', seriesQuery: query });
  const begun = beginUncertainListCheck(state,
    listContext('chapter-remove', beforeData, { baseSeries: vanishedSeries, basePlacement: removedChapter }),
    'delete-selected-series');
  assert.equal(begun.request.path, `/api/creador/series/${vanishedSeries.id}/capitulos/${removedChapter.placementId}/`);
  const currentChaptersPage = ownerSeries.selectCreatorOwnerChapters(state.observed, state.location.query);
  assert.equal(currentChaptersPage.totalMatches, 27);
  assert.equal(currentChaptersPage.query.paginaCapitulos, 2, 'the selected chapter list was valid before the concurrent disappearance');
  state = begun.state;
  state = ownerState.creatorOwnerReducer(state, { type: 'set-chapter-search', value: 'Pending chapter search' });
  state = ownerState.creatorOwnerReducer(state, { type: 'set-pending-membership', value: 'disponibles' });

  state = adoptSnapshot(state, begun.intent, begun.checkId, snapshot);
  assert.deepEqual(state.location.query, {
    ...query,
    serie: '',
    buscarCapitulos: '',
    pertenencia: 'todos',
    paginaCapitulos: 1,
  }, 'the series list search/page survive while only the vanished chapter context is cleared');
  assert.equal(state.location.pendingSeriesSearch, query.buscarSeries,
    'the Series search carried into the selected chapter context remains unchanged');
  assert.equal(state.location.pendingChapterSearch, '');
  assert.equal(state.location.pendingMembership, 'todos');
  assert.equal(state.location.focusAfterRender, '#owner-series-title');
  assert.equal(ownerSeries.selectCreatorOwnerSeries(state.observed.series, state.location.query).query.paginaSeries, 2);

  const nextContext = listContext('delete-series', state.observed, { baseSeries: state.observed.series[0] });
  const nextRequest = ownerCommands.prepareCreatorOwnerRequest(ownerCommands.creatorOwnerWriteIntent('next-surviving-series', nextContext));
  assert.equal(nextRequest.body.profileVersion, state.observed.profile.version);
});

test('a recovered Publish from Enlaces focuses its visible list search', () => {
  const beforeData = makeData();
  beforeData.profile.published = false;
  const snapshot = makeData({ profileVersion: profile.version + 1 });
  const begun = beginUncertainListCheck(
    initialState(beforeData, { view: 'enlaces' }),
    listContext('publish', beforeData),
    'publish-from-links-focus',
  );

  const state = adoptSnapshot(begun.state, begun.intent, begun.checkId, snapshot);
  assert.equal(state.location.focusAfterRender, '#owner-link-search',
    'focus follows the active view instead of targeting the absent Series heading');
});

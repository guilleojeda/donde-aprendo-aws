import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';
import { createCachedCreatorStatistics } from '../src/lib/creator-statistics.mjs';
import { createGA4StatisticsReader } from '../src/lib/creator-statistics-ga4.mjs';
import { getStatisticsLinkLabel, isIdentifiableStatisticsLinkId } from '../src/lib/creator-statistics-labels.ts';
import { parseCreatorStatisticsReady } from '../src/lib/creator-statistics-response.ts';
import { callApi, createCreatorPagesHarness, sessionCsrf } from './fixtures/creator-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const componentPath = path.join(root, 'src/components/CreatorStatistics.astro');
const scratchParent = path.join(root, '.work/creator-pages');
await mkdir(scratchParent, { recursive: true });
const tempDir = await mkdtemp(path.join(scratchParent, 'phase3-ui-render-'));
const outputPath = path.join(tempDir, 'creator-statistics-component.mjs');
let component;
let container;

await build({
  entryPoints: [componentPath],
  outfile: outputPath,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  plugins: [{
    name: 'render-creator-statistics-astro',
    setup(api) {
      api.onLoad({ filter: /\.astro$/ }, async ({ path: filename }) => ({
        contents: transform(await readFile(filename, 'utf8'), {
          filename,
          internalURL: 'astro/compiler-runtime',
          resultScopedSlot: true,
          resolvePath: (specifier) => specifier,
        }).code,
        loader: 'js',
      }));
    },
  }],
});

({ default: component } = await import(pathToFileURL(outputPath).href));
container = await experimental_AstroContainer.create();

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

function dates() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, 18 + index)).toISOString().slice(0, 10);
    return { date, views: index < 5 ? null : 0, clicks: index < 5 ? null : 0 };
  });
}

function report(overrides = {}) {
  return {
    state: 'ready',
    creatorId: 'creator-a',
    period: 7,
    page: 1,
    range: { startDate: '2026-10-18', endDate: '2026-10-24', timeZone: 'America/Argentina/Buenos_Aires' },
    totals: { views: 8, visitors: 3, clicks: 8 },
    daily: dates(),
    links: { page: 1, pageSize: 100, totalRows: 0, rows: [] },
    sources: [],
    warnings: [],
    captureStartedAt: '2026-10-23T23:38:00.000Z',
    freshness: 'fresh',
    updatedAt: '2026-10-24T14:00:00.000Z',
    ...overrides,
  };
}

function pageResult(value) {
  return {
    principal: { state: 'authenticated', isAdmin: false },
    status: 200,
    state: 'ready',
    period: value.period,
    page: value.page,
    editor: { profile: { socials: {} }, links: [] },
    report: value,
  };
}

async function render(value) {
  return container.renderToString(component, { props: { result: pageResult(value) } });
}

function explicitEmptyReport(dimensions, metrics, metadata = {}) {
  return {
    dimensionHeaders: dimensions.map((name) => ({ name })),
    metricHeaders: metrics.map((name) => ({ name, type: 'TYPE_INTEGER' })),
    rows: [],
    rowCount: 0,
    metadata: { timeZone: 'America/Buenos_Aires', ...metadata },
    propertyQuota: { tokensPerDay: { consumed: 1, remaining: 199_999 } },
  };
}

test('Google Analytics grouped, missing, and blank link IDs remain non-identifying in the parser and rendered dashboard', async () => {
  const linkRows = [
    { linkId: '(other)', clicks: 8 },
    { linkId: '(not set)', clicks: 2 },
    { linkId: '', clicks: 1 },
  ];
  const parsed = parseCreatorStatisticsReady(report({
    links: { page: 1, pageSize: 100, totalRows: linkRows.length, rows: linkRows },
  }), 7, 1, 'creator-a');
  assert.ok(parsed, 'reserved and blank IDs are valid rows with counts, not a malformed report');
  assert.deepEqual(parsed.links.rows, linkRows);
  assert.equal(getStatisticsLinkLabel('(other)'), 'Otros enlaces agrupados por Google Analytics');
  assert.equal(getStatisticsLinkLabel('(not set)'), 'Enlace no identificado');
  assert.equal(getStatisticsLinkLabel(''), 'Enlace no identificado');
  assert.equal(isIdentifiableStatisticsLinkId('(other)'), false);
  assert.equal(isIdentifiableStatisticsLinkId('(not set)'), false);
  assert.equal(isIdentifiableStatisticsLinkId(''), false);

  const html = await render(parsed);
  assert.match(html, /Otros enlaces agrupados por Google Analytics/);
  assert.equal((html.match(/Enlace no identificado/g) ?? []).length, 2);
  assert.match(html, /Filas de detalle: 3/);
  assert.doesNotMatch(html, /ID de enlace: \(other\)|ID de enlace: \(not set\)|Enlace anterior o no disponible/);
  assert.doesNotMatch(html, /3 enlaces con clics/);
});

test('empty detail with section warnings is described as limited, not absent or pre-capture', async () => {
  const limited = report({
    daily: dates().map(({ date }) => ({ date, views: null, clicks: null })),
    links: { page: 1, pageSize: 100, totalRows: 0, rows: [] },
    sources: [],
    warnings: [
      { section: 'daily', code: 'thresholding' },
      { section: 'links', code: 'thresholding' },
      { section: 'sources', code: 'thresholding' },
    ],
  });
  const html = await render(limited);
  assert.match(html, /limitó el detalle diario/);
  assert.match(html, /limitó el detalle de clics por enlace/);
  assert.match(html, /limitó el detalle de fuentes de sesión/);
  assert.match(html, /Detalle limitado por Google Analytics/);
  assert.doesNotMatch(html, /Filas de detalle: 0/);
  assert.doesNotMatch(html, /No hay días medidos|No hay datos reconstruibles|No se registraron clics por enlace|No hay filas de fuente\/medio/);
});

test('valid zero reports retain their empty activity messages', async () => {
  const empty = report({
    totals: { views: 0, visitors: 0, clicks: 0 },
    daily: dates().map(({ date }) => ({ date, views: 0, clicks: 0 })),
    links: { page: 1, pageSize: 100, totalRows: 0, rows: [] },
    sources: [],
    warnings: [],
  });
  const html = await render(empty);
  assert.match(html, /No se registraron clics por enlace durante este período/);
  assert.match(html, /No hay filas de fuente\/medio de sesión registradas para este período/);
  assert.match(html, /<td>0<\/td>/);
  assert.match(html, /class="creator-statistics__table-wrap"[^>]*role="region"[^>]*tabindex="0"/);
  assert.doesNotMatch(html, /No hay cifras diarias disponibles|Google Analytics limitó el detalle/);
});

test('explicit empty limited GA4 results stay unknown through the authenticated API, cache, parser, and dashboard', async () => {
  const reports = [
    explicitEmptyReport([], ['eventCount', 'totalUsers'], { dataLossFromOtherRow: true }),
    explicitEmptyReport(['date', 'eventName'], ['eventCount'], {
      samplingMetadatas: [{ samplesReadCount: '20', samplingSpaceSize: '100' }],
    }),
    explicitEmptyReport(['customEvent:link_id'], ['eventCount'], { dataLossFromOtherRow: true }),
    explicitEmptyReport(['sessionSourceMedium'], ['eventCount'], {
      samplingMetadatas: [{ samplesReadCount: '20', samplingSpaceSize: '100' }],
    }),
    explicitEmptyReport([], ['eventCount'], {
      samplingMetadatas: [{ samplesReadCount: '20', samplingSpaceSize: '100' }],
    }),
  ];
  let cached;
  let providerReads = 0;
  const now = Date.parse('2026-10-24T15:00:00.000Z');
  const reader = createGA4StatisticsReader({
    propertyId: '424203315',
    captureStartedAt: '2026-10-23T23:38:00Z',
    now: () => now,
    getAccessToken: async () => 'fixture-access-token',
    fetch: async () => {
      providerReads += 1;
      return Response.json({ reports });
    },
  });
  const statistics = createCachedCreatorStatistics({
    reader,
    now: () => now,
    cache: {
      async get() { return cached === undefined ? undefined : structuredClone(cached); },
      async put(_key, value) { cached = structuredClone(value); },
    },
  });
  const harness = await createCreatorPagesHarness({ statistics });
  const saved = await callApi(harness, '/api/creador/perfil', {
    session: 'creator-a',
    method: 'PUT',
    csrf: sessionCsrf['creator-a'],
    body: { displayName: 'Creador de analítica', slug: 'creador-de-analitica' },
  });
  assert.equal(saved.status, 200);
  const { profile } = await saved.json();
  const published = await callApi(harness, '/api/creador/perfil/publicar', {
    session: 'creator-a',
    method: 'POST',
    csrf: sessionCsrf['creator-a'],
    body: {},
  });
  assert.equal(published.status, 200);

  const response = await callApi(harness, '/api/creador/estadisticas/', { session: 'creator-a' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const body = await response.json();
  assert.deepEqual(body.totals, { views: null, visitors: null, clicks: null });
  assert.deepEqual(cached.report.totals, body.totals, 'unknown values must remain cacheable as unknown');

  const warmedResponse = await callApi(harness, '/api/creador/estadisticas/', { session: 'creator-a' });
  assert.equal(warmedResponse.status, 200);
  assert.deepEqual((await warmedResponse.json()).totals, body.totals);
  assert.equal(providerReads, 1, 'the valid limited response should be reused from cache');

  const parsed = parseCreatorStatisticsReady(body, 7, 1, profile.id);
  assert.ok(parsed, 'the authenticated API payload with nullable totals is a valid ready report');
  const html = await render(parsed);
  const totals = html.match(/<section class="creator-statistics__totals"[^]*?<\/section>/)?.[0];
  assert.ok(totals);
  assert.equal((totals.match(/Datos limitados/g) ?? []).length, 3);
  assert.doesNotMatch(totals, /<p>0<\/p>/);
  assert.match(html, /Google Analytics agrupó parte del detalle en “\(other\)”/);
  assert.match(html, /Esta sección se calculó con una muestra de los datos disponibles/);
});

test('an empty page after results shrink keeps a route back to the last page with data', async () => {
  const outOfRange = report({
    page: 2,
    links: { page: 2, pageSize: 100, totalRows: 1, rows: [] },
  });
  const html = await render(outOfRange);
  assert.match(html, /aria-label="Páginas de clics por enlace"/);
  assert.match(html, /Esta página ya no tiene resultados/);
  assert.doesNotMatch(html, /Página 2 de 1/);
  assert.match(html, /Última página con datos/);
  assert.match(html, /href="\/cuenta\/estadisticas\/\?periodo=7&amp;pagina=1"/);
});

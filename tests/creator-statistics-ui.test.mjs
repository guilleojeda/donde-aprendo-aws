import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';
import { getStatisticsLinkLabel, isIdentifiableStatisticsLinkId } from '../src/lib/creator-statistics-labels.ts';
import { parseCreatorStatisticsReady } from '../src/lib/creator-statistics-response.ts';

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

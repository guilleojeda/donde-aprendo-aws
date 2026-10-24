import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';

// Render the real cards. Interactive filtering/navigation is also exercised
// through the deployed browser journey in .work/creator-pages/plan.md.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = path.join(root, '.work/creator-pages');
await mkdir(scratch, { recursive: true });
const temporary = await mkdtemp(path.join(scratch, 'phase4-discovery-render-'));
const components = new Map();
const container = await experimental_AstroContainer.create();
after(() => rm(temporary, { recursive: true, force: true }));

async function render(name, props) {
  if (!components.has(name)) {
    const filename = path.join(root, 'src/components', `${name}.astro`);
    const output = path.join(temporary, `${name}.mjs`);
    await build({
      entryPoints: [filename], outfile: output, bundle: true, platform: 'node',
      format: 'esm', packages: 'external', logLevel: 'silent',
      plugins: [{
        name: 'render-series-discovery',
        setup(api) {
          api.onLoad({ filter: /\.astro$/ }, async ({ path: sourcePath }) => ({
            contents: transform(await readFile(sourcePath, 'utf8'), {
              filename: sourcePath, internalURL: 'astro/compiler-runtime',
              resultScopedSlot: true, resolvePath: (specifier) => specifier,
            }).code,
            loader: 'js',
          }));
          api.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
        },
      }],
    });
    components.set(name, (await import(pathToFileURL(output).href)).default);
  }
  return container.renderToString(components.get(name), { props });
}

const association = (id, overrides = {}) => ({
  seriesId: id, name: id === 'series-a' ? 'Ruta Lambda' : 'Ruta IAM',
  creatorName: id === 'series-a' ? 'Ana AWS' : 'Bea AWS',
  href: `/c/${id === 'series-a' ? 'ana' : 'bea'}/series/${id}/`, ...overrides,
});
const resource = (series = []) => ({
  id: 'fixture-series-resource', kind: 'content', category: 'Artículo',
  format: 'Artículo', topics: ['Serverless'], title: 'Construir una función',
  description: 'Una referencia compartida.', url: 'https://example.invalid/material?ref=directorio',
  series,
});

test('directory cards keep one resource and render each eligible series as an independent internal link', async () => {
  const associations = [association('series-a'), association('series-b')];
  const html = await render('ResourceCard', { resource: resource(associations), index: 0 });
  assert.equal((html.match(/id="resource-fixture-series-resource"/gu) ?? []).length, 1);
  for (const entry of associations) {
    assert.ok(html.includes(`href="${entry.href}"`), `the card links to ${entry.seriesId}`);
    assert.ok(html.includes(entry.name), `the card identifies ${entry.seriesId}`);
    assert.ok(html.includes(entry.creatorName), 'series affiliation identifies its creator');
  }
  assert.equal((html.match(/href="https:\/\/example\.invalid\/material\?ref=directorio"/gu) ?? []).length, 1);
});

test('a resource without series keeps its destination and creates no empty series navigation', async () => {
  const html = await render('ResourceCard', { resource: resource(), index: 0 });
  assert.ok(html.includes('Construir una función'));
  assert.ok(html.includes('href="https://example.invalid/material?ref=directorio"'));
  assert.equal(/href="\/c\/[^" ]+\/series\//u.test(html), false);
});

test('series labels render as text without turning creator input into executable markup', async () => {
  const html = await render('ResourceCard', {
    resource: resource([association('series-a', { name: 'Serie <script>unsafe()</script>', creatorName: '<img src=x onerror=unsafe()>' })]),
    index: 0,
  });
  assert.ok(html.includes('Serie &lt;script&gt;unsafe()&lt;/script&gt;'), 'series name is escaped and remains readable');
  assert.equal(html.includes('<script>unsafe()</script>'), false);
  assert.equal(html.includes('<img src=x onerror=unsafe()>'), false);
});

test('cohosted event cards union series by identity outside the articles that change with the representative', async () => {
  const common = {
    recordType: 'event', title: 'Una charla compartida', description: 'Un mismo encuentro.',
    startsAt: '2099-10-24T17:00:00Z', endsAt: '2099-10-24T19:00:00Z',
    timeZone: 'UTC', organizer: 'Comunidad AWS', mode: 'online',
    registrationUrl: 'https://example.invalid/registro-compartido',
  };
  const seriesA = association('series-a');
  const seriesB = association('series-b');
  const html = await render('EventAgenda', {
    resources: [],
    events: [
      { ...common, id: 'event-a', series: [seriesA] },
      { ...common, id: 'event-b', series: [seriesA, seriesB] },
    ],
  });
  const articles = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gu)]
    .map((match) => [match.index, match.index + match[0].length]);
  assert.ok(articles.length >= 2, 'the agenda retains the cohost member articles');
  for (const entry of [seriesA, seriesB]) {
    const occurrences = [...html.matchAll(new RegExp(`href="${entry.href}"`, 'gu'))];
    assert.equal(occurrences.length, 1, 'a series shared by cohosts is listed only once');
    assert.equal(articles.some(([start, end]) => occurrences[0].index >= start && occurrences[0].index < end), false,
      'series of the occurrence remain visible when the representative article changes');
  }
});

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const production = process.env.PUBLIC_PRODUCTION === 'true';
const dist = resolve('dist');
const routes = JSON.parse(readFileSync('tests/fixtures/blog-routes.json', 'utf8'));
const sections = ['aprender', 'creadores', 'comunidades', 'eventos'];
const pagePaths = ['index.html', ...sections.map((section) => `${section}/index.html`), 'recorridos/index.html', 'blog/index.html', 'buscar/index.html',
  ...routes.map(({ slug }) => `blog/${slug}/index.html`)];
const read = (path) => readFileSync(resolve(dist, path), 'utf8');
const filesUnder = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = resolve(directory, entry.name);
  return entry.isDirectory() ? filesUnder(path) : [path];
});

const sitemap = read('sitemap.xml');
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expectedLocations = [
  'https://dondeaprendoaws.com/',
  ...sections.map((section) => `https://dondeaprendoaws.com/${section}/`),
  'https://dondeaprendoaws.com/blog/',
  'https://dondeaprendoaws.com/buscar/',
  'https://dondeaprendoaws.com/recorridos/',
  ...routes.map(({ slug }) => `https://dondeaprendoaws.com/blog/${slug}/`),
].sort();
assert.deepEqual([...locations].sort(), expectedLocations);
assert.equal(new Set(locations).size, 204, 'Sitemap URLs must be unique.');

const allDistFiles = filesUnder(dist);
const allHtmlPaths = allDistFiles.filter((path) => path.endsWith('.html')).map((path) => relative(dist, path).replaceAll('\\', '/'));
assert.equal(allHtmlPaths.length, 205, 'Every public page and the 404 page must be checked.');

const fontCss = allDistFiles.filter((path) => path.endsWith('.css')).map((path) => readFileSync(path, 'utf8')).join('\n');
assert.doesNotMatch(fontCss, /https?:\/\/fonts\.(?:googleapis|gstatic)\.com/i, 'Built CSS must not depend on Google Fonts.');
const fontFaceBodies = [...fontCss.matchAll(/@font-face\s*\{([^}]+)\}/gi)].map((match) => match[1]);
const firaFaces = fontFaceBodies.filter((body) => /font-family\s*:\s*(?:"Fira Sans"|'Fira Sans'|Fira Sans)\s*;/i.test(body));
assert.equal(firaFaces.length, 21, 'All 21 official Fira Sans Unicode subset faces must be emitted.');
const fontSubsets = ['cyrillic-ext', 'cyrillic', 'greek-ext', 'greek', 'vietnamese', 'latin-ext', 'latin'];
const fontSources = read('assets/fonts/fira-sans/SOURCES.md');
for (const weight of [400, 500, 700]) {
  for (const subset of fontSubsets) {
    const asset = `/assets/fonts/fira-sans/${subset}-${weight}.woff2`;
    const face = firaFaces.find((body) => body.includes(asset));
    assert.ok(face, `Missing Fira Sans ${subset} ${weight} face.`);
    assert.match(face, new RegExp(`font-weight\\s*:\\s*${weight}\\s*;`));
    assert.match(face, /font-display\s*:\s*swap\s*;/);
    assert.match(face, /unicode-range\s*:/);
    const font = readFileSync(resolve(dist, asset.slice(1)));
    assert.equal(font.subarray(0, 4).toString('ascii'), 'wOF2', `WOFF2 signature: ${asset}`);
    assert.ok(fontSources.includes(`\`${subset}-${weight}.woff2\` — https://fonts.gstatic.com`), `Source URL: ${asset}`);
  }
}
assert.match(read('assets/fonts/fira-sans/OFL.txt'), /SIL OPEN FONT LICENSE Version 1\.1/);
for (const path of allHtmlPaths) {
  const html = read(path);
  assert.doesNotMatch(html, /https?:\/\/fonts\.(?:googleapis|gstatic)\.com/i, `HTML must not depend on Google Fonts: ${path}`);
  const fontPreloads = [...html.matchAll(/<link\b(?=[^>]*\brel="preload")(?=[^>]*\bas="font")[^>]*>/gi)].map((match) => match[0]);
  assert.equal(fontPreloads.length, 1, `Exactly one font preload: ${path}`);
  assert.match(fontPreloads[0], /href="\/assets\/fonts\/fira-sans\/latin-400\.woff2"/);
  assert.match(fontPreloads[0], /type="font\/woff2"/);
  assert.match(fontPreloads[0], /\bcrossorigin(?:\s|=|\/|>)/i);
}

const robots = read('robots.txt');
assert.equal(robots, 'User-agent: *\nAllow: /\nSitemap: https://dondeaprendoaws.com/sitemap.xml\n');

assert.ok(existsSync(resolve(dist, 'assets/analytics.js')), 'Analytics module must be deployed.');
for (const path of pagePaths) {
  const html = read(path);
  const analyticsTags = [...html.matchAll(/<script\b[^>]*\bsrc="\/assets\/analytics\.js"[^>]*>/g)];
  assert.equal(analyticsTags.length, production ? 1 : 0, `Analytics tag count: ${path}`);
  assert.equal(html.includes('<meta name="robots" content="noindex, nofollow"'), !production, `Indexing mode: ${path}`);
}

const notFound = read('404.html');
assert.match(notFound, /<meta name="robots" content="noindex, nofollow"/);
const home = read('index.html');
for (const section of sections) assert.match(home, new RegExp(`href="/${section}/"`));
assert.match(home, /id="legacy-resource-routes"/);
assert.doesNotMatch(home, /<li id="resource-/, 'Home should not contain the full directory.');
assert.doesNotMatch(home, /data-event-list/, 'Home should not contain the full event agenda.');
assert.match(home, /href="\/recorridos\/"/);
const learning = read('recorridos/index.html');
for (const id of ['primeros-pasos', 'serverless', 'seguridad', 'ia-generativa']) {
  assert.match(learning, new RegExp(`id="${id}"`));
}
assert.match(learning, /href="\/blog\/aws-fundamentos-guia-de-inicio-rapido\/"/);
const learningMain = learning.match(/<main class="learning-paths[^>]*">([\s\S]*?)<\/main>/)?.[1] ?? '';
assert.doesNotMatch(learningMain, /href="https?:\/\//, 'Learning paths should point to existing internal destinations.');
const searchPage = read('buscar/index.html');
assert.match(searchPage, /data-unified-search/);
assert.match(searchPage, /data-search-status/);
assert.match(searchPage, /data-search-results/);
assert.doesNotMatch(searchPage, /name="query"/, 'Search text must not be submitted in a URL.');
const searchIndex = JSON.parse(read('search-index.json'));
assert.equal(searchIndex.filter((entry) => entry.type === 'article').length, routes.length);
assert.equal(searchIndex.filter((entry) => entry.type === 'path').length, 4);
assert.ok(searchIndex.every((entry) => /^\/(?:blog|aprender|recorridos|creadores|comunidades|eventos)\//.test(entry.url)));
assert.doesNotMatch(JSON.stringify(searchIndex), /submitterEmail|submitterName|contactEmail/);

for (const [section, expectedKind] of [['aprender', 'content'], ['creadores', 'source'], ['comunidades', 'community']]) {
  const directory = read(`${section}/index.html`);
  assert.match(directory, /data-resource-search/);
  assert.match(directory, /data-format-filter/);
  assert.match(directory, /data-sort-filter/);
  assert.match(directory, /data-show-more/);
  assert.match(directory, new RegExp(`data-kind="${expectedKind}"`));
  for (const kind of ['content', 'source', 'community'].filter((kind) => kind !== expectedKind)) {
    assert.doesNotMatch(directory, new RegExp(`data-kind="${kind}"`), `Unexpected ${kind} in ${section}`);
  }
}
if (process.env.CATALOG_FIXTURE) {
  const learn = read('aprender/index.html');
  assert.match(learn, /https:\/\/example\.com\/curso\?utm_source=fixture&amp;lang=es/);
  assert.match(learn, /href="\/creadores\/#resource-fixture-source"/);
  assert.match(learn, /href="\/comunidades\/#resource-fixture-community"/);
  const communities = read('comunidades/index.html');
  assert.match(communities, /href="\/eventos\/\?community=fixture-community"/);
  assert.match(communities, /mailto:contact@dondeaprendoaws\.com\?subject=[^"\s]+fixture-community/);
}
const events = read('eventos/index.html');
assert.match(events, /data-event-list/);
assert.match(events, /data-event-empty/);
for (const field of ['from', 'to', 'mode', 'country', 'community', 'city']) assert.match(events, new RegExp(`data-event-${field}`));
if (process.env.CATALOG_FIXTURE) {
  assert.match(events, /data-event-city="PE:Lima"/);
  assert.match(events, /data-event-communities="fixture-community"/);
  assert.match(events, /href="\/comunidades\/#resource-fixture-community"/);
  assert.match(events, /href="\/eventos\/fixture-event\.ics"/);
  assert.match(events, /mailto:contact@dondeaprendoaws\.com\?subject=[^"\s]+fixture-event/);
  const calendar = read('eventos/fixture-event.ics');
  assert.match(calendar, /DTSTART:20990101T230000Z\r\nDTEND:20990102T010000Z/);
  assert.match(calendar, /URL:https:\/\/example\.com\/encuentro\?source=fixture/);
}
console.log(`Verified ${production ? 'production' : 'preview'} indexing, learning paths, unified search, Analytics tags, and 204 sitemap URLs.`);

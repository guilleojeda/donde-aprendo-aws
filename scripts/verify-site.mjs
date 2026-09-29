import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const production = process.env.PUBLIC_PRODUCTION === 'true';
const dist = resolve('dist');
const routes = JSON.parse(readFileSync('tests/fixtures/blog-routes.json', 'utf8'));
const sections = ['aprender', 'creadores', 'comunidades', 'eventos'];
const pagePaths = ['index.html', ...sections.map((section) => `${section}/index.html`), 'recorridos/index.html', 'blog/index.html', 'buscar/index.html',
  ...routes.map(({ slug }) => `blog/${slug}/index.html`)];
const read = (path) => readFileSync(resolve(dist, path), 'utf8');

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

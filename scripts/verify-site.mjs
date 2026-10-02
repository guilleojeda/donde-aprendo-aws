import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import deployment from '../config/deployment.json' with { type: 'json' };

const production = process.env.PUBLIC_PRODUCTION === 'true';
const mediaOrigin = new URL(process.env.PUBLIC_SITE_ORIGIN || `https://${deployment.branchName}.${deployment.appId}.amplifyapp.com`).origin;
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
const sitemapEntries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, entry]) => {
  const locs = [...entry.matchAll(/<loc>([^<]+)<\/loc>/g)];
  const lastmods = [...entry.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)];
  assert.equal(locs.length, 1, 'Each sitemap entry must have exactly one location.');
  assert.ok(lastmods.length <= 1, `Duplicate sitemap lastmod: ${locs[0][1]}`);
  return [locs[0][1], lastmods[0]?.[1]];
});
assert.equal(sitemapEntries.length, locations.length, 'Every sitemap location must belong to a URL entry.');
const sitemapLastmods = new Map(sitemapEntries);
const expectedLocations = [
  'https://dondeaprendoaws.com/',
  ...sections.map((section) => `https://dondeaprendoaws.com/${section}/`),
  'https://dondeaprendoaws.com/blog/',
  'https://dondeaprendoaws.com/recorridos/',
  ...routes.map(({ slug }) => `https://dondeaprendoaws.com/blog/${slug}/`),
].sort();
assert.deepEqual([...locations].sort(), expectedLocations);
assert.equal(new Set(locations).size, 203, 'Sitemap URLs must be unique.');

const allDistFiles = filesUnder(dist);
const allHtmlPaths = allDistFiles.filter((path) => path.endsWith('.html')).map((path) => relative(dist, path).replaceAll('\\', '/'));
assert.equal(allHtmlPaths.length, 205, 'Every public page and the 404 page must be checked.');

const decode = (value) => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const defaultSocialImage = readFileSync(resolve(dist, 'assets/site-social.png'));
assert.deepEqual(defaultSocialImage.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'The default social image must be a PNG.');
assert.equal(defaultSocialImage.readUInt32BE(16), 1200, 'Default social image width.');
assert.equal(defaultSocialImage.readUInt32BE(20), 630, 'Default social image height.');
let sitemapModificationDates = 0;
for (const path of allHtmlPaths) {
  const html = read(path);
  const metadata = new Map();
  for (const [, attributes] of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const name = attributes.match(/\b(?:property|name)="([^"]+)"/)?.[1];
    if (!name) continue;
    assert.ok(!metadata.has(name), `Duplicate metadata ${name}: ${path}`);
    metadata.set(name, decode(attributes.match(/\bcontent="([^"]*)"/)?.[1] ?? ''));
  }
  const expectedRobots = !production || path === '404.html'
    ? 'noindex, nofollow'
    : path === 'buscar/index.html' ? 'noindex, follow' : undefined;
  assert.equal(metadata.get('robots'), expectedRobots, `Indexing and link-following mode: ${path}`);
  const article = path.startsWith('blog/') && path !== 'blog/index.html';
  assert.equal(metadata.get('og:type'), article ? 'article' : 'website', `Open Graph type: ${path}`);
  assert.equal(metadata.get('og:site_name'), '¿Dónde Aprendo AWS?', `Site identity: ${path}`);
  assert.equal(metadata.get('twitter:card'), 'summary_large_image', `Social card: ${path}`);
  assert.equal(metadata.get('og:title'), decode(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ''), `Open Graph title: ${path}`);
  assert.equal(metadata.get('og:description'), metadata.get('description'), `Open Graph description: ${path}`);
  const imageUrl = new URL(metadata.get('og:image'));
  assert.equal(imageUrl.origin, mediaOrigin, `Owned social image origin: ${path}`);
  assert.ok(existsSync(resolve(dist, `.${imageUrl.pathname}`)), `Social image file: ${path}`);
  if (!article) assert.equal(imageUrl.pathname, '/assets/site-social.png', `Default social image: ${path}`);
  assert.ok(metadata.get('og:image:alt')?.trim(), `Image alternative: ${path}`);
  assert.doesNotMatch(metadata.get('og:image:alt'), /^Thumbnail for:/, `Descriptive image alternative: ${path}`);
  assert.equal(metadata.get('twitter:image'), imageUrl.href, `Matching social images: ${path}`);
  assert.equal(metadata.get('twitter:image:alt'), metadata.get('og:image:alt'), `Matching image alternatives: ${path}`);
  if (article) assert.match(metadata.get('article:published_time'), /^\d{4}-\d{2}-\d{2}T/, `Article publication time: ${path}`);
  if (path === 'buscar/index.html') {
    assert.ok(!sitemapLastmods.has(metadata.get('og:url')), 'The search utility must not be in the sitemap.');
  } else if (path !== '404.html') {
    const canonical = metadata.get('og:url');
    assert.ok(sitemapLastmods.has(canonical), `Page must be represented in the sitemap: ${path}`);
    const expectedLastmod = article ? metadata.get('article:modified_time') : undefined;
    assert.equal(sitemapLastmods.get(canonical), expectedLastmod, `Only declared significant modifications belong in sitemap lastmod: ${path}`);
    if (expectedLastmod) sitemapModificationDates++;
  }
}

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
}

const notFound = read('404.html');
assert.match(notFound, /<meta name="robots" content="noindex, nofollow"/);
const home = read('index.html');
assert.match(home, /<title>Dónde Aprendo AWS: recursos y comunidades en español<\/title>/);
assert.match(home, /Encontrá cursos, videos, creadores y comunidades para aprender AWS en español\. Explorá recorridos de aprendizaje y próximos eventos\./);
assert.match(read('blog/index.html'), /<title>Guías y tutoriales AWS en español \| Dónde Aprendo AWS<\/title>/);
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
  assert.match(directory, /id="directory-criteria"/);
  assert.match(directory, /Recomendado/);
  assert.match(directory, /selección editorial/);
  assert.match(directory, /Autor o fuente/);
  assert.match(directory, /Nivel\.<\/strong>/);
  assert.match(directory, /Agregado al directorio\.<\/strong>/);
  assert.match(directory, /Enlace comprobado<\/strong>/);
  assert.match(directory, /Contenido revisado<\/strong>/);
  assert.doesNotMatch(directory, /Enlace comprobado<\/strong>[^<]*\d{4}/);
  assert.doesNotMatch(directory, /Contenido revisado<\/strong>[^<]*\d{4}/);
  for (const kind of ['content', 'source', 'community'].filter((kind) => kind !== expectedKind)) {
    assert.doesNotMatch(directory, new RegExp(`data-kind="${kind}"`), `Unexpected ${kind} in ${section}`);
  }
}
if (process.env.CATALOG_FIXTURE) {
  const learn = read('aprender/index.html');
  const creators = read('creadores/index.html');
  const communities = read('comunidades/index.html');
  const card = (html, id) => html.match(new RegExp(`<li id="resource-${id}"[\\s\\S]*?<\\/li>`))?.[0] ?? '';
  const featuredCard = card(learn, 'fixture-featured');
  const sourceCard = card(creators, 'fixture-source');
  const communityCard = card(communities, 'fixture-community');
  assert.match(learn, /https:\/\/example\.com\/curso\?utm_source=fixture&amp;lang=es/);
  assert.match(learn, /href="\/creadores\/#resource-fixture-source"/);
  assert.match(learn, /href="\/comunidades\/#resource-fixture-community"/);
  assert.match(featuredCard, /<time datetime="2026-09-25">25 de septiembre de 2026<\/time>/);
  assert.match(featuredCard, /Agregado al directorio/);
  assert.match(featuredCard, /href="#directory-criteria"[^>]*>Recomendado<\/a>/);
  assert.match(featuredCard, /data-search="[^"]*Canal de ejemplo/);
  assert.match(featuredCard, /Autor o fuente: Canal de ejemplo/);
  assert.match(sourceCard, /href="#directory-criteria"[^>]*>Recomendado<\/a>/);
  assert.doesNotMatch(sourceCard, /<time\b/);
  assert.doesNotMatch(sourceCard, /Agregado al directorio/);
  assert.doesNotMatch(communityCard, /<time\b/);
  assert.doesNotMatch(communityCard, /Agregado al directorio/);
  assert.doesNotMatch(communityCard, /Recomendado/);
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
console.log(`Verified ${production ? 'production' : 'preview'} indexing, learning paths, unified search, Analytics tags, 203 sitemap URLs, and ${sitemapModificationDates} declared sitemap modification dates.`);

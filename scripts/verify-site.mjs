import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import deployment from '../config/deployment.json' with { type: 'json' };
import { COUNTRY_SLUGS } from '../src/lib/community-country-pages.mjs';
import { COUNTRY_LABELS } from '../src/lib/resource-discovery.mjs';
import { RESOURCE_COLLECTIONS, learningCollectionNavigation, resourceCollectionResources, groupCertificationResources, resolveResourceCollectionFaq } from '../src/lib/resource-collections.mjs';
import { sortResources } from '../src/lib/directory-filter.mjs';
import { communityFaqItems, eventFaqItems } from '../src/lib/page-faq-content.mjs';
import { EVENT_COLLECTIONS } from '../src/lib/event-collections.mjs';
import { LEARNING_PATHS, learningPathHref } from '../src/lib/learning-paths.mjs';

const production = process.env.PUBLIC_PRODUCTION === 'true';
const mediaOrigin = new URL(process.env.PUBLIC_SITE_ORIGIN || `https://${deployment.branchName}.${deployment.appId}.amplifyapp.com`).origin;
const dist = resolve('dist');
const routes = JSON.parse(readFileSync('tests/fixtures/blog-routes.json', 'utf8'));
const sections = ['aprender', 'creadores', 'comunidades', 'eventos'];
const read = (path) => readFileSync(resolve(dist, path), 'utf8');
const fixtureBuild = read('comunidades/index.html').includes('id="resource-fixture-community"');
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
const allDistFiles = filesUnder(dist);
const allHtmlPaths = allDistFiles.filter((path) => path.endsWith('.html')).map((path) => relative(dist, path).replaceAll('\\', '/'));
const collections = [...RESOURCE_COLLECTIONS, ...Object.values(EVENT_COLLECTIONS)];
const collectionHtmlPaths = collections.map(({ path }) => `${path.slice(1)}index.html`);
const learningDetailPaths = LEARNING_PATHS.map(({ id }) => `${learningPathHref(id).slice(1)}index.html`);
const isCountryRoute = (path, section) => new RegExp(`^${section}/[^/]+/index\\.html$`, 'u').test(path) && !collectionHtmlPaths.includes(path);
const communityCountryRoutePaths = allHtmlPaths.filter((path) => isCountryRoute(path, 'comunidades'));
const eventCountryRoutePaths = allHtmlPaths.filter((path) => isCountryRoute(path, 'eventos'));
const resourceDirectoryPaths = [
  'aprender/index.html', 'creadores/index.html', 'comunidades/index.html', ...communityCountryRoutePaths,
  ...RESOURCE_COLLECTIONS.map(({ path }) => `${path.slice(1)}index.html`),
];
const routeCountries = (paths, section) => paths.map((htmlPath) => {
  const slug = htmlPath.split('/')[1];
  const country = Object.entries(COUNTRY_SLUGS).find(([, countrySlug]) => countrySlug === slug)?.[0];
  assert.ok(country, `Country route must use a registered slug: ${htmlPath}`);
  return { country, slug, htmlPath, path: `/${section}/${slug}/` };
});
const countryRoutes = routeCountries(communityCountryRoutePaths, 'comunidades');
const eventCountryRoutes = routeCountries(eventCountryRoutePaths, 'eventos');
const pagePaths = ['index.html', ...sections.map((section) => `${section}/index.html`), 'recorridos/index.html', 'blog/index.html', 'buscar/index.html',
  ...routes.map(({ slug }) => `blog/${slug}/index.html`), ...communityCountryRoutePaths, ...eventCountryRoutePaths, ...collectionHtmlPaths, ...learningDetailPaths];
const expectedLocations = [
  'https://dondeaprendoaws.com/',
  ...sections.map((section) => `https://dondeaprendoaws.com/${section}/`),
  ...countryRoutes.map(({ path }) => `https://dondeaprendoaws.com${path}`),
  ...eventCountryRoutes.map(({ path }) => `https://dondeaprendoaws.com${path}`),
  'https://dondeaprendoaws.com/blog/',
  'https://dondeaprendoaws.com/recorridos/',
  ...collections.map(({ path }) => `https://dondeaprendoaws.com${path}`),
  ...LEARNING_PATHS.map(({ id }) => `https://dondeaprendoaws.com${learningPathHref(id)}`),
  ...routes.map(({ slug }) => `https://dondeaprendoaws.com/blog/${slug}/`),
].sort();
assert.deepEqual([...locations].sort(), expectedLocations);
assert.deepEqual(eventCountryRoutes.map(({ country }) => country).sort(), countryRoutes.map(({ country }) => country).sort(),
  'Event country routes match the countries with published communities.');
assert.equal(new Set(locations).size, expectedLocations.length, 'Sitemap URLs must be unique.');
assert.deepEqual([...allHtmlPaths].sort(), [...pagePaths, '404.html'].sort(), 'Every generated HTML page must be checked, with no unexpected event detail routes.');
for (const path of resourceDirectoryPaths) {
  const size = statSync(resolve(dist, path)).size;
  assert.ok(size <= 2_000_000, `Resource directory HTML must stay within 2,000,000 bytes: ${path} is ${size.toLocaleString('en')} bytes.`);
}

const decode = (value) => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
const hasHtmlAttribute = (attributes, name) => new RegExp(`(?:^|\\s)${name}(?=\\s|=|$)`, 'iu').test(attributes);
const htmlElementsWithAttribute = (source, attributeName, expectedTagName) => {
  const matches = [];
  for (const match of source.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/giu)) {
    const [, tagName, attributes] = match;
    if (expectedTagName && tagName.toLowerCase() !== expectedTagName) continue;
    if (!hasHtmlAttribute(attributes, attributeName)) continue;

    const tagBoundary = new RegExp(`<\\/?${tagName}(?=[\\s>])[^>]*>`, 'giu');
    const contentStart = match.index + match[0].length;
    tagBoundary.lastIndex = contentStart;
    let depth = 1;
    let token;
    while ((token = tagBoundary.exec(source))) {
      if (token[0].startsWith('</')) depth -= 1;
      else if (!token[0].endsWith('/>')) depth += 1;
      if (depth === 0) {
        matches.push({ attributes, content: source.slice(contentStart, token.index) });
        break;
      }
    }
  }
  return matches;
};
const defaultSocialImage = readFileSync(resolve(dist, 'assets/site-social.png'));
assert.deepEqual(defaultSocialImage.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'The default social image must be a PNG.');
assert.equal(defaultSocialImage.readUInt32BE(16), 1200, 'Default social image width.');
assert.equal(defaultSocialImage.readUInt32BE(20), 630, 'Default social image height.');
let sitemapModificationDates = 0;
for (const path of allHtmlPaths) {
  const html = read(path);
  assert.match(html, /class="skip-link" href="#contenido"/, `Keyboard bypass: ${path}`);
  assert.match(html, /<main\b[^>]*id="contenido"[^>]*tabindex="-1"/, `Focusable main target: ${path}`);
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
assert.match(home, /<title>Aprende AWS en español \| ¿Dónde Aprendo AWS\?<\/title>/);
assert.match(home, /Encuentra recursos, rutas de aprendizaje, comunidades y próximos eventos para aprender AWS en español\./);
assert.match(read('blog/index.html'), /<title>Guías y tutoriales AWS en español \| Dónde Aprendo AWS<\/title>/);
for (const section of sections) assert.match(home, new RegExp(`href="/${section}/"`));
assert.match(home, /id="legacy-resource-routes"/);
assert.doesNotMatch(home, /<li id="resource-/, 'Home should not contain the full directory.');
assert.doesNotMatch(home, /data-event-list/, 'Home should not contain the full event agenda.');
assert.match(home, /href="\/recorridos\/"/);
const learning = read('recorridos/index.html');
for (const id of ['primeros-pasos', 'serverless', 'seguridad', 'ia-generativa']) {
  assert.match(learning, new RegExp(`id="${id}"`));
  assert.ok(learning.includes(`href="${learningPathHref(id)}"`));
  const detail = read(`recorridos/${id}/index.html`);
  assert.match(detail, /<ol>/u);
  assert.ok([...detail.matchAll(/class="learning-path-detail__step"/gu)].length >= 2, `${id} has a usable sequence.`);
  assert.ok(detail.includes(`href="https://dondeaprendoaws.com${learningPathHref(id)}"`));
  assert.ok(detail.includes(`href="${LEARNING_PATHS.find((path) => path.id === id).relatedCollection.href}"`), `${id} links to its matching resource collection.`);
}
assert.match(read('recorridos/primeros-pasos/index.html'), /href="\/blog\/aws-fundamentos-guia-de-inicio-rapido\/"/);
const learningMain = learning.match(/<main\b[^>]*class="learning-paths[^\"]*"[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
assert.ok(learningMain, 'Learning-path main must be located before checking its links.');
assert.doesNotMatch(learningMain, /href="https?:\/\//, 'Learning paths should point to existing internal destinations.');
const searchPage = read('buscar/index.html');
assert.match(searchPage, /data-unified-search/);
assert.match(searchPage, /data-search-status/);
assert.match(searchPage, /data-search-results/);
assert.doesNotMatch(searchPage, /name="query"/, 'Search text must not be submitted in a URL.');
const searchIndex = JSON.parse(read('search-index.json'));
assert.equal(searchIndex.filter((entry) => entry.type === 'article').length, routes.length);
assert.equal(searchIndex.filter((entry) => entry.type === 'path').length, 4);
for (const { id } of LEARNING_PATHS) assert.ok(searchIndex.some((entry) => entry.type === 'path' && entry.url === learningPathHref(id)));
for (const { path } of collections) assert.ok(searchIndex.some((entry) => entry.type === 'collection' && entry.url === path), `Collection discoverability: ${path}`);
assert.ok(searchIndex.every((entry) => /^\/(?:blog|aprender|recorridos|creadores|comunidades|eventos)\//.test(entry.url)));
assert.doesNotMatch(JSON.stringify(searchIndex), /submitterEmail|submitterName|contactEmail/);

for (const [section, expectedKind] of [['aprender', 'content'], ['creadores', 'source'], ['comunidades', 'community']]) {
  const directory = read(`${section}/index.html`);
  assert.match(directory, /data-resource-search/);
  assert.match(directory, /data-format-filter/);
  assert.match(directory, /data-sort-filter/);
  assert.match(directory, /data-show-more/);
  const listAttributes = directory.match(/<ul\b(?=[^>]*\bdata-resource-list\b)([^>]*)>/u)?.[1] ?? '';
  assert.match(listAttributes, new RegExp(`\\bdata-kind="${expectedKind}"`), `The directory list declares its invariant kind: ${section}`);
  assert.doesNotMatch(directory, /\bdata-search=/u, 'Search text is reconstructed from existing static card content.');
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
    assert.doesNotMatch(listAttributes, new RegExp(`\\bdata-kind="${kind}"`), `Unexpected ${kind} in ${section}`);
  }
}

const cardData = (html) => {
  const listAttributes = html.match(/<ul\b(?=[^>]*\bdata-resource-list\b)([^>]*)>/u)?.[1] ?? '';
  const kind = listAttributes.match(/\bdata-kind="([^"]*)"/u)?.[1] ?? '';
  return [...html.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gu)].flatMap(([, attributes, body]) => {
    const id = attributes.match(/\bid="resource-([^" ]+)"/u)?.[1];
    if (!id || !kind) return [];
    const mainLink = body.match(/<a\b[^>]*class="resource-card__main-link"[^>]*>/u)?.[0] ?? '';
    const metadata = body.match(/<div class="resource-card__meta">([\s\S]*?)<\/div>/u)?.[1] ?? '';
    return [{
      id,
      kind,
      url: decode(mainLink.match(/\bhref="([^"]*)"/u)?.[1] ?? ''),
      title: decode(body.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/u)?.[1] ?? ''),
      description: decode(body.match(/<p class="resource-card__description">([\s\S]*?)<\/p>/u)?.[1] ?? ''),
      country: attributes.match(/\bdata-country="([^"]*)"/u)?.[1] ?? '',
      format: decode(metadata.match(/<span>([\s\S]*?)<\/span>/u)?.[1] ?? ''),
      topics: (attributes.match(/\bdata-topics="([^"]*)"/u)?.[1] ?? '').split('|').filter(Boolean),
      featured: attributes.match(/\bdata-featured="true"/u) !== null,
      addedAt: body.match(/<time\b[^>]*\bdatetime="([^"]*)"/u)?.[1] ?? '',
      directoryIndex: Number(attributes.match(/\bdata-resource-index="([^"]*)"/u)?.[1]),
    }];
  });
};
const verifyFaq = (html, items, page) => {
  assert.match(html, /class="page-faq"/u, `Visible FAQ section: ${page}`);
  const text = decode(html);
  for (const { question, answer, links = [] } of items) {
    assert.ok(text.includes(question), `FAQ question appears in static HTML: ${page}: ${question}`);
    assert.ok(text.includes(answer), `FAQ answer appears in static HTML: ${page}: ${question}`);
    for (const { href } of links) assert.ok(text.includes(`href="${href}"`), `FAQ source or destination link: ${page}: ${href}`);
  }
  assert.doesNotMatch(html, /"@type"\s*:\s*"FAQPage"/u, `The visible questions do not claim FAQ rich-result support: ${page}`);
};
const generalCommunities = cardData(read('comunidades/index.html')).filter(({ kind }) => kind === 'community');
const globalCards = [...cardData(read('aprender/index.html')), ...cardData(read('creadores/index.html')), ...generalCommunities];
for (const collection of RESOURCE_COLLECTIONS) {
  const html = read(`${collection.path.slice(1)}index.html`);
  const learningNavigation = collection.kind === 'content' ? learningCollectionNavigation(collection.path) : undefined;
  if (learningNavigation) {
    const navMatch = html.match(/<nav class="collection-navigation collection-navigation--learning"[^>]*>([\s\S]*?)<\/nav>/u);
    const nav = navMatch?.[1];
    assert.ok(navMatch, `Compact learning navigation exists: ${collection.path}`);
    assert.match(navMatch[0], /aria-label="Navegación de recursos para aprender"/u);
    assert.match(nav, /<details class="collection-navigation__details">/u, 'The topic disclosure starts closed and uses native details.');
    assert.match(nav, /<summary class="collection-navigation__trigger">/u, 'The topic disclosure has a keyboard-operable summary.');
    assert.doesNotMatch(nav, /collection-navigation__details"[^>]*\bopen\b/u, 'The topic menu does not cover results initially.');
    for (const link of [...learningNavigation.formats, ...learningNavigation.topics]) {
      assert.ok(nav.includes(`href="${link.path}"`), `No-JavaScript navigation link is present: ${link.path}`);
      if (link.path === collection.path) assert.ok(nav.includes(`href="${link.path}" aria-current="page"`), `Current collection is announced: ${link.path}`);
      else assert.ok(!nav.includes(`href="${link.path}" aria-current="page"`), `Other collections are not marked current: ${link.path}`);
    }
    if (learningNavigation.activeTopic) {
      assert.ok(nav.includes(`class="collection-navigation__active-topic">${learningNavigation.activeTopic}</span>`),
        `The closed topic menu shows the current selection: ${collection.path}`);
    }
  }
  const scopedCards = resourceCollectionResources(collection, sortResources(globalCards, 'directory'));
  const purposeGroups = collection.id === 'certificaciones' ? groupCertificationResources(scopedCards) : [];
  const expected = (collection.id === 'certificaciones'
    ? purposeGroups.flatMap(({ resources }) => sortResources(resources, 'purpose'))
    : sortResources(scopedCards, 'recommended')).map(({ id }) => id);
  assert.deepEqual(cardData(html).map(({ id }) => id), expected, `Exact initial HTML subset: ${collection.path}`);
  assert.equal(new Set(expected).size, expected.length, `Every collection resource appears once: ${collection.path}`);
  if (collection.id === 'certificaciones') {
    const visiblePurposeGroups = purposeGroups.filter(({ resources: groupResources }) => groupResources.length > 0);
    assert.equal([...html.matchAll(/\bdata-resource-group-heading(?:\s|>)/gu)].length, visiblePurposeGroups.length, 'Certification purposes have one contiguous heading each.');
    const groupSelect = html.match(/<select\b[^>]*\bdata-group-filter[^>]*>([\s\S]*?)<\/select>/u)?.[1];
    const expectedOptions = purposeGroups.filter(({ filterResources }) => filterResources.length > 0)
      .map(({ id, label }) => ({ id, label }));
    if (expectedOptions.length) {
      assert.ok(groupSelect, 'Certification purpose filtering remains visible outside secondary filters.');
      const groupControlIndex = html.indexOf('data-group-filter');
      const secondaryFiltersIndex = html.indexOf('data-filter-disclosure');
      assert.ok(groupControlIndex >= 0 && (secondaryFiltersIndex < 0 || groupControlIndex < secondaryFiltersIndex), 'The exam selector stays outside secondary filters.');
      const primaryRow = html.match(/<div class="directory-controls__primary-row">([\s\S]*?)<\/div>\s*<\/div>/u)?.[1] ?? '';
      assert.ok(primaryRow.includes('data-group-filter') && primaryRow.includes('data-sort-filter'),
        'The exam selector and sort control share the primary control row.');
      assert.ok(primaryRow.indexOf('data-group-filter') < primaryRow.indexOf('data-sort-filter'),
        'Sorting follows the exam selector in the shared row.');
      assert.equal([...html.matchAll(/\bdata-sort-filter\b/gu)].length, 1, 'Certification pages render one sort control.');
      assert.match(html, /class="directory-list-heading">\s*<p class="directory-result-count"[^>]*data-result-count/u,
        'The result counter remains in the results heading after moving sorting.');
      const actualOptions = [...groupSelect.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/gu)]
        .filter(([, id]) => id)
        .map(([, id, label]) => ({ id, label: decode(label) }));
      assert.deepEqual(actualOptions, expectedOptions, 'Exam options include mixed-only filter groups without adding result headings.');
    } else {
      assert.equal(groupSelect, undefined, 'Empty certification catalogs omit both group options and the selector.');
    }
    if (expected.length) assert.match(html, /value="purpose" selected/u, 'Certifications initially group materials by study purpose.');
  }
  if (collection.earlyRoute) {
    const callout = html.indexOf('class="collection-route-callout"');
    const controls = html.indexOf('data-directory-controls');
    assert.ok(callout >= 0 && callout < controls, `The learning route is offered before filters: ${collection.path}`);
    assert.ok(html.includes(`href="${collection.earlyRoute.path}"`));
  }
  if (collection.faq) verifyFaq(html, resolveResourceCollectionFaq(collection, globalCards), collection.path);
  assert.equal(decode(html.match(/<h1 id="directory-title">([^<]+)<\/h1>/u)?.[1] ?? ''), collection.title);
  assert.equal(decode(html.match(/<meta\b(?=[^>]*\bname="description")([^>]*)>/u)?.[1]?.match(/\bcontent="([^"]*)"/u)?.[1] ?? ''), collection.description,
    `Page description matches the collection registry: ${collection.path}`);
  assert.ok(html.includes(`href="https://dondeaprendoaws.com${collection.path}"`));
  assert.match(html, /id="collection-guide"/u, `Specific guidance: ${collection.path}`);
  assert.match(html, /class="community-breadcrumb"/u);
  if (collection.selector.format) assert.doesNotMatch(html, /data-format-filter/u, 'A fixed-format collection does not repeat its format filter.');
  if (collection.selector.topic) assert.doesNotMatch(html, /data-topic-filter/u, 'A fixed-topic collection does not repeat its topic filter.');
  if (expected.length) assert.match(html, /data-resource-search/u);
}
const courseCollection = RESOURCE_COLLECTIONS.find(({ id }) => id === 'cursos');
const resolvedCourseFaq = resolveResourceCollectionFaq(courseCollection, globalCards);
const courseCollectionIndex = searchIndex.find(({ type, url }) => type === 'collection' && url === courseCollection.path);
assert.ok(courseCollectionIndex, 'Courses collection is searchable.');
for (const { question, answer } of resolvedCourseFaq) {
  assert.ok(courseCollectionIndex.search.includes(question), `Search indexes the resolved course FAQ question: ${question}`);
  assert.ok(courseCollectionIndex.search.includes(answer), `Search indexes the resolved course FAQ answer: ${question}`);
}
verifyFaq(read('comunidades/index.html'), communityFaqItems(), '/comunidades/');
verifyFaq(read('eventos/index.html'), eventFaqItems(), '/eventos/');
const agendaCards = (html) => [...html.matchAll(/<li\b([^>]*\bdata-event-id="([^"]+)"[^>]*)>([\s\S]*?)<\/li>/gu)]
  .map(([, attributes, id, body]) => ({
    id, body, attributes,
    members: [...body.matchAll(/data-event-member-id="([^"]+)"/gu)].map(([, memberId]) => memberId).sort(),
    mode: attributes.match(/data-event-mode="([^"]+)"/u)?.[1],
    hidden: /(?:^|\s)hidden(?:\s|=|$)/u.test(attributes),
  }));
const agendaSignatures = (cards) => cards.map(({ members }) => members.join('|')).sort();
const globalEventAttributes = agendaCards(read('eventos/index.html'));
for (const collection of Object.values(EVENT_COLLECTIONS)) {
  const html = read(`${collection.path.slice(1)}index.html`);
  const cards = agendaCards(html);
  const visible = cards.filter(({ hidden }) => !hidden);
  assert.deepEqual(agendaSignatures(cards), agendaSignatures(globalEventAttributes),
    `Every collection retains the public catalog for explicit query overrides: ${collection.path}`);
  assert.ok(visible.every(({ mode }) => collection.modes.includes(mode)), `Default attendance SSR members: ${collection.path}`);
  if (fixtureBuild) {
    const expected = collection.path === '/eventos/online/'
      ? ['fixture-past-argentina', 'fixture-past-costa-rica', 'fixture-past-unrecorded', 'fixture-online-event']
      : ['fixture-past-unrecorded', 'fixture-event'];
    assert.deepEqual(visible.map(({ id }) => id), expected, `Default public attendance subset, including history: ${collection.path}`);
  }
  assert.ok(html.includes(`href="https://dondeaprendoaws.com${collection.path}"`));
  assert.match(html, /data-event-empty/u);
  verifyFaq(html, eventFaqItems({ collectionKey: collection.path.includes('/online/') ? 'online' : 'presenciales' }), collection.path);
  for (const route of countryRoutes) assert.ok(searchIndex.some((entry) => entry.url === `/eventos/${route.slug}/`));
}
const directoryCountries = [...new Set(generalCommunities.map(({ country }) => country).filter(Boolean))].sort();
if (directoryCountries.length) assert.match(read('comunidades/index.html'), /data-country-filter/, 'The overall directory retains its legacy country filter.');
else assert.doesNotMatch(read('comunidades/index.html'), /data-country-filter/);
assert.deepEqual(countryRoutes.map(({ country }) => country).sort(), directoryCountries, 'Country routes exactly match published communities with a country.');
const globalCountryNav = read('comunidades/index.html').match(/<nav class="community-country-nav"[^>]*>([\s\S]*?)<\/nav>/u)?.[1] ?? '';
for (const route of countryRoutes) assert.ok(globalCountryNav.includes(`href="${route.path}"`), `The overall directory links to ${route.path}.`);
for (const route of countryRoutes) {
  const html = read(route.htmlPath);
  const countryName = COUNTRY_LABELS[route.country];
  verifyFaq(html, communityFaqItems({ countryName, agendaPath: `/eventos/${route.slug}/` }), route.path);
  const expectedCards = generalCommunities.filter((card) => card.country === route.country);
  const countryCards = cardData(html).filter(({ kind }) => kind === 'community');
  assert.ok(expectedCards.length > 0, `Generated route must have a published country community: ${route.path}`);
  assert.deepEqual(countryCards.map(({ id }) => id), expectedCards.map(({ id }) => id), `Initial HTML contains the exact ${countryName} subset.`);
  assert.ok(countryCards.every(({ country }) => country === route.country), `Country page excludes communities from other countries: ${route.path}`);
  assert.match(html, /data-resource-search/);
  assert.match(html, /data-format-filter/);
  if (expectedCards.some(({ topics }) => topics.length > 0)) assert.match(html, /data-topic-filter/, `${countryName} exposes available topic filters.`);
  else assert.doesNotMatch(html, /data-topic-filter/, `${countryName} does not show an empty topic filter.`);
  assert.match(html, /data-sort-filter/);
  assert.match(html, /data-show-more/);
  assert.match(html, /id="directory-criteria"/);
  assert.doesNotMatch(html, /data-country-filter/, 'A country page does not expose a country filter.');
  assert.match(html, /<nav class="community-breadcrumb" aria-label="Ruta de navegación">/);
  const breadcrumb = html.match(/<nav class="community-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/u)?.[1] ?? '';
  assert.match(breadcrumb, />Inicio</);
  assert.match(breadcrumb, />Comunidades</);
  assert.match(breadcrumb, new RegExp(`aria-current="page">${countryName}</`));
  assert.equal(decode(html.match(/<title>([\s\S]*?)<\/title>/u)?.[1] ?? ''), `Comunidades AWS en ${countryName} | ¿Dónde Aprendo AWS?`);
  assert.equal(html.match(/<link\b(?=[^>]*\brel="canonical")(?=[^>]*\bhref="([^"]+)")[^>]*>/u)?.[1], `https://dondeaprendoaws.com${route.path}`);
  assert.match(html.match(/<meta\b(?=[^>]*\bname="description")([^>]*)>/u)?.[1] ?? '', new RegExp(countryName));
  assert.equal(decode(html.match(/<h1 id="directory-title">([\s\S]*?)<\/h1>/u)?.[1] ?? ''), `Comunidades AWS en ${countryName}`);
  const formatCounts = new Map();
  for (const { format } of expectedCards) formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1);
  const countLabels = {
    'User Group': ['AWS User Group', 'AWS User Groups'],
    'Student Builder Group': ['Student Builder Group', 'Student Builder Groups'],
    'Grupo de estudio': ['grupo de estudio', 'grupos de estudio'],
    'Comunidad en línea': ['comunidad en línea', 'comunidades en línea'],
  };
  for (const [format, count] of formatCounts) assert.ok(html.includes(`${count} ${countLabels[format]?.[count === 1 ? 0 : 1] ?? format}`), `Intro gives the actual ${format} count for ${countryName}.`);
  const countryNav = html.match(/<nav class="community-country-nav"[^>]*>([\s\S]*?)<\/nav>/u)?.[1] ?? '';
  assert.ok(countryNav, `Country navigation exists for ${countryName}.`);
  assert.match(countryNav, new RegExp(`Cambiar de país · ${countryName}`));
  assert.match(countryNav, new RegExp(`href="${route.path.replaceAll('/', '\\/')}" aria-current="page"`));
  for (const otherRoute of countryRoutes) assert.ok(countryNav.includes(`href="${otherRoute.path}"`), `Country navigation links to ${otherRoute.path}.`);
  assert.doesNotMatch(countryNav, /<details[^>]*open/, 'The country menu starts collapsed.');
}

const globalEventCountryNav = read('eventos/index.html').match(/<nav class="community-country-nav"[^>]*>([\s\S]*?)<\/nav>/u)?.[1] ?? '';
for (const route of eventCountryRoutes) assert.ok(globalEventCountryNav.includes(`href="${route.path}"`), `The global agenda links to ${route.path}.`);
for (const route of eventCountryRoutes) {
  const html = read(route.htmlPath);
  const countryName = COUNTRY_LABELS[route.country];
  verifyFaq(html, eventFaqItems({ countryName }), route.path);
  const attendanceIntro = decode(html.match(/<p\b[^>]*data-event-page-intro[^>]*>([\s\S]*?)<\/p>/u)?.[1] ?? '');
  assert.match(attendanceIntro, /presencial/iu, 'A national agenda describes physical attendance at its location.');
  assert.ok(attendanceIntro.includes(countryName), 'The default physical country is explicit in the national introduction.');
  assert.match(attendanceIntro, /online|en línea/iu, 'The national introduction also describes remote participation.');
  assert.doesNotMatch(html, /Comunidades organizadoras en /u,
    'The static country-community block is a directory link, not an assertion about every selected event organizer.');
  const communitiesForCountry = generalCommunities.filter((card) => card.country === route.country);
  const summary = html.match(/<section class="event-country-communities"[^>]*>([\s\S]*?)<\/section>/u)?.[1] ?? '';
  assert.ok(summary, `Country agenda links back to its published communities: ${route.path}`);
  for (const community of communitiesForCountry) assert.ok(summary.includes(`href="${resourceLinkFor(community.id, route.country)}"`));
  assert.match(html, /<h1\b[^>]*>Eventos AWS en [^<]+<\/h1>/u);
  assert.doesNotMatch(html, /no necesariamente el lugar de cada encuentro|99[.,]99/u);
  assert.match(html, /data-event-list/u);
  assert.match(html, /<select\b[^>]*\bdata-event-country(?:\s|=|>)/u, 'A national route exposes its location default as an editable filter.');
  assert.match(html, /data-event-empty/u, 'The page has an initial empty state for when its events expire.');
  const breadcrumb = html.match(/<nav class="community-breadcrumb"[^>]*>([\s\S]*?)<\/nav>/u)?.[1] ?? '';
  assert.match(breadcrumb, />Inicio</u);
  assert.match(breadcrumb, />Eventos</u);
  assert.match(breadcrumb, new RegExp(`aria-current="page">${countryName}</`));
  assert.equal(decode(html.match(/<title>([\s\S]*?)<\/title>/u)?.[1] ?? ''), `Eventos AWS en ${countryName} | ¿Dónde Aprendo AWS?`);
  assert.equal(html.match(/<link\b(?=[^>]*\brel="canonical")(?=[^>]*\bhref="([^"]+)")[^>]*>/u)?.[1], `https://dondeaprendoaws.com${route.path}`);
  const description = decode(html.match(/<meta\b(?=[^>]*\bname="description")([^>]*)>/u)?.[1]?.match(/\bcontent="([^"]*)"/u)?.[1] ?? '');
  assert.match(description, new RegExp(`Eventos AWS en ${countryName}`));
  const countryNav = html.match(/<nav class="community-country-nav"[^>]*>([\s\S]*?)<\/nav>/u)?.[1] ?? '';
  for (const otherRoute of eventCountryRoutes) assert.ok(countryNav.includes(`href="${otherRoute.path}"`), `Country agenda navigation links to ${otherRoute.path}.`);
}

function resourceLinkFor(id, country) {
  const route = countryRoutes.find((item) => item.country === country);
  return `${route?.path ?? '/comunidades/'}#resource-${id}`;
}

if (fixtureBuild) {
  const learn = read('aprender/index.html');
  const creators = read('creadores/index.html');
  const communities = read('comunidades/index.html');
  const card = (html, id) => html.match(new RegExp(`<li id="resource-${id}"[\\s\\S]*?<\\/li>`))?.[0] ?? '';
  const featuredCard = card(learn, 'fixture-featured');
  const sourceCard = card(creators, 'fixture-source');
  const communityCard = card(communities, 'fixture-community');
  assert.deepEqual(countryRoutes.map(({ slug }) => slug).sort(), ['argentina', 'colombia', 'costa-rica', 'peru']);
  assert.deepEqual(cardData(read('comunidades/argentina/index.html')).map(({ id, format }) => [id, format]), [
    ['fixture-community-argentina', 'User Group'],
    ['fixture-student-argentina', 'Student Builder Group'],
  ]);
  assert.deepEqual(cardData(read('comunidades/colombia/index.html')).map(({ id, format }) => [id, format]), [
    ['fixture-student-colombia', 'Student Builder Group'],
  ]);
  assert.deepEqual(cardData(read('comunidades/costa-rica/index.html')).map(({ id, format }) => [id, format]), [
    ['fixture-community-costa-rica', 'User Group'],
  ]);
  assert.match(read('comunidades/colombia/index.html'), /1 Student Builder Group/);
  for (const [slug, countryName] of Object.entries({ colombia: 'Colombia', 'costa-rica': 'Costa Rica', argentina: 'Argentina', peru: 'Perú' })) {
    const html = read(`comunidades/${slug}/index.html`);
    assert.match(html, new RegExp(`href="/eventos/${slug}/"[^>]*>Consultar agenda[^<]*${countryName}`, 'u'),
      'Every country community page retains its native agenda destination, including countries without upcoming physical events.');
    assert.doesNotMatch(html, /eventos organizados por comunidades de/u,
      'The national attendance agenda is not presented as an exclusive organizer-country selection.');
  }
  assert.match(communities, /id="resource-fixture-student-argentina"/);
  assert.doesNotMatch(communities, /fixture-unpublished-community/);
  assert.match(learn, /https:\/\/example\.com\/curso\?utm_source=fixture&amp;lang=es/);
  assert.match(learn, /href="\/creadores\/#resource-fixture-source"/);
  assert.match(learn, /href="\/comunidades\/peru\/#resource-fixture-community"/);
  assert.match(learn, /href="\/comunidades\/#resource-fixture-no-country-community"/);
  assert.match(learn, /href="\/eventos\/#event-fixture-past-costa-rica"/);
  assert.match(learn, /href="\/eventos\/#event-fixture-past-argentina"/);
  assert.equal(searchIndex.find(({ title }) => title === 'Comunidad de ejemplo')?.url, '/comunidades/peru/#resource-fixture-community');
  assert.equal(searchIndex.find(({ title }) => title === 'Comunidad sin país confirmado')?.url, '/comunidades/#resource-fixture-no-country-community');
  assert.match(featuredCard, /<time datetime="2026-09-25">25 de septiembre de 2026<\/time>/);
  assert.match(featuredCard, /Agregado al directorio/);
  assert.match(featuredCard, /href="#directory-criteria"[^>]*>Recomendado<\/a>/);
  assert.deepEqual(cardData(learn).find(({ id }) => id === 'fixture-featured'), {
    id: 'fixture-featured', kind: 'content', url: 'https://example.com/curso?utm_source=fixture&lang=es',
    title: 'Curso de ejemplo', description: 'Descripción pública de ejemplo.', country: 'AR', format: 'Curso',
    topics: [], featured: true, addedAt: '2026-09-25', directoryIndex: 0,
  }, 'Static card content retains its description, exact outbound URL, and searchable metadata.');
  assert.match(featuredCard, /Autor o fuente: Canal de ejemplo/);
  assert.match(sourceCard, /href="#directory-criteria"[^>]*>Recomendado<\/a>/);
  assert.doesNotMatch(sourceCard, /<time\b/);
  assert.doesNotMatch(sourceCard, /Agregado al directorio/);
  assert.doesNotMatch(communityCard, /<time\b/);
  assert.doesNotMatch(communityCard, /Agregado al directorio/);
  assert.doesNotMatch(communityCard, /Recomendado/);
  assert.match(communities, /href="\/eventos\/\?community=fixture-community"/);
  assert.match(communities, /href="\/eventos\/peru\/"[^>]*>Consultar agenda de Perú/);
  const legacyRoutes = JSON.parse(home.match(/<script type="application\/json" id="legacy-resource-routes">([\s\S]*?)<\/script>/u)?.[1] ?? '{}');
  assert.equal(legacyRoutes['fixture-community'], '/comunidades/', 'Old homepage card hashes still route through the full directory.');
  assert.match(communities, /mailto:contact@dondeaprendoaws\.com\?subject=[^"\s]+fixture-community/);
}
const events = read('eventos/index.html');
assert.match(events, /data-event-list/);
assert.match(events, /data-event-empty/);
for (const path of ['eventos/index.html', ...eventCountryRoutes.map(({ htmlPath }) => htmlPath), ...Object.values(EVENT_COLLECTIONS).map(({ path }) => `${path.slice(1)}index.html`)]) {
  const html = read(path);
  const checkbox = [...html.matchAll(/<input\b([^>]*)>/gu)]
    .map(([, attributes]) => attributes).find((attributes) => /\bdata-event-include-ended(?:\s|=|$)/u.test(attributes));
  assert.ok(checkbox, `Every public agenda offers the ended-event checkbox: ${path}`);
  assert.match(checkbox, /\btype="checkbox"/u);
  assert.match(checkbox, /\bchecked(?:\s|=|$)/u, `A fresh HTML document includes ended events: ${path}`);
  assert.match(html, /Incluir eventos finalizados/u);
  assert.match(html, /<h1\b[^>]*\bdata-event-page-heading(?:\s|=|>)/u,
    `The effective selection can update the page heading: ${path}`);
  assert.match(html, /<p\b[^>]*\bdata-event-page-intro(?:\s|=|>)/u,
    `The effective selection can update the page introduction: ${path}`);
  const shareWrapper = htmlElementsWithAttribute(html, 'data-event-share-controls');
  assert.equal(shareWrapper.length, 1, `Every agenda has one share-controls wrapper: ${path}`);
  assert.ok(hasHtmlAttribute(shareWrapper[0]?.attributes ?? '', 'hidden'),
    `Share actions stay inert until their client-generated URLs are ready: ${path}`);
  const shareWrapperContent = shareWrapper[0]?.content ?? '';
  const shareMenus = htmlElementsWithAttribute(shareWrapperContent, 'data-event-share-menu', 'details');
  assert.equal(shareMenus.length, 1, `Every agenda uses a native details menu inside its hidden wrapper: ${path}`);
  const shareMenu = shareMenus[0];
  assert.doesNotMatch(shareMenu?.attributes ?? '', /\brole="menu"/u,
    `The native disclosure does not claim custom ARIA menu behavior: ${path}`);
  assert.doesNotMatch(shareMenu?.content ?? '', /\brole="menuitem"/u,
    `Share actions retain their native anchor and button semantics: ${path}`);
  const summary = shareMenu?.content.match(/<summary\b([^>]*)>([\s\S]*?)<\/summary>/u);
  assert.ok(summary, `Every share menu has a native summary control: ${path}`);
  assert.ok(hasHtmlAttribute(summary[1], 'data-event-share-toggle'));
  assert.equal(decode(summary[2].replace(/<[^>]*>/gu, '')).trim(), 'Compartir');
  const shareLinks = [...shareMenu.content.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gu)]
    .map(([, attributes, content]) => ({
      label: decode(content.replace(/<[^>]*>/gu, '')).trim(),
      attributes,
      href: decode(attributes.match(/\bhref="([^"]*)"/u)?.[1] ?? ''),
    }));
  for (const label of ['X', 'LinkedIn']) {
    const link = shareLinks.find((item) => item.label === label);
    assert.ok(link, `Every share menu offers ${label} as a native anchor: ${path}`);
    assert.match(link.attributes, /\btarget="_blank"/u);
    assert.match(link.attributes, /\brel="[^"]*\bnoopener\b[^"]*"/u);
    assert.match(link.attributes, /\brel="[^"]*\bnoreferrer\b[^"]*"/u);
    assert.ok(link.href, `${label} has a client-ready href attribute: ${path}`);
    assert.doesNotMatch(link.href, /^javascript:/iu, `${label} does not use a JavaScript URL: ${path}`);
  }
  const copyButton = [...shareMenu.content.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gu)]
    .find(([, , content]) => decode(content.replace(/<[^>]*>/gu, '')).trim() === 'Copiar');
  assert.ok(copyButton, `Every share menu offers a Copy button: ${path}`);
  assert.match(copyButton[1], /\btype="button"/u);
  const shareStatuses = htmlElementsWithAttribute(shareWrapperContent, 'data-event-share-status');
  assert.equal(shareStatuses.length, 1, `Every share wrapper has one status region: ${path}`);
  const shareStatus = shareStatuses[0]?.attributes ?? '';
  assert.match(shareStatus, /\brole="status"/u);
  assert.match(shareStatus, /\baria-live="polite"/u);
  assert.doesNotMatch(html, /<(?:textarea|dialog|pre)\b|\brole="dialog"/iu,
    `Sharing does not insert an intermediate text preview or dialog: ${path}`);
  assert.doesNotMatch(html, /Comparte esta selección|Texto listo para copiar|Vista previa de la agenda/iu,
    `The retired share-preview section and copy are absent: ${path}`);
  const secondary = html.match(/<details\b[^>]*\bdata-event-secondary-disclosure[^>]*>([\s\S]*?)<\/details>/u)?.[1] ?? '';
  for (const field of ['mode', 'country', 'city']) {
    const select = [...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gu)]
      .find(([, attrs]) => new RegExp(`\\bdata-event-${field}(?:\\s|=|$)`, 'u').test(attrs));
    assert.ok(select, `Every agenda exposes the ${field} primary control: ${path}`);
    assert.doesNotMatch(secondary, new RegExp(`<select\\b[^>]*\\bdata-event-${field}(?:\\s|=|>)`, 'u'),
      `Attendance and physical location stay outside More filters: ${path}`);
    if (field === 'mode') {
      for (const label of ['Solo online', 'Solo presencial', 'Presencial + online']) {
        assert.ok(select[2].includes(label), `All attendance choices are available: ${label} on ${path}`);
      }
      assert.doesNotMatch(select[2], /<option[^>]*value="hybrid"/u,
        `The exclusive hybrid mode is a query compatibility value, not a fourth primary choice: ${path}`);
    }
  }
  for (const field of ['community', 'zone']) assert.match(secondary, new RegExp(`data-event-${field}`, 'u'));
  assert.doesNotMatch(html, /País de la comunidad organizadora|Ubicación del organizador|Ubicación presencial:|La ubicación limita la asistencia presencial/u,
    `The attendance controls and cards omit superseded organizer-location copy: ${path}`);
  assert.deepEqual(agendaSignatures(agendaCards(html)), agendaSignatures(globalEventAttributes),
    `Explicit query selection is not limited to a hidden route subset: ${path}`);

  const viewButtons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gu)];
  for (const [view, label] of [['week', 'Semana'], ['month', 'Mes']]) {
    const matches = viewButtons.filter(([, attributes]) => attributes.includes(`data-event-view="${view}"`));
    assert.equal(matches.length, 1, `Every agenda offers one ${label} view: ${path}`);
    const button = matches[0];
    assert.ok(button, `Every agenda offers the ${label} view: ${path}`);
    assert.match(button[1], /\btype="button"/u);
    assert.match(button[1], /\baria-pressed="(?:true|false)"/u, `The view has an accessible selected state: ${path}`);
    assert.equal(decode(button[2].replace(/<[^>]*>/gu, '')).trim(), label);
  }
  for (const [direction, accessibleName] of [['prev', /anterior/iu], ['next', /siguiente/iu]]) {
    const button = viewButtons.find(([, attributes]) => new RegExp(`\\bdata-event-period-${direction}(?:\\s|=|$)`, 'u').test(attributes));
    assert.ok(button, `Every agenda can navigate to the ${direction} period: ${path}`);
    assert.match(button[1], /\btype="button"/u);
    const label = button[1].match(/\baria-label="([^"]+)"/u)?.[1]
      ?? button[2].replace(/<[^>]*>/gu, '');
    assert.match(decode(label), accessibleName, `Period arrows have an accessible name: ${path}`);
  }
  assert.match(html, /data-event-period-label(?:\s|=|>)/u, `The consulted period has a visible label: ${path}`);
  const zoneControl = [...html.matchAll(/<(?:select|input)\b([^>]*)>/gu)]
    .find(([, attributes]) => /\bdata-event-zone(?:\s|=|$)/u.test(attributes));
  assert.ok(zoneControl, `Every agenda exposes its IANA time-zone control: ${path}`);
  const zoneId = zoneControl[1].match(/(?:^|\s)id="([^"]+)"/u)?.[1];
  assert.ok(zoneId, `The time-zone control has an ID for its label: ${path}`);
  assert.ok([...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gu)]
    .some(([, attributes, content]) => attributes.includes(`for="${zoneId}"`) && /zona horaria/iu.test(content)),
  `The time-zone control has a visible label: ${path}`);
  for (const [, memberAttributes, content] of html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/gu)) {
    if (!/\bdata-event-member-id=/u.test(memberAttributes)) continue;
    assert.match(memberAttributes, /\bdata-member-title="[^"]+"/u,
      `Each member exposes its title to the shared text model: ${path}`);
    assert.match(memberAttributes, /\bdata-member-registration-url="https?:\/\/[^"]+"/u,
      `Each member exposes its original registration URL to the shared text model: ${path}`);
    const shareTitle = decode(memberAttributes.match(/\bdata-member-title="([^"]*)"/u)?.[1] ?? '');
    const visibleTitle = decode(content.match(/<h4\b[^>]*>([\s\S]*?)<\/h4>/u)?.[1]?.replace(/<[^>]*>/gu, '') ?? '');
    assert.equal(shareTitle, visibleTitle, `The shared title is the member's actual public title: ${path}`);
    const shareRegistration = decode(memberAttributes.match(/\bdata-member-registration-url="([^"]*)"/u)?.[1] ?? '');
    const registrationAttributes = [...content.matchAll(/<a\b([^>]*)>/gu)]
      .map(([, attributes]) => attributes).find((attributes) => hasHtmlAttribute(attributes, 'data-event-registration')) ?? '';
    assert.equal(shareRegistration, decode(registrationAttributes.match(/\bhref="([^"]*)"/u)?.[1] ?? ''),
      `The shared registration URL is the member's original destination: ${path}`);
    assert.match(content, /\bdata-event-date-label(?:\s|=|>)/u,
      `Each co-host view can display its date in the agenda zone: ${path}`);
    assert.match(content, /\bdata-event-time-label(?:\s|=|>)/u,
      `Each co-host view can display its times in the same agenda zone: ${path}`);
  }
  assert.doesNotMatch(html, /\bdata-event-(?:from|to)(?:\s|=|>)/u, `Week/month replaces the custom date range: ${path}`);
  assert.doesNotMatch(html, /Fechas de inicio en la zona del organizador|Rango personalizado|La semana que viene|El mes que viene/u,
    `The agenda does not retain obsolete date-range copy or navigation: ${path}`);
  for (const [, attributes, content] of html.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav>/gu)) {
    if (!/class="[^"]*(?:community-country-nav|collection-navigation)/u.test(attributes)) continue;
    for (const [, linkAttributes] of content.matchAll(/<a\b([^>]*)>/gu)) {
      if (!/\bhref="\/eventos\/(?:[a-z-]+\/)?"/u.test(linkAttributes)) continue;
      assert.match(linkAttributes, /\bdata-event-agenda-route(?:\s|=|$)/u,
        `Agenda navigation links can preserve the consulted period and zone: ${path}`);
    }
  }
  const noScriptHelp = decode(html.match(/<noscript>\s*<p\b[^>]*>([\s\S]*?)<\/p>\s*<\/noscript>/u)?.[1] ?? '');
  assert.match(noScriptHelp, /publicados/iu, `The notice describes the initial published selection: ${path}`);
  assert.match(noScriptHelp, /semana|mes|período/iu, `The notice distinguishes interactive period selection from static defaults: ${path}`);
  assert.match(noScriptHelp, /JavaScript/u, `The static agenda explains how to use interactive filtering: ${path}`);
  assert.doesNotMatch(html, /<h2\b[^>]*>\s*Próximos eventos\s*<\/h2>/u,
    `The agenda heading also describes the visible ended events: ${path}`);
  assert.doesNotMatch(html, /event-agenda__archive|id="event-archive-title"/u,
    `Recordings are integrated in event cards instead of a second archive: ${path}`);
  const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map(([, id]) => id);
  assert.equal(new Set(ids).size, ids.length, `No duplicated event fragment or other HTML ID: ${path}`);
}
for (const field of ['mode', 'country', 'community', 'city']) assert.match(events, new RegExp(`data-event-${field}`));
if (fixtureBuild) {
  assert.match(events, /data-event-city="PE:Lima"/);
  assert.match(events, /data-event-communities="fixture-community\|fixture-student-colombia"/);
  assert.match(events, /href="\/comunidades\/peru\/#resource-fixture-community"/);
  assert.match(events, /<option value="CO"[^>]*>Colombia<\/option>/, 'The global agenda filter includes a co-host country.');
  assert.match(events, /<option value="CR"[^>]*>Costa Rica<\/option>/, 'The global agenda filter keeps published countries with no upcoming events.');
  assert.match(events, /<option value="fixture-community" data-event-country="PE"[^>]*>/,
    'Global community options carry the published Peru country metadata.');
  assert.match(events, /<option value="fixture-student-colombia" data-event-country="CO"[^>]*>/,
    'Global community options carry the published Colombia country metadata.');
  assert.match(events, /<option value="PE:Lima"[^>]*>[^<]*Lima[^<]*Perú<\/option>/u,
    'Physical city labels disambiguate city and country without organizer-country wording.');
  assert.doesNotMatch(events, /<option value="CO:Lima"/u,
    'A Peru venue does not become a Colombia city because a co-host comes from Colombia.');
  const fallbackMember = events.match(/<article\b[^>]*data-event-member-id="fixture-past-unrecorded"[^>]*>([\s\S]*?)<\/article>/u)?.[1] ?? '';
  assert.match(fallbackMember, /Lima/u, 'Cards show the known community city when the event does not supply one.');
  const globalEventCards = [...events.matchAll(/<li id="event-fixture-event"[^>]*>/gu)];
  assert.equal(globalEventCards.length, 1, 'A cross-posted event appears once in the overall agenda.');
  const globalAliases = globalEventCards[0][0].match(/data-event-alias-ids="([^"]+)"/u)?.[1].split('|') ?? [];
  assert.ok(globalAliases.includes('fixture-event-colombia'), 'SSR exposes the co-host alias consumed by fragment navigation.');
  assert.match(events, /<span id="event-fixture-event-colombia"\s/u,
    'The co-host fragment also has a native HTML destination without JavaScript.');
  assert.match(globalEventCards[0][0], /data-event-countries="PE"/u,
    'The shared physical occurrence exposes its Peru venue without treating Colombia as a second venue.');
  assert.match(home, /href="\/eventos\/peru\/#event-fixture-event"/);
  assert.match(home, /href="\/eventos\/#event-fixture-online-event"/);
  assert.match(events, /href="\/eventos\/fixture-event\.ics"/);
  assert.match(events, /mailto:contact@dondeaprendoaws\.com\?subject=[^"\s]+fixture-event/);
  assert.match(read('eventos/peru/index.html'), /id="event-fixture-event"/);
  const remoteDefaults = ['fixture-past-argentina', 'fixture-past-costa-rica', 'fixture-past-unrecorded', 'fixture-online-event'];
  for (const [slug, expectedIds] of Object.entries({
    argentina: remoteDefaults, colombia: remoteDefaults, 'costa-rica': remoteDefaults,
    peru: ['fixture-past-argentina', 'fixture-past-costa-rica', 'fixture-past-unrecorded', 'fixture-event', 'fixture-online-event'],
  })) {
    const html = read(`eventos/${slug}/index.html`);
    const visible = agendaCards(html).filter(({ hidden }) => !hidden);
    assert.deepEqual(visible.map(({ id }) => id), expectedIds,
      `Default ${slug} attendance combines local physical events with remote access from any country.`);
    for (const communityId of ['fixture-community', 'fixture-student-colombia', 'fixture-community-argentina']) {
      assert.match(html, new RegExp(`<option value="${communityId}"`, 'u'),
        `Community options are independent of the physical location on ${slug}.`);
    }
    assert.match(html, /href="\/aprender\/#resource-fixture-recording-argentina"/u);
    assert.match(html, /href="\/aprender\/#resource-fixture-recording-costa-rica"/u);
  }
  assert.deepEqual(globalEventAttributes.map(({ id }) => id), [
    'fixture-past-argentina', 'fixture-past-costa-rica', 'fixture-past-unrecorded', 'fixture-event', 'fixture-online-event',
  ], 'The global HTML exposes every public occurrence once, including history without requiring JavaScript.');
  const unrecordedCard = [...events.matchAll(/<li\b[^>]*data-event-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gu)]
    .find(([, id]) => id === 'fixture-past-unrecorded')?.[2];
  assert.ok(unrecordedCard, 'A public ended event does not require a recording to appear.');
  assert.match(unrecordedCard, /Finalizado/u);
  assert.doesNotMatch(unrecordedCard, /Ver grabación/u);
  for (const [id, recordingId] of [
    ['fixture-past-argentina', 'fixture-recording-argentina'],
    ['fixture-past-costa-rica', 'fixture-recording-costa-rica'],
  ]) {
    const card = [...events.matchAll(/<li\b[^>]*data-event-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/gu)]
      .find(([, cardId]) => cardId === id)?.[2];
    assert.ok(card, `Ended event has a full list card: ${id}`);
    assert.match(card, /Finalizado/u);
    assert.match(card, /data-event-registration[^>]*>\s*Ver evento/u);
    assert.ok(card.includes(`href="/aprender/#resource-${recordingId}"`), 'Recording remains linked from its event.');
    assert.equal((events.match(new RegExp(`href="/aprender/#resource-${recordingId}"`, 'gu')) ?? []).length, 1,
      'The recording link appears once, inside the event card.');
    const calendar = read(`eventos/${id}.ics`).replace(/\r\n /gu, '');
    assert.ok(calendar.includes(`UID:${id}@dondeaprendoaws.com\r\n`));
    assert.ok(!searchIndex.some((entry) => entry.type === 'event' && entry.url.endsWith(`#event-${id}`)), 'Search keeps upcoming events only.');
    assert.ok(!home.includes(`#event-${id}`), 'The homepage preview keeps upcoming events only.');
  }
  assert.ok(read('eventos/fixture-event-colombia.ics').includes('UID:fixture-event-colombia@dondeaprendoaws.com'));
  assert.equal(searchIndex.find(({ title }) => title === 'Encuentro AWS en Lima')?.url, '/eventos/peru/#event-fixture-event');
  assert.equal(searchIndex.find(({ title }) => title === 'Charla de AWS en línea')?.url, '/eventos/#event-fixture-online-event');
  const calendar = read('eventos/fixture-event.ics');
  assert.match(calendar, /DTSTART:20990101T230000Z\r\nDTEND:20990102T010000Z/);
  assert.match(calendar, /URL:https:\/\/example\.com\/encuentro\?source=fixture/);
}
console.log(`Verified ${production ? 'production' : 'preview'} indexing, learning paths, unified search, Analytics tags, ${locations.length} sitemap URLs, and ${sitemapModificationDates} declared sitemap modification dates.`);

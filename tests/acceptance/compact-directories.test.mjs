import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { communityCountryPages } from '../../src/lib/community-country-pages.mjs';
import { RESOURCE_COLLECTIONS, groupCertificationResources, learningCollectionNavigation } from '../../src/lib/resource-collections.mjs';
import { FORMATS_BY_KIND } from '../../src/lib/resource-taxonomy.mjs';

const dist = resolve('dist');
const fixtureMode = process.env.DIRECTORY_ACCEPTANCE_FIXTURE_MODE ?? '';
assert.ok(['', 'enriched', 'empty'].includes(fixtureMode),
  'DIRECTORY_ACCEPTANCE_FIXTURE_MODE must be omitted, "enriched", or "empty".');
assert.ok(existsSync(join(dist, 'aprender/index.html')),
  'Build the site before running compact directory acceptance.');

const decode = (value) => value.replace(/&#(?:x([\da-f]+)|(\d+));/giu,
  (_, hex, decimal) => String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)))
  .replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
  .replaceAll('&#x27;', "'").replaceAll('&apos;', "'").replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>').replaceAll('&nbsp;', ' ');
const parseAttributes = (tag) => new Map([...tag.replace(/^<[\w:-]+/u, '').matchAll(
  /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu,
)].map(([, name, quoted, single, bare]) => [name.toLowerCase(), decode(quoted ?? single ?? bare ?? '')]));
const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

// This local scanner checks balanced generated HTML; script and style bodies are opaque.
function parse(html) {
  const root = { tag: '#document', attrs: new Map(), children: [], order: -1 };
  const stack = [root];
  let order = 0;
  const source = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, '');
  for (const [token] of source.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+/giu)) {
    if (/^<!/u.test(token)) continue;
    const close = token.match(/^<\/([\w:-]+)/u);
    if (close) {
      const index = stack.findLastIndex((node) => node.tag === close[1].toLowerCase());
      if (index > 0) stack.length = index;
      continue;
    }
    const open = token.match(/^<([\w:-]+)/u);
    if (open) {
      const node = {
        tag: open[1].toLowerCase(), attrs: parseAttributes(token), children: [],
        parent: stack.at(-1), order: order++,
      };
      node.parent.children.push(node);
      if (!voidTags.has(node.tag) && !/\/>$/u.test(token)) stack.push(node);
    } else {
      stack.at(-1).children.push({ text: decode(token), parent: stack.at(-1), order: order++ });
    }
  }
  return root;
}

const descendants = (node) => node.children?.flatMap((child) => [child, ...descendants(child)]) ?? [];
const has = (node, name) => node.attrs?.has(name) ?? false;
const text = (node) => (node.text ?? (node.children ?? []).map(text).filter(Boolean).join(' ')).replace(/\s+/gu, ' ').trim();
const find = (node, predicate) => descendants(node).filter(predicate);
const byAttribute = (node, name, value) => find(node, (child) => child.attrs?.get(name) === value);
const isInside = (node, parent) => {
  for (let current = node?.parent; current; current = current.parent) if (current === parent) return true;
  return false;
};
function visible(node) {
  for (let current = node; current && current.tag !== '#document'; current = current.parent) {
    if (has(current, 'hidden') || has(current, 'inert') || current.attrs?.get('aria-hidden') === 'true') return false;
    if (current.parent?.tag === 'details' && !has(current.parent, 'open') && current.tag !== 'summary') return false;
  }
  return true;
}

const routeFile = (route) => join(dist, route === '/' ? 'index.html' : `${route.slice(1)}index.html`);
const pageCache = new Map();
function pageAt(route, fixedCountry = false) {
  if (!pageCache.has(route)) {
    const path = routeFile(route);
    assert.ok(existsSync(path), `Generated directory route exists: ${route}`);
    const tree = parse(readFileSync(path, 'utf8'));
    const mains = byAttribute(tree, 'id', 'contenido').filter((node) => node.tag === 'main');
    assert.equal(mains.length, 1, `${route}: one main directory landmark`);
    pageCache.set(route, { route, path, tree, main: mains[0], fixedCountry });
  }
  return { ...pageCache.get(route), fixedCountry };
}

const collectionPages = RESOURCE_COLLECTIONS.map((collection) => ({
  ...collection,
  route: collection.path,
  fixedCountry: false,
}));
const fixedPages = [
  { route: '/aprender/', kind: 'content', family: 'learning', fixedCountry: false },
  { route: '/creadores/', kind: 'source', family: 'source', fixedCountry: false },
  { route: '/comunidades/', kind: 'community', family: 'community', fixedCountry: false },
  ...collectionPages,
];
const pages = fixedPages.map((item) => ({ ...item, ...pageAt(item.route, item.fixedCountry) }));

const cardsOn = (page) => {
  const lists = byAttribute(page.main, 'data-resource-list', '').filter((node) => node.tag === 'ul');
  if (!lists.length) return [];
  return find(lists[0], (node) => node.tag === 'li' && /^resource-[\w-]+$/u.test(node.attrs?.get('id') ?? ''));
};
const listOn = (page) => byAttribute(page.main, 'data-resource-list', '').find((node) => node.tag === 'ul');
const staticEmptyMessage = (page) => find(page.main, (node) => node.tag === 'p' && node.attrs?.get('role') === 'status'
  && visible(node) && text(node))[0];
function resultBoundary(page) {
  return listOn(page) ?? staticEmptyMessage(page);
}
const control = (page, attribute) => byAttribute(page.main, attribute, '');
const labelFor = (page, node) => {
  const id = node?.attrs?.get('id');
  return id && find(page.main, (candidate) => candidate.tag === 'label' && candidate.attrs?.get('for') === id)[0];
};
function optionValues(select) {
  return find(select, (node) => node.tag === 'option').map((option) => option.attrs.get('value') ?? '');
}
function cardFormat(card) {
  const kind = card.parent?.attrs.get('data-kind');
  const allFormats = new Set(Object.values(FORMATS_BY_KIND).flat());
  const mainAnchor = find(card, (node) => node.tag === 'a' && find(node, (child) => child.tag === 'h3').length)[0];
  return find(mainAnchor ?? card, (node) => node.tag === 'span').map(text)
    .find((value) => allFormats.has(value) && (!kind || FORMATS_BY_KIND[kind]?.includes(value)));
}
function cardMetadata(cards) {
  return {
    formats: new Set(cards.map(cardFormat).filter(Boolean)),
    topics: new Set(cards.flatMap((card) => (card.attrs.get('data-topics') ?? '').split('|').filter(Boolean))),
    countries: new Set(cards.map((card) => card.attrs.get('data-country')).filter(Boolean)),
    levels: new Set(cards.map((card) => card.attrs.get('data-level')).filter(Boolean)),
  };
}
function checkSelectOptions(page, attribute, expectedValues) {
  const controls = control(page, attribute);
  if (expectedValues.size === 0) {
    assert.equal(controls.length, 0, `${page.route}: no empty ${attribute} facet`);
    return undefined;
  }
  assert.equal(controls.length, 1, `${page.route}: one available ${attribute} facet`);
  const select = controls[0];
  assert.equal(select.tag, 'select', `${page.route}: ${attribute} uses a native select`);
  assert.ok(text(labelFor(page, select) ?? {}).trim(), `${page.route}: ${attribute} has an associated label`);
  for (const value of expectedValues) assert.ok(optionValues(select).includes(value), `${page.route}: ${attribute} retains ${value}`);
  return select;
}
function verifyStaticCardsAndCount(page) {
  const cards = cardsOn(page);
  const list = listOn(page);
  const empty = staticEmptyMessage(page);
  if (cards.length) {
    assert.ok(list, `${page.route}: static resource cards are present in a real list`);
    assert.equal(list.attrs.get('data-kind'), page.kind, `${page.route}: result list keeps the directory kind`);
    assert.ok(!empty, `${page.route}: a populated directory does not claim to be empty`);
    for (const card of cards) {
      const heading = find(card, (node) => node.tag === 'h3')[0];
      assert.ok(heading && text(heading), `${page.route}: a card has a readable resource heading`);
      const mainLink = find(card, (node) => node.tag === 'a' && find(node, (child) => child === heading).length)[0];
      assert.ok(mainLink?.attrs.get('href'), `${page.route}: a card remains a static link without JavaScript`);
      assert.equal(mainLink.attrs.get('target'), '_blank', `${page.route}: external resource opens separately`);
      assert.match(mainLink.attrs.get('rel') ?? '', /\bnoopener\b/u, `${page.route}: external link keeps opener protection`);
      assert.ok(cardFormat(card), `${page.route}: card exposes a recognized format in its public metadata`);
    }
    const counts = control(page, 'data-result-count');
    assert.equal(counts.length, 1, `${page.route}: one result count is rendered`);
    const countText = text(counts[0]);
    const countMatch = countText.match(/^(\d[\d.,]*)\s+(.+)$/u);
    assert.ok(countMatch, `${page.route}: result count has a number and noun`);
    assert.equal(Number(countMatch[1].replace(/[.,]/gu, '')), cards.length, `${page.route}: static count matches the cards`);
    assert.equal(counts[0].attrs.get('data-count-singular'), page.kind === 'content' ? 'recurso' : page.kind === 'source' ? 'fuente' : 'comunidad',
      `${page.route}: singular count noun matches the directory`);
    assert.equal(counts[0].attrs.get('data-count-plural'), page.kind === 'content' ? 'recursos' : page.kind === 'source' ? 'fuentes' : 'comunidades',
      `${page.route}: plural count noun matches the directory`);
    return cards;
  }

  assert.ok(!list, `${page.route}: an empty directory has no empty result list`);
  assert.ok(empty && text(empty), `${page.route}: an empty directory explains that no resources are published`);
  return cards;
}

function verifyDirectoryControls(page) {
  const heading = find(page.main, (node) => node.tag === 'h1');
  assert.equal(heading.length, 1, `${page.route}: one page heading`);
  assert.ok(text(heading[0]) && visible(heading[0]), `${page.route}: page heading is readable`);
  const boundary = resultBoundary(page);
  assert.ok(boundary, `${page.route}: results or empty guidance establish a result boundary`);
  const search = control(page, 'data-resource-search');
  const sort = control(page, 'data-sort-filter');
  assert.equal(search.length, 1, `${page.route}: search is always rendered`);
  assert.equal(search[0].tag, 'input', `${page.route}: search uses a native input`);
  assert.equal(search[0].attrs.get('type'), 'search', `${page.route}: search retains native search behavior`);
  assert.ok(text(labelFor(page, search[0]) ?? {}).trim(), `${page.route}: search has an associated label`);
  assert.equal(sort.length, 1, `${page.route}: sort is always rendered`);
  assert.equal(sort[0].tag, 'select', `${page.route}: sort uses a native select`);
  assert.ok(text(labelFor(page, sort[0]) ?? {}).trim(), `${page.route}: sort has an associated label`);
  for (const node of [search[0], sort[0]]) {
    assert.ok(node.order < boundary.order, `${page.route}: primary controls precede results`);
    assert.ok(!control(page, 'data-filter-disclosure').some((disclosure) => isInside(node, disclosure)),
      `${page.route}: primary controls remain outside secondary filters`);
  }
  for (const disclosure of control(page, 'data-filter-disclosure')) {
    assert.equal(disclosure.tag, 'details', `${page.route}: secondary filters use native disclosure`);
    assert.equal(has(disclosure, 'open'), false, `${page.route}: secondary filters start closed`);
    assert.ok(disclosure.children.some((child) => child.tag === 'summary' && text(child)),
      `${page.route}: secondary filters have a readable native trigger`);
    assert.ok(disclosure.order < boundary.order, `${page.route}: secondary filters precede results`);
  }

  const intro = find(page.main, (node) => node.tag === 'p' && node.order > heading[0].order
    && node.order < search[0].order && text(node))[0];
  assert.ok(intro && visible(intro), `${page.route}: concise page context follows its heading before the controls`);

  const cards = cardsOn(page);
  const metadata = cardMetadata(cards);
  const selector = page.selector ?? {};
  checkSelectOptions(page, 'data-format-filter', selector.format ? new Set() : metadata.formats);
  checkSelectOptions(page, 'data-topic-filter', selector.topic ? new Set() : metadata.topics);
  const countryOptions = page.fixedCountry ? new Set() : metadata.countries;
  const countrySelect = checkSelectOptions(page, 'data-country-filter', countryOptions);
  checkSelectOptions(page, 'data-level-filter', metadata.levels);
  const secondary = control(page, 'data-filter-disclosure');
  for (const attribute of ['data-format-filter', 'data-topic-filter', 'data-level-filter']) {
    for (const facet of control(page, attribute)) {
      assert.ok(secondary.some((disclosure) => isInside(facet, disclosure)),
        `${page.route}: ${attribute} stays in secondary filters`);
    }
  }
  if (countrySelect) {
    const countryIsPrimary = page.kind === 'community' && !page.fixedCountry;
    assert.equal(secondary.some((disclosure) => isInside(countrySelect, disclosure)), !countryIsPrimary,
      `${page.route}: country facet is placed in its approved primary or secondary region`);
    if (countryIsPrimary && secondary[0]) assert.ok(countrySelect.order < secondary[0].order,
      `${page.route}: primary country choices precede secondary filters`);
  }

  if (page.kind === 'community' && !page.fixedCountry
    && (page.route === '/comunidades/' || page.family === undefined)) {
    if (countrySelect) {
      assert.ok(countrySelect.order < boundary.order, `${page.route}: country choices precede results`);
    }
    if (page.route !== '/comunidades/') {
      assert.equal(find(page.main, (node) => node.tag === 'nav' && node.attrs.get('aria-label') === 'Comunidades por país').length, 0,
        `${page.route}: community type pages do not add a country navigator`);
    }
  }

  if (page.fixedCountry) {
    assert.equal(control(page, 'data-country-filter').length, 0, `${page.route}: a fixed country is not repeated as a filter`);
  }
}

function verifyCollectionNavigation(page) {
  if (page.family === 'learning' || page.kind === 'content') {
    const expected = learningCollectionNavigation(page.route);
    const navigation = find(page.main, (node) => node.tag === 'nav'
      && node.attrs.get('aria-label') === 'Navegación de recursos para aprender');
    assert.equal(navigation.length, 1, `${page.route}: one native learning navigation`);
    const nav = navigation[0];
    assert.ok(nav.order < control(page, 'data-resource-search')[0].order, `${page.route}: learning navigation precedes controls`);
    for (const link of [...expected.formats, ...expected.topics]) {
      const matches = find(nav, (node) => node.tag === 'a' && node.attrs.get('href') === link.path);
      assert.equal(matches.length, 1, `${page.route}: navigation retains ${link.path}`);
      assert.match(text(matches[0]), new RegExp(link.label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
        `${page.route}: navigation labels ${link.path}`);
      assert.equal(matches[0].attrs.get('aria-current'), link.path === page.route ? 'page' : undefined,
        `${page.route}: only the current collection is marked current`);
    }
    if (expected.topics.length) {
      const details = find(nav, (node) => node.tag === 'details')[0];
      assert.ok(details, `${page.route}: topic destinations use native disclosure`);
      assert.equal(has(details, 'open'), false, `${page.route}: topic destinations start closed`);
      assert.ok(details.children.some((node) => node.tag === 'summary' && text(node)),
        `${page.route}: topic destinations have a keyboard-operable summary`);
    }
    return;
  }

  let expectedLinks = [];
  let expectedLabel;
  if (page.route === '/creadores/') {
    expectedLinks = RESOURCE_COLLECTIONS.filter(({ kind }) => kind === 'source');
    expectedLabel = 'Explorar por formato o tema';
  } else if (page.kind === 'source') {
    expectedLinks = RESOURCE_COLLECTIONS.filter(({ kind }) => kind === 'source');
    expectedLabel = 'Explorar por formato o tema';
  } else if (page.route === '/comunidades/') {
    expectedLinks = RESOURCE_COLLECTIONS.filter(({ kind }) => kind === 'community');
    expectedLabel = 'Tipos de comunidades AWS';
  } else if (page.kind === 'community') {
    expectedLinks = RESOURCE_COLLECTIONS.filter(({ kind }) => kind === 'community');
    expectedLabel = page.family === 'country' ? 'Tipos de comunidades AWS' : 'Explorar por formato o tema';
  }

  if (expectedLinks.length) {
    const navigation = find(page.main, (node) => node.tag === 'nav' && node.attrs.get('aria-label') === expectedLabel);
    assert.equal(navigation.length, 1, `${page.route}: native collection navigation is present`);
    assert.ok(navigation[0].order < control(page, 'data-resource-search')[0].order, `${page.route}: collection navigation precedes controls`);
    for (const item of expectedLinks) {
      const matches = find(navigation[0], (node) => node.tag === 'a' && node.attrs.get('href') === item.path);
      assert.equal(matches.length, 1, `${page.route}: collection navigation retains ${item.path}`);
      assert.ok(text(matches[0]).includes(item.label), `${page.route}: collection navigation labels ${item.path}`);
      assert.equal(matches[0].attrs.get('aria-current'), item.path === page.route ? 'page' : undefined,
        `${page.route}: only the current collection is marked current`);
    }
  }
}

const rootCommunityPage = pageAt('/comunidades/');
const communityCards = cardsOn(rootCommunityPage);
const countryPages = communityCountryPages(communityCards.map((card) => ({
  kind: 'community', country: card.attrs.get('data-country'),
})).filter(({ country }) => country));
const countryDirectoryPages = countryPages.map((countryPage) => ({
  ...countryPage,
  route: countryPage.path,
  kind: 'community',
  family: 'country',
  fixedCountry: true,
  ...pageAt(countryPage.path, true),
}));

test('every directory route has search and sort before populated results or an empty explanation', () => {
  const allPages = [...pages, ...countryDirectoryPages];
  for (const page of allPages) {
    verifyDirectoryControls(page);
    verifyStaticCardsAndCount(page);
  }

  if (fixtureMode === 'empty') {
    for (const page of allPages) {
      assert.equal(cardsOn(page).length, 0, `${page.route}: the explicit empty build has no resource cards`);
      assert.ok(staticEmptyMessage(page), `${page.route}: empty build retains explanatory guidance`);
    }
    assert.equal(countryDirectoryPages.length, 0, 'An empty community catalog creates no country pages.');
  }
});

test('format and topic navigation stays native and ahead of search', () => {
  for (const page of pages) verifyCollectionNavigation(page);
  for (const page of countryDirectoryPages) verifyCollectionNavigation(page);
});

test('long orientation follows results while related learning routes stay before filters', () => {
  for (const page of [...pages, ...countryDirectoryPages]) {
    const guide = byAttribute(page.main, 'id', 'collection-guide');
    assert.equal(guide.length, 1, `${page.route}: one orientation section is available`);
    assert.ok(guide[0].order > resultBoundary(page).order, `${page.route}: orientation follows the results or empty guidance`);

    if (page.earlyRoute) {
      const relatedRoute = find(page.main, (node) => node.tag === 'a' && node.attrs.get('href') === page.earlyRoute.path);
      assert.equal(relatedRoute.length, 1, `${page.route}: its declared learning route stays available once`);
      assert.ok(relatedRoute[0].order < control(page, 'data-resource-search')[0].order,
        `${page.route}: the related learning route precedes the filters`);
    }
  }

  const learning = pageAt('/aprender/');
  const learningPathLinks = find(learning.tree, (node) => node.tag === 'a' && node.attrs.get('href') === '/recorridos/');
  assert.ok(learningPathLinks.some((link) => link.order > resultBoundary(learning).order),
    'Learning-path orientation remains linked after the resource results or empty guidance.');
  const existingPromo = find(learning.tree, (node) => node.tag === 'aside'
    && node.attrs.get('aria-label') === 'Recorridos de aprendizaje');
  assert.ok(existingPromo.every((promo) => promo.order > resultBoundary(learning).order),
    'If the separate learning-path promotion remains, it follows results or empty guidance.');

  for (const page of [rootCommunityPage, ...countryDirectoryPages]) {
    const summaries = find(page.main, (node) => node.tag === 'section'
      && /^Resumen de comunidades/u.test(node.attrs.get('aria-label') ?? ''));
    assert.equal(summaries.length, 1, `${page.route}: community facts remain in a labelled section`);
    assert.ok(text(summaries[0]) && summaries[0].order > resultBoundary(page).order,
      `${page.route}: longer community facts follow the results or empty guidance`);
  }
});

test('community country navigation stays primary, and country-page filters do not repeat the fixed country', () => {
  const rootCountryNavigation = find(rootCommunityPage.main, (node) => node.tag === 'nav'
    && node.attrs.get('aria-label') === 'Comunidades por país');
  if (countryPages.length) {
    assert.equal(rootCountryNavigation.length, 1, 'The overall community directory keeps native country navigation.');
    const nav = rootCountryNavigation[0];
    assert.ok(nav.order < resultBoundary(rootCommunityPage).order,
      'Country navigation precedes the results.');
    assert.ok(!control(rootCommunityPage, 'data-filter-disclosure').some((disclosure) => isInside(nav, disclosure)),
      'Country navigation remains outside secondary filters.');
    const details = find(nav, (node) => node.tag === 'details')[0];
    assert.ok(details && !has(details, 'open'), 'Country navigation uses a closed native disclosure.');
    assert.ok(details.children.some((node) => node.tag === 'summary' && text(node)),
      'Country navigation has a readable native trigger.');
    for (const countryPage of countryPages) {
      const links = find(nav, (node) => node.tag === 'a' && node.attrs.get('href') === countryPage.path);
      assert.equal(links.length, 1, `${countryPage.path}: country navigation retains its route.`);
      assert.ok(text(links[0]).includes(countryPage.label), `${countryPage.path}: country link has its label.`);
    }
  } else {
    assert.equal(rootCountryNavigation.length, 0, 'The overall community directory does not show an empty country navigator.');
  }

  for (const page of countryDirectoryPages) {
    const navigation = find(page.main, (node) => node.tag === 'nav' && node.attrs.get('aria-label') === 'Comunidades por país');
    assert.equal(navigation.length, 1, `${page.route}: country pages retain the native country navigation.`);
    assert.ok(navigation[0].order < resultBoundary(page).order,
      `${page.route}: country navigation precedes results.`);
    assert.ok(!control(page, 'data-filter-disclosure').some((disclosure) => isInside(navigation[0], disclosure)),
      `${page.route}: country navigation stays outside secondary filters.`);
    assert.equal(control(page, 'data-country-filter').length, 0, `${page.route}: fixed country scope is not duplicated as a select.`);
    assert.ok(find(navigation[0], (node) => node.tag === 'a' && node.attrs.get('aria-current') === 'page')
      .some((node) => node.attrs.get('href') === page.route), `${page.route}: current country is identified in navigation.`);
  }
});

const fixturePath = resolve('tests/fixtures/compact-directory-resources.json');
const fixtureRecords = JSON.parse(readFileSync(fixturePath, 'utf8'));
const fixtureIds = fixtureRecords.map(({ id }) => id);
const expectedCertificationCardOrder = [
  'directory-cert-cloud-practitioner',
  'directory-cert-ai-practitioner',
  'directory-cert-mixed-exams',
  'directory-cert-general-preparation',
  'directory-cert-generic-resource',
];
const expectedCertificationGroups = [
  'cloud-practitioner', 'ai-practitioner', 'multiple-exams', 'exam-preparation', 'other-certification-resources',
];

test('the populated certification fixture exposes real exam and fallback groups in the primary select', () => {
  const page = pages.find(({ route }) => route === '/aprender/certificaciones/');
  const fixtureCards = cardsOn(page).filter((card) => fixtureIds.includes(card.attrs.get('id')?.replace(/^resource-/u, '')));
  const groupSelects = control(page, 'data-group-filter');

  if (fixtureMode === 'empty') {
    assert.equal(cardsOn(page).length, 0, 'The empty build has no certification cards.');
    assert.equal(groupSelects.length, 0, 'The empty build does not offer empty exam groups.');
    assert.equal(find(page.main, (node) => node.tag === 'li' && has(node, 'data-resource-group-heading')).length, 0,
      'The empty build has no empty certification group headings.');
    return;
  }

  if (fixtureMode === 'enriched') {
    assert.deepEqual(fixtureCards.map((card) => card.attrs.get('id').replace(/^resource-/u, '')),
      expectedCertificationCardOrder, 'The enriched build contains every discriminating certification sample.');
  }
  if (!fixtureCards.length) return;

  assert.equal(groupSelects.length, 1, 'Populated certifications expose one exam/type select.');
  const select = groupSelects[0];
  assert.equal(select.tag, 'select', 'Exam/type selection uses a native select.');
  assert.ok(!control(page, 'data-filter-disclosure').some((disclosure) => isInside(select, disclosure)),
    'Exam/type selection remains outside secondary filters.');
  if (control(page, 'data-filter-disclosure')[0]) assert.ok(select.order < control(page, 'data-filter-disclosure')[0].order,
    'Exam/type selection precedes secondary filters.');
  assert.ok(select.order < resultBoundary(page).order, 'Exam/type selection precedes certification results.');
  assert.match(text(labelFor(page, select) ?? {}), /examen|tipo/iu, 'Exam/type select has a meaningful associated label.');

  if (fixtureMode === 'enriched') {
    const values = optionValues(select).filter(Boolean);
    for (const id of expectedCertificationGroups) assert.ok(values.includes(id), `Exam/type select exposes ${id}.`);
    const headings = find(listOn(page), (node) => node.tag === 'li' && has(node, 'data-resource-group-heading'))
      .map((node) => text(find(node, (child) => child.tag === 'h2')[0] ?? {}));
    assert.deepEqual(headings, ['Cloud Practitioner', 'AI Practitioner', 'Varios exámenes', 'Preparación general', 'Otros recursos'],
      'Static group headings retain the fixture’s single-exam, mixed, and fallback types.');
    const mixed = fixtureRecords.find(({ id }) => id === 'directory-cert-mixed-exams');
    const solutionsArchitectFilterGroup = groupCertificationResources([mixed]).find(({ id, resources, filterResources }) =>
      id === 'solutions-architect' && resources.length === 0
      && filterResources.some(({ id: resourceId }) => resourceId === mixed.id));
    assert.ok(solutionsArchitectFilterGroup, 'The mixed SAA-C03 resource belongs to the existing Solutions Architect filter group.');
    assert.ok(values.includes(solutionsArchitectFilterGroup.id),
      'The primary exam select retains the Solutions Architect Associate filter option from a mixed-only membership.');
    assert.ok(!headings.includes(solutionsArchitectFilterGroup.label),
      'The mixed-only Solutions Architect option does not create an empty result heading.');
    assert.ok(!control(page, 'data-topic-filter').length, 'The fixed certification topic does not duplicate its omitted facet.');
  }
});

test('the enriched fixture retains long titles and source, community, and recording links in static cards', () => {
  if (fixtureMode === 'empty') return;
  if (fixtureMode === 'enriched') {
    const familyRoutes = { content: '/aprender/', source: '/creadores/', community: '/comunidades/' };
    const familyPages = Object.fromEntries(Object.entries(familyRoutes).map(([kind, route]) => [kind, pageAt(route)]));
    for (const record of fixtureRecords) {
      const expectedFamily = familyPages[record.kind];
      assert.ok(expectedFamily && cardsOn(expectedFamily).some((card) => card.attrs.get('id') === `resource-${record.id}`),
        `The enriched build exposes ${record.id} as a static ${record.kind} card.`);
      for (const [kind, familyPage] of Object.entries(familyPages)) {
        if (kind === record.kind) continue;
        assert.ok(!cardsOn(familyPage).some((card) => card.attrs.get('id') === `resource-${record.id}`),
          `${record.id} does not appear in the unrelated ${kind} directory.`);
      }
    }
  }

  const learn = pageAt('/aprender/');
  const serverlessCard = cardsOn(learn).find((card) => card.attrs.get('id') === 'resource-directory-serverless-long-title');
  if (!serverlessCard) return;

  const longTitle = fixtureRecords.find(({ id }) => id === 'directory-serverless-long-title').title;
  const heading = find(serverlessCard, (node) => node.tag === 'h3')[0];
  assert.equal(text(heading), longTitle, 'The full long title remains in the static card heading.');
  const links = find(serverlessCard, (node) => node.tag === 'a');
  assert.ok(links.some((node) => node.attrs.get('href') === '/creadores/#resource-directory-source-blog'
    && /^Autor o fuente:/u.test(text(node))), 'The static card links to its related source.');
  assert.ok(links.some((node) => node.attrs.get('href') === '/comunidades/peru/#resource-fixture-community'
    && /^Comunidad:/u.test(text(node))), 'The static card links to its related community.');
  assert.ok(links.some((node) => node.attrs.get('href') === '/eventos/#event-fixture-past-argentina'
    && /^Grabación de:/u.test(text(node))), 'The static card links to its related recording.');
});

test('the explicit enriched build covers every content and creator collection plus the community types', () => {
  if (fixtureMode !== 'enriched') return;

  const learn = pageAt('/aprender/');
  assert.ok(cardsOn(learn).length > 12, 'The enriched learning directory has enough real cards for the existing 12-item list behavior.');
  for (const path of RESOURCE_COLLECTIONS.filter(({ kind }) => kind === 'content').map(({ path }) => path)) {
    assert.ok(cardsOn(pageAt(path)).length > 0, `${path}: the enriched fixture exercises this content collection.`);
  }
  for (const path of RESOURCE_COLLECTIONS.filter(({ kind }) => kind === 'source').map(({ path }) => path)) {
    assert.ok(cardsOn(pageAt(path)).length > 0, `${path}: the enriched fixture exercises this creator collection.`);
  }
  for (const path of RESOURCE_COLLECTIONS.filter(({ kind }) => kind === 'community').map(({ path }) => path)) {
    assert.ok(cardsOn(pageAt(path)).length > 0, `${path}: the base fixture exercises this community type.`);
  }
});

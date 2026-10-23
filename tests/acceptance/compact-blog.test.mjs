import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';
import { LEARNING_PATHS, learningPathHref } from '../../src/lib/learning-paths.mjs';
import { siteOutputRoot } from '../../scripts/lib/site-output.mjs';

// Generated HTML proves reading order and navigation. First-view legibility,
// image prominence, responsive columns and the 680px reading column need a browser.
const dist = join(siteOutputRoot, 'blog');
assert.ok(existsSync(join(dist, 'index.html')), 'Build the site before running compact blog acceptance.');
const index = readFileSync(join(dist, 'index.html'), 'utf8');
const featured = JSON.parse(readFileSync('tests/fixtures/blog-index.json', 'utf8'));
const routes = JSON.parse(readFileSync('tests/fixtures/blog-routes.json', 'utf8'));
const decode = (value) => value.replace(/&#(?:x([\da-f]+)|(\d+));/giu,
  (_, hex, decimal) => String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)))
  .replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&apos;', "'")
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&nbsp;', ' ');
const text = (html) => decode(html.replace(/<[^>]*>/gu, '')).replace(/\s+/gu, ' ').trim();
const cardsWithClass = (html, className) => [...html.matchAll(new RegExp(
  `<a\\b[^>]*class="${className}"[^>]*>[\\s\\S]*?<\\/a>`, 'gu',
))].map(([card]) => card);
const sourceBySlug = new Map(routes.map(({ slug }) => {
  const source = readFileSync(`src/content/blog/${slug}.md`, 'utf8');
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/u)?.[1];
  assert.ok(frontmatter, `${slug}: article frontmatter exists.`);
  return [slug, parseYaml(frontmatter)];
}));

function assertTitleBeforeCover(card, label) {
  const heading = card.match(/<h3\b[^>]*>[\s\S]*?<\/h3>/u);
  assert.ok(heading && text(heading[0]), `${label}: a readable article heading exists.`);
  assert.doesNotMatch(heading[0], /\b(?:hidden|inert)(?:\s|=|>)|aria-hidden="true"/u,
    `${label}: the heading is available in the public HTML.`);
  const cover = card.match(/<(?:picture|img)\b/u);
  assert.ok(cover, `${label}: the editorial cover remains present.`);
  assert.ok(heading.index + heading[0].length <= cover.index,
    `${label}: the complete heading precedes the cover in reading order.`);
}

test('all six featured articles present their full linked title before the cover', () => {
  const cards = cardsWithClass(index, 'blog-card');
  assert.equal(cards.length, featured.length, 'All six editorial choices remain available.');
  for (const [position, card] of cards.entries()) {
    const expected = featured[position];
    assert.equal(decode(card.match(/^<a\b[^>]*\bhref="([^"]+)"/u)?.[1] ?? ''), `/blog/${expected.slug}/`);
    assert.equal(text(card.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/u)?.[1] ?? ''), expected.title);
    assertTitleBeforeCover(card, expected.slug);
  }
});

test('featured and related covers advertise their compact thumbnail width to the browser', () => {
  const cards = [
    ...cardsWithClass(index, 'blog-card'),
    ...routes.flatMap(({ slug }) => cardsWithClass(readFileSync(join(dist, slug, 'index.html'), 'utf8'), 'blog-related__card')),
  ];
  assert.ok(cards.length > featured.length, 'Both featured and related covers are exercised.');
  for (const card of cards) {
    const image = card.match(/<img\b[^>]*>/u)?.[0];
    assert.ok(image, 'Every reading card retains its cover.');
    assert.equal(image.match(/\bsizes="([^"]+)"/u)?.[1], '200px',
      'The responsive fallback advertises the rendered 200px thumbnail rather than the old full-card width.');
    for (const [source] of card.matchAll(/<source\b[^>]*>/gu)) {
      assert.equal(source.match(/\bsizes="([^"]+)"/u)?.[1], '200px',
        'The WebP source uses the same compact geometry as its fallback.');
    }
  }
});

test('the four learning routes remain available after the featured reading choices', () => {
  const main = index.match(/<main\b[^>]*>([\s\S]*?)<\/main>/u)?.[1] ?? '';
  const selected = main.match(/<section\b[^>]*aria-labelledby="blog-selected-title"[^>]*>[\s\S]*?<\/section>/u);
  assert.ok(selected, 'Featured reading retains its labelled section.');
  const navigation = main.match(/<nav\b[^>]*class="blog-index__routes"[^>]*>[\s\S]*?<\/nav>/u);
  assert.ok(navigation, 'Learning-route navigation remains available.');
  assert.match(navigation[0], /\baria-label="[^"]+"/u, 'Route navigation retains a programmatic label.');
  assert.ok(navigation.index >= selected.index + selected[0].length,
    'Learning orientation follows the featured articles instead of delaying their titles.');
  const links = [...navigation[0].matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)];
  assert.deepEqual(links.map(([, href]) => decode(href)), LEARNING_PATHS.map(({ id }) => learningPathHref(id)));
  assert.ok(links.every(([, , label]) => text(label)), 'Every route retains a readable link label.');
});

test('the dated archive preserves every remaining title, year group and chronological order', () => {
  const archive = index.match(/<section\b[^>]*class="blog-archive"[^>]*>[\s\S]*?<\/section>/u)?.[0];
  assert.ok(archive, 'The article archive remains present.');
  assert.match(archive, /<h2\b[^>]*id="blog-archive-title"/u, 'The existing archive anchor remains available.');
  const featuredSlugs = new Set(featured.map(({ slug }) => slug));
  const expected = routes.filter(({ slug }) => !featuredSlugs.has(slug))
    .map(({ slug }) => ({ slug, ...sourceBySlug.get(slug) }))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title, 'es'));
  const expectedYears = [...new Set(expected.map(({ publishedAt }) => publishedAt.slice(0, 4)))];
  const groups = [...archive.matchAll(/<div\b[^>]*class="blog-archive__year"[^>]*>([\s\S]*?)<\/div>/gu)];
  assert.deepEqual(groups.map(([, group]) => text(group.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/u)?.[1] ?? '')),
    expectedYears, 'Years retain descending order without losing groups.');
  for (const [position, [, group]] of groups.entries()) {
    const links = [...group.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)]
      .map(([, href, title]) => ({ href: decode(href), title: text(title) }));
    assert.deepEqual(links, expected.filter(({ publishedAt }) => publishedAt.startsWith(expectedYears[position]))
      .map(({ slug, title }) => ({ href: `/blog/${slug}/`, title })),
    `${expectedYears[position]}: every current full title and destination remain in chronological order.`);
  }
});

test('related reading choices use the same title-before-cover hierarchy on every article', () => {
  let relatedCount = 0;
  for (const { slug } of routes) {
    const path = join(dist, slug, 'index.html');
    assert.ok(existsSync(path), `${slug}: the public article still exists.`);
    const cards = cardsWithClass(readFileSync(path, 'utf8'), 'blog-related__card');
    for (const [position, card] of cards.entries()) {
      assertTitleBeforeCover(card, `${slug}: related choice ${position + 1}`);
      relatedCount += 1;
    }
  }
  assert.ok(relatedCount > 0, 'The built corpus exercises related reading cards.');
});

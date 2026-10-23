import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';
import { LEARNING_PATHS, learningPathHref } from '../../src/lib/learning-paths.mjs';
import { siteOutputRoot } from '../../scripts/lib/site-output.mjs';

// Public HTML proves sequence, content and reading order. First-view legibility,
// responsive layout and keyboard navigation require direct browser verification.
const dist = siteOutputRoot;
assert.ok(existsSync(join(dist, 'recorridos/index.html')), 'Build the site before running learning-path acceptance.');
const read = (route) => readFileSync(join(dist, route.slice(1), 'index.html'), 'utf8');
const search = JSON.parse(readFileSync(join(dist, 'search-index.json'), 'utf8'));
const resources = new Map(search.filter(({ type }) => type === 'content').map((entry) => [entry.url, entry]));
const decode = (value) => value.replace(/&#(?:x([\da-f]+)|(\d+));/giu,
  (_, hex, decimal) => String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)))
  .replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&apos;', "'")
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&nbsp;', ' ');
const text = (html) => decode(html.replace(/<[^>]*>/gu, '')).replace(/\s+/gu, ' ').trim();
const element = (html, tag, className) => html.match(new RegExp(
  `<${tag}\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>[\\s\\S]*?<\\/${tag}>`, 'u',
));
const anchors = (html) => [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)];
const fixtureMode = process.env.DIRECTORY_ACCEPTANCE_FIXTURE_MODE ?? '';
const samples = JSON.parse(readFileSync('tests/fixtures/compact-learning-path-resources.json', 'utf8'));

const paths = LEARNING_PATHS.map((path) => {
  // The editorial registry defines order and notes. Published catalog entries and
  // article frontmatter independently supply the current titles and destinations.
  const steps = path.steps.flatMap((step) => {
    if (step.type === 'resource') {
      const href = `/aprender/#resource-${step.id}`;
      const resource = resources.get(href);
      return resource ? [{ ...step, href, title: resource.title, label: resource.meta }] : [];
    }
    const source = readFileSync(`src/content/blog/${step.id}.md`, 'utf8');
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/u)?.[1];
    assert.ok(frontmatter, `${step.id}: the source article has frontmatter.`);
    return [{ ...step, href: `/blog/${step.id}/`, title: parseYaml(frontmatter).title, label: 'Artículo del blog' }];
  });
  const html = read(learningPathHref(path.id));
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/u)?.[1];
  assert.ok(main, `${path.id}: a public main landmark exists.`);
  const section = element(main, 'section', 'learning-path-detail__steps');
  assert.ok(section, `${path.id}: the ordered learning steps exist.`);
  return { ...path, steps, html, main, section };
});

test('the four route-selector cards preserve titles, context, stable anchors and resolved step counts', () => {
  const index = read('/recorridos/');
  const navigation = element(index, 'nav', 'learning-paths__index');
  assert.ok(navigation, 'The selector remains a labelled navigation region.');
  assert.match(navigation[0], /aria-label="[^"]+"/u);
  const cards = anchors(navigation[0]);
  assert.deepEqual(cards.map(([, href]) => decode(href)), paths.map(({ id }) => learningPathHref(id)));
  for (const [position, [card]] of cards.entries()) {
    const path = paths[position];
    assert.ok(card.includes(`id="${path.id}"`), `${path.id}: existing fragment links still resolve.`);
    for (const value of [path.title, path.audience, path.intro, `${path.steps.length} pasos sugeridos`]) {
      assert.ok(text(card).includes(value), `${path.id}: the selector preserves ${value}.`);
    }
    assert.doesNotMatch(card.match(/^<a\b[^>]*>/u)[0], /\bhidden\b|\binert\b|aria-hidden="true"/u);
  }
});

test('each compact introduction preserves its full title, audience and purpose before the steps', () => {
  for (const path of paths) {
    const intro = element(path.main, 'header', 'learning-path-detail__intro');
    assert.ok(intro && intro.index < path.section.index, `${path.id}: context precedes the sequence.`);
    assert.equal(text(intro[0].match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/u)?.[1] ?? ''), path.title);
    assert.ok(text(intro[0]).includes(path.audience), `${path.id}: audience remains readable.`);
    assert.ok(text(intro[0]).includes(path.intro), `${path.id}: purpose remains readable.`);
    const breadcrumb = element(path.main, 'nav', 'learning-path-detail__breadcrumbs');
    assert.ok(breadcrumb, `${path.id}: ancestor navigation remains available.`);
    for (const href of ['/', '/recorridos/']) {
      assert.ok(anchors(breadcrumb[0]).some(([, target]) => target === href), `${path.id}: ancestor link ${href} remains.`);
    }
  }
});

test('ordered steps retain every published destination, title, type, note and consecutive number', () => {
  if (fixtureMode === 'enriched') {
    for (const resource of samples) {
      assert.equal(resources.has(`/aprender/#resource-${resource.id}`), resource.published,
        `${resource.id}: the enriched build exercises its declared publication state.`);
    }
  }
  for (const path of paths) {
    const list = path.section[0].match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/u)?.[1];
    assert.ok(list, `${path.id}: the sequence remains a native ordered list.`);
    const links = anchors(list);
    assert.equal(links.length, path.steps.length, `${path.id}: only available steps are shown.`);
    assert.ok(links.length >= 2, `${path.id}: the sequence remains useful without catalog entries.`);
    for (const [position, [card, href]] of links.entries()) {
      const step = path.steps[position];
      assert.equal(decode(href), step.href, `${path.id}: step ${position + 1} retains its destination and order.`);
      assert.equal(text(card.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/u)?.[1] ?? ''), step.title);
      assert.equal(text(element(card, 'span', 'learning-path-detail__step-type')?.[0] ?? ''), step.label);
      assert.equal(text(element(card, 'span', 'learning-path-detail__step-note')?.[0] ?? ''), step.note);
      assert.equal(text(element(card, 'span', 'learning-path-detail__step-number')?.[0] ?? ''), String(position + 1).padStart(2, '0'));
      assert.doesNotMatch(card.match(/^<a\b[^>]*>/u)[0], /\bhidden\b|\binert\b|aria-hidden="true"/u);
    }
    assert.doesNotMatch(list, /<details\b/u, `${path.id}: steps are available without opening a disclosure.`);
    if (fixtureMode === 'empty') assert.ok(path.steps.every(({ type }) => type === 'blog'));
  }
});

test('general reading guidance follows the sequence instead of delaying the first learning action', () => {
  const guidance = 'Los pasos son sugerencias: sigue el orden o elige el material que mejor responda a lo que necesitas aprender.';
  for (const path of paths) {
    const paragraph = [...path.main.matchAll(/<p\b[^>]*>[\s\S]*?<\/p>/gu)]
      .filter(([html]) => text(html) === guidance);
    assert.equal(paragraph.length, 1, `${path.id}: the existing guidance remains available once.`);
    assert.ok(paragraph[0].index >= path.section.index + path.section[0].length,
      `${path.id}: secondary guidance follows the steps rather than expanding their introduction.`);
  }
});

test('step counts, section labels and onward navigation match each resolved route', () => {
  for (const path of paths) {
    const heading = path.section[0].split(/<ol\b/u)[0];
    assert.ok(text(heading).includes(`${path.steps.length} pasos`), `${path.id}: the effective count remains visible.`);
    const labelId = path.section[0].match(/aria-labelledby="([^"]+)"/u)?.[1];
    assert.ok(labelId && path.section[0].includes(`id="${labelId}"`), `${path.id}: the section label resolves.`);
    const related = element(path.main, 'nav', 'learning-path-detail__related');
    assert.ok(related && related.index >= path.section.index + path.section[0].length,
      `${path.id}: onward choices follow the complete sequence.`);
    assert.deepEqual(anchors(related[0]).map(([, href, label]) => ({ href: decode(href), label: text(label) })), [
      path.relatedCollection,
      { href: '/recorridos/', label: 'Elige otra ruta' },
    ]);
  }
});

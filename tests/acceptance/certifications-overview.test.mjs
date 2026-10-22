import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import offer from '../fixtures/certification-offer.json' with { type: 'json' };
import { lookupResourceCollection, resolveResourceCollectionFaq } from '../../src/lib/resource-collections.mjs';

// These checks inspect public build output. Responsive layout, focus, filtering
// and factual correctness are also exercised directly as described in plan.md.
const dist = resolve('dist');
const route = '/aprender/certificaciones/';
assert.ok(existsSync(join(dist, route.slice(1), 'index.html')), 'Build the site before certification acceptance.');
const html = readFileSync(join(dist, route.slice(1), 'index.html'), 'utf8');
const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/u)?.[1] ?? '';
const decode = (value) => value.replace(/&#(?:x([\da-f]+)|(\d+));/giu,
  (_, hex, decimal) => String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)))
  .replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&apos;', "'")
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&nbsp;', ' ');
const text = (source) => decode(source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, '')
  .replace(/<[^>]*>/gu, ' ')).replace(/\s+/gu, ' ').trim();
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const links = (source) => [...source.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gu)]
  .map(([, href, label]) => ({ href: decode(href), label: text(label) }));
function section(source, id) {
  const start = source.match(new RegExp(`<section\\b[^>]*\\bid="${escape(id)}"[^>]*>`, 'u'));
  if (!start) return '';
  const boundaries = /<\/?section\b[^>]*>/gu;
  boundaries.lastIndex = start.index + start[0].length;
  let depth = 1;
  for (let token; (token = boundaries.exec(source));) {
    depth += token[0].startsWith('</') ? -1 : 1;
    if (!depth) return source.slice(start.index, boundaries.lastIndex);
  }
  return '';
}
const map = section(main, 'certificaciones-mapa');

test('the static page separates the complete map, material library and general FAQ', () => {
  assert.equal([...main.matchAll(/<h1\b/gu)].length, 1);
  assert.match(text(main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/u)?.[1] ?? ''), /certificaciones AWS.*elegir.*preparar/iu);
  assert.ok(map, 'The complete map has its own public section anchor.');
  assert.match(map, /<h2\b[^>]*>[^<]*Todas las certificaciones/iu);
  assert.doesNotMatch(map.match(/^<section\b[^>]*>/u)?.[0] ?? '', /\shidden(?:\s|=|>)|aria-hidden="true"/u);
  const library = main.indexOf('id="certificaciones-materiales"');
  const controls = main.indexOf('data-directory-controls');
  const faq = main.indexOf('id="certificaciones-faq-title"');
  assert.ok(main.indexOf(map) < library && library < controls && controls < faq,
    'The complete map precedes the separately named library, and general answers follow it.');
  const navigation = links(main);
  for (const id of ['certificaciones-mapa', 'certificaciones-materiales', 'certificaciones-faq-title']) {
    assert.ok(navigation.some(({ href, label }) => href === `#${id}` && label), `A readable jump link reaches ${id}.`);
  }
});

for (const expected of offer.certifications) {
  test(`the map includes ${expected.name} (${expected.category}) without depending on resource matches`, () => {
    assert.ok(map, 'The editorial map exists even when certification resources are absent.');
    const rows = [...map.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gu)]
      .filter(([, body]) => text(body).includes(expected.codes[0]));
    assert.equal(rows.length, 1, 'Each credential has one row; versions do not become separate credentials.');
    assert.doesNotMatch(rows[0][0].match(/^<li\b[^>]*>/u)?.[0] ?? '', /\shidden(?:\s|=|>)|aria-hidden="true"/u);
    const row = rows[0][1];
    const precedingCategories = [...map.slice(0, rows[0].index).matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gu)];
    assert.equal(text(precedingCategories.at(-1)?.[1] ?? ''), expected.category, 'The credential belongs to its official category.');
    assert.match(text(row), new RegExp(escape(expected.name), 'u'));
    for (const code of expected.codes) assert.ok(text(row).includes(code), `${code}: explicit exam version.`);
    assert.match(text(row), new RegExp(expected.state, 'iu'), 'Current, beta, announced and retiring states are explicit.');
    assert.ok(links(row).some(({ href, label }) => {
      const url = new URL(href, 'https://dondeaprendoaws.com');
      return label && url.protocol === 'https:' && ['aws.amazon.com', 'docs.aws.amazon.com'].includes(url.hostname);
    }), 'A credential without local preparation still has an official destination.');
  });
}

test('the map preserves category meaning, transition scope and dated sources', () => {
  assert.ok(map, 'The map is rendered.');
  for (const category of new Set(offer.certifications.map(({ category }) => category))) {
    assert.match(map, new RegExp(`<h3\\b[^>]*>\\s*${category}\\s*<\\/h3>`, 'iu'), `${category}: official grouping.`);
  }
  assert.doesNotMatch(text(map), /MLS-C01|SOA-C02/u, 'Retired credentials are not represented as active offerings.');
  assert.deepEqual([...new Set(text(map).match(/\b[A-Z]{3}-C\d{2}\b/gu) ?? [])].sort(),
    offer.certifications.flatMap(({ codes }) => codes).sort(), 'The reviewed offer has neither missing nor invented exam versions.');
  const learningRow = [...map.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gu)]
    .map(([, row]) => row).find((row) => text(row).includes('MLA-C02')) ?? '';
  assert.match(text(learningRow), /idioma|ingl[eé]s/iu, 'The language-specific transition is explained.');
  assert.match(map, /<time\b[^>]*datetime="\d{4}-\d{2}-\d{2}"[^>]*>[^<]+<\/time>/u,
    'The checked facts have a visible review date.');
  assert.match(text(map), /revis|comprob|contrast/iu);
});

test('all general questions, answers and source links are present in static HTML', () => {
  const items = resolveResourceCollectionFaq(lookupResourceCollection(route), []);
  const faq = html.match(/<section\b[^>]*aria-labelledby="certificaciones-faq-title"[^>]*>[\s\S]*?<\/section>/u)?.[0] ?? '';
  assert.ok(faq, 'A visible, labelled general FAQ is rendered.');
  assert.doesNotMatch(faq, /<details\b|\shidden(?:\s|=|>)/u, 'Answers can be read without expanding a control or running JavaScript.');
  for (const { question, answer, links: sources = [] } of items) {
    assert.ok(text(faq).includes(question), `Question: ${question}`);
    assert.ok(text(faq).includes(answer), `Answer: ${question}`);
    for (const { href } of sources) assert.ok(links(faq).some((link) => link.href === href), `Source: ${href}`);
  }
  assert.doesNotMatch(html, /"@type"\s*:\s*"(?:FAQPage|BlogPosting)"/u);
});

test('existing discovery, canonical, indexing and sitemap contracts remain intact', () => {
  const canonicalTags = [...html.matchAll(/<link\b[^>]*\brel="canonical"[^>]*>/gu)].map(([tag]) => tag);
  assert.equal(canonicalTags.length, 1);
  assert.match(canonicalTags[0], /\bhref="https:\/\/dondeaprendoaws\.com\/aprender\/certificaciones\/"/u);
  const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
  const entry = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/gu)]
    .map(([, body]) => body).filter((body) => body.includes(`https://dondeaprendoaws.com${route}</loc>`));
  assert.equal(entry.length, 1);
  assert.doesNotMatch(entry[0], /<lastmod>/u, 'A build is not a new editorial review.');
  const robots = html.match(/<meta\b(?=[^>]*\bname="robots")[^>]*>/u)?.[0];
  if (process.env.PUBLIC_PRODUCTION === 'true') assert.equal(robots, undefined);
  else assert.match(robots ?? '', /content="noindex, nofollow"/u);
  for (const file of ['index.html', 'aprender/index.html']) {
    assert.ok(links(readFileSync(join(dist, file), 'utf8')).some(({ href }) => href === route), `${file}: existing HTML entry.`);
  }
  for (const { href } of links(main).filter(({ href }) => href.startsWith(route) && href !== route)) {
    const target = new URL(href, 'https://dondeaprendoaws.com');
    assert.ok(existsSync(join(dist, target.pathname.slice(1), 'index.html')), `No empty future destination: ${href}`);
  }
});

test('the generated search index contains the complete offer once', () => {
  const search = JSON.parse(readFileSync(join(dist, 'search-index.json'), 'utf8'));
  assert.equal(search.filter(({ url }) => url === route).length, 1);
  const indexed = search.find(({ url }) => url === route);
  for (const { codes } of offer.certifications) {
    for (const code of codes) assert.ok(indexed.search.includes(code), `${code}: searchable map content.`);
  }
});

for (const slug of ['aws-curso-certificado-guia-de-inicio', 'aws-curso-certificado-preparacion-para-el-examen']) {
  test(`${slug} offers a contextual continuation to the certification map`, () => {
    const article = readFileSync(join(dist, 'blog', slug, 'index.html'), 'utf8');
    const body = article.match(/<main\b[^>]*>([\s\S]*?)<\/main>/u)?.[1] ?? '';
    assert.ok(links(body).some(({ href, label }) => {
      const target = new URL(href, 'https://dondeaprendoaws.com');
      return target.origin === 'https://dondeaprendoaws.com' && target.pathname === route
        && /certificaciones|ex[aá]menes|mapa/iu.test(label);
    }), 'A descriptive article link reaches the new map rather than relying only on the site menu.');
    const canonical = [...article.matchAll(/<link\b[^>]*\brel="canonical"[^>]*>/gu)].map(([tag]) => tag);
    assert.equal(canonical.length, 1);
    assert.ok(canonical[0].includes(`href="https://dondeaprendoaws.com/blog/${slug}/"`),
      'The article keeps its own URL and canonical.');
  });
}

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const dist = resolve('dist');
const mapRoute = '/aprender/certificaciones/';
const certificationPages = [
  {
    route: `${mapRoute}cloud-practitioner/`,
    name: /cloud practitioner/iu,
    code: 'CLF-C02',
    guide: /cloud-practitioner-02/iu,
    libraryGroup: 'cloud-practitioner',
    faqTopics: [/experiencia|requisito|obligatorio/iu, /solutions architect|saa-c03|ai practitioner/iu],
  },
  {
    route: `${mapRoute}solutions-architect-associate/`,
    name: /solutions architect/iu,
    code: 'SAA-C03',
    guide: /solutions-architect-associate-03/iu,
    libraryGroup: 'solutions-architect',
    faqTopics: [/cloud practitioner|clf-c02/iu, /professional|sap-c02/iu],
  },
  {
    route: `${mapRoute}ai-practitioner/`,
    name: /ai practitioner/iu,
    code: 'AIF-C01',
    guide: /ai-practitioner-01/iu,
    libraryGroup: 'ai-practitioner',
    faqTopics: [/program(?:ar|aci[oó]n)|c[oó]digo|machine learning engineer/iu, /ia responsable|gobernanza|responsable/iu],
  },
];

// Read only inside each test so a not-yet-generated route fails as an ordinary,
// route-specific assertion instead of aborting module loading with ENOENT.
function readBuiltRoute(route, purpose = 'certification page') {
  const file = join(dist, route === '/' ? 'index.html' : `${route.slice(1)}index.html`);
  assert.ok(existsSync(file), `Missing generated ${purpose} route ${route}; expected ${file}. Build the site before running acceptance.`);
  return readFileSync(file, 'utf8');
}

function readBuiltFile(relativePath, purpose) {
  const file = join(dist, relativePath);
  assert.ok(existsSync(file), `Missing generated ${purpose}: ${file}. Build the site before running acceptance.`);
  return readFileSync(file, 'utf8');
}

const decode = (value) => value.replace(/&#(?:x([\da-f]+)|(\d+));/giu,
  (_, hex, decimal) => String.fromCodePoint(Number.parseInt(hex ?? decimal, hex ? 16 : 10)))
  .replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'")
  .replaceAll('&#x27;', "'").replaceAll('&apos;', "'").replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>').replaceAll('&nbsp;', ' ');
const text = (source) => decode(source.replace(/<(script|style)\b[\s\S]*?<\/\1>/giu, '')
  .replace(/<[^>]*>/gu, ' ')).replace(/\s+/gu, ' ').trim();
const links = (source) => [...source.matchAll(/<a\b(?=[^>]*\bhref="([^"]+)")[^>]*>([\s\S]*?)<\/a>/giu)]
  .map(([, href, label]) => ({ href: decode(href), label: text(label) }));
const mainOf = (html, route) => {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/iu)?.[1] ?? '';
  assert.ok(main, `${route}: generated HTML has a main landmark.`);
  return main;
};

function headingSection(source, expression) {
  const headings = [...source.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/giu)];
  const position = headings.findIndex(([, heading]) => expression.test(text(heading)));
  if (position < 0) return '';
  return source.slice(headings[position].index, headings[position + 1]?.index ?? source.length);
}

function sectionById(source, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const start = source.match(new RegExp(`<section\\b[^>]*\\bid="${escaped}"[^>]*>`, 'u'));
  if (!start) return '';
  const boundaries = /<\/?section\b[^>]*>/giu;
  boundaries.lastIndex = start.index + start[0].length;
  let depth = 1;
  for (let token; (token = boundaries.exec(source));) {
    depth += token[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return source.slice(start.index, boundaries.lastIndex);
  }
  return '';
}

function assertCanonical(html, expected, label) {
  const canonical = [...html.matchAll(/<link\b[^>]*\brel="canonical"[^>]*>/giu)];
  assert.equal(canonical.length, 1, `${label}: one canonical URL is rendered.`);
  assert.equal(decode(canonical[0][0].match(/\bhref="([^"]+)"/iu)?.[1] ?? ''), expected,
    `${label}: canonical identifies its own public URL.`);
}

function isOfficialAwsLink(href) {
  try {
    const url = new URL(href, 'https://dondeaprendoaws.com');
    return url.protocol === 'https:' && [
      'aws.amazon.com', 'docs.aws.amazon.com', 'skillbuilder.aws', 'aws.training',
    ].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function assertFaq(page, main) {
  const faq = main.match(/<section\b(?=[^>]*\bclass="[^"]*\bpage-faq\b[^"]*")[\s\S]*?<\/section>/iu)?.[0] ?? '';
  assert.ok(faq, `${page.route}: an exam-specific FAQ is present.`);
  assert.match(faq, /<h[23]\b[^>]*>[^<]*preguntas frecuentes/iu, `${page.route}: the FAQ has a visible heading.`);
  const faqContainer = faq.match(/^<section\b[^>]*>/iu)?.[0] ?? '';
  assert.doesNotMatch(faqContainer, /\shidden(?:\s|=|>)|aria-hidden="true"/iu,
    `${page.route}: the FAQ container itself remains available to all readers.`);
  assert.doesNotMatch(faq, /<details\b|\shidden(?:\s|=|>)/iu,
    `${page.route}: answers are available in the generated page without JavaScript or expansion.`);
  assert.match(text(faq), /¿[^?]+\?/u, `${page.route}: the FAQ contains visible questions and answers.`);
  for (const topic of page.faqTopics) {
    assert.match(text(faq), topic, `${page.route}: FAQ minimum coverage includes ${topic}.`);
  }
  assert.doesNotMatch(faq, /"@type"\s*:\s*"FAQPage"/u,
    `${page.route}: visible FAQs do not imply FAQ rich-result markup.`);
  return faq;
}

function assertDetailsPage(page) {
  const html = readBuiltRoute(page.route);
  const main = mainOf(html, page.route);
  const bodyText = text(main);
  const heading = main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? '';
  assert.match(text(heading), page.name, `${page.route}: H1 identifies its certification.`);
  assert.ok(bodyText.includes(page.code), `${page.route}: current exam code is visible.`);
  assert.match(text(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? ''), page.name,
    `${page.route}: document title reflects its exam-specific purpose.`);
  const description = html.match(/<meta\b(?=[^>]*\bname="description")[^>]*>/iu)?.[0]
    ?.match(/\bcontent="([^"]*)"/iu)?.[1] ?? '';
  assert.match(decode(description), page.name, `${page.route}: description reflects its exam-specific purpose.`);

  const exam = headingSection(main, /^el examen\b/iu);
  assert.ok(exam, `${page.route}: exam facts have a distinct section.`);
  const examText = text(exam);
  for (const [label, pattern] of [
    ['exam code', new RegExp(page.code, 'u')],
    ['duration', /duraci[oó]n|minutos?/iu],
    ['format or question count', /formato|preguntas?/iu],
    ['languages', /idiomas?/iu],
    ['base price', /precio|usd|d[oó]lares/iu],
    ['validity', /vigencia|v[aá]lida|a[nñ]os/iu],
    ['experience and requirements', /experiencia/iu],
    ['recommendation distinct from a requirement', /recomendad|requisito|obligatorio/iu],
  ]) assert.match(examText, pattern, `${page.route}: exam facts include ${label}.`);

  const domains = headingSection(main, /^qu[eé] eval[uú]a\b/iu);
  assert.ok(domains, `${page.route}: exam-domain summary has a distinct section.`);
  assert.match(domains, /\b\d{1,3}\s?%/u, `${page.route}: domain weights are visible.`);
  assert.ok(links(domains).some(({ href }) => isOfficialAwsLink(href) && page.guide.test(href)),
    `${page.route}: domain summary links to the official exam guide.`);

  const preparation = headingSection(main, /^c[oó]mo prepararte\b/iu);
  assert.ok(preparation, `${page.route}: preparation guidance has a distinct section.`);
  const orderedSteps = [...preparation.matchAll(/<ol\b[^>]*>([\s\S]*?)<\/ol>/giu)]
    .flatMap(([, list]) => [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/giu)].map(([, item]) => text(item)))
    .filter(Boolean);
  assert.ok(orderedSteps.length, `${page.route}: preparation gives a readable ordered study sequence.`);

  const resources = headingSection(main, /^recursos seleccionados\b/iu);
  assert.ok(resources, `${page.route}: selected resources have a distinct section.`);
  assert.ok(text(resources), `${page.route}: resource guidance remains useful if community material is absent.`);
  assert.ok(links(resources).some(({ href }) => isOfficialAwsLink(href)),
    `${page.route}: useful official preparation remains linked even when there is no community selection.`);

  const libraryUrl = links(main).find(({ href }) => {
    const url = new URL(href, 'https://dondeaprendoaws.com');
    return url.pathname === mapRoute && url.searchParams.get('group') === page.libraryGroup;
  });
  assert.ok(libraryUrl, `${page.route}: a direct link returns to the existing certification material group.`);
  assert.match(libraryUrl.label, /material|recurso|explor/iu, `${page.route}: the library link explains its destination.`);
  assert.ok(links(main).some(({ href, label }) => {
    const url = new URL(href, 'https://dondeaprendoaws.com');
    return url.pathname === mapRoute && url.hash === '#certificaciones-mapa' && label;
  }), `${page.route}: a descriptive link returns to the complete certification map.`);

  const reviewDate = [...main.matchAll(/<time\b[^>]*\bdatetime="\d{4}-\d{2}-\d{2}"[^>]*>[\s\S]*?<\/time>/giu)];
  assert.ok(reviewDate.length, `${page.route}: official facts have a visible dated review.`);
  assert.match(bodyText, /revisad|revisi[oó]n/iu, `${page.route}: the review date is identified as editorial review.`);
  assert.ok(links(main).some(({ href }) => isOfficialAwsLink(href)),
    `${page.route}: at least one official AWS reference is available.`);
  assertFaq(page, main);

  assertCanonical(html, `https://dondeaprendoaws.com${page.route}`, page.route);
  const robots = html.match(/<meta\b(?=[^>]*\bname="robots")[^>]*>/iu)?.[0];
  if (process.env.PUBLIC_PRODUCTION === 'true') assert.equal(robots, undefined, `${page.route}: production remains indexable.`);
  else assert.match(robots ?? '', /content="noindex, nofollow"/iu, `${page.route}: preview stays excluded from indexing.`);

  const sitemap = readBuiltFile('sitemap.xml', 'sitemap');
  const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/giu)]
    .map(([, entry]) => entry).filter((entry) => entry.includes(`https://dondeaprendoaws.com${page.route}</loc>`));
  assert.equal(entries.length, 1, `${page.route}: canonical appears once in the sitemap.`);
  assert.doesNotMatch(entries[0], /<lastmod>/iu, `${page.route}: the review date is not mislabeled as last modification.`);

  const searchIndex = JSON.parse(readBuiltFile('search-index.json', 'search index'));
  const indexedPages = searchIndex.filter(({ url }) => url === page.route);
  assert.equal(indexedPages.length, 1, `${page.route}: search indexes the detail route once.`);
  assert.ok(indexedPages[0].search?.includes(page.code), `${page.route}: the exam code is searchable.`);
  assert.match(indexedPages[0].search, /prepar/iu, `${page.route}: preparation intent is searchable.`);
}

for (const page of certificationPages) {
  test(`${page.code}: public detail page, exam guidance, resources, FAQ and SEO`, () => assertDetailsPage(page));
}

test('the complete certification map links each supported exam row to its detail page', () => {
  const html = readBuiltRoute(mapRoute, 'certification map');
  const main = mainOf(html, mapRoute);
  const map = sectionById(main, 'certificaciones-mapa');
  assert.ok(map, 'The existing certification map remains a public section.');
  for (const page of certificationPages) {
    const rows = [...map.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/giu)]
      .filter(([, row]) => text(row).includes(page.code));
    assert.equal(rows.length, 1, `${page.code}: one credential row remains in the complete map.`);
    assert.ok(links(rows[0][1]).some(({ href, label }) => href === page.route && /gu[ií]a|recurso|prepar/iu.test(label)),
      `${page.code}: its map row has a descriptive link to ${page.route}.`);
  }
});

const contextualArticles = [
  {
    slug: 'recursos-en-espanol-para-certificacion-aws-cloud-practitioner',
    pages: [certificationPages[0]],
  },
  {
    slug: 'guia-de-estudio-aws-certified-cloud-practitioner-clf-c02',
    pages: [certificationPages[0]],
  },
  {
    slug: 'checklist-servicios-aws-esenciales-para-saa-c03',
    pages: [certificationPages[1]],
  },
  {
    slug: 'aws-curso-certificado-guia-de-inicio',
    pages: certificationPages,
  },
  {
    slug: 'aws-curso-certificado-preparacion-para-el-examen',
    pages: certificationPages,
  },
];

for (const article of contextualArticles) {
  test(`${article.slug}: contextual certification links preserve the article URL`, () => {
    const route = `/blog/${article.slug}/`;
    const html = readBuiltRoute(route, 'contextual blog article');
    const main = mainOf(html, route);
    const bodyLinks = links(main);
    for (const page of article.pages) {
      const matching = bodyLinks.filter(({ href }) => new URL(href, 'https://dondeaprendoaws.com').pathname === page.route);
      assert.ok(matching.some(({ label }) => label && (page.name.test(label) || label.includes(page.code))),
        `${route}: a descriptive in-article link continues to ${page.route}.`);
    }
    assertCanonical(html, `https://dondeaprendoaws.com${route}`, route);
  });
}

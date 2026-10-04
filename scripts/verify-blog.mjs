import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { BLOG_CONTRIBUTORS } from '../src/lib/blog-contributors.mjs';
import { createBlogMetadataSchema, contributorStructuredData, formatBlogDate } from '../src/lib/blog-metadata.mjs';
import deployment from '../config/deployment.json' with { type: 'json' };
import { LEARNING_PATHS, learningPathHref } from '../src/lib/learning-paths.mjs';

const dist = resolve('dist');
const production = process.env.PUBLIC_PRODUCTION === 'true';
const mediaOrigin = new URL(process.env.PUBLIC_SITE_ORIGIN || `https://${deployment.branchName}.${deployment.appId}.amplifyapp.com`).origin;
const expected = JSON.parse(readFileSync('tests/fixtures/blog-index.json', 'utf8'));
const archive = JSON.parse(readFileSync('tests/fixtures/blog-routes.json', 'utf8'));
const metadataSchema = createBlogMetadataSchema(BLOG_CONTRIBUTORS);
const read = (path) => readFileSync(resolve(dist, path), 'utf8');
const decode = (value) => value
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&#x27;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');

assert.equal(expected.length, 6, 'Featured index fixture must contain the six selected articles.');
assert.equal(archive.length, 196, 'Original sitemap fixture must contain 196 articles.');
assert.equal(new Set(archive.map(({ slug }) => slug)).size, 196, 'Original article slugs must be unique.');
const index = read('blog/index.html');
const indexUrls = [...index.matchAll(/<a\b[^>]*class="blog-card"[^>]*href="([^"]+)"/g)]
  .map((match) => match[1]);
assert.deepEqual(indexUrls, expected.map(({ slug }) => `/blog/${slug}/`));
const archiveHtml = index.match(/<section class="blog-archive"[\s\S]*?<\/section>/)?.[0] ?? '';
const archiveUrls = [...archiveHtml.matchAll(/<li><a href="(\/blog\/[^\"]+\/)">/g)].map((match) => match[1]);
const allIndexUrls = [...indexUrls, ...archiveUrls];
assert.equal(archiveUrls.length, archive.length - expected.length, 'Every non-featured article must be linked in the archive.');
assert.deepEqual([...allIndexUrls].sort(), archive.map(({ slug }) => `/blog/${slug}/`).sort());
assert.equal(new Set(allIndexUrls).size, archive.length, 'Blog index must not duplicate article destinations.');
assert.match(index, /<link rel="canonical" href="https:\/\/dondeaprendoaws\.com\/blog\/"/);
assert.match(index, /<meta name="twitter:url" content="https:\/\/dondeaprendoaws\.com\/blog\/"/);
assert.match(index, /<meta name="twitter:card" content="summary_large_image"/);
assert.equal(index.match(/<meta property="og:image" content="([^"]+)"/)?.[1], `${mediaOrigin}/assets/site-social.png`);
assert.match(index, /<meta property="og:type" content="website"/);

const generated = readdirSync(resolve(dist, 'blog'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(generated, archive.map(({ slug }) => slug).sort());

const allPages = [index];
const assetPaths = new Set();
const pathMembership = new Map();
let modifiedArticles = 0;
let reviewedArticles = 0;
for (const { id } of LEARNING_PATHS) {
  const detail = read(`recorridos/${id}/index.html`);
  const title = decode(detail.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '');
  const section = detail.match(/<section class="learning-path-detail__steps"[\s\S]*?<\/section>/u)?.[0] ?? '';
  const steps = [...section.matchAll(/<a class="learning-path-detail__step" href="([^"]+)">[\s\S]*?<strong>([^<]+)<\/strong>/g)]
    .map(([, href, title]) => ({ href: decode(href), title: decode(title) }));
  assert.ok(title && steps.length >= 2, `Rendered learning path must be readable: ${id}`);
  steps.forEach((step, position) => {
    if (!step.href.startsWith('/blog/')) return;
    const memberships = pathMembership.get(step.href) ?? [];
    memberships.push({ title, href: learningPathHref(id), nextStep: steps[position + 1] ?? null });
    pathMembership.set(step.href, memberships);
  });
}
assert.equal(pathMembership.size, 9, 'Existing paths must identify their nine blog articles.');
for (const article of archive) {
  const html = read(`blog/${article.slug}/index.html`);
  const source = readFileSync(`src/content/blog/${article.slug}.md`, 'utf8');
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
  assert.ok(frontmatter, `Frontmatter missing: ${article.slug}`);
  const data = metadataSchema.parse(parseYaml(frontmatter));
  assert.equal(data.publishedAt, article.publishedAt, `Original publication day changed: ${article.slug}`);
  assert.equal(data.publishedTimestamp, article.publishedTimestamp, `Original publication timestamp changed: ${article.slug}`);
  const structuredData = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .map(([, json]) => JSON.parse(json));
  const blogPostings = structuredData.filter((node) => node['@type'] === 'BlogPosting');
  assert.equal(blogPostings.length, 1, `Exactly one BlogPosting is required: ${article.slug}`);
  const posting = blogPostings[0];
  const author = BLOG_CONTRIBUTORS[data.author];
  assert.deepEqual(posting.author, contributorStructuredData(author), `Confirmed structured author: ${article.slug}`);
  assert.equal(posting.datePublished, article.publishedTimestamp, `Exact original datePublished: ${article.slug}`);
  assert.equal(posting.dateModified, data.modifiedTimestamp, `Only declared significant modifications: ${article.slug}`);
  assert.equal(html.match(/<meta property="article:published_time" content="([^"]+)"/)?.[1], article.publishedTimestamp);
  assert.equal(html.match(/<meta property="article:modified_time" content="([^"]+)"/)?.[1], data.modifiedTimestamp);
  const metadata = html.match(/<div class="blog-article__metadata"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(metadata, `Common article metadata missing: ${article.slug}`);
  const authorRow = metadata.match(/<p>Por ([\s\S]*?)<\/p>/)?.[1] ?? '';
  assert.equal(decode(authorRow.replace(/<[^>]*>/g, '')), author.name, `Visible author: ${article.slug}`);
  assert.equal(decode(authorRow.match(/<a href="([^"]+)" rel="author">/)?.[1] ?? '') || undefined, author.url,
    `Confirmed author profile: ${article.slug}`);
  const times = [...metadata.matchAll(/<time datetime="([^"]+)">([^<]+)<\/time>/g)]
    .map(([, datetime, text]) => [datetime, decode(text)]);
  const expectedTimes = [[article.publishedTimestamp, formatBlogDate(article.publishedAt)]];
  assert.match(metadata, /Publicado el <time /);
  assert.equal(metadata.includes('Actualizado el '), Boolean(data.modifiedTimestamp), `Modification label: ${article.slug}`);
  if (data.modifiedTimestamp) {
    modifiedArticles++;
    expectedTimes.push([data.modifiedTimestamp, formatBlogDate(data.modifiedTimestamp.slice(0, 10))]);
  }
  assert.equal(metadata.includes('Revisado '), Boolean(data.review), `Review label: ${article.slug}`);
  if (data.review) {
    reviewedArticles++;
    expectedTimes.push([data.review.date, formatBlogDate(data.review.date)]);
    const reviewer = data.review.by && BLOG_CONTRIBUTORS[data.review.by];
    const reviewRow = metadata.match(/<p>(Revisado [\s\S]*?)<\/p>/)?.[1] ?? '';
    const expectedPrefix = reviewer ? `Revisado por ${reviewer.name} el ` : 'Revisado el ';
    assert.ok(decode(reviewRow.replace(/<[^>]*>/g, '')).startsWith(expectedPrefix), `Visible review identity: ${article.slug}`);
    assert.equal(decode(reviewRow.match(/<a href="([^"]+)"/)?.[1] ?? '') || undefined, reviewer?.url,
      `Confirmed reviewer profile: ${article.slug}`);
    if (data.review.note) assert.ok(decode(reviewRow).includes(` · ${data.review.note}`), `Review context: ${article.slug}`);
  }
  assert.deepEqual(times, expectedTimes, `Semantic and visible dates agree: ${article.slug}`);
  assert.doesNotMatch(html, /<em>Revisado el (?:29|30) de septiembre de 2026/, `No duplicate manual review: ${article.slug}`);
  allPages.push(html);
  const memberships = pathMembership.get(`/blog/${article.slug}/`) ?? [];
  const pathNav = html.match(/<nav class="blog-paths"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.equal(Boolean(pathNav), memberships.length > 0, `Path membership section: ${article.slug}`);
  if (pathNav) {
    const items = [...pathNav.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, item]) => item);
    assert.equal(items.length, memberships.length, `Every path membership is shown: ${article.slug}`);
    memberships.forEach((membership, position) => {
      const item = items[position];
      assert.ok(decode(item).includes(membership.title), `Path identity: ${article.slug}`);
      assert.equal(item.match(/class="blog-paths__return" href="([^"]+)"/)?.[1], membership.href,
        `Return to the actual path section: ${article.slug}`);
      const nextLink = item.match(/class="blog-paths__next" href="([^"]+)"/)?.[1];
      if (membership.nextStep) {
        assert.equal(decode(nextLink ?? ''), membership.nextStep.href, `Next rendered path step: ${article.slug}`);
        assert.ok(decode(item).includes(membership.nextStep.title), `Next step title: ${article.slug}`);
        assert.doesNotMatch(item, /blog-paths__end/, `Non-final article must offer continuation: ${article.slug}`);
      } else {
        assert.equal(nextLink, undefined, `Final article must not invent a next step: ${article.slug}`);
        assert.match(item, /Llegaste al final de este recorrido\./);
      }
    });
  }
  assert.ok(html.includes(`<h1>${article.title}</h1>`), `Title mismatch: ${article.slug}`);
  const description = html.match(/<meta name="description" content="([^"]*)"/);
  assert.ok(decode(description?.[1] ?? '').length > 0, `Description missing: ${article.slug}`);
  const indexed = expected.find(({ slug }) => slug === article.slug);
  if (indexed) {
    assert.equal(decode(description?.[1] ?? ''), indexed.description, `Description mismatch: ${article.slug}`);
    assert.ok(html.includes(`"datePublished":"${indexed.publishedAt}`), `Original publication date mismatch: ${article.slug}`);
  }
  assert.ok(html.includes(`href="https://dondeaprendoaws.com/blog/${article.slug}/"`), `Canonical mismatch: ${article.slug}`);
  assert.match(html, /"datePublished":"\d{4}-\d{2}-\d{2}T/, `Publication date missing: ${article.slug}`);
  assert.match(html, /<article class="blog-article__body">/, `Body missing: ${article.slug}`);
  const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  assert.ok(ogImage?.startsWith(`${mediaOrigin}/assets/blog/`), `Owned social image missing: ${article.slug}`);
  assert.match(html, /<meta property="og:type" content="article"/, `Open Graph article type: ${article.slug}`);
  const ogImageAlt = decode(html.match(/<meta property="og:image:alt" content="([^"]*)"/)?.[1] ?? '');
  assert.ok(ogImageAlt.trim(), `Social image alternative missing: ${article.slug}`);
  assert.doesNotMatch(ogImageAlt, /^Thumbnail for:/, `Social image alternative must describe the image: ${article.slug}`);
  const ogFile = resolve(dist, `.${new URL(ogImage).pathname}`);
  assert.ok(ogFile.startsWith(`${dist}/`) && existsSync(ogFile), `Social image file missing: ${article.slug}`);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
  assert.ok(html.includes(`<meta name="twitter:url" content="https://dondeaprendoaws.com/blog/${article.slug}/"`));
  assert.equal(decode(html.match(/<meta name="twitter:title" content="([^"]*)"/)?.[1] ?? ''), article.title);
  assert.equal(decode(html.match(/<meta name="twitter:description" content="([^"]*)"/)?.[1] ?? ''), decode(description?.[1] ?? ''));
  assert.equal(html.match(/<meta name="twitter:image" content="([^"]+)"/)?.[1], ogImage);
}

for (const html of allPages) {
  for (const menu of ['blog-header__links', 'blog-header__mobile-links']) {
    const navigation = html.match(new RegExp(`<div class="${menu}">([\\s\\S]*?)<\\/div>`))?.[1] ?? '';
    const links = [...navigation.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)]
      .map(([, href, text]) => [href, text]);
    assert.deepEqual(links, [['/', 'Inicio'], ['/aprender/', 'Aprender'], ['/recorridos/', 'Rutas'],
      ['/blog/', 'Blog'], ['/buscar/', 'Buscar']], `Complete blog menu: ${menu}`);
  }
  if (production) {
    assert.doesNotMatch(html, /<meta name="robots" content="noindex, nofollow"/);
  } else {
    assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  }
  assert.doesNotMatch(html, /(?:unicornplatform\.com|seobotai\.com|mars-images\.imgix\.net|googletagmanager\.com)/i);
  assert.doesNotMatch(html, /<a\b[^>]*href="\s*javascript:/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  for (const [, attributes] of html.matchAll(/<script\b([^>]*)>/gi)) {
    if (production && /\bsrc="\/assets\/analytics\.js"/.test(attributes)) {
      continue;
    }
    assert.match(attributes, /\btype="application\/ld\+json"/, 'Blog scripts must be inert structured data.');
  }
  for (const [, src] of html.matchAll(/<iframe\b[^>]*\bsrc="([^"]+)"/gi)) {
    assert.match(src, /^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\//, `Unexpected video embed: ${src}`);
  }
  for (const [, src] of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
    assert.ok(src.startsWith('/assets/blog/'), `Non-local blog image: ${src}`);
    const file = resolve(dist, `.${src}`);
    assert.ok(file.startsWith(`${dist}/`) && existsSync(file), `Missing blog image: ${src}`);
    assetPaths.add(src);
  }
}

const articleWithTable = read('blog/como-reducir-costos-de-transferencia-intra-region-en-aws/index.html');
assert.match(articleWithTable, /<table\b/);
assert.match(articleWithTable, /"@type":"FAQPage"/);
const articleWithoutBodyImages = read('blog/cors-en-websocket-vs-rest-api-gateway/index.html');
const body = articleWithoutBodyImages.match(/<article class="blog-article__body">([\s\S]*?)<\/article>/)?.[1] ?? '';
assert.doesNotMatch(body, /<img\b/);

const articlesWithCodeComments = [
  {
    slug: 'como-crear-infraestructura-como-codigo-en-aws-con-terraform',
    comments: ['# Para instalar Apache', '# otras configuraciones...'],
  },
  {
    slug: 'integrar-amazon-polly-en-5-pasos-texto-a-voz-realista',
    comments: ['# Crea un cliente de Polly', '# Guarda el audio en un archivo'],
  },
];
for (const { slug, comments } of articlesWithCodeComments) {
  const html = read(`blog/${slug}/index.html`);
  assert.equal([...html.matchAll(/<h1\b/gi)].length, 1, `Code comments must not become article headings: ${slug}`);
  const codeBlocks = [...html.matchAll(/<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi)]
    .map(([, code]) => decode(code.replace(/<[^>]*>/g, '')));
  for (const comment of comments) {
    assert.ok(codeBlocks.some((code) => code.includes(comment)), `Code comment missing from its code block: ${slug}: ${comment}`);
  }
}

console.log(`Verified ${archive.length} confirmed authors and exact original publication dates, ${modifiedArticles} declared modifications, ${reviewedArticles} reviews, ${expected.length} featured cards, ${archiveUrls.length} archive links, ${pathMembership.size} article path continuations, both blog menus, and ${assetPaths.size} owned images.`);

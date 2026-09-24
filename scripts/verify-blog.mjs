import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import deployment from '../config/deployment.json' with { type: 'json' };

const dist = resolve('dist');
const mediaOrigin = new URL(process.env.PUBLIC_SITE_ORIGIN || `https://${deployment.branchName}.${deployment.appId}.amplifyapp.com`).origin;
const expected = JSON.parse(readFileSync('tests/fixtures/blog-index.json', 'utf8'));
const read = (path) => readFileSync(resolve(dist, path), 'utf8');
const decode = (value) => value
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&#x27;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');

assert.equal(expected.length, 15, 'Source index fixture must contain 15 articles.');
const index = read('blog/index.html');
const indexUrls = [...index.matchAll(/<a\b[^>]*class="blog-card"[^>]*href="([^"]+)"/g)]
  .map((match) => match[1]);
assert.deepEqual(indexUrls, expected.map(({ slug }) => `/blog/${slug}/`));
assert.match(index, /<link rel="canonical" href="https:\/\/dondeaprendoaws\.com\/blog\/"/);
assert.match(index, /<meta name="twitter:url" content="https:\/\/dondeaprendoaws\.com\/blog\/"/);
assert.doesNotMatch(index, /<meta name="twitter:(?:card|image)"/);

const generated = readdirSync(resolve(dist, 'blog'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(generated, expected.map(({ slug }) => slug).sort());

const allPages = [index];
const assetPaths = new Set();
for (const article of expected) {
  const html = read(`blog/${article.slug}/index.html`);
  allPages.push(html);
  assert.ok(html.includes(`<h1>${article.title}</h1>`), `Title mismatch: ${article.slug}`);
  const description = html.match(/<meta name="description" content="([^"]*)"/);
  assert.equal(decode(description?.[1] ?? ''), article.description, `Description mismatch: ${article.slug}`);
  assert.ok(html.includes(`href="https://dondeaprendoaws.com/blog/${article.slug}/"`), `Canonical mismatch: ${article.slug}`);
  assert.ok(html.includes(`"datePublished":"${article.publishedAt}`), `Publication date missing: ${article.slug}`);
  assert.match(html, /<article class="blog-article__body">/, `Body missing: ${article.slug}`);
  const ogImage = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  assert.ok(ogImage?.startsWith(`${mediaOrigin}/assets/blog/`), `Owned social image missing: ${article.slug}`);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
  assert.ok(html.includes(`<meta name="twitter:url" content="https://dondeaprendoaws.com/blog/${article.slug}/"`));
  assert.equal(decode(html.match(/<meta name="twitter:title" content="([^"]*)"/)?.[1] ?? ''), article.title);
  assert.equal(decode(html.match(/<meta name="twitter:description" content="([^"]*)"/)?.[1] ?? ''), article.description);
  assert.equal(html.match(/<meta name="twitter:image" content="([^"]+)"/)?.[1], ogImage);
}

for (const html of allPages) {
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(html, /(?:unicornplatform\.com|seobotai\.com|mars-images\.imgix\.net|googletagmanager\.com)/i);
  assert.doesNotMatch(html, /<a\b[^>]*href="\s*javascript:/i);
  assert.doesNotMatch(html, /<iframe\b|\son[a-z]+\s*=/i);
  for (const [, attributes] of html.matchAll(/<script\b([^>]*)>/gi)) {
    assert.match(attributes, /\btype="application\/ld\+json"/, 'Blog scripts must be inert structured data.');
  }
  for (const [, src] of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
    assert.ok(src.startsWith('/assets/blog/'), `Non-local blog image: ${src}`);
    const file = resolve(dist, `.${src}`);
    assert.ok(file.startsWith(`${dist}/`) && existsSync(file), `Missing blog image: ${src}`);
    assetPaths.add(src);
  }
}

const articleWithTable = read(`blog/${expected[0].slug}/index.html`);
assert.match(articleWithTable, /<table\b/);
assert.match(articleWithTable, /"@type":"FAQPage"/);
const articleWithoutBodyImages = read('blog/cors-en-websocket-vs-rest-api-gateway/index.html');
const body = articleWithoutBodyImages.match(/<article class="blog-article__body">([\s\S]*?)<\/article>/)?.[1] ?? '';
assert.doesNotMatch(body, /<img\b/);

console.log(`Verified blog index, ${expected.length} article routes, and ${assetPaths.size} owned images.`);

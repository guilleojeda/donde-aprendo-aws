import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';
import { siteOutputRoot } from '../../scripts/lib/site-output.mjs';
import { BLOG_CONTRIBUTORS } from '../../src/lib/blog-contributors.mjs';

const articleIndexPath = join(siteOutputRoot, 'article-index.json');
const blogSourceRoot = 'src/content/blog';
const siteOrigin = 'https://dondeaprendoaws.com';

function readArticleSources() {
  return readdirSync(blogSourceRoot)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => {
      const source = readFileSync(join(blogSourceRoot, name), 'utf8');
      const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1];
      assert.ok(frontmatter, `${name}: article frontmatter exists.`);
      return {
        slug: name.slice(0, -'.md'.length),
        data: parseYaml(frontmatter),
      };
    });
}

test('the public article index is complete, metadata-only and present in Amplify static output', () => {
  // Amplify serves this emitted static inventory before its Compute fallback for file paths.
  assert.ok(existsSync(articleIndexPath),
    `Missing generated static article index: ${articleIndexPath}. Build the site before running acceptance.`);
  const index = JSON.parse(readFileSync(articleIndexPath, 'utf8'));
  assert.deepEqual(Object.keys(index).sort(), ['articles', 'schemaVersion', 'source'],
    'The root contains only the version, source identity and article list.');
  assert.equal(index.schemaVersion, 1);
  assert.deepEqual(index.source, { id: 'donde-aprendo-aws', label: 'Dónde Aprendo AWS' });
  assert.ok(Array.isArray(index.articles), 'The index contains an article array.');

  const sources = readArticleSources();
  assert.equal(new Set(sources.map(({ slug }) => slug)).size, sources.length,
    'The public Markdown corpus has unique article paths.');
  assert.equal(index.articles.length, sources.length,
    'Every current public Markdown article appears exactly once.');

  const articleByUrl = new Map();
  for (const article of index.articles) {
    assert.deepEqual(Object.keys(article).sort(), ['author', 'language', 'publishedAt', 'title', 'url'],
      'Each article contains only the approved public metadata fields.');
    assert.deepEqual(Object.keys(article.author ?? {}).sort(), ['name', 'url'],
      'Author identity contains only its public name and profile URL.');
    assert.equal(typeof article.url, 'string');
    assert.ok(!articleByUrl.has(article.url), `Duplicate public article URL: ${article.url}`);
    articleByUrl.set(article.url, article);
  }

  const expectedUrls = new Set();
  for (const { slug, data } of sources) {
    const contributor = BLOG_CONTRIBUTORS[data.author];
    assert.ok(contributor, `${slug}: frontmatter resolves to a declared public contributor.`);
    const url = `${siteOrigin}/blog/${slug}/`;
    expectedUrls.add(url);
    const article = articleByUrl.get(url);
    assert.ok(article, `${slug}: its canonical public HTTPS URL appears in the index.`);
    assert.deepEqual(article, {
      title: data.title,
      language: 'es',
      publishedAt: data.publishedAt,
      url,
      author: { name: contributor.name, url: contributor.url ?? null },
    }, `${slug}: index metadata matches current public frontmatter and contributor identity.`);
    assert.equal(new URL(article.url).origin, siteOrigin, `${slug}: canonical URL uses the public site origin.`);
    assert.match(article.publishedAt, /^\d{4}-\d{2}-\d{2}$/u,
      `${slug}: original publication date remains date-only.`);
  }
  assert.deepEqual([...articleByUrl.keys()].sort(), [...expectedUrls].sort(),
    'The index has no unexpected or missing article destinations.');

  const dateTrap = sources.find(({ data }) =>
    (data.modifiedTimestamp && data.modifiedTimestamp.slice(0, 10) !== data.publishedAt)
    || (data.review?.date && data.review.date !== data.publishedAt));
  assert.ok(dateTrap, 'The source corpus exercises distinct original and editorial dates.');
  const dateTrapUrl = `${siteOrigin}/blog/${dateTrap.slug}/`;
  const competingDate = dateTrap.data.modifiedTimestamp
    && dateTrap.data.modifiedTimestamp.slice(0, 10) !== dateTrap.data.publishedAt
    ? dateTrap.data.modifiedTimestamp.slice(0, 10)
    : dateTrap.data.review.date;
  const indexedOriginalDate = articleByUrl.get(dateTrapUrl).publishedAt;
  assert.notEqual(dateTrap.data.publishedAt, competingDate,
    'The discriminating article has a modification or review date distinct from its original publication.');
  assert.equal(indexedOriginalDate, dateTrap.data.publishedAt,
    'A declared modification or review date never replaces original publishedAt.');
  assert.notEqual(indexedOriginalDate, competingDate,
    'The index does not substitute the modification or review date for original publishedAt.');
});

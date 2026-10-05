import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { processResponsiveImages } from '../src/lib/responsive-images.mjs';

function attributes(tag) {
  const result = new Map();
  const inner = tag.replace(/^<(?:img|source)\b/i, '').replace(/\s*\/?>$/, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of inner.matchAll(pattern)) result.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? null);
  return result;
}

function images(html) {
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  return [...visible.matchAll(/<img\b(?:"[^"]*"|'[^']*'|[^'">])*\/?>/gi)].map((match) => match[0]);
}

const source = '/assets/blog/020c3be0259dc50cecb2155a.png';
const compressedSource = '/assets/blog/e9f2fc671d3e9516f2345bb7.png';

test('post-render processing preserves image content and emits correctly sized local candidates', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'responsive-images-'));
  const publicDir = resolve(root, 'public');
  const outputDir = resolve(root, 'dist');
  const articleAssetDir = resolve(publicDir, 'assets/blog');
  const outputBlogDir = resolve(outputDir, 'blog/example');
  await mkdir(articleAssetDir, { recursive: true });
  await mkdir(outputBlogDir, { recursive: true });
  await mkdir(resolve(outputDir, 'blog'), { recursive: true });
  await mkdir(resolve(publicDir, 'assets'), { recursive: true });
  await mkdir(resolve(outputDir, 'assets/blog'), { recursive: true });
  await mkdir(resolve(outputDir, 'assets'), { recursive: true });
  await copyFile(resolve('public', source.slice(1)), resolve(publicDir, source.slice(1)));
  await copyFile(resolve('public', source.slice(1)), resolve(outputDir, source.slice(1)));
  await copyFile(resolve('public', compressedSource.slice(1)), resolve(publicDir, compressedSource.slice(1)));
  await copyFile(resolve('public', compressedSource.slice(1)), resolve(outputDir, compressedSource.slice(1)));

  const indexPath = resolve(outputDir, 'blog/index.html');
  const articlePath = resolve(outputBlogDir, 'index.html');
  const homePath = resolve(outputDir, 'index.html');
  await writeFile(indexPath, `<main><a class="blog-card" href="/blog/a/"><img src="${source}" alt="Diagrama del artículo"></a><a class="blog-card" href="/blog/b/"><img src="${source}" alt="Otra tarjeta"></a></main><script type="application/ld+json">{"description":"<img src=\\\"${source}\\\">"}</script>`);
  await writeFile(articlePath, `<article class="blog-article__body"><p><img src="${compressedSource}" alt="Imagen del cuerpo"></p></article><section class="blog-related__cards"><a class="blog-related__card"><img src="${source}" alt="Artículo relacionado"></a></section>`);
  await writeFile(homePath, '<main>Contenido sin imágenes de socios.</main>');

  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await processResponsiveImages({ outputDir, publicDir });
  assert.equal(result.pages, 3);
  assert.equal(result.images, 4);
  assert.equal(result.uniqueImages, 2);

  const indexHtml = await readFile(indexPath, 'utf8');
  assert.match(indexHtml, /<script type="application\/ld\+json">\{"description":"<img src=/);
  const indexImages = images(indexHtml).map(attributes);
  assert.equal(indexImages.length, 2, 'JSON-LD HTML text must not be treated as an image element.');
  assert.equal(indexImages[0].get('alt'), 'Diagrama del artículo');
  assert.equal(indexImages[0].get('loading'), 'eager');
  assert.equal(indexImages[0].get('fetchpriority'), 'high');
  assert.equal(indexImages[0].get('sizes'), '(max-width: 700px) calc(100vw - 30px), (max-width: 880px) calc(66.667vw - 26.667px), 560px');
  assert.equal(indexImages[1].get('loading'), 'lazy');
  assert.equal(indexImages[1].get('fetchpriority'), undefined);
  for (const match of indexHtml.matchAll(/<source\b[^>]*>/g)) {
    assert.match(match[0], /type="image\/webp"/);
    assert.match(match[0], /srcset="[^"]+"/);
  }

  const articleHtml = await readFile(articlePath, 'utf8');
  const articleImages = images(articleHtml).map(attributes);
  assert.equal(articleImages.length, 2);
  assert.ok(articleImages.every((image) => image.get('loading') === 'lazy'));
  assert.equal(articleImages[0].get('sizes'), '(max-width: 710px) calc(100vw - 30px), 680px');
  assert.equal(articleImages[1].get('sizes'), '(max-width: 500px) calc(100vw - 30px), (max-width: 700px) calc((100vw - 50px) / 2), 320px');
  assert.equal(articleImages[0].get('alt'), 'Imagen del cuerpo');

  const compressedBytes = (await stat(resolve(publicDir, compressedSource.slice(1)))).size;
  const compressedCandidates = articleImages[0].get('srcset').split(',').map((candidate) => {
    const [url, descriptor] = candidate.trim().split(/\s+/);
    return { url, width: Number.parseInt(descriptor, 10) };
  });
  assert.ok(compressedCandidates.some(({ url, width }) => url === compressedSource && width === 1024), 'The natural-width original must remain available when a resized candidate is removed.');
  assert.ok(!compressedCandidates.some(({ width }) => width === 960), 'The oversized 960px JPEG should be pruned for this compressed source.');
  for (const { url } of compressedCandidates) {
    const file = resolve(outputDir, `.${new URL(url, 'https://site.invalid').pathname}`);
    assert.ok((await stat(file)).size <= compressedBytes, 'No fallback candidate may exceed the original source bytes.');
  }
  const bodyImageOffset = articleHtml.indexOf('alt="Imagen del cuerpo"');
  const pictureStart = articleHtml.lastIndexOf('<picture class="responsive-image">', bodyImageOffset);
  const pictureEnd = articleHtml.indexOf('</picture>', bodyImageOffset);
  const bodyPicture = articleHtml.slice(pictureStart, pictureEnd);
  const bodyWebp = bodyPicture.match(/<source\b[^>]*srcset="([^"]+)"[^>]*>/)?.[1];
  if (bodyWebp) {
    const webpCandidates = bodyWebp.split(',').map((candidate) => {
      const [url, descriptor] = candidate.trim().split(/\s+/);
      return { url, width: Number.parseInt(descriptor, 10) };
    });
    assert.deepEqual(webpCandidates.map(({ width }) => width), compressedCandidates.map(({ width }) => width));
    for (const { url } of webpCandidates) {
      const file = resolve(outputDir, `.${new URL(url, 'https://site.invalid').pathname}`);
      assert.ok((await stat(file)).size <= compressedBytes, 'No preferred WebP candidate may exceed the original source bytes.');
    }
  }

  assert.equal(await readFile(homePath, 'utf8'), '<main>Contenido sin imágenes de socios.</main>');

  const dimensionSource = await sharp(resolve(publicDir, source.slice(1))).metadata();
  const descriptors = [];
  for (const candidate of indexImages[0].get('srcset').split(',')) {
    const [url, descriptor] = candidate.trim().split(/\s+/);
    const width = Number.parseInt(descriptor, 10);
    assert.ok(width <= dimensionSource.width, 'No responsive candidate may exceed source width.');
    const file = resolve(outputDir, `.${new URL(url, 'https://site.invalid').pathname}`);
    assert.ok(file.startsWith(`${outputDir}/`));
    descriptors.push(sharp(file).metadata().then((metadata) => {
      assert.equal(metadata.width, width);
      const expectedHeight = dimensionSource.height * width / dimensionSource.width;
      assert.ok(Math.abs(metadata.height - expectedHeight) <= 1);
    }));
  }
  await Promise.all(descriptors);
  assert.ok((await readdir(resolve(outputDir, 'assets/responsive-images'))).length > 0);
});

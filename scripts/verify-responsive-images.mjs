import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const dist = resolve('dist');
const webpSavingsThreshold = 0.1;

function getAttributes(tag) {
  const attributes = new Map();
  const inner = tag.replace(/^<(?:img|source)\b/i, '').replace(/\s*\/?>$/, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of inner.matchAll(pattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? null);
  }
  return attributes;
}

function visibleHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function visibleTags(html, pattern) {
  return [...visibleHtml(html).matchAll(pattern)];
}

function localFile(path, root) {
  assert.ok(path?.startsWith('/'), `Expected local image URL: ${path}`);
  const file = resolve(root, `.${decodeURIComponent(new URL(path, 'https://site.invalid').pathname)}`);
  assert.ok(file.startsWith(`${root}/`), `Image URL escapes output root: ${path}`);
  assert.ok(existsSync(file), `Missing responsive image asset: ${path}`);
  return file;
}

async function imageDimensions(file) {
  const metadata = await sharp(file).metadata();
  const rotated = [5, 6, 7, 8].includes(metadata.orientation);
  return {
    width: rotated ? metadata.height : metadata.width,
    height: rotated ? metadata.width : metadata.height,
    format: metadata.format,
  };
}

function candidates(srcset, label) {
  assert.ok(srcset, `${label} srcset is missing`);
  const entries = srcset.split(',').map((candidate) => {
    const [url, descriptor] = candidate.trim().split(/\s+/);
    assert.match(descriptor ?? '', /^\d+w$/, `${label} must use width descriptors`);
    return { url, width: Number.parseInt(descriptor, 10) };
  });
  const widths = entries.map(({ width }) => width);
  assert.deepEqual(widths, [...new Set(widths)].sort((a, b) => a - b), `${label} widths must be sorted and unique`);
  return entries;
}

async function verifySrcset(srcset, { sourceWidth, sourceHeight, label, format }) {
  const entries = candidates(srcset, label);
  for (const candidate of entries) {
    assert.ok(candidate.width <= sourceWidth, `${label} upscales ${candidate.width}px beyond the ${sourceWidth}px source`);
    const file = localFile(candidate.url, dist);
    const dimensions = await imageDimensions(file);
    assert.equal(dimensions.width, candidate.width, `${label} width descriptor must match ${candidate.url}`);
    const expectedHeight = sourceHeight * candidate.width / sourceWidth;
    assert.ok(Math.abs(dimensions.height - expectedHeight) <= 1, `${label} aspect ratio changed for ${candidate.url}`);
    if (format) assert.equal(dimensions.format, format, `${label} format mismatch for ${candidate.url}`);
  }
  return entries;
}

function listHtml(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listHtml(path);
    return entry.isFile() && entry.name.endsWith('.html') ? [path] : [];
  });
}

const htmlFiles = listHtml(dist);
let imageCount = 0;
let variantCount = 0;
let webpSourceCount = 0;
let eagerCount = 0;

for (const page of htmlFiles) {
  const html = readFileSync(page, 'utf8');
  const visible = visibleHtml(html);
  const pagePath = page.slice(dist.length + 1).split('\\').join('/');
  const images = [...visible.matchAll(/<img\b(?:"[^"]*"|'[^']*'|[^'">])*\/?>/gi)];
  let pageImageIndex = 0;

  for (const match of images) {
    const tag = match[0];
    const attributes = getAttributes(tag);
    const src = attributes.get('src');
    const sourceFile = localFile(src, dist);
    if (/^\/assets\/site-logo(?:-(?:mono|white))?\.svg$/.test(src)) {
      assert.ok(attributes.has('alt'), `Brand image alt is missing: ${src}`);
      assert.ok(Number(attributes.get('width')) > 0 && Number(attributes.get('height')) > 0, `Brand dimensions missing: ${src}`);
      assert.match(readFileSync(sourceFile, 'utf8'), /viewBox="[^"]+"/, `Scalable brand viewBox missing: ${src}`);
      continue;
    }
    const source = await imageDimensions(sourceFile);
    const sourceBytes = statSync(sourceFile).size;
    assert.ok(attributes.has('alt'), `Image alt attribute is missing: ${src}`);
    assert.equal(Number(attributes.get('width')), source.width, `Wrong intrinsic width: ${src}`);
    assert.equal(Number(attributes.get('height')), source.height, `Wrong intrinsic height: ${src}`);
    assert.equal(attributes.get('decoding'), 'async', `Decoding hint missing: ${src}`);
    assert.ok(attributes.get('sizes'), `Responsive sizes are missing: ${src}`);
    assert.match(attributes.get('loading') ?? '', /^(?:eager|lazy)$/, `Loading hint missing: ${src}`);

    const firstIndexImage = pagePath === 'blog/index.html' && pageImageIndex === 0;
    assert.equal(attributes.get('loading'), firstIndexImage ? 'eager' : 'lazy', `Unexpected loading mode: ${pagePath} ${src}`);
    assert.equal(attributes.get('fetchpriority'), firstIndexImage ? 'high' : undefined, `Unexpected fetch priority: ${pagePath} ${src}`);

    if (pagePath === 'blog/index.html') {
      if (pageImageIndex === 0) assert.match(attributes.get('sizes'), /^\(max-width: 700px\)/);
      else assert.match(attributes.get('sizes'), /^\(max-width: 500px\)/);
    } else if (pagePath.startsWith('blog/')) {
      assert.match(attributes.get('sizes'), /^\(max-width: (?:500|710)px\)/, `Unexpected article image size hint: ${src}`);
    }

    const sourceExt = source.format === 'jpeg' ? 'jpg' : source.format;
    const fallbackEntries = await verifySrcset(attributes.get('srcset'), {
      sourceWidth: source.width,
      sourceHeight: source.height,
      label: `${pagePath} ${src}`,
      format: source.format,
    });
    for (const entry of fallbackEntries) {
      const file = localFile(entry.url, dist);
      assert.ok(statSync(file).size <= sourceBytes, `Fallback candidate must not exceed the original file: ${entry.url}`);
      if (entry.url !== src) {
        assert.ok(entry.url.startsWith('/assets/responsive-images/'), `Unexpected generated image path: ${entry.url}`);
        assert.ok(entry.url.endsWith(`.${sourceExt}`), `Fallback must retain the detected source format: ${entry.url}`);
      }
    }

    const pictureStart = visible.lastIndexOf('<picture class="responsive-image">', match.index);
    const pictureEnd = visible.indexOf('</picture>', match.index);
    assert.ok(pictureStart >= 0 && pictureEnd > match.index, `Responsive picture wrapper is missing: ${src}`);
    const picture = visible.slice(pictureStart, pictureEnd);
    const webpSource = visibleTags(picture, /<source\b(?:"[^"]*"|'[^']*'|[^'">])*\/?>/gi)[0]?.[0];
    if (webpSource) {
      const sourceAttributes = getAttributes(webpSource);
      assert.equal(sourceAttributes.get('type'), 'image/webp');
      assert.equal(sourceAttributes.get('sizes'), attributes.get('sizes'));
      const webpEntries = await verifySrcset(sourceAttributes.get('srcset'), {
        sourceWidth: source.width,
        sourceHeight: source.height,
        label: `${pagePath} ${src} WebP`,
        format: 'webp',
      });
      assert.deepEqual(webpEntries.map(({ width }) => width), fallbackEntries.map(({ width }) => width), `WebP and fallback must offer the same widths: ${src}`);
      assert.ok(webpEntries.every((entry) => entry.url.startsWith('/assets/responsive-images/')));
      assert.ok(source.format !== 'webp', `Already-WebP sources do not need a second WebP source: ${src}`);
      for (const webpEntry of webpEntries) {
        const fallback = fallbackEntries.find(({ width }) => width === webpEntry.width);
        assert.ok(fallback, `WebP size must have a same-width fallback: ${src} ${webpEntry.width}w`);
        const fallbackFile = localFile(fallback.url, dist);
        const webpFile = localFile(webpEntry.url, dist);
        assert.ok(statSync(webpFile).size <= statSync(fallbackFile).size * (1 - webpSavingsThreshold), `WebP variant does not save 10% at ${webpEntry.width}w: ${src}`);
        assert.ok(statSync(webpFile).size <= sourceBytes, `WebP candidate must not exceed the original file: ${webpEntry.url}`);
      }
      webpSourceCount += 1;
    }

    imageCount += 1;
    variantCount += fallbackEntries.length;
    pageImageIndex += 1;
    if (firstIndexImage) eagerCount += 1;
  }
}

assert.ok(imageCount > 0, 'No visible images were found in generated HTML.');
assert.equal(eagerCount, 1, 'Only the first featured image on the blog index should load eagerly.');
assert.equal(webpSourceCount, htmlFiles.reduce((count, page) => {
  const html = readFileSync(page, 'utf8');
  return count + visibleTags(html, /<source\b[^>]*type="image\/webp"[^>]*>/gi).length;
}, 0), 'Every WebP source must belong to a visible image.');

console.log(`Verified ${imageCount} visible images across ${htmlFiles.length} generated pages, ${variantCount} responsive candidates, ${webpSourceCount} size-qualified WebP sources, and one eager featured image.`);

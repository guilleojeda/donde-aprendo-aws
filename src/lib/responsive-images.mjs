import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const candidateWidths = [360, 640, 960, 1280, 1920];
const responsiveAssetDirectory = 'assets/responsive-images';
const imagePipelineVersion = 'responsive-images-v1-q90-webp10';
const supportedSourcePaths = new Set(['/assets/simple-aws-logo.png']);

const decodeAttribute = (value) => value
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&#x27;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>');

function parseAttributes(tag) {
  const attributes = new Map();
  const inner = tag.replace(/^<img\b/i, '').replace(/\s*\/?>$/, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

  for (const match of inner.matchAll(pattern)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? null;
    attributes.set(name, value);
  }

  return attributes;
}

function renderAttributes(attributes) {
  return [...attributes].map(([name, value]) => value === null
    ? ` ${name}`
    : ` ${name}="${value}"`).join('');
}

function sourcePathFor(src, publicDir) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(src, 'https://site.invalid').pathname);
  } catch {
    throw new Error(`Invalid local image URL: ${src}`);
  }

  const absolutePath = resolve(publicDir, `.${pathname}`);
  if (absolutePath !== publicDir && !absolutePath.startsWith(`${publicDir}/`)) {
    throw new Error(`Image URL escapes the public directory: ${src}`);
  }
  return absolutePath;
}

function isManagedImage(src) {
  return src.startsWith('/assets/blog/') || supportedSourcePaths.has(src);
}

async function listHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return listHtmlFiles(path);
    return entry.isFile() && extname(entry.name).toLowerCase() === '.html' ? [path] : [];
  }));
  return files.flat();
}

function imageSizesFor({ pageKind, firstImage, html, offset }) {
  const anchorStart = html.lastIndexOf('<a ', offset);
  const anchorEnd = html.lastIndexOf('</a>', offset);
  const anchor = anchorStart > anchorEnd ? html.slice(anchorStart, offset) : '';

  if (pageKind === 'blog-index') {
    if (anchor.includes('class="blog-card"')) {
      return firstImage
        ? '(max-width: 700px) calc(100vw - 30px), (max-width: 880px) calc(66.667vw - 26.667px), 560px'
        : '(max-width: 500px) calc(100vw - 30px), (max-width: 700px) calc((100vw - 50px) / 2), (max-width: 880px) calc((100vw - 70px) / 3), 270px';
    }
  }

  if (pageKind === 'blog-article') {
    if (anchor.includes('class="blog-related__card"')) {
      return '(max-width: 500px) calc(100vw - 30px), (max-width: 700px) calc((100vw - 50px) / 2), 320px';
    }
    return '(max-width: 710px) calc(100vw - 30px), 680px';
  }

  if (anchor.includes('class="partner-logo"')) return '130px';
  return '100vw';
}

function outputWidths(width, src) {
  const isPartnerLogo = src === '/assets/simple-aws-logo.png';
  const targets = isPartnerLogo ? [130, 260, 390] : candidateWidths;
  const widths = targets.filter((candidate) => candidate < width);
  if (width <= targets.at(-1) || !isPartnerLogo) widths.push(width);
  return [...new Set(widths)].sort((a, b) => a - b);
}

function outputOptions(format) {
  if (format === 'jpeg') return { extension: 'jpg' };
  if (format === 'webp') return { extension: 'webp' };
  if (format === 'png') return { extension: 'png' };
  throw new Error(`Unsupported local image format: ${format}`);
}

async function createVariants(src, publicDir, outputDir) {
  const sourcePath = sourcePathFor(src, publicDir);
  const sourceStat = await stat(sourcePath).catch(() => null);
  if (!sourceStat?.isFile()) throw new Error(`Local image is missing: ${src}`);

  const metadata = await sharp(sourcePath).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Image has no dimensions: ${src}`);
  const rotated = [5, 6, 7, 8].includes(metadata.orientation);
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;
  const detectedFormat = metadata.format;
  const fallback = outputOptions(detectedFormat);
  const digest = createHash('sha256')
    .update(imagePipelineVersion)
    .update(src)
    .update(await readFile(sourcePath))
    .digest('hex')
    .slice(0, 12);
  const publicDirectory = resolve(outputDir, responsiveAssetDirectory);
  await mkdir(publicDirectory, { recursive: true });

  let webpEncoder;
  if (detectedFormat === 'jpeg') {
    webpEncoder = (pipeline) => pipeline.webp({ quality: 90, effort: 4 });
  } else if (detectedFormat === 'png') {
    webpEncoder = (pipeline) => pipeline.webp({ lossless: true, effort: 4 });
  }
  const fallbackWidths = outputWidths(width, src);
  let fallbackVariants = [];
  for (const variantWidth of fallbackWidths) {
    let fallbackBuffer;
    let fallbackUrl = src;
    if (variantWidth !== width) {
      const resizedFallback = sharp(sourcePath)
        .rotate()
        .resize({ width: variantWidth, withoutEnlargement: true, fit: 'inside' });
      if (detectedFormat === 'jpeg') {
        fallbackBuffer = await resizedFallback.jpeg({ quality: 90 }).toBuffer();
      } else if (detectedFormat === 'webp') {
        fallbackBuffer = await resizedFallback.webp({ quality: 90, effort: 4 }).toBuffer();
      } else if (detectedFormat === 'png') {
        fallbackBuffer = await resizedFallback.png({ compressionLevel: 9 }).toBuffer();
      }

      const fallbackName = `${digest}-${variantWidth}.${fallback.extension}`;
      fallbackUrl = `/assets/responsive-images/${fallbackName}`;
    }
    const fallbackBytes = fallbackBuffer?.length ?? sourceStat.size;
    fallbackVariants.push({ width: variantWidth, url: fallbackUrl, buffer: fallbackBuffer, bytes: fallbackBytes });
  }

  fallbackVariants = fallbackVariants.filter(({ bytes }) => bytes <= sourceStat.size);
  if (src === '/assets/simple-aws-logo.png'
    && !fallbackVariants.some((variant) => variant.width === width)
    && fallbackVariants.length < fallbackWidths.length) {
    fallbackVariants.push({ width, url: src, buffer: null, bytes: sourceStat.size });
  }
  fallbackVariants.sort((a, b) => a.width - b.width);

  for (const variant of fallbackVariants) {
    if (variant.buffer) {
      const name = `${digest}-${variant.width}.${fallback.extension}`;
      await writeFile(resolve(publicDirectory, name), variant.buffer);
    }
  }

  const webpVariants = [];
  if (webpEncoder) {
    for (const variant of fallbackVariants) {
      let pipeline = sharp(sourcePath).rotate();
      if (variant.width !== width) {
        pipeline = pipeline.resize({ width: variant.width, withoutEnlargement: true, fit: 'inside' });
      }
      const buffer = await webpEncoder(pipeline).toBuffer();
      webpVariants.push({
        ...variant,
        buffer,
        savesEnough: buffer.length <= variant.bytes * 0.9 && buffer.length <= sourceStat.size,
      });
    }
  }
  const usesWebp = webpVariants.length === fallbackVariants.length && webpVariants.every(({ savesEnough }) => savesEnough);
  const webpSrcset = [];
  if (usesWebp) {
    for (const variant of webpVariants) {
      const name = `${digest}-${variant.width}.webp`;
      await writeFile(resolve(publicDirectory, name), variant.buffer);
      webpSrcset.push(`/assets/responsive-images/${name} ${variant.width}w`);
    }
  }

  return {
    source: src,
    width,
    height,
    fallbackSrcset: fallbackVariants.map(({ url, width }) => `${url} ${width}w`).join(', '),
    webpSrcset: webpSrcset.join(', '),
    usesWebp,
    variantCount: fallbackVariants.length,
  };
}

async function rewriteImageTag(tag, options) {
  const attributes = parseAttributes(tag);
  const rawSrc = attributes.get('src');
  if (!rawSrc) return { html: tag, managed: false };

  const src = decodeAttribute(rawSrc);
  if (!isManagedImage(src)) return { html: tag, managed: false };
  let data = options.variantCache.get(src);
  if (!data) {
    data = await createVariants(src, options.publicDir, options.outputDir);
    options.variantCache.set(src, data);
  }

  const firstImage = options.imageCount === 0;
  options.imageCount += 1;
  const eager = options.pageKind === 'blog-index' && firstImage;
  const sizes = imageSizesFor({
    pageKind: options.pageKind,
    firstImage,
    html: options.html,
    offset: options.offset,
  });
  attributes.set('width', String(data.width));
  attributes.set('height', String(data.height));
  attributes.set('srcset', data.fallbackSrcset);
  attributes.set('sizes', sizes);
  attributes.set('loading', eager ? 'eager' : 'lazy');
  attributes.set('decoding', 'async');
  if (eager) attributes.set('fetchpriority', 'high');
  else attributes.delete('fetchpriority');

  const img = `<img${renderAttributes(attributes)} />`;
  if (!data.usesWebp) return { html: `<picture class="responsive-image">${img}</picture>`, managed: true, data };
  const source = `<source type="image/webp" srcset="${data.webpSrcset}" sizes="${sizes}" />`;
  return { html: `<picture class="responsive-image">${source}${img}</picture>`, managed: true, data };
}

async function rewriteHtml(html, pageKind, options) {
  const tokenPattern = /<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->|<img\b(?:"[^"]*"|'[^']*'|[^'">])*\/?>/gi;
  let output = '';
  let cursor = 0;
  const pageOptions = { ...options, html, pageKind, imageCount: 0 };
  for (const match of html.matchAll(tokenPattern)) {
    const token = match[0];
    output += html.slice(cursor, match.index);
    if (/^<img\b/i.test(token)) {
      pageOptions.offset = match.index;
      const rewritten = await rewriteImageTag(token, pageOptions);
      output += rewritten.html;
      if (rewritten.managed) {
        options.stats.images += 1;
        if (!options.stats.countedSources.has(rewritten.data.source)) {
          options.stats.countedSources.add(rewritten.data.source);
          options.stats.variants += rewritten.data.variantCount;
          if (rewritten.data.usesWebp) {
            options.stats.webp += 1;
          }
        }
      }
    } else {
      output += token;
    }
    cursor = match.index + token.length;
  }
  output += html.slice(cursor);
  return output;
}

export async function processResponsiveImages({ outputDir, publicDir = resolve('public') }) {
  const absoluteOutputDir = resolve(outputDir);
  const absolutePublicDir = resolve(publicDir);
  const files = await listHtmlFiles(absoluteOutputDir);
  const options = {
    outputDir: absoluteOutputDir,
    publicDir: absolutePublicDir,
    variantCache: new Map(),
    stats: { images: 0, variants: 0, webp: 0, countedSources: new Set() },
  };

  for (const path of files) {
    const html = await readFile(path, 'utf8');
    const pagePath = relative(absoluteOutputDir, path).split('\\').join('/');
    const pageKind = pagePath === 'blog/index.html'
      ? 'blog-index'
      : pagePath.startsWith('blog/') ? 'blog-article' : 'site';
    const rewritten = await rewriteHtml(html, pageKind, options);
    if (rewritten !== html) await writeFile(path, rewritten);
  }

  return {
    pages: files.length,
    images: options.stats.images,
    variants: options.stats.variants,
    uniqueImages: options.variantCache.size,
    webpImages: options.stats.webp,
  };
}

export function responsiveImagesIntegration() {
  return {
    name: 'responsive-static-images',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const result = await processResponsiveImages({ outputDir: fileURLToPath(dir) });
        logger.info(`Processed ${result.images} local images across ${result.pages} HTML pages (${result.uniqueImages} unique files, ${result.variants} size variants, ${result.webpImages} smaller WebP sources).`);
      },
    },
  };
}

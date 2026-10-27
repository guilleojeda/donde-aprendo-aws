import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { siteOutputRoot } from '../../scripts/lib/site-output.mjs';

const repository = process.cwd();
const dist = siteOutputRoot;
const samSlug = 'aws-sam-guia-basica-para-aplicaciones-serverless';
const samPath = `blog/${samSlug}/index.html`;
const samSourcePath = resolve(repository, `src/content/blog/${samSlug}.md`);
const themeIds = ['site-theme-light', 'site-theme-dark'];
const controllerId = 'site-theme-controller';
const navigation = [
  ['/', 'Inicio'],
  ['/aprender/', 'Aprender'],
  ['/recorridos/', 'Rutas'],
  ['/creadores/', 'Creadores'],
  ['/comunidades/', 'Comunidades'],
  ['/eventos/', 'Eventos'],
  ['/blog/', 'Blog'],
  ['/buscar/', 'Buscar'],
  ['/cuenta/', 'Mi página'],
  ['/#cta_form-01-839181', 'Comparte un recurso'],
];

if (!existsSync(dist)) {
  throw new Error(`Built site is missing at ${dist}; build the preview or production site before running this acceptance suite.`);
}

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function parseAttributes(openTag) {
  const attributes = new Map();
  const source = openTag
    .replace(/^<[a-z][\w:-]*\b/iu, '')
    .replace(/\s*\/?>$/u, '');
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu;
  for (const match of source.matchAll(pattern)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? null);
  }
  return attributes;
}

function elements(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}\\s*>`, 'giu');
  return [...html.matchAll(pattern)].map((match) => {
    const openTag = match[0].match(new RegExp(`^<${tagName}\\b[^>]*>`, 'iu'))?.[0] ?? '';
    return { full: match[0], openTag, attributes: parseAttributes(openTag), index: match.index };
  });
}

function openingTags(html, tagName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>`, 'giu');
  return [...html.matchAll(pattern)].map((match) => ({ tag: match[0], attributes: parseAttributes(match[0]) }));
}

function decode(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function findElementById(html, tagName, id) {
  return elements(html, tagName).filter(({ attributes }) => attributes.get('id') === id);
}

const htmlPaths = filesUnder(dist)
  .filter((path) => path.endsWith('.html'))
  .map((path) => relative(dist, path).replaceAll('\\', '/'))
  .sort();

if (htmlPaths.length === 0) {
  throw new Error(`Built site at ${dist} contains no HTML documents; this suite requires a completed Astro build.`);
}

test('every built HTML document has the shared theme controls in its head', () => {
  assert.ok(htmlPaths.length > 0);
  const sharedDocument = readFileSync(resolve(dist, 'index.html'), 'utf8');
  const sharedTags = [
    ...themeIds.map((id) => findElementById(sharedDocument, 'style', id)[0]?.full),
    findElementById(sharedDocument, 'script', controllerId)[0]?.full,
  ];

  for (const path of htmlPaths) {
    const html = readFileSync(resolve(dist, path), 'utf8');
    const head = html.match(/<head\b[^>]*>[\s\S]*?<\/head>/iu)?.[0];
    const body = html.match(/<body\b[^>]*>[\s\S]*?<\/body>/iu)?.[0] ?? '';
    assert.ok(head, `Document head is missing: ${path}`);
    assert.ok(body, `Document body is missing: ${path}`);

    const light = findElementById(html, 'style', themeIds[0]);
    const dark = findElementById(html, 'style', themeIds[1]);
    const controller = findElementById(html, 'script', controllerId);
    assert.equal(light.length, 1, `Exactly one light palette style: ${path}`);
    assert.equal(dark.length, 1, `Exactly one dark palette style: ${path}`);
    assert.equal(controller.length, 1, `Exactly one theme controller script: ${path}`);
    assert.deepEqual([light[0].full, dark[0].full, controller[0].full], sharedTags,
      `All routes use the same authoritative theme definitions and controller: ${path}`);

    for (const [label, element] of [['light palette', light[0]], ['dark palette', dark[0]], ['theme controller', controller[0]]]) {
      assert.ok(head.includes(element.full), `${label} must be inside the head: ${path}`);
      assert.ok(!body.includes(element.full), `${label} must not be inside the body: ${path}`);
    }
    assert.ok(light[0].index < dark[0].index, `Light palette must precede dark palette: ${path}`);
    assert.ok(dark[0].index < controller[0].index, `Theme controller follows both palettes: ${path}`);
    assert.ok([undefined, 'all'].includes(light[0].attributes.get('media')),
      `Light palette remains active regardless of system preference: ${path}`);
    assert.match(dark[0].attributes.get('media') ?? '', /\(prefers-color-scheme:\s*dark\)/iu,
      `Dark palette follows the system preference by default: ${path}`);
    assert.match(light[0].full, /color-scheme\s*:\s*light\b/iu, `Light palette declares its color scheme: ${path}`);
    assert.match(dark[0].full, /color-scheme\s*:\s*dark\b/iu, `Dark palette declares its color scheme: ${path}`);

    const controllerAttributes = controller[0].attributes;
    assert.equal(controllerAttributes.has('src'), false, `Theme controller is inline: ${path}`);
    assert.equal(controllerAttributes.has('defer'), false, `Theme controller runs early: ${path}`);
    assert.equal(controllerAttributes.has('async'), false, `Theme controller runs in document order: ${path}`);
    const controllerType = controllerAttributes.get('type');
    assert.ok(controllerType === undefined || /^(?:text|application)\/javascript$/iu.test(controllerType),
      `Theme controller is a classic script: ${path}`);

    const toggles = openingTags(body, 'button').filter(({ attributes }) => attributes.has('data-theme-toggle'));
    assert.equal(toggles.length, 1, `Exactly one theme toggle button: ${path}`);
    const toggle = toggles[0].attributes;
    assert.equal(toggle.get('type'), 'button', `Theme toggle does not submit forms: ${path}`);
    assert.equal(decode(toggle.get('aria-label') ?? ''), 'Modo oscuro', `Stable accessible toggle name: ${path}`);
    assert.equal(toggle.has('hidden'), true, `Theme toggle stays hidden until the controller is ready: ${path}`);
    assert.ok(['true', 'false'].includes(toggle.get('aria-pressed')), `Theme toggle exposes its pressed state: ${path}`);

    const menu = html.match(/<div\b[^>]*class="[^"]*\bsite-nav__menu\b[^"]*"[^>]*>[\s\S]*?<\/div>/iu)?.[0] ?? '';
    assert.ok(menu, `Shared navigation menu is missing: ${path}`);
    assert.doesNotMatch(menu, /\bdata-theme-toggle\b/u, `Theme toggle stays outside the collapsible mobile panel: ${path}`);
    const menuLinks = [...menu.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)]
      .map(([, attributes, text]) => {
        const href = decode(parseAttributes(`<a ${attributes}>`).get('href') ?? '');
        return [href, decode(text.replace(/<[^>]*>/gu, '').trim())];
      });
    assert.deepEqual(menuLinks, navigation, `All ten shared navigation destinations remain available: ${path}`);

    const brand = html.match(/<a\b[^>]*class="[^"]*\bsite-nav__brand\b[^"]*"[^>]*>[\s\S]*?<\/a>/iu)?.[0] ?? '';
    assert.ok(brand, `Header brand link is missing: ${path}`);
    assert.doesNotMatch(brand, /<picture\b/iu, `Theme logos are not delegated to a system-only picture source: ${path}`);
    const logoImages = [...brand.matchAll(/<img\b([^>]*)>/giu)].map(([, attributes]) => parseAttributes(`<img ${attributes}>`));
    assert.equal(logoImages.length, 2, `Header contains both theme logo variants: ${path}`);
    assert.deepEqual(logoImages.map((attributes) => attributes.get('src')).sort(),
      ['/assets/site-logo-white.svg', '/assets/site-logo.svg'].sort(), `Header uses the owned standard and inverse logos: ${path}`);
    assert.ok(logoImages.every((attributes) => attributes.get('alt') === ''), `Both header logos are decorative: ${path}`);
  }

  for (const logo of ['assets/site-logo.svg', 'assets/site-logo-white.svg']) {
    assert.ok(existsSync(resolve(dist, logo)), `Owned logo asset is present in the build: ${logo}`);
  }
});

test('SAM article keeps all highlighted fences on the shared Shiki CSS-variable contract', () => {
  const html = readFileSync(resolve(dist, samPath), 'utf8');
  const light = findElementById(html, 'style', themeIds[0])[0];
  const dark = findElementById(html, 'style', themeIds[1])[0];
  const source = readFileSync(samSourcePath, 'utf8');
  const sourceFenceCount = [...source.matchAll(/^```/gmu)].length / 2;
  const codeBlocks = [...html.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre>/giu)].map(([block]) => block);

  assert.ok(light && dark, 'SAM article includes both theme palettes before checking Shiki variables.');
  assert.equal(sourceFenceCount, 15, 'The SAM source contains the 15 reviewed fenced examples.');
  assert.equal(codeBlocks.length, sourceFenceCount, 'Every fenced example survives HTML generation.');
  assert.ok(codeBlocks.every((block) => /<code\b[\s\S]*?<span\b/iu.test(block)),
    'Every Shiki block keeps code markup and token spans.');

  const requiredShikiVariables = [
    '--astro-code-background', '--astro-code-foreground',
    '--astro-code-token-comment', '--astro-code-token-constant', '--astro-code-token-function',
    '--astro-code-token-keyword', '--astro-code-token-parameter', '--astro-code-token-punctuation',
    '--astro-code-token-string', '--astro-code-token-string-expression', '--astro-code-token-link',
    '--astro-code-token-inserted', '--astro-code-token-deleted', '--astro-code-token-changed',
  ];
  const defined = (style) => new Set([...style.full.matchAll(/(--[\w-]+)\s*:/gu)].map(([, name]) => name));
  const lightVariables = defined(light);
  const darkVariables = defined(dark);
  for (const name of requiredShikiVariables) {
    assert.ok(lightVariables.has(name), `Light palette defines ${name}.`);
    assert.ok(darkVariables.has(name), `Dark palette defines ${name}.`);
  }

  const styles = codeBlocks.flatMap((block) => openingTags(block, 'pre').concat(openingTags(block, 'span')))
    .map(({ attributes }) => attributes.get('style') ?? '');
  assert.ok(styles.some((style) => /var\(--astro-code-background\)/u.test(style)), 'Block background uses the Shiki theme variable.');
  assert.ok(styles.some((style) => /var\(--astro-code-foreground\)/u.test(style)), 'Block foreground uses the Shiki theme variable.');
  const shikiReferences = new Set(styles.flatMap((style) =>
    [...style.matchAll(/var\(\s*(--astro-code-[\w-]+)/gu)].map(([, name]) => name)));
  assert.ok(shikiReferences.size > 0, 'Generated Shiki styles reference CSS variables.');
  for (const name of shikiReferences) {
    assert.ok(lightVariables.has(name), `Light palette defines generated Shiki reference ${name}.`);
    assert.ok(darkVariables.has(name), `Dark palette defines generated Shiki reference ${name}.`);
  }
  for (const style of styles) {
    assert.doesNotMatch(style, /#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(/iu,
      'Generated Shiki inline styles do not carry literal colors.');
  }
});

test('the blog verifier accepts a valid build and rejects controller mutations in a temporary dist copy', () => {
  const sourceArticlePath = resolve(dist, samPath);
  const sourceArticle = readFileSync(sourceArticlePath, 'utf8');
  const tempRoot = mkdtempSync(join(tmpdir(), 'site-theme-acceptance-'));
  const tempDist = resolve(tempRoot, '.amplify-hosting/static');
  const tempArticlePath = resolve(tempDist, samPath);
  const tempArticle = () => readFileSync(tempArticlePath, 'utf8');
  const writeTempArticle = (html) => writeFileSync(tempArticlePath, html);
  const bodyOpening = (html) => html.match(/<article\b[^>]*class="blog-article__body"[^>]*>/iu)?.[0];
  const insertIntoBody = (html, addition) => {
    const opening = bodyOpening(html);
    assert.ok(opening, 'SAM article body exists in the copied build.');
    return html.replace(opening, `${opening}${addition}`);
  };
  const runVerifier = () => spawnSync(process.execPath, [resolve(repository, 'scripts/verify-blog.mjs')], {
    cwd: tempRoot,
    env: { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}` },
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const outputOf = (result) => `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

  try {
    mkdirSync(tempDist, { recursive: true });
    for (const entry of readdirSync(dist, { withFileTypes: true })) {
      const sourcePath = resolve(dist, entry.name);
      const targetPath = resolve(tempDist, entry.name);
      if (entry.name === 'assets') {
        symlinkSync(sourcePath, targetPath, 'dir');
      } else {
        cpSync(sourcePath, targetPath, { recursive: true });
      }
    }
    symlinkSync(resolve(repository, 'src'), resolve(tempRoot, 'src'), 'dir');
    mkdirSync(resolve(tempRoot, 'tests'));
    symlinkSync(resolve(repository, 'tests/fixtures'), resolve(tempRoot, 'tests/fixtures'), 'dir');

    const valid = runVerifier();
    assert.equal(valid.error, undefined, `Blog verifier started successfully: ${valid.error?.message ?? ''}`);
    assert.equal(valid.status, 0,
      `The current built site must pass the real blog verifier before mutation checks.\n${outputOf(valid)}`);

    const initialArticle = tempArticle();
    const controller = findElementById(initialArticle, 'script', controllerId);
    assert.equal(controller.length, 1, 'Copied SAM article has exactly one controller to use in mutation cases.');
    const controllerTag = controller[0].full;

    const mutations = [
      {
        label: 'extra classic script in article body',
        html: insertIntoBody(initialArticle, '<script>window.acceptanceGuardProbe = true;</script>'),
        reason: /script|guard/iu,
      },
      {
        label: 'single exact controller moved from head into article body',
        html: insertIntoBody(initialArticle.replace(controllerTag, ''), controllerTag),
        reason: /script|guard|head|body/iu,
      },
      {
        label: 'duplicate controller in head',
        html: initialArticle.replace(controllerTag, `${controllerTag}${controllerTag}`),
        reason: /script|guard|head/iu,
      },
      {
        label: 'controller content altered while keeping its id',
        html: initialArticle.replace(controllerTag, controllerTag.replace('</script>', '/* altered */</script>')),
        reason: /script|guard/iu,
      },
      {
        label: 'controller attributes altered while keeping its id',
        html: initialArticle.replace(controller[0].openTag,
          controller[0].openTag.replace(/>$/u, ' defer>')),
        reason: /script|guard/iu,
      },
    ];

    for (const mutation of mutations) {
      assert.notEqual(mutation.html, initialArticle, `Mutation changes the intended fixture: ${mutation.label}`);
      writeTempArticle(mutation.html);
      const result = runVerifier();
      assert.equal(result.error, undefined, `Blog verifier started for ${mutation.label}: ${result.error?.message ?? ''}`);
      assert.notEqual(result.status, 0, `Real blog verifier rejects ${mutation.label}.`);
      assert.match(outputOf(result), mutation.reason,
        `Verifier failure identifies the script/controller rule for ${mutation.label}.\n${outputOf(result)}`);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  assert.equal(readFileSync(sourceArticlePath, 'utf8'), sourceArticle,
    'Guard mutations never alter the original dist article.');
});

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test, { after } from 'node:test';
import { runInNewContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratchParent = path.join(root, '.work/creator-pages');
await mkdir(scratchParent, { recursive: true });
const tempDir = await mkdtemp(path.join(scratchParent, 'phase4-ui-render-'));
const container = await experimental_AstroContainer.create();
const componentPromises = new Map();
let trackerSourcePromise;

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function loadComponent(relativePath) {
  if (!componentPromises.has(relativePath)) {
    const outputPath = path.join(tempDir, `${path.basename(relativePath, '.astro')}.mjs`);
    componentPromises.set(relativePath, (async () => {
      await build({
        entryPoints: [path.join(root, relativePath)],
        outfile: outputPath,
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        plugins: [{
          name: `render-${path.basename(relativePath, '.astro')}`,
          setup(api) {
            api.onLoad({ filter: /\.astro$/ }, async ({ path: filename }) => ({
              contents: transform(await readFile(filename, 'utf8'), {
                filename,
                internalURL: 'astro/compiler-runtime',
                resultScopedSlot: true,
                resolvePath: (specifier) => specifier,
              }).code,
              loader: 'js',
            }));
          },
        }],
      });
      return (await import(pathToFileURL(outputPath).href)).default;
    })());
  }

  try {
    return await componentPromises.get(relativePath);
  } catch (error) {
    const detail = error?.errors?.map(({ text }) => text).filter(Boolean).join('; ')
      || error?.shortMessage
      || error?.message
      || String(error);
    assert.fail(`No se pudo preparar ${relativePath}; el componente o su implementación todavía no está disponible: ${detail}`);
  }
}

async function render(relativePath, props) {
  const component = await loadComponent(relativePath);
  try {
    return await container.renderToString(component, { props });
  } catch (error) {
    assert.fail(`No se pudo renderizar ${relativePath} con sus props públicas: ${error?.message ?? error}`);
  }
}

function profile(overrides = {}) {
  return {
    id: 'creator-stable-ana',
    displayName: 'Ana de Lambda',
    slug: 'ana-lambda',
    programs: [],
    socials: {},
    published: true,
    hidden: false,
    version: 4,
    ...overrides,
  };
}

function link(placementId, title, overrides = {}) {
  return {
    placementId,
    resourceId: `resource-${placementId}`,
    title,
    url: `https://contenido.example/${encodeURIComponent(placementId)}`,
    description: `Descripción de ${title}`,
    featured: false,
    position: 0,
    selectedForDirectory: false,
    hidden: false,
    directoryApproval: 'pending',
    resourceVersion: 1,
    placementVersion: 1,
    series: [],
    ...overrides,
  };
}

const seriesOne = {
  id: 'series-lambda',
  name: 'Lambda desde cero',
  slug: 'lambda-desde-cero',
  description: 'Una ruta práctica de Lambda.',
  version: 1,
};

const seriesTwo = {
  id: 'series-serverless',
  name: 'Serverless en práctica',
  slug: 'serverless-practico',
  description: 'Ejemplos de arquitectura serverless.',
  version: 2,
};

function editorData({ withProfile = true } = {}) {
  const links = [
    link('placement-featured', 'Capítulo destacado', {
      featured: true,
      position: 0,
      series: [
        { seriesId: seriesOne.id, position: 1 },
        { seriesId: seriesTwo.id, position: 0 },
      ],
    }),
    link('placement-first', 'Primer capítulo', {
      position: 0,
      series: [
        { seriesId: seriesOne.id, position: 0 },
        { seriesId: seriesTwo.id, position: 1 },
      ],
    }),
    link('placement-last', 'Último capítulo', {
      position: 1,
      series: [{ seriesId: seriesOne.id, position: 2 }],
    }),
  ];

  return {
    profile: withProfile ? profile() : null,
    links,
    editableResources: links.map(({ resourceId, title, url }) => ({ id: resourceId, title, url, version: 1 })),
    claims: [],
    series: [seriesOne, seriesTwo],
  };
}

function visibleText(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

test('el perfil público lista series y sus cantidades sin alterar el orden global ni los destacados', async () => {
  const profileLinks = [
    link('placement-featured', 'Guía destacada', {
      featured: true,
      position: 0,
      series: [{ seriesId: seriesOne.id, name: seriesOne.name, href: '/c/ana-lambda/series/lambda-desde-cero/', position: 1 }],
    }),
    link('placement-ordinary', 'Guía general', {
      position: 0,
      series: [{ seriesId: seriesOne.id, name: seriesOne.name, href: '/c/ana-lambda/series/lambda-desde-cero/', position: 0 }],
    }),
  ];
  const publicSeries = [
    { ...seriesOne, chapterCount: 2, href: '/c/ana-lambda/series/lambda-desde-cero/' },
    { ...seriesTwo, chapterCount: 1, href: '/c/ana-lambda/series/serverless-practico/' },
  ];
  const html = await render('src/components/CreatorPublicProfile.astro', {
    profile: profile(),
    links: profileLinks,
    series: publicSeries,
  });

  assert.ok(/Lambda desde cero/.test(html), 'the profile lists the first public series');
  assert.ok(/Serverless en práctica/.test(html), 'the profile lists the second public series');
  assert.match(html, /2\s+capítulos|2 recursos|2 capítulos/);
  assert.match(html, /1\s+capítulo|1 recurso/);
  assert.match(html, /href="\/c\/ana-lambda\/series\/lambda-desde-cero\//);
  assert.equal((html.match(/href="\/c\/ana-lambda\/series\/lambda-desde-cero\/"/g) ?? []).length, 3,
    'the series appears once in the profile list and as a tag on each associated link');
  assert.equal((html.match(/href="\/c\/ana-lambda\/series\/serverless-practico\/"/g) ?? []).length, 1);
  assert.match(html, /Guía destacada[\s\S]*?Guía general/, 'the profile link order supplied by the public reader is preserved');
  assert.match(html, /Destacado[\s\S]*?Guía destacada/);
  assert.match(html, /Serie[^<]*Lambda desde cero|Lambda desde cero/);
});

test('un perfil sin series conserva su lista de enlaces y no muestra una sección de series vacía', async () => {
  const html = await render('src/components/CreatorPublicProfile.astro', {
    profile: profile(),
    links: [link('placement-only', 'Recurso sin serie')],
    series: [],
  });

  assert.match(html, /Recurso sin serie/);
  assert.doesNotMatch(visibleText(html), /Tus series|Series de Ana|Series del perfil/i);
});

test('la subpágina muestra identidad, regreso al perfil y capítulos en el orden de la serie', async () => {
  const seriesLinks = [
    link('placement-first', 'Primer capítulo', { position: 0, featured: false }),
    link('placement-featured', 'Capítulo destacado', { position: 1, featured: true }),
  ];
  const html = await render('src/components/CreatorPublicSeries.astro', {
    profile: profile(),
    series: seriesOne,
    links: seriesLinks,
  });

  assert.match(html, /<h1[^>]*>Lambda desde cero<\/h1>/);
  assert.match(html, /Una ruta práctica de Lambda\./);
  assert.match(html, /data-creator-profile/);
  assert.match(html, /data-creator-id="creator-stable-ana"/);
  assert.match(html, /Ana de Lambda/);
  assert.match(html, /href="\/c\/ana-lambda\/"[^>]*>[^<]*Ana de Lambda|>Ana de Lambda<\/a>/);
  assert.match(html, /<ol\b/);
  assert.match(html, /Primer capítulo[\s\S]*?Capítulo destacado/, 'chapter order comes from the series reader, not profile featured state');
  assert.match(html, /data-creator-link-id="placement-first"/);
  assert.match(html, /data-creator-link-id="placement-featured"/);
  assert.match(html, /href="https:\/\/contenido\.example\/placement-first"/);
});

test('el perfil público escapa texto de series y rechaza destinos inseguros de contenido', async () => {
  const hostileTitle = '<img src=x onerror=alert(1)>';
  const hostileSeries = { ...seriesOne, name: '<script>alert(1)</script>', description: 'Texto <b>visible</b>' };
  const unsafeLink = link('placement-unsafe', hostileTitle, {
    url: 'javascript:alert(1)',
    series: [{ seriesId: hostileSeries.id, name: hostileSeries.name, href: '/c/ana-lambda/series/lambda-desde-cero/', position: 0 }],
  });
  const publicHref = '/c/ana-lambda/series/lambda-desde-cero/';
  const profileHtml = await render('src/components/CreatorPublicProfile.astro', {
    profile: profile(),
    links: [unsafeLink],
    series: [{ ...hostileSeries, chapterCount: 1, href: publicHref }],
  });

  assert.ok(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/i.test(profileHtml), 'public series labels are escaped visible text');
  assert.doesNotMatch(profileHtml, /<script>alert\(1\)<\/script>|<img src=x onerror=alert\(1\)>/i);
  assert.doesNotMatch(profileHtml, /href="javascript:/i);
  assert.match(profileHtml, /Enlace no disponible/);
});

test('la subpágina de serie escapa texto y rechaza destinos inseguros de contenido', async () => {
  const hostileTitle = '<img src=x onerror=alert(1)>';
  const hostileSeries = { ...seriesOne, name: '<script>alert(1)</script>', description: 'Texto <b>visible</b>' };
  const unsafeLink = link('placement-unsafe', hostileTitle, { url: 'javascript:alert(1)' });
  const html = await render('src/components/CreatorPublicSeries.astro', {
    profile: profile(),
    series: hostileSeries,
    links: [unsafeLink],
  });

  assert.ok(/&lt;script&gt;alert\(1\)&lt;\/script&gt;/i.test(html), 'series name is escaped visible text');
  assert.ok(/Texto &lt;b&gt;visible&lt;\/b&gt;/i.test(html), 'series description is escaped visible text');
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>|<img src=x onerror=alert\(1\)>/i);
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.match(html, /Enlace no disponible/);
});

test('los slugs del perfil owner usan un patrón nativo válido y coherente con el servidor', async () => {
  const ownerHtml = await render('src/components/CreatorOwnerProfile.astro', {
    data: editorData(),
    accountEmail: 'ana@example.invalid',
    logoutCsrfToken: 'logout-csrf',
    csrfToken: 'csrf-test-token',
    sessionBinding: 'binding-test',
    isAdmin: false,
    publicOrigin: 'https://dondeaprendoaws.com',
  });
  const ownerSlugs = [...ownerHtml.matchAll(/<input\b(?=[^>]*\bname="slug")[^>]*>/gi)].map(([tag]) => tag);
  assert.equal(ownerSlugs.length, 2, 'the owner page has create and contextual profile slug inputs');
  assert.match(ownerHtml, /3–40 caracteres/);
  for (const tag of ownerSlugs) {
    assert.match(tag, /\bminlength="3"/);
    assert.match(tag, /\bmaxlength="40"/);
    const pattern = tag.match(/\bpattern="([^"]+)"/)?.[1];
    assert.ok(pattern, 'each slug field must expose browser-native validation');
    let nativePattern;
    assert.doesNotThrow(() => { nativePattern = new RegExp(`^(?:${pattern})$`, 'v'); },
      'the HTML pattern must compile with the browser v flag');
    for (const valid of ['ana', 'serie-2026', 'abc-1-def']) assert.equal(nativePattern.test(valid), true);
    for (const invalid of ['bad slug', 'bad--slug', '-bad-slug', 'bad-slug-']) assert.equal(nativePattern.test(invalid), false);
  }
});

test('el dashboard identifica que las visitas incluyen la página y las series', async () => {
  const daily = Array.from({ length: 7 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 9, 18 + index)).toISOString().slice(0, 10),
    views: index < 5 ? null : 0,
    clicks: index < 5 ? null : 0,
  }));
  const report = {
    state: 'ready',
    creatorId: 'creator-stable-ana',
    period: 7,
    page: 1,
    range: { startDate: '2026-10-18', endDate: '2026-10-24', timeZone: 'America/Argentina/Buenos_Aires' },
    totals: { views: 8, visitors: 3, clicks: 2 },
    daily,
    links: { page: 1, pageSize: 100, totalRows: 0, rows: [] },
    sources: [],
    warnings: [],
    captureStartedAt: '2026-10-23T23:38:00.000Z',
    freshness: 'fresh',
    updatedAt: '2026-10-24T14:00:00.000Z',
  };
  const html = await render('src/components/CreatorStatistics.astro', {
    result: {
      principal: { state: 'authenticated', isAdmin: false },
      status: 200,
      state: 'ready',
      period: 7,
      page: 1,
      editor: { profile: profile(), links: [] },
      report,
    },
  });

  assert.match(visibleText(html), /Tu página y tus series/i);
  assert.match(html, /<h[2-6][^>]*>Estadísticas de tu página<\/h[2-6]>/,
    'the statistics fragment belongs below the owner page heading');
  assert.doesNotMatch(html, /<main\b/,
    'the integrated report no longer creates another standalone work area');
});

async function loadTrackerSource() {
  if (!trackerSourcePromise) {
    trackerSourcePromise = build({
      entryPoints: [path.join(root, 'src/scripts/creator-profile-analytics.ts')],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      target: 'es2022',
    }).then(({ outputFiles }) => outputFiles[0].text);
  }
  try {
    return await trackerSourcePromise;
  } catch (error) {
    assert.fail(`No se pudo compilar el tracker existente de perfil/serie: ${error?.message ?? error}`);
  }
}

class FakeElement {
  constructor(dataset = {}, closestResult = null) {
    this.dataset = dataset;
    this.closestResult = closestResult;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  closest(selector) {
    assert.equal(selector, 'a[data-creator-link-id]');
    return this.closestResult ?? (this.dataset.creatorLinkId ? this : null);
  }

  dispatch(type, { target = this, button = 0, detail = 1 } = {}) {
    const event = {
      type,
      target,
      button,
      detail,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
}

async function trackerHarness({ hostname = 'dondeaprendoaws.com', creatorId = profile().id, gtag } = {}) {
  const root = new FakeElement({ creatorId, creatorSlug: 'ana-lambda' });
  const events = [];
  const source = await loadTrackerSource();
  runInNewContext(source, {
    document: { querySelector: (selector) => {
      assert.equal(selector, '[data-creator-profile]');
      return root;
    } },
    window: {
      location: { hostname },
      gtag: gtag ?? ((...args) => events.push(args)),
    },
    Element: FakeElement,
  });
  return { root, events };
}

function plainEvents(events) {
  return JSON.parse(JSON.stringify(events));
}

test('una carga del perfil o de una subpágina registra una vista con la misma identidad estable', async () => {
  const pageViews = [];
  for (const page of ['profile', 'series']) {
    const { events } = await trackerHarness();
    pageViews.push(plainEvents(events));
    assert.deepEqual(plainEvents(events), [['event', 'creator_view', { creator_id: 'creator-stable-ana' }]], `${page} load emits one aggregate view`);
  }
  assert.deepEqual(pageViews[0], pageViews[1], 'profile and series use the same creator identity and event contract');
});

test('el tracker conserva placementId, ignora navegación interna y respeta click y auxclick actuales', async () => {
  const { root, events } = await trackerHarness();
  const contentAnchor = new FakeElement({ creatorLinkId: 'placement-featured' });
  const nestedText = new FakeElement({}, contentAnchor);
  const firstClick = root.dispatch('click', { target: nestedText, button: 0, detail: 1 });
  const secondDoubleClickActivation = root.dispatch('click', { target: contentAnchor, button: 0, detail: 2 });
  const doubleClickEvent = root.dispatch('dblclick', { target: contentAnchor, button: 0, detail: 2 });
  const internalSeriesAnchor = new FakeElement({ href: '/c/ana-lambda/series/lambda-desde-cero/' });
  const internalNavigation = root.dispatch('click', { target: internalSeriesAnchor, button: 0 });
  root.dispatch('click', { target: contentAnchor, button: 2 });
  root.dispatch('auxclick', { target: contentAnchor, button: 0 });
  const middleClick = root.dispatch('auxclick', { target: contentAnchor, button: 1 });
  root.dispatch('auxclick', { target: contentAnchor, button: 2 });

  assert.equal(firstClick.defaultPrevented, false);
  assert.equal(secondDoubleClickActivation.defaultPrevented, false);
  assert.equal(doubleClickEvent.defaultPrevented, false);
  assert.equal(internalNavigation.defaultPrevented, false);
  assert.equal(middleClick.defaultPrevented, false);
  assert.deepEqual(plainEvents(events), [
    ['event', 'creator_view', { creator_id: 'creator-stable-ana' }],
    ['event', 'creator_link_click', { creator_id: 'creator-stable-ana', link_id: 'placement-featured' }],
    ['event', 'creator_link_click', { creator_id: 'creator-stable-ana', link_id: 'placement-featured' }],
    ['event', 'creator_link_click', { creator_id: 'creator-stable-ana', link_id: 'placement-featured' }],
  ]);
});

test('preview, editor sin perfil público y fallo de gtag no bloquean la navegación', async () => {
  for (const hostname of ['localhost', 'preview.example.amplifyapp.com']) {
    const { root, events } = await trackerHarness({ hostname });
    const anchor = new FakeElement({ creatorLinkId: 'placement-featured' });
    const activation = root.dispatch('click', { target: anchor, button: 0 });
    assert.equal(activation.defaultPrevented, false);
    assert.deepEqual(events, [], `${hostname} does not emit production analytics`);
  }

  const { root, events } = await trackerHarness({ gtag: () => { throw new Error('tracking unavailable'); } });
  const anchor = new FakeElement({ creatorLinkId: 'placement-featured' });
  const activation = root.dispatch('click', { target: anchor, button: 0 });
  assert.equal(activation.defaultPrevented, false);
  assert.deepEqual(events, [], 'a failed analytics call cannot interrupt link activation');
});

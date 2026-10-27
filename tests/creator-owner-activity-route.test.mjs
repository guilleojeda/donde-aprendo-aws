import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';
import { parseCreatorStatisticsReady } from '../src/lib/creator-statistics-response.ts';
import { createCreatorOwnerRuntime, SITE_ORIGIN } from './fixtures/creator-owner-runtime.mjs';
import { activityReport } from './fixtures/creator-owner-activity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = path.join(root, '.work/creator-owner-experience/planning/phase2');
await mkdir(scratch, { recursive: true });
const tempDir = await mkdtemp(path.join(scratch, 'activity-route-'));
const stateKey = `__ownerActivityRoute_${path.basename(tempDir).replaceAll('-', '_')}`;
after(async () => {
  delete globalThis[stateKey];
  await rm(tempDir, { recursive: true, force: true });
});
for (const [file, exported, property] of [
  ['creator-runtime', 'getCreatorRuntime', 'runtime'],
  ['account-runtime', 'getAccountAuth', 'accountAuth'],
]) {
  await writeFile(path.join(tempDir, `${file}.mjs`),
    `export function ${exported}() { return globalThis[${JSON.stringify(stateKey)}].${property}; }`);
}
await build({
  entryPoints: {
    owner: path.join(root, 'src/pages/cuenta/index.astro'),
    legacy: path.join(root, 'src/pages/cuenta/estadisticas/index.astro'),
  },
  outdir: tempDir, bundle: true, platform: 'node', format: 'esm', packages: 'external',
  outExtension: { '.js': '.mjs' },
  define: {
    'import.meta.env.PUBLIC_SITE_ORIGIN': JSON.stringify(SITE_ORIGIN),
    'import.meta.env.PUBLIC_PRODUCTION': '"true"',
  },
  plugins: [{
    name: 'owner-activity-astro-runtime',
    setup(api) {
      api.onResolve({ filter: /creator-runtime\.mjs$/ }, () => ({ path: path.join(tempDir, 'creator-runtime.mjs') }));
      api.onResolve({ filter: /account-runtime\.mjs$/ }, () => ({ path: path.join(tempDir, 'account-runtime.mjs') }));
      api.onResolve({ filter: /\?raw$/ }, ({ path: requested, resolveDir }) => ({
        path: path.resolve(resolveDir, requested.slice(0, -4)), namespace: 'raw',
      }));
      api.onLoad({ filter: /.*/, namespace: 'raw' }, () => ({ contents: 'export default "";', loader: 'js' }));
      api.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
      api.onLoad({ filter: /\.astro$/ }, async ({ path: filename }) => ({
        contents: transform(await readFile(filename, 'utf8'), {
          filename, internalURL: 'astro/compiler-runtime', resultScopedSlot: true,
          resolvePath: (specifier) => specifier,
        }).code,
        loader: 'js',
      }));
    },
  }],
});
const ownerRoute = (await import(pathToFileURL(path.join(tempDir, 'owner.mjs')).href)).default;
const legacyRoute = (await import(pathToFileURL(path.join(tempDir, 'legacy.mjs')).href)).default;
const container = await experimental_AstroContainer.create({ astroConfig: { site: SITE_ORIGIN } });
let runtime;
let reads;
let serviceQueries;
let readReport;

async function reset({ published = true, hidden = false, noProfile = false } = {}) {
  reads = [];
  serviceQueries = [];
  readReport = ({ profileId, period, page }) => activityReport({ creatorId: profileId, period, page });
  runtime = await createCreatorOwnerRuntime({ statistics: {
    async read(input) {
      reads.push(structuredClone(input));
      return readReport(input);
    },
  } });
  runtime.setSession('creator-a');
  runtime.overrideServiceResponse((request) => {
    const url = new URL(request.url);
    if (url.pathname.replace(/\/$/, '') === '/api/creador/estadisticas') {
      serviceQueries.push({ method: request.method, search: url.search });
    }
  });
  let profile;
  if (!noProfile) {
    let response = await runtime.fetchApi('/api/creador/perfil/', {
      method: 'PUT', headers: { 'x-csrf-token': 'csrf-a', 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Ana de actividad', slug: 'ana-actividad', city: 'Córdoba', socials: {} }),
    });
    assert.equal(response.status, 200);
    ({ profile } = await response.json());
    if (published) {
      response = await runtime.fetchApi('/api/creador/perfil/publicar/', {
        method: 'POST', headers: { 'x-csrf-token': 'csrf-a', 'content-type': 'application/json' }, body: '{}',
      });
      assert.equal(response.status, 200);
      ({ profile } = await response.json());
    }
    if (hidden) {
      const key = `profile:${profile.id}`;
      const current = await runtime.pages.store.get(key);
      assert.equal(await runtime.pages.store.transact({
        checks: [{ key, version: current.version }],
        puts: [{ key, value: { ...current, hidden: true, version: current.version + 1 } }],
      }), true);
    }
  }
  globalThis[stateKey] = { runtime, accountAuth: runtime.accountAuth };
  runtime.serviceCalls.length = 0;
  return profile;
}

async function render({ legacy = false, session = 'creator-a', search = '', method = 'GET' } = {}) {
  const original = runtime.request(legacy ? '/cuenta/estadisticas/' : '/cuenta/', { session, search });
  const request = method === 'GET' ? original : new Request(original, { method });
  const response = await container.renderToResponse(legacy ? legacyRoute : ownerRoute, {
    request,
    partial: false,
  });
  return { response, html: await response.text() };
}
function text(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function links(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(([, attrs, body]) => ({
    text: text(body), href: attrs.match(/\bhref="([^"]+)"/)?.[1].replaceAll('&amp;', '&'), attrs,
  }));
}
function metric(html, name) {
  const match = html.match(new RegExp(`<([a-z0-9]+)\\b(?=[^>]*data-owner-activity-total="${name}")[^>]*>([\\s\\S]*?)<\\/\\1>`, 'i'));
  assert.ok(match, `the rendered activity has a ${name} metric`);
  return text(match[2]);
}
function assertPrivate(response, html) {
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(html, /<meta[^>]+name="robots"[^>]+noindex/);
  assert.doesNotMatch(html, /googletagmanager\.com|src="\/assets\/analytics\.js"|data-creator-profile-id/);
}
function assertOwnerContext(html) {
  assert.match(text(html), /Ana de actividad/);
  assert.match(text(html), /Editar datos/);
  assert.equal((html.match(/<main\b/g) ?? []).length, 1, 'one owner work area');
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, 'the detail belongs under Tu página');
  assert.doesNotMatch(html, /class="site-footer(?:\s|")/, 'no long promotional footer in the owner frame');
}

test('provider-shaped fixtures satisfy the unchanged parser for both periods and separate pages', () => {
  for (const period of [7, 30]) for (const page of [1, 2]) {
    assert.ok(parseCreatorStatisticsReady(activityReport({ period, page }), period, page, 'fixture-id-1'));
  }
});

test('la entrada owner entrega identidad y actividad independiente sin esperar un informe de GA', async () => {
  await reset();
  readReport = () => { throw new Error('The initial owner route must not ask GA'); };
  const { response, html } = await render({ search: '?pagina=9&buscar=texto-privado' });
  assert.equal(response.status, 200);
  assertPrivate(response, html);
  assertOwnerContext(html);
  assert.match(html, /data-owner-activity\b/, 'the async activity region exists');
  const detail = links(html).find((link) => link.href && new URL(link.href, SITE_ORIGIN).searchParams.get('vista') === 'estadisticas');
  assert.ok(detail, 'a real HTML link reaches the SSR statistics detail without JS');
  const target = new URL(detail.href, SITE_ORIGIN);
  assert.equal(target.pathname, '/cuenta/');
  assert.equal(target.searchParams.get('periodo'), '30');
  assert.equal(target.searchParams.get('pagina'), '1', 'the report does not inherit the management page');
  assert.equal(target.searchParams.get('buscar'), null);
  assert.deepEqual(serviceQueries, []);
  assert.deepEqual(reads, []);
});

test('el detalle SSR vive en Tu página y proyecta sólo periodo/pagina al servicio existente', async () => {
  const profile = await reset();
  const { response, html } = await render({ search: '?vista=estadisticas&periodo=30&pagina=2' });
  assert.equal(response.status, 200);
  assertPrivate(response, html);
  assertOwnerContext(html);
  assert.deepEqual(reads, [{ profileId: profile.id, period: 30, page: 2 }]);
  const query = new URLSearchParams(serviceQueries[0].search);
  assert.deepEqual([...query.keys()].sort(), ['pagina', 'periodo']);
  assert.equal(metric(html, 'views'), '137');
  assert.equal(metric(html, 'visitors'), '19');
  assert.equal(metric(html, 'clicks'), '43');
  assert.match(text(html), /newsletter \/ email/);
});

test('el detalle sin JS conserva selector GET, reinicio de página, tabla exacta y paginación interna', async () => {
  await reset();
  readReport = ({ profileId, period, page }) => activityReport({ creatorId: profileId, period, page,
    links: { page, pageSize: 100, totalRows: 201, rows: [{ linkId: 'social:website', clicks: 2 }] },
  });
  const { html } = await render({ search: '?vista=estadisticas&periodo=7&pagina=2' });
  const form = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)]
    .find(([, , contents]) => /name="periodo"/.test(contents));
  assert.ok(form, 'the period selector works as an HTML GET form');
  assert.match(form[1], /method="get"/);
  assert.match(form[1], /action="\/cuenta\/"/);
  assert.match(form[2], /name="vista"[^>]*value="estadisticas"|value="estadisticas"[^>]*name="vista"/);
  assert.match(form[2], /name="pagina"[^>]*value="1"|value="1"[^>]*name="pagina"/);
  assert.match(form[2], /<option\b(?=[^>]*value="7")(?=[^>]*selected)/);
  const previous = links(html).find((link) => /Anterior/.test(link.text));
  const next = links(html).find((link) => /Siguiente/.test(link.text));
  for (const [link, expectedPage] of [[previous, '1'], [next, '3']]) {
    assert.ok(link, 'both page links exist on the middle page');
    const url = new URL(link.href, SITE_ORIGIN);
    assert.equal(url.pathname, '/cuenta/');
    assert.equal(url.searchParams.get('vista'), 'estadisticas');
    assert.equal(url.searchParams.get('periodo'), '7');
    assert.equal(url.searchParams.get('pagina'), expectedPage);
  }
  assert.match(html, /<svg\b/);
  const dailyTable = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
    .find(([, body]) => /Fecha/.test(body) && /Visitas/.test(body) && /Clics/.test(body));
  assert.ok(dailyTable, 'the graph has an exact HTML table equivalent without JS');
  assert.equal((dailyTable[1].match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1].match(/<tr\b/g) ?? []).length, 7);
  assert.match(dailyTable[1], /datetime="2026-10-27"/);
  assert.match(dailyTable[1], /<td[^>]*>137<\/td>/);
  assert.match(dailyTable[1], /<td[^>]*>43<\/td>/);
  assert.match(dailyTable[1], /Sin datos/);
});

test('la ayuda general está cerrada y los párrafos extensos no aparecen en la vista habitual', async () => {
  await reset();
  const { html } = await render({ search: '?vista=estadisticas&periodo=30&pagina=1' });
  const help = [...html.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/gi)]
    .find(([, , contents]) => /<summary\b[^>]*>[\s\S]*?Sobre estas estadísticas/.test(contents));
  assert.ok(help, 'general statistics help is available on demand');
  assert.doesNotMatch(help[1], /\bopen(?:\s|=|$)/);
  const helpText = text(help[2]);
  assert.match(helpText, /página y (?:tus )?series/i);
  assert.match(helpText, /visitantes|estimados/i);
  assert.match(helpText, /captura|historial/i);
  assert.match(helpText, /24.{0,3}48/);
  assert.match(helpText, /JavaScript|bloquea/i);
  const ordinary = text(html.replace(help[0], ''));
  assert.doesNotMatch(ordinary, /No reconstruimos actividad anterior|no se reconstruyen|24.{0,3}48 horas|no una vez por cada subpágina|Valores diarios de visitas y clics\./i);
  assert.match(ordinary, /Última actualización/i);
  assert.match(html, /datetime="2026-10-27T15:00:00.000Z"/);
});

test('cero registrado y cifras desconocidas conservan significados diferentes en el detalle nuevo', async () => {
  await reset();
  for (const [value, expected] of [[0, /^0$/], [null, /Datos limitados|Sin datos|No disponible/i]]) {
    readReport = ({ profileId, period, page }) => activityReport({ creatorId: profileId, period, page,
      totals: { views: value, visitors: value, clicks: value },
    });
    const { response, html } = await render({ search: '?vista=estadisticas&periodo=7&pagina=1' });
    assert.equal(response.status, 200);
    for (const field of ['views', 'visitors', 'clicks']) assert.match(metric(html, field), expected);
  }
});

test('un informe retenido conserva su ventana y actualización originales con aviso local', async () => {
  await reset();
  readReport = ({ profileId, period, page }) => {
    const report = activityReport({ creatorId: profileId, period, page,
      freshness: 'stale', updatedAt: '2026-10-26T12:00:00.000Z',
    });
    report.daily = report.daily.map((day) => ({ ...day,
      date: new Date(Date.parse(`${day.date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10),
    }));
    report.range = { ...report.range, startDate: report.daily[0].date, endDate: report.daily.at(-1).date };
    return report;
  };
  const { response, html } = await render({ search: '?vista=estadisticas&periodo=7&pagina=1' });
  assert.equal(response.status, 200);
  assertOwnerContext(html);
  assert.equal(metric(html, 'views'), '137');
  assert.match(text(html), /No pudimos actualizar|última lectura|informe anterior/i);
  assert.match(html, /datetime="2026-10-26T12:00:00.000Z"/);
  assert.match(html, /datetime="2026-10-20"/);
  assert.match(html, /datetime="2026-10-26"/);
  assert.doesNotMatch(html, /datetime="2026-10-27"/,
    'retained data does not relabel yesterday\'s rows as the current window');
});

test('una falla de GA no sustituye el owner por una pantalla de error ni fabrica cero', async () => {
  await reset();
  readReport = () => { throw new Error('private-service-key'); };
  const { response, html } = await render({ search: '?vista=estadisticas&periodo=30&pagina=1' });
  assert.equal(response.status, 503);
  assertPrivate(response, html);
  assertOwnerContext(html);
  assert.match(text(html), /No pudimos cargar (?:tus|las) estadísticas/);
  assert.match(text(html), /Reintentar/);
  assert.doesNotMatch(html, /private-service-key/);
  assert.doesNotMatch(html, /data-owner-activity-total="(?:views|visitors|clicks)"[^>]*>\s*0\s*</);
});

test('un informe ajeno o malformado falla cerrado dentro del detalle, conservando el perfil propio', async () => {
  await reset();
  for (const incorrect of [
    activityReport({ creatorId: 'another-owner', totals: { views: 987654, visitors: 777777, clicks: 666666 } }),
    activityReport({ daily: [] }),
    activityReport({ period: 7 }),
  ]) {
    readReport = () => incorrect;
    const { response, html } = await render({ search: '?vista=estadisticas&periodo=30&pagina=1' });
    assert.equal(response.status, 503);
    assertOwnerContext(html);
    assert.doesNotMatch(text(html), /987654|777777|666666/);
    assert.match(text(html), /No pudimos cargar (?:tus|las) estadísticas/);
  }
});

test('un perfil publicado oculto puede consultar su histórico dentro del mismo marco', async () => {
  const profile = await reset({ hidden: true });
  const { response, html } = await render({ search: '?vista=estadisticas&periodo=7&pagina=1' });
  assert.equal(response.status, 200);
  assertOwnerContext(html);
  assert.match(text(html), /Oculta/);
  assert.equal(metric(html, 'clicks'), '43');
  assert.deepEqual(reads, [{ profileId: profile.id, period: 7, page: 1 }]);
  assert.ok(!links(html).some((link) => /Ver página pública/.test(link.text)));
});

test('sin perfil o con borrador no se consulta GA y se ofrece el siguiente paso real', async () => {
  for (const state of [{ noProfile: true }, { published: false }]) {
    await reset(state);
    const { response, html } = await render({ search: '?vista=estadisticas&periodo=30&pagina=1' });
    assert.equal(response.status, 200);
    assertPrivate(response, html);
    assert.match(text(html), state.noProfile ? /Crear borrador|Prepara tu página/ : /Publicar página/);
    assert.deepEqual(reads, []);
    assert.doesNotMatch(html, /data-owner-activity-total="(?:views|visitors|clicks)"[^>]*>\s*0\s*</);
  }
});

test('consultas de informe inválidas no alcanzan GA y dejan el marco owner utilizable', async () => {
  await reset();
  for (const search of [
    '?vista=estadisticas&periodo=8', '?vista=estadisticas&periodo=7&periodo=30',
    '?vista=estadisticas&pagina=0', '?vista=estadisticas&pagina=1.5',
    '?vista=estadisticas&pagina=1&pagina=2', '?vista=estadisticas&pagina=9007199254740992',
  ]) {
    const { response, html } = await render({ search });
    assert.equal(response.status, 400, search);
    assertOwnerContext(html);
    assert.match(text(html), /período|página/i);
    assert.match(text(html), /válid/i);
  }
  assert.deepEqual(reads, []);
});

test('una página vacía tras reducirse filas conserva vuelta al detalle interno válido', async () => {
  await reset();
  readReport = ({ profileId, period, page }) => activityReport({ creatorId: profileId, period, page,
    links: { page, pageSize: 100, totalRows: 1, rows: [] },
  });
  const { html } = await render({ search: '?vista=estadisticas&periodo=7&pagina=9' });
  const last = links(html).find((link) => /Última página con datos|Volver a la primera página/.test(link.text));
  assert.ok(last);
  const target = new URL(last.href, SITE_ORIGIN);
  assert.equal(target.pathname, '/cuenta/');
  assert.equal(target.searchParams.get('vista'), 'estadisticas');
  assert.equal(target.searchParams.get('periodo'), '7');
  assert.equal(target.searchParams.get('pagina'), '1');
  assert.doesNotMatch(text(html), /Página 9 de 1/);
  assert.equal(metric(html, 'clicks'), '43', 'total clicks are not the sum of the visible empty page');
});

test('fuentes y etiquetas del proveedor siguen siendo texto seguro en el detalle integrado', async () => {
  await reset();
  readReport = ({ profileId, period, page }) => activityReport({ creatorId: profileId, period, page,
    sources: [{ sourceMedium: '</script><img src=x onerror=alert(1)>', views: 137 }],
    links: { page, pageSize: 100, totalRows: 2, rows: [{ linkId: '(other)', clicks: 30 }, { linkId: '(not set)', clicks: 13 }] },
  });
  const { response, html } = await render({ search: '?vista=estadisticas&periodo=30&pagina=1' });
  assert.equal(response.status, 200);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.match(text(html), /Otros enlaces agrupados por Google Analytics/);
  assert.match(text(html), /Enlace no identificado/);
  assert.doesNotMatch(text(html), /ID de enlace: \(other\)|ID de enlace: \(not set\)/);
});

test('el GET antiguo redirige al detalle interno conservando períodos y páginas válidos, sin leer datos', async () => {
  await reset();
  for (const [search, period, page] of [['?periodo=30&pagina=2', '30', '2'], ['?periodo=7&pagina=3', '7', '3'], ['', '7', '1']]) {
    const { response } = await render({ legacy: true, search });
    assert.ok([301, 302, 303, 307, 308].includes(response.status), 'the old route is now a GET redirect');
    const target = new URL(response.headers.get('location'), SITE_ORIGIN);
    assert.equal(target.pathname, '/cuenta/');
    assert.equal(target.searchParams.get('vista'), 'estadisticas');
    assert.equal(target.searchParams.get('periodo'), period);
    assert.equal(target.searchParams.get('pagina'), page);
    assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  }
  assert.deepEqual(runtime.serviceCalls, [], 'a compatibility redirect does not load owner or GA');
  assert.deepEqual(reads, []);
});

test('el acceso al detalle preserva las ramas de cuenta y no lee estadísticas sin autorización', async () => {
  await reset();
  runtime.setSession('disabled', { principal: { state: 'disabled' } });
  for (const [session, status, expected] of [[null, 200, /Ingresar/], ['disabled', 403, /desactivada/]]) {
    const { response, html } = await render({ session, search: '?vista=estadisticas&periodo=7&pagina=1' });
    assert.equal(response.status, status);
    assertPrivate(response, html);
    assert.match(text(html), expected);
    assert.doesNotMatch(text(html), /Ana de actividad/);
  }
  assert.deepEqual(reads, []);
  assert.deepEqual(serviceQueries, []);
});

test('consultas antiguas inválidas se rechazan sin leer datos ni cambiar sesión', async () => {
  await reset();
  for (const search of ['?periodo=8', '?pagina=0', '?periodo=7&periodo=30', '?creatorId=other']) {
    const { response } = await render({ legacy: true, search });
    assert.equal(response.status, 400, search);
    assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.deepEqual(runtime.serviceCalls, []);
  assert.deepEqual(reads, []);
});

test('la vista estadística no salta los estados de callback ni consulta GA si no pudo cargar el perfil', async () => {
  await reset();
  for (const [state, status] of [['acceso-invalido', 400], ['cancelado', 400], ['no-disponible', 503]]) {
    const { response, html } = await render({ search: `?estado=${state}&vista=estadisticas&periodo=30&pagina=1` });
    assert.equal(response.status, status);
    assertPrivate(response, html);
    assert.doesNotMatch(text(html), /Ana de actividad/);
  }
  assert.deepEqual(runtime.serviceCalls, [], 'callback states do not start owner or statistics reads');
  runtime.overrideServiceResponse((request) => new URL(request.url).pathname.replace(/\/$/, '') === '/api/creador/perfil'
    ? Response.json({ profile: false, links: [], editableResources: [], claims: [], series: [] }) : undefined);
  const failed = await render({ search: '?vista=estadisticas&periodo=30&pagina=1' });
  assert.equal(failed.response.status, 503);
  assert.doesNotMatch(text(failed.html), /Crear borrador|Crear mi página/);
  assert.match(text(failed.html), /No pudimos cargar tu página/);
  assert.deepEqual(reads, []);
});

test('la compatibilidad del GET no redirige operaciones POST ni altera sesión o contenido', async () => {
  await reset();
  const { response } = await render({ legacy: true, method: 'POST', search: '?periodo=30&pagina=1' });
  assert.ok(response.status < 300 || response.status >= 400, 'only GET is a compatibility redirect');
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.ok(runtime.serviceCalls.every(({ method }) => method === 'GET'), 'the route does not turn the POST into a creator mutation');
});

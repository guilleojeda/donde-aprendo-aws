import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';
import { createCreatorOwnerRuntime, SITE_ORIGIN } from './fixtures/creator-owner-runtime.mjs';
import { createOwnerLinksSurface, mountOwnerLinks, settle } from './fixtures/creator-owner-links-browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = path.join(root, '.work/creator-owner-experience/planning/phase3');
await mkdir(scratch, { recursive: true });
const tempDir = await mkdtemp(path.join(scratch, 'owner-links-route-'));
const stateKey = `__creatorOwnerLinksRoute_${path.basename(tempDir).replaceAll('-', '_')}`;
const routeEntry = path.join(root, 'src/pages/cuenta/index.astro');

after(async () => {
  delete globalThis[stateKey];
  await rm(tempDir, { recursive: true, force: true });
});

await writeFile(path.join(tempDir, 'creator-runtime-stub.mjs'),
  `export function getCreatorRuntime() { return globalThis[${JSON.stringify(stateKey)}].runtime; }`);
await writeFile(path.join(tempDir, 'account-runtime-stub.mjs'),
  `export function getAccountAuth() { return globalThis[${JSON.stringify(stateKey)}].runtime.accountAuth; }`);

await build({
  entryPoints: { owner: routeEntry },
  outdir: tempDir,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outExtension: { '.js': '.mjs' },
  define: {
    'import.meta.env.PUBLIC_SITE_ORIGIN': JSON.stringify(SITE_ORIGIN),
    'import.meta.env.PUBLIC_PRODUCTION': '"true"',
  },
  plugins: [{
    name: 'creator-owner-links-route-runtime',
    setup(api) {
      api.onResolve({ filter: /creator-runtime\.mjs$/ }, () => ({ path: path.join(tempDir, 'creator-runtime-stub.mjs') }));
      api.onResolve({ filter: /account-runtime\.mjs$/ }, () => ({ path: path.join(tempDir, 'account-runtime-stub.mjs') }));
      api.onResolve({ filter: /\?raw$/ }, ({ path: requested, resolveDir }) => ({
        path: path.resolve(resolveDir, requested.slice(0, -4)), namespace: 'raw',
      }));
      api.onLoad({ filter: /.*/, namespace: 'raw' }, () => ({ contents: 'export default "";', loader: 'js' }));
      api.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' }));
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

const route = (await import(pathToFileURL(path.join(tempDir, 'owner.mjs')).href)).default;
const container = await experimental_AstroContainer.create({ astroConfig: { site: SITE_ORIGIN } });
let runtime;

const csrfBySession = { 'creator-a': 'csrf-a', 'creator-b': 'csrf-creator-b', admin: 'csrf-admin' };

async function resetRuntime() {
  runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  runtime.setSession('creator-b');
  runtime.setSession('admin');
  globalThis[stateKey] = { runtime };
  return runtime;
}

async function api(pathname, body, { method = 'PUT', session = 'creator-a' } = {}) {
  const response = await runtime.fetchApi(pathname, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfBySession[session] },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, { session });
  const payload = await response.json().catch(() => null);
  assert.ok(response.ok, `${method} ${pathname} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function createProfile({ session = 'creator-a', slug = 'ana-enlaces', published = true } = {}) {
  const profile = (await api('/api/creador/perfil/', {
    displayName: session === 'creator-a' ? 'Ana de enlaces' : 'Bea de enlaces',
    slug,
    city: 'Córdoba',
    country: 'Argentina',
    socials: {},
  }, { session })).profile;
  if (published) return (await api('/api/creador/perfil/publicar/', {}, { method: 'POST', session })).profile;
  return profile;
}

async function addLink({
  session = 'creator-a',
  title = 'Guía de ejemplo',
  url = `https://links.example/${encodeURIComponent(title.toLowerCase().replaceAll(' ', '-'))}`,
  selectedForDirectory = true,
} = {}) {
  return (await api('/api/creador/enlaces/', { title, url, selectedForDirectory }, { method: 'POST', session })).link;
}

async function createSeries({ session = 'creator-a', name = 'Ruta de Serverless', slug = 'ruta-serverless' } = {}) {
  const current = await api('/api/creador/perfil/', undefined, { method: 'GET', session });
  return (await api('/api/creador/series/', {
    name,
    slug,
    profileVersion: current.profile.version,
  }, { method: 'POST', session })).series;
}

async function assignChapter(seriesId, placementId) {
  const current = await api('/api/creador/perfil/', undefined, { method: 'GET' });
  return api(`/api/creador/series/${encodeURIComponent(seriesId)}/capitulos/${encodeURIComponent(placementId)}`, {
    profileVersion: current.profile.version,
  }, { method: 'PUT' });
}

async function editorData(session = 'creator-a') {
  return api('/api/creador/perfil/', undefined, { method: 'GET', session });
}

async function render(search = '', { session = 'creator-a' } = {}) {
  globalThis[stateKey] = { runtime };
  const response = await container.renderToResponse(route, {
    request: runtime.request('/cuenta/', { session, search }),
    partial: false,
  });
  return { response, html: await response.text() };
}

function visibleText(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/gi, "'")
    .replace(/\s+/g, ' ').trim();
}

function attribute(attrs, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return attrs.match(new RegExp(`(?:^|\\s)${escaped}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((value) => value !== undefined);
}

function ownerTable(html) {
  const marker = html.match(/<(?:table|section|div)\b(?=[^>]*\bdata-owner-links(?:\s|=|>))[^>]*>/i);
  assert.ok(marker, 'the owner view renders the semantic links table region');
  const table = html.match(/<table\b([^>]*)>([\s\S]*?)<\/table>/i);
  assert.ok(table, 'the links region uses an HTML table');
  return { attrs: table[1], body: table[2] };
}

function rowsIn(html) {
  const { body } = ownerTable(html);
  return [...body.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)].map(([, attrs, body]) => ({
    id: attribute(attrs, 'data-link-row'), attrs, body, text: visibleText(body),
  })).filter((row) => row.id !== undefined);
}

function pageLinks(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(([, attrs, body]) => ({
    text: visibleText(body),
    href: attribute(attrs, 'href')?.replaceAll('&amp;', '&'),
    attrs,
  })).filter((link) => link.href);
}

function forms(html) {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map(([, attrs, body]) => ({ attrs, body }));
}

function formByHook(html, hook) {
  const form = forms(html).find(({ attrs }) => new RegExp(`\\b${hook}(?:\\s|=|>)`, 'i').test(attrs));
  assert.ok(form, `SSR includes the ${hook} form`);
  return form;
}

function assertPrivate(response, html, status = 200) {
  assert.equal(response.status, status);
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(html, /<meta[^>]+name="robots"[^>]+noindex/i);
  assert.doesNotMatch(html, /analytics\.js|gtag\(|google-analytics/i);
}

function assertGetFilters(html, expected) {
  const form = forms(html).find(({ attrs, body }) => /method="get"/i.test(attrs)
    && /\bname="(?:buscar|serie|directorio|destacado|orden|paginaEnlaces)"/i.test(body));
  assert.ok(form, 'the filter controls are in a native GET form');
  assert.match(form.attrs, /method="get"/i, 'filters work as an ordinary GET form without JavaScript');
  assert.match(form.attrs, /action="\/cuenta\/?"/i);
  for (const [name, value] of Object.entries(expected)) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const select = form.body.match(new RegExp(`<select\\b(?=[^>]*\\bname="${escapedName}")[^>]*>([\\s\\S]*?)<\\/select>`, 'i'));
    if (select) {
      const selected = select[1].match(new RegExp(`<option\\b(?=[^>]*\\bvalue="${value}")(?=[^>]*\\bselected)[^>]*>`, 'i'));
      assert.ok(selected, `the filter form preserves ${name}=${value}`);
    } else {
      assert.match(form.body, new RegExp(`<input\\b(?=[^>]*\\bname="${escapedName}")(?=[^>]*\\bvalue="${value}")[^>]*>`, 'i'),
        `the filter form preserves ${name}=${value}`);
    }
  }
}

async function currentResourceVersion(resourceId) {
  return (await runtime.pages.store.get(`resource:${resourceId}`)).version;
}

async function classifyResource(resourceId) {
  return api(`/api/admin/recursos/${encodeURIComponent(resourceId)}/`, {
    category: 'Artículo',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    version: await currentResourceVersion(resourceId),
  }, { method: 'PATCH', session: 'admin' });
}

async function adminAction(pathname, resourceId) {
  return api(`/api/admin/recursos/${encodeURIComponent(resourceId)}/${pathname}/`, {
    version: await currentResourceVersion(resourceId),
  }, { method: 'POST', session: 'admin' });
}

test('la tabla distingue cero y un enlace, y ofrece alta por URL desde Tu página', async () => {
  await resetRuntime();
  await createProfile();

  const empty = await render();
  assertPrivate(empty.response, empty.html);
  assert.equal(rowsIn(empty.html).length, 0);
  assert.match(visibleText(empty.html), /sin enlaces|todavía no.*enlaces|no agregaste enlaces/i);
  assert.match(visibleText(empty.html), /\b0\b/, 'the owner sees zero matches and a zero total');
  const addForm = formByHook(empty.html, 'data-link-add-form');
  assert.match(addForm.body, /name="title"/i);
  assert.match(addForm.body, /name="url"/i);

  const link = await addLink({ title: 'Una única guía', url: 'https://links.example/una-unica-guia' });
  const one = await render();
  assertPrivate(one.response, one.html);
  const [row] = rowsIn(one.html);
  assert.equal(rowsIn(one.html).length, 1);
  assert.equal(row.id, link.placementId);
  assert.match(row.text, /Una única guía/);
  assert.match(row.text, /links\.example/);
  assert.match(visibleText(one.html), /\b1\b/, 'the owner sees one matching link and its total');
  assert.match(one.html, /destacado|destacar/i);
  assert.match(one.html, /directorio/i);
});

test('el estado vacío SSR queda visible sin JavaScript y singulariza un enlace', async () => {
  await resetRuntime();
  await createProfile();
  const empty = await render();
  const emptyMessage = empty.html.match(/<p\b([^>]*\bdata-link-empty\b[^>]*)>/i);
  assert.ok(emptyMessage);
  assert.doesNotMatch(emptyMessage[1], /\bhidden(?:\s|=|>)/i);
  assert.match(visibleText(empty.html), /todavía no agregaste enlaces/i);
  await addLink({ title: 'Una ficha', url: 'https://links.example/una-ficha' });
  const one = await render();
  assert.match(visibleText(one.html), /1 coincidencia de 1 enlace/i);
});

test('50 enlaces se dividen en dos páginas de 25 sin límite de producto', async () => {
  await resetRuntime();
  await createProfile();
  const created = [];
  for (let index = 0; index < 50; index += 1) {
    created.push(await addLink({ title: `Alpha ${String(index).padStart(2, '0')}`, url: `https://links.example/50/${index}` }));
  }

  const first = await render();
  assertPrivate(first.response, first.html);
  assert.equal(rowsIn(first.html).length, 25);
  assert.match(visibleText(first.html), /\b50\b/, 'the visible total counts the full set, not only the current page');
  const next = pageLinks(first.html).find(({ text }) => /siguiente/i.test(text));
  assert.ok(next, 'the first page links to the second page');
  assert.equal(new URL(next.href, SITE_ORIGIN).searchParams.get('paginaEnlaces'), '2');

  const second = await render('?paginaEnlaces=2');
  assertPrivate(second.response, second.html);
  assert.equal(rowsIn(second.html).length, 25);
  assert.equal(new Set([...rowsIn(first.html), ...rowsIn(second.html)].map(({ id }) => id)).size, 50);
  assert.equal(created.length, 50);
});

test('los filtros distinguen selección del directorio, aprobación, ocultamiento y destacado', async () => {
  await resetRuntime();
  await createProfile();
  const notProposed = await addLink({ title: 'No propuesto', url: 'https://links.example/state/not-proposed', selectedForDirectory: false });
  const pending = await addLink({ title: 'Pendiente', url: 'https://links.example/state/pending' });
  const approved = await addLink({ title: 'Aprobado', url: 'https://links.example/state/approved' });
  const revoked = await addLink({ title: 'Revocado', url: 'https://links.example/state/revoked' });
  const hidden = await addLink({ title: 'Oculto aprobado', url: 'https://links.example/state/hidden' });
  const featured = await addLink({ title: 'Destacado', url: 'https://links.example/state/featured' });

  for (const resourceId of [approved.resourceId, revoked.resourceId, hidden.resourceId]) await classifyResource(resourceId);
  await adminAction('aprobar', approved.resourceId);
  await adminAction('aprobar', revoked.resourceId);
  await adminAction('revocar', revoked.resourceId);
  await adminAction('aprobar', hidden.resourceId);
  await adminAction('ocultar', hidden.resourceId);
  await api(`/api/creador/enlaces/${encodeURIComponent(featured.placementId)}/`, { featured: true }, { method: 'PATCH' });

  const expectRows = async (search, expectedIds) => {
    const { response, html } = await render(search);
    assertPrivate(response, html);
    assert.deepEqual(rowsIn(html).map(({ id }) => id).sort(), [...expectedIds].sort(), search);
  };
  await expectRows('?directorio=todos', [notProposed.placementId, pending.placementId, approved.placementId, revoked.placementId, hidden.placementId, featured.placementId]);
  await expectRows('?directorio=propuestos', [pending.placementId, approved.placementId, revoked.placementId, hidden.placementId, featured.placementId]);
  await expectRows('?directorio=no-propuestos', [notProposed.placementId]);
  await expectRows('?directorio=pendientes', [notProposed.placementId, pending.placementId, featured.placementId]);
  await expectRows('?directorio=aprobados', [approved.placementId, hidden.placementId]);
  await expectRows('?directorio=revocados', [revoked.placementId]);
  await expectRows('?directorio=ocultos', [hidden.placementId]);
  await expectRows('?destacado=si', [featured.placementId]);
  await expectRows('?destacado=no', [notProposed.placementId, pending.placementId, approved.placementId, revoked.placementId, hidden.placementId]);

  const rendered = await render();
  const rowText = new Map(rowsIn(rendered.html).map(({ id, text }) => [id, text]));
  assert.match(rowText.get(notProposed.placementId), /no propuesto/i);
  assert.match(rowText.get(notProposed.placementId), /aprobación pendiente|pendiente/i,
    'the creator selection and the separate review state remain visible together');
  assert.match(rowText.get(pending.placementId), /pendiente/i);
  assert.match(rowText.get(approved.placementId), /aprobado/i);
  assert.match(rowText.get(revoked.placementId), /revocado/i);
  assert.match(rowText.get(hidden.placementId), /oculto/i);
  assert.match(rowText.get(hidden.placementId), /aprobado/i,
    'the row keeps approval and moderation visibility as independent facts');

  const owner = await editorData();
  const byId = new Map(owner.links.map((link) => [link.placementId, link]));
  assert.equal(byId.get(notProposed.placementId).selectedForDirectory, false);
  assert.equal(byId.get(approved.placementId).directoryApproval, 'approved');
  assert.equal(byId.get(revoked.placementId).directoryApproval, 'revoked');
  assert.equal(byId.get(hidden.placementId).hidden, true);
  assert.equal(byId.get(hidden.placementId).directoryApproval, 'approved',
    'moderation hiding does not erase the independent directory approval');
  assert.equal(byId.get(featured.placementId).featured, true);
});

test('56 enlaces admiten búsqueda global, filtros, orden de consulta, página válida y estado GET conservado', async () => {
  await resetRuntime();
  const profile = await createProfile();
  const created = [];
  for (let index = 0; index < 56; index += 1) {
    const title = index === 52 ? 'Árbol Lambda guía extensa' : index === 55 ? 'Zulu último recurso' : `Alpha ${String(index).padStart(2, '0')}`;
    const url = index === 53 ? 'https://catalog.example/cursos/ruta-unica-global' : `https://links.example/56/${index}`;
    created.push(await addLink({ title, url }));
  }

  const series = await createSeries();
  for (let index = 5; index < 35; index += 1) await assignChapter(series.id, created[index].placementId);
  await assignChapter(series.id, created[54].placementId);

  const duplicated = await addLink({ title: 'Título empatado', url: 'https://links.example/56/tie-a' });
  const duplicatedAgain = await addLink({ title: 'Título empatado', url: 'https://links.example/56/tie-b' });
  const firstPlacementKey = `placement:${profile.id}:${duplicated.placementId}`;
  const secondPlacementKey = `placement:${profile.id}:${duplicatedAgain.placementId}`;
  const firstPlacement = await runtime.pages.store.get(firstPlacementKey);
  const secondPlacement = await runtime.pages.store.get(secondPlacementKey);
  assert.equal(await runtime.pages.store.transact({
    checks: [{ key: firstPlacementKey, version: firstPlacement.version }, { key: secondPlacementKey, version: secondPlacement.version }],
    puts: [
      { key: firstPlacementKey, value: { ...firstPlacement, position: 1000 } },
      { key: secondPlacementKey, value: { ...secondPlacement, position: 1000 } },
    ],
  }), true);

  const notProposed = created[0];
  await api(`/api/creador/enlaces/${encodeURIComponent(notProposed.placementId)}/`, { selectedForDirectory: false }, { method: 'PATCH' });
  const featured = created[4];
  await api(`/api/creador/enlaces/${encodeURIComponent(featured.placementId)}/`, { featured: true }, { method: 'PATCH' });
  await classifyResource(created[1].resourceId);
  await classifyResource(created[2].resourceId);
  await classifyResource(created[3].resourceId);
  await adminAction('aprobar', created[1].resourceId);
  await adminAction('aprobar', created[2].resourceId);
  await adminAction('revocar', created[2].resourceId);
  await adminAction('aprobar', created[3].resourceId);
  await adminAction('ocultar', created[3].resourceId);

  const owner = await editorData();
  assert.equal(owner.links.length, 58);
  const readOnlyCallsStart = runtime.pages.store.calls.length;
  const publicPage = await runtime.pages.service.readPublicProfile('ana-enlaces');
  assert.equal(publicPage.status, 200);
  const initial = await render();
  assertPrivate(initial.response, initial.html);
  assert.equal(rowsIn(initial.html).length, 25);
  const initialIds = rowsIn(initial.html).map(({ id }) => id);
  assert.deepEqual(initialIds, owner.links.slice(0, 25).map(({ placementId }) => placementId),
    'the initial table uses the public page order and its placementId tie-breaker');
  const publicIds = publicPage.links.map(({ placementId }) => placementId);
  assert.deepEqual(owner.links.filter(({ hidden }) => !hidden).map(({ placementId }) => placementId), publicIds,
    'the owner order and the public order agree, while hidden links remain manageable');
  const tieIds = [duplicated.placementId, duplicatedAgain.placementId].sort((left, right) => left.localeCompare(right));
  assert.deepEqual(owner.links.filter(({ placementId }) => tieIds.includes(placementId)).map(({ placementId }) => placementId), tieIds);

  const third = await render('?paginaEnlaces=99');
  assert.equal(rowsIn(third.html).length, 8, 'an out-of-range page normalizes to the last page, with at least one page');
  const previous = pageLinks(third.html).find(({ text }) => /anterior/i.test(text));
  assert.ok(previous);
  assert.equal(new URL(previous.href, SITE_ORIGIN).searchParams.get('paginaEnlaces'), '2');
  assert.equal(pageLinks(third.html).some(({ text }) => /siguiente/i.test(text)), false);

  const titleSearch = await render('?buscar=%20ARBOL%20');
  assert.deepEqual(rowsIn(titleSearch.html).map(({ id }) => id), [created[52].placementId],
    'title search trims whitespace and ignores case and accents over the full collection');
  assert.match(visibleText(titleSearch.html), /\b1\b/);
  assert.match(visibleText(titleSearch.html), /\b58\b/, 'search results show both the match count and the collection total');
  const urlSearch = await render('?buscar=ruta-unica-global');
  assert.deepEqual(rowsIn(urlSearch.html).map(({ id }) => id), [created[53].placementId],
    'URL search finds a match beyond the first page');
  const seriesSearch = await render('?buscar=%20RUTA%20DE%20SERVERLESS%20&paginaEnlaces=2');
  assert.equal(rowsIn(seriesSearch.html).length, 6);
  assert.equal(rowsIn(seriesSearch.html).some(({ id }) => id === created[54].placementId), true,
    'search by series name includes a matching link from the complete collection');
  assert.equal(new URL(pageLinks(seriesSearch.html).find(({ text }) => /anterior/i.test(text)).href, SITE_ORIGIN).searchParams.get('buscar'), ' RUTA DE SERVERLESS ');

  const filtered = await render(`?serie=${encodeURIComponent(series.id)}&directorio=propuestos&destacado=no&orden=titulo-asc`);
  assert.equal(rowsIn(filtered.html).length, 25);
  assertGetFilters(filtered.html, {
    serie: series.id,
    directorio: 'propuestos',
    destacado: 'no',
    orden: 'titulo-asc',
  });
  const filteredNext = pageLinks(filtered.html).find(({ text }) => /siguiente/i.test(text));
  assert.ok(filteredNext, 'the matching series has more than one page');
  const filteredNextUrl = new URL(filteredNext.href, SITE_ORIGIN);
  for (const [key, value] of Object.entries({ serie: series.id, directorio: 'propuestos', destacado: 'no', orden: 'titulo-asc', paginaEnlaces: '2' })) {
    assert.equal(filteredNextUrl.searchParams.get(key), value, `pagination preserves ${key}`);
  }

  const hasPublicOrder = await editorData();
  await render('?orden=titulo-asc');
  const descending = await render('?orden=titulo-desc');
  const ascending = await render('?orden=titulo-asc');
  assert.match(rowsIn(ascending.html)[0].text, /Alpha 00/);
  assert.match(rowsIn(descending.html)[0].text, /Zulu último recurso/);
  for (const order of ['titulo-asc', 'titulo-desc']) {
    const tied = await render(`?buscar=${encodeURIComponent('Título empatado')}&orden=${order}`);
    assert.deepEqual(rowsIn(tied.html).map(({ id }) => id), tieIds,
      `title ties in ${order} use placementId as a stable secondary order`);
  }
  assert.deepEqual((await editorData()).links.map(({ placementId, position, featured }) => ({ placementId, position, featured })),
    hasPublicOrder.links.map(({ placementId, position, featured }) => ({ placementId, position, featured })),
    'query sorting does not write or reorder the public page');

  const statsParamsIgnored = await render('?vista=enlaces&periodo=7&pagina=2&paginaEnlaces=2&orden=pagina');
  assertPrivate(statsParamsIgnored.response, statsParamsIgnored.html);
  assert.equal(rowsIn(statsParamsIgnored.html).length, 25);
  assert.ok(!runtime.serviceCalls.some(({ path }) => /\/estadisticas\/?$/.test(path)),
    'statistics-only parameters do not switch the selected links table into an error');
  assert.equal(runtime.pages.store.calls.slice(readOnlyCallsStart).filter(({ operation }) => operation === 'transact').length, 0,
    'SSR searching, filtering, sorting and paging are read-only, including profile and selection versions');
  const afterQueries = await editorData();
  assert.deepEqual(afterQueries.links, owner.links);
  assert.equal(afterQueries.profile.version, owner.profile.version);
});

for (const [label, search] of [
  ['filtro de directorio desconocido', '?directorio=archivados'],
  ['filtro de destacado desconocido', '?destacado=maybe'],
  ['orden desconocido', '?orden=fecha'],
  ['serie desconocida', '?serie=no-existe'],
  ['página cero', '?paginaEnlaces=0'],
  ['página no entera', '?paginaEnlaces=2.5'],
  ['parámetro de página repetido', '?paginaEnlaces=1&paginaEnlaces=2'],
]) {
  test(`la consulta con ${label} devuelve error local y no presenta la tabla como colección vacía`, async () => {
    await resetRuntime();
    await createProfile();
    await addLink({ title: 'El enlace existe aunque la consulta sea inválida' });

    const { response, html } = await render(search);
    assert.equal(response.status, 400);
    assertPrivate(response, html, 400);
    assert.match(html, /role="alert"/i, 'the invalid query reports an actionable local error');
    assert.doesNotMatch(html, /data-link-row=/, 'a malformed selection is not shown as zero matching results');
    assert.doesNotMatch(visibleText(html), /todavía no agregaste enlaces|sin enlaces/i);
    const clear = pageLinks(html).find(({ text }) => /limpiar (?:búsqueda|filtros|consulta)|quitar filtros/i.test(text));
    assert.ok(clear, 'the local error offers a clean query');
    const cleanUrl = new URL(clear.href, SITE_ORIGIN);
    assert.equal(cleanUrl.pathname, '/cuenta/');
    assert.equal(cleanUrl.searchParams.get('vista'), 'enlaces');
    assert.equal(cleanUrl.searchParams.has('directorio'), false);
    assert.equal(cleanUrl.searchParams.has('destacado'), false);
    assert.equal(cleanUrl.searchParams.has('orden'), false);
    assert.equal(cleanUrl.searchParams.has('serie'), false);
    assert.equal(cleanUrl.searchParams.has('paginaEnlaces'), false);
  });
}

test('la edición de fila es contextual, cerrada inicialmente y respeta autoridad sobre la ficha compartida', async () => {
  await resetRuntime();
  await createProfile({ session: 'creator-b', slug: 'bea-fichas' });
  const sharedResource = await addLink({ session: 'creator-b', title: 'Ficha de otra persona', url: 'https://links.example/ficha-compartida' });
  await createProfile();
  const ownedResource = await addLink({ title: 'Ficha propia', url: 'https://links.example/ficha-propia' });
  const sharedPlacement = await addLink({ title: 'Referencia compartida', url: sharedResource.url });

  const { response, html } = await render();
  assertPrivate(response, html);
  const table = ownerTable(html);
  assert.equal((table.body.match(/<form\b/gi) ?? []).length, 0, 'forms are not repeated inside every table row');
  const dialog = html.match(/<dialog\b([^>]*)>([\s\S]*?)<\/dialog>/i);
  assert.ok(dialog, 'editing uses the shared owner dialog');
  assert.doesNotMatch(dialog[1], /\bopen(?:\s|>|=)/i, 'the editor starts closed');
  const editForm = formByHook(html, 'data-link-edit-form');
  assert.match(editForm.body, /Guardar/);
  assert.match(editForm.body, /Cancelar/);
  assert.match(editForm.attrs, /hidden/i, 'the edit form does not start open');
  assert.equal(forms(html).filter(({ attrs }) => /data-link-edit-form/i.test(attrs)).length, 1,
    'only one link edit form is rendered for all rows');
  const ownRow = rowsIn(html).find(({ id }) => id === ownedResource.placementId);
  const sharedRow = rowsIn(html).find(({ id }) => id === sharedPlacement.placementId);
  assert.match(ownRow.body, /data-link-edit/);
  assert.match(visibleText(ownRow.body), /Editar(?: ficha)?/i);
  assert.match(sharedRow.body, /data-link-edit/);
  assert.match(visibleText(sharedRow.body), /Editar opciones/i,
    'a shared resource exposes placement options without offering unauthorized resource editing');
  assert.equal(sharedResource.resourceId, sharedPlacement.resourceId);
  assert.equal(ownedResource.resourceId === sharedPlacement.resourceId, false);
});

test('una ficha propia retirada sigue accesible en el contenido secundario para editarla o reincorporarla', async () => {
  await resetRuntime();
  const profile = await createProfile();
  const link = await addLink({ title: 'Recurso propio conservado', url: 'https://links.example/recurso-conservado' });
  const series = await createSeries({ name: 'Serie que pierde capítulo', slug: 'serie-sin-capitulo' });
  await assignChapter(series.id, link.placementId);
  const current = await editorData();
  await api(`/api/creador/enlaces/${encodeURIComponent(link.placementId)}/`, {
    profileVersion: current.profile.version,
  }, { method: 'DELETE' });

  const { response, html } = await render();
  assertPrivate(response, html);
  assert.equal(rowsIn(html).length, 0, 'the retired placement no longer appears as a current link');
  assert.match(visibleText(html), /Contenido que puedes volver a agregar/i);
  assert.match(visibleText(html), /Recurso propio conservado/);
  const retainedMatch = html.match(/<(section|details|div)\b(?=[^>]*\bdata-owner-retained-links\b)([^>]*)>([\s\S]*?)<\/\1>/i);
  assert.ok(retainedMatch, 'reusable owned resources have a secondary owner section');
  const retained = [retainedMatch[0], retainedMatch[2], retainedMatch[3]];
  const retainedItemMatch = retained[2].match(/<(li|div)\b(?=[^>]*\bdata-retained-resource(?:\s|=|>))([^>]*)>([\s\S]*?)<\/\1>/i);
  assert.ok(retainedItemMatch, 'each retained editable resource has a distinct secondary item');
  const retainedItem = [retainedItemMatch[0], retainedItemMatch[2], retainedItemMatch[3]];
  assert.match(retainedItem[1], new RegExp(`data-retained-resource="${link.resourceId}"`));
  assert.match(retainedItem[2], /data-link-edit/);
  assert.match(visibleText(retainedItem[2]), /Editar ficha/i, 'the retained resource can still be edited contextually');
  const reinclude = retainedItem[2].match(/<(button|a)\b([^>]*\bdata-link-reinclude\b[^>]*)>([\s\S]*?)<\/\1>/i);
  assert.ok(reinclude, 'the retained resource has a re-add action');
  assert.match(visibleText(reinclude[3]), /volver a agregar|reincorporar/i);
  assert.match(reinclude[2], new RegExp(`(?:data-resource-id|data-resource-id-value)="${link.resourceId}"`));
  assert.doesNotMatch(reinclude[1], /https?:/i, 're-add identity is the observed resource ID, not its old URL');
  assert.doesNotMatch(retainedItem[2], /<form\b/i, 'retained resources do not each expose an open metadata form');

  const initialScript = html.match(/<script\b(?=[^>]*id="creator-owner-data")[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(initialScript);
  const initialData = JSON.parse(initialScript[1]);
  const metadata = initialData.editableResources.find(({ id }) => id === link.resourceId);
  assert.ok(metadata, 'the owner DTO keeps metadata for the retained resource');
  assert.equal(metadata.version, (await runtime.pages.store.get(`resource:${link.resourceId}`)).version,
    'the contextual re-add surface has the current observed resource version');
  assert.equal(initialData.links.some(({ placementId }) => placementId === link.placementId), false);
  assert.equal(profile.id, current.profile.id);
});

test('agregar la URL ya existente de otro perfil conserva su ficha y acepta el recibo profile+placement real', async () => {
  await resetRuntime();
  await createProfile({ session: 'creator-b', slug: 'bea-enlaces' });
  const shared = await addLink({
    session: 'creator-b', title: 'Ficha original de Bea',
    url: 'https://links.example/ficha-compartida-existente',
  });
  await createProfile();
  const owner = await editorData();
  const surface = createOwnerLinksSurface({
    profile: owner.profile, links: owner.links,
    editableResources: owner.editableResources, series: owner.series,
  });
  const requests = await mountOwnerLinks({ surface, fetch: (request) => runtime.fetchApi(request.url.pathname, {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
  }, { session: 'creator-a' }) });

  await surface.addOpen.dispatch('click');
  const value = (name, input) => {
    const control = surface.addForm.elements.find((item) => item.name === name);
    control.value = input;
    return control;
  };
  value('title', 'Título local que no reemplaza el original');
  value('url', shared.url);
  value('description', 'Descripción local que no reemplaza el original');
  await surface.addForm.dispatch('submit');
  await settle();

  const post = requests.find(({ method, path }) => method === 'POST' && path === '/api/creador/enlaces');
  assert.equal(post.status, 201);
  assert.deepEqual(post.body, {
    title: 'Título local que no reemplaza el original',
    url: shared.url,
    description: 'Descripción local que no reemplaza el original',
    selectedForDirectory: true,
  });
  assert.equal(surface.dialog.open, false, 'a verified attachment closes the shared add dialog');
  assert.equal(surface.addStatus.dataset.kind, 'success', 'the compatible attach receipt is not reported as an error');

  const attached = await editorData();
  assert.equal(attached.links.length, 1);
  assert.equal(attached.links[0].resourceId, shared.resourceId);
  assert.equal(attached.links[0].title, 'Ficha original de Bea');
  assert.equal(attached.links[0].description, '');
  assert.equal(attached.links[0].selectedForDirectory, true);
  assert.equal(attached.editableResources.some(({ id }) => id === shared.resourceId), false,
    'sharing the existing resource does not grant metadata authority');
  const row = surface.table.querySelectorAll('[data-link-row]').find(({ dataset }) => dataset.linkRow === attached.links[0].placementId);
  assert.ok(row);
  assert.equal(row.querySelector('[data-link-edit]').textContent, 'Editar opciones');
  const original = await editorData('creator-b');
  assert.equal(original.links[0].title, 'Ficha original de Bea');
});

test('guardar sólo destacado conserva una descripción opcional ausente con el API real', async () => {
  await resetRuntime();
  await createProfile();
  const link = await addLink({ title: 'Ficha sin descripción', url: 'https://links.example/sin-descripcion' });
  const key = `resource:${link.resourceId}`;
  const resource = await runtime.pages.store.get(key);
  const { description: _description, ...resourceWithoutDescription } = resource;
  assert.equal(await runtime.pages.store.transact({
    checks: [{ key, version: resource.version }],
    puts: [{ key, value: resourceWithoutDescription }],
  }), true);
  const owner = await editorData();
  assert.equal(owner.links[0].description, undefined);
  const surface = createOwnerLinksSurface({
    profile: owner.profile, links: owner.links,
    editableResources: owner.editableResources, series: owner.series,
  });
  const requests = await mountOwnerLinks({ surface, fetch: (request, options) => runtime.fetchApi(request.path, options) });

  const edit = surface.table.querySelector('[data-link-row]')?.querySelector('[data-link-edit]');
  await edit.dispatch('click');
  const featured = surface.linkEditForm.elements.find((item) => item.name === 'featured');
  featured.checked = true;
  await surface.linkEditForm.dispatch('submit');
  await settle();

  const patch = requests.find(({ method, path }) => method === 'PATCH' && path.endsWith('/editar'));
  assert.equal(patch.status, 200);
  assert.deepEqual(Object.keys(patch.body).sort(), [
    'featured', 'placementVersion', 'profileVersion', 'resourceVersion', 'selectedForDirectory',
  ]);
  assert.equal(surface.linkStatus.dataset.kind, 'success');
  assert.equal(surface.dialog.open, false);
  const latest = await editorData();
  assert.equal(latest.links[0].featured, true);
  assert.equal(latest.links[0].description, undefined);
  assert.equal(latest.links[0].resourceVersion, link.resourceVersion);
});

test('la fila conserva títulos extensos y escapa contenido malicioso en el SSR privado', async () => {
  await resetRuntime();
  await createProfile();
  const hostileTitle = `${'Título largo '.repeat(12)}<img src=x onerror=alert(1)>`;
  assert.ok(hostileTitle.length <= 200);
  const link = await addLink({ title: hostileTitle, url: 'https://links.example/titulo-largo' });

  const { response, html } = await render();
  assertPrivate(response, html);
  const row = rowsIn(html).find(({ id }) => id === link.placementId);
  assert.ok(row);
  assert.match(row.body, /&lt;img src=x onerror=alert\(1\)&gt;/i);
  assert.doesNotMatch(row.body, /<img src=x onerror=alert\(1\)>/i);
  assert.match(row.text, /Título largo/);
  assert.doesNotMatch(row.body, /<form\b/i, 'a long title does not turn the compact row into an open form');
});

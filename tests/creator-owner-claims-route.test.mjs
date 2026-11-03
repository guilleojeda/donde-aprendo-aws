import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { createCreatorOwnerAstroContainer } from './fixtures/creator-owner-astro-container.mjs';
import { createCreatorOwnerRuntime, SITE_ORIGIN } from './fixtures/creator-owner-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = path.join(root, '.work/creator-owner-experience/planning/phase7/ui');
await mkdir(evidenceDir, { recursive: true });
const tempDir = await mkdtemp(path.join(evidenceDir, 'claims-ssr-'));
const ownerEntry = path.join(root, 'src/pages/cuenta/index.astro');
const runtimeStateKey = `__creatorOwnerClaimsRoute_${path.basename(tempDir).replaceAll('-', '_')}`;

after(async () => {
  delete globalThis[runtimeStateKey];
  await rm(tempDir, { recursive: true, force: true });
});

await writeFile(path.join(tempDir, 'creator-runtime-stub.mjs'),
  `export function getCreatorRuntime() { return globalThis[${JSON.stringify(runtimeStateKey)}].runtime; }`);
await writeFile(path.join(tempDir, 'account-runtime-stub.mjs'),
  `export function getAccountAuth() { return globalThis[${JSON.stringify(runtimeStateKey)}].runtime.accountAuth; }`);

await build({
  entryPoints: { owner: ownerEntry },
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
    name: 'creator-owner-claims-ssr-runtime',
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

const ownerRoute = (await import(pathToFileURL(path.join(tempDir, 'owner.mjs')).href)).default;
const container = await createCreatorOwnerAstroContainer({ astroConfig: { site: SITE_ORIGIN } });
let runtime;

function claim({ id, resourceIds, resources, status = 'pending', evidence = 'Nota privada para revisión' } = {}) {
  return {
    id,
    resourceIds,
    ...(resources ? { resources } : {}),
    status,
    createdAt: Date.UTC(2026, 9, 28, 12),
    evidence,
  };
}

function ownerData({ profile = undefined, claims = [] } = {}) {
  const hasProfile = profile !== null;
  return {
    profile: profile === null ? null : {
      id: 'creator-1', displayName: 'Ana de catálogo', slug: 'ana-catalogo', version: 9,
      city: 'Córdoba', country: 'Argentina', programs: [], bio: 'Página de ejemplo.', socials: {},
      published: true, hidden: false, ...(profile ?? {}),
    },
    links: hasProfile ? [
      {
        placementId: 'placement-own', resourceId: 'resource-own', title: 'Guía propia',
        url: 'https://owner.example.invalid/guia', description: 'Del propietario', featured: false,
        position: 0, selectedForDirectory: true, hidden: false, directoryApproval: 'approved',
        resourceVersion: 3, placementVersion: 9, series: [{ seriesId: 'series-1', position: 0 }],
      },
      {
        placementId: 'placement-shared', resourceId: 'resource-shared', title: 'Guía compartida',
        url: 'https://shared.example.invalid/guia', description: 'Ficha editorial compartida', featured: false,
        position: 1, selectedForDirectory: true, hidden: false, directoryApproval: 'pending',
        resourceVersion: 5, placementVersion: 9, series: [],
      },
    ] : [],
    editableResources: hasProfile ? [
      { id: 'resource-own', title: 'Guía propia', url: 'https://owner.example.invalid/guia', description: 'Del propietario', version: 3 },
    ] : [],
    claims,
    series: hasProfile ? [{ id: 'series-1', name: 'Curso de ejemplo', slug: 'curso-de-ejemplo', version: 1 }] : [],
  };
}

async function resetRuntime(data = ownerData()) {
  runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  runtime.overrideServiceResponse(async (request) => {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.replace(/\/$/, '') === '/api/creador/perfil') {
      return Response.json(data);
    }
    return undefined;
  });
  return runtime;
}

async function render({ search = '' } = {}) {
  globalThis[runtimeStateKey] = { runtime };
  const response = await container.renderToResponse(ownerRoute, {
    request: runtime.request('/cuenta/', { session: 'creator-a', search }),
    partial: false,
  });
  return { response, html: await response.text() };
}

function visibleText(html) {
  const source = html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, ' ');
  const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const stack = [];
  const text = [];
  for (const token of source.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) ?? []) {
    if (/^<!--/.test(token)) continue;
    const closing = token.match(/^<\/([a-z][a-z0-9:-]*)\b/i);
    if (closing) {
      const tag = closing[1].toLowerCase();
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].tag === tag) {
          stack.splice(index);
          break;
        }
      }
      continue;
    }
    const opening = token.match(/^<([a-z][a-z0-9:-]*)\b([^>]*)>/i);
    if (opening) {
      const tag = opening[1].toLowerCase();
      if (!voidElements.has(tag) && !/\/\s*>$/.test(token)) {
        const inheritedHidden = stack.some(({ hidden }) => hidden);
        const hidden = inheritedHidden || /\bhidden(?:\s|=|\/?>|$)/i.test(opening[2]);
        stack.push({ tag, hidden });
      }
      continue;
    }
    if (!stack.some(({ hidden }) => hidden)) text.push(token);
  }
  return text.join(' ').replace(/&(?:amp|lt|gt|quot|#39);/g, ' ').replace(/\s+/g, ' ').trim();
}

function markedContainer(html, marker) {
  const openingPattern = new RegExp(`<([a-z][a-z0-9:-]*)\\b(?=[^>]*\\b${marker}\\b)[^>]*>`, 'i');
  const match = openingPattern.exec(html);
  if (!match) return undefined;
  const tag = match[1];
  const start = match.index;
  let depth = 1;
  const tokens = /<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi;
  tokens.lastIndex = start + match[0].length;
  let token;
  while ((token = tokens.exec(html))) {
    if (token[1].toLowerCase() !== tag.toLowerCase()) continue;
    if (/^<\//.test(token[0])) depth -= 1;
    else if (!/\/\s*>$/.test(token[0])) depth += 1;
    if (depth === 0) return html.slice(start, tokens.lastIndex);
  }
  return undefined;
}

function assertPrivate(response, html) {
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(html, /<meta[^>]+name="robots"[^>]+noindex/i);
  assert.match(html, /<meta[^>]+name="robots"[^>]+nofollow/i);
}

function visibleFormControls(html) {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)]
    .filter(([, attributes]) => !/\bhidden(?:\s|=|\/?>|$)/i.test(attributes))
    .flatMap(([, , contents]) => [...contents.matchAll(/<(?:input|textarea|select)\b[^>]*>/gi)].map(([tag]) => tag))
    .filter((tag) => !/\bhidden(?:\s|=|\/?>)/i.test(tag) && !/\btype="hidden"/i.test(tag))
    .join('\n');
}

test('SSR de Solicitudes conserva el espacio privado, etiqueta lo que conoce y no consulta el catálogo por recurso', async () => {
  const data = ownerData({ claims: [
    claim({
      id: 'claim-observed',
      resourceIds: ['resource-own', 'resource-public', 'resource-url'],
      resources: [
        { resourceId: 'resource-own', url: 'https://stale.example.invalid/old' },
        { resourceId: 'resource-public', url: 'https://catalog.example.invalid/public' },
        { resourceId: 'resource-url', url: 'https://supplied.example.invalid/known' },
      ],
      evidence: 'Evidencia privada del propietario',
    }),
    claim({ id: 'claim-legacy', resourceIds: ['legacy-private-id'], resources: undefined, evidence: 'Evidencia legacy privada' }),
    claim({
      id: 'claim-partial',
      resourceIds: ['resource-own', 'resource-private'],
      resources: [
        { resourceId: 'resource-own', url: 'https://owner.example.invalid/guia' },
        { resourceId: 'resource-private', url: 'https://submitted.example.invalid/partial' },
      ],
      status: 'partial',
    }),
  ] });
  await resetRuntime(data);
  runtime.serviceCalls.length = 0;

  const { response, html } = await render({ search: '?vista=solicitudes' });
  const text = visibleText(html);
  const claimsHtml = markedContainer(html, 'data-owner-claims');
  assert.ok(claimsHtml, 'the requests view is rendered inside the owner experience');
  const claimsText = visibleText(claimsHtml);
  const ownerDialog = html.match(/<dialog\b(?=[^>]*data-owner-dialog)[^>]*>[\s\S]*?<\/dialog>/i)?.[0];
  assert.equal(response.status, 200);
  assertPrivate(response, html);
  assert.match(text, /Tu página/);
  assert.match(text, /Ana de catálogo/);
  assert.match(claimsText, /Guía propia/);
  assert.match(claimsText, /Evidencia privada del propietario/);
  assert.match(claimsText, /Evidencia legacy privada/);
  assert.match(claimsText, /2026/);
  assert.match(claimsText, /pendiente/i);
  const partialRecord = claimsHtml.match(/<li\b(?=[^>]*data-claim-record="claim-partial")[\s\S]*?<\/li>/i)?.[0];
  assert.ok(partialRecord, 'the partial request remains visible in the SSR history');
  const partialStatus = partialRecord.match(/<strong\b[^>]*data-claim-status[^>]*>([^<]+)<\/strong>/i)?.[1];
  assert.equal(partialStatus, 'Parcialmente resuelta', 'SSR translates the internal partial status');
  assert.match(claimsText, /https:\/\/supplied\.example\.invalid\/known/);
  assert.doesNotMatch(claimsText, /resource-own|resource-public|resource-url|legacy-private-id/,
    'SSR never exposes claim IDs when it lacks an authorized title');
  assert.doesNotMatch(claimsText, /https:\/\/stale\.example\.invalid\/old/,
    'an owner link title and current URL take precedence over its older claim URL');
  assert.match(html, /href="\/cuenta\/\?vista=solicitudes"/,
    'requests stay linked from the owner navigation');
  assert.match(claimsHtml, /<button\b(?=[^>]*data-claim-open)[^>]*>Solicitar edición<\/button>/i,
    'the SSR request history exposes its real action control');
  assert.ok(ownerDialog, 'the owner keeps the shared contextual dialog in the server composition');
  assert.equal((html.match(/<dialog\b[^>]*data-owner-dialog/gi) ?? []).length, 1,
    'the page has one owner coordinator dialog');
  assert.doesNotMatch(ownerDialog, /data-owner-form="reclamacion"|data-catalog-search-form/,
    'catalog and claim controls are rendered when the owner opens their editor');
  assert.doesNotMatch(visibleFormControls(html), /name="(?:resourceIds|sourceId|resourceId)"/i,
    'no visible control asks the owner to enter internal IDs');
  assert.doesNotMatch(visibleFormControls(html), /32\s*KiB|payload|source ID|IDs exactos/i);
  assert.doesNotMatch(html, /googletagmanager|google-analytics|gtag\s*\(|dataLayer/i,
    'owner SSR has no audience analytics');
  assert.equal(runtime.serviceCalls.some(({ path }) => /\/api\/creador\/recursos\//.test(path)), false,
    'SSR does not read private resources by claim ID');
  assert.equal(runtime.serviceCalls.some(({ path }) => /catalog-selection\.json/.test(path)), false,
    'SSR does not scan/load the public index');
});

test('SSR desde Enlaces ofrece una acción de solicitud para una ficha compartida', async () => {
  await resetRuntime(ownerData());
  const { response, html } = await render({ search: '?vista=enlaces' });
  assert.equal(response.status, 200);
  assertPrivate(response, html);

  const sharedRow = html.match(/<tr\b(?=[^>]*data-link-row="placement-shared")[\s\S]*?<\/tr>/i)?.[0];
  const ownRow = html.match(/<tr\b(?=[^>]*data-link-row="placement-own")[\s\S]*?<\/tr>/i)?.[0];
  assert.ok(sharedRow, 'the shared link row remains visible in its owner context');
  assert.match(sharedRow, /Solicitar edición/i,
    'a shared resource has a direct request action from its link row');
  assert.ok(ownRow);
  assert.doesNotMatch(ownRow, /Solicitar edición/i,
    'a resource the owner can already edit does not offer a request that will be denied');
  assert.match(sharedRow, /Guía compartida/);
  assert.doesNotMatch(visibleText(sharedRow), /resource-shared|placement-shared/);
  assert.equal((html.match(/<dialog\b[^>]*data-owner-dialog/gi) ?? []).length, 1);
  assert.doesNotMatch(html, /data-owner-form="reclamacion"/i,
    'the request editor is created by the shared Preact dialog after the action is selected');
});

test('perfil borrador u oculto sigue gestionable desde Solicitudes y no ofrece una falsa página pública', async (t) => {
  await t.test('borrador', async () => {
    const data = ownerData({ profile: { published: false } });
    await resetRuntime(data);
    const { response, html } = await render({ search: '?vista=solicitudes' });
    assert.equal(response.status, 200);
    assertPrivate(response, html);
    assert.match(visibleText(html), /Ana de catálogo/);
    assert.match(visibleText(html), /Borrador|publicar/i);
    assert.match(html, /data-owner-claims|aria-label="Solicitudes"/i);
    assert.doesNotMatch(html, /data-owner-public-link|Ver página pública/i);
  });

  await t.test('oculto', async () => {
    const data = ownerData({ profile: { published: true, hidden: true } });
    await resetRuntime(data);
    const { response, html } = await render({ search: '?vista=solicitudes' });
    assert.equal(response.status, 200);
    assertPrivate(response, html);
    assert.match(visibleText(html), /Ana de catálogo/);
    assert.match(visibleText(html), /oculta/i);
    assert.match(html, /data-owner-claims|aria-label="Solicitudes"/i);
    assert.doesNotMatch(html, /data-owner-public-link|Ver página pública/i);
  });
});

test('sin perfil conserva la preparación y la navegación estadística no hereda parámetros de gestión', async () => {
  const data = ownerData({ profile: null, claims: [] });
  await resetRuntime(data);
  const { response, html } = await render({ search: '?vista=solicitudes' });
  assert.equal(response.status, 200);
  assertPrivate(response, html);
  assert.match(visibleText(html), /Prepara tu página|Completa tu borrador/i);
  assert.match(html, /data-owner-form="crear"/i);
  assert.match(html, /href="\/cuenta\/\?vista=estadisticas&amp;periodo=30&amp;pagina=1"/i,
    'statistics navigation keeps only its own query parameters');
  assert.doesNotMatch(html, /href="[^"]*vista=estadisticas[^"]*(?:buscar|paginaEnlaces|orden|serie|directorio)/i);
});

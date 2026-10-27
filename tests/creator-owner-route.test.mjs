import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';
import { createCreatorOwnerRuntime, SITE_ORIGIN } from './fixtures/creator-owner-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratch = path.join(root, '.work/creator-owner-experience/planning');
await mkdir(scratch, { recursive: true });
const tempDir = await mkdtemp(path.join(scratch, 'owner-route-'));
const routeEntry = path.join(root, 'src/pages/cuenta/index.astro');
const editorEntry = path.join(root, 'src/pages/cuenta/creador/index.astro');
const runtimeStateKey = `__creatorOwnerRoute_${path.basename(tempDir).replaceAll('-', '_')}`;

after(async () => {
  delete globalThis[runtimeStateKey];
  await rm(tempDir, { recursive: true, force: true });
});

await writeFile(path.join(tempDir, 'creator-runtime-stub.mjs'),
  `export function getCreatorRuntime() { return globalThis[${JSON.stringify(runtimeStateKey)}].runtime; }`);
await writeFile(path.join(tempDir, 'account-runtime-stub.mjs'),
  `export function getAccountAuth() { return globalThis[${JSON.stringify(runtimeStateKey)}].runtime.accountAuth; }`);

await build({
  entryPoints: { owner: routeEntry, editor: editorEntry },
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
    name: 'creator-owner-route-runtime',
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
const editorRoute = (await import(pathToFileURL(path.join(tempDir, 'editor.mjs')).href)).default;
const container = await experimental_AstroContainer.create({ astroConfig: { site: SITE_ORIGIN } });
let runtime;

async function resetRuntime() {
  runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  runtime.setSession('admin');
  return runtime;
}

async function renderPage(page, { session = 'creator-a', pathname = '/cuenta/', search = '' } = {}) {
  globalThis[runtimeStateKey] = { runtime };
  const response = await container.renderToResponse(page, {
    request: runtime.request(pathname, { session, search }),
    partial: false,
  });
  return { response, html: await response.text() };
}

async function render(options = {}) { return renderPage(route, options); }

async function api(pathname, body, { method = 'PUT', session = 'creator-a' } = {}) {
  const response = await runtime.fetchApi(pathname, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': session === 'creator-a' ? 'csrf-a' : `csrf-${session}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, { session });
  const payload = await response.json().catch(() => null);
  assert.ok(response.ok, `${method} ${pathname} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function visibleText(html) {
  return html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, ' ')
    .replace(/\s+/g, ' ');
}

async function createProfile({ published = false, hidden = false, slug = 'ana-contextual', overrides = {} } = {}) {
  const created = await api('/api/creador/perfil/', {
    displayName: 'Ana de Lambda',
    slug,
    city: 'Córdoba',
    country: 'Argentina',
    bio: 'Aprendo y comparto arquitectura de AWS.',
    programs: ['Community Builders'],
    socials: { linkedin: 'https://www.linkedin.com/in/ana-example' },
    ...overrides,
  });
  let profile = created.profile;
  if (published) profile = (await api('/api/creador/perfil/publicar/', {}, { method: 'POST' })).profile;
  if (hidden) {
    const key = `profile:${profile.id}`;
    const current = await runtime.pages.store.get(key);
    const changed = await runtime.pages.store.transact({
      checks: [{ key, version: current.version }],
      puts: [{ key, value: { ...current, hidden: true, version: current.version + 1 } }],
    });
    assert.equal(changed, true);
  }
  return profile;
}

test('la ruta Astro real abre la identidad propia, protege el HTML y sólo enlaza la URL pública guardada', async () => {
  await resetRuntime();
  const profile = await createProfile({ published: true, slug: 'ana-lambda-actual' });

  runtime.serviceCalls.length = 0;
  const { response, html } = await render();
  const text = visibleText(html);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer',
    'the owner route retains the existing creator-page privacy headers');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(html, /<meta[^>]+name="robots"[^>]+noindex/i);
  assert.match(text, /Ana de Lambda/);
  assert.match(text, /Córdoba/);
  assert.match(text, /Argentina/);
  assert.match(text, /Aprendo y comparto arquitectura de AWS\./);
  assert.match(text, /Community Builders/);
  assert.match(html, /href="https:\/\/www\.linkedin\.com\/in\/ana-example"/i);
  assert.match(text, /Editar datos/);
  assert.match(text, /Editar redes/);
  assert.match(text, /Editar foto/);
  assert.match(html, /<dialog\b/i, 'contextual forms use the approved dialog surface');
  assert.doesNotMatch(html, /<dialog\b[^>]*\bopen(?:\s|>|=)/i,
    'the ordinary profile view starts with contextual forms closed');
  const publicAnchor = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .find(([, , contents]) => /Ver página pública/i.test(visibleText(contents)));
  assert.ok(publicAnchor, 'a published visible profile offers its public page');
  const publicHref = publicAnchor[1].match(/\bhref="([^"]+)"/i)?.[1];
  const publicTarget = publicAnchor[1].match(/\btarget="([^"]+)"/i)?.[1];
  assert.equal(new URL(publicHref, SITE_ORIGIN).href, `${SITE_ORIGIN}/c/ana-lambda-actual/`);
  assert.equal(publicTarget, '_blank', 'the public page opens in another tab');
  assert.match(text, /Copiar enlace/);
  assert.doesNotMatch(text, /Tu información|Estado de la cuenta|Accede o crea una cuenta/,
    'the signed-in route is not an email/status landing card');
  assert.doesNotMatch(html, /href="\/cuenta\/creador\/"[^>]*>\s*(?:Crear o editar|Editar mi página)/i,
    'ordinary profile work no longer requires opening the old editor route');
  assert.doesNotMatch(text, /Vista previa|Previsualizar/i);
  assert.doesNotMatch(html, /analytics\.js|gtag\(|google-analytics/i,
    'the private owner route does not load audience measurement');
  assert.ok(!runtime.serviceCalls.some(({ path }) => /\/estadisticas\/?$/.test(path)),
    'the ordinary owner SSR never waits for statistics; the phase 2 summary loads separately');
  assert.match(html, /\/cuenta\/salir\//, 'logout remains reachable from the owner shell');
  assert.match(html, /csrfToken/i, 'logout remains a protected POST form');
  assert.ok(runtime.serviceCalls.some(({ path }) => path.replace(/\/$/, '') === '/api/creador/perfil'));
  assert.equal(profile.slug, 'ana-lambda-actual');
});

test('la ruta residual deja mover enlaces a Tu página y conserva series, capítulos y reclamaciones', async () => {
  await resetRuntime();
  await createProfile({ slug: 'ana-contenido' });
  const addedLink = await api('/api/creador/enlaces/', {
    title: 'Guía que se conserva',
    url: 'https://example.invalid/guia-que-se-conserva',
  }, { method: 'POST' });
  assert.ok(addedLink.link);
  const secondLink = await api('/api/creador/enlaces/', {
    title: 'Otro capítulo que se conserva',
    url: 'https://example.invalid/otro-capitulo-que-se-conserva',
  }, { method: 'POST' });
  assert.ok(secondLink.link);
  const current = await api('/api/creador/perfil/', undefined, { method: 'GET' });
  const createdSeries = await api('/api/creador/series/', {
    name: 'Ruta que se conserva',
    slug: 'ruta-que-se-conserva',
    profileVersion: current.profile.version,
  }, { method: 'POST' });
  assert.ok(createdSeries.series);
  let seriesProfileVersion = (await api('/api/creador/perfil/', undefined, { method: 'GET' })).profile.version;
  await api(`/api/creador/series/${createdSeries.series.id}/capitulos/${addedLink.link.placementId}`, {
    profileVersion: seriesProfileVersion,
  }, { method: 'PUT' });
  seriesProfileVersion = (await api('/api/creador/perfil/', undefined, { method: 'GET' })).profile.version;
  await api(`/api/creador/series/${createdSeries.series.id}/capitulos/${secondLink.link.placementId}`, {
    profileVersion: seriesProfileVersion,
  }, { method: 'PUT' });

  const { response, html } = await renderPage(editorRoute, { pathname: '/cuenta/creador/' });
  const text = visibleText(html);
  assert.equal(response.status, 200);
  assert.match(text, /Guía que se conserva/);
  assert.match(text, /Otro capítulo que se conserva/);
  assert.match(text, /Ruta que se conserva/);
  assert.match(text, /Crear serie/);
  assert.doesNotMatch(html, /\bdata-move=/, 'link position actions now live in the owner table');
  assert.doesNotMatch(html, /\bdata-link-order-form/i);
  assert.match(html, /\bdata-series-move=/, 'chapter ordering remains available in the residual route');
  assert.match(html, /data-claim-form/, 'the existing claim flow remains until phase 6');
  assert.doesNotMatch(html, /data-add-link-form|data-resource-form/,
    'link creation and resource editing now belong to the owner table');
  assert.doesNotMatch(html, /data-profile-form|data-photo-form/,
    'the residual content editor no longer duplicates profile and photo management');
  assert.doesNotMatch(text, /Publicar página/);
});

test('sin perfil, la entrada directa ofrece la preparación mínima y no una cuenta vacía ni acciones públicas', async () => {
  await resetRuntime();
  const { response, html } = await render();
  const text = visibleText(html);
  assert.equal(response.status, 200);
  assert.match(text, /Tu página/);
  assert.match(text, /nombre/i);
  assert.match(text, /dirección|URL/i);
  assert.match(html, /name="displayName"/);
  assert.match(html, /name="slug"/);
  assert.match(text, /Crear borrador|Crear mi página|Guardar borrador/i);
  assert.doesNotMatch(text, /Publicar página/,
    'creating the profile does not make publication implicit');
  assert.doesNotMatch(text, /Copiar enlace|Ver página pública|Vista previa|Previsualizar/i);
  assert.doesNotMatch(text, /Tu información|Estado de la cuenta|Accede o crea una cuenta/);
});

test('texto válido del perfil se mantiene como texto y no puede cerrar el JSON embebido ni crear markup', async () => {
  await resetRuntime();
  const suppliedBio = 'Texto </script><img src=x onerror=alert(1)>';
  const suppliedName = 'Ana </script><svg onload=alert(2)>';
  await createProfile({ overrides: { displayName: suppliedName, bio: suppliedBio } });
  const { response, html } = await render();
  assert.equal(response.status, 200);
  assert.match(html, /Ana &lt;\/script&gt;&lt;svg onload=alert\(2\)&gt;/i,
    'the creator-supplied name remains readable as escaped text');
  assert.match(html, /Texto &lt;\/script&gt;&lt;img src=x onerror=alert\(1\)&gt;/i,
    'the creator-supplied content is still readable as escaped text');
  assert.doesNotMatch(html, /<\/script>\s*<(?:img|svg)\b|<img src=x onerror=alert\(1\)>|<svg onload=alert\(2\)>/i,
    'creator text cannot become a real element or terminate the initial-data script');
  const jsonScripts = [...html.matchAll(/<script\b(?=[^>]*\btype="application\/json")[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, source] of jsonScripts) {
    if (!/"(?:profile|displayName)"\s*:/i.test(source)) continue;
    const payload = JSON.parse(source);
    const serialized = JSON.stringify(payload);
    assert.ok(serialized.includes(suppliedName));
    assert.ok(serialized.includes(suppliedBio));
  }
});

test('un borrador ofrece publicar de forma explícita y no ofrece vista pública ni copia', async () => {
  await resetRuntime();
  await createProfile({ slug: 'ana-borrador' });
  const draft = await render();
  assert.match(visibleText(draft.html), /Publicar página/);
  assert.doesNotMatch(visibleText(draft.html), /Ver página pública|Copiar enlace|Vista previa|Previsualizar/i);
});

test('un perfil oculto se mantiene editable y no ofrece vista, copia ni desocultar', async () => {
  await resetRuntime();
  const hiddenRuntime = await createCreatorOwnerRuntime();
  hiddenRuntime.setSession('creator-a');
  globalThis[runtimeStateKey] = { runtime: hiddenRuntime };
  await (async () => {
    const created = await hiddenRuntime.fetchApi('/api/creador/perfil/', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'origin': SITE_ORIGIN, 'x-csrf-token': 'csrf-a' },
      body: JSON.stringify({ displayName: 'Ana Oculta', slug: 'ana-oculta', programs: [], socials: {} }),
    });
    assert.equal(created.status, 200);
    const payload = await created.json();
    const current = await hiddenRuntime.pages.store.get(`profile:${payload.profile.id}`);
    const changed = await hiddenRuntime.pages.store.transact({
      checks: [{ key: `profile:${payload.profile.id}`, version: current.version }],
      puts: [{ key: `profile:${payload.profile.id}`, value: { ...current, published: true, hidden: true, version: current.version + 1 } }],
    });
    assert.equal(changed, true);
  })();
  const response = await container.renderToResponse(route, {
    request: hiddenRuntime.request('/cuenta/', { session: 'creator-a' }), partial: false,
  });
  const hiddenHtml = await response.text();
  const hiddenText = visibleText(hiddenHtml);
  assert.equal(response.status, 200);
  assert.match(hiddenText, /Ana Oculta/);
  assert.match(hiddenText, /Oculta/i);
  assert.match(hiddenText, /Editar datos|Editar perfil/i);
  assert.doesNotMatch(hiddenText, /Ver página pública|Copiar enlace|Vista previa|Previsualizar/i);
  assert.doesNotMatch(hiddenText, /Mostrar mi página|Desocultar/i);
});

test('la entrada anónima conserva acceso y registro y no lee el perfil owner', async () => {
  await resetRuntime();
  const anonymous = await render({ session: null });
  assert.equal(anonymous.response.status, 200,
    'the account entry preserves its existing anonymous login/registration page status');
  assert.match(visibleText(anonymous.html), /Ingresar|Accede o crea una cuenta/);
  assert.doesNotMatch(visibleText(anonymous.html), /Crear borrador|Crear mi página/);
  assert.equal(runtime.serviceCalls.some(({ path }) => path.replace(/\/$/, '') === '/api/creador/perfil'), false,
    'anonymous requests do not read owner data');
});

test('una cuenta deshabilitada conserva el estado de acceso y no ofrece crear un perfil', async () => {
  await resetRuntime();
  runtime.setSession('disabled', { principal: { state: 'disabled' } });
  const disabled = await render({ session: 'disabled' });
  assert.equal(disabled.response.status, 403);
  assert.doesNotMatch(visibleText(disabled.html), /Crear borrador|Crear mi página/);
  assert.equal(runtime.serviceCalls.some(({ path }) => path.replace(/\/$/, '') === '/api/creador/perfil'), false,
    'disabled accounts do not read owner data');
});

test('los resultados del callback de acceso conservan sus ramas y no leen datos owner', async () => {
  await resetRuntime();
  for (const [state, expectedStatus, title] of [
    ['acceso-invalido', 400, /No pudimos confirmar el acceso/],
    ['cancelado', 400, /Cancelaste el acceso/],
    ['no-disponible', 503, /No pudimos cargar tu cuenta/],
  ]) {
    runtime.serviceCalls.length = 0;
    const callback = await render({ search: `?estado=${state}` });
    assert.equal(callback.response.status, expectedStatus, state);
    assert.match(visibleText(callback.html), title, state);
    assert.equal(runtime.serviceCalls.some(({ path }) => path.replace(/\/$/, '') === '/api/creador/perfil'), false,
      `${state} does not query owner data`);
  }
});

test('un principal autenticado incompleto falla cerrado y no se interpreta como perfil inexistente', async () => {
  await resetRuntime();
  runtime.setSession('invalid-principal', {
    principal: { state: 'authenticated', csrfToken: 'csrf-invalid', isAdmin: false },
  });
  const invalidPrincipal = await render({ session: 'invalid-principal' });
  assert.equal(invalidPrincipal.response.status, 503);
  assert.doesNotMatch(visibleText(invalidPrincipal.html), /Crear borrador|Crear mi página/);
  assert.equal(runtime.serviceCalls.some(({ path }) => path.replace(/\/$/, '') === '/api/creador/perfil'), false,
    'an invalid principal cannot trigger an owner profile read');
});

test('un DTO de perfil malformado produce error recuperable y no alta de perfil', async () => {
  await resetRuntime();
  runtime.overrideServiceResponse((request) => new URL(request.url).pathname.replace(/\/$/, '') === '/api/creador/perfil'
    ? Response.json({ profile: false, links: [], editableResources: [], claims: [], series: [] })
    : undefined);
  const invalidDto = await render();
  assert.equal(invalidDto.response.status, 503);
  assert.doesNotMatch(visibleText(invalidDto.html), /Crear borrador|Crear mi página/);
  assert.match(visibleText(invalidDto.html), /Reintentar|Inténtalo/i);
});

test('una falla HTTP de lectura del perfil produce error recuperable y no alta de perfil', async () => {
  await resetRuntime();
  runtime.setSession('creator-a');
  runtime.overrideServiceResponse((request) => new URL(request.url).pathname.replace(/\/$/, '') === '/api/creador/perfil'
    ? Response.json({ error: 'temporarily unavailable' }, { status: 503 })
    : undefined);
  const unavailable = await render();
  assert.equal(unavailable.response.status, 503);
  assert.doesNotMatch(visibleText(unavailable.html), /Crear borrador|Crear mi página/);
  assert.match(visibleText(unavailable.html), /Reintentar|Inténtalo/i);
});

test('la salida conserva POST y CSRF en la zona secundaria, fuera del contenido principal', async () => {
  await resetRuntime();
  const member = await render();
  const logoutForm = member.html.match(/<form\b(?=[^>]*method="post")(?=[^>]*action="\/cuenta\/salir\/")[^>]*>[\s\S]*?<input\b(?=[^>]*name="csrfToken")(?=[^>]*value="csrf-a")[^>]*>/i);
  assert.ok(logoutForm, 'logout remains a POST protected by the rendered CSRF token');
  const mainStart = member.html.indexOf('<main');
  assert.ok(mainStart >= 0 && logoutForm.index < mainStart,
    'logout stays outside the primary owner work area');
});

test('la administración sólo aparece con el rol correspondiente y en la zona secundaria', async () => {
  await resetRuntime();
  const member = await render();
  assert.doesNotMatch(member.html, /href="\/cuenta\/administracion\//,
    'a creator account does not receive the administrative entry');

  const administrator = await render({ session: 'admin' });
  assert.match(administrator.html, /href="\/cuenta\/administracion\//);
  const mainStart = administrator.html.indexOf('<main');
  const adminAction = administrator.html.indexOf('/cuenta/administracion/');
  assert.ok(mainStart >= 0 && adminAction >= 0 && adminAction < mainStart,
    'the administrative entry is secondary to the owner work area');
  assert.doesNotMatch(visibleText(administrator.html), /Accede o crea una cuenta/);
});

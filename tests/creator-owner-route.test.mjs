import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileCreatorAstroRoutes } from './fixtures/creator-astro-route.mjs';
import { createCreatorOwnerAstroContainer } from './fixtures/creator-owner-astro-container.mjs';
import { createCreatorOwnerRuntime, SITE_ORIGIN } from './fixtures/creator-owner-runtime.mjs';
import { bindCreatorBrowserRuntime, clearCreatorBrowserRuntime } from './fixtures/creator-browser-runtime.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiled = await compileCreatorAstroRoutes({
  owner: 'src/pages/cuenta/index.astro',
  editor: 'src/pages/cuenta/creador/index.astro',
}, {
  siteOrigin: SITE_ORIGIN,
  scratchDirectory: path.join(root, '.work/creator-owner-experience/planning'),
  runtimeModule: 'fixture',
  rawModules: 'empty',
});

after(async () => compiled.cleanup());

const route = compiled.routes.owner.default;
const editorRoute = compiled.routes.editor.default;
const container = await createCreatorOwnerAstroContainer({ astroConfig: { site: SITE_ORIGIN } });
let runtime;

function assertPrivate(response, html) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(html, /<meta[^>]+name="robots"[^>]+noindex/i);
  assert.doesNotMatch(html, /analytics\.js|gtag\(|google-analytics/i);
}

async function resetRuntime() {
  runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  runtime.setSession('creator-b');
  runtime.setSession('admin');
  return runtime;
}

async function renderPage(page, { session = 'creator-a', pathname = '/cuenta/', search = '', method = 'GET' } = {}) {
  const browserRuntime = { creatorRuntime: runtime, accountAuth: runtime.accountAuth };
  bindCreatorBrowserRuntime(browserRuntime);
  const baseRequest = runtime.request(pathname, { session, search });
  try {
    const response = await container.renderToResponse(page, {
      request: method === 'GET' ? baseRequest : new Request(baseRequest, { method }),
      partial: false,
    });
    return { response, html: await response.text() };
  } finally {
    clearCreatorBrowserRuntime(browserRuntime);
  }
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
  const backToSite = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .find(([, , contents]) => /Volver al sitio/i.test(visibleText(contents)));
  assert.ok(backToSite, 'the owner shell keeps its public-site exit link');
  assert.match(backToSite[1], /\bdata-owner-navigation(?:\s|=|$)/,
    'the initial profile form routes the exit link through the owner dirty-form guard');
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
  assert.equal(runtime.serviceCalls.length, 0, 'SSR no longer dispatches synthetic internal HTTP requests');
  assert.ok(!runtime.queryCalls.some(({ method }) => method === 'readCreatorStatistics'),
    'the ordinary owner SSR never waits for statistics; the phase 2 summary loads separately');
  assert.match(html, /\/cuenta\/salir\//, 'logout remains reachable from the owner shell');
  assert.match(html, /csrfToken/i, 'logout remains a protected POST form');
  assert.ok(runtime.queryCalls.some(({ method }) => method === 'readCreatorEditor'),
    'SSR uses the actual request-scoped owner query');
  assert.equal(profile.slug, 'ana-lambda-actual');
});

test('el acceso antiguo lleva a Solicitudes sin duplicar gestión ni alterar enlaces o series', async () => {
  await resetRuntime();
  await api('/api/creador/perfil/', {
    displayName: 'Bea de Lambda', slug: 'bea-contenido', city: '', country: '', bio: '', programs: [], socials: {},
  }, { method: 'PUT', session: 'creator-b' });
  const shared = await api('/api/creador/enlaces/', {
    title: 'Guía compartida que se conserva', url: 'https://example.invalid/guia-compartida',
  }, { method: 'POST', session: 'creator-b' });
  await createProfile({ slug: 'ana-contenido' });
  const addedLink = await api('/api/creador/enlaces/', {
    title: 'Guía compartida que se conserva', url: 'https://example.invalid/guia-compartida',
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

  const before = await api('/api/creador/perfil/', undefined, { method: 'GET' });
  assert.equal(before.links.some(({ resourceId }) => resourceId === shared.link.resourceId), true);
  assert.equal(before.series.length, 1);
  const { response, html } = await renderPage(editorRoute, { pathname: '/cuenta/creador/' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/cuenta/?vista=solicitudes');
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/);
  assert.doesNotMatch(html, /data-creator-editor|data-claim-form|data-resource-id-value/,
    'the old URL no longer renders a second management surface or internal-ID instructions');
  assert.deepEqual(await api('/api/creador/perfil/', undefined, { method: 'GET' }), before,
    'redirecting preserves the existing references, options and series');
  const owner = await render();
  assert.match(visibleText(owner.html), /Guía compartida que se conserva/);
  assert.match(visibleText(owner.html), /Otro capítulo que se conserva/);
  assert.doesNotMatch(owner.html, /data-add-link-form|data-resource-form|data-profile-form|data-photo-form/,
    'the owner surface retains contextual management rather than the old wall of forms');
});

test('GET del acceso antiguo redirige sin leer identidad ni contenido y descarta parámetros viejos', async () => {
  await resetRuntime();
  let privateReads = 0;
  runtime.auth.getRequestContext = async () => { privateReads += 1; throw new Error('The compatibility GET must not read private identity.'); };
  runtime.accountAuth.getSession = async () => { privateReads += 1; throw new Error('The target route owns authentication.'); };
  for (const session of [null, 'creator-a', 'admin', 'expired-session']) {
    const result = await renderPage(editorRoute, {
      pathname: '/cuenta/creador/', session,
      search: '?next=https%3A%2F%2Foutside.example.invalid%2F&sourceId=private-source&resourceIds=private-id&vista=series',
    });
    assert.equal(result.response.status, 302);
    assert.equal(result.response.headers.get('location'), '/cuenta/?vista=solicitudes');
    assert.match(result.response.headers.get('cache-control') ?? '', /private.*no-store/);
    assert.equal(result.response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(result.response.headers.get('x-content-type-options'), 'nosniff');
    assert.doesNotMatch(result.html, /private-source|private-id|outside\.example\.invalid|data-creator-editor|data-claim-form/);
  }
  assert.equal(privateReads, 0);
  assert.deepEqual(runtime.serviceCalls, []);
});

test('POST y otros métodos del acceso antiguo no redirigen ni ejecutan escrituras', async () => {
  await resetRuntime();
  await createProfile();
  const before = await api('/api/creador/perfil/', undefined, { method: 'GET' });
  runtime.serviceCalls.length = 0;
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const result = await renderPage(editorRoute, { pathname: '/cuenta/creador/', method });
    assert.equal(result.response.status, 405, method);
    assert.equal(result.response.headers.get('allow'), 'GET');
    assert.equal(result.response.headers.has('location'), false);
    assert.match(result.response.headers.get('cache-control') ?? '', /private.*no-store/);
    assert.equal(result.response.headers.get('referrer-policy'), 'no-referrer');
    assert.doesNotMatch(result.html, /data-creator-editor|data-claim-form|src="\/assets\/analytics\.js"/);
  }
  assert.deepEqual(runtime.serviceCalls, [], 'the compatibility route never proxies a page POST to a private API');
  assert.deepEqual(await api('/api/creador/perfil/', undefined, { method: 'GET' }), before);
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
  const browserRuntime = { creatorRuntime: hiddenRuntime, accountAuth: hiddenRuntime.accountAuth };
  bindCreatorBrowserRuntime(browserRuntime);
  let response;
  let hiddenHtml;
  try {
    response = await container.renderToResponse(route, {
      request: hiddenRuntime.request('/cuenta/', { session: 'creator-a' }), partial: false,
    });
    hiddenHtml = await response.text();
  } finally {
    clearCreatorBrowserRuntime(browserRuntime);
  }
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
  assert.equal(runtime.queryCalls.some(({ method }) => method === 'readCreatorEditor'), false,
    'anonymous requests do not read owner data');
});

test('una cuenta deshabilitada conserva el estado de acceso y no ofrece crear un perfil', async () => {
  await resetRuntime();
  runtime.setSession('disabled', { principal: { state: 'disabled' } });
  const disabled = await render({ session: 'disabled' });
  assert.equal(disabled.response.status, 403);
  assert.doesNotMatch(visibleText(disabled.html), /Crear borrador|Crear mi página/);
  assert.equal(runtime.queryCalls.some(({ method }) => method === 'readCreatorEditor'), false,
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
    assert.equal(runtime.queryCalls.some(({ method }) => method === 'readCreatorEditor'), false,
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
  assert.equal(runtime.queryCalls.some(({ method }) => method === 'readCreatorEditor'), false,
    'an invalid principal cannot trigger an owner profile read');
});

test('el consumidor SSR rechaza una proyección contradictoria devuelta por la consulta real', async () => {
  await resetRuntime();
  await createProfile();
  const created = await api('/api/creador/enlaces/', {
    title: 'Título guardado coherente',
    url: 'https://example.com/owner-ssr-observation',
    description: 'Descripción guardada',
  }, { method: 'POST' });
  const saved = await api('/api/creador/perfil/', undefined, { method: 'GET' });
  const readCreatorEditor = runtime.pages.service.readCreatorEditor.bind(runtime.pages.service);
  let corrupted = false;
  runtime.pages.service.readCreatorEditor = async (context) => {
    const actual = await readCreatorEditor(context);
    if (corrupted) return actual;
    corrupted = true;
    const result = structuredClone(actual);
    const editable = result.editableResources.find(({ id }) => id === created.link.resourceId);
    assert.ok(editable, 'the real query includes this owner resource');
    editable.version += 1;
    return result;
  };

  const rejected = await render({ search: '?vista=enlaces' });
  assert.equal(corrupted, true, 'the test called the real query before corrupting its consumer result');
  assert.equal(rejected.response.status, 503);
  assert.match(visibleText(rejected.html), /Reintentar|Inténtalo/i);
  assert.doesNotMatch(visibleText(rejected.html), /Crear borrador|Crear mi página/);

  const retry = await render({ search: '?vista=enlaces' });
  assert.equal(retry.response.status, 200, 'a subsequent coherent read can render the owner page');
  assert.match(visibleText(retry.html), /Título guardado coherente/);
  assert.deepEqual(await api('/api/creador/perfil/', undefined, { method: 'GET' }), saved,
    'the rejected and retried consumer read does not change the complete saved DTO');
});

test('un fallo del proveedor durante la consulta owner produce 503 privado y permite reintentar', async () => {
  await resetRuntime();
  await createProfile();
  await api('/api/creador/enlaces/', {
    title: 'Lectura recuperable', url: 'https://example.com/owner-provider-failure',
  }, { method: 'POST' });
  runtime.pages.store.failNext('getResources', new Error('injected resource batch provider failure'));
  const transactionsBefore = runtime.pages.store.calls.filter(({ operation }) => operation === 'transact').length;

  const unavailable = await render();
  assert.equal(unavailable.response.status, 503);
  assert.match(unavailable.response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(unavailable.response.headers.get('referrer-policy'), 'no-referrer');
  assert.doesNotMatch(visibleText(unavailable.html), /Crear borrador|Crear mi página/);
  assert.match(visibleText(unavailable.html), /Reintentar|Inténtalo/i);
  assert.equal(runtime.pages.store.calls.filter(({ operation }) => operation === 'transact').length, transactionsBefore,
    'a failed private read performs no mutation');

  const retry = await render();
  assert.equal(retry.response.status, 200);
  assert.match(visibleText(retry.html), /Lectura recuperable/);
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
  assert.match(administrator.html, /<a\b[^>]*data-owner-navigation[^>]*href="\/cuenta\/administracion\//,
    'the owner exit guard includes the authorized administration destination');
  const mainStart = administrator.html.indexOf('<main');
  const adminAction = administrator.html.indexOf('/cuenta/administracion/');
  assert.ok(mainStart >= 0 && adminAction >= 0 && adminAction < mainStart,
    'the administrative entry is secondary to the owner work area');
  assert.doesNotMatch(visibleText(administrator.html), /Accede o crea una cuenta/);
});

test('el SSR de borrador ofrece publicación y no presenta una comprobación pendiente', async () => {
  await resetRuntime();
  await createProfile();
  const { response, html } = await render();
  assert.equal(response.status, 200);
  assertPrivate(response, html);
  const publishButton = html.match(/<button\b(?=[^>]*type="button")(?=[^>]*data-owner-publish)[^>]*>[\s\S]*?<\/button>/i)?.[0];
  assert.ok(publishButton, 'the owner can choose to publish this draft from the actual SSR composition');
  assert.match(visibleText(publishButton), /Publicar página/i);
  assert.doesNotMatch(html, /data-owner-publish-check/,
    'a saved-state check is shown only after a real publication attempt becomes uncertain');
  assert.doesNotMatch(html, /data-owner-status/,
    'SSR does not fabricate status feedback before an action has run');
});

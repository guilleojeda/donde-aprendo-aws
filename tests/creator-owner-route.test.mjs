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

async function ownerSnapshot(session = 'creator-a') {
  return api('/api/creador/perfil/', undefined, { method: 'GET', session });
}

async function createProfile({ published = false, slug = 'ana-contextual', overrides = {} } = {}) {
  const created = await api('/api/creador/perfil/', {
    creatorVersion: null,
    displayName: 'Ana de Lambda',
    slug,
    city: 'Córdoba',
    country: 'Argentina',
    bio: 'Aprendo y comparto arquitectura de AWS.',
    programs: ['Community Builders'],
    socials: { linkedin: 'https://www.linkedin.com/in/ana-example' },
    ...overrides,
  });
  assert.equal(created.operation, 'save-profile');
  let snapshot = await ownerSnapshot();
  let profile = snapshot.profile;
  if (published) {
    await api('/api/creador/perfil/publicar/', { creatorVersion: snapshot.creatorVersion }, { method: 'POST' });
    snapshot = await ownerSnapshot();
    profile = snapshot.profile;
  }
  return profile;
}

test('la ruta SSR conserva privacidad, usa la consulta owner y no carga analíticas', async () => {
  await resetRuntime();
  const profile = await createProfile({ published: true, slug: 'ana-lambda-actual' });

  runtime.serviceCalls.length = 0;
  const { response, html } = await render();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer',
    'the owner route retains the existing creator-page privacy headers');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.match(html, /<meta[^>]+name="robots"[^>]+noindex/i);
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
    creatorVersion: null,
    displayName: 'Bea de Lambda', slug: 'bea-contenido', city: '', country: '', bio: '', programs: [], socials: {},
  }, { method: 'PUT', session: 'creator-b' });
  let otherSnapshot = await ownerSnapshot('creator-b');
  const shared = await api('/api/creador/enlaces/', {
    creatorVersion: otherSnapshot.creatorVersion,
    title: 'Guía compartida que se conserva', url: 'https://example.invalid/guia-compartida',
  }, { method: 'POST', session: 'creator-b' });
  await createProfile({ slug: 'ana-contenido' });
  let current = await ownerSnapshot();
  const addedLink = await api('/api/creador/enlaces/', {
    creatorVersion: current.creatorVersion,
    title: 'Guía compartida que se conserva', url: 'https://example.invalid/guia-compartida',
  }, { method: 'POST' });
  assert.equal(addedLink.operation, 'add-link');
  current = await ownerSnapshot();
  const secondLink = await api('/api/creador/enlaces/', {
    creatorVersion: current.creatorVersion,
    title: 'Otro capítulo que se conserva',
    url: 'https://example.invalid/otro-capitulo-que-se-conserva',
  }, { method: 'POST' });
  current = await ownerSnapshot();
  const createdSeries = await api('/api/creador/series/', {
    name: 'Ruta que se conserva',
    slug: 'ruta-que-se-conserva',
    creatorVersion: current.creatorVersion,
  }, { method: 'POST' });
  assert.equal(createdSeries.operation, 'create-series');
  let currentAfterSeries = await ownerSnapshot();
  await api(`/api/creador/series/${createdSeries.seriesId}/capitulos/${addedLink.placementId}`, {
    creatorVersion: currentAfterSeries.creatorVersion,
  }, { method: 'PUT' });
  currentAfterSeries = await ownerSnapshot();
  await api(`/api/creador/series/${createdSeries.seriesId}/capitulos/${secondLink.placementId}`, {
    creatorVersion: currentAfterSeries.creatorVersion,
  }, { method: 'PUT' });

  const before = await ownerSnapshot();
  assert.equal(Object.values(before.placements).some(({ resourceId }) => resourceId === shared.resourceId), true);
  assert.equal(Object.keys(before.series).length, 1);
  const { response, html } = await renderPage(editorRoute, { pathname: '/cuenta/creador/' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/cuenta/?vista=solicitudes');
  assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/);
  assert.deepEqual(await ownerSnapshot(), before,
    'redirecting preserves the existing references, options and series');
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

test('la entrada anónima conserva acceso y registro y no lee el perfil owner', async () => {
  await resetRuntime();
  const anonymous = await render({ session: null });
  assert.equal(anonymous.response.status, 200,
    'the account entry preserves its existing anonymous login/registration page status');
  assert.equal(runtime.queryCalls.some(({ method }) => method === 'readCreatorEditor'), false,
    'anonymous requests do not read owner data');
});

test('una cuenta deshabilitada conserva el estado de acceso y no ofrece crear un perfil', async () => {
  await resetRuntime();
  runtime.setSession('disabled', { principal: { state: 'disabled' } });
  const disabled = await render({ session: 'disabled' });
  assert.equal(disabled.response.status, 403);
  assert.equal(runtime.queryCalls.some(({ method }) => method === 'readCreatorEditor'), false,
    'disabled accounts do not read owner data');
});

test('los resultados del callback de acceso conservan sus ramas y no leen datos owner', async () => {
  await resetRuntime();
  for (const [state, expectedStatus] of [
    ['acceso-invalido', 400],
    ['cancelado', 400],
    ['no-disponible', 503],
  ]) {
    runtime.serviceCalls.length = 0;
    const callback = await render({ search: `?estado=${state}` });
    assert.equal(callback.response.status, expectedStatus, state);
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
  assert.equal(runtime.queryCalls.some(({ method }) => method === 'readCreatorEditor'), false,
    'an invalid principal cannot trigger an owner profile read');
});

test('el consumidor SSR rechaza una proyección contradictoria devuelta por la consulta real', async () => {
  await resetRuntime();
  await createProfile();
  const before = await ownerSnapshot();
  const created = await api('/api/creador/enlaces/', {
    creatorVersion: before.creatorVersion,
    title: 'Título guardado coherente',
    url: 'https://example.com/owner-ssr-observation',
    description: 'Descripción guardada',
  }, { method: 'POST' });
  const saved = await ownerSnapshot();
  const readCreatorEditor = runtime.pages.service.readCreatorEditor.bind(runtime.pages.service);
  let corrupted = false;
  runtime.pages.service.readCreatorEditor = async (context) => {
    const actual = await readCreatorEditor(context);
    if (corrupted) return actual;
    corrupted = true;
    const result = structuredClone(actual);
    assert.ok(result.placements[created.placementId], 'the real query includes this owner placement');
    result.order.ordinary = result.order.ordinary.filter((id) => id !== created.placementId);
    return result;
  };

  const rejected = await render({ search: '?vista=enlaces' });
  assert.equal(corrupted, true, 'the test called the real query before corrupting its consumer result');
  assert.equal(rejected.response.status, 503);

  const retry = await render({ search: '?vista=enlaces' });
  assert.equal(retry.response.status, 200, 'a subsequent coherent read can render the owner page');
  assert.deepEqual(await ownerSnapshot(), saved,
    'the rejected and retried consumer read does not change the complete saved DTO');
});

test('un fallo del proveedor durante la consulta owner produce 503 privado y permite reintentar', async () => {
  await resetRuntime();
  await createProfile();
  const before = await ownerSnapshot();
  await api('/api/creador/enlaces/', {
    creatorVersion: before.creatorVersion,
    title: 'Lectura recuperable', url: 'https://example.com/owner-provider-failure',
  }, { method: 'POST' });
  runtime.pages.store.failNext('getResources', new Error('injected resource batch provider failure'));
  const transactionsBefore = runtime.pages.store.calls.filter(({ operation }) => operation === 'transact').length;

  const unavailable = await render();
  assert.equal(unavailable.response.status, 503);
  assert.match(unavailable.response.headers.get('cache-control') ?? '', /private.*no-store/i);
  assert.equal(unavailable.response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(runtime.pages.store.calls.filter(({ operation }) => operation === 'transact').length, transactionsBefore,
    'a failed private read performs no mutation');

  const retry = await render();
  assert.equal(retry.response.status, 200);
});

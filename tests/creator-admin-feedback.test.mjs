import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';
import { createCreatorHttpHandler } from '../src/lib/creator-http.mjs';
import { creatorPageSessionBinding } from '../src/lib/creator-session-context.mjs';
import { createCreatorPagesHarness, SITE_ORIGIN } from './fixtures/creator-pages.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scratchParent = path.join(root, '.work/creator-pages');
await mkdir(scratchParent, { recursive: true });
const tempDir = await mkdtemp(path.join(scratchParent, 'repair-review-admin-test-'));
const container = await experimental_AstroContainer.create();
let adminPagePromise;
let adminScriptPromise;

after(async () => {
  delete globalThis.__adminFeedbackTestRuntime;
  await rm(tempDir, { recursive: true, force: true });
});

const resources = [
  {
    id: 'event-feedback',
    title: 'Encuentro AWS',
    url: 'https://example.com/event-feedback',
    description: 'Un encuentro para la comunidad.',
    recordType: 'event',
    published: false,
    directoryApproval: 'pending',
    directoryControl: 'editorial',
    hidden: false,
    version: 1,
  },
  {
    id: 'resource-feedback',
    title: 'Guía AWS',
    url: 'https://example.com/resource-feedback',
    description: 'Una guía para la comunidad.',
    recordType: 'resource',
    category: '',
    kind: '',
    format: '',
    topics: [],
    published: false,
    directoryApproval: 'pending',
    directoryControl: 'editorial',
    hidden: false,
    version: 1,
  },
];

const profiles = [{
  id: 'profile-feedback',
  displayName: 'Ana',
  slug: 'ana-feedback',
  published: true,
  hidden: false,
  version: 1,
}];

const claims = [{
  id: 'claim-feedback',
  accountId: 'account-feedback',
  resourceIds: ['resource-feedback'],
  sourceId: 'ana-feedback',
  evidence: 'https://example.com/evidence',
  status: 'pending',
}];

async function loadAdminPage() {
  if (!adminPagePromise) {
    const outputPath = path.join(tempDir, 'creator-admin-page.mjs');
    adminPagePromise = (async () => {
      await build({
        entryPoints: [path.join(root, 'src/pages/cuenta/administracion/index.astro')],
        outfile: outputPath,
        bundle: true,
        platform: 'node',
        format: 'esm',
        packages: 'external',
        define: {
          'import.meta.env.PUBLIC_SITE_ORIGIN': '"https://dondeaprendoaws.com"',
          'import.meta.env.PUBLIC_PRODUCTION': '"true"',
        },
        plugins: [
          {
            name: 'render-admin-astro-components',
            setup(api) {
              api.onResolve({ filter: /\.css$/ }, ({ path: specifier, resolveDir }) => ({
                path: path.resolve(resolveDir, specifier),
                namespace: 'admin-style-stub',
              }));
              api.onLoad({ filter: /.*/, namespace: 'admin-style-stub' }, () => ({
                contents: '',
                loader: 'js',
              }));
              api.onResolve({ filter: /\?raw$/ }, ({ path: specifier, resolveDir }) => ({
                path: path.resolve(resolveDir, specifier.slice(0, -4)),
                namespace: 'admin-raw-text',
              }));
              api.onLoad({ filter: /.*/, namespace: 'admin-raw-text' }, async ({ path: filename }) => ({
                contents: await readFile(filename, 'utf8'),
                loader: 'text',
              }));
              api.onResolve({ filter: /creator-runtime\.mjs$/ }, () => ({
                path: 'creator-runtime',
                namespace: 'admin-runtime-fixture',
              }));
              api.onLoad({ filter: /.*/, namespace: 'admin-runtime-fixture' }, () => ({
                contents: 'export function getCreatorRuntime() { return globalThis.__adminFeedbackTestRuntime; }',
                loader: 'js',
              }));
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
          },
        ],
      });
      return (await import(pathToFileURL(outputPath).href)).default;
    })();
  }
  return adminPagePromise;
}

async function renderAdminPage({ claimRecords = claims } = {}) {
  const service = {
    async handle(request) {
      const pathname = new URL(request.url).pathname;
      const data = {
        '/api/admin/recursos': { resources },
        '/api/admin/perfiles': { profiles },
        '/api/admin/reclamaciones': { claims: claimRecords },
      }[pathname];
      return data
        ? Response.json(data)
        : new Response('not found', { status: 404 });
    },
  };
  globalThis.__adminFeedbackTestRuntime = {
    service,
    auth: {
      getPrincipal: async () => ({ state: 'authenticated', accountId: 'admin-feedback', isAdmin: true, csrfToken: 'csrf-feedback' }),
    },
  };
  const page = await loadAdminPage();
  const request = new Request('https://dondeaprendoaws.com/cuenta/administracion/');
  return container.renderToString(page, { request, partial: false });
}

async function loadAdminScript() {
  if (!adminScriptPromise) {
    adminScriptPromise = build({
      entryPoints: [path.join(root, 'src/scripts/creator-admin.ts')],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'iife',
      target: 'es2022',
    }).then(({ outputFiles }) => outputFiles[0].text);
  }
  return adminScriptPromise;
}

async function writeBrowserFixture(html) {
  if (process.env.CREATOR_ADMIN_FEEDBACK_FIXTURE !== '1') return;
  const script = await loadAdminScript();
  const instrumentedScript = script.replaceAll('window.location.reload();', 'window.__creatorAdminFixtureReload();');
  assert.notEqual(instrumentedScript, script, 'el bundle real debe exponer la recarga de éxito que el fixture sustituye');
  const fixtureWrapper = `(() => {
  let requestCount = 0;
  window.fetch = async (input, init = {}) => {
    const status = requestCount++ === 0 ? 503 : 200;
    const pathname = new URL(input, window.location.href).pathname;
    document.querySelector('[data-admin-fixture-log]').textContent += \`\${init.method ?? 'GET'} \${pathname} → HTTP \${status}\\n\`;
    return new Response('{}', { status, headers: { 'content-type': 'application/json' } });
  };
  window.__creatorAdminFixtureReload = () => {
    document.querySelector('[data-admin-fixture-result]').textContent = 'El script recibió 200 y conservó el mensaje de éxito sin recargar.';
  };
})();
`;
  const fixtureHtml = html.replace('</body>', `
    <aside style="margin: 2rem auto; max-width: 72rem; padding: 1rem; border: 2px solid currentColor;">
      <h2>Simulación local de feedback</h2>
      <p>Sin acceso a AWS. Pulsa «Aprobar para el directorio» en el evento «Encuentro AWS»: la primera petición devuelve 503 y el botón debe quedar habilitado; vuelve a pulsarlo para recibir 200.</p>
      <p data-admin-fixture-result role="status" aria-live="polite">Esperando la acción de moderación.</p>
      <pre data-admin-fixture-log aria-live="polite"></pre>
    </aside>
    <script src="./repair-review-admin-ui.js" defer></script>
  </body>`);
  const artifactDirectory = path.join(root, '.work/creator-pages');
  await writeFile(path.join(artifactDirectory, 'repair-review-admin-ui.html'), fixtureHtml);
  await writeFile(path.join(artifactDirectory, 'repair-review-admin-ui.js'), `${fixtureWrapper}\n${instrumentedScript}`);
}

class TestElement {
  constructor({ dataset = {}, status, rowType, rowId, row, controls = [], selectors = {} } = {}) {
    this.dataset = dataset;
    this.status = status;
    this.rowType = rowType;
    this.rowId = rowId;
    this.row = row;
    this.controls = controls;
    this.selectors = selectors;
    this.listeners = new Map();
    this.attributes = new Map();
    this.disabled = false;
    this.textContent = '';
    this.checked = false;
    this.hidden = true;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  querySelector(selector) {
    return selector === '[data-item-status]' ? this.status ?? null : this.selectors?.[selector] ?? null;
  }

  querySelectorAll(selector) {
    if (selector === 'input, textarea, select') return this.fields ?? this.controls;
    if (selector === 'button' || selector === 'input[name="resourceIds"]'
      || selector === '[data-claim-resolution] button, [data-claim-resolution] input[name="resourceIds"]') return this.controls;
    if (selector === '[data-creator-stale]') return this.controls.filter((control) => control.hasAttribute('data-creator-stale'));
    return [];
  }

  closest(selector) {
    if (selector === '[data-admin-resource]' && this.rowType === 'resource') return this.row ?? this;
    if (selector === '[data-admin-profile]' && this.rowType === 'profile') return this.row ?? this;
    if (selector === '[data-admin-claim]' && this.rowType === 'claim') return this.row ?? this;
    return null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  async dispatch(type) {
    const event = { preventDefault() {} };
    for (const listener of this.listeners.get(type) ?? []) await listener(event);
  }
}

class TestForm extends TestElement {
  reportValidity() { return true; }
}

class TestFormData {
  constructor(form) { this.form = form; }
  get(name) {
    return this.form.fields?.find((field) => field.name === name)?.value ?? null;
  }
  getAll(name) {
    if (name !== 'resourceIds') return [];
    return this.form.fields
      ? this.form.fields.filter((field) => field.name === name && field.checked).map((field) => field.value)
      : ['resource-feedback'];
  }
}

function renderedRows(html, rowType, attribute) {
  const rows = [];
  const expression = new RegExp(`<li\\b(?=[^>]*\\b${attribute}="([^"]+)")[^>]*>([\\s\\S]*?)<\\/li>`, 'g');
  for (const match of html.matchAll(expression)) {
    const id = match[1];
    const rowHtml = match[2];
    const status = /<[^>]*\bdata-item-status\b[^>]*>/.test(rowHtml)
      ? new TestElement()
      : null;
    const row = new TestElement({
      dataset: rowType === 'resource' ? { adminResource: id }
        : rowType === 'profile' ? { adminProfile: id }
          : { adminClaim: id },
      status,
      rowType,
      rowId: id,
    });
    rows.push({ id, html: rowHtml, row, status });
  }
  return rows;
}

async function executeAdminScript(html, { fetchImpl } = {}) {
  const rootAttributes = html.match(/<main\b[^>]*\bdata-csrf="([^"]+)"[^>]*>/)?.[0];
  assert.ok(rootAttributes, 'la página real debe incluir el contenedor y CSRF administrativos');
  const csrf = rootAttributes.match(/\bdata-csrf="([^"]+)"/)?.[1];
  const sessionBinding = rootAttributes.match(/\bdata-session-binding="([^"]+)"/)?.[1];
  const dataJson = html.match(/<script\b[^>]*id="creator-admin-data"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(dataJson, 'la página real debe emitir el estado para el script administrativo');
  const resourcesRows = renderedRows(html, 'resource', 'data-admin-resource');
  const profileRows = renderedRows(html, 'profile', 'data-admin-profile');
  const claimRows = renderedRows(html, 'claim', 'data-admin-claim');
  const adminData = JSON.parse(dataJson);
  const resourceButtons = [];
  for (const { id, html: rowHtml, row } of resourcesRows) {
    for (const match of rowHtml.matchAll(/data-resource-action="([^"]+)"/g)) {
      resourceButtons.push(new TestElement({
        dataset: { resourceAction: match[1] }, rowType: 'resource', rowId: id, row,
      }));
    }
  }
  const profileButtons = [];
  for (const { id, html: rowHtml } of profileRows) {
    for (const match of rowHtml.matchAll(/data-profile-action="([^"]+)"/g)) {
      profileButtons.push(new TestElement({
        dataset: { profileAction: match[1] }, rowType: 'profile', rowId: id,
        row: profileRows.find((entry) => entry.id === id)?.row,
      }));
    }
  }
  const claimForms = claimRows.map(({ id, row }) => {
    const claim = adminData.claims.find((candidate) => candidate.id === id || candidate.claimId === id);
    const checkboxes = (Array.isArray(claim?.resourceIds) ? claim.resourceIds : []).map((value) => {
      const checkbox = new TestElement();
      checkbox.tagName = 'INPUT';
      checkbox.type = 'checkbox';
      checkbox.name = 'resourceIds';
      checkbox.value = value;
      checkbox.checked = true;
      return checkbox;
    });
    const submit = new TestElement();
    submit.tagName = 'BUTTON';
    const controls = [...checkboxes, submit];
    const form = new TestForm({ rowType: 'claim', rowId: id, row, controls });
    form.fields = checkboxes;
    for (const checkbox of checkboxes) checkbox.form = form;
    row.controls = controls;
    return form;
  });
  const classificationForms = resourcesRows
    .filter(({ html: rowHtml }) => /data-classification-form/.test(rowHtml))
    .map(({ id }) => new TestForm({
      rowType: 'resource', rowId: id,
      row: resourcesRows.find((entry) => entry.id === id)?.row,
    }));
  const refreshButton = new TestElement();
  refreshButton.tagName = 'BUTTON';
  const sessionRecoveryStatus = new TestElement();
  const sessionRecoverySignIn = new TestElement();
  const sessionRecoveryCheck = new TestElement();
  sessionRecoveryCheck.tagName = 'BUTTON';
  const sessionRecoveryShell = new TestElement();
  const transition = new TestElement();
  const transitionShell = new TestElement();
  const allControls = [
    ...resourceButtons, ...profileButtons, ...claimForms.flatMap((form) => form.controls), refreshButton, sessionRecoveryCheck,
  ];
  const rootElement = new TestElement({
    dataset: { csrf, sessionBinding },
    controls: allControls,
    selectors: {
      '[data-refresh-view]': refreshButton,
      '[data-view-transition]': transition,
      '[data-view-transition-shell]': transitionShell,
      '[data-session-recovery-shell]': sessionRecoveryShell,
      '[data-session-recovery-status]': sessionRecoveryStatus,
      '[data-session-recovery-sign-in]': sessionRecoverySignIn,
      '[data-session-recovery-check]': sessionRecoveryCheck,
    },
  });
  rootElement.fields = claimForms.flatMap((form) => form.fields ?? []);
  rootElement.querySelectorAll = (selector) => ({
    'input, textarea, select': rootElement.fields,
    '[data-classification-form]': classificationForms,
    '[data-resource-action]': resourceButtons,
    '[data-profile-action]': profileButtons,
    '[data-claim-resolution]': claimForms,
    'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': allControls,
    '[data-creator-stale]': allControls.filter((control) => control.hasAttribute('data-creator-stale')),
  }[selector] ?? []);
  const initial = new TestElement();
  initial.textContent = dataJson;
  const document = {
    querySelector: (selector) => selector === '[data-creator-admin]'
      ? rootElement
      : selector === '#creator-admin-data' ? initial : null,
  };
  const responses = [];
  const requests = [];
  let reloads = 0;
  const source = await loadAdminScript();
  runInNewContext(source, {
    document,
    window: { location: { reload() { reloads += 1; } } },
    HTMLElement: TestElement,
    FormData: TestFormData,
    Response,
    TextEncoder,
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (fetchImpl) return fetchImpl(url, init);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      if (typeof next === 'object' && next !== null && 'status' in next) {
        return Response.json(next.body ?? {}, { status: next.status });
      }
      return new Response('{}', { status: next });
    },
  });
  return {
    resourcesRows, profileRows, claimRows, resourceButtons, profileButtons, claimForms,
    refreshButton, transition, responses, requests, reloads: () => reloads,
    sessionBinding,
    sessionRecovery: { shell: sessionRecoveryShell, status: sessionRecoveryStatus, signIn: sessionRecoverySignIn, check: sessionRecoveryCheck },
  };
}

async function settleSessionCheck() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test('la moderación de eventos muestra fallos recuperables y conserva los formularios de otros registros', async () => {
  const html = await renderAdminPage();
  await writeBrowserFixture(html);
  const eventRow = renderedRows(html, 'resource', 'data-admin-resource').find(({ id }) => id === 'event-feedback');
  const ordinaryRow = renderedRows(html, 'resource', 'data-admin-resource').find(({ id }) => id === 'resource-feedback');
  assert.ok(eventRow, 'la página Astro real debe renderizar el evento');
  assert.ok(ordinaryRow, 'la página Astro real debe renderizar el recurso ordinario');
  assert.match(eventRow.html, /Los eventos se revisan sin clasificación de recursos\./);
  assert.doesNotMatch(eventRow.html, /data-classification-form/);
  assert.match(ordinaryRow.html, /data-classification-form/);
  assert.ok(eventRow.status, 'el evento debe tener un destino visible para los errores administrativos');
  assert.ok(ordinaryRow.status, 'el destino del recurso ordinario debe seguir disponible');
  assert.match(html, /data-admin-profile="profile-feedback"/);
  assert.match(html, /data-admin-claim="claim-feedback"/);

  const page = await executeAdminScript(html);
  const eventDomRow = page.resourcesRows.find(({ id }) => id === 'event-feedback');
  const ordinaryDomRow = page.resourcesRows.find(({ id }) => id === 'resource-feedback');
  const eventButton = page.resourceButtons.find((button) => button.rowId === 'event-feedback');
  const ordinaryButton = page.resourceButtons.find((button) => button.rowId === 'resource-feedback');
  const profileButton = page.profileButtons[0];
  const claimForm = page.claimForms[0];
  assert.ok(eventButton);
  assert.ok(ordinaryButton);
  assert.ok(profileButton);
  assert.ok(claimForm);

  const eventFailures = [
    [503, 'No pudimos guardar el cambio. Inténtalo de nuevo en unos minutos.'],
    [403, 'Esta cuenta no tiene permiso para completar esta acción.'],
    [{ status: 409, body: { error: 'RESOURCE_CONFLICT' } }, 'El registro cambió desde la última lectura. Recarga la página antes de volver a guardar.'],
    [{ status: 409, body: { error: 'FUTURE_CONFLICT' } }, 'No pudimos completar el cambio porque hay un conflicto. Revisa el estado antes de volver a intentarlo.'],
    [422, 'Revisa la clasificación o los IDs seleccionados e inténtalo de nuevo.'],
    [new Error('offline'), 'No pudimos conectar con el servicio. Inténtalo de nuevo.'],
  ];
  for (const [index, [failure, message]] of eventFailures.entries()) {
    page.responses.push(failure);
    await eventButton.dispatch('click');
    assert.equal(page.requests.length, index + 1,
      'cada fallo debe llegar a la acción de moderación');
    assert.equal(eventDomRow.status.textContent, message);
    assert.equal(eventDomRow.status.dataset.kind, 'error');
    assert.equal(eventButton.disabled, false, 'el botón del evento debe habilitarse tras el fallo');
  }
  page.responses.push(200);
  await eventButton.dispatch('click');
  assert.equal(eventDomRow.status.textContent, 'Recurso aprobado para el directorio.');
  assert.equal(page.reloads(), 1, 'un éxito debe conservar la recarga existente');

  for (const [button, status, action] of [
    [ordinaryButton, ordinaryDomRow.status, 'resource'],
    [profileButton, page.profileRows[0].status, 'profile'],
  ]) {
    page.responses.push(503, 200);
    await button.dispatch('click');
    assert.equal(status.textContent, 'No pudimos guardar el cambio. Inténtalo de nuevo en unos minutos.', `${action} reporta el fallo`);
    assert.equal(button.disabled, false);
    await button.dispatch('click');
    assert.ok(status.textContent.length > 0, `${action} conserva el mensaje de éxito`);
  }

  page.responses.push(503, 200);
  await claimForm.dispatch('submit');
  assert.equal(page.claimRows[0].status.textContent, 'No pudimos guardar el cambio. Inténtalo de nuevo en unos minutos.');
  await claimForm.dispatch('submit');
  assert.equal(page.claimRows[0].status.textContent, 'Recursos vinculados a la cuenta.');

  assert.ok(page.requests.every(({ init }) => init.method === 'POST'));
  assert.ok(page.requests.every(({ init }) => init.headers['x-csrf-token'] === 'csrf-feedback'));
});

test('la recuperación administrativa rechaza un cambio de rol sin desbloquear escrituras', async () => {
  const auth = { current: { state: 'authenticated', accountId: 'admin-feedback', csrfToken: 'csrf-feedback', isAdmin: true } };
  const harness = await createCreatorPagesHarness({ authenticate: async () => auth.current });
  const handler = createCreatorHttpHandler({
    service: harness.service,
    auth: { getPrincipal: async () => auth.current },
    origin: SITE_ORIGIN,
  });
  const statuses = [];
  const page = await executeAdminScript(await renderAdminPage(), {
    fetchImpl: async (url, init = {}) => {
      const target = new URL(url, SITE_ORIGIN);
      const headers = new Headers(init.headers);
      if (target.origin === SITE_ORIGIN) headers.set('origin', SITE_ORIGIN);
      const response = await handler(new Request(target, { ...init, headers }));
      statuses.push(response.status);
      return response;
    },
  });
  assert.ok(page.resourceButtons[0]);
  assert.equal(page.sessionBinding, creatorPageSessionBinding(auth.current), 'the rendered admin page binds recovery to the original admin role');

  auth.current = { state: 'anonymous' };
  await page.resourceButtons[0].dispatch('click');
  assert.equal(statuses[0], 401);
  assert.equal(page.sessionRecovery.signIn.hidden, false);
  assert.equal(page.sessionRecovery.check.hidden, false);

  auth.current = { state: 'authenticated', accountId: 'admin-feedback', csrfToken: 'csrf-renewed', isAdmin: false };
  await page.sessionRecovery.check.dispatch('click');
  await settleSessionCheck();
  assert.equal(statuses[1], 409, 'the actual session handler compares the immutable account-and-role binding');
  assert.match(page.sessionRecovery.status.textContent, /otra cuenta o tiene otros permisos/);

  await page.resourceButtons[1].dispatch('click');
  assert.equal(statuses.length, 2, 'a role mismatch keeps all administrative writes blocked');
  assert.equal(page.requests.length, 2);
  assert.equal(page.reloads(), 0);
});

test('la misma administración renueva CSRF y completa una acción sólo después de volver a pulsarla', async () => {
  const accountId = 'admin-feedback';
  const auth = { current: { state: 'authenticated', accountId, csrfToken: 'csrf-feedback', isAdmin: true } };
  const harness = await createCreatorPagesHarness({ authenticate: async () => auth.current });
  const seeded = await harness.store.transact({
    checks: [{ key: 'profile:profile-feedback', version: null }],
    puts: [{ key: 'profile:profile-feedback', value: {
      id: 'profile-feedback', displayName: 'Ana', slug: 'ana-feedback', published: true, hidden: false, version: 1,
    } }],
  });
  assert.equal(seeded, true);
  const handler = createCreatorHttpHandler({
    service: harness.service,
    auth: { getPrincipal: async () => auth.current },
    origin: SITE_ORIGIN,
  });
  const statuses = [];
  const page = await executeAdminScript(await renderAdminPage(), {
    fetchImpl: async (url, init = {}) => {
      const target = new URL(url, SITE_ORIGIN);
      const headers = new Headers(init.headers);
      if (target.origin === SITE_ORIGIN) headers.set('origin', SITE_ORIGIN);
      const response = await handler(new Request(target, { ...init, headers }));
      statuses.push(response.status);
      return response;
    },
  });
  const hideProfile = page.profileButtons[0];
  assert.ok(hideProfile);

  auth.current = { state: 'anonymous' };
  await hideProfile.dispatch('click');
  assert.equal(statuses[0], 401);
  assert.equal(hideProfile.disabled, false, 'the rejected action remains available for an explicit retry');

  auth.current = { state: 'authenticated', accountId, csrfToken: 'csrf-admin-renewed', isAdmin: true };
  await page.sessionRecovery.check.dispatch('click');
  await settleSessionCheck();
  assert.equal(statuses[1], 200);
  assert.equal(page.requests.length, 2, 'session confirmation does not replay the rejected moderation action');
  assert.match(page.sessionRecovery.status.textContent, /Sesión comprobada/);

  await hideProfile.dispatch('click');
  assert.equal(statuses[2], 200);
  assert.equal(page.requests[2].url, '/api/admin/perfiles/profile-feedback/ocultar/');
  assert.equal(page.requests[2].init.headers['x-csrf-token'], 'csrf-admin-renewed');
  assert.equal(page.reloads(), 1, 'the action reloads only after its explicit successful retry');
});

test('la clasificación conserva una corrección durante el guardado y recarga con la versión actualizada', async () => {
  const resourceRow = new TestElement({ dataset: { adminResource: 'resource-feedback' }, rowType: 'resource', rowId: 'resource-feedback' });
  const itemStatus = new TestElement();
  resourceRow.status = itemStatus;
  const fields = [
    { tagName: 'INPUT', type: 'text', name: 'category', value: 'Otros' },
    { tagName: 'INPUT', type: 'text', name: 'kind', value: 'content' },
    { tagName: 'INPUT', type: 'text', name: 'format', value: 'Artículo' },
    { tagName: 'INPUT', type: 'text', name: 'topics', value: '' },
  ];
  const form = new TestForm({ rowType: 'resource', rowId: 'resource-feedback', row: resourceRow, controls: [] });
  form.fields = fields;
  form.querySelectorAll = (selector) => selector === 'input, textarea, select' ? fields
    : selector === 'datalist option' ? [] : [];
  for (const field of fields) field.form = form;
  form.querySelector = (selector) => selector === '[data-item-status]' ? itemStatus : null;
  resourceRow.querySelector = (selector) => selector === '[data-item-status]' ? itemStatus : null;

  const root = new TestElement({ dataset: { csrf: 'csrf-a' } });
  root.controls = fields;
  root.querySelectorAll = (selector) => selector === '[data-classification-form]' ? [form]
    : selector === 'input, textarea, select' ? fields : [];
  const initial = new TestElement();
  initial.textContent = JSON.stringify({
    resources: [{ id: 'resource-feedback', version: 1 }], profiles: [], claims: [],
  });
  const requests = [];
  let resolveFirstSave;
  let reloads = 0;
  const source = await loadAdminScript();
  runInNewContext(source, {
    document: {
      querySelector: (selector) => selector === '[data-creator-admin]' ? root
        : selector === '#creator-admin-data' ? initial : null,
    },
    window: { location: { reload() { reloads += 1; } } },
    HTMLElement: TestElement,
    FormData: TestFormData,
    Response,
    TextEncoder,
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (requests.filter((request) => request.options.method === 'PATCH').length === 1) {
        return new Promise((resolve) => { resolveFirstSave = resolve; });
      }
      return Response.json({ resource: { id: 'resource-feedback', version: 3 }, versionChanges: [
        { entity: 'resource', id: 'resource-feedback', before: 2, after: 3 },
      ] });
    },
  });

  const pending = form.dispatch('submit');
  await Promise.resolve();
  fields[0].value = 'Certificaciones';
  resolveFirstSave(Response.json({ resource: { id: 'resource-feedback', category: 'Otros', kind: 'content', format: 'Artículo', topics: [], version: 2 }, versionChanges: [
    { entity: 'resource', id: 'resource-feedback', before: 1, after: 2 },
  ] }));
  await pending;

  assert.equal(JSON.parse(requests[0].options.body).category, 'Otros');
  assert.equal(fields[0].value, 'Certificaciones');
  assert.equal(reloads, 0, 'the correction stays visible after the first successful request');
  assert.match(itemStatus.textContent, /Conservamos los cambios que aún no enviaste/);

  await form.dispatch('submit');
  const patches = requests.filter((request) => request.options.method === 'PATCH');
  assert.equal(JSON.parse(patches[1].options.body).category, 'Certificaciones');
  assert.equal(JSON.parse(patches[1].options.body).version, 2, 'the committed receipt advances this form version');
  assert.equal(requests.some((request) => request.options.method === 'GET'), false, 'a later GET never adopts unseen classification versions');
  assert.equal(reloads, 1, 'the page reloads after the corrected classification is saved');
});

test('resolver una reclamación deja editables y guardables las selecciones exactas de otra', async () => {
  const page = await executeAdminScript(await renderAdminPage({ claimRecords: [
    {
      id: 'claim-a', accountId: 'owner-a', resourceIds: ['resource-a'],
      sourceId: 'source-a', evidence: 'https://example.com/a', status: 'pending',
    },
    {
      id: 'claim-b', accountId: 'owner-b', resourceIds: ['resource-b1', 'resource-b2'],
      sourceId: 'source-b', evidence: 'https://example.com/b', status: 'pending',
    },
  ] }));
  const claimA = page.claimForms.find((form) => form.rowId === 'claim-a');
  const claimB = page.claimForms.find((form) => form.rowId === 'claim-b');
  assert.ok(claimA);
  assert.ok(claimB);
  const submitA = claimA.controls.at(-1);
  const [resourceB1, resourceB2] = claimB.fields;
  const submitB = claimB.controls.at(-1);
  resourceB2.checked = false;

  page.responses.push(
    { status: 200, body: { versionChanges: [] } },
    { status: 200, body: { versionChanges: [] } },
  );
  await claimA.dispatch('submit');

  assert.equal(resourceB2.checked, false, 'the exact reviewed subset remains selected');
  assert.equal(resourceB2.disabled, false, 'another claim selection remains editable');
  assert.equal(submitB.disabled, false, 'another claim can still be submitted');
  await page.refreshButton.dispatch('click');
  assert.equal(page.reloads(), 0, 'the safe refresh preserves the pending selection');
  assert.match(page.transition.textContent, /Guarda los cambios pendientes o revierte/);

  await claimB.dispatch('submit');
  assert.deepEqual(JSON.parse(page.requests[0].init.body).resourceIds, ['resource-a']);
  assert.deepEqual(JSON.parse(page.requests[1].init.body).resourceIds, ['resource-b1']);
  assert.equal(resourceB1.checked, true);
  assert.equal(page.reloads(), 1, 'saving the other exact-ID selection completes the refresh');
  assert.equal(submitA.disabled, true, 'the resolved claim itself stays paused until refresh');
});

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
import { callApi, createCreatorPagesHarness, seedResource, SITE_ORIGIN } from './fixtures/creator-pages.mjs';

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

async function renderAdminPage({ claimRecords = claims, resourceRecords = resources, profileRecords = profiles } = {}) {
  const service = {
    async handle(request) {
      const pathname = new URL(request.url).pathname;
      const data = {
        '/api/admin/recursos': { resources: resourceRecords },
        '/api/admin/perfiles': { profiles: profileRecords },
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
    if (selector === 'button' || selector === '[data-claim-resolution] button') {
      return this.controls.filter((control) => control.tagName === 'BUTTON');
    }
    if (selector === 'input[name="resourceIds"]' || selector === '[data-claim-resolution] input[name="resourceIds"]') {
      return this.controls.filter((control) => control.tagName === 'INPUT' && control.name === 'resourceIds');
    }
    if (selector === '[data-claim-resolution] button, [data-claim-resolution] input[name="resourceIds"]') return this.controls;
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

async function executeAdminScript(html, { fetchImpl, initialData } = {}) {
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
    .map(({ id }) => {
      const resource = adminData.resources.find((candidate) => candidate.id === id);
      const fields = [
        { tagName: 'INPUT', type: 'text', name: 'category', value: String(resource?.category ?? '') },
        { tagName: 'SELECT', type: 'select-one', name: 'kind', value: String(resource?.kind ?? '') },
        { tagName: 'SELECT', type: 'select-one', name: 'format', value: String(resource?.format ?? '') },
        { tagName: 'INPUT', type: 'text', name: 'topics', value: Array.isArray(resource?.topics) ? resource.topics.join(', ') : '' },
      ];
      const form = new TestForm({
        rowType: 'resource', rowId: id,
        row: resourcesRows.find((entry) => entry.id === id)?.row,
      });
      const saveButton = new TestElement();
      saveButton.tagName = 'BUTTON';
      form.fields = fields;
      form.controls = [saveButton];
      form.saveButton = saveButton;
      form.querySelectorAll = (selector) => selector === 'input, textarea, select' ? fields
        : selector === 'button' ? form.controls : [];
      form.querySelector = (selector) => selector === '[data-item-status]' ? form.row?.status ?? null : null;
      for (const field of fields) field.form = form;
      return form;
    });
  for (const { id, row } of resourcesRows) {
    row.controls = [
      ...classificationForms.filter((form) => form.rowId === id).flatMap((form) => form.controls),
      ...resourceButtons.filter((button) => button.rowId === id),
    ];
  }
  for (const { id, row } of profileRows) {
    row.controls = profileButtons.filter((button) => button.rowId === id);
  }
  const refreshButton = new TestElement();
  refreshButton.tagName = 'BUTTON';
  const sessionRecoveryStatus = new TestElement();
  const sessionRecoverySignIn = new TestElement();
  const sessionRecoveryCheck = new TestElement();
  sessionRecoveryCheck.tagName = 'BUTTON';
  const sessionRecoveryShell = new TestElement();
  const transition = new TestElement();
  const transitionShell = new TestElement();
  const adminStatus = new TestElement();
  const allControls = [
    ...resourceButtons, ...profileButtons, ...classificationForms.flatMap((form) => form.controls),
    ...claimForms.flatMap((form) => form.controls), refreshButton, sessionRecoveryCheck,
  ];
  const rootElement = new TestElement({
    dataset: { csrf, sessionBinding },
    controls: allControls,
    selectors: {
      '[data-refresh-view]': refreshButton,
      '[data-view-transition]': transition,
      '[data-view-transition-shell]': transitionShell,
      '[data-admin-status]': adminStatus,
      '[data-session-recovery-shell]': sessionRecoveryShell,
      '[data-session-recovery-status]': sessionRecoveryStatus,
      '[data-session-recovery-sign-in]': sessionRecoverySignIn,
      '[data-session-recovery-check]': sessionRecoveryCheck,
    },
  });
  rootElement.fields = [...claimForms, ...classificationForms].flatMap((form) => form.fields ?? []);
  rootElement.querySelectorAll = (selector) => ({
    'input, textarea, select': rootElement.fields,
    '[data-classification-form]': classificationForms,
    '[data-resource-action]': resourceButtons,
    '[data-profile-action]': profileButtons,
    '[data-claim-resolution]': claimForms,
    '[data-admin-resource]': resourcesRows.map(({ row }) => row),
    '[data-admin-profile]': profileRows.map(({ row }) => row),
    'button:not([data-refresh-view]), [data-featured], [data-directory]': allControls.filter((control) => control !== refreshButton),
    'button, input[type="file"], input[data-busy-control], [data-featured], [data-directory], [data-creator-stale]': allControls,
    '[data-creator-stale]': allControls.filter((control) => control.hasAttribute('data-creator-stale')),
  }[selector] ?? []);
  const initial = new TestElement();
  initial.textContent = initialData ?? dataJson;
  const document = {
    querySelector: (selector) => selector === '[data-creator-admin]'
      ? rootElement
      : selector === '#creator-admin-data' ? initial
        : selector === '[data-admin-status]' ? adminStatus : null,
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
    resourcesRows, profileRows, claimRows, resourceButtons, profileButtons, claimForms, classificationForms,
    refreshButton, transition, transitionShell, adminStatus, responses, requests, reloads: () => reloads,
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
  assert.deepEqual(JSON.parse(page.requests[6].init.body), { version: 1 },
    'resource moderation sends the version retained in the rendered admin state');
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
  assert.ok(claimForm.fields.every((control) => !control.disabled), 'a rejected request restores its editable selections');
  assert.equal(claimForm.controls.at(-1).disabled, false, 'a rejected request restores its submit control');
  await claimForm.dispatch('submit');
  assert.equal(page.claimRows[0].status.textContent, 'Recursos vinculados a la cuenta.');

  assert.ok(page.requests.every(({ init }) => init.method === 'POST'));
  assert.ok(page.requests.every(({ init }) => init.headers['x-csrf-token'] === 'csrf-feedback'));
  assert.deepEqual(JSON.parse(page.requests.find(({ url }) => url.includes('/recursos/resource-feedback/')).init.body), { version: 1 });
  assert.deepEqual(JSON.parse(page.requests.find(({ url }) => url.includes('/perfiles/profile-feedback/')).init.body), { version: 1 });
});

test('claim rejected for exhausted placement order explains the failure and retains editable selections', async () => {
  const page = await executeAdminScript(await renderAdminPage());
  const form = page.claimForms[0];
  assert.ok(form);
  page.responses.push({ status: 409, body: { error: 'PLACEMENT_ORDER_EXHAUSTED' } });

  await form.dispatch('submit');

  assert.equal(page.claimRows[0].status.textContent,
    'No hay una posición válida para agregar otro enlace a esta página. Es necesario corregir su orden antes de volver a intentarlo.');
  assert.equal(page.claimRows[0].status.dataset.kind, 'error');
  assert.ok(form.fields.every((control) => !control.disabled));
  assert.equal(form.controls.at(-1).disabled, false);
  assert.equal(page.reloads(), 0);
});

test('R9 partial claim freezes only that form, retains receipts, and allows safe refresh after another save', async () => {
  const html = await renderAdminPage({ claimRecords: [{
    id: 'claim-partial', accountId: 'owner', resourceIds: ['resource-feedback', 'resource-two', 'resource-three'], status: 'pending',
  }] });
  const page = await executeAdminScript(html);
  const claimForm = page.claimForms[0];
  const [linkedResource, failedResource, uncheckedResource] = claimForm.fields;
  const classification = page.classificationForms.find((form) => form.rowId === 'resource-feedback');
  assert.ok(classification);
  const [category, kind, format] = classification.fields;
  category.value = 'Certificaciones';
  kind.value = 'content';
  format.value = 'Artículo';
  uncheckedResource.checked = false;

  page.responses.push({ status: 503, body: { linkedResourceIds: ['resource-feedback'], versionChanges: [
    { entity: 'resource', id: 'resource-feedback', before: 1, after: 2 },
    { entity: 'profile', id: 'profile-feedback', before: 1, after: 2 },
  ] } });
  await claimForm.dispatch('submit');

  assert.deepEqual(JSON.parse(page.requests[0].init.body).resourceIds, ['resource-feedback', 'resource-two'],
    'the request contains only the exact checked IDs');
  assert.equal(linkedResource.checked, true);
  assert.equal(failedResource.checked, true);
  assert.equal(uncheckedResource.checked, false, 'an unchecked ID stays unchecked after the partial response');
  assert.ok(claimForm.fields.every((control) => control.disabled), 'the stale claim selections remain disabled until refresh');
  assert.equal(claimForm.controls.at(-1).disabled, true);
  assert.equal(page.transition.hidden, false, 'partial-link recovery instructions are visible');
  assert.equal(page.transitionShell.hidden, false, 'the transition container is visible too');

  await page.refreshButton.dispatch('click');
  assert.equal(page.reloads(), 0, 'the unrelated classification edit still blocks refresh');
  assert.equal(page.transition.hidden, false, 'the blocked-refresh reason is visible');
  assert.match(page.transition.textContent, /Guarda los cambios pendientes o revierte/);

  page.responses.push({ status: 200, body: {
    resource: { id: 'resource-feedback', version: 3 },
    versionChanges: [{ entity: 'resource', id: 'resource-feedback', before: 2, after: 3 }],
  } });
  await classification.dispatch('submit');
  assert.equal(JSON.parse(page.requests[1].init.body).version, 2,
    'the partial response receipt advances only the resource version used by the other form');
  assert.equal(JSON.parse(page.requests[1].init.body).category, 'Certificaciones');
  assert.equal(page.reloads(), 1, 'saving the remaining pending form enables the safe refresh');
});

test('R11 partial claim with one receipt gap pauses only stale records and recovers before saving the unrelated draft', async () => {
  const auth = { current: { state: 'authenticated', accountId: 'admin-feedback', csrfToken: 'csrf-feedback', isAdmin: true } };
  const creatorPrincipal = { state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-a', isAdmin: false };
  const harness = await createCreatorPagesHarness({
    authenticate: async (request) => request.headers.get('x-test-session') === 'admin'
      ? auth.current
      : request.headers.get('x-test-session') === 'creator-a' ? creatorPrincipal : { state: 'anonymous' },
  });
  const created = await callApi(harness, '/api/creador/perfil', {
    method: 'PUT', session: 'creator-a', csrf: 'csrf-a',
    body: { displayName: 'Ana', slug: 'ana-admin-r11', programs: [], socials: {} },
  });
  assert.equal(created.status, 200);
  for (const id of ['resource-r11-a', 'resource-r11-b', 'resource-r11-c']) {
    await seedResource(harness.store, {
      id, title: id, url: `https://example.com/${id}`, description: '', category: 'Otros',
      kind: 'content', format: 'Artículo', topics: [], order: 1, featured: false, published: false,
      directoryApproval: 'pending', directoryControl: 'editorial', hidden: false, version: 1,
    });
  }
  const initialClaim = await callApi(harness, '/api/creador/reclamaciones', {
    method: 'POST', session: 'creator-a', csrf: 'csrf-a', body: { resourceIds: ['resource-r11-a', 'resource-r11-c'] },
  });
  assert.equal(initialClaim.status, 202);
  const changedElsewhere = await callApi(harness, '/api/admin/recursos/resource-r11-a', {
    method: 'PATCH', session: 'admin', csrf: 'csrf-feedback', body: { category: 'Certificaciones', version: 1 },
  });
  assert.equal(changedElsewhere.status, 200);

  const transact = harness.store.transact.bind(harness.store);
  harness.store.transact = async (operation) => {
    if (operation.puts?.some(({ key }) => key === 'resource:resource-r11-c')) {
      throw new Error('controlled failure after resource A committed');
    }
    return transact(operation);
  };
  const actualPartial = await callApi(harness, '/api/admin/reclamaciones/vincular', {
    method: 'POST', session: 'admin', csrf: 'csrf-feedback',
    body: { accountId: 'private-account-a', resourceIds: ['resource-r11-a', 'resource-r11-c'] },
  });
  assert.equal(actualPartial.status, 503, 'the current service returns the partial-write failure');
  const partialPayload = await actualPartial.clone().json();
  assert.deepEqual(partialPayload.linkedResourceIds, ['resource-r11-a']);
  assert.ok(partialPayload.versionChanges.some((change) => change.entity === 'resource'
    && change.id === 'resource-r11-a' && change.before === 2 && change.after === 3));
  assert.equal((await harness.store.get('resource:resource-r11-b')).version, 1, 'B remains at the version observed by the page');

  const handler = createCreatorHttpHandler({
    service: harness.service,
    auth: { getPrincipal: async () => auth.current },
    origin: SITE_ORIGIN,
  });
  const resourceRecord = (id) => ({
    id, title: id, url: `https://example.com/${id}`, description: '', recordType: 'resource', category: 'Otros',
    kind: 'content', format: 'Artículo', topics: [], published: false, directoryApproval: 'pending',
    directoryControl: 'editorial', hidden: false, version: 1,
  });
  const html = await renderAdminPage({
    claimRecords: [{ id: 'claim-r11', accountId: 'private-account-a', resourceIds: ['resource-r11-a', 'resource-r11-c'], status: 'pending' }],
    resourceRecords: ['resource-r11-a', 'resource-r11-b', 'resource-r11-c'].map(resourceRecord),
  });
  let rejectFirstSave = true;
  const page = await executeAdminScript(html, {
    fetchImpl: async (url, init = {}) => {
      const target = new URL(url, SITE_ORIGIN);
      if (target.pathname === '/api/admin/reclamaciones/vincular/' && init.method === 'POST') return actualPartial;
      if (target.pathname === '/api/admin/recursos/resource-r11-b/' && init.method === 'PATCH' && rejectFirstSave) {
        rejectFirstSave = false;
        return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
      }
      const headers = new Headers(init.headers);
      headers.set('origin', SITE_ORIGIN);
      headers.set('x-test-session', 'admin');
      return handler(new Request(target, { ...init, headers }));
    },
  });
  const claimForm = page.claimForms[0];
  const [linkedA, remainingC] = claimForm.fields;
  const rowA = page.resourcesRows.find(({ id }) => id === 'resource-r11-a');
  const rowB = page.resourcesRows.find(({ id }) => id === 'resource-r11-b');
  const rowAClassification = page.classificationForms.find((form) => form.rowId === 'resource-r11-a');
  const rowBClassification = page.classificationForms.find((form) => form.rowId === 'resource-r11-b');
  assert.ok(rowA && rowB && rowAClassification && rowBClassification);
  rowBClassification.fields[0].value = 'Certificaciones';

  await claimForm.dispatch('submit');
  assert.deepEqual(JSON.parse(page.requests[0].init.body).resourceIds, ['resource-r11-a', 'resource-r11-c']);
  assert.equal(linkedA.checked, true);
  assert.equal(remainingC.checked, true, 'the unresolved claim selection remains available for inspection only');
  assert.equal(claimForm.controls.at(-1).disabled, true, 'the partial request cannot be submitted again before refresh');
  assert.equal(rowAClassification.saveButton.disabled, true, 'the classification form with a receipt gap cannot overwrite stale A');
  assert.equal(rowA.row.controls.filter((control) => control.tagName === 'BUTTON').every((button) => button.disabled), true,
    'administrative actions for A are paused because its current state was not observed');
  assert.equal(rowBClassification.saveButton.disabled, false, 'B remains independently saveable');
  assert.equal(page.sessionRecovery.check.disabled, false, 'the receipt gap does not freeze session recovery');
  assert.equal(page.transition.hidden, false, 'partial-write instructions stay visible');

  await page.refreshButton.dispatch('click');
  assert.equal(page.reloads(), 0, 'the pending B correction still blocks refresh until it is resolved');
  assert.match(page.transition.textContent, /Guarda los cambios pendientes o revierte/);

  await rowBClassification.dispatch('submit');
  assert.equal(page.sessionRecovery.check.hidden, false, 'the simulated expired session exposes recovery');
  assert.equal(page.sessionRecovery.check.disabled, false, 'recovery is available after the partial write');
  assert.equal(rowBClassification.saveButton.disabled, false, 'the unrelated form stays usable after its rejected request');
  auth.current = { state: 'authenticated', accountId: 'admin-feedback', csrfToken: 'csrf-admin-renewed', isAdmin: true };
  await page.sessionRecovery.check.dispatch('click');
  await settleSessionCheck();
  assert.match(page.sessionRecovery.status.textContent, /Sesión comprobada/);
  assert.equal(page.sessionRecovery.check.hidden, true, 'session recovery finishes without requiring a page reload');

  await rowBClassification.dispatch('submit');
  assert.equal(JSON.parse(page.requests.at(-1).init.body).version, 1, 'B uses only its own still-current observed version');
  assert.equal(JSON.parse(page.requests.at(-1).init.body).category, 'Certificaciones');
  assert.equal(page.requests.at(-1).init.headers['x-csrf-token'], 'csrf-admin-renewed');
  assert.equal((await harness.store.get('resource:resource-r11-b')).category, 'Certificaciones', 'the current service persisted B');
  assert.equal(page.reloads(), 1, 'saving the retained B draft enables the safe refresh');
  assert.equal(page.requests.filter(({ url }) => url.includes('/api/admin/reclamaciones/vincular/')).length, 1,
    'the partial claim is not automatically replayed during recovery');
});

test('successful claim resolution pauses its selection and preserves another saveable draft', async () => {
  const html = await renderAdminPage({ claimRecords: [{
    id: 'claim-delayed', accountId: 'owner', resourceIds: ['resource-feedback', 'resource-two'],
    sourceId: 'ana-feedback', status: 'pending',
  }] });
  let releaseClaim;
  const delayedClaim = new Promise((resolve) => { releaseClaim = resolve; });
  let requestNumber = 0;
  const page = await executeAdminScript(html, {
    fetchImpl: async () => {
      requestNumber += 1;
      if (requestNumber === 1) return delayedClaim;
      return Response.json({
        resource: { id: 'resource-feedback', category: 'Certificaciones', kind: 'content', format: 'Artículo', topics: [] },
        versionChanges: [{ entity: 'resource', id: 'resource-feedback', before: 2, after: 3 }],
      });
    },
  });
  const claimForm = page.claimForms[0];
  const [linkedResource, secondResource] = claimForm.fields;
  const classification = page.classificationForms.find((form) => form.rowId === 'resource-feedback');
  assert.ok(classification);
  const [category, kind, format] = classification.fields;

  const resolution = claimForm.dispatch('submit');
  const claimPausedDuringRequest = claimForm.fields.every((control) => control.disabled);
  assert.notEqual(category.disabled, true, 'other form fields remain editable during the request');
  category.value = 'Certificaciones';
  kind.value = 'content';
  format.value = 'Artículo';
  releaseClaim(Response.json({
    linkedResourceIds: ['resource-feedback', 'resource-two'],
    versionChanges: [{ entity: 'resource', id: 'resource-feedback', before: 1, after: 2 }],
  }));
  await resolution;

  assert.equal(claimPausedDuringRequest, true, 'claim choices cannot diverge from the submitted IDs while awaiting the response');
  assert.deepEqual(JSON.parse(page.requests[0].init.body).resourceIds, ['resource-feedback', 'resource-two']);
  assert.equal(linkedResource.checked, true);
  assert.equal(secondResource.checked, true);
  assert.ok(claimForm.fields.every((control) => control.disabled), 'the resolved claim stays frozen until refresh');
  assert.notEqual(category.disabled, true, 'the unrelated classification draft remains usable');

  await classification.dispatch('submit');
  assert.deepEqual(JSON.parse(page.requests[1].init.body), {
    category: 'Certificaciones', kind: 'content', format: 'Artículo', topics: [], version: 2,
  }, 'the unrelated form uses the claim receipt before saving its draft');
  assert.equal(page.requests.length, 2, 'the submitted claim is not replayed while resolving the unrelated draft');
  assert.equal(page.reloads(), 1, 'saving the remaining draft completes the safe refresh');
});

test('invalid initial admin data exposes its recovery feedback', async () => {
  const html = await renderAdminPage();
  assert.match(html, /data-admin-status[^>]*hidden/);
  const page = await executeAdminScript(html, { initialData: 'invalid JSON' });
  assert.equal(page.adminStatus.hidden, false, 'the admin error is visible after script validation fails');
  assert.match(page.adminStatus.textContent, /No pudimos leer los datos de administración/);
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

test('R12 successful claim receipt gap pauses only the stale row and preserves B through session recovery', async () => {
  const auth = { current: { state: 'authenticated', accountId: 'admin-feedback', csrfToken: 'csrf-feedback', isAdmin: true } };
  const creator = { state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-a', isAdmin: false };
  const harness = await createCreatorPagesHarness({
    authenticate: async (request) => request.headers.get('x-test-session') === 'admin' ? auth.current : creator,
  });
  const created = await callApi(harness, '/api/creador/perfil', {
    method: 'PUT', session: 'creator-a', csrf: 'csrf-a',
    body: { displayName: 'Ana', slug: 'ana-admin-r12', programs: [], socials: {} },
  });
  assert.equal(created.status, 200);

  const resourceRecord = (id) => ({
    id, title: id, url: `https://example.com/${id}`, description: '', category: 'Otros',
    kind: 'content', format: 'Artículo', topics: [], order: 1, featured: false, published: false,
    directoryApproval: 'pending', directoryControl: 'editorial', hidden: false, version: 1,
  });
  for (const id of ['resource-r12-a', 'resource-r12-b']) {
    await seedResource(harness.store, resourceRecord(id));
  }
  const claim = await callApi(harness, '/api/creador/reclamaciones', {
    method: 'POST', session: 'creator-a', csrf: 'csrf-a', body: { resourceIds: ['resource-r12-a'] },
  });
  assert.equal(claim.status, 202);
  const changedBeforePageLoad = await callApi(harness, '/api/admin/recursos/resource-r12-a', {
    method: 'PATCH', session: 'admin', csrf: 'csrf-feedback', body: { category: 'Certificaciones', version: 1 },
  });
  assert.equal(changedBeforePageLoad.status, 200);

  const handler = createCreatorHttpHandler({
    service: harness.service,
    auth: { getPrincipal: async () => auth.current },
    origin: SITE_ORIGIN,
  });
  const html = await renderAdminPage({
    claimRecords: [{ id: 'claim-r12', accountId: creator.accountId, resourceIds: ['resource-r12-a'], status: 'pending' }],
    resourceRecords: ['resource-r12-a', 'resource-r12-b'].map(resourceRecord),
  });
  const statuses = [];
  let claimReceipt;
  let expireFirstSave = true;
  const page = await executeAdminScript(html, {
    fetchImpl: async (url, init = {}) => {
      const target = new URL(url, SITE_ORIGIN);
      if (target.pathname === '/api/admin/recursos/resource-r12-b/' && init.method === 'PATCH' && expireFirstSave) {
        expireFirstSave = false;
        statuses.push({ method: init.method, path: target.pathname, status: 401 });
        return Response.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
      }
      const headers = new Headers(init.headers);
      headers.set('origin', SITE_ORIGIN);
      headers.set('x-test-session', 'admin');
      const response = await handler(new Request(target, { ...init, headers }));
      if (target.pathname === '/api/admin/reclamaciones/vincular/' && response.status === 200) {
        claimReceipt = await response.clone().json();
      }
      statuses.push({ method: init.method ?? 'GET', path: target.pathname, status: response.status });
      return response;
    },
  });
  assert.equal(page.sessionBinding, creatorPageSessionBinding(auth.current), 'the rendered page binds recovery to the original admin account and role');

  const claimForm = page.claimForms[0];
  const rowA = page.resourcesRows.find(({ id }) => id === 'resource-r12-a');
  const rowB = page.resourcesRows.find(({ id }) => id === 'resource-r12-b');
  const classificationA = page.classificationForms.find((form) => form.rowId === 'resource-r12-a');
  const classificationB = page.classificationForms.find((form) => form.rowId === 'resource-r12-b');
  assert.ok(claimForm && rowA && rowB && classificationA && classificationB);
  classificationA.fields[0].value = 'Seguridad';
  classificationB.fields[0].value = 'Certificaciones';

  await claimForm.dispatch('submit');
  assert.deepEqual(statuses.map(({ status }) => status), [200], 'the service successfully links A and returns its A2→3 receipt');
  assert.ok(claimReceipt.versionChanges.some((change) => change.entity === 'resource'
    && change.id === 'resource-r12-a' && change.before === 2 && change.after === 3));
  assert.equal((await harness.store.get('resource:resource-r12-a')).version, 3);
  assert.equal(classificationA.fields[0].value, 'Seguridad', 'A keeps the unsubmitted correction after the receipt gap');
  assert.equal(classificationA.saveButton.disabled, true, 'A cannot submit a classification based on the page-observed version 1');
  const actionsA = rowA.row.controls.filter((control) => control.dataset.resourceAction);
  assert.ok(actionsA.length > 0, 'A exposes administrative actions in the rendered row');
  assert.equal(rowA.row.controls.filter((control) => control.tagName === 'BUTTON').every((button) => button.disabled), true,
    'all administrative actions in A are paused until refresh');
  assert.equal(classificationB.fields[0].value, 'Certificaciones');
  assert.equal(classificationB.saveButton.disabled, false, 'B remains independently saveable');

  await classificationB.dispatch('submit');
  assert.deepEqual(statuses.map(({ status }) => status), [200, 401], 'the first B save expires the session without replaying A');
  assert.equal(classificationB.saveButton.disabled, false, 'the rejected B draft remains available');
  auth.current = { state: 'authenticated', accountId: 'admin-feedback', csrfToken: 'csrf-admin-renewed', isAdmin: true };
  await page.sessionRecovery.check.dispatch('click');
  await settleSessionCheck();
  assert.deepEqual(statuses.map(({ status }) => status), [200, 401, 200], 'session recovery checks the session without resending a write');
  assert.match(page.sessionRecovery.status.textContent, /Sesión comprobada/);
  assert.equal(page.sessionRecovery.check.hidden, true);

  await classificationB.dispatch('submit');
  assert.deepEqual(statuses.map(({ status }) => status), [200, 401, 200, 200]);
  assert.deepEqual(JSON.parse(page.requests.at(-1).init.body), {
    category: 'Certificaciones', kind: 'content', format: 'Artículo', topics: [], version: 1,
  }, 'B uses only its own version and its preserved classification draft');
  assert.equal(page.requests.at(-1).init.headers['x-csrf-token'], 'csrf-admin-renewed');
  assert.equal((await harness.store.get('resource:resource-r12-b')).category, 'Certificaciones');
  assert.equal(page.requests.filter(({ url }) => url.includes('/api/admin/reclamaciones/vincular/')).length, 1,
    'the successful claim is never replayed during session recovery or the B save');
});

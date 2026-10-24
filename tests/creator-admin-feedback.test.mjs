import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';

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

async function renderAdminPage() {
  const service = {
    async handle(request) {
      const pathname = new URL(request.url).pathname;
      const data = {
        '/api/admin/recursos': { resources },
        '/api/admin/perfiles': { profiles },
        '/api/admin/reclamaciones': { claims },
      }[pathname];
      return data
        ? Response.json(data)
        : new Response('not found', { status: 404 });
    },
  };
  globalThis.__adminFeedbackTestRuntime = {
    service,
    auth: {
      getPrincipal: async () => ({ state: 'authenticated', isAdmin: true, csrfToken: 'csrf-feedback' }),
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
  constructor({ dataset = {}, status, rowType, rowId, row, controls = [] } = {}) {
    this.dataset = dataset;
    this.status = status;
    this.rowType = rowType;
    this.rowId = rowId;
    this.row = row;
    this.controls = controls;
    this.listeners = new Map();
    this.attributes = new Map();
    this.disabled = false;
    this.textContent = '';
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  querySelector(selector) {
    return selector === '[data-item-status]' ? this.status ?? null : null;
  }

  querySelectorAll(selector) {
    if (selector === 'button' || selector === 'input[name="resourceIds"]') return this.controls;
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
  get() { return null; }
  getAll(name) { return name === 'resourceIds' ? ['resource-feedback'] : []; }
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

async function executeAdminScript(html) {
  const rootAttributes = html.match(/<main\b[^>]*\bdata-csrf="([^"]+)"[^>]*>/)?.[0];
  assert.ok(rootAttributes, 'la página real debe incluir el contenedor y CSRF administrativos');
  const csrf = rootAttributes.match(/\bdata-csrf="([^"]+)"/)?.[1];
  const dataJson = html.match(/<script\b[^>]*id="creator-admin-data"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(dataJson, 'la página real debe emitir el estado para el script administrativo');
  const resourcesRows = renderedRows(html, 'resource', 'data-admin-resource');
  const profileRows = renderedRows(html, 'profile', 'data-admin-profile');
  const claimRows = renderedRows(html, 'claim', 'data-admin-claim');
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
  const claimForms = claimRows.map(({ id }) => new TestForm({
    rowType: 'claim',
    rowId: id,
    row: claimRows.find((entry) => entry.id === id)?.row,
  }));
  const classificationForms = resourcesRows
    .filter(({ html: rowHtml }) => /data-classification-form/.test(rowHtml))
    .map(({ id }) => new TestForm({
      rowType: 'resource', rowId: id,
      row: resourcesRows.find((entry) => entry.id === id)?.row,
    }));
  const rootElement = new TestElement({ dataset: { csrf } });
  rootElement.querySelectorAll = (selector) => ({
    '[data-classification-form]': classificationForms,
    '[data-resource-action]': resourceButtons,
    '[data-profile-action]': profileButtons,
    '[data-claim-resolution]': claimForms,
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
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return new Response('{}', { status: next });
    },
  });
  return { resourcesRows, profileRows, claimRows, resourceButtons, profileButtons, claimForms, responses, requests, reloads: () => reloads };
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
    [401, 'Tu sesión terminó. Inicia sesión y vuelve a intentarlo.'],
    [403, 'Esta cuenta no tiene permiso para completar esta acción.'],
    [409, 'El registro cambió desde la última lectura. Recarga la página antes de volver a guardar.'],
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

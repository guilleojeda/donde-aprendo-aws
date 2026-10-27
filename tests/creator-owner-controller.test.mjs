import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { creatorPageSessionBinding } from '../src/lib/creator-session-context.mjs';
import { createCreatorOwnerRuntime } from './fixtures/creator-owner-runtime.mjs';
import { SITE_ORIGIN } from './fixtures/creator-pages.mjs';

const controllerPath = new URL('../src/scripts/creator-owner.ts', import.meta.url);
const controllerExists = existsSync(controllerPath);
const controllerBlocker = controllerExists
  ? false
  : 'execution blocked: src/scripts/creator-owner.ts has not been implemented; the behavioral cases remain defined below';
const CREATOR_PROGRAMS = ['User Group Leaders', 'Community Builders', 'Heroes'];
const CREATOR_SOCIALS = ['instagram', 'x', 'linkedin', 'awsBuilder', 'website'];
let bundlePromise;

async function controllerBundle() {
  bundlePromise ??= build({
    entryPoints: [controllerPath.pathname],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  }).then(({ outputFiles }) => outputFiles[0].text);
  return bundlePromise;
}

class SurfaceElement {
  constructor({ tagName = 'DIV', name, type, value = '', files = [], dataset = {}, selectors = {}, lists = [] } = {}) {
    this.tagName = tagName.toUpperCase();
    this.name = name;
    this.type = type;
    this.value = value;
    this.files = files;
    this.dataset = { ...dataset };
    this.selectors = { ...selectors };
    this.lists = [...lists];
    this.listeners = new Map();
    this.attributes = new Map();
    this.parentElement = null;
    this.form = null;
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.open = false;
    this.className = '';
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  descendants() {
    const result = [];
    const seen = new Set();
    const visit = (element) => {
      for (const child of element.lists ?? []) {
        if (!(child instanceof SurfaceElement) || seen.has(child)) continue;
        seen.add(child);
        result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  querySelector(selector) {
    return this.selectors[selector] ?? this.descendants().find((item) => item.matches(selector)) ?? null;
  }

  querySelectorAll(selector) {
    return this.descendants().filter((item) => item.matches(selector));
  }

  matches(selector) {
    return selector.split(',').some((part) => this.matchesSimple(part.trim()));
  }

  matchesSimple(selector) {
    const isChecked = selector.includes(':checked');
    const simple = selector.replaceAll(':checked', '').trim();
    const tag = simple.match(/^[a-z][a-z0-9-]*/i)?.[0];
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (isChecked && !this.checked) return false;

    for (const [, expression] of simple.matchAll(/\[([^\]]+)\]/g)) {
      const match = expression.match(/^\s*([\w-]+)\s*(?:(\^=|\$=|\*=|~=|=)\s*(?:"([^"]*)"|'([^']*)'|(.+?)))?\s*$/);
      if (!match) return false;
      const [, attribute, operator, doubleQuoted, singleQuoted, bare] = match;
      const expected = doubleQuoted ?? singleQuoted ?? bare?.trim();
      let actual;
      if (attribute === 'name') actual = this.name;
      else if (attribute === 'type') actual = this.type;
      else if (attribute === 'href') actual = this.getAttribute('href');
      else if (attribute === 'class') actual = this.className;
      else if (attribute.startsWith('data-')) {
        const key = attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        actual = this.dataset[key];
      } else if (attribute === 'disabled') actual = this.disabled ? '' : undefined;
      else actual = this.getAttribute(attribute);

      if (actual === undefined || actual === null) return false;
      if (!operator) continue;
      const value = String(actual);
      if (operator === '=' && value !== expected) return false;
      if (operator === '^=' && !value.startsWith(expected)) return false;
      if (operator === '$=' && !value.endsWith(expected)) return false;
      if (operator === '*=' && !value.includes(expected)) return false;
      if (operator === '~=' && !value.split(/\s+/).includes(expected)) return false;
    }
    return true;
  }

  closest(selector) {
    for (let item = this; item; item = item.parentElement) {
      if (item.matches?.(selector)) return item;
    }
    return null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) {
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    }
  }
  getAttribute(name) {
    if (name.startsWith('data-')) {
      return this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] ?? null;
    }
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name) { return this.getAttribute(name) !== null; }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) {
      delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
    }
  }
  reportValidity() { return true; }
  showModal() { this.open = true; }
  close() { this.open = false; }

  async dispatch(type) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
    };
    const chain = [];
    for (let item = this; item; item = item.parentElement) chain.push(item);
    for (const currentTarget of chain) {
      event.currentTarget = currentTarget;
      for (const listener of currentTarget.listeners.get(type) ?? []) await listener(event);
      if (event.propagationStopped) break;
    }
    return event;
  }
}

class SurfaceFormData {
  constructor(form) {
    this.values = new Map();
    for (const control of form?.elements ?? []) {
      if (!control.name || control.disabled) continue;
      if (control.type === 'checkbox' && !control.checked) continue;
      const value = control.type === 'file' ? (control.files[0] ?? null) : control.value;
      const values = this.values.get(control.name) ?? [];
      values.push(value);
      this.values.set(control.name, values);
    }
  }

  get(name) { return this.values.get(name)?.[0] ?? null; }
  getAll(name) { return [...(this.values.get(name) ?? [])]; }
  append(name, value) {
    const values = this.values.get(name) ?? [];
    values.push(value);
    this.values.set(name, values);
  }
  *entries() {
    for (const [name, values] of this.values) for (const value of values) yield [name, value];
  }
}

function control(name, value = '', options = {}) {
  const element = new SurfaceElement({ tagName: options.tagName ?? 'INPUT', name, value, type: options.type, files: options.files });
  if (options.checked !== undefined) element.checked = options.checked;
  return element;
}

function form(name, fields) {
  const element = new SurfaceElement({ tagName: 'FORM', dataset: { ownerForm: name }, lists: fields });
  element.elements = fields;
  for (const field of fields) field.form = element;
  return element;
}

function ownerSurface({ profile = null, initialData = {}, csrfToken = 'csrf-a', accountId = 'private-account-a', isAdmin = false } = {}) {
  const binding = creatorPageSessionBinding({ accountId, isAdmin });
  const editButtons = ['datos', 'redes', 'foto'].map((name) => new SurfaceElement({
    tagName: 'BUTTON', dataset: { ownerEdit: name },
  }));
  const publishButton = new SurfaceElement({ tagName: 'BUTTON', dataset: { ownerPublish: '' } });
  publishButton.hidden = !profile || profile.published || profile.hidden;
  const createFields = [
    control('displayName', profile?.displayName ?? ''),
    control('slug', profile?.slug ?? ''),
    control('csrfToken', csrfToken, { type: 'hidden' }),
  ];
  const dataFields = [
    control('displayName', profile?.displayName ?? ''),
    control('slug', profile?.slug ?? ''),
    control('city', profile?.city ?? ''),
    control('country', profile?.country ?? ''),
    control('bio', profile?.bio ?? '', { tagName: 'TEXTAREA' }),
    ...CREATOR_PROGRAMS.map((program) => control('programs', program, {
      type: 'checkbox', checked: profile?.programs?.includes(program) ?? false,
    })),
    control('version', String(profile?.version ?? ''), { type: 'hidden' }),
    control('csrfToken', csrfToken, { type: 'hidden' }),
  ];
  const socialFields = [
    ...CREATOR_SOCIALS.map((social) => control(`social-${social}`, profile?.socials?.[social] ?? '')),
    control('version', String(profile?.version ?? ''), { type: 'hidden' }),
    control('csrfToken', csrfToken, { type: 'hidden' }),
  ];
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'profile-photo.png', { type: 'image/png' });
  const photoFields = [control('photo', '', { type: 'file', files: [] }), control('csrfToken', csrfToken, { type: 'hidden' })];
  const createForm = form('crear', createFields);
  const dataForm = form('datos', dataFields);
  const socialForm = form('redes', socialFields);
  const photoForm = form('foto', photoFields);
  const forms = [createForm, dataForm, socialForm, photoForm];
  const dialog = new SurfaceElement({ tagName: 'DIALOG' });
  const status = new SurfaceElement();
  const exitPrompt = new SurfaceElement();
  exitPrompt.hidden = true;
  const cancelButton = new SurfaceElement({ tagName: 'BUTTON', dataset: { ownerCancel: '' } });
  const exitSave = new SurfaceElement({ tagName: 'BUTTON', dataset: { ownerExitSave: '' } });
  const exitDiscard = new SurfaceElement({ tagName: 'BUTTON', dataset: { ownerExitDiscard: '' } });
  const exitContinue = new SurfaceElement({ tagName: 'BUTTON', dataset: { ownerExitContinue: '' } });
  exitSave.hidden = true;
  exitDiscard.hidden = true;
  exitContinue.hidden = true;
  const internalNavigation = new SurfaceElement({ tagName: 'A', dataset: { ownerNavigation: '' } });
  internalNavigation.setAttribute('href', '/cuenta/?vista=estadisticas&periodo=30&pagina=1');
  const sessionShell = new SurfaceElement();
  sessionShell.hidden = true;
  const sessionStatus = new SurfaceElement();
  const signIn = new SurfaceElement({ tagName: 'A' });
  signIn.hidden = true;
  const checkSession = new SurfaceElement({ tagName: 'BUTTON' });
  checkSession.hidden = true;
  dialog.lists = [...forms, cancelButton, exitPrompt];
  exitPrompt.lists = [exitSave, exitDiscard, exitContinue];
  const root = new SurfaceElement({
    dataset: { csrf: csrfToken, csrfToken, sessionBinding: binding, profileVersion: String(profile?.version ?? '') },
    selectors: {
      '[data-owner-dialog]': dialog,
      '[data-owner-status]': status,
      '[data-owner-exit-prompt]': exitPrompt,
      '[data-session-recovery-shell]': sessionShell,
      '[data-session-recovery-status]': sessionStatus,
      '[data-session-recovery-sign-in]': signIn,
      '[data-session-recovery-check]': checkSession,
    },
    lists: [
      ...editButtons,
      publishButton,
      dialog,
      internalNavigation,
      sessionShell,
      sessionStatus,
      signIn,
      checkSession,
    ],
  });
  dialog.parentElement = root;
  for (const item of [...editButtons, publishButton, internalNavigation, sessionShell, sessionStatus, signIn, checkSession]) item.parentElement = root;
  for (const item of [...forms, cancelButton, exitPrompt]) item.parentElement = dialog;
  for (const item of [exitSave, exitDiscard, exitContinue]) item.parentElement = exitPrompt;
  for (const item of forms) for (const field of item.elements) field.parentElement = item;
  const dataScript = new SurfaceElement();
  dataScript.textContent = JSON.stringify({
    profile,
    links: [],
    editableResources: [],
    claims: [],
    series: [],
    csrfToken,
    sessionBinding: binding,
    ...initialData,
  });
  const document = {
    activeElement: null,
    querySelector(selector) {
      return selector === '[data-creator-owner]' || selector === '[data-owner-root]' ? root
        : selector === '#creator-owner-data' ? dataScript : null;
    },
    querySelectorAll() { return []; },
    getElementById(id) { return id === 'creator-owner-data' ? dataScript : null; },
    addEventListener(type, listener) { documentListeners.set(type, listener); },
  };
  const documentListeners = new Map();
  document.listeners = documentListeners;
  root.parentElement = document;
  const window = {
    location: { href: `${SITE_ORIGIN}/cuenta/`, pathname: '/cuenta/', search: '', hash: '', assign() {}, reload() {} },
    history: { pushState() {}, replaceState() {}, back() {} },
    addEventListener() {},
    requestAnimationFrame(callback) { callback(); },
  };
  return {
    root,
    profile,
    forms: { create: createForm, datos: dataForm, redes: socialForm, foto: photoForm },
    controls: { createFields, dataFields, socialFields, photoFields, editButtons, publishButton, cancelButton, internalNavigation, exitPrompt, exitSave, exitDiscard, exitContinue, dialog, status, sessionShell, sessionStatus, signIn, checkSession, file },
    document,
    window,
    documentListeners,
  };
}

async function mount({ runtime, surface, fetch, session = 'creator-a' }) {
  const requests = [];
  const wrappedFetch = async (input, init = {}) => {
    const target = new URL(String(input), SITE_ORIGIN);
    const pathname = target.pathname.replace(/\/$/, '');
    const options = { ...init };
    const headers = new Headers(options.headers);
    if (options.method && options.method !== 'GET' && !headers.has('origin')) {
      headers.set('origin', SITE_ORIGIN);
    }
    options.headers = headers;
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    const request = { path: pathname, method: options.method ?? 'GET', body, headers: new Headers(headers) };
    requests.push(request);
    const response = fetch ? await fetch(pathname, options, request)
      : await runtime.fetchApi(pathname, options, { session });
    request.status = response.status;
    return response;
  };
  runInNewContext(await controllerBundle(), {
    document: surface.document,
    window: surface.window,
    Element: SurfaceElement,
    HTMLElement: SurfaceElement,
    HTMLFormElement: SurfaceElement,
    HTMLDialogElement: SurfaceElement,
    FormData: SurfaceFormData,
    Response,
    Request,
    Headers,
    URL,
    File,
    Blob,
    TextEncoder,
    fetch: wrappedFetch,
    setTimeout,
    clearTimeout,
    queueMicrotask,
  });
  return requests;
}

async function createServiceProfile(runtime, overrides = {}) {
  const response = await runtime.fetchApi('/api/creador/perfil/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-a', 'origin': SITE_ORIGIN },
    body: JSON.stringify({
      displayName: 'Ana Original', slug: 'ana-original', city: 'Córdoba', country: 'Argentina',
      bio: 'Biografía inicial.', programs: ['User Group Leaders', 'Community Builders'],
      socials: {
        instagram: 'https://instagram.example.invalid/ana',
        x: 'https://x.example.invalid/ana',
        linkedin: 'https://www.linkedin.com/in/ana-original',
        awsBuilder: 'https://builder.aws.example.invalid/ana',
        website: 'https://ana.example.invalid',
      },
      ...overrides,
    }),
  }, { session: 'creator-a' });
  assert.equal(response.status, 200);
  return (await response.json()).profile;
}

async function settle() { await new Promise((resolve) => setTimeout(resolve, 0)); }

function mutations(requests) {
  return requests.filter(({ method }) => method !== 'GET' && method !== 'HEAD');
}

function behaviorTest(name, callback) {
  // Bound pending test gates; this is not a product latency requirement.
  test(name, { skip: controllerBlocker, timeout: 10_000 }, callback);
}

test('el controlador owner puede compilarse para ejecutar sus casos de aceptación', async () => {
  assert.ok(controllerExists, 'execution blocked: required controller src/scripts/creator-owner.ts is absent');
  await controllerBundle();
});

behaviorTest('crear perfil guarda borrador, sugiere slug hasta edición manual y publica sólo por intención explícita', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const surface = ownerSurface();
  const requests = await mount({ runtime, surface });
  const [name, slug] = surface.controls.createFields;
  name.value = 'Ana de Lambda';
  await name.dispatch('input');
  assert.equal(slug.value, 'ana-de-lambda', 'the name supplies a slug while it remains untouched');
  slug.value = 'ana-lambda-personal';
  await slug.dispatch('input');
  name.value = 'Ana cambia su nombre';
  await name.dispatch('input');
  assert.equal(slug.value, 'ana-lambda-personal', 'manually edited slug is no longer coupled to the name');
  const writesBeforeSubmit = runtime.pages.store.calls.filter(({ operation }) => operation === 'transact').length;
  assert.equal(writesBeforeSubmit, 0, 'typing does not autosave');

  await surface.forms.create.dispatch('submit');
  await settle();
  let writes = mutations(requests);
  assert.equal(writes.length, 1, 'creating the draft uses one profile write');
  assert.equal(writes[0].path, '/api/creador/perfil');
  assert.equal(writes[0].method, 'PUT');
  assert.equal(writes[0].headers.get('x-csrf-token'), 'csrf-a', 'the controller sends its current CSRF token');
  assert.deepEqual(Object.keys(writes[0].body).sort(), ['displayName', 'slug'],
    'first entry sends only the two required fields; CSRF stays in a request header');
  assert.equal(writes[0].body.displayName, 'Ana cambia su nombre');
  assert.equal(writes[0].body.slug, 'ana-lambda-personal');
  const saved = await runtime.fetchApi('/api/creador/perfil/', {}, { session: 'creator-a' });
  const model = await saved.json();
  assert.equal(model.profile.published, false, 'saving the first profile does not publish it');
  assert.equal(model.profile.displayName, 'Ana cambia su nombre');
  assert.equal(model.profile.slug, 'ana-lambda-personal');
  assert.equal(surface.controls.publishButton.hidden, false, 'publication is offered as a separate next action');
  await surface.controls.publishButton.dispatch('click');
  await settle();
  writes = mutations(requests);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].path, '/api/creador/perfil/publicar');
  assert.equal(writes[1].method, 'POST', 'publication uses its explicit service command');
  assert.equal(writes[1].body.version, model.profile.version);
  const published = await runtime.fetchApi('/api/creador/perfil/', {}, { session: 'creator-a' });
  assert.equal((await published.json()).profile.published, true);
  assert.equal(runtime.pages.store.calls.filter(({ operation }) => operation === 'transact').length, 2,
    'draft creation and explicit publication are separate writes');
});

behaviorTest('una corrección durante la creación inicial se conserva y el reintento actualiza el perfil ya creado', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const surface = ownerSurface();
  let release;
  let started;
  const began = new Promise((resolve) => { started = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  let delayFirst = true;
  const requests = await mount({ runtime, surface, fetch: async (pathname, options) => {
    const response = await runtime.fetchApi(pathname, options);
    if (options.method === 'PUT' && delayFirst) {
      delayFirst = false;
      started();
      await pending;
    }
    return response;
  } });
  const [name, slug] = surface.controls.createFields;
  name.value = 'Ana enviada';
  slug.value = 'ana-enviada';
  await slug.dispatch('input');
  const firstSubmit = surface.forms.create.dispatch('submit');
  await began;
  name.value = 'Ana corregida durante la creación';
  await name.dispatch('input');
  release();
  await firstSubmit;
  await settle();
  assert.equal(mutations(requests).length, 1, 'a later correction never creates an automatic second write');
  assert.equal(name.value, 'Ana corregida durante la creación');
  const created = (await (await runtime.fetchApi('/api/creador/perfil/')).json()).profile;
  assert.equal(created.displayName, 'Ana enviada', 'only the submitted snapshot was committed');
  assert.equal(created.published, false);

  await surface.forms.create.dispatch('submit');
  await settle();
  const writes = mutations(requests);
  assert.equal(writes.length, 2);
  assert.equal(writes[1].body.version, created.version,
    'the retained first-entry correction uses the created profile version instead of creating again');
  assert.equal(writes[1].body.displayName, 'Ana corregida durante la creación');
  const updated = (await (await runtime.fetchApi('/api/creador/perfil/')).json()).profile;
  assert.equal(updated.id, created.id);
  assert.equal(updated.displayName, 'Ana corregida durante la creación');
  assert.equal(updated.slug, 'ana-enviada', 'the manually chosen slug remains independent');
  assert.equal(updated.published, false);
});

behaviorTest('datos y redes guardan su unidad, conservan campos omitidos y no escriben al editar', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const profile = await createServiceProfile(runtime);
  const surface = ownerSurface({ profile });
  const requests = await mount({ runtime, surface });
  const [dataButton, socialButton] = surface.controls.editButtons;

  await dataButton.dispatch('click');
  assert.equal(surface.controls.dialog.open, true, 'editing requests the contextual dialog');
  const data = surface.controls.dataFields;
  data.find((field) => field.name === 'bio').value = 'Biografía actualizada.';
  data.find((field) => field.name === 'city').value = 'Rosario';
  const selectedPrograms = ['User Group Leaders', 'Community Builders', 'Heroes'];
  for (const checkbox of data.filter((field) => field.name === 'programs')) {
    checkbox.checked = selectedPrograms.includes(checkbox.value);
  }
  await data.find((field) => field.name === 'bio').dispatch('input');
  assert.equal(mutations(requests).length, 0, 'opening and editing a section does not autosave');
  await surface.forms.datos.dispatch('submit');
  await settle();
  assert.equal(surface.controls.dialog.open, false, 'a confirmed save without later edits closes its editor');
  let writes = mutations(requests);
  assert.equal(writes.length, 1);
  assert.ok(!Object.hasOwn(writes[0].body, 'socials'), 'the data write omits the networks unit');
  assert.ok(!Object.hasOwn(writes[0].body, 'photo'), 'the data write omits the photo unit');
  assert.deepEqual(writes[0].body.programs, selectedPrograms,
    'FormData.getAll preserves every selected program checkbox');
  assert.equal(writes[0].body.version, profile.version);
  let model = await (await runtime.fetchApi('/api/creador/perfil/', {}, { session: 'creator-a' })).json();
  assert.equal(model.profile.bio, 'Biografía actualizada.');
  assert.equal(model.profile.city, 'Rosario');
  assert.deepEqual(model.profile.programs, selectedPrograms);
  assert.deepEqual(model.profile.socials, profile.socials, 'omitted networks remain stored');
  assert.equal(model.profile.country, profile.country, 'omitted location fields remain stored');

  await socialButton.dispatch('click');
  assert.equal(surface.controls.dialog.open, true);
  const social = surface.controls.socialFields;
  social.find((field) => field.name === 'social-instagram').value = 'https://instagram.example.invalid/ana-nueva';
  social.find((field) => field.name === 'social-x').value = '';
  await social.find((field) => field.name === 'social-instagram').dispatch('input');
  assert.equal(mutations(requests).length, 1, 'editing networks still has not written');
  await surface.forms.redes.dispatch('submit');
  await settle();
  writes = mutations(requests);
  assert.equal(writes.length, 2, 'the second unit creates one additional write');
  assert.deepEqual(Object.keys(writes[1].body).sort(), ['socials', 'version']);
  const savedSocials = writes[1].body.socials;
  assert.ok(!Object.hasOwn(savedSocials, 'x') || savedSocials.x === '',
    'clearing an optional network sends either an omitted or empty value');
  for (const [name, value] of Object.entries({
    instagram: 'https://instagram.example.invalid/ana-nueva',
    linkedin: profile.socials.linkedin,
    awsBuilder: profile.socials.awsBuilder,
    website: profile.socials.website,
  })) assert.equal(savedSocials[name], value, `${name} is included in the unit payload`);
  model = await (await runtime.fetchApi('/api/creador/perfil/', {}, { session: 'creator-a' })).json();
  assert.equal(model.profile.socials.instagram, 'https://instagram.example.invalid/ana-nueva');
  assert.equal(Object.hasOwn(model.profile.socials, 'x'), false, 'an empty optional network is removed');
  assert.equal(model.profile.socials.linkedin, profile.socials.linkedin, 'unchanged network fields survive');
  assert.equal(model.profile.socials.awsBuilder, profile.socials.awsBuilder);
  assert.equal(model.profile.socials.website, profile.socials.website);
  assert.equal(model.profile.bio, 'Biografía actualizada.', 'saving networks preserves the data unit');
  assert.equal(runtime.pages.store.calls.filter(({ operation }) => operation === 'transact').length, 3,
    'one initial profile create and two contextual saves produced three writes');
});

behaviorTest('la foto seleccionada queda disponible cuando falla la intención de carga', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const profile = await createServiceProfile(runtime);
  const surface = ownerSurface({ profile });
  const requests = await mount({ runtime, surface, fetch: async () => {
    return Response.json({ error: 'PHOTO_TEMPORARILY_UNAVAILABLE' }, { status: 503 });
  } });
  await surface.controls.editButtons[2].dispatch('click');
  assert.equal(surface.controls.dialog.open, true);
  const fileInput = surface.controls.photoFields[0];
  fileInput.files = [surface.controls.file];
  await surface.forms.foto.dispatch('submit');
  await settle();
  const writes = mutations(requests);
  assert.equal(writes.length, 1, 'the photo action starts one upload request before the controlled failure');
  assert.equal(writes[0].path, '/api/creador/foto/autorizar');
  assert.equal(writes[0].method, 'POST');
  assert.equal(fileInput.files[0], surface.controls.file,
    'failure leaves the same File selected for a deliberate retry');
  assert.equal(surface.controls.dialog.open, true, 'an upload error keeps its editor available');
});

behaviorTest('un fallo de escritura mantiene la corrección local abierta y no confirma datos no guardados', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const profile = await createServiceProfile(runtime);
  const surface = ownerSurface({ profile });
  const requests = await mount({ runtime, surface, fetch: async () =>
    Response.json({ error: 'TEMPORARILY_UNAVAILABLE' }, { status: 503 }) });
  await surface.controls.editButtons[0].dispatch('click');
  const bio = surface.controls.dataFields.find((field) => field.name === 'bio');
  bio.value = 'Texto pendiente ante el error.';
  await bio.dispatch('input');
  await surface.forms.datos.dispatch('submit');
  await settle();
  assert.equal(mutations(requests).length, 1);
  assert.equal(bio.value, 'Texto pendiente ante el error.');
  assert.match(surface.controls.status.textContent, /no pudimos|inténtalo|error/i);
  const current = await runtime.pages.store.get(`profile:${profile.id}`);
  assert.equal(current.bio, profile.bio, 'the failed request leaves the saved profile unchanged');
  assert.equal(current.version, profile.version, 'the failed request does not advance its version');
});

behaviorTest('un conflicto conserva valores y versión observada hasta revisión explícita', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const profile = await createServiceProfile(runtime);
  const surface = ownerSurface({ profile });
  const requests = await mount({ runtime, surface });
  const current = await runtime.pages.store.get(`profile:${profile.id}`);
  const updated = { ...current, version: current.version + 1, bio: 'Cambio guardado por otra pestaña.' };
  assert.equal(await runtime.pages.store.transact({
    checks: [{ key: `profile:${profile.id}`, version: current.version }],
    puts: [{ key: `profile:${profile.id}`, value: updated }],
  }), true);

  await surface.controls.editButtons[0].dispatch('click');
  const bio = surface.controls.dataFields.find((field) => field.name === 'bio');
  bio.value = 'Corrección local que no se debe perder.';
  await bio.dispatch('input');
  await surface.forms.datos.dispatch('submit');
  await settle();
  const writes = mutations(requests);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.version, profile.version, 'the stale form sends only its observed version');
  assert.equal(writes[0].body.bio, 'Corrección local que no se debe perder.');
  assert.equal(writes[0].method, 'PUT', 'the existing profile writer accepts partial unit payloads');
  assert.equal(bio.value, 'Corrección local que no se debe perder.');
  assert.equal(surface.controls.dataFields.find((field) => field.name === 'version').value, String(profile.version),
    'a conflict does not silently adopt the current server version');
  assert.match(surface.controls.status.textContent, /cambió|revis|conflicto/i);
  assert.equal(writes.filter(({ path, method }) => path === '/api/creador/perfil' && method === 'PUT').length, 1,
    'a conflict neither replays the write nor hides a newly adopted version behind a second write');
});

behaviorTest('los cambios escritos durante el request quedan abiertos sin duplicar la escritura', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const profile = await createServiceProfile(runtime);
  const surface = ownerSurface({ profile });
  let release;
  let started;
  const began = new Promise((resolve) => { started = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const requests = await mount({ runtime, surface, fetch: async (_path, options, request) => {
    const response = await runtime.fetchApi(request.path, options, { session: 'creator-a' });
    started();
    await pending;
    return response;
  } });

  await surface.controls.editButtons[0].dispatch('click');
  const bio = surface.controls.dataFields.find((field) => field.name === 'bio');
  bio.value = 'Texto enviado.';
  const firstSubmit = surface.forms.datos.dispatch('submit');
  await began;
  const concurrentSubmit = surface.forms.datos.dispatch('submit');
  await settle();
  assert.equal(mutations(requests).length, 1, 'an active write prevents a second submission');
  bio.value = 'Corrección llegada durante la escritura.';
  await bio.dispatch('input');
  release();
  await Promise.all([firstSubmit, concurrentSubmit]);

  const writes = mutations(requests);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.bio, 'Texto enviado.');
  const model = await (await runtime.fetchApi('/api/creador/perfil/', {}, { session: 'creator-a' })).json();
  assert.equal(model.profile.bio, 'Texto enviado.', 'the server confirms the values captured for this write');
  assert.equal(bio.value, 'Corrección llegada durante la escritura.', 'late edits remain in the open form');
  assert.equal(surface.controls.dialog.open, true, 'confirming the submitted snapshot keeps later edits open');
  assert.equal(runtime.pages.store.calls.filter(({ operation }) => operation === 'transact').length, 2,
    'late changes do not create a second or automatic write');
});

behaviorTest('401/CSRF no reproducen la escritura; tras comprobar la misma cuenta/rol el reintento manual persiste', async () => {
  for (const failure of [401, 403]) {
    const runtime = await createCreatorOwnerRuntime();
    runtime.setSession('creator-a');
    const profile = await createServiceProfile(runtime);
    const surface = ownerSurface({ profile, csrfToken: failure === 403 ? 'csrf-stale' : 'csrf-a' });
    const activeSession = 'creator-a';
    let rejectFirstWrite = true;
    const requests = await mount({ runtime, surface, session: 'creator-a', fetch: async (pathname, options) => {
      if (failure === 401 && pathname === '/api/creador/perfil' && options.method === 'PUT' && rejectFirstWrite) {
        rejectFirstWrite = false;
        return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
      }
      return runtime.fetchApi(pathname, options, { session: activeSession });
    } });

    await surface.controls.editButtons[0].dispatch('click');
    const bio = surface.controls.dataFields.find((field) => field.name === 'bio');
    bio.value = `Corrección conservada ${failure}`;
    await surface.forms.datos.dispatch('submit');
    await settle();
    assert.equal(bio.value, `Corrección conservada ${failure}`);
    assert.equal(surface.controls.signIn.hidden, false);
    assert.equal(surface.controls.checkSession.hidden, false);
    let writes = mutations(requests);
    assert.equal(writes.length, 1, 'the rejected intent reaches the boundary once');
    assert.equal(writes[0].headers.get('x-csrf-token'), failure === 403 ? 'csrf-stale' : 'csrf-a',
      'the test observes the token sent by the controller without replacing it');
    const beforeManualRetry = await runtime.pages.store.get(`profile:${profile.id}`);
    assert.equal(beforeManualRetry.bio, profile.bio);

    await surface.controls.checkSession.dispatch('click');
    await settle();
    const checks = requests.filter(({ path, method }) => path === '/api/creador/sesion' && method === 'GET');
    assert.equal(checks.length, 1, 'recovery only checks the existing session');
    assert.equal(checks[0].headers.get('x-creator-page-binding'), surface.root.dataset.sessionBinding);
    assert.equal(checks[0].status, 200, 'the original account and role pass the session check');
    assert.equal(mutations(requests).length, 1,
      'session recovery never replays the pending profile write');
    assert.equal(bio.value, `Corrección conservada ${failure}`);
    await surface.forms.datos.dispatch('submit');
    await settle();
    writes = mutations(requests);
    assert.equal(writes.length, 2, 'the user performs the second write manually');
    assert.equal(writes[1].headers.get('x-csrf-token'), 'csrf-a', 'manual retry uses the verified fresh token');
    const saved = await (await runtime.fetchApi('/api/creador/perfil/', {}, { session: 'creator-a' })).json();
    assert.equal(saved.profile.bio, `Corrección conservada ${failure}`, 'the manual retry persists the retained correction');
  }
});

behaviorTest('cambiar a otra cuenta o al mismo usuario con otro rol bloquea el reintento sin mutaciones', async () => {
  const changedSessions = [
    { label: 'otra cuenta', id: 'creator-b', principal: undefined },
    {
      label: 'otro rol',
      id: 'same-account-admin',
      principal: { state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-admin-role', isAdmin: true },
    },
  ];
  for (const changed of changedSessions) {
    const runtime = await createCreatorOwnerRuntime();
    runtime.setSession('creator-a');
    runtime.setSession('creator-b');
    if (changed.principal) runtime.setSession(changed.id, { principal: changed.principal });
    const profile = await createServiceProfile(runtime);
    const surface = ownerSurface({ profile });
    let rejectFirstWrite = true;
    const requests = await mount({ runtime, surface, fetch: async (pathname, options) => {
      if (pathname === '/api/creador/perfil' && options.method === 'PUT' && rejectFirstWrite) {
        rejectFirstWrite = false;
        return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
      }
      return runtime.fetchApi(pathname, options, { session: changed.id });
    } });

    await surface.controls.editButtons[0].dispatch('click');
    const bio = surface.controls.dataFields.find((field) => field.name === 'bio');
    bio.value = `Edición conservada: ${changed.label}`;
    await surface.forms.datos.dispatch('submit');
    await settle();
    assert.equal(mutations(requests).length, 1);
    await surface.controls.checkSession.dispatch('click');
    await settle();
    const check = requests.find(({ path, method }) => path === '/api/creador/sesion' && method === 'GET');
    assert.ok(check, 'the page checks the current session before allowing another write');
    assert.equal(check.status, 409);
    assert.equal(mutations(requests).length, 1, 'checking changed identity/role does not replay the write');
    assert.match(surface.controls.sessionStatus.textContent, /otra cuenta|permisos/i);

    await surface.forms.datos.dispatch('submit');
    await settle();
    assert.equal(mutations(requests).length, 1, 'a manual attempt remains blocked until the original context returns');
    const saved = await runtime.pages.store.get(`profile:${profile.id}`);
    assert.equal(saved.bio, profile.bio);
    assert.equal(saved.version, profile.version);
    assert.equal(bio.value, `Edición conservada: ${changed.label}`);
  }
});

behaviorTest('salir de una corrección ofrece guardar, descartar o seguir; el slug actualizado conserva su alias', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  const profile = await createServiceProfile(runtime);
  await runtime.fetchApi('/api/creador/perfil/publicar/', {
    method: 'POST', headers: { 'content-type': 'application/json', 'origin': SITE_ORIGIN, 'x-csrf-token': 'csrf-a' }, body: '{}',
  }, { session: 'creator-a' });
  const published = await (await runtime.fetchApi('/api/creador/perfil/', {}, { session: 'creator-a' })).json();
  const surface = ownerSurface({ profile: published.profile });
  const requests = await mount({ runtime, surface });
  await surface.controls.editButtons[0].dispatch('click');
  const displayName = surface.controls.dataFields.find((field) => field.name === 'displayName');
  const slug = surface.controls.dataFields.find((field) => field.name === 'slug');
  displayName.value = 'Ana Nueva';
  slug.value = 'ana-nueva';
  await displayName.dispatch('input');
  await surface.controls.cancelButton.dispatch('click');
  assert.equal(surface.controls.exitPrompt.hidden, false);
  assert.equal(surface.controls.exitSave.hidden, false);
  assert.equal(surface.controls.exitDiscard.hidden, false);
  assert.equal(surface.controls.exitContinue.hidden, false);
  await surface.controls.exitContinue.dispatch('click');
  assert.equal(surface.controls.dialog.open, true);
  assert.equal(displayName.value, 'Ana Nueva');
  const navigationEvent = await surface.controls.internalNavigation.dispatch('click');
  assert.equal(navigationEvent.defaultPrevented, true, 'dirty internal navigation waits for an explicit choice');
  assert.equal(surface.controls.exitPrompt.hidden, false);
  await surface.controls.exitDiscard.dispatch('click');
  assert.equal(surface.controls.dialog.open, false);
  assert.equal(displayName.value, profile.displayName, 'discard abandons only the local correction');

  await surface.controls.editButtons[0].dispatch('click');
  displayName.value = 'Ana Nueva';
  slug.value = 'ana-nueva';
  await displayName.dispatch('input');
  await surface.controls.cancelButton.dispatch('click');
  await surface.controls.exitSave.dispatch('click');
  await settle();
  const writes = mutations(requests);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].body.slug, 'ana-nueva');
  const oldAlias = await runtime.pages.service.readPublicProfile(profile.slug);
  assert.equal(oldAlias.status, 308);
  assert.equal(new URL(oldAlias.redirectTo, SITE_ORIGIN).pathname, '/c/ana-nueva/');
  assert.equal(surface.controls.dialog.open, false);
});

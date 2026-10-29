import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import sharp from 'sharp';
import { build } from 'esbuild';
import { creatorPageSessionBinding } from '../src/lib/creator-session-context.mjs';
import { createCreatorHttpHandler } from '../src/lib/creator-http.mjs';
import { createCreatorOwnerRuntime } from './fixtures/creator-owner-runtime.mjs';
import { loadCreatorPhotosModule } from './fixtures/creator-photos.mjs';
import { SITE_ORIGIN } from './fixtures/creator-pages.mjs';

const controllerPath = new URL('../src/scripts/creator-owner.ts', import.meta.url);
const uploadOrigin = 'https://creator-photo-upload.example.invalid';
let bundlePromise;
let fileBytesPromise;

function controllerBundle() {
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

async function photoBytes() {
  fileBytesPromise ??= sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 48, g: 108, b: 181 } },
  }).png().toBuffer();
  return fileBytesPromise;
}

class SurfaceElement {
  constructor({ tagName = 'DIV', name, type, value = '', files = [], dataset = {}, children = [], selectors = {} } = {}) {
    this.tagName = tagName.toUpperCase();
    this.name = name;
    this.type = type;
    this._value = value;
    this.files = [...files];
    this.dataset = { ...dataset };
    this.children = [...children];
    this.selectors = new Map(Object.entries(selectors));
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
    this.classList = {
      add: (name) => { this.className = [...new Set(`${this.className} ${name}`.trim().split(/\s+/))].join(' '); },
      remove: (name) => { this.className = this.className.split(/\s+/).filter((item) => item !== name).join(' '); },
    };
    this.children.forEach((child) => { child.parentElement = this; });
  }

  get value() { return this._value; }
  set value(next) {
    this._value = String(next);
    if (this.type === 'file' && this._value === '') this.files = [];
  }

  append(child) {
    this.children.push(child);
    child.parentElement = this;
  }

  descendants() {
    const result = [];
    const visit = (parent) => {
      for (const child of parent.children) {
        if (!(child instanceof SurfaceElement) || result.includes(child)) continue;
        result.push(child);
        visit(child);
      }
    };
    visit(this);
    return result;
  }

  querySelector(selector) {
    return this.selectors.get(selector) ?? this.descendants().find((item) => item.matches(selector)) ?? null;
  }

  querySelectorAll(selector) {
    return this.descendants().filter((item) => item.matches(selector));
  }

  matches(selector) {
    return selector.split(',').some((part) => this.matchesSimple(part.trim()));
  }

  matchesSimple(selector) {
    const negativeType = selector.match(/:not\(\[type=["']?([^"')]+)["']?\]\)/)?.[1];
    const simple = selector.replace(/:not\([^)]*\)/g, '').trim();
    const tag = simple.match(/^[a-z][a-z0-9-]*/i)?.[0];
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (negativeType && this.type === negativeType) return false;
    for (const [, expression] of simple.matchAll(/\[([^\]]+)\]/g)) {
      const match = expression.match(/^\s*([\w-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(.+?)))?\s*$/);
      if (!match) return false;
      const [, name, doubleQuoted, singleQuoted, bare] = match;
      const expected = doubleQuoted ?? singleQuoted ?? bare?.trim();
      let actual;
      if (name === 'name') actual = this.name;
      else if (name === 'type') actual = this.type;
      else if (name === 'disabled') actual = this.disabled ? '' : undefined;
      else if (name === 'class') actual = this.className;
      else if (name === 'src' || name === 'href') actual = this.getAttribute(name);
      else if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        actual = this.dataset[key];
      } else actual = this.getAttribute(name);
      if (actual === undefined || actual === null) return false;
      if (expected !== undefined && String(actual) !== expected) return false;
    }
    return true;
  }

  closest(selector) {
    for (let item = this; item; item = item.parentElement) {
      if (item.matches?.(selector)) return item;
    }
    return null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async dispatch(type) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
    };
    for (let item = this; item; item = item.parentElement) {
      event.currentTarget = item;
      for (const listener of item.listeners.get(type) ?? []) await listener(event);
      if (event.propagationStopped) break;
    }
    return event;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
  }

  getAttribute(name) {
    if (name === 'disabled') return this.disabled ? '' : null;
    if (name.startsWith('data-')) return this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] ?? null;
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) { return this.getAttribute(name) !== null; }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) delete this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())];
  }

  reportValidity() { return true; }
  setCustomValidity() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() {}
}

class SurfaceFormData {
  constructor(form) {
    this.values = new Map();
    for (const control of form?.elements ?? []) {
      if (!control.name || control.disabled) continue;
      if (control.type === 'checkbox' && !control.checked) continue;
      this.append(control.name, control.type === 'file' ? control.files[0] ?? null : control.value);
    }
  }

  append(name, value) {
    const values = this.values.get(name) ?? [];
    values.push(value);
    this.values.set(name, values);
  }

  get(name) { return this.values.get(name)?.[0] ?? null; }
  getAll(name) { return [...(this.values.get(name) ?? [])]; }
  *entries() { for (const [name, values] of this.values) for (const value of values) yield [name, value]; }
}

function control({ name, tagName = 'INPUT', type, value = '', files = [], dataset = {}, children = [] } = {}) {
  return new SurfaceElement({ tagName, name, type, value, files, dataset, children });
}

function makeForm(name, controls = []) {
  const form = new SurfaceElement({ tagName: 'FORM', dataset: { ownerForm: name }, children: controls });
  form.elements = controls;
  for (const item of controls) item.form = form;
  return form;
}

async function ownerSurface(profile, csrfToken = 'csrf-a') {
  const binding = creatorPageSessionBinding({ accountId: 'private-account-a', isAdmin: false });
  const file = new File([await photoBytes()], 'new-profile-photo.png', { type: 'image/png' });
  const fileInput = control({ name: 'photo', type: 'file' });
  const checkPhoto = control({ tagName: 'BUTTON', dataset: { ownerCheckPhoto: '' } });
  checkPhoto.hidden = true;
  const photoStatus = control({ dataset: { ownerFormStatus: 'foto' } });
  const cancelButton = control({ tagName: 'BUTTON', dataset: { ownerCancel: '' } });
  const photoForm = makeForm('foto', [fileInput, checkPhoto, photoStatus, cancelButton]);
  const forms = ['crear', 'datos', 'redes'].map((name) => makeForm(name));
  const exitDiscard = control({ tagName: 'BUTTON', dataset: { ownerExitDiscard: '' } });
  exitDiscard.hidden = true;
  const exitPrompt = control({ dataset: { ownerExitPrompt: '' }, children: [exitDiscard] });
  exitPrompt.hidden = true;
  const dialog = control({ tagName: 'DIALOG', children: [...forms, photoForm, exitPrompt] });
  const editPhoto = control({ tagName: 'BUTTON', dataset: { ownerEdit: 'foto' } });
  const pageStatus = control({ dataset: { ownerStatus: '' } });
  const sessionShell = control({ dataset: { sessionRecoveryShell: '' } });
  sessionShell.hidden = true;
  const sessionStatus = control({ dataset: { sessionRecoveryStatus: '' } });
  sessionStatus.hidden = true;
  const signIn = control({ tagName: 'A', dataset: { sessionRecoverySignIn: '' } });
  signIn.hidden = true;
  const checkSession = control({ tagName: 'BUTTON', dataset: { sessionRecoveryCheck: '' } });
  checkSession.hidden = true;
  const publicArea = control({ dataset: { ownerPublic: '' } });
  const publicLink = control({ tagName: 'A', dataset: { ownerPublicLink: '' } });
  publicLink.hidden = true;
  const copyButton = control({ tagName: 'BUTTON', dataset: { ownerCopy: '' } });
  const publishButton = control({ tagName: 'BUTTON', dataset: { ownerPublish: '' } });
  const photoImage = control({ tagName: 'IMG', dataset: { ownerPhoto: '' } });
  photoImage.hidden = !profile.photo;
  if (profile.photo?.version !== undefined) {
    photoImage.setAttribute('src', `/media/fotos/${profile.id}/${profile.photo.version}.webp`);
  }
  const photoPreview = control({ tagName: 'IMG', dataset: { ownerPhotoPreview: '' } });
  photoPreview.hidden = !profile.photo;
  const avatarImage = control({ tagName: 'IMG', dataset: { ownerAvatar: '' } });
  avatarImage.hidden = !profile.photo;
  const profileNodes = new Map([
    ['[data-owner-create-panel]', control()],
    ['[data-owner-profile]', control()],
    ['[data-owner-name]', control()],
    ['[data-owner-slug]', control()],
    ['[data-owner-location]', control()],
    ['[data-owner-programs]', control()],
    ['[data-owner-bio]', control()],
    ['[data-owner-state]', control()],
    ['[data-owner-public-copy]', control()],
    ['[data-owner-hidden-copy]', control()],
    ['[data-owner-draft-copy]', control()],
    ['[data-owner-no-socials]', control()],
    ['[data-owner-avatar-initial]', control()],
    ['[data-owner-photo-placeholder]', control()],
    ['[data-owner-copy-status]', control()],
    ['[data-owner-profile-status]', control()],
    ['[data-owner-dialog-title]', control()],
  ]);
  const root = new SurfaceElement({
    dataset: { csrf: csrfToken, sessionBinding: binding, profileVersion: String(profile.version) },
    children: [
      editPhoto, pageStatus, sessionShell, sessionStatus, signIn, checkSession,
      dialog, publicArea, publicLink, copyButton, publishButton,
      photoImage, photoPreview, avatarImage, ...profileNodes.values(),
    ],
    selectors: {
      '[data-creator-owner]': null,
      '[data-owner-dialog]': dialog,
      '[data-owner-status]': pageStatus,
      '[data-owner-exit-prompt]': exitPrompt,
      '[data-session-recovery-shell]': sessionShell,
      '[data-session-recovery-status]': sessionStatus,
      '[data-session-recovery-sign-in]': signIn,
      '[data-session-recovery-check]': checkSession,
      '[data-owner-public]': publicArea,
      '[data-owner-public-link]': publicLink,
      '[data-owner-copy]': copyButton,
      '[data-owner-publish]': publishButton,
      '[data-owner-photo]': photoImage,
      '[data-owner-photo-preview]': photoPreview,
      '[data-owner-avatar]': avatarImage,
      '[data-owner-check-photo]': checkPhoto,
      '[data-owner-form-status="foto"]': photoStatus,
      ...Object.fromEntries(profileNodes),
    },
  });
  root.selectors.set('[data-creator-owner]', root);
  root.selectors.set('[data-owner-root]', root);
  root.selectors.set('form[data-owner-form="crear"]', forms[0]);
  root.selectors.set('form[data-owner-form="datos"]', forms[1]);
  root.selectors.set('form[data-owner-form="redes"]', forms[2]);
  root.selectors.set('form[data-owner-form="foto"]', photoForm);
  root.selectors.set('[data-owner-edit="foto"]', editPhoto);
  root.selectors.set('[data-owner-no-socials]', profileNodes.get('[data-owner-no-socials]'));
  const data = new SurfaceElement();
  data.textContent = JSON.stringify({ profile, links: [], editableResources: [], claims: [], series: [], csrfToken, sessionBinding: binding });
  const document = {
    activeElement: null,
    querySelector(selector) {
      return selector === '[data-creator-owner]' || selector === '[data-owner-root]' ? root
        : selector === '#creator-owner-data' ? data : null;
    },
    querySelectorAll() { return []; },
    createElement(tagName) { return control({ tagName }); },
    addEventListener() {},
  };
  const window = {
    location: { href: `${SITE_ORIGIN}/cuenta/`, pathname: '/cuenta/', search: '', hash: '', assign() {} },
    history: { pushState() {}, replaceState() {}, back() {} },
    requestAnimationFrame(callback) { callback(); },
    addEventListener() {},
  };
  return { root, forms: { foto: photoForm }, controls: { file, fileInput, checkPhoto, photoStatus, editPhoto, cancelButton, exitDiscard, exitPrompt, dialog, pageStatus, sessionStatus, checkSession, signIn, photoImage }, document, window };
}

async function createHarness({ csrfToken = 'csrf-a', existingPhoto = false } = {}) {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  runtime.setSession('creator-b');
  runtime.setSession('other-role', {
    principal: { state: 'authenticated', accountId: 'private-account-a', csrfToken: 'csrf-other-role', isAdmin: true },
  });
  const created = await runtime.fetchApi('/api/creador/perfil/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: SITE_ORIGIN, 'x-csrf-token': 'csrf-a' },
    body: JSON.stringify({ displayName: 'Ana Original', slug: 'ana-original', city: 'Córdoba', country: 'Argentina', bio: 'Perfil inicial.', programs: [], socials: {} }),
  }, { session: 'creator-a' });
  assert.equal(created.status, 200);
  let profile = (await created.json()).profile;

  const { createCreatorPhotoService } = await loadCreatorPhotosModule();
  const objects = new Map();
  const getObject = async (key) => objects.has(key) ? Buffer.from(objects.get(key)) : null;
  const photoObjects = {
    async get(key) { return getObject(key); },
    async put(key, bytes) { objects.set(key, Buffer.from(bytes)); },
    async delete(key) { objects.delete(key); },
    seed(key, bytes) { objects.set(key, Buffer.from(bytes)); },
  };
  let uploadSequence = 0;
  const photos = createCreatorPhotoService({
    store: runtime.pages.store,
    objects: photoObjects,
    signPost: async ({ key }) => ({ url: `${uploadOrigin}/upload`, fields: { key, policy: 'local-test-policy' } }),
    now: () => Date.UTC(2026, 9, 27, 12),
    createId: () => `owner-photo-${++uploadSequence}`,
  });
  const http = createCreatorHttpHandler({ service: runtime.service, photos, auth: runtime.auth, store: runtime.pages.store, origin: SITE_ORIGIN });

  if (existingPhoto) {
    const bytes = await photoBytes();
    const upload = await photos.beginUpload({ profileId: profile.id, expectedVersion: profile.version });
    photoObjects.seed(upload.post.fields.key, bytes);
    await photos.finalizeUpload({ profileId: profile.id, uploadId: upload.uploadId, expectedVersion: profile.version });
    const response = await runtime.fetchApi('/api/creador/perfil/');
    profile = (await response.json()).profile;
  }

  const surface = await ownerSurface(profile, csrfToken);
  return { runtime, photos, photoObjects, profile, surface, http };
}

function mount(harness, { failFirstAuthorize, loseFinalizeAck, changeAtDirectUpload, holdProfileRead } = {}) {
  let activeSession = 'creator-a';
  let rejectFirstAuthorize = failFirstAuthorize;
  let profileReadHeld = false;
  let profileReadStarted;
  let releaseProfileRead;
  const profileReadReady = holdProfileRead
    ? new Promise((resolve) => { profileReadStarted = resolve; })
    : Promise.resolve();
  const waitForProfileRead = () => new Promise((resolve) => { releaseProfileRead = resolve; });
  const requests = [];
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input), SITE_ORIGIN);
    if (url.origin === uploadOrigin) {
      const body = init.body;
      const file = body?.get('file');
      const key = body?.get('key');
      requests.push({ path: '/direct-photo-upload', method: init.method ?? 'GET', key, file, status: 204 });
      assert.ok(file instanceof File, 'the controller sends the selected File to the signed upload form');
      harness.photoObjects.seed(key, Buffer.from(await file.arrayBuffer()));
      if (changeAtDirectUpload) await changeProfile(harness.runtime, harness.profile, { city: 'Cambio durante la carga.' });
      return new Response(null, { status: 204 });
    }

    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    headers.set('cookie', `da_session=${encodeURIComponent(activeSession)}`);
    if (!['GET', 'HEAD'].includes(method)) headers.set('origin', SITE_ORIGIN);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const record = { path: url.pathname.replace(/\/$/, ''), method, body, headers };
    requests.push(record);
    if (record.path === '/api/creador/foto/autorizar' && method === 'POST' && rejectFirstAuthorize) {
      const failure = rejectFirstAuthorize;
      rejectFirstAuthorize = undefined;
      const response = Response.json({ error: failure === 401 ? 'UNAUTHENTICATED' : 'CSRF_REJECTED' }, { status: failure });
      record.status = response.status;
      return response;
    }
    let response = await harness.http(new Request(url, {
      method,
      headers,
      ...(init.body === undefined ? {} : { body: init.body }),
    }));
    record.status = response.status;
    if (record.path === '/api/creador/perfil' && method === 'GET' && holdProfileRead && !profileReadHeld) {
      profileReadHeld = true;
      if (holdProfileRead === 'fetch') {
        profileReadStarted();
        await waitForProfileRead();
      } else if (holdProfileRead === 'json') {
        const cloneResponse = response.clone.bind(response);
        response.clone = () => {
          const clone = cloneResponse();
          const parseJson = clone.json.bind(clone);
          clone.json = async () => {
            profileReadStarted();
            await waitForProfileRead();
            return parseJson();
          };
          return clone;
        };
      }
    }
    if (record.path === '/api/creador/foto/autorizar' && response.ok) {
      record.payload = await response.clone().json();
    }
    if (record.path === '/api/creador/foto/finalizar' && loseFinalizeAck && response.ok) {
      record.status = 503;
      return Response.json({ error: 'ACK_LOST_AFTER_COMMIT' }, { status: 503 });
    }
    return response;
  };

  const mounted = controllerBundle().then((code) => runInNewContext(code, {
    document: harness.surface.document,
    window: harness.surface.window,
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
    fetch,
    setTimeout,
    clearTimeout,
    queueMicrotask,
  }));
  return {
    requests,
    ready: mounted,
    profileReadReady,
    releaseProfileRead() { releaseProfileRead?.(); },
    setSession(id) { activeSession = id; },
  };
}

async function changeProfile(runtime, profile, changes) {
  const current = await runtime.pages.store.get(`profile:${profile.id}`);
  const response = await runtime.fetchApi('/api/creador/perfil/', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: SITE_ORIGIN, 'x-csrf-token': 'csrf-a' },
    body: JSON.stringify({ ...changes, version: current.version, slug: current.slug }),
  }, { session: 'creator-a' });
  assert.equal(response.status, 200);
  return (await response.json()).profile;
}

async function openPhotoEditor(harness) {
  await harness.mount.ready;
  await harness.surface.controls.editPhoto.dispatch('click');
  assert.equal(harness.surface.controls.dialog.open, true);
  harness.surface.controls.fileInput.files = [harness.surface.controls.file];
}

async function clickCheckPhoto(harness) {
  let bubbled = false;
  harness.surface.root.addEventListener('click', () => { bubbled = true; });
  await harness.surface.controls.checkPhoto.dispatch('click');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(bubbled, true, 'the explicit check click bubbles to the owner root');
}

function pathRequests(requests, pathname, method) {
  return requests.filter((request) => request.path === pathname && (!method || request.method === method));
}

test('un 409 al autorizar o finalizar conserva el archivo y la versión observada hasta la comprobación explícita', async (t) => {
  for (const stage of ['authorize', 'finalize']) {
    await t.test(stage, async () => {
      const data = await createHarness();
      if (stage === 'authorize') await changeProfile(data.runtime, data.profile, { bio: `Cambio externo ${stage}.` });
      data.mount = mount(data, { changeAtDirectUpload: stage === 'finalize' });
      await openPhotoEditor(data);
      const originalFile = data.surface.controls.fileInput.files[0];
      await data.surface.forms.foto.dispatch('submit');

      const authorize = pathRequests(data.mount.requests, '/api/creador/foto/autorizar', 'POST');
      const finalize = pathRequests(data.mount.requests, '/api/creador/foto/finalizar', 'POST');
      assert.equal(authorize.length, 1, 'the selected photo starts only one authorized upload');
      assert.equal(authorize[0].body.version, data.profile.version, 'the request carries the version this editor observed');
      assert.equal(finalize.length, stage === 'authorize' ? 0 : 1);
      assert.equal(stage === 'authorize' ? authorize[0].status : finalize[0].status, 409);
      assert.equal(pathRequests(data.mount.requests, '/api/creador/perfil', 'GET').length, 0,
        'the controller does not refresh or adopt the profile automatically');
      assert.equal(data.surface.root.dataset.profileVersion, String(data.profile.version));
      assert.equal(data.surface.controls.fileInput.files[0], originalFile, '409 keeps the selected File available');
      assert.equal(data.surface.controls.checkPhoto.hidden, false, '409 offers an explicit photo status check');
      assert.equal(data.surface.controls.checkPhoto.closest('[data-owner-check-photo]'), data.surface.controls.checkPhoto);
      assert.ok(data.surface.root.listeners.get('click')?.length, 'the controller listens for the check action');

      await clickCheckPhoto(data);
      const remote = await data.runtime.pages.store.get(`profile:${data.profile.id}`);
      assert.equal(pathRequests(data.mount.requests, '/api/creador/perfil', 'GET').length, 1,
        `the only refresh occurs after the owner asks to check; requests: ${JSON.stringify(data.mount.requests.map(({ path, method, status }) => ({ path, method, status })))}`);
      assert.equal(data.surface.root.dataset.profileVersion, String(remote.version));
      assert.equal(data.surface.controls.fileInput.files[0], originalFile, 'checking does not discard the selected File');
      assert.match(data.surface.controls.photoStatus.textContent, /versión guardada ya está comprobada/i);
      assert.equal(pathRequests(data.mount.requests, '/api/creador/foto/autorizar', 'POST').length, 1,
        'checking never retries authorization automatically');
      assert.equal(pathRequests(data.mount.requests, '/api/creador/foto/finalizar', 'POST').length, stage === 'authorize' ? 0 : 1);
    });
  }
});

test('un acuse perdido después del commit conserva la foto anterior en pantalla hasta verificar el ID de carga', async () => {
  const data = await createHarness({ existingPhoto: true });
  data.mount = mount(data, { loseFinalizeAck: true });
  await openPhotoEditor(data);
  const oldPhoto = data.profile.photo;
  const originalFile = data.surface.controls.fileInput.files[0];
  await data.surface.forms.foto.dispatch('submit');

  const authorize = pathRequests(data.mount.requests, '/api/creador/foto/autorizar', 'POST');
  const finalize = pathRequests(data.mount.requests, '/api/creador/foto/finalizar', 'POST');
  const uploads = pathRequests(data.mount.requests, '/direct-photo-upload', 'POST');
  assert.equal(authorize.length, 1);
  assert.equal(uploads.length, 1);
  assert.equal(finalize.length, 1, 'the commit happens once even though its acknowledgement is replaced by 503');
  assert.equal(finalize[0].status, 503, 'the client sees the lost-ack response');
  const committed = await data.runtime.pages.store.get(`profile:${data.profile.id}`);
  assert.equal(committed.version, data.profile.version + 1);
  assert.equal(committed.photo.version, authorize[0].payload.uploadId);
  assert.notEqual(committed.photo.version, oldPhoto.version);
  assert.equal(data.surface.root.dataset.profileVersion, String(data.profile.version),
    'the page does not claim that either the old or new version was confirmed');
  assert.equal(data.surface.controls.photoImage.getAttribute('src'), `/media/fotos/${data.profile.id}/${oldPhoto.version}.webp`,
    'the old photo remains displayed while the result is unknown');
  assert.equal(data.surface.controls.fileInput.files[0], originalFile);
  assert.equal(data.surface.controls.checkPhoto.hidden, false);
  assert.match(data.surface.controls.photoStatus.textContent, /No pudimos confirmar si la foto se guardó/i);

  const uploadId = committed.photo.version;
  await clickCheckPhoto(data);
  assert.equal(data.surface.root.dataset.profileVersion, String(committed.version));
  assert.equal(data.surface.controls.photoImage.getAttribute('src'), `/media/fotos/${data.profile.id}/${uploadId}.webp`,
    'an explicit check adopts the new photo only when the saved version matches this upload ID');
  assert.equal(data.surface.controls.fileInput.files.length, 0, 'the matching upload is confirmed and the file selection clears');
  assert.equal(data.surface.controls.checkPhoto.hidden, true);
  assert.match(data.surface.controls.photoStatus.textContent, /quedó guardada/i);
  assert.equal(pathRequests(data.mount.requests, '/api/creador/foto/autorizar', 'POST').length, 1);
  assert.equal(pathRequests(data.mount.requests, '/api/creador/foto/finalizar', 'POST').length, 1,
    'checking the result does not replay the upload or finalization');
});

test('comprobar la foto A conserva la selección B y permite subirla después de confirmar A', async () => {
  const data = await createHarness({ existingPhoto: true });
  data.mount = mount(data, { loseFinalizeAck: true });
  await openPhotoEditor(data);
  const fileA = data.surface.controls.fileInput.files[0];
  const bytesB = await sharp({
    create: { width: 80, height: 60, channels: 3, background: { r: 230, g: 60, b: 20 } },
  }).png().toBuffer();
  const fileB = new File([bytesB], 'correction-B.png', { type: 'image/png' });

  await data.surface.forms.foto.dispatch('submit');
  assert.equal(pathRequests(data.mount.requests, '/api/creador/foto/finalizar', 'POST')[0].status, 503);
  const committedA = await data.runtime.pages.store.get(`profile:${data.profile.id}`);
  assert.notEqual(fileA, fileB);
  data.surface.controls.fileInput.files = [fileB];

  await clickCheckPhoto(data);

  assert.equal(data.surface.root.dataset.profileVersion, String(committedA.version), 'the check confirms A against the saved profile');
  assert.equal(data.surface.controls.photoImage.getAttribute('src'), `/media/fotos/${data.profile.id}/${committedA.photo.version}.webp`);
  assert.equal(data.surface.controls.fileInput.files[0], fileB, 'the distinct correction selected before the check remains selected');
  assert.equal(data.surface.controls.dialog.open, true, 'confirming A does not close the editor containing B');
  assert.equal(data.surface.controls.checkPhoto.hidden, true, 'the completed check for A is no longer offered');
  assert.match(data.surface.controls.photoStatus.textContent, /Conservamos la imagen nueva.*guárdala/i);
  assert.equal(pathRequests(data.mount.requests, '/api/creador/foto/autorizar', 'POST').length, 1,
    'the check does not start an upload for B');

  await data.surface.forms.foto.dispatch('submit');

  const authorizations = pathRequests(data.mount.requests, '/api/creador/foto/autorizar', 'POST');
  const uploads = pathRequests(data.mount.requests, '/direct-photo-upload', 'POST');
  const finalizations = pathRequests(data.mount.requests, '/api/creador/foto/finalizar', 'POST');
  const saved = await data.runtime.pages.store.get(`profile:${data.profile.id}`);
  assert.equal(authorizations.length, 2, 'B starts only after the owner submits it explicitly');
  assert.equal(uploads.length, 2);
  assert.equal(Buffer.compare(Buffer.from(await uploads[1].file.arrayBuffer()), bytesB), 0,
    'the second upload sends the distinct selected pixels from B');
  assert.equal(finalizations.length, 2);
  assert.equal(finalizations[1].status, 503, 'the harness also drops B acknowledgement after commit');
  assert.equal(saved.photo.version, authorizations[1].payload.uploadId);
  assert.equal(data.surface.controls.fileInput.files[0], fileB, 'B remains selected while its own result is uncertain');
  assert.equal(data.surface.controls.checkPhoto.hidden, false);
});

test('una respuesta JSON tardía de Foto no cruza cancelar y reabrir el editor', async () => {
  const data = await createHarness();
  data.mount = mount(data, { loseFinalizeAck: true, holdProfileRead: 'json' });
  await openPhotoEditor(data);
  await data.surface.forms.foto.dispatch('submit');
  const committedA = await data.runtime.pages.store.get(`profile:${data.profile.id}`);
  await clickCheckPhoto(data);
  await data.mount.profileReadReady;

  await data.surface.controls.cancelButton.dispatch('click');
  assert.equal(data.surface.controls.exitPrompt.hidden, false, 'discarding the pending upload asks how to leave');
  await data.surface.controls.exitDiscard.dispatch('click');
  assert.equal(data.surface.controls.dialog.open, false);
  await openPhotoEditor(data);
  const bytesB = await sharp({
    create: { width: 80, height: 60, channels: 3, background: { r: 230, g: 60, b: 20 } },
  }).png().toBuffer();
  const fileB = new File([bytesB], 'reopened-correction-B.png', { type: 'image/png' });
  data.surface.controls.fileInput.files = [fileB];
  data.mount.releaseProfileRead();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(data.surface.root.dataset.profileVersion, String(data.profile.version),
    'the response started in the cancelled editor cannot advance the reopened editor version');
  assert.equal(data.surface.controls.dialog.open, true);
  assert.equal(data.surface.controls.fileInput.files[0], fileB,
    'the late response cannot clear the different file chosen in the reopened editor');
  assert.equal(data.surface.controls.checkPhoto.hidden, true,
    'the cancelled check cannot expose or consume recovery state in the new editor');

  await data.surface.forms.foto.dispatch('submit');
  const firstBAttempt = pathRequests(data.mount.requests, '/api/creador/foto/autorizar', 'POST')[1];
  assert.equal(firstBAttempt.status, 409, 'the reopened form still uses its originally observed version');
  assert.equal(data.surface.controls.fileInput.files[0], fileB);
  assert.equal(data.surface.controls.checkPhoto.hidden, false, 'the explicit conflict offers a fresh status check');
  await clickCheckPhoto(data);
  assert.equal(data.surface.root.dataset.profileVersion, String(committedA.version));
  assert.equal(data.surface.controls.fileInput.files[0], fileB,
    'the fresh status check adopts A without consuming B');

  await data.surface.forms.foto.dispatch('submit');
  const saved = await data.runtime.pages.store.get(`profile:${data.profile.id}`);
  const authorizations = pathRequests(data.mount.requests, '/api/creador/foto/autorizar', 'POST');
  assert.equal(authorizations.length, 3, 'only the owner-submitted 409 and later manual retry are added');
  assert.equal(saved.photo.version, authorizations[2].payload.uploadId);
  assert.equal(pathRequests(data.mount.requests, '/direct-photo-upload', 'POST').length, 2,
    'the rejected stale-version attempt never sends B to the upload service');
});

test('un GET de Foto anterior no revierte un nuevo intento de carga en curso', async () => {
  const data = await createHarness();
  data.mount = mount(data, { loseFinalizeAck: true, holdProfileRead: 'fetch' });
  await openPhotoEditor(data);
  await data.surface.forms.foto.dispatch('submit');
  const firstCommitted = await data.runtime.pages.store.get(`profile:${data.profile.id}`);
  await clickCheckPhoto(data);
  await data.mount.profileReadReady;

  const bytesB = await sharp({
    create: { width: 80, height: 60, channels: 3, background: { r: 230, g: 60, b: 20 } },
  }).png().toBuffer();
  const fileB = new File([bytesB], 'concurrent-correction-B.png', { type: 'image/png' });
  data.surface.controls.fileInput.files = [fileB];
  await data.surface.forms.foto.dispatch('submit');
  const staleAttempt = pathRequests(data.mount.requests, '/api/creador/foto/autorizar', 'POST')[1];
  assert.equal(staleAttempt.status, 409, 'B cannot start with the old profile version after A committed');
  const stillCommittedA = await data.runtime.pages.store.get(`profile:${data.profile.id}`);
  assert.equal(stillCommittedA.photo.version, firstCommitted.photo.version);
  assert.equal(data.surface.controls.dialog.open, true, 'the lost acknowledgement keeps the active Foto context open');
  assert.equal(data.surface.controls.fileInput.files[0], fileB);

  data.mount.releaseProfileRead();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(data.surface.root.dataset.profileVersion, String(data.profile.version),
    'the old response is ignored after a later write entered, even while its editor remains open');
  assert.equal(data.surface.controls.photoImage.getAttribute('src'), null,
    'the old check cannot advance the active editor after B started a write');
  assert.equal(data.surface.controls.fileInput.files[0], fileB);
  assert.match(data.surface.controls.photoStatus.textContent, /perfil cambió/i,
    'the stale check does not replace the newer 409 recovery message');

  await clickCheckPhoto(data);
  assert.equal(data.surface.root.dataset.profileVersion, String(stillCommittedA.version));
  assert.equal(data.surface.controls.photoImage.getAttribute('src'), `/media/fotos/${data.profile.id}/${stillCommittedA.photo.version}.webp`);
  assert.equal(data.surface.controls.fileInput.files[0], fileB,
    'the manual read reconciles A while keeping B for an explicit retry');

  await data.surface.forms.foto.dispatch('submit');
  const committedB = await data.runtime.pages.store.get(`profile:${data.profile.id}`);
  assert.equal(committedB.photo.version, pathRequests(data.mount.requests, '/api/creador/foto/autorizar', 'POST')[2].payload.uploadId);
  assert.equal(data.surface.controls.fileInput.files[0], fileB, 'B stays selected while its own acknowledgement is uncertain');
  await clickCheckPhoto(data);
  assert.equal(data.surface.root.dataset.profileVersion, String(committedB.version));
  assert.equal(data.surface.controls.photoImage.getAttribute('src'), `/media/fotos/${data.profile.id}/${committedB.photo.version}.webp`);
  assert.equal(data.surface.controls.fileInput.files.length, 0, 'the current B receipt is matched to its own selected File');
});

test('volver a abrir la edición de foto limpia los avisos de éxito del formulario y de la página', async () => {
  const data = await createHarness();
  data.mount = mount(data);
  await openPhotoEditor(data);
  await data.surface.forms.foto.dispatch('submit');

  const finalize = pathRequests(data.mount.requests, '/api/creador/foto/finalizar', 'POST');
  assert.equal(finalize.length, 1);
  assert.equal(finalize[0].status, 200, 'the real local photo service completed the save');
  assert.equal(data.surface.controls.photoStatus.hidden, false);
  assert.equal(data.surface.controls.pageStatus.hidden, false);
  assert.match(data.surface.controls.photoStatus.textContent, /Foto guardada/i);
  assert.match(data.surface.controls.pageStatus.textContent, /Foto guardada/i);

  await data.surface.controls.editPhoto.dispatch('click');

  assert.equal(data.surface.controls.dialog.open, true, 'the owner can reopen the same unit after save');
  for (const status of [data.surface.controls.photoStatus, data.surface.controls.pageStatus]) {
    assert.equal(status.hidden, true, 'the old notice is hidden when the form opens again');
    assert.equal(status.textContent, '');
    assert.equal(status.dataset.kind, undefined);
  }
  const saved = await data.runtime.pages.store.get(`profile:${data.profile.id}`);
  assert.equal(saved.photo.version, pathRequests(data.mount.requests, '/api/creador/foto/autorizar', 'POST')[0].payload.uploadId);
});

test('descartar una corrección de foto limpia el archivo y deja el diálogo sin cambios pendientes', async () => {
  const data = await createHarness();
  data.mount = mount(data);
  await openPhotoEditor(data);
  const originalFile = data.surface.controls.fileInput.files[0];
  assert.equal(data.surface.controls.fileInput.files[0], originalFile);

  await data.surface.controls.cancelButton.dispatch('click');
  assert.equal(data.surface.controls.exitPrompt.hidden, false, 'closing with a selected photo asks how to leave');
  assert.equal(data.surface.controls.dialog.open, true);
  await data.surface.controls.exitDiscard.dispatch('click');

  assert.equal(data.surface.controls.fileInput.files.length, 0, 'discard clears the browser file selection');
  assert.equal(data.surface.controls.exitPrompt.hidden, true);
  assert.equal(data.surface.controls.dialog.open, false);
  assert.equal(data.mount.requests.length, 0, 'discard performs no photo API writes');
});

test('401 y CSRF conservan el archivo; revisar la misma sesión permite sólo un reintento manual', async (t) => {
  for (const failure of [401, 403]) {
    await t.test(String(failure), async () => {
      const data = await createHarness({ csrfToken: failure === 403 ? 'csrf-expired' : 'csrf-a' });
      data.mount = mount(data, { failFirstAuthorize: failure });
      await openPhotoEditor(data);
      const originalFile = data.surface.controls.fileInput.files[0];
      await data.surface.forms.foto.dispatch('submit');

      assert.equal(pathRequests(data.mount.requests, '/api/creador/foto/autorizar', 'POST').length, 1);
      assert.equal(pathRequests(data.mount.requests, '/direct-photo-upload', 'POST').length, 0);
      assert.equal(pathRequests(data.mount.requests, '/api/creador/foto/finalizar', 'POST').length, 0);
      assert.equal(data.surface.controls.fileInput.files[0], originalFile);
      assert.equal(data.surface.controls.signIn.hidden, false);
      assert.equal(data.surface.controls.checkSession.hidden, false);

      await data.surface.controls.checkSession.dispatch('click');
      await new Promise((resolve) => setTimeout(resolve, 0));
      const checks = pathRequests(data.mount.requests, '/api/creador/sesion', 'GET');
      assert.equal(checks.length, 1);
      assert.equal(checks[0].status, 200, 'the session check validates the same account and role');
      assert.equal(data.mount.requests.filter((request) => request.path.includes('/foto/')).length, 1,
        'checking the session never replays the photo intent');
      assert.equal(data.surface.controls.fileInput.files[0], originalFile);
      assert.equal(data.surface.controls.checkSession.hidden, true);

      await data.surface.forms.foto.dispatch('submit');
      const auths = pathRequests(data.mount.requests, '/api/creador/foto/autorizar', 'POST');
      const uploads = pathRequests(data.mount.requests, '/direct-photo-upload', 'POST');
      const finalizes = pathRequests(data.mount.requests, '/api/creador/foto/finalizar', 'POST');
      assert.equal(auths.length, 2, 'the user manually starts the second authorization');
      assert.equal(uploads.length, 1, 'the selected file is sent only after the manual retry');
      assert.equal(finalizes.length, 1);
      assert.equal(finalizes[0].status, 200);
      const saved = await data.runtime.pages.store.get(`profile:${data.profile.id}`);
      assert.equal(saved.photo.version, auths[1].payload.uploadId);
      assert.equal(data.surface.controls.fileInput.files.length, 0);
      assert.match(data.surface.controls.photoStatus.textContent, /Foto guardada/i);
    });
  }
});

test('una cuenta o rol distinto no permite reanudar la carga ni elimina el archivo seleccionado', async (t) => {
  for (const changedSession of ['creator-b', 'other-role']) {
    await t.test(changedSession, async () => {
      const data = await createHarness();
      data.mount = mount(data, { failFirstAuthorize: 401 });
      await openPhotoEditor(data);
      const originalFile = data.surface.controls.fileInput.files[0];
      await data.surface.forms.foto.dispatch('submit');
      data.mount.setSession(changedSession);

      await data.surface.controls.checkSession.dispatch('click');
      await new Promise((resolve) => setTimeout(resolve, 0));
      const check = pathRequests(data.mount.requests, '/api/creador/sesion', 'GET');
      assert.equal(check.length, 1);
      assert.equal(check[0].status, 409, 'account or role binding changes fail the explicit session check');
      assert.match(data.surface.controls.sessionStatus.textContent, /otra cuenta|permisos/i);

      const before = data.mount.requests.length;
      await data.surface.forms.foto.dispatch('submit');
      assert.equal(data.mount.requests.length, before, 'the controller blocks a manual upload under the changed identity or role');
      assert.equal(data.surface.controls.fileInput.files[0], originalFile);
      assert.equal(pathRequests(data.mount.requests, '/direct-photo-upload', 'POST').length, 0);
      assert.equal(pathRequests(data.mount.requests, '/api/creador/foto/finalizar', 'POST').length, 0);
      const saved = await data.runtime.pages.store.get(`profile:${data.profile.id}`);
      assert.equal(saved.version, data.profile.version);
      assert.equal(saved.photo, undefined);
    });
  }
});

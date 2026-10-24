import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createCreatorPhotoHarness, rasterPhotoFixtures } from './fixtures/creator-photos.mjs';

let editorBundlePromise;

async function editorBundle() {
  editorBundlePromise ??= build({
    entryPoints: [new URL('../src/scripts/creator-editor.ts', import.meta.url).pathname],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
  }).then(({ outputFiles }) => outputFiles[0].text);
  return editorBundlePromise;
}

class TestElement {
  constructor({ dataset = {}, values = {}, selectors = {}, lists = {} } = {}) {
    this.dataset = dataset;
    this.values = values;
    this.selectors = selectors;
    this.lists = lists;
    this.listeners = new Map();
    this.attributes = new Map();
    this.textContent = '';
    this.hidden = true;
    this.disabled = false;
    this.checked = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  querySelector(selector) { return this.selectors[selector] ?? null; }
  querySelectorAll(selector) { return this.lists[selector] ?? []; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  reportValidity() { return true; }
  closest(selector) { return this.selectors[`closest:${selector}`] ?? null; }

  async dispatch(type) {
    const event = { preventDefault() {} };
    for (const listener of this.listeners.get(type) ?? []) await listener(event);
  }
}

class TestFormData {
  constructor(form) {
    this.form = form;
    this.values = new Map();
  }

  get(name) {
    const value = this.form?.values[name];
    return value && typeof value === 'object' && 'value' in value ? value.value : value ?? null;
  }

  getAll() { return []; }
  append(name, value) { this.values.set(name, value); }
}

function editorData(overrides = {}) {
  return {
    profile: {
      id: 'profile-a', displayName: 'Ana', slug: 'ana', programs: [], socials: {},
      published: true, hidden: false, version: 37,
    },
    links: [],
    editableResources: [],
    claims: [],
    series: [],
    ...overrides,
  };
}

async function runEditor({ data = editorData(), root, fetch, reloads }) {
  const initial = new TestElement();
  initial.textContent = JSON.stringify(data);
  const document = {
    querySelector: (selector) => selector === '[data-creator-editor]' ? root
      : selector === '#creator-editor-data' ? initial : null,
    querySelectorAll: () => [],
    getElementById: () => null,
  };
  const window = {
    location: {
      hash: '',
      href: 'https://dondeaprendoaws.com/cuenta/creador/',
      reload() { reloads.count += 1; },
    },
    requestAnimationFrame(callback) { callback(); },
    history: { replaceState() {} },
  };

  runInNewContext(await editorBundle(), {
    document,
    window,
    HTMLElement: TestElement,
    FormData: TestFormData,
    Response,
    TextEncoder,
    URL,
    fetch,
  });
}

function baseRoot(overrides = {}) {
  const linksStatus = new TestElement();
  const root = new TestElement({
    dataset: { csrf: 'csrf-a' },
    selectors: {
      '[data-page-status]': new TestElement(),
      '[data-links-status]': linksStatus,
      ...overrides.selectors,
    },
    lists: overrides.lists,
  });
  return { root, linksStatus };
}

test('readding a retained resource sends its exact identity and observed resource version', async () => {
  const retainedId = 'resource-retained';
  const item = new TestElement({ dataset: { retainedResourceId: retainedId } });
  const button = new TestElement({ selectors: { 'closest:[data-retained-resource-id]': item } });
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: { '[data-links-status]': status },
    lists: { '[data-readd-link]': [button] },
  });
  const reloads = { count: 0 };
  const requests = [];

  await runEditor({
    data: editorData({
      editableResources: [{
        id: retainedId,
        title: 'Título que puede estar desactualizado',
        url: 'https://example.com/current',
        description: 'Descripción anterior',
        version: 19,
      }],
    }),
    root,
    reloads,
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      return Response.json({}, { status: 201 });
    },
  });

  await button.dispatch('click');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/creador/enlaces/');
  assert.equal(requests[0].method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].body), { resourceId: retainedId, resourceVersion: 19 });
  assert.match(status.textContent, /agregado nuevamente/);
  assert.equal(reloads.count, 1);
});

test('reordering sends the placement and profile versions observed by the editor', async () => {
  const currentItem = new TestElement({ dataset: { placementId: 'placement-current' } });
  const button = new TestElement({
    dataset: { move: 'up' },
    selectors: { 'closest:[data-placement-id]': currentItem },
  });
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: { '[data-links-status]': status },
    lists: { '[data-move]': [button] },
  });
  const reloads = { count: 0 };
  const requests = [];

  await runEditor({
    data: editorData({
      links: [
        {
          placementId: 'placement-target', resourceId: 'resource-a', position: 3, featured: false,
          resourceVersion: 6, placementVersion: 8,
        },
        {
          placementId: 'placement-current', resourceId: 'resource-b', position: 9, featured: false,
          resourceVersion: 11, placementVersion: 23,
        },
      ],
    }),
    root,
    reloads,
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      return Response.json({}, { status: 200 });
    },
  });

  await button.dispatch('click');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/creador/enlaces/placement-current/');
  assert.equal(requests[0].method, 'PATCH');
  assert.deepEqual(JSON.parse(requests[0].body), { position: 3, version: 23, profileVersion: 37 });
  assert.equal(status.textContent, 'Orden actualizado.');
  assert.equal(reloads.count, 1);
});

async function runCorrectionFlow({ action, status: responseStatus, error, initialValue, correctedValue, fieldName }) {
  const field = { value: initialValue, setCustomValidity() {} };
  const form = new TestElement({
    values: action === 'profile'
      ? { displayName: 'Ana', slug: field, city: '', country: '', bio: '' }
      : { title: 'Guía', url: field, description: '' },
    lists: { 'input[name^="social-"]': [] },
  });
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: action === 'profile'
      ? { '[data-profile-form]': form, '[data-profile-status]': status }
      : { '[data-add-link-form]': form, '[data-link-create-status]': status },
  });
  const reloads = { count: 0 };
  const requests = [];
  let call = 0;

  await runEditor({
    root,
    reloads,
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      call += 1;
      return call === 1
        ? Response.json({ error, message: 'English service detail' }, { status: responseStatus })
        : Response.json(action === 'link' ? { link: { hidden: false } } : {}, { status: action === 'link' ? 201 : 200 });
    },
  });

  await form.dispatch('submit');
  const errorMessage = status.textContent;
  assert.equal(field.value, initialValue, 'a failed save keeps the value that needs correction');
  assert.equal(reloads.count, 0, 'a failed save does not reload or discard the form');
  field.value = correctedValue;
  await form.dispatch('submit');
  assert.equal(field.value, correctedValue);
  assert.equal(JSON.parse(requests[1].body)[fieldName], correctedValue);
  assert.equal(reloads.count, 1, 'the corrected value can be submitted successfully');
  return { errorMessage, status: status.textContent };
}

test('profile slug conflicts and unsafe link URLs give actionable feedback and allow correction', async () => {
  const slug = await runCorrectionFlow({
    action: 'profile', status: 409, error: 'SLUG_TAKEN',
    initialValue: 'ya-reservada', correctedValue: 'ana-nueva', fieldName: 'slug',
  });
  assert.equal(slug.errorMessage, 'Esa dirección ya está reservada. Elige otra dirección para tu página.');
  assert.match(slug.status, /Perfil guardado/);

  const url = await runCorrectionFlow({
    action: 'link', status: 422, error: 'INVALID_URL',
    initialValue: 'ftp://example.com/guia', correctedValue: 'https://example.com/guia', fieldName: 'url',
  });
  assert.equal(url.errorMessage, 'La URL debe comenzar con http:// o https:// y no incluir usuario ni contraseña.');
  assert.match(url.status, /visible en tu perfil público/);
});

test('unknown semantic errors keep safe generic conflict guidance and retain the form value', async () => {
  const field = { value: 'slug-en-conflicto', setCustomValidity() {} };
  const form = new TestElement({
    values: { displayName: 'Ana', slug: field, city: '', country: '', bio: '' },
    lists: { 'input[name^="social-"]': [] },
  });
  const status = new TestElement();
  const { root } = baseRoot({ selectors: { '[data-profile-form]': form, '[data-profile-status]': status } });
  const reloads = { count: 0 };

  await runEditor({
    root,
    reloads,
    fetch: async () => Response.json({ error: 'FUTURE_CONFLICT' }, { status: 409 }),
  });
  await form.dispatch('submit');

  assert.match(status.textContent, /Otra edición guardó una versión más reciente/);
  assert.equal(field.value, 'slug-en-conflicto');
  assert.equal(reloads.count, 0);
});

test('a lost photo finalization acknowledgement reports an unknown result after the real service commits', async () => {
  const oldPhoto = { version: 'old-photo' };
  const harness = await createCreatorPhotoHarness({
    profiles: [{ id: 'creator-a', version: 1, photo: oldPhoto }],
  });
  const { jpeg } = await rasterPhotoFixtures();
  const file = { type: 'image/jpeg', size: jpeg.length };
  const fileInput = { files: [file] };
  const photoStatus = new TestElement();
  const photoForm = new TestElement({ selectors: { 'input[type="file"]': fileInput } });
  const { root } = baseRoot({ selectors: { '[data-photo-form]': photoForm, '[data-photo-status]': photoStatus } });
  const initialData = editorData({ profile: {
    id: 'creator-a', displayName: 'Ana', slug: 'ana', programs: [], socials: {},
    published: true, hidden: false, version: 1, photo: oldPhoto,
  } });
  const reloads = { count: 0 };
  let upload;
  let committed = false;

  await runEditor({
    data: initialData,
    root,
    reloads,
    fetch: async (url, options) => {
      if (url === '/api/creador/foto/autorizar/') {
        upload = await harness.service.beginUpload({
          profileId: 'creator-a', expectedVersion: JSON.parse(options.body).version,
        });
        return Response.json(upload);
      }
      if (url === upload.post.url) {
        harness.objects.seed(options.body.values.get('key'), jpeg);
        return new Response(null, { status: 204 });
      }
      if (url === '/api/creador/foto/finalizar/') {
        const body = JSON.parse(options.body);
        await harness.service.finalizeUpload({
          profileId: 'creator-a', uploadId: body.uploadId, expectedVersion: body.version,
        });
        committed = true;
        throw new TypeError('response lost after commit');
      }
      throw new Error(`Unexpected editor request: ${url}`);
    },
  });

  await photoForm.dispatch('submit');
  const profile = await harness.store.get('profile:creator-a');
  assert.equal(committed, true);
  assert.equal(profile.version, 2);
  assert.equal(profile.photo.version, upload.uploadId);
  assert.notDeepEqual(profile.photo, oldPhoto, 'the service committed the new immutable photo reference');
  const photo = await harness.service.readPhoto({ profileId: 'creator-a', version: upload.uploadId });
  assert.ok(photo?.body.length > 0, 'the newly committed photo remains readable');
  assert.match(photoStatus.textContent, /No pudimos confirmar si la foto se guardó/);
  assert.match(photoStatus.textContent, /Recarga la página para comprobar cuál está activa/);
  assert.doesNotMatch(photoStatus.textContent, /la foto anterior sigue activa/i);
  assert.equal(reloads.count, 0);
});

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
  getAttribute(name) { return this.attributes.get(name) ?? null; }
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
  const resourceId = 'resource-editing';
  const resourceItem = new TestElement({ dataset: { resourceId } });
  const form = new TestElement({
    values: action === 'profile'
      ? { displayName: 'Ana', slug: field, city: '', country: '', bio: '' }
      : { title: 'Guía', url: field, description: '' },
    selectors: action === 'resource-edit'
      ? { 'closest:[data-resource-id]': resourceItem }
      : {},
    lists: { 'input[name^="social-"]': [] },
  });
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: action === 'profile'
      ? { '[data-profile-form]': form, '[data-profile-status]': status }
      : action === 'resource-edit'
        ? { '[data-links-status]': status }
        : { '[data-add-link-form]': form, '[data-link-create-status]': status },
    lists: action === 'resource-edit' ? { '[data-resource-form]': [form] } : {},
  });
  const reloads = { count: 0 };
  const requests = [];
  let call = 0;

  await runEditor({
    data: action === 'resource-edit' ? editorData({
      links: [{
        placementId: 'placement-editing', resourceId, title: 'Guía', url: initialValue,
        description: '', featured: false, position: 0, selectedForDirectory: false,
        hidden: false, directoryApproval: 'pending', resourceVersion: 29, series: [],
      }],
    }) : editorData(),
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

test('resource URL conflicts and colliding link URLs explain the cause and allow corrected retries', async () => {
  const taken = await runCorrectionFlow({
    action: 'resource-edit', status: 409, error: 'URL_TAKEN',
    initialValue: 'https://example.com/used', correctedValue: 'https://example.com/new', fieldName: 'url',
  });
  assert.equal(taken.errorMessage, 'Esa URL ya está asociada a otra ficha. Elige una URL diferente.');
  assert.match(taken.status, /Ficha guardada/);

  const collision = await runCorrectionFlow({
    action: 'link', status: 409, error: 'URL_COLLISION',
    initialValue: 'https://example.com/under-review', correctedValue: 'https://example.com/other', fieldName: 'url',
  });
  assert.equal(collision.errorMessage, 'Esta URL requiere una revisión de administración y no se puede agregar ahora. Puedes probar con otra URL.');
  assert.match(collision.status, /visible en tu perfil público/);
});

test('known version conflicts require a reload while unknown conflicts stay neutral and retain the form value', async () => {
  const field = { value: 'slug-en-conflicto', setCustomValidity() {} };
  const form = new TestElement({
    values: { displayName: 'Ana', slug: field, city: '', country: '', bio: '' },
    lists: { 'input[name^="social-"]': [] },
  });
  const status = new TestElement();
  const { root } = baseRoot({ selectors: { '[data-profile-form]': form, '[data-profile-status]': status } });
  const reloads = { count: 0 };
  let responseIndex = 0;
  const submittedVersions = [];

  await runEditor({
    root,
    reloads,
    fetch: async (_url, options) => {
      submittedVersions.push(JSON.parse(options.body).version);
      responseIndex += 1;
      if (responseIndex === 1) return Response.json({ error: 'PROFILE_CONFLICT' }, { status: 409 });
      if (responseIndex === 2) return Response.json({ error: 'FUTURE_CONFLICT' }, { status: 409 });
      return new Response('not json', { status: 409 });
    },
  });
  await form.dispatch('submit');

  assert.equal(status.textContent, 'El perfil, recurso o enlace cambió desde que abriste la página. Recárgala antes de volver a guardar.');
  assert.equal(field.value, 'slug-en-conflicto');
  assert.equal(reloads.count, 0);

  await form.dispatch('submit');
  assert.equal(status.textContent, 'No pudimos completar el cambio porque hay un conflicto. Revisa el estado antes de volver a intentarlo.');
  assert.equal(field.value, 'slug-en-conflicto');
  assert.equal(reloads.count, 0);

  await form.dispatch('submit');
  assert.equal(status.textContent, 'No pudimos completar el cambio porque hay un conflicto. Revisa el estado antes de volver a intentarlo.');
  assert.equal(field.value, 'slug-en-conflicto');
  assert.equal(reloads.count, 0);
  assert.deepEqual(submittedVersions, [37, 37, 37], 'a conflict never silently advances the stale version');
});

test('a profile save keeps later edits in that form and refreshes its version before retrying', async () => {
  const field = { tagName: 'INPUT', type: 'text', value: 'Ana enviada', name: 'displayName', setCustomValidity() {} };
  const form = new TestElement({
    values: { displayName: field, slug: 'ana', city: '', country: '', bio: '' },
    lists: { 'input[name^="social-"]': [], 'input, textarea, select': [field] },
  });
  field.form = form;
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: { '[data-profile-form]': form, '[data-profile-status]': status },
    lists: { 'input, textarea, select': [field] },
  });
  const reloads = { count: 0 };
  const requests = [];
  let resolveFirstSave;

  await runEditor({
    root,
    reloads,
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (options.method === 'GET') return Response.json(editorData({ profile: { ...editorData().profile, version: 38 } }));
      if (requests.filter((request) => request.options.method === 'PUT').length === 1) {
        return new Promise((resolve) => { resolveFirstSave = resolve; });
      }
      return Response.json({ profile: { version: 39 } });
    },
  });

  const pending = form.dispatch('submit');
  await Promise.resolve();
  field.value = 'Ana corrección posterior';
  resolveFirstSave(Response.json({ profile: { version: 38 } }));
  await pending;

  assert.equal(JSON.parse(requests[0].options.body).displayName, 'Ana enviada');
  assert.equal(field.value, 'Ana corrección posterior');
  assert.equal(reloads.count, 0, 'the first success leaves the edited value in place');
  assert.match(status.textContent, /Conservamos los cambios que aún no enviaste/);

  await form.dispatch('submit');
  assert.equal(JSON.parse(requests[2].options.body).displayName, 'Ana corrección posterior');
  assert.equal(JSON.parse(requests[2].options.body).version, 38, 'the retry uses the refreshed profile version');
  assert.equal(reloads.count, 1, 'the page refreshes after all edits have been saved');
});

test('a failed save keeps edits made while the request was pending and reports the failure', async () => {
  const field = { tagName: 'INPUT', type: 'text', value: 'Ana enviada', name: 'displayName', setCustomValidity() {} };
  const form = new TestElement({
    values: { displayName: field, slug: 'ana', city: '', country: '', bio: '' },
    lists: { 'input[name^="social-"]': [], 'input, textarea, select': [field] },
  });
  field.form = form;
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: { '[data-profile-form]': form, '[data-profile-status]': status },
    lists: { 'input, textarea, select': [field] },
  });
  const reloads = { count: 0 };
  let resolveSave;
  await runEditor({
    root,
    reloads,
    fetch: async () => new Promise((resolve) => { resolveSave = resolve; }),
  });

  const pending = form.dispatch('submit');
  await Promise.resolve();
  field.value = 'Ana corrección tras fallo';
  resolveSave(Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 }));
  await pending;

  assert.equal(field.value, 'Ana corrección tras fallo');
  assert.match(status.textContent, /No pudimos guardar los cambios/);
  assert.equal(reloads.count, 0, 'a failed request never reloads the page');
});

test('saving the profile preserves an edited series form and gives that save the refreshed profile version', async () => {
  const profileField = { tagName: 'INPUT', type: 'text', value: 'Ana enviada', name: 'displayName', setCustomValidity() {} };
  const profileForm = new TestElement({
    values: { displayName: profileField, slug: 'ana', city: '', country: '', bio: '' },
    lists: { 'input[name^="social-"]': [], 'input, textarea, select': [profileField] },
  });
  const seriesName = { tagName: 'INPUT', type: 'text', value: 'Lambda', name: 'name' };
  const seriesSlug = { tagName: 'INPUT', type: 'text', value: 'lambda', name: 'slug' };
  const seriesDescription = { tagName: 'TEXTAREA', value: '', name: 'description' };
  const seriesStatus = new TestElement();
  const seriesSection = new TestElement({ dataset: { seriesId: 'series-a' }, selectors: { '[data-series-status]': seriesStatus } });
  const seriesForm = new TestElement({
    values: { name: seriesName, slug: seriesSlug, description: seriesDescription },
    selectors: { 'closest:[data-series-id]': seriesSection, '[data-series-form-status]': seriesStatus },
    lists: { 'input, textarea, select': [seriesName, seriesSlug, seriesDescription] },
  });
  for (const control of [profileField, seriesName, seriesSlug, seriesDescription]) control.form = control === profileField ? profileForm : seriesForm;
  const status = new TestElement();
  const { root } = baseRoot({
    selectors: { '[data-profile-form]': profileForm, '[data-profile-status]': status },
    lists: {
      '[data-series-form]': [seriesForm],
      'input, textarea, select': [profileField, seriesName, seriesSlug, seriesDescription],
    },
  });
  const reloads = { count: 0 };
  const requests = [];
  const data = editorData({ series: [{ id: 'series-a', name: 'Lambda', slug: 'lambda', description: '', version: 4 }] });
  let resolveProfileSave;

  await runEditor({
    data,
    root,
    reloads,
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (options.method === 'GET') return Response.json({ ...data, profile: { ...data.profile, version: 38 } });
      if (url.includes('/perfil/')) return new Promise((resolve) => { resolveProfileSave = resolve; });
      return Response.json({ profile: { version: 39 }, series: { id: 'series-a', version: 5 } });
    },
  });

  const savingProfile = profileForm.dispatch('submit');
  await Promise.resolve();
  seriesName.value = 'Lambda corregida';
  seriesSlug.value = 'lambda-corregida';
  seriesDescription.value = 'Descripción corregida';
  resolveProfileSave(Response.json({ profile: { version: 38 } }));
  await savingProfile;
  assert.equal(seriesName.value, 'Lambda corregida');
  assert.equal(reloads.count, 0, 'a different pending form prevents the success reload');
  assert.match(status.textContent, /Conservamos los cambios que aún no enviaste/);

  await seriesForm.dispatch('submit');
  const seriesRequest = requests.find((request) => request.url.includes('/series/series-a/'));
  assert.ok(seriesRequest);
  assert.equal(JSON.parse(seriesRequest.options.body).profileVersion, 38);
  assert.equal(JSON.parse(seriesRequest.options.body).version, 4);
  assert.equal(JSON.parse(seriesRequest.options.body).name, 'Lambda corregida');
  assert.equal(reloads.count, 1, 'saving the pending series completes the refresh');
});

test('a second photo with matching file metadata stays selected after the first photo finishes', async () => {
  const firstFile = new File(['A'], 'profile.png', { type: 'image/png', lastModified: 123 });
  const secondFile = new File(['B'], 'profile.png', { type: 'image/png', lastModified: 123 });
  assert.equal(firstFile.name, secondFile.name);
  assert.equal(firstFile.size, secondFile.size);
  assert.equal(firstFile.lastModified, secondFile.lastModified);
  assert.equal(await firstFile.text(), 'A');
  assert.equal(await secondFile.text(), 'B');
  assert.notEqual(firstFile, secondFile, 'the byte contents belong to distinct File selections');

  const profileField = { tagName: 'INPUT', type: 'text', value: 'Ana', name: 'displayName', setCustomValidity() {} };
  const profileForm = new TestElement({
    values: { displayName: profileField, slug: 'ana', city: '', country: '', bio: '' },
    lists: { 'input[name^="social-"]': [], 'input, textarea, select': [profileField] },
  });
  profileField.form = profileForm;
  const fileInput = { tagName: 'INPUT', type: 'file', files: [firstFile], disabled: false };
  const photoForm = new TestElement({
    selectors: { 'input[type="file"]': fileInput },
    lists: {
      'input, textarea, select': [fileInput],
      'button, input[data-busy-control]': [fileInput],
    },
  });
  fileInput.form = photoForm;
  const profileStatus = new TestElement();
  const photoStatus = new TestElement();
  const { root } = baseRoot({
    selectors: {
      '[data-profile-form]': profileForm,
      '[data-profile-status]': profileStatus,
      '[data-photo-form]': photoForm,
      '[data-photo-status]': photoStatus,
    },
    lists: { 'input, textarea, select': [profileField, fileInput] },
  });
  const initialProfile = { ...editorData().profile, version: 37 };
  const requests = [];
  let profileVersion = 37;
  let finalizationCount = 0;
  let resolveFirstFinalization;
  const reloads = { count: 0 };

  await runEditor({
    data: editorData({ profile: initialProfile }),
    root,
    reloads,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === '/api/creador/foto/autorizar/') {
        return Response.json({
          uploadId: `upload-${finalizationCount + 1}`,
          post: { url: 'https://storage.example/upload', fields: {} },
        });
      }
      if (url === 'https://storage.example/upload') return new Response(null, { status: 204 });
      if (url === '/api/creador/foto/finalizar/') {
        finalizationCount += 1;
        profileVersion += 1;
        return finalizationCount === 1
          ? new Promise((resolve) => { resolveFirstFinalization = resolve; })
          : Response.json({});
      }
      if (url === '/api/creador/perfil/' && options.method === 'GET') {
        return Response.json(editorData({ profile: { ...initialProfile, version: profileVersion } }));
      }
      if (url === '/api/creador/perfil/' && options.method === 'PUT') {
        profileVersion += 1;
        return Response.json({ profile: { ...initialProfile, version: profileVersion } });
      }
      return new Response('not found', { status: 404 });
    },
  });

  const firstPhotoSave = photoForm.dispatch('submit');
  while (!resolveFirstFinalization) await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fileInput.disabled, true, 'the file field remains disabled during its own upload');
  profileField.value = 'Ana corregida mientras finaliza la foto';
  resolveFirstFinalization(Response.json({}));
  await firstPhotoSave;

  assert.equal(fileInput.files[0], firstFile);
  assert.equal(reloads.count, 0, 'the first photo does not reload over the pending profile correction');
  assert.match(photoStatus.textContent, /Conservamos los cambios que aún no enviaste/);

  fileInput.files = [secondFile];
  assert.equal(fileInput.disabled, false, 'the next selection is available after the first upload');
  await profileForm.dispatch('submit');
  assert.equal(fileInput.files[0], secondFile);
  assert.equal(reloads.count, 0, 'metadata equality must not hide the second file selection');
  assert.match(profileStatus.textContent, /Conservamos los cambios que aún no enviaste/);

  await photoForm.dispatch('submit');
  const profileBody = requests.find(({ url, options }) => url === '/api/creador/perfil/' && options.method === 'PUT');
  const secondAuthorization = requests.filter(({ url }) => url === '/api/creador/foto/autorizar/')[1];
  assert.equal(JSON.parse(profileBody.options.body).version, 38);
  assert.equal(JSON.parse(secondAuthorization.options.body).version, 39);
  assert.equal(finalizationCount, 2, 'the replacement photo can finish its upload and finalization');
  assert.equal(fileInput.files[0], secondFile);
  assert.equal(reloads.count, 1, 'the page refreshes only after the replacement is saved');
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

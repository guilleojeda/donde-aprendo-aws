import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createOwnerLinksSurface,
  mountOwnerLinks,
  settle,
  writes,
} from './fixtures/creator-owner-links-browser.mjs';
import { SurfaceElement } from './fixtures/creator-owner-browser-dom.mjs';

function installIndexedHistory(surface) {
  const listeners = new Map();
  surface.window.addEventListener = (type, listener) => listeners.set(type, listener);
  const currentHref = surface.window.location.href;
  const previousUrl = new URL(currentHref);
  previousUrl.searchParams.set('buscar', 'anterior');
  const entries = [
    { href: previousUrl.href, state: { creatorOwnerHistoryIndex: 0 } },
    { href: currentHref, state: { creatorOwnerHistoryIndex: 1 } },
  ];
  let index = 1;
  const calls = [];
  const go = (delta) => {
    calls.push(delta);
    const next = Math.max(0, Math.min(entries.length - 1, index + delta));
    if (next === index) return;
    index = next;
    surface.window.location.href = entries[index].href;
    listeners.get('popstate')?.({ type: 'popstate', state: entries[index].state });
  };
  surface.window.history = {
    get state() { return entries[index].state; },
    replaceState(state, _title, href) {
      entries[index] = { href: new URL(String(href), currentHref).href, state: structuredClone(state) };
    },
    go,
    back() { go(-1); },
    forward() { go(1); },
  };
  return {
    calls,
    listeners,
    get index() { return index; },
    get entries() { return entries; },
  };
}

function addHeaderLink(surface, href) {
  const header = new SurfaceElement({ tagName: 'HEADER' });
  header.className = 'site-header';
  const menu = new SurfaceElement({ tagName: 'DIV' });
  menu.className = 'site-nav__menu is-open';
  const link = new SurfaceElement({ tagName: 'A' });
  link.setAttribute('href', href);
  link.href = href;
  link.addEventListener('click', () => {
    menu.hidden = true;
    menu.classList.remove('is-open');
  });
  menu.append(link);
  header.append(menu);
  header.parentElement = surface.document;
  return { link, menu };
}

function waitFor(predicate, message) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      if (predicate()) resolve();
      else if (++attempts >= 50) reject(new Error(message));
      else setImmediate(check);
    };
    check();
  });
}

test('una publicación activa guarda la salida por ancla, beforeunload y Atrás sin repetir la escritura', async () => {
  const surface = createOwnerLinksSurface({
    profile: { id: 'creator-1', displayName: 'Ana', slug: 'ana', version: 1, published: false, hidden: false, programs: [], socials: {} },
    search: 'actual',
  });
  const history = installIndexedHistory(surface);
  let releasePublish;
  const assigned = [];
  surface.window.location.assign = (href) => assigned.push(href);
  const requests = await mountOwnerLinks({ surface, fetch: async (request) => {
    if (request.method === 'POST' && request.path === '/api/creador/perfil/publicar') {
      return new Promise((resolve) => { releasePublish = resolve; });
    }
    return Response.json({ error: 'UNAVAILABLE' }, { status: 503 });
  } });

  try {
    await surface.publish.dispatch('click');
    await waitFor(() => typeof releasePublish === 'function', 'the publication request did not start');

    const anchorClick = await surface.navigation.dispatch('click', { button: 0 });
    assert.equal(anchorClick.defaultPrevented, true,
      'same-tab owner links keep the page open while publication is active');
    assert.deepEqual(assigned, [], 'the interrupted navigation does not run after publication resolves');

    const unload = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    history.listeners.get('beforeunload')(unload);
    assert.equal(unload.defaultPrevented, true, 'the native unload guard also covers an active write');

    surface.window.history.back();
    assert.equal(history.index, 1, 'Back restores the existing owner history entry while the write is active');
    assert.equal(history.calls.join(','), '-1,1', 'the history traversal is reversed without replacing either entry');
    assert.equal(new URL(surface.window.location.href).searchParams.get('buscar'), 'actual');
    assert.equal(surface.exitPrompt.hidden, true, 'an active publication offers waiting, not Save or Discard');
    assert.equal(writes(requests).length, 1, 'the publication is never resent by exit handling');
  } finally {
    releasePublish?.(Response.json({ error: 'UNAVAILABLE' }, { status: 503 }));
    await settle();
  }
});

test('SiteHeader captura el alta inicial con las tres opciones y Guardar completa la navegación pendiente', async () => {
  const surface = createOwnerLinksSurface({ profile: null });
  const { link: headerLink, menu: headerMenu } = addHeaderLink(surface, '/aprender/');
  const assigned = [];
  surface.window.location.assign = (href) => assigned.push(href);
  const requests = await mountOwnerLinks({ surface, fetch: async (request) => {
    assert.equal(request.path, '/api/creador/perfil');
    assert.equal(request.method, 'PUT');
    const profile = {
      id: 'created-profile', displayName: request.body.displayName, slug: request.body.slug, version: 1,
      published: false, hidden: false, city: '', country: '', bio: '', programs: [], socials: {},
    };
    return Response.json({
      profile,
      versionChanges: [{ entity: 'profile', id: profile.id, before: 0, after: 1 }],
    });
  } });

  surface.createFields[0].value = 'Ana nueva';
  await surface.createFields[0].dispatch('input');
  surface.createFields[1].value = 'ana-nueva';
  await surface.createFields[1].dispatch('input');

  const firstClick = await headerLink.dispatch('click', { button: 0 });
  assert.equal(firstClick.defaultPrevented, true,
    'a same-tab SiteHeader link enters the owner exit choice even though it is outside the owner root');
  assert.equal(surface.exitPrompt.hidden, false);
  assert.equal(surface.exitSave.hidden, false);
  assert.equal(surface.exitDiscard.hidden, false);
  assert.equal(surface.exitContinue.hidden, false);
  assert.equal(headerMenu.hidden, true, 'the mobile SiteHeader closes its menu before the owner guard runs');

  await surface.exitContinue.dispatch('click');
  assert.equal(surface.createFields[0].value, 'Ana nueva', 'Seguir editando preserves the initial correction');
  assert.equal(surface.exitPrompt.hidden, true);
  assert.equal(surface.document.activeElement, surface.createFields[0],
    'continuing focuses the visible create form after the mobile menu closed');
  assert.deepEqual(assigned, []);

  headerMenu.hidden = false;
  headerMenu.classList.add('is-open');
  const secondClick = await headerLink.dispatch('click', { button: 0 });
  assert.equal(secondClick.defaultPrevented, true);
  await surface.exitSave.dispatch('click');
  await waitFor(() => assigned.length === 1, 'saving the initial profile did not complete the requested navigation');
  assert.deepEqual(assigned, ['/aprender/']);
  assert.equal(writes(requests).length, 1, 'the exit flow saves once and then follows the original destination');
});

test('SiteHeader conserva una corrección tardía del alta y ofrece las opciones al terminar el guardado', async () => {
  const surface = createOwnerLinksSurface({ profile: null });
  const { link: headerLink, menu: headerMenu } = addHeaderLink(surface, '/');
  const assigned = [];
  surface.window.location.assign = (href) => assigned.push(href);
  let releaseCreate;
  let markCreateStarted;
  const createStarted = new Promise((resolve) => { markCreateStarted = resolve; });
  const requests = await mountOwnerLinks({ surface, fetch: async (request) => {
    assert.equal(request.path, '/api/creador/perfil');
    assert.equal(request.body.displayName, 'Ana enviada');
    assert.equal(request.body.slug, 'ana-enviada');
    await new Promise((resolve) => {
      releaseCreate = resolve;
      markCreateStarted();
    });
    const profile = {
      id: 'created-profile', displayName: request.body.displayName, slug: request.body.slug, version: 1,
      published: false, hidden: false, city: '', country: '', bio: '', programs: [], socials: {},
    };
    return Response.json({
      profile,
      versionChanges: [{ entity: 'profile', id: profile.id, before: 0, after: 1 }],
    });
  } });

  surface.createFields[0].value = 'Ana enviada';
  await surface.createFields[0].dispatch('input');
  surface.createFields[1].value = 'ana-enviada';
  await surface.createFields[1].dispatch('input');
  const create = surface.createForm.dispatch('submit');
  await createStarted;

  surface.createFields[0].value = 'Ana corregida';
  await surface.createFields[0].dispatch('input');
  surface.createFields[1].value = 'ana-corregida';
  await surface.createFields[1].dispatch('input');
  const activeWriteClick = await headerLink.dispatch('click', { button: 0 });
  assert.equal(activeWriteClick.defaultPrevented, true, 'the header cannot navigate during the initial write');
  assert.equal(surface.exitPrompt.hidden, true, 'the in-flight request cannot be presented as discardable');
  assert.deepEqual(assigned, []);

  releaseCreate();
  await create;
  await settle();
  assert.equal(surface.createFields[0].value, 'Ana corregida');
  assert.equal(surface.createFields[1].value, 'ana-corregida');
  assert.equal(surface.createPanel.hidden, false, 'the late correction remains in the initial form');

  headerMenu.hidden = false;
  headerMenu.classList.add('is-open');
  const lateCorrectionClick = await headerLink.dispatch('click', { button: 0 });
  assert.equal(lateCorrectionClick.defaultPrevented, true);
  assert.equal(surface.exitPrompt.hidden, false, 'the completed write returns the retained correction to the three-choice guard');
  assert.equal(surface.exitSave.hidden, false);
  assert.equal(surface.exitDiscard.hidden, false);
  assert.equal(surface.exitContinue.hidden, false);
  await surface.exitContinue.dispatch('click');
  assert.equal(surface.createFields[0].value, 'Ana corregida');
  assert.equal(surface.document.activeElement, surface.createFields[0]);
  assert.equal(writes(requests).length, 1, 'the exit guard does not replay the initial creation');
  assert.deepEqual(assigned, []);
});

test('Administración usa la misma salida contextual y anclas no navegantes conservan su comportamiento', async () => {
  const surface = createOwnerLinksSurface();
  const assigned = [];
  surface.window.location.assign = (href) => assigned.push(href);
  const requests = await mountOwnerLinks({ surface, fetch: async () => Response.json({ error: 'UNEXPECTED' }, { status: 503 }) });
  const editData = surface.root.querySelector('[data-owner-edit="datos"]');
  await editData.dispatch('click');
  const displayName = surface.dataForm.elements.find(({ name }) => name === 'displayName');
  displayName.value = 'Ana corregida';
  await displayName.dispatch('input');

  const adminClick = await surface.adminNavigation.dispatch('click', { button: 0 });
  assert.equal(adminClick.defaultPrevented, true, 'Administración is guarded like the other owner destinations');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitDiscard.dispatch('click');
  assert.deepEqual(assigned, ['/cuenta/administracion/']);
  assert.equal(displayName.value, surface.profile.displayName, 'Discard resets only the unsaved profile correction');
  assert.equal(writes(requests).length, 0, 'discarding before administration performs no write');

  await editData.dispatch('click');
  displayName.value = 'Una corrección distinta';
  await displayName.dispatch('input');
  const sameUrl = new URL(surface.window.location.href);
  sameUrl.hash = '';
  surface.window.location.href = sameUrl.href;
  const sameUrlLink = new SurfaceElement({ tagName: 'A', dataset: { ownerNavigation: '' } });
  sameUrlLink.setAttribute('href', `${sameUrl.pathname}${sameUrl.search}`);
  sameUrlLink.href = `${sameUrl.pathname}${sameUrl.search}`;
  surface.root.append(sameUrlLink);
  const sameUrlClick = await sameUrlLink.dispatch('click', { button: 0 });
  assert.equal(sameUrlClick.defaultPrevented, true, 'a same-URL navigation that can reload still uses the exit guard');
  await surface.exitContinue.dispatch('click');

  const repeatedHashUrl = new URL(surface.window.location.href);
  repeatedHashUrl.hash = 'contenido';
  surface.window.location.href = repeatedHashUrl.href;
  const cases = [
    { href: '/aprender/', extra: { ctrlKey: true }, label: 'Ctrl click' },
    { href: '/aprender/', extra: {}, attributes: { target: '_blank' }, label: 'new window' },
    { href: '/descarga/', extra: {}, attributes: { download: '' }, label: 'download' },
    { href: '#', extra: {}, label: 'hash-only empty fragment' },
    { href: '#contenido', extra: {}, label: 'repeated same-document fragment' },
    { href: 'mailto:help@example.invalid', extra: {}, label: 'mail link' },
  ];
  for (const item of cases) {
    const anchor = new SurfaceElement({ tagName: 'A', dataset: { ownerNavigation: '' } });
    anchor.setAttribute('href', item.href);
    anchor.href = item.href;
    for (const [name, value] of Object.entries(item.attributes ?? {})) anchor.setAttribute(name, value);
    surface.root.append(anchor);
    const click = await anchor.dispatch('click', { button: 0, ...item.extra });
    assert.equal(click.defaultPrevented, false, `${item.label} is not trapped by the owner exit guard`);
  }
});

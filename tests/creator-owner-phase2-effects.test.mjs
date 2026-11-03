import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCreatorOwnerRuntime } from './fixtures/creator-owner-runtime.mjs';
import { createOwnerLinksSurface, jsonResponse, sharedLink, stablePlacementId, mountOwnerLinks, settle } from './fixtures/creator-owner-links-browser.mjs';
import { mountOwnerLinkMove } from './fixtures/creator-owner-link-move-browser.mjs';

async function api(runtime, path, body, method = 'PUT') {
  const response = await runtime.fetchApi(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-a' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${await response.clone().text()}`);
  return response;
}

async function ownerDto(runtime) {
  return (await api(runtime, '/api/creador/perfil/', undefined, 'GET')).json();
}

test('a link-move acknowledgement cannot change a placement outside the submitted featured group', async () => {
  const target = sharedLink({
    placementId: stablePlacementId('scope-target'), resourceId: 'scope-target',
    title: 'Destino', url: 'https://scope.example/destino', featured: false,
    position: 0, placementVersion: 4, resourceVersion: 2, series: [],
  });
  const neighbor = sharedLink({
    placementId: stablePlacementId('scope-neighbor'), resourceId: 'scope-neighbor',
    title: 'Vecino', url: 'https://scope.example/vecino', featured: false,
    position: 20, placementVersion: 6, resourceVersion: 3, series: [],
  });
  const outsideGroup = sharedLink({
    placementId: stablePlacementId('scope-featured'), resourceId: 'scope-featured',
    title: 'Destacado', url: 'https://scope.example/destacado', featured: true,
    position: 0, placementVersion: 8, resourceVersion: 7, series: [],
  });
  const malformedEffect = [
    { ...target, position: 30, placementVersion: target.placementVersion + 1 },
    { ...outsideGroup, position: 99, placementVersion: outsideGroup.placementVersion + 1 },
  ];
  const { surface } = await mountOwnerLinkMove({
    links: [target, neighbor, outsideGroup],
    override: (request) => {
      if (request.method !== 'POST' || !request.path.endsWith(`/enlaces/${target.placementId}/mover`)) return undefined;
      return jsonResponse({
        links: malformedEffect,
        versionChanges: [
          { entity: 'profile', id: 'creator-1', before: 14, after: 15 },
          { entity: 'placement', id: target.placementId, before: target.placementVersion, after: target.placementVersion + 1 },
          { entity: 'placement', id: outsideGroup.placementId, before: outsideGroup.placementVersion, after: outsideGroup.placementVersion + 1 },
        ],
      });
    },
  });

  const row = surface.table.querySelectorAll('[data-link-row]')
    .find((item) => item.dataset.linkRow === target.placementId);
  await row.querySelector('[data-link-move]').dispatch('click');
  surface.targetPosition.value = '2';
  await surface.targetPosition.dispatch('input');
  await surface.moveForm.dispatch('submit');
  await settle();

  assert.equal(surface.dialog.open, true, 'the malformed effect does not close the move editor');
  assert.notEqual(surface.moveStatus.dataset.kind, 'success');
  assert.equal(surface.root.getAttribute('data-profile-version'), '14', 'the profile receipt is not adopted');
});

test('a corrected URL uses the profile version adopted by the uncertain-attempt preflight', async () => {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  await api(runtime, '/api/creador/perfil/', { displayName: 'Ana', slug: 'ana-preflight' });
  const initial = await ownerDto(runtime);
  const surface = createOwnerLinksSurface(initial);
  let failFirstAdd = true;
  const requests = await mountOwnerLinks({
    surface,
    fetch: async (request, options) => {
      if (request.method === 'POST' && request.path === '/api/creador/enlaces' && failFirstAdd) {
        failFirstAdd = false;
        return jsonResponse({ error: 'UNAVAILABLE' }, 503);
      }
      return runtime.fetchApi(request.url, options);
    },
  });

  await surface.addOpen.dispatch('click');
  const field = (name) => surface.addForm.elements.find((item) => item.name === name);
  field('title').value = 'Enlace con verificación';
  field('url').value = 'https://example.test/attempt-one';
  field('description').value = 'Descripción';
  await surface.addForm.dispatch('submit');
  await settle();
  const firstAttempt = requests.filter(({ method, path }) => method === 'POST' && path === '/api/creador/enlaces');
  assert.equal(firstAttempt.length, 1);
  assert.equal(firstAttempt[0].status, 503);

  await api(runtime, '/api/creador/perfil/', {
    city: 'Córdoba', version: initial.profile.version,
  });
  field('url').value = 'https://example.test/attempt-two';
  await surface.addForm.dispatch('submit');
  await settle();

  const attempts = requests.filter(({ method, path }) => method === 'POST' && path === '/api/creador/enlaces');
  assert.equal(attempts.length, 2, 'the preflight does not replay the first URL');
  assert.equal(attempts[1].status, 201, 'the real service accepts the distinct corrected URL');
  assert.equal(attempts[1].body.url, 'https://example.test/attempt-two');
  assert.equal(surface.root.getAttribute('data-profile-version'), '3',
    'the owner UI applies the receipt based on the profile version adopted during preflight');
  const saved = await ownerDto(runtime);
  assert.equal(saved.profile.city, 'Córdoba');
  assert.equal(saved.profile.version, 3);
  assert.equal(saved.links.length, 1);
  assert.equal(saved.links[0].url, 'https://example.test/attempt-two');
  assert.equal(surface.addStatus.dataset.kind, 'success');
});

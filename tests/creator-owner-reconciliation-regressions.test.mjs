import assert from 'node:assert/strict';
import test from 'node:test';
import { createCreatorOwnerRuntime } from './fixtures/creator-owner-runtime.mjs';
import { SurfaceElement } from './fixtures/creator-owner-browser-dom.mjs';
import { createOwnerLinksSurface, mountOwnerLinks, settle } from './fixtures/creator-owner-links-browser.mjs';
import {
  createCreatorOwnerClaimsSurface,
  mountCreatorOwnerClaims,
  submitClaim,
  waitFor,
} from './fixtures/creator-owner-claims-browser.mjs';

async function ownerApi(runtime, path, body, method = 'PUT') {
  const response = await runtime.fetchApi(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-a' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${await response.clone().text()}`);
  return response;
}

async function ownerDto(runtime) {
  return (await ownerApi(runtime, '/api/creador/perfil/', undefined, 'GET')).json();
}

async function makeReincludeRace() {
  const runtime = await createCreatorOwnerRuntime();
  runtime.setSession('creator-a');
  await ownerApi(runtime, '/api/creador/perfil/', { displayName: 'Ana', slug: 'ana' });
  const resourceA = (await (await ownerApi(runtime, '/api/creador/enlaces/', {
    title: 'A retained', url: 'https://example.invalid/a',
  }, 'POST')).json()).link;
  const resourceB = (await (await ownerApi(runtime, '/api/creador/enlaces/', {
    title: 'B original', url: 'https://example.invalid/b', description: 'Initial description',
  }, 'POST')).json()).link;
  const beforeRemoval = await ownerDto(runtime);
  await ownerApi(runtime, `/api/creador/enlaces/${resourceA.placementId}/`, {
    profileVersion: beforeRemoval.profile.version,
  }, 'DELETE');
  const initial = await ownerDto(runtime);
  const surface = createOwnerLinksSurface(initial);
  const filters = new SurfaceElement({ tagName: 'FORM', dataset: { linkFilters: '' }, lists: [surface.searchInput] });
  filters.setAttribute('method', 'get');
  filters.elements = [surface.searchInput];
  surface.searchInput.form = filters;
  surface.root.append(filters);
  filters.ownerDocument = surface.document;
  await ownerApi(runtime, '/api/creador/enlaces/', {
    resourceId: resourceA.resourceId, resourceVersion: resourceA.resourceVersion,
  }, 'POST');

  let releaseRead;
  let signalRead;
  const readStarted = new Promise((resolve) => { signalRead = resolve; });
  let readHeld = false;
  const requests = await mountOwnerLinks({
    surface,
    fetch: async (request, options) => {
      if (request.path === '/api/creador/perfil' && request.method === 'GET' && !readHeld) {
        readHeld = true;
        const current = await ownerDto(runtime);
        const currentB = current.links.find(({ resourceId }) => resourceId === resourceB.resourceId);
        await ownerApi(runtime, `/api/creador/enlaces/${resourceB.placementId}/editar/`, {
          profileVersion: current.profile.version,
          placementVersion: currentB.placementVersion,
          resourceVersion: currentB.resourceVersion,
          title: 'B remote title', description: 'Remote description',
        }, 'PATCH');
        await ownerDto(runtime);
        const response = await runtime.fetchApi(request.url, options);
        signalRead();
        return new Promise((resolve) => { releaseRead = () => resolve(response); });
      }
      return runtime.fetchApi(request.url, options);
    },
  });
  const retry = surface.availableResources.find(({ resource }) => resource?.id === resourceA.resourceId)
    .querySelector('[data-link-reinclude]');
  await retry.dispatch('click');
  await readStarted;
  assert.equal(typeof releaseRead, 'function');

  surface.searchInput.value = 'B';
  await surface.searchInput.dispatch('input');
  await new Promise((resolve) => setTimeout(resolve, 150));
  const targetRow = surface.table.querySelectorAll('[data-link-row]')
    .find((row) => row.dataset.linkRow === resourceB.placementId);
  await targetRow.querySelector('[data-link-edit]').dispatch('click');
  const description = surface.linkFields.find(({ name }) => name === 'description');
  description.value = 'Local correction before reconciliation';
  await description.dispatch('input');
  releaseRead();
  await settle();
  await settle();
  return { runtime, surface, requests, resourceA, resourceB, retry, readStarted };
}

test('el duplicado de reincorporación no adelanta versiones detrás de una edición y su control permite reintentar', async () => {
  const scenario = await makeReincludeRace();
  const { runtime, surface, requests, resourceA, resourceB } = scenario;
  const title = surface.linkFields.find(({ name }) => name === 'title');
  const description = surface.linkFields.find(({ name }) => name === 'description');
  assert.equal(title.value, 'B original');
  assert.equal(description.value, 'Local correction before reconciliation');

  await surface.linkEditForm.dispatch('submit');
  const firstWrite = requests.find((request) => request.method === 'PATCH');
  assert.equal(firstWrite.status, 409,
    'the observed resource version remains old and the service rejects the stale edit');
  assert.equal(firstWrite.body.resourceVersion, resourceB.resourceVersion);
  assert.equal((await ownerDto(runtime)).links.find(({ resourceId }) => resourceId === resourceB.resourceId).title, 'B remote title');
  assert.equal(surface.conflict.hidden, false);
  assert.match(surface.linkStatus.textContent, /409|cambió/i);
  assert.equal(description.value, 'Local correction before reconciliation');
  const retry = surface.availableResources.find(({ resource }) => resource?.id === resourceA.resourceId)
    .querySelector('[data-link-reinclude]');
  assert.equal(retry.disabled, false, 'the existing explicit duplicate action remains usable after the write');
  await surface.linkCancel.dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false, 'leaving the stale correction requires an explicit choice');
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.dialog.open, false);
  await retry.dispatch('click');
  await settle();
  const visibleTarget = surface.table.querySelectorAll('[data-link-row]')
    .find((row) => row.dataset.linkRow === resourceB.placementId);
  assert.equal(visibleTarget.querySelector('[data-link-title]').textContent, 'B remote title',
    'the second explicit duplicate response refreshes the list after the editor closes');
  const postAttempts = requests.filter((request) => request.path === '/api/creador/enlaces' && request.method === 'POST');
  assert.equal(postAttempts.length, 2);
  assert.ok(postAttempts.every(({ status }) => status === 200), 'both explicit duplicate responses are safe no-ops');
  const final = await ownerDto(runtime);
  assert.equal(final.links.filter(({ resourceId }) => resourceId === resourceA.resourceId).length, 1);
  assert.equal(final.links.filter(({ resourceId }) => resourceId === resourceB.resourceId).length, 1);
});

function committedClaim(request, apiState) {
  const resources = (request.body.resources ?? []).map((item, index) => ({
    resourceId: item.resourceId ?? `resolved-${index + 1}`,
    url: item.url,
  }));
  const claim = {
    id: `claim-recovered-${apiState.claims.length + 1}`,
    resourceIds: resources.map(({ resourceId }) => resourceId),
    resources,
    status: 'pending',
    createdAt: Date.UTC(2026, 9, 29, 12),
    ...(typeof request.body.evidence === 'string' ? { evidence: request.body.evidence } : {}),
  };
  apiState.claims.push(claim);
}

test('el GET seguro de Solicitudes activa recuperación, rechaza otro contexto y permite continuar manualmente', async () => {
  const surface = createCreatorOwnerClaimsSurface({ query: { vista: 'solicitudes' }, claims: [], index: [] });
  let historyReads = 0;
  let sessionChecks = 0;
  const requests = await mountCreatorOwnerClaims({
    surface,
    sessionResponse: async () => {
      sessionChecks += 1;
      return sessionChecks === 1
        ? Response.json({ error: 'SESSION_CONTEXT_CHANGED' }, { status: 409 })
        : Response.json({ csrfToken: 'csrf-original-session' });
    },
    respond: (request, _index, { apiState }) => {
      if (request.path === '/api/creador/reclamaciones' && request.method === 'POST') {
        committedClaim(request, apiState);
        return Response.json({ error: 'ACK_LOST_AFTER_COMMIT' }, { status: 503 });
      }
      if (request.path === '/api/creador/perfil' && request.method === 'GET' && historyReads++ === 0) {
        return Response.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
      }
      return undefined;
    },
  });

  await surface.requestEdit.dispatch('click');
  surface.claimUrls.value = 'https://example.invalid/known';
  surface.claimEvidence.value = 'Evidencia que debe quedar disponible';
  await submitClaim(surface);
  await waitFor(() => requests.some(({ path, method }) => path === '/api/creador/reclamaciones' && method === 'POST'));
  assert.equal(surface.claimCheck.hidden, false, 'the uncertain POST offers the safe history check');
  assert.equal(surface.claimUrls.value, 'https://example.invalid/known');
  assert.equal(surface.claimEvidence.value, 'Evidencia que debe quedar disponible');

  await surface.claimCheck.dispatch('click');
  await waitFor(() => requests.some(({ path, method }) => path === '/api/creador/perfil' && method === 'GET'));
  await waitFor(() => /La sesión terminó/i.test(surface.dialog.querySelector('[data-session-recovery-status]').textContent),
    'the expired GET exposes same-account recovery');
  const signIn = surface.dialog.querySelector('[data-session-recovery-sign-in]');
  const checkSession = surface.dialog.querySelector('[data-session-recovery-check]');
  assert.equal(signIn.hidden, false);
  assert.equal(checkSession.hidden, false);
  assert.equal(surface.claimUrls.value, 'https://example.invalid/known');
  assert.equal(surface.claimEvidence.value, 'Evidencia que debe quedar disponible');

  await checkSession.dispatch('click');
  await waitFor(() => sessionChecks === 1 && /otra cuenta o tiene otros permisos/i.test(
    surface.dialog.querySelector('[data-session-recovery-status]').textContent),
  'a changed account or role binding is rejected');
  assert.equal(checkSession.hidden, false, 'the original-session recovery remains available after a mismatch');
  assert.equal(requests.filter(({ path, method }) => path === '/api/creador/reclamaciones' && method === 'POST').length, 1,
    'neither the recovery check nor the mismatch replays the uncertain POST');

  await checkSession.dispatch('click');
  await waitFor(() => sessionChecks === 2 && /Sesión comprobada/i.test(
    surface.dialog.querySelector('[data-session-recovery-status]').textContent),
  'the original account and role can be checked later');
  assert.equal(signIn.hidden, true);
  assert.equal(checkSession.hidden, true);
  assert.equal(surface.claimCheck.hidden, false, 'the owner can manually resume the GET after restoring the original session');

  await surface.claimCheck.dispatch('click');
  await waitFor(() => surface.claimHistory.querySelectorAll('[data-claim-record]').length === 1,
    'the manual history read reveals the committed request');
  const record = surface.claimHistory.querySelector('[data-claim-record]');
  assert.ok(record);
  assert.equal(record.querySelector('[data-claim-resource-id]').textContent, 'https://example.invalid/known');
  assert.equal(record.querySelector('[data-claim-evidence-text]').textContent, 'Evidencia que debe quedar disponible');
  assert.equal(surface.claimUrls.value, 'https://example.invalid/known');
  assert.equal(surface.claimEvidence.value, 'Evidencia que debe quedar disponible');
  assert.equal(requests.filter(({ path, method }) => path === '/api/creador/reclamaciones' && method === 'POST').length, 1);
  assert.deepEqual(requests.filter(({ path, method }) => path === '/api/creador/perfil' && method === 'GET')
    .map(({ status }) => status), [401, 200]);
});

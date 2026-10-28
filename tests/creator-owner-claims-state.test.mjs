import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { transform } from '@astrojs/compiler-rs';
import { experimental_AstroContainer } from 'astro/container';
import {
  createCreatorOwnerClaimsSurface,
  mountCreatorOwnerClaims,
  submitClaim,
  textOf,
  visibleText,
  waitFor,
} from './fixtures/creator-owner-claims-browser.mjs';
import { sharedLink } from './fixtures/creator-owner-links-browser.mjs';

const CLAIM_PATH = '/api/creador/reclamaciones';
const PROFILE_PATH = '/api/creador/perfil';

function savedClaim(request, id) {
  const resources = request.body.resources.map((resource, index) => ({
    resourceId: resource.resourceId ?? `resolved-${id}-${index}`,
    url: resource.url,
  }));
  return {
    id,
    resourceIds: resources.map(({ resourceId }) => resourceId),
    resources,
    status: 'pending',
    createdAt: Date.UTC(2026, 9, 28, 12),
    ...(typeof request.body.evidence === 'string' ? { evidence: request.body.evidence } : {}),
  };
}

test('503 con commit posible conserva el borrador y permite comprobar historial sin repetir el POST', async () => {
  let persistedClaim;
  const surface = createCreatorOwnerClaimsSurface({ query: { vista: 'solicitudes' }, claims: [], index: [] });
  const requests = await mountCreatorOwnerClaims({
    surface,
    respond: (request, _index, { apiState }) => {
      if (request.path !== CLAIM_PATH || request.method !== 'POST') return undefined;
      persistedClaim = savedClaim(request, 'claim-before-503');
      apiState.claims.push(persistedClaim);
      return Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 });
    },
  });
  await surface.requestEdit.dispatch('click');
  await waitFor(() => !surface.claimForm.hidden, 'request form opens');
  surface.claimUrls.value = 'https://known.example.invalid/committed';
  surface.claimEvidence.value = 'No perder si el servidor guardó antes del 503.';

  await submitClaim(surface);
  await waitFor(() => requests.filter(({ path, method }) => path === CLAIM_PATH && method === 'POST').length === 1,
    'the uncertain write returns once');
  assert.equal(surface.claimCheck.hidden, false,
    'a 503 with an uncertain commit exposes the existing read-only check');
  assert.match(surface.claimStatus.textContent, /no pudimos confirmar|resultado.*incierto/i);
  assert.match(surface.claimStatus.textContent, /comprueba solicitudes/i);
  assert.doesNotMatch(surface.claimStatus.textContent, /no pudimos guardar/i);
  assert.equal(surface.claimUrls.value, 'https://known.example.invalid/committed');
  assert.equal(surface.claimEvidence.value, 'No perder si el servidor guardó antes del 503.');

  await surface.claimCheck.dispatch('click');
  await waitFor(() => surface.claimHistory.querySelector('[data-claim-record="claim-before-503"]'),
    'Comprobar solicitudes reads the claim already stored by the service');
  assert.equal(requests.filter(({ path, method }) => path === PROFILE_PATH && method === 'GET').length, 1);
  assert.equal(requests.filter(({ path, method }) => path === CLAIM_PATH && method === 'POST').length, 1,
    'checking history does not replay the uncertain request');
  assert.match(textOf(surface.claimHistory.querySelector('[data-claim-record="claim-before-503"]')),
    /https:\/\/known\.example\.invalid\/committed/);
  assert.equal(surface.claimUrls.value, 'https://known.example.invalid/committed');
  assert.equal(surface.claimEvidence.value, 'No perder si el servidor guardó antes del 503.');
  assert.ok(persistedClaim);
  assert.doesNotMatch(visibleText(surface), /resolved-claim-before-503/);
});

test('una lectura de historial iniciada antes de un 202 posterior conserva la confirmación nueva', async () => {
  let releaseRead;
  const pendingRead = new Promise((resolve) => { releaseRead = resolve; });
  let readSnapshot;
  let writes = 0;
  const surface = createCreatorOwnerClaimsSurface({ query: { vista: 'solicitudes' }, claims: [], index: [] });
  const requests = await mountCreatorOwnerClaims({
    surface,
    respond: (request, _index, { apiState }) => {
      if (request.path === PROFILE_PATH && request.method === 'GET') {
        readSnapshot = structuredClone(apiState);
        return pendingRead.then(() => Response.json(readSnapshot));
      }
      if (request.path !== CLAIM_PATH || request.method !== 'POST') return undefined;
      writes += 1;
      const claim = savedClaim(request, `claim-${writes}`);
      apiState.claims.push(claim);
      return writes === 1
        ? Response.json({ claim, versionChanges: [{ invalid: true }] }, { status: 202 })
        : Response.json({ claim, versionChanges: [] }, { status: 202 });
    },
  });
  await surface.requestEdit.dispatch('click');
  await waitFor(() => !surface.claimForm.hidden, 'request form opens');
  surface.claimUrls.value = 'https://known.example.invalid/first';
  await submitClaim(surface);
  await waitFor(() => !surface.claimCheck.hidden, 'invalid confirmation asks for a manual history check');

  await surface.claimCheck.dispatch('click');
  await waitFor(() => requests.some(({ path, method }) => path === PROFILE_PATH && method === 'GET'),
    'the existing owner read is in flight with the first claim');
  assert.equal(readSnapshot.claims.length, 1);

  surface.claimUrls.value = 'https://known.example.invalid/second';
  await submitClaim(surface);
  await waitFor(() => surface.claimHistory.querySelector('[data-claim-record="claim-2"]'),
    'the second request is confirmed while the old read is pending');
  assert.match(surface.claimStatus.textContent, /Solicitud enviada/i);
  assert.equal(writes, 2);

  releaseRead();
  await waitFor(() => surface.claimStatus.textContent.includes('Solicitudes comprobadas.'),
    'the older read finishes');
  const history = surface.claimHistory.querySelectorAll('[data-claim-record]');
  const visibleClaimIds = new Set(history.map(({ dataset }) => dataset.claimRecord));
  assert.ok(visibleClaimIds.has('claim-1'));
  assert.ok(visibleClaimIds.has('claim-2'),
    'the read merges in the confirmed local claim that was absent when it started');
  assert.match(textOf(surface.claimHistory.querySelector('[data-claim-record="claim-2"]')),
    /https:\/\/known\.example\.invalid\/second/);
  assert.equal(requests.filter(({ path, method }) => path === CLAIM_PATH && method === 'POST').length, 2,
    'an old history read does not replay either request');
  assert.equal(surface.claimApiState.snapshot().claims.length, 2);
  assert.ok(readSnapshot);
});

test('el feedback del formulario no reemplaza el estado de una solicitud histórica', async () => {
  const surface = createCreatorOwnerClaimsSurface({ query: { vista: 'solicitudes' }, index: [] });
  // Match the real SSR order: the owner history renders before the shared dialog.
  surface.claimsSection.remove();
  const dialogIndex = surface.root.lists.indexOf(surface.dialog);
  surface.root.lists.splice(dialogIndex, 0, surface.claimsSection);
  surface.claimsSection.parentElement = surface.root;

  await mountCreatorOwnerClaims({ surface });
  const historyRecord = surface.claimHistory.querySelector('[data-claim-record="claim-existing"]');
  const historicalStatus = historyRecord.querySelector('[data-claim-status]');
  const statusBefore = historicalStatus.textContent;
  await surface.requestEdit.dispatch('click');
  await waitFor(() => !surface.claimForm.hidden, 'request form opens');
  surface.claimUrls.value = 'https://known.example.invalid/new-request';
  await submitClaim(surface);
  await waitFor(() => surface.claimStatus.textContent.includes('Solicitud enviada'),
    'the result is announced in the active request form');

  assert.equal(historicalStatus.textContent, statusBefore,
    'the legacy history badge keeps its real status');
  assert.doesNotMatch(historicalStatus.textContent, /Solicitud enviada|no pudimos/i);
});

test('Guardar y salir cierra la solicitud después de quitar una ficha compartida y enviar sólo una URL', async () => {
  const shared = sharedLink({
    resourceId: 'resource-shared',
    title: 'Ficha de otra persona',
    url: 'https://private-owner.example.invalid/shared',
    hidden: true,
    directoryApproval: 'revoked',
  });
  const surface = createCreatorOwnerClaimsSurface({
    query: { vista: 'enlaces' },
    links: [shared],
    index: [{ id: shared.resourceId, title: shared.title, url: shared.url, tipo: 'content' }],
  });
  const selectionList = surface.document.createElement('ul');
  selectionList.dataset.claimSelection = '';
  selectionList.hidden = true;
  surface.claimForm.append(selectionList);
  const requests = await mountCreatorOwnerClaims({ surface });
  await waitFor(() => requests.some(({ path, method }) => path === '/catalog-selection.json' && method === 'GET'),
    'the shared catalog finishes its initial request');

  const sharedAction = surface.root.querySelectorAll('[data-claim-open]')
    .find(({ dataset }) => dataset.resourceId === shared.resourceId);
  assert.ok(sharedAction, 'the live shared row offers a request action');
  await sharedAction.dispatch('click');
  await waitFor(() => !surface.claimForm.hidden, 'the request form opens from the shared row');

  const removeSelection = surface.claimForm.querySelector('[data-claim-deselect]');
  assert.ok(removeSelection, 'the observed shared pair is selected initially');
  assert.match(removeSelection.getAttribute('aria-label'), /Quitar Ficha de otra persona de la selección/);
  await removeSelection.dispatch('click');
  assert.equal(surface.claimForm.querySelector('[data-claim-deselect]'), null,
    'removing the chip leaves no selected shared pair');

  surface.claimUrls.value = 'https://private-owner.example.invalid/known';
  await surface.claimCancel.dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false, 'Cancel asks how to handle the URL draft');
  await surface.exitSave.dispatch('click');

  await waitFor(() => requests.filter(({ path, method }) => path === CLAIM_PATH && method === 'POST').length === 1,
    'Save and exit sends the URL-only request once');
  await waitFor(() => !surface.dialog.open, 'a confirmed Save and exit closes the owner dialog');
  const write = requests.find(({ path, method }) => path === CLAIM_PATH && method === 'POST');
  assert.deepEqual(write.body.resources, [{ url: 'https://private-owner.example.invalid/known' }],
    'the removed shared pair is absent from the submitted snapshot');
  assert.equal(surface.claimUrls.value, '', 'the successful snapshot clears the submitted URL');
  assert.match(surface.claimStatus.textContent, /Solicitud enviada/i);
  assert.equal(requests.filter(({ path, method }) => path === CLAIM_PATH && method === 'POST').length, 1,
    'closing after success does not replay the request');
});

test('un envío normal confirmado cierra el panel, restaura el foco y conserva la solicitud en el historial', async () => {
  const surface = createCreatorOwnerClaimsSurface({ query: { vista: 'solicitudes' }, claims: [], index: [] });
  const requests = await mountCreatorOwnerClaims({ surface });
  await surface.requestEdit.dispatch('click');
  await waitFor(() => !surface.claimForm.hidden, 'the request form opens from Solicitudes');
  surface.claimUrls.value = 'https://known.example.invalid/normal-submit';

  await submitClaim(surface);
  await waitFor(() => requests.filter(({ path, method }) => path === CLAIM_PATH && method === 'POST').length === 1
    && !surface.dialog.open, 'a confirmed normal submit closes the clean request panel');

  const write = requests.find(({ path, method }) => path === CLAIM_PATH && method === 'POST');
  assert.deepEqual(write.body.resources, [{ url: 'https://known.example.invalid/normal-submit' }]);
  assert.equal(surface.document.activeElement, surface.requestEdit,
    'closing restores focus to the Solicitar edición action that opened the panel');
  assert.equal(surface.claimUrls.value, '');
  assert.match(surface.pageStatus.textContent, /Solicitud enviada/i,
    'the success announcement remains available after the panel closes');
  const record = surface.claimHistory.querySelector('[data-claim-record="claim-created-1"]');
  assert.ok(record, 'the confirmed request remains in the visible history');
  assert.match(textOf(record), /https:\/\/known\.example\.invalid\/normal-submit/);
  assert.equal(requests.filter(({ path, method }) => path === CLAIM_PATH && method === 'POST').length, 1,
    'closing does not replay the confirmed request');
});

test('la etiqueta parcial se muestra en el componente SSR real y en el historial hidratado', async () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const componentPath = path.join(repoRoot, 'src/components/CreatorOwnerClaims.astro');
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const tempDir = await mkdtemp(path.join(testsDir, '.creator-owner-claims-status-ssr-'));
  let html;
  try {
    await build({
      entryPoints: { claims: componentPath },
      outdir: tempDir,
      bundle: true,
      platform: 'node',
      format: 'esm',
      packages: 'external',
      outExtension: { '.js': '.mjs' },
      plugins: [{
        name: 'creator-owner-claims-status-ssr',
        setup(api) {
          api.onLoad({ filter: /\.astro$/ }, async ({ path: filename }) => ({
            contents: (await transform(await readFile(filename, 'utf8'), {
              filename,
              internalURL: 'astro/compiler-runtime',
              resultScopedSlot: true,
              resolvePath: (specifier) => specifier,
            })).code,
            loader: 'js',
          }));
        },
      }],
    });
    const component = (await import(pathToFileURL(path.join(tempDir, 'claims.mjs')).href)).default;
    const container = await experimental_AstroContainer.create({ astroConfig: { site: 'https://dondeaprendo.example.invalid' } });
    html = await container.renderToString(component, { props: { data: {
      profile: null,
      links: [{ resourceId: 'resource-own', title: 'Ficha propia', url: 'https://owner.example.invalid/own' }],
      editableResources: [{ id: 'resource-own', title: 'Ficha propia', url: 'https://owner.example.invalid/own', description: '', version: 1 }],
      claims: [{
        id: 'claim-partial-ssr',
        resourceIds: ['resource-own', 'resource-private'],
        resources: [
          { resourceId: 'resource-own', url: 'https://owner.example.invalid/own' },
          { resourceId: 'resource-private', url: 'https://submitted.example.invalid/private' },
        ],
        status: 'partial',
        createdAt: Date.UTC(2026, 9, 28, 12),
      }],
      series: [],
    } } });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
  assert.match(html, /<strong\b[^>]*data-claim-status[^>]*>Parcialmente resuelta<\/strong>/,
    'the actual SSR component translates the partial status');
  assert.match(html, /Ficha propia/);
  assert.match(html, /https:\/\/submitted\.example\.invalid\/private/);
  assert.doesNotMatch(html, />\s*partial\s*</i);

  const surface = createCreatorOwnerClaimsSurface({
    query: { vista: 'solicitudes' },
    claims: [{
      id: 'claim-partial-client',
      resourceIds: ['resource-private'],
      resources: [{ resourceId: 'resource-private', url: 'https://submitted.example.invalid/private' }],
      status: 'partial',
      createdAt: Date.UTC(2026, 9, 28, 12),
    }],
    index: [],
  });
  await mountCreatorOwnerClaims({ surface });
  const record = surface.claimHistory.querySelector('[data-claim-record="claim-partial-client"]');
  assert.equal(record.querySelector('[data-claim-status]').textContent, 'Parcialmente resuelta',
    'the bundled owner controller keeps the translated status when it renders history');
  assert.doesNotMatch(visibleText(surface), /\bpartial\b/i);
});

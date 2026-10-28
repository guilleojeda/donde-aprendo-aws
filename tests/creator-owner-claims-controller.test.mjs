import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  catalogItem,
  claimCatalogRows,
  createCreatorOwnerClaimsSurface,
  mountCreatorOwnerClaims,
  rowResourceId,
  submitCatalogSearch,
  submitClaim,
  textOf,
  visibleControls,
  visibleText,
  waitFor,
} from './fixtures/creator-owner-claims-browser.mjs';

const INDEX_PATH = '/catalog-selection.json';
const CLAIM_PATH = '/api/creador/reclamaciones';
const PRIVATE_BINDING = 'a'.repeat(64);

function resource(index, overrides = {}) {
  return catalogItem(index, { tipo: 'content', ...overrides });
}

function claimPair(resourceId, url) {
  return { resourceId, url };
}

function normalizedResources(resources) {
  return resources.map(({ resourceId, url }) => [resourceId ?? null, url])
    .sort(([leftId, leftUrl], [rightId, rightUrl]) => String(leftId ?? leftUrl).localeCompare(String(rightId ?? rightUrl)));
}

function confirmedClaim(request, apiState, id = `claim-confirmed-${apiState.claims.length + 1}`) {
  const resources = request.body.resources.map((item, index) => ({
    resourceId: item.resourceId ?? `resolved-${index + 1}`,
    url: item.url,
  }));
  const claim = {
    id,
    resourceIds: resources.map(({ resourceId }) => resourceId),
    resources,
    status: 'pending',
    createdAt: Date.UTC(2026, 9, 28, 12),
    ...(typeof request.body.evidence === 'string' ? { evidence: request.body.evidence } : {}),
  };
  apiState.claims.push(claim);
  return Response.json({ claim, versionChanges: [] }, { status: 202 });
}

function byPath(requests, pathname, method) {
  return requests.filter(({ path, method: requestMethod }) => path === pathname && requestMethod === method);
}

function catalogCheckbox(row) {
  return row.querySelector('[data-catalog-select]');
}

async function selectResource(surface, resourceId) {
  let row = claimCatalogRows(surface).find((candidate) => rowResourceId(candidate) === resourceId);
  if (!row) {
    await submitCatalogSearch(surface, resourceId);
    await waitFor(() => claimCatalogRows(surface).some((candidate) => rowResourceId(candidate) === resourceId),
      `catalog search renders ${resourceId}`);
    row = claimCatalogRows(surface).find((candidate) => rowResourceId(candidate) === resourceId);
  }
  const checkbox = catalogCheckbox(row);
  assert.ok(checkbox, 'catalog result exposes a checkbox in request mode');
  checkbox.checked = true;
  await checkbox.dispatch('change');
  return checkbox;
}

async function openClaims(surface, trigger = surface.requestEdit) {
  await trigger.dispatch('click');
  await waitFor(() => !surface.claimForm.hidden && !surface.catalogView.hidden,
    'the request action opens the shared catalog and claim form');
}

function assertNoVisibleIds(surface, ids) {
  const text = visibleText(surface);
  const controls = visibleControls(surface).map(({ name, value }) => `${name ?? ''} ${value ?? ''}`).join('\n');
  for (const id of ids) {
    assert.doesNotMatch(text, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `visible text does not expose ${id}`);
    assert.doesNotMatch(controls, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `visible controls do not expose ${id}`);
  }
  assert.doesNotMatch(controls, /resourceIds|sourceId|32\s*KiB|payload/i,
    'the request form does not ask for legacy IDs or payload limits');
}

test('Solicitudes carga el índice común al montar y enriquece sólo con títulos públicos permitidos', async () => {
  const suppliedUrl = 'https://supplied.example.invalid/known';
  const hiddenUrl = 'https://owner.example.invalid/hidden-shared';
  const publicTitle = 'Comunidad <img src=x onerror=alert(1)> "Lambda"';
  const surface = createCreatorOwnerClaimsSurface({
    query: { vista: 'solicitudes' },
    links: [{
      placementId: 'placement-own', resourceId: 'resource-own', title: 'Guía propia',
      url: 'https://owner.example.invalid/current', featured: false, position: 0,
      selectedForDirectory: true, hidden: false, directoryApproval: 'approved',
      resourceVersion: 4, placementVersion: 9, series: [],
    }],
    editableResources: [{
      id: 'resource-own', title: 'Guía propia', url: 'https://owner.example.invalid/current', version: 4,
    }],
    claims: [{
      id: 'claim-readable',
      resourceIds: ['resource-own', 'resource-public', 'resource-url', 'resource-hidden', 'legacy-private-id'],
      resources: [
        claimPair('resource-own', 'https://old.example.invalid/previous'),
        claimPair('resource-public', 'https://catalog.example.invalid/public'),
        claimPair('resource-url', suppliedUrl),
        claimPair('resource-hidden', hiddenUrl),
      ],
      status: 'pending', createdAt: Date.UTC(2026, 9, 28, 12), evidence: 'Nota privada del dueño',
    }],
    index: [
      resource(0, { id: 'resource-own', title: 'Título público que no debe ganar', url: 'https://owner.example.invalid/current' }),
      resource(1, { id: 'resource-public', title: publicTitle, url: 'https://catalog.example.invalid/public' }),
    ],
  });

  let releaseIndex;
  const pendingIndex = new Promise((resolve) => { releaseIndex = resolve; });
  const requests = await mountCreatorOwnerClaims({
    surface,
    respond: (request) => request.path === INDEX_PATH ? pendingIndex : undefined,
  });
  await waitFor(() => byPath(requests, INDEX_PATH, 'GET').length === 1,
    'opening the requests view loads the shared public catalog on mount');
  await openClaims(surface);
  assert.equal(byPath(requests, INDEX_PATH, 'GET').length, 1,
    'opening a claim while the first load is in flight reuses the same index promise');
  releaseIndex(Response.json(surface.index));
  await waitFor(() => textOf(surface.claimHistory).includes(publicTitle),
    'public catalog titles enrich the request history after mount');

  assert.equal(byPath(requests, INDEX_PATH, 'GET').length, 1,
    'the client loads the shared index once even before the picker is opened');
  assert.equal(requests.some(({ path }) => /\/api\/creador\/recursos\//.test(path)), false,
    'enrichment never performs a private GET by resource ID');
  assert.equal(surface.claimHistory.querySelector('[data-claim-resource-id="resource-own"]').textContent,
    'Guía propia', 'an owner resource wins over a conflicting public index title and an older URL');
  assert.match(surface.claimHistory.querySelector('[data-claim-resource-id="resource-public"]').textContent, /Comunidad/,
    'the public index provides the title for a public resource');
  assert.doesNotMatch(surface.claimHistory.querySelector('[data-claim-resource-id="resource-public"]').textContent,
    /Título público que no debe ganar/);
  assert.equal(surface.claimHistory.querySelector('[data-claim-resource-id="resource-url"]').textContent,
    suppliedUrl, 'a supplied URL labels a resource absent from the public index');
  assert.equal(surface.claimHistory.querySelector('[data-claim-resource-id="resource-hidden"]').textContent,
    hiddenUrl, 'a known URL labels a private or hidden resource without revealing its title');
  assert.ok(surface.claimHistory.querySelector('[data-claim-resource-id="legacy-private-id"]').textContent.trim(),
    'a legacy ID without an authorized title uses a nonempty neutral label');
  assert.doesNotMatch(surface.claimHistory.querySelector('[data-claim-resource-id="legacy-private-id"]').textContent,
    /legacy-private-id/);
  assert.match(textOf(surface.claimHistory), /Nota privada del dueño/);
  assertNoVisibleIds(surface, ['resource-own', 'resource-public', 'resource-url', 'resource-hidden', 'legacy-private-id']);

  assert.equal(byPath(requests, INDEX_PATH, 'GET').length, 1,
    'the claim picker reuses the index promise/cache loaded for the requests view');
});

test('selección de solicitudes conserva recursos distintos con la misma URL al buscar y paginar', async () => {
  const sharedUrl = 'https://events.example.invalid/aws-community-day';
  const index = Array.from({ length: 50 }, (_, itemIndex) => resource(itemIndex));
  index[4] = resource(4, { id: 'cohost-record-a', title: 'AWS Community Day — anfitriona A', url: sharedUrl, tipo: 'event' });
  index[33] = resource(33, { id: 'cohost-record-b', title: 'AWS Community Day — anfitrión B', url: sharedUrl, tipo: 'event' });
  const hostileUrl = 'https://catalog.example.invalid/target-outside-page-one?next=%22%3Cscript%3Ealert(1)%3C%2Fscript%3E';
  const hostileTitle = `${'Guía AWS avanzada '.repeat(12)}<script>alert("x")</script> & "Lambda"`;
  index[47] = resource(47, { id: 'resource-long-title', title: hostileTitle, url: hostileUrl });
  const surface = createCreatorOwnerClaimsSurface({ query: { vista: 'solicitudes' }, index });
  const requests = await mountCreatorOwnerClaims({ surface });
  await openClaims(surface);
  await waitFor(() => claimCatalogRows(surface).length === 25,
    'the first results page is limited to 25 catalog records');

  await selectResource(surface, 'cohost-record-a');
  assert.match(surface.selectedCount.textContent, /1/);
  await surface.catalogNext.dispatch('click');
  await waitFor(() => claimCatalogRows(surface).some((row) => rowResourceId(row) === 'cohost-record-b'),
    'the second page contains the other cohost record');
  assert.equal(claimCatalogRows(surface).length, 25);
  await selectResource(surface, 'cohost-record-b');
  assert.match(surface.selectedCount.textContent, /2/,
    'cohosts sharing one URL remain distinct selected catalog resources');

  await submitCatalogSearch(surface, 'aws-community-day');
  await waitFor(() => claimCatalogRows(surface).length === 2,
    'search spans all 50 entries and finds both records outside the current page');
  assert.deepEqual(new Set(claimCatalogRows(surface).map(rowResourceId)), new Set(['cohost-record-a', 'cohost-record-b']));
  assert.ok(claimCatalogRows(surface).every((row) => catalogCheckbox(row).checked),
    'both selections remain checked after searching and pagination');
  assert.match(surface.selectedCount.textContent, /2/);

  await submitCatalogSearch(surface, 'target-outside-page-one');
  await waitFor(() => claimCatalogRows(surface).length === 1,
    'URL search finds a result outside page one across the full index');
  const hostileRow = claimCatalogRows(surface)[0];
  assert.ok(textOf(hostileRow).includes(hostileTitle), 'the complete long title is retained as text');
  assert.ok(textOf(hostileRow).includes(hostileUrl), 'the complete HTTPS destination remains available');
  assert.equal(hostileRow.querySelector('script'), null, 'catalog titles never create markup');
  assert.equal(hostileRow.querySelector('img'), null, 'HTML-like title text stays inert');
  assert.match(surface.selectedCount.textContent, /2/,
    'filtering away from selected entries does not discard them');

  surface.claimUrls.value = '  https://known.example.invalid/first\n\nhttps://known.example.invalid/second  ';
  surface.claimEvidence.value = 'Evidencia opcional y privada';
  await submitClaim(surface);
  await waitFor(() => byPath(requests, CLAIM_PATH, 'POST').length === 1,
    'the claim form posts one request containing catalog selections and known URLs');
  const write = byPath(requests, CLAIM_PATH, 'POST')[0];
  assert.equal(write.status, 202);
  assert.deepEqual(Object.keys(write.body).sort(), ['evidence', 'resources']);
  const expected = [
    claimPair('cohost-record-a', sharedUrl),
    claimPair('cohost-record-b', sharedUrl),
    { url: 'https://known.example.invalid/first' },
    { url: 'https://known.example.invalid/second' },
  ];
  assert.deepEqual(normalizedResources(write.body.resources), normalizedResources(expected),
    'selected catalog pairs stay exact and textarea URLs become separate URL-only resources');
  assert.equal(write.body.evidence, 'Evidencia opcional y privada');
  assert.doesNotMatch(JSON.stringify(write.body), /profileVersion|title|description|sourceId|resourceIds/i,
    'the request includes no profile version, catalog metadata, legacy source ID or joined ID list');
  assert.equal(byPath(requests, '/api/creador/referencias', 'POST').length, 0,
    'requesting edit permission does not call Add to my page');
  assert.equal(byPath(requests, '/api/creador/enlaces', 'POST').length, 0,
    'requesting edit permission does not create a new link');
  assertNoVisibleIds(surface, ['cohost-record-a', 'cohost-record-b', 'resource-long-title']);
});

test('el fallo o formato inválido del índice no anuncia cero ni bloquea el envío por URL conocida', async (t) => {
  const cases = [
    ['503', () => Response.json({ error: 'unavailable' }, { status: 503 })],
    ['malformado', () => Response.json({ records: 'not-an-index' })],
  ];
  for (const [name, responseForIndex] of cases) {
    await t.test(name, async () => {
      const surface = createCreatorOwnerClaimsSurface({ query: { vista: 'solicitudes' }, index: [] });
      const requests = await mountCreatorOwnerClaims({
        surface,
        respond: (request) => request.path === INDEX_PATH ? responseForIndex() : undefined,
      });
      await openClaims(surface);
      await waitFor(() => byPath(requests, INDEX_PATH, 'GET').length === 1);
      await waitFor(() => /no pudimos|inesperado|intenta/i.test(surface.catalogStatus.textContent),
        'an unavailable or malformed catalog gets an error state');
      assert.doesNotMatch(surface.catalogStatus.textContent, /0 resultados|no hay recursos|sin resultados/i);
      assert.equal(surface.catalogEmpty.hidden, true,
        'an unknown index state is not represented as a valid empty catalog');

      surface.claimUrls.value = 'https://known.example.invalid/not-indexed';
      surface.claimEvidence.value = '';
      await submitClaim(surface);
      await waitFor(() => byPath(requests, CLAIM_PATH, 'POST').length === 1,
        'manual URLs can be sent while the public index is unavailable');
      const write = byPath(requests, CLAIM_PATH, 'POST')[0];
      assert.equal(write.status, 202);
      assert.deepEqual(write.body, { resources: [{ url: 'https://known.example.invalid/not-indexed' }] });
    });
  }
});

test('una ficha compartida se puede preseleccionar por su URL aunque no esté en el índice público', async () => {
  const sharedUrl = 'https://private-owner.example.invalid/shared-hidden';
  const surface = createCreatorOwnerClaimsSurface({
    query: { vista: 'enlaces' },
    links: [{
      placementId: 'placement-hidden-shared', resourceId: 'resource-hidden-shared',
      title: 'Ficha compartida oculta', url: sharedUrl, featured: false,
      position: 0, selectedForDirectory: false, hidden: true,
      directoryApproval: 'revoked', resourceVersion: 12, placementVersion: 8, series: [],
    }],
    index: [],
  });
  const requests = await mountCreatorOwnerClaims({
    surface,
    respond: (request) => request.path === INDEX_PATH
      ? Response.json({ error: 'temporarily-unavailable' }, { status: 503 })
      : undefined,
  });
  await surface.rows[0].claimOpen.dispatch('click');
  await waitFor(() => !surface.claimForm.hidden && !surface.catalogView.hidden,
    'the shared link request action opens the common request form');
  await waitFor(() => byPath(requests, INDEX_PATH, 'GET').length === 1);
  assert.match(surface.catalogStatus.textContent, /no pudimos|intenta/i);

  await submitClaim(surface);
  await waitFor(() => byPath(requests, CLAIM_PATH, 'POST').length === 1,
    'the owner can request edit access for a known shared row without a public index hit');
  const write = byPath(requests, CLAIM_PATH, 'POST')[0];
  assert.equal(write.status, 202);
  assert.ok(write.body.resources.some((item) => item.resourceId === 'resource-hidden-shared' && item.url === sharedUrl),
    'the row action sends the exact ID/URL pair already present in the owner DTO');
  assert.equal(byPath(requests, '/api/creador/referencias', 'POST').length, 0);
  assert.equal(requests.some(({ path }) => /\/api\/creador\/recursos\//.test(path)), false,
    'requesting edit permission does not fetch a private title by ID');
  assertNoVisibleIds(surface, ['resource-hidden-shared', 'placement-hidden-shared']);
});

test('409 por un par observado viejo requiere revisar el índice y volver a confirmar la selección', async () => {
  const oldItem = resource(0, { id: 'resource-stale-pair', title: 'Título público anterior', url: 'https://catalog.example.invalid/old' });
  const currentItem = { ...oldItem, title: 'Título público actual', url: 'https://catalog.example.invalid/current' };
  let indexReads = 0;
  let claimWrites = 0;
  const surface = createCreatorOwnerClaimsSurface({ query: { vista: 'solicitudes' }, index: [oldItem] });
  const requests = await mountCreatorOwnerClaims({
    surface,
    respond: (request, _index, { apiState }) => {
      if (request.path === INDEX_PATH && request.method === 'GET') {
        indexReads += 1;
        return Response.json(indexReads === 1 ? [oldItem] : [currentItem]);
      }
      if (request.path === CLAIM_PATH && request.method === 'POST') {
        claimWrites += 1;
        if (claimWrites === 1) return Response.json({
          error: 'RESOURCE_URL_CONFLICT',
          title: 'Título privado devuelto por error',
        }, { status: 409 });
        return confirmedClaim(request, apiState, 'claim-after-reconfirm');
      }
      return undefined;
    },
  });
  await openClaims(surface);
  await selectResource(surface, oldItem.id);
  await submitClaim(surface);
  await waitFor(() => byPath(requests, CLAIM_PATH, 'POST').length === 1);
  assert.equal(surface.claimForm.hidden, false);
  assert.equal(surface.claimStatus.textContent.includes('Título privado devuelto por error'), false,
    'a conflict response does not render untrusted private titles');
  assert.ok(catalogCheckbox(claimCatalogRows(surface)[0]).checked,
    'the observed selection remains available to review');
  assert.equal(byPath(requests, CLAIM_PATH, 'POST').length, 1,
    'a stale pair is never resent automatically');

  if (surface.catalogRetry.hidden) {
    await waitFor(() => byPath(requests, INDEX_PATH, 'GET').length >= 2,
      'the stale-pair flow refreshes the shared index for review');
  } else {
    await surface.catalogRetry.dispatch('click');
  }
  await waitFor(() => indexReads >= 2 && claimCatalogRows(surface).length === 1,
    'the owner can review the updated public pair');
  assert.match(textOf(claimCatalogRows(surface)[0]), /Título público actual/);
  assert.equal(byPath(requests, CLAIM_PATH, 'POST').length, 1);

  let checkbox = catalogCheckbox(claimCatalogRows(surface)[0]);
  if (checkbox.checked) {
    checkbox.checked = false;
    await checkbox.dispatch('change');
  }
  checkbox.checked = true;
  await checkbox.dispatch('change');
  await submitClaim(surface);
  await waitFor(() => byPath(requests, CLAIM_PATH, 'POST').length === 2,
    'only explicit re-selection allows another write');
  assert.deepEqual(byPath(requests, CLAIM_PATH, 'POST')[1].body.resources,
    [claimPair(oldItem.id, currentItem.url)],
    'the confirmed retry carries the current observed URL, not the stale pair');
  assert.equal(byPath(requests, CLAIM_PATH, 'POST')[1].status, 202);
});

test('doble envío y cambios tardíos conservan el snapshot enviado y dejan la nueva intención en la misma solicitud', async () => {
  const index = [resource(0, { id: 'resource-first', title: 'Primera guía', url: 'https://catalog.example.invalid/first' }),
    resource(1, { id: 'resource-later', title: 'Segunda guía', url: 'https://catalog.example.invalid/later' })];
  const surface = createCreatorOwnerClaimsSurface({ query: { vista: 'solicitudes' }, index });
  let releaseFirst;
  const firstResponse = new Promise((resolve) => { releaseFirst = resolve; });
  let writesSeen = 0;
  const requests = await mountCreatorOwnerClaims({
    surface,
    respond: (request, _index, { apiState }) => {
      if (request.path !== CLAIM_PATH || request.method !== 'POST') return undefined;
      writesSeen += 1;
      if (writesSeen === 1) return firstResponse.then(() => confirmedClaim(request, apiState, 'claim-first-snapshot'));
      return confirmedClaim(request, apiState, 'claim-later-snapshot');
    },
  });
  await openClaims(surface);
  await selectResource(surface, 'resource-first');
  surface.claimUrls.value = 'https://known.example.invalid/sent';
  surface.claimEvidence.value = 'evidencia enviada';

  const firstSubmit = submitClaim(surface);
  await waitFor(() => byPath(requests, CLAIM_PATH, 'POST').length === 1,
    'the initial write is pending');
  const firstWrite = byPath(requests, CLAIM_PATH, 'POST')[0];
  assert.deepEqual(normalizedResources(firstWrite.body.resources), normalizedResources([
    claimPair('resource-first', 'https://catalog.example.invalid/first'),
    { url: 'https://known.example.invalid/sent' },
  ]));

  await selectResource(surface, 'resource-later');
  surface.claimUrls.value = 'https://known.example.invalid/edited-during-send';
  surface.claimEvidence.value = 'evidencia editada durante el envío';
  await submitClaim(surface);
  assert.equal(byPath(requests, CLAIM_PATH, 'POST').length, 1,
    'a second submit while the first request is in flight does not duplicate the write');

  releaseFirst();
  await firstSubmit;
  assert.equal(surface.claimForm.hidden, false,
    'late corrections keep the same request form open after the first response');
  assert.equal(surface.claimUrls.value, 'https://known.example.invalid/edited-during-send');
  assert.equal(surface.claimEvidence.value, 'evidencia editada durante el envío');
  const laterCheckbox = claimCatalogRows(surface)
    .find((row) => rowResourceId(row) === 'resource-later') && catalogCheckbox(claimCatalogRows(surface)
      .find((row) => rowResourceId(row) === 'resource-later'));
  assert.ok(laterCheckbox?.checked, 'the selection made during the request remains pending');
  const firstHistory = surface.claimHistory.querySelector('[data-claim-record="claim-first-snapshot"]');
  assert.ok(firstHistory, 'a valid 202 records the confirmed request snapshot');
  assert.match(textOf(firstHistory), /Primera guía|https:\/\/catalog\.example\.invalid\/first/);
  assert.doesNotMatch(textOf(firstHistory), /Segunda guía|edited-during-send|evidencia editada/,
    'the response does not confirm corrections that were not in its snapshot');

  await surface.claimCancel.dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false, 'Cancel opens the shared pending-changes guard');
  await surface.exitContinue.dispatch('click');
  assert.equal(surface.claimForm.hidden, false);
  assert.equal(surface.claimUrls.value, 'https://known.example.invalid/edited-during-send');
  assert.equal(surface.claimEvidence.value, 'evidencia editada durante el envío');
  assert.ok(laterCheckbox.checked);

  await surface.dialog.dispatch('cancel');
  assert.equal(surface.exitPrompt.hidden, false, 'Escape uses the same pending-changes guard');
  await surface.exitContinue.dispatch('click');
  const navigationEvent = await surface.navigation.dispatch('click', { button: 0 });
  assert.equal(navigationEvent.defaultPrevented, true,
    'navigation waits for the owner to save, discard or continue editing');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitSave.dispatch('click');
  await waitFor(() => byPath(requests, CLAIM_PATH, 'POST').length === 2,
    'Save and exit submits the remaining correction once');
  const secondWrite = byPath(requests, CLAIM_PATH, 'POST')[1];
  assert.deepEqual(Object.keys(secondWrite.body).sort(), ['evidence', 'resources']);
  assert.deepEqual(normalizedResources(secondWrite.body.resources), normalizedResources([
    claimPair('resource-later', 'https://catalog.example.invalid/later'),
    { url: 'https://known.example.invalid/edited-during-send' },
  ]), 'the second action sends only the pending selection and current known URL');
  assert.equal(secondWrite.body.evidence, 'evidencia editada durante el envío');
  await waitFor(() => secondWrite.status === 202);
  assert.equal(byPath(requests, CLAIM_PATH, 'POST').length, 2,
    'neither Save nor the navigation guard replays the first request');
});

test('Descartar sólo elimina selección, evidencia y URLs después de la decisión explícita', async () => {
  const item = resource(0, { id: 'resource-discard', title: 'Guía para descartar', url: 'https://catalog.example.invalid/discard' });
  const surface = createCreatorOwnerClaimsSurface({ query: { vista: 'solicitudes' }, index: [item] });
  const requests = await mountCreatorOwnerClaims({ surface });
  await openClaims(surface);
  await selectResource(surface, item.id);
  surface.claimUrls.value = 'https://known.example.invalid/discard';
  surface.claimEvidence.value = 'evidencia local';

  await surface.claimCancel.dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false,
    'Cancel asks before discarding a request with pending work');
  await surface.exitContinue.dispatch('click');
  assert.equal(surface.claimUrls.value, 'https://known.example.invalid/discard');
  assert.equal(surface.claimEvidence.value, 'evidencia local');
  assert.ok(catalogCheckbox(claimCatalogRows(surface)[0]).checked);

  await surface.claimCancel.dispatch('click');
  assert.equal(surface.exitPrompt.hidden, false);
  await surface.exitDiscard.dispatch('click');
  assert.equal(surface.dialog.open, false, 'the user can explicitly discard and leave the editor');
  assert.equal(byPath(requests, CLAIM_PATH, 'POST').length, 0,
    'discard never sends the request');

  await openClaims(surface);
  assert.equal(surface.claimUrls.value, '', 'discarded URLs do not return when the form is reopened');
  assert.equal(surface.claimEvidence.value, '', 'discarded evidence does not return when the form is reopened');
  assert.equal(surface.selectedCount.textContent.match(/\d+/)?.[0] ?? '0', '0',
    'discarded catalog selections do not remain silently selected');
});

test('202 incierto o inválido conserva contexto y solicita comprobar Solicitudes sin repetir el envío', async () => {
  const item = resource(0, { id: 'resource-selected', title: 'Guía seleccionada', url: 'https://catalog.example.invalid/selected' });
  const surface = createCreatorOwnerClaimsSurface({ query: { vista: 'solicitudes' }, index: [item] });
  const requests = await mountCreatorOwnerClaims({
    surface,
    respond: (request, _index, { apiState }) => {
      if (request.path !== CLAIM_PATH || request.method !== 'POST') return undefined;
      confirmedClaim(request, apiState, 'claim-stored-after-uncertain-ack');
      return Response.json({
        claim: {
          id: 'claim-unrelated', resourceIds: ['other-resource'],
          resources: [claimPair('other-resource', 'https://other.example.invalid/item')],
          status: 'pending', createdAt: Date.UTC(2026, 9, 28, 12),
        }, versionChanges: [],
      }, { status: 202 });
    },
  });
  await openClaims(surface);
  await selectResource(surface, item.id);
  surface.claimUrls.value = 'https://known.example.invalid/known';
  surface.claimEvidence.value = 'no perder';
  await submitClaim(surface);
  await waitFor(() => byPath(requests, CLAIM_PATH, 'POST').length === 1);

  assert.equal(surface.claimForm.hidden, false);
  assert.match(surface.claimStatus.textContent, /comprobar|revisar|no pudimos|resultado/i,
    'a malformed confirmation is reported as uncertain rather than silent success');
  assert.equal(surface.claimCheck.hidden, false,
    'the owner can check the request list after an uncertain response');
  assert.equal(surface.claimUrls.value, 'https://known.example.invalid/known');
  assert.equal(surface.claimEvidence.value, 'no perder');
  assert.ok(catalogCheckbox(claimCatalogRows(surface)[0]).checked);
  assert.doesNotMatch(visibleText(surface), /other-resource|other\.example\.invalid/,
    'the mismatched 202 receipt is not rendered as trusted history');
  assert.equal(byPath(requests, CLAIM_PATH, 'POST').length, 1,
    'an uncertain 202 never automatically resends the request');

  const profileReadsBeforeCheck = byPath(requests, '/api/creador/perfil', 'GET').length;
  const requestCountBeforeCheck = requests.length;
  const writesBeforeCheck = byPath(requests, CLAIM_PATH, 'POST').length;
  await surface.claimCheck.dispatch('click');
  await waitFor(() => byPath(requests, '/api/creador/perfil', 'GET').length > profileReadsBeforeCheck,
    'Comprobar solicitudes reads the owner DTO and its claims');
  const checkRequests = requests.slice(requestCountBeforeCheck);
  assert.equal(checkRequests.length, 1,
    'checking the request list uses one existing owner read, with no resource lookup');
  assert.deepEqual(checkRequests.map(({ method }) => method), ['GET']);
  assert.equal(checkRequests[0].path, '/api/creador/perfil');
  assert.equal(byPath(requests, CLAIM_PATH, 'POST').length, writesBeforeCheck,
    'checking history does not send the request again');
  await waitFor(() => surface.claimHistory.querySelector('[data-claim-record="claim-stored-after-uncertain-ack"]'),
    'the request read from the owner DTO is rendered in the history');
  const storedHistory = surface.claimHistory.querySelector('[data-claim-record="claim-stored-after-uncertain-ack"]');
  assert.match(textOf(storedHistory), /https:\/\/known\.example\.invalid\/known/,
    'the real history uses the submitted URL when it has no permitted title');
  assert.doesNotMatch(textOf(storedHistory), /claim-stored-after-uncertain-ack|resource-selected|resolved-2/,
    'the history exposes readable labels rather than internal claim or resource IDs');
  assert.doesNotMatch(textOf(surface.claimHistory), /claim-unrelated|other-resource|other\.example\.invalid/);
  assert.equal(surface.claimUrls.value, 'https://known.example.invalid/known');
  assert.equal(surface.claimEvidence.value, 'no perder');
  assert.ok(catalogCheckbox(claimCatalogRows(surface)[0]).checked,
    'the draft remains available after history reconciliation');
});

test('errores de autoridad, par viejo, URL ausente y servicio preservan datos y no hacen replay', async (t) => {
  const cases = [
    { name: '403', status: 403, error: 'FORBIDDEN' },
    { name: '404 URL no encontrada', status: 404, error: 'RESOURCE_NOT_FOUND' },
    { name: '503', status: 503, error: 'UNAVAILABLE' },
  ];
  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const item = resource(0, { id: `resource-${entry.status}`, title: 'Título público permitido', url: 'https://catalog.example.invalid/current' });
      let failureUsed = false;
      const surface = createCreatorOwnerClaimsSurface({ query: { vista: 'solicitudes' }, index: [item] });
      const requests = await mountCreatorOwnerClaims({
        surface,
        respond: (request) => {
          if (request.path === CLAIM_PATH && request.method === 'POST' && !failureUsed) {
            failureUsed = true;
            return Response.json({ error: entry.error }, { status: entry.status });
          }
          return undefined;
        },
      });
      await openClaims(surface);
      await selectResource(surface, item.id);
      surface.claimUrls.value = 'https://known.example.invalid/retain';
      surface.claimEvidence.value = 'evidencia que permanece';
      await submitClaim(surface);
      await waitFor(() => byPath(requests, CLAIM_PATH, 'POST').length === 1);

      assert.equal(surface.claimForm.hidden, false);
      assert.equal(surface.claimUrls.value, 'https://known.example.invalid/retain');
      assert.equal(surface.claimEvidence.value, 'evidencia que permanece');
      assert.ok(catalogCheckbox(claimCatalogRows(surface)[0]).checked);
      assert.equal(surface.claimStatus.textContent.length > 0, true,
        'the error has feedback in the request form');
      assert.equal(byPath(requests, CLAIM_PATH, 'POST').length, 1,
        'the user must choose whether to retry after each failure');
      assert.equal(requests.some(({ path }) => /\/api\/creador\/recursos\//.test(path)), false,
        'error recovery does not fetch private resource metadata by ID');

      if (entry.status === 404) {
        surface.claimUrls.value = 'https://known.example.invalid/corrected';
        await submitClaim(surface);
        await waitFor(() => byPath(requests, CLAIM_PATH, 'POST').length === 2);
        const corrected = byPath(requests, CLAIM_PATH, 'POST')[1].body;
        assert.deepEqual(normalizedResources(corrected.resources), normalizedResources([
          claimPair(item.id, item.url), { url: 'https://known.example.invalid/corrected' },
        ]), 'a missing known URL can be corrected manually without dropping the catalog pair');
        assert.equal(corrected.evidence, 'evidencia que permanece');
      }
    });
  }
});

test('401 y CSRF requieren recuperación de la misma sesión y reintento manual; otra cuenta queda bloqueada', async (t) => {
  const item = resource(0, { id: 'resource-recovery', title: 'Recurso público', url: 'https://catalog.example.invalid/recovery' });
  for (const failure of [
    { name: '401 expiración', status: 401, error: 'UNAUTHENTICATED', sessionStatus: 200, csrfToken: 'csrf-refreshed' },
    { name: '403 CSRF', status: 403, error: 'CSRF_REJECTED', sessionStatus: 200, csrfToken: 'csrf-refreshed' },
    { name: 'identidad o rol distinto', status: 401, error: 'UNAUTHENTICATED', sessionStatus: 409, sessionError: 'SESSION_CONTEXT_CHANGED' },
  ]) {
    await t.test(failure.name, async () => {
      let firstWrite = true;
      const surface = createCreatorOwnerClaimsSurface({ query: { vista: 'solicitudes' }, index: [item] });
      const requests = await mountCreatorOwnerClaims({
        surface,
        sessionResponse: async () => Response.json(
          failure.sessionStatus === 200 ? { csrfToken: failure.csrfToken } : { error: failure.sessionError },
          { status: failure.sessionStatus },
        ),
        respond: (request, _index, { apiState }) => {
          if (request.path === CLAIM_PATH && request.method === 'POST' && firstWrite) {
            firstWrite = false;
            return Response.json({ error: failure.error }, { status: failure.status });
          }
          if (request.path === CLAIM_PATH && request.method === 'POST') return confirmedClaim(request, apiState);
          return undefined;
        },
      });
      await openClaims(surface);
      await selectResource(surface, item.id);
      surface.claimUrls.value = 'https://known.example.invalid/recovery';
      surface.claimEvidence.value = 'contexto de recuperación';
      await submitClaim(surface);
      await waitFor(() => byPath(requests, CLAIM_PATH, 'POST').length === 1);
      assert.equal(surface.claimUrls.value, 'https://known.example.invalid/recovery');
      assert.equal(surface.claimEvidence.value, 'contexto de recuperación');
      assert.ok(catalogCheckbox(claimCatalogRows(surface)[0]).checked);

      const check = surface.dialog.querySelector('[data-session-recovery-check]');
      assert.ok(check && !check.hidden, 'session recovery is available in the active dialog');
      await check.dispatch('click');
      await waitFor(() => byPath(requests, '/api/creador/sesion', 'GET').length === 1);
      assert.equal(requests.find(({ path }) => path === '/api/creador/sesion').headers.get('X-Creator-Page-Binding'),
        PRIVATE_BINDING);
      assert.equal(byPath(requests, CLAIM_PATH, 'POST').length, 1,
        'checking the session never replays the claim automatically');

      if (failure.sessionStatus === 200) {
        await submitClaim(surface);
        await waitFor(() => byPath(requests, CLAIM_PATH, 'POST').length === 2,
          'the same account may manually retry after the session check');
        assert.equal(byPath(requests, CLAIM_PATH, 'POST')[1].headers.get('x-csrf-token'), failure.csrfToken);
        assert.equal(byPath(requests, CLAIM_PATH, 'POST')[0].headers.get('x-csrf-token'), 'csrf-a');
        assert.equal(byPath(requests, CLAIM_PATH, 'POST')[1].status, 202);
      } else {
        await submitClaim(surface);
        assert.equal(byPath(requests, CLAIM_PATH, 'POST').length, 1,
          'a changed account or role blocks manual retry from the stale owner context');
        assert.match(surface.dialog.querySelector('[data-session-recovery-status]').textContent,
          /otra cuenta|permisos originales/i);
      }
    });
  }
});

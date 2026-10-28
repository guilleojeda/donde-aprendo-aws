import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  claimCatalogRows,
  createCreatorOwnerClaimsSurface,
  mountCreatorOwnerClaims,
  waitFor,
} from './fixtures/creator-owner-claims-browser.mjs';

test('un catálogo ya cargado no cuenta sus casillas dinámicas como cambios antes de Solicitar edición', async () => {
  const shared = {
    placementId: 'placement-shared',
    resourceId: 'resource-shared',
    title: 'Guía compartida',
    url: 'https://catalog.example.invalid/shared',
    featured: false,
    position: 0,
    selectedForDirectory: false,
    hidden: true,
    directoryApproval: 'revoked',
    resourceVersion: 2,
    placementVersion: 3,
    series: [],
  };
  const surface = createCreatorOwnerClaimsSurface({
    query: { vista: 'enlaces' },
    links: [shared],
    index: [{ id: shared.resourceId, title: shared.title, url: shared.url, tipo: 'content' }],
  });
  await mountCreatorOwnerClaims({ surface });
  await waitFor(() => claimCatalogRows(surface).length === 1,
    'the common index is loaded before the owner clicks the shared-row action');

  const searchForm = surface.catalogSearchForm;
  searchForm.setAttribute('id', 'owner-catalog-search-form');
  searchForm.setAttribute('method', 'get');
  const checkboxes = claimCatalogRows(surface).flatMap((row) => row.querySelectorAll('[data-catalog-select]'));
  assert.equal(checkboxes.length, 1);
  for (const checkbox of checkboxes) {
    assert.equal(checkbox.getAttribute('form'), 'owner-catalog-search-form',
      'generated catalog controls belong to the GET search form and are outside generic draft tracking');
    // SurfaceElement does not implement the browser's native `form` owner lookup.
    // Model that platform relationship so the shared draft tracker sees the same boundary.
    checkbox.form = searchForm;
  }

  const requestButton = surface.root.querySelectorAll('[data-claim-open]')
    .find(({ dataset }) => dataset.resourceId === shared.resourceId);
  assert.ok(requestButton, 'the live shared row still exposes its request action after mount');
  await requestButton.dispatch('click');

  assert.equal(surface.exitPrompt.hidden, true,
    'the catalog list alone does not trigger the unsaved-changes guard');
  assert.equal(surface.dialog.open, true);
  assert.equal(surface.claimForm.hidden, false,
    'the first click opens the request form in the contextual dialog');
  assert.equal(surface.dialogTitle.textContent, 'Solicitar edición');
});

import assert from 'node:assert/strict';
import {
  test,
  expect,
  api,
  createSeries,
  addLink,
  addChapter,
  captureCreatorApi,
  openSeriesView,
  loggedInOwner,
} from '../fixtures/creator-browser-test.mjs';

async function openLinksView(page, fixture) {
  await page.goto(`${fixture.origin}/cuenta/?vista=enlaces`);
  await expect(page.locator('[data-creator-owner]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Enlaces', exact: true })).toBeVisible();
}

function receiptsFrom(record) {
  return record.responseBody?.versionChanges ?? [];
}

function sortedReceipts(changes) {
  return [...changes].sort((left, right) => `${left.entity}:${left.id}`.localeCompare(`${right.entity}:${right.id}`));
}

function transactionCount(fixture) {
  return fixture.creatorStore.calls.filter(({ operation }) => operation === 'transact').length;
}

async function rawMoveState(fixture, cookie, links, series) {
  const owner = await fixture.rawOwner(cookie);
  const placements = await Promise.all(links.map(({ placementId }) => fixture.rawPlacement(cookie, placementId)));
  const resources = await Promise.all(links.map(({ resourceId }) => fixture.rawResource(resourceId)));
  const storedSeries = await Promise.all(series.map(({ id }) => fixture.rawSeries(cookie, id)));
  return {
    profile: owner.profile,
    placements: placements.sort((left, right) => left.id.localeCompare(right.id)),
    resources: resources.sort((left, right) => left.id.localeCompare(right.id)),
    series: storedSeries.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function orderIds(placements, movementKind, seriesId) {
  const position = (placement) => movementKind === 'link'
    ? placement.position
    : placement.series[seriesId].position;
  return placements
    .filter((placement) => movementKind === 'link' || Object.hasOwn(placement.series ?? {}, seriesId))
    .sort((left, right) => position(left) - position(right) || left.id.localeCompare(right.id))
    .map(({ id }) => id);
}

function ownerDtoOrderIds(links, movementKind, seriesId) {
  return links.map((link) => ({
    placementId: link.placementId,
    position: movementKind === 'link'
      ? link.position
      : link.series.find((membership) => membership.seriesId === seriesId)?.position,
  })).filter(({ position }) => Number.isSafeInteger(position))
    .sort((left, right) => left.position - right.position || left.placementId.localeCompare(right.placementId))
    .map(({ placementId }) => placementId);
}

async function publishOwner(fixture, cookie) {
  const owner = await fixture.rawOwner(cookie);
  const result = await api(fixture, cookie, '/api/creador/perfil/publicar', {
    method: 'POST', body: { version: owner.profile.version },
  });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body.profile;
}

async function publicOrder(fixture, movementKind, profileSlug, seriesSlug) {
  if (movementKind === 'link') {
    const result = await fixture.creatorRuntime.service.readPublicProfile(profileSlug);
    assert.equal(result.status, 200);
    return result.links.map(({ placementId }) => placementId);
  }
  const result = await fixture.creatorRuntime.service.readPublicSeries(profileSlug, seriesSlug);
  assert.equal(result.status, 200);
  return result.links.map(({ placementId }) => placementId);
}

for (const movementKind of ['link', 'chapter']) {
  test(`movimiento de ${movementKind === 'link' ? 'enlace' : 'capítulo'}: conflicto compara y adopta el orden completo conservando el destino`, async ({ fixture, page }) => {
    const cookie = await loggedInOwner(fixture, page);
    const series = await createSeries(fixture, cookie, {
      name: `Serie de conflicto ${movementKind}`,
      slug: `serie-conflicto-${movementKind}`,
    });
    const otherSeries = await createSeries(fixture, cookie, {
      name: `Serie ajena ${movementKind}`,
      slug: `serie-ajena-conflicto-${movementKind}`,
    });
    const target = await addLink(fixture, cookie, {
      title: 'Destino que sigue seleccionado', url: `https://links.example/conflicto-${movementKind}-target`,
    });
    const neighbor = await addLink(fixture, cookie, {
      title: 'Vecino que cambia de lugar', url: `https://links.example/conflicto-${movementKind}-neighbor`,
    });
    const movedExternally = await addLink(fixture, cookie, {
      title: 'Enlace que cambia el orden guardado', url: `https://links.example/conflicto-${movementKind}-external`,
    });
    if (movementKind === 'chapter') {
      await addChapter(fixture, cookie, series.id, target.placementId);
      await addChapter(fixture, cookie, series.id, neighbor.placementId);
      await addChapter(fixture, cookie, series.id, movedExternally.placementId);
      await addChapter(fixture, cookie, otherSeries.id, target.placementId);
    }
    const publicProfile = await publishOwner(fixture, cookie);
    const initial = await rawMoveState(fixture, cookie, [target, neighbor, movedExternally], [series, otherSeries]);
    const initialIds = [target.placementId, neighbor.placementId, movedExternally.placementId];
    assert.deepEqual(orderIds(initial.placements, movementKind, series.id), initialIds,
      'the target starts first and the other two rows begin in a known insertion order');
    assert.deepEqual(await publicOrder(fixture, movementKind, publicProfile.slug, series.slug), initialIds,
      'the public projection starts in the independently known order');

    if (movementKind === 'chapter') await openSeriesView(page, fixture, `&serie=${encodeURIComponent(series.id)}`);
    else await openLinksView(page, fixture);
    const rowSelector = movementKind === 'link'
      ? `[data-link-row="${target.placementId}"]`
      : `[data-chapter-row="${target.placementId}"]`;
    const row = page.locator(rowSelector);
    await expect(row).toBeVisible();
    const moveButton = row.locator(movementKind === 'link' ? '[data-link-move]' : '[data-chapter-move]');
    await moveButton.click();
    const form = page.locator(`[data-owner-dialog] form[data-owner-form="${movementKind === 'link' ? 'mover-enlace' : 'mover-capitulo'}"]`);
    const positionLabel = movementKind === 'link' ? 'Posición dentro del grupo' : 'Posición en esta serie';
    const positionInput = form.getByLabel(positionLabel, { exact: true });
    const save = form.getByRole('button', { name: 'Guardar posición', exact: true });
    await expect(positionInput).toHaveValue('1');
    const chosenPosition = 3;
    await positionInput.fill(String(chosenPosition));

    const initialTarget = initial.placements.find(({ id }) => id === target.placementId);
    const initialExternal = initial.placements.find(({ id }) => id === movedExternally.placementId);
    const initialSeries = initial.series.find(({ id }) => id === series.id);
    const externalPath = movementKind === 'link'
      ? `/api/creador/enlaces/${movedExternally.placementId}/mover`
      : `/api/creador/series/${series.id}/capitulos/${movedExternally.placementId}/mover`;
    const externalBody = movementKind === 'link'
      ? { profileVersion: initial.profile.version, placementVersion: initialExternal.version, targetPosition: 1 }
      : { profileVersion: initial.profile.version, seriesVersion: initialSeries.version,
        placementVersion: initialExternal.version, targetPosition: 1 };
    const externalMove = await api(fixture, cookie, externalPath, { method: 'POST', body: externalBody });
    assert.equal(externalMove.response.status, 200, JSON.stringify(externalMove.body));
    const afterExternal = await rawMoveState(fixture, cookie, [target, neighbor, movedExternally], [series, otherSeries]);
    const externalOrder = [movedExternally.placementId, target.placementId, neighbor.placementId];
    assert.deepEqual(orderIds(afterExternal.placements, movementKind, series.id), externalOrder,
      'the external real command installs a different complete order before the stale browser submission');
    assert.deepEqual(await publicOrder(fixture, movementKind, publicProfile.slug, series.slug), externalOrder,
      'the saved public view reflects the external order change');
    assert.equal(afterExternal.profile.version, initial.profile.version + 1);
    const initialPlacementsById = new Map(initial.placements.map((placement) => [placement.id, placement]));
    const afterExternalPlacementReceipts = afterExternal.placements
      .filter((placement) => placement.version !== initialPlacementsById.get(placement.id).version)
      .map((placement) => ({
        entity: 'placement', id: placement.id,
        before: initialPlacementsById.get(placement.id).version, after: placement.version,
      }));
    assert.deepEqual(sortedReceipts(externalMove.body.versionChanges), sortedReceipts([
      { entity: 'profile', id: initial.profile.id, before: initial.profile.version, after: afterExternal.profile.version },
      ...afterExternalPlacementReceipts,
    ]), 'the real external command receipts match the exact profile and raw placement versions it changed');
    assert.deepEqual(afterExternal.resources, initial.resources, 'the ordering command does not modify resource records');
    assert.deepEqual(afterExternal.series, initial.series, 'ordering does not modify either series record');
    if (movementKind === 'chapter') {
      const targetAfterExternal = afterExternal.placements.find(({ id }) => id === target.placementId);
      assert.deepEqual(targetAfterExternal.series[otherSeries.id], initialTarget.series[otherSeries.id],
        'the move changes only this chapter ordering, not the target’s independent series membership');
    }
    const transactionsAfterExternal = transactionCount(fixture);

    const capture = await captureCreatorApi(page, { skipErrorBodies: true });
    await save.click();
    const movePath = movementKind === 'link'
      ? `/api/creador/enlaces/${target.placementId}/mover`
      : `/api/creador/series/${series.id}/capitulos/${target.placementId}/mover`;
    await expect.poll(() => capture.writes().find(({ method, path }) => method === 'POST' && path === movePath)?.status)
      .toBe(409);
    await capture.settle({ skipErrorBodies: true });
    const moveWrites = () => capture.writes().filter(({ method, path }) => method === 'POST' && path === movePath);
    assert.equal(moveWrites().length, 1, 'the stale move is sent once and not replayed');
    assert.equal(moveWrites()[0].status, 409);
    const expectedStaleBody = movementKind === 'link'
      ? { profileVersion: initial.profile.version, placementVersion: initialTarget.version, targetPosition: chosenPosition }
      : { profileVersion: initial.profile.version, seriesVersion: initialSeries.version,
        placementVersion: initialTarget.version, targetPosition: chosenPosition };
    assert.deepEqual(moveWrites()[0].body, expectedStaleBody,
      'the first browser request contains the exact original base and the chosen destination');
    assert.deepEqual(await rawMoveState(fixture, cookie, [target, neighbor, movedExternally], [series, otherSeries]), afterExternal,
      'the rejected move has no profile, order, version, membership, series, or resource effect');
    assert.equal(transactionCount(fixture), transactionsAfterExternal,
      'the stale move creates no store transaction');
    assert.deepEqual(await publicOrder(fixture, movementKind, publicProfile.slug, series.slug), externalOrder,
      'the public order remains the external order after the rejected browser command');

    const conflict = form.locator('[data-owner-conflict]');
    await expect(conflict).toBeVisible();
    const compare = conflict.getByRole('button', { name: 'Comparar con lo guardado', exact: true });
    await compare.click();
    await expect(form.locator('[data-owner-comparison]')).toBeVisible();
    await capture.settle({ skipErrorBodies: true });
    const compareRead = capture.records.find(({ method, path, status, responseBody }) => method === 'GET'
      && path === '/api/creador/perfil' && status === 200
      && responseBody?.profile?.version === afterExternal.profile.version);
    assert.ok(compareRead, 'the explicit compare performs a real current-profile GET');
    assert.deepEqual(ownerDtoOrderIds(compareRead.responseBody.links, movementKind, series.id), externalOrder,
      'the compared full snapshot contains the complete current order, not a target-only patch');
    assert.equal(compareRead.responseBody.profile.version, afterExternal.profile.version);
    const comparison = form.locator('[data-owner-comparison]');
    await expect(comparison).toContainText(/Posición guardada/);
    await expect(comparison).toContainText(new RegExp(`Tu corrección: ${chosenPosition}(?![0-9])`, 'u'));

    const adoptDestination = form.getByRole('button', { name: 'Conservar este destino', exact: true });
    await expect(adoptDestination).toBeVisible();
    await adoptDestination.click();
    await expect(positionInput).toHaveValue(String(chosenPosition),
      'explicit adoption installs the full compared base while retaining the chosen ordinal');
    if (movementKind === 'link') {
      await expect.poll(() => page.locator('[data-link-row]').evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-link-row'))))
        .toEqual(externalOrder);
    } else {
      for (const [index, placementId] of externalOrder.entries()) {
        await expect(page.locator(`[data-chapter-row="${placementId}"]`))
          .toContainText(`Incluido en la posición ${index + 1} de ${externalOrder.length}`);
      }
    }
    assert.deepEqual(await rawMoveState(fixture, cookie, [target, neighbor, movedExternally], [series, otherSeries]), afterExternal,
      'adoption changes the editor base and displayed order without writing');
    assert.equal(moveWrites().length, 1, 'adoption is not an automatic retry');
    assert.equal(transactionCount(fixture), transactionsAfterExternal,
      'adoption does not write to storage');

    await save.click();
    await capture.settle({ skipErrorBodies: true });
    assert.equal(moveWrites().length, 2, 'the second move is the one manual command after adoption');
    assert.equal(moveWrites()[1].status, 200);
    const externalTarget = afterExternal.placements.find(({ id }) => id === target.placementId);
    const externalSeries = afterExternal.series.find(({ id }) => id === series.id);
    const expectedManualBody = movementKind === 'link'
      ? { profileVersion: afterExternal.profile.version, placementVersion: externalTarget.version, targetPosition: chosenPosition }
      : { profileVersion: afterExternal.profile.version, seriesVersion: externalSeries.version,
        placementVersion: externalTarget.version, targetPosition: chosenPosition };
    assert.deepEqual(moveWrites()[1].body, expectedManualBody,
      'the manual request consumes the adopted profile/order scope versions and retains the selected ordinal');
    assert.equal(transactionCount(fixture), transactionsAfterExternal + 1,
      'only the manual accepted move creates one transaction after the external command');
    const afterManual = await rawMoveState(fixture, cookie, [target, neighbor, movedExternally], [series, otherSeries]);
    const finalOrder = [movedExternally.placementId, neighbor.placementId, target.placementId];
    assert.deepEqual(orderIds(afterManual.placements, movementKind, series.id), finalOrder,
      'the service inserts the selected target into the adopted current order');
    assert.equal(afterManual.profile.version, afterExternal.profile.version + 1);
    assert.deepEqual(afterManual.resources, afterExternal.resources,
      'the manual movement and conflict recovery do not mutate any resource metadata or version');
    assert.deepEqual(afterManual.series, afterExternal.series,
      'neither movement modifies series metadata');
    if (movementKind === 'chapter') {
      const targetAfter = afterManual.placements.find(({ id }) => id === target.placementId);
      assert.deepEqual(targetAfter.series[otherSeries.id], initialTarget.series[otherSeries.id],
        'the target remains at the same ordinal in its independent series');
    }
    const changedIds = afterManual.placements.filter((placement) =>
      placement.version !== afterExternal.placements.find(({ id }) => id === placement.id).version)
      .map(({ id }) => id);
    assert.deepEqual(sortedReceipts(receiptsFrom(moveWrites()[1])), sortedReceipts([
      { entity: 'profile', id: afterExternal.profile.id, before: afterExternal.profile.version, after: afterExternal.profile.version + 1 },
      ...changedIds.map((id) => ({
        entity: 'placement', id,
        before: afterExternal.placements.find((placement) => placement.id === id).version,
        after: afterManual.placements.find((placement) => placement.id === id).version,
      })),
    ]), 'the successful move receipt covers only records whose ordering/version changed');
    assert.deepEqual(await publicOrder(fixture, movementKind, publicProfile.slug, series.slug), finalOrder,
      'the public profile or public series renders the order committed by the manual move');
    assert.equal(capture.writes().filter(({ method, path }) => method === 'PATCH' && path.startsWith('/api/creador/recursos/')).length, 0,
      'the move and conflict resolution make no resource metadata PATCH');
    await capture.stop({ skipErrorBodies: true });
  });
}

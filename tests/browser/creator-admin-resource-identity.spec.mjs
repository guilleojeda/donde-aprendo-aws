import assert from 'node:assert/strict';
import { expect, test, addCookie } from '../fixtures/creator-browser-test.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';

const adminPath = '/cuenta/administracion/';
const root = (page) => page.locator('[data-creator-admin]');
const row = (page, id) => page.locator(`[data-admin-resource=${JSON.stringify(encodeURIComponent(id))}]`);
const rowByTitle = (page, title) => page.getByRole('heading', { name: title, exact: true }).locator('xpath=..');

const supportedIds = [
  { id: '.', action: 'aprobar' },
  { id: '..', action: 'ocultar' },
  { id: '%2E', action: 'revocar', published: true },
  { id: '%2E%2E', action: 'restaurar', hidden: true },
  { id: 'raw%ZZ', action: 'ocultar' },
  { id: 'literal%2E-spelling', action: 'aprobar' },
  { id: 'ordinary-admin-resource', action: 'ocultar' },
  { id: 'id with space', action: 'aprobar' },
  { id: 'id\nwith-line-feed', action: 'ocultar' },
  { id: 'id\twith-tab', action: 'revocar', published: true },
  { id: 'id+with+plus', action: 'revocar', published: true },
  { id: 'aprobar', action: 'restaurar', hidden: true },
  { id: 'ocultar', action: 'aprobar', hidden: true },
  { id: 'id&name=value+plus / ?', action: 'revocar', published: true },
  { id: 'recurso-é-雪-😀', action: 'restaurar', hidden: true },
  { id: 'é'.repeat(128), action: 'ocultar' }, // Exactly 256 UTF-8 bytes.
];

function resource(entry, index) {
  return {
    id: entry.id,
    title: entry.title ?? `Identidad administrativa ${index}`,
    url: `https://admin-resource-id.example/${index}`,
    description: 'Contenido de prueba.',
    category: 'Serverless',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    order: index,
    featured: false,
    published: entry.published === true,
    approvalRevoked: false,
    directoryApproval: entry.published ? 'approved' : 'pending',
    directoryControl: 'editorial',
    hidden: entry.hidden === true,
    version: 1,
  };
}

function actionLabel(action) {
  return {
    aprobar: 'Aprobar para el directorio',
    revocar: 'Revocar aprobación',
    ocultar: 'Ocultar recurso',
    restaurar: 'Restaurar recurso',
  }[action];
}

function moderationActions(entry) {
  return entry.id === '.' || entry.id === '..'
    ? ['aprobar', 'revocar', 'ocultar', 'restaurar']
    : [entry.action];
}

async function addAdminCookie(fixture, page) {
  const cookie = await fixture.login();
  for (const [key, account] of fixture.accountStore.accounts) {
    fixture.accountStore.accounts.set(key, { ...account, isAdmin: true });
  }
  await addCookie(page.context(), fixture, cookie);
  return cookie;
}

async function runQueryCommand(page, { id, action, control, expectedVersion, expectedStatus = 200, expectedError }) {
  const method = action ? 'POST' : 'PATCH';
  const expectedPath = action ? `/api/admin/recursos/${action}/` : '/api/admin/recursos/';
  const navigation = expectedStatus === 200
    ? page.waitForNavigation({ waitUntil: 'load' }).then(() => null, (error) => error)
    : null;
  const responsePromise = page.waitForResponse((response) => {
    const request = response.request();
    const url = new URL(response.url());
    return request.method() === method && url.pathname.startsWith('/api/admin/');
  });
  await control.click();
  const response = await responsePromise;
  const requestUrl = new URL(response.url());
  assert.equal(requestUrl.pathname, expectedPath,
    `${method} for ${JSON.stringify(id)} uses the canonical query-ID pathname`);
  assert.deepEqual(requestUrl.searchParams.getAll('id'), [id],
    `${method} for ${JSON.stringify(id)} preserves exactly one decoded ID value; observed ${requestUrl.href}`);
  const expectedQuery = new URLSearchParams();
  expectedQuery.set('id', id);
  assert.equal(requestUrl.search, `?${expectedQuery.toString()}`,
    `${method} uses the exact URLSearchParams encoding for ${JSON.stringify(id)}`);
  assert.deepEqual([...requestUrl.searchParams.keys()], ['id'],
    'the slash belongs to the pathname and does not contaminate the query value');
  const requestBody = JSON.parse(response.request().postData() ?? '{}');
  assert.deepEqual(requestBody, action ? { version: expectedVersion } : {
    category: 'Certificaciones',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    version: expectedVersion,
  }, 'the browser sends the form or currently observed version with the command');
  assert.equal(response.status(), expectedStatus, `${method} returns the expected result for ${JSON.stringify(id)}`);
  if (expectedError) assert.equal((await response.json()).error, expectedError);
  if (navigation) {
    const navigationError = await navigation;
    if (navigationError) throw navigationError;
  }
}

test('real admin commands preserve every supported resource ID through browser URL processing and persistence', async ({ fixture, page }) => {
  test.setTimeout(180_000);
  await addAdminCookie(fixture, page);
  for (const [index, entry] of supportedIds.entries()) {
    await seedResource(fixture.creatorStore, resource(entry, index));
  }

  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();

  for (const entry of supportedIds) {
    const before = await fixture.rawResource(entry.id);
    await row(page, entry.id).getByLabel('Categoría').fill('Certificaciones');
    await runQueryCommand(page, {
      id: entry.id,
      control: row(page, entry.id).getByRole('button', { name: 'Guardar clasificación' }),
      expectedVersion: before.version,
    });
    const classified = await fixture.rawResource(entry.id);
    assert.equal(classified.id, entry.id);
    assert.equal(classified.category, 'Certificaciones');
    assert.equal(classified.version, before.version + 1);

    let expectedVersion = classified.version;
    let published = entry.published === true;
    let approvalRevoked = false;
    let hidden = entry.hidden === true;
    for (const action of moderationActions(entry)) {
      await runQueryCommand(page, {
        id: entry.id,
        action,
        control: row(page, entry.id).getByRole('button', { name: actionLabel(action) }),
        expectedVersion,
      });
      expectedVersion += 1;
      if (action === 'aprobar') {
        published = true;
        approvalRevoked = false;
      } else if (action === 'revocar') {
        published = false;
        approvalRevoked = true;
      } else if (action === 'ocultar') hidden = true;
      else if (action === 'restaurar') hidden = false;

      const moderated = await fixture.rawResource(entry.id);
      assert.equal(moderated.id, entry.id);
      assert.equal(moderated.category, 'Certificaciones');
      assert.equal(moderated.version, expectedVersion,
        `${action} persists the version after the currently observed version`);
      assert.equal(moderated.published, published);
      assert.equal(moderated.approvalRevoked, approvalRevoked);
      assert.equal(moderated.hidden, hidden);
    }
  }

  const dot = await fixture.rawResource('.');
  const encodedDotDecoy = await fixture.rawResource('%2E');
  const dotDot = await fixture.rawResource('..');
  const encodedDotDotDecoy = await fixture.rawResource('%2E%2E');
  assert.equal(dot.version, 6);
  assert.equal(dot.published, false);
  assert.equal(dot.approvalRevoked, true);
  assert.equal(dot.hidden, false);
  assert.equal(encodedDotDecoy.version, 3);
  assert.equal(encodedDotDecoy.published, false);
  assert.equal(encodedDotDecoy.approvalRevoked, true);
  assert.equal(dotDot.version, 6);
  assert.equal(dotDot.published, false);
  assert.equal(dotDot.approvalRevoked, true);
  assert.equal(dotDot.hidden, false);
  assert.equal(encodedDotDotDecoy.version, 3);
  assert.equal(encodedDotDotDecoy.hidden, false);
});

for (const entry of [
  { id: 'private\rresource', decoy: 'private\nresource', title: 'Recurso con CR literal', description: 'CR' },
  { id: 'private\u0000resource', decoy: 'private\uFFFDresource', title: 'Recurso con NUL literal', description: 'NUL' },
]) {
  test(`real admin moderation preserves a ${entry.description} ID against its HTML-normalized decoy`, async ({ fixture, page }) => {
    await addAdminCookie(fixture, page);
    await seedResource(fixture.creatorStore, resource(entry, 0));
    await seedResource(fixture.creatorStore, resource({ ...entry, id: entry.decoy, title: `${entry.title} decoy` }, 1));

    await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
    await expect(root(page)).toBeVisible();
    const before = await fixture.rawResource(entry.id);
    const originalRow = rowByTitle(page, entry.title);
    await runQueryCommand(page, {
      id: entry.id,
      action: 'ocultar',
      control: originalRow.getByRole('button', { name: 'Ocultar recurso' }),
      expectedVersion: before.version,
    });
    assert.equal((await fixture.rawResource(entry.id)).hidden, true, 'the exact private ID receives the moderation change');
    assert.equal((await fixture.rawResource(entry.decoy)).hidden, false,
      `the ${entry.description === 'CR' ? 'LF' : 'replacement-character'} decoy remains untouched`);
  });
}

test('CR resource classification keeps its exact private ID through a guarded private restore', async ({ fixture, page }) => {
  const id = 'classification\rprivate';
  const decoyId = 'classification\nprivate';
  const title = 'Clasificación privada con CR';
  await addAdminCookie(fixture, page);
  await seedResource(fixture.creatorStore, resource({ id, title, hidden: true }, 0));
  await seedResource(fixture.creatorStore, resource({ id: decoyId, title: 'Clasificación LF decoy' }, 1));

  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();
  const targetRow = row(page, id);
  const topics = targetRow.getByLabel('Temas (hasta 3, separados por coma)');
  const listId = `creator-topics-${encodeURIComponent(id)}`;
  assert.equal(await topics.getAttribute('list'), listId, 'the datalist reference uses the same safe resource token');
  assert.equal(await targetRow.locator('datalist').getAttribute('id'), listId);

  await targetRow.getByLabel('Categoría').fill('Certificaciones');
  await runQueryCommand(page, {
    id,
    control: targetRow.getByRole('button', { name: 'Guardar clasificación' }),
    expectedVersion: 1,
  });
  const classified = await fixture.rawResource(id);
  assert.equal(classified.id, id);
  assert.equal(classified.category, 'Certificaciones');
  assert.equal(classified.version, 2);
  assert.equal((await fixture.rawResource(decoyId)).category, 'Serverless');

  await runQueryCommand(page, {
    id,
    action: 'restaurar',
    control: targetRow.getByRole('button', { name: 'Restaurar recurso' }),
    expectedVersion: 2,
  });
  const restored = await fixture.rawResource(id);
  assert.equal(restored.id, id);
  assert.equal(restored.hidden, false);
  assert.equal(restored.published, false, 'the restoration is private and does not publish the invalid public ID');
  assert.equal(restored.version, 3);
  assert.equal((await fixture.rawResource(decoyId)).hidden, false);
});

test('NUL public restoration is rejected for the exact ID and leaves its replacement decoy hidden', async ({ fixture, page }) => {
  const id = 'public\u0000private';
  const decoyId = 'public\uFFFDprivate';
  const title = 'Recurso aprobado con NUL';
  await addAdminCookie(fixture, page);
  await seedResource(fixture.creatorStore, resource({ id, title, hidden: true, published: true }, 0));
  await seedResource(fixture.creatorStore, resource({ id: decoyId, title: 'Recurso de reemplazo', hidden: true, published: true }, 1));

  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();
  const targetRow = row(page, id);
  await runQueryCommand(page, {
    id,
    action: 'restaurar',
    control: rowByTitle(page, title).getByRole('button', { name: 'Restaurar recurso' }),
    expectedVersion: 1,
    expectedStatus: 422,
    expectedError: 'INVALID_CLASSIFICATION',
  });
  assert.equal((await fixture.rawResource(id)).hidden, true);
  assert.equal((await fixture.rawResource(id)).version, 1);
  assert.equal((await fixture.rawResource(decoyId)).hidden, true);
  assert.equal((await fixture.rawResource(decoyId)).version, 1);
  assert.ok(await targetRow.count());
});

test('claim checkboxes restore the exact CR ID and pause only its encoded resource row', async ({ fixture, page }) => {
  const cookie = await fixture.login();
  const profileResponse = await fixture.request(cookie, '/api/creador/perfil', {
    method: 'PUT',
    body: { creatorVersion: null, displayName: 'Admin de prueba', slug: 'admin-identidad-privada', socials: {} },
  });
  assert.equal(profileResponse.status, 200);
  const owner = await fixture.rawOwner(cookie);
  assert.ok(owner?.profile);
  const accountId = owner.principal.accountId;
  const profileId = owner.profile.id;
  for (const [key, account] of fixture.accountStore.accounts) {
    fixture.accountStore.accounts.set(key, { ...account, isAdmin: true });
  }
  await addCookie(page.context(), fixture, cookie);

  const id = 'claim\rprivate';
  const decoyId = 'claim\nprivate';
  const target = resource({ id, title: 'Reclamación CR' }, 0);
  const decoy = resource({ id: decoyId, title: 'Reclamación LF decoy' }, 1);
  await seedResource(fixture.creatorStore, target);
  await seedResource(fixture.creatorStore, decoy);
  const claimId = 'private-identity-claim';
  await fixture.creatorStore.transact({
    checks: [
      { key: `claim:${claimId}`, version: null },
      { key: `claim-ref:${profileId}:${claimId}`, version: null },
    ],
    puts: [
      {
        key: `claim:${claimId}`,
        value: {
          recordType: 'claim', id: claimId, accountId, profileId,
          resourceIds: [id, decoyId],
          resources: [{ resourceId: id, url: target.url }, { resourceId: decoyId, url: decoy.url }],
          status: 'pending', createdAt: Date.UTC(2026, 10, 16), version: 1,
        },
      },
      { key: `claim-ref:${profileId}:${claimId}`, value: { id: claimId, version: 1 } },
    ],
  });

  await page.goto(`${fixture.origin}${adminPath}?state=all&page=1`);
  await expect(root(page)).toBeVisible();
  await row(page, decoyId).getByLabel('Categoría').fill('Cambio pendiente');
  const claimForm = page.locator(`[data-admin-claim=${JSON.stringify(claimId)}] [data-claim-resolution]`);
  const selections = claimForm.locator('input[name="resourceIds"]');
  await selections.nth(1).uncheck();
  await claimForm.getByLabel('Confirmo que revisé la referencia y los recursos seleccionados.').check();

  await page.route('**/api/admin/reclamaciones/vincular/', async (route) => {
    const response = await route.fetch();
    const { versionChanges: _versionChanges, ...delivered } = await response.json();
    await route.fulfill({ response, body: JSON.stringify(delivered) });
  });
  const responsePromise = page.waitForResponse((response) => response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/admin/reclamaciones/vincular/');
  await claimForm.getByRole('button', { name: 'Vincular recursos seleccionados' }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  assert.deepEqual(JSON.parse(response.request().postData() ?? '{}'), { accountId, resourceIds: [id] });
  assert.equal((await fixture.rawResource(id)).editorProfileId, profileId);
  assert.equal((await fixture.rawResource(decoyId)).editorProfileId, undefined);
  const after = await fixture.rawOwner(cookie);
  assert.deepEqual(Object.values(after.profile.placements).map(({ resourceId }) => resourceId), [id]);
  await expect(row(page, id).getByRole('button', { name: 'Ocultar recurso' })).toHaveAttribute('data-creator-stale', 'true');
  await expect(row(page, decoyId).getByRole('button', { name: 'Ocultar recurso' })).not.toHaveAttribute('data-creator-stale');
});

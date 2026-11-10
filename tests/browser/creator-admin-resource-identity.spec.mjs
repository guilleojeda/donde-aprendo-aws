import assert from 'node:assert/strict';
import { expect, test, addCookie } from '../fixtures/creator-browser-test.mjs';
import { seedResource } from '../fixtures/creator-pages.mjs';

const adminPath = '/cuenta/administracion/';
const root = (page) => page.locator('[data-creator-admin]');
const row = (page, id) => page.locator(`[data-admin-resource=${JSON.stringify(id)}]`);

const supportedIds = [
  { id: '.', action: 'aprobar' },
  { id: '..', action: 'ocultar' },
  { id: '%2E', action: 'revocar', published: true },
  { id: '%2E%2E', action: 'restaurar', hidden: true },
  { id: 'raw%ZZ', action: 'ocultar' },
  { id: 'literal%2E-spelling', action: 'aprobar' },
  { id: 'ordinary-admin-resource', action: 'ocultar' },
  { id: 'id with space', action: 'aprobar' },
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
    title: `Identidad administrativa ${index}`,
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

async function runQueryCommand(page, { id, action, control, expectedVersion }) {
  const method = action ? 'POST' : 'PATCH';
  const expectedPath = action ? `/api/admin/recursos/${action}/` : '/api/admin/recursos/';
  const navigation = page.waitForNavigation({ waitUntil: 'load' }).then(() => null, (error) => error);
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
  assert.equal(response.status(), 200, `${method} accepts ${JSON.stringify(id)}`);
  const navigationError = await navigation;
  if (navigationError) throw navigationError;
}

test('real admin commands preserve every supported resource ID through browser URL processing and persistence', async ({ fixture, page }) => {
  test.setTimeout(180_000);
  const cookie = await fixture.login();
  for (const [key, account] of fixture.accountStore.accounts) {
    fixture.accountStore.accounts.set(key, { ...account, isAdmin: true });
  }
  await addCookie(page.context(), fixture, cookie);
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

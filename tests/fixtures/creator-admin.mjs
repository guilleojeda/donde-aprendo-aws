import assert from 'node:assert/strict';
import { completeLogin, cookiePair, makeAccount, makeIdentity } from './account-auth.mjs';
import { addCookie, expect } from './creator-browser-test.mjs';
import { seedResource } from './creator-pages.mjs';

export const adminPath = '/cuenta/administracion/';
export const root = (page) => page.locator('[data-creator-admin]');
export const row = (page, id) => page.locator(`[data-admin-resource="${encodeURIComponent(id)}"]`);

export function resource(id, index, overrides = {}) {
  return {
    id,
    title: `Recurso administrativo ${index}`,
    url: `https://admin-fixture.example.invalid/${id}`,
    description: '',
    category: 'Serverless',
    kind: 'content',
    format: 'Artículo',
    topics: ['Serverless'],
    order: index,
    featured: false,
    published: false,
    directoryApproval: 'pending',
    directoryControl: 'editorial',
    version: 1,
    ...overrides,
  };
}

export async function prepareAdmin(fixture, page, resources) {
  const cookie = await fixture.login();
  assert.equal(fixture.accountStore.accounts.size, 1,
    'prepare the admin identity before adding separate creator accounts');
  const [[key, account]] = fixture.accountStore.accounts;
  fixture.accountStore.accounts.set(key, { ...account, isAdmin: true });
  await addCookie(page.context(), fixture, cookie);
  for (const [index, record] of resources.entries()) {
    await seedResource(fixture.creatorStore, typeof record === 'string' ? resource(record, index) : record);
  }
  return cookie;
}

export async function openAdmin(fixture, page, resources, query = '?state=all&page=1') {
  const cookie = await prepareAdmin(fixture, page, resources);
  await page.goto(`${fixture.origin}${adminPath}${query}`);
  await expect(root(page)).toBeVisible();
  return cookie;
}

export async function loginAsSeparateOwner(fixture, sub, email) {
  const identity = makeIdentity({ sub });
  fixture.accountStore.seedAccount(makeAccount({ identity, email }));
  const oldClaims = fixture.accountHarness.state.oidc.claims;
  fixture.accountHarness.state.oidc.claims = { sub, email };
  try {
    const result = await completeLogin(fixture.accountHarness);
    assert.equal(result.response.status, 303, 'the owner account uses the real account callback');
    const pair = cookiePair(result.sessionCookie);
    return { pair, name: 'da_session', value: pair.slice('da_session='.length) };
  } finally {
    if (oldClaims === undefined) delete fixture.accountHarness.state.oidc.claims;
    else fixture.accountHarness.state.oidc.claims = oldClaims;
  }
}

export async function submitCreatorClaim(fixture, cookie, resourceIds, { evidence, sourceId } = {}) {
  const resources = await Promise.all(resourceIds.map(async (resourceId) => {
    const resource = await fixture.rawResource(resourceId);
    assert.equal(resource?.id, resourceId);
    return { resourceId, url: resource.url };
  }));
  const response = await fixture.request(cookie, '/api/creador/reclamaciones/', {
    method: 'POST',
    body: { resources, ...(evidence ? { evidence } : {}), ...(sourceId ? { sourceId } : {}) },
  });
  assert.equal(response.status, 202, 'the real creator claim service creates the pending admin request');
  const acknowledgement = await response.json();
  assert.equal(acknowledgement.operation, 'create-claim');
  assert.ok(acknowledgement.claimId);
  return { id: acknowledgement.claimId };
}

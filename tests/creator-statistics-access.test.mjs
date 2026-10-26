import assert from 'node:assert/strict';
import test from 'node:test';
import {
  callApi,
  createCreatorPagesHarness,
  readAdminRecord,
  responseJson,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';

const STATISTICS_PATH = '/api/creador/estadisticas/';

function createStatisticsReader({ fail = false } = {}) {
  const calls = [];
  const values = new Map();
  return {
    calls,
    values,
    async read(input) {
      calls.push(structuredClone(input));
      if (fail) throw new Error('private-account-a service-account-key internal GA response');
      return values.get(input.profileId) ?? {
        state: 'ready',
        creatorId: input.profileId,
        period: input.period,
        page: input.page,
        totals: { views: 5, visitors: 3, clicks: 8 },
      };
    },
  };
}

async function api(harness, path, session, options = {}) {
  return callApi(harness, path, {
    session,
    ...(session && sessionCsrf[session] ? { csrf: sessionCsrf[session] } : {}),
    ...options,
  });
}

async function adminVersion(harness, type, id) {
  return (await readAdminRecord(harness, type, id)).version;
}

async function createProfile(harness, session = 'creator-a', { publish = true } = {}) {
  const saved = await api(harness, '/api/creador/perfil', session, {
    method: 'PUT',
    body: { displayName: `Creador ${session}`, slug: `ruta-${session}` },
  });
  assert.equal(saved.status, 200, `saving ${session} profile failed`);
  let profile = (await responseJson(saved)).profile;
  if (publish) {
    const published = await api(harness, '/api/creador/perfil/publicar', session, {
      method: 'POST',
      body: {},
    });
    assert.equal(published.status, 200, `publishing ${session} profile failed`);
    profile = (await responseJson(published)).profile ?? profile;
  }
  return profile;
}

async function addSharedLink(harness, session) {
  const response = await api(harness, '/api/creador/enlaces', session, {
    method: 'POST',
    body: { title: 'Guía compartida', url: 'https://example.com/guia-compartida' },
  });
  assert.equal(response.status, 201, `adding the shared URL for ${session} failed`);
  return (await responseJson(response)).link;
}

async function saveProfile(harness, session, profile, slug) {
  const response = await api(harness, '/api/creador/perfil', session, {
    method: 'PUT',
    body: { displayName: profile.displayName, slug, version: profile.version },
  });
  assert.equal(response.status, 200, `changing ${session} slug failed`);
  return (await responseJson(response)).profile;
}

function assertPrivateNoStore(response) {
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
}

test('GET resolves separate creator data from each authenticated owner using the stable profile ID', async () => {
  const statistics = createStatisticsReader();
  const harness = await createCreatorPagesHarness({ statistics });
  const profileA = await createProfile(harness, 'creator-a');
  const profileB = await createProfile(harness, 'creator-b');
  const linkA = await addSharedLink(harness, 'creator-a');
  const linkB = await addSharedLink(harness, 'creator-b');
  assert.equal(linkA.resourceId, linkB.resourceId, 'both profiles must reference the same resource');
  assert.notEqual(linkA.placementId, linkB.placementId, 'each profile must retain its own placement');
  statistics.values.set(profileA.id, {
    state: 'ready', creatorId: profileA.id, period: 7, page: 1,
    totals: { views: 5, visitors: 3, clicks: 8 },
  });
  statistics.values.set(profileB.id, {
    state: 'ready', creatorId: profileB.id, period: 7, page: 1,
    totals: { views: 22, visitors: 9, clicks: 31 },
  });

  const responseA = await callApi(harness, STATISTICS_PATH, { session: 'creator-a' });
  assert.equal(responseA.status, 200);
  assertPrivateNoStore(responseA);
  assert.deepEqual(await responseJson(responseA), statistics.values.get(profileA.id));

  // A warmed read must not cause another signed-in creator to receive A's data.
  const responseB = await callApi(harness, STATISTICS_PATH, { session: 'creator-b' });
  assert.equal(responseB.status, 200);
  assertPrivateNoStore(responseB);
  assert.deepEqual(await responseJson(responseB), statistics.values.get(profileB.id));
  assert.notEqual(profileA.id, profileB.id);
  assert.deepEqual(statistics.calls, [
    { profileId: profileA.id, period: 7, page: 1 },
    { profileId: profileB.id, period: 7, page: 1 },
  ]);

  const anonymous = await callApi(harness, STATISTICS_PATH);
  assert.equal(anonymous.status, 401);
  assertPrivateNoStore(anonymous);
  assert.deepEqual(statistics.calls.at(-1), { profileId: profileB.id, period: 7, page: 1 });
});

test('accepts only periodo and pagina, rejecting unknown, duplicated and invalid values before reading', async () => {
  const statistics = createStatisticsReader();
  const harness = await createCreatorPagesHarness({ statistics });
  await createProfile(harness);

  const valid = await callApi(harness, `${STATISTICS_PATH}?periodo=30&pagina=2`, { session: 'creator-a' });
  assert.equal(valid.status, 200);
  assertPrivateNoStore(valid);
  assert.deepEqual(statistics.calls, [{ profileId: 'fixture-id-1', period: 30, page: 2 }]);

  for (const query of [
    'creator_id=other', 'profileId=other', 'property=properties%2F123', 'filter=eventName', 'slug=otra-ruta',
    'periodo=7&periodo=30', 'pagina=1&pagina=2', 'periodo=1', 'periodo=8', 'pagina=0', 'pagina=-1', 'pagina=1.5',
  ]) {
    const response = await callApi(harness, `${STATISTICS_PATH}?${query}`, { session: 'creator-a' });
    assert.equal(response.status, 400, `expected 400 for query ${query}`);
    assertPrivateNoStore(response);
  }
  assert.equal(statistics.calls.length, 1, 'invalid queries must not reach the statistics reader');
});

test('GET needs no CSRF token, while POST, PUT and DELETE are rejected without reading', async () => {
  const statistics = createStatisticsReader();
  const harness = await createCreatorPagesHarness({ statistics });
  await createProfile(harness);

  const get = await callApi(harness, STATISTICS_PATH, { session: 'creator-a' });
  assert.equal(get.status, 200);
  assertPrivateNoStore(get);
  assert.equal(statistics.calls.length, 1);

  for (const method of ['POST', 'PUT', 'DELETE']) {
    const response = await callApi(harness, STATISTICS_PATH, {
      session: 'creator-a', method, csrf: sessionCsrf['creator-a'], body: {},
    });
    assert.equal(response.status, 405, `${method} must not be supported`);
    assertPrivateNoStore(response);
  }
  assert.equal(statistics.calls.length, 1, 'unsupported methods must not reach the statistics reader');
});

test('no-profile and unpublished profiles have explicit states and do not call the reader', async () => {
  const statistics = createStatisticsReader();
  const harness = await createCreatorPagesHarness({ statistics });

  const empty = await callApi(harness, STATISTICS_PATH, { session: 'creator-a' });
  assert.equal(empty.status, 200);
  assertPrivateNoStore(empty);
  assert.deepEqual(await responseJson(empty), { state: 'no-profile', period: 7, page: 1 });

  await createProfile(harness, 'creator-a', { publish: false });
  const draft = await callApi(harness, STATISTICS_PATH, { session: 'creator-a' });
  assert.equal(draft.status, 200);
  assertPrivateNoStore(draft);
  assert.deepEqual(await responseJson(draft), { state: 'not-published', period: 7, page: 1 });
  assert.equal(statistics.calls.length, 0);
});

test('hidden published profile remains readable by its owner and admin cannot select it by query', async () => {
  const statistics = createStatisticsReader();
  const harness = await createCreatorPagesHarness({ statistics });
  const profile = await createProfile(harness);
  const hidden = await api(harness, `/api/admin/perfiles/${profile.id}/ocultar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'profile', profile.id) },
  });
  assert.equal(hidden.status, 200);

  const owner = await callApi(harness, STATISTICS_PATH, { session: 'creator-a' });
  assert.equal(owner.status, 200);
  assertPrivateNoStore(owner);
  assert.equal((await responseJson(owner)).creatorId, profile.id);

  const admin = await callApi(harness, STATISTICS_PATH, { session: 'admin' });
  assert.equal(admin.status, 200);
  assertPrivateNoStore(admin);
  assert.deepEqual(await responseJson(admin), { state: 'no-profile', period: 7, page: 1 });

  const forged = await callApi(harness, `${STATISTICS_PATH}?profileId=${profile.id}`, { session: 'admin' });
  assert.equal(forged.status, 400);
  assertPrivateNoStore(forged);
  assert.deepEqual(statistics.calls.map(({ profileId }) => profileId), [profile.id]);
});

test('changing the slug twice preserves the profile ID used for statistics', async () => {
  const statistics = createStatisticsReader();
  const harness = await createCreatorPagesHarness({ statistics });
  const initial = await createProfile(harness);
  const first = await saveProfile(harness, 'creator-a', initial, 'ruta-nueva-uno');
  const second = await saveProfile(harness, 'creator-a', first, 'ruta-nueva-dos');
  assert.equal(second.id, initial.id);

  const response = await callApi(harness, `${STATISTICS_PATH}?periodo=30`, { session: 'creator-a' });
  assert.equal(response.status, 200);
  assertPrivateNoStore(response);
  assert.deepEqual(statistics.calls, [{ profileId: initial.id, period: 30, page: 1 }]);
  assert.equal((await responseJson(response)).creatorId, initial.id);
});

test('authentication failures happen before any statistics read', async () => {
  const statistics = createStatisticsReader();
  const authenticate = async (request) => {
    const session = request.headers.get('x-test-session');
    if (session === 'disabled') return { state: 'disabled' };
    if (session === 'failed') throw new Error('private account authentication secret');
    return { state: 'anonymous' };
  };
  const harness = await createCreatorPagesHarness({ statistics, authenticate });

  for (const [session, expectedStatus] of [['disabled', 403], ['failed', 503]]) {
    const response = await callApi(harness, STATISTICS_PATH, { session });
    assert.equal(response.status, expectedStatus);
    assertPrivateNoStore(response);
  }
  assert.equal(statistics.calls.length, 0);
});

test('reader failure without a usable result is sanitized as 503', async () => {
  const statistics = createStatisticsReader({ fail: true });
  const harness = await createCreatorPagesHarness({ statistics });
  await createProfile(harness);

  const response = await callApi(harness, STATISTICS_PATH, { session: 'creator-a' });
  assert.equal(response.status, 503);
  assertPrivateNoStore(response);
  const body = await response.text();
  assert.doesNotMatch(body, /private-account-a|service-account-key|internal GA response/);
  assert.equal(statistics.calls.length, 1);
});

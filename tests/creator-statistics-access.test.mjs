import assert from 'node:assert/strict';
import test from 'node:test';
import { CREATOR_CONTRACT_VERSION } from '../src/lib/creator-values.mjs';
import {
  callApi,
  createCreatorPagesHarness,
  readAdminRecord,
  responseJson,
  requestContextForTestPrincipal,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';

const STATISTICS_PATH = '/api/creador/estadisticas/';
const SUMMARY_PATH = `${STATISTICS_PATH}resumen/`;

function createStatisticsReader({ fail = false } = {}) {
  const calls = [];
  const values = new Map();
  const summaryCalls = [];
  return {
    calls,
    summaryCalls,
    async readSummary(input) {
      summaryCalls.push(structuredClone(input));
      if (fail) throw new Error('private-account-a service-account-key internal GA response');
      return {
        state: 'ready',
        creatorId: input.profileId,
        period: input.period,
        range: {
          startDate: input.period === 7 ? '2026-10-17' : '2026-09-24',
          endDate: '2026-10-23',
          timeZone: 'America/Los_Angeles',
        },
        totals: values.get(input.profileId)?.totals ?? { views: 5, visitors: 3, clicks: 8 },
        warnings: [],
        captureStartedAt: '2026-10-23T23:38:00Z',
        freshness: 'fresh',
        updatedAt: '2026-10-24T02:30:00.000Z',
      };
    },
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
  const creatorWrite = path.startsWith('/api/creador/') && (options.method ?? 'GET') !== 'GET';
  return callApi(harness, path, {
    session,
    ...(session && sessionCsrf[session] ? { csrf: sessionCsrf[session] } : {}),
    ...(creatorWrite ? { creatorContract: CREATOR_CONTRACT_VERSION } : {}),
    ...options,
  });
}

async function ownerSnapshot(harness, session = 'creator-a') {
  const response = await api(harness, '/api/creador/perfil/', session);
  assert.equal(response.status, 200, `reading ${session} creator state failed`);
  const snapshot = await responseJson(response);
  assert.equal(snapshot.schemaVersion, 2);
  return snapshot;
}

async function adminVersion(harness, type, id) {
  return (await readAdminRecord(harness, type, id)).version;
}

async function createProfile(harness, session = 'creator-a', { publish = true } = {}) {
  const saved = await api(harness, '/api/creador/perfil', session, {
    method: 'PUT',
    body: { creatorVersion: null, displayName: `Creador ${session}`, slug: `ruta-${session}` },
  });
  assert.equal(saved.status, 200, `saving ${session} profile failed`);
  let snapshot = await ownerSnapshot(harness, session);
  if (publish) {
    const published = await api(harness, '/api/creador/perfil/publicar', session, {
      method: 'POST',
      body: { creatorVersion: snapshot.creatorVersion },
    });
    assert.equal(published.status, 200, `publishing ${session} profile failed`);
    snapshot = await ownerSnapshot(harness, session);
  }
  return snapshot.profile;
}

async function addSharedLink(harness, session) {
  const snapshot = await ownerSnapshot(harness, session);
  const response = await api(harness, '/api/creador/enlaces', session, {
    method: 'POST',
    body: { creatorVersion: snapshot.creatorVersion, title: 'Guía compartida', url: 'https://example.com/guia-compartida' },
  });
  assert.equal(response.status, 201, `adding the shared URL for ${session} failed`);
  const acknowledgement = await responseJson(response);
  assert.equal(acknowledgement.operation, 'add-link');
  assert.equal(acknowledgement.schemaVersion, 2);
  return acknowledgement;
}

async function saveProfile(harness, session, profile, slug) {
  const snapshot = await ownerSnapshot(harness, session);
  assert.equal(snapshot.profile.id, profile.id);
  const response = await api(harness, '/api/creador/perfil', session, {
    method: 'PUT',
    body: { creatorVersion: snapshot.creatorVersion, displayName: profile.displayName, slug },
  });
  assert.equal(response.status, 200, `changing ${session} slug failed`);
  return (await ownerSnapshot(harness, session)).profile;
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
    if (session === 'disabled') return requestContextForTestPrincipal({ state: 'disabled' }, session);
    if (session === 'failed') throw new Error('private account authentication secret');
    return requestContextForTestPrincipal({ state: 'anonymous' }, session);
  };
  const harness = await createCreatorPagesHarness({ statistics, authenticate });

  for (const path of [STATISTICS_PATH, SUMMARY_PATH]) {
    for (const [session, expectedStatus] of [['disabled', 403], ['failed', 503]]) {
      const response = await callApi(harness, path, { session });
      assert.equal(response.status, expectedStatus, `${path} ${session}`);
      assertPrivateNoStore(response);
      assert.doesNotMatch(await response.text(), /private account authentication secret/u);
    }
  }
  assert.equal(statistics.calls.length, 0);
  assert.equal(statistics.summaryCalls.length, 0);
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

test('summary resolves the hidden published owner and a second owner to their own stable IDs', async () => {
  const statistics = createStatisticsReader();
  const harness = await createCreatorPagesHarness({ statistics });
  const first = await createProfile(harness, 'creator-a');
  const profileA = await saveProfile(harness, 'creator-a', first, 'resumen-cambiado');
  const profileB = await createProfile(harness, 'creator-b');
  const adminProfile = await createProfile(harness, 'admin');
  statistics.values.set(profileB.id, { totals: { views: 22, visitors: 9, clicks: 31 } });
  statistics.values.set(adminProfile.id, { totals: { views: 35, visitors: 16, clicks: 47 } });
  const hidden = await api(harness, `/api/admin/perfiles/${profileA.id}/ocultar`, 'admin', {
    method: 'POST', body: { version: await adminVersion(harness, 'profile', profileA.id) },
  });
  assert.equal(hidden.status, 200);

  for (const [session, query, expectedId, period, totals] of [
    ['creator-a', '?periodo=30', first.id, 30, { views: 5, visitors: 3, clicks: 8 }],
    ['creator-b', '?periodo=7', profileB.id, 7, { views: 22, visitors: 9, clicks: 31 }],
    ['admin', '', adminProfile.id, 7, { views: 35, visitors: 16, clicks: 47 }],
  ]) {
    const summary = await callApi(harness, SUMMARY_PATH + query, { session });
    assert.equal(summary.status, 200);
    assertPrivateNoStore(summary);
    const response = await responseJson(summary);
    assert.equal(response.creatorId, expectedId);
    assert.equal(response.period, period);
    assert.deepEqual(response.totals, totals);
    for (const field of ['page', 'daily', 'sources', 'links']) assert.ok(!Object.hasOwn(response, field), field);
  }

  for (const [query, session, status] of [
    ['', undefined, 401],
    [`?profileId=${first.id}`, 'admin', 400],
    ['?property=424203315', 'creator-a', 400],
    ['?periodo=7&periodo=30', 'creator-a', 400],
    ['?periodo=14', 'creator-a', 400],
    ['?pagina=1', 'creator-a', 400],
  ]) {
    const response = await callApi(harness, SUMMARY_PATH + query, { session });
    assert.equal(response.status, status, `${session ?? 'anonymous'} ${query}`);
    assertPrivateNoStore(response);
  }
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const rejectedWrite = await api(harness, SUMMARY_PATH, 'creator-a', { method, body: {} });
    assert.equal(rejectedWrite.status, 405);
    assertPrivateNoStore(rejectedWrite);
  }

  assert.deepEqual(statistics.summaryCalls, [
    { profileId: first.id, period: 30 },
    { profileId: profileB.id, period: 7 },
    { profileId: adminProfile.id, period: 7 },
  ]);
  assert.deepEqual(statistics.calls, [], 'summary never reads full detail');
});

test('summary skips provider work before publication and sanitizes errors after publication', async () => {
  const statistics = createStatisticsReader({ fail: true });
  const harness = await createCreatorPagesHarness({ statistics });
  const missing = await callApi(harness, SUMMARY_PATH, { session: 'creator-a' });
  assert.equal(missing.status, 200);
  assertPrivateNoStore(missing);
  assert.deepEqual(await responseJson(missing), { state: 'no-profile', period: 7 });

  const profile = await createProfile(harness, 'creator-a', { publish: false });
  const draft = await callApi(harness, `${SUMMARY_PATH}?periodo=30`, { session: 'creator-a' });
  assert.equal(draft.status, 200);
  assertPrivateNoStore(draft);
  assert.deepEqual(await responseJson(draft), { state: 'not-published', period: 30 });
  assert.deepEqual(statistics.summaryCalls, []);
  assert.deepEqual(statistics.calls, []);

  const snapshot = await ownerSnapshot(harness);
  const publication = await api(harness, '/api/creador/perfil/publicar', 'creator-a', {
    method: 'POST', body: { creatorVersion: snapshot.creatorVersion },
  });
  assert.equal(publication.status, 200);
  const unavailable = await callApi(harness, SUMMARY_PATH, { session: 'creator-a' });
  assert.equal(unavailable.status, 503);
  assertPrivateNoStore(unavailable);
  assert.doesNotMatch(await unavailable.text(), /private-account-a|service-account-key|internal GA response/);
  assert.deepEqual(statistics.summaryCalls, [{ profileId: profile.id, period: 7 }]);
  assert.deepEqual(statistics.calls, []);
});

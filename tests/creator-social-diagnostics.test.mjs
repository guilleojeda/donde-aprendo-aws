import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CREATOR_CONTRACT_VERSION, CREATOR_FIELD_LIMITS } from '../src/lib/creator-values.mjs';
import {
  callApi,
  createCreatorPagesHarness,
  responseJson,
  sessionCsrf,
} from './fixtures/creator-pages.mjs';

async function api(harness, path, session = 'creator-a', options = {}) {
  const creatorContract = Object.hasOwn(options, 'creatorContract')
    ? options.creatorContract
    : options.method === undefined || options.method === 'GET' ? undefined : CREATOR_CONTRACT_VERSION;
  return callApi(harness, path, {
    session,
    csrf: sessionCsrf[session],
    ...options,
    creatorContract,
  });
}

async function editor(harness, session = 'creator-a') {
  const response = await api(harness, '/api/creador/perfil', session);
  assert.equal(response.status, 200);
  return responseJson(response);
}

async function save(harness, fields, session = 'creator-a') {
  const current = await editor(harness, session);
  return api(harness, '/api/creador/perfil', session, {
    method: 'PUT',
    body: {
      creatorVersion: current.creatorVersion,
      ...fields,
    },
  });
}

async function createDraft(harness, fields = {}) {
  const response = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT',
    body: {
      creatorVersion: null,
      displayName: 'Ana de Redes',
      slug: 'ana-redes',
      socials: {
        instagram: 'https://instagram.example.invalid/guardada',
        website: 'https://example.invalid/guardada',
      },
      ...fields,
    },
  });
  assert.equal(response.status, 200, JSON.stringify(await responseJson(response)));
  return editor(harness);
}

test('social URL length rejection identifies the exact field and has no write effect', async () => {
  const harness = await createCreatorPagesHarness();
  await createDraft(harness);
  const before = await editor(harness);
  const oversized = `https://example.invalid/${'a'.repeat(CREATOR_FIELD_LIMITS.social)}`;
  const response = await save(harness, {
    socials: {
      website: oversized,
      instagram: 'https://instagram.example.invalid/cambio-no-guardado',
    },
  });
  assert.equal(response.status, 422);
  const body = await responseJson(response);
  assert.equal(body.error, 'FIELD_TOO_LONG');
  assert.deepEqual(body.fieldErrors, [{ field: 'socials.website', reason: 'too_long' }]);
  assert.equal(JSON.stringify(body).includes(oversized), false,
    'the diagnostic does not echo the submitted URL');
  assert.deepEqual(await editor(harness), before,
    'a definitive social validation rejection leaves every saved field and version unchanged');
});

test('invalid social URL rejection identifies the exact field while preserving the existing status and code', async () => {
  const harness = await createCreatorPagesHarness();
  await createDraft(harness);
  const before = await editor(harness);
  const secretUrl = 'https://user:secret@example.invalid/private';
  const response = await save(harness, {
    socials: {
      website: secretUrl,
      instagram: 'https://instagram.example.invalid/cambio-no-guardado',
    },
  });
  assert.equal(response.status, 422);
  const body = await responseJson(response);
  assert.equal(body.error, 'INVALID_SOCIAL_URL');
  assert.deepEqual(body.fieldErrors, [{ field: 'socials.website', reason: 'invalid_url' }]);
  assert.equal(JSON.stringify(body).includes(secretUrl), false,
    'the diagnostic does not echo credentials or the submitted URL');
  assert.deepEqual(await editor(harness), before,
    'an invalid social URL cannot partially update another social or identity field');
});

test('social diagnostics never expose an unknown literal field and malformed requests have no effect', async () => {
  const harness = await createCreatorPagesHarness();
  await createDraft(harness);
  const before = await editor(harness);
  const response = await api(harness, '/api/creador/perfil', 'creator-a', {
    method: 'PUT',
    body: {
      creatorVersion: before.creatorVersion,
      socials: { instagram: 'https://instagram.example.invalid/ok' },
      'socials.website': 'x'.repeat(CREATOR_FIELD_LIMITS.social + 1),
    },
  });
  assert.equal(response.status, 422);
  const body = await responseJson(response);
  assert.equal(body.error, 'FIELD_TOO_LONG');
  assert.equal(body.fieldErrors, undefined,
    'a literal key outside the profile operation is not attributed to a visible social field');
  assert.deepEqual(await editor(harness), before, 'an unrecognized diagnostic cannot cause a partial write');
});
